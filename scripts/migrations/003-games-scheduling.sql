-- Game scheduling: mandatory game day + optional registration window.
-- Idempotent: safe to re-run (migrate.ts tracks applied ids anyway).

-- Day of the game — mandatory. Backfill existing rows, then enforce NOT NULL
-- so every new game must declare a date.
ALTER TABLE games ADD COLUMN IF NOT EXISTS game_date timestamptz;
UPDATE games SET game_date = created_at WHERE game_date IS NULL;
ALTER TABLE games ALTER COLUMN game_date SET NOT NULL;

-- Optional registration window (both null = no window).
ALTER TABLE games ADD COLUMN IF NOT EXISTS register_open_at timestamptz;
ALTER TABLE games ADD COLUMN IF NOT EXISTS register_close_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_games_game_date ON games (game_date);