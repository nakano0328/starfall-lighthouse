import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, TriggerObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry } from '@core/map/source';
import { normalizeLegendEntry } from '@core/map/source';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { map_lighthouse_3f } from '@data/maps/map_lighthouse_3f';

// docs/GAME_DESIGN.md §3.1 row map_lighthouse_3f, §5.12 symbols, §7.4 the Tier-4 star
// armours (chest.tower_3f_01-03), §8.2 grp_tower_b / grp_tower_c, §13 #16 ev_tower_voice_3.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own
// while the neighbouring floors are authored alongside it.

interface Cell {
  x: number;
  y: number;
}

const FLOOR = 'map_lighthouse_3f';
const BELOW = 'map_lighthouse_2f';
const ABOVE = 'map_lighthouse_4f';
const GROUPS = ['grp_tower_b', 'grp_tower_c'];
/** Tower stair contract (§3.1): the same four tiles on every floor. */
const LANDING: Cell = { x: 2, y: 22 };
const DOWN_STAIRS: Cell = { x: 2, y: 21 };
const UP_STAIRS: Cell = { x: 21, y: 2 };
const UP_LANDING: Cell = { x: 21, y: 3 };
/** The spiral's two gaps: from the rim into the middle corridor, and into the vault. */
const RIM_GAP: Cell[] = [
  { x: 9, y: 19 },
  { x: 10, y: 19 },
];
const VAULT_GAP: Cell[] = [
  { x: 12, y: 16 },
  { x: 13, y: 16 },
];
/** Straight segments of the rim walk from the landing to the stairs up. */
const RIM_WALK: Cell[] = [
  { x: 2, y: 22 },
  { x: 3, y: 22 },
  { x: 3, y: 5 },
  { x: 6, y: 5 },
  { x: 6, y: 3 },
  { x: 17, y: 3 },
  { x: 17, y: 4 },
  { x: 21, y: 4 },
  { x: 21, y: 2 },
];

const src = map_lighthouse_3f;
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
  const t = ofKind('trigger').find((o) => o.eventId === 'ev_tower_voice_3');
  expect(t, 'ev_tower_voice_3 trigger').toBeDefined();
  return t!;
};
const chestByFlag = (flag: string): Extract<MapObject, { kind: 'chest' }> => {
  const c = ofKind('chest').find((o) => o.flag === flag);
  expect(c, flag).toBeDefined();
  return c!;
};

