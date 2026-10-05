import { Flags } from './flags';
import { Inventory } from './inventory';
import type { SaveData } from './save';

/**
 * Everything a run carries between scenes: the save record (location, flags)
 * plus the live objects built on it. Save v2 (#10) will persist inventory and
 * gold; until then they live only in memory.
 */
export interface GameState {
  save: SaveData;
  flags: Flags;
  inventory: Inventory;
  gold: number;
}

export function createGameState(save: SaveData, maxQtyOf: (itemId: string) => number): GameState {
  return {
    save,
    flags: Flags.wrap(save.flags),
    inventory: new Inventory(maxQtyOf),
    gold: 0,
  };
}
