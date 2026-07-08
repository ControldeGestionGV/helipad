"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { 
  Clock, 
  Calendar, 
  Bell, 
  Save, 
  Plus, 
  X, 
  Loader2,
  Settings as SettingsIcon
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export default function SettingsPage() {
  const { t, locale, translateError } = useTranslations();
  const dateLocale = locale === "es" ? es : enUS;
  
  const { data: settings, isLoading } = trpc.settings.getAll.useQuery();
  const utils = trpc.useUtils();

  // Form state
  const [operationalHours, setOperationalHours] = useState({ start: "06:00", end: "22:00" });
  const [timeSlotDuration, setTimeSlotDuration] = useState(15);
  const [minBookingNotice, setMinBookingNotice] = useState(60);
  const [maxBookingDuration, setMaxBookingDuration] = useState(240);
  const [cancellationCutoff, setCancellationCutoff] = useState(60);
  const [blackoutDates, setBlackoutDates] = useState<string[]>([]);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [emailSettings, setEmailSettings] = useState({
    confirmationEnabled: true,
    reminderEnabled: true,
    reminderHoursBefore: 24,
    adminNotificationsEnabled: true,
    approverEmails: [] as string[],
  });
  const [newApproverEmail, setNewApproverEmail] = useState("");

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      setOperationalHours(settings.operationalHours);
      setTimeSlotDuration(settings.timeSlotDuration);
      setMinBookingNotice(settings.minBookingNotice);
      setMaxBookingDuration(settings.maxBookingDuration);
      setCancellationCutoff(settings.cancellationCutoff);
      setBlackoutDates(settings.blackoutDates);
      setEmailSettings({
        ...settings.emailNotifications,
        approverEmails: settings.emailNotifications.approverEmails ?? [],
      });
    }
  }, [settings]);

  // Mutations
  const updateSettings = trpc.settings.updateMany.useMutation({
    onSuccess: () => {
      utils.settings.getAll.invalidate();
      toast({
        type: "success",
        title: t("adminSettings.settingsSaved"),
        description: t("adminSettings.settingsSavedDescription"),
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: t("errors.generic"),
        description: translateError(error.message),
      });
    },
  });

  const addBlackoutDate = trpc.settings.addBlackoutDate.useMutation({
    onSuccess: (data) => {
      setBlackoutDates(data);
      setNewBlackoutDate("");
      utils.settings.getAll.invalidate();
      toast({
        type: "success",
        title: t("adminSettings.blackoutDateAdded"),
      });
    },
  });

  const removeBlackoutDate = trpc.settings.removeBlackoutDate.useMutation({
    onSuccess: (data) => {
      setBlackoutDates(data);
      utils.settings.getAll.invalidate();
      toast({
        type: "success",
        title: t("adminSettings.blackoutDateRemoved"),
      });
    },
  });

  const handleSaveGeneral = () => {
    updateSettings.mutate({
      settings: {
        operationalHours,
        timeSlotDuration,
        minBookingNotice,
        maxBookingDuration,
        cancellationCutoff,
      },
    });
  };

  const handleSaveEmail = () => {
    updateSettings.mutate({
      settings: {
        emailNotifications: emailSettings,
      },
    });
  };

  const handleAddApproverEmail = () => {
    const email = newApproverEmail.trim().toLowerCase();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (isValidEmail && !emailSettings.approverEmails.includes(email)) {
      setEmailSettings({
        ...emailSettings,
        approverEmails: [...emailSettings.approverEmails, email],
      });
      setNewApproverEmail("");
    }
  };

  const handleRemoveApproverEmail = (email: string) => {
    setEmailSettings({
      ...emailSettings,
      approverEmails: emailSettings.approverEmails.filter((e) => e !== email),
    });
  };

  const handleAddBlackout = () => {
    if (newBlackoutDate && !blackoutDates.includes(newBlackoutDate)) {
      addBlackoutDate.mutate({ date: newBlackoutDate });
    }
  };

  const handleRemoveBlackout = (date: string) => {
    removeBlackoutDate.mutate({ date });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("adminSettings.title")}</h1>
        <p className="text-zinc-500 mt-1">
          {t("adminSettings.description")}
        </p>
      </div>

      {/* Operational Hours */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-brand-100 rounded-xl">
            <Clock className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t("adminSettings.operationalHours.title")}</h2>
            <p className="text-sm text-zinc-500">{t("adminSettings.operationalHours.description")}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="space-y-2">
            <Label>{t("adminSettings.operationalHours.openingTime")}</Label>
            <Select
              value={operationalHours.start}
              onChange={(e) =>
                setOperationalHours({ ...operationalHours, start: e.target.value })
              }
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={`${i.toString().padStart(2, "0")}:00`}>
                  {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("adminSettings.operationalHours.closingTime")}</Label>
            <Select
              value={operationalHours.end}
              onChange={(e) =>
                setOperationalHours({ ...operationalHours, end: e.target.value })
              }
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={`${i.toString().padStart(2, "0")}:00`}>
                  {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="space-y-2">
            <Label>{t("adminSettings.operationalHours.timeSlotDuration")}</Label>
            <Select
              value={timeSlotDuration.toString()}
              onChange={(e) => setTimeSlotDuration(Number(e.target.value))}
            >
              <option value="15">{t("adminSettings.durations.15min")}</option>
              <option value="30">{t("adminSettings.durations.30min")}</option>
              <option value="60">{t("adminSettings.durations.1hour")}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("adminSettings.operationalHours.maxBookingDuration")}</Label>
            <Select
              value={maxBookingDuration.toString()}
              onChange={(e) => setMaxBookingDuration(Number(e.target.value))}
            >
              <option value="60">{t("adminSettings.durations.1hour")}</option>
              <option value="120">{t("adminSettings.durations.2hours")}</option>
              <option value="180">{t("adminSettings.durations.3hours")}</option>
              <option value="240">{t("adminSettings.durations.4hours")}</option>
              <option value="480">{t("adminSettings.durations.8hours")}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("adminSettings.operationalHours.minAdvanceNotice")}</Label>
            <Select
              value={minBookingNotice.toString()}
              onChange={(e) => setMinBookingNotice(Number(e.target.value))}
            >
              <option value="0">{t("adminSettings.durations.none")}</option>
              <option value="30">{t("adminSettings.durations.30min")}</option>
              <option value="60">{t("adminSettings.durations.1hour")}</option>
              <option value="120">{t("adminSettings.durations.2hours")}</option>
              <option value="1440">{t("adminSettings.durations.24hours")}</option>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSaveGeneral} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {t("common.saveChanges")}
          </Button>
        </div>
      </div>

      {/* Blackout Dates */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-red-100 rounded-xl">
            <Calendar className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t("adminSettings.blackoutDates.title")}</h2>
            <p className="text-sm text-zinc-500">{t("adminSettings.blackoutDates.description")}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Input
            type="date"
            value={newBlackoutDate}
            onChange={(e) => setNewBlackoutDate(e.target.value)}
            min={format(new Date(), "yyyy-MM-dd")}
            className="max-w-xs"
          />
          <Button
            onClick={handleAddBlackout}
            disabled={!newBlackoutDate || addBlackoutDate.isPending}
          >
            <Plus className="w-4 h-4" />
            {t("adminSettings.blackoutDates.addDate")}
          </Button>
        </div>

        {blackoutDates.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {blackoutDates.sort().map((date) => (
              <div
                key={date}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-sm"
              >
                <span className="text-red-800">
                  {format(new Date(date), "MMM d, yyyy", { locale: dateLocale })}
                </span>
                <button
                  onClick={() => handleRemoveBlackout(date)}
                  className="text-red-500 hover:text-red-700 cursor-pointer"
                  disabled={removeBlackoutDate.isPending}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("adminSettings.blackoutDates.noBlackoutDates")}</p>
        )}
      </div>

      {/* Email Notifications */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-100 rounded-xl">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t("adminSettings.emailNotifications.title")}</h2>
            <p className="text-sm text-zinc-500">{t("adminSettings.emailNotifications.description")}</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
            <input
              type="checkbox"
              checked={emailSettings.confirmationEnabled}
              onChange={(e) =>
                setEmailSettings({ ...emailSettings, confirmationEnabled: e.target.checked })
              }
              className="h-5 w-5 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <div>
              <p className="font-medium text-zinc-900">{t("adminSettings.emailNotifications.confirmations.title")}</p>
              <p className="text-sm text-zinc-500">{t("adminSettings.emailNotifications.confirmations.description")}</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
            <input
              type="checkbox"
              checked={emailSettings.reminderEnabled}
              onChange={(e) =>
                setEmailSettings({ ...emailSettings, reminderEnabled: e.target.checked })
              }
              className="h-5 w-5 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <div className="flex-1">
              <p className="font-medium text-zinc-900">{t("adminSettings.emailNotifications.reminders.title")}</p>
              <p className="text-sm text-zinc-500">{t("adminSettings.emailNotifications.reminders.description")}</p>
            </div>
            <Select
              value={emailSettings.reminderHoursBefore.toString()}
              onChange={(e) =>
                setEmailSettings({
                  ...emailSettings,
                  reminderHoursBefore: Number(e.target.value),
                })
              }
              className="w-32"
              disabled={!emailSettings.reminderEnabled}
            >
              <option value="1">{t("adminSettings.emailNotifications.reminderTiming.1hour")}</option>
              <option value="2">{t("adminSettings.emailNotifications.reminderTiming.2hours")}</option>
              <option value="12">{t("adminSettings.emailNotifications.reminderTiming.12hours")}</option>
              <option value="24">{t("adminSettings.emailNotifications.reminderTiming.24hours")}</option>
              <option value="48">{t("adminSettings.emailNotifications.reminderTiming.48hours")}</option>
            </Select>
          </label>

          <label className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl cursor-pointer hover:bg-zinc-100 transition-colors">
            <input
              type="checkbox"
              checked={emailSettings.adminNotificationsEnabled}
              onChange={(e) =>
                setEmailSettings({
                  ...emailSettings,
                  adminNotificationsEnabled: e.target.checked,
                })
              }
              className="h-5 w-5 rounded border-zinc-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
            />
            <div>
              <p className="font-medium text-zinc-900">{t("adminSettings.emailNotifications.adminNotifications.title")}</p>
              <p className="text-sm text-zinc-500">{t("adminSettings.emailNotifications.adminNotifications.description")}</p>
            </div>
          </label>

          <div className={`p-3 rounded-xl border ${emailSettings.adminNotificationsEnabled ? "bg-zinc-50 border-zinc-200" : "bg-zinc-50/50 border-zinc-100 opacity-60"}`}>
            <p className="font-medium text-zinc-900">{t("adminSettings.emailNotifications.approverEmails.title")}</p>
            <p className="text-sm text-zinc-500 mb-3">{t("adminSettings.emailNotifications.approverEmails.description")}</p>

            <div className="flex gap-2 mb-3">
              <Input
                type="email"
                value={newApproverEmail}
                onChange={(e) => setNewApproverEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddApproverEmail();
                  }
                }}
                placeholder={t("adminSettings.emailNotifications.approverEmails.placeholder")}
                disabled={!emailSettings.adminNotificationsEnabled}
                className="max-w-xs"
              />
              <Button
                type="button"
                onClick={handleAddApproverEmail}
                disabled={!newApproverEmail.trim() || !emailSettings.adminNotificationsEnabled}
              >
                <Plus className="w-4 h-4" />
                {t("adminSettings.emailNotifications.approverEmails.addEmail")}
              </Button>
            </div>

            {emailSettings.approverEmails.length > 0 ? (
              <div className="flex flex-wrap gap-2 mb-2">
                {emailSettings.approverEmails.map((email) => (
                  <div
                    key={email}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-sm"
                  >
                    <span className="text-zinc-800">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveApproverEmail(email)}
                      className="text-zinc-400 hover:text-red-600 cursor-pointer"
                      disabled={!emailSettings.adminNotificationsEnabled}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <p className="text-xs text-zinc-400">{t("adminSettings.emailNotifications.approverEmails.fallbackNote")}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSaveEmail} disabled={updateSettings.isPending}>
            {updateSettings.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            {t("common.saveChanges")}
          </Button>
        </div>
      </div>
    </div>
  );
}
