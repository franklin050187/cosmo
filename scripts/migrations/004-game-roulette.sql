-- Ship roulette: optional per-game flag + per-player random ship draws.
-- Idempotent: safe to re-run (migrate.ts tracks applied ids anyway).

ALTER TABLE games ADD COLUMN IF NOT EXISTS roulette_enabled boolean NOT NULL DEFAULT false;

-- One random ship per player, drawn from the game's collection snapshot.
-- Unique on discord_id OR username (guests only have a username).
CREATE TABLE IF NOT EXISTS game_ship_draws (
  id serial PRIMARY KEY,
  game_id int NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  participant_discord_id text,
  participant_username text NOT NULL,
  ship_id int NOT NULL,
  drawn_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_ship_draws_game_discord ON game_ship_draws (game_id, participant_discord_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_ship_draws_game_username ON game_ship_draws (game_id, participant_username);
CREATE INDEX IF NOT EXISTS idx_game_ship_draws_game ON game_ship_draws (game_id);