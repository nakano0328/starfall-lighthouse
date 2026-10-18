export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

/** Button names shown in hints for 決定 / 戻る on each device (§11.4). */
export interface ButtonLabels {
  confirm: string;
  cancel: string;
}

/** The touch overlay draws its buttons as A and B (UI-06), so its labels match the pad's. */
export const DEVICE_LABELS: Record<InputDevice, ButtonLabels> = {
  keyboard: { confirm: 'Z', cancel: 'X' },
  gamepad: { confirm: 'A', cancel: 'B' },
  touch: { confirm: 'A', cancel: 'B' },
};

/**
 * The one-line 操作ガイド of the title screen (§11.1): the confirm and cancel
 * labels of the device, plus the fullscreen key where there is one.
 */
export function controlsHint(device: InputDevice): string {
  const { confirm, cancel } = DEVICE_LABELS[device];
  const parts = [`${confirm}：決定`, `${cancel}：戻る`];
  if (device === 'keyboard') parts.push('F：全画面');
  return parts.join('　');
}

export type DeviceListener = (device: InputDevice) => void;

/**
 * Remembers the last used input device so hints can follow it. Every device
 * reports through `use()` whenever it produces input; the labels switch only
 * when the device actually changes.
 */
export class DeviceTracker {
  private _current: InputDevice = 'keyboard';
  private _gamepadConnected = false;
  private readonly listeners = new Set<DeviceListener>();

  get current(): InputDevice {
    return this._current;
  }

  get labels(): ButtonLabels {
    return DEVICE_LABELS[this._current];
  }

  /** Set from the gamepad connect / disconnect events; labels still follow use. */
  get gamepadConnected(): boolean {
    return this._gamepadConnected;
  }

  setGamepadConnected(connected: boolean): void {
    this._gamepadConnected = connected;
  }

  use(device: InputDevice): void {
    if (device === this._current) return;
    this._current = device;
    for (const listener of this.listeners) listener(device);
  }

  /** Subscribes to device changes; returns the unsubscribe function. */
  onChange(listener: DeviceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
