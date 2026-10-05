import { describe, expect, it } from 'vitest';

import type { FlagMap } from '@core/flags';
import type { SavedMember } from '@core/save';
import { SAVE_SCHEMA_VERSION, createNewSave, deserialize, serialize } from '@core/save';
import { toSaveData } from '@core/state';
import { getMapSource } from '@data/maps';
import {
  MIGRATION_CONTEXT,
  loadGameState,
  maxQtyOf,
  newGameState,
  placeName,
} from '@data/saveContext';

/** ルカ Lv1 with initial equipment (GAME_DESIGN §4.3 / §12.2). */
const luka: SavedMember = {
  id: 'ch_luka',
  exp: 0,
  hp: 42,
  mp: 12,
  ko: false,
  equipment: { weapon: 'eq_wp_luka_1', armor: 'eq_ar_cloth_luka', accessory: null },
  statuses: [],
};
/** ミオ Lv1 with initial equipment. */
const mio: SavedMember = {
  ...luka,
  id: 'ch_mio',
  hp: 36,
  mp: 14,
  equipment: { weapon: 'eq_wp_mio_1', armor: 'eq_ar_cloth_mio', accessory: null },
};

const v1Save = (flags: FlagMap) => ({
  schemaVersion: 1,
  savedAt: 5,
  playTimeSec: 10,
  location: { map: 'map_minato_village', x: 10, y: 12, facing: 'down' },
  flags,
});

describe('MIGRATION_CONTEXT (v1 → v2, GAME_DESIGN §12.2)', () => {
  it('gives a v1 save gold 0, an empty bag and ルカ Lv1 with initial equipment', () => {
    const v1 = v1Save({});
    expect(deserialize(JSON.stringify(v1), MIGRATION_CONTEXT)).toEqual({
      ...v1,
      schemaVersion: SAVE_SCHEMA_VERSION,
      gold: 0,
      party: [luka],
      inventory: [],
      chapter: 0,
    });
  });

  it('adds ミオ when minato.mio_joined is set and copies main.chapter', () => {
    const v1 = v1Save({ 'main.chapter': 1, 'minato.mio_joined': true });
    expect(deserialize(JSON.stringify(v1), MIGRATION_CONTEXT)).toEqual({
      ...v1,
      schemaVersion: SAVE_SCHEMA_VERSION,
      gold: 0,
      party: [luka, mio],
      inventory: [],
      chapter: 1,
    });
  });

  it('ignores a falsy join flag', () => {
    const v1 = v1Save({ 'minato.mio_joined': false });
    expect(deserialize(JSON.stringify(v1), MIGRATION_CONTEXT)?.party).toEqual([luka]);
  });

  it('returns fresh member objects on every call', () => {
    const a = MIGRATION_CONTEXT.initialParty({});
    const b = MIGRATION_CONTEXT.initialParty({});
    expect(a).toEqual(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0]?.equipment).not.toBe(b[0]?.equipment);
  });
});

describe('maxQtyOf', () => {
  it('uses the item table caps and falls back to 99 for unknown ids', () => {
    expect(maxQtyOf('it_lamp_oil')).toBe(1);
    expect(maxQtyOf('it_herb')).toBe(99);
    expect(maxQtyOf('nope')).toBe(99);
  });
});

describe('placeName', () => {
  it('returns the map display name and falls back to the id', () => {
    expect(placeName('map_minato_village')).toBe('ミナト村');
    expect(placeName('map_minato_luka_house')).toBe('ルカの家');
    expect(placeName('zzz')).toBe('zzz');
  });
});

describe('newGameState', () => {
  it("starts in Luka's house on the opening trigger with ルカ alone", () => {
    const state = newGameState(0);
    expect(state.save.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(state.save.savedAt).toBe(0);
    expect(state.save.location).toEqual({ map: 'map_minato_luka_house', x: 7, y: 7, facing: 'up' });
    expect(state.party).toEqual([luka]);
    expect(state.gold).toBe(0);
    expect(state.inventory.size).toBe(0);
    expect(state.flags.toJSON()).toEqual({});

    const house = getMapSource(state.save.location.map);
    const { x, y } = state.save.location;
    expect(x).toBeLessThan(house.width);
    expect(y).toBeLessThan(house.height);
    expect(house.objects).toContainEqual(
      expect.objectContaining({ type: 'trigger', x, y, event_id: 'ev_opening' }),
    );
  });

  it('is loadable by the real context after a round trip', () => {
    const out = toSaveData(newGameState(1), 2);
    expect(deserialize(serialize(out), MIGRATION_CONTEXT)).toEqual(out);
  });
});

describe('loadGameState', () => {
  it('rebuilds the inventory with the real item caps', () => {
    const save = createNewSave(1, [luka]);
    save.gold = 120;
    save.inventory = [
      { itemId: 'it_herb', qty: 3 },
      { itemId: 'it_lamp_oil', qty: 5 },
      { itemId: 'it_unknown', qty: 150 },
    ];
    const state = loadGameState(save);
    expect(state.gold).toBe(120);
    expect(state.inventory.count('it_herb')).toBe(3);
    // Key items are capped at one even when the slot claims more.
    expect(state.inventory.count('it_lamp_oil')).toBe(1);
    // Unknown ids keep the 99 fallback cap.
    expect(state.inventory.count('it_unknown')).toBe(99);
    expect(state.party).toEqual([luka]);
    expect(state.party[0]).not.toBe(save.party[0]);

    expect(toSaveData(state, 9).inventory).toEqual([
      { itemId: 'it_herb', qty: 3 },
      { itemId: 'it_lamp_oil', qty: 1 },
      { itemId: 'it_unknown', qty: 99 },
    ]);
  });
});
