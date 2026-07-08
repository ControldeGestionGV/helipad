"use client";

import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Loader2, Calendar, Clock, User, Phone, FileText, X, Check, Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { useTranslations } from "@/hooks/use-translations";
import { PassengerList } from "@/components/bookings/passenger-list";

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

interface BookingDetailsProps {
  booking: Booking | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onEdit: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  isOwner: boolean;
  isAdmin: boolean;
  isCancelling?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
}

export function BookingDetails({
  booking,
  open,
  onOpenChange,
  onCancel,
  onEdit,
  onApprove,
  onReject,
  isOwner,
  isAdmin,
  isCancelling,
  isApproving,
  isRejecting,
}: BookingDetailsProps) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;

  if (!booking) return null;

  const startTime = new Date(booking.startTime);
  const endTime = new Date(booking.endTime);
  const isPast = endTime < new Date();
  const isPending = booking.status === "pending";
  const isCancelled = booking.status === "cancelled";
  // Mirrors the server-side rules in bookings.ts: admins can always edit;
  // owners can only edit their own booking while it's still pending and upcoming.
  const canEdit = isAdmin || (isOwner && !isPast && isPending);
  // Mirrors cancel(): owner or admin can cancel anything that isn't already cancelled.
  const canCancel = (isOwner || isAdmin) && !isCancelled;
  const canApproveReject = isAdmin && isPending && !isPast;

  const statusLabels: Record<string, string> = {
    confirmed: t("bookingStatus.confirmed"),
    cancelled: t("bookingStatus.cancelled"),
    completed: t("bookingStatus.completed"),
    pending: t("bookingStatus.pending"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {t("bookingDetails.title")}
            <Badge
              variant={
                booking.status === "confirmed"
                  ? "success"
                  : booking.status === "cancelled"
                  ? "destructive"
                  : booking.status === "pending"
                  ? "warning"
                  : "secondary"
              }
            >
              {statusLabels[booking.status] || booking.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <Calendar className="w-5 h-5 text-brand-600 mt-0.5" />
              <div>
                <p className="text-xs text-zinc-500 font-medium uppercase">{t("bookingDetails.date")}</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {format(startTime, "EEEE, MMM d, yyyy", { locale: dateLocale })}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <Clock className="w-5 h-5 text-brand-600 mt-0.5" />
              <div>
                <p className="text-xs text-zinc-500 font-medium uppercase">{t("bookingDetails.time")}</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {format(startTime, "h:mm a")} - {format(endTime, "h:mm a")}
                </p>
              </div>
            </div>
          </div>

          {/* User info */}
          {booking.user && (
            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <User className="w-5 h-5 text-brand-600 mt-0.5" />
              <div>
                <p className="text-xs text-zinc-500 font-medium uppercase">{t("bookingDetails.bookedBy")}</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {booking.user.firstName} {booking.user.lastName}
                </p>
                {booking.user.email && (
                  <p className="text-xs text-zinc-500">{booking.user.email}</p>
                )}
              </div>
            </div>
          )}

          {/* Purpose */}
          <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
            <FileText className="w-5 h-5 text-brand-600 mt-0.5" />
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase">{t("bookingDetails.purpose")}</p>
              <p className="text-sm text-zinc-900">{booking.purpose}</p>
            </div>
          </div>

          {/* Notes */}
          {booking.notes && (
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <p className="text-xs text-amber-600 font-medium uppercase mb-1">{t("bookingDetails.notes")}</p>
              <p className="text-sm text-amber-900">{booking.notes}</p>
            </div>
          )}

          {/* Contact phone */}
          {booking.contactPhone && (
            <div className="flex items-start gap-3 p-3 bg-zinc-50 rounded-xl">
              <Phone className="w-5 h-5 text-brand-600 mt-0.5" />
              <div>
                <p className="text-xs text-zinc-500 font-medium uppercase">{t("bookingDetails.contact")}</p>
                <p className="text-sm font-semibold text-zinc-900">
                  {booking.contactPhone}
                </p>
              </div>
            </div>
          )}

          {/* Helicopter Registration */}
          {booking.helicopterRegistration && (
            <div className="flex items-start gap-3 p-3 bg-brand-50 rounded-xl">
              <Plane className="w-5 h-5 text-brand-600 mt-0.5" />
              <div>
                <p className="text-xs text-brand-600 font-medium uppercase">{t("bookingDetails.helicopterRegistration")}</p>
                <p className="text-sm font-semibold text-brand-900">
                  {booking.helicopterRegistration}
                </p>
              </div>
            </div>
          )}

          {/* Passengers List */}
          <PassengerList
            bookingId={booking.id}
            isOwnerOrAdmin={isOwner || isAdmin}
          />

          {/* Past booking notice */}
          {isPast && booking.status === "confirmed" && (
            <div className="p-3 bg-zinc-100 rounded-xl text-center text-sm text-zinc-600">
              {t("bookingDetails.bookingPassed")}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
          
          {/* Admin approve/reject buttons for pending bookings */}
          {canApproveReject && (
            <>
              <Button
                type="button"
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={onApprove}
                disabled={isApproving || isRejecting}
              >
                {isApproving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {t("common.approve")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={onReject}
                disabled={isApproving || isRejecting}
              >
                {isRejecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                {t("common.reject")}
              </Button>
            </>
          )}
          
          {/* Edit button: admins always; owners only while pending and upcoming */}
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }}
            >
              {t("common.edit")}
            </Button>
          )}

          {/* Cancel button: owner or admin, on anything not already cancelled */}
          {canCancel && (
            <Button
              type="button"
              variant="destructive"
              onClick={onCancel}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
              {t("bookingDetails.cancelBooking")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

