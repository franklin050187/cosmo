# Search & Filter Redesign — Mobile-First Ship Catalogue

## UX Strategy

Based on Baymard Institute research, top DTC catalogue patterns (ASOS, Etsy, Shopify stores), and this app's specific needs:

- **Mobile**: Full-screen filter drawer (bottom sheet) + inline quick-filter chips above grid
- **Desktop**: Collapsible sidebar with all facets visible
- **URL state**: Every filter reflected in query params — shareable, bookmarkable, back-button safe
- **Autocomplete**: For author and tag fields, fetched from DB/API
- **Active chips**: Always visible above the grid, individually removable, with "Clear all"

---

## Architecture

### Filter Hierarchy (ordered by importance for this catalogue)

1. **Text search** (name/description) — always visible, top bar
2. **Tags** — include/exclude with autocomplete, highest engagement
3. **Price range** — min/max with dual slider or inputs
4. **Max crew** — single slider/input
5. **Author** — autocomplete from DB
6. **Sort + Brand** — secondary, tucked into drawer or inline

### Component Breakdown

```
SearchBar (always visible, top)
├── SearchInput (text search with debounce)
└── FilterButton (opens drawer on mobile, toggle sidebar on desktop)

FilterDrawer (mobile: full-screen bottom sheet)
├── Header ("Filters" + result count + close)
├── FilterSection: Tags (autocomplete, include/exclude)
├── FilterSection: Price Range (min/max inputs + slider)
├── FilterSection: Crew (max input + slider)
├── FilterSection: Author (autocomplete)
├── FilterSection: Sort (radio chips)
├── FilterSection: Brand (toggle)
├── Sticky Footer ("Show X results" button + "Clear all")

ActiveFilters (above grid, horizontal scroll chips)
├── Chip per active filter (removable X)
└── "Clear all" link

ShipGrid (existing, unchanged)
```

---

## File Plan

### New Files

| File | Purpose |
|---|---|
| `src/components/search/SearchBar.tsx` | Top search bar: text input + filter toggle button. Always visible. |
| `src/components/search/FilterDrawer.tsx` | Mobile bottom-sheet drawer with all filter sections. |
| `src/components/search/FilterSection.tsx` | Collapsible section wrapper (title, open/close, badge count). |
| `src/components/search/TagFilter.tsx` | Tag autocomplete with include/exclude toggle per tag. |
| `src/components/search/PriceFilter.tsx` | Min/max price inputs + dual-range slider. |
| `src/components/search/CrewFilter.tsx` | Max crew input + slider. |
| `src/components/search/AuthorFilter.tsx` | Author autocomplete (fetched from `/api/ship/authors`). |
| `src/components/search/SortFilter.tsx` | Sort radio chips (Newest, Most Popular, Most Favorited). |
| `src/components/search/ActiveFilters.tsx` | Horizontal scroll chip row above grid. |
| `src/hooks/useFilters.ts` | Central filter state hook: reads/writes URL searchParams, debounced fetch. |
| `src/hooks/useDebounce.ts` | Generic debounce hook for text inputs. |
| `src/app/api/ship/authors/route.ts` | Returns distinct author names (for autocomplete). |
| `src/app/api/ship/tags/route.ts` | Returns all tags with ship counts (for autocomplete with counts). |

### Modified Files

| File | Changes |
|---|---|
| `src/app/page.tsx` | Replace SearchForm with new SearchBar + ActiveFilters + FilterDrawer. Use `useFilters` hook. |
| `src/app/globals.css` | Add drawer animation, slider styles, chip styles. |
| `src/lib/db.ts` | Add `getAuthors()` and `getTagsWithCounts()` functions. Add `min-crew` support. |

### Deleted Files

| File | Reason |
|---|---|
| `src/components/search/SearchForm.tsx` | Replaced by new component architecture. |

---

## Detailed Component Specs

### SearchBar.tsx
- Full-width sticky bar below Header
- Left: magnifying glass icon
- Center: text input ("Search ships by name, description, author...")
- Right: filter icon button with badge showing active filter count
- On mobile: filter button opens FilterDrawer
- On desktop (≥768px): filter button toggles sidebar or expands inline
- Text input debounced 300ms, updates URL param `q`
- Enter key submits immediately (clears debounce timer)

### FilterDrawer.tsx (Mobile)
- Slides up from bottom (CSS transform, 300ms ease)
- Full-screen overlay with backdrop blur
- Scroll lock on body when open
- **Header**: "Filters" title, result count badge, X close button
- **Scrollable body**: FilterSection components stacked vertically
- **Sticky footer**: "Show {N} results" primary button + "Clear all" text button
- Footer shows live count that updates as filters change
- Auto-close on apply (after showing success briefly)

### FilterSection.tsx
- Collapsible accordion (open by default for top 3, collapsed for rest)
- Header: section title + active count badge
- Body: filter controls
- Touch-friendly: full-row tap targets (44px min)

