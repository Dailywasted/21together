import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import confetti from "canvas-confetti";
import { bustProbability, handValue, type Card, type PublicPlayer, type PublicSnapshot, type RoundResult } from "@21/engine";
import { MiniCard, PlayingCard } from "../components/PlayingCard";
import { ChipStack } from "../components/Chip";
import { Avatar, CountdownRing, CountUp, Logo, QR, signed, useNow } from "../components/ui";
import { fmt, useLang, useT, type TKey } from "../lib/i18n";
import { onReaction, onRoomEvent, timeLeft } from "../lib/store";
import { joinUrl } from "../lib/api";
import { sfx } from "../lib/sound";
import { seatBadge, TONE_CLASSES, TONE_RING, totalLabel, type SeatBadge } from "../lib/view";
import { useStageWidth } from "./Stage";
import { ChipFlights, GoldDust, LeaderWatch, Marquee, TensionGlow, stripGeometry, useMood, type Lag } from "./ArenaFx";

/**
 * "Big screen" view: the stadium-style display at the front of the room.
 * Huge dealer + shared cards in the middle, a row of seats at the bottom, crowd-wide celebrations.
 */

const TOP_H = 84;
const STRIP_H = 236;
const MAIN_H = 1080 - TOP_H - STRIP_H;
const SIDE_W = 360;
const DEALER_W = 150;
const SHARED_W = 176;

/** How long after a card lands its value is "revealed" (totals, busts, badges) — matches the flip animations. */
const REVEAL = { dealShared: 2700, dealDealer: 1700, draw: 2150, dealer: 1950 };

/**
 * Party pace (seconds). Cards land, sit face down for a beat of suspense, then turn.
 * Must stay in sync with REVEAL above and TIMING in the engine.
 */
const PACE = {
  deal: [0, 0.6, 1.2, 1.8] as const, // shared #1, dealer up, shared #2, dealer hole
  dealFlip: 0.35, // pause before a dealt card turns
  drawDelay: 0.1,
  drawFlip: 1.3, // face-down suspense on the next shared card
  dealerFlip: 1.2, // hole card and dealer draws
};

function useDelayed(value: number, ms: number): number {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (value <= v || ms <= 0) {
      setV(value);
      return;
    }
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
  return Math.min(v, value);
}

function useReveal(snap: PublicSnapshot): Lag {
  const sharedLen = snap.shared.length;
  const dealerVis = snap.dealer.filter(Boolean).length;
  const dealing = snap.phase === "dealing";
  const shared = useDelayed(sharedLen, dealing ? REVEAL.dealShared : REVEAL.draw);
  const dealer = useDelayed(dealerVis, dealing ? REVEAL.dealDealer : REVEAL.dealer);
  return { shared, dealer, pending: shared < sharedLen || dealer < dealerVis };
}

const isWin = (o: string | null | undefined) => o === "win" || o === "blackjack";

/** True once the dealer won't take another card (same rule as the engine). */
function dealerFinished(snap: PublicSnapshot, visible: Card[]): boolean {
  if (snap.phase === "payout") return true;
  if (snap.phase !== "dealer" || visible.length < 2) return false;
  if (snap.players.every((p) => !p.hand || p.hand.status === "busted")) return true;
  const v = handValue(visible);
  return v.total > 17 || (v.total === 17 && !(v.soft && snap.rules.dealerHitsSoft17));
}

export function Arena({ snap, offset }: { snap: PublicSnapshot; offset: number }) {
  const W = useStageWidth();
  const lag = useReveal(snap);
  const shake = useAnimationControls();
  const [tint, setTint] = useState<{ id: number; color: string } | null>(null);
  useArenaSounds(snap);
  const mood = useMood(snap);

  const jolt = useCallback(
    (color: string, hard = false) => {
      setTint({ id: Date.now(), color });
      void shake.start({
        x: hard ? [0, -14, 12, -9, 7, -4, 0] : [0, -6, 5, -3, 0],
        transition: { duration: hard ? 0.55 : 0.4 },
      });
    },
    [shake],
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Backdrop />
      <GoldDust />
      <Marquee width={W} mood={mood} />
      <TensionGlow snap={snap} lag={lag} />
      <AnimatePresence>
        {tint && (
          <motion.div
            key={tint.id}
            className="pointer-events-none absolute inset-0 z-[5]"
            style={{ background: `radial-gradient(ellipse at 50% 45%, ${tint.color}, transparent 70%)` }}
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            onAnimationComplete={() => setTint(null)}
          />
        )}
      </AnimatePresence>
      <motion.div className="absolute inset-0" animate={shake}>
        <TopBar snap={snap} />
        <div className="absolute left-0 right-0 flex" style={{ top: TOP_H, height: MAIN_H }}>
          <LeftPanel snap={snap} />
          <Center snap={snap} lag={lag} width={W - SIDE_W * 2} />
          <RightPanel snap={snap} offset={offset} lag={lag} />
        </div>
        <PlayerStrip snap={snap} lag={lag} width={W} />
      </motion.div>
      <Announcer snap={snap} lag={lag} jolt={jolt} />
      <ChipFlights snap={snap} width={W} />
      <Celebration snap={snap} />
      <LeaderWatch snap={snap} />
    </div>
  );
}

// ───────────────────────── background ─────────────────────────

function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 90% 75% at 50% 8%, #0f2c22 0%, #071110 48%, #030506 100%)" }}
      />
      <div className="beam" style={{ left: "16%" }} />
      <div className="beam beam-b" style={{ right: "16%" }} />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: 520, background: "radial-gradient(ellipse 55% 100% at 50% 100%, rgba(18,130,90,.32), transparent 70%)" }}
      />
      {/* center spotlight on the cards */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: 40, width: 1400, height: 760, background: "radial-gradient(ellipse at 50% 45%, rgba(255,240,200,.07), transparent 65%)" }}
      />
      <div className="grain absolute inset-0" />
      {/* screen frame */}
      <div className="absolute inset-[10px] rounded-[28px]" style={{ boxShadow: "inset 0 0 0 1px rgba(245,196,81,.14), inset 0 0 80px rgba(0,0,0,.6)" }} />
    </div>
  );
}

