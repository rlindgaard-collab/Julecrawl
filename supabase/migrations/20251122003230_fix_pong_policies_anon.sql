/*
  # Fix Pong Game Policies for Anonymous Users

  1. Changes
    - Drop existing restrictive policies
    - Create new policies that allow anonymous (anon) users to play
    - Allow anyone to create, read, and update games

  2. Security
    - Maintains basic security by still requiring valid API key
    - Follows same pattern as other game tables in the app
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view active pong games" ON pong_games;
DROP POLICY IF EXISTS "Anyone can view finished pong games" ON pong_games;
DROP POLICY IF EXISTS "Anyone can create pong games" ON pong_games;
DROP POLICY IF EXISTS "Anyone can update active pong games" ON pong_games;

-- Create new permissive policies for anon users
CREATE POLICY "Anyone can view pong games"
  ON pong_games FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create pong games"
  ON pong_games FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update pong games"
  ON pong_games FOR UPDATE
  USING (true)
  WITH CHECK (true);
