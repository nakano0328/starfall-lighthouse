import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { MapObject, NpcObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry, MapSource } from '@core/map/source';
import { OVERLAY_EMPTY, normalizeLegendEntry } from '@core/map/source';
import { map_ruins_camp } from '@data/maps/map_ruins_camp';
import { map_shore_path } from '@data/maps/map_shore_path';
import type { Facing } from '@data/types';

/**
 * Chapter 3 camp (docs/GAME_DESIGN.md §3.1 row map_ruins_camp, §13 #11-12, §14
 * sq_old_chart): 学者のキャンプ sits between 磯の道 and 沈んだ遺跡 上層. The maps are
 * imported directly so this file does not depend on the registry in
 * src/data/maps/index.ts; the generic sweep in maps-data.test.ts covers them once they
 * are registered there. 沈んだ遺跡 上層 is authored separately: its north warp (22, 0)
 * is expected to land on (10, 13) here, facing up.
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

/** Every cell whose legend entry draws `tile` in any layer. */
function cellsWith(src: MapSource, tile: string): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const e = legendAt(src, x, y);
      if (e && (e.ground === tile || e.deco === tile || e.above === tile)) cells.push({ x, y });
    }
  }
  return cells;
}

const CAMP = 'map_ruins_camp';
const SHORE = 'map_shore_path';
const RUINS = 'map_sunken_ruins_1f';

const campMap = compileMap(map_ruins_camp);
const shoreMap = compileMap(map_shore_path);
const camp = parseMapObjects(campMap);
const shore = parseMapObjects(shoreMap);
const campGrid = CollisionGrid.fromMap(campMap);
const shoreGrid = CollisionGrid.fromMap(shoreMap);
const campEntrance: Cell = map_ruins_camp.meta.entrance;

const warps = (objects: MapObject[]): WarpObject[] =>
  objects.filter((o): o is WarpObject => o.kind === 'warp');
const npcs = (objects: MapObject[]): NpcObject[] =>
  objects.filter((o): o is NpcObject => o.kind === 'npc');
const blockers = (objects: MapObject[]): Blocker[] => objects.filter(isBlocker);
const npc = (id: string): NpcObject | undefined => npcs(camp).find((o) => o.id === id);

const campNorth = warps(camp).filter((w) => w.ty === 0);
const campSouth = warps(camp).filter((w) => w.ty === map_ruins_camp.height - 1);
const shoreSouth = warps(shore).find((w) => w.ty === map_shore_path.height - 1);
/** The walkability WorldScene uses at runtime: the collision layer plus every blocker. */
const campGridAtRuntime = campGrid.withBlocked(blockers(camp).map(cellOf));
const shoreGridAtRuntime = shoreGrid.withBlocked(blockers(shore).map(cellOf));

const scholar = npc('npc_ruins_scholar');
const merchant = npc('npc_merchant_camp');
const assistant = npc('npc_camp_assistant');
/** Where 沈んだ遺跡 上層's return warp lands (its contract with this map). */
const RUINS_LANDING: Cell = { x: 10, y: 13 };
const CAMPFIRE: Cell = { x: 9, y: 6 };

