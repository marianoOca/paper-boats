import type * as Party from "partykit/server";
import type {
  ClientMsg,
  PlayerMeta,
  Phase,
  RoomSettings,
} from "../game/net/protocol";
import { BOAT_COLORS, MAX_PLAYERS, MIN_PLAYERS_TO_START, START_LIVES } from "../lib/constants";

const j = (m: unknown) => JSON.stringify(m);

export default class GameServer implements Party.Server {
  players = new Map<string, PlayerMeta>(); // insertion order = join order
  phase: Phase = "lobby";
  hostId = "";
  settings: RoomSettings = { timerSec: 120, arenaMode: "walls", startLives: START_LIVES };
  startEpoch: number | null = null;
  endReason: "timeout" | "combat" | null = null;

  constructor(readonly room: Party.Room) {}

  // ---- lifecycle ----------------------------------------------------------
  onConnect(conn: Party.Connection) {
    if (this.players.size >= MAX_PLAYERS) {
      conn.send(j({ t: "full" }));
      conn.close();
      return;
    }
    const color = this.firstFreeColor();
    this.players.set(conn.id, {
      id: conn.id,
      name: "",
      color,
      ready: true,
      isHost: false,
      alive: true,
      lives: this.settings.startLives,
      deathTick: null,
      damageDealt: 0,
    });
    if (!this.hostId) this.hostId = conn.id;
    conn.send(j({ t: "welcome", id: conn.id }));
    this.broadcastRoom();
  }

  onClose(conn: Party.Connection) {
    this.removePlayer(conn.id);
  }
  onError(conn: Party.Connection) {
    this.removePlayer(conn.id);
  }

  removePlayer(id: string) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    if (id === this.hostId) {
      // promote earliest remaining connection
      this.hostId = this.players.keys().next().value ?? "";
      // host carried the simulation; abort any active match back to lobby
      if (this.phase === "countdown" || this.phase === "playing") {
        this.resetToLobby();
      }
    }
    this.broadcastRoom();
  }

  // ---- messages -----------------------------------------------------------
  onMessage(raw: string, sender: Party.Connection) {
    let m: ClientMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const me = this.players.get(sender.id);
    if (!me) return;
    const isHost = sender.id === this.hostId;

    switch (m.t) {
      case "join":
        me.name = String(m.name).slice(0, 16) || "Sailor";
        this.broadcastRoom();
        break;

      case "setColor":
        if (this.phase === "lobby" && this.colorFree(m.color, sender.id)) {
          me.color = m.color;
          this.broadcastRoom();
        }
        break;

      case "setTimer":
        if (isHost && this.phase === "lobby") {
          this.settings.timerSec = m.timerSec;
          this.broadcastRoom();
        }
        break;

      case "setArenaMode":
        if (isHost && this.phase === "lobby") {
          this.settings.arenaMode = m.arenaMode;
          this.broadcastRoom();
        }
        break;

      case "setLives":
        if (isHost && this.phase === "lobby") {
          this.settings.startLives = Math.max(1, Math.min(5, Math.round(m.startLives)));
          this.broadcastRoom();
        }
        break;

      case "start":
        if (isHost && this.phase === "lobby" && this.readyCount() >= MIN_PLAYERS_TO_START) {
          this.phase = "countdown";
          this.startEpoch = Date.now();
          this.broadcastRoom();
        }
        break;

      case "rematch":
        if (isHost && this.phase === "ended") {
          this.resetToLobby();
          this.broadcastRoom();
        }
        break;

      // client input -> host only
      case "in":
        if (this.hostId) {
          this.room.getConnection(this.hostId)?.send(
            j({ ...m, from: sender.id })
          );
        }
        break;

      // host simulation stream -> everyone else (rebroadcast raw)
      case "snap":
      case "ev":
        if (isHost) this.room.broadcast(raw, [sender.id]);
        break;

      // host authoritative stats -> fold into roster
      case "stats":
        if (isHost) {
          for (const p of m.players) {
            const pl = this.players.get(p.id);
            if (pl) {
              pl.lives = p.lives;
              pl.alive = p.alive;
              pl.deathTick = p.deathTick;
              pl.damageDealt = p.damageDealt;
            }
          }
          this.broadcastRoom();
        }
        break;

      // host drives phase during a match (playing / ended)
      case "phase":
        if (isHost) {
          this.phase = m.phase;
          if (m.phase === "ended") {
            this.endReason = m.endReason ?? "combat";
            this.assignRanks();
          }
          this.broadcastRoom();
        }
        break;

      case "ping":
        sender.send(j({ t: "pong", ts: m.ts, server: Date.now() }));
        break;
    }
  }

  // ---- helpers ------------------------------------------------------------
  resetToLobby() {
    this.phase = "lobby";
    this.startEpoch = null;
    this.endReason = null;
    for (const p of this.players.values()) {
      p.ready = true;
      p.alive = true;
      p.lives = this.settings.startLives;
      p.deathTick = null;
      p.damageDealt = 0;
      p.rank = undefined;
    }
  }

  readyCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.ready && p.name) n++;
    return n;
  }

  colorFree(color: string, exceptId: string) {
    for (const [id, p] of this.players) if (id !== exceptId && p.color === color) return false;
    return true;
  }

  firstFreeColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return BOAT_COLORS.find((c) => !used.has(c)) ?? BOAT_COLORS[0];
  }

  // standard competition ranking (ties share a rank: 1,1,3,...)
  assignRanks() {
    const arr = [...this.players.values()];
    arr.sort(rankCompare);
    let rank = 0;
    arr.forEach((p, i) => {
      if (i === 0 || rankCompare(arr[i - 1], p) !== 0) rank = i + 1;
      p.rank = rank;
    });
  }

  broadcastRoom() {
    const players = [...this.players.values()].map((p) => ({
      ...p,
      isHost: p.id === this.hostId,
    }));
    this.room.broadcast(
      j({
        t: "room",
        phase: this.phase,
        hostId: this.hostId,
        settings: this.settings,
        players,
        startEpoch: this.startEpoch,
        endReason: this.endReason,
      })
    );
  }
}

// Leaderboard order (negative => a ranks higher):
// 1) survived the most  2) most lives  3) most damage dealt
export function rankCompare(a: PlayerMeta, b: PlayerMeta): number {
  if (a.alive !== b.alive) return a.alive ? -1 : 1;
  if (!a.alive && !b.alive && a.deathTick !== b.deathTick) {
    return (b.deathTick ?? 0) - (a.deathTick ?? 0); // later death survived longer
  }
  if (a.lives !== b.lives) return b.lives - a.lives;
  return b.damageDealt - a.damageDealt;
}

GameServer satisfies Party.Worker;
