import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import type { BonusState, PublicSnapshot, Runner } from "@21/engine";
import { Avatar, CountdownRing, useNow } from "../components/ui";
import { fmt, useLang, useT } from "../lib/i18n";
import { onRoomEvent, timeLeft } from "../lib/store";
import { sfx } from "../lib/sound";
import { LANE_COLORS, RACE_ANIM_MS, isFavourite, oddsLabel, positionsAt, raceElapsed, runnerName, standings } from "../lib/race";
import { useStageWidth } from "./Stage";
import { Marquee } from "./ArenaFx";

/** Full-screen Reindeer Race bonus on the TV. */
export function RaceScreen({ snap, offset }: { snap: PublicSnapshot; offset: number }) {
  const b = snap.bonus!;
  const W = useStageWidth();
  useRaceSounds(snap, offset);
  return (
    <div className="absolute inset-0 overflow-hidden">
      <WinterBackdrop width={W} racing={b.stage === "racing"} />
      <Marquee width={W} mood={b.stage === "racing" ? "tense" : "win"} />
      <Header b={b} />
      <AnimatePresence mode="wait">
        {b.stage === "intro" && <Intro key="intro" b={b} />}
        {b.stage === "picking" && <Picking key="picking" snap={snap} offset={offset} />}
        {(b.stage === "racing" || b.stage === "results") && <Track key="track" snap={snap} offset={offset} width={W} />}
      </AnimatePresence>
      {b.stage === "results" && <Results snap={snap} />}
    </div>
  );
}

// ───────────────────────── scenery ─────────────────────────

