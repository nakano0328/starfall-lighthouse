import { GAME_HEIGHT, GAME_WIDTH } from '@/config';

import { Pixmap, mix, seededRandom, shade } from './pixmap';

/**
 * Battle backgrounds BG-01〜06 (docs/ART_PROMPTS.md): 640×360 scenes whose lower third
 * is a plain ground plane for the enemy sprites and windows (§11.3). Painted with bands
 * and silhouettes so each area reads at a glance.
 */
const W = GAME_WIDTH;
const H = GAME_HEIGHT;

export const BATTLE_BG_IDS = [
  'bg_coast',
  'bg_forest',
  'bg_mine',
  'bg_ruins',
  'bg_lighthouse',
  'bg_lighthouse_top',
] as const;

export type BattleBgId = (typeof BATTLE_BG_IDS)[number];

export function renderBattleBackground(id: BattleBgId): Pixmap {
  const pm = new Pixmap(W, H);
  const rand = seededRandom(hash(id));
  switch (id) {
    case 'bg_coast':
      drawCoast(pm, rand);
      break;
    case 'bg_forest':
      drawForest(pm, rand);
      break;
    case 'bg_mine':
      drawMine(pm, rand);
      break;
    case 'bg_ruins':
      drawRuins(pm, rand);
      break;
    case 'bg_lighthouse':
      drawLighthouse(pm, rand);
      break;
    case 'bg_lighthouse_top':
      drawLighthouseTop(pm, rand);
      break;
  }
  return pm;
}

/** Vertical gradient in `steps` flat bands (keeps the pixel look). */
function bands(pm: Pixmap, y0: number, y1: number, top: number, bottom: number, steps = 12): void {
  const h = (y1 - y0) / steps;
  for (let i = 0; i < steps; i += 1) {
    pm.fillRect(0, Math.round(y0 + i * h), W, Math.ceil(h) + 1, mix(top, bottom, i / (steps - 1)));
  }
}

function stars(
  pm: Pixmap,
  rand: () => number,
  count: number,
  maxY: number,
  bright = 0xfff6d5,
): void {
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(rand() * W);
    const y = Math.floor(rand() * maxY);
    const big = rand() < 0.15;
    pm.set(x, y, bright);
    if (big) {
      pm.blend(x - 1, y, bright, 160);
      pm.blend(x + 1, y, bright, 160);
      pm.blend(x, y - 1, bright, 160);
      pm.blend(x, y + 1, bright, 160);
    }
  }
}

function drawCoast(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, 170, 0xf0b070, 0x6fb4e0, 14); // late-afternoon sky
  // Clouds.
  for (let i = 0; i < 6; i += 1) {
    const x = rand() * W;
    const y = 30 + rand() * 80;
    pm.fillEllipse(x, y, 40 + rand() * 30, 10, 0xfff0e0, 200);
    pm.fillEllipse(x + 20, y - 6, 24, 9, 0xfff6ec, 220);
  }
  // Far cliff with the dark lighthouse.
  pm.fillEllipse(520, 176, 120, 26, 0x4a5a6a);
  pm.fillRect(560, 100, 18, 70, 0xe8e4dc);
  for (let y = 108; y < 170; y += 20) pm.fillRect(560, y, 18, 10, 0xc8453c);
  pm.fillRect(556, 92, 26, 10, 0x2a3a5a);
  pm.fillTriangle(554, 92, 584, 92, 569, 80, 0x8a3a30);
  // Sea.
  bands(pm, 170, 232, 0x3f8fd0, 0x2a62a8, 6);
  for (let i = 0; i < 60; i += 1) {
    const x = Math.floor(rand() * W);
    const y = 174 + Math.floor(rand() * 56);
    pm.fillRect(x, y, 6 + Math.floor(rand() * 10), 1, 0x9fd0f0, 170);
  }
  // Sand and the grassy path in the foreground.
  bands(pm, 232, 262, 0xe6d4a0, 0xd9c58a, 3);
  pm.fillRect(0, 262, W, H - 262, 0x5aa64a);
  speckleBand(pm, rand, 262, H, 0x4b9140, 260);
  pm.fillRect(0, 262, W, 2, 0x4b9140);
  pm.fillEllipse(320, 330, 230, 26, 0xc9a66b);
  speckleBand(pm, rand, 310, 350, 0xb59a6a, 60);
}

