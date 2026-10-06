import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { map_coast_road } from '@data/maps/map_coast_road';
import { map_whisper_forest } from '@data/maps/map_whisper_forest';
import type { Facing } from '@data/types';

/**
 * Chapter 1 field maps (docs/GAME_DESIGN.md §3.1): the coast road's east end now opens
 * onto ささやきの森. The maps are imported directly so these checks do not depend on
 * the registry in src/data/maps/index.ts; the generic sweep in maps-data.test.ts covers
 * them once they are registered there.
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
const COAST = 'map_coast_road';
const SHRINE = 'map_forest_shrine';

const forestMap = compileMap(map_whisper_forest);
const coastMap = compileMap(map_coast_road);
const forest = parseMapObjects(forestMap);
const coast = parseMapObjects(coastMap);
const forestGrid = CollisionGrid.fromMap(forestMap);
const coastGrid = CollisionGrid.fromMap(coastMap);
const forestEntrance: Cell = map_whisper_forest.meta.entrance;

const warps = (objects: MapObject[]): WarpObject[] =>
  objects.filter((o): o is WarpObject => o.kind === 'warp');
const blockers = (objects: MapObject[]): Blocker[] => objects.filter(isBlocker);
const vine = forest.find((o) => o.kind === 'npc' && o.id === 'npc_forest_vine');
const northEastWarp = warps(forest).find((w) => w.tx === map_whisper_forest.width - 1);
const shrineWarp = warps(forest).find((w) => w.targetMap === SHRINE);

/** Runtime walkability of the forest with the given NPCs present (vine in or out). */
const forestGridWith = (present: (o: Blocker) => boolean): CollisionGrid =>
  forestGrid.withBlocked(blockers(forest).filter(present).map(cellOf));

describe('海岸街道 east end ↔ ささやきの森 west edge', () => {
  const coastEast = warps(coast).filter((w) => w.tx === map_coast_road.width - 1);
  const forestWest = warps(forest).filter((w) => w.tx === 0);

  it('warps from the coast road east edge to the forest entrance, facing right', () => {
    expect(coastEast).toHaveLength(1);
    expect(coastEast[0]).toMatchObject({
      tx: 39,
      ty: 12,
      tw: 1,
      th: 2,
      targetMap: FOREST,
      targetX: forestEntrance.x,
      targetY: forestEntrance.y,
      facing: 'right',
    });
    expect(forestEntrance).toEqual({ x: 1, y: 20, facing: 'right' });
    // The road rows now run through to the edge: the warp tiles and the landing are open.
    for (const c of rectCells(coastEast[0]!)) expect(coastGrid.isBlocked(c.x, c.y)).toBe(false);
    expect(coastGrid.isBlocked(39, 11)).toBe(true);
    expect(coastGrid.isBlocked(39, 14)).toBe(true);
    expect(forestGrid.isBlocked(forestEntrance.x, forestEntrance.y)).toBe(false);
  });

  it('warps from the forest west edge back to the coast road east end, facing left', () => {
    expect(forestWest).toHaveLength(1);
    expect(forestWest[0]).toMatchObject({
      tx: 0,
      ty: 20,
      tw: 1,
      th: 2,
      targetMap: COAST,
      targetX: 38,
      targetY: 12,
      facing: 'left',
    });
    expect(coastGrid.isBlocked(38, 12)).toBe(false);
    for (const c of rectCells(forestWest[0]!)) expect(forestGrid.isBlocked(c.x, c.y)).toBe(false);
    // The east-end sign that used to seal the road is gone, so the landing is clear at runtime.
    expect(blockers(coast).some((o) => o.tx === 38 && o.ty === 12)).toBe(false);
    expect(coast.filter((o) => o.kind === 'sign').map((s) => s.textId)).toEqual([
      'dlg_sign_coast_tutorial',
    ]);
  });

  it('lands each way with the return warp directly behind the player', () => {
    const pairs: [WarpObject, WarpObject][] = [
      [coastEast[0]!, forestWest[0]!],
      [forestWest[0]!, coastEast[0]!],
    ];
    for (const [w, back] of pairs) {
      const landing: Cell = { x: w.targetX, y: w.targetY };
      expect(touchesRect(back, landing)).toBe(true);
      expect(touchesRect(w, { x: back.targetX, y: back.targetY })).toBe(true);
      const d = FACING_DELTA[w.facing];
      expect(inRect(back, { x: landing.x - d.x, y: landing.y - d.y })).toBe(true);
    }
    expect(touchesRect(forestWest[0]!, forestEntrance)).toBe(true);
  });
});

