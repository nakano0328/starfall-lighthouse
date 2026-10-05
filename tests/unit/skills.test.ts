import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@data/characters';
import { SKILLS, findSkill, getSkill } from '@data/skills';
import type { SkillDef } from '@data/types';

const PARTY = SKILLS.filter((s) => !s.enemyOnly);
const ENEMY = SKILLS.filter((s) => s.enemyOnly);

/** Heal formula of GAME_DESIGN §4.4: add + Lv × lvMult. */
const healAt = (s: SkillDef, level: number): number => s.add + level * (s.lvMult ?? 0);

/** Durations of §5.6 (five statuses + taunt) and §8.3 (boss self-buffs). */
const TURNS = {
  poison: 5,
  paralyze: 2,
  blind: 4,
  def_down: 3,
  atk_up: 3,
  taunt: 3,
  harden: 2,
  water_veil: 2,
  charging: 1,
} as const;

describe('skills data', () => {
  it('has 22 party skills and 38 enemy-only skills with unique ids', () => {
    expect(SKILLS).toHaveLength(60);
    expect(PARTY).toHaveLength(22);
    expect(ENEMY).toHaveLength(38);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(SKILLS.length);
  });

  it('uses the §2 id prefixes and makes enemy skills free', () => {
    for (const s of PARTY) {
      expect(s.id).toMatch(/^sk_[a-z0-9_]+$/);
      expect(s.id).not.toMatch(/^sk_(en|bo)_/);
      expect(s.mpCost).toBeGreaterThan(0);
    }
    for (const s of ENEMY) {
      expect(s.id).toMatch(/^sk_(en|bo)_[a-z0-9_]+$/);
      expect(s.mpCost).toBe(0);
    }
    for (const s of SKILLS) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('keeps status chances within 0..1 and durations from §5.6', () => {
    for (const s of SKILLS) {
      for (const st of s.statuses ?? []) {
        expect(st.chance, s.id).toBeGreaterThan(0);
        expect(st.chance, s.id).toBeLessThanOrEqual(1);
        expect(st.turns, s.id).toBe(TURNS[st.status]);
      }
      if (s.hits !== undefined) expect(s.hits, s.id).toBeGreaterThanOrEqual(2);
      if (s.kind === 'heal') expect(s.mult, s.id).toBe(0);
    }
  });

  it('assigns SE keys by kind and element', () => {
    const magicSe = {
      light: 'se_magic_light',
      water: 'se_magic_water',
      earth: 'se_magic_earth',
      fire: 'se_magic_fire',
    };
    for (const s of SKILLS) {
      switch (s.kind) {
        case 'physical':
          expect(s.seKey, s.id).toBe('se_slash');
          break;
        case 'heal':
          expect(s.seKey, s.id).toBe('se_heal');
          break;
        case 'buff':
        case 'debuff':
          expect(s.seKey, s.id).toBe('se_buff');
          break;
        case 'magic':
          expect(s.seKey, s.id).toMatch(/^se_magic_/);
          if (s.element in magicSe)
            expect(s.seKey, s.id).toBe(magicSe[s.element as keyof typeof magicSe]);
          break;
        case 'special':
          expect(s.seKey, s.id).toMatch(/^se_/);
          break;
      }
    }
  });

  it('matches the ルカ rows of §4.4', () => {
    expect(getSkill('sk_star_light')).toMatchObject({
      mpCost: 4,
      kind: 'magic',
      scope: 'enemy_single',
      element: 'light',
      mult: 1.2,
      add: 6,
      seKey: 'se_magic_light',
    });
    const firstAid = getSkill('sk_first_aid');
    expect(firstAid).toMatchObject({
      mpCost: 5,
      kind: 'heal',
      scope: 'ally_single',
      element: 'none',
      add: 25,
      lvMult: 3,
    });
    expect(healAt(firstAid, 10)).toBe(55);
    expect(getSkill('sk_heavy_slash')).toMatchObject({
      mpCost: 6,
      kind: 'physical',
      element: 'weapon',
      mult: 1.6,
      add: 0,
    });
    expect(getSkill('sk_star_rain')).toMatchObject({
      mpCost: 10,
      scope: 'enemy_all',
      mult: 1.0,
      add: 10,
    });
    const cure = getSkill('sk_cure');
    expect(cure).toMatchObject({ mpCost: 8, kind: 'heal', add: 20, lvMult: 2 });
    expect(cure.cures).toEqual(['poison', 'paralyze', 'blind', 'def_down']);
    expect(getSkill('sk_light_edge')).toMatchObject({
      mpCost: 14,
      kind: 'physical',
      element: 'light',
      mult: 2.2,
      seKey: 'se_slash',
    });
    expect(getSkill('sk_lighthouse_blessing')).toMatchObject({
      mpCost: 18,
      scope: 'ally_all',
      add: 40,
      lvMult: 4,
    });
    expect(getSkill('sk_starfall')).toMatchObject({
      mpCost: 24,
      kind: 'physical',
      element: 'light',
      mult: 3.0,
      add: 30,
      critBonus: 20,
    });
  });

  it('matches the ミオ rows of §4.4', () => {
    expect(getSkill('sk_double_shot')).toMatchObject({
      mpCost: 4,
      kind: 'physical',
      element: 'weapon',
      mult: 0.7,
      hits: 2,
    });
    expect(getSkill('sk_smoke_bomb')).toMatchObject({
      mpCost: 5,
      kind: 'debuff',
      scope: 'enemy_all',
      mult: 0,
      add: 0,
      priority: true,
      statuses: [{ status: 'blind', chance: 0.7, turns: 4, target: 'target' }],
    });
    expect(getSkill('sk_armor_break')).toMatchObject({ mpCost: 6, mult: 1.0 });
    expect(getSkill('sk_armor_break').statuses).toEqual([
      { status: 'def_down', chance: 0.8, turns: 3, target: 'target' },
    ]);
    expect(getSkill('sk_tide_arrow')).toMatchObject({
      mpCost: 9,
      kind: 'magic',
      element: 'water',
      mult: 1.5,
      add: 8,
      seKey: 'se_magic_water',
    });
    expect(getSkill('sk_poison_needle')).toMatchObject({
      mult: 0.9,
      statuses: [{ status: 'poison', chance: 0.9, turns: 5 }],
    });
    expect(getSkill('sk_triple_shot')).toMatchObject({
      mpCost: 12,
      scope: 'enemy_random',
      hits: 3,
      mult: 0.8,
    });
    expect(getSkill('sk_tidal_storm')).toMatchObject({
      mpCost: 20,
      scope: 'enemy_all',
      element: 'water',
      mult: 1.4,
      add: 15,
    });
  });

  it('matches the ゴロー rows of §4.4', () => {
    expect(getSkill('sk_smash')).toMatchObject({
      mpCost: 5,
      kind: 'physical',
      element: 'weapon',
      mult: 1.8,
    });
    expect(getSkill('sk_provoke')).toMatchObject({
      mpCost: 3,
      kind: 'buff',
      scope: 'self',
      priority: true,
      statuses: [{ status: 'taunt', chance: 1, turns: 3, target: 'self' }],
    });
    expect(getSkill('sk_quake')).toMatchObject({
      mpCost: 9,
      kind: 'magic',
      scope: 'enemy_all',
      element: 'earth',
      mult: 1.1,
      add: 8,
      seKey: 'se_magic_earth',
    });
    expect(getSkill('sk_war_cry')).toMatchObject({
      mpCost: 8,
      kind: 'buff',
      scope: 'ally_all',
      statuses: [{ status: 'atk_up', chance: 1, turns: 3, target: 'target' }],
    });
    expect(getSkill('sk_stun_hammer')).toMatchObject({ mpCost: 10, mult: 1.4 });
    expect(getSkill('sk_stun_hammer').statuses).toEqual([
      { status: 'paralyze', chance: 0.6, turns: 2, target: 'target' },
    ]);
    expect(getSkill('sk_boulder')).toMatchObject({
      mpCost: 16,
      kind: 'physical',
      element: 'earth',
      mult: 2.4,
      add: 20,
    });
    expect(getSkill('sk_mountain_break')).toMatchObject({
      mpCost: 22,
      scope: 'enemy_all',
      element: 'earth',
      mult: 1.6,
      add: 20,
    });
  });

  it('matches the enemy rows of §8.3', () => {
    expect(getSkill('sk_en_star_spit')).toMatchObject({
      enemyOnly: true,
      kind: 'magic',
      scope: 'enemy_single',
      element: 'light',
      mult: 1.0,
    });
    expect(getSkill('sk_en_shriek')).toMatchObject({
      kind: 'debuff',
      scope: 'enemy_single',
      statuses: [{ status: 'blind', chance: 0.5, turns: 4, target: 'target' }],
    });
    expect(getSkill('sk_en_poison_spore')).toMatchObject({
      scope: 'enemy_all',
      statuses: [{ status: 'poison', chance: 0.4, turns: 5 }],
    });
    expect(getSkill('sk_en_howl')).toMatchObject({
      kind: 'buff',
      scope: 'self',
      statuses: [{ status: 'atk_up', chance: 1, turns: 3, target: 'self' }],
    });
    expect(getSkill('sk_en_bite')).toMatchObject({ kind: 'physical', element: 'none', mult: 1.4 });
    expect(getSkill('sk_en_thorn_whip')).toMatchObject({
      element: 'earth',
      mult: 1.3,
      statuses: [{ status: 'poison', chance: 0.3 }],
    });
    expect(getSkill('sk_en_ghost_touch')).toMatchObject({
      mult: 1.0,
      statuses: [{ status: 'paralyze', chance: 0.5, turns: 2 }],
    });
    expect(getSkill('sk_en_cart_rush')).toMatchObject({
      kind: 'physical',
      scope: 'enemy_all',
      mult: 0.9,
    });
    expect(getSkill('sk_en_shell_crush')).toMatchObject({
      mult: 1.4,
      statuses: [{ status: 'def_down', chance: 0.6, turns: 3 }],
    });
    expect(getSkill('sk_en_spear_thrust')).toMatchObject({ kind: 'physical', mult: 1.5 });
    expect(getSkill('sk_en_void_drain')).toMatchObject({
      kind: 'physical',
      mult: 1.0,
      mpDrain: 10,
    });
    expect(getSkill('sk_en_tide_splash')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_all',
      element: 'water',
      mult: 1.0,
    });
    expect(getSkill('sk_en_shadow_grip')).toMatchObject({
      mult: 1.3,
      statuses: [{ status: 'paralyze', chance: 0.4 }],
    });
    expect(getSkill('sk_en_cold_flame')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_all',
      element: 'fire',
      mult: 1.1,
      seKey: 'se_magic_fire',
    });
    expect(getSkill('sk_en_mock').statuses).toEqual([
      { status: 'def_down', chance: 0.7, turns: 3, target: 'target' },
    ]);
  });

  it('matches the boss rows of §8.3', () => {
    expect(getSkill('sk_bo_root_bind')).toMatchObject({
      element: 'earth',
      mult: 1.4,
      statuses: [{ status: 'paralyze', chance: 0.5 }],
    });
    expect(getSkill('sk_bo_pollen')).toMatchObject({
      kind: 'debuff',
      scope: 'enemy_all',
      statuses: [{ status: 'poison', chance: 0.6 }],
    });
    expect(getSkill('sk_bo_trunk_quake')).toMatchObject({
      kind: 'physical',
      scope: 'enemy_all',
      element: 'earth',
      mult: 0.9,
    });
    expect(getSkill('sk_bo_hollow_cry')).toMatchObject({
      kind: 'debuff',
      scope: 'enemy_all',
      statuses: [
        { status: 'blind', chance: 0.7, turns: 4, target: 'target' },
        { status: 'atk_up', chance: 1, turns: 3, target: 'self' },
      ],
    });

    const glow = getSkill('sk_bo_fragment_glow');
    expect(glow).toMatchObject({ kind: 'heal', scope: 'self', add: -30, lvMult: 18 });
    expect(healAt(glow, 5)).toBe(60);
    expect(healAt(glow, 10)).toBe(150);

    expect(getSkill('sk_bo_harden')).toMatchObject({
      kind: 'buff',
      scope: 'self',
      statuses: [{ status: 'harden', chance: 1, turns: 2, target: 'self' }],
    });
    expect(getSkill('sk_bo_rock_throw')).toMatchObject({
      kind: 'physical',
      element: 'earth',
      mult: 1.6,
    });
    expect(getSkill('sk_bo_big_quake')).toMatchObject({
      kind: 'physical',
      scope: 'enemy_all',
      element: 'earth',
      mult: 1.2,
    });

    expect(getSkill('sk_bo_trident')).toMatchObject({
      element: 'water',
      mult: 1.6,
      statuses: [{ status: 'def_down', chance: 0.5 }],
    });
    expect(getSkill('sk_bo_stone_arm')).toMatchObject({
      kind: 'physical',
      element: 'none',
      mult: 1.2,
    });
    expect(getSkill('sk_bo_tide_omen')).toMatchObject({
      kind: 'special',
      scope: 'none',
      element: 'none',
      mult: 0,
      add: 0,
    });
    expect(getSkill('sk_bo_great_tide')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_all',
      element: 'water',
      mult: 2.0,
    });
    expect(getSkill('sk_bo_water_veil')).toMatchObject({
      kind: 'buff',
      scope: 'self',
      statuses: [{ status: 'water_veil', chance: 1, turns: 2, target: 'self' }],
    });

    expect(getSkill('sk_bo_shadow_blade')).toMatchObject({
      kind: 'physical',
      element: 'none',
      mult: 1.6,
    });
    expect(getSkill('sk_bo_stardust_rain')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_all',
      element: 'none',
      mult: 1.1,
    });
    expect(getSkill('sk_bo_stardust_rain2')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_all',
      element: 'none',
      mult: 1.3,
    });
    const absorb = getSkill('sk_bo_absorb_fragment');
    expect(absorb).toMatchObject({ kind: 'heal', scope: 'self', add: 300 });
    expect(healAt(absorb, 25)).toBe(300);
    expect(getSkill('sk_bo_night_veil').statuses).toEqual([
      { status: 'blind', chance: 0.8, turns: 4, target: 'target' },
    ]);
    expect(getSkill('sk_bo_falling_star')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_single',
      element: 'none',
      mult: 2.5,
    });
    expect(getSkill('sk_bo_star_extinction')).toMatchObject({
      kind: 'magic',
      scope: 'enemy_all',
      element: 'none',
      mult: 3.0,
    });
  });

  it('defines every skill the party members learn, and nothing unlearnable', () => {
    const learned = new Set<string>();
    for (const ch of Object.values(CHARACTERS)) {
      for (const { skillId } of ch.skills) {
        expect(findSkill(skillId), skillId).toBeDefined();
        expect(getSkill(skillId).enemyOnly, skillId).toBeFalsy();
        learned.add(skillId);
      }
    }
    for (const s of PARTY) expect(learned.has(s.id), s.id).toBe(true);
  });

  it('throws from getSkill and returns undefined from findSkill for unknown ids', () => {
    expect(findSkill('sk_nope')).toBeUndefined();
    expect(() => getSkill('sk_nope')).toThrow('unknown skill: sk_nope');
  });
});
