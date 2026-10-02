import { z } from "zod";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, securityOrAdminProcedure } from "../trpc";
import { bookingCheckIns, bookings } from "@/server/db/schema";
import type { DbClient } from "@/server/db";
import {
  allowedPeople,
  allowsExceptionEntry,
  checkInUrl,
  ensureAccessCode,
  getAccessState,
} from "@/server/services/access-control";

/**
 * Everything security needs to validate a booking at the door. Passengers are returned by
 * name only (no ID numbers): the QR screen is shown on a shared device at the access point.
 */
async function loadCheckInDetail(db: DbClient, where: { code: string } | { bookingId: string }) {
  const booking = await db.query.bookings.findFirst({
    where: "code" in where ? eq(bookings.accessCode, where.code) : eq(bookings.id, where.bookingId),
    columns: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      purpose: true,
      helicopterRegistration: true,
      pilotName: true,
      declaredPeople: true,
      membershipStatus: true,
    },
    with: {
      user: { columns: { firstName: true, lastName: true } },
      passengers: { columns: { id: true, name: true } },
      checkIns: {
        orderBy: (c, { asc }) => [asc(c.createdAt)],
        with: { checkedInByUser: { columns: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!booking) return null;

  const allowed = allowedPeople(booking.declaredPeople, booking.passengers.length);
  const entered = booking.checkIns.reduce((sum, c) => sum + c.people, 0);
  const state = getAccessState(booking, allowed, entered);

  return {
    ...booking,
    allowed,
    entered,
    remaining: Math.max(allowed - entered, 0),
    state,
    canEnter: state === "valid",
    canEnterAsException: allowsExceptionEntry(state),
  };
}

export const checkInRouter = createTRPCRouter({
  /**
   * Security: booking behind a scanned QR. Returns null for an unknown code.
   */
  getByCode: securityOrAdminProcedure
    .input(z.object({ code: z.string().min(1).max(64) }))
    .query(({ ctx, input }) => loadCheckInDetail(ctx.db, { code: input.code })),

  /**
   * Security: same detail by booking id, for the manual fallback (Art. 6.5: QR system down).
   */
  getByBookingId: securityOrAdminProcedure
    .input(z.object({ bookingId: z.string().uuid() }))
    .query(({ ctx, input }) => loadCheckInDetail(ctx.db, { bookingId: input.bookingId })),

  /**
   * Security: confirmed bookings in a range (today) with their access counts.
   */
  listForDay: securityOrAdminProcedure
    .input(z.object({ startDate: z.string().datetime(), endDate: z.string().datetime() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.query.bookings.findMany({
        where: and(
          inArray(bookings.status, ["confirmed"]),
          gte(bookings.startTime, new Date(input.startDate)),
          lte(bookings.startTime, new Date(input.endDate))
        ),
        orderBy: [asc(bookings.startTime)],
        columns: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          helicopterRegistration: true,
          pilotName: true,
          declaredPeople: true,
        },
        with: {
          user: { columns: { firstName: true, lastName: true } },
          passengers: { columns: { name: true } },
          checkIns: { columns: { people: true } },
        },
      });

      return rows.map(({ checkIns, ...booking }) => {
        const allowed = allowedPeople(booking.declaredPeople, booking.passengers.length);
        const entered = checkIns.reduce((sum, c) => sum + c.people, 0);
        return { ...booking, allowed, entered, state: getAccessState(booking, allowed, entered) };
      });
    }),

  /**
   * Security: register people entering. Outside the slot or beyond the declared people it is
   * still allowed, but recorded as an exception and requires a note.
   */
  register: securityOrAdminProcedure
    .input(
      z.object({
        bookingId: z.string().uuid(),
        people: z.number().int().min(1).max(99),
        note: z.string().max(500).optional(),
        isManual: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const detail = await loadCheckInDetail(ctx.db, { bookingId: input.bookingId });

      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reserva no encontrada." });
      }

      if (detail.state === "cancelled" || detail.state === "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            detail.state === "cancelled"
              ? "La reserva está cancelada: el QR no es válido."
              : "La reserva aún no está confirmada: el QR no es válido.",
        });
      }

      const isException = detail.state !== "valid" || input.people > detail.remaining;
      const note = input.note?.trim() || null;

      if (isException && !note) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Indique el motivo para registrar la entrada como excepción.",
        });
      }

      await ctx.db.insert(bookingCheckIns).values({
        bookingId: input.bookingId,
        people: input.people,
        isException,
        isManual: input.isManual,
        note,
        checkedInBy: ctx.session.user.id,
      });

      return loadCheckInDetail(ctx.db, { bookingId: input.bookingId });
    }),

  /**
   * Owner (or admin): the QR of a confirmed booking. Null while pending or once cancelled.
   */
  myAccessCode: protectedProcedure
    .input(z.object({ bookingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const booking = await ctx.db.query.bookings.findFirst({
        where: eq(bookings.id, input.bookingId),
        columns: { userId: true },
      });

      if (!booking) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      }

      const isStaff = ctx.session.user.role === "admin" || ctx.session.user.role === "security";
      if (!isStaff && booking.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      const code = await ensureAccessCode(input.bookingId, ctx.db);
      return code ? { code, url: checkInUrl(code) } : null;
    }),
});
