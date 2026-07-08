import { z } from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../trpc";
import { settings } from "@/server/db/schema";
import { eq } from "drizzle-orm";

// Default settings values
export const defaultSettings = {
  operationalHours: {
    start: "06:00",
    end: "22:00",
  },
  timeSlotDuration: 15, // minutes
  minBookingNotice: 60, // minutes before booking starts
  maxBookingDuration: 240, // minutes (4 hours)
  cancellationCutoff: 60, // minutes before booking starts
  blackoutDates: [] as string[], // ISO date strings
  emailNotifications: {
    confirmationEnabled: true,
    reminderEnabled: true,
    reminderHoursBefore: 24,
    adminNotificationsEnabled: true,
    approverEmails: [] as string[],
  },
};

export type AppSettings = typeof defaultSettings;

// Merges a stored setting value with its default so newly added fields
// (like emailNotifications.approverEmails) don't come back undefined
// for settings rows saved before the field existed.
function mergeWithDefault<T>(defaultValue: T, storedValue: unknown): T {
  if (
    typeof defaultValue === "object" &&
    defaultValue !== null &&
    !Array.isArray(defaultValue) &&
    typeof storedValue === "object" &&
    storedValue !== null &&
    !Array.isArray(storedValue)
  ) {
    return { ...defaultValue, ...storedValue };
  }

  return storedValue as T;
}

export const settingsRouter = createTRPCRouter({
  /**
   * Get a specific setting by key
   */
  get: protectedProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ ctx, input }) => {
      const setting = await ctx.db.query.settings.findFirst({
        where: eq(settings.key, input.key),
      });

      const defaultValue = defaultSettings[input.key as keyof AppSettings];

      if (!setting) {
        return defaultValue !== undefined ? defaultValue : null;
      }

      return mergeWithDefault(defaultValue, JSON.parse(setting.value));
    }),

  /**
   * Get all settings
   */
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const allSettings = await ctx.db.select().from(settings);

    // Merge with defaults
    const settingsMap = { ...defaultSettings };
    
    for (const setting of allSettings) {
      try {
        const key = setting.key as keyof AppSettings;
        (settingsMap as Record<string, unknown>)[key] = mergeWithDefault(
          defaultSettings[key],
          JSON.parse(setting.value)
        );
      } catch {
        // Keep default if JSON parse fails
      }
    }

    return settingsMap;
  }),

  /**
   * Update a setting (admin only)
   */
  update: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.unknown(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stringValue = JSON.stringify(input.value);

      const existing = await ctx.db.query.settings.findFirst({
        where: eq(settings.key, input.key),
      });

      if (existing) {
        const [updated] = await ctx.db
          .update(settings)
          .set({
            value: stringValue,
            updatedAt: new Date(),
          })
          .where(eq(settings.key, input.key))
          .returning();

        return { key: updated.key, value: JSON.parse(updated.value) };
      }

      const [created] = await ctx.db
        .insert(settings)
        .values({
          key: input.key,
          value: stringValue,
        })
        .returning();

      return { key: created.key, value: JSON.parse(created.value) };
    }),

  /**
   * Update multiple settings at once (admin only)
   */
  updateMany: adminProcedure
    .input(
      z.object({
        settings: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const results: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(input.settings)) {
        const stringValue = JSON.stringify(value);

        const existing = await ctx.db.query.settings.findFirst({
          where: eq(settings.key, key),
        });

        if (existing) {
          await ctx.db
            .update(settings)
            .set({
              value: stringValue,
              updatedAt: new Date(),
            })
            .where(eq(settings.key, key));
        } else {
          await ctx.db.insert(settings).values({
            key,
            value: stringValue,
          });
        }

        results[key] = value;
      }

      return results;
    }),

  /**
   * Get operational hours
   */
  getOperationalHours: protectedProcedure.query(async ({ ctx }) => {
    const setting = await ctx.db.query.settings.findFirst({
      where: eq(settings.key, "operationalHours"),
    });

    if (!setting) {
      return defaultSettings.operationalHours;
    }

    return JSON.parse(setting.value) as typeof defaultSettings.operationalHours;
  }),

  /**
   * Get blackout dates
   */
  getBlackoutDates: protectedProcedure.query(async ({ ctx }) => {
    const setting = await ctx.db.query.settings.findFirst({
      where: eq(settings.key, "blackoutDates"),
    });

    if (!setting) {
      return defaultSettings.blackoutDates;
    }

    return JSON.parse(setting.value) as string[];
  }),

  /**
   * Add blackout date (admin only)
   */
  addBlackoutDate: adminProcedure
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const setting = await ctx.db.query.settings.findFirst({
        where: eq(settings.key, "blackoutDates"),
      });

      const currentDates: string[] = setting
        ? JSON.parse(setting.value)
        : defaultSettings.blackoutDates;

      if (!currentDates.includes(input.date)) {
        currentDates.push(input.date);
        currentDates.sort();

        if (setting) {
          await ctx.db
            .update(settings)
            .set({
              value: JSON.stringify(currentDates),
              updatedAt: new Date(),
            })
            .where(eq(settings.key, "blackoutDates"));
        } else {
          await ctx.db.insert(settings).values({
            key: "blackoutDates",
            value: JSON.stringify(currentDates),
          });
        }
      }

      return currentDates;
    }),

  /**
   * Remove blackout date (admin only)
   */
  removeBlackoutDate: adminProcedure
    .input(z.object({ date: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const setting = await ctx.db.query.settings.findFirst({
        where: eq(settings.key, "blackoutDates"),
      });

      if (!setting) {
        return defaultSettings.blackoutDates;
      }

      const currentDates: string[] = JSON.parse(setting.value);
      const updatedDates = currentDates.filter((d) => d !== input.date);

      await ctx.db
        .update(settings)
        .set({
          value: JSON.stringify(updatedDates),
          updatedAt: new Date(),
        })
        .where(eq(settings.key, "blackoutDates"));

      return updatedDates;
    }),
});

