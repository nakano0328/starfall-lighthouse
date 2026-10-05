export interface InventoryEntry {
  itemId: string;
  qty: number;
}

/**
 * Item bag: ids with quantities, capped per item (99 by default; key items 1).
 * Phaser-free; the cap resolver keeps it independent of the data tables.
 */
export class Inventory {
  private readonly items = new Map<string, number>();

  constructor(
    private readonly maxQtyOf: (itemId: string) => number,
    entries: readonly InventoryEntry[] = [],
  ) {
    for (const e of entries) this.add(e.itemId, e.qty);
  }

  count(itemId: string): number {
    return this.items.get(itemId) ?? 0;
  }

  has(itemId: string, qty = 1): boolean {
    return this.count(itemId) >= qty;
  }

  /** Adds up to the cap. Returns how many were actually added. */
  add(itemId: string, qty: number): number {
    if (!Number.isInteger(qty) || qty <= 0) return 0;
    const cap = this.maxQtyOf(itemId);
    const current = this.count(itemId);
    const added = Math.max(0, Math.min(qty, cap - current));
    if (added > 0) this.items.set(itemId, current + added);
    return added;
  }

  /** Removes down to zero. Returns how many were actually removed. */
  remove(itemId: string, qty: number): number {
    if (!Number.isInteger(qty) || qty <= 0) return 0;
    const current = this.count(itemId);
    const removed = Math.min(qty, current);
    if (current - removed <= 0) this.items.delete(itemId);
    else this.items.set(itemId, current - removed);
    return removed;
  }

  /** Entries in insertion order (the order items were first obtained). */
  entries(): InventoryEntry[] {
    return [...this.items.entries()].map(([itemId, qty]) => ({ itemId, qty }));
  }

  get size(): number {
    return this.items.size;
  }

  toJSON(): InventoryEntry[] {
    return this.entries();
  }
}
