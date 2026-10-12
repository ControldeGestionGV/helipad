"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { MemberPhoto } from "@/components/admin/member-photo";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

const memberFormSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  identificationType: z.enum(["cedula", "passport", "other"]),
  identificationNumber: z.string().min(1, "Identification number is required").max(255),
  membershipStartDate: z.string().min(1, "Start date is required"),
  membershipEndDate: z.string().min(1, "End date is required"),
  notes: z.string().max(500).optional(),
  isActive: z.boolean(),
  memberCode: z.string().min(1, "Member code is required").max(50),
  // Text from the input; "" = no own quota (global setting applies)
  annualUsageLimit: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) <= 999), "0-999"),
});

type MemberFormData = z.infer<typeof memberFormSchema>;

function parseLimit(value: string | undefined): number | null {
  return value && value.trim() !== "" ? Number(value) : null;
}

interface SubMember {
  id: string;
  firstName: string;
  lastName: string;
  identificationNumber: string;
  memberCode: string | null;
  isActive: boolean;
  annualUsageLimit?: number | null;
}

interface Member {
  id: string;
  firstName: string;
  lastName: string;
  identificationType: "cedula" | "passport" | "other";
  identificationNumber: string;
  membershipStartDate: Date | string;
  membershipEndDate: Date | string;
  notes: string | null;
  isActive: boolean;
  memberCode: string | null;
  annualUsageLimit?: number | null;
  aircraft?: Array<{ id: string; registration: string }>;
  subMembers?: SubMember[];
}

interface MemberFormProps {
  member?: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Omit<MemberFormData, "annualUsageLimit"> & { id?: string; annualUsageLimit: number | null }) => void;
  isLoading?: boolean;
}

