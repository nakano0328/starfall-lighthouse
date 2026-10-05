import Phaser from 'phaser';

import { COLORS } from '@/config';
import { firstEnabled, isSelectable, moveSelection } from '@core/menu/selection';

import type { InputBindings } from './InputBindings';

export interface ListMenuItem {
  label: string;
  disabled?: boolean;
  /** Short hint shown next to the item (e.g. why it is disabled). */
  note?: string;
}

export interface ListMenuOptions {
  x: number;
  y: number;
  items: ListMenuItem[];
  lineHeight?: number;
  fontSize?: number;
  onConfirm: (index: number) => void;
  onCancel?: () => void;
}

/**
 * Vertical text menu with a blinking cursor (GAME_DESIGN §11.1: cursor blinks
 * 500ms, selected label uses COLORS.star). Input is polled via `update()` so the
 * owning scene decides when the menu is active.
 */
export class ListMenu extends Phaser.GameObjects.Container {
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly cursor: Phaser.GameObjects.Image;
  private readonly items: ListMenuItem[];
  private readonly lineHeight: number;
  private index: number;
  private readonly onConfirm: (index: number) => void;
  private readonly onCancel: (() => void) | undefined;
  private cursorTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, opts: ListMenuOptions) {
    super(scene, opts.x, opts.y);
    this.items = opts.items;
    this.lineHeight = opts.lineHeight ?? 28;
    this.onConfirm = opts.onConfirm;
    this.onCancel = opts.onCancel;
    const fontSize = opts.fontSize ?? 18;

    this.items.forEach((item, i) => {
      const text = scene.add
        .text(24, i * this.lineHeight, item.note ? `${item.label}  ${item.note}` : item.label, {
          fontFamily: 'sans-serif',
          fontSize: `${fontSize}px`,
          color: item.disabled ? COLORS.textDim : COLORS.textMain,
        })
        .setOrigin(0, 0.5);
      this.labels.push(text);
      this.add(text);
    });

    this.cursor = scene.add.image(0, 0, 'ui_cursor').setOrigin(0, 0.5);
    this.add(this.cursor);
    this.index = firstEnabled(this.items);
    this.refresh();
    scene.add.existing(this);
  }

  get selectedIndex(): number {
    return this.index;
  }

  setSelected(index: number): void {
    if (isSelectable(this.items, index)) {
      this.index = index;
      this.refresh();
    }
  }

  /** Poll once per frame while the menu should react to input. */
  override update(input: InputBindings): void {
    if (input.justPressed('down')) this.move(1);
    else if (input.justPressed('up')) this.move(-1);
    else if (input.justPressed('confirm')) {
      if (isSelectable(this.items, this.index)) this.onConfirm(this.index);
    } else if (input.justPressed('cancel')) this.onCancel?.();
  }

  private move(delta: 1 | -1): void {
    const next = moveSelection(this.items, this.index, delta);
    if (next !== this.index) {
      this.index = next;
      this.refresh();
    }
  }

  private refresh(): void {
    this.labels.forEach((label, i) => {
      const item = this.items[i];
      label.setColor(
        item?.disabled ? COLORS.textDim : i === this.index ? COLORS.textAccent : COLORS.textMain,
      );
    });
    this.cursorTween?.stop();
    if (this.index < 0) {
      this.cursor.setVisible(false);
      return;
    }
    this.cursor
      .setVisible(true)
      .setAlpha(1)
      .setY(this.index * this.lineHeight);
    this.cursorTween = this.scene.tweens.add({
      targets: this.cursor,
      alpha: { from: 1, to: 0.2 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    });
  }

  override destroy(fromScene?: boolean): void {
    this.cursorTween?.stop();
    super.destroy(fromScene);
  }
}
