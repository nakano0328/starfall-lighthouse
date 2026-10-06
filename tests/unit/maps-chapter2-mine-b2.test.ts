import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { normalizeLegendEntry } from '@core/map/source';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { map_mine_b2 } from '@data/maps/map_mine_b2';

// docs/GAME_DESIGN.md §3.1 row map_mine_b2, §5.12 symbols, §7.1 it_shining_ore, §7.4
// eq_acc_miner_badge (chest.mine_b2_02), §8.2 grp_mine_b / grp_mine_c.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own.

interface Cell {
  x: number;
  y: number;
}

const B2 = 'map_mine_b2';
const B1 = 'map_mine_b1';
const B3 = 'map_mine_b3';
const MINE_GROUPS = new Set(['grp_mine_b', 'grp_mine_c']);

const src = map_mine_b2;
const compiled = compileMap(src);
const objects = parseMapObjects(compiled);
const grid = CollisionGrid.fromMap(compiled);
const { entrance } = src.meta;

/** Landing tile of B3's ladder up (B3 (4, 30) → B2 (4, 29) facing up). */
const B3_LANDING: Cell = { x: 4, y: 29 };

const cellKey = (c: Cell): string => `${c.x},${c.y}`;
const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const neighbours = (c: Cell): Cell[] => [
  { x: c.x + 1, y: c.y },
  { x: c.x - 1, y: c.y },
  { x: c.x, y: c.y + 1 },
  { x: c.x, y: c.y - 1 },
];

const ofKind = <K extends MapObject['kind']>(kind: K): Extract<MapObject, { kind: K }>[] =>
  objects.filter((o): o is Extract<MapObject, { kind: K }> => o.kind === kind);

/** Blocking sprites WorldScene adds to the collision grid (NPCs, chests, signs, save points). */
const blockers = (): Cell[] =>
  objects
    .filter(
      (o) => o.kind === 'npc' || o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point',
    )
    .map((o) => ({ x: o.tx, y: o.ty }));

