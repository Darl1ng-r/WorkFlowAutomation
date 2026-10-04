-- Add missing source column to room_bookings
ALTER TABLE room_bookings ADD COLUMN source TEXT NOT NULL DEFAULT 'OFFICE_OS';
