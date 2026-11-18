import { AnimatePresence, motion } from "motion/react";
import { handValue, type Card, type PublicSnapshot } from "@21/engine";
import { CountdownRing, useNow } from "../components/ui";
import { useT } from "../lib/i18n";
import { activeHand, roundOutcome } from "../lib/view";
import { timeLeft } from "../lib/store";

/** Phase banner between the dealer and the shared row. */
export function Banner({ snap, offset }: { snap: PublicSnapshot; offset: number }) {
  const t = useT();
  useNow(100);
  const left = timeLeft(snap, offset);
  const inHand = snap.players.filter((p) => p.hand);
  const active = inHand.filter((p) => activeHand(p));
  let title = t(`phase_${snap.phase}`);
  let sub: string | null = null;
  let tone: "gold" | "plain" | "win" | "lose" = "plain";

  const dealerCards = snap.dealer.filter((c): c is Card => !!c);
  const dealerBJ = snap.dealer.length === 2 && dealerCards.length === 2 && handValue(dealerCards).blackjack;
  const sharedBJ = snap.shared.length === 2 && handValue(snap.shared).blackjack;

  switch (snap.phase) {
    case "betting": {
      const seated = snap.players.filter((p) => p.seat !== null);
      const locked = seated.filter((p) => p.betLocked).length;
      sub = seated.length ? t("lockedIn", { n: locked, m: seated.length }) : t("waitingPlayers");
      tone = "gold";
      break;
    }
    case "deciding": {
      const locked = active.filter((p) => activeHand(p)!.locked).length;
      sub = t("lockedIn", { n: locked, m: active.length });
      tone = "gold";
      break;
    }
    case "drawing": {
      const takers = snap.lastStep?.takers.length ?? 0;
      const splits = snap.lastStep?.splitters?.length ?? 0;
      title = splits ? `${t("SPLIT")} ×${splits}` : snap.lastStep?.secondHands ? t("secondHands") : (snap.lastStep?.rowCards?.length ?? (snap.lastStep?.card ? 1 : 0)) ? t("hitters", { n: takers }) : t("everyoneStands");
      break;
    }
    case "dealer":
    case "payout":
      if (sharedBJ && snap.step === 0) {
        title = dealerBJ ? t("dealerBlackjack") : t("sharedBlackjack");
        tone = dealerBJ ? "lose" : "gold";
      } else if (dealerBJ && snap.step === 0) {
        title = t("dealerBlackjack");
        tone = "lose";
      }
      if (snap.phase === "payout") {
        const winners = inHand.filter((p) => roundOutcome(p) === "win" || roundOutcome(p) === "blackjack").length;
        sub = t("winnersOf", { n: winners, m: inHand.length });
        if (tone === "plain") tone = winners > inHand.length / 2 ? "win" : "plain";
      }
      break;
  }
  if (snap.paused) {
    title = `⏸ ${t("paused")}`;
    sub = null;
  }
  const showRing = snap.deadline !== null && !snap.paused && (snap.phase === "betting" || snap.phase === "deciding");
  const titleClass =
    tone === "gold" ? "gold-text" : tone === "win" ? "text-win" : tone === "lose" ? "text-lose" : "text-white";

  return (
    <div className="absolute left-[800px] top-[322px] -translate-x-1/2">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${snap.phase}-${title}-${snap.paused}`}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4 rounded-full bg-black/35 py-2 pl-6 pr-3 ring-1 ring-white/10 backdrop-blur"
          style={{ minHeight: 60 }}
        >
          <div className="flex flex-col">
            <span className={`whitespace-nowrap font-display text-[28px] font-bold leading-tight ${titleClass}`}>{title}</span>
            {sub && <span className="tabular whitespace-nowrap text-sm font-semibold text-white/55">{sub}</span>}
          </div>
          {showRing ? (
            <CountdownRing remaining={left} total={snap.phaseMs} size={52} stroke={5}>
              <span className="text-lg">{Math.ceil(left / 1000)}</span>
            </CountdownRing>
          ) : (
            <span className="w-3" />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
