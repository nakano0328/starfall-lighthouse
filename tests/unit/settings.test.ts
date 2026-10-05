import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  SETTING_KEYS,
  TEXT_SPEED_MS,
  adjustSetting,
  parseSettings,
  serializeSettings,
  settingLabel,
} from '@core/settings';

describe('settings', () => {
  it('falls back to defaults for missing or broken data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('"x"')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and repairs invalid ones individually', () => {
    const parsed = parseSettings(
      JSON.stringify({
        textSpeed: 'fast',
        bgmVolume: 11,
        seVolume: 3,
        battleSpeed: 'turbo',
        showControls: false,
      }),
    );
    expect(parsed).toEqual({
      version: 1,
      textSpeed: 'fast',
      bgmVolume: 7,
      seVolume: 3,
      battleSpeed: 'normal',
      showControls: false,
    });
  });

  it('round-trips through serialize', () => {
    const s = { ...DEFAULT_SETTINGS, textSpeed: 'slow' as const };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('maps text speed to typewriter pace', () => {
    expect(TEXT_SPEED_MS.slow).toBe(60);
    expect(TEXT_SPEED_MS.normal).toBe(30);
    expect(TEXT_SPEED_MS.fast).toBe(0);
  });
});

describe('adjustSetting / settingLabel', () => {
  it('cycles enums, clamps volumes and toggles booleans without mutating', () => {
    const base = { ...DEFAULT_SETTINGS };
    expect(adjustSetting(base, 'textSpeed', 1).textSpeed).toBe('fast');
    expect(adjustSetting(base, 'textSpeed', -1).textSpeed).toBe('slow');
    expect(adjustSetting({ ...base, textSpeed: 'fast' }, 'textSpeed', 1).textSpeed).toBe('slow');
    expect(adjustSetting({ ...base, bgmVolume: 10 }, 'bgmVolume', 1).bgmVolume).toBe(10);
    expect(adjustSetting({ ...base, seVolume: 0 }, 'seVolume', -1).seVolume).toBe(0);
    expect(adjustSetting(base, 'battleSpeed', 1).battleSpeed).toBe('fast');
    expect(adjustSetting(base, 'showControls', 1).showControls).toBe(false);
    expect(base).toEqual(DEFAULT_SETTINGS);
    expect(settingLabel(base, 'textSpeed')).toBe('ふつう');
    expect(settingLabel(base, 'bgmVolume')).toBe('7');
    expect(settingLabel(base, 'showControls')).toBe('ON');
    expect(SETTING_KEYS).toHaveLength(5);
  });
});
