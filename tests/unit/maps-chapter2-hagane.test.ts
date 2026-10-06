import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type {
  ChestObject,
  MapObject,
  NpcObject,
  SignObject,
  TriggerObject,
  WarpObject,
} from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry, MapSource } from '@core/map/source';
import { OVERLAY_EMPTY, normalizeLegendEntry } from '@core/map/source';
import { map_hagane_goro_house } from '@data/maps/map_hagane_goro_house';
import { map_hagane_inn } from '@data/maps/map_hagane_inn';
import { map_hagane_shop } from '@data/maps/map_hagane_shop';
import { map_hagane_town } from '@data/maps/map_hagane_town';
import type { Facing } from '@data/types';

/**
 * Chapter 2 town maps (docs/GAME_DESIGN.md §3.1 rows map_hagane_town / map_hagane_inn /
 * map_hagane_shop / map_hagane_goro_house, §7.5, §7.6, §13 #8-10, §14 sq_shining_ore).
 * The maps are imported directly so this file does not depend on the registry in
 * src/data/maps/index.ts; the generic sweep in maps-data.test.ts covers them once they
 * are registered there.
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
const rectNeighbours = (r: Rect): Cell[] =>
  rectCells(r)
    .flatMap(neighbours)
    .filter((c) => !inRect(r, c));
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

/** Share of the (2r+1)² wander square that is open ground (§9.3 `move: random`, r = 2). */
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

interface Authored {
  src: MapSource;
  objects: MapObject[];
  grid: CollisionGrid;
}

const load = (src: MapSource): Authored => {
  const map = compileMap(src);
  return { src, objects: parseMapObjects(map), grid: CollisionGrid.fromMap(map) };
};

const TOWN = 'map_hagane_town';
const INN = 'map_hagane_inn';
const SHOP = 'map_hagane_shop';
const GORO = 'map_hagane_goro_house';

const maps: Record<string, Authored> = {
  [TOWN]: load(map_hagane_town),
  [INN]: load(map_hagane_inn),
  [SHOP]: load(map_hagane_shop),
  [GORO]: load(map_hagane_goro_house),
};
const MAP_IDS = Object.keys(maps);
const of = (id: string): Authored => {
  const m = maps[id];
  if (!m) throw new Error(`not under test: ${id}`);
  return m;
};
const objectsOf = (id: string): MapObject[] => of(id).objects;
const warpsOf = (id: string): WarpObject[] =>
  objectsOf(id).filter((o): o is WarpObject => o.kind === 'warp');
const npcsOf = (id: string): NpcObject[] =>
  objectsOf(id).filter((o): o is NpcObject => o.kind === 'npc');
const npc = (id: string, npcId: string): NpcObject | undefined =>
  npcsOf(id).find((o) => o.id === npcId);
const chestsOf = (id: string): ChestObject[] =>
  objectsOf(id).filter((o): o is ChestObject => o.kind === 'chest');
const signsOf = (id: string): SignObject[] =>
  objectsOf(id).filter((o): o is SignObject => o.kind === 'sign');
const triggersOf = (id: string): TriggerObject[] =>
  objectsOf(id).filter((o): o is TriggerObject => o.kind === 'trigger');
const blockersOf = (id: string): Blocker[] => objectsOf(id).filter(isBlocker);
/** Runtime walkability: the collision layer plus the given objects' tiles. */
const gridWith = (id: string, blockers: readonly Blocker[]): CollisionGrid =>
  of(id).grid.withBlocked(blockers.map(cellOf));
const entranceOf = (id: string): Cell => of(id).src.meta.entrance;

const town = of(TOWN);
const westGate = warpsOf(TOWN).find((w) => w.tx === 0);
const northGate = warpsOf(TOWN).find((w) => w.ty === 0);
const southGate = warpsOf(TOWN).find((w) => w.ty === map_hagane_town.height - 1);
const southGuard = npc(TOWN, 'npc_hagane_south_guard');
const CROSSROADS: Cell = { x: 18, y: 14 };

