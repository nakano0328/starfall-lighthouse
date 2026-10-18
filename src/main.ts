import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_VERSION, GAME_WIDTH } from '@/config';
import { BattleScene } from '@scenes/BattleScene';
import { BootScene } from '@scenes/BootScene';
import { EndingScene } from '@scenes/EndingScene';
import { GameOverScene } from '@scenes/GameOverScene';
import { TitleScene } from '@scenes/TitleScene';
import { MenuScene } from '@scenes/MenuScene';
import { ShopScene } from '@scenes/ShopScene';
import { WorldScene } from '@scenes/WorldScene';
import { INPUT_TRACKER } from '@ui/InputBindings';

window.__starfall = {
  ready: false,
  scene: '',
  version: GAME_VERSION,
  inputDevice: INPUT_TRACKER.device,
  touchUi: INPUT_TRACKER.touchDetected,
};
INPUT_TRACKER.onChange((state) => {
  if (!window.__starfall) return;
  window.__starfall.inputDevice = state.device;
  window.__starfall.touchUi = state.touchDetected;
});
// A touch anywhere on the page (the letterbox included) brings up the touch pad (§11.4).
window.addEventListener('touchstart', () => INPUT_TRACKER.noteTouch(), {
  once: true,
  passive: true,
});

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.night,
  pixelArt: true,
  roundPixels: true,
  // D-pad + A + B at once on touch (§11.4).
  input: { activePointers: 3 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    TitleScene,
    WorldScene,
    MenuScene,
    BattleScene,
    GameOverScene,
    ShopScene,
    EndingScene,
  ],
};

export const game = new Phaser.Game(config);
window.__starfall.game = game;
