import { and, count, eq, gte, or } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, unauthorizedOperations, users, type Booking } from "@/server/db/schema";
import {
  sendBookingActivityEmail,
  sendLateCancellationEmail,
  sendRuleExceptionEmail,
  sendUnauthorizedOperationEmail,
  type TeamBookingData,
} from "@/server/services/email";

// Reglamento Art. 6.4: three or more late cancellations or no-shows in a membership period.
// Counted per aircraft over the last 12 months, since bookings are made by the helipad staff on
// behalf of the clients and most clients have no membership loaded yet.
export const LATE_CANCELLATION_REPEAT_THRESHOLD = 3;
const LATE_CANCELLATION_WINDOW_MONTHS = 12;

// quota_exhausted already goes out as a pending-approval email
const RULE_EXCEPTION_WARNINGS = ["outside_hours", "short_notice", "long_duration", "blackout_date"];

async function teamBookingData(booking: Booking): Promise<TeamBookingData> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, booking.userId),
    columns: { firstName: true, lastName: true },
  });
  return {
    bookingId: booking.id,
    startTime: booking.startTime,
    helicopterRegistration: booking.helicopterRegistration,
    pilotName: booking.pilotName,
    requester: user ? `${user.firstName} ${user.lastName}` : "-",
    purpose: booking.purpose,
  };
}

/** New booking (not historical): rule exceptions and, once confirmed, regular activity. */
export async function notifyBookingCreated(booking: Booking): Promise<void> {
  const data = await teamBookingData(booking);
  const warnings = (booking.ruleWarnings ?? []).filter((w) => RULE_EXCEPTION_WARNINGS.includes(w));

  if (warnings.length > 0 && booking.status !== "cancelled") {
    await sendRuleExceptionEmail({ ...data, warnings, status: booking.status });
  }
  if (booking.status === "confirmed") {
    await sendBookingActivityEmail({ ...data, action: "confirmed" });
  }
}

/** A pending booking was approved. */
export async function notifyBookingApproved(booking: Booking): Promise<void> {
  await sendBookingActivityEmail({ ...(await teamBookingData(booking)), action: "confirmed" });
}

/** A confirmed booking was cancelled; late cancellations also go to the Art. 6.4 scenario. */
export async function notifyBookingCancelled(booking: Booking): Promise<void> {
  await sendBookingActivityEmail({ ...(await teamBookingData(booking)), action: "cancelled" });
  if (booking.lateCancellation) {
    await notifyLateCancellationOrNoShow(booking, "late_cancellation");
  }
}

/**
 * Art. 6.4 incident: a member's late cancellation, or one the operator marked afterwards
 * (requested by the client), or a no-show marked by the operator.
 */
export async function notifyLateCancellationOrNoShow(
  booking: Booking,
  kind: "late_cancellation" | "no_show"
): Promise<void> {
  await sendLateCancellationEmail({
    ...(await teamBookingData(booking)),
    kind,
    count: await countLateCancellationsAndNoShows(booking.helicopterRegistration),
    repeatThreshold: LATE_CANCELLATION_REPEAT_THRESHOLD,
  });
}

/** Late cancellations + no-shows of an aircraft over the last 12 months (by booking date). */
export async function countLateCancellationsAndNoShows(registration: string | null): Promise<number> {
  if (!registration) return 0;
  const since = new Date();
  since.setMonth(since.getMonth() - LATE_CANCELLATION_WINDOW_MONTHS);

  const [{ value }] = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.helicopterRegistration, registration),
        gte(bookings.startTime, since),
        or(eq(bookings.lateCancellation, true), eq(bookings.noShow, true))
      )
    );
  return value;
}

/**
 * Art. 24.3: an unauthorized operation was recorded. Emergencies stay on record but never alert
 * (an emergency landing is not an infraction).
 */
export async function notifyUnauthorizedOperation(operationId: string): Promise<void> {
  const operation = await db.query.unauthorizedOperations.findFirst({
    where: eq(unauthorizedOperations.id, operationId),
    with: { reportedByUser: { columns: { firstName: true, lastName: true } } },
  });
  if (!operation || operation.isEmergency) return;

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(unauthorizedOperations)
    .where(
      and(
        eq(unauthorizedOperations.helicopterRegistration, operation.helicopterRegistration),
        eq(unauthorizedOperations.isEmergency, false)
      )
    );

  await sendUnauthorizedOperationEmail({
    occurredAt: operation.occurredAt,
    helicopterRegistration: operation.helicopterRegistration,
    pilotName: operation.pilotName,
    kind: operation.kind,
    description: operation.description,
    reportedBy: operation.reportedByUser
      ? `${operation.reportedByUser.firstName} ${operation.reportedByUser.lastName}`
      : "-",
    priorCount: total - 1,
  });
}
