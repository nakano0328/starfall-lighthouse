import Phaser from 'phaser';

import { COLORS, TOUCH_UI } from '@/config';
import type { InputDevice } from '@core/input/device';
import type { GamepadSnapshot } from '@core/input/gamepad';
import { dpadArms, isDpadZone, touchTargetAt } from '@core/input/touchLayout';
import type { TouchTarget } from '@core/input/touchLayout';
import type { VirtualZone } from '@core/input/virtualPad';
import { InputBindings } from '@ui/InputBindings';
import { deviceTracker, sharedGamepad, virtualPad } from '@ui/inputShared';

import { SceneKey } from './keys';

const ZONES: readonly VirtualZone[] = ['up', 'down', 'left', 'right', 'a', 'b', 'menu'];

/** What a pointer went down on: the D-pad as a whole, or one button. It only slides within that. */
type Origin = 'dpad' | 'a' | 'b' | 'menu';

const LABEL_COLOR = `#${COLORS.night.toString(16).padStart(6, '0')}`;
const LABEL_ALPHA = 0.9;
/** The ⛶ button's corner marks: inset from the frame and arm length, in pixels. */
const FULLSCREEN_MARK = { inset: 7, arm: 7 } as const;

/** Whether the device reports a touch screen (§11.4: `navigator.maxTouchPoints > 0`). */
function hasTouchScreen(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

/** The zone a sliding pointer holds now, given what it went down on. */
function zoneFor(origin: Origin, target: TouchTarget | null): VirtualZone | null {
  if (origin === 'dpad') return isDpadZone(target) ? target : null;
  return target === origin ? origin : null;
}

/**
 * On-screen touch controls and the fullscreen toggle (docs/GAME_DESIGN.md
 * §11.4, UI-06). Boot launches it once; it is listed last so it draws above
 * every other scene and is never stopped.
 *
 * Pointer events feed the shared `virtualPad`, which every scene's
 * `InputBindings` reads. The overlay stays hidden until the first touch on a
 * touch screen; that touch only reveals it. A finger that went down on the
 * D-pad keeps steering as it slides between the arms, a finger on a button
 * releases it when it slides off (and presses again on the way back). A tap on
 * no control is a free tap: it turns dialog pages and shortens battle messages
 * while one is waiting. The ⛶ button and the F key toggle fullscreen; the
 * button is drawn only where the Fullscreen API exists.
 *
 * Gamepads are sampled here too, once per frame for the whole game: this
 * scene's Phaser pads live as long as the game, whereas a scene that has just
 * started gets fresh ones that read all-zero for a frame (see SharedGamepad).
 * Listed last, it steps after the other scenes, so a pad press reaches them
 * on the next frame. The scene also publishes the last used device
 * (`window.__starfall.inputDevice`) and records gamepad connections (§11.4).
 */
export class TouchScene extends Phaser.Scene {
  private input2!: InputBindings;
  private overlay!: Phaser.GameObjects.Container;
  private shapes!: Record<VirtualZone, Phaser.GameObjects.Graphics>;
  private fullscreenButton: Phaser.GameObjects.Graphics | undefined;
  private readonly origins = new Map<number, Origin>();

  constructor() {
    super(SceneKey.Touch);
  }

  create(): void {
    this.input2 = new InputBindings(this);
    this.overlay = this.add.container(0, 0).setVisible(false);
    this.shapes = this.drawPad();
    if (this.scale.fullscreen.available) this.fullscreenButton = this.drawFullscreenButton();

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPointerUp, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.releaseAll, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.releaseAll, this);

    const pads = this.input.gamepad;
    if (pads) {
      pads.on(Phaser.Input.Gamepad.Events.CONNECTED, () => deviceTracker.setGamepadConnected(true));
      pads.on(Phaser.Input.Gamepad.Events.DISCONNECTED, () =>
        deviceTracker.setGamepadConnected(false),
      );
    }

    this.publishDevice(deviceTracker.current);
    const unsubscribe = deviceTracker.onChange((device) => this.publishDevice(device));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      this.game.events.off(Phaser.Core.Events.BLUR, this.releaseAll, this);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.releaseAll, this);
      this.releaseAll();
      this.input2.destroy();
    });
  }

  override update(): void {
    this.sampleGamepads();
    if (this.input2.justPressed('fullscreen')) this.toggleFullscreen();
    const show = virtualPad.enabled;
    if (this.overlay.visible !== show) this.overlay.setVisible(show);
    if (!show) return;
    for (const zone of ZONES) {
      this.shapes[zone].setAlpha(virtualPad.isZoneHeld(zone) ? TOUCH_UI.alphaHeld : TOUCH_UI.alpha);
    }
  }

  /** e2e/debug: whether the overlay has been revealed by a touch. */
  get overlayEnabled(): boolean {
    return virtualPad.enabled;
  }

  /** e2e/debug: zones held by some pointer right now. */
  get heldZones(): VirtualZone[] {
    return ZONES.filter((zone) => virtualPad.isZoneHeld(zone));
  }

  /** e2e/debug: the ⛶ button exists (the Fullscreen API is available). */
  get fullscreenButtonShown(): boolean {
    return this.fullscreenButton !== undefined;
  }

  /** e2e/debug: the input device used last. */
  get device(): InputDevice {
    return deviceTracker.current;
  }

  private sampleGamepads(): void {
    const plugin = this.input.gamepad;
    if (!plugin) return;
    const pads: GamepadSnapshot[] = plugin.getAll().map((pad) => ({
      buttons: pad.buttons.map((b) => b.value),
      axes: pad.axes.map((a) => a.value),
    }));
    if (sharedGamepad.update(pads).active) deviceTracker.use('gamepad');
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.wasTouch) {
      deviceTracker.use('touch');
      if (!virtualPad.enabled) {
        // The first touch only reveals the overlay: nobody could have aimed at it yet.
        if (hasTouchScreen()) virtualPad.enable();
        return;
      }
    } else if (!virtualPad.enabled) {
      return;
    }
    let target = touchTargetAt(TOUCH_UI, pointer.x, pointer.y);
    if (target === 'fullscreen') {
      if (this.fullscreenButton) {
        this.toggleFullscreen();
        return;
      }
      target = null;
    }
    if (target === null) {
      virtualPad.tap();
      return;
    }
    if (target === 'dpad_center') {
      this.origins.set(pointer.id, 'dpad');
      virtualPad.press(pointer.id, null);
      return;
    }
    this.origins.set(pointer.id, isDpadZone(target) ? 'dpad' : target);
    virtualPad.press(pointer.id, target);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const origin = this.origins.get(pointer.id);
    if (origin === undefined || !pointer.isDown) return;
    const target = touchTargetAt(TOUCH_UI, pointer.x, pointer.y, TOUCH_UI.slop);
    virtualPad.move(pointer.id, zoneFor(origin, target));
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.origins.delete(pointer.id)) return;
    virtualPad.release(pointer.id);
  }

  private releaseAll(): void {
    this.origins.clear();
    virtualPad.releaseAll();
  }

  private toggleFullscreen(): void {
    if (!this.scale.fullscreen.available) return;
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  }

  private publishDevice(device: InputDevice): void {
    if (window.__starfall) window.__starfall.inputDevice = device;
  }

  private drawPad(): Record<VirtualZone, Phaser.GameObjects.Graphics> {
    const shape = (draw: (g: Phaser.GameObjects.Graphics) => void): Phaser.GameObjects.Graphics => {
      const g = this.add.graphics();
      g.fillStyle(TOUCH_UI.color, 1);
      draw(g);
      g.setAlpha(TOUCH_UI.alpha);
      this.overlay.add(g);
      return g;
    };
    const rect = (r: { x: number; y: number; w: number; h: number }) =>
      shape((g) => g.fillRect(r.x, r.y, r.w, r.h));
    const circle = (c: { cx: number; cy: number; r: number }) =>
      shape((g) => g.fillCircle(c.cx, c.cy, c.r));

    // The hub between the arms is the D-pad's dead centre: drawn once, never highlighted.
    const { cx, cy, thickness } = TOUCH_UI.dpad;
    rect({ x: cx - thickness / 2, y: cy - thickness / 2, w: thickness, h: thickness });
    const arms = dpadArms(TOUCH_UI);
    const shapes = {
      up: rect(arms.up),
      down: rect(arms.down),
      left: rect(arms.left),
      right: rect(arms.right),
      a: circle(TOUCH_UI.a),
      b: circle(TOUCH_UI.b),
      menu: rect(TOUCH_UI.menu),
    };
    this.label(TOUCH_UI.a.cx, TOUCH_UI.a.cy, 'A', 16);
    this.label(TOUCH_UI.b.cx, TOUCH_UI.b.cy, 'B', 14);
    const m = TOUCH_UI.menu;
    this.label(m.x + m.w / 2, m.y + m.h / 2, 'MENU', 12);
    return shapes;
  }

  private label(x: number, y: number, text: string, size: number): void {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: `${size}px`,
        fontStyle: 'bold',
        color: LABEL_COLOR,
      })
      .setOrigin(0.5)
      .setAlpha(LABEL_ALPHA);
    this.overlay.add(label);
  }

  /** ⛶ drawn in code (§11.4): a 32×32 frame with an L-shaped mark in each corner. */
  private drawFullscreenButton(): Phaser.GameObjects.Graphics {
    const { x, y, w, h } = TOUCH_UI.fullscreen;
    const { inset, arm } = FULLSCREEN_MARK;
    const g = this.add.graphics();
    g.lineStyle(2, TOUCH_UI.color, 1);
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    const corners: readonly (readonly [number, number, 1 | -1, 1 | -1])[] = [
      [x + inset, y + inset, 1, 1],
      [x + w - inset, y + inset, -1, 1],
      [x + inset, y + h - inset, 1, -1],
      [x + w - inset, y + h - inset, -1, -1],
    ];
    g.beginPath();
    for (const [px, py, sx, sy] of corners) {
      g.moveTo(px, py + sy * arm);
      g.lineTo(px, py);
      g.lineTo(px + sx * arm, py);
    }
    g.strokePath();
    g.setAlpha(TOUCH_UI.alpha);
    this.overlay.add(g);
    return g;
  }
}
