import type { CharacterId, StatusKey } from '@data/types';

import type { FlagMap } from './flags';
import type { InventoryEntry } from './inventory';

/**
 * Save-data format (docs/GAME_DESIGN.md §12). Bump SAVE_SCHEMA_VERSION whenever
 * the shape changes and add a step to `migrate()` so old saves keep loading.
 */
export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_SLOT_COUNT = 3;
export const SAVE_KEY_PREFIX = 'starfall.save.';
/** Pre-boss backup written automatically (§5.11); outside the numbered slots. */
export const SAVE_KEY_AUTO = `${SAVE_KEY_PREFIX}auto`;

export type Facing = 'up' | 'down' | 'left' | 'right';

export interface SaveLocation {
  map: string;
  x: number;
  y: number;
  facing: Facing;
}

export interface SavedMember {
  id: CharacterId;
  /** Cumulative EXP; the level is derived from it and never stored. */
  exp: number;
  hp: number;
  mp: number;
  ko: boolean;
  equipment: { weapon: string | null; armor: string | null; accessory: string | null };
  /** Field-persistent ailments (not in the spec's v2 sketch; added so poison survives a reload). */
  statuses: StatusKey[];
}

export interface SaveData {
  schemaVersion: number;
  /** Unix ms, provided by the caller so this module stays deterministic/testable. */
  savedAt: number;
  /** Total play time in seconds. */
  playTimeSec: number;
  location: SaveLocation;
  flags: FlagMap;
  gold: number;
  /** Members in join order. */
  party: SavedMember[];
  inventory: InventoryEntry[];
  /** Copy of flags['main.chapter'] for slot lists. */
  chapter: number;
}

/** Chapter names for slot lists (§1.2 / §13). */
export const CHAPTER_NAMES: readonly string[] = [
  '序章　灯台の夜',
  '第一章　ささやきの森',
  '第二章　鉱山町と廃坑',
  '第三章　沈んだ遺跡',
  '終章　ほしふる灯台',
  'クリア',
];

export function chapterName(chapter: number): string {
  return CHAPTER_NAMES[chapter] ?? CHAPTER_NAMES[0] ?? '';
}

/**
 * What migration and validation need from outside the module (character and
 * map data live in src/data, which core must not import).
 */
export interface MigrationContext {
  /** Party for a v1 save: ルカ Lv1 with initial equipment, plus ミオ when she had joined. */
  initialParty: (flags: FlagMap) => SavedMember[];
  /**
   * Checks a save's location against the map registry. Returns the location to
   * load: the same one, a repaired one (e.g. the map's entrance when the tile
   * is off the map), or `null` when the map cannot be loaded by this build, in
   * which case the whole save is unloadable and `deserialize` returns null.
   * Optional so a context without map data (unit tests) keeps locations as-is.
   */
  resolveLocation?: (location: SaveLocation) => SaveLocation | null;
}

export function createNewSave(savedAt: number, party: SavedMember[]): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt,
    playTimeSec: 0,
    location: { map: 'map_minato_luka_house', x: 7, y: 7, facing: 'up' },
    flags: {},
    gold: 0,
    party,
    inventory: [],
    chapter: 0,
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
 * usable save: corrupt JSON, wrong shape, out-of-range values (negative gold,
 * zero quantities, unknown statuses...), a newer schema than this build knows,
 * or a location `ctx.resolveLocation` cannot realise. Older schemas are
 * migrated forward with `ctx`; the returned location is the resolved one, so
 * every caller (slot lists, 「つづきから」, loading) sees the same answer.
 */
export function deserialize(raw: string, ctx: MigrationContext): SaveData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const version = parsed['schemaVersion'];
  if (!isSchemaVersion(version)) return null;
  if (!isV1Core(parsed)) return null;

  const migrated = migrate(parsed, version, ctx);
  const location = readLocation(migrated['location']);
  if (location === null) return null;
  const resolved = ctx.resolveLocation ? ctx.resolveLocation(location) : location;
  if (resolved === null) return null;

  const candidate = { ...migrated, location: resolved };
  return isSaveData(candidate) ? candidate : null;
}

