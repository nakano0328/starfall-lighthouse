import type { Facing } from '@data/types';

/** Logical actions every input device maps onto (docs/GAME_DESIGN.md §11.4). */
export type Action =
  'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'dash' | 'fullscreen';

export const DIRECTIONS: readonly Facing[] = ['up', 'down', 'left', 'right'];

/** True for the four directions; accepts any name so zone and button ids can be tested too. */
export function isDirection(action: string): action is Facing {
  return (DIRECTIONS as readonly string[]).includes(action);
}
