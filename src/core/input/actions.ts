/**
 * Logical input actions and the input-device bookkeeping shared by keyboard,
 * gamepad and touch (docs/GAME_DESIGN.md §11.4). Pure TypeScript: the Phaser
 * side (src/ui/InputBindings.ts) maps raw keys, pads and pointers onto these.
 */
export type DirectionAction = 'up' | 'down' | 'left' | 'right';

export type Action = DirectionAction | 'confirm' | 'cancel' | 'dash' | 'fullscreen';

export const DIRECTION_ACTIONS: readonly DirectionAction[] = ['up', 'down', 'left', 'right'];

export function isDirection(action: Action): action is DirectionAction {
  return (DIRECTION_ACTIONS as readonly string[]).includes(action);
}

/** Which device produced the most recent input; drives the button labels (§11.4). */
export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export interface ButtonLabels {
  confirm: string;
  cancel: string;
}

/** 決定 / 戻る as written on screen for each device (Z／X, A／B, touch A／B). */
export function buttonLabels(device: InputDevice): ButtonLabels {
  switch (device) {
    case 'keyboard':
      return { confirm: 'Z', cancel: 'X' };
    case 'gamepad':
    case 'touch':
      return { confirm: 'A', cancel: 'B' };
  }
}

/**
 * The 操作ガイド line for the field HUD (`showControls`, §11.1). Touch players see
 * the on-screen pad instead, so the line is empty for them.
 */
export function controlsHint(device: InputDevice): string {
  switch (device) {
    case 'keyboard':
      return 'Z 決定・しらべる　X メニュー　Shift ダッシュ　F 全画面';
    case 'gamepad':
      return 'A 決定・しらべる　B メニュー（移動中は長押しでダッシュ）';
    case 'touch':
      return '';
  }
}

export interface InputTrackerState {
  device: InputDevice;
  /** True once a real touch has been seen; the touch pad appears from then on (§11.4). */
  touchDetected: boolean;
}

type Listener = (state: InputTrackerState) => void;

/**
 * Remembers the last device used and whether touch exists. One instance lives for
 * the whole game (every scene's InputBindings reports into it) so labels and the
 * touch pad stay consistent across scene changes.
 */
export class InputTracker {
  private state: InputTrackerState = { device: 'keyboard', touchDetected: false };
  private readonly listeners = new Set<Listener>();

  get device(): InputDevice {
    return this.state.device;
  }

  get touchDetected(): boolean {
    return this.state.touchDetected;
  }

  get snapshot(): InputTrackerState {
    return { ...this.state };
  }

  /** Records that `device` produced input; listeners run only when something changed. */
  noteDevice(device: InputDevice): void {
    const touchDetected = this.state.touchDetected || device === 'touch';
    if (device === this.state.device && touchDetected === this.state.touchDetected) return;
    this.state = { device, touchDetected };
    this.emit();
  }

  /** A touch happened somewhere (maybe outside the canvas): enable the touch UI. */
  noteTouch(): void {
    this.noteDevice('touch');
  }

  /** Subscribes; returns the unsubscribe function. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
