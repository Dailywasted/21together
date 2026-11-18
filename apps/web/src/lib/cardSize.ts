import { create } from "zustand";
import { load, save } from "./storage";

/** How big the cards are on the TV, for guests sitting far from the screen. Saved in the TV's browser. */
export type CardSize = "normal" | "large" | "xl";
export const CARD_SIZES: readonly CardSize[] = ["normal", "large", "xl"];

const KEY = "21t:cardSize";
const initial = load<string>(KEY, "normal");

export const useCardSize = create<{ size: CardSize; setSize: (s: CardSize) => void; cycle: () => void }>((set, get) => ({
  size: (CARD_SIZES as readonly string[]).includes(initial) ? (initial as CardSize) : "normal",
  setSize(size) {
    save(KEY, size);
    set({ size });
  },
  cycle() {
    const i = CARD_SIZES.indexOf(get().size);
    get().setSize(CARD_SIZES[(i + 1) % CARD_SIZES.length]!);
  },
}));
