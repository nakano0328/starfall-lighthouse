import type { AiRule, AiTarget, DropDef, Element, EnemyDef, StatusKey } from './types';

/**
 * Enemy roster from docs/GAME_DESIGN.md §8.1 (14 normal enemies) and §8.4 (5 boss forms).
 *
 * AI tables follow §5.8: every normal enemy gets the default `attack(random) weight 60` rule
 * followed by the rows of its 固有行動 column; boss 行動表 are transcribed row by row in table
 * order. `AiCondition` holds a single condition, so where the spec notes a second guard on a
 * row it is left to the battle engine (see the comments on those rules).
 */

/** §5.8 default pattern shared by every normal enemy (fresh object per enemy). */
const defaultAttack = (): AiRule => ({
  priority: 0,
  cond: { type: 'always' },
  action: 'attack',
  target: 'random',
  weight: 60,
});

/** Priority-0 `always` row. */
const always = (action: string, target: AiTarget, weight: number): AiRule => ({
  priority: 0,
  cond: { type: 'always' },
  action,
  target,
  weight,
});

/** §8.4: all bosses are immune to paralyze and halve the other ailments; def_down stays effective. */
const BOSS_STATUS_RESIST: Partial<Record<StatusKey, number>> = {
  paralyze: 1,
  poison: 0.5,
  blind: 0.5,
  def_down: 0,
  atk_up: 0,
};

interface EnemySpec {
  id: string;
  name: string;
  /** 想定 Lv (§6.2 area level for normal enemies, §8.4 column for bosses). */
  level: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  element: Element;
  /** 無(影): element 'none' tagged as shadow. */
  shadow?: boolean;
  weak: Element[];
  resist: Element[];
  exp: number;
  gold: number;
  drops: DropDef[];
  /** 固有行動 rows (normal) or the full 行動表 (boss). */
  ai: AiRule[];
}

interface BossSpec extends EnemySpec {
  scale?: number;
  phaseNext?: string;
  onDefeatEvent?: string;
}

const baseOf = (s: EnemySpec): Omit<EnemyDef, 'isBoss' | 'statusResist' | 'ai'> => ({
  id: s.id,
  name: s.name,
  level: s.level,
  stats: { hp: s.hp, mp: 0, atk: s.atk, def: s.def, spd: s.spd },
  element: s.element,
  ...(s.shadow ? { tags: ['shadow' as const] } : {}),
  weak: s.weak,
  resist: s.resist,
  exp: s.exp,
  gold: s.gold,
  drops: s.drops,
  imageKey: `enemy_${s.id}`,
});

const normal = (s: EnemySpec): EnemyDef => ({
  ...baseOf(s),
  isBoss: false,
  statusResist: {},
  ai: [defaultAttack(), ...s.ai],
  scale: 1,
});

const boss = (s: BossSpec): EnemyDef => ({
  ...baseOf(s),
  isBoss: true,
  statusResist: { ...BOSS_STATUS_RESIST },
  ai: s.ai,
  scale: s.scale ?? 2,
  ...(s.phaseNext ? { phaseNext: s.phaseNext } : {}),
  ...(s.onDefeatEvent ? { onDefeatEvent: s.onDefeatEvent } : {}),
});

