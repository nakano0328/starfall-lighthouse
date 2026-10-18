import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_VERSION, GAME_WIDTH } from '@/config';
import { BattleScene } from '@scenes/BattleScene';
import { BootScene } from '@scenes/BootScene';
import { GameOverScene } from '@scenes/GameOverScene';
import { TitleScene } from '@scenes/TitleScene';
import { MenuScene } from '@scenes/MenuScene';
import { ShopScene } from '@scenes/ShopScene';
import { TouchScene } from '@scenes/TouchScene';
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
  // Gamepads are polled per scene through scene.input.gamepad (§11.4); four
  // pointers cover D-pad + A + B on the touch overlay at once.
  input: { gamepad: true, activePointers: 4 },
  // Touch is last so it renders above every other scene.
  scene: [
    BootScene,
    TitleScene,
    WorldScene,
    MenuScene,
    BattleScene,
    GameOverScene,
    ShopScene,
    TouchScene,
  ],
};

export const game = new Phaser.Game(config);
window.__starfall.game = game;
