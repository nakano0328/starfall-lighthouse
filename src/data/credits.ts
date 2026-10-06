import creditsMarkdown from '/docs/CREDITS.md?raw';

import type { CreditSection } from '@core/credits';
import { parseCredits, staffRoll } from '@core/credits';

/** docs/CREDITS.md parsed at build time (Vite `?raw`, root-relative so no `../../`). */
export const CREDIT_SECTIONS: readonly CreditSection[] = parseCredits(creditsMarkdown);

/** Opening and closing blocks of the staff roll (§11.5). */
export const STAFF_ROLL_OPENING: readonly string[] = [
  'ほしふる灯台',
  'Starfall Lighthouse',
  '',
  '企画・制作',
  'nakano0328',
  '',
  '物語・マップ・会話',
  'ほしふる灯台 制作チーム',
];

export const STAFF_ROLL_CLOSING: readonly string[] = [
  'Special Thanks',
  '灯台を 見上げてくれた あなた',
];

/** Every line of the ending roll, top to bottom. */
export const STAFF_ROLL_LINES: readonly string[] = staffRoll(
  CREDIT_SECTIONS,
  STAFF_ROLL_OPENING,
  STAFF_ROLL_CLOSING,
);
