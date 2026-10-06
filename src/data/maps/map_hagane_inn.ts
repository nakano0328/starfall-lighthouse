import type { MapSource } from '@core/map/source';

import { INTERIOR_LEGEND } from './legends';

/** 宿屋「つるはし」 (14x10). 40G a night (docs/GAME_DESIGN.md §7.6). */
export const map_hagane_inn: MapSource = {
  meta: {
    id: 'map_hagane_inn',
    displayName: '宿屋「つるはし」',
    kind: 'interior',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_mine',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 6, y: 8, facing: 'up' },
    canSaveAnywhere: true,
  },
  width: 14,
  height: 10,
  legend: INTERIOR_LEGEND,
  tiles: [
    'wwwwwwwwwwwwww',
    'w............w',
    'w.b..b..ccc.sw',
    'w............w',
    'w.b..b....t..w',
    'w............w',
    'w.l........l.w',
    'w............w',
    'w............w',
    'wwwwwwDwwwwwww',
  ],
  objects: [
    // Door → the tile in front of the inn door in town.
    {
      type: 'warp',
      x: 6,
      y: 9,
      target_map: 'map_hagane_town',
      target_x: 6,
      target_y: 13,
      facing: 'down',
    },
    // Behind the counter (8-10, 2); spoken to from either end of it.
    {
      type: 'npc',
      x: 9,
      y: 1,
      id: 'npc_hagane_innkeeper',
      dialog: 'dlg_hagane_innkeeper',
      facing: 'down',
      sprite: 'sprite_npc',
      inn_price: 40,
    },
  ],
};
