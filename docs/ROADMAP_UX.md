# CosmoShip — UX/UI & Feature Roadmap

User-facing UX/UI and functional improvements, mapped to the current code. Complements the
technical/deploy roadmap in [`docs/ROADMAP.md`](ROADMAP.md). Status legend:

| Mark | Meaning |
|------|---------|
| ⬜ TODO | Not started |
| 🚧 IN PROGRESS | Being worked on |
| ✅ DONE | Completed |
| 🔸 HOLD | Deferred / needs a product decision |

**How to read:** each item lists the component/file(s) it maps to, the expected UX outcome, and
a rough size (S = small, M = medium, L = large). Larger **new features** are explicitly marked.

---

## Phase 0 — Confirmed bugs (do first)

| # | Item | File(s) | Size | Status |
|---|------|---------|------|--------|
| P0-1 | **Private invite-code leak.** The join URL `{origin}/games/join/{invite_code}` renders for any page viewer, outside the owner guard — private games are trivially joinable. Show the join link only to the owner (and to members). | `src/app/games/[id]/page.tsx` | S | ✅ |
| P0-2 | **TagFilter include/exclude inversion.** Typing a tag and pressing Enter adds it as *excluded* (line 62 calls `add(..., true)`), contradicting the placeholder "prefix `-` to exclude". Plain text Enter should include; only a leading `-` should exclude. | `src/components/search/TagFilter.tsx` | S | ✅ |
| P0-3 | **Favorite state never initializes.** Ship detail always shows "☆ Favorite" on load even when already favorited (no server-side favorite status). Load favorite state with the ship / check on mount. | `src/app/ship/[id]/page.tsx` | M | ✅ |
| P0-4 | **Out-of-range page.** `?page=999` (or a stale URL) returns an empty result set and shows "No ships found" with no pagination — misleading. Clamp `page` to `max_page` / redirect to a valid page. | `src/app/page.tsx`, `src/lib/db/search.ts` | S | ✅ |

---

## Phase 1 — Core browse & search UX (priority)

