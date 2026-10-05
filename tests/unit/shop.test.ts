import { describe, expect, it } from 'vitest';

import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import {
  buy,
  describeMerchandise,
  innPrice,
  maxAffordable,
  payInn,
  sell,
  sellPrice,
  sellableEntries,
  shopStock,
} from '@core/shop';
import { findEquip } from '@data/equipment';
import { findItem, getItem } from '@data/items';
import { getShop } from '@data/shops';

const lookup = { item: findItem, equip: findEquip };
const maxQtyOf = (id: string): number => findItem(id)?.maxQty ?? 99;

describe('shop stock', () => {
  it('lists conditional entries only when the flag holds', () => {
    const shop = getShop('shop_minato');
    const closed = shopStock(shop, new Flags({}), lookup).map((m) => m.id);
    expect(closed).not.toContain('it_potion_s');
    expect(closed).toContain('eq_ar_cloth_luka');
    const open = shopStock(shop, new Flags({ 'fragments.count': 1 }), lookup).map((m) => m.id);
    expect(open).toContain('it_potion_s');
  });

  it('describes items and equipment alike', () => {
    expect(describeMerchandise('it_herb', lookup)).toMatchObject({
      name: 'やくそう',
      price: 20,
      kind: 'item',
    });
    expect(describeMerchandise('eq_ar_cloth_luka', lookup)).toMatchObject({ kind: 'equip' });
    expect(describeMerchandise('nope', lookup)).toBeUndefined();
  });
});

describe('buying and selling', () => {
  it('charges per piece and refuses when gold is short', () => {
    const wallet = { gold: 50 };
    const bag = new Inventory(maxQtyOf);
    expect(buy(wallet, bag, 'it_herb', 2, lookup)).toBe('ok');
    expect(wallet.gold).toBe(10);
    expect(bag.count('it_herb')).toBe(2);
    expect(buy(wallet, bag, 'it_herb', 1, lookup)).toBe('no_gold');
    expect(buy(wallet, bag, 'nope', 1, lookup)).toBe('unknown');
    expect(buy(wallet, bag, 'it_herb', 0, lookup)).toBe('full');
  });

  it('charges only for what fits at the cap', () => {
    const wallet = { gold: 10_000 };
    const bag = new Inventory(maxQtyOf, [{ itemId: 'it_herb', qty: 98 }]);
    expect(buy(wallet, bag, 'it_herb', 5, lookup)).toBe('ok');
    expect(bag.count('it_herb')).toBe(99);
    expect(wallet.gold).toBe(10_000 - 20);
    expect(buy(wallet, bag, 'it_herb', 1, lookup)).toBe('full');
  });

  it('sells at half price and never takes price-0 goods', () => {
    const wallet = { gold: 0 };
    const bag = new Inventory(maxQtyOf, [
      { itemId: 'it_potion_s', qty: 3 },
      { itemId: 'it_key_shrine', qty: 1 },
      { itemId: 'eq_ar_cloth_luka', qty: 1 },
    ]);
    expect(sellPrice(getItem('it_potion_s').price)).toBe(30);
    expect(sell(wallet, bag, 'it_potion_s', 2, lookup)).toBe('ok');
    expect(wallet.gold).toBe(60);
    expect(bag.count('it_potion_s')).toBe(1);
    expect(sell(wallet, bag, 'it_key_shrine', 1, lookup)).toBe('unsellable');
    expect(sell(wallet, bag, 'it_herb', 1, lookup)).toBe('none');
    expect(sell(wallet, bag, 'nope', 1, lookup)).toBe('unknown');
    expect(sellableEntries(bag, lookup).map((e) => [e.id, e.qty, e.sellPrice])).toEqual([
      ['it_potion_s', 1, 30],
      ['eq_ar_cloth_luka', 1, 40],
    ]);
  });

  it('caps a purchase by bag room and gold', () => {
    const wallet = { gold: 70 };
    const bag = new Inventory(maxQtyOf, [{ itemId: 'it_herb', qty: 97 }]);
    expect(maxAffordable(wallet, bag, 'it_herb', 99, lookup)).toBe(2);
    wallet.gold = 25;
    expect(maxAffordable(wallet, bag, 'it_herb', 99, lookup)).toBe(1);
    expect(maxAffordable(wallet, bag, 'nope', 99, lookup)).toBe(0);
  });
});

describe('inn', () => {
  it('is free after the quest and otherwise charges the posted price', () => {
    expect(innPrice(20, false)).toBe(20);
    expect(innPrice(20, true)).toBe(0);
    const wallet = { gold: 30 };
    expect(payInn(wallet, 20)).toBe(true);
    expect(wallet.gold).toBe(10);
    expect(payInn(wallet, 20)).toBe(false);
    expect(wallet.gold).toBe(10);
  });
});
