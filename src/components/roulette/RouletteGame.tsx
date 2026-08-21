"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { type ShipRow } from "@/lib/db";
import { type CollectionDetail } from "@/lib/types";
import { DISPLAY_TAGS, formatPrice } from "@/lib/display-ship";
import {
  drawShip,
  sortShipsByPopularity,
  rarityForRank,
  RARITY_ORDER,
  RARITY_META,
  type RarityMeta,
} from "@/lib/roulette";
import Button from "@/components/ui/Button";

interface RouletteGameProps {
  collection: CollectionDetail;
}

const CARD_W = 184;
const CARD_H = 188;
const GAP = 14;
const STEP = CARD_W + GAP;
// The rendered window must always cover the full slide distance plus the
// viewport, otherwise the track goes blank mid-roll. Travel is capped at
// MAX_TRAVEL cards, so one window size works for any collection size.
const MAX_TRAVEL = 26;
const WINDOW = MAX_TRAVEL + 8;

const BOOSTED = new Set<RarityMeta["key"]>(["legendary", "epic"]);

type Phase = "idle" | "rolling" | "reveal";

const mod = (a: number, n: number) => ((a % n) + n) % n;

export default function RouletteGame({ collection }: RouletteGameProps) {
  const ships = collection.ships;
  const N = ships.length;

  const trackRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [vw, setVw] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [centerIndex, setCenterIndex] = useState(0);
  const [result, setResult] = useState<{ ship: ShipRow; rarity: RarityMeta } | null>(null);
  // `centerIndex` is the flat index currently centered. `base` is the flat index
  // of the first rendered slot. The visual screen position only depends on
  // (flatIdx - centerIndex), so changing `base` never moves the pixels — it just
  // re-wraps the rendered window, keeping the translateX transform bounded no
  // matter how many times the user rolls.
  const [base, setBase] = useState(-WINDOW);
  // Final resting offset of the center line within the drawn card (px): the bar
  // should not stop dead-center, but randomly somewhere on the ship.
  const [offsetX, setOffsetX] = useState(0);
  const [history, setHistory] = useState<{ ship: ShipRow; rarity: RarityMeta }[]>([]);
  const [shared, setShared] = useState(false);
  // Set when the user skips a roll: the rAF loop jumps straight to landing.
  const skipRef = useRef(false);

  // Per-ship rarity (used for each card's glow border on the track).
  const rarityById = useMemo(() => {
    const sorted = sortShipsByPopularity(ships);
    const map = new Map<number, RarityMeta>();
    sorted.forEach((s, i) => map.set(s.id, RARITY_META[rarityForRank(i, sorted.length)]));
    return map;
  }, [ships]);

  // Measure the track viewport width so cards center correctly.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setVw(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Preload every ship image so the track displays instantly, without popping in.
  useEffect(() => {
    for (const s of ships) {
      const img = new window.Image();
      img.src = s.data;
    }
  }, [ships]);

  // Cancel any in-flight wheel animation on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const rolling = phase === "rolling";

  const readTransformX = (): number => {
    const el = stripRef.current;
    if (!el) return 0;
    const m = getComputedStyle(el).transform.match(/matrix.*,\s*(-?[0-9.]+),/);
    return m ? Number(m[1]) : 0;
  };

  const doRoll = useCallback(() => {
    if (rolling || N === 0) return;
    skipRef.current = false;
    setShared(false);
    const draw = drawShip(ships);
    if (!draw) return;

    const shipIdx = ships.findIndex((s) => s.id === draw.ship.id);
    // Advance forward by whole cycles so we land exactly on `shipIdx`,
    // always several full cycles, bounded so the rendered window covers it.
    const m = mod(centerIndex, N);
    let t = (shipIdx - m + N) % N;
    if (t === 0) t = N;
    while (t < 12) t += N;
    while (t > MAX_TRAVEL) t -= N;
    const target = centerIndex + t;

    // The line resting anywhere within the drawn card (not dead-center).
    const rand = (Math.random() * 2 - 1) * (CARD_W / 2 - 26); // ≈ ±66px
    // Defer offsetX/centerIndex to the reveal so the strip stays put at its
    // current transform during the roll (no jump to the target on the first
    // frame); the rAF drives the motion imperatively instead.
    setResult(draw);
    setPhase("rolling");

    const el = stripRef.current;
    if (!el) return;
    const baseline = vw / 2 - CARD_W / 2 - (target - base) * STEP;
    const startX = readTransformX();
    const targetX = baseline + rand;
    const t0 = performance.now();
    // CS:GO loot-crate profile: ~120ms launch into full speed, ~2.1s of mostly
    // constant high-speed scroll, a long cosine roll-off deceleration that ends
    // slightly past the line, then a small damped wobble settling exactly on
    // targetX. Deceleration duration dithers ±150ms per roll so it never feels
    // robotic, while the landing stays fully deterministic.
    const T1 = 120; // launch to cruise speed
    const T2 = 2300; // deceleration begins
    const dither = Math.random() * 150; // per-roll timing variation
    const T3 = 3200 + dither; // deceleration ends (just past the line)
    const T4 = T3 + 420; // wobble ends, locked on targetX
    const OV = 18; // px it runs past the line before the wobble
    const WOBA = 44; // wobble swing (≈ 0.22 of a card width)
    const WOBF = 1.6; // wobble cycles within the settle window
    const WOBL = 5.2; // wobble decay

    // All motion is leftward (targetX is always more negative than startX):
    // the strip slides so the ships travel right-to-left under the center line.
    const travel = startX - targetX; // total px of travel (> 0)
    const cruise = (travel + OV) / (T1 / 2 + (T2 - T1) + (2 / Math.PI) * (T3 - T2));
    const accelDist = (cruise * T1) / 2;
    const fastEndX = startX - (accelDist + cruise * (T2 - T1));
    const decelEnd = targetX - OV; // runs OV px past the line
    const decelDist = fastEndX - decelEnd;

    const step = (now: number) => {
      if (!stripRef.current) return;
      const tt = skipRef.current ? T4 : now - t0;
      let x: number;
      if (tt <= T1) {
        // launch: sharp ease-in up to cruise speed
        const p = tt / T1;
        x = startX - accelDist * p * p;
      } else if (tt <= T2) {
        // constant high-speed scroll
        x = startX - (accelDist + cruise * (tt - T1));
      } else if (tt <= T3) {
        // cosine roll-off: velocity cruise -> 0 with zero end-jolt
        const p = (tt - T2) / (T3 - T2);
        x = fastEndX - decelDist * Math.sin((Math.PI / 2) * p);
      } else if (tt <= T4) {
        // damped wobble: creeps back onto the line, sways past, settling on it
        const p = (tt - T3) / (T4 - T3);
        x = decelEnd + OV * (1 - p) + WOBA * Math.sin(2 * Math.PI * WOBF * p) * Math.exp(-WOBL * p);
      } else {
        x = targetX;
      }
      stripRef.current.style.transform = `translateX(${x}px)`;
      if (tt >= T4) {
        skipRef.current = false;
        stripRef.current.style.transform = `translateX(${targetX}px)`;
        setOffsetX(rand);
        setCenterIndex(target);
        setBase(target - WINDOW);
        setPhase("reveal");
        setHistory((h) => [draw, ...h].slice(0, 12));
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [rolling, N, ships, vw, centerIndex, base]);

  // Track transform. Motion during a roll is driven imperatively via rAF; the
  // React value is only the resting position (baseline + random card offset).
  const transform = `translateX(${vw / 2 - CARD_W / 2 - (centerIndex - base) * STEP + offsetX}px)`;
  const transitionStyle = "none";

  const revealed = phase === "reveal" && result;
  const boostRarity = revealed && BOOSTED.has(result!.rarity.key) ? result!.rarity : null;

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div
        ref={trackRef}
        className="roulette-track w-full max-w-5xl select-none"
        style={{
          height: CARD_H + 36,
          cursor: rolling ? "wait" : N > 0 ? "pointer" : "default",
        }}
        role="button"
        tabIndex={N === 0 ? -1 : 0}
        aria-disabled={N === 0}
        aria-label={rolling ? "Roulette is rolling" : "Roll the ship roulette"}
        onClick={doRoll}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            doRoll();
          }
        }}
      >
        <div className="roulette-center-line" style={{ left: vw ? `${vw / 2}px` : "50%" }} />

        {/* Aura + ray sweep for legendary/epic reveals */}
        {boostRarity && (
          <>
            <div
              className="rl-aura"
              style={{
                top: "50%",
                left: "50%",
                width: CARD_W + 120,
                height: CARD_W + 120,
                background: boostRarity.aura,
                boxShadow: `0 0 80px 30px ${boostRarity.aura}`,
              }}
            />
            <div className="rl-ray-sweep" />
          </>
        )}

        {/* Confetti for the big drops */}
        {boostRarity &&
          Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="rl-confetti-piece"
              style={{
                left: `${22 + (i * 61) % 56}%`,
                backgroundColor: boostRarity.aura,
                animationDelay: `${-((i * 0.37) % 2.4)}s`,
                opacity: i % 3 === 0 ? 0.5 : 1,
              }}
            />
          ))}

        {/* Sliding strip — virtual-infinite: ships wrap around the loop */}
        <div
          ref={stripRef}
          style={{
            position: "absolute",
            top: 18,
            left: 0,
            height: CARD_H,
            width: "100%",
            transform,
            transition: transitionStyle,
            willChange: "transform",
            zIndex: 2,
          }}
        >
          {N === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              This collection has no ships to roll.
            </div>
          ) : (
            Array.from({ length: WINDOW * 2 + 1 }).map((_, i) => {
              const flatIdx = base + i;
              const ship = ships[mod(flatIdx, N)];
              const meta = rarityById.get(ship.id) ?? RARITY_META.common;
              const isCenter = centerIndex === flatIdx;
              const isRevealCenter = isCenter && revealed;

              return (
                <div
                  key={flatIdx}
                  style={{
                    position: "absolute",
                    left: i * STEP,
                    top: 0,
                    width: CARD_W,
                    height: CARD_H,
                  }}
                >
                  <div
                    className={`h-full rounded-xl overflow-hidden bg-[#0a1e33] flex items-center justify-center ${isRevealCenter ? "rl-pop" : ""} ${
                      isRevealCenter ? `border-[3px] ${meta.ring} scale-[1.04]` : `border-2 ${meta.ring}`
                    }`}
                    style={isRevealCenter ? { boxShadow: meta.glow } : { boxShadow: `0 0 10px ${meta.aura}40` }}
                  >
                    <Image
                      src={ship.data}
                      alt={ship.ship_name}
                      width={CARD_W}
                      height={CARD_H}
                      unoptimized
                      draggable={false}
                      className="object-contain h-full w-full p-1 pointer-events-none"
                    />
                  </div>

                  {isRevealCenter && (
                    <div className={`rl-banner absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-0.5 rounded-full border text-[10px] font-bold tracking-[0.25em] ${meta.text} ${meta.ring} bg-[#021526]`}>
                      ★ {meta.label} ★
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Center roll control */}
        {phase !== "reveal" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ zIndex: 7 }}
          >
            <div
              className={`px-6 py-2 rounded-full border font-bold tracking-[0.25em] text-sm ${
                rolling
                  ? "text-cyan-200 border-cyan-700/50 bg-[#021526]/80"
                  : "text-amber-300 border-amber-500/50 bg-[#021526]/90 shadow-[0_0_26px_rgba(251,191,36,0.25)]"
              }`}
            >
              {rolling ? "ROLLING…" : "🎰 ROLL"}
            </div>
            {rolling ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  skipRef.current = true;
                }}
                className="mt-2 pointer-events-auto px-3 py-1 rounded-full border border-[#1C598C] bg-[#021526]/90 text-blue-200 text-xs hover:text-cyan-300 hover:border-cyan-400 transition-colors"
              >
                Skip
              </button>
            ) : (
              <div className="mt-2 text-[11px] text-amber-200/60">or click anywhere on the table</div>
            )}
          </div>
        )}
      </div>

      {/* Result announcement for screen readers */}
      <p role="status" aria-live="polite" className="sr-only">
        {revealed && result ? `Rolled ${result.ship.ship_name}, ${result.rarity.label} rarity.` : ""}
      </p>

      {/* Drop odds legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center text-[10px] text-slate-400">
        {RARITY_ORDER.map((r) => {
          const m = RARITY_META[r];
          return (
            <span key={r} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: m.aura, boxShadow: `0 0 6px ${m.aura}` }} />
              <span className={m.text}>{m.label}</span>
              <span className="text-slate-500">{Math.round((100 * m.weight) / 97)}%</span>
            </span>
          );
        })}
      </div>

      {/* Reveal: Roll again above a ShipCard-style result */}
      {revealed && result && (
        <div className="w-full max-w-5xl flex flex-col items-center gap-4 rl-pop">
          <div className="flex gap-3">
            <Button onClick={doRoll} disabled={rolling}>
              {rolling ? "Rolling…" : "Roll again"}
            </Button>
            <Link href={`/ship/${result.ship.id}`}>
              <Button variant="secondary">View ship</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={async () => {
                const url = `${window.location.origin}/ship/${result.ship.id}`;
                const text = `I rolled ${result.ship.ship_name} (${result.rarity.label}) on CosmoShip`;
                try {
                  if (navigator.share) {
                    await navigator.share({ title: text, text, url });
                  } else {
                    await navigator.clipboard.writeText(`${text} ${url}`);
                  }
                  setShared(true);
                  setTimeout(() => setShared(false), 2000);
                } catch {}
              }}
            >
              {shared ? "Copied!" : "Share"}
            </Button>
          </div>

          <ResultShipCard ship={result.ship} rarity={result.rarity} />
        </div>
      )}

      {/* Draw history */}
      {history.length > 0 && (
        <div className="w-full max-w-5xl">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Recent rolls</p>
          <div className="flex flex-wrap gap-1.5">
            {history.map((h, i) => {
              const m = h.rarity;
              return (
                <Link
                  key={`${h.ship.id}-${i}`}
                  href={`/ship/${h.ship.id}`}
                  title={h.ship.ship_name}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border bg-[#021526]/70 text-[11px] ${m.text} ${m.ring} hover:bg-[#0a1e33] transition-colors`}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.aura }} />
                  <span className="text-blue-100 max-w-[140px] truncate">{h.ship.ship_name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultShipCard({ ship, rarity }: { ship: ShipRow; rarity: RarityMeta }) {
  const tags = (ship.tags ?? []).filter((t) => DISPLAY_TAGS.includes(t)).slice(0, 4);

  return (
    <div
      className={`w-64 rounded-xl border bg-[#021526]/80 overflow-hidden ${rarity.ring}`}
      style={{ boxShadow: rarity.glow }}
    >
      <div className="relative overflow-hidden">
        <Link href={`/ship/${ship.id}`} className="block">
          <Image
            src={ship.data}
            alt={ship.ship_name}
            width={400}
            height={400}
            unoptimized
            className="block w-full aspect-square object-contain bg-[#0a1e33]/50 hover:scale-[1.02] transition-transform duration-300"
          />
        </Link>
        <div className="pointer-events-none absolute bottom-2 left-2 bg-[#021526]/80 backdrop-blur-sm border border-[#1C598C]/50 rounded-lg px-2 py-1">
          <span className="text-[#0AD448] text-xs font-semibold">{formatPrice(ship.price)}&#x20a2;</span>
        </div>
      </div>

      <div className="px-3 py-2.5 border-t border-[#1C598C]/30">
        <Link href={`/ship/${ship.id}`} className="block" aria-label={`${ship.ship_name} — view details`}>
          <h3 className="text-white text-sm font-medium truncate hover:text-cyan-300 transition-colors">
            {ship.ship_name}
          </h3>
        </Link>
        <p className="text-gray-500 text-xs mt-0.5 truncate">
          by{" "}
          <Link href={`/?author=${encodeURIComponent(ship.author ?? "")}`} className="text-blue-300 hover:text-cyan-300 transition-colors">
            {ship.author || "Unknown"}
          </Link>{" "}
          &middot; {ship.crew} crew
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-block bg-[#0a1e33] text-blue-300/80 text-[10px] px-1.5 py-0.5 rounded border border-[#1C598C]/30"
              >
                {tag}
              </span>
            ))}
            {(ship.tags?.length ?? 0) > 4 && (
              <span className="text-[10px] text-gray-500 py-0.5">+{(ship.tags?.length ?? 0) - 4}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}