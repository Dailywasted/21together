import type { CreateRoomResponse, RoomInfoResponse } from "@21/protocol";
import type { RoundSummary } from "@21/engine";

/**
 * API origin, in order:
 * 1. VITE_API_URL at build time (e.g. apps/web/.env.production), for custom domains.
 * 2. On workers.dev: the web app at `21together.<sub>.workers.dev` talks to `21together-api.<sub>.workers.dev`,
 *    so any Cloudflare account can deploy both workers with no config.
 * 3. Dev: same host on port 8787 (so phones on the LAN work).
 */
function apiBase(): string {
  const fromEnv = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const m = location.hostname.match(/^([^.]+)\.(.+\.workers\.dev)$/);
  if (m) return `https://${m[1]}-api.${m[2]}`;
  return `${location.protocol}//${location.hostname}:8787`;
}

export const API_BASE: string = apiBase();

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
};

/** The URL players scan to join. */
export function joinUrl(code: string): string {
  return `${location.origin}/j/${code}`;
}
