import { describe, expect, it } from 'vitest';

import { compileMap } from '@core/map/compile';
import { parseMapObjects } from '@core/map/objects';
import { DIALOGS } from '@data/dialogs';
import { EVENTS } from '@data/events';
import { findItem } from '@data/items';
import { MAP_IDS, MAP_SOURCES, getMapSource } from '@data/maps';

const npcIds = new Set<string>();
for (const id of MAP_IDS) {
  for (const o of parseMapObjects(compileMap(getMapSource(id))))
    if (o.kind === 'npc') npcIds.add(o.id);
}

describe('authored events', () => {
  it('use ev_ ids and reference existing dialogs, maps, items and actors', () => {
    expect(Object.keys(EVENTS).length).toBeGreaterThanOrEqual(1);
    for (const [id, commands] of Object.entries(EVENTS)) {
      expect(id).toMatch(/^ev_[a-z0-9_]+$/);
      expect(commands.length).toBeGreaterThan(0);
      for (const c of commands) {
        if (c.cmd === 'say') expect(DIALOGS[c.dialog], `${id} say ${c.dialog}`).toBeDefined();
        if (c.cmd === 'warp') expect(MAP_SOURCES[c.map], `${id} warp ${c.map}`).toBeDefined();
        if (c.cmd === 'give_item' || c.cmd === 'take_item')
          expect(findItem(c.item), `${id} item ${c.item}`).toBeDefined();
        if (c.cmd === 'move' || c.cmd === 'face') {
          expect(c.actor === 'player' || npcIds.has(c.actor), `${id} actor ${c.actor}`).toBe(true);
        }
        if (c.cmd === 'battle' && c.win_event !== undefined)
          expect(EVENTS[c.win_event], `${id} win_event`).toBeDefined();
        if (c.cmd === 'set_flag') expect(c.key).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
      }
    }
  });

  it('are referenced by every trigger placed on a map', () => {
    for (const id of MAP_IDS) {
      for (const o of parseMapObjects(compileMap(getMapSource(id)))) {
        if (o.kind === 'trigger')
          expect(EVENTS[o.eventId], `${id} trigger ${o.eventId}`).toBeDefined();
      }
    }
  });

  it('opening plays grandpa walking down from the bookshelf and ends on the chapter title', () => {
    const opening = EVENTS['ev_opening'] ?? [];
    expect(opening[0]).toEqual({ cmd: 'play_bgm', key: 'none', fade_ms: 0 });
    expect(opening.at(-1)).toMatchObject({ cmd: 'show_chapter' });
    expect(opening.some((c) => c.cmd === 'say' && c.dialog === 'dlg_grandpa_01')).toBe(true);
  });
});
