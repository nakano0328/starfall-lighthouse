import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, TriggerObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry } from '@core/map/source';
import { normalizeLegendEntry } from '@core/map/source';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { map_lighthouse_4f } from '@data/maps/map_lighthouse_4f';

// docs/GAME_DESIGN.md §3.1 row map_lighthouse_4f, §5.12 symbols, §7.1 it_star_tear, §7.4
// eq_wp_luka_4 (chest.tower_4f_01), §8.2 grp_tower_c / grp_tower_d, §13 #16 ev_tower_voice_4.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own
// while the neighbouring floors are authored alongside it.

interface Cell {
  x: number;
  y: number;
}

const FLOOR = 'map_lighthouse_4f';
const BELOW = 'map_lighthouse_3f';
const ABOVE = 'map_lighthouse_5f';
const GROUPS = ['grp_tower_c', 'grp_tower_d'];
/** Tower stair contract (§3.1): the same four tiles on every floor. */
const LANDING: Cell = { x: 2, y: 22 };
const DOWN_STAIRS: Cell = { x: 2, y: 21 };
const UP_STAIRS: Cell = { x: 21, y: 2 };
const UP_LANDING: Cell = { x: 21, y: 3 };
/** The dividing wall (x11-12, y4-22) and the arch above it (x11-12, y1-3). */
const DIVIDER_XS = [11, 12];
const DIVIDER_Y0 = 4;
const ARCH_YS = [1, 2, 3];
/** Lantern pillars: two rows per hall. */
const PILLAR_XS = [4, 8, 15, 19];
const PILLAR_YS = [6, 10, 14, 18];
/** Straight segments of the walk from the landing through the arch to the stairs up. */
const WALK: Cell[] = [
  { x: 2, y: 22 },
  { x: 3, y: 22 },
  { x: 3, y: 5 },
  { x: 10, y: 5 },
  { x: 10, y: 3 },
  { x: 18, y: 3 },
  { x: 18, y: 4 },
  { x: 21, y: 4 },
  { x: 21, y: 2 },
];

const src = map_lighthouse_4f;
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
 * Cells WorldScene blocks at runtime: NPCs that are not gated, chests, signs, save points
 * and examine-triggers.
 */
const blockers = (): Cell[] =>
  objects
    .filter(
      (o) =>
        (o.kind === 'npc' && o.hiddenIf === undefined && o.condition === undefined) ||
        o.kind === 'chest' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'trigger' && o.interact),
    )
    .map((o) => ({ x: o.tx, y: o.ty }));
const runtime = (): CollisionGrid => grid.withBlocked(blockers());

/** Name of the ground tile the ASCII source places at `c`. */
function groundAt(c: Cell): string | undefined {
  const ch = [...(src.tiles[c.y] ?? '')][c.x];
  const entry: LegendEntry | undefined =
    ch === undefined || src.legend[ch] === undefined
      ? undefined
      : normalizeLegendEntry(src.legend[ch]!);
  return entry?.ground;
}

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
const voiceTrigger = (): TriggerObject => {
  const t = ofKind('trigger').find((o) => o.eventId === 'ev_tower_voice_4');
  expect(t, 'ev_tower_voice_4 trigger').toBeDefined();
  return t!;
};
const chestByFlag = (flag: string): Extract<MapObject, { kind: 'chest' }> => {
  const c = ofKind('chest').find((o) => o.flag === flag);
  expect(c, flag).toBeDefined();
  return c!;
};

