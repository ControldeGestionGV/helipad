import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, members, memberUsageAlerts, passengers, settings as settingsTable } from "@/server/db/schema";
import type { Member } from "@/server/db/schema";
import { defaultSettings } from "@/server/api/routers/settings";
import { normalizeIdentification } from "@/server/services/membership";
import { sendLowQuotaMemberNotice, sendUsageQuotaEmail } from "@/server/services/email";

// Contrato 2.4 (updated): the membership includes up to N Operaciones Computables. There is no
// overage billing: once they are used up, the right to book ceases (bookings go to pending
// approval, see getQuotaStatusForPassengers). The member is notified when 5 remain.

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

/** The titular and every Usuario Autorizado of the membership (active or not: flights taken count). */
async function loadMembershipGroup(titularId: string) {
  const titular = await db.query.members.findFirst({ where: eq(members.id, titularId) });
  if (!titular) return null;
  const group = await db.query.members.findMany({
    where: or(eq(members.id, titular.id), eq(members.parentMemberId, titular.id)),
  });
  return { titular, group };
}

async function membershipUsed(titular: Member, group: Member[]) {
  return countConfirmedBookingsWithAny(
    group.map((m) => m.identificationNumberNormalized),
    titular.membershipStartDate,
    titular.membershipEndDate
  );
}

/**
 * Usage of a whole membership: the titular plus every Usuario Autorizado, within the titular's
 * membership period.
 */
export async function getMembershipUsage(titularId: string) {
  const loaded = await loadMembershipGroup(titularId);
  if (!loaded) return null;
  const { titular, group } = loaded;
  const { annualUsageLimit: globalLimit, lowQuotaThreshold } = await getMembershipUsageSettings();

  const used = await membershipUsed(titular, group);
  const limit = titular.annualUsageLimit ?? globalLimit;

  const perMember = await Promise.all(
    group.map(async (m) => ({
      memberId: m.id,
      used: await countConfirmedBookingsWithAny(
        [m.identificationNumberNormalized],
        titular.membershipStartDate,
        titular.membershipEndDate
      ),
      // Only Usuarios Autorizados have an individual cap; the titular's limit is the membership's
      limit: m.parentMemberId ? m.annualUsageLimit : null,
    }))
  );

  return {
    used,
    limit,
    remaining: Math.max(limit - used, 0),
    isExhausted: used >= limit,
    isLow: used < limit && limit - used <= lowQuotaThreshold,
    isCustomLimit: titular.annualUsageLimit !== null,
    globalLimit,
    perMember,
  };
}

async function activeMembersAboard(passengerInputs: Array<{ identificationNumber: string }>) {
  const normalizedIds = passengerInputs.map((p) => normalizeIdentification(p.identificationNumber));
  if (normalizedIds.length === 0) return [];
  const now = new Date();
  return db.query.members.findMany({
    where: and(
      inArray(members.identificationNumberNormalized, normalizedIds),
      eq(members.isActive, true),
      lte(members.membershipStartDate, now),
      gte(members.membershipEndDate, now)
    ),
  });
}

/**
 * Before booking: can any member aboard still use their membership? A member can't when their
 * membership quota is used up, or (Usuario Autorizado) their own cap is. Counts only bookings
 * already confirmed, so the booking being created is not included.
 */
export async function getQuotaStatusForPassengers(passengerInputs: Array<{ identificationNumber: string }>) {
  const aboard = await activeMembersAboard(passengerInputs);
  if (aboard.length === 0) {
    return { membersAboard: false, hasQuota: false };
  }

  const { annualUsageLimit: globalLimit } = await getMembershipUsageSettings();
  const exhaustedMemberships = new Map<string, boolean>();

  for (const member of aboard) {
    const titularId = member.parentMemberId ?? member.id;

    if (!exhaustedMemberships.has(titularId)) {
      const loaded = await loadMembershipGroup(titularId);
      exhaustedMemberships.set(
        titularId,
        !loaded ||
          (await membershipUsed(loaded.titular, loaded.group)) >= (loaded.titular.annualUsageLimit ?? globalLimit)
      );
    }
    if (exhaustedMemberships.get(titularId)) continue;

    if (member.parentMemberId && member.annualUsageLimit !== null) {
      const titular = await db.query.members.findFirst({ where: eq(members.id, member.parentMemberId) });
      if (!titular) continue;
      const ownUsed = await countConfirmedBookingsWithAny(
        [member.identificationNumberNormalized],
        titular.membershipStartDate,
        titular.membershipEndDate
      );
      if (ownUsed >= member.annualUsageLimit) continue;
    }

    return { membersAboard: true, hasQuota: true };
  }

  return { membersAboard: true, hasQuota: false };
}

/**
 * One alert per member, scope, kind and period. The email goes out only when the alert is first
 * raised; later bookings just update the count (also on acknowledged alerts, so the operator is
 * never re-notified for the same period).
 */
