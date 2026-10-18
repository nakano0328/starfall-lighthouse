import { ENEMIES } from '@data/enemies';
import type { Element } from '@data/types';

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
  | 'gate'
  | 'window'
  | 'cursor'
  | 'star'
  | 'lighthouse'
  | 'battle_bg'
  | 'enemy';

export interface ImageAsset {
  /** Static keys are listed in IMAGE_KEYS; enemy images use EnemyDef.imageKey. */
  key: string;
  src: string | null;
  placeholder: PlaceholderKind;
  /** Tint used by placeholder generators that draw a generic shape (actors, enemies). */
  tint?: number;
  /** Square size in px for generated enemy placeholders (96 × EnemyDef.scale). */
  size?: number;
}

export const IMAGE_KEYS = [
  'ts_placeholder',
  'sprite_player',
  'sprite_npc',
  'sprite_enemy',
  'obj_chest',
  'obj_sign',
  'obj_save_point',
  'obj_gate',
  'ui_window',
  'ui_cursor',
  'px_star',
  'px_lighthouse',
] as const;

export type ImageKey = (typeof IMAGE_KEYS)[number];

/** Battle backgrounds BG-01〜06 (docs/GAME_DESIGN.md §8.2 / §11.3). */
export const BATTLE_BG_KEYS = [
  'bg_coast',
  'bg_forest',
  'bg_mine',
  'bg_ruins',
  'bg_lighthouse',
  'bg_lighthouse_top',
] as const;

export type BattleBgKey = (typeof BATTLE_BG_KEYS)[number];

/** Placeholder enemy body colour by element (shadow-tagged enemies are purple). */
const ELEMENT_TINT: Record<Element, number> = {
  none: 0x8a8aa0,
  light: 0xffe9a3,
  fire: 0xe0603a,
  water: 0x3a8ae0,
  earth: 0x8a6a3a,
};

/** Base enemy sprite size; bosses scale it (§11.3: 96 / 192 / 256). */
export const ENEMY_BASE_SIZE = 96;

export const IMAGES: readonly ImageAsset[] = [
  { key: 'ts_placeholder', src: null, placeholder: 'tileset' },
  { key: 'sprite_player', src: null, placeholder: 'actor', tint: 0xf4f1ea },
  { key: 'sprite_npc', src: null, placeholder: 'actor', tint: 0xffb86b },
  { key: 'sprite_enemy', src: null, placeholder: 'actor', tint: 0xd04a6a },
  { key: 'obj_chest', src: null, placeholder: 'chest' },
  { key: 'obj_sign', src: null, placeholder: 'sign' },
  { key: 'obj_save_point', src: null, placeholder: 'save_point' },
  { key: 'obj_gate', src: null, placeholder: 'gate' },
  { key: 'ui_window', src: null, placeholder: 'window' },
  { key: 'ui_cursor', src: null, placeholder: 'cursor' },
  { key: 'px_star', src: null, placeholder: 'star' },
  { key: 'px_lighthouse', src: null, placeholder: 'lighthouse' },
  ...BATTLE_BG_KEYS.map((key): ImageAsset => ({ key, src: null, placeholder: 'battle_bg' })),
  ...ENEMIES.map((e): ImageAsset => ({
    key: e.imageKey,
    src: null,
    placeholder: 'enemy',
    tint: e.tags?.includes('shadow') ? 0x5a3a8a : ELEMENT_TINT[e.element],
    size: Math.round(ENEMY_BASE_SIZE * (e.scale ?? 1)),
  })),
];

/** Frame names on actor spritesheets (sprite_player, sprite_npc). */
export const ACTOR_FRAMES = ['down', 'up', 'left', 'right'] as const;

/** Frame names on obj_chest. */
export const CHEST_FRAMES = ['closed', 'open'] as const;

export function imageAsset(key: string): ImageAsset {
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
