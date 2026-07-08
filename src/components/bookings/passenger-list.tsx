"use client";

import { Users, IdCard, User, Image as ImageIcon } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import Image from "next/image";

interface PassengerListProps {
  bookingId: string;
  isOwnerOrAdmin: boolean;
}

export function PassengerList({ bookingId, isOwnerOrAdmin }: PassengerListProps) {
  const { t } = useTranslations();

  // Only fetch if user is owner or admin
  const { data: passengers, isLoading } = trpc.passengers.getByBookingId.useQuery(
    { bookingId },
    { enabled: isOwnerOrAdmin }
  );

  if (!isOwnerOrAdmin) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-zinc-50 rounded-xl flex items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (!passengers || passengers.length === 0) {
    return (
      <div className="p-4 bg-zinc-50 rounded-xl">
        <p className="text-sm text-zinc-500 text-center">
          {t("passengers.noPassengers")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-brand-600" />
        <h4 className="text-sm font-semibold text-zinc-900">
          {t("passengers.title")} ({passengers.length})
        </h4>
      </div>

      <div className="space-y-2">
        {passengers.map((passenger, index) => (
          <div
            key={passenger.id}
            className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-900">
                  {passenger.name}
                </span>
              </div>
              <span className="text-xs text-zinc-500">
                #{index + 1}
              </span>
            </div>

            <div className="flex items-start gap-2 text-xs">
              <IdCard className="w-3.5 h-3.5 text-zinc-400 mt-0.5" />
              <div>
                <span className="text-zinc-500">
                  {passenger.identificationType === "cedula"
                    ? t("passengers.cedula")
                    : passenger.identificationType === "passport"
                    ? t("passengers.passport")
                    : t("passengers.other")}
                  :
                </span>{" "}
                <span className="text-zinc-900 font-medium">
                  {passenger.identificationNumber}
                </span>
              </div>
            </div>

            {passenger.idPhotoBase64 && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="text-xs text-zinc-500">
                    {t("passengers.idPhoto")}
                  </span>
                </div>
                <div className="relative w-full h-32 bg-zinc-100 rounded-lg overflow-hidden">
                  <Image
                    src={passenger.idPhotoBase64}
                    alt={`ID photo for ${passenger.name}`}
                    fill
                    className="object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
