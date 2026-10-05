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

/** What migrations need from outside the module (character data lives in src/data). */
export interface MigrationContext {
  /** Party for a v1 save: ルカ Lv1 with initial equipment, plus ミオ when she had joined. */
  initialParty: (flags: FlagMap) => SavedMember[];
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
 * usable save (corrupt JSON, wrong shape, newer schema than this build knows).
 * Older schemas are migrated forward with `ctx`.
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
  if (typeof version !== 'number' || version > SAVE_SCHEMA_VERSION) return null;
  if (!isV1Core(parsed)) return null;

  const migrated = migrate(parsed, version, ctx);
  return isSaveData(migrated) ? migrated : null;
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
        chapter: typeof chapter === 'number' ? chapter : 0,
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

const FACINGS = new Set(['up', 'down', 'left', 'right']);
const CHARACTER_IDS = new Set(['ch_luka', 'ch_mio', 'ch_goro']);

/** Fields every version since v1 must have. */
function isV1Core(value: Record<string, unknown>): boolean {
  const loc = value['location'];
  return (
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

function isSavedMember(value: unknown): value is SavedMember {
  if (!isRecord(value)) return false;
  const eq = value['equipment'];
  const nullableString = (v: unknown): boolean => v === null || typeof v === 'string';
  return (
    typeof value['id'] === 'string' &&
    CHARACTER_IDS.has(value['id']) &&
    typeof value['exp'] === 'number' &&
    typeof value['hp'] === 'number' &&
    typeof value['mp'] === 'number' &&
    typeof value['ko'] === 'boolean' &&
    isRecord(eq) &&
    nullableString(eq['weapon']) &&
    nullableString(eq['armor']) &&
    nullableString(eq['accessory']) &&
    Array.isArray(value['statuses']) &&
    value['statuses'].every((s) => typeof s === 'string')
  );
}

function isSaveData(value: Record<string, unknown>): value is Record<string, unknown> & SaveData {
  return (
    value['schemaVersion'] === SAVE_SCHEMA_VERSION &&
    isV1Core(value) &&
    typeof value['gold'] === 'number' &&
    Array.isArray(value['party']) &&
    value['party'].length > 0 &&
    value['party'].every(isSavedMember) &&
    Array.isArray(value['inventory']) &&
    value['inventory'].every(
      (e) => isRecord(e) && typeof e['itemId'] === 'string' && typeof e['qty'] === 'number',
    ) &&
    typeof value['chapter'] === 'number'
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
