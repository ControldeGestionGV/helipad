import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, members, memberUsageAlerts, passengers, settings as settingsTable } from "@/server/db/schema";
import type { Member } from "@/server/db/schema";
import { defaultSettings } from "@/server/api/routers/settings";
import { normalizeIdentification } from "@/server/services/membership";
import { sendUsageOverageEmail } from "@/server/services/email";

async function getMembershipUsageSettings() {
  const setting = await db.query.settings.findFirst({
    where: eq(settingsTable.key, "membershipUsage"),
  });

  if (!setting) {
    return defaultSettings.membershipUsage;
  }

  try {
    return { ...defaultSettings.membershipUsage, ...JSON.parse(setting.value) };
  } catch {
    return defaultSettings.membershipUsage;
  }
}

/**
 * Distinct confirmed bookings within [start, end] with at least one of these people aboard.
 * A booking counts once even if several of them fly together: one landing + takeoff cycle is
 * one Operacion Computable (Contrato, Clausula Primera). passengers.identificationNumber isn't
 * normalized at the column level, so matching happens in JS (same as checkMembershipForPassengers).
 */
async function countConfirmedBookingsWithAny(
  normalizedIds: string[],
  periodStart: Date,
  periodEnd: Date
): Promise<number> {
  if (normalizedIds.length === 0) return 0;
  const ids = new Set(normalizedIds);

  const rows = await db
    .select({ identificationNumber: passengers.identificationNumber, bookingId: passengers.bookingId })
    .from(passengers)
    .innerJoin(bookings, eq(passengers.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.startTime, periodStart),
        lte(bookings.startTime, periodEnd)
      )
    );

  return new Set(
    rows.filter((r) => ids.has(normalizeIdentification(r.identificationNumber))).map((r) => r.bookingId)
  ).size;
}

/**
 * Usage of a whole membership: the titular plus every sub-member (active or not - flights
 * already taken still count), within the titular's membership period.
 */
export async function getMembershipUsage(titularId: string) {
  const titular = await db.query.members.findFirst({ where: eq(members.id, titularId) });
  if (!titular) return null;

  const group = await db.query.members.findMany({
    where: or(eq(members.id, titular.id), eq(members.parentMemberId, titular.id)),
  });
  const { annualUsageLimit: globalLimit } = await getMembershipUsageSettings();

  const membershipUsed = await countConfirmedBookingsWithAny(
    group.map((m) => m.identificationNumberNormalized),
    titular.membershipStartDate,
    titular.membershipEndDate
  );

  const perMember = await Promise.all(
    group.map(async (m) => ({
      memberId: m.id,
      used: await countConfirmedBookingsWithAny(
        [m.identificationNumberNormalized],
        titular.membershipStartDate,
        titular.membershipEndDate
      ),
      // Only sub-members have an individual cap; the titular's limit is the family's
      limit: m.parentMemberId ? m.annualUsageLimit : null,
    }))
  );

  return {
    used: membershipUsed,
    limit: titular.annualUsageLimit ?? globalLimit,
    isCustomLimit: titular.annualUsageLimit !== null,
    globalLimit,
    perMember,
  };
}

async function raiseOrUpdateAlert(params: {
  member: Member;
  scope: "membership" | "individual";
  usageCount: number;
  usageLimit: number;
  periodStart: Date;
  periodEnd: Date;
  overageAmount: number;
  displayName: string;
}) {
  const { member, scope, usageCount, usageLimit, periodStart, periodEnd } = params;

  // Scoped to the current period: after a renewal periodEnd no longer matches and a fresh
  // alert is created instead of reusing a stale one.
  const existingOpenAlert = await db.query.memberUsageAlerts.findFirst({
    where: and(
      eq(memberUsageAlerts.memberId, member.id),
      eq(memberUsageAlerts.scope, scope),
      eq(memberUsageAlerts.status, "open"),
      eq(memberUsageAlerts.periodEnd, periodEnd)
    ),
  });

  if (existingOpenAlert) {
    await db
      .update(memberUsageAlerts)
      .set({ usageCount, usageLimit })
      .where(eq(memberUsageAlerts.id, existingOpenAlert.id));
    return;
  }

  await db.insert(memberUsageAlerts).values({
    memberId: member.id,
    scope,
    usageCount,
    usageLimit,
    periodStart,
    periodEnd,
    status: "open",
  });

  await sendUsageOverageEmail({
    memberName: params.displayName,
    memberCode: member.memberCode,
    usageCount,
    annualUsageLimit: usageLimit,
    overageAmount: params.overageAmount,
    periodStart,
    periodEnd,
  }).catch((err) => console.error("Failed to send usage overage email:", err));
}

