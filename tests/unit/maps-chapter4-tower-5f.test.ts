import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type {
  MapObject,
  NpcObject,
  SavePointObject,
  TriggerObject,
  WarpObject,
} from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry } from '@core/map/source';
import { normalizeLegendEntry } from '@core/map/source';
import { findTileLayer } from '@core/map/tiled';
import { findItem } from '@data/items';
import { map_lighthouse_5f } from '@data/maps/map_lighthouse_5f';
import { map_lighthouse_top } from '@data/maps/map_lighthouse_top';
import { tileGid } from '@data/tiles';

// docs/GAME_DESIGN.md §3.1 row map_lighthouse_5f, §5.12 symbols, §7.1 it_grandpa_letter,
// §8.2 grp_tower_d, §9.3 save_point heal/once_flag, obj_* NPC sprites and stacked
// examine-triggers, §13 #16 ev_tower_voice_5, #17 lighthouse.fountain_used, #20 the final
// save point. The map is tested directly here (not via MAP_SOURCES) so this file stands on
// its own while the floors below are authored alongside it.

interface Cell {
  x: number;
  y: number;
}

const FLOOR = 'map_lighthouse_5f';
const BELOW = 'map_lighthouse_4f';
const TOP = 'map_lighthouse_top';
const GROUPS = ['grp_tower_d'];
/** Tower stair contract (§3.1): the same four tiles on every floor. */
const LANDING: Cell = { x: 2, y: 22 };
const DOWN_STAIRS: Cell = { x: 2, y: 21 };
const UP_STAIRS: Cell = { x: 21, y: 2 };
const UP_LANDING: Cell = { x: 21, y: 3 };
/** Where the stairs up land on 灯台頂, with its stairs down directly behind. */
const TOP_LANDING: Cell = { x: 10, y: 12 };
const TOP_STAIRS: Cell = { x: 10, y: 13 };
/** The fountain alcove: the gate in its only gap, the fountain inside, the pedestal outside. */
const GATE: Cell = { x: 11, y: 14 };
const FOUNTAIN: Cell = { x: 11, y: 11 };
/** The tile the fountain is used from (facing up). */
const FOUNTAIN_STAND: Cell = { x: 11, y: 12 };
const PEDESTAL: Cell = { x: 12, y: 15 };
/** The tile the pedestal is examined from (facing up). */
const PEDESTAL_STAND: Cell = { x: 12, y: 16 };
const FINAL_SAVE: Cell = { x: 20, y: 3 };
/** Straight segments of the walk from the landing to the stairs up. */
const WALK: Cell[] = [
  { x: 2, y: 22 },
  { x: 3, y: 22 },
  { x: 3, y: 16 },
  { x: 21, y: 16 },
  { x: 21, y: 2 },
];
/** Landing → pedestal → fountain → stairs up, once the gate is gone. */
const FOUNTAIN_WALK: Cell[] = [
  { x: 2, y: 22 },
  { x: 3, y: 22 },
  { x: 3, y: 16 },
  { x: 12, y: 16 },
  { x: 11, y: 16 },
  { x: 11, y: 12 },
  { x: 11, y: 16 },
  { x: 21, y: 16 },
  { x: 21, y: 2 },
];

const src = map_lighthouse_5f;
const compiled = compileMap(src);
const objects = parseMapObjects(compiled);
const grid = CollisionGrid.fromMap(compiled);
const { entrance } = src.meta;

const cellKey = (c: Cell): string => `${c.x},${c.y}`;
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const neighbours = (c: Cell): Cell[] => [
  { x: c.x + 1, y: c.y },
  { x: c.x - 1, y: c.y },
  { x: c.x, y: c.y + 1 },
  { x: c.x, y: c.y - 1 },
];
const inRect = (o: Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>, c: Cell): boolean =>
  c.x >= o.tx && c.x < o.tx + o.tw && c.y >= o.ty && c.y < o.ty + o.th;

