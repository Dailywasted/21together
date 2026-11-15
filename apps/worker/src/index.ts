import type { CreateRoomResponse } from "@21/protocol";
import { globalLeaderboard, playerStats } from "./db";
import type { Env } from "./env";

export { GameRoom } from "./room";

// No I/O/0/1 to avoid confusion when typing codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(len = 4): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function randomToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function stub(env: Env, code: string) {
  return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
}

const CODE_RE = /^[A-Z]{4}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      if (path === "/" || path === "/api/health") return json({ ok: true, service: "21together-api" });

      if (path === "/api/rooms" && request.method === "POST") {
        for (let attempt = 0; attempt < 8; attempt++) {
          const code = randomCode();
          const hostToken = randomToken();
          const res = await stub(env, code).fetch("https://room/init", {
            method: "POST",
            body: JSON.stringify({ code, hostToken }),
          });
          if (res.ok) return json({ code, hostToken } satisfies CreateRoomResponse, 201);
        }
        return json({ error: "could_not_allocate" }, 503);
      }

      const roomMatch = path.match(/^\/api\/rooms\/([A-Za-z]{4})(\/history)?$/);
      if (roomMatch && request.method === "GET") {
        const code = roomMatch[1]!.toUpperCase();
        const sub = roomMatch[2] ? "/history" : "/info";
        const res = await stub(env, code).fetch(`https://room${sub}${url.search}`);
        const body = (await res.json()) as Record<string, unknown>;
        return json({ code, ...body });
      }

      const wsMatch = path.match(/^\/ws\/([A-Za-z]{4})$/);
      if (wsMatch) {
        const code = wsMatch[1]!.toUpperCase();
        if (!CODE_RE.test(code)) return json({ error: "bad_code" }, 400);
        return stub(env, code).fetch("https://room/ws", request);
      }

      if (path === "/api/leaderboard" && request.method === "GET") {
        if (!env.DATABASE_URL) return json({ players: [] });
        return json({ players: await globalLeaderboard(env.DATABASE_URL) }, 200, { "Cache-Control": "public, max-age=30" });
      }

      const statsMatch = path.match(/^\/api\/players\/([A-Za-z0-9_-]{8,64})\/stats$/);
      if (statsMatch && request.method === "GET") {
        if (!env.DATABASE_URL) return json({ stats: null });
        return json({ stats: await playerStats(env.DATABASE_URL, statsMatch[1]!) });
      }

      return json({ error: "not_found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "server_error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
