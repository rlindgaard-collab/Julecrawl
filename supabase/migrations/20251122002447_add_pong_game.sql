/*
  # Add Classic Pong Game

  1. New Tables
    - `pong_games`
      - `id` (uuid, primary key)
      - `player1_id` (uuid, references participants)
      - `player2_id` (uuid, references participants)
      - `player1_score` (integer, default 0)
      - `player2_score` (integer, default 0)
      - `ball_x` (real, ball x position 0-100)
      - `ball_y` (real, ball y position 0-100)
      - `ball_dx` (real, ball x velocity)
      - `ball_dy` (real, ball y velocity)
      - `paddle1_y` (real, player 1 paddle position 0-100)
      - `paddle2_y` (real, player 2 paddle position 0-100)
      - `status` (text, active/finished)
      - `winner_id` (uuid, references participants)
      - `created_at` (timestamptz)
      - `finished_at` (timestamptz)
      - `last_update` (timestamptz)

  2. Security
    - Enable RLS on pong_games table
    - Add policies for authenticated users to read active games
    - Add policies for players to update their paddle positions
    - Add policy for game state updates

  3. Notes
    - Game state stored in database for real-time multiplayer sync
    - First to 5 points wins
    - Ball position and velocity tracked for smooth gameplay
*/

-- Create pong_games table
CREATE TABLE IF NOT EXISTS pong_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  player1_score integer DEFAULT 0 NOT NULL,
  player2_score integer DEFAULT 0 NOT NULL,
  ball_x real DEFAULT 50 NOT NULL,
  ball_y real DEFAULT 50 NOT NULL,
  ball_dx real DEFAULT 1 NOT NULL,
  ball_dy real DEFAULT 1 NOT NULL,
  paddle1_y real DEFAULT 50 NOT NULL,
  paddle2_y real DEFAULT 50 NOT NULL,
  status text DEFAULT 'active' NOT NULL CHECK (status IN ('active', 'finished')),
  winner_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz,
  last_update timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT different_players CHECK (player1_id != player2_id)
);

-- Enable RLS
ALTER TABLE pong_games ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active games
CREATE POLICY "Anyone can view active pong games"
  ON pong_games FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Policy: Anyone can view finished games
CREATE POLICY "Anyone can view finished pong games"
  ON pong_games FOR SELECT
  TO authenticated
  USING (status = 'finished');

-- Policy: Anyone can create games
CREATE POLICY "Anyone can create pong games"
  ON pong_games FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Anyone can update active games
CREATE POLICY "Anyone can update active pong games"
  ON pong_games FOR UPDATE
  TO authenticated
  USING (status = 'active')
  WITH CHECK (status IN ('active', 'finished'));

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE pong_games;
