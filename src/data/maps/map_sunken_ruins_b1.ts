import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the lower ruins: stone floor and wall mass, sea water (`W`, always solid) in
 * the pools, sand (`:`) on the floor of the tide channel, plank walkways over sand (`p`),
 * broken pillars (`R`), lanterns, the rune circle the guardian waits on and the ladders
 * up (`^`, stairs tiles). `S` is a 潮の石碑 (solid; the examine-triggers sit on it) and
 * `~` is water that exists only at high tide, so it is used in the `tide.high` grid alone.
 */
const RUINS_B1_LEGEND: Legend = {
  _: 'floor_stone',
  w: 'wall',
  ':': 'sand',
  W: 'deep_water',
  R: { ground: 'floor_stone', deco: 'rock' },
  l: 'lantern',
  '*': 'rune_floor',
  '^': 'stairs',
  p: { ground: 'sand', deco: 'pier' },
  S: { ground: 'floor_stone', deco: 'stele' },
  '~': { deco: 'water' },
};

/**
 * 沈んだ遺跡 下層 (45x35). The bottom of the ruins (§3.1): two ladders come down from
 * 上層 (§3.2 tide gimmick, `ruins.tide`; unset means high tide).
 *
 * - Entrance hall (x1-7, y1-6): ladder #1 at (3, 2) lands on (3, 3). The sign stands at
 *   (5, 2) and stele C (`S` at (6, 5)) carries the two stacked examine-triggers: it only
 *   answers "the letters cannot be read" until `ruins.tide_learned`, then toggles the tide.
 * - Pillar hall (x13-31, y1-10) through the corridor at y3-4: a sea pool, broken pillars,
 *   two symbols and `chest.ruins_b1_01` in the north-east corner. Its south exit
 *   (x21-22, y11-13) drops into the gallery (x14-30, y14-23): a pool, a plank walkway over
 *   sand along y21 and one more symbol. The gallery's west door (y20-21) leads to the
 *   antechamber (x2-10, y18-23) with the boss-side save point and `chest.ruins_b1_02`.
 *   All of this is dry at every tide.
 * - Tide channel (sand): from the pillar hall's east wall (x32-41, y8-10) south along
 *   x39-41 through a basin (x36-41, y14-19) to the chest room. At high tide every sand cell
 *   of the channel is water (`tide.high`), so the chest room can then only be reached by
 *   ladder #2; at low tide it is dry and one symbol (`tide: 'low'`) walks it.
 * - Chest room (x35-43, y26-33): ladder #2 at (42, 30) lands on (42, 31); the low-tide
 *   chests `chest.ruins_b1_03` (うしおのきば) and `chest.ruins_b1_04` (ふるい海図, §14
 *   `sq_old_chart`) stand by its west wall.
 * - Boss chamber (x1-12, y25-32) behind the lantern-flanked doorway at (6, 24): the doorway
 *   stacks `ev_ruins_boss_intro` (fires on the way in, §5.12) and `ev_nox_appear` (fires on
 *   the way out once `ruins.boss_defeated`, §13 #14). 遺跡の番人 (`grp_boss_guardian`) waits
 *   three tiles past the doorway on the rune circle and never respawns; `npc_nox` stands at
 *   (8, 26), off the approach line, hidden until `ruins.nox_on_stage`.
 */
