import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { STAFF_ROLL_LINES } from '@data/credits';
import { ENDING_TEXT } from '@data/ending';
import { InputBindings } from '@ui/InputBindings';

import { SceneKey } from './keys';

type Phase = 'visual' | 'roll' | 'end';

/** How long the key visual holds before the roll starts on its own. */
const VISUAL_MS = 3000;
/** Scroll pace of the staff roll; Z held plays it this many times faster. */
const ROLL_MS_PER_LINE = 900;
const ROLL_FAST_FORWARD = 4;
const ROLL_LINE_HEIGHT = 26;
const STAR_COUNT = 80;

/**
 * Ending (docs/GAME_DESIGN.md §11.5): the relit lighthouse (KV-02 placeholder) →
 * the staff roll built from docs/CREDITS.md → 「おしまい」 → the title. The save was
 * already rewound and written by WorldScene before this scene starts (§13 #20).
 */
export class EndingScene extends Phaser.Scene {
  private input2!: InputBindings;
  private phase: Phase = 'visual';
  private roll: Phaser.GameObjects.Text | undefined;
  private rollTween: Phaser.Tweens.Tween | undefined;
  private leaving = false;

  constructor() {
    super(SceneKey.Ending);
  }

  create(): void {
    this.phase = 'visual';
    this.leaving = false;
    this.roll = undefined;
    this.rollTween = undefined;
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    this.cameras.main.setBackgroundColor(COLORS.night);
    this.spawnStars();
    const glow = this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'px_star')
      .setScale(14)
      .setAlpha(0.25)
      .setTint(COLORS.star);
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.15, to: 0.4 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
    });
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'px_lighthouse')
      .setScale(3)
      .setOrigin(0.5, 1);
    this.add
      .text(GAME_WIDTH / 2, 60, ENDING_TEXT.caption, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: COLORS.textMain,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.time.delayedCall(VISUAL_MS, () => this.startRoll());
    if (window.__starfall) window.__starfall.scene = SceneKey.Ending;
  }

  override update(): void {
    if (this.leaving) return;
    switch (this.phase) {
      case 'visual':
        if (this.input2.justPressed('confirm')) this.startRoll();
        break;
      case 'roll':
        if (this.rollTween)
          this.rollTween.timeScale = this.input2.isDown('confirm') ? ROLL_FAST_FORWARD : 1;
        break;
      case 'end':
        if (this.input2.justPressed('confirm')) this.leave();
        break;
    }
  }

  // ---- probes for e2e ---------------------------------------------------------

  get phaseName(): Phase {
    return this.phase;
  }

  get rollLineCount(): number {
    return STAFF_ROLL_LINES.length;
  }

  // ---- flow -------------------------------------------------------------------

  private startRoll(): void {
    if (this.phase !== 'visual') return;
    this.phase = 'roll';
    this.input2.flush();
    const roll = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT + 16, STAFF_ROLL_LINES.join('\n'), {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: COLORS.textMain,
        align: 'center',
        lineSpacing: ROLL_LINE_HEIGHT - 16,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);
    this.roll = roll;
    this.rollTween = this.tweens.add({
      targets: roll,
      y: -roll.height - 16,
      duration: STAFF_ROLL_LINES.length * ROLL_MS_PER_LINE,
      onComplete: () => this.showEnd(),
    });
  }

  private showEnd(): void {
    this.phase = 'end';
    this.roll?.destroy();
    this.roll = undefined;
    this.rollTween = undefined;
    this.input2.flush();
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, ENDING_TEXT.theEnd, {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: COLORS.textAccent,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, ENDING_TEXT.toTitle, {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);
  }

  private leave(): void {
    this.leaving = true;
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SceneKey.Title);
    });
  }

  private spawnStars(): void {
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const star = this.add
        .image(
          Phaser.Math.Between(0, GAME_WIDTH),
          Phaser.Math.Between(0, GAME_HEIGHT - 120),
          'px_star',
        )
        .setAlpha(Phaser.Math.FloatBetween(0.3, 1));
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
