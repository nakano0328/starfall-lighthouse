import Phaser from 'phaser';

import type { Facing } from '@data/types';
import type { Action } from '@core/input/actions';
import { DIRECTIONS } from '@core/input/actions';

import { deviceTracker, sharedGamepad, virtualPad } from './inputShared';

export type { Action } from '@core/input/actions';

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

/**
 * Keys that only press an action, never hold it: Q / E switch tabs, pages and
 * slots like LB / RB on a pad (§11.4) without walking the party on the field.
 */
const PRESS_ONLY_BINDINGS: readonly (readonly [Action, number])[] = [
  ['left', KEY_CODES.Q],
  ['right', KEY_CODES.E],
];

/** Confirm presses closer together than this are ignored (連打防止, §11.4). */
export const CONFIRM_DEBOUNCE_MS = 120;

/**
 * Action layer over the keyboard, the gamepad plugin and the shared touch pad,
 * so scenes ask for actions, not key codes or button indices (§11.4).
 *
 * Presses are collected into `pending`, consumed by `justPressed` and cleared
 * after the scene's update. Keyboard presses come from the Key `down` events,
 * touch and gamepad presses from the shared pads' listeners (the gamepad is
 * sampled once per frame by the Touch scene), so a key or a tap that goes down
 * and up within a single frame (fast taps, automated input) still counts.
 *
 * Keyboard auto-repeat is not a press: Phaser keys are per scene and only skip
 * repeats while their own `isDown` is set, so a key held across a scene change
 * (X opening the Menu, Enter from the title) would otherwise fire again in the
 * new scene. A pad button held across a scene change fired its press in the
 * old scene only, since the shared mapper never restarts. `isDown` still
 * reflects a held input, which is what dash, hold-to-fast-forward and
 * `heldDirection` read.
 *
 * Create one per scene and call `destroy()` on shutdown.
 */
export class InputBindings {
  private readonly keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  /** Q / E: pressed into `pending` like any key, but never counted as held. */
  private readonly pressOnlyKeys: Phaser.Input.Keyboard.Key[] = [];
  private readonly pending = new Set<Action>();
  private lastConfirmAt = -Infinity;
  /** Press order of directions so "last pressed wins" for diagonals (§9.1). */
  private readonly pressOrder: Facing[] = [];
  private readonly unsubscribePad: () => void;
  private readonly unsubscribeGamepad: () => void;
  private readonly clearPending = (): void => {
    this.pending.clear();
  };

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    const bind = (code: number, action: Action): Phaser.Input.Keyboard.Key => {
      const key = keyboard!.addKey(code, false);
      key.on(
        Phaser.Input.Keyboard.Events.DOWN,
        (_key: Phaser.Input.Keyboard.Key, ev: KeyboardEvent) => {
          if (ev.repeat) return;
          this.pending.add(action);
          deviceTracker.use('keyboard');
        },
      );
      return key;
    };
    const make = (action: Action): Phaser.Input.Keyboard.Key[] =>
      keyboard ? BINDINGS[action].map((code) => bind(code, action)) : [];
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
    if (keyboard) {
      for (const [action, code] of PRESS_ONLY_BINDINGS) this.pressOnlyKeys.push(bind(code, action));
    }
    // Touch and pad presses reach only running scenes, like the per-scene keyboard keys.
    const onPress = (action: Action): void => {
      if (scene.sys.isActive()) this.pending.add(action);
    };
    this.unsubscribePad = virtualPad.onPress(onPress);
    this.unsubscribeGamepad = sharedGamepad.onPress(onPress);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.clearPending);
  }

  isDown(action: Action): boolean {
    return (
      this.keys[action].some((k) => k.isDown) ||
      sharedGamepad.isDown(action) ||
      virtualPad.isDown(action)
    );
  }

  /** True once per frame in which the action was pressed on any device. */
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
   * Direction currently requested, preferring the most recently pressed one when
   * several are held, across devices. Call once per frame before reading.
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

  /** Removes every key and listener so other scenes (e.g. an overlay) can take over. */
  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.clearPending);
    this.unsubscribePad();
    this.unsubscribeGamepad();
    this.pending.clear();
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) return;
    for (const list of Object.values(this.keys)) {
      for (const k of list) keyboard.removeKey(k, true);
    }
    for (const k of this.pressOnlyKeys) keyboard.removeKey(k, true);
  }
}
