import { describe, expect, it } from 'vitest';

import { COLLISION_GID, MapCompileError, compileMap } from '@core/map/compile';
import type { MapSource } from '@core/map/source';
import { findObjectLayer, findTileLayer } from '@core/map/tiled';
import { tileGid } from '@data/tiles';

const base = (over: Partial<MapSource> = {}): MapSource => ({
  meta: {
    id: 'map_test',
    displayName: 'テスト',
    kind: 'field',
    bgmKey: 'bgm_field',
    battleBgKey: 'bg_coast',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 0, y: 0, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 3,
  height: 2,
  legend: {
    '.': 'grass',
    '~': 'water',
    T: { ground: 'grass', deco: 'tree_trunk', above: 'tree_top' },
  },
  tiles: ['.~T', '...'],
  objects: [],
  ...over,
});

describe('compileMap', () => {
  it('writes ground/deco/above/collision layers from the legend', () => {
    const map = compileMap(base());
    expect(map.width).toBe(3);
    expect(map.height).toBe(2);
    expect(findTileLayer(map, 'ground')?.data).toEqual([
      tileGid('grass'),
      tileGid('water'),
      tileGid('grass'),
      tileGid('grass'),
      tileGid('grass'),
      tileGid('grass'),
    ]);
    expect(findTileLayer(map, 'deco')?.data).toEqual([0, 0, tileGid('tree_trunk'), 0, 0, 0]);
    expect(findTileLayer(map, 'above')?.data).toEqual([0, 0, tileGid('tree_top'), 0, 0, 0]);
    expect(findTileLayer(map, 'collision')?.data).toEqual([
      0,
      COLLISION_GID,
      COLLISION_GID,
      0,
      0,
      0,
    ]);
    expect(findTileLayer(map, 'collision')?.visible).toBe(false);
    expect(map.tilesets[0]?.name).toBe('ts_placeholder');
    expect(map.tilesets[0]?.firstgid).toBe(1);
  });

  it('applies overlay entries and lets `solid: false` clear blocking', () => {
    const map = compileMap(
      base({
        legend: {
          '.': 'grass',
          '~': 'water',
          B: { ground: 'bridge', solid: false },
          f: { deco: 'flower' },
        },
        tiles: ['~~~', '...'],
        overlay: [' B ', 'f  '],
      }),
    );
    expect(findTileLayer(map, 'ground')?.data[1]).toBe(tileGid('bridge'));
    expect(findTileLayer(map, 'collision')?.data).toEqual([
      COLLISION_GID,
      0,
      COLLISION_GID,
      0,
      0,
      0,
    ]);
    expect(findTileLayer(map, 'deco')?.data[3]).toBe(tileGid('flower'));
  });

  it('derives collision from the final tiles of each cell after the overlay', () => {
    const map = compileMap(
      base({
        width: 4,
        legend: {
          '.': 'grass',
          '~': 'water',
          w: 'wall',
          '=': 'path',
          D: 'door',
          R: { deco: 'rock' },
          f: { deco: 'flower' },
        },
        tiles: ['~~ww', '..~.'],
        overlay: ['=f D', 'R   '],
      }),
    );
    expect(findTileLayer(map, 'ground')?.data).toEqual([
      tileGid('path'),
      tileGid('water'),
      tileGid('wall'),
      tileGid('door'),
      tileGid('grass'),
      tileGid('grass'),
      tileGid('water'),
      tileGid('grass'),
    ]);
    expect(findTileLayer(map, 'deco')?.data).toEqual([
      0,
      tileGid('flower'),
      0,
      0,
      tileGid('rock'),
      0,
      0,
      0,
    ]);
    // Path over water and door over wall open up; flower over water and rock on grass block.
    expect(findTileLayer(map, 'collision')?.data).toEqual([
      0,
      COLLISION_GID,
      COLLISION_GID,
      0,
      COLLISION_GID,
      0,
      COLLISION_GID,
      0,
    ]);
  });

  it('keeps a legend `solid` override until a later entry on the cell declares one', () => {
    const map = compileMap(
      base({
        legend: {
          '.': 'grass',
          '~': 'water',
          B: { ground: 'bridge', solid: false },
          R: { deco: 'rock' },
          r: { deco: 'rock', solid: true },
        },
        tiles: ['~BB', '...'],
        overlay: [' Rr', '   '],
      }),
    );
    expect(findTileLayer(map, 'collision')?.data).toEqual([
      COLLISION_GID,
      0,
      COLLISION_GID,
      0,
      0,
      0,
    ]);
  });

  it('adds explicit blocked cells', () => {
    const map = compileMap(base({ tiles: ['...', '...'], blocked: ['X..', '..X'] }));
    expect(findTileLayer(map, 'collision')?.data).toEqual([
      COLLISION_GID,
      0,
      0,
      0,
      0,
      COLLISION_GID,
    ]);
    // `blocked` wins over a legend `solid: false`.
    const bridged = compileMap(
      base({
        legend: { '~': 'water', B: { ground: 'bridge', solid: false } },
        tiles: ['~B~', '~~~'],
        blocked: ['.X.', '...'],
      }),
    );
    expect(findTileLayer(bridged, 'collision')?.data[1]).toBe(COLLISION_GID);
  });

  it('compiles objects to pixel-positioned Tiled objects with typed properties', () => {
    const map = compileMap(
      base({
        objects: [
          {
            type: 'npc',
            x: 1,
            y: 1,
            id: 'npc_a',
            dialog: 'dlg_a',
            facing: 'left',
            sprite: 'sprite_npc',
          },
          {
            type: 'warp',
            x: 0,
            y: 0,
            w: 2,
            target_map: 'map_b',
            target_x: 3,
            target_y: 4,
            facing: 'up',
          },
          { type: 'trigger', x: 2, y: 0, event_id: 'ev_x', once: true },
        ],
      }),
    );
    const objs = findObjectLayer(map, 'events')?.objects ?? [];
    expect(objs).toHaveLength(3);
    expect(objs[0]).toMatchObject({
      id: 1,
      name: 'npc_a',
      type: 'npc',
      x: 32,
      y: 32,
      width: 32,
      height: 32,
    });
    expect(objs[0]?.properties).toContainEqual({ name: 'facing', type: 'string', value: 'left' });
    expect(objs[1]).toMatchObject({ type: 'warp', width: 64, height: 32 });
    expect(objs[1]?.properties).toContainEqual({ name: 'target_x', type: 'int', value: 3 });
    expect(objs[2]?.properties).toContainEqual({ name: 'once', type: 'bool', value: true });
    expect(map.nextobjectid).toBe(4);
  });

  it('exposes map metadata as Tiled map properties', () => {
    const map = compileMap(base());
    expect(map.properties).toContainEqual({ name: 'bgm', type: 'string', value: 'bgm_field' });
    expect(map.properties).toContainEqual({ name: 'entrance_x', type: 'int', value: 0 });
  });

  it('rejects malformed sources', () => {
    expect(() => compileMap(base({ tiles: ['.~T'] }))).toThrow(MapCompileError);
    expect(() => compileMap(base({ tiles: ['.~', '...'] }))).toThrow(/row 0 has 2/);
    expect(() => compileMap(base({ tiles: ['.~Z', '...'] }))).toThrow(/unknown tile char "Z"/);
    expect(() => compileMap(base({ legend: { '.': 'lava' } }))).toThrow(/unknown placeholder tile/);
    expect(() => compileMap(base({ legend: { ab: 'grass' } }))).toThrow(/one char/);
    expect(() => compileMap(base({ width: 65, height: 1, tiles: ['.'.repeat(65)] }))).toThrow(
      /64x64/,
    );
    expect(() =>
      compileMap(base({ objects: [{ type: 'sign', x: 3, y: 0, text_id: 'dlg_s' }] })),
    ).toThrow(/outside the map/);
    expect(() =>
      compileMap(base({ objects: [{ type: 'sign', x: -1, y: 0, text_id: 'dlg_s' }] })),
    ).toThrow(/invalid position/);
  });

  it('compiles tide grids into deco_water_* and collision_* layers (§3.2)', () => {
    const { meta } = base();
    const tidal = base({
      meta: { ...meta, tideAware: true },
      legend: { '.': 'grass', '~': { deco: 'water' }, x: { deco: 'fence' }, p: { deco: 'pier' } },
      tiles: ['...', '...'],
      tide: { high: ['~~ ', '   '], low: ['  x', 'p  '] },
    });
    const map = compileMap(tidal);
    expect(map.layers.map((l) => l.name)).toEqual([
      'ground',
      'deco',
      'above',
      'collision',
      'deco_water_high',
      'deco_water_low',
      'collision_high',
      'collision_low',
      'events',
    ]);
    const water = tileGid('water');
    expect(findTileLayer(map, 'deco_water_high')?.data).toEqual([water, water, 0, 0, 0, 0]);
    expect(findTileLayer(map, 'collision_high')?.data).toEqual([
      COLLISION_GID,
      COLLISION_GID,
      0,
      0,
      0,
      0,
    ]);
    // The fence blocks at low tide; the pier plank is deco only and stays walkable.
    expect(findTileLayer(map, 'deco_water_low')?.data).toEqual([
      0,
      0,
      tileGid('fence'),
      tileGid('pier'),
      0,
      0,
    ]);
    expect(findTileLayer(map, 'collision_low')?.data).toEqual([0, 0, COLLISION_GID, 0, 0, 0]);
    // Tide cells never leak into the common layers.
    expect(findTileLayer(map, 'collision')?.data).toEqual([0, 0, 0, 0, 0, 0]);
    expect(findTileLayer(map, 'deco')?.data).toEqual([0, 0, 0, 0, 0, 0]);
    expect(findTileLayer(map, 'deco_water_high')?.visible).toBe(true);
    expect(findTileLayer(map, 'deco_water_low')?.visible).toBe(false);
    // A map without tide grids keeps the plain layer list.
    expect(compileMap(base()).layers.map((l) => l.name)).toEqual([
      'ground',
      'deco',
      'above',
      'collision',
      'events',
    ]);
  });

  it('rejects tide grids that disagree with the meta or place ground tiles', () => {
    const { meta } = base();
    const grids = { high: ['   ', '   '], low: ['   ', '   '] };
    expect(() => compileMap(base({ tide: grids }))).toThrow(/need meta.tideAware/);
    expect(() => compileMap(base({ meta: { ...meta, tideAware: true } }))).toThrow(
      /needs tide grids/,
    );
    const tidal = { meta: { ...meta, tideAware: true }, tiles: ['...', '...'] };
    expect(() =>
      compileMap(base({ ...tidal, tide: { high: ['~  ', '   '], low: ['   ', '   '] } })),
    ).toThrow(/may only set deco and solid/);
    expect(() =>
      compileMap(base({ ...tidal, tide: { high: ['Z  ', '   '], low: ['   ', '   '] } })),
    ).toThrow(/unknown tide char "Z"/);
    expect(() =>
      compileMap(base({ ...tidal, tide: { high: ['   '], low: ['   ', '   '] } })),
    ).toThrow(/tide.high has 1 rows/);
  });

  it('rejects non-integer numeric properties and entrances', () => {
    const npc = {
      type: 'npc' as const,
      x: 0,
      y: 0,
      id: 'npc_a',
      dialog: 'dlg_a',
      facing: 'down' as const,
      sprite: 'sprite_npc',
    };
    const fractional = base({ objects: [{ ...npc, inn_price: 20.5 }] });
    expect(() => compileMap(fractional)).toThrow(MapCompileError);
    expect(() => compileMap(fractional)).toThrow(/npc #1 property inn_price must be an integer/);
    const { meta } = base();
    expect(() =>
      compileMap(base({ meta: { ...meta, entrance: { x: 0.5, y: 0, facing: 'down' } } })),
    ).toThrow(/invalid entrance \(0\.5, 0\)/);
    expect(() =>
      compileMap(base({ meta: { ...meta, entrance: { x: 3, y: 0, facing: 'down' } } })),
    ).toThrow(/entrance \(3, 0\) is outside the map/);
  });
});
