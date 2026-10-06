import type { Legend, MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * 学者のキャンプ (20x15, docs/GAME_DESIGN.md §3.1). A small camp on a sandy terrace
 * above 沈んだ遺跡, with the sea along the east edge. Cliffs close the north and south
 * sides; 磯の道 comes in through the gap at (10,0) and the ruins' entrance lies through
 * the gap at (10,14), between the broken pillars (rows 11-13) of the ruins' old gate.
 *
 * - The tent (roof_blue canopy at x2-5 y3 over a wall row at y4) is run by
 *   npc_camp_assistant at (3,5): the night's rest (inn_price 60, §3.1).
 * - npc_ruins_scholar works at his crates at (12,5), facing the campfire (lantern, (9,6)).
 *   His head markers follow sq_old_chart (§14) like the smith's in ハガネ.
 * - npc_merchant_camp sits between two crates at (7,9) (shop_camp, §7.5).
 * - The save point stands by the fire at (13,8); the sign at (12,2) greets arrivals.
 *
 * No encounters (§3.1); the save point is the only save spot here.
 */
const CAMP_LEGEND: Legend = {
  ...OUTDOOR_LEGEND,
  /** Tent canopy, drawn over the player. */
  n: { ground: 'sand', above: 'roof_blue' },
  /** Campfire. */
  l: { ground: 'sand', deco: 'lantern' },
  /** Supply crate. */
  x: { ground: 'sand', deco: 'table' },
  /** Boulder / rubble on the sand. */
  o: { ground: 'sand', deco: 'rock' },
  /** Broken pillar stub of the ruins' gate. */
  P: { ground: 'sand', deco: 'wall' },
};

export const map_ruins_camp: MapSource = {
  meta: {
    id: 'map_ruins_camp',
    displayName: '学者のキャンプ',
    kind: 'field',
    bgmKey: 'bgm_ruins',
    battleBgKey: 'bg_ruins',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 10, y: 1, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 20,
  height: 15,
  legend: CAMP_LEGEND,
  tiles: [
    'cccccccccc=ccccccccc',
    'c:::::::::::::::~~WW',
    'c::o::::::::::::~~WW',
    'c:nnnn:::::::::o~~WW',
    'c:wwww:::::::::::~WW',
    'c::::::::::::xx::~WW',
    'c::::::::l::::::::~W',
    'c:::::::o:::::::::~W',
    'c:::::::::::::::::~W',
    'c:::::x:x:::::::::~W',
    'c:::::::::::::o:::~W',
    'c::::::P::=::P::::~W',
    'cc::::o:::=:::o:::cc',
    'cc::P:::P:=:P:::P:cc',
    'cccccccccc=ccccccccc',
  ],
  objects: [
    // North edge → 磯の道. Lands on (20,18), the tile in front of the road's south exit
    // (20,19), facing up the road; that exit warps back onto this map's entrance (10,1).
    {
      type: 'warp',
      x: 10,
      y: 0,
      target_map: 'map_shore_path',
      target_x: 20,
      target_y: 18,
      facing: 'up',
    },
    // South edge → 沈んだ遺跡 上層. Lands on its entrance (22,1) in front of its north
    // warp (22,0), which returns to (10,13) right above this tile, facing up.
    {
      type: 'warp',
      x: 10,
      y: 14,
      target_map: 'map_sunken_ruins_1f',
      target_x: 22,
      target_y: 1,
      facing: 'down',
    },
    // ---- camp folk --------------------------------------------------------------
    // The scholar at his crates. Head markers follow sq_old_chart (§14): nothing once
    // rewarded, 「？」 while the chart is in hand, 「！」 while the quest runs or can be
    // taken (after he has taught the tide rune, §13 #12).
    {
      type: 'npc',
      x: 12,
      y: 5,
      id: 'npc_ruins_scholar',
      dialog: 'dlg_ruins_scholar',
      facing: 'down',
      sprite: 'sprite_npc',
      markers: [
        { if: 'sq.chart==2', text: '' },
        { if: 'item.it_old_chart>=1', text: '？' },
        { if: 'sq.chart==1', text: '！' },
        { if: 'ruins.tide_learned', text: '！' },
      ],
    },
    // The merchant between his crates.
    {
      type: 'npc',
      x: 7,
      y: 9,
      id: 'npc_merchant_camp',
      dialog: 'dlg_camp_merchant',
      facing: 'down',
      sprite: 'sprite_npc',
      shop: 'shop_camp',
    },
    // The assistant in front of the tent: a night's rest for 60G (§3.1).
    {
      type: 'npc',
      x: 3,
      y: 5,
      id: 'npc_camp_assistant',
      dialog: 'dlg_camp_assistant',
      facing: 'down',
      sprite: 'sprite_npc',
      inn_price: 60,
    },
    // ---- sign, save point -------------------------------------------------------
    { type: 'sign', x: 12, y: 2, text_id: 'dlg_sign_camp' },
    { type: 'save_point', x: 13, y: 8 },
  ],
};