function toDateInputValue(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function MemberForm({ member, open, onOpenChange, onSubmit, isLoading }: MemberFormProps) {
  const { t } = useTranslations();
  const isEditing = !!member;
  const [newAircraft, setNewAircraft] = useState("");
  const [newSubMember, setNewSubMember] = useState({
    firstName: "",
    lastName: "",
    identificationType: "cedula" as "cedula" | "passport" | "other",
    identificationNumber: "",
    annualUsageLimit: "",
  });

  const utils = trpc.useUtils();
  // Quota usage of the whole membership (titular + group), only when editing
  const usage = trpc.members.getUsage.useQuery({ id: member?.id ?? "" }, { enabled: open && !!member });
  const { data: appSettings } = trpc.settings.getAll.useQuery(undefined, { enabled: open });
  const globalLimit = appSettings?.membershipUsage.annualUsageLimit;
  const usedByMember = new Map((usage.data?.perMember ?? []).map((u) => [u.memberId, u.used]));
  const addAircraft = trpc.members.addAircraft.useMutation({
    onSuccess: () => {
      utils.members.getById.invalidate({ id: member!.id });
      setNewAircraft("");
    },
  });
  const removeAircraft = trpc.members.removeAircraft.useMutation({
    onSuccess: () => utils.members.getById.invalidate({ id: member!.id }),
  });
  const addSubMember = trpc.members.addSubMember.useMutation({
    onSuccess: () => {
      utils.members.getById.invalidate({ id: member!.id });
      setNewSubMember({
        firstName: "",
        lastName: "",
        identificationType: "cedula",
        identificationNumber: "",
        annualUsageLimit: "",
      });
      utils.members.getUsage.invalidate();
    },
  });
  // Sub-member changes (deactivate, individual cap) save immediately, outside the main form
  const updateSubMember = trpc.members.update.useMutation({
    onSuccess: () => {
      utils.members.getById.invalidate({ id: member!.id });
      utils.members.getUsage.invalidate();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberFormSchema),
  });

  useEffect(() => {
    if (open) {
      reset(
        member
          ? {
              firstName: member.firstName,
              lastName: member.lastName,
              identificationType: member.identificationType,
              identificationNumber: member.identificationNumber,
              membershipStartDate: toDateInputValue(member.membershipStartDate),
              membershipEndDate: toDateInputValue(member.membershipEndDate),
              notes: member.notes ?? "",
              isActive: member.isActive,
              memberCode: member.memberCode ?? "",
              annualUsageLimit: member.annualUsageLimit != null ? String(member.annualUsageLimit) : "",
            }
          : {
              firstName: "",
              lastName: "",
              identificationType: "cedula",
              identificationNumber: "",
              membershipStartDate: new Date().toISOString().slice(0, 10),
              membershipEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10),
              notes: "",
              isActive: true,
              memberCode: "",
              annualUsageLimit: "",
            }
      );
    }
  }, [member, open, reset]);

  const handleFormSubmit = (data: MemberFormData) => {
    const submitData = {
      ...data,
      membershipStartDate: new Date(data.membershipStartDate).toISOString(),
      membershipEndDate: new Date(data.membershipEndDate).toISOString(),
      annualUsageLimit: parseLimit(data.annualUsageLimit),
      ...(isEditing ? { id: member!.id } : {}),
    };
    onSubmit(submitData);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("memberForm.editTitle") : t("memberForm.createTitle")}</DialogTitle>
          <DialogDescription>
            {isEditing ? t("memberForm.editDescription") : t("memberForm.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <DialogBody className="space-y-4">
            {isEditing && (
              <div className="space-y-2">
                <Label>{t("memberPhoto.title")}</Label>
                <MemberPhoto memberId={member!.id} size="lg" editable />
                <p className="text-xs text-zinc-500">{t("memberPhoto.hint")}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" required>
                  {t("memberForm.firstName")}
                </Label>
                <Input id="firstName" {...register("firstName")} error={!!errors.firstName} />
                {errors.firstName && <p className="text-xs text-red-600">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" required>
                  {t("memberForm.lastName")}
                </Label>
                <Input id="lastName" {...register("lastName")} error={!!errors.lastName} />
                {errors.lastName && <p className="text-xs text-red-600">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="memberCode" required>
                {t("memberForm.memberCode")}
              </Label>
              <Input
                id="memberCode"
                placeholder={t("memberForm.memberCodePlaceholder")}
                {...register("memberCode")}
                error={!!errors.memberCode}
              />
              {errors.memberCode && <p className="text-xs text-red-600">{errors.memberCode.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="identificationType" required>
                  {t("memberForm.identificationType")}
                </Label>
                <Select id="identificationType" {...register("identificationType")}>
                  <option value="cedula">{t("passengers.cedula")}</option>
                  <option value="passport">{t("passengers.passport")}</option>
                  <option value="other">{t("passengers.other")}</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identificationNumber" required>
                  {t("memberForm.identificationNumber")}
                </Label>
                <Input
                  id="identificationNumber"
                  {...register("identificationNumber")}
                  error={!!errors.identificationNumber}
                />
                {errors.identificationNumber && (
                  <p className="text-xs text-red-600">{errors.identificationNumber.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="membershipStartDate" required>
                  {t("memberForm.membershipStartDate")}
                </Label>
                <Input
                  id="membershipStartDate"
                  type="date"
                  {...register("membershipStartDate")}
                  error={!!errors.membershipStartDate}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="membershipEndDate" required>
                  {t("memberForm.membershipEndDate")}
                </Label>
                <Input
                  id="membershipEndDate"
                  type="date"
                  {...register("membershipEndDate")}
                  error={!!errors.membershipEndDate}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="annualUsageLimit">{t("memberForm.membershipQuota")}</Label>
              <Input
                id="annualUsageLimit"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                placeholder={globalLimit !== undefined ? t("memberForm.quotaGlobalPlaceholder", { limit: globalLimit }) : ""}
                {...register("annualUsageLimit")}
                error={!!errors.annualUsageLimit}
              />
              <p className="text-xs text-zinc-500">{t("memberForm.membershipQuotaHint")}</p>
              {isEditing && usage.data && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-600">{t("memberForm.quotaUsed")}</span>
                    <span
                      className={`font-semibold ${usage.data.used > usage.data.limit ? "text-red-600" : "text-zinc-900"}`}
                    >
                      {usage.data.used} / {usage.data.limit}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${usage.data.used > usage.data.limit ? "bg-red-500" : "bg-brand-500"}`}
                      style={{ width: `${Math.min(100, (usage.data.used / Math.max(usage.data.limit, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="isActive">{t("adminMembers.tableHeaders.status")}</Label>
                <Select id="isActive" {...register("isActive", { setValueAs: (v) => v === "true" })}>
                  <option value="true">{t("adminMembers.active")}</option>
                  <option value="false">{t("adminMembers.inactive")}</option>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">{t("memberForm.notes")}</Label>
              <Input id="notes" {...register("notes")} />
            </div>

            {isEditing && (
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <Label>{t("memberForm.aircraftSection")}</Label>
                <div className="flex flex-wrap gap-2">
                  {member!.aircraft && member!.aircraft.length > 0 ? (
                    member!.aircraft.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 text-sm px-2.5 py-1 rounded-full"
                      >
                        {a.registration}
                        <button
                          type="button"
                          onClick={() => removeAircraft.mutate({ id: a.id })}
                          className="text-zinc-400 hover:text-red-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-400">{t("memberForm.noAircraft")}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("memberForm.aircraftPlaceholder")}
                    value={newAircraft}
                    onChange={(e) => setNewAircraft(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!newAircraft.trim() || addAircraft.isPending}
                    onClick={() =>
                      addAircraft.mutate({ memberId: member!.id, registration: newAircraft.trim() })
                    }
                  >
                    <Plus className="w-4 h-4" />
                    {t("memberForm.addAircraft")}
                  </Button>
                </div>
              </div>
            )}

            {isEditing && (
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <Label>{t("memberForm.groupSection")}</Label>
                <div className="space-y-2">
                  {member!.subMembers && member!.subMembers.length > 0 ? (
                    member!.subMembers.map((s) => (
                      <div
                        key={s.id}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                          s.isActive ? "bg-zinc-50 text-zinc-700" : "bg-zinc-50 text-zinc-400 line-through"
                        }`}
                      >
                        <MemberPhoto memberId={s.id} size="sm" editable={s.isActive} />
                        <span className="flex-1 min-w-0 truncate">
                          {s.memberCode ? `${s.memberCode} · ` : ""}
                          {s.firstName} {s.lastName}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500">
                          {t("memberForm.subMemberUsed", { count: usedByMember.get(s.id) ?? 0 })}
                        </span>
                        {s.isActive && (
                          <>
                            <Input
                              key={`${s.id}-${s.annualUsageLimit ?? ""}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={999}
                              className="h-8 w-24 shrink-0 text-xs"
                              defaultValue={s.annualUsageLimit ?? ""}
                              placeholder={t("memberForm.individualCapPlaceholder")}
                              title={t("memberForm.individualCapHint")}
                              onBlur={(e) => {
                                const value = e.target.value.trim();
                                const next = value === "" ? null : Number(value);
                                if (next !== (s.annualUsageLimit ?? null) && (next === null || (Number.isInteger(next) && next >= 0 && next <= 999))) {
                                  updateSubMember.mutate({ id: s.id, annualUsageLimit: next });
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => updateSubMember.mutate({ id: s.id, isActive: false })}
                              className="shrink-0 text-zinc-400 hover:text-red-600 cursor-pointer"
                              title={t("memberForm.deactivateSubMember")}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-zinc-400">{t("memberForm.noSubMembers")}</p>
                  )}
                  {member!.subMembers && member!.subMembers.length > 0 && (
                    <p className="text-xs text-zinc-500">{t("memberForm.individualCapHint")}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={t("memberForm.firstName")}
                    value={newSubMember.firstName}
                    onChange={(e) => setNewSubMember((s) => ({ ...s, firstName: e.target.value }))}
                  />
                  <Input
                    placeholder={t("memberForm.lastName")}
                    value={newSubMember.lastName}
                    onChange={(e) => setNewSubMember((s) => ({ ...s, lastName: e.target.value }))}
                  />
                  <Select
                    value={newSubMember.identificationType}
                    onChange={(e) =>
                      setNewSubMember((s) => ({
                        ...s,
                        identificationType: e.target.value as "cedula" | "passport" | "other",
                      }))
                    }
                  >
                    <option value="cedula">{t("passengers.cedula")}</option>
                    <option value="passport">{t("passengers.passport")}</option>
                    <option value="other">{t("passengers.other")}</option>
                  </Select>
                  <Input
                    placeholder={t("memberForm.identificationNumber")}
                    value={newSubMember.identificationNumber}
                    onChange={(e) => setNewSubMember((s) => ({ ...s, identificationNumber: e.target.value }))}
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={999}
                    className="col-span-2"
                    placeholder={t("memberForm.newSubMemberCapPlaceholder")}
                    value={newSubMember.annualUsageLimit}
                    onChange={(e) => setNewSubMember((s) => ({ ...s, annualUsageLimit: e.target.value }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    !newSubMember.firstName.trim() ||
                    !newSubMember.lastName.trim() ||
                    !newSubMember.identificationNumber.trim() ||
                    addSubMember.isPending
                  }
                  onClick={() =>
                    addSubMember.mutate({
                      parentMemberId: member!.id,
                      firstName: newSubMember.firstName.trim(),
                      lastName: newSubMember.lastName.trim(),
                      identificationType: newSubMember.identificationType,
                      identificationNumber: newSubMember.identificationNumber.trim(),
                      annualUsageLimit: parseLimit(newSubMember.annualUsageLimit),
                    })
                  }
                >
                  <Plus className="w-4 h-4" />
                  {t("memberForm.addSubMember")}
                </Button>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? t("memberForm.updateMember") : t("memberForm.createMember")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