describe('chapter 2 ハガネ maps: dimensions and meta (§3.1)', () => {
  const expected: Record<
    string,
    {
      width: number;
      height: number;
      displayName: string;
      kind: string;
      entrance: Cell & { facing: Facing };
    }
  > = {
    [TOWN]: {
      width: 36,
      height: 28,
      displayName: '鉱山町ハガネ',
      kind: 'town',
      entrance: { x: 1, y: 14, facing: 'right' },
    },
    [INN]: {
      width: 14,
      height: 10,
      displayName: '宿屋「つるはし」',
      kind: 'interior',
      entrance: { x: 6, y: 8, facing: 'up' },
    },
    [SHOP]: {
      width: 14,
      height: 10,
      displayName: 'ハガネのかじや',
      kind: 'interior',
      entrance: { x: 7, y: 8, facing: 'up' },
    },
    [GORO]: {
      width: 12,
      height: 10,
      displayName: 'ゴローの家',
      kind: 'interior',
      entrance: { x: 5, y: 8, facing: 'up' },
    },
  };

  it.each(MAP_IDS)(
    '%s has the §3.1 size, name, kind, bgm, battle background and entrance',
    (id) => {
      const { src } = of(id);
      const want = expected[id]!;
      expect(src.width).toBe(want.width);
      expect(src.height).toBe(want.height);
      expect(src.tiles).toHaveLength(want.height);
      for (const row of src.tiles) expect([...row]).toHaveLength(want.width);
      expect(src.meta).toEqual({
        id,
        displayName: want.displayName,
        kind: want.kind,
        bgmKey: 'bgm_village',
        battleBgKey: 'bg_mine',
        encounterGroups: [],
        tilesets: ['ts_placeholder'],
        entrance: want.entrance,
        canSaveAnywhere: true,
      });
      expect(of(id).grid.isBlocked(want.entrance.x, want.entrance.y)).toBe(false);
    },
  );

  it('lays the mine rail along the north street from the gate down to the crossroads', () => {
    const rail = Object.entries(map_hagane_town.legend).find(
      ([, e]) => normalizeLegendEntry(e).deco === 'rail',
    );
    expect(rail).toBeDefined();
    const [ch, entry] = rail!;
    expect(normalizeLegendEntry(entry)).toEqual({ ground: 'path', deco: 'rail' });
    for (let y = 1; y <= 13; y++) {
      expect(map_hagane_town.tiles[y]?.[18], `rail at (18, ${y})`).toBe(ch);
      expect(town.grid.isBlocked(18, y), `rail at (18, ${y}) walkable`).toBe(false);
    }
    // Cliffs close the top of the town on both sides of the gate.
    // The street is three tiles wide (x17–19) under the gate; cliffs close the rest of row 1.
    for (const x of [0, 5, 16, 20, 30, 35]) expect(groundTile(map_hagane_town, x, 1)).toBe('cliff');
  });
});

