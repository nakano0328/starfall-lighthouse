import type { SeRecipe, SeStep } from './types';

/**
 * Sound effects (docs/GAME_DESIGN.md §15.2) as short synth recipes rendered at runtime
 * (docs/ADR/0004-synthesized-audio.md).
 */
export const SE_KEYS = [
  'se_cursor',
  'se_confirm',
  'se_cancel',
  'se_error',
  'se_step',
  'se_door',
  'se_chest',
  'se_item',
  'se_save',
  'se_battle_start',
  'se_escape',
  'se_victory',
  'se_tide',
  'se_hit',
  'se_slash',
  'se_magic_light',
  'se_magic_fire',
  'se_magic_water',
  'se_magic_earth',
  'se_heal',
  'se_damage',
  'se_weak',
  'se_buff',
  'se_levelup',
  'se_shatter',
  'se_fade',
] as const;

export type SeKey = (typeof SE_KEYS)[number];

const tone = (
  wave: SeStep['wave'],
  freq: number,
  at: number,
  duration: number,
  gain: number,
  extra: Partial<SeStep> = {},
): SeStep => ({ wave, freq, at, duration, gain, ...extra });

/** A rising arpeggio of square blips (item / save / level-up jingles). */
const jingle = (
  notes: number[],
  step: number,
  gain: number,
  wave: SeStep['wave'] = 'square',
): SeStep[] => notes.map((f, i) => tone(wave, f, i * step, step * 1.6, gain, { release: 0.06 }));

