import { approveBookingById, rejectBookingById } from "@/server/services/booking-approval";
import { verifyApprovalToken } from "@/lib/approval-tokens";

function resultHtml(title: string, message: string) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f4f4f5; color: #18181b; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { max-width: 520px; background: white; border: 1px solid #e4e4e7; border-radius: 16px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,.06); }
      h1 { margin: 0 0 12px; font-size: 24px; }
      p { margin: 0 0 24px; color: #52525b; line-height: 1.5; }
      a { color: #2563eb; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/admin/bookings">Ir a reservas</a>
      </section>
    </main>
  </body>
</html>`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params;
  const token = new URL(request.url).searchParams.get("token");

  if (!token || (action !== "approve" && action !== "reject")) {
    return new Response(resultHtml("Enlace invalido", "El enlace de aprobacion no es valido."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const payload = await verifyApprovalToken(token);

    if (payload.action !== action) {
      return new Response(resultHtml("Enlace invalido", "Este enlace no corresponde a la accion solicitada."), {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const result =
      action === "approve"
        ? await approveBookingById(payload.bookingId)
        : await rejectBookingById(payload.bookingId);

    return new Response(
      resultHtml(result.ok ? "Accion completada" : "No se pudo procesar", result.message),
      {
        status: result.ok ? 200 : 409,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  } catch {
    return new Response(
      resultHtml("Enlace expirado", "El enlace expiro o no se pudo validar. Procesa la reserva desde la app."),
      {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}
