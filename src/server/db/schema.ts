import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// Users table
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  role: text("role", { enum: ["admin", "security", "user"] }).notNull().default("user"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Bookings table
export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startTime: integer("start_time", { mode: "timestamp" }).notNull(),
  endTime: integer("end_time", { mode: "timestamp" }).notNull(),
  purpose: text("purpose").notNull(),
  notes: text("notes"),
  contactPhone: text("contact_phone"),
  passengers: integer("passengers").notNull().default(1),
  helicopterRegistration: text("helicopter_registration"),
  status: text("status", { enum: ["pending", "confirmed", "cancelled"] }).notNull().default("confirmed"),
  // "member": un pasajero es titular de membresia activa. "vip": un pasajero esta en la lista VIP.
  // "none": ningun pasajero es titular ni VIP -> requiere aprobacion especial y cuenta para la alerta de uso indebido.
  membershipStatus: text("membership_status", { enum: ["member", "vip", "none"] }).notNull().default("none"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  cancelledBy: text("cancelled_by").references(() => users.id),
  // Vuelo cargado retroactivamente (no reservado en tiempo real) via /admin/bookings/historical.
  isHistorical: integer("is_historical", { mode: "boolean" }).notNull().default(false),
  // Quien hizo la carga retroactiva. Puede diferir de userId (a nombre de quien queda el vuelo).
  createdBy: text("created_by").references(() => users.id),
});

// Members table (membership program: annual, tied to a person, not to an aircraft)
export const members = sqliteTable("members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  identificationType: text("identification_type", { enum: ["cedula", "passport", "other"] }).notNull(),
  identificationNumber: text("identification_number").notNull(),
  // Normalizado (sin espacios/guiones, mayusculas) para poder cruzar contra pasajeros de forma confiable.
  identificationNumberNormalized: text("identification_number_normalized").notNull(),
  membershipStartDate: integer("membership_start_date", { mode: "timestamp" }).notNull(),
  membershipEndDate: integer("membership_end_date", { mode: "timestamp" }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Aircraft a member usually flies (informational only - does not restrict which aircraft they can use)
export const memberAircraft = sqliteTable("member_aircraft", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  registration: text("registration").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Pre-approved VIP list - exempt from membership requirement and from the misuse alert count
export const vips = sqliteTable("vips", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  identificationType: text("identification_type", { enum: ["cedula", "passport", "other"] }).notNull(),
  identificationNumber: text("identification_number").notNull(),
  identificationNumberNormalized: text("identification_number_normalized").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Misuse alerts: an aircraft landed 2+ times in the last 6 months with no member/VIP aboard
export const misuseAlerts = sqliteTable("misuse_alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  helicopterRegistration: text("helicopter_registration").notNull(),
  triggerCount: integer("trigger_count").notNull(),
  windowStart: integer("window_start", { mode: "timestamp" }).notNull(),
  windowEnd: integer("window_end", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["open", "acknowledged"] }).notNull().default("open"),
  acknowledgedAt: integer("acknowledged_at", { mode: "timestamp" }),
  acknowledgedBy: text("acknowledged_by").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Settings table (key-value store)
export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(), // JSON string
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Email configurations table
export const emailConfigurations = sqliteTable("email_configurations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  provider: text("provider", { enum: ["smtp", "resend", "msgraph"] }).notNull().default("smtp"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpSecure: integer("smtp_secure", { mode: "boolean" }).default(true),
  smtpUser: text("smtp_user"),
  smtpPassword: text("smtp_password"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull(),
  resendApiKey: text("resend_api_key"),
  // Microsoft Graph fields (credentials stored in env vars)
  azureTenantId: text("azure_tenant_id"),
  azureClientId: text("azure_client_id"),
  mailboxSender: text("mailbox_sender"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Email logs table
export const emailLogs = sqliteTable("email_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  type: text("type", { enum: ["confirmation", "cancellation", "reminder", "password_reset", "misuse_alert"] }).notNull(),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  sentAt: integer("sent_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  error: text("error"),
});

// Password reset tokens table
export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Passengers table
export const passengers = sqliteTable("passengers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  identificationType: text("identification_type", { enum: ["cedula", "passport", "other"] }).notNull(),
  identificationNumber: text("identification_number").notNull(),
  idPhotoBase64: text("id_photo_base64"), // Base64 encoded photo (optional, max 10MB)
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
  emailLogs: many(emailLogs),
  passwordResetTokens: many(passwordResetTokens),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, {
    fields: [passwordResetTokens.userId],
    references: [users.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  user: one(users, {
    fields: [bookings.userId],
    references: [users.id],
  }),
  cancelledByUser: one(users, {
    fields: [bookings.cancelledBy],
    references: [users.id],
  }),
  emailLogs: many(emailLogs),
  passengers: many(passengers),
}));

export const emailLogsRelations = relations(emailLogs, ({ one }) => ({
  user: one(users, {
    fields: [emailLogs.userId],
    references: [users.id],
  }),
  booking: one(bookings, {
    fields: [emailLogs.bookingId],
    references: [bookings.id],
  }),
}));

export const passengersRelations = relations(passengers, ({ one }) => ({
  booking: one(bookings, {
    fields: [passengers.bookingId],
    references: [bookings.id],
  }),
}));

export const membersRelations = relations(members, ({ many }) => ({
  aircraft: many(memberAircraft),
}));

export const memberAircraftRelations = relations(memberAircraft, ({ one }) => ({
  member: one(members, {
    fields: [memberAircraft.memberId],
    references: [members.id],
  }),
}));

export const misuseAlertsRelations = relations(misuseAlerts, ({ one }) => ({
  acknowledgedByUser: one(users, {
    fields: [misuseAlerts.acknowledgedBy],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type EmailConfiguration = typeof emailConfigurations.$inferSelect;
export type NewEmailConfiguration = typeof emailConfigurations.$inferInsert;
export type EmailLog = typeof emailLogs.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Passenger = typeof passengers.$inferSelect;
export type NewPassenger = typeof passengers.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type MemberAircraft = typeof memberAircraft.$inferSelect;
export type NewMemberAircraft = typeof memberAircraft.$inferInsert;
export type Vip = typeof vips.$inferSelect;
export type NewVip = typeof vips.$inferInsert;
export type MisuseAlert = typeof misuseAlerts.$inferSelect;
export type NewMisuseAlert = typeof misuseAlerts.$inferInsert;

