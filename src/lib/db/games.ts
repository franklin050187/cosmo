import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { query, fetchAll, fetchOne, transaction, queryOnClient, fetchOneOnClient, fetchAllOnClient } from "./core";
import { bumpDbVersion } from "@/lib/cache";
import { computeChampionFromSlots } from "@/lib/bracket-util";
import type { GameMode, GameStatus, GameVisibility, BracketType, BracketName } from "@/lib/games-types";

export type { GameMode, GameStatus, GameVisibility, BracketType, BracketName } from "@/lib/games-types";

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
  bracket_type: BracketType;
  created_at: string;
}

export interface GameSummaryRow extends GameRow {
  participant_count: number;
  ship_count: number;
}

const GAME_COLUMNS =
  "id, owner_discord_id, owner_name, title, description, game_mode, visibility, invite_code, collection_id, status, game_date, register_open_at, register_close_at, roulette_enabled, bracket_type, created_at";

// Public share-sheet: includes participant/ship tallies.
const GAME_LIST_SELECT = `SELECT g.id, g.owner_discord_id, g.owner_name, g.title, g.description, g.game_mode,
  g.visibility, g.invite_code, g.collection_id, g.status, g.game_date, g.register_open_at, g.register_close_at, g.roulette_enabled, g.bracket_type, g.created_at,
  (SELECT count(*)::int FROM game_registrations r WHERE r.game_id = g.id) AS participant_count,
  (SELECT count(*)::int FROM game_ships s WHERE s.game_id = g.id) AS ship_count
  FROM games g`;

export function isGameOwner(
  game: Pick<GameRow, "owner_name"> & { owner_discord_id: string | null },
  { id, username }: { id: string; username: string },
) {
  if (game.owner_discord_id) return game.owner_discord_id === id;
  return game.owner_name.toLowerCase() === username.toLowerCase();
}

type InviteViewer = { id: string; username: string } | null;

function canViewInviteCode(
  game: {
    owner_discord_id: string | null;
    owner_name: string;
    participants?: Array<{ discord_id: string | null; discord_username: string }>;
  },
  viewer: InviteViewer,
): boolean {
  if (!viewer) return false;
  if (isGameOwner(game, viewer)) return true;
  return !!game.participants?.some(
    (p) =>
      (p.discord_id != null && p.discord_id === viewer.id) ||
      p.discord_username.toLowerCase() === viewer.username.toLowerCase(),
  );
}

/** Nulls invite_code unless the viewer owns the game or is registered in it. */
export function stripGameForViewer<T extends { invite_code: string; owner_discord_id: string | null; owner_name: string }>(
  game: T,
  viewer: InviteViewer,
): Omit<T, "invite_code"> & { invite_code: string | null } {
  if (canViewInviteCode(game, viewer)) return game;
  return { ...game, invite_code: null };
}

interface ChampionMatchRow {
  id: number;
  bracket: BracketName;
  round: number;
  position: number;
  contestant_a: number | null;
  contestant_b: number | null;
  winner: number | null;
}

/** Champion from raw match rows (no usernames) — delegates to the shared
 * bracket-util logic so client and server can never disagree. */
export function computeChampionFromRows(rows: ChampionMatchRow[], bracketType: BracketType): number | null {
  return computeChampionFromSlots(rows, bracketType);
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
  bracketType?: BracketType;
}) {
  const bracketType = opts.bracketType ?? "single_elim";
  // Retry on the unique invite_code index instead of check-then-insert;
  // two concurrent creators can otherwise race past the same SELECT.
  let lastError: unknown = null;
  for (let i = 0; i < 5; i++) {
    const inviteCode = randomBytes(6).toString("base64url");
    try {
      const { rows } = await query(
        `INSERT INTO games (owner_discord_id, owner_name, title, description, game_mode, visibility, invite_code, collection_id, status, game_date, register_open_at, register_close_at, roulette_enabled, bracket_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, $11, $12, $13) RETURNING id`,
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
          bracketType,
        ],
      );
      const id = rows[0]?.id;
      if (id != null && opts.collectionId != null) {
        await snapshotCollectionShips(id, opts.collectionId);
      }
      bumpDbVersion();
      return { id, invite_code: inviteCode };
    } catch (e) {
      // Only a duplicate invite_code is worth retrying; anything else is real.
      const code = (e as { code?: string }).code;
      if (code !== "23505") throw e;
      lastError = e;
    }
  }
  throw lastError ?? new Error("could not allocate invite code");
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

