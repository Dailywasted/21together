import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { bustProbability, type PublicSnapshot, type RoundResult } from "@21/engine";
import { Chip } from "../components/Chip";
import { Avatar } from "../components/ui";
import { useT } from "../lib/i18n";
import { onRoomEvent } from "../lib/store";
import { sfx } from "../lib/sound";

/** Shared big-screen geometry. */
export const ARENA = { TOP_H: 84, STRIP_H: 236, TILE_H: 196, GAP: 12 };

export interface Lag {
  shared: number;
  dealer: number;
  pending: boolean;
}

export function stripGeometry(width: number, seats: number) {
  const tileW = Math.min(176, (width - 80 - (seats - 1) * ARENA.GAP) / seats);
  const total = seats * tileW + (seats - 1) * ARENA.GAP;
  const left = (width - total) / 2;
  const cy = 1080 - 20 - ARENA.TILE_H / 2;
  return { tileW, center: (seat: number) => ({ x: left + seat * (tileW + ARENA.GAP) + tileW / 2, y: cy }) };
}

const isWin = (o: string | null | undefined) => o === "win" || o === "blackjack";

/** Payout timing shared with the celebration overlay. */
export const overlayMs = (results: RoundResult[]) =>
  results.some((r) => isWin(r.outcome)) ? 5400 : 3200;

// ───────────────────────── marquee lights ─────────────────────────

export type Mood = "idle" | "tense" | "win" | "lose";

export function useMood(snap: PublicSnapshot): Mood {
  if (snap.phase === "payout") {
    const inHand = snap.players.filter((p) => p.hand?.outcome);
    return inHand.some((p) => isWin(p.hand!.outcome)) ? "win" : "lose";
  }
  if (snap.phase === "deciding" || snap.phase === "drawing" || snap.phase === "dealer" || snap.phase === "dealing") return "tense";
  return "idle";
}

const MOOD = {
  idle: { a: "#f5c451", b: "#7a5a12", speed: 2.4, glow: 0.55 },
  tense: { a: "#ffffff", b: "#3b4a55", speed: 0.9, glow: 0.6 },
  win: { a: "#ffe08a", b: "#34d399", speed: 0.32, glow: 1 },
  lose: { a: "#fb7185", b: "#4a1620", speed: 1.8, glow: 0.5 },
} as const;

/** Chasing bulb lights around the screen, like a casino sign. Speed and colour follow the game. */
export function Marquee({ width, mood }: { width: number; mood: Mood }) {
  const m = MOOD[mood];
  const inset = 13;
  const w = width - inset * 2;
  const h = 1080 - inset * 2;
  const rect = { x: inset, y: inset, width: w, height: h, rx: 26 };
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={1080} style={{ transition: "filter .6s" }}>
      <rect {...rect} fill="none" stroke={m.b} strokeOpacity={0.55} strokeWidth={6} strokeLinecap="round" strokeDasharray="0 22" style={{ transition: "stroke .6s" }} />
      <rect
        {...rect}
        fill="none"
        stroke={m.a}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray="0 22 0 22 0 66"
        className="marquee-chase"
        style={{
          animationDuration: `${m.speed}s`,
          filter: `drop-shadow(0 0 ${4 + m.glow * 6}px ${m.a})`,
          transition: "stroke .6s",
        }}
      />
    </svg>
  );
}

// ───────────────────────── gold dust ─────────────────────────

