import { z } from "zod";
import type { PublicSnapshot, PrivateView, RoomEvent, Rules } from "@21/engine";

/** Client → server messages. */
export const ClientMsg = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    role: z.enum(["player", "host", "spectator"]),
    deviceId: z.string().min(8).max(64),
    hostToken: z.string().max(128).optional(),
  }),
  z.object({ t: z.literal("join"), name: z.string().max(40), avatar: z.string().max(16) }),
  z.object({ t: z.literal("leave") }),
  z.object({ t: z.literal("bet"), amount: z.number().int().min(0).max(1_000_000), lock: z.boolean() }),
  z.object({ t: z.literal("decide"), action: z.enum(["hit", "stand", "double", "split"]) }),
  /** Diagnostics from a screen (shown in the room log): what it showed, what was tapped, errors, reloads. */
  z.object({ t: z.literal("diag"), kind: z.string().max(40), detail: z.string().max(300).optional() }),
  z.object({ t: z.literal("react"), emoji: z.string().max(8) }),
  z.object({ t: z.literal("pick"), runner: z.number().int().min(0).max(5) }),
  z.object({ t: z.literal("ping"), at: z.number() }),
  z.object({
    t: z.literal("host"),
    cmd: z.discriminatedUnion("c", [
      z.object({ c: z.literal("start") }),
      z.object({ c: z.literal("pause") }),
      z.object({ c: z.literal("resume") }),
      z.object({ c: z.literal("skip") }),
      z.object({ c: z.literal("end") }),
      z.object({ c: z.literal("kick"), playerId: z.string().max(32), ban: z.boolean().default(false) }),
      z.object({ c: z.literal("topup"), playerId: z.string().max(32), amount: z.number().int().min(1).max(1_000_000) }),
      z.object({ c: z.literal("topupBroke") }),
      z.object({ c: z.literal("bonus") }),
      z.object({
        c: z.literal("rules"),
        rules: z
          .object({
            decks: z.number(),
            dealerHitsSoft17: z.boolean(),
            blackjackPayout: z.number(),
            minBet: z.number(),
            maxBet: z.number(),
            startingChips: z.number(),
            maxSeats: z.number(),
            betSeconds: z.number(),
            decisionSeconds: z.number(),
            manual: z.boolean(),
            bonusGames: z.boolean(),
            allowSplit: z.boolean(),
          })
          .partial(),
      }),
    ]),
  }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;
export type HostCmd = Extract<ClientMsg, { t: "host" }>["cmd"];

export const ALLOWED_REACTIONS = ["🔥", "😱", "😂", "👏", "🙏", "💀", "🤑", "😎"] as const;

/** Server → client messages. */
export type ServerMsg =
  | { t: "welcome"; role: "player" | "host" | "spectator"; playerId: string | null; serverNow: number }
  | { t: "state"; s: PublicSnapshot; me: PrivateView | null }
  | { t: "events"; e: RoomEvent[] }
  | { t: "react"; playerId: string; emoji: string }
  | { t: "pong"; at: number; serverNow: number }
  | { t: "error"; code: string };

export interface CreateRoomResponse {
  code: string;
  hostToken: string;
}

export interface RoomInfoResponse {
  code: string;
  exists: boolean;
  phase?: string;
  players?: number;
  seats?: number;
}

export type { PublicSnapshot, PrivateView, RoomEvent, Rules };
