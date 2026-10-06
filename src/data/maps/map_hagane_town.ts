import type { Legend, MapSource } from '@core/map/source';

import { OUTDOOR_LEGEND } from './legends';

/**
 * 鉱山町ハガネ (36x28, docs/GAME_DESIGN.md §3.1). A mining town on a slope: cliffs
 * close the top, an upper terrace (rows 2-7) sits above a cliff ledge (row 8) with
 * stairs at x2 and at the main street, and the lower town spreads out below it.
 *
 * Streets: the north street (x17-19) carries the mine rail (x18) from the mine gate
 * at (18,0) down to the crossroads (17-19, 14-15); the west road (rows 14-15) comes in
 * through the west gate at x0; the south street (x17-19) ends at a one-tile gap in the
 * fences at (18,25) where npc_hagane_south_guard stands until `fragments.count>=2`
 * (§13 #10), with the south gate at (18,27) behind him.
 *
 * Houses: ゴローの家 on the terrace (door (12,6)), 宿屋「つるはし」 west of the street
 * (door (6,12)), かじや east of the rail (door (23,12)); two more houses without doors
 * (the elder's on the terrace, one in the south-east and one in the south-west).
 * The star drop chest hides in the fenced back alley behind Goro's house at (10,2).
 */
const HAGANE_LEGEND: Legend = {
  ...OUTDOOR_LEGEND,
  /** Mine rail laid along the street. */
  '|': { ground: 'path', deco: 'rail' },
  /** Steps through the terrace cliff. */
  '^': 'stairs',
};

