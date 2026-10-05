import { describe, expect, it } from 'vitest';

import { ConditionError, evaluateCondition, validateCondition } from '@core/condition';
import { Flags } from '@core/flags';

describe('evaluateCondition', () => {
  const flags = new Flags({
    'main.chapter': 2,
    'ruins.tide': 'low',
    'minato.intro_done': true,
    'sq.necklace': 0,
  });

  it('handles truthy and negated keys', () => {
    expect(evaluateCondition('minato.intro_done', flags)).toBe(true);
    expect(evaluateCondition('!minato.intro_done', flags)).toBe(false);
    expect(evaluateCondition('sq.necklace', flags)).toBe(false);
    expect(evaluateCondition('!forest.boss_defeated', flags)).toBe(true);
    expect(evaluateCondition('  !forest.boss_defeated ', flags)).toBe(true);
  });

  it('compares numbers, treating missing flags as 0', () => {
    expect(evaluateCondition('main.chapter>=2', flags)).toBe(true);
    expect(evaluateCondition('main.chapter > 2', flags)).toBe(false);
    expect(evaluateCondition('main.chapter<3', flags)).toBe(true);
    expect(evaluateCondition('main.chapter<=1', flags)).toBe(false);
    expect(evaluateCondition('main.chapter==2', flags)).toBe(true);
    expect(evaluateCondition('main.chapter!=2', flags)).toBe(false);
    expect(evaluateCondition('fragments.count>=1', flags)).toBe(false);
    expect(evaluateCondition('fragments.count<1', flags)).toBe(true);
    expect(evaluateCondition('fragments.count<=0', flags)).toBe(true);
    expect(evaluateCondition('fragments.count==0', flags)).toBe(true);
    expect(evaluateCondition('fragments.count!=0', flags)).toBe(false);
    expect(evaluateCondition('fragments.count==1', flags)).toBe(false);
    expect(evaluateCondition('fragments.count!=1', flags)).toBe(true);
  });

  it('reads never-set numeric flags as 0 on a fresh save (§2.3 get(key, 0))', () => {
    const fresh = new Flags({});
    expect(evaluateCondition('sq.necklace==0', fresh)).toBe(true);
    expect(evaluateCondition('sq.necklace!=0', fresh)).toBe(false);
    expect(evaluateCondition('sq.necklace==1', fresh)).toBe(false);
    expect(evaluateCondition('main.chapter==0', fresh)).toBe(true);
    expect(evaluateCondition('fragments.count>=0', fresh)).toBe(true);
    expect(evaluateCondition('fragments.count<1', fresh)).toBe(true);
  });

  it('does not coerce a string or boolean flag when compared to a number', () => {
    expect(evaluateCondition('ruins.tide==0', flags)).toBe(false);
    expect(evaluateCondition('ruins.tide!=0', flags)).toBe(true);
    expect(evaluateCondition('ruins.tide>=0', flags)).toBe(false);
    expect(evaluateCondition('ruins.tide<1', flags)).toBe(false);
    expect(evaluateCondition('minato.intro_done==1', flags)).toBe(false);
    expect(evaluateCondition('minato.intro_done!=1', flags)).toBe(true);
  });

  it('compares strings and booleans', () => {
    expect(evaluateCondition("ruins.tide=='low'", flags)).toBe(true);
    expect(evaluateCondition('ruins.tide=="high"', flags)).toBe(false);
    expect(evaluateCondition("ruins.tide!='high'", flags)).toBe(true);
    expect(evaluateCondition('minato.intro_done==true', flags)).toBe(true);
    expect(evaluateCondition('minato.intro_done==false', flags)).toBe(false);
  });

  it('keeps string and boolean comparisons strict for unset flags', () => {
    expect(evaluateCondition("hagane.unknown=='x'", flags)).toBe(false);
    expect(evaluateCondition("hagane.unknown!='x'", flags)).toBe(true);
    expect(evaluateCondition('hagane.unknown==false', flags)).toBe(false);
    expect(evaluateCondition('hagane.unknown!=false', flags)).toBe(true);
    expect(evaluateCondition('hagane.unknown==true', flags)).toBe(false);
  });

  it('rejects malformed conditions', () => {
    for (const bad of [
      '',
      'nodot',
      'Main.chapter',
      'main.chapter>=',
      'main.chapter>="x"',
      "ruins.tide=='low' && x.y",
      'main.chapter===2',
    ]) {
      expect(() => validateCondition(bad), bad).toThrow(ConditionError);
    }
  });
});
