import { diag } from "./store";
import { load, save } from "./storage";

/** Tiny synthesized sound kit (WebAudio) — no audio files, no licensing. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = load<boolean>("21t:sound", true);

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const c = ctx;
      c.addEventListener("statechange", () => diag("audio", `${c.state} · ${c.sampleRate}Hz`));
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Shared audio context + master bus (null while sound is off). Used by the music engine. */
export function audioBus(): { ctx: AudioContext; out: GainNode } | null {
  const c = ac();
  return c && master ? { ctx: c, out: master } : null;
}

export function soundEnabled() {
  return enabled;
}
export function setSoundEnabled(v: boolean) {
  enabled = v;
  save("21t:sound", v);
  if (v) unlockAudio();
}

/** Call from a user gesture to allow audio on mobile / autoplay-restricted browsers. */
export function unlockAudio() {
  const c = ac();
  if (!c) return;
  const b = c.createBuffer(1, 1, 22050);
  const s = c.createBufferSource();
  s.buffer = b;
  s.connect(master!);
  s.start(0);
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { delay?: number; gain?: number; freq?: number; q?: number } = {}) {
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + (opts.delay ?? 0);
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = opts.freq ?? 3000;
  f.Q.value = opts.q ?? 0.8;
  const g = c.createGain();
  g.gain.value = opts.gain ?? 0.35;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export const sfx = {
  deal(delay = 0) {
    noise(0.09, { delay, freq: 2600, gain: 0.45 });
    tone(180, 0.05, { delay: delay + 0.03, type: "triangle", gain: 0.12 });
  },
  flip(delay = 0) {
    noise(0.06, { delay, freq: 4200, gain: 0.35 });
  },
  chip(delay = 0) {
    tone(2400, 0.05, { delay, type: "square", gain: 0.05 });
    tone(3100, 0.06, { delay: delay + 0.035, type: "square", gain: 0.04 });
  },
  tick() {
    tone(1200, 0.04, { type: "sine", gain: 0.12 });
  },
  lock() {
    tone(660, 0.07, { type: "triangle", gain: 0.2 });
    tone(990, 0.09, { type: "triangle", gain: 0.16, delay: 0.05 });
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: "triangle", gain: 0.2, delay: i * 0.07 }));
  },
  blackjack() {
    [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(f, 0.3, { type: "sine", gain: 0.18, delay: i * 0.06 }));
    noise(0.5, { delay: 0.1, freq: 8000, gain: 0.12, q: 0.4 });
  },
  lose() {
    tone(330, 0.35, { type: "sawtooth", gain: 0.06, slide: 0.6 });
  },
  bust() {
    tone(220, 0.4, { type: "sawtooth", gain: 0.08, slide: 0.4 });
    noise(0.2, { freq: 400, gain: 0.25 });
  },
  push() {
    tone(587, 0.18, { type: "triangle", gain: 0.15 });
  },
  achievement() {
    [880, 1320, 1760].forEach((f, i) => tone(f, 0.25, { type: "sine", gain: 0.16, delay: i * 0.08 }));
  },
  shuffle() {
    for (let i = 0; i < 14; i++) noise(0.05, { delay: i * 0.045, freq: 2000 + Math.random() * 2500, gain: 0.25 });
  },
  pop() {
    tone(900, 0.08, { type: "sine", gain: 0.15, slide: 1.6 });
  },
  /** Snare-like roll that speeds up and swells (hole card / big reveals). */
  drumroll(dur = 0.9, delay = 0) {
    let t = 0;
    let gap = 0.07;
    while (t < dur) {
      const k = t / dur;
      noise(0.05, { delay: delay + t, freq: 1800, q: 0.6, gain: 0.12 + k * 0.28 });
      t += gap;
      gap = Math.max(0.028, gap * 0.93);
    }
  },
  /** Crash cymbal + low hit for the moment a card turns. */
  reveal(delay = 0) {
    noise(0.9, { delay, freq: 7000, q: 0.3, gain: 0.22 });
    tone(110, 0.25, { delay, type: "sine", gain: 0.35, slide: 0.5 });
  },
  whoosh(delay = 0) {
    const c = ac();
    if (!c || !master) return;
    const t = c.currentTime + delay;
    const len = Math.floor(c.sampleRate * 0.35);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(4500, t + 0.3);
    const g = c.createGain();
    g.gain.value = 0.3;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  },
  /** A synthetic crowd roar; intensity 0..1 controls length and loudness. */
  cheer(intensity = 0.6, delay = 0) {
    const c = ac();
    if (!c || !master) return;
    const t = c.currentTime + delay;
    const dur = 1.2 + intensity * 1.6;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // Brown-ish noise with a slow random "voices" wobble.
        last = (last + (Math.random() * 2 - 1) * 0.08) * 0.985;
        const wobble = 0.7 + 0.3 * Math.sin(i / (900 + ch * 137)) * Math.sin(i / 3100);
        d[i] = last * 3.2 * wobble;
      }
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 0.5;
    const g = c.createGain();
    const peak = 0.25 + intensity * 0.45;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.25);
    g.gain.setValueAtTime(peak, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    // A few whistles / "woo"s on top.
    const whistles = Math.round(1 + intensity * 4);
    for (let i = 0; i < whistles; i++) {
      const d0 = delay + 0.15 + Math.random() * dur * 0.5;
      tone(1400 + Math.random() * 900, 0.35, { delay: d0, type: "sine", gain: 0.05, slide: 1.35 });
    }
    // Claps
    const claps = Math.round(6 + intensity * 18);
    for (let i = 0; i < claps; i++) noise(0.03, { delay: delay + 0.2 + Math.random() * dur * 0.7, freq: 2200 + Math.random() * 1500, gain: 0.1, q: 1.5 });
  },
  /** Brassy victory fanfare. */
  fanfare(delay = 0) {
    const chords = [
      [392, 494, 587],
      [440, 554, 659],
      [523, 659, 784, 1046],
    ];
    chords.forEach((ch, i) =>
      ch.forEach((f) => tone(f, i === 2 ? 0.9 : 0.18, { delay: delay + i * 0.16, type: "sawtooth", gain: 0.05 })),
    );
    chords[2]!.forEach((f) => tone(f * 2, 0.8, { delay: delay + 0.32, type: "triangle", gain: 0.05 }));
  },
  houseWins(delay = 0) {
    [392, 370, 349, 294].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.3, { delay: delay + i * 0.28, type: "sawtooth", gain: 0.05, slide: i === 3 ? 0.85 : 1 }));
  },
  noMoreBets() {
    tone(988, 0.16, { type: "triangle", gain: 0.2 });
    tone(740, 0.3, { type: "triangle", gain: 0.2, delay: 0.14 });
  },
  /** Slot-machine style "bonus!" siren + rising arpeggio. */
  bonusSiren() {
    for (let i = 0; i < 3; i++) tone(500, 0.35, { delay: i * 0.38, type: "sawtooth", gain: 0.05, slide: 2.2 });
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.22, { type: "square", gain: 0.04, delay: 1.15 + i * 0.07 }));
    noise(0.8, { delay: 1.55, freq: 7000, q: 0.3, gain: 0.18 });
  },
  startGun() {
    noise(0.35, { freq: 900, q: 0.4, gain: 0.7 });
    tone(80, 0.3, { type: "sine", gain: 0.4, slide: 0.5 });
  },
  /** One gallop stride (three quick hoof beats); intensity 0..1. */
  gallop(intensity = 0.6, delay = 0) {
    [0, 0.07, 0.14].forEach((d, i) => {
      noise(0.05, { delay: delay + d, freq: 260 + i * 70, q: 1.2, gain: 0.18 + intensity * 0.25 });
      tone(70 + i * 12, 0.06, { delay: delay + d, type: "sine", gain: 0.12 + intensity * 0.12 });
    });
  },
  softLock() {
    tone(1500, 0.03, { type: "square", gain: 0.035 });
  },
};

export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
