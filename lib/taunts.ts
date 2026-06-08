// Funny one-liners shown briefly above a boat (and in the HUD for the local
// player) when someone is sunk or scores a kill. Host picks the index at death
// time so every client renders the same phrase.

export const TAUNT_MS = 10000; // how long a taunt stays on screen

// Shown on the victim — "I got sunk".
export const SUNK_TAUNTS = [
  "Glub glub… see ye in Davy Jones' repo!",
  "Sunk by a paper boat. Truly historic.",
  "Well, that's one way to reach the seabed.",
  "My buoyancy has filed for bankruptcy.",
  "Tell me captain… was it the cannon or the vibes?",
  "Rolled back to production: the ocean floor.",
  "404: Hull not found.",
  "I regret every nautical decision.",
  "Down she goes, and so do my dreams.",
  "Send a rescue boat. Or a refactor.",
] as const;

// Shown on the killer — "I sunk somebody".
export const KILL_TAUNTS = [
  "Another barnacle off the leaderboard!",
  "Merge conflict resolved — in my favor.",
  "Ye sank like my last side project.",
  "Cannonball, deployed straight to prod.",
  "That's a wrap, ya soggy biscuit!",
  "Skill issue, landlubber.",
  "git blame? Aye, that'd be me.",
  "One less ship to plunder. Pity.",
  "Walked the plank without even asking.",
  "Bubbles confirm the hit. GG.",
] as const;
