import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { ChestObject, MapObject, TriggerObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { TideLevel } from '@core/map/source';
import { TIDE_LEVELS } from '@core/map/source';
import { collisionForTide, tideAllows } from '@core/map/tide';
import { findTileLayer } from '@core/map/tiled';
import { map_sunken_ruins_1f } from '@data/maps/map_sunken_ruins_1f';
import { tileGid } from '@data/tiles';

// docs/GAME_DESIGN.md §3.1 row map_sunken_ruins_1f, §3.2 潮の干満ギミック, §5.12 symbols,
// §9.3 tide layers and objects, §13 #11-14. The map is tested directly here (not via
// MAP_SOURCES) so this file stands on its own.

interface Cell {
  x: number;
  y: number;
}

const RUINS_1F = 'map_sunken_ruins_1f';
const CAMP = 'map_ruins_camp';
const RUINS_B1 = 'map_sunken_ruins_b1';
const RUINS_GROUPS = new Set(['grp_ruins_a', 'grp_ruins_b', 'grp_ruins_c']);

// The coordinate contract shared with the camp, the lower floor and the chapter 3 script.
const ENTRANCE: Cell = { x: 22, y: 1 };
const NORTH_EXIT: Cell = { x: 22, y: 0 };
const STAIRS_1: Cell = { x: 41, y: 6 };
const LANDING_1: Cell = { x: 41, y: 7 };
const STAIRS_2: Cell = { x: 42, y: 31 };
const LANDING_2: Cell = { x: 42, y: 32 };
const STELE_A: Cell = { x: 20, y: 3 };
const STELE_A_FROM: Cell = { x: 20, y: 4 };
const STELE_B: Cell = { x: 41, y: 9 };
const STELE_B_FROM: Cell = { x: 41, y: 8 };
const BARRIER: Cell[] = [
  { x: 31, y: 3 },
  { x: 31, y: 4 },
];
const CORRIDOR: Cell = { x: 33, y: 3 };
const THROAT: Cell = { x: 22, y: 8 };
const HALL_CENTRE: Cell = { x: 22, y: 15 };
const CHANNEL: Cell = { x: 40, y: 24 };

const src = map_sunken_ruins_1f;
const compiled = compileMap(src);
const objects = parseMapObjects(compiled);
const { entrance } = src.meta;
/** The common collision layer alone (what the generic map rules walk over). */
const plain = CollisionGrid.fromMap(compiled);
/** `collision` ∪ `collision_<tide>`, what WorldScene walks over at that tide. */
const grids: Record<TideLevel, CollisionGrid> = {
  high: collisionForTide(compiled, 'high'),
  low: collisionForTide(compiled, 'low'),
};

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

const ofKind = <K extends MapObject['kind']>(kind: K): Extract<MapObject, { kind: K }>[] =>
  objects.filter((o): o is Extract<MapObject, { kind: K }> => o.kind === kind);

/**
 * Blocking sprites WorldScene adds to the grid: NPCs, signs, save points, examine-triggers
 * and the chests that are visible at the tide (a chest with a `tide` is under water at
 * the other one). 'plain' blocks every chest, as the generic map rules do.
 */
const blockersAt = (tide: TideLevel | 'plain'): Cell[] =>
  objects
    .filter(
      (o) =>
        o.kind === 'npc' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'chest' && (tide === 'plain' || tideAllows(o.tide, tide))) ||
        (o.kind === 'trigger' && o.interact),
    )
    .map(cellOf);
const runtimeGrid = (tide: TideLevel): CollisionGrid => grids[tide].withBlocked(blockersAt(tide));
const plainRuntime = (): CollisionGrid => plain.withBlocked(blockersAt('plain'));

type LayerName =
  | 'ground'
  | 'deco'
  | 'collision'
  | 'collision_high'
  | 'collision_low'
  | 'deco_water_high'
  | 'deco_water_low';
