"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Calendar, History, Plus, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { BookingCard } from "@/components/bookings/booking-card";
import { BookingForm } from "@/components/bookings/booking-form";
import { BookingDetails } from "@/components/bookings/booking-details";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Booking {
  id: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  purpose: string;
  notes?: string | null;
  contactPhone?: string | null;
  status: string;
}

export default function MyBookingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [isBookingFormOpen, setIsBookingFormOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { t, translateError } = useTranslations();

  // Redirect security users to admin bookings page
  useEffect(() => {
    if (session?.user?.role === "security") {
      router.push("/admin/bookings");
    }
  }, [session, router]);

  // Query bookings
  const { data, isLoading } = trpc.bookings.getMyBookings.useQuery({
    upcoming: activeTab === "upcoming",
    page,
    limit: 10,
  });

  // Mutations
  const utils = trpc.useUtils();

  const createBooking = trpc.bookings.create.useMutation({
    onSuccess: () => {
      utils.bookings.getMyBookings.invalidate();
      setIsBookingFormOpen(false);
    },
  });

  const cancelBooking = trpc.bookings.cancel.useMutation({
    onSuccess: () => {
      utils.bookings.getMyBookings.invalidate();
      setCancellingId(null);
      setSelectedBooking(null);
      toast({
        type: "success",
        title: t("notifications.bookingCancelled"),
        description: t("notifications.bookingCancelledDescription"),
      });
    },
    onError: (error) => {
      setCancellingId(null);
      toast({
        type: "error",
        title: t("notifications.cancellationFailed"),
        description: translateError(error.message),
      });
    },
  });

  const approveBooking = trpc.bookings.approve.useMutation({
    onSuccess: () => {
      utils.bookings.getMyBookings.invalidate();
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
      utils.bookings.getMyBookings.invalidate();
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
      utils.bookings.getMyBookings.invalidate();
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

  const handleTabChange = (tab: "upcoming" | "past") => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleCancel = (bookingId: string) => {
    setCancellingId(bookingId);
    cancelBooking.mutate({ id: bookingId });
  };

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

  const handleEditBooking = () => {
    if (selectedBooking) {
      setEditingBooking(selectedBooking);
      setSelectedBooking(null);
      setIsBookingFormOpen(true);
    }
  };

  const bookings = data?.bookings ?? [];
  const pagination = data?.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 1 };

  const transformedBookings: Booking[] = bookings.map((b) => ({
    ...b,
    startTime: new Date(b.startTime),
    endTime: new Date(b.endTime),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("myBookings.title")}</h1>
          <p className="text-zinc-500 mt-1">
            {t("myBookings.description")}
          </p>
        </div>
        <Button onClick={() => {
          setEditingBooking(null);
          setIsBookingFormOpen(true);
        }}>
          <Plus className="w-4 h-4" />
          {t("calendarPage.newBooking")}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200">
        <button
          onClick={() => handleTabChange("upcoming")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "upcoming"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          <Calendar className="w-4 h-4" />
          {t("myBookings.upcoming")}
        </button>
        <button
          onClick={() => handleTabChange("past")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "past"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          <History className="w-4 h-4" />
          {t("myBookings.past")}
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : transformedBookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200 p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
            {activeTab === "upcoming" ? (
              <Calendar className="w-8 h-8 text-zinc-400" />
            ) : (
              <History className="w-8 h-8 text-zinc-400" />
            )}
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">
            {activeTab === "upcoming"
              ? t("myBookings.noUpcoming")
              : t("myBookings.noPast")}
          </h2>
          <p className="text-zinc-500 mb-6">
            {activeTab === "upcoming"
              ? t("myBookings.bookFirstSlot")
              : t("myBookings.completedBookingsHere")}
          </p>
          {activeTab === "upcoming" && (
            <Button onClick={() => {
              setEditingBooking(null);
              setIsBookingFormOpen(true);
            }}>
              <Plus className="w-4 h-4" />
              {t("bookings.bookNow")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Booking cards */}
          <div className="space-y-3">
            {transformedBookings.map((booking) => (
              <div key={booking.id} className="relative">
                {cancellingId === booking.id && (
                  <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center z-10">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
                  </div>
                )}
                <BookingCard
                  booking={booking}
                  onView={() => setSelectedBooking(booking)}
                  onCancel={
                    activeTab === "upcoming"
                      ? () => handleCancel(booking.id)
                      : undefined
                  }
                  isPast={activeTab === "past"}
                />
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {t("common.showing")} {transformedBookings.length} {t("common.of")} {pagination.total} {t("myBookings.bookings")}
              </p>
              <Pagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}

      {/* Booking Form Dialog */}
      <BookingForm
        open={isBookingFormOpen}
        onOpenChange={(open) => {
          setIsBookingFormOpen(open);
          if (!open) setEditingBooking(null);
        }}
        onSubmit={handleBookingSubmit}
        isLoading={createBooking.isPending || updateBooking.isPending}
        editingBooking={editingBooking}
      />

      {/* Booking Details Dialog */}
      <BookingDetails
        booking={
          selectedBooking
            ? {
                ...selectedBooking,
                user: session?.user
                  ? {
                      id: session.user.id,
                      firstName: session.user.firstName,
                      lastName: session.user.lastName,
                    }
                  : null,
              }
            : null
        }
        open={!!selectedBooking}
        onOpenChange={(open) => !open && setSelectedBooking(null)}
        onCancel={() =>
          selectedBooking && handleCancel(selectedBooking.id)
        }
        onEdit={handleEditBooking}
        onApprove={() => selectedBooking && approveBooking.mutate({ id: selectedBooking.id })}
        onReject={() => selectedBooking && rejectBooking.mutate({ id: selectedBooking.id })}
        isOwner={true}
        isAdmin={session?.user?.role === "admin"}
        isCancelling={cancellingId === selectedBooking?.id}
        isApproving={approveBooking.isPending}
        isRejecting={rejectBooking.isPending}
      />
    </div>
  );
}
