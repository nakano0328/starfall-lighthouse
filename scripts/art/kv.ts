import { GAME_HEIGHT, GAME_WIDTH } from '@/config';

import { ACTOR_STYLES, renderActorFrame } from './actors';
import { Pixmap, mix, seededRandom, shade } from './pixmap';

/**
 * Full-screen key visuals (docs/ART_PROMPTS.md KV-01 title, KV-02 ending, KV-03 game
 * over) at the internal 640×360. The title leaves the upper middle quiet for the logo
 * text; the ending relights the lamp and sends the lost stars home at dawn.
 */
const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export const KV_IDS = ['kv_title', 'kv_ending', 'kv_gameover'] as const;
export type KvId = (typeof KV_IDS)[number];

export function renderKeyVisual(id: KvId): Pixmap {
  const pm = new Pixmap(W, H);
  const rand = seededRandom(id.length * 977 + 13);
  switch (id) {
    case 'kv_title':
      drawShore(pm, rand, { lit: false, dawn: false });
      break;
    case 'kv_ending':
      drawShore(pm, rand, { lit: true, dawn: true });
      break;
    case 'kv_gameover':
      drawGameOver(pm, rand);
      break;
  }
  return pm;
}

function bands(
  pm: Pixmap,
  y0: number,
  y1: number,
  top: number,
  bottom: number,
  steps: number,
): void {
  const h = (y1 - y0) / steps;
  for (let i = 0; i < steps; i += 1) {
    pm.fillRect(0, Math.round(y0 + i * h), W, Math.ceil(h) + 1, mix(top, bottom, i / (steps - 1)));
  }
}

function glow(pm: Pixmap, cx: number, cy: number, r: number, rgb: number, strength: number): void {
  for (let i = 5; i >= 1; i -= 1)
    pm.fillEllipse(cx, cy, (r * i) / 5, (r * i) / 5, rgb, Math.round(24 * strength));
}

function fourStar(pm: Pixmap, cx: number, cy: number, r: number, rgb: number): void {
  const s = Math.max(1, Math.round(r * 0.3));
  pm.fillTriangle(cx, cy - r, cx + s, cy - s, cx - s, cy - s, rgb);
  pm.fillTriangle(cx, cy + r, cx + s, cy + s, cx - s, cy + s, rgb);
  pm.fillTriangle(cx - r, cy, cx - s, cy - s, cx - s, cy + s, rgb);
  pm.fillTriangle(cx + r, cy, cx + s, cy - s, cx + s, cy + s, rgb);
  pm.fillRect(cx - s, cy - s, s * 2, s * 2, rgb);
}

