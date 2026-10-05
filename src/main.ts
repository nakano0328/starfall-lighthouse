import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_VERSION, GAME_WIDTH } from '@/config';
import { BootScene } from '@scenes/BootScene';
import { TitleScene } from '@scenes/TitleScene';
import { WorldScene } from '@scenes/WorldScene';

window.__starfall = { ready: false, scene: '', version: GAME_VERSION };

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.night,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, WorldScene],
};

export const game = new Phaser.Game(config);
window.__starfall.game = game;
