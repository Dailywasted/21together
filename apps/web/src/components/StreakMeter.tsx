import { motion } from "motion/react";
import { useT } from "../lib/i18n";

const STREAK_TARGET = 3;

/**
 * Win-streak meter: 3 pips toward the Reindeer Race bonus.
 * Gold = counts toward the bonus, grey + ⏳ = bonus on cooldown, 🔥 N once the streak is 3+.
 */
export function StreakMeter({
  streak,
  readyIn,
  size = 10,
  label = true,
}: {
  streak: number;
  /** Rounds before a bonus can unlock (0 = ready), null = bonuses off. */
  readyIn: number | null;
  size?: number;
  label?: boolean;
}) {
  const t = useT();
  const cooling = readyIn !== null && readyIn > 0;
  if (streak >= STREAK_TARGET) {
    return (
      <span
        className="flame tabular inline-flex items-center gap-0.5 rounded-full bg-[#ff7a1a]/20 px-2 font-display font-bold text-[#ffb347] ring-1 ring-[#ff8a1f]/60"
        style={{ fontSize: size * 1.25, lineHeight: `${size * 1.9}px` }}
      >
        🔥{streak}
      </span>
    );
  }
  const almost = streak === STREAK_TARGET - 1 && readyIn === 0;
  return (
    <span className="inline-flex items-center gap-1.5" style={{ height: size * 1.9 }}>
      <span className="inline-flex items-center" style={{ gap: size * 0.4 }}>
        {Array.from({ length: STREAK_TARGET }, (_, i) => {
          const on = i < streak;
          const next = almost && i === streak;
          return (
            <motion.span
              key={i}
              className="block rounded-full"
              initial={false}
              animate={
                next
                  ? { scale: [1, 1.35, 1], boxShadow: ["0 0 0 0 rgba(245,196,81,.0)", "0 0 10px 2px rgba(245,196,81,.8)", "0 0 0 0 rgba(245,196,81,.0)"] }
                  : { scale: on ? [1.5, 1] : 1 }
              }
              transition={next ? { duration: 0.9, repeat: Infinity } : { type: "spring", stiffness: 500, damping: 15 }}
              style={{
                width: size,
                height: size,
                background: on ? (cooling ? "#9aa4ad" : "linear-gradient(135deg, #ffe08a, #f5c451)") : "transparent",
                boxShadow: on && !cooling ? "0 0 8px rgba(245,196,81,.6)" : undefined,
                border: on ? "none" : `1.5px solid ${next ? "#f5c451" : "rgba(255,255,255,.22)"}`,
              }}
            />
          );
        })}
      </span>
      {label && almost && (
        <motion.span
          className="whitespace-nowrap font-extrabold text-gold"
          style={{ fontSize: size * 1.15 }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          🦌 {t("oneMore")}
        </motion.span>
      )}
      {cooling && streak > 0 && (
        <span className="tabular whitespace-nowrap font-bold text-white/40" style={{ fontSize: size * 1.05 }}>
          ⏳{readyIn}
        </span>
      )}
    </span>
  );
}
