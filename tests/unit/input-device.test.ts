import { describe, expect, it } from 'vitest';

import { DEVICE_LABELS, DeviceTracker, controlsHint } from '@core/input/device';
import type { InputDevice } from '@core/input/device';

describe('DeviceTracker', () => {
  it('starts on the keyboard and its labels follow the device used last', () => {
    const tracker = new DeviceTracker();
    expect(tracker.current).toBe('keyboard');
    expect(tracker.labels).toEqual(DEVICE_LABELS.keyboard);
    tracker.use('gamepad');
    expect(tracker.labels).toEqual({ confirm: 'A', cancel: 'B' });
    tracker.use('touch');
    expect(tracker.current).toBe('touch');
  });

  it('notifies only on a change and stops after unsubscribing', () => {
    const tracker = new DeviceTracker();
    const seen: InputDevice[] = [];
    const off = tracker.onChange((device) => seen.push(device));
    tracker.use('keyboard');
    tracker.use('gamepad');
    tracker.use('gamepad');
    tracker.use('touch');
    off();
    tracker.use('keyboard');
    expect(seen).toEqual(['gamepad', 'touch']);
  });

  it('remembers whether a gamepad is connected apart from which device is in use', () => {
    const tracker = new DeviceTracker();
    expect(tracker.gamepadConnected).toBe(false);
    tracker.setGamepadConnected(true);
    expect(tracker.gamepadConnected).toBe(true);
    expect(tracker.current).toBe('keyboard');
    tracker.setGamepadConnected(false);
    expect(tracker.gamepadConnected).toBe(false);
  });
});

describe('controlsHint', () => {
  it('names the buttons of each device, with the fullscreen key on the keyboard only', () => {
    expect(controlsHint('keyboard')).toBe('Z：決定　X：戻る　F：全画面');
    expect(controlsHint('gamepad')).toBe('A：決定　B：戻る');
    expect(controlsHint('touch')).toBe('A：決定　B：戻る');
  });
});
