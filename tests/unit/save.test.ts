import { describe, expect, it } from 'vitest';

import {
  SAVE_SCHEMA_VERSION,
  SAVE_SLOT_COUNT,
  createNewSave,
  deserialize,
  findSlotsWithSaves,
  formatPlayTime,
  serialize,
  slotKey,
} from '@core/save';

describe('save', () => {
  it('creates a fresh save at the starting village', () => {
    const s = createNewSave(1_000);
    expect(s.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(s.savedAt).toBe(1_000);
    expect(s.playTimeSec).toBe(0);
    expect(s.location).toEqual({ map: 'map_minato_luka_house', x: 7, y: 7, facing: 'up' });
    expect(s.flags).toEqual({});
  });

  it('round-trips through serialize/deserialize', () => {
    const s = createNewSave(42);
    s.flags['fragments.count'] = 2;
    s.playTimeSec = 1234;
    const back = deserialize(serialize(s));
    expect(back).toEqual(s);
  });

  it('rejects corrupt or foreign data', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize('[]')).toBeNull();
    expect(deserialize('{}')).toBeNull();
    expect(deserialize(JSON.stringify({ schemaVersion: 'x' }))).toBeNull();
  });

  it('rejects saves from a newer schema than this build understands', () => {
    const s = createNewSave(1);
    const raw = JSON.stringify({ ...s, schemaVersion: SAVE_SCHEMA_VERSION + 1 });
    expect(deserialize(raw)).toBeNull();
  });

  it('rejects saves with an invalid location', () => {
    const s = createNewSave(1);
    const raw = JSON.stringify({ ...s, location: { ...s.location, facing: 'sideways' } });
    expect(deserialize(raw)).toBeNull();
  });

  it('maps slots to stable storage keys and rejects bad slots', () => {
    expect(slotKey(0)).toBe('starfall.save.0');
    expect(slotKey(SAVE_SLOT_COUNT - 1)).toBe(`starfall.save.${SAVE_SLOT_COUNT - 1}`);
    expect(() => slotKey(-1)).toThrow(RangeError);
    expect(() => slotKey(SAVE_SLOT_COUNT)).toThrow(RangeError);
    expect(() => slotKey(1.5)).toThrow(RangeError);
  });
});

describe('findSlotsWithSaves', () => {
  it('returns only slots holding a valid save', () => {
    const store = new Map<string, string>([
      ['starfall.save.0', serialize(createNewSave(1))],
      ['starfall.save.1', 'garbage'],
    ]);
    expect(findSlotsWithSaves((k) => store.get(k) ?? null)).toEqual([0]);
    expect(findSlotsWithSaves(() => null)).toEqual([]);
  });
});

describe('formatPlayTime', () => {
  it('formats h:mm:ss', () => {
    expect(formatPlayTime(0)).toBe('0:00:00');
    expect(formatPlayTime(59.9)).toBe('0:00:59');
    expect(formatPlayTime(3723)).toBe('1:02:03');
    expect(formatPlayTime(-5)).toBe('0:00:00');
  });
});
