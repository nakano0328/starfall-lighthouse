import type {
  AiRule,
  DropDef,
  Element,
  EncounterGroup,
  ItemDef,
  SkillDef,
  Stats,
  StatusKey,
} from '@data/types';

import type { Inventory } from '../inventory';
import type { Rng } from './rng';

export type Side = 'party' | 'enemy';

/** Status ailments (§5.6) plus the icon-less internal effects (§5.7, §8.4). */
export type BattleStatus = StatusKey | 'taunt' | 'harden' | 'cracked' | 'water_veil' | 'charging';

export interface StatusInstance {
  status: BattleStatus;
  turns: number;
}

/** Durations from §5.6 and §8.4. */
export const STATUS_TURNS: Record<BattleStatus, number> = {
  poison: 5,
  paralyze: 2,
  blind: 4,
  def_down: 3,
  atk_up: 3,
  taunt: 3,
  harden: 2,
  cracked: 1,
  water_veil: 2,
  charging: 99,
};

export const STATUS_NAMES: Record<BattleStatus, string> = {
  poison: '毒',
  paralyze: '麻痺',
  blind: '暗闇',
  def_down: '防御ダウン',
  atk_up: '攻撃アップ',
  taunt: '挑発',
  harden: '硬化',
  cracked: 'ひび割れ',
  water_veil: '水のとばり',
  charging: '充填',
};

/** One combatant's live state. Built by `createPartyBattler` / `createEnemyBattler`. */
export interface Battler {
  /** Unique within the battle: p0..p2 / e0..e2. */
  key: string;
  side: Side;
  /** ch_* / en_* / bo_* */
  id: string;
  name: string;
  level: number;
  /** Totals including equipment (party) or the enemy table (enemy). */
  stats: Stats;
  hp: number;
  mp: number;
  ko: boolean;
  statuses: StatusInstance[];
  guarding: boolean;
  /** Element of the equipped weapon ('none' when unarmed / for enemies). */
  weaponElement: Element;
  /** Damage multipliers per incoming element (equipment resist / enemy weak+resist). */
  elementMultiplier: Partial<Record<Element, number>>;
  /** Statuses this battler can never receive (equipment immunities). */
  immune: StatusKey[];
  /** 0..1 resistance per status (1 = immune). */
  statusResist: Partial<Record<StatusKey, number>>;
  tags: string[];
  /** Party: learned skill ids. Enemy: ids used by its AI. */
  skills: string[];
  /** Party members: index into GameState.party. */
  memberIndex?: number;
  // ---- enemy-only runtime ----
  ai: AiRule[];
  usedOnce: Set<number>;
  charge: number;
  extraActs: number;
  lightDamageWhileCharging: number;
  isBoss: boolean;
  exp: number;
  gold: number;
  drops: DropDef[];
  phaseNext?: string;
}

export type Command =
  | { type: 'attack'; target: string }
  | { type: 'skill'; skillId: string; target?: string }
  | { type: 'item'; itemId: string; target?: string }
  | { type: 'guard' };

export type RoundInput =
  { kind: 'commands'; commands: Record<string, Command> } | { kind: 'escape' };

export type Outcome = 'ongoing' | 'victory' | 'defeat' | 'escaped' | 'phase_change';

export interface BattleData {
  skill: (id: string) => SkillDef;
  /**
   * Looks up a consumable item. Returns undefined for inventory entries that are
   * not items (equipment shares the bag), which the engine then ignores.
   */
  item: (id: string) => ItemDef | undefined;
}

export interface BattleOptions {
  party: Battler[];
  enemies: Battler[];
  group: EncounterGroup;
  rng: Rng;
  data: BattleData;
  inventory: Inventory;
  /** Enemies skip their first round (§5.12 先制攻撃). */
  preemptive?: boolean;
}

export type BattleEvent =
  | { type: 'round_start'; round: number }
  | { type: 'message'; text: string }
  | { type: 'action'; actor: string; label: string; skillId?: string; itemId?: string }
  | {
      type: 'damage';
      target: string;
      amount: number;
      crit: boolean;
      weak: boolean;
      immune: boolean;
      element: Element;
    }
  | { type: 'heal'; target: string; amount: number }
  | { type: 'mp_heal'; target: string; amount: number }
  | { type: 'mp_drain'; target: string; amount: number }
  | { type: 'miss'; target: string }
  | { type: 'no_mp'; actor: string }
  | { type: 'status_applied'; target: string; status: BattleStatus }
  | { type: 'status_resisted'; target: string; status: BattleStatus }
  | { type: 'status_expired'; target: string; status: BattleStatus }
  | { type: 'status_cured'; target: string; status: BattleStatus }
  | { type: 'revive'; target: string }
  | { type: 'ko'; target: string }
  | { type: 'guard'; actor: string }
  | { type: 'paralyzed'; actor: string }
  | { type: 'charge'; actor: string; step: number }
  | { type: 'charge_broken'; actor: string }
  | { type: 'escape'; success: boolean; chance: number }
  | { type: 'phase_change'; actor: string; next: string }
  | { type: 'victory' }
  | { type: 'defeat' };
