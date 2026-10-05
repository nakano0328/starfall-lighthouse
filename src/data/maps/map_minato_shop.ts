import type { MapSource } from '@core/map/source';

import { INTERIOR_LEGEND } from './legends';

/** 道具屋 (12x10). shop_minato. */
export const map_minato_shop: MapSource = {
  meta: {
    id: 'map_minato_shop',
    displayName: '道具屋',
    kind: 'interior',
    bgmKey: 'bgm_village',
    battleBgKey: 'battle_bg_coast',
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
    'w.s.cccc.s.w',
    'w..........w',
    'w..........w',
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
      target_x: 26,
      target_y: 12,
      facing: 'down',
    },
    {
      type: 'npc',
      x: 5,
      y: 1,
      id: 'npc_minato_shopkeeper',
      dialog: 'dlg_minato_shopkeeper',
      facing: 'down',
      sprite: 'sprite_npc',
      shop: 'shop_minato',
    },
  ],
};
