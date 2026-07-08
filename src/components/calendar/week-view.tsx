"use client";

import { useMemo } from "react";
import { format, isSameDay, isToday, isBefore, isWithinInterval } from "date-fns";
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

interface WeekViewProps {
  days: Date[];
  bookings: Booking[];
  currentUserId: string;
  isAdmin?: boolean;
  isSecurity?: boolean;
  startHour?: number;
  endHour?: number;
  onSlotClick?: (date: Date, hour: number, minute: number) => void;
  onBookingClick: (booking: Booking) => void;
}

export function WeekView({
  days,
  bookings,
  currentUserId,
  isAdmin = false,
  isSecurity = false,
  startHour = 6,
  endHour = 22,
  onSlotClick,
  onBookingClick,
}: WeekViewProps) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;

  const timeSlots = useMemo(
    () => generateTimeSlots(startHour, endHour, 15), // Changed to 15-minute slots
    [startHour, endHour]
  );

  const getBookingsForSlot = (date: Date, hour: number, minute: number) => {
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
      {/* Horizontal scroll wrapper */}
      <div className="overflow-x-auto scrollbar-thin">
        <div className="min-w-[800px]">
          {/* Header with days */}
          <div className="grid grid-cols-[80px_repeat(7,minmax(100px,1fr))] border-b border-zinc-200">
            <div className="p-2 bg-zinc-50" />
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  "p-3 text-center border-l border-zinc-200",
                  isToday(day) && "bg-brand-50"
                )}
              >
                <div className="text-xs text-zinc-500 uppercase">
                  {format(day, "EEE", { locale: dateLocale })}
                </div>
                <div
                  className={cn(
                    "text-lg font-semibold mt-1",
                    isToday(day)
                      ? "w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center mx-auto"
                      : "text-zinc-900"
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
            {timeSlots.map((slot) => (
              <div
                key={`${slot.hour}-${slot.minute}`}
                className="grid grid-cols-[80px_repeat(7,minmax(100px,1fr))] border-b border-zinc-100 last:border-b-0"
              >
                {/* Time label */}
                <div className="p-2 text-xs text-zinc-400 text-right pr-3 bg-zinc-50/50">
                  {slot.minute === 0 ? slot.label : ""}
                </div>

                {/* Day cells */}
                {days.map((day) => {
                  const slotDateTime = getSlotDateTime(day, slot.hour, slot.minute);
                  const isPast = isBefore(slotDateTime, now);
                  const slotBookings = getBookingsForSlot(day, slot.hour, slot.minute);
                  const hasBooking = slotBookings.length > 0;
                  const isMyBooking = slotBookings.some(
                    (b) => b.userId === currentUserId
                  );

                  return (
                    <div
                      key={`${day.toISOString()}-${slot.hour}-${slot.minute}`}
                      className={cn(
                        "relative min-h-[40px] border-l border-zinc-100 transition-colors",
                        isPast
                          ? "bg-zinc-50/50"
                          : hasBooking
                          ? ""
                          : "hover:bg-emerald-50 cursor-pointer"
                      )}
                      onClick={() => {
                        if (!isPast && !hasBooking && onSlotClick) {
                          onSlotClick(day, slot.hour, slot.minute);
                        }
                      }}
                    >
                      {slotBookings.map((booking) => {
                        const bookingStart = new Date(booking.startTime);
                        const isStartSlot =
                          bookingStart.getHours() === slot.hour &&
                          bookingStart.getMinutes() === slot.minute &&
                          isSameDay(bookingStart, day);

                        if (!isStartSlot) return null;

                        const bookingEnd = new Date(booking.endTime);

                        const isOwnBooking = booking.userId === currentUserId;
                        const canViewDetails = isOwnBooking || isAdmin || isSecurity;

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
                              "w-full rounded-lg p-2 text-left text-sm font-medium transition-all touch-manipulation active:scale-95",
                              booking.status === "pending"
                                ? "bg-amber-100 text-amber-800 border-2 border-amber-300 border-dashed hover:ring-2 hover:ring-offset-1 hover:ring-amber-400 cursor-pointer active:ring-2 active:ring-amber-400"
                                : isOwnBooking
                                ? "bg-brand-100 text-brand-800 hover:ring-2 hover:ring-offset-1 hover:ring-brand-300 cursor-pointer active:ring-2 active:ring-brand-300"
                                : isAdmin || isSecurity
                                ? "bg-blue-100 text-blue-800 hover:ring-2 hover:ring-offset-1 hover:ring-blue-300 cursor-pointer active:ring-2 active:ring-blue-300"
                                : "bg-zinc-100 text-zinc-700 cursor-not-allowed opacity-60"
                            )}
                          >
                            <div className="font-semibold truncate text-xs">
                              {isOwnBooking 
                                ? `${booking.user?.firstName || "You"} ${booking.user?.lastName?.[0] || ""}.`
                                : `${booking.user?.firstName || "User"} ${booking.user?.lastName?.[0] || ""}.`}
                              {booking.status === "pending" && " *"}
                            </div>
                            <div className="text-[10px] opacity-75 truncate mt-0.5">
                              {format(bookingStart, "h:mm a")}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* End of time grid */}
        </div>
        {/* End of min-w wrapper */}
      </div>
      {/* End of horizontal scroll wrapper */}
    </div>
  );
}

