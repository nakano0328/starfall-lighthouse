import { describe, expect, it } from 'vitest';

import { IMAGES, TILESET_KEYS, imageAsset } from '@/assets/manifest';
import { MAP_SOURCES } from '@data/maps';
import { PLACEHOLDER_TILES, TILE_COLUMNS, TILE_ROWS } from '@data/tiles';

import { crc32, encodePng, pngSize } from '../../scripts/art/png';
import { Pixmap, mix, shade } from '../../scripts/art/pixmap';
import { AREA_IDS, TILE, areaPalette, renderTile, renderTileset } from '../../scripts/art/tiles';

/** Tiles that legends place in `deco`/`above` over another ground tile (§9.3): transparent edges. */
const DECORATION = ['rock', 'fence', 'flower', 'tree_top', 'tree_trunk', 'rail', 'lever', 'stele'];
/** Tiles drawn as a base grid somewhere: fully opaque so the scene background never shows. */
const GROUND = [
  'grass',
  'path',
  'sand',
  'water',
  'deep_water',
  'wall',
  'wall_top',
  'floor_wood',
  'floor_stone',
  'roof_red',
  'roof_blue',
  'door',
  'stairs',
  'cliff',
  'bridge',
  'counter',
  'bed',
  'table',
  'bookshelf',
  'pier',
  'lantern',
  'ore',
  'rune_floor',
  'void',
];

describe('png encoder', () => {
  it('writes a PNG whose header reports the size back', () => {
    const pm = new Pixmap(3, 2);
    pm.set(0, 0, 0xff0000);
    const bytes = pm.toPng();
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(pngSize(bytes)).toEqual({ width: 3, height: 2 });
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow();
  });

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });
});

describe('pixmap', () => {
  it('blends with alpha and clips outside the raster', () => {
    const pm = new Pixmap(2, 2);
    pm.set(0, 0, 0x000000, 255);
    pm.blend(0, 0, 0xffffff, 128);
    expect(pm.get(0, 0).rgb).toBe(0x808080);
    pm.set(5, 5, 0xffffff);
    expect(pm.get(5, 5)).toEqual({ rgb: 0, a: 0 });
  });

  it('shades and mixes colours within range', () => {
    expect(shade(0x808080, -1)).toBe(0x000000);
    expect(shade(0x808080, 1)).toBe(0xffffff);
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });

  it('scales by integers and crops', () => {
    const pm = new Pixmap(1, 1);
    pm.set(0, 0, 0x123456);
    const big = pm.scaled(3);
    expect(big.width).toBe(3);
    expect(big.get(2, 2).rgb).toBe(0x123456);
    expect(big.crop(1, 1, 1, 1).get(0, 0).rgb).toBe(0x123456);
  });
});

describe('area tilesets (ADR-0003)', () => {
  it('render every placeholder tile in the sheet layout, identically on each run', () => {
    for (const area of AREA_IDS) {
      const a = renderTileset(area);
      const b = renderTileset(area);
      expect(a.width).toBe(TILE_COLUMNS * TILE);
      expect(a.height).toBe(TILE_ROWS * TILE);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
    }
  });

  it('covers every tile name without falling back to the magenta "unknown" tile', () => {
    const pal = areaPalette('village');
    for (const def of PLACEHOLDER_TILES) {
      const tile = renderTile(def.name, pal, 1);
      expect(tile.get(16, 16).rgb, def.name).not.toBe(0xff00ff);
    }
    expect(renderTile('no_such_tile', pal, 1).get(16, 16).rgb).toBe(0xff00ff);
  });

  it('keeps decoration tiles transparent at the corners and ground tiles opaque', () => {
    for (const area of AREA_IDS) {
      const pal = areaPalette(area);
      for (const name of DECORATION) {
        expect(renderTile(name, pal, 3).get(0, 0).a, `${area}/${name}`).toBe(0);
      }
      for (const name of GROUND) {
        const tile = renderTile(name, pal, 3);
        for (let y = 0; y < TILE; y += 1) {
          for (let x = 0; x < TILE; x += 1) {
            if (tile.get(x, y).a !== 255)
              throw new Error(`${area}/${name} transparent at ${x},${y}`);
          }
        }
      }
    }
  });

  it('are registered in the manifest with a file under tiles/ and used by every map', () => {
    for (const key of TILESET_KEYS) {
      const asset = imageAsset(key);
      expect(asset.src).toBe(`tiles/${key}.png`);
      expect(asset.placeholder).toBe('tileset');
    }
    const keys = new Set<string>(IMAGES.map((a) => a.key));
    for (const source of Object.values(MAP_SOURCES)) {
      const [first] = source.meta.tilesets;
      expect(first, source.meta.id).toBeDefined();
      expect(keys.has(first ?? ''), `${source.meta.id} uses ${first}`).toBe(true);
      expect(first, source.meta.id).not.toBe('ts_placeholder');
    }
  });
});
