-- Migration: Add member usage overage alerts
-- Created: 2026-09-02

-- Member usage alerts: a member exceeded their annual usage quota (settings key
-- "membershipUsage"). Coexists with misuse_alerts (freeloaders with no member/VIP
-- aboard) - this is the opposite case, a paying member using the helipad more than
-- their membership allows.
CREATE TABLE `member_usage_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`usage_count` integer NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`acknowledged_at` integer,
	`acknowledged_by` text,
	`created_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

-- members.identification_number_normalized is queried on every booking create/update
-- (membership matching) and now also on every usage-overage check; it had no index.
CREATE INDEX `members_identification_number_normalized_idx` ON `members` (`identification_number_normalized`);

-- Email logs: new notification type for usage overage alerts.
-- (SQLite TEXT columns aren't enum-constrained at the DB level; Drizzle validates at the app level. No DDL needed.)
