import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { EnemyObject, MapObject, TriggerObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { map_forest_shrine } from '@data/maps/map_forest_shrine';

// docs/GAME_DESIGN.md §3.1 row map_forest_shrine, §5.12 boss symbols, §8.4 古木のウロ, §13 #7.
// The map is tested directly here (not via MAP_SOURCES) so this file stands on its own.

interface Cell {
  x: number;
  y: number;
}

const SHRINE = 'map_forest_shrine';
const FOREST = 'map_whisper_forest';
const SHRINE_GROUPS = new Set(['grp_forest_c', 'grp_forest_d']);

const src = map_forest_shrine;
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

const bossTrigger = (): TriggerObject => {
  const t = ofKind('trigger').find((o) => o.eventId === 'ev_forest_boss_intro');
  expect(t, 'ev_forest_boss_intro trigger').toBeDefined();
  return t!;
};
const bossSymbol = (): EnemyObject => {
  const e = ofKind('enemy').find((o) => o.groupIds.includes('grp_boss_tree'));
  expect(e, 'grp_boss_tree symbol').toBeDefined();
  return e!;
};
/** Rows strictly north of the boss doorway (the boss chamber lies past the trigger). */
const inBossChamber = (c: Cell): boolean => c.y < bossTrigger().ty;

describe('森の祠 (map_forest_shrine)', () => {
  it('is a 30x30 dungeon with the shrine encounter groups and no free saving', () => {
    expect(src.width).toBe(30);
    expect(src.height).toBe(30);
    expect(src.tiles).toHaveLength(30);
    for (const row of src.tiles) expect([...row]).toHaveLength(30);
    expect(src.meta).toMatchObject({
      id: SHRINE,
      displayName: '森の祠',
      kind: 'dungeon',
      bgmKey: 'bgm_forest',
      battleBgKey: 'bg_forest',
      encounterGroups: ['grp_forest_c', 'grp_forest_d'],
      canSaveAnywhere: false,
    });
  });

  it('starts the player on a walkable tile just inside the south door, facing up', () => {
    expect(entrance).toEqual({ x: 15, y: 28, facing: 'up' });
    expect(grid.isBlocked(entrance.x, entrance.y)).toBe(false);
    expect(grid.withBlocked(blockers()).isBlocked(entrance.x, entrance.y)).toBe(false);
  });

  it('warps south to the forest clearing below its shrine door, facing down', () => {
    const warps = ofKind('warp');
    expect(warps).toHaveLength(1);
    const south = warps[0]!;
    expect(south).toMatchObject({
      tx: 15,
      ty: 29,
      tw: 1,
      th: 1,
      targetMap: FOREST,
      targetX: 25,
      targetY: 4,
      facing: 'down',
    });
    expect(south.requiredItem).toBeUndefined();
    // The door tile is on the map edge, walkable, and directly behind the entrance.
    expect(south.ty).toBe(src.height - 1);
    expect(grid.isBlocked(south.tx, south.ty)).toBe(false);
    expect(manhattan({ x: south.tx, y: south.ty }, entrance)).toBe(1);
  });

  it('puts the boss symbol beyond the intro trigger, never respawning, with its flag', () => {
    const trigger = bossTrigger();
    const boss = bossSymbol();
    expect(trigger).toMatchObject({
      tx: 15,
      ty: 7,
      eventId: 'ev_forest_boss_intro',
      once: true,
      condition: '!forest.boss_defeated',
    });
    expect(() => validateCondition(trigger.condition!)).not.toThrow();
    expect(boss).toMatchObject({
      tx: 15,
      ty: 4,
      groupIds: ['grp_boss_tree'],
      respawnSec: -1,
      radius: 0,
      defeatedFlag: 'forest.boss_defeated',
    });
    // The talk happens before contact (§5.12): the symbol stands >= 2 tiles past the doorway.
    expect(trigger.ty - boss.ty).toBeGreaterThanOrEqual(2);
    expect(grid.isBlocked(boss.tx, boss.ty)).toBe(false);
    expect(grid.isBlocked(trigger.tx, trigger.ty)).toBe(false);
    // The doorway is the only way in: the chamber is sealed once the trigger tile is blocked.
    const sealed = reachableFrom(grid.withBlocked([{ x: trigger.tx, y: trigger.ty }]), entrance);
    expect(sealed.has(cellKey({ x: boss.tx, y: boss.ty }))).toBe(false);
    expect(ofKind('trigger')).toHaveLength(1);
  });

  it('has one save point in the antechamber, within 6 tiles of the boss doorway', () => {
    const saves = ofKind('save_point');
    expect(saves).toHaveLength(1);
    const save = saves[0]!;
    expect(save.heal).toBe(false);
    const trigger = bossTrigger();
    expect(
      manhattan({ x: save.tx, y: save.ty }, { x: trigger.tx, y: trigger.ty }),
    ).toBeLessThanOrEqual(6);
    expect(inBossChamber({ x: save.tx, y: save.ty })).toBe(false);
    expect(grid.isBlocked(save.tx, save.ty)).toBe(false);
  });

  it('holds the three chests from §3.1 / §7.4', () => {
    const chests = ofKind('chest')
      .map((c) => ({ itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { itemId: 'it_potion_s', qty: 2, flag: 'chest.shrine_01', tide: 'any' },
      { itemId: 'eq_acc_star_charm', qty: 1, flag: 'chest.shrine_02', tide: 'any' },
      { itemId: 'gold', qty: 200, flag: 'chest.shrine_03', tide: 'any' },
    ]);
    for (const c of ofKind('chest')) {
      expect(grid.isBlocked(c.tx, c.ty), `${c.flag}`).toBe(false);
      expect(inBossChamber({ x: c.tx, y: c.ty }), `${c.flag} inside the boss chamber`).toBe(false);
    }
  });

  it('places four normal symbols in the shrine groups, away from the entrance and the boss', () => {
    const normals = ofKind('enemy').filter((e) => !e.groupIds.includes('grp_boss_tree'));
    expect(normals).toHaveLength(4);
    const counts = new Map<string, number>();
    for (const e of normals) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
      expect(manhattan({ x: e.tx, y: e.ty }, entrance), label).toBeGreaterThanOrEqual(6);
      expect(inBossChamber({ x: e.tx, y: e.ty }), `${label} inside the boss chamber`).toBe(false);
      expect(e.groupIds.length, label).toBeGreaterThan(0);
      for (const g of e.groupIds) expect(SHRINE_GROUPS.has(g), `${label} group ${g}`).toBe(true);
      const key = e.groupIds.join(',');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.get('grp_forest_c')).toBe(2);
    expect(counts.get('grp_forest_d')).toBe(1);
    expect(counts.get('grp_forest_c,grp_forest_d')).toBe(1);
  });

  it('has the entrance sign and no NPCs', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ textId: 'dlg_sign_shrine_entrance' });
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
  });

  it('offers a loop so the central chamber symbols can be bypassed', () => {
    const trigger = bossTrigger();
    const central = ofKind('enemy').filter(
      (e) => e.ty >= 15 && e.ty <= 19 && e.tx >= 11 && e.tx <= 19,
    );
    expect(central).toHaveLength(2);
    // Seal the central chamber at both of its doorways: the boss doorway stays reachable.
    const sealed = grid.withBlocked([...blockers(), { x: 15, y: 14 }, { x: 15, y: 20 }]);
    expect(reachableFrom(sealed, entrance).has(cellKey({ x: trigger.tx, y: trigger.ty }))).toBe(
      true,
    );
  });
});
