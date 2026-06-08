# Paper Armada — Architecture & Plan

> Working title. Online multiplayer paper-boat cannon battle. ~11 players, momentum
> movement, cannon + ramming combat, rolling sea, pixelated 3D look, lobby → countdown →
> match → leaderboard.

---

## 1. Constraints & key decisions

| Decision | Choice | Why |
|---|---|---|
| Hosting (frontend) | **Vercel** (Next.js) | As requested. Serves the SPA/SSR + static models. |
| Realtime backend | **PartyKit** (Cloudflare Durable Objects) | Vercel can't run a stateful WebSocket/game-server loop. PartyKit gives one durable room per game. Free tier covers this scale. |
| Physics authority | **Host's browser** runs the full sim | One authoritative simulation is mandatory for 11-player physics. Maps directly to "first connector = host." Rapier runs great in-browser (no server-side WASM headaches). |
| Sim/render | React-Three-Fiber + Three.js + **Rapier** (`@react-three/rapier`) | Mature R3F ecosystem, Rapier = fast deterministic-enough rigidbody physics. |
| State | **Zustand** | Lightweight, fits separate lobby/game/input stores. |
| Pixel look | Low-res render target + **nearest-neighbor upscale** (RenderPixelatedPass) | "3D model but pixel" = render small, blow up chunky. |
| Models | Sourced **low-poly CC0** (Kenney Pirate Kit / Quaternius / Poly Pizza) + a hand-built origami paper-boat | Free, deploy-safe licensing, swappable. |

### The authority split (important)
- **PartyKit room = authoritative for *meta/lobby state* + message relay.** Roster, host
  designation, room settings (timer), names, colors, ready flags, game phase, and final
  standings. This survives any single browser and makes late-join / host-migration sane.
- **Host browser = authoritative for *simulation*.** All boat transforms, cannonballs,
  collisions, lives, damage. Broadcasts snapshots through the relay.

Trade-off: an authoritative host *could* cheat. For a friends' party game this is
acceptable. Noted as out-of-scope for v1 anti-cheat.

---

## 2. Topology

```
 Player browsers (clients)                 PartyKit room (Durable Object)
 ┌───────────────┐  input ───────────────▶ ┌──────────────────────────┐
 │ Client (you)  │ ◀─────────── snapshot   │ - roster / host / phase   │
 │  - render     │                         │ - settings (timer)        │
 │  - local cam  │                         │ - relays sim msgs         │
 └───────────────┘                         └──────────────────────────┘
        ▲                                          ▲        │
        │ snapshot                          input  │        │ snapshot
        │                                          │        ▼
 ┌───────────────────────────┐  input ─────────────┘   (fan-out to all)
 │ HOST client               │ ◀───────────────────
 │  - Rapier sim @ fixed tick │
 │  - owns all entities       │── snapshot ────────▶ relay ──▶ everyone
 │  - also a normal player    │
 └───────────────────────────┘
```
Star topology. Everyone (including host) talks only to the PartyKit room. Host is just the
client flagged as sim authority.

---

## 3. Networking protocol

Transport: WebSocket via PartyKit. JSON to start (~10–15 KB/s down per client at 11 boats /
30 Hz — fine). Upgrade hot path to binary `ArrayBuffer` only if needed.

### Client → (relay) → Host
- `input` @ ~30 Hz (or on change):
  ```ts
  { t:'in', seq, throttle:-1..1, steer:-1..1, mode:'move'|'cannon',
    aimYaw, aimPitch, fire:boolean }
  ```

### Host → (relay) → all clients
- `snapshot` @ 20–30 Hz (compact, positional fields quantized later):
  ```ts
  { t:'snap', tick, simTime,
    ents:[ [id, x,y,z, qx,qy,qz,qw, lives, flags], ... ] }   // flags: bit0=alive, bit1=ramCD, bit2=hitFlash
  ```
- `event` (discrete, send-reliably):
  ```ts
  {t:'fire',  owner, origin:[x,y,z], dir:[x,y,z], power}
  {t:'hit',   victim, attacker, point:[x,y,z], kind:'ball'|'ram'}
  {t:'death', id, tick}
  {t:'life',  id, lives}
  ```

