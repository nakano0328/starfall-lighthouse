import { describe, expect, it } from 'vitest';

import { chooseAction, conditionHolds, resolveTargets } from '@core/battle/ai';
import type { AiContext } from '@core/battle/ai';
import { createEnemyBattler, createPartyBattler, equippedStats } from '@core/battle/battlers';
import {
  BASIC_ATTACK,
  attackSpecFromSkill,
  computeDamage,
  computeHeal,
  computeItemDamage,
  critChance,
  escapeChance,
  hitChance,
} from '@core/battle/damage';
import { chance, fixedRng, mathRng, pick, rand, seededRng, weightedPick } from '@core/battle/rng';
import {
  clearAllStatuses,
  clearStatus,
  hasStatus,
  setStatus,
  tickStatuses,
  tryApplyStatus,
} from '@core/battle/status';
import type { Battler } from '@core/battle/types';
import { STATUS_NAMES, STATUS_TURNS } from '@core/battle/types';
import { expForLevel } from '@core/party/exp';
import { createMember } from '@core/party/member';
import { CHARACTERS } from '@data/characters';
import { getEnemy } from '@data/enemies';
import { findEquip } from '@data/equipment';
import { getSkill } from '@data/skills';
import type { AiRule } from '@data/types';

function luka(level = 1): Battler {
  const member = createMember(CHARACTERS.ch_luka, expForLevel(level));
  return createPartyBattler(0, CHARACTERS.ch_luka, member, findEquip);
}

function enemy(id: string, index = 0): Battler {
  return createEnemyBattler(index, getEnemy(id));
}

describe('rng helpers', () => {
  it('replays fixed values, seeds deterministically and derives ranges', () => {
    const fixed = fixedRng([0.25, 0.75]);
    expect([fixed.next(), fixed.next(), fixed.next()]).toEqual([0.25, 0.75, 0.25]);
    expect(fixedRng([]).next()).toBe(0);
    const a = seededRng(3);
    const b = seededRng(3);
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(rand(fixedRng([0.5]), 0.9, 1.1)).toBeCloseTo(1.0);
    expect(chance(fixedRng([0.5]), 0)).toBe(false);
    expect(chance(fixedRng([0.5]), 1)).toBe(true);
    expect(chance(fixedRng([0.5]), 0.6)).toBe(true);
    expect(pick(fixedRng([0.99]), ['a', 'b'])).toBe('b');
    expect(pick(fixedRng([0.5]), [])).toBeUndefined();
    expect(
      weightedPick(fixedRng([0.7]), [
        { item: 'x', weight: 60 },
        { item: 'y', weight: 40 },
      ]),
    ).toBe('y');
    expect(weightedPick(fixedRng([0.5]), [{ item: 'only', weight: 0 }])).toBe('only');
    expect(weightedPick(fixedRng([0.5]), [])).toBeUndefined();
    const m = mathRng.next();
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(1);
  });
});

describe('battlers', () => {
  it('folds equipment into party stats, elements, resistances and immunities', () => {
    const member = createMember(CHARACTERS.ch_luka, expForLevel(30));
    member.equipment = {
      weapon: 'eq_wp_luka_4',
      armor: 'eq_ar_cloth_luka',
      accessory: 'eq_acc_sea_ring',
    };
    member.hp = 10;
    member.statuses = ['poison'];
    const stats = equippedStats(CHARACTERS.ch_luka, member, findEquip);
    expect(stats.atk).toBe(96 + 32);
    const b = createPartyBattler(2, CHARACTERS.ch_luka, member, findEquip);
    expect(b.key).toBe('p2');
    expect(b.memberIndex).toBe(2);
    expect(b.weaponElement).toBe('light');
    expect(b.elementMultiplier.water).toBe(0.5);
    expect(b.hp).toBe(10);
    expect(b.statuses).toEqual([{ status: 'poison', turns: 99 }]);
    expect(b.skills).toHaveLength(8);
    expect(b.drops).toEqual([]);
  });

  it('treats unknown equipment ids as empty slots', () => {
    const member = createMember(CHARACTERS.ch_mio);
    member.equipment = { weapon: 'eq_wp_missing', armor: null, accessory: null };
    const b = createPartyBattler(0, CHARACTERS.ch_mio, member, findEquip);
    expect(b.weaponElement).toBe('none');
    expect(b.stats.atk).toBe(8);
  });

  it('builds enemies with weak/resist multipliers, AI skills and drops', () => {
    const golem = enemy('bo_rock_golem');
    expect(golem.key).toBe('e0');
    expect(golem.elementMultiplier).toEqual({ fire: 1.5, earth: 0.5 });
    expect(golem.statusResist.paralyze).toBe(1);
    expect(golem.skills).toContain('sk_bo_harden');
    expect(golem.isBoss).toBe(true);
    expect(golem.drops[0]?.itemId).toBe('it_fragment_2');
    expect(golem.phaseNext).toBeUndefined();
    expect(enemy('bo_nox_phase1').phaseNext).toBe('bo_nox_phase2');
    expect(enemy('en_shadow_hand').tags).toEqual(['shadow']);
  });
});

