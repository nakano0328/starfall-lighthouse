import Phaser from 'phaser';

import { COLORS, TILE_SIZE } from '@/config';

import { SceneKey } from './keys';

/**
 * First scene to run. Generates placeholder textures in code so the game is
 * playable before any real art exists, then hands over to the title screen.
 * Real assets will be loaded here from `assets/manifest.ts` in Phase 6.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  create(): void {
    this.makeStarTexture();
    this.makeLighthouseTexture();
    this.scene.start(SceneKey.Title);
  }

  private makeStarTexture(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(COLORS.starBright, 1);
    g.fillRect(1, 0, 1, 3);
    g.fillRect(0, 1, 3, 1);
    g.generateTexture('px-star', 3, 3);
    g.destroy();
  }

  private makeLighthouseTexture(): void {
    const w = TILE_SIZE;
    const h = TILE_SIZE * 3;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    // tower body with red/white bands
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle(i % 2 === 0 ? COLORS.lighthouseWhite : COLORS.lighthouseRed, 1);
      g.fillRect(8, 16 + i * 12, 16, 12);
    }
    // lamp room
    g.fillStyle(COLORS.deepSea, 1);
    g.fillRect(6, 6, 20, 10);
    g.fillStyle(COLORS.star, 1);
    g.fillRect(10, 8, 12, 6);
    // roof
    g.fillStyle(COLORS.lighthouseRed, 1);
    g.fillTriangle(4, 6, w - 4, 6, w / 2, 0);
    g.generateTexture('px-lighthouse', w, h);
    g.destroy();
  }
}
