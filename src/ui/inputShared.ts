import { DeviceTracker } from '@core/input/device';
import { SharedGamepad } from '@core/input/gamepad';
import { VirtualPad } from '@core/input/virtualPad';

/**
 * Game-wide input state shared by every scene's InputBindings, the touch
 * overlay (TouchScene) and the dialog box: one virtual pad fed by the overlay,
 * one gamepad mapper sampled by the overlay scene each frame, and one tracker
 * of the last used device (§11.4).
 */
export const virtualPad = new VirtualPad();
export const sharedGamepad = new SharedGamepad();
export const deviceTracker = new DeviceTracker();
