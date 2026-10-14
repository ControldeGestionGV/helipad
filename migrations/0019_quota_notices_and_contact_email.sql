-- Migration: Contrato 2.4 (updated) - no overage billing; notice at 5 remaining operations,
-- membership rights cease when the quota is exhausted.
-- Created: 2026-10-14

-- Titular's contact email for membership notices (optional)
ALTER TABLE `members` ADD `contact_email` text;

-- "low_quota" = few operations left (notice); "exhausted" = quota used up.
-- Existing alerts were raised when the quota was exceeded: they are "exhausted".
ALTER TABLE `member_usage_alerts` ADD `kind` text DEFAULT 'exhausted' NOT NULL;

-- Overage billing (US$350 per extra operation) no longer exists in the contract
UPDATE `settings`
SET `value` = '{"annualUsageLimit":' || coalesce(json_extract(`value`, '$.annualUsageLimit'), 36) || ',"lowQuotaThreshold":5}',
    `updated_at` = unixepoch()
WHERE `key` = 'membershipUsage';