function drawForest(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, H, 0x1f4a2a, 0x2a5a2c, 10);
  // Far trunks.
  for (let i = 0; i < 14; i += 1) {
    const x = Math.floor(rand() * W);
    const w = 10 + Math.floor(rand() * 10);
    pm.fillRect(x, 0, w, 250, 0x1a3a1c);
  }
  // Mid trunks with roots.
  for (let i = 0; i < 7; i += 1) {
    const x = 20 + i * 95 + Math.floor(rand() * 30);
    const w = 22 + Math.floor(rand() * 12);
    pm.fillRect(x, 0, w, 260, 0x3a2a1a);
    pm.fillRect(x, 0, 4, 260, 0x5a4a30);
    pm.fillRect(x + w - 5, 0, 5, 260, 0x241808);
    pm.fillTriangle(x - 14, 262, x + w + 14, 262, x + w / 2, 230, 0x3a2a1a);
  }
  // Canopy shadow and light motes.
  for (let i = 0; i < 18; i += 1) {
    pm.fillEllipse(rand() * W, 20 + rand() * 60, 50 + rand() * 40, 22, 0x163a1c, 200);
  }
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * W;
    const y = 60 + rand() * 180;
    pm.fillEllipse(x, y, 3, 3, 0xcfff8a, 70);
    pm.set(Math.round(x), Math.round(y), 0xf0ffc0);
  }
  // Ground: moss and grass.
  pm.fillRect(0, 262, W, H - 262, 0x3f7a3a);
  pm.fillRect(0, 262, W, 3, 0x2d5a2a);
  speckleBand(pm, rand, 262, H, 0x346a30, 300);
  speckleBand(pm, rand, 262, H, 0x5a9a4a, 120);
}

function drawMine(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, H, 0x1a1418, 0x3a2e28, 8);
  // Rock walls.
  for (let i = 0; i < 90; i += 1) {
    const x = rand() * W;
    const y = rand() * 250;
    pm.fillEllipse(x, y, 20 + rand() * 30, 10 + rand() * 12, mix(0x3a2e28, 0x5a4a3a, rand()), 200);
  }
  // Wooden supports.
  for (const x of [60, 300, 540]) {
    pm.fillRect(x, 20, 16, 240, 0x5a3a22);
    pm.fillRect(x + 2, 20, 3, 240, 0x7a5a3a);
    pm.fillRect(x - 60, 20, 136, 14, 0x5a3a22);
    pm.fillRect(x - 60, 20, 136, 3, 0x7a5a3a);
  }
  // Amethyst clusters and a hanging lantern.
  for (let i = 0; i < 9; i += 1) {
    const x = 40 + rand() * (W - 80);
    const y = 120 + rand() * 120;
    pm.fillTriangle(x - 6, y + 8, x + 6, y + 8, x, y - 10, 0x8a5ac0);
    pm.fillTriangle(x - 2, y + 6, x + 3, y + 6, x + 1, y - 6, 0xb08ae0);
    pm.fillEllipse(x, y, 14, 10, 0x9a6ad0, 40);
  }
  pm.fillRect(430, 34, 2, 50, 0x3a3a40);
  pm.fillRect(420, 84, 22, 26, 0x3a3a40);
  pm.fillRect(424, 88, 14, 18, 0xffe9a3);
  for (let r = 60; r > 0; r -= 15) pm.fillEllipse(431, 97, r, r * 0.8, 0xffe9a3, 22);
  // Rails and floor.
  pm.fillRect(0, 262, W, H - 262, 0x5a4a3a);
  speckleBand(pm, rand, 262, H, 0x4a3a2a, 300);
  pm.fillRect(0, 262, W, 3, 0x3a2a1a);
  for (let x = -20; x < W; x += 40) pm.fillRect(x, 300, 28, 6, 0x4a3020);
  pm.fillRect(0, 294, W, 3, 0x9a9aa0);
  pm.fillRect(0, 312, W, 3, 0x9a9aa0);
}

