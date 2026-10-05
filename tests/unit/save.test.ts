import { describe, expect, it } from 'vitest';

import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import type { Facing, MigrationContext, SaveLocation, SavedMember } from '@core/save';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_SLOT_COUNT,
  chapterName,
  createNewSave,
  deserialize,
  findSlotsWithSaves,
  formatPlayTime,
  serialize,
  slotKey,
  slotSummary,
} from '@core/save';
import { fromSaveData, toSaveData } from '@core/state';
import type { StatusKey } from '@data/types';

const luka: SavedMember = {
  id: 'ch_luka',
  exp: 0,
  hp: 42,
  mp: 12,
  ko: false,
  equipment: { weapon: 'eq_wp_luka_1', armor: 'eq_ar_cloth_luka', accessory: null },
  statuses: [],
};
const mio: SavedMember = {
  ...luka,
  id: 'ch_mio',
  hp: 36,
  mp: 14,
  equipment: { weapon: 'eq_wp_mio_1', armor: 'eq_ar_cloth_mio', accessory: null },
};
/**
 * Stub context so this file stays independent of src/data. The real
 * MIGRATION_CONTEXT (src/data/saveContext.ts) is covered by save-context.test.ts.
 */
const ctx: MigrationContext = {
  initialParty: (flags) => (flags['minato.mio_joined'] ? [luka, mio] : [luka]),
};