// ───────────────────────── top bar ─────────────────────────

function TopBar({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const r = snap.rules;
  const frac = snap.shoe.total ? snap.shoe.remaining / snap.shoe.total : 0;
  return (
    <div className="absolute inset-x-0 top-0 flex items-center justify-between px-10" style={{ height: TOP_H }}>
      <div className="flex items-center gap-6" style={{ width: SIDE_W }}>
        <Logo size={26} />
      </div>
      <div className="flex items-center gap-4 text-[15px] font-bold tracking-[0.22em] text-white/45 uppercase">
        {snap.roundNo > 0 && <span className="tabular text-gold/90">{t("round_n", { n: snap.roundNo })}</span>}
        <span className="h-1 w-1 rounded-full bg-white/25" />
        <span>{t(r.blackjackPayout === 1.5 ? "feltPays32" : "feltPays65")}</span>
        <span className="h-1 w-1 rounded-full bg-white/25" />
        <span>{t(r.dealerHitsSoft17 ? "feltH17" : "feltS17")}</span>
        <span className="h-1 w-1 rounded-full bg-white/25" />
        <span className="tabular">
          {fmt(r.minBet, lang)}–{fmt(r.maxBet, lang)}
        </span>
      </div>
      <div className="flex items-center justify-end gap-4" style={{ width: SIDE_W }}>
        <div className="w-[110px]">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gold/70" style={{ width: `${frac * 100}%`, transition: "width .6s" }} />
          </div>
          <div className="mt-1 text-center text-[11px] font-semibold tracking-widest text-white/35 uppercase">{t("shoe")}</div>
        </div>
        <div className="rounded-xl bg-white/[.06] px-3 py-1.5 ring-1 ring-white/10">
          <span className="mr-2 text-xs font-bold tracking-[0.2em] text-white/45 uppercase">{t("code")}</span>
          <span className="font-display text-2xl font-bold tracking-[0.16em] text-gold">{snap.code}</span>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── center: dealer + shared hand ─────────────────────────

function rowStep(n: number, cardW: number, maxW: number): number {
  if (n <= 1) return 0;
  return Math.min(cardW + 22, (maxW - cardW) / (n - 1));
}

function TotalBadge({ cards, final, label }: { cards: Card[]; final: boolean; label: string }) {
  const t = useT();
  if (cards.length === 0) return null;
  const v = handValue(cards);
  const text = final ? String(v.total) : totalLabel(cards);
  const cls = v.bust
    ? "bg-lose text-ink shadow-[0_0_40px_rgba(251,113,133,.55)]"
    : v.blackjack || v.total === 21
      ? "bg-gold text-ink shadow-[0_0_44px_rgba(245,196,81,.6)]"
      : "bg-white/[.08] text-white ring-2 ring-white/15";
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[13px] font-bold tracking-[0.3em] text-white/45 uppercase">{label}</span>
      <motion.div
        key={text + v.bust}
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18 }}
        className={`tabular grid h-[104px] min-w-[104px] place-items-center rounded-full px-5 font-display text-[50px] font-bold leading-none ${cls}`}
      >
        {text}
      </motion.div>
      <span className={`h-5 text-sm font-extrabold tracking-[0.2em] uppercase ${v.bust ? "text-lose" : "text-gold"}`}>
        {v.bust ? t("BUST") : v.blackjack ? t("BJ") : ""}
      </span>
    </div>
  );
}

