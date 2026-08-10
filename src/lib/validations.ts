import { z } from "zod";

// Auth validations
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

// User validations
export const userSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be less than 50 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .optional(),
  firstName: z.string().min(1, "First name is required").max(50),
  lastName: z.string().min(1, "Last name is required").max(50),
  role: z.enum(["admin", "user"]).default("user"),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = userSchema.partial().omit({ password: true });

// Booking validations
export const bookingSchema = z.object({
  startTime: z.string().datetime("Invalid start time"),
  endTime: z.string().datetime("Invalid end time"),
  purpose: z
    .string()
    .min(1, "Purpose is required")
    .max(500, "Purpose must be less than 500 characters"),
  notes: z.string().max(1000, "Notes must be less than 1000 characters").optional(),
  contactPhone: z
    .string()
    .max(20, "Phone number must be less than 20 characters")
    .regex(/^[+\d\s()-]*$/, "Invalid phone number format")
    .optional(),
}).refine((data) => {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
  return end > start;
}, {
  message: "End time must be after start time",
  path: ["endTime"],
});

export const updateBookingSchema = bookingSchema.partial();

// Historical booking validations (retroactive load of flights that already happened,
// shared by the single-entry form, the CSV bulk import, and the tRPC procedures so
// all three agree on what counts as a valid row).
export const historicalPassengerSchema = z.object({
  name: z.string().min(1, "Passenger name is required").max(255),
  identificationType: z.enum(["cedula", "passport", "other"]),
  identificationNumber: z.string().min(1, "Identification number is required").max(255),
  idPhotoBase64: z.string().optional(),
});

export const historicalBookingInputSchema = z
  .object({
    startTime: z.string().datetime("Invalid start time"),
    endTime: z.string().datetime("Invalid end time"),
    purpose: z.string().min(1, "Purpose is required").max(500),
    notes: z.string().max(1000).optional(),
    contactPhone: z.string().max(20).optional(),
    helicopterRegistration: z.string().min(1, "Helicopter registration is required").max(50),
    userId: z.string().uuid().optional(),
    passengers: z.array(historicalPassengerSchema).min(1, "At least one passenger is required"),
  })
  .refine((data) => new Date(data.startTime) < new Date(data.endTime), {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((data) => new Date(data.endTime) <= new Date(), {
    message: "Cannot load a flight in the future — use the regular booking flow instead",
    path: ["endTime"],
  });

// Settings validations
export const operationalHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
  end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
}).refine((data) => {
  const [startH, startM] = data.start.split(":").map(Number);
  const [endH, endM] = data.end.split(":").map(Number);
  return startH * 60 + startM < endH * 60 + endM;
}, {
  message: "End time must be after start time",
  path: ["end"],
});

export const emailSettingsSchema = z.object({
  confirmationEnabled: z.boolean(),
  reminderEnabled: z.boolean(),
  reminderHoursBefore: z.number().min(1).max(72),
  adminNotificationsEnabled: z.boolean(),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type BookingInput = z.infer<typeof bookingSchema>;
export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;
export type HistoricalPassengerInput = z.infer<typeof historicalPassengerSchema>;
export type HistoricalBookingInput = z.infer<typeof historicalBookingInputSchema>;
export type OperationalHoursInput = z.infer<typeof operationalHoursSchema>;
export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;

