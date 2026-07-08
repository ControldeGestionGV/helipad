"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { useTranslations } from "@/hooks/use-translations";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
  variant?: "default" | "compact";
}

export function LanguageSwitcher({ className, variant = "default" }: LanguageSwitcherProps) {
  const { locale, setLocale, locales, localeNames } = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 rounded-xl transition-colors cursor-pointer",
          variant === "default"
            ? "px-3 py-2 hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900"
            : "p-2 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700"
        )}
      >
        <Globe className="w-4 h-4" />
        {variant === "default" && (
          <span className="text-sm font-medium">{localeNames[locale]}</span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-1 w-36 bg-white rounded-xl shadow-lg border border-zinc-200 py-1 z-50 animate-fade-in">
            {locales.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => {
                  setLocale(loc);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors cursor-pointer",
                  locale === loc
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-zinc-700 hover:bg-zinc-50"
                )}
              >
                <span className="text-base">
                  {loc === "en" ? "🇺🇸" : "🇪🇸"}
                </span>
                {localeNames[loc]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

