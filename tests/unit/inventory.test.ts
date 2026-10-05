import { describe, expect, it } from 'vitest';

import { Inventory } from '@core/inventory';

const caps = (id: string) => (id.startsWith('it_key') ? 1 : 99);

describe('Inventory', () => {
  it('adds up to the cap and reports what was added', () => {
    const inv = new Inventory(caps);
    expect(inv.add('it_herb', 3)).toBe(3);
    expect(inv.add('it_herb', 98)).toBe(96);
    expect(inv.count('it_herb')).toBe(99);
    expect(inv.add('it_key_mine', 2)).toBe(1);
    expect(inv.add('it_key_mine', 1)).toBe(0);
    expect(inv.add('it_herb', 0)).toBe(0);
    expect(inv.add('it_herb', -2)).toBe(0);
    expect(inv.add('it_herb', 1.5)).toBe(0);
  });

  it('removes down to zero and drops empty entries', () => {
    const inv = new Inventory(caps, [{ itemId: 'it_herb', qty: 2 }]);
    expect(inv.remove('it_herb', 5)).toBe(2);
    expect(inv.count('it_herb')).toBe(0);
    expect(inv.has('it_herb')).toBe(false);
    expect(inv.size).toBe(0);
    expect(inv.remove('it_herb', 1)).toBe(0);
  });

  it('keeps insertion order and serialises to entries', () => {
    const inv = new Inventory(caps);
    inv.add('it_lamp_oil', 1);
    inv.add('it_herb', 2);
    inv.remove('it_herb', 1);
    expect(inv.entries()).toEqual([
      { itemId: 'it_lamp_oil', qty: 1 },
      { itemId: 'it_herb', qty: 1 },
    ]);
    expect(inv.has('it_herb', 1)).toBe(true);
    expect(inv.has('it_herb', 2)).toBe(false);
    expect(JSON.parse(JSON.stringify(inv))).toEqual(inv.entries());
  });
});
