# Documentacion tecnica - Helipad Booking

## 1. Resumen del sistema

Helipad Booking es una aplicacion web para gestionar reservas de un helipuerto. Permite:

- Crear reservas de uso del helipuerto.
- Aprobar o rechazar solicitudes.
- Consultar calendario por dia, semana y mes.
- Gestionar usuarios por rol.
- Registrar pasajeros por reserva.
- Configurar horarios operativos, fechas bloqueadas y notificaciones.
- Enviar correos de confirmacion, cancelacion, recordatorios y recuperacion de contrasena.
- Consultar estadisticas basicas de operacion.

La app esta construida con Next.js App Router, React, TypeScript, tRPC, Drizzle ORM y SQLite/libSQL compatible con Turso.

## 2. Stack principal

- Frontend: Next.js 16, React 19, Tailwind CSS 4, lucide-react.
- API interna: tRPC.
- Base de datos: SQLite local o Turso/libSQL en produccion.
- ORM: Drizzle.
- Validaciones: Zod.
- Formularios: React Hook Form.
- Autenticacion: JWT propio en cookie HTTP-only.
- Correos: Nodemailer SMTP y Microsoft Graph; existe modelo para Resend pero no se observa envio implementado en el servicio.
  - **Actualizacion julio 2026**: el relay SMTP directo (`bluemall-com-do.mail.protection.outlook.com:25`) no funciona en produccion porque la red bloquea la salida por el puerto 25/587. La via que si funciona y esta verificada en produccion es **Microsoft Graph** (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `MAILBOX_SENDER`), que envia por HTTPS via la API de Graph en vez de SMTP. Activar el proveedor "Microsoft Graph" en `/admin/email` es obligatorio para que lleguen correos en este entorno.
- Tiempo real: Server-Sent Events para refrescar reservas en calendario.
- Internacionalizacion: archivos JSON en `src/lib/translations`.

## 3. Estructura relevante

- `src/app`: paginas y rutas del App Router.
- `src/app/(auth)`: login, recuperar contrasena y reset.
- `src/app/(dashboard)`: area autenticada.
- `src/app/(dashboard)/bookings/calendar`: calendario operativo.
- `src/app/(dashboard)/bookings/my-bookings`: reservas del usuario.
- `src/app/(dashboard)/admin`: dashboard, usuarios, reservas, settings y email.
- `src/server/api/routers`: routers tRPC por dominio.
- `src/server/db/schema.ts`: definicion de tablas Drizzle.
- `src/server/services/email.ts`: envio y log de correos.
- `src/server/services/sse.ts`: eventos de tiempo real.
- `src/components/bookings`: formulario, detalles, tarjetas y pasajeros.
- `src/components/calendar`: vistas dia, semana y mes.
- `migrations` y `drizzle`: migraciones SQL.

## 4. Modelo de datos

Tablas principales:

- `users`: usuarios con roles `admin`, `security` y `user`.
- `bookings`: reservas con hora inicio, hora fin, proposito, telefono, matricula de helicoptero, estado y cancelacion.
- `passengers`: pasajeros asociados a una reserva, con tipo/numero de identificacion y foto/documento en Base64.
- `settings`: configuracion general en formato key-value JSON.
- `email_configurations`: configuraciones de correo.
- `email_logs`: historial de envios.
- `password_reset_tokens`: tokens de recuperacion.

Estados de reserva:

- `pending`: solicitud pendiente de aprobacion.
- `confirmed`: reserva aprobada.
- `cancelled`: cancelada o rechazada.

Roles:

- `admin`: gestiona usuarios, configuracion, email, reservas y aprobaciones.
- `security`: acceso de lectura a reservas, usuarios y dashboard; no debe aprobar ni crear reservas.
- `user`: crea reservas y consulta sus propias reservas.

## 5. Flujo de reserva actual

