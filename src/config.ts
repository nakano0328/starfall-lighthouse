/** Internal render resolution. Scaled up with pixelArt rendering to fit the window. */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;

/** Grid size for field movement (one tile). */
export const TILE_SIZE = 32;

export const GAME_TITLE = 'ほしふる灯台';
export const GAME_TITLE_EN = 'Starfall Lighthouse';
export const GAME_VERSION = __APP_VERSION__;

/** Palette used by placeholder graphics until real art is dropped in. */
export const COLORS = {
  night: 0x0b1026,
  deepSea: 0x12264a,
  star: 0xffe9a3,
  starBright: 0xfff6d5,
  lighthouseWhite: 0xf4f1ea,
  lighthouseRed: 0xc8453c,
  textMain: '#f4f1ea',
  textDim: '#9aa6c8',
  textAccent: '#ffe9a3',
  textDanger: '#ff7a6b',
} as const;
