import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { db } from "@/server/db";
import { emailLogs, emailConfigurations, settings as settingsTable, users, type EmailLog } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { AlertScenario, AlertSubscription } from "@/lib/alert-scenarios";
import { defaultSettings } from "@/server/api/routers/settings";
import { GraphMailer } from "@/lib/email/graphMailer";
import type { IMailer } from "@/lib/email/types";
import { ensureAccessCode } from "@/server/services/access-control";
import { getAppUrl } from "@/server/app-url";
import { HELIPAD_TIMEZONE } from "@/server/services/booking-rules";
import enTranslations from "@/lib/translations/en.json";
import esTranslations from "@/lib/translations/es.json";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Helipad Booking";
// Resolved per call (not at module load) so it always reflects the deployment environment
const appUrl = () => getAppUrl();

// Translation helper
const translations: Record<string, any> = {
  en: enTranslations,
  es: esTranslations,
};

function t(key: string, locale: string = "en", replacements?: Record<string, string>): string {
  const keys = key.split(".");
  let value: any = translations[locale] || translations.en;
  
  for (const k of keys) {
    value = value?.[k];
  }
  
  let result = value || key;
  
  // Replace {{variable}} placeholders
  if (replacements) {
    Object.entries(replacements).forEach(([k, v]) => {
      result = result.replace(new RegExp(`{{${k}}}`, "g"), v);
    });
  }
  
  return result;
}

let cachedTransporter: Transporter | null = null;
let cachedGraphMailer: GraphMailer | null = null;
let cachedConfig: any | null = null;

/**
 * Get email configuration from database
 */
async function getEmailConfig() {
  const config = await db.query.emailConfigurations.findFirst({
    where: eq(emailConfigurations.isActive, true),
  });

  const envSmtpConfig =
    process.env.SMTP_HOST && (process.env.SMTP_AUTH_REQUIRED === "false" || (process.env.SMTP_USER && process.env.SMTP_PASSWORD))
      ? {
          id: process.env.SMTP_AUTH_REQUIRED === "false" ? "env-smtp-relay" : "env-smtp",
          provider: "smtp",
          smtpHost: process.env.SMTP_HOST,
          smtpPort: parseInt(process.env.SMTP_PORT || (process.env.SMTP_AUTH_REQUIRED === "false" ? "25" : "587"), 10),
          smtpSecure: process.env.SMTP_SECURE === "true",
          smtpUser: process.env.SMTP_AUTH_REQUIRED === "false" ? null : process.env.SMTP_USER,
          smtpPassword: process.env.SMTP_AUTH_REQUIRED === "false" ? null : process.env.SMTP_PASSWORD,
          fromEmail: process.env.EMAIL_FROM || process.env.SMTP_USER || "noreply@localhost",
          fromName: process.env.EMAIL_FROM_NAME || APP_NAME,
          resendApiKey: null,
          azureTenantId: null,
          azureClientId: null,
          mailboxSender: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null;

  if (!config) {
    return envSmtpConfig;
  }

  if (
    config.provider === "smtp" &&
    (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPassword) &&
    envSmtpConfig
  ) {
    return envSmtpConfig;
  }

  return config;
}

/**
 * Create nodemailer transporter from configuration
 */
async function getNodemailerTransporter(config: any): Promise<Transporter | null> {
  try {
    if (!config.smtpHost || !config.smtpPort) {
      console.log("[Email] SMTP configuration incomplete");
      return null;
    }

    const auth =
      config.smtpUser && config.smtpPassword
        ? {
            user: config.smtpUser,
            pass: config.smtpPassword,
          }
        : undefined;

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure ?? true,
      auth,
      requireTLS: process.env.SMTP_REQUIRE_TLS === "true",
      tls:
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED === "false"
          ? { rejectUnauthorized: false }
          : undefined,
    });

    console.log(`[Email] SMTP transporter created for ${config.smtpHost}${auth ? "" : " without auth"}`);
    return transporter;
  } catch (error) {
    console.error("[Email] Failed to create SMTP transporter:", error);
    return null;
  }
}

/**
 * Get mailer instance based on provider
 */
