import { handValue, isAce, isTenValue, type Card } from "./cards";
import { draw, type Rng, type Shoe } from "./shoe";
import type { Rules } from "./rules";

export type Decision = "hit" | "stand" | "double" | "split";

export type HandStatus =
  /** Still deciding. */
  | "active"
  | "stood"
  | "doubled"
  | "busted"
  | "blackjack"
  /** Second hand of a split, waiting for the first hands to finish. */
  | "waiting";

export type Outcome = "win" | "blackjack" | "push" | "lose";

/**
 * Which row of cards a hand reads from.
 * 0 = the shared row everyone starts on. After a split: 1 = first split hand, 2 = second split hand.
 * Every hand on a row is a prefix of that row (same cards for everyone on it).
 */
export type HandRow = 0 | 1 | 2;

export interface PlayerHand {
  playerId: string;
  row: HandRow;
  /** True while the hand has its first two cards and no decision on them yet (double allowed). */
  fresh: boolean;
  /** Total stake (doubles when the player doubles). */
  bet: number;
  status: HandStatus;
  /** Number of cards from the hand's row that make up this hand. */
  stopAt: number;
  /** Decision for the current step (hidden from other players until resolved). */
  pending: Decision | null;
  /** All resolved decisions, in order. */
  decisions: Decision[];
  outcome: Outcome | null;
  /** Total amount credited back to the player on settlement (stake + winnings). */
  returned: number;
}

export type RoundPhase = "deciding" | "dealer" | "settled";

export interface RoundState {
  shared: Card[];
  /** Split rows: [first split hand, second split hand]. Created by the first split, shared by every splitter. */
  splitRows: [Card[], Card[]] | null;
  /** Second hands of players who split (row 2). */
  seconds: Record<string, PlayerHand>;
  /** Whether splitting is allowed this round (Rules.allowSplit). */
  splitAllowed: boolean;
  dealer: Card[];
  /** Whether the dealer's hole card has been revealed. */
  holeRevealed: boolean;
  hands: Record<string, PlayerHand>;
  /** Decision step index (0 = first decision on the two initial cards). */
  step: number;
  phase: RoundPhase;
  /** Set when the round ended early (dealer blackjack or shared blackjack). */
  early: "dealer-blackjack" | "shared-blackjack" | null;
}

export interface BetInput {
  playerId: string;
  bet: number;
}

/** Deals a new round: two shared player cards, dealer up card + hole card. Resolves peek/blackjacks. */
export function startRound(bets: readonly BetInput[], shoe: Shoe, rng: Rng, rules: Rules): RoundState {
  // Standard dealing order: player, dealer (up), player, dealer (hole).
  const p1 = draw(shoe, rng);
  const d1 = draw(shoe, rng);
  const p2 = draw(shoe, rng);
  const d2 = draw(shoe, rng);
  const hands: Record<string, PlayerHand> = {};
  for (const b of bets) {
    hands[b.playerId] = {
      playerId: b.playerId,
      row: 0,
      fresh: true,
      bet: b.bet,
      status: "active",
      stopAt: 2,
      pending: null,
      decisions: [],
      outcome: null,
      returned: 0,
    };
  }
  const state: RoundState = {
    shared: [p1, p2],
    splitRows: null,
    seconds: {},
    splitAllowed: rules.allowSplit !== false,
    dealer: [d1, d2],
    holeRevealed: false,
    hands,
    step: 0,
    phase: "deciding",
    early: null,
  };

  const sharedBJ = handValue(state.shared).blackjack;
  const up = d1;
  const dealerBJ = handValue(state.dealer).blackjack;
  const dealerPeeks = rules.dealerPeek && (isAce(up) || isTenValue(up));

  if (dealerPeeks && dealerBJ) {
    state.early = "dealer-blackjack";
    for (const h of Object.values(hands)) h.status = sharedBJ ? "blackjack" : "stood";
    state.holeRevealed = true;
    settle(state, rules);
    return state;
  }
  if (sharedBJ) {
    state.early = "shared-blackjack";
    for (const h of Object.values(hands)) h.status = "blackjack";
    state.holeRevealed = true;
    settle(state, rules);
    return state;
  }
  if (Object.keys(hands).length === 0) {
    state.phase = "dealer";
  }
  return state;
}