function Center({ snap, lag, width }: { snap: PublicSnapshot; lag: Lag; width: number }) {
  const t = useT();
  const rowMax = width - 2 * 200;
  const dealing = snap.phase === "dealing";

  // Dealer row
  const dealerCards = snap.dealer;
  const dealerVisible = dealerCards.filter((c): c is Card => !!c).slice(0, lag.dealer);
  const dealerDone = !lag.pending && dealerFinished(snap, dealerVisible);
  const dStep = rowStep(dealerCards.length, DEALER_W, rowMax);
  const dWidth = (dealerCards.length - 1) * dStep + DEALER_W;

  // Shared row
  const shared = snap.shared;
  const sharedShown = shared.slice(0, lag.shared);
  const sStep = rowStep(shared.length, SHARED_W, rowMax);
  const sWidth = (shared.length - 1) * sStep + SHARED_W;
  const newCard = snap.phase === "drawing" && snap.lastStep?.card ? shared.length - 1 : -1;
  const anyActive = snap.players.some((p) => p.hand?.status === "active");

  if (snap.phase === "betting" || (snap.phase !== "lobby" && snap.phase !== "ended" && shared.length === 0)) {
    return (
      <div className="relative flex-1">
        <BettingHero snap={snap} />
      </div>
    );
  }
  return (
    <div className="relative flex-1">
      {/* dealer */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-10" style={{ top: 14 }}>
        <div className="w-[150px]">
          <TotalBadge cards={dealerVisible} final={dealerDone} label={t("dealer")} />
        </div>
        <div className="relative" style={{ width: Math.max(dWidth, DEALER_W), height: DEALER_W * 1.4 }}>
          {dealerCards.map((c, i) => (
            <div key={`${snap.roundNo}-d${i}`} className="absolute top-0" style={{ left: i * dStep }}>
              <PlayingCard
                card={c}
                width={DEALER_W}
                dealFrom={{ x: 520 - i * dStep, y: -260 }}
                delay={dealing ? (i === 0 ? PACE.deal[1] : PACE.deal[3]) : 0}
                flipDelay={dealing ? PACE.dealFlip : PACE.dealerFlip}
              />
            </div>
          ))}
        </div>
        <div className="w-[150px]" />
      </div>

      {/* phase line */}
      <div className="absolute left-0 right-0 flex justify-center" style={{ top: 246 }}>
        <PhaseLine snap={snap} lag={lag} />
      </div>

      {/* shared hand */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-start gap-10" style={{ top: 372 }}>
        <div className="w-[150px] pt-10">
          <TotalBadge cards={sharedShown} final={!anyActive} label={t("sharedRow")} />
        </div>
        <div className="relative" style={{ width: Math.max(sWidth, SHARED_W), height: SHARED_W * 1.4 + 120 }}>
          {shared.map((c, i) => (
            <div key={`${snap.roundNo}-s${i}`} className="absolute top-0" style={{ left: i * sStep }}>
              <PlayingCard
                card={c}
                width={SHARED_W}
                dealFrom={{ x: 520 - i * sStep, y: -620 }}
                delay={dealing ? (i === 0 ? PACE.deal[0] : i === 1 ? PACE.deal[2] : 0) : PACE.drawDelay}
                flipDelay={dealing ? PACE.dealFlip : PACE.drawFlip}
                glow={i === newCard && !lag.pending ? "gold" : null}
              />
            </div>
          ))}
          <StopMarkers snap={snap} lag={lag} step={sStep} />
        </div>
        <div className="w-[150px]" />
      </div>
    </div>
  );
}

type Kind = "active" | "stood" | "doubled" | "busted" | "blackjack";

function StopMarkers({ snap, lag, step }: { snap: PublicSnapshot; lag: Lag; step: number }) {
  const t = useT();
  const groups = new Map<number, Map<Kind, PublicPlayer[]>>();
  for (const p of snap.players) {
    const h = p.hand;
    if (!h) continue;
    const kind = h.status as Kind;
    if (!groups.has(h.stopAt)) groups.set(h.stopAt, new Map());
    const g = groups.get(h.stopAt)!;
    if (!g.has(kind)) g.set(kind, []);
    g.get(kind)!.push(p);
  }
  return (
    <>
      {[...groups.entries()].map(([stopAt, kinds]) => {
        const hidden = stopAt > lag.shared;
        const cards = snap.shared.slice(0, stopAt);
        const v = handValue(cards);
        return (
          <motion.div
            key={`m${stopAt}`}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute flex -translate-x-1/2 items-start gap-3"
            style={{ left: (stopAt - 1) * step + SHARED_W / 2, top: SHARED_W * 1.4 + 16 }}
          >
            {[...kinds.entries()].map(([kind, ps]) => {
              let k: Kind = kind;
              if (hidden && (kind === "busted" || kind === "doubled")) k = kind === "busted" ? "active" : "doubled";
              const label =
                hidden ? "?" :
                k === "active" ? t("stillIn", { n: ps.length }) :
                k === "busted" ? `${t("BUST")} ${v.total}` :
                k === "blackjack" ? t("BJ") :
                k === "doubled" ? `${t("DOUBLE")} ${v.total}` :
                `${t("STAND")} ${v.total}`;
              const tone =
                hidden ? "bg-white/15 text-white" :
                k === "busted" ? "bg-lose text-ink" :
                k === "blackjack" ? "bg-gold text-ink" :
                k === "active" ? "bg-white text-ink" :
                k === "doubled" ? "bg-accent text-white" : "bg-black/60 text-white ring-1 ring-white/20";
              const shown = ps.slice(0, 5);
              return (
                <div key={kind} className="flex flex-col items-center gap-1.5">
                  <div className="flex items-center">
                    {shown.map((p, i) => (
                      <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -14, opacity: k === "busted" ? 0.5 : 1 }}>
                        <Avatar emoji={p.avatar} seed={p.id} size={42} ring={k === "active" ? "#ffffff" : undefined} />
                      </div>
                    ))}
                    {ps.length > shown.length && <span className="ml-1.5 text-base font-bold text-white/70">+{ps.length - shown.length}</span>}
                  </div>
                  <span className={`tabular whitespace-nowrap rounded-full px-3 py-0.5 text-[15px] font-extrabold tracking-wide ${tone}`}>{label}</span>
                </div>
              );
            })}
          </motion.div>
        );
      })}
    </>
  );
}

function PhaseLine({ snap, lag }: { snap: PublicSnapshot; lag: Lag }) {
  const t = useT();
  let title: string = t(`phase_${snap.phase}` as TKey);
  let sub: string | null = null;
  let cls = "text-white";
  const active = snap.players.filter((p) => p.hand?.status === "active");
  const inHand = snap.players.filter((p) => p.hand);
  switch (snap.phase) {
    case "dealing":
      title = "";
      break;
    case "deciding":
      title = t("phase_deciding");
      sub = t("choicesHidden");
      cls = "gold-text";
      break;
    case "drawing": {
      const revealed = snap.lastStep?.revealed ?? {};
      const hits = Object.values(revealed).filter((d) => d !== "stand").length;
      const stands = Object.values(revealed).filter((d) => d === "stand").length;
      title = snap.lastStep?.card ? `${t("hitters", { n: hits })} · ${t("standers", { n: stands })}` : t("everyoneStands");
      cls = "text-white";
      break;
    }
    case "dealer": {
      const vis = snap.dealer.filter((c): c is Card => !!c).slice(0, lag.dealer);
      const v = handValue(vis);
      const allShown = !lag.pending && dealerFinished(snap, vis);
      if (vis.length >= 2 && v.bust) {
        title = t("dealerBusts");
        cls = "text-win";
      } else if (allShown && vis.length >= 2 && v.blackjack) {
        title = t("dealerBlackjack");
        cls = "text-lose";
      } else if (allShown && vis.length >= 2) {
        title = t("dealerStandsOn", { n: v.total });
      } else if (vis.length >= 2) {
        title = t("dealerDraws");
      }
      break;
    }
    case "payout": {
      const winners = inHand.filter((p) => isWin(p.hand?.outcome)).length;
      title = t("winnersOf", { n: winners, m: inHand.length });
      cls = winners > 0 ? "text-win" : "text-lose";
      break;
    }
  }
  if (snap.paused) {
    title = `⏸ ${t("paused")}`;
    sub = null;
    cls = "text-white";
  }
  void active;
  if (!title) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={title}
        initial={{ opacity: 0, y: 14, scale: 0.94, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -12, scale: 0.98, filter: "blur(6px)" }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center"
      >
        <span className={`whitespace-nowrap font-display text-[56px] font-bold leading-none ${cls}`}>{title}</span>
        {sub && <span className="mt-2 text-lg font-semibold text-white/45">{sub}</span>}
      </motion.div>
    </AnimatePresence>
  );
}

