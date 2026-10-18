import { Pixmap, mix, seededRandom, shade } from './pixmap';

/**
 * Battle sprites for the 14 enemies and 5 boss forms (docs/ART_PROMPTS.md EN-01〜14,
 * BO-01〜04b). Every creature is drawn on a 96-unit grid and scaled to its sprite size
 * (normal 96, boss 192, final form 256), so bosses reuse the same drawing helpers.
 */
type Draw = (c: Canvas) => void;

/** A drawing surface in 96-unit coordinates that maps onto the real pixel size. */
class Canvas {
  readonly pm: Pixmap;
  private readonly u: number;
  readonly rand: () => number;

  constructor(size: number, seed: number) {
    this.pm = new Pixmap(size, size);
    this.u = size / 96;
    this.rand = seededRandom(seed);
  }

  px(v: number): number {
    return Math.round(v * this.u);
  }

  rect(x: number, y: number, w: number, h: number, rgb: number, a = 255): void {
    this.pm.fillRect(
      this.px(x),
      this.px(y),
      Math.max(1, this.px(w)),
      Math.max(1, this.px(h)),
      rgb,
      a,
    );
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, rgb: number, a = 255): void {
    this.pm.fillEllipse(
      cx * this.u,
      cy * this.u,
      Math.max(0.5, rx * this.u),
      Math.max(0.5, ry * this.u),
      rgb,
      a,
    );
  }

  circle(cx: number, cy: number, r: number, rgb: number, a = 255): void {
    this.ellipse(cx, cy, r, r, rgb, a);
  }

  tri(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: number,
    a = 255,
  ): void {
    this.pm.fillTriangle(
      this.px(x0),
      this.px(y0),
      this.px(x1),
      this.px(y1),
      this.px(x2),
      this.px(y2),
      rgb,
      a,
    );
  }

  line(x0: number, y0: number, x1: number, y1: number, rgb: number, width = 1, a = 255): void {
    const w = Math.max(1, this.px(width));
    for (let i = 0; i < w; i += 1) {
      this.pm.line(this.px(x0) + i, this.px(y0), this.px(x1) + i, this.px(y1), rgb, a);
      if (w > 1) this.pm.line(this.px(x0), this.px(y0) + i, this.px(x1), this.px(y1) + i, rgb, a);
    }
  }

  /** Soft radial glow (several concentric translucent discs). */
  glow(cx: number, cy: number, r: number, rgb: number, strength = 1): void {
    for (let i = 4; i >= 1; i -= 1) {
      this.circle(cx, cy, (r * i) / 4, rgb, Math.round(28 * strength));
    }
  }

  /** Four-pointed star (the game's star motif). */
  star(cx: number, cy: number, r: number, rgb: number): void {
    const s = r * 0.28;
    this.tri(cx, cy - r, cx + s, cy - s, cx - s, cy - s, rgb);
    this.tri(cx, cy + r, cx + s, cy + s, cx - s, cy + s, rgb);
    this.tri(cx - r, cy, cx - s, cy - s, cx - s, cy + s, rgb);
    this.tri(cx + r, cy, cx + s, cy - s, cx + s, cy + s, rgb);
    this.rect(cx - s, cy - s, s * 2, s * 2, rgb);
    this.circle(cx, cy, s * 0.6, 0xffffff);
  }

  eye(cx: number, cy: number, r: number, iris: number, white = 0xf4f1ea): void {
    this.ellipse(cx, cy, r, r * 1.15, white);
    this.circle(cx + r * 0.15, cy + r * 0.1, r * 0.5, iris);
    this.circle(cx - r * 0.15, cy - r * 0.3, r * 0.18, 0xffffff);
  }

  groundShadow(cx: number, cy: number, rx: number): void {
    this.ellipse(cx, cy, rx, rx * 0.22, 0x000000, 70);
  }

  outline(rgb: number): void {
    this.pm.outline(rgb);
  }
}

const INK = 0x1b1b2a;

