import type { Element, SkillDef } from '@data/types';

import { chance, rand } from './rng';
import type { Rng } from './rng';
import { hasStatus } from './status';
import type { Battler } from './types';

/** What an attack resolves with (docs/GAME_DESIGN.md §5.3). */
export interface AttackSpec {
  kind: 'physical' | 'magic';
  mult: number;
  add: number;
  element: Element;
  accuracy: number;
  critBonus: number;
}

export const BASIC_ATTACK: Omit<AttackSpec, 'element'> = {
  kind: 'physical',
  mult: 1.0,
  add: 0,
  accuracy: 95,
  critBonus: 0,
};

export function attackSpecFromSkill(skill: SkillDef, weaponElement: Element): AttackSpec {
  return {
    kind: skill.kind === 'magic' ? 'magic' : 'physical',
    mult: skill.mult,
    add: skill.add,
    element: skill.element === 'weapon' ? weaponElement : skill.element,
    accuracy: skill.accuracy ?? 95,
    critBonus: skill.critBonus ?? 0,
  };
}

export function effectiveAtk(b: Battler): number {
  return b.stats.atk * (hasStatus(b, 'atk_up') ? 1.3 : 1.0);
}

export function effectiveDef(b: Battler): number {
  let def = b.stats.def * (hasStatus(b, 'def_down') ? 0.7 : 1.0);
  if (hasStatus(b, 'cracked')) def *= 0.5;
  return def;
}

/** Multiplier for an incoming element: weak 1.5 / resist 0.5 / equipment resist / 1. */
export function elementMultiplier(target: Battler, element: Element): number {
  if (element === 'none') return 1;
  return target.elementMultiplier[element] ?? 1;
}

/** hit% = clamp(accuracy + (SPD_a − SPD_t) / 2, 60, 100), blind ×0.6, paralysed target 100 (§5.4). */
export function hitChance(attacker: Battler, target: Battler, accuracy: number): number {
  if (hasStatus(target, 'paralyze')) return 100;
  let hit = Math.min(100, Math.max(60, accuracy + (attacker.stats.spd - target.stats.spd) / 2));
  if (hasStatus(attacker, 'blind')) hit *= 0.6;
  return hit;
}

export function critChance(attacker: Battler, critBonus: number): number {
  return Math.min(50, Math.max(0, 5 + Math.floor(attacker.stats.luk / 5) + critBonus));
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  weak: boolean;
  /** Blocked outright (硬化中の物理). */
  immune: boolean;
  element: Element;
}

/**
 * Damage of a physical/magic action that already hit. Consumes rng values in
 * the order: crit roll (physical only), then the ±10% spread.
 */
export function computeDamage(
  attacker: Battler,
  target: Battler,
  spec: AttackSpec,
  rng: Rng,
): DamageResult {
  const weak = elementMultiplier(target, spec.element) > 1;
  if (spec.kind === 'physical' && hasStatus(target, 'harden')) {
    return { amount: 0, crit: false, weak, immune: true, element: spec.element };
  }
  const atk = effectiveAtk(attacker);
  const def = effectiveDef(target);
  let base = atk * spec.mult + spec.add - (spec.kind === 'physical' ? def / 2 : def / 4);
  base = Math.max(base, 1);
  const crit = spec.kind === 'physical' && chance(rng, critChance(attacker, spec.critBonus) / 100);
  let mult = elementMultiplier(target, spec.element);
  if (crit) mult *= 1.5;
  if (target.guarding) mult *= 0.5;
  if (spec.kind === 'magic') {
    if (hasStatus(target, 'harden')) mult *= 1.5;
    if (hasStatus(target, 'water_veil')) mult *= 0.5;
  }
  const amount = Math.max(1, Math.floor(base * mult * rand(rng, 0.9, 1.1)));
  return { amount, crit, weak, immune: false, element: spec.element };
}

/** Item damage ignores defence and never crits: floor(power × elem × guard × rand). */
export function computeItemDamage(
  target: Battler,
  power: number,
  element: Element,
  rng: Rng,
): DamageResult {
  let mult = elementMultiplier(target, element);
  if (target.guarding) mult *= 0.5;
  if (hasStatus(target, 'harden')) mult *= 1.5;
  const amount = Math.max(1, Math.floor(power * mult * rand(rng, 0.9, 1.1)));
  return {
    amount,
    crit: false,
    weak: elementMultiplier(target, element) > 1,
    immune: false,
    element,
  };
}

/** heal = floor((add + Lv × lvMult) × rand(0.95, 1.05)) (§5.3). */
export function computeHeal(user: Battler, skill: SkillDef, rng: Rng): number {
  const base = skill.add + user.level * (skill.lvMult ?? 0);
  return Math.max(0, Math.floor(base * rand(rng, 0.95, 1.05)));
}

/** 逃走成功% = clamp(50 + (avg party SPD − max enemy SPD) × 2 + 15 × failures, 20, 95) (§5.9). */
export function escapeChance(
  party: readonly Battler[],
  enemies: readonly Battler[],
  failures: number,
): number {
  const alive = party.filter((p) => !p.ko);
  const avg = alive.length === 0 ? 0 : alive.reduce((s, p) => s + p.stats.spd, 0) / alive.length;
  const maxEnemy = Math.max(0, ...enemies.filter((e) => !e.ko).map((e) => e.stats.spd));
  return Math.min(95, Math.max(20, 50 + (avg - maxEnemy) * 2 + 15 * failures));
}
