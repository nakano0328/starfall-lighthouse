import type { Action, DirectionAction } from './actions';

/**
 * Standard-mapping gamepad (W3C "standard" layout) → actions, docs/GAME_DESIGN.md
 * §11.4: A (button 0) decides, B (button 1) cancels or, held while a direction is
 * held, dashes; the d-pad (12〜15) and the left stick move.
 */
export interface GamepadSnapshot {
  /** `pressed` of each button, by standard index. Missing entries read as released. */
  buttons: readonly boolean[];
  /** Axis values −1〜1; index 0 is left-stick X, 1 is left-stick Y. */
  axes: readonly number[];
}

export const STANDARD_BUTTON = {
  confirm: 0,
  cancel: 1,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** Stick travel below this (in either direction) is treated as centred. */
export const AXIS_DEADZONE = 0.5;

export interface GamepadUpdate {
  /** Actions whose button went down this frame (edge), in a stable order. */
  pressed: Action[];
  /** True when any mapped button or direction is down: "the pad is in use". */
  active: boolean;
}

/** Raw directions read from the d-pad and the left stick. */
export function readDirections(snapshot: GamepadSnapshot): Set<DirectionAction> {
  const dirs = new Set<DirectionAction>();
  const b = (i: number): boolean => snapshot.buttons[i] ?? false;
  const x = snapshot.axes[0] ?? 0;
  const y = snapshot.axes[1] ?? 0;
  if (b(STANDARD_BUTTON.dpadUp) || y <= -AXIS_DEADZONE) dirs.add('up');
  if (b(STANDARD_BUTTON.dpadDown) || y >= AXIS_DEADZONE) dirs.add('down');
  if (b(STANDARD_BUTTON.dpadLeft) || x <= -AXIS_DEADZONE) dirs.add('left');
  if (b(STANDARD_BUTTON.dpadRight) || x >= AXIS_DEADZONE) dirs.add('right');
  return dirs;
}

const DIRECTION_ORDER: readonly DirectionAction[] = ['up', 'down', 'left', 'right'];

/**
 * Turns per-frame snapshots into presses (edges) and a held set. Create one per
 * InputBindings and call `update` once per frame; `null` means "no pad".
 *
 * The first snapshot after construction, `reset()` or a disconnect only primes the
 * state: buttons already down then are held, not pressed. Otherwise the B that
 * opened the menu would close it again in the new scene (keyboard keys get the same
 * treatment through the per-scene Key objects).
 *
 * B is both 戻る and ダッシュ: a B press that starts while a direction is held is a
 * dash modifier and never cancels, otherwise it cancels on the down edge. Either
 * way, B held together with a direction dashes (§9.1 / §11.4).
 */
export class GamepadMapper {
  private primed = false;
  private prevDirections = new Set<DirectionAction>();
  private prevConfirm = false;
  private prevCancel = false;
  /** True while the current B hold began with a direction held (dash, not cancel). */
  private cancelIsDash = false;
  private readonly heldSet = new Set<Action>();

  /** Actions currently down; valid until the next `update`. */
  get held(): ReadonlySet<Action> {
    return this.heldSet;
  }

  /** Forget the previous frame: the next `update` primes without presses (scene resume). */
  reset(): void {
    this.primed = false;
    this.prevDirections = new Set();
    this.prevConfirm = false;
    this.prevCancel = false;
    this.cancelIsDash = false;
    this.heldSet.clear();
  }

  update(snapshot: GamepadSnapshot | null): GamepadUpdate {
    const pressed: Action[] = [];
    this.heldSet.clear();
    if (!snapshot) {
      this.reset();
      return { pressed, active: false };
    }

    const edges = this.primed;
    this.primed = true;
    const directions = readDirections(snapshot);
    const confirm = snapshot.buttons[STANDARD_BUTTON.confirm] ?? false;
    const cancel = snapshot.buttons[STANDARD_BUTTON.cancel] ?? false;

    for (const dir of DIRECTION_ORDER) {
      if (!directions.has(dir)) continue;
      this.heldSet.add(dir);
      if (edges && !this.prevDirections.has(dir)) pressed.push(dir);
    }
    if (confirm) {
      this.heldSet.add('confirm');
      if (edges && !this.prevConfirm) pressed.push('confirm');
    }
    if (cancel) {
      if (!this.prevCancel) {
        this.cancelIsDash = directions.size > 0;
        if (edges && !this.cancelIsDash) pressed.push('cancel');
      }
      if (!this.cancelIsDash) this.heldSet.add('cancel');
      if (directions.size > 0) this.heldSet.add('dash');
    } else {
      this.cancelIsDash = false;
    }

    this.prevDirections = directions;
    this.prevConfirm = confirm;
    this.prevCancel = cancel;
    return { pressed, active: this.heldSet.size > 0 };
  }
}
