import { query, fetchAll, fetchOne, isCollectionOwner } from "./core";
import { cachedQuery, bumpDbVersion } from "@/lib/cache";

export interface CollectionRow {
  id: number;
  owner: string;
  discord_id: string | null;
  title: string;
  description: string;
  ships: number[];
  created_at: string;
}

export async function createCollection(owner: string, ownerId: string, title: string, description: string) {
  const { rows } = await query(
    "INSERT INTO collections (owner, discord_id, title, description) VALUES ($1, $2, $3, $4) RETURNING id",
    [owner, ownerId, title, description],
  );
  bumpDbVersion();
  return { id: rows[0]?.id };
}

export async function getCollection(id: number) {
  const col = await fetchOne("SELECT id, owner, discord_id, title, description, ships, created_at FROM collections WHERE id = $1", [id]);
  if (!col) return null;
  const ships =
    col.ships?.length > 0
      ? await fetchAll(
          `SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = ANY ($1::int[])`,
          [col.ships],
        )
      : [];
  return { ...col, ships };
}

export async function getUserCollections(owner: string, ownerId: string, shipId?: number) {
  const rows = await fetchAll(
    `SELECT id, owner, discord_id, title, description, array_length(ships, 1) AS ship_count, created_at${
      shipId ? ", $3 = ANY(ships) AS has_ship" : ""
    } FROM collections WHERE discord_id = $1 OR owner = $2 ORDER BY created_at DESC`,
    shipId ? [ownerId, owner, shipId] : [ownerId, owner],
  );
  return rows;
}

const PAGE = 24;

export async function getAllCollections(page = 1) {
  return cachedQuery("collections", 30_000, String(page), async () => {
    const countRow = await fetchOne("SELECT COUNT(*) FROM collections");
    const total = parseInt(countRow?.count ?? "0", 10);
    const maxPage = Math.ceil(total / PAGE);
    const data = await fetchAll(
      "SELECT id, owner, title, description, array_length(ships, 1) AS ship_count, created_at FROM collections ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [PAGE, (page - 1) * PAGE],
    );
    return { data, page, max_page: maxPage, total_count: total };
  });
}

export async function updateCollection(
  id: number,
  owner: string,
  ownerId: string,
  fields: { title?: string; description?: string },
) {
  const col = await fetchOne("SELECT owner, discord_id FROM collections WHERE id = $1", [id]);
  if (!col) return { error: "not found" };
  if (!isCollectionOwner(col, { id: ownerId, username: owner })) return { error: "not the owner" };
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
  if (sets.length === 0) return { error: "nothing to update" };
  args.push(id);
  await query(`UPDATE collections SET ${sets.join(", ")} WHERE id = $${idx}`, args);
  bumpDbVersion();
  return { success: "collection updated" };
}

export async function deleteCollection(id: number, owner: string, ownerId: string) {
  const col = await fetchOne("SELECT owner, discord_id FROM collections WHERE id = $1", [id]);
  if (!col) return { error: "not found" };
  if (!isCollectionOwner(col, { id: ownerId, username: owner })) return { error: "not the owner" };
  await query("DELETE FROM collections WHERE id = $1 AND (discord_id = $2 OR owner = $3)", [id, ownerId, owner]);
  bumpDbVersion();
  return { success: "collection deleted" };
}

export async function addShipToCollection(collectionId: number, shipId: number, owner: string, ownerId: string) {
  const col = await fetchOne("SELECT owner, discord_id, ships FROM collections WHERE id = $1", [collectionId]);
  if (!col) return { error: "not found" };
  if (!isCollectionOwner(col, { id: ownerId, username: owner })) return { error: "not the owner" };
  if (col.ships?.includes(shipId)) return { warning: "ship already in collection" };
  await query("UPDATE collections SET ships = COALESCE(ships, '{}') || $1::int[] WHERE id = $2 AND (discord_id = $3 OR owner = $4)", [[shipId], collectionId, ownerId, owner]);
  bumpDbVersion();
  return { success: "ship added" };
}

export async function removeShipFromCollection(
  collectionId: number,
  shipId: number,
  owner: string,
  ownerId: string,
) {
  const col = await fetchOne("SELECT owner, discord_id, ships FROM collections WHERE id = $1", [collectionId]);
  if (!col) return { error: "not found" };
  if (!isCollectionOwner(col, { id: ownerId, username: owner })) return { error: "not the owner" };
  if (!col.ships?.includes(shipId)) return { warning: "ship not in collection" };
  await query("UPDATE collections SET ships = array_remove(ships, $1) WHERE id = $2 AND (discord_id = $3 OR owner = $4)", [
    shipId,
    collectionId,
    ownerId,
    owner,
  ]);
  bumpDbVersion();
  return { success: "ship removed" };
}

export async function getCollectionsForShip(shipId: number) {
  return cachedQuery("collectionsByShip", 30_000, String(shipId), async () =>
    fetchAll(
      "SELECT id, owner, title, description FROM collections WHERE $1 = ANY(ships)",
      [shipId],
    )
  );
}