export const SE_RECIPES: Readonly<Record<SeKey, SeRecipe>> = {
  se_cursor: { steps: [tone('square', 1760, 0, 0.03, 0.18, { release: 0.02 })] },
  se_confirm: {
    steps: [
      tone('square', 1046, 0, 0.05, 0.2),
      tone('square', 1568, 0.05, 0.08, 0.2, { release: 0.05 }),
    ],
  },
  se_cancel: {
    steps: [
      tone('square', 1046, 0, 0.05, 0.18),
      tone('square', 784, 0.05, 0.08, 0.18, { release: 0.05 }),
    ],
  },
  se_error: {
    steps: [
      tone('pulse', 220, 0, 0.12, 0.2),
      tone('pulse', 208, 0.12, 0.14, 0.2, { release: 0.04 }),
    ],
  },
  se_step: {
    steps: [
      tone('noise', 200, 0, 0.03, 0.12, { release: 0.02 }),
      tone('triangle', 140, 0, 0.03, 0.1, { freqTo: 90 }),
    ],
  },
  se_door: {
    steps: [
      tone('noise', 100, 0, 0.08, 0.14, { release: 0.1 }),
      tone('triangle', 220, 0.02, 0.1, 0.16, { freqTo: 110, release: 0.08 }),
    ],
  },
  se_chest: {
    steps: [
      tone('triangle', 330, 0, 0.06, 0.2, { freqTo: 660 }),
      ...jingle([1046, 1318, 1568], 0.07, 0.18).map((s) => ({ ...s, at: s.at + 0.08 })),
    ],
  },
  se_item: { steps: jingle([1046, 1318, 1568, 2093], 0.07, 0.18) },
  se_save: { steps: jingle([784, 1046, 1318, 1568, 2093], 0.08, 0.16, 'triangle') },
  se_battle_start: {
    steps: [
      tone('sawtooth', 110, 0, 0.5, 0.22, { freqTo: 880, release: 0.1 }),
      tone('noise', 300, 0, 0.4, 0.08, { release: 0.1 }),
      tone('square', 880, 0.45, 0.2, 0.2, { release: 0.1 }),
    ],
  },
  se_escape: {
    steps: [
      tone('square', 880, 0, 0.3, 0.16, { freqTo: 220, release: 0.08 }),
      tone('noise', 200, 0, 0.2, 0.08, { release: 0.1 }),
    ],
  },
  se_victory: {
    steps: [
      ...jingle([784, 784, 784, 1046], 0.11, 0.2),
      tone('square', 1318, 0.5, 0.3, 0.2, { release: 0.15 }),
      tone('triangle', 659, 0.5, 0.3, 0.14, { release: 0.15 }),
    ],
  },
  se_tide: {
    steps: [
      tone('noise', 100, 0, 0.9, 0.16, { attack: 0.3, release: 0.4 }),
      tone('sine', 220, 0.1, 0.8, 0.1, { freqTo: 110, attack: 0.2, release: 0.3 }),
    ],
  },
  se_hit: {
    steps: [
      tone('noise', 100, 0, 0.08, 0.26, { release: 0.05 }),
      tone('square', 180, 0, 0.08, 0.2, { freqTo: 60, release: 0.04 }),
    ],
  },
  se_slash: {
    steps: [
      tone('noise', 4000, 0, 0.1, 0.22, { freqTo: 400, release: 0.06 }),
      tone('sawtooth', 1200, 0, 0.06, 0.12, { freqTo: 300, release: 0.03 }),
    ],
  },
  se_magic_light: {
    steps: [
      ...jingle([1568, 2093, 2637, 3136], 0.05, 0.14, 'sine'),
      tone('sine', 3136, 0.2, 0.3, 0.12, { release: 0.2 }),
    ],
  },
  se_magic_fire: {
    steps: [
      tone('noise', 800, 0, 0.35, 0.2, { freqTo: 200, attack: 0.02, release: 0.15 }),
      tone('sawtooth', 300, 0, 0.3, 0.14, { freqTo: 90, release: 0.1 }),
    ],
  },
  se_magic_water: {
    steps: [
      tone('sine', 400, 0, 0.12, 0.16, { freqTo: 1200 }),
      tone('sine', 1200, 0.1, 0.25, 0.14, { freqTo: 500, release: 0.15 }),
      tone('noise', 2000, 0.05, 0.2, 0.06, { release: 0.15 }),
    ],
  },
  se_magic_earth: {
    steps: [
      tone('square', 80, 0, 0.3, 0.26, { freqTo: 40, release: 0.1 }),
      tone('noise', 120, 0.05, 0.3, 0.16, { release: 0.15 }),
    ],
  },
  se_heal: { steps: jingle([1046, 1318, 1568, 2093, 2637], 0.06, 0.14, 'triangle') },
  se_damage: {
    steps: [
      tone('square', 220, 0, 0.12, 0.22, { freqTo: 110, release: 0.05 }),
      tone('noise', 200, 0, 0.08, 0.14, { release: 0.04 }),
    ],
  },
  se_weak: {
    steps: [
      tone('noise', 2000, 0, 0.14, 0.26, { freqTo: 300, release: 0.08 }),
      tone('square', 500, 0, 0.14, 0.2, { freqTo: 80, release: 0.06 }),
      tone('sine', 1568, 0.1, 0.15, 0.1, { release: 0.1 }),
    ],
  },
  se_buff: {
    steps: [
      tone('triangle', 523, 0, 0.3, 0.16, { freqTo: 1046, release: 0.1 }),
      tone('sine', 1568, 0.2, 0.2, 0.08, { release: 0.1 }),
    ],
  },
  se_levelup: {
    steps: [
      ...jingle([659, 784, 1046, 1318], 0.09, 0.2),
      tone('square', 1568, 0.4, 0.35, 0.2, { release: 0.2 }),
      tone('triangle', 784, 0.4, 0.35, 0.12, { release: 0.2 }),
    ],
  },
  se_shatter: {
    steps: [
      tone('noise', 6000, 0, 0.25, 0.26, { freqTo: 800, release: 0.2 }),
      tone('sine', 2637, 0, 0.5, 0.14, { freqTo: 330, release: 0.3 }),
      tone('sine', 3951, 0.05, 0.4, 0.1, { freqTo: 494, release: 0.3 }),
    ],
  },
  se_fade: { steps: [tone('sine', 523, 0, 0.6, 0.1, { freqTo: 1046, attack: 0.2, release: 0.3 })] },
};