/** Gid the compiled map holds at `c` in the given tile layer (0 = empty). */
const gidAt = (layer: LayerName, c: Cell): number =>
  findTileLayer(compiled, layer)?.data[c.y * compiled.width + c.x] ?? 0;
/** Whether the named placeholder tile is drawn at `c` in the ground or deco layer. */
const hasTile = (c: Cell, name: string): boolean =>
  gidAt('ground', c) === tileGid(name) || gidAt('deco', c) === tileGid(name);
/** Whether `c` is flooded at high tide (§3.2: drawn as water in `deco_water_high`). */
const floodedAtHigh = (c: Cell): boolean => gidAt('deco_water_high', c) === tileGid('water');
/** Cells of a tile layer holding a non-empty gid. */
const cellsOf = (layer: LayerName): Cell[] => {
  const data = findTileLayer(compiled, layer)?.data ?? [];
  const cells: Cell[] = [];
  data.forEach((gid, i) => {
    if (gid !== 0) cells.push({ x: i % compiled.width, y: Math.floor(i / compiled.width) });
  });
  return cells;
};

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

const warpAt = (c: Cell): WarpObject => {
  const w = ofKind('warp').find((o) => sameCell(cellOf(o), c));
  expect(w, `warp at ${cellKey(c)}`).toBeDefined();
  return w!;
};
const chestByFlag = (flag: string): ChestObject => {
  const c = ofKind('chest').find((o) => o.flag === flag);
  expect(c, `chest ${flag}`).toBeDefined();
  return c!;
};
const triggersAt = (c: Cell): TriggerObject[] =>
  ofKind('trigger').filter((t) => sameCell(cellOf(t), c));

/** A tide stele (§3.2): a solid stele tile with the two stacked examine-triggers on it. */
function expectStele(cell: Cell, from: Cell, label: string): void {
  expect(hasTile(cell, 'stele'), `${label} stele tile`).toBe(true);
  expect(plain.isBlocked(cell.x, cell.y), `${label} is solid`).toBe(true);
  const triggers = triggersAt(cell);
  expect(triggers.map((t) => t.eventId)).toEqual([
    'ev_ruins_stele_unreadable',
    'ev_ruins_tide_toggle',
  ]);
  expect(triggers[0]).toMatchObject({
    tw: 1,
    th: 1,
    once: false,
    interact: true,
    condition: '!ruins.tide_learned',
  });
  expect(triggers[1]).toMatchObject({
    tw: 1,
    th: 1,
    once: false,
    interact: true,
    condition: 'ruins.tide_learned',
  });
  for (const t of triggers) expect(() => validateCondition(t.condition!)).not.toThrow();
  // The tile it is examined from is plain floor, open at every tide and free of objects.
  expect(
    sameCell(
      from,
      neighbours(cell).find((n) => sameCell(n, from))!,
    ),
  ).toBe(true);
  expect(gidAt('ground', from)).toBe(tileGid('floor_stone'));
  expect(gidAt('deco', from)).toBe(0);
  for (const tide of TIDE_LEVELS) {
    expect(runtimeGrid(tide).isBlocked(from.x, from.y), `${label} examine tile at ${tide}`).toBe(
      false,
    );
  }
  expect(
    objects.some((o) => sameCell(cellOf(o), from)),
    `${label} examine tile holds an object`,
  ).toBe(false);
}

