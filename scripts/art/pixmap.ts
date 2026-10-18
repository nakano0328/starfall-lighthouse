import { encodePng } from './png';

/**
 * A tiny RGBA raster with the handful of drawing primitives the generators need.
 * Coordinates are integer pixels; drawing outside the raster is clipped. Colours are
 * 0xRRGGBB numbers (like the Phaser side) plus a separate 0〜255 alpha.
 */
export class Pixmap {
  readonly data: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8Array(width * height * 4);
  }

  /** Writes a pixel (no blending). */
  set(x: number, y: number, rgb: number, a = 255): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = (rgb >> 16) & 0xff;
    this.data[i + 1] = (rgb >> 8) & 0xff;
    this.data[i + 2] = rgb & 0xff;
    this.data[i + 3] = a;
  }

  /** Source-over blend of a pixel. */
  blend(x: number, y: number, rgb: number, a = 255): void {
    if (a >= 255) return this.set(x, y, rgb, 255);
    if (a <= 0 || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const da = (this.data[i + 3] ?? 0) / 255;
    const sa = a / 255;
    const oa = sa + da * (1 - sa);
    const mixc = (s: number, d: number): number =>
      oa === 0 ? 0 : Math.round((s * sa + d * da * (1 - sa)) / oa);
    this.data[i] = mixc((rgb >> 16) & 0xff, this.data[i] ?? 0);
    this.data[i + 1] = mixc((rgb >> 8) & 0xff, this.data[i + 1] ?? 0);
    this.data[i + 2] = mixc(rgb & 0xff, this.data[i + 2] ?? 0);
    this.data[i + 3] = Math.round(oa * 255);
  }

  get(x: number, y: number): { rgb: number; a: number } {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return { rgb: 0, a: 0 };
    const i = (y * this.width + x) * 4;
    return {
      rgb: ((this.data[i] ?? 0) << 16) | ((this.data[i + 1] ?? 0) << 8) | (this.data[i + 2] ?? 0),
      a: this.data[i + 3] ?? 0,
    };
  }

  fillRect(x: number, y: number, w: number, h: number, rgb: number, a = 255): void {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) this.blend(xx, yy, rgb, a);
    }
  }

  strokeRect(x: number, y: number, w: number, h: number, rgb: number, a = 255): void {
    this.fillRect(x, y, w, 1, rgb, a);
    this.fillRect(x, y + h - 1, w, 1, rgb, a);
    this.fillRect(x, y, 1, h, rgb, a);
    this.fillRect(x + w - 1, y, 1, h, rgb, a);
  }

  /** Filled ellipse with centre (cx, cy) and radii (rx, ry); pixel centres inside the curve are painted. */
  fillEllipse(cx: number, cy: number, rx: number, ry: number, rgb: number, a = 255): void {
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.blend(x, y, rgb, a);
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, rgb: number, a = 255): void {
    this.fillEllipse(cx, cy, r, r, rgb, a);
  }

  /** Bresenham line, inclusive of both ends. */
  line(x0: number, y0: number, x1: number, y1: number, rgb: number, a = 255): void {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.blend(x, y, rgb, a);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Filled triangle (scanline), for roofs and spikes. */
  fillTriangle(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rgb: number,
    a = 255,
  ): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    const minX = Math.min(x0, x1, x2);
    const maxX = Math.max(x0, x1, x2);
    const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
      (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = edge(x1, y1, x2, y2, px, py);
        const w1 = edge(x2, y2, x0, y0, px, py);
        const w2 = edge(x0, y0, x1, y1, px, py);
        if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
          this.blend(x, y, rgb, a);
        }
      }
    }
  }

  /** Draws `src` onto this raster at (dx, dy) with source-over blending. */
  blit(src: Pixmap, dx: number, dy: number, opts: { flipX?: boolean; alpha?: number } = {}): void {
    const alpha = opts.alpha ?? 1;
    for (let y = 0; y < src.height; y += 1) {
      for (let x = 0; x < src.width; x += 1) {
        const p = src.get(opts.flipX ? src.width - 1 - x : x, y);
        if (p.a === 0) continue;
        this.blend(dx + x, dy + y, p.rgb, Math.round(p.a * alpha));
      }
    }
  }

  /** A copy of a region. */
  crop(x: number, y: number, w: number, h: number): Pixmap {
    const out = new Pixmap(w, h);
    for (let yy = 0; yy < h; yy += 1) {
      for (let xx = 0; xx < w; xx += 1) {
        const p = this.get(x + xx, y + yy);
        out.set(xx, yy, p.rgb, p.a);
      }
    }
    return out;
  }

  /** Nearest-neighbour scale by an integer factor (keeps the pixel look). */
  scaled(factor: number): Pixmap {
    const out = new Pixmap(this.width * factor, this.height * factor);
    for (let y = 0; y < out.height; y += 1) {
      for (let x = 0; x < out.width; x += 1) {
        const p = this.get(Math.floor(x / factor), Math.floor(y / factor));
        out.set(x, y, p.rgb, p.a);
      }
    }
    return out;
  }

  /** 1px outline of the given colour around every opaque pixel (outside the shape). */
  outline(rgb: number, a = 255): void {
    const src = this.crop(0, 0, this.width, this.height);
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (src.get(x, y).a !== 0) continue;
        const near =
          src.get(x - 1, y).a > 0 ||
          src.get(x + 1, y).a > 0 ||
          src.get(x, y - 1).a > 0 ||
          src.get(x, y + 1).a > 0;
        if (near) this.set(x, y, rgb, a);
      }
    }
  }

  toPng(): Uint8Array {
    return encodePng(this.width, this.height, this.data);
  }
}

// ---- colour helpers -----------------------------------------------------------

export function rgb(r: number, g: number, b: number): number {
  return (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Darkens (amount < 0) or lightens (amount > 0) a colour; |amount| ≤ 1. */
export function shade(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  if (amount < 0) {
    const f = 1 + amount;
    return rgb(r * f, g * f, b * f);
  }
  return rgb(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Linear blend of two colours (t = 0 → a, t = 1 → b). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return rgb(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Deterministic PRNG (mulberry32) so every run writes identical bytes. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Scatters `count` single pixels of `rgb` inside a rect (texture noise). */
export function speckle(
  pm: Pixmap,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  count: number,
  rand: () => number,
): void {
  for (let i = 0; i < count; i += 1) {
    pm.set(x + Math.floor(rand() * w), y + Math.floor(rand() * h), color);
  }
}
