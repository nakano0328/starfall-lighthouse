import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the abandoned mine: `#` is the unexcavated rock mass, `w` the brick-lined
 * edge of every tunnel, `_` the stone floor. `=` is a minecart rail laid on the floor
 * (walkable decoration), `R` rubble on the floor, `o` an ore vein in a wall, `l` a
 * lantern post and `S` the ladder tile down to B2.
 */
const MINE_LEGEND: Legend = {
  '#': 'void',
  w: 'wall',
  _: 'floor_stone',
  '=': { ground: 'floor_stone', deco: 'rail' },
  R: { ground: 'floor_stone', deco: 'rock' },
  o: 'ore',
  l: 'lantern',
  S: 'stairs',
  D: 'door',
};

/**
 * 廃坑 B1 (40x35). Chapter 2 dungeon north of 鉱山町ハガネ (§3.1): the first level of
 * the sealed mine, entered through the door on the south edge (20, 34). The locked door
 * (`it_key_mine`) belongs to the town side of the warp.
 *
 * The main rail runs north from the entry hall (y29-33) up the south corridor into the
 * central chamber (y15-21, two symbols), where it forks (decorative, §3.1):
 *
 * - west along y18 down a dead-end spur past the connector (x8-9, y16) into the west
 *   chamber (x2-10, y10-15, one symbol, `chest.mine_b1_01`),
 * - east along y18 to the east shaft (x33-34), which climbs to the ladder chamber and
 *   passes the alcove with `chest.mine_b1_03`,
 * - north up the x20 corridor into the north gallery (x13-27, y3-8, one symbol,
 *   `chest.mine_b1_02`), whose east passage (y5-6) also reaches the ladder chamber.
 *
 * The gallery route and the shaft route form a loop, so the symbols in the central
 * chamber and the gallery can be bypassed. The ladder chamber (x31-37, y2-7) holds the
 * lantern-flanked ladder down to B2 at (36, 4); B2's ladder up lands on (36, 5).
 */
export const map_mine_b1: MapSource = {
  meta: {
    id: 'map_mine_b1',
    displayName: '廃坑 B1',
    kind: 'dungeon',
    bgmKey: 'bgm_mine',
    battleBgKey: 'bg_mine',
    encounterGroups: ['grp_mine_a', 'grp_mine_b'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 20, y: 33, facing: 'up' },
    canSaveAnywhere: false,
  },
  width: 40,
  height: 35,
  legend: MINE_LEGEND,
  tiles: [
    '########################################',
    '##############################wwwwwwwww#',
    '############wwwwwwwwwwwowwwww#w_______w#',
    '############w_______________w#w_______w#',
    '############o_______=_______www____lSlw#',
    '############w_______=_____________=___o#',
    '############w_______=======_______=___w#',
    '############w_______=__R____www_R_=___w#',
    '############w_l_____=_____l_w#www_=wwww#',
    '#wwwwwwwwwwwwwwwwwww=_wwwwwww###w_=w####',
    '#w_________w#######w=_w#########w_=wwww#',
    '#w_________o#######w=_w#########w_=___o#',
    '#o_________w#######w=_w#########w_=___o#',
    '#o_________w#######w=_w#########w_=wwww#',
    '#w__R______w#wwwwwww=_wwwwww####w_=w####',
    '#w_________w#w______=______w####w_=o####',
    '#wwwwwww__wwww_R____=______wwwwww_=w####',
    '######w_____R_______=_________R___=w####',
    '######o============================w####',
    '######wwwwwwww______=______wwwwwwwww####',
    '#############w______=____R_o############',
    '#############w_____l=_l____w############',
    '#############wwwowww=_wwwwww############',
    '###################w=_w#################',
    '###################w=_w#################',
    '###################w=_w#################',
    '###################w=_w#################',
    '###################w=_w#################',
    '################wwww=_www###############',
    '################w___=___w###############',
    '################w___=___w###############',
    '################w___=___w###############',
    '################w_______w###############',
    '################wl_____lw###############',
    '################wwwwDwwww###############',
  ],
  objects: [
    // South door → 鉱山町ハガネ: lands on the tile in front of the town's north gate
    // warp (18, 0), facing away from it.
    {
      type: 'warp',
      x: 20,
      y: 34,
      target_map: 'map_hagane_town',
      target_x: 18,
      target_y: 1,
      facing: 'down',
    },
    // Ladder down → 廃坑 B2: lands below B2's ladder-up tile (36, 4), facing away from it.
    {
      type: 'warp',
      x: 36,
      y: 4,
      target_map: 'map_mine_b2',
      target_x: 36,
      target_y: 5,
      facing: 'down',
    },
    // Entrance sign
    { type: 'sign', x: 22, y: 33, text_id: 'dlg_sign_mine_b1' },
    // West chamber, north gallery and the shaft alcove
    { type: 'chest', x: 3, y: 10, item_id: 'it_potion_s', qty: 2, flag: 'chest.mine_b1_01' },
    { type: 'chest', x: 13, y: 3, item_id: 'it_numb_herb', qty: 2, flag: 'chest.mine_b1_02' },
    { type: 'chest', x: 37, y: 11, item_id: 'gold', qty: 150, flag: 'chest.mine_b1_03' },
    // Normal symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the entrance
    { type: 'enemy', x: 16, y: 17, group_id: 'grp_mine_a', respawn_sec: 60, radius: 3 },
    {
      type: 'enemy',
      x: 24,
      y: 19,
      group_id: 'grp_mine_a,grp_mine_b',
      respawn_sec: 60,
      radius: 3,
    },
    { type: 'enemy', x: 6, y: 12, group_id: 'grp_mine_a', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 18, y: 5, group_id: 'grp_mine_a', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 33, y: 5, group_id: 'grp_mine_b', respawn_sec: 60, radius: 3 },
  ],
};
