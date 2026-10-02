"use client";

import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "@/hooks/use-translations";

interface RuleWarningBadgesProps {
  ruleWarnings?: string[] | null;
  lateCancellation?: boolean | null;
}

/** Excepciones al Reglamento registradas en la reserva. Informativas, no bloquean nada. */
export function RuleWarningBadges({ ruleWarnings, lateCancellation }: RuleWarningBadgesProps) {
  const { t } = useTranslations();

  if (!ruleWarnings?.length && !lateCancellation) return null;

  return (
    <>
      {ruleWarnings?.map((warning) => (
        <Badge key={warning} variant="warning">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t(`ruleWarnings.${warning}`)}
        </Badge>
      ))}
      {lateCancellation && (
        <Badge variant="warning">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {t("ruleWarnings.late_cancellation")}
        </Badge>
      )}
    </>
  );
}
