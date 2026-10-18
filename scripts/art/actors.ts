import { Pixmap, shade } from './pixmap';

/**
 * Walking sprites (docs/GAME_DESIGN.md §9.1: 4 directions × 3 frames, 32×32, chibi
 * proportions). One parametric body with per-character colours and hair/hat/beard
 * variants, so every villager, the party and ノクス share the same silhouette rules.
 *
 * Sheet layout (src/assets/manifest.ts ACTOR_STRIDES / ACTOR_FRAMES): columns are the
 * strides `a` / idle / `b`, rows are down / up / left / right. `right` is `left`
 * mirrored.
 */
export const FRAME = 32;

export type HairStyle =
  | 'short'
  | 'messy'
  | 'ponytail'
  | 'bun'
  | 'long'
  | 'bald'
  | 'cap'
  | 'captain'
  | 'helmet'
  | 'bandana'
  | 'hood'
  | 'mask';

export interface ActorStyle {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  top: number;
  bottom: number;
  shoes: number;
  /** Hat / helmet / bandana / hood colour for those hair styles. */
  hat?: number;
  beard?: number;
  scarf?: number;
  apron?: number;
  glasses?: boolean;
  /** A small lamp on the helmet (miners). */
  lamp?: boolean;
  /** Broad and a head taller (ゴロー). */
  big?: boolean;
  /** Long cloak instead of legs (ノクス). */
  cloak?: boolean;
  /** Pale, translucent body (field enemy symbols). */
  shadow?: boolean;
}

export type Facing = 'down' | 'up' | 'left' | 'right';
export type Stride = 'a' | '' | 'b';