const ofKind = <K extends MapObject['kind']>(kind: K): Extract<MapObject, { kind: K }>[] =>
  objects.filter((o): o is Extract<MapObject, { kind: K }> => o.kind === kind);

/**
 * Cells WorldScene blocks at runtime: NPCs (gated ones only while `withGated`), chests,
 * signs, save points and examine-triggers.
 */
const blockers = (withGated: boolean): Cell[] =>
  objects
    .filter(
      (o) =>
        (o.kind === 'npc' &&
          (withGated || (o.hiddenIf === undefined && o.condition === undefined))) ||
        o.kind === 'chest' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'trigger' && o.interact),
    )
    .map((o) => ({ x: o.tx, y: o.ty }));
/** Walkability with the gate still barring the alcove. */
const withGate = (): CollisionGrid => grid.withBlocked(blockers(true));
/** Walkability once the fountain is awake and the gate gone. */
const gateOpen = (): CollisionGrid => grid.withBlocked(blockers(false));

/** Name of the ground tile the ASCII source places at `c`. */
function groundAt(c: Cell): string | undefined {
  const ch = [...(src.tiles[c.y] ?? '')][c.x];
  const entry: LegendEntry | undefined =
    ch === undefined || src.legend[ch] === undefined
      ? undefined
      : normalizeLegendEntry(src.legend[ch]!);
  return entry?.ground;
}
/** Gid the compiled map draws at `c` in the given tile layer (0 = empty). */
const gidAt = (layer: string, c: Cell): number =>
  findTileLayer(compiled, layer)?.data[c.y * compiled.width + c.x] ?? 0;
/** Whether the named placeholder tile is drawn at `c` in the ground or deco layer. */
const hasTile = (c: Cell, name: string): boolean =>
  gidAt('ground', c) === tileGid(name) || gidAt('deco', c) === tileGid(name);

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

/** Whether `c` can be stood on, or stood next to (for a blocking sprite), from `start`. */
const approachable = (reach: Set<string>, c: Cell): boolean =>
  reach.has(cellKey(c)) || neighbours(c).some((n) => reach.has(cellKey(n)));