const DRAWERS: Readonly<Record<string, Draw>> = {
  // EN-01 迷い星スライム: a translucent dome of pale starlight with a star core and a sad face.
  en_lost_star_slime: (c) => {
    c.groundShadow(48, 80, 30);
    c.glow(48, 56, 34, 0xbfe6ff, 0.8);
    c.ellipse(48, 58, 30, 24, 0x6fb4e0, 230);
    c.ellipse(48, 56, 28, 22, 0x9fd0f0, 230);
    c.ellipse(40, 46, 9, 5, 0xe8f6ff, 200);
    c.star(48, 60, 9, 0xffe9a3);
    c.rect(36, 50, 4, 5, INK);
    c.rect(56, 50, 4, 5, INK);
    c.line(34, 46, 41, 48, INK, 2);
    c.line(62, 46, 55, 48, INK, 2);
    c.rect(45, 66, 6, 2, INK);
    c.outline(0x2a4a70);
  },
  // EN-02 ささやきコウモリ: purple bat, oversized ears, note sparkles.
  en_whisper_bat: (c) => {
    const body = 0x6a3a9a;
    c.tri(46, 44, 6, 30, 16, 62, body);
    c.tri(50, 44, 90, 30, 80, 62, body);
    c.tri(10, 58, 24, 46, 30, 62, shade(body, -0.2));
    c.tri(86, 58, 72, 46, 66, 62, shade(body, -0.2));
    c.ellipse(48, 50, 16, 14, shade(body, 0.1));
    c.tri(36, 42, 30, 14, 46, 40, body);
    c.tri(60, 42, 66, 14, 50, 40, body);
    c.tri(37, 40, 34, 22, 44, 40, 0xe0a0c0);
    c.tri(59, 40, 62, 22, 52, 40, 0xe0a0c0);
    c.eye(42, 50, 4, 0xffe9a3, 0xfff6d5);
    c.eye(54, 50, 4, 0xffe9a3, 0xfff6d5);
    c.tri(44, 58, 47, 58, 45, 62, 0xffffff);
    c.tri(50, 58, 53, 58, 51, 62, 0xffffff);
    for (const [x, y] of [
      [14, 18],
      [82, 22],
      [22, 74],
    ]) {
      c.rect(x ?? 0, y ?? 0, 2, 7, 0xffe9a3);
      c.circle((x ?? 0) + 1, (y ?? 0) + 8, 2.2, 0xffe9a3);
    }
    c.outline(0x2a1a3a);
  },
  // EN-03 キノコの子: spotted cap on a stubby body with a mischievous grin.
  en_mushroom_kid: (c) => {
    c.groundShadow(48, 86, 24);
    c.rect(36, 56, 24, 22, 0xf0e0c0);
    c.rect(36, 74, 24, 4, shade(0xf0e0c0, -0.2));
    c.rect(34, 78, 10, 8, 0xd0b890);
    c.rect(52, 78, 10, 8, 0xd0b890);
    c.ellipse(48, 46, 34, 18, 0xc84a3c);
    c.rect(14, 46, 68, 10, 0xc84a3c);
    c.ellipse(48, 56, 34, 6, shade(0xc84a3c, -0.3));
    for (const [x, y, r] of [
      [30, 40, 5],
      [52, 34, 6],
      [68, 44, 4],
      [42, 50, 3],
    ]) {
      c.circle(x ?? 0, y ?? 0, r ?? 3, 0xf4f1ea);
    }
    c.rect(41, 60, 3, 5, INK);
    c.rect(52, 60, 3, 5, INK);
    c.line(40, 70, 56, 70, INK, 2);
    c.tri(40, 70, 44, 70, 42, 73, INK);
    c.rect(46, 71, 6, 2, 0xf4f1ea);
    c.outline(0x4a2a1a);
  },
  // EN-04 森オオカミ: lean grey wolf, mossy back, glowing green eyes.
  en_forest_wolf: (c) => {
    const fur = 0x8a8a90;
    c.groundShadow(50, 84, 36);
    c.ellipse(52, 58, 30, 14, fur);
    c.rect(26, 60, 8, 22, fur);
    c.rect(66, 60, 8, 22, fur);
    c.rect(38, 64, 7, 18, shade(fur, -0.15));
    c.rect(58, 64, 7, 18, shade(fur, -0.15));
    c.tri(80, 54, 94, 40, 86, 60, fur);
    c.ellipse(24, 44, 14, 10, fur);
    c.tri(10, 46, 22, 40, 22, 52, shade(fur, 0.1));
    c.tri(18, 36, 16, 24, 26, 36, fur);
    c.tri(30, 34, 32, 22, 38, 36, fur);
    c.rect(10, 48, 6, 2, INK);
    c.circle(22, 43, 3, 0x6fe06f);
    c.glow(22, 43, 6, 0x6fe06f, 0.6);
    for (const [x, y, r] of [
      [44, 46, 8],
      [60, 44, 6],
      [52, 50, 4],
    ]) {
      c.ellipse(x ?? 0, y ?? 0, r ?? 4, (r ?? 4) * 0.6, 0x4a8a3a);
    }
    c.outline(0x2a2a30);
  },
  // EN-05 トゲツタ: thorny vine with a flower-bud head and snapping tendrils.
  en_thorn_vine: (c) => {
    const green = 0x3a7a2a;
    c.groundShadow(48, 88, 24);
    c.rect(44, 40, 8, 48, green);
    c.line(30, 86, 44, 66, green, 4);
    c.line(66, 86, 52, 66, green, 4);
    c.line(24, 50, 44, 58, green, 3);
    c.line(72, 46, 52, 56, green, 3);
    c.tri(22, 48, 14, 40, 26, 44, 0xc8c0a0);
    c.tri(74, 44, 82, 36, 70, 40, 0xc8c0a0);
    for (let y = 44; y < 84; y += 8) {
      c.tri(44, y, 38, y - 2, 44, y + 4, 0xc8c0a0);
      c.tri(52, y + 4, 58, y + 2, 52, y + 8, 0xc8c0a0);
    }
    c.ellipse(48, 30, 16, 20, 0xa84a8a);
    c.ellipse(48, 26, 12, 14, 0xd88ab8);
    c.tri(36, 36, 48, 30, 40, 48, 0xa84a8a);
    c.tri(60, 36, 48, 30, 56, 48, 0xa84a8a);
    c.ellipse(48, 36, 8, 5, 0x3a1a2a);
    for (const x of [42, 47, 52]) c.tri(x, 33, x + 3, 33, x + 1.5, 38, 0xffffff);
    c.eye(42, 22, 3, 0x3a1a2a);
    c.eye(54, 22, 3, 0x3a1a2a);
    c.outline(0x1a3a12);
  },
  // EN-06 廃坑ネズミ: big rat with a miner's lamp stuck on its head.
  en_mine_rat: (c) => {
    const fur = 0x8a6a4a;
    c.groundShadow(50, 84, 34);
    c.ellipse(54, 62, 30, 18, fur);
    c.ellipse(26, 54, 16, 12, fur);
    c.circle(20, 44, 6, 0xe0a0a0);
    c.circle(30, 42, 6, 0xe0a0a0);
    c.line(82, 60, 94, 50, 0xe0a0a0, 3);
    c.rect(34, 74, 6, 10, shade(fur, -0.2));
    c.rect(62, 74, 6, 10, shade(fur, -0.2));
    c.circle(12, 58, 2.5, INK);
    c.eye(22, 54, 3.5, 0xffe9a3, 0xfff0a0);
    c.rect(22, 38, 10, 6, 0xc8a040);
    c.rect(26, 34, 6, 4, 0xfff6d5);
    c.glow(29, 36, 10, 0xffe9a3, 0.8);
    c.outline(0x2a1a10);
  },
  // EN-07 鉱石クモ: amethyst-cluster body on eight thin legs.
  en_ore_spider: (c) => {
    c.groundShadow(48, 84, 34);
    for (const s of [-1, 1]) {
      for (const [dx, dy] of [
        [36, -10],
        [40, 4],
        [36, 18],
        [26, 30],
      ]) {
        c.line(48 + s * 8, 56, 48 + s * (dx ?? 0), 56 + (dy ?? 0), 0x3a2a4a, 2);
        c.line(48 + s * (dx ?? 0), 56 + (dy ?? 0), 48 + s * ((dx ?? 0) + 6), 82, 0x3a2a4a, 2);
      }
    }
    c.ellipse(48, 58, 18, 14, 0x4a2a6a);
    c.tri(40, 50, 30, 20, 52, 48, 0x9a6ad0);
    c.tri(50, 46, 56, 14, 66, 50, 0xb08ae0);
    c.tri(34, 58, 22, 36, 44, 56, 0x8a5ac0);
    c.tri(58, 56, 76, 34, 66, 60, 0x9a6ad0);
    c.tri(44, 44, 50, 30, 54, 46, 0xd8c0ff);
    c.ellipse(48, 70, 12, 8, 0x4a2a6a);
    c.eye(43, 68, 2.5, 0xffe9a3, 0xfff0a0);
    c.eye(53, 68, 2.5, 0xffe9a3, 0xfff0a0);
    c.eye(47, 73, 1.8, 0xffe9a3, 0xfff0a0);
    c.outline(0x1a0a2a);
  },
  // EN-08 トロッコゴースト: a ghostly miner riding a floating broken mine cart.
  en_minecart_ghost: (c) => {
    c.glow(48, 70, 40, 0x6fb4e0, 0.5);
    c.rect(22, 54, 52, 24, 0x5a4a3a);
    c.rect(22, 54, 52, 4, 0x7a6a5a);
    c.rect(26, 58, 44, 2, 0x3a2a1a);
    c.tri(70, 54, 78, 46, 74, 60, 0x5a4a3a);
    c.circle(32, 80, 6, 0x3a3a40);
    c.circle(64, 80, 6, 0x3a3a40);
    c.circle(32, 80, 2.5, 0x8a8a95);
    c.circle(64, 80, 2.5, 0x8a8a95);
    c.ellipse(48, 40, 16, 20, 0xcfe8ff, 160);
    c.tri(32, 44, 64, 44, 48, 60, 0xcfe8ff, 120);
    c.rect(36, 22, 24, 6, 0x8a8aa0, 200);
    c.rect(40, 16, 16, 8, 0x8a8aa0, 200);
    c.rect(42, 34, 12, 14, 0xffe9a3);
    c.rect(45, 37, 6, 8, 0xfff6d5);
    c.glow(48, 41, 12, 0xffe9a3, 0.9);
    c.rect(44, 38, 2, 3, INK);
    c.rect(50, 38, 2, 3, INK);
    c.outline(0x2a3a5a);
  },
  // EN-09 ヒカリムシ: a swarm of glowing cave fireflies in a vaguely human shape.
  en_glow_bug: (c) => {
    c.glow(48, 50, 40, 0xcfff8a, 0.6);
    const head = [48, 26, 12];
    const body = [48, 56, 18];
    const points: [number, number][] = [];
    for (let i = 0; i < 70; i += 1) {
      const t = c.rand();
      const ang = c.rand() * Math.PI * 2;
      const part = t < 0.3 ? head : body;
      const r = (part[2] ?? 10) * Math.sqrt(c.rand());
      points.push([(part[0] ?? 48) + Math.cos(ang) * r, (part[1] ?? 50) + Math.sin(ang) * r * 1.3]);
    }
    for (let i = 0; i < 16; i += 1) {
      const s = i % 2 === 0 ? -1 : 1;
      points.push([48 + s * (8 + c.rand() * 20), 52 + c.rand() * 10]);
      points.push([48 + s * (4 + c.rand() * 8), 72 + c.rand() * 16]);
    }
    for (const [x, y] of points) {
      c.circle(x, y, 2.6, 0xe8ff9a, 120);
      c.circle(x, y, 1.3, 0xffffd0);
    }
    c.circle(43, 25, 2.5, 0xffffff);
    c.circle(53, 25, 2.5, 0xffffff);
  },
  // EN-10 潮だまりカニ: an armoured crab with ruin fragments for a shell and one huge claw.
  en_tidepool_crab: (c) => {
    const shell = 0xc85a3a;
    c.groundShadow(48, 84, 36);
    for (const s of [-1, 1]) {
      for (const [dx, dy] of [
        [26, 6],
        [30, 16],
        [26, 26],
      ]) {
        c.line(
          48 + s * 14,
          60 + (dy ?? 0) * 0.3,
          48 + s * (dx ?? 0),
          60 + (dy ?? 0),
          shade(shell, -0.2),
          3,
        );
        c.line(
          48 + s * (dx ?? 0),
          60 + (dy ?? 0),
          48 + s * ((dx ?? 0) + 4),
          60 + (dy ?? 0) + 10,
          shade(shell, -0.2),
          3,
        );
      }
    }
    c.ellipse(48, 60, 28, 18, shell);
    c.rect(30, 44, 14, 10, 0x7a9aa0);
    c.rect(48, 40, 18, 12, 0x6a8a90);
    c.rect(40, 52, 10, 6, 0x8aa0a8);
    for (const [x, y] of [
      [34, 64],
      [60, 70],
      [50, 74],
    ]) {
      c.circle(x ?? 0, y ?? 0, 2.5, 0xe8e0d0);
    }
    c.ellipse(16, 48, 14, 12, shell);
    c.tri(4, 40, 16, 36, 12, 50, shell);
    c.tri(4, 56, 18, 52, 12, 46, shade(shell, -0.1));
    c.ellipse(80, 58, 8, 6, shell);
    c.tri(84, 52, 94, 50, 86, 60, shell);
    c.rect(40, 36, 2, 8, INK);
    c.rect(56, 36, 2, 8, INK);
    c.circle(41, 35, 3, 0xf4f1ea);
    c.circle(57, 35, 3, 0xf4f1ea);
    c.circle(41, 35, 1.4, INK);
    c.circle(57, 35, 1.4, INK);
    c.outline(0x4a1a10);
  },
  // EN-11 遺跡の石像兵: a cracked stone soldier lit blue at the joints, holding a spear.
  en_ruin_statue: (c) => {
    const stone = 0x8a9aa0;
    c.groundShadow(48, 90, 24);
    c.rect(30, 82, 36, 8, shade(stone, -0.3));
    c.rect(36, 60, 10, 22, stone);
    c.rect(50, 60, 10, 22, stone);
    c.rect(32, 32, 32, 30, stone);
    c.rect(32, 32, 32, 4, shade(stone, 0.15));
    c.rect(24, 34, 8, 24, stone);
    c.rect(64, 34, 8, 24, stone);
    c.rect(38, 14, 20, 18, stone);
    c.rect(36, 10, 24, 6, shade(stone, -0.2));
    c.rect(44, 4, 8, 8, 0x6a7a80);
    c.rect(40, 22, 16, 3, 0x2a3a40);
    c.rect(42, 22, 3, 3, 0x5fd0ff);
    c.rect(51, 22, 3, 3, 0x5fd0ff);
    for (const [x, y] of [
      [28, 42],
      [68, 42],
      [41, 62],
      [55, 62],
    ]) {
      c.rect(x ?? 0, y ?? 0, 4, 4, 0x5fd0ff);
      c.glow((x ?? 0) + 2, (y ?? 0) + 2, 5, 0x5fd0ff, 0.6);
    }
    c.line(44, 40, 52, 56, 0x3a4a50, 1);
    c.line(34, 48, 40, 50, 0x3a4a50, 1);
    c.rect(76, 8, 3, 84, 0x6a5a4a);
    c.tri(72, 12, 83, 12, 77.5, 0, 0xb8c0c8);
    c.outline(0x2a3a40);
  },
  // EN-12 うつろ貝: a giant spiral shell with a dark void inside and two glowing eyes.
  en_hollow_shell: (c) => {
    const shell = 0xd8b890;
    c.groundShadow(50, 86, 34);
    c.ellipse(54, 56, 32, 26, shell);
    c.ellipse(60, 50, 20, 16, shade(shell, 0.12));
    c.ellipse(64, 46, 10, 8, shade(shell, 0.2));
    c.line(30, 62, 86, 38, shade(shell, -0.3), 1);
    c.line(34, 72, 80, 60, shade(shell, -0.3), 1);
    c.tri(22, 60, 40, 44, 42, 84, 0x1a1026);
    c.ellipse(32, 64, 10, 16, 0x1a1026);
    c.eye(29, 58, 2.6, 0x8a5aff, 0xd8c8ff);
    c.eye(35, 68, 2.6, 0x8a5aff, 0xd8c8ff);
    c.glow(30, 62, 10, 0x8a5aff, 0.5);
    for (const [x, y] of [
      [44, 40],
      [56, 34],
      [70, 40],
    ]) {
      c.tri(
        (x ?? 0) - 4,
        (y ?? 0) + 6,
        (x ?? 0) + 4,
        (y ?? 0) + 6,
        x ?? 0,
        (y ?? 0) - 4,
        shade(shell, -0.15),
      );
    }
    c.outline(0x4a3a20);
  },
  // EN-13 影の手: two shadowy hands over scattered star fragments.
  en_shadow_hand: (c) => {
    const dark = 0x2a1a4a;
    for (const [x, y] of [
      [20, 82],
      [48, 86],
      [76, 80],
      [34, 90],
    ]) {
      c.star(x ?? 0, y ?? 0, 4, 0xffe9a3);
    }
    const hand = (cx: number, cy: number, flip: number): void => {
      c.ellipse(cx, cy, 14, 12, dark);
      for (let i = 0; i < 4; i += 1) {
        const fx = cx + flip * (-9 + i * 6);
        c.ellipse(fx, cy - 14, 3, 10, dark);
        c.circle(fx, cy - 24, 3, dark);
      }
      c.ellipse(cx - flip * 14, cy - 2, 3, 8, dark);
      c.ellipse(cx, cy + 16, 9, 10, shade(dark, 0.1), 180);
      c.ellipse(cx, cy + 30, 6, 8, shade(dark, 0.1), 90);
    };
    hand(30, 46, 1);
    hand(66, 40, -1);
    c.glow(48, 60, 30, 0x6a4a9a, 0.5);
    c.outline(0x0a0416);
  },
  // EN-14 偽りの灯: a floating lantern with a cold purple flame and a wicked grin.
  en_false_light: (c) => {
    const brass = 0x6a6a78;
    c.glow(48, 54, 34, 0xb08aff, 0.7);
    c.rect(44, 10, 8, 6, brass);
    c.rect(38, 16, 20, 6, brass);
    c.rect(34, 22, 28, 44, 0x2a2a38);
    c.rect(36, 24, 24, 40, 0x3a2a5a, 230);
    c.rect(34, 66, 28, 6, brass);
    c.rect(40, 72, 16, 4, shade(brass, -0.3));
    c.line(34, 22, 34, 66, brass, 2);
    c.line(60, 22, 60, 66, brass, 2);
    c.ellipse(48, 46, 10, 14, 0xb08aff);
    c.tri(38, 46, 58, 46, 48, 24, 0xb08aff);
    c.ellipse(48, 50, 6, 9, 0xe0d0ff);
    c.rect(43, 42, 3, 4, 0x1a0a2a);
    c.rect(50, 42, 3, 4, 0x1a0a2a);
    c.line(42, 54, 54, 54, 0x1a0a2a, 2);
    for (const x of [43, 47, 51]) c.tri(x, 54, x + 3, 54, x + 1.5, 58, 0x1a0a2a);
    c.outline(0x1a1a2a);
  },
  // BO-01 古木のウロ: an ancient hollow tree with a face and a star fragment in the hollow.
  bo_old_tree_hollow: (c) => {
    const bark = 0x5a3a22;
    c.groundShadow(48, 92, 40);
    c.ellipse(48, 22, 40, 20, 0x2f6a2c);
    c.ellipse(30, 26, 18, 12, 0x3a7a36);
    c.ellipse(66, 24, 20, 13, 0x3a7a36);
    c.rect(28, 30, 40, 56, bark);
    c.rect(28, 30, 6, 56, shade(bark, -0.25));
    c.rect(62, 30, 6, 56, shade(bark, -0.25));
    c.tri(28, 86, 4, 92, 30, 74, bark);
    c.tri(68, 86, 92, 92, 66, 74, bark);
    c.tri(10, 60, 2, 50, 28, 60, bark);
    c.tri(86, 56, 94, 46, 68, 58, bark);
    c.ellipse(48, 66, 12, 14, 0x1a0e08);
    c.star(48, 68, 7, 0xffe9a3);
    c.glow(48, 68, 14, 0xffe9a3, 0.9);
    c.ellipse(38, 44, 5, 4, 0x1a0e08);
    c.ellipse(58, 44, 5, 4, 0x1a0e08);
    c.circle(39, 44, 1.6, 0xffe9a3);
    c.circle(59, 44, 1.6, 0xffe9a3);
    c.line(34, 38, 42, 40, 0x1a0e08, 2);
    c.line(62, 38, 54, 40, 0x1a0e08, 2);
    c.ellipse(70, 22, 4, 5, 0x8a6a4a);
    c.circle(69, 21, 1.2, 0xffe9a3);
    c.circle(71, 21, 1.2, 0xffe9a3);
    c.outline(0x2a1a0a);
  },
  // BO-02 岩のゴーレム: rubble, rails and ore, a star fragment in the chest, orange cracks.
  bo_rock_golem: (c) => {
    const rock = 0x7a6a5a;
    c.groundShadow(48, 92, 40);
    c.rect(22, 70, 18, 22, rock);
    c.rect(56, 70, 18, 22, rock);
    c.rect(20, 30, 56, 44, rock);
    c.rect(26, 34, 44, 8, shade(rock, 0.12));
    c.rect(6, 36, 16, 36, rock);
    c.rect(74, 36, 16, 36, rock);
    c.rect(2, 70, 20, 10, shade(rock, -0.15));
    c.rect(74, 70, 20, 10, shade(rock, -0.15));
    c.rect(32, 14, 32, 18, shade(rock, -0.1));
    c.rect(36, 20, 8, 5, 0xff9a3a);
    c.rect(52, 20, 8, 5, 0xff9a3a);
    c.rect(28, 42, 40, 3, 0x9a9aa0);
    c.rect(28, 56, 40, 3, 0x9a9aa0);
    c.rect(34, 40, 3, 22, 0x9a9aa0);
    c.rect(58, 40, 3, 22, 0x9a9aa0);
    c.star(48, 52, 8, 0xffe9a3);
    c.glow(48, 52, 14, 0xffd070, 0.8);
    for (const [x0, y0, x1, y1] of [
      [24, 34, 30, 50],
      [70, 36, 64, 54],
      [40, 70, 36, 90],
      [12, 44, 16, 66],
    ]) {
      c.line(x0 ?? 0, y0 ?? 0, x1 ?? 0, y1 ?? 0, 0xff7a3a, 1.5);
    }
    for (const [x, y] of [
      [26, 62],
      [64, 30],
      [80, 48],
    ]) {
      c.tri((x ?? 0) - 3, (y ?? 0) + 4, (x ?? 0) + 3, (y ?? 0) + 4, x ?? 0, (y ?? 0) - 4, 0x9a6ad0);
    }
    c.outline(0x2a1f18);
  },
  // BO-03 遺跡の番人: a coral-covered guardian statue with a trident and a star on its brow.
  bo_ruin_guardian: (c) => {
    const stone = 0x6a9aa0;
    c.groundShadow(48, 92, 40);
    c.rect(22, 84, 52, 8, shade(stone, -0.3));
    c.rect(32, 60, 12, 24, stone);
    c.rect(52, 60, 12, 24, stone);
    c.rect(26, 28, 44, 34, stone);
    c.rect(26, 28, 44, 5, shade(stone, 0.15));
    c.rect(14, 30, 12, 30, stone);
    c.rect(70, 30, 12, 30, stone);
    c.rect(34, 8, 28, 22, stone);
    c.rect(30, 4, 36, 6, shade(stone, -0.2));
    c.tri(30, 4, 66, 4, 48, -4, shade(stone, -0.2));
    c.rect(38, 18, 20, 3, 0x1a3a40);
    c.rect(40, 18, 3, 3, 0x5fd0ff);
    c.rect(53, 18, 3, 3, 0x5fd0ff);
    c.star(48, 11, 5, 0xffe9a3);
    for (const [x, y] of [
      [20, 40],
      [74, 46],
      [30, 52],
      [60, 34],
    ]) {
      c.ellipse(x ?? 0, y ?? 0, 6, 4, 0xe08a7a);
      c.circle((x ?? 0) + 3, (y ?? 0) - 2, 2, 0xf0a090);
    }
    c.line(36, 36, 60, 56, 0x4a7a80, 1);
    c.rect(44, 40, 8, 8, 0x5fd0ff, 200);
    c.glow(48, 44, 10, 0x5fd0ff, 0.6);
    c.rect(86, 10, 3, 80, 0xb8a060);
    c.rect(80, 10, 15, 3, 0xb8a060);
    for (const x of [80, 86, 92]) c.tri(x - 2, 10, x + 4, 10, x + 1, 0, 0xd8c080);
    c.outline(0x1a3a40);
  },
  // BO-04a ノクス 第1形態: the masked collector, cloak spread, fragments swirling into a dark sphere.
  bo_nox_phase1: (c) => {
    const cloak = 0x1c1c48;
    c.circle(48, 40, 30, 0x0a0a20, 200);
    c.glow(48, 40, 34, 0x3a2a7a, 0.7);
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2;
      c.star(48 + Math.cos(a) * 36, 40 + Math.sin(a) * 26, 3.5, 0xffe9a3);
    }
    c.tri(48, 30, 10, 94, 86, 94, cloak);
    c.tri(48, 34, 24, 94, 72, 94, shade(cloak, 0.15));
    c.rect(40, 26, 16, 14, cloak);
    c.ellipse(48, 18, 11, 12, 0x12122e);
    c.ellipse(47, 20, 6, 7, 0xd8d8e8);
    c.ellipse(50, 20, 4, 6, 0x12122e);
    c.rect(45, 19, 1.5, 2.5, 0x1a1a3a);
    c.circle(45.5, 20, 0.8, 0xffe9a3);
    c.line(28, 50, 12, 70, shade(cloak, 0.2), 3);
    c.line(68, 50, 84, 70, shade(cloak, 0.2), 3);
    c.circle(12, 70, 3, 0xd8d8e8);
    c.circle(84, 70, 3, 0xd8d8e8);
    c.glow(12, 70, 6, 0xffe9a3, 0.8);
    c.glow(84, 70, 6, 0xffe9a3, 0.8);
    c.outline(0x05051a);
  },
  // BO-04b ノクス・星喰らい: a towering night-sky shadow with the cracked mask and the broken lamp in its chest.
  bo_nox_phase2: (c) => {
    const night = 0x0b1026;
    c.glow(48, 50, 46, 0x3a2a7a, 0.6);
    c.tri(48, 4, 2, 96, 94, 96, night);
    c.ellipse(48, 30, 22, 26, night);
    for (let i = 0; i < 60; i += 1) {
      const x = 48 + (c.rand() - 0.5) * 70;
      const y = 20 + c.rand() * 72;
      if (Math.abs(x - 48) < (y - 4) * 0.5) c.circle(x, y, c.rand() < 0.2 ? 1.6 : 0.9, 0xfff6d5);
    }
    c.ellipse(47, 22, 8, 9.5, 0xd8d8e8);
    c.ellipse(52, 22, 5, 8, night);
    c.line(45, 14, 43, 30, 0x3a3a5a, 1);
    c.rect(44, 20, 2, 3.5, 0x1a1a3a);
    c.circle(45, 21.5, 1.1, 0xffe9a3);
    c.ellipse(48, 58, 12, 14, 0x2a1a4a);
    c.rect(40, 52, 16, 14, 0x3a3a50);
    c.rect(42, 48, 12, 4, 0x6a6a78);
    c.tri(42, 50, 54, 50, 48, 40, 0x3a3a50);
    c.rect(44, 56, 8, 8, 0xffe9a3, 200);
    c.line(44, 56, 52, 64, 0x3a3a50, 1);
    c.line(48, 54, 50, 66, 0x3a3a50, 1);
    c.glow(48, 60, 16, 0xffe9a3, 0.7);
    for (let i = 0; i < 6; i += 1) {
      const a = Math.PI + (i / 5) * Math.PI;
      c.star(48 + Math.cos(a) * 42, 60 + Math.sin(a) * 30, 3, 0xffe9a3);
    }
    c.outline(0x02020a);
  },
};

export const ENEMY_ART_IDS: readonly string[] = Object.keys(DRAWERS);

/** The battle sprite for an enemy id at `size` px square (manifest `size`). */
export function renderEnemy(id: string, size: number): Pixmap {
  const draw = DRAWERS[id];
  if (!draw) throw new Error(`no enemy art for ${id}`);
  const c = new Canvas(size, hash(id));
  draw(c);
  return c.pm;
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Tint helper kept for palette tweaks in previews. */
export const enemyTint = (a: number, b: number, t: number): number => mix(a, b, t);
