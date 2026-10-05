/**
 * Single registry of every image the game references.
 *
 * `src` is the path under public/assets/images/ once real art exists (Phase 6).
 * Until then it is null and BootScene generates a placeholder texture with the
 * matching `placeholder` kind, so scenes can reference keys without caring which.
 */
export type PlaceholderKind =
  | 'tileset'
  | 'actor'
  | 'chest'
  | 'sign'
  | 'save_point'
  | 'window'
  | 'cursor'
  | 'star'
  | 'lighthouse';

export interface ImageAsset {
  key: ImageKey;
  src: string | null;
  placeholder: PlaceholderKind;
  /** Tint used by placeholder generators that draw a generic shape (actors). */
  tint?: number;
}

export const IMAGE_KEYS = [
  'ts_placeholder',
  'sprite_player',
  'sprite_npc',
  'obj_chest',
  'obj_sign',
  'obj_save_point',
  'ui_window',
  'ui_cursor',
  'px_star',
  'px_lighthouse',
] as const;

export type ImageKey = (typeof IMAGE_KEYS)[number];

export const IMAGES: readonly ImageAsset[] = [
  { key: 'ts_placeholder', src: null, placeholder: 'tileset' },
  { key: 'sprite_player', src: null, placeholder: 'actor', tint: 0xf4f1ea },
  { key: 'sprite_npc', src: null, placeholder: 'actor', tint: 0xffb86b },
  { key: 'obj_chest', src: null, placeholder: 'chest' },
  { key: 'obj_sign', src: null, placeholder: 'sign' },
  { key: 'obj_save_point', src: null, placeholder: 'save_point' },
  { key: 'ui_window', src: null, placeholder: 'window' },
  { key: 'ui_cursor', src: null, placeholder: 'cursor' },
  { key: 'px_star', src: null, placeholder: 'star' },
  { key: 'px_lighthouse', src: null, placeholder: 'lighthouse' },
];

/** Frame names on actor spritesheets (sprite_player, sprite_npc). */
export const ACTOR_FRAMES = ['down', 'up', 'left', 'right'] as const;

/** Frame names on obj_chest. */
export const CHEST_FRAMES = ['closed', 'open'] as const;

export function imageAsset(key: ImageKey): ImageAsset {
  const asset = IMAGES.find((a) => a.key === key);
  if (!asset) throw new Error(`image not in manifest: ${key}`);
  return asset;
}

/** Public URL for a file under public/assets/, honouring the Vite base path. */
export function assetUrl(relative: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}assets/${relative.replace(/^\/+/, '')}`;
}
