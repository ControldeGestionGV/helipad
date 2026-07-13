import { z } from "zod";
import { createTRPCRouter, adminProcedure, securityOrAdminProcedure } from "../trpc";
import { vips } from "@/server/db/schema";
import { eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { normalizeIdentification } from "@/server/services/membership";

const vipInputSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  identificationType: z.enum(["cedula", "passport", "other"]),
  identificationNumber: z.string().min(1).max(255),
  notes: z.string().max(500).optional(),
});

export const vipsRouter = createTRPCRouter({
  list: securityOrAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(10),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { search, isActive, page, limit, sortOrder } = input;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (search) {
        conditions.push(
          or(
            like(vips.firstName, `%${search}%`),
            like(vips.lastName, `%${search}%`),
            like(vips.identificationNumber, `%${search}%`)
          )
        );
      }
      if (isActive !== undefined) {
        conditions.push(eq(vips.isActive, isActive));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(vips)
        .where(whereClause);

      const orderFn = sortOrder === "desc" ? desc : asc;

      const vipsList = await ctx.db
        .select()
        .from(vips)
        .where(whereClause)
        .orderBy(orderFn(vips.createdAt))
        .limit(limit)
        .offset(offset);

      return {
        vips: vipsList,
        pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      };
    }),

  create: adminProcedure.input(vipInputSchema).mutation(async ({ ctx, input }) => {
    const [newVip] = await ctx.db
      .insert(vips)
      .values({
        ...input,
        identificationNumberNormalized: normalizeIdentification(input.identificationNumber),
      })
      .returning();

    return newVip;
  }),

  update: adminProcedure
    .input(vipInputSchema.partial().extend({ id: z.string().uuid(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, identificationNumber, ...rest } = input;

      const existing = await ctx.db.query.vips.findFirst({ where: eq(vips.id, id) });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "VIP not found" });
      }

      const [updated] = await ctx.db
        .update(vips)
        .set({
          ...rest,
          identificationNumber,
          identificationNumberNormalized: identificationNumber
            ? normalizeIdentification(identificationNumber)
            : undefined,
          updatedAt: new Date(),
        })
        .where(eq(vips.id, id))
        .returning();

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db.delete(vips).where(eq(vips.id, input.id)).returning({ id: vips.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "VIP not found" });
      }

      return { success: true };
    }),
});
