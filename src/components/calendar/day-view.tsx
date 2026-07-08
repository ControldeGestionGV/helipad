"use client";

import { useMemo } from "react";
import { format, isBefore, isWithinInterval } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { generateTimeSlots, getSlotDateTime } from "@/hooks/use-calendar";
import { useTranslations } from "@/hooks/use-translations";

interface Booking {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  purpose: string;
  status: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface DayViewProps {
  date: Date;
  bookings: Booking[];
  currentUserId: string;
  isAdmin?: boolean;
  isSecurity?: boolean;
  startHour?: number;
  endHour?: number;
  onSlotClick?: (date: Date, hour: number, minute: number) => void;
  onBookingClick: (booking: Booking) => void;
}

export function DayView({
  date,
  bookings,
  currentUserId,
  isAdmin = false,
  isSecurity = false,
  startHour = 6,
  endHour = 22,
  onSlotClick,
  onBookingClick,
}: DayViewProps) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;

  const timeSlots = useMemo(
    () => generateTimeSlots(startHour, endHour, 15), // Changed to 15-minute slots
    [startHour, endHour]
  );

  const getBookingsForSlot = (hour: number, minute: number) => {
    const slotStart = getSlotDateTime(date, hour, minute);
    const slotEnd = getSlotDateTime(date, hour, minute + 15); // 15-minute slots

    return bookings.filter((booking) => {
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);

      return (
        (booking.status === "confirmed" || booking.status === "pending") &&
        (isWithinInterval(slotStart, { start: bookingStart, end: bookingEnd }) ||
          isWithinInterval(bookingStart, { start: slotStart, end: slotEnd }) ||
          (bookingStart <= slotStart && bookingEnd >= slotEnd))
      );
    });
  };

  const now = new Date();

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-brand-50 border-b border-brand-100">
        <h3 className="font-semibold text-brand-900">
          {format(date, "EEEE, MMMM d, yyyy", { locale: dateLocale })}
        </h3>
      </div>

      {/* Time grid */}
      <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
        {timeSlots.map((slot) => {
          const slotDateTime = getSlotDateTime(date, slot.hour, slot.minute);
          const isPast = isBefore(slotDateTime, now);
          const slotBookings = getBookingsForSlot(slot.hour, slot.minute);
          const hasBooking = slotBookings.length > 0;

          return (
            <div
              key={`${slot.hour}-${slot.minute}`}
              className={cn(
                "flex border-b border-zinc-100 last:border-b-0",
                slot.minute === 0 && "border-t border-zinc-200"
              )}
            >
              {/* Time label */}
              <div className="w-16 py-3 pr-3 text-[11px] font-medium text-zinc-400 bg-zinc-50/50 shrink-0 flex items-center justify-end">
                {slot.minute === 0 && slot.label}
              </div>

              {/* Slot content */}
              <div
                className={cn(
                  "flex-1 min-h-[48px] p-2 transition-colors",
                  isPast
                    ? "bg-zinc-50/50"
                    : hasBooking
                    ? ""
                    : "hover:bg-emerald-50 cursor-pointer"
                )}
                onClick={() => {
                  if (!isPast && !hasBooking && onSlotClick) {
                    onSlotClick(date, slot.hour, slot.minute);
                  }
                }}
              >
                {slotBookings.map((booking) => {
                  const bookingStart = new Date(booking.startTime);
                  const bookingEnd = new Date(booking.endTime);
                  const isStartSlot =
                    bookingStart.getHours() === slot.hour &&
                    bookingStart.getMinutes() === slot.minute;

                  const isOwnBooking = booking.userId === currentUserId;
                  const canViewDetails = isOwnBooking || isAdmin || isSecurity;

                  if (!isStartSlot) {
                    return (
                      <div
                        key={booking.id}
                        className={cn(
                          "h-full rounded-lg",
                          booking.status === "pending"
                            ? "bg-amber-100 border-2 border-amber-300 border-dashed"
                            : isOwnBooking
                            ? "bg-brand-100"
                            : isAdmin || isSecurity
                            ? "bg-blue-100"
                            : "bg-zinc-100"
                        )}
                      />
                    );
                  }

                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canViewDetails) {
                          onBookingClick(booking);
                        }
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        if (canViewDetails) {
                          onBookingClick(booking);
                        }
                      }}
                      disabled={!canViewDetails}
                      className={cn(
                        "w-full rounded-lg p-3 text-left transition-all touch-manipulation active:scale-95",
                        booking.status === "pending"
                          ? "bg-amber-100 text-amber-800 border-2 border-amber-300 border-dashed hover:ring-2 hover:ring-offset-1 hover:ring-amber-400 cursor-pointer active:ring-2 active:ring-amber-400"
                          : isOwnBooking
                          ? "bg-brand-100 text-brand-800 hover:ring-2 hover:ring-offset-1 hover:ring-brand-300 cursor-pointer active:ring-2 active:ring-brand-300"
                          : isAdmin || isSecurity
                          ? "bg-blue-100 text-blue-800 hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 cursor-pointer active:ring-2 active:ring-blue-300"
                          : "bg-zinc-100 text-zinc-700 cursor-not-allowed opacity-60"
                      )}
                    >
                      <div className="font-semibold">
                        {isOwnBooking
                          ? `${booking.user?.firstName || "You"} ${booking.user?.lastName || ""}`
                          : `${booking.user?.firstName || "User"} ${booking.user?.lastName || ""}`}
                        {booking.status === "pending" && " (Pending)"}
                      </div>
                      <div className="text-sm opacity-75 mt-1">
                        {format(bookingStart, "h:mm a")} -{" "}
                        {format(bookingEnd, "h:mm a")}
                      </div>
                      {canViewDetails && (
                        <div className="text-sm mt-1 truncate">
                          {booking.purpose}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

