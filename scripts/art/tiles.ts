import { PLACEHOLDER_TILES, TILE_COLUMNS, TILE_ROWS } from '@data/tiles';

import { Pixmap, seededRandom, shade, speckle } from './pixmap';

/**
 * Area tilesets (docs/GAME_DESIGN.md §9.3: ts_village, ts_interior, ts_forest, ts_mine,
 * ts_ruins, ts_lighthouse). Every sheet uses the index layout of PLACEHOLDER_TILES, so
 * maps and legends stay untouched and only the texture key changes per map.
 *
 * Tiles that legends use as pure decoration (rock, fence, flower, tree, rail, lever,
 * stele) have transparent backgrounds. Tiles that some map uses as ground (lantern,
 * table, ore, ...) are opaque over the area's `objectFloor` so they also sit on a base
 * grid without showing the scene background.
 */
export const TILE = 32;

export type AreaId = 'village' | 'interior' | 'forest' | 'mine' | 'ruins' | 'lighthouse';

export const AREA_IDS: readonly AreaId[] = [
  'village',
  'interior',
  'forest',
  'mine',
  'ruins',
  'lighthouse',
];

interface AreaPalette {
  grass: number;
  grassDark: number;
  path: number;
  sand: number;
  water: number;
  deepWater: number;
  /** Brick/plaster wall face and its mortar. */
  wall: number;
  mortar: number;
  wallTop: number;
  floorStone: number;
  floorWood: number;
  leaf: number;
  trunk: number;
  rock: number;
  cliff: number;
  plank: number;
  metal: number;
  rune: number;
  /** Which floor the dual-use object tiles (lantern, table, ...) are drawn over. */
  objectFloor: 'sand' | 'floor_stone' | 'floor_wood' | 'grass';
  /** Scene background behind `void` (keeps the dark areas of a dungeon one colour). */
  voidColor: number;
}

