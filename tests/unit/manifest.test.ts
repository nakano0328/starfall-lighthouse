import { describe, expect, it } from 'vitest';

import { IMAGES, IMAGE_KEYS, assetUrl, imageAsset } from '@/assets/manifest';

describe('asset manifest', () => {
  it('lists every image key exactly once', () => {
    const keys = IMAGES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...IMAGE_KEYS].sort());
  });

  it('looks assets up by key', () => {
    expect(imageAsset('sprite_player').placeholder).toBe('actor');
    expect(() => imageAsset('nope' as never)).toThrow();
  });

  it('builds asset urls under the base path', () => {
    expect(assetUrl('images/x.png')).toMatch(/\/assets\/images\/x\.png$/);
    expect(assetUrl('/images/x.png')).toBe(assetUrl('images/x.png'));
  });
});
