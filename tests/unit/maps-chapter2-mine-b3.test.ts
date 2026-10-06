import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { EnemyObject, MapObject, TriggerObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { findTileLayer } from '@core/map/tiled';
import { map_mine_b3 } from '@data/maps/map_mine_b3';
import { tileGid } from '@data/tiles';

// docs/GAME_DESIGN.md §3.1 row map_mine_b3, §5.12 boss symbols, §8.4 岩のゴーレム, §13 #10,
// §14 sq_shining_ore (the B3 vein). The map is tested directly here (not via MAP_SOURCES)
// so this file stands on its own.

interface Cell {
  x: number;
  y: number;
}

const MINE_B3 = 'map_mine_b3';
const MINE_B2 = 'map_mine_b2';
const MINE_B3_GROUPS = new Set(['grp_mine_c', 'grp_mine_d']);

const src = map_mine_b3;
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

/** Gid the compiled map draws at `c` in the given tile layer (0 = empty). */
const gidAt = (layer: 'ground' | 'deco', c: Cell): number =>
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

const triggerFor = (eventId: string): TriggerObject => {
  const t = ofKind('trigger').find((o) => o.eventId === eventId);
  expect(t, `${eventId} trigger`).toBeDefined();
  return t!;
};
const bossTrigger = (): TriggerObject => triggerFor('ev_mine_boss_intro');
const bossSymbol = (): EnemyObject => {
  const e = ofKind('enemy').find((o) => o.groupIds.includes('grp_boss_golem'));
  expect(e, 'grp_boss_golem symbol').toBeDefined();
  return e!;
};
/** Rows strictly north of the boss doorway (the boss chamber lies past the trigger). */
const inBossChamber = (c: Cell): boolean => c.y < bossTrigger().ty;

describe('廃坑 B3 (map_mine_b3)', () => {
  it('is a 40x35 dungeon with the deep-mine encounter groups and no free saving', () => {
    expect(src.width).toBe(40);
    expect(src.height).toBe(35);
    expect(src.tiles).toHaveLength(35);
    for (const row of src.tiles) expect([...row]).toHaveLength(40);
    expect(src.meta).toMatchObject({
      id: MINE_B3,
      displayName: '廃坑 B3',
      kind: 'dungeon',
      bgmKey: 'bgm_mine',
      battleBgKey: 'bg_mine',
      encounterGroups: ['grp_mine_c', 'grp_mine_d'],
      canSaveAnywhere: false,
    });
  });

  it('starts the player on a walkable tile at the foot of the ladder, facing up', () => {
    expect(entrance).toEqual({ x: 4, y: 29, facing: 'up' });
    expect(grid.isBlocked(entrance.x, entrance.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(entrance.x, entrance.y)).toBe(false);
  });

  it('climbs the ladder back to B2, landing at the foot of its ladder down, facing up', () => {
    const warps = ofKind('warp');
    expect(warps).toHaveLength(1);
    const ladder = warps[0]!;
    expect(ladder).toMatchObject({
      tx: 4,
      ty: 30,
      tw: 1,
      th: 1,
      targetMap: MINE_B2,
      targetX: 4,
      targetY: 29,
      facing: 'up',
    });
    expect(ladder.requiredItem).toBeUndefined();
    expect(ladder.doorFlag).toBeUndefined();
    // The ladder is a stairs tile, walkable, directly behind (south of) the entrance.
    expect(hasTile({ x: ladder.tx, y: ladder.ty }, 'stairs')).toBe(true);
    expect(grid.isBlocked(ladder.tx, ladder.ty)).toBe(false);
    expect(ladder.tx).toBe(entrance.x);
    expect(ladder.ty).toBe(entrance.y + 1);
  });

  it('puts the shining-ore vein trigger in front of an ore cluster, gated on ゴロー joining', () => {
    const vein = triggerFor('ev_mine_vein');
    expect(vein).toMatchObject({
      tx: 4,
      ty: 15,
      tw: 1,
      th: 1,
      eventId: 'ev_mine_vein',
      once: true,
      condition: 'hagane.goro_joined',
    });
    expect(() => validateCondition(vein.condition!)).not.toThrow();
    const cell = { x: vein.tx, y: vein.ty };
    expect(grid.isBlocked(cell.x, cell.y)).toBe(false);
    // The vein itself is visible ore in the rock (solid), adjacent to the tile the party digs from.
    const ore = neighbours(cell).filter((n) => hasTile(n, 'ore'));
    expect(ore.length, 'ore tile next to the vein trigger').toBeGreaterThanOrEqual(1);
    for (const o of ore) expect(grid.isBlocked(o.x, o.y), `ore at ${cellKey(o)}`).toBe(true);
    // It is a side chamber, not the boss chamber, and well away from the ladder.
    expect(inBossChamber(cell)).toBe(false);
    expect(manhattan(cell, entrance)).toBeGreaterThanOrEqual(6);
  });

  it('puts the golem beyond the intro trigger, never respawning, with its flag', () => {
    const trigger = bossTrigger();
    const boss = bossSymbol();
    expect(trigger).toMatchObject({
      tx: 30,
      ty: 7,
      eventId: 'ev_mine_boss_intro',
      once: true,
      condition: '!mine.boss_defeated',
    });
    expect(() => validateCondition(trigger.condition!)).not.toThrow();
    expect(boss).toMatchObject({
      tx: 30,
      ty: 4,
      groupIds: ['grp_boss_golem'],
      respawnSec: -1,
      radius: 0,
      defeatedFlag: 'mine.boss_defeated',
    });
    // The talk happens before contact (§5.12): the symbol stands 3 tiles past the doorway,
    // on the rune circle.
    expect(trigger.tx).toBe(boss.tx);
    expect(trigger.ty - boss.ty).toBe(3);
    expect(hasTile({ x: boss.tx, y: boss.ty }, 'rune_floor')).toBe(true);
    expect(grid.isBlocked(boss.tx, boss.ty)).toBe(false);
    expect(grid.isBlocked(trigger.tx, trigger.ty)).toBe(false);
    // The doorway is the only way in: the chamber is sealed once the trigger tile is blocked.
    const sealed = reachableFrom(grid.withBlocked([{ x: trigger.tx, y: trigger.ty }]), entrance);
    expect(sealed.has(cellKey({ x: boss.tx, y: boss.ty }))).toBe(false);
    // Only the vein and the boss intro fire on this floor.
    expect(
      ofKind('trigger')
        .map((t) => t.eventId)
        .sort(),
    ).toEqual(['ev_mine_boss_intro', 'ev_mine_vein']);
  });

  it('has one save point in the antechamber, within 6 tiles of the boss doorway', () => {
    const saves = ofKind('save_point');
    expect(saves).toHaveLength(1);
    const save = saves[0]!;
    expect(save).toMatchObject({ tx: 27, ty: 9, heal: false });
    expect(save.onceFlag).toBeUndefined();
    const trigger = bossTrigger();
    expect(
      manhattan({ x: save.tx, y: save.ty }, { x: trigger.tx, y: trigger.ty }),
    ).toBeLessThanOrEqual(6);
    expect(inBossChamber({ x: save.tx, y: save.ty })).toBe(false);
    expect(grid.isBlocked(save.tx, save.ty)).toBe(false);
  });

  it('holds the three chests, with the fire stones in the antechamber', () => {
    const chests = ofKind('chest')
      .map((c) => ({ itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { itemId: 'it_potion_m', qty: 1, flag: 'chest.mine_b3_01', tide: 'any' },
      { itemId: 'it_fire_stone', qty: 2, flag: 'chest.mine_b3_02', tide: 'any' },
      { itemId: 'gold', qty: 300, flag: 'chest.mine_b3_03', tide: 'any' },
    ]);
    for (const c of ofKind('chest')) {
      expect(grid.isBlocked(c.tx, c.ty), `${c.flag}`).toBe(false);
      expect(inBossChamber({ x: c.tx, y: c.ty }), `${c.flag} inside the boss chamber`).toBe(false);
    }
    // The golem is weak to fire (§8.4): the fire stones sit by the save point, before the door.
    const fire = ofKind('chest').find((c) => c.flag === 'chest.mine_b3_02')!;
    const trigger = bossTrigger();
    expect(
      manhattan({ x: fire.tx, y: fire.ty }, { x: trigger.tx, y: trigger.ty }),
    ).toBeLessThanOrEqual(6);
  });

  it('places five normal symbols in the deep-mine groups, away from the entrance and the boss', () => {
    const normals = ofKind('enemy').filter((e) => !e.groupIds.includes('grp_boss_golem'));
    expect(normals).toHaveLength(5);
    const counts = new Map<string, number>();
    for (const e of normals) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan({ x: e.tx, y: e.ty }, entrance), label).toBeGreaterThanOrEqual(6);
      expect(inBossChamber({ x: e.tx, y: e.ty }), `${label} inside the boss chamber`).toBe(false);
      expect(e.groupIds.length, label).toBeGreaterThan(0);
      for (const g of e.groupIds) expect(MINE_B3_GROUPS.has(g), `${label} group ${g}`).toBe(true);
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
    expect(counts.get('grp_mine_c')).toBe(2);
    expect(counts.get('grp_mine_d')).toBe(2);
    expect(counts.get('grp_mine_c,grp_mine_d')).toBe(1);
  });

  it('keeps the vein chamber and the antechamber free of symbols', () => {
    const vein = triggerFor('ev_mine_vein');
    const save = ofKind('save_point')[0]!;
    for (const e of ofKind('enemy')) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(manhattan({ x: e.tx, y: e.ty }, { x: vein.tx, y: vein.ty }), label).toBeGreaterThan(6);
      expect(manhattan({ x: e.tx, y: e.ty }, { x: save.tx, y: save.ty }), label).toBeGreaterThan(6);
    }
  });

  it('has the entrance sign and no NPCs', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 6, ty: 28, textId: 'dlg_sign_mine_b3' });
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, entrance)).toBeLessThanOrEqual(3);
    expect(ofKind('npc')).toHaveLength(0);
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
    // No dead pockets: every walkable tile of the floor can be reached from the ladder.
    for (let y = 0; y < compiled.height; y++) {
      for (let x = 0; x < compiled.width; x++) {
        if (runtime.isBlocked(x, y)) continue;
        expect(reached({ x, y }), `walkable tile (${x}, ${y}) is cut off`).toBe(true);
      }
    }
  });
});
