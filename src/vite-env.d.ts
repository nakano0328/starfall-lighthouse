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
  };
}
