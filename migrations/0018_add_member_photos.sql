-- Migration: Member identification photo (Reglamento Art. 13.5)
-- Created: 2026-10-12

-- 2x2 face photo to verify the member's identity at the access point. Separate table so
-- member listings never load image data. Deleted with the member (cascade); retention per
-- Reglamento Art. 22.
CREATE TABLE `member_photos` (
	`member_id` text PRIMARY KEY NOT NULL,
	`data_url` text NOT NULL,
	`uploaded_by` text,
	`updated_at` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
