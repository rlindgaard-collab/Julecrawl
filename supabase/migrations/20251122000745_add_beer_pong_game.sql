/*
  # Add Beer Pong Game

  1. New Tables
    - `beer_pong_games`
      - `id` (uuid, primary key)
      - `player1_id` (uuid, references participants)
      - `player2_id` (uuid, references participants)
      - `player1_cups` (integer, remaining cups for player 1)
      - `player2_cups` (integer, remaining cups for player 2)
      - `current_turn` (integer, 1 or 2, indicates whose turn it is)
      - `status` (text, 'active' or 'finished')
      - `winner_id` (uuid, nullable, references participants)
      - `created_at` (timestamptz)
      - `finished_at` (timestamptz, nullable)

  2. Security
    - Enable RLS on `beer_pong_games` table
    - Add policy for authenticated users to read all games
    - Add policy for authenticated users to create games
    - Add policy for authenticated users to update games
*/

-- Create beer_pong_games table
CREATE TABLE IF NOT EXISTS beer_pong_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  player1_cups integer NOT NULL DEFAULT 6,
  player2_cups integer NOT NULL DEFAULT 6,
  current_turn integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  winner_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT valid_turn CHECK (current_turn IN (1, 2)),
  CONSTRAINT valid_status CHECK (status IN ('active', 'finished')),
  CONSTRAINT valid_cups CHECK (player1_cups >= 0 AND player1_cups <= 6 AND player2_cups >= 0 AND player2_cups <= 6)
);

-- Enable RLS
ALTER TABLE beer_pong_games ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can read beer pong games"
  ON beer_pong_games FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create beer pong games"
  ON beer_pong_games FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update beer pong games"
  ON beer_pong_games FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete beer pong games"
  ON beer_pong_games FOR DELETE
  TO authenticated
  USING (true);
