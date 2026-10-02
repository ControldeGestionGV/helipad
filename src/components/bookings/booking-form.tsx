"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addMinutes } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Loader2, Clock, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { generateTimeSlots } from "@/hooks/use-calendar";
import { useTranslations } from "@/hooks/use-translations";
import { trpc } from "@/lib/trpc";
import { PassengerManagement, type PassengerFormData } from "@/components/bookings/passenger-management";

const SLOT_INTERVAL = 15;
// Rango seleccionable. Es mas amplio que el horario del Reglamento a proposito: las reservas
// fuera de horario se permiten y quedan marcadas como excepcion, no se bloquean.
const SELECTABLE_START_HOUR = 6;
const SELECTABLE_END_HOUR = 22;
// Fallbacks mientras cargan los settings (Reglamento Art. 5.1, 6.1 y 19.1)
const DEFAULT_HOURS = { start: "08:00", end: "18:00" };
const DEFAULT_DURATION = 30;
const DEFAULT_NOTICE = 30;

function hhmmToMinutes(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

const bookingFormSchema = z.object({
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  purpose: z.string().min(1, "Purpose is required").max(500),
  notes: z.string().max(1000).optional(),
  contactPhone: z.string().max(20).optional(),
  helicopterRegistration: z.string().min(1, "Helicopter registration is required").max(50),
  pilotName: z.string().max(255).optional(),
  // Kept as string from the input; parsed on submit. Empty = not declared.
  declaredPeople: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 99), "1-99"),
});

type BookingFormData = z.infer<typeof bookingFormSchema>;

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getSlotValue(hour: number, minute: number) {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

// Sugiere el primer horario que cumple el Reglamento; si hoy ya no queda ninguno, el proximo
// horario futuro (quedara marcado como excepcion, pero se puede reservar).
function getNextAvailableSlot(
  date: Date,
  openMinutes: number,
  lastInHoursMinutes: number,
  noticeMinutes: number,
  initialHour?: number,
  initialMinute?: number
) {
  if (initialHour !== undefined && initialMinute !== undefined) {
    return getSlotValue(initialHour, initialMinute);
  }

  if (!isSameLocalDate(date, new Date())) {
    return getSlotValue(Math.floor(openMinutes / 60), openMinutes % 60);
  }

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Next slot strictly after the given minute
  const nextSlotAfter = (m: number) => Math.floor(m / SLOT_INTERVAL) * SLOT_INTERVAL + SLOT_INTERVAL;
  let slot = Math.max(nextSlotAfter(nowMinutes + noticeMinutes - 1), openMinutes);
  if (slot > lastInHoursMinutes) {
    slot = nextSlotAfter(nowMinutes);
  }
  slot = Math.min(slot, SELECTABLE_END_HOUR * 60 - SLOT_INTERVAL);

  return getSlotValue(Math.floor(slot / 60), slot % 60);
}

interface EditingBooking {
  id: string;
  startTime: Date;
  endTime: Date;
  purpose: string;
  notes?: string | null;
  contactPhone?: string | null;
  helicopterRegistration?: string | null;
  pilotName?: string | null;
  declaredPeople?: number | null;
}

interface BookingFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    startTime: string;
    endTime: string;
    purpose: string;
    notes?: string;
    contactPhone?: string;
    helicopterRegistration: string;
    pilotName?: string | null;
    declaredPeople?: number | null;
    passengers: PassengerFormData[];
  }) => void;
  isLoading?: boolean;
  initialDate?: Date;
  initialHour?: number;
  initialMinute?: number;
  editingBooking?: EditingBooking | null;
  initialPassengers?: PassengerFormData[];
}

