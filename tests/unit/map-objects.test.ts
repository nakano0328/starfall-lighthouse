import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import { CollisionGrid, MapObjectError, objectsAt, parseMapObjects } from '@core/map/objects';
import type { MapSource } from '@core/map/source';
import type { TiledMap } from '@core/map/tiled';

const src: MapSource = {
  meta: {
    id: 'map_test',
    displayName: 'テスト',
    kind: 'field',
    bgmKey: 'bgm_field',
    battleBgKey: 'battle_bg_coast',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 0, y: 0, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 4,
  height: 3,
  legend: { '.': 'grass', '~': 'water' },
  tiles: ['....', '.~..', '....'],
  objects: [
    {
      type: 'npc',
      x: 0,
      y: 0,
      id: 'npc_a',
      dialog: 'dlg_a',
      facing: 'down',
      sprite: 'sprite_npc',
      inn_price: 20,
      hidden_if: 'x.y',
    },
    {
      type: 'warp',
      x: 2,
      y: 0,
      w: 2,
      target_map: 'map_b',
      target_x: 1,
      target_y: 1,
      facing: 'up',
      required_item: 'it_key',
    },
    { type: 'chest', x: 0, y: 2, item_id: 'it_herb', qty: 2, flag: 'chest.t_01' },
    { type: 'sign', x: 0, y: 2, text_id: 'dlg_sign' },
    { type: 'save_point', x: 1, y: 2, heal: true, once_flag: 'ev.spring' },
    {
      type: 'enemy',
      x: 2,
      y: 2,
      group_id: 'grp_a, grp_b',
      respawn_sec: -1,
      defeated_flag: 'forest.boss',
    },
    { type: 'trigger', x: 3, y: 2, event_id: 'ev_t', once: false, condition: 'main.chapter>=1' },
  ],
};

describe('parseMapObjects', () => {
  const map = compileMap(src);
  const objects = parseMapObjects(map);

  it('parses every object type with defaults applied', () => {
    expect(objects.map((o) => o.kind)).toEqual([
      'npc',
      'warp',
      'chest',
      'sign',
      'save_point',
      'enemy',
      'trigger',
    ]);
    expect(objects[0]).toMatchObject({
      kind: 'npc',
      id: 'npc_a',
      move: 'static',
      innPrice: 20,
      hiddenIf: 'x.y',
      tx: 0,
      ty: 0,
    });
    expect(objects[0]).not.toHaveProperty('shop');
    expect(objects[1]).toMatchObject({
      kind: 'warp',
      tx: 2,
      tw: 2,
      th: 1,
      targetMap: 'map_b',
      requiredItem: 'it_key',
    });
    expect(objects[2]).toMatchObject({ kind: 'chest', itemId: 'it_herb', qty: 2, tide: 'any' });
    expect(objects[4]).toMatchObject({ kind: 'save_point', heal: true, onceFlag: 'ev.spring' });
    expect(objects[5]).toMatchObject({
      kind: 'enemy',
      groupIds: ['grp_a', 'grp_b'],
      respawnSec: -1,
      radius: 4,
    });
    expect(objects[6]).toMatchObject({
      kind: 'trigger',
      eventId: 'ev_t',
      once: false,
      condition: 'main.chapter>=1',
    });
  });

  it('returns objects covering a tile in interaction priority order', () => {
    expect(objectsAt(objects, 0, 2).map((o) => o.kind)).toEqual(['chest', 'sign']);
    expect(objectsAt(objects, 3, 0).map((o) => o.kind)).toEqual(['warp']);
    expect(objectsAt(objects, 1, 0)).toEqual([]);
  });

  it('rejects objects with missing or mistyped properties', () => {
    const broken = structuredClone(map) as TiledMap;
    const layer = broken.layers.find((l) => l.type === 'objectgroup');
    if (layer?.type !== 'objectgroup') throw new Error('no events layer');
    layer.objects = [
      { ...layer.objects[0]!, properties: [{ name: 'id', type: 'string', value: 'npc_x' }] },
    ];
    expect(() => parseMapObjects(broken)).toThrow(MapObjectError);
    layer.objects = [{ ...layer.objects[0]!, type: 'portal', properties: [] }];
    expect(() => parseMapObjects(broken)).toThrow(/unknown object type/);
    layer.objects = [
      {
        ...layer.objects[0]!,
        type: 'sign',
        x: 5,
        properties: [{ name: 'text_id', type: 'string', value: 'd' }],
      },
    ];
    expect(() => parseMapObjects(broken)).toThrow(/multiples of the tile size/);
  });

  it('returns no objects when the events layer is absent', () => {
    const noEvents = { ...map, layers: map.layers.filter((l) => l.type !== 'objectgroup') };
    expect(parseMapObjects(noEvents)).toEqual([]);
  });
});

describe('CollisionGrid', () => {
  const grid = CollisionGrid.fromMap(compileMap(src));

  it('reads the collision layer and treats outside as blocked', () => {
    expect(grid.isBlocked(1, 1)).toBe(true);
    expect(grid.isBlocked(0, 0)).toBe(false);
    expect(grid.isBlocked(-1, 0)).toBe(true);
    expect(grid.isBlocked(4, 0)).toBe(true);
    expect(grid.isBlocked(0, 3)).toBe(true);
  });

  it('can block extra cells without mutating the original', () => {
    const withNpc = grid.withBlocked([
      { x: 0, y: 0 },
      { x: 9, y: 9 },
    ]);
    expect(withNpc.isBlocked(0, 0)).toBe(true);
    expect(grid.isBlocked(0, 0)).toBe(false);
  });
});
