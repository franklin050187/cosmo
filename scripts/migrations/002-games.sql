-- Game Planning: games, ship snapshots, registrations, and tournament brackets.
-- Idempotent: safe to re-run (migrate.ts tracks applied ids anyway).

CREATE TABLE IF NOT EXISTS games (
  id serial PRIMARY KEY,
  owner_discord_id text NOT NULL,
  owner_name text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  game_mode text NOT NULL DEFAULT 'pvp' CHECK (game_mode IN ('pvp', 'tournament', 'campaign')),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  invite_code text NOT NULL,
  collection_id int,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'finished')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_games_invite_code ON games (invite_code);
CREATE INDEX IF NOT EXISTS idx_games_discord_id ON games (owner_discord_id);
CREATE INDEX IF NOT EXISTS idx_games_visibility_created ON games (visibility, created_at DESC);

-- Snapshot of the ship ids linked at game creation (stable even if the source
-- collection changes later).
CREATE TABLE IF NOT EXISTS game_ships (
  id serial PRIMARY KEY,
  game_id int NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ship_id int NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_ships_game_ship ON game_ships (game_id, ship_id);
CREATE INDEX IF NOT EXISTS idx_game_ships_game ON game_ships (game_id);

-- Player registrations. discord_id is null for guest signups resolved only by
-- a Discord username; the app dedupes those by username in code.
CREATE TABLE IF NOT EXISTS game_registrations (
  id serial PRIMARY KEY,
  game_id int NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  discord_id text,
  discord_username text NOT NULL,
  registered_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_registrations_game_discord ON game_registrations (game_id, discord_id);
CREATE INDEX IF NOT EXISTS idx_game_registrations_game ON game_registrations (game_id);

-- Tournament contestants picked by the owner from the registered players.
CREATE TABLE IF NOT EXISTS game_contestants (
  id serial PRIMARY KEY,
  game_id int NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  discord_id text,
  discord_username text NOT NULL,
  seed int NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_contestants_game_discord ON game_contestants (game_id, discord_id);
CREATE INDEX IF NOT EXISTS idx_game_contestants_game_seed ON game_contestants (game_id, seed);

-- Single-elimination bracket. Contestant slots reference game_contestants.id;
-- null = a bye (the placeholder opponent that auto-advances).
CREATE TABLE IF NOT EXISTS game_matches (
  id serial PRIMARY KEY,
  game_id int NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round int NOT NULL,
  position int NOT NULL,
  contestant_a int REFERENCES game_contestants(id) ON DELETE SET NULL,
  contestant_b int REFERENCES game_contestants(id) ON DELETE SET NULL,
  winner int REFERENCES game_contestants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_game_matches_game_round_pos ON game_matches (game_id, round, position);
CREATE INDEX IF NOT EXISTS idx_game_matches_game ON game_matches (game_id);