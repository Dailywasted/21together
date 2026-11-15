import { handValue, type Card, type PublicSnapshot, type PublicPlayer } from "@21/engine";
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
  }
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
