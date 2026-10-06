import { describe, expect, it } from 'vitest';

import { Flags } from '@core/flags';
import { compileMap } from '@core/map/compile';
import type { MapSource } from '@core/map/source';
import {
  TIDE_FLAG,
  collisionForTide,
  currentTide,
  oppositeTide,
  resolveTide,
  tideAllows,
} from '@core/map/tide';

const tidal: MapSource = {
  meta: {
    id: 'map_tidal',
    displayName: '潮',
    kind: 'dungeon',
    bgmKey: 'bgm_ruins',
    battleBgKey: 'bg_ruins',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 0, y: 0, facing: 'down' },
    canSaveAnywhere: false,
    tideAware: true,
  },
  width: 3,
  height: 1,
  legend: { '.': 'floor_stone', w: 'wall', '~': { deco: 'water' }, x: { deco: 'fence' } },
  tiles: ['..w'],
  tide: { high: [' ~ '], low: ['x  '] },
  objects: [],
};

describe('tide (§3.2)', () => {
  it('reads high tide while the flag is unset and low only when it says so', () => {
    const flags = new Flags();
    expect(currentTide(flags)).toBe('high');
    flags.set(TIDE_FLAG, 'low');
    expect(currentTide(flags)).toBe('low');
    flags.set(TIDE_FLAG, 'high');
    expect(currentTide(flags)).toBe('high');
    flags.set(TIDE_FLAG, true);
    expect(currentTide(flags)).toBe('high');
  });

  it('toggles and resolves set_tide values', () => {
    expect(oppositeTide('high')).toBe('low');
    expect(oppositeTide('low')).toBe('high');
    expect(resolveTide('high', 'toggle')).toBe('low');
    expect(resolveTide('low', 'toggle')).toBe('high');
    expect(resolveTide('low', 'low')).toBe('low');
    expect(resolveTide('low', 'high')).toBe('high');
  });

  it('lets objects exist at their own tide or at any', () => {
    expect(tideAllows('any', 'high')).toBe(true);
    expect(tideAllows('low', 'low')).toBe(true);
    expect(tideAllows('low', 'high')).toBe(false);
    expect(tideAllows('high', 'low')).toBe(false);
  });

  it('unions the common collision layer with the tide layer', () => {
    const map = compileMap(tidal);
    const high = collisionForTide(map, 'high');
    expect([0, 1, 2].map((x) => high.isBlocked(x, 0))).toEqual([false, true, true]);
    const low = collisionForTide(map, 'low');
    expect([0, 1, 2].map((x) => low.isBlocked(x, 0))).toEqual([true, false, true]);
  });

  it('leaves a map without tide layers unchanged at either tide', () => {
    const { tide: _tide, ...rest } = tidal;
    const plain = compileMap({ ...rest, meta: { ...tidal.meta, tideAware: false } });
    for (const level of ['high', 'low'] as const) {
      const grid = collisionForTide(plain, level);
      expect([0, 1, 2].map((x) => grid.isBlocked(x, 0))).toEqual([false, false, true]);
    }
  });
});
