import { memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { handValue, type Card, type PublicPlayer, type PublicSnapshot } from "@21/engine";
import { PlayingCard } from "../components/PlayingCard";
import { ChipStack } from "../components/Chip";
import { Avatar } from "../components/ui";
import { useT, useLang, fmt } from "../lib/i18n";
import { seatBadge, TONE_CLASSES, TONE_RING, totalLabel } from "../lib/view";

export const TABLE_W = 1600;
const CX = 800;

/** Seat centers along the bottom arc, left → right. */
export function seatPositions(n: number): { x: number; y: number; angle: number }[] {
  const out = [];
  // Fewer seats -> tighter arc around the bottom; 12 seats -> full sweep.
  const spread = n <= 1 ? 0 : Math.min(156, 40 + n * 10);
  const start = 90 + spread / 2;
  const end = 90 - spread / 2;
  for (let i = 0; i < n; i++) {
    const deg = n === 1 ? 90 : start - ((start - end) * i) / (n - 1);
    const rad = (deg * Math.PI) / 180;
    out.push({ x: CX + 700 * Math.cos(rad), y: 470 + 452 * Math.sin(rad), angle: deg });
  }
  return out;
}

const SHOE_POS = { x: 1330, y: 150 };
const DEALER_Y = 112;
const DEALER_CARD_W = 116;
const SHARED_Y = 418;
const SHARED_CARD_W = 132;
const SHARED_STEP = 98;

export function Felt({ rules }: { rules: PublicSnapshot["rules"] }) {
  const t = useT();
  return (
    <div className="absolute inset-0">
      {/* outer rail */}
      <div
        className="absolute"
        style={{
          left: 36,
          top: 58,
          width: TABLE_W - 72,
          height: 990,
          borderRadius: "48px 48px 764px 764px / 48px 48px 660px 660px",
          background: "linear-gradient(180deg, #1b1410, #0d0907)",
          boxShadow: "0 40px 120px -20px rgba(0,0,0,.8), inset 0 2px 0 rgba(255,255,255,.06)",
        }}
      />
      {/* felt */}
      <div
        className="grain absolute overflow-hidden"
        style={{
          left: 56,
          top: 76,
          width: TABLE_W - 112,
          height: 952,
          borderRadius: "36px 36px 744px 744px / 36px 36px 640px 640px",
          background:
            "radial-gradient(ellipse 60% 55% at 50% 40%, #136b4c 0%, #0d4a35 38%, #08301f 70%, #05200f 100%)",
          boxShadow: "inset 0 0 0 2px rgba(245,196,81,.28), inset 0 0 120px rgba(0,0,0,.55)",
        }}
      >
        {/* inner gold line */}
        <div
          className="absolute"
          style={{
            left: 22,
            top: 22,
            right: 22,
            bottom: 22,
            borderRadius: "24px 24px 720px 720px / 24px 24px 620px 620px",
            border: "1.5px solid rgba(245,196,81,.16)",
          }}
        />
      </div>
      {/* printed table text */}
      <svg className="pointer-events-none absolute left-0 top-0" width={TABLE_W} height={1080}>
        <defs>
          <path id="arc-text" d={`M ${CX - 500} 470 A 500 292 0 0 0 ${CX + 500} 470`} />
          <path id="arc-text-2" d={`M ${CX - 560} 470 A 560 334 0 0 0 ${CX + 560} 470`} />
        </defs>
        <text fill="rgba(245,196,81,.55)" fontFamily="Space Grotesk, sans-serif" fontWeight={700} fontSize={30} letterSpacing={8}>
          <textPath href="#arc-text" startOffset="50%" textAnchor="middle">
            {t(rules.blackjackPayout === 1.5 ? "feltPays32" : "feltPays65")}
          </textPath>
        </text>
        <text fill="rgba(255,255,255,.26)" fontFamily="Inter, sans-serif" fontWeight={600} fontSize={14} letterSpacing={5}>
          <textPath href="#arc-text-2" startOffset="50%" textAnchor="middle">
            {t(rules.dealerHitsSoft17 ? "feltH17" : "feltS17")} · {t("feltShared")}
          </textPath>
        </text>
      </svg>
    </div>
  );
}

export function Shoe({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const frac = snap.shoe.total ? snap.shoe.remaining / snap.shoe.total : 0;
  return (
    <div className="absolute flex flex-col items-center gap-2" style={{ left: SHOE_POS.x - 50, top: SHOE_POS.y - 70 }}>
      <div className="relative h-[92px] w-[100px]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="absolute" style={{ left: i * 4, top: i * -3, transform: "rotate(-8deg)" }}>
            <PlayingCard card={null} width={62} />
          </div>
        ))}
      </div>
      <div className="w-[100px]">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gold/70" style={{ width: `${frac * 100}%`, transition: "width .6s" }} />
        </div>
        <div className="mt-1 text-center text-[11px] font-semibold tracking-widest text-white/40 uppercase">{t("shoe")}</div>
      </div>
    </div>
  );
}

