import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the tower floors: the round hall is stone floor (`_`) inside a ring of brick
 * wall (`w`, the face lining the room) capped by `W` (wall_top, the outer crust); the
 * square's corners outside the ring are `V` (void, the night outside). `*` is the rune
 * seal in the middle of the floor, `l` a lantern post, `R` rubble (rock on the floor),
 * `D` the entrance door and `^` the stair head.
 */
const TOWER_1F_LEGEND: Legend = {
  V: 'void',
  W: 'wall_top',
  w: 'wall',
  _: 'floor_stone',
  '*': 'rune_floor',
  l: 'lantern',
  R: { ground: 'floor_stone', deco: 'rock' },
  D: 'door',
  '^': 'stairs',
};

/**
 * 灯台の塔 1F (24x24). The ground floor of the lighthouse (§3.1): a round hall twenty
 * tiles across drawn inside the square, with the rune seal of the foundation in its
 * middle, eight lantern posts in a ring and rubble where the stair wall has crumbled.
 *
 * - South door (12, 23), on the bottom edge: the lighthouse door of 灯台への道, which
 *   needs `it_key_lighthouse` on that side (§13 #15). Its warp lands the party on (15, 2)
 *   there; the path's door at (15, 1) lands here on (12, 22), the throat between the two
 *   entrance lanterns, where `ev_tower_voice_1` greets them (§13 #16).
 * - Stair turret (x20-21, y2-5) on the north-east shoulder of the ring: the stairs up at
 *   (21, 2) warp to 2F (2, 22); 2F's stairs down at (2, 21) land here on (21, 3), facing
 *   away from them. There are no stairs down.
 * - The sign stands just inside the door at (13, 21), `chest.tower_1f_01` in the west
 *   alcove at (2, 11), and the two `grp_tower_a` symbols roam the west and east halves.
 *
 * (12, 22) → (12, 5) → (21, 5) → (21, 2) is a straight open walk to the stairs.
 */
export const map_lighthouse_1f: MapSource = {
  meta: {
    id: 'map_lighthouse_1f',
    displayName: '灯台の塔 1F',
    kind: 'dungeon',
    bgmKey: 'bgm_lighthouse',
    battleBgKey: 'bg_lighthouse',
    encounterGroups: ['grp_tower_a'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 12, y: 22, facing: 'up' },
    canSaveAnywhere: false,
  },
  width: 24,
  height: 24,
  legend: TOWER_1F_LEGEND,
  tiles: [
    'VVVVVVVVVWWWWWWVVVVVVVVV',
    'VVVVVVVWwwwwwwwwWWWWwwWV',
    'VVVVVWww________wwWw_^wV',
    'VVVVWw__________R_ww__wV',
    'VVVWw______________w__wV',
    'VVWw__________________wV',
    'VVw_____l______l_____wWV',
    'VWw__________________wWV',
    'Vw____l__________l____wV',
    'Ww__R_________________wW',
    'Ww_________**_________wW',
    'Ww________****________wW',
    'Ww________****________wW',
    'Ww_________**______R__wW',
    'Ww____________________wW',
    'Vw____l__________l____wV',
    'VWw__________________wWV',
    'VVw_____l______l_____wVV',
    'VVWw________________wWVV',
    'VVVWw______________wWVVV',
    'VVVVWw_R__________wWVVVV',
    'VVVVVWww________wwWVVVVV',
    'VVVVVVVWwwwl_lwwWVVVVVVV',
    'VVVVVVVVVWWwDwWVVVVVVVVV',
  ],
  objects: [
    // South door → 灯台への道: lands on the tile in front of the lighthouse door (15, 1),
    // facing away from it.
    {
      type: 'warp',
      x: 12,
      y: 23,
      target_map: 'map_lighthouse_path',
      target_x: 15,
      target_y: 2,
      facing: 'down',
    },
    // Stairs up → 灯台の塔 2F: lands below 2F's stairs down (2, 21), facing away from them.
    {
      type: 'warp',
      x: 21,
      y: 2,
      target_map: 'map_lighthouse_2f',
      target_x: 2,
      target_y: 22,
      facing: 'down',
    },
    // The shadow's voice on arrival (§13 #16): fires once, on the entrance tile.
    { type: 'trigger', x: 12, y: 22, event_id: 'ev_tower_voice_1', once: true },
    // Entrance sign, one step up and to the right of the door
    { type: 'sign', x: 13, y: 21, text_id: 'dlg_sign_tower_1f' },
    // West alcove
    { type: 'chest', x: 2, y: 11, item_id: 'it_potion_l', qty: 2, flag: 'chest.tower_1f_01' },
    // Normal symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the entrance,
    // off the straight walk up x12 and along y5.
    { type: 'enemy', x: 7, y: 14, group_id: 'grp_tower_a', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 17, y: 10, group_id: 'grp_tower_a', respawn_sec: 60, radius: 3 },
  ],
};
