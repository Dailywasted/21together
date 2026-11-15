import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ACHIEVEMENTS, ACHIEVEMENT_ICONS, type PublicSnapshot, type PrivateView, type RoundSummary } from "@21/engine";
import type { GlobalPlayerStats } from "@21/protocol";
import { Avatar, signed } from "../components/ui";
import { MiniCard } from "../components/PlayingCard";
import { useT, useLang, fmt, type TKey } from "../lib/i18n";
import { api } from "../lib/api";
import { deviceId } from "../lib/storage";

export function StatsTab({ me }: { me: PrivateView }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const f = (n: number) => fmt(n, lang);
  const s = me.stats;
  const [global, setGlobal] = useState<GlobalPlayerStats | null>(null);
  useEffect(() => {
    api.playerStats(deviceId()).then((r) => setGlobal(r.stats)).catch(() => {});
  }, [s.hands]);
  const winRate = s.hands ? Math.round((s.wins / s.hands) * 100) : 0;
  const tiles: [TKey, string, string?][] = [
    ["hands", f(s.hands)],
    ["winRate", `${winRate}%`],
    ["net", signed(s.net, f), s.net > 0 ? "text-win" : s.net < 0 ? "text-lose" : ""],
    ["biggestWin", f(s.biggestWin)],
    ["blackjacks", f(s.blackjacks)],
    ["busts", f(s.busts)],
    ["bestStreak", `${s.bestStreak} 🔥`],
    ["doubles", `${s.doubleWins}/${s.doubles}`],
    ["wagered", f(s.wagered)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 text-xs font-bold tracking-[0.25em] text-white/50 uppercase">{t("thisNight")}</h3>
        <div className="grid grid-cols-3 gap-2">
          {tiles.map(([k, v, cls]) => (
            <div key={k} className="glass rounded-2xl p-3">
              <div className="text-[10px] font-bold tracking-wider text-white/45 uppercase">{t(k)}</div>
              <div className={`tabular mt-1 font-display text-xl font-bold ${cls ?? ""}`}>{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 flex items-center justify-between text-xs font-bold tracking-[0.25em] text-white/50 uppercase">
          <span>{t("achievements")}</span>
          <span className="tabular text-gold">
            {me.achievements.length}/{ACHIEVEMENTS.length}
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const got = me.achievements.includes(a);
            return (
              <div key={a} className={`flex items-center gap-2.5 rounded-2xl p-2.5 ${got ? "bg-gold/12 ring-1 ring-gold/40" : "bg-white/[.03]"}`}>
                <span className={`text-2xl ${got ? "" : "opacity-25 grayscale"}`}>{ACHIEVEMENT_ICONS[a]}</span>
                <div className="min-w-0">
                  <div className={`truncate text-sm font-bold ${got ? "" : "text-white/50"}`}>{t(`ach_${a}` as TKey)}</div>
                  <div className="truncate text-[11px] text-white/40">{t(`achd_${a}` as TKey)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {global && global.hands > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold tracking-[0.25em] text-white/50 uppercase">{t("allTime")}</h3>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["hands", f(global.hands)],
                ["winRate", `${Math.round((global.wins / global.hands) * 100)}%`],
                ["net", signed(global.net, f)],
                ["blackjacks", f(global.blackjacks)],
                ["busts", f(global.busts)],
                ["biggestWin", f(global.biggestWin)],
              ] as [TKey, string][]
            ).map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/[.03] p-3">
                <div className="text-[10px] font-bold tracking-wider text-white/45 uppercase">{t(k)}</div>
                <div className="tabular mt-1 font-display text-lg font-bold">{v}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function HistoryTab({ snap, playerId }: { snap: PublicSnapshot; playerId: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [more, setMore] = useState<RoundSummary[]>([]);
  const [total, setTotal] = useState(0);
  const rounds = [...snap.history, ...more.filter((m) => !snap.history.some((h) => h.no === m.no))];
  const loadMore = () => {
    api
      .history(snap.code, rounds.length, 20)
      .then((r) => {
        setMore((m) => [...m, ...r.rounds]);
        setTotal(r.total);
      })
      .catch(() => {});
  };
  if (rounds.length === 0) return <div className="py-16 text-center text-muted">{t("noHistory")}</div>;
  return (
    <div className="flex flex-col gap-2">
      {rounds.map((h) => {
        const mine = h.results.find((r) => r.playerId === playerId);
        return (
          <div key={h.no} className="glass rounded-2xl p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-white/50">
              <span>
                {t("round")} #{h.no}
              </span>
              <span>
                {t("dealer")} <span className="tabular font-bold text-white">{h.dealerTotal > 21 ? "BUST" : h.dealerTotal}</span>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex gap-0.5">
                {h.shared.map((c, i) => (
                  <div key={i} style={{ opacity: mine && i >= mine.stopAt ? 0.3 : 1 }}>
                    <MiniCard card={c} width={24} />
                  </div>
                ))}
              </div>
              <span className="text-white/25">{t("vs")}</span>
              <div className="flex gap-0.5">
                {h.dealer.map((c, i) => (
                  <MiniCard key={i} card={c} width={24} />
                ))}
              </div>
            </div>
            {mine ? (
              <div className="mt-2 flex items-center justify-between rounded-xl bg-white/5 px-2.5 py-1.5 text-sm">
                <span className="font-semibold">
                  {t("you")} · <span className="tabular">{mine.total}</span> {mine.doubled ? "· ×2" : ""}
                </span>
                <span className={`tabular font-bold ${mine.net > 0 ? "text-win" : mine.net < 0 ? "text-lose" : "text-push"}`}>
                  {t(mine.outcome === "blackjack" ? "BJ" : mine.outcome === "win" ? "WIN" : mine.outcome === "push" ? "PUSH" : mine.total > 21 ? "BUST" : "LOSE")}{" "}
                  {signed(mine.net, (n) => fmt(n, lang))}
                </span>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1">
              {h.results.map((r) => (
                <span
                  key={r.playerId}
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    r.net > 0 ? "bg-win/15 text-win" : r.net < 0 ? "bg-lose/12 text-lose" : "bg-white/8 text-white/60"
                  }`}
                >
                  {r.avatar} {r.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      {(total === 0 ? snap.roundNo > rounds.length : rounds.length < total) && (
        <button onClick={loadMore} className="btn-press mt-1 rounded-2xl bg-white/8 py-3 font-bold">
          ↓
        </button>
      )}
    </div>
  );
}

export function BoardTab({ snap, playerId }: { snap: PublicSnapshot; playerId: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const f = (n: number) => fmt(n, lang);
  const [mode, setMode] = useState<"night" | "all">("night");
  const [global, setGlobal] = useState<GlobalPlayerStats[] | null>(null);
  useEffect(() => {
    if (mode === "all" && !global) api.leaderboard().then((r) => setGlobal(r.players)).catch(() => setGlobal([]));
  }, [mode, global]);
  return (
    <div>
      <div className="glass mb-3 inline-flex rounded-full p-1 text-sm font-bold">
        {(["night", "all"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`btn-press rounded-full px-4 py-1.5 ${mode === m ? "bg-white text-ink" : "text-muted"}`}
          >
            {t(m === "night" ? "thisNight" : "allTime")}
          </button>
        ))}
      </div>
      <ol className="flex flex-col gap-1.5">
        {mode === "night"
          ? snap.leaderboard.map((p, i) => (
              <motion.li
                layout
                key={p.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${p.id === playerId ? "bg-gold/12 ring-1 ring-gold/40" : "bg-white/[.04]"}`}
              >
                <span className={`tabular w-6 text-center font-display font-bold ${i === 0 ? "text-gold" : "text-white/50"}`}>{i + 1}</span>
                <Avatar emoji={p.avatar} seed={p.id} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {p.name} {p.streak >= 3 && <span className="flame text-xs">🔥</span>}
                  </div>
                  <div className="tabular text-xs text-white/45">{f(p.chips)}</div>
                </div>
                <span className={`tabular font-bold ${p.net > 0 ? "text-win" : p.net < 0 ? "text-lose" : "text-white/40"}`}>{signed(p.net, f)}</span>
              </motion.li>
            ))
          : (global ?? []).map((p, i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl bg-white/[.04] px-3 py-2">
                <span className={`tabular w-6 text-center font-display font-bold ${i === 0 ? "text-gold" : "text-white/50"}`}>{i + 1}</span>
                <Avatar emoji={p.avatar} seed={p.name} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="tabular text-xs text-white/45">
                    {f(p.hands)} {t("hands").toLowerCase()} · {p.hands ? Math.round((p.wins / p.hands) * 100) : 0}%
                  </div>
                </div>
                <span className={`tabular font-bold ${p.net > 0 ? "text-win" : p.net < 0 ? "text-lose" : "text-white/40"}`}>{signed(p.net, f)}</span>
              </li>
            ))}
        {mode === "all" && global === null && <li className="py-10 text-center text-muted">…</li>}
      </ol>
    </div>
  );
}
