import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import type { PublicSnapshot, AchievementCode } from "@21/engine";
import { ACHIEVEMENT_ICONS } from "@21/engine";
import { onReaction, onRoomEvent, timeLeft } from "../lib/store";
import { sfx } from "../lib/sound";
import { useT, type TKey } from "../lib/i18n";
import { seatPositions } from "./Table";
import { Avatar } from "../components/ui";

interface Toast {
  id: number;
  text: string;
  icon: string;
  sub: string;
  playerId: string;
  avatar: string;
}

interface Floater {
  id: number;
  emoji: string;
  x: number;
  y: number;
}

let seq = 0;

/** Sounds, toasts, reactions and celebrations driven by room events (TV side). */
export function Effects({ snap, offset, variant = "table" }: { snap: PublicSnapshot; offset: number; variant?: "table" | "arena" }) {
  const t = useT();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [burst, setBurst] = useState<{ id: number; text: string } | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    return onRoomEvent((e) => {
      const s = snapRef.current;
      // The big screen times its own card sounds and celebrations.
      if (variant === "arena" && (e.k === "deal" || e.k === "step" || e.k === "dealerCard" || e.k === "payout")) return;
      switch (e.k) {
        case "deal":
          [0, 0.25, 0.5, 0.75].forEach((d) => sfx.deal(d));
          break;
        case "step":
          if (e.card) sfx.flip(0.05);
          break;
        case "dealerCard":
          sfx.flip();
          break;
        case "shuffle":
          sfx.shuffle();
          setShuffle(true);
          setTimeout(() => setShuffle(false), 2200);
          break;
        case "payout": {
          const wins = e.results.filter((r) => r.outcome === "win" || r.outcome === "blackjack").length;
          const bj = e.results.some((r) => r.outcome === "blackjack");
          if (bj) {
            sfx.blackjack();
            setBurst({ id: ++seq, text: "BLACKJACK" });
            void confetti({ particleCount: 160, spread: 100, origin: { y: 0.45 }, colors: ["#f5c451", "#ffffff", "#34d399"] });
          } else if (wins > e.results.length / 2) {
            sfx.win();
            void confetti({ particleCount: 70, spread: 70, origin: { y: 0.55 }, colors: ["#f5c451", "#34d399"], scalar: 0.9 });
          } else if (wins > 0) sfx.chip();
          else sfx.lose();
          break;
        }
        case "achievement": {
          sfx.achievement();
          const p = s.players.find((x) => x.id === e.playerId);
          const toast: Toast = {
            id: ++seq,
            text: t(`ach_${e.code}` as TKey),
            sub: e.name,
            icon: ACHIEVEMENT_ICONS[e.code as AchievementCode] ?? "⭐",
            playerId: e.playerId,
            avatar: p?.avatar ?? "⭐",
          };
          setToasts((ts) => [...ts.slice(-3), toast]);
          setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== toast.id)), 4200);
          break;
        }
        case "joined":
          sfx.pop();
          break;
      }
    });
  }, [t, variant]);

  useEffect(() => {
    return onReaction((playerId, emoji) => {
      if (variant === "arena") return; // seat tiles float their own reactions
      const s = snapRef.current;
      const p = s.players.find((x) => x.id === playerId);
      if (!p || p.seat === null) return;
      const pos = seatPositions(s.seats.length)[p.seat]!;
      const f = { id: ++seq, emoji, x: pos.x + (Math.random() * 40 - 20), y: pos.y - 60 };
      setFloaters((fs) => [...fs.slice(-20), f]);
      setTimeout(() => setFloaters((fs) => fs.filter((x) => x.id !== f.id)), 2200);
    });
  }, [variant]);

  // Countdown ticks in the last 3 seconds.
  const lastTick = useRef(-1);
  useEffect(() => {
    const id = setInterval(() => {
      const s = snapRef.current;
      if (s.paused || (s.phase !== "betting" && s.phase !== "deciding") || s.deadline === null) return;
      const sec = Math.ceil(timeLeft(s, offset) / 1000);
      if (sec <= 3 && sec > 0 && sec !== lastTick.current) {
        lastTick.current = sec;
        sfx.tick();
      }
      if (sec > 3) lastTick.current = -1;
    }, 100);
    return () => clearInterval(id);
  }, [offset]);

  return (
    <>
      {/* achievement toasts */}
      <div
        className={`pointer-events-none absolute z-30 flex flex-col items-start gap-2 ${variant === "arena" ? "left-[40px] top-[96px]" : "left-[96px] top-[104px]"}`}
      >
        <AnimatePresence>
          {toasts.map((x) => (
            <motion.div
              key={x.id}
              layout
              initial={{ x: -40, opacity: 0, scale: 0.9 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="flex items-center gap-3 rounded-full bg-ink/85 py-2 pl-2 pr-5 ring-1 ring-gold/50 shadow-[0_10px_40px_-10px_rgba(245,196,81,.5)]"
            >
              <Avatar emoji={x.avatar} seed={x.playerId} size={40} />
              <span className="text-2xl">{x.icon}</span>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-bold tracking-[0.2em] text-gold uppercase">{t("unlocked")}</span>
                <span className="text-lg font-bold">
                  {x.sub} · {x.text}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* floating reactions */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {floaters.map((f) => (
            <motion.div
              key={f.id}
              className="absolute text-5xl"
              style={{ left: f.x, top: f.y }}
              initial={{ y: 0, opacity: 0, scale: 0.5 }}
              animate={{ y: -160, opacity: [0, 1, 1, 0], scale: [0.5, 1.2, 1, 0.9] }}
              transition={{ duration: 2, ease: "easeOut" }}
            >
              {f.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* big bursts */}
      <AnimatePresence>
        {burst && (
          <motion.div
            key={burst.id}
            className="pointer-events-none absolute left-[800px] top-[470px] z-30 -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
            animate={{ scale: [0.3, 1.15, 1], opacity: 1, rotate: 0 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ duration: 0.6 }}
            onAnimationComplete={() => setTimeout(() => setBurst(null), 1400)}
          >
            <div className="font-display text-[140px] font-bold leading-none gold-text drop-shadow-[0_10px_40px_rgba(245,196,81,.6)]">
              {burst.text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shuffle && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold text-gold ${variant === "arena" ? "left-1/2 top-[64px]" : "left-[1330px] top-[250px]"}`}
          >
            🔀 {t("shuffling")}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