describe('save', () => {
  it("creates a fresh v2 save in Luka's house with the given party", () => {
    const s = createNewSave(1_000, [luka]);
    expect(s.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(s.savedAt).toBe(1_000);
    expect(s.playTimeSec).toBe(0);
    expect(s.location).toEqual({ map: 'map_minato_luka_house', x: 7, y: 7, facing: 'up' });
    expect(s.flags).toEqual({});
    expect(s.gold).toBe(0);
    expect(s.party).toEqual([luka]);
    expect(s.inventory).toEqual([]);
    expect(s.chapter).toBe(0);
  });

  it('round-trips through serialize/deserialize', () => {
    const s = createNewSave(42, [luka]);
    s.flags['fragments.count'] = 2;
    s.playTimeSec = 1234;
    s.gold = 300;
    s.inventory = [{ itemId: 'it_herb', qty: 3 }];
    s.party[0]!.statuses = ['poison'];
    const back = deserialize(serialize(s), ctx);
    expect(back).toEqual(s);
  });

  it('migrates a v1 save: gold 0, initial party (with Mio when joined), empty bag, chapter from flags', () => {
    const v1 = {
      schemaVersion: 1,
      savedAt: 5,
      playTimeSec: 10,
      location: { map: 'map_minato_village', x: 10, y: 12, facing: 'down' },
      flags: { 'main.chapter': 1, 'minato.mio_joined': true },
    };
    const back = deserialize(JSON.stringify(v1), ctx);
    expect(back).toEqual({
      ...v1,
      schemaVersion: 2,
      gold: 0,
      party: [luka, mio],
      inventory: [],
      chapter: 1,
    });
    const solo = deserialize(JSON.stringify({ ...v1, flags: {} }), ctx);
    expect(solo?.party).toEqual([luka]);
    expect(solo?.chapter).toBe(0);
  });

  it('rejects corrupt, foreign, newer or malformed data', () => {
    expect(deserialize('not json', ctx)).toBeNull();
    expect(deserialize('null', ctx)).toBeNull();
    expect(deserialize('[]', ctx)).toBeNull();
    expect(deserialize('{}', ctx)).toBeNull();
    expect(deserialize(JSON.stringify({ schemaVersion: 'x' }), ctx)).toBeNull();
    const s = createNewSave(1, [luka]);
    expect(
      deserialize(JSON.stringify({ ...s, schemaVersion: SAVE_SCHEMA_VERSION + 1 }), ctx),
    ).toBeNull();
    expect(
      deserialize(JSON.stringify({ ...s, location: { ...s.location, facing: 'sideways' } }), ctx),
    ).toBeNull();
    expect(deserialize(JSON.stringify({ ...s, party: [] }), ctx)).toBeNull();
    expect(
      deserialize(JSON.stringify({ ...s, party: [{ ...luka, id: 'ch_nox' }] }), ctx),
    ).toBeNull();
    expect(
      deserialize(JSON.stringify({ ...s, party: [{ ...luka, statuses: 'poison' }] }), ctx),
    ).toBeNull();
    expect(deserialize(JSON.stringify({ ...s, inventory: [{ itemId: 1 }] }), ctx)).toBeNull();
    expect(deserialize(JSON.stringify({ ...s, gold: '1' }), ctx)).toBeNull();
  });

  it('maps slots to stable storage keys and rejects bad slots', () => {
    expect(slotKey(0)).toBe('starfall.save.0');
    expect(slotKey(SAVE_SLOT_COUNT - 1)).toBe(`starfall.save.${SAVE_SLOT_COUNT - 1}`);
    expect(() => slotKey(-1)).toThrow(RangeError);
    expect(() => slotKey(SAVE_SLOT_COUNT)).toThrow(RangeError);
    expect(() => slotKey(1.5)).toThrow(RangeError);
  });

  it('names chapters and summarises slots', () => {
    expect(chapterName(0)).toBe('序章　灯台の夜');
    expect(chapterName(4)).toBe('終章　ほしふる灯台');
    expect(chapterName(99)).toBe('序章　灯台の夜');
    const s = createNewSave(777, [luka]);
    s.chapter = 2;
    s.playTimeSec = 61;
    expect(slotSummary(s, (id) => `<${id}>`)).toEqual({
      chapter: '第二章　鉱山町と廃坑',
      place: '<map_minato_luka_house>',
      leaderId: 'ch_luka',
      leaderExp: 0,
      playTime: '0:01:01',
      savedAt: 777,
    });
  });
});

describe('findSlotsWithSaves', () => {
  it('returns only slots holding a valid save', () => {
    const store = new Map<string, string>([
      ['starfall.save.0', serialize(createNewSave(1, [luka]))],
      ['starfall.save.1', 'garbage'],
    ]);
    expect(findSlotsWithSaves((k) => store.get(k) ?? null, ctx)).toEqual([0]);
    expect(findSlotsWithSaves(() => null, ctx)).toEqual([]);
  });
});

describe('game state ↔ save data', () => {
  it('builds live objects from a save and folds them back', () => {
    const s = createNewSave(1, [luka]);
    s.inventory = [{ itemId: 'it_herb', qty: 2 }];
    s.gold = 50;
    const state = fromSaveData(s, () => 99);
    expect(state.inventory.count('it_herb')).toBe(2);
    expect(state.gold).toBe(50);
    expect(state.flags).toBeInstanceOf(Flags);
    expect(state.inventory).toBeInstanceOf(Inventory);
    state.party[0]!.hp = 5;
    expect(s.party[0]!.hp).toBe(42); // live party is a copy

    state.inventory.add('it_lamp_oil', 1);
    state.gold = 75;
    state.flags.set('main.chapter', 3);
    state.save.playTimeSec = 9;
    const out = toSaveData(state, 999);
    expect(out).toMatchObject({ savedAt: 999, playTimeSec: 9, gold: 75, chapter: 3 });
    expect(out.inventory).toEqual([
      { itemId: 'it_herb', qty: 2 },
      { itemId: 'it_lamp_oil', qty: 1 },
    ]);
    expect(out.party[0]).toMatchObject({ id: 'ch_luka', hp: 5 });
    expect(out.flags).toEqual({ 'main.chapter': 3 });
    expect(deserialize(serialize(out), ctx)).toEqual(out);
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

describe('deserialize validation', () => {
  const base = () => {
    const s = createNewSave(1, [luka]);
    s.inventory = [{ itemId: 'it_herb', qty: 1 }];
    return s;
  };
  const parse = (data: unknown, c: MigrationContext = ctx) => deserialize(JSON.stringify(data), c);

  /** Fake registry mirroring what src/data/saveContext.ts provides from MAP_SOURCES. */
  const MAPS: Record<string, { width: number; height: number; entrance: SaveLocation }> = {
    map_minato_luka_house: {
      width: 12,
      height: 10,
      entrance: { map: 'map_minato_luka_house', x: 5, y: 8, facing: 'up' },
    },
    map_minato_village: {
      width: 40,
      height: 30,
      entrance: { map: 'map_minato_village', x: 10, y: 12, facing: 'down' },
    },
  };
  const registryCtx: MigrationContext = {
    ...ctx,
    resolveLocation: (loc) => {
      const m = MAPS[loc.map];
      if (!m) return null;
      const inside =
        Number.isInteger(loc.x) &&
        Number.isInteger(loc.y) &&
        loc.x >= 0 &&
        loc.x < m.width &&
        loc.y >= 0 &&
        loc.y < m.height;
      return inside ? loc : m.entrance;
    },
  };

  it('rejects a save whose map the context cannot resolve', () => {
    const s = base();
    s.location = { map: 'map_minato_village_old', x: 10, y: 12, facing: 'down' };
    expect(parse(s, registryCtx)).toBeNull();
    // Without a registry the core keeps the location as-is (the data layer decides).
    expect(parse(s)).toEqual(s);
  });

  it('stores the location the context resolves (off-map tile → entrance)', () => {
    const s = base();
    s.location = { map: 'map_minato_village', x: 999, y: 999, facing: 'down' };
    expect(parse(s, registryCtx)?.location).toEqual(MAPS['map_minato_village']?.entrance);
    s.location = { map: 'map_minato_village', x: -1, y: 5, facing: 'left' };
    expect(parse(s, registryCtx)?.location).toEqual(MAPS['map_minato_village']?.entrance);
    s.location = { map: 'map_minato_luka_house', x: 3.5, y: 4, facing: 'right' };
    expect(parse(s, registryCtx)?.location).toEqual(MAPS['map_minato_luka_house']?.entrance);
    s.location = { map: 'map_minato_luka_house', x: 11, y: 9, facing: 'right' };
    expect(parse(s, registryCtx)?.location).toEqual(s.location);
  });

  it('passes the context a copy of the location and re-validates what it returns', () => {
    const s = base();
    const seen: SaveLocation[] = [];
    const spy: MigrationContext = {
      ...ctx,
      resolveLocation: (loc) => {
        seen.push(loc);
        return loc;
      },
    };
    expect(parse(s, spy)).toEqual(s);
    expect(seen).toEqual([s.location]);
    const broken: MigrationContext = {
      ...ctx,
      resolveLocation: () => ({
        map: 'map_minato_village',
        x: 1,
        y: 1,
        facing: 'sideways' as Facing,
      }),
    };
    expect(parse(s, broken)).toBeNull();
  });

  it('rejects negative or fractional exp/hp/mp/gold/chapter and negative play time', () => {
    const s = base();
    expect(parse({ ...s, party: [{ ...luka, exp: -1 }] })).toBeNull();
    expect(parse({ ...s, party: [{ ...luka, exp: 1.5 }] })).toBeNull();
    expect(parse({ ...s, party: [{ ...luka, hp: -5 }] })).toBeNull();
    expect(parse({ ...s, party: [{ ...luka, mp: -0.5 }] })).toBeNull();
    expect(parse({ ...s, gold: -10 })).toBeNull();
    expect(parse({ ...s, gold: 2.5 })).toBeNull();
    expect(parse({ ...s, chapter: -1 })).toBeNull();
    expect(parse({ ...s, chapter: 0.5 })).toBeNull();
    expect(parse({ ...s, playTimeSec: -1 })).toBeNull();
    // Play time may be fractional; zero hp (KO) is a legal value.
    expect(parse({ ...s, playTimeSec: 12.75 })?.playTimeSec).toBe(12.75);
    expect(parse({ ...s, party: [{ ...luka, hp: 0, ko: true }] })?.party[0]?.hp).toBe(0);
  });

  it('rejects inventory quantities that are not positive integers', () => {
    const s = base();
    expect(parse({ ...s, inventory: [{ itemId: 'it_herb', qty: 0 }] })).toBeNull();
    expect(parse({ ...s, inventory: [{ itemId: 'it_herb', qty: -1 }] })).toBeNull();
    expect(parse({ ...s, inventory: [{ itemId: 'it_herb', qty: 1.5 }] })).toBeNull();
    expect(parse({ ...s, inventory: [{ itemId: 'it_herb', qty: '3' }] })).toBeNull();
    expect(parse({ ...s, inventory: [{ itemId: 'it_herb', qty: 1 }] })?.inventory).toEqual([
      { itemId: 'it_herb', qty: 1 },
    ]);
  });

  it('rejects unknown statuses and accepts every known one', () => {
    const s = base();
    expect(parse({ ...s, party: [{ ...luka, statuses: ['sleep'] }] })).toBeNull();
    expect(parse({ ...s, party: [{ ...luka, statuses: ['poison', 7] }] })).toBeNull();
    const all: StatusKey[] = ['poison', 'paralyze', 'blind', 'def_down', 'atk_up'];
    expect(parse({ ...s, party: [{ ...luka, statuses: all }] })?.party[0]?.statuses).toEqual(all);
  });

  it('rejects duplicate party members', () => {
    const s = base();
    expect(parse({ ...s, party: [luka, { ...luka, exp: 50 }] })).toBeNull();
    expect(parse({ ...s, party: [luka, mio] })?.party).toEqual([luka, mio]);
  });

  it('rejects schema versions below 1 or non-integer instead of migrating them as v1', () => {
    const v1 = {
      schemaVersion: 1,
      savedAt: 5,
      playTimeSec: 10,
      location: { map: 'map_minato_village', x: 10, y: 12, facing: 'down' },
      flags: {},
    };
    expect(parse({ ...v1, schemaVersion: 0 })).toBeNull();
    expect(parse({ ...v1, schemaVersion: -7 })).toBeNull();
    expect(parse({ ...v1, schemaVersion: 1.5 })).toBeNull();
    expect(parse(v1)?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('migrates a v1 save with a corrupt chapter flag to chapter 0', () => {
    const v1 = {
      schemaVersion: 1,
      savedAt: 5,
      playTimeSec: 10,
      location: { map: 'map_minato_village', x: 10, y: 12, facing: 'down' },
      flags: { 'main.chapter': -3 },
    };
    expect(parse(v1)?.chapter).toBe(0);
  });

  it('findSlotsWithSaves agrees with deserialize about unloadable and repaired slots', () => {
    const unknownMap = base();
    unknownMap.location = { map: 'map_minato_village_old', x: 1, y: 1, facing: 'down' };
    const offMap = base();
    offMap.location = { map: 'map_minato_village', x: 999, y: 999, facing: 'down' };
    const badQty = base();
    badQty.inventory = [{ itemId: 'it_herb', qty: 0 }];
    const store = new Map<string, string>([
      ['starfall.save.0', serialize(unknownMap)],
      ['starfall.save.1', serialize(offMap)],
      ['starfall.save.2', serialize(badQty)],
    ]);
    const read = (k: string) => store.get(k) ?? null;
    expect(findSlotsWithSaves(read, registryCtx)).toEqual([1]);
    // Without a registry only the value checks apply.
    expect(findSlotsWithSaves(read, ctx)).toEqual([0, 1]);
  });
});
