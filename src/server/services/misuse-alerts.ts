import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings, misuseAlerts } from "@/server/db/schema";
import { sendMisuseAlertEmail } from "@/server/services/email";

const ALERT_THRESHOLD = 2;
const WINDOW_MONTHS = 6;

export async function checkAndTriggerMisuseAlert(helicopterRegistration: string): Promise<void> {
  if (!helicopterRegistration) {
    return;
  }

  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - WINDOW_MONTHS);
  const windowEnd = new Date();

  const [{ value: triggerCount }] = await db
    .select({ value: count() })
    .from(bookings)
    .where(
      and(
        eq(bookings.helicopterRegistration, helicopterRegistration),
        eq(bookings.status, "confirmed"),
        eq(bookings.membershipStatus, "none"),
        gte(bookings.startTime, windowStart)
      )
    );

  if (triggerCount < ALERT_THRESHOLD) {
    return;
  }

  const existingOpenAlert = await db.query.misuseAlerts.findFirst({
    where: and(
      eq(misuseAlerts.helicopterRegistration, helicopterRegistration),
      eq(misuseAlerts.status, "open")
    ),
  });

  if (existingOpenAlert) {
    await db
      .update(misuseAlerts)
      .set({ triggerCount, windowEnd })
      .where(eq(misuseAlerts.id, existingOpenAlert.id));
    return;
  }

  await db.insert(misuseAlerts).values({
    helicopterRegistration,
    triggerCount,
    windowStart,
    windowEnd,
    status: "open",
  });

  await sendMisuseAlertEmail({ helicopterRegistration, triggerCount, windowStart, windowEnd }).catch(
    (err) => console.error("Failed to send misuse alert email:", err)
  );
}
