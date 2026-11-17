import type { GameRoom } from "./room";

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
}
