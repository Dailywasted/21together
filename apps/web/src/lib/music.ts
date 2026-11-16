import { audioBus } from "./sound";
import { load, save } from "./storage";

/**
 * Generative casino-lounge music, synthesized live (no audio files, no licensing).
 * It follows the game: a full jazzy groove while people bet, a tighter "thinking" beat while
 * they decide, nearly silent during card reveals so the drumroll and flip land, back up for wins.
 */

export type MusicMode = "lounge" | "tension" | "hush" | "off";

const BPM = 96;
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // 16th note
const SWING = STEP * 0.32; // delay on off-beat 8ths
const BARS = 8;
const LOOKAHEAD = 0.15;

// 8-bar lounge progression: rootless voicings (MIDI) + bass root (MIDI) + third quality.
const CHORDS: { notes: number[]; root: number; third: 3 | 4 }[] = [
  { notes: [53, 57, 60, 64], root: 38, third: 3 }, // Dm9
  { notes: [53, 59, 64, 69], root: 43, third: 4 }, // G13
  { notes: [52, 55, 59, 62], root: 36, third: 4 }, // Cmaj9
  { notes: [52, 57, 62, 67], root: 36, third: 4 }, // C6/9
  { notes: [57, 60, 64, 67], root: 41, third: 4 }, // Fmaj9
  { notes: [56, 62, 65, 71], root: 40, third: 4 }, // E7(b9)
  { notes: [55, 59, 60, 64], root: 45, third: 3 }, // Am9
  { notes: [55, 61, 65, 67], root: 45, third: 4 }, // A7(b13)
];

const LEVEL: Record<MusicMode, number> = { lounge: 0.55, tension: 0.42, hush: 0.07, off: 0 };

let enabled = load<boolean>("21t:music", true);
let mode: MusicMode = "off";
let bus: GainNode | null = null;
let busCtx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0;

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export const musicEnabled = () => enabled;
export function setMusicEnabled(v: boolean) {
  enabled = v;
  save("21t:music", v);
  applyLevel();
}

function ensureBus(): { ctx: AudioContext; bus: GainNode } | null {
  const a = audioBus();
  if (!a) return null;
  if (!bus || busCtx !== a.ctx) {
    busCtx = a.ctx;
    bus = a.ctx.createGain();
    bus.gain.value = enabled ? LEVEL[mode] : 0;
    // Gentle warmth: roll off harsh highs.
    const lp = a.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6500;
    bus.connect(lp).connect(a.out);
  }
  return { ctx: a.ctx, bus };
}

function applyLevel() {
  const b = ensureBus();
  if (!b) return;
  const target = enabled ? LEVEL[mode] : 0;
  b.bus.gain.cancelScheduledValues(b.ctx.currentTime);
  b.bus.gain.setTargetAtTime(target, b.ctx.currentTime, mode === "hush" ? 0.25 : 0.6);
}

/** Switches the musical mood (fades between levels). */
export function setMusicMode(m: MusicMode) {
  if (m === mode) return;
  mode = m;
  applyLevel();
}

export function startMusic() {
  if (timer) return;
  timer = setInterval(schedule, 30);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  mode = "off";
  applyLevel();
}

// ───────────────────────── instruments ─────────────────────────

function env(ctx: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** Electric-piano-ish voice: sine body + soft bell partial. */
function keys(ctx: AudioContext, out: AudioNode, t: number, notes: number[], vel: number, dur: number) {
  for (const n of notes) {
    const f = hz(n);
    const g = env(ctx, t, 0.055 * vel, 0.012, dur);
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2.0;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    const o3 = ctx.createOscillator();
    o3.type = "triangle";
    o3.frequency.value = f;
    o3.detune.value = 6;
    const g3 = ctx.createGain();
    g3.gain.value = 0.25;
    o1.connect(g);
    o2.connect(g2).connect(g);
    o3.connect(g3).connect(g);
    g.connect(out);
    for (const o of [o1, o2, o3]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

function bass(ctx: AudioContext, out: AudioNode, t: number, note: number, vel: number, dur: number) {
  const f = hz(note);
  const g = env(ctx, t, 0.22 * vel, 0.01, dur);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = f;
  // 2nd harmonic so the line is audible on TV speakers.
  const h = ctx.createOscillator();
  h.type = "triangle";
  h.frequency.value = f * 2;
  const hg = ctx.createGain();
  hg.gain.value = 0.35;
  o.connect(g);
  h.connect(hg).connect(g);
  g.connect(out);
  o.start(t);
  h.start(t);
  o.stop(t + dur + 0.05);
  h.stop(t + dur + 0.05);
}

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function hat(ctx: AudioContext, out: AudioNode, t: number, vel: number, open = false) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7500;
  const g = env(ctx, t, 0.05 * vel, 0.002, open ? 0.18 : 0.045);
  src.connect(hp).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.3);
}

function brush(ctx: AudioContext, out: AudioNode, t: number, vel: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2800;
  bp.Q.value = 0.7;
  const g = env(ctx, t, 0.045 * vel, 0.03, 0.16);
  src.connect(bp).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + 0.3);
}

function kick(ctx: AudioContext, out: AudioNode, t: number, vel: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
  const g = env(ctx, t, 0.3 * vel, 0.004, 0.22);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.3);
}

