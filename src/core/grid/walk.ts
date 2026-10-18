/**
 * Walk-cycle frame selection (docs/GAME_DESIGN.md §9.1: 4 directions × 3 frames, the
 * middle frame while standing). Shared by the player, wandering NPCs, enemy symbols and
 * scripted steps so every actor steps the same way.
 */
export type Stride = 'a' | '' | 'b';

/**
 * Which sheet column shows at `progress` (0〜1) through a step. The first half of a
 * step shows a stride frame, the second half the standing frame, and `parity`
 * alternates the leading foot between consecutive steps (a, idle, b, idle, ...).
 */
export function strideAt(progress: number, parity: boolean): Stride {
  if (progress >= 0.5) return '';
  return parity ? 'b' : 'a';
}

/** Frame name on an actor sheet for a facing and stride (`down`, `down_a`, `down_b`). */
export function actorFrame(facing: string, stride: Stride): string {
  return stride === '' ? facing : `${facing}_${stride}`;
}

/**
 * Progress of a symbol's step from its render position: the render position moves from
 * the previous tile to the logical tile, so the remaining distance is 1 − progress.
 */
export function stepProgress(
  renderX: number,
  renderY: number,
  tileX: number,
  tileY: number,
): number {
  const remaining = Math.max(Math.abs(renderX - tileX), Math.abs(renderY - tileY));
  return Math.min(1, Math.max(0, 1 - remaining));
}
