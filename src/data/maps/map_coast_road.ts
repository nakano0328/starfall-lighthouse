import type { MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * 海岸街道 (40x25). First field map, east of ミナト村 (§3.1): a sandy road runs
 * west → east along y11-14 between a grassy strip under the cliffs (north) and the
 * sea (south). The west edge (x0, y12-13) warps back to the village's east gate.
 * The east exit to ささやきの森 is sealed with rocks and a sign until that map
 * exists (Phase 4 content); the tutorial sign near the entrance explains symbol
 * encounters (§5.12). Enemy symbols are kept 6+ tiles from the entrance so the
 * player is not ambushed on arrival.
 */
export const map_coast_road: MapSource = {
  meta: {
    id: 'map_coast_road',
    displayName: '海岸街道',
    kind: 'field',
    bgmKey: 'bgm_field',
    battleBgKey: 'bg_coast',
    encounterGroups: ['grp_coast_a', 'grp_coast_b'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 1, y: 12, facing: 'right' },
    canSaveAnywhere: false,
  },
  width: 40,
  height: 25,
  legend: OUTDOOR_LEGEND,
  tiles: [
    'cccccccccccccccccccccccccccccccccccccccc',
    'cccc..,..cccc....cccc...,..cccc..,..cccT',
    'T..,......T.......,.....T...........,..T',
    'T.....R.......T......,.......TTT.......T',
    'T...T........................T.T..R....T',
    'T.......,.........R............,.......T',
    'T..T...............T.........f.....,...T',
    'T.........,.......................T....T',
    'T....f.........R........,..............T',
    'T.........T...........,.........R......T',
    'T..,..............................,....T',
    'T.::::::::::::::::::::::::::::::::::::.T',
    '=======================================R',
    '=======================================R',
    'T.::::::::::::::::::::::::::::::::::::.T',
    'T..........,..............,............T',
    'T.....T.........R...........,......T...T',
    'T...,.......f.........T..........,.....T',
    'T::::::::::::::::::::::::::::::::::::::T',
    '~::::::::::::::::::::::::::::::::::::::~',
    '~~~~::::~~~~~~~~::::~~~~~~~~~~~::~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  objects: [
    // West exit → ミナト村 east gate (the gate tile x39 holds the return warp).
    {
      type: 'warp',
      x: 0,
      y: 12,
      h: 2,
      target_map: 'map_minato_village',
      target_x: 38,
      target_y: 14,
      facing: 'left',
    },
    // Signs
    { type: 'sign', x: 3, y: 11, text_id: 'dlg_sign_coast_tutorial' },
    { type: 'sign', x: 38, y: 12, text_id: 'dlg_sign_coast_east' },
    // Save point (星の祠) halfway along the road
    { type: 'save_point', x: 20, y: 11 },
    // Chest in the tree nook north of the road
    { type: 'chest', x: 30, y: 4, item_id: 'it_herb', qty: 2, flag: 'chest.coast_01' },
    // Enemy symbols (§5.12): wander radius 4, respawn 60 s
    { type: 'enemy', x: 10, y: 13, group_id: 'grp_coast_a', respawn_sec: 60, radius: 4 },
    { type: 'enemy', x: 17, y: 8, group_id: 'grp_coast_a', respawn_sec: 60, radius: 4 },
    { type: 'enemy', x: 26, y: 12, group_id: 'grp_coast_a', respawn_sec: 60, radius: 4 },
    {
      type: 'enemy',
      x: 33,
      y: 16,
      group_id: 'grp_coast_a,grp_coast_b',
      respawn_sec: 60,
      radius: 4,
    },
  ],
};
