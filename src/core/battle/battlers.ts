import type { CharacterDef, Element, EnemyDef, EquipDef, Stats, StatusKey } from '@data/types';

import type { PartyMember } from '../party/member';
import { memberLevel } from '../party/member';
import { addBonuses, statsAtLevel } from '../party/stats';
import type { Battler } from './types';

export interface EquipResolver {
  (id: string): EquipDef | undefined;
}

/** Party stats including equipment bonuses (§6.3). */
export function equippedStats(def: CharacterDef, member: PartyMember, equip: EquipResolver): Stats {
  const base = statsAtLevel(def.base, def.growth, memberLevel(member));
  const bonuses = [member.equipment.weapon, member.equipment.armor, member.equipment.accessory]
    .map((id) => (id === null ? undefined : equip(id)?.bonus))
    .filter((b): b is Partial<Stats> => b !== undefined);
  return addBonuses(base, ...bonuses);
}

export function createPartyBattler(
  index: number,
  def: CharacterDef,
  member: PartyMember,
  equip: EquipResolver,
): Battler {
  const stats = equippedStats(def, member, equip);
  const level = memberLevel(member);
  const weapon = member.equipment.weapon === null ? undefined : equip(member.equipment.weapon);
  const pieces = [member.equipment.weapon, member.equipment.armor, member.equipment.accessory]
    .map((id) => (id === null ? undefined : equip(id)))
    .filter((e): e is EquipDef => e !== undefined);
  const elementMultiplier: Partial<Record<Element, number>> = {};
  const immune = new Set<StatusKey>();
  for (const p of pieces) {
    for (const [el, mul] of Object.entries(p.resist ?? {})) {
      const key = el as Element;
      elementMultiplier[key] = (elementMultiplier[key] ?? 1) * mul;
    }
    for (const s of p.immune ?? []) immune.add(s);
  }
  return {
    key: `p${index}`,
    side: 'party',
    id: def.id,
    name: def.name,
    level,
    stats,
    hp: Math.min(member.hp, stats.hp),
    mp: Math.min(member.mp, stats.mp),
    ko: member.ko || member.hp <= 0,
    statuses: member.statuses.map((s) => ({ status: s, turns: 99 })),
    guarding: false,
    weaponElement: weapon?.element ?? 'none',
    elementMultiplier,
    immune: [...immune],
    statusResist: {},
    tags: [],
    skills: def.skills.filter((s) => s.level <= level).map((s) => s.skillId),
    memberIndex: index,
    ai: [],
    usedOnce: new Set(),
    charge: 0,
    extraActs: 0,
    lightDamageWhileCharging: 0,
    isBoss: false,
    exp: 0,
    gold: 0,
    drops: [],
  };
}

export function createEnemyBattler(index: number, def: EnemyDef): Battler {
  const elementMultiplier: Partial<Record<Element, number>> = {};
  for (const w of def.weak) elementMultiplier[w] = 1.5;
  for (const r of def.resist) elementMultiplier[r] = 0.5;
  const battler: Battler = {
    key: `e${index}`,
    side: 'enemy',
    id: def.id,
    name: def.name,
    level: def.level,
    stats: { ...def.stats, luk: def.stats.luk ?? 0 },
    hp: def.stats.hp,
    mp: def.stats.mp,
    ko: false,
    statuses: [],
    guarding: false,
    weaponElement: 'none',
    elementMultiplier,
    immune: [],
    statusResist: { ...def.statusResist },
    tags: [...(def.tags ?? [])],
    skills: def.ai.map((r) => r.action).filter((a) => a.startsWith('sk_')),
    ai: def.ai.map((r) => ({ ...r })),
    usedOnce: new Set(),
    charge: 0,
    extraActs: 0,
    lightDamageWhileCharging: 0,
    isBoss: def.isBoss,
    exp: def.exp,
    gold: def.gold,
    drops: def.drops.map((d) => ({ ...d })),
  };
  if (def.phaseNext !== undefined) battler.phaseNext = def.phaseNext;
  return battler;
}
