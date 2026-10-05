import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import { createNewSave } from '@core/save';
import { MAP_IDS, MAP_SOURCES, getMapSource } from '@data/maps';

const compiled = Object.fromEntries(MAP_IDS.map((id) => [id, compileMap(getMapSource(id))]));

describe('authored maps', () => {
  it('compile and use their own id as the registry key', () => {
    for (const id of MAP_IDS) {
      expect(MAP_SOURCES[id]?.meta.id).toBe(id);
      expect(id).toMatch(/^map_[a-z0-9_]+$/);
    }
    expect(MAP_IDS.length).toBeGreaterThanOrEqual(4);
  });

  it('start the new game on a walkable tile of an existing map', () => {
    const save = createNewSave(0);
    const map = compiled[save.location.map];
    expect(map).toBeDefined();
    expect(CollisionGrid.fromMap(map!).isBlocked(save.location.x, save.location.y)).toBe(false);
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

  it('use the id conventions for dialogs, flags and npcs', () => {
    const ids = new Set<string>();
    for (const id of MAP_IDS) {
      for (const o of parseMapObjects(compiled[id]!)) {
        if (o.kind === 'npc') {
          expect(o.id).toMatch(/^npc_[a-z0-9_]+$/);
          expect(o.dialog).toMatch(/^dlg_[a-z0-9_]+$/);
          expect(ids.has(o.id), `duplicate npc id ${o.id}`).toBe(false);
          ids.add(o.id);
        }
        if (o.kind === 'chest') expect(o.flag).toMatch(/^chest\.[a-z0-9_]+$/);
        if (o.kind === 'sign') expect(o.textId).toMatch(/^dlg_[a-z0-9_]+$/);
        if (o.kind === 'trigger') expect(o.eventId).toMatch(/^ev_[a-z0-9_]+$/);
      }
    }
  });
});
