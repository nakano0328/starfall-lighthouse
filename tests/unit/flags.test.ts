import { describe, expect, it } from 'vitest';

import { Flags } from '@core/flags';

describe('Flags', () => {
  it('starts empty and reports missing flags as not set', () => {
    const f = new Flags();
    expect(f.has('minato.talked_to_grandpa')).toBe(false);
    expect(f.get('fragments.count', 0)).toBe(0);
  });

  it('treats false, 0 and empty string as "not set"', () => {
    const f = new Flags({ a: false, b: 0, c: '', d: true, e: 2, f: 'x' });
    expect(f.has('a')).toBe(false);
    expect(f.has('b')).toBe(false);
    expect(f.has('c')).toBe(false);
    expect(f.has('d')).toBe(true);
    expect(f.has('e')).toBe(true);
    expect(f.has('f')).toBe(true);
  });

  it('sets, gets, increments and clears values', () => {
    const f = new Flags();
    f.set('forest.boss_defeated', true);
    expect(f.has('forest.boss_defeated')).toBe(true);

    expect(f.increment('fragments.count')).toBe(1);
    expect(f.increment('fragments.count', 2)).toBe(3);
    expect(f.get('fragments.count', 0)).toBe(3);

    f.clear('forest.boss_defeated');
    expect(f.has('forest.boss_defeated')).toBe(false);
  });

  it('increment on a non-numeric flag restarts from zero', () => {
    const f = new Flags({ x: 'text' });
    expect(f.increment('x')).toBe(1);
  });

  it('toJSON returns a detached copy', () => {
    const f = new Flags({ a: 1 });
    const snapshot = f.toJSON();
    snapshot['a'] = 99;
    expect(f.get('a', 0)).toBe(1);
  });
});
