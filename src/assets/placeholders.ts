import Phaser from 'phaser';

import { COLORS, TILE_SIZE } from '@/config';
import { PLACEHOLDER_TILES, TILE_COLUMNS, TILE_ROWS } from '@data/tiles';

import type { ImageAsset } from './manifest';
import { ACTOR_FRAMES, CHEST_FRAMES } from './manifest';

const T = TILE_SIZE;

/**
 * Generates a texture for an asset that has no real image yet. Called by BootScene
 * for every manifest entry whose texture is still missing after loading.
 */
export function generatePlaceholder(scene: Phaser.Scene, asset: ImageAsset): void {
  if (scene.textures.exists(asset.key)) return;
  switch (asset.placeholder) {
    case 'tileset':
      return makeTileset(scene, asset.key);
    case 'actor':
      return makeActor(scene, asset.key, asset.tint ?? 0xffffff);
    case 'chest':
      return makeChest(scene, asset.key);
    case 'sign':
      return makeSign(scene, asset.key);
    case 'save_point':
      return makeSavePoint(scene, asset.key);
    case 'window':
      return makeWindow(scene, asset.key);
    case 'cursor':
      return makeCursor(scene, asset.key);
    case 'star':
      return makeStar(scene, asset.key);
    case 'lighthouse':
      return makeLighthouse(scene, asset.key);
  }
}

function graphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

function makeTileset(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  PLACEHOLDER_TILES.forEach((tile, i) => {
    const x = (i % TILE_COLUMNS) * T;
    const y = Math.floor(i / TILE_COLUMNS) * T;
    g.fillStyle(tile.color, 1);
    g.fillRect(x, y, T, T);
    drawGlyph(g, tile.glyph, x, y, tile.color);
  });
  g.generateTexture(key, TILE_COLUMNS * T, TILE_ROWS * T);
  g.destroy();
  // Register one frame per tile so tileSprite/image can use them by name as well.
  const texture = scene.textures.get(key);
  PLACEHOLDER_TILES.forEach((tile, i) => {
    texture.add(tile.name, 0, (i % TILE_COLUMNS) * T, Math.floor(i / TILE_COLUMNS) * T, T, T);
  });
}

function shade(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = amount < 0 ? 1 + amount : 1;
  const r = Math.min(255, Math.round(c.red * f + (amount > 0 ? 255 * amount : 0)));
  const gg = Math.min(255, Math.round(c.green * f + (amount > 0 ? 255 * amount : 0)));
  const b = Math.min(255, Math.round(c.blue * f + (amount > 0 ? 255 * amount : 0)));
  return Phaser.Display.Color.GetColor(r, gg, b);
}

function drawGlyph(
  g: Phaser.GameObjects.Graphics,
  glyph: (typeof PLACEHOLDER_TILES)[number]['glyph'],
  x: number,
  y: number,
  base: number,
): void {
  const dark = shade(base, -0.3);
  const light = shade(base, 0.25);
  switch (glyph) {
    case 'dots':
      g.fillStyle(dark, 1);
      g.fillRect(x + 6, y + 8, 2, 2);
      g.fillRect(x + 20, y + 14, 2, 2);
      g.fillRect(x + 12, y + 24, 2, 2);
      return;
    case 'wave':
      g.fillStyle(light, 1);
      g.fillRect(x + 4, y + 10, 8, 2);
      g.fillRect(x + 16, y + 20, 10, 2);
      return;
    case 'brick':
      g.fillStyle(dark, 1);
      g.fillRect(x, y + 15, T, 2);
      g.fillRect(x + 15, y, 2, 15);
      g.fillRect(x + 7, y + 17, 2, 15);
      return;
    case 'plank':
      g.fillStyle(dark, 1);
      g.fillRect(x, y + 7, T, 1);
      g.fillRect(x, y + 15, T, 1);
      g.fillRect(x, y + 23, T, 1);
      return;
    case 'tree':
      g.fillStyle(dark, 1);
      g.fillCircle(x + 16, y + 16, 12);
      g.fillStyle(light, 1);
      g.fillCircle(x + 12, y + 12, 5);
      return;
    case 'trunk':
      g.fillStyle(dark, 1);
      g.fillRect(x + 11, y, 10, T);
      return;
    case 'rock':
      g.fillStyle(dark, 1);
      g.fillEllipse(x + 16, y + 18, 22, 16);
      g.fillStyle(light, 1);
      g.fillEllipse(x + 12, y + 14, 8, 5);
      return;
    case 'flower':
      g.fillStyle(0xffe9a3, 1);
      g.fillCircle(x + 10, y + 12, 3);
      g.fillStyle(0xff7aa8, 1);
      g.fillCircle(x + 22, y + 20, 3);
      return;
    case 'fence':
      g.fillStyle(dark, 1);
      g.fillRect(x + 4, y + 6, 4, 20);
      g.fillRect(x + 24, y + 6, 4, 20);
      g.fillRect(x, y + 12, T, 3);
      g.fillRect(x, y + 20, T, 3);
      return;
    case 'door':
      g.fillStyle(dark, 1);
      g.fillRect(x + 8, y + 4, 16, 28);
      g.fillStyle(0xffe9a3, 1);
      g.fillRect(x + 18, y + 18, 3, 3);
      return;
    case 'stairs':
      g.fillStyle(dark, 1);
      for (let i = 0; i < 4; i += 1) g.fillRect(x, y + 4 + i * 8, T, 2);
      return;
    case 'cross':
      g.lineStyle(2, dark, 1);
      g.lineBetween(x + 4, y + 4, x + 28, y + 28);
      g.lineBetween(x + 28, y + 4, x + 4, y + 28);
      return;
    case 'star':
      g.fillStyle(0xffe9a3, 1);
      g.fillRect(x + 15, y + 10, 2, 12);
      g.fillRect(x + 10, y + 15, 12, 2);
      return;
    default:
      return;
  }
}

