import { randomBytes } from "node:crypto";
import { query, fetchAll, fetchOne, transaction, queryOnClient, fetchOneOnClient } from "./core";
import { bumpDbVersion } from "@/lib/cache";

export type GameMode = "pvp" | "tournament" | "campaign";
export type GameVisibility = "public" | "private";
export type GameStatus = "open" | "closed" | "finished";

export interface GameRow {
  id: number;
  owner_discord_id: string;
  owner_name: string;
  title: string;
  description: string;
  game_mode: GameMode;
  visibility: GameVisibility;
  invite_code: string;
  collection_id: number | null;
  status: GameStatus;
  game_date: string;
  register_open_at: string | null;
  register_close_at: string | null;
  roulette_enabled: boolean;
  created_at: string;
}

export interface GameSummaryRow extends GameRow {
  participant_count: number;
  ship_count: number;
}

const GAME_COLUMNS =
  "id, owner_discord_id, owner_name, title, description, game_mode, visibility, invite_code, collection_id, status, game_date, register_open_at, register_close_at, roulette_enabled, created_at";

// Public share-sheet: includes participant/ship tallies.
const GAME_LIST_SELECT = `SELECT g.id, g.owner_discord_id, g.owner_name, g.title, g.description, g.game_mode,
  g.visibility, g.invite_code, g.collection_id, g.status, g.game_date, g.register_open_at, g.register_close_at, g.roulette_enabled, g.created_at,
  (SELECT count(*)::int FROM game_registrations r WHERE r.game_id = g.id) AS participant_count,
  (SELECT count(*)::int FROM game_ships s WHERE s.game_id = g.id) AS ship_count
  FROM games g`;

export function isGameOwner(
  game: Pick<GameRow, "owner_discord_id" | "owner_name">,
  { id, username }: { id: string; username: string },
): boolean {
  if (game.owner_discord_id) return game.owner_discord_id === id;
  return game.owner_name === username;
}

async function makeInviteCode(): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const code = randomBytes(6).toString("base64url"); // 8 chars, URL-safe
    const existing = await fetchOne("SELECT 1 FROM games WHERE invite_code = $1", [code]);
    if (!existing) return code;
  }
  return randomBytes(12).toString("base64url");
}

/** Copy the ship ids from a collection into the game's immutable snapshot. */
export async function snapshotCollectionShips(gameId: number, collectionId: number) {
  const col = await fetchOne("SELECT ships FROM collections WHERE id = $1", [collectionId]);
  if (!col || !Array.isArray(col.ships) || col.ships.length === 0) return;
  await transaction(async (client) => {
    for (const shipId of col.ships) {
      await queryOnClient(
        client,
        "INSERT INTO game_ships (game_id, ship_id) VALUES ($1, $2) ON CONFLICT (game_id, ship_id) DO NOTHING",
        [gameId, shipId],
      );
    }
  });
}

export async function createGame(opts: {
  ownerName: string;
  ownerId: string;
  title: string;
  description: string;
  gameMode: GameMode;
  visibility: GameVisibility;
  collectionId: number | null;
  gameDate: string;
  registerOpenAt?: string | null;
  registerCloseAt?: string | null;
  rouletteEnabled?: boolean;
}) {
  const inviteCode = await makeInviteCode();
  const { rows } = await query(
    `INSERT INTO games (owner_discord_id, owner_name, title, description, game_mode, visibility, invite_code, collection_id, status, game_date, register_open_at, register_close_at, roulette_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11, $12) RETURNING id`,
    [
      opts.ownerId,
      opts.ownerName,
      opts.title,
      opts.description,
      opts.gameMode,
      opts.visibility,
      inviteCode,
      opts.collectionId,
      opts.gameDate,
      opts.registerOpenAt ?? null,
      opts.registerCloseAt ?? null,
      opts.rouletteEnabled ?? false,
    ],
  );
  const id = rows[0]?.id;
  if (id != null && opts.collectionId != null) {
    await snapshotCollectionShips(id, opts.collectionId);
  }
  bumpDbVersion();
  return { id, invite_code: inviteCode };
}

export async function listGames() {
  return fetchAll(`${GAME_LIST_SELECT} WHERE g.visibility = 'public' AND g.game_date >= now() ORDER BY g.game_date ASC`);
}

/** Upcoming public games, nearest first — used on the home page. */
export async function listUpcomingGames(limit: number) {
  return fetchAll(
    `${GAME_LIST_SELECT} WHERE g.visibility = 'public' AND g.game_date >= now() ORDER BY g.game_date ASC LIMIT $1`,
    [limit],
  );
}

