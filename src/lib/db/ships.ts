import { query, queryOnClient, fetchAll, fetchOne, fetchOneOnClient, transaction, sanitizeText, isShipOwner } from "./core";
import { cachedQuery, bumpDbVersion } from "@/lib/cache";

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

export async function getImageData(shipId: number): Promise<ShipRow | null> {
  return cachedQuery("ship", 30_000, String(shipId), async () =>
    fetchOne("SELECT id, name, data, submitted_by, discord_id, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = $1", [shipId])
  );
}

export async function getShipForReplacement(
  shipId: number,
): Promise<{ id: number; data: string; submitted_by: string; discord_id: string | null } | null> {
  return fetchOne(
    "SELECT id, data, submitted_by, discord_id FROM shipdb WHERE id = $1",
    [shipId]
  );
}

export async function getMyShips(user: string, userId: string) {
  const data = await fetchAll(
    "SELECT id, name, data, submitted_by, discord_id, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE discord_id = $1 OR submitted_by = $2",
    [userId, user],
  );
  return { data, page: 1, max_page: 1 };
}

export async function updateDownloads(shipId: number) {
  await query("UPDATE shipdb SET downloads = downloads + 1 WHERE id = $1", [shipId]);
  bumpDbVersion();
}

export async function deleteShip(shipId: number, user: { id: string; username: string }) {
  return transaction(async (client) => {
    const row = await fetchOneOnClient(client, "SELECT submitted_by, discord_id, data FROM shipdb WHERE id = $1", [shipId]);
    if (!row || !isShipOwner(row, user)) return { error: "not the owner" };

    await queryOnClient(client, "UPDATE collections SET ships = array_remove(ships, $1) WHERE $1 = ANY(ships)", [shipId]);
    await queryOnClient(client, "UPDATE favoritedb SET favorite = array_remove(favorite, $1) WHERE $1 = ANY(favorite)", [shipId]);
    await queryOnClient(client, "DELETE FROM favoritedb WHERE array_length(favorite, 1) IS NULL", []);
    await queryOnClient(client, "DELETE FROM ship_signatures WHERE ship_id = $1", [shipId]);
    await queryOnClient(client, "DELETE FROM shipdb WHERE id = $1 AND (discord_id = $2 OR submitted_by = $3)", [shipId, user.id, user.username]);
    bumpDbVersion();
    return { success: `ship ${shipId} deleted`, data: row.data };
  });
}

export async function insertShip({
  name,
  data,
  submittedBy,
  submittedById,
  description,
  shipName,
  author,
  price,
  brand,
  crew,
  tags,
  signature,
}: {
  name: string;
  data: string;
  submittedBy: string;
  submittedById?: string | null;
  description: string;
  shipName: string;
  author: string;
  price: number;
  brand: string;
  crew: number;
  tags: string[];
  signature?: string;
}) {
  return transaction(async (client) => {
    const { rows } = await queryOnClient(
      client,
      `INSERT INTO shipdb (name, data, submitted_by, discord_id, description, ship_name, author, price, brand, crew, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[]) RETURNING id`,
      [
        sanitizeText(name),
        data,
        sanitizeText(submittedBy),
        submittedById ?? null,
        sanitizeText(description),
        sanitizeText(shipName),
        sanitizeText(author),
        price,
        sanitizeText(brand),
        crew,
        tags.map((t) => sanitizeText(t)),
      ],
    );
    const shipId = rows[0]?.id;
    if (shipId && signature) {
      await queryOnClient(
        client,
        "INSERT INTO ship_signatures (ship_id, signature) VALUES ($1, $2)",
        [shipId, signature],
      );
    }
    bumpDbVersion();
    return { success: `${shipId}` };
  });
}

export async function updateShip({
  id,
  name,
  data,
  submittedBy,
  submittedById,
  description,
  shipName,
  author,
  price,
  brand,
  crew,
  tags,
  signature,
}: {
  id: number;
  name: string;
  data: string;
  submittedBy: string;
  submittedById?: string | null;
  description: string;
  shipName: string;
  author: string;
  price: number;
  brand: string;
  crew: number;
  tags: string[];
  signature?: string;
}) {
  return transaction(async (client) => {
    await queryOnClient(
      client,
      `UPDATE shipdb SET name=$1, data=$2, submitted_by=$3, discord_id=$4, description=$5, ship_name=$6,
       author=$7, price=$8, brand=$9, crew=$10, tags=$11::text[] WHERE id=$12`,
      [
        sanitizeText(name),
        data,
        sanitizeText(submittedBy),
        submittedById ?? null,
        sanitizeText(description),
        sanitizeText(shipName),
        sanitizeText(author),
        price,
        sanitizeText(brand),
        crew,
        tags.map((t) => sanitizeText(t)),
        id,
      ],
    );
    if (signature) {
      await queryOnClient(client, "DELETE FROM ship_signatures WHERE ship_id = $1", [id]);
      await queryOnClient(
        client,
        "INSERT INTO ship_signatures (ship_id, signature) VALUES ($1, $2)",
        [id, signature],
      );
    }
    bumpDbVersion();
    return { success: "ship updated" };
  });
}