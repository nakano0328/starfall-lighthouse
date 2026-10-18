import { Pixmap, shade } from './pixmap';

/**
 * Field objects (chest, sign, save point, gate, the forest vine) and the menu cursor.
 * All transparent so they sit on any ground tile.
 */
const T = 32;

export const CHEST_FRAMES = ['closed', 'open'] as const;

/** 64×32: closed and open. */
export function renderChest(): Pixmap {
  const sheet = new Pixmap(T * 2, T);
  CHEST_FRAMES.forEach((frame, i) => sheet.blit(chestFrame(frame === 'open'), i * T, 0));
  return sheet;
}

function chestFrame(open: boolean): Pixmap {
  const pm = new Pixmap(T, T);
  const wood = 0x8a5a2a;
  const dark = shade(wood, -0.4);
  const brass = 0xd8b050;
  pm.fillEllipse(16, 29, 12, 2.5, 0x000000, 70);
  // Body.
  pm.fillRect(5, 14, 22, 14, wood);
  pm.fillRect(5, 14, 22, 1, shade(wood, 0.15));
  pm.fillRect(5, 27, 22, 1, dark);
  pm.fillRect(5, 14, 1, 14, dark);
  pm.fillRect(26, 14, 1, 14, dark);
  pm.fillRect(8, 15, 2, 12, brass);
  pm.fillRect(22, 15, 2, 12, brass);
  if (open) {
    // Dark interior with a glow, lid tilted back.
    pm.fillRect(6, 12, 20, 6, 0x2a1a10);
    pm.fillRect(8, 13, 16, 3, 0xffe9a3, 160);
    pm.fillRect(4, 4, 24, 8, dark);
    pm.fillRect(5, 5, 22, 6, shade(wood, -0.1));
    pm.fillRect(8, 5, 2, 6, brass);
    pm.fillRect(22, 5, 2, 6, brass);
    pm.fillRect(14, 19, 4, 3, brass);
  } else {
    // Lid.
    pm.fillRect(4, 9, 24, 7, shade(wood, -0.1));
    pm.fillRect(5, 8, 22, 1, shade(wood, 0.1));
    pm.fillRect(4, 15, 24, 1, dark);
    pm.fillRect(8, 9, 2, 7, brass);
    pm.fillRect(22, 9, 2, 7, brass);
    pm.fillRect(14, 14, 4, 4, brass);
    pm.set(15, 16, dark);
  }
  return pm;
}

export function renderSign(): Pixmap {
  const pm = new Pixmap(T, T);
  const wood = 0x9a6a3a;
  const dark = shade(wood, -0.4);
  pm.fillEllipse(16, 29, 6, 2, 0x000000, 70);
  pm.fillRect(14, 16, 4, 13, dark);
  pm.fillRect(15, 16, 1, 13, wood);
  pm.fillRect(4, 5, 24, 13, dark);
  pm.fillRect(5, 6, 22, 11, 0xc9a66b);
  pm.fillRect(5, 6, 22, 1, shade(0xc9a66b, 0.2));
  pm.fillRect(8, 9, 16, 1, dark);
  pm.fillRect(8, 12, 12, 1, dark);
  pm.fillRect(8, 15, 14, 1, dark);
  return pm;
}

export function renderSavePoint(): Pixmap {
  const pm = new Pixmap(T, T);
  const stone = 0x7a7a88;
  pm.fillEllipse(16, 29, 9, 2.5, 0x000000, 70);
  pm.fillRect(8, 22, 16, 7, stone);
  pm.fillRect(8, 22, 16, 1, shade(stone, 0.25));
  pm.fillRect(8, 28, 16, 1, shade(stone, -0.4));
  pm.fillRect(10, 20, 12, 2, shade(stone, 0.1));
  // Floating four-pointed star with a soft glow.
  pm.fillEllipse(16, 11, 9, 9, 0xffe9a3, 50);
  pm.fillTriangle(16, 1, 18, 9, 14, 9, 0xffe9a3);
  pm.fillTriangle(16, 19, 18, 11, 14, 11, 0xffe9a3);
  pm.fillTriangle(6, 10, 15, 8, 15, 12, 0xffe9a3);
  pm.fillTriangle(26, 10, 17, 8, 17, 12, 0xffe9a3);
  pm.fillRect(15, 9, 2, 2, 0xfff6d5);
  pm.set(15, 9, 0xffffff);
  return pm;
}

export function renderGate(): Pixmap {
  const pm = new Pixmap(T, T);
  const iron = 0x4a4a55;
  const bar = 0x8a8a95;
  pm.fillRect(2, 3, 4, 27, iron);
  pm.fillRect(26, 3, 4, 27, iron);
  pm.fillRect(2, 3, 1, 27, shade(iron, 0.3));
  pm.fillRect(26, 3, 1, 27, shade(iron, 0.3));
  pm.fillRect(2, 2, 4, 1, shade(iron, 0.2));
  pm.fillRect(26, 2, 4, 1, shade(iron, 0.2));
  for (const x of [9, 14, 19]) {
    pm.fillRect(x, 5, 3, 25, bar);
    pm.fillRect(x, 5, 1, 25, shade(bar, 0.3));
    pm.fillRect(x + 2, 5, 1, 25, shade(bar, -0.35));
    pm.fillTriangle(x - 1, 5, x + 4, 5, x + 1, 1, shade(bar, -0.2));
  }
  pm.fillRect(6, 8, 20, 2, shade(bar, -0.15));
  pm.fillRect(6, 24, 20, 2, shade(bar, -0.15));
  return pm;
}

/** The thorny vine that blocks the forest path until the shrine falls (§13 #7). */
export function renderVine(): Pixmap {
  const pm = new Pixmap(T, T);
  const green = 0x3a7a2a;
  const dark = shade(green, -0.35);
  const thorn = 0xc8c0a0;
  pm.fillEllipse(16, 29, 12, 2.5, 0x000000, 60);
  const strands: [number, number, number, number][] = [
    [3, 26, 14, 6],
    [6, 10, 28, 20],
    [2, 18, 30, 14],
    [10, 30, 24, 4],
  ];
  for (const [x0, y0, x1, y1] of strands) {
    pm.line(x0, y0, x1, y1, dark);
    pm.line(x0, y0 - 1, x1, y1 - 1, green);
    pm.line(x0 + 1, y0, x1 + 1, y1, green);
  }
  for (const [x, y] of [
    [8, 16],
    [14, 9],
    [20, 24],
    [25, 12],
    [12, 27],
    [22, 17],
  ]) {
    pm.set(x ?? 0, y ?? 0, thorn);
    pm.set((x ?? 0) + 1, (y ?? 0) - 1, thorn);
  }
  // A closed flower bud.
  pm.fillEllipse(18, 7, 3, 4, 0xa84a8a);
  pm.fillEllipse(17, 6, 1.5, 2, 0xd88ab8);
  return pm;
}

/** 16×16 menu cursor: a gold arrow with a dark outline. */
export function renderCursor(): Pixmap {
  const pm = new Pixmap(16, 16);
  pm.fillTriangle(3, 3, 13, 8, 3, 13, 0xffe9a3);
  pm.fillTriangle(5, 6, 9, 8, 5, 10, 0xfff6d5);
  pm.outline(0x3a2a10);
  return pm;
}
