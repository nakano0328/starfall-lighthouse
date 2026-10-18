import type { ActorStyle } from './actors';
import { ACTOR_STYLES } from './actors';
import { Pixmap, shade } from './pixmap';

/**
 * 96×96 dialogue portraits (docs/ART_PROMPTS.md CH-xxB / CH-10): a bust that shares
 * each character's colours with their walking sprite, with an expression variant per
 * key the dialogs use (`portrait_<who>_<expression>`, src/data/dialogs/*.json).
 */
export type Expression = 'neutral' | 'smile' | 'stern' | 'surprised';

export interface PortraitSpec {
  key: string;
  style: ActorStyle;
  expression: Expression;
}

const who = (key: string): ActorStyle => {
  const style = ACTOR_STYLES[key];
  if (!style) throw new Error(`no actor style ${key}`);
  return style;
};

export const PORTRAITS: readonly PortraitSpec[] = [
  { key: 'portrait_luka_neutral', style: who('sprite_player'), expression: 'neutral' },
  { key: 'portrait_luka_smile', style: who('sprite_player'), expression: 'smile' },
  { key: 'portrait_mio_neutral', style: who('sprite_mio'), expression: 'neutral' },
  { key: 'portrait_mio_smile', style: who('sprite_mio'), expression: 'smile' },
  { key: 'portrait_goro_neutral', style: who('sprite_goro'), expression: 'neutral' },
  { key: 'portrait_goro_smile', style: who('sprite_goro'), expression: 'smile' },
  { key: 'portrait_goro_stern', style: who('sprite_goro'), expression: 'stern' },
  { key: 'portrait_grandpa_neutral', style: who('sprite_grandpa'), expression: 'neutral' },
  { key: 'portrait_grandpa_smile', style: who('sprite_grandpa'), expression: 'smile' },
  { key: 'portrait_nox_neutral', style: who('sprite_nox'), expression: 'neutral' },
];

export const PORTRAIT_KEYS: readonly string[] = PORTRAITS.map((p) => p.key);

export const PORTRAIT_SIZE = 96;

export function renderPortrait(spec: PortraitSpec): Pixmap {
  const pm = new Pixmap(PORTRAIT_SIZE, PORTRAIT_SIZE);
  const s = spec.style;
  const skinDark = shade(s.skin, -0.2);
  const hairDark = shade(s.hair, -0.3);
  // Backdrop: a soft dark disc so the face reads over the window.
  pm.fillEllipse(48, 54, 44, 44, 0x0b1026, 150);
  // Shoulders.
  pm.fillEllipse(48, 104, 40, 26, s.top);
  pm.fillRect(8, 92, 80, 4, shade(s.top, -0.3));
  if (s.scarf !== undefined) pm.fillEllipse(48, 82, 22, 9, s.scarf);
  if (s.cloak) pm.fillEllipse(48, 100, 46, 30, s.top);
  // Neck.
  pm.fillRect(40, 70, 16, 14, skinDark);
  // Head.
  const headW = s.big ? 50 : 44;
  pm.fillEllipse(48, 46, headW / 2, 26, s.skin);
  pm.fillRect(48 - headW / 2, 46, headW, 1, s.skin);
  // Ears.
  pm.fillEllipse(48 - headW / 2, 48, 4, 6, skinDark);
  pm.fillEllipse(48 + headW / 2, 48, 4, 6, skinDark);
  drawPortraitHair(pm, s, headW, hairDark);
  drawFace(pm, s, spec.expression, headW);
  pm.outline(0x0b1026);
  return pm;
}

function drawFace(pm: Pixmap, s: ActorStyle, expression: Expression, headW: number): void {
  const eyeY = 50;
  const dx = headW * 0.22;
  const iris = s.shadow ? 0xfff6d5 : 0x2a2a3a;
  if (s.hairStyle === 'mask') {
    // Silver crescent mask: one eye slit shows.
    pm.fillEllipse(48, 48, headW / 2 - 2, 22, 0xd8d8e8);
    pm.fillEllipse(58, 48, 10, 18, s.hair);
    pm.fillRect(40, 44, 3, 8, 0x1a1a3a);
    pm.set(41, 46, 0xffe9a3);
    pm.set(41, 47, 0xffe9a3);
    pm.fillRect(34, 60, 10, 2, 0x8a8a9a);
    return;
  }
  const eye = (cx: number): void => {
    pm.fillEllipse(cx, eyeY, 4.5, 3.5, 0xffffff);
    pm.fillEllipse(cx + 0.5, eyeY + 0.5, 2.6, 2.8, iris);
    pm.set(Math.round(cx - 1), eyeY - 1, 0xffffff);
    pm.fillRect(Math.round(cx) - 5, eyeY - 5, 10, 2, shade(s.skin, -0.45)); // lash line
  };
  if (expression === 'smile') {
    // Happy closed-ish eyes: arcs.
    for (const cx of [48 - dx, 48 + dx]) {
      pm.fillEllipse(cx, eyeY, 5, 3.5, shade(s.skin, -0.45));
      pm.fillEllipse(cx, eyeY + 1.5, 5, 3, s.skin);
    }
  } else {
    eye(48 - dx);
    eye(48 + dx);
  }
  // Brows.
  const browY = eyeY - 9;
  const browColor =
    s.hair === 0xe8e8e8 || s.hair === 0xd0d0d0 ? shade(s.skin, -0.4) : shade(s.hair, -0.2);
  for (const sgn of [-1, 1]) {
    const bx = Math.round(48 + sgn * dx);
    if (expression === 'stern') {
      pm.line(bx - sgn * 5, browY - 1, bx + sgn * 4, browY + 2, browColor, 255);
      pm.line(bx - sgn * 5, browY, bx + sgn * 4, browY + 3, browColor, 255);
    } else if (expression === 'surprised') {
      pm.fillRect(bx - 5, browY - 3, 10, 2, browColor);
    } else {
      pm.fillRect(bx - 5, browY, 10, 2, browColor);
    }
  }
  // Nose and mouth.
  pm.fillRect(47, 56, 2, 4, shade(s.skin, -0.25));
  const mouthY = 65;
  if (expression === 'smile') {
    pm.fillRect(41, mouthY, 14, 2, 0x8a3a3a);
    pm.set(40, mouthY - 1, 0x8a3a3a);
    pm.set(55, mouthY - 1, 0x8a3a3a);
    pm.fillRect(42, mouthY + 2, 12, 2, 0xffffff);
  } else if (expression === 'surprised') {
    pm.fillEllipse(48, mouthY + 1, 4, 4, 0x8a3a3a);
  } else {
    pm.fillRect(43, mouthY, 10, 2, 0x8a3a3a);
  }
  if (s.beard !== undefined) {
    pm.fillEllipse(48, 70, headW / 2 - 2, 14, s.beard);
    pm.fillEllipse(48, 78, headW / 2 - 8, 14, s.beard);
    pm.fillRect(43, mouthY, 10, 2, 0x5a2a2a);
    if (expression === 'smile') pm.fillRect(42, mouthY + 2, 12, 2, 0xffffff);
  }
  if (s.glasses) {
    for (const sgn of [-1, 1]) {
      const cx = Math.round(48 + sgn * dx);
      pm.strokeRect(cx - 7, eyeY - 5, 14, 10, 0x2a2a3a);
    }
    pm.fillRect(45, eyeY - 1, 6, 2, 0x2a2a3a);
  }
}