describe('ハガネ interiors ↔ town doors', () => {
  const doors: { interior: string; door: Cell; landing: Cell }[] = [
    { interior: INN, door: { x: 6, y: 12 }, landing: { x: 6, y: 13 } },
    { interior: SHOP, door: { x: 23, y: 12 }, landing: { x: 23, y: 13 } },
    { interior: GORO, door: { x: 12, y: 6 }, landing: { x: 12, y: 7 } },
  ];

  it.each(doors)(
    '$interior: town door warp lands in front of the interior door, facing up',
    ({ interior, door }) => {
      const entrance = entranceOf(interior);
      const warp = warpsOf(TOWN).find((w) => w.targetMap === interior);
      expect(warp).toMatchObject({
        tx: door.x,
        ty: door.y,
        tw: 1,
        th: 1,
        targetX: entrance.x,
        targetY: entrance.y,
        facing: 'up',
      });
      expect(groundTile(map_hagane_town, door.x, door.y)).toBe('door');
      expect(town.grid.isBlocked(door.x, door.y)).toBe(false);
      // The interior door sits right behind the landing, in the bottom wall.
      const back = warpsOf(interior);
      expect(back).toHaveLength(1);
      expect(back[0]).toMatchObject({
        tx: entrance.x,
        ty: of(interior).src.height - 1,
        targetMap: TOWN,
      });
      expect(groundTile(of(interior).src, back[0]!.tx, back[0]!.ty)).toBe('door');
      expect(gridWith(interior, blockersOf(interior)).isBlocked(entrance.x, entrance.y)).toBe(
        false,
      );
    },
  );

  it.each(doors)(
    '$interior: interior door warp lands on the tile in front of the town door, facing down',
    ({ interior, door, landing }) => {
      const back = warpsOf(interior)[0]!;
      expect(back).toMatchObject({ targetX: landing.x, targetY: landing.y, facing: 'down' });
      expect(manhattan(landing, door)).toBe(1);
      expect(gridWith(TOWN, blockersOf(TOWN)).isBlocked(landing.x, landing.y)).toBe(false);
      expect(groundTile(map_hagane_town, landing.x, landing.y)).not.toBe('door');
    },
  );

  it.each(doors)(
    '$interior: both landings have the return warp directly behind the player',
    ({ interior }) => {
      const out = warpsOf(TOWN).find((w) => w.targetMap === interior)!;
      const back = warpsOf(interior)[0]!;
      for (const [w, ret] of [
        [out, back],
        [back, out],
      ] as const) {
        const landing: Cell = { x: w.targetX, y: w.targetY };
        expect(touchesRect(ret, landing)).toBe(true);
        expect(touchesRect(w, { x: ret.targetX, y: ret.targetY })).toBe(true);
        const d = FACING_DELTA[w.facing];
        expect(inRect(ret, { x: landing.x - d.x, y: landing.y - d.y })).toBe(true);
        expect(inRect(ret, landing)).toBe(false);
      }
    },
  );

  it.each(MAP_IDS)(
    '%s puts a warp on every door tile and every warp on a door tile or the map edge',
    (id) => {
      const { src } = of(id);
      const warps = warpsOf(id);
      const isDoor = (c: Cell): boolean => groundTile(src, c.x, c.y) === 'door';
      const isEdge = (c: Cell): boolean =>
        c.x === 0 || c.y === 0 || c.x === src.width - 1 || c.y === src.height - 1;
      for (let y = 0; y < src.height; y++)
        for (let x = 0; x < src.width; x++)
          if (isDoor({ x, y }))
            expect(
              warps.some((w) => inRect(w, { x, y })),
              `${id} door tile (${x}, ${y}) has no warp`,
            ).toBe(true);
      for (const w of warps)
        expect(
          rectCells(w).some((c) => isDoor(c) || isEdge(c)),
          `${id} warp at (${w.tx}, ${w.ty}) is neither on a door tile nor on the map edge`,
        ).toBe(true);
    },
  );
});

