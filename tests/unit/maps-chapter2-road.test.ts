import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { EnemyObject, MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { map_mountain_road } from '@data/maps/map_mountain_road';
import { map_whisper_forest } from '@data/maps/map_whisper_forest';
import type { Facing } from '@data/types';

/**
 * Chapter 2 field map (docs/GAME_DESIGN.md §3.1): 山道 links the forest's north-east
 * trail (§13 #7) to 鉱山町ハガネ. Both maps are imported directly so these checks do not
 * depend on the registry in src/data/maps/index.ts; the generic sweep in
 * maps-data.test.ts covers them once they are registered there.
 */

interface Cell {
  x: number;
  y: number;
}

type Rect = Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>;
type Blocker = Extract<MapObject, { kind: 'npc' | 'chest' | 'sign' | 'save_point' }>;

const FACING_DELTA: Record<Facing, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const cellKey = (c: Cell): string => `${c.x},${c.y}`;
const cellOf = (o: Rect): Cell => ({ x: o.tx, y: o.ty });
const neighbours = (c: Cell): Cell[] => [
  { x: c.x + 1, y: c.y },
  { x: c.x - 1, y: c.y },
  { x: c.x, y: c.y + 1 },
  { x: c.x, y: c.y - 1 },
];
const inRect = (r: Rect, c: Cell): boolean =>
  c.x >= r.tx && c.x < r.tx + r.tw && c.y >= r.ty && c.y < r.ty + r.th;
const rectCells = (r: Rect): Cell[] => {
  const cells: Cell[] = [];
  for (let dy = 0; dy < r.th; dy++)
    for (let dx = 0; dx < r.tw; dx++) cells.push({ x: r.tx + dx, y: r.ty + dy });
  return cells;
};
const touchesRect = (r: Rect, c: Cell): boolean =>
  inRect(r, c) || neighbours(c).some((n) => inRect(r, n));
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const isBlocker = (o: MapObject): o is Blocker =>
  o.kind === 'npc' || o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point';

function reachableFrom(grid: CollisionGrid, start: Cell): Set<string> {
  const seen = new Set<string>();
  const queue: Cell[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (!cur || grid.isBlocked(cur.x, cur.y) || seen.has(cellKey(cur))) continue;
    seen.add(cellKey(cur));
    queue.push(...neighbours(cur));
  }
  return seen;
}

/** Share of the (2r+1)² wander square that is open ground (§5.12). */
function openShare(grid: CollisionGrid, c: Cell, radius: number): number {
  let open = 0;
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      total += 1;
      if (!grid.isBlocked(c.x + dx, c.y + dy)) open += 1;
    }
  }
  return open / total;
}

const FOREST = 'map_whisper_forest';
const ROAD = 'map_mountain_road';
const TOWN = 'map_hagane_town';

const forestMap = compileMap(map_whisper_forest);
const roadMap = compileMap(map_mountain_road);
const forest = parseMapObjects(forestMap);
const road = parseMapObjects(roadMap);
const forestGrid = CollisionGrid.fromMap(forestMap);
const roadGrid = CollisionGrid.fromMap(roadMap);
const roadEntrance: Cell = map_mountain_road.meta.entrance;

const warps = (objects: MapObject[]): WarpObject[] =>
  objects.filter((o): o is WarpObject => o.kind === 'warp');
const blockers = (objects: MapObject[]): Blocker[] => objects.filter(isBlocker);
const enemies = (objects: MapObject[]): EnemyObject[] =>
  objects.filter((o): o is EnemyObject => o.kind === 'enemy');

const forestNorthEast = warps(forest).find((w) => w.tx === map_whisper_forest.width - 1);
const roadWest = warps(road).filter((w) => w.tx === 0);
const roadEast = warps(road).filter((w) => w.tx === map_mountain_road.width - 1);
/** The walkability WorldScene uses at runtime: the collision layer plus every blocker. */
const roadGridAtRuntime = roadGrid.withBlocked(blockers(road).map(cellOf));

/** The switchback: the two ramps through the cliff bands (see the map's doc comment). */
const LOWER_RAMP: Cell[] = [
  { x: 34, y: 12 },
  { x: 35, y: 12 },
  { x: 34, y: 13 },
  { x: 35, y: 13 },
];
const UPPER_RAMP: Cell[] = [
  { x: 3, y: 6 },
  { x: 4, y: 6 },
  { x: 3, y: 7 },
  { x: 4, y: 7 },
];

