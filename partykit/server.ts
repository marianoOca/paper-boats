import type * as Party from "partykit/server";
import type {
  ClientMsg,
  PlayerMeta,
  Phase,
  RoomSettings,
} from "../game/net/protocol";
import { BOAT_COLORS, DISCONNECT_GRACE_MS, MAX_PLAYERS, MIN_PLAYERS_TO_START, START_LIVES } from "../lib/constants";
import { TAG_INPUT, TAG_SNAP } from "../lib/wire";

const j = (m: unknown) => JSON.stringify(m);

export default class GameServer implements Party.Server {
  players = new Map<string, PlayerMeta>(); // insertion order = join order
  hidden = new Set<string>(); // ids whose tab is backgrounded (rAF paused → can't host)
  disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>(); // grace timers
  hostWatchdog?: ReturnType<typeof setTimeout>; // fires if host stops streaming snaps
  phase: Phase = "lobby";
  hostId = "";
  settings: RoomSettings = { timerSec: 120, arenaMode: "walls", startLives: START_LIVES };
  startEpoch: number | null = null;
  endReason: "timeout" | "combat" | null = null;

  constructor(readonly room: Party.Room) {}

  // ---- lifecycle ----------------------------------------------------------
  onConnect(conn: Party.Connection) {
    // Reconnection: a returning socket reuses its stable id (saved in the browser),
    // so its slot still exists (boat, lives, stats, idx, color, name all preserved).
    // Just un-freeze it — the client resumes its boat with no name re-entry.
    const existing = this.players.get(conn.id);
    if (existing) {
      this.clearDisconnectTimer(conn.id);
      existing.connected = true;
      conn.send(j({ t: "welcome", id: conn.id }));
      this.broadcastRoom();
      return;
    }
    // New socket: do NOT allocate a slot yet. The client first learns the phase and
    // whether its id already owns a boat (it doesn't, here), then decides — fresh
    // players enter a name and send `join`, which is where the slot is created. This
    // keeps name-less "discovery" sockets out of the roster (no ghost lobby entries).
    conn.send(j({ t: "welcome", id: conn.id }));
    conn.send(j(this.roomPayload()));
  }

  onClose(conn: Party.Connection) {
    this.markDisconnected(conn.id);
  }
  onError(conn: Party.Connection) {
    this.markDisconnected(conn.id);
  }

