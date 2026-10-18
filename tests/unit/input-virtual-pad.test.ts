import { describe, expect, it } from 'vitest';

import { isDirection } from '@core/input/actions';
import type { Action } from '@core/input/actions';
import { VirtualPad } from '@core/input/virtualPad';

function padWithLog(): { pad: VirtualPad; log: Action[] } {
  const pad = new VirtualPad();
  const log: Action[] = [];
  pad.onPress((action) => log.push(action));
  return { pad, log };
}

describe('isDirection', () => {
  it('accepts the four directions and nothing else', () => {
    expect(isDirection('up')).toBe(true);
    expect(isDirection('right')).toBe(true);
    expect(isDirection('a')).toBe(false);
    expect(isDirection('confirm')).toBe(false);
  });
});

describe('VirtualPad', () => {
  it('starts hidden and is shown once enabled', () => {
    const pad = new VirtualPad();
    expect(pad.enabled).toBe(false);
    pad.enable();
    expect(pad.enabled).toBe(true);
  });

  it('D-pad zones press and hold their direction until released', () => {
    const { pad, log } = padWithLog();
    pad.press(1, 'left');
    expect(log).toEqual(['left']);
    expect(pad.isDown('left')).toBe(true);
    expect(pad.isZoneHeld('left')).toBe(true);
    pad.release(1);
    expect(pad.isDown('left')).toBe(false);
    expect(pad.zoneOf(1)).toBeUndefined();
  });

  it('A is confirm, B and MENU are cancel', () => {
    const { pad, log } = padWithLog();
    pad.press(1, 'a');
    expect(pad.isDown('confirm')).toBe(true);
    pad.release(1);
    pad.press(2, 'b');
    expect(pad.isDown('cancel')).toBe(true);
    pad.release(2);
    pad.press(3, 'menu');
    expect(pad.isDown('cancel')).toBe(true);
    pad.release(3);
    expect(log).toEqual(['confirm', 'cancel', 'cancel']);
    expect(pad.isDown('cancel')).toBe(false);
  });

  it('A and B held together are a dash and the second button is not a press of its own', () => {
    const { pad, log } = padWithLog();
    pad.press(1, 'a');
    pad.press(2, 'b');
    expect(log).toEqual(['confirm']);
    expect(pad.isDown('dash')).toBe(true);
    pad.release(1);
    expect(pad.isDown('dash')).toBe(false);
    pad.release(2);

    pad.press(3, 'b');
    pad.press(4, 'a');
    expect(log).toEqual(['confirm', 'cancel']);
    expect(pad.isDown('dash')).toBe(true);
  });

  it('sliding between zones releases the old one and presses the new one once', () => {
    const { pad, log } = padWithLog();
    pad.press(1, 'up');
    pad.move(1, 'up');
    expect(log).toEqual(['up']);
    pad.move(1, 'right');
    expect(log).toEqual(['up', 'right']);
    expect(pad.isDown('up')).toBe(false);
    expect(pad.isDown('right')).toBe(true);
    pad.move(1, null);
    expect(pad.isDown('right')).toBe(false);
    expect(pad.zoneOf(1)).toBeNull();
    pad.move(1, 'right');
    expect(log).toEqual(['up', 'right', 'right']);
    // An unknown pointer is ignored.
    pad.move(9, 'a');
    expect(log).toEqual(['up', 'right', 'right']);
    expect(pad.isDown('confirm')).toBe(false);
  });

  it('a press on no zone (the D-pad centre) holds nothing but tracks the pointer', () => {
    const { pad, log } = padWithLog();
    pad.press(1, null);
    expect(pad.zoneOf(1)).toBeNull();
    expect(pad.zoneOf(2)).toBeUndefined();
    expect(log).toEqual([]);
    pad.move(1, 'down');
    expect(log).toEqual(['down']);
    expect(pad.isDown('down')).toBe(true);
  });

  it('a free tap is a confirm only while a text page waits', () => {
    const { pad, log } = padWithLog();
    expect(pad.tapAdvance).toBe(false);
    expect(pad.tap()).toBe(false);
    expect(log).toEqual([]);
    pad.setTapAdvance(true);
    expect(pad.tap()).toBe(true);
    expect(log).toEqual(['confirm']);
    pad.setTapAdvance(false);
    expect(pad.tap()).toBe(false);
  });

  it('releaseAll drops every pointer and fullscreen is never held', () => {
    const { pad } = padWithLog();
    pad.press(1, 'a');
    pad.press(2, 'left');
    pad.releaseAll();
    expect(pad.isDown('confirm')).toBe(false);
    expect(pad.isDown('left')).toBe(false);
    expect(pad.isDown('fullscreen')).toBe(false);
  });

  it('unsubscribing stops the listener', () => {
    const pad = new VirtualPad();
    const log: Action[] = [];
    const off = pad.onPress((action) => log.push(action));
    pad.press(1, 'a');
    off();
    pad.release(1);
    pad.press(1, 'a');
    expect(log).toEqual(['confirm']);
  });
});
