import { Flags } from './flags';
import { Inventory } from './inventory';
import type { PartyMember } from './party/member';
import type { SaveData } from './save';

/**
 * Everything a run carries between scenes: the save record (location, flags,
 * play time) plus the live party, inventory and gold built from it. `toSaveData`
 * folds the live objects back into a SaveData for writing a slot.
 */
export interface GameState {
  save: SaveData;
  flags: Flags;
  inventory: Inventory;
  gold: number;
  /** Members in join order; never empty once a game starts. */
  party: PartyMember[];
}

/** Condition keys of the form `item.<id>` read the bag count (§9.3). */
export const ITEM_FLAG_PREFIX = 'item.';

export function fromSaveData(save: SaveData, maxQtyOf: (itemId: string) => number): GameState {
  const flags = Flags.wrap(save.flags);
  const inventory = new Inventory(maxQtyOf, save.inventory);
  flags.setResolver((key) =>
    key.startsWith(ITEM_FLAG_PREFIX)
      ? inventory.count(key.slice(ITEM_FLAG_PREFIX.length))
      : undefined,
  );
  return {
    save,
    flags,
    inventory,
    gold: save.gold,
    party: save.party.map((m) => ({
      ...m,
      equipment: { ...m.equipment },
      statuses: [...m.statuses],
    })),
  };
}

/** Snapshot for a slot: location/flags/play time from `save`, the rest from the live objects. */
export function toSaveData(state: GameState, savedAt: number): SaveData {
  const chapter = state.flags.get('main.chapter', 0);
  return {
    ...state.save,
    savedAt,
    flags: state.flags.toJSON(),
    gold: state.gold,
    party: state.party.map((m) => ({
      ...m,
      equipment: { ...m.equipment },
      statuses: [...m.statuses],
    })),
    inventory: state.inventory.entries(),
    chapter: typeof chapter === 'number' ? chapter : 0,
  };
}
