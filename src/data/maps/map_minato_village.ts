import type { MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * ミナト村 (40x30). Start of the game; Luka's house NW, inn N, shop E of the
 * main road. Exits: north (x19-20) → 灯台への道, east (y14) → 海岸街道.
 * The east warp at (39,14) leads to map_coast_road; the north warp on (19-20, 0) leads
 * to map_lighthouse_path, with the `ev_mio_join` trigger on the row below it (§10.3):
 * npc_mio waits at (24,1), walks left x3 to (21,1) and the player on x19-20 faces right.
 * The east road narrows to a one-tile gate (fences at x37-38 on y13 and y15) so that
 * npc_minato_guard at (37,14) blocks it until `minato.talked_to_grandpa` (§3.1).
 */
export const map_minato_village: MapSource = {
  meta: {
    id: 'map_minato_village',
    displayName: 'ミナト村',
    kind: 'town',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_coast',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 10, y: 12, facing: 'down' },
    canSaveAnywhere: true,
  },
  width: 40,
  height: 30,
  legend: OUTDOOR_LEGEND,
  tiles: [
    'TTTTTTTTTTTTTTTTTTT==TTTTTTTTTTTTTTTTTTT',
    'T.................,==,.................T',
    'T..,...............==...............,..T',
    'T.......rrrrrr.....==......bbbbbbbb....T',
    'T.......rrrrrr.....==......bbbbbbbb....T',
    'T..f....wwwwww.....==......wwwwwwww..f.T',
    'T.......wwDwww.....==......wwwDwwww....T',
    'T.........=........==.........=........T',
    'T.f.......=........==...rrrrrr=........T',
    'T.........=........==...rrrrrr=....,...T',
    'T.........=...T....==...wwwwww=........T',
    'T...,.....=........==...wwDwww=...T....T',
    'T.........=........==.....=...=........T',
    'T.........=..T.....==.....=...=......FFT',
    'T..:====================================',
    'T..:=================================FFT',
    '~~~:..............==...............,...T',
    '~~~:......T.......==....R..............T',
    '~~~:..............==..........T........T',
    '~~~:.....f........==...................T',
    '~~~:..............==.......,...........T',
    '~~~:....T.........==..............T....T',
    '~~~:..............==...R...............T',
    '~~~:..............==...................T',
    '~~~:...,..........==.........f.........T',
    '~~~:......pp......==...................T',
    '~~~~::::::pp::::::==:::::::::::::::::::T',
    '~~~~~~~~~~pp~~~~~~::~~~~~~~~~~~~~~~~~~~T',
    '~~~~~~~~~~pp~~~~~~~~~~~~~~~~~~~~~~~~~~WT',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  objects: [
    // Doors
    {
      type: 'warp',
      x: 10,
      y: 6,
      target_map: 'map_minato_luka_house',
      target_x: 5,
      target_y: 8,
      facing: 'up',
    },
    {
      type: 'warp',
      x: 30,
      y: 6,
      target_map: 'map_minato_inn',
      target_x: 6,
      target_y: 8,
      facing: 'up',
    },
    {
      type: 'warp',
      x: 26,
      y: 11,
      target_map: 'map_minato_shop',
      target_x: 5,
      target_y: 8,
      facing: 'up',
    },
    // East exit → 海岸街道 (its west edge warps back to (38,14)).
    {
      type: 'warp',
      x: 39,
      y: 14,
      target_map: 'map_coast_road',
      target_x: 1,
      target_y: 12,
      facing: 'right',
    },
    // North exit → 灯台への道 (its south edge warps back to (19,1)).
    {
      type: 'warp',
      x: 19,
      y: 0,
      w: 2,
      target_map: 'map_lighthouse_path',
      target_x: 15,
      target_y: 18,
      facing: 'up',
    },
    // ミオ joins on the way north (§10.3 ev_mio_join); once per game, after the intro.
    {
      type: 'trigger',
      x: 19,
      y: 1,
      w: 2,
      event_id: 'ev_mio_join',
      once: true,
      condition: 'minato.intro_done',
    },
    // Villagers
    {
      type: 'npc',
      x: 37,
      y: 14,
      id: 'npc_minato_guard',
      dialog: 'dlg_minato_guard',
      facing: 'left',
      sprite: 'sprite_npc',
      hidden_if: 'minato.talked_to_grandpa',
    },
    // Mio starts 4 tiles right of the trigger so her left x3 walk ends next to the player.
    {
      type: 'npc',
      x: 24,
      y: 1,
      id: 'npc_mio',
      dialog: 'dlg_mio_idle',
      facing: 'left',
      sprite: 'sprite_npc',
      hidden_if: 'minato.mio_joined',
    },
    {
      type: 'npc',
      x: 4,
      y: 8,
      id: 'npc_minato_boy',
      dialog: 'dlg_minato_boy',
      facing: 'down',
      sprite: 'sprite_npc',
    },
    {
      type: 'npc',
      x: 11,
      y: 24,
      id: 'npc_minato_fisher',
      dialog: 'dlg_minato_fisher',
      facing: 'down',
      sprite: 'sprite_npc',
    },
    {
      type: 'npc',
      x: 34,
      y: 20,
      id: 'npc_minato_granny',
      dialog: 'dlg_minato_granny',
      facing: 'left',
      sprite: 'sprite_npc',
    },
    // Signs and chests
    { type: 'sign', x: 21, y: 13, text_id: 'dlg_sign_minato' },
    { type: 'chest', x: 36, y: 2, item_id: 'it_herb', qty: 2, flag: 'chest.minato_01' },
  ],
};
