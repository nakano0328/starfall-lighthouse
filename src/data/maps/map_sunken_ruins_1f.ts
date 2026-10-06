import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the sunken ruins: stone floor and sand, the sea (`W`, solid) beyond the
 * walls, a wooden pier (`p`), broken pillars (`R`, solid), lanterns, rune floor and the
 * tide steles (`s`, solid blue stone). `S` is a flight of stairs down to the lower floor.
 *
 * The last two entries are tide-only (docs/GAME_DESIGN.md §3.2): `~` is the water that
 * floods a cell in the `high` grid and `F` the fence that rises in the `low` grid. They
 * carry no ground tile, so they can only appear in the tide grids.
 */
const RUINS_LEGEND: Legend = {
  _: 'floor_stone',
  ':': 'sand',
  '*': 'rune_floor',
  w: 'wall',
  W: 'deep_water',
  p: 'pier',
  S: 'stairs',
  l: 'lantern',
  R: { ground: 'floor_stone', deco: 'rock' },
  s: { ground: 'floor_stone', deco: 'stele' },
  '~': { deco: 'water' },
  F: { deco: 'fence' },
};

/**
 * 沈んだ遺跡 上層 (45x35). The chapter 3 dungeon under 学者のキャンプ (§3.1), ruled by
 * the tide gimmick of §3.2: `ruins.tide` starts at `high` and every 潮の石碑 toggles it.
 *
 * - **Vestibule** (x14-30, y1-6): always dry. The north edge tile (22, 0) leads back to
 *   the camp; the entrance sign and the save point stand beside the way in. Stele A at
 *   (20, 3) is examined from (20, 4) facing up. The throat (x21-23, y7-8) opens south
 *   into the hall and is never flooded itself.
 * - **North passage**: the opening at (31, 3)-(31, 4) in the vestibule's east wall leads
 *   along a corridor (y3-4) into the east room (x37-42, y2-9) with stairs #1 at (41, 6)
 *   down to the lower floor's main area (its stairs up land on (41, 7)). At low tide the
 *   fence of the `low` grid rises in the opening and seals the passage off, so stele B
 *   at (41, 9), examined from (41, 8) facing down, lets a player who comes up at low tide
 *   raise the tide and get out. A pier (x33-35, y1-2) juts north into the sea from the
 *   corridor and holds `chest.ruins_1f_02`.
 * - **Central hall** (x11-33, y9-21): under water at high tide (the `high` grid floods
 *   every floor cell), open at low tide with `chest.ruins_1f_01` in its north-west corner,
 *   a rune circle around (22, 15), broken pillars and two low-tide symbols.
 * - **East channel and ledge**: from the hall's south-east opening (34, 19)-(34, 20) a
 *   channel (x35-41, y19-20, then x39-41, y21-27) runs east and south; it is water at high
 *   tide too. It ends on a dry ledge (x36-42, y28-32) with stairs #2 at (42, 31) down to
 *   the lower floor's chest room (its stairs up land on (42, 32)), `chest.ruins_1f_03` and
 *   the last low-tide symbol. The ledge is dry at every tide but only reachable at low tide.
 *
 * Routes: at high tide (22, 1) → down to (22, 3) → right to (41, 3) → down to (41, 6);
 * at low tide (22, 1) → down to (22, 20) → right to (40, 20) → down to (40, 31) → right
 * to (42, 31). Symbols (§5.12) spawn only at their own tide and never on flooded cells.
 */