const PALETTES: Record<AreaId, AreaPalette> = {
  village: {
    grass: 0x5aa64a,
    grassDark: 0x4b9140,
    path: 0xc9a66b,
    sand: 0xe6d4a0,
    water: 0x3f8fd0,
    deepWater: 0x2a62a8,
    wall: 0xe8e0d0,
    mortar: 0xbfb4a0,
    wallTop: 0x7a7a85,
    floorStone: 0xa8a29a,
    floorWood: 0xb07a4a,
    leaf: 0x3f8a3a,
    trunk: 0x7a4a2a,
    rock: 0x9a9a9a,
    cliff: 0x8a6a4a,
    plank: 0xb08050,
    metal: 0x8a8a95,
    rune: 0x5fd0ff,
    objectFloor: 'sand',
    voidColor: 0x0b1026,
  },
  interior: {
    grass: 0x5aa64a,
    grassDark: 0x4b9140,
    path: 0xc9a66b,
    sand: 0xe6d4a0,
    water: 0x3f8fd0,
    deepWater: 0x2a62a8,
    wall: 0xe0d8c8,
    mortar: 0x9a8a70,
    wallTop: 0x6a5a4a,
    floorStone: 0x9a948c,
    floorWood: 0xa87040,
    leaf: 0x3f8a3a,
    trunk: 0x6a4020,
    rock: 0x8a8a8a,
    cliff: 0x8a6a4a,
    plank: 0x8a5a30,
    metal: 0x8a8a95,
    rune: 0x5fd0ff,
    objectFloor: 'floor_wood',
    voidColor: 0x0b1026,
  },
  forest: {
    grass: 0x3f7a3a,
    grassDark: 0x346a30,
    path: 0x9a8a5a,
    sand: 0xcfc08a,
    water: 0x3a7ab0,
    deepWater: 0x265a8a,
    wall: 0x6a6a72,
    mortar: 0x4a4a52,
    wallTop: 0x4a4a52,
    floorStone: 0x8a8a90,
    floorWood: 0x8a6a40,
    leaf: 0x2f6a2c,
    trunk: 0x5a3a22,
    rock: 0x7a8a6a,
    cliff: 0x6a5a40,
    plank: 0x9a7a4a,
    metal: 0x7a7a85,
    rune: 0x9fe0a0,
    objectFloor: 'floor_stone',
    voidColor: 0x0b1a16,
  },
  mine: {
    grass: 0x5a7a4a,
    grassDark: 0x4a6a3c,
    path: 0x9a8a6a,
    sand: 0xc0b090,
    water: 0x2f5f8a,
    deepWater: 0x1f3f6a,
    wall: 0x6a5a4a,
    mortar: 0x3a2f28,
    wallTop: 0x3a3028,
    floorStone: 0x8a7a6a,
    floorWood: 0x8a5a3a,
    leaf: 0x3f6a3a,
    trunk: 0x5a3a22,
    rock: 0x7a6a5a,
    cliff: 0x5a4a3a,
    plank: 0x7a5a3a,
    metal: 0x9a9aa0,
    rune: 0xb08ae0,
    objectFloor: 'floor_stone',
    voidColor: 0x100c0a,
  },
  ruins: {
    grass: 0x4f8a5a,
    grassDark: 0x3f7a4a,
    path: 0xb0a080,
    sand: 0xd8c890,
    water: 0x3f9fc0,
    deepWater: 0x2a6a90,
    wall: 0x5a7a80,
    mortar: 0x3a5a60,
    wallTop: 0x3a5a60,
    floorStone: 0x7a9aa0,
    floorWood: 0x8a6a4a,
    leaf: 0x3f8a5a,
    trunk: 0x5a4a3a,
    rock: 0x6a8a8a,
    cliff: 0x5a6a6a,
    plank: 0x9a7a5a,
    metal: 0x8a8a90,
    rune: 0x5fd0ff,
    objectFloor: 'floor_stone',
    voidColor: 0x0a1a24,
  },
  lighthouse: {
    grass: 0x5aa64a,
    grassDark: 0x4b9140,
    path: 0xb0a898,
    sand: 0xd8d0c0,
    water: 0x4fa0e0,
    deepWater: 0x12264a,
    wall: 0xf0ece4,
    mortar: 0xc8c0b0,
    wallTop: 0x6a6a7a,
    floorStone: 0xb8b4ac,
    floorWood: 0xa07a50,
    leaf: 0x3f8a3a,
    trunk: 0x6a4a2a,
    rock: 0x9a9aa0,
    cliff: 0x7a7a85,
    plank: 0xa07a50,
    metal: 0x5a5a68,
    rune: 0xffe9a3,
    objectFloor: 'floor_stone',
    voidColor: 0x0b1026,
  },
};

export function areaPalette(area: AreaId): AreaPalette {
  return PALETTES[area];
}

/** Renders one area's sheet: TILE_COLUMNS × TILE_ROWS tiles in PLACEHOLDER_TILES order. */
export function renderTileset(area: AreaId): Pixmap {
  const pal = PALETTES[area];
  const sheet = new Pixmap(TILE_COLUMNS * TILE, TILE_ROWS * TILE);
  PLACEHOLDER_TILES.forEach((def, i) => {
    const tile = renderTile(def.name, pal, i);
    sheet.blit(tile, (i % TILE_COLUMNS) * TILE, Math.floor(i / TILE_COLUMNS) * TILE);
  });
  return sheet;
}

