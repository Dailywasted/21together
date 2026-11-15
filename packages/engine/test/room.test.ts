import { describe, expect, it } from "vitest";
import { RoomCore, TIMING, seededRng, RoomError, type Card } from "../src";

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
