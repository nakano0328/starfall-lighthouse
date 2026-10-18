import Phaser from 'phaser';

import type { Action, InputTrackerState } from '@core/input/actions';
import { DIRECTION_ACTIONS, InputTracker } from '@core/input/actions';
import type { GamepadSnapshot } from '@core/input/gamepad';
import { GamepadMapper } from '@core/input/gamepad';
import { TouchMapper } from '@core/input/touch';
import type { Facing } from '@data/types';

import { TouchPad } from './TouchPad';

export type { Action } from '@core/input/actions';

/**
 * The one input tracker for the whole game (last device used, touch seen). Every
 * scene's InputBindings reports into it; main.ts mirrors it onto `__starfall`.
 */
export const INPUT_TRACKER = new InputTracker();

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

/**
 * One place where keyboard, gamepad and touch become logical actions
 * (docs/GAME_DESIGN.md §11.4), so scenes ask for actions, not devices.
 *
 * Presses are collected from the Key `down` events, the gamepad edges read each
 * PRE_UPDATE and the touch pointer events, consumed by `justPressed`, then cleared
 * after the scene's update. Phaser's own `JustDown` misses a key that goes down
 * and up within a single frame (fast taps, automated input), which is why the
 * events are tracked here instead.
 *
 * Keyboard auto-repeat is not a press: Phaser keys are per scene and only skip
 * repeats while their own `isDown` is set, so a key held across a scene change
 * (X opening the Menu, Enter from the title) would otherwise fire again in the
 * new scene. `isDown` still reflects a held key, which is what dash, hold-to-fast-
 * forward and `heldDirection` read.
 *
 * The gamepad is polled through `navigator.getGamepads()` (standard mapping); the
 * touch pad appears once a real touch has been seen and is hidden while the scene
 * is paused under an overlay. F / ⛶ toggle fullscreen from here directly.
 *
 * Create one per scene and call `destroy()` on shutdown.
 */
export class InputBindings {
  private readonly keys: Record<Action, Phaser.Input.Keyboard.Key[]>;
  private readonly pending = new Set<Action>();
  private readonly gamepad = new GamepadMapper();
  private readonly touch = new TouchMapper();
  private touchHeld: ReadonlySet<Action> = new Set();
  private touchPad: TouchPad | undefined;
  private lastConfirmAt = -Infinity;
  /** Press order of direction keys so "last pressed wins" for diagonals (§9.1). */
  private readonly pressOrder: Facing[] = [];
  private readonly offTracker: () => void;
  private readonly clearPending = (): void => {
    this.pending.clear();
  };

  constructor(private readonly scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    const make = (action: Action): Phaser.Input.Keyboard.Key[] => {
      if (!keyboard) return [];
      return BINDINGS[action].map((code) => {
        const key = keyboard.addKey(code, false);
        key.on(
          Phaser.Input.Keyboard.Events.DOWN,
          (_key: Phaser.Input.Keyboard.Key, ev: KeyboardEvent) => {
            if (ev.repeat) return;
            INPUT_TRACKER.noteDevice('keyboard');
            this.press(action);
          },
        );
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
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.poll);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.clearPending);
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.onPause);
    scene.events.on(Phaser.Scenes.Events.RESUME, this.onResume);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    this.offTracker = INPUT_TRACKER.onChange(this.onTrackerChange);
    if (INPUT_TRACKER.touchDetected) this.ensureTouchPad();
  }

