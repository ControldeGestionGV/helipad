# Helipad Booking

Sistema de gestion de reservas para el helipuerto del World Trade Center Santo Domingo (Grupo Velutini). Permite crear, aprobar/rechazar y consultar reservas del helipuerto, con calendario por dia/semana/mes, pasajeros por reserva, roles (admin, seguridad, usuario) y notificaciones por correo.

Para el detalle tecnico completo (stack, modelo de datos, riesgos y roadmap) ver [`DOCUMENTACION_TECNICA.md`](./DOCUMENTACION_TECNICA.md). Para el manual paso a paso del usuario final ver [`GUIA_USUARIO_FINAL.md`](./GUIA_USUARIO_FINAL.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · tRPC · Drizzle ORM · SQLite/Turso · Tailwind CSS 4 · JWT propio para autenticacion · Microsoft Graph para correo.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

Copia `.env.example` a `.env.local` y completa al menos:

```env
DATABASE_URL="file:./helipad.db"
AUTH_SECRET="usar-un-secreto-largo-y-unico"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APPROVAL_NOTIFICATION_EMAILS="direccion@example.com"
```

Para que los correos lleguen de verdad, configura Microsoft Graph (ver `DOCUMENTACION_TECNICA.md` seccion 8 y 14) y activa el proveedor "Microsoft Graph" en `/admin/email`. El relay SMTP directo no funciona en la red de produccion (bloqueo de puerto 25/587).

## Comandos

```bash
npm run dev            # servidor de desarrollo
npm run build           # build de produccion
npm run lint             # lint
npm run db:generate      # generar migraciones Drizzle
npm run db:migrate       # aplicar migraciones (local)
npm run migrate:turso    # aplicar migraciones (Turso/produccion)
npm run db:seed          # datos de prueba
npm run check:email      # revisar configuracion de correo activa
```

## Despliegue

Conectado a Vercel (`ControldeGestionGV/helipad`, rama `main` = Production). Flujo recomendado: crear una rama, hacer push (Vercel genera un Preview Deployment automatico), revisar, y luego mergear a `main` para pasar a produccion.
