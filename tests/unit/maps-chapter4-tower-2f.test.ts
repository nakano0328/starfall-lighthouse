import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { MapObject, NpcObject, TriggerObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { findTileLayer } from '@core/map/tiled';
import { map_lighthouse_2f } from '@data/maps/map_lighthouse_2f';
import { tileGid } from '@data/tiles';

// docs/GAME_DESIGN.md §3.1 row map_lighthouse_2f (鍵なし扉の順路パズル), §5.12 symbols,
// §8.2 grp_tower_a / grp_tower_b, §9.3 npc `obj_*` sprites and examine-triggers, §13 #16.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own
// while the other tower floors are authored.

interface Cell {
  x: number;
  y: number;
}

const FLOOR_2F = 'map_lighthouse_2f';
const FLOOR_1F = 'map_lighthouse_1f';
const FLOOR_3F = 'map_lighthouse_3f';
const TOWER_GROUPS = ['grp_tower_a', 'grp_tower_b'];

// The coordinate contract shared by every tower floor and the chapter 4 script.
const LANDING: Cell = { x: 2, y: 22 };
const STAIRS_DOWN: Cell = { x: 2, y: 21 };
const STAIRS_UP: Cell = { x: 21, y: 2 };
/** Where 3F's stairs down land the party. */
const LANDING_FROM_3F: Cell = { x: 21, y: 3 };
// The puzzle: levers are examined from the floor tile in front of them.
const LEVER_A: Cell = { x: 1, y: 13 };
const LEVER_A_FROM: Cell = { x: 2, y: 13 };
const GATE_A: Cell = { x: 8, y: 11 };
const LEVER_B: Cell = { x: 3, y: 5 };
const LEVER_B_FROM: Cell = { x: 4, y: 5 };
const GATE_B: Cell = { x: 11, y: 5 };
const SIGN: Cell = { x: 5, y: 18 };
const CHEST: Cell = { x: 2, y: 9 };
const SYMBOL_ZONE_1: Cell = { x: 7, y: 16 };
const SYMBOL_ZONE_2: Cell = { x: 7, y: 8 };
const SYMBOL_ZONE_3: Cell = { x: 16, y: 14 };

const src = map_lighthouse_2f;
const compiled = compileMap(src);
const objects = parseMapObjects(compiled);
const grid = CollisionGrid.fromMap(compiled);
const { entrance } = src.meta;

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
const inRect = (o: Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>, c: Cell): boolean =>
  c.x >= o.tx && c.x < o.tx + o.tw && c.y >= o.ty && c.y < o.ty + o.th;

const ofKind = <K extends MapObject['kind']>(kind: K): Extract<MapObject, { kind: K }>[] =>
  objects.filter((o): o is Extract<MapObject, { kind: K }> => o.kind === kind);

/** NPCs gated by hidden_if / condition (the gates), absent for part of the game. */
const isGated = (o: MapObject): boolean =>
  o.kind === 'npc' && (o.hiddenIf !== undefined || o.condition !== undefined);

/**
 * Blocking objects WorldScene adds to the collision grid: NPCs, chests, signs, save
 * points and examine-triggers. `hiddenNpcs` names the gates that are gone (lever pulled);
 * 'gated' leaves every gated NPC out, as the generic map rules do.
 */
const blockers = (hiddenNpcs: readonly string[] | 'gated' = []): Cell[] =>
  objects
    .filter((o) => {
      if (o.kind === 'npc')
        return hiddenNpcs === 'gated' ? !isGated(o) : !hiddenNpcs.includes(o.id);
      return (
        o.kind === 'chest' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'trigger' && o.interact)
      );
    })
    .map(cellOf);
/** The walkability WorldScene uses with the given gates gone. */
const runtime = (hiddenNpcs: readonly string[] | 'gated' = []): CollisionGrid =>
  grid.withBlocked(blockers(hiddenNpcs));

/** Gid the compiled map holds at `c` in the given tile layer (0 = empty). */
const gidAt = (layer: 'ground' | 'deco' | 'above', c: Cell): number =>
  findTileLayer(compiled, layer)?.data[c.y * compiled.width + c.x] ?? 0;
/** Whether the named placeholder tile is drawn at `c` in the ground or deco layer. */
const hasTile = (c: Cell, name: string): boolean =>
  gidAt('ground', c) === tileGid(name) || gidAt('deco', c) === tileGid(name);
const groundIs = (c: Cell, name: string): boolean => gidAt('ground', c) === tileGid(name);

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