describe('鉱山町ハガネ gates', () => {
  it('has exactly six warps: three gates and three doors', () => {
    expect(warpsOf(TOWN)).toHaveLength(6);
    expect(westGate).toBeDefined();
    expect(northGate).toBeDefined();
    expect(southGate).toBeDefined();
  });

  // 山道 (not authored here) ends at (39, 4) h2 and warps to this entrance; (38, 4) is
  // the tile in front of that exit.
  it('west gate: (0, 14) h2 → 山道 (38, 4) facing left, next to the entrance facing right', () => {
    expect(westGate).toMatchObject({
      tx: 0,
      ty: 14,
      tw: 1,
      th: 2,
      targetMap: 'map_mountain_road',
      targetX: 38,
      targetY: 4,
      facing: 'left',
    });
    const entrance = map_hagane_town.meta.entrance;
    expect(entrance).toEqual({ x: 1, y: 14, facing: 'right' });
    expect(touchesRect(westGate!, entrance)).toBe(true);
    for (const c of rectCells(westGate!)) expect(town.grid.isBlocked(c.x, c.y)).toBe(false);
    expect(town.grid.isBlocked(0, 13)).toBe(true);
    expect(town.grid.isBlocked(0, 16)).toBe(true);
    // Arriving from the road faces right, away from the gate, onto the west road.
    expect(gridWith(TOWN, blockersOf(TOWN)).isBlocked(entrance.x, entrance.y)).toBe(false);
    expect(town.grid.isBlocked(2, 14)).toBe(false);
    expect(groundTile(map_hagane_town, 1, 14)).toBe('path');
    expect(groundTile(map_hagane_town, 1, 15)).toBe('path');
  });

  it('north gate: a key door on (18, 0) → 廃坑 B1 (20, 33) facing up, locked on it_key_mine', () => {
    expect(northGate).toMatchObject({
      tx: 18,
      ty: 0,
      tw: 1,
      th: 1,
      targetMap: 'map_mine_b1',
      targetX: 20,
      targetY: 33,
      facing: 'up',
      requiredItem: 'it_key_mine',
      lockedTextId: 'dlg_mine_door_locked',
      doorFlag: 'door.hagane_mine_01',
    });
    expect(groundTile(map_hagane_town, 18, 0)).toBe('door');
    expect(town.grid.isBlocked(18, 0)).toBe(false);
    // Used from the rail tile in front of it, which the player can reach.
    expect(town.grid.isBlocked(18, 1)).toBe(false);
    const reachable = reachableFrom(gridWith(TOWN, blockersOf(TOWN)), entranceOf(TOWN));
    expect(reachable.has(cellKey({ x: 18, y: 1 }))).toBe(true);
    // The gate is framed by walls in the cliff; nothing else on row 0 is open.
    for (let x = 0; x < map_hagane_town.width; x++)
      if (x !== 18) expect(town.grid.isBlocked(x, 0), `(${x}, 0)`).toBe(true);
  });

  it('south gate: (18, 27) bounces back to (18, 26) facing away until 磯の道 exists', () => {
    // TODO(Phase 4c): map_shore_path — then target its north edge facing 'down'.
    expect(southGate).toMatchObject({
      tx: 18,
      ty: 27,
      tw: 1,
      th: 1,
      targetMap: TOWN,
      targetX: 18,
      targetY: 26,
      facing: 'up',
    });
    expect(town.grid.isBlocked(18, 26)).toBe(false);
    expect(town.grid.isBlocked(18, 27)).toBe(false);
    // Facing away from the warp: the tile behind the landing is the warp itself.
    const d = FACING_DELTA[southGate!.facing];
    expect(inRect(southGate!, { x: 18 - d.x, y: 26 - d.y })).toBe(true);
    // No blocker on the landing or the warp.
    expect(blockersOf(TOWN).some((o) => o.ty >= 26)).toBe(false);
  });

  it('south guard: stands in the one-tile fence gap and seals the south gate until the second fragment (§13 #10)', () => {
    expect(southGuard).toMatchObject({
      kind: 'npc',
      tx: 18,
      ty: 25,
      dialog: 'dlg_hagane_south_guard',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
      hiddenIf: 'fragments.count>=2',
    });
    expect(town.grid.isBlocked(18, 25)).toBe(false);
    expect(groundTile(map_hagane_town, 17, 25)).toBe('grass');
    expect(legendAt(map_hagane_town, 17, 25)?.deco).toBe('fence');
    expect(legendAt(map_hagane_town, 19, 25)?.deco).toBe('fence');
    expect(town.grid.isBlocked(17, 25)).toBe(true);
    expect(town.grid.isBlocked(19, 25)).toBe(true);
    expect(manhattan(cellOf(southGuard!), { x: 18, y: 26 })).toBe(1);

    const entrance = entranceOf(TOWN);
    // Guard present: nothing past him can be reached, everything else can.
    const sealed = reachableFrom(gridWith(TOWN, blockersOf(TOWN)), entrance);
    expect(sealed.has(cellKey({ x: 18, y: 26 }))).toBe(false);
    expect(sealed.has(cellKey(cellOf(southGate!)))).toBe(false);
    expect(sealed.has(cellKey({ x: 18, y: 24 }))).toBe(true);
    for (const o of objectsOf(TOWN)) {
      if (o === southGate || o === southGuard) continue;
      const label = `${o.kind} at (${o.tx}, ${o.ty}) sealed off by the guard`;
      if (o.kind === 'warp') {
        const ok =
          o.requiredItem === undefined
            ? rectCells(o).every((c) => sealed.has(cellKey(c)))
            : rectNeighbours(o).some((c) => sealed.has(cellKey(c)));
        expect(ok, label).toBe(true);
      } else if (isBlocker(o)) {
        expect(
          neighbours(cellOf(o)).some((c) => sealed.has(cellKey(c))),
          label,
        ).toBe(true);
      } else {
        expect(
          rectCells(o).every((c) => sealed.has(cellKey(c))),
          label,
        ).toBe(true);
      }
    }
    // Guard hidden: the south gate opens.
    const open = reachableFrom(
      gridWith(
        TOWN,
        blockersOf(TOWN).filter((o) => o !== southGuard),
      ),
      entrance,
    );
    expect(open.has(cellKey({ x: 18, y: 26 }))).toBe(true);
    expect(open.has(cellKey(cellOf(southGate!)))).toBe(true);
  });

  it('fires ev_hagane_arrive once on the two west entrance tiles (§13 #8)', () => {
    const triggers = triggersOf(TOWN);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      tx: 1,
      ty: 14,
      tw: 1,
      th: 2,
      eventId: 'ev_hagane_arrive',
      once: true,
    });
    expect(triggers[0]!.condition).toBeUndefined();
    expect(inRect(triggers[0]!, entranceOf(TOWN))).toBe(true);
    // Both tiles are the road straight in from the gate.
    for (const c of rectCells(triggers[0]!)) {
      expect(town.grid.isBlocked(c.x, c.y)).toBe(false);
      expect(touchesRect(westGate!, c)).toBe(true);
    }
  });
});

