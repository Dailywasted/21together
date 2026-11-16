export interface Rules {
  decks: number;
  penetration: number;
  dealerHitsSoft17: boolean;
  dealerPeek: boolean;
  /** Blackjack pays bet × this (1.5 = 3:2). */
  blackjackPayout: number;
  minBet: number;
  maxBet: number;
  startingChips: number;
  maxSeats: number;
  betSeconds: number;
  decisionSeconds: number;
  /** Step-by-step mode: the host advances every dramatic beat (no countdowns). */
  manual: boolean;
  /** Bonus mini-games (Reindeer Race) unlocked by win streaks. */
  bonusGames: boolean;
}

export const DEFAULT_RULES: Rules = {
  decks: 6,
  penetration: 0.75,
  dealerHitsSoft17: false,
  dealerPeek: true,
  blackjackPayout: 1.5,
  minBet: 10,
  maxBet: 500,
  startingChips: 1000,
  maxSeats: 12,
  betSeconds: 15,
  decisionSeconds: 10,
  manual: false,
  bonusGames: true,
};

/** Clamps host-provided rule changes into sane ranges. */
export function sanitizeRules(base: Rules, patch: Partial<Rules>): Rules {
  const r = { ...base, ...patch };
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
  r.decks = clamp(r.decks, 1, 8);
  r.penetration = Math.min(0.9, Math.max(0.5, Number(r.penetration) || 0.75));
  r.blackjackPayout = r.blackjackPayout === 1.2 ? 1.2 : 1.5;
  r.minBet = clamp(r.minBet, 1, 10_000);
  r.maxBet = clamp(r.maxBet, r.minBet, 100_000);
  r.startingChips = clamp(r.startingChips, 100, 1_000_000);
  r.maxSeats = clamp(r.maxSeats, 1, 12);
  r.betSeconds = clamp(r.betSeconds, 5, 60);
  r.decisionSeconds = clamp(r.decisionSeconds, 4, 30);
  r.dealerHitsSoft17 = !!r.dealerHitsSoft17;
  r.dealerPeek = !!r.dealerPeek;
  r.manual = !!r.manual;
  r.bonusGames = r.bonusGames !== false;
  return r;
}