async function getMailer(): Promise<{ mailer: IMailer | Transporter | null; config: any; provider: string }> {
  try {
    const config = await getEmailConfig();

    if (!config) {
      console.log("[Email] No active email configuration found");
      return { mailer: null, config: null, provider: "none" };
    }

    // Check if config changed, if not return cached instance
    if (cachedConfig?.id === config.id) {
      if (config.provider === "msgraph" && cachedGraphMailer) {
        return { mailer: cachedGraphMailer, config, provider: "msgraph" };
      }
      if (config.provider === "smtp" && cachedTransporter) {
        return { mailer: cachedTransporter, config, provider: "smtp" };
      }
    }

    // Microsoft Graph provider
    if (config.provider === "msgraph") {
      const sender = config.mailboxSender || process.env.MAILBOX_SENDER;
      if (!sender) {
        console.error("[Email] Microsoft Graph provider requires MAILBOX_SENDER");
        return { mailer: null, config, provider: "msgraph" };
      }

      cachedGraphMailer = new GraphMailer(sender);
      cachedConfig = config;
      console.log(`[Email] Microsoft Graph mailer created for ${sender}`);
      return { mailer: cachedGraphMailer, config, provider: "msgraph" };
    }

    // SMTP provider
    if (config.provider === "smtp") {
      const transporter = await getNodemailerTransporter(config);
      if (transporter) {
        cachedTransporter = transporter;
        cachedConfig = config;
        return { mailer: transporter, config, provider: "smtp" };
      }
    }

    console.log("[Email] Unsupported email provider:", config.provider);
    return { mailer: null, config, provider: config.provider };
  } catch (error) {
    console.error("[Email] Failed to get mailer:", error);
    return { mailer: null, config: null, provider: "error" };
  }
}

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  userId?: string;
  bookingId?: string;
  type: EmailLog["type"];
}

// Opt-in only: one email per booking would flood the default recipients
const OPT_IN_ONLY_SCENARIOS: AlertScenario[] = ["booking_activity"];

/**
 * Resolve who receives a team notification: the people subscribed to that scenario
 * (settings.alertSubscriptions). A scenario nobody subscribed to falls back to
 * getApprovalRecipients(), except the opt-in-only ones, so no compliance alert is lost.
 */
export async function getAlertRecipients(scenario: AlertScenario): Promise<string[]> {
  const rows = await db.query.settings.findMany({
    where: inArray(settingsTable.key, ["emailNotifications", "alertSubscriptions"]),
  });
  const read = (key: string) => {
    const row = rows.find((r) => r.key === key);
    return row ? JSON.parse(row.value) : undefined;
  };

  const notificationConfig = { ...defaultSettings.emailNotifications, ...read("emailNotifications") };
  if (!notificationConfig.adminNotificationsEnabled) {
    return [];
  }

  const subscriptions: AlertSubscription[] = read("alertSubscriptions") ?? defaultSettings.alertSubscriptions;
  const subscribed = subscriptions.filter((s) => s.scenarios.includes(scenario)).map((s) => s.email);

  if (subscribed.length > 0 || OPT_IN_ONLY_SCENARIOS.includes(scenario)) {
    return subscribed;
  }
  return getApprovalRecipients();
}

/**
 * Resolve who should receive admin/approval-type notifications.
 * Precedence: settings.emailNotifications.approverEmails (DB) -> APPROVAL_NOTIFICATION_EMAILS (env) -> active admins.
 */
export async function getApprovalRecipients(): Promise<string[]> {
  const notificationSetting = await db.query.settings.findFirst({
    where: eq(settingsTable.key, "emailNotifications"),
  });
  const notificationConfig = notificationSetting
    ? { ...defaultSettings.emailNotifications, ...JSON.parse(notificationSetting.value) }
    : defaultSettings.emailNotifications;

  if (!notificationConfig.adminNotificationsEnabled) {
    return [];
  }

  const envEmailOverride = process.env.APPROVAL_NOTIFICATION_EMAILS
    ?.split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  const approverEmails: string[] = notificationConfig.approverEmails?.length
    ? notificationConfig.approverEmails
    : envEmailOverride ?? [];

  if (approverEmails.length) {
    return approverEmails;
  }

  const adminUsers = await db.query.users.findMany({
    where: and(eq(users.role, "admin"), eq(users.isActive, true)),
    columns: { email: true },
  });
  return adminUsers.map((u) => u.email);
}

