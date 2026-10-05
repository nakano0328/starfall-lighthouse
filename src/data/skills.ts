import type {
  Element,
  SkillDef,
  SkillKind,
  StatusEffectApply,
  StatusKey,
  TargetScope,
} from './types';

/**
 * Skills from docs/GAME_DESIGN.md §4.4 (22 party skills) and §8.3 (37 enemy/boss
 * skills, plus `sk_bo_stardust_rain2` for the ×1.3 variant Nox uses in phase 2).
 *
 * `scope` is always relative to the user: an enemy skill the spec lists as
 * 「単体」 / 「全体」 (hitting the party) is `enemy_single` / `enemy_all`.
 */

type SkillElement = SkillDef['element'];
type StatusName = StatusEffectApply['status'];

/** Durations in turns: §5.6 for the five status keys and taunt, §8.3 for the boss self-buffs. */
const STATUS_TURNS: Readonly<Record<StatusName, number>> = {
  poison: 5,
  paralyze: 2,
  blind: 4,
  def_down: 3,
  atk_up: 3,
  taunt: 3,
  harden: 2,
  water_veil: 2,
  charging: 1,
};

const effect = (
  name: StatusName,
  chance: number,
  target: StatusEffectApply['target'] = 'target',
): StatusEffectApply => ({ status: name, chance, turns: STATUS_TURNS[name], target });

/** SE keys from the sound table in GAME_DESIGN.md. Unelemental magic (Nox) reuses the light key. */
const MAGIC_SE: Readonly<Record<Element, string>> = {
  none: 'se_magic_light',
  light: 'se_magic_light',
  fire: 'se_magic_fire',
  water: 'se_magic_water',
  earth: 'se_magic_earth',
};

function defaultSe(kind: SkillKind, element: SkillElement): string {
  switch (kind) {
    case 'physical':
      return 'se_slash';
    case 'magic':
      return element === 'weapon' ? 'se_slash' : MAGIC_SE[element];
    case 'heal':
      return 'se_heal';
    case 'buff':
    case 'debuff':
    case 'special':
      return 'se_buff';
  }
}

type Extra = Partial<
  Pick<
    SkillDef,
    | 'lvMult'
    | 'hits'
    | 'accuracy'
    | 'critBonus'
    | 'priority'
    | 'statuses'
    | 'mpDrain'
    | 'cures'
    | 'seKey'
  >
>;

function define(
  id: string,
  name: string,
  description: string,
  mpCost: number,
  kind: SkillKind,
  scope: TargetScope,
  element: SkillElement,
  mult: number,
  add: number,
  extra: Extra = {},
): SkillDef {
  return {
    id,
    name,
    description,
    mpCost,
    kind,
    scope,
    element,
    mult,
    add,
    seKey: defaultSe(kind, element),
    ...extra,
  };
}

/** physical / magic damage: `mult` × ATK + `add` (§5.3). */
const attack = (
  id: string,
  name: string,
  description: string,
  mpCost: number,
  kind: 'physical' | 'magic',
  scope: TargetScope,
  element: SkillElement,
  mult: number,
  add = 0,
  extra?: Extra,
): SkillDef => define(id, name, description, mpCost, kind, scope, element, mult, add, extra);

/** heal: `add` + Lv × `lvMult` (§4.4). */
const heal = (
  id: string,
  name: string,
  description: string,
  mpCost: number,
  scope: TargetScope,
  add: number,
  lvMult?: number,
  extra: Extra = {},
): SkillDef =>
  define(
    id,
    name,
    description,
    mpCost,
    'heal',
    scope,
    'none',
    0,
    add,
    lvMult === undefined ? extra : { lvMult, ...extra },
  );

/** buff / debuff: no damage, only status applications. */
const support = (
  id: string,
  name: string,
  description: string,
  mpCost: number,
  kind: 'buff' | 'debuff',
  scope: TargetScope,
  statuses: StatusEffectApply[],
  extra?: Extra,
): SkillDef =>
  define(id, name, description, mpCost, kind, scope, 'none', 0, 0, { statuses, ...extra });

const enemy = (s: SkillDef): SkillDef => ({ ...s, mpCost: 0, enemyOnly: true });

const CURE_ALL: StatusKey[] = ['poison', 'paralyze', 'blind', 'def_down'];

