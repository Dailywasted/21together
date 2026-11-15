import { DurableObject } from "cloudflare:workers";
import { RoomCore, RoomError, type RoomEvent } from "@21/engine";
import { ClientMsg, ALLOWED_REACTIONS, type ServerMsg } from "@21/protocol";
import { persistRounds } from "./db";
import type { Env } from "./env";

interface Attachment {
  role: "player" | "host" | "spectator" | null;
  deviceId: string | null;
  playerId: string | null;
  lastReact: number;
  msgCount: number;
  windowStart: number;
}

const STATE_KEY = "room";
const META_KEY = "meta";
/** Rooms with no activity for this long are wiped by the alarm. */
const ROOM_TTL_MS = 3 * 24 * 3600 * 1000;

interface Meta {
  hostToken: string;
  lastActivity: number;
}

export class GameRoom extends DurableObject<Env> {
  private room: RoomCore | null = null;
  private meta: Meta | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const [state, meta] = await Promise.all([
        ctx.storage.get<RoomCore["state"]>(STATE_KEY),
        ctx.storage.get<Meta>(META_KEY),
      ]);
      if (state) this.room = new RoomCore(state);
      if (meta) this.meta = meta;
    });
  }

  // ───────────── HTTP (internal, from the Worker) ─────────────

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") {
      if (this.room) return new Response("exists", { status: 409 });
      const { code, hostToken } = (await request.json()) as { code: string; hostToken: string };
      const now = Date.now();
      this.room = RoomCore.create(code, now);
      this.meta = { hostToken, lastActivity: now };
      await this.save();
      await this.scheduleAlarm();
      return Response.json({ ok: true });
    }
    if (url.pathname === "/info") {
      if (!this.room) return Response.json({ exists: false });
      const s = this.room.state;
      return Response.json({
        exists: true,
        code: s.code,
        phase: s.phase,
        players: Object.values(s.players).filter((p) => !p.left).length,
        seats: s.seats.length,
      });
    }
    if (url.pathname === "/history") {
      if (!this.room) return Response.json({ rounds: [] });
      const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) | 0);
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) | 0));
      return Response.json({ rounds: this.room.state.history.slice(offset, offset + limit), total: this.room.state.history.length });
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      if (!this.room) return new Response("no such room", { status: 404 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      const att: Attachment = { role: null, deviceId: null, playerId: null, lastReact: 0, msgCount: 0, windowStart: Date.now() };
      server.serializeAttachment(att);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("not found", { status: 404 });
  }

  // ───────────── WebSocket (hibernation API) ─────────────

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room || !this.meta) return;
    if (typeof raw !== "string" || raw.length > 4096) return;
    const att = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    // Simple rate limit: 40 messages / 5s per socket.
    if (now - att.windowStart > 5000) {
      att.windowStart = now;
      att.msgCount = 0;
    }
    if (++att.msgCount > 40) {
      ws.serializeAttachment(att);
      return;
    }
    let msg: ClientMsg;
    try {
      msg = ClientMsg.parse(JSON.parse(raw));
    } catch {
      this.send(ws, { t: "error", code: "bad_message" });
      ws.serializeAttachment(att);
      return;
    }
    const room = this.room;
    room.tick(now);
    try {
      switch (msg.t) {
        case "ping":
          this.send(ws, { t: "pong", at: msg.at, serverNow: now });
          ws.serializeAttachment(att);
          return;
        case "hello": {
          att.deviceId = msg.deviceId;
          if (msg.role === "host") {
            if (msg.hostToken !== this.meta.hostToken) {
              this.send(ws, { t: "error", code: "bad_host_token" });
              att.role = "spectator";
            } else att.role = "host";
          } else att.role = msg.role;
          if (att.role === "player") {
            const p = room.playerByDevice(msg.deviceId);
            if (p && !p.left) {
              att.playerId = p.id;
              room.setConnected(p.id, true);
            }
          }
          ws.serializeAttachment(att);
          this.send(ws, { t: "welcome", role: att.role ?? "spectator", playerId: att.playerId, serverNow: now });
          break;
        }
        case "join": {
          if (att.role !== "player" || !att.deviceId) throw new RoomError("say_hello");
          const p = room.join(att.deviceId, msg.name, msg.avatar, now);
          att.playerId = p.id;
          ws.serializeAttachment(att);
          this.send(ws, { t: "welcome", role: "player", playerId: p.id, serverNow: now });
          break;
        }
        case "leave":
          if (att.playerId) room.leave(att.playerId);
          att.playerId = null;
          ws.serializeAttachment(att);
          break;
        case "bet":
          if (!att.playerId) throw new RoomError("not_player");
          room.placeBet(att.playerId, msg.amount, msg.lock, now);
          break;
        case "decide":
          if (!att.playerId) throw new RoomError("not_player");
          room.decide(att.playerId, msg.action, now);
          break;
        case "react": {
          if (!att.playerId || !(ALLOWED_REACTIONS as readonly string[]).includes(msg.emoji)) return;
          if (now - att.lastReact < 1200) return;
          att.lastReact = now;
          ws.serializeAttachment(att);
          this.broadcastRaw({ t: "react", playerId: att.playerId, emoji: msg.emoji });
          return;
        }
        case "host": {
          if (att.role !== "host") throw new RoomError("not_host");
          const c = msg.cmd;
          switch (c.c) {
            case "start": room.hostStart(now); break;
            case "pause": room.pause(now); break;
            case "resume": room.resume(now); break;
            case "skip": room.skip(now); break;
            case "end": room.endNight(now); break;
            case "kick": {
              room.kick(c.playerId, c.ban);
              for (const other of this.ctx.getWebSockets()) {
                const a = other.deserializeAttachment() as Attachment;
                if (a.playerId === c.playerId) {
                  a.playerId = null;
                  other.serializeAttachment(a);
                  this.send(other, { t: "error", code: c.ban ? "banned" : "kicked" });
                }
              }
              break;
            }
            case "topup": room.topUp(c.playerId, c.amount); break;
            case "topupBroke": room.topUpBroke(); break;
            case "rules": room.updateRules(c.rules, now); break;
          }
          break;
        }
      }
    } catch (e) {
      if (e instanceof RoomError) this.send(ws, { t: "error", code: e.code });
      else {
        console.error("room error", e);
        this.send(ws, { t: "error", code: "server_error" });
      }
    }
    if (msg.t !== "hello" && msg.t !== "join") ws.serializeAttachment(att);
    await this.commit(now);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.onSocketGone(ws);
  }

  private async onSocketGone(ws: WebSocket): Promise<void> {
    if (!this.room) return;
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.playerId) return;
    const stillOpen = this.ctx
      .getWebSockets()
      .some((o) => o !== ws && (o.deserializeAttachment() as Attachment | null)?.playerId === att.playerId);
    if (!stillOpen) {
      this.room.setConnected(att.playerId, false);
      await this.commit(Date.now());
    }
  }

  // ───────────── Alarm (phase timers) ─────────────

  override async alarm(): Promise<void> {
    if (!this.room || !this.meta) return;
    const now = Date.now();
    if (now - this.meta.lastActivity > ROOM_TTL_MS && this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      this.meta = null;
      return;
    }
    this.room.tick(now);
    await this.commit(now, false);
  }

  // ───────────── helpers ─────────────

  private async commit(now: number, activity = true): Promise<void> {
    const room = this.room!;
    if (activity && this.meta) this.meta.lastActivity = now;
    const events = room.takeEvents();
    const completed = room.takeCompleted();
    await this.save();
    await this.scheduleAlarm();
    this.broadcastState(now, events);
    if (completed.length > 0 && this.env.DATABASE_URL) {
      this.ctx.waitUntil(
        persistRounds(this.env.DATABASE_URL, room.state.code, completed).catch((e) => console.error("persist failed", e)),
      );
    }
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put({ [STATE_KEY]: this.room!.state, [META_KEY]: this.meta });
  }

  private async scheduleAlarm(): Promise<void> {
    const d = this.room?.state.deadline;
    // Always keep a long fallback alarm so idle rooms eventually expire.
    const next = d ?? Date.now() + 6 * 3600 * 1000;
    await this.ctx.storage.setAlarm(next);
  }

  private broadcastState(now: number, events: RoomEvent[]): void {
    const room = this.room!;
    const snap = room.snapshot(now);
    const eventsMsg = events.length > 0 ? JSON.stringify({ t: "events", e: events } satisfies ServerMsg) : null;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment | null;
      if (!att?.role) continue;
      const me = att.playerId ? room.privateView(att.playerId) : null;
      try {
        ws.send(JSON.stringify({ t: "state", s: snap, me } satisfies ServerMsg));
        if (eventsMsg) ws.send(eventsMsg);
      } catch {
        // socket already closing
      }
    }
  }

  private broadcastRaw(msg: ServerMsg): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* ignore */
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }
}
