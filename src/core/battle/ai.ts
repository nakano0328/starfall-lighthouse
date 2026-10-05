import type { AiCondition, AiRule, AiTarget } from '@data/types';

import { pick, weightedPick } from './rng';
import type { Rng } from './rng';
import { hasStatus } from './status';
import type { Battler } from './types';

export interface AiContext {
  round: number;
  party: readonly Battler[];
  enemies: readonly Battler[];
}

export interface AiDecision {
  rule: AiRule;
  ruleIndex: number;
  /** 'attack' | 'guard' | 'charge' | 'double_act' | skill id */
  action: string;
  targetKeys: string[];
}

export function conditionHolds(cond: AiCondition, self: Battler, ctx: AiContext): boolean {
  switch (cond.type) {
    case 'always':
      return true;
    case 'hp_below':
      return self.hp / self.stats.hp < cond.ratio;
    case 'turn_every':
      return cond.n > 0 && ctx.round % cond.n === 0;
    case 'turn_eq':
      return ctx.round === cond.n;
    case 'ally_count_below':
      return ctx.enemies.filter((e) => !e.ko).length < cond.n;
    case 'party_has_status':
      return ctx.party.some((p) => !p.ko && hasStatus(p, cond.status));
    case 'self_has_status':
      return cond.status === 'charging' ? self.charge > 0 : hasStatus(self, cond.status as never);
    case 'not_self_status':
      return cond.status === 'charging'
        ? self.charge === 0
        : !hasStatus(self, cond.status as never);
    case 'charge':
      return self.charge === cond.n;
    case 'all':
      return cond.conds.every((c) => conditionHolds(c, self, ctx));
  }
}

/**
 * Picks the enemy's action (§5.8): among rules whose condition holds (and that
 * are not spent `once` rules), take the highest priority group and roll by weight.
 */
export function chooseAction(self: Battler, ctx: AiContext, rng: Rng): AiDecision | null {
  const candidates = self.ai
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule, index }) => !self.usedOnce.has(index) && conditionHolds(rule.cond, self, ctx));
  if (candidates.length === 0) return null;
  const top = Math.max(...candidates.map((c) => c.rule.priority));
  const group = candidates.filter((c) => c.rule.priority === top);
  const chosen = weightedPick(
    rng,
    group.map((c) => ({ item: c, weight: c.rule.weight })),
  );
  if (!chosen) return null;
  if (chosen.rule.once) self.usedOnce.add(chosen.index);
  return {
    rule: chosen.rule,
    ruleIndex: chosen.index,
    action: chosen.rule.action,
    targetKeys: resolveTargets(chosen.rule.target, self, ctx, rng),
  };
}

/** Taunt (§5.6): single-target random/lowest_hp attacks go to the taunting member. */
export function resolveTargets(
  target: AiTarget,
  self: Battler,
  ctx: AiContext,
  rng: Rng,
): string[] {
  const alive = ctx.party.filter((p) => !p.ko);
  const taunter = alive.find((p) => hasStatus(p, 'taunt'));
  switch (target) {
    case 'random': {
      if (taunter) return [taunter.key];
      const t = pick(rng, alive);
      return t ? [t.key] : [];
    }
    case 'lowest_hp': {
      if (taunter) return [taunter.key];
      const sorted = [...alive].sort((a, b) => a.hp / a.stats.hp - b.hp / b.stats.hp);
      return sorted[0] ? [sorted[0].key] : [];
    }
    case 'highest_atk': {
      const sorted = [...alive].sort((a, b) => b.stats.atk - a.stats.atk);
      return sorted[0] ? [sorted[0].key] : [];
    }
    case 'all':
      return alive.map((p) => p.key);
    case 'self':
      return [self.key];
    case 'ally_random': {
      const t = pick(
        rng,
        ctx.enemies.filter((e) => !e.ko),
      );
      return t ? [t.key] : [];
    }
  }
}
