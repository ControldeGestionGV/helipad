"use client";

import { useState, useCallback } from "react";
import { useSession } from "@/lib/auth-client";
import { Plus, Wifi, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useCalendar } from "@/hooks/use-calendar";
import { useSSE } from "@/hooks/use-sse";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CalendarHeader } from "@/components/calendar/calendar-header";
import { WeekView } from "@/components/calendar/week-view";
import { DayView } from "@/components/calendar/day-view";
import { MonthView } from "@/components/calendar/month-view";
import { BookingForm } from "@/components/bookings/booking-form";
import { BookingDetails } from "@/components/bookings/booking-details";
import { toast } from "@/components/ui/toast";

interface Booking {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  purpose: string;
  notes?: string | null;
  contactPhone?: string | null;
  helicopterRegistration?: string | null;
  status: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
}

export default function CalendarPage() {
  const { data: session } = useSession();
  const calendar = useCalendar("week");
  const currentUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "admin";
  const isSecurity = session?.user?.role === "security";
  const { t, translateError } = useTranslations();

  // Dialog state
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [initialSlot, setInitialSlot] = useState<{
    date: Date;
    hour: number;
    minute: number;
  } | null>(null);

  // Query bookings for current date range
  const { data: bookings, isLoading } = trpc.bookings.getByDateRange.useQuery({
    startDate: calendar.dateRange.start.toISOString(),
    endDate: calendar.dateRange.end.toISOString(),
  });

  // SSE for real-time updates
  useSSE({
    onBookingCreated: (data) => {
      if (data.userId !== currentUserId) {
        toast({
          type: "info",
          title: t("notifications.newBooking"),
          description: t("notifications.someoneBooked"),
        });
      }
    },
    onBookingCancelled: (data) => {
      if (data.userId !== currentUserId) {
        toast({
          type: "info",
          title: t("notifications.bookingCancelled"),
          description: t("notifications.bookingCancelledByOther"),
        });
      }
    },
  });

  // Mutations
  const utils = trpc.useUtils();

  const createBooking = trpc.bookings.create.useMutation({
    onSuccess: (data) => {
      utils.bookings.getByDateRange.invalidate();
      setIsBookingFormOpen(false);
      setInitialSlot(null);
      
      // Show different messages based on booking status
      if (data.status === "pending") {
        toast({
          type: "success",
          title: t("notifications.bookingPending"),
          description: t("notifications.bookingPendingDescription"),
        });
      } else {
        toast({
          type: "success",
          title: t("notifications.bookingConfirmed"),
          description: t("notifications.bookingConfirmedDescription"),
        });
      }
    },
    onError: (error) => {
      toast({
        type: "error",
        title: t("notifications.bookingFailed"),
        description: translateError(error.message),
      });
    },
  });

  const cancelBooking = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      utils.bookings.getByDateRange.invalidate();
      setSelectedBooking(null);
      toast({
        type: "success",
        title: t("notifications.bookingCancelled"),
        description: t("notifications.bookingCancelledDescription"),
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: t("notifications.cancellationFailed"),
        description: translateError(error.message),
      });
    },
  });

  const approveBooking = trpc.bookings.approve.useMutation({
    onSuccess: () => {
      utils.bookings.getByDateRange.invalidate();
      setSelectedBooking(null);
      toast({
        type: "success",
        title: t("adminBookings.bookingApproved"),
        description: t("adminBookings.bookingApprovedDescription"),
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: t("errors.generic"),
        description: translateError(error.message),
      });
    },
  });

  const rejectBooking = trpc.bookings.reject.useMutation({
    onSuccess: () => {
      utils.bookings.getByDateRange.invalidate();
      setSelectedBooking(null);
      toast({
        type: "success",
        title: t("adminBookings.bookingRejected"),
        description: t("adminBookings.bookingRejectedDescription"),
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: t("errors.generic"),
        description: translateError(error.message),
      });
    },
  });

  const updateBooking = trpc.bookings.update.useMutation({
    onSuccess: () => {
      utils.bookings.getByDateRange.invalidate();
      setIsBookingFormOpen(false);
      setEditingBooking(null);
      toast({
        type: "success",
        title: t("notifications.bookingUpdated"),
        description: t("notifications.bookingUpdatedDescription"),
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: t("notifications.updateFailed"),
        description: translateError(error.message),
      });
    },
  });

  // Handlers
  const handleSlotClick = useCallback((date: Date, hour: number, minute: number) => {
    // Security users cannot create bookings
    if (isSecurity) return;
    
    setInitialSlot({ date, hour, minute });
    setEditingBooking(null);
    setIsBookingFormOpen(true);
  }, [isSecurity]);

  const handleBookingClick = useCallback((booking: Booking) => {
    setSelectedBooking(booking);
  }, []);

  const handleDayClick = useCallback((date: Date) => {
    calendar.goToDate(date);
    calendar.setView("day");
  }, [calendar]);

  const handleBookingSubmit = (data: {
    startTime: string;
    endTime: string;
    purpose: string;
    notes?: string;
    contactPhone?: string;
    helicopterRegistration: string;
    passengers: any[]; // PassengerFormData[]
  }) => {
    if (editingBooking) {
      updateBooking.mutate({
        id: editingBooking.id,
        startTime: data.startTime,
        endTime: data.endTime,
        purpose: data.purpose,
        notes: data.notes,
        contactPhone: data.contactPhone,
        helicopterRegistration: data.helicopterRegistration,
        passengers: data.passengers,
      });
    } else {
      createBooking.mutate(data);
    }
  };

  const handleBookingCancel = () => {
    if (selectedBooking) {
      cancelBooking.mutate({ id: selectedBooking.id });
    }
  };

  const handleBookingApprove = () => {
    if (selectedBooking) {
      approveBooking.mutate({ id: selectedBooking.id });
    }
  };

  const handleBookingReject = () => {
    if (selectedBooking) {
      rejectBooking.mutate({ id: selectedBooking.id });
    }
  };

  const handleNewBooking = () => {
    setInitialSlot(null);
    setEditingBooking(null);
    setIsBookingFormOpen(true);
  };

  const handleEditBooking = () => {
    if (selectedBooking) {
      setEditingBooking(selectedBooking);
      setSelectedBooking(null);
      setIsBookingFormOpen(true);
    }
  };

  // Transform bookings data
  const transformedBookings: Booking[] = (bookings ?? []).map((b) => ({
    ...b,
    startTime: new Date(b.startTime),
    endTime: new Date(b.endTime),
    user: b.user ? { ...b.user, email: undefined } : null,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("calendarPage.title")}</h1>
          <p className="text-zinc-500 mt-1">
            {t("calendarPage.description")}
          </p>
        </div>
        {!isSecurity && (
          <Button onClick={handleNewBooking}>
            <Plus className="w-4 h-4" />
            {t("calendarPage.newBooking")}
          </Button>
        )}
      </div>

      {/* Calendar Header */}
      <CalendarHeader
        title={calendar.getTitle()}
        view={calendar.view}
        onViewChange={calendar.setView}
        onPrevious={calendar.goToPrevious}
        onNext={calendar.goToNext}
        onToday={calendar.goToToday}
      />

      {/* Calendar View */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {calendar.view === "week" && (
            <WeekView
              days={calendar.days}
              bookings={transformedBookings}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isSecurity={isSecurity}
              onSlotClick={handleSlotClick}
              onBookingClick={handleBookingClick}
            />
          )}
          {calendar.view === "day" && (
            <DayView
              date={calendar.currentDate}
              bookings={transformedBookings}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isSecurity={isSecurity}
              onSlotClick={isSecurity ? undefined : handleSlotClick}
              onBookingClick={handleBookingClick}
            />
          )}
          {calendar.view === "month" && (
            <MonthView
              currentDate={calendar.currentDate}
              bookings={transformedBookings}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isSecurity={isSecurity}
              onDayClick={handleDayClick}
              onBookingClick={handleBookingClick}
            />
          )}
        </>
      )}

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-brand-100 border border-brand-300" />
          <span className="text-zinc-600">{t("calendarPage.legend.myBookings")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-100 border-2 border-amber-300 border-dashed" />
          <span className="text-zinc-600">{t("calendarPage.legend.pendingBookings")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-zinc-100 border border-zinc-300" />
          <span className="text-zinc-600">{t("calendarPage.legend.otherBookings")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200" />
          <span className="text-zinc-600">{t("calendarPage.legend.available")}</span>
        </div>
      </div>

      {/* Booking Form Dialog */}
      <BookingForm
        open={isBookingFormOpen}
        onOpenChange={(open) => {
          setIsBookingFormOpen(open);
          if (!open) setEditingBooking(null);
        }}
        onSubmit={handleBookingSubmit}
        isLoading={createBooking.isPending || updateBooking.isPending}
        initialDate={initialSlot?.date}
        initialHour={initialSlot?.hour}
        initialMinute={initialSlot?.minute}
        editingBooking={editingBooking}
      />

      {/* Booking Details Dialog */}
      <BookingDetails
        booking={selectedBooking}
        open={!!selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        onCancel={handleBookingCancel}
        onEdit={handleEditBooking}
        onApprove={handleBookingApprove}
        onReject={handleBookingReject}
        isOwner={selectedBooking?.userId === currentUserId}
        isAdmin={isAdmin}
        isCancelling={cancelBooking.isPending}
        isApproving={approveBooking.isPending}
        isRejecting={rejectBooking.isPending}
      />
    </div>
  );
}
