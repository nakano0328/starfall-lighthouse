import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PORTRAIT_KEYS, imageAsset } from '@/assets/manifest';

import { artFiles } from '../../scripts/art/index';
import { PORTRAITS, PORTRAIT_SIZE, renderPortrait } from '../../scripts/art/portraits';

/** Every `portrait` key the dialog JSON names. */
function dialogPortraitKeys(): Set<string> {
  const dir = join(process.cwd(), 'src', 'data', 'dialogs');
  const keys = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const text = readFileSync(join(dir, file), 'utf8');
    for (const m of text.matchAll(/"portrait":\s*"([a-z_]+)"/g)) keys.add(m[1] ?? '');
  }
  return keys;
}

describe('generated portraits (ADR-0003)', () => {
  it('cover every portrait the dialogs name and are registered in the manifest', () => {
    const generated = new Set(PORTRAITS.map((p) => p.key));
    for (const key of dialogPortraitKeys()) expect(generated.has(key), key).toBe(true);
    const paths = artFiles().map((f) => f.path);
    for (const key of PORTRAIT_KEYS) {
      expect(generated.has(key), key).toBe(true);
      expect(imageAsset(key).src).toBe(`portraits/${key}.png`);
      expect(imageAsset(key).placeholder).toBe('portrait');
      expect(paths).toContain(`portraits/${key}.png`);
    }
  });

  it('render 96×96 busts with a face in the middle, identically each run', () => {
    for (const spec of PORTRAITS) {
      const a = renderPortrait(spec);
      const b = renderPortrait(spec);
      expect([a.width, a.height]).toEqual([PORTRAIT_SIZE, PORTRAIT_SIZE]);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data)), spec.key).toBe(true);
      expect(a.get(48, 50).a, spec.key).toBe(255);
      expect(a.get(1, 1).a, spec.key).toBe(0);
    }
  });

  it('differ between expressions of the same character', () => {
    const neutral = renderPortrait(PORTRAITS.find((p) => p.key === 'portrait_luka_neutral')!);
    const smile = renderPortrait(PORTRAITS.find((p) => p.key === 'portrait_luka_smile')!);
    expect(Buffer.from(neutral.data).equals(Buffer.from(smile.data))).toBe(false);
  });
});
