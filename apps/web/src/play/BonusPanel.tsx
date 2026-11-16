import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { PublicPlayer, PublicSnapshot } from "@21/engine";
import { CountdownRing, useNow } from "../components/ui";
import { fmt, useLang, useT } from "../lib/i18n";
import { timeLeft, useGame } from "../lib/store";
import { haptic, sfx } from "../lib/sound";
import { LANE_COLORS, isFavourite, oddsLabel, positionsAt, raceElapsed, runnerName, standings } from "../lib/race";

/** Phone side of the Reindeer Race bonus: free pick, live position, result. */
export function BonusPanel({ snap, player }: { snap: PublicSnapshot; player: PublicPlayer }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const send = useGame((s) => s.send);
  const offset = useGame((s) => s.clockOffset);
  useNow(200);
  const b = snap.bonus!;
  const mine = b.picks[player.id];
  const hero = b.hero?.playerId === player.id;
  const mult = hero ? 2 : 1;

  // Buzz when the result lands.
  const winnerId = b.stage === "results" ? b.script!.order[0]! : null;
  const won = winnerId !== null && mine === winnerId;
  const buzzed = useRef(false);
  useEffect(() => {
    if (b.stage !== "results") {
      buzzed.current = false;
      return;
    }
    if (buzzed.current) return;
    buzzed.current = true;
    if (won) {
      haptic([60, 40, 60, 40, 200]);
      sfx.win();
    } else haptic(80);
  }, [b.stage, won]);

  if (b.stage === "intro" || b.stage === "picking") {
    const left = timeLeft(snap, offset);
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="glass flex items-center gap-3 rounded-3xl p-4">
          <span className="text-4xl">🦌</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold tracking-[0.3em] text-gold uppercase">{t("bonusRound")}</div>
            <div className="font-display text-2xl font-bold leading-tight">{t("pickReindeer")}</div>
            <div className="text-sm text-muted">{t("freePick")} 🎁</div>
          </div>
          {b.stage === "picking" && snap.deadline !== null && !snap.paused && (
            <CountdownRing remaining={left} total={snap.phaseMs} size={52} stroke={5}>
              <span className="text-lg">{Math.ceil(left / 1000)}</span>
            </CountdownRing>
          )}
        </div>
        {hero && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="rounded-2xl bg-gold/15 px-4 py-2.5 text-center font-bold text-gold ring-1 ring-gold/50"
          >
            🔥 {t("prizeX2")}
          </motion.div>
        )}
        <div className="flex flex-col gap-2">
          {b.runners.map((r) => {
            const color = LANE_COLORS[r.id]!;
            const selected = mine === r.id;
            return (
              <button
                key={r.id}
                onClick={() => {
                  send({ t: "pick", runner: r.id });
                  haptic(30);
                  sfx.lock();
                }}
                className="btn-press flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition"
                style={{
                  background: selected ? `linear-gradient(90deg, ${color}, ${color}88)` : "rgba(255,255,255,.05)",
                  boxShadow: selected ? `0 0 0 2px #fff, 0 10px 30px -10px ${color}` : `inset 0 0 0 1px ${color}66`,
                }}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-xl font-bold" style={{ background: selected ? "#fff" : color, color: selected ? color : "#fff" }}>
                  {r.id + 1}
                </span>
                <span className="text-3xl" style={{ transform: "scaleX(-1)" }}>
                  🦌
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg font-bold leading-tight">
                    {runnerName(r, lang)} {isFavourite(b.runners, r) && <span className="text-xs">⭐</span>}
                  </div>
                  <div className={`text-xs font-semibold ${selected ? "text-white/85" : "text-white/45"}`}>
                    {t("odds")} {oddsLabel(r.chance)}
                  </div>
                </div>
                <span className={`tabular font-display text-xl font-bold ${selected ? "text-white" : "text-gold"}`}>+{fmt(r.prize * mult, lang)}</span>
                {selected && <span className="text-xl">✓</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const r = mine !== undefined ? b.runners[mine] : undefined;
  const color = r ? LANE_COLORS[r.id]! : "#fff";

  if (b.stage === "racing" && r && b.script) {
    const e = raceElapsed(snap, offset) ?? 0;
    const place = standings(b.script, positionsAt(b.script, e)).indexOf(r.id) + 1;
    const placeText = place === 1 ? t("place_1") : place === 2 ? t("place_2") : place === 3 ? t("place_3") : t("place_n", { n: place });
    return (
      <div className="flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-center" style={{ background: `radial-gradient(ellipse at 50% 30%, ${color}44, rgba(255,255,255,.03) 70%)` }}>
        <div className="text-xs font-extrabold tracking-[0.3em] text-white/55 uppercase">{t("yourReindeer")}</div>
        <motion.div className="mt-3 text-[96px] leading-none" animate={{ y: [0, -12, 0] }} transition={{ duration: 0.35, repeat: Infinity }} style={{ scaleX: -1 }}>
          🦌
        </motion.div>
        <div className="mt-2 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full font-display text-lg font-bold" style={{ background: color }}>
            {r.id + 1}
          </span>
          <span className="font-display text-3xl font-bold">{runnerName(r, lang)}</span>
        </div>
        <motion.div key={place} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className={`mt-4 font-display text-5xl font-bold ${place === 1 ? "text-gold" : ""}`}>
          {t("positionN", { n: placeText })}
        </motion.div>
        <div className="mt-3 text-muted">{t("watchTv")}</div>
      </div>
    );
  }

  if (b.stage === "results" && winnerId !== null) {
    const winnerName = runnerName(b.runners[winnerId]!, lang);
    const prize = b.winners?.find((w) => w.playerId === player.id)?.prize ?? 0;
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-center ring-1 ring-white/10"
        style={{ background: won ? "rgba(52,211,153,.15)" : "rgba(255,255,255,.04)" }}
      >
        <div className="text-6xl">{won ? "🏆" : "🦌"}</div>
        <div className={`mt-3 font-display text-3xl font-bold ${won ? "text-win" : ""}`}>{won ? t("bonusWon") : t("bonusLost", { name: winnerName })}</div>
        {won && <div className="tabular mt-2 font-display text-5xl font-bold text-win">+{fmt(prize, lang)}</div>}
        <div className="mt-3 text-sm text-muted">{t("backToTable")}</div>
      </motion.div>
    );
  }

  return (
    <div className="glass flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-center">
      <div className="text-5xl">🦌</div>
      <div className="mt-3 font-display text-2xl font-bold">{t("watchTv")}</div>
    </div>
  );
}
