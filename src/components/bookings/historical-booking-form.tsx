"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Loader2, Clock, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PassengerManagement, type PassengerFormData } from "@/components/bookings/passenger-management";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { toast } from "@/components/ui/toast";
import { historicalBookingInputSchema } from "@/lib/validations";

const formSchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  purpose: z.string().min(1, "Purpose is required").max(500),
  notes: z.string().max(1000).optional(),
  contactPhone: z.string().max(20).optional(),
  helicopterRegistration: z.string().min(1, "Helicopter registration is required").max(50),
  userId: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const emptyDefaults = (): FormData => ({
  date: format(new Date(), "yyyy-MM-dd"),
  startTime: "",
  endTime: "",
  purpose: "",
  notes: "",
  contactPhone: "",
  helicopterRegistration: "",
  userId: "",
});

export function HistoricalBookingForm() {
  const { t, locale, translateError } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;
  const utils = trpc.useUtils();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [passengers, setPassengers] = useState<PassengerFormData[]>([]);
  const [passengerError, setPassengerError] = useState("");
  const [formError, setFormError] = useState("");
  const [passengerListKey, setPassengerListKey] = useState(0);

  const { data: usersData } = trpc.users.list.useQuery({
    limit: 100,
    isActive: true,
    sortBy: "firstName",
    sortOrder: "asc",
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyDefaults(),
  });

  const createHistorical = trpc.bookings.createHistorical.useMutation({
    onSuccess: () => {
      toast({
        type: "success",
        title: t("historicalBookings.flightLoaded"),
        description: t("historicalBookings.flightLoadedDescription"),
      });
      reset(emptyDefaults());
      setSelectedDate(new Date());
      setPassengers([]);
      setPassengerError("");
      setFormError("");
      setPassengerListKey((key) => key + 1);
      utils.bookings.listAll.invalidate();
    },
    onError: (error) => {
      setFormError(translateError(error.message));
    },
  });

  const handleFormSubmit = (data: FormData) => {
    if (passengers.length === 0) {
      setPassengerError(t("validations.atLeastOnePassenger"));
      return;
    }

    const [year, month, day] = data.date.split("-").map(Number);
    const [startHour, startMinute] = data.startTime.split(":").map(Number);
    const [endHour, endMinute] = data.endTime.split(":").map(Number);

    const startDate = new Date(year, month - 1, day, startHour, startMinute);
    const endDate = new Date(year, month - 1, day, endHour, endMinute);

    const payload = {
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      purpose: data.purpose,
      notes: data.notes || undefined,
      contactPhone: data.contactPhone || undefined,
      helicopterRegistration: data.helicopterRegistration,
      userId: data.userId || undefined,
      passengers,
    };

    const parsed = historicalBookingInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid data");
      return;
    }

    setFormError("");
    createHistorical.mutate(parsed.data);
  };

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      className="space-y-6 bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm"
    >
      {/* Date and Time Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-200 pb-2">
          {t("bookings.dateTime")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date" required>
              {t("bookings.date")}
            </Label>
            <input type="hidden" {...register("date")} />
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-12 !pl-[40px]",
                    !selectedDate && "text-muted-foreground",
                    errors.date && "border-red-500"
                  )}
                >
                  <CalendarIcon className="absolute left-[38px] w-4 h-4 text-zinc-400" />
                  {selectedDate ? format(selectedDate, "PPP", { locale: dateLocale }) : <span>{t("bookings.selectDate")}</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  locale={dateLocale}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setValue("date", format(date, "yyyy-MM-dd"), { shouldValidate: true });
                      setDatePickerOpen(false);
                    }
                  }}
                  disabled={(date) => date > new Date(new Date().setHours(23, 59, 59, 999))}
                />
              </PopoverContent>
            </Popover>
            {errors.date && <p className="text-xs text-red-600">{errors.date.message}</p>}
          </div>

          {/* Start time */}
          <div className="space-y-2">
            <Label htmlFor="startTime" required>
              {t("bookings.startTime")}
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 z-10" />
              <Input
                id="startTime"
                type="time"
                {...register("startTime")}
                error={!!errors.startTime}
                className="pl-10"
              />
            </div>
            {errors.startTime && <p className="text-xs text-red-600">{errors.startTime.message}</p>}
          </div>

          {/* End time */}
          <div className="space-y-2">
            <Label htmlFor="endTime" required>
              {t("bookings.endTime")}
            </Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 z-10" />
              <Input
                id="endTime"
                type="time"
                {...register("endTime")}
                error={!!errors.endTime}
                className="pl-10"
              />
            </div>
            {errors.endTime && <p className="text-xs text-red-600">{errors.endTime.message}</p>}
          </div>
        </div>
      </div>

      {/* Flight Details Section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-200 pb-2">
          {t("bookings.flightDetails")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Purpose */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="purpose" required>
              {t("bookings.purpose")}
            </Label>
            <Input
              id="purpose"
              {...register("purpose")}
              error={!!errors.purpose}
              placeholder={t("bookings.purposePlaceholder")}
            />
            {errors.purpose && <p className="text-xs text-red-600">{errors.purpose.message}</p>}
          </div>

          {/* Helicopter Registration */}
          <div className="space-y-2">
            <Label htmlFor="helicopterRegistration" required>
              {t("bookings.helicopterRegistration")}
            </Label>
            <Input
              id="helicopterRegistration"
              type="text"
              {...register("helicopterRegistration")}
              error={!!errors.helicopterRegistration}
              placeholder={t("bookings.helicopterRegistrationPlaceholder")}
            />
            {errors.helicopterRegistration && (
              <p className="text-xs text-red-600">{errors.helicopterRegistration.message}</p>
            )}
          </div>

          {/* Contact phone */}
          <div className="space-y-2">
            <Label htmlFor="contactPhone">{t("bookings.contactPhoneOptional")}</Label>
            <Input id="contactPhone" type="tel" {...register("contactPhone")} placeholder="+1 (555) 000-0000" />
          </div>

          {/* Assign to user */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="userId">{t("historicalBookings.assignToUser")}</Label>
            <Select id="userId" {...register("userId")}>
              <option value="">{t("historicalBookings.assignToUserDefault")}</option>
              {usersData?.users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName} ({user.username})
                </option>
              ))}
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">{t("bookings.notesOptional")}</Label>
            <textarea
              id="notes"
              {...register("notes")}
              className="flex w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 focus-visible:border-brand-500 transition-colors resize-none"
              rows={3}
              placeholder={t("bookings.notesPlaceholder")}
            />
          </div>
        </div>
      </div>

      {/* Passenger Management */}
      <PassengerManagement
        key={passengerListKey}
        initialPassengers={passengers}
        onPassengersChange={(newPassengers) => {
          setPassengers(newPassengers);
          setPassengerError("");
        }}
        isSubmitting={createHistorical.isPending}
        error={passengerError}
      />

      {formError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{formError}</p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={createHistorical.isPending}>
          {createHistorical.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          {t("historicalBookings.loadFlight")}
        </Button>
      </div>
    </form>
  );
}