// ---- §8.1 通常敵 ------------------------------------------------------
const NORMAL_ENEMIES: readonly EnemyDef[] = [
  normal({
    id: 'en_lost_star_slime',
    name: '迷い星スライム',
    level: 1,
    hp: 30,
    atk: 8,
    def: 4,
    spd: 6,
    element: 'light',
    weak: [],
    resist: ['light'],
    exp: 7,
    gold: 5,
    drops: [{ itemId: 'it_herb', chance: 0.3 }],
    ai: [always('sk_en_star_spit', 'random', 30)],
  }),
  normal({
    id: 'en_whisper_bat',
    name: 'ささやきコウモリ',
    level: 2,
    hp: 38,
    atk: 11,
    def: 5,
    spd: 14,
    element: 'none',
    shadow: true,
    weak: ['light'],
    resist: [],
    exp: 10,
    gold: 7,
    drops: [{ itemId: 'it_herb', chance: 0.25 }],
    ai: [always('sk_en_shriek', 'random', 40)],
  }),
  normal({
    id: 'en_mushroom_kid',
    name: 'キノコの子',
    level: 3,
    hp: 55,
    atk: 12,
    def: 8,
    spd: 5,
    element: 'earth',
    weak: ['fire'],
    resist: ['earth'],
    exp: 12,
    gold: 8,
    drops: [{ itemId: 'it_antidote', chance: 0.3 }],
    ai: [always('sk_en_poison_spore', 'all', 35)],
  }),
  normal({
    id: 'en_forest_wolf',
    name: '森オオカミ',
    level: 4,
    hp: 70,
    atk: 16,
    def: 7,
    spd: 12,
    element: 'none',
    weak: ['fire'],
    resist: [],
    exp: 15,
    gold: 10,
    drops: [{ itemId: 'it_potion_s', chance: 0.2 }],
    ai: [
      always('sk_en_howl', 'self', 30),
      {
        priority: 0,
        cond: { type: 'hp_below', ratio: 0.5 },
        action: 'sk_en_bite',
        target: 'random',
        weight: 60,
      },
    ],
  }),
  normal({
    id: 'en_thorn_vine',
    name: 'トゲツタ',
    level: 5,
    hp: 85,
    atk: 14,
    def: 12,
    spd: 4,
    element: 'earth',
    weak: ['fire'],
    resist: ['earth'],
    exp: 16,
    gold: 12,
    drops: [{ itemId: 'it_antidote', chance: 0.25 }],
    ai: [always('sk_en_thorn_whip', 'random', 40)],
  }),
  normal({
    id: 'en_mine_rat',
    name: '廃坑ネズミ',
    level: 6,
    hp: 110,
    atk: 24,
    def: 12,
    spd: 16,
    element: 'none',
    weak: ['fire'],
    resist: [],
    exp: 45,
    gold: 18,
    drops: [{ itemId: 'it_herb', chance: 0.3 }],
    ai: [always('sk_en_bite', 'random', 40)],
  }),
  normal({
    id: 'en_ore_spider',
    name: '鉱石クモ',
    level: 8,
    hp: 140,
    atk: 26,
    def: 20,
    spd: 10,
    element: 'earth',
    weak: ['fire'],
    resist: ['earth'],
    exp: 55,
    gold: 22,
    drops: [{ itemId: 'it_shining_ore', chance: 0.25 }],
    ai: [always('sk_en_crystal_shot', 'random', 35), always('sk_en_poison_bite', 'random', 25)],
  }),
  normal({
    id: 'en_minecart_ghost',
    name: 'トロッコゴースト',
    level: 9,
    hp: 160,
    atk: 30,
    def: 14,
    spd: 12,
    element: 'none',
    shadow: true,
    weak: ['light'],
    resist: ['earth'],
    exp: 65,
    gold: 26,
    drops: [{ itemId: 'it_star_drop', chance: 0.2 }],
    ai: [
      always('sk_en_ghost_touch', 'random', 40),
      {
        priority: 1,
        cond: { type: 'turn_every', n: 3 },
        action: 'sk_en_cart_rush',
        target: 'all',
        weight: 100,
      },
    ],
  }),
  normal({
    id: 'en_glow_bug',
    name: 'ヒカリムシ',
    level: 7,
    hp: 95,
    atk: 22,
    def: 10,
    spd: 22,
    element: 'light',
    weak: ['water'],
    resist: ['light'],
    exp: 50,
    gold: 20,
    drops: [{ itemId: 'it_eye_drop', chance: 0.3 }],
    ai: [always('sk_en_lantern_flash', 'all', 40)],
  }),
  normal({
    id: 'en_tidepool_crab',
    name: '潮だまりカニ',
    level: 11,
    hp: 260,
    atk: 40,
    def: 34,
    spd: 10,
    element: 'water',
    weak: ['earth'],
    resist: ['water'],
    exp: 170,
    gold: 48,
    drops: [{ itemId: 'it_tide_shell', chance: 0.25 }],
    ai: [always('sk_en_shell_crush', 'random', 40)],
  }),
  normal({
    id: 'en_ruin_statue',
    name: '遺跡の石像兵',
    level: 14,
    hp: 300,
    atk: 44,
    def: 30,
    spd: 12,
    element: 'earth',
    weak: ['fire'],
    resist: ['earth'],
    exp: 195,
    gold: 56,
    drops: [{ itemId: 'it_quake_stone', chance: 0.25 }],
    ai: [
      always('sk_en_spear_thrust', 'random', 40),
      {
        priority: 0,
        cond: { type: 'ally_count_below', n: 2 },
        action: 'guard',
        target: 'self',
        weight: 30,
      },
    ],
  }),
  normal({
    id: 'en_hollow_shell',
    name: 'うつろ貝',
    level: 13,
    hp: 230,
    atk: 38,
    def: 26,
    spd: 14,
    element: 'water',
    weak: ['earth'],
    resist: ['water'],
    exp: 180,
    gold: 52,
    drops: [{ itemId: 'it_star_drop', chance: 0.25 }],
    ai: [always('sk_en_void_drain', 'random', 40), always('sk_en_tide_splash', 'all', 20)],
  }),
  normal({
    id: 'en_shadow_hand',
    name: '影の手',
    level: 18,
    hp: 420,
    atk: 58,
    def: 36,
    spd: 20,
    element: 'none',
    shadow: true,
    weak: ['light'],
    resist: ['fire', 'water', 'earth'],
    exp: 260,
    gold: 90,
    drops: [{ itemId: 'it_potion_m', chance: 0.25 }],
    ai: [
      always('sk_en_shadow_grip', 'random', 40),
      {
        priority: 1,
        cond: { type: 'party_has_status', status: 'paralyze' },
        action: 'attack',
        target: 'lowest_hp',
        weight: 100,
      },
    ],
  }),
  normal({
    id: 'en_false_light',
    name: '偽りの灯',
    level: 20,
    hp: 380,
    atk: 62,
    def: 32,
    spd: 26,
    element: 'fire',
    weak: ['water'],
    resist: ['fire'],
    exp: 280,
    gold: 95,
    drops: [{ itemId: 'it_star_tear', chance: 0.1 }],
    ai: [always('sk_en_cold_flame', 'all', 35), always('sk_en_mock', 'random', 25)],
  }),
];

