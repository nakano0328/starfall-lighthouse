import type { Legend } from '@core/map/source';

/** Shared legend for outdoor maps built on the placeholder tileset. */
export const OUTDOOR_LEGEND: Legend = {
  '.': 'grass',
  ',': 'grass_dark',
  '=': 'path',
  ':': 'sand',
  '~': 'water',
  W: 'deep_water',
  T: { ground: 'grass', deco: 'tree_trunk', above: 'tree_top' },
  f: { ground: 'grass', deco: 'flower' },
  F: { ground: 'grass', deco: 'fence' },
  R: { ground: 'grass', deco: 'rock' },
  r: 'roof_red',
  b: 'roof_blue',
  w: 'wall',
  D: 'door',
  p: 'pier',
  B: { ground: 'bridge', solid: false },
  c: 'cliff',
};

/** Shared legend for interiors. */
export const INTERIOR_LEGEND: Legend = {
  '.': 'floor_wood',
  ',': 'floor_stone',
  w: 'wall',
  D: 'door',
  b: 'bed',
  t: 'table',
  s: 'bookshelf',
  c: 'counter',
  l: 'lantern',
  '=': 'stairs',
};
