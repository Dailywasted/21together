import { memo } from "react";

export const DENOMS = [
  { v: 1000, base: "#d4a72c", edge: "#fff3c4", text: "#3b2a05" },
  { v: 500, base: "#7c3aed", edge: "#e9d5ff", text: "#ffffff" },
  { v: 100, base: "#16181d", edge: "#f5c451", text: "#f5c451" },
  { v: 25, base: "#0f9d58", edge: "#eafff3", text: "#ffffff" },
  { v: 10, base: "#2563eb", edge: "#e0ecff", text: "#ffffff" },
  { v: 5, base: "#dc2626", edge: "#ffe4e4", text: "#ffffff" },
  { v: 1, base: "#e5e7eb", edge: "#6b7280", text: "#111827" },
] as const;

export function denomFor(v: number) {
  return DENOMS.find((d) => d.v === v) ?? DENOMS[DENOMS.length - 1]!;
}

function label(v: number) {
  return v >= 1000 ? `${v / 1000}K` : String(v);
}

export const Chip = memo(function Chip({ value, size = 48, flat = false }: { value: number; size?: number; flat?: boolean }) {
  const d = denomFor(value);
  const stripes = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg width={size} height={flat ? size * 0.3 : size} viewBox={flat ? "0 35 100 30" : "0 0 100 100"} aria-hidden>
      <defs>
        <radialGradient id={`chip-${d.v}`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={d.base} />
      {stripes.map((a) => (
        <rect key={a} x="45" y="2" width="10" height="16" rx="2" fill={d.edge} transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="33" fill={d.base} stroke={d.edge} strokeOpacity="0.8" strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="50" cy="50" r="48" fill={`url(#chip-${d.v})`} />
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontFamily="Space Grotesk, Inter, sans-serif"
        fontWeight="700"
        fontSize={value >= 100 ? 24 : 28}
        fill={d.text}
      >
        {label(value)}
      </text>
    </svg>
  );
});

/** Breaks an amount into chip denominations (largest first). */
export function breakdown(amount: number, maxChips = 10): number[] {
  const out: number[] = [];
  let rest = amount;
  for (const d of DENOMS) {
    while (rest >= d.v && out.length < maxChips) {
      out.push(d.v);
      rest -= d.v;
    }
  }
  return out;
}

/** A neat vertical stack of chips representing an amount. */
export function ChipStack({ amount, size = 40 }: { amount: number; size?: number }) {
  const chips = breakdown(amount, 8).reverse();
  if (amount <= 0) return null;
  const step = size * 0.13;
  return (
    <div className="relative" style={{ width: size, height: size + step * (chips.length - 1) }}>
      {chips.map((v, i) => (
        <div key={i} className="absolute left-0" style={{ bottom: i * step, filter: "drop-shadow(0 2px 2px rgba(0,0,0,.45))" }}>
          <Chip value={v} size={size} />
        </div>
      ))}
    </div>
  );
}
