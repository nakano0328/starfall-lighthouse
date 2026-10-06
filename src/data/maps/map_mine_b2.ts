import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the mine: stone floors and rock mass only, no outdoor tiles. `=` is a
 * cart rail laid over the floor (walkable), `o` an ore vein and `R` fallen rock
 * (both solid), `~` the standing water of the flooded gallery (solid), `S` a ladder.
 */
const MINE_LEGEND: Legend = {
  _: 'floor_stone',
  w: 'wall',
  '=': { ground: 'floor_stone', deco: 'rail' },
  o: { ground: 'floor_stone', deco: 'ore' },
  l: 'lantern',
  R: { ground: 'floor_stone', deco: 'rock' },
  '~': 'water',
  S: 'stairs',
};

/**
 * 廃坑 B2 (40x35). Second level of the abandoned mine (§3.1), between B1 and B3.
 * The ladder from B1 comes down into the north-east chamber (x32-38, y2-8); the
 * ladder on to B3 is in the small alcove at the south-west corner (x3-6, y27-30).
 *
 * The level is a chain of galleries joined by collapsed tunnels, so every route
 * passes through the flooded gallery once:
 *
 * - The west tunnel out of the entrance chamber (y5-6) has caved in at x24-26, so
 *   the player must take the south shaft (x35-36, y9-12) into the east gallery
 *   (x28-37, y13-19, `chest.mine_b2_01`).
 * - A rail tunnel (y15-16) leads west into the flooded gallery (x9-22, y11-21):
 *   standing water with a winding dry path. The sign at the entrance warns about it.
 * - From its north wall a shaft (x18-19, y7-10) climbs back to the far side of the
 *   cave-in and on to the north-west chamber (x2-14, y2-8, `chest.mine_b2_03` with
 *   the かがやき鉱石), a dead end.
 * - From its south wall a passage (x13-14, y22-24) drops into the lower gallery
 *   (x8-30, y25-30), cut in half by a rockfall at x18-19 that leaves only the
 *   southern rows open (`chest.mine_b2_04`), and on to the B3 ladder.
 * - The vault (x32-37, y24-29, `chest.mine_b2_02` with こうふのバッジ) sits beside the
 *   lower gallery, but the direct opening at (31, 27) has collapsed: the way in is
 *   the crawl tunnel under the gallery (y31-33) that climbs into the vault at x36-37.
 */
export const map_mine_b2: MapSource = {
  meta: {
    id: 'map_mine_b2',
    displayName: '廃坑 B2',
    kind: 'dungeon',
    bgmKey: 'bgm_mine',
    battleBgKey: 'bg_mine',
    encounterGroups: ['grp_mine_b', 'grp_mine_c'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 36, y: 5, facing: 'down' },
    canSaveAnywhere: false,
  },
  width: 40,
  height: 35,
  legend: MINE_LEGEND,
  tiles: [
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwl__________o_wwwwwwwwwwwwwwwwwl______w',
    'ww____________owwwwwwwwwwwwwwwww_______w',
    'ww_____________wwwwwwwwwwwwwwwww____S__w',
    'ww______________________RRR____________w',
    'ww______________========RRR==========__w',
    'ww_____________www__wwwwwwwwwwww____=__w',
    'wwoo___________www__wwwwwwwwwwww____=_lw',
    'wwwwwwwwwwwwwwwwww__wwwwwwwwwwwwwww_=www',
    'wwwwwwwwwwwwwwwwww__wwwwwwwwwwwwwww_=www',
    'wwwwwwwww_____________lwwwwwwwwwwww_=www',
    'wwwwwwwww_~~~~____~~~~_wwwwwwwwwwww_=www',
    'wwwwwwwww_~~~~_____~~~_wwwwwoo______=_ww',
    'wwwwwwwww__~~___~____~_wwwww________=_ww',
    'wwwwwwwww~___~~~_______________R____=_ww',
    'wwwwwwwww~~___~~_______========R=====_ww',
    'wwwwwwwww~~~___________wwwww________=_ww',
    'wwwwwwwww_~~~~___~~____wwwww________=_ww',
    'wwwwwwwww___~~___~~~___wwwww________=oww',
    'wwwwwwwww~~____~__~~~~_wwwwwwwwwwwwwwwww',
    'wwwwwwwww~~~___~~__~~~~wwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwww__wwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwww__wwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwww__wwwwwwwwwwwwwwwwwloo___ww',
    'wwwwwwwwl_________RR___________w______ww',
    'wwwwwwww__________RR___________w______ww',
    'www____w==========RR===========R______ww',
    'www_______________RR___________w______ww',
    'www____________________________w______ww',
    'www_S__woo_____________________wwwww__ww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwww__wwwww__ww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwww_________ww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwww____o____ww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  ],
  objects: [
    // Ladder up → 廃坑 B1: lands on the tile below B1's ladder, facing away from it.
    {
      type: 'warp',
      x: 36,
      y: 4,
      target_map: 'map_mine_b1',
      target_x: 36,
      target_y: 5,
      facing: 'down',
    },
    // Ladder down → 廃坑 B3: lands on the tile above B3's ladder, facing away from it.
    {
      type: 'warp',
      x: 4,
      y: 30,
      target_map: 'map_mine_b3',
      target_x: 4,
      target_y: 29,
      facing: 'up',
    },
    // A miner's warning about the flooded gallery, beside the ladder
    { type: 'sign', x: 34, y: 5, text_id: 'dlg_sign_mine_b2' },
    // East gallery
    { type: 'chest', x: 37, y: 13, item_id: 'it_potion_s', qty: 2, flag: 'chest.mine_b2_01' },
    // Side vault (§7.4)
    {
      type: 'chest',
      x: 37,
      y: 24,
      item_id: 'eq_acc_miner_badge',
      qty: 1,
      flag: 'chest.mine_b2_02',
    },
    // North-west chamber, past the cave-in (§7.1 / §14 sq_shining_ore)
    { type: 'chest', x: 2, y: 3, item_id: 'it_shining_ore', qty: 1, flag: 'chest.mine_b2_03' },
    // Lower gallery
    { type: 'chest', x: 30, y: 25, item_id: 'gold', qty: 250, flag: 'chest.mine_b2_04' },
    // Symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the entrance
    { type: 'enemy', x: 33, y: 17, group_id: 'grp_mine_b', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 19, y: 17, group_id: 'grp_mine_c', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 8, y: 5, group_id: 'grp_mine_b', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 12, y: 28, group_id: 'grp_mine_c', respawn_sec: 60, radius: 3 },
    {
      type: 'enemy',
      x: 25,
      y: 28,
      group_id: 'grp_mine_b,grp_mine_c',
      respawn_sec: 60,
      radius: 3,
    },
    { type: 'enemy', x: 35, y: 27, group_id: 'grp_mine_b', respawn_sec: 60, radius: 3 },
  ],
};