/** One 32×32 tile for `name` in the palette; `seed` keeps the noise identical per run. */
export function renderTile(name: string, pal: AreaPalette, seed: number): Pixmap {
  const pm = new Pixmap(TILE, TILE);
  const rand = seededRandom(seed * 7919 + 17);
  const floor = (): void => drawFloor(pm, pal, pal.objectFloor, rand);
  switch (name) {
    case 'grass':
      drawGrass(pm, pal.grass, rand);
      return pm;
    case 'grass_dark':
      drawGrass(pm, pal.grassDark, rand, true);
      return pm;
    case 'path':
      drawDirt(pm, pal.path, rand);
      return pm;
    case 'sand':
      drawSand(pm, pal.sand, rand);
      return pm;
    case 'water':
      drawWater(pm, pal.water, rand);
      return pm;
    case 'deep_water':
      drawWater(pm, pal.deepWater, rand, true);
      return pm;
    case 'wall':
      drawWall(pm, pal);
      return pm;
    case 'wall_top':
      drawWallTop(pm, pal);
      return pm;
    case 'floor_wood':
      drawPlanks(pm, pal.floorWood, rand);
      return pm;
    case 'floor_stone':
      drawFlagstones(pm, pal.floorStone, rand);
      return pm;
    case 'roof_red':
      drawShingles(pm, 0xc44a3c);
      return pm;
    case 'roof_blue':
      drawShingles(pm, 0x3b6aa8);
      return pm;
    case 'tree_top':
      drawCanopy(pm, pal.leaf, rand);
      return pm;
    case 'tree_trunk':
      drawTrunk(pm, pal.trunk, pal.leaf);
      return pm;
    case 'rock':
      drawRock(pm, pal.rock);
      return pm;
    case 'flower':
      drawFlowers(pm, rand);
      return pm;
    case 'fence':
      drawFence(pm, pal);
      return pm;
    case 'door':
      drawWall(pm, pal);
      drawDoor(pm, pal);
      return pm;
    case 'stairs':
      floor();
      drawStairs(pm, pal);
      return pm;
    case 'cliff':
      drawCliff(pm, pal.cliff, rand);
      return pm;
    case 'bridge':
      drawBridge(pm, pal.plank, pal.water, rand);
      return pm;
    case 'counter':
      floor();
      drawCounter(pm, pal.plank);
      return pm;
    case 'bed':
      floor();
      drawBed(pm);
      return pm;
    case 'table':
      floor();
      drawTable(pm, pal.plank);
      return pm;
    case 'bookshelf':
      floor();
      drawBookshelf(pm, pal.trunk);
      return pm;
    case 'pier':
      drawPier(pm, pal.plank, pal.water, rand);
      return pm;
    case 'lantern':
      floor();
      drawLantern(pm, pal.metal);
      return pm;
    case 'rail':
      drawRail(pm, pal.metal, pal.trunk);
      return pm;
    case 'ore':
      drawWall(pm, pal);
      drawOre(pm, pal.rune);
      return pm;
    case 'rune_floor':
      drawFlagstones(pm, pal.floorStone, rand);
      drawRune(pm, pal.rune);
      return pm;
    case 'void':
      pm.fillRect(0, 0, TILE, TILE, pal.voidColor);
      return pm;
    case 'stele':
      drawStele(pm, pal.wallTop, pal.rune);
      return pm;
    case 'lever':
      drawLever(pm, pal.metal, pal.trunk);
      return pm;
    case 'collision':
      pm.fillRect(0, 0, TILE, TILE, 0xff0040, 110);
      pm.line(4, 4, 27, 27, 0xff0040);
      pm.line(27, 4, 4, 27, 0xff0040);
      return pm;
    default:
      pm.fillRect(0, 0, TILE, TILE, 0xff00ff);
      return pm;
  }
}

function drawFloor(
  pm: Pixmap,
  pal: AreaPalette,
  kind: AreaPalette['objectFloor'],
  rand: () => number,
): void {
  switch (kind) {
    case 'sand':
      return drawSand(pm, pal.sand, rand);
    case 'floor_stone':
      return drawFlagstones(pm, pal.floorStone, rand);
    case 'floor_wood':
      return drawPlanks(pm, pal.floorWood, rand);
    case 'grass':
      return drawGrass(pm, pal.grass, rand);
  }
}

