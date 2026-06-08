# ⚓ Paper Armada

Online multiplayer paper-boat cannon battle. Up to 15 players, momentum sailing,
cannon + ramming combat, a rolling sea, and a pixelated 3D look. Lobby → 3-2-1
countdown → match → leaderboard.

See [PLAN.md](PLAN.md) for the full architecture.

## Stack

- **Next.js 14** (App Router) — frontend, deploys to **Vercel**
- **React-Three-Fiber + three.js** — 3D rendering (pixel look = low-res render + nearest upscale)
- **@react-three/rapier** — physics (boats, cannonballs, ramming, buoyancy)
- **PartyKit** — realtime relay room (one per game) + lobby/meta authority
- **Host browser** — runs the authoritative Rapier simulation, broadcasts snapshots
- **Zustand** — client state

The first player to connect is the **host**: their browser runs the single
authoritative physics sim. Everyone (host included) talks only to the PartyKit
room, which relays inputs up and world snapshots down.

## Local development

```bash
npm install
npm run dev      # runs Next (:3000) AND PartyKit (:1999) together
```

Open http://localhost:3000, enter a name, **Create game**, share the room link
(or code) with others on the same PartyKit host. Need ≥2 ready players to start.

Individual processes if you prefer:

```bash
npm run next     # Next dev only  (:3000)
npm run party    # PartyKit dev only (:1999)
```

## Controls

| Action | Input |
|---|---|
| Sail forward / back | `W`/`S` or `↑`/`↓` |
| Steer | `A`/`D` or `←`/`→` |
| Look around (sailing) | Mouse |
| Cannon mode | Hold **Right Mouse** or press **C** |
| Aim (cannon mode) | Mouse |
| Fire | **Left Mouse** |

Boats take time to gain/lose speed. Your **bow is a safe zone** — ram someone's
side or stern to cost them a life (and get knocked back); bow-to-bow just bounces.
Cannon shots arc under gravity (a dashed trajectory shows the landing spot) and
have a reload. 3 lives each.

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
   (See `.env.local.example`.) Deploy. Done.

## Leaderboard order

1. Survived the longest (alive > dead; among the dead, later death ranks higher)
2. Most lives remaining
3. Most damage dealt

Ties share a rank.

## Status

Verified working: lobby (roster, unique colors, host, timer, ready/start),
countdown→playing→ended flow, animated sea + buoyant boats, momentum sailing,
wall collisions, third-person ↔ first-person cannon camera transition, trajectory
preview + reload, cannonball spawning, the relay (2+ players, host simulating all
boats, snapshot streaming), and the bow safe-zone ram rule.

Best validated with a real 2+ browser playtest: ball-on-boat / side-ram damage
feel, hit camera shake, and the end-screen leaderboard reveal.

Boats are procedural placeholders — swap in sourced low-poly `.glb` models in
`components/game/Boat.tsx` (keep local axes: forward +Z, cannon at back −Z).
