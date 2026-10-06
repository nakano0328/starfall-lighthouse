/**
 * Placeholder tileset used until real tilesets (ts_village, ts_forest, ...) land in Phase 6.
 * The texture is generated in code (src/assets/placeholders.ts); this file only defines
 * which tile sits at which index so maps and tests can refer to tiles by name.
 *
 * Tiled GIDs are 1-based: gid = index + 1, gid 0 = empty.
 */
export interface TileDef {
  name: string;
  /** Fill colour of the placeholder tile. */
  color: number;
  /** Walking onto this tile is blocked when it appears in ground/deco/above. */
  solid: boolean;
  /** Small glyph drawn on top so tiles are distinguishable at a glance. */
  glyph?:
    | 'dots'
    | 'wave'
    | 'brick'
    | 'tree'
    | 'trunk'
    | 'rock'
    | 'flower'
    | 'fence'
    | 'door'
    | 'stairs'
    | 'plank'
    | 'cross'
    | 'star';
}

export const TILE_COLUMNS = 8;

export const PLACEHOLDER_TILES: readonly TileDef[] = [
  { name: 'grass', color: 0x3f7d3a, solid: false },
  { name: 'grass_dark', color: 0x356b31, solid: false, glyph: 'dots' },
  { name: 'path', color: 0xb59a6a, solid: false },
  { name: 'sand', color: 0xd9c58a, solid: false, glyph: 'dots' },
  { name: 'water', color: 0x2f6fb4, solid: true, glyph: 'wave' },
  { name: 'deep_water', color: 0x1f4f8a, solid: true, glyph: 'wave' },
  { name: 'wall', color: 0x6b6b70, solid: true, glyph: 'brick' },
  { name: 'wall_top', color: 0x4f4f55, solid: true },
  { name: 'floor_wood', color: 0x8a5a3b, solid: false, glyph: 'plank' },
  { name: 'floor_stone', color: 0x7d7d85, solid: false, glyph: 'brick' },
  { name: 'roof_red', color: 0xa8433a, solid: true, glyph: 'plank' },
  { name: 'roof_blue', color: 0x3b5a8a, solid: true, glyph: 'plank' },
  { name: 'tree_top', color: 0x2f6b2c, solid: false, glyph: 'tree' },
  { name: 'tree_trunk', color: 0x5a3b22, solid: true, glyph: 'trunk' },
  { name: 'rock', color: 0x8c8c8c, solid: true, glyph: 'rock' },
  { name: 'flower', color: 0x3f7d3a, solid: false, glyph: 'flower' },
  { name: 'fence', color: 0x9c7a4a, solid: true, glyph: 'fence' },
  { name: 'door', color: 0x6b4423, solid: false, glyph: 'door' },
  { name: 'stairs', color: 0x9a9aa0, solid: false, glyph: 'stairs' },
  { name: 'cliff', color: 0x5c4a3a, solid: true, glyph: 'rock' },
  { name: 'bridge', color: 0xa07a4a, solid: false, glyph: 'plank' },
  { name: 'counter', color: 0x7a4a2a, solid: true, glyph: 'plank' },
  { name: 'bed', color: 0xc05a5a, solid: true },
  { name: 'table', color: 0x8a6a3a, solid: true },
  { name: 'bookshelf', color: 0x5a3a2a, solid: true, glyph: 'brick' },
  { name: 'pier', color: 0x9a7a5a, solid: false, glyph: 'plank' },
  { name: 'lantern', color: 0x3a3a40, solid: true, glyph: 'star' },
  { name: 'rail', color: 0x6a6a70, solid: false, glyph: 'cross' },
  { name: 'ore', color: 0x6a4a8a, solid: true, glyph: 'rock' },
  { name: 'rune_floor', color: 0x4a6a8a, solid: false, glyph: 'star' },
  { name: 'void', color: 0x000000, solid: true },
  { name: 'stele', color: 0x3a5a7a, solid: true, glyph: 'star' },
  { name: 'collision', color: 0xff0040, solid: true, glyph: 'cross' },
];

export type TileName = (typeof PLACEHOLDER_TILES)[number]['name'];

const INDEX_BY_NAME = new Map(PLACEHOLDER_TILES.map((t, i) => [t.name, i] as const));

/** 0-based index inside the tileset texture. */
export function tileIndex(name: string): number {
  const i = INDEX_BY_NAME.get(name);
  if (i === undefined) throw new Error(`unknown placeholder tile: ${name}`);
  return i;
}

/** Tiled global id (1-based). */
export function tileGid(name: string): number {
  return tileIndex(name) + 1;
}

export function tileDef(name: string): TileDef {
  const def = PLACEHOLDER_TILES[tileIndex(name)];
  if (!def) throw new Error(`unknown placeholder tile: ${name}`);
  return def;
}

export const TILE_ROWS = Math.ceil(PLACEHOLDER_TILES.length / TILE_COLUMNS);