/** Step saves forward one schema version at a time. */
function migrate(
  data: Record<string, unknown>,
  fromVersion: number,
  ctx: MigrationContext,
): Record<string, unknown> {
  let current = { ...data };
  let v = fromVersion;
  while (v < SAVE_SCHEMA_VERSION) {
    if (v === 1) {
      const flags = isRecord(current['flags']) ? (current['flags'] as FlagMap) : {};
      const chapter = flags['main.chapter'];
      current = {
        ...current,
        gold: 0,
        party: ctx.initialParty(flags),
        inventory: [],
        chapter: isNonNegativeInt(chapter) ? chapter : 0,
      };
    }
    v += 1;
    current = { ...current, schemaVersion: v };
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Known schema: an integer from 1 up to this build's version (newer builds' saves are rejected). */
function isSchemaVersion(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= SAVE_SCHEMA_VERSION
  );
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInt(value: unknown): value is number {
  return isNonNegativeInt(value) && value >= 1;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

const FACINGS: ReadonlySet<string> = new Set<Facing>(['up', 'down', 'left', 'right']);
const CHARACTER_IDS: ReadonlySet<string> = new Set<CharacterId>(['ch_luka', 'ch_mio', 'ch_goro']);
/** Every StatusKey (the Record keeps this in sync with @data/types at compile time). */
const STATUS_KEYS: Record<StatusKey, true> = {
  poison: true,
  paralyze: true,
  blind: true,
  def_down: true,
  atk_up: true,
};
const KNOWN_STATUSES: ReadonlySet<string> = new Set(Object.keys(STATUS_KEYS));

function isFacing(value: unknown): value is Facing {
  return typeof value === 'string' && FACINGS.has(value);
}

/** The location of a v1+ save as a fresh object, or null when it is malformed. */
function readLocation(value: unknown): SaveLocation | null {
  if (!isRecord(value)) return null;
  const map = value['map'];
  const x = value['x'];
  const y = value['y'];
  const facing = value['facing'];
  if (typeof map !== 'string' || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!isFacing(facing)) return null;
  return { map, x, y, facing };
}

/** Fields every version since v1 must have. */
function isV1Core(value: Record<string, unknown>): boolean {
  const playTime = value['playTimeSec'];
  return (
    typeof value['savedAt'] === 'number' &&
    typeof playTime === 'number' &&
    playTime >= 0 &&
    readLocation(value['location']) !== null &&
    isRecord(value['flags'])
  );
}

function isSavedMember(value: unknown): value is SavedMember {
  if (!isRecord(value)) return false;
  const id = value['id'];
  const eq = value['equipment'];
  const statuses = value['statuses'];
  return (
    typeof id === 'string' &&
    CHARACTER_IDS.has(id) &&
    isNonNegativeInt(value['exp']) &&
    isNonNegativeInt(value['hp']) &&
    isNonNegativeInt(value['mp']) &&
    typeof value['ko'] === 'boolean' &&
    isRecord(eq) &&
    isNullableString(eq['weapon']) &&
    isNullableString(eq['armor']) &&
    isNullableString(eq['accessory']) &&
    Array.isArray(statuses) &&
    statuses.every((s) => typeof s === 'string' && KNOWN_STATUSES.has(s))
  );
}

/** `qty` must be a positive integer: `Inventory.add` silently drops anything else. */
function isInventoryEntry(value: unknown): value is InventoryEntry {
  return isRecord(value) && typeof value['itemId'] === 'string' && isPositiveInt(value['qty']);
}

function hasUniqueIds(members: readonly SavedMember[]): boolean {
  return new Set(members.map((m) => m.id)).size === members.length;
}

function isSaveData(value: Record<string, unknown>): value is Record<string, unknown> & SaveData {
  const party = value['party'];
  const inventory = value['inventory'];
  return (
    value['schemaVersion'] === SAVE_SCHEMA_VERSION &&
    isV1Core(value) &&
    isNonNegativeInt(value['gold']) &&
    Array.isArray(party) &&
    party.length > 0 &&
    party.every(isSavedMember) &&
    hasUniqueIds(party) &&
    Array.isArray(inventory) &&
    inventory.every(isInventoryEntry) &&
    isNonNegativeInt(value['chapter'])
  );
}

/**
 * Finds which slots hold a loadable save. `read` abstracts localStorage so this
 * stays pure (and testable); it returns the raw string for a key or null.
 */
export function findSlotsWithSaves(
  read: (key: string) => string | null,
  ctx: MigrationContext,
): number[] {
  const slots: number[] = [];
  for (let slot = 0; slot < SAVE_SLOT_COUNT; slot += 1) {
    const raw = read(slotKey(slot));
    if (raw !== null && deserialize(raw, ctx) !== null) slots.push(slot);
  }
  return slots;
}

/** "1:02:03" style play time for slot lists and the status screen. */
export function formatPlayTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s2 = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s2).padStart(2, '0')}`;
}

/** Slot-list line: chapter, place, leader level, play time, date (§11.2). */
export interface SlotSummary {
  chapter: string;
  place: string;
  leaderId: CharacterId;
  leaderExp: number;
  playTime: string;
  savedAt: number;
}

export function slotSummary(data: SaveData, placeName: (mapId: string) => string): SlotSummary {
  const leader = data.party[0];
  return {
    chapter: chapterName(data.chapter),
    place: placeName(data.location.map),
    leaderId: leader?.id ?? 'ch_luka',
    leaderExp: leader?.exp ?? 0,
    playTime: formatPlayTime(data.playTimeSec),
    savedAt: data.savedAt,
  };
}
