"use client";

import { useMemo } from "react";
import { format, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarClock, Check, Clock, Phone, Plane, RefreshCw, User, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

export default function AdminOperationPage() {
  const { data: session } = useSession();
  const isReadOnly = session?.user?.role === "security";
  const today = useMemo(() => new Date(), []);
  const start = startOfDay(today);
  const end = endOfDay(today);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.bookings.listAll.useQuery({
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    page: 1,
    limit: 100,
  });

  const approveBooking = trpc.bookings.approve.useMutation({
    onSuccess: () => {
      utils.bookings.listAll.invalidate();
      toast({
        type: "success",
        title: "Reserva aprobada",
        description: "La reserva quedo confirmada.",
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: "No se pudo aprobar",
        description: error.message,
      });
    },
  });

  const rejectBooking = trpc.bookings.reject.useMutation({
    onSuccess: () => {
      utils.bookings.listAll.invalidate();
      toast({
        type: "success",
        title: "Reserva rechazada",
        description: "La reserva fue cancelada.",
      });
    },
    onError: (error) => {
      toast({
        type: "error",
        title: "No se pudo rechazar",
        description: error.message,
      });
    },
  });

  const bookings = (data?.bookings ?? []).sort(
    (a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime()
  );

  const pendingCount = bookings.filter((booking) => booking.status === "pending").length;
  const confirmedCount = bookings.filter((booking) => booking.status === "confirmed").length;
  const cancelledCount = bookings.filter((booking) => booking.status === "cancelled").length;
  const nextBooking = bookings.find(
    (booking) => booking.status !== "cancelled" && new Date(booking.endTime!) >= new Date()
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold text-zinc-900">Operacion de Hoy</h1>
          <p className="text-zinc-500 mt-1">
            Reservas del {format(today, "EEEE, d 'de' MMMM", { locale: es })}
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-500">Pendientes</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{pendingCount}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-500">Confirmadas</p>
          <p className="mt-2 text-3xl font-bold text-emerald-600">{confirmedCount}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-500">Canceladas</p>
          <p className="mt-2 text-3xl font-bold text-red-600">{cancelledCount}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-500">Proxima</p>
          <p className="mt-2 text-lg font-semibold text-zinc-900">
            {nextBooking ? format(new Date(nextBooking.startTime!), "h:mm a") : "-"}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <CalendarClock className="mx-auto h-12 w-12 text-zinc-300" />
          <h2 className="mt-4 text-lg font-semibold text-zinc-900">No hay reservas para hoy</h2>
          <p className="mt-1 text-zinc-500">Cuando haya reservas, apareceran aqui ordenadas por hora.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                      <Clock className="h-5 w-5 text-zinc-400" />
                      {format(new Date(booking.startTime!), "h:mm a")} -{" "}
                      {format(new Date(booking.endTime!), "h:mm a")}
                    </div>
                    <Badge
                      variant={
                        booking.status === "confirmed"
                          ? "success"
                          : booking.status === "pending"
                          ? "warning"
                          : "destructive"
                      }
                    >
                      {booking.status === "confirmed"
                        ? "Confirmada"
                        : booking.status === "pending"
                        ? "Pendiente"
                        : "Cancelada"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-3 text-sm text-zinc-600 md:grid-cols-2 xl:grid-cols-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-zinc-400" />
                      <span>
                        {booking.user
                          ? `${booking.user.firstName} ${booking.user.lastName}`
                          : "Usuario desconocido"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Plane className="h-4 w-4 text-zinc-400" />
                      <span>{booking.helicopterRegistration || "Sin matricula"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-zinc-400" />
                      <span>{booking.contactPhone || "Sin telefono"}</span>
                    </div>
                    <div className="truncate text-zinc-700" title={booking.purpose}>
                      {booking.purpose}
                    </div>
                  </div>
                </div>

                {!isReadOnly && booking.status === "pending" && (
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => approveBooking.mutate({ id: booking.id })}
                      disabled={approveBooking.isPending || rejectBooking.isPending}
                    >
                      <Check className="h-4 w-4" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => rejectBooking.mutate({ id: booking.id })}
                      disabled={approveBooking.isPending || rejectBooking.isPending}
                    >
                      <X className="h-4 w-4" />
                      Rechazar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
