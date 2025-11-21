/*
  # Add Active Player to Game State

  1. Changes
    - Add `over_under_active_player_id` column to `crawl_state` table
      - References participants table
      - Nullable (no active player means anyone can play)
      - Tracks who currently controls the over/under game
  
  2. Security
    - No RLS changes needed (existing policies cover new column)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crawl_state' AND column_name = 'over_under_active_player_id'
  ) THEN
    ALTER TABLE crawl_state ADD COLUMN over_under_active_player_id uuid REFERENCES participants(id) ON DELETE SET NULL;
  END IF;
END $$;