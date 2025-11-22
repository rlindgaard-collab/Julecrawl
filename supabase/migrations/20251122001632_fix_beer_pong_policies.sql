/*
  # Fix Beer Pong RLS Policies

  1. Changes
    - Drop existing beer_pong_games policies
    - Create new policies that allow both anonymous and authenticated users
    - This matches the existing pattern used in other tables

  2. Security
    - Allow anonymous users to read, insert, update, and delete beer pong games
    - This is consistent with the open nature of the bodega crawl app
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can read beer pong games" ON beer_pong_games;
DROP POLICY IF EXISTS "Authenticated users can create beer pong games" ON beer_pong_games;
DROP POLICY IF EXISTS "Authenticated users can update beer pong games" ON beer_pong_games;
DROP POLICY IF EXISTS "Authenticated users can delete beer pong games" ON beer_pong_games;

-- Create new policies that allow both anon and authenticated
CREATE POLICY "Anyone can read beer pong games"
  ON beer_pong_games FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert beer pong games"
  ON beer_pong_games FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update beer pong games"
  ON beer_pong_games FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete beer pong games"
  ON beer_pong_games FOR DELETE
  TO anon, authenticated
  USING (true);
