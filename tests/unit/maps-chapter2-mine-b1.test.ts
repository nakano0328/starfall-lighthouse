import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { map_mine_b1 } from '@data/maps/map_mine_b1';

// docs/GAME_DESIGN.md §3.1 row map_mine_b1, §5.12 symbols, §8.2 grp_mine_a / grp_mine_b.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own.

interface Cell {
  x: number;
  y: number;
}

const MINE_B1 = 'map_mine_b1';
const TOWN = 'map_hagane_town';
const MINE_B2 = 'map_mine_b2';
const MINE_GROUPS = new Set(['grp_mine_a', 'grp_mine_b']);

const src = map_mine_b1;
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

const ofKind = <K extends MapObject['kind']>(kind: K): Extract<MapObject, { kind: K }>[] =>
  objects.filter((o): o is Extract<MapObject, { kind: K }> => o.kind === kind);

/** Blocking sprites WorldScene adds to the collision grid (NPCs, chests, signs, save points). */
const blockers = (): Cell[] =>
  objects
    .filter(
      (o) => o.kind === 'npc' || o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point',
    )
    .map((o) => ({ x: o.tx, y: o.ty }));

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

/** Name of the ground tile the ASCII source places at (x, y). */
function groundTile(x: number, y: number): string | undefined {
  const ch = [...(src.tiles[y] ?? '')][x];
  const entry = ch === undefined ? undefined : src.legend[ch];
  if (entry === undefined) return undefined;
  return typeof entry === 'string' ? entry : entry.ground;
}

const warpTo = (map: string): WarpObject => {
  const w = ofKind('warp').find((o) => o.targetMap === map);
  expect(w, `warp → ${map}`).toBeDefined();
  return w!;
};

