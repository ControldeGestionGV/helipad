-- Migration: Add membership module (members, aircraft registry, VIP list, misuse alerts)
-- Created: 2026-07-08

-- Members: annual membership tied to a person (identification), not to an aircraft.
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`identification_type` text NOT NULL,
	`identification_number` text NOT NULL,
	`identification_number_normalized` text NOT NULL,
	`membership_start_date` integer NOT NULL,
	`membership_end_date` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);

-- Aircraft a member usually flies. Informational only - does not restrict which aircraft they can use.
CREATE TABLE `member_aircraft` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`registration` text NOT NULL,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);

-- Pre-approved VIP list. Exempt from the membership requirement and from the misuse alert count.
CREATE TABLE `vips` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`identification_type` text NOT NULL,
	`identification_number` text NOT NULL,
	`identification_number_normalized` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` integer,
	`updated_at` integer
);

-- Misuse alerts: an aircraft landed 2+ times in the last 6 months with no member/VIP aboard.
CREATE TABLE `misuse_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`helicopter_registration` text NOT NULL,
	`trigger_count` integer NOT NULL,
	`window_start` integer NOT NULL,
	`window_end` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`acknowledged_at` integer,
	`acknowledged_by` text,
	`created_at` integer,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

-- Bookings: track whether a member or VIP was aboard, computed once at create/edit time.
ALTER TABLE `bookings` ADD `membership_status` text DEFAULT 'none' NOT NULL;

-- Email logs: new notification type for misuse alerts.
-- (SQLite TEXT columns aren't enum-constrained at the DB level; Drizzle validates at the app level. No DDL needed.)
