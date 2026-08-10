-- Migration: Add historical booking backfill tracking
-- Created: 2026-08-10

-- Bookings: flag retroactively-loaded flights and track who loaded them,
-- so they can be distinguished from real-time reservations for audit purposes.
ALTER TABLE `bookings` ADD `is_historical` integer DEFAULT false NOT NULL;
ALTER TABLE `bookings` ADD `created_by` text REFERENCES `users`(`id`);
