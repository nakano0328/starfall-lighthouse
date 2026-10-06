import type { MapSource } from '@core/map/source';

import { INTERIOR_LEGEND } from './legends';

/**
 * ゴローの家 (12x10). Goro sits at the table until he joins; stepping onto the tile in
 * front of him runs ev_goro_join (docs/GAME_DESIGN.md §13 #9).
 */
export const map_hagane_goro_house: MapSource = {
  meta: {
    id: 'map_hagane_goro_house',
    displayName: 'ゴローの家',
    kind: 'interior',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_mine',
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
    'w.b.....ss.w',
    'w..........w',
    'w....tt....w',
    'w..........w',
    'w.l......l.w',
    'w..........w',
    'w..........w',
    'wwwwwDwwwwww',
  ],
  objects: [
    // Door → the tile in front of Goro's door in town.
    {
      type: 'warp',
      x: 5,
      y: 9,
      target_map: 'map_hagane_town',
      target_x: 12,
      target_y: 7,
      facing: 'down',
    },
    // At the table (5-6, 4), facing the door; gone once he is in the party.
    {
      type: 'npc',
      x: 5,
      y: 5,
      id: 'npc_goro',
      dialog: 'dlg_goro_home',
      facing: 'down',
      sprite: 'sprite_npc',
      hidden_if: 'hagane.goro_joined',
    },
    // The tile in front of Goro, two steps in from the door.
    {
      type: 'trigger',
      x: 5,
      y: 6,
      event_id: 'ev_goro_join',
      once: true,
      condition: '!hagane.goro_joined',
    },
    { type: 'chest', x: 10, y: 1, item_id: 'it_herb', qty: 2, flag: 'chest.goro_01' },
  ],
};
