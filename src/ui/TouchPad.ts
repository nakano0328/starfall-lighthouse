import Phaser from 'phaser';

import { COLORS } from '@/config';
import type { Action, DirectionAction } from '@core/input/actions';
import { DIRECTION_ACTIONS } from '@core/input/actions';
import { TOUCH_BUTTONS, TOUCH_DPAD, dpadArrowCenter } from '@core/input/touch';

/** Drawn above everything else in the scene (HUD is 100, the chapter band 102). */
const TOUCH_PAD_DEPTH = 300;
/** The pad sits over the dialog and battle windows (there is no free band at 640×360),
 * so it stays light: faint fills, thin strokes, and `setDimmed` while text is read. */
const IDLE_FILL = 0.1;
const HELD_FILL = 0.4;
const STROKE = 0.4;
const LABEL_ALPHA = 0.6;
const DIMMED_ALPHA = 0.4;

const ARROW_GLYPH: Record<DirectionAction, string> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
};

export interface TouchPadOptions {
  /** Draw the ⛶ button; false when the Fullscreen API is unavailable (§11.4). */
  fullscreenAvailable: boolean;
}

/**
 * The on-screen controls for touch players (docs/GAME_DESIGN.md §11.4, UI-06).
 * Pure drawing: the geometry comes from src/core/input/touch.ts and the hit
 * testing happens in InputBindings. `setHeld` lights the pressed controls.
 */
export class TouchPad extends Phaser.GameObjects.Container {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly fullscreenAvailable: boolean;
  private heldKey = '';

  constructor(scene: Phaser.Scene, opts: TouchPadOptions) {
    super(scene, 0, 0);
    this.fullscreenAvailable = opts.fullscreenAvailable;
    this.graphics = scene.add.graphics();
    this.add(this.graphics);
    for (const dir of DIRECTION_ACTIONS) {
      const c = dpadArrowCenter(dir);
      this.add(this.label(c.x, c.y, ARROW_GLYPH[dir], 16));
    }
    for (const button of TOUCH_BUTTONS) {
      if (button.role === 'fullscreen') continue;
      const s = button.shape;
      const cx = s.kind === 'rect' ? s.x + s.w / 2 : s.cx;
      const cy = s.kind === 'rect' ? s.y + s.h / 2 : s.cy;
      this.add(this.label(cx, cy, button.label, button.role === 'menu' ? 11 : 18));
    }
    this.redraw(new Set());
    this.setScrollFactor(0).setDepth(TOUCH_PAD_DEPTH);
    scene.add.existing(this);
  }

  /** Fades the whole pad while a conversation page is being read (still works). */
  setDimmed(dimmed: boolean): void {
    this.setAlpha(dimmed ? DIMMED_ALPHA : 1);
  }

  /** Highlights the controls behind the held actions; cheap when nothing changed. */
  setHeld(held: ReadonlySet<Action>): void {
    const key = [...held].sort().join(',');
    if (key === this.heldKey) return;
    this.heldKey = key;
    this.redraw(held);
  }

  private label(x: number, y: number, text: string, size: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: COLORS.textMain,
      })
      .setOrigin(0.5)
      .setAlpha(LABEL_ALPHA);
  }

  private redraw(held: ReadonlySet<Action>): void {
    const g = this.graphics;
    g.clear();
    const { size } = TOUCH_DPAD;
    for (const dir of DIRECTION_ACTIONS) {
      const c = dpadArrowCenter(dir);
      this.shape(held.has(dir));
      g.fillRoundedRect(c.x - size / 2, c.y - size / 2, size, size, 8);
      g.strokeRoundedRect(c.x - size / 2, c.y - size / 2, size, size, 8);
    }
    for (const button of TOUCH_BUTTONS) {
      const s = button.shape;
      if (button.role === 'fullscreen') {
        if (!this.fullscreenAvailable || s.kind !== 'rect') continue;
        this.drawFullscreenBox(s.x, s.y, s.w, s.h);
        continue;
      }
      const lit =
        (button.role === 'a' && held.has('confirm')) || (button.role === 'b' && held.has('cancel'));
      this.shape(lit);
      if (s.kind === 'circle') {
        g.fillCircle(s.cx, s.cy, s.r);
        g.strokeCircle(s.cx, s.cy, s.r);
      } else {
        g.fillRoundedRect(s.x, s.y, s.w, s.h, 6);
        g.strokeRoundedRect(s.x, s.y, s.w, s.h, 6);
      }
    }
  }

  private shape(lit: boolean): void {
    this.graphics.fillStyle(0xffffff, lit ? HELD_FILL : IDLE_FILL);
    this.graphics.lineStyle(2, 0xffffff, STROKE);
  }

  /** The ⛶ box: a frame with four inward corner marks, drawn in code (§11.4). */
  private drawFullscreenBox(x: number, y: number, w: number, h: number): void {
    const g = this.graphics;
    this.shape(false);
    g.fillRoundedRect(x, y, w, h, 4);
    g.strokeRoundedRect(x, y, w, h, 4);
    g.lineStyle(2, 0xf4f1ea, 0.9);
    const m = 7;
    const len = 6;
    const corners: [number, number, number, number][] = [
      [x + m, y + m, 1, 1],
      [x + w - m, y + m, -1, 1],
      [x + m, y + h - m, 1, -1],
      [x + w - m, y + h - m, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      g.lineBetween(cx, cy, cx + sx * len, cy);
      g.lineBetween(cx, cy, cx, cy + sy * len);
    }
  }
}