function BettingHero({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const seated = snap.players.filter((p) => p.seat !== null);
  const total = seated.reduce((a, p) => a + p.bet, 0);
  const locked = seated.filter((p) => p.betLocked).length;
  const allIn = seated.length > 0 && locked === seated.length;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pb-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative text-center"
      >
        <div className="font-display text-[132px] font-bold leading-[0.9] tracking-tight gold-text drop-shadow-[0_12px_50px_rgba(245,196,81,.35)]">
          {snap.paused ? `⏸ ${t("paused")}` : t("phase_betting")}
        </div>
        <div className={`mt-5 text-2xl font-bold tracking-[0.25em] uppercase ${allIn ? "text-win" : "text-white/50"}`}>
          {seated.length === 0 ? t("waitingPlayers") : allIn ? `✓ ${t("allBetsIn")}` : t("betsOpen")}
        </div>
      </motion.div>
      <div className="mt-14 flex items-center gap-8">
        <div className="flex items-end gap-2" style={{ filter: "drop-shadow(0 12px 18px rgba(0,0,0,.5))" }}>
          {[10, 25, 100, 500].map((v, i) => (
            <motion.div
              key={v}
              initial={{ y: -40, opacity: 0, rotate: -25 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.15 + i * 0.08, type: "spring", stiffness: 260, damping: 14 }}
            >
              <ChipStack amount={v * (4 - i)} size={70} />
            </motion.div>
          ))}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold tracking-[0.3em] text-white/45 uppercase">{t("onTheTable")}</span>
          <CountUp value={total} format={(n) => fmt(n, lang)} className="tabular font-display text-[76px] font-bold leading-none text-white" />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── side panels ─────────────────────────

function Panel({ children, className = "", pad = "p-5" }: { children: ReactNode; className?: string; pad?: string }) {
  return <section className={`glass rounded-3xl ${pad} ${className}`}>{children}</section>;
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-xs font-bold tracking-[0.28em] text-white/45 uppercase">{children}</h2>;
}

function LeftPanel({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const f = (n: number) => fmt(n, lang);
  const board = snap.leaderboard.slice(0, 7);
  const last = snap.history[0];
  return (
    <aside className="flex shrink-0 flex-col gap-4 py-2 pl-8 pr-2" style={{ width: SIDE_W }}>
      <Panel className="min-h-0 flex-1">
        <PanelTitle>
          {t("leaderboard")} <span className="text-gold">· {t("thisNight")}</span>
        </PanelTitle>
        <ol className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {board.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 34 }}
                className={`flex items-center gap-3 rounded-2xl px-2 py-1.5 ${i === 0 ? "bg-gold/12 ring-1 ring-gold/40" : ""}`}
              >
                <span className={`tabular w-6 text-center font-display text-lg font-bold ${i === 0 ? "text-gold" : i < 3 ? "text-white/80" : "text-white/35"}`}>
                  {i === 0 ? "👑" : i + 1}
                </span>
                <Avatar emoji={p.avatar} seed={p.id} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 truncate text-[16px] font-bold leading-tight">
                    <span className="truncate">{p.name}</span>
                    {p.streak >= 3 && <span className="flame text-xs">🔥</span>}
                  </div>
                  <div className="tabular text-[13px] text-white/45">{f(p.chips)}</div>
                </div>
                <span className={`tabular text-[15px] font-bold ${p.net > 0 ? "text-win" : p.net < 0 ? "text-lose" : "text-white/40"}`}>
                  {signed(p.net, f)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {board.length === 0 && <li className="py-6 text-center text-sm text-white/35">{t("waitingPlayers")}</li>}
        </ol>
      </Panel>
      {last && (
        <Panel className="shrink-0">
          <PanelTitle>
            {t("lastHand")} · #{last.no}
          </PanelTitle>
          <div className="flex items-center gap-1">
            {last.shared.slice(0, 6).map((c, i) => (
              <MiniCard key={i} card={c} width={30} />
            ))}
            <span className="mx-1.5 text-[11px] font-bold text-white/30 uppercase">{t("vs")}</span>
            {last.dealer.slice(0, 5).map((c, i) => (
              <MiniCard key={`d${i}`} card={c} width={24} />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[13px] font-semibold text-white/50">
            <span>
              {t("dealer")} <span className="tabular text-white/85">{last.dealerTotal > 21 ? t("BUST") : last.dealerTotal}</span>
            </span>
            <span className="tabular text-win">
              {t("winnersOf", { n: last.results.filter((r) => isWin(r.outcome)).length, m: last.results.length })}
            </span>
          </div>
        </Panel>
      )}
    </aside>
  );
}

function RightPanel({ snap, offset, lag }: { snap: PublicSnapshot; offset: number; lag: Lag }) {
  const t = useT();
  useNow(100);
  const left = timeLeft(snap, offset);
  const seated = snap.players.filter((p) => p.seat !== null);
  const active = snap.players.filter((p) => p.hand?.status === "active");
  const inHand = snap.players.filter((p) => p.hand);
  // Busts count only once the card has turned.
  const alive = lag.pending ? inHand.length - inHand.filter((p) => p.hand!.stopAt <= lag.shared && p.hand!.status === "busted").length : inHand.filter((p) => p.hand!.status !== "busted").length;
  const timed = snap.deadline !== null && !snap.paused && (snap.phase === "betting" || snap.phase === "deciding");

  let n = 0;
  let m = 0;
  let caption = "";
  if (snap.phase === "betting") {
    n = seated.filter((p) => p.betLocked).length;
    m = seated.length;
    caption = m > 0 && n === m ? `✓ ${t("allBetsIn")}` : t("lockedIn", { n, m });
  } else if (snap.phase === "deciding") {
    n = active.filter((p) => p.hand!.locked).length;
    m = active.length;
    caption = m > 0 && n === m ? `✓ ${t("allDecided")}` : t("lockedIn", { n, m });
  }
  const sharedShown = snap.shared.slice(0, lag.shared);
  const risk = snap.phase === "deciding" && active.length ? bustProbability(sharedShown) : null;
  const revealed = snap.phase === "drawing" ? snap.lastStep?.revealed ?? {} : null;

  return (
    <aside className="flex shrink-0 flex-col gap-4 py-2 pl-2 pr-8" style={{ width: SIDE_W }}>
      <Panel className="flex min-h-[290px] flex-1 flex-col items-center justify-center text-center">
        {(snap.phase === "betting" || snap.phase === "deciding") && m > 0 ? (
          <>
            {timed ? (
              <CountdownRing remaining={left} total={snap.phaseMs} size={200} stroke={12}>
                <span className="text-[84px] leading-none">{Math.ceil(left / 1000)}</span>
              </CountdownRing>
            ) : (
              <CountdownRing remaining={n} total={m} size={200} stroke={12} progress>
                <span className="text-[64px] leading-none">
                  {n}
                  <span className="text-white/35">/{m}</span>
                </span>
              </CountdownRing>
            )}
            <div className={`mt-4 text-lg font-bold ${m > 0 && n === m ? "text-win" : "text-white/60"}`}>{caption}</div>
            {snap.phase === "deciding" && !timed && <div className="mt-1 text-sm font-semibold text-white/35">{t("makeYourChoice")}</div>}
          </>
        ) : revealed ? (
          <div className="flex w-full justify-around">
            <Tally label={t("HIT")} tone="text-[#38bdf8]" ids={Object.keys(revealed).filter((id) => revealed[id] !== "stand")} snap={snap} />
            <Tally label={t("STAND")} tone="text-white" ids={Object.keys(revealed).filter((id) => revealed[id] === "stand")} snap={snap} />
          </div>
        ) : snap.phase === "payout" ? (
          <PayoutTally snap={snap} />
        ) : (
          <div className="flex flex-col items-center gap-3">
            <span className="font-display text-[96px] font-bold leading-none text-white/90">
              {alive}
              <span className="text-white/30">/{inHand.length}</span>
            </span>
            <span className="text-sm font-bold tracking-[0.25em] text-white/45 uppercase">{t("inPlay")}</span>
          </div>
        )}
      </Panel>
      {risk !== null && (
        <Panel className="shrink-0">
          <PanelTitle>{t("bustOnHit")}</PanelTitle>
          <div className="flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full"
                style={{ background: risk > 0.5 ? "#fb7185" : risk > 0.25 ? "#f5c451" : "#34d399" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(risk * 100)}%` }}
              />
            </div>
            <span className="tabular w-16 text-right font-display text-3xl font-bold">{Math.round(risk * 100)}%</span>
          </div>
        </Panel>
      )}
      <Panel className="flex shrink-0 items-center gap-4" pad="p-4">
        <div className="shrink-0 -m-[34px] scale-[.5]">
          <QR text={joinUrl(snap.code)} size={150} />
        </div>
        <div className="min-w-0 pl-1">
          <div className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase">{t("scanToJoin")}</div>
          <div className="font-display text-[40px] font-bold leading-none tracking-[0.14em] text-gold">{snap.code}</div>
          <div className="tabular mt-1 text-xs text-white/40">
            {t("playersJoined", { n: snap.players.length })}
            {snap.rail.length > 0 ? ` · ${snap.rail.length} ${t("rail").toLowerCase()}` : ""}
          </div>
        </div>
      </Panel>
    </aside>
  );
}

function Tally({ label, tone, ids, snap }: { label: string; tone: string; ids: string[]; snap: PublicSnapshot }) {
  const ps = ids.map((id) => snap.players.find((p) => p.id === id)).filter((p): p is PublicPlayer => !!p);
  return (
    <div className="flex flex-col items-center">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 16 }}
        className={`font-display text-[96px] font-bold leading-none ${tone}`}
      >
        {ps.length}
      </motion.span>
      <span className={`mt-1 text-lg font-extrabold tracking-[0.25em] ${tone}`}>{label}</span>
      <div className="mt-3 flex max-w-[140px] flex-wrap justify-center gap-1">
        {ps.slice(0, 8).map((p, i) => (
          <motion.div key={p.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1 + i * 0.05 }}>
            <Avatar emoji={p.avatar} seed={p.id} size={28} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function PayoutTally({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const inHand = snap.players.filter((p) => p.hand?.outcome);
  const w = inHand.filter((p) => isWin(p.hand!.outcome)).length;
  const pu = inHand.filter((p) => p.hand!.outcome === "push").length;
  const l = inHand.length - w - pu;
  return (
    <div className="flex w-full justify-around">
      {[
        { n: w, label: t("WIN"), c: "text-win" },
        { n: pu, label: t("PUSH"), c: "text-push" },
        { n: l, label: t("LOSE"), c: "text-lose" },
      ].map((x, i) => (
        <motion.div
          key={x.label}
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 * i }}
          className="flex flex-col items-center"
        >
          <span className={`font-display text-[76px] font-bold leading-none ${x.c}`}>{x.n}</span>
          <span className={`mt-1 text-sm font-extrabold tracking-[0.2em] ${x.c}`}>{x.label}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ───────────────────────── seats strip ─────────────────────────

interface Floater {
  id: number;
  playerId: string;
  emoji: string;
  dx: number;
}

function PlayerStrip({ snap, lag, width }: { snap: PublicSnapshot; lag: Lag; width: number }) {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  useEffect(
    () =>
      onReaction((playerId, emoji) => {
        const f = { id: Date.now() + Math.random(), playerId, emoji, dx: Math.random() * 50 - 25 };
        setFloaters((fs) => [...fs.slice(-24), f]);
        setTimeout(() => setFloaters((fs) => fs.filter((x) => x.id !== f.id)), 2300);
      }),
    [],
  );
  const gap = 12;
  const { tileW } = stripGeometry(width, snap.seats.length);
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-5" style={{ height: STRIP_H, gap }}>
      {snap.seats.map((id, i) => {
        const p = id ? byId.get(id) : undefined;
        return p ? (
          <SeatTile key={p.id} p={p} snap={snap} lag={lag} w={tileW} floaters={floaters.filter((f) => f.playerId === p.id)} />
        ) : (
          <div
            key={`e${i}`}
            className="grid shrink-0 place-items-center rounded-3xl border-2 border-dashed border-white/[.07]"
            style={{ width: tileW, height: 196 }}
          >
            <span className="font-display text-2xl font-bold text-white/12">{i + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function tileBadge(p: PublicPlayer, snap: PublicSnapshot, lag: Lag): SeatBadge | null {
  const h = p.hand;
  // Don't spoil a bust before the card has turned.
  if (h && lag.pending && snap.phase === "drawing" && (h.status === "busted" || h.status === "doubled")) {
    const d = snap.lastStep?.revealed[p.id];
    return d === "double" ? { key: "DOUBLE", tone: "accent" } : { key: "HIT", tone: "hit" };
  }
  return seatBadge(p, snap);
}

function SeatTile({ p, snap, lag, w, floaters }: { p: PublicPlayer; snap: PublicSnapshot; lag: Lag; w: number; floaters: Floater[] }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const h = p.hand;
  const badge = tileBadge(p, snap, lag);
  const outcome = snap.phase === "payout" ? h?.outcome : null;
  const won = isWin(outcome);
  const lost = outcome === "lose";
  const stake = h ? h.bet : p.bet;
  const totalHidden = h ? h.stopAt > lag.shared : true;
  const ring = badge ? TONE_RING[badge.tone] : undefined;
  const frame = won
    ? outcome === "blackjack"
      ? "ring-2 ring-gold bg-gold/15 shadow-[0_0_50px_-6px_rgba(245,196,81,.7)]"
      : "ring-2 ring-win bg-win/12 shadow-[0_0_46px_-8px_rgba(52,211,153,.75)]"
    : outcome === "push"
      ? "ring-1 ring-push/60 bg-push/8"
      : p.streak >= 3 && !lost
        ? "tile-fire bg-[#ff7a1a]/[.08]"
        : "ring-1 ring-white/10 bg-white/[.045]";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 40, scale: 0.8 }}
      animate={{ opacity: lost ? 0.5 : 1, y: won ? [0, -22, 0] : 0, scale: 1 }}
      transition={won ? { y: { duration: 0.6, delay: 0.2 }, default: { type: "spring", stiffness: 260, damping: 20 } } : { type: "spring", stiffness: 260, damping: 20 }}
      className={`relative flex shrink-0 flex-col items-center rounded-3xl px-2 pb-3 pt-3 backdrop-blur ${frame}`}
      style={{ width: w, height: 196 }}
    >
      {/* stake */}
      <div className="flex h-[26px] items-center gap-1.5">
        <AnimatePresence>
          {stake > 0 && (
            <motion.div
              key={`${snap.roundNo}-${stake}`}
              initial={{ y: -16, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="flex items-center gap-1.5"
            >
              <ChipStack amount={stake} size={20} />
              <span className="tabular text-[15px] font-bold text-gold">{fmt(stake, lang)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="relative mt-1.5">
        <div className={badge?.pulse ? "rounded-full pulse-ring" : ""} style={{ filter: p.connected ? undefined : "grayscale(1) brightness(.6)" }}>
          <Avatar emoji={p.avatar} seed={p.id} size={Math.min(72, w * 0.5)} ring={ring} />
        </div>
        {p.streak >= 3 && <span className="flame absolute -left-2 -top-2 text-xl">🔥</span>}
        {h && h.status !== "busted" && !totalHidden && (
          <span className="tabular absolute -right-4 -top-1 rounded-full bg-white px-2 py-px font-display text-[15px] font-bold text-ink shadow">
            {h.total}
          </span>
        )}
        {!p.connected && <span className="absolute -right-1 bottom-0 text-sm">📵</span>}
        <AnimatePresence>
          {floaters.map((f) => (
            <motion.span
              key={f.id}
              className="pointer-events-none absolute left-1/2 top-0 text-5xl"
              initial={{ y: 0, x: "-50%", opacity: 0, scale: 0.5 }}
              animate={{ y: -190, x: `calc(-50% + ${f.dx}px)`, opacity: [0, 1, 1, 0], scale: [0.5, 1.3, 1.1, 1] }}
              transition={{ duration: 2.1, ease: "easeOut" }}
            >
              {f.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="mt-2 w-full truncate text-center text-[17px] font-bold leading-tight">{p.name}</div>
      <div className="tabular text-[13px] font-semibold text-white/45">{fmt(p.chips, lang)}</div>
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
        <AnimatePresence mode="popLayout">
          {badge && (
            <motion.div
              key={`${badge.key}-${badge.text}`}
              initial={{ scale: 0.3, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
              className={`tabular whitespace-nowrap rounded-full px-3 py-1 text-[14px] font-extrabold tracking-wide shadow-[0_6px_16px_rgba(0,0,0,.5)] ${TONE_CLASSES[badge.tone]} ${badge.pulse ? "animate-pulse" : ""}`}
            >
              {badge.key ? t(badge.key) : ""}
              {badge.text && badge.key ? " " : ""}
              {badge.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ───────────────────────── announcer ─────────────────────────

interface Shout {
  id: number;
  text: string;
  tone: "gold" | "win" | "lose" | "white";
  size?: number;
}

const SHOUT_CLS: Record<Shout["tone"], string> = {
  gold: "gold-text drop-shadow-[0_10px_50px_rgba(245,196,81,.55)]",
  win: "text-win drop-shadow-[0_10px_50px_rgba(52,211,153,.6)]",
  lose: "text-lose drop-shadow-[0_10px_50px_rgba(251,113,133,.6)]",
  white: "text-white drop-shadow-[0_10px_40px_rgba(0,0,0,.8)]",
};

/** Big transient call-outs: "No more bets!", "BUST", "21!", "Dealer busts!" — with sound and screen jolts. */
function Announcer({ snap, lag, jolt }: { snap: PublicSnapshot; lag: Lag; jolt: (color: string, hard?: boolean) => void }) {
  const t = useT();
  const [shout, setShout] = useState<Shout | null>(null);
  const say = (s: Omit<Shout, "id">) => setShout({ ...s, id: Date.now() + Math.random() });
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.k === "deal") say({ text: t("noMoreBets"), tone: "white", size: 110 });
      }),
    [t],
  );

  // Shared card turned.
  const prevShared = useRef(lag.shared);
  useEffect(() => {
    const s = snapRef.current;
    const before = prevShared.current;
    prevShared.current = lag.shared;
    if (lag.shared <= before || lag.shared === 0) return;
    const cards = s.shared.slice(0, lag.shared);
    const v = handValue(cards);
    if (s.phase === "dealing" || (lag.shared === 2 && before < 2)) {
      if (v.blackjack) {
        sfx.blackjack();
        say({ text: t("BJ"), tone: "gold", size: 150 });
        jolt("rgba(245,196,81,.35)");
      }
      return;
    }
    const takers = s.lastStep?.takers.length ?? 0;
    if (v.bust) {
      sfx.bust();
      say({ text: takers > 1 ? `${t("BUST")} ×${takers}` : t("BUST"), tone: "lose", size: 150 });
      jolt("rgba(251,113,133,.35)", true);
    } else if (v.total === 21) {
      sfx.win();
      say({ text: "21!", tone: "gold", size: 170 });
      jolt("rgba(245,196,81,.3)");
    }
  }, [lag.shared, t, jolt]);

  // Dealer card turned.
  const prevDealer = useRef(lag.dealer);
  useEffect(() => {
    const s = snapRef.current;
    const before = prevDealer.current;
    prevDealer.current = lag.dealer;
    if (lag.dealer <= before || lag.dealer < 2 || (s.phase !== "dealer" && s.phase !== "payout")) return;
    const v = handValue(s.dealer.filter((c): c is Card => !!c).slice(0, lag.dealer));
    if (v.bust) {
      sfx.bust();
      sfx.cheer(0.9, 0.15);
      say({ text: t("dealerBusts"), tone: "win", size: 130 });
      jolt("rgba(52,211,153,.35)", true);
    } else if (v.blackjack) {
      say({ text: t("dealerBlackjack"), tone: "lose", size: 110 });
      jolt("rgba(251,113,133,.3)", true);
    }
  }, [lag.dealer, t, jolt]);

  return (
    <div className="pointer-events-none absolute inset-x-0 z-30 flex h-[130px] items-center justify-center" style={{ top: TOP_H + 232 }}>
      <AnimatePresence>
        {shout && (
          <motion.div
            key={shout.id}
            initial={{ scale: 0.3, opacity: 0, rotate: -4 }}
            animate={{ scale: [0.3, 1.12, 1], opacity: 1, rotate: 0 }}
            exit={{ scale: 1.25, opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onAnimationComplete={() => setTimeout(() => setShout((x) => (x?.id === shout.id ? null : x)), 1700)}
            className="rounded-[60px] px-16 py-3"
            // Dark halo so the phase line underneath never reads through the call-out.
            style={{ backgroundColor: "rgba(4,7,8,.92)", boxShadow: "0 0 60px 40px rgba(4,7,8,.92)" }}
          >
            <span
              className={`block whitespace-nowrap font-display font-bold uppercase leading-none ${SHOUT_CLS[shout.tone]}`}
              style={{ fontSize: Math.min(shout.size ?? 110, 122) }}
            >
              {shout.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────────────────── payout celebration ─────────────────────────

interface Party {
  id: number;
  kind: "win" | "all" | "house" | "push" | "bj";
  winners: RoundResult[];
  paid: number;
  count: number;
}

function Celebration({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [party, setParty] = useState<Party | null>(null);
  void snap;

  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.k !== "payout") return;
        const res = e.results;
        if (res.length === 0) return;
        const winners = res.filter((r) => isWin(r.outcome)).sort((a, b) => b.net - a.net);
        const pushes = res.filter((r) => r.outcome === "push").length;
        const paid = winners.reduce((a, r) => a + r.net, 0);
        const bj = winners.some((r) => r.outcome === "blackjack");
        const kind: Party["kind"] = bj
          ? "bj"
          : winners.length === res.length
            ? "all"
            : winners.length > 0
              ? "win"
              : pushes === res.length
                ? "push"
                : "house";
        const p: Party = { id: Date.now(), kind, winners, paid, count: res.length };
        setParty(p);
        setTimeout(() => setParty((x) => (x?.id === p.id ? null : x)), kind === "house" || kind === "push" ? 3200 : 5400);
        const ratio = winners.length / res.length;
        if (kind === "house") sfx.houseWins();
        else if (kind === "push") sfx.push();
        else {
          if (kind === "bj") sfx.blackjack();
          sfx.fanfare(kind === "bj" ? 0.25 : 0);
          sfx.cheer(Math.min(1, 0.35 + ratio * 0.65), 0.2);
          const colors = ["#f5c451", "#ffe08a", "#ffffff", "#34d399"];
          const count = Math.round(60 + ratio * 160);
          const fire = (delay: number) =>
            setTimeout(() => {
              void confetti({ particleCount: count, angle: 60, spread: 70, startVelocity: 70, origin: { x: 0, y: 0.95 }, colors });
              void confetti({ particleCount: count, angle: 120, spread: 70, startVelocity: 70, origin: { x: 1, y: 0.95 }, colors });
            }, delay);
          fire(150);
          if (ratio >= 0.5 || kind === "bj") fire(700);
          if (kind === "bj" || kind === "all") {
            fire(1300);
            setTimeout(() => void confetti({ particleCount: 220, spread: 160, origin: { y: 0.35 }, colors, scalar: 1.3 }), 400);
          }
        }
      }),
    [],
  );

  const good = party && party.kind !== "house" && party.kind !== "push";
  const headline = !party
    ? ""
    : party.kind === "bj"
      ? t("BJ")
      : party.kind === "all"
        ? t("everyoneWins")
        : party.kind === "win"
          ? party.winners.length === 1
            ? t("oneWinner")
            : t("winnersBig", { n: party.winners.length })
          : party.kind === "push"
            ? t("pushAll")
            : t("houseWins");
  return (
    <AnimatePresence>
      {party && (
        <motion.div
          key={party.id}
          className="pointer-events-none absolute inset-0 z-40 grid place-items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: good
                ? "radial-gradient(ellipse at 50% 42%, rgba(120,84,10,.88), rgba(3,5,6,.9) 62%)"
                : "radial-gradient(ellipse at 50% 42%, rgba(90,18,30,.86), rgba(3,5,6,.9) 62%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.92] }}
            transition={{ duration: 0.6 }}
          />
          {good && <div className="sunburst absolute left-1/2 top-1/2 h-[1700px] w-[1700px] -translate-x-1/2 -translate-y-1/2" />}
          <div className="relative flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.2, opacity: 0, y: 40 }}
              animate={{ scale: [0.2, 1.1, 1], opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              style={{ fontSize: Math.min(170, Math.round(2600 / Math.max(8, headline.length))) }}
              className={`light-sweep relative overflow-hidden whitespace-nowrap px-6 font-display font-bold uppercase leading-[1] ${
                good ? "gold-text drop-shadow-[0_16px_70px_rgba(245,196,81,.55)]" : party.kind === "push" ? "text-push" : "text-lose"
              }`}
            >
              {headline}
            </motion.div>
            {good && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="mt-2 flex items-baseline gap-4"
              >
                <CountUpFrom0 value={party.paid} format={(n) => `+${fmt(n, lang)}`} className="tabular font-display text-[88px] font-bold leading-none text-white" />
                <span className="text-2xl font-bold tracking-[0.25em] text-white/55 uppercase">{t("paidOut")}</span>
              </motion.div>
            )}
            {good && (
              <div className="mt-10 flex flex-wrap justify-center gap-5" style={{ maxWidth: 1500 }}>
                {party.winners.slice(0, 10).map((r, i) => (
                  <motion.div
                    key={r.playerId}
                    initial={{ scale: 0, y: 40, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    transition={{ delay: 0.8 + i * 0.15, type: "spring", stiffness: 380, damping: 16 }}
                    className="flex flex-col items-center"
                  >
                    <Avatar emoji={r.avatar} seed={r.playerId} size={92} ring={r.outcome === "blackjack" ? "#f5c451" : "#34d399"} />
                    <span className="mt-2 max-w-[150px] truncate text-xl font-bold">{r.name}</span>
                    <span className="tabular font-display text-2xl font-bold text-win">+{fmt(r.net, lang)}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CountUpFrom0({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setV(value), 50);
    return () => clearTimeout(id);
  }, [value]);
  return <CountUp value={v} format={format} className={className} />;
}

// ───────────────────────── sounds ─────────────────────────

/** Card sounds timed to the big-screen animations, plus soft clicks as players lock in. */
function useArenaSounds(snap: PublicSnapshot) {
  useEffect(
    () =>
      onRoomEvent((e) => {
        switch (e.k) {
          case "deal":
            sfx.noMoreBets();
            PACE.deal.forEach((d) => sfx.deal(d + 0.05));
            PACE.deal.forEach((d, i) => i !== 3 && sfx.flip(d + 0.25 + PACE.dealFlip + 0.05));
            break;
          case "step":
            if (e.card) {
              sfx.whoosh(0.08);
              sfx.drumroll(1.25, 0.35);
              sfx.reveal(PACE.drawDelay + 0.25 + PACE.drawFlip);
            }
            break;
          case "dealerCard":
            if (e.index === 1) {
              sfx.drumroll(1.35, 0.05);
              sfx.reveal(0.25 + PACE.dealerFlip);
            } else {
              sfx.deal(0);
              sfx.drumroll(0.8, 0.6);
              sfx.flip(0.25 + PACE.dealerFlip);
            }
            break;
        }
      }),
    [],
  );
  const locked =
    snap.phase === "betting"
      ? snap.players.filter((p) => p.betLocked).length
      : snap.phase === "deciding"
        ? snap.players.filter((p) => p.hand?.locked).length
        : 0;
  const prev = useRef(locked);
  useEffect(() => {
    if (locked > prev.current) sfx.softLock();
    prev.current = locked;
  }, [locked]);
}