// ---- §4.4 ルカ（光・回復） ----------------------------------------------
const LUKA: SkillDef[] = [
  attack(
    'sk_star_light',
    'ほしのひかり',
    '敵ひとりに光のダメージ。',
    4,
    'magic',
    'enemy_single',
    'light',
    1.2,
    6,
  ),
  heal('sk_first_aid', 'おうきゅうてあて', '味方ひとりの HP を回復する。', 5, 'ally_single', 25, 3),
  attack(
    'sk_heavy_slash',
    'つよぎり',
    '敵ひとりに武器で強い一撃。',
    6,
    'physical',
    'enemy_single',
    'weapon',
    1.6,
  ),
  attack(
    'sk_star_rain',
    'ほしふり',
    '敵全体に光のダメージ。',
    10,
    'magic',
    'enemy_all',
    'light',
    1.0,
    10,
  ),
  heal(
    'sk_cure',
    'きよめのひかり',
    '味方ひとりの HP を回復し、毒・麻痺・暗闇・防御ダウンを解除する。',
    8,
    'ally_single',
    20,
    2,
    { cures: CURE_ALL },
  ),
  attack(
    'sk_light_edge',
    'ひかりのつるぎ',
    '敵ひとりに光をまとった斬撃。',
    14,
    'physical',
    'enemy_single',
    'light',
    2.2,
  ),
  heal(
    'sk_lighthouse_blessing',
    'とうだいのかご',
    '味方全員の HP を回復する。',
    18,
    'ally_all',
    40,
    4,
  ),
  attack(
    'sk_starfall',
    'ほしふるいちげき',
    '敵ひとりに光の大ダメージ。クリティカルが出やすい。',
    24,
    'physical',
    'enemy_single',
    'light',
    3.0,
    30,
    { critBonus: 20 },
  ),
];

// ---- §4.4 ミオ（速攻・デバフ・水） --------------------------------------
const MIO: SkillDef[] = [
  attack(
    'sk_double_shot',
    'ダブルショット',
    '敵ひとりを 2 回攻撃する。',
    4,
    'physical',
    'enemy_single',
    'weapon',
    0.7,
    0,
    {
      hits: 2,
    },
  ),
  support(
    'sk_smoke_bomb',
    'けむりだま',
    '先制で敵全体を暗闇にする。',
    5,
    'debuff',
    'enemy_all',
    [effect('blind', 0.7)],
    {
      priority: true,
    },
  ),
  attack(
    'sk_armor_break',
    'よろいくだき',
    '敵ひとりを攻撃し、防御ダウンにする。',
    6,
    'physical',
    'enemy_single',
    'weapon',
    1.0,
    0,
    {
      statuses: [effect('def_down', 0.8)],
    },
  ),
  attack(
    'sk_tide_arrow',
    'しおのや',
    '敵ひとりに水のダメージ。',
    9,
    'magic',
    'enemy_single',
    'water',
    1.5,
    8,
  ),
  attack(
    'sk_poison_needle',
    'どくばり',
    '敵ひとりを攻撃し、毒にする。',
    6,
    'physical',
    'enemy_single',
    'weapon',
    0.9,
    0,
    {
      statuses: [effect('poison', 0.9)],
    },
  ),
  attack(
    'sk_triple_shot',
    'トリプルショット',
    '敵をランダムに 3 回攻撃する。',
    12,
    'physical',
    'enemy_random',
    'weapon',
    0.8,
    0,
    {
      hits: 3,
    },
  ),
  attack(
    'sk_tidal_storm',
    'うしおのあらし',
    '敵全体に水のダメージ。',
    20,
    'magic',
    'enemy_all',
    'water',
    1.4,
    15,
  ),
];

// ---- §4.4 ゴロー（耐久・土・バフ） --------------------------------------
const GORO: SkillDef[] = [
  attack(
    'sk_smash',
    'たたきつけ',
    '敵ひとりに武器で叩きつける。',
    5,
    'physical',
    'enemy_single',
    'weapon',
    1.8,
  ),
  support(
    'sk_provoke',
    'ちょうはつ',
    '先制で 3 ターンの間、敵の攻撃を自分に引きつける。',
    3,
    'buff',
    'self',
    [effect('taunt', 1, 'self')],
    {
      priority: true,
    },
  ),
  attack(
    'sk_quake',
    'じならし',
    '敵全体に土のダメージ。',
    9,
    'magic',
    'enemy_all',
    'earth',
    1.1,
    8,
  ),
  support(
    'sk_war_cry',
    'ときのこえ',
    '味方全員の攻撃力を 3 ターン上げる。',
    8,
    'buff',
    'ally_all',
    [effect('atk_up', 1)],
  ),
  attack(
    'sk_stun_hammer',
    'しびれづち',
    '敵ひとりを攻撃し、麻痺させる。',
    10,
    'physical',
    'enemy_single',
    'weapon',
    1.4,
    0,
    {
      statuses: [effect('paralyze', 0.6)],
    },
  ),
  attack(
    'sk_boulder',
    'おおいわおとし',
    '敵ひとりに土の大ダメージ。',
    16,
    'physical',
    'enemy_single',
    'earth',
    2.4,
    20,
  ),
  attack(
    'sk_mountain_break',
    'やまくだき',
    '敵全体に土の大ダメージ。',
    22,
    'physical',
    'enemy_all',
    'earth',
    1.6,
    20,
  ),
];

