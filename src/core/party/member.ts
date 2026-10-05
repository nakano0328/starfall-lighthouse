import type { CharacterDef, CharacterId, ItemDef, Stats, StatusKey } from '@data/types';

import { levelFromExp } from './exp';
import { statsAtLevel } from './stats';

/** Persistent per-member state (matches the save v2 shape in GAME_DESIGN §12.2). */
export interface PartyMember {
  id: CharacterId;
  exp: number;
  hp: number;
  mp: number;
  ko: boolean;
  equipment: { weapon: string | null; armor: string | null; accessory: string | null };
  /** Field-persistent ailments (poison etc.). Cleared by items, inns and skills. */
  statuses: StatusKey[];
}

export function createMember(def: CharacterDef, exp = 0): PartyMember {
  const stats = statsAtLevel(def.base, def.growth, levelFromExp(exp));
  return {
    id: def.id,
    exp,
    hp: stats.hp,
    mp: stats.mp,
    ko: false,
    equipment: { ...def.initialEquipment },
    statuses: [],
  };
}

export function memberLevel(member: PartyMember): number {
  return levelFromExp(member.exp);
}

/** Stats without equipment (equipment bonuses arrive with the equipment data). */
export function memberStats(def: CharacterDef, member: PartyMember): Stats {
  return statsAtLevel(def.base, def.growth, memberLevel(member));
}

export type FieldUseResult =
  { ok: true; message: string } | { ok: false; reason: 'not_usable' | 'no_effect' };

/**
 * Applies a consumable to a member outside battle (menu → アイテム → つかう).
 * Returns a message for the UI, or why nothing happened. Does not touch the
 * inventory; the caller removes the item when `ok`.
 */
export function useItemOnMember(
  item: ItemDef,
  def: CharacterDef,
  member: PartyMember,
): FieldUseResult {
  if (!item.usableInField) return { ok: false, reason: 'not_usable' };
  const max = memberStats(def, member);
  const name = def.name;
  switch (item.effect.type) {
    case 'heal_hp': {
      if (member.ko) return { ok: false, reason: 'no_effect' };
      if (member.hp >= max.hp) return { ok: false, reason: 'no_effect' };
      const amount = item.effect.amount === 'full' ? max.hp : item.effect.amount;
      const healed = Math.min(amount, max.hp - member.hp);
      member.hp += healed;
      return { ok: true, message: `${name}の HP が ${healed} 回復した。` };
    }
    case 'heal_mp': {
      if (member.ko) return { ok: false, reason: 'no_effect' };
      if (member.mp >= max.mp) return { ok: false, reason: 'no_effect' };
      const amount = item.effect.amount === 'full' ? max.mp : item.effect.amount;
      const healed = Math.min(amount, max.mp - member.mp);
      member.mp += healed;
      return { ok: true, message: `${name}の MP が ${healed} 回復した。` };
    }
    case 'cure': {
      const targets = item.effect.statuses;
      const before = member.statuses.length;
      member.statuses =
        targets === 'all' ? [] : member.statuses.filter((s) => !targets.includes(s));
      if (member.statuses.length === before) return { ok: false, reason: 'no_effect' };
      return { ok: true, message: `${name}の 状態異常が 治った。` };
    }
    case 'revive': {
      if (!member.ko) return { ok: false, reason: 'no_effect' };
      member.ko = false;
      member.hp = Math.max(1, Math.floor(max.hp * item.effect.hpRatio));
      return { ok: true, message: `${name}は 目を覚ました！` };
    }
    default:
      return { ok: false, reason: 'not_usable' };
  }
}