| # | Item | File(s) | Size | Status |
|---|------|---------|------|--------|
| 1.1 | **Live debounced search** (search-as-you-type) + a visible submit affordance on desktop (currently Enter-only, undiscoverable). | `SearchBar.tsx`, `useFilters.ts` | M | ✅ |
| 1.2 | **Skeleton loading** instead of full-grid spinner on filter/page changes; keep prior results visible while refetching. | `HomeContent.tsx`, `ShipGrid.tsx` | M | ✅ |
| 1.3 | **`aria-live` results region** so screen readers announce count/page changes. | `HomeContent.tsx` | S | ✅ |
| 1.4 | **Error + retry states** for search fetch and My Ships (currently silent `console.error` / stale grid). | `HomeContent.tsx`, `my-ships/page.tsx` | M | ✅ |
| 1.5 | **Pagination polish**: ellipsis in truncated windows, explicit "Page X of Y", auto-scroll-to-top on page change, keyboard-friendly. | `HomeContent.tsx`, `page.tsx` | M | ✅ |
| 1.6 | **True faceted counts** that respect active filters; disable dead facet options (counts are currently global DB aggregates). | `FilterBody.tsx`, `AuthorFilter.tsx`, `TagFilter.tsx`, `search.ts` | L | ✅ |
| 1.7 | **More sort options** (name A–Z, price, crew) + explicit ascending/descending control. | `SortFilter.tsx`, `search.ts` | S | ✅ |
| 1.8 | **Drawer apply/cancel semantics** (or relabel "Show N results", which currently doesn't apply anything) + default sections collapsed on mobile. | `FilterDrawer.tsx`, `FilterSection.tsx` | M | ✅ |
| 1.9 | **Price/crew min≤max validation** + reduce keystroke fetch bursts (commit on blur / longer debounce). | `PriceFilter.tsx`, `CrewFilter.tsx`, `useFilters.ts` | M | ✅ |
| 1.10 | **Ship cards**: anonymous download, favorite toggle, share/copy-link, `title` tooltip on truncated names, fix misleading `cursor-zoom-in` (navigates, doesn't zoom). | `ShipCard.tsx` | M | ✅ |
| 1.11 | **Combobox a11y** (`role=listbox/option`, `aria-activedescendant`), plus "no matches" and loading states for the author & tag dropdowns. | `AuthorFilter.tsx`, `TagFilter.tsx` | M | ✅ |

---

## Phase 2 — Ship detail & discovery *(includes big features)*

| # | Item | File(s) | Size | Status |
|---|------|---------|------|--------|
| 2.1 | **Server-side `generateMetadata`** (client OG injection is invisible to crawlers → broken link previews). | `ship/[id]/page.tsx` | M | ✅ |
| 2.2 | **Image zoom / lightbox** for the hero image and reconstruction canvas. | `ship/[id]/page.tsx` | M | ✅ |
| 2.3 | **Share / copy-link** button. | `ship/[id]/page.tsx` | S | ✅ |
| 2.4 | 🆕 **Related ships** ("More by this author", "Ships with these tags", "Similar ships"). | `ship/[id]/page.tsx`, new API | L | ✅ |
| 2.5 | **Download feedback** (disable while fetching, `aria-live`, clean `ShipName.png` filename). | `download-ship.ts`, `ship/[id]/page.tsx`, `ShipCard.tsx` | S | ✅ |
| 2.6 | **Stats**: unit/label context, visualize center of mass, optional comparison to averages. | `ShipStatsPanel.tsx` | M | ✅ |
| 2.7 | **Price analysis**: dark-theme canvas, responsive/touch readout, `role="img"` + accessible table, chart download. | `ShipPriceAnalysis.tsx` | M | ✅ |
| 2.8 | **JSON view**: copy + download buttons, clearer "raw blueprint" label. | `ShipJson.tsx` | S | ✅ |
| 2.9 | **Reconstruction**: zoom/pan, overlay toggles (CoM, thrust, tractor CoM), render progress %, sprite-load error state. | `ShipReconstruction.tsx` | M | ✅ |
| 2.10 | **Edit page**: inline save success/error messaging, disable-on-save, unsaved-changes guard (`beforeunload`/router). | `ship/[id]/edit/page.tsx` | M | ✅ |
| 2.11 | **Replace modal a11y**: focus trap, Escape-to-close, focus restore, backdrop cancel; show full tag impact in the diff. | `ShipReplaceModal.tsx`, `edit/page.tsx` | M | ✅ |

---

## Phase 3 — Upload & collections *(includes big features)*

| # | Item | File(s) | Size | Status |
|---|------|---------|------|--------|
| 3.1 | 🆕 **Drag-and-drop** upload (currently click-only despite dropzone look) + drag-over feedback. | `UploadPanel.tsx` | M | ✅ |
| 3.2 | 🆕 **Multi-file / batch upload.** | `UploadPanel.tsx`, API | L | ✅ |
| 3.3 | **Decode & upload progress bars** (currently text-only "Decoding…"/"Uploading…"). | `UploadPanel.tsx` | M | ✅ |
| 3.4 | **Client-side size/type enforcement** (`accept`, 8MB max) with clear feedback; fix hidden-file-input keyboard focus. | `UploadPanel.tsx` | S | ✅ |
| 3.5 | **Author override** at upload time (author currently taken from the PNG). | `UploadPanel.tsx` | S | ⬜ |
| 3.6 | **CollectionPicker**: fix the nested `div[role=button]`-wrapping-`button` control; focus management; Escape/arrows; clamp panel to viewport. | `CollectionPicker.tsx`, `AddToCollectionButton.tsx` | M | ✅ |
| 3.7 | **CollectionCard**: always-visible delete + confirmation (currently hover-only, invisible on touch), thumbnail preview. | `CollectionCard.tsx` | M | ✅ |
| 3.8 | **RichTextEditor**: inline URL field instead of `window.prompt`; optional more formatting; expose `role="textbox"`. | `RichTextEditor.tsx` | M | ✅ |
| 3.9 | 🆕 **Custom / free-form tags** + tag search in the editor. | `UserTagEditor.tsx` | M | ✅ |

---

## Phase 4 — Games & roulette *(includes big features)*

Core games/roulette/bracket features are implemented: create/register/join, roulette deal, and single +
double elimination brackets with connector lines, winner-drop lines, BYE labels, auto-advance, results +
auto-finish, and the S/M polish items below. Remaining: L-sized (4.7/4.8) and roulette polish (4.9/4.10),
plus bracket editable matchups/re-seed/score tracking (4.4 remainder). Statuses updated 2026-08-17 (see
`NEXT_STEPS.md`).

| # | Item | File(s) | Size | Status |
|---|------|---------|------|--------|
| 4.1 | **Game cards**: status (open/closed/finished), private, roulette, and "you're registered" badges; relative/urgent date labels. | `GameCard.tsx`, `games/page.tsx` | M | ✅ |
| 4.2 | **Error vs success message styling** (`role="alert"` on failures; currently one cyan `msg` state). | `games/[id]/page.tsx` | S | ✅ |
| 4.3 | **Delete confirmation dialog** (currently native `confirm()` as captcha-as-confirmation with no confirm copy). | `games/[id]/page.tsx` | S | ✅ |
| 4.4 | **Bracket** — done: aligned grid + SVG connector lines between rounds, winner-path highlight, **winner-drop lines** (WB loser → LB target, lit when decided), **"BYE" labels** on decided bye slots, double elim (winners top / losers under / GF rightmost), ✓ gated until both feeding matches are decided, losers-R1 singleton auto-advance, explain-byes legend + `aria-live` announcements. Remaining: editable matchups / re-seed / manual slot; score/set tracking. | `Bracket.tsx`, games API | L | 🚧 |
| 4.5 | **Results / outcome view** + auto-mark-finished with a champion summary. | `games/[id]/page.tsx`, `Bracket.tsx` | M | ✅ |
| 4.6 | **Deal-ships results**: ship image + rarity, highlight "your ship", warn before re-deal (destructive). | `games/[id]/page.tsx` | M | ✅ |
| 4.7 | 🆕 **Notifications/reminders** (game starting, reg opens/closes, ships dealt) — no mechanism exists today. | new lib + games routes | L | ⬜ |
| 4.8 | 🆕 **Real-time / polling refresh** for registrations, bracket, and deals. | `games/[id]/page.tsx`, `Bracket.tsx` | L | ⬜ |
| 4.9 | **Roulette**: skip/cancel roll, per-result share, draw history, accurate displayed odds, `aria-live` result announcement. | `RouletteGame.tsx` | M | ⬜ |
| 4.10 | **Roulette picker**: paginate collections, handle deep-link blank option, add copy-share button, error states. | `roulette/page.tsx` | M | ⬜ |
| 4.11 | **IA collision**: `/game` (About Cosmoteer) vs `/games` (community games) — rename `/game` URL and add header link. | `about-game/page.tsx`, `Header.tsx`, `Footer.tsx` | S | ✅ |
| 4.12 | **Timezone labels / countdowns** on all game dates. | `format-date.ts` consumers | M | ✅ |

---

## Phase 5 — Global & nav

| # | Item | File(s) | Size |
|---|------|---------|------|
| 5.1 | **Active-route highlight** in nav; `aria-expanded`/`aria-controls` on the burger; Escape-to-close for menus/dropdowns. | `Header.tsx` | M | ✅ |
| 5.2 | **My Ships**: empty-state with Upload CTA, loading spinner, error display, pagination/lazy-load, in-page filter/sort. | `my-ships/page.tsx` | L |
| 5.3 | **RequireAuth**: reduce hydration spinner latency; add context copy ("what you'll get"). | `RequireAuth.tsx` | S | ✅ |

---

## By design / out of scope (documented)

- Guest registration in games is username-keyed and unverified (accepted for now; see Phase 4 hardening if a decision is made).
- Turnstile stays on critical mutations only (favorites / add-remove-collection-ship intentionally un-gated).

---

**Sources** — derived from a codebase UX/UI audit (2026-08-15): `docs/CODE_REVIEW_FINDINGS.md`,
`docs/QA_FINDINGS.md`, plus a fresh component-level review of search, ship detail, upload,
collections, games, and roulette. Bugs P0-1–P0-4 were reproduced/verified in the code.
Phase 0–2 statuses verified against the code 2026-08-18; Phase 3 verified the same day — all
items done except 3.5 (author override at upload time, still reads from the PNG).
