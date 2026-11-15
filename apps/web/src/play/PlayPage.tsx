import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import { ACHIEVEMENT_ICONS, type AchievementCode } from "@21/engine";
import { useGame, onRoomEvent } from "../lib/store";
import { api } from "../lib/api";
import { useT, useLang, fmt, hasKey, type TKey } from "../lib/i18n";
import { getProfile } from "../lib/storage";
import { haptic, sfx, setSoundEnabled, soundEnabled, unlockAudio } from "../lib/sound";
import { Avatar, CountUp, Logo, signed } from "../components/ui";
import { LangToggle } from "../components/LangToggle";
import { JoinForm } from "./JoinForm";
import { PlayPanel } from "./PlayPanel";
import { StatsTab, HistoryTab, BoardTab } from "./Tabs";

type Tab = "play" | "stats" | "history" | "board";

export default function PlayPage({ code }: { code: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const { snap, me, playerId, status, connect, send, lastError } = useGame();
  const [missing, setMissing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState<Tab>("play");
  const [toast, setToast] = useState<{ id: number; icon: string; title: string; sub: string } | null>(null);
  const [sound, setSound] = useState(soundEnabled());
  const autoJoined = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api
      .roomInfo(code)
      .then((info) => {
        if (cancelled) return;
        if (!info.exists) setMissing(true);
        else connect(code, "player");
      })
      .catch(() => connect(code, "player"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // If we have a profile and the server doesn't know us yet after hello, we wait for the user to tap "Take a seat".
  useEffect(() => {
    if (playerId) {
      setJoining(false);
      autoJoined.current = true;
    }
  }, [playerId]);

  // Keep the phone awake while playing.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const req = async () => {
      try {
        lock = (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof lock> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        /* ignore */
      }
    };
    if (playerId) void req();
    const onVis = () => playerId && document.visibilityState === "visible" && void req();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [playerId]);

  // Personal effects: results, achievements.
  useEffect(() => {
    return onRoomEvent((e) => {
      const pid = useGame.getState().playerId;
      if (!pid) return;
      if (e.k === "payout") {
        const mine = e.results.find((r) => r.playerId === pid);
        if (!mine) return;
        if (mine.outcome === "blackjack") {
          sfx.blackjack();
          haptic([40, 60, 40, 60, 120]);
          void confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors: ["#f5c451", "#ffffff"] });
        } else if (mine.outcome === "win") {
          sfx.win();
          haptic([30, 50, 60]);
          void confetti({ particleCount: 60, spread: 70, origin: { y: 0.65 }, colors: ["#34d399", "#f5c451"], scalar: 0.8 });
        } else if (mine.outcome === "push") sfx.push();
        else {
          sfx.lose();
          haptic(120);
        }
      }
      if (e.k === "step" && e.card && e.takers.includes(pid)) sfx.flip();
      if (e.k === "deal") [0, 0.15].forEach((d) => sfx.deal(d));
      if (e.k === "achievement" && e.playerId === pid) {
        sfx.achievement();
        haptic([20, 40, 20, 40, 60]);
        const code = e.code as AchievementCode;
        setToast({ id: Date.now(), icon: ACHIEVEMENT_ICONS[code], title: t(`ach_${code}` as TKey), sub: t(`achd_${code}` as TKey) });
        setTimeout(() => setToast(null), 3800);
      }
    });
  }, [t]);

  const errorText =
    lastError && Date.now() - lastError.at < 4000 && hasKey(`error_${lastError.code}`)
      ? t(`error_${lastError.code}` as TKey, { min: snap?.rules.minBet ?? 0, max: snap?.rules.maxBet ?? 0 })
      : null;

  const kicked = lastError && (lastError.code === "kicked" || lastError.code === "banned") && !playerId;

  if (missing)
    return (
      <Centered>
        <Logo />
        <p className="mt-6 text-lg text-muted">{t("roomNotFound")}</p>
        <a href="/" className="btn-press mt-6 inline-block rounded-2xl bg-white px-6 py-3 font-bold text-ink">
          ← 21Together
        </a>
      </Centered>
    );

  if (kicked)
    return (
      <Centered>
        <div className="text-5xl">🚪</div>
        <p className="mt-4 text-lg">{t(lastError!.code === "banned" ? "banned" : "kicked")}</p>
      </Centered>
    );

  if (!snap || (status !== "open" && !playerId && !snap))
    return (
      <Centered>
        <Logo />
        <p className="mt-6 animate-pulse text-muted">{t("connecting")}</p>
      </Centered>
    );

  const player = playerId ? snap.players.find((p) => p.id === playerId) : undefined;

  if (!player || !me) {
    if (joining)
      return (
        <Centered>
          <Logo />
          <p className="mt-6 animate-pulse text-muted">{t("connecting")}</p>
        </Centered>
      );
    return (
      <JoinForm
        code={code}
        onJoin={(name, avatar) => {
          setJoining(true);
          send({ t: "join", name, avatar });
        }}
      />
    );
  }

  const f = (n: number) => fmt(n, lang);
  return (
    <div className="grain relative flex min-h-full flex-col bg-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(19,107,76,.35), transparent 70%)" }} />
      {/* header */}
      <header className="relative z-10 flex items-center gap-3 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+12px)]">
        <Avatar emoji={player.avatar} seed={player.id} size={44} ring={player.streak >= 3 ? "#f97316" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-bold">
            {player.name}
            {player.streak >= 3 && <span className="flame text-sm">🔥{player.streak}</span>}
          </div>
          <div className="text-xs text-white/45">
            {player.seat !== null ? `#${player.seat + 1}` : t("rail")} · {t("code")} {code}
            {status !== "open" && <span className="ml-1 text-lose">· {t("reconnecting")}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="tabular font-display text-2xl font-bold leading-none gold-text">
            <CountUp value={player.chips} format={f} />
          </div>
          <div className={`tabular text-xs font-bold ${player.net > 0 ? "text-win" : player.net < 0 ? "text-lose" : "text-white/40"}`}>
            {signed(player.net, f)}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+84px)] pt-2">
        {tab === "play" && <PlayPanel snap={snap} me={me} player={player} />}
        {tab === "stats" && <StatsTab me={me} />}
        {tab === "history" && <HistoryTab snap={snap} playerId={player.id} />}
        {tab === "board" && <BoardTab snap={snap} playerId={player.id} />}
        {tab !== "play" && (
          <div className="mt-6 flex items-center justify-between gap-3">
            <LangToggle />
            <button
              className="glass btn-press rounded-full px-4 py-2 text-sm font-bold"
              onClick={() => {
                setSoundEnabled(!sound);
                setSound(!sound);
              }}
            >
              {sound ? "🔊" : "🔇"} {t("sound")}
            </button>
            <button
              className="btn-press rounded-full px-4 py-2 text-sm font-bold text-lose"
              onClick={() => {
                send({ t: "leave" });
                location.href = "/";
              }}
            >
              {t("leave")}
            </button>
          </div>
        )}
      </main>

      {/* tab bar */}
      <nav className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-20 grid grid-cols-4 rounded-2xl p-1.5">
        {(
          [
            ["play", "🃏", "tabPlay"],
            ["stats", "📊", "tabStats"],
            ["history", "🕘", "tabHistory"],
            ["board", "🏆", "tabBoard"],
          ] as [Tab, string, TKey][]
        ).map(([k, icon, label]) => (
          <button
            key={k}
            onClick={() => {
              haptic(6);
              unlockAudio();
              setTab(k);
            }}
            className={`btn-press relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold ${tab === k ? "text-text" : "text-white/40"}`}
          >
            {tab === k && <motion.span layoutId="tab" className="absolute inset-0 rounded-xl bg-white/10" />}
            <span className="relative text-lg leading-none">{icon}</span>
            <span className="relative">{t(label)}</span>
            {k === "play" && tab !== "play" && (snap.phase === "betting" || snap.phase === "deciding") && (
              <span className="absolute right-4 top-1 h-2 w-2 rounded-full bg-gold" />
            )}
          </button>
        ))}
      </nav>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-40 flex items-center gap-3 rounded-2xl bg-ink-2/95 p-3 ring-1 ring-gold/50 shadow-[0_10px_40px_-10px_rgba(245,196,81,.5)]"
          >
            <span className="text-3xl">{toast.icon}</span>
            <div>
              <div className="text-[10px] font-bold tracking-[0.2em] text-gold uppercase">{t("unlocked")}</div>
              <div className="font-bold">{toast.title}</div>
              <div className="text-xs text-white/50">{toast.sub}</div>
            </div>
          </motion.div>
        )}
        {errorText && (
          <motion.div
            key={lastError!.at}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-6 bottom-[calc(env(safe-area-inset-bottom)+92px)] z-40 rounded-xl bg-lose px-4 py-2.5 text-center text-sm font-bold text-ink"
          >
            {errorText}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-col items-center justify-center bg-ink p-6 text-center">{children}</div>;
}
