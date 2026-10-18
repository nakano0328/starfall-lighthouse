import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { patternBeats } from '@core/audio/notes';
import { peak, renderSe, renderTrack } from '@core/audio/synth';
import { BGM_KEYS, BGM_TRACKS } from '@data/audio/bgm';
import { SE_KEYS, SE_RECIPES } from '@data/audio/se';
import { MAP_SOURCES } from '@data/maps';

const RATE = 8000;

/** Keys the scripts and dialogs name through play_bgm / play_se. */
function dataKeys(prefix: 'bgm' | 'se'): Set<string> {
  const keys = new Set<string>();
  for (const dir of ['events', 'dialogs']) {
    const base = join(process.cwd(), 'src', 'data', dir);
    for (const file of readdirSync(base)) {
      if (!file.endsWith('.json')) continue;
      const text = readFileSync(join(base, file), 'utf8');
      for (const m of text.matchAll(new RegExp(`"key":\\s*"(${prefix}_[a-z_]+)"`, 'g')))
        keys.add(m[1] ?? '');
    }
  }
  return keys;
}

describe('BGM data (§15.1)', () => {
  it('defines the eleven tracks with channels of equal length', () => {
    expect(BGM_KEYS).toHaveLength(11);
    for (const key of BGM_KEYS) {
      const track = BGM_TRACKS[key];
      expect(track.channels.length, key).toBeGreaterThan(0);
      const beats = track.channels.map((c) => patternBeats(c.pattern));
      expect(new Set(beats).size, `${key} channel lengths ${beats.join(',')}`).toBe(1);
      expect(beats[0], key).toBeGreaterThan(0);
      expect(track.loop).toBe(!['bgm_ending', 'bgm_gameover'].includes(key));
    }
  });

  it('covers every bgm key the maps and scripts use', () => {
    const known = new Set<string>(BGM_KEYS);
    for (const source of Object.values(MAP_SOURCES)) {
      expect(known.has(source.meta.bgmKey), `${source.meta.id} → ${source.meta.bgmKey}`).toBe(true);
    }
    for (const key of dataKeys('bgm')) expect(known.has(key), key).toBe(true);
  });

  it('renders every track audibly without clipping', () => {
    for (const key of BGM_KEYS) {
      const r = renderTrack(BGM_TRACKS[key], RATE);
      expect(r.seconds, key).toBeGreaterThan(4);
      expect(r.seconds, key).toBeLessThan(90);
      const p = peak(r.samples);
      expect(p, key).toBeGreaterThan(0.2);
      expect(p, key).toBeLessThanOrEqual(1);
    }
  });
});

describe('SE data (§15.2)', () => {
  it('defines the 26 effects and covers every se key the scripts use', () => {
    expect(SE_KEYS).toHaveLength(26);
    const known = new Set<string>(SE_KEYS);
    for (const key of dataKeys('se')) expect(known.has(key), key).toBe(true);
  });

  it('renders every effect short and audible', () => {
    for (const key of SE_KEYS) {
      const r = renderSe(SE_RECIPES[key], RATE);
      expect(r.seconds, key).toBeGreaterThan(0.02);
      expect(r.seconds, key).toBeLessThan(1.5);
      expect(peak(r.samples), key).toBeGreaterThan(0.08);
    }
  });
});