describe('damage formulas', () => {
  it('computes hit chance with the §5.4 clamps and modifiers', () => {
    const a = luka();
    const t = enemy('en_lost_star_slime');
    expect(hitChance(a, t, 95)).toBe(96);
    expect(hitChance(a, t, 30)).toBe(60);
    expect(hitChance(a, t, 200)).toBe(100);
    setStatus(a, 'blind');
    expect(hitChance(a, t, 95)).toBeCloseTo(57.6);
    setStatus(t, 'paralyze');
    expect(hitChance(a, t, 95)).toBe(100);
  });

  it('computes crit chance from LUK with bonus and cap', () => {
    const a = luka();
    expect(critChance(a, 0)).toBe(6);
    expect(critChance(a, 20)).toBe(26);
    expect(critChance(a, 100)).toBe(50);
    a.stats = { ...a.stats, luk: 0 };
    expect(critChance(a, -10)).toBe(0);
  });

  it('applies the physical and magic formulas with every multiplier', () => {
    const a = luka();
    const t = enemy('en_lost_star_slime');
    const physical = { ...BASIC_ATTACK, element: 'none' as const };
    expect(computeDamage(a, t, physical, fixedRng([0.5]))).toEqual({
      amount: 12,
      crit: false,
      weak: false,
      immune: false,
      element: 'none',
    });
    // Crit roll 0 < 6%, then spread 1.0 → 12 × 1.5 = 18.
    expect(computeDamage(a, t, physical, fixedRng([0, 0.5])).amount).toBe(18);
    t.guarding = true;
    expect(computeDamage(a, t, physical, fixedRng([0.5])).amount).toBe(6);
    t.guarding = false;
    setStatus(a, 'atk_up');
    // 14 × 1.3 = 18.2 − 2 = 16.2 → 16.
    expect(computeDamage(a, t, physical, fixedRng([0.5])).amount).toBe(16);
    clearStatus(a, 'atk_up');
    setStatus(t, 'def_down');
    // DEF 4 × 0.7 = 2.8 → 14 − 1.4 = 12.6 → 12.
    expect(computeDamage(a, t, physical, fixedRng([0.5])).amount).toBe(12);
    setStatus(t, 'cracked');
    // DEF 2.8 × 0.5 = 1.4 → 14 − 0.7 = 13.3 → 13.
    expect(computeDamage(a, t, physical, fixedRng([0.5])).amount).toBe(13);
    clearAllStatuses(t);

    const star = attackSpecFromSkill(getSkill('sk_star_light'), a.weaponElement);
    expect(star).toMatchObject({ kind: 'magic', element: 'light', accuracy: 95 });
    // Slime resists light: (14 × 1.2 + 6 − 1) × 0.5 = 10.8 → 10.
    expect(computeDamage(a, t, star, fixedRng([0.5]))).toMatchObject({ amount: 10, weak: false });
    const wolf = enemy('en_forest_wolf');
    const magicWeak = computeDamage(a, wolf, { ...star, element: 'fire' }, fixedRng([0.5]));
    expect(magicWeak.weak).toBe(true);

    setStatus(t, 'harden');
    expect(computeDamage(a, t, physical, fixedRng([0.5]))).toMatchObject({
      amount: 0,
      immune: true,
    });
    // Harden ×1.5 on magic: 10.8 × 1.5 = 16.2 → 16.
    expect(computeDamage(a, t, star, fixedRng([0.5])).amount).toBe(16);
    clearAllStatuses(t);
    setStatus(t, 'water_veil');
    expect(computeDamage(a, t, star, fixedRng([0.5])).amount).toBe(5);
    // Weapon element follows the skill's 'weapon' marker.
    a.weaponElement = 'earth';
    expect(attackSpecFromSkill(getSkill('sk_heavy_slash'), a.weaponElement).element).toBe('earth');
  });

  it('never drops below 1 and ignores defence for items', () => {
    const a = luka();
    const golem = enemy('bo_rock_golem');
    expect(
      computeDamage(a, golem, { ...BASIC_ATTACK, element: 'none' }, fixedRng([0.5])).amount,
    ).toBe(1);
    expect(computeItemDamage(golem, 80, 'fire', fixedRng([0.5]))).toMatchObject({
      amount: 120,
      weak: true,
      crit: false,
    });
    golem.guarding = true;
    expect(computeItemDamage(golem, 80, 'fire', fixedRng([0.5])).amount).toBe(60);
    golem.guarding = false;
    setStatus(golem, 'harden');
    expect(computeItemDamage(golem, 80, 'fire', fixedRng([0.5])).amount).toBe(180);
  });

  it('rolls heals and escape chance per §5.3 / §5.9', () => {
    const a = luka(3);
    expect(computeHeal(a, getSkill('sk_first_aid'), fixedRng([0.5]))).toBe(34);
    expect(computeHeal(a, getSkill('sk_first_aid'), fixedRng([0]))).toBe(32);
    const party = [luka(), luka()];
    const enemies = [enemy('en_lost_star_slime')];
    expect(escapeChance(party, enemies, 0)).toBe(54);
    expect(escapeChance(party, enemies, 3)).toBe(95);
    party[0]!.ko = true;
    expect(escapeChance(party, enemies, 0)).toBe(54);
    for (const p of party) p.ko = true;
    expect(escapeChance(party, enemies, 0)).toBe(38);
    enemies[0]!.stats = { ...enemies[0]!.stats, spd: 60 };
    expect(escapeChance([luka()], enemies, 0)).toBe(20);
  });
});

