-- Migration: compliance alerts (Reglamento Art. 6.4 and 24.3)
-- Created: 2026-11-03

-- Confirmed booking whose party did not show up, marked by the operator (Art. 6.4: three or more
-- late cancellations or no-shows in a period allow disciplinary measures).
ALTER TABLE `bookings` ADD `no_show` integer DEFAULT false NOT NULL;

-- Landing or takeoff without a confirmed booking or outside its slot (Art. 24.3), recorded by the
-- staff at the helipad. Records the fact only; emergencies are kept on record but never count.
CREATE TABLE `unauthorized_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`helicopter_registration` text NOT NULL,
	`pilot_name` text,
	`kind` text NOT NULL,
	`booking_id` text,
	`is_emergency` integer DEFAULT false NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`reported_by` text,
	`reviewed_at` integer,
	`reviewed_by` text,
	`created_at` integer,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE INDEX `unauthorized_operations_registration_idx` ON `unauthorized_operations` (`helicopter_registration`);
