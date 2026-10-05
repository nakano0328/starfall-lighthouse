/**
 * Player settings (docs/GAME_DESIGN.md §12.3). Stored under `starfall.settings`,
 * independent of save slots. Anything unreadable falls back to the defaults.
 */
export const SETTINGS_KEY = 'starfall.settings';

export type TextSpeed = 'slow' | 'normal' | 'fast';
export type BattleSpeed = 'normal' | 'fast';

export interface Settings {
  version: 1;
  textSpeed: TextSpeed;
  bgmVolume: number;
  seVolume: number;
  battleSpeed: BattleSpeed;
  showControls: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  textSpeed: 'normal',
  bgmVolume: 7,
  seVolume: 8,
  battleSpeed: 'normal',
  showControls: true,
};

/** Milliseconds per character for the dialog typewriter (§11.1). */
export const TEXT_SPEED_MS: Record<TextSpeed, number> = { slow: 60, normal: 30, fast: 0 };

export function parseSettings(raw: string | null | undefined): Settings {
  if (raw === null || raw === undefined) return { ...DEFAULT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
  const p = parsed as Record<string, unknown>;
  const volume = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10 ? v : fallback;
  return {
    version: 1,
    textSpeed: isOneOf(p['textSpeed'], ['slow', 'normal', 'fast'])
      ? (p['textSpeed'] as TextSpeed)
      : DEFAULT_SETTINGS.textSpeed,
    bgmVolume: volume(p['bgmVolume'], DEFAULT_SETTINGS.bgmVolume),
    seVolume: volume(p['seVolume'], DEFAULT_SETTINGS.seVolume),
    battleSpeed: isOneOf(p['battleSpeed'], ['normal', 'fast'])
      ? (p['battleSpeed'] as BattleSpeed)
      : DEFAULT_SETTINGS.battleSpeed,
    showControls:
      typeof p['showControls'] === 'boolean' ? p['showControls'] : DEFAULT_SETTINGS.showControls,
  };
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

function isOneOf(value: unknown, options: readonly string[]): boolean {
  return typeof value === 'string' && options.includes(value);
}
