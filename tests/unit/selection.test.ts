import { describe, expect, it } from 'vitest';

import { firstEnabled, isSelectable, moveSelection } from '@core/menu/selection';

describe('menu selection', () => {
  const items = [{}, { disabled: true }, {}, { disabled: true }];

  it('finds the first enabled item', () => {
    expect(firstEnabled(items)).toBe(0);
    expect(firstEnabled([{ disabled: true }, {}])).toBe(1);
    expect(firstEnabled([{ disabled: true }])).toBe(-1);
    expect(firstEnabled([])).toBe(-1);
  });

  it('skips disabled items and wraps around', () => {
    expect(moveSelection(items, 0, 1)).toBe(2);
    expect(moveSelection(items, 2, 1)).toBe(0);
    expect(moveSelection(items, 0, -1)).toBe(2);
    expect(moveSelection(items, 2, -1)).toBe(0);
  });

  it('stays put when nothing else is selectable', () => {
    expect(moveSelection([{}, { disabled: true }], 0, 1)).toBe(0);
    expect(moveSelection([{ disabled: true }], 0, 1)).toBe(0);
    expect(moveSelection([], 0, 1)).toBe(0);
  });

  it('reports selectability', () => {
    expect(isSelectable(items, 0)).toBe(true);
    expect(isSelectable(items, 1)).toBe(false);
    expect(isSelectable(items, 9)).toBe(false);
  });
});
