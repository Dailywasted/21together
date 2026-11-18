import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { handValue, type Card, type PublicPlayer, type PublicSnapshot, type PrivateView } from "@21/engine";
import { ALLOWED_REACTIONS } from "@21/protocol";
import { PlayingCard } from "../components/PlayingCard";
import { Chip } from "../components/Chip";
import { CountdownRing, useNow } from "../components/ui";
import { useT, useLang, fmt } from "../lib/i18n";
import { timeLeft, useGame } from "../lib/store";
import { haptic, sfx } from "../lib/sound";
import { activeHand, roundOutcome, rowOf, totalLabel } from "../lib/view";
import { BonusPanel } from "./BonusPanel";

const CHIP_VALUES = [10, 25, 100, 500];

export function PlayPanel({ snap, me, player }: { snap: PublicSnapshot; me: PrivateView; player: PublicPlayer }) {
  const busy =
    (snap.phase === "betting" && player.seat !== null && !player.betLocked && player.chips >= snap.rules.minBet) ||
    (snap.phase === "deciding" && !!activeHand(player)) ||
    (snap.phase === "bonus" && (snap.bonus?.stage === "picking" || snap.bonus?.stage === "intro"));
  return (
    <div className="flex flex-1 flex-col gap-3">
      <MiniTable snap={snap} player={player} />
      <ActionArea snap={snap} me={me} player={player} />
      {!busy && <Reactions />}
    </div>
  );
}

function MiniTable({ snap, player }: { snap: PublicSnapshot; player: PublicPlayer }) {
  const t = useT();
  const h = player.hand;
  const dealerVisible = snap.dealer.filter((c): c is Card => !!c);
  const myCards = h ? rowOf(snap, h.row).slice(0, h.stopAt) : [];
  const v = handValue(myCards);
  if (snap.shared.length === 0) return null;
  const split = !!(h && player.hand2);
  // Overlap cards when the row gets long so it always fits on one line.
  const n = snap.shared.length;
  const handW = 50;
  const handStep = n <= 5 ? handW + 6 : Math.max(26, (300 - handW) / (n - 1));
  return (
    <div className="glass relative overflow-hidden rounded-3xl px-4 py-3">
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(19,107,76,.55), transparent 70%)" }} />
      <div className="relative flex items-center gap-3">
        <span className="w-14 shrink-0 text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase">{t("dealer")}</span>
        <div className="flex flex-1 gap-1">
          {snap.dealer.map((c, i) => (
            <PlayingCard key={`${snap.roundNo}-d${i}`} card={c} width={34} dealFrom={{ x: 120, y: -40 }} delay={i * 0.1} />
          ))}
        </div>
        {dealerVisible.length > 0 && (
          <span className="tabular rounded-full bg-black/40 px-2.5 py-0.5 font-display text-base font-bold">{snap.dealer.every(Boolean) && snap.dealer.length >= 2 ? handValue(dealerVisible).total : totalLabel(dealerVisible)}</span>
        )}
      </div>
      {split ? (
        [h!, player.hand2!].map((x, i) => <SplitHandLine key={i} snap={snap} hand={x} label={t(i === 0 ? "hand1" : "hand2")} />)
      ) : (
      <div className="relative mt-3 flex items-center gap-3">
        <span className="w-14 shrink-0 text-[10px] font-bold tracking-[0.2em] text-white/50 uppercase">{t("yourHand")}</span>
        <div className="relative flex-1" style={{ height: handW * 1.4 }}>
          {snap.shared.map((c, i) => (
            <div key={`${snap.roundNo}-s${i}`} className="absolute top-0" style={{ left: i * handStep }}>
              <PlayingCard card={c} width={handW} dealFrom={{ x: 100, y: -120 }} delay={i < 2 ? i * 0.15 : 0} dim={!!h && i >= h.stopAt} />
            </div>
          ))}
        </div>
        {h && (
          <motion.span
            key={`${v.total}-${h.status}`}
            initial={{ scale: 1.4 }}
            animate={{ scale: 1 }}
            className={`tabular rounded-full px-3 py-0.5 font-display text-xl font-bold ${
              v.bust ? "bg-lose text-ink" : v.total === 21 ? "bg-gold text-ink" : "bg-white text-ink"
            }`}
          >
            {v.bust ? `${v.total}✕` : h.status === "active" ? totalLabel(myCards) : v.total}
          </motion.span>
        )}
      </div>
      )}
    </div>
  );
}

