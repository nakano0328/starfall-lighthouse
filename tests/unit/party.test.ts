import { describe, expect, it } from 'vitest';

import { createMember, memberLevel, memberStats, useItemOnMember } from '@core/party/member';
import { addBonuses, statsAtLevel } from '@core/party/stats';
import { CHARACTERS, CHARACTER_IDS } from '@data/characters';
import { getItem } from '@data/items';

describe('stats (§4.3)', () => {
  it('reproduces the spec milestones', () => {
    const luka = CHARACTERS.ch_luka;
    expect(statsAtLevel(luka.base, luka.growth, 1)).toEqual({
      hp: 42,
      mp: 12,
      atk: 9,
      def: 7,
      spd: 8,
      luk: 6,
    });
    expect(statsAtLevel(luka.base, luka.growth, 5)).toEqual({
      hp: 94,
      mp: 31,
      atk: 21,
      def: 15,
      spd: 16,
      luk: 10,
    });
    expect(statsAtLevel(luka.base, luka.growth, 30)).toEqual({
      hp: 419,
      mp: 151,
      atk: 96,
      def: 70,
      spd: 68,
      luk: 40,
    });
    const mio = CHARACTERS.ch_mio;
    expect(statsAtLevel(mio.base, mio.growth, 10)).toEqual({
      hp: 135,
      mp: 50,
      atk: 33,
      def: 21,
      spd: 38,
      luk: 26,
    });
    const goro = CHARACTERS.ch_goro;
    expect(statsAtLevel(goro.base, goro.growth, 16)).toEqual({
      hp: 310,
      mp: 53,
      atk: 71,
      def: 55,
      spd: 20,
      luk: 19,
    });
  });

  it('adds equipment bonuses', () => {
    expect(
      addBonuses({ hp: 1, mp: 1, atk: 1, def: 1, spd: 1, luk: 1 }, { atk: 3 }, { def: 2, luk: -1 }),
    ).toEqual({ hp: 1, mp: 1, atk: 4, def: 3, spd: 1, luk: 0 });
  });
});

describe('characters data', () => {
  it('lists the three members with skills by level', () => {
    for (const id of CHARACTER_IDS) {
      const def = CHARACTERS[id];
      expect(def.id).toBe(id);
      expect(def.skills.length).toBeGreaterThanOrEqual(7);
      for (const s of def.skills) {
        expect(s.skillId).toMatch(/^sk_[a-z_]+$/);
        expect(s.level).toBeGreaterThanOrEqual(def.joinMinLevel);
      }
    }
    expect(CHARACTERS.ch_goro.joinMinLevel).toBe(7);
  });
});

describe('party member', () => {
  it('starts at full HP/MP for its level with the initial equipment', () => {
    const m = createMember(CHARACTERS.ch_luka);
    expect(m).toMatchObject({ id: 'ch_luka', exp: 0, hp: 42, mp: 12, ko: false, statuses: [] });
    expect(m.equipment).toEqual({
      weapon: 'eq_wp_luka_1',
      armor: 'eq_ar_cloth_luka',
      accessory: null,
    });
    const g = createMember(CHARACTERS.ch_goro, 991);
    expect(memberLevel(g)).toBe(7);
    expect(g.hp).toBe(memberStats(CHARACTERS.ch_goro, g).hp);
  });

  it('uses field items: heal, mp, cure, revive, and refuses when nothing changes', () => {
    const def = CHARACTERS.ch_luka;
    const m = createMember(def);
    expect(useItemOnMember(getItem('it_herb'), def, m)).toEqual({ ok: false, reason: 'no_effect' });
    m.hp = 10;
    expect(useItemOnMember(getItem('it_herb'), def, m)).toEqual({
      ok: true,
      message: 'ルカの HP が 30 回復した。',
    });
    expect(m.hp).toBe(40);
    expect(useItemOnMember(getItem('it_potion_l'), def, m)).toEqual({
      ok: true,
      message: 'ルカの HP が 2 回復した。',
    });
    m.mp = 0;
    expect(useItemOnMember(getItem('it_star_drop'), def, m).ok).toBe(true);
    expect(m.mp).toBe(12);
    expect(useItemOnMember(getItem('it_antidote'), def, m)).toEqual({
      ok: false,
      reason: 'no_effect',
    });
    m.statuses = ['poison', 'blind'];
    expect(useItemOnMember(getItem('it_antidote'), def, m).ok).toBe(true);
    expect(m.statuses).toEqual(['blind']);
    expect(useItemOnMember(getItem('it_panacea'), def, m).ok).toBe(true);
    expect(m.statuses).toEqual([]);
    m.ko = true;
    m.hp = 0;
    m.mp = 0;
    expect(useItemOnMember(getItem('it_herb'), def, m)).toEqual({ ok: false, reason: 'no_effect' });
    expect(useItemOnMember(getItem('it_star_drop'), def, m)).toEqual({
      ok: false,
      reason: 'no_effect',
    });
    expect(m.mp).toBe(0);
    // Curing a KO member is allowed (the spec does not forbid it); pinned as current behaviour.
    m.statuses = ['poison'];
    expect(useItemOnMember(getItem('it_antidote'), def, m).ok).toBe(true);
    expect(m.statuses).toEqual([]);
    expect(useItemOnMember(getItem('it_star_feather'), def, m)).toEqual({
      ok: true,
      message: 'ルカは 目を覚ました！',
    });
    expect(m.hp).toBe(21);
    expect(useItemOnMember(getItem('it_key_mine'), def, m)).toEqual({
      ok: false,
      reason: 'not_usable',
    });
    expect(useItemOnMember(getItem('it_fire_stone'), def, m)).toEqual({
      ok: false,
      reason: 'not_usable',
    });
  });

  it('refuses it_return_feather in the menu until escape_dungeon is implemented (Phase 4)', () => {
    // The item is usableInField per §7.1, so the menu enables つかう, but the field
    // helper has no dungeon `entrance` to return to yet. When escape_dungeon is
    // wired up this expectation must change.
    const def = CHARACTERS.ch_luka;
    const feather = getItem('it_return_feather');
    expect(feather.usableInField).toBe(true);
    expect(feather.effect.type).toBe('escape_dungeon');
    expect(useItemOnMember(feather, def, createMember(def))).toEqual({
      ok: false,
      reason: 'not_usable',
    });
  });
});
