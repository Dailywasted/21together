import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  handValue,
  bustProbability,
  startRound,
  submitDecision,
  resolveStep,
  playDealer,
  allDecided,
  seededRng,
  createShoe,
  buildDecks,
  type Card,
  type Shoe,
} from "../src";

/** Shoe that deals the given cards in order (then filler). */
function riggedShoe(cards: Card[]): Shoe {
  const filler: Card[] = Array.from({ length: 50 }, () => "2C" as Card);
  return { cards: [...cards, ...filler], pos: 0, cutIndex: 1000, decks: 1, shuffleCount: 1 };
}
const rng = seededRng(1);
const R = DEFAULT_RULES;

describe("handValue", () => {
  it("counts hard totals", () => {
    expect(handValue(["10S", "7H"])).toMatchObject({ total: 17, soft: false, bust: false });
  });
  it("counts soft aces", () => {
    expect(handValue(["AS", "6H"])).toMatchObject({ total: 17, soft: true });
    expect(handValue(["AS", "6H", "10D"])).toMatchObject({ total: 17, soft: false });
    expect(handValue(["AS", "AH"])).toMatchObject({ total: 12, soft: true });
    expect(handValue(["AS", "AH", "AD", "AC"])).toMatchObject({ total: 14, soft: true });
  });
  it("detects blackjack only with two cards", () => {
    expect(handValue(["AS", "KH"]).blackjack).toBe(true);
    expect(handValue(["7S", "7H", "7D"]).blackjack).toBe(false);
    expect(handValue(["7S", "7H", "7D"]).total).toBe(21);
  });
  it("detects busts", () => {
    expect(handValue(["10S", "QH", "2D"]).bust).toBe(true);
  });
});

describe("bustProbability", () => {
  it("is 0 for soft hands and low totals", () => {
    expect(bustProbability(["AS", "9H"])).toBe(0);
    expect(bustProbability(["5S", "6H"])).toBe(0);
  });
  it("matches known infinite-deck values", () => {
    expect(bustProbability(["10S", "2H"])).toBeCloseTo(4 / 13);
    expect(bustProbability(["10S", "6H"])).toBeCloseTo(8 / 13);
    expect(bustProbability(["10S", "QH"])).toBeCloseTo(12 / 13);
  });
});

describe("shoe", () => {
  it("builds 52 unique cards per deck", () => {
    const d = buildDecks(1);
    expect(d).toHaveLength(52);
    expect(new Set(d).size).toBe(52);
    expect(buildDecks(6)).toHaveLength(312);
  });
  it("shuffles deterministically with a seed and keeps all cards", () => {
    const a = createShoe(6, seededRng(42));
    const b = createShoe(6, seededRng(42));
    expect(a.cards).toEqual(b.cards);
    expect([...a.cards].sort()).toEqual(buildDecks(6).sort());
    expect(a.cutIndex).toBe(234);
  });
});

