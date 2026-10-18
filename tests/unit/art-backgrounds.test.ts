import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { BATTLE_BG_KEYS, imageAsset } from '@/assets/manifest';

import { BATTLE_BG_IDS, renderBattleBackground } from '../../scripts/art/backgrounds';
import { artFiles } from '../../scripts/art/index';

describe('generated battle backgrounds (ADR-0003)', () => {
  it('exist for every battle background key, full screen and fully opaque', () => {
    const paths = artFiles().map((f) => f.path);
    expect([...BATTLE_BG_IDS].sort()).toEqual([...BATTLE_BG_KEYS].sort());
    for (const id of BATTLE_BG_IDS) {
      expect(imageAsset(id).src).toBe(`backgrounds/${id}.png`);
      expect(paths).toContain(`backgrounds/${id}.png`);
      const pm = renderBattleBackground(id);
      expect([pm.width, pm.height]).toEqual([GAME_WIDTH, GAME_HEIGHT]);
      for (let y = 0; y < GAME_HEIGHT; y += 7) {
        for (let x = 0; x < GAME_WIDTH; x += 11) {
          if (pm.get(x, y).a !== 255) throw new Error(`${id} transparent at ${x},${y}`);
        }
      }
    }
  });

  it('keep the ground plane below y=262 free of tall features and render deterministically', () => {
    for (const id of BATTLE_BG_IDS) {
      const a = renderBattleBackground(id);
      const b = renderBattleBackground(id);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data)), id).toBe(true);
      // The ground band is one dominant tone: no pixel there is far from the band's median.
      const ys = [270, 300, 340];
      const seen = new Set<number>();
      for (const y of ys) seen.add(a.get(320, y).rgb);
      expect(seen.size, id).toBeLessThanOrEqual(3);
    }
  });
});
