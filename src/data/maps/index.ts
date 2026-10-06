import type { MapSource } from '@core/map/source';
import type { MapMeta } from '@data/types';

import { map_coast_road } from './map_coast_road';
import { map_forest_shrine } from './map_forest_shrine';
import { map_lighthouse_path } from './map_lighthouse_path';
import { map_minato_inn } from './map_minato_inn';
import { map_minato_luka_house } from './map_minato_luka_house';
import { map_minato_shop } from './map_minato_shop';
import { map_minato_village } from './map_minato_village';
import { map_whisper_forest } from './map_whisper_forest';

/** Every authored map, keyed by map id. Add new maps here (docs/GAME_DESIGN.md §3.1). */
export const MAP_SOURCES: Readonly<Record<string, MapSource>> = Object.freeze({
  [map_minato_village.meta.id]: map_minato_village,
  [map_minato_luka_house.meta.id]: map_minato_luka_house,
  [map_minato_inn.meta.id]: map_minato_inn,
  [map_minato_shop.meta.id]: map_minato_shop,
  [map_coast_road.meta.id]: map_coast_road,
  [map_lighthouse_path.meta.id]: map_lighthouse_path,
  [map_whisper_forest.meta.id]: map_whisper_forest,
  [map_forest_shrine.meta.id]: map_forest_shrine,
});

export const MAP_IDS: readonly string[] = Object.keys(MAP_SOURCES);

export function getMapSource(id: string): MapSource {
  const src = MAP_SOURCES[id];
  if (!src) throw new Error(`unknown map: ${id}`);
  return src;
}

export function getMapMeta(id: string): MapMeta {
  return getMapSource(id).meta;
}
