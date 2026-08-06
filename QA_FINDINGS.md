# QA Findings — Full Suite Run (2026-08-07)

## Run metadata

- **Date:** 2026-08-07
- **Runner:** `node --env-file=.env --no-warnings scripts/qa-suite.ts`
- **Result:** **38 / 38 passed, 0 failed** — exit code 0
- **Phases:** 1 (logged-in, add ship), 2 (anonymous gates + decode), 3 (logged-in edit/update/delete + collections), 4 (no-trace sweep) — all green.
- Full log: `/tmp/qa-run1.log`

## Previously-open items — now green

| ID | Status | Note |
|----|--------|------|
| P2-G10 | ✅ PASS | "Login was cancelled." banner on `?auth_error=access_denied` — was flaky, passed clean this run (DEBUG eval still in place, see below). |
| P3-S6 | ✅ PASS | Replace-ship-image — the distinct-fixture fix from the last QA pause is verified: DB `data` swapped, **old hosted file → 404 (deleted), new → 200**. |

## Turnstile scope change — verified end-to-end

The Aug 6 narrowing (Turnstile only on critical actions) holds across the suite:
- **No captcha needed on non-critical, authenticated actions:** P3-S7 favorite/unfavorite passes.
- **Captcha still enforced on critical actions:** P1-U6 upload, P3-S5 edit, P3-S6 replace, P3-S8 create collection, P3-S10/P3-S11 deletes — all pass with the dev stub.
- P1-U3 admin dashboard solves the stub and renders analytics.

## Observations / non-blocking findings (no failures)

1. **Coverage gap — rate limiting is not covered by the suite.** `QA_TEST_PLAN.md` lists `P2-G11` (429 on rapid `check-duplicate`), but `scripts/qa-suite.ts` has no P2-G11 case. The limiter itself works (verified manually: `/callback` → 429 on 6th request), but the automated suite does not assert it.
2. **Stale expected count in the test plan.** `QA_TEST_PLAN.md` P1-U2a says My Ships should match `350`; the live DB has **1107** ships. The suite compares against a dynamic DB count so it passes, but the doc is outdated.
3. **P2-G2 label drift.** The check still displays "(403 + no data leak)" but asserts **401** (correct per the R4-PP-4 auth refactor). Cosmetic — update the case name.
4. **P2-G10 DEBUG block still present.** `qa-suite.ts:368-370` has a leftover DEBUG eval from debugging the flakiness. It ran clean — the block can be removed to quiet the log.
5. **Console sweep clean.** P3-S12 found no unexpected console errors (only the permitted Turnstile CDN noise).
6. **No-trace sweep passed.** P4-N1 confirms zero residue of scratch ship 2415 / collection 28 in `shipdb`, `ship_signatures`, `collections.ships`, `favoritedb.favorite`, and image hosting; fixture source ship 1624 and poney favorites baseline (4) intact.

## Verdict

Green run — no regressions. All previously-failing/flaky items resolved. Recommend addressing the two doc/coverage items (re-add P2-G11 rate-limit coverage; refresh `QA_TEST_PLAN.md` counts) before the next hardening pass.
