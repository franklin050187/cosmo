import { fetchAll, fetchOne, PAGE_SIZE } from "./core";
import { cachedQuery } from "@/lib/cache";

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
  return cachedQuery("search", 30_000, JSON.stringify(filters), async () => {
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
  });
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
  return cachedQuery("authors", 300_000, "all", async () =>
    fetchAll(
      "SELECT author, COUNT(*)::int AS count FROM shipdb GROUP BY author ORDER BY count DESC, author"
    )
  );
}

export async function getTagsWithCounts() {
  return cachedQuery("tags", 300_000, "all", async () =>
    fetchAll(
      "SELECT tag, COUNT(*)::int AS count FROM (SELECT unnest(tags) AS tag FROM shipdb) sub GROUP BY tag ORDER BY count DESC, tag"
    )
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