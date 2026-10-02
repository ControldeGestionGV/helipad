"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { cn, formatDate } from "@/lib/utils";

export default function AlertsPage() {
  const { t } = useTranslations();
  const { data: session } = useSession();
  const isReadOnly = session?.user?.role === "security";

  const [tab, setTab] = useState<"misuse" | "usageOverage">("misuse");

  const utils = trpc.useUtils();

  const { data: alerts, isLoading: isMisuseLoading } = trpc.alerts.list.useQuery(
    {},
    { enabled: tab === "misuse" }
  );
  const acknowledge = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => utils.alerts.list.invalidate(),
  });

  const { data: usageAlerts, isLoading: isUsageLoading } = trpc.usageAlerts.list.useQuery(
    {},
    { enabled: tab === "usageOverage" }
  );
  const acknowledgeUsage = trpc.usageAlerts.acknowledge.useMutation({
    onSuccess: () => utils.usageAlerts.list.invalidate(),
  });

  const openAlerts = (alerts ?? []).filter((a) => a.status === "open");
  const acknowledgedAlerts = (alerts ?? []).filter((a) => a.status === "acknowledged");

  const openUsageAlerts = (usageAlerts ?? []).filter((a) => a.status === "open");
  const acknowledgedUsageAlerts = (usageAlerts ?? []).filter((a) => a.status === "acknowledged");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("adminAlerts.title")}</h1>
        <p className="text-zinc-500 mt-1">{t("adminAlerts.description")}</p>
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        {(["misuse", "usageOverage"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px cursor-pointer transition-colors",
              tab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            )}
          >
            {key === "misuse" ? t("adminAlerts.tabMisuse") : t("adminAlerts.tabUsageOverage")}
          </button>
        ))}
      </div>

      {tab === "misuse" ? (
        isMisuseLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adminAlerts.tableHeaders.registration")}</TableHead>
                <TableHead>{t("adminAlerts.tableHeaders.count")}</TableHead>
                <TableHead>{t("adminAlerts.tableHeaders.window")}</TableHead>
                <TableHead>{t("adminAlerts.tableHeaders.status")}</TableHead>
                {!isReadOnly && <TableHead className="text-right">{t("adminAlerts.tableHeaders.actions")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {openAlerts.length === 0 && acknowledgedAlerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
                    {t("adminAlerts.noAlerts")}
                  </TableCell>
                </TableRow>
              ) : (
                [...openAlerts, ...acknowledgedAlerts].map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium text-zinc-900 flex items-center gap-2">
                      {alert.status === "open" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                      {alert.helicopterRegistration}
                    </TableCell>
                    <TableCell className="text-zinc-700 font-semibold">{alert.triggerCount}</TableCell>
                    <TableCell className="text-zinc-600 text-sm">
                      {formatDate(alert.windowStart)} - {formatDate(alert.windowEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={alert.status === "open" ? "warning" : "success"}>
                        {alert.status === "open" ? t("adminAlerts.open") : t("adminAlerts.acknowledged")}
                      </Badge>
                      {alert.status === "acknowledged" && alert.acknowledgedByUser && (
                        <p className="text-xs text-zinc-400 mt-1">
                          {t("adminAlerts.acknowledgedBy")}: {alert.acknowledgedByUser.firstName}{" "}
                          {alert.acknowledgedByUser.lastName}
                        </p>
                      )}
                    </TableCell>
                    {!isReadOnly && (
                      <TableCell className="text-right">
                        {alert.status === "open" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledge.mutate({ id: alert.id })}
                            disabled={acknowledge.isPending}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            {t("adminAlerts.acknowledge")}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )
      ) : isUsageLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminAlerts.usageOverage.tableHeaders.member")}</TableHead>
              <TableHead>{t("adminAlerts.usageOverage.tableHeaders.count")}</TableHead>
              <TableHead>{t("adminAlerts.usageOverage.tableHeaders.period")}</TableHead>
              <TableHead>{t("adminAlerts.tableHeaders.status")}</TableHead>
              {!isReadOnly && <TableHead className="text-right">{t("adminAlerts.tableHeaders.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {openUsageAlerts.length === 0 && acknowledgedUsageAlerts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
                  {t("adminAlerts.noAlerts")}
                </TableCell>
              </TableRow>
            ) : (
              [...openUsageAlerts, ...acknowledgedUsageAlerts].map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="font-medium text-zinc-900 flex items-center gap-2">
                    {alert.status === "open" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                    {alert.member ? (
                      <>
                        {alert.member.memberCode ? `${alert.member.memberCode} · ` : ""}
                        {alert.member.firstName} {alert.member.lastName}
                      </>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-zinc-700 font-semibold">{alert.usageCount}</TableCell>
                  <TableCell className="text-zinc-600 text-sm">
                    {formatDate(alert.periodStart)} - {formatDate(alert.periodEnd)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={alert.status === "open" ? "warning" : "success"}>
                      {alert.status === "open" ? t("adminAlerts.open") : t("adminAlerts.acknowledged")}
                    </Badge>
                    {alert.status === "acknowledged" && alert.acknowledgedByUser && (
                      <p className="text-xs text-zinc-400 mt-1">
                        {t("adminAlerts.acknowledgedBy")}: {alert.acknowledgedByUser.firstName}{" "}
                        {alert.acknowledgedByUser.lastName}
                      </p>
                    )}
                  </TableCell>
                  {!isReadOnly && (
                    <TableCell className="text-right">
                      {alert.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acknowledgeUsage.mutate({ id: alert.id })}
                          disabled={acknowledgeUsage.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {t("adminAlerts.acknowledge")}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
