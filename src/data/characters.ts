import type { CharacterDef, CharacterId } from './types';

/** Party members from docs/GAME_DESIGN.md §4.1, §4.3 (stats) and §4.4 (skills). */
export const CHARACTERS: Readonly<Record<CharacterId, CharacterDef>> = Object.freeze({
  ch_luka: {
    id: 'ch_luka',
    name: 'ルカ',
    base: { hp: 42, mp: 12, atk: 9, def: 7, spd: 8, luk: 6 },
    growth: { hp: 13.0, mp: 4.8, atk: 3.0, def: 2.2, spd: 2.1, luk: 1.2 },
    skills: [
      { level: 1, skillId: 'sk_star_light' },
      { level: 3, skillId: 'sk_first_aid' },
      { level: 7, skillId: 'sk_heavy_slash' },
      { level: 11, skillId: 'sk_star_rain' },
      { level: 15, skillId: 'sk_cure' },
      { level: 19, skillId: 'sk_light_edge' },
      { level: 24, skillId: 'sk_lighthouse_blessing' },
      { level: 28, skillId: 'sk_starfall' },
    ],
    initialEquipment: { weapon: 'eq_wp_luka_1', armor: 'eq_ar_cloth_luka', accessory: null },
    portraitKeyPrefix: 'portrait_luka',
    spriteKey: 'sprite_luka',
    joinMinLevel: 1,
  },
  ch_mio: {
    id: 'ch_mio',
    name: 'ミオ',
    base: { hp: 36, mp: 14, atk: 8, def: 5, spd: 11, luk: 8 },
    growth: { hp: 11.0, mp: 4.0, atk: 2.8, def: 1.8, spd: 3.0, luk: 2.0 },
    skills: [
      { level: 1, skillId: 'sk_double_shot' },
      { level: 4, skillId: 'sk_smoke_bomb' },
      { level: 8, skillId: 'sk_armor_break' },
      { level: 12, skillId: 'sk_tide_arrow' },
      { level: 16, skillId: 'sk_poison_needle' },
      { level: 20, skillId: 'sk_triple_shot' },
      { level: 26, skillId: 'sk_tidal_storm' },
    ],
    initialEquipment: { weapon: 'eq_wp_mio_1', armor: 'eq_ar_cloth_mio', accessory: null },
    portraitKeyPrefix: 'portrait_mio',
    spriteKey: 'sprite_mio',
    joinMinLevel: 1,
  },
  ch_goro: {
    id: 'ch_goro',
    name: 'ゴロー',
    base: { hp: 55, mp: 8, atk: 11, def: 10, spd: 5, luk: 4 },
    growth: { hp: 17.0, mp: 3.0, atk: 4.0, def: 3.0, spd: 1.0, luk: 1.0 },
    skills: [
      { level: 7, skillId: 'sk_smash' },
      { level: 7, skillId: 'sk_provoke' },
      { level: 10, skillId: 'sk_quake' },
      { level: 14, skillId: 'sk_war_cry' },
      { level: 18, skillId: 'sk_stun_hammer' },
      { level: 23, skillId: 'sk_boulder' },
      { level: 27, skillId: 'sk_mountain_break' },
    ],
    initialEquipment: { weapon: 'eq_wp_goro_1', armor: 'eq_ar_cloth_goro', accessory: null },
    portraitKeyPrefix: 'portrait_goro',
    spriteKey: 'sprite_goro',
    joinMinLevel: 7,
  },
});

export const CHARACTER_IDS: readonly CharacterId[] = ['ch_luka', 'ch_mio', 'ch_goro'];

export function getCharacter(id: CharacterId): CharacterDef {
  return CHARACTERS[id];
}