### PartyKit server → all (meta, server-owned)
```ts
{t:'room', phase, hostId, settings:{timerSec:number|null},
  players:[{id,name,color,ready,alive,lives,deathTick,damageDealt}]}
{t:'phase', phase:'lobby'|'countdown'|'playing'|'ended', startEpoch?}
```

### Clock sync
Lightweight NTP-style: client pings server, estimates offset → `serverNow`. Used for one
thing — wave time `t = serverNow - startEpoch` — so every client's ocean and the host's
buoyancy evaluate the same Gerstner function. Snapshots carry `simTime` for interpolation
reference.

### Client-side smoothing
- **Remote boats:** buffer last 2–3 snapshots, render at `now - ~100ms`, lerp position /
  slerp rotation. Hides jitter.
- **Own boat:** rendered from authority too (position is server-truth), but **camera yaw/pitch
  (mouse look) and cannon aim are 100% local & instant** → feels responsive even though the
  hull is authoritative. (Optional later: client-side prediction of own boat for zero input lag.)

---

## 4. Game state model

```ts
type Phase = 'lobby' | 'countdown' | 'playing' | 'ended'

interface Player {        // server-owned meta
  id; name; color;        // color unique per room
  ready; isHost;
  alive; lives;           // mirrored from sim each snapshot
  deathTick: number|null; // for survival ranking
  damageDealt: number;    // hits landed (ball + ram)
}

interface BoatEntity {    // host sim only
  id; body: RapierRigidBody;
  lives; alive;
  reloadUntil: tick;      // cannon cooldown
  invulnUntil: tick;      // 1 hit = 1 life, not a drain
  ramCooldownUntil: tick; // knockback recovery
}
```

---

## 5. Physics design (host, Rapier)

