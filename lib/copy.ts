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
  "Plz fix, txs.",
  "plz fix - Sent from Iphone"
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
  "Cannonball deployed successfully"
] as const;

// Random splash shown on the landing screen.
export const SPLASHES = [
  "As pirates stole the gold, we'll steal your code!",
  "git push --force, ye scallywag!",
  "Plunder the repo!",
  "Memory leak?!, WALK THE PLANK!!",
  "Now with 100% more cannonballs!",
  "Ship it or walk the plank!",
  "X marks the merge conflict!",
  "No bugs, only barnacles!",
  "Powered by rum and React!",
  "Yarr-chitecture!",
  "Sink your tech debt!",
  "Commit early, plunder often!",
  "Avast! Don't deploy on Friday!",
  "Hoist the main branch!",
  "Made by software pirates!",
  "Steal the booty, ship the code!",
  "Dead men tell no tales. Production logs tell everything!",
  "Raise the flag! the build finally passed!",
  "Ye call it technical debt. We pirates call it buried treasure",
  "Only 3Rs: Rum, rebellion and refactoring!",
  "A pirate fears no ocean monster… except merge conflicts",
  "The sea shows no mercy. Neither does production!",
  "Trust the compass. Distrust the legacy code!",
  "We set sail with dreams and return with stack traces",
  "A smooth sea never made a senior developer!",
  "404 Treasure Not Found",
  "Permission denied? Mutiny!",
  "Never listen to the sirens! (AI suggestions)",
  "Arrr-gument type mismatch!",
  "Ahoy! New pull request incoming!",
  "A true pirate never reads the documentation!",
  "Code review? Sounds like mutiny!",
  "Cap'n, the Docker container is sinking!",
  "Buried under deep dependencies!",
];

// Shown above the reload bar when player clicks shoot 3 times while reloading.
export const CANNON_SPAM = [
  "Arrr! True pirates don't cannonball spam!",
  "Pirate's code don't allow cannonball spamming!",
  "Sweet sea pirate! Wait for the cannon to reload!",
  "The cannon needs a moment, ye impatient barnacle!",
  "Click faster, they said. The cannon disagrees.",
  "Reload time exists. Even at sea.",
  "Cannonball not found. Try again in 3 seconds.",
  "Steady, cap'n. The powder's still wet.",
  "That's not a gatling gun, ye fool!",
];