/**
 * Checks the quotas of every membership with someone aboard this booking, and opens/updates
 * an alert when exceeded:
 * - Membership quota (titular.annualUsageLimit, or the global setting): shared by the titular
 *   and all sub-members. Alert on the titular, scope "membership".
 * - Individual cap (sub-member.annualUsageLimit, optional): alert on the sub-member, scope
 *   "individual". Their flights still count toward the family quota.
 * Self-contained and independent of the aggregate membershipStatus ("member" | "vip" | "none"),
 * so it still catches a member sharing a flight with a VIP. Coexists with misuse-alerts.ts
 * (opposite case: freeloaders with no member/VIP aboard).
 */
export async function checkAndTriggerUsageOverage(
  passengerInputs: Array<{ identificationNumber: string }>
): Promise<void> {
  if (!passengerInputs || passengerInputs.length === 0) {
    return;
  }

  const normalizedIds = passengerInputs.map((p) => normalizeIdentification(p.identificationNumber));
  const now = new Date();

  const matchedMembers = await db.query.members.findMany({
    where: and(
      inArray(members.identificationNumberNormalized, normalizedIds),
      eq(members.isActive, true),
      lte(members.membershipStartDate, now),
      gte(members.membershipEndDate, now)
    ),
  });

  if (matchedMembers.length === 0) {
    return;
  }

  const { annualUsageLimit: globalLimit, overageAmount } = await getMembershipUsageSettings();

  // One check per membership, even if several of its members are aboard
  const titularIds = [...new Set(matchedMembers.map((m) => m.parentMemberId ?? m.id))];

  for (const titularId of titularIds) {
    const titular = await db.query.members.findFirst({ where: eq(members.id, titularId) });
    if (!titular) continue;

    const group = await db.query.members.findMany({
      where: or(eq(members.id, titular.id), eq(members.parentMemberId, titular.id)),
    });
    const groupLimit = titular.annualUsageLimit ?? globalLimit;
    const groupUsed = await countConfirmedBookingsWithAny(
      group.map((m) => m.identificationNumberNormalized),
      titular.membershipStartDate,
      titular.membershipEndDate
    );

    if (groupUsed > groupLimit) {
      const hasSubMembers = group.length > 1;
      await raiseOrUpdateAlert({
        member: titular,
        scope: "membership",
        usageCount: groupUsed,
        usageLimit: groupLimit,
        periodStart: titular.membershipStartDate,
        periodEnd: titular.membershipEndDate,
        overageAmount,
        displayName: `${titular.firstName} ${titular.lastName}${hasSubMembers ? " (membresía familiar)" : ""}`,
      });
    }
  }

  // Individual caps of the sub-members aboard
  for (const member of matchedMembers) {
    if (!member.parentMemberId || member.annualUsageLimit === null) continue;

    const titular = await db.query.members.findFirst({ where: eq(members.id, member.parentMemberId) });
    if (!titular) continue;

    const used = await countConfirmedBookingsWithAny(
      [member.identificationNumberNormalized],
      titular.membershipStartDate,
      titular.membershipEndDate
    );

    if (used > member.annualUsageLimit) {
      await raiseOrUpdateAlert({
        member,
        scope: "individual",
        usageCount: used,
        usageLimit: member.annualUsageLimit,
        periodStart: titular.membershipStartDate,
        periodEnd: titular.membershipEndDate,
        overageAmount,
        displayName: `${member.firstName} ${member.lastName} (tope individual)`,
      });
    }
  }
}
