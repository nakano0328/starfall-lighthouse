import type { Facing, MapMeta } from '@data/types';

/**
 * Map authoring format: an ASCII grid plus a legend and a list of objects.
 * See docs/ADR/0002-map-authoring.md. Compiled to Tiled JSON by compile.ts.
 */

/** What one legend character places. A bare tile name is shorthand for `{ ground }`. */
export interface LegendEntry {
  /** Tile drawn in the `ground` layer (base grid only; overlay entries may omit it). */
  ground?: string;
  /** Tile drawn in the `deco` layer (below the player). */
  deco?: string;
  /** Tile drawn in the `above` layer (over the player). */
  above?: string;
  /** Override: block movement regardless of the tiles' own `solid` flags. */
  solid?: boolean;
}

export type Legend = Record<string, string | LegendEntry>;

interface ObjectBase {
  /** Tile coordinates. */
  x: number;
  y: number;
}

export interface NpcSource extends ObjectBase {
  type: 'npc';
  id: string;
  dialog: string;
  facing: Facing;
  sprite: string;
  move?: 'static' | 'random';
  shop?: string;
  inn_price?: number;
  condition?: string;
  hidden_if?: string;
  /**
   * Head markers for quests (§14): the first entry whose `if` holds (or that has
   * no `if`) shows `text` ('！' / '？'); an empty text shows nothing.
   */
  markers?: { if?: string; text: string }[];
}

export interface WarpSource extends ObjectBase {
  type: 'warp';
  /** Size in tiles (default 1x1). */
  w?: number;
  h?: number;
  target_map: string;
  target_x: number;
  target_y: number;
  facing: Facing;
  required_item?: string;
  locked_text_id?: string;
  door_flag?: string;
}

export interface ChestSource extends ObjectBase {
  type: 'chest';
  item_id: string;
  qty: number;
  flag: string;
  tide?: 'high' | 'low' | 'any';
}

export interface SignSource extends ObjectBase {
  type: 'sign';
  text_id: string;
}

export interface SavePointSource extends ObjectBase {
  type: 'save_point';
  heal?: boolean;
  once_flag?: string;
}

export interface EnemySource extends ObjectBase {
  type: 'enemy';
  group_id: string;
  respawn_sec?: number;
  sprite?: string;
  radius?: number;
  tide?: 'high' | 'low' | 'any';
  defeated_flag?: string;
  /** Spawn only while this §9.3 condition holds (e.g. enemies appear after the core shatters). */
  condition?: string;
}

export interface TriggerSource extends ObjectBase {
  type: 'trigger';
  w?: number;
  h?: number;
  event_id: string;
  once: boolean;
  condition?: string;
}

export type MapObjectSource =
  NpcSource | WarpSource | ChestSource | SignSource | SavePointSource | EnemySource | TriggerSource;

export interface MapSource {
  meta: MapMeta;
  width: number;
  height: number;
  legend: Legend;
  /** Base grid: `height` rows of `width` characters, every cell a legend key. */
  tiles: string[];
  /** Optional overlay grid; a space means nothing, other characters are legend keys. */
  overlay?: string[];
  /** Optional extra blocking: 'X' marks a blocked cell, anything else is ignored. */
  blocked?: string[];
  objects: MapObjectSource[];
}

/** Overlay cell that places nothing. */
export const OVERLAY_EMPTY = ' ';

export function normalizeLegendEntry(entry: string | LegendEntry): LegendEntry {
  return typeof entry === 'string' ? { ground: entry } : entry;
}