// ---- §8.3 通常敵 ---------------------------------------------------------
const ENEMY: SkillDef[] = [
  attack(
    'sk_en_star_spit',
    'ほしのつぶて',
    '光のつぶてを吐きつける。',
    0,
    'magic',
    'enemy_single',
    'light',
    1.0,
  ),
  support(
    'sk_en_shriek',
    'かなきりごえ',
    '耳ざわりな声でひとりを暗闇にする。',
    0,
    'debuff',
    'enemy_single',
    [effect('blind', 0.5)],
  ),
  support(
    'sk_en_poison_spore',
    'どくのほうし',
    '毒の胞子をまき散らして全体を毒にする。',
    0,
    'debuff',
    'enemy_all',
    [effect('poison', 0.4)],
  ),
  support('sk_en_howl', 'とおぼえ', '遠吠えで自分の攻撃力を上げる。', 0, 'buff', 'self', [
    effect('atk_up', 1, 'self'),
  ]),
  attack(
    'sk_en_bite',
    'かみつき',
    'するどい牙でかみつく。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.4,
  ),
  attack(
    'sk_en_thorn_whip',
    'トゲのムチ',
    'トゲのツタで打ちすえ、毒にすることがある。',
    0,
    'physical',
    'enemy_single',
    'earth',
    1.3,
    0,
    {
      statuses: [effect('poison', 0.3)],
    },
  ),
  attack(
    'sk_en_crystal_shot',
    'すいしょうだん',
    '鉱石のかけらを撃ち出す。',
    0,
    'magic',
    'enemy_single',
    'earth',
    1.2,
  ),
  attack(
    'sk_en_poison_bite',
    'どくかみつき',
    '毒牙でかみつき、毒にすることがある。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.0,
    0,
    {
      statuses: [effect('poison', 0.5)],
    },
  ),
  attack(
    'sk_en_ghost_touch',
    'ゆうれいのて',
    '冷たい手で触れ、麻痺させることがある。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.0,
    0,
    {
      statuses: [effect('paralyze', 0.5)],
    },
  ),
  attack(
    'sk_en_cart_rush',
    'トロッコとっしん',
    'トロッコごと全体に突っ込む。',
    0,
    'physical',
    'enemy_all',
    'none',
    0.9,
  ),
  support(
    'sk_en_lantern_flash',
    'ランタンフラッシュ',
    'まぶしい光で全体を暗闇にする。',
    0,
    'debuff',
    'enemy_all',
    [effect('blind', 0.5)],
  ),
  attack(
    'sk_en_shell_crush',
    'こうらくだき',
    'ハサミで砕き、防御ダウンにすることがある。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.4,
    0,
    {
      statuses: [effect('def_down', 0.6)],
    },
  ),
  attack(
    'sk_en_spear_thrust',
    'やりつき',
    '石の槍で突く。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.5,
  ),
  attack(
    'sk_en_void_drain',
    'うつろのすいとり',
    '攻撃しつつ対象の MP を 10 吸い取る。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.0,
    0,
    {
      mpDrain: 10,
    },
  ),
  attack(
    'sk_en_tide_splash',
    'しおしぶき',
    '潮を浴びせて全体に水のダメージ。',
    0,
    'magic',
    'enemy_all',
    'water',
    1.0,
  ),
  attack(
    'sk_en_shadow_grip',
    'かげのつかみ',
    '影の手でつかみ、麻痺させることがある。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.3,
    0,
    {
      statuses: [effect('paralyze', 0.4)],
    },
  ),
  attack(
    'sk_en_cold_flame',
    'つめたいほのお',
    '偽りの炎で全体を焼く。',
    0,
    'magic',
    'enemy_all',
    'fire',
    1.1,
  ),
  support(
    'sk_en_mock',
    'あざわらい',
    'あざ笑ってひとりを防御ダウンにする。',
    0,
    'debuff',
    'enemy_single',
    [effect('def_down', 0.7)],
  ),
];