/** Name of the ground tile the ASCII source places at (x, y). */
const groundTile = (c: Cell): string | undefined => {
  const ch = [...(src.tiles[c.y] ?? '')][c.x];
  const entry = ch === undefined ? undefined : src.legend[ch];
  return entry === undefined ? undefined : normalizeLegendEntry(entry).ground;
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

const warpTo = (map: string): WarpObject => {
  const w = ofKind('warp').find((o) => o.targetMap === map);
  expect(w, `warp → ${map}`).toBeDefined();
  return w!;
};
const chestByFlag = (flag: string): Extract<MapObject, { kind: 'chest' }> => {
  const c = ofKind('chest').find((o) => o.flag === flag);
  expect(c, flag).toBeDefined();
  return c!;
};
/** Share of the (2r+1)² wander square a symbol can actually walk on (§5.12). */
const wanderOpenShare = (e: { tx: number; ty: number; radius: number }): number => {
  let open = 0;
  let total = 0;
  for (let dy = -e.radius; dy <= e.radius; dy++) {
    for (let dx = -e.radius; dx <= e.radius; dx++) {
      total += 1;
      if (!grid.isBlocked(e.tx + dx, e.ty + dy)) open += 1;
    }
  }
  return open / total;
};

describe('廃坑 B2 (map_mine_b2)', () => {
  it('is a 40x35 dungeon with the mine encounter groups and no free saving', () => {
    expect(src.width).toBe(40);
    expect(src.height).toBe(35);
    expect(src.tiles).toHaveLength(35);
    for (const row of src.tiles) expect([...row]).toHaveLength(40);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toMatchObject({
      id: B2,
      displayName: '廃坑 B2',
      kind: 'dungeon',
      bgmKey: 'bgm_mine',
      battleBgKey: 'bg_mine',
      encounterGroups: ['grp_mine_b', 'grp_mine_c'],
      canSaveAnywhere: false,
    });
    expect(compiled.width).toBe(40);
    expect(compiled.height).toBe(35);
  });

  it('starts the player below the B1 ladder on a walkable tile, facing down', () => {
    expect(entrance).toEqual({ x: 36, y: 5, facing: 'down' });
    expect(grid.isBlocked(entrance.x, entrance.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(entrance.x, entrance.y)).toBe(false);
  });

  it('has exactly the two ladders of the B1 / B3 contract, each on a stairs tile', () => {
    expect(ofKind('warp')).toHaveLength(2);
    const up = warpTo(B1);
    const down = warpTo(B3);
    expect(up).toMatchObject({
      tx: 36,
      ty: 4,
      tw: 1,
      th: 1,
      targetMap: B1,
      targetX: 36,
      targetY: 5,
      facing: 'down',
    });
    expect(down).toMatchObject({
      tx: 4,
      ty: 30,
      tw: 1,
      th: 1,
      targetMap: B3,
      targetX: 4,
      targetY: 29,
      facing: 'up',
    });
    for (const w of [up, down]) {
      const label = `ladder at (${w.tx}, ${w.ty})`;
      expect(w.requiredItem, label).toBeUndefined();
      expect(w.doorFlag, label).toBeUndefined();
      expect(groundTile({ x: w.tx, y: w.ty }), label).toBe('stairs');
      expect(grid.isBlocked(w.tx, w.ty), label).toBe(false);
    }
    // The ladder up is directly behind the entrance (the player arrives facing away from it).
    expect(manhattan({ x: up.tx, y: up.ty }, entrance)).toBe(1);
    expect(up.ty).toBe(entrance.y - 1);
    // Only the two ladders are stairs tiles.
    const stairs: Cell[] = [];
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++)
        if (groundTile({ x, y }) === 'stairs') stairs.push({ x, y });
    expect(stairs.map(cellKey).sort()).toEqual(
      [cellKey({ x: 36, y: 4 }), cellKey({ x: 4, y: 30 })].sort(),
    );
  });

  it('keeps the B3 landing (4, 29) walkable, with the ladder down right below it', () => {
    expect(grid.isBlocked(B3_LANDING.x, B3_LANDING.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(B3_LANDING.x, B3_LANDING.y)).toBe(false);
    const down = warpTo(B3);
    expect(manhattan({ x: down.tx, y: down.ty }, B3_LANDING)).toBe(1);
    expect(down.ty).toBe(B3_LANDING.y + 1);
    expect(ofKind('warp').some((w) => w.tx === B3_LANDING.x && w.ty === B3_LANDING.y)).toBe(false);
  });

  it('holds the four chests of §3.1 / §7.1 / §7.4, the badge as a single piece', () => {
    const chests = ofKind('chest')
      .map((c) => ({ x: c.tx, y: c.ty, itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { x: 37, y: 13, itemId: 'it_potion_s', qty: 2, flag: 'chest.mine_b2_01', tide: 'any' },
      { x: 37, y: 24, itemId: 'eq_acc_miner_badge', qty: 1, flag: 'chest.mine_b2_02', tide: 'any' },
      { x: 2, y: 3, itemId: 'it_shining_ore', qty: 1, flag: 'chest.mine_b2_03', tide: 'any' },
      { x: 30, y: 25, itemId: 'gold', qty: 250, flag: 'chest.mine_b2_04', tide: 'any' },
    ]);
    for (const c of ofKind('chest')) expect(grid.isBlocked(c.tx, c.ty), c.flag).toBe(false);
    // The contents exist, and the key item fits its 3-piece cap (§7.1).
    expect(findItem('it_potion_s')).toBeDefined();
    const ore = findItem('it_shining_ore');
    expect(ore).toBeDefined();
    expect(chestByFlag('chest.mine_b2_03').qty).toBeLessThanOrEqual(ore!.maxQty);
    expect(findEquip('eq_acc_miner_badge')?.slot).toBe('accessory');
    expect(findItem('eq_acc_miner_badge')).toBeUndefined();
  });

  it('places six symbols in the mine groups, away from the ladder, on open ground', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(6);
    const counts = new Map<string, number>();
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.tide, label).toBe('any');
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan({ x: e.tx, y: e.ty }, entrance), label).toBeGreaterThanOrEqual(6);
      expect(e.groupIds.length, label).toBeGreaterThan(0);
      for (const g of e.groupIds) expect(MINE_GROUPS.has(g), `${label} group ${g}`).toBe(true);
      expect(wanderOpenShare(e), `${label} wander area`).toBeGreaterThan(0.5);
      const key = e.groupIds.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.get('grp_mine_b')).toBe(3);
    expect(counts.get('grp_mine_c')).toBe(2);
    expect(counts.get('grp_mine_b,grp_mine_c')).toBe(1);
    expect(counts.size).toBe(3);
  });

  it('has the flooded-gallery warning sign by the ladder and nothing else', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 34, ty: 5, textId: 'dlg_sign_mine_b2' });
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, entrance)).toBeLessThanOrEqual(3);
    expect(grid.isBlocked(signs[0]!.tx, signs[0]!.ty)).toBe(false);
    expect(ofKind('npc')).toHaveLength(0);
    expect(ofKind('save_point')).toHaveLength(0);
    expect(ofKind('trigger')).toHaveLength(0);
  });

  it('reaches every object from the entrance and gives each sprite its own tile', () => {
    const runtime = grid.withBlocked(blockers());
    const reachable = reachableFrom(runtime, entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    const taken = new Set<string>();
    expect(reached(B3_LANDING)).toBe(true);
    for (const o of objects) {
      const cell = { x: o.tx, y: o.ty };
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'chest' || o.kind === 'sign') {
        expect(neighbours(cell).some(reached), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
        expect(
          ofKind('warp').some((w) => w.tx === o.tx && w.ty === o.ty),
          `${label} sits on a ladder`,
        ).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
  });

  it('has a flooded gallery that every route to the lower level crosses', () => {
    // Standing water is a real feature of the level, not a puddle.
    let water = 0;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) if (groundTile({ x, y }) === 'water') water += 1;
    expect(water).toBeGreaterThanOrEqual(40);
    // The gallery (x9-22, y11-21) is the only link between the entrance side and the rest:
    // seal its east doorway and neither ladder down nor any chest beyond it can be reached.
    const sealed = reachableFrom(
      grid.withBlocked([...blockers(), { x: 23, y: 15 }, { x: 23, y: 16 }]),
      entrance,
    );
    const down = warpTo(B3);
    expect(sealed.has(cellKey({ x: down.tx, y: down.ty }))).toBe(false);
    for (const flag of ['chest.mine_b2_02', 'chest.mine_b2_03', 'chest.mine_b2_04']) {
      const c = chestByFlag(flag);
      expect(
        neighbours({ x: c.tx, y: c.ty }).some((n) => sealed.has(cellKey(n))),
        `${flag} still reachable`,
      ).toBe(false);
    }
    // The potion chest in the east gallery lies before the water.
    const first = chestByFlag('chest.mine_b2_01');
    expect(neighbours({ x: first.tx, y: first.ty }).some((n) => sealed.has(cellKey(n)))).toBe(true);
  });

  it('forces detours around the cave-ins: west tunnel and the vault door', () => {
    const runtime = grid.withBlocked(blockers());
    // The west tunnel (y5-6) out of the entrance chamber is blocked by fallen rock at x24-26,
    // so the ore chest is only reached from the flooded gallery through the north shaft.
    for (const y of [5, 6]) for (const x of [24, 25, 26]) expect(grid.isBlocked(x, y)).toBe(true);
    const shaftSealed = reachableFrom(
      runtime.withBlocked([
        { x: 18, y: 10 },
        { x: 19, y: 10 },
      ]),
      entrance,
    );
    const ore = chestByFlag('chest.mine_b2_03');
    expect(neighbours({ x: ore.tx, y: ore.ty }).some((n) => shaftSealed.has(cellKey(n)))).toBe(
      false,
    );
    // The vault's direct opening from the lower gallery has collapsed; the way in is the
    // crawl tunnel under the gallery (y31-33).
    expect(grid.isBlocked(31, 27)).toBe(true);
    const tunnelSealed = reachableFrom(
      runtime.withBlocked([
        { x: 29, y: 31 },
        { x: 30, y: 31 },
      ]),
      entrance,
    );
    const badge = chestByFlag('chest.mine_b2_02');
    expect(neighbours({ x: badge.tx, y: badge.ty }).some((n) => tunnelSealed.has(cellKey(n)))).toBe(
      false,
    );
    const down = warpTo(B3);
    expect(tunnelSealed.has(cellKey({ x: down.tx, y: down.ty }))).toBe(true);
  });
});
