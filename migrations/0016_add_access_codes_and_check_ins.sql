-- Migration: QR access credential and access log (Reglamento Art. 6.5 / 12.7)
-- Created: 2026-10-01

-- Random code embedded in the booking's QR. Generated lazily the first time the QR of a
-- confirmed booking is shown or emailed.
ALTER TABLE `bookings` ADD `access_code` text;
CREATE UNIQUE INDEX `bookings_access_code_unique` ON `bookings` (`access_code`);

-- One row per validation by security; may cover several people arriving together.
-- is_exception: registered outside the slot or beyond the declared people (allowed, on record).
-- is_manual: verified without the QR (system down, searched by name).
CREATE TABLE `booking_check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`people` integer NOT NULL,
	`is_exception` integer DEFAULT false NOT NULL,
	`is_manual` integer DEFAULT false NOT NULL,
	`note` text,
	`checked_in_by` text,
	`created_at` integer,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checked_in_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `booking_check_ins_booking_id_idx` ON `booking_check_ins` (`booking_id`);