// ---- ground -----------------------------------------------------------------

function drawGrass(pm: Pixmap, base: number, rand: () => number, dense = false): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  speckle(pm, 0, 0, TILE, TILE, shade(base, -0.18), dense ? 34 : 22, rand);
  speckle(pm, 0, 0, TILE, TILE, shade(base, 0.14), 10, rand);
  // A few grass blades.
  for (let i = 0; i < (dense ? 6 : 4); i += 1) {
    const x = Math.floor(rand() * (TILE - 2));
    const y = Math.floor(rand() * (TILE - 3));
    pm.set(x, y + 2, shade(base, -0.28));
    pm.set(x, y + 1, shade(base, -0.28));
    pm.set(x + 1, y, shade(base, 0.1));
  }
}

function drawDirt(pm: Pixmap, base: number, rand: () => number): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  speckle(pm, 0, 0, TILE, TILE, shade(base, -0.14), 26, rand);
  speckle(pm, 0, 0, TILE, TILE, shade(base, 0.12), 12, rand);
  for (let i = 0; i < 3; i += 1) {
    const x = Math.floor(rand() * (TILE - 3));
    const y = Math.floor(rand() * (TILE - 2));
    pm.fillRect(x, y, 3, 2, shade(base, -0.22));
    pm.set(x + 1, y, shade(base, 0.05));
  }
}

function drawSand(pm: Pixmap, base: number, rand: () => number): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  speckle(pm, 0, 0, TILE, TILE, shade(base, -0.1), 30, rand);
  speckle(pm, 0, 0, TILE, TILE, shade(base, 0.12), 14, rand);
}

function drawWater(pm: Pixmap, base: number, rand: () => number, deep = false): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  speckle(pm, 0, 0, TILE, TILE, shade(base, -0.1), 18, rand);
  const light = shade(base, deep ? 0.18 : 0.3);
  // Two wave crests per tile, offset so neighbours do not line up.
  const offsets = [
    [3, 8, 9],
    [17, 20, 8],
  ] as const;
  for (const [x, y, w] of offsets) {
    pm.fillRect(x, y, w, 1, light);
    pm.fillRect(x + 2, y + 1, Math.max(2, w - 4), 1, shade(base, 0.08));
  }
  if (!deep) pm.fillRect(10, 27, 6, 1, light);
}

function drawWall(pm: Pixmap, pal: AreaPalette): void {
  const base = pal.wall;
  pm.fillRect(0, 0, TILE, TILE, base);
  // Running-bond bricks: 2 rows of 16 px with the second row offset by half a brick.
  for (let row = 0; row < 2; row += 1) {
    const y = row * 16;
    pm.fillRect(0, y + 15, TILE, 1, pal.mortar);
    const offset = row === 0 ? 0 : 8;
    for (let bx = -16; bx < TILE; bx += 16) {
      const x = bx + offset;
      pm.fillRect(x + 15, y, 1, 15, pal.mortar);
      pm.fillRect(x, y, 15, 1, shade(base, 0.12));
      pm.fillRect(x, y, 1, 15, shade(base, 0.12));
      pm.fillRect(x + 1, y + 13, 14, 1, shade(base, -0.1));
    }
  }
}

function drawWallTop(pm: Pixmap, pal: AreaPalette): void {
  pm.fillRect(0, 0, TILE, TILE, pal.wallTop);
  pm.fillRect(0, 0, TILE, 2, shade(pal.wallTop, 0.2));
  pm.fillRect(0, TILE - 2, TILE, 2, shade(pal.wallTop, -0.3));
  pm.fillRect(0, 0, 2, TILE, shade(pal.wallTop, 0.1));
  pm.fillRect(TILE - 2, 0, 2, TILE, shade(pal.wallTop, -0.2));
  pm.fillRect(8, 10, 16, 12, shade(pal.wallTop, -0.08));
}

