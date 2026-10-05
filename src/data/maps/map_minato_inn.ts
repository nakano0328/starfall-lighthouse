import type { MapSource } from '@core/map/source';

import { INTERIOR_LEGEND } from './legends';

/** 宿屋「なぎさ」 (14x10). 20G a night; sq_lost_necklace is picked up here later. */
export const map_minato_inn: MapSource = {
  meta: {
    id: 'map_minato_inn',
    displayName: '宿屋「なぎさ」',
    kind: 'interior',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_coast',
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
    'w.b..b..ccc..w',
    'w............w',
    'w.b..b.......w',
    'w............w',
    'w.l........l.w',
    'w............w',
    'w............w',
    'wwwwwwDwwwwwww',
  ],
  objects: [
    {
      type: 'warp',
      x: 6,
      y: 9,
      target_map: 'map_minato_village',
      target_x: 30,
      target_y: 7,
      facing: 'down',
    },
    {
      type: 'npc',
      x: 9,
      y: 1,
      id: 'npc_minato_innkeeper',
      dialog: 'dlg_minato_innkeeper',
      facing: 'down',
      sprite: 'sprite_npc',
      inn_price: 20,
    },
  ],
};
