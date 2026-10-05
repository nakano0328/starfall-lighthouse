import Phaser from 'phaser';

import { COLORS } from '@/config';

/**
 * Menu/dialog window frame (docs/GAME_DESIGN.md §11.1). Drawn with Graphics so it
 * works on Canvas and WebGL alike; the 9-slice art (UI-01) replaces the drawing
 * in Phase 6.
 */
export class Window extends Phaser.GameObjects.Container {
  private readonly frame: Phaser.GameObjects.Graphics;
  private frameWidth: number;
  private frameHeight: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y);
    this.frameWidth = width;
    this.frameHeight = height;
    this.frame = scene.add.graphics();
    this.add(this.frame);
    this.redraw();
    scene.add.existing(this);
  }

  resize(width: number, height: number): void {
    this.frameWidth = width;
    this.frameHeight = height;
    this.redraw();
  }

  private redraw(): void {
    const g = this.frame;
    g.clear();
    g.fillStyle(COLORS.deepSea, 0.85);
    g.fillRoundedRect(0, 0, this.frameWidth, this.frameHeight, 6);
    g.lineStyle(2, 0xc9a66b, 1);
    g.strokeRoundedRect(1, 1, this.frameWidth - 2, this.frameHeight - 2, 6);
    g.lineStyle(1, 0xf4f1ea, 0.35);
    g.strokeRoundedRect(4, 4, this.frameWidth - 8, this.frameHeight - 8, 4);
  }
}
