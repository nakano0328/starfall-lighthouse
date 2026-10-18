import { describe, expect, it } from 'vitest';

import { TOUCH_UI } from '@/config';
import { DPAD_ZONES, dpadArms, isDpadZone, touchTargetAt } from '@core/input/touchLayout';

const at = (x: number, y: number, slop?: number) => touchTargetAt(TOUCH_UI, x, y, slop);
const { cx, cy, arm, thickness, deadRadius } = TOUCH_UI.dpad;
const half = arm + thickness / 2;

describe('touchTargetAt', () => {
  it('hits the buttons at their centres', () => {
    expect(at(TOUCH_UI.a.cx, TOUCH_UI.a.cy)).toBe('a');
    expect(at(TOUCH_UI.b.cx, TOUCH_UI.b.cy)).toBe('b');
    const m = TOUCH_UI.menu;
    expect(at(m.x + m.w / 2, m.y + m.h / 2)).toBe('menu');
    const f = TOUCH_UI.fullscreen;
    expect(at(f.x + f.w / 2, f.y + f.h / 2)).toBe('fullscreen');
  });

  it('picks the D-pad arm by the dominant axis and the hub inside the dead radius', () => {
    expect(at(cx - arm, cy)).toBe('left');
    expect(at(cx + arm, cy)).toBe('right');
    expect(at(cx, cy - arm)).toBe('up');
    expect(at(cx, cy + arm)).toBe('down');
    // Off the arms but inside the bounding square: still the dominant direction.
    expect(at(cx - 30, cy + 25)).toBe('left');
    expect(at(cx + 5, cy + 30)).toBe('down');
    expect(at(cx + 3, cy - 2)).toBe('dpad_center');
    expect(at(cx + deadRadius, cy)).toBe('right');
  });

  it('returns null off every target and slop widens them', () => {
    expect(at(320, 180)).toBeNull();
    expect(at(0, 0)).toBeNull();
    const edge = TOUCH_UI.a.cx + TOUCH_UI.a.r + 10;
    expect(at(edge, TOUCH_UI.a.cy)).toBeNull();
    expect(at(edge, TOUCH_UI.a.cy, TOUCH_UI.slop)).toBe('a');
    expect(at(cx + half + 1, cy)).toBeNull();
    expect(at(cx + half + 1, cy, TOUCH_UI.slop)).toBe('right');
    expect(at(cx, cy - half - 1)).toBeNull();
    expect(at(cx, cy - half - 1, TOUCH_UI.slop)).toBe('up');
  });
});

describe('dpadArms', () => {
  it('lays the four arms around the hub', () => {
    const arms = dpadArms(TOUCH_UI);
    expect(arms.up).toEqual({ x: cx - thickness / 2, y: cy - half, w: thickness, h: arm });
    expect(arms.down.y).toBe(cy + thickness / 2);
    expect(arms.down.y + arms.down.h).toBe(cy + half);
    expect(arms.left).toEqual({ x: cx - half, y: cy - thickness / 2, w: arm, h: thickness });
    expect(arms.right.x + arms.right.w).toBe(cx + half);
  });
});

describe('isDpadZone', () => {
  it('accepts the four arms only', () => {
    for (const zone of DPAD_ZONES) expect(isDpadZone(zone)).toBe(true);
    expect(isDpadZone('a')).toBe(false);
    expect(isDpadZone('dpad_center')).toBe(false);
    expect(isDpadZone(null)).toBe(false);
  });
});