describe('灯台の塔 3F (map_lighthouse_3f)', () => {
  it('is a 24x24 dungeon floor on the tower backdrop with the b/c groups and no free saving', () => {
    expect(src.width).toBe(24);
    expect(src.height).toBe(24);
    expect(src.tiles).toHaveLength(24);
    for (const row of src.tiles) expect([...row]).toHaveLength(24);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toEqual({
      id: FLOOR,
      displayName: '灯台の塔 3F',
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

  it('keeps the stair contract: (2, 21) down to 2F, (21, 2) up to 4F, both stairs tiles', () => {
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
    // 2F's stairs up land on (21, 3) facing down, so the stairs up are the tile above it.
    expect(manhattan(UP_STAIRS, UP_LANDING)).toBe(1);
    expect(UP_STAIRS).toEqual({ x: UP_LANDING.x, y: UP_LANDING.y - 1 });
    expect(grid.isBlocked(UP_LANDING.x, UP_LANDING.y)).toBe(false);
    expect(runtime().isBlocked(UP_LANDING.x, UP_LANDING.y)).toBe(false);
    // Nothing at all sits on the upper landing: arriving from 4F fires nothing.
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
      eventId: 'ev_tower_voice_3',
      once: true,
      interact: false,
    });
    expect(t.condition).toBeUndefined();
  });

  it('holds the three Tier-4 star armours of §7.4 in the vault, one piece each', () => {
    const chests = ofKind('chest')
      .map((c) => ({ x: c.tx, y: c.ty, itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { x: 10, y: 8, itemId: 'eq_ar_star_luka', qty: 1, flag: 'chest.tower_3f_01', tide: 'any' },
      { x: 11, y: 8, itemId: 'eq_ar_star_mio', qty: 1, flag: 'chest.tower_3f_02', tide: 'any' },
      { x: 12, y: 8, itemId: 'eq_ar_star_goro', qty: 1, flag: 'chest.tower_3f_03', tide: 'any' },
    ]);
    for (const c of ofKind('chest')) {
      expect(grid.isBlocked(c.tx, c.ty), c.flag).toBe(false);
      // Equipment, not a consumable; and the right character's armour.
      expect(findItem(c.itemId), c.flag).toBeUndefined();
      expect(findEquip(c.itemId)?.slot, c.flag).toBe('armor');
    }
    expect(findEquip('eq_ar_star_luka')?.allowed).toEqual(['ch_luka']);
    expect(findEquip('eq_ar_star_mio')?.allowed).toEqual(['ch_mio']);
    expect(findEquip('eq_ar_star_goro')?.allowed).toEqual(['ch_goro']);
    // All three stand side by side, opened from the vault floor in front of them.
    for (const flag of ['chest.tower_3f_01', 'chest.tower_3f_02', 'chest.tower_3f_03']) {
      const c = chestByFlag(flag);
      expect(runtime().isBlocked(c.tx, c.ty + 1), `${flag} front tile`).toBe(false);
    }
  });

  it('has the floor sign in the stair turret and one plain save point before the stairs up', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 2, ty: 19, textId: 'dlg_sign_tower_3f' });
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, LANDING)).toBeLessThanOrEqual(3);
    expect(grid.isBlocked(signs[0]!.tx, signs[0]!.ty)).toBe(false);

    const saves = ofKind('save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 18, ty: 3, heal: false });
    expect(saves[0]!.onceFlag).toBeUndefined();
    expect(grid.isBlocked(18, 3)).toBe(false);
    expect(manhattan({ x: 18, y: 3 }, UP_STAIRS)).toBeLessThanOrEqual(4);
    expect(ofKind('npc')).toHaveLength(0);
  });

  it('places three symbols of the b+c groups on open ground, 6+ tiles from the landing', () => {
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
  });

  it('keeps the rim walk from the landing to the stairs up open as straight segments', () => {
    const rt = runtime();
    for (let i = 1; i < RIM_WALK.length; i++) {
      for (const c of segment(RIM_WALK[i - 1]!, RIM_WALK[i]!)) {
        expect(rt.isBlocked(c.x, c.y), `rim walk tile ${cellKey(c)}`).toBe(false);
      }
    }
    // The walk never crosses the stairs down.
    const crossed = RIM_WALK.slice(1).flatMap((c, i) => segment(RIM_WALK[i]!, c).slice(1));
    expect(crossed.some((c) => c.x === DOWN_STAIRS.x && c.y === DOWN_STAIRS.y)).toBe(false);
  });

  it('winds the spiral: the vault opens only through both gaps, a full turn apart', () => {
    const rt = runtime();
    const vault = (reach: Set<string>): boolean =>
      ['chest.tower_3f_01', 'chest.tower_3f_02', 'chest.tower_3f_03'].every((flag) => {
        const c = chestByFlag(flag);
        return approachable(reach, { x: c.tx, y: c.ty });
      });
    // Open: the vault and everything on the way are reached.
    const open = reachableFrom(rt, entrance);
    expect(vault(open)).toBe(true);
    for (const c of [...RIM_GAP, ...VAULT_GAP]) {
      expect(grid.isBlocked(c.x, c.y), `gap ${cellKey(c)}`).toBe(false);
      expect(open.has(cellKey(c)), `gap ${cellKey(c)}`).toBe(true);
    }
    // Sealing the rim gap cuts off the middle corridor and the vault, but not the stairs up.
    const rimSealed = reachableFrom(rt.withBlocked(RIM_GAP), entrance);
    expect(vault(rimSealed)).toBe(false);
    expect(rimSealed.has(cellKey({ x: 6, y: 12 }))).toBe(false);
    expect(rimSealed.has(cellKey(UP_STAIRS))).toBe(true);
    // Sealing the vault gap keeps the middle corridor open but seals the vault.
    const vaultSealed = reachableFrom(rt.withBlocked(VAULT_GAP), entrance);
    expect(vault(vaultSealed)).toBe(false);
    expect(vaultSealed.has(cellKey({ x: 6, y: 12 }))).toBe(true);
    expect(vaultSealed.has(cellKey({ x: 12, y: 10 }))).toBe(false);
    // The radial wall beside the rim gap forces the walk west and round: the tiles just
    // east of the gap, inside the corridor, are solid.
    for (const c of [
      { x: 11, y: 17 },
      { x: 11, y: 18 },
      { x: 11, y: 19 },
    ]) {
      expect(grid.isBlocked(c.x, c.y), `radial wall ${cellKey(c)}`).toBe(true);
    }
    // The vault gap lies on the far side of that wall from the rim gap, so the middle
    // corridor has to be walked right round: sealing it just west of the rim gap
    // isolates the vault.
    const turnSealed = reachableFrom(
      rt.withBlocked([
        { x: 8, y: 17 },
        { x: 8, y: 18 },
      ]),
      entrance,
    );
    expect(vault(turnSealed)).toBe(false);
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
