import { z } from "zod";
import { createTRPCRouter, adminProcedure, securityOrAdminProcedure } from "../trpc";
import { members, memberAircraft } from "@/server/db/schema";
import { eq, like, or, and, desc, asc, sql, isNull, inArray } from "drizzle-orm";
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
  // Titular's code, entered by hand from the contract (e.g. "8814"). Only titulares are
  // created through `create` - sub-members go through `addSubMember`, which derives theirs.
  memberCode: z.string().min(1, "Member code is required").max(50),
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

      // Only titulares are listed here; sub-members are fetched via getById's `subMembers`.
      const conditions = [];
      conditions.push(isNull(members.parentMemberId));
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

      const memberIds = membersList.map((m) => m.id);
      const subCounts =
        memberIds.length > 0
          ? await ctx.db
              .select({ parentMemberId: members.parentMemberId, count: sql<number>`count(*)` })
              .from(members)
              .where(inArray(members.parentMemberId, memberIds))
              .groupBy(members.parentMemberId)
          : [];
      const subCountMap = new Map(subCounts.map((c) => [c.parentMemberId, c.count]));

      return {
        members: membersList.map((m) => ({ ...m, subMemberCount: subCountMap.get(m.id) ?? 0 })),
        pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      };
    }),

  getById: securityOrAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const member = await ctx.db.query.members.findFirst({
        where: eq(members.id, input.id),
        with: {
          aircraft: true,
          subMembers: { orderBy: asc(members.createdAt) },
        },
      });

      if (!member) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      return member;
    }),

  create: adminProcedure.input(memberInputSchema).mutation(async ({ ctx, input }) => {
    const existingCode = await ctx.db.query.members.findFirst({
      where: eq(members.memberCode, input.memberCode),
    });
    if (existingCode) {
      throw new TRPCError({ code: "CONFLICT", message: "This member code is already in use" });
    }

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
        memberCode: input.memberCode,
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

      if (rest.memberCode && rest.memberCode !== existing.memberCode) {
        const existingCode = await ctx.db.query.members.findFirst({
          where: eq(members.memberCode, rest.memberCode),
        });
        if (existingCode) {
          throw new TRPCError({ code: "CONFLICT", message: "This member code is already in use" });
        }
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
      const existing = await ctx.db.query.members.findFirst({ where: eq(members.id, input.id) });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      // Sub-members are never hard-deleted: their derived code (e.g. "8814-B") is assigned
      // by counting siblings ever created under the titular, so removing the row would let a
      // future sub-member reuse that letter for a different person. Deactivate instead.
      if (existing.parentMemberId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Sub-members can't be deleted, only deactivated",
        });
      }

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

  /**
   * Add a sub-member (family/business group) under a titular. Inherits the titular's
   * membership dates at creation time (not dynamically linked - renewing the titular
   * later requires updating each sub-member separately, a known limitation). The code
   * is derived from the titular's code plus the next letter, counted over ALL sub-members
   * ever created (active and inactive) so a deactivated one never has its letter reused.
   */
  addSubMember: adminProcedure
    .input(
      z.object({
        parentMemberId: z.string().uuid(),
        firstName: z.string().min(1).max(50),
        lastName: z.string().min(1).max(50),
        identificationType: z.enum(["cedula", "passport", "other"]),
        identificationNumber: z.string().min(1).max(255),
        notes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parent = await ctx.db.query.members.findFirst({
        where: eq(members.id, input.parentMemberId),
      });

      if (!parent) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Titular not found" });
      }

      if (parent.parentMemberId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A sub-member cannot have sub-members of their own",
        });
      }

      if (!parent.memberCode) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The titular needs a member code before adding sub-members",
        });
      }

      const [{ count: subCount }] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(members)
        .where(eq(members.parentMemberId, parent.id));

      const nextLetter = String.fromCharCode(65 + subCount);
      const memberCode = `${parent.memberCode}-${nextLetter}`;

      const [created] = await ctx.db
        .insert(members)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          identificationType: input.identificationType,
          identificationNumber: input.identificationNumber,
          identificationNumberNormalized: normalizeIdentification(input.identificationNumber),
          membershipStartDate: parent.membershipStartDate,
          membershipEndDate: parent.membershipEndDate,
          notes: input.notes,
          memberCode,
          parentMemberId: parent.id,
        })
        .returning();

      return created;
    }),
});
