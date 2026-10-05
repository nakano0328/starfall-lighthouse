import type { MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * ささやきの森 (50x40). Second field map, east of 海岸街道 (§3.1): dense trees with
 * winding dark-grass trails linking four open areas.
 *
 * - West edge (x0, y20-21): back to the coast road's east end.
 * - Central glade (x13-22, y16-24): where the trails meet.
 * - North clearing (x18-32, y4-10): the shrine façade (walls y2-3, door at (25,3))
 *   with the save point, the hint sign and the fire-stone chest; the door warp needs
 *   `it_key_shrine` (§13 #6).
 * - North-east trail (y5-9, x33-49): ends at the east edge (49,6); `npc_forest_vine`
 *   stands on the single-tile trail at (48,6) and seals it until `fragments.count>=1`
 *   (§13 #7). The warp there is a placeholder until 山道 exists.
 * - East clearing (x32-42, y17-25) with the gold chest; a dead-end trail from its
 *   south side leads to the shrine-key chest (46,33) (§7.1 `chest.forest_02`).
 * - South-west glade (x4-12, y27-34): the necklace chest sits in a one-tile notch at
 *   (2,31), hemmed in by trees on three sides (§14 `sq_lost_necklace`).
 *
 * Enemy symbols (§5.12) sit in the open areas, 6+ tiles from the entrance.
 */
export const map_whisper_forest: MapSource = {
  meta: {
    id: 'map_whisper_forest',
    displayName: 'ささやきの森',
    kind: 'field',
    bgmKey: 'bgm_forest',
    battleBgKey: 'bg_forest',
    encounterGroups: ['grp_forest_a', 'grp_forest_b', 'grp_forest_c'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 1, y: 20, facing: 'right' },
    canSaveAnywhere: false,
  },
  width: 50,
  height: 40,
  legend: OUTDOOR_LEGEND,
  tiles: [
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTwwwwwTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTwwDwwTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTT.............TTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTT...........f...TTTTTTTT,,,,,TTTT',
    'TTTTTTTTTTTTTTTTTT...............TTTTTTTT,TTT,,,,,',
    'TTTTTTTTTTTTTTTTTT.............f.,,,,TTTT,TTTTTTTT',
    'TTTTTTTTTTTTTTTTTT...............TTT,TTTT,TTTTTTTT',
    'TTTTTTTTTTTTTTTTTT...R...........TTT,,,,,,TTTTTTTT',
    'TTTTTTTTTTTTTTTTTTT.............TTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTT,,TTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTT..........TTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTT,TT.....f.T..TTTTTTTTT...........TTTTTTT',
    'TTTTTTTT,,,,,..........TTTTTTTTT...........TTTTTTT',
    'TTT,TTT,,TTTT..........TTTTTTTTT....R......TTTTTTT',
    ',,,,,,,,TTTTT..........,,,,TTTTT...........TTTTTTT',
    ',,,,,,,TTTTTT..........,,,,,,,,,...........TTTTTTT',
    'TTTT,TTTTTTTT.....R....TTTT,,,,,...........TTTTTTT',
    'TTTT,TTTTTTTT..........TTTTTTTTT.....f.....TTTTTTT',
    'TTTT,,TTTTTTT..........TTTTTTTTTT.........TTTTTTTT',
    'TTTTT,TTTTTTTTTTTTTTTTTTTTTTTTTT...........TTTTTTT',
    'TTTTT,TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,TTTTTTTTT',
    'TTTT.........TTTTTTTTTTTTTTTTTTTTTTTTTTT,TTTTTTTTT',
    'TTTT..f......TTTTTTTTTTTTTTTTTTTTTTTTTTT,,,,TTTTTT',
    'TTTT.........TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,TTTTTT',
    'TTTT.........TTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,,,,TTT',
    'TT,..........TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,TTT',
    'TTTT....R....TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,TTT',
    'TTTT.........TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT,TTT',
    'TTTT.........TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  objects: [
    // West exit → 海岸街道 east end (its edge tile x39 holds the return warp).
    {
      type: 'warp',
      x: 0,
      y: 20,
      h: 2,
      target_map: 'map_coast_road',
      target_x: 38,
      target_y: 12,
      facing: 'left',
    },
    // Shrine door at the top of the north clearing → 森の祠 (locked until the key is found).
    {
      type: 'warp',
      x: 25,
      y: 3,
      target_map: 'map_forest_shrine',
      target_x: 15,
      target_y: 28,
      facing: 'up',
      required_item: 'it_key_shrine',
      locked_text_id: 'dlg_shrine_door_locked',
      door_flag: 'door.forest_shrine_01',
    },
    // North-east exit at the end of the vine trail → 山道.
    // TODO(Phase 4b): map_mountain_road — until it exists the exit bounces the player
    // back onto the trail; npc_forest_vine seals that tile until the first fragment.
    {
      type: 'warp',
      x: 49,
      y: 6,
      target_map: 'map_whisper_forest',
      target_x: 48,
      target_y: 6,
      facing: 'left',
    },
    // The thorn vine on the single-tile trail before the north-east exit (§13 #7).
    {
      type: 'npc',
      x: 48,
      y: 6,
      id: 'npc_forest_vine',
      dialog: 'dlg_forest_vine',
      facing: 'down',
      sprite: 'sprite_npc',
      hidden_if: 'fragments.count>=1',
    },
    // Signs: one by the entrance, one beside the shrine door (「ウロは火を恐れる」, §13 #6).
    { type: 'sign', x: 3, y: 19, text_id: 'dlg_sign_forest_entrance' },
    { type: 'sign', x: 27, y: 4, text_id: 'dlg_sign_forest_hint' },
    // Save point in the north clearing, a few steps from the shrine door.
    { type: 'save_point', x: 20, y: 5 },
    // Chests (§7.1, §14)
    { type: 'chest', x: 10, y: 17, item_id: 'it_herb', qty: 3, flag: 'chest.forest_01' },
    { type: 'chest', x: 46, y: 33, item_id: 'it_key_shrine', qty: 1, flag: 'chest.forest_02' },
    { type: 'chest', x: 42, y: 17, item_id: 'gold', qty: 120, flag: 'chest.forest_03' },
    { type: 'chest', x: 23, y: 4, item_id: 'it_fire_stone', qty: 2, flag: 'chest.forest_04' },
    {
      type: 'chest',
      x: 2,
      y: 31,
      item_id: 'it_shell_necklace',
      qty: 1,
      flag: 'chest.forest_05',
    },
    // Enemy symbols (§5.12): wander radius 4, respawn 60 s. Wolves (grp_forest_b) deeper in.
    { type: 'enemy', x: 16, y: 18, group_id: 'grp_forest_a', respawn_sec: 60, radius: 4 },
    { type: 'enemy', x: 19, y: 23, group_id: 'grp_forest_a', respawn_sec: 60, radius: 4 },
    { type: 'enemy', x: 35, y: 20, group_id: 'grp_forest_a', respawn_sec: 60, radius: 4 },
    { type: 'enemy', x: 39, y: 23, group_id: 'grp_forest_b', respawn_sec: 60, radius: 4 },
    { type: 'enemy', x: 8, y: 30, group_id: 'grp_forest_b', respawn_sec: 60, radius: 4 },
    {
      type: 'enemy',
      x: 29,
      y: 8,
      group_id: 'grp_forest_b,grp_forest_c',
      respawn_sec: 60,
      radius: 4,
    },
  ],
};