function drawPortraitHair(pm: Pixmap, s: ActorStyle, headW: number, dark: number): void {
  const left = 48 - headW / 2;
  const hat = s.hat ?? dark;
  const fringe = (): void => {
    pm.fillEllipse(48, 30, headW / 2 + 1, 12, s.hair);
    pm.fillRect(left - 1, 30, headW + 2, 6, s.hair);
    pm.fillRect(left - 1, 36, 6, 14, s.hair);
    pm.fillRect(left + headW - 5, 36, 6, 14, s.hair);
  };
  switch (s.hairStyle) {
    case 'short':
      fringe();
      pm.fillRect(left + 8, 34, 8, 6, s.hair);
      return;
    case 'messy':
      fringe();
      for (const [x, y] of [
        [left + 4, 22],
        [left + 14, 18],
        [left + 26, 20],
        [left + 36, 24],
      ]) {
        pm.fillTriangle((x ?? 0) - 3, 32, (x ?? 0) + 5, 32, (x ?? 0) + 1, y ?? 20, s.hair);
      }
      pm.fillRect(left + 18, 36, 6, 4, s.hair);
      return;
    case 'ponytail':
      fringe();
      pm.fillEllipse(left + headW + 6, 40, 7, 16, s.hair);
      pm.fillEllipse(left + headW + 8, 60, 5, 12, dark);
      pm.fillRect(left + 6, 36, 10, 3, s.hair);
      return;
    case 'bun':
      fringe();
      pm.fillEllipse(48, 20, 10, 8, s.hair);
      pm.fillEllipse(50, 18, 4, 3, dark);
      return;
    case 'long':
      fringe();
      pm.fillRect(left - 4, 36, 9, 50, s.hair);
      pm.fillRect(left + headW - 5, 36, 9, 50, s.hair);
      return;
    case 'bald':
      pm.fillRect(left - 1, 38, 5, 14, s.hair);
      pm.fillRect(left + headW - 4, 38, 5, 14, s.hair);
      pm.fillEllipse(40, 28, 6, 3, shade(s.skin, 0.2));
      return;
    case 'cap':
      pm.fillEllipse(48, 30, headW / 2 + 2, 12, hat);
      pm.fillRect(left - 6, 32, headW + 12, 5, shade(hat, -0.3));
      pm.fillRect(left + 6, 22, 12, 3, shade(hat, 0.25));
      return;
    case 'captain':
      pm.fillRect(left - 2, 24, headW + 4, 12, hat);
      pm.fillRect(left - 6, 34, headW + 12, 4, shade(hat, -0.4));
      pm.fillRect(left, 20, headW, 5, hat);
      pm.fillRect(44, 28, 8, 4, 0xffe9a3);
      pm.fillRect(left - 1, 38, 5, 10, s.hair);
      pm.fillRect(left + headW - 4, 38, 5, 10, s.hair);
      return;
    case 'helmet':
      pm.fillEllipse(48, 30, headW / 2 + 3, 14, hat);
      pm.fillRect(left - 4, 32, headW + 8, 5, shade(hat, -0.35));
      pm.fillRect(left + 4, 22, 10, 3, shade(hat, 0.3));
      if (s.lamp) {
        pm.fillRect(43, 22, 10, 8, 0xfff6d5);
        pm.fillEllipse(48, 26, 10, 7, 0xffe9a3, 60);
      }
      return;
    case 'bandana':
      pm.fillEllipse(48, 30, headW / 2 + 1, 11, hat);
      pm.fillRect(left - 1, 30, headW + 2, 6, hat);
      pm.fillTriangle(
        left + headW - 2,
        32,
        left + headW + 12,
        40,
        left + headW - 4,
        42,
        shade(hat, -0.2),
      );
      return;
    case 'hood':
    case 'mask':
      pm.fillEllipse(48, 44, headW / 2 + 8, 32, s.hair);
      pm.fillEllipse(
        48,
        48,
        headW / 2 - 1,
        23,
        s.hairStyle === 'mask' ? 0xd8d8e8 : shade(s.hair, -0.5),
      );
      return;
  }
}