/** Game ids the given user is registered in (used to badge "you're registered"). */
export async function listRegisteredGameIds(discordId: string, username: string): Promise<Set<number>> {
  const rows = await fetchAll(
    "SELECT game_id FROM game_registrations WHERE discord_id = $1 OR LOWER(discord_username) = LOWER($2)",
    [discordId, username],
  );
  return new Set(rows.map((r) => r.game_id));
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
  const [collection, ships, participants, contestants, matchRows, draws] = await Promise.all([
    game.collection_id ? fetchOne("SELECT id, title FROM collections WHERE id = $1", [game.collection_id]) : Promise.resolve(null),
    fetchAll(
      "SELECT s.id, s.ship_name, s.data, s.downloads, s.fav FROM game_ships gs JOIN shipdb s ON s.id = gs.ship_id WHERE gs.game_id = $1 ORDER BY gs.id",
      [game.id],
    ),
    fetchAll(
      "SELECT discord_id, discord_username, registered_at FROM game_registrations WHERE game_id = $1 ORDER BY registered_at",
      [game.id],
    ),
    fetchAll(
      "SELECT id, discord_id, discord_username, seed, losses FROM game_contestants WHERE game_id = $1 ORDER BY seed, id",
      [game.id],
    ),
    fetchAll(
      "SELECT id, bracket, round, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1 ORDER BY bracket, round, position",
      [game.id],
    ),
    fetchAll(
      "SELECT d.participant_username, d.participant_discord_id, d.ship_id, s.ship_name, s.data, s.downloads, s.fav FROM game_ship_draws d JOIN shipdb s ON s.id = d.ship_id WHERE d.game_id = $1 ORDER BY d.id",
      [game.id],
    ),
  ]);
  const names = new Map<number, string>();
  for (const c of contestants) names.set(c.id, c.discord_username);
  const matches = matchRows.map((m) => ({
    ...m,
    a_username: m.contestant_a != null ? names.get(m.contestant_a) ?? null : null,
    b_username: m.contestant_b != null ? names.get(m.contestant_b) ?? null : null,
    winner_username: m.winner != null ? names.get(m.winner) ?? null : null,
  }));
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
    bracket_type?: BracketType;
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
  if (fields.bracket_type !== undefined) {
    sets.push(`bracket_type = $${idx++}`);
    args.push(fields.bracket_type);
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

/**
 * Mark a tournament game as finished (owner only). Optional: when `requireChampion`
 * is set, the game is only finished if a champion is actually decided in the
 * bracket — so owners can't mark a tournament finished with no winner.
 */
export async function markGameFinished(
  id: number,
  ownerName: string,
  ownerId: string,
  opts: { requireChampion?: boolean } = {},
) {
  const game = await fetchOne(
    "SELECT owner_discord_id, owner_name, status, bracket_type FROM games WHERE id = $1",
    [id],
  );
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };

  if (opts.requireChampion) {
    const matchRows = await fetchAll(
      "SELECT id, bracket, round, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1 ORDER BY bracket, round, position",
      [id],
    );
    const champion = computeChampionFromRows(matchRows, game.bracket_type);
    if (champion == null) return { error: "no champion yet" };
  }

  await query("UPDATE games SET status = 'finished' WHERE id = $1", [id]);
  bumpDbVersion();
  return { success: "game finished" };
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
  // Atomic dedupe: the (game_id, discord_id) and (game_id, LOWER(discord_username))
  // unique indexes + ON CONFLICT DO NOTHING make concurrent double-registrations
  // impossible (guests have NULL discord_id, so the username index is what guards them).
  const inserted = await query(
    "INSERT INTO game_registrations (game_id, discord_id, discord_username) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [gameId, opts.discordId, opts.username],
  );
  bumpDbVersion();
  if ((inserted.rowCount ?? 0) === 0) return { warning: "already registered" };
  return { success: "registered" };
}

export type LeaveIdentity =
  | { kind: "session"; discordId: string }
  | { kind: "guest"; username: string };

export async function leaveGame(gameId: number, identity: LeaveIdentity) {
  const game = await fetchOne("SELECT id FROM games WHERE id = $1", [gameId]);
  if (!game) return { error: "not found" };
  // A session holder removes their own row; a guest can only remove an
  // unclaimed guest row. Never both, and never a Discord-claimed row by name.
  const result =
    identity.kind === "session"
      ? await query("DELETE FROM game_registrations WHERE game_id = $1 AND discord_id = $2", [gameId, identity.discordId])
      : await query(
          "DELETE FROM game_registrations WHERE game_id = $1 AND discord_id IS NULL AND LOWER(discord_username) = LOWER($2)",
          [gameId, identity.username],
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
  // manually added is also registered so they show up in the roster. Both
  // inserts rely on the unique indexes + ON CONFLICT DO NOTHING, so concurrent
  // adds can't create duplicates.
  let added = false;
  await transaction(async (client) => {
    // Serialize seed assignment per game; MAX(seed)+1 under concurrency
    // would hand the same seed to two different contestants.
    await queryOnClient(client, "SELECT pg_advisory_xact_lock(1901, $1)", [gameId]);
    await queryOnClient(
      client,
      "INSERT INTO game_registrations (game_id, discord_id, discord_username) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [gameId, opts.discordId, opts.username],
    );

    const seedRow = await fetchOneOnClient(
      client,
      "SELECT COALESCE(MAX(seed), -1) + 1 AS next_seed FROM game_contestants WHERE game_id = $1",
      [gameId],
    );
    const res = await queryOnClient(
      client,
      "INSERT INTO game_contestants (game_id, discord_id, discord_username, seed) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
      [gameId, opts.discordId, opts.username, seedRow?.next_seed ?? 0],
    );
    added = (res.rowCount ?? 0) > 0;
  });

  bumpDbVersion();
  return added ? { success: "contestant added" } : { warning: "already a contestant" };
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

/**
 * Standard (Challonge-style) seed order for a power-of-two bracket, top to
 * bottom. For 8 seeds this yields [1, 8, 4, 5, 2, 7, 3, 6] so round 1 pairs
 * 1v8, 4v5, 2v7, 3v6. Seeds that exceed the real contestant count become byes,
 * which naturally fall to the bottom of the order (i.e. the top seeds get byes).
 */
function bracketSlotOrder(size: number): number[] {
  if (size <= 1) return [1];
  const prev = bracketSlotOrder(size / 2);
  const out: number[] = [];
  for (const seed of prev) {
    out.push(seed, size + 1 - seed);
  }
  return out;
}

/** First-round matches built from bracket slot order; byes are `null`. */
function pairFirstRound(ids: number[]): Array<[number | null, number | null]> {
  const size = nextPowerOfTwo(ids.length);
  const slots = bracketSlotOrder(size);
  const slotIds = slots.map((seed) => (seed <= ids.length ? ids[seed - 1] : null));
  const pairs: Array<[number | null, number | null]> = [];
  for (let i = 0; i < slotIds.length; i += 2) {
    pairs.push([slotIds[i], slotIds[i + 1]]);
  }
  return pairs;
}

interface GenMatch {
  bracket: BracketName;
  round: number;
  position: number;
  a: number | null;
  b: number | null;
  winner: number | null;
}

/**
 * Build a single-elimination bracket. Round 1 auto-advances byes; later rounds
 * leave the unknown slot as null ("TBD") until a winner is recorded.
 */
function buildSingleElim(ids: number[]): GenMatch[] {
  const size = nextPowerOfTwo(ids.length);
  const rounds = Math.round(Math.log2(size));
  const matches: GenMatch[] = [];
  let current: Array<number | null> = [];
  for (const [a, b] of pairFirstRound(ids)) current.push(a, b);
  for (let round = 1; round <= rounds; round++) {
    const next: Array<number | null> = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i];
      const b = current[i + 1];
      const position = i / 2;
      let winner: number | null = null;
      if (round === 1) {
        if (a != null && b == null) winner = a;
        else if (b != null && a == null) winner = b;
      }
      matches.push({ bracket: "winners", round, position, a, b, winner });
      next.push(winner);
    }
    current = next;
  }
  return matches;
}

/**
 * Build a double-elimination bracket: a standard winners bracket, a losers
 * bracket whose rounds absorb the winners-bracket losers (Challonge-style),
 * and a grand final with an optional bracket-reset round.
 *
 * Winners rounds (k = log2(P)): round r winners advance; the final winner
 * waits in the grand final. Losers rounds (2k-2): even rounds pair the
 * winners-bracket losers (slot A) against the previous losers winners (slot B),
 * odd rounds just carry the previous losers winners. WB round 1 losers enter
 * losers round 1; WB round r>=2 losers enter losers round 2r-2. The losers
 * champion and the winners champion meet in the grand final; if the losers
 * side wins round 1, the reset round (grand_final round 2) is played.
 */
function buildDoubleElim(ids: number[]): GenMatch[] {
  const size = nextPowerOfTwo(ids.length);
  const k = Math.round(Math.log2(size));
  const matches: GenMatch[] = [];

  // Winners bracket (same structure as single elimination).
  let current: Array<number | null> = [];
  for (const [a, b] of pairFirstRound(ids)) current.push(a, b);
  for (let round = 1; round <= k; round++) {
    const next: Array<number | null> = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i];
      const b = current[i + 1];
      const position = i / 2;
      let winner: number | null = null;
      if (round === 1) {
        if (a != null && b == null) winner = a;
        else if (b != null && a == null) winner = b;
      }
      matches.push({ bracket: "winners", round, position, a, b, winner });
      next.push(winner);
    }
    current = next;
  }

  // Losers bracket: 2k-2 rounds, match count halves every two rounds.
  const lbCount = 2 * k - 2;
  for (let j = 1; j <= lbCount; j++) {
    const mCount = Math.pow(2, k - 1 - Math.ceil(j / 2));
    for (let p = 0; p < mCount; p++) {
      matches.push({ bracket: "losers", round: j, position: p, a: null, b: null, winner: null });
    }
  }

  // Grand final: round 1 is the final, round 2 is the bracket reset (played
  // only when the losers-bracket champion wins round 1).
  matches.push({ bracket: "grand_final", round: 1, position: 0, a: null, b: null, winner: null });
  matches.push({ bracket: "grand_final", round: 2, position: 0, a: null, b: null, winner: null });

  return matches;
}

