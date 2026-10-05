import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, TEXT_SPEED_MS, parseSettings, serializeSettings } from '@core/settings';

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
