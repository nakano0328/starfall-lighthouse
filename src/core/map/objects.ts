import { ConditionError, evaluateCondition, validateCondition } from '@core/condition';
import type { Flags } from '@core/flags';
import type { Facing } from '@data/types';

import type { TiledMap, TiledObject, TiledPropertyValue } from './tiled';
import { findObjectLayer, findTileLayer, propertyValue } from './tiled';

const FACINGS: readonly Facing[] = ['up', 'down', 'left', 'right'];
const TIDES = ['high', 'low', 'any'] as const;
export type Tide = (typeof TIDES)[number];

interface Placed {
  /** Tile coordinates and size in tiles. */
  tx: number;
  ty: number;
  tw: number;
  th: number;
}

export interface NpcMarker {
  if?: string;
  text: string;
}

export interface NpcObject extends Placed {
  kind: 'npc';
  id: string;
  dialog: string;
  facing: Facing;
  sprite: string;
  move: 'static' | 'random';
  shop?: string;
  innPrice?: number;
  condition?: string;
  hiddenIf?: string;
  markers?: NpcMarker[];
}

export interface WarpObject extends Placed {
  kind: 'warp';
  targetMap: string;
  targetX: number;
  targetY: number;
  facing: Facing;
  requiredItem?: string;
  lockedTextId?: string;
  doorFlag?: string;
}

export interface ChestObject extends Placed {
  kind: 'chest';
  itemId: string;
  qty: number;
  flag: string;
  tide: Tide;
}

export interface SignObject extends Placed {
  kind: 'sign';
  textId: string;
}

export interface SavePointObject extends Placed {
  kind: 'save_point';
  heal: boolean;
  onceFlag?: string;
}

export interface EnemyObject extends Placed {
  kind: 'enemy';
  groupIds: string[];
  respawnSec: number;
  sprite?: string;
  radius: number;
  tide: Tide;
  defeatedFlag?: string;
  condition?: string;
}

export interface TriggerObject extends Placed {
  kind: 'trigger';
  eventId: string;
  once: boolean;
  condition?: string;
  /** Examined with Z instead of stepped on; blocks movement like a sign (§9.3). */
  interact: boolean;
}

export type MapObject =
  NpcObject | WarpObject | ChestObject | SignObject | SavePointObject | EnemyObject | TriggerObject;

export class MapObjectError extends Error {
  constructor(obj: TiledObject, message: string) {
    super(`object #${obj.id} (${obj.type} "${obj.name}"): ${message}`);
    this.name = 'MapObjectError';
  }
}

/** Reads every object of the `events` layer into typed records (docs/GAME_DESIGN.md §9.3). */
export function parseMapObjects(map: TiledMap): MapObject[] {
  const layer = findObjectLayer(map, 'events');
  if (!layer) return [];
  return layer.objects.map((o) => parseObject(map, o));
}

