/** Level cap and EXP curve from docs/GAME_DESIGN.md §6.1. */
export const MAX_LEVEL = 30;

/** EXP needed to go from `level` to `level + 1`; 0 at the cap. */
export function nextExp(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.floor(20 * Math.pow(level, 1.6));
}

const CUMULATIVE: number[] = (() => {
  const out = [0, 0]; // index = level; level 0 unused
  for (let lv = 1; lv < MAX_LEVEL; lv += 1) out.push((out[lv] ?? 0) + nextExp(lv));
  return out;
})();

/** Total EXP at which `level` is reached (level 1 → 0). */
export function expForLevel(level: number): number {
  const lv = Math.min(Math.max(1, Math.floor(level)), MAX_LEVEL);
  return CUMULATIVE[lv] ?? 0;
}

/** Level for a cumulative EXP total, capped at MAX_LEVEL. */
export function levelFromExp(total: number): number {
  let level = 1;
  while (level < MAX_LEVEL && total >= expForLevel(level + 1)) level += 1;
  return level;
}

/** EXP still needed for the next level; 0 at the cap. */
export function expToNext(total: number): number {
  const level = levelFromExp(total);
  if (level >= MAX_LEVEL) return 0;
  return expForLevel(level + 1) - total;
}