function drawRuins(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, 200, 0x123a4a, 0x2a6a7a, 10);
  // Back wall of old stone below the waterline mark.
  bands(pm, 200, 262, 0x3a5a60, 0x2a4a50, 4);
  for (let x = 0; x < W; x += 40) pm.fillRect(x, 200, 1, 62, 0x244044);
  for (let y = 200; y < 262; y += 20) pm.fillRect(0, y, W, 1, 0x244044);
  // Broken pillars.
  for (const [x, h] of [
    [70, 150],
    [180, 90],
    [430, 170],
    [560, 120],
  ]) {
    const top = 262 - (h ?? 100);
    pm.fillRect((x ?? 0) - 16, top, 32, h ?? 100, 0x6a9aa0);
    pm.fillRect((x ?? 0) - 16, top, 6, h ?? 100, 0x8ab8c0);
    pm.fillRect((x ?? 0) + 10, top, 6, h ?? 100, 0x4a7a80);
    pm.fillRect((x ?? 0) - 22, top - 4, 44, 8, 0x8ab8c0);
    for (let i = 0; i < 4; i += 1)
      pm.set(
        (x ?? 0) - 16 + Math.floor(rand() * 32),
        top + Math.floor(rand() * (h ?? 100)),
        0x3a5a60,
      );
  }
  // Runes on the back wall.
  for (let i = 0; i < 12; i += 1) {
    const x = 20 + rand() * (W - 40);
    const y = 60 + rand() * 120;
    pm.fillRect(Math.round(x) - 1, Math.round(y) - 5, 2, 10, 0x5fd0ff, 200);
    pm.fillRect(Math.round(x) - 5, Math.round(y) - 1, 10, 2, 0x5fd0ff, 200);
    pm.fillEllipse(x, y, 8, 8, 0x5fd0ff, 40);
  }
  // Seaweed and coral.
  for (let i = 0; i < 10; i += 1) {
    const x = rand() * W;
    for (let y = 262; y > 200 + rand() * 40; y -= 6)
      pm.fillRect(Math.round(x + Math.sin(y / 8) * 4), y, 3, 6, 0x2f7a5a);
  }
  // Shallow water over cracked marble.
  pm.fillRect(0, 262, W, H - 262, 0x7a9aa0);
  for (let i = 0; i < 30; i += 1) {
    pm.fillRect(
      Math.floor(rand() * W),
      262 + Math.floor(rand() * 98),
      40 + Math.floor(rand() * 60),
      1,
      0x5a7a80,
    );
  }
  pm.fillRect(0, 262, W, H - 262, 0x3f9fc0, 90);
  for (let i = 0; i < 50; i += 1) {
    pm.fillRect(
      Math.floor(rand() * W),
      266 + Math.floor(rand() * 90),
      8 + Math.floor(rand() * 14),
      1,
      0xcfe8ff,
      150,
    );
  }
}

