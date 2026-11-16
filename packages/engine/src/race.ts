import type { Rng } from "./shoe";

/** Reindeer Race bonus: 6 runners, win chances shuffled per race, free picks, prize by odds. */

export const RACE_RUNNERS = 6;
/** Number of reindeer names available (the client localizes them by index). */
export const REINDEER_NAMES = 8;
/** Win probabilities, assigned to runners in a random order each race. */
const WIN_CHANCES = [0.3, 0.22, 0.17, 0.13, 0.1, 0.08];
/** Checkpoints in the race script (the client interpolates between them). */
export const RACE_FRAMES = 40;

export interface Runner {
  /** Lane / saddle number, 0..5. */
  id: number;
  /** Index into the localized reindeer names. */
  nameIdx: number;
  /** Win chance (0..1), shown as odds. */
  chance: number;
  /** Chips paid for a correct pick (before the ×2 hero bonus). */
  prize: number;
}

export interface RaceScript {
  /** Finishing order (runner ids, winner first). */
  order: number[];
  /** progress[runner][frame] in 0..1, frames evenly spaced over the race. */
  progress: number[][];
  /** Notable moments for commentary / effects. */
  events: { runner: number; frame: number; kind: "boost" | "slip" }[];
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Fresh line-up: random names, shuffled odds, prizes scaled to the starting stack. */
export function makeRunners(rng: Rng, startingChips: number): Runner[] {
  const names = shuffle(
    Array.from({ length: REINDEER_NAMES }, (_, i) => i),
    rng,
  ).slice(0, RACE_RUNNERS);
  const chances = shuffle(WIN_CHANCES, rng);
  const base = startingChips * 0.036;
  return names.map((nameIdx, id) => ({
    id,
    nameIdx,
    chance: chances[id]!,
    prize: Math.max(25, Math.round(base / chances[id]! / 25) * 25),
  }));
}

/** Weighted finishing order (each place drawn among the remaining runners by win chance). */
export function drawOrder(runners: Runner[], rng: Rng): number[] {
  const left = [...runners];
  const order: number[] = [];
  while (left.length) {
    const total = left.reduce((a, r) => a + r.chance, 0);
    let x = rng() * total;
    let idx = 0;
    for (; idx < left.length - 1; idx++) {
      x -= left[idx]!.chance;
      if (x <= 0) break;
    }
    order.push(left[idx]!.id);
    left.splice(idx, 1);
  }
  return order;
}

/**
 * Builds a dramatic race that ends in the given order: noisy speeds, lead changes,
 * a few boosts and slips, and a close finish between the top two.
 */
export function makeScript(runners: Runner[], rng: Rng): RaceScript {
  const order = drawOrder(runners, rng);
  const F = RACE_FRAMES;
  // Finish time (in frames) per rank: winner at 80% of the race, near photo finish for 2nd,
  // the rest trickle in before the last frame.
  const finishAt = new Map<number, number>();
  let t = F * 0.8;
  order.forEach((id, rank) => {
    if (rank === 1) t += 0.25 + rng() * 0.6;
    else if (rank > 1) t += 0.7 + rng() * 0.8;
    finishAt.set(id, Math.min(F - 0.2, t));
  });
  const events: RaceScript["events"] = [];
  const progress = runners.map((r) => {
    const end = finishAt.get(r.id)!;
    // Random smooth speed profile.
    const speeds: number[] = [];
    let v = 1;
    const lateSurge = order[0] === r.id && rng() < 0.55;
    for (let f = 0; f < F; f++) {
      v = Math.max(0.35, Math.min(1.8, v + (rng() - 0.5) * 0.35));
      let s = v;
      if (lateSurge) s *= f < F * 0.5 ? 0.85 : 1.25;
      speeds.push(s);
    }
    // Boosts and slips.
    if (rng() < 0.55) {
      const f = 6 + Math.floor(rng() * (F * 0.6));
      const kind = rng() < 0.55 ? "boost" : "slip";
      events.push({ runner: r.id, frame: f, kind });
      for (let k = f; k < Math.min(F, f + 3); k++) speeds[k] = speeds[k]! * (kind === "boost" ? 2.1 : 0.15);
    }
    // Integrate up to the finish frame, normalize so progress hits 1 exactly at `end`.
    const cum: number[] = [0];
    for (let f = 1; f <= F; f++) cum.push(cum[f - 1]! + speeds[f - 1]!);
    const full = Math.floor(end);
    const frac = end - full;
    const atEnd = full >= F ? cum[F]! : cum[full]! + (cum[Math.min(F, full + 1)]! - cum[full]!) * frac;
    return cum.map((c) => Math.round(Math.min(1, c / atEnd) * 1000) / 1000);
  });
  events.sort((a, b) => a.frame - b.frame);
  return { order, progress, events };
}