export const ACTOR_STYLES: Readonly<Record<string, ActorStyle>> = {
  // ルカ: dark-teal messy hair, navy coat, white scarf.
  sprite_player: {
    skin: 0xf2c9a0,
    hair: 0x2a5a60,
    hairStyle: 'messy',
    top: 0x24407a,
    bottom: 0x3a3a50,
    shoes: 0x5a3a22,
    scarf: 0xf4f1ea,
  },
  // ミオ: orange ponytail, teal vest, shorts.
  sprite_mio: {
    skin: 0xe0a878,
    hair: 0xe07a30,
    hairStyle: 'ponytail',
    top: 0x2a9a9a,
    bottom: 0x8a6a4a,
    shoes: 0xa07a5a,
  },
  // ゴロー: big, grey-streaked beard, helmet with lamp, dark red shirt, leather apron.
  sprite_goro: {
    skin: 0xd8a888,
    hair: 0x6a6a6a,
    hairStyle: 'helmet',
    hat: 0xc8a040,
    top: 0x8a2a2a,
    bottom: 0x4a3a30,
    shoes: 0x3a2a1a,
    beard: 0x8a8a8a,
    apron: 0x8a6a4a,
    lamp: true,
    big: true,
  },
  // じいちゃん: white beard, grey coat, captain's hat.
  sprite_grandpa: {
    skin: 0xe8c4a0,
    hair: 0xe8e8e8,
    hairStyle: 'captain',
    hat: 0x2a3a5a,
    top: 0x6a6a72,
    bottom: 0x4a4a52,
    shoes: 0x2a2a30,
    beard: 0xf0f0f0,
  },
  sprite_innkeeper: {
    skin: 0xf2c9a0,
    hair: 0x6a3a1a,
    hairStyle: 'bun',
    top: 0xa84a5a,
    bottom: 0x5a3a4a,
    shoes: 0x3a2a2a,
    apron: 0xf4f1ea,
  },
  sprite_boy: {
    skin: 0xf2c9a0,
    hair: 0x7a4a2a,
    hairStyle: 'short',
    top: 0x4a9a4a,
    bottom: 0x5a5a8a,
    shoes: 0x5a3a22,
  },
  sprite_fisherman: {
    skin: 0xd8a070,
    hair: 0x3a2a1a,
    hairStyle: 'bandana',
    hat: 0xd04a3a,
    top: 0x3a6aa8,
    bottom: 0x4a4a52,
    shoes: 0x2a2a30,
  },
  sprite_guard: {
    skin: 0xe8c4a0,
    hair: 0x4a3a2a,
    hairStyle: 'cap',
    hat: 0x8a8a95,
    top: 0x7a7a85,
    bottom: 0x4a4a52,
    shoes: 0x2a2a30,
  },
  sprite_granny: {
    skin: 0xe8c4a0,
    hair: 0xd0d0d0,
    hairStyle: 'bun',
    top: 0x7a5a9a,
    bottom: 0x4a3a5a,
    shoes: 0x3a2a2a,
  },
  sprite_elder: {
    skin: 0xe0b890,
    hair: 0xe0e0e0,
    hairStyle: 'bald',
    top: 0x6a5a3a,
    bottom: 0x4a4a3a,
    shoes: 0x3a2a1a,
    beard: 0xe8e8e8,
  },
  sprite_woman: {
    skin: 0xf2c9a0,
    hair: 0x2a2a3a,
    hairStyle: 'long',
    top: 0xd8a040,
    bottom: 0x6a3a5a,
    shoes: 0x3a2a2a,
  },
  sprite_smith: {
    skin: 0xd8a070,
    hair: 0x5a3a1a,
    hairStyle: 'bald',
    top: 0x6a4a3a,
    bottom: 0x3a3a3a,
    shoes: 0x2a2a1a,
    beard: 0x6a3a1a,
    apron: 0x8a6a4a,
  },
  sprite_miner: {
    skin: 0xe0b080,
    hair: 0x4a3a2a,
    hairStyle: 'helmet',
    hat: 0xc8a040,
    top: 0x8a6a3a,
    bottom: 0x4a3a30,
    shoes: 0x2a2a1a,
    lamp: true,
  },
  sprite_scholar: {
    skin: 0xf2c9a0,
    hair: 0x8a6a3a,
    hairStyle: 'short',
    top: 0x3a7a5a,
    bottom: 0x3a5a4a,
    shoes: 0x3a2a1a,
    glasses: true,
  },
  sprite_assistant: {
    skin: 0xf2c9a0,
    hair: 0x3a2a4a,
    hairStyle: 'ponytail',
    top: 0x5a8a9a,
    bottom: 0x3a4a5a,
    shoes: 0x3a2a2a,
    glasses: true,
  },
  sprite_merchant: {
    skin: 0xe0b080,
    hair: 0x3a2a1a,
    hairStyle: 'cap',
    hat: 0xa83a3a,
    top: 0xc84a3a,
    bottom: 0x5a4a3a,
    shoes: 0x3a2a1a,
  },
  // ノクス: midnight cloak, silver crescent mask, no visible feet.
  sprite_nox: {
    skin: 0xd8d8e8,
    hair: 0x1a1a3a,
    hairStyle: 'mask',
    top: 0x1c1c48,
    bottom: 0x101030,
    shoes: 0x101030,
    cloak: true,
  },
  // Generic villager (fallback for anyone without a face of their own).
  sprite_npc: {
    skin: 0xf2c9a0,
    hair: 0x5a3a1a,
    hairStyle: 'short',
    top: 0xc8a878,
    bottom: 0x5a5a6a,
    shoes: 0x3a2a1a,
  },
  // Field enemy symbol: a pale lost-star wisp.
  sprite_enemy: {
    skin: 0xb8a8e0,
    hair: 0x6a4a9a,
    hairStyle: 'hood',
    hat: 0x5a3a8a,
    top: 0x6a4a9a,
    bottom: 0x4a2a7a,
    shoes: 0x4a2a7a,
    cloak: true,
    shadow: true,
  },
};

export const ACTOR_SHEET_FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];
export const ACTOR_SHEET_STRIDES: readonly Stride[] = ['a', '', 'b'];

/** The full 96×128 sheet for a style. */
export function renderActorSheet(style: ActorStyle): Pixmap {
  const sheet = new Pixmap(FRAME * ACTOR_SHEET_STRIDES.length, FRAME * ACTOR_SHEET_FACINGS.length);
  ACTOR_SHEET_FACINGS.forEach((facing, row) => {
    ACTOR_SHEET_STRIDES.forEach((stride, col) => {
      sheet.blit(renderActorFrame(style, facing, stride), col * FRAME, row * FRAME);
    });
  });
  return sheet;
}

/** One frame; `right` is the mirrored `left`. */
export function renderActorFrame(style: ActorStyle, facing: Facing, stride: Stride): Pixmap {
  if (facing === 'right') {
    const left = renderActorFrame(style, 'left', stride);
    const out = new Pixmap(FRAME, FRAME);
    out.blit(left, 0, 0, { flipX: true });
    return out;
  }
  const pm = new Pixmap(FRAME, FRAME);
  const g = geometry(style, stride);
  drawShadow(pm, style);
  if (style.cloak) drawCloak(pm, style, facing, g);
  else drawLegs(pm, style, facing, stride, g);
  drawBody(pm, style, facing, g);
  drawHead(pm, style, facing, g);
  if (style.shadow) fadeToWisp(pm);
  return pm;
}