describe('ささやきの森 north-east exit ↔ 山道 west edge', () => {
  it('warps from the forest exit to the road entrance, facing right', () => {
    expect(forestNorthEast).toMatchObject({
      tx: 49,
      ty: 6,
      tw: 1,
      th: 1,
      targetMap: ROAD,
      targetX: roadEntrance.x,
      targetY: roadEntrance.y,
      facing: 'right',
    });
    expect(roadEntrance).toEqual({ x: 1, y: 17, facing: 'right' });
    expect(roadGrid.isBlocked(roadEntrance.x, roadEntrance.y)).toBe(false);
    expect(roadGridAtRuntime.isBlocked(roadEntrance.x, roadEntrance.y)).toBe(false);
    // The exit itself is still the placeholder-free single tile at the end of the vine trail.
    expect(forestGrid.isBlocked(49, 6)).toBe(false);
  });

  it('warps from the road west edge back onto the forest trail in front of its exit, facing left', () => {
    expect(roadWest).toHaveLength(1);
    expect(roadWest[0]).toMatchObject({
      tx: 0,
      ty: 17,
      tw: 1,
      th: 2,
      targetMap: FOREST,
      targetX: 48,
      targetY: 6,
      facing: 'left',
    });
    for (const c of rectCells(roadWest[0]!)) expect(roadGrid.isBlocked(c.x, c.y)).toBe(false);
    // The rest of the west edge is sealed, so the warp is the only way off the map there.
    expect(roadGrid.isBlocked(0, 16)).toBe(true);
    expect(roadGrid.isBlocked(0, 19)).toBe(true);
    // The landing is the vine's tile: open ground, and the vine is the only object there.
    // It hides on `fragments.count>=1` — the same flag that lets the player reach this road
    // at all (§13 #7) — so the landing is clear whenever the player comes back this way.
    expect(forestGrid.isBlocked(48, 6)).toBe(false);
    const onLanding = blockers(forest).filter((o) => o.tx === 48 && o.ty === 6);
    expect(onLanding).toHaveLength(1);
    expect(onLanding[0]).toMatchObject({
      kind: 'npc',
      id: 'npc_forest_vine',
      hiddenIf: 'fragments.count>=1',
    });
    const forestOpen = forestGrid.withBlocked(
      blockers(forest)
        .filter((o) => !(o.kind === 'npc' && o.id === 'npc_forest_vine'))
        .map(cellOf),
    );
    expect(forestOpen.isBlocked(48, 6)).toBe(false);
  });

  it('lands each way with the return warp directly behind the player', () => {
    const pairs: [WarpObject, WarpObject][] = [
      [forestNorthEast!, roadWest[0]!],
      [roadWest[0]!, forestNorthEast!],
    ];
    for (const [w, back] of pairs) {
      const landing: Cell = { x: w.targetX, y: w.targetY };
      expect(touchesRect(back, landing)).toBe(true);
      expect(touchesRect(w, { x: back.targetX, y: back.targetY })).toBe(true);
      const d = FACING_DELTA[w.facing];
      expect(inRect(back, { x: landing.x - d.x, y: landing.y - d.y })).toBe(true);
    }
    expect(touchesRect(roadWest[0]!, roadEntrance)).toBe(true);
  });
});

