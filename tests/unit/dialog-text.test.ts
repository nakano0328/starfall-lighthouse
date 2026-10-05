import { describe, expect, it } from 'vitest';

import { formatDialogText } from '@core/dialog/text';

const ctx = {
  names: { luka: 'ルカ', mio: 'ミオ' },
  gold: 120,
  itemName: (id: string) => (id === 'it_herb' ? 'やくそう' : undefined),
};

describe('formatDialogText', () => {
  it('replaces names, gold and item tokens', () => {
    expect(formatDialogText('{luka}と{mio}は{gold}Gで{item:it_herb}を買った', ctx)).toBe(
      'ルカとミオは120Gでやくそうを買った',
    );
  });

  it('leaves unknown tokens untouched', () => {
    expect(formatDialogText('{goro}が{item:it_nope}を{weird}', ctx)).toBe(
      '{goro}が{item:it_nope}を{weird}',
    );
  });
});