export const map_hagane_town: MapSource = {
  meta: {
    id: 'map_hagane_town',
    displayName: '鉱山町ハガネ',
    kind: 'town',
    bgmKey: 'bgm_village',
    battleBgKey: 'bg_mine',
    encounterGroups: [],
    tilesets: ['ts_placeholder'],
    entrance: { x: 1, y: 14, facing: 'right' },
    canSaveAnywhere: true,
  },
  width: 36,
  height: 28,
  legend: HAGANE_LEGEND,
  tiles: [
    'cccccccccccccccccwDwcccccccccccccccc',
    'ccccccccccccccccc=|=cccccccccccccccc',
    'c........F.......=|=...............c',
    'c.........rrrrrr.=|=..bbbbbb.......c',
    'c...R.....rrrrrr.=|=..bbbbbb...R...c',
    'c.........wwwwww.=|=..wwwwww.......c',
    'c..f......wwDwww.=|=..wwwwww....f..c',
    'c................=|=...............c',
    'cc^cccccccccccccc^|^cccccccccccccccc',
    'T...bbbbbb.......=|=.rrrrrr........T',
    'T...bbbbbb.......=|=.rrrrrr........T',
    'T...wwwwww.......=|=.wwwwww..T.....T',
    'T...wwDwww.......=|=.wwDwww........T',
    'TFF..............=|=...............T',
    '===============================....T',
    '===============================....T',
    'TFF..............===...............T',
    'T................===...............T',
    'T....rrrrrr......===.......bbbbbb..T',
    'T....rrrrrr......===.......bbbbbb..T',
    'T....wwwwww......===.......wwwwww..T',
    'T....wwwwww......===.......wwwwww..T',
    'T..R.............===..........R....T',
    'T................===...............T',
    'T.....T..........===.........T.....T',
    'TTTTTTTTTTTTTTFFFF=FFFFTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTT TTTT=TTTTTTTTTTTTTTTTT'.replace(' ', ''),
    'TTTTTTTTTTTTTTTTTT=TTTTTTTTTTTTTTTTT',
  ],
  objects: [
    // ---- gates ---------------------------------------------------------------
    // West gate → 山道. Its east exit is at (39, 4) h2, so the player lands on the
    // tile in front of it; the road warps back to this map's entrance (1, 14).
    {
      type: 'warp',
      x: 0,
      y: 14,
      h: 2,
      target_map: 'map_mountain_road',
      target_x: 38,
      target_y: 4,
      facing: 'left',
    },
    // North gate → 廃坑 B1, locked until it_key_mine is used (§3.1, §9.2).
    {
      type: 'warp',
      x: 18,
      y: 0,
      target_map: 'map_mine_b1',
      target_x: 20,
      target_y: 33,
      facing: 'up',
      required_item: 'it_key_mine',
      locked_text_id: 'dlg_mine_door_locked',
      door_flag: 'door.hagane_mine_01',
    },
    // South gate → 磯の道.
    // TODO(Phase 4c): map_shore_path — retarget to its north edge facing 'down' once it
    // exists. Until then the exit bounces the player back onto the tile before it, facing
    // away from the warp so the next step does not warp again (as the forest's north-east
    // exit does). npc_hagane_south_guard seals the gap in front of it until §13 #10.
    {
      type: 'warp',
      x: 18,
      y: 27,
      target_map: 'map_hagane_town',
      target_x: 18,
      target_y: 26,
      facing: 'up',
    },
    // ---- doors ---------------------------------------------------------------
    {
      type: 'warp',
      x: 12,
      y: 6,
      target_map: 'map_hagane_goro_house',
      target_x: 5,
      target_y: 8,
      facing: 'up',
    },
    {
      type: 'warp',
      x: 6,
      y: 12,
      target_map: 'map_hagane_inn',
      target_x: 6,
      target_y: 8,
      facing: 'up',
    },
    {
      type: 'warp',
      x: 23,
      y: 12,
      target_map: 'map_hagane_shop',
      target_x: 7,
      target_y: 8,
      facing: 'up',
    },
    // ---- events --------------------------------------------------------------
    // First visit sets hagane.arrived (§13 #8); covers both west entrance tiles.
    { type: 'trigger', x: 1, y: 14, h: 2, event_id: 'ev_hagane_arrive', once: true },
    // ---- townsfolk -----------------------------------------------------------
    // Blocks the one-tile gap in the fences before the south gate until the second fragment.
    {
      type: 'npc',
      x: 18,
      y: 25,
      id: 'npc_hagane_south_guard',
      dialog: 'dlg_hagane_south_guard',
      facing: 'down',
      sprite: 'sprite_npc',
      hidden_if: 'fragments.count>=2',
    },
    // The elder looks down over the town from the terrace, in front of his house.
    {
      type: 'npc',
      x: 24,
      y: 7,
      id: 'npc_hagane_elder',
      dialog: 'dlg_hagane_elder',
      facing: 'down',
      sprite: 'sprite_npc',
    },
    // Wanders the open square east of the crossroads.
    {
      type: 'npc',
      x: 24,
      y: 16,
      id: 'npc_hagane_miner_a',
      dialog: 'dlg_hagane_miner_a',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'random',
    },
    // Stares at the rail that leads up to the sealed mine.
    {
      type: 'npc',
      x: 20,
      y: 5,
      id: 'npc_hagane_miner_b',
      dialog: 'dlg_hagane_miner_b',
      facing: 'left',
      sprite: 'sprite_npc',
    },
    // Wanders the open square between the inn and the south-west house.
    {
      type: 'npc',
      x: 13,
      y: 17,
      id: 'npc_hagane_child',
      dialog: 'dlg_hagane_child',
      facing: 'down',
      sprite: 'sprite_npc',
      move: 'random',
    },
    {
      type: 'npc',
      x: 30,
      y: 12,
      id: 'npc_hagane_woman',
      dialog: 'dlg_hagane_woman',
      facing: 'down',
      sprite: 'sprite_npc',
    },
    // ---- signs, save point, chest -------------------------------------------
    { type: 'sign', x: 16, y: 13, text_id: 'dlg_sign_hagane' },
    { type: 'save_point', x: 11, y: 11 },
    { type: 'chest', x: 10, y: 2, item_id: 'it_star_drop', qty: 1, flag: 'chest.hagane_01' },
  ],
};
