import type { Legend, MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * Legend for the shrine: the outdoor set (trees and grass creeping in) plus the stone
 * interior. `t` is a tree root breaking through the stone floor and blocks like a trunk.
 */
const SHRINE_LEGEND: Legend = {
  ...OUTDOOR_LEGEND,
  _: 'floor_stone',
  '*': 'rune_floor',
  l: 'lantern',
  t: { ground: 'floor_stone', deco: 'tree_trunk', above: 'tree_top' },
};

/**
 * 森の祠 (30x30). Chapter 1 dungeon north of ささやきの森 (§3.1): an overgrown stone
 * shrine whose only door is on the south wall (x15, y29), reached from the forest's
 * north clearing. The entrance hall (y24-28) opens three ways:
 *
 * - straight north through the central chamber (y15-19, two symbols),
 * - west along y25 and up the x4 root corridor through the west chamber (y13-18,
 *   one symbol, `chest.shrine_02`),
 * - east along y25 and up the x25 corridor through the east chamber (y13-18, one
 *   symbol, `chest.shrine_03`).
 *
 * All three meet in the antechamber (y8-11) with the boss-side save point and
 * `chest.shrine_01`, so a player can route around some symbols. The boss chamber
 * (y2-6) lies beyond the lantern-flanked doorway at (15, 7): the `trigger` on the
 * doorway plays `ev_forest_boss_intro` before contact (§5.12) and 古木のウロ
 * (`grp_boss_tree`) waits three tiles further north on the rune circle, never
 * respawning once `forest.boss_defeated` is set (§8.4, §13 #7). The locked shrine
 * door (`it_key_shrine`) belongs to the forest side of the warp.
 */
export const map_forest_shrine: MapSource = {
  meta: {
    id: 'map_forest_shrine',
    displayName: '森の祠',
    kind: 'dungeon',
    bgmKey: 'bgm_forest',
    battleBgKey: 'bg_forest',
    encounterGroups: ['grp_forest_c', 'grp_forest_d'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 15, y: 28, facing: 'up' },
    canSaveAnywhere: false,
  },
  width: 30,
  height: 30,
  legend: SHRINE_LEGEND,
  tiles: [
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wTTTTTTTwwwwwwwwwwwwwwTTTTTTTw',
    'wTTTTTTTw____________wTTTTTTTw',
    'wTTTTTTTw____*___*___wTTTTTTTw',
    'wTTTTTTTw___*__*__*__wTTTTTTTw',
    'wTTTTTTTw____*___*___wTTTTTTTw',
    'wTTTTTTTw,__________,wTTTTTTTw',
    'wTTTTTTTwwwwwwl_lwwwwwTTTTTTTw',
    'wTTTTTTTTTwl_______lwTTTTTTTTw',
    'wTTTTTTTTTw_,_____,_wTTTTTTTTw',
    'wTTT______________________TTTw',
    'wTTT_TTTTTw_________wTTTT_TTTw',
    'wwww_wwwwTwwwww_wwwwwwwww_wwww',
    'ww______wTTTTTw_wTTTTw______ww',
    'ww______wTwwwww_wwwwww______ww',
    'ww______wTw_________ww______ww',
    'ww______wTw_t_____t_ww______ww',
    'ww______wTw__,___,__ww______ww',
    'ww______wTw_t_____t_ww______ww',
    'wwww_wwwwTw_________wwwww_wwww',
    'wTTT_TTTTTwwwww_wwwwwTTTT_TTTw',
    'wTTT_TTTTTTTTTw_wTTTTTTTT_TTTw',
    'wTTT_TTTTTTTTTw_wTTTTTTTT_TTTw',
    'wTTT_TTTTTTwwww_wwwwTTTTT_TTTw',
    'wTTT_TTTTTTw_______wTTTTT_TTTw',
    'wTTT______________________TTTw',
    'wTTTTTTTTTTw_______wTTTTTTTTTw',
    'wTTTTTTTTTTw_______wTTTTTTTTTw',
    'wTTTTTTTTTTw_______wTTTTTTTTTw',
    'wwwwwwwwwwwwwwwDwwwwwwwwwwwwww',
  ],
  objects: [
    // South door → ささやきの森 north clearing. The forest's shrine door warp sits at
    // (25, 2) and lands here at the entrance, so arriving players face away from it.
    {
      type: 'warp',
      x: 15,
      y: 29,
      target_map: 'map_whisper_forest',
      target_x: 25,
      target_y: 3,
      facing: 'down',
    },
    // Entrance sign
    { type: 'sign', x: 17, y: 28, text_id: 'dlg_sign_shrine_entrance' },
    // Antechamber: boss-side save point (§3.1) and the potion chest
    { type: 'save_point', x: 12, y: 8 },
    { type: 'chest', x: 18, y: 8, item_id: 'it_potion_s', qty: 2, flag: 'chest.shrine_01' },
    // Side chambers
    { type: 'chest', x: 2, y: 13, item_id: 'eq_acc_star_charm', qty: 1, flag: 'chest.shrine_02' },
    { type: 'chest', x: 27, y: 18, item_id: 'gold', qty: 200, flag: 'chest.shrine_03' },
    // Boss doorway: intro talk before contact (§5.12), skipped once the boss is down
    {
      type: 'trigger',
      x: 15,
      y: 7,
      event_id: 'ev_forest_boss_intro',
      once: true,
      condition: '!forest.boss_defeated',
    },
    // 古木のウロ on the rune circle, three tiles past the doorway (§8.4)
    {
      type: 'enemy',
      x: 15,
      y: 4,
      group_id: 'grp_boss_tree',
      respawn_sec: -1,
      radius: 0,
      defeated_flag: 'forest.boss_defeated',
    },
    // Normal symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the entrance
    { type: 'enemy', x: 13, y: 17, group_id: 'grp_forest_c', respawn_sec: 60, radius: 3 },
    {
      type: 'enemy',
      x: 17,
      y: 17,
      group_id: 'grp_forest_c,grp_forest_d',
      respawn_sec: 60,
      radius: 3,
    },
    { type: 'enemy', x: 4, y: 15, group_id: 'grp_forest_c', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 25, y: 16, group_id: 'grp_forest_d', respawn_sec: 60, radius: 3 },
  ],
};
