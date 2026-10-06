import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { EnemyObject, MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry, MapSource } from '@core/map/source';
import { OVERLAY_EMPTY, normalizeLegendEntry } from '@core/map/source';
import { map_hagane_town } from '@data/maps/map_hagane_town';
import { map_ruins_camp } from '@data/maps/map_ruins_camp';
import { map_shore_path } from '@data/maps/map_shore_path';
import type { Facing } from '@data/types';

/**
 * Chapter 3 field map (docs/GAME_DESIGN.md §3.1): 磯の道 links 鉱山町ハガネ's south gate
 * (§13 #10) to 学者のキャンプ. The maps are imported directly so these checks do not
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
const isGated = (o: Blocker): boolean =>
  o.kind === 'npc' && (o.hiddenIf !== undefined || o.condition !== undefined);

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

/** Legend entry of the character the ASCII source places at (x, y), overlay included. */
function legendAt(src: MapSource, x: number, y: number): LegendEntry | undefined {
  const charAt = (rows: readonly string[] | undefined): string | undefined => {
    const row = rows?.[y];
    return row === undefined ? undefined : [...row][x];
  };
  const entry = (ch: string | undefined): LegendEntry | undefined => {
    if (ch === undefined || ch === OVERLAY_EMPTY) return undefined;
    const e = src.legend[ch];
    return e === undefined ? undefined : normalizeLegendEntry(e);
  };
  return entry(charAt(src.overlay)) ?? entry(charAt(src.tiles));
}
const groundTile = (src: MapSource, x: number, y: number): string | undefined =>
  legendAt(src, x, y)?.ground;

const SHORE = 'map_shore_path';
const TOWN = 'map_hagane_town';
const CAMP = 'map_ruins_camp';

const shoreMap = compileMap(map_shore_path);
const townMap = compileMap(map_hagane_town);
const campMap = compileMap(map_ruins_camp);
const shore = parseMapObjects(shoreMap);
const town = parseMapObjects(townMap);
const camp = parseMapObjects(campMap);
const shoreGrid = CollisionGrid.fromMap(shoreMap);
const townGrid = CollisionGrid.fromMap(townMap);
const campGrid = CollisionGrid.fromMap(campMap);
const shoreEntrance: Cell = map_shore_path.meta.entrance;

const warps = (objects: MapObject[]): WarpObject[] =>
  objects.filter((o): o is WarpObject => o.kind === 'warp');
const blockers = (objects: MapObject[]): Blocker[] => objects.filter(isBlocker);
const enemies = (objects: MapObject[]): EnemyObject[] =>
  objects.filter((o): o is EnemyObject => o.kind === 'enemy');

const shoreNorth = warps(shore).filter((w) => w.ty === 0);
const shoreSouth = warps(shore).filter((w) => w.ty === map_shore_path.height - 1);
const townSouthGate = warps(town).find((w) => w.ty === map_hagane_town.height - 1);
const campNorth = warps(camp).find((w) => w.ty === 0);
/** The walkability WorldScene uses at runtime: the collision layer plus every blocker. */
const shoreGridAtRuntime = shoreGrid.withBlocked(blockers(shore).map(cellOf));
const townGridAtRuntime = townGrid.withBlocked(blockers(town).map(cellOf));
const campGridAtRuntime = campGrid.withBlocked(blockers(camp).map(cellOf));

/** The two gaps in the cliff bands the road switchbacks through (see the map's doc comment). */
const UPPER_GAP: Cell[] = [
  { x: 5, y: 6 },
  { x: 6, y: 6 },
];
const LOWER_GAP: Cell[] = [
  { x: 29, y: 12 },
  { x: 30, y: 12 },
];
/** The last beach column: sand on every shelf, where the tide pools are counted. */
const BEACH_X = 32;
/** From here east it is shallows and sea: never walkable (sand spits reach x33 on a few rows). */
const SEA_X = 34;

