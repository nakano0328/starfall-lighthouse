import type { MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * 山道 (40x20). Chapter 2 field map between ささやきの森 and 鉱山町ハガネ (§3.1): a
 * single road with height changes. Two cliff bands cut the slope into three terraces
 * and the road switchbacks up them from the south-west corner to the east edge:
 *
 * - Bottom terrace (y14-18), a few trees: the west edge (x0, y17-18) warps back to the
 *   forest's north-east trail; the road runs east along y17 to the first ramp
 *   (x34-35, y12-13).
 * - Middle terrace (y8-11): the road runs back west along y10, past the sign with the
 *   rumour about the abandoned mine, to the second ramp (x3-4, y6-7).
 * - Top terrace (y1-5), bare rock: the save point sits in a nook of the top cliff at
 *   (6,1), two thirds of the way up, and the road runs east along y4 to the exit
 *   (x39, y4-5) → ハガネ's west gate.
 *
 * The chests sit in notches of the cliff bands. Enemy symbols (§5.12): wolves
 * (grp_forest_b) on the low terrace, mine creatures (grp_mine_a) on the high one and a
 * mixed symbol in between, all 6+ tiles from the entrance.
 */
export const map_mountain_road: MapSource = {
  meta: {
    id: 'map_mountain_road',
    displayName: '山道',
    kind: 'field',
    bgmKey: 'bgm_field',
    battleBgKey: 'bg_mine',
    encounterGroups: ['grp_forest_b', 'grp_mine_a'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 1, y: 17, facing: 'right' },
    canSaveAnywhere: false,
  },
  width: 40,
  height: 20,
  legend: OUTDOOR_LEGEND,
  tiles: [
    'cccccccccccccccccccccccccccccccccccccccc',
    'cc..Rc.c....R.........R.........R......c',
    'c..........R.......................R...c',
    'c......................R...............c',
    'c...====================================',
    'cc..=..R..........R...........R........=',
    'ccc==ccccccccccccccccccccccccccccccccccc',
    'ccc==cccccccc..cccccccccccc.cccccccccccc',
    'cc..=.........R.............R..........c',
    'c...=.......T.............R....T.......c',
    'c...================================...c',
    'cc.....,......R.......,...........==...c',
    'cccccccccccccccccccccccccccccccccc==cccc',
    'cccccccc.ccccccccccccc..cccccccccc==cccc',
    'cT.........T........,.....T.......==..Tc',
    'T....,........f.........,.........==...T',
    'T.........R..........T............==.R.T',
    '====================================...T',
    '=....T.......,.......T........,.....T..T',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  objects: [
    // West exit → ささやきの森: the trail tile in front of its north-east exit (49,6).
    // npc_forest_vine stands on that tile until fragments.count>=1, i.e. until this road
    // can be entered at all (§13 #7), so the landing is clear whenever the player returns.
    {
      type: 'warp',
      x: 0,
      y: 17,
      h: 2,
      target_map: 'map_whisper_forest',
      target_x: 48,
      target_y: 6,
      facing: 'left',
    },
    // East exit → 鉱山町ハガネ west gate. Assumes the town keeps (1,14) walkable and puts
    // its gate warp back here on (0, 14-15), landing on (38,4) in front of this warp.
    {
      type: 'warp',
      x: 39,
      y: 4,
      h: 2,
      target_map: 'map_hagane_town',
      target_x: 1,
      target_y: 14,
      facing: 'right',
    },
    // Signs: one by the entrance, one halfway up (the rumour about the abandoned mine).
    { type: 'sign', x: 3, y: 16, text_id: 'dlg_sign_mountain_entrance' },
    { type: 'sign', x: 18, y: 9, text_id: 'dlg_sign_mountain_mine' },
    // Save point in a nook of the top cliff, just above the second ramp.
    { type: 'save_point', x: 6, y: 1 },
    // Chests in notches of the cliff bands (§7.1)
    { type: 'chest', x: 8, y: 13, item_id: 'it_potion_s', qty: 2, flag: 'chest.mountain_01' },
    { type: 'chest', x: 27, y: 7, item_id: 'it_antidote', qty: 2, flag: 'chest.mountain_02' },
    // Enemy symbols (§5.12): wander radius 3, respawn 60 s.
    { type: 'enemy', x: 15, y: 16, group_id: 'grp_forest_b', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 28, y: 15, group_id: 'grp_forest_b', respawn_sec: 60, radius: 3 },
    {
      type: 'enemy',
      x: 20,
      y: 9,
      group_id: 'grp_forest_b,grp_mine_a',
      respawn_sec: 60,
      radius: 3,
    },
    { type: 'enemy', x: 12, y: 3, group_id: 'grp_mine_a', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 25, y: 3, group_id: 'grp_mine_a', respawn_sec: 60, radius: 3 },
  ],
};
