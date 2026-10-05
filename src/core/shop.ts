import type { EquipDef, ItemDef, ShopDef } from '@data/types';

import { evaluateCondition } from './condition';
import type { Flags } from './flags';
import type { Inventory } from './inventory';

/** Resolves ids to their definitions; keeps this module free of the data tables. */
export interface PriceLookup {
  item(id: string): ItemDef | undefined;
  equip(id: string): EquipDef | undefined;
}

export interface Merchandise {
  id: string;
  name: string;
  description: string;
  price: number;
  kind: 'item' | 'equip';
}

export type BuyResult = 'ok' | 'no_gold' | 'full' | 'unknown';
export type SellResult = 'ok' | 'unsellable' | 'none' | 'unknown';

export function describeMerchandise(id: string, lookup: PriceLookup): Merchandise | undefined {
  const item = lookup.item(id);
  if (item) {
    return { id, name: item.name, description: item.description, price: item.price, kind: 'item' };
  }
  const equip = lookup.equip(id);
  if (equip) {
    return {
      id,
      name: equip.name,
      description: equip.description,
      price: equip.price,
      kind: 'equip',
    };
  }
  return undefined;
}

/** What the shop lists right now (docs/GAME_DESIGN.md §7.5: conditional entries). */
export function shopStock(shop: ShopDef, flags: Flags, lookup: PriceLookup): Merchandise[] {
  const out: Merchandise[] = [];
  for (const entry of shop.stock) {
    if (entry.condition !== undefined && !evaluateCondition(entry.condition, flags)) continue;
    const m = describeMerchandise(entry.id, lookup);
    if (m) out.push(m);
  }
  return out;
}

/** 売値 = 価格 ÷ 2 (floored); price-0 goods cannot be sold (§7.5). */
export function sellPrice(price: number): number {
  return Math.floor(price / 2);
}

/**
 * Buys `qty` of `id`. Charges only what fits in the bag (the cap is per item),
 * so a partial purchase at the cap still returns 'ok' with fewer pieces.
 */
export function buy(
  wallet: { gold: number },
  inventory: Inventory,
  id: string,
  qty: number,
  lookup: PriceLookup,
): BuyResult {
  const m = describeMerchandise(id, lookup);
  if (!m) return 'unknown';
  if (qty <= 0) return 'full';
  if (wallet.gold < m.price * qty) return 'no_gold';
  const added = inventory.add(id, qty);
  if (added <= 0) return 'full';
  wallet.gold -= m.price * added;
  return 'ok';
}

export function sell(
  wallet: { gold: number },
  inventory: Inventory,
  id: string,
  qty: number,
  lookup: PriceLookup,
): SellResult {
  const m = describeMerchandise(id, lookup);
  if (!m) return 'unknown';
  if (sellPrice(m.price) <= 0) return 'unsellable';
  if (!inventory.has(id)) return 'none';
  const removed = inventory.remove(id, qty);
  if (removed <= 0) return 'none';
  wallet.gold += sellPrice(m.price) * removed;
  return 'ok';
}

/** Bag entries the shop will take, with their unit sell price. */
export function sellableEntries(
  inventory: Inventory,
  lookup: PriceLookup,
): (Merchandise & { qty: number; sellPrice: number })[] {
  const out: (Merchandise & { qty: number; sellPrice: number })[] = [];
  for (const entry of inventory.entries()) {
    const m = describeMerchandise(entry.itemId, lookup);
    if (!m || sellPrice(m.price) <= 0) continue;
    out.push({ ...m, qty: entry.qty, sellPrice: sellPrice(m.price) });
  }
  return out;
}

/** How many more of `id` the bag can take and the wallet can pay for. */
export function maxAffordable(
  wallet: { gold: number },
  inventory: Inventory,
  id: string,
  maxQty: number,
  lookup: PriceLookup,
): number {
  const m = describeMerchandise(id, lookup);
  if (!m) return 0;
  const room = Math.max(0, maxQty - inventory.count(id));
  const byGold = m.price <= 0 ? room : Math.floor(wallet.gold / m.price);
  return Math.min(room, byGold);
}

/** Inn price after the 無料 flag (§7.6: `minato.inn_free`). */
export function innPrice(base: number, free: boolean): number {
  return free ? 0 : base;
}

/** Pays for a night; false when the party cannot afford it. */
export function payInn(wallet: { gold: number }, price: number): boolean {
  if (wallet.gold < price) return false;
  wallet.gold -= price;
  return true;
}
