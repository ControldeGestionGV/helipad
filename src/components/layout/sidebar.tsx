"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar,
  ListOrdered,
  Users,
  ClipboardList,
  ClipboardCheck,
  Settings,
  Plane,
  LayoutDashboard,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useTranslations } from "@/hooks/use-translations";
import Image from "next/image";

interface SidebarProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: "admin" | "security" | "user";
  };
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useTranslations();

  const navItems = {
    user: [
      { label: t("navigation.calendar"), href: ROUTES.calendar, icon: Calendar },
      { label: t("navigation.myBookings"), href: ROUTES.myBookings, icon: ListOrdered },
    ],
    admin: [
      { label: t("navigation.dashboard"), href: ROUTES.adminDashboard, icon: LayoutDashboard },
      { label: "Operacion de Hoy", href: ROUTES.adminOperation, icon: ClipboardCheck },
      { label: t("navigation.users"), href: ROUTES.adminUsers, icon: Users },
      { label: t("navigation.allBookings"), href: ROUTES.adminBookings, icon: ClipboardList },
      { label: t("navigation.settings"), href: ROUTES.adminSettings, icon: Settings },
      { label: t("navigation.email"), href: ROUTES.adminEmail, icon: Mail },
    ],
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-zinc-200">
      {/* Logo */}
        <div className="flex justify-center mb-6 px-4 pt-6">
          <Image
            src="/images/logo-long-no-bg.png"
            alt="WTC logo"
            width={185}
            height={100}
            priority
            className="object-contain"
          />
        </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto scrollbar-thin">
        {/* Main nav */}
        <div>
          <h3 className="px-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            {t("navigation.bookings")}
          </h3>
          <ul className="space-y-1">
            {navItems.user.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border-l-2",
                      isActive
                        ? "bg-brand-50 text-brand-700 border-gold-500"
                        : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Admin nav */}
        {(user.role === "admin" || user.role === "security") && (
          <div>
            <h3 className="px-3 text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              {t("navigation.administration")}
            </h3>
            <ul className="space-y-1">
              {navItems.admin.map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-zinc-100">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white text-sm font-semibold">
            {user.firstName[0]}
            {user.lastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-900 truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-zinc-500 capitalize">{user.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