describe("shared-hand round", () => {
  // Deal order: p1, dealer up, p2, dealer hole.
  it("gives every player the same cards and lets each decide", () => {
    // Players: 10,6 = 16. Dealer: 10 up, 7 hole = 17. Next card 5 (=21 for hitters), then dealer done.
    const shoe = riggedShoe(["10S", "10H", "6D", "7C", "5S"]);
    const s = startRound(
      [
        { playerId: "a", bet: 100 },
        { playerId: "b", bet: 50 },
      ],
      shoe,
      rng,
      R,
    );
    expect(s.shared).toEqual(["10S", "6D"]);
    expect(s.phase).toBe("deciding");
    expect(submitDecision(s, "a", "hit")).toBe(true);
    expect(allDecided(s)).toBe(false);
    expect(submitDecision(s, "b", "stand")).toBe(true);
    expect(allDecided(s)).toBe(true);
    const step = resolveStep(s, shoe, rng);
    expect(step.card).toBe("5S");
    expect(step.takers).toEqual(["a"]);
    expect(s.hands.a!.stopAt).toBe(3);
    expect(s.hands.a!.status).toBe("stood"); // 21 auto-stands
    expect(s.hands.b!.stopAt).toBe(2);
    expect(s.phase).toBe("dealer");
    playDealer(s, shoe, rng, R);
    expect(s.dealer).toEqual(["10H", "7C"]);
    expect(s.hands.a!.outcome).toBe("win");
    expect(s.hands.a!.returned).toBe(200);
    expect(s.hands.b!.outcome).toBe("lose");
    expect(s.hands.b!.returned).toBe(0);
  });

  it("undecided players stand on timeout", () => {
    const shoe = riggedShoe(["9S", "10H", "3D", "8C", "4S"]);
    const s = startRound([{ playerId: "a", bet: 10 }], shoe, rng, R);
    const step = resolveStep(s, shoe, rng);
    expect(step.card).toBeNull();
    expect(step.revealed.a).toBe("stand");
    expect(s.hands.a!.status).toBe("stood");
  });

  it("hitters bust together, standers survive", () => {
    // Shared 10,6. Dealer 6 up, 10 hole = 16 → draws.
    const shoe = riggedShoe(["10S", "6H", "6D", "10C", "KS", "2D", "9H"]);
    const s = startRound(
      [
        { playerId: "a", bet: 10 },
        { playerId: "b", bet: 10 },
      ],
      shoe,
      rng,
      R,
    );
    submitDecision(s, "a", "hit");
    submitDecision(s, "b", "stand");
    resolveStep(s, shoe, rng);
    expect(s.hands.a!.status).toBe("busted");
    expect(s.phase).toBe("dealer");
    const drawn = playDealer(s, shoe, rng, R);
    // Dealer 6+10=16, draws 2 → 18.
    expect(drawn).toEqual(["2D"]);
    expect(s.hands.a!.outcome).toBe("lose");
    expect(s.hands.b!.outcome).toBe("lose"); // 16 vs 18
  });

  it("runs multiple decision steps on the same shared row", () => {
    // Shared 2,3 =5; dealer 10 up, 8 hole =18. Cards: 4 (=9), 2 (=11), 9 (=20).
    const shoe = riggedShoe(["2S", "10H", "3D", "8C", "4S", "2H", "9D"]);
    const s = startRound(
      ["a", "b", "c"].map((id) => ({ playerId: id, bet: 20 })),
      shoe,
      rng,
      R,
    );
    submitDecision(s, "a", "hit");
    submitDecision(s, "b", "hit");
    submitDecision(s, "c", "stand"); // stays on 5
    resolveStep(s, shoe, rng);
    submitDecision(s, "a", "hit");
    submitDecision(s, "b", "stand"); // stays on 9
    resolveStep(s, shoe, rng);
    submitDecision(s, "a", "hit"); // 11 + 9 = 20
    resolveStep(s, shoe, rng);
    submitDecision(s, "a", "stand");
    resolveStep(s, shoe, rng);
    expect(s.shared).toEqual(["2S", "3D", "4S", "2H", "9D"]);
    expect(s.hands.a!.stopAt).toBe(5);
    expect(s.hands.b!.stopAt).toBe(3);
    expect(s.hands.c!.stopAt).toBe(2);
    playDealer(s, shoe, rng, R);
    expect(s.hands.a!.outcome).toBe("win");
    expect(s.hands.b!.outcome).toBe("lose");
    expect(s.hands.c!.outcome).toBe("lose");
  });

  it("doubles take exactly one card and double the stake", () => {
    // Shared 5,6 = 11; dealer 9 up, 7 hole = 16. Next 10 → 21. Dealer draws 5 → 21? use 2 → 18.
    const shoe = riggedShoe(["5S", "9H", "6D", "7C", "10S", "2D"]);
    const s = startRound([{ playerId: "a", bet: 50 }, { playerId: "b", bet: 50 }], shoe, rng, R);
    expect(submitDecision(s, "a", "double")).toBe(true);
    submitDecision(s, "b", "hit");
    resolveStep(s, shoe, rng);
    expect(s.hands.a!.status).toBe("doubled");
    expect(s.hands.a!.bet).toBe(100);
    expect(s.hands.b!.status).toBe("stood"); // 21 auto-stand
    expect(s.phase).toBe("dealer");
    playDealer(s, shoe, rng, R);
    expect(s.hands.a!.returned).toBe(200);
  });

  it("refuses double after the first step", () => {
    const shoe = riggedShoe(["2S", "9H", "3D", "7C", "2C"]);
    const s = startRound([{ playerId: "a", bet: 10 }], shoe, rng, R);
    submitDecision(s, "a", "hit");
    resolveStep(s, shoe, rng);
    expect(submitDecision(s, "a", "double")).toBe(false);
  });

  it("shared blackjack pays 3:2 immediately", () => {
    const shoe = riggedShoe(["AS", "9H", "KD", "7C"]);
    const s = startRound([{ playerId: "a", bet: 100 }, { playerId: "b", bet: 15 }], shoe, rng, R);
    expect(s.early).toBe("shared-blackjack");
    expect(s.phase).toBe("settled");
    expect(s.hands.a!.outcome).toBe("blackjack");
    expect(s.hands.a!.returned).toBe(250);
    expect(s.hands.b!.returned).toBe(15 + 22);
  });

  it("dealer blackjack with peek ends the round", () => {
    const shoe = riggedShoe(["10S", "AH", "9D", "KC"]);
    const s = startRound([{ playerId: "a", bet: 100 }], shoe, rng, R);
    expect(s.early).toBe("dealer-blackjack");
    expect(s.hands.a!.outcome).toBe("lose");
    expect(s.holeRevealed).toBe(true);
  });

  it("both blackjack pushes", () => {
    const shoe = riggedShoe(["AS", "AH", "KD", "QC"]);
    const s = startRound([{ playerId: "a", bet: 100 }], shoe, rng, R);
    expect(s.hands.a!.outcome).toBe("push");
    expect(s.hands.a!.returned).toBe(100);
  });

  it("dealer stands on soft 17 by default and hits with H17", () => {
    const mk = () => riggedShoe(["10S", "AH", "8D", "6C", "4S"]);
    const s1 = startRound([{ playerId: "a", bet: 10 }], mk(), rng, R);
    // Note: shoe objects differ; rebuild per round.
    const shoe1 = mk();
    const r1 = startRound([{ playerId: "a", bet: 10 }], shoe1, rng, R);
    resolveStep(r1, shoe1, rng);
    playDealer(r1, shoe1, rng, R);
    expect(r1.dealer).toEqual(["AH", "6C"]);
    expect(r1.hands.a!.outcome).toBe("win"); // 18 vs 17
    const shoe2 = mk();
    const r2 = startRound([{ playerId: "a", bet: 10 }], shoe2, rng, { ...R, dealerHitsSoft17: true });
    resolveStep(r2, shoe2, rng);
    playDealer(r2, shoe2, rng, { ...R, dealerHitsSoft17: true });
    expect(r2.dealer).toEqual(["AH", "6C", "4S"]); // soft 21
    expect(r2.hands.a!.outcome).toBe("lose");
    void s1;
  });

  it("dealer does not draw when everyone busted", () => {
    const shoe = riggedShoe(["10S", "5H", "6D", "10C", "KS", "9D"]);
    const s = startRound([{ playerId: "a", bet: 10 }], shoe, rng, R);
    submitDecision(s, "a", "hit");
    resolveStep(s, shoe, rng);
    const drawn = playDealer(s, shoe, rng, R);
    expect(drawn).toEqual([]);
    expect(s.dealer).toHaveLength(2);
  });
});

