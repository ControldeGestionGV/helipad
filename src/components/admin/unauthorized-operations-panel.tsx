"use client";

import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

const emptyForm = () => ({
  occurredAt: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
  helicopterRegistration: "",
  pilotName: "",
  kind: "no_booking" as "no_booking" | "outside_slot",
  isEmergency: false,
  description: "",
});

/**
 * Reglamento Art. 24.3: operations without a confirmed booking or outside their slot.
 * Security and admins record them; only admins mark them as reviewed.
 */
export function UnauthorizedOperationsPanel({ canReview }: { canReview: boolean }) {
  const { t, translateError } = useTranslations();
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: operations, isLoading } = trpc.unauthorizedOperations.list.useQuery();

  const create = trpc.unauthorizedOperations.create.useMutation({
    onSuccess: () => {
      utils.unauthorizedOperations.list.invalidate();
      setForm(emptyForm());
      setShowForm(false);
      toast({ type: "success", title: t("adminAlerts.unauthorized.saved") });
    },
    onError: (error) => {
      toast({ type: "error", title: t("errors.generic"), description: translateError(error.message) });
    },
  });

  const markReviewed = trpc.unauthorizedOperations.markReviewed.useMutation({
    onSuccess: () => utils.unauthorizedOperations.list.invalidate(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      occurredAt: new Date(form.occurredAt).toISOString(),
      helicopterRegistration: form.helicopterRegistration,
      pilotName: form.pilotName || undefined,
      kind: form.kind,
      isEmergency: form.isEmergency,
      description: form.description || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-zinc-500 max-w-2xl">{t("adminAlerts.unauthorized.intro")}</p>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="shrink-0">
            <Plus className="w-4 h-4" />
            {t("adminAlerts.unauthorized.register")}
          </Button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm md:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="uo-occurred">{t("adminAlerts.unauthorized.occurredAt")}</Label>
            <Input
              id="uo-occurred"
              type="datetime-local"
              required
              value={form.occurredAt}
              onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uo-registration">{t("adminAlerts.unauthorized.registration")}</Label>
            <Input
              id="uo-registration"
              required
              value={form.helicopterRegistration}
              onChange={(e) => setForm({ ...form, helicopterRegistration: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uo-pilot">{t("adminAlerts.unauthorized.pilotName")}</Label>
            <Input
              id="uo-pilot"
              value={form.pilotName}
              onChange={(e) => setForm({ ...form, pilotName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uo-kind">{t("adminAlerts.unauthorized.kind")}</Label>
            <Select
              id="uo-kind"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as typeof form.kind })}
            >
              <option value="no_booking">{t("adminAlerts.unauthorized.kindNoBooking")}</option>
              <option value="outside_slot">{t("adminAlerts.unauthorized.kindOutsideSlot")}</option>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="uo-description">{t("adminAlerts.unauthorized.description")}</Label>
            <textarea
              id="uo-description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="flex w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 focus-visible:border-brand-500 transition-colors resize-none"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-3 md:col-span-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isEmergency}
              onChange={(e) => setForm({ ...form, isEmergency: e.target.checked })}
              className="h-5 w-5 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <span className="text-sm text-zinc-800">{t("adminAlerts.unauthorized.isEmergency")}</span>
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              {t("adminAlerts.unauthorized.cancel")}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {t("adminAlerts.unauthorized.save")}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adminAlerts.unauthorized.occurredAt")}</TableHead>
              <TableHead>{t("adminAlerts.unauthorized.registration")}</TableHead>
              <TableHead>{t("adminAlerts.unauthorized.kind")}</TableHead>
              <TableHead>{t("adminAlerts.tableHeaders.status")}</TableHead>
              {canReview && <TableHead className="text-right">{t("adminAlerts.tableHeaders.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!operations?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
                  {t("adminAlerts.unauthorized.empty")}
                </TableCell>
              </TableRow>
            ) : (
              operations.map((op) => (
                <TableRow key={op.id}>
                  <TableCell className="text-sm text-zinc-700">
                    {new Date(op.occurredAt).toLocaleString("es-DO")}
                    {op.reportedByUser && (
                      <p className="text-xs text-zinc-400 mt-1">
                        {t("adminAlerts.unauthorized.reportedBy")}: {op.reportedByUser.firstName}{" "}
                        {op.reportedByUser.lastName}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-zinc-900">
                    <div className="flex items-center gap-2">
                      {op.status === "open" && !op.isEmergency && (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      {op.helicopterRegistration}
                    </div>
                    {op.pilotName && <p className="text-xs font-normal text-zinc-500">{op.pilotName}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-700">
                    {op.kind === "no_booking"
                      ? t("adminAlerts.unauthorized.kindNoBooking")
                      : t("adminAlerts.unauthorized.kindOutsideSlot")}
                    {op.isEmergency && (
                      <Badge variant="secondary" className="ml-2">
                        {t("adminAlerts.unauthorized.emergencyBadge")}
                      </Badge>
                    )}
                    {op.description && <p className="text-xs text-zinc-500 mt-1">{op.description}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={op.status === "open" ? "warning" : "success"}>
                      {op.status === "open" ? t("adminAlerts.open") : t("adminAlerts.acknowledged")}
                    </Badge>
                    {op.status === "reviewed" && op.reviewedByUser && (
                      <p className="text-xs text-zinc-400 mt-1">
                        {t("adminAlerts.acknowledgedBy")}: {op.reviewedByUser.firstName} {op.reviewedByUser.lastName}
                      </p>
                    )}
                  </TableCell>
                  {canReview && (
                    <TableCell className="text-right">
                      {op.status === "open" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markReviewed.mutate({ id: op.id })}
                          disabled={markReviewed.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {t("adminAlerts.unauthorized.markReviewed")}
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
