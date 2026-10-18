import { describe, expect, it } from 'vitest';

import { imageAsset } from '@/assets/manifest';
import { ENEMIES } from '@data/enemies';

import { ENEMY_ART_IDS, renderEnemy } from '../../scripts/art/enemies';
import { artFiles } from '../../scripts/art/index';

describe('generated enemy sprites (ADR-0003)', () => {
  it('cover every enemy and boss in the data at the manifest size', () => {
    const paths = artFiles().map((f) => f.path);
    for (const enemy of ENEMIES) {
      expect(ENEMY_ART_IDS, enemy.id).toContain(enemy.id);
      const asset = imageAsset(enemy.imageKey);
      expect(asset.src).toBe(`enemies/${enemy.imageKey}.png`);
      expect(paths).toContain(`enemies/${enemy.imageKey}.png`);
      const pm = renderEnemy(enemy.id, asset.size ?? 96);
      expect([pm.width, pm.height]).toEqual([asset.size, asset.size]);
    }
    expect(() => renderEnemy('en_nobody', 96)).toThrow();
  });

  it('draw something opaque near the centre and keep the top-left corner clear', () => {
    for (const enemy of ENEMIES) {
      const size = Math.round(96 * (enemy.scale ?? 1));
      const pm = renderEnemy(enemy.id, size);
      let opaque = 0;
      for (let y = Math.floor(size * 0.3); y < size * 0.7; y += 2) {
        for (let x = Math.floor(size * 0.3); x < size * 0.7; x += 2) {
          if (pm.get(x, y).a > 0) opaque += 1;
        }
      }
      expect(opaque, enemy.id).toBeGreaterThan(20);
      expect(pm.get(0, 0).a, enemy.id).toBe(0);
    }
  });

  it('render identically on each run', () => {
    const a = renderEnemy('en_glow_bug', 96);
    const b = renderEnemy('en_glow_bug', 96);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
});
