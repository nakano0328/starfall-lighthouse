import type { Legend, MapSource } from '@core/map/source';

/**
 * Legend for the deepest mine level: stone floor and rock mass, a cart rail laid over
 * the floor (`=`, walkable), raw ore in the rock (`o`, solid), lanterns, loose rocks and
 * the rune circle the golem sleeps on. `^` is the ladder up (a stairs tile).
 */
const MINE_B3_LEGEND: Legend = {
  _: 'floor_stone',
  w: 'wall',
  '=': { ground: 'floor_stone', deco: 'rail' },
  o: 'ore',
  l: 'lantern',
  R: { ground: 'floor_stone', deco: 'rock' },
  '*': 'rune_floor',
  '^': 'stairs',
};

/**
 * 廃坑 B3 (40x35). The bottom of the mine (§3.1): the ladder from B2 lands in the
 * entrance hall at the south-west (x2-7, y27-32), where the sign stands. A rail tunnel
 * (y28-30) runs east and the track climbs a five-wide shaft (x22-26, y21-27, one symbol)
 * into the great cavern (y13-20) where it ends at a derailed cart. The cavern holds three
 * more symbols, `chest.mine_b3_01` in its north-east corner and, through the gap at
 * (8, 17), the vein chamber (x2-7, y14-19): the glittering ore cluster in its north wall
 * is the `trigger` `ev_mine_vein` (§14 `sq_shining_ore`, once ゴロー has joined) with
 * `chest.mine_b3_03` beside it.
 *
 * The lantern-flanked doorway at (30, 12) leads up into the antechamber (y8-11) with the
 * boss-side save point and `chest.mine_b3_02` (fire stones: the golem is weak to fire,
 * §8.4). The boss chamber (y1-6) lies beyond the doorway at (30, 7): the `trigger` on the
 * doorway plays `ev_mine_boss_intro` before contact (§5.12) and 岩のゴーレム
 * (`grp_boss_golem`) waits three tiles further north on the rune circle, never respawning
 * once `mine.boss_defeated` is set (§8.4, §13 #10).
 */
export const map_mine_b3: MapSource = {
  meta: {
    id: 'map_mine_b3',
    displayName: '廃坑 B3',
    kind: 'dungeon',
    bgmKey: 'bgm_mine',
    battleBgKey: 'bg_mine',
    encounterGroups: ['grp_mine_c', 'grp_mine_d'],
    tilesets: ['ts_placeholder'],
    entrance: { x: 4, y: 29, facing: 'up' },
    canSaveAnywhere: false,
  },
  width: 40,
  height: 35,
  legend: MINE_B3_LEGEND,
  tiles: [
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwww_______________ww',
    'wwwwwwwwwwwwwwwwwwwwwww_______________ww',
    'wwwwwwwwwwwwwwwwwwwwwww_____*___*_____ww',
    'wwwwwwwwwwwwwwwwwwwwwww____*__*__*____ww',
    'wwwwwwwwwwwwwwwwwwwwwww_____*___*_____ww',
    'wwwwwwwwwwwwwwwwwwwwwww_______________ww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwl_lwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwwwwl___________lwww',
    'wwwwwwwwwwwwwwwwwwwwwwww_____________www',
    'wwwwwwwwwwwwwwwwwwwwwwww_____________www',
    'wwwwwwwwwwwwwwwwwwwwwwww_____________www',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwl_lwwwwwwww',
    'wwwoooowwwww______________________wwwwww',
    'ww__oo__wwo_______________________owwwww',
    'ww______w___________________________wwww',
    'ww______w_____RR____________________wwww',
    'ww______________________R___________wwww',
    'ww______w_______________=____R______wwww',
    'ww______wo______________=___________wwww',
    'wwwwwwwww_______________=___________wwww',
    'wwwwwwwwwwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'ww______wwwwwwwwwwwwww__=__wwwwwwwwwwwww',
    'ww______________________=__wwwwwwwwwwwww',
    'ww______=================__wwwwwwwwwwwww',
    'ww__^______________________wwwwwwwwwwwww',
    'ww______wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwl____lwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww',
  ],
  objects: [
    // Ladder up → 廃坑 B2: lands at the foot of B2's ladder down, facing away from it.
    {
      type: 'warp',
      x: 4,
      y: 30,
      target_map: 'map_mine_b2',
      target_x: 4,
      target_y: 29,
      facing: 'up',
    },
    // Entrance sign
    { type: 'sign', x: 6, y: 28, text_id: 'dlg_sign_mine_b3' },
    // Vein chamber: the ore cluster ゴロー digs (§14 sq_shining_ore), plus the gold chest
    {
      type: 'trigger',
      x: 4,
      y: 15,
      event_id: 'ev_mine_vein',
      once: true,
      condition: 'hagane.goro_joined',
    },
    { type: 'chest', x: 7, y: 14, item_id: 'gold', qty: 300, flag: 'chest.mine_b3_03' },
    // Great cavern: the potion chest in the north-east corner
    { type: 'chest', x: 33, y: 13, item_id: 'it_potion_m', qty: 1, flag: 'chest.mine_b3_01' },
    // Antechamber: boss-side save point (§3.1) and fire stones for the golem (§8.4)
    { type: 'save_point', x: 27, y: 9 },
    { type: 'chest', x: 34, y: 9, item_id: 'it_fire_stone', qty: 2, flag: 'chest.mine_b3_02' },
    // Boss doorway: intro talk before contact (§5.12), skipped once the boss is down
    {
      type: 'trigger',
      x: 30,
      y: 7,
      event_id: 'ev_mine_boss_intro',
      once: true,
      condition: '!mine.boss_defeated',
    },
    // 岩のゴーレム on the rune circle, three tiles past the doorway (§8.4)
    {
      type: 'enemy',
      x: 30,
      y: 4,
      group_id: 'grp_boss_golem',
      respawn_sec: -1,
      radius: 0,
      defeated_flag: 'mine.boss_defeated',
    },
    // Normal symbols (§5.12): wander radius 3, respawn 60 s, 6+ tiles from the entrance
    { type: 'enemy', x: 24, y: 24, group_id: 'grp_mine_c,grp_mine_d', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 18, y: 19, group_id: 'grp_mine_c', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 13, y: 15, group_id: 'grp_mine_c', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 21, y: 14, group_id: 'grp_mine_d', respawn_sec: 60, radius: 3 },
    { type: 'enemy', x: 31, y: 17, group_id: 'grp_mine_d', respawn_sec: 60, radius: 3 },
  ],
};
