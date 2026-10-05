import type { CharacterDef, CharacterId, Stats } from '@data/types';

import type { Inventory } from '../inventory';
import { MAX_LEVEL, levelFromExp } from '../party/exp';
import type { PartyMember } from '../party/member';
import { STAT_KEYS, statsAtLevel } from '../party/stats';
import { chance } from './rng';
import type { Rng } from './rng';
import type { Battler } from './types';

export interface DropResult {
  itemId: string;
  qty: number;
}

/** What a won battle yields (§5.10) before it is applied to the party. */
export interface BattleRewards {
  exp: number;
  gold: number;
  drops: DropResult[];
}

export interface LevelUp {
  memberIndex: number;
  id: CharacterId;
  from: number;
  to: number;
  gains: Stats;
  newSkills: string[];
}

export interface RewardOutcome {
  rewards: BattleRewards;
  /** EXP each member actually received (half for the fallen). */
  expByMember: number[];
  levelUps: LevelUp[];
}

/** Drop roll: `chance × (1 + max party LUK / 200)` per defeated enemy (§5.10). */
export function dropChance(baseChance: number, maxLuk: number): number {
  return Math.min(1, baseChance * (1 + maxLuk / 200));
}

/** Sums EXP/gold of the defeated enemies and rolls each one's drop. */
export function computeRewards(
  enemies: readonly Battler[],
  party: readonly Battler[],
  rng: Rng,
): BattleRewards {
  const defeated = enemies.filter((e) => e.ko);
  const maxLuk = Math.max(0, ...party.map((p) => p.stats.luk));
  const drops: DropResult[] = [];
  for (const e of defeated) {
    for (const drop of e.drops) {
      if (chance(rng, dropChance(drop.chance, maxLuk))) {
        drops.push({ itemId: drop.itemId, qty: drop.qty ?? 1 });
      }
    }
  }
  return {
    exp: defeated.reduce((s, e) => s + e.exp, 0),
    gold: defeated.reduce((s, e) => s + e.gold, 0),
    drops,
  };
}

/**
 * Grants EXP (full to survivors, half to the fallen), gold and drops, returning
 * the level-ups for the result screen. HP/MP write-back happens in
 * `syncPartyAfterBattle`, which the caller runs first so KO状態 is final here.
 */
export function applyRewards(
  rewards: BattleRewards,
  members: PartyMember[],
  character: (id: CharacterId) => CharacterDef,
  inventory: Inventory,
  wallet: { gold: number },
): RewardOutcome {
  const expByMember: number[] = [];
  const levelUps: LevelUp[] = [];
  members.forEach((member, memberIndex) => {
    const def = character(member.id);
    const gained = member.ko ? Math.floor(rewards.exp / 2) : rewards.exp;
    const from = levelFromExp(member.exp);
    member.exp += gained;
    const to = Math.min(MAX_LEVEL, levelFromExp(member.exp));
    expByMember.push(gained);
    if (to > from) {
      const before = statsAtLevel(def.base, def.growth, from);
      const after = statsAtLevel(def.base, def.growth, to);
      const gains = { ...after };
      for (const key of STAT_KEYS) gains[key] = after[key] - before[key];
      // Max HP/MP growth is granted immediately so the member is not left short.
      member.hp = Math.min(after.hp, member.hp + gains.hp);
      member.mp = Math.min(after.mp, member.mp + gains.mp);
      levelUps.push({
        memberIndex,
        id: member.id,
        from,
        to,
        gains,
        newSkills: def.skills.filter((s) => s.level > from && s.level <= to).map((s) => s.skillId),
      });
    }
  });
  wallet.gold += rewards.gold;
  for (const drop of rewards.drops) inventory.add(drop.itemId, drop.qty);
  return { rewards, expByMember, levelUps };
}

/**
 * Copies battle HP/MP back to the members. Anyone still KO comes back at HP 1
 * and every battle status is dropped (§5.6).
 */
export function syncPartyAfterBattle(party: readonly Battler[], members: PartyMember[]): void {
  for (const b of party) {
    const member = b.memberIndex === undefined ? undefined : members[b.memberIndex];
    if (!member) continue;
    member.hp = b.ko ? 1 : Math.max(1, b.hp);
    member.mp = b.mp;
    member.ko = false;
    member.statuses = [];
  }
}
