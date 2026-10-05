/**
 * Subset of the Tiled JSON map format (orthogonal, embedded tileset) that the game
 * reads. Maps authored in src/data/maps are compiled into this shape at runtime;
 * a JSON file exported from Tiled with the conventions in docs/GAME_DESIGN.md §9.3
 * has the same shape and loads the same way.
 */
export type TiledPropertyValue = string | number | boolean;

export interface TiledProperty {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool';
  value: TiledPropertyValue;
}

export interface TiledObject {
  id: number;
  name: string;
  /** Object class (Tiled "type"/"class"): npc, warp, chest, sign, save_point, enemy, trigger. */
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  properties?: TiledProperty[];
}

export interface TiledTileLayer {
  type: 'tilelayer';
  id: number;
  name: string;
  width: number;
  height: number;
  /** Global tile ids, row-major; 0 = empty. */
  data: number[];
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  properties?: TiledProperty[];
}

export interface TiledObjectLayer {
  type: 'objectgroup';
  id: number;
  name: string;
  objects: TiledObject[];
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  draworder: 'topdown' | 'index';
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  margin: number;
  spacing: number;
}

export interface TiledMap {
  type: 'map';
  version: string;
  tiledversion?: string;
  orientation: 'orthogonal';
  renderorder: 'right-down';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite: false;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
  properties?: TiledProperty[];
  nextlayerid: number;
  nextobjectid: number;
}

export function findTileLayer(map: TiledMap, name: string): TiledTileLayer | undefined {
  return map.layers.find((l): l is TiledTileLayer => l.type === 'tilelayer' && l.name === name);
}

export function findObjectLayer(map: TiledMap, name: string): TiledObjectLayer | undefined {
  return map.layers.find((l): l is TiledObjectLayer => l.type === 'objectgroup' && l.name === name);
}

export function propertyValue(
  props: TiledProperty[] | undefined,
  name: string,
): TiledPropertyValue | undefined {
  return props?.find((p) => p.name === name)?.value;
}
