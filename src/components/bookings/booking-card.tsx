"use client";

import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Calendar, Clock, MapPin, MoreVertical, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/hooks/use-translations";

interface BookingCardProps {
  booking: {
    id: string;
    startTime: Date;
    endTime: Date;
    purpose: string;
    notes?: string | null;
    status: string;
  };
  onView: () => void;
  onCancel?: () => void;
  isPast?: boolean;
}

export function BookingCard({
  booking,
  onView,
  onCancel,
  isPast = false,
}: BookingCardProps) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;
  const startTime = new Date(booking.startTime);
  const endTime = new Date(booking.endTime);
  const isCancelled = booking.status === "cancelled";
  const isPending = booking.status === "pending";

  return (
    <div
      className={cn(
        "bg-white rounded-xl border p-4 transition-all hover:shadow-md",
        isCancelled
          ? "border-red-200 bg-red-50/30"
          : isPending
          ? "border-yellow-200 bg-yellow-50/30"
          : isPast
          ? "border-zinc-200 opacity-75"
          : "border-zinc-200 hover:border-brand-200"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Date & Status */}
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant={
                isCancelled
                  ? "destructive"
                  : isPending
                  ? "warning"
                  : isPast
                  ? "secondary"
                  : "success"
              }
            >
              {isCancelled 
                ? t("bookingStatus.cancelled") 
                : isPending
                ? t("bookingStatus.pending")
                : isPast 
                ? t("bookingStatus.completed") 
                : t("bookingStatus.confirmed")}
            </Badge>
            <span className="text-xs text-zinc-500">
              {format(startTime, "EEEE, MMM d, yyyy", { locale: dateLocale })}
            </span>
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-zinc-900 mb-2">
            <Clock className="w-4 h-4 text-brand-600" />
            <span className="font-semibold">
              {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
            </span>
          </div>

          {/* Purpose */}
          <p className="text-sm text-zinc-600 truncate">{booking.purpose}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView}>
            <Eye className="w-4 h-4" />
          </Button>
          {!isPast && !isCancelled && onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={onCancel}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

