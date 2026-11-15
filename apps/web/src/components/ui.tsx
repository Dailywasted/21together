import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

const GRADIENTS = [
  ["#f97316", "#db2777"],
  ["#22d3ee", "#6366f1"],
  ["#a3e635", "#059669"],
  ["#f472b6", "#8b5cf6"],
  ["#fbbf24", "#ef4444"],
  ["#2dd4bf", "#0ea5e9"],
  ["#c084fc", "#ec4899"],
  ["#60a5fa", "#14b8a6"],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({ emoji, seed, size = 48, ring }: { emoji: string; seed: string; size?: number; ring?: string }) {
  const [a, b] = GRADIENTS[hash(seed) % GRADIENTS.length]!;
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${a}, ${b})`,
        boxShadow: ring ? `0 0 0 3px ${ring}, 0 6px 16px -4px rgba(0,0,0,.5)` : "0 6px 16px -4px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.35)",
        fontSize: size * 0.52,
        lineHeight: 1,
      }}
    >
      <span style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.3))" }}>{emoji}</span>
    </div>
  );
}

/** Re-renders every `ms` milliseconds; returns Date.now(). */
export function useNow(ms = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function CountdownRing({
  remaining,
  total,
  size = 64,
  stroke = 6,
  children,
}: {
  remaining: number;
  total: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const urgent = remaining < 3500 && remaining > 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.1)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? "#fb7185" : "#f5c451"}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 120ms linear, stroke 300ms" }}
        />
      </svg>
      <div className={`relative tabular font-display font-bold ${urgent ? "text-lose" : ""}`}>{children}</div>
    </div>
  );
}

export function QR({ text, size = 280 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#06080b", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [text]);
  return (
    <div
      className="rounded-3xl bg-white p-5 shadow-[0_20px_60px_-15px_rgba(245,196,81,.35)]"
      style={{ width: size + 40, height: size + 40 }}
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg", `<svg width="${size}" height="${size}"`) }}
    />
  );
}

/** Smoothly counts to the target number. */
export function CountUp({ value, format = (n: number) => String(n), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(Math.round(v)));
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      mv.set(value);
      return;
    }
    const ctl = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => ctl.stop();
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className="grid place-items-center rounded-xl font-display font-bold text-ink"
        style={{
          width: size * 1.35,
          height: size * 1.35,
          fontSize: size * 0.62,
          background: "linear-gradient(135deg, #ffe08a, #f5c451 50%, #c9952a)",
          boxShadow: "0 6px 20px -6px rgba(245,196,81,.6), inset 0 1px 0 rgba(255,255,255,.6)",
        }}
      >
        21
      </div>
      <span className="font-display font-bold tracking-tight" style={{ fontSize: size * 0.8 }}>
        Together
      </span>
    </div>
  );
}

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

export function signed(n: number, f: (n: number) => string): string {
  return n > 0 ? `+${f(n)}` : n < 0 ? `−${f(Math.abs(n))}` : f(0);
}

export function useStableShuffle<T>(arr: T[]): T[] {
  return useMemo(() => arr, [arr]);
}
