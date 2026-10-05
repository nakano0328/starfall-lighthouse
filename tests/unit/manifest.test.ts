import { describe, expect, it } from 'vitest';

import { BATTLE_BG_KEYS, IMAGES, IMAGE_KEYS, assetUrl, imageAsset } from '@/assets/manifest';
import { ENEMIES } from '@data/enemies';

describe('asset manifest', () => {
  it('lists every image key exactly once, including battle backgrounds and enemies', () => {
    const keys = IMAGES.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of IMAGE_KEYS) expect(keys).toContain(key);
    for (const key of BATTLE_BG_KEYS) expect(imageAsset(key).placeholder).toBe('battle_bg');
    for (const enemy of ENEMIES) {
      const asset = imageAsset(enemy.imageKey);
      expect(asset.placeholder).toBe('enemy');
      expect(asset.size).toBe(Math.round(96 * (enemy.scale ?? 1)));
    }
  });

  it('looks assets up by key', () => {
    expect(imageAsset('sprite_player').placeholder).toBe('actor');
    expect(() => imageAsset('nope')).toThrow();
  });

  it('builds asset urls under the base path', () => {
    expect(assetUrl('images/x.png')).toMatch(/\/assets\/images\/x\.png$/);
    expect(assetUrl('/images/x.png')).toBe(assetUrl('images/x.png'));
  });
});