export const map_sunken_ruins_b1: MapSource = {
  meta: {
    id: 'map_sunken_ruins_b1',
    displayName: '沈んだ遺跡 下層',
    kind: 'dungeon',
    bgmKey: 'bgm_ruins',
    battleBgKey: 'bg_ruins',
    encounterGroups: ['grp_ruins_b', 'grp_ruins_c', 'grp_ruins_d'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 3, y: 3, facing: 'down' },
    canSaveAnywhere: false,
    tideAware: true,
  },
  width: 45,
  height: 35,
  legend: RUINS_B1_LEGEND,
  tiles: [
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wl_____lwwwwwl__________________wwwwwwwwwwWWw',
    'w__^____wwwww_____________R_____wwwwwwwwwwWWw',
    'w_______________________________wwwwwwwwwwWWw',
    'w_______________________________wwwwwwwwwwWWw',
    'w_____S_wwwww_R____R____________wwwwwwwwwwWWw',
    'wR______wwwww__WWWW_____________wwwwwwwwwwWWw',
    'wwwwwwwwwwwww__WWWW__________R__wwwwwwwwwwWWw',
    'wwwwwwwwwwwww__WWWW_____________::::::::::WWw',
    'wwwwwwwwwwwww_R____R____R_______::::::::::WWw',
    'wwwwwwwwwwwwwl_________________l::::::::::WWw',
    'wwwwwwwwwwwwwwwwwwwww__wwwwwwwwwwwwwwww:::WWw',
    'wwwwwwwwwwwwwwwwwwwww__wwwwwwwwwwwwwwww:::WWw',
    'wwwwwwwwwwwwwwwwwwwww__wwwwwwwwwwwwwwww:::WWw',
    'wwwwwwwwwwwwwwl_______________lwwwww::::::WWw',
    'wwwwwwwwwwwwww__R_______WWWWWW_wwwww::::::WWw',
    'wwwwwwwwwwwwww__________WWWWWW_wwwww::::::WWw',
    'wwwwwwwwwwwwww__________WWWWWW_wwwww::::::WWw',
    'wwl_______lwww_________________wwwww::::::WWw',
    'ww_________www::::::::::::::::Rwwwww::::::WWw',
    'ww____________:::::::::::::::::wwwwwwww:::WWw',
    'ww____________pppppppppppppppppwwwwwwww:::WWw',
    'ww_________www:::::::::::::::::wwwwwwww:::WWw',
    'wwR_______Rwww:R:::::::R:::::::wwwwwwww:::WWw',
    'wwwwwl_lwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww:::WWw',
    'wl____*_____lwwwwwwwwwwwwwwwwwwwwwwwwww:::www',
    'w____*_*_____wwwwwwwwwwwwwwwwwwwwwwWW______lw',
    'w___*_*_*____wwwwwwwwwwwwwwwwwwwwwwWW_______w',
    'w____*_*_____wwwwwwwwwwwwwwwwwwwwww_________w',
    'w_____*______wwwwwwwwwwwwwwwwwwwwww_________w',
    'w____________wwwwwwwwwwwwwwwwwwwwww_______^_w',
    'w_WW______WW_wwwwwwwwwwwwwwwwwwwwww_________w',
    'wRWW______WWRwwwwwwwwwwwwwwwwwwwwww_________w',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwR_______lw',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  ],
  // The tide channel floods at high tide (§3.2); nothing is low-tide-only on this floor.
  tide: {
    high: [
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                ~~~~~~~~~~   ',
      '                                ~~~~~~~~~~   ',
      '                                ~~~~~~~~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                    ~~~~~~   ',
      '                                    ~~~~~~   ',
      '                                    ~~~~~~   ',
      '                                    ~~~~~~   ',
      '                                    ~~~~~~   ',
      '                                    ~~~~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                       ~~~   ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
    ],
    low: [
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
      '                                             ',
    ],
  },
  objects: [
    // Ladder #1 up → 上層 stairs #1: lands at the foot of its ladder down, facing away from it.
    {
      type: 'warp',
      x: 3,
      y: 2,
      target_map: 'map_sunken_ruins_1f',
      target_x: 41,
      target_y: 7,
      facing: 'down',
    },
    // Ladder #2 up (chest room) → 上層 stairs #2.
    {
      type: 'warp',
      x: 42,
      y: 30,
      target_map: 'map_sunken_ruins_1f',
      target_x: 42,
      target_y: 32,
      facing: 'down',
    },
    // Entrance sign
    { type: 'sign', x: 5, y: 2, text_id: 'dlg_sign_ruins_b1' },
    // Stele C (§3.2): unreadable until the scholar's rune, then the tide toggle. The first
    // trigger whose condition holds fires when the stele is examined.
    {
      type: 'trigger',
      x: 6,
      y: 5,
      event_id: 'ev_ruins_stele_unreadable',
      once: false,
      condition: '!ruins.tide_learned',
      interact: true,
    },
    {
      type: 'trigger',
      x: 6,
      y: 5,
      event_id: 'ev_ruins_tide_toggle',
      once: false,
      condition: 'ruins.tide_learned',
      interact: true,
    },
    // Pillar hall: the panacea chest in the north-east corner
    {
      type: 'chest',
      x: 30,
      y: 1,
      item_id: 'it_panacea',
      qty: 2,
      flag: 'chest.ruins_b1_01',
      tide: 'any',
    },
    // Antechamber: boss-side save point (§3.1) with the star tear beside it
    { type: 'save_point', x: 4, y: 21 },
    {
      type: 'chest',
      x: 4,
      y: 20,
      item_id: 'it_star_tear',
      qty: 1,
      flag: 'chest.ruins_b1_02',
      tide: 'any',
    },
    // Chest room (§3.1, §7.1/§7.2, §14 sq_old_chart): under water until the tide is low
    {
      type: 'chest',
      x: 37,
      y: 29,
      item_id: 'eq_wp_mio_4',
      qty: 1,
      flag: 'chest.ruins_b1_03',
      tide: 'low',
    },
    {
      type: 'chest',
      x: 36,
      y: 31,
      item_id: 'it_old_chart',
      qty: 1,
      flag: 'chest.ruins_b1_04',
      tide: 'low',
    },
    // Boss doorway: the intro talk before contact (§5.12) on the way in, then ノクス's
    // entrance on the way out once the guardian is down (§13 #14).
    { type: 'trigger', x: 6, y: 24, event_id: 'ev_ruins_boss_intro', once: true },
    {
      type: 'trigger',
      x: 6,
      y: 24,
      event_id: 'ev_nox_appear',
      once: true,
      condition: 'ruins.boss_defeated',
    },
    // 遺跡の番人 on the rune circle, three tiles past the doorway (§8.4)
    {
      type: 'enemy',
      x: 6,
      y: 27,
      group_id: 'grp_boss_guardian',
      respawn_sec: -1,
      radius: 2,
      defeated_flag: 'ruins.boss_defeated',
    },
    // ノクス appears inside the chamber after the win, off the doorway-to-boss line
    {
      type: 'npc',
      id: 'npc_nox',
      x: 8,
      y: 26,
      dialog: 'dlg_nox_idle',
      facing: 'up',
      sprite: 'sprite_npc',
      hidden_if: '!ruins.nox_on_stage',
    },
    // Normal symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the entrance
    {
      type: 'enemy',
      x: 17,
      y: 2,
      group_id: 'grp_ruins_b,grp_ruins_c,grp_ruins_d',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 27,
      y: 5,
      group_id: 'grp_ruins_b,grp_ruins_c,grp_ruins_d',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 26,
      y: 20,
      group_id: 'grp_ruins_b,grp_ruins_c,grp_ruins_d',
      respawn_sec: 60,
      radius: 3,
    },
    // The tide channel's basin: dry land only at low tide (§3.2)
    {
      type: 'enemy',
      x: 38,
      y: 16,
      group_id: 'grp_ruins_b,grp_ruins_c,grp_ruins_d',
      respawn_sec: 60,
      radius: 3,
      tide: 'low',
    },
  ],
};
