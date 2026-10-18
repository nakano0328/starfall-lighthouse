import type { SaveLocation } from '@core/save';

/**
 * Where the save goes when the ending starts (docs/GAME_DESIGN.md §13 #20): the 5F
 * save point of the lighthouse, so a cleared game continues from just below the top.
 * (21,3) is the landing below the stairs up, facing the save point at (20,3).
 */
export const ENDING_REWIND: SaveLocation = {
  map: 'map_lighthouse_5f',
  x: 21,
  y: 3,
  facing: 'left',
};

/** The ending's key visual caption and the closing word (§11.5). */
export const ENDING_TEXT = {
  caption: '灯台に 光が 戻った。',
  theEnd: 'おしまい',
  toTitle: 'Z でタイトルへ',
} as const;
