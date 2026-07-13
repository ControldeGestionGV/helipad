CREATE TABLE `member_aircraft` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`registration` text NOT NULL,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE `passengers` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`name` text NOT NULL,
	`identification_type` text NOT NULL,
	`identification_number` text NOT NULL,
	`id_photo_base64` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE `bookings` ADD `helicopter_registration` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `membership_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_configurations` ADD `azure_tenant_id` text;--> statement-breakpoint
ALTER TABLE `email_configurations` ADD `azure_client_id` text;--> statement-breakpoint
ALTER TABLE `email_configurations` ADD `mailbox_sender` text;