import type { FlagMap } from './flags';

/**
 * Save-data format. Bump SAVE_SCHEMA_VERSION whenever the shape changes and
 * add a step to `migrate()` so old saves keep loading.
 */
export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_SLOT_COUNT = 3;
export const SAVE_KEY_PREFIX = 'starfall.save.';

export interface SaveData {
  schemaVersion: number;
  /** Unix ms, provided by the caller so this module stays deterministic/testable. */
  savedAt: number;
  /** Total play time in seconds. */
  playTimeSec: number;
  location: {
    map: string;
    x: number;
    y: number;
    facing: 'up' | 'down' | 'left' | 'right';
  };
  flags: FlagMap;
}

export function createNewSave(savedAt: number): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt,
    playTimeSec: 0,
    location: { map: 'map_minato_village', x: 10, y: 12, facing: 'down' },
    flags: {},
  };
}

export function slotKey(slot: number): string {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SAVE_SLOT_COUNT) {
    throw new RangeError(`save slot out of range: ${slot}`);
  }
  return `${SAVE_KEY_PREFIX}${slot}`;
}

export function serialize(data: SaveData): string {
  return JSON.stringify(data);
}

/**
 * Parse and validate a save string. Returns `null` for anything that is not a
 * usable save (corrupt JSON, wrong shape, newer schema than this build knows).
 */
export function deserialize(raw: string): SaveData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const version = parsed['schemaVersion'];
  if (typeof version !== 'number' || version > SAVE_SCHEMA_VERSION) return null;

  const migrated = migrate(parsed, version);
  return isSaveData(migrated) ? migrated : null;
}

/** Step saves forward one schema version at a time. */
function migrate(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let current = { ...data };
  let v = fromVersion;
  while (v < SAVE_SCHEMA_VERSION) {
    // Future migrations go here, e.g.
    // if (v === 1) { current = { ...current, newField: defaultValue }; }
    v += 1;
    current = { ...current, schemaVersion: v };
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const FACINGS = new Set(['up', 'down', 'left', 'right']);

function isSaveData(value: Record<string, unknown>): value is Record<string, unknown> & SaveData {
  const loc = value['location'];
  return (
    value['schemaVersion'] === SAVE_SCHEMA_VERSION &&
    typeof value['savedAt'] === 'number' &&
    typeof value['playTimeSec'] === 'number' &&
    isRecord(loc) &&
    typeof loc['map'] === 'string' &&
    typeof loc['x'] === 'number' &&
    typeof loc['y'] === 'number' &&
    typeof loc['facing'] === 'string' &&
    FACINGS.has(loc['facing']) &&
    isRecord(value['flags'])
  );
}

/**
 * Finds which slots hold a loadable save. `read` abstracts localStorage so this
 * stays pure (and testable); it returns the raw string for a key or null.
 */
export function findSlotsWithSaves(read: (key: string) => string | null): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < SAVE_SLOT_COUNT; slot += 1) {
    const raw = read(slotKey(slot));
    if (raw !== null && deserialize(raw) !== null) slots.push(slot);
  }
  return slots;
}
