-- Migration: Add family/business membership groups (titular + sub-members)
-- Created: 2026-09-02

-- Members: member_code is the titular's code entered by hand at contract signing (e.g. "8814").
-- parent_member_id is null for a titular, or points to the titular for a sub-member
-- (derived code e.g. "8814-A"). Only 2 levels are allowed - enforced at the app layer.
ALTER TABLE `members` ADD `member_code` text;
ALTER TABLE `members` ADD `parent_member_id` text REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade;

-- Unique index instead of a column-level UNIQUE constraint: SQLite's ALTER TABLE ADD COLUMN
-- does not support adding UNIQUE directly. Nullable, so existing titulares without a code
-- yet (and any number of them) don't conflict with each other.
CREATE UNIQUE INDEX `members_member_code_unique` ON `members` (`member_code`);
