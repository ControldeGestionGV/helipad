/**
 * Public base URL of the app, for links and QR codes in emails (server-side only).
 *
 * 1. NEXT_PUBLIC_APP_URL when set (and not a localhost value in a Vercel deployment).
 * 2. On Vercel, the production domain Vercel exposes automatically
 *    (VERCEL_PROJECT_PRODUCTION_URL: the custom domain if there is one). Emails always point to
 *    production, also when sent from a preview deployment.
 * 3. http://localhost:3000 for local development.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const onVercel = !!process.env.VERCEL;

  if (configured && !(onVercel && /localhost|127\.0\.0\.1/.test(configured))) {
    return configured.replace(/\/+$/, "");
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (onVercel && productionHost) {
    return `https://${productionHost}`;
  }

  return "http://localhost:3000";
}
