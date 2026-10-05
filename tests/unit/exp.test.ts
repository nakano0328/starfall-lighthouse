import { describe, expect, it } from 'vitest';

import { MAX_LEVEL, expForLevel, expToNext, levelFromExp, nextExp } from '@core/party/exp';

describe('EXP curve (§6.1)', () => {
  it('matches the spec table', () => {
    expect(nextExp(1)).toBe(20);
    expect(nextExp(5)).toBe(262);
    expect(nextExp(10)).toBe(796);
    expect(nextExp(29)).toBe(4373);
    expect(nextExp(30)).toBe(0);
    expect(expForLevel(1)).toBe(0);
    expect(expForLevel(5)).toBe(378);
    expect(expForLevel(10)).toBe(2669);
    expect(expForLevel(16)).toBe(9555);
    expect(expForLevel(30)).toBe(50978);
    expect(expForLevel(99)).toBe(50978);
  });

  it('derives levels from totals and caps at 30', () => {
    expect(levelFromExp(0)).toBe(1);
    expect(levelFromExp(19)).toBe(1);
    expect(levelFromExp(20)).toBe(2);
    expect(levelFromExp(991)).toBe(7);
    expect(levelFromExp(50977)).toBe(29);
    expect(levelFromExp(50978)).toBe(MAX_LEVEL);
    expect(levelFromExp(999999)).toBe(MAX_LEVEL);
    expect(expToNext(0)).toBe(20);
    expect(expToNext(30)).toBe(50);
    expect(expToNext(60000)).toBe(0);
  });
});
