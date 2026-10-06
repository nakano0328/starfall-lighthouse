import type { MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * 磯の道 (40x20). Chapter 3 field map between 鉱山町ハガネ's south gate and 学者のキャンプ
 * (§3.1): a rocky coast road that winds down three shelves of the shore, the open sea
 * (deep_water, x35+) along the whole east edge with a strip of shallows (x33-34) and
 * sand in front of it, and tide pools (water, impassable) dotted over the sand.
 *
 * Two cliff bands (rows 6 and 12) run from the west wall into the sea and cut the shore
 * into three shelves; the road switchbacks down them:
 *
 * - Upper shelf (y1-5): the gate road (x19-20) comes in from the north edge, turns west
 *   along y3-4 past the entrance sign at (21,2) and drops through the first gap
 *   (x5-6, y6). The chest sits out on the beach at (31,2), between two tide pools.
 * - Middle shelf (y7-11): the road runs back east along y9-10 to the second gap
 *   (x29-30, y12). The save point sits in a rock nook under the upper cliff at (17,7),
 *   halfway along.
 * - Lower shelf (y13-18): the road runs west along y15-16 and turns south at x20-21 to
 *   the one-tile exit (20,19) → the camp.
 *
 * Enemy symbols (§5.12): one per shelf plus one on the middle shelf's east end, all
 * drawing from both §3.1 groups (crabs and mine creatures), 6+ tiles from the entrance.
 */
export const map_shore_path: MapSource = {
  meta: {
    id: 'map_shore_path',
    displayName: '磯の道',
    kind: 'field',
    bgmKey: 'bgm_field',
    battleBgKey: 'bg_coast',
    encounterGroups: ['grp_ruins_a', 'grp_mine_a'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 19, y: 1, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 40,
  height: 20,
  legend: OUTDOOR_LEGEND,
  tiles: [
    'ccccccccccccccccccc==cccccccccccc~~WWWWW',
    'cc...R.....,.......==.....,R.::~:~~WWWWW',
    'cc..,.......R......==.........:::~~WWWWW',
    'c.T..================..f.....:::::~WWWWW',
    'c..,.================.......,.:~:~~WWWWW',
    'cc...==...R.......T....R.....::::~~WWWWW',
    'ccccc==cccccccccccccccccccccccccc~~WWWWW',
    'c..,.==..T......R.R.....,....::::~~WWWWW',
    'c....==....R..............T..:~::~~WWWWW',
    'c.R..==========================:::~WWWWW',
    'c....==========================::~~WWWWW',
    'cc,....T......R........f.....==::~~WWWWW',
    'ccccccccccccccccccccccccccccc==cc~~WWWWW',
    'cT.......R.........,.......T.==::~~WWWWW',
    'c.....,.........R............==:~~~WWWWW',
    'c..T......,........R===========::~~WWWWW',
    'c.R.........T.......===========:::~WWWWW',
    'cc.....,....R.......==...,..R..::~~WWWWW',
    'ccT.......,......T..==..T......::~~WWWWW',
    'cccccccccccccccccccc=cccccccccccc~~WWWWW',
  ],
  objects: [
    // North edge → 鉱山町ハガネ south gate. Covers both tiles of the gate road and lands
    // on (18,26), the tile in front of the town's gate warp (18,27), facing up the south
    // street; the gate warps back onto this map's entrance (19,1).
    {
      type: 'warp',
      x: 19,
      y: 0,
      w: 2,
      target_map: 'map_hagane_town',
      target_x: 18,
      target_y: 26,
      facing: 'up',
    },
    // South edge → 学者のキャンプ. Lands on the camp's entrance (10,1), in front of its
    // north warp (10,0), which returns to (20,18) right above this tile.
    {
      type: 'warp',
      x: 20,
      y: 19,
      target_map: 'map_ruins_camp',
      target_x: 10,
      target_y: 1,
      facing: 'down',
    },
    // Sign beside the gate road, a few steps from the entrance.
    { type: 'sign', x: 21, y: 2, text_id: 'dlg_sign_shore' },
    // Save point in a rock nook under the upper cliff band, halfway along the road.
    { type: 'save_point', x: 17, y: 7 },
    // Chest on the upper beach between two tide pools, off the road (§7.1).
    { type: 'chest', x: 31, y: 2, item_id: 'it_tide_shell', qty: 2, flag: 'chest.shore_01' },
    // Enemy symbols (§5.12): wander radius 3, default respawn (60 s).
    { type: 'enemy', x: 10, y: 4, group_id: 'grp_ruins_a,grp_mine_a', radius: 3 },
    { type: 'enemy', x: 14, y: 10, group_id: 'grp_ruins_a,grp_mine_a', radius: 3 },
    { type: 'enemy', x: 25, y: 9, group_id: 'grp_ruins_a,grp_mine_a', radius: 3 },
    { type: 'enemy', x: 25, y: 15, group_id: 'grp_ruins_a,grp_mine_a', radius: 3 },
  ],
};
