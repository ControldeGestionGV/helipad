"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { ROUTES } from "@/lib/constants";
import { useTranslations } from "@/hooks/use-translations";
import { Spinner } from "@/components/ui/spinner";
import { CheckInPanel } from "@/components/check-in/check-in-panel";

/**
 * Opened by scanning a booking's QR with the phone camera (Reglamento Art. 6.5).
 * Any signed-in user can verify (security, reception, the staff who book).
 */
export default function ScanCheckInPage() {
  const { code } = useParams<{ code: string }>();
  const { data: session } = useSession();
  const { t } = useTranslations();

  const { data: detail, isLoading } = trpc.checkIn.getByCode.useQuery({ code }, { enabled: !!code });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("checkIn.title")}</h1>
        <Link href={ROUTES.checkIn} className="flex items-center gap-1 text-sm text-brand-600">
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