interface Geometry {
  /** Head box. */
  hx: number;
  hy: number;
  hw: number;
  hh: number;
  /** Body box. */
  bx: number;
  by: number;
  bw: number;
  bh: number;
  /** Top of the legs and the ground line. */
  ly: number;
  ground: number;
  /** Vertical bob while striding. */
  bob: number;
}

function geometry(style: ActorStyle, stride: Stride): Geometry {
  const bob = stride === '' ? 0 : -1;
  if (style.big) {
    return {
      hx: 10,
      hy: 4 + bob,
      hw: 12,
      hh: 11,
      bx: 9,
      by: 15 + bob,
      bw: 14,
      bh: 11,
      ly: 26 + bob,
      ground: 30,
      bob,
    };
  }
  return {
    hx: 11,
    hy: 8 + bob,
    hw: 10,
    hh: 10,
    bx: 11,
    by: 18 + bob,
    bw: 10,
    bh: 8,
    ly: 26 + bob,
    ground: 30,
    bob,
  };
}

function drawShadow(pm: Pixmap, style: ActorStyle): void {
  pm.fillEllipse(16, 30.5, style.big ? 9 : 7, 2.2, 0x000000, 70);
}

function drawLegs(
  pm: Pixmap,
  style: ActorStyle,
  facing: Facing,
  stride: Stride,
  g: Geometry,
): void {
  const legDark = shade(style.bottom, -0.25);
  const legW = style.big ? 4 : 3;
  const gap = style.big ? 2 : 2;
  const cx = 16;
  if (facing === 'left') {
    // Side view: legs overlap; strides spread them front/back.
    const spread = stride === '' ? 0 : 2;
    const back = stride === 'a' ? -spread : spread;
    const front = -back;
    leg(pm, cx - legW + back, g.ly, legW, g.ground - g.ly, legDark, style.shoes, true);
    leg(pm, cx - legW + 1 + front, g.ly, legW, g.ground - g.ly, style.bottom, style.shoes, false);
    return;
  }
  // Front/back view: one foot lifted per stride.
  const lift = stride === '' ? [0, 0] : stride === 'a' ? [0, 2] : [2, 0];
  const leftX = cx - gap / 2 - legW;
  const rightX = cx + gap / 2;
  leg(pm, leftX, g.ly, legW, g.ground - g.ly - (lift[0] ?? 0), style.bottom, style.shoes, false);
  leg(pm, rightX, g.ly, legW, g.ground - g.ly - (lift[1] ?? 0), style.bottom, style.shoes, false);
}

function leg(
  pm: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: number,
  shoe: number,
  behind: boolean,
): void {
  pm.fillRect(x, y, w, h, behind ? shade(colour, -0.2) : colour);
  pm.fillRect(x, y + h - 1, w, 1, shoe);
  pm.set(x + w - 1, y + h - 1, shade(shoe, -0.3));
}

function drawCloak(pm: Pixmap, style: ActorStyle, facing: Facing, g: Geometry): void {
  const dark = shade(style.top, -0.3);
  const hemY = g.ground + 1;
  // Trapezoid from the shoulders to a wide hem, trailing into shadow.
  const top = g.by + 2;
  for (let y = top; y < hemY; y += 1) {
    const t = (y - top) / Math.max(1, hemY - top);
    const half = Math.round((g.bw / 2) * (1 + t * 0.5));
    pm.fillRect(16 - half, y, half * 2, 1, y % 3 === 0 ? dark : style.top);
  }
  pm.fillRect(16 - Math.round(g.bw * 0.75), hemY - 1, Math.round(g.bw * 1.5), 1, style.bottom);
  if (facing === 'left') pm.fillRect(16 - g.bw / 2 - 2, top + 2, 2, hemY - top - 4, dark);
}