1. El usuario abre el calendario o "Mis reservas".
2. Crea una reserva con fecha, hora, proposito, telefono, matricula y pasajeros.
3. La duracion de la reserva en UI esta fija en 10 minutos.
4. El backend valida que la fecha no sea pasada y que no choque con reservas confirmadas.
5. El backend aplica un buffer fijo de 5 minutos.
6. Si el usuario es admin, la reserva nace `confirmed`.
7. Si el usuario no es admin, la reserva nace `pending`.
8. El admin aprueba o rechaza, desde el panel admin o desde el enlace firmado (JWT, 24h) que llega por correo.
9. Se emiten eventos SSE y correos segun corresponda.

**Nota (julio 2026):** el paso 8 es atomico. El `UPDATE` que aprueba/rechaza incluye `AND status = 'pending'` en la misma sentencia y verifica si realmente se modifico una fila. Si dos personas intentan aprobar/rechazar la misma reserva casi al mismo tiempo (por ejemplo, un admin desde el panel y otro desde el enlace de correo), solo la primera accion se aplica; la segunda recibe explicitamente "Esta reserva ya fue procesada por otra persona" en vez de duplicar la accion o reenviar el correo de confirmacion. Ver `src/server/services/booking-approval.ts` y `bookings.approve`/`bookings.reject` en `src/server/api/routers/bookings.ts`.

## 6. Configuracion operativa existente

En `settings` existen:

- `operationalHours`: horario de apertura y cierre.
- `timeSlotDuration`: duracion del bloque visual.
- `minBookingNotice`: aviso minimo antes de reservar.
- `maxBookingDuration`: duracion maxima de reserva.
- `cancellationCutoff`: limite para cancelar.
- `blackoutDates`: fechas bloqueadas.
- `emailNotifications`: opciones de correo.

Hallazgo importante: varias de estas configuraciones existen en pantalla, pero no se aplican completamente en el formulario ni en el router de reservas. Hoy hay valores fijos en codigo: horario 06:00-22:00, bloque 15 minutos, reserva de 10 minutos y buffer de 5 minutos.

**Precision sobre los 10 minutos (restriccion legal del helipuerto):** el formulario normal (`src/components/bookings/booking-form.tsx`, `FIXED_DURATION = 10`) siempre calcula `endTime` como `startTime + 10 minutos` y no deja elegir otra duracion, asi que hoy nadie puede crear una reserva mas larga usando la app tal cual esta. Lo que si falta es que el **backend** (`bookings.create` en `src/server/api/routers/bookings.ts`) valide esto de forma independiente — si algo llama la API directamente, o si a futuro se destraba ese campo en el formulario, no hay ninguna regla en el servidor que lo impida. Recomendado: agregar una validacion Zod/backend de duracion maxima (10 min) como fuente de verdad, no solo como default de UI.

## 7. Comandos utiles

Instalar dependencias:

```bash
npm install
```

Desarrollo local:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Generar migraciones:

```bash
npm run db:generate
```

Aplicar migraciones:

```bash
npm run db:migrate
```

Seed local:

```bash
npm run db:seed
```

Migrar Turso:

```bash
npm run migrate:turso
```

Revisar configuracion de correo:

```bash
npm run check:email
```

## 8. Variables de entorno

Minimas recomendadas:

```env
DATABASE_URL="file:./helipad.db"
DATABASE_AUTH_TOKEN=""
AUTH_SECRET="usar-un-secreto-largo-y-unico"
NEXT_PUBLIC_APP_NAME="Helipad Booking"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APPROVAL_NOTIFICATION_EMAILS="direccion@example.com"
```

Para SMTP:

```env
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="usuario"
SMTP_PASSWORD="password-o-app-password"
EMAIL_FROM="noreply@example.com"
EMAIL_FROM_NAME="Helipad Booking"
```

Para Microsoft Graph:

```env
AZURE_TENANT_ID=""
AZURE_CLIENT_ID=""
AZURE_CLIENT_SECRET=""
MAILBOX_SENDER=""
```