/** Vibraphone sparkle. */
function vibe(ctx: AudioContext, out: AudioNode, t: number, note: number, vel: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = hz(note);
  const g = env(ctx, t, 0.035 * vel, 0.005, 0.9);
  const trem = ctx.createOscillator();
  trem.frequency.value = 5.5;
  const tg = ctx.createGain();
  tg.gain.value = 0.012 * vel;
  trem.connect(tg).connect(g.gain);
  o.connect(g).connect(out);
  o.start(t);
  trem.start(t);
  o.stop(t + 1);
  trem.stop(t + 1);
}

// ───────────────────────── sequencer ─────────────────────────

function schedule() {
  const b = ensureBus();
  if (!b || !enabled || mode === "off") return;
  const { ctx } = b;
  if (ctx.state !== "running") return;
  if (nextTime < ctx.currentTime - 0.05) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    play(ctx, b.bus, step, nextTime);
    nextTime += STEP;
    step = (step + 1) % (BARS * 16);
  }
}

function play(ctx: AudioContext, out: AudioNode, s: number, t0: number) {
  const bar = Math.floor(s / 16);
  const pos = s % 16;
  const chord = CHORDS[bar]!;
  const next = CHORDS[(bar + 1) % BARS]!;
  const offBeat8 = pos % 4 === 2;
  const t = t0 + (offBeat8 ? SWING : 0);
  const m = mode;

  if (m === "lounge" || m === "hush") {
    // Comping: on 1, the "and" of 2, sometimes the "and" of 3.
    if (pos === 0) keys(ctx, out, t, chord.notes, 1, BEAT * 2.2);
    if (pos === 6) keys(ctx, out, t, chord.notes.slice(1), 0.75, BEAT * 0.9);
    if (pos === 10 && bar % 2 === 1) keys(ctx, out, t, chord.notes.slice(0, 3), 0.6, BEAT * 0.8);
    // Walking bass on quarters.
    if (pos % 4 === 0) {
      const q = pos / 4;
      const r = chord.root;
      const line = [r, r + chord.third, r + 7, next.root + (next.root > r ? -1 : 1)];
      bass(ctx, out, t, line[q]!, q === 0 ? 1 : 0.8, BEAT * 0.9);
    }
    // Brushes and ride.
    if (pos % 2 === 0) hat(ctx, out, t, pos % 4 === 2 ? 1 : 0.6, pos === 14 && bar % 4 === 3);
    if (pos === 4 || pos === 12) brush(ctx, out, t, 1);
    if (pos === 0 || pos === 8) kick(ctx, out, t, pos === 0 ? 0.8 : 0.5);
    // Sparse vibraphone melody from the chord.
    if (pos % 2 === 0 && Math.random() < (pos === 0 ? 0.05 : 0.17)) {
      const pick = chord.notes[Math.floor(Math.random() * chord.notes.length)]! + 12 + (Math.random() < 0.3 ? 12 : 0);
      vibe(ctx, out, t, pick, 0.8 + Math.random() * 0.4);
    }
  } else if (m === "tension") {
    // Game-show "thinking" groove: pulsing bass, steady kick, ticking hats, one held chord.
    if (pos % 2 === 0) bass(ctx, out, t0, chord.root + (pos % 8 === 6 ? 12 : 0), pos % 8 === 0 ? 0.9 : 0.55, STEP * 1.6);
    if (pos % 4 === 0) kick(ctx, out, t0, pos === 0 ? 0.9 : 0.55);
    hat(ctx, out, t0, pos % 4 === 0 ? 0.7 : 0.4);
    if (pos === 0 && bar % 2 === 0) keys(ctx, out, t0, chord.notes, 0.55, BEAT * 7);
  }
}