describe('statuses', () => {
  it('sets, refreshes and clears statuses', () => {
    const b = luka();
    setStatus(b, 'poison');
    expect(b.statuses).toEqual([{ status: 'poison', turns: STATUS_TURNS.poison }]);
    b.statuses[0]!.turns = 1;
    setStatus(b, 'poison');
    expect(b.statuses[0]?.turns).toBe(5);
    expect(hasStatus(b, 'poison')).toBe(true);
    expect(clearStatus(b, 'poison')).toBe(true);
    expect(clearStatus(b, 'poison')).toBe(false);
    expect(STATUS_NAMES.taunt).toBe('挑発');
  });

  it('rolls application against resistance and immunity', () => {
    const b = luka();
    expect(tryApplyStatus(b, 'poison', 0.9, 5, fixedRng([0.5]))).toBe('applied');
    expect(tryApplyStatus(b, 'blind', 0.3, 4, fixedRng([0.5]))).toBe('resisted');
    b.immune = ['blind'];
    expect(tryApplyStatus(b, 'blind', 1, 4, fixedRng([0]))).toBe('immune');
    b.statusResist = { paralyze: 1, def_down: 0.5 };
    expect(tryApplyStatus(b, 'paralyze', 1, 2, fixedRng([0]))).toBe('immune');
    expect(tryApplyStatus(b, 'def_down', 0.8, 3, fixedRng([0.5]))).toBe('resisted');
    expect(tryApplyStatus(b, 'def_down', 0.8, 3, fixedRng([0.3]))).toBe('applied');
    expect(tryApplyStatus(b, 'taunt', 1, 3, fixedRng([0.99]))).toBe('applied');
    expect(tryApplyStatus(b, 'harden', 0.5, 2, fixedRng([0.7]))).toBe('resisted');
  });

  it('ticks poison, counts down, cracks after harden and keeps charging', () => {
    const b = enemy('bo_rock_golem');
    setStatus(b, 'poison');
    setStatus(b, 'harden', 1);
    setStatus(b, 'charging');
    const tick = tickStatuses(b);
    expect(tick.poisonDamage).toBe(88);
    expect(tick.expired).toEqual(['harden']);
    expect(hasStatus(b, 'cracked')).toBe(true);
    expect(hasStatus(b, 'charging')).toBe(true);
    expect(b.statuses.find((s) => s.status === 'poison')?.turns).toBe(4);

    const small = luka();
    setStatus(small, 'poison');
    expect(tickStatuses(small).poisonDamage).toBe(3);
    small.ko = true;
    expect(tickStatuses(small)).toEqual({ poisonDamage: 0, expired: [] });

    b.guarding = true;
    b.charge = 2;
    clearAllStatuses(b);
    expect(b.statuses).toEqual([]);
    expect(b.guarding).toBe(false);
    expect(b.charge).toBe(0);
  });
});

