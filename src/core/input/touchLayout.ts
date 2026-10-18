import type { VirtualZone } from './virtualPad';

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Geometry of the touch overlay in game pixels; the values live in src/config.ts. */
export interface TouchLayout {
  /** Plus-shaped D-pad: arms of length `arm` and width `thickness` around (cx, cy). */
  dpad: { cx: number; cy: number; arm: number; thickness: number; deadRadius: number };
  a: Circle;
  b: Circle;
  menu: Rect;
  fullscreen: Rect;
}

/** What a point on the screen hits: a pad zone, the D-pad centre, the ⛶ button or nothing. */
export type TouchTarget = VirtualZone | 'dpad_center' | 'fullscreen';

export type DpadZone = 'up' | 'down' | 'left' | 'right';

export const DPAD_ZONES: readonly DpadZone[] = ['up', 'down', 'left', 'right'];

export function isDpadZone(target: TouchTarget | null): target is DpadZone {
  return target !== null && (DPAD_ZONES as readonly string[]).includes(target);
}

const inRect = (r: Rect, x: number, y: number, slop: number): boolean =>
  x >= r.x - slop && x <= r.x + r.w + slop && y >= r.y - slop && y <= r.y + r.h + slop;

const inCircle = (c: Circle, x: number, y: number, slop: number): boolean =>
  Math.hypot(x - c.cx, y - c.cy) <= c.r + slop;

/**
 * Hit-tests the overlay. The D-pad accepts its whole bounding square and picks
 * the direction by the dominant axis from the centre (a finger sliding around
 * the pad keeps a direction), except inside `deadRadius`. `slop` widens every
 * target, for a pointer that is already holding something.
 */
export function touchTargetAt(
  layout: TouchLayout,
  x: number,
  y: number,
  slop = 0,
): TouchTarget | null {
  if (inRect(layout.fullscreen, x, y, slop)) return 'fullscreen';
  if (inRect(layout.menu, x, y, slop)) return 'menu';
  if (inCircle(layout.a, x, y, slop)) return 'a';
  if (inCircle(layout.b, x, y, slop)) return 'b';

  const { cx, cy, arm, thickness, deadRadius } = layout.dpad;
  const dx = x - cx;
  const dy = y - cy;
  const half = arm + thickness / 2;
  if (Math.abs(dx) > half + slop || Math.abs(dy) > half + slop) return null;
  if (Math.hypot(dx, dy) < deadRadius) return 'dpad_center';
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** The four arm rectangles of the D-pad, for drawing. */
export function dpadArms(layout: TouchLayout): Record<'up' | 'down' | 'left' | 'right', Rect> {
  const { cx, cy, arm, thickness } = layout.dpad;
  const t = thickness;
  return {
    up: { x: cx - t / 2, y: cy - t / 2 - arm, w: t, h: arm },
    down: { x: cx - t / 2, y: cy + t / 2, w: t, h: arm },
    left: { x: cx - t / 2 - arm, y: cy - t / 2, w: arm, h: t },
    right: { x: cx + t / 2, y: cy - t / 2, w: arm, h: t },
  };
}