function drawBody(pm: Pixmap, style: ActorStyle, facing: Facing, g: Geometry): void {
  const { bx, by, bw, bh } = g;
  const dark = shade(style.top, -0.3);
  const light = shade(style.top, 0.15);
  pm.fillRect(bx, by, bw, bh, style.top);
  pm.fillRect(bx, by, 1, bh, light);
  pm.fillRect(bx + bw - 1, by, 1, bh, dark);
  pm.fillRect(bx, by + bh - 1, bw, 1, dark);
  // Arms (sleeves), hands in skin colour.
  const armH = Math.max(4, bh - 2);
  if (facing === 'left') {
    pm.fillRect(bx + 1, by + 2, 3, armH, dark);
    pm.fillRect(bx + 1, by + 1 + armH, 3, 1, style.skin);
  } else {
    pm.fillRect(bx - 2, by + 1, 2, armH, dark);
    pm.fillRect(bx + bw, by + 1, 2, armH, dark);
    pm.fillRect(bx - 2, by + armH, 2, 1, style.skin);
    pm.fillRect(bx + bw, by + armH, 2, 1, style.skin);
  }
  if (style.apron !== undefined && facing !== 'up') {
    const ax = facing === 'left' ? bx + 2 : bx + 2;
    pm.fillRect(ax, by + 2, bw - 4, bh - 2, style.apron);
    pm.fillRect(ax, by + 2, bw - 4, 1, shade(style.apron, -0.2));
  }
  if (style.scarf !== undefined) {
    pm.fillRect(bx - 1, by - 1, bw + 2, 2, style.scarf);
    pm.fillRect(bx - 1, by + 1, bw + 2, 1, shade(style.scarf, -0.25));
    if (facing !== 'up') pm.fillRect(bx + bw - 3, by + 1, 2, 4, style.scarf);
  }
}

function drawHead(pm: Pixmap, style: ActorStyle, facing: Facing, g: Geometry): void {
  const { hx, hy, hw, hh } = g;
  const hairDark = shade(style.hair, -0.3);
  const skinDark = shade(style.skin, -0.25);
  // Face / skull.
  pm.fillRect(hx, hy + 1, hw, hh - 1, style.skin);
  pm.fillRect(hx + 1, hy, hw - 2, 1, style.skin);
  pm.fillRect(hx, hy + hh - 1, hw, 1, skinDark);
  pm.set(hx, hy + 1, skinDark);
  pm.set(hx + hw - 1, hy + 1, skinDark);
  const eyeY = hy + Math.floor(hh * 0.55);
  if (facing === 'down') {
    eye(pm, hx + 2, eyeY, style);
    eye(pm, hx + hw - 4, eyeY, style);
  } else if (facing === 'left') {
    eye(pm, hx + 2, eyeY, style);
  }
  if (style.beard !== undefined && facing !== 'up') {
    const by = eyeY + 2;
    const bx = facing === 'left' ? hx : hx + 1;
    const bw = facing === 'left' ? hw - 3 : hw - 2;
    pm.fillRect(bx, by, bw, hy + hh - by + 1, style.beard);
    pm.fillRect(bx + 1, hy + hh + 1, bw - 2, 1, style.beard);
    pm.fillRect(bx, by, bw, 1, shade(style.beard, 0.15));
  }
  drawHair(pm, style, facing, g, hairDark);
  if (style.glasses && facing !== 'up') {
    const gy = eyeY;
    if (facing === 'down') {
      pm.strokeRect(hx + 1, gy - 1, 4, 3, 0x2a2a3a);
      pm.strokeRect(hx + hw - 5, gy - 1, 4, 3, 0x2a2a3a);
      pm.set(hx + 5, gy, 0x2a2a3a);
    } else {
      pm.strokeRect(hx + 1, gy - 1, 4, 3, 0x2a2a3a);
      pm.fillRect(hx + 5, gy, 4, 1, 0x2a2a3a);
    }
  }
}

function eye(pm: Pixmap, x: number, y: number, style: ActorStyle): void {
  if (style.shadow) {
    pm.fillRect(x, y, 2, 2, 0xfff6d5);
    return;
  }
  pm.fillRect(x, y, 2, 2, 0x1b1b2a);
  pm.set(x, y, 0x3a3a50);
}