describe('鉱山町ハガネ townsfolk and furniture', () => {
  it('has the five townsfolk plus the guard, all on sprite_npc with their dialogs', () => {
    const people = npcsOf(TOWN)
      .map((o) => ({ id: o.id, dialog: o.dialog, move: o.move, facing: o.facing }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(people).toEqual([
      { id: 'npc_hagane_child', dialog: 'dlg_hagane_child', move: 'random', facing: 'down' },
      { id: 'npc_hagane_elder', dialog: 'dlg_hagane_elder', move: 'static', facing: 'down' },
      { id: 'npc_hagane_miner_a', dialog: 'dlg_hagane_miner_a', move: 'random', facing: 'down' },
      { id: 'npc_hagane_miner_b', dialog: 'dlg_hagane_miner_b', move: 'static', facing: 'left' },
      {
        id: 'npc_hagane_south_guard',
        dialog: 'dlg_hagane_south_guard',
        move: 'static',
        facing: 'down',
      },
      { id: 'npc_hagane_woman', dialog: 'dlg_hagane_woman', move: 'static', facing: 'down' },
    ]);
    for (const o of npcsOf(TOWN)) {
      expect(o.sprite, o.id).toBe('sprite_npc');
      expect(o.shop, o.id).toBeUndefined();
      expect(o.innPrice, o.id).toBeUndefined();
      expect(o.markers, o.id).toBeUndefined();
    }
    // Only the guard is gated.
    expect(
      npcsOf(TOWN)
        .filter(isGated)
        .map((o) => o.id),
    ).toEqual(['npc_hagane_south_guard']);
  });

  it('places the wanderers in open squares (§9.3: random walk within 2 tiles)', () => {
    const wanderers = npcsOf(TOWN).filter((o) => o.move === 'random');
    expect(wanderers.map((o) => o.id).sort()).toEqual(['npc_hagane_child', 'npc_hagane_miner_a']);
    const grid = gridWith(
      TOWN,
      blockersOf(TOWN).filter((o) => o.kind !== 'npc'),
    );
    for (const w of wanderers) {
      expect(openShare(grid, cellOf(w), 2), `${w.id} wander area`).toBeGreaterThan(0.8);
      // Not on the gate roads, where they would get in the way of the warps.
      for (const g of [westGate!, southGate!])
        expect(manhattan(cellOf(w), cellOf(g))).toBeGreaterThan(4);
    }
  });

  it('puts the sign at the crossroads, the save point by the inn and the chest behind a house', () => {
    const signs = signsOf(TOWN);
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 16, ty: 13, textId: 'dlg_sign_hagane' });
    expect(manhattan(cellOf(signs[0]!), CROSSROADS)).toBeLessThanOrEqual(3);

    const saves = objectsOf(TOWN).filter((o) => o.kind === 'save_point');
    expect(saves).toHaveLength(1);
    expect(saves[0]).toMatchObject({ tx: 11, ty: 11, heal: false });
    const innDoor = warpsOf(TOWN).find((w) => w.targetMap === INN)!;
    expect(manhattan(cellOf(saves[0]!), cellOf(innDoor))).toBeLessThanOrEqual(6);

    const chests = chestsOf(TOWN);
    expect(chests).toHaveLength(1);
    expect(chests[0]).toMatchObject({
      tx: 10,
      ty: 2,
      itemId: 'it_star_drop',
      qty: 1,
      flag: 'chest.hagane_01',
      tide: 'any',
    });
    // Tucked in the alley behind Goro's house: cliff above, roof below, fence to the west.
    const chest = cellOf(chests[0]!);
    expect(groundTile(map_hagane_town, chest.x, chest.y - 1)).toBe('cliff');
    expect(legendAt(map_hagane_town, chest.x, chest.y + 1)?.above).toBe('roof_red');
    expect(legendAt(map_hagane_town, chest.x - 1, chest.y)?.deco).toBe('fence');
    expect(neighbours(chest).filter((c) => !town.grid.isBlocked(c.x, c.y))).toHaveLength(1);
  });
});

