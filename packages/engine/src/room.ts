import { handValue, bustProbability, type Card } from "./cards";
import { createShoe, needsShuffle, cardsRemaining, cryptoRng, type Rng, type Shoe } from "./shoe";
import { DEFAULT_RULES, sanitizeRules, type Rules } from "./rules";
import {
  startRound,
  submitDecision,
  allDecided,
  resolveStep,
  playDealer,
  canDouble,
  handNet,
  type Decision,
  type HandStatus,
  type Outcome,
  type RoundState,
} from "./round";
import { ACHIEVEMENTS, type AchievementCode } from "./achievements";

export type RoomPhase = "lobby" | "betting" | "dealing" | "deciding" | "drawing" | "dealer" | "payout" | "ended";

/** Animation-driven phase durations (ms). */
export const TIMING = {
  dealMs: 2600,
  drawMs: 1700,
  noDrawMs: 900,
  allLockedMs: 900,
  allDecidedMs: 450,
  dealerFirstMs: 900,
  dealerCardMs: 950,
  payoutMs: 6500,
} as const;

export interface PlayerStats {
  hands: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  busts: number;
  doubles: number;
  doubleWins: number;
  hits: number;
  wagered: number;
  net: number;
  biggestWin: number;
  biggestLoss: number;
  streak: number;
  bestStreak: number;
  lowStandWins: number;
}

export function emptyStats(): PlayerStats {
  return {
    hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0, busts: 0, doubles: 0, doubleWins: 0,
    hits: 0, wagered: 0, net: 0, biggestWin: 0, biggestLoss: 0, streak: 0, bestStreak: 0, lowStandWins: 0,
  };
}

export interface Player {
  id: string;
  deviceId: string;
  name: string;
  avatar: string;
  seat: number | null;
  chips: number;
  buyIn: number;
  bet: number;
  betLocked: boolean;
  lastBet: number;
  connected: boolean;
  left: boolean;
  stats: PlayerStats;
  achievements: AchievementCode[];
  /** Lowest chip count seen (for the comeback achievement). */
  lowWater: number;
  joinedAt: number;
  /** Per-round flags used for achievements. */
  flags: { brave16?: boolean; lowStand?: boolean };
}

export interface RoundResult {
  playerId: string;
  name: string;
  avatar: string;
  bet: number;
  stopAt: number;
  total: number;
  outcome: Outcome;
  net: number;
  doubled: boolean;
  decisions: Decision[];
}

export interface RoundSummary {
  no: number;
  at: number;
  shared: Card[];
  dealer: Card[];
  dealerTotal: number;
  early: RoundState["early"];
  results: RoundResult[];
}

export interface Award {
  code: "chip_leader" | "biggest_win" | "blackjack_magnet" | "most_reckless" | "iron_stander" | "hot_hand";
  playerId: string;
  name: string;
  avatar: string;
  value: number;
}

export interface StepInfo {
  card: Card | null;
  takers: string[];
  revealed: Record<string, Decision>;
}

export interface RoomState {
  code: string;
  createdAt: number;
  rules: Rules;
  phase: RoomPhase;
  /** Epoch ms when the current timed phase ends (null = waiting / paused). */
  deadline: number | null;
  /** Length of the current timed phase (for countdown rings). */
  phaseMs: number;
  paused: { remaining: number | null } | null;
  roundNo: number;
  shoe: Shoe;
  round: RoundState | null;
  /** Number of dealer cards visible (hole card hidden until >= 2). */
  dealerShown: number;
  lastStep: StepInfo | null;
  players: Record<string, Player>;
  seats: (string | null)[];
  rail: string[];
  banned: string[];
  history: RoundSummary[];
  awards: Award[] | null;
  idSeq: number;
}

export type RoomEvent =
  | { k: "joined"; playerId: string; name: string }
  | { k: "left"; playerId: string; name: string }
  | { k: "shuffle" }
  | { k: "deal" }
  | { k: "noBets" }
  | { k: "step"; card: Card | null; takers: string[]; revealed: Record<string, Decision> }
  | { k: "dealerCard"; card: Card; index: number }
  | { k: "payout"; results: RoundResult[] }
  | { k: "achievement"; playerId: string; name: string; code: AchievementCode }
  | { k: "kicked"; playerId: string }
  | { k: "topup"; playerId: string; amount: number }
  | { k: "ended" };

