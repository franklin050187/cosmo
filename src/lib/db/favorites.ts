import { queryOnClient, fetchAll, fetchOne, fetchOneOnClient, transaction } from "./core";
import { bumpDbVersion } from "@/lib/cache";

export async function getMyFavorites(user: string, userId: string) {
  const data = await fetchAll(
    "SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = ANY (SELECT UNNEST(favorite) FROM favoritedb WHERE discord_id = $1 OR name = $2)",
    [userId, user],
  );
  return { data, page: 1, max_page: 1 };
}

export async function isShipFavorited(user: string, userId: string, shipId: number) {
  const row = await fetchOne(
    "SELECT favorite FROM favoritedb WHERE discord_id = $1 OR name = $2",
    [userId, user],
  );
  return !!row && row.favorite.includes(shipId);
}

export async function addToFavorites(user: string, userId: string, shipId: number) {
  return transaction(async (client) => {
    const row = await fetchOneOnClient(client, "SELECT favorite FROM favoritedb WHERE discord_id = $1 OR name = $2 FOR UPDATE", [userId, user]);
    if (!row) {
      await queryOnClient(client, "INSERT INTO favoritedb (name, discord_id, favorite) VALUES ($1, $2, $3::int[])", [user, userId, [shipId]]);
    } else if (row.favorite.includes(shipId)) {
      return { warning: "already in favorites" };
    } else {
      await queryOnClient(client, "UPDATE favoritedb SET favorite = favorite || $1::int[] WHERE discord_id = $2 OR name = $3", [[shipId], userId, user]);
    }
    await queryOnClient(client, "UPDATE shipdb SET fav = fav + 1 WHERE id = $1", [shipId]);
    bumpDbVersion();
    return { success: "favorited" };
  });
}

export async function deleteFromFavorites(user: string, userId: string, shipId: number) {
  return transaction(async (client) => {
    const row = await fetchOneOnClient(client, "SELECT favorite FROM favoritedb WHERE discord_id = $1 OR name = $2 FOR UPDATE", [userId, user]);
    if (!row) return { warning: "not in favorites" };
    const favorites: number[] = row.favorite;
    const idx = favorites.indexOf(shipId);
    if (idx === -1) return { warning: "not in favorites" };
    favorites.splice(idx);
    if (favorites.length === 0) {
      await queryOnClient(client, "DELETE FROM favoritedb WHERE discord_id = $1 OR name = $2", [userId, user]);
    } else {
      await queryOnClient(client, "UPDATE favoritedb SET favorite = $1::int[] WHERE discord_id = $2 OR name = $3", [favorites, userId, user]);
    }
    await queryOnClient(client, "UPDATE shipdb SET fav = fav - 1 WHERE id = $1", [shipId]);
    bumpDbVersion();
    return { success: "unfavorited" };
  });
}