const warpTo = (map: string): WarpObject => {
  const w = ofKind('warp').find((o) => o.targetMap === map);
  expect(w, `warp → ${map}`).toBeDefined();
  return w!;
};
const npcById = (id: string): NpcObject => {
  const n = ofKind('npc').find((o) => o.id === id);
  expect(n, id).toBeDefined();
  return n!;
};
const triggersAt = (c: Cell): TriggerObject[] =>
  ofKind('trigger').filter((t) => sameCell(cellOf(t), c));

/** Cells of a straight 4-neighbour segment from `a` to `b` (same row or column), inclusive. */
function segment(a: Cell, b: Cell): Cell[] {
  expect(a.x === b.x || a.y === b.y, `segment ${cellKey(a)} → ${cellKey(b)}`).toBe(true);
  const cells: Cell[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  for (let c = { ...a }; ; c = { x: c.x + dx, y: c.y + dy }) {
    cells.push(c);
    if (sameCell(c, b)) break;
  }
  return cells;
}

/** A lever (§3.1): a solid lever tile with one examine-trigger on it, worked from `from`. */
function expectLever(cell: Cell, from: Cell, eventId: string, label: string): void {
  expect(hasTile(cell, 'lever'), `${label} lever tile`).toBe(true);
  expect(grid.isBlocked(cell.x, cell.y), `${label} is solid`).toBe(true);
  const triggers = triggersAt(cell);
  expect(triggers, `${label} triggers`).toHaveLength(1);
  expect(triggers[0]).toMatchObject({
    tx: cell.x,
    ty: cell.y,
    tw: 1,
    th: 1,
    eventId,
    once: true,
    interact: true,
  });
  expect(triggers[0]!.condition, `${label} condition`).toBeUndefined();
  // Nothing else shares the lever's tile.
  expect(
    objects.filter((o) => inRect(o, cell)),
    `${label} tile`,
  ).toHaveLength(1);
  // The tile it is examined from is plain floor next to it, open and free of objects.
  expect(
    neighbours(cell).some((n) => sameCell(n, from)),
    `${label} examined from`,
  ).toBe(true);
  expect(groundIs(from, 'floor_stone'), `${label} examine tile`).toBe(true);
  expect(runtime().isBlocked(from.x, from.y), `${label} examine tile blocked`).toBe(false);
  expect(
    objects.some((o) => inRect(o, from)),
    `${label} examine tile has an object`,
  ).toBe(false);
}

/**
 * An iron gate (§3.1, §9.3 `obj_*` sprite): an NPC on a walkable floor tile that is the
 * only gap in its wall line (`across` are the two cells on either side of the gap, both
 * open; the two cells along the line are solid), hidden once `flag` is set.
 */
function expectGate(
  cell: Cell,
  id: string,
  flag: string,
  across: [Cell, Cell],
  along: [Cell, Cell],
): void {
  const gate = npcById(id);
  expect(gate).toMatchObject({
    tx: cell.x,
    ty: cell.y,
    tw: 1,
    th: 1,
    id,
    dialog: 'dlg_tower_gate',
    facing: 'down',
    sprite: 'obj_gate',
    move: 'static',
    hiddenIf: flag,
  });
  expect(gate.condition).toBeUndefined();
  expect(gate.shop).toBeUndefined();
  expect(() => validateCondition(gate.hiddenIf!)).not.toThrow();
  expect(groundIs(cell, 'floor_stone'), `${id} floor`).toBe(true);
  expect(grid.isBlocked(cell.x, cell.y), `${id} tile`).toBe(false);
  for (const c of across)
    expect(grid.isBlocked(c.x, c.y), `${id} across ${cellKey(c)}`).toBe(false);
  for (const c of along) expect(grid.isBlocked(c.x, c.y), `${id} along ${cellKey(c)}`).toBe(true);
  expect(
    objects.filter((o) => inRect(o, cell)),
    `${id} tile`,
  ).toHaveLength(1);
}

describe('灯台の塔 2F (map_lighthouse_2f)', () => {
  it('is a 24x24 dungeon on the tower backdrop with grp_tower_a / grp_tower_b and no free saving', () => {
    expect(src.width).toBe(24);
    expect(src.height).toBe(24);
    expect(src.tiles).toHaveLength(24);
    for (const row of src.tiles) expect([...row]).toHaveLength(24);
    expect(src.overlay).toBeUndefined();
    expect(src.meta).toEqual({
      id: FLOOR_2F,
      displayName: '灯台の塔 2F',
      kind: 'dungeon',
      bgmKey: 'bgm_lighthouse',
      battleBgKey: 'bg_lighthouse',
      encounterGroups: ['grp_tower_a', 'grp_tower_b'],
      tilesets: ['ts_placeholder'],
      entrance: { x: 2, y: 22, facing: 'down' },
      canSaveAnywhere: false,
    });
  });

  it('draws the same round hall as 1F: void corners, a wall ring, stone floor within', () => {
    for (const c of [
      { x: 0, y: 0 },
      { x: 23, y: 0 },
      { x: 0, y: 23 },
      { x: 23, y: 23 },
      { x: 3, y: 2 },
      { x: 20, y: 21 },
    ]) {
      expect(groundIs(c, 'void'), `${cellKey(c)} is outside the tower`).toBe(true);
    }
    expect(groundIs({ x: 0, y: 12 }, 'wall_top')).toBe(true);
    expect(groundIs({ x: 1, y: 12 }, 'wall')).toBe(true);
    expect(groundIs({ x: 12, y: 0 }, 'wall_top')).toBe(true);
    expect(groundIs({ x: 12, y: 1 }, 'wall')).toBe(true);
    // No door on this floor: the south wall is closed where 1F has its throat.
    expect(grid.isBlocked(12, 22)).toBe(true);
    expect(grid.isBlocked(12, 23)).toBe(true);
    for (const row of src.tiles) expect(row.includes('D')).toBe(false);
  });

  it('starts the player on the landing below the stairs down, facing down', () => {
    expect(entrance).toEqual({ ...LANDING, facing: 'down' });
    expect(grid.isBlocked(LANDING.x, LANDING.y)).toBe(false);
    expect(runtime().isBlocked(LANDING.x, LANDING.y)).toBe(false);
    // The landing is walled below and to the west: the turret opens to the east.
    expect(grid.isBlocked(LANDING.x, LANDING.y + 1)).toBe(true);
    expect(grid.isBlocked(LANDING.x - 1, LANDING.y)).toBe(true);
    expect(runtime().isBlocked(LANDING.x + 1, LANDING.y)).toBe(false);
  });

  it('has exactly two warps, the stairs down and the stairs up, both plain', () => {
    const warps = ofKind('warp');
    expect(warps).toHaveLength(2);
    expect(warps.map((w) => w.targetMap).sort()).toEqual([FLOOR_1F, FLOOR_3F]);
    for (const w of warps) {
      expect(w.requiredItem, cellKey(cellOf(w))).toBeUndefined();
      expect(w.lockedTextId, cellKey(cellOf(w))).toBeUndefined();
      expect(w.doorFlag, cellKey(cellOf(w))).toBeUndefined();
    }
  });

  it('climbs down to 1F from the stairs at (2, 21), landing on 1F (21, 3) facing down', () => {
    const down = warpTo(FLOOR_1F);
    expect(down).toMatchObject({
      tx: STAIRS_DOWN.x,
      ty: STAIRS_DOWN.y,
      tw: 1,
      th: 1,
      targetMap: FLOOR_1F,
      targetX: 21,
      targetY: 3,
      facing: 'down',
    });
    // A stairs tile, walkable, directly behind the landing (which faces down).
    expect(groundIs(STAIRS_DOWN, 'stairs')).toBe(true);
    expect(grid.isBlocked(STAIRS_DOWN.x, STAIRS_DOWN.y)).toBe(false);
    expect(manhattan(STAIRS_DOWN, LANDING)).toBe(1);
    expect(STAIRS_DOWN).toEqual({ x: LANDING.x, y: LANDING.y - 1 });
    expect(objects.some((o) => o.kind !== 'warp' && inRect(o, STAIRS_DOWN))).toBe(false);
  });

  it('climbs to 3F from the stairs at (21, 2), landing on 3F (2, 22) facing down', () => {
    const up = warpTo(FLOOR_3F);
    expect(up).toMatchObject({
      tx: STAIRS_UP.x,
      ty: STAIRS_UP.y,
      tw: 1,
      th: 1,
      targetMap: FLOOR_3F,
      targetX: 2,
      targetY: 22,
      facing: 'down',
    });
    expect(groundIs(STAIRS_UP, 'stairs')).toBe(true);
    expect(grid.isBlocked(STAIRS_UP.x, STAIRS_UP.y)).toBe(false);
    expect(objects.some((o) => o.kind !== 'warp' && inRect(o, STAIRS_UP))).toBe(false);
    // 3F's stairs down land on (21, 3) facing down: walkable, object-free, with the stairs
    // directly behind (above) the landing.
    expect(grid.isBlocked(LANDING_FROM_3F.x, LANDING_FROM_3F.y)).toBe(false);
    expect(runtime().isBlocked(LANDING_FROM_3F.x, LANDING_FROM_3F.y)).toBe(false);
    expect(objects.some((o) => inRect(o, LANDING_FROM_3F))).toBe(false);
    expect(LANDING_FROM_3F).toEqual({ x: STAIRS_UP.x, y: STAIRS_UP.y + 1 });
    expect(grid.isBlocked(STAIRS_UP.x + 1, STAIRS_UP.y)).toBe(true);
    expect(grid.isBlocked(STAIRS_UP.x, STAIRS_UP.y - 1)).toBe(true);
  });

  it("fires the shadow's voice once, on the landing, when the party arrives", () => {
    const voice = triggersAt(LANDING);
    expect(voice).toHaveLength(1);
    expect(voice[0]).toMatchObject({
      tx: LANDING.x,
      ty: LANDING.y,
      tw: 1,
      th: 1,
      eventId: 'ev_tower_voice_2',
      once: true,
      interact: false,
    });
    expect(voice[0]!.condition).toBeUndefined();
    // The voice and the two levers are the only triggers on this floor.
    expect(ofKind('trigger')).toHaveLength(3);
  });

  it('sets lever A into the west wall of zone 1, examined from (2, 13) facing left', () => {
    expectLever(LEVER_A, LEVER_A_FROM, 'ev_tower_lever_a', 'lever A');
    expect(LEVER_A_FROM).toEqual({ x: LEVER_A.x + 1, y: LEVER_A.y });
  });

  it('sets lever B into the west wall of zone 2, examined from (4, 5) facing left', () => {
    expectLever(LEVER_B, LEVER_B_FROM, 'ev_tower_lever_b', 'lever B');
    expect(LEVER_B_FROM).toEqual({ x: LEVER_B.x + 1, y: LEVER_B.y });
  });

  it('seals the gap of the y11 wall with gate A, which lever A removes', () => {
    expect(ofKind('npc')).toHaveLength(2);
    expectGate(
      GATE_A,
      'npc_tower_gate_a',
      'lighthouse.lever_a',
      [
        { x: GATE_A.x, y: GATE_A.y - 1 },
        { x: GATE_A.x, y: GATE_A.y + 1 },
      ],
      [
        { x: GATE_A.x - 1, y: GATE_A.y },
        { x: GATE_A.x + 1, y: GATE_A.y },
      ],
    );
    // Lantern posts flank the gate; the wall line runs from the ring to the x11 wall.
    expect(hasTile({ x: GATE_A.x - 1, y: GATE_A.y }, 'lantern')).toBe(true);
    expect(hasTile({ x: GATE_A.x + 1, y: GATE_A.y }, 'lantern')).toBe(true);
    for (let x = 0; x <= 11; x++) {
      if (x === GATE_A.x) continue;
      expect(grid.isBlocked(x, GATE_A.y), `(${x}, ${GATE_A.y})`).toBe(true);
    }
  });

  it('seals the gap of the x11 wall with gate B, which lever B removes', () => {
    expectGate(
      GATE_B,
      'npc_tower_gate_b',
      'lighthouse.lever_b',
      [
        { x: GATE_B.x - 1, y: GATE_B.y },
        { x: GATE_B.x + 1, y: GATE_B.y },
      ],
      [
        { x: GATE_B.x, y: GATE_B.y - 1 },
        { x: GATE_B.x, y: GATE_B.y + 1 },
      ],
    );
    expect(hasTile({ x: GATE_B.x, y: GATE_B.y - 1 }, 'lantern')).toBe(true);
    expect(hasTile({ x: GATE_B.x, y: GATE_B.y + 1 }, 'lantern')).toBe(true);
    for (let y = 0; y <= 23; y++) {
      if (y === GATE_B.y) continue;
      expect(grid.isBlocked(GATE_B.x, y), `(${GATE_B.x}, ${y})`).toBe(true);
    }
  });

  it('lets the party reach only zone 1 while both gates stand', () => {
    const reach = reachableFrom(runtime(), LANDING);
    const has = (c: Cell): boolean => reach.has(cellKey(c));
    expect(has(LEVER_A_FROM), 'lever A examine tile').toBe(true);
    expect(approachable(reach, SIGN), 'sign').toBe(true);
    expect(approachable(reach, GATE_A), 'gate A can be bumped').toBe(true);
    expect(has(STAIRS_DOWN), 'stairs down').toBe(true);
    expect(has(LEVER_B_FROM), 'lever B examine tile').toBe(false);
    expect(approachable(reach, LEVER_B), 'lever B').toBe(false);
    expect(approachable(reach, CHEST), 'chest').toBe(false);
    expect(approachable(reach, GATE_B), 'gate B').toBe(false);
    expect(has(STAIRS_UP), 'stairs up').toBe(false);
    expect(has(LANDING_FROM_3F), 'turret landing').toBe(false);
    expect(has(SYMBOL_ZONE_1), 'zone 1 symbol').toBe(true);
    expect(has(SYMBOL_ZONE_2), 'zone 2 symbol').toBe(false);
    expect(has(SYMBOL_ZONE_3), 'zone 3 symbol').toBe(false);
  });

  it('opens zone 2 (lever B and the chest) once gate A is gone, but not the stairs up', () => {
    const reach = reachableFrom(runtime(['npc_tower_gate_a']), LANDING);
    const has = (c: Cell): boolean => reach.has(cellKey(c));
    expect(has(GATE_A), 'gate A gap').toBe(true);
    expect(has(LEVER_B_FROM), 'lever B examine tile').toBe(true);
    expect(approachable(reach, CHEST), 'chest').toBe(true);
    expect(has(SYMBOL_ZONE_2), 'zone 2 symbol').toBe(true);
    expect(approachable(reach, GATE_B), 'gate B can be bumped').toBe(true);
    expect(has(STAIRS_UP), 'stairs up').toBe(false);
    expect(has(LANDING_FROM_3F), 'turret landing').toBe(false);
    expect(has(SYMBOL_ZONE_3), 'zone 3 symbol').toBe(false);
  });

  it('keeps zone 3 sealed by gate B alone: gate A gone or not, lever B is the only key', () => {
    // Gate B alone removed (impossible in play, but shows it is not a shortcut from zone 1).
    const onlyB = reachableFrom(runtime(['npc_tower_gate_b']), LANDING);
    expect(onlyB.has(cellKey(STAIRS_UP))).toBe(false);
    expect(onlyB.has(cellKey(LEVER_B_FROM))).toBe(false);
  });

  it('opens the whole floor once both gates are gone', () => {
    const reach = reachableFrom(runtime(['npc_tower_gate_a', 'npc_tower_gate_b']), LANDING);
    const has = (c: Cell): boolean => reach.has(cellKey(c));
    expect(has(STAIRS_UP), 'stairs up').toBe(true);
    expect(has(LANDING_FROM_3F), 'turret landing').toBe(true);
    expect(has(STAIRS_DOWN), 'stairs down').toBe(true);
    expect(has(LEVER_A_FROM)).toBe(true);
    expect(has(LEVER_B_FROM)).toBe(true);
    for (const o of objects) {
      const label = `${o.kind} at ${cellKey(cellOf(o))}`;
      if (o.kind === 'enemy' || o.kind === 'warp' || (o.kind === 'trigger' && !o.interact)) {
        expect(has(cellOf(o)), label).toBe(true);
      } else {
        expect(approachable(reach, cellOf(o)), label).toBe(true);
      }
    }
    // Every walkable tile belongs to the one hall: no sealed pockets remain.
    const run = runtime(['npc_tower_gate_a', 'npc_tower_gate_b']);
    let walkable = 0;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) if (!run.isBlocked(x, y)) walkable += 1;
    expect(reach.size).toBe(walkable);
  });

  it('puts the hint sign in zone 1 by the turret mouth', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: SIGN.x, ty: SIGN.y, textId: 'dlg_sign_tower_2f' });
    expect(grid.isBlocked(SIGN.x, SIGN.y)).toBe(false);
    expect(manhattan(SIGN, LANDING)).toBeLessThanOrEqual(8);
  });

  it('holds the light dust chest in the west alcove of zone 2', () => {
    const chests = ofKind('chest');
    expect(chests).toHaveLength(1);
    expect(chests[0]).toMatchObject({
      tx: CHEST.x,
      ty: CHEST.y,
      itemId: 'it_light_dust',
      qty: 2,
      flag: 'chest.tower_2f_01',
      tide: 'any',
    });
    expect(grid.isBlocked(CHEST.x, CHEST.y)).toBe(false);
    expect(manhattan(CHEST, LANDING)).toBeGreaterThanOrEqual(6);
  });

  it('places three tower symbols, one per zone, 6+ tiles from the landing', () => {
    const enemies = ofKind('enemy');
    expect(enemies).toHaveLength(3);
    expect(enemies.map(cellOf)).toEqual([SYMBOL_ZONE_1, SYMBOL_ZONE_2, SYMBOL_ZONE_3]);
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.groupIds, label).toEqual(TOWER_GROUPS);
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(e.tide, label).toBe('any');
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan(cellOf(e), LANDING), label).toBeGreaterThanOrEqual(6);
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
    }
    // At least one symbol lies beyond the gates (zone 2 or 3).
    const zone1 = reachableFrom(runtime(), LANDING);
    expect(enemies.some((e) => !zone1.has(cellKey(cellOf(e))))).toBe(true);
  });

  it('has no save point, and only the gates for NPCs', () => {
    expect(ofKind('save_point')).toHaveLength(0);
    expect(
      ofKind('npc')
        .map((n) => n.id)
        .sort(),
    ).toEqual(['npc_tower_gate_a', 'npc_tower_gate_b']);
    expect(objects).toHaveLength(12);
  });

  it('reaches every warp and object from the entrance over the plain layer, gates ignored', () => {
    // The generic map rules (tests/unit/maps-data.test.ts): gated NPCs are left out, the
    // levers' examine-triggers block their tiles like signs do.
    const reach = reachableFrom(runtime('gated'), entrance);
    const reached = (c: Cell): boolean => reach.has(cellKey(c));
    const taken = new Set<string>();
    for (const o of objects) {
      const cell = cellOf(o);
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'warp') {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      } else if (
        o.kind === 'npc' ||
        o.kind === 'chest' ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'trigger' && o.interact)
      ) {
        expect(approachable(reach, cell), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
        expect(
          ofKind('warp').some((w) => inRect(w, cell)),
          `${label} sits on a warp`,
        ).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
  });

  it('offers straight open walks: landing → lever A → lever B → stairs up', () => {
    const open = runtime(['npc_tower_gate_a', 'npc_tower_gate_b']);
    const toLeverA = [
      ...segment(LANDING, { x: 3, y: 22 }),
      ...segment({ x: 3, y: 22 }, { x: 3, y: 13 }),
      ...segment({ x: 3, y: 13 }, LEVER_A_FROM),
    ];
    const toLeverB = [
      ...segment(LEVER_A_FROM, { x: 8, y: 13 }),
      ...segment({ x: 8, y: 13 }, { x: 8, y: 5 }),
      ...segment({ x: 8, y: 5 }, LEVER_B_FROM),
    ];
    const toStairs = [
      ...segment(LEVER_B_FROM, { x: 21, y: 5 }),
      ...segment({ x: 21, y: 5 }, STAIRS_UP),
    ];
    // The first leg never leaves zone 1 and stays off the stairs down (one step up would
    // warp back to 1F).
    const zone1 = runtime();
    for (const c of toLeverA) {
      expect(zone1.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
      expect(sameCell(c, STAIRS_DOWN), cellKey(c)).toBe(false);
    }
    // The second leg crosses gate A's gap and nothing else that blocks.
    expect(toLeverB.some((c) => sameCell(c, GATE_A))).toBe(true);
    expect(toLeverB.some((c) => sameCell(c, GATE_B))).toBe(false);
    for (const c of toLeverB) expect(open.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
    for (const c of toLeverB) {
      if (sameCell(c, GATE_A)) continue;
      expect(runtime(['npc_tower_gate_a']).isBlocked(c.x, c.y), cellKey(c)).toBe(false);
    }
    // The third leg crosses gate B's gap and ends on the stairs up.
    expect(toStairs.some((c) => sameCell(c, GATE_B))).toBe(true);
    expect(toStairs.some((c) => sameCell(c, GATE_A))).toBe(false);
    for (const c of toStairs) expect(open.isBlocked(c.x, c.y), cellKey(c)).toBe(false);
    // Only the voice trigger, the gates and the warps lie on the routes.
    const route = [...toLeverA, ...toLeverB, ...toStairs];
    for (const o of objects) {
      if (o.kind === 'warp' || o.kind === 'npc' || (o.kind === 'trigger' && !o.interact)) continue;
      expect(
        route.some((c) => inRect(o, c)),
        `${o.kind} at ${cellKey(cellOf(o))}`,
      ).toBe(false);
    }
  });
});
