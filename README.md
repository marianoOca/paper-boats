# ⚓ Paper Armada

Online multiplayer paper-boat cannon battle. Up to 12 players, momentum sailing,
cannon + ramming combat, a rolling sea, and a pixelated 3D look. Plays on desktop
(keyboard/mouse) or mobile (on-screen sticks). Lobby → 3-2-1 countdown → match →
leaderboard.

## Stack

- **Next.js 14** (App Router) — frontend, deploys to **Vercel**
- **React-Three-Fiber + three.js** — 3D rendering (pixel look = low-res render + nearest upscale)
- **@react-three/rapier** — physics (boats, cannonballs, ramming, buoyancy)
- **PartyKit** — realtime relay room (one per game) + lobby/meta authority
- **Host browser** — runs the authoritative Rapier simulation, broadcasts snapshots
- **Zustand** — client state

### Authority split

Two separate authorities:

- **PartyKit room** = authoritative for meta/lobby state + message relay. Roster, host designation, room settings (timer, arena mode, starting lives), names, colors, ready flags, game phase, final standings. Survives any single browser disconnect.
- **Host browser** = authoritative for simulation. All boat transforms, cannonballs, collisions, lives, damage. Broadcasts snapshots through the relay.

The first player to connect is the host. Everyone (host included) talks only to the PartyKit room, which relays inputs to the host and world snapshots to all clients (star topology, no P2P).

### Networking protocol

The two high-frequency messages — client **input** and host **snapshot** — are sent as compact **binary frames** (little-endian, tag byte 0, quantized positions/angles; see `lib/wire.ts`). Everything else (lobby, settings, events) stays JSON (`game/net/protocol.ts`).

Client → host (via relay), send-on-change at ~30 Hz: throttle, steer, mode (move/cannon), aimYaw, aimPitch, fire.

Host → all clients at 30 Hz: a snapshot of every boat entity `[idx, x,y,z, qx,qy,qz,qw, lives, flags, aimYaw]` plus live cannonballs `[idx, x,y,z]`.

Discrete events (`fire`, `hit`, `death`, `splash`) sent as reliable JSON messages. Remote boats buffer snapshots and render at `now − ~90 ms` (`INTERP_DELAY_MS`) with lerp/slerp smoothing.

## Local development

```bash
npm install
npm run dev      # runs Next (:3000) AND PartyKit (:1999) together
```

Open http://localhost:3000, enter a name, hit **Play**. Everyone joins the same
fixed room (`/room/GAME`) — share that URL with others on the same PartyKit host.
Need ≥2 ready players to start. Your name is remembered (localStorage), so reopening
the app skips the splash and drops you back into the room — rejoining a match already
in progress if you still hold a boat.

Individual processes if you prefer:

```bash
npm run next     # Next dev only  (:3000)
npm run party    # PartyKit dev only (:1999)
```

## Controls

**Desktop:**

| Action | Input |
|---|---|
| Sail forward / back | `W`/`S` or `↑`/`↓` |
| Steer | `A`/`D` or `←`/`→` |
| Look around (sailing) | Mouse |
| Cannon mode | **Mouse Click** or press **space** |
| Aim (cannon mode) | Mouse |
| Fire | **Mouse Click** |

**Mobile:** on-screen dual sticks (sail/steer left, look right; the left stick becomes FIRE and the right stick aims in cannon mode), plus a mode-toggle button. Phones are gated to landscape and offer a fullscreen toggle.

Boats take time to gain/lose speed. Your **bow is a safe zone** — ram someone's
side or stern to cost them a life (and get knocked back); bow-to-bow just bounces.
Cannon shots arc under gravity (a dashed trajectory shows the landing spot) and
have a reload.

## Deploy

Frontend and relay deploy separately.

1. **PartyKit relay** (Cloudflare):
   ```bash
   npx partykit deploy
   ```
   Gives you a host like `paper-armada.<your-account>.partykit.dev`.

2. **Frontend** (Vercel): import the repo, then set the env var so the client
   knows where the relay lives:
   ```
   NEXT_PUBLIC_PARTYKIT_HOST = paper-armada.<your-account>.partykit.dev
   ```
   (See `.env.example`.) Deploy. Done.

## Leaderboard order

1. Survived the longest (alive > dead; among the dead, later death ranks higher)
2. Most damage dealt
3. Most lives remaining

Ties share a rank.
