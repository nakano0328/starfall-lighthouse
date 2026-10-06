import { describe, expect, it } from 'vitest';

import { FACING_DELTA } from '@core/grid/mover';
import { compileMap } from '@core/map/compile';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
import type { NpcObject } from '@core/map/objects';
import { CHARACTER_IDS } from '@data/characters';
import { DIALOGS } from '@data/dialogs';
import { EVENTS } from '@data/events';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { MAP_IDS, MAP_SOURCES, getMapSource } from '@data/maps';
import type { EventCommand } from '@data/types';

/** `area.event` flag keys (docs/GAME_DESIGN.md §2.3), for `set_flag.key` and `choice.set`. */
const FLAG_KEY = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

/** NPC ids placed on each map; `npcIds` is the union over every map. */
const npcByMap = new Map<string, Set<string>>();
const npcIds = new Set<string>();
/** Every trigger placed on a map, with the event it launches. */
const triggers: { mapId: string; eventId: string }[] = [];
for (const id of MAP_IDS) {
  const npcs = new Set<string>();
  for (const o of parseMapObjects(compileMap(getMapSource(id)))) {
    if (o.kind === 'npc') {
      npcs.add(o.id);
      npcIds.add(o.id);
    }
    if (o.kind === 'trigger') triggers.push({ mapId: id, eventId: o.eventId });
  }
  npcByMap.set(id, npcs);
}

/** The NPC a command addresses, or undefined when it has none (or moves the player). */
function targetNpc(c: EventCommand): string | undefined {
  if (c.cmd === 'move' || c.cmd === 'face') return c.actor === 'player' ? undefined : c.actor;
  if (c.cmd === 'spawn_npc' || c.cmd === 'remove_npc') return c.id;
  return undefined;
}

/**
 * Walks every trigger-launched event on the map its trigger sits on, following `warp`
 * (WorldScene.warpTo restarts the scene on the target map and the script carries on there)
 * and `battle.win_event` chains. `check` sees each command with the map it plays on; the
 * result is the id of every event reached this way.
 */
function walkTriggeredEvents(
  check: (eventId: string, mapId: string, c: EventCommand) => void,
): Set<string> {
  const reached = new Set<string>();
  const seen = new Set<string>();
  const visit = (eventId: string, mapId: string): void => {
    const key = `${eventId}@${mapId}`;
    if (seen.has(key)) return;
    seen.add(key);
    reached.add(eventId);
    let current = mapId;
    for (const c of EVENTS[eventId] ?? []) {
      check(eventId, current, c);
      if (c.cmd === 'warp') current = c.map;
      if (c.cmd === 'battle' && c.win_event !== undefined) visit(c.win_event, current);
    }
  };
  for (const t of triggers) visit(t.eventId, t.mapId);
  return reached;
}

