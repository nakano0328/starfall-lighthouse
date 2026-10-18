import { describe, expect, it } from 'vitest';

import type { GamepadSnapshot } from '@core/input/gamepad';
import { AXIS_DEADZONE, GamepadMapper, STANDARD_BUTTON, readDirections } from '@core/input/gamepad';

function snap(pressed: number[] = [], axes: number[] = [0, 0]): GamepadSnapshot {
  const buttons: boolean[] = [];
  for (const i of pressed) buttons[i] = true;
  return { buttons, axes };
}

/** A mapper that has already seen one idle frame (so edges are reported). */
function primedMapper(): GamepadMapper {
  const m = new GamepadMapper();
  m.update(snap());
  return m;
}

describe('readDirections', () => {
  it('reads the d-pad buttons', () => {
    expect([...readDirections(snap([STANDARD_BUTTON.dpadUp]))]).toEqual(['up']);
    expect([...readDirections(snap([STANDARD_BUTTON.dpadDown]))]).toEqual(['down']);
    expect([...readDirections(snap([STANDARD_BUTTON.dpadLeft]))]).toEqual(['left']);
    expect([...readDirections(snap([STANDARD_BUTTON.dpadRight]))]).toEqual(['right']);
  });

  it('reads the left stick past the dead zone only', () => {
    expect(readDirections(snap([], [AXIS_DEADZONE - 0.01, 0])).size).toBe(0);
    expect([...readDirections(snap([], [1, 0]))]).toEqual(['right']);
    expect([...readDirections(snap([], [-1, 0]))]).toEqual(['left']);
    expect([...readDirections(snap([], [0, -1]))]).toEqual(['up']);
    expect([...readDirections(snap([], [0, 0.7]))]).toEqual(['down']);
  });

  it('tolerates a pad that reports fewer buttons or axes', () => {
    expect(readDirections({ buttons: [], axes: [] }).size).toBe(0);
  });
});

describe('GamepadMapper', () => {
  it('treats buttons already down on the first frame as held, not pressed', () => {
    const m = new GamepadMapper();
    const first = m.update(snap([STANDARD_BUTTON.cancel, STANDARD_BUTTON.dpadUp]));
    expect(first.pressed).toEqual([]);
    expect(first.active).toBe(true);
    expect(m.held.has('up')).toBe(true);
    // B was down with a direction: a dash hold, never a cancel.
    expect(m.held.has('dash')).toBe(true);
    expect(m.held.has('cancel')).toBe(false);
    // Released and pressed again: now it is an edge.
    m.update(snap());
    expect(m.update(snap([STANDARD_BUTTON.cancel])).pressed).toEqual(['cancel']);
  });

  it('reset() primes again so a held button does not fire in the resumed scene', () => {
    const m = primedMapper();
    m.update(snap([STANDARD_BUTTON.cancel]));
    m.reset();
    expect(m.held.size).toBe(0);
    expect(m.update(snap([STANDARD_BUTTON.cancel])).pressed).toEqual([]);
    expect(m.held.has('cancel')).toBe(true);
  });

  it('presses A once on the down edge and holds confirm while down', () => {
    const m = primedMapper();
    const first = m.update(snap([STANDARD_BUTTON.confirm]));
    expect(first.pressed).toEqual(['confirm']);
    expect(first.active).toBe(true);
    expect(m.held.has('confirm')).toBe(true);
    const second = m.update(snap([STANDARD_BUTTON.confirm]));
    expect(second.pressed).toEqual([]);
    expect(m.held.has('confirm')).toBe(true);
    const released = m.update(snap());
    expect(released.pressed).toEqual([]);
    expect(released.active).toBe(false);
    expect(m.held.size).toBe(0);
    expect(m.update(snap([STANDARD_BUTTON.confirm])).pressed).toEqual(['confirm']);
  });

  it('presses directions on their edges and keeps them held', () => {
    const m = primedMapper();
    expect(m.update(snap([STANDARD_BUTTON.dpadLeft])).pressed).toEqual(['left']);
    expect(m.update(snap([STANDARD_BUTTON.dpadLeft])).pressed).toEqual([]);
    expect(m.held.has('left')).toBe(true);
    // Stick and d-pad are the same direction: still one press.
    expect(m.update(snap([STANDARD_BUTTON.dpadLeft], [-1, 0])).pressed).toEqual([]);
    expect(m.update(snap([], [-1, -1])).pressed).toEqual(['up']);
  });

  it('B alone cancels on the edge', () => {
    const m = primedMapper();
    expect(m.update(snap([STANDARD_BUTTON.cancel])).pressed).toEqual(['cancel']);
    expect(m.held.has('cancel')).toBe(true);
    expect(m.held.has('dash')).toBe(false);
    expect(m.update(snap([STANDARD_BUTTON.cancel])).pressed).toEqual([]);
  });

  it('B pressed while moving is a dash, not a cancel, until released', () => {
    const m = primedMapper();
    m.update(snap([STANDARD_BUTTON.dpadRight]));
    const down = m.update(snap([STANDARD_BUTTON.dpadRight, STANDARD_BUTTON.cancel]));
    expect(down.pressed).toEqual([]);
    expect(m.held.has('dash')).toBe(true);
    expect(m.held.has('cancel')).toBe(false);
    // Letting go of the direction while still holding B does not turn it into a cancel.
    m.update(snap([STANDARD_BUTTON.cancel]));
    expect(m.held.has('cancel')).toBe(false);
    expect(m.held.has('dash')).toBe(false);
    // Release and press B again, standing still: a normal cancel.
    m.update(snap());
    expect(m.update(snap([STANDARD_BUTTON.cancel])).pressed).toEqual(['cancel']);
  });

  it('B held first and then a direction still dashes', () => {
    const m = primedMapper();
    expect(m.update(snap([STANDARD_BUTTON.cancel])).pressed).toEqual(['cancel']);
    m.update(snap([STANDARD_BUTTON.cancel, STANDARD_BUTTON.dpadUp]));
    expect(m.held.has('dash')).toBe(true);
    expect(m.held.has('up')).toBe(true);
  });

  it('forgets the previous state when the pad disappears', () => {
    const m = primedMapper();
    m.update(snap([STANDARD_BUTTON.confirm]));
    expect(m.update(null)).toEqual({ pressed: [], active: false });
    expect(m.held.size).toBe(0);
    // Reconnected with A still down: held, but not a press until released and pressed again.
    expect(m.update(snap([STANDARD_BUTTON.confirm])).pressed).toEqual([]);
    expect(m.held.has('confirm')).toBe(true);
    m.update(snap());
    expect(m.update(snap([STANDARD_BUTTON.confirm])).pressed).toEqual(['confirm']);
  });
});