describe('廃坑 B1 (map_mine_b1)', () => {
  it('is a 40x35 dungeon with the mine encounter groups and no free saving', () => {
    expect(src.width).toBe(40);
    expect(src.height).toBe(35);
    expect(src.tiles).toHaveLength(35);
    for (const row of src.tiles) expect([...row]).toHaveLength(40);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toEqual({
      id: MINE_B1,
      displayName: '廃坑 B1',
      kind: 'dungeon',
      bgmKey: 'bgm_mine',
      battleBgKey: 'bg_mine',
      encounterGroups: ['grp_mine_a', 'grp_mine_b'],
      tilesets: ['ts_placeholder'],
      entrance: { x: 20, y: 33, facing: 'up' },
      canSaveAnywhere: false,
    });
  });

  it('lays rails as walkable decoration on the stone floor', () => {
    expect(src.legend['=']).toEqual({ ground: 'floor_stone', deco: 'rail' });
    const rails = src.tiles.flatMap((row, y) =>
      [...row].flatMap((ch, x) => (ch === '=' ? [{ x, y }] : [])),
    );
    expect(rails.length).toBeGreaterThan(40);
    for (const r of rails) expect(grid.isBlocked(r.x, r.y), cellKey(r)).toBe(false);
    // The line forks: some rail tiles have three rail neighbours.
    const isRail = (c: Cell): boolean => rails.some((r) => r.x === c.x && r.y === c.y);
    const forks = rails.filter((r) => neighbours(r).filter(isRail).length >= 3);
    expect(forks.length).toBeGreaterThanOrEqual(2);
  });

  it('starts the player on a walkable tile just inside the south door, facing up', () => {
    expect(entrance).toEqual({ x: 20, y: 33, facing: 'up' });
    expect(grid.isBlocked(entrance.x, entrance.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(entrance.x, entrance.y)).toBe(false);
  });

  it('has exactly two warps: the south door and the ladder down', () => {
    expect(ofKind('warp')).toHaveLength(2);
    for (const w of ofKind('warp')) {
      expect(w.requiredItem, cellKey({ x: w.tx, y: w.ty })).toBeUndefined();
      expect(w.lockedTextId, cellKey({ x: w.tx, y: w.ty })).toBeUndefined();
      expect(w.doorFlag, cellKey({ x: w.tx, y: w.ty })).toBeUndefined();
    }
  });

  it('warps south to the town tile in front of its north gate, facing down', () => {
    const south = warpTo(TOWN);
    expect(south).toMatchObject({
      tx: 20,
      ty: 34,
      tw: 1,
      th: 1,
      targetMap: TOWN,
      targetX: 18,
      targetY: 1,
      facing: 'down',
    });
    // The door tile is on the map edge, walkable, and directly behind the entrance.
    expect(south.ty).toBe(src.height - 1);
    expect(groundTile(south.tx, south.ty)).toBe('door');
    expect(grid.isBlocked(south.tx, south.ty)).toBe(false);
    expect(manhattan({ x: south.tx, y: south.ty }, entrance)).toBe(1);
  });

  it('climbs down to B2 from a stairs tile at (36, 4), landing below it facing down', () => {
    const ladder = warpTo(MINE_B2);
    expect(ladder).toMatchObject({
      tx: 36,
      ty: 4,
      tw: 1,
      th: 1,
      targetMap: MINE_B2,
      targetX: 36,
      targetY: 5,
      facing: 'down',
    });
    expect(groundTile(ladder.tx, ladder.ty)).toBe('stairs');
    expect(grid.isBlocked(ladder.tx, ladder.ty)).toBe(false);
    // B2's ladder up lands on (36, 5) facing down: walkable, clear of sprites, below the ladder.
    const landing: Cell = { x: 36, y: 5 };
    expect(grid.isBlocked(landing.x, landing.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(landing.x, landing.y)).toBe(false);
    expect(manhattan(landing, { x: ladder.tx, y: ladder.ty })).toBe(1);
    expect(landing.y).toBe(ladder.ty + 1);
  });

  it('holds the three chests from §3.1', () => {
    const chests = ofKind('chest')
      .map((c) => ({
        tx: c.tx,
        ty: c.ty,
        itemId: c.itemId,
        qty: c.qty,
        flag: c.flag,
        tide: c.tide,
      }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { tx: 3, ty: 10, itemId: 'it_potion_s', qty: 2, flag: 'chest.mine_b1_01', tide: 'any' },
      { tx: 13, ty: 3, itemId: 'it_numb_herb', qty: 2, flag: 'chest.mine_b1_02', tide: 'any' },
      { tx: 37, ty: 11, itemId: 'gold', qty: 150, flag: 'chest.mine_b1_03', tide: 'any' },
    ]);
    for (const c of ofKind('chest')) {
      expect(grid.isBlocked(c.tx, c.ty), c.flag).toBe(false);
      expect(manhattan({ x: c.tx, y: c.ty }, entrance), c.flag).toBeGreaterThanOrEqual(6);
    }
  });

  it('places five normal symbols in the mine groups, away from the entrance, with room to roam', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(5);
    const counts = new Map<string, number>();
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(e.tide, label).toBe('any');
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan({ x: e.tx, y: e.ty }, entrance), label).toBeGreaterThanOrEqual(6);
      expect(e.groupIds.length, label).toBeGreaterThan(0);
      for (const g of e.groupIds) expect(MINE_GROUPS.has(g), `${label} group ${g}`).toBe(true);
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
      const key = e.groupIds.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.get('grp_mine_a')).toBe(3);
    expect(counts.get('grp_mine_b')).toBe(1);
    expect(counts.get('grp_mine_a,grp_mine_b')).toBe(1);
    expect(enemies.map((e) => ({ x: e.tx, y: e.ty }))).toEqual([
      { x: 16, y: 17 },
      { x: 24, y: 19 },
      { x: 6, y: 12 },
      { x: 18, y: 5 },
      { x: 33, y: 5 },
    ]);
  });

  it('has the entrance sign and nothing else', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 22, ty: 33, textId: 'dlg_sign_mine_b1' });
    expect(grid.isBlocked(signs[0]!.tx, signs[0]!.ty)).toBe(false);
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, entrance)).toBeLessThanOrEqual(3);
    expect(ofKind('npc')).toHaveLength(0);
    expect(ofKind('save_point')).toHaveLength(0);
    expect(ofKind('trigger')).toHaveLength(0);
  });

  it('reaches every object from the entrance and gives each sprite its own tile', () => {
    const runtime = grid.withBlocked(blockers());
    const reachable = reachableFrom(runtime, entrance);
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
          ofKind('warp').some((w) => w.tx === o.tx && w.ty === o.ty),
          `${label} sits on the warp`,
        ).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
    // Nothing is walled off: every walkable tile belongs to the one cave the door opens on.
    let walkable = 0;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) if (!runtime.isBlocked(x, y)) walkable += 1;
    expect(reachable.size).toBe(walkable);
  });

  it('offers a loop so the central chamber and gallery symbols can be bypassed', () => {
    const ladder = warpTo(MINE_B2);
    const ladderCell = { x: ladder.tx, y: ladder.ty };
    // Seal the north corridor out of the central chamber: the east shaft still leads up.
    const northSealed = grid.withBlocked([...blockers(), { x: 20, y: 14 }, { x: 21, y: 14 }]);
    expect(reachableFrom(northSealed, entrance).has(cellKey(ladderCell))).toBe(true);
    // Seal the east shaft: the gallery route still leads to the ladder chamber.
    const shaftSealed = grid.withBlocked([...blockers(), { x: 33, y: 10 }, { x: 34, y: 10 }]);
    expect(reachableFrom(shaftSealed, entrance).has(cellKey(ladderCell))).toBe(true);
    // Both sealed: the ladder chamber is cut off, so those really are the only two ways up.
    const bothSealed = grid.withBlocked([
      ...blockers(),
      { x: 20, y: 14 },
      { x: 21, y: 14 },
      { x: 33, y: 10 },
      { x: 34, y: 10 },
    ]);
    expect(reachableFrom(bothSealed, entrance).has(cellKey(ladderCell))).toBe(false);
  });
});
