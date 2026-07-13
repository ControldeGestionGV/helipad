import { z } from "zod";
import { createTRPCRouter, adminProcedure, securityOrAdminProcedure } from "../trpc";
import { members, memberAircraft } from "@/server/db/schema";
import { eq, like, or, and, desc, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { normalizeIdentification } from "@/server/services/membership";

const memberInputSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  identificationType: z.enum(["cedula", "passport", "other"]),
  identificationNumber: z.string().min(1).max(255),
  membershipStartDate: z.string().datetime(),
  membershipEndDate: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

export const membersRouter = createTRPCRouter({
  list: securityOrAdminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(10),
        sortBy: z.enum(["createdAt", "firstName", "membershipEndDate"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { search, isActive, page, limit, sortBy, sortOrder } = input;
      const offset = (page - 1) * limit;

      const conditions = [];
      if (search) {
        conditions.push(
          or(
            like(members.firstName, `%${search}%`),
            like(members.lastName, `%${search}%`),
            like(members.identificationNumber, `%${search}%`)
          )
        );
      }
      if (isActive !== undefined) {
        conditions.push(eq(members.isActive, isActive));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(members)
        .where(whereClause);

      const orderFn = sortOrder === "desc" ? desc : asc;
      const orderColumn = members[sortBy];

      const membersList = await ctx.db
        .select()
        .from(members)
        .where(whereClause)
        .orderBy(orderFn(orderColumn))
        .limit(limit)
        .offset(offset);

      return {
        members: membersList,
        pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      };
    }),

  getById: securityOrAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.db.query.members.findFirst({
        where: eq(members.id, input.id),
        with: { aircraft: true },
      });

      if (!member) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      return member;
    }),

  create: adminProcedure.input(memberInputSchema).mutation(async ({ ctx, input }) => {
    const [newMember] = await ctx.db
      .insert(members)
      .values({
        firstName: input.firstName,
        lastName: input.lastName,
        identificationType: input.identificationType,
        identificationNumber: input.identificationNumber,
        identificationNumberNormalized: normalizeIdentification(input.identificationNumber),
        membershipStartDate: new Date(input.membershipStartDate),
        membershipEndDate: new Date(input.membershipEndDate),
        notes: input.notes,
      })
      .returning();

    return newMember;
  }),

  update: adminProcedure
    .input(memberInputSchema.partial().extend({ id: z.string().uuid(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, identificationNumber, membershipStartDate, membershipEndDate, ...rest } = input;

      const existing = await ctx.db.query.members.findFirst({ where: eq(members.id, id) });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      const [updated] = await ctx.db
        .update(members)
        .set({
          ...rest,
          identificationNumber,
          identificationNumberNormalized: identificationNumber
            ? normalizeIdentification(identificationNumber)
            : undefined,
          membershipStartDate: membershipStartDate ? new Date(membershipStartDate) : undefined,
          membershipEndDate: membershipEndDate ? new Date(membershipEndDate) : undefined,
          updatedAt: new Date(),
        })
        .where(eq(members.id, id))
        .returning();

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(members)
        .where(eq(members.id, input.id))
        .returning({ id: members.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      return { success: true };
    }),

  addAircraft: adminProcedure
    .input(z.object({ memberId: z.string().uuid(), registration: z.string().min(1).max(50), notes: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(memberAircraft).values(input).returning();
      return created;
    }),

  removeAircraft: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(memberAircraft).where(eq(memberAircraft.id, input.id));
      return { success: true };
    }),
});
