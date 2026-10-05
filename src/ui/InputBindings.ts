import Phaser from 'phaser';

import type { Facing } from '@data/types';

/** Logical actions, mapped from keyboard per docs/GAME_DESIGN.md §11.4. */
export type Action =
  'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'dash' | 'fullscreen';

const KEY_CODES = Phaser.Input.Keyboard.KeyCodes;

const BINDINGS: Record<Action, number[]> = {
  up: [KEY_CODES.UP, KEY_CODES.W],
  down: [KEY_CODES.DOWN, KEY_CODES.S],
  left: [KEY_CODES.LEFT, KEY_CODES.A],
  right: [KEY_CODES.RIGHT, KEY_CODES.D],
  confirm: [KEY_CODES.Z, KEY_CODES.ENTER, KEY_CODES.SPACE],
  cancel: [KEY_CODES.X, KEY_CODES.ESC],
  dash: [KEY_CODES.SHIFT],
  fullscreen: [KEY_CODES.F],
};

/** Confirm presses closer together than this are ignored (連打防止, §11.4). */
export const CONFIRM_DEBOUNCE_MS = 120;

const DIRECTIONS: readonly Facing[] = ['up', 'down', 'left', 'right'];

/**
 * Thin wrapper over Phaser keys so scenes ask for actions, not key codes.
 *
 * Presses are collected from the Key `down` events and consumed by `justPressed`,
 * then cleared after the scene's update. Phaser's own `JustDown` misses a key that
 * goes down and up within a single frame (fast taps, automated input), which is
 * why the events are tracked here instead.
 *
 * Create one per scene and call `destroy()` on shutdown.
 */
export class InputBindings {
  private readonly keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private readonly pending = new Set<Action>();
  private lastConfirmAt = -Infinity;
  /** Press order of direction keys so "last pressed wins" for diagonals (§9.1). */
  private readonly pressOrder: Facing[] = [];
  private readonly clearPending = (): void => {
    this.pending.clear();
  };

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    const make = (action: Action): Phaser.Input.Keyboard.Key[] => {
      if (!keyboard) return [];
      return BINDINGS[action].map((code) => {
        const key = keyboard.addKey(code, false);
        key.on(Phaser.Input.Keyboard.Events.DOWN, () => this.pending.add(action));
        return key;
      });
    };
    this.keys = {
      up: make('up'),
      down: make('down'),
      left: make('left'),
      right: make('right'),
      confirm: make('confirm'),
      cancel: make('cancel'),
      dash: make('dash'),
      fullscreen: make('fullscreen'),
    };
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.clearPending);
  }

  isDown(action: Action): boolean {
    return this.keys[action].some((k) => k.isDown);
  }

  /** True once per frame in which any key of the action was pressed. */
  justPressed(action: Action): boolean {
    if (!this.pending.has(action)) return false;
    if (action === 'confirm') {
      const now = this.scene.time.now;
      if (now - this.lastConfirmAt < CONFIRM_DEBOUNCE_MS) {
        this.pending.delete(action);
        return false;
      }
      this.lastConfirmAt = now;
    }
    this.pending.delete(action);
    return true;
  }

  /**
   * Direction currently requested, preferring the most recently pressed key when
   * several are held. Call once per frame before reading.
   */
  heldDirection(): Facing | null {
    for (const dir of DIRECTIONS) {
      const down = this.isDown(dir);
      const idx = this.pressOrder.indexOf(dir);
      if (down && idx === -1) this.pressOrder.push(dir);
      if (!down && idx !== -1) this.pressOrder.splice(idx, 1);
    }
    return this.pressOrder[this.pressOrder.length - 1] ?? null;
  }

  /** Drops presses that have not been consumed yet (e.g. when a dialog opens). */
  flush(): void {
    this.pending.clear();
  }

  /** Removes every key so other scenes (e.g. an overlay) can take over. */
  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.clearPending);
    this.pending.clear();
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    for (const list of Object.values(this.keys)) {
      for (const k of list) keyboard.removeKey(k, true);
    }
  }
}