/** Winners-bracket round count (k) for a game. */
async function winnersRounds(gameId: number): Promise<number> {
  const row = await fetchOne(
    "SELECT COALESCE(MAX(round), 0)::int AS r FROM game_matches WHERE game_id = $1 AND bracket = 'winners'",
    [gameId],
  );
  return row?.r ?? 0;
}

export async function generateBracket(
  gameId: number,
  ownerName: string,
  ownerId: string,
  opts: { shuffle?: boolean; bracketType?: BracketType } = {},
) {
  const game = await fetchOne("SELECT owner_discord_id, owner_name, game_mode, bracket_type FROM games WHERE id = $1", [gameId]);
  if (!game) return { error: "not found" };
  if (!isGameOwner(game, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (game.game_mode !== "tournament") return { error: "not a tournament" };

  const bracketType: BracketType = opts.bracketType ?? game.bracket_type ?? "single_elim";

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

  const built = bracketType === "double_elim" ? buildDoubleElim(order) : buildSingleElim(order);

  await transaction(async (client) => {
    await queryOnClient(client, "DELETE FROM game_matches WHERE game_id = $1", [gameId]);
    await queryOnClient(client, "UPDATE game_contestants SET losses = 0 WHERE game_id = $1", [gameId]);
    for (let i = 0; i < order.length; i++) {
      await queryOnClient(
        client,
        "UPDATE game_contestants SET seed = $1 WHERE id = $2 AND game_id = $3",
        [i, order[i], gameId],
      );
    }
    for (const m of built) {
      await queryOnClient(
        client,
        "INSERT INTO game_matches (game_id, bracket, round, position, contestant_a, contestant_b, winner) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [gameId, m.bracket, m.round, m.position, m.a, m.b, m.winner],
      );
    }
  });

  bumpDbVersion();
  return {
    success: "bracket generated",
    bracket_type: bracketType,
    size: nextPowerOfTwo(order.length),
    rounds: Math.round(Math.log2(nextPowerOfTwo(order.length))),
    matches: built.length,
  };
}

interface MatchRow {
  id: number;
  game_id: number;
  bracket: BracketName;
  round: number;
  position: number;
  contestant_a: number | null;
  contestant_b: number | null;
  winner: number | null;
  owner_discord_id: string | null;
  owner_name: string;
  bracket_type: BracketType;
}

async function fetchMatchWithGame(matchId: number, gameId: number): Promise<MatchRow | null> {
  return fetchOne(
    `SELECT gm.id, gm.game_id, gm.bracket, gm.round, gm.position, gm.contestant_a, gm.contestant_b, gm.winner,
            g.owner_discord_id, g.owner_name, g.bracket_type
     FROM game_matches gm JOIN games g ON g.id = gm.game_id
     WHERE gm.id = $1 AND gm.game_id = $2`,
    [matchId, gameId],
  );
}

/**
 * Fill the slots a recorded winner advances to. The loser of a winners-bracket
 * match drops into the losers bracket (double elimination only).
 */
async function applyWinner(
  client: PoolClient,
  match: MatchRow,
  winnerId: number,
  loserId: number | null,
  k: number,
) {
  if (match.bracket_type === "single_elim") {
    // Winner advances into the next winners round; the final round is the champion.
    const next = await fetchOneOnClient(
      client,
      "SELECT id FROM game_matches WHERE game_id = $1 AND bracket = 'winners' AND round = $2 AND position = $3 FOR UPDATE",
      [match.game_id, match.round + 1, Math.floor(match.position / 2)],
    );
    if (next) {
      const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
      await queryOnClient(client, `UPDATE game_matches SET ${slot} = $1 WHERE id = $2 AND ${slot} IS NULL`, [winnerId, next.id]);
    }
    return;
  }

  if (match.bracket === "winners") {
    // Winner advances in the winners bracket; the final winner takes GF slot A.
    const next = await fetchOneOnClient(
      client,
      "SELECT id FROM game_matches WHERE game_id = $1 AND bracket = 'winners' AND round = $2 AND position = $3 FOR UPDATE",
      [match.game_id, match.round + 1, Math.floor(match.position / 2)],
    );
    if (next) {
      const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
      await queryOnClient(client, `UPDATE game_matches SET ${slot} = $1 WHERE id = $2 AND ${slot} IS NULL`, [winnerId, next.id]);
    } else if (match.round === k) {
      await queryOnClient(
        client,
        "UPDATE game_matches SET contestant_a = $1 WHERE game_id = $2 AND bracket = 'grand_final' AND round = 1 AND contestant_a IS NULL",
        [winnerId, match.game_id],
      );
    }
    // Loser drops into the losers bracket (or straight to the grand final for
    // a 2-player bracket).
    if (loserId != null) {
      if (k <= 1) {
        await queryOnClient(
          client,
          "UPDATE game_matches SET contestant_b = $1 WHERE game_id = $2 AND bracket = 'grand_final' AND round = 1 AND contestant_b IS NULL",
          [loserId, match.game_id],
        );
      } else if (match.round === 1) {
        const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
        await queryOnClient(
          client,
          `UPDATE game_matches SET ${slot} = $1 WHERE game_id = $2 AND bracket = 'losers' AND round = 1 AND position = $3`,
          [loserId, match.game_id, Math.floor(match.position / 2)],
        );
      } else {
        await queryOnClient(
          client,
          "UPDATE game_matches SET contestant_a = $1 WHERE game_id = $2 AND bracket = 'losers' AND round = $3 AND position = $4 AND contestant_a IS NULL",
          [loserId, match.game_id, 2 * match.round - 2, match.position],
        );
      }
    }
    return;
  }

  if (match.bracket === "losers") {
    const lbCount = 2 * k - 2;
    if (match.round >= lbCount) {
      // Losers-bracket champion advances into the grand final (slot B).
      await queryOnClient(
        client,
        "UPDATE game_matches SET contestant_b = $1 WHERE game_id = $2 AND bracket = 'grand_final' AND round = 1 AND contestant_b IS NULL",
        [winnerId, match.game_id],
      );
    } else {
      const nextJ = match.round + 1;
      if (nextJ % 2 === 0) {
        // Injection round: previous losers winners take slot B.
        await queryOnClient(
          client,
          "UPDATE game_matches SET contestant_b = $1 WHERE game_id = $2 AND bracket = 'losers' AND round = $3 AND position = $4 AND contestant_b IS NULL",
          [winnerId, match.game_id, nextJ, match.position],
        );
      } else {
        // Carry round: pair the previous losers winners consecutively.
        const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
        await queryOnClient(
          client,
          `UPDATE game_matches SET ${slot} = $1 WHERE game_id = $2 AND bracket = 'losers' AND round = $3 AND position = $4`,
          [winnerId, match.game_id, nextJ, Math.floor(match.position / 2)],
        );
      }
    }
    return;
  }

  // grand_final round 1: a losers-side win forces the bracket reset.
  if (match.round === 1 && winnerId === match.contestant_b) {
    await queryOnClient(
      client,
      "UPDATE game_matches SET contestant_a = $1, contestant_b = $2 WHERE game_id = $3 AND bracket = 'grand_final' AND round = 2",
      [match.contestant_a, winnerId, match.game_id],
    );
  }
}

/** Reverse the fills made by applyWinner when a winner is cleared. */
async function undoWinner(
  client: PoolClient,
  match: MatchRow,
  prevWinner: number,
  loserId: number | null,
  k: number,
) {
  if (match.bracket_type === "single_elim") {
    const next = await fetchOneOnClient(
      client,
      "SELECT id FROM game_matches WHERE game_id = $1 AND bracket = 'winners' AND round = $2 AND position = $3 FOR UPDATE",
      [match.game_id, match.round + 1, Math.floor(match.position / 2)],
    );
    if (next) {
      const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
      await queryOnClient(client, `UPDATE game_matches SET ${slot} = NULL WHERE id = $1 AND ${slot} = $2`, [next.id, prevWinner]);
    }
    return;
  }

  if (match.bracket === "winners") {
    if (match.round === k) {
      await queryOnClient(
        client,
        "UPDATE game_matches SET contestant_a = NULL WHERE game_id = $1 AND bracket = 'grand_final' AND round = 1 AND contestant_a = $2",
        [match.game_id, prevWinner],
      );
    } else {
      const next = await fetchOneOnClient(
        client,
        "SELECT id FROM game_matches WHERE game_id = $1 AND bracket = 'winners' AND round = $2 AND position = $3 FOR UPDATE",
        [match.game_id, match.round + 1, Math.floor(match.position / 2)],
      );
      if (next) {
        const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
        await queryOnClient(client, `UPDATE game_matches SET ${slot} = NULL WHERE id = $1 AND ${slot} = $2`, [next.id, prevWinner]);
      }
    }
    if (loserId != null) {
      if (k <= 1) {
        await queryOnClient(
          client,
          "UPDATE game_matches SET contestant_b = NULL WHERE game_id = $1 AND bracket = 'grand_final' AND round = 1 AND contestant_b = $2",
          [match.game_id, loserId],
        );
      } else if (match.round === 1) {
        const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
        await queryOnClient(
          client,
          `UPDATE game_matches SET ${slot} = NULL WHERE game_id = $1 AND bracket = 'losers' AND round = 1 AND position = $2 AND ${slot} = $3`,
          [match.game_id, Math.floor(match.position / 2), loserId],
        );
      } else {
        await queryOnClient(
          client,
          "UPDATE game_matches SET contestant_a = NULL WHERE game_id = $1 AND bracket = 'losers' AND round = $2 AND position = $3 AND contestant_a = $4",
          [match.game_id, 2 * match.round - 2, match.position, loserId],
        );
      }
    }
    return;
  }

  if (match.bracket === "losers") {
    const lbCount = 2 * k - 2;
    if (match.round >= lbCount) {
      await queryOnClient(
        client,
        "UPDATE game_matches SET contestant_b = NULL WHERE game_id = $1 AND bracket = 'grand_final' AND round = 1 AND contestant_b = $2",
        [match.game_id, prevWinner],
      );
    } else {
      const nextJ = match.round + 1;
      if (nextJ % 2 === 0) {
        await queryOnClient(
          client,
          "UPDATE game_matches SET contestant_b = NULL WHERE game_id = $1 AND bracket = 'losers' AND round = $2 AND position = $3 AND contestant_b = $4",
          [match.game_id, nextJ, match.position, prevWinner],
        );
      } else {
        const slot = match.position % 2 === 0 ? "contestant_a" : "contestant_b";
        await queryOnClient(
          client,
          `UPDATE game_matches SET ${slot} = NULL WHERE game_id = $1 AND bracket = 'losers' AND round = $2 AND position = $3 AND ${slot} = $4`,
          [match.game_id, nextJ, Math.floor(match.position / 2), prevWinner],
        );
      }
    }
    return;
  }

  // grand_final round 1: clear the reset match.
  if (match.round === 1) {
    await queryOnClient(
      client,
      "UPDATE game_matches SET contestant_a = NULL, contestant_b = NULL, winner = NULL WHERE game_id = $1 AND bracket = 'grand_final' AND round = 2",
      [match.game_id],
    );
  }
}

/**
 * Losers round 1 can be a single-contestant match when the winners round 1
 * match that would have fed the other slot was a bye (a bye has no loser to
 * drop). Such a match is already decided, so the lone contestant auto-advances
 * like a normal pick instead of stalling the whole losers bracket. If an undo
 * empties a slot or turns the feeder back into a live match, the advancement is
 * reverted. Idempotent — re-run after any winner mutation in double elimination.
 */
async function reconcileLosersRound1(client: PoolClient, gameId: number, k: number) {
  if (k <= 1) return;
  const rows = await fetchAllOnClient(
    client,
    "SELECT id, position, contestant_a, contestant_b, winner FROM game_matches WHERE game_id = $1 AND bracket = 'losers' AND round = 1 ORDER BY position",
    [gameId],
  );
  for (const row of rows) {
    const id = row.id as number;
    const position = row.position as number;
    const a = row.contestant_a as number | null;
    const b = row.contestant_b as number | null;
    const currentWinner = row.winner as number | null;

    let expected: number | null;
    if (a != null && b != null) {
      expected = currentWinner; // full match — leave any recorded winner alone
    } else if (a == null && b == null) {
      expected = null;
    } else {
      const lone = a ?? b;
      if (lone == null) continue;
      const missing = a == null ? "contestant_a" : "contestant_b";
      const wb = await fetchOneOnClient(
        client,
        "SELECT contestant_a, contestant_b FROM game_matches WHERE game_id = $1 AND bracket = 'winners' AND round = 1 AND position = $2",
        [gameId, position * 2 + (missing === "contestant_a" ? 0 : 1)],
      );
      const bye = wb != null && wb.contestant_a != null && wb.contestant_b == null;
      expected = bye ? lone : null;
    }

    if (expected === currentWinner) continue;

    const match = await fetchOneOnClient(
      client,
      `SELECT gm.id, gm.game_id, gm.bracket, gm.round, gm.position, gm.contestant_a, gm.contestant_b, gm.winner,
              g.owner_discord_id, g.owner_name, g.bracket_type
       FROM game_matches gm JOIN games g ON g.id = gm.game_id
       WHERE gm.id = $1 AND gm.game_id = $2`,
      [id, gameId],
    );
    if (!match) continue;

    if (currentWinner != null) {
      const prevLoser = currentWinner === match.contestant_a ? match.contestant_b : match.contestant_a;
      await undoWinner(client, match, currentWinner, prevLoser, k);
      if (prevLoser != null) {
        await queryOnClient(
          client,
          "UPDATE game_contestants SET losses = GREATEST(losses - 1, 0) WHERE id = $1 AND game_id = $2",
          [prevLoser, gameId],
        );
      }
      await queryOnClient(client, "UPDATE game_matches SET winner = NULL WHERE id = $1 AND game_id = $2", [id, gameId]);
    }
    if (expected != null) {
      await queryOnClient(client, "UPDATE game_matches SET winner = $1 WHERE id = $2 AND game_id = $3", [expected, id, gameId]);
      await applyWinner(client, match, expected, null, k);
    }
  }
}

export async function setMatchWinner(
  gameId: number,
  ownerName: string,
  ownerId: string,
  matchId: number,
  winnerId: number,
) {
  const match = await fetchMatchWithGame(matchId, gameId);
  if (!match) return { error: "not found" };
  if (!isGameOwner(match, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (winnerId !== match.contestant_a && winnerId !== match.contestant_b) {
    return { error: "invalid winner" };
  }

  const k = match.bracket_type === "double_elim" ? await winnersRounds(match.game_id) : 0;

  await transaction(async (client) => {
    // Re-picks are applied as clear-then-set so the bracket never corrupts.
    if (match.winner != null) {
      const prevLoser = match.winner === match.contestant_a ? match.contestant_b : match.contestant_a;
      await undoWinner(client, match, match.winner, prevLoser, k);
      if (prevLoser != null) {
        await queryOnClient(
          client,
          "UPDATE game_contestants SET losses = GREATEST(losses - 1, 0) WHERE id = $1 AND game_id = $2",
          [prevLoser, gameId],
        );
      }
    }
    await queryOnClient(
      client,
      "UPDATE game_matches SET winner = $1 WHERE id = $2 AND game_id = $3",
      [winnerId, matchId, gameId],
    );
    const loserId = winnerId === match.contestant_a ? match.contestant_b : match.contestant_a;
    await applyWinner(client, match, winnerId, loserId, k);
    if (loserId != null) {
      await queryOnClient(
        client,
        "UPDATE game_contestants SET losses = losses + 1 WHERE id = $1 AND game_id = $2",
        [loserId, gameId],
      );
    }
    if (match.bracket_type === "double_elim") {
      await reconcileLosersRound1(client, match.game_id, k);
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
  const match = await fetchMatchWithGame(matchId, gameId);
  if (!match) return { error: "not found" };
  if (!isGameOwner(match, { id: ownerId, username: ownerName })) return { error: "not the owner" };
  if (match.winner == null) return { warning: "no winner set" };
  const prevWinner = match.winner;

  const k = match.bracket_type === "double_elim" ? await winnersRounds(match.game_id) : 0;

  await transaction(async (client) => {
    const loserId = prevWinner === match.contestant_a ? match.contestant_b : match.contestant_a;
    await undoWinner(client, match, prevWinner, loserId, k);
    await queryOnClient(
      client,
      "UPDATE game_matches SET winner = NULL WHERE id = $1 AND game_id = $2",
      [matchId, gameId],
    );
    if (loserId != null) {
      await queryOnClient(
        client,
        "UPDATE game_contestants SET losses = GREATEST(losses - 1, 0) WHERE id = $1 AND game_id = $2",
        [loserId, gameId],
      );
    }
    if (match.bracket_type === "double_elim") {
      await reconcileLosersRound1(client, match.game_id, k);
    }
  });

  bumpDbVersion();
  return { success: "winner cleared" };
}