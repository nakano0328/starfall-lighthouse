import { describe, expect, it } from 'vitest';

import { ITEMS, findItem, getItem } from '@data/items';

describe('items data', () => {
  it('has the 30 items of GAME_DESIGN §7.1 with unique ids', () => {
    expect(ITEMS).toHaveLength(30);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(30);
    for (const it of ITEMS) {
      expect(it.id).toMatch(/^it_[a-z0-9_]+$/);
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.iconKey).toBe(`icon_${it.id}`);
    }
  });

  it('marks key items unusable, unsellable and capped at one (ore at three)', () => {
    for (const it of ITEMS.filter((i) => i.category === 'key')) {
      expect(it.price).toBe(0);
      expect(it.usableInBattle).toBe(false);
      expect(it.usableInField).toBe(false);
      expect(it.maxQty).toBe(it.id === 'it_shining_ore' ? 3 : 1);
    }
    expect(getItem('it_herb').maxQty).toBe(99);
  });

  it('matches a few spec rows exactly', () => {
    expect(getItem('it_herb')).toMatchObject({
      price: 20,
      effect: { type: 'heal_hp', amount: 30 },
    });
    expect(getItem('it_potion_l').effect).toEqual({ type: 'heal_hp', amount: 'full' });
    expect(getItem('it_fire_bomb')).toMatchObject({
      scope: 'enemy_all',
      effect: { type: 'damage', power: 110, element: 'fire' },
    });
    expect(getItem('it_return_feather')).toMatchObject({
      category: 'field',
      usableInBattle: false,
      effect: { type: 'escape_dungeon' },
    });
    expect(getItem('it_mio_lunch')).toMatchObject({ scope: 'ally_all', price: 0 });
    expect(findItem('it_nope')).toBeUndefined();
    expect(() => getItem('it_nope')).toThrow();
  });
});
