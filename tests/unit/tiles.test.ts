import { describe, expect, it } from 'vitest';

import {
  PLACEHOLDER_TILES,
  TILE_COLUMNS,
  TILE_ROWS,
  tileDef,
  tileGid,
  tileIndex,
} from '@data/tiles';

describe('placeholder tiles', () => {
  it('has unique names and fits the texture grid', () => {
    const names = PLACEHOLDER_TILES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(PLACEHOLDER_TILES.length).toBeLessThanOrEqual(TILE_COLUMNS * TILE_ROWS);
  });

  it('maps names to 0-based indexes and 1-based gids', () => {
    expect(tileIndex('grass')).toBe(0);
    expect(tileGid('grass')).toBe(1);
    expect(tileGid('collision')).toBe(PLACEHOLDER_TILES.length);
    expect(tileDef('water').solid).toBe(true);
    expect(tileDef('path').solid).toBe(false);
    expect(() => tileIndex('lava')).toThrow();
  });
});