export function BookingForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  initialDate,
  initialHour,
  initialMinute,
  editingBooking,
  initialPassengers = [],
}: BookingFormProps) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;
  const { data: settings } = trpc.settings.getAll.useQuery(undefined, { enabled: open });
  const operationalHours = settings?.operationalHours ?? DEFAULT_HOURS;
  const duration = settings?.maxBookingDuration ?? DEFAULT_DURATION;
  const noticeMinutes = settings?.minBookingNotice ?? DEFAULT_NOTICE;
  const blackoutDates = useMemo(() => settings?.blackoutDates ?? [], [settings?.blackoutDates]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate || new Date());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [passengers, setPassengers] = useState<PassengerFormData[]>(initialPassengers);
  const [passengerError, setPassengerError] = useState<string>("");
  
  // 15-minute start times. Slots outside operating hours stay selectable but are labelled.
  const openMinutes = hhmmToMinutes(operationalHours.start);
  const closeMinutes = hhmmToMinutes(operationalHours.end);
  const lastInHoursMinutes = closeMinutes - duration;
  const timeSlots = useMemo(
    () =>
      generateTimeSlots(
        Math.min(SELECTABLE_START_HOUR, Math.floor(openMinutes / 60)),
        Math.max(SELECTABLE_END_HOUR, Math.ceil(closeMinutes / 60)),
        SLOT_INTERVAL
      ),
    [openMinutes, closeMinutes]
  );
  const isOutsideHours = (minutes: number) => minutes < openMinutes || minutes > lastInHoursMinutes;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingFormSchema),
  });

  // Reset form when dialog opens with initial values or editing booking
  useEffect(() => {
    if (open) {
      if (editingBooking) {
        // Pre-fill form with existing booking data
        const startDate = new Date(editingBooking.startTime);
        setSelectedDate(startDate);

        reset({
          date: format(startDate, "yyyy-MM-dd"),
          startTime: `${startDate.getHours().toString().padStart(2, "0")}:${startDate.getMinutes().toString().padStart(2, "0")}`,
          purpose: editingBooking.purpose,
          notes: editingBooking.notes || "",
          contactPhone: editingBooking.contactPhone || "",
          helicopterRegistration: editingBooking.helicopterRegistration || "",
          pilotName: editingBooking.pilotName || "",
          declaredPeople: editingBooking.declaredPeople ? String(editingBooking.declaredPeople) : "",
        });
        setPassengers(initialPassengers.length > 0 ? initialPassengers : []);
      } else {
        // New booking - use initial values
        const date = initialDate || new Date();
        setSelectedDate(date);

        reset({
          date: format(date, "yyyy-MM-dd"),
          startTime: getNextAvailableSlot(
            date,
            openMinutes,
            lastInHoursMinutes,
            noticeMinutes,
            initialHour,
            initialMinute
          ),
          purpose: "",
          notes: "",
          contactPhone: "",
          helicopterRegistration: "",
          pilotName: "",
          declaredPeople: "",
        });
        setPassengers([]);
      }
      setPassengerError("");
    } else {
      setPassengers([]);
      setPassengerError("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingBooking?.id]);

  const watchedDate = watch("date");
  const watchedStartTime = watch("startTime");

  // Calculate end time (fixed slot duration)
  const endTime = useMemo(() => {
    if (!watchedDate || !watchedStartTime) return null;

    const [hours, minutes] = watchedStartTime.split(":").map(Number);
    const [year, month, day] = watchedDate.split("-").map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes);
    const endDate = addMinutes(startDate, duration);

    return format(endDate, "h:mm a");
  }, [watchedDate, watchedStartTime, duration]);

  // Mirrors getRuleWarnings() on the server: informative only, the booking is never blocked
  const ruleWarnings = useMemo(() => {
    if (!watchedDate || !watchedStartTime) return [];

    const [hours, minutes] = watchedStartTime.split(":").map(Number);
    const [year, month, day] = watchedDate.split("-").map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes);
    const startMinutes = hours * 60 + minutes;
    const warnings: string[] = [];

    if (blackoutDates.includes(watchedDate)) warnings.push("blackout_date");
    if (startMinutes < openMinutes || startMinutes > lastInHoursMinutes) warnings.push("outside_hours");
    if (!editingBooking && startDate < addMinutes(new Date(), noticeMinutes)) warnings.push("short_notice");

    return warnings;
  }, [watchedDate, watchedStartTime, blackoutDates, openMinutes, lastInHoursMinutes, noticeMinutes, editingBooking]);

  const handleFormSubmit = (data: BookingFormData) => {
    // Validate passengers before submitting
    if (passengers.length === 0) {
      setPassengerError(t("validations.atLeastOnePassenger"));
      return;
    }

    const [hours, minutes] = data.startTime.split(":").map(Number);
    
    // Parse date string as local date (not UTC) to avoid timezone issues
    const [year, month, day] = data.date.split("-").map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes);
    const endDate = addMinutes(startDate, duration);

    if (!editingBooking && startDate <= new Date()) {
      setPassengerError("No puedes reservar una hora que ya paso.");
      return;
    }


    onSubmit({
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      purpose: data.purpose,
      notes: data.notes || undefined,
      contactPhone: data.contactPhone || undefined,
      helicopterRegistration: data.helicopterRegistration,
      // On edit, null clears a previously stored value; on create, undefined just omits it
      pilotName: data.pilotName?.trim() || (editingBooking ? null : undefined),
      declaredPeople: data.declaredPeople ? Number(data.declaredPeople) : editingBooking ? null : undefined,
      passengers,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {editingBooking ? t("bookings.editBooking") : t("bookings.bookHelipad")}
          </DialogTitle>
          <DialogDescription>
            {editingBooking ? t("bookings.updateTimeSlot") : t("bookings.selectTimeSlot")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <DialogBody className="space-y-6">
            {/* Date and Time Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide border-b border-zinc-200 pb-2">
                {t("bookings.dateTime")}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      />
                    </PopoverContent>
                  </Popover>
                  {errors.date && (
                    <p className="text-xs text-red-600">{errors.date.message}</p>
                  )}
                </div>

                {/* Time */}
                <div className="space-y-2">
                  <Label htmlFor="startTime" required>
                    {t("bookings.startTime")}
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <Select
                      id="startTime"
                      {...register("startTime")}
                      error={!!errors.startTime}
                      className="pl-10"
                    >
                      {timeSlots.map((slot) => (
                        (() => {
                          const slotDate =
                            selectedDate ??
                            (watchedDate
                              ? new Date(watchedDate)
                              : new Date());
                          const slotDateTime = new Date(slotDate);
                          slotDateTime.setHours(slot.hour, slot.minute, 0, 0);
                          const isPastSlot = !editingBooking && slotDateTime <= new Date();
                          const outside = isOutsideHours(slot.hour * 60 + slot.minute);

                          return (
                            <option
                              key={`${slot.hour}-${slot.minute}`}
                              value={getSlotValue(slot.hour, slot.minute)}
                              disabled={isPastSlot}
                            >
                              {slot.label}
                              {isPastSlot
                                ? " - no disponible"
                                : outside
                                ? ` - ${t("ruleWarnings.outside_hours").toLowerCase()}`
                                : ""}
                            </option>
                          );
                        })()
                      ))}
                    </Select>
                  </div>
                  {errors.startTime && (
                    <p className="text-xs text-red-600">{errors.startTime.message}</p>
                  )}
                </div>
              </div>

              {/* Duration info and end time preview */}
              {endTime && (
                <div className="p-3 bg-brand-50 rounded-xl">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-brand-600" />
                      <span className="text-brand-700">
                        <strong>{t("bookings.fixedDuration", { minutes: duration })}</strong> {t("bookings.fixedDurationBooking")}
                      </span>
                    </div>
                    <span className="text-brand-700">
                      {t("bookings.endsAt")} <strong>{endTime}</strong>
                    </span>
                  </div>
                  <p className="text-xs text-brand-600">
                    {t("bookings.bufferInfo")}
                  </p>
                </div>
              )}

              {ruleWarnings.length > 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {t("bookings.ruleWarningNotice", {
                      warnings: ruleWarnings.map((w) => t(`ruleWarnings.${w}`).toLowerCase()).join(", "),
                    })}
                  </span>
                </div>
              )}
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
                  {errors.purpose && (
                    <p className="text-xs text-red-600">{errors.purpose.message}</p>
                  )}
                </div>

                {/* Helicopter Registration */}
                <div className="space-y-2">
                  <Label htmlFor="helicopterRegistration" required>{t("bookings.helicopterRegistration")}</Label>
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

                {/* Pilot in command (Reglamento Art. 6.2 ii) */}
                <div className="space-y-2">
                  <Label htmlFor="pilotName">{t("bookings.pilotNameOptional")}</Label>
                  <Input
                    id="pilotName"
                    type="text"
                    {...register("pilotName")}
                    placeholder={t("bookings.pilotNamePlaceholder")}
                  />
                </div>

                {/* Declared number of people (Reglamento Art. 6.2 iv) */}
                <div className="space-y-2">
                  <Label htmlFor="declaredPeople">{t("bookings.declaredPeopleOptional")}</Label>
                  <Input
                    id="declaredPeople"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={99}
                    {...register("declaredPeople")}
                    error={!!errors.declaredPeople}
                    placeholder={t("bookings.declaredPeoplePlaceholder")}
                  />
                  <p className="text-xs text-zinc-500">{t("bookings.declaredPeopleHint")}</p>
                </div>

                {/* Contact phone */}
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">{t("bookings.contactPhoneOptional")}</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    {...register("contactPhone")}
                    placeholder="+1 (555) 000-0000"
                  />
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
              bookingId={editingBooking?.id}
              initialPassengers={passengers}
              onPassengersChange={(newPassengers) => {
                setPassengers(newPassengers);
                setPassengerError("");
              }}
              isSubmitting={isLoading}
              error={passengerError}
            />
          </DialogBody>

          <DialogFooter className="flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingBooking ? t("bookings.updateBooking") : t("bookings.bookNow")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