// ---- §8.4 ボス（4 体・5 形態） ----------------------------------------
const BOSSES: readonly EnemyDef[] = [
  boss({
    id: 'bo_old_tree_hollow',
    name: '古木のウロ',
    level: 5,
    hp: 420,
    atk: 20,
    def: 10,
    spd: 6,
    element: 'earth',
    weak: ['fire'],
    resist: ['earth', 'water'],
    exp: 120,
    gold: 150,
    drops: [
      { itemId: 'it_fragment_1', chance: 1 },
      { itemId: 'it_potion_s', chance: 1, qty: 2 },
    ],
    onDefeatEvent: 'ev_forest_boss_win',
    ai: [
      {
        priority: 2,
        cond: { type: 'turn_every', n: 4 },
        action: 'sk_bo_fragment_glow',
        target: 'self',
        weight: 100,
        message: '欠片が淡く光り、傷が癒えた',
      },
      {
        priority: 1,
        cond: { type: 'hp_below', ratio: 0.5 },
        action: 'sk_bo_hollow_cry',
        target: 'all',
        weight: 100,
        once: true,
      },
      always('attack', 'random', 40),
      always('sk_bo_root_bind', 'random', 25),
      always('sk_bo_pollen', 'all', 20),
      always('sk_bo_trunk_quake', 'all', 15),
    ],
  }),
  boss({
    id: 'bo_rock_golem',
    name: '岩のゴーレム',
    level: 10,
    hp: 1100,
    atk: 40,
    def: 30,
    spd: 6,
    element: 'earth',
    weak: ['fire'],
    resist: ['earth'],
    exp: 450,
    gold: 600,
    drops: [
      { itemId: 'it_fragment_2', chance: 1 },
      { itemId: 'it_star_drop', chance: 1, qty: 2 },
    ],
    onDefeatEvent: 'ev_mine_boss_win',
    ai: [
      {
        priority: 3,
        cond: { type: 'turn_every', n: 4 },
        action: 'sk_bo_harden',
        target: 'self',
        weight: 100,
        message: '体が黒く固まった！',
      },
      // While hardened: heal or plain attack only.
      {
        priority: 2,
        cond: { type: 'self_has_status', status: 'harden' },
        action: 'sk_bo_fragment_glow',
        target: 'self',
        weight: 50,
      },
      {
        priority: 2,
        cond: { type: 'self_has_status', status: 'harden' },
        action: 'attack',
        target: 'random',
        weight: 50,
      },
      // Spec: weight 100, with the note that weight 50 is acceptable to land ~every other turn.
      {
        priority: 1,
        cond: { type: 'hp_below', ratio: 0.5 },
        action: 'sk_bo_big_quake',
        target: 'all',
        weight: 50,
      },
      always('attack', 'random', 50),
      always('sk_bo_rock_throw', 'highest_atk', 50),
    ],
  }),
  boss({
    id: 'bo_ruin_guardian',
    name: '遺跡の番人',
    level: 16,
    hp: 2000,
    atk: 62,
    def: 40,
    spd: 14,
    element: 'water',
    weak: ['earth'],
    resist: ['water'],
    exp: 1200,
    gold: 1500,
    drops: [
      { itemId: 'it_fragment_3', chance: 1 },
      { itemId: 'it_star_tear', chance: 1, qty: 1 },
    ],
    onDefeatEvent: 'ev_ruins_boss_win',
    ai: [
      // Always fires the turn after sk_bo_tide_omen (the omen sets charge count 1).
      {
        priority: 3,
        cond: { type: 'charge', n: 1 },
        action: 'sk_bo_great_tide',
        target: 'all',
        weight: 100,
      },
      {
        priority: 2,
        cond: { type: 'turn_every', n: 4 },
        action: 'sk_bo_tide_omen',
        target: 'self',
        weight: 100,
        message: '海がうなっている……大きな波が来る！',
      },
      {
        priority: 1,
        cond: {
          type: 'all',
          conds: [
            { type: 'hp_below', ratio: 0.5 },
            { type: 'not_self_status', status: 'water_veil' },
          ],
        },
        action: 'sk_bo_water_veil',
        target: 'self',
        weight: 40,
      },
      always('sk_bo_trident', 'random', 40),
      always('sk_bo_stone_arm', 'lowest_hp', 30),
      always('attack', 'random', 30),
    ],
  }),
  boss({
    id: 'bo_nox_phase1',
    name: 'ノクス',
    level: 24,
    hp: 2600,
    atk: 78,
    def: 48,
    spd: 30,
    element: 'none',
    shadow: true,
    weak: ['light'],
    resist: [],
    exp: 0,
    gold: 0,
    drops: [],
    phaseNext: 'bo_nox_phase2',
    ai: [
      {
        priority: 2,
        cond: { type: 'turn_every', n: 3 },
        action: 'sk_bo_absorb_fragment',
        target: 'self',
        weight: 100,
        message: '欠片を吸い込んだ',
      },
      // Sets the double-action flag: two actions every round from here on (§5.2).
      {
        priority: 1,
        cond: { type: 'hp_below', ratio: 0.5 },
        action: 'double_act',
        target: 'self',
        weight: 100,
        once: true,
      },
      always('sk_bo_shadow_blade', 'random', 45),
      always('sk_bo_stardust_rain', 'all', 35),
      always('attack', 'lowest_hp', 20),
    ],
  }),
  boss({
    id: 'bo_nox_phase2',
    name: 'ノクス・星喰らい',
    level: 24,
    hp: 3600,
    atk: 92,
    def: 52,
    spd: 34,
    element: 'none',
    shadow: true,
    weak: ['light'],
    resist: ['fire', 'water', 'earth'],
    exp: 3000,
    gold: 0,
    drops: [],
    scale: 2.67,
    onDefeatEvent: 'ev_nox_defeated',
    ai: [
      // Fires the turn after the second charge turn.
      {
        priority: 4,
        cond: { type: 'charge', n: 2 },
        action: 'sk_bo_star_extinction',
        target: 'all',
        weight: 100,
      },
      // Charge continues (count 1 -> 2).
      {
        priority: 3,
        cond: { type: 'charge', n: 1 },
        action: 'charge',
        target: 'self',
        weight: 100,
        message: '星の光が吸い寄せられていく……',
      },
      // Charge starts. Spec also requires not_self_status:charging; the charge:1 / charge:2 rows
      // above outrank this one while a charge is running, and the engine owns the interruption
      // rule (>= 250 light damage during the charge cancels it and inflicts def_down 2 turns).
      {
        priority: 2,
        cond: { type: 'hp_below', ratio: 0.3 },
        action: 'charge',
        target: 'self',
        weight: 100,
      },
      {
        priority: 1,
        cond: { type: 'turn_every', n: 3 },
        action: 'sk_bo_night_veil',
        target: 'all',
        weight: 100,
      },
      always('sk_bo_falling_star', 'random', 40),
      // Phase 2 variant (×1.3) of sk_bo_stardust_rain.
      always('sk_bo_stardust_rain2', 'all', 35),
      always('attack', 'random', 25),
    ],
  }),
];

export const ENEMIES: readonly EnemyDef[] = [...NORMAL_ENEMIES, ...BOSSES];

export const NORMAL_ENEMY_IDS: readonly string[] = NORMAL_ENEMIES.map((e) => e.id);
export const BOSS_IDS: readonly string[] = BOSSES.map((e) => e.id);

const BY_ID = new Map(ENEMIES.map((e) => [e.id, e] as const));

export function getEnemy(id: string): EnemyDef {
  const enemy = BY_ID.get(id);
  if (!enemy) throw new Error(`unknown enemy: ${id}`);
  return enemy;
}

export function findEnemy(id: string): EnemyDef | undefined {
  return BY_ID.get(id);
}
