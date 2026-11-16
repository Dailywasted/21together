import { describe, expect, it } from "vitest";
import { RoomCore, TIMING, seededRng, RoomError, makeRunners, makeScript, RACE_RUNNERS, type Card } from "../src";

function rig(room: RoomCore, cards: Card[]) {
  const filler: Card[] = Array.from({ length: 200 }, () => "2C" as Card);
  room.state.shoe = { cards: [...cards, ...filler], pos: 0, cutIndex: 10_000, decks: 6, shuffleCount: 1 };
}

function setup(n = 2) {
  let now = 1_000_000;
  const room = RoomCore.create("ABCD", now, {}, seededRng(3));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(room.join(`dev${i}`, `P${i}`, "🦊", now).id);
  const advance = (ms: number) => {
    now += ms;
    room.tick(now);
  };
  return { room, ids, now: () => now, advance };
}

describe("RoomCore lifecycle", () => {
  it("fills seats from the middle outward", () => {
    const { room } = setup(3);
    expect(room.state.seats.map((x) => (x ? 1 : 0)).join("")).toBe("000011100000");
  });

  it("seats players and puts the 13th on the rail", () => {
    const { room } = setup(13);
    expect(room.state.seats.filter(Boolean)).toHaveLength(12);
    expect(room.state.rail).toHaveLength(1);
  });

  it("re-joining with the same device keeps chips and seat", () => {
    const { room, ids, now } = setup(1);
    room.state.players[ids[0]!]!.chips = 777;
    const again = room.join("dev0", "Renamed", "🐼", now());
    expect(again.id).toBe(ids[0]);
    expect(again.chips).toBe(777);
    expect(again.name).toBe("Renamed");
    expect(Object.keys(room.state.players)).toHaveLength(1);
  });

  it("plays a full round end to end", () => {
    const { room, ids, now, advance } = setup(2);
    const [a, b] = ids as [string, string];
    room.hostStart(now());
    expect(room.state.phase).toBe("betting");
    // Shared 10,6 ; dealer 10 up, 7 hole; next 5.
    rig(room, ["10S", "10H", "6D", "7C", "5S"]);
    room.placeBet(a, 100, true, now());
    room.placeBet(b, 50, true, now());
    // All locked → shortened deadline.
    expect(room.state.deadline! - now()).toBeLessThanOrEqual(TIMING.allLockedMs);
    advance(TIMING.allLockedMs);
    expect(room.state.phase).toBe("dealing");
    expect(room.state.players[a]!.chips).toBe(900);
    const snapDeal = room.snapshot(now());
    expect(snapDeal.dealer).toEqual(["10H", null]); // hole hidden
    advance(TIMING.dealMs);
    expect(room.state.phase).toBe("deciding");
    room.decide(a, "hit", now());
    room.decide(b, "stand", now());
    // Choices hidden in the public snapshot
    const sp = room.snapshot(now());
    expect(sp.players.find((p) => p.id === a)!.hand!.locked).toBe(true);
    expect(JSON.stringify(sp)).not.toContain('"hit"');
    expect(room.privateView(a)!.pending).toBe("hit");
    advance(TIMING.allDecidedMs);
    expect(room.state.phase).toBe("drawing");
    expect(room.snapshot(now()).lastStep!.card).toBe("5S");
    advance(TIMING.drawMs);
    expect(room.state.phase).toBe("dealer");
    // Outcomes are not exposed before payout
    expect(room.snapshot(now()).players.every((p) => p.hand?.outcome === null)).toBe(true);
    advance(TIMING.dealerFirstMs); // hole card
    expect(room.snapshot(now()).dealer).toEqual(["10H", "7C"]);
    advance(TIMING.dealerCardMs); // no more cards → payout
    expect(room.state.phase).toBe("payout");
    expect(room.state.players[a]!.chips).toBe(1100);
    expect(room.state.players[b]!.chips).toBe(950);
    expect(room.state.history).toHaveLength(1);
    expect(room.state.history[0]!.results[0]!.playerId).toBe(a);
    expect(room.takeCompleted()).toHaveLength(1);
    const snap = room.snapshot(now());
    expect(snap.leaderboard[0]!.id).toBe(a);
    expect(snap.players.find((p) => p.id === a)!.hand!.outcome).toBe("win");
    const ev = room.takeEvents().map((e) => e.k);
    expect(ev).toContain("payout");
    expect(ev).toContain("achievement");
    advance(TIMING.payoutMs);
    expect(room.state.phase).toBe("betting");
    expect(room.state.roundNo).toBe(1);
  });

  it("restarts betting when nobody bets", () => {
    const { room, now, advance } = setup(1);
    room.hostStart(now());
    advance(room.state.rules.betSeconds * 1000);
    expect(room.state.phase).toBe("betting");
    expect(room.state.roundNo).toBe(0);
  });

  it("waits without a timer when nobody is seated", () => {
    const { room, now } = setup(0);
    room.hostStart(now());
    expect(room.state.deadline).toBeNull();
    room.join("x", "Late", "🐼", now());
    expect(room.state.deadline).not.toBeNull();
  });

  it("validates bets", () => {
    const { room, ids, now } = setup(1);
    expect(() => room.placeBet(ids[0]!, 50, true, now())).toThrow(RoomError);
    room.hostStart(now());
    expect(() => room.placeBet(ids[0]!, 5, true, now())).toThrow("bet_range");
    expect(() => room.placeBet(ids[0]!, 501, true, now())).toThrow("bet_range");
    room.state.players[ids[0]!]!.chips = 20;
    expect(() => room.placeBet(ids[0]!, 30, true, now())).toThrow("no_chips");
  });

  it("charges the extra stake on double and pays it back on a win", () => {
    const { room, ids, now, advance } = setup(1);
    const a = ids[0]!;
    room.hostStart(now());
    rig(room, ["5S", "9H", "6D", "7C", "10S", "2D"]);
    room.placeBet(a, 100, true, now());
    advance(TIMING.allLockedMs);
    advance(TIMING.dealMs);
    expect(room.privateView(a)!.canDouble).toBe(true);
    room.decide(a, "double", now());
    advance(TIMING.allDecidedMs);
    expect(room.state.players[a]!.chips).toBe(800);
    advance(TIMING.drawMs);
    for (let i = 0; i < 6 && room.state.phase === "dealer"; i++) advance(TIMING.dealerCardMs);
    expect(room.state.phase).toBe("payout");
    expect(room.state.players[a]!.chips).toBe(1200);
    expect(room.state.players[a]!.achievements).toContain("double_hero");
  });

  it("pause freezes and resume restores the timer", () => {
    const { room, now, advance } = setup(1);
    room.hostStart(now());
    advance(5000);
    room.pause(now());
    advance(60_000);
    expect(room.state.phase).toBe("betting");
    room.resume(now());
    expect(room.state.deadline! - now()).toBe(10_000);
  });

  it("kick frees the seat, bans, and promotes the rail next round", () => {
    const { room, ids, now } = setup(13);
    const railId = room.state.rail[0]!;
    const freedSeat = room.state.players[ids[0]!]!.seat;
    room.kick(ids[0]!, true);
    expect(() => room.join("dev0", "x", "🦊", now())).toThrow("banned");
    room.hostStart(now());
    expect(room.state.rail).toHaveLength(0);
    expect(room.state.players[railId]!.seat).toBe(freedSeat);
  });

  it("shared blackjack round skips decisions", () => {
    const { room, ids, now, advance } = setup(1);
    room.hostStart(now());
    rig(room, ["AS", "9H", "KD", "7C"]);
    room.placeBet(ids[0]!, 100, true, now());
    advance(TIMING.allLockedMs);
    advance(TIMING.dealMs);
    expect(room.state.phase).toBe("dealer");
    advance(TIMING.dealerFirstMs);
    advance(TIMING.dealerCardMs);
    expect(room.state.phase).toBe("payout");
    expect(room.state.players[ids[0]!]!.chips).toBe(1150);
    expect(room.state.players[ids[0]!]!.achievements).toContain("blackjack");
  });

  it("end of night computes awards and refunds an unfinished round", () => {
    const { room, ids, now, advance } = setup(2);
    room.hostStart(now());
    rig(room, ["10S", "10H", "6D", "7C", "5S"]);
    room.placeBet(ids[0]!, 100, true, now());
    advance(TIMING.allLockedMs);
    room.endNight(now());
    expect(room.state.phase).toBe("ended");
    expect(room.state.players[ids[0]!]!.chips).toBe(1000);
  });

  it("step mode waits for the host at every dramatic beat", () => {
    const { room, ids, now, advance } = setup(2);
    const [a, b] = ids as [string, string];
    room.updateRules({ manual: true }, now());
    room.hostStart(now());
    expect(room.state.phase).toBe("betting");
    expect(room.state.deadline).toBeNull();
    expect(room.snapshot(now()).awaitingHost).toBe(true);
    // Shared 10,6 ; dealer 9 up, 7 hole; next 5, dealer draws 2.
    rig(room, ["10S", "9H", "6D", "7C", "5S", "2D"]);
    room.placeBet(a, 100, true, now());
    room.placeBet(b, 50, true, now());
    advance(120_000);
    expect(room.state.phase).toBe("betting"); // no timer
    room.skip(now()); // "No more bets"
    expect(room.state.phase).toBe("dealing");
    advance(TIMING.dealMs); // animation phases still flow on their own
    expect(room.state.phase).toBe("deciding");
    expect(room.state.awaitingHost).toBe(true);
    room.decide(a, "hit", now());
    room.decide(b, "stand", now());
    advance(60_000);
    expect(room.state.phase).toBe("deciding"); // all decided, still waits for the host
    room.skip(now());
    expect(room.state.phase).toBe("drawing");
    advance(TIMING.drawMs);
    expect(room.state.phase).toBe("dealer"); // a has 21 → done
    advance(60_000);
    expect(room.state.dealerShown).toBe(1);
    room.skip(now()); // flip the hole card
    expect(room.state.dealerShown).toBe(2);
    expect(room.state.awaitingHost).toBe(true); // 16 → the dealer must draw
    room.skip(now());
    expect(room.state.dealerShown).toBe(3);
    expect(room.state.awaitingHost).toBe(false); // last card → payout on its own
    advance(TIMING.dealerCardMs);
    expect(room.state.phase).toBe("payout");
    advance(60_000);
    expect(room.state.phase).toBe("payout");
    room.skip(now());
    expect(room.state.phase).toBe("betting");
  });

  it("switching pacing mid-phase converts the timer", () => {
    const { room, now, advance } = setup(1);
    room.hostStart(now());
    expect(room.state.deadline).not.toBeNull();
    room.updateRules({ manual: true }, now());
    expect(room.state.deadline).toBeNull();
    expect(room.state.awaitingHost).toBe(true);
    advance(60_000);
    expect(room.state.phase).toBe("betting");
    room.updateRules({ manual: false }, now());
    expect(room.state.awaitingHost).toBe(false);
    expect(room.state.deadline! - now()).toBe(room.state.rules.betSeconds * 1000);
    room.pause(now());
    room.updateRules({ manual: true }, now());
    room.resume(now());
    expect(room.state.deadline).toBeNull();
    expect(room.state.awaitingHost).toBe(true);
  });

  it("serializes and restores state", () => {
    const { room, now } = setup(3);
    room.hostStart(now());
    const copy = new RoomCore(JSON.parse(JSON.stringify(room.state)));
    expect(copy.snapshot(now())).toEqual(room.snapshot(now()));
  });

  it("fuzz: random play never corrupts chips", () => {
    let now = 5_000_000;
    const rng = seededRng(99);
    const room = RoomCore.create("FUZZ", now, {}, seededRng(5));
    const ids = Array.from({ length: 12 }, (_, i) => room.join(`d${i}`, `P${i}`, "🐯", now).id);
    room.hostStart(now);
    for (let i = 0; i < 4000; i++) {
      const s = room.state;
      if (s.phase === "betting") {
        for (const id of ids) {
          const p = s.players[id]!;
          if (p.chips >= 10 && rng() < 0.8) room.placeBet(id, Math.min(p.chips, 10 + Math.floor(rng() * 200)), rng() < 0.5, now);
        }
      }
      if (s.phase === "deciding") {
        for (const id of ids) {
          const h = s.round!.hands[id];
          if (h && h.status === "active" && h.pending === null && rng() < 0.7) {
            const choice = rng() < 0.1 && room.privateView(id)!.canDouble ? "double" : rng() < 0.5 ? "hit" : "stand";
            room.decide(id, choice, now);
          }
        }
      }
      if (rng() < 0.05) room.topUpBroke();
      now += 700;
      room.tick(now);
      room.takeEvents();
      room.takeCompleted();
      for (const id of ids) expect(s.players[id]!.chips).toBeGreaterThanOrEqual(0);
    }
    expect(room.state.roundNo).toBeGreaterThan(50);
  });
});

