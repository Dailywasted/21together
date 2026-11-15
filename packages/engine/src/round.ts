import { handValue, isAce, isTenValue, type Card } from "./cards";
import { draw, type Rng, type Shoe } from "./shoe";
import type { Rules } from "./rules";

export type Decision = "hit" | "stand" | "double";

export type HandStatus =
  /** Still deciding. */
  | "active"
  | "stood"
  | "doubled"
  | "busted"
  | "blackjack";

export type Outcome = "win" | "blackjack" | "push" | "lose";

export interface PlayerHand {
  playerId: string;
  /** Total stake (doubles when the player doubles). */
  bet: number;
  status: HandStatus;
  /** Number of shared cards that make up this player's hand. */
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

export function activeHands(state: RoundState): PlayerHand[] {
  return Object.values(state.hands).filter((h) => h.status === "active");
}

export function canDouble(state: RoundState, playerId: string): boolean {
  const h = state.hands[playerId];
  return !!h && h.status === "active" && state.step === 0 && state.shared.length === 2;
}

/** Records a player's pending decision. Returns false when the decision is not allowed. */
export function submitDecision(state: RoundState, playerId: string, decision: Decision): boolean {
  if (state.phase !== "deciding") return false;
  const h = state.hands[playerId];
  if (!h || h.status !== "active") return false;
  if (decision === "double" && !canDouble(state, playerId)) return false;
  h.pending = decision;
  return true;
}

export function allDecided(state: RoundState): boolean {
  return activeHands(state).every((h) => h.pending !== null);
}

export interface StepResult {
  /** The card revealed this step (null when everyone stood). */
  card: Card | null;
  /** Player ids that took the card. */
  takers: string[];
  /** Resolved decision per player id for this step. */
  revealed: Record<string, Decision>;
}

/**
 * Resolves the current decision step. Undecided players stand.
 * When anyone hits or doubles, the next shared card is drawn and given to all of them.
 */
export function resolveStep(state: RoundState, shoe: Shoe, rng: Rng): StepResult {
  const result: StepResult = { card: null, takers: [], revealed: {} };
  if (state.phase !== "deciding") return result;
  const active = activeHands(state);
  for (const h of active) {
    const d: Decision = h.pending ?? "stand";
    h.decisions.push(d);
    h.pending = null;
    result.revealed[h.playerId] = d;
  }
  const takers = active.filter((h) => result.revealed[h.playerId] !== "stand");
  for (const h of active) if (result.revealed[h.playerId] === "stand") h.status = "stood";

  if (takers.length > 0) {
    const card = draw(shoe, rng);
    state.shared.push(card);
    result.card = card;
    for (const h of takers) {
      result.takers.push(h.playerId);
      h.stopAt = state.shared.length;
      const doubling = result.revealed[h.playerId] === "double";
      if (doubling) h.bet *= 2;
      const v = handValue(state.shared.slice(0, h.stopAt));
      if (v.bust) h.status = "busted";
      else if (doubling) h.status = "doubled";
      else if (v.total === 21) h.status = "stood";
    }
  }
  state.step++;
  if (activeHands(state).length === 0) state.phase = "dealer";
  return result;
}

/** Dealer reveals the hole card and draws per the rules. Returns the cards drawn after the hole card. */
export function playDealer(state: RoundState, shoe: Shoe, rng: Rng, rules: Rules): Card[] {
  if (state.phase === "settled") return [];
  state.holeRevealed = true;
  const drawn: Card[] = [];
  const anyAlive = Object.values(state.hands).some((h) => h.status !== "busted");
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
  return h ? state.shared.slice(0, h.stopAt) : [];
}

function settle(state: RoundState, rules: Rules): void {
  const dealer = handValue(state.dealer);
  for (const h of Object.values(state.hands)) {
    const pv = handValue(state.shared.slice(0, h.stopAt));
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
    if (h.status === "active") h.status = "stood";
  }
  state.phase = "settled";
}

/** Net result for a hand (returned − stake). */
export function handNet(h: PlayerHand): number {
  return h.returned - h.bet;
}
