import { motion } from "motion/react";
import type { PublicSnapshot } from "@21/engine";
import { Avatar, signed } from "../components/ui";
import { useT, useLang, fmt, type TKey } from "../lib/i18n";

const ICONS: Record<string, string> = {
  chip_leader: "👑",
  biggest_win: "💰",
  blackjack_magnet: "🂡",
  most_reckless: "💥",
  iron_stander: "🧊",
  hot_hand: "🔥",
};

export function Awards({ snap, isHost, onAgain }: { snap: PublicSnapshot; isHost: boolean; onAgain: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const f = (n: number) => fmt(n, lang);
  const top = snap.leaderboard.slice(0, 3);
  const podium = [top[1], top[0], top[2]];
  const heights = [200, 260, 160];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-[1700px] flex-col items-center px-16 pb-12 pt-28">
        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="font-display text-7xl font-bold gold-text"
        >
          {t("awardsTitle")}
        </motion.h1>

        <div className="mt-12 flex items-end gap-6">
          {podium.map((p, i) =>
            p ? (
              <motion.div
                key={p.id}
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 + [1, 0, 2][i]! * 0.25, type: "spring", stiffness: 120, damping: 14 }}
                className="flex w-[260px] flex-col items-center"
              >
                <Avatar emoji={p.avatar} seed={p.id} size={i === 1 ? 120 : 92} ring={i === 1 ? "#f5c451" : undefined} />
                <div className="mt-3 text-2xl font-bold">{p.name}</div>
                <div className={`tabular text-xl font-bold ${p.net >= 0 ? "text-win" : "text-lose"}`}>{signed(p.net, f)}</div>
                <div
                  className="mt-4 grid w-full place-items-center rounded-t-3xl font-display text-6xl font-bold"
                  style={{
                    height: heights[i],
                    background:
                      i === 1
                        ? "linear-gradient(180deg, rgba(245,196,81,.45), rgba(245,196,81,.08))"
                        : "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.03))",
                  }}
                >
                  {[2, 1, 3][i]}
                </div>
              </motion.div>
            ) : (
              <div key={i} className="w-[260px]" />
            ),
          )}
        </div>

        <div className="mt-12 grid w-full grid-cols-3 gap-5">
          {(snap.awards ?? []).map((a, i) => (
            <motion.div
              key={a.code}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 1.2 + i * 0.15, type: "spring" }}
              className="glass flex items-center gap-4 rounded-3xl p-5"
            >
              <div className="text-5xl">{ICONS[a.code]}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold tracking-[0.2em] text-gold uppercase">{t(`award_${a.code}` as TKey)}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Avatar emoji={a.avatar} seed={a.playerId} size={32} />
                  <span className="truncate text-xl font-bold">{a.name}</span>
                </div>
              </div>
              <div className="tabular font-display text-3xl font-bold text-white/80">
                {a.code === "chip_leader" || a.code === "biggest_win" ? signed(a.value, f) : a.value}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-4">
          <a
            href="/"
            className="btn-press rounded-2xl bg-white/10 px-8 py-4 font-display text-2xl font-bold text-white ring-1 ring-white/15 hover:bg-white/15"
          >
            ← {t("mainMenu")}
          </a>
          {isHost && (
            <button
              onClick={onAgain}
              className="btn-press rounded-2xl bg-white px-10 py-4 font-display text-2xl font-bold text-ink"
            >
              {t("newNight")} ↻
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
