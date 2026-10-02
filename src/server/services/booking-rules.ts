import { inArray } from "drizzle-orm";
import { db as defaultDb, type DbClient } from "@/server/db";
import { settings } from "@/server/db/schema";
import { defaultSettings } from "@/server/api/routers/settings";

// Reglamento de Operaciones del Helipuerto (Anexo A). Los horarios se evaluan en hora local
// del helipuerto, no en la del servidor (Vercel/Turso corren en UTC).
export const HELIPAD_TIMEZONE = "America/Santo_Domingo";

export interface BookingRules {
  operationalHours: { start: string; end: string };
  minBookingNotice: number;
  maxBookingDuration: number;
  cancellationCutoff: number;
  blackoutDates: string[];
}

const RULE_KEYS = [
  "operationalHours",
  "minBookingNotice",
  "maxBookingDuration",
  "cancellationCutoff",
  "blackoutDates",
] as const;

export async function getBookingRules(db: DbClient = defaultDb): Promise<BookingRules> {
  const rows = await db.select().from(settings).where(inArray(settings.key, [...RULE_KEYS]));

  const rules: BookingRules = {
    operationalHours: { ...defaultSettings.operationalHours },
    minBookingNotice: defaultSettings.minBookingNotice,
    maxBookingDuration: defaultSettings.maxBookingDuration,
    cancellationCutoff: defaultSettings.cancellationCutoff,
    blackoutDates: [...defaultSettings.blackoutDates],
  };

  for (const row of rows) {
    try {
      const value = JSON.parse(row.value);
      if (row.key === "operationalHours") {
        rules.operationalHours = { ...rules.operationalHours, ...value };
      } else {
        (rules as unknown as Record<string, unknown>)[row.key] = value;
      }
    } catch {
      // Keep default if JSON parse fails
    }
  }

  return rules;
}

/** Fecha (yyyy-MM-dd) y minutos desde medianoche en la hora local del helipuerto. */
function toHelipadLocal(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: HELIPAD_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function hhmmToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

// Excepciones al Reglamento. No bloquean la reserva (el operador recibe avisos de ultimo
// minuto y operaciones fuera de horario), solo quedan registradas en bookings.rule_warnings.
export const RULE_WARNINGS = ["blackout_date", "outside_hours", "long_duration", "short_notice"] as const;
export type RuleWarning = (typeof RULE_WARNINGS)[number];

/**
 * Compara una franja contra el Reglamento: dias bloqueados, horario de operaciones (Art. 5.1),
 * duracion de la franja (Art. 19.1) y antelacion minima (Art. 6.1).
 * Devuelve las excepciones encontradas (vacio = cumple).
 */
export function getRuleWarnings(
  start: Date,
  end: Date,
  rules: BookingRules,
  now: Date = new Date()
): RuleWarning[] {
  const warnings: RuleWarning[] = [];
  const localStart = toHelipadLocal(start);
  const localEnd = toHelipadLocal(end);

  if (rules.blackoutDates.includes(localStart.date)) {
    warnings.push("blackout_date");
  }

  const open = hhmmToMinutes(rules.operationalHours.start);
  const close = hhmmToMinutes(rules.operationalHours.end);
  if (localStart.date !== localEnd.date || localStart.minutes < open || localEnd.minutes > close) {
    warnings.push("outside_hours");
  }

  if ((end.getTime() - start.getTime()) / 60000 > rules.maxBookingDuration) {
    warnings.push("long_duration");
  }

  if ((start.getTime() - now.getTime()) / 60000 < rules.minBookingNotice) {
    warnings.push("short_notice");
  }

  return warnings;
}

/** Art. 6.4: cancelar con menos antelacion que el corte cuenta como cancelacion tardia. */
export function isLateCancellation(start: Date, rules: BookingRules, now: Date = new Date()) {
  return (start.getTime() - now.getTime()) / 60000 < rules.cancellationCutoff;
}
