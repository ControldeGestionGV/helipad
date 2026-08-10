"use client";

import { useState } from "react";
import { ListPlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/hooks/use-translations";
import { HistoricalBookingForm } from "@/components/bookings/historical-booking-form";
import { HistoricalBulkImport } from "@/components/bookings/historical-bulk-import";

export default function HistoricalBookingsPage() {
  const { t } = useTranslations();
  const [activeTab, setActiveTab] = useState<"individual" | "bulk">("individual");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("historicalBookings.title")}</h1>
        <p className="text-zinc-500 mt-1">{t("historicalBookings.description")}</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-200">
        <button
          onClick={() => setActiveTab("individual")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "individual"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          <ListPlus className="w-4 h-4" />
          {t("historicalBookings.tabIndividual")}
        </button>
        <button
          onClick={() => setActiveTab("bulk")}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "bulk"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          <Upload className="w-4 h-4" />
          {t("historicalBookings.tabBulk")}
        </button>
      </div>

      {activeTab === "individual" ? <HistoricalBookingForm /> : <HistoricalBulkImport />}
    </div>
  );
}