export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const { to, subject, html, userId, bookingId, type } = options;

  // Log the email attempt
  const logEmail = async (status: "sent" | "failed", error?: string) => {
    try {
      await db.insert(emailLogs).values({
        userId,
        bookingId,
        type,
        status,
        error,
      });
    } catch (e) {
      console.error("Failed to log email:", e);
    }
  };

  try {
    if (process.env.EMAIL_DEV_MODE === "console") {
      console.log("\n[Email Dev Mode]");
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Type: ${type}`);

      const links = Array.from(html.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);
      if (links.length > 0) {
        console.log("Links:");
        links.forEach((link) => console.log(`  ${link}`));
      }

      console.log("[Email Dev Mode] End\n");
      await logEmail("sent");
      return true;
    }

    const { mailer, config, provider } = await getMailer();

    // If no mailer configured, log and skip
    if (!mailer) {
      const error = "Email service not configured";
      console.warn(`[Email] ${error}. Could not send to ${to}.`);
      console.warn(`  Subject: ${subject}`);
      console.warn(`  Type: ${type}`);
      await logEmail("failed", error);
      return false;
    }

    // Microsoft Graph mailer
    if (provider === "msgraph" && mailer instanceof GraphMailer) {
      await mailer.sendMail({
        to: [to],
        subject,
        htmlBody: html,
      });

      console.log(`[Email] Sent ${type} email to ${to} via Microsoft Graph`);
      await logEmail("sent");
      return true;
    }

    // SMTP via nodemailer
    if (provider === "smtp" && "sendMail" in mailer && config) {
      const info = await (mailer as Transporter).sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: to,
        subject: subject,
        html: html,
      });

      console.log(`[Email] Sent ${type} email to ${to} via SMTP. Message ID: ${info.messageId}`);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[Email] Preview URL: ${previewUrl}`);
      }
      await logEmail("sent");
      return true;
    }

    throw new Error(`Unsupported provider: ${provider}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Email] Exception:", errorMessage);
    await logEmail("failed", errorMessage);
    return false;
  }
}

// Email template helpers
// Name shown under the logo and in the footer. Fixed on purpose: the sender name varies by environment.
const EMAIL_BRAND = "Helipad";
// Solid colors only: Outlook ignores CSS gradients, which left white text on a white header.
const BRAND_NAVY = "#001D41";

function baseTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${EMAIL_BRAND}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4f5" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e4e4e7;">
          <!-- Header -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="background-color: #ffffff; padding: 28px 32px 20px; text-align: center;">
              <img src="${appUrl()}/images/email-logo.png" width="240" height="35" alt="World Trade Center Santo Domingo" style="display: block; margin: 0 auto; border: 0; width: 240px; height: auto;" />
              <p style="margin: 14px 0 0; color: ${BRAND_NAVY}; font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase;">${EMAIL_BRAND}</p>
            </td>
          </tr>
          <tr>
            <td bgcolor="${BRAND_NAVY}" style="background-color: ${BRAND_NAVY}; height: 4px; line-height: 4px; font-size: 0;">&nbsp;</td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td bgcolor="#f9fafb" style="background-color: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #71717a; font-size: 13px;">
                ${EMAIL_BRAND} · <a href="${appUrl()}" style="color: ${BRAND_NAVY}; text-decoration: none; font-weight: 600;">Ir a la aplicación</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

interface BookingEmailData {
  userName: string;
  userEmail: string;
  userId: string;
  bookingId: string;
  date: string;
  startTime: string;
  endTime: string;
  purpose: string;
  locale?: string; // Default to 'en' if not provided
}

interface PendingBookingApprovalData extends BookingEmailData {
  adminEmail: string;
  approveUrl: string;
  rejectUrl: string;
  appUrl: string;
  contactPhone?: string | null;
  helicopterRegistration?: string | null;
  /** Why it needs approval (no member aboard, quota exhausted...) */
  reason?: string;
  passengers: Array<{
    name: string;
    identificationType: "cedula" | "passport" | "other";
    identificationNumber: string;
  }>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendPendingBookingApprovalEmail(data: PendingBookingApprovalData): Promise<boolean> {
  const passengersHtml = data.passengers.length
    ? data.passengers
        .map(
          (passenger, index) => `
            <tr>
              <td style="padding: 6px 0; color: #18181b; font-size: 14px;">
                ${index + 1}. ${escapeHtml(passenger.name)}
              </td>
              <td style="padding: 6px 0; color: #52525b; font-size: 14px;">
                ${escapeHtml(passenger.identificationType)} ${escapeHtml(passenger.identificationNumber)}
              </td>
            </tr>`
        )
        .join("")
    : `<tr><td style="padding: 6px 0; color: #71717a; font-size: 14px;">Sin pasajeros registrados</td></tr>`;

  const correctionSubject = encodeURIComponent(`Correccion requerida para reserva ${data.bookingId}`);
  const correctionBody = encodeURIComponent(
    `Hola ${data.userName},\n\nNecesitamos corregir algunos datos de tu solicitud de reserva del helipuerto para ${data.date} de ${data.startTime} a ${data.endTime}.\n\nPor favor revisa la informacion y responde a este correo.\n\nGracias.`
  );

  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Nueva reserva pendiente</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Hay una nueva solicitud de reserva del helipuerto esperando aprobación.
    </p>
    ${
      data.reason
        ? `<p style="margin: 0 0 24px; padding: 12px 16px; background-color: #fef3c7; border-radius: 8px; color: #92400e; font-size: 14px;"><strong>Motivo:</strong> ${escapeHtml(data.reason)}</p>`
        : ""
    }

    <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">Solicitante</td>
          <td style="padding: 8px 0; color: #18181b; font-size: 14px; font-weight: 600;">${escapeHtml(data.userName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">Fecha</td>
          <td style="padding: 8px 0; color: #18181b; font-size: 14px; font-weight: 600;">${escapeHtml(data.date)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">Hora</td>
          <td style="padding: 8px 0; color: #18181b; font-size: 14px; font-weight: 600;">${escapeHtml(data.startTime)} - ${escapeHtml(data.endTime)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">Matrícula</td>
          <td style="padding: 8px 0; color: #18181b; font-size: 14px; font-weight: 600;">${escapeHtml(data.helicopterRegistration || "-")}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">Telefono</td>
          <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${escapeHtml(data.contactPhone || "-")}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #71717a; font-size: 14px;">Propósito</td>
          <td style="padding: 8px 0; color: #18181b; font-size: 14px;">${escapeHtml(data.purpose)}</td>
        </tr>
      </table>
    </div>

    <h3 style="margin: 0 0 8px; color: #18181b; font-size: 16px;">Pasajeros</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
      ${passengersHtml}
    </table>

    <div style="margin-bottom: 24px;">
      <a href="${data.approveUrl}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 0 8px 8px 0;">Aprobar</a>
      <a href="${data.rejectUrl}" style="display: inline-block; background: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 0 8px 8px 0;">Rechazar</a>
      <a href="mailto:${data.userEmail}?subject=${correctionSubject}&body=${correctionBody}" style="display: inline-block; background: #f59e0b; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600; font-size: 14px; margin: 0 8px 8px 0;">Pedir correccion</a>
    </div>

    <a href="${data.appUrl}" style="color: #3f3f46; text-decoration: none; font-weight: 600;">Ver en la app</a>
  `;

  return sendEmail({
    to: data.adminEmail,
    subject: `Nueva reserva pendiente - ${data.date}`,
    html: baseTemplate(content),
    userId: data.userId,
    bookingId: data.bookingId,
    type: "confirmation",
  });
}