function drawLighthouse(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, H, 0x101840, 0x2a3a7a, 10);
  // Plaster wall with a round window and a cold purple light from above.
  pm.fillRect(0, 0, W, 262, 0xd8d4cc);
  for (let y = 0; y < 262; y += 24) pm.fillRect(0, y, W, 1, 0xb8b4ac);
  for (let x = 0; x < W; x += 48)
    for (let y = 0; y < 262; y += 48) pm.fillRect(x + ((y / 48) % 2) * 24, y, 1, 24, 0xb8b4ac);
  pm.fillEllipse(320, 60, 40, 40, 0x3a3a50);
  pm.fillEllipse(320, 60, 32, 32, 0x101840);
  stars(pm, rand, 30, 92);
  for (let r = 120; r > 0; r -= 20) pm.fillEllipse(320, -40, r * 2.2, r, 0x9a6ad0, 18);
  // Spiral stair: steps going up to the right, brass rail.
  for (let i = 0; i < 9; i += 1) {
    const x = 60 + i * 60;
    const y = 262 - i * 22;
    pm.fillRect(x, y, 80, 10, 0x5a5a68);
    pm.fillRect(x, y, 80, 2, 0x8a8a95);
    pm.fillRect(x, y + 10, 80, 14, 0x3a3a48);
  }
  for (let i = 0; i < 9; i += 1) {
    const x = 60 + i * 60;
    const y = 262 - i * 22;
    pm.fillRect(x + 4, y - 40, 3, 42, 0xc9a66b);
  }
  for (let i = 0; i < 8; i += 1) {
    const x0 = 65 + i * 60;
    const y0 = 262 - i * 22 - 40;
    pm.line(x0, y0, x0 + 60, y0 - 22, 0xc9a66b);
    pm.line(x0, y0 + 1, x0 + 60, y0 - 21, 0xd8b878);
  }
  // Floor.
  pm.fillRect(0, 262, W, H - 262, 0xb8b4ac);
  for (let x = 0; x < W; x += 32) pm.fillRect(x, 262, 1, H - 262, 0x9a948c);
  for (let y = 262; y < H; y += 32) pm.fillRect(0, y, W, 1, 0x9a948c);
  pm.fillRect(0, 262, W, 3, 0x7a7a85);
}

function drawLighthouseTop(pm: Pixmap, rand: () => number): void {
  bands(pm, 0, H, 0x05061a, 0x2a1a4a, 12);
  stars(pm, rand, 220, 250);
  // The sky being pulled down: swirl arcs toward the lamp.
  for (let i = 0; i < 7; i += 1) {
    const r = 60 + i * 34;
    for (let a = 0; a < Math.PI * 2; a += 0.02) {
      const x = 320 + Math.cos(a + i) * r * 1.6;
      const y = 110 + Math.sin(a + i) * r * 0.55;
      if (y > 0 && y < 250 && rand() < 0.35) pm.blend(Math.round(x), Math.round(y), 0x9a8ad0, 120);
    }
  }
  // The great dark lens.
  pm.fillEllipse(320, 110, 110, 90, 0x1a1a3a);
  pm.fillEllipse(320, 110, 96, 78, 0x2a2a50);
  pm.fillEllipse(320, 110, 70, 56, 0x12122e);
  for (let i = -3; i <= 3; i += 1) pm.fillRect(320 + i * 24 - 1, 36, 2, 148, 0x3a3a60);
  pm.fillRect(210, 30, 220, 8, 0xc9a66b);
  pm.fillRect(210, 184, 220, 8, 0xc9a66b);
  pm.fillRect(206, 30, 8, 162, 0xc9a66b);
  pm.fillRect(426, 30, 8, 162, 0xc9a66b);
  // Balcony rail and floor.
  pm.fillRect(0, 220, W, 6, 0x6a6a78);
  for (let x = 10; x < W; x += 28) pm.fillRect(x, 226, 4, 36, 0x5a5a68);
  pm.fillRect(0, 248, W, 4, 0x6a6a78);
  pm.fillRect(0, 262, W, H - 262, 0x9a948c);
  for (let x = 0; x < W; x += 32) pm.fillRect(x, 262, 1, H - 262, 0x7a7a85);
  for (let y = 262; y < H; y += 32) pm.fillRect(0, y, W, 1, 0x7a7a85);
  pm.fillRect(0, 262, W, 3, 0x5a5a68);
  // Falling stars.
  for (let i = 0; i < 6; i += 1) {
    const x = rand() * W;
    const y = rand() * 160;
    pm.line(Math.round(x), Math.round(y), Math.round(x + 24), Math.round(y + 10), 0xffe9a3, 200);
    pm.set(Math.round(x), Math.round(y), 0xffffff);
  }
}

function speckleBand(
  pm: Pixmap,
  rand: () => number,
  y0: number,
  y1: number,
  rgb: number,
  count: number,
): void {
  for (let i = 0; i < count; i += 1) {
    pm.set(Math.floor(rand() * W), y0 + Math.floor(rand() * (y1 - y0)), rgb);
  }
}

function hash(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export const bgShade = shade;