  isDown(action: Action): boolean {
    return (
      this.keys[action].some((k) => k.isDown) ||
      this.gamepad.held.has(action) ||
      this.touchHeld.has(action)
    );
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
   *
   * A direction pressed since the last frame counts as held for this frame even if
   * it was released again already: Phaser applies key events as they arrive, so a
   * quick tap (automation, or a short press on a slow device) could otherwise go down
   * and up between two updates and never turn or step the player.
   */
  heldDirection(): Facing | null {
    for (const dir of DIRECTION_ACTIONS) {
      const down = this.isDown(dir) || this.pending.has(dir);
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

  /** Fades the touch pad (if any) while text under it is being read. */
  setTouchPadDimmed(dimmed: boolean): void {
    this.touchPad?.setDimmed(dimmed);
  }

  /** e2e/debug: whether this scene is showing the touch pad. */
  get hasTouchPad(): boolean {
    return this.touchPad !== undefined && this.touchPad.visible;
  }

  /** Removes every key so other scenes (e.g. an overlay) can take over. */
  destroy(): void {
    const { scene } = this;
    scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.poll);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.clearPending);
    scene.events.off(Phaser.Scenes.Events.PAUSE, this.onPause);
    scene.events.off(Phaser.Scenes.Events.RESUME, this.onResume);
    scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown);
    scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp);
    this.offTracker();
    this.pending.clear();
    this.touch.clear();
    this.touchPad?.destroy();
    this.touchPad = undefined;
    const keyboard = scene.input.keyboard;
    if (!keyboard) return;
    for (const list of Object.values(this.keys)) {
      for (const k of list) keyboard.removeKey(k, true);
    }
  }

  // ---- sources ----------------------------------------------------------------

  private press(action: Action): void {
    this.pending.add(action);
    if (action === 'fullscreen') this.toggleFullscreen();
  }

  /** Reads the pad and tidies touch pointers once per frame, before the scene's update. */
  private readonly poll = (): void => {
    const pad = this.gamepad.update(readGamepad());
    for (const action of pad.pressed) this.press(action);
    if (pad.active) INPUT_TRACKER.noteDevice('gamepad');

    // A pointer that ended without our handler seeing it (e.g. a lost touchend).
    const pointers = this.scene.input.manager.pointers;
    for (const id of this.touch.pointerIds) {
      const pointer = pointers[id];
      if (!pointer || !pointer.isDown) this.touch.up(id);
    }
    this.touchHeld = this.touch.held;
    this.touchPad?.setHeld(this.touchHeld);
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.wasTouch) return;
    // The very first touch only brings the pad up; it cannot have aimed at a button.
    const firstTouch = !INPUT_TRACKER.touchDetected;
    INPUT_TRACKER.noteDevice('touch');
    if (firstTouch) return;
    for (const action of this.touch.down(pointer.id, pointer.x, pointer.y)) this.press(action);
    this.touchHeld = this.touch.held;
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.wasTouch || !pointer.isDown) return;
    this.touch.move(pointer.id, pointer.x, pointer.y);
    this.touchHeld = this.touch.held;
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    this.touch.up(pointer.id);
    this.touchHeld = this.touch.held;
  };

  private readonly onTrackerChange = (state: InputTrackerState): void => {
    if (state.touchDetected) this.ensureTouchPad();
  };

  private readonly onPause = (): void => {
    this.touchPad?.setVisible(false);
  };

  private readonly onResume = (): void => {
    // Whatever is held when the overlay closes (the B that closed it) is not a press here.
    this.gamepad.reset();
    this.touch.clear();
    this.pending.clear();
    this.touchPad?.setVisible(true);
  };

  private ensureTouchPad(): void {
    if (this.touchPad) return;
    this.touchPad = new TouchPad(this.scene, {
      fullscreenAvailable: this.scene.scale.fullscreen.available,
    });
  }

  private toggleFullscreen(): void {
    const { scale } = this.scene;
    if (!scale.fullscreen.available) return;
    scale.toggleFullscreen();
  }
}

/** The first connected gamepad as a snapshot, or null when none (or no API). */
function readGamepad(): GamepadSnapshot | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  let pads: readonly (Gamepad | null)[];
  try {
    pads = Array.from(navigator.getGamepads());
  } catch {
    return null;
  }
  const pad = pads.find((p): p is Gamepad => p !== null && p.connected);
  if (!pad) return null;
  return { buttons: pad.buttons.map((b) => b.pressed), axes: pad.axes };
}