/** One of the two hands after a split; the hand being played is highlighted. */
function SplitHandLine({ snap, hand, label }: { snap: PublicSnapshot; hand: NonNullable<PublicPlayer["hand"]>; label: string }) {
  const cards = rowOf(snap, hand.row);
  const mine = cards.slice(0, hand.stopAt);
  const v = handValue(mine);
  const w = 32;
  const step = cards.length <= 6 ? w + 4 : Math.max(20, (250 - w) / (cards.length - 1));
  const playing = hand.status === "active";
  return (
    <div className={`relative mt-1.5 flex items-center gap-3 rounded-2xl px-1 py-0.5 ${playing ? "bg-white/[.07] ring-1 ring-gold/50" : hand.status === "waiting" ? "opacity-60" : ""}`}>
      <span className="w-14 shrink-0 whitespace-nowrap text-[10px] font-bold tracking-[0.12em] text-accent uppercase">{label}</span>
      <div className="relative flex-1" style={{ height: w * 1.4 }}>
        {cards.map((c, i) => (
          <div key={`${snap.roundNo}-r${hand.row}-${i}`} className="absolute top-0" style={{ left: i * step }}>
            <PlayingCard card={c} width={w} dealFrom={i === 0 ? null : { x: 100, y: -120 }} dim={i >= hand.stopAt} />
          </div>
        ))}
      </div>
      {mine.length > 1 && (
        <span className={`tabular rounded-full px-2.5 py-0.5 font-display text-base font-bold ${v.bust ? "bg-lose text-ink" : v.total === 21 ? "bg-gold text-ink" : "bg-white text-ink"}`}>
          {v.bust ? `${v.total}✕` : playing ? totalLabel(mine) : v.total}
        </span>
      )}
    </div>
  );
}

function useCountdown(snap: PublicSnapshot) {
  const offset = useGame((s) => s.clockOffset);
  useNow(150);
  return timeLeft(snap, offset);
}

function ActionArea({ snap, me, player }: { snap: PublicSnapshot; me: PrivateView; player: PublicPlayer }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const h = player.hand;

  if (player.seat === null) {
    const pos = snap.rail.indexOf(player.id) + 1;
    return (
      <InfoCard icon="🪑" title={t("onRail")} body={pos > 0 ? t("railPos", { n: pos }) : t("nextRound")} />
    );
  }
  if (snap.phase === "lobby") return <InfoCard icon="⏳" title={t("waitingPlayers")} body={t("watchTv")} />;
  if (snap.phase === "bonus" && snap.bonus) return <BonusPanel snap={snap} player={player} />;
  if (snap.phase === "betting") {
    if (player.chips < snap.rules.minBet) return <InfoCard icon="🪙" title={t("brokeTitle")} body={t("brokeBody")} />;
    return <BetPanel snap={snap} me={me} player={player} />;
  }
  if (!h) return <InfoCard icon="👀" title={t("notInRound")} body={t("watchTv")} />;
  if (snap.phase === "deciding" && activeHand(player)) return <DecisionPanel snap={snap} me={me} player={player} />;
  if (snap.phase === "payout" && roundOutcome(player)) return <ResultCard player={player} />;

  const cards = rowOf(snap, h.row).slice(0, h.stopAt);
  const total = handValue(cards).total;
  let title = t("watchTv");
  const stake = h.bet + (player.hand2?.bet ?? 0);
  // After a split, the first hand is done and the second waits its turn.
  if (player.hand2?.status === "waiting" && h.status !== "active") {
    return <InfoCard icon="✌️" title={t("waitingHand2")} body={`${t("bet")} ${fmt(stake, lang)}`} />;
  }
  if (h.status === "busted") title = t("youBusted", { n: total });
  else if (h.status === "doubled") title = t("youDoubled", { n: total });
  else if (h.status === "blackjack") title = t("youBJ");
  else if (h.status === "stood") title = t("youStood", { n: total });
  else if (snap.phase === "drawing" && snap.lastStep) {
    const d = snap.lastStep.revealed[player.id];
    if (d) title = t("youChose", { x: t(d.toUpperCase() as "HIT") });
  }
  return <InfoCard icon={h.status === "busted" ? "💥" : "🃏"} title={title} body={`${t("bet")} ${fmt(stake, lang)}`} />;
}

