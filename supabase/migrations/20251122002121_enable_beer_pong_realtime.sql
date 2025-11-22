/*
  # Enable Realtime for Beer Pong Games

  1. Changes
    - Add beer_pong_games table to supabase_realtime publication
    - This enables real-time updates for beer pong games across all clients

  2. Notes
    - Without this, UI won't update automatically when games are created or modified
    - Matches the pattern used for other tables in the app
*/

-- Add beer_pong_games to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE beer_pong_games;
