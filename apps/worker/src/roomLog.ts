import type { RoomCore, RoomEvent } from "@21/engine";

/**
 * Room timeline for troubleshooting: what the server did and what each screen reported.
 * Read it with GET /api/rooms/:code/log (or `node scripts/log.mjs CODE`).
 * Entries also go to the Worker logs (Cloudflare dashboard → Workers → 21together-api → Logs).
 */
export interface LogEntry {
  /** Server time (ms). */
  at: number;
  /** "server", or the screen that reported it: "tv", "phone", "spectator". */
  src: string;
  /** Player name (phones) when known. */
  who?: string;
  kind: string;
  detail?: string;
}

/** Keeps the last 1000 entries (roughly the last hour of play). */
export const LOG_LIMIT = 1000;

export class RoomLog {
  entries: LogEntry[];
  /** New entries since the last save. */
  dirty = false;
  private lastPhase: string | null = null;

  constructor(entries: LogEntry[] | undefined, private code: () => string) {
    this.entries = entries ?? [];
  }

  add(e: Omit<LogEntry, "at"> & { at?: number }): void {
    const entry: LogEntry = { at: e.at ?? Date.now(), src: e.src, kind: e.kind };
    if (e.who) entry.who = e.who;
    if (e.detail) entry.detail = e.detail;
    this.entries.push(entry);
    this.dirty = true;
    if (this.entries.length > LOG_LIMIT) this.entries.splice(0, this.entries.length - LOG_LIMIT);
    console.log(JSON.stringify({ room: this.code(), ...entry }));
  }

  /** Phase changes and game events, logged once per commit. */
  fromRoom(room: RoomCore, events: RoomEvent[], now: number): void {
    const s = room.state;
    const name = (id: string) => s.players[id]?.name ?? id;
    const phase = `${s.phase}${s.paused ? " (paused)" : ""}`;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      const timer = s.deadline !== null ? ` · ${Math.round((s.deadline - now) / 100) / 10}s` : s.awaitingHost ? " · waits for host" : "";
      this.add({ at: now, src: "server", kind: "phase", detail: `round ${s.roundNo} ${phase}${timer}` });
    }
    for (const e of events) {
      switch (e.k) {
        case "deal": {
          const r = s.round;
          this.add({ at: now, src: "server", kind: "deal", detail: r ? `cards ${r.shared.join(" ")} · dealer up ${r.dealer[0]}${r.early ? ` · ${r.early}` : ""}` : "" });
          break;
        }
        case "step": {
          const choices = Object.entries(e.revealed).map(([id, d]) => `${name(id)}=${d}${e.timedOut?.includes(id) ? " (TIMED OUT)" : ""}`);
          const cards = (e.rowCards ?? []).map((x) => `${x.card}${x.row ? `@hand${x.row}` : ""}`).join(" ");
          this.add({ at: now, src: "server", kind: "step", detail: `${choices.join(", ")}${cards ? ` · drew ${cards}` : ""}${e.secondHands ? " · second hands start" : ""}` });
          break;
        }
        case "payout":
          this.add({ at: now, src: "server", kind: "payout", detail: e.results.map((x) => `${x.name} ${x.outcome} ${x.net >= 0 ? "+" : ""}${x.net}`).join(", ") });
          break;
        case "shuffle":
        case "noBets":
          this.add({ at: now, src: "server", kind: e.k });
          break;
        case "kicked":
          this.add({ at: now, src: "server", kind: "kicked", detail: name(e.playerId) });
          break;
        case "joined":
        case "left":
          this.add({ at: now, src: "server", kind: e.k, detail: e.name });
          break;
      }
    }
  }
}
