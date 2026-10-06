import type { MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * 灯台への道 (30x20). The climb from ミナト村's north exit to the lighthouse (§3.1):
 * a path zigzags up from the south edge (x14-15, y19 warps back to the village)
 * to the lighthouse door at the top centre (15,1), with the sea and cliffs on the
 * east and trees on the west. The tile in front of the door (15,2) holds the
 * prologue trigger `ev_core_shatter` (§10.3); the door itself needs
 * `it_key_lighthouse` (§13 #15). Enemy symbols spawn only after the core has
 * shattered (`main.core_shattered`, §3.1) and are kept 6+ tiles from the entrance.
 */
export const map_lighthouse_path: MapSource = {
  meta: {
    id: 'map_lighthouse_path',
    displayName: '灯台への道',
    kind: 'field',
    bgmKey: 'bgm_field',
    battleBgKey: 'bg_coast',
    encounterGroups: ['grp_coast_a'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 15, y: 18, facing: 'up' },
    canSaveAnywhere: false,
  },
  width: 30,
  height: 20,
  legend: OUTDOOR_LEGEND,
  tiles: [
    'TTTTTTTTTTTwwwwwwwwwTTTTTTcc~W',
    'TT.......,.wwwwDwwww...,..cc~W',
    'T..,...........=.......,..cc~W',
    'T.R............=........R.cc~W',
    'T..............=======...,cc~W',
    'T.TTTTT........,.....=...ccc~W',
    'T.TTTTT..f...........=..R.cc~W',
    'T..TTT...............=...,cc~W',
    'T....,.......R.......=....cc~W',
    'T.......==============....cc~W',
    'T..f....=.....TT.......R.ccc~W',
    'T.......=....TTTT.........cc~W',
    'T..,....=.....TT....,....Rcc~W',
    'T.......=..............R..cc~W',
    'T.f.....========.........,cc~W',
    'T..T..........==......T...cc~W',
    'TT.....R......==..........cc~W',
    'TTT..,........==.....,..TTcc~W',
    'TTTT..........==........TTTc~W',
    'TTTTTTTTTTTTTT==TTTTTTTTTTTc~W',
  ],
  objects: [
    // South exit → ミナト村 north gate (the village warp on (19-20, 0) leads back here).
    {
      type: 'warp',
      x: 14,
      y: 19,
      w: 2,
      target_map: 'map_minato_village',
      target_x: 19,
      target_y: 1,
      facing: 'down',
    },
    // Lighthouse door (§13 #15: opened with it_key_lighthouse in chapter 4) → 灯台の塔 1F:
    // lands on the tile above 1F's south door (12, 23), which leads back to (15, 2) here.
    {
      type: 'warp',
      x: 15,
      y: 1,
      target_map: 'map_lighthouse_1f',
      target_x: 12,
      target_y: 22,
      facing: 'up',
      required_item: 'it_key_lighthouse',
      locked_text_id: 'dlg_lighthouse_door_locked',
      door_flag: 'door.lighthouse_01',
    },
    // Prologue: the core shatters when Luka and Mio reach the door (§10.3).
    {
      type: 'trigger',
      x: 15,
      y: 2,
      event_id: 'ev_core_shatter',
      once: true,
      condition: 'minato.mio_joined',
    },
    // Signpost beside the entrance
    { type: 'sign', x: 17, y: 18, text_id: 'dlg_sign_lighthouse_path' },
    // Chest in the tree nook on the west side
    { type: 'chest', x: 1, y: 6, item_id: 'it_herb', qty: 2, flag: 'chest.path_01' },
    // Enemy symbols (§5.12), present only after the core has shattered (§3.1)
    {
      type: 'enemy',
      x: 18,
      y: 12,
      group_id: 'grp_coast_a',
      respawn_sec: 60,
      radius: 4,
      condition: 'main.core_shattered',
    },
    {
      type: 'enemy',
      x: 5,
      y: 11,
      group_id: 'grp_coast_a',
      respawn_sec: 60,
      radius: 4,
      condition: 'main.core_shattered',
    },
    {
      type: 'enemy',
      x: 19,
      y: 7,
      group_id: 'grp_coast_a',
      respawn_sec: 60,
      radius: 4,
      condition: 'main.core_shattered',
    },
  ],
};
