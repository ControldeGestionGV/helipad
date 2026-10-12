-- Migration: Per-member and per-family usage quotas (Contrato 2.4)
-- Created: 2026-10-12

-- Titular: quota for the whole membership (titular + sub-members share one counter).
--   NULL = global settings.membershipUsage.annualUsageLimit.
-- Sub-member: optional individual cap inside the family quota. NULL = no own cap.
ALTER TABLE `members` ADD `annual_usage_limit` integer;

-- "membership" = titular's group quota exceeded; "individual" = a sub-member's own cap.
-- Existing alerts were raised per person against the global limit: they stay "membership".
ALTER TABLE `member_usage_alerts` ADD `scope` text DEFAULT 'membership' NOT NULL;
-- Quota in force when the alert was raised
ALTER TABLE `member_usage_alerts` ADD `usage_limit` integer;
