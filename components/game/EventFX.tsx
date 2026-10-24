"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameStore } from "../../game/state/gameStore";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { useInputStore } from "../../game/state/inputStore";
import { addShake } from "../../game/state/fx";
import { useTauntStore } from "../../game/state/tauntStore";
import { SUNK_TAUNTS, KILL_TAUNTS } from "../../lib/copy";
import { sfxBump, sfxFire, sfxHit, sfxSink, sfxSplash } from "../../game/audio/sfx";

export function EventFX() {
  const myId = useLobbyStore((s) => s.myId);
  const lastFireSeq = useRef(0);

  useFrame(() => {
    const fireSeq = useInputStore.getState().fireSeq;
    if (fireSeq !== lastFireSeq.current) {
      lastFireSeq.current = fireSeq;
      addShake(0.4);
    }

    const evs = useGameStore.getState().drainEvents();
    for (const e of evs) {
      if (e.k === "fire") sfxFire(e.origin);
      else if (e.k === "splash") sfxSplash(e.point);
      else if (e.k === "bump") sfxBump(e.point);
      else if (e.k === "hit") {
        sfxHit(e.kind, e.point);
        if (e.victim === myId) addShake(0.9);
      } else if (e.k === "death") {
        sfxSink(e.id === myId);
        if (e.id === myId) addShake(1.3);
        const setTaunt = useTauntStore.getState().setTaunt;
        setTaunt(e.id, SUNK_TAUNTS[e.sunkTaunt]);
        if (e.by) setTaunt(e.by, KILL_TAUNTS[e.killTaunt]);
      }
    }
  });
  return null;
}
