"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

const vipFormSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  identificationType: z.enum(["cedula", "passport", "other"]),
  identificationNumber: z.string().min(1, "Identification number is required").max(255),
  notes: z.string().max(500).optional(),
  isActive: z.boolean(),
});

type VipFormData = z.infer<typeof vipFormSchema>;

interface Vip {
  id: string;
  firstName: string;
  lastName: string;
  identificationType: "cedula" | "passport" | "other";
  identificationNumber: string;
  notes: string | null;
  isActive: boolean;
}

interface VipFormProps {
  vip?: Vip | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: VipFormData & { id?: string }) => void;
  isLoading?: boolean;
}

export function VipForm({ vip, open, onOpenChange, onSubmit, isLoading }: VipFormProps) {
  const { t } = useTranslations();
  const isEditing = !!vip;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VipFormData>({ resolver: zodResolver(vipFormSchema) });

  useEffect(() => {
    if (open) {
      reset(
        vip
          ? { ...vip, notes: vip.notes ?? "" }
          : {
              firstName: "",
              lastName: "",
              identificationType: "cedula",
              identificationNumber: "",
              notes: "",
              isActive: true,
            }
      );
    }
  }, [vip, open, reset]);

  const handleFormSubmit = (data: VipFormData) => {
    onSubmit(isEditing ? { ...data, id: vip!.id } : data);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("vipForm.editTitle") : t("vipForm.createTitle")}</DialogTitle>
          <DialogDescription>
            {isEditing ? t("vipForm.editDescription") : t("vipForm.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" required>
                  {t("vipForm.firstName")}
                </Label>
                <Input id="firstName" {...register("firstName")} error={!!errors.firstName} />
                {errors.firstName && <p className="text-xs text-red-600">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" required>
                  {t("vipForm.lastName")}
                </Label>
                <Input id="lastName" {...register("lastName")} error={!!errors.lastName} />
                {errors.lastName && <p className="text-xs text-red-600">{errors.lastName.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="identificationType" required>
                  {t("vipForm.identificationType")}
                </Label>
                <Select id="identificationType" {...register("identificationType")}>
                  <option value="cedula">{t("passengers.cedula")}</option>
                  <option value="passport">{t("passengers.passport")}</option>
                  <option value="other">{t("passengers.other")}</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="identificationNumber" required>
                  {t("vipForm.identificationNumber")}
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
              <Label htmlFor="notes">{t("vipForm.notes")}</Label>
              <Input id="notes" {...register("notes")} />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? t("vipForm.updateVip") : t("vipForm.createVip")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