/** Past public games (recent first) — shown on the games page only when opted in. */
export async function listPastGames() {
  return fetchAll(`${GAME_LIST_SELECT} WHERE g.visibility = 'public' AND g.game_date < now() ORDER BY g.game_date DESC`);
}

export async function listMyGames(discordId: string, username: string) {
  return fetchAll(
    `${GAME_LIST_SELECT}
     WHERE g.owner_discord_id = $1 OR g.owner_name = $2 OR EXISTS (
       SELECT 1 FROM game_registrations r WHERE r.game_id = g.id AND (r.discord_id = $1 OR LOWER(r.discord_username) = LOWER($2))
     )
     ORDER BY g.created_at DESC`,
    [discordId, username],
  );
}

export async function getGame(id: number) {
  const game = await fetchOne(`SELECT ${GAME_COLUMNS} FROM games WHERE id = $1`, [id]);
  if (!game) return null;
  return getGameDetail(game);
}

export async function getGameByInviteCode(code: string) {
  const game = await fetchOne(`SELECT ${GAME_COLUMNS} FROM games WHERE invite_code = $1`, [code]);
  if (!game) return null;
  return getGameDetail(game);
}

async function getGameDetail(game: GameRow) {
  const collection = game.collection_id
    ? await fetchOne("SELECT id, title FROM collections WHERE id = $1", [game.collection_id])
    : null;
  const ships = await fetchAll(
    "SELECT s.id, s.ship_name, s.data FROM game_ships gs JOIN shipdb s ON s.id = gs.ship_id WHERE gs.game_id = $1 ORDER BY gs.id",
    [game.id],
  );
  const participants = await fetchAll(
    "SELECT discord_id, discord_username, registered_at FROM game_registrations WHERE game_id = $1 ORDER BY registered_at",
    [game.id],
  );
  const contestants = await fetchAll(
    "SELECT id, discord_id, discord_username, seed FROM game_contestants WHERE game_id = $1 ORDER BY seed, id",
    [game.id],
  );
  const matchRows = await fetchAll(
    "SELECT id, round, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1 ORDER BY round, position",
    [game.id],
  );
  const names = new Map<number, string>();
  for (const c of contestants) names.set(c.id, c.discord_username);
  const matches = matchRows.map((m) => ({
    ...m,
    a_username: m.contestant_a != null ? names.get(m.contestant_a) ?? null : null,
    b_username: m.contestant_b != null ? names.get(m.contestant_b) ?? null : null,
    winner_username: m.winner != null ? names.get(m.winner) ?? null : null,
  }));
  const draws = await fetchAll(
    "SELECT d.participant_username, d.ship_id, s.ship_name FROM game_ship_draws d JOIN shipdb s ON s.id = d.ship_id WHERE d.game_id = $1 ORDER BY d.id",
    [game.id],
  );
  return { ...game, collection, ships, participants, contestants, matches, draws };
}

/** Deal one random snapshot ship to every registered player. Re-dealing replaces all draws. */
export async function dealShips(gameId: number, ownerName: string, ownerId: string) {
  const game = await fetchOne(
    "SELECT owner_discord_id, owner_name, roulette_enabled FROM games WHERE id = $1",
    [gameId],
  );
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (!game.roulette_enabled) return { error: "ship roulette is not enabled" };

  const ships = await fetchAll("SELECT ship_id FROM game_ships WHERE game_id = $1 ORDER BY id", [gameId]);
  if (ships.length === 0) return { error: "no ships in the linked collection" };

  const participants = await fetchAll(
    "SELECT discord_id, discord_username FROM game_registrations WHERE game_id = $1 ORDER BY registered_at",
    [gameId],
  );
  if (participants.length === 0) return { error: "no players have registered" };

  await transaction(async (client) => {
    await queryOnClient(client, "DELETE FROM game_ship_draws WHERE game_id = $1", [gameId]);
    const ids = ships.map((s) => s.ship_id);
    for (const p of participants) {
      const shipId = ids[Math.floor(Math.random() * ids.length)];
      await queryOnClient(
        client,
        "INSERT INTO game_ship_draws (game_id, participant_discord_id, participant_username, ship_id) VALUES ($1, $2, $3, $4)",
        [gameId, p.discord_id, p.discord_username, shipId],
      );
    }
  });

  bumpDbVersion();
  return { success: "ships dealt", players: participants.length };
}

