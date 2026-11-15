import { motion, AnimatePresence } from "motion/react";
import type { PublicSnapshot } from "@21/engine";
import { Avatar, QR, signed } from "../components/ui";
import { MiniCard } from "../components/PlayingCard";
import { useT, useLang, fmt } from "../lib/i18n";
import { joinUrl } from "../lib/api";

export function Sidebar({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const f = (n: number) => fmt(n, lang);
  const board = snap.leaderboard.slice(0, 8);
  return (
    <aside className="absolute right-0 top-0 flex h-full w-[320px] flex-col gap-4 py-6 pl-2 pr-6">
      <section className="glass flex min-h-0 flex-1 flex-col rounded-3xl p-4">
        <h2 className="mb-3 flex items-center justify-between px-1 text-xs font-bold tracking-[0.25em] text-white/50 uppercase">
          <span>{t("leaderboard")}</span>
          <span className="text-gold">🏆</span>
        </h2>
        <ol className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {board.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
                className={`flex items-center gap-2.5 rounded-2xl px-2 py-1.5 ${i === 0 ? "bg-gold/12 ring-1 ring-gold/40" : ""}`}
              >
                <span
                  className={`tabular w-5 text-center font-display text-sm font-bold ${i === 0 ? "text-gold" : i < 3 ? "text-white/80" : "text-white/40"}`}
                >
                  {i + 1}
                </span>
                <Avatar emoji={p.avatar} seed={p.id} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-[15px] font-semibold leading-tight">
                    <span className="truncate">{p.name}</span>
                    {p.streak >= 3 && <span className="flame text-xs">🔥</span>}
                  </div>
                  <div className="tabular text-xs text-white/45">{f(p.chips)}</div>
                </div>
                <span className={`tabular text-sm font-bold ${p.net > 0 ? "text-win" : p.net < 0 ? "text-lose" : "text-white/40"}`}>
                  {signed(p.net, f)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {board.length === 0 && <li className="px-2 py-6 text-center text-sm text-white/35">{t("waitingPlayers")}</li>}
        </ol>

        <h2 className="mb-2 mt-5 px-1 text-xs font-bold tracking-[0.25em] text-white/50 uppercase">{t("recentHands")}</h2>
        <ul className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
          <AnimatePresence initial={false}>
            {snap.history.slice(0, 5).map((h) => {
              const winners = h.results.filter((r) => r.outcome === "win" || r.outcome === "blackjack").length;
              return (
                <motion.li
                  key={h.no}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-white/[.035] px-2.5 py-2"
                >
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-white/45">
                    <span>
                      #{h.no} · {t("dealer")} <span className="tabular text-white/80">{h.dealerTotal > 21 ? "BUST" : h.dealerTotal}</span>
                    </span>
                    <span className="tabular text-win">{t("winnersOf", { n: winners, m: h.results.length })}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {h.shared.slice(0, 6).map((c, i) => (
                      <MiniCard key={i} card={c} width={26} />
                    ))}
                    <span className="mx-1 text-[10px] font-bold text-white/30">{t("vs")}</span>
                    {h.dealer.slice(0, 4).map((c, i) => (
                      <MiniCard key={`d${i}`} card={c} width={20} />
                    ))}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </section>

      {snap.phase !== "lobby" && (
        <section className="glass flex items-center gap-3 rounded-3xl p-3">
          <div className="shrink-0 scale-[.42] -m-[58px]">
            <QR text={joinUrl(snap.code)} size={200} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">{t("scanToJoin")}</div>
            <div className="font-display text-3xl font-bold tracking-[0.18em] text-gold">{snap.code}</div>
            <div className="tabular text-xs text-white/40">
              {t("playersJoined", { n: snap.players.length })}
              {snap.rail.length > 0 ? ` · ${snap.rail.length} ${t("rail").toLowerCase()}` : ""}
            </div>
          </div>
        </section>
      )}
    </aside>
  );
}