describe('authored events', () => {
  it('use ev_ ids and reference existing dialogs, maps, items, members, flags and actors', () => {
    expect(Object.keys(EVENTS).length).toBeGreaterThanOrEqual(1);
    for (const [id, commands] of Object.entries(EVENTS)) {
      expect(id).toMatch(/^ev_[a-z0-9_]+$/);
      expect(commands.length).toBeGreaterThan(0);
      for (const c of commands) {
        if (c.cmd === 'say') expect(DIALOGS[c.dialog], `${id} say ${c.dialog}`).toBeDefined();
        if (c.cmd === 'warp') expect(MAP_SOURCES[c.map], `${id} warp ${c.map}`).toBeDefined();
        if (c.cmd === 'give_item' || c.cmd === 'take_item') {
          // Equipment ids are valid too (quest rewards land in the same bag).
          expect(findItem(c.item) ?? findEquip(c.item), `${id} item ${c.item}`).toBeDefined();
          // qty 0 gives nothing and prints 「…は これ以上 持てない。」 (pickupMessage).
          expect(Number.isInteger(c.qty) && c.qty >= 1, `${id} ${c.cmd} qty ${c.qty}`).toBe(true);
        }
        // The JSON cast in src/data/events erases CharacterId, so check it at runtime.
        if (c.cmd === 'add_member')
          expect(CHARACTER_IDS.includes(c.id), `${id} add_member ${c.id}`).toBe(true);
        if (c.cmd === 'choice') {
          expect(c.text.length, `${id} choice text`).toBeGreaterThan(0);
          expect(c.set, `${id} choice set ${c.set}`).toMatch(FLAG_KEY);
        }
        const npc = targetNpc(c);
        if (npc !== undefined) expect(npcIds.has(npc), `${id} ${c.cmd} ${npc}`).toBe(true);
        if (c.cmd === 'battle' && c.win_event !== undefined)
          expect(EVENTS[c.win_event], `${id} win_event`).toBeDefined();
        if (c.cmd === 'set_flag') expect(c.key, `${id} set_flag ${c.key}`).toMatch(FLAG_KEY);
      }
    }
  });

  it('are referenced by every trigger placed on a map', () => {
    for (const t of triggers)
      expect(EVENTS[t.eventId], `${t.mapId} trigger ${t.eventId}`).toBeDefined();
  });

  it('only address NPCs placed on the map the event plays on', () => {
    // WorldScene.spawnNpc/removeNpc ignore an unknown id and scriptedMove skips the actor,
    // so an event naming an NPC that lives on another map would silently drop those steps.
    const reached = walkTriggeredEvents((eventId, mapId, c) => {
      const npc = targetNpc(c);
      if (npc === undefined) return;
      expect(npcByMap.get(mapId)?.has(npc), `${eventId} ${c.cmd} ${npc} on ${mapId}`).toBe(true);
    });
    expect(reached.has('ev_opening')).toBe(true);
    // An event no trigger launches yet has no map; it may address any placed NPC.
    for (const [id, commands] of Object.entries(EVENTS)) {
      if (reached.has(id)) continue;
      for (const c of commands) {
        const npc = targetNpc(c);
        if (npc !== undefined) expect(npcIds.has(npc), `${id} ${c.cmd} ${npc}`).toBe(true);
      }
    }
  });

  it('opening plays grandpa walking down from the bookshelf and ends on the chapter title', () => {
    const opening = EVENTS['ev_opening'] ?? [];
    expect(opening[0]).toEqual({ cmd: 'play_bgm', key: 'none', fade_ms: 0 });
    expect(opening.at(-1)).toMatchObject({ cmd: 'show_chapter' });
    expect(opening.some((c) => c.cmd === 'say' && c.dialog === 'dlg_grandpa_01')).toBe(true);
  });

  it('opening never walks grandpa onto furniture or walls of his house', () => {
    // WorldScene.scriptedMove ignores collision, so a path that crosses a solid tile would
    // silently leave the NPC standing on a table; every step must land on a walkable tile.
    const house = compileMap(getMapSource('map_minato_luka_house'));
    const grid = CollisionGrid.fromMap(house);
    const grandpa = parseMapObjects(house).find(
      (o): o is NpcObject => o.kind === 'npc' && o.id === 'npc_grandpa',
    );
    if (!grandpa) throw new Error('npc_grandpa is not placed on map_minato_luka_house');
    let x = grandpa.tx;
    let y = grandpa.ty;
    let steps = 0;
    for (const c of EVENTS['ev_opening'] ?? []) {
      if (c.cmd !== 'move' || c.actor !== 'npc_grandpa') continue;
      for (const dir of c.path) {
        x += FACING_DELTA[dir].dx;
        y += FACING_DELTA[dir].dy;
        steps += 1;
        expect(grid.isBlocked(x, y), `npc_grandpa step ${dir} lands on (${x}, ${y})`).toBe(false);
      }
    }
    expect(steps).toBeGreaterThan(0);
  });
});
