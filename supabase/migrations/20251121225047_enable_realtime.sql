/*
  # Enable Real-time for all tables

  This migration enables Supabase real-time subscriptions for all tables in the schema.
  This allows multiple users to see updates instantly without refreshing.

  1. Changes
    - Add all tables to the supabase_realtime publication
    - Enables real-time sync for participants, drink_log, route_stops, and crawl_state tables
*/

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE participants;
ALTER PUBLICATION supabase_realtime ADD TABLE drink_log;
ALTER PUBLICATION supabase_realtime ADD TABLE route_stops;
ALTER PUBLICATION supabase_realtime ADD TABLE crawl_state;