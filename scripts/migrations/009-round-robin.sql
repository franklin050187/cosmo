-- 009: Round-robin tournaments.
-- Extends the format and match-group enums. Matches use bracket='rr' with the
-- same unique (game_id, bracket, round, position) identity.

ALTER TABLE games DROP CONSTRAINT IF EXISTS games_bracket_type_check;
ALTER TABLE games ADD CONSTRAINT games_bracket_type_check
  CHECK (bracket_type IN ('single_elim', 'double_elim', 'round_robin'));

ALTER TABLE game_matches DROP CONSTRAINT IF EXISTS game_matches_bracket_check;
ALTER TABLE game_matches ADD CONSTRAINT game_matches_bracket_check
  CHECK (bracket IN ('winners', 'losers', 'grand_final', 'rr'));