// ---- §8.3 ボス -----------------------------------------------------------
const BOSS: SkillDef[] = [
  // 古木のウロ
  attack(
    'sk_bo_root_bind',
    'ねっこしばり',
    '根で縛り上げ、麻痺させることがある。',
    0,
    'physical',
    'enemy_single',
    'earth',
    1.4,
    0,
    {
      statuses: [effect('paralyze', 0.5)],
    },
  ),
  support(
    'sk_bo_pollen',
    'かふんのあらし',
    '花粉をまき散らして全体を毒にする。',
    0,
    'debuff',
    'enemy_all',
    [effect('poison', 0.6)],
  ),
  attack(
    'sk_bo_trunk_quake',
    'みきゆすり',
    '幹を揺らして全体に土のダメージ。',
    0,
    'physical',
    'enemy_all',
    'earth',
    0.9,
  ),
  support(
    'sk_bo_hollow_cry',
    'ウロのさけび',
    '叫びで全体を暗闇にし、自分の攻撃力を上げる。',
    0,
    'debuff',
    'enemy_all',
    [effect('blind', 0.7), effect('atk_up', 1, 'self')],
  ),
  // 古木のウロ (Lv5 → 60) / 岩のゴーレム (Lv10 → 150): add + Lv × lvMult
  heal(
    'sk_bo_fragment_glow',
    'かけらのかがやき',
    '星の欠片の光で自分の HP を回復する。',
    0,
    'self',
    -30,
    18,
  ),
  // 岩のゴーレム
  support(
    'sk_bo_harden',
    'こうか',
    '2 ターンの間、体を硬くして物理攻撃を無効にする。',
    0,
    'buff',
    'self',
    [effect('harden', 1, 'self')],
  ),
  attack(
    'sk_bo_rock_throw',
    'いわなげ',
    '大岩を投げつける。',
    0,
    'physical',
    'enemy_single',
    'earth',
    1.6,
  ),
  attack(
    'sk_bo_big_quake',
    'だいじしん',
    '地面を揺らして全体に土のダメージ。',
    0,
    'physical',
    'enemy_all',
    'earth',
    1.2,
  ),
  // 遺跡の番人
  attack(
    'sk_bo_trident',
    'さんさのほこ',
    '三叉の矛で突き、防御ダウンにすることがある。',
    0,
    'physical',
    'enemy_single',
    'water',
    1.6,
    0,
    {
      statuses: [effect('def_down', 0.5)],
    },
  ),
  attack(
    'sk_bo_stone_arm',
    'いしのうで',
    '石の腕で殴りつける。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.2,
  ),
  define(
    'sk_bo_tide_omen',
    'うみのうなり',
    '海がうなっている……大きな波が来る！',
    0,
    'special',
    'none',
    'none',
    0,
    0,
    {
      seKey: 'se_tide',
      // Telegraph: the engine counts one charge step so `charge:1` fires 大潮 next turn.
      statuses: [{ status: 'charging', chance: 1, turns: 1, target: 'self' }],
    },
  ),
  attack(
    'sk_bo_great_tide',
    'おおしお',
    '大波を呼んで全体に水の大ダメージ。',
    0,
    'magic',
    'enemy_all',
    'water',
    2.0,
  ),
  support(
    'sk_bo_water_veil',
    'みずのヴェール',
    '2 ターンの間、魔法のダメージを半分にする。',
    0,
    'buff',
    'self',
    [effect('water_veil', 1, 'self')],
  ),
  // ノクス 第 1 形態
  attack(
    'sk_bo_shadow_blade',
    'かげのやいば',
    '影の刃で斬りつける。',
    0,
    'physical',
    'enemy_single',
    'none',
    1.6,
  ),
  attack(
    'sk_bo_stardust_rain',
    'ほしくずのあめ',
    '星くずを降らせて全体にダメージ。',
    0,
    'magic',
    'enemy_all',
    'none',
    1.1,
  ),
  heal(
    'sk_bo_absorb_fragment',
    'かけらきゅうしゅう',
    '星の欠片を取り込んで HP を 300 回復する。',
    0,
    'self',
    300,
  ),
  // ノクス 第 2 形態
  attack(
    'sk_bo_stardust_rain2',
    'ほしくずのあめ',
    '星くずを降らせて全体にダメージ（第 2 形態の強化版）。',
    0,
    'magic',
    'enemy_all',
    'none',
    1.3,
  ),
  support(
    'sk_bo_night_veil',
    'よるのとばり',
    '夜のとばりで全体を暗闇にする。',
    0,
    'debuff',
    'enemy_all',
    [effect('blind', 0.8)],
  ),
  attack(
    'sk_bo_falling_star',
    'おちるほし',
    '星を落としてひとりに大ダメージ。',
    0,
    'magic',
    'enemy_single',
    'none',
    2.5,
  ),
  attack(
    'sk_bo_star_extinction',
    'ほしのしょうめつ',
    '2 ターン充填したのち全体に壊滅的なダメージ。',
    0,
    'magic',
    'enemy_all',
    'none',
    3.0,
  ),
];

export const SKILLS: readonly SkillDef[] = [
  ...LUKA,
  ...MIO,
  ...GORO,
  ...[...ENEMY, ...BOSS].map(enemy),
];

const BY_ID = new Map(SKILLS.map((s) => [s.id, s] as const));

export function getSkill(id: string): SkillDef {
  const skill = BY_ID.get(id);
  if (!skill) throw new Error(`unknown skill: ${id}`);
  return skill;
}

export function findSkill(id: string): SkillDef | undefined {
  return BY_ID.get(id);
}
