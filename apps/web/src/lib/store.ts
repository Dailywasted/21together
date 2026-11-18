import { create } from "zustand";
import type { ClientMsg, ServerMsg, PublicSnapshot, PrivateView, RoomEvent } from "@21/protocol";
import { WS_BASE } from "./api";
import { deviceId } from "./storage";
import { phoneLag } from "./pace";

export type ConnStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";
type Role = "player" | "host" | "spectator";

interface GameStore {
  code: string | null;
  role: Role;
  status: ConnStatus;
  playerId: string | null;
  snap: PublicSnapshot | null;
  me: PrivateView | null;
  /** serverNow − Date.now(), smoothed. */
  clockOffset: number;
  lastError: { code: string; at: number } | null;
  /** True once the server confirmed the room exists. */
  notFound: boolean;
  connect: (code: string, role: Role, hostToken?: string) => void;
  disconnect: () => void;
  send: (msg: ClientMsg) => void;
}

type EventListener = (e: RoomEvent) => void;
type ReactListener = (playerId: string, emoji: string) => void;
const eventListeners = new Set<EventListener>();
const reactListeners = new Set<ReactListener>();

export function onRoomEvent(fn: EventListener): () => void {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}
export function onReaction(fn: ReactListener): () => void {
  reactListeners.add(fn);
  return () => reactListeners.delete(fn);
}

let ws: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let wanted: { code: string; role: Role; hostToken?: string } | null = null;

/**
 * Sends a line to the room log (see GET /api/rooms/:code/log). Used to understand bugs after the fact:
 * what a screen showed, what was tapped, reloads, errors. Queued (last 30) until the socket is open.
 */
const diagQueue: string[] = [];
export function diag(kind: string, detail?: string): void {
  const data = JSON.stringify({ t: "diag", kind: kind.slice(0, 40), detail: detail?.slice(0, 300) } satisfies ClientMsg);
  if (ws && ws.readyState === WebSocket.OPEN && helloSent) ws.send(data);
  else {
    diagQueue.push(data);
    if (diagQueue.length > 30) diagQueue.shift();
  }
}
let helloSent = false;
let closedAt = 0;
let queue: string[] = [];

/**
 * Phones hold back updates that reveal a card (or a result) until the TV has shown it, so the whole room
 * reacts to the big screen first. Updates are applied in order; anything else goes through immediately
 * unless an earlier held update is still waiting.
 */
let lastReceived: PublicSnapshot | null = null;
let releaseAt = 0;
function deliver(lag: number, apply: () => void) {
  const at = Math.max(Date.now() + lag, releaseAt);
  releaseAt = at;
  const wait = at - Date.now();
  if (wait <= 0) apply();
  else setTimeout(apply, wait);
}
function resetDelivery() {
  lastReceived = null;
  releaseAt = 0;
}

export const useGame = create<GameStore>((set, get) => {
  function open() {
    if (!wanted) return;
    const { code, role, hostToken } = wanted;
    set({ status: retry === 0 ? "connecting" : "reconnecting" });
    const sock = new WebSocket(`${WS_BASE}/ws/${code}`);
    ws = sock;
    resetDelivery();
    sock.onopen = () => {
      const tries = retry;
      retry = 0;
      set({ status: "open", notFound: false });
      sock.send(JSON.stringify({ t: "hello", role, deviceId: deviceId(), hostToken } satisfies ClientMsg));
      helloSent = true;
      if (tries > 0) diag("reconnected", `after ${tries} tries, ${Math.round((Date.now() - closedAt) / 100) / 10}s offline`);
      for (const m of diagQueue.splice(0)) sock.send(m);
      for (const m of queue) sock.send(m);
      queue = [];
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => get().send({ t: "ping", at: Date.now() }), 15_000);
      get().send({ t: "ping", at: Date.now() });
    };
    sock.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      switch (msg.t) {
        case "welcome":
          set({ playerId: msg.playerId, role: msg.role });
          break;
        case "state": {
          const offset = msg.s.serverNow - Date.now();
          const prev = get().clockOffset;
          if (prev === 0) set({ clockOffset: offset });
          const lag = get().role === "player" ? phoneLag(lastReceived, msg.s) : 0;
          lastReceived = msg.s;
          const { s: snap, me } = msg;
          deliver(lag, () => {
            if (ws !== sock) return;
            set({ snap, me, playerId: me?.playerId ?? get().playerId });
          });
          break;
        }
        case "events": {
          const events = msg.e;
          deliver(0, () => {
            if (ws !== sock) return;
            for (const e of events) for (const l of eventListeners) l(e);
          });
          break;
        }
        case "react":
          for (const l of reactListeners) l(msg.playerId, msg.emoji);
          break;
        case "pong": {
          const rtt = Date.now() - msg.at;
          const offset = msg.serverNow + rtt / 2 - Date.now();
          set({ clockOffset: offset });
          break;
        }
        case "error":
          set({ lastError: { code: msg.code, at: Date.now() } });
          if (msg.code === "kicked" || msg.code === "banned") set({ playerId: null });
          break;
      }
    };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      helloSent = false;
      closedAt = Date.now();
      diag("connection lost", `code ${ev.code}`);
      if (pingTimer) clearInterval(pingTimer);
      if (!wanted) {
        set({ status: "closed" });
        return;
      }
      // 404 from the DO surfaces as an immediate close without ever opening.
      if (ev.code === 1006 && get().status === "connecting" && retry >= 2) set({ notFound: true });
      retry++;
      const delay = Math.min(8000, 400 * 2 ** Math.min(retry, 5)) + Math.random() * 300;
      set({ status: "reconnecting" });
      retryTimer = setTimeout(open, delay);
    };
  }

  return {
    code: null,
    role: "player",
    status: "idle",
    playerId: null,
    snap: null,
    me: null,
    clockOffset: 0,
    lastError: null,
    notFound: false,
    connect(code, role, hostToken) {
      if (wanted && wanted.code === code && wanted.role === role && ws) return;
      get().disconnect();
      wanted = { code, role, hostToken };
      retry = 0;
      set({ code, role, snap: null, me: null, playerId: null, notFound: false });
      open();
    },
    disconnect() {
      wanted = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      const s = ws;
      ws = null;
      s?.close();
      set({ status: "idle" });
    },
    send(msg) {
      const data = JSON.stringify(msg);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
      else if (msg.t !== "ping") queue.push(data);
    },
  };
});

// Reconnect immediately when a phone wakes up / comes back online.
if (typeof window !== "undefined") {
  const kick = () => {
    if (wanted && (!ws || ws.readyState > 1)) {
      if (retryTimer) clearTimeout(retryTimer);
      retry = 0;
      // re-run connect logic
      const w = wanted;
      wanted = null;
      useGame.getState().connect(w.code, w.role, w.hostToken);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") kick();
  });
  window.addEventListener("online", kick);
}

/** Milliseconds left in the current timed phase (server-clock corrected). */
export function timeLeft(snap: PublicSnapshot | null, offset: number): number {
  if (!snap || snap.deadline === null) return 0;
  return Math.max(0, snap.deadline - (Date.now() + offset));
}
