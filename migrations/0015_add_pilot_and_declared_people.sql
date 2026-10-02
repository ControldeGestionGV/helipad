-- Migration: Optional pilot name and declared number of people on bookings
-- Created: 2026-10-01

-- Reglamento Art. 6.2 (ii) and (iv). Both optional: they never block a booking.
-- declared_people = people who will access (passengers, lounge guests, crew); NULL = not
-- declared, the number of registered passengers applies. Also the basis for the QR scan
-- limit (Art. 6.5).
ALTER TABLE `bookings` ADD `pilot_name` text;
ALTER TABLE `bookings` ADD `declared_people` integer;
