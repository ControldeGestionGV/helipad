import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { members, vips } from "@/server/db/schema";

export function normalizeIdentification(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

export type MembershipStatus = "member" | "vip" | "none";

export async function checkMembershipForPassengers(
  passengers: Array<{ identificationNumber: string }>
): Promise<MembershipStatus> {
  if (passengers.length === 0) {
    return "none";
  }

  const normalizedIds = passengers.map((p) => normalizeIdentification(p.identificationNumber));
  const now = new Date();

  const matchedVip = await db.query.vips.findFirst({
    where: and(
      inArray(vips.identificationNumberNormalized, normalizedIds),
      eq(vips.isActive, true)
    ),
  });

  if (matchedVip) {
    return "vip";
  }

  const matchedMember = await db.query.members.findFirst({
    where: and(
      inArray(members.identificationNumberNormalized, normalizedIds),
      eq(members.isActive, true),
      lte(members.membershipStartDate, now),
      gte(members.membershipEndDate, now)
    ),
  });

  return matchedMember ? "member" : "none";
}
