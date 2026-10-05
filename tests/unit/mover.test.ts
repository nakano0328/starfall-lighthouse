import { describe, expect, it } from 'vitest';

import { GridMover } from '@core/grid/mover';
import type { MoverEvent } from '@core/grid/mover';

const wallAt = (bx: number, by: number) => (x: number, y: number) => x === bx && y === by;
const open = () => false;
const types = (events: MoverEvent[]): string[] => events.map((e) => e.type);

describe('GridMover', () => {
  it('starts a step when a direction is held and finishes after walkMs', () => {
    const m = new GridMover({ x: 2, y: 2, facing: 'down' }, open);
    expect(types(m.update(16, 'right', false))).toEqual(['turn', 'step_start']);
    expect(m.isMoving).toBe(true);
    expect(m.position).toEqual({ x: 3, y: 2, facing: 'right' });
    expect(m.renderPosition.x).toBeCloseTo(2 + 16 / 150, 3);
    expect(types(m.update(100, null, false))).toEqual([]);
    const done = m.update(50, null, false);
    expect(types(done)).toEqual(['step_end']);
    expect(m.isMoving).toBe(false);
    expect(m.renderPosition).toEqual({ x: 3, y: 2 });
  });

  it('dashes faster and decides the speed when the step starts', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'down' }, open);
    m.update(0, 'down', true);
    expect(types(m.update(99, null, false))).toEqual([]);
    expect(types(m.update(1, null, false))).toEqual(['step_end']);
    // Dash released mid-step does not shorten the running step either.
    m.update(0, 'down', false);
    expect(types(m.update(100, null, false))).toEqual([]);
    expect(types(m.update(50, null, false))).toEqual(['step_end']);
  });

  it('only turns and bumps once when the way is blocked', () => {
    const m = new GridMover({ x: 1, y: 1, facing: 'down' }, wallAt(2, 1));
    expect(types(m.update(16, 'right', false))).toEqual(['turn', 'bump']);
    expect(m.position).toEqual({ x: 1, y: 1, facing: 'right' });
    expect(types(m.update(16, 'right', false))).toEqual([]);
    expect(types(m.update(16, null, false))).toEqual([]);
    // Pressing again after releasing bumps again.
    expect(types(m.update(16, 'right', false))).toEqual(['bump']);
    // Turning without moving emits only a turn.
    expect(types(m.update(16, 'up', false))).toEqual(['turn', 'step_start']);
  });

  it('keeps walking without a gap while the direction is held, carrying leftover time', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'right' }, open);
    m.update(0, 'right', false);
    const events = m.update(160, 'right', false);
    expect(types(events)).toEqual(['step_end', 'step_start']);
    expect(m.position.x).toBe(2);
    // 10ms of the second step already elapsed.
    expect(m.renderPosition.x).toBeCloseTo(1 + 10 / 150, 3);
  });

  it('honours the input lead: a direction held near the end still starts the next step', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'down' }, open);
    m.update(0, 'down', false);
    m.update(100, null, false);
    // Held with 40ms left, then released before the step ends.
    m.update(10, 'down', false);
    const events = m.update(40, null, false);
    expect(types(events)).toEqual(['step_end', 'step_start']);
    expect(m.position.y).toBe(2);
  });

  it('ignores a direction held too early in the step once released', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'down' }, open);
    m.update(0, 'down', false);
    m.update(50, 'down', false);
    const events = m.update(100, null, false);
    expect(types(events)).toEqual(['step_end']);
    expect(m.position.y).toBe(1);
  });

  it('changes direction at the next tile boundary, not mid-step', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'down' }, open);
    m.update(0, 'down', false);
    m.update(75, 'right', false);
    expect(m.position).toEqual({ x: 0, y: 1, facing: 'down' });
    const events = m.update(75, 'right', false);
    expect(types(events)).toEqual(['step_end', 'turn', 'step_start']);
    expect(m.position).toEqual({ x: 1, y: 1, facing: 'right' });
  });

  it('teleports and resets motion', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'down' }, open);
    m.update(0, 'down', false);
    m.teleport({ x: 9, y: 9, facing: 'left' });
    expect(m.isMoving).toBe(false);
    expect(m.position).toEqual({ x: 9, y: 9, facing: 'left' });
    expect(m.progress).toBe(1);
  });

  it('uses a replaced blocked check (e.g. NPCs moved)', () => {
    const m = new GridMover({ x: 0, y: 0, facing: 'right' }, wallAt(1, 0));
    expect(types(m.update(16, 'right', false))).toEqual(['bump']);
    m.setBlockedCheck(open);
    m.update(16, null, false);
    expect(types(m.update(16, 'right', false))).toEqual(['step_start']);
  });
});
