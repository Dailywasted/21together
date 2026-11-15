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
};

export function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