function parseObject(map: TiledMap, o: TiledObject): MapObject {
  const tw = map.tilewidth;
  const th = map.tileheight;
  if (o.x % tw !== 0 || o.y % th !== 0 || o.width % tw !== 0 || o.height % th !== 0) {
    throw new MapObjectError(o, 'position/size must be multiples of the tile size');
  }
  const placed: Placed = {
    tx: o.x / tw,
    ty: o.y / th,
    tw: Math.max(1, o.width / tw),
    th: Math.max(1, o.height / th),
  };
  if (
    placed.tx < 0 ||
    placed.ty < 0 ||
    placed.tx + placed.tw > map.width ||
    placed.ty + placed.th > map.height
  ) {
    throw new MapObjectError(o, 'outside the map');
  }
  const p = o.properties;
  const str = (name: string): string => {
    const v = propertyValue(p, name);
    if (typeof v !== 'string' || v === '')
      throw new MapObjectError(o, `missing string property ${name}`);
    return v;
  };
  const optStr = (name: string): string | undefined => {
    const v = propertyValue(p, name);
    if (v === undefined) return undefined;
    if (typeof v !== 'string') throw new MapObjectError(o, `property ${name} must be a string`);
    return v;
  };
  /** Optional §9.3 condition, validated here so malformed data fails in tests, not in the field. */
  const optCond = (name: string): string | undefined => {
    const v = optStr(name);
    if (v === undefined) return undefined;
    try {
      validateCondition(v);
    } catch (e) {
      if (e instanceof ConditionError)
        throw new MapObjectError(o, `property ${name}: ${e.message}`);
      throw e;
    }
    return v;
  };
  const int = (name: string): number => {
    const v = propertyValue(p, name);
    if (typeof v !== 'number' || !Number.isInteger(v))
      throw new MapObjectError(o, `missing int property ${name}`);
    return v;
  };
  const optInt = (name: string, fallback: number): number => {
    const v = propertyValue(p, name);
    if (v === undefined) return fallback;
    if (typeof v !== 'number' || !Number.isInteger(v))
      throw new MapObjectError(o, `property ${name} must be an int`);
    return v;
  };
  const optBool = (name: string, fallback: boolean): boolean => {
    const v = propertyValue(p, name);
    if (v === undefined) return fallback;
    if (typeof v !== 'boolean') throw new MapObjectError(o, `property ${name} must be a bool`);
    return v;
  };
  const facing = (name: string): Facing => {
    const v = str(name);
    if (!FACINGS.includes(v as Facing))
      throw new MapObjectError(o, `property ${name} must be a facing`);
    return v as Facing;
  };
  const tide = (): Tide => {
    const v = optStr('tide') ?? 'any';
    if (!TIDES.includes(v as Tide))
      throw new MapObjectError(o, `property tide must be high/low/any`);
    return v as Tide;
  };
  const markers = (): NpcMarker[] | undefined => {
    const raw = optStr('markers');
    if (raw === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new MapObjectError(o, 'property markers must be JSON');
    }
    if (!Array.isArray(parsed)) throw new MapObjectError(o, 'property markers must be a list');
    return parsed.map((m): NpcMarker => {
      if (typeof m !== 'object' || m === null || typeof (m as { text?: unknown }).text !== 'string')
        throw new MapObjectError(o, 'each marker needs a text');
      const entry = m as { if?: unknown; text: string };
      if (entry.if !== undefined) {
        if (typeof entry.if !== 'string') throw new MapObjectError(o, 'marker if must be a string');
        validateCondition(entry.if);
        return { if: entry.if, text: entry.text };
      }
      return { text: entry.text };
    });
  };
  const withOpt = <T extends object>(
    base: T,
    extras: Record<string, TiledPropertyValue | undefined>,
  ): T => {
    const out = { ...base } as Record<string, unknown>;
    for (const [k, v] of Object.entries(extras)) if (v !== undefined) out[k] = v;
    return out as T;
  };

  switch (o.type) {
    case 'npc': {
      const move = optStr('move') ?? 'static';
      if (move !== 'static' && move !== 'random')
        throw new MapObjectError(o, 'move must be static/random');
      const npc = withOpt<NpcObject>(
        {
          kind: 'npc',
          ...placed,
          id: str('id'),
          dialog: str('dialog'),
          facing: facing('facing'),
          sprite: str('sprite'),
          move,
        },
        {
          shop: optStr('shop'),
          innPrice: propertyValue(p, 'inn_price') === undefined ? undefined : int('inn_price'),
          condition: optCond('condition'),
          hiddenIf: optCond('hidden_if'),
        },
      );
      const npcMarkers = markers();
      if (npcMarkers) npc.markers = npcMarkers;
      return npc;
    }
    case 'warp':
      return withOpt<WarpObject>(
        {
          kind: 'warp',
          ...placed,
          targetMap: str('target_map'),
          targetX: int('target_x'),
          targetY: int('target_y'),
          facing: facing('facing'),
        },
        {
          requiredItem: optStr('required_item'),
          lockedTextId: optStr('locked_text_id'),
          doorFlag: optStr('door_flag'),
        },
      );
    case 'chest':
      return {
        kind: 'chest',
        ...placed,
        itemId: str('item_id'),
        qty: int('qty'),
        flag: str('flag'),
        tide: tide(),
      };
    case 'sign':
      return { kind: 'sign', ...placed, textId: str('text_id') };
    case 'save_point':
      return withOpt<SavePointObject>(
        { kind: 'save_point', ...placed, heal: optBool('heal', false) },
        { onceFlag: optStr('once_flag') },
      );
    case 'enemy': {
      const groupIds = str('group_id')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (groupIds.length === 0)
        throw new MapObjectError(o, 'group_id must list at least one group');
      return withOpt<EnemyObject>(
        {
          kind: 'enemy',
          ...placed,
          groupIds,
          respawnSec: optInt('respawn_sec', 60),
          radius: optInt('radius', 4),
          tide: tide(),
        },
        {
          sprite: optStr('sprite'),
          defeatedFlag: optStr('defeated_flag'),
          condition: optCond('condition'),
        },
      );
    }
    case 'trigger': {
      const once = propertyValue(p, 'once');
      if (typeof once !== 'boolean') throw new MapObjectError(o, 'missing bool property once');
      return withOpt<TriggerObject>(
        {
          kind: 'trigger',
          ...placed,
          eventId: str('event_id'),
          once,
          interact: optBool('interact', false),
        },
        { condition: optCond('condition') },
      );
    }
    default:
      throw new MapObjectError(o, `unknown object type "${o.type}"`);
  }
}

