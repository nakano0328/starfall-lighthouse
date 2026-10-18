import { describe, expect, it } from 'vitest';

import {
  DIRECTION_ACTIONS,
  InputTracker,
  buttonLabels,
  controlsHint,
  isDirection,
} from '@core/input/actions';

describe('input actions', () => {
  it('knows which actions are directions', () => {
    for (const dir of DIRECTION_ACTIONS) expect(isDirection(dir)).toBe(true);
    expect(isDirection('confirm')).toBe(false);
    expect(isDirection('dash')).toBe(false);
  });

  it('labels 決定/戻る per device (§11.4)', () => {
    expect(buttonLabels('keyboard')).toEqual({ confirm: 'Z', cancel: 'X' });
    expect(buttonLabels('gamepad')).toEqual({ confirm: 'A', cancel: 'B' });
    expect(buttonLabels('touch')).toEqual({ confirm: 'A', cancel: 'B' });
  });

  it('writes a controls hint for keyboard and gamepad but not for touch', () => {
    expect(controlsHint('keyboard')).toContain('Z');
    expect(controlsHint('keyboard')).toContain('Shift');
    expect(controlsHint('gamepad')).toContain('A');
    expect(controlsHint('gamepad')).not.toContain('Z');
    expect(controlsHint('touch')).toBe('');
  });
});

describe('InputTracker', () => {
  it('starts on the keyboard with no touch seen', () => {
    const t = new InputTracker();
    expect(t.snapshot).toEqual({ device: 'keyboard', touchDetected: false });
  });

  it('switches devices and notifies only on change', () => {
    const t = new InputTracker();
    const seen: string[] = [];
    const off = t.onChange((s) => seen.push(`${s.device}:${s.touchDetected}`));
    t.noteDevice('keyboard');
    t.noteDevice('gamepad');
    t.noteDevice('gamepad');
    t.noteDevice('keyboard');
    expect(seen).toEqual(['gamepad:false', 'keyboard:false']);
    off();
    t.noteDevice('gamepad');
    expect(seen).toHaveLength(2);
  });

  it('remembers touch once seen, even after switching back to the keyboard', () => {
    const t = new InputTracker();
    t.noteTouch();
    expect(t.device).toBe('touch');
    expect(t.touchDetected).toBe(true);
    t.noteDevice('keyboard');
    expect(t.device).toBe('keyboard');
    expect(t.touchDetected).toBe(true);
  });
});
