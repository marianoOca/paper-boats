# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Codebase Structure

**Paper Armada** — multiplayer browser naval battle game. Single fixed room (`/room/GAME`). PartyKit handles WebSocket relay; one browser tab acts as host and runs the physics simulation.

```
app/
  page.tsx                  Renders <Landing>: name entry → /room/GAME
  layout.tsx                Root: mounts OrientationGate + FullscreenButton globally
  globals.css
  icon.png                  Favicon / app icon
  room/[code]/page.tsx      Room page: phase-switches Landing / Lobby / Game / Leaderboard; mounts TouchControls on touch devices

components/
  Heart.tsx                 Heart SVG used in HUD for lives
  game/
    Boat.tsx                3D boat mesh (color prop)
    Bucket.tsx              Static bucket arena wall (cylinder collider + mesh)
    CameraRig.tsx           Spring-follow camera rig (third-person ↔ cannon modes)
    Cannon.tsx              Cannon mesh + aim/fire UI (local player); exports MUZZLE_TIP_Z
    ClientBoats.tsx         Renders remote boats from network snapshots
    EventFX.tsx             Hit flash / screen shake / visual event effects
    GameCanvas.tsx          R3F canvas root
    HostBall.tsx            Host-only: cannonball physics body + mesh
    HostWorld.tsx           Host-only: runs physics sim, streams snaps
    MuzzleFlash.tsx         Local-player muzzle flash glued to cannon barrel tip
    Ocean.tsx               Ocean mesh (Gerstner vertex displacement)
    PhysicsBoat.tsx         Rapier physics body (color prop)
    Scene.tsx               Scene graph
    TrajectoryPreview.tsx   Cannon trajectory arc preview
    Waterfall.tsx           Waterfall/overflow visual at bucket edge
  ui/
    Countdown.tsx           Pre-match countdown overlay
    FullscreenButton.tsx    Mobile-only fullscreen toggle (top-right, global)
    Hud.tsx                 In-match HUD (lives, fire state)
    Landing.tsx             Name-entry splash screen
    Leaderboard.tsx         End-match ranking screen
    Lobby.tsx               Waiting room: player list, color picker, host start button + settings
    OrientationGate.tsx     Full-screen portrait block for phones (auto-dismiss on rotate)
    PixelIcons.tsx          Pixel-art SVG icon renderer (anchor, boat, cannon, phone, …)
    TouchControls.tsx       On-screen dual-stick touch controls (touch devices only)
    useDevice.ts            Touch-capability + portrait/landscape media-query hook
    useTick.ts              RAF tick hook

game/
  input/useGameInput.ts     Keyboard/mouse → inputStore
  net/
    hostInputs.ts           Latest input per player (host side); BoatInput runtime shape
    protocol.ts             JSON wire types: ClientMsg, ServerMsg, PlayerMeta, Phase (snap/input are binary, see lib/wire.ts)
    useConnection.ts        PartySocket lifecycle, dispatches to stores
  sim/
    aim.ts                  Cannon aim math
    hostState.ts            Host simulation state machine
    physicsHelpers.ts       Rapier helpers
  state/
    fx.ts                   FX event store (hit flashes, screen shake triggers)
    gameStore.ts            Zustand: snaps, events
    inputStore.ts           Zustand: local input frame
    lobbyStore.ts           Zustand: players, phase, settings, myId
    localBoat.ts            Derived local boat state
    netStore.ts             Zustand: socket ref + send helper
    tauntStore.ts           Zustand: taunt message state

lib/
  constants.ts              Tick/snapshot/input rates, MAX_PLAYERS, lives, arena, BOAT/RAM/CANNON tunables, BOAT_COLORS, TIMER_OPTIONS
  math.ts                   makeRoomCode, vectors, clamp, deg
  taunts.ts                 Taunt strings/data
  uiStyles.ts               Shared UI style constants
  waves.ts                  Ocean wave math (Gerstner height(x,z,t) — shared by sim + shader)
  wire.ts                   Binary codec for the high-frequency snap + input frames (JSON for everything else)

partykit/
  server.ts                 PartyKit server: player registry, phase FSM, relay
partykit.json               PartyKit project config
```

### Key data flows

- **Join:** client connects → server assigns first free color + `ready:true` → client sends `join{name}` → server broadcasts `room`
- **Color change:** client sends `setColor` → server validates (free?) → broadcasts `room` (real-time for all)
- **Start:** host sends `start` → server sets phase `countdown` → broadcasts → HostWorld begins sim
- **Simulation:** HostWorld sends binary `snap` (lib/wire.ts) + `ev` → server rebroadcasts to all clients → ClientBoats interpolates
- **Input:** clients send binary input frames (lib/wire.ts) → server relays to host connection → hostInputs map → next sim tick
- **Stats:** HostWorld sends `stats`/`phase` → server folds into PlayerMeta → broadcasts `room`