function WinterBackdrop({ width, racing }: { width: number; racing: boolean }) {
  const flakes = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 2 + Math.random() * 5,
        dur: 7 + Math.random() * 9,
        delay: -Math.random() * 16,
        drift: Math.random() * 60 - 30,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #050b18 0%, #0a1a33 38%, #12304f 70%, #1b3d5e 100%)" }} />
      {/* aurora */}
      <div
        className="aurora absolute left-0 right-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(ellipse 60% 70% at 30% 10%, rgba(52,211,153,.18), transparent 70%), radial-gradient(ellipse 50% 60% at 75% 0%, rgba(124,92,255,.16), transparent 70%)" }}
      />
      {/* mountains */}
      <svg className="absolute left-0 top-[120px]" width={width} height={200} viewBox={`0 0 ${width} 200`} preserveAspectRatio="none">
        <path
          d={`M0 200 L0 120 L${width * 0.08} 60 L${width * 0.16} 110 L${width * 0.27} 30 L${width * 0.38} 100 L${width * 0.5} 50 L${width * 0.62} 115 L${width * 0.74} 40 L${width * 0.86} 105 L${width} 70 L${width} 200 Z`}
          fill="#0c2340"
          opacity={0.9}
        />
        <path
          d={`M${width * 0.27} 30 L${width * 0.31} 55 L${width * 0.24} 50 Z M${width * 0.74} 40 L${width * 0.78} 64 L${width * 0.71} 60 Z M${width * 0.5} 50 L${width * 0.535} 72 L${width * 0.47} 70 Z`}
          fill="#dbe8f5"
          opacity={0.7}
        />
      </svg>
      {/* falling snow */}
      <div className="absolute inset-0 overflow-hidden">
        {flakes.map((f) => (
          <span
            key={f.id}
            className="snowflake"
            style={{
              left: `${f.left}%`,
              width: f.size,
              height: f.size,
              animationDuration: `${racing ? f.dur * 0.6 : f.dur}s`,
              animationDelay: `${f.delay}s`,
              ["--drift" as string]: `${f.drift}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Header({ b }: { b: BonusState }) {
  const t = useT();
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-12" style={{ height: 92 }}>
      <div className="flex items-center gap-3">
        <span className="text-5xl">🦌</span>
        <div className="flex flex-col leading-none">
          <span className="text-xs font-extrabold tracking-[0.4em] text-gold uppercase">{t("bonusRound")}</span>
          <span className="font-display text-[40px] font-bold">{t("reindeerRace")}</span>
        </div>
      </div>
      {b.hero && (
        <div className="flex items-center gap-3 rounded-full bg-black/40 py-1.5 pl-1.5 pr-5 ring-1 ring-gold/50">
          <Avatar emoji={b.hero.avatar} seed={b.hero.playerId} size={48} ring="#f5c451" />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] font-bold tracking-[0.2em] text-white/55 uppercase">{t("unlockedBy", { name: "" }).trim()}</span>
            <span className="text-xl font-bold">
              {b.hero.name} <span className="ml-1 rounded-md bg-gold px-1.5 text-base text-ink">×2</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── intro ─────────────────────────

function Intro({ b }: { b: BonusState }) {
  const t = useT();
  return (
    <motion.div
      className="absolute inset-0 z-20 grid place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.4 } }}
    >
      <div className="sunburst absolute left-1/2 top-1/2 h-[1800px] w-[1800px] -translate-x-1/2 -translate-y-1/2" />
      <div className="relative flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0.2, rotate: -8, opacity: 0 }}
          animate={{ scale: [0.2, 1.15, 1], rotate: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="light-sweep relative overflow-hidden px-8 font-display text-[170px] font-bold uppercase leading-none gold-text drop-shadow-[0_16px_70px_rgba(245,196,81,.6)]"
        >
          {t("bonusRound")}
        </motion.div>
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-4 flex items-center gap-5 font-display text-[84px] font-bold"
        >
          <motion.span animate={{ y: [0, -14, 0] }} transition={{ duration: 0.45, repeat: Infinity }} style={{ display: "inline-block", scaleX: -1 }}>
            🦌
          </motion.span>
          {t("reindeerRace")}
        </motion.div>
        {b.hero && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.2, type: "spring", stiffness: 260, damping: 16 }}
            className="mt-10 flex items-center gap-5 rounded-full bg-black/50 py-3 pl-3 pr-10 ring-2 ring-gold"
          >
            <Avatar emoji={b.hero.avatar} seed={b.hero.playerId} size={96} ring="#f5c451" />
            <div className="flex flex-col text-left">
              <span className="text-lg font-bold tracking-[0.25em] text-gold uppercase">🔥 {t("unlockedBy", { name: b.hero.name })}</span>
              <span className="text-2xl font-semibold text-white/80">{t("prizeDoubled")}</span>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ───────────────────────── picking ─────────────────────────

function Picking({ snap, offset }: { snap: PublicSnapshot; offset: number }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  useNow(150);
  const b = snap.bonus!;
  const seated = snap.players.filter((p) => p.seat !== null);
  const pickedN = seated.filter((p) => b.picks[p.id] !== undefined).length;
  const left = timeLeft(snap, offset);
  const timed = snap.deadline !== null && !snap.paused;
  return (
    <motion.div
      className="absolute inset-0 z-10"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30, transition: { duration: 0.3 } }}
    >
      <div className="absolute inset-x-0 flex items-center justify-center gap-10" style={{ top: 120 }}>
        <div className="text-center">
          <div className="font-display text-[64px] font-bold leading-none">{t("pickOnPhone")}</div>
          <div className="mt-3 text-2xl font-semibold text-white/55">{t("freePick")} 🎁</div>
        </div>
        {timed ? (
          <CountdownRing remaining={left} total={snap.phaseMs} size={130} stroke={10}>
            <span className="text-5xl">{Math.ceil(left / 1000)}</span>
          </CountdownRing>
        ) : (
          <CountdownRing remaining={pickedN} total={Math.max(1, seated.length)} size={130} stroke={10} progress>
            <span className="text-4xl">
              {pickedN}
              <span className="text-white/35">/{seated.length}</span>
            </span>
          </CountdownRing>
        )}
      </div>
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 330 }}>
        <div className="grid grid-cols-3 gap-6" style={{ width: 1560 }}>
          {b.runners.map((r, i) => {
            const pickers = snap.players.filter((p) => b.picks[p.id] === r.id);
            const color = LANE_COLORS[r.id]!;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 40, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 240, damping: 20 }}
                className="relative overflow-hidden rounded-[28px] bg-[#0b1a2e]/85 ring-2"
                style={{ height: 300, ["--tw-ring-color" as string]: `${color}aa`, boxShadow: `0 20px 50px -20px ${color}88` }}
              >
                <div className="flex items-center gap-3 px-5 py-3" style={{ background: `linear-gradient(90deg, ${color}, ${color}55)` }}>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white font-display text-2xl font-bold" style={{ color }}>
                    {r.id + 1}
                  </span>
                  <span className="font-display text-[34px] font-bold">{runnerName(r, lang)}</span>
                  {isFavourite(b.runners, r) && (
                    <span className="ml-auto rounded-full bg-black/35 px-3 py-1 text-sm font-extrabold tracking-wider uppercase">⭐ {t("favourite")}</span>
                  )}
                </div>
                <div className="flex items-center gap-6 px-6 pt-3">
                  <motion.span
                    className="text-[96px] leading-none"
                    style={{ display: "inline-block", scaleX: -1 }}
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 0.9 + i * 0.07, repeat: Infinity }}
                  >
                    🦌
                  </motion.span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold tracking-[0.25em] text-white/45 uppercase">{t("odds")} {oddsLabel(r.chance)}</span>
                    <span className="tabular font-display text-[56px] font-bold leading-none text-gold">+{fmt(r.prize, lang)}</span>
                  </div>
                </div>
                <div className="absolute inset-x-5 bottom-4 flex h-11 items-center">
                  <AnimatePresence>
                    {pickers.slice(0, 7).map((p, k) => (
                      <motion.div
                        key={p.id}
                        initial={{ scale: 0, y: 10 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ type: "spring", stiffness: 500, damping: 18 }}
                        style={{ marginLeft: k === 0 ? 0 : -10 }}
                      >
                        <Avatar emoji={p.avatar} seed={p.id} size={42} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {pickers.length > 7 && <span className="ml-2 font-bold text-white/70">+{pickers.length - 7}</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

// ───────────────────────── the race ─────────────────────────

function useFrame(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      setTick((x) => (x + 1) % 1e6);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active]);
}

const LANE_TOP = 300;
const LANE_H = 112;
const LANE_GAP = 10;
const LABEL_W = 330;

function placeLabel(t: ReturnType<typeof useT>, n: number) {
  return n === 1 ? t("place_1") : n === 2 ? t("place_2") : n === 3 ? t("place_3") : t("place_n", { n });
}

function Track({ snap, offset, width }: { snap: PublicSnapshot; offset: number; width: number }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const b = snap.bonus!;
  const script = b.script!;
  const racing = b.stage === "racing";
  useFrame(racing);
  const elapsed = racing ? (raceElapsed(snap, offset) ?? 0) : RACE_ANIM_MS;
  const pos = positionsAt(script, elapsed);
  const order = standings(script, pos);
  const frames = script.progress[0]!.length - 1;
  const frameNow = (elapsed / RACE_ANIM_MS) * frames;
  const startX = 80 + LABEL_W;
  const finishX = width - 150;
  const runW = 120;
  const line = commentary(t, lang, b, script, elapsed);

  return (
    <motion.div className="absolute inset-0 z-10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* commentary */}
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 112 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={line}
            initial={{ opacity: 0, y: 14, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="whitespace-nowrap rounded-full bg-black/45 px-10 py-3 font-display text-[52px] font-bold leading-none ring-1 ring-white/10"
          >
            {line || " "}
          </motion.div>
        </AnimatePresence>
      </div>
      {/* standings strip */}
      <div className="absolute inset-x-0 flex justify-center gap-3" style={{ top: 214 }}>
        {order.map((id, i) => {
          const r = b.runners[id]!;
          return (
            <motion.div
              layout
              key={id}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-4 ${i === 0 ? "bg-gold text-ink" : "bg-black/45 text-white"}`}
            >
              <span className="grid h-8 w-8 place-items-center rounded-full font-display text-base font-bold text-white" style={{ background: LANE_COLORS[id] }}>
                {id + 1}
              </span>
              <span className="text-lg font-extrabold">{placeLabel(t, i + 1)}</span>
              <span className="text-lg font-semibold opacity-80">{runnerName(r, lang)}</span>
            </motion.div>
          );
        })}
      </div>

      {/* lanes */}
      {b.runners.map((r, lane) => {
        const top = LANE_TOP + lane * (LANE_H + LANE_GAP);
        const color = LANE_COLORS[r.id]!;
        const p = pos[r.id]!;
        const x = startX + p * (finishX - startX) - runW * 0.75;
        const leader = order[0] === r.id;
        const ev = script.events.find((e) => e.runner === r.id && frameNow >= e.frame && frameNow < e.frame + 3);
        const pickers = snap.players.filter((pl) => b.picks[pl.id] === r.id);
        const bob = racing && p < 1 ? Math.sin(elapsed / (95 + lane * 7)) * 9 : 0;
        const place = order.indexOf(r.id) + 1;
        return (
          <div key={r.id}>
            {/* lane strip */}
            <div
              className="absolute overflow-hidden rounded-2xl"
              style={{
                left: 80,
                right: 80,
                top,
                height: LANE_H,
                background: `linear-gradient(90deg, ${color}38, rgba(220,235,250,.07) 26%, rgba(220,235,250,.11))`,
                boxShadow: `inset 0 0 0 1px ${color}40`,
              }}
            >
              {racing && <div className="track-run absolute inset-0" />}
            </div>
            {/* label */}
            <div className="absolute flex items-center gap-3" style={{ left: 96, top: top + 14, width: LABEL_W - 30 }}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full font-display text-2xl font-bold" style={{ background: color }}>
                {r.id + 1}
              </span>
              <div className="min-w-0">
                <div className="truncate font-display text-[26px] font-bold leading-tight">{runnerName(r, lang)}</div>
                <div className="flex h-8 items-center">
                  {pickers.slice(0, 5).map((pl, k) => (
                    <div key={pl.id} style={{ marginLeft: k === 0 ? 0 : -8 }}>
                      <Avatar emoji={pl.avatar} seed={pl.id} size={30} />
                    </div>
                  ))}
                  {pickers.length > 5 && <span className="ml-1 text-sm font-bold text-white/70">+{pickers.length - 5}</span>}
                  {pickers.length === 0 && <span className="text-sm font-semibold text-white/30">+{fmt(r.prize, lang)}</span>}
                </div>
              </div>
            </div>
            {/* runner */}
            <div className="absolute" style={{ left: x, top: top + LANE_H / 2 - 52 + bob, width: runW }}>
              {ev?.kind === "boost" && <span className="absolute -left-14 top-6 text-5xl">🔥</span>}
              {ev?.kind === "slip" && <span className="absolute left-6 -top-8 text-4xl">💫</span>}
              <div
                className="relative text-[88px] leading-none"
                style={{
                  transform: `scaleX(-1) rotate(${ev?.kind === "slip" ? 18 : 0}deg)`,
                  filter: leader ? `drop-shadow(0 0 18px ${color}) drop-shadow(0 0 30px rgba(245,196,81,.7))` : `drop-shadow(0 8px 10px rgba(0,0,0,.5))`,
                }}
              >
                🦌
              </div>
              <span
                className="absolute -top-2 left-[62px] grid h-9 w-9 place-items-center rounded-full font-display text-lg font-bold ring-2 ring-white"
                style={{ background: color }}
              >
                {r.id + 1}
              </span>
              {p >= 1 && (
                <span className={`absolute -right-24 top-6 rounded-full px-3 py-1 font-display text-xl font-bold ${place === 1 ? "bg-gold text-ink" : "bg-black/60 text-white"}`}>
                  {placeLabel(t, place)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* start + finish lines */}
      <div className="absolute w-1 bg-white/25" style={{ left: startX, top: LANE_TOP - 10, height: 6 * (LANE_H + LANE_GAP) + 10 }} />
      <div
        className="absolute"
        style={{
          left: finishX - 6,
          top: LANE_TOP - 16,
          width: 22,
          height: 6 * (LANE_H + LANE_GAP) + 22,
          backgroundImage: "repeating-conic-gradient(#fff 0 25%, #111 0 50%)",
          backgroundSize: "22px 22px",
          boxShadow: "0 0 30px rgba(255,255,255,.35)",
        }}
      />
      <div className="absolute font-display text-lg font-bold tracking-[0.3em] text-white/70" style={{ left: finishX - 70, top: LANE_TOP - 50 }}>
        FINISH
      </div>
    </motion.div>
  );
}

function commentary(t: ReturnType<typeof useT>, lang: "en" | "fr", b: BonusState, script: NonNullable<BonusState["script"]>, e: number): string {
  if (b.stage === "results") {
    return t("wins", { name: runnerName(b.runners[script.order[0]!]!, lang) });
  }
  const name = (id: number) => runnerName(b.runners[id]!, lang);
  const frames = script.progress[0]!.length - 1;
  const winner = script.order[0]!;
  const winFrame = script.progress[winner]!.findIndex((v) => v >= 1);
  const winMs = (winFrame / frames) * RACE_ANIM_MS;
  if (e >= winMs) return t("wins", { name: name(winner) });
  const pos = positionsAt(script, e);
  const sorted = [...pos].sort((a, b2) => b2 - a);
  if (e > RACE_ANIM_MS * 0.6 && sorted[0]! - sorted[1]! < 0.025) return t("photoFinish");
  // Recent boost / slip.
  const f = (e / RACE_ANIM_MS) * frames;
  const ev = [...script.events].reverse().find((x) => f >= x.frame && f < x.frame + 4);
  if (ev) return t(ev.kind === "boost" ? "boost" : "slip", { name: name(ev.runner) });
  if (e > RACE_ANIM_MS * 0.58) return t("finalStretch");
  // Lead change in the last ~1.6 s.
  if (e > 2500) {
    const leaderAt = (ms: number) => {
      const p = positionsAt(script, ms);
      return p.indexOf(Math.max(...p));
    };
    for (let ms = e; ms > e - 1600; ms -= 200) {
      const a = leaderAt(ms);
      if (a !== leaderAt(ms - 200)) return t("takesTheLead", { name: name(leaderAt(e)) });
    }
  }
  if (e < 2600) return t("theyreOff");
  return "";
}

// ───────────────────────── results ─────────────────────────

function Results({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const b = snap.bonus!;
  const winnerId = b.script!.order[0]!;
  const r: Runner = b.runners[winnerId]!;
  const color = LANE_COLORS[winnerId]!;
  const winners = b.winners ?? [];
  return (
    <motion.div
      className="absolute inset-0 z-30 grid place-items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
    >
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 45%, ${color}55, rgba(4,8,16,.9) 62%)` }} />
      <div className="sunburst absolute left-1/2 top-1/2 h-[1700px] w-[1700px] -translate-x-1/2 -translate-y-1/2" />
      <div className="relative flex flex-col items-center text-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.4 }}
          className="relative text-[190px] leading-none"
          style={{ scaleX: -1, filter: `drop-shadow(0 0 40px ${color})` }}
        >
          🦌
        </motion.div>
        <div className="mt-2 flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full font-display text-3xl font-bold" style={{ background: color }}>
            {r.id + 1}
          </span>
          <span className="font-display text-[110px] font-bold leading-none gold-text">{t("wins", { name: runnerName(r, lang) })}</span>
        </div>
        {winners.length > 0 ? (
          <div className="mt-10 flex flex-wrap justify-center gap-6" style={{ maxWidth: 1500 }}>
            {winners.slice(0, 10).map((w, i) => (
              <motion.div
                key={w.playerId}
                initial={{ scale: 0, y: 40, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ delay: 0.9 + i * 0.14, type: "spring", stiffness: 380, damping: 16 }}
                className="flex flex-col items-center"
              >
                <Avatar emoji={w.avatar} seed={w.playerId} size={96} ring={w.hero ? "#f5c451" : "#34d399"} />
                <span className="mt-2 max-w-[160px] truncate text-xl font-bold">{w.name}</span>
                <span className="tabular font-display text-3xl font-bold text-win">
                  +{fmt(w.prize, lang)} {w.hero && <span className="rounded-md bg-gold px-1.5 text-lg text-ink">×2</span>}
                </span>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="mt-10 font-display text-5xl font-bold text-white/70">{t("nobodyPicked", { name: runnerName(r, lang) })}</div>
        )}
      </div>
    </motion.div>
  );
}

// ───────────────────────── teaser during payout ─────────────────────────

/** "Bonus unlocked!" ribbon shown during the blackjack payout before the race starts. */
export function BonusTeaser({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const pending = snap.phase === "payout" ? snap.bonusPending : null;
  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 z-[46] flex justify-center"
          style={{ bottom: 250 }}
          initial={{ y: 60, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 260, damping: 18 }}
        >
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
            className="light-sweep relative flex items-center gap-5 overflow-hidden rounded-full py-3 pl-4 pr-10 ring-2 ring-gold shadow-[0_0_90px_-10px_rgba(245,196,81,.9)]"
            style={{ background: "linear-gradient(180deg, #2a2108, #120e04)" }}
          >
            <span className="text-6xl">🦌</span>
            <div className="flex flex-col">
              <span className="font-display text-5xl font-bold leading-tight gold-text">{t("bonusUnlocked")}</span>
              <span className="text-xl font-semibold text-white/75">
                {t("bonusNext")}
                {pending.hero ? ` · 🔥 ${pending.hero.name} ×2` : ""}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────────────────────── sounds ─────────────────────────

function useRaceSounds(snap: PublicSnapshot, offset: number) {
  const snapRef = useRef(snap);
  snapRef.current = snap;
  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.k === "bonus" && e.stage === "intro") {
          sfx.fanfare(0.1);
          sfx.cheer(0.7, 0.3);
          const colors = ["#f5c451", "#ffe08a", "#ffffff", "#34d399", "#7c5cff"];
          void confetti({ particleCount: 160, angle: 60, spread: 70, startVelocity: 70, origin: { x: 0, y: 0.95 }, colors });
          void confetti({ particleCount: 160, angle: 120, spread: 70, startVelocity: 70, origin: { x: 1, y: 0.95 }, colors });
        }
        if (e.k === "bonusResult") {
          sfx.fanfare(0.2);
          if (e.winners.length) {
            sfx.cheer(1, 0.1);
            const colors = ["#f5c451", "#ffe08a", "#ffffff", "#34d399"];
            setTimeout(() => void confetti({ particleCount: 220, spread: 160, origin: { y: 0.4 }, colors, scalar: 1.2 }), 500);
          }
        }
      }),
    [],
  );

  // Starting gun, galloping hooves, crowd swell and the finish.
  const racing = snap.bonus?.stage === "racing";
  useEffect(() => {
    if (!racing) return;
    sfx.startGun();
    let stride = 0;
    let swelled = false;
    let finished = false;
    const id = setInterval(() => {
      const s = snapRef.current;
      const e = raceElapsed(s, offset);
      const script = s.bonus?.script;
      if (e === null || !script) return;
      const frames = script.progress[0]!.length - 1;
      const winFrame = script.progress[script.order[0]!]!.findIndex((v) => v >= 1);
      const winMs = (winFrame / frames) * RACE_ANIM_MS;
      if (e < winMs && stride++ % 1 === 0) sfx.gallop(Math.min(1, 0.3 + e / RACE_ANIM_MS));
      if (!swelled && e > RACE_ANIM_MS * 0.6) {
        swelled = true;
        sfx.cheer(0.55);
      }
      if (!finished && e >= winMs) {
        finished = true;
        sfx.reveal();
        sfx.cheer(1);
      }
    }, 330);
    return () => clearInterval(id);
  }, [racing, offset]);
}
