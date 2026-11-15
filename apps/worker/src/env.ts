import type { GameRoom } from "./room";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  /** Neon connection string (secret). Optional: without it, nothing is persisted outside the room. */
  DATABASE_URL?: string;
}
