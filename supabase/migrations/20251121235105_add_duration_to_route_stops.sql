/*
  # Add duration to route stops

  1. Changes
    - Add `duration_minutes` column to `route_stops` table
    - Default value: 40 minutes
    - Update all existing stops to 40 minutes
*/

-- Add duration_minutes column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'route_stops' AND column_name = 'duration_minutes'
  ) THEN
    ALTER TABLE route_stops ADD COLUMN duration_minutes integer DEFAULT 40;
  END IF;
END $$;

-- Update all existing stops to 40 minutes
UPDATE route_stops SET duration_minutes = 40 WHERE duration_minutes IS NULL;