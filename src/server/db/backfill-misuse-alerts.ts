import { isNotNull } from "drizzle-orm";
import { db } from "./index";
import { bookings } from "./schema";
import { checkAndTriggerMisuseAlert } from "../services/misuse-alerts";

async function backfill() {
  console.log("🔎 Backfilling misuse alerts from existing bookings...");

  const rows = await db
    .select({ helicopterRegistration: bookings.helicopterRegistration })
    .from(bookings)
    .where(isNotNull(bookings.helicopterRegistration));

  const registrations = [...new Set(rows.map((r) => r.helicopterRegistration).filter(Boolean))] as string[];

  console.log(`Found ${registrations.length} distinct aircraft registration(s) to check.`);

  for (const registration of registrations) {
    await checkAndTriggerMisuseAlert(registration);
    console.log(`✅ Checked ${registration}`);
  }

  console.log("🎉 Backfill completed!");
}

backfill()
  .catch((error) => {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