describe('ささやきの森 (map_whisper_forest)', () => {
  it('is a 50x40 field map with the forest encounter groups and no free saving (§3.1)', () => {
    expect(map_whisper_forest.width).toBe(50);
    expect(map_whisper_forest.height).toBe(40);
    expect(map_whisper_forest.tiles).toHaveLength(40);
    for (const row of map_whisper_forest.tiles) expect([...row]).toHaveLength(50);
    expect(map_whisper_forest.meta).toMatchObject({
      id: FOREST,
      displayName: 'ささやきの森',
      kind: 'field',
      bgmKey: 'bgm_forest',
      battleBgKey: 'bg_forest',
      encounterGroups: ['grp_forest_a', 'grp_forest_b', 'grp_forest_c'],
      canSaveAnywhere: false,
    });
  });

  it('has exactly three warps: west edge, shrine door and north-east edge', () => {
    expect(warps(forest)).toHaveLength(3);
    expect(shrineWarp).toBeDefined();
    expect(northEastWarp).toBeDefined();
  });

  it('locks the shrine door on it_key_shrine and sends the player to (15, 28) facing up', () => {
    expect(shrineWarp).toMatchObject({
      tx: 25,
      ty: 3,
      tw: 1,
      th: 1,
      targetMap: SHRINE,
      targetX: 15,
      targetY: 28,
      facing: 'up',
      requiredItem: 'it_key_shrine',
      lockedTextId: 'dlg_shrine_door_locked',
      doorFlag: 'door.forest_shrine_01',
    });
    // The door sits on a `D` tile at the top of the clearing, with the tile in front open.
    expect(map_whisper_forest.tiles[3]?.[25]).toBe('D');
    expect(forestGrid.isBlocked(25, 3)).toBe(false);
    expect(forestGrid.isBlocked(25, 4)).toBe(false);
    const reachable = reachableFrom(
      forestGridWith(() => true),
      forestEntrance,
    );
    expect(reachable.has(cellKey({ x: 25, y: 4 }))).toBe(true);
  });

  it('seals the north-east exit with the thorn vine until the first fragment (§13 #7)', () => {
    expect(vine).toMatchObject({
      kind: 'npc',
      id: 'npc_forest_vine',
      dialog: 'dlg_forest_vine',
      facing: 'down',
      sprite: 'sprite_npc',
      hiddenIf: 'fragments.count>=1',
    });
    expect(northEastWarp).toMatchObject({
      tx: 49,
      ty: 6,
      tw: 1,
      th: 1,
      targetMap: 'map_mountain_road',
      targetX: 1,
      targetY: 17,
      facing: 'right',
    });
    // The vine stands on the single trail tile right before the warp ...
    expect(manhattan(cellOf(vine!), cellOf(northEastWarp!))).toBe(1);
    expect(forestGrid.isBlocked(vine!.tx, vine!.ty)).toBe(false);
    // ... so with the vine in place nothing past it can be reached, and without it the
    // warp is reachable from the entrance.
    const sealed = reachableFrom(
      forestGridWith(() => true),
      forestEntrance,
    );
    expect(sealed.has(cellKey(cellOf(northEastWarp!)))).toBe(false);
    expect(neighbours(cellOf(vine!)).some((c) => sealed.has(cellKey(c)))).toBe(true);
    const open = reachableFrom(
      forestGridWith((o) => !(o.kind === 'npc' && o.id === 'npc_forest_vine')),
      forestEntrance,
    );
    expect(open.has(cellKey(cellOf(northEastWarp!)))).toBe(true);
    // The vine is the only thing in the way: every other object stays reachable while it stands.
    for (const o of forest) {
      if (o === northEastWarp || o === vine) continue;
      if (o.kind === 'warp' || isBlocker(o))
        expect(
          neighbours(cellOf(o)).some((c) => sealed.has(cellKey(c))) ||
            rectCells(o).some((c) => sealed.has(cellKey(c))),
          `${o.kind} at (${o.tx}, ${o.ty}) sealed off by the vine`,
        ).toBe(true);
    }
  });

  it('holds the five chests of §7.1 / §14 with their exact items, quantities and flags', () => {
    const chests = forest
      .filter((o) => o.kind === 'chest')
      .map((c) => ({ x: c.tx, y: c.ty, itemId: c.itemId, qty: c.qty, flag: c.flag }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { x: 10, y: 17, itemId: 'it_herb', qty: 3, flag: 'chest.forest_01' },
      { x: 46, y: 33, itemId: 'it_key_shrine', qty: 1, flag: 'chest.forest_02' },
      { x: 42, y: 17, itemId: 'gold', qty: 120, flag: 'chest.forest_03' },
      { x: 23, y: 4, itemId: 'it_fire_stone', qty: 2, flag: 'chest.forest_04' },
      { x: 2, y: 31, itemId: 'it_shell_necklace', qty: 1, flag: 'chest.forest_05' },
    ]);
    for (const c of chests) expect(forestGrid.isBlocked(c.x, c.y), c.flag).toBe(false);
    // The shrine key waits at the tip of a dead-end trail in the east half.
    const key = chests.find((c) => c.flag === 'chest.forest_02')!;
    expect(key.x).toBeGreaterThanOrEqual(25);
    expect(neighbours(key).filter((c) => !forestGrid.isBlocked(c.x, c.y))).toHaveLength(1);
    // The necklace is tucked behind a tree in the west: open on one side only (§14).
    const necklace = chests.find((c) => c.flag === 'chest.forest_05')!;
    expect(necklace.x).toBeLessThan(25);
    expect(neighbours(necklace).filter((c) => !forestGrid.isBlocked(c.x, c.y))).toHaveLength(1);
    // The fire stones are in the shrine clearing, a few steps from the door.
    const fire = chests.find((c) => c.flag === 'chest.forest_04')!;
    expect(manhattan(fire, cellOf(shrineWarp!))).toBeLessThanOrEqual(4);
  });

  it('places six unconditional enemy symbols on open ground, away from the entrance', () => {
    const enemies = forest.filter((o) => o.kind === 'enemy');
    expect(enemies).toHaveLength(6);
    const byGroups = (groups: string[]) =>
      enemies.filter(
        (e) => e.groupIds.length === groups.length && groups.every((g) => e.groupIds.includes(g)),
      );
    expect(byGroups(['grp_forest_a'])).toHaveLength(3);
    expect(byGroups(['grp_forest_b'])).toHaveLength(2);
    expect(byGroups(['grp_forest_b', 'grp_forest_c'])).toHaveLength(1);
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(4);
      expect(e.condition, label).toBeUndefined();
      expect(forestGrid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan(cellOf(e), forestEntrance), label).toBeGreaterThanOrEqual(6);
      // §5.12: the symbol wanders within `radius`, so most of that square must be open ground.
      expect(openShare(forestGrid, cellOf(e), e.radius), `${label} wander area`).toBeGreaterThan(
        0.5,
      );
    }
    for (const src of map_whisper_forest.objects)
      if (src.type === 'enemy') expect('condition' in src).toBe(false);
  });

  it('has the entrance sign, the hint sign beside the shrine door and one save point', () => {
    const signs = forest.filter((o) => o.kind === 'sign');
    expect(signs.map((s) => s.textId).sort()).toEqual([
      'dlg_sign_forest_entrance',
      'dlg_sign_forest_hint',
    ]);
    const entranceSign = signs.find((s) => s.textId === 'dlg_sign_forest_entrance')!;
    expect(manhattan(cellOf(entranceSign), forestEntrance)).toBeLessThanOrEqual(4);
    const hintSign = signs.find((s) => s.textId === 'dlg_sign_forest_hint')!;
    expect(manhattan(cellOf(hintSign), cellOf(shrineWarp!))).toBeLessThanOrEqual(4);
    const saves = forest.filter((o) => o.kind === 'save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 20, ty: 5, heal: false });
    expect(manhattan(cellOf(saves[0]!), cellOf(shrineWarp!))).toBeLessThanOrEqual(8);
  });

  it('keeps every object on its own walkable tile, off the warps, reachable from the entrance', () => {
    const taken = new Set<string>();
    for (const o of blockers(forest)) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      expect(forestGrid.isBlocked(o.tx, o.ty), label).toBe(false);
      expect(taken.has(cellKey(cellOf(o))), `${label} shares a tile`).toBe(false);
      taken.add(cellKey(cellOf(o)));
      expect(
        warps(forest).some((w) => inRect(w, cellOf(o))),
        `${label} sits on a warp`,
      ).toBe(false);
    }
    // Only the gated vine is left out, as in the generic sweep (maps-data.test.ts).
    const grid = forestGridWith((o) => !(o.kind === 'npc' && o.hiddenIf !== undefined));
    expect(grid.isBlocked(forestEntrance.x, forestEntrance.y)).toBe(false);
    const reachable = reachableFrom(grid, forestEntrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    for (const o of forest) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'warp') {
        const ok =
          o.requiredItem === undefined
            ? rectCells(o).every(reached)
            : rectCells(o).flatMap(neighbours).some(reached);
        expect(ok, `${label} unreachable`).toBe(true);
      } else if (o.kind === 'enemy') {
        expect(reached(cellOf(o)), `${label} unreachable`).toBe(true);
      } else if (isBlocker(o)) {
        expect(neighbours(cellOf(o)).some(reached), `${label} cannot be approached`).toBe(true);
      }
    }
  });
});
