import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { DIRECTION_ACTIONS } from '@core/input/actions';
import {
  TOUCH_BUTTONS,
  TOUCH_DPAD,
  TouchMapper,
  containsPoint,
  dpadArrowCenter,
  hitTouchControl,
} from '@core/input/touch';

const button = (role: string) => {
  const b = TOUCH_BUTTONS.find((x) => x.role === role);
  if (!b) throw new Error(`no touch button ${role}`);
  return b;
};
const centerOf = (role: string): { x: number; y: number } => {
  const s = button(role).shape;
  return s.kind === 'rect' ? { x: s.x + s.w / 2, y: s.y + s.h / 2 } : { x: s.cx, y: s.cy };
};

describe('touch layout', () => {
  it('keeps every control inside the 640×360 screen', () => {
    for (const b of TOUCH_BUTTONS) {
      const s = b.shape;
      if (s.kind === 'rect') {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.y).toBeGreaterThanOrEqual(0);
        expect(s.x + s.w).toBeLessThanOrEqual(GAME_WIDTH);
        expect(s.y + s.h).toBeLessThanOrEqual(GAME_HEIGHT);
      } else {
        expect(s.cx - s.r).toBeGreaterThanOrEqual(0);
        expect(s.cy - s.r).toBeGreaterThanOrEqual(0);
        expect(s.cx + s.r).toBeLessThanOrEqual(GAME_WIDTH);
        expect(s.cy + s.r).toBeLessThanOrEqual(GAME_HEIGHT);
      }
    }
    const { center, radius } = TOUCH_DPAD;
    expect(center.x - radius).toBeGreaterThanOrEqual(0);
    expect(center.y + radius).toBeLessThanOrEqual(GAME_HEIGHT);
  });

  it('does not let the buttons overlap each other or the D-pad', () => {
    for (const a of TOUCH_BUTTONS) {
      for (const b of TOUCH_BUTTONS) {
        if (a === b) continue;
        const c = centerOf(b.role);
        expect(containsPoint(a.shape, c.x, c.y)).toBe(false);
      }
      const c = centerOf(a.role);
      expect(Math.hypot(c.x - TOUCH_DPAD.center.x, c.y - TOUCH_DPAD.center.y)).toBeGreaterThan(
        TOUCH_DPAD.radius,
      );
    }
  });

  it('hit-tests each button, the D-pad sectors and the dead centre', () => {
    for (const b of TOUCH_BUTTONS) {
      const c = centerOf(b.role);
      expect(hitTouchControl(c.x, c.y)).toEqual({ role: b.role, action: b.action });
    }
    for (const dir of DIRECTION_ACTIONS) {
      const c = dpadArrowCenter(dir);
      expect(hitTouchControl(c.x, c.y)).toEqual({ role: 'dpad', action: dir });
    }
    expect(hitTouchControl(TOUCH_DPAD.center.x, TOUCH_DPAD.center.y)).toBeNull();
    expect(hitTouchControl(GAME_WIDTH / 2, GAME_HEIGHT / 2)).toBeNull();
    expect(hitTouchControl(-1, 10)).toBeNull();
    expect(hitTouchControl(GAME_WIDTH, 10)).toBeNull();
  });

  it('MENU and B both cancel; the fullscreen box maps to fullscreen', () => {
    expect(button('menu').action).toBe('cancel');
    expect(button('b').action).toBe('cancel');
    expect(button('fullscreen').action).toBe('fullscreen');
    expect(button('fullscreen').shape).toMatchObject({ kind: 'rect', w: 32, h: 32 });
  });
});

describe('TouchMapper', () => {
  const dpad = (dir: 'up' | 'down' | 'left' | 'right') => dpadArrowCenter(dir);

  it('presses a direction and holds it until the finger lifts', () => {
    const m = new TouchMapper();
    const { x, y } = dpad('left');
    expect(m.down(1, x, y)).toEqual(['left']);
    expect(m.held.has('left')).toBe(true);
    m.up(1);
    expect(m.held.size).toBe(0);
  });

  it('follows a thumb sliding across the D-pad without new presses', () => {
    const m = new TouchMapper();
    const u = dpad('up');
    const r = dpad('right');
    m.down(1, u.x, u.y);
    m.move(1, r.x, r.y);
    expect([...m.held]).toEqual(['right']);
    // Sliding off the pad releases; sliding onto a button does nothing.
    m.move(1, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    expect(m.held.size).toBe(0);
  });

  it('A alone confirms, B alone cancels, MENU always cancels', () => {
    const m = new TouchMapper();
    const a = centerOf('a');
    const b = centerOf('b');
    const menu = centerOf('menu');
    expect(m.down(1, a.x, a.y)).toEqual(['confirm']);
    expect(m.held.has('confirm')).toBe(true);
    m.up(1);
    expect(m.down(1, b.x, b.y)).toEqual(['cancel']);
    expect(m.held.has('cancel')).toBe(true);
    m.up(1);
    const left = dpad('left');
    m.down(2, left.x, left.y);
    expect(m.down(1, menu.x, menu.y)).toEqual(['cancel']);
  });

  it('A and B pressed while a direction is held are the dash, not 決定/戻る', () => {
    const m = new TouchMapper();
    const right = dpad('right');
    const a = centerOf('a');
    const b = centerOf('b');
    m.down(1, right.x, right.y);
    expect(m.down(2, a.x, a.y)).toEqual([]);
    expect(m.down(3, b.x, b.y)).toEqual([]);
    expect(m.held.has('dash')).toBe(true);
    expect(m.held.has('right')).toBe(true);
    m.up(2);
    expect(m.held.has('dash')).toBe(false);
    expect(m.held.has('cancel')).toBe(true);
  });

  it('ignores touches outside every control and lists tracked pointers', () => {
    const m = new TouchMapper();
    expect(m.down(1, GAME_WIDTH / 2, 100)).toEqual([]);
    expect(m.pointerIds).toEqual([]);
    const a = centerOf('a');
    m.down(2, a.x, a.y);
    expect(m.pointerIds).toEqual([2]);
    m.clear();
    expect(m.pointerIds).toEqual([]);
  });
});
