import type { PublicSnapshot, RaceScript, Runner } from "@21/engine";
import type { Lang } from "./i18n";

/** Reindeer names from the classic 1823 poem (public domain), with French equivalents. */
const NAMES: Record<Lang, string[]> = {
  en: ["Dasher", "Dancer", "Prancer", "Vixen", "Comet", "Cupid", "Donner", "Blitzen"],
  fr: ["Tornade", "Danseur", "Fringant", "Furie", "Comète", "Cupidon", "Tonnerre", "Éclair"],
};

export const LANE_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

/** Visible animation length of the race (the server allows a bit more before the results). */
export const RACE_ANIM_MS = 18_000;

export const runnerName = (r: Runner, lang: Lang) => NAMES[lang][r.nameIdx] ?? `#${r.id + 1}`;

/** Odds as "N:1" from the win chance. */
export function oddsLabel(chance: number): string {
  const n = Math.max(1, Math.round((1 - chance) / chance));
  return `${n}:1`;
}

export const isFavourite = (runners: Runner[], r: Runner) => r.chance === Math.max(...runners.map((x) => x.chance));

/** Milliseconds since the race started (server clock), or null when not racing. */
export function raceElapsed(snap: PublicSnapshot, offset: number): number | null {
  const b = snap.bonus;
  if (!b || b.stage !== "racing" || snap.deadline === null) return null;
  const start = snap.deadline - snap.phaseMs;
  return Math.max(0, Date.now() + offset - start);
}

/** Progress (0..1) of each runner at a given elapsed time. */
export function positionsAt(script: RaceScript, elapsedMs: number): number[] {
  const frames = script.progress[0]!.length - 1;
  const f = Math.min(frames, (elapsedMs / RACE_ANIM_MS) * frames);
  const i = Math.floor(f);
  const k = f - i;
  return script.progress.map((row) => {
    const a = row[i]!;
    const b = row[Math.min(frames, i + 1)]!;
    return a + (b - a) * k;
  });
}

/** Runner ids ordered by current position (leader first); finished runners keep their finishing order. */
export function standings(script: RaceScript, pos: number[]): number[] {
  const done = script.order.filter((id) => pos[id]! >= 1);
  const running = pos
    .map((p, id) => ({ p, id }))
    .filter((x) => x.p < 1)
    .sort((a, b) => b.p - a.p)
    .map((x) => x.id);
  return [...done, ...running];
}
