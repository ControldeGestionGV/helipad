import { z } from "zod";
import { createTRPCRouter, adminProcedure, securityOrAdminProcedure } from "../trpc";
import { unauthorizedOperations } from "@/server/db/schema";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { notifyUnauthorizedOperation } from "@/server/services/compliance-alerts";

// Reglamento Art. 24.3. Recorded by the staff at the helipad (security or admin); reviewed by an admin.
export const unauthorizedOperationsRouter = createTRPCRouter({
  list: securityOrAdminProcedure.query(async ({ ctx }) => {
    return ctx.db.query.unauthorizedOperations.findMany({
      orderBy: desc(unauthorizedOperations.occurredAt),
      with: {
        reportedByUser: { columns: { firstName: true, lastName: true } },
        reviewedByUser: { columns: { firstName: true, lastName: true } },
      },
    });
  }),

  create: securityOrAdminProcedure
    .input(
      z.object({
        occurredAt: z.string().datetime(),
        helicopterRegistration: z.string().trim().min(1).max(50),
        pilotName: z.string().trim().max(255).optional(),
        kind: z.enum(["no_booking", "outside_slot"]),
        isEmergency: z.boolean(),
        description: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const occurredAt = new Date(input.occurredAt);
      if (occurredAt > new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The operation cannot be in the future" });
      }

      const [created] = await ctx.db
        .insert(unauthorizedOperations)
        .values({
          occurredAt,
          helicopterRegistration: input.helicopterRegistration.toUpperCase(),
          pilotName: input.pilotName || null,
          kind: input.kind,
          isEmergency: input.isEmergency,
          description: input.description || null,
          reportedBy: ctx.session.user.id,
        })
        .returning();

      await notifyUnauthorizedOperation(created.id).catch((err) =>
        console.error("Failed to send unauthorized operation alert:", err)
      );

      return created;
    }),

  markReviewed: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(unauthorizedOperations)
        .set({ status: "reviewed", reviewedAt: new Date(), reviewedBy: ctx.session.user.id })
        .where(eq(unauthorizedOperations.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Operation not found" });
      }
      return updated;
    }),
});