/** Emitted when a round is complete, for persistence. */
export interface RoundCompletePayload {
  summary: RoundSummary;
  players: { playerId: string; deviceId: string; name: string; avatar: string; chips: number; net: number }[];
}

export class RoomError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const AVATARS = ["🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐲", "🦉", "🐺", "🐻", "🐵", "🦈", "🐧", "🦩", "🐝"];

export function sanitizeName(name: string): string {
  const cleaned = Array.from(name.replace(/[\u0000-\u001f\u007f<>]/g, "").trim()).slice(0, 16).join("");
  return cleaned || "Player";
}

export class RoomCore {
  state: RoomState;
  events: RoomEvent[] = [];
  completed: RoundCompletePayload[] = [];
  private rng: Rng;

  constructor(state: RoomState, rng: Rng = cryptoRng) {
    this.state = state;
    this.rng = rng;
  }

  static create(code: string, now: number, rules: Partial<Rules> = {}, rng: Rng = cryptoRng): RoomCore {
    const r = sanitizeRules(DEFAULT_RULES, rules);
    const state: RoomState = {
      code,
      createdAt: now,
      rules: r,
      phase: "lobby",
      deadline: null,
      phaseMs: 0,
      paused: null,
      roundNo: 0,
      shoe: createShoe(r.decks, rng, r.penetration),
      round: null,
      dealerShown: 0,
      lastStep: null,
      players: {},
      seats: Array.from({ length: r.maxSeats }, () => null),
      rail: [],
      banned: [],
      history: [],
      awards: null,
      idSeq: 0,
    };
    return new RoomCore(state, rng);
  }

  /** Drains queued events. */
  takeEvents(): RoomEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  takeCompleted(): RoundCompletePayload[] {
    const c = this.completed;
    this.completed = [];
    return c;
  }

  // ───────────────────────── players ─────────────────────────

  playerByDevice(deviceId: string): Player | undefined {
    return Object.values(this.state.players).find((p) => p.deviceId === deviceId);
  }

  /** Joins (or re-joins) a player. Returns the player. */
  join(deviceId: string, name: string, avatar: string, now: number): Player {
    const s = this.state;
    if (s.banned.includes(deviceId)) throw new RoomError("banned");
    let p = this.playerByDevice(deviceId);
    const cleanName = sanitizeName(name);
    const cleanAvatar = AVATARS.includes(avatar) ? avatar : AVATARS[Math.floor(this.rng() * AVATARS.length)]!;
    if (p) {
      p.name = cleanName;
      p.avatar = cleanAvatar;
      p.connected = true;
      if (p.left) {
        p.left = false;
        this.placePlayer(p);
        this.events.push({ k: "joined", playerId: p.id, name: p.name });
      }
      return p;
    }
    s.idSeq++;
    p = {
      id: `p${s.idSeq}`,
      deviceId,
      name: cleanName,
      avatar: cleanAvatar,
      seat: null,
      chips: s.rules.startingChips,
      buyIn: s.rules.startingChips,
      bet: 0,
      betLocked: false,
      lastBet: 0,
      connected: true,
      left: false,
      stats: emptyStats(),
      achievements: [],
      lowWater: s.rules.startingChips,
      joinedAt: now,
      flags: {},
    };
    s.players[p.id] = p;
    this.placePlayer(p);
    this.events.push({ k: "joined", playerId: p.id, name: p.name });
    // Betting was idle with nobody seated: start the clock now.
    if (s.phase === "betting" && s.deadline === null && !s.paused && p.seat !== null) {
      this.setDeadline(now, s.rules.betSeconds * 1000);
    }
    return p;
  }

  private placePlayer(p: Player): void {
    const s = this.state;
    if (p.seat !== null || s.rail.includes(p.id)) return;
    // Mid-round joiners go to a free seat but only play from the next round (no bet = sits out).
    const free = s.seats.findIndex((x) => x === null);
    if (free >= 0) {
      s.seats[free] = p.id;
      p.seat = free;
    } else {
      s.rail.push(p.id);
    }
  }

  private unseat(p: Player): void {
    const s = this.state;
    if (p.seat !== null) s.seats[p.seat] = null;
    p.seat = null;
    s.rail = s.rail.filter((id) => id !== p.id);
    p.bet = 0;
    p.betLocked = false;
  }