### TagFilter.tsx
- Search input with autocomplete dropdown
- Fetches from `/api/ship/tags` (returns `[{tag, count}]`)
- Autocomplete shows tags matching input, with ship count
- Selected tags shown as chips below input
- Each chip has toggle: green (include) / red (exclude) / tap to remove
- Default: include mode. Swipe or long-press to switch to exclude
- Visual: included tags = blue/teal chips, excluded tags = red chips with strikethrough icon
- Exclude tags also available via text: prefix with `-` (e.g., `-mines`)

### PriceFilter.tsx
- Two number inputs: Min ($) and Max ($)
- Dual-range slider below inputs (touch-friendly, 44px height)
- Range: 0 to max price in DB (fetched once)
- Step: 100
- Inputs and slider stay in sync
- Show "$0 — $25M" when no filter active

### CrewFilter.tsx
- Single number input: Max Crew
- Horizontal slider below
- Range: 0 to 1000
- Step: 1
- Show "Any crew" when no filter active

### AuthorFilter.tsx
- Text input with autocomplete dropdown
- Fetches from `/api/ship/authors` (returns distinct author names)
- Filters as you type (client-side after initial fetch)
- Selecting an author sets `author` param
- Clear button to remove filter

### SortFilter.tsx
- Horizontal chip row (radio-style, single select)
- Options: "Newest" (default), "Most Popular", "Most Favorited"
- Active chip: filled/highlighted
- Maps to `order=new|pop|fav`

### ActiveFilters.tsx
- Horizontal scrollable chip row between SearchBar and grid
- Each active filter = removable chip (X button)
- Chips show filter label: "Author: penny58#0", "Tags: cannon, -mines", "Price: $1K-$50K", "Crew: ≤200"
- "Clear all" text link at right end
- Hidden when no filters active

### useFilters.ts Hook
- Reads all filter state from URL searchParams
- Provides `setFilter(key, value)` and `clearFilters()` functions
- Debounces text inputs (q, author) at 300ms
- Non-text filters update immediately
- Returns `{ filters, setFilter, clearFilters, activeCount, resultsUrl }`
- URL params: `q`, `author`, `minprice`, `maxprice`, `max-crew`, `tag` (multi), `notag` (multi), `order`, `brand`, `page`

### /api/ship/authors/route.ts
```sql
SELECT DISTINCT author FROM shipdb ORDER BY author;
```
Returns `{ authors: string[] }`. Cached for 60s.

### /api/ship/tags/route.ts
```sql
SELECT unnest(tags) AS tag, COUNT(*) AS count
FROM shipdb
GROUP BY tag
ORDER BY count DESC;
```
Returns `{ tags: [{tag: string, count: number}] }`. Cached for 60s.

### db.ts additions
```typescript
getAuthors(): Promise<string[]>
getTagsWithCounts(): Promise<{tag: string, count: number}[]>
```
Also add `min-crew` filter support to `searchShips()`.

---

## URL Schema

```
/?q=destroyer&tag=cannon&tag=railgun&notag=mines&minprice=10000&maxprice=500000&max-crew=200&author=penny58%230&order=pop&page=1
```

| Param | Type | Example |
|---|---|---|
| `q` | string | `destroyer` |
| `author` | string | `penny58#0` |
| `tag` | string[] | `tag=cannon&tag=railgun` |
| `notag` | string[] | `notag=mines` |
| `minprice` | number | `10000` |
| `maxprice` | number | `500000` |
| `max-crew` | number | `200` |
| `order` | enum | `new`, `pop`, `fav` |
| `brand` | string | `exc` or `cosm` |
| `page` | number | `1` |

---

## DB Changes Required

### searchShips updates
- Add `minprice` support (currently missing — DB layer has it but API doesn't pass it)
- Map `tag` array → `tags @> ARRAY[$tag]` (AND logic: ship must have ALL listed tags)
- Map `notag` array → `NOT tags @> ARRAY[$notag]` (exclude ships with ANY of these tags)
- Add `min-crew` support: `crew >= $mincrew`

### New queries
- `getAuthors()`: `SELECT DISTINCT author FROM shipdb ORDER BY author`
- `getTagsWithCounts()`: `SELECT unnest(tags) AS tag, COUNT(*) AS count FROM shipdb GROUP BY tag ORDER BY count DESC`

---

## Implementation Order

1. **Phase 1 — API layer**: Add `/api/ship/authors`, `/api/ship/tags`, update `db.ts` with new queries + min-crew support
2. **Phase 2 — Hooks**: Build `useFilters.ts` and `useDebounce.ts`
3. **Phase 3 — FilterDrawer**: Build drawer with all filter sections (TagFilter, PriceFilter, CrewFilter, AuthorFilter, SortFilter)
4. **Phase 4 — SearchBar + ActiveFilters**: Build top bar and chip row
5. **Phase 5 — Wire up**: Replace SearchForm in page.tsx, connect hooks to URL state and API calls
6. **Phase 6 — Polish**: Animations, transitions, touch testing, edge cases (empty states, zero results)
