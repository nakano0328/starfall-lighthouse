import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, TriggerObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { findTileLayer } from '@core/map/tiled';
import { map_lighthouse_1f } from '@data/maps/map_lighthouse_1f';
import { tileGid } from '@data/tiles';

// docs/GAME_DESIGN.md §3.1 row map_lighthouse_1f, §5.12 symbols, §8.2 grp_tower_a,
// §13 #16 (lighthouse.floor / ev_tower_voice_1). The map is tested directly here (not via
// MAP_SOURCES) so this file stands on its own while the other tower floors are authored.

interface Cell {
  x: number;
  y: number;
}

const FLOOR_1F = 'map_lighthouse_1f';
const PATH = 'map_lighthouse_path';
const FLOOR_2F = 'map_lighthouse_2f';

// The coordinate contract shared by every tower floor, 灯台への道 and the chapter 4 script.
const ENTRANCE: Cell = { x: 12, y: 22 };
const DOOR: Cell = { x: 12, y: 23 };
const STAIRS_UP: Cell = { x: 21, y: 2 };
/** Where 2F's stairs down land the party. */
const LANDING_FROM_2F: Cell = { x: 21, y: 3 };
const SIGN: Cell = { x: 13, y: 21 };
const CHEST: Cell = { x: 2, y: 11 };
const SYMBOLS: Cell[] = [
  { x: 7, y: 14 },
  { x: 17, y: 10 },
];

const src = map_lighthouse_1f;
const compiled = compileMap(src);
const objects = parseMapObjects(compiled);
const grid = CollisionGrid.fromMap(compiled);
const { entrance } = src.meta;

const cellKey = (c: Cell): string => `${c.x},${c.y}`;
const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const neighbours = (c: Cell): Cell[] => [
  { x: c.x + 1, y: c.y },
  { x: c.x - 1, y: c.y },
  { x: c.x, y: c.y + 1 },
  { x: c.x, y: c.y - 1 },
];
const cellOf = (o: MapObject): Cell => ({ x: o.tx, y: o.ty });
const inRect = (o: Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>, c: Cell): boolean =>
  c.x >= o.tx && c.x < o.tx + o.tw && c.y >= o.ty && c.y < o.ty + o.th;

const ofKind = <K extends MapObject['kind']>(kind: K): Extract<MapObject, { kind: K }>[] =>
  objects.filter((o): o is Extract<MapObject, { kind: K }> => o.kind === kind);

/**
 * Blocking objects WorldScene adds to the collision grid: NPCs, chests, signs, save
 * points and examine-triggers.
 */
const blockers = (): Cell[] =>
  objects
    .filter(
      (o) =>
        o.kind === 'npc' ||
        o.kind === 'chest' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'trigger' && o.interact),
    )
    .map(cellOf);
const runtime = (): CollisionGrid => grid.withBlocked(blockers());

/** Gid the compiled map holds at `c` in the given tile layer (0 = empty). */
const gidAt = (layer: 'ground' | 'deco' | 'above', c: Cell): number =>
  findTileLayer(compiled, layer)?.data[c.y * compiled.width + c.x] ?? 0;
/** Whether the named placeholder tile is drawn at `c` in the ground or deco layer. */
const hasTile = (c: Cell, name: string): boolean =>
  gidAt('ground', c) === tileGid(name) || gidAt('deco', c) === tileGid(name);
const groundIs = (c: Cell, name: string): boolean => gidAt('ground', c) === tileGid(name);

/** Tiles reachable from `start` by 4-neighbour steps over unblocked cells, as "x,y" keys. */
function reachableFrom(from: CollisionGrid, start: Cell): Set<string> {
  const seen = new Set<string>();
  const queue: Cell[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (!cur || from.isBlocked(cur.x, cur.y) || seen.has(cellKey(cur))) continue;
    seen.add(cellKey(cur));
    queue.push(...neighbours(cur));
  }
  return seen;
}
const approachable = (reached: Set<string>, c: Cell): boolean =>
  neighbours(c).some((n) => reached.has(cellKey(n)));

