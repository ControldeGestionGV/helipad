import { format } from "date-fns";
import { and, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { bookings } from "@/server/db/schema";
import { broadcastBookingCancelled, broadcastBookingCreated } from "@/server/services/sse";
import { sendBookingCancellation, sendBookingConfirmation } from "@/server/services/email";

export async function approveBookingById(bookingId: string) {
  const existing = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false as const, message: "Reserva no encontrada." };
  }

  if (existing.status === "confirmed") {
    return { ok: true as const, message: "Esta reserva ya estaba aprobada." };
  }

  if (existing.status !== "pending") {
    return { ok: false as const, message: "Esta reserva ya fue procesada." };
  }

  const bufferMinutes = 5;
  const endWithBuffer = new Date(existing.endTime.getTime() + bufferMinutes * 60 * 1000);

  const conflicts = await db
    .select({
      id: bookings.id,
      startTime: bookings.startTime,
      endTime: bookings.endTime,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ["confirmed", "pending"]),
        sql`${bookings.id} != ${bookingId}`,
        lt(bookings.startTime, endWithBuffer),
        gt(sql`datetime(${bookings.endTime}, '+5 minutes')`, existing.startTime)
      )
    );

  if (conflicts.length > 0) {
    return {
      ok: false as const,
      message: "No se pudo aprobar: el horario ahora tiene conflicto con otra reserva.",
    };
  }

  const [approved] = await db
    .update(bookings)
    .set({
      status: "confirmed",
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")))
    .returning();

  if (!approved) {
    return { ok: false as const, message: "Esta reserva ya fue procesada por otra persona." };
  }

  broadcastBookingCreated({
    id: approved.id,
    userId: approved.userId,
    startTime: existing.startTime,
    endTime: existing.endTime,
  });

  if (existing.user?.email) {
    sendBookingConfirmation({
      userName: `${existing.user.firstName} ${existing.user.lastName}`,
      userEmail: existing.user.email,
      userId: existing.userId,
      bookingId: approved.id,
      date: format(existing.startTime, "EEEE, MMMM d, yyyy"),
      startTime: format(existing.startTime, "h:mm a"),
      endTime: format(existing.endTime, "h:mm a"),
      purpose: existing.purpose,
      locale: "es",
    }).catch((err) => console.error("Failed to send confirmation email:", err));
  }

  return { ok: true as const, message: "Reserva aprobada correctamente." };
}

export async function rejectBookingById(bookingId: string, cancelledBy?: string) {
  const existing = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      user: {
        columns: {
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!existing) {
    return { ok: false as const, message: "Reserva no encontrada." };
  }

  if (existing.status === "cancelled") {
    return { ok: true as const, message: "Esta reserva ya estaba rechazada o cancelada." };
  }

  if (existing.status !== "pending") {
    return { ok: false as const, message: "Solo se pueden rechazar reservas pendientes." };
  }

  const [rejected] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy,
      updatedAt: new Date(),
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending")))
    .returning();

  if (!rejected) {
    return { ok: false as const, message: "Esta reserva ya fue procesada por otra persona." };
  }

  broadcastBookingCancelled({
    id: rejected.id,
    userId: rejected.userId,
    startTime: existing.startTime,
    endTime: existing.endTime,
  });

  if (existing.user?.email) {
    sendBookingCancellation({
      userName: `${existing.user.firstName} ${existing.user.lastName}`,
      userEmail: existing.user.email,
      userId: existing.userId,
      bookingId: rejected.id,
      date: format(existing.startTime, "EEEE, MMMM d, yyyy"),
      startTime: format(existing.startTime, "h:mm a"),
      endTime: format(existing.endTime, "h:mm a"),
      purpose: existing.purpose,
      locale: "es",
    }).catch((err) => console.error("Failed to send rejection email:", err));
  }

  return { ok: true as const, message: "Reserva rechazada correctamente." };
}