describe("simulation", () => {
  it("basic-ish strategy loses a small plausible amount over many rounds", () => {
    const rng2 = seededRng(7);
    let shoe = createShoe(6, rng2);
    let wagered = 0;
    let net = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      if (shoe.pos >= shoe.cutIndex) shoe = createShoe(6, rng2);
      const s = startRound([{ playerId: "a", bet: 10 }], shoe, rng2, R);
      const up = handValue([s.dealer[0]!]).total;
      while (s.phase === "deciding") {
        const v = handValue(s.shared);
        let d: "hit" | "stand" | "double" = "stand";
        if (s.step === 0 && !v.soft && (v.total === 11 || (v.total === 10 && up < 10))) d = "double";
        else if (v.soft) d = v.total <= 17 ? "hit" : "stand";
        else if (v.total <= 11) d = "hit";
        else if (v.total <= 16 && (up >= 7 || up === 1)) d = "hit";
        else if (v.total === 12 && up <= 3) d = "hit";
        submitDecision(s, "a", d);
        resolveStep(s, shoe, rng2);
      }
      playDealer(s, shoe, rng2, R);
      const h = s.hands.a!;
      wagered += h.bet;
      net += h.returned - h.bet;
    }
    const edge = -net / wagered;
    // Simplified strategy without splits: house edge should land roughly between 0% and 3%.
    expect(edge).toBeGreaterThan(-0.01);
    expect(edge).toBeLessThan(0.03);
  });
});
