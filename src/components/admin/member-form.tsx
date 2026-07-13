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
});

type MemberFormData = z.infer<typeof memberFormSchema>;

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
  aircraft?: Array<{ id: string; registration: string }>;
}

interface MemberFormProps {
  member?: Member | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: MemberFormData & { id?: string }) => void;
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

  const utils = trpc.useUtils();
  const addAircraft = trpc.members.addAircraft.useMutation({
    onSuccess: () => {
      utils.members.getById.invalidate({ id: member!.id });
      setNewAircraft("");
    },
  });
  const removeAircraft = trpc.members.removeAircraft.useMutation({
    onSuccess: () => utils.members.getById.invalidate({ id: member!.id }),
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
            }
      );
    }
  }, [member, open, reset]);

  const handleFormSubmit = (data: MemberFormData) => {
    const submitData = {
      ...data,
      membershipStartDate: new Date(data.membershipStartDate).toISOString(),
      membershipEndDate: new Date(data.membershipEndDate).toISOString(),
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
