import type { Stats } from '@data/types';

export const STAT_KEYS: readonly (keyof Stats)[] = ['hp', 'mp', 'atk', 'def', 'spd', 'luk'];

/** stat(Lv) = floor(base + growth × (Lv − 1)) for every stat. */
export function statsAtLevel(base: Stats, growth: Stats, level: number): Stats {
  const lv = Math.max(1, Math.floor(level));
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = Math.floor(base[k] + growth[k] * (lv - 1));
  return out;
}

/** Adds equipment bonuses (Partial<Stats>) onto base stats. */
export function addBonuses(stats: Stats, ...bonuses: readonly Partial<Stats>[]): Stats {
  const out = { ...stats };
  for (const b of bonuses) for (const k of STAT_KEYS) out[k] += b[k] ?? 0;
  return out;
}
