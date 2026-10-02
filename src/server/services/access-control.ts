import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db as defaultDb, type DbClient } from "@/server/db";
import { bookings } from "@/server/db/schema";

// Reglamento Art. 6.5: el QR vale solo para la fecha y franja confirmadas. Se abre un margen antes
// del inicio para el lounge y la llegada de pasajeros, y otro despues del fin para el desembarque.
export const CHECK_IN_OPENS_MINUTES_BEFORE = 60;
export const CHECK_IN_CLOSES_MINUTES_AFTER = 30;

export type AccessState =
  | "valid"
  | "not_yet" // before the window opens
  | "expired" // after the window closed
  | "exhausted" // declared people already entered
  | "cancelled"
  | "pending"; // not confirmed yet: no credential

export function checkInUrl(accessCode: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/check-in/${accessCode}`;
}

/**
 * Returns the booking's access code, generating it on first use. Only confirmed bookings get
 * one: a pending booking has no credential until it is approved.
 */
export async function ensureAccessCode(bookingId: string, db: DbClient = defaultDb) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { accessCode: true, status: true },
  });

  if (!booking || booking.status !== "confirmed") return null;
  if (booking.accessCode) return booking.accessCode;

  // 16 random bytes (128 bits): not guessable, short enough for a dense-free QR
  const code = randomBytes(16).toString("base64url");
  const [updated] = await db
    .update(bookings)
    .set({ accessCode: code })
    .where(and(eq(bookings.id, bookingId), isNull(bookings.accessCode)))
    .returning({ accessCode: bookings.accessCode });

  if (updated?.accessCode) return updated.accessCode;

  // Another request generated it at the same time: use theirs
  const reread = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    columns: { accessCode: true },
  });
  return reread?.accessCode ?? null;
}

/** People the QR covers: the declared number, or the registered passengers if not declared. */
export function allowedPeople(declaredPeople: number | null, passengerCount: number) {
  return declaredPeople ?? Math.max(passengerCount, 1);
}

export function getAccessState(
  booking: { status: string; startTime: Date; endTime: Date },
  allowed: number,
  entered: number,
  now: Date = new Date()
): AccessState {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status !== "confirmed") return "pending";

  const opens = booking.startTime.getTime() - CHECK_IN_OPENS_MINUTES_BEFORE * 60000;
  const closes = booking.endTime.getTime() + CHECK_IN_CLOSES_MINUTES_AFTER * 60000;
  if (now.getTime() < opens) return "not_yet";
  if (now.getTime() > closes) return "expired";
  if (entered >= allowed) return "exhausted";

  return "valid";
}

/** States where security may still register entry, recorded as an exception. */
export function allowsExceptionEntry(state: AccessState) {
  return state === "not_yet" || state === "expired" || state === "exhausted";
}
