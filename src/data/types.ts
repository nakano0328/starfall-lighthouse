/**
 * Shared data contracts for game content. Mirrors docs/GAME_DESIGN.md §16.
 * Content lives in src/data/* as typed data; scenes never hard-code these values.
 */

// ---- 共通 -------------------------------------------------------------
export type Element = 'none' | 'light' | 'fire' | 'water' | 'earth';
export type StatusKey = 'poison' | 'paralyze' | 'blind' | 'def_down' | 'atk_up';
export type Facing = 'up' | 'down' | 'left' | 'right';
export type CharacterId = 'ch_luka' | 'ch_mio' | 'ch_goro';
export type TargetScope =
  'enemy_single' | 'enemy_all' | 'enemy_random' | 'ally_single' | 'ally_all' | 'self' | 'none';

export interface Stats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
  luk: number;
}

// ---- キャラクター -----------------------------------------------------
export interface CharacterDef {
  id: CharacterId;
  name: string;
  base: Stats;
  growth: Stats;
  skills: { level: number; skillId: string }[];
  initialEquipment: { weapon: string | null; armor: string | null; accessory: string | null };
  portraitKeyPrefix: string;
  spriteKey: string;
  joinMinLevel: number;
}

// ---- スキル -----------------------------------------------------------
export type SkillKind = 'physical' | 'magic' | 'heal' | 'buff' | 'debuff' | 'special';

export interface StatusEffectApply {
  status: StatusKey | 'taunt' | 'harden' | 'water_veil' | 'charging';
  chance: number;
  turns: number;
  target: 'target' | 'self';
}

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  mpCost: number;
  kind: SkillKind;
  scope: TargetScope;
  element: Element | 'weapon';
  mult: number;
  add: number;
  lvMult?: number;
  hits?: number;
  accuracy?: number;
  critBonus?: number;
  priority?: boolean;
  statuses?: StatusEffectApply[];
  mpDrain?: number;
  cures?: StatusKey[];
  enemyOnly?: boolean;
  seKey: string;
}

// ---- アイテム・装備 ---------------------------------------------------
export type ItemCategory = 'heal' | 'cure' | 'attack' | 'field' | 'key';

export type ItemEffect =
  | { type: 'heal_hp'; amount: number | 'full' }
  | { type: 'heal_mp'; amount: number | 'full' }
  | { type: 'cure'; statuses: StatusKey[] | 'all' }
  | { type: 'revive'; hpRatio: number }
  | { type: 'damage'; power: number; element: Element }
  | { type: 'escape_dungeon' }
  | { type: 'none' };

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  price: number;
  usableInBattle: boolean;
  usableInField: boolean;
  scope: TargetScope;
  effect: ItemEffect;
  maxQty: number;
  iconKey: string;
}

export type EquipSlot = 'weapon' | 'armor' | 'accessory';

export interface EquipDef {
  id: string;
  name: string;
  description: string;
  slot: EquipSlot;
  allowed: CharacterId[];
  bonus: Partial<Stats>;
  element?: Element;
  resist?: Partial<Record<Element, number>>;
  immune?: StatusKey[];
  price: number;
  tier: 1 | 2 | 3 | 4;
  iconKey: string;
}

// ---- 敵 ---------------------------------------------------------------
export type AiCondition =
  | { type: 'always' }
  | { type: 'hp_below'; ratio: number }
  | { type: 'turn_every'; n: number }
  | { type: 'turn_eq'; n: number }
  | { type: 'ally_count_below'; n: number }
  | { type: 'party_has_status'; status: StatusKey }
  | { type: 'self_has_status'; status: string }
  | { type: 'not_self_status'; status: string }
  | { type: 'charge'; n: number }
  /** Every sub-condition must hold (e.g. hp_below AND not_self_status). */
  | { type: 'all'; conds: AiCondition[] };

export type AiTarget = 'random' | 'lowest_hp' | 'highest_atk' | 'all' | 'self' | 'ally_random';

export interface AiRule {
  priority: number;
  cond: AiCondition;
  action: 'attack' | 'guard' | 'charge' | 'double_act' | string;
  target: AiTarget;
  weight: number;
  once?: boolean;
  message?: string;
}

