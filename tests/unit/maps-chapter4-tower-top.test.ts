import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { MapObject, NpcObject, TriggerObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry } from '@core/map/source';
import { normalizeLegendEntry } from '@core/map/source';
import { map_lighthouse_top } from '@data/maps/map_lighthouse_top';

// docs/GAME_DESIGN.md §3.1 row map_lighthouse_top, §4.5 / §8.4 ノクス, §13 #18-19.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own
// while the tower floors it connects to are authored alongside it.

interface Cell {
  x: number;
  y: number;
}

const TOP = 'map_lighthouse_top';
const FLOOR_5F = 'map_lighthouse_5f';
/** Where 5F's up-stairs land the party (§3.1 coordinate contract). */
const LANDING: Cell = { x: 10, y: 12 };
const STAIRS: Cell = { x: 10, y: 13 };
const NOX: Cell = { x: 10, y: 4 };
/** The tile the party stops on against ノクス when walking straight up the middle. */
const STAND_OFF: Cell = { x: 10, y: 5 };
const THROAT_Y = 8;
const THROAT_XS = [8, 9, 10, 11, 12];

const src = map_lighthouse_top;
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

/** Blocking sprites WorldScene adds to the collision grid (NPCs, chests, signs, save points). */
const blockers = (): Cell[] =>
  objects
    .filter(
      (o) => o.kind === 'npc' || o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point',
    )
    .map((o) => ({ x: o.tx, y: o.ty }));

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

const stairsWarp = (): WarpObject => {
  const w = ofKind('warp').find((o) => o.targetMap === FLOOR_5F);
  expect(w, `warp → ${FLOOR_5F}`).toBeDefined();
  return w!;
};
const throatTrigger = (): TriggerObject => {
  const t = ofKind('trigger').find((o) => o.eventId === 'ev_lighthouse_top');
  expect(t, 'ev_lighthouse_top trigger').toBeDefined();
  return t!;
};
const nox = (): NpcObject => {
  const n = ofKind('npc').find((o) => o.id === 'npc_nox_top');
  expect(n, 'npc_nox_top').toBeDefined();
  return n!;
};
const throatCells = (): Cell[] => THROAT_XS.map((x) => ({ x, y: THROAT_Y }));

