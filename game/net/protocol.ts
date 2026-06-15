// Wire protocol between clients, the PartyKit relay, and the host browser.
//
// Routing rules enforced by the server:
//   - client `in`     -> relayed to the host only (tagged with `from`)
//   - host `snap`/`ev`-> relayed to every other connection
//   - host `stats`/`phase` -> consumed by server, folded into `room`, rebroadcast
//   - lobby messages  -> consumed by server

export type Phase = "lobby" | "countdown" | "playing" | "ended";

export const MODE_MOVE = 0;
export const MODE_CANNON = 1;
export type Mode = typeof MODE_MOVE | typeof MODE_CANNON;

export interface RoomSettings {
  timerSec: number | null;
  arenaMode: "walls" | "edge";
  startLives: number;
}

export interface PlayerMeta {
  id: string;
  idx: number; // stable wire slot 0..MAX_PLAYERS-1 (binary snap/input addressing)
  name: string;
  color: string;
  ready: boolean;
  isHost: boolean;
  connected: boolean; // false while the socket is down; boat freezes in place
  alive: boolean;
  lives: number;
  deathTick: number | null; // host sim tick at death (later = survived longer)
  damageDealt: number;
  rank?: number; // assigned when phase === "ended"
}

// snapshot entity: [id, x,y,z, qx,qy,qz,qw, lives, flags, aimYaw]
export type EntTuple = [
  string,
  number, number, number,
  number, number, number, number,
  number,
  number,
  number
];
// cannonball: [id, x, y, z]
export type BallTuple = [string, number, number, number];

export const FLAG_ALIVE = 1 << 0;

export type GameEvent =
  | { k: "fire"; owner: string; origin: [number, number, number]; dir: [number, number, number] }
  | { k: "hit"; victim: string; attacker: string; point: [number, number, number]; kind: "ball" | "ram" }
  | { k: "death"; id: string; by: string | null; sunkTaunt: number; killTaunt: number }
  | { k: "splash"; point: [number, number, number] };

export interface StatPatch {
  id: string;
  lives: number;
  alive: boolean;
  deathTick: number | null;
  damageDealt: number;
}

// Input is sent as a binary frame (see lib/wire.ts), not JSON. The runtime
// shape lives in hostInputs.ts as `BoatInput`.

// ---- client -> server ----
// `snap` and `in` are binary (lib/wire.ts) and are not part of this union.
export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "setColor"; color: string }
  | { t: "setTimer"; timerSec: number | null }
  | { t: "setArenaMode"; arenaMode: "walls" | "edge" }
  | { t: "setLives"; startLives: number }
  | { t: "start" }
  | { t: "rematch" }
  | { t: "ev"; ev: GameEvent }
  | { t: "stats"; players: StatPatch[] }
  | { t: "phase"; phase: Phase; endReason?: "timeout" | "combat" }
  | { t: "vis"; v: boolean } // tab foreground (true) / backgrounded (false)
  | { t: "ping"; ts: number };

// ---- server -> client ----
// `snap` (-> clients) and `in` (-> host) are binary (lib/wire.ts).
export type ServerMsg =
  | { t: "welcome"; id: string }
  | {
      t: "room";
      phase: Phase;
      hostId: string;
      settings: RoomSettings;
      players: PlayerMeta[];
      startEpoch: number | null; // server time (ms) when countdown began
      endReason: "timeout" | "combat" | null;
    }
  | { t: "ev"; ev: GameEvent }
  | { t: "pong"; ts: number; server: number };

export const json = (m: ClientMsg | ServerMsg) => JSON.stringify(m);
