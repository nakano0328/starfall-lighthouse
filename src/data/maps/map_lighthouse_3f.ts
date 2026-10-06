import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the tower floors: the round room is cut out of `void` (`V`) with a dark
 * `wall_top` rim (`W`) and a brick `wall` ring (`w`) inside it; the same `w` draws the
 * spiral wall. Stone floor (`_`), the rune star (`*`), lanterns (`l`, solid), fallen
 * masonry (`R`, solid rock on the floor) and the stair tiles (`^`).
 */
const TOWER_3F_LEGEND: Legend = {
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
 * 灯台の塔 3F (24x24). Third floor of the tower (§3.1): a save point and the three
 * Tier-4 star armours (§7.4) in the vault at the heart of a spiral.
 *
 * Stair contract shared by every tower floor: the stairs down are the `^` at (2, 21),
 * reached from above on the landing (2, 22) (the entrance, with the floor's voice
 * trigger `ev_tower_voice_3`, §13 #16); the stairs up are the `^` at (21, 2), reached
 * from below on (21, 3). Both sit in small stair turrets on the rim of the round room.
 *
 * - Rim walk (the ring between the outer wall and the spiral): open all the way round,
 *   so landing → up-stairs is a plain walk up the west side and along the top:
 *   (2, 22) → (3, 22) → (3, 5) → (6, 5) → (6, 3) → (17, 3) → (17, 4) → (21, 4) → (21, 2).
 *   The sign stands at (2, 19) in the south-west turret; the save point waits in the
 *   nook at (18, 3) just before the north-east turret.
 * - Spiral: one wall winds two turns inward. It opens on the rim at the south (gap
 *   x9-10, y19, flanked by lanterns) and from there the only way is west and round
 *   clockwise through the middle corridor (a full circle, past the radial wall at x11,
 *   y17-19) to the second gap (x12-13, y16) into the vault.
 * - Vault (x8-15, y8-15): the rune star in the middle and the three chests
 *   `chest.tower_3f_01/02/03` along its north wall between two lanterns.
 * - Symbols (§5.12): one on the rim at the top, one in the middle corridor, one in the
 *   vault; all 6+ tiles from the landing.
 */
export const map_lighthouse_3f: MapSource = {
  meta: {
    id: 'map_lighthouse_3f',
    displayName: '灯台の塔 3F',
    kind: 'dungeon',
    bgmKey: 'bgm_lighthouse',
    battleBgKey: 'bg_lighthouse',
    encounterGroups: ['grp_tower_b', 'grp_tower_c'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 2, y: 22, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 24,
  height: 24,
  legend: TOWER_3F_LEGEND,
  tiles: [
    'VVVVWWWWwwwwwwwwWWWWWWWW',
    'VVVWWwwwwl____lwwwwwwwwW',
    'VVWWww____________ww_^wW',
    'VWWwwl_____________w__wW',
    'WWww____wwwwwwww______wW',
    'Www____w________w_____wW',
    'Ww____w_________Rw____wW',
    'Ww___w___wwwwww___w___wW',
    'ww__w___wl___l_w___w__ww',
    'w___w__w________w__w___w',
    'wR__w__w________w__w___w',
    'w___w__w__*__*__w__w___w',
    'w___w__w___**___w__w___w',
    'w___w__w___**___w__w__Rw',
    'w___w__w__*__*__w__w___w',
    'ww__w___w______w___w__ww',
    'Ww___w___wwl__l___w___wW',
    'Ww____wR___w_____w____wW',
    'Ww_____w___w____w____wwW',
    'Ww______l__lwwww___lwwWW',
    'Ww__w______________wwWWV',
    'Ww^_ww____________wwWWVV',
    'Ww__wwwww______wwwwWWVVV',
    'WwwwwWWWwwwwwwwwWWWWVVVV',
  ],
  objects: [
    // Stairs down → 灯台の塔 2F: lands on the tile below 2F's up-stairs, facing away from them.
    {
      type: 'warp',
      x: 2,
      y: 21,
      target_map: 'map_lighthouse_2f',
      target_x: 21,
      target_y: 3,
      facing: 'down',
    },
    // Stairs up → 灯台の塔 4F: lands on the tile below 4F's stairs down, facing away from them.
    {
      type: 'warp',
      x: 21,
      y: 2,
      target_map: 'map_lighthouse_4f',
      target_x: 2,
      target_y: 22,
      facing: 'down',
    },
    // The shadow's voice on first reaching this floor (§13 #16), on the landing itself.
    { type: 'trigger', x: 2, y: 22, event_id: 'ev_tower_voice_3', once: true },
    // Sign in the south-west turret
    { type: 'sign', x: 2, y: 19, text_id: 'dlg_sign_tower_3f' },
    // Save point (§3.1) in the nook before the north-east turret
    { type: 'save_point', x: 18, y: 3 },
    // The vault: the three star armours (§7.4) along its north wall
    {
      type: 'chest',
      x: 10,
      y: 8,
      item_id: 'eq_ar_star_luka',
      qty: 1,
      flag: 'chest.tower_3f_01',
    },
    { type: 'chest', x: 11, y: 8, item_id: 'eq_ar_star_mio', qty: 1, flag: 'chest.tower_3f_02' },
    {
      type: 'chest',
      x: 12,
      y: 8,
      item_id: 'eq_ar_star_goro',
      qty: 1,
      flag: 'chest.tower_3f_03',
    },
    // Symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the landing
    {
      type: 'enemy',
      x: 11,
      y: 2,
      group_id: 'grp_tower_b,grp_tower_c',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 6,
      y: 12,
      group_id: 'grp_tower_b,grp_tower_c',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 12,
      y: 10,
      group_id: 'grp_tower_b,grp_tower_c',
      respawn_sec: 60,
      radius: 3,
    },
  ],
};