describe('鉱山町ハガネ south gate ↔ 磯の道 north edge', () => {
  it('warps from the town gate (18, 27) onto the road entrance (19, 1), facing down', () => {
    expect(townSouthGate).toMatchObject({
      tx: 18,
      ty: 27,
      tw: 1,
      th: 1,
      targetMap: SHORE,
      targetX: shoreEntrance.x,
      targetY: shoreEntrance.y,
      facing: 'down',
    });
    expect(townSouthGate!.requiredItem).toBeUndefined();
    expect(shoreEntrance).toEqual({ x: 19, y: 1, facing: 'down' });
    expect(shoreGrid.isBlocked(shoreEntrance.x, shoreEntrance.y)).toBe(false);
    expect(shoreGridAtRuntime.isBlocked(shoreEntrance.x, shoreEntrance.y)).toBe(false);
    expect(groundTile(map_shore_path, shoreEntrance.x, shoreEntrance.y)).toBe('path');
  });

  it('warps from the road north edge (19-20, 0) back in front of the gate (18, 26), facing up', () => {
    expect(shoreNorth).toHaveLength(1);
    expect(shoreNorth[0]).toMatchObject({
      tx: 19,
      ty: 0,
      tw: 2,
      th: 1,
      targetMap: TOWN,
      targetX: 18,
      targetY: 26,
      facing: 'up',
    });
    for (const c of rectCells(shoreNorth[0]!)) {
      expect(shoreGrid.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
      expect(groundTile(map_shore_path, c.x, c.y), cellKey(c)).toBe('path');
    }
    // The rest of the north edge is cliff and sea, so the gate road is the only way out there.
    for (let x = 0; x < map_shore_path.width; x++)
      if (x !== 19 && x !== 20) expect(shoreGrid.isBlocked(x, 0), `(${x}, 0)`).toBe(true);
    // The landing is the south street tile in front of the gate, with nothing standing on it
    // (the guard stands one tile further up, at (18, 25)).
    expect(townGrid.isBlocked(18, 26)).toBe(false);
    expect(townGridAtRuntime.isBlocked(18, 26)).toBe(false);
    expect(townSouthGate!.ty).toBe(27);
    expect(manhattan({ x: 18, y: 26 }, cellOf(townSouthGate!))).toBe(1);
  });

  it('is still sealed on the town side by npc_hagane_south_guard until the second fragment (§13 #10)', () => {
    const guard = town.find((o) => o.kind === 'npc' && o.id === 'npc_hagane_south_guard');
    expect(guard).toMatchObject({ tx: 18, ty: 25, hiddenIf: 'fragments.count>=2' });
    const sealed = reachableFrom(townGridAtRuntime, map_hagane_town.meta.entrance);
    expect(sealed.has(cellKey(cellOf(townSouthGate!)))).toBe(false);
    const open = reachableFrom(
      townGrid.withBlocked(
        blockers(town)
          .filter((o) => !isGated(o))
          .map(cellOf),
      ),
      map_hagane_town.meta.entrance,
    );
    expect(open.has(cellKey(cellOf(townSouthGate!)))).toBe(true);
  });

  it('lands each way with the return warp directly behind the player', () => {
    const pairs: [WarpObject, WarpObject][] = [
      [townSouthGate!, shoreNorth[0]!],
      [shoreNorth[0]!, townSouthGate!],
    ];
    for (const [w, back] of pairs) {
      const landing: Cell = { x: w.targetX, y: w.targetY };
      expect(touchesRect(back, landing)).toBe(true);
      expect(inRect(back, landing)).toBe(false);
      expect(touchesRect(w, { x: back.targetX, y: back.targetY })).toBe(true);
      const d = FACING_DELTA[w.facing];
      expect(inRect(back, { x: landing.x - d.x, y: landing.y - d.y })).toBe(true);
    }
    expect(touchesRect(shoreNorth[0]!, shoreEntrance)).toBe(true);
  });
});

describe('磯の道 south edge ↔ 学者のキャンプ north edge', () => {
  it('warps from the road exit (20, 19) onto the camp entrance (10, 1), facing down', () => {
    expect(shoreSouth).toHaveLength(1);
    expect(shoreSouth[0]).toMatchObject({
      tx: 20,
      ty: 19,
      tw: 1,
      th: 1,
      targetMap: CAMP,
      targetX: 10,
      targetY: 1,
      facing: 'down',
    });
    expect(shoreSouth[0]!.requiredItem).toBeUndefined();
    expect(map_ruins_camp.meta.entrance).toEqual({ x: 10, y: 1, facing: 'down' });
    expect(shoreGrid.isBlocked(20, 19)).toBe(false);
    expect(groundTile(map_shore_path, 20, 19)).toBe('path');
    // The rest of the south edge is cliff and sea, so the exit is the only way out there.
    for (let x = 0; x < map_shore_path.width; x++)
      if (x !== 20) expect(shoreGrid.isBlocked(x, 19), `(${x}, 19)`).toBe(true);
    expect(campGrid.isBlocked(10, 1)).toBe(false);
    expect(campGridAtRuntime.isBlocked(10, 1)).toBe(false);
  });

  it('warps from the camp north edge (10, 0) back in front of the exit (20, 18), facing up', () => {
    expect(campNorth).toMatchObject({
      tx: 10,
      ty: 0,
      tw: 1,
      th: 1,
      targetMap: SHORE,
      targetX: 20,
      targetY: 18,
      facing: 'up',
    });
    expect(campGrid.isBlocked(10, 0)).toBe(false);
    // The landing is the road tile right above the exit, with nothing standing on it.
    expect(shoreGrid.isBlocked(20, 18)).toBe(false);
    expect(shoreGridAtRuntime.isBlocked(20, 18)).toBe(false);
    expect(groundTile(map_shore_path, 20, 18)).toBe('path');
    expect(shore.some((o) => inRect(o, { x: 20, y: 18 }))).toBe(false);
  });

  it('lands each way with the return warp directly behind the player', () => {
    const pairs: [WarpObject, WarpObject][] = [
      [shoreSouth[0]!, campNorth!],
      [campNorth!, shoreSouth[0]!],
    ];
    for (const [w, back] of pairs) {
      const landing: Cell = { x: w.targetX, y: w.targetY };
      expect(touchesRect(back, landing)).toBe(true);
      expect(inRect(back, landing)).toBe(false);
      expect(touchesRect(w, { x: back.targetX, y: back.targetY })).toBe(true);
      const d = FACING_DELTA[w.facing];
      expect(inRect(back, { x: landing.x - d.x, y: landing.y - d.y })).toBe(true);
    }
  });
});

describe('磯の道 (map_shore_path)', () => {
  it('is a 40x20 field map with the ruins/mine encounter groups and no free saving (§3.1)', () => {
    expect(map_shore_path.width).toBe(40);
    expect(map_shore_path.height).toBe(20);
    expect(map_shore_path.tiles).toHaveLength(20);
    for (const row of map_shore_path.tiles) expect([...row]).toHaveLength(40);
    expect(map_shore_path.meta).toEqual({
      id: SHORE,
      displayName: '磯の道',
      kind: 'field',
      bgmKey: 'bgm_field',
      battleBgKey: 'bg_coast',
      encounterGroups: ['grp_ruins_a', 'grp_mine_a'],
      tilesets: ['ts_placeholder'],
      entrance: { x: 19, y: 1, facing: 'down' },
      canSaveAnywhere: false,
    });
    expect(map_shore_path.overlay).toBeUndefined();
    expect(map_shore_path.blocked).toBeUndefined();
    expect(map_shore_path.tide).toBeUndefined();
  });

  it('has exactly two warps, one on the north edge and one on the south edge', () => {
    expect(warps(shore)).toHaveLength(2);
    expect(shoreNorth).toHaveLength(1);
    expect(shoreSouth).toHaveLength(1);
    for (const w of warps(shore)) {
      expect(w.requiredItem).toBeUndefined();
      expect(w.lockedTextId).toBeUndefined();
      expect(w.doorFlag).toBeUndefined();
    }
    // No door tiles: the exits are plain path tiles on the map edge.
    for (let y = 0; y < map_shore_path.height; y++)
      for (let x = 0; x < map_shore_path.width; x++)
        expect(groundTile(map_shore_path, x, y), `(${x}, ${y})`).not.toBe('door');
  });

  it('shows the sea along the whole east edge, with shallows and a sandy beach in front (§3.1 海が見える)', () => {
    for (let y = 0; y < map_shore_path.height; y++) {
      for (let x = 35; x < map_shore_path.width; x++)
        expect(groundTile(map_shore_path, x, y), `(${x}, ${y})`).toBe('deep_water');
      for (let x = 33; x < 35; x++)
        expect(['water', 'sand']).toContain(groundTile(map_shore_path, x, y));
      for (let x = SEA_X; x < map_shore_path.width; x++)
        expect(shoreGrid.isBlocked(x, y), `(${x}, ${y}) walkable out in the sea`).toBe(true);
    }
    // Sand runs along the shore on every shelf, and the player can walk down to the water.
    const beach = reachableFrom(shoreGridAtRuntime, shoreEntrance);
    for (const y of [2, 9, 15]) {
      expect(groundTile(map_shore_path, BEACH_X, y), `(${BEACH_X}, ${y})`).toBe('sand');
      expect(beach.has(cellKey({ x: BEACH_X, y })), `(${BEACH_X}, ${y})`).toBe(true);
    }
  });

  it('dots the beach with impassable tide pools (§3.1 潮だまりの装飾)', () => {
    const pools: Cell[] = [];
    for (let y = 0; y < map_shore_path.height; y++)
      for (let x = 0; x <= BEACH_X; x++)
        if (groundTile(map_shore_path, x, y) === 'water') pools.push({ x, y });
    expect(pools.length).toBeGreaterThanOrEqual(3);
    for (const p of pools) {
      expect(shoreGrid.isBlocked(p.x, p.y), cellKey(p)).toBe(true);
      // Each pool lies in the sand, not out in the sea.
      expect(
        neighbours(p).some((n) => groundTile(map_shore_path, n.x, n.y) === 'sand'),
        `pool ${cellKey(p)} is not on the beach`,
      ).toBe(true);
    }
    // One pool on each shelf (see the map's doc comment).
    expect(pools.some((p) => p.y <= 5)).toBe(true);
    expect(pools.some((p) => p.y >= 7 && p.y <= 11)).toBe(true);
    expect(pools.some((p) => p.y >= 13)).toBe(true);
  });

  it('winds down the shore through two cliff gaps: blocking either one cuts the road', () => {
    const exit = cellOf(shoreSouth[0]!);
    const open = reachableFrom(shoreGridAtRuntime, shoreEntrance);
    expect(open.has(cellKey(exit))).toBe(true);
    for (const c of [...UPPER_GAP, ...LOWER_GAP])
      expect(shoreGrid.isBlocked(c.x, c.y), `gap tile ${cellKey(c)}`).toBe(false);
    // Without the upper gap nothing below the first cliff band can be reached.
    const noUpper = reachableFrom(shoreGridAtRuntime.withBlocked(UPPER_GAP), shoreEntrance);
    expect(noUpper.has(cellKey(exit))).toBe(false);
    expect(noUpper.has(cellKey({ x: 14, y: 10 }))).toBe(false);
    expect(noUpper.has(cellKey({ x: 10, y: 4 }))).toBe(true);
    // Without the lower gap the middle shelf is reached but the lower one is not.
    const noLower = reachableFrom(shoreGridAtRuntime.withBlocked(LOWER_GAP), shoreEntrance);
    expect(noLower.has(cellKey(exit))).toBe(false);
    expect(noLower.has(cellKey({ x: 14, y: 10 }))).toBe(true);
    expect(noLower.has(cellKey({ x: 25, y: 15 }))).toBe(false);
    // The bands run from the west wall into the sea apart from the gaps.
    for (const y of [6, 12]) {
      for (let x = 0; x < map_shore_path.width; x++) {
        const gap = [...UPPER_GAP, ...LOWER_GAP].some((c) => c.x === x && c.y === y);
        expect(shoreGrid.isBlocked(x, y), `band tile (${x}, ${y})`).toBe(!gap);
      }
    }
    // The road itself is drawn in path tiles from the gate to the exit.
    for (const c of [
      { x: 19, y: 2 },
      { x: 12, y: 3 },
      ...UPPER_GAP,
      { x: 5, y: 8 },
      { x: 20, y: 9 },
      ...LOWER_GAP,
      { x: 29, y: 14 },
      { x: 25, y: 16 },
      { x: 20, y: 17 },
    ])
      expect(groundTile(map_shore_path, c.x, c.y), cellKey(c)).toBe('path');
  });

  it('has the sign beside the gate road, a few steps from the entrance', () => {
    const signs = shore.filter((o) => o.kind === 'sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 21, ty: 2, textId: 'dlg_sign_shore' });
    expect(manhattan(cellOf(signs[0]!), shoreEntrance)).toBeLessThanOrEqual(4);
    expect(manhattan(cellOf(signs[0]!), shoreEntrance)).toBeGreaterThan(0);
    expect(
      neighbours(cellOf(signs[0]!)).some((n) => groundTile(map_shore_path, n.x, n.y) === 'path'),
    ).toBe(true);
  });

  it('has one save point in a rock nook under the upper cliff, halfway along', () => {
    const saves = shore.filter((o) => o.kind === 'save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 17, ty: 7, heal: false });
    expect(saves[0]!.onceFlag).toBeUndefined();
    const save = cellOf(saves[0]!);
    // A nook: cliff above, rocks either side, open towards the road only.
    expect(groundTile(map_shore_path, save.x, save.y - 1)).toBe('cliff');
    expect(legendAt(map_shore_path, save.x - 1, save.y)?.deco).toBe('rock');
    expect(legendAt(map_shore_path, save.x + 1, save.y)?.deco).toBe('rock');
    expect(neighbours(save).filter((c) => !shoreGrid.isBlocked(c.x, c.y))).toEqual([
      { x: 17, y: 8 },
    ]);
    // Halfway: on the middle shelf, two steps from the middle road.
    expect(save.y).toBeGreaterThanOrEqual(7);
    expect(save.y).toBeLessThanOrEqual(11);
    expect(groundTile(map_shore_path, save.x, save.y + 2)).toBe('path');
  });

  it('holds chest.shore_01 (two tide shells) out on the beach, off the road', () => {
    const chests = shore.filter((o) => o.kind === 'chest');
    expect(chests).toHaveLength(1);
    expect(chests[0]).toMatchObject({
      tx: 31,
      ty: 2,
      itemId: 'it_tide_shell',
      qty: 2,
      flag: 'chest.shore_01',
      tide: 'any',
    });
    const chest = cellOf(chests[0]!);
    expect(shoreGrid.isBlocked(chest.x, chest.y)).toBe(false);
    expect(groundTile(map_shore_path, chest.x, chest.y)).toBe('sand');
    // Between tide pools, well away from any road tile.
    expect(neighbours(chest).some((n) => groundTile(map_shore_path, n.x, n.y) === 'water')).toBe(
      true,
    );
    let nearestPath = Number.POSITIVE_INFINITY;
    for (let y = 0; y < map_shore_path.height; y++)
      for (let x = 0; x < map_shore_path.width; x++)
        if (groundTile(map_shore_path, x, y) === 'path')
          nearestPath = Math.min(nearestPath, manhattan(chest, { x, y }));
    expect(nearestPath).toBeGreaterThanOrEqual(6);
  });

  it('places four enemy symbols drawing from both groups on open ground, away from the entrance', () => {
    const symbols = enemies(shore);
    expect(symbols).toHaveLength(4);
    for (const e of symbols) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.groupIds, label).toEqual(['grp_ruins_a', 'grp_mine_a']);
      for (const g of e.groupIds)
        expect(map_shore_path.meta.encounterGroups, `${label} group ${g}`).toContain(g);
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.tide, label).toBe('any');
      expect(e.condition, label).toBeUndefined();
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.sprite, label).toBeUndefined();
      expect(shoreGrid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan(cellOf(e), shoreEntrance), label).toBeGreaterThanOrEqual(6);
      // §5.12: the symbol wanders within `radius`, so most of that square must be open ground.
      expect(openShare(shoreGrid, cellOf(e), e.radius), `${label} wander area`).toBeGreaterThan(
        0.5,
      );
    }
    // One on the upper shelf, two on the middle one, one on the lower one.
    expect(symbols.filter((e) => e.ty <= 5)).toHaveLength(1);
    expect(symbols.filter((e) => e.ty >= 7 && e.ty <= 11)).toHaveLength(2);
    expect(symbols.filter((e) => e.ty >= 13)).toHaveLength(1);
    for (const src of map_shore_path.objects)
      if (src.type === 'enemy') {
        expect('condition' in src).toBe(false);
        expect('respawn_sec' in src).toBe(false);
      }
  });

  it('keeps every object on its own walkable tile, off the warps, reachable from the entrance', () => {
    const taken = new Set<string>();
    for (const o of blockers(shore)) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      expect(shoreGrid.isBlocked(o.tx, o.ty), label).toBe(false);
      expect(taken.has(cellKey(cellOf(o))), `${label} shares a tile`).toBe(false);
      taken.add(cellKey(cellOf(o)));
      expect(
        warps(shore).some((w) => inRect(w, cellOf(o))),
        `${label} sits on a warp`,
      ).toBe(false);
      expect(manhattan(cellOf(o), shoreEntrance), `${label} on the entrance`).toBeGreaterThan(0);
    }
    expect(shore.some((o) => o.kind === 'npc' || o.kind === 'trigger')).toBe(false);
    expect(shoreGridAtRuntime.isBlocked(shoreEntrance.x, shoreEntrance.y)).toBe(false);
    const reachable = reachableFrom(shoreGridAtRuntime, shoreEntrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    for (const o of shore) {
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
    for (let y = 0; y < map_shore_path.height; y++) {
      for (let x = 0; x < map_shore_path.width; x++) {
        if (shoreGridAtRuntime.isBlocked(x, y)) continue;
        expect(reached({ x, y }), `open tile (${x}, ${y}) is cut off from the road`).toBe(true);
      }
    }
  });

  it('uses the id conventions for its sign, chest and warps', () => {
    for (const o of shore) {
      if (o.kind === 'sign') expect(o.textId).toMatch(/^dlg_[a-z0-9_]+$/);
      if (o.kind === 'chest') expect(o.flag).toMatch(/^chest\.[a-z0-9_]+$/);
      if (o.kind === 'warp') expect(o.targetMap).toMatch(/^map_[a-z0-9_]+$/);
      if (o.kind === 'enemy') for (const g of o.groupIds) expect(g).toMatch(/^grp_[a-z0-9_]+$/);
    }
  });
});