  // A socket dropped. In the lobby there are no boats/scores to keep, so remove
  // outright. Mid-match we freeze the slot (boat + stats survive) and start the
  // grace window for the banner / host failover.
  markDisconnected(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === "lobby") {
      this.removePlayer(id);
      return;
    }
    p.connected = false;
    // A host's sim state lives only in its tab, so a reload wipes it — a returning
    // host can't restore positions it never snapshotted and would reset everyone to
    // the spawn ring. Hand authority straight to another live tab that still holds
    // snapshots (it reconstructs the match in place); the old host returns as a
    // client. onGraceExpired stays the fallback for when nobody else can host yet.
    if (id === this.hostId) {
      const next = this.pickVisibleHost(id);
      if (next) this.hostId = next;
    }
    this.broadcastRoom();
    this.clearDisconnectTimer(id);
    this.disconnectTimers.set(id, setTimeout(() => this.onGraceExpired(id), DISCONNECT_GRACE_MS));
  }

  onGraceExpired(id: string) {
    this.disconnectTimers.delete(id);
    const p = this.players.get(id);
    if (!p || p.connected) return; // reconnected within the grace window
    if (id === this.hostId) {
      // Seamless handoff: promote a foreground player (one that can run the sim),
      // falling back to any connected. The new host reconstructs from its last
      // snapshot (no resetToLobby). The dropped host is connected:false, so skipped.
      this.hostId = this.pickVisibleHost("") || this.firstConnectedId();
      this.broadcastRoom();
    }
    // Non-host ghost: nothing structural — boat is already frozen, banner is
    // client-driven, and the slot persists until the match ends (resetToLobby).
  }

  removePlayer(id: string) {
    if (!this.players.has(id)) return;
    this.clearDisconnectTimer(id);
    this.players.delete(id);
    this.hidden.delete(id);
    if (id === this.hostId) this.hostId = this.pickVisibleHost("") || this.firstConnectedId();
    this.broadcastRoom();
  }

  clearDisconnectTimer(id: string) {
    const t = this.disconnectTimers.get(id);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(id);
    }
  }

  firstConnectedId(): string {
    for (const [id, p] of this.players) if (p.connected) return id;
    return "";
  }

  // A host must run the rAF sim, so it has to be a foreground (visible) tab. Backgrounded
  // tabs stay connected but can't simulate — picking one would freeze the match.
  pickVisibleHost(except: string): string {
    for (const [id, p] of this.players) {
      if (p.connected && !this.hidden.has(id) && id !== except) return id;
    }
    return "";
  }

  // The host streams snaps while it simulates. If they stop (backgrounded tab,
  // asleep, hung) during an active match, hand off to another connected player so
  // the game doesn't freeze. The stalled host stays connected (no ghost/banner) —
  // its boat just idles until it returns or is demoted.
  armHostWatchdog() {
    if (this.hostWatchdog) clearTimeout(this.hostWatchdog);
    this.hostWatchdog = setTimeout(() => this.onHostStalled(), DISCONNECT_GRACE_MS);
  }

  clearHostWatchdog() {
    if (this.hostWatchdog) {
      clearTimeout(this.hostWatchdog);
      this.hostWatchdog = undefined;
    }
  }

  onHostStalled() {
    this.hostWatchdog = undefined;
    if (this.phase !== "countdown" && this.phase !== "playing") return;
    // Promote a foreground tab only. Never bounce to a backgrounded ex-host (it can't
    // simulate) — that was the A↔B ping-pong that left the match paused. If no tab is
    // currently foreground, wait: the `vis` recovery promotes the first one to return.
    const next = this.pickVisibleHost(this.hostId);
    if (!next) return;
    this.hostId = next;
    this.broadcastRoom();
    this.armHostWatchdog(); // if the new host also stalls, cascade to the next
  }

  // ---- messages -----------------------------------------------------------
  onMessage(raw: string | ArrayBuffer, sender: Party.Connection) {
    // binary frames (snap 0x01, input 0x03) bypass JSON parsing entirely
    if (raw instanceof ArrayBuffer) {
      this.onBinary(raw, sender);
      return;
    }
    let m: ClientMsg;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    const me = this.players.get(sender.id);
    const isHost = sender.id === this.hostId;

    // `join` creates the slot lazily on first arrival (deferred from onConnect), so it
    // runs before the slot guard. `ping` is slot-less clock sync. Both can precede a slot.
    if (m.t === "join") {
      let p = me;
      if (!p) {
        if (this.players.size >= MAX_PLAYERS) {
          sender.send(j({ t: "full" }));
          return;
        }
        p = {
          id: sender.id,
          idx: this.firstFreeIdx(),
          name: "",
          color: this.firstFreeColor(),
          ready: true,
          isHost: false,
          connected: true,
          alive: true,
          lives: this.settings.startLives,
          deathTick: null,
          damageDealt: 0,
        };
        this.players.set(sender.id, p);
        if (!this.hostId) this.hostId = sender.id;
      }
      p.name = String(m.name).slice(0, 16) || "Sailor";
      this.broadcastRoom();
      return;
    }
    if (m.t === "ping") {
      sender.send(j({ t: "pong", ts: m.ts, server: Date.now() }));
      return;
    }
    if (!me) return; // every other message requires a joined slot

    if (m.t === "vis") {
      if (m.v) this.hidden.delete(sender.id);
      else this.hidden.add(sender.id);
      // Recovery: if the match is live but the current host can't simulate (gone or
      // backgrounded) and this tab just came to the foreground, hand it the role so
      // the game resumes. Covers "every tab was backgrounded, then one returns."
      if (m.v && (this.phase === "countdown" || this.phase === "playing") && me.connected) {
        const host = this.players.get(this.hostId);
        const hostOk = host && host.connected && !this.hidden.has(this.hostId);
        if (!hostOk) {
          this.hostId = sender.id;
          this.broadcastRoom();
          this.armHostWatchdog();
        }
      }
      return;
    }

    switch (m.t) {
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
          this.armHostWatchdog();
          this.broadcastRoom();
        }
        break;

      case "rematch":
        if (isHost && this.phase === "ended") {
          this.resetToLobby();
          this.broadcastRoom();
        }
        break;

      // host game events -> everyone else (rebroadcast raw). snap & input are
      // binary now (see onBinary); only `ev` still rides the JSON path.
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
    }
  }

  // binary frames: snap (host -> all), input (client -> host, idx-tagged)
  onBinary(buf: ArrayBuffer, sender: Party.Connection) {
    const tag = new Uint8Array(buf, 0, 1)[0];
    if (tag === TAG_SNAP) {
      if (sender.id === this.hostId) {
        this.room.broadcast(buf, [sender.id]);
        this.armHostWatchdog(); // proof the host is still simulating
      }
      return;
    }
    if (tag === TAG_INPUT && this.hostId) {
      const me = this.players.get(sender.id);
      if (!me) return;
      // splice the sender's idx in after the tag: [tag, idx, ...payload]
      const src = new Uint8Array(buf);
      const out = new Uint8Array(src.length + 1);
      out[0] = TAG_INPUT;
      out[1] = me.idx;
      out.set(src.subarray(1), 2);
      this.room.getConnection(this.hostId)?.send(out);
    }
  }

  // ---- helpers ------------------------------------------------------------
  resetToLobby() {
    this.phase = "lobby";
    this.startEpoch = null;
    this.endReason = null;
    this.clearHostWatchdog();
    // Prune sailors who left during the match (their grace ghost) — fresh lobby.
    for (const [id, p] of [...this.players]) {
      if (!p.connected) {
        this.clearDisconnectTimer(id);
        this.players.delete(id);
        this.hidden.delete(id);
      }
    }
    if (!this.players.has(this.hostId)) this.hostId = this.firstConnectedId();
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

  // stable wire slot, reused after a disconnect; addresses binary snap/input
  firstFreeIdx() {
    const used = new Set([...this.players.values()].map((p) => p.idx));
    for (let i = 0; i < MAX_PLAYERS; i++) if (!used.has(i)) return i;
    return 0;
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

  roomPayload() {
    const players = [...this.players.values()].map((p) => ({
      ...p,
      isHost: p.id === this.hostId,
    }));
    return {
      t: "room" as const,
      phase: this.phase,
      hostId: this.hostId,
      settings: this.settings,
      players,
      startEpoch: this.startEpoch,
      endReason: this.endReason,
    };
  }

  broadcastRoom() {
    this.room.broadcast(j(this.roomPayload()));
  }
}

// Leaderboard order (negative => a ranks higher):
// 1) survived the most  2) most damage dealt  3) most lives
export function rankCompare(a: PlayerMeta, b: PlayerMeta): number {
  if (a.alive !== b.alive) return a.alive ? -1 : 1;
  if (!a.alive && !b.alive && a.deathTick !== b.deathTick) {
    return (b.deathTick ?? 0) - (a.deathTick ?? 0); // later death survived longer
  }
  if (a.damageDealt !== b.damageDealt) return b.damageDealt - a.damageDealt;
  return b.lives - a.lives;
}

GameServer satisfies Party.Worker;