const warpTo = (map: string): WarpObject => {
  const w = ofKind('warp').find((o) => o.targetMap === map);
  expect(w, `warp → ${map}`).toBeDefined();
  return w!;
};
const triggersAt = (c: Cell): TriggerObject[] =>
  ofKind('trigger').filter((t) => sameCell(cellOf(t), c));

/** Cells of a straight 4-neighbour segment from `a` to `b` (same row or column), inclusive. */
function segment(a: Cell, b: Cell): Cell[] {
  expect(a.x === b.x || a.y === b.y, `segment ${cellKey(a)} → ${cellKey(b)}`).toBe(true);
  const cells: Cell[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (let c = { ...a }; ; c = { x: c.x + dx, y: c.y + dy }) {
    cells.push(c);
    if (sameCell(c, b)) break;
  }
  return cells;
}

describe('灯台の塔 1F (map_lighthouse_1f)', () => {
  it('is a 24x24 dungeon on the tower backdrop with grp_tower_a and no free saving', () => {
    expect(src.width).toBe(24);
    expect(src.height).toBe(24);
    expect(src.tiles).toHaveLength(24);
    for (const row of src.tiles) expect([...row]).toHaveLength(24);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toEqual({
      id: FLOOR_1F,
      displayName: '灯台の塔 1F',
      kind: 'dungeon',
      bgmKey: 'bgm_lighthouse',
      battleBgKey: 'bg_lighthouse',
      encounterGroups: ['grp_tower_a'],
      tilesets: ['ts_placeholder'],
      entrance: { x: 12, y: 22, facing: 'up' },
      canSaveAnywhere: false,
    });
  });

  it('draws a round hall inside the square: void corners, a wall ring, stone floor within', () => {
    for (const c of [
      { x: 0, y: 0 },
      { x: 23, y: 0 },
      { x: 0, y: 23 },
      { x: 23, y: 23 },
      { x: 3, y: 2 },
      { x: 20, y: 21 },
    ]) {
      expect(groundIs(c, 'void'), `${cellKey(c)} is outside the tower`).toBe(true);
    }
    // The ring is wall_top on its outer crust and wall on the face lining the room.
    expect(groundIs({ x: 0, y: 12 }, 'wall_top')).toBe(true);
    expect(groundIs({ x: 1, y: 12 }, 'wall')).toBe(true);
    expect(groundIs({ x: 12, y: 0 }, 'wall_top')).toBe(true);
    expect(groundIs({ x: 12, y: 1 }, 'wall')).toBe(true);
    // Stone floor across the middle, with the rune seal in the centre.
    for (let x = 2; x <= 21; x++) {
      const c = { x, y: 12 };
      expect(hasTile(c, 'floor_stone') || hasTile(c, 'rune_floor'), cellKey(c)).toBe(true);
      expect(grid.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
    }
    for (const c of [
      { x: 11, y: 11 },
      { x: 12, y: 11 },
      { x: 11, y: 12 },
      { x: 12, y: 12 },
    ]) {
      expect(groundIs(c, 'rune_floor'), cellKey(c)).toBe(true);
    }
    // Every walkable tile belongs to the one hall the door opens on.
    const reachable = reachableFrom(grid, entrance);
    let walkable = 0;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) if (!grid.isBlocked(x, y)) walkable += 1;
    expect(reachable.size).toBe(walkable);
    expect(walkable).toBeGreaterThan(250);
  });

  it('starts the player in the door throat between two lanterns, facing up', () => {
    expect(entrance).toEqual({ ...ENTRANCE, facing: 'up' });
    expect(grid.isBlocked(ENTRANCE.x, ENTRANCE.y)).toBe(false);
    expect(runtime().isBlocked(ENTRANCE.x, ENTRANCE.y)).toBe(false);
    expect(hasTile({ x: 11, y: 22 }, 'lantern')).toBe(true);
    expect(hasTile({ x: 13, y: 22 }, 'lantern')).toBe(true);
    expect(grid.isBlocked(ENTRANCE.x, ENTRANCE.y - 1)).toBe(false);
  });

  it('has exactly two warps, the south door and the stairs up, with no stairs down', () => {
    const warps = ofKind('warp');
    expect(warps).toHaveLength(2);
    expect(warps.map((w) => w.targetMap).sort()).toEqual([FLOOR_2F, PATH]);
    for (const w of warps) {
      expect(w.requiredItem, cellKey(cellOf(w))).toBeUndefined();
      expect(w.lockedTextId, cellKey(cellOf(w))).toBeUndefined();
      expect(w.doorFlag, cellKey(cellOf(w))).toBeUndefined();
    }
  });

  it('warps through the bottom-edge door to 灯台への道 (15, 2), facing away from its door', () => {
    const south = warpTo(PATH);
    expect(south).toMatchObject({
      tx: DOOR.x,
      ty: DOOR.y,
      tw: 1,
      th: 1,
      targetMap: PATH,
      targetX: 15,
      targetY: 2,
      facing: 'down',
    });
    // A door tile on the map edge, walkable, directly behind the entrance (which faces up).
    expect(groundIs(DOOR, 'door')).toBe(true);
    expect(south.ty).toBe(src.height - 1);
    expect(grid.isBlocked(DOOR.x, DOOR.y)).toBe(false);
    expect(manhattan(DOOR, ENTRANCE)).toBe(1);
    expect(DOOR).toEqual({ x: ENTRANCE.x, y: ENTRANCE.y + 1 });
    expect(objects.some((o) => o.kind !== 'warp' && inRect(o, DOOR))).toBe(false);
  });

  it('climbs to 2F from the stairs at (21, 2), landing on 2F (2, 22) facing down', () => {
    const up = warpTo(FLOOR_2F);
    expect(up).toMatchObject({
      tx: STAIRS_UP.x,
      ty: STAIRS_UP.y,
      tw: 1,
      th: 1,
      targetMap: FLOOR_2F,
      targetX: 2,
      targetY: 22,
      facing: 'down',
    });
    expect(groundIs(STAIRS_UP, 'stairs')).toBe(true);
    expect(grid.isBlocked(STAIRS_UP.x, STAIRS_UP.y)).toBe(false);
    expect(objects.some((o) => o.kind !== 'warp' && inRect(o, STAIRS_UP))).toBe(false);
    // 2F's stairs down land on (21, 3) facing down: walkable, object-free, with the stairs
    // directly behind (above) the landing.
    expect(grid.isBlocked(LANDING_FROM_2F.x, LANDING_FROM_2F.y)).toBe(false);
    expect(runtime().isBlocked(LANDING_FROM_2F.x, LANDING_FROM_2F.y)).toBe(false);
    expect(objects.some((o) => inRect(o, LANDING_FROM_2F))).toBe(false);
    expect(LANDING_FROM_2F).toEqual({ x: STAIRS_UP.x, y: STAIRS_UP.y + 1 });
    // The turret is walled on its outside: the stairs are the only tile above the landing.
    expect(grid.isBlocked(STAIRS_UP.x + 1, STAIRS_UP.y)).toBe(true);
    expect(grid.isBlocked(STAIRS_UP.x, STAIRS_UP.y - 1)).toBe(true);
  });

  it("fires the shadow's voice once, on the entrance tile, when the party arrives", () => {
    expect(ofKind('trigger')).toHaveLength(1);
    const voice = triggersAt(ENTRANCE);
    expect(voice).toHaveLength(1);
    expect(voice[0]).toMatchObject({
      tx: ENTRANCE.x,
      ty: ENTRANCE.y,
      tw: 1,
      th: 1,
      eventId: 'ev_tower_voice_1',
      once: true,
      interact: false,
    });
    expect(voice[0]!.condition).toBeUndefined();
    // A step-on trigger: the entrance stays walkable at runtime.
    expect(runtime().isBlocked(ENTRANCE.x, ENTRANCE.y)).toBe(false);
  });

  it('puts the entrance sign one step inside the door', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: SIGN.x, ty: SIGN.y, textId: 'dlg_sign_tower_1f' });
    expect(grid.isBlocked(SIGN.x, SIGN.y)).toBe(false);
    expect(manhattan(SIGN, ENTRANCE)).toBeLessThanOrEqual(3);
    expect(sameCell(SIGN, ENTRANCE)).toBe(false);
    // Read from the tile above the entrance, facing right.
    expect(runtime().isBlocked(SIGN.x - 1, SIGN.y)).toBe(false);
  });

  it('holds the potion chest in the west alcove, away from the entrance', () => {
    const chests = ofKind('chest');
    expect(chests).toHaveLength(1);
    expect(chests[0]).toMatchObject({
      tx: CHEST.x,
      ty: CHEST.y,
      itemId: 'it_potion_l',
      qty: 2,
      flag: 'chest.tower_1f_01',
      tide: 'any',
    });
    expect(grid.isBlocked(CHEST.x, CHEST.y)).toBe(false);
    expect(manhattan(CHEST, ENTRANCE)).toBeGreaterThanOrEqual(6);
    expect(approachable(reachableFrom(runtime(), entrance), CHEST)).toBe(true);
  });

  it('places two grp_tower_a symbols on open floor, 6+ tiles from the entrance', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(2);
    expect(enemies.map(cellOf)).toEqual(SYMBOLS);
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.groupIds, label).toEqual(['grp_tower_a']);
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(e.tide, label).toBe('any');
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan(cellOf(e), ENTRANCE), label).toBeGreaterThanOrEqual(6);
      // §5.12: the symbol wanders within `radius`, so most of that square must be open ground.
      let open = 0;
      let total = 0;
      for (let dy = -e.radius; dy <= e.radius; dy++) {
        for (let dx = -e.radius; dx <= e.radius; dx++) {
          total += 1;
          if (!grid.isBlocked(e.tx + dx, e.ty + dy)) open += 1;
        }
      }
      expect(open / total, `${label} wander area`).toBeGreaterThan(0.5);
    }
  });

  it('has no NPCs and no save point: the floor is only the entrance hall', () => {
    expect(ofKind('npc')).toHaveLength(0);
    expect(ofKind('save_point')).toHaveLength(0);
    expect(objects).toHaveLength(7);
  });

  it('reaches every warp and object from the entrance and gives each sprite its own tile', () => {
    const reachable = reachableFrom(runtime(), entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    const taken = new Set<string>();
    for (const o of objects) {
      const cell = cellOf(o);
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point' || o.kind === 'npc') {
        expect(approachable(reachable, cell), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
        expect(
          ofKind('warp').some((w) => inRect(w, cell)),
          `${label} sits on a warp`,
        ).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
  });

  it('offers a straight open walk from the door to the stairs: up x12, along y5, up x21', () => {
    const run = runtime();
    const route = [
      ...segment(ENTRANCE, { x: 12, y: 5 }),
      ...segment({ x: 12, y: 5 }, { x: 21, y: 5 }),
      ...segment({ x: 21, y: 5 }, STAIRS_UP),
    ];
    for (const c of route) expect(run.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
    // Nothing but the voice trigger and the stairs warp lies on the route.
    for (const o of objects) {
      if (o.kind === 'trigger' || o.kind === 'warp') continue;
      expect(
        route.some((c) => inRect(o, c)),
        `${o.kind} at ${cellKey(cellOf(o))}`,
      ).toBe(false);
    }
  });
});
