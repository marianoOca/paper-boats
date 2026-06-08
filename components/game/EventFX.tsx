"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGameStore } from "../../game/state/gameStore";
import { useLobbyStore } from "../../game/state/lobbyStore";
import { useInputStore } from "../../game/state/inputStore";
import { addShake } from "../../game/state/fx";
import { useTauntStore } from "../../game/state/tauntStore";
import { SUNK_TAUNTS, KILL_TAUNTS } from "../../lib/taunts";

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
      if (e.k === "hit" && e.victim === myId) addShake(0.9);
      else if (e.k === "death") {
        if (e.id === myId) addShake(1.3);
        const setTaunt = useTauntStore.getState().setTaunt;
        setTaunt(e.id, SUNK_TAUNTS[e.sunkTaunt]);
        if (e.by) setTaunt(e.by, KILL_TAUNTS[e.killTaunt]);
      }
    }
  });
  return null;
}