export function GoldDust() {
  const motes = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: 20 + Math.random() * 80,
        size: 2 + Math.random() * 5,
        dur: 9 + Math.random() * 12,
        delay: -Math.random() * 20,
        blur: Math.random() * 2.5,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {motes.map((d) => (
        <span
          key={d.id}
          className="dust"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.dur}s`,
            animationDelay: `${d.delay}s`,
            filter: `blur(${d.blur}px)`,
          }}
        />
      ))}
    </div>
  );
}

// ───────────────────────── tension glow ─────────────────────────

/** Red pulse on the screen edges when hitting is risky. */
export function TensionGlow({ snap, lag }: { snap: PublicSnapshot; lag: Lag }) {
  const active = snap.players.some((p) => p.hand?.status === "active");
  const risk = snap.phase === "deciding" && active ? bustProbability(snap.shared.slice(0, lag.shared)) : 0;
  return (
    <AnimatePresence>
      {risk >= 0.5 && !snap.paused && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[4]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.35, 0.9, 0.35] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          style={{ boxShadow: `inset 0 0 ${120 + risk * 140}px rgba(251,113,133,${0.25 + risk * 0.3})` }}
        />
      )}
    </AnimatePresence>
  );
}

// ───────────────────────── chips flying ─────────────────────────

interface Flight {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  value: number;
  delay: number;
  win: boolean;
}

/** After the celebration: losing stakes fly to the dealer, winnings fly out to the winners' seats. */
export function ChipFlights({ snap, width }: { snap: PublicSnapshot; width: number }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.k !== "payout") return;
        const s = snapRef.current;
        const geo = stripGeometry(width, s.seats.length);
        const dealer = { x: width / 2, y: ARENA.TOP_H + 120 };
        const out: Flight[] = [];
        let lose = 0;
        let win = 0;
        for (const r of e.results) {
          const seat = s.players.find((p) => p.id === r.playerId)?.seat;
          if (seat === null || seat === undefined) continue;
          const tile = geo.center(seat);
          if (r.outcome === "lose") {
            const n = Math.min(4, 1 + Math.floor(r.bet / 100));
            for (let i = 0; i < n; i++)
              out.push({ id: `${r.playerId}-l${i}`, from: tile, to: dealer, value: r.bet >= 100 ? 100 : 25, delay: lose * 0.05 + i * 0.06, win: false });
            lose++;
          } else if (isWin(r.outcome)) {
            const n = Math.min(7, 2 + Math.floor(r.net / 60));
            for (let i = 0; i < n; i++)
              out.push({
                id: `${r.playerId}-w${i}`,
                from: dealer,
                to: tile,
                value: r.outcome === "blackjack" ? 500 : r.net >= 200 ? 100 : 25,
                delay: 0.7 + win * 0.12 + i * 0.07,
                win: true,
              });
            win++;
          }
        }
        if (!out.length) return;
        const wait = overlayMs(e.results) - 200;
        setTimeout(() => {
          setFlights(out);
          out.forEach((f, i) => i % 2 === 0 && sfx.chip(f.delay + 0.75));
          setTimeout(() => setFlights([]), 3600);
        }, wait);
      }),
    [width],
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-[35]">
      {flights.map((f) => {
        const midX = (f.from.x + f.to.x) / 2 + (f.win ? -60 : 60);
        const midY = Math.min(f.from.y, f.to.y) - 160;
        return (
          <motion.div
            key={f.id}
            className="absolute"
            style={{ left: -22, top: -22, filter: "drop-shadow(0 8px 10px rgba(0,0,0,.55))" }}
            initial={{ x: f.from.x, y: f.from.y, opacity: 0, scale: 0.6, rotate: 0 }}
            animate={{
              x: [f.from.x, midX, f.to.x],
              y: [f.from.y, midY, f.to.y],
              opacity: [0, 1, 1, 0],
              scale: [0.6, 1.15, 0.8],
              rotate: [0, 200, 360],
            }}
            transition={{ duration: 0.85, delay: f.delay, ease: "easeInOut", times: [0, 0.5, 1] }}
          >
            <Chip value={f.value} size={44} />
          </motion.div>
        );
      })}
    </div>
  );
}

// ───────────────────────── new leader ─────────────────────────

/** "New leader" moment when the chip leader changes. */
export function LeaderWatch({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const [shown, setShown] = useState<{ id: number; name: string; avatar: string; playerId: string } | null>(null);
  const leader = snap.leaderboard[0];
  const prev = useRef<string | null>(leader?.id ?? null);
  useEffect(() => {
    const id = leader && leader.net > 0 ? leader.id : null;
    if (!id || id === prev.current || snap.roundNo === 0) {
      if (id) prev.current = id;
      return;
    }
    prev.current = id;
    const info = { id: Date.now(), name: leader!.name, avatar: leader!.avatar, playerId: leader!.id };
    const timer = setTimeout(() => {
      setShown(info);
      sfx.achievement();
      setTimeout(() => setShown((x) => (x?.id === info.id ? null : x)), 3200);
    }, 7000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leader?.id, leader?.net]);
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          key={shown.id}
          className="pointer-events-none absolute left-1/2 z-[45] -translate-x-1/2"
          style={{ top: ARENA.TOP_H + 8 }}
          initial={{ y: -80, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <div className="light-sweep relative flex items-center gap-5 overflow-hidden rounded-full py-3 pl-3 pr-10 ring-2 ring-gold shadow-[0_0_80px_-10px_rgba(245,196,81,.8)]" style={{ background: "linear-gradient(180deg, #2a2108, #120e04)" }}>
            <Avatar emoji={shown.avatar} seed={shown.playerId} size={84} ring="#f5c451" />
            <div className="flex flex-col">
              <span className="text-sm font-extrabold tracking-[0.35em] text-gold uppercase">👑 {t("newLeader")}</span>
              <span className="font-display text-5xl font-bold leading-tight">{shown.name}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
