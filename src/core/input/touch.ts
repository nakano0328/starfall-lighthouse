import { GAME_HEIGHT, GAME_WIDTH } from '@/config';

import type { Action, DirectionAction } from './actions';
import { isDirection } from './actions';

/**
 * On-screen touch controls (docs/GAME_DESIGN.md §11.4, UI-06): a D-pad bottom-left,
 * A/B bottom-right, MENU and the fullscreen button (⛶) top-right. The layout and
 * the pointer→action logic live here so they can be unit-tested; src/ui/TouchPad.ts
 * only draws it.
 */
export type TouchShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; cx: number; cy: number; r: number };

export type TouchRole = 'dpad' | 'a' | 'b' | 'menu' | 'fullscreen';

export interface TouchButton {
  role: Exclude<TouchRole, 'dpad'>;
  action: Action;
  shape: TouchShape;
  label: string;
}

/** D-pad geometry: four drawn arrows around `center`; hit-tested as sectors of a disc. */
export const TOUCH_DPAD = {
  center: { x: 72, y: 280 },
  /** Distance from the centre to each arrow button's centre. */
  arm: 44,
  /** Drawn size of one arrow button. */
  size: 40,
  /** Hit-test radius (a little past the arrows so thumbs may slide). */
  radius: 72,
  /** No direction inside this radius. */
  deadRadius: 10,
} as const;

export const TOUCH_BUTTONS: readonly TouchButton[] = [
  { role: 'a', action: 'confirm', shape: { kind: 'circle', cx: 598, cy: 292, r: 28 }, label: 'A' },
  { role: 'b', action: 'cancel', shape: { kind: 'circle', cx: 538, cy: 320, r: 24 }, label: 'B' },
  {
    role: 'menu',
    action: 'cancel',
    shape: { kind: 'rect', x: 520, y: 6, w: 64, h: 26 },
    label: 'MENU',
  },
  {
    role: 'fullscreen',
    action: 'fullscreen',
    shape: { kind: 'rect', x: 596, y: 4, w: 32, h: 32 },
    label: '⛶',
  },
];

/** Where each drawn D-pad arrow sits (centre), for drawing and tests. */
export function dpadArrowCenter(dir: DirectionAction): { x: number; y: number } {
  const { center, arm } = TOUCH_DPAD;
  switch (dir) {
    case 'up':
      return { x: center.x, y: center.y - arm };
    case 'down':
      return { x: center.x, y: center.y + arm };
    case 'left':
      return { x: center.x - arm, y: center.y };
    case 'right':
      return { x: center.x + arm, y: center.y };
  }
}

export interface TouchHit {
  role: TouchRole;
  action: Action;
}

export function containsPoint(shape: TouchShape, x: number, y: number): boolean {
  if (shape.kind === 'rect') {
    return x >= shape.x && x < shape.x + shape.w && y >= shape.y && y < shape.y + shape.h;
  }
  const dx = x - shape.cx;
  const dy = y - shape.cy;
  return dx * dx + dy * dy <= shape.r * shape.r;
}

/** The control under a game-space point (0〜640, 0〜360), or null. */
export function hitTouchControl(x: number, y: number): TouchHit | null {
  if (x < 0 || y < 0 || x >= GAME_WIDTH || y >= GAME_HEIGHT) return null;
  for (const button of TOUCH_BUTTONS) {
    if (containsPoint(button.shape, x, y)) return { role: button.role, action: button.action };
  }
  const dx = x - TOUCH_DPAD.center.x;
  const dy = y - TOUCH_DPAD.center.y;
  const dist = Math.hypot(dx, dy);
  if (dist > TOUCH_DPAD.radius || dist < TOUCH_DPAD.deadRadius) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return { role: 'dpad', action: dx < 0 ? 'left' : 'right' };
  return { role: 'dpad', action: dy < 0 ? 'up' : 'down' };
}

/**
 * Tracks which control each touch pointer rests on and turns that into presses
 * and a held set. `down` returns the presses to queue; `move` lets a thumb slide
 * across the D-pad (held changes, no new press); `up` releases.
 *
 * A and B pressed while a D-pad direction is held are the dash modifier, not
 * 決定/戻る (A+B together dash, §9.1). MENU always cancels (opens or closes the menu).
 */
export class TouchMapper {
  private readonly pointers = new Map<number, TouchHit>();

  /** Pointer ids currently tracked (so the owner can drop ones that vanished). */
  get pointerIds(): number[] {
    return [...this.pointers.keys()];
  }

  down(pointerId: number, x: number, y: number): Action[] {
    const hit = hitTouchControl(x, y);
    if (!hit) {
      this.pointers.delete(pointerId);
      return [];
    }
    const directionHeld = this.directionHeld(pointerId);
    this.pointers.set(pointerId, hit);
    if (hit.role === 'dpad' || hit.role === 'menu' || hit.role === 'fullscreen')
      return [hit.action];
    return directionHeld ? [] : [hit.action];
  }

  move(pointerId: number, x: number, y: number): void {
    const current = this.pointers.get(pointerId);
    if (!current) return;
    const hit = hitTouchControl(x, y);
    // Only the D-pad follows a sliding thumb; buttons stay held until lifted.
    if (current.role !== 'dpad') return;
    if (hit && hit.role === 'dpad') this.pointers.set(pointerId, hit);
    else if (!hit) this.pointers.delete(pointerId);
  }

  up(pointerId: number): void {
    this.pointers.delete(pointerId);
  }

  clear(): void {
    this.pointers.clear();
  }

  /** Actions currently down: directions, confirm (A), cancel (B), dash (A+B). */
  get held(): Set<Action> {
    const held = new Set<Action>();
    let a = false;
    let b = false;
    for (const hit of this.pointers.values()) {
      if (hit.role === 'dpad') held.add(hit.action);
      else if (hit.role === 'a') a = true;
      else if (hit.role === 'b') b = true;
    }
    if (a) held.add('confirm');
    if (b) held.add('cancel');
    if (a && b) held.add('dash');
    return held;
  }

  private directionHeld(exceptPointer: number): boolean {
    for (const [id, hit] of this.pointers) {
      if (id !== exceptPointer && hit.role === 'dpad' && isDirection(hit.action)) return true;
    }
    return false;
  }
}