describe('宿屋「つるはし」 (map_hagane_inn)', () => {
  it('has the innkeeper behind the counter at 40G a night (§7.6)', () => {
    const people = npcsOf(INN);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      id: 'npc_hagane_innkeeper',
      dialog: 'dlg_hagane_innkeeper',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
      innPrice: 40,
    });
    expect(people[0]!.shop).toBeUndefined();
    const keeper = cellOf(people[0]!);
    expect(groundTile(map_hagane_inn, keeper.x, keeper.y + 1)).toBe('counter');
    expect(chestsOf(INN)).toHaveLength(0);
    expect(triggersOf(INN)).toHaveLength(0);
  });
});

describe('ハガネのかじや (map_hagane_shop)', () => {
  const smith = npc(SHOP, 'npc_hagane_smith');
  const clerk = npc(SHOP, 'npc_hagane_clerk');

  it('has the smith on the left counter selling arms, with the sq_shining_ore markers (§7.5, §14)', () => {
    expect(smith).toMatchObject({
      dialog: 'dlg_hagane_smith',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
      shop: 'shop_hagane_arms',
      markers: [
        { if: 'sq.ore==2', text: '' },
        { if: 'item.it_shining_ore>=3', text: '？' },
        { if: 'sq.ore==1', text: '！' },
        { if: 'hagane.goro_joined', text: '！' },
      ],
    });
    expect(smith!.innPrice).toBeUndefined();
    expect(smith!.hiddenIf).toBeUndefined();
  });

  it('has the clerk on the right counter selling items (§7.5)', () => {
    expect(clerk).toMatchObject({
      dialog: 'dlg_hagane_clerk',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
      shop: 'shop_hagane_items',
    });
    expect(clerk!.markers).toBeUndefined();
    expect(clerk!.innPrice).toBeUndefined();
  });

  it('seats each of them behind their own counter, smith left of clerk', () => {
    expect(npcsOf(SHOP)).toHaveLength(2);
    expect(smith!.tx).toBeLessThan(clerk!.tx);
    expect(smith!.ty).toBe(clerk!.ty);
    for (const o of [smith!, clerk!]) {
      expect(groundTile(map_hagane_shop, o.tx, o.ty + 1), o.id).toBe('counter');
    }
    // The two counters are separate pieces of furniture.
    const between = Math.floor((smith!.tx + clerk!.tx) / 2);
    expect(groundTile(map_hagane_shop, between, smith!.ty + 1)).not.toBe('counter');
  });
});