function drawPlanks(pm: Pixmap, base: number, rand: () => number): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  for (let row = 0; row < 4; row += 1) {
    const y = row * 8;
    pm.fillRect(0, y, TILE, 1, shade(base, 0.15));
    pm.fillRect(0, y + 7, TILE, 1, shade(base, -0.3));
    const seam = Math.floor(rand() * TILE);
    pm.fillRect(seam, y + 1, 1, 6, shade(base, -0.3));
  }
  speckle(pm, 0, 0, TILE, TILE, shade(base, -0.12), 14, rand);
}

function drawFlagstones(pm: Pixmap, base: number, rand: () => number): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  const mortar = shade(base, -0.3);
  const cells: [number, number, number, number][] = [
    [0, 0, 20, 12],
    [20, 0, 12, 12],
    [0, 12, 12, 20],
    [12, 12, 20, 8],
    [12, 20, 20, 12],
  ];
  for (const [x, y, w, h] of cells) {
    pm.fillRect(x, y, w, 1, shade(base, 0.1));
    pm.fillRect(x, y, 1, h, shade(base, 0.1));
    pm.fillRect(x, y + h - 1, w, 1, mortar);
    pm.fillRect(x + w - 1, y, 1, h, mortar);
  }
  speckle(pm, 0, 0, TILE, TILE, shade(base, -0.1), 16, rand);
}

function drawShingles(pm: Pixmap, base: number): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  for (let row = 0; row < 4; row += 1) {
    const y = row * 8;
    const offset = row % 2 === 0 ? 0 : 4;
    pm.fillRect(0, y + 7, TILE, 1, shade(base, -0.4));
    pm.fillRect(0, y, TILE, 1, shade(base, 0.15));
    for (let x = -8 + offset; x < TILE; x += 8) pm.fillRect(x + 7, y + 1, 1, 6, shade(base, -0.3));
  }
}

function drawCliff(pm: Pixmap, base: number, rand: () => number): void {
  pm.fillRect(0, 0, TILE, TILE, base);
  pm.fillRect(0, 0, TILE, 4, shade(base, 0.2));
  pm.fillRect(0, TILE - 3, TILE, 3, shade(base, -0.35));
  for (let i = 0; i < 5; i += 1) {
    const x = Math.floor(rand() * (TILE - 8));
    const y = 5 + Math.floor(rand() * (TILE - 12));
    pm.fillRect(x, y, 6 + Math.floor(rand() * 4), 1, shade(base, -0.3));
    pm.fillRect(x, y + 1, 4, 1, shade(base, 0.1));
  }
}

function drawBridge(pm: Pixmap, plank: number, water: number, rand: () => number): void {
  drawWater(pm, water, rand);
  pm.fillRect(2, 0, 28, TILE, plank);
  for (let y = 0; y < TILE; y += 6) pm.fillRect(2, y + 5, 28, 1, shade(plank, -0.35));
  pm.fillRect(2, 0, 2, TILE, shade(plank, -0.3));
  pm.fillRect(28, 0, 2, TILE, shade(plank, -0.3));
  pm.fillRect(4, 0, 1, TILE, shade(plank, 0.15));
}

function drawPier(pm: Pixmap, plank: number, water: number, rand: () => number): void {
  drawWater(pm, water, rand);
  pm.fillRect(0, 0, TILE, TILE, plank, 255);
  for (let x = 0; x < TILE; x += 8) pm.fillRect(x + 7, 0, 1, TILE, shade(plank, -0.35));
  pm.fillRect(0, 0, TILE, 1, shade(plank, 0.15));
  pm.fillRect(0, TILE - 2, TILE, 2, shade(plank, -0.25));
  // Nail heads.
  for (let x = 3; x < TILE; x += 8) {
    pm.set(x, 6, shade(plank, -0.45));
    pm.set(x, 24, shade(plank, -0.45));
  }
}

