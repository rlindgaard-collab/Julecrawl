/*
  # Bodega Crawl Database Schema

  1. New Tables
    - `participants`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `beers` (integer, default 0)
      - `created_at` (timestamptz)
    
    - `drink_log`
      - `id` (uuid, primary key)
      - `participant_id` (uuid, references participants)
      - `timestamp` (timestamptz)
    
    - `route_stops`
      - `id` (uuid, primary key)
      - `order_index` (integer, not null)
      - `name` (text, not null)
      - `address` (text, not null)
      - `note` (text)
      - `completed` (boolean, default false)
    
    - `crawl_state`
      - `id` (uuid, primary key)
      - `timer_target` (timestamptz)
      - `timer_duration` (integer)
      - `active_stop_id` (uuid, references route_stops)
      - `mood_score` (integer, default 0)
      - `arrival_cooldown_until` (timestamptz)
      - `round_cooldown_until` (timestamptz)
      - `last_round_winner_id` (uuid, references participants)
      - `over_under_streak` (integer, default 0)
      - `over_under_current_card` (jsonb)
      - `over_under_last_card` (jsonb)
      - `over_under_deck` (jsonb)
      - `over_under_message` (text)
      - `over_under_penalty` (integer)
      - `ace_mode` (text, default 'both')
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for public read/write access (party app, no auth needed initially)
*/

-- Create participants table
CREATE TABLE IF NOT EXISTS participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  beers integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read participants"
  ON participants FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert participants"
  ON participants FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update participants"
  ON participants FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete participants"
  ON participants FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create drink_log table
CREATE TABLE IF NOT EXISTS drink_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  timestamp timestamptz DEFAULT now()
);

ALTER TABLE drink_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read drink_log"
  ON drink_log FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert drink_log"
  ON drink_log FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can delete drink_log"
  ON drink_log FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create route_stops table
CREATE TABLE IF NOT EXISTS route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_index integer NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  note text,
  completed boolean DEFAULT false
);

ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read route_stops"
  ON route_stops FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert route_stops"
  ON route_stops FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update route_stops"
  ON route_stops FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete route_stops"
  ON route_stops FOR DELETE
  TO anon, authenticated
  USING (true);

-- Create crawl_state table
CREATE TABLE IF NOT EXISTS crawl_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timer_target timestamptz,
  timer_duration integer DEFAULT 0,
  active_stop_id uuid REFERENCES route_stops(id) ON DELETE SET NULL,
  mood_score integer DEFAULT 0,
  arrival_cooldown_until timestamptz,
  round_cooldown_until timestamptz,
  last_round_winner_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  over_under_streak integer DEFAULT 0,
  over_under_current_card jsonb,
  over_under_last_card jsonb,
  over_under_deck jsonb,
  over_under_message text DEFAULT '',
  over_under_penalty integer,
  ace_mode text DEFAULT 'both',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crawl_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read crawl_state"
  ON crawl_state FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert crawl_state"
  ON crawl_state FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update crawl_state"
  ON crawl_state FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Insert default crawl state
INSERT INTO crawl_state (id, mood_score, over_under_message)
VALUES ('00000000-0000-0000-0000-000000000001', 0, 'Gæt over eller under for næste kort')
ON CONFLICT DO NOTHING;

-- Insert demo route data
INSERT INTO route_stops (order_index, name, address, note, completed) VALUES
(0, 'Start', 'Lektorvej 99', 'Mødes 13.00 - frokost', false),
(1, 'John Bull', 'Østerågade 20', 'Stamsted for broder Ras – måske hænger der et billede af ham', false),
(2, 'Øl & Venner', 'Sankt Hans Torv 3', 'Quiz kl. 14:30', false),
(3, 'Kælderkroen', 'Falkoner Allé 52', 'Bordfodbold kl. 15:30', false),
(4, 'Bodega Blå', 'Blågårdsgade 42', 'DJ fra kl. 17', false),
(5, 'Guldbaren', 'Guldbergsgade 27', '2-for-1 kl. 17:45', false),
(6, 'Natfinalen', 'Rantzausgade 10', 'Sidste runde 19:30', false)
ON CONFLICT DO NOTHING;