  setConnected(playerId: string, connected: boolean): void {
    const p = this.state.players[playerId];
    if (p) p.connected = connected;
  }

  leave(playerId: string): void {
    const p = this.state.players[playerId];
    if (!p || p.left) return;
    if (this.inHand(playerId)) throw new RoomError("in_hand");
    p.left = true;
    this.unseat(p);
    this.events.push({ k: "left", playerId, name: p.name });
  }

  private inHand(playerId: string): boolean {
    const r = this.state.round;
    return !!r && r.phase !== "settled" && !!r.hands[playerId] && this.state.phase !== "payout";
  }

  // ───────────────────────── betting ─────────────────────────

  placeBet(playerId: string, amount: number, lock: boolean, now: number): void {
    const s = this.state;
    const p = s.players[playerId];
    if (!p || p.left) throw new RoomError("not_player");
    if (s.phase !== "betting") throw new RoomError("not_betting");
    if (p.seat === null) throw new RoomError("not_seated");
    amount = Math.floor(amount);
    if (amount !== 0 && (amount < s.rules.minBet || amount > s.rules.maxBet)) throw new RoomError("bet_range");
    if (amount > p.chips) throw new RoomError("no_chips");
    p.bet = amount;
    p.betLocked = lock && amount > 0;
    if (s.deadline !== null && !s.paused && this.allBetsLocked()) {
      const target = now + TIMING.allLockedMs;
      if (target < s.deadline) s.deadline = target;
    }
  }

  private eligibleBettors(): Player[] {
    const s = this.state;
    return s.seats
      .map((id) => (id ? s.players[id] : undefined))
      .filter((p): p is Player => !!p && p.connected && p.chips >= s.rules.minBet);
  }

  private allBetsLocked(): boolean {
    const el = this.eligibleBettors();
    return el.length > 0 && el.every((p) => p.betLocked);
  }

  private startBetting(now: number): void {
    const s = this.state;
    s.phase = "betting";
    s.round = null;
    s.lastStep = null;
    s.dealerShown = 0;
    // Promote rail players into free seats.
    for (let i = 0; i < s.seats.length && s.rail.length > 0; i++) {
      if (s.seats[i] === null) {
        const id = s.rail.shift()!;
        s.seats[i] = id;
        s.players[id]!.seat = i;
      }
    }
    for (const p of Object.values(s.players)) {
      p.bet = 0;
      p.betLocked = false;
      p.flags = {};
    }
    if (needsShuffle(s.shoe) || s.shoe.decks !== s.rules.decks) {
      s.shoe = createShoe(s.rules.decks, this.rng, s.rules.penetration, s.shoe.shuffleCount);
      this.events.push({ k: "shuffle" });
    }
    const anySeated = s.seats.some((x) => x !== null);
    if (anySeated) this.setDeadline(now, s.rules.betSeconds * 1000);
    else {
      s.deadline = null;
      s.phaseMs = 0;
    }
  }

  private endBetting(now: number): void {
    const s = this.state;
    const bettors = s.seats
      .map((id) => (id ? s.players[id] : undefined))
      .filter((p): p is Player => !!p && p.bet >= s.rules.minBet && p.bet <= p.chips);
    if (bettors.length === 0) {
      this.events.push({ k: "noBets" });
      this.startBetting(now);
      return;
    }
    s.roundNo++;
    for (const p of bettors) {
      p.chips -= p.bet;
      p.lastBet = p.bet;
      p.lowWater = Math.min(p.lowWater, p.chips);
    }
    s.round = startRound(
      bettors.map((p) => ({ playerId: p.id, bet: p.bet })),
      s.shoe,
      this.rng,
      s.rules,
    );
    s.dealerShown = 1;
    s.phase = "dealing";
    this.setDeadline(now, TIMING.dealMs);
    this.events.push({ k: "deal" });
  }

  // ───────────────────────── decisions ─────────────────────────