// ---- decoration (transparent) ------------------------------------------------

function drawCanopy(pm: Pixmap, leaf: number, rand: () => number): void {
  const dark = shade(leaf, -0.3);
  const light = shade(leaf, 0.22);
  pm.fillEllipse(16, 17, 15.5, 14.5, dark);
  pm.fillEllipse(16, 16, 14, 13, leaf);
  pm.fillEllipse(12, 12, 6, 5, light);
  pm.fillEllipse(20, 20, 4, 3, dark);
  speckle(pm, 4, 4, 24, 24, dark, 10, rand);
  speckle(pm, 6, 6, 16, 14, light, 6, rand);
  // Keep the speckles inside the canopy silhouette.
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const dx = (x + 0.5 - 16) / 15.5;
      const dy = (y + 0.5 - 17) / 14.5;
      if (dx * dx + dy * dy > 1) pm.set(x, y, 0, 0);
    }
  }
}

function drawTrunk(pm: Pixmap, trunk: number, leaf: number): void {
  const dark = shade(trunk, -0.35);
  pm.fillRect(11, 0, 10, TILE, trunk);
  pm.fillRect(11, 0, 2, TILE, dark);
  pm.fillRect(19, 0, 2, TILE, dark);
  pm.fillRect(14, 2, 1, 24, shade(trunk, 0.12));
  // Roots flaring out at the bottom.
  pm.fillRect(8, 27, 16, 3, trunk);
  pm.fillRect(6, 29, 20, 2, dark);
  // Shadow of the canopy on the trunk top.
  pm.fillRect(11, 0, 10, 3, shade(leaf, -0.5));
}

function drawRock(pm: Pixmap, rock: number): void {
  const dark = shade(rock, -0.4);
  pm.fillEllipse(16, 19, 12, 9, dark);
  pm.fillEllipse(16, 18, 11, 8, rock);
  pm.fillEllipse(12, 15, 5, 3, shade(rock, 0.25));
  pm.fillRect(10, 22, 12, 1, dark);
  pm.fillEllipse(16, 27, 12, 2, 0x000000, 70);
}

function drawFlowers(pm: Pixmap, rand: () => number): void {
  const colours = [0xffe9a3, 0xff7aa8, 0xffffff, 0xff9a5a];
  for (let i = 0; i < 4; i += 1) {
    const x = 4 + Math.floor(rand() * 22);
    const y = 4 + Math.floor(rand() * 22);
    const c = colours[i % colours.length] ?? 0xffffff;
    pm.set(x, y + 1, 0x2f6a2c);
    pm.set(x, y + 2, 0x2f6a2c);
    pm.set(x - 1, y, c);
    pm.set(x + 1, y, c);
    pm.set(x, y - 1, c);
    pm.set(x, y, shade(c, -0.25));
  }
}

function drawFence(pm: Pixmap, pal: AreaPalette): void {
  const wood = pal.plank;
  const dark = shade(wood, -0.4);
  pm.fillRect(4, 6, 4, 22, wood);
  pm.fillRect(24, 6, 4, 22, wood);
  pm.fillRect(4, 6, 1, 22, shade(wood, 0.15));
  pm.fillRect(24, 6, 1, 22, shade(wood, 0.15));
  pm.fillRect(7, 6, 1, 22, dark);
  pm.fillRect(27, 6, 1, 22, dark);
  pm.fillRect(0, 11, TILE, 3, wood);
  pm.fillRect(0, 19, TILE, 3, wood);
  pm.fillRect(0, 13, TILE, 1, dark);
  pm.fillRect(0, 21, TILE, 1, dark);
  pm.fillRect(4, 4, 4, 2, dark);
  pm.fillRect(24, 4, 4, 2, dark);
}

