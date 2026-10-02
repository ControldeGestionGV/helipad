"use client";

import { useMemo, useState } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { CalendarClock, ChevronDown, ChevronUp, RefreshCw, ScanLine, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CheckInPanel } from "@/components/check-in/check-in-panel";

const STATE_BADGE = {
  valid: "success",
  not_yet: "secondary",
  expired: "warning",
  exhausted: "warning",
  cancelled: "destructive",
  pending: "destructive",
} as const;

/**
 * Access control for today. The normal flow is scanning the QR with the phone camera; this list
 * is the manual fallback (Reglamento Art. 6.5): search by passenger, member or aircraft.
 */
export default function CheckInListPage() {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;
  const today = useMemo(() => new Date(), []);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.checkIn.listForDay.useQuery({
    startDate: startOfDay(today).toISOString(),
    endDate: endOfDay(today).toISOString(),
  });

  const { data: openDetail } = trpc.checkIn.getByBookingId.useQuery(
    { bookingId: openId ?? "" },
    { enabled: !!openId }
  );

  const term = search.trim().toLowerCase();
  const bookings = (data ?? []).filter((booking) => {
    if (!term) return true;
    const haystack = [
      booking.helicopterRegistration,
      booking.pilotName,
      booking.user ? `${booking.user.firstName} ${booking.user.lastName}` : "",
      ...booking.passengers.map((p) => p.name),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("checkIn.listTitle")}</h1>
          <p className="mt-1 text-zinc-500">
            {format(today, "EEEE, d MMMM", { locale: dateLocale })}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          {t("checkIn.refresh")}
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
        <ScanLine className="mt-0.5 h-5 w-5 shrink-0" />
        <p>{t("checkIn.scanHint")}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <Input
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("checkIn.searchPlaceholder")}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <CalendarClock className="mx-auto h-12 w-12 text-zinc-300" />
          <p className="mt-4 text-zinc-500">{t("checkIn.noBookings")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const isOpen = openId === booking.id;
            return (
              <div key={booking.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 p-4 text-left"
                  onClick={() => setOpenId(isOpen ? null : booking.id)}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-900">
                        {format(new Date(booking.startTime), "h:mm a")} -{" "}
                        {format(new Date(booking.endTime), "h:mm a")}
                      </span>
                      <Badge variant={STATE_BADGE[booking.state]}>{t(`checkIn.states.${booking.state}`)}</Badge>
                      <span className="text-sm text-zinc-500">
                        {booking.entered}/{booking.allowed} {t("checkIn.entered")}
                      </span>
                    </div>
                    <p className="truncate text-sm text-zinc-600">
                      {booking.helicopterRegistration || "-"}
                      {booking.user && ` · ${booking.user.firstName} ${booking.user.lastName}`}
                      {` · ${booking.passengers.map((p) => p.name).join(", ")}`}
                    </p>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-zinc-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-zinc-400" />
                  )}
                </button>
                {isOpen && (
                  <div className={cn("border-t border-zinc-100 p-4")}>
                    {openDetail && openDetail.id === booking.id ? (
                      <CheckInPanel detail={openDetail} isManual />
                    ) : (
                      <div className="flex justify-center py-6">
                        <Spinner />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
