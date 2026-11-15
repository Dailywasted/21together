import type { CreateRoomResponse, GlobalPlayerStats, RoomInfoResponse } from "@21/protocol";
import type { RoundSummary } from "@21/engine";

/** API origin: build-time env in production, same host on port 8787 in dev (so phones on the LAN work). */
export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  `${location.protocol}//${location.hostname}:8787`;

export const WS_BASE = API_BASE.replace(/^http/, "ws");

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  createRoom: () => req<CreateRoomResponse>("/api/rooms", { method: "POST" }),
  roomInfo: (code: string) => req<RoomInfoResponse>(`/api/rooms/${code}`),
  history: (code: string, offset = 0, limit = 20) =>
    req<{ rounds: RoundSummary[]; total: number }>(`/api/rooms/${code}/history?offset=${offset}&limit=${limit}`),
  leaderboard: () => req<{ players: GlobalPlayerStats[] }>("/api/leaderboard"),
  playerStats: (deviceId: string) => req<{ stats: GlobalPlayerStats | null }>(`/api/players/${deviceId}/stats`),
};

/** The URL players scan to join. */
export function joinUrl(code: string): string {
  return `${location.origin}/j/${code}`;
}
