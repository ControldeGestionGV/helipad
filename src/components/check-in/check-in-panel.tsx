"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plane, User, UserCheck, Users, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/hooks/use-translations";
import type { RouterOutputs } from "@/lib/trpc";

type CheckInDetail = NonNullable<RouterOutputs["checkIn"]["getByCode"]>;

const STATE_STYLES: Record<CheckInDetail["state"], { box: string; icon: typeof CheckCircle2 }> = {
  valid: { box: "bg-emerald-50 border-emerald-300 text-emerald-800", icon: CheckCircle2 },
  not_yet: { box: "bg-amber-50 border-amber-300 text-amber-800", icon: Clock },
  expired: { box: "bg-amber-50 border-amber-300 text-amber-800", icon: Clock },
  exhausted: { box: "bg-amber-50 border-amber-300 text-amber-800", icon: AlertTriangle },
  cancelled: { box: "bg-red-50 border-red-300 text-red-800", icon: XCircle },
  pending: { box: "bg-red-50 border-red-300 text-red-800", icon: XCircle },
};

interface CheckInPanelProps {
  detail: CheckInDetail;
  /** Opened from the manual list instead of a QR scan (Reglamento Art. 6.5, procedimiento alterno) */
  isManual?: boolean;
  onRegistered?: () => void;
}

/**
 * What security sees at the access point: QR status, aircraft, pilot, passenger names and how
 * many of the declared people already entered. Entry outside the rules is allowed with a note.
 */
export function CheckInPanel({ detail, isManual = false, onRegistered }: CheckInPanelProps) {
  const { t, locale, translateError } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;
  const utils = trpc.useUtils();
  const [people, setPeople] = useState(String(Math.max(detail.remaining, 1)));
  const [note, setNote] = useState("");

  const register = trpc.checkIn.register.useMutation({
    onSuccess: (updated) => {
      utils.checkIn.invalidate();
      setNote("");
      setPeople(String(Math.max(updated?.remaining ?? 1, 1)));
      toast({ type: "success", title: t("checkIn.registered") });
      onRegistered?.();
    },
    onError: (error) => {
      toast({ type: "error", title: t("checkIn.registerFailed"), description: translateError(error.message) });
    },
  });

  const style = STATE_STYLES[detail.state];
  const StateIcon = style.icon;
  const peopleNumber = Number(people);
  const exceedsRemaining = peopleNumber > detail.remaining;
  const isException = !detail.canEnter || exceedsRemaining;
  const canSubmit =
    (detail.canEnter || detail.canEnterAsException) &&
    Number.isInteger(peopleNumber) &&
    peopleNumber >= 1 &&
    (!isException || note.trim().length > 0);

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className={cn("flex items-center justify-between gap-4 rounded-2xl border-2 p-4", style.box)}>
        <div className="flex items-center gap-3">
          <StateIcon className="h-8 w-8 shrink-0" />
          <div>
            <p className="text-lg font-bold">{t(`checkIn.states.${detail.state}`)}</p>
            <p className="text-sm">
              {format(new Date(detail.startTime), "EEEE d MMM, h:mm a", { locale: dateLocale })} -{" "}
              {format(new Date(detail.endTime), "h:mm a")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold">
            {detail.entered}/{detail.allowed}
          </p>
          <p className="text-xs">{t("checkIn.entered")}</p>
        </div>
      </div>

      {/* Flight */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-start gap-3 rounded-xl bg-zinc-50 p-3">
          <Plane className="mt-0.5 h-5 w-5 text-brand-600" />
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">{t("checkIn.aircraft")}</p>
            <p className="text-sm font-semibold text-zinc-900">{detail.helicopterRegistration || "-"}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-zinc-50 p-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-brand-600" />
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">{t("checkIn.pilot")}</p>
            <p className="text-sm font-semibold text-zinc-900">{detail.pilotName || t("checkIn.notProvided")}</p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-xl bg-zinc-50 p-3">
          <User className="mt-0.5 h-5 w-5 text-brand-600" />
          <div>
            <p className="text-xs font-medium uppercase text-zinc-500">{t("checkIn.bookedBy")}</p>
            <p className="text-sm font-semibold text-zinc-900">
              {detail.user ? `${detail.user.firstName} ${detail.user.lastName}` : "-"}
            </p>
          </div>
        </div>
      </div>

      {/* Passengers (name only) */}
      <div className="rounded-xl border border-zinc-200 p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <Users className="h-4 w-4" />
          {t("checkIn.passengers", { count: detail.passengers.length })}
          {detail.declaredPeople && (
            <span className="font-normal text-zinc-500">
              · {t("checkIn.declaredPeople", { count: detail.declaredPeople })}
            </span>
          )}
        </p>
        <ul className="space-y-1">
          {detail.passengers.map((passenger) => (
            <li key={passenger.id} className="text-sm text-zinc-900">
              • {passenger.name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">{t("checkIn.verifyIdentity")}</p>
      </div>

      {/* Register entry */}
      {(detail.canEnter || detail.canEnterAsException) && (
        <div className="space-y-3 rounded-xl border border-zinc-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32 space-y-2">
              <Label htmlFor="checkin-people">{t("checkIn.peopleEntering")}</Label>
              <Input
                id="checkin-people"
                type="number"
                inputMode="numeric"
                min={1}
                max={99}
                value={people}
                onChange={(e) => setPeople(e.target.value)}
              />
            </div>
            <Button
              className="h-12"
              disabled={!canSubmit || register.isPending}
              onClick={() =>
                register.mutate({
                  bookingId: detail.id,
                  people: peopleNumber,
                  note: note.trim() || undefined,
                  isManual,
                })
              }
            >
              {register.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isException ? t("checkIn.registerException") : t("checkIn.register")}
            </Button>
          </div>

          {isException && (
            <div className="space-y-2">
              <p className="flex items-start gap-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {exceedsRemaining && detail.canEnter
                  ? t("checkIn.exceptionExceeds", { remaining: detail.remaining })
                  : t("checkIn.exceptionNotice")}
              </p>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("checkIn.notePlaceholder")}
                maxLength={500}
              />
            </div>
          )}
        </div>
      )}

      {/* Access log */}
      {detail.checkIns.length > 0 && (
        <div className="rounded-xl border border-zinc-200 p-4">
          <p className="mb-2 text-sm font-semibold text-zinc-700">{t("checkIn.log")}</p>
          <ul className="space-y-1 text-sm text-zinc-700">
            {detail.checkIns.map((entry) => (
              <li key={entry.id}>
                {format(new Date(entry.createdAt!), "h:mm a")} · {t("checkIn.logPeople", { count: entry.people })}
                {entry.checkedInByUser &&
                  ` · ${entry.checkedInByUser.firstName} ${entry.checkedInByUser.lastName}`}
                {entry.isManual && ` · ${t("checkIn.manual")}`}
                {entry.isException && (
                  <span className="text-amber-700"> · {t("checkIn.exception")}: {entry.note}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