/** Every hand in the round: main hands, then the second hands of splits. */
export function allHands(state: RoundState): PlayerHand[] {
  return [...Object.values(state.hands), ...Object.values(state.seconds)];
}

export function activeHands(state: RoundState): PlayerHand[] {
  return allHands(state).filter((h) => h.status === "active");
}

/** The cards in a row (0 = shared). */
export function rowCards(state: RoundState, row: HandRow): Card[] {
  if (row === 0) return state.shared;
  return state.splitRows?.[row - 1] ?? [];
}

/** The cards that make up a hand. */
export function handCards(state: RoundState, h: PlayerHand): Card[] {
  return rowCards(state, h.row).slice(0, h.stopAt);
}

/** The hand a player is playing right now (the first split hand before the second), or their main hand. */
export function currentHand(state: RoundState, playerId: string): PlayerHand | undefined {
  const main = state.hands[playerId];
  const second = state.seconds[playerId];
  if (main?.status === "active") return main;
  if (second && (second.status === "active" || second.status === "waiting")) return second;
  return main;
}

const rankOf = (c: Card) => c.slice(0, -1);

export function canDouble(state: RoundState, playerId: string): boolean {
  const h = currentHand(state, playerId);
  return !!h && h.status === "active" && h.fresh && handCards(state, h).length === 2;
}

/** Split: the first decision on a pair of the same rank, once per round. */
export function canSplit(state: RoundState, playerId: string): boolean {
  const h = state.hands[playerId];
  if (!state.splitAllowed || !h || h.status !== "active" || !h.fresh || h.row !== 0 || state.step !== 0) return false;
  const [a, b] = state.shared;
  return state.shared.length === 2 && rankOf(a!) === rankOf(b!);
}

/** Records a player's pending decision. Returns false when the decision is not allowed. */
export function submitDecision(state: RoundState, playerId: string, decision: Decision): boolean {
  if (state.phase !== "deciding") return false;
  const h = currentHand(state, playerId);
  if (!h || h.status !== "active") return false;
  if (decision === "double" && !canDouble(state, playerId)) return false;
  if (decision === "split" && !canSplit(state, playerId)) return false;
  h.pending = decision;
  return true;
}

export function allDecided(state: RoundState): boolean {
  return activeHands(state).every((h) => h.pending !== null);
}

export interface StepResult {
  /** The card revealed on the shared row this step (null when nobody there took one). */
  card: Card | null;
  /** Player ids that took a card (on any row). */
  takers: string[];
  /** Resolved decision per player id for this step. */
  revealed: Record<string, Decision>;
  /** Every card drawn this step, with its row (shared, first split hand, second split hand). */
  rowCards: { row: HandRow; card: Card }[];
  /** Players who split this step. */
  splitters: string[];
  /** The second split hands started this step. */
  secondHands: boolean;
}

const isAceCard = (c: Card) => rankOf(c) === "A";

/** Gives the next card of a row to the hands on it, then updates their status. */
function dealToRow(state: RoundState, shoe: Shoe, rng: Rng, row: HandRow, hands: PlayerHand[], doubling: Set<PlayerHand>): Card {
  const card = draw(shoe, rng);
  if (row === 0) state.shared.push(card);
  else state.splitRows![row - 1]!.push(card);
  const len = rowCards(state, row).length;
  for (const h of hands) {
    h.stopAt = len;
    if (doubling.has(h)) h.bet *= 2;
    const cards = handCards(state, h);
    const v = handValue(cards);
    if (v.bust) h.status = "busted";
    else if (doubling.has(h)) h.status = "doubled";
    else if (v.total === 21) h.status = "stood";
    // A split hand that just got its second card: split aces stop there, others may double.
    else if (h.row !== 0 && cards.length === 2) {
      if (isAceCard(cards[0]!)) h.status = "stood";
      else h.fresh = true;
    }
  }
  return card;
}

/**
 * Resolves the current decision step. Undecided players stand.
 * On each row, everyone who hits or doubles gets that row's next card (the same card for all of them).
 * Splitting moves the hand to the first split row and parks a second hand on the second split row,
 * which plays once every other hand is done.
 */