describe('ゴローの家 (map_hagane_goro_house)', () => {
  const goro = npc(GORO, 'npc_goro');
  const trigger = triggersOf(GORO)[0];

  it('seats Goro at the table facing the door until he joins (§13 #9)', () => {
    expect(npcsOf(GORO)).toHaveLength(1);
    expect(goro).toMatchObject({
      tx: 5,
      ty: 5,
      dialog: 'dlg_goro_home',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
      hiddenIf: 'hagane.goro_joined',
    });
    expect(groundTile(map_hagane_goro_house, goro!.tx, goro!.ty - 1)).toBe('table');
  });

  it('runs ev_goro_join once from the tile in front of Goro', () => {
    expect(triggersOf(GORO)).toHaveLength(1);
    expect(trigger).toMatchObject({
      tx: 5,
      ty: 6,
      tw: 1,
      th: 1,
      eventId: 'ev_goro_join',
      once: true,
      condition: '!hagane.goro_joined',
    });
    const d = FACING_DELTA[goro!.facing];
    expect(cellOf(trigger!)).toEqual({ x: goro!.tx + d.x, y: goro!.ty + d.y });
    expect(of(GORO).grid.isBlocked(trigger!.tx, trigger!.ty)).toBe(false);
    // Straight in from the door, and not on the landing itself.
    const entrance = entranceOf(GORO);
    expect(trigger!.tx).toBe(entrance.x);
    expect(trigger!.ty).toBeLessThan(entrance.y);
    const reachable = reachableFrom(gridWith(GORO, blockersOf(GORO)), entrance);
    expect(reachable.has(cellKey(cellOf(trigger!)))).toBe(true);
  });

  it('holds two herbs in chest.goro_01', () => {
    expect(chestsOf(GORO)).toMatchObject([
      { tx: 10, ty: 1, itemId: 'it_herb', qty: 2, flag: 'chest.goro_01', tide: 'any' },
    ]);
  });
});

