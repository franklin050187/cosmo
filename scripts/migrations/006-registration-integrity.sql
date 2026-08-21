-- Registration/contestant integrity: make guest dedupe atomic.
-- The app previously deduped by username in code only; concurrent requests
-- could double-register guests (the (game_id, discord_id) unique index does not
-- constrain NULL discord_ids). These case-insensitive username indexes close
-- that hole; the DB layer now inserts with ON CONFLICT DO NOTHING.
-- Idempotent: safe to re-run (dedupe keeps one row per group).

-- 1. Collapse existing duplicate registrations: prefer rows tied to a logged-in
--    discord_id, then the earliest id. Bracket references are untouched here —
--    game_registrations has no FK dependents.
DELETE FROM game_registrations
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY game_id, LOWER(discord_username)
      ORDER BY (discord_id IS NULL), id
    ) AS rn
    FROM game_registrations
  ) d WHERE d.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_game_registrations_game_username_ci
  ON game_registrations (game_id, LOWER(discord_username));

-- 2. Same for contestants. Deleting a duplicate contestant nulls any bracket
--    slots/winner pointing at it (FK ON DELETE SET NULL); duplicates were never
--    addressable from the UI, so this only affects rows created by the old race.
DELETE FROM game_contestants
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY game_id, LOWER(discord_username)
      ORDER BY (discord_id IS NULL), id
    ) AS rn
    FROM game_contestants
  ) d WHERE d.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_game_contestants_game_username_ci
  ON game_contestants (game_id, LOWER(discord_username));
