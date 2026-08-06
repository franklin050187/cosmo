import pg from "pg";

const PAGE_SIZE = 24;

const sanitizeText = (s: string) => s.replace(/\u0000/g, "");

const SUPABASE_CA = `-----BEGIN CERTIFICATE-----
MIID5jCCAs6gAwIBAgIUecmTKYbqO5NLdhTHbdxW6e8/x0wwDQYJKoZIhvcNAQEL
BQAwczELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEmMCQGA1UEAwwdU3VwYWJh
c2UgSW50ZXJtZWRpYXRlIDIwMjEgQ0EwHhcNMjUwMzEyMTU1NjMzWhcNMzAwMzEx
MTU1NjMzWjBrMQswCQYDVQQGEwJVUzEQMA4GA1UECAwHRGVsd2FyZTETMBEGA1UE
BwwKTmV3IENhc3RsZTEVMBMGA1UECgwMU3VwYWJhc2UgSW5jMR4wHAYDVQQDDBUq
LnBvb2xlci5zdXBhYmFzZS5jb20wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQC7m1IrJFRAESxSs16T65DLluFJ5qyr//Xs6Bh/lJDPZjWwJWkPAOuudZcz
S5O3i+PR9ZGNtZZbGyqJHWriJtuo7OLc+yuZ3iTj4Rv09w5yZlghBE+8f+6aszDn
uEHQi1mk9FKQDljpJhsajZ/4hEDfcMrRUNdzDdZaRgRlssAWEsG5iybt3+DqKBp6
mE5Ume0QXGo+GLtTT3rZYxchieZOa9GF1gb/DtoQ+Z3YUL+qU+fqKVHUtKyoIQAj
HLRlRuMBlQiiMVBspSHHOny7K3fybcFh2tP+HYgKzlEItrW1lRCWg5F/BHQsjpWZ
fKrsQaAdRaih4rQI4rDdQfV1oMBdAgMBAAGjejB4MDYGA1UdEQQvMC2CFSoucG9v
bGVyLnN1cGFiYXNlLmNvbYIUKi5wb29sZXIuc3VwYWJhc2UuY28wHQYDVR0OBBYE
FDJ28o4g7/iN/qmYDQXmrVq/tRo+MB8GA1UdIwQYMBaAFBWgUy69cn1i/5Amvr8Y
lfRnRUD6MA0GCSqGSIb3DQEBCwUAA4IBAQB7ohHbVT/opJsxXOdcE6hkucyAEK0C
rK/SH+K19Lq/03RCVAJUYi6PNSDvdl2SAWCQOQzvFssQKyuXp7hC9pAam6NBb8Qm
QqfdD67tsaiBeKcLIoLOJXcq9eKMyGxmf60QMztknvUvswiBpPh/ItnUCNCIoSTc
JXBmsBhNRJJfrvXaPnEWU8lxgR1/ieGP0rLLhExjr4IFB0/qXIfk2nPOHRsaeg9H
9x9LtLzTAGunPGG5bs8gfF6AwbU8WpJ2SRN2ZhBilUt5Evdq4LczAy/PgEfDGRNI
DnVn+3LfVtaJ04p1qFPoDiC9hoHK/EEd1cqJl+dXFV/8ZfJs9E5HoEDK
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDvzCCAqegAwIBAgIUBhalAwMQ7BA1NH7td4msPPwxHzowDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIzMTAyNDA3NTM0NVoXDTMzMTAyMTA3NTM0NVow
czELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEmMCQGA1UEAwwdU3VwYWJhc2Ug
SW50ZXJtZWRpYXRlIDIwMjEgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEK
AoIBAQDOAMhXirH+EGIn8GaDp8T53rEogf7kM8OKW2uQ5yU/wxPa+w8BXgTzWy3W
JDAUhZE78oUtAd9kk5zKPrLXoT3W61PPnOc/9dceL5gB7/78m7EKCySziAA2c8vR
fnYPfznedDXi2lryttSYmMf2qbZDErAxwJDUm6cyq+HLAfb2qUH28u6jP8I9GDtG
PkQnjqtiRXEKjbTc/ntqCQrhtFK02mHkMSju7nEpkNYryunv5n/c9mrRY9/8GwmP
3uSZz3CQ8yQ/E0f8T9gCca2TcKuTQmW2pQqtHv1MuZ3jfJE5Nr9+Fap5kdzDJtdf
BdKofVNZlnYIru5yhUZywY3xYFfHAgMBAAGjUzBRMB0GA1UdDgQWBBQVoFMuvXJ9
Yv+QJr6/GJX0Z0VA+jAfBgNVHSMEGDAWgBSo17l2N9gs7ZISJp4OMiTVLWlGLDAP
BgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQAwdx0XJRHTf/crGpsr
n07uRziGSswWWTe+kDATMQeRZAEW3grVki5LDzs+JLbVIJYhRXFRXkqTRJdSGAgH
/0LNw7GDUwKOLnIRoYR3ILqSFZbkXbrYQ4Yir5yQZWgiNhRNfpEnMMIEQEZoSuFn
8Uh6M4HNfVuwBPgV0/gvKEja3DjJgwPAYzoXvKh5m3fKTt2c22YcTDdZTUDfrst6
Vpt/M03FY6D+897yfNR+nEzeEwjzHMZkperTwVfmBdyXIgIWexQ/whoky7+I4pjz
eLtkPBlwE3WB9fGZVjZqdUNSasS8mmWIyxHPttTzTHHmElDw2OQ/s9HjfCxJztk2
VCgJ
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const host = process.env.POSTGRES_HOST;
    const database = process.env.POSTGRES_DATABASE;
    const user = process.env.POSTGRES_USER;
    const password = process.env.POSTGRES_PASSWORD;
    if (!host || !database || !user || !password) {
      throw new Error("Missing required PG env vars: POSTGRES_HOST, POSTGRES_DATABASE, POSTGRES_USER, POSTGRES_PASSWORD");
    }
    pool = new pg.Pool({
      host,
      port: parseInt(process.env.POSTGRES_PORT ?? "6543", 10),
      database,
      user,
      password,
      ssl: {
        rejectUnauthorized: true,
        ca: process.env.POSTGRES_CA ?? SUPABASE_CA,
      },
      max: 10,
    });
    pool.on("error", (err) => {
      console.error("Unexpected PostgreSQL pool error:", err);
    });
  }
  return pool;
}

async function query(text: string, params?: unknown[]) {
  const client = await getPool().connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function queryOnClient(client: pg.PoolClient, text: string, params?: unknown[]) {
  return client.query(text, params);
}

async function fetchAllOnClient(client: pg.PoolClient, text: string, params?: unknown[]) {
  const { rows } = await queryOnClient(client, text, params);
  return rows ?? [];
}

async function fetchOneOnClient(client: pg.PoolClient, text: string, params?: unknown[]) {
  const rows = await fetchAllOnClient(client, text, params);
  return rows[0] ?? null;
}

async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await queryOnClient(client, "BEGIN");
    const result = await fn(client);
    await queryOnClient(client, "COMMIT");
    return result;
  } catch (e) {
    await queryOnClient(client, "ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function fetchAll(text: string, params?: unknown[]) {
  const { rows } = await query(text, params);
  return rows ?? [];
}

export async function fetchOne(text: string, params?: unknown[]) {
  const rows = await fetchAll(text, params);
  return rows[0] ?? null;
}

// ── Ships ──────────────────────────────────────────────────────────

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

export async function getImageData(shipId: number): Promise<ShipRow | null> {
  return fetchOne("SELECT id, name, data, submitted_by, discord_id, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = $1", [shipId]);
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
        tags.map(sanitizeText),
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
        tags.map(sanitizeText),
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
    return { success: "ship updated" };
  });
}

// ── Favorites ──────────────────────────────────────────────────────

export async function getMyFavorites(user: string, userId: string) {
  const data = await fetchAll(
    "SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb WHERE id = ANY (SELECT UNNEST(favorite) FROM favoritedb WHERE discord_id = $1 OR name = $2)",
    [userId, user],
  );
  return { data, page: 1, max_page: 1 };
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
    return { success: "unfavorited" };
  });
}

// ── Collections ───────────────────────────────────────────────────

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
  return { id: rows[0].id };
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

export async function getAllCollections(page = 1) {
  const PAGE = 24;
  const countRow = await fetchOne("SELECT COUNT(*) FROM collections");
  const total = parseInt(countRow?.count ?? "0", 10);
  const maxPage = Math.ceil(total / PAGE);
  const data = await fetchAll(
    "SELECT id, owner, title, description, array_length(ships, 1) AS ship_count, created_at FROM collections ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [PAGE, (page - 1) * PAGE],
  );
  return { data, page, max_page: maxPage, total_count: total };
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
  return { success: "collection updated" };
}

export async function deleteCollection(id: number, owner: string, ownerId: string) {
  const col = await fetchOne("SELECT owner, discord_id FROM collections WHERE id = $1", [id]);
  if (!col) return { error: "not found" };
  if (!isCollectionOwner(col, { id: ownerId, username: owner })) return { error: "not the owner" };
  await query("DELETE FROM collections WHERE id = $1 AND (discord_id = $2 OR owner = $3)", [id, ownerId, owner]);
  return { success: "collection deleted" };
}

export async function addShipToCollection(collectionId: number, shipId: number, owner: string, ownerId: string) {
  const col = await fetchOne("SELECT owner, discord_id, ships FROM collections WHERE id = $1", [collectionId]);
  if (!col) return { error: "not found" };
  if (!isCollectionOwner(col, { id: ownerId, username: owner })) return { error: "not the owner" };
  if (col.ships?.includes(shipId)) return { warning: "ship already in collection" };
  await query("UPDATE collections SET ships = COALESCE(ships, '{}') || $1::int[] WHERE id = $2 AND (discord_id = $3 OR owner = $4)", [[shipId], collectionId, ownerId, owner]);
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
  return { success: "ship removed" };
}

export async function getCollectionsForShip(shipId: number) {
  return fetchAll(
    "SELECT id, owner, title, description FROM collections WHERE $1 = ANY(ships)",
    [shipId],
  );
}

export type UserFromRequest = { id: string; username: string };

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
  });
}

// ── Search ─────────────────────────────────────────────────────────

export interface SearchFilters {
  page?: number;
  author?: string;
  desc?: string;
  minprice?: string;
  maxprice?: string;
  "max-crew"?: string;
  order?: string;
  fulltext?: string;
  brand?: string;
  tagsOn?: string[];
  tagsOff?: string[];
}

export async function getSearchPlus(filters: SearchFilters) {
  const conditions: string[] = [];
  const args: unknown[] = [];
  const tagsOn = filters.tagsOn ?? [];
  const tagsOff = filters.tagsOff ?? [];
  const page = filters.page ?? 1;

  const addCond = (val: string) => {
    args.push(val);
    return `$${args.length}`;
  };

  if (tagsOn.length) conditions.push(`tags @> ARRAY[${tagsOn.map(addCond)}]`);
  if (tagsOff.length) conditions.push(`NOT tags @> ARRAY[${tagsOff.map(addCond)}]`);
  if (filters.minprice) conditions.push(`price >= ${addCond(filters.minprice)}`);
  if (filters.maxprice) conditions.push(`price <= ${addCond(filters.maxprice)}`);
  if (filters.author) conditions.push(`author ILIKE ${addCond(`%${filters.author}%`)}`);
  if (filters["max-crew"]) conditions.push(`crew <= ${addCond(filters["max-crew"])}`);
  if (filters.brand === "exl") conditions.push(`brand = ${addCond("exl")}`);
  if (filters.brand === "gen") conditions.push(`brand = ${addCond("gen")}`);

  if (filters.desc) {
    const p1 = addCond(`%${filters.desc}%`);
    const p2 = addCond(`%${filters.desc}%`);
    conditions.push(`(description ILIKE ${p1} OR ship_name ILIKE ${p2})`);
  }
  if (filters.fulltext) {
    conditions.push(`EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag LIKE ${addCond(`${filters.fulltext}%`)})`);
  }

  const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
  const countRow = await fetchOne(`SELECT COUNT(*) FROM shipdb${where}`, args);
  const maxPage = Math.ceil(parseInt(countRow?.count ?? "0", 10) / PAGE_SIZE);

  const ORDER_BY_ALLOW: Record<string, string> = { fav: "fav DESC", pop: "downloads DESC" };
  const order = ORDER_BY_ALLOW[filters.order ?? ""] ?? "date DESC";

  const limit = page === -1 ? 999999 : PAGE_SIZE;
  const offset = page === -1 ? null : (page - 1) * PAGE_SIZE;

  args.push(limit);
  let sql = `SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb${where} ORDER BY ${order} LIMIT $${args.length}`;
  if (offset != null) {
    args.push(offset);
    sql += ` OFFSET $${args.length}`;
  }

  const data = await fetchAll(sql, args);
  const total_count = parseInt(countRow?.count ?? "0", 10);
  return { data, page, max_page: page === -1 ? 1 : maxPage, total_count };
}

// Also parse from query string — supports both old and new URL formats
export async function searchFromQueryString(queryString: string) {
  const filters: SearchFilters = {};
  let page = 1;
  const tagsOn: string[] = [];
  const tagsOff: string[] = [];

  for (const part of (queryString ?? "").split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const val = decodeURIComponent(part.slice(eq + 1)).replace(/\+/g, " ");

    if (key === "page") { page = parseInt(val, 10) || 1; continue; }
    if (key === "order") { filters.order = val; continue; }
    if (key === "q") { filters.desc = val; continue; }
    if (key === "tag") { tagsOn.push(val); continue; }
    if (key === "notag") { tagsOff.push(val); continue; }
    if (["author", "desc", "minprice", "maxprice", "max-crew", "order", "fulltext", "brand"].includes(key)) {
      (filters as Record<string, string>)[key] = val;
    } else if (val === "1") {
      tagsOn.push(key);
    } else if (val === "0") {
      tagsOff.push(key);
    }
  }

  if (tagsOn.length) filters.tagsOn = tagsOn;
  if (tagsOff.length) filters.tagsOff = tagsOff;
  filters.page = page;
  return getSearchPlus(filters);
}

// ── Metadata ───────────────────────────────────────────────────────

export async function getAuthorsWithCounts() {
  return fetchAll(
    "SELECT author, COUNT(*)::int AS count FROM shipdb GROUP BY author ORDER BY count DESC, author"
  );
}

export async function getTagsWithCounts() {
  return fetchAll(
    "SELECT tag, COUNT(*)::int AS count FROM (SELECT unnest(tags) AS tag FROM shipdb) sub GROUP BY tag ORDER BY count DESC, tag"
  );
}

// ── Signatures ────────────────────────────────────────────────────

export async function findDuplicateBySignature(signature: string) {
  return fetchAll(
    `SELECT ss.ship_id AS id, s.ship_name, s.author
     FROM ship_signatures ss
     JOIN shipdb s ON s.id = ss.ship_id
     WHERE ss.signature = $1
     LIMIT 5`,
    [signature],
  );
}