export interface DropDef {
  itemId: string;
  chance: number;
  qty?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  isBoss: boolean;
  level: number;
  stats: Omit<Stats, 'luk'> & { luk?: number };
  element: Element;
  tags?: ('shadow' | 'undead' | 'plant')[];
  weak: Element[];
  resist: Element[];
  statusResist: Partial<Record<StatusKey, number>>;
  exp: number;
  gold: number;
  drops: DropDef[];
  ai: AiRule[];
  imageKey: string;
  scale?: number;
  phaseNext?: string;
  onDefeatEvent?: string;
}

export interface EncounterGroup {
  id: string;
  enemies: { enemyId: string; count: number }[];
  canEscape: boolean;
  battleBgKey: string;
  bgmKey: string;
}

// ---- マップ -----------------------------------------------------------
export type MapKind = 'town' | 'interior' | 'field' | 'dungeon' | 'event';

export interface MapMeta {
  id: string;
  displayName: string;
  kind: MapKind;
  bgmKey: string;
  battleBgKey: string;
  encounterGroups: string[];
  tilesets: string[];
  entrance: { x: number; y: number; facing: Facing };
  canSaveAnywhere: boolean;
  tideAware?: boolean;
  chapterMin?: number;
}

// ---- 会話・イベント ---------------------------------------------------
/** 'flag.key' | '!flag.key' | 'flag.key>=3' | "flag.key=='low'" — see docs/GAME_DESIGN.md §9.3 */
export type Condition = string;

export interface DialogChoice {
  text: string;
  next?: string;
  effects?: EventCommand[];
}

export interface DialogBranch {
  if?: Condition;
  next: string;
}

export interface DialogNode {
  id: string;
  speaker?: string;
  portrait?: string;
  pages: string[];
  choices?: DialogChoice[];
  branches?: DialogBranch[];
  effects?: EventCommand[];
  next?: string;
}

export type EventCommand =
  | { cmd: 'move'; actor: 'player' | string; path: Facing[]; wait?: boolean }
  | { cmd: 'face'; actor: 'player' | string; dir: Facing }
  | { cmd: 'wait'; ms: number }
  | { cmd: 'say'; dialog: string }
  | { cmd: 'choice'; text: string[]; set: string }
  | { cmd: 'give_item'; item: string; qty: number }
  | { cmd: 'give_gold'; amount: number }
  | { cmd: 'take_item'; item: string; qty: number }
  | { cmd: 'set_flag'; key: string; value?: boolean | number | string; increment?: number }
  | { cmd: 'battle'; group: string; win_event?: string; lose?: 'gameover' | 'continue' }
  | { cmd: 'warp'; map: string; x: number; y: number; facing: Facing }
  | { cmd: 'fade'; dir: 'in' | 'out'; ms: number; color?: 'black' | 'white' }
  | { cmd: 'shake'; ms: number; intensity: number }
  | { cmd: 'play_bgm'; key: string | 'none'; fade_ms?: number }
  | { cmd: 'play_se'; key: string }
  | { cmd: 'heal_party' }
  | { cmd: 'add_member'; id: CharacterId }
  | { cmd: 'show_chapter'; title: string }
  | { cmd: 'spawn_npc'; id: string }
  | { cmd: 'remove_npc'; id: string }
  | { cmd: 'flash'; ms: number; color?: 'black' | 'white' }
  | { cmd: 'end_game' };

export interface EventScript {
  id: string;
  commands: EventCommand[];
}

// ---- サブクエスト・ショップ -------------------------------------------
export interface QuestDef {
  id: string;
  name: string;
  flagKey: string;
  giverNpc: string;
  requiredItems: { itemId: string; qty: number }[];
  rewards: { itemId?: string; equipId?: string; gold?: number }[];
  unlockCondition: Condition;
}

export interface ShopStockEntry {
  /** it_* or eq_* id. */
  id: string;
  /** §9.3 condition grammar; the entry is listed only when it holds. */
  condition?: Condition;
}

export interface ShopDef {
  id: string;
  name: string;
  stock: ShopStockEntry[];
}
