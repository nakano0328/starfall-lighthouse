import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { compileMap } from '@core/map/compile';
import type { MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { LegendEntry, MapSource } from '@core/map/source';
import { OVERLAY_EMPTY, normalizeLegendEntry } from '@core/map/source';
import { createNewSave } from '@core/save';
import { DIALOGS } from '@data/dialogs';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { MAP_IDS, MAP_SOURCES, getMapSource } from '@data/maps';
import type { Facing } from '@data/types';

const compiled = Object.fromEntries(MAP_IDS.map((id) => [id, compileMap(getMapSource(id))]));
const objects = Object.fromEntries(MAP_IDS.map((id) => [id, parseMapObjects(compiled[id]!)]));

interface Cell {
  x: number;
  y: number;
}

/** Tile rectangle of a parsed map object. */
type Rect = Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>;

/** Objects with a sprite the player cannot walk through; WorldScene adds them to the grid. */
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
/** Inside `r` or 4-adjacent to one of its cells. */
const touchesRect = (r: Rect, c: Cell): boolean =>
  inRect(r, c) || neighbours(c).some((n) => inRect(r, n));
/** Cells outside `r` that are 4-adjacent to it. */
const rectNeighbours = (r: Rect): Cell[] =>
  rectCells(r)
    .flatMap(neighbours)
    .filter((c) => !inRect(r, c));

const objectsOf = (id: string): MapObject[] => objects[id] ?? [];
const warpsOf = (id: string): WarpObject[] =>
  objectsOf(id).filter((o): o is WarpObject => o.kind === 'warp');
const isBlocker = (o: MapObject): o is Blocker =>
  o.kind === 'npc' || o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point';
const blockersOf = (id: string): Blocker[] => objectsOf(id).filter(isBlocker);
/** NPCs gated by hidden_if / condition are absent for part of the game. */
const isGated = (o: Blocker): boolean =>
  o.kind === 'npc' && (o.hiddenIf !== undefined || o.condition !== undefined);
/** The walkability WorldScene uses at runtime: the collision layer plus the given objects. */
const gridWith = (id: string, blockers: readonly Blocker[]): CollisionGrid =>
  CollisionGrid.fromMap(compiled[id]!).withBlocked(blockers.map(cellOf));

/** Name of the ground tile the ASCII source places at (x, y), overlay included. */
function groundTile(src: MapSource, x: number, y: number): string | undefined {
  const charAt = (rows: readonly string[] | undefined): string | undefined => {
    const row = rows?.[y];
    return row === undefined ? undefined : [...row][x];
  };
  const entry = (ch: string | undefined): LegendEntry | undefined => {
    if (ch === undefined || ch === OVERLAY_EMPTY) return undefined;
    const e = src.legend[ch];
    return e === undefined ? undefined : normalizeLegendEntry(e);
  };
  return entry(charAt(src.overlay))?.ground ?? entry(charAt(src.tiles))?.ground;
}

/** Tiles reachable from `start` by 4-neighbour steps over unblocked cells, as "x,y" keys. */
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

describe('authored maps', () => {
  it('compile and use their own id as the registry key', () => {
    for (const id of MAP_IDS) {
      expect(MAP_SOURCES[id]?.meta.id).toBe(id);
      expect(id).toMatch(/^map_[a-z0-9_]+$/);
    }
    expect(MAP_IDS.length).toBeGreaterThanOrEqual(4);
  });

  it('start the new game on a walkable tile of an existing map, on the opening trigger', () => {
    const save = createNewSave(0, []);
    const map = compiled[save.location.map];
    expect(map).toBeDefined();
    expect(CollisionGrid.fromMap(map!).isBlocked(save.location.x, save.location.y)).toBe(false);
    const trigger = parseMapObjects(map!).find(
      (o) => o.kind === 'trigger' && o.tx === save.location.x && o.ty === save.location.y,
    );
    expect(trigger).toMatchObject({ kind: 'trigger', eventId: 'ev_opening', once: true });
  });

  it('place entrances, NPCs, chests, signs and save points on walkable tiles', () => {
    for (const id of MAP_IDS) {
      const map = compiled[id]!;
      const grid = CollisionGrid.fromMap(map);
      const meta = getMapSource(id).meta;
      expect(grid.isBlocked(meta.entrance.x, meta.entrance.y), `${id} entrance`).toBe(false);
      for (const o of parseMapObjects(map)) {
        if (
          o.kind === 'npc' ||
          o.kind === 'chest' ||
          o.kind === 'sign' ||
          o.kind === 'save_point'
        ) {
          expect(grid.isBlocked(o.tx, o.ty), `${id} ${o.kind} at (${o.tx}, ${o.ty})`).toBe(false);
        }
      }
    }
  });

  it('warp to existing maps and land on walkable tiles', () => {
    for (const id of MAP_IDS) {
      for (const o of parseMapObjects(compiled[id]!)) {
        if (o.kind !== 'warp') continue;
        const target = compiled[o.targetMap];
        expect(target, `${id} warp → ${o.targetMap}`).toBeDefined();
        expect(
          CollisionGrid.fromMap(target!).isBlocked(o.targetX, o.targetY),
          `${id} warp → ${o.targetMap} (${o.targetX}, ${o.targetY})`,
        ).toBe(false);
        // The warp tile itself must be reachable.
        expect(
          CollisionGrid.fromMap(compiled[id]!).isBlocked(o.tx, o.ty),
          `${id} warp tile (${o.tx}, ${o.ty})`,
        ).toBe(false);
      }
    }
  });

  // The parser only checks that a chest's `qty` is an integer. WorldScene.openChest hands it to
  // Inventory.add, which adds nothing for qty <= 0 and then leaves the chest flag unset (the chest
  // can never be opened), and adds it straight to the gold total; so the data is checked here.
  it('reference existing items in chests and door locks, with a qty the player can take', () => {
    for (const id of MAP_IDS) {
      for (const o of parseMapObjects(compiled[id]!)) {
        if (o.kind === 'chest') {
          const label = `${id} chest ${o.flag} (${o.itemId})`;
          expect(o.qty, `${label} qty`).toBeGreaterThanOrEqual(1);
          if (o.itemId !== 'gold') {
            // §9.3: chests hold it_* consumables/keys or eq_* equipment (one piece at a time).
            const def = findItem(o.itemId);
            const equip = findEquip(o.itemId);
            expect(def ?? equip, label).toBeDefined();
            if (def) expect(o.qty, `${label} qty`).toBeLessThanOrEqual(def.maxQty);
            else expect(o.qty, `${label} equipment qty`).toBe(1);
          }
        }
        if (o.kind === 'warp' && o.requiredItem !== undefined)
          expect(findItem(o.requiredItem), `${id} door ${o.requiredItem}`).toBeDefined();
      }
    }
  });

  it('put a warp on every door tile, and every warp on a door tile or the map edge', () => {
    for (const id of MAP_IDS) {
      const src = getMapSource(id);
      const warps = warpsOf(id);
      const isDoor = (c: Cell): boolean => groundTile(src, c.x, c.y) === 'door';
      const isEdge = (c: Cell): boolean =>
        c.x === 0 || c.y === 0 || c.x === src.width - 1 || c.y === src.height - 1;
      for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
          if (!isDoor({ x, y })) continue;
          expect(
            warps.some((w) => inRect(w, { x, y })),
            `${id} door tile (${x}, ${y}) has no warp`,
          ).toBe(true);
        }
      }
      // Exits may also be plain tiles on the map edge (§3.1: the 北 / 東 exits of ミナト村).
      for (const w of warps) {
        expect(
          rectCells(w).some((c) => isDoor(c) || isEdge(c)),
          `${id} warp at (${w.tx}, ${w.ty}) is neither on a door tile nor on the map edge`,
        ).toBe(true);
      }
    }
  });

  it('warp back and forth between neighbouring tiles, landing with the return warp behind', () => {
    for (const id of MAP_IDS) {
      for (const w of warpsOf(id)) {
        const landing: Cell = { x: w.targetX, y: w.targetY };
        const label = `${id} warp (${w.tx}, ${w.ty}) → ${w.targetMap} (${landing.x}, ${landing.y})`;
        // The way back: a warp next to (or under) the landing tile that leads back next to this one.
        const returns = warpsOf(w.targetMap).filter(
          (r) =>
            r.targetMap === id &&
            touchesRect(r, landing) &&
            touchesRect(w, { x: r.targetX, y: r.targetY }),
        );
        expect(returns.length, `${label}: no return warp`).toBeGreaterThan(0);
        // Arrive facing away from the return warp, so stepping forward does not warp straight back.
        const d = FACING_DELTA[w.facing];
        const behind: Cell = { x: landing.x - d.x, y: landing.y - d.y };
        const ahead: Cell = { x: landing.x + d.x, y: landing.y + d.y };
        expect(
          returns.some((r) => inRect(r, behind) || (inRect(r, landing) && !inRect(r, ahead))),
          `${label}: facing ${w.facing} does not point away from the return warp`,
        ).toBe(true);
      }
    }
  });

  it('keep entrances and warp landings clear of NPCs, chests, signs and save points', () => {
    for (const id of MAP_IDS) {
      const { entrance } = getMapSource(id).meta;
      expect(
        gridWith(id, blockersOf(id)).isBlocked(entrance.x, entrance.y),
        `${id} entrance (${entrance.x}, ${entrance.y}) is blocked at runtime`,
      ).toBe(false);
      for (const w of warpsOf(id)) {
        expect(compiled[w.targetMap], `${id} warp → ${w.targetMap}`).toBeDefined();
        expect(
          gridWith(w.targetMap, blockersOf(w.targetMap)).isBlocked(w.targetX, w.targetY),
          `${id} warp → ${w.targetMap} (${w.targetX}, ${w.targetY}) is blocked at runtime`,
        ).toBe(false);
      }
    }
  });

  it('reach every warp and every interactable object from the entrance', () => {
    for (const id of MAP_IDS) {
      const { entrance } = getMapSource(id).meta;
      // Gated NPCs are meant to seal a path for a while (§3.1 guard), so they are left out here;
      // warp tiles are walkable (asserted above) and are crossed like any other tile.
      const grid = gridWith(
        id,
        blockersOf(id).filter((o) => !isGated(o)),
      );
      const reachable = reachableFrom(grid, entrance);
      const reached = (c: Cell): boolean => reachable.has(cellKey(c));
      for (const o of objectsOf(id)) {
        if (o.kind === 'warp') {
          // A locked door is used from the tile in front of it; an open one is walked onto.
          const ok =
            o.requiredItem === undefined
              ? rectCells(o).every(reached)
              : rectNeighbours(o).some(reached);
          expect(ok, `${id} warp at (${o.tx}, ${o.ty}) is unreachable from the entrance`).toBe(
            true,
          );
        } else if (isBlocker(o)) {
          expect(
            neighbours(cellOf(o)).some(reached),
            `${id} ${o.kind} at (${o.tx}, ${o.ty}) cannot be approached from the entrance`,
          ).toBe(true);
        }
      }
    }
  });

  it('give every NPC, chest, sign and save point its own tile, off the warps', () => {
    for (const id of MAP_IDS) {
      const taken = new Map<string, string>();
      for (const o of blockersOf(id)) {
        const label = `${id} ${o.kind} at (${o.tx}, ${o.ty})`;
        const other = taken.get(cellKey(cellOf(o)));
        expect(other, `${label} shares its tile with ${other}`).toBeUndefined();
        taken.set(cellKey(cellOf(o)), o.kind === 'npc' ? o.id : o.kind);
        expect(
          warpsOf(id).some((w) => inRect(w, cellOf(o))),
          `${label} sits on a warp`,
        ).toBe(false);
      }
    }
  });

  it('use the id conventions for dialogs, flags and npcs', () => {
    const ids = new Set<string>();
    const chestFlags = new Set<string>();
    for (const id of MAP_IDS) {
      for (const o of parseMapObjects(compiled[id]!)) {
        if (o.kind === 'npc') {
          expect(o.id).toMatch(/^npc_[a-z0-9_]+$/);
          expect(o.dialog).toMatch(/^dlg_[a-z0-9_]+$/);
          expect(ids.has(o.id), `duplicate npc id ${o.id}`).toBe(false);
          ids.add(o.id);
        }
        if (o.kind === 'chest') {
          expect(o.flag).toMatch(/^chest\.[a-z0-9_]+$/);
          expect(chestFlags.has(o.flag), `duplicate chest flag ${o.flag}`).toBe(false);
          chestFlags.add(o.flag);
        }
        if (o.kind === 'sign') expect(o.textId).toMatch(/^dlg_[a-z0-9_]+$/);
        if (o.kind === 'trigger') expect(o.eventId).toMatch(/^ev_[a-z0-9_]+$/);
      }
    }
  });

  // WorldScene evaluates these at runtime and evaluateCondition throws on malformed input,
  // so a bad `condition` / `hidden_if` must fail here rather than in WorldScene.create().
  it('use well-formed condition strings on NPCs and triggers (§9.3 grammar)', () => {
    let checked = 0;
    for (const id of MAP_IDS) {
      for (const o of objectsOf(id)) {
        const conditions: (string | undefined)[] =
          o.kind === 'npc' ? [o.condition, o.hiddenIf] : o.kind === 'trigger' ? [o.condition] : [];
        for (const cond of conditions) {
          if (cond === undefined) continue;
          checked += 1;
          expect(
            () => validateCondition(cond),
            `${id} ${o.kind} at (${o.tx}, ${o.ty}): "${cond}"`,
          ).not.toThrow();
        }
      }
    }
    // The village guard's hidden_if is authored in this commit, so the sweep must see it.
    expect(checked).toBeGreaterThan(0);
  });

  // docs/GAME_DESIGN.md §3.1: 東出口は `minato.talked_to_grandpa` まで村人が塞ぐ.
  it('let the guard block the east exit of ミナト村 until the flag is set', () => {
    const src = getMapSource('map_minato_village');
    const map = compiled[src.meta.id]!;
    const base = CollisionGrid.fromMap(map);
    const npcs = parseMapObjects(map).filter((o) => o.kind === 'npc');
    const npcTiles = (except?: string): Cell[] =>
      npcs.filter((o) => o.id !== except).map((o) => ({ x: o.tx, y: o.ty }));
    const eastExit: Cell = { x: 39, y: 14 };
    const northExit: Cell[] = [
      { x: 19, y: 0 },
      { x: 20, y: 0 },
    ];

    expect(npcs.find((o) => o.id === 'npc_minato_guard')).toMatchObject({
      hiddenIf: 'minato.talked_to_grandpa',
    });

    // Guard present: the whole east road past the guard is sealed, the rest of the village is not.
    const withGuard = reachableFrom(base.withBlocked(npcTiles()), src.meta.entrance);
    expect(withGuard.has(cellKey(eastExit))).toBe(false);
    expect(withGuard.has(cellKey({ x: 38, y: 14 }))).toBe(false);
    expect(withGuard.has(cellKey({ x: 36, y: 14 }))).toBe(true);
    for (const c of northExit)
      expect(withGuard.has(cellKey(c)), `north exit ${cellKey(c)}`).toBe(true);
    // Everything else stays reachable; the only sealed object is the east-exit warp itself.
    for (const o of parseMapObjects(map)) {
      if (o.kind === 'warp' && inRect(o, eastExit)) continue;
      if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'warp')
        expect(withGuard.has(cellKey({ x: o.tx, y: o.ty })), `${o.kind} at ${o.tx},${o.ty}`).toBe(
          true,
        );
    }

    // Guard hidden: the east exit opens, the north exit stays open.
    const withoutGuard = reachableFrom(
      base.withBlocked(npcTiles('npc_minato_guard')),
      src.meta.entrance,
    );
    expect(withoutGuard.has(cellKey(eastExit))).toBe(true);
    for (const c of northExit) expect(withoutGuard.has(cellKey(c))).toBe(true);
  });
  // docs/GAME_DESIGN.md §3.1: 海岸街道 — first field map, tutorial sign, one save point.
  describe('海岸街道 (map_coast_road)', () => {
    const COAST = 'map_coast_road';
    const VILLAGE = 'map_minato_village';
    const COAST_GROUPS = new Set(['grp_coast_a', 'grp_coast_b']);
    const src = getMapSource(COAST);
    const grid = CollisionGrid.fromMap(compiled[COAST]!);
    const villageGrid = CollisionGrid.fromMap(compiled[VILLAGE]!);

    it('is a 40x25 field map with the coast encounter groups and no free saving', () => {
      expect(src.width).toBe(40);
      expect(src.height).toBe(25);
      expect(src.meta).toMatchObject({
        kind: 'field',
        bgmKey: 'bgm_field',
        battleBgKey: 'bg_coast',
        encounterGroups: ['grp_coast_a', 'grp_coast_b'],
        canSaveAnywhere: false,
      });
    });

    it('links its west edge to the village east gate, both landings walkable', () => {
      const { entrance } = src.meta;
      const west = warpsOf(COAST).filter((w) => w.tx === 0);
      expect(west).toHaveLength(1);
      expect(west[0]).toMatchObject({
        targetMap: VILLAGE,
        targetX: 38,
        targetY: 14,
        facing: 'left',
      });
      expect(touchesRect(west[0]!, entrance)).toBe(true);
      expect(villageGrid.isBlocked(38, 14)).toBe(false);

      const east = warpsOf(VILLAGE).filter((w) => w.targetMap === COAST);
      expect(east).toHaveLength(1);
      expect(east[0]).toMatchObject({
        tx: 39,
        ty: 14,
        targetX: entrance.x,
        targetY: entrance.y,
        facing: 'right',
      });
      expect(grid.isBlocked(entrance.x, entrance.y)).toBe(false);
      // The forest does not exist yet, so nothing warps east (§3.1: map_whisper_forest is pending).
      expect(warpsOf(COAST).some((w) => w.tx === src.width - 1)).toBe(false);
    });

    it('places enemy symbols on walkable tiles, away from the entrance, in the coast groups', () => {
      const enemies = objectsOf(COAST).filter((o) => o.kind === 'enemy');
      expect(enemies).toHaveLength(4);
      const { entrance } = src.meta;
      for (const e of enemies) {
        const label = `enemy at (${e.tx}, ${e.ty})`;
        expect(grid.isBlocked(e.tx, e.ty), label).toBe(false);
        expect(
          Math.abs(e.tx - entrance.x) + Math.abs(e.ty - entrance.y),
          label,
        ).toBeGreaterThanOrEqual(6);
        expect(e.groupIds.length, label).toBeGreaterThan(0);
        for (const g of e.groupIds) expect(COAST_GROUPS.has(g), `${label} group ${g}`).toBe(true);
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
      expect(enemies.filter((e) => e.groupIds.includes('grp_coast_b'))).toHaveLength(1);
    });

    it('has a tutorial sign, an east-end sign and a save point with existing dialogs', () => {
      const signs = objectsOf(COAST).filter((o) => o.kind === 'sign');
      expect(signs.map((s) => s.textId).sort()).toEqual([
        'dlg_sign_coast_east',
        'dlg_sign_coast_tutorial',
      ]);
      for (const s of signs) expect(DIALOGS[s.textId], s.textId).toBeDefined();
      expect(objectsOf(COAST).filter((o) => o.kind === 'save_point')).toHaveLength(1);
      expect(objectsOf(COAST).filter((o) => o.kind === 'chest')).toMatchObject([
        { itemId: 'it_herb', qty: 2, flag: 'chest.coast_01' },
      ]);
    });
  });
});
