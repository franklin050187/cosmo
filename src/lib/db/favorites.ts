import { queryOnClient, fetchAll, fetchOne, fetchOneOnClient, transaction } from "./core";
import { bumpDbVersion } from "@/lib/cache";

export async function getMyFavorites(user: string, userId: string) {
  const byId = !!userId;
  const data = byId
    ? await fetchAll(
        "SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = ANY (SELECT UNNEST(favorite) FROM favoritedb WHERE discord_id = $1)",
        [userId],
      )
    : await fetchAll(
        "SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = ANY (SELECT UNNEST(favorite) FROM favoritedb WHERE name = $1)",
        [user],
      );
  return { data, page: 1, max_page: 1 };
}

export async function isShipFavorited(user: string, userId: string, shipId: number) {
  const byId = !!userId;
  const row = byId
    ? await fetchOne("SELECT favorite FROM favoritedb WHERE discord_id = $1", [userId])
    : await fetchOne("SELECT favorite FROM favoritedb WHERE name = $1", [user]);
  return !!row && row.favorite.includes(shipId);
}

export async function addToFavorites(user: string, userId: string, shipId: number) {
  return transaction(async (client) => {
    const byId = !!userId;
    const row = byId
      ? await fetchOneOnClient(client, "SELECT favorite FROM favoritedb WHERE discord_id = $1 FOR UPDATE", [userId])
      : await fetchOneOnClient(client, "SELECT favorite FROM favoritedb WHERE name = $1 FOR UPDATE", [user]);
    if (!row) {
      await queryOnClient(client, "INSERT INTO favoritedb (name, discord_id, favorite) VALUES ($1, $2, $3::int[])", [user, userId || null, [shipId]]);
    } else if (row.favorite.includes(shipId)) {
      return { warning: "already in favorites" };
    } else if (byId) {
      await queryOnClient(client, "UPDATE favoritedb SET favorite = favorite || $1::int[] WHERE discord_id = $2", [[shipId], userId]);
    } else {
      await queryOnClient(client, "UPDATE favoritedb SET favorite = favorite || $1::int[] WHERE name = $2", [[shipId], user]);
    }
    await queryOnClient(client, "UPDATE shipdb SET fav = fav + 1 WHERE id = $1", [shipId]);
    bumpDbVersion();
    return { success: "favorited" };
  });
}

export async function deleteFromFavorites(user: string, userId: string, shipId: number) {
  return transaction(async (client) => {
    const byId = !!userId;
    const row = byId
      ? await fetchOneOnClient(client, "SELECT favorite FROM favoritedb WHERE discord_id = $1 FOR UPDATE", [userId])
      : await fetchOneOnClient(client, "SELECT favorite FROM favoritedb WHERE name = $1 FOR UPDATE", [user]);
    if (!row) return { warning: "not in favorites" };
    const favorites: number[] = row.favorite;
    const idx = favorites.indexOf(shipId);
    if (idx === -1) return { warning: "not in favorites" };
    favorites.splice(idx, 1);
    if (favorites.length === 0) {
      if (byId) {
        await queryOnClient(client, "DELETE FROM favoritedb WHERE discord_id = $1", [userId]);
      } else {
        await queryOnClient(client, "DELETE FROM favoritedb WHERE name = $1", [user]);
      }
    } else if (byId) {
      await queryOnClient(client, "UPDATE favoritedb SET favorite = $1::int[] WHERE discord_id = $2", [favorites, userId]);
    } else {
      await queryOnClient(client, "UPDATE favoritedb SET favorite = $1::int[] WHERE name = $2", [favorites, user]);
    }
    await queryOnClient(client, "UPDATE shipdb SET fav = GREATEST(fav - 1, 0) WHERE id = $1", [shipId]);
    bumpDbVersion();
    return { success: "unfavorited" };
  });
}