function drawRail(pm: Pixmap, metal: number, wood: number): void {
  const tie = shade(wood, -0.1);
  for (let y = 2; y < TILE; y += 8) pm.fillRect(4, y, 24, 3, tie);
  pm.fillRect(9, 0, 3, TILE, metal);
  pm.fillRect(20, 0, 3, TILE, metal);
  pm.fillRect(9, 0, 1, TILE, shade(metal, 0.25));
  pm.fillRect(20, 0, 1, TILE, shade(metal, 0.25));
  pm.fillRect(11, 0, 1, TILE, shade(metal, -0.35));
  pm.fillRect(22, 0, 1, TILE, shade(metal, -0.35));
}

function drawLever(pm: Pixmap, metal: number, wood: number): void {
  pm.fillRect(10, 20, 12, 8, shade(wood, -0.2));
  pm.fillRect(10, 20, 12, 1, shade(wood, 0.1));
  pm.fillRect(14, 10, 3, 11, metal);
  pm.line(15, 10, 22, 5, shade(metal, -0.2));
  pm.line(16, 10, 23, 5, shade(metal, -0.2));
  pm.fillCircle(23, 5, 2.5, 0xc44a3c);
  pm.set(22, 4, 0xff9a8a);
}

function drawStele(pm: Pixmap, stone: number, rune: number): void {
  const dark = shade(stone, -0.35);
  pm.fillRect(9, 4, 14, 24, stone);
  pm.fillRect(11, 2, 10, 2, stone);
  pm.fillRect(9, 4, 1, 24, shade(stone, 0.2));
  pm.fillRect(22, 4, 1, 24, dark);
  pm.fillRect(7, 27, 18, 3, dark);
  // Glowing glyphs.
  pm.fillRect(13, 8, 6, 1, rune);
  pm.fillRect(15, 8, 2, 7, rune);
  pm.fillRect(13, 17, 6, 1, rune);
  pm.fillRect(12, 21, 8, 1, shade(rune, -0.2));
}

// ---- furniture and objects (opaque, over the area floor) ----------------------

function drawDoor(pm: Pixmap, pal: AreaPalette): void {
  const wood = pal.plank;
  pm.fillRect(7, 3, 18, 29, shade(wood, -0.45));
  pm.fillRect(8, 4, 16, 28, wood);
  for (let x = 12; x < 24; x += 4) pm.fillRect(x, 4, 1, 28, shade(wood, -0.3));
  pm.fillRect(8, 4, 16, 1, shade(wood, 0.15));
  pm.fillRect(19, 18, 2, 2, 0xffe9a3);
  // Arch highlight on the surrounding wall.
  pm.fillRect(7, 2, 18, 1, shade(pal.wall, -0.25));
}

function drawStairs(pm: Pixmap, pal: AreaPalette): void {
  const stone = pal.wallTop;
  pm.fillRect(2, 2, 28, 28, shade(stone, -0.5));
  for (let i = 0; i < 4; i += 1) {
    const y = 3 + i * 7;
    pm.fillRect(3, y, 26, 6, shade(stone, 0.1 + i * 0.08));
    pm.fillRect(3, y + 5, 26, 1, shade(stone, -0.4));
  }
  pm.fillRect(2, 2, 1, 28, shade(stone, -0.3));
  pm.fillRect(29, 2, 1, 28, shade(stone, -0.3));
}

function drawCounter(pm: Pixmap, wood: number): void {
  pm.fillRect(0, 8, TILE, 20, shade(wood, -0.1));
  pm.fillRect(0, 8, TILE, 4, shade(wood, 0.2));
  pm.fillRect(0, 12, TILE, 1, shade(wood, -0.4));
  pm.fillRect(0, 26, TILE, 2, shade(wood, -0.45));
  for (let x = 6; x < TILE; x += 10) pm.fillRect(x, 14, 1, 11, shade(wood, -0.3));
}

