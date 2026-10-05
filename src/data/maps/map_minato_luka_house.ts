import type { MapSource } from '@core/map/source';

import { INTERIOR_LEGEND } from './legends';

/** ルカの家 (12x10). Grandpa lives here; a new game starts at (7,7) and the opening plays here. */
export const map_minato_luka_house: MapSource = {
  meta: {
    id: 'map_minato_luka_house',
    displayName: 'ルカの家',
    kind: 'interior',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_coast',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 5, y: 8, facing: 'up' },
    canSaveAnywhere: true,
  },
  width: 12,
  height: 10,
  legend: INTERIOR_LEGEND,
  tiles: [
    'wwwwwwwwwwww',
    'w..........w',
    'w.b....ss..w',
    'w..........w',
    'w....tt....w',
    'w..........w',
    'w.l......l.w',
    'w..........w',
    'w..........w',
    'wwwwwDwwwwww',
  ],
  objects: [
    {
      type: 'warp',
      x: 5,
      y: 9,
      target_map: 'map_minato_village',
      target_x: 10,
      target_y: 7,
      facing: 'down',
    },
    {
      type: 'npc',
      x: 7,
      y: 3,
      id: 'npc_grandpa',
      dialog: 'dlg_grandpa_entry',
      facing: 'down',
      sprite: 'sprite_npc',
    },
    // New games start on this tile; the opening plays once (docs/GAME_DESIGN.md §10.3).
    { type: 'trigger', x: 7, y: 7, event_id: 'ev_opening', once: true },
  ],
};
