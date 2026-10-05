import type { CharacterDef, EquipDef, EquipSlot, Stats } from '@data/types';

import type { EquipResolver } from '../battle/battlers';
import { equippedStats } from '../battle/battlers';
import type { Inventory } from '../inventory';
import { STAT_KEYS } from './stats';
import type { PartyMember } from './member';

export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'armor', 'accessory'];

export const EQUIP_SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: '武器',
  armor: '防具',
  accessory: 'アクセサリ',
};

/**
 * Pieces in the bag this member may put in `slot` (docs/GAME_DESIGN.md §11.2:
 * 装備可のみ), in bag order. The currently worn piece is not in the bag.
 */
export function equipCandidates(
  def: CharacterDef,
  slot: EquipSlot,
  inventory: Inventory,
  equip: EquipResolver,
): EquipDef[] {
  const out: EquipDef[] = [];
  for (const entry of inventory.entries()) {
    const piece = equip(entry.itemId);
    if (piece && piece.slot === slot && piece.allowed.includes(def.id)) out.push(piece);
  }
  return out;
}

/** Stat change from swapping `slot` to `candidateId` (null = はずす): after − before. */
export function statDelta(
  def: CharacterDef,
  member: PartyMember,
  slot: EquipSlot,
  candidateId: string | null,
  equip: EquipResolver,
): Stats {
  const before = equippedStats(def, member, equip);
  const after = equippedStats(
    def,
    { ...member, equipment: { ...member.equipment, [slot]: candidateId } },
    equip,
  );
  const delta = { ...after };
  for (const key of STAT_KEYS) delta[key] = after[key] - before[key];
  return delta;
}

/**
 * Puts `newId` (from the bag) on the member and returns the old piece to the bag.
 * `null` just removes the current piece. Returns false when the bag does not
 * hold `newId`.
 */
export function changeEquipment(
  member: PartyMember,
  slot: EquipSlot,
  newId: string | null,
  inventory: Inventory,
): boolean {
  if (newId !== null && !inventory.has(newId)) return false;
  const old = member.equipment[slot];
  if (newId !== null) inventory.remove(newId, 1);
  member.equipment = { ...member.equipment, [slot]: newId };
  if (old !== null) inventory.add(old, 1);
  // HP/MP never exceed the new maximums.
  return true;
}

/** Clamps a member's HP/MP to the maximums of their current equipment. */
export function clampToStats(member: PartyMember, stats: Stats): void {
  member.hp = Math.min(member.hp, stats.hp);
  member.mp = Math.min(member.mp, stats.mp);
}

/** "▲3" / "▼2" / "" for the equipment list (§11.2 ステ差分を ▲▼ で表示). */
export function formatDelta(value: number): string {
  if (value > 0) return `▲${value}`;
  if (value < 0) return `▼${-value}`;
  return '';
}
