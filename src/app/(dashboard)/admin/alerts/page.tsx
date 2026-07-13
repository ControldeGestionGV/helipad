"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export default function AlertsPage() {
  const { t } = useTranslations();
  const { data: session } = useSession();
  const isReadOnly = session?.user?.role === "security";

  const utils = trpc.useUtils();
  const { data: alerts, isLoading } = trpc.alerts.list.useQuery({});

  const acknowledge = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => utils.alerts.list.invalidate(),
  });

  const openAlerts = (alerts ?? []).filter((a) => a.status === "open");
  const acknowledgedAlerts = (alerts ?? []).filter((a) => a.status === "acknowledged");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("adminAlerts.title")}</h1>
        <p className="text-zinc-500 mt-1">{t("adminAlerts.description")}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
