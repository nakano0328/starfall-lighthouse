import { describe, expect, it } from 'vitest';

import { evaluateCondition } from '@core/condition';
import { createNewSave } from '@core/save';
import { fromSaveData, toSaveData } from '@core/state';

describe('GameState item conditions', () => {
  it('lets conditions read bag counts through item.<id> keys without storing them', () => {
    const state = fromSaveData(createNewSave(0, []), () => 99);
    expect(evaluateCondition('item.it_shining_ore>=3', state.flags)).toBe(false);
    state.inventory.add('it_shining_ore', 3);
    expect(evaluateCondition('item.it_shining_ore>=3', state.flags)).toBe(true);
    expect(evaluateCondition('item.it_shining_ore', state.flags)).toBe(true);
    expect(evaluateCondition('!item.it_herb', state.flags)).toBe(true);
    expect(toSaveData(state, 1).flags).not.toHaveProperty('item.it_shining_ore');
  });
});