  decide(playerId: string, decision: Decision, now: number): void {
    const s = this.state;
    const r = s.round;
    if (s.phase !== "deciding" || !r) throw new RoomError("not_deciding");
    const p = s.players[playerId];
    const h = r.hands[playerId];
    if (!p || !h) throw new RoomError("not_in_hand");
    if (decision === "double" && (!canDouble(r, playerId) || p.chips < h.bet)) throw new RoomError("cannot_double");
    if (!submitDecision(r, playerId, decision)) throw new RoomError("bad_decision");
    if (allDecided(r) && s.deadline !== null && !s.paused) {
      const target = now + TIMING.allDecidedMs;
      if (target < s.deadline) s.deadline = target;
    }
  }

  private enterDeciding(now: number): void {
    this.state.phase = "deciding";
    this.setDeadline(now, this.state.rules.decisionSeconds * 1000);
  }

  private resolveDecisions(now: number): void {
    const s = this.state;
    const r = s.round!;
    // Remember pre-draw totals for achievements.
    const before = handValue(r.shared);
    const res = resolveStep(r, s.shoe, this.rng);
    for (const [pid, d] of Object.entries(res.revealed)) {
      const p = s.players[pid];
      if (!p) continue;
      if (d === "double") {
        // resolveStep already doubled hand.bet; take the extra stake.
        const extra = r.hands[pid]!.bet / 2;
        p.chips -= extra;
        p.lowWater = Math.min(p.lowWater, p.chips);
      }
      if (d === "hit") {
        p.stats.hits++;
        if (!before.soft && before.total === 16) p.flags.brave16 = true;
      }
      if (d === "stand" && before.total <= 12) p.flags.lowStand = true;
    }
    s.lastStep = { card: res.card, takers: res.takers, revealed: res.revealed };
    this.events.push({ k: "step", card: res.card, takers: res.takers, revealed: res.revealed });
    s.phase = "drawing";
    this.setDeadline(now, res.card ? TIMING.drawMs : TIMING.noDrawMs);
  }

  private enterDealer(now: number): void {
    const s = this.state;
    const r = s.round!;
    if (r.phase !== "settled") playDealer(r, s.shoe, this.rng, s.rules);
    s.phase = "dealer";
    s.dealerShown = 1;
    this.setDeadline(now, TIMING.dealerFirstMs);
  }

  private advanceDealer(now: number): void {
    const s = this.state;
    const r = s.round!;
    if (s.dealerShown < r.dealer.length) {
      s.dealerShown++;
      this.events.push({ k: "dealerCard", card: r.dealer[s.dealerShown - 1]!, index: s.dealerShown - 1 });
      this.setDeadline(now, TIMING.dealerCardMs);
    } else {
      this.payout(now);
    }
  }

  // ───────────────────────── payout ─────────────────────────

  private payout(now: number): void {
    const s = this.state;
    const r = s.round!;
    const results: RoundResult[] = [];
    for (const h of Object.values(r.hands)) {
      const p = s.players[h.playerId];
      if (!p) continue;
      p.chips += h.returned;
      const net = handNet(h);
      const cards = r.shared.slice(0, h.stopAt);
      const total = handValue(cards).total;
      const doubled = h.decisions.includes("double");
      const st = p.stats;
      st.hands++;
      st.wagered += h.bet;
      st.net += net;
      if (h.outcome === "win" || h.outcome === "blackjack") {
        st.wins++;
        st.streak++;
        st.bestStreak = Math.max(st.bestStreak, st.streak);
        st.biggestWin = Math.max(st.biggestWin, net);
        if (doubled) st.doubleWins++;
        if (p.flags.lowStand) st.lowStandWins++;
      } else if (h.outcome === "push") {
        st.pushes++;
      } else {
        st.losses++;
        st.streak = 0;
        st.biggestLoss = Math.max(st.biggestLoss, -net);
      }
      if (h.outcome === "blackjack") st.blackjacks++;
      if (h.status === "busted") st.busts++;
      if (doubled) st.doubles++;
      this.checkAchievements(p, h.outcome!, net, cards.length, doubled, h.bet);
      results.push({
        playerId: p.id,
        name: p.name,
        avatar: p.avatar,
        bet: h.bet,
        stopAt: h.stopAt,
        total,
        outcome: h.outcome!,
        net,
        doubled,
        decisions: h.decisions,
      });
    }
    results.sort((a, b) => b.net - a.net);
    const summary: RoundSummary = {
      no: s.roundNo,
      at: now,
      shared: [...r.shared],
      dealer: [...r.dealer],
      dealerTotal: handValue(r.dealer).total,
      early: r.early,
      results,
    };
    s.history.unshift(summary);
    if (s.history.length > 200) s.history.length = 200;
    s.dealerShown = r.dealer.length;
    s.phase = "payout";
    this.setDeadline(now, TIMING.payoutMs);
    this.events.push({ k: "payout", results });
    this.completed.push({
      summary,
      players: results.map((x) => {
        const p = s.players[x.playerId]!;
        return { playerId: p.id, deviceId: p.deviceId, name: p.name, avatar: p.avatar, chips: p.chips, net: x.net };
      }),
    });
  }