export const map_sunken_ruins_1f: MapSource = {
  meta: {
    id: 'map_sunken_ruins_1f',
    displayName: '沈んだ遺跡 上層',
    kind: 'dungeon',
    bgmKey: 'bgm_ruins',
    battleBgKey: 'bg_ruins',
    encounterGroups: ['grp_ruins_a', 'grp_ruins_b', 'grp_ruins_c'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 22, y: 1, facing: 'down' },
    canSaveAnywhere: false,
    tideAware: true,
  },
  width: 45,
  height: 35,
  legend: RUINS_LEGEND,
  tiles: [
    'WWWWWWWWWWWWwwwwwwwwww_wwwwwwwwwWWWWWWWWWWWWW',
    'WWWWWWWWWWWWwwl_______________lwWpppWwwwwwwwW',
    'WWWWWWWWWWWWww_____***_________wWpppWl_____wW',
    'WWWWWWWWWWWWww_____*s*_____________________wW',
    'WWWWWWWWWWWWww_____*_*_____________________wW',
    'WWWWWWWWWWWWww__R___________R__wwwwww______wW',
    'WWWWWWWWWWWWwwl_______________lwwwwww____S_wW',
    'WWWWWWWWWwwwwwwwwwwww___wwwwwwwwwwwww_____*wW',
    'WWWWWWWWWwwwwwwwwwwww___wwwwwwwwwwwww______wW',
    'WWWWWWWWWwwl:::::::::::::::::::::lwwwl__*s*wW',
    'WWWWWWWWWww:::::::::::::::::::::::wwwwwwwwwwW',
    'WWWWWWWWWww:::::::::::::::::::::::wwwwwwwwwwW',
    'WWWWWWWWWww:::R:::::::::::::::R:::wwWWWWWWWWW',
    'WWWWWWWWWww:::::::::::*:::::::::::wwWWWWWWWWW',
    'WWWWWWWWWww::::::::::***::::::::::wwWWWWWWWWW',
    'WWWWWWWWWww:::::::::*****:::::::::wwWWWWWWWWW',
    'WWWWWWWWWww::::::::::***::::::::::wwWWWWWWWWW',
    'WWWWWWWWWww:::::::::::*:::::::::::wwwwwwwwwwW',
    'WWWWWWWWWww:::R:::::::::::::::R:::wwwwwwwwwwW',
    'WWWWWWWWWww:::::::::::::::::::::::::::::::wwW',
    'WWWWWWWWWww:::::::::::::::::::::::::::::::wwW',
    'WWWWWWWWWwwl:::::::::::::::::::::lwwwww:::wwW',
    'WWWWWWWWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwww:::wwW',
    'WWWWWWWWWwwwwwwwwwwwwwwwwwwwwwwwwwwwwww:::wwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWww:::wwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWww:::wwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwwwww:::wwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwwwww:::wwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWww______lwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWww_______wW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWww_____*_wW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWww______SwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwwl____*_wW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWwwwwwwwwwwW',
    'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW',
  ],
  // §3.2: the hall and the east channel are under water at high tide; at low tide the
  // fence rises in the north passage's opening instead.
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
      '                                             ',
      '            ~~~~~~~~~~~~~~~~~~~~~            ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~ ~~~~~~~~~~~~~~~ ~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~           ',
      '           ~~~ ~~~~~~~~~~~~~~~ ~~~           ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   ',
      '           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~   ',
      '            ~~~~~~~~~~~~~~~~~~~~~      ~~~   ',
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
    ],
    low: [
      '                                             ',
      '                                             ',
      '                                             ',
      '                               F             ',
      '                               F             ',
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
    // North edge → 学者のキャンプ: lands in front of the camp's south exit, facing away from it.
    {
      type: 'warp',
      x: 22,
      y: 0,
      target_map: 'map_ruins_camp',
      target_x: 10,
      target_y: 13,
      facing: 'up',
    },
    // Vestibule: the entrance sign and the save point (§3.1)
    { type: 'sign', x: 24, y: 2, text_id: 'dlg_sign_ruins_entrance' },
    { type: 'save_point', x: 17, y: 2 },
    // Stele A (§3.2), examined from (20, 4) facing up. Two stacked examine-triggers: the
    // first whose condition holds fires, so the stele only toggles the tide once the
    // scholar has taught the party to read it (§13 #12).
    {
      type: 'trigger',
      x: 20,
      y: 3,
      event_id: 'ev_ruins_stele_unreadable',
      once: false,
      condition: '!ruins.tide_learned',
      interact: true,
    },
    {
      type: 'trigger',
      x: 20,
      y: 3,
      event_id: 'ev_ruins_tide_toggle',
      once: false,
      condition: 'ruins.tide_learned',
      interact: true,
    },
    // North passage: the quake stones on the pier, the high-tide symbol in the east room
    {
      type: 'chest',
      x: 34,
      y: 1,
      item_id: 'it_quake_stone',
      qty: 2,
      flag: 'chest.ruins_1f_02',
      tide: 'any',
    },
    {
      type: 'enemy',
      x: 38,
      y: 7,
      group_id: 'grp_ruins_a,grp_ruins_b',
      respawn_sec: 60,
      radius: 3,
      tide: 'high',
    },
    // Stairs #1 → 沈んだ遺跡 下層 (main area): lands on the tile below B1's stairs up.
    {
      type: 'warp',
      x: 41,
      y: 6,
      target_map: 'map_sunken_ruins_b1',
      target_x: 3,
      target_y: 3,
      facing: 'down',
    },
    // Stele B beside stairs #1, examined from (41, 8) facing down: the way out of the
    // passage for a player who comes up the stairs at low tide.
    {
      type: 'trigger',
      x: 41,
      y: 9,
      event_id: 'ev_ruins_stele_unreadable',
      once: false,
      condition: '!ruins.tide_learned',
      interact: true,
    },
    {
      type: 'trigger',
      x: 41,
      y: 9,
      event_id: 'ev_ruins_tide_toggle',
      once: false,
      condition: 'ruins.tide_learned',
      interact: true,
    },
    // Central hall (low tide only): the potion chest in the north-west corner, two symbols
    {
      type: 'chest',
      x: 12,
      y: 10,
      item_id: 'it_potion_m',
      qty: 2,
      flag: 'chest.ruins_1f_01',
      tide: 'low',
    },
    {
      type: 'enemy',
      x: 17,
      y: 13,
      group_id: 'grp_ruins_a',
      respawn_sec: 60,
      radius: 3,
      tide: 'low',
    },
    {
      type: 'enemy',
      x: 27,
      y: 18,
      group_id: 'grp_ruins_b,grp_ruins_c',
      respawn_sec: 60,
      radius: 3,
      tide: 'low',
    },
    // East ledge (reached through the channel at low tide): gold, a symbol and stairs #2
    {
      type: 'chest',
      x: 36,
      y: 29,
      item_id: 'gold',
      qty: 500,
      flag: 'chest.ruins_1f_03',
      tide: 'low',
    },
    {
      type: 'enemy',
      x: 38,
      y: 30,
      group_id: 'grp_ruins_c',
      respawn_sec: 60,
      radius: 3,
      tide: 'low',
    },
    // Stairs #2 → 沈んだ遺跡 下層 (chest room): lands on the tile below B1's stairs up.
    {
      type: 'warp',
      x: 42,
      y: 31,
      target_map: 'map_sunken_ruins_b1',
      target_x: 42,
      target_y: 31,
      facing: 'down',
    },
  ],
};
