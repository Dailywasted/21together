import { handValue, type Card, type Outcome, type PublicSnapshot, type PublicPlayer, type PublicHand } from "@21/engine";
import type { TKey } from "./i18n";

export type BadgeTone = "gold" | "win" | "lose" | "push" | "muted" | "hit" | "stand" | "accent";

export interface SeatBadge {
  key: TKey | null;
  text?: string;
  tone: BadgeTone;
  pulse?: boolean;
}

/** What to show on a player's seat for the current phase. */
export function seatBadge(p: PublicPlayer, s: PublicSnapshot): SeatBadge | null {
  // After a split: the round result is both hands together; during play, show the hand being played.
  if (p.hand && p.hand2) {
    if (s.phase === "payout" && p.hand.outcome && p.hand2.outcome) {
      const net = (p.hand.net ?? 0) + (p.hand2.net ?? 0);
      const amount = `${net > 0 ? "+" : net < 0 ? "−" : ""}${Math.abs(net)}`;
      if (net > 0) return { key: "WIN", text: amount, tone: "win" };
      if (net < 0) return { key: "LOSE", text: amount, tone: "lose" };
      return { key: "PUSH", tone: "push" };
    }
    if (s.phase === "drawing" && s.lastStep?.revealed[p.id] === "split") return { key: "SPLIT", tone: "accent" };
    const playing = p.hand.status === "active" ? p.hand : p.hand2;
    return seatBadge({ ...p, hand: playing, hand2: null }, s);
  }
  const h = p.hand;
  if (s.phase === "betting") {
    if (p.betLocked) return { key: "locked", tone: "gold" };
    if (p.bet > 0) return { key: null, text: "…", tone: "muted" };
    return null;
  }
  if (!h) return s.phase === "lobby" || s.phase === "ended" ? null : { key: "sittingOut", tone: "muted" };
  if (s.phase === "payout" && h.outcome) {
    const net = h.net ?? 0;
    const amount = `${net > 0 ? "+" : net < 0 ? "−" : ""}${Math.abs(net)}`;
    if (h.outcome === "blackjack") return { key: "BJ", text: amount, tone: "gold" };
    if (h.outcome === "win") return { key: "WIN", text: amount, tone: "win" };
    if (h.outcome === "push") return { key: "PUSH", tone: "push" };
    return { key: h.status === "busted" ? "BUST" : "LOSE", text: amount, tone: "lose" };
  }
  if (s.phase === "drawing" && s.lastStep) {
    const d = s.lastStep.revealed[p.id];
    if (d === "hit") return { key: h.status === "busted" ? "BUST" : "HIT", tone: h.status === "busted" ? "lose" : "hit" };
    if (d === "double") return { key: h.status === "busted" ? "BUST" : "DOUBLE", tone: h.status === "busted" ? "lose" : "accent" };
    if (d === "stand") return { key: "STAND", tone: "stand" };
  }
  switch (h.status) {
    case "active":
      if (s.phase === "deciding") return h.locked ? { key: "locked", tone: "gold" } : { key: "thinking", tone: "muted", pulse: true };
      return null;
    case "busted":
      return { key: "BUST", tone: "lose" };
    case "blackjack":
      return { key: "BJ", tone: "gold" };
    case "doubled":
      return { key: "DOUBLE", tone: "accent" };
    case "stood":
      return { key: "STAND", text: String(h.total), tone: "stand" };
    case "waiting":
      return { key: "SPLIT", tone: "accent" };
  }
}

/** The hand a player is deciding on right now (the second hand after a split, once the first is done). */
export function activeHand(p: PublicPlayer): PublicHand | null {
  if (p.hand?.status === "active") return p.hand;
  if (p.hand2?.status === "active") return p.hand2;
  return null;
}

/** A player's result for the round: after a split, both hands together (by net). */
export function roundOutcome(p: PublicPlayer): Outcome | null {
  if (!p.hand?.outcome) return null;
  if (!p.hand2) return p.hand.outcome;
  if (!p.hand2.outcome) return null;
  const net = (p.hand.net ?? 0) + (p.hand2.net ?? 0);
  return net > 0 ? "win" : net < 0 ? "lose" : "push";
}

/** The cards of a hand on its row (0 = shared, 1-2 = split rows). */
export function rowOf(s: PublicSnapshot, row: number): Card[] {
  if (row === 0) return s.shared;
  return s.splitRows?.[row - 1] ?? [];
}

/** Every hand in play with its owner (main hands and second hands of splits). */
export function handsOf(s: PublicSnapshot): { p: PublicPlayer; h: NonNullable<PublicPlayer["hand"]> }[] {
  const out: { p: PublicPlayer; h: NonNullable<PublicPlayer["hand"]> }[] = [];
  for (const p of s.players) {
    if (p.hand) out.push({ p, h: p.hand });
    if (p.hand2) out.push({ p, h: p.hand2 });
  }
  return out;
}

export const TONE_CLASSES: Record<BadgeTone, string> = {
  gold: "bg-gold text-ink",
  win: "bg-win text-ink",
  lose: "bg-lose text-ink",
  push: "bg-push text-ink",
  muted: "bg-white/10 text-muted",
  hit: "bg-[#38bdf8] text-ink",
  stand: "bg-white text-ink",
  accent: "bg-accent text-white",
};

export const TONE_RING: Record<BadgeTone, string> = {
  gold: "#f5c451",
  win: "#34d399",
  lose: "#fb7185",
  push: "#93c5fd",
  muted: "rgba(255,255,255,.15)",
  hit: "#38bdf8",
  stand: "#ffffff",
  accent: "#7c5cff",
};

export function totalLabel(cards: readonly Card[]): string {
  if (cards.length === 0) return "";
  const v = handValue(cards);
  if (v.blackjack) return "21";
  if (v.soft && v.total < 21) return `${v.total - 10}/${v.total}`;
  return String(v.total);
}

export function isBlackjack(cards: readonly (Card | null)[]): boolean {
  return cards.length === 2 && cards.every(Boolean) && handValue(cards as Card[]).blackjack;
}
