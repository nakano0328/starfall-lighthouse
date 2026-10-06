import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the tower floors: the round room is cut out of `void` (`V`) with a dark
 * `wall_top` rim (`W`) and a brick `wall` ring (`w`) inside it; the same `w` draws the
 * dividing wall. Stone floor (`_`), rune tiles (`*`), lantern pillars (`l`, solid),
 * fallen masonry (`R`, solid rock on the floor) and the stair tiles (`^`).
 */
const TOWER_4F_LEGEND: Legend = {
  V: 'void',
  W: 'wall_top',
  w: 'wall',
  _: 'floor_stone',
  '*': 'rune_floor',
  '^': 'stairs',
  l: 'lantern',
  R: { ground: 'floor_stone', deco: 'rock' },
};

/**
 * 灯台の塔 4F (24x24). Fourth floor of the tower (§3.1): ルカ's final sword
 * `eq_wp_luka_4` (§7.4, `chest.tower_4f_01`).
 *
 * Stair contract shared by every tower floor: the stairs down are the `^` at (2, 21),
 * reached from above on the landing (2, 22) (the entrance, with the floor's voice
 * trigger `ev_tower_voice_4`, §13 #16); the stairs up are the `^` at (21, 2), reached
 * from below on (21, 3). Both sit in small stair turrets on the rim of the round room.
 *
 * - A wall two tiles thick (x11-12, y4-22) splits the room into a west and an east hall,
 *   joined only under the rune arch at the top (x11-12, y1-3). Each hall has two rows of
 *   lantern pillars (x4 / x8 and x15 / x19 at y6, 10, 14, 18).
 * - Landing → up-stairs: up the west hall, through the arch, then east along the top:
 *   (2, 22) → (3, 22) → (3, 5) → (10, 5) → (10, 3) → (18, 3) → (18, 4) → (21, 4) → (21, 2).
 * - West hall: the sign at (2, 19) in the turret, `chest.tower_4f_02` (ほしのなみだ) by the
 *   west wall at (1, 11).
 * - East hall: the sword chest `chest.tower_4f_01` at the far south end (15, 21), between
 *   two lanterns, a detour from the stairs up.
 * - Symbols (§5.12): one in the west hall, two in the east hall; all 6+ tiles from the
 *   landing.
 */
export const map_lighthouse_4f: MapSource = {
  meta: {
    id: 'map_lighthouse_4f',
    displayName: '灯台の塔 4F',
    kind: 'dungeon',
    bgmKey: 'bgm_lighthouse',
    battleBgKey: 'bg_lighthouse',
    encounterGroups: ['grp_tower_c', 'grp_tower_d'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 2, y: 22, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 24,
  height: 24,
  legend: TOWER_4F_LEGEND,
  tiles: [
    'VVVVWWWWwwwwwwwwWWWWWWWW',
    'VVVWWwwww______wwwwwwwwW',
    'VVWWww_____**_____ww_^wW',
    'VWWww______**______w__wW',
    'WWww_______ww_________wW',
    'Www________ww_________wW',
    'Ww__l___l__ww__l___l__wW',
    'Ww_________ww_________wW',
    'ww_________ww_R_______ww',
    'w__________ww__________w',
    'w___l___l__ww__l___l___w',
    'w__________ww__________w',
    'w__________ww________R_w',
    'w__________ww__________w',
    'w___l___l__ww__l___l___w',
    'ww_________ww_________ww',
    'Ww_______R_ww_________wW',
    'Ww_________ww_________wW',
    'Ww__l___l__ww__l___l_wwW',
    'Ww_________ww_______wwWW',
    'Ww__w______ww______wwWWV',
    'Ww^_ww_____ww_l_l_wwWWVV',
    'Ww__wwwww__ww__wwwwWWVVV',
    'WwwwwWWWwwwwwwwwWWWWVVVV',
  ],
  objects: [
    // Stairs down → 灯台の塔 3F: lands on the tile below 3F's up-stairs, facing away from them.
    {
      type: 'warp',
      x: 2,
      y: 21,
      target_map: 'map_lighthouse_3f',
      target_x: 21,
      target_y: 3,
      facing: 'down',
    },
    // Stairs up → 灯台の塔 5F: lands on the tile below 5F's stairs down, facing away from them.
    {
      type: 'warp',
      x: 21,
      y: 2,
      target_map: 'map_lighthouse_5f',
      target_x: 2,
      target_y: 22,
      facing: 'down',
    },
    // The shadow's voice on first reaching this floor (§13 #16), on the landing itself.
    { type: 'trigger', x: 2, y: 22, event_id: 'ev_tower_voice_4', once: true },
    // Sign in the south-west turret
    { type: 'sign', x: 2, y: 19, text_id: 'dlg_sign_tower_4f' },
    // East hall, south end: ルカ's final sword (§7.4)
    { type: 'chest', x: 15, y: 21, item_id: 'eq_wp_luka_4', qty: 1, flag: 'chest.tower_4f_01' },
    // West hall, by the west wall: a star tear (§7.1)
    { type: 'chest', x: 1, y: 11, item_id: 'it_star_tear', qty: 1, flag: 'chest.tower_4f_02' },
    // Symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the landing
    {
      type: 'enemy',
      x: 6,
      y: 9,
      group_id: 'grp_tower_c,grp_tower_d',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 17,
      y: 8,
      group_id: 'grp_tower_c,grp_tower_d',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 16,
      y: 16,
      group_id: 'grp_tower_c,grp_tower_d',
      respawn_sec: 60,
      radius: 3,
    },
  ],
};
