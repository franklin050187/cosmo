/**
 * Pure query-string → search-filters parsing. No DB or cache imports, so it
 * stays unit-testable. `getSearchPlus` runs the SQL; this module only decides
 * what the filters mean.
 */

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

const SCALAR_KEYS = ["author", "desc", "minprice", "maxprice", "max-crew", "min-crew", "fulltext", "brand"];
const NUMERIC_KEYS = new Set(["minprice", "maxprice", "min-crew", "max-crew"]);

// Keys with special meaning to the app that must never be interpreted as
// legacy tag toggles. `just_logged_in=1` is appended by the OAuth callback;
// reading it as a tag filter made every post-login sort return zero ships.
const RESERVED_KEYS = new Set([...SCALAR_KEYS, "page", "order", "dir", "q", "tag", "notag", "just_logged_in"]);

export interface ParsedSearch {
  filters: SearchFilters;
  page: number;
}

export function filtersFromQueryString(queryString: string): ParsedSearch {
  const params = new URLSearchParams(queryString ?? "");
  const filters: SearchFilters = {};
  let page = 1;
  const tagsOn: string[] = [];
  const tagsOff: string[] = [];

  const pageStr = params.get("page");
  if (pageStr) page = parseInt(pageStr, 10) || 1;

  if (params.has("order")) filters.order = params.get("order")!;
  if (params.has("dir")) filters.dir = params.get("dir")!;
  if (params.has("q")) filters.desc = params.get("q")!;

  tagsOn.push(...params.getAll("tag"));
  tagsOff.push(...params.getAll("notag"));

  for (const key of SCALAR_KEYS) {
    if (!params.has(key)) continue;
    const value = params.get(key)!;
    // Numeric filters that fail coercion are ignored rather than passed to
    // Postgres, where they would error the comparison and 500 the request.
    if (NUMERIC_KEYS.has(key) && !Number.isFinite(Number(value))) continue;
    (filters as Record<string, string>)[key] = value;
  }

  // Legacy URL format: bare `SomeTag=1` / `SomeTag=0` toggles. Reserved keys
  // above are app parameters, never tags.
  for (const key of params.keys()) {
    if (RESERVED_KEYS.has(key)) continue;
    const val = params.get(key)!;
    if (val === "1") tagsOn.push(key);
    else if (val === "0") tagsOff.push(key);
  }

  if (tagsOn.length) filters.tagsOn = tagsOn;
  if (tagsOff.length) filters.tagsOff = tagsOff;
  filters.page = page;
  return { filters, page };
}
