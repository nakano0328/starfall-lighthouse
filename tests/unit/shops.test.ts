import { describe, expect, it } from 'vitest';

import { evaluateCondition } from '@core/condition';
import { Flags } from '@core/flags';
import { EQUIPMENT, findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { SHOPS, findShop, getShop } from '@data/shops';

const stockIds = (shopId: string): string[] => getShop(shopId).stock.map((e) => e.id);

const gearOfTier = (tier: number): string[] =>
  EQUIPMENT.filter((e) => e.tier === tier && e.slot !== 'accessory').map((e) => e.id);

describe('shops data', () => {
  it('has the 4 shops of GAME_DESIGN §7.5 with unique shop_ ids', () => {
    expect(SHOPS).toHaveLength(4);
    expect(new Set(SHOPS.map((s) => s.id)).size).toBe(4);
    expect(SHOPS.map((s) => s.id)).toEqual([
      'shop_minato',
      'shop_hagane_items',
      'shop_hagane_arms',
      'shop_camp',
    ]);
    for (const s of SHOPS) {
      expect(s.id).toMatch(/^shop_[a-z0-9_]+$/);
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.stock.length).toBeGreaterThan(0);
      expect(new Set(s.stock.map((e) => e.id)).size, `${s.id} lists an id twice`).toBe(
        s.stock.length,
      );
    }
  });

  it('sells only existing items or equipment, never at price 0', () => {
    for (const s of SHOPS) {
      for (const entry of s.stock) {
        expect(entry.id).toMatch(/^(it|eq)_[a-z0-9_]+$/);
        const def = findItem(entry.id) ?? findEquip(entry.id);
        expect(def, `${s.id} → ${entry.id}`).toBeDefined();
        expect(def?.price, `${s.id} → ${entry.id} has no price`).toBeGreaterThan(0);
      }
    }
  });

  it('gates entries with well-formed §9.3 conditions that are closed on a fresh save', () => {
    const fresh = Flags.wrap({});
    let gated = 0;
    for (const s of SHOPS) {
      for (const { id, condition } of s.stock) {
        if (condition === undefined) continue;
        gated += 1;
        expect(() => evaluateCondition(condition, fresh), `${s.id} → ${id}`).not.toThrow();
        expect(evaluateCondition(condition, fresh), `${s.id} → ${id} open on fresh save`).toBe(
          false,
        );
      }
    }
    expect(gated).toBe(9);
  });

  it('shop_minato sells the starter set and potions only after the first fragment', () => {
    const shop = getShop('shop_minato');
    expect(shop.name).toBe('ミナト村 道具屋');
    expect(shop.stock).toHaveLength(7);
    expect(stockIds('shop_minato')).toEqual([
      'it_herb',
      'it_antidote',
      'it_eye_drop',
      'it_return_feather',
      'eq_ar_cloth_luka',
      'eq_ar_cloth_mio',
      'it_potion_s',
    ]);
    const conditional = shop.stock.filter((e) => e.condition !== undefined);
    expect(conditional).toEqual([{ id: 'it_potion_s', condition: 'fragments.count>=1' }]);
  });

  it('shop_hagane_items adds the mid potion and panacea after the second fragment', () => {
    const shop = getShop('shop_hagane_items');
    expect(shop.stock).toHaveLength(13);
    expect(shop.stock.filter((e) => e.condition === undefined)).toHaveLength(11);
    expect(shop.stock.filter((e) => e.condition !== undefined)).toEqual([
      { id: 'it_potion_m', condition: 'fragments.count>=2' },
      { id: 'it_panacea', condition: 'fragments.count>=2' },
    ]);
  });

  it('shop_hagane_arms stocks all tier-2 gear and gates all tier-3 gear', () => {
    const shop = getShop('shop_hagane_arms');
    expect(shop.stock).toHaveLength(12);
    const open = shop.stock.filter((e) => e.condition === undefined).map((e) => e.id);
    const locked = shop.stock.filter((e) => e.condition !== undefined);
    expect(open).toHaveLength(6);
    expect(locked).toHaveLength(6);
    for (const e of locked) expect(e.condition).toBe('shop.hagane_tier3');

    // Exactly the tier-2 / tier-3 weapons and armor of src/data/equipment.ts.
    expect([...open].sort()).toEqual([...gearOfTier(2)].sort());
    expect(locked.map((e) => e.id).sort()).toEqual([...gearOfTier(3)].sort());
    for (const id of open) expect(findEquip(id)?.tier).toBe(2);
    for (const { id } of locked) expect(findEquip(id)?.tier).toBe(3);

    // Weapons before armor, Luka → Mio → Goro.
    expect(stockIds('shop_hagane_arms')).toEqual([
      'eq_wp_luka_2',
      'eq_wp_mio_2',
      'eq_wp_goro_2',
      'eq_ar_leather_luka',
      'eq_ar_leather_mio',
      'eq_ar_leather_goro',
      'eq_wp_luka_3',
      'eq_wp_mio_3',
      'eq_wp_goro_3',
      'eq_ar_chain_luka',
      'eq_ar_chain_mio',
      'eq_ar_chain_goro',
    ]);
  });

  it('shop_camp sells 16 consumables with no conditions', () => {
    const shop = getShop('shop_camp');
    expect(shop.stock).toHaveLength(16);
    expect(shop.stock.every((e) => e.condition === undefined)).toBe(true);
    expect(shop.stock.every((e) => e.id.startsWith('it_'))).toBe(true);
    expect(stockIds('shop_camp')).toEqual([
      'it_herb',
      'it_potion_s',
      'it_potion_m',
      'it_potion_l',
      'it_star_drop',
      'it_antidote',
      'it_eye_drop',
      'it_numb_herb',
      'it_panacea',
      'it_star_feather',
      'it_return_feather',
      'it_fire_stone',
      'it_tide_shell',
      'it_quake_stone',
      'it_light_dust',
      'it_fire_bomb',
    ]);
  });

  it('resolves ids via getShop / findShop and rejects unknown ones', () => {
    expect(findShop('shop_camp')?.id).toBe('shop_camp');
    expect(findShop('shop_nope')).toBeUndefined();
    expect(() => getShop('shop_nope')).toThrow('unknown shop: shop_nope');
  });
});
