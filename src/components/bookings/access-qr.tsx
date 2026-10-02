"use client";

import { QrCode } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Spinner } from "@/components/ui/spinner";

/** Access QR of a confirmed booking (Reglamento Art. 6.5), shown to its owner. */
export function AccessQr({ bookingId }: { bookingId: string }) {
  const { t } = useTranslations();
  const { data, isLoading } = trpc.checkIn.myAccessCode.useQuery({ bookingId });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="rounded-xl border border-zinc-200 p-4 text-center">
      <p className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold text-zinc-700">
        <QrCode className="h-4 w-4" />
        {t("checkIn.myQrTitle")}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic PNG from our API route */}
      <img
        src={`/api/bookings/qr/${data.code}`}
        alt="QR"
        width={200}
        height={200}
        className="mx-auto"
      />
      <p className="mt-3 text-xs text-zinc-500">{t("checkIn.myQrInstructions")}</p>
    </div>
  );
}
