import { z } from "zod";
import { format } from "date-fns";
import { createTRPCRouter, protectedProcedure, adminProcedure, securityOrAdminProcedure } from "../trpc";
import { bookings, users, passengers } from "@/server/db/schema";
import { eq, and, gte, lte, lt, gt, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { broadcastBookingCreated, broadcastBookingCancelled } from "@/server/services/sse";
import {
  sendBookingConfirmation,
  sendBookingCancellation,
  sendPendingBookingApprovalEmail,
  getApprovalRecipients,
} from "@/server/services/email";
import { createApprovalToken } from "@/lib/approval-tokens";
import { checkMembershipForPassengers } from "@/server/services/membership";
import { checkAndTriggerMisuseAlert } from "@/server/services/misuse-alerts";

const passengerInputSchema = z.object({
  id: z.string().optional(), // For existing passengers
  name: z.string().min(1).max(255),
  identificationType: z.enum(["cedula", "passport", "other"]),
  identificationNumber: z.string().min(1).max(255),
  idPhotoBase64: z.string().optional(),
});

export const bookingsRouter = createTRPCRouter({
  /**
   * Get bookings for a date range (calendar view)
   */
  getByDateRange: protectedProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const isAdminOrSecurity = ctx.session.user.role === "admin" || ctx.session.user.role === "security";

      // Get confirmed bookings (visible to all users)
      const confirmedBookings = await ctx.db
        .select({
          id: bookings.id,
          userId: bookings.userId,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
          purpose: bookings.purpose,
          notes: bookings.notes,
          contactPhone: bookings.contactPhone,
          helicopterRegistration: bookings.helicopterRegistration,
          status: bookings.status,
          membershipStatus: bookings.membershipStatus,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .where(
          and(
            eq(bookings.status, "confirmed"),
            gte(bookings.startTime, start),
            lte(bookings.endTime, end)
          )
        )
        .orderBy(bookings.startTime);

      // Get pending bookings based on role
      // Admins and security see all pending bookings, regular users only see their own
      const pendingBookingsWhere = isAdminOrSecurity
        ? and(
            eq(bookings.status, "pending"),
            gte(bookings.startTime, start),
            lte(bookings.endTime, end)
          )
        : and(
            eq(bookings.status, "pending"),
            eq(bookings.userId, ctx.session.user.id),
            gte(bookings.startTime, start),
            lte(bookings.endTime, end)
          );

      const pendingBookings = await ctx.db
        .select({
          id: bookings.id,
          userId: bookings.userId,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
          purpose: bookings.purpose,
          notes: bookings.notes,
          contactPhone: bookings.contactPhone,
          helicopterRegistration: bookings.helicopterRegistration,
          status: bookings.status,
          membershipStatus: bookings.membershipStatus,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .where(pendingBookingsWhere)
        .orderBy(bookings.startTime);

      // Combine and return all bookings
      return [...confirmedBookings, ...pendingBookings].sort((a, b) => 
        a.startTime.getTime() - b.startTime.getTime()
      );
    }),

  /**
   * Get user's own bookings
   */
  getMyBookings: protectedProcedure
    .input(
      z.object({
        upcoming: z.boolean().default(true),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const { upcoming, page, limit } = input;
      const offset = (page - 1) * limit;
      const now = new Date();

      const whereClause = and(
        eq(bookings.userId, ctx.session.user.id),
        upcoming
          ? and(gte(bookings.endTime, now), sql`${bookings.status} IN ('confirmed', 'pending')`)
          : lt(bookings.endTime, now)
      );

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(whereClause);

      const bookingsList = await ctx.db
        .select()
        .from(bookings)
        .where(whereClause)
        .orderBy(upcoming ? bookings.startTime : desc(bookings.startTime))
        .limit(limit)
        .offset(offset);

      return {
        bookings: bookingsList,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    }),

  /**
   * Get single booking by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const booking = await ctx.db.query.bookings.findFirst({
        where: eq(bookings.id, input.id),
        with: {
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!booking) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }

      // Allow viewing if admin, security, or own booking
      const isAdminOrSecurity = ctx.session.user.role === "admin" || ctx.session.user.role === "security";
      if (!isAdminOrSecurity && booking.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      return booking;
    }),

  /**
   * Create a new booking
   */
  create: protectedProcedure
    .input(
      z.object({
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        purpose: z.string().min(1).max(500),
        notes: z.string().max(1000).optional(),
        contactPhone: z.string().max(20).optional(),
        helicopterRegistration: z.string().min(1, "Helicopter registration is required").max(50),
        passengers: z.array(passengerInputSchema).min(1, "At least one passenger is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const start = new Date(input.startTime);
      const end = new Date(input.endTime);

      // Validate time range
      if (start >= end) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End time must be after start time",
        });
      }

      // Block bookings in the past, including earlier times on the same day.
      if (start <= new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot book time slots in the past",
        });
      }

      // Check for conflicts (including 5-minute buffer after each booking)
      const BUFFER_MINUTES = 5;
      const endWithBuffer = new Date(end.getTime() + BUFFER_MINUTES * 60 * 1000);
      
      const conflicts = await ctx.db
        .select({ 
          id: bookings.id,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "confirmed"),
            // Check if new booking (with its buffer) overlaps with existing booking (with its buffer)
            lt(bookings.startTime, endWithBuffer),
            gt(sql`datetime(${bookings.endTime}, '+5 minutes')`, start)
          )
        );

      if (conflicts.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This time slot conflicts with an existing booking (including 5-minute buffer)",
        });
      }

      // A booking auto-confirms if the creator is admin, OR if a member/VIP is aboard.
      // Otherwise it requires special admin approval (no titular aboard).
      const isAdmin = ctx.session.user.role === "admin";
      const membershipStatus = await checkMembershipForPassengers(input.passengers);
      const bookingStatus = isAdmin || membershipStatus !== "none" ? "confirmed" : "pending";

      const [newBooking] = await ctx.db
        .insert(bookings)
        .values({
          userId: ctx.session.user.id,
          startTime: start,
          endTime: end,
          purpose: input.purpose,
          notes: input.notes,
          contactPhone: input.contactPhone,
          helicopterRegistration: input.helicopterRegistration,
          status: bookingStatus,
          membershipStatus,
        })
        .returning();

      // Insert passengers for this booking
      if (input.passengers && input.passengers.length > 0) {
        await ctx.db.insert(passengers).values(
          input.passengers.map((passenger) => ({
            bookingId: newBooking.id,
            name: passenger.name,
            identificationType: passenger.identificationType,
            identificationNumber: passenger.identificationNumber,
            idPhotoBase64: passenger.idPhotoBase64,
          }))
        );
      }

      // Broadcast SSE event for real-time calendar updates
      // Admins will see pending bookings, regular users only see confirmed ones
      broadcastBookingCreated({
        id: newBooking.id,
        userId: newBooking.userId,
        startTime: start,
        endTime: end,
      });

      if (bookingStatus === "confirmed" && membershipStatus === "none" && input.helicopterRegistration) {
        await checkAndTriggerMisuseAlert(input.helicopterRegistration).catch((err) =>
          console.error("Failed to check misuse alert:", err)
        );
      }

      // Send confirmation email ONLY if the booking is confirmed (not pending)
      // If it's pending, the email will be sent when admin approves it
      if (bookingStatus === "confirmed") {
        sendBookingConfirmation({
          userName: `${ctx.session.user.firstName} ${ctx.session.user.lastName}`,
          userEmail: ctx.session.user.email ?? "",
          userId: ctx.session.user.id,
          bookingId: newBooking.id,
          date: format(start, "EEEE, MMMM d, yyyy"),
          startTime: format(start, "h:mm a"),
          endTime: format(end, "h:mm a"),
          purpose: input.purpose,
          locale: "es", // Default to Spanish, can be made dynamic later
        }).catch((err) => console.error("Failed to send confirmation email:", err));
      } else {
        const recipients = await getApprovalRecipients();

        if (recipients.length > 0) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

          const approveToken = await createApprovalToken({
            bookingId: newBooking.id,
            action: "approve",
          });
          const rejectToken = await createApprovalToken({
            bookingId: newBooking.id,
            action: "reject",
          });

          const approveUrl = `${appUrl}/api/bookings/approval/approve?token=${encodeURIComponent(approveToken)}`;
          const rejectUrl = `${appUrl}/api/bookings/approval/reject?token=${encodeURIComponent(rejectToken)}`;

          Promise.all(
            recipients.map((adminEmail) =>
              sendPendingBookingApprovalEmail({
                adminEmail,
                userName: `${ctx.session.user.firstName} ${ctx.session.user.lastName}`,
                userEmail: ctx.session.user.email ?? "",
                userId: ctx.session.user.id,
                bookingId: newBooking.id,
                date: format(start, "EEEE, MMMM d, yyyy"),
                startTime: format(start, "h:mm a"),
                endTime: format(end, "h:mm a"),
                purpose: input.purpose,
                contactPhone: input.contactPhone,
                helicopterRegistration: input.helicopterRegistration,
                passengers: input.passengers.map((passenger) => ({
                  name: passenger.name,
                  identificationType: passenger.identificationType,
                  identificationNumber: passenger.identificationNumber,
                })),
                approveUrl,
                rejectUrl,
                appUrl: `${appUrl}/admin/bookings`,
                locale: "es",
              })
            )
          ).catch((err) => console.error("Failed to send approval emails:", err));
        }
      }

      return newBooking;
    }),

  /**
   * Update own booking
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        startTime: z.string().datetime().optional(),
        endTime: z.string().datetime().optional(),
        purpose: z.string().min(1).max(500).optional(),
        notes: z.string().max(1000).optional(),
        contactPhone: z.string().max(20).optional(),
        helicopterRegistration: z.string().min(1).max(50).optional(),
        passengers: z.array(passengerInputSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, passengers: passengerUpdates, ...updateData } = input;

      const existing = await ctx.db.query.bookings.findFirst({
        where: eq(bookings.id, id),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }

      // Only owner can update (unless admin)
      if (ctx.session.user.role !== "admin" && existing.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Non-admin users cannot modify confirmed bookings (only pending ones)
      if (ctx.session.user.role !== "admin" && existing.status === "confirmed") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot modify confirmed bookings. Only pending bookings can be edited.",
        });
      }

      // Non-admin users cannot modify cancelled bookings
      if (ctx.session.user.role !== "admin" && existing.status === "cancelled") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot modify cancelled bookings.",
        });
      }

      // Check if booking is in the past (admins can still modify for corrections)
      if (ctx.session.user.role !== "admin" && existing.startTime < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot modify past bookings",
        });
      }

      // If times are being updated, check for conflicts
      if (updateData.startTime || updateData.endTime) {
        const start = updateData.startTime ? new Date(updateData.startTime) : existing.startTime;
        const end = updateData.endTime ? new Date(updateData.endTime) : existing.endTime;

        if (start >= end) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "End time must be after start time",
          });
        }

        if (ctx.session.user.role !== "admin" && start <= new Date()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot book time slots in the past",
          });
        }

        // Check for conflicts (including 5-minute buffer)
        const BUFFER_MINUTES = 5;
        const endWithBuffer = new Date(end.getTime() + BUFFER_MINUTES * 60 * 1000);

        const conflicts = await ctx.db
          .select({ 
            id: bookings.id,
            startTime: bookings.startTime,
            endTime: bookings.endTime,
          })
          .from(bookings)
          .where(
            and(
              inArray(bookings.status, ["confirmed", "pending"]),
              sql`${bookings.id} != ${id}`,
              lt(bookings.startTime, endWithBuffer),
              gt(sql`datetime(${bookings.endTime}, '+5 minutes')`, start)
            )
          );

        if (conflicts.length > 0) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This time slot conflicts with an existing booking (including 5-minute buffer)",
          });
        }
      }

      // Update passengers if provided
      if (passengerUpdates) {
        // Get existing passengers
        const existingPassengers = await ctx.db.query.passengers.findMany({
          where: eq(passengers.bookingId, id),
        });

        // Determine which passengers to delete, update, and create
        const existingIds = existingPassengers.map((p) => p.id);
        const updatedIds = passengerUpdates.filter((p) => p.id).map((p) => p.id!);
        const idsToDelete = existingIds.filter((id) => !updatedIds.includes(id));

        // Delete removed passengers
        if (idsToDelete.length > 0) {
          await ctx.db.delete(passengers).where(
            sql`${passengers.id} IN (${sql.join(idsToDelete.map((id) => sql`${id}`), sql`, `)})`
          );
        }

        // Update existing passengers and create new ones
        for (const passenger of passengerUpdates) {
          if (passenger.id) {
            // Update existing passenger
            await ctx.db
              .update(passengers)
              .set({
                name: passenger.name,
                identificationType: passenger.identificationType,
                identificationNumber: passenger.identificationNumber,
                idPhotoBase64: passenger.idPhotoBase64,
                updatedAt: new Date(),
              })
              .where(eq(passengers.id, passenger.id));
          } else {
            // Create new passenger
            await ctx.db.insert(passengers).values({
              bookingId: id,
              name: passenger.name,
              identificationType: passenger.identificationType,
              identificationNumber: passenger.identificationNumber,
              idPhotoBase64: passenger.idPhotoBase64,
            });
          }
        }
      }

      // Recompute membership status if the passenger list changed
      const membershipStatus = passengerUpdates
        ? await checkMembershipForPassengers(passengerUpdates)
        : undefined;

      const [updated] = await ctx.db
        .update(bookings)
        .set({
          ...updateData,
          startTime: updateData.startTime ? new Date(updateData.startTime) : undefined,
          endTime: updateData.endTime ? new Date(updateData.endTime) : undefined,
          membershipStatus,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, id))
        .returning();

      if (
        updated.status === "confirmed" &&
        updated.membershipStatus === "none" &&
        updated.helicopterRegistration
      ) {
        await checkAndTriggerMisuseAlert(updated.helicopterRegistration).catch((err) =>
          console.error("Failed to check misuse alert:", err)
        );
      }

      return updated;
    }),

  /**
   * Cancel own booking
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: eq(bookings.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }

      // Only owner can cancel (unless admin)
      if (ctx.session.user.role !== "admin" && existing.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Check if already cancelled
      if (existing.status === "cancelled") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Booking is already cancelled",
        });
      }

      // Get user info for email
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, existing.userId),
        columns: { firstName: true, lastName: true, email: true },
      });

      const [cancelled] = await ctx.db
        .update(bookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledBy: ctx.session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.id))
        .returning();

      // Broadcast SSE event for real-time updates
      broadcastBookingCancelled({
        id: cancelled.id,
        userId: cancelled.userId,
        startTime: existing.startTime,
        endTime: existing.endTime,
      });

      // Send cancellation email (async, don't block response)
      if (user?.email) {
        sendBookingCancellation({
          userName: `${user.firstName} ${user.lastName}`,
          userEmail: user.email,
          userId: existing.userId,
          bookingId: cancelled.id,
          date: format(existing.startTime, "EEEE, MMMM d, yyyy"),
          startTime: format(existing.startTime, "h:mm a"),
          endTime: format(existing.endTime, "h:mm a"),
          purpose: existing.purpose,
          locale: "es", // Default to Spanish, can be made dynamic later
        }).catch((err) => console.error("Failed to send cancellation email:", err));
      }

      return cancelled;
    }),

  /**
   * Admin: List all bookings with filters
   */
  listAll: securityOrAdminProcedure
    .input(
      z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        userId: z.string().uuid().optional(),
        status: z.enum(["pending", "confirmed", "cancelled"]).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { startDate, endDate, userId, status, page, limit } = input;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (startDate) {
        conditions.push(gte(bookings.startTime, new Date(startDate)));
      }
      if (endDate) {
        conditions.push(lte(bookings.endTime, new Date(endDate)));
      }
      if (userId) {
        conditions.push(eq(bookings.userId, userId));
      }
      if (status) {
        conditions.push(eq(bookings.status, status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(whereClause);

      const bookingsList = await ctx.db
        .select({
          id: bookings.id,
          userId: bookings.userId,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
          purpose: bookings.purpose,
          notes: bookings.notes,
          contactPhone: bookings.contactPhone,
          passengers: bookings.passengers,
          helicopterRegistration: bookings.helicopterRegistration,
          status: bookings.status,
          membershipStatus: bookings.membershipStatus,
          createdAt: bookings.createdAt,
          cancelledAt: bookings.cancelledAt,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
        })
        .from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .where(whereClause)
        .orderBy(desc(bookings.startTime))
        .limit(limit)
        .offset(offset);

      return {
        bookings: bookingsList,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    }),

  /**
   * Admin: Approve a pending booking
   */
  approve: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: eq(bookings.id, input.id),
        with: {
          user: {
            columns: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }

      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending bookings can be approved",
        });
      }

      // Check for conflicts again before approving (including 5-minute buffer)
      const BUFFER_MINUTES = 5;
      const endWithBuffer = new Date(existing.endTime.getTime() + BUFFER_MINUTES * 60 * 1000);
      
      const conflicts = await ctx.db
        .select({ 
          id: bookings.id,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
        })
        .from(bookings)
        .where(
          and(
            inArray(bookings.status, ["confirmed", "pending"]),
            sql`${bookings.id} != ${input.id}`,
            lt(bookings.startTime, endWithBuffer),
            gt(sql`datetime(${bookings.endTime}, '+5 minutes')`, existing.startTime)
          )
        );

      if (conflicts.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This time slot now conflicts with an existing booking (including 5-minute buffer)",
        });
      }

      const [approved] = await ctx.db
        .update(bookings)
        .set({
          status: "confirmed",
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, input.id), eq(bookings.status, "pending")))
        .returning();

      if (!approved) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This booking was already processed by someone else",
        });
      }

      // Broadcast SSE event for real-time calendar updates
      broadcastBookingCreated({
        id: approved.id,
        userId: approved.userId,
        startTime: existing.startTime,
        endTime: existing.endTime,
      });

      if (approved.membershipStatus === "none" && approved.helicopterRegistration) {
        await checkAndTriggerMisuseAlert(approved.helicopterRegistration).catch((err) =>
          console.error("Failed to check misuse alert:", err)
        );
      }

      // Send confirmation email
      if (existing.user?.email) {
        sendBookingConfirmation({
          userName: `${existing.user.firstName} ${existing.user.lastName}`,
          userEmail: existing.user.email,
          userId: existing.userId,
          bookingId: approved.id,
          date: format(existing.startTime, "EEEE, MMMM d, yyyy"),
          startTime: format(existing.startTime, "h:mm a"),
          endTime: format(existing.endTime, "h:mm a"),
          purpose: existing.purpose,
          locale: "es", // Default to Spanish, can be made dynamic later
        }).catch((err) => console.error("Failed to send confirmation email:", err));
      }

      return approved;
    }),

  /**
   * Admin: Reject a pending booking
   */
  reject: adminProcedure
    .input(z.object({ 
      id: z.string().uuid(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.bookings.findFirst({
        where: eq(bookings.id, input.id),
        with: {
          user: {
            columns: {
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }

      if (existing.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending bookings can be rejected",
        });
      }

      const [rejected] = await ctx.db
        .update(bookings)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledBy: ctx.session.user.id,
          updatedAt: new Date(),
        })
        .where(and(eq(bookings.id, input.id), eq(bookings.status, "pending")))
        .returning();

      if (!rejected) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This booking was already processed by someone else",
        });
      }

      // Broadcast SSE event for real-time updates (removes pending booking from non-owner calendars)
      broadcastBookingCancelled({
        id: rejected.id,
        userId: rejected.userId,
        startTime: existing.startTime,
        endTime: existing.endTime,
      });

      // Send rejection email (using cancellation template for now)
      if (existing.user?.email) {
        sendBookingCancellation({
          userName: `${existing.user.firstName} ${existing.user.lastName}`,
          userEmail: existing.user.email,
          userId: existing.userId,
          bookingId: rejected.id,
          date: format(existing.startTime, "EEEE, MMMM d, yyyy"),
          startTime: format(existing.startTime, "h:mm a"),
          endTime: format(existing.endTime, "h:mm a"),
          purpose: existing.purpose,
          locale: "es", // Default to Spanish, can be made dynamic later
        }).catch((err) => console.error("Failed to send rejection email:", err));
      }

      return rejected;
    }),

  /**
   * Admin: Get all pending bookings
   */
  getPending: securityOrAdminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit } = input;
      const offset = (page - 1) * limit;

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(eq(bookings.status, "pending"));

      const pendingBookings = await ctx.db
        .select({
          id: bookings.id,
          userId: bookings.userId,
          startTime: bookings.startTime,
          endTime: bookings.endTime,
          purpose: bookings.purpose,
          notes: bookings.notes,
          contactPhone: bookings.contactPhone,
          status: bookings.status,
          membershipStatus: bookings.membershipStatus,
          createdAt: bookings.createdAt,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
          },
        })
        .from(bookings)
        .leftJoin(users, eq(bookings.userId, users.id))
        .where(eq(bookings.status, "pending"))
        .orderBy(bookings.createdAt)
        .limit(limit)
        .offset(offset);

      return {
        bookings: pendingBookings,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    }),
});
