import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the lamp gallery: stone floor with the rune star, the dead lamp (`l`, lantern
 * tiles) in its wall housing, a railing (`F`, fence on stone) around the platform, the
 * night sea (`W`) seen below the railing and the sky (`V`, void) beyond. `^` is the
 * stair head down to 5F.
 */
const TOP_LEGEND: Legend = {
  V: 'void',
  W: 'deep_water',
  w: 'wall',
  l: 'lantern',
  _: 'floor_stone',
  '*': 'rune_floor',
  '^': 'stairs',
  F: { ground: 'floor_stone', deco: 'fence' },
};

/**
 * 灯台頂 (20x14). The lamp gallery at the top of the tower (§3.1): an event map with no
 * encounters, where the final battle against ノクス happens (§4.5, §8.4 — the two forms are
 * one battle, `bo_nox_phase1.phaseNext`).
 *
 * - Stair head (x7-13, y9-12): the stairs down at (10, 13) on the bottom edge warp to 5F
 *   (21, 3); 5F's up-stairs at (21, 2) land here on (10, 12), facing up.
 * - Throat (x8-12, y8): the only gap in the railing between the stair head and the
 *   gallery. The step-on `trigger` spans it so the party cannot pass without
 *   `ev_lighthouse_top`; it is not `once`, so it fires again after a lost battle, and
 *   stops firing once `main.nox_defeated` (§13 #19).
 * - Gallery (x3-17, y3-7): the round platform with the rune star in the middle, the dead
 *   lamp housing (`wlllw`) at the north and the railing all around. `npc_nox_top` stands
 *   on the star in front of the lamp at (10, 4) until he is beaten.
 *
 * (10, 12) → (10, 8) → (10, 5) is a straight open walk up the middle; the party stops on
 * (10, 5) against ノクス.
 */
export const map_lighthouse_top: MapSource = {
  meta: {
    id: 'map_lighthouse_top',
    displayName: '灯台頂',
    kind: 'event',
    bgmKey: 'bgm_boss',
    battleBgKey: 'bg_lighthouse_top',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 10, y: 12, facing: 'up' },
    canSaveAnywhere: false,
  },
  width: 20,
  height: 14,
  legend: TOP_LEGEND,
  tiles: [
    'VVVVVVVVVVVVVVVVVVVV',
    'VVVVVVVVwwwwwVVVVVVV',
    'VVVVVFFFwlllwFFFVVVV',
    'VVVWF_____*_____FWVV',
    'VVWF_____***_____FWV',
    'VWF_*************_FW',
    'VWF____*******____FW',
    'VWF___***___***___FW',
    'VWFFFFFF_____FFFFFFW',
    'VVWWWWF_______FWWWWV',
    'VVVVVWF_______FWVVVV',
    'VVVVVWFF_____FFWVVVV',
    'VVVVVVWFF___FFWVVVVV',
    'VVVVVVVWFF^FFWVVVVVV',
  ],
  objects: [
    // Stairs down → 灯台の塔 5F: lands on the tile below 5F's up-stairs (21, 2), facing
    // away from them.
    {
      type: 'warp',
      x: 10,
      y: 13,
      target_map: 'map_lighthouse_5f',
      target_x: 21,
      target_y: 3,
      facing: 'down',
    },
    // The throat: the confrontation fires on every crossing until ノクス is down (§13 #19).
    {
      type: 'trigger',
      x: 8,
      y: 8,
      w: 5,
      h: 1,
      event_id: 'ev_lighthouse_top',
      once: false,
      condition: '!main.nox_defeated',
    },
    // ノクス in front of the dead lamp, gone once beaten (§4.5)
    {
      type: 'npc',
      x: 10,
      y: 4,
      id: 'npc_nox_top',
      dialog: 'dlg_nox_top_idle',
      facing: 'down',
      sprite: 'sprite_npc',
      hidden_if: 'main.nox_defeated',
    },
  ],
};
