import { fetchAll, fetchOne, PAGE_SIZE } from "./core";
import { cachedQuery } from "@/lib/cache";

export interface SearchFilters {
  page?: number;
  author?: string;
  desc?: string;
  minprice?: string;
  maxprice?: string;
  "max-crew"?: string;
  "min-crew"?: string;
  order?: string;
  dir?: string;
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
    if (filters["min-crew"]) conditions.push(`crew >= ${addCond(filters["min-crew"])}`);
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

    // Faceted counts over the full filtered set (not the limited page), so
    // badge/option counts reflect the active filters. Uses a snapshot of the
    // WHERE args (before LIMIT/OFFSET are appended below).
    const facetArgs = [...args];
    const whereWith = (extra: string) =>
      ` WHERE ${[...conditions, extra].join(" AND ")}`;
    const [authorCounts, tagCounts, hasPrice, hasCrew] = await Promise.all([
      fetchAll(
        `SELECT author, COUNT(*)::int AS count FROM shipdb${where} GROUP BY author ORDER BY count DESC, author`,
        facetArgs,
      ),
      fetchAll(
        `SELECT tag, COUNT(*)::int AS count FROM (SELECT unnest(tags) AS tag FROM shipdb${where}) sub GROUP BY tag ORDER BY count DESC, tag`,
        facetArgs,
      ),
      fetchOne(
        `SELECT EXISTS(SELECT 1 FROM shipdb${whereWith("price > 0")}) AS has_price`,
        facetArgs,
      ),
      fetchOne(
        `SELECT EXISTS(SELECT 1 FROM shipdb${whereWith("crew > 1")}) AS has_crew`,
        facetArgs,
      ),
    ]);

    const ORDER_COLUMNS: Record<string, [string, "asc" | "desc"]> = {
      new: ["date", "desc"],
      pop: ["downloads", "desc"],
      fav: ["fav", "desc"],
      name: ["ship_name", "asc"],
      price: ["price", "desc"],
      crew: ["crew", "asc"],
    };
    const [col, defaultDir] = ORDER_COLUMNS[filters.order ?? ""] ?? ORDER_COLUMNS.new;
    const dir = filters.dir === "asc" ? "asc" : filters.dir === "desc" ? "desc" : defaultDir;
    const order = `${col} ${dir.toUpperCase()}`;

    const effectivePage = page === -1 ? -1 : Math.min(Math.max(page, 1), Math.max(maxPage, 1));
    const limit = effectivePage === -1 ? 2000 : PAGE_SIZE;
    const offset = effectivePage === -1 ? null : (effectivePage - 1) * PAGE_SIZE;

    args.push(limit);
    let sql = `SELECT id, name, data, submitted_by, description, ship_name, author, price, brand, crew, tags, downloads, fav, date FROM shipdb${where} ORDER BY ${order} LIMIT $${args.length}`;
    if (offset != null) {
      args.push(offset);
      sql += ` OFFSET $${args.length}`;
    }

    const data = await fetchAll(sql, args);
    const total_count = parseInt(countRow?.count ?? "0", 10);
    return {
      data,
      page: effectivePage,
      max_page: effectivePage === -1 ? 1 : maxPage,
      total_count,
      author_counts: (authorCounts as Array<{ author: string; count: number | string }>).map((a) => ({ author: a.author, count: Number(a.count) })),
      tag_counts: (tagCounts as Array<{ tag: string; count: number | string }>).map((t) => ({ tag: t.tag, count: Number(t.count) })),
      has_price: !!hasPrice?.has_price,
      has_crew: !!hasCrew?.has_crew,
    };
  });
}

// Also parse from query string — supports both old and new URL formats
export async function searchFromQueryString(queryString: string) {
  const params = new URLSearchParams(queryString ?? "");
  const filters: SearchFilters = {};
  let page = 1;
  const tagsOn: string[] = [];
  const tagsOff: string[] = [];

  const SCALAR_KEYS = ["author", "desc", "minprice", "maxprice", "max-crew", "min-crew", "fulltext", "brand"];

  const pageStr = params.get("page");
  if (pageStr) page = parseInt(pageStr, 10) || 1;

  if (params.has("order")) filters.order = params.get("order")!;
  if (params.has("dir")) filters.dir = params.get("dir")!;
  if (params.has("q")) filters.desc = params.get("q")!;

  tagsOn.push(...params.getAll("tag"));
  tagsOff.push(...params.getAll("notag"));

  const NUMERIC_KEYS = new Set(["minprice", "maxprice", "min-crew", "max-crew"]);

  for (const key of SCALAR_KEYS) {
    if (!params.has(key)) continue;
    const value = params.get(key)!;
    // Numeric filters that fail coercion are ignored rather than passed to
    // Postgres, where they would error the comparison and 500 the request.
    if (NUMERIC_KEYS.has(key) && !Number.isFinite(Number(value))) continue;
    (filters as Record<string, string>)[key] = value;
  }

  for (const key of params.keys()) {
    if (key === "page" || key === "order" || key === "q" || key === "tag" || key === "notag") continue;
    if (SCALAR_KEYS.includes(key)) continue;
    const val = params.get(key)!;
    if (val === "1") tagsOn.push(key);
    else if (val === "0") tagsOff.push(key);
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