  private award(p: Player, code: AchievementCode): void {
    if (p.achievements.includes(code)) return;
    p.achievements.push(code);
    this.events.push({ k: "achievement", playerId: p.id, name: p.name, code });
  }

  private checkAchievements(p: Player, outcome: Outcome, net: number, cardCount: number, doubled: boolean, bet: number): void {
    const won = outcome === "win" || outcome === "blackjack";
    const start = this.state.rules.startingChips;
    if (won) this.award(p, "first_win");
    if (outcome === "blackjack") this.award(p, "blackjack");
    if (won && doubled) this.award(p, "double_hero");
    if (won && p.flags.brave16) this.award(p, "brave_16");
    if (won && p.flags.lowStand) this.award(p, "iron_nerves");
    if (won && cardCount >= 5) this.award(p, "five_card");
    if (p.stats.streak >= 3) this.award(p, "hot_3");
    if (p.stats.streak >= 5) this.award(p, "on_fire");
    if (bet >= this.state.rules.maxBet) this.award(p, "high_roller");
    if (p.lowWater <= start * 0.25 && p.chips >= start) this.award(p, "comeback");
    if (p.chips >= start * 2) this.award(p, "double_up");
    if (net >= 500) this.award(p, "big_win");
  }

  // ───────────────────────── host ─────────────────────────

  hostStart(now: number): void {
    const s = this.state;
    if (s.phase === "lobby" || s.phase === "ended") {
      s.awards = null;
      this.startBetting(now);
    }
  }

  pause(now: number): void {
    const s = this.state;
    if (s.paused || s.phase === "lobby" || s.phase === "ended") return;
    s.paused = { remaining: s.deadline === null ? null : Math.max(0, s.deadline - now) };
    s.deadline = null;
  }

  resume(now: number): void {
    const s = this.state;
    if (!s.paused) return;
    const rem = s.paused.remaining;
    s.paused = null;
    if (rem !== null) s.deadline = now + Math.max(rem, 600);
    else if (s.phase === "betting" && s.seats.some((x) => x !== null)) this.setDeadline(now, s.rules.betSeconds * 1000);
  }

  /** Ends the current timer immediately. */
  skip(now: number): void {
    const s = this.state;
    if (s.paused) return;
    if (s.deadline !== null) {
      s.deadline = now;
      this.tick(now);
    }
  }

  kick(playerId: string, ban: boolean): void {
    const s = this.state;
    const p = s.players[playerId];
    if (!p) return;
    if (this.inHand(playerId)) {
      // Force-stand so the round can continue; the stake stays on the table.
      const h = s.round!.hands[playerId]!;
      if (h.status === "active") h.pending = "stand";
    }
    p.left = true;
    p.connected = false;
    this.unseat(p);
    if (ban && !s.banned.includes(p.deviceId)) s.banned.push(p.deviceId);
    this.events.push({ k: "kicked", playerId });
  }

  topUp(playerId: string, amount: number): void {
    const p = this.state.players[playerId];
    if (!p) return;
    amount = Math.max(0, Math.min(1_000_000, Math.floor(amount)));
    if (amount === 0) return;
    p.chips += amount;
    p.buyIn += amount;
    p.lowWater = Math.min(p.lowWater, p.chips);
    this.events.push({ k: "topup", playerId, amount });
  }

  /** Tops up every player below the minimum bet back to the starting stack. */
  topUpBroke(): void {
    const s = this.state;
    for (const p of Object.values(s.players)) {
      if (!p.left && p.chips < s.rules.minBet) this.topUp(p.id, s.rules.startingChips - p.chips);
    }
  }

