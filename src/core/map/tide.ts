import type { Flags } from '@core/flags';

import { CollisionGrid } from './objects';
import type { Tide } from './objects';
import type { TideLevel } from './source';
import type { TiledMap } from './tiled';

/**
 * The sunken ruins' tide (docs/GAME_DESIGN.md §3.2): a global flag that chooses which
 * tide layers a tide-aware map uses. An unset flag means high tide, the initial state.
 */
export const TIDE_FLAG = 'ruins.tide';

export function currentTide(flags: Flags): TideLevel {
  return flags.peek(TIDE_FLAG) === 'low' ? 'low' : 'high';
}

export function oppositeTide(tide: TideLevel): TideLevel {
  return tide === 'high' ? 'low' : 'high';
}

/** The tide a `set_tide` command leaves behind. */
export function resolveTide(current: TideLevel, value: TideLevel | 'toggle'): TideLevel {
  return value === 'toggle' ? oppositeTide(current) : value;
}

/** Whether an object with a `tide` property exists at the given tide. */
export function tideAllows(objectTide: Tide, tide: TideLevel): boolean {
  return objectTide === 'any' || objectTide === tide;
}

/** The common collision layer plus the one for the given tide (a map without tide layers is unchanged). */
export function collisionForTide(map: TiledMap, tide: TideLevel): CollisionGrid {
  return CollisionGrid.fromMapLayers(map, ['collision', `collision_${tide}`]);
}
