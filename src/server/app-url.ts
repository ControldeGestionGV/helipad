/**
 * Public base URL of the app, for links and QR codes in emails (server-side only).
 *
 * 1. A Vercel preview deployment points to itself (its stable branch URL), so a QR scanned
 *    while testing a branch opens that branch's code, not production's.
 * 2. NEXT_PUBLIC_APP_URL when set (and not a localhost value in a Vercel deployment).
 * 3. On Vercel, the production domain Vercel exposes automatically
 *    (VERCEL_PROJECT_PRODUCTION_URL: the custom domain if there is one).
 * 4. http://localhost:3000 for local development.
 */
export function getAppUrl(): string {
  const onVercel = !!process.env.VERCEL;

  if (onVercel && process.env.VERCEL_ENV === "preview") {
    const previewHost = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && !(onVercel && /localhost|127\.0\.0\.1/.test(configured))) {
    return configured.replace(/\/+$/, "");
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (onVercel && productionHost) {
    return `https://${productionHost}`;
  }

  return "http://localhost:3000";
}
