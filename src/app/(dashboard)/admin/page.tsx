"use client";

import { 
  Users, 
  Calendar, 
  CalendarCheck, 
  TrendingUp, 
  Clock, 
  XCircle,
  BarChart3,
  Trophy 
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTranslations } from "@/hooks/use-translations";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/admin/stat-card";
import { MiniChart } from "@/components/admin/mini-chart";

export default function AdminDashboardPage() {
  const { t } = useTranslations();
  const { data: stats, isLoading: statsLoading } = trpc.stats.getOverview.useQuery();
  const { data: trends, isLoading: trendsLoading } = trpc.stats.getBookingTrends.useQuery();
  const { data: topUsers, isLoading: topUsersLoading } = trpc.stats.getTopUsers.useQuery();
  const { data: popularSlots, isLoading: slotsLoading } = trpc.stats.getPopularTimeSlots.useQuery();

  const isLoading = statsLoading || trendsLoading || topUsersLoading || slotsLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-semibold text-zinc-900">{t("adminDashboard.title")}</h1>
        <p className="text-zinc-500 mt-1">
          {t("adminDashboard.description")}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t("adminDashboard.todaysBookings")}
          value={stats?.todayBookings ?? 0}
          icon={Calendar}
          color="violet"
        />
        <StatCard
          title={t("adminDashboard.thisWeek")}
          value={stats?.weekBookings ?? 0}
          icon={CalendarCheck}
          color="emerald"
        />
        <StatCard
          title={t("adminDashboard.thisMonth")}
          value={stats?.monthBookings ?? 0}
          icon={TrendingUp}
          color="sky"
        />
        <StatCard
          title={t("adminDashboard.upcoming7Days")}
          value={stats?.upcomingBookings ?? 0}
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title={t("adminDashboard.totalUsers")}
          value={stats?.totalUsers ?? 0}
          icon={Users}
          description={`${stats?.activeUsers ?? 0} ${t("adminDashboard.activeUsers")}`}
          color="violet"
        />
        <StatCard
          title={t("adminDashboard.allTimeBookings")}
          value={stats?.totalBookings ?? 0}
          icon={BarChart3}
          color="emerald"
        />
        <StatCard
          title={t("adminDashboard.cancelledMonth")}
          value={stats?.cancelledThisMonth ?? 0}
          icon={XCircle}
          color="rose"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Booking Trends Chart */}
        <div className="lg:col-span-2">
          {trends && trends.length > 0 && <MiniChart data={trends} height={200} />}
        </div>

        {/* Top Users */}
        <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-medium text-zinc-500">{t("adminDashboard.topBookersMonth")}</h3>
          </div>
          
          {topUsers && topUsers.length > 0 ? (
            <div className="space-y-3">
              {topUsers.map((user, index) => (
                <div key={user.userId} className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${index === 0 ? "bg-amber-100 text-amber-700" : 
                      index === 1 ? "bg-zinc-100 text-zinc-600" :
                      index === 2 ? "bg-orange-100 text-orange-700" :
                      "bg-zinc-50 text-zinc-500"}
                  `}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {user.firstName} {user.lastName}
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-zinc-600">
                    {user.bookingCount}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500 text-center py-4">
              {t("adminDashboard.noBookingsMonth")}
            </p>
          )}
        </div>
      </div>

      {/* Popular Time Slots */}
      <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-brand-500" />
          <h3 className="text-sm font-medium text-zinc-500">{t("adminDashboard.popularTimeSlotsMonth")}</h3>
        </div>

        {popularSlots && popularSlots.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {popularSlots.map((slot, index) => (
              <div
                key={slot.hour}
                className={`
                  px-4 py-2 rounded-xl text-sm font-medium
                  ${index === 0 ? "bg-brand-100 text-brand-800" :
                    "bg-zinc-100 text-zinc-700"}
                `}
              >
                {slot.label}
                <span className="ml-2 text-xs opacity-70">
                  ({slot.count} {t("adminDashboard.bookingsCount")})
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t("adminDashboard.noBookingsMonth")}</p>
        )}
      </div>
    </div>
  );
}

