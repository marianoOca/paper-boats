# ⚓ Paper Armada

Online multiplayer paper-boat cannon battle. Up to 12 players, momentum sailing,
cannon + ramming combat, a rolling sea, and a pixelated 3D look. Plays on desktop
(keyboard/mouse) or mobile (on-screen sticks). Lobby → 3-2-1 countdown → match →
leaderboard.

## Stack

- **Next.js 14** (App Router) — frontend, deploys to **Vercel**
- **React-Three-Fiber + three.js** — 3D rendering (pixel look = low-res render + nearest upscale)
- **@react-three/rapier** — physics (boats, cannonballs, ramming, buoyancy)
- **PartyServer on Cloudflare Workers** (Durable Object) — realtime relay room (one per game) + lobby/meta authority. Client connects with `partysocket`.
- **Host browser** — runs the authoritative Rapier simulation, broadcasts snapshots
- **Zustand** — client state
- **Web Audio** — sound effects + sea ambience, synthesized in code (no audio files)

### Authority split

Two separate authorities:

- **Relay room** = authoritative for meta/lobby state + message relay. Roster, host designation, room settings (timer, arena mode, starting lives), names, colors, ready flags, game phase, final standings. Survives any single browser disconnect.
- **Host browser** = authoritative for simulation. All boat transforms, cannonballs, collisions, lives, damage. Broadcasts snapshots through the relay.

The first player to connect is the host. Everyone (host included) talks only to the relay room, which relays inputs to the host and world snapshots to all clients (star topology, no P2P).

### Networking protocol

The two high-frequency messages — client **input** and host **snapshot** — are sent as compact **binary frames** (little-endian, tag byte 0, quantized positions/angles; see `lib/wire.ts`). Everything else (lobby, settings, events) stays JSON (`game/net/protocol.ts`).

Client → host (via relay), send-on-change at ~30 Hz: throttle, steer, mode (move/cannon), aimYaw, aimPitch, fire.

Host → all clients at 30 Hz: a snapshot of every boat entity `[idx, x,y,z, qx,qy,qz,qw, lives, flags, aimYaw]` plus live cannonballs `[idx, x,y,z]`.

Discrete events (`fire`, `hit`, `death`, `splash`) sent as reliable JSON messages. Remote boats buffer snapshots and render at `now − ~90 ms` (`INTERP_DELAY_MS`) with lerp/slerp smoothing.

## Local development

```bash
npm install
npm run dev      # runs Next (:3000) AND the relay via `wrangler dev` (:1999) together
```

Open http://localhost:3000, enter a name, hit **Play**. Everyone joins the same
fixed room (`/room/GAME`) — share that URL with others on the same relay host.
Need ≥2 ready players to start. Your name is remembered (localStorage), so reopening
the app skips the splash and drops you back into the room — rejoining a match already
in progress if you still hold a boat.

Individual processes if you prefer:

```bash
npm run next     # Next dev only  (:3000)
npm run party    # relay dev only (:1999)
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

**Mobile:** on-screen dual sticks (sail/steer left, look right; the left stick becomes FIRE and the right stick aims in cannon mode), plus a mode-toggle button. Phones are gated to landscape and offer a fullscreen toggle. iPhone Safari has no fullscreen API, so there the button explains **Add to Home Screen**: the installed app opens fullscreen (web manifest, `app/manifest.ts`).

A mute button (top-right, every screen) silences sound; the choice is remembered per browser.

Boats take time to gain/lose speed. Your **bow is a safe zone** — ram someone's
side or stern to cost them a life (and get knocked back); bow-to-bow just bounces.
Cannon shots arc under gravity (a dashed trajectory shows the landing spot) and
have a reload. The host picks where every boat's cannon sits in the lobby: **Back**
(stern, aims behind) or **Front** (bow, aims ahead).

## Deploy

Frontend and relay deploy separately.

1. **Relay** (Cloudflare Workers, free plan; `wrangler.jsonc`):
   ```bash
   npx wrangler login     # once
   npm run deploy:party   # wrangler deploy
   ```
   Gives you a host like `paper-armada.<your-subdomain>.workers.dev`.
   Free-plan budget: Durable Object requests cap at 100k/day, and each incoming
   WebSocket message counts as 1/20 of a request. A 6-player match sends up to
   ~180 messages/s (host snaps + clients' inputs, sent only on change), so at
   least ~3 hours of 6-player play per day. Past the cap,
   connections fail until 00:00 UTC; the free plan never bills.

2. **Frontend** (Vercel): import the repo, then set the env var so the client
   knows where the relay lives:
   ```
   NEXT_PUBLIC_PARTYKIT_HOST = paper-armada.<your-subdomain>.workers.dev
   ```
   (See `.env.example`.) `NEXT_PUBLIC_*` is baked in at build time, so redeploy
   after changing it.

## Leaderboard order

1. Survived the longest (alive > dead; among the dead, later death ranks higher)
2. Most damage dealt
3. Most lives remaining

Ties share a rank.