export async function updateGame(
  id: number,
  ownerName: string,
  ownerId: string,
  fields: {
    title?: string;
    description?: string;
    game_mode?: GameMode;
    visibility?: GameVisibility;
    status?: GameStatus;
    collection_id?: number | null;
    game_date?: string;
    register_open_at?: string | null;
    register_close_at?: string | null;
    roulette_enabled?: boolean;
  },
) {
  const game = await fetchOne("SELECT owner_discord_id, owner_name FROM games WHERE id = $1", [id]);
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };

  const sets: string[] = [];
  const args: unknown[] = [];
  let idx = 1;
  if (fields.title !== undefined) {
    sets.push(`title = $${idx++}`);
    args.push(fields.title);
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${idx++}`);
    args.push(fields.description);
  }
  if (fields.game_mode !== undefined) {
    sets.push(`game_mode = $${idx++}`);
    args.push(fields.game_mode);
  }
  if (fields.visibility !== undefined) {
    sets.push(`visibility = $${idx++}`);
    args.push(fields.visibility);
  }
  if (fields.status !== undefined) {
    sets.push(`status = $${idx++}`);
    args.push(fields.status);
  }
  if (fields.collection_id !== undefined) {
    sets.push(`collection_id = $${idx++}`);
    args.push(fields.collection_id);
  }
  if (fields.game_date !== undefined) {
    sets.push(`game_date = $${idx++}`);
    args.push(fields.game_date);
  }
  if (fields.register_open_at !== undefined) {
    sets.push(`register_open_at = $${idx++}`);
    args.push(fields.register_open_at);
  }
  if (fields.register_close_at !== undefined) {
    sets.push(`register_close_at = $${idx++}`);
    args.push(fields.register_close_at);
  }
  if (fields.roulette_enabled !== undefined) {
    sets.push(`roulette_enabled = $${idx++}`);
    args.push(fields.roulette_enabled);
  }
  if (sets.length === 0) return { error: "nothing to update" };

  args.push(id, ownerId, ownerName);
  await query(
    `UPDATE games SET ${sets.join(", ")} WHERE id = $${idx++} AND (owner_discord_id = $${idx++} OR owner_name = $${idx++})`,
    args,
  );
  if (fields.collection_id != null) {
    await snapshotCollectionShips(id, fields.collection_id);
  }
  bumpDbVersion();
  return { success: "game updated" };
}

export async function deleteGame(id: number, ownerName: string, ownerId: string) {
  const game = await fetchOne("SELECT owner_discord_id, owner_name FROM games WHERE id = $1", [id]);
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  await query("DELETE FROM games WHERE id = $1 AND (owner_discord_id = $2 OR owner_name = $3)", [id, ownerId, ownerName]);
  bumpDbVersion();
  return { success: "game deleted" };
}

export async function registerForGame(
  gameId: number,
  opts: { discordId: string | null; username: string; inviteCode?: string | null },
) {
  const game = await fetchOne(
    "SELECT id, visibility, invite_code, status, register_open_at, register_close_at FROM games WHERE id = $1",
    [gameId],
  );
  if (!game) return { error: "not found" };
  if (game.status !== "open") return { error: "registrations closed" };
  if (game.visibility === "private") {
    if (!opts.inviteCode || game.invite_code !== opts.inviteCode) {
      return { error: "invalid invite code" };
    }
  }
  const now = Date.now();
  if (game.register_open_at && now < new Date(game.register_open_at).getTime()) {
    return { error: "registrations not open yet" };
  }
  if (game.register_close_at && now > new Date(game.register_close_at).getTime()) {
    return { error: "registration window closed" };
  }
  const existing = await fetchOne(
    "SELECT 1 FROM game_registrations WHERE game_id = $1 AND (discord_id = $2 OR LOWER(discord_username) = LOWER($3))",
    [gameId, opts.discordId, opts.username],
  );
  if (existing) return { warning: "already registered" };
  await query(
    "INSERT INTO game_registrations (game_id, discord_id, discord_username) VALUES ($1, $2, $3)",
    [gameId, opts.discordId, opts.username],
  );
  bumpDbVersion();
  return { success: "registered" };
}

export async function leaveGame(gameId: number, opts: { discordId: string | null; username: string }) {
  const game = await fetchOne("SELECT id FROM games WHERE id = $1", [gameId]);
  if (!game) return { error: "not found" };
  const result = await query(
    "DELETE FROM game_registrations WHERE game_id = $1 AND (discord_id = $2 OR LOWER(discord_username) = LOWER($3))",
    [gameId, opts.discordId, opts.username],
  );
  bumpDbVersion();
  if ((result.rowCount ?? 0) === 0) return { warning: "not registered" };
  return { success: "left game" };
}

/** Resolve a typed-in Discord username to a known discord_id, if one exists. */
export async function resolveUsernameToDiscordId(username: string): Promise<string | null> {
  const row = await fetchOne("SELECT discord_id FROM favoritedb WHERE name = $1", [username]);
  return row?.discord_id ?? null;
}

// --- Tournament roster + bracket -------------------------------------------------

export async function addContestant(
  gameId: number,
  ownerName: string,
  ownerId: string,
  opts: { discordId: string | null; username: string },
) {
  const game = await fetchOne("SELECT owner_discord_id, owner_name, game_mode FROM games WHERE id = $1", [gameId]);
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (game.game_mode !== "tournament") return { error: "not a tournament" };

  const already = await fetchOne(
    "SELECT 1 FROM game_contestants WHERE game_id = $1 AND (discord_id = $2 OR LOWER(discord_username) = LOWER($3))",
    [gameId, opts.discordId, opts.username],
  );
  if (already) return { warning: "already a contestant" };

  // Owners may add anyone by username — no registration required. Any player
  // manually added is also registered so they show up in the roster.
  await transaction(async (client) => {
    const registered = await fetchOneOnClient(
      client,
      "SELECT 1 FROM game_registrations WHERE game_id = $1 AND (discord_id = $2 OR LOWER(discord_username) = LOWER($3))",
      [gameId, opts.discordId, opts.username],
    );
    if (!registered) {
      await queryOnClient(
        client,
        "INSERT INTO game_registrations (game_id, discord_id, discord_username) VALUES ($1, $2, $3)",
        [gameId, opts.discordId, opts.username],
      );
    }

    const existing = await fetchOneOnClient(
      client,
      "SELECT 1 FROM game_contestants WHERE game_id = $1 AND (discord_id = $2 OR LOWER(discord_username) = LOWER($3))",
      [gameId, opts.discordId, opts.username],
    );
    if (existing) return;

    const seedRow = await fetchOneOnClient(
      client,
      "SELECT COALESCE(MAX(seed), -1) + 1 AS next_seed FROM game_contestants WHERE game_id = $1",
      [gameId],
    );
    await queryOnClient(
      client,
      "INSERT INTO game_contestants (game_id, discord_id, discord_username, seed) VALUES ($1, $2, $3, $4)",
      [gameId, opts.discordId, opts.username, seedRow?.next_seed ?? 0],
    );
  });

  bumpDbVersion();
  return { success: "contestant added" };
}

export async function removeContestant(
  gameId: number,
  ownerName: string,
  ownerId: string,
  opts: { discordId: string | null; username: string },
) {
  const game = await fetchOne("SELECT owner_discord_id, owner_name, game_mode FROM games WHERE id = $1", [gameId]);
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (game.game_mode !== "tournament") return { error: "not a tournament" };

  const result = await query(
    "DELETE FROM game_contestants WHERE game_id = $1 AND (discord_id = $2 OR LOWER(discord_username) = LOWER($3))",
    [gameId, opts.discordId, opts.username],
  );
  bumpDbVersion();
  if ((result.rowCount ?? 0) === 0) return { warning: "not a contestant" };
  return { success: "contestant removed" };
}

function nextPowerOfTwo(n: number) {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

export async function generateBracket(
  gameId: number,
  ownerName: string,
  ownerId: string,
  opts: { shuffle?: boolean } = {},
) {
  const game = await fetchOne("SELECT owner_discord_id, owner_name, game_mode FROM games WHERE id = $1", [gameId]);
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (game.game_mode !== "tournament") return { error: "not a tournament" };

  const contestants = await fetchAll(
    "SELECT id FROM game_contestants WHERE game_id = $1 ORDER BY seed, id",
    [gameId],
  );
  if (contestants.length < 2) return { error: "need at least 2 contestants" };

  const order: number[] = contestants.map((c) => c.id);
  if (opts.shuffle !== false) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }

  const n = order.length;
  const size = nextPowerOfTwo(n);
  const rounds = Math.round(Math.log2(size));
  const pairsCount = size / 2;
  const fullPairs = n - pairsCount;

  // Round-1 pairing: `fullPairs` matches of two real contestants, then the
  // remaining contestants each get a single bye (one contestant vs null).
  // Byes only ever occur in round 1 and no pair is null-vs-null, so a player
  // can never chain empty-slot auto-wins into the final.
  const r1: Array<[number | null, number | null]> = [];
  let cidx = 0;
  for (let p = 0; p < pairsCount; p++) {
    r1.push(p < fullPairs ? [order[cidx++], order[cidx++]] : [order[cidx++], null]);
  }

  await transaction(async (client) => {
    await queryOnClient(client, "DELETE FROM game_matches WHERE game_id = $1", [gameId]);
    for (let i = 0; i < order.length; i++) {
      await queryOnClient(
        client,
        "UPDATE game_contestants SET seed = $1 WHERE id = $2 AND game_id = $3",
        [i, order[i], gameId],
      );
    }
    let current: Array<number | null> = [];
    for (const [a, b] of r1) current.push(a, b);
    for (let round = 1; round <= rounds; round++) {
      const next: Array<number | null> = [];
      for (let i = 0; i < current.length; i += 2) {
        const a = current[i];
        const b = current[i + 1];
        const position = i / 2;
        // Byes only exist in round 1; in later rounds a null side means "TBD"
        // (that round's winner hasn't been recorded yet) and is never an auto-win.
        let winner: number | null = null;
        if (round === 1) {
          if (a != null && b == null) winner = a;
          else if (b != null && a == null) winner = b;
        }
        await queryOnClient(
          client,
          "INSERT INTO game_matches (game_id, round, position, contestant_a, contestant_b, winner) VALUES ($1, $2, $3, $4, $5, $6)",
          [gameId, round, position, a, b, winner],
        );
        next.push(winner);
      }
      current = next;
    }
  });

  bumpDbVersion();
  return { success: "bracket generated", size, rounds };
}

export async function setMatchWinner(
  gameId: number,
  ownerName: string,
  ownerId: string,
  matchId: number,
  winnerId: number,
) {
  const match = await fetchOne(
    `SELECT gm.id, gm.round, gm.position, gm.contestant_a, gm.contestant_b,
            g.owner_discord_id, g.owner_name
     FROM game_matches gm JOIN games g ON g.id = gm.game_id
     WHERE gm.id = $1 AND gm.game_id = $2`,
    [matchId, gameId],
  );
  if (!match) return { error: "not found" };
  if (!isGameOwner(match, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (winnerId !== match.contestant_a && winnerId !== match.contestant_b) {
    return { error: "invalid winner" };
  }

  await transaction(async (client) => {
    await queryOnClient(
      client,
      "UPDATE game_matches SET winner = $1 WHERE id = $2 AND game_id = $3",
      [winnerId, matchId, gameId],
    );
    // Advance the winner into the next round (position of this match, left side
    // if even, right side if odd). Bye slots are refilled only when still empty.
    const next = await fetchOneOnClient(
      client,
      "SELECT id FROM game_matches WHERE game_id = $1 AND round = $2 AND position = $3",
      [gameId, match.round + 1, Math.floor(match.position / 2)],
    );
    if (next) {
      const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
      await queryOnClient(
        client,
        `UPDATE game_matches SET ${slot} = $1 WHERE id = $2 AND ${slot} IS NULL`,
        [winnerId, next.id],
      );
    }
  });

  bumpDbVersion();
  return { success: "winner recorded" };
}

/** Clear a recorded winner so the owner can re-pick (un-advances the bracket). */
export async function resetMatchWinner(
  gameId: number,
  ownerName: string,
  ownerId: string,
  matchId: number,
) {
  const match = await fetchOne(
    `SELECT gm.id, gm.round, gm.position, gm.winner,
            g.owner_discord_id, g.owner_name
     FROM game_matches gm JOIN games g ON g.id = gm.game_id
     WHERE gm.id = $1 AND gm.game_id = $2`,
    [matchId, gameId],
  );
  if (!match) return { error: "not found" };
  if (!isGameOwner(match, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (match.winner == null) return { warning: "no winner set" };

  await transaction(async (client) => {
    await queryOnClient(
      client,
      "UPDATE game_matches SET winner = NULL WHERE id = $1 AND game_id = $2",
      [matchId, gameId],
    );
    // Remove the winner from the next round slot it advanced into (only if it
    // still holds that exact contestant).
    const next = await fetchOneOnClient(
      client,
      "SELECT id FROM game_matches WHERE game_id = $1 AND round = $2 AND position = $3",
      [gameId, match.round + 1, Math.floor(match.position / 2)],
    );
    if (next) {
      const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
      await queryOnClient(
        client,
        `UPDATE game_matches SET ${slot} = NULL WHERE id = $1 AND ${slot} = $2`,
        [next.id, match.winner],
      );
    }
  });

  bumpDbVersion();
  return { success: "winner cleared" };
}