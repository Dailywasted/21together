import { memo } from "react";
import { motion } from "motion/react";
import type { Card, Suit } from "@21/engine";

export const SUIT_PATHS: Record<Suit, string> = {
  H: "M50 92 C 22 68 2 52 2 30 C 2 14 14 4 28 4 C 38 4 46 10 50 19 C 54 10 62 4 72 4 C 86 4 98 14 98 30 C 98 52 78 68 50 92 Z",
  D: "M50 2 C 62 22 76 38 94 50 C 76 62 62 78 50 98 C 38 78 24 62 6 50 C 24 38 38 22 50 2 Z",
  S: "M50 2 C 66 22 98 38 98 60 C 98 75 87 84 74 84 C 66 84 59 80 55 74 C 56 84 60 92 68 98 L 32 98 C 40 92 44 84 45 74 C 41 80 34 84 26 84 C 13 84 2 75 2 60 C 2 38 34 22 50 2 Z",
  C: "M50 4 C 62 4 72 14 72 26 C 72 33 69 39 64 43 C 68 41 72 40 76 40 C 88 40 98 50 98 62 C 98 74 88 84 76 84 C 66 84 58 78 55 70 C 56 82 60 91 68 98 L 32 98 C 40 91 44 82 45 70 C 42 78 34 84 24 84 C 12 84 2 74 2 62 C 2 50 12 40 24 40 C 28 40 32 41 36 43 C 31 39 28 33 28 26 C 28 14 38 4 50 4 Z",
};

const isRed = (s: Suit) => s === "H" || s === "D";

function SuitGlyph({ suit, x, y, size, color }: { suit: Suit; x: number; y: number; size: number; color: string }) {
  return (
    <path d={SUIT_PATHS[suit]} fill={color} transform={`translate(${x} ${y}) scale(${size / 100})`} />
  );
}

/**
 * Corner index sizes. "Jumbo" is the casino trick for reading cards from across the room:
 * a much bigger rank and suit in the corners (the part still visible when cards overlap).
 */
const INDEX = {
  normal: { x: 16, y: 50, font: 46, font10: 40, spacing10: -4, suitX: 17, suitY: 60, suit: 28 },
  jumbo: { x: 13, y: 66, font: 66, font10: 56, spacing10: -6, suitX: 14, suitY: 76, suit: 38 },
};

const FaceSvg = memo(function FaceSvg({ card, jumbo = false }: { card: Card; jumbo?: boolean }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1) as Suit;
  const color = isRed(suit) ? "#d9343b" : "#111418";
  const tint = isRed(suit) ? "#d9343b" : "#1f2937";
  const isFace = rank === "J" || rank === "Q" || rank === "K";
  const narrowRank = rank === "10";
  const gid = `g${card}`;
  const ix = jumbo ? INDEX.jumbo : INDEX.normal;
  const corner = (
    <>
      <text
        x={ix.x}
        y={ix.y}
        fontFamily="Space Grotesk, Inter, sans-serif"
        fontWeight="700"
        fontSize={narrowRank ? ix.font10 : ix.font}
        letterSpacing={narrowRank ? ix.spacing10 : 0}
        fill={color}
      >
        {rank}
      </text>
      <SuitGlyph suit={suit} x={ix.suitX} y={ix.suitY} size={ix.suit} color={color} />
    </>
  );
  return (
    <svg viewBox="0 0 200 280" width="100%" height="100%" aria-label={card} role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eeebe4" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="198" height="278" rx="16" fill={`url(#${gid})`} stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
      {/* corners */}
      <g>{corner}</g>
      <g transform="rotate(180 100 140)">{corner}</g>
      {/* center */}
      {isFace ? (
        <g>
          {jumbo ? (
            <rect x="60" y="84" width="80" height="128" rx="10" fill={tint} fillOpacity="0.07" stroke={tint} strokeOpacity="0.35" strokeWidth="2" />
          ) : (
            <>
              <rect x="44" y="62" width="112" height="156" rx="12" fill={tint} fillOpacity="0.07" stroke={tint} strokeOpacity="0.35" strokeWidth="2" />
              <rect x="52" y="70" width="96" height="140" rx="8" fill="none" stroke={tint} strokeOpacity="0.18" strokeWidth="1.5" />
            </>
          )}
          <text
            x="100"
            y="160"
            textAnchor="middle"
            fontFamily="Space Grotesk, Inter, sans-serif"
            fontWeight="700"
            fontSize="92"
            fill={color}
          >
            {rank}
          </text>
          <SuitGlyph suit={suit} x={84} y={172} size={32} color={color} />
        </g>
      ) : rank === "A" ? (
        <g>
          <circle cx="100" cy="140" r={jumbo ? 50 : 62} fill="none" stroke={color} strokeOpacity="0.15" strokeWidth="2" />
          {jumbo ? <SuitGlyph suit={suit} x={63} y={103} size={74} color={color} /> : <SuitGlyph suit={suit} x={55} y={95} size={90} color={color} />}
        </g>
      ) : (
        <SuitGlyph suit={suit} x={62} y={102} size={76} color={color} />
      )}
    </svg>
  );
});