/** Walkability lookup built from the `collision` layer; out-of-bounds cells are blocked. */
export class CollisionGrid {
  private readonly blocked: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
    blocked: Uint8Array,
  ) {
    this.blocked = blocked;
  }

  static fromMap(map: TiledMap, layerName = 'collision'): CollisionGrid {
    return CollisionGrid.fromMapLayers(map, [layerName]);
  }

  /** Union of several collision layers (e.g. `collision` plus `collision_low`, §3.2). */
  static fromMapLayers(map: TiledMap, layerNames: readonly string[]): CollisionGrid {
    const blocked = new Uint8Array(map.width * map.height);
    for (const name of layerNames) {
      findTileLayer(map, name)?.data.forEach((gid, i) => {
        if (gid !== 0) blocked[i] = 1;
      });
    }
    return new CollisionGrid(map.width, map.height, blocked);
  }

  isBlocked(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.blocked[y * this.width + x] === 1;
  }

  /** Returns a copy with extra cells blocked (e.g. NPC positions). */
  withBlocked(cells: readonly { x: number; y: number }[]): CollisionGrid {
    const copy = new Uint8Array(this.blocked);
    for (const c of cells) {
      if (c.x >= 0 && c.y >= 0 && c.x < this.width && c.y < this.height)
        copy[c.y * this.width + c.x] = 1;
    }
    return new CollisionGrid(this.width, this.height, copy);
  }
}

/** Finds the object(s) covering a tile, in the spec's interaction priority order. */
/** Text of the first marker whose condition holds ('' when none applies). */
export function markerTextFor(markers: readonly NpcMarker[] | undefined, flags: Flags): string {
  if (!markers) return '';
  for (const m of markers) {
    if (m.if === undefined || evaluateCondition(m.if, flags)) return m.text;
  }
  return '';
}

export function objectsAt(objects: readonly MapObject[], x: number, y: number): MapObject[] {
  const PRIORITY: Record<MapObject['kind'], number> = {
    npc: 0,
    chest: 1,
    sign: 2,
    save_point: 3,
    warp: 4,
    trigger: 5,
    enemy: 6,
  };
  return objects
    .filter((o) => x >= o.tx && x < o.tx + o.tw && y >= o.ty && y < o.ty + o.th)
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
}
