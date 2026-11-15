export const SUITS = ["S", "H", "D", "C"] as const;
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

/** A card encoded as rank + suit, e.g. "AS", "10H", "KD". */
export type Card = `${Rank}${Suit}`;

export function makeCard(rank: Rank, suit: Suit): Card {
  return `${rank}${suit}` as Card;
}

export function rankOf(card: Card): Rank {
  return card.slice(0, -1) as Rank;
}

export function suitOf(card: Card): Suit {
  return card.slice(-1) as Suit;
}

/** Blackjack value of a single rank (aces count 1 here; soft handling is in handValue). */
export function rankValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return Number(rank);
}

export function cardValue(card: Card): number {
  return rankValue(rankOf(card));
}

export function isTenValue(card: Card): boolean {
  return cardValue(card) === 10;
}

export function isAce(card: Card): boolean {
  return rankOf(card) === "A";
}

export interface HandValue {
  /** Best total (counts one ace as 11 when that does not bust). */
  total: number;
  /** True when an ace is currently counted as 11. */
  soft: boolean;
  /** Exactly two cards totalling 21. */
  blackjack: boolean;
  bust: boolean;
}

export function handValue(cards: readonly Card[]): HandValue {
  let hard = 0;
  let aces = 0;
  for (const c of cards) {
    const v = cardValue(c);
    hard += v;
    if (v === 1) aces++;
  }
  const soft = aces > 0 && hard + 10 <= 21;
  const total = soft ? hard + 10 : hard;
  return {
    total,
    soft,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}

/**
 * Probability (0..1) that one more card busts this hand, assuming an infinite deck.
 * Deliberately ignores the shoe composition so the client never learns anything the server knows.
 */
export function bustProbability(cards: readonly Card[]): number {
  const { total, soft } = handValue(cards);
  if (soft) return 0;
  // Card values 1..10, where 10 has probability 4/13.
  let p = 0;
  for (let v = 1; v <= 10; v++) {
    const prob = v === 10 ? 4 / 13 : 1 / 13;
    if (total + v > 21) p += prob;
  }
  return p;
}