export function DealerHand({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const cards = snap.dealer;
  const visible = cards.filter((c): c is Card => c !== null);
  const dealerDone = snap.dealer.length >= 2 && snap.dealer.every(Boolean) && (snap.phase === "dealer" || snap.phase === "payout");
  const total = visible.length > 0 ? (dealerDone ? String(handValue(visible).total) : totalLabel(visible)) : null;
  const v = handValue(visible);
  const allShown = cards.every(Boolean) && cards.length >= 2;
  const width = cards.length * 84 + (DEALER_CARD_W - 84);
  return (
    <div className="absolute flex flex-col items-center" style={{ left: CX, top: DEALER_Y, transform: "translateX(-50%)" }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-sm font-bold tracking-[0.3em] text-white/50 uppercase">{t("dealer")}</span>
        <AnimatePresence>
          {total && (
            <motion.span
              key={total}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`tabular rounded-full px-3 py-0.5 font-display text-lg font-bold ${
                allShown && v.bust ? "bg-win text-ink" : allShown && v.blackjack ? "bg-lose text-ink" : "bg-black/50 text-white"
              }`}
            >
              {allShown && v.bust ? "BUST" : total}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="relative" style={{ width: Math.max(width, DEALER_CARD_W), height: DEALER_CARD_W * 1.4 }}>
        {cards.map((c, i) => (
          <div key={`${snap.roundNo}-d${i}`} className="absolute top-0" style={{ left: i * 84 }}>
            <PlayingCard
              card={c}
              width={DEALER_CARD_W}
              dealFrom={{ x: SHOE_POS.x - CX - i * 84 + 40, y: SHOE_POS.y - DEALER_Y - 60 }}
              delay={snap.phase === "dealing" ? (i === 0 ? 0.25 : 0.75) : 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

interface StopGroup {
  stopAt: number;
  players: PublicPlayer[];
}

export function SharedRow({ snap }: { snap: PublicSnapshot }) {
  const n = snap.shared.length;
  if (n === 0) return null;
  const width = (n - 1) * SHARED_STEP + SHARED_CARD_W;
  const left = CX - width / 2;
  const inHand = snap.players.filter((p) => p.hand);
  const groups: StopGroup[] = [];
  for (const p of inHand) {
    const g = groups.find((x) => x.stopAt === p.hand!.stopAt);
    if (g) g.players.push(p);
    else groups.push({ stopAt: p.hand!.stopAt, players: [p] });
  }
  const newCard = snap.phase === "drawing" && snap.lastStep?.card ? n - 1 : -1;
  return (
    <>
      {snap.shared.map((c, i) => (
        <div key={`${snap.roundNo}-s${i}`} className="absolute" style={{ left: left + i * SHARED_STEP, top: SHARED_Y }}>
          <PlayingCard
            card={c}
            width={SHARED_CARD_W}
            dealFrom={{ x: SHOE_POS.x - (left + i * SHARED_STEP), y: SHOE_POS.y - SHARED_Y - 80 }}
            delay={snap.phase === "dealing" ? (i === 0 ? 0 : i === 1 ? 0.5 : 0) : 0.05}
            glow={i === newCard ? "gold" : null}
          />
        </div>
      ))}
      {/* stop markers */}
      {groups.map((g) => {
        const idx = g.stopAt - 1;
        const x = left + idx * SHARED_STEP + SHARED_CARD_W / 2;
        const cards = snap.shared.slice(0, g.stopAt);
        const v = handValue(cards);
        const active = g.players.some((p) => p.hand!.status === "active");
        const shown = g.players.slice(0, 4);
        const extra = g.players.length - shown.length;
        return (
          <motion.div
            key={`g${g.stopAt}`}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute flex flex-col items-center"
            style={{ left: x, top: SHARED_Y + SHARED_CARD_W * 1.4 + 14, transform: "translateX(-50%)" }}
          >
            <div
              className={`tabular mb-1.5 rounded-full px-3 py-0.5 font-display text-xl font-bold ${
                v.bust ? "bg-lose text-ink" : v.total === 21 ? "bg-gold text-ink" : active ? "bg-white text-ink" : "bg-black/55 text-white"
              }`}
            >
              {v.bust ? `${v.total} ✕` : active ? totalLabel(cards) : v.total}
            </div>
            <div className="flex items-center">
              {shown.map((p, i) => (
                <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -12, opacity: p.hand!.status === "busted" ? 0.45 : 1 }}>
                  <Avatar emoji={p.avatar} seed={p.id} size={34} ring={active ? "#ffffff" : undefined} />
                </div>
              ))}
              {extra > 0 && <span className="ml-1.5 text-sm font-bold text-white/70">+{extra}</span>}
            </div>
          </motion.div>
        );
      })}
    </>
  );
}

export const Seat = memo(function Seat({
  index,
  pos,
  player,
  snap,
}: {
  index: number;
  pos: { x: number; y: number };
  player: PublicPlayer | null;
  snap: PublicSnapshot;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  if (!player) {
    return (
      <div className="absolute flex flex-col items-center" style={{ left: pos.x, top: pos.y, transform: "translate(-50%,-50%)" }}>
        <div className="grid h-[56px] w-[56px] place-items-center rounded-full border-2 border-dashed border-white/12 font-display text-lg font-bold text-white/20">
          {index + 1}
        </div>
        <div className="mt-2 text-[11px] font-semibold tracking-wider text-white/22 uppercase">{t("emptySeat")}</div>
      </div>
    );
  }
  const badge = seatBadge(player, snap);
  const ring = badge ? TONE_RING[badge.tone] : undefined;
  const h = player.hand;
  const glowWin = snap.phase === "payout" && h?.outcome && (h.outcome === "win" || h.outcome === "blackjack");
  return (
    <motion.div
      className="absolute flex w-[136px] flex-col items-center"
      style={{ left: pos.x, top: pos.y, x: "-50%", y: "-50%" }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <div className={`relative ${glowWin ? "drop-shadow-[0_0_22px_rgba(52,211,153,.8)]" : ""}`}>
        <div className={badge?.pulse ? "rounded-full pulse-ring" : ""} style={{ filter: player.connected ? undefined : "grayscale(1) brightness(.6)" }}>
          <Avatar emoji={player.avatar} seed={player.id} size={60} ring={ring} />
        </div>
        {player.streak >= 3 && <span className="flame absolute -left-2 -top-2 text-xl">🔥</span>}
        {h && h.status !== "busted" && (
          <span className="tabular absolute -right-3 -top-1.5 rounded-full bg-white px-1.5 py-px font-display text-[13px] font-bold text-ink shadow">
            {h.total}
          </span>
        )}
        {!player.connected && <span className="absolute -right-1 bottom-2 text-sm">📵</span>}
        <div className="absolute -bottom-3 left-1/2 h-6 -translate-x-1/2">
          <AnimatePresence mode="popLayout">
            {badge && (
              <motion.div
                key={`${badge.key}-${badge.text}`}
                initial={{ scale: 0.4, opacity: 0, y: -6 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 24 }}
                className={`tabular whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-extrabold tracking-wide shadow-[0_4px_12px_rgba(0,0,0,.4)] ${TONE_CLASSES[badge.tone]} ${badge.pulse ? "animate-pulse" : ""}`}
              >
                {badge.key ? t(badge.key) : ""}
                {badge.text && badge.key ? " " : ""}
                {badge.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-4 max-w-[136px] truncate text-[15px] font-bold leading-tight">{player.name}</div>
      <div className="tabular text-[13px] font-semibold text-white/50">{fmt(player.chips, lang)}</div>
    </motion.div>
  );
});

export function Seats({ snap }: { snap: PublicSnapshot }) {
  const positions = seatPositions(snap.seats.length);
  const byId = new Map(snap.players.map((p) => [p.id, p]));
  return (
    <>
      {snap.seats.map((id, i) => (
        <Seat key={id ?? `empty-${i}`} index={i} pos={positions[i]!} player={id ? (byId.get(id) ?? null) : null} snap={snap} />
      ))}
      {snap.seats.map((id, i) => {
        const p = id ? byId.get(id) : undefined;
        if (!p) return null;
        const stake = p.hand ? p.hand.bet : p.bet;
        return <SeatStake key={`stake-${id}`} pos={positions[i]!} amount={stake} round={snap.roundNo} />;
      })}
    </>
  );
}

/** The bet in front of a seat, placed toward the dealer so it never collides with neighbours. */
function SeatStake({ pos, amount, round }: { pos: { x: number; y: number }; amount: number; round: number }) {
  const lang = useLang((s) => s.lang);
  // Avatar center sits ~22px above the seat box center.
  const ax = pos.x;
  const ay = pos.y - 22;
  const dx = CX - ax;
  const dy = 300 - ay;
  const len = Math.hypot(dx, dy) || 1;
  const dist = 74;
  const x = ax + (dx / len) * dist;
  const y = ay + (dy / len) * dist;
  return (
    <div className="pointer-events-none absolute" style={{ left: x, top: y, transform: "translate(-50%, -50%)" }}>
      <AnimatePresence>
        {amount > 0 && (
          <motion.div
            key={`${round}-${amount}`}
            initial={{ y: 24, opacity: 0, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -60, opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex items-end gap-1"
          >
            <ChipStack amount={amount} size={24} />
            <span className="tabular rounded-md bg-black/55 px-1.5 text-[13px] font-bold text-gold">{fmt(amount, lang)}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Centerpiece while bets are open: denominations + table limits. */
export function BettingHint({ snap }: { snap: PublicSnapshot }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  if (snap.phase !== "betting" || snap.shared.length > 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-none absolute flex flex-col items-center"
      style={{ left: CX, top: 450, transform: "translateX(-50%)" }}
    >
      <div className="flex items-end gap-3">
        {[10, 25, 100, 500].map((v, i) => (
          <motion.div
            key={v}
            initial={{ y: -30, opacity: 0, rotate: -20 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 260, damping: 14 }}
            style={{ filter: "drop-shadow(0 8px 14px rgba(0,0,0,.45))" }}
          >
            <ChipStack amount={v * (4 - i)} size={64} />
          </motion.div>
        ))}
      </div>
      <div className="tabular mt-5 rounded-full bg-black/30 px-5 py-1.5 text-lg font-semibold text-white/70">
        {t("min")} {fmt(snap.rules.minBet, lang)} · {t("max")} {fmt(snap.rules.maxBet, lang)}
      </div>
    </motion.div>
  );
}