describe('学者のキャンプ (map_ruins_camp)', () => {
  it('is a 20x15 field map with no encounters, the ruins music and no free saving (§3.1)', () => {
    expect(map_ruins_camp.width).toBe(20);
    expect(map_ruins_camp.height).toBe(15);
    expect(map_ruins_camp.tiles).toHaveLength(15);
    for (const row of map_ruins_camp.tiles) expect([...row]).toHaveLength(20);
    expect(map_ruins_camp.meta).toEqual({
      id: CAMP,
      displayName: '学者のキャンプ',
      kind: 'field',
      bgmKey: 'bgm_ruins',
      battleBgKey: 'bg_ruins',
      encounterGroups: [],
      tilesets: ['ts_placeholder'],
      entrance: { x: 10, y: 1, facing: 'down' },
      canSaveAnywhere: false,
    });
    expect(map_ruins_camp.overlay).toBeUndefined();
    expect(map_ruins_camp.blocked).toBeUndefined();
    expect(map_ruins_camp.tide).toBeUndefined();
    expect(camp.filter((o) => o.kind === 'enemy')).toHaveLength(0);
  });

  it('has exactly two warps, the only open tiles on the north and south edges, and no door tiles', () => {
    expect(warps(camp)).toHaveLength(2);
    expect(campNorth).toHaveLength(1);
    expect(campSouth).toHaveLength(1);
    for (const w of warps(camp)) {
      expect(w.requiredItem).toBeUndefined();
      expect(w.lockedTextId).toBeUndefined();
      expect(w.doorFlag).toBeUndefined();
      for (const c of rectCells(w)) {
        expect(campGrid.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
        expect(groundTile(map_ruins_camp, c.x, c.y), cellKey(c)).toBe('path');
      }
    }
    for (let x = 0; x < map_ruins_camp.width; x++) {
      expect(campGrid.isBlocked(x, 0), `(${x}, 0)`).toBe(x !== 10);
      expect(campGrid.isBlocked(x, map_ruins_camp.height - 1), `(${x}, 14)`).toBe(x !== 10);
    }
    // The west edge is cliff and the east edge sea: no other way off the terrace.
    for (let y = 0; y < map_ruins_camp.height; y++) {
      expect(campGrid.isBlocked(0, y), `(0, ${y})`).toBe(true);
      expect(campGrid.isBlocked(map_ruins_camp.width - 1, y), `(19, ${y})`).toBe(true);
    }
    expect(cellsWith(map_ruins_camp, 'door')).toHaveLength(0);
    expect(cellsWith(map_ruins_camp, 'deep_water').length).toBeGreaterThan(0);
  });

  it('north edge (10, 0) → 磯の道 (20, 18) facing up, in front of the road exit that lands on the entrance', () => {
    expect(campNorth[0]).toMatchObject({
      tx: 10,
      ty: 0,
      tw: 1,
      th: 1,
      targetMap: SHORE,
      targetX: 20,
      targetY: 18,
      facing: 'up',
    });
    expect(touchesRect(campNorth[0]!, campEntrance)).toBe(true);
    expect(shoreSouth).toMatchObject({
      tx: 20,
      ty: 19,
      targetMap: CAMP,
      targetX: campEntrance.x,
      targetY: campEntrance.y,
      facing: 'down',
    });
    // Both landings are open at runtime, with the return warp directly behind the player.
    expect(shoreGridAtRuntime.isBlocked(20, 18)).toBe(false);
    expect(campGridAtRuntime.isBlocked(campEntrance.x, campEntrance.y)).toBe(false);
    for (const [w, back] of [
      [campNorth[0]!, shoreSouth!],
      [shoreSouth!, campNorth[0]!],
    ] as const) {
      const landing: Cell = { x: w.targetX, y: w.targetY };
      expect(touchesRect(back, landing)).toBe(true);
      expect(inRect(back, landing)).toBe(false);
      expect(touchesRect(w, { x: back.targetX, y: back.targetY })).toBe(true);
      const d = FACING_DELTA[w.facing];
      expect(inRect(back, { x: landing.x - d.x, y: landing.y - d.y })).toBe(true);
    }
  });

  it('south edge (10, 14) → 沈んだ遺跡 上層 (22, 1) facing down, leaving (10, 13) for its return warp', () => {
    expect(campSouth[0]).toMatchObject({
      tx: 10,
      ty: 14,
      tw: 1,
      th: 1,
      targetMap: RUINS,
      targetX: 22,
      targetY: 1,
      facing: 'down',
    });
    // The ruins' north warp lands here facing up, so the warp must be directly behind it.
    expect(campGrid.isBlocked(RUINS_LANDING.x, RUINS_LANDING.y)).toBe(false);
    expect(campGridAtRuntime.isBlocked(RUINS_LANDING.x, RUINS_LANDING.y)).toBe(false);
    expect(camp.some((o) => inRect(o, RUINS_LANDING))).toBe(false);
    const d = FACING_DELTA.up;
    expect(inRect(campSouth[0]!, { x: RUINS_LANDING.x - d.x, y: RUINS_LANDING.y - d.y })).toBe(
      true,
    );
    // The path runs straight down from the camp to the exit.
    for (let y = 11; y <= 14; y++)
      expect(groundTile(map_ruins_camp, 10, y), `(10, ${y})`).toBe('path');
  });

  it('frames the way down to the ruins with broken pillars', () => {
    const pillars = cellsWith(map_ruins_camp, 'wall').filter((c) => c.y >= 11);
    expect(pillars.length).toBeGreaterThanOrEqual(4);
    for (const p of pillars) {
      expect(campGrid.isBlocked(p.x, p.y), cellKey(p)).toBe(true);
      expect(groundTile(map_ruins_camp, p.x, p.y), cellKey(p)).toBe('sand');
      expect(Math.abs(p.x - 10), cellKey(p)).toBeGreaterThanOrEqual(2);
    }
    // Pillars on both sides of the path.
    expect(pillars.some((p) => p.x < 10)).toBe(true);
    expect(pillars.some((p) => p.x > 10)).toBe(true);
  });
});

describe('学者のキャンプ: camp folk (§3.1, §7.5, §13 #11-12, §14)', () => {
  it('has the scholar, the merchant and the assistant, all static on sprite_npc facing down', () => {
    const people = npcs(camp)
      .map((o) => ({
        id: o.id,
        dialog: o.dialog,
        move: o.move,
        facing: o.facing,
        sprite: o.sprite,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(people).toEqual([
      {
        id: 'npc_camp_assistant',
        dialog: 'dlg_camp_assistant',
        move: 'static',
        facing: 'down',
        sprite: 'sprite_npc',
      },
      {
        id: 'npc_merchant_camp',
        dialog: 'dlg_camp_merchant',
        move: 'static',
        facing: 'down',
        sprite: 'sprite_npc',
      },
      {
        id: 'npc_ruins_scholar',
        dialog: 'dlg_ruins_scholar',
        move: 'static',
        facing: 'down',
        sprite: 'sprite_npc',
      },
    ]);
    // Nobody is gated: the camp is open from the first visit (§13 #11 happens in dialog).
    for (const o of npcs(camp)) {
      expect(o.hiddenIf, o.id).toBeUndefined();
      expect(o.condition, o.id).toBeUndefined();
    }
  });

  it('scholar: at his crates, with the sq_old_chart head markers surviving the compile round-trip', () => {
    const markers = [
      { if: 'sq.chart==2', text: '' },
      { if: 'item.it_old_chart>=1', text: '？' },
      { if: 'sq.chart==1', text: '！' },
      { if: 'ruins.tide_learned', text: '！' },
    ];
    expect(scholar).toMatchObject({ tx: 12, ty: 5, markers });
    expect(scholar!.shop).toBeUndefined();
    expect(scholar!.innPrice).toBeUndefined();
    const authored = map_ruins_camp.objects.find(
      (o) => o.type === 'npc' && o.id === 'npc_ruins_scholar',
    );
    expect(authored).toBeDefined();
    expect(authored!.type === 'npc' && authored!.markers).toEqual(markers);
    expect(scholar!.markers).toEqual(authored!.type === 'npc' ? authored!.markers : undefined);
    for (const m of markers) expect(() => validateCondition(m.if)).not.toThrow();
    // His crates stand beside him.
    expect(legendAt(map_ruins_camp, 13, 5)?.deco).toBe('table');
    expect(legendAt(map_ruins_camp, 14, 5)?.deco).toBe('table');
  });

  it('merchant: between two crates, running shop_camp', () => {
    expect(merchant).toMatchObject({ tx: 7, ty: 9, shop: 'shop_camp' });
    expect(merchant!.innPrice).toBeUndefined();
    expect(merchant!.markers).toBeUndefined();
    expect(legendAt(map_ruins_camp, 6, 9)?.deco).toBe('table');
    expect(legendAt(map_ruins_camp, 8, 9)?.deco).toBe('table');
    expect(campGrid.isBlocked(6, 9)).toBe(true);
    expect(campGrid.isBlocked(8, 9)).toBe(true);
  });

  it('assistant: in front of the tent, 60G a night (§3.1 テント宿泊 60G)', () => {
    expect(assistant).toMatchObject({ tx: 3, ty: 5, innPrice: 60 });
    expect(assistant!.shop).toBeUndefined();
    expect(assistant!.markers).toBeUndefined();
    // The tent: a roof_blue canopy over a wall row, right behind her.
    expect(groundTile(map_ruins_camp, 3, 4)).toBe('wall');
    expect(legendAt(map_ruins_camp, 3, 3)?.above).toBe('roof_blue');
    for (let x = 2; x <= 5; x++) {
      expect(legendAt(map_ruins_camp, x, 3)?.above, `(${x}, 3)`).toBe('roof_blue');
      expect(groundTile(map_ruins_camp, x, 4), `(${x}, 4)`).toBe('wall');
      expect(campGrid.isBlocked(x, 3), `(${x}, 3)`).toBe(true);
      expect(campGrid.isBlocked(x, 4), `(${x}, 4)`).toBe(true);
    }
  });

  it('lets the player stand in front of each of them, on a tile reached from the entrance', () => {
    const reachable = reachableFrom(campGridAtRuntime, campEntrance);
    expect(npcs(camp)).toHaveLength(3);
    for (const o of npcs(camp)) {
      const d = FACING_DELTA[o.facing];
      const front: Cell = { x: o.tx + d.x, y: o.ty + d.y };
      expect(campGridAtRuntime.isBlocked(front.x, front.y), `${o.id} front tile`).toBe(false);
      expect(reachable.has(cellKey(front)), `${o.id} front tile unreachable`).toBe(true);
      expect(groundTile(map_ruins_camp, front.x, front.y), `${o.id} front tile`).toBe('sand');
      expect(manhattan(cellOf(o), campEntrance), `${o.id} on the entrance`).toBeGreaterThan(1);
    }
  });

  it('has the campfire in the middle of the camp', () => {
    expect(cellsWith(map_ruins_camp, 'lantern')).toEqual([CAMPFIRE]);
    expect(campGrid.isBlocked(CAMPFIRE.x, CAMPFIRE.y)).toBe(true);
    for (const o of [scholar!, merchant!, assistant!])
      expect(manhattan(cellOf(o), CAMPFIRE), o.id).toBeLessThanOrEqual(8);
  });
});

describe('学者のキャンプ: sign, save point and sweeps', () => {
  it('puts the sign by the entrance and the save point by the fire; no chests, triggers or enemies', () => {
    const signs = camp.filter((o) => o.kind === 'sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 12, ty: 2, textId: 'dlg_sign_camp' });
    expect(manhattan(cellOf(signs[0]!), campEntrance)).toBeLessThanOrEqual(4);

    const saves = camp.filter((o) => o.kind === 'save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 13, ty: 8, heal: false });
    expect(saves[0]!.onceFlag).toBeUndefined();
    expect(manhattan(cellOf(saves[0]!), CAMPFIRE)).toBeLessThanOrEqual(6);

    expect(camp.filter((o) => o.kind === 'chest')).toHaveLength(0);
    expect(camp.filter((o) => o.kind === 'trigger')).toHaveLength(0);
    expect(camp.filter((o) => o.kind === 'enemy')).toHaveLength(0);
  });

  it('keeps every object on its own walkable tile, off the warps, reachable from the entrance', () => {
    const taken = new Set<string>();
    for (const o of blockers(camp)) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      expect(campGrid.isBlocked(o.tx, o.ty), label).toBe(false);
      expect(taken.has(cellKey(cellOf(o))), `${label} shares a tile`).toBe(false);
      taken.add(cellKey(cellOf(o)));
      expect(
        warps(camp).some((w) => inRect(w, cellOf(o))),
        `${label} sits on a warp`,
      ).toBe(false);
      expect(manhattan(cellOf(o), campEntrance), `${label} on the entrance`).toBeGreaterThan(0);
    }
    expect(campGridAtRuntime.isBlocked(campEntrance.x, campEntrance.y)).toBe(false);
    const reachable = reachableFrom(campGridAtRuntime, campEntrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    for (const o of camp) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'warp') {
        expect(rectCells(o).every(reached), `${label} unreachable`).toBe(true);
      } else if (isBlocker(o)) {
        expect(neighbours(cellOf(o)).some(reached), `${label} cannot be approached`).toBe(true);
      }
    }
    // Every open tile of the terrace is connected: no sealed-off pockets.
    for (let y = 0; y < map_ruins_camp.height; y++) {
      for (let x = 0; x < map_ruins_camp.width; x++) {
        if (campGridAtRuntime.isBlocked(x, y)) continue;
        expect(reached({ x, y }), `open tile (${x}, ${y}) is cut off from the camp`).toBe(true);
      }
    }
  });

  it('uses the id conventions and well-formed conditions', () => {
    const ids = new Set<string>();
    let conditions = 0;
    for (const o of camp) {
      if (o.kind === 'npc') {
        expect(o.id).toMatch(/^npc_[a-z0-9_]+$/);
        expect(o.dialog).toMatch(/^dlg_[a-z0-9_]+$/);
        expect(ids.has(o.id), `duplicate npc id ${o.id}`).toBe(false);
        ids.add(o.id);
        if (o.shop !== undefined) expect(o.shop).toMatch(/^shop_[a-z0-9_]+$/);
        for (const m of o.markers ?? []) {
          if (m.if === undefined) continue;
          conditions += 1;
          expect(() => validateCondition(m.if!), `${o.id}: "${m.if}"`).not.toThrow();
        }
      }
      if (o.kind === 'sign') expect(o.textId).toMatch(/^dlg_[a-z0-9_]+$/);
      if (o.kind === 'warp') expect(o.targetMap).toMatch(/^map_[a-z0-9_]+$/);
    }
    // The four scholar markers.
    expect(conditions).toBe(4);
  });
});
