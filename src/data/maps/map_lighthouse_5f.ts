import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the lamp-room antechamber: the round room is cut out of `void` (`V`) with a
 * dark `wall_top` rim (`W`) and a brick `wall` ring (`w`) inside it; the same `w` walls the
 * fountain alcove. Stone floor (`_`), rune tiles (`*`), lantern pillars (`l`, solid), the
 * water of the basin (`~`, solid), the pedestal (`S`, a stele on the floor, solid; the
 * examine-triggers sit on it), fallen masonry (`R`, solid) and the stair tiles (`^`).
 */
const TOWER_5F_LEGEND: Legend = {
  V: 'void',
  W: 'wall_top',
  w: 'wall',
  _: 'floor_stone',
  '*': 'rune_floor',
  '^': 'stairs',
  l: 'lantern',
  '~': 'water',
  S: { ground: 'floor_stone', deco: 'stele' },
  R: { ground: 'floor_stone', deco: 'rock' },
};

/**
 * 灯台の塔 5F（灯室前） (24x24). The antechamber under the lamp room (§3.1): the final save
 * point and the fountain that heals the party once (§13 #17).
 *
 * Stair contract shared by every tower floor: the stairs down are the `^` at (2, 21),
 * reached from above on the landing (2, 22) (the entrance, with the floor's voice
 * trigger `ev_tower_voice_5`, §13 #16); the stairs up are the `^` at (21, 2), reached
 * from below on (21, 3). The stairs up lead to 灯台頂 (10, 12) and its stairs down land
 * back on (21, 3) here.
 *
 * - Fountain alcove (x8-14, y8-14) in the middle of the room: a walled ring whose only
 *   opening is the one-tile gap at (11, 14), barred by the iron gate
 *   `npc_tower_fountain_gate` (an `obj_gate` sprite) until `lighthouse.fountain_awake`.
 *   Inside, the fountain is a `save_point` at (11, 11) with `heal` and the once-flag
 *   `lighthouse.fountain_used`, standing in a basin of water; it is used from (11, 12)
 *   facing up.
 * - Pedestal: the stele at (12, 15) beside the gate, outside the alcove, stacks two
 *   examine-triggers. With じいちゃんの手紙 (§7.1 `it_grandpa_letter`) in the bag
 *   `ev_tower_fountain_wake` fires once and opens the gate; without it
 *   `ev_tower_fountain_sealed` only describes the sleeping fountain. It is examined from
 *   (12, 16) facing up (or from (11, 15) / (13, 15) sideways).
 * - A rune path (x11, y15-17) between two lanterns leads up to the gate from the south.
 * - Final save point (§3.1, §13 #20) at (20, 3) in the north-east turret, beside the
 *   landing from the lamp room; the sign at (2, 19) in the south-west turret.
 * - Landing → up-stairs is a plain walk: (2, 22) → (3, 22) → (3, 16) → (21, 16) → (21, 2).
 *   Landing → pedestal → fountain → up-stairs: (2, 22) → (3, 22) → (3, 16) → (12, 16)
 *   [examine up] → (11, 16) → (11, 12) [use the fountain facing up] → (11, 16) →
 *   (21, 16) → (21, 2).
 * - Symbols (§5.12): two of `grp_tower_d`, north-west and east of the alcove, 6+ tiles from
 *   the landing and clear of the stairs up.
 */
export const map_lighthouse_5f: MapSource = {
  meta: {
    id: 'map_lighthouse_5f',
    displayName: '灯台の塔 5F（灯室前）',
    kind: 'dungeon',
    bgmKey: 'bgm_lighthouse',
    battleBgKey: 'bg_lighthouse',
    encounterGroups: ['grp_tower_d'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 2, y: 22, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 24,
  height: 24,
  legend: TOWER_5F_LEGEND,
  tiles: [
    'VVVVWWWWwwwwwwwwWWWWWWWW',
    'VVVWWwwwwl____lwwwwwwwwW',
    'VVWWww____________ww_^wW',
    'VWWww______________w__wW',
    'WWww__________________wW',
    'Www________l__________wW',
    'Ww____________________wW',
    'Ww_____l_______l______wW',
    'ww_______wwwww________ww',
    'w_R_____wl~~~lw________w',
    'w_______w_~~~_w________w',
    'w____l__w_~_~_w__l_____w',
    'w_______w_~_~_w________w',
    'w_______w_____w_____R__w',
    'w________ww_ww_________w',
    'ww_____l___*S__l______ww',
    'Ww_________*__________wW',
    'Ww________l*l________wwW',
    'Ww________________R__wwW',
    'Ww__________________wwWW',
    'Ww__w______________wwWWV',
    'Ww^_ww____________wwWWVV',
    'Ww__wwwww______wwwwWWVVV',
    'WwwwwWWWwwwwwwwwWWWWVVVV',
  ],
  objects: [
    // Stairs down → 灯台の塔 4F: lands on the tile below 4F's up-stairs, facing away from them.
    {
      type: 'warp',
      x: 2,
      y: 21,
      target_map: 'map_lighthouse_4f',
      target_x: 21,
      target_y: 3,
      facing: 'down',
    },
    // Stairs up → 灯台頂: lands on the stair head landing above its stairs down, facing up.
    {
      type: 'warp',
      x: 21,
      y: 2,
      target_map: 'map_lighthouse_top',
      target_x: 10,
      target_y: 12,
      facing: 'up',
    },
    // The shadow's voice on first reaching this floor (§13 #16), on the landing itself.
    { type: 'trigger', x: 2, y: 22, event_id: 'ev_tower_voice_5', once: true },
    // Sign in the south-west turret
    { type: 'sign', x: 2, y: 19, text_id: 'dlg_sign_tower_5f' },
    // Final save point (§3.1, §13 #20) beside the stairs up to the lamp room
    { type: 'save_point', x: 20, y: 3 },
    // The iron gate in the alcove's only gap, gone once the fountain wakes (§9.3 obj_gate)
    {
      type: 'npc',
      x: 11,
      y: 14,
      id: 'npc_tower_fountain_gate',
      dialog: 'dlg_tower_gate',
      facing: 'down',
      sprite: 'obj_gate',
      hidden_if: 'lighthouse.fountain_awake',
    },
    // The fountain: a full heal, once (§13 #17), used from (11, 12) facing up
    { type: 'save_point', x: 11, y: 11, heal: true, once_flag: 'lighthouse.fountain_used' },
    // The pedestal beside the gate: the letter wakes the fountain, otherwise it only
    // describes the sleeping hollow. Stacked on one stele tile; the first whose condition
    // holds fires (§9.3).
    {
      type: 'trigger',
      x: 12,
      y: 15,
      event_id: 'ev_tower_fountain_wake',
      once: true,
      condition: 'item.it_grandpa_letter>=1',
      interact: true,
    },
    {
      type: 'trigger',
      x: 12,
      y: 15,
      event_id: 'ev_tower_fountain_sealed',
      once: false,
      condition: 'item.it_grandpa_letter<1',
      interact: true,
    },
    // Symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the landing and clear
    // of the stairs up
    { type: 'enemy', x: 5, y: 7, group_id: 'grp_tower_d', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 18, y: 10, group_id: 'grp_tower_d', respawn_sec: 60, radius: 3 },
  ],
};
