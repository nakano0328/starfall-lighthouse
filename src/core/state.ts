import { Flags } from './flags';
import { Inventory } from './inventory';
import type { PartyMember } from './party/member';
import type { SaveData } from './save';

/**
 * Everything a run carries between scenes: the save record (location, flags)
 * plus the live objects built on it. Save v2 (#10) persists party, inventory
 * and gold; until then they live only in memory.
 */
export interface GameState {
  save: SaveData;
  flags: Flags;
  inventory: Inventory;
  gold: number;
  /** Members in join order; never empty once a game starts. */
  party: PartyMember[];
}

export interface GameStateOptions {
  maxQtyOf: (itemId: string) => number;
  party: PartyMember[];
}

export function createGameState(save: SaveData, options: GameStateOptions): GameState {
  return {
    save,
    flags: Flags.wrap(save.flags),
    inventory: new Inventory(options.maxQtyOf),
    gold: 0,
    party: options.party,
  };
}
