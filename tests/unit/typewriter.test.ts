import { describe, expect, it } from 'vitest';

import { Typewriter } from '@core/text/typewriter';

describe('Typewriter', () => {
  it('reveals characters at the configured pace', () => {
    const t = new Typewriter('あいう', 30);
    expect(t.visibleText).toBe('');
    expect(t.update(29)).toBe(0);
    expect(t.update(1)).toBe(1);
    expect(t.visibleText).toBe('あ');
    expect(t.update(60)).toBe(2);
    expect(t.done).toBe(true);
    expect(t.update(100)).toBe(0);
  });

  it('shows everything at once when the speed is 0', () => {
    const t = new Typewriter('abc', 0);
    expect(t.done).toBe(true);
    expect(t.visibleText).toBe('abc');
  });

  it('pulls newlines in with the preceding character', () => {
    const t = new Typewriter('a\nb', 10);
    t.update(10);
    expect(t.visibleText).toBe('a\n');
    t.update(10);
    expect(t.visibleText).toBe('a\nb');
  });

  it('supports reveal and speed changes', () => {
    const t = new Typewriter('abcdef', 100);
    t.update(100);
    t.setSpeed(1);
    t.update(3);
    expect(t.visibleText).toBe('abcd');
    t.reveal();
    expect(t.done).toBe(true);
    const u = new Typewriter('xyz', 50);
    u.setSpeed(0);
    expect(u.done).toBe(true);
  });

  it('handles surrogate pairs as single characters', () => {
    const t = new Typewriter('🌟星', 10);
    t.update(10);
    expect(t.visibleText).toBe('🌟');
  });
});
