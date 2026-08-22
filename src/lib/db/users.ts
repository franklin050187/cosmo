import { queryOnClient, fetchOne, transaction } from "./core";
import { bumpDbVersion } from "@/lib/cache";

export interface ShipRow {
  id: number;
  name: string;
  data: string;
  submitted_by: string;
  discord_id: string | null;
  description: string;
  ship_name: string;
  author: string;
  price: number;
  brand: string;
  crew: number;
  tags: string[];
  downloads: number;
  fav: number;
  date: string;
}

export interface CollectionRow {
  id: number;
  owner: string;
  discord_id: string | null;
  title: string;
  description: string;
  ships: number[];
  created_at: string;
}

export function isShipOwner(row: Pick<ShipRow, "discord_id" | "submitted_by">, { id, username }: { id: string; username: string }): boolean {
  if (row.discord_id) return row.discord_id === id;
  return row.submitted_by === username;
}

export function isCollectionOwner(row: Pick<CollectionRow, "discord_id" | "owner">, { id, username }: { id: string; username: string }): boolean {
  if (row.discord_id) return row.discord_id === id;
  return row.owner === username;
}

/**
 * Runs on every OAuth login to migrate records left under an old Discord username.
 *
 * (A) Adopt legacy rows matching any candidate name (`username#disc`, the bare
 *     pre-`discord_id` form, and the previous cookie username) that are not yet
 *     linked by `discord_id` — repairs rows orphaned by the old app's
 *     `username#discriminator` format or a rename. Rows already linked to a
 *     different Discord account are never touched.
 * (B) Refresh the current username on rows already anchored to this Discord ID,
 *     so `submitted_by`/`owner`/`name` stay current after a rename.
 */
export async function migrateUsernameOnLogin(
  userId: string,
  newUsername: string,
  prevUsername: string | null,
  bareUsername: string,
) {
  const candidates = [...new Set([newUsername, bareUsername, prevUsername].filter(Boolean))] as string[];

  // Skip the twelve-statement migration entirely when there is nothing to
  // migrate: no unclaimed legacy rows match, and the anchored rows already
  // carry the current name.
  const pending = await fetchOne(
    `SELECT EXISTS(
       SELECT 1 FROM shipdb WHERE discord_id IS NULL AND submitted_by = ANY($1::text[])
     ) OR EXISTS(
       SELECT 1 FROM collections WHERE discord_id IS NULL AND owner = ANY($1::text[])
     ) OR EXISTS(
       SELECT 1 FROM favoritedb WHERE discord_id IS NULL AND name = ANY($1::text[])
     ) OR EXISTS(
       SELECT 1 FROM games WHERE owner_discord_id IS NULL AND owner_name = ANY($1::text[])
     ) OR EXISTS(
       SELECT 1 FROM game_registrations WHERE discord_id IS NULL AND discord_username = ANY($1::text[])
     ) OR EXISTS(
       SELECT 1 FROM game_contestants WHERE discord_id IS NULL AND discord_username = ANY($1::text[])
     ) OR EXISTS(
       SELECT 1 FROM shipdb WHERE discord_id = $2 AND submitted_by <> $3
     ) OR EXISTS(
       SELECT 1 FROM collections WHERE discord_id = $2 AND owner <> $3
     ) OR EXISTS(
       SELECT 1 FROM favoritedb WHERE discord_id = $2 AND name <> $3
     ) OR EXISTS(
       SELECT 1 FROM games WHERE owner_discord_id = $2 AND owner_name <> $3
     ) OR EXISTS(
       SELECT 1 FROM game_registrations WHERE discord_id = $2 AND discord_username <> $3
     ) OR EXISTS(
       SELECT 1 FROM game_contestants WHERE discord_id = $2 AND discord_username <> $3
     ) AS needs_migration`,
    [candidates, userId, newUsername],
  );
  if (!pending?.needs_migration) return;

  await transaction(async (client) => {
    await queryOnClient(
      client,
      "UPDATE shipdb SET submitted_by = $1, discord_id = $2 WHERE discord_id IS NULL AND submitted_by = ANY($3::text[])",
      [newUsername, userId, candidates],
    );
    await queryOnClient(
      client,
      "UPDATE collections SET owner = $1, discord_id = $2 WHERE discord_id IS NULL AND owner = ANY($3::text[])",
      [newUsername, userId, candidates],
    );
    await queryOnClient(
      client,
      "UPDATE favoritedb SET name = $1, discord_id = $2 WHERE discord_id IS NULL AND name = ANY($3::text[])",
      [newUsername, userId, candidates],
    );
    await queryOnClient(
      client,
      "UPDATE games SET owner_name = $1, owner_discord_id = $2 WHERE owner_discord_id IS NULL AND owner_name = ANY($3::text[])",
      [newUsername, userId, candidates],
    );
    await queryOnClient(
      client,
      "UPDATE game_registrations SET discord_username = $1, discord_id = $2 WHERE discord_id IS NULL AND discord_username = ANY($3::text[])",
      [newUsername, userId, candidates],
    );
    await queryOnClient(
      client,
      "UPDATE game_contestants SET discord_username = $1, discord_id = $2 WHERE discord_id IS NULL AND discord_username = ANY($3::text[])",
      [newUsername, userId, candidates],
    );
    await queryOnClient(
      client,
      "UPDATE shipdb SET submitted_by = $1 WHERE discord_id = $2 AND submitted_by <> $1",
      [newUsername, userId],
    );
    await queryOnClient(
      client,
      "UPDATE collections SET owner = $1 WHERE discord_id = $2 AND owner <> $1",
      [newUsername, userId],
    );
    await queryOnClient(
      client,
      "UPDATE favoritedb SET name = $1 WHERE discord_id = $2 AND name <> $1",
      [newUsername, userId],
    );
    await queryOnClient(
      client,
      "UPDATE games SET owner_name = $1 WHERE owner_discord_id = $2 AND owner_name <> $1",
      [newUsername, userId],
    );
    await queryOnClient(
      client,
      "UPDATE game_registrations SET discord_username = $1 WHERE discord_id = $2 AND discord_username <> $1",
      [newUsername, userId],
    );
    await queryOnClient(
      client,
      "UPDATE game_contestants SET discord_username = $1 WHERE discord_id = $2 AND discord_username <> $1",
      [newUsername, userId],
    );
    bumpDbVersion();
  });
}