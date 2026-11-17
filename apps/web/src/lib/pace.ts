import type { PublicSnapshot } from "@21/protocol";

/**
 * How long after a card arrives the TV "reveals" it (the card lands, stays face down for suspense, then flips).
 * Used by the big-screen view for totals, busts and badges.
 */
export const REVEAL = { dealShared: 2700, dealDealer: 1700, draw: 2150, dealer: 1950 };

/** Phones show a new card this long after the TV has flipped it, so the room reacts to the TV first. */
export const PHONE_AFTER_TV_MS = 1500;
/** Phones show the round result this long after the TV starts its payout celebration. */
export const PHONE_RESULT_LAG_MS = 1500;

const cardCount = (s: PublicSnapshot) => s.shared.length + s.dealer.filter(Boolean).length;

/** How long a phone should hold this update so the TV gets there first (0 = show it now). */
export function phoneLag(prev: PublicSnapshot | null, next: PublicSnapshot): number {
  if (!prev) return 0; // first update after (re)connecting: show it right away
  // roundNo goes up when the cards are dealt, so a new round counts its cards from zero.
  const before = prev.roundNo === next.roundNo ? cardCount(prev) : 0;
  if (cardCount(next) > before) {
    const tv = next.phase === "dealing" ? REVEAL.dealShared : next.phase === "dealer" || next.phase === "payout" ? REVEAL.dealer : REVEAL.draw;
    return tv + PHONE_AFTER_TV_MS;
  }
  if (next.phase === "payout" && prev.phase !== "payout") return PHONE_RESULT_LAG_MS;
  return 0;
}
