import { createMember } from '@core/party/member';
import type { MigrationContext, SaveData } from '@core/save';
import { createNewSave } from '@core/save';
import type { GameState } from '@core/state';
import { fromSaveData } from '@core/state';

import { CHARACTERS } from './characters';
import { findItem } from './items';
import { getMapMeta } from './maps';

/** Item caps for the inventory (key items 1, consumables 99). */
export function maxQtyOf(itemId: string): number {
  return findItem(itemId)?.maxQty ?? 99;
}

/** v1 → v2 migration party per GAME_DESIGN §12.2. */
export const MIGRATION_CONTEXT: MigrationContext = {
  initialParty: (flags) => {
    const party = [createMember(CHARACTERS.ch_luka)];
    if (flags['minato.mio_joined']) party.push(createMember(CHARACTERS.ch_mio));
    return party;
  },
};

export function placeName(mapId: string): string {
  try {
    return getMapMeta(mapId).displayName;
  } catch {
    return mapId;
  }
}

export function newGameState(savedAt: number): GameState {
  return fromSaveData(createNewSave(savedAt, [createMember(CHARACTERS.ch_luka)]), maxQtyOf);
}

export function loadGameState(save: SaveData): GameState {
  return fromSaveData(save, maxQtyOf);
}