function drawShore(pm: Pixmap, rand: () => number, opts: { lit: boolean; dawn: boolean }): void {
  const horizon = 232;
  // Sky.
  if (opts.dawn) {
    bands(pm, 0, horizon, 0x0b1026, 0x4a3a6a, 10);
    bands(pm, horizon - 70, horizon, 0x4a3a6a, 0xf0b070, 8);
  } else {
    bands(pm, 0, horizon, 0x05061a, 0x12264a, 12);
  }
  // Milky way: a faint diagonal haze.
  for (let i = 0; i < 400; i += 1) {
    const t = rand();
    const x = t * W;
    const y = 40 + t * 90 + (rand() - 0.5) * 60;
    pm.blend(Math.round(x), Math.round(y), 0x9aa6c8, Math.round(20 + rand() * 40));
  }
  // Stars.
  for (let i = 0; i < 260; i += 1) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * (horizon - 10));
    const c = rand() < 0.2 ? 0xffe9a3 : 0xfff6d5;
    pm.set(x, y, c);
    if (rand() < 0.12) {
      pm.blend(x - 1, y, c, 140);
      pm.blend(x + 1, y, c, 140);
      pm.blend(x, y - 1, c, 140);
      pm.blend(x, y + 1, c, 140);
    }
  }
  // Shooting stars (the title) or rising star spirits (the ending).
  if (!opts.lit) {
    for (let i = 0; i < 14; i += 1) {
      const x = 40 + rand() * (W - 80);
      const y = 10 + rand() * 170;
      const len = 20 + rand() * 50;
      for (let k = 0; k < len; k += 1) {
        pm.blend(
          Math.round(x + k * 0.9),
          Math.round(y + k * 0.45),
          0xfff6d5,
          Math.round(220 * (1 - k / len)),
        );
      }
      fourStar(pm, Math.round(x), Math.round(y), 3, 0xffffff);
    }
  }
  // Sea.
  bands(pm, horizon, 300, opts.dawn ? 0x3a4a7a : 0x12264a, opts.dawn ? 0x2a5a9a : 0x1f4f8a, 6);
  for (let i = 0; i < 90; i += 1) {
    const x = Math.floor(rand() * W);
    const y = horizon + 2 + Math.floor(rand() * 60);
    pm.fillRect(x, y, 4 + Math.floor(rand() * 12), 1, opts.dawn ? 0xd8c0a0 : 0x6fb4e0, 160);
  }
  // Distant village lights on the far left.
  for (let i = 0; i < 9; i += 1) {
    const x = 20 + rand() * 150;
    const y = horizon - 4 - rand() * 10;
    pm.set(Math.round(x), Math.round(y), 0xffd080);
    glow(pm, x, y, 5, 0xffd080, 0.4);
  }
  pm.fillRect(0, horizon - 8, 190, 8, 0x0a1428);
  // Cliff on the right with the lighthouse.
  pm.fillEllipse(540, horizon + 14, 130, 40, 0x0a1020);
  pm.fillRect(410, horizon - 10, 230, 30, 0x0a1020);
  pm.fillTriangle(410, horizon - 10, 470, horizon - 46, 640, horizon - 10, 0x0a1020);
  const lx = 548;
  const ly = 92;
  pm.fillRect(lx, ly, 26, horizon - 46 - ly, 0x8a8a90);
  for (let y = ly + 10; y < horizon - 50; y += 24) pm.fillRect(lx, y, 26, 12, 0x6a3a3a);
  pm.fillRect(lx + 20, ly, 6, horizon - 46 - ly, 0x55555a);
  pm.fillRect(lx - 4, ly - 14, 34, 16, 0x1a2234);
  pm.fillRect(lx - 1, ly - 11, 28, 10, opts.lit ? 0xffe9a3 : 0x2a3448);
  pm.fillTriangle(lx - 6, ly - 14, lx + 32, ly - 14, lx + 13, ly - 28, 0x5a2a2a);
  pm.fillRect(lx - 8, horizon - 52, 42, 6, 0x55555a);
  if (opts.lit) {
    // The beam sweeping left over the sea and the star spirits rising.
    for (let k = 0; k < 60; k += 1) {
      const t = k / 60;
      pm.fillTriangle(
        lx,
        ly - 6,
        Math.round(lx - 520 * t),
        Math.round(ly - 6 - 70 * t),
        Math.round(lx - 520 * t),
        Math.round(ly - 6 + 90 * t),
        0xffe9a3,
        6,
      );
    }
    glow(pm, lx + 12, ly - 6, 40, 0xffe9a3, 1.6);
    for (let i = 0; i < 70; i += 1) {
      const x = 60 + rand() * 520;
      const y = 20 + rand() * 230;
      const r = rand() < 0.3 ? 4 : 2;
      glow(pm, x, y, r * 4, 0xffe9a3, 0.6);
      fourStar(pm, Math.round(x), Math.round(y), r, 0xfff6d5);
    }
  }
  // Sand and the apprentice with his lantern.
  bands(pm, 300, H, 0x3a3a50, 0x2a2a40, 4);
  pm.fillEllipse(120, 300, 220, 14, 0x3a3a50);
  for (let i = 0; i < 160; i += 1)
    pm.set(Math.floor(rand() * W), 300 + Math.floor(rand() * 60), 0x4a4a62);
  const luka = ACTOR_STYLES['sprite_player'];
  if (luka) {
    const sprite = renderActorFrame(luka, 'up', '').scaled(2);
    pm.blit(sprite, 150, 262);
    glow(pm, 196, 318, 26, 0xffd080, 1.2);
    pm.fillRect(194, 312, 4, 6, 0xffe9a3);
    pm.fillRect(192, 310, 8, 2, 0x5a5a68);
    pm.fillRect(192, 318, 8, 2, 0x5a5a68);
  }
  // Vignette.
  for (let y = 0; y < H; y += 1) {
    const a = y < 40 ? Math.round((40 - y) * 2) : y > H - 30 ? Math.round((y - (H - 30)) * 3) : 0;
    if (a > 0) pm.fillRect(0, y, W, 1, 0x000000, Math.min(120, a));
  }
}

function drawGameOver(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, H, 0x05061a, 0x141a30, 10);
  for (let i = 0; i < 70; i += 1)
    pm.set(Math.floor(rand() * W), Math.floor(rand() * 150), 0x9aa6c8, 180);
  // Wet sand with faint reflections.
  bands(pm, 190, H, 0x1a2034, 0x101424, 6);
  for (let i = 0; i < 220; i += 1)
    pm.set(Math.floor(rand() * W), 190 + Math.floor(rand() * 170), 0x2a3048);
  for (let i = 0; i < 30; i += 1) {
    pm.fillRect(
      Math.floor(rand() * W),
      200 + Math.floor(rand() * 150),
      10 + Math.floor(rand() * 30),
      1,
      0x3a4a6a,
      120,
    );
  }
  // The extinguished lantern lying on its side, lower right of centre.
  const x = 380;
  const y = 268;
  pm.fillEllipse(x + 14, y + 26, 34, 8, 0x000000, 90);
  pm.fillRect(x - 4, y + 4, 44, 18, 0x3a3a48);
  pm.fillRect(x, y + 7, 36, 12, 0x1c1c2a);
  pm.fillRect(x + 2, y + 9, 32, 8, 0x262636);
  pm.fillRect(x + 40, y + 8, 6, 10, 0x4a4a58);
  pm.fillRect(x - 12, y + 9, 8, 8, 0x4a4a58);
  pm.line(x - 12, y + 12, x - 22, y + 2, 0x4a4a58);
  pm.fillRect(x + 12, y + 11, 6, 4, 0x3a3a48);
  // A thin wisp of smoke.
  for (let k = 0; k < 40; k += 1) {
    pm.blend(
      Math.round(x + 15 + Math.sin(k / 5) * 4),
      y - k,
      0x6a6a80,
      Math.round(90 * (1 - k / 40)),
    );
  }
  for (let yy = 0; yy < H; yy += 1) {
    const a =
      yy < 50 ? Math.round((50 - yy) * 2) : yy > H - 40 ? Math.round((yy - (H - 40)) * 3) : 0;
    if (a > 0) pm.fillRect(0, yy, W, 1, 0x000000, Math.min(120, a));
  }
}

export const kvShade = shade;