## 9. Verificacion realizada

Se revisaron estructura, schema, routers tRPC, autenticacion, calendario, reservas, pasajeros, settings, usuarios, email, SSE y documentacion existente.

Resultado de `npm run lint` (actualizado julio 2026):

- 14 errores.
- 31 warnings.

`npm run build` compila sin errores de TypeScript (verificado julio 2026).

Errores mas relevantes:

- `src/hooks/use-sse.ts`: regla de React Compiler indica acceso problematico a `connect` dentro de su propia definicion para reconexion.
- `src/app/(dashboard)/admin/bookings/page.tsx`: uso de `any` en detalles de reserva.
- `src/app/(dashboard)/bookings/calendar/page.tsx`: uso de `any` para pasajeros.
- `src/app/(dashboard)/bookings/my-bookings/page.tsx`: uso de `any` para pasajeros.
- `src/app/(dashboard)/admin/settings/page.tsx`: setState sincronico dentro de effect para copiar settings al estado local.
- `src/server/services/email.ts` y utilidades de email: varios `any`.
- `src/app/api/mail/send/route.ts`: uso de `any`.

Warnings comunes:

- Imports y variables sin uso.
- Componentes con valores calculados pero no usados.
- Watch de React Hook Form marcado como incompatible por React Compiler.

## 10. Fortalezas actuales

- Separacion clara entre UI, API, base de datos y servicios.
- Roles bien definidos para admin, seguridad y usuario.
- Flujo de aprobacion ya implementado.
- Calendario con vistas utiles para operacion diaria.
- Reservas en tiempo real via SSE.
- Pasajeros asociados a reservas.
- Exportacion CSV de reservas.
- Logs de email.
- Configuracion operativa ya modelada.
- Base preparada para SQLite local y Turso.

## 11. Riesgos y mejoras recomendadas sin sobreingenieria

### Prioridad alta

1. Aplicar settings en las reglas reales de reserva.
   - Usar `operationalHours` en backend y frontend.
   - Usar `blackoutDates` para bloquear fechas en UI y API.
   - Usar `minBookingNotice` para evitar reservas demasiado proximas.
   - Usar `cancellationCutoff` para controlar cancelaciones.
   - Evitar que solo la UI bloquee reglas; el backend debe ser la fuente final.

2. Corregir lint y bug potencial de SSE.
   - El tiempo real es util para operacion; conviene dejarlo estable.
   - Tipar pasajeros y detalles de reserva para evitar errores silenciosos.

3. Endurecer autenticacion para produccion.
   - No permitir fallback de `AUTH_SECRET` en produccion.
   - Forzar cambio de usuarios demo/admin despues del seed.
   - Considerar expiracion mas corta o renovacion controlada si el entorno es sensible.

4. Mejorar manejo de documentos de pasajeros.
   - Guardar Base64 en SQLite puede inflar mucho la base.
   - Opcion simple: reducir limite y comprimir imagen.
   - Opcion mas sana: guardar archivo en storage y dejar solo URL/metadata en DB.

5. Crear bitacora operativa minima.
   - Registrar quien aprueba, rechaza, edita o cancela.
   - Registrar fecha, motivo y comentario.
   - Esto es mas importante para helipuerto que dashboards complejos.

6. Decidir el modelo de tarifas/cobro (pendiente de negocio, no de codigo).
   - Hoy no existe ningun campo de tarifa, monto o cobro en el schema ni en la app.
   - Falta que direccion defina si la app debe cobrarlo o si se gestiona fuera de esta plataforma.

7. Decidir el modelo de aprobadores (pendiente de negocio, no de codigo).
   - Hoy aprueba una sola persona. La atomicidad del aprobar/rechazar (ver seccion 5) ya evita que dos personas aprueben la misma solicitud dos veces.
   - Falta decidir si se habilitan varios aprobadores (asistentes y directores) y, si es asi, si todos los que reciben el aviso de "pendiente" deben recibir tambien el aviso de "ya resuelta".