  updateRules(patch: Partial<Rules>): void {
    const s = this.state;
    const next = sanitizeRules(s.rules, patch);
    // Seat count can only grow while players are seated beyond it.
    if (next.maxSeats !== s.seats.length) {
      if (next.maxSeats > s.seats.length) {
        while (s.seats.length < next.maxSeats) s.seats.push(null);
      } else {
        for (let i = s.seats.length - 1; i >= next.maxSeats; i--) {
          const id = s.seats[i];
          if (id) {
            if (this.inHand(id)) {
              next.maxSeats = i + 1;
              break;
            }
            const p = s.players[id]!;
            p.seat = null;
            s.rail.unshift(id);
          }
          s.seats.length = i;
        }
        // Keep seat array aligned with the (possibly adjusted) maxSeats.
        while (s.seats.length < next.maxSeats) s.seats.push(null);
      }
    }
    s.rules = next;
  }

  endNight(now: number): void {
    const s = this.state;
    if (this.state.round && s.phase !== "payout" && s.phase !== "betting") {
      // Refund stakes of an unfinished round.
      for (const h of Object.values(s.round!.hands)) {
        const p = s.players[h.playerId];
        if (p) p.chips += h.bet;
      }
      s.roundNo = Math.max(0, s.roundNo - 1);
    }
    s.round = null;
    s.phase = "ended";
    s.deadline = null;
    s.paused = null;
    s.awards = computeAwards(Object.values(s.players));
    this.events.push({ k: "ended" });
    void now;
  }

  // ───────────────────────── clock ─────────────────────────

  private setDeadline(now: number, ms: number): void {
    this.state.deadline = now + ms;
    this.state.phaseMs = ms;
  }

  /** Advances any expired timers. Call on every alarm and before handling commands. */
  tick(now: number): boolean {
    let changed = false;
    // Loop: a phase transition can schedule an already-expired deadline in theory; cap iterations.
    for (let i = 0; i < 50; i++) {
      const s = this.state;
      if (s.paused || s.deadline === null || now < s.deadline) break;
      changed = true;
      switch (s.phase) {
        case "betting":
          this.endBetting(now);
          break;
        case "dealing":
          if (s.round!.phase === "settled") this.enterDealer(now);
          else this.enterDeciding(now);
          break;
        case "deciding":
          this.resolveDecisions(now);
          break;
        case "drawing":
          if (s.round!.phase === "deciding") this.enterDeciding(now);
          else this.enterDealer(now);
          break;
        case "dealer":
          this.advanceDealer(now);
          break;
        case "payout":
          this.startBetting(now);
          break;
        default:
          s.deadline = null;
      }
    }
    return changed;
  }

  // ───────────────────────── views ─────────────────────────

  snapshot(now: number): PublicSnapshot {
    return buildSnapshot(this.state, now);
  }

  privateView(playerId: string): PrivateView | null {
    const s = this.state;
    const p = s.players[playerId];
    if (!p) return null;
    const r = s.round;
    const h = r?.hands[playerId];
    const cards = h && r ? r.shared.slice(0, h.stopAt) : [];
    return {
      playerId,
      pending: h?.pending ?? null,
      canDouble:
        !!h && !!r && s.phase === "deciding" && canDouble(r, playerId) && p.chips >= h.bet,
      bustChance: h && h.status === "active" ? bustProbability(cards) : 0,
      stats: p.stats,
      achievements: p.achievements,
      lastBet: p.lastBet,
    };
  }
}

// ───────────────────────── public snapshot ─────────────────────────

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number | null;
  chips: number;
  net: number;
  bet: number;
  betLocked: boolean;
  connected: boolean;
  /** Hand status in the current round (null when sitting out). */
  hand: {
    bet: number;
    status: HandStatus;
    stopAt: number;
    total: number;
    soft: boolean;
    /** Whether a decision is locked for the current step (the choice itself stays hidden). */
    locked: boolean;
    doubled: boolean;
    outcome: Outcome | null;
    net: number | null;
  } | null;
  streak: number;
  achievements: number;
}

