import { z } from "zod";
import { createTRPCRouter, adminProcedure, securityOrAdminProcedure } from "../trpc";
import { memberUsageAlerts } from "@/server/db/schema";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const usageAlertsRouter = createTRPCRouter({
  list: securityOrAdminProcedure
    .input(z.object({ status: z.enum(["open", "acknowledged"]).optional() }))
    .query(async ({ ctx, input }) => {
      const alerts = await ctx.db.query.memberUsageAlerts.findMany({
        where: input.status ? eq(memberUsageAlerts.status, input.status) : undefined,
        orderBy: desc(memberUsageAlerts.createdAt),
        with: {
          member: { columns: { firstName: true, lastName: true, memberCode: true } },
          acknowledgedByUser: { columns: { firstName: true, lastName: true } },
        },
      });

      return alerts;
    }),

  acknowledge: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(memberUsageAlerts)
        .set({
          status: "acknowledged",
          acknowledgedAt: new Date(),
          acknowledgedBy: ctx.session.user.id,
        })
        .where(eq(memberUsageAlerts.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      }

      return updated;
    }),
});