### Boat movement — momentum, not on/off
- Boat = dynamic rigidbody, simple box / convex-hull collider (NOT the visual mesh).
- Throttle → **forward force** along heading. Steering → **yaw torque scaled by current speed**
  (can't pirouette in place — turns like a boat).
- High **linear + angular damping** = water drag → slow accel, gentle coast-down. Directly
  gives the "takes time to gain/lose velocity" feel.

### Sea & buoyancy (rolling up/down)
- **Gerstner wave sum**: `height(x,z,t)` shared between host (physics) and client (ocean shader).
- Host samples wave height at ~4 hull points each tick → buoyancy/heave force + tilt torque.
  Boats bob and rock for free, consistently for everyone.
- Client ocean = big plane, vertices displaced by the same `height()` in a vertex shader.

### Bucket arena
- Wooden bucket = static cylinder wall collider ringing the sea. Boats bounce off the staves.

### Cannon
- Ball = dynamic sphere spawned at muzzle, velocity = aim dir × power, gravity → arc.
- **Trajectory preview:** client integrates the *same* ballistic arc (projectile motion, no
  drag) and draws the arc + a landing marker. Deterministic ⇒ preview matches reality.
- **Reload:** `reloadUntil` per player; client shows a reload bar / greyed reticle.
- **No self-hit:** ball uses a collision filter excluding its owner's boat entirely.

### Hits & "violent" reactions (the juice)
- Ball hits boat → victim **loses a life**, large **impulse + torque at impact point** → boat
  lurches. `hit` event → victim camera **shake + screen flash**. Because the camera is rigid-
  attached to the boat body, the lurch *already* throws the view; shake stacks on top.
- `invulnUntil` window after any hit so a single collision = exactly one life lost.

### Ramming — front is a safe zone
Classify each boat-boat contact by comparing the contact normal / relative position to each
boat's **forward vector** ("front" = within ±~40° of forward):

| A's front hits… | Result |
|---|---|
| B's side/back | **B loses a life.** A knocked **backward** (impulse) so it can't multi-hit. B shoved too (physics). |
| B's front (front-vs-front) | **No life lost** (both fronts = safe). Both **bounce apart** (impulse), no damage. |

`ramCooldownUntil` = attacker must rebuild speed after a ram (the knockback handles this
naturally). `invulnUntil` prevents a single ram draining multiple lives.

### Death
Lives → 0: boat sinks (control disabled, sink anim, collider → sensor/non-colliding wreck),
player becomes **spectator**. Record `deathTick` (survival rank) and freeze `damageDealt`.

---

## 6. Camera system

### Move mode — third person
Rig behind + above the boat, follows position/heading with spring smoothing. **Mouse orbits
yaw/pitch around the boat (look around) WITHOUT changing heading.** Steering (A/D / ←→)
changes heading.

### Cannon mode — first person
Camera at the cannon (back of boat), cannon visible lower-center of screen. **Mouse aims**
(cannon yaw/pitch). Reticle + trajectory arc shown.

### Mode switch & transition (proposed control scheme — see open questions)
- **Right Mouse click or `Space`** → enter cannon mode; click arrows or WASD → back to move.
- **Right Mouse on cannon mode** → fire (cannon mode only).
- **Camera transition:** smooth tween of position + FOV + look-target over ~0.4 s between the
  two rigs. Cinematic, no snap.
- **Can't aim self:** cannon pitch/yaw clamped away from own hull *and* collision filter
  blocks self-hits regardless.

### Controls summary
| Action | Key/Mouse |
|---|---|
| Move fwd/back | `W`/`S` or `↑`/`↓` |
| Steer | `A`/`D` or `←`/`→` |
| Look around (move mode) | Mouse |
| Enter/exit cannon mode | Right Mouse click / `Space` |
| Aim (cannon mode) | Mouse |
| Fire (only cannon mode)| right Mouse |

---

## 7. Rendering / pixel-pirate aesthetic

- Render scene to a low-res target (~¼ resolution) → upscale **NEAREST** → chunky pixels
  (`RenderPixelatedPass` from three.js examples, or custom EffectComposer pass).
- Low-poly models + flat/toon shading so pixelation reads cleanly. Optional color posterize +
  light dithering for the retro feel.
- UI: bitmap pixel font, wood/parchment panels, hearts for lives.

---

## 8. Lobby flow

1. **Landing:** enter name → *Create room* (become host) or *Join* via room code / share link.
2. **Lobby:** roster list; each player picks a **boat color** (palette; server enforces unique
   colors); ready toggle. Host sees **timer** setting (None / 2 / 4 / 5 min) + **Start** button
   (enabled when ≥2 ready).
3. Host → Start → server sets `phase=countdown`, broadcasts.

## 9. In-game flow

- **3-2-1 countdown** overlay; boats spawned & frozen so everyone sees their position. Then
  `phase=playing`.
- **End conditions:** timer hits 0 (if set) **OR** ≤1 boat alive (covers the no-timer case).
- **HUD:** own lives (3 hearts), speed, reload bar, mode indicator, match timer, players-alive
  count.
- On end: server computes final standings, `phase=ended`.

## 10. Leaderboard

Sort comparator (returns 0 ⇒ **shared spot**; ties allowed as requested):
```ts
function rank(a, b) {
  // 1. survived the most: alive beats dead; among dead, later death ranks higher
  if (a.alive !== b.alive) return a.alive ? -1 : 1
  if (!a.alive && !b.alive && a.deathTick !== b.deathTick)
    return b.deathTick - a.deathTick           // later death = survived longer
  // 2. most lives remaining
  if (a.lives !== b.lives) return b.lives - a.lives
  // 3. most damage dealt
  return b.damageDealt - a.damageDealt          // 0 ⇒ shared rank
}
```
Use **standard competition ranking** (equal comparator → same rank number, e.g. 1,1,3).

**End screen:** highlight **YOUR** result card center-screen first, then animate it to the side
and reveal the full ordered leaderboard.

---

## 11. Models — sourcing (low-poly, CC0)

| Asset | Source |
|---|---|
| Cannon, barrels, pirate props | **Kenney "Pirate Kit"** (CC0) |
| Generic low-poly boats (reference) | **Kenney "Watercraft Pack"**, **Quaternius** (CC0) |
| Paper boat | Hand-build — origami boat is just folded planes; trivial low-poly, or source from Poly Pizza |
| Search/browse | Poly Pizza, Sketchfab (filter CC0) |

Pipeline: `.glb` in `/public/models`, loaded via `useGLTF`. **Visual mesh ≠ physics collider** —
colliders stay simple boxes/hulls for performance. Per-player **boat color** applied via material
tint on the paper-boat mesh.

---

## 12. File structure (Next.js app router)

```
/app
  page.tsx                landing (name + create/join)
  /room/[code]/page.tsx   lobby + game canvas
/components
  /ui/                    Lobby, Hud, Leaderboard, Countdown, ColorPicker
  /game/                  Canvas, Scene, Boat, Cannon, Cannonball, Ocean, Bucket
/game
  /sim/                   world.ts, boat.ts, cannon.ts, collisions.ts (host only)
  /net/                   protocol.ts, client.ts, hostLoop.ts, interpolation.ts, clockSync.ts
  /state/                 lobbyStore.ts, gameStore.ts, inputStore.ts (zustand)
  /camera/                rigs.ts, transition.ts
  /render/                pixelPass.ts, materials.ts, oceanShader.ts
/lib
  waves.ts                shared Gerstner height(x,z,t)  ← sim + ocean shader both import
  math.ts, constants.ts
/partykit
  server.ts               room: roster, host, settings, phase, relay
partykit.json
```

---

## 13. Build milestones (ordered)

| # | Milestone | Proves |
|---|---|---|
| M0 | Scaffold: Next.js + R3F canvas + PartyKit room; connect, see roster | Plumbing |
| M1 | Lobby: name, unique-color pick, ready, host Start → phase sync | Meta state |
| M2 | Sea + one boat: Gerstner ocean + pixel pass + bobbing (single player, host sim) | **Waves + render** |
| M3 | Movement netcode: authority, inputs, snapshots, interpolation, 11 boats w/ momentum, 3rd-person cam + mouse look + bucket walls | **Hardest: netcode** |
| M4 | Cannon: mode switch + cam transition, aim + trajectory preview, fire, reload, ball physics, hits, lives, hit shake | Combat core |
| M5 | Ramming: front-zone rules, knockback, safe front-vs-front, invuln window | Melee combat |
| M6 | Game loop: countdown, timer, end conditions, damage/death tracking | Match flow |
| M7 | Leaderboard: sort + reveal animation | Results |
| M8 | Polish: pixel-pirate art, low-poly models, SFX, host-migration | Ship |

The risky tech (netcode + waves + pixel render) is front-loaded in M2–M3 on purpose.

---

## 14. Open questions / decisions baked as recommendations

These were chosen sensibly to keep moving; flag any to change:

1. **Control scheme** — recommended: *Right-Mouse/`C`/`Space` toggles cannon mode, Left-Mouse
   fires.* Your spec said "click" for both entering cannon mode and firing; a dedicated toggle
   avoids the conflict. Confirm or pick another mapping.
2. **No-timer end** — recommended: *last boat standing ends the match.* OK?
3. **Host disconnect mid-match** — v1 recommendation: *promote next player to host, resume from
   last full snapshot* (small visual hiccup), else end round and show standings. Acceptable for v1?
4. **Player cap** — you said ~11; recommend a hard cap of **12** (clean grid, room for one more).
5. **Spectator after death** — recommended: *free-look / orbit the arena* until match ends.
6. **Reconnect** — v1: rejoin lobby only; mid-match reconnect = spectate. Full re-entry later.

---

## 15. Risks

- **Host browser load:** running Rapier for 11 boats + serving as a player. Mitigate: fixed 30 Hz
  sim, snapshot at 20–30 Hz, simple colliders, instanced cannonballs. Should be fine on a normal
  laptop; test early (M3).
- **Host migration fidelity:** resuming a physics sim from a snapshot is approximate. Accept a
  hiccup for v1.
- **NAT/latency:** not an issue — star topology through PartyKit, no P2P/TURN.
- **Pixel pass + many objects:** keep poly counts low; the low-res target actually *helps* perf.
