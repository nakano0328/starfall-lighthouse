import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import { CollisionGrid, MapObjectError, objectsAt, parseMapObjects } from '@core/map/objects';
import type { MapObject } from '@core/map/objects';
import type { MapSource } from '@core/map/source';
import type { TiledMap, TiledProperty, TiledPropertyValue } from '@core/map/tiled';

const src: MapSource = {
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

/** Copy of `base` whose events layer holds a single object, as a Tiled export would carry it. */
function withOnlyObject(
  base: TiledMap,
  type: string,
  tile: { x: number; y: number; w?: number; h?: number },
  props: Record<string, TiledPropertyValue>,
): TiledMap {
  const copy = structuredClone(base) as TiledMap;
  const layer = copy.layers.find((l) => l.type === 'objectgroup');
  if (layer?.type !== 'objectgroup') throw new Error('no events layer');
  layer.objects = [
    {
      id: 1,
      name: `${type}_1`,
      type,
      x: tile.x * base.tilewidth,
      y: tile.y * base.tileheight,
      width: (tile.w ?? 1) * base.tilewidth,
      height: (tile.h ?? 1) * base.tileheight,
      rotation: 0,
      visible: true,
      properties: Object.entries(props).map(([name, value]): TiledProperty => ({
        name,
        type:
          typeof value === 'string'
            ? 'string'
            : typeof value === 'boolean'
              ? 'bool'
              : Number.isInteger(value)
                ? 'int'
                : 'float',
        value,
      })),
    },
  ];
  return copy;
}

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

  const npc = { id: 'npc_x', dialog: 'dlg_x', facing: 'down', sprite: 'sprite_npc' };
  const invalid: [
    string,
    string,
    { x: number; y: number },
    Record<string, TiledPropertyValue>,
    RegExp,
  ][] = [
    [
      'sign outside the map',
      'sign',
      { x: map.width, y: 0 },
      { text_id: 'dlg_x' },
      /outside the map/,
    ],
    [
      'warp whose target_x is a string',
      'warp',
      { x: 0, y: 0 },
      { target_map: 'map_b', target_x: '1', target_y: 1, facing: 'up' },
      /missing int property target_x/,
    ],
    [
      'enemy with a fractional respawn_sec',
      'enemy',
      { x: 0, y: 0 },
      { group_id: 'grp_a', respawn_sec: 1.5 },
      /respawn_sec must be an int/,
    ],
    [
      'npc with an unknown facing',
      'npc',
      { x: 0, y: 0 },
      { ...npc, facing: 'north' },
      /must be a facing/,
    ],
    [
      'chest with an unknown tide',
      'chest',
      { x: 0, y: 0 },
      { item_id: 'it_herb', qty: 1, flag: 'chest.x', tide: 'mid' },
      /high\/low\/any/,
    ],
    [
      'npc with an unknown move',
      'npc',
      { x: 0, y: 0 },
      { ...npc, move: 'wander' },
      /static\/random/,
    ],
    [
      'npc with a numeric shop',
      'npc',
      { x: 0, y: 0 },
      { ...npc, shop: 123 },
      /shop must be a string/,
    ],
    [
      'save_point with a string heal',
      'save_point',
      { x: 0, y: 0 },
      { heal: 'yes' },
      /heal must be a bool/,
    ],
    [
      'trigger without once',
      'trigger',
      { x: 0, y: 0 },
      { event_id: 'ev_x' },
      /missing bool property once/,
    ],
    [
      'enemy with an empty group_id list',
      'enemy',
      { x: 0, y: 0 },
      { group_id: ' , ' },
      /group_id must list at least one group/,
    ],
    [
      'npc with a two-clause hidden_if',
      'npc',
      { x: 0, y: 0 },
      { ...npc, hidden_if: 'a && b' },
      /property hidden_if: condition "a && b"/,
    ],
    [
      'npc with a one-segment condition',
      'npc',
      { x: 0, y: 0 },
      { ...npc, condition: 'flag' },
      /property condition: condition "flag"/,
    ],
    [
      'trigger with a one-segment condition',
      'trigger',
      { x: 0, y: 0 },
      { event_id: 'ev_x', once: true, condition: 'flag' },
      /property condition: condition "flag"/,
    ],
  ];

  it.each(invalid)('rejects a %s', (_label, type, tile, props, message) => {
    const broken = withOnlyObject(map, type, tile, props);
    expect(() => parseMapObjects(broken)).toThrow(MapObjectError);
    expect(() => parseMapObjects(broken)).toThrow(message);
  });

  it('applies save_point defaults when no properties are given', () => {
    const [savePoint] = parseMapObjects(withOnlyObject(map, 'save_point', { x: 1, y: 2 }, {}));
    expect(savePoint).toMatchObject({ kind: 'save_point', heal: false });
    expect(savePoint).not.toHaveProperty('onceFlag');
  });

  it('treats a Tiled point object (zero size) as one tile', () => {
    const [sign] = parseMapObjects(
      withOnlyObject(map, 'sign', { x: 1, y: 1, w: 0, h: 0 }, { text_id: 'dlg_x' }),
    );
    expect(sign).toMatchObject({ kind: 'sign', tx: 1, ty: 1, tw: 1, th: 1 });
  });

  it('returns no objects when the events layer is absent', () => {
    const noEvents = { ...map, layers: map.layers.filter((l) => l.type !== 'objectgroup') };
    expect(parseMapObjects(noEvents)).toEqual([]);
  });
});

describe('objectsAt', () => {
  const at = { tx: 1, ty: 1, tw: 1, th: 1 };
  // Declared in reverse priority so a dropped or source-order sort yields the opposite sequence.
  const stacked: MapObject[] = [
    { kind: 'enemy', ...at, groupIds: ['grp_a'], respawnSec: 60, radius: 4, tide: 'any' },
    { kind: 'trigger', ...at, eventId: 'ev_x', once: true },
    { kind: 'warp', ...at, targetMap: 'map_b', targetX: 0, targetY: 0, facing: 'up' },
    { kind: 'save_point', ...at, heal: false },
    { kind: 'sign', ...at, textId: 'dlg_x' },
    { kind: 'chest', ...at, itemId: 'it_herb', qty: 1, flag: 'chest.x', tide: 'any' },
    {
      kind: 'npc',
      ...at,
      id: 'npc_x',
      dialog: 'dlg_x',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
    },
  ];

  it('orders stacked objects by interaction priority regardless of source order', () => {
    expect(objectsAt(stacked, 1, 1).map((o) => o.kind)).toEqual([
      'npc',
      'chest',
      'sign',
      'save_point',
      'warp',
      'trigger',
      'enemy',
    ]);
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
