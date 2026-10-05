import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import type { DialogPage } from '@core/dialog/runner';
import { Typewriter } from '@core/text/typewriter';

import type { InputBindings } from './InputBindings';
import { ListMenu } from './ListMenu';
import { Window } from './Window';

/** Layout from docs/GAME_DESIGN.md §11.1. */
const BOX = { x: 16, y: 248, w: 608, h: 96 } as const;
const PORTRAIT = { x: 24, y: 248, size: 96 } as const;
const TEXT_X_WITH_PORTRAIT = 136;
const TEXT_X_PLAIN = 32;
const LINE_HEIGHT = 24;
const FONT_SIZE = 16;
/** Holding confirm fast-forwards the typewriter to this speed. */
const FAST_FORWARD_MS = 4;
/** How long confirm must be held before fast-forward kicks in. */
const HOLD_MS = 250;

export interface DialogBoxCallbacks {
  onAdvance: () => void;
  onChoose: (index: number) => void;
}

/**
 * The conversation window: speaker tag, optional portrait, typewriter text,
 * page-advance marker and a choice list. Fixed to the camera (HUD).
 */
export class DialogBox extends Phaser.GameObjects.Container {
  private readonly window: Window;
  private readonly nameWindow: Window;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly portrait: Phaser.GameObjects.Image;
  private readonly portraitFrame: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly marker: Phaser.GameObjects.Text;
  private markerTween?: Phaser.Tweens.Tween;
  private choiceWindow: Window | undefined;
  private choiceMenu: ListMenu | undefined;
  private typewriter: Typewriter | null = null;
  private page: DialogPage | null = null;
  private holdMs = 0;
  private msPerChar: number;

  constructor(
    scene: Phaser.Scene,
    msPerChar: number,
    private readonly callbacks: DialogBoxCallbacks,
  ) {
    super(scene, 0, 0);
    this.msPerChar = msPerChar;
    this.window = new Window(scene, BOX.x, BOX.y, BOX.w, BOX.h);
    this.nameWindow = new Window(scene, BOX.x + 8, BOX.y - 26, 120, 28);
    this.nameText = scene.add
      .text(BOX.x + 20, BOX.y - 12, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: COLORS.textAccent,
      })
      .setOrigin(0, 0.5);
    this.portraitFrame = scene.add.graphics();
    this.portrait = scene.add
      .image(PORTRAIT.x + PORTRAIT.size / 2, PORTRAIT.y + PORTRAIT.size / 2, '__DEFAULT')
      .setVisible(false);
    this.text = scene.add.text(TEXT_X_PLAIN, BOX.y + 12, '', {
      fontFamily: 'sans-serif',
      fontSize: `${FONT_SIZE}px`,
      color: COLORS.textMain,
      lineSpacing: LINE_HEIGHT - FONT_SIZE - 3,
      wordWrap: { width: BOX.x + BOX.w - TEXT_X_PLAIN - 24, useAdvancedWrap: true },
    });
    this.marker = scene.add
      .text(BOX.x + BOX.w - 18, BOX.y + BOX.h - 14, '▼', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textAccent,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.add([
      this.window,
      this.nameWindow,
      this.nameText,
      this.portraitFrame,
      this.portrait,
      this.text,
      this.marker,
    ]);
    this.setScrollFactor(0);
    this.setVisible(false);
    scene.add.existing(this);
  }

  get isOpen(): boolean {
    return this.page !== null;
  }

  /** True while the text is still typing (used by tests/e2e through the scene). */
  get isTyping(): boolean {
    return this.typewriter !== null && !this.typewriter.done;
  }

  setTextSpeed(msPerChar: number): void {
    this.msPerChar = msPerChar;
  }

