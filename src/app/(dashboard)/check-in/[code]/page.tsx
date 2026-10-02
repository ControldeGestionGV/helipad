"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldAlert, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/constants";
import { useTranslations } from "@/hooks/use-translations";
import { Spinner } from "@/components/ui/spinner";
import { CheckInPanel } from "@/components/check-in/check-in-panel";

/**
 * Opened by scanning a booking's QR with the phone camera (Reglamento Art. 6.5).
 * Only security and admins can see the booking; anyone else gets a notice.
 */
export default function ScanCheckInPage() {
  const { code } = useParams<{ code: string }>();
  const { data: session } = useSession();
  const { t } = useTranslations();
  const isStaff = session?.user?.role === "admin" || session?.user?.role === "security";

  const { data: detail, isLoading } = trpc.checkIn.getByCode.useQuery(
    { code },
    { enabled: isStaff && !!code }
  );

  if (session && !isStaff) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto h-12 w-12 text-zinc-300" />
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">{t("checkIn.staffOnlyTitle")}</h1>
        <p className="mt-1 text-zinc-500">{t("checkIn.staffOnlyDescription")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("checkIn.title")}</h1>
        <Link href={ROUTES.adminCheckIn} className="flex items-center gap-1 text-sm text-brand-600">
          <ArrowLeft className="h-4 w-4" />
          {t("checkIn.backToList")}
        </Link>
      </div>

      {isLoading || !session ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : !detail ? (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-red-300 bg-red-50 p-6 text-red-800">
          <XCircle className="h-8 w-8 shrink-0" />
          <div>
            <p className="text-lg font-bold">{t("checkIn.unknownCodeTitle")}</p>
            <p className="text-sm">{t("checkIn.unknownCodeDescription")}</p>
          </div>
        </div>
      ) : (
        <CheckInPanel detail={detail} />
      )}
    </div>
  );
}