describe("Reindeer Race bonus", () => {
  function winRound(room: RoomCore, ids: string[], now: () => number, advance: (ms: number) => void) {
    // Shared 10,10 vs dealer 10 + 7: everyone stands on 20 and wins.
    rig(room, ["10S", "10H", "10D", "7C"]);
    for (const id of ids) room.placeBet(id, 100, true, now());
    advance(TIMING.allLockedMs);
    advance(TIMING.dealMs);
    for (const id of ids) room.decide(id, "stand", now());
    advance(TIMING.allDecidedMs);
    for (let i = 0; i < 8 && room.state.phase !== "payout"; i++) advance(3000);
    expect(room.state.phase).toBe("payout");
  }

  it("race scripts finish in the drawn order", () => {
    for (let seed = 1; seed < 200; seed++) {
      const rng = seededRng(seed);
      const runners = makeRunners(rng, 1000);
      const sc = makeScript(runners, rng);
      const finishFrame = (id: number) => sc.progress[id]!.findIndex((v) => v >= 1);
      for (const row of sc.progress) for (let f = 1; f < row.length; f++) expect(row[f]!).toBeGreaterThanOrEqual(row[f - 1]!);
      const frames = sc.order.map(finishFrame);
      expect(frames.every((f) => f >= 0)).toBe(true);
      for (let i = 1; i < frames.length; i++) expect(frames[i]!).toBeGreaterThanOrEqual(frames[i - 1]!);
      expect(new Set(sc.order).size).toBe(RACE_RUNNERS);
    }
  });

  it("3 wins in a row unlock the race; the hero's prize is doubled; cooldown applies", () => {
    const { room, ids, now, advance } = setup(2);
    const [a, b] = ids as [string, string];
    room.hostStart(now());
    for (let r = 0; r < 3; r++) {
      winRound(room, ids, now, advance);
      if (r < 2) {
        expect(room.state.pendingBonus ?? null).toBeNull();
        advance(TIMING.payoutMs);
      }
    }
    expect(room.state.pendingBonus).not.toBeNull();
    advance(TIMING.payoutMs);
    expect(room.state.phase).toBe("bonus");
    const bonus = room.state.bonus!;
    expect(bonus.stage).toBe("intro");
    const heroId = bonus.hero!.playerId;
    advance(TIMING.bonusIntroMs);
    expect(bonus.stage).toBe("picking");
    // Both pick the same reindeer; we'll force it to win.
    room.bonusPick(a, 2, now());
    room.bonusPick(b, 2, now());
    expect(room.state.deadline! - now()).toBeLessThanOrEqual(TIMING.bonusAllPickedMs);
    const chipsBefore = { a: room.state.players[a]!.chips, b: room.state.players[b]!.chips };
    advance(TIMING.bonusAllPickedMs);
    expect(bonus.stage).toBe("racing");
    expect(() => room.bonusPick(a, 1, now())).toThrow("not_picking");
    room.skip(now()); // ignored mid-race
    expect(bonus.stage).toBe("racing");
    bonus.script!.order = [2, 0, 1, 3, 4, 5];
    advance(TIMING.raceMs);
    expect(bonus.stage).toBe("results");
    const prize = bonus.runners[2]!.prize;
    const gain = (id: string) => room.state.players[id]!.chips - chipsBefore[id === a ? "a" : "b"];
    expect(gain(heroId)).toBe(prize * 2);
    expect(gain(heroId === a ? b : a)).toBe(prize);
    advance(TIMING.bonusResultMs);
    expect(room.state.phase).toBe("betting");
    expect(room.state.bonus).toBeNull();
    // Streak continues but the cooldown blocks an immediate second bonus.
    winRound(room, ids, now, advance);
    expect(room.state.pendingBonus ?? null).toBeNull();
  });

  it("host can start a race from betting, and bonuses can be switched off", () => {
    const { room, now, advance } = setup(1);
    room.hostStart(now());
    room.hostBonus(now());
    expect(room.state.phase).toBe("bonus");
    advance(TIMING.bonusIntroMs);
    advance(TIMING.bonusPickMs); // nobody picked → random pick assigned
    expect(Object.keys(room.state.bonus!.picks)).toHaveLength(1);
    expect(room.state.bonus!.stage).toBe("racing");
    room.updateRules({ bonusGames: false }, now());
    expect(room.state.rules.bonusGames).toBe(false);
  });
});

describe("streak meter cooldown", () => {
  it("reports when the next bonus can unlock", () => {
    const { room, now } = setup(1);
    room.hostStart(now());
    expect(room.snapshot(now()).bonusReadyIn).toBe(0);
    room.hostBonus(now());
    expect(room.snapshot(now()).bonusReadyIn).toBe(6);
    room.state.phase = "betting";
    room.state.bonus = null;
    room.state.roundNo += 2;
    expect(room.snapshot(now()).bonusReadyIn).toBe(3);
    room.updateRules({ bonusGames: false }, now());
    expect(room.snapshot(now()).bonusReadyIn).toBeNull();
  });
});
