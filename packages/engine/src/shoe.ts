import { RANKS, SUITS, makeCard, type Card } from "./cards";

/** Returns a float in [0, 1). */
export type Rng = () => number;

/** Cryptographically secure RNG (Web Crypto, available in Workers, browsers and Node 20+). */
export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  // 53 bits of randomness
  return ((buf[0]! >>> 5) * 67108864 + (buf[1]! >>> 6)) / 9007199254740992;
};

/** Deterministic RNG for tests and simulations (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Shoe {
  cards: Card[];
  /** Index of the next card to deal. */
  pos: number;
  /** When pos reaches this index, the shoe is reshuffled before the next round. */
  cutIndex: number;
  decks: number;
  /** Incremented on every shuffle (lets the UI show a "shuffling" moment). */
  shuffleCount: number;
}

export function buildDecks(decks: number): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++)
    for (const s of SUITS) for (const r of RANKS) out.push(makeCard(r, s));
  return out;
}

export function shuffleInPlace<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function createShoe(decks: number, rng: Rng, penetration = 0.75, shuffleCount = 0): Shoe {
  const cards = shuffleInPlace(buildDecks(decks), rng);
  return {
    cards,
    pos: 0,
    cutIndex: Math.floor(cards.length * penetration),
    decks,
    shuffleCount: shuffleCount + 1,
  };
}

export function needsShuffle(shoe: Shoe): boolean {
  return shoe.pos >= shoe.cutIndex;
}

/** Draws the next card. If the shoe is somehow exhausted mid-round, it is rebuilt (never throws). */
export function draw(shoe: Shoe, rng: Rng): Card {
  if (shoe.pos >= shoe.cards.length) {
    const fresh = createShoe(shoe.decks, rng, shoe.cutIndex / shoe.cards.length, shoe.shuffleCount);
    Object.assign(shoe, fresh);
  }
  return shoe.cards[shoe.pos++]!;
}

export function cardsRemaining(shoe: Shoe): number {
  return shoe.cards.length - shoe.pos;
}
