import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { EnemyObject, MapObject, NpcObject, TriggerObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { TideLevel } from '@core/map/source';
import { TIDE_LEVELS } from '@core/map/source';
import { collisionForTide, tideAllows } from '@core/map/tide';
import { findTileLayer } from '@core/map/tiled';
import { map_sunken_ruins_b1 } from '@data/maps/map_sunken_ruins_b1';
import { tileGid } from '@data/tiles';

// docs/GAME_DESIGN.md §3.1 row map_sunken_ruins_b1, §3.2 tide gimmick, §5.12 boss symbols,
// §8.4 遺跡の番人, §13 #14 (ev_nox_appear), §14 sq_old_chart. The map is tested directly here
// (not via MAP_SOURCES) so this file stands on its own.

interface Cell {
  x: number;
  y: number;
}

const RUINS_B1 = 'map_sunken_ruins_b1';
const RUINS_1F = 'map_sunken_ruins_1f';
const RUINS_B1_GROUPS = ['grp_ruins_b', 'grp_ruins_c', 'grp_ruins_d'];

const src = map_sunken_ruins_b1;
const compiled = compileMap(src);
const objects = parseMapObjects(compiled);
/** The common collision layer alone: what the generic map rules see (tide ignored). */
const plain = CollisionGrid.fromMap(compiled);
const { entrance } = src.meta;
/** Where the upper floor's second ladder lands (coordinate contract with map_sunken_ruins_1f). */
const LANDING_2: Cell = { x: 42, y: 31 };

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

/**
 * Cells WorldScene blocks at the given tide: NPCs that are not gated (ノクス is hidden until
 * his event), chests above water, signs, save points and examine-triggers.
 */
const blockers = (tide: TideLevel): Cell[] =>
  objects
    .filter(
      (o) =>
        (o.kind === 'npc' && o.hiddenIf === undefined && o.condition === undefined) ||
        (o.kind === 'chest' && tideAllows(o.tide, tide)) ||
        o.kind === 'sign' ||
        o.kind === 'save_point' ||
        (o.kind === 'trigger' && o.interact),
    )
    .map((o) => ({ x: o.tx, y: o.ty }));

/** The walkability WorldScene uses at the given tide: tide collision plus the blockers. */
const runtimeGrid = (tide: TideLevel): CollisionGrid =>
  collisionForTide(compiled, tide).withBlocked(blockers(tide));

/** Gid the compiled map draws at `c` in the given tile layer (0 = empty). */
const gidAt = (layer: string, c: Cell): number =>
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

/** Whether `c` can be stood on, or stood next to (for a blocking sprite), from `start`. */
const approachable = (reach: Set<string>, c: Cell): boolean =>
  reach.has(cellKey(c)) || neighbours(c).some((n) => reach.has(cellKey(n)));

const triggersFor = (eventId: string): TriggerObject[] =>
  ofKind('trigger').filter((o) => o.eventId === eventId);
const triggerFor = (eventId: string): TriggerObject => {
  const t = triggersFor(eventId);
  expect(t, `${eventId} trigger`).toHaveLength(1);
  return t[0]!;
};
const chestFor = (flag: string): Extract<MapObject, { kind: 'chest' }> => {
  const c = ofKind('chest').find((o) => o.flag === flag);
  expect(c, `${flag}`).toBeDefined();
  return c!;
};
const doorway = (): TriggerObject => triggerFor('ev_ruins_boss_intro');
const bossSymbol = (): EnemyObject => {
  const e = ofKind('enemy').find((o) => o.groupIds.includes('grp_boss_guardian'));
  expect(e, 'grp_boss_guardian symbol').toBeDefined();
  return e!;
};
const nox = (): NpcObject => {
  const n = ofKind('npc').find((o) => o.id === 'npc_nox');
  expect(n, 'npc_nox').toBeDefined();
  return n!;
};
const savePoint = (): Extract<MapObject, { kind: 'save_point' }> => {
  const saves = ofKind('save_point');
  expect(saves).toHaveLength(1);
  return saves[0]!;
};
/** The boss chamber: every tile the guardian can reach once the doorway tile is sealed. */
const chamber = (): Set<string> => {
  const door = doorway();
  const boss = bossSymbol();
  return reachableFrom(plain.withBlocked([{ x: door.tx, y: door.ty }]), { x: boss.tx, y: boss.ty });
};
const inBossChamber = (c: Cell): boolean => chamber().has(cellKey(c));

describe('沈んだ遺跡 下層 (map_sunken_ruins_b1)', () => {
  it('is a 45x35 tide-aware dungeon with the lower-ruins encounter groups and no free saving', () => {
    expect(src.width).toBe(45);
    expect(src.height).toBe(35);
    expect(src.tiles).toHaveLength(35);
    for (const row of src.tiles) expect([...row]).toHaveLength(45);
    expect(src.meta).toMatchObject({
      id: RUINS_B1,
      displayName: '沈んだ遺跡 下層',
      kind: 'dungeon',
      bgmKey: 'bgm_ruins',
      battleBgKey: 'bg_ruins',
      encounterGroups: RUINS_B1_GROUPS,
      tilesets: ['ts_placeholder'],
      canSaveAnywhere: false,
      tideAware: true,
    });
    for (const name of ['deco_water_high', 'deco_water_low', 'collision_high', 'collision_low']) {
      expect(findTileLayer(compiled, name), name).toBeDefined();
    }
  });

  it('starts the player at the foot of ladder #1, facing down, clear at every tide', () => {
    expect(entrance).toEqual({ x: 3, y: 3, facing: 'down' });
    for (const tide of TIDE_LEVELS) {
      expect(runtimeGrid(tide).isBlocked(entrance.x, entrance.y), tide).toBe(false);
    }
    expect(
      objects.some((o) => o.kind !== 'warp' && o.tx === entrance.x && o.ty === entrance.y),
      'object on the entrance',
    ).toBe(false);
  });

  it('climbs both ladders back to 上層 per the coordinate contract', () => {
    const warps = ofKind('warp');
    expect(warps).toHaveLength(2);
    const byTile = (c: Cell) => warps.find((w) => w.tx === c.x && w.ty === c.y);
    const first = byTile({ x: 3, y: 2 });
    expect(first).toMatchObject({
      tw: 1,
      th: 1,
      targetMap: RUINS_1F,
      targetX: 41,
      targetY: 7,
      facing: 'down',
    });
    const second = byTile({ x: 42, y: 30 });
    expect(second).toMatchObject({
      tw: 1,
      th: 1,
      targetMap: RUINS_1F,
      targetX: 42,
      targetY: 32,
      facing: 'down',
    });
    for (const w of warps) {
      const label = `ladder at (${w.tx}, ${w.ty})`;
      expect(w.requiredItem, label).toBeUndefined();
      expect(w.doorFlag, label).toBeUndefined();
      expect(hasTile({ x: w.tx, y: w.ty }, 'stairs'), label).toBe(true);
      expect(plain.isBlocked(w.tx, w.ty), label).toBe(false);
    }
    // Ladder #1 stands directly above the entrance, ladder #2 directly above landing #2.
    expect(first!.ty).toBe(entrance.y - 1);
    expect(first!.tx).toBe(entrance.x);
    expect(second!.ty).toBe(LANDING_2.y - 1);
    expect(second!.tx).toBe(LANDING_2.x);
    // Both landings stay walkable and object-free at every tide.
    for (const landing of [entrance, LANDING_2]) {
      for (const tide of TIDE_LEVELS) {
        expect(
          runtimeGrid(tide).isBlocked(landing.x, landing.y),
          `${cellKey(landing)} ${tide}`,
        ).toBe(false);
      }
      expect(
        objects.some((o) => o.kind !== 'warp' && o.tx === landing.x && o.ty === landing.y),
        `object on landing ${cellKey(landing)}`,
      ).toBe(false);
    }
  });

  it('stacks the two examine-triggers of stele C on one stele tile near the entrance', () => {
    const unreadable = triggerFor('ev_ruins_stele_unreadable');
    const toggle = triggerFor('ev_ruins_tide_toggle');
    expect(unreadable).toMatchObject({
      tx: 6,
      ty: 5,
      tw: 1,
      th: 1,
      once: false,
      condition: '!ruins.tide_learned',
      interact: true,
    });
    expect(toggle).toMatchObject({
      tx: 6,
      ty: 5,
      tw: 1,
      th: 1,
      once: false,
      condition: 'ruins.tide_learned',
      interact: true,
    });
    for (const t of [unreadable, toggle])
      expect(() => validateCondition(t.condition!)).not.toThrow();
    // The unreadable text comes first so it wins while the rune is missing (§3.2).
    const order = ofKind('trigger').filter((t) => t.tx === 6 && t.ty === 5);
    expect(order.map((t) => t.eventId)).toEqual([
      'ev_ruins_stele_unreadable',
      'ev_ruins_tide_toggle',
    ]);
    const stele: Cell = { x: 6, y: 5 };
    expect(hasTile(stele, 'stele')).toBe(true);
    expect(plain.isBlocked(stele.x, stele.y)).toBe(true);
    expect(manhattan(stele, entrance)).toBeLessThanOrEqual(5);
    expect(stele).not.toEqual({ x: entrance.x, y: entrance.y });
    // It can be examined from the hall at every tide: a free tile next to it is reachable.
    for (const tide of TIDE_LEVELS) {
      const reach = reachableFrom(runtimeGrid(tide), entrance);
      expect(approachable(reach, stele), tide).toBe(true);
    }
    // These two (on the stele) are the only examine-triggers on the floor.
    expect(ofKind('trigger').filter((t) => t.interact)).toHaveLength(2);
  });

  it('has the entrance sign within three tiles of the ladder, off the landing', () => {
    const signs = ofKind('sign');
    expect(signs).toHaveLength(1);
    const sign = signs[0]!;
    expect(sign).toMatchObject({ tx: 5, ty: 2, textId: 'dlg_sign_ruins_b1' });
    expect(manhattan({ x: sign.tx, y: sign.ty }, entrance)).toBeLessThanOrEqual(3);
    expect(plain.isBlocked(sign.tx, sign.ty)).toBe(false);
  });

  it('holds the four chests with their items and tides', () => {
    const chests = ofKind('chest')
      .map((c) => ({ itemId: c.itemId, qty: c.qty, flag: c.flag, tide: c.tide }))
      .sort((a, b) => a.flag.localeCompare(b.flag));
    expect(chests).toEqual([
      { itemId: 'it_panacea', qty: 2, flag: 'chest.ruins_b1_01', tide: 'any' },
      { itemId: 'it_star_tear', qty: 1, flag: 'chest.ruins_b1_02', tide: 'any' },
      { itemId: 'eq_wp_mio_4', qty: 1, flag: 'chest.ruins_b1_03', tide: 'low' },
      { itemId: 'it_old_chart', qty: 1, flag: 'chest.ruins_b1_04', tide: 'low' },
    ]);
    for (const c of ofKind('chest')) {
      expect(plain.isBlocked(c.tx, c.ty), c.flag).toBe(false);
      expect(inBossChamber({ x: c.tx, y: c.ty }), `${c.flag} inside the boss chamber`).toBe(false);
      // Chests never block a ladder landing, and never sit under the high-tide water.
      expect(gidAt('collision_high', { x: c.tx, y: c.ty }), `${c.flag} under water`).toBe(0);
    }
    // The star tear stands beside the save point in the antechamber.
    const save = savePoint();
    const tear = chestFor('chest.ruins_b1_02');
    expect(manhattan({ x: tear.tx, y: tear.ty }, { x: save.tx, y: save.ty })).toBe(1);
  });

  it('floods the channel to the chest room at high tide and dries it at low tide (§3.2)', () => {
    // The channel is sand in the base grid; its high-tide water exists only in the tide layers.
    let channel = 0;
    for (let y = 0; y < compiled.height; y++) {
      for (let x = 0; x < compiled.width; x++) {
        const c = { x, y };
        if (gidAt('collision_high', c) === 0) continue;
        channel += 1;
        expect(gidAt('ground', c), `channel ${cellKey(c)} ground`).toBe(tileGid('sand'));
        expect(gidAt('deco_water_high', c), `channel ${cellKey(c)} water`).toBe(tileGid('water'));
        expect(gidAt('collision', c), `channel ${cellKey(c)} in the common layer`).toBe(0);
      }
    }
    expect(channel).toBeGreaterThan(20);
    // Nothing is low-tide-only on this floor.
    expect(findTileLayer(compiled, 'collision_low')!.data.every((g) => g === 0)).toBe(true);
    expect(findTileLayer(compiled, 'deco_water_low')!.data.every((g) => g === 0)).toBe(true);

    const mio = chestFor('chest.ruins_b1_03');
    const chart = chestFor('chest.ruins_b1_04');
    const chestRoom = [LANDING_2, { x: mio.tx, y: mio.ty }, { x: chart.tx, y: chart.ty }];

    // High tide: the chest room is cut off from the entrance but open from ladder #2.
    const high = runtimeGrid('high');
    const highFromEntrance = reachableFrom(high, entrance);
    const highFromLanding = reachableFrom(high, LANDING_2);
    for (const c of chestRoom) {
      expect(
        approachable(highFromEntrance, c),
        `${cellKey(c)} from the entrance at high tide`,
      ).toBe(false);
      expect(approachable(highFromLanding, c), `${cellKey(c)} from ladder #2 at high tide`).toBe(
        true,
      );
    }
    expect(highFromLanding.has(cellKey(entrance))).toBe(false);
    // The ladder itself is walked onto from the landing.
    expect(highFromLanding.has(cellKey({ x: 42, y: 30 }))).toBe(true);

    // Low tide: everything joins up, and the low-tide chests can be opened from the entrance.
    const lowFromEntrance = reachableFrom(runtimeGrid('low'), entrance);
    for (const c of chestRoom) {
      expect(approachable(lowFromEntrance, c), `${cellKey(c)} from the entrance at low tide`).toBe(
        true,
      );
    }
    expect(lowFromEntrance.has(cellKey({ x: 42, y: 30 }))).toBe(true);
  });

  it('keeps the main area and the boss approach open at every tide', () => {
    const door = doorway();
    const save = savePoint();
    const stele: Cell = { x: 6, y: 5 };
    const sign = ofKind('sign')[0]!;
    const panacea = chestFor('chest.ruins_b1_01');
    const tear = chestFor('chest.ruins_b1_02');
    for (const tide of TIDE_LEVELS) {
      const reach = reachableFrom(runtimeGrid(tide), entrance);
      expect(reach.has(cellKey({ x: door.tx, y: door.ty })), `doorway at ${tide}`).toBe(true);
      expect(reach.has(cellKey({ x: 3, y: 2 })), `ladder #1 at ${tide}`).toBe(true);
      for (const [label, c] of [
        ['save point', { x: save.tx, y: save.ty }],
        ['stele C', stele],
        ['sign', { x: sign.tx, y: sign.ty }],
        ['chest.ruins_b1_01', { x: panacea.tx, y: panacea.ty }],
        ['chest.ruins_b1_02', { x: tear.tx, y: tear.ty }],
      ] as const) {
        expect(approachable(reach, c), `${label} at ${tide}`).toBe(true);
      }
    }
  });

  it('puts the guardian beyond the lantern-flanked doorway, never respawning, with its flag', () => {
    const intro = doorway();
    const appear = triggerFor('ev_nox_appear');
    const boss = bossSymbol();
    expect(intro).toMatchObject({ tx: 6, ty: 24, tw: 1, th: 1, once: true, interact: false });
    expect(intro.condition).toBeUndefined();
    expect(appear).toMatchObject({
      tx: 6,
      ty: 24,
      tw: 1,
      th: 1,
      once: true,
      interact: false,
      condition: 'ruins.boss_defeated',
    });
    expect(() => validateCondition(appear.condition!)).not.toThrow();
    // Stacked on the doorway in this order: the intro fires on the way in and is then spent,
    // so ノクス's entrance is the first ready trigger on the way out after the win.
    const stacked = ofKind('trigger').filter((t) => t.tx === intro.tx && t.ty === intro.ty);
    expect(stacked.map((t) => t.eventId)).toEqual(['ev_ruins_boss_intro', 'ev_nox_appear']);
    // One tile wide, lanterns either side.
    const door: Cell = { x: intro.tx, y: intro.ty };
    expect(plain.isBlocked(door.x, door.y)).toBe(false);
    for (const side of [
      { x: door.x - 1, y: door.y },
      { x: door.x + 1, y: door.y },
    ]) {
      expect(hasTile(side, 'lantern'), `lantern at ${cellKey(side)}`).toBe(true);
      expect(plain.isBlocked(side.x, side.y)).toBe(true);
    }
    // The tile the party stands on when the intro fires is the one just before the doorway.
    expect(plain.isBlocked(door.x, door.y - 1)).toBe(false);

    expect(boss).toMatchObject({
      tx: 6,
      ty: 27,
      groupIds: ['grp_boss_guardian'],
      respawnSec: -1,
      radius: 2,
      tide: 'any',
      defeatedFlag: 'ruins.boss_defeated',
    });
    expect(boss.condition).toBeUndefined();
    // The talk happens before contact (§5.12): the symbol stands 3 tiles past the doorway,
    // on the rune circle, in a chamber wide enough to walk around it.
    expect(boss.tx).toBe(door.x);
    expect(boss.ty - door.y).toBe(3);
    expect(hasTile({ x: boss.tx, y: boss.ty }, 'rune_floor')).toBe(true);
    for (let y = door.y + 1; y <= boss.ty; y++) {
      expect(plain.isBlocked(door.x, y), `approach (${door.x}, ${y})`).toBe(false);
    }
    let width = 0;
    for (let x = 0; x < compiled.width; x++) if (!plain.isBlocked(x, boss.ty)) width += 1;
    expect(width).toBeGreaterThanOrEqual(7);
    // The doorway is the only way in: the chamber is sealed once the trigger tile is blocked.
    for (const tide of TIDE_LEVELS) {
      const sealed = reachableFrom(runtimeGrid(tide).withBlocked([door]), entrance);
      expect(sealed.has(cellKey({ x: boss.tx, y: boss.ty })), tide).toBe(false);
    }
    // Only these four events fire on this floor.
    expect(
      ofKind('trigger')
        .map((t) => t.eventId)
        .sort(),
    ).toEqual([
      'ev_nox_appear',
      'ev_ruins_boss_intro',
      'ev_ruins_stele_unreadable',
      'ev_ruins_tide_toggle',
    ]);
  });

  it('hides ノクス inside the chamber, off the approach line, until his event', () => {
    const n = nox();
    const boss = bossSymbol();
    const door: Cell = { x: doorway().tx, y: doorway().ty };
    expect(n).toMatchObject({
      tx: 8,
      ty: 26,
      dialog: 'dlg_nox_idle',
      facing: 'up',
      sprite: 'sprite_npc',
      move: 'static',
      hiddenIf: '!ruins.nox_on_stage',
    });
    expect(n.condition).toBeUndefined();
    expect(() => validateCondition(n.hiddenIf!)).not.toThrow();
    const cell = { x: n.tx, y: n.ty };
    expect(plain.isBlocked(cell.x, cell.y)).toBe(false);
    expect(inBossChamber(cell)).toBe(true);
    // Not on the doorway-to-boss column, not next to the doorway, not on the boss.
    expect(cell.x).not.toBe(door.x);
    expect(manhattan(cell, door)).toBeGreaterThan(1);
    expect(cell).not.toEqual({ x: boss.tx, y: boss.ty });
    // With him on stage the way to the guardian and back out stays open.
    const withNox = runtimeGrid('high').withBlocked([cell]);
    const reach = reachableFrom(withNox, entrance);
    expect(reach.has(cellKey({ x: boss.tx, y: boss.ty }))).toBe(true);
    expect(approachable(reach, cell), 'ノクス can be talked to').toBe(true);
    expect(ofKind('npc')).toHaveLength(1);
  });

  it('has one save point in the antechamber, within 6 tiles of the boss doorway', () => {
    const save = savePoint();
    expect(save).toMatchObject({ tx: 4, ty: 21, heal: false });
    expect(save.onceFlag).toBeUndefined();
    const door = doorway();
    expect(manhattan({ x: save.tx, y: save.ty }, { x: door.tx, y: door.ty })).toBeLessThanOrEqual(
      6,
    );
    expect(inBossChamber({ x: save.tx, y: save.ty })).toBe(false);
    expect(plain.isBlocked(save.tx, save.ty)).toBe(false);
  });

  it('places three symbols in the dry main area and one in the channel at low tide (§5.12)', () => {
    const normals = ofKind('enemy').filter((e) => !e.groupIds.includes('grp_boss_guardian'));
    expect(normals).toHaveLength(4);
    const save = savePoint();
    for (const e of normals) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e.respawnSec, label).toBe(60);
      expect(e.radius, label).toBe(3);
      expect(e.defeatedFlag, label).toBeUndefined();
      expect(e.condition, label).toBeUndefined();
      expect(e.groupIds, label).toEqual(RUINS_B1_GROUPS);
      expect(manhattan({ x: e.tx, y: e.ty }, entrance), label).toBeGreaterThanOrEqual(6);
      expect(manhattan({ x: e.tx, y: e.ty }, { x: save.tx, y: save.ty }), label).toBeGreaterThan(6);
      expect(inBossChamber({ x: e.tx, y: e.ty }), `${label} inside the boss chamber`).toBe(false);
      // Walkable at every tide the symbol spawns at, with most of its wander square open.
      for (const tide of TIDE_LEVELS) {
        if (!tideAllows(e.tide, tide)) continue;
        const grid = collisionForTide(compiled, tide);
        expect(grid.isBlocked(e.tx, e.ty), `${label} at ${tide}`).toBe(false);
        let open = 0;
        let total = 0;
        for (let dy = -e.radius; dy <= e.radius; dy++) {
          for (let dx = -e.radius; dx <= e.radius; dx++) {
            total += 1;
            if (!grid.isBlocked(e.tx + dx, e.ty + dy)) open += 1;
          }
        }
        expect(open / total, `${label} wander area at ${tide}`).toBeGreaterThan(0.5);
      }
    }
    const dry = normals.filter((e) => e.tide === 'any');
    const channel = normals.filter((e) => e.tide === 'low');
    expect(dry).toHaveLength(3);
    expect(channel).toHaveLength(1);
    // The dry symbols stand on ground that never floods; the channel one stands under the
    // high-tide water, so it only spawns once the tide is out.
    for (const e of dry) expect(gidAt('collision_high', { x: e.tx, y: e.ty })).toBe(0);
    expect(gidAt('collision_high', { x: channel[0]!.tx, y: channel[0]!.ty })).not.toBe(0);
    expect(normals.filter((e) => e.tide === 'high')).toHaveLength(0);
  });

  it('reaches every warp and object over the plain collision layer and gives sprites their own tile', () => {
    // The generic map rules (tests/unit/maps-data.test.ts) ignore the tide layers: the
    // channel is sand there, so everything must be reachable from the entrance.
    const runtime = plain.withBlocked(blockers('low'));
    const reachable = reachableFrom(runtime, entrance);
    const reached = (c: Cell): boolean => reachable.has(cellKey(c));
    const taken = new Set<string>();
    for (const o of objects) {
      const cell = { x: o.tx, y: o.ty };
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point' || o.kind === 'npc') {
        expect(neighbours(cell).some(reached), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile`).toBe(false);
        taken.add(cellKey(cell));
        expect(
          ofKind('warp').some((w) => w.tx === o.tx && w.ty === o.ty),
          `${label} sits on a warp`,
        ).toBe(false);
      } else if (o.kind === 'trigger' && o.interact) {
        expect(neighbours(cell).some(reached), `${label} cannot be approached`).toBe(true);
        expect(taken.has(cellKey(cell)), `${label} shares a tile with a sprite`).toBe(false);
      } else {
        expect(reached(cell), `${label} is unreachable`).toBe(true);
      }
    }
    // No dead pockets at low tide: every walkable tile can be reached from ladder #1.
    const low = runtimeGrid('low');
    const lowReach = reachableFrom(low, entrance);
    for (let y = 0; y < compiled.height; y++) {
      for (let x = 0; x < compiled.width; x++) {
        if (low.isBlocked(x, y)) continue;
        expect(lowReach.has(cellKey({ x, y })), `walkable tile (${x}, ${y}) is cut off`).toBe(true);
      }
    }
    // At high tide every walkable tile belongs to one of the two ladders' areas: the party
    // can never be stranded by the water.
    const high = runtimeGrid('high');
    const highReach = new Set([
      ...reachableFrom(high, entrance),
      ...reachableFrom(high, LANDING_2),
    ]);
    for (let y = 0; y < compiled.height; y++) {
      for (let x = 0; x < compiled.width; x++) {
        if (high.isBlocked(x, y)) continue;
        expect(highReach.has(cellKey({ x, y })), `tile (${x}, ${y}) is stranded at high tide`).toBe(
          true,
        );
      }
    }
  });
});
