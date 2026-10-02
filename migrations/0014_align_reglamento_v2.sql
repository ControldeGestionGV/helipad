-- Migration: Align booking rules with Reglamento de Operaciones del Helipuerto (Anexo A, v2 21.09.2026)
-- Created: 2026-10-01

-- Art. 6.4: a member cancelling with less notice than settings.cancellationCutoff is a late
-- cancellation (3+ per membership period enables disciplinary measures).
ALTER TABLE `bookings` ADD `late_cancellation` integer DEFAULT false NOT NULL;

-- Exceptions to the Reglamento detected at booking time (JSON array: outside_hours,
-- short_notice, blackout_date, long_duration). They never block a booking; they are
-- recorded so the operator can see them.
ALTER TABLE `bookings` ADD `rule_warnings` text;

-- Overwrites the stored settings with the Reglamento / Contrato values. Rows saved earlier
-- (seed: 06:00-22:00, 60 min notice, 240 min, 60 min cutoff) would otherwise win over the
-- new code defaults.
INSERT INTO `settings` (`id`, `key`, `value`, `updated_at`) VALUES
	(lower(hex(randomblob(16))), 'operationalHours', '{"start":"08:00","end":"18:00"}', unixepoch()),
	(lower(hex(randomblob(16))), 'minBookingNotice', '30', unixepoch()),
	(lower(hex(randomblob(16))), 'maxBookingDuration', '30', unixepoch()),
	(lower(hex(randomblob(16))), 'cancellationCutoff', '10', unixepoch()),
	(lower(hex(randomblob(16))), 'membershipUsage', '{"annualUsageLimit":36,"overageAmount":350}', unixepoch())
ON CONFLICT(`key`) DO UPDATE SET `value` = excluded.`value`, `updated_at` = excluded.`updated_at`;
