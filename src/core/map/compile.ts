import { TILE_SIZE } from '@/config';
import { PLACEHOLDER_TILES, TILE_COLUMNS, TILE_ROWS, tileDef, tileGid } from '@data/tiles';

import type { LegendEntry, MapObjectSource, MapSource } from './source';
import { OVERLAY_EMPTY, normalizeLegendEntry } from './source';
import type { TiledMap, TiledObject, TiledProperty, TiledTileLayer } from './tiled';

export const PLACEHOLDER_TILESET_NAME = 'ts_placeholder';
export const COLLISION_GID = tileGid('collision');

export class MapCompileError extends Error {
  constructor(mapId: string, message: string) {
    super(`${mapId}: ${message}`);
    this.name = 'MapCompileError';
  }
}

/**
 * Compiles an ASCII map source into a Tiled-format map with the layer conventions
 * of docs/GAME_DESIGN.md §9.3 (ground / deco / above / collision / events).
 * Throws MapCompileError on any inconsistency so broken maps fail in tests.
 */
export function compileMap(src: MapSource): TiledMap {
  const id = src.meta.id;
  const { width, height } = src;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new MapCompileError(id, `invalid size ${width}x${height}`);
  }
  if (width > 64 || height > 64) throw new MapCompileError(id, `size exceeds 64x64`);

  const legend = new Map<string, LegendEntry>();
  for (const [ch, entry] of Object.entries(src.legend)) {
    if (ch.length !== 1) throw new MapCompileError(id, `legend key must be one char: "${ch}"`);
    if (ch === OVERLAY_EMPTY)
      throw new MapCompileError(id, `legend may not define "${OVERLAY_EMPTY}"`);
    const norm = normalizeLegendEntry(entry);
    for (const name of [norm.ground, norm.deco, norm.above]) {
      if (name !== undefined) tileDef(name); // throws on unknown tile
    }
    legend.set(ch, norm);
  }

  const ground = new Array<number>(width * height).fill(0);
  const deco = new Array<number>(width * height).fill(0);
  const above = new Array<number>(width * height).fill(0);
  const collision = new Array<number>(width * height).fill(0);

  const place = (entry: LegendEntry, i: number, requireGround: boolean): void => {
    if (entry.ground !== undefined) ground[i] = tileGid(entry.ground);
    else if (requireGround) throw new MapCompileError(id, `base legend entry without ground tile`);
    if (entry.deco !== undefined) deco[i] = tileGid(entry.deco);
    if (entry.above !== undefined) above[i] = tileGid(entry.above);
    const solid =
      entry.solid ??
      [entry.ground, entry.deco, entry.above].some((n) => n !== undefined && tileDef(n).solid);
    if (solid) collision[i] = COLLISION_GID;
  };

  checkGrid(id, 'tiles', src.tiles, width, height);
  src.tiles.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const entry = legend.get(ch);
      if (!entry) throw new MapCompileError(id, `unknown tile char "${ch}" at (${x}, ${y})`);
      place(entry, y * width + x, true);
    });
  });

  if (src.overlay) {
    checkGrid(id, 'overlay', src.overlay, width, height);
    src.overlay.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === OVERLAY_EMPTY) return;
        const entry = legend.get(ch);
        if (!entry) throw new MapCompileError(id, `unknown overlay char "${ch}" at (${x}, ${y})`);
        const i = y * width + x;
        // An overlay entry with only `solid: false` clears blocking (e.g. a bridge over water).
        if (entry.solid === false) collision[i] = 0;
        place(entry, i, false);
      });
    });
  }

  if (src.blocked) {
    checkGrid(id, 'blocked', src.blocked, width, height);
    src.blocked.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === 'X') collision[y * width + x] = COLLISION_GID;
      });
    });
  }

  const objects = src.objects.map((o, i) => compileObject(id, o, i + 1, width, height));

  const layer = (lid: number, name: string, data: number[], visible = true): TiledTileLayer => ({
    type: 'tilelayer',
    id: lid,
    name,
    width,
    height,
    data,
    visible,
    opacity: 1,
    x: 0,
    y: 0,
  });

  return {
    type: 'map',
    version: '1.10',
    tiledversion: 'starfall-compile',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    width,
    height,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    infinite: false,
    layers: [
      layer(1, 'ground', ground),
      layer(2, 'deco', deco),
      layer(3, 'above', above),
      layer(4, 'collision', collision, false),
      {
        type: 'objectgroup',
        id: 5,
        name: 'events',
        objects,
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        draworder: 'topdown',
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: PLACEHOLDER_TILESET_NAME,
        tilewidth: TILE_SIZE,
        tileheight: TILE_SIZE,
        tilecount: PLACEHOLDER_TILES.length,
        columns: TILE_COLUMNS,
        image: `${PLACEHOLDER_TILESET_NAME}.png`,
        imagewidth: TILE_COLUMNS * TILE_SIZE,
        imageheight: TILE_ROWS * TILE_SIZE,
        margin: 0,
        spacing: 0,
      },
    ],
    properties: [
      prop('bgm', src.meta.bgmKey),
      prop('display_name', src.meta.displayName),
      prop('entrance_x', src.meta.entrance.x),
      prop('entrance_y', src.meta.entrance.y),
      prop('battle_bg', src.meta.battleBgKey),
    ],
    nextlayerid: 6,
    nextobjectid: objects.length + 1,
  };
}

function checkGrid(id: string, name: string, rows: string[], width: number, height: number): void {
  if (rows.length !== height) {
    throw new MapCompileError(id, `${name} has ${rows.length} rows, expected ${height}`);
  }
  rows.forEach((row, y) => {
    const len = [...row].length;
    if (len !== width) {
      throw new MapCompileError(id, `${name} row ${y} has ${len} cells, expected ${width}`);
    }
  });
}

function prop(name: string, value: string | number | boolean): TiledProperty {
  const type = typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'bool' : 'int';
  return { name, type, value };
}

function compileObject(
  mapId: string,
  o: MapObjectSource,
  id: number,
  width: number,
  height: number,
): TiledObject {
  const w = 'w' in o && o.w !== undefined ? o.w : 1;
  const h = 'h' in o && o.h !== undefined ? o.h : 1;
  if (!Number.isInteger(o.x) || !Number.isInteger(o.y) || o.x < 0 || o.y < 0) {
    throw new MapCompileError(mapId, `${o.type} #${id} has invalid position (${o.x}, ${o.y})`);
  }
  if (o.x + w > width || o.y + h > height) {
    throw new MapCompileError(mapId, `${o.type} #${id} at (${o.x}, ${o.y}) is outside the map`);
  }
  const { type, x: _x, y: _y, ...rest } = o;
  const props: TiledProperty[] = [];
  for (const [key, value] of Object.entries(rest)) {
    if (key === 'w' || key === 'h' || value === undefined) continue;
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new MapCompileError(mapId, `${type} #${id} property ${key} has unsupported type`);
    }
    props.push(prop(key, value));
  }
  const name = 'id' in o ? o.id : `${type}_${id}`;
  return {
    id,
    name,
    type,
    x: o.x * TILE_SIZE,
    y: o.y * TILE_SIZE,
    width: w * TILE_SIZE,
    height: h * TILE_SIZE,
    rotation: 0,
    visible: true,
    properties: props,
  };
}
