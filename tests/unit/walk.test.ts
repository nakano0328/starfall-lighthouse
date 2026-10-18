import { describe, expect, it } from 'vitest';

import { actorFrame, stepProgress, strideAt } from '@core/grid/walk';

describe('walk cycle (§9.1)', () => {
  it('shows a stride in the first half of a step and stands in the second', () => {
    expect(strideAt(0, false)).toBe('a');
    expect(strideAt(0.49, false)).toBe('a');
    expect(strideAt(0.5, false)).toBe('');
    expect(strideAt(1, false)).toBe('');
    expect(strideAt(0.2, true)).toBe('b');
  });

  it('names frames by facing and stride', () => {
    expect(actorFrame('down', '')).toBe('down');
    expect(actorFrame('left', 'a')).toBe('left_a');
    expect(actorFrame('up', 'b')).toBe('up_b');
  });

  it('derives step progress from the distance left to the logical tile', () => {
    expect(stepProgress(4, 7, 5, 7)).toBe(0);
    expect(stepProgress(4.75, 7, 5, 7)).toBeCloseTo(0.75);
    expect(stepProgress(5, 7, 5, 7)).toBe(1);
    expect(stepProgress(5, 6.5, 5, 7)).toBeCloseTo(0.5);
    // Never outside 0〜1 even if a render position overshoots.
    expect(stepProgress(3, 7, 5, 7)).toBe(0);
  });
});
