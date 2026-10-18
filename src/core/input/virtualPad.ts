import type { Action } from './actions';
import { isDirection } from './actions';

/** Touch zones of the overlay (UI-06): the four D-pad arms, A, B and MENU. */
export type VirtualZone = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'menu';

export type PressListener = (action: Action) => void;

/**
 * Shared state of the on-screen touch controls (docs/GAME_DESIGN.md §11.4).
 *
 * The overlay scene feeds pointer down / move / up into it; every scene's
 * `InputBindings` reads `isDown` and subscribes to `onPress` for edges, so a tap
 * shorter than a frame is still a press. Semantics:
 *
 * - D-pad zones are the directions, A is `confirm`, B and MENU are `cancel`.
 * - A and B held together are `dash` (A＋B 同時長押し). The second button of the
 *   chord does not register its own press, so starting a dash neither
 *   interacts (A) nor opens the menu (B).
 * - A free tap outside every zone is a `confirm` press only while a text page
 *   is waiting (`tapAdvance`, set by the dialog box: タップで文字送り).
 *
 * `enabled` flips on the first touch and tells the overlay to draw itself.
 */
export class VirtualPad {
  private readonly pointers = new Map<number, VirtualZone | null>();
  private readonly listeners = new Set<PressListener>();
  private _enabled = false;
  private _tapAdvance = false;

  /** True once a touch was seen: the overlay is shown from then on. */
  get enabled(): boolean {
    return this._enabled;
  }

  enable(): void {
    this._enabled = true;
  }

  /** Whether a tap outside the buttons advances text (a dialog page is showing). */
  get tapAdvance(): boolean {
    return this._tapAdvance;
  }

  setTapAdvance(on: boolean): void {
    this._tapAdvance = on;
  }

  /** Subscribes to press edges; returns the unsubscribe function. */
  onPress(listener: PressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  isZoneHeld(zone: VirtualZone): boolean {
    for (const held of this.pointers.values()) if (held === zone) return true;
    return false;
  }

  isDown(action: Action): boolean {
    switch (action) {
      case 'confirm':
        return this.isZoneHeld('a');
      case 'cancel':
        return this.isZoneHeld('b') || this.isZoneHeld('menu');
      case 'dash':
        return this.isZoneHeld('a') && this.isZoneHeld('b');
      case 'fullscreen':
        return false;
      default:
        return this.isZoneHeld(action);
    }
  }

  /** The zone a pointer currently holds, `null` on the pad but off every zone, `undefined` if unknown. */
  zoneOf(pointerId: number): VirtualZone | null | undefined {
    return this.pointers.get(pointerId);
  }

  /** Pointer went down on `zone` (`null`: on the pad but on no zone, e.g. the D-pad centre). */
  press(pointerId: number, zone: VirtualZone | null): void {
    this.pointers.set(pointerId, null);
    this.move(pointerId, zone);
  }

  /** Pointer slid to `zone`; releases the previous zone and presses the new one. */
  move(pointerId: number, zone: VirtualZone | null): void {
    if (!this.pointers.has(pointerId)) return;
    const before = this.pointers.get(pointerId) ?? null;
    if (before === zone) return;
    this.pointers.set(pointerId, zone);
    if (zone !== null) this.emitFor(zone);
  }

  release(pointerId: number): void {
    this.pointers.delete(pointerId);
  }

  releaseAll(): void {
    this.pointers.clear();
  }

  /** A tap outside every zone. Returns true when it counted as a text-advance confirm. */
  tap(): boolean {
    if (!this._tapAdvance) return false;
    this.emit('confirm');
    return true;
  }

  private emitFor(zone: VirtualZone): void {
    if (isDirection(zone)) {
      this.emit(zone);
    } else if (zone === 'a') {
      // The second button of the A+B chord starts a dash, not an interaction.
      if (!this.isZoneHeld('b')) this.emit('confirm');
    } else if (zone === 'b') {
      if (!this.isZoneHeld('a')) this.emit('cancel');
    } else {
      this.emit('cancel');
    }
  }

  private emit(action: Action): void {
    for (const listener of this.listeners) listener(action);
  }
}
