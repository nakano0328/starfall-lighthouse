import type { MapSource } from '@core/map/source';

import { INTERIOR_LEGEND } from './legends';

/**
 * ハガネのかじや (14x10). Two counters (docs/GAME_DESIGN.md §7.5): the smith on the left
 * sells arms (`shop_hagane_arms`) and gives sq_shining_ore (§14), the clerk on the right
 * sells items (`shop_hagane_items`).
 */
export const map_hagane_shop: MapSource = {
  meta: {
    id: 'map_hagane_shop',
    displayName: 'ハガネのかじや',
    kind: 'interior',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_mine',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 7, y: 8, facing: 'up' },
    canSaveAnywhere: true,
  },
  width: 14,
  height: 10,
  legend: INTERIOR_LEGEND,
  tiles: [
    'wwwwwwwwwwwwww',
    'w............w',
    'w.ccc.ss.ccc.w',
    'w............w',
    'w............w',
    'w............w',
    'w.l........l.w',
    'w............w',
    'w............w',
    'wwwwwwwDwwwwww',
  ],
  objects: [
    // Door → the tile in front of the smithy door in town.
    {
      type: 'warp',
      x: 7,
      y: 9,
      target_map: 'map_hagane_town',
      target_x: 23,
      target_y: 13,
      facing: 'down',
    },
    // Left counter (2-4, 2): the smith. Head markers follow sq_shining_ore (§14):
    // nothing once rewarded, 「？」 while the three ores are in hand, 「！」 while the
    // quest runs or can be taken (after Goro joins).
    {
      type: 'npc',
      x: 3,
      y: 1,
      id: 'npc_hagane_smith',
      dialog: 'dlg_hagane_smith',
      facing: 'down',
      sprite: 'sprite_npc',
      shop: 'shop_hagane_arms',
      markers: [
        { if: 'sq.ore==2', text: '' },
        { if: 'item.it_shining_ore>=3', text: '？' },
        { if: 'sq.ore==1', text: '！' },
        { if: 'hagane.goro_joined', text: '！' },
      ],
    },
    // Right counter (9-11, 2): the clerk.
    {
      type: 'npc',
      x: 10,
      y: 1,
      id: 'npc_hagane_clerk',
      dialog: 'dlg_hagane_clerk',
      facing: 'down',
      sprite: 'sprite_npc',
      shop: 'shop_hagane_items',
    },
  ],
};