export interface PublicSnapshot {
  code: string;
  phase: RoomPhase;
  paused: boolean;
  deadline: number | null;
  phaseMs: number;
  serverNow: number;
  roundNo: number;
  rules: Rules;
  /** Dealer cards; null entries are face-down. */
  dealer: (Card | null)[];
  dealerTotal: number | null;
  shared: Card[];
  step: number;
  lastStep: StepInfo | null;
  seats: (string | null)[];
  rail: string[];
  players: PublicPlayer[];
  leaderboard: { id: string; name: string; avatar: string; chips: number; net: number; streak: number }[];
  history: RoundSummary[];
  shoe: { remaining: number; total: number; shuffleCount: number };
  awards: Award[] | null;
}

export interface PrivateView {
  playerId: string;
  pending: Decision | null;
  canDouble: boolean;
  bustChance: number;
  stats: PlayerStats;
  achievements: AchievementCode[];
  lastBet: number;
}

const SHOW_OUTCOMES: RoomPhase[] = ["payout", "betting", "ended", "lobby"];

export function buildSnapshot(s: RoomState, now: number): PublicSnapshot {
  const r = s.round;
  const showOutcome = SHOW_OUTCOMES.includes(s.phase);
  let dealer: (Card | null)[] = [];
  let dealerTotal: number | null = null;
  if (r) {
    const shown = Math.max(1, s.dealerShown);
    dealer = r.dealer.slice(0, Math.max(2, shown)).map((c, i) => (i < shown ? c : null));
    const visible = r.dealer.slice(0, shown);
    dealerTotal = handValue(visible).total;
  }
  const players: PublicPlayer[] = Object.values(s.players)
    .filter((p) => !p.left)
    .map((p) => {
      const h = r?.hands[p.id];
      let hand: PublicPlayer["hand"] = null;
      if (h && r) {
        const v = handValue(r.shared.slice(0, h.stopAt));
        hand = {
          bet: h.bet,
          status: h.status,
          stopAt: h.stopAt,
          total: v.total,
          soft: v.soft,
          locked: h.pending !== null,
          doubled: h.decisions.includes("double"),
          outcome: showOutcome ? h.outcome : null,
          net: showOutcome && h.outcome ? h.returned - h.bet : null,
        };
      }
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        seat: p.seat,
        chips: p.chips,
        net: p.chips - p.buyIn,
        bet: p.bet,
        betLocked: p.betLocked,
        connected: p.connected,
        hand,
        streak: p.stats.streak,
        achievements: p.achievements.length,
      };
    });
  const leaderboard = Object.values(s.players)
    .filter((p) => !p.left || p.stats.hands > 0)
    .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, chips: p.chips, net: p.chips - p.buyIn, streak: p.stats.streak }))
    .sort((a, b) => b.net - a.net || b.chips - a.chips);
  return {
    code: s.code,
    phase: s.phase,
    paused: !!s.paused,
    deadline: s.deadline,
    phaseMs: s.phaseMs,
    serverNow: now,
    roundNo: s.roundNo,
    rules: s.rules,
    dealer,
    dealerTotal,
    shared: r ? [...r.shared] : [],
    step: r?.step ?? 0,
    lastStep: s.phase === "drawing" ? s.lastStep : null,
    seats: [...s.seats],
    rail: [...s.rail],
    players,
    leaderboard,
    history: s.history.slice(0, 15),
    shoe: { remaining: cardsRemaining(s.shoe), total: s.shoe.cards.length, shuffleCount: s.shoe.shuffleCount },
    awards: s.awards,
  };
}

export function computeAwards(all: Player[]): Award[] {
  const players = all.filter((p) => p.stats.hands > 0);
  const out: Award[] = [];
  const pick = (code: Award["code"], score: (p: Player) => number, min = 1) => {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const p of players) {
      const v = score(p);
      if (v > bestScore) {
        bestScore = v;
        best = p;
      }
    }
    if (best && bestScore >= min) out.push({ code, playerId: best.id, name: best.name, avatar: best.avatar, value: bestScore });
  };
  pick("chip_leader", (p) => p.chips - p.buyIn, -Infinity);
  pick("biggest_win", (p) => p.stats.biggestWin);
  pick("blackjack_magnet", (p) => p.stats.blackjacks);
  pick("most_reckless", (p) => p.stats.busts);
  pick("iron_stander", (p) => p.stats.lowStandWins);
  pick("hot_hand", (p) => p.stats.bestStreak, 2);
  return out;
}

export { ACHIEVEMENTS };