describe('灯台頂 (map_lighthouse_top)', () => {
  it('is a 20x14 event map on the boss backdrop with no encounters and no free saving', () => {
    expect(src.width).toBe(20);
    expect(src.height).toBe(14);
    expect(src.tiles).toHaveLength(14);
    for (const row of src.tiles) expect([...row]).toHaveLength(20);
    expect(src.meta).toEqual({
      id: TOP,
      displayName: '灯台頂',
      kind: 'event',
      bgmKey: 'bgm_boss',
      battleBgKey: 'bg_lighthouse_top',
      encounterGroups: [],
      tilesets: ['ts_placeholder'],
      entrance: { x: 10, y: 12, facing: 'up' },
      canSaveAnywhere: false,
    });
  });

  it('starts the player on the stair head landing, walkable and object-free, facing up', () => {
    expect(entrance).toEqual({ ...LANDING, facing: 'up' });
    expect(grid.isBlocked(LANDING.x, LANDING.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(LANDING.x, LANDING.y)).toBe(false);
    // Nothing sits on the landing: not even a trigger, so arriving from 5F fires nothing.
    expect(objects.some((o) => inRect(o, LANDING))).toBe(false);
  });

  it('warps down the bottom-edge stairs to 5F (21, 3), facing away from its up-stairs', () => {
    const warps = ofKind('warp');
    expect(warps).toHaveLength(1);
    const down = stairsWarp();
    expect(down).toMatchObject({
      tx: STAIRS.x,
      ty: STAIRS.y,
      tw: 1,
      th: 1,
      targetMap: FLOOR_5F,
      targetX: 21,
      targetY: 3,
      facing: 'down',
    });
    expect(down.requiredItem).toBeUndefined();
    // A stairs tile on the map edge, walkable, directly behind the landing (which faces up).
    expect(groundAt(STAIRS)).toBe('stairs');
    expect(down.ty).toBe(src.height - 1);
    expect(grid.isBlocked(down.tx, down.ty)).toBe(false);
    expect(manhattan(STAIRS, LANDING)).toBe(1);
    expect(STAIRS).toEqual({ x: LANDING.x, y: LANDING.y + 1 });
  });

  it('places ノクス in front of the dead lamp, hidden once he is beaten', () => {
    const n = nox();
    expect(ofKind('npc')).toHaveLength(1);
    expect(n).toMatchObject({
      tx: NOX.x,
      ty: NOX.y,
      id: 'npc_nox_top',
      dialog: 'dlg_nox_top_idle',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'static',
      hiddenIf: 'main.nox_defeated',
    });
    expect(n.condition).toBeUndefined();
    expect(() => validateCondition(n.hiddenIf!)).not.toThrow();
    expect(grid.isBlocked(n.tx, n.ty)).toBe(false);
    // The lamp housing is right behind him: lantern tiles up the middle, walls at its sides.
    expect(groundAt({ x: NOX.x, y: NOX.y - 2 })).toBe('lantern');
    expect(groundAt({ x: NOX.x - 2, y: NOX.y - 2 })).toBe('wall');
    expect(groundAt({ x: NOX.x + 2, y: NOX.y - 2 })).toBe('wall');
    // He stands on the rune star, with the stand-off tile open in front of him.
    expect(groundAt(NOX)).toBe('rune_floor');
    expect(grid.withBlocked(blockers()).isBlocked(STAND_OFF.x, STAND_OFF.y)).toBe(false);
  });

  it('spans the throat with the confrontation trigger, re-armed until the win', () => {
    expect(ofKind('trigger')).toHaveLength(1);
    const t = throatTrigger();
    expect(t).toMatchObject({
      tx: 8,
      ty: THROAT_Y,
      tw: 5,
      th: 1,
      eventId: 'ev_lighthouse_top',
      once: false,
      condition: '!main.nox_defeated',
      interact: false,
    });
    expect(() => validateCondition(t.condition!)).not.toThrow();
    // The rect covers exactly x 8-12 on y 8, every cell of it walkable.
    for (let x = 0; x < src.width; x++) {
      expect(inRect(t, { x, y: THROAT_Y }), `trigger covers (${x}, ${THROAT_Y})`).toBe(
        THROAT_XS.includes(x),
      );
    }
    for (const c of throatCells()) {
      expect(grid.isBlocked(c.x, c.y), `throat tile ${cellKey(c)}`).toBe(false);
      expect(inRect(t, { x: c.x, y: THROAT_Y - 1 })).toBe(false);
      expect(inRect(t, { x: c.x, y: THROAT_Y + 1 })).toBe(false);
    }
    // The railing seals the rest of the row on both sides of the gap.
    expect(grid.isBlocked(7, THROAT_Y)).toBe(true);
    expect(grid.isBlocked(13, THROAT_Y)).toBe(true);
  });

  it('makes the throat the only way from the landing to ノクス', () => {
    const runtime = grid.withBlocked(blockers());
    // Without the trigger row the gallery is sealed off from the stair head.
    const sealed = reachableFrom(runtime.withBlocked(throatCells()), LANDING);
    expect(sealed.has(cellKey(STAND_OFF))).toBe(false);
    expect(sealed.has(cellKey(NOX))).toBe(false);
    for (const c of neighbours(NOX)) expect(sealed.has(cellKey(c)), cellKey(c)).toBe(false);
    // With it, the stand-off tile and every cell of the trigger are reached.
    const open = reachableFrom(runtime, LANDING);
    expect(open.has(cellKey(STAND_OFF))).toBe(true);
    for (const c of throatCells()) expect(open.has(cellKey(c)), cellKey(c)).toBe(true);
    // (10, 12) → (10, 8) → (10, 5) is a straight open walk up the middle (the e2e walks it).
    for (let y = STAND_OFF.y; y <= LANDING.y; y++) {
      expect(runtime.isBlocked(LANDING.x, y), `(${LANDING.x}, ${y})`).toBe(false);
    }
    // Walking straight up, the party is on (10, 8) when the trigger fires, then stops on
    // (10, 5) against ノクス.
    expect(inRect(throatTrigger(), { x: LANDING.x, y: THROAT_Y })).toBe(true);
    expect(runtime.isBlocked(NOX.x, NOX.y)).toBe(true);
  });

  it('has no chests, signs, save points or symbols: only the stairs, the trigger and ノクス', () => {
    expect(objects).toHaveLength(3);
    expect(ofKind('chest')).toHaveLength(0);
    expect(ofKind('sign')).toHaveLength(0);
    expect(ofKind('save_point')).toHaveLength(0);
    expect(ofKind('enemy')).toHaveLength(0);
  });

  it('reaches every object from the entrance and keeps each on its own tile off the warp', () => {
    const runtime = grid.withBlocked(blockers());
    const reachable = reachableFrom(runtime, entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    const taken = new Set<string>();
    for (const o of objects) {
      const cell = { x: o.tx, y: o.ty };
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'npc') {
        expect(neighbours(cell).some(reached), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
        expect(
          ofKind('warp').some((w) => inRect(w, cell)),
          `${label} sits on the warp`,
        ).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
  });
});
