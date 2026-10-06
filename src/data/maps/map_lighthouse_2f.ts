import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the tower floors (see map_lighthouse_1f): stone floor inside a ring of brick
 * wall (`w` face, `W` cap) with the night (`V`) outside, lantern posts (`l`), rubble (`R`)
 * and stair heads (`^`). `L` is a lever handle set into a wall: a solid lever tile on
 * stone, examined from the floor tile in front of it.
 */
const TOWER_2F_LEGEND: Legend = {
  V: 'void',
  W: 'wall_top',
  w: 'wall',
  _: 'floor_stone',
  l: 'lantern',
  R: { ground: 'floor_stone', deco: 'rock' },
  L: { ground: 'floor_stone', deco: 'lever' },
  '^': 'stairs',
};

/**
 * 灯台の塔 2F (24x24). The lever puzzle floor (§3.1 「鍵なし扉の順路パズル」): the same
 * round hall as 1F, cut into three zones by two wall lines, each pierced by a one-tile
 * gap that an iron gate (`npc_tower_gate_*`, drawn as `obj_gate`) seals until its lever
 * is pulled (`ev_tower_lever_a` / `_b` set `lighthouse.lever_a` / `_b`).
 *
 * - Zone 1, south-west (x2-10, y12-21): the stair turret on the south-west shoulder,
 *   where 1F's stairs land the party on (2, 22) (`ev_tower_voice_2`) below the stairs
 *   down at (2, 21). The sign at (5, 18) hints at the levers. Lever A is set into the
 *   west wall at (1, 13), examined from (2, 13) facing left; gate A at (8, 11), between
 *   two lantern posts, is the only gap in the wall along y11.
 * - Zone 2, north-west (x2-10, y2-10): the detour. Lever B is set into the west wall at
 *   (3, 5), examined from (4, 5) facing left, with `chest.tower_2f_01` in the west
 *   alcove at (2, 9). Gate B at (11, 5) is the only gap in the wall down x11.
 * - Zone 3, east half (x12-21, y2-21): the stair turret on the north-east shoulder, with
 *   the stairs up at (21, 2) to 3F, landing from 3F on (21, 3).
 *
 * With no lever pulled only zone 1 can be walked; lever A opens zone 2, lever B opens
 * zone 3. One `grp_tower_a,grp_tower_b` symbol roams each zone.
 *
 * Straight walks: (2, 22) → (3, 22) → (3, 13) → (2, 13) [lever A on the left];
 * (2, 13) → (8, 13) → (8, 5) [through gate A] → (4, 5) [lever B on the left];
 * (4, 5) → (21, 5) [through gate B] → (21, 2).
 */
export const map_lighthouse_2f: MapSource = {
  meta: {
    id: 'map_lighthouse_2f',
    displayName: '灯台の塔 2F',
    kind: 'dungeon',
    bgmKey: 'bgm_lighthouse',
    battleBgKey: 'bg_lighthouse',
    encounterGroups: ['grp_tower_a', 'grp_tower_b'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 2, y: 22, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 24,
  height: 24,
  legend: TOWER_2F_LEGEND,
  tiles: [
    'VVVVVVVVVWWWWWWVVVVVVVVV',
    'VVVVVVVWwwwWwwwwWWWWwwWV',
    'VVVVVWww___w____wwWw_^wV',
    'VVVVWwl____w____R_ww__wV',
    'VVVww______l_______w__wV',
    'VVwL__________________wV',
    'VVw________l_________wWV',
    'VWw________w_________wWV',
    'Vw___R_____w__________wV',
    'Ww_________w__l_______wW',
    'Ww_________w__________wW',
    'WWwwwwwl_lww__________wW',
    'Ww_________w_______R__wW',
    'wL_________w__________wW',
    'Ww_________w__________wW',
    'Vw_________w__________wV',
    'VWw________w______l__wWV',
    'VWw________w_________wVV',
    'Vw_________w________wWVV',
    'Vw__w____R_w__l____wWVVV',
    'Vw__ww_l___w______wWVVVV',
    'Vw^_wWww___w____wwWVVVVV',
    'Vw__wWWWwwwWwwwwWVVVVVVV',
    'VWwwWVVVVWWWWWWVVVVVVVVV',
  ],
  objects: [
    // Stairs down → 灯台の塔 1F: lands below 1F's stairs up (21, 2), facing away from them.
    {
      type: 'warp',
      x: 2,
      y: 21,
      target_map: 'map_lighthouse_1f',
      target_x: 21,
      target_y: 3,
      facing: 'down',
    },
    // Stairs up → 灯台の塔 3F: lands below 3F's stairs down (2, 21), facing away from them.
    {
      type: 'warp',
      x: 21,
      y: 2,
      target_map: 'map_lighthouse_3f',
      target_x: 2,
      target_y: 22,
      facing: 'down',
    },
    // The shadow's voice on arrival (§13 #16): fires once, on the landing.
    { type: 'trigger', x: 2, y: 22, event_id: 'ev_tower_voice_2', once: true },
    // Zone 1: the hint sign by the turret mouth
    { type: 'sign', x: 5, y: 18, text_id: 'dlg_sign_tower_2f' },
    // Lever A (set into the west wall of zone 1, examined from (2, 13) facing left) and
    // gate A in the gap of the y11 wall, gone once the lever is pulled.
    { type: 'trigger', x: 1, y: 13, event_id: 'ev_tower_lever_a', once: true, interact: true },
    {
      type: 'npc',
      x: 8,
      y: 11,
      id: 'npc_tower_gate_a',
      dialog: 'dlg_tower_gate',
      facing: 'down',
      sprite: 'obj_gate',
      hidden_if: 'lighthouse.lever_a',
    },
    // Lever B (set into the west wall of zone 2, examined from (4, 5) facing left) and
    // gate B in the gap of the x11 wall, gone once the lever is pulled.
    { type: 'trigger', x: 3, y: 5, event_id: 'ev_tower_lever_b', once: true, interact: true },
    {
      type: 'npc',
      x: 11,
      y: 5,
      id: 'npc_tower_gate_b',
      dialog: 'dlg_tower_gate',
      facing: 'down',
      sprite: 'obj_gate',
      hidden_if: 'lighthouse.lever_b',
    },
    // Zone 2: the west alcove chest
    { type: 'chest', x: 2, y: 9, item_id: 'it_light_dust', qty: 2, flag: 'chest.tower_2f_01' },
    // Normal symbols (§5.12), one per zone: wander radius 3, respawn 60 s, 6+ tiles from
    // the landing.
    {
      type: 'enemy',
      x: 7,
      y: 16,
      group_id: 'grp_tower_a,grp_tower_b',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 7,
      y: 8,
      group_id: 'grp_tower_a,grp_tower_b',
      respawn_sec: 60,
      radius: 3,
    },
    {
      type: 'enemy',
      x: 16,
      y: 14,
      group_id: 'grp_tower_a,grp_tower_b',
      respawn_sec: 60,
      radius: 3,
    },
  ],
};