/** Every cell on the straight line from `a` to `b` (same row or column), inclusive. */
function segment(a: Cell, b: Cell): Cell[] {
  expect(a.x === b.x || a.y === b.y, `segment ${cellKey(a)} → ${cellKey(b)} is not straight`).toBe(
    true,
  );
  const cells: Cell[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (let c = { ...a }; ; c = { x: c.x + dx, y: c.y + dy }) {
    cells.push(c);
    if (c.x === b.x && c.y === b.y) break;
  }
  return cells;
}

const warpTo = (map: string): WarpObject => {
  const w = ofKind('warp').find((o) => o.targetMap === map);
  expect(w, `warp → ${map}`).toBeDefined();
  return w!;
};
const triggersFor = (eventId: string): TriggerObject[] =>
  ofKind('trigger').filter((o) => o.eventId === eventId);
const triggerFor = (eventId: string): TriggerObject => {
  const t = triggersFor(eventId);
  expect(t, `${eventId} trigger`).toHaveLength(1);
  return t[0]!;
};
const gate = (): NpcObject => {
  const n = ofKind('npc').find((o) => o.id === 'npc_tower_fountain_gate');
  expect(n, 'npc_tower_fountain_gate').toBeDefined();
  return n!;
};
const saveAt = (c: Cell): SavePointObject => {
  const s = ofKind('save_point').find((o) => o.tx === c.x && o.ty === c.y);
  expect(s, `save point at ${cellKey(c)}`).toBeDefined();
  return s!;
};

describe('灯台の塔 5F（灯室前） (map_lighthouse_5f)', () => {
  it('is a 24x24 dungeon floor on the tower backdrop with the d group and no free saving', () => {
    expect(src.width).toBe(24);
    expect(src.height).toBe(24);
    expect(src.tiles).toHaveLength(24);
    for (const row of src.tiles) expect([...row]).toHaveLength(24);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toEqual({
      id: FLOOR,
      displayName: '灯台の塔 5F（灯室前）',
      kind: 'dungeon',
      bgmKey: 'bgm_lighthouse',
      battleBgKey: 'bg_lighthouse',
      encounterGroups: GROUPS,
      tilesets: ['ts_placeholder'],
      entrance: { x: 2, y: 22, facing: 'down' },
      canSaveAnywhere: false,
    });
    expect(compiled.width).toBe(24);
    expect(compiled.height).toBe(24);
  });

  it('starts the player on the landing below the stairs down, walkable and sprite-free', () => {
    expect(entrance).toEqual({ ...LANDING, facing: 'down' });
    expect(grid.isBlocked(LANDING.x, LANDING.y)).toBe(false);
    expect(withGate().isBlocked(LANDING.x, LANDING.y)).toBe(false);
    // Only the voice trigger sits on the landing.
    const onLanding = objects.filter((o) => inRect(o, LANDING));
    expect(onLanding).toHaveLength(1);
    expect(onLanding[0]!.kind).toBe('trigger');
  });

  it('keeps the stair contract: (2, 21) down to 4F, (21, 2) up to 灯台頂, both stairs tiles', () => {
    expect(ofKind('warp')).toHaveLength(2);
    const down = warpTo(BELOW);
    const up = warpTo(TOP);
    expect(down).toMatchObject({
      tx: DOWN_STAIRS.x,
      ty: DOWN_STAIRS.y,
      tw: 1,
      th: 1,
      targetMap: BELOW,
      targetX: UP_LANDING.x,
      targetY: UP_LANDING.y,
      facing: 'down',
    });
    expect(up).toMatchObject({
      tx: UP_STAIRS.x,
      ty: UP_STAIRS.y,
      tw: 1,
      th: 1,
      targetMap: TOP,
      targetX: TOP_LANDING.x,
      targetY: TOP_LANDING.y,
      facing: 'up',
    });
    for (const w of [down, up]) {
      const label = `stairs at (${w.tx}, ${w.ty})`;
      expect(w.requiredItem, label).toBeUndefined();
      expect(w.doorFlag, label).toBeUndefined();
      expect(groundAt({ x: w.tx, y: w.ty }), label).toBe('stairs');
      expect(grid.isBlocked(w.tx, w.ty), label).toBe(false);
    }
    // Only the two stairs are stairs tiles.
    const stairs: Cell[] = [];
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++)
        if (groundAt({ x, y }) === 'stairs') stairs.push({ x, y });
    expect(stairs.map(cellKey).sort()).toEqual([cellKey(DOWN_STAIRS), cellKey(UP_STAIRS)].sort());
  });

  it('puts each return stairs directly behind its landing, both landings open', () => {
    // Arriving from above faces down, so the stairs down are the tile above the landing.
    expect(manhattan(DOWN_STAIRS, LANDING)).toBe(1);
    expect(DOWN_STAIRS).toEqual({ x: LANDING.x, y: LANDING.y - 1 });
    // 4F's stairs up (and 灯台頂's stairs down) land on (21, 3) facing down, so the stairs
    // up are the tile above it.
    expect(manhattan(UP_STAIRS, UP_LANDING)).toBe(1);
    expect(UP_STAIRS).toEqual({ x: UP_LANDING.x, y: UP_LANDING.y - 1 });
    expect(grid.isBlocked(UP_LANDING.x, UP_LANDING.y)).toBe(false);
    expect(withGate().isBlocked(UP_LANDING.x, UP_LANDING.y)).toBe(false);
    // Nothing at all sits on the upper landing: arriving from the lamp room fires nothing.
    expect(objects.some((o) => inRect(o, UP_LANDING))).toBe(false);
  });

  it('meets 灯台頂 half way: lands above its stairs down, which land back below ours', () => {
    const topObjects = parseMapObjects(compileMap(map_lighthouse_top));
    const topGrid = CollisionGrid.fromMap(compileMap(map_lighthouse_top));
    expect(map_lighthouse_top.meta.entrance).toEqual({ ...TOP_LANDING, facing: 'up' });
    expect(topGrid.isBlocked(TOP_LANDING.x, TOP_LANDING.y)).toBe(false);
    // Facing up on arrival, the stairs down are directly behind (below) the landing.
    const back = topObjects.find((o) => o.kind === 'warp' && o.targetMap === FLOOR);
    expect(back).toMatchObject({
      tx: TOP_STAIRS.x,
      ty: TOP_STAIRS.y,
      targetX: UP_LANDING.x,
      targetY: UP_LANDING.y,
      facing: 'down',
    });
    expect(TOP_STAIRS).toEqual({ x: TOP_LANDING.x, y: TOP_LANDING.y + 1 });
  });

  it('fires the floor voice once, on the landing, and nothing else by stepping', () => {
    const stepOn = ofKind('trigger').filter((t) => !t.interact);
    expect(stepOn).toHaveLength(1);
    const t = triggerFor('ev_tower_voice_5');
    expect(t).toMatchObject({
      tx: LANDING.x,
      ty: LANDING.y,
      tw: 1,
      th: 1,
      eventId: 'ev_tower_voice_5',
      once: true,
      interact: false,
    });
    expect(t.condition).toBeUndefined();
  });

  it('bars the alcove with the iron gate until the fountain wakes (§9.3 obj_gate)', () => {
    expect(ofKind('npc')).toHaveLength(1);
    const g = gate();
    expect(g).toMatchObject({
      tx: GATE.x,
      ty: GATE.y,
      tw: 1,
      th: 1,
      id: 'npc_tower_fountain_gate',
      dialog: 'dlg_tower_gate',
      facing: 'down',
      sprite: 'obj_gate',
      move: 'static',
      hiddenIf: 'lighthouse.fountain_awake',
    });
    expect(g.condition).toBeUndefined();
    expect(g.shop).toBeUndefined();
    expect(() => validateCondition(g.hiddenIf!)).not.toThrow();
    // It stands in a one-tile gap of the alcove wall: walls either side, floor before and behind.
    expect(grid.isBlocked(GATE.x, GATE.y)).toBe(false);
    expect(grid.isBlocked(GATE.x - 1, GATE.y)).toBe(true);
    expect(grid.isBlocked(GATE.x + 1, GATE.y)).toBe(true);
    expect(grid.isBlocked(GATE.x, GATE.y - 1)).toBe(false);
    expect(grid.isBlocked(GATE.x, GATE.y + 1)).toBe(false);
  });

  it('has the fountain (full heal, once) inside the alcove and the final save point by the stairs up', () => {
    expect(ofKind('save_point')).toHaveLength(2);
    const fountain = saveAt(FOUNTAIN);
    expect(fountain).toMatchObject({
      tx: FOUNTAIN.x,
      ty: FOUNTAIN.y,
      tw: 1,
      th: 1,
      heal: true,
      onceFlag: 'lighthouse.fountain_used',
    });
    expect(grid.isBlocked(FOUNTAIN.x, FOUNTAIN.y)).toBe(false);
    // It stands in a basin: water on three sides, the stand tile open in front of it.
    for (const c of [
      { x: FOUNTAIN.x - 1, y: FOUNTAIN.y },
      { x: FOUNTAIN.x + 1, y: FOUNTAIN.y },
      { x: FOUNTAIN.x, y: FOUNTAIN.y - 1 },
    ]) {
      expect(hasTile(c, 'water'), `basin ${cellKey(c)}`).toBe(true);
      expect(grid.isBlocked(c.x, c.y), `basin ${cellKey(c)}`).toBe(true);
    }
    expect(FOUNTAIN_STAND).toEqual({ x: FOUNTAIN.x, y: FOUNTAIN.y + 1 });
    expect(gateOpen().isBlocked(FOUNTAIN_STAND.x, FOUNTAIN_STAND.y)).toBe(false);

    const final = saveAt(FINAL_SAVE);
    expect(final).toMatchObject({ tx: FINAL_SAVE.x, ty: FINAL_SAVE.y, heal: false });
    expect(final.onceFlag).toBeUndefined();
    expect(grid.isBlocked(FINAL_SAVE.x, FINAL_SAVE.y)).toBe(false);
    // Beside the landing from the lamp room, off the landing itself and off the stairs.
    expect(manhattan(FINAL_SAVE, UP_LANDING)).toBe(1);
    expect(manhattan(FINAL_SAVE, UP_STAIRS)).toBeLessThanOrEqual(2);
    expect(FINAL_SAVE).not.toEqual(UP_LANDING);
    expect(FINAL_SAVE).not.toEqual(UP_STAIRS);
  });

  it('stacks the two examine-triggers of the pedestal on one stele tile beside the gate', () => {
    const wake = triggerFor('ev_tower_fountain_wake');
    const sealed = triggerFor('ev_tower_fountain_sealed');
    expect(wake).toMatchObject({
      tx: PEDESTAL.x,
      ty: PEDESTAL.y,
      tw: 1,
      th: 1,
      once: true,
      condition: 'item.it_grandpa_letter>=1',
      interact: true,
    });
    expect(sealed).toMatchObject({
      tx: PEDESTAL.x,
      ty: PEDESTAL.y,
      tw: 1,
      th: 1,
      once: false,
      condition: 'item.it_grandpa_letter<1',
      interact: true,
    });
    for (const t of [wake, sealed]) expect(() => validateCondition(t.condition!)).not.toThrow();
    expect(findItem('it_grandpa_letter')).toBeDefined();
    // The wake-up comes first so it wins as soon as the letter is in the bag (§9.3).
    const order = ofKind('trigger').filter((t) => t.tx === PEDESTAL.x && t.ty === PEDESTAL.y);
    expect(order.map((t) => t.eventId)).toEqual([
      'ev_tower_fountain_wake',
      'ev_tower_fountain_sealed',
    ]);
    // These two are the only examine-triggers on the floor.
    expect(ofKind('trigger').filter((t) => t.interact)).toHaveLength(2);
    // A stele on the floor, solid, next to the tile in front of the gate but outside the alcove.
    expect(hasTile(PEDESTAL, 'stele')).toBe(true);
    expect(grid.isBlocked(PEDESTAL.x, PEDESTAL.y)).toBe(true);
    expect(manhattan(PEDESTAL, { x: GATE.x, y: GATE.y + 1 })).toBe(1);
    expect(PEDESTAL.y).toBeGreaterThan(GATE.y);
    expect(PEDESTAL_STAND).toEqual({ x: PEDESTAL.x, y: PEDESTAL.y + 1 });
    expect(withGate().isBlocked(PEDESTAL_STAND.x, PEDESTAL_STAND.y)).toBe(false);
  });

  it('seals the fountain behind the gate while the pedestal stays within reach', () => {
    const barred = reachableFrom(withGate(), entrance);
    expect(approachable(barred, FOUNTAIN)).toBe(false);
    expect(barred.has(cellKey(FOUNTAIN_STAND))).toBe(false);
    expect(barred.has(cellKey(PEDESTAL_STAND))).toBe(true);
    expect(approachable(barred, PEDESTAL)).toBe(true);
    // The gate itself can be talked to from the tile in front of it.
    expect(barred.has(cellKey({ x: GATE.x, y: GATE.y + 1 }))).toBe(true);
    // The rest of the floor, including the stairs up and the final save point, is open.
    expect(barred.has(cellKey(UP_STAIRS))).toBe(true);
    expect(approachable(barred, FINAL_SAVE)).toBe(true);
    // With the gate gone the fountain is used from its stand tile.
    const open = reachableFrom(gateOpen(), entrance);
    expect(open.has(cellKey(GATE))).toBe(true);
    expect(open.has(cellKey(FOUNTAIN_STAND))).toBe(true);
    expect(approachable(open, FOUNTAIN)).toBe(true);
    // The gate's gap is the only way in: with it blocked again nothing inside is reached.
    const resealed = reachableFrom(gateOpen().withBlocked([GATE]), entrance);
    expect(approachable(resealed, FOUNTAIN)).toBe(false);
  });

  it('has the floor sign in the stair turret and no chests', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 2, ty: 19, textId: 'dlg_sign_tower_5f' });
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, LANDING)).toBeLessThanOrEqual(3);
    expect(grid.isBlocked(signs[0]!.tx, signs[0]!.ty)).toBe(false);
    expect(ofKind('chest')).toHaveLength(0);
  });

  it('places two symbols of the d group on open ground, away from the landing and the stairs up', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(2);
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.groupIds, label).toEqual(GROUPS);
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.tide, label).toBe('any');
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan({ x: e.tx, y: e.ty }, LANDING), label).toBeGreaterThanOrEqual(6);
      expect(manhattan({ x: e.tx, y: e.ty }, UP_STAIRS), label).toBeGreaterThan(1);
      expect(manhattan({ x: e.tx, y: e.ty }, UP_LANDING), label).toBeGreaterThan(1);
      // Outside the alcove.
      expect(e.tx < 8 || e.tx > 14 || e.ty < 8 || e.ty > 14, label).toBe(true);
    }
  });

  it('keeps the walks open: landing → stairs up, and landing → pedestal → fountain → stairs up', () => {
    const barred = withGate();
    for (let i = 1; i < WALK.length; i++) {
      for (const c of segment(WALK[i - 1]!, WALK[i]!)) {
        expect(barred.isBlocked(c.x, c.y), `walk tile ${cellKey(c)}`).toBe(false);
      }
    }
    const open = gateOpen();
    for (let i = 1; i < FOUNTAIN_WALK.length; i++) {
      for (const c of segment(FOUNTAIN_WALK[i - 1]!, FOUNTAIN_WALK[i]!)) {
        expect(open.isBlocked(c.x, c.y), `fountain walk tile ${cellKey(c)}`).toBe(false);
      }
    }
    // The fountain walk stops on the pedestal's and the fountain's stand tiles and passes
    // through the gate's gap; neither walk crosses the stairs down.
    expect(FOUNTAIN_WALK).toContainEqual(PEDESTAL_STAND);
    expect(FOUNTAIN_WALK).toContainEqual(FOUNTAIN_STAND);
    const crossed = (walk: Cell[]): Cell[] =>
      walk.slice(1).flatMap((c, i) => segment(walk[i]!, c).slice(1));
    expect(crossed(FOUNTAIN_WALK)).toContainEqual(GATE);
    for (const walk of [WALK, FOUNTAIN_WALK]) {
      expect(crossed(walk).some((c) => c.x === DOWN_STAIRS.x && c.y === DOWN_STAIRS.y)).toBe(false);
    }
  });

  it('reaches every object and both stairs from the landing, each sprite on its own tile', () => {
    // The gate is a gated NPC, so it is left out here as in the registry-wide sweep.
    const rt = gateOpen();
    const reachable = reachableFrom(rt, entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    const taken = new Map<string, string>();
    for (const o of objects) {
      const cell = { x: o.tx, y: o.ty };
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (
        o.kind === 'chest' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        o.kind === 'npc' ||
        (o.kind === 'trigger' && o.interact)
      ) {
        expect(neighbours(cell).some(reached), `${label} cannot be approached`).toBe(true);
        const other = taken.get(cellKey(cell));
        if (!(o.kind === 'trigger' && other === 'trigger')) {
          expect(other, `${label} shares its tile with ${other}`).toBeUndefined();
        }
        taken.set(cellKey(cell), o.kind);
        expect(
          ofKind('warp').some((w) => inRect(w, cell)),
          `${label} sits on the stairs`,
        ).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
    // No dead pockets: every walkable tile of the floor can be reached from the landing.
    for (let y = 0; y < compiled.height; y++) {
      for (let x = 0; x < compiled.width; x++) {
        if (rt.isBlocked(x, y)) continue;
        expect(reached({ x, y }), `walkable tile (${x}, ${y}) is cut off`).toBe(true);
      }
    }
  });
});
