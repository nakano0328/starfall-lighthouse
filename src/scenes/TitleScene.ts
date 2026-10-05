import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_TITLE, GAME_TITLE_EN, GAME_VERSION, GAME_WIDTH } from '@/config';

import { SceneKey } from './keys';

/**
 * Title screen. Phase 1 scope: show the title, a few drifting stars and a
 * "press start" prompt. The real menu (はじめから / つづきから / 設定) lands in Phase 5.
 */
export class TitleScene extends Phaser.Scene {
  private prompt?: Phaser.GameObjects.Text;
  private started = false;

  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.night);
    this.spawnStars(60);

    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40, 'px-lighthouse')
      .setScale(2)
      .setOrigin(0.5, 1);

    this.add
      .text(GAME_WIDTH / 2, 86, GAME_TITLE, {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: COLORS.textMain,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 124, GAME_TITLE_EN, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    this.prompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 60, 'Z / Enter で はじめる', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: COLORS.textMain,
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.25 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(GAME_WIDTH - 8, GAME_HEIGHT - 8, `v${GAME_VERSION} 開発中`, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 1);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      keyboard.on('keydown-Z', this.onStart, this);
      keyboard.on('keydown-ENTER', this.onStart, this);
      keyboard.on('keydown-SPACE', this.onStart, this);
    }
    this.input.on('pointerdown', this.onStart, this);

    if (window.__starfall) {
      window.__starfall.ready = true;
      window.__starfall.scene = SceneKey.Title;
    }
  }

  private onStart(): void {
    if (this.started) return;
    this.started = true;
    this.prompt?.setText('フィールドは Phase 2 で実装予定です');
    this.tweens.killTweensOf(this.prompt ?? []);
    this.prompt?.setAlpha(1);
    this.cameras.main.flash(300, 255, 233, 163);
    this.time.delayedCall(1500, () => {
      this.started = false;
      this.prompt?.setText('Z / Enter で はじめる');
    });
  }

  private spawnStars(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT - 80);
      const star = this.add.image(x, y, 'px-star').setAlpha(Phaser.Math.FloatBetween(0.3, 1));
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: 0.1 },
        duration: Phaser.Math.Between(800, 2400),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 1500),
      });
    }
  }
}