function drawBed(pm: Pixmap): void {
  const frame = 0x6a4020;
  pm.fillRect(4, 2, 24, 29, frame);
  pm.fillRect(5, 3, 22, 27, 0xc05a5a);
  pm.fillRect(5, 12, 22, 1, shade(0xc05a5a, -0.3));
  pm.fillRect(5, 22, 22, 1, shade(0xc05a5a, -0.3));
  pm.fillRect(7, 4, 18, 7, 0xf4f1ea);
  pm.fillRect(7, 10, 18, 1, shade(0xf4f1ea, -0.25));
  pm.fillRect(4, 29, 24, 2, shade(frame, -0.3));
}

function drawTable(pm: Pixmap, wood: number): void {
  pm.fillRect(3, 7, 26, 15, shade(wood, 0.1));
  pm.fillRect(3, 7, 26, 2, shade(wood, 0.3));
  pm.fillRect(3, 20, 26, 2, shade(wood, -0.35));
  pm.fillRect(5, 22, 3, 7, shade(wood, -0.2));
  pm.fillRect(24, 22, 3, 7, shade(wood, -0.2));
  pm.fillRect(12, 11, 8, 5, 0xf4f1ea, 200);
}

function drawBookshelf(pm: Pixmap, wood: number): void {
  const dark = shade(wood, -0.35);
  pm.fillRect(2, 1, 28, 30, wood);
  pm.fillRect(2, 1, 28, 1, shade(wood, 0.15));
  const colours = [0xc44a3c, 0x3b6aa8, 0x5aa64a, 0xffe9a3, 0x8a4a9a];
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 3 + shelf * 9;
    pm.fillRect(4, y, 24, 7, dark);
    let x = 5;
    let i = shelf;
    while (x < 26) {
      const w = 2 + (i % 2);
      pm.fillRect(
        x,
        y + 1 + (i % 3 === 0 ? 1 : 0),
        w,
        6 - (i % 3 === 0 ? 1 : 0),
        colours[i % 5] ?? 0,
      );
      x += w + 1;
      i += 1;
    }
    pm.fillRect(4, y + 7, 24, 1, shade(wood, 0.1));
  }
  pm.fillRect(2, 29, 28, 2, dark);
}

function drawLantern(pm: Pixmap, metal: number): void {
  const dark = shade(metal, -0.4);
  pm.fillRect(14, 12, 4, 16, dark);
  pm.fillRect(10, 27, 12, 3, dark);
  pm.fillRect(10, 2, 12, 11, dark);
  pm.fillRect(12, 4, 8, 8, 0xffe9a3);
  pm.fillRect(14, 6, 4, 4, 0xfff6d5);
  pm.fillRect(13, 1, 6, 1, dark);
  // Warm glow on the floor.
  pm.fillEllipse(16, 20, 12, 7, 0xffe9a3, 40);
}

function drawOre(pm: Pixmap, crystal: number): void {
  const dark = shade(crystal, -0.4);
  const light = shade(crystal, 0.4);
  const gems: [number, number][] = [
    [9, 20],
    [16, 12],
    [22, 22],
  ];
  for (const [x, y] of gems) {
    pm.fillTriangle(x - 3, y + 4, x + 3, y + 4, x, y - 4, dark);
    pm.fillTriangle(x - 2, y + 3, x + 1, y + 3, x, y - 2, crystal);
    pm.set(x, y - 1, light);
  }
}

/** A faint four-pointed star set into the flagstones (kept quiet: floors use it in rows). */
function drawRune(pm: Pixmap, rune: number): void {
  const dim = shade(rune, -0.25);
  pm.fillEllipse(16, 16, 9, 9, rune, 36);
  pm.fillRect(15, 8, 2, 16, rune, 170);
  pm.fillRect(8, 15, 16, 2, rune, 170);
  pm.line(12, 12, 20, 20, dim, 110);
  pm.line(20, 12, 12, 20, dim, 110);
  pm.fillRect(15, 15, 2, 2, 0xffffff, 220);
}
