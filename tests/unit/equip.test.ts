import { describe, expect, it } from 'vitest';

import { Inventory } from '@core/inventory';
import {
  EQUIP_SLOTS,
  EQUIP_SLOT_NAMES,
  changeEquipment,
  clampToStats,
  equipCandidates,
  formatDelta,
  statDelta,
} from '@core/party/equip';
import { createMember } from '@core/party/member';
import { CHARACTERS } from '@data/characters';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';

const maxQtyOf = (id: string): number => findItem(id)?.maxQty ?? 99;

describe('equipment changes', () => {
  it('lists only pieces for the slot that the character may wear', () => {
    const bag = new Inventory(maxQtyOf, [
      { itemId: 'eq_wp_luka_2', qty: 1 },
      { itemId: 'eq_wp_mio_2', qty: 1 },
      { itemId: 'eq_ar_leather_luka', qty: 1 },
      { itemId: 'eq_acc_sea_ring', qty: 1 },
      { itemId: 'it_herb', qty: 3 },
    ]);
    expect(equipCandidates(CHARACTERS.ch_luka, 'weapon', bag, findEquip).map((e) => e.id)).toEqual([
      'eq_wp_luka_2',
    ]);
    expect(equipCandidates(CHARACTERS.ch_mio, 'weapon', bag, findEquip).map((e) => e.id)).toEqual([
      'eq_wp_mio_2',
    ]);
    expect(
      equipCandidates(CHARACTERS.ch_goro, 'accessory', bag, findEquip).map((e) => e.id),
    ).toEqual(['eq_acc_sea_ring']);
    expect(equipCandidates(CHARACTERS.ch_goro, 'armor', bag, findEquip)).toEqual([]);
    expect(EQUIP_SLOTS).toEqual(['weapon', 'armor', 'accessory']);
    expect(EQUIP_SLOT_NAMES.weapon).toBe('武器');
  });

  it('reports the stat difference of a swap and of removing a piece', () => {
    const luka = createMember(CHARACTERS.ch_luka);
    const toTier2 = statDelta(CHARACTERS.ch_luka, luka, 'weapon', 'eq_wp_luka_2', findEquip);
    expect(toTier2.atk).toBeGreaterThan(0);
    expect(toTier2.hp).toBe(0);
    const remove = statDelta(CHARACTERS.ch_luka, luka, 'weapon', null, findEquip);
    expect(remove.atk).toBe(-5);
    expect(formatDelta(3)).toBe('▲3');
    expect(formatDelta(-2)).toBe('▼2');
    expect(formatDelta(0)).toBe('');
  });

  it('swaps the worn piece with one from the bag and back', () => {
    const luka = createMember(CHARACTERS.ch_luka);
    const bag = new Inventory(maxQtyOf, [{ itemId: 'eq_wp_luka_2', qty: 1 }]);
    expect(changeEquipment(luka, 'weapon', 'eq_wp_luka_2', bag)).toBe(true);
    expect(luka.equipment.weapon).toBe('eq_wp_luka_2');
    expect(bag.count('eq_wp_luka_2')).toBe(0);
    expect(bag.count('eq_wp_luka_1')).toBe(1);
    expect(changeEquipment(luka, 'weapon', null, bag)).toBe(true);
    expect(luka.equipment.weapon).toBeNull();
    expect(bag.count('eq_wp_luka_2')).toBe(1);
    expect(changeEquipment(luka, 'armor', 'eq_ar_star_luka', bag)).toBe(false);
    expect(luka.equipment.armor).toBe('eq_ar_cloth_luka');
  });

  it('clamps HP/MP to the new maximums', () => {
    const luka = createMember(CHARACTERS.ch_luka);
    luka.hp = 100;
    luka.mp = 50;
    clampToStats(luka, { hp: 42, mp: 12, atk: 0, def: 0, spd: 0, luk: 0 });
    expect(luka.hp).toBe(42);
    expect(luka.mp).toBe(12);
  });
});
