import { create } from "zustand";
import { TAUNT_MS } from "../../lib/copy";

interface TauntState {
  // playerId -> phrase currently shown above their boat / in their HUD
  taunts: Record<string, string>;
  setTaunt: (id: string, text: string) => void;
  clear: () => void;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useTauntStore = create<TauntState>((set, get) => ({
  taunts: {},
  setTaunt: (id, text) => {
    set({ taunts: { ...get().taunts, [id]: text } });
    const prev = timers.get(id);
    if (prev) clearTimeout(prev);
    timers.set(
      id,
      setTimeout(() => {
        const { [id]: _drop, ...rest } = get().taunts;
        set({ taunts: rest });
        timers.delete(id);
      }, TAUNT_MS)
    );
  },
  clear: () => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    set({ taunts: {} });
  },
}));
