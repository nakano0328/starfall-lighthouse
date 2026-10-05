import { describe, expect, it } from 'vitest';

import { CHARACTERS, CHARACTER_IDS } from '@data/characters';
import { EQUIPMENT, equipmentFor, findEquip, getEquip } from '@data/equipment';

describe('equipment data', () => {
  it('has the 28 entries of GAME_DESIGN §7.2–7.4 with unique ids', () => {
    expect(EQUIPMENT).toHaveLength(28);
    expect(new Set(EQUIPMENT.map((e) => e.id)).size).toBe(28);
    expect(EQUIPMENT.filter((e) => e.slot === 'weapon')).toHaveLength(12);
    expect(EQUIPMENT.filter((e) => e.slot === 'armor')).toHaveLength(12);
    expect(EQUIPMENT.filter((e) => e.slot === 'accessory')).toHaveLength(4);
    for (const eq of EQUIPMENT) {
      expect(eq.id).toMatch(/^eq_(wp|ar|acc)_[a-z0-9_]+$/);
      expect(eq.name.length).toBeGreaterThan(0);
      expect(eq.description.length).toBeGreaterThan(0);
      expect(eq.allowed.length).toBeGreaterThan(0);
      expect(eq.price).toBeGreaterThanOrEqual(0);
      expect([1, 2, 3, 4]).toContain(eq.tier);
    }
  });

  it('keeps every initial equipment id resolvable and allowed for its owner', () => {
    for (const id of CHARACTER_IDS) {
      const { weapon, armor, accessory } = CHARACTERS[id].initialEquipment;
      for (const [slot, eqId] of [
        ['weapon', weapon],
        ['armor', armor],
        ['accessory', accessory],
      ] as const) {
        if (eqId === null) continue;
        const eq = getEquip(eqId);
        expect(eq.slot).toBe(slot);
        expect(eq.allowed).toContain(id);
      }
    }
  });

  it('binds weapons and armor to one character and accessories to everyone', () => {
    for (const eq of EQUIPMENT) {
      if (eq.slot === 'accessory') {
        expect(eq.allowed).toEqual(['ch_luka', 'ch_mio', 'ch_goro']);
        expect(eq.tier).toBe(2);
        expect(eq.element).toBeUndefined();
      } else {
        expect(eq.allowed).toHaveLength(1);
        expect(CHARACTER_IDS).toContain(eq.allowed[0]);
        expect(eq.id).toContain(`_${eq.allowed[0]?.replace('ch_', '')}`);
      }
      if (eq.slot !== 'weapon') expect(eq.element).toBeUndefined();
    }
    expect(equipmentFor('weapon', 'ch_luka').map((e) => e.id)).toEqual([
      'eq_wp_luka_1',
      'eq_wp_luka_2',
      'eq_wp_luka_3',
      'eq_wp_luka_4',
    ]);
    expect(equipmentFor('armor', 'ch_goro')).toHaveLength(4);
    expect(equipmentFor('accessory', 'ch_mio')).toHaveLength(4);
  });

  it('derives tiers from the id and shares armor icons per tier', () => {
    const tierOfArmor = { cloth: 1, leather: 2, chain: 3, star: 4 } as const;
    for (const eq of EQUIPMENT) {
      if (eq.slot === 'weapon') {
        expect(eq.tier).toBe(Number(eq.id.at(-1)));
        expect(eq.iconKey).toBe(`icon_${eq.id}`);
      } else if (eq.slot === 'armor') {
        const tierName = eq.id.split('_')[2] as keyof typeof tierOfArmor;
        expect(eq.tier).toBe(tierOfArmor[tierName]);
        expect(eq.iconKey).toBe(`icon_eq_ar_${tierName}`);
      } else {
        expect(eq.iconKey).toBe(`icon_${eq.id}`);
      }
    }
    const armorIcons = new Set(EQUIPMENT.filter((e) => e.slot === 'armor').map((e) => e.iconKey));
    expect([...armorIcons].sort()).toEqual([
      'icon_eq_ar_chain',
      'icon_eq_ar_cloth',
      'icon_eq_ar_leather',
      'icon_eq_ar_star',
    ]);
  });

  it('matches a few spec rows exactly', () => {
    expect(getEquip('eq_wp_luka_4')).toMatchObject({
      slot: 'weapon',
      allowed: ['ch_luka'],
      bonus: { atk: 32, luk: 5 },
      element: 'light',
      price: 0,
      tier: 4,
    });
    expect(getEquip('eq_wp_mio_1').bonus).toEqual({ atk: 4, spd: 2 });
    expect(getEquip('eq_wp_goro_4')).toMatchObject({
      bonus: { atk: 38, spd: -3 },
      element: 'earth',
    });
    expect(getEquip('eq_wp_goro_2')).toMatchObject({ bonus: { atk: 15 }, price: 500, tier: 2 });
    expect(getEquip('eq_wp_goro_2').element).toBeUndefined();
    expect(getEquip('eq_ar_star_goro')).toMatchObject({
      slot: 'armor',
      allowed: ['ch_goro'],
      bonus: { def: 28, hp: 40 },
      price: 0,
      tier: 4,
    });
    expect(getEquip('eq_ar_chain_goro').bonus).toEqual({ def: 18, spd: -2 });
    expect(getEquip('eq_ar_star_luka').bonus).toEqual({ def: 22, mp: 20 });
    expect(getEquip('eq_acc_sea_ring')).toMatchObject({
      slot: 'accessory',
      resist: { water: 0.5 },
      bonus: { spd: 5 },
      price: 0,
    });
    expect(getEquip('eq_acc_star_charm')).toMatchObject({ immune: ['poison'], bonus: { luk: 5 } });
    expect(getEquip('eq_acc_miner_badge')).toMatchObject({
      immune: ['paralyze'],
      bonus: { def: 6 },
    });
    expect(getEquip('eq_acc_lantern_pendant')).toMatchObject({
      immune: ['blind'],
      bonus: { luk: 10 },
    });
    expect(findEquip('eq_nope')).toBeUndefined();
    expect(() => getEquip('eq_nope')).toThrow();
  });
});
