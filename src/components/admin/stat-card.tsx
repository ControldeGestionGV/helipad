import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: "violet" | "emerald" | "sky" | "amber" | "rose";
}

const colorClasses = {
  violet: {
    bg: "bg-brand-50",
    icon: "bg-brand-100 text-brand-600",
    trend: "text-brand-600",
  },
  emerald: {
    bg: "bg-emerald-50",
    icon: "bg-emerald-100 text-emerald-600",
    trend: "text-emerald-600",
  },
  sky: {
    bg: "bg-sky-50",
    icon: "bg-sky-100 text-sky-600",
    trend: "text-sky-600",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "bg-amber-100 text-amber-600",
    trend: "text-amber-600",
  },
  rose: {
    bg: "bg-rose-50",
    icon: "bg-rose-100 text-rose-600",
    trend: "text-rose-600",
  },
};

export function StatCard({
  title,
  value,
  icon: Icon,
  description,
  trend,
  color = "violet",
}: StatCardProps) {
  const colors = colorClasses[color];

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500">{title}</p>
          <p className="text-3xl font-bold text-zinc-900 mt-2">{value}</p>
          {description && (
            <p className="text-sm text-zinc-500 mt-1">{description}</p>
          )}
          {trend && (
            <p
              className={cn(
                "text-sm font-medium mt-2",
                trend.isPositive ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%{" "}
              <span className="text-zinc-500 font-normal">vs last month</span>
            </p>
          )}
        </div>
        <div className={cn("p-3 rounded-xl", colors.icon)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