export function resolveStep(state: RoundState, shoe: Shoe, rng: Rng): StepResult {
  const result: StepResult = { card: null, takers: [], revealed: {}, rowCards: [], splitters: [], secondHands: false };
  if (state.phase !== "deciding") return result;
  const active = activeHands(state);
  for (const h of active) {
    const d: Decision = h.pending ?? "stand";
    h.decisions.push(d);
    h.pending = null;
    h.fresh = false;
    result.revealed[h.playerId] = d;
  }

  // Splits: the pair becomes two rows, shared by everyone who split.
  const splitting = active.filter((h) => result.revealed[h.playerId] === "split");
  if (splitting.length > 0) {
    if (!state.splitRows) state.splitRows = [[state.shared[0]!], [state.shared[1]!]];
    for (const h of splitting) {
      result.splitters.push(h.playerId);
      h.row = 1;
      h.stopAt = 1;
      state.seconds[h.playerId] = {
        playerId: h.playerId,
        row: 2,
        fresh: false,
        bet: h.bet,
        status: "waiting",
        stopAt: 1,
        pending: null,
        decisions: [],
        outcome: null,
        returned: 0,
      };
    }
  }
  for (const h of active) if (result.revealed[h.playerId] === "stand") h.status = "stood";

  const doubling = new Set(active.filter((h) => result.revealed[h.playerId] === "double"));
  for (const row of [0, 1, 2] as const) {
    const takers = active.filter((h) => h.row === row && result.revealed[h.playerId] !== "stand");
    if (takers.length === 0) continue;
    const card = dealToRow(state, shoe, rng, row, takers, doubling);
    result.rowCards.push({ row, card });
    if (row === 0) result.card = card;
    for (const h of takers) if (!result.takers.includes(h.playerId)) result.takers.push(h.playerId);
  }
  state.step++;

  // Every first hand is done: the second split hands get their second card and play.
  if (activeHands(state).length === 0) {
    const waiting = Object.values(state.seconds).filter((h) => h.status === "waiting");
    if (waiting.length > 0) {
      for (const h of waiting) h.status = "active";
      const card = dealToRow(state, shoe, rng, 2, waiting, new Set());
      result.rowCards.push({ row: 2, card });
      result.secondHands = true;
    }
  }
  if (activeHands(state).length === 0) state.phase = "dealer";
  return result;
}

/** Dealer reveals the hole card and draws per the rules. Returns the cards drawn after the hole card. */
export function playDealer(state: RoundState, shoe: Shoe, rng: Rng, rules: Rules): Card[] {
  if (state.phase === "settled") return [];
  state.holeRevealed = true;
  const drawn: Card[] = [];
  const anyAlive = allHands(state).some((h) => h.status !== "busted");
  if (anyAlive) {
    for (;;) {
      const v = handValue(state.dealer);
      if (v.total > 17) break;
      if (v.total === 17 && !(v.soft && rules.dealerHitsSoft17)) break;
      const c = draw(shoe, rng);
      state.dealer.push(c);
      drawn.push(c);
    }
  }
  settle(state, rules);
  return drawn;
}

export function playerCards(state: RoundState, playerId: string): Card[] {
  const h = state.hands[playerId];
  return h ? handCards(state, h) : [];
}

function settle(state: RoundState, rules: Rules): void {
  const dealer = handValue(state.dealer);
  for (const h of allHands(state)) {
    // A two-card 21 on a split hand is just 21 (pays 1:1): its status is never "blackjack".
    const pv = handValue(handCards(state, h));
    const playerBJ = h.status === "blackjack";
    let outcome: Outcome;
    if (h.status === "busted") outcome = "lose";
    else if (playerBJ && dealer.blackjack) outcome = "push";
    else if (playerBJ) outcome = "blackjack";
    else if (dealer.blackjack) outcome = "lose";
    else if (dealer.bust) outcome = "win";
    else if (pv.total > dealer.total) outcome = "win";
    else if (pv.total === dealer.total) outcome = "push";
    else outcome = "lose";
    h.outcome = outcome;
    h.returned =
      outcome === "win"
        ? h.bet * 2
        : outcome === "blackjack"
          ? h.bet + Math.floor(h.bet * rules.blackjackPayout)
          : outcome === "push"
            ? h.bet
            : 0;
    if (h.status === "active" || h.status === "waiting") h.status = "stood";
  }
  state.phase = "settled";
}

/** Net result for a hand (returned − stake). */
export function handNet(h: PlayerHand): number {
  return h.returned - h.bet;
}