const BackSvg = memo(function BackSvg() {
  return (
    <svg viewBox="0 0 200 280" width="100%" height="100%" aria-label="card back" role="img">
      <defs>
        <linearGradient id="cb-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#123f31" />
          <stop offset="1" stopColor="#061a13" />
        </linearGradient>
        <pattern id="cb-p" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="14" height="14" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="14" stroke="#f5c451" strokeOpacity="0.13" strokeWidth="2" />
        </pattern>
      </defs>
      <rect x="1" y="1" width="198" height="278" rx="16" fill="url(#cb-g)" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <rect x="12" y="12" width="176" height="256" rx="10" fill="url(#cb-p)" stroke="#f5c451" strokeOpacity="0.45" strokeWidth="1.5" />
      <circle cx="100" cy="140" r="36" fill="#071d15" stroke="#f5c451" strokeOpacity="0.7" strokeWidth="2" />
      <text x="100" y="153" textAnchor="middle" fontFamily="Space Grotesk, Inter, sans-serif" fontWeight="700" fontSize="36" fill="#f5c451">
        21
      </text>
    </svg>
  );
});

interface Props {
  /** null = face down */
  card: Card | null;
  width: number;
  /** Entrance animation (dealt from the shoe). */
  dealFrom?: { x: number; y: number } | null;
  delay?: number;
  dim?: boolean;
  glow?: "gold" | "win" | "lose" | null;
  className?: string;
  /** Extra wait before the face is revealed (suspense). */
  flipDelay?: number;
  /** Big corner index, readable from across the room (TV "Card size" setting). */
  jumbo?: boolean;
}

export function PlayingCard({ card, width, dealFrom, delay = 0, dim, glow, className, flipDelay = 0, jumbo = false }: Props) {
  const height = width * 1.4;
  const faceUp = card !== null;
  const shadow =
    glow === "gold"
      ? "0 0 0 2px rgba(245,196,81,0.9), 0 0 32px rgba(245,196,81,0.55)"
      : glow === "win"
        ? "0 0 0 2px rgba(52,211,153,0.9), 0 0 28px rgba(52,211,153,0.5)"
        : glow === "lose"
          ? "0 0 0 2px rgba(251,113,133,0.8)"
          : "0 10px 24px -8px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.35)";
  return (
    <motion.div
      className={className}
      style={{ width, height, perspective: 1200 }}
      initial={dealFrom ? { x: dealFrom.x, y: dealFrom.y, rotate: -12, opacity: 0, scale: 0.8 } : false}
      animate={{ x: 0, y: 0, rotate: 0, opacity: dim ? 0.38 : 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 170, damping: 22, delay }}
    >
      <motion.div
        style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d", borderRadius: width * 0.08, boxShadow: shadow }}
        initial={dealFrom ? { rotateY: 180 } : false}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ type: "spring", stiffness: 140, damping: 18, delay: delay + (dealFrom ? 0.25 : 0) + flipDelay }}
      >
        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}>
          {card && <FaceSvg card={card} jumbo={jumbo} />}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <BackSvg />
        </div>
      </motion.div>
    </motion.div>
  );
}

/** A small, legible inline card for lists/history: big rank + suit. */
export function MiniCard({ card, width = 28 }: { card: Card; width?: number }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1) as Suit;
  const color = isRed(suit) ? "#d9343b" : "#111418";
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center rounded-[4px] bg-[#fbfaf7] shadow-[0_1px_3px_rgba(0,0,0,.4)]"
      style={{ width, height: width * 1.38, gap: width * 0.04 }}
      aria-label={card}
    >
      <span className="font-display font-bold leading-none" style={{ color, fontSize: width * (rank === "10" ? 0.48 : 0.56), letterSpacing: rank === "10" ? "-0.08em" : 0 }}>
        {rank}
      </span>
      <svg viewBox="0 0 100 100" width={width * 0.42} height={width * 0.42} aria-hidden>
        <path d={SUIT_PATHS[suit]} fill={color} />
      </svg>
    </div>
  );
}