  /** Shows a page. Call again for each page; `close()` when the dialog ends. */
  show(page: DialogPage): void {
    this.page = page;
    this.setVisible(true);
    this.closeChoices();

    const hasSpeaker = page.speaker !== undefined && page.speaker !== '';
    this.nameWindow.setVisible(hasSpeaker);
    this.nameText.setVisible(hasSpeaker).setText(page.speaker ?? '');
    if (hasSpeaker) this.nameWindow.resize(this.nameText.width + 24, 28);

    const hasPortrait = page.portrait !== undefined && this.scene.textures.exists(page.portrait);
    const portraitSlot = page.portrait !== undefined;
    this.portrait.setVisible(hasPortrait);
    if (hasPortrait && page.portrait) this.portrait.setTexture(page.portrait);
    this.portraitFrame.clear();
    if (portraitSlot) {
      // Reserve the slot even without art so text does not reflow in Phase 6.
      this.portraitFrame.fillStyle(0x000000, 0.35);
      this.portraitFrame.fillRect(PORTRAIT.x, PORTRAIT.y, PORTRAIT.size, PORTRAIT.size);
      this.portraitFrame.lineStyle(1, 0xc9a66b, 0.6);
      this.portraitFrame.strokeRect(
        PORTRAIT.x + 0.5,
        PORTRAIT.y + 0.5,
        PORTRAIT.size - 1,
        PORTRAIT.size - 1,
      );
    }
    const textX = portraitSlot ? TEXT_X_WITH_PORTRAIT : TEXT_X_PLAIN;
    this.text.setX(textX).setWordWrapWidth(BOX.x + BOX.w - textX - 24, true);

    this.typewriter = new Typewriter(page.text, this.msPerChar);
    this.text.setText(this.typewriter.visibleText);
    this.holdMs = 0;
    this.setMarker(false);
    if (this.typewriter.done) this.onTextComplete();
  }

  close(): void {
    this.page = null;
    this.typewriter = null;
    this.closeChoices();
    this.setMarker(false);
    this.setVisible(false);
  }

  /** Poll once per frame while open. */
  override update(input: InputBindings, dtMs: number): void {
    const page = this.page;
    if (!page || !this.typewriter) return;

    if (this.choiceMenu) {
      this.choiceMenu.update(input);
      return;
    }

    if (!this.typewriter.done) {
      if (input.justPressed('confirm')) {
        this.typewriter.reveal();
      } else if (input.isDown('confirm')) {
        this.holdMs += dtMs;
        if (this.holdMs >= HOLD_MS) this.typewriter.setSpeed(FAST_FORWARD_MS);
      } else {
        this.holdMs = 0;
        this.typewriter.setSpeed(this.msPerChar);
      }
      if (this.typewriter.update(dtMs) > 0 || this.typewriter.done) {
        this.text.setText(this.typewriter.visibleText);
      }
      if (this.typewriter.done) this.onTextComplete();
      return;
    }

    if (input.justPressed('confirm')) this.callbacks.onAdvance();
  }

  private onTextComplete(): void {
    const page = this.page;
    if (!page) return;
    if (page.choices && page.choices.length > 0) {
      this.openChoices(page.choices);
    } else {
      this.setMarker(true);
    }
  }

  private openChoices(choices: string[]): void {
    const lineHeight = 24;
    const height = choices.length * lineHeight + 16;
    const width = 200;
    const x = BOX.x + BOX.w - width;
    const y = BOX.y - height - 6;
    this.choiceWindow = new Window(this.scene, x, y, width, height);
    this.choiceMenu = new ListMenu(this.scene, {
      x: x + 8,
      y: y + 8 + lineHeight / 2,
      items: choices.map((label) => ({ label })),
      lineHeight,
      fontSize: 16,
      onConfirm: (index) => this.callbacks.onChoose(index),
    });
    this.add([this.choiceWindow, this.choiceMenu]);
  }

  private closeChoices(): void {
    this.choiceMenu?.destroy();
    this.choiceWindow?.destroy();
    this.choiceMenu = undefined;
    this.choiceWindow = undefined;
  }

  private setMarker(visible: boolean): void {
    this.markerTween?.stop();
    this.marker.setVisible(visible).setAlpha(1);
    if (visible) {
      this.markerTween = this.scene.tweens.add({
        targets: this.marker,
        alpha: { from: 1, to: 0.2 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  override destroy(fromScene?: boolean): void {
    this.markerTween?.stop();
    super.destroy(fromScene);
  }
}

/** Keeps the HUD layout constants in one place for tests and other overlays. */
export const DIALOG_LAYOUT = { BOX, PORTRAIT, GAME_WIDTH, GAME_HEIGHT } as const;