/** 4 frames (down/up/left/right) of a simple figure with a facing marker. */
function makeActor(scene: Phaser.Scene, key: string, tint: number): void {
  const g = graphics(scene);
  ACTOR_FRAMES.forEach((facing, i) => {
    const x = i * T;
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(x + 16, 30, 20, 6);
    g.fillStyle(shade(tint, -0.35), 1);
    g.fillRoundedRect(x + 9, 14, 14, 15, 3);
    g.fillStyle(tint, 1);
    g.fillCircle(x + 16, 10, 7);
    g.fillStyle(0x1b1b2a, 1);
    switch (facing) {
      case 'down':
        g.fillRect(x + 13, 9, 2, 2);
        g.fillRect(x + 17, 9, 2, 2);
        break;
      case 'up':
        g.fillRect(x + 12, 4, 8, 2);
        break;
      case 'left':
        g.fillRect(x + 11, 9, 2, 2);
        break;
      case 'right':
        g.fillRect(x + 19, 9, 2, 2);
        break;
    }
  });
  g.generateTexture(key, ACTOR_FRAMES.length * T, T);
  g.destroy();
  const texture = scene.textures.get(key);
  ACTOR_FRAMES.forEach((facing, i) => texture.add(facing, 0, i * T, 0, T, T));
}

function makeChest(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  CHEST_FRAMES.forEach((frame, i) => {
    const x = i * T;
    g.fillStyle(0x7a4a2a, 1);
    g.fillRoundedRect(x + 4, 10, 24, 18, 3);
    g.fillStyle(frame === 'open' ? 0x3a2a1a : 0x9a6a3a, 1);
    g.fillRect(x + 4, 10, 24, 7);
    g.fillStyle(0xffe9a3, 1);
    g.fillRect(x + 14, 16, 4, 4);
  });
  g.generateTexture(key, CHEST_FRAMES.length * T, T);
  g.destroy();
  const texture = scene.textures.get(key);
  CHEST_FRAMES.forEach((frame, i) => texture.add(frame, 0, i * T, 0, T, T));
}

function makeSign(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  g.fillStyle(0x6b4423, 1);
  g.fillRect(14, 16, 4, 14);
  g.fillStyle(0xc9a66b, 1);
  g.fillRect(5, 5, 22, 13);
  g.fillStyle(0x6b4423, 1);
  g.fillRect(8, 9, 16, 1);
  g.fillRect(8, 13, 12, 1);
  g.generateTexture(key, T, T);
  g.destroy();
}

function makeSavePoint(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  g.fillStyle(0x6b6b70, 1);
  g.fillRect(8, 22, 16, 8);
  g.fillStyle(0xffe9a3, 1);
  g.fillTriangle(16, 2, 20, 14, 12, 14);
  g.fillTriangle(16, 22, 20, 12, 12, 12);
  g.fillTriangle(4, 13, 16, 9, 16, 17);
  g.fillTriangle(28, 13, 16, 9, 16, 17);
  g.generateTexture(key, T, T);
  g.destroy();
}

/** 96x96 9-slice window frame: navy body, brass border (GAME_DESIGN §11.1). */
function makeWindow(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  g.fillStyle(COLORS.deepSea, 0.92);
  g.fillRoundedRect(0, 0, 96, 96, 6);
  g.lineStyle(2, 0xc9a66b, 1);
  g.strokeRoundedRect(1, 1, 94, 94, 6);
  g.lineStyle(1, 0xf4f1ea, 0.5);
  g.strokeRoundedRect(4, 4, 88, 88, 4);
  g.generateTexture(key, 96, 96);
  g.destroy();
}

function makeCursor(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  g.fillStyle(0xffe9a3, 1);
  g.fillTriangle(4, 4, 14, 8, 4, 12);
  g.generateTexture(key, 16, 16);
  g.destroy();
}

function makeStar(scene: Phaser.Scene, key: string): void {
  const g = graphics(scene);
  g.fillStyle(COLORS.starBright, 1);
  g.fillRect(1, 0, 1, 3);
  g.fillRect(0, 1, 3, 1);
  g.generateTexture(key, 3, 3);
  g.destroy();
}

function makeLighthouse(scene: Phaser.Scene, key: string): void {
  const w = T;
  const h = T * 3;
  const g = graphics(scene);
  for (let i = 0; i < 6; i += 1) {
    g.fillStyle(i % 2 === 0 ? COLORS.lighthouseWhite : COLORS.lighthouseRed, 1);
    g.fillRect(8, 16 + i * 12, 16, 12);
  }
  g.fillStyle(COLORS.deepSea, 1);
  g.fillRect(6, 6, 20, 10);
  g.fillStyle(COLORS.star, 1);
  g.fillRect(10, 8, 12, 6);
  g.fillStyle(COLORS.lighthouseRed, 1);
  g.fillTriangle(4, 6, w - 4, 6, w / 2, 0);
  g.generateTexture(key, w, h);
  g.destroy();
}
