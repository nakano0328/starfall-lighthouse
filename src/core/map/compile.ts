import { TILE_SIZE } from '@/config';
import { PLACEHOLDER_TILES, TILE_COLUMNS, TILE_ROWS, tileDef, tileGid } from '@data/tiles';

import type { LegendEntry, MapObjectSource, MapSource, TideLevel } from './source';
import { OVERLAY_EMPTY, TIDE_LEVELS, normalizeLegendEntry } from './source';
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
 * of docs/GAME_DESIGN.md §9.3 (ground / deco / above / collision / events). A tide-aware
 * map (§3.2) also gets `deco_water_high` / `deco_water_low` and `collision_high` /
 * `collision_low` from its `tide` grids. Throws MapCompileError on any inconsistency so
 * broken maps fail in tests.
 */
export function compileMap(src: MapSource): TiledMap {
  const id = src.meta.id;
  const { width, height } = src;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new MapCompileError(id, `invalid size ${width}x${height}`);
  }
  if (width > 64 || height > 64) throw new MapCompileError(id, `size exceeds 64x64`);

  const { x: ex, y: ey } = src.meta.entrance;
  if (!Number.isInteger(ex) || !Number.isInteger(ey) || ex < 0 || ey < 0) {
    throw new MapCompileError(id, `invalid entrance (${ex}, ${ey})`);
  }
  if (ex >= width || ey >= height) {
    throw new MapCompileError(id, `entrance (${ex}, ${ey}) is outside the map`);
  }

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

  const cells = width * height;
  const ground = new Array<number>(cells).fill(0);
  const deco = new Array<number>(cells).fill(0);
  const above = new Array<number>(cells).fill(0);
  /** Per-cell `solid` override; the last legend entry placed on a cell that declares one wins. */
  const solidOverride = new Array<boolean | undefined>(cells).fill(undefined);

  const place = (entry: LegendEntry, i: number, requireGround: boolean): void => {
    if (entry.ground !== undefined) ground[i] = tileGid(entry.ground);
    else if (requireGround) throw new MapCompileError(id, `base legend entry without ground tile`);
    if (entry.deco !== undefined) deco[i] = tileGid(entry.deco);
    if (entry.above !== undefined) above[i] = tileGid(entry.above);
    if (entry.solid !== undefined) solidOverride[i] = entry.solid;
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
        place(entry, y * width + x, false);
      });
    });
  }

  // Collision is derived from the final tiles of each cell, i.e. after the overlay has replaced
  // whatever the base grid put there: a path drawn over water becomes walkable, a rock dropped
  // on grass blocks. A legend `solid` overrides the tiles' flags; `blocked` is applied last.
  const collision = ground.map((g, i) => {
    const solid =
      solidOverride[i] ?? (isSolidGid(g) || isSolidGid(deco[i] ?? 0) || isSolidGid(above[i] ?? 0));
    return solid ? COLLISION_GID : 0;
  });

  if (src.blocked) {
    checkGrid(id, 'blocked', src.blocked, width, height);
    src.blocked.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === 'X') collision[y * width + x] = COLLISION_GID;
      });
    });
  }

  const objects = src.objects.map((o, i) => compileObject(id, o, i + 1, width, height));

  const tideLayers = compileTide(src, legend);

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
      ...(tideLayers
        ? [
            layer(6, 'deco_water_high', tideLayers.high.deco),
            layer(7, 'deco_water_low', tideLayers.low.deco, false),
            layer(8, 'collision_high', tideLayers.high.collision, false),
            layer(9, 'collision_low', tideLayers.low.collision, false),
          ]
        : []),
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
      prop('entrance_x', ex),
      prop('entrance_y', ey),
      prop('battle_bg', src.meta.battleBgKey),
    ],
    nextlayerid: tideLayers ? 10 : 6,
    nextobjectid: objects.length + 1,
  };
}

interface TideLayerData {
  deco: number[];
  collision: number[];
}

/**
 * Reads the `tide` grids into per-level deco/collision data. Tide cells draw in the
 * `deco_water_<tide>` layer and block in `collision_<tide>` when their tile is solid (or the
 * legend says `solid`); the common layers never see them.
 */
function compileTide(
  src: MapSource,
  legend: ReadonlyMap<string, LegendEntry>,
): Record<TideLevel, TideLayerData> | undefined {
  const id = src.meta.id;
  if (!src.tide) {
    if (src.meta.tideAware) throw new MapCompileError(id, 'tideAware map needs tide grids');
    return undefined;
  }
  if (!src.meta.tideAware) throw new MapCompileError(id, 'tide grids need meta.tideAware');
  const { width, height } = src;
  const cells = width * height;
  const out = {} as Record<TideLevel, TideLayerData>;
  for (const level of TIDE_LEVELS) {
    const rows = src.tide[level];
    checkGrid(id, `tide.${level}`, rows, width, height);
    const data: TideLayerData = {
      deco: new Array<number>(cells).fill(0),
      collision: new Array<number>(cells).fill(0),
    };
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (ch === OVERLAY_EMPTY) return;
        const entry = legend.get(ch);
        if (!entry) throw new MapCompileError(id, `unknown tide char "${ch}" at (${x}, ${y})`);
        if (entry.ground !== undefined || entry.above !== undefined) {
          throw new MapCompileError(id, `tide entry "${ch}" may only set deco and solid`);
        }
        const i = y * width + x;
        const decoGid = entry.deco === undefined ? 0 : tileGid(entry.deco);
        data.deco[i] = decoGid;
        const solid = entry.solid ?? isSolidGid(decoGid);
        data.collision[i] = solid ? COLLISION_GID : 0;
      });
    });
    out[level] = data;
  }
  return out;
}

/** Whether the placeholder tile a gid refers to blocks movement (gid 0 is the empty cell). */
function isSolidGid(gid: number): boolean {
  if (gid === 0) return false;
  const def = PLACEHOLDER_TILES[gid - 1];
  if (!def) throw new Error(`unknown placeholder gid: ${gid}`);
  return def.solid;
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
  const type =
    typeof value === 'string'
      ? 'string'
      : typeof value === 'boolean'
        ? 'bool'
        : Number.isInteger(value)
          ? 'int'
          : 'float';
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
    if (typeof value === 'object' && value !== null) {
      // Tiled properties are scalars: structured values (npc markers) travel as JSON text.
      props.push(prop(key, JSON.stringify(value)));
      continue;
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new MapCompileError(mapId, `${type} #${id} property ${key} has unsupported type`);
    }
    // §9.3 types every numeric object property as int, so a fractional value is an authoring error.
    if (typeof value === 'number' && !Number.isInteger(value)) {
      throw new MapCompileError(mapId, `${type} #${id} property ${key} must be an integer`);
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
