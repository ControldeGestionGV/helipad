"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, ListOrdered, User, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useTranslations } from "@/hooks/use-translations";

interface MobileNavProps {
  isAdmin: boolean;
  isSecurity?: boolean;
}

export function MobileNav({ isAdmin, isSecurity }: MobileNavProps) {
  const pathname = usePathname();
  const { t } = useTranslations();

  const navItems = [
    { label: t("navigation.calendar"), href: ROUTES.calendar, icon: Calendar },
    { label: t("navigation.bookings"), href: ROUTES.myBookings, icon: ListOrdered },
    ...(isAdmin || isSecurity
      ? [{ label: t("navigation.admin"), href: ROUTES.adminDashboard, icon: LayoutDashboard }]
      : []),
    { label: t("navigation.profile"), href: "/profile", icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200 lg:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors",
                isActive
                  ? "text-brand-600"
                  : "text-zinc-400 hover:text-zinc-600"
              )}
            >
              <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
              <span className="text-[10px] font-medium mt-1">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-0 w-12 h-0.5 bg-brand-600 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