### Prioridad media

1. Agregar motivo obligatorio al rechazar/cancelar desde admin.
   - El router acepta `reason`, pero hoy no se persiste.
   - Crear campo simple `cancellation_reason` o `admin_note`.

2. Confirmar checklist operacional antes de aprobar.
   - No hace falta un modulo grande.
   - Bastan campos booleanos o texto: pasajero verificado, matricula revisada, contacto confirmado.

3. Mejorar vista de seguridad.
   - Una pantalla "Operacion de hoy" con reservas confirmadas, pendientes, pasajeros y matricula.
   - Debe ser mas directa que el dashboard administrativo.

4. Validar duplicidad de pasajeros dentro de una misma reserva.
   - Evitar repetir mismo documento accidentalmente.

5. Agregar busqueda por matricula, pasajero y documento.
   - Muy util para seguridad y operaciones.

6. Aplicar notificaciones segun configuracion.
   - Hoy se envian confirmaciones/cancelaciones desde el servicio, pero la configuracion de `emailNotifications` debe gobernar envios.

### Prioridad baja

1. Mejorar metricas operativas.
   - Utilizacion por hora.
   - Cancelaciones por causa.
   - Reservas pendientes por antiguedad.

2. Agregar exportacion por rango completo.
   - Hoy el CSV exporta lo que esta cargado en pagina/filtro.

3. Mejorar README principal.
   - Reemplazar contenido de create-next-app por instrucciones reales del proyecto.

4. Limpiar textos corruptos de encoding en emails y seed.
   - Se ven caracteres como `ðŸ...`; conviene reemplazarlos por texto plano o iconos validos.

## 12. Roadmap sugerido

## 12.1 MVP agregado para prueba operativa

Se agregaron dos cambios ligeros para validar valor sin sobreingenieria:

1. Vista `Operacion de Hoy`.
   - Ruta: `/admin/operation`.
   - Disponible en el menu de administracion.
   - Muestra reservas del dia, pendientes, confirmadas, canceladas y proxima reserva.
   - Permite aprobar o rechazar reservas pendientes si el usuario es admin.
   - El rol `security` puede consultarla en modo lectura.

2. Aprobacion externa por email.
   - Cuando un usuario normal crea una reserva, queda `pending`.
   - La app envia un correo a los usuarios activos con rol `admin`.
   - Para pruebas, se puede definir `APPROVAL_NOTIFICATION_EMAILS` con uno o varios correos separados por coma. Si esta variable existe, se usan esos correos en vez de los admins activos.
   - El correo incluye resumen de reserva, pasajeros y botones de aprobar/rechazar.
   - Los botones usan tokens JWT firmados con expiracion de 24 horas.
   - Al aprobar desde el link, el backend vuelve a validar conflictos antes de confirmar.
   - Para pedir correccion, el MVP usa un enlace `mailto:` al solicitante.

Nota: para esta prueba no se agrego una tabla de tokens ni bitacora. Si el flujo resulta util, el siguiente paso seria guardar tokens de un solo uso y registrar auditoria de acciones.

### Fase 1: estabilidad y reglas basicas

- Corregir lint critico.
- Aplicar settings a creacion, edicion y cancelacion.
- Bloquear blackout dates en UI y API.
- Exigir `AUTH_SECRET` en produccion.
- Ajustar seed para que las credenciales demo no se usen en produccion.

### Fase 2: operacion de helipuerto

- Vista "Operacion de hoy".
- Motivo de rechazo/cancelacion.
- Bitacora basica de acciones.
- Busqueda por matricula, pasajero y documento.
- Checklist simple antes de aprobar.

### Fase 3: mejoras controladas