function drawHair(pm: Pixmap, style: ActorStyle, facing: Facing, g: Geometry, dark: number): void {
  const { hx, hy, hw, hh } = g;
  const hair = style.hair;
  const cap = (rows: number): void => {
    pm.fillRect(hx, hy + 1, hw, rows - 1, hair);
    pm.fillRect(hx + 1, hy, hw - 2, 1, hair);
    pm.fillRect(hx, hy + rows - 1, hw, 1, dark);
  };
  const backOfHead = (): void => {
    pm.fillRect(hx, hy + 1, hw, hh - 1, hair);
    pm.fillRect(hx + 1, hy, hw - 2, 1, hair);
    pm.fillRect(hx, hy + hh - 1, hw, 1, dark);
  };
  const hat = style.hat ?? dark;
  switch (style.hairStyle) {
    case 'short':
      if (facing === 'up') backOfHead();
      else {
        cap(4);
        pm.fillRect(hx, hy + 4, 1, 3, hair);
        if (facing === 'down') pm.fillRect(hx + hw - 1, hy + 4, 1, 3, hair);
        else pm.fillRect(hx + hw - 2, hy + 4, 2, 5, hair);
      }
      return;
    case 'messy':
      if (facing === 'up') backOfHead();
      else {
        cap(4);
        pm.fillRect(hx + 2, hy + 4, 2, 1, hair);
        pm.fillRect(hx + 6, hy + 4, 1, 2, hair);
        if (facing === 'left') pm.fillRect(hx + hw - 3, hy + 4, 3, 5, hair);
        else pm.fillRect(hx + hw - 1, hy + 4, 1, 4, hair);
      }
      // Spiky top.
      pm.set(hx + 2, hy - 1, hair);
      pm.set(hx + 5, hy - 1, hair);
      pm.set(hx + hw - 3, hy - 1, hair);
      return;
    case 'ponytail':
      if (facing === 'up') {
        backOfHead();
        pm.fillRect(hx + hw / 2 - 1, hy + hh - 2, 3, 6, hair);
        pm.fillRect(hx + hw / 2 - 1, hy + hh + 3, 3, 1, dark);
      } else {
        cap(4);
        if (facing === 'left') {
          pm.fillRect(hx + hw - 3, hy + 3, 3, 5, hair);
          pm.fillRect(hx + hw - 1, hy + 2, 3, 7, hair);
          pm.fillRect(hx + hw, hy + 8, 2, 1, dark);
        } else {
          pm.fillRect(hx, hy + 4, 1, 3, hair);
          pm.fillRect(hx + hw - 1, hy + 4, 1, 3, hair);
          pm.fillRect(hx + hw / 2 - 2, hy - 2, 4, 2, hair);
        }
      }
      return;
    case 'bun':
      if (facing === 'up') backOfHead();
      else {
        cap(4);
        if (facing === 'left') pm.fillRect(hx + hw - 2, hy + 4, 2, 4, hair);
      }
      pm.fillRect(hx + hw / 2 - 2, hy - 2, 4, 3, hair);
      pm.set(hx + hw / 2 + 1, hy - 1, dark);
      return;
    case 'long':
      if (facing === 'up') {
        backOfHead();
        pm.fillRect(hx, hy + hh, hw, 5, hair);
        pm.fillRect(hx, hy + hh + 4, hw, 1, dark);
      } else {
        cap(4);
        pm.fillRect(hx, hy + 4, 2, hh + 1, hair);
        pm.fillRect(hx + hw - 2, hy + 4, 2, hh + 1, hair);
        if (facing === 'left') pm.fillRect(hx + hw - 4, hy + 3, 4, hh + 2, hair);
      }
      return;
    case 'bald':
      if (facing === 'up') {
        pm.fillRect(hx, hy + hh - 4, hw, 3, hair);
      } else {
        pm.fillRect(hx, hy + 3, 1, 4, hair);
        if (facing === 'down') pm.fillRect(hx + hw - 1, hy + 3, 1, 4, hair);
        else pm.fillRect(hx + hw - 2, hy + 3, 2, 5, hair);
        pm.set(hx + 3, hy + 1, shade(style.skin, 0.2));
      }
      return;
    case 'cap':
      // Brimmed cap in the hat colour, hair peeking at the sides.
      if (facing === 'up') backOfHead();
      else {
        pm.fillRect(hx, hy + 4, 1, 3, hair);
        pm.fillRect(hx + hw - 1, hy + 4, 1, 3, hair);
      }
      pm.fillRect(hx - 1, hy + 3, hw + 2, 2, shade(hat, -0.3));
      pm.fillRect(hx, hy, hw, 3, hat);
      pm.fillRect(hx + 1, hy - 1, hw - 2, 1, hat);
      pm.fillRect(hx + 1, hy + 1, 3, 1, shade(hat, 0.25));
      return;
    case 'captain':
      if (facing === 'up') backOfHead();
      else {
        pm.fillRect(hx, hy + 4, 1, 3, hair);
        pm.fillRect(hx + hw - 1, hy + 4, 1, 3, hair);
      }
      pm.fillRect(hx - 1, hy + 2, hw + 2, 2, shade(hat, -0.4));
      pm.fillRect(hx - 1, hy - 1, hw + 2, 3, hat);
      pm.fillRect(hx, hy - 2, hw, 1, hat);
      pm.fillRect(hx + 1, hy - 1, hw - 2, 1, shade(hat, 0.3));
      if (facing === 'down') pm.fillRect(hx + hw / 2 - 1, hy, 2, 1, 0xffe9a3);
      return;
    case 'helmet':
      pm.fillRect(hx - 1, hy + 1, hw + 2, 3, hat);
      pm.fillRect(hx, hy - 1, hw, 2, hat);
      pm.fillRect(hx + 1, hy - 2, hw - 2, 1, hat);
      pm.fillRect(hx - 1, hy + 3, hw + 2, 1, shade(hat, -0.35));
      pm.fillRect(hx + 1, hy - 1, 3, 1, shade(hat, 0.3));
      if (style.lamp) {
        const lx = facing === 'left' ? hx - 1 : hx + hw / 2 - 1;
        pm.fillRect(lx, hy - 1, 2, 2, 0xfff6d5);
        pm.set(lx, hy - 2, 0xffe9a3);
      }
      if (facing === 'up') pm.fillRect(hx, hy + 4, hw, hh - 4, hair);
      return;
    case 'bandana':
      if (facing === 'up') backOfHead();
      pm.fillRect(hx, hy + 1, hw, 3, hat);
      pm.fillRect(hx + 1, hy, hw - 2, 1, hat);
      pm.fillRect(hx, hy + 3, hw, 1, shade(hat, -0.3));
      pm.fillRect(hx + hw - 1, hy + 4, 2, 3, shade(hat, -0.2));
      return;
    case 'hood':
      pm.fillRect(hx - 1, hy, hw + 2, hh, hat);
      pm.fillRect(hx, hy - 1, hw, 1, hat);
      pm.fillRect(hx - 1, hy + hh - 1, hw + 2, 1, shade(hat, -0.3));
      if (facing !== 'up') {
        pm.fillRect(hx + 1, hy + 3, hw - 2, hh - 4, shade(hat, -0.55));
        const eyeY = hy + Math.floor(hh * 0.55);
        if (facing === 'down') {
          eye(pm, hx + 2, eyeY, style);
          eye(pm, hx + hw - 4, eyeY, style);
        } else eye(pm, hx + 2, eyeY, style);
      }
      return;
    case 'mask':
      // Dark hood with a silver crescent mask over the face.
      pm.fillRect(hx - 1, hy, hw + 2, hh, hair);
      pm.fillRect(hx, hy - 1, hw, 1, hair);
      if (facing !== 'up') {
        pm.fillRect(hx + 1, hy + 2, hw - 2, hh - 3, style.skin);
        pm.fillRect(hx + 1, hy + 2, hw - 2, 1, shade(style.skin, 0.2));
        const eyeY = hy + Math.floor(hh * 0.55);
        if (facing === 'down') {
          pm.fillRect(hx + 3, eyeY, 1, 2, 0x1a1a3a);
          pm.fillRect(hx + hw - 4, eyeY, 1, 2, 0x1a1a3a);
          // Crescent cut on the left cheek.
          pm.fillRect(hx + 1, eyeY + 2, 2, 2, hair);
        } else {
          pm.fillRect(hx + 3, eyeY, 1, 2, 0x1a1a3a);
          pm.fillRect(hx + 1, eyeY + 2, 2, 2, hair);
        }
      }
      return;
  }
}

/** Enemy symbols: soften everything toward translucent starlight. */
function fadeToWisp(pm: Pixmap): void {
  for (let y = 0; y < FRAME; y += 1) {
    for (let x = 0; x < FRAME; x += 1) {
      const p = pm.get(x, y);
      if (p.a === 0) continue;
      const a = y > 26 ? Math.round(p.a * 0.55) : Math.round(p.a * 0.9);
      pm.set(x, y, p.rgb, a);
    }
  }
}
