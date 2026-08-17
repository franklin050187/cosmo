"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import type { GameMatch, GameContestant, BracketType } from "@/lib/types";

interface Props {
  gameId: number;
  matches: GameMatch[];
  contestants: GameContestant[];
  isOwner: boolean;
  bracketType?: BracketType;
  onChanged?: () => void;
}

function PlayerRow({
  name,
  isWinner,
  onWin,
  onClear,
  busy,
}: {
  name: string | null;
  isWinner: boolean;
  onWin?: () => void;
  onClear?: () => void;
  busy?: boolean;
}) {
  const icons = name && (onWin || onClear) && (
    <span className="ml-2 flex items-center gap-1">
      {onWin && (
        <button
          type="button"
          onClick={onWin}
          disabled={busy}
          aria-label={`Mark ${name} as winner`}
          title="Mark as winner"
          className="w-5 h-5 inline-flex items-center justify-center rounded text-green-400 hover:bg-green-400/20 hover:text-green-300 disabled:opacity-40 transition-colors"
        >
          ✓
        </button>
      )}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label={`Remove ${name} as winner`}
          title="Remove winner"
          className="w-5 h-5 inline-flex items-center justify-center rounded text-red-400 hover:bg-red-400/20 hover:text-red-300 disabled:opacity-40 transition-colors"
        >
          ✗
        </button>
      )}
    </span>
  );

  const namePart = name ? (
    <span className="truncate">{name}</span>
  ) : (
    <span className="text-gray-600">—</span>
  );

  return (
    <div
      className={`flex items-center justify-between w-full px-3 py-2 text-sm text-left ${
        isWinner ? "text-cyan-300 font-semibold" : "text-white"
      }`}
    >
      {namePart}
      {icons}
    </div>
  );
}

function MatchCard({
  match,
  nameById,
  isOwner,
  busy,
  setWinner,
  resetWinner,
}: {
  match: GameMatch;
  nameById: Map<number, string>;
  isOwner: boolean;
  busy: boolean;
  setWinner: (match: GameMatch, contestantId: number) => void;
  resetWinner: (match: GameMatch) => void;
}) {
  const a = match.contestant_a != null ? nameById.get(match.contestant_a) ?? null : null;
  const b = match.contestant_b != null ? nameById.get(match.contestant_b) ?? null : null;
  const undecided = match.winner == null && isOwner;
  // The match only becomes playable once BOTH contestants are decided — i.e.
  // every match feeding into it has recorded a winner (slots are only filled
  // when the feeding match finishes). Until then the other slot is still a
  // "potential" contestant, so wait.
  const playable = undecided && match.contestant_a != null && match.contestant_b != null;
  return (
    <div data-match-id={match.id} className="border border-[#1C598C]/60 rounded bg-[#021526]/60 w-full min-w-44">
      <PlayerRow
        name={a}
        isWinner={match.winner === match.contestant_a}
        onWin={playable ? () => setWinner(match, match.contestant_a!) : undefined}
        onClear={isOwner && match.winner === match.contestant_a ? () => resetWinner(match) : undefined}
        busy={busy}
      />
      <div className="border-t border-[#1C598C]/40" />
      <PlayerRow
        name={b}
        isWinner={match.winner === match.contestant_b}
        onWin={playable ? () => setWinner(match, match.contestant_b!) : undefined}
        onClear={isOwner && match.winner === match.contestant_b ? () => resetWinner(match) : undefined}
        busy={busy}
      />
    </div>
  );
}

