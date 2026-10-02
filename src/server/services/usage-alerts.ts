import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, members, memberUsageAlerts, passengers, settings as settingsTable } from "@/server/db/schema";
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
 * Counts distinct confirmed bookings where this member appears as a passenger, within
 * their current membership period. passengers.identificationNumber isn't normalized at
 * the column level, so matching happens in JS (same approach as checkMembershipForPassengers).
 */
async function countConfirmedUsesForMember(member: {
  identificationNumberNormalized: string;
  membershipStartDate: Date;
  membershipEndDate: Date;
}): Promise<number> {
  const rows = await db
    .select({ identificationNumber: passengers.identificationNumber, bookingId: passengers.bookingId })
    .from(passengers)
    .innerJoin(bookings, eq(passengers.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, "confirmed"),
        gte(bookings.startTime, member.membershipStartDate),
        lte(bookings.startTime, member.membershipEndDate)
      )
    );

  const matchingBookingIds = new Set(
    rows
      .filter((r) => normalizeIdentification(r.identificationNumber) === member.identificationNumberNormalized)
      .map((r) => r.bookingId)
  );

  return matchingBookingIds.size;
}

/**
 * Checks whether any member aboard this booking has exceeded their annual usage quota,
 * and opens/updates an alert if so. Self-contained and independent of the aggregate
 * membershipStatus ("member" | "vip" | "none") - it does its own matching, so it still
 * catches a member sharing a flight with a VIP (where membershipStatus would read "vip").
 * Coexists with misuse-alerts.ts (opposite case: freeloaders with no member/VIP aboard).
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

  const { annualUsageLimit, overageAmount } = await getMembershipUsageSettings();

  for (const member of matchedMembers) {
    const usageCount = await countConfirmedUsesForMember(member);

    if (usageCount <= annualUsageLimit) {
      continue;
    }

    // Scoped to the member's current period: if they've since renewed, periodEnd no
    // longer matches and a fresh alert is created instead of reusing a stale one.
    const existingOpenAlert = await db.query.memberUsageAlerts.findFirst({
      where: and(
        eq(memberUsageAlerts.memberId, member.id),
        eq(memberUsageAlerts.status, "open"),
        eq(memberUsageAlerts.periodEnd, member.membershipEndDate)
      ),
    });

    if (existingOpenAlert) {
      await db
        .update(memberUsageAlerts)
        .set({ usageCount })
        .where(eq(memberUsageAlerts.id, existingOpenAlert.id));
      continue;
    }

    await db.insert(memberUsageAlerts).values({
      memberId: member.id,
      usageCount,
      periodStart: member.membershipStartDate,
      periodEnd: member.membershipEndDate,
      status: "open",
    });

    await sendUsageOverageEmail({
      memberName: `${member.firstName} ${member.lastName}`,
      memberCode: member.memberCode,
      usageCount,
      annualUsageLimit,
      overageAmount,
      periodStart: member.membershipStartDate,
      periodEnd: member.membershipEndDate,
    }).catch((err) => console.error("Failed to send usage overage email:", err));
  }
}
