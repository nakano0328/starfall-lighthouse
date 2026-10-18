import type { Facing } from '@data/types';

import type { Action } from './actions';

/**
 * Standard-gamepad mapping (docs/GAME_DESIGN.md §11.4): button indices of the
 * W3C "standard" layout. Only the buttons the game uses are listed.
 */
export const GAMEPAD_BUTTON = {
  a: 0,
  b: 1,
  lb: 4,
  rb: 5,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
} as const;

/** Left stick axes of the standard layout. */
export const GAMEPAD_AXIS = { x: 0, y: 1 } as const;

/** Stick tilt below this magnitude is ignored. */
export const AXIS_DEAD_ZONE = 0.5;
/** Button value at or above which the button counts as held (digital buttons report 0 or 1). */
export const BUTTON_THRESHOLD = 0.5;

/** Raw state of one pad as the browser reports it: button values 0..1 and axis values -1..1. */
export interface GamepadSnapshot {
  buttons: readonly number[];
  axes: readonly number[];
}

type RawInput = keyof typeof GAMEPAD_BUTTON;

const RAW_DIRECTIONS: readonly (RawInput & Facing)[] = ['up', 'down', 'left', 'right'];

/** What the pads contribute this frame, already translated into actions. */
export interface GamepadFrame {
  /** Actions currently held. B contributes `cancel` and `dash` while held. */
  held: ReadonlySet<Action>;
  /** Actions that went down this frame, in mapping order. */
  pressed: readonly Action[];
  /** True when anything on any pad is held, for last-used-device tracking. */
  active: boolean;
}

/** Directions held on a snapshot: d-pad buttons plus the left stick past the dead zone. */
export function readDirections(pad: GamepadSnapshot): Set<Facing> {
  const dirs = new Set<Facing>();
  for (const dir of RAW_DIRECTIONS) {
    if ((pad.buttons[GAMEPAD_BUTTON[dir]] ?? 0) >= BUTTON_THRESHOLD) dirs.add(dir);
  }
  const x = pad.axes[GAMEPAD_AXIS.x] ?? 0;
  const y = pad.axes[GAMEPAD_AXIS.y] ?? 0;
  if (x <= -AXIS_DEAD_ZONE) dirs.add('left');
  if (x >= AXIS_DEAD_ZONE) dirs.add('right');
  if (y <= -AXIS_DEAD_ZONE) dirs.add('up');
  if (y >= AXIS_DEAD_ZONE) dirs.add('down');
  return dirs;
}

function readRaw(pads: readonly GamepadSnapshot[]): Set<RawInput> {
  const raw = new Set<RawInput>();
  for (const pad of pads) {
    for (const name of Object.keys(GAMEPAD_BUTTON) as RawInput[]) {
      if ((pad.buttons[GAMEPAD_BUTTON[name]] ?? 0) >= BUTTON_THRESHOLD) raw.add(name);
    }
    for (const dir of readDirections(pad)) raw.add(dir);
  }
  return raw;
}

/**
 * Turns per-frame pad snapshots into held actions and press edges.
 *
 * - A: `confirm` (held and pressed).
 * - B: `cancel` and `dash` while held. A B press that lands while a direction
 *   is held is a dash start, not a `cancel` press, so dashing never opens the
 *   menu (§11.4 "B 長押し（移動中）").
 * - LB / RB: `left` / `right` presses only (menus switch tabs and pages on
 *   those); they never count as held so the field does not walk on them.
 * - Start: `cancel` (menu), a common convention beyond the §11.4 table.
 * - D-pad and left stick: directions, held and pressed.
 *
 * The first `update()` after construction or `reset()` only records the state:
 * a button already held when a scene starts (A held from the title into the
 * field) must not fire again there, matching the keyboard's auto-repeat rule.
 */
export class GamepadMapper {
  private prev = new Set<RawInput>();
  private primed = false;

  update(pads: readonly GamepadSnapshot[]): GamepadFrame {
    const raw = readRaw(pads);
    const held = new Set<Action>();
    const pressed: Action[] = [];
    const anyDirection = RAW_DIRECTIONS.some((dir) => raw.has(dir));

    for (const dir of RAW_DIRECTIONS) if (raw.has(dir)) held.add(dir);
    if (raw.has('a')) held.add('confirm');
    if (raw.has('b')) {
      held.add('cancel');
      held.add('dash');
    }
    if (raw.has('start')) held.add('cancel');

    if (this.primed) {
      const isNew = (name: RawInput): boolean => raw.has(name) && !this.prev.has(name);
      for (const dir of RAW_DIRECTIONS) if (isNew(dir)) pressed.push(dir);
      if (isNew('a')) pressed.push('confirm');
      if (isNew('b')) pressed.push(anyDirection ? 'dash' : 'cancel');
      if (isNew('lb')) pressed.push('left');
      if (isNew('rb')) pressed.push('right');
      if (isNew('start')) pressed.push('cancel');
    }
    this.primed = true;
    this.prev = raw;
    return { held, pressed, active: raw.size > 0 };
  }

  /** Forgets the previous frame; the next `update()` reports no presses. */
  reset(): void {
    this.prev.clear();
    this.primed = false;
  }
}

export type GamepadPressListener = (action: Action) => void;

/**
 * The one mapper of the whole game, sampled once per frame by the always-running
 * Touch scene. A scene that has just started gets fresh Phaser pad objects that
 * read all-zero for a frame, so a per-scene mapper would turn a button held
 * across the scene change (Start opening the menu) into a new press there. The
 * shared mapper never restarts: scenes read `isDown` and subscribe to `onPress`,
 * exactly like the virtual pad, and a press reaches only the scenes active when
 * it happened.
 */
export class SharedGamepad {
  private readonly mapper = new GamepadMapper();
  private held: ReadonlySet<Action> = new Set();
  private readonly listeners = new Set<GamepadPressListener>();

  /** Feeds this frame's snapshots; emits the presses and returns the frame. */
  update(pads: readonly GamepadSnapshot[]): GamepadFrame {
    const frame = this.mapper.update(pads);
    this.held = frame.held;
    for (const action of frame.pressed) {
      for (const listener of this.listeners) listener(action);
    }
    return frame;
  }

  isDown(action: Action): boolean {
    return this.held.has(action);
  }

  /** Subscribes to press edges; returns the unsubscribe function. */
  onPress(listener: GamepadPressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