async function raiseOrUpdateAlert(params: {
  member: Member;
  scope: "membership" | "individual";
  kind: "low_quota" | "exhausted";
  usageCount: number;
  usageLimit: number;
  periodStart: Date;
  periodEnd: Date;
}): Promise<boolean> {
  const { member, scope, kind, usageCount, usageLimit, periodStart, periodEnd } = params;

  const existing = await db.query.memberUsageAlerts.findFirst({
    where: and(
      eq(memberUsageAlerts.memberId, member.id),
      eq(memberUsageAlerts.scope, scope),
      eq(memberUsageAlerts.kind, kind),
      eq(memberUsageAlerts.periodEnd, periodEnd)
    ),
  });

  if (existing) {
    await db
      .update(memberUsageAlerts)
      .set({ usageCount, usageLimit })
      .where(eq(memberUsageAlerts.id, existing.id));
    return false;
  }

  await db.insert(memberUsageAlerts).values({
    memberId: member.id,
    scope,
    kind,
    usageCount,
    usageLimit,
    periodStart,
    periodEnd,
    status: "open",
  });
  return true;
}

/**
 * After a booking is confirmed, checks the quotas of every membership with someone aboard:
 * - Membership quota (titular.annualUsageLimit, or the global setting), shared by the titular and
 *   all Usuarios Autorizados. "low_quota" when lowQuotaThreshold or fewer remain (operator alert +
 *   notice to the titular's contact email), "exhausted" when used up. Alerts on the titular.
 * - Individual cap of a Usuario Autorizado (optional): "exhausted" alert on that person.
 * Self-contained and independent of the aggregate membershipStatus, so it still catches a member
 * sharing a flight with a VIP. Coexists with misuse-alerts.ts (freeloaders with no member aboard).
 */
export async function checkAndTriggerUsageAlerts(
  passengerInputs: Array<{ identificationNumber: string }>
): Promise<void> {
  if (!passengerInputs || passengerInputs.length === 0) {
    return;
  }

  const aboard = await activeMembersAboard(passengerInputs);
  if (aboard.length === 0) {
    return;
  }

  const { annualUsageLimit: globalLimit, lowQuotaThreshold } = await getMembershipUsageSettings();

  // One check per membership, even if several of its people are aboard
  for (const titularId of new Set(aboard.map((m) => m.parentMemberId ?? m.id))) {
    const loaded = await loadMembershipGroup(titularId);
    if (!loaded) continue;
    const { titular, group } = loaded;

    const limit = titular.annualUsageLimit ?? globalLimit;
    const used = await membershipUsed(titular, group);
    const remaining = limit - used;
    const displayName = `${titular.firstName} ${titular.lastName}`;
    const base = {
      member: titular,
      scope: "membership" as const,
      usageCount: used,
      usageLimit: limit,
      periodStart: titular.membershipStartDate,
      periodEnd: titular.membershipEndDate,
    };

    if (remaining <= 0) {
      if (await raiseOrUpdateAlert({ ...base, kind: "exhausted" })) {
        await sendUsageQuotaEmail({ kind: "exhausted", memberName: displayName, memberCode: titular.memberCode, usageCount: used, annualUsageLimit: limit, periodStart: titular.membershipStartDate, periodEnd: titular.membershipEndDate }).catch((err) =>
          console.error("Failed to send quota exhausted email:", err)
        );
      }
    } else if (remaining <= lowQuotaThreshold) {
      if (await raiseOrUpdateAlert({ ...base, kind: "low_quota" })) {
        await sendUsageQuotaEmail({ kind: "low_quota", memberName: displayName, memberCode: titular.memberCode, usageCount: used, annualUsageLimit: limit, periodStart: titular.membershipStartDate, periodEnd: titular.membershipEndDate }).catch((err) =>
          console.error("Failed to send low quota email:", err)
        );
        if (titular.contactEmail) {
          await sendLowQuotaMemberNotice({
            to: titular.contactEmail,
            memberName: displayName,
            remaining,
            annualUsageLimit: limit,
            periodEnd: titular.membershipEndDate,
          }).catch((err) => console.error("Failed to send low quota notice to member:", err));
        }
      }
    }
  }

  // Individual caps of the Usuarios Autorizados aboard
  for (const member of aboard) {
    if (!member.parentMemberId || member.annualUsageLimit === null) continue;

    const titular = await db.query.members.findFirst({ where: eq(members.id, member.parentMemberId) });
    if (!titular) continue;

    const used = await countConfirmedBookingsWithAny(
      [member.identificationNumberNormalized],
      titular.membershipStartDate,
      titular.membershipEndDate
    );

    if (used >= member.annualUsageLimit) {
      const created = await raiseOrUpdateAlert({
        member,
        scope: "individual",
        kind: "exhausted",
        usageCount: used,
        usageLimit: member.annualUsageLimit,
        periodStart: titular.membershipStartDate,
        periodEnd: titular.membershipEndDate,
      });
      if (created) {
        await sendUsageQuotaEmail({
          kind: "exhausted",
          memberName: `${member.firstName} ${member.lastName} (tope individual)`,
          memberCode: member.memberCode,
          usageCount: used,
          annualUsageLimit: member.annualUsageLimit,
          periodStart: titular.membershipStartDate,
          periodEnd: titular.membershipEndDate,
        }).catch((err) => console.error("Failed to send individual cap email:", err));
      }
    }
  }
}
