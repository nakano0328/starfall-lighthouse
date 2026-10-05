import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { IMAGES, assetUrl } from '@/assets/manifest';
import { generatePlaceholder } from '@/assets/placeholders';

import { SceneKey } from './keys';

/**
 * First scene to run. Loads every manifest image that has a real file, draws a
 * loading bar meanwhile, then generates placeholder textures for the rest and
 * hands over to the title screen.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKey.Boot);
  }

  preload(): void {
    this.drawLoadingBar();
    for (const asset of IMAGES) {
      if (asset.src) this.load.image(asset.key, assetUrl(`images/${asset.src}`));
    }
  }

  create(): void {
    for (const asset of IMAGES) generatePlaceholder(this, asset);
    this.scene.start(SceneKey.Title);
  }

  private drawLoadingBar(): void {
    const w = 240;
    const h = 10;
    const x = (GAME_WIDTH - w) / 2;
    const y = GAME_HEIGHT / 2;
    const frame = this.add.graphics();
    frame.lineStyle(1, 0x9aa6c8, 1);
    frame.strokeRect(x - 1, y - 1, w + 2, h + 2);
    const bar = this.add.graphics();
    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      bar.clear();
      bar.fillStyle(COLORS.star, 1);
      bar.fillRect(x, y, Math.round(w * value), h);
    });
    this.load.on(Phaser.Loader.Events.COMPLETE, () => {
      frame.destroy();
      bar.destroy();
    });
  }
}