function InfoCard({ icon, title, body }: { icon: string; title: string; body?: string }) {
  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-center"
    >
      <div className="text-5xl">{icon}</div>
      <div className="mt-3 font-display text-2xl font-bold">{title}</div>
      {body && <div className="mt-1 text-muted">{body}</div>}
    </motion.div>
  );
}

function BetPanel({ snap, me, player }: { snap: PublicSnapshot; me: PrivateView; player: PublicPlayer }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const send = useGame((s) => s.send);
  const left = useCountdown(snap);
  const [amount, setAmount] = useState(player.bet || 0);
  const locked = player.betLocked;
  const { minBet, maxBet } = snap.rules;
  const limit = Math.min(maxBet, player.chips);

  // Reset local bet at the start of each betting round.
  const round = useRef(snap.roundNo);
  useEffect(() => {
    if (round.current !== snap.roundNo) {
      round.current = snap.roundNo;
      setAmount(0);
    }
  }, [snap.roundNo]);

  const push = (v: number, lock = false) => {
    setAmount(v);
    send({ t: "bet", amount: v, lock });
  };
  const add = (v: number) => {
    if (locked) return;
    const next = Math.min(limit, amount + v);
    if (next === amount) {
      haptic([10, 40, 10]);
      return;
    }
    haptic(10);
    sfx.chip();
    push(next);
  };
  const canLock = amount >= minBet && amount <= limit;
  const repeat = me.lastBet > 0 && me.lastBet <= limit ? me.lastBet : 0;

  return (
    <div className="glass flex flex-1 flex-col rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.25em] text-white/50 uppercase">{t("placeBet")}</div>
          <div className="tabular text-xs text-white/40">
            {t("min")} {fmt(minBet, lang)} · {t("max")} {fmt(maxBet, lang)}
          </div>
        </div>
        {snap.deadline !== null && !snap.paused && (
          <CountdownRing remaining={left} total={snap.phaseMs} size={50} stroke={5}>
            <span>{Math.ceil(left / 1000)}</span>
          </CountdownRing>
        )}
      </div>

      <div className="my-4 flex flex-1 flex-col items-center justify-center">
        <motion.div
          key={amount}
          initial={{ scale: 1.15 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className={`tabular font-display text-6xl font-bold ${locked ? "gold-text" : ""}`}
        >
          {fmt(amount, lang)}
        </motion.div>
        <AnimatePresence mode="wait">
          {locked ? (
            <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 font-semibold text-gold">
              ✓ {t("betLocked")}
            </motion.div>
          ) : (
            <motion.div key="u" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 flex gap-2">
              <button className="btn-press rounded-full bg-white/8 px-4 py-1.5 text-sm font-bold text-white/80" onClick={() => push(0)} disabled={amount === 0}>
                {t("clear")}
              </button>
              {repeat > 0 && (
                <button className="btn-press rounded-full bg-white/8 px-4 py-1.5 text-sm font-bold text-white/80" onClick={() => push(repeat)}>
                  ↻ {t("repeat")} {fmt(repeat, lang)}
                </button>
              )}
              <button className="btn-press rounded-full bg-white/8 px-4 py-1.5 text-sm font-bold text-white/80" onClick={() => push(Math.max(minBet, Math.min(limit, amount * 2 || minBet)))}>
                ×2
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`grid grid-cols-4 gap-3 ${locked ? "pointer-events-none opacity-40" : ""}`}>
        {CHIP_VALUES.map((v) => (
          <motion.button
            key={v}
            whileTap={{ scale: 0.88, y: -6 }}
            onClick={() => add(v)}
            disabled={v > limit - amount && amount >= limit}
            className="grid place-items-center disabled:opacity-30"
            aria-label={`+${v}`}
          >
            <Chip value={v} size={68} />
          </motion.button>
        ))}
      </div>

      <button
        onClick={() => {
          haptic(locked ? 10 : [15, 30, 25]);
          if (!locked) sfx.lock();
          push(amount, !locked);
        }}
        disabled={!locked && !canLock}
        className={`btn-press mt-5 w-full rounded-2xl py-4 font-display text-xl font-bold disabled:opacity-35 ${
          locked ? "bg-white/10 text-white" : "text-ink"
        }`}
        style={locked ? undefined : { background: "linear-gradient(135deg, #ffe08a, #f5c451 55%, #d9a43a)" }}
      >
        {locked ? t("changeBet") : `${t("lockBet")} ✓`}
      </button>
    </div>
  );
}

function DecisionPanel({ snap, me, player }: { snap: PublicSnapshot; me: PrivateView; player: PublicPlayer }) {
  const t = useT();
  const send = useGame((s) => s.send);
  const left = useCountdown(snap);
  const pending = me.pending;
  const decide = (action: "hit" | "stand" | "double" | "split") => {
    haptic(action === "double" || action === "split" ? [20, 40, 20] : 18);
    sfx.lock();
    send({ t: "decide", action });
  };
  const risk = Math.round(me.bustChance * 100);
  const vibratedFor = useRef<string>("");
  useEffect(() => {
    const key = `${snap.roundNo}:${snap.step}`;
    if (vibratedFor.current !== key) {
      vibratedFor.current = key;
      haptic([30, 60, 30]);
    }
  }, [snap.roundNo, snap.step]);

  return (
    <div className="glass flex flex-1 flex-col rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div>
          {me.playing && <div className="text-xs font-bold tracking-[0.2em] text-accent uppercase">✌️ {t("playingHand", { n: me.playing })}</div>}
          <div className="font-display text-2xl font-bold">{t("phase_deciding")}</div>
          <div className="mt-0.5 text-sm text-muted">
            {t("bustRisk")}{" "}
            <span className={`tabular font-bold ${risk >= 60 ? "text-lose" : risk >= 30 ? "text-gold" : "text-win"}`}>{risk}%</span>
          </div>
        </div>
        {snap.deadline !== null && !snap.paused && (
          <CountdownRing remaining={left} total={snap.phaseMs} size={58} stroke={6}>
            <span className="text-lg">{Math.ceil(left / 1000)}</span>
          </CountdownRing>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <BigBtn active={pending === "hit"} dimmed={!!pending && pending !== "hit"} onClick={() => decide("hit")} color="hit" label={t("hit")} sub="+1" />
        <BigBtn active={pending === "stand"} dimmed={!!pending && pending !== "stand"} onClick={() => decide("stand")} color="stand" label={t("stand")} sub={`= ${activeHand(player)?.total ?? ""}`} />
        {me.canDouble && (
          <BigBtn
            active={pending === "double"}
            dimmed={!!pending && pending !== "double"}
            onClick={() => decide("double")}
            color="double"
            label={t("double")}
            sub="×2 · +1"
            wide={!me.canSplit}
          />
        )}
        {me.canSplit && (
          <BigBtn
            active={pending === "split"}
            dimmed={!!pending && pending !== "split"}
            onClick={() => decide("split")}
            color="split"
            label={t("split")}
            sub={t("splitHint")}
            wide={!me.canDouble}
          />
        )}
      </div>
      <div className="mt-3 h-5 text-center text-sm font-semibold text-gold">
        {pending ? `✓ ${t("youChose", { x: t(pending.toUpperCase() as "HIT") })} — ${t("waitOthers")}` : ""}
      </div>
    </div>
  );
}

function BigBtn({
  label,
  sub,
  onClick,
  color,
  active,
  dimmed,
  wide,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  color: "hit" | "stand" | "double" | "split";
  active: boolean;
  dimmed: boolean;
  wide?: boolean;
}) {
  const styles = {
    hit: { background: "linear-gradient(160deg, #7dd3fc, #0ea5e9)", color: "#04121b" },
    stand: { background: "linear-gradient(160deg, #ffffff, #d7dde5)", color: "#06080b" },
    double: { background: "linear-gradient(160deg, #a78bfa, #6d28d9)", color: "#ffffff" },
    split: { background: "linear-gradient(160deg, #fde68a, #f59e0b)", color: "#1a1204" },
  }[color];
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      animate={{ opacity: dimmed ? 0.35 : 1, scale: active ? 1.02 : 1 }}
      className={`relative flex flex-col items-center justify-center rounded-3xl ${wide ? "col-span-2 min-h-[64px]" : color === "double" || color === "split" ? "min-h-[72px]" : "min-h-[104px]"}`}
      style={{
        ...styles,
        boxShadow: active ? "0 0 0 4px #f5c451, 0 20px 40px -16px rgba(245,196,81,.6)" : "0 16px 32px -18px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.5)",
      }}
    >
      <span className="font-display text-3xl font-bold uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold opacity-60">{sub}</span>
      {active && <span className="absolute right-3 top-3 text-lg">✓</span>}
    </motion.button>
  );
}

function ResultCard({ player }: { player: PublicPlayer }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const h = player.hand!;
  const h2 = player.hand2;
  const net = (h.net ?? 0) + (h2?.net ?? 0);
  const outcome = roundOutcome(player)!;
  const cfg = {
    blackjack: { title: t("youBJ"), cls: "gold-text", bg: "rgba(245,196,81,.18)", icon: "🂡" },
    win: { title: t("youWin"), cls: "text-win", bg: "rgba(52,211,153,.15)", icon: "🎉" },
    push: { title: t("youPush"), cls: "text-push", bg: "rgba(147,197,253,.12)", icon: "🤝" },
    lose: { title: h.status === "busted" && !h2 ? t("BUST") : t("youLose"), cls: "text-lose", bg: "rgba(251,113,133,.12)", icon: h.status === "busted" && !h2 ? "💥" : "😬" },
  }[outcome];
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      className="flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-center ring-1 ring-white/10"
      style={{ background: cfg.bg }}
    >
      <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: "spring", delay: 0.1 }} className="text-6xl">
        {cfg.icon}
      </motion.div>
      <div className={`mt-3 font-display text-4xl font-bold ${cfg.cls}`}>{cfg.title}</div>
      <div className={`tabular mt-2 font-display text-5xl font-bold ${net > 0 ? "text-win" : net < 0 ? "text-lose" : "text-white/70"}`}>
        {net > 0 ? "+" : net < 0 ? "−" : ""}
        {fmt(Math.abs(net), lang)}
      </div>
      {h2 && (
        <div className="mt-3 flex gap-2">
          {[h, h2].map((x, i) => (
            <span key={i} className={`tabular rounded-full px-3 py-1 text-sm font-bold ${x.outcome === "win" ? "bg-win/20 text-win" : x.outcome === "push" ? "bg-push/20 text-push" : "bg-lose/20 text-lose"}`}>
              ✌️ {i + 1}: {x.total} · {(x.net ?? 0) > 0 ? "+" : (x.net ?? 0) < 0 ? "−" : ""}
              {fmt(Math.abs(x.net ?? 0), lang)}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 text-sm text-muted">{t("nextRound")}</div>
    </motion.div>
  );
}

function Reactions() {
  const send = useGame((s) => s.send);
  const [last, setLast] = useState(0);
  return (
    <div className="flex justify-between gap-1">
      {ALLOWED_REACTIONS.map((e) => (
        <motion.button
          key={e}
          whileTap={{ scale: 1.4, y: -8 }}
          onClick={() => {
            if (Date.now() - last < 1200) return;
            setLast(Date.now());
            haptic(8);
            send({ t: "react", emoji: e });
          }}
          className="grid h-11 flex-1 place-items-center rounded-2xl bg-white/5 text-2xl"
        >
          {e}
        </motion.button>
      ))}
    </div>
  );
}
