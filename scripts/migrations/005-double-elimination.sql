-- Phase 4: Double-elimination brackets.
-- Adds bracket type to games, bracket grouping to matches, and loss tracking
-- to contestants. Idempotent: safe to re-run (migrate.ts tracks applied ids).

-- Bracket format for a tournament game.
ALTER TABLE games ADD COLUMN IF NOT EXISTS bracket_type text NOT NULL DEFAULT 'single_elim'
  CHECK (bracket_type IN ('single_elim', 'double_elim'));

-- Which sub-bracket a match belongs to. Existing single-elimination matches are
-- all 'winners' (a single-elim bracket is just the winners bracket).
ALTER TABLE game_matches ADD COLUMN IF NOT EXISTS bracket text NOT NULL DEFAULT 'winners'
  CHECK (bracket IN ('winners', 'losers', 'grand_final'));

-- Losses accumulate per contestant. In double elimination a contestant is
-- eliminated once they reach 2 losses (single elimination: 1).
ALTER TABLE game_contestants ADD COLUMN IF NOT EXISTS losses int NOT NULL DEFAULT 0;

-- Match identity is now per-bracket: round+position is unique within each
-- sub-bracket (winners, losers, grand_final) but not across them.
DROP INDEX IF EXISTS ux_game_matches_game_round_pos;
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_matches_game_bracket_round_pos
  ON game_matches (game_id, bracket, round, position);