describe('chapter 2 ハガネ maps: reachability and id sweeps', () => {
  it.each(MAP_IDS)('%s keeps every object on its own walkable tile, off the warps', (id) => {
    const taken = new Set<string>();
    for (const o of blockersOf(id)) {
      const label = `${id} ${o.kind} at (${o.tx}, ${o.ty})`;
      expect(of(id).grid.isBlocked(o.tx, o.ty), label).toBe(false);
      expect(taken.has(cellKey(cellOf(o))), `${label} shares a tile`).toBe(false);
      taken.add(cellKey(cellOf(o)));
      expect(
        warpsOf(id).some((w) => inRect(w, cellOf(o))),
        `${label} sits on a warp`,
      ).toBe(false);
      expect(
        triggersOf(id).some((t) => inRect(t, cellOf(o))),
        `${label} sits on a trigger`,
      ).toBe(false);
    }
    for (const w of warpsOf(id))
      for (const c of rectCells(w))
        expect(of(id).grid.isBlocked(c.x, c.y), `${id} warp tile (${c.x}, ${c.y})`).toBe(false);
  });

  it.each(MAP_IDS)('%s reaches every warp, trigger and interactable from the entrance', (id) => {
    const entrance = entranceOf(id);
    // Gated NPCs seal a path for a while; everything must be reachable once they are gone.
    const grid = gridWith(
      id,
      blockersOf(id).filter((o) => !isGated(o)),
    );
    expect(grid.isBlocked(entrance.x, entrance.y)).toBe(false);
    const reachable = reachableFrom(grid, entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    for (const o of objectsOf(id)) {
      const label = `${id} ${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'warp') {
        const ok =
          o.requiredItem === undefined
            ? rectCells(o).every(reached)
            : rectNeighbours(o).some(reached);
        expect(ok, `${label} unreachable`).toBe(true);
      } else if (o.kind === 'trigger') {
        expect(rectCells(o).every(reached), `${label} unreachable`).toBe(true);
      } else if (isBlocker(o)) {
        expect(neighbours(cellOf(o)).some(reached), `${label} cannot be approached`).toBe(true);
      }
    }
  });

  it.each(MAP_IDS)('%s keeps its entrance and the landings of its warps clear at runtime', (id) => {
    const entrance = entranceOf(id);
    expect(gridWith(id, blockersOf(id)).isBlocked(entrance.x, entrance.y)).toBe(false);
    for (const w of warpsOf(id)) {
      if (!(w.targetMap in maps)) continue; // 山道 / 廃坑 B1 are authored elsewhere
      expect(
        gridWith(w.targetMap, blockersOf(w.targetMap)).isBlocked(w.targetX, w.targetY),
        `${id} warp → ${w.targetMap} (${w.targetX}, ${w.targetY})`,
      ).toBe(false);
    }
  });

  it('uses the id conventions and well-formed conditions, with no duplicate npc ids or chest flags', () => {
    const npcIds = new Set<string>();
    const chestFlags = new Set<string>();
    let conditions = 0;
    for (const id of MAP_IDS) {
      for (const o of objectsOf(id)) {
        const conds: (string | undefined)[] = [];
        if (o.kind === 'npc') {
          expect(o.id).toMatch(/^npc_[a-z0-9_]+$/);
          expect(o.dialog).toMatch(/^dlg_[a-z0-9_]+$/);
          expect(npcIds.has(o.id), `duplicate npc id ${o.id}`).toBe(false);
          npcIds.add(o.id);
          if (o.shop !== undefined) expect(o.shop).toMatch(/^shop_[a-z0-9_]+$/);
          conds.push(o.condition, o.hiddenIf, ...(o.markers ?? []).map((m) => m.if));
        }
        if (o.kind === 'chest') {
          expect(o.flag).toMatch(/^chest\.[a-z0-9_]+$/);
          expect(chestFlags.has(o.flag), `duplicate chest flag ${o.flag}`).toBe(false);
          chestFlags.add(o.flag);
        }
        if (o.kind === 'sign') expect(o.textId).toMatch(/^dlg_[a-z0-9_]+$/);
        if (o.kind === 'trigger') {
          expect(o.eventId).toMatch(/^ev_[a-z0-9_]+$/);
          conds.push(o.condition);
        }
        if (o.kind === 'warp') {
          expect(o.targetMap).toMatch(/^map_[a-z0-9_]+$/);
          if (o.lockedTextId !== undefined) expect(o.lockedTextId).toMatch(/^dlg_[a-z0-9_]+$/);
          if (o.doorFlag !== undefined) expect(o.doorFlag).toMatch(/^door\.[a-z0-9_]+$/);
        }
        for (const c of conds) {
          if (c === undefined) continue;
          conditions += 1;
          expect(() => validateCondition(c), `${id} ${o.kind}: "${c}"`).not.toThrow();
        }
      }
    }
    // guard hidden_if + goro hidden_if + goro trigger condition + four smith markers
    expect(conditions).toBe(7);
  });
});