describe('沈んだ遺跡 上層 (map_sunken_ruins_1f)', () => {
  it('is a 45x35 tide-aware dungeon with the ruins encounter groups and no free saving', () => {
    expect(src.width).toBe(45);
    expect(src.height).toBe(35);
    expect(src.tiles).toHaveLength(35);
    for (const row of src.tiles) expect([...row]).toHaveLength(45);
    for (const tide of TIDE_LEVELS) {
      const rows = src.tide?.[tide];
      expect(rows, `tide.${tide}`).toHaveLength(35);
      for (const row of rows ?? []) expect([...row]).toHaveLength(45);
    }
    expect(src.meta).toMatchObject({
      id: RUINS_1F,
      displayName: '沈んだ遺跡 上層',
      kind: 'dungeon',
      bgmKey: 'bgm_ruins',
      battleBgKey: 'bg_ruins',
      encounterGroups: ['grp_ruins_a', 'grp_ruins_b', 'grp_ruins_c'],
      tilesets: ['ts_placeholder'],
      entrance: { x: 22, y: 1, facing: 'down' },
      canSaveAnywhere: false,
      tideAware: true,
    });
  });

  it('compiles the tide layers: water only at high tide, the fence only at low tide', () => {
    // High tide floods cells with water; every flooded cell blocks and nothing else does.
    const water = cellsOf('deco_water_high');
    expect(water.length).toBeGreaterThan(100);
    for (const c of water) expect(gidAt('deco_water_high', c)).toBe(tileGid('water'));
    expect(cellsOf('collision_high').map(cellKey).sort()).toEqual(water.map(cellKey).sort());
    // Low tide raises the fence in the north passage's opening, and nothing else.
    const fence = cellsOf('deco_water_low');
    expect(fence.map(cellKey).sort()).toEqual(BARRIER.map(cellKey).sort());
    for (const c of fence) expect(gidAt('deco_water_low', c)).toBe(tileGid('fence'));
    expect(cellsOf('collision_low').map(cellKey).sort()).toEqual(BARRIER.map(cellKey).sort());
    // The common layers never contain a tide cell: each stands on walkable ground.
    for (const c of [...water, ...fence]) {
      expect(gidAt('collision', c), `common collision at ${cellKey(c)}`).toBe(0);
      expect(gidAt('deco', c), `common deco at ${cellKey(c)}`).toBe(0);
    }
    // The hall, its opening and the channel are flooded; the vestibule, the passage, the
    // throat and the ledge are not.
    for (const c of [HALL_CENTRE, { x: 34, y: 20 }, CHANNEL]) {
      expect(floodedAtHigh(c), `${cellKey(c)} flooded`).toBe(true);
    }
    for (const c of [ENTRANCE, STELE_A_FROM, THROAT, CORRIDOR, LANDING_1, LANDING_2, ...BARRIER]) {
      expect(floodedAtHigh(c), `${cellKey(c)} dry`).toBe(false);
    }
  });

  it('starts the player below the north exit, facing down, on a tile open at every tide', () => {
    expect(entrance).toEqual({ ...ENTRANCE, facing: 'down' });
    for (const tide of TIDE_LEVELS) {
      expect(runtimeGrid(tide).isBlocked(entrance.x, entrance.y), `entrance at ${tide}`).toBe(
        false,
      );
    }
    // Nothing spawns next to the way in (§5.12: symbols keep 6+ tiles away, see below).
    expect(objects.some((o) => o.kind !== 'warp' && sameCell(cellOf(o), ENTRANCE))).toBe(false);
  });

  it('links the north edge to the camp and both stairs to the lower floor', () => {
    expect(ofKind('warp')).toHaveLength(3);
    expect(warpAt(NORTH_EXIT)).toMatchObject({
      tw: 1,
      th: 1,
      targetMap: CAMP,
      targetX: 10,
      targetY: 13,
      facing: 'up',
    });
    expect(warpAt(STAIRS_1)).toMatchObject({
      tw: 1,
      th: 1,
      targetMap: RUINS_B1,
      targetX: 3,
      targetY: 3,
      facing: 'down',
    });
    expect(warpAt(STAIRS_2)).toMatchObject({
      tw: 1,
      th: 1,
      targetMap: RUINS_B1,
      targetX: 42,
      targetY: 31,
      facing: 'down',
    });
    for (const w of ofKind('warp')) {
      expect(w.requiredItem, `warp at ${cellKey(cellOf(w))}`).toBeUndefined();
      expect(w.doorFlag, `warp at ${cellKey(cellOf(w))}`).toBeUndefined();
    }
    // The edge exit is directly behind the entrance; the stairs are stairs tiles with their
    // landings (where the lower floor's stairs up arrive) directly below them.
    expect(NORTH_EXIT).toEqual({ x: ENTRANCE.x, y: ENTRANCE.y - 1 });
    expect(hasTile(NORTH_EXIT, 'stairs')).toBe(false);
    for (const [stairs, landing] of [
      [STAIRS_1, LANDING_1],
      [STAIRS_2, LANDING_2],
    ] as const) {
      expect(hasTile(stairs, 'stairs'), `stairs at ${cellKey(stairs)}`).toBe(true);
      expect(landing).toEqual({ x: stairs.x, y: stairs.y + 1 });
      for (const tide of TIDE_LEVELS) {
        expect(runtimeGrid(tide).isBlocked(stairs.x, stairs.y), `stairs at ${tide}`).toBe(false);
        expect(runtimeGrid(tide).isBlocked(landing.x, landing.y), `landing at ${tide}`).toBe(false);
      }
      expect(
        objects.some((o) => sameCell(cellOf(o), landing)),
        `object on the landing`,
      ).toBe(false);
    }
  });

  it('puts stele A in the vestibule at (20, 3), examined from (20, 4) facing up', () => {
    expectStele(STELE_A, STELE_A_FROM, 'stele A');
    expect(STELE_A_FROM).toEqual({ x: STELE_A.x, y: STELE_A.y + 1 });
  });

  it('puts stele B beside stairs #1 at (41, 9), examined from (41, 8) facing down', () => {
    expectStele(STELE_B, STELE_B_FROM, 'stele B');
    expect(STELE_B_FROM).toEqual({ x: STELE_B.x, y: STELE_B.y - 1 });
    expect(manhattan(STELE_B, STAIRS_1)).toBeLessThanOrEqual(4);
    // The two steles are the only triggers on this floor.
    expect(ofKind('trigger')).toHaveLength(4);
    expect(
      ofKind('trigger').every((t) => sameCell(cellOf(t), STELE_A) || sameCell(cellOf(t), STELE_B)),
    ).toBe(true);
  });

  it('at high tide reaches stairs #1 through the north passage while the hall is under water', () => {
    const reached = reachableFrom(runtimeGrid('high'), ENTRANCE);
    const has = (c: Cell): boolean => reached.has(cellKey(c));
    expect(has(STAIRS_1), 'stairs #1').toBe(true);
    expect(has(LANDING_1), 'landing #1').toBe(true);
    expect(has(STELE_B_FROM), 'stele B examine tile').toBe(true);
    for (const c of BARRIER) expect(has(c), `opening ${cellKey(c)} open`).toBe(true);
    expect(approachable(reached, cellOf(chestByFlag('chest.ruins_1f_02'))), 'pier chest').toBe(
      true,
    );
    // The way down into the hall is clear up to the water's edge, and no further.
    expect(has(THROAT), 'throat').toBe(true);
    expect(has(HALL_CENTRE), 'hall').toBe(false);
    expect(has(CHANNEL), 'channel').toBe(false);
    expect(has(STAIRS_2), 'stairs #2').toBe(false);
    expect(has(LANDING_2), 'ledge').toBe(false);
    for (const flag of ['chest.ruins_1f_01', 'chest.ruins_1f_03']) {
      expect(approachable(reached, cellOf(chestByFlag(flag))), flag).toBe(false);
    }
  });

  it('at low tide reaches stairs #2 through the hall and the channel while the fence seals the passage', () => {
    const reached = reachableFrom(runtimeGrid('low'), ENTRANCE);
    const has = (c: Cell): boolean => reached.has(cellKey(c));
    expect(has(THROAT), 'throat').toBe(true);
    expect(has(HALL_CENTRE), 'hall').toBe(true);
    expect(has(CHANNEL), 'channel').toBe(true);
    expect(has(STAIRS_2), 'stairs #2').toBe(true);
    expect(has(LANDING_2), 'ledge').toBe(true);
    for (const flag of ['chest.ruins_1f_01', 'chest.ruins_1f_03']) {
      expect(approachable(reached, cellOf(chestByFlag(flag))), flag).toBe(true);
    }
    for (const c of BARRIER) {
      expect(grids.low.isBlocked(c.x, c.y), `fence at ${cellKey(c)}`).toBe(true);
    }
    expect(has(CORRIDOR), 'corridor').toBe(false);
    expect(has(STAIRS_1), 'stairs #1').toBe(false);
    expect(has(LANDING_1), 'landing #1').toBe(false);
    expect(has(STELE_B_FROM), 'stele B examine tile').toBe(false);
  });

  it('never strands a player who comes up stairs #1 at low tide: stele B is in reach', () => {
    const reached = reachableFrom(runtimeGrid('low'), LANDING_1);
    expect(reached.has(cellKey(STELE_B_FROM))).toBe(true);
    expect(approachable(reached, STELE_B)).toBe(true);
    // ... and that is the only way out: the vestibule is sealed off by the fence.
    expect(reached.has(cellKey(ENTRANCE))).toBe(false);
    expect(reached.has(cellKey(STELE_A_FROM))).toBe(false);
    // Raising the tide from there opens the passage back to the vestibule.
    const afterToggle = reachableFrom(runtimeGrid('high'), LANDING_1);
    expect(afterToggle.has(cellKey(ENTRANCE))).toBe(true);
  });

  it('holds the three chests, the submerged ones only where low tide reaches', () => {
    const chests = ofKind('chest')
      .map((c) => ({ x: c.tx, y: c.ty, itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { x: 12, y: 10, itemId: 'it_potion_m', qty: 2, flag: 'chest.ruins_1f_01', tide: 'low' },
      { x: 34, y: 1, itemId: 'it_quake_stone', qty: 2, flag: 'chest.ruins_1f_02', tide: 'any' },
      { x: 36, y: 29, itemId: 'gold', qty: 500, flag: 'chest.ruins_1f_03', tide: 'low' },
    ]);
    const highReach = reachableFrom(runtimeGrid('high'), ENTRANCE);
    for (const c of ofKind('chest')) {
      const cell = cellOf(c);
      expect(plain.isBlocked(cell.x, cell.y), c.flag).toBe(false);
      if (c.tide === 'low') {
        // Under water at high tide, or on dry ground that high tide cuts off (the ledge).
        expect(floodedAtHigh(cell) || !approachable(highReach, cell), `${c.flag} at high`).toBe(
          true,
        );
      }
    }
    // The quake stones sit on the pier in the north passage, open at high tide.
    const pierChest = chestByFlag('chest.ruins_1f_02');
    expect(hasTile(cellOf(pierChest), 'pier')).toBe(true);
    expect(approachable(highReach, cellOf(pierChest))).toBe(true);
    // The hall chest sits on the hall floor; the gold chest on the ledge.
    expect(floodedAtHigh(cellOf(chestByFlag('chest.ruins_1f_01')))).toBe(true);
    expect(floodedAtHigh(cellOf(chestByFlag('chest.ruins_1f_03')))).toBe(false);
  });

  it('places four symbols in the ruins groups, each at its own tide and away from the entrance', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(4);
    const inHall = (c: Cell): boolean => c.x >= 11 && c.x <= 33 && c.y >= 9 && c.y <= 21;
    const inPassage = (c: Cell): boolean => c.x >= 31 && c.y <= 9;
    const onLedgeApproach = (c: Cell): boolean => c.x >= 35 && c.y >= 19;
    for (const e of enemies) {
      const cell = cellOf(e);
      const label = `enemy at ${cellKey(cell)}`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(e.groupIds.length, label).toBeGreaterThan(0);
      for (const g of e.groupIds) expect(RUINS_GROUPS.has(g), `${label} group ${g}`).toBe(true);
      expect(manhattan(cell, ENTRANCE), label).toBeGreaterThanOrEqual(6);
      // §3.2: spawns only at its tide, and never on a flooded tile at that tide.
      expect(e.tide === 'high' || e.tide === 'low', `${label} tide`).toBe(true);
      const tide: TideLevel = e.tide === 'high' ? 'high' : 'low';
      expect(runtimeGrid(tide).isBlocked(cell.x, cell.y), `${label} at ${tide}`).toBe(false);
      // §5.12: the symbol wanders within `radius`, so most of that square must be open at its tide.
      let open = 0;
      let total = 0;
      for (let dy = -e.radius; dy <= e.radius; dy++) {
        for (let dx = -e.radius; dx <= e.radius; dx++) {
          total += 1;
          if (!grids[tide].isBlocked(cell.x + dx, cell.y + dy)) open += 1;
        }
      }
      expect(open / total, `${label} wander area`).toBeGreaterThan(0.5);
    }
    // One high-tide symbol in the north passage, two low-tide ones in the hall, one on the way
    // to the ledge.
    const high = enemies.filter((e) => e.tide === 'high');
    const low = enemies.filter((e) => e.tide === 'low');
    expect(high).toHaveLength(1);
    expect(low).toHaveLength(3);
    expect(high.every((e) => inPassage(cellOf(e)))).toBe(true);
    expect(low.filter((e) => inHall(cellOf(e)))).toHaveLength(2);
    expect(low.filter((e) => onLedgeApproach(cellOf(e)))).toHaveLength(1);
    // Every ruins group appears on this floor.
    const used = new Set(enemies.flatMap((e) => e.groupIds));
    expect([...used].sort()).toEqual([...RUINS_GROUPS].sort());
  });

  it('has the entrance sign and the save point in the vestibule, and no NPCs', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 24, ty: 2, textId: 'dlg_sign_ruins_entrance' });
    expect(manhattan(cellOf(signs[0]!), ENTRANCE)).toBeLessThanOrEqual(3);
    const saves = ofKind('save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 17, ty: 2, heal: false });
    expect(saves[0]!.onceFlag).toBeUndefined();
    // Both stand in the vestibule, dry at every tide and off the straight line south.
    for (const o of [signs[0]!, saves[0]!]) {
      expect(o.ty, `${o.kind} row`).toBeLessThanOrEqual(6);
      expect(floodedAtHigh(cellOf(o))).toBe(false);
      expect(o.tx, `${o.kind} on the entrance column`).not.toBe(ENTRANCE.x);
    }
    expect(ofKind('npc')).toHaveLength(0);
  });

  it('reaches every warp and object over the common collision layer, each sprite on its own tile', () => {
    const runtime = plainRuntime();
    const reached = reachableFrom(runtime, ENTRANCE);
    const has = (c: Cell): boolean => reached.has(cellKey(c));
    const taken = new Set<string>();
    const warps = ofKind('warp');
    for (const o of objects) {
      const cell = cellOf(o);
      const label = `${o.kind} at ${cellKey(cell)}`;
      expect(o.tw, label).toBe(1);
      expect(o.th, label).toBe(1);
      if (o.kind === 'warp') {
        expect(has(cell), `${label} is unreachable`).toBe(true);
        continue;
      }
      expect(
        warps.some((w) => sameCell(cellOf(w), cell)),
        `${label} sits on a warp`,
      ).toBe(false);
      if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point') {
        expect(approachable(reached, cell), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
      } else if (o.kind === 'trigger') {
        expect(approachable(reached, cell), `${label} cannot be approached`).toBe(true);
      } else {
        expect(has(cell), `${label} is unreachable`).toBe(true);
      }
    }
    // No dead pockets: every walkable tile of the floor can be reached once the tide is ignored.
    for (let y = 0; y < compiled.height; y++) {
      for (let x = 0; x < compiled.width; x++) {
        if (runtime.isBlocked(x, y)) continue;
        expect(has({ x, y }), `walkable tile (${x}, ${y}) is cut off`).toBe(true);
      }
    }
  });
});
