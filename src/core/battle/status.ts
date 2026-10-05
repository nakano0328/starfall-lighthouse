import type { StatusKey } from '@data/types';

import { chance } from './rng';
import type { Rng } from './rng';
import type { BattleStatus, Battler } from './types';
import { STATUS_TURNS } from './types';

const AILMENTS: readonly StatusKey[] = ['poison', 'paralyze', 'blind', 'def_down', 'atk_up'];

export function hasStatus(b: Battler, status: BattleStatus): boolean {
  return b.statuses.some((s) => s.status === status);
}

/** Adds or refreshes a status (再付与で継続ターンをリセット、重ね掛けなし). */
export function setStatus(b: Battler, status: BattleStatus, turns = STATUS_TURNS[status]): void {
  const existing = b.statuses.find((s) => s.status === status);
  if (existing) existing.turns = turns;
  else b.statuses.push({ status, turns });
}

export function clearStatus(b: Battler, status: BattleStatus): boolean {
  const before = b.statuses.length;
  b.statuses = b.statuses.filter((s) => s.status !== status);
  return b.statuses.length !== before;
}

/**
 * Rolls a status application: 付与% = chance × (1 − resist); equipment immunity blocks.
 * Returns 'applied' | 'resisted' | 'immune'.
 */
export function tryApplyStatus(
  target: Battler,
  status: BattleStatus,
  probability: number,
  turns: number,
  rng: Rng,
): 'applied' | 'resisted' | 'immune' {
  if (isAilment(status)) {
    if (target.immune.includes(status)) return 'immune';
    const resist = target.statusResist[status] ?? 0;
    if (resist >= 1) return 'immune';
    if (!chance(rng, probability * (1 - resist))) return 'resisted';
  } else if (!chance(rng, probability)) {
    return 'resisted';
  }
  setStatus(target, status, turns);
  return 'applied';
}

export function isAilment(status: BattleStatus): status is StatusKey {
  return (AILMENTS as readonly string[]).includes(status);
}

export interface TickResult {
  poisonDamage: number;
  expired: BattleStatus[];
}

/**
 * End-of-action tick for the actor (§5.6): poison deals 8% of max HP (min 3),
 * every timed status loses a turn, expired ones are removed. Harden expiring
 * leaves 1 turn of ひび割れ (§8.3).
 */
export function tickStatuses(b: Battler): TickResult {
  const result: TickResult = { poisonDamage: 0, expired: [] };
  if (b.ko) return result;
  if (hasStatus(b, 'poison')) {
    result.poisonDamage = Math.max(3, Math.floor(b.stats.hp * 0.08));
  }
  const remaining: typeof b.statuses = [];
  for (const s of b.statuses) {
    if (s.status === 'charging') {
      remaining.push(s);
      continue;
    }
    s.turns -= 1;
    if (s.turns > 0) remaining.push(s);
    else result.expired.push(s.status);
  }
  b.statuses = remaining;
  if (result.expired.includes('harden')) setStatus(b, 'cracked', STATUS_TURNS.cracked);
  return result;
}

/** Everything is cleared when a battle ends (§5.6). */
export function clearAllStatuses(b: Battler): void {
  b.statuses = [];
  b.guarding = false;
  b.charge = 0;
  b.lightDamageWhileCharging = 0;
}