describe('灯台の塔 4F (map_lighthouse_4f)', () => {
  it('is a 24x24 dungeon floor on the tower backdrop with the c/d groups and no free saving', () => {
    expect(src.width).toBe(24);
    expect(src.height).toBe(24);
    expect(src.tiles).toHaveLength(24);
    for (const row of src.tiles) expect([...row]).toHaveLength(24);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toEqual({
      id: FLOOR,
      displayName: '灯台の塔 4F',
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
    expect(runtime().isBlocked(LANDING.x, LANDING.y)).toBe(false);
    // Only the voice trigger sits on the landing.
    const onLanding = objects.filter((o) => inRect(o, LANDING));
    expect(onLanding).toHaveLength(1);
    expect(onLanding[0]!.kind).toBe('trigger');
  });

  it('keeps the stair contract: (2, 21) down to 3F, (21, 2) up to 5F, both stairs tiles', () => {
    expect(ofKind('warp')).toHaveLength(2);
    const down = warpTo(BELOW);
    const up = warpTo(ABOVE);
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
      targetMap: ABOVE,
      targetX: LANDING.x,
      targetY: LANDING.y,
      facing: 'down',
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
    // 3F's stairs up land on (21, 3) facing down, so the stairs up are the tile above it.
    expect(manhattan(UP_STAIRS, UP_LANDING)).toBe(1);
    expect(UP_STAIRS).toEqual({ x: UP_LANDING.x, y: UP_LANDING.y - 1 });
    expect(grid.isBlocked(UP_LANDING.x, UP_LANDING.y)).toBe(false);
    expect(runtime().isBlocked(UP_LANDING.x, UP_LANDING.y)).toBe(false);
    // Nothing at all sits on the upper landing: arriving from 5F fires nothing.
    expect(objects.some((o) => inRect(o, UP_LANDING))).toBe(false);
  });

  it('fires the floor voice once, on the landing, and nothing else by stepping', () => {
    expect(ofKind('trigger')).toHaveLength(1);
    const t = voiceTrigger();
    expect(t).toMatchObject({
      tx: LANDING.x,
      ty: LANDING.y,
      tw: 1,
      th: 1,
      eventId: 'ev_tower_voice_4',
      once: true,
      interact: false,
    });
    expect(t.condition).toBeUndefined();
  });

  it("holds ルカ's final sword (§7.4) and a star tear (§7.1), one each", () => {
    const chests = ofKind('chest')
      .map((c) => ({ x: c.tx, y: c.ty, itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { x: 15, y: 21, itemId: 'eq_wp_luka_4', qty: 1, flag: 'chest.tower_4f_01', tide: 'any' },
      { x: 1, y: 11, itemId: 'it_star_tear', qty: 1, flag: 'chest.tower_4f_02', tide: 'any' },
    ]);
    for (const c of ofKind('chest')) expect(grid.isBlocked(c.tx, c.ty), c.flag).toBe(false);
    const sword = findEquip('eq_wp_luka_4');
    expect(sword?.slot).toBe('weapon');
    expect(sword?.allowed).toEqual(['ch_luka']);
    expect(findItem('eq_wp_luka_4')).toBeUndefined();
    const tear = findItem('it_star_tear');
    expect(tear).toBeDefined();
    expect(chestByFlag('chest.tower_4f_02').qty).toBeLessThanOrEqual(tear!.maxQty);
    // The sword chest is opened from the hall above it, the tear chest from the tile east of it.
    expect(runtime().isBlocked(15, 20)).toBe(false);
    expect(runtime().isBlocked(2, 11)).toBe(false);
  });

  it('has the floor sign in the stair turret and no save point, NPC or extra trigger', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 2, ty: 19, textId: 'dlg_sign_tower_4f' });
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, LANDING)).toBeLessThanOrEqual(3);
    expect(grid.isBlocked(signs[0]!.tx, signs[0]!.ty)).toBe(false);
    expect(ofKind('save_point')).toHaveLength(0);
    expect(ofKind('npc')).toHaveLength(0);
  });

  it('places three symbols of the c+d groups on open ground, 6+ tiles from the landing', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(3);
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
      expect(e.tx === UP_LANDING.x && e.ty === UP_LANDING.y, label).toBe(false);
    }
    // One in the west hall, two in the east hall.
    expect(enemies.filter((e) => e.tx < DIVIDER_XS[0]!)).toHaveLength(1);
    expect(enemies.filter((e) => e.tx > DIVIDER_XS[1]!)).toHaveLength(2);
  });

  it('splits the room into two halls joined only under the arch, with pillar rows', () => {
    // The divider is solid from the arch down to the south wall.
    for (const x of DIVIDER_XS) {
      for (let y = DIVIDER_Y0; y < src.height; y++) {
        expect(grid.isBlocked(x, y), `divider (${x}, ${y})`).toBe(true);
      }
      for (const y of ARCH_YS) {
        expect(grid.isBlocked(x, y), `arch (${x}, ${y})`).toBe(false);
      }
    }
    // The arch is paved with rune tiles.
    for (const x of DIVIDER_XS)
      for (const y of [2, 3]) expect(groundAt({ x, y })).toBe('rune_floor');
    // Lantern pillars stand in two rows per hall, solid, with open floor between them.
    for (const x of PILLAR_XS) {
      for (const y of PILLAR_YS) {
        expect(groundAt({ x, y }), `pillar (${x}, ${y})`).toBe('lantern');
        expect(grid.isBlocked(x, y), `pillar (${x}, ${y})`).toBe(true);
        for (const n of neighbours({ x, y })) {
          expect(grid.isBlocked(n.x, n.y), `beside pillar ${cellKey(n)}`).toBe(false);
        }
      }
    }
    // Sealing the arch cuts the east hall (stairs up, the sword) off from the west hall.
    const arch = DIVIDER_XS.flatMap((x) => ARCH_YS.map((y) => ({ x, y })));
    const sealed = reachableFrom(runtime().withBlocked(arch), entrance);
    expect(sealed.has(cellKey(UP_STAIRS))).toBe(false);
    const sword = chestByFlag('chest.tower_4f_01');
    expect(approachable(sealed, { x: sword.tx, y: sword.ty })).toBe(false);
    const tear = chestByFlag('chest.tower_4f_02');
    expect(approachable(sealed, { x: tear.tx, y: tear.ty })).toBe(true);
  });

  it('keeps the walk from the landing through the arch to the stairs up open', () => {
    const rt = runtime();
    for (let i = 1; i < WALK.length; i++) {
      for (const c of segment(WALK[i - 1]!, WALK[i]!)) {
        expect(rt.isBlocked(c.x, c.y), `walk tile ${cellKey(c)}`).toBe(false);
      }
    }
    const crossed = WALK.slice(1).flatMap((c, i) => segment(WALK[i]!, c).slice(1));
    expect(crossed.some((c) => c.x === DOWN_STAIRS.x && c.y === DOWN_STAIRS.y)).toBe(false);
    // The walk passes under the arch.
    expect(crossed.some((c) => DIVIDER_XS.includes(c.x) && ARCH_YS.includes(c.y))).toBe(true);
  });

  it('reaches every object and both stairs from the landing, each sprite on its own tile', () => {
    const rt = runtime();
    const reachable = reachableFrom(rt, entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    const taken = new Set<string>();
    for (const o of objects) {
      const cell = { x: o.tx, y: o.ty };
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point') {
        expect(neighbours(cell).some(reached), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
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