describe('山道 (map_mountain_road)', () => {
  it('is a 40x20 field map with the road encounter groups and no free saving (§3.1)', () => {
    expect(map_mountain_road.width).toBe(40);
    expect(map_mountain_road.height).toBe(20);
    expect(map_mountain_road.tiles).toHaveLength(20);
    for (const row of map_mountain_road.tiles) expect([...row]).toHaveLength(40);
    expect(map_mountain_road.meta).toMatchObject({
      id: ROAD,
      displayName: '山道',
      kind: 'field',
      bgmKey: 'bgm_field',
      battleBgKey: 'bg_mine',
      encounterGroups: ['grp_forest_b', 'grp_mine_a'],
      tilesets: ['ts_placeholder'],
      canSaveAnywhere: false,
    });
    expect(map_mountain_road.overlay).toBeUndefined();
    expect(map_mountain_road.blocked).toBeUndefined();
  });

  it('has exactly two warps, one on each of the west and east edges', () => {
    expect(warps(road)).toHaveLength(2);
    expect(roadWest).toHaveLength(1);
    expect(roadEast).toHaveLength(1);
  });

  it('leads from its east edge to the west gate of 鉱山町ハガネ at (1, 14), facing right', () => {
    // 鉱山町ハガネ is authored separately: this assumes its west gate warp sits on (0, 14)
    // with h: 2, that (1, 14) is walkable, and that it lands the player on (38, 4) here.
    expect(roadEast[0]).toMatchObject({
      tx: 39,
      ty: 4,
      tw: 1,
      th: 2,
      targetMap: TOWN,
      targetX: 1,
      targetY: 14,
      facing: 'right',
    });
    expect(roadEast[0]!.requiredItem).toBeUndefined();
    for (const c of rectCells(roadEast[0]!)) expect(roadGrid.isBlocked(c.x, c.y)).toBe(false);
    // The tiles in front of the exit, where the town's return warp lands, are open ...
    expect(roadGridAtRuntime.isBlocked(38, 4)).toBe(false);
    expect(roadGridAtRuntime.isBlocked(38, 5)).toBe(false);
    // ... and the rest of the east edge is cliff, so the gate is the only way through.
    expect(roadGrid.isBlocked(39, 3)).toBe(true);
    expect(roadGrid.isBlocked(39, 6)).toBe(true);
  });

  it('switchbacks up two ramps: blocking either one cuts the road (§3.1 高低差のある一本道)', () => {
    const exit = cellOf(roadEast[0]!);
    const open = reachableFrom(roadGridAtRuntime, roadEntrance);
    expect(open.has(cellKey(exit))).toBe(true);
    for (const c of [...LOWER_RAMP, ...UPPER_RAMP])
      expect(roadGrid.isBlocked(c.x, c.y), `ramp tile ${cellKey(c)}`).toBe(false);
    // Without the lower ramp nothing above the first cliff band can be reached.
    const noLower = reachableFrom(roadGridAtRuntime.withBlocked(LOWER_RAMP), roadEntrance);
    expect(noLower.has(cellKey(exit))).toBe(false);
    expect(noLower.has(cellKey({ x: 20, y: 10 }))).toBe(false);
    expect(noLower.has(cellKey({ x: 20, y: 17 }))).toBe(true);
    // Without the upper ramp the middle terrace is reached but the top one is not.
    const noUpper = reachableFrom(roadGridAtRuntime.withBlocked(UPPER_RAMP), roadEntrance);
    expect(noUpper.has(cellKey(exit))).toBe(false);
    expect(noUpper.has(cellKey({ x: 20, y: 10 }))).toBe(true);
    expect(noUpper.has(cellKey({ x: 20, y: 4 }))).toBe(false);
    // The bands themselves are cliff from edge to edge apart from the ramps.
    for (const y of [6, 12]) {
      for (let x = 0; x < map_mountain_road.width; x++) {
        const ramp = [...LOWER_RAMP, ...UPPER_RAMP].some((c) => c.x === x && c.y === y);
        expect(roadGrid.isBlocked(x, y), `band tile (${x}, ${y})`).toBe(!ramp);
      }
    }
  });

  it('has the entrance sign and the mine-rumour sign halfway up', () => {
    const signs = road.filter((o) => o.kind === 'sign');
    expect(signs.map((s) => s.textId).sort()).toEqual([
      'dlg_sign_mountain_entrance',
      'dlg_sign_mountain_mine',
    ]);
    const entranceSign = signs.find((s) => s.textId === 'dlg_sign_mountain_entrance')!;
    expect(cellOf(entranceSign)).toEqual({ x: 3, y: 16 });
    expect(manhattan(cellOf(entranceSign), roadEntrance)).toBeLessThanOrEqual(4);
    // Halfway: beside the middle terrace's road, in the middle third of the map.
    const mineSign = signs.find((s) => s.textId === 'dlg_sign_mountain_mine')!;
    expect(cellOf(mineSign)).toEqual({ x: 18, y: 9 });
    expect(mineSign.ty).toBeGreaterThanOrEqual(8);
    expect(mineSign.ty).toBeLessThanOrEqual(11);
    expect(mineSign.tx).toBeGreaterThanOrEqual(13);
    expect(mineSign.tx).toBeLessThanOrEqual(26);
  });

  it('has one save point on a ledge above the second ramp, two thirds of the way up', () => {
    const saves = road.filter((o) => o.kind === 'save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 6, ty: 1, heal: false });
    expect(saves[0]!.onceFlag).toBeUndefined();
    // A nook in the top cliff: open on one side only, a few steps from the upper ramp.
    expect(neighbours(cellOf(saves[0]!)).filter((c) => !roadGrid.isBlocked(c.x, c.y))).toEqual([
      { x: 6, y: 2 },
    ]);
    expect(Math.min(...UPPER_RAMP.map((c) => manhattan(c, cellOf(saves[0]!))))).toBeLessThanOrEqual(
      8,
    );
  });

  it('holds the two chests with their exact items, quantities and flags', () => {
    const chests = road
      .filter((o) => o.kind === 'chest')
      .map((c) => ({ x: c.tx, y: c.ty, itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { x: 8, y: 13, itemId: 'it_potion_s', qty: 2, flag: 'chest.mountain_01', tide: 'any' },
      { x: 27, y: 7, itemId: 'it_antidote', qty: 2, flag: 'chest.mountain_02', tide: 'any' },
    ]);
    // Each chest sits in a one-tile notch of a cliff band, open to its terrace only.
    for (const c of chests) {
      expect(roadGrid.isBlocked(c.x, c.y), c.flag).toBe(false);
      expect(
        neighbours(c).filter((n) => !roadGrid.isBlocked(n.x, n.y)),
        c.flag,
      ).toHaveLength(1);
    }
  });

  it('places five unconditional enemy symbols on open ground, away from the entrance', () => {
    const symbols = enemies(road);
    expect(symbols).toHaveLength(5);
    const byGroups = (groups: string[]): EnemyObject[] =>
      symbols.filter(
        (e) => e.groupIds.length === groups.length && groups.every((g) => e.groupIds.includes(g)),
      );
    expect(byGroups(['grp_forest_b'])).toHaveLength(2);
    expect(byGroups(['grp_mine_a'])).toHaveLength(2);
    expect(byGroups(['grp_forest_b', 'grp_mine_a'])).toHaveLength(1);
    const allowed = new Set(map_mountain_road.meta.encounterGroups);
    for (const e of symbols) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      for (const g of e.groupIds) expect(allowed.has(g), `${label} group ${g}`).toBe(true);
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.tide, label).toBe('any');
      expect(e.condition, label).toBeUndefined();
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(roadGrid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan(cellOf(e), roadEntrance), label).toBeGreaterThanOrEqual(6);
      // §5.12: the symbol wanders within `radius`, so most of that square must be open ground.
      expect(openShare(roadGrid, cellOf(e), e.radius), `${label} wander area`).toBeGreaterThan(0.5);
    }
    // Wolves low, mine creatures high (see the map's doc comment).
    for (const e of byGroups(['grp_forest_b'])) expect(e.ty).toBeGreaterThanOrEqual(14);
    for (const e of byGroups(['grp_mine_a'])) expect(e.ty).toBeLessThanOrEqual(5);
    for (const src of map_mountain_road.objects)
      if (src.type === 'enemy') expect('condition' in src).toBe(false);
  });

  it('keeps every object on its own walkable tile, off the warps, reachable from the entrance', () => {
    const taken = new Set<string>();
    for (const o of blockers(road)) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      expect(roadGrid.isBlocked(o.tx, o.ty), label).toBe(false);
      expect(taken.has(cellKey(cellOf(o))), `${label} shares a tile`).toBe(false);
      taken.add(cellKey(cellOf(o)));
      expect(
        warps(road).some((w) => inRect(w, cellOf(o))),
        `${label} sits on a warp`,
      ).toBe(false);
      expect(manhattan(cellOf(o), roadEntrance), `${label} on the entrance`).toBeGreaterThan(0);
    }
    expect(road.some((o) => o.kind === 'npc' || o.kind === 'trigger')).toBe(false);
    expect(roadGridAtRuntime.isBlocked(roadEntrance.x, roadEntrance.y)).toBe(false);
    const reachable = reachableFrom(roadGridAtRuntime, roadEntrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    for (const o of road) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'warp') {
        expect(rectCells(o).every(reached), `${label} unreachable`).toBe(true);
      } else if (o.kind === 'enemy') {
        expect(reached(cellOf(o)), `${label} unreachable`).toBe(true);
      } else if (isBlocker(o)) {
        expect(neighbours(cellOf(o)).some(reached), `${label} cannot be approached`).toBe(true);
      }
    }
    // Every open tile of the map is part of the one road: no sealed-off pockets.
    for (let y = 0; y < map_mountain_road.height; y++) {
      for (let x = 0; x < map_mountain_road.width; x++) {
        if (roadGridAtRuntime.isBlocked(x, y)) continue;
        expect(reached({ x, y }), `open tile (${x}, ${y}) is cut off from the road`).toBe(true);
      }
    }
  });
});
