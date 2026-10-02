import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings } from "@/server/db/schema";
import { checkInUrl } from "@/server/services/access-control";

/**
 * PNG of a booking's QR (Reglamento Art. 6.5). Public on purpose: email clients load it without
 * a session. It only encodes the check-in URL; the booking data is shown to security after login.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.accessCode, code),
    columns: { id: true },
  });

  if (!booking) {
    return new Response("Not found", { status: 404 });
  }

  const png = await QRCode.toBuffer(checkInUrl(code), {
    type: "png",
    width: 360,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#001D41", light: "#FFFFFF" },
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // The code never changes for a booking; validity is decided at scan time
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