function nextPow2(n: number) {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/** Grid row placement (lines) for a winners-bracket match. r/m are the DB round/position. */
function winnersRowStyle(r: number, m: number): React.CSSProperties {
  const r0 = r - 1;
  const start = Math.pow(2, r0 + 1) * m + Math.pow(2, r0) + 1;
  return { gridRow: `${start} / ${start + 2}` };
}

/**
 * Grid row placement for a losers-bracket match (j/p are the DB round/position).
 * The losers bracket sits BELOW the winners bracket: its block starts after the
 * winners block (P rows) plus its own header row, and rows are assigned with the
 * same recursive centering so parents sit between their children.
 */
function losersRowStyle(j: number, p: number, P: number): React.CSSProperties {
  const L = Math.ceil(j / 2) - 1;
  const start = P + 2 + Math.pow(2, L + 1) * p + Math.pow(2, L);
  return { gridRow: `${start} / ${start + 2}` };
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cy: number;
}

export default function Bracket({
  gameId,
  matches,
  contestants,
  isOwner,
  bracketType = "single_elim",
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<{ d: string; active: boolean }[]>([]);
  const [cellH, setCellH] = useState(0);
  const [headerH, setHeaderH] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const nameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of contestants) map.set(c.id, c.discord_username);
    return map;
  }, [contestants]);

  const winners = useMemo(
    () =>
      matches
        .filter((m) => m.bracket === "winners")
        .sort((a, b) => a.round - b.round || a.position - b.position),
    [matches],
  );
  const losers = useMemo(
    () =>
      matches
        .filter((m) => m.bracket === "losers")
        .sort((a, b) => a.round - b.round || a.position - b.position),
    [matches],
  );
  const grandFinal = useMemo(
    () =>
      matches
        .filter((m) => m.bracket === "grand_final")
        .sort((a, b) => a.round - b.round || a.position - b.position),
    [matches],
  );

  const isDouble = bracketType === "double_elim";

  // Grid geometry: winners bracket on top (left → right), losers bracket below
  // (also left → right, sitting under the winners), grand final as the rightmost
  // column bridging both. One shared vertical scale keeps parents centered
  // between their children and the finals aligned.
  const layout = useMemo(() => {
    const r1Count = winners.filter((m) => m.round === 1).length;
    const P = r1Count > 0 ? nextPow2(r1Count * 2) : 0;
    const k = P > 1 ? Math.round(Math.log2(P)) : 0;
    const lbCount = isDouble ? 2 * k - 2 : 0;
    const lbH = lbCount > 0 ? Math.pow(2, k - 1) : 0;
    const cols = !isDouble ? k : Math.max(k, lbCount) + 1;

    // Grand-final rows are centered between the winners final and the losers
    // final so the reset (round 2) stacks neatly underneath. The midpoint is a
    // half-row off the shared scale, so place GF r1 on the nearest 2-row pair.
    let gf1Rows: [number, number] = [0, 0];
    let gf2Rows: [number, number] = [0, 0];
    let R = !isDouble ? P : P + 1 + lbH;
    if (isDouble) {
      const winFinalC = Math.pow(2, k - 1) + 1.5;
      const lbFinalC = lbCount > 0 ? P + 2.5 + Math.pow(2, k - 2) : winFinalC;
      const gf1C = (winFinalC + lbFinalC) / 2;
      gf1Rows = [gf1C, gf1C + 1];
      gf2Rows = [gf1C + 2, gf1C + 3];
      R = Math.max(R, Math.ceil(gf1C) + 2);
    }
    return { P, k, lbCount, lbH, cols, R, gf1Rows, gf2Rows };
  }, [winners, isDouble]);

  const { P, k, lbCount, cols, R, gf1Rows, gf2Rows } = layout;

  const winnerRounds = useMemo(() => {
    const groups: GameMatch[][] = [];
    for (let r = 1; r <= k; r++) {
      groups.push(winners.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
    }
    return groups;
  }, [winners, k]);

  const gf1 = grandFinal.find((m) => m.round === 1) ?? null;
  const gf2 = grandFinal.find((m) => m.round === 2) ?? null;

  const championId = useMemo(() => {
    if (!isDouble) {
      const finalRound = winnerRounds[winnerRounds.length - 1] ?? [];
      return finalRound[0]?.winner ?? null;
    }
    // Double elimination: a losers-side win in the grand final round 1 forces a
    // reset — the reset-round winner is the champion.
    if (gf2?.winner != null) return gf2.winner;
    if (gf1?.winner != null && gf1.winner === gf1.contestant_a) return gf1.winner;
    return null;
  }, [isDouble, winnerRounds, gf1, gf2]);

  const champion = championId != null ? nameById.get(championId) ?? null : null;

  const setWinner = async (match: GameMatch, contestantId: number) => {
    if (!isOwner) return;
    setBusy(match.id);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/matches/${match.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner: contestantId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to record winner");
        return;
      }
      onChanged?.();
    } catch {
      setError("Failed to record winner");
    } finally {
      setBusy(null);
    }
  };

  const resetWinner = async (match: GameMatch) => {
    if (!isOwner) return;
    setBusy(match.id);
    setError(null);
    try {
      const res = await fetch(`/api/games/${gameId}/matches/${match.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to clear winner");
        return;
      }
      onChanged?.();
    } catch {
      setError("Failed to clear winner");
    } finally {
      setBusy(null);
    }
  };

  // Draw the connector lines between a match and the match its winner advances to.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || matches.length === 0 || P < 2 || cellH === 0) {
      setSegments([]);
      return;
    }

    let raf = 0;
    const draw = () => {
      const cRect = container.getBoundingClientRect();
      const rects = new Map<number, Rect>();
      container.querySelectorAll<HTMLElement>("[data-match-id]").forEach((el) => {
        const id = Number(el.getAttribute("data-match-id"));
        if (!Number.isFinite(id)) return;
        const r = el.getBoundingClientRect();
        rects.set(id, {
          left: r.left - cRect.left,
          right: r.right - cRect.left,
          top: r.top - cRect.top,
          bottom: r.bottom - cRect.top,
          cy: (r.top + r.bottom) / 2 - cRect.top,
        });
      });

      const byKey = new Map<string, number>();
      for (const m of matches) byKey.set(`${m.bracket}:${m.round}:${m.position}`, m.id);
      const activeIds = new Set<number>(matches.filter((m) => m.winner != null).map((m) => m.id));

      const groups = new Map<string, number[]>();
      const addChild = (parentKey: string, childId: number) => {
        const list = groups.get(parentKey);
        if (list) list.push(childId);
        else groups.set(parentKey, [childId]);
      };

      for (const m of winners) {
        if (isDouble && m.round === k) addChild("grand_final:1:0", m.id);
        else if (m.round < k) addChild(`winners:${m.round + 1}:${Math.floor(m.position / 2)}`, m.id);
      }
      for (const m of losers) {
        if (m.round >= lbCount) addChild("grand_final:1:0", m.id);
        else {
          const nj = m.round + 1;
          const np = nj % 2 === 0 ? m.position : Math.floor(m.position / 2);
          addChild(`losers:${nj}:${np}`, m.id);
        }
      }
      // The grand final reset round is connected only once it is actually in play.
      if (gf1 && gf2 && (gf2.contestant_a != null || gf2.contestant_b != null)) {
        addChild("grand_final:2:0", gf1.id);
      }

      const out: { d: string; active: boolean }[] = [];
      for (const [parentKey, childIds] of groups) {
        const parentId = byKey.get(parentKey);
        const pr = parentId != null ? rects.get(parentId) : undefined;
        if (!pr) continue;
        const childRects = childIds
          .map((cid) => ({ id: cid, rect: rects.get(cid) }))
          .filter((x): x is { id: number; rect: Rect } => x.rect != null);
        if (childRects.length === 0) continue;

        // The grand final has children on BOTH sides (winners bracket left,
        // losers bracket right); emit a connector group per side.
        const leftChildren = childRects.filter((c) => c.rect.right <= pr.left);
        const rightChildren = childRects.filter((c) => c.rect.left >= pr.right);
        if (leftChildren.length === 0 && rightChildren.length === 0) continue;

        const emit = (children: { id: number; rect: Rect }[], childrenOnLeft: boolean) => {
          const parentFaceX = childrenOnLeft ? pr.left : pr.right;
          const childFaceX = childrenOnLeft
            ? Math.min(...children.map((c) => c.rect.right))
            : Math.max(...children.map((c) => c.rect.left));
          const junctionX = (childFaceX + parentFaceX) / 2;

          const push = (d: string, active: boolean) => out.push({ d, active });

          if (children.length === 1) {
            const { id, rect: c } = children[0];
            const active = activeIds.has(id);
            const y0 = Math.min(c.cy, pr.cy);
            const y1 = Math.max(c.cy, pr.cy);
            if (y1 - y0 > 1) push(`M ${junctionX} ${y0} L ${junctionX} ${y1}`, active);
            push(`M ${childrenOnLeft ? c.right : c.left} ${c.cy} L ${junctionX} ${c.cy}`, active);
            push(`M ${junctionX} ${pr.cy} L ${parentFaceX} ${pr.cy}`, active);
          } else {
            const sorted = children.slice().sort((a, b) => a.rect.cy - b.rect.cy);
            const anyActive = sorted.some((c) => activeIds.has(c.id));
            push(
              `M ${junctionX} ${sorted[0].rect.cy} L ${junctionX} ${sorted[sorted.length - 1].rect.cy}`,
              anyActive,
            );
            for (const c of sorted) {
              const active = activeIds.has(c.id);
              push(`M ${childrenOnLeft ? c.rect.right : c.rect.left} ${c.rect.cy} L ${junctionX} ${c.rect.cy}`, active);
            }
            push(`M ${junctionX} ${pr.cy} L ${parentFaceX} ${pr.cy}`, anyActive);
          }
        };

        if (leftChildren.length > 0) emit(leftChildren, true);
        if (rightChildren.length > 0) emit(rightChildren, false);
      }
      setSegments(out);
    };

    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", draw);
    };
  }, [matches, winners, losers, grandFinal, gf1, gf2, isDouble, P, k, lbCount, cellH, headerH]);

  // Size the grid explicitly so every row is identical height (this is what
  // makes parent matches sit exactly between their children). Flexible tracks
  // collapse in an auto-height grid, so we measure a card and set the height.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || matches.length === 0) return;
    let raf = 0;
    const measure = () => {
      let cardH = 0;
      el.querySelectorAll<HTMLElement>("[data-match-id]").forEach((n) => {
        const h = n.getBoundingClientRect().height;
        if (h > cardH) cardH = h;
      });
      const label = el.querySelector("p");
      const hh = label ? label.getBoundingClientRect().height : 0;
      const ch = Math.ceil(cardH / 2);
      setCellH((prev) => (prev === ch ? prev : ch));
      setHeaderH((prev) => (prev === Math.ceil(hh) ? prev : Math.ceil(hh)));
    };
    raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [matches, P]);

  if (matches.length === 0) {
    return <p className="text-blue-200 text-sm">Bracket not generated yet.</p>;
  }

  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `repeat(${cols}, minmax(11rem, 1fr))`,
    gridTemplateRows: `auto repeat(${R}, minmax(0, 1fr))`,
    columnGap: "2.5rem",
    height: cellH > 0 ? `${R * cellH + headerH}px` : undefined,
  };

  const labelClass = "text-xs uppercase tracking-wide text-blue-300 text-center pb-2";

  const renderCard = (match: GameMatch, style: React.CSSProperties) => (
    <div key={match.id} style={style} className="min-w-0">
      <MatchCard
        match={match}
        nameById={nameById}
        isOwner={isOwner}
        busy={busy === match.id}
        setWinner={setWinner}
        resetWinner={resetWinner}
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <div className="relative min-w-max" ref={containerRef}>
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            {segments.map((seg, i) => (
              <path
                key={i}
                d={seg.d}
                fill="none"
                stroke={seg.active ? "#67E8F9" : "#1C598C"}
                strokeOpacity={seg.active ? 1 : 0.7}
                strokeWidth={seg.active ? 2 : 1.5}
                strokeLinecap="round"
              />
            ))}
          </svg>

          <div className="grid" style={gridStyle}>
            {/* Winners bracket column headers */}
            {winnerRounds.map((_, idx) => (
              <p
                key={`whead-${idx}`}
                style={{ gridColumn: idx + 1, gridRow: 1 }}
                className={labelClass}
              >
                {idx === winnerRounds.length - 1
                  ? isDouble
                    ? "Winners Final"
                    : "Final"
                  : `Round ${idx + 1}`}
              </p>
            ))}
            {isDouble && (
              <p key="gfhead" style={{ gridColumn: cols, gridRow: 1 }} className={labelClass}>
                Grand Final
              </p>
            )}

            {/* Losers bracket header row (below the winners block) */}
            {isDouble && (
              <p
                key="lbhead"
                style={{ gridColumn: `1 / ${cols + 1}`, gridRow: P + 2 }}
                className={`${labelClass} text-center border-t border-[#1C598C]/40 pt-3`}
              >
                Losers Bracket
              </p>
            )}

            {/* Winners bracket cards */}
            {winners.map((m) => renderCard(m, { ...winnersRowStyle(m.round, m.position), gridColumn: m.round }))}

            {/* Grand final cards */}
            {isDouble && gf1 && renderCard(gf1, { gridColumn: cols, gridRow: `${gf1Rows[0]} / ${gf1Rows[1] + 1}` })}
            {isDouble && gf2 && renderCard(gf2, { gridColumn: cols, gridRow: `${gf2Rows[0]} / ${gf2Rows[1] + 1}` })}

            {/* Losers bracket cards (below the winners, left → right) */}
            {isDouble &&
              losers.map((m) => renderCard(m, { ...losersRowStyle(m.round, m.position, P), gridColumn: m.round }))}
          </div>
        </div>
      </div>

      {champion && (
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded border border-amber-500/50 text-amber-300">
          <span>🏆</span>
          <span className="font-semibold">{champion}</span>
        </div>
      )}

      {isOwner && error && <p className="text-red-400 text-sm" role="alert">{error}</p>}
    </div>
  );
}