interface MisuseAlertData {
  helicopterRegistration: string;
  triggerCount: number;
  windowStart: Date;
  windowEnd: Date;
}

export async function sendMisuseAlertEmail(data: MisuseAlertData): Promise<boolean> {
  const recipients = await getAlertRecipients("misuse");

  if (recipients.length === 0) {
    return false;
  }

  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Alerta de uso indebido</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      La aeronave con matrícula <strong>${escapeHtml(data.helicopterRegistration)}</strong> ha aterrizado
      <strong>${data.triggerCount} veces</strong> en los últimos 6 meses sin ningún titular de membresía
      (ni VIP) a bordo. Esto puede indicar que se esta prestando la aeronave, o que se esta evadiendo
      la exigencia de membresía.
    </p>

    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; color: #991b1b; font-size: 14px;">Matrícula</td>
          <td style="padding: 8px 0; color: #7f1d1d; font-size: 14px; font-weight: 600;">${escapeHtml(data.helicopterRegistration)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #991b1b; font-size: 14px;">Aterrizajes sin titular</td>
          <td style="padding: 8px 0; color: #7f1d1d; font-size: 14px; font-weight: 600;">${data.triggerCount}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #991b1b; font-size: 14px;">Ventana evaluada</td>
          <td style="padding: 8px 0; color: #7f1d1d; font-size: 14px;">${data.windowStart.toLocaleDateString("es-DO")} - ${data.windowEnd.toLocaleDateString("es-DO")}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 0 0 24px; color: #52525b; font-size: 14px;">
      Esta es una notificacion informativa; no bloquea reservas futuras de esta aeronave.
    </p>

    <a href="${appUrl()}/admin/alerts" style="display: inline-block; background-color: #001D41; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
      Ver alertas
    </a>
  `;

  const results = await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: `Alerta de uso indebido - ${data.helicopterRegistration}`,
        html: baseTemplate(content),
        type: "misuse_alert",
      })
    )
  );

  return results.some(Boolean);
}

interface UsageQuotaAlertData {
  kind: "low_quota" | "exhausted";
  memberName: string;
  memberCode: string | null;
  usageCount: number;
  annualUsageLimit: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Operator alert (Contrato 2.4): few operations left, or quota used up. There is no overage
 * billing; once used up, the membership's new bookings go to pending approval.
 */
export async function sendUsageQuotaEmail(data: UsageQuotaAlertData): Promise<boolean> {
  const recipients = await getAlertRecipients("membership_quota");

  if (recipients.length === 0) {
    return false;
  }

  const remaining = Math.max(data.annualUsageLimit - data.usageCount, 0);
  const isExhausted = data.kind === "exhausted";
  const title = isExhausted ? "Cupo de membresía agotado" : "Quedan pocas operaciones";
  const summary = isExhausted
    ? `ha usado <strong>${data.usageCount} de ${data.annualUsageLimit} operaciones</strong> de su período de membresía.
      Conforme a la cláusula 2.4 del Contrato, cesa su derecho a solicitar nuevas reservas: las reservas
      nuevas de esta membresía quedarán <strong>pendientes de aprobación</strong> hasta que se firme una nueva membresía.`
    : `le quedan <strong>${remaining} operaciones</strong> de ${data.annualUsageLimit} en su período de membresía.
      Conforme a la cláusula 2.4 del Contrato, corresponde comunicarle si desea gestionar una nueva membresía.`;

  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${title}</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      El miembro <strong>${escapeHtml(data.memberName)}</strong>${data.memberCode ? ` (codigo ${escapeHtml(data.memberCode)})` : ""}
      ${summary}
    </p>

    <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Miembro</td>
          <td style="padding: 8px 0; color: #78350f; font-size: 14px; font-weight: 600;">${escapeHtml(data.memberName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Operaciones usadas</td>
          <td style="padding: 8px 0; color: #78350f; font-size: 14px; font-weight: 600;">${data.usageCount} de ${data.annualUsageLimit}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Disponibles</td>
          <td style="padding: 8px 0; color: #78350f; font-size: 14px; font-weight: 600;">${remaining}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #92400e; font-size: 14px;">Período de membresía</td>
          <td style="padding: 8px 0; color: #78350f; font-size: 14px;">${data.periodStart.toLocaleDateString("es-DO")} - ${data.periodEnd.toLocaleDateString("es-DO")}</td>
        </tr>
      </table>
    </div>

    <a href="${appUrl()}/admin/alerts" style="display: inline-block; background-color: #001D41; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
      Ver alertas
    </a>
  `;

  const results = await Promise.all(
    recipients.map((to) =>
      sendEmail({
        to,
        subject: `${title} - ${data.memberName}`,
        html: baseTemplate(content),
        type: "usage_overage_alert",
      })
    )
  );

  return results.some(Boolean);
}

interface LowQuotaMemberNoticeData {
  to: string;
  memberName: string;
  remaining: number;
  annualUsageLimit: number;
  periodEnd: Date;
}

/** Notice to the titular when few operations remain (Contrato 2.4). */
export async function sendLowQuotaMemberNotice(data: LowQuotaMemberNoticeData): Promise<boolean> {
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Aviso de su membresía</h2>
    <p style="margin: 0 0 16px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Estimado(a) ${escapeHtml(data.memberName)}:
    </p>
    <p style="margin: 0 0 16px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Le informamos que a su membresía del helipuerto le quedan <strong>${data.remaining} operaciones</strong>
      de las ${data.annualUsageLimit} incluidas en su período vigente, que finaliza el
      ${data.periodEnd.toLocaleDateString("es-DO")}.
    </p>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Una vez agotadas las operaciones incluidas, cesa el derecho a solicitar nuevas reservas (cláusula 2.4
      del Contrato de Membresía). Le agradeceremos indicarnos si desea gestionar una nueva membresía.
    </p>
  `;

  return sendEmail({
    to: data.to,
    subject: `Aviso: quedan ${data.remaining} operaciones en su membresía`,
    html: baseTemplate(content),
    type: "low_quota_notice",
  });
}

export async function sendBookingConfirmation(data: BookingEmailData): Promise<boolean> {
  const locale = data.locale || "en";

  // Reglamento Art. 6.5: the access QR goes with the confirmation. Hosted image (not a data: URI,
  // which Gmail/Outlook strip); it only encodes the check-in URL, no personal data.
  const accessCode = await ensureAccessCode(data.bookingId).catch((err) => {
    console.error("Failed to generate access code:", err);
    return null;
  });
  const qrBlock = accessCode
    ? `
    <div style="text-align: center; border: 1px solid #e4e4e7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 12px; color: #18181b; font-size: 16px; font-weight: 600;">${t("emails.accessQrTitle", locale)}</p>
      <img src="${appUrl()}/api/bookings/qr/${accessCode}" width="200" height="200" alt="QR" style="display: block; margin: 0 auto 12px;" />
      <p style="margin: 0; color: #71717a; font-size: 13px; line-height: 1.5;">${t("emails.accessQrInstructions", locale)}</p>
    </div>`
    : "";
  
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${t("emails.bookingConfirmed", locale)}</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      ${t("emails.bookingConfirmedGreeting", locale, { userName: data.userName })}
    </p>
    
    <div style="background-color: #f4f4f5; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #71717a; font-size: 14px;">${t("emails.date", locale)}</span><br>
            <span style="color: #18181b; font-size: 16px; font-weight: 600;">${data.date}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #71717a; font-size: 14px;">${t("emails.time", locale)}</span><br>
            <span style="color: #18181b; font-size: 16px; font-weight: 600;">${data.startTime} - ${data.endTime}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #71717a; font-size: 14px;">${t("emails.purpose", locale)}</span><br>
            <span style="color: #18181b; font-size: 16px;">${data.purpose}</span>
          </td>
        </tr>
      </table>
    </div>
    
    ${qrBlock}

    <p style="margin: 0 0 24px; color: #52525b; font-size: 14px;">
      ${t("emails.needChanges", locale)}
    </p>
    
    <a href="${appUrl()}/bookings/my-bookings" style="display: inline-block; background-color: #001D41; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
      ${t("emails.viewMyBookings", locale)}
    </a>
  `;

  return sendEmail({
    to: data.userEmail,
    subject: `${t("emails.bookingConfirmed", locale)} - ${data.date}`,
    html: baseTemplate(content),
    userId: data.userId,
    bookingId: data.bookingId,
    type: "confirmation",
  });
}

export async function sendBookingCancellation(data: BookingEmailData): Promise<boolean> {
  const locale = data.locale || "en";
  
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${t("emails.bookingCancelled", locale)}</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      ${t("emails.bookingCancelledMessage", locale, { userName: data.userName })}
    </p>
    
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #991b1b; font-size: 14px;">${t("emails.date", locale)}</span><br>
            <span style="color: #7f1d1d; font-size: 16px; font-weight: 600; text-decoration: line-through;">${data.date}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #991b1b; font-size: 14px;">${t("emails.time", locale)}</span><br>
            <span style="color: #7f1d1d; font-size: 16px; font-weight: 600; text-decoration: line-through;">${data.startTime} - ${data.endTime}</span>
          </td>
        </tr>
      </table>
    </div>
    
    <p style="margin: 0 0 24px; color: #52525b; font-size: 14px;">
      ${t("emails.timeslotAvailable", locale)}
    </p>
    
    <a href="${appUrl()}/bookings/calendar" style="display: inline-block; background-color: #001D41; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
      ${t("emails.bookNewSlot", locale)}
    </a>
  `;

  return sendEmail({
    to: data.userEmail,
    subject: `${t("emails.bookingCancelled", locale)} - ${data.date}`,
    html: baseTemplate(content),
    userId: data.userId,
    bookingId: data.bookingId,
    type: "cancellation",
  });
}

export async function sendBookingReminder(data: BookingEmailData): Promise<boolean> {
  const locale = data.locale || "en";
  
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${t("emails.upcomingBookingReminder", locale)}</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      ${t("emails.reminderMessage", locale, { userName: data.userName })}
    </p>
    
    <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #92400e; font-size: 14px;">${t("emails.date", locale)}</span><br>
            <span style="color: #78350f; font-size: 16px; font-weight: 600;">${data.date}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #92400e; font-size: 14px;">${t("emails.time", locale)}</span><br>
            <span style="color: #78350f; font-size: 16px; font-weight: 600;">${data.startTime} - ${data.endTime}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: #92400e; font-size: 14px;">${t("emails.purpose", locale)}</span><br>
            <span style="color: #78350f; font-size: 16px;">${data.purpose}</span>
          </td>
        </tr>
      </table>
    </div>
    
    <a href="${appUrl()}/bookings/my-bookings" style="display: inline-block; background-color: #001D41; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
      ${t("emails.viewBookingDetails", locale)}
    </a>
  `;

  return sendEmail({
    to: data.userEmail,
    subject: `${t("emails.upcomingBookingReminder", locale)} - ${data.date}`,
    html: baseTemplate(content),
    userId: data.userId,
    bookingId: data.bookingId,
    type: "reminder",
  });
}

// ---------- Team notifications by scenario (settings.alertSubscriptions) ----------

/** Date and time in the helipad's local time (the server runs in UTC). */
function formatHelipadDateTime(date: Date): string {
  return new Intl.DateTimeFormat("es-DO", {
    timeZone: HELIPAD_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function detailsTable(rows: Array<[string, string | null | undefined]>): string {
  const cells = rows
    .filter(([, value]) => value)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 6px 0; color: #71717a; font-size: 14px; width: 40%;">${label}</td>
          <td style="padding: 6px 0; color: #18181b; font-size: 14px; font-weight: 600;">${escapeHtml(value!)}</td>
        </tr>`
    )
    .join("");
  return `
    <div style="background-color: #f4f4f5; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">${cells}</table>
    </div>`;
}

function actionButton(path: string, label: string): string {
  return `
    <a href="${appUrl()}${path}" style="display: inline-block; background-color: #001D41; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
      ${label}
    </a>`;
}

async function sendTeamAlert(
  scenario: AlertScenario,
  type: EmailLog["type"],
  subject: string,
  content: string,
  bookingId?: string
): Promise<boolean> {
  const recipients = await getAlertRecipients(scenario);
  if (recipients.length === 0) {
    return false;
  }
  const results = await Promise.all(
    recipients.map((to) => sendEmail({ to, subject, html: baseTemplate(content), bookingId, type }))
  );
  return results.some(Boolean);
}

/** Booking facts shared by the booking-based team notifications. */
export interface TeamBookingData {
  bookingId: string;
  startTime: Date;
  helicopterRegistration: string | null;
  pilotName: string | null;
  requester: string;
  purpose: string;
}

function bookingRows(data: TeamBookingData): Array<[string, string | null | undefined]> {
  return [
    ["Fecha y hora", formatHelipadDateTime(data.startTime)],
    ["Matrícula", data.helicopterRegistration],
    ["Piloto", data.pilotName],
    ["Registrada por", data.requester],
    ["Propósito", data.purpose],
  ];
}

/** Reglamento Art. 5.1, 6.1 and 19.1: a booking was made with exceptions (not blocked). */
export async function sendRuleExceptionEmail(
  data: TeamBookingData & { warnings: string[]; status: "pending" | "confirmed" }
): Promise<boolean> {
  const labels = data.warnings.map((w) => t(`ruleWarnings.${w}`, "es")).join(", ");
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Reserva con excepciones al Reglamento</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">
      Se registró una reserva ${data.status === "confirmed" ? "confirmada" : "pendiente de aprobación"} con las
      siguientes excepciones: <strong>${escapeHtml(labels)}</strong>. La reserva no se bloquea; queda
      registrada para su seguimiento.
    </p>
    ${detailsTable(bookingRows(data))}
    ${actionButton("/admin/bookings", "Ver reservas")}
  `;
  return sendTeamAlert(
    "rule_exception",
    "rule_exception_alert",
    `Reserva con excepciones - ${labels}`,
    content,
    data.bookingId
  );
}

/**
 * Reglamento Art. 6.4: late cancellation or no-show. `count` = late cancellations + no-shows of
 * the same aircraft in the last 12 months, this one included; from `repeatThreshold` on it is
 * "reiterada".
 */
export async function sendLateCancellationEmail(
  data: TeamBookingData & { kind: "late_cancellation" | "no_show"; count: number; repeatThreshold: number }
): Promise<boolean> {
  const what = data.kind === "no_show" ? "Inasistencia a una reserva" : "Cancelación tardía";
  const repeated = data.count >= data.repeatThreshold;
  const fact =
    data.kind === "no_show"
      ? "El personal del helipuerto registró que la reserva confirmada no se presentó."
      : "La reserva confirmada se canceló con menos antelación que la permitida por el Art. 6.4 del Reglamento.";
  const countText = data.helicopterRegistration
    ? ` La matrícula <strong>${escapeHtml(data.helicopterRegistration)}</strong> suma
      <strong>${data.count}</strong> cancelaciones tardías o inasistencias en los últimos 12 meses.`
    : "";
  const repeatedText = repeated
    ? ` Con ${data.repeatThreshold} o más en un mismo período, el Art. 6.4 faculta a aplicar las medidas del
      Capítulo VIII.`
    : "";
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${what}${repeated ? " (reiterada)" : ""}</h2>
    <p style="margin: 0 0 24px; color: #52525b; font-size: 16px; line-height: 1.6;">${fact}${countText}${repeatedText}</p>
    ${detailsTable(bookingRows(data))}
    ${actionButton("/admin/bookings", "Ver reservas")}
  `;
  return sendTeamAlert(
    "late_cancellation",
    "late_cancellation_alert",
    `${what}${repeated ? " (reiterada)" : ""} - ${data.helicopterRegistration ?? formatHelipadDateTime(data.startTime)}`,
    content,
    data.bookingId
  );
}

/**
 * Reglamento Art. 24.3. Reports the fact, never a qualification: whether it is an infraction,
 * the warning to the member and any communication to the IDAC are decided by a person.
 */
export async function sendUnauthorizedOperationEmail(data: {
  occurredAt: Date;
  helicopterRegistration: string;
  pilotName: string | null;
  kind: "no_booking" | "outside_slot";
  description: string | null;
  reportedBy: string;
  priorCount: number;
}): Promise<boolean> {
  const fact =
    data.kind === "no_booking" ? "sin reserva confirmada" : "fuera de la franja horaria de su reserva confirmada";
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">Operación sin reserva registrada</h2>
    <p style="margin: 0 0 16px; color: #52525b; font-size: 16px; line-height: 1.6;">
      El personal del helipuerto registró una operación de la aeronave
      <strong>${escapeHtml(data.helicopterRegistration)}</strong> ${fact}. El registro indica que no se trató
      de una emergencia.
    </p>
    ${detailsTable([
      ["Fecha y hora", formatHelipadDateTime(data.occurredAt)],
      ["Matrícula", data.helicopterRegistration],
      ["Piloto", data.pilotName],
      ["Descripción", data.description],
      ["Registrado por", data.reportedBy],
      ["Registros previos de esta matrícula", String(data.priorCount)],
    ])}
    <p style="margin: 0 0 24px; color: #52525b; font-size: 14px; line-height: 1.6;">
      Art. 24.3 del Reglamento: ante la primera operación no autorizada corresponde una advertencia escrita al
      miembro, con copia al operador aéreo y al piloto al mando; en caso de reincidencia, el operador puede poner
      el hecho en conocimiento del IDAC. Toda comunicación debe reportar el hecho, sin calificarlo como infracción.
    </p>
    ${actionButton("/admin/alerts", "Revisar registro")}
  `;
  return sendTeamAlert(
    "unauthorized_operation",
    "unauthorized_operation_alert",
    `Operación sin reserva - ${data.helicopterRegistration}`,
    content
  );
}

/** Regular use of the helipad: a booking was confirmed or cancelled. Opt-in only. */
export async function sendBookingActivityEmail(
  data: TeamBookingData & { action: "confirmed" | "cancelled" }
): Promise<boolean> {
  const title = data.action === "confirmed" ? "Reserva confirmada" : "Reserva cancelada";
  const content = `
    <h2 style="margin: 0 0 16px; color: #18181b; font-size: 20px;">${title}</h2>
    ${detailsTable(bookingRows(data))}
    ${actionButton("/admin/operation", "Ver operación del día")}
  `;
  const subjectParts = [title, data.helicopterRegistration, formatHelipadDateTime(data.startTime)];
  return sendTeamAlert(
    "booking_activity",
    "booking_activity",
    subjectParts.filter(Boolean).join(" - "),
    content,
    data.bookingId
  );
}
