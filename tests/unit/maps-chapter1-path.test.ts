import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import type { MapObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { MapSource } from '@core/map/source';
import { map_lighthouse_path } from '@data/maps/map_lighthouse_path';
import { map_minato_village } from '@data/maps/map_minato_village';

// docs/GAME_DESIGN.md §3.1 / §10.3 / §13 rows 2-5: the prologue route from ミナト村's north
// exit up 灯台への道 to the lighthouse door. The two maps are imported directly so the checks
// hold whether or not map_lighthouse_path is registered in src/data/maps/index.ts yet.

const VILLAGE = 'map_minato_village';
const PATH = 'map_lighthouse_path';

interface Cell {
  x: number;
  y: number;
}

const manhattan = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const neighbours = (c: Cell): Cell[] => [
  { x: c.x + 1, y: c.y },
  { x: c.x - 1, y: c.y },
  { x: c.x, y: c.y + 1 },
  { x: c.x, y: c.y - 1 },
];
const inRect = (o: Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>, c: Cell): boolean =>
  c.x >= o.tx && c.x < o.tx + o.tw && c.y >= o.ty && c.y < o.ty + o.th;
const touches = (o: Pick<MapObject, 'tx' | 'ty' | 'tw' | 'th'>, c: Cell): boolean =>
  inRect(o, c) || neighbours(c).some((n) => inRect(o, n));

function load(src: MapSource): {
  grid: CollisionGrid;
  objects: MapObject[];
  warps: WarpObject[];
  tileAt: (c: Cell) => string | undefined;
} {
  const map = compileMap(src);
  const objects = parseMapObjects(map);
  return {
    grid: CollisionGrid.fromMap(map),
    objects,
    warps: objects.filter((o): o is WarpObject => o.kind === 'warp'),
    tileAt: (c) => [...(src.tiles[c.y] ?? '')][c.x],
  };
}

/** Tiles reachable from `start` over unblocked cells, as "x,y" keys. */
function reachableFrom(grid: CollisionGrid, start: Cell): Set<string> {
  const seen = new Set<string>();
  const queue: Cell[] = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const key = `${cur?.x},${cur?.y}`;
    if (!cur || grid.isBlocked(cur.x, cur.y) || seen.has(key)) continue;
    seen.add(key);
    queue.push(...neighbours(cur));
  }
  return seen;
}

const village = load(map_minato_village);
const path = load(map_lighthouse_path);

describe('ミナト村 north exit (map_minato_village)', () => {
  const northWarp = village.warps.filter((w) => w.targetMap === PATH);
  const trigger = village.objects.filter((o) => o.kind === 'trigger');
  const mio = village.objects.find((o) => o.kind === 'npc' && o.id === 'npc_mio');

  it('warps from the path tiles (19-20, 0) to the entrance of 灯台への道, facing up', () => {
    expect(northWarp).toHaveLength(1);
    expect(northWarp[0]).toMatchObject({
      tx: 19,
      ty: 0,
      tw: 2,
      th: 1,
      targetX: map_lighthouse_path.meta.entrance.x,
      targetY: map_lighthouse_path.meta.entrance.y,
      facing: 'up',
    });
    for (const x of [19, 20]) {
      expect(village.tileAt({ x, y: 0 }), `tile (${x}, 0)`).toBe('=');
      expect(village.grid.isBlocked(x, 0), `warp tile (${x}, 0)`).toBe(false);
    }
  });

  it('fires ev_mio_join once on the two tiles below the warp, after the intro', () => {
    expect(trigger).toHaveLength(1);
    expect(trigger[0]).toMatchObject({
      tx: 19,
      ty: 1,
      tw: 2,
      th: 1,
      eventId: 'ev_mio_join',
      once: true,
      condition: 'minato.intro_done',
    });
    // The trigger row is the only way onto the warp, so the event cannot be skipped.
    for (const x of [19, 20]) {
      expect(village.grid.isBlocked(x, 1), `trigger tile (${x}, 1)`).toBe(false);
      expect(inRect(trigger[0]!, { x, y: 1 })).toBe(true);
      expect(inRect(northWarp[0]!, { x, y: 0 })).toBe(true);
    }
  });

  it('places npc_mio 4 tiles right of the trigger on a clear row, hidden once she has joined', () => {
    expect(mio).toMatchObject({
      kind: 'npc',
      tx: 24,
      ty: 1,
      dialog: 'dlg_mio_idle',
      facing: 'left',
      sprite: 'sprite_npc',
      hiddenIf: 'minato.mio_joined',
    });
    expect(mio).not.toHaveProperty('condition');
    // §10.3: she walks left x3 (24 → 21) and the player on x19-20 faces right at her.
    const walk = [21, 22, 23, 24].map((x) => ({ x, y: 1 }));
    for (const c of walk) {
      expect(village.grid.isBlocked(c.x, c.y), `tile (${c.x}, ${c.y})`).toBe(false);
      const other = village.objects.find(
        (o) => o !== mio && o.kind !== 'trigger' && o.kind !== 'warp' && inRect(o, c),
      );
      expect(other, `(${c.x}, ${c.y}) is occupied by ${other?.kind}`).toBeUndefined();
    }
    expect(manhattan({ x: mio!.tx, y: mio!.ty }, { x: 20, y: 1 })).toBe(4);
  });
});