- Storage externo para documentos.
- Reportes operativos.
- Mejoras de email y recordatorios programados.
- Exportacion historica por rango.

## 13. Recomendacion general

El proyecto ya tiene una base funcional para un helipuerto pequeno o mediano. La mejora mas rentable no es agregar muchos modulos, sino cerrar el ciclo operativo:

- reglas reales aplicadas en backend,
- vista clara para seguridad,
- trazabilidad de decisiones,
- busqueda rapida,
- documentos manejados con cuidado,
- notificaciones confiables.

Con eso la app pasa de "sistema de reservas" a "herramienta diaria de operacion".

## 14. Registro de cambios - Julio 2026

### Correo: migracion de SMTP a Microsoft Graph

- Sintoma: los correos no llegaban en produccion; la conexion al relay (`bluemall-com-do.mail.protection.outlook.com:25`) se quedaba en timeout.
- Causa raiz: la red bloquea la salida de SMTP (puertos 25 y 587), no un problema de configuracion del relay en si.
- Solucion: usar el proveedor **Microsoft Graph** (HTTPS, no SMTP) ya soportado en `src/lib/email/graphMailer.ts`. Requiere un App Registration en Entra ID con permiso de aplicacion `Mail.Send` (con consentimiento de administrador otorgado) y las variables `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `MAILBOX_SENDER`.
- Verificado en produccion: correo de prueba y correo real de aprobacion de reserva entregados via Graph.
- Pendiente: si se habilitan varios aprobadores, decidir a quien se notifica al resolver una solicitud (ver seccion 11, punto 7).

### Bugs corregidos

1. **Reservas pendientes duplicadas en el calendario.** `bookings.getByDateRange` traia las reservas `pending` dos veces (una vez dentro de "confirmadas" por un `inArray(["confirmed","pending"])` y otra vez en la consulta de pendientes). Corregido para que la consulta de "confirmadas" solo traiga `status = "confirmed"`.
2. **Condicion de carrera al aprobar/rechazar.** Ver seccion 5. Corregido en `booking-approval.ts` y en las mutaciones `approve`/`reject` de `bookings.ts` con `UPDATE ... WHERE id = ? AND status = 'pending'` + verificacion de fila afectada.

### Identidad visual: Grupo Velutini

- Se reemplazo la paleta generica (violeta, `oklch(45% 0.18 264)`) por tokens de marca en `src/app/globals.css`: `--color-brand-*` (navy institucional) y `--color-gold-*` (oro de acento, uso moderado). `--color-primary` y `--color-ring` ahora apuntan al navy.
- Se agrego `--font-serif` (`Iowan Old Style`/`Palatino`/Georgia) para titulos de pagina (`h1`), manteniendo Inter para el resto de la interfaz (legibilidad en formularios y tablas).
- El logo de **World Trade Center Santo Domingo** (azul/naranja) se mantiene sin cambios — identifica el edificio real. Solo se recoloreo el acento de la interfaz (botones, foco, nav activo) a navy/oro de Grupo Velutini.
- Se quito el favicon default de Vercel (`src/app/favicon.ico`, el triangulo negro de `create-next-app`) y se reemplazo por `src/app/icon.png` / `apple-icon.png`, recortados del propio logo de WTC. `manifest.ts` y los iconos PWA (`public/icons/*.svg`) tambien se recolorearon a navy.

### Flujo de despliegue

- Repositorio conectado a Vercel: `ControldeGestionGV/helipad`, rama `main` = Production.
- Flujo recomendado: crear rama (`git checkout -b test`), commitear y `git push -u origin test` — Vercel genera un Preview Deployment automatico con URL propia para revision. Una vez aprobado, mergear a `main` para desplegar a produccion.
- Nota: las variables de entorno (incluida la base de datos Turso y las credenciales de Microsoft Graph) estan configuradas para "All Environments" en Vercel, asi que los Preview Deployments comparten la misma base de datos y buzon de correo que produccion.
