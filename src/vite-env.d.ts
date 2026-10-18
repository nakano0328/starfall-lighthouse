/// <reference types="vite/client" />

/** Injected at build time from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface Window {
  /** Debug/E2E hook. Set by main.ts; `ready` flips to true when the title screen is up. */
  __starfall?: {
    ready: boolean;
    scene: string;
    version: string;
    /** The Phaser game instance, for debugging and e2e inspection only. */
    game?: unknown;
    /** Set to false (debug/e2e) to freeze enemy symbols so they never start a battle. */
    encounters?: boolean;
    /** Last input device used ('keyboard' | 'gamepad' | 'touch'), mirrored from INPUT_TRACKER. */
    inputDevice?: string;
    /** True once a touch has been seen and the on-screen pad is enabled. */
    touchUi?: boolean;
    /** The BGM key playing (debug/e2e), null when silent; set by src/audio/AudioPlayer.ts. */
    bgm?: string | null;
    /** The AudioPlayer instance, for debugging and e2e inspection only. */
    audio?: unknown;
  };
}