describe('灯台への道 (map_lighthouse_path)', () => {
  const src = map_lighthouse_path;
  const { entrance } = src.meta;
  const reachable = reachableFrom(path.grid, entrance);
  const reached = (c: Cell): boolean => reachable.has(`${c.x},${c.y}`);

  it('is a 30x20 field map on the coast encounter group with no free saving', () => {
    expect(src.width).toBe(30);
    expect(src.height).toBe(20);
    expect(src.tiles).toHaveLength(20);
    for (const row of src.tiles) expect([...row]).toHaveLength(30);
    expect(src.meta).toEqual({
      id: PATH,
      displayName: '灯台への道',
      kind: 'field',
      bgmKey: 'bgm_field',
      battleBgKey: 'bg_coast',
      encounterGroups: ['grp_coast_a'],
      tilesets: ['ts_placeholder'],
      entrance: { x: 15, y: 18, facing: 'up' },
      canSaveAnywhere: false,
    });
    expect(path.grid.isBlocked(entrance.x, entrance.y)).toBe(false);
  });

  it('links its south edge to the village north exit, consistently in both directions', () => {
    const south = path.warps.filter((w) => w.targetMap === VILLAGE);
    expect(south).toHaveLength(1);
    const back = south[0]!;
    expect(back).toMatchObject({
      tx: 14,
      ty: 19,
      tw: 2,
      th: 1,
      targetX: 19,
      targetY: 1,
      facing: 'down',
    });
    for (const x of [14, 15])
      expect(path.grid.isBlocked(x, 19), `warp tile (${x}, 19)`).toBe(false);
    // Arriving from the village lands on the entrance, right above the way back.
    const north = village.warps.find((w) => w.targetMap === PATH)!;
    expect({ x: north.targetX, y: north.targetY }).toEqual({ x: entrance.x, y: entrance.y });
    expect(touches(back, entrance)).toBe(true);
    expect(touches(back, { x: entrance.x, y: entrance.y + 1 })).toBe(true);
    // Going back lands below the village warp, on the (already spent) ev_mio_join trigger row.
    expect(village.grid.isBlocked(back.targetX, back.targetY)).toBe(false);
    expect(touches(north, { x: back.targetX, y: back.targetY })).toBe(true);
    expect(touches(north, { x: back.targetX, y: back.targetY - 1 })).toBe(true);
  });

  it('puts the locked lighthouse door at the top centre with ev_core_shatter in front of it', () => {
    expect(path.tileAt({ x: 15, y: 1 })).toBe('D');
    const door = path.warps.find((w) => w.tx === 15 && w.ty === 1);
    // Leads into the tower: 1F's south door at (12, 23) returns to (15, 2) here, facing down.
    expect(door).toMatchObject({
      tw: 1,
      th: 1,
      targetMap: 'map_lighthouse_1f',
      targetX: 12,
      targetY: 22,
      facing: 'up',
      requiredItem: 'it_key_lighthouse',
      lockedTextId: 'dlg_lighthouse_door_locked',
      doorFlag: 'door.lighthouse_01',
    });
    expect(path.grid.isBlocked(15, 1)).toBe(false);
    // The village exit and the tower door are the only two warps.
    expect(path.warps).toHaveLength(2);

    const triggers = path.objects.filter((o) => o.kind === 'trigger');
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      tx: 15,
      ty: 2,
      tw: 1,
      th: 1,
      eventId: 'ev_core_shatter',
      once: true,
      condition: 'minato.mio_joined',
    });
    expect(path.grid.isBlocked(15, 2)).toBe(false);
    expect(reached({ x: 15, y: 2 })).toBe(true);
  });

  it('spawns three coast enemies only after the core has shattered, away from entrance and door', () => {
    const sources = src.objects.filter((o) => o.type === 'enemy');
    expect(sources).toHaveLength(3);
    for (const e of sources) {
      expect(e).toMatchObject({
        group_id: 'grp_coast_a',
        respawn_sec: 60,
        radius: 4,
        condition: 'main.core_shattered',
      });
    }
    const enemies = path.objects.filter((o) => o.kind === 'enemy');
    expect(enemies).toHaveLength(3);
    for (const e of enemies) {
      const label = `enemy at (${e.tx}, ${e.ty})`;
      expect(e, label).toMatchObject({
        groupIds: ['grp_coast_a'],
        respawnSec: 60,
        radius: 4,
        condition: 'main.core_shattered',
      });
      const at = { x: e.tx, y: e.ty };
      expect(path.grid.isBlocked(at.x, at.y), label).toBe(false);
      expect(reached(at), label).toBe(true);
      expect(manhattan(at, entrance), `${label} vs entrance`).toBeGreaterThanOrEqual(6);
      expect(
        Math.max(Math.abs(at.x - 15), Math.abs(at.y - 2)),
        `${label} vs door trigger`,
      ).toBeGreaterThan(1);
      // §5.12: the symbol wanders within `radius`, so most of that square must be open ground.
      let open = 0;
      let total = 0;
      for (let dy = -e.radius; dy <= e.radius; dy++) {
        for (let dx = -e.radius; dx <= e.radius; dx++) {
          total += 1;
          if (!path.grid.isBlocked(at.x + dx, at.y + dy)) open += 1;
        }
      }
      expect(open / total, `${label} wander area`).toBeGreaterThan(0.5);
    }
  });

  it('has a signpost by the entrance and one herb chest, both on reachable tiles', () => {
    const signs = path.objects.filter((o) => o.kind === 'sign');
    expect(signs).toHaveLength(1);
    expect(signs[0]).toMatchObject({ tx: 17, ty: 18, textId: 'dlg_sign_lighthouse_path' });
    expect(manhattan({ x: signs[0]!.tx, y: signs[0]!.ty }, entrance)).toBeLessThanOrEqual(3);

    const chests = path.objects.filter((o) => o.kind === 'chest');
    expect(chests).toHaveLength(1);
    expect(chests[0]).toMatchObject({
      tx: 1,
      ty: 6,
      itemId: 'it_herb',
      qty: 2,
      flag: 'chest.path_01',
    });

    for (const o of [...signs, ...chests]) {
      const label = `${o.kind} at (${o.tx}, ${o.ty})`;
      expect(path.grid.isBlocked(o.tx, o.ty), label).toBe(false);
      expect(neighbours({ x: o.tx, y: o.ty }).some(reached), label).toBe(true);
      expect(inRect(o, entrance), `${label} sits on the entrance`).toBe(false);
    }
  });

  it('keeps every warp reachable from the entrance', () => {
    for (const w of path.warps) {
      const cells = [{ x: w.tx, y: w.ty }];
      if (w.tw === 2) cells.push({ x: w.tx + 1, y: w.ty });
      const ok =
        w.requiredItem === undefined
          ? cells.every(reached)
          : cells.flatMap(neighbours).some((c) => !inRect(w, c) && reached(c));
      expect(ok, `warp at (${w.tx}, ${w.ty})`).toBe(true);
    }
  });
});