describe('enemy AI', () => {
  function ctx(party: Battler[], enemies: Battler[], round = 1): AiContext {
    return { round, party, enemies };
  }

  it('evaluates every condition type', () => {
    const self = enemy('bo_nox_phase2');
    const p = luka();
    const c = ctx([p], [self, enemy('en_lost_star_slime', 1)], 6);
    expect(conditionHolds({ type: 'always' }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'hp_below', ratio: 0.5 }, self, c)).toBe(false);
    self.hp = 100;
    expect(conditionHolds({ type: 'hp_below', ratio: 0.5 }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'turn_every', n: 3 }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'turn_every', n: 4 }, self, c)).toBe(false);
    expect(conditionHolds({ type: 'turn_every', n: 0 }, self, c)).toBe(false);
    expect(conditionHolds({ type: 'turn_eq', n: 6 }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'ally_count_below', n: 3 }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'ally_count_below', n: 2 }, self, c)).toBe(false);
    expect(conditionHolds({ type: 'party_has_status', status: 'blind' }, self, c)).toBe(false);
    setStatus(p, 'blind');
    expect(conditionHolds({ type: 'party_has_status', status: 'blind' }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'self_has_status', status: 'harden' }, self, c)).toBe(false);
    setStatus(self, 'harden');
    expect(conditionHolds({ type: 'self_has_status', status: 'harden' }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'not_self_status', status: 'harden' }, self, c)).toBe(false);
    expect(conditionHolds({ type: 'not_self_status', status: 'charging' }, self, c)).toBe(true);
    self.charge = 1;
    expect(conditionHolds({ type: 'self_has_status', status: 'charging' }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'charge', n: 1 }, self, c)).toBe(true);
    expect(conditionHolds({ type: 'charge', n: 2 }, self, c)).toBe(false);
    expect(
      conditionHolds(
        {
          type: 'all',
          conds: [
            { type: 'charge', n: 1 },
            { type: 'turn_eq', n: 6 },
          ],
        },
        self,
        c,
      ),
    ).toBe(true);
    expect(
      conditionHolds(
        {
          type: 'all',
          conds: [
            { type: 'charge', n: 1 },
            { type: 'turn_eq', n: 7 },
          ],
        },
        self,
        c,
      ),
    ).toBe(false);
  });

  it('takes the top priority group, rolls by weight and spends once-rules', () => {
    const self = enemy('en_lost_star_slime');
    const rules: AiRule[] = [
      { priority: 0, cond: { type: 'always' }, action: 'attack', target: 'random', weight: 60 },
      {
        priority: 0,
        cond: { type: 'always' },
        action: 'sk_en_star_spit',
        target: 'random',
        weight: 40,
      },
      {
        priority: 5,
        cond: { type: 'turn_eq', n: 2 },
        action: 'sk_en_howl',
        target: 'self',
        weight: 1,
        once: true,
      },
      {
        priority: 9,
        cond: { type: 'hp_below', ratio: 0.1 },
        action: 'guard',
        target: 'self',
        weight: 1,
      },
    ];
    self.ai = rules;
    const party = [luka()];
    const c1 = ctx(party, [self], 1);
    expect(chooseAction(self, c1, fixedRng([0.1]))?.action).toBe('attack');
    expect(chooseAction(self, c1, fixedRng([0.9]))?.action).toBe('sk_en_star_spit');
    const c2 = ctx(party, [self], 2);
    const once = chooseAction(self, c2, fixedRng([0.5]));
    expect(once).toMatchObject({ action: 'sk_en_howl', ruleIndex: 2, targetKeys: ['e0'] });
    expect(chooseAction(self, c2, fixedRng([0.5]))?.action).not.toBe('sk_en_howl');
    self.ai = [];
    expect(chooseAction(self, c1, fixedRng([0.5]))).toBeNull();
  });

  it('resolves targets, honouring taunt for random and lowest_hp', () => {
    const self = enemy('en_lost_star_slime');
    const ally = enemy('en_lost_star_slime', 1);
    const a = luka();
    const b = luka();
    b.key = 'p1';
    b.hp = 1;
    const c = ctx([a, b], [self, ally]);
    expect(resolveTargets('lowest_hp', self, c, fixedRng([0.5]))).toEqual(['p1']);
    expect(resolveTargets('highest_atk', self, c, fixedRng([0.5]))).toEqual(['p0']);
    expect(resolveTargets('all', self, c, fixedRng([0.5]))).toEqual(['p0', 'p1']);
    expect(resolveTargets('self', self, c, fixedRng([0.5]))).toEqual(['e0']);
    expect(resolveTargets('ally_random', self, c, fixedRng([0.99]))).toEqual(['e1']);
    expect(resolveTargets('random', self, c, fixedRng([0]))).toEqual(['p0']);
    setStatus(a, 'taunt');
    expect(resolveTargets('random', self, c, fixedRng([0.99]))).toEqual(['p0']);
    expect(resolveTargets('lowest_hp', self, c, fixedRng([0.5]))).toEqual(['p0']);
    for (const p of [a, b]) p.ko = true;
    expect(resolveTargets('random', self, c, fixedRng([0.5]))).toEqual([]);
    expect(resolveTargets('lowest_hp', self, c, fixedRng([0.5]))).toEqual([]);
    expect(resolveTargets('highest_atk', self, c, fixedRng([0.5]))).toEqual([]);
    ally.ko = true;
    self.ko = true;
    expect(resolveTargets('ally_random', self, c, fixedRng([0.5]))).toEqual([]);
  });
});
