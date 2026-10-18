import { describe, expect, it } from 'vitest';

import {
  AXIS_DEAD_ZONE,
  GAMEPAD_BUTTON,
  GamepadMapper,
  SharedGamepad,
  readDirections,
} from '@core/input/gamepad';
import type { GamepadSnapshot } from '@core/input/gamepad';
import type { Action } from '@core/input/actions';

const BUTTON_COUNT = 17;

/** A standard-layout pad with the given buttons fully pressed. */
function snapshot(held: number[] = [], axes: number[] = [0, 0]): GamepadSnapshot {
  const buttons = new Array<number>(BUTTON_COUNT).fill(0);
  for (const index of held) buttons[index] = 1;
  return { buttons, axes };
}

const { a, b, lb, rb, start, up, down, left, right } = GAMEPAD_BUTTON;

describe('readDirections', () => {
  it('reads the d-pad buttons', () => {
    expect([...readDirections(snapshot([up, left]))].sort()).toEqual(['left', 'up']);
    expect([...readDirections(snapshot([down, right]))].sort()).toEqual(['down', 'right']);
  });

  it('reads the left stick only past the dead zone', () => {
    expect([...readDirections(snapshot([], [AXIS_DEAD_ZONE, 0]))]).toEqual(['right']);
    expect([...readDirections(snapshot([], [-1, -AXIS_DEAD_ZONE]))].sort()).toEqual(['left', 'up']);
    expect([...readDirections(snapshot([], [0, 1]))]).toEqual(['down']);
    expect(readDirections(snapshot([], [0.3, -0.3])).size).toBe(0);
  });

  it('treats missing buttons and axes as released', () => {
    expect(readDirections({ buttons: [], axes: [] }).size).toBe(0);
  });
});

describe('GamepadMapper', () => {
  it('only records the state on the first sample: a button held into a new scene does not fire', () => {
    const mapper = new GamepadMapper();
    const first = mapper.update([snapshot([a])]);
    expect(first.pressed).toEqual([]);
    expect(first.held.has('confirm')).toBe(true);
    expect(first.active).toBe(true);
    expect(mapper.update([snapshot([a])]).pressed).toEqual([]);
    mapper.update([snapshot()]);
    expect(mapper.update([snapshot([a])]).pressed).toEqual(['confirm']);
  });

  it('maps A to confirm, B to cancel and dash, Start to cancel', () => {
    const mapper = new GamepadMapper();
    mapper.update([snapshot()]);
    const frame = mapper.update([snapshot([b])]);
    expect(frame.pressed).toEqual(['cancel']);
    expect(frame.held.has('cancel')).toBe(true);
    expect(frame.held.has('dash')).toBe(true);
    expect(frame.held.has('confirm')).toBe(false);
    mapper.update([snapshot()]);
    expect(mapper.update([snapshot([start])]).pressed).toEqual(['cancel']);
    expect(mapper.update([snapshot([start])]).held.has('cancel')).toBe(true);
  });

  it('a B press while a direction is held starts a dash instead of cancelling', () => {
    const mapper = new GamepadMapper();
    mapper.update([snapshot([right])]);
    const frame = mapper.update([snapshot([right, b])]);
    expect(frame.pressed).toEqual(['dash']);
    expect(frame.held.has('dash')).toBe(true);
    expect(frame.held.has('right')).toBe(true);
  });

  it('LB and RB press left and right without holding them', () => {
    const mapper = new GamepadMapper();
    mapper.update([snapshot()]);
    const frame = mapper.update([snapshot([lb, rb])]);
    expect(frame.pressed).toEqual(['left', 'right']);
    expect(frame.held.has('left')).toBe(false);
    expect(frame.held.has('right')).toBe(false);
    expect(frame.active).toBe(true);
  });

  it('directions are held and pressed from the d-pad and the stick alike', () => {
    const mapper = new GamepadMapper();
    mapper.update([snapshot()]);
    const frame = mapper.update([snapshot([down], [-1, 0])]);
    expect(frame.pressed).toEqual(['down', 'left']);
    expect(frame.held.has('down')).toBe(true);
    expect(frame.held.has('left')).toBe(true);
    // Held on, nothing new.
    expect(mapper.update([snapshot([down], [-1, 0])]).pressed).toEqual([]);
  });

  it('merges several pads and reports idle when none is touched', () => {
    const mapper = new GamepadMapper();
    mapper.update([snapshot(), snapshot()]);
    const frame = mapper.update([snapshot([a]), snapshot([up])]);
    expect(frame.pressed).toEqual(['up', 'confirm']);
    expect(mapper.update([snapshot(), snapshot()]).active).toBe(false);
    expect(mapper.update([]).active).toBe(false);
  });

  it('reset() forgets the previous frame so the next sample reports no presses', () => {
    const mapper = new GamepadMapper();
    mapper.update([snapshot()]);
    mapper.reset();
    expect(mapper.update([snapshot([a])]).pressed).toEqual([]);
    expect(mapper.update([snapshot([a])]).pressed).toEqual([]);
    mapper.update([snapshot()]);
    expect(mapper.update([snapshot([a])]).pressed).toEqual(['confirm']);
  });
});

describe('SharedGamepad', () => {
  it('emits the presses of each frame to its listeners and keeps the held set', () => {
    const shared = new SharedGamepad();
    const log: Action[] = [];
    const off = shared.onPress((action) => log.push(action));
    shared.update([snapshot()]);
    const frame = shared.update([snapshot([a, left])]);
    expect(frame.pressed).toEqual(['left', 'confirm']);
    expect(log).toEqual(['left', 'confirm']);
    expect(shared.isDown('confirm')).toBe(true);
    expect(shared.isDown('left')).toBe(true);
    expect(shared.isDown('cancel')).toBe(false);
    shared.update([snapshot()]);
    expect(shared.isDown('confirm')).toBe(false);
    off();
    shared.update([snapshot([b])]);
    expect(log).toEqual(['left', 'confirm']);
  });

  it('a button held through a listener change fires nowhere twice', () => {
    const shared = new SharedGamepad();
    shared.update([snapshot()]);
    const first: Action[] = [];
    const offFirst = shared.onPress((action) => first.push(action));
    shared.update([snapshot([start])]);
    offFirst();
    // A new scene subscribes while Start is still held: no press for it.
    const second: Action[] = [];
    shared.onPress((action) => second.push(action));
    shared.update([snapshot([start])]);
    shared.update([snapshot()]);
    expect(first).toEqual(['cancel']);
    expect(second).toEqual([]);
    expect(shared.isDown('cancel')).toBe(false);
  });
});
