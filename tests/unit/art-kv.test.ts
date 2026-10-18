import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { KV_KEYS, imageAsset } from '@/assets/manifest';

import { artFiles } from '../../scripts/art/index';
import { KV_IDS, renderKeyVisual } from '../../scripts/art/kv';

describe('generated key visuals (ADR-0003)', () => {
  it('cover the title, ending and game over at full screen, opaque, and are in the manifest', () => {
    expect([...KV_IDS].sort()).toEqual([...KV_KEYS].sort());
    const paths = artFiles().map((f) => f.path);
    for (const id of KV_IDS) {
      expect(imageAsset(id).src).toBe(`kv/${id}.png`);
      expect(paths).toContain(`kv/${id}.png`);
      const pm = renderKeyVisual(id);
      expect([pm.width, pm.height]).toEqual([GAME_WIDTH, GAME_HEIGHT]);
      for (let y = 0; y < GAME_HEIGHT; y += 9) {
        for (let x = 0; x < GAME_WIDTH; x += 13) {
          if (pm.get(x, y).a !== 255) throw new Error(`${id} transparent at ${x},${y}`);
        }
      }
    }
  });

  it('lights the lamp only in the ending and renders deterministically', () => {
    const title = renderKeyVisual('kv_title');
    const ending = renderKeyVisual('kv_ending');
    // The lamp room sits at (548〜576, 81〜91): dark on the title, bright at the ending.
    const lampTitle = title.get(560, 86).rgb;
    const lampEnding = ending.get(560, 86).rgb;
    expect(lampEnding).toBe(0xffe9a3);
    expect(lampTitle).not.toBe(0xffe9a3);
    const again = renderKeyVisual('kv_title');
    expect(Buffer.from(title.data).equals(Buffer.from(again.data))).toBe(true);
  });
});
