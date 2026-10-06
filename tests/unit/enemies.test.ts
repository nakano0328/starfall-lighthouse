import { describe, expect, it } from 'vitest';

import { BOSS_IDS, ENEMIES, NORMAL_ENEMY_IDS, findEnemy, getEnemy } from '@data/enemies';
import { findItem } from '@data/items';

const BUILTIN_ACTIONS = new Set(['attack', 'guard', 'charge', 'double_act']);

describe('enemies data', () => {
  it('has the 14 normal enemies and 5 boss forms of GAME_DESIGN §8 with unique ids', () => {
    expect(ENEMIES).toHaveLength(19);
    expect(new Set(ENEMIES.map((e) => e.id)).size).toBe(19);
    expect(NORMAL_ENEMY_IDS).toHaveLength(14);
    expect(BOSS_IDS).toHaveLength(5);
    expect(BOSS_IDS).toEqual([
      'bo_old_tree_hollow',
      'bo_rock_golem',
      'bo_ruin_guardian',
      'bo_nox_phase1',
      'bo_nox_phase2',
    ]);
    for (const e of ENEMIES) {
      expect(e.id).toMatch(e.isBoss ? /^bo_[a-z0-9_]+$/ : /^en_[a-z0-9_]+$/);
      expect(NORMAL_ENEMY_IDS.includes(e.id)).toBe(!e.isBoss);
      expect(BOSS_IDS.includes(e.id)).toBe(e.isBoss);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.imageKey).toBe(`enemy_${e.id}`);
      expect(e.level).toBeGreaterThan(0);
      expect(e.stats.hp).toBeGreaterThan(0);
      expect(e.weak.some((w) => e.resist.includes(w))).toBe(false);
      expect(e.ai.length).toBeGreaterThan(0);
    }
  });

  it('gives every normal enemy the §5.8 default attack rule and a single chance drop', () => {
    for (const id of NORMAL_ENEMY_IDS) {
      const e = getEnemy(id);
      expect(e.isBoss).toBe(false);
      expect(e.ai).toContainEqual({
        priority: 0,
        cond: { type: 'always' },
        action: 'attack',
        target: 'random',
        weight: 60,
      });
      expect(e.statusResist).toEqual({});
      expect(e.scale).toBe(1);
      expect(e.drops).toHaveLength(1);
      expect(e.drops[0]?.chance).toBeGreaterThan(0);
      expect(e.drops[0]?.chance).toBeLessThan(1);
      expect(e.phaseNext).toBeUndefined();
      expect(e.onDefeatEvent).toBeUndefined();
    }
  });

  it('makes every boss immune to paralyze, halves other ailments and keeps def_down', () => {
    for (const id of BOSS_IDS) {
      const e = getEnemy(id);
      expect(e.isBoss).toBe(true);
      expect(e.statusResist).toEqual({
        paralyze: 1,
        poison: 0.5,
        blind: 0.5,
        def_down: 0,
        atk_up: 0,
      });
      expect(e.scale).toBeGreaterThanOrEqual(2);
      for (const d of e.drops) expect(d.chance).toBe(1);
    }
    expect(getEnemy('bo_old_tree_hollow').drops).toEqual([
      { itemId: 'it_fragment_1', chance: 1 },
      { itemId: 'it_potion_s', chance: 1, qty: 2 },
    ]);
    expect(getEnemy('bo_old_tree_hollow').onDefeatEvent).toBe('ev_forest_boss_win');
    expect(getEnemy('bo_rock_golem').onDefeatEvent).toBe('ev_mine_boss_win');
    expect(getEnemy('bo_ruin_guardian').onDefeatEvent).toBe('ev_ruins_boss_win');
  });

  it('matches the en_forest_wolf row of §8.1', () => {
    const wolf = getEnemy('en_forest_wolf');
    expect(wolf).toMatchObject({
      level: 4,
      stats: { hp: 70, atk: 16, def: 7, spd: 12 },
      element: 'none',
      weak: ['fire'],
      resist: [],
      exp: 15,
      gold: 10,
      drops: [{ itemId: 'it_potion_s', chance: 0.2 }],
    });
    expect(wolf.tags).toBeUndefined();
    expect(wolf.ai).toContainEqual({
      priority: 0,
      cond: { type: 'always' },
      action: 'sk_en_howl',
      target: 'self',
      weight: 30,
    });
    expect(wolf.ai).toContainEqual({
      priority: 0,
      cond: { type: 'hp_below', ratio: 0.5 },
      action: 'sk_en_bite',
      target: 'random',
      weight: 60,
    });
  });

  it('matches the en_shadow_hand row of §8.1 (shadow-tagged, resists three elements)', () => {
    const hand = getEnemy('en_shadow_hand');
    expect(hand).toMatchObject({
      level: 18,
      stats: { hp: 420, atk: 58, def: 36, spd: 20 },
      element: 'none',
      tags: ['shadow'],
      weak: ['light'],
      exp: 260,
      gold: 90,
    });
    expect([...hand.resist].sort()).toEqual(['earth', 'fire', 'water']);
    expect(hand.ai).toContainEqual({
      priority: 1,
      cond: { type: 'party_has_status', status: 'paralyze' },
      action: 'attack',
      target: 'lowest_hp',
      weight: 100,
    });
  });

  it('matches the other conditional 固有行動 rows of §8.1', () => {
    expect(getEnemy('en_minecart_ghost').ai).toContainEqual({
      priority: 1,
      cond: { type: 'turn_every', n: 3 },
      action: 'sk_en_cart_rush',
      target: 'all',
      weight: 100,
    });
    expect(getEnemy('en_ruin_statue').ai).toContainEqual({
      priority: 0,
      cond: { type: 'ally_count_below', n: 2 },
      action: 'guard',
      target: 'self',
      weight: 30,
    });
    expect(getEnemy('en_whisper_bat').tags).toEqual(['shadow']);
    expect(getEnemy('en_minecart_ghost').tags).toEqual(['shadow']);
  });

  it('matches the bo_rock_golem row and 行動表 of §8.4', () => {
    const golem = getEnemy('bo_rock_golem');
    expect(golem).toMatchObject({
      level: 10,
      stats: { hp: 1100, atk: 40, def: 30, spd: 6 },
      element: 'earth',
      weak: ['fire'],
      resist: ['earth'],
      exp: 450,
      gold: 600,
    });
    expect(golem.ai).toContainEqual({
      priority: 3,
      cond: { type: 'turn_every', n: 4 },
      action: 'sk_bo_harden',
      target: 'self',
      weight: 100,
      message: '体が黒く固まった！',
    });
    const hardened = golem.ai.filter(
      (r) => r.cond.type === 'self_has_status' && r.cond.status === 'harden',
    );
    expect(hardened.map((r) => r.action).sort()).toEqual(['attack', 'sk_bo_fragment_glow']);
    expect(golem.ai).toContainEqual({
      priority: 1,
      cond: { type: 'hp_below', ratio: 0.5 },
      action: 'sk_bo_big_quake',
      target: 'all',
      weight: 50,
    });
  });

  it('matches the bo_old_tree_hollow and bo_ruin_guardian 行動表 of §8.4', () => {
    const tree = getEnemy('bo_old_tree_hollow');
    expect(tree.ai[0]).toMatchObject({
      priority: 2,
      action: 'sk_bo_fragment_glow',
      message: '欠片が淡く光り、傷が癒えた',
    });
    expect(tree.ai).toContainEqual({
      priority: 1,
      cond: { type: 'hp_below', ratio: 0.5 },
      action: 'sk_bo_hollow_cry',
      target: 'all',
      weight: 100,
      once: true,
    });

    const guardian = getEnemy('bo_ruin_guardian');
    expect(guardian.ai).toContainEqual({
      priority: 3,
      cond: { type: 'charge', n: 1 },
      action: 'sk_bo_great_tide',
      target: 'all',
      weight: 100,
    });
    expect(guardian.ai.find((r) => r.action === 'sk_bo_tide_omen')).toMatchObject({
      priority: 2,
      cond: { type: 'turn_every', n: 4 },
      target: 'self',
    });
    expect(guardian.ai.find((r) => r.action === 'sk_bo_water_veil')).toMatchObject({
      priority: 1,
      cond: {
        type: 'all',
        conds: [
          { type: 'hp_below', ratio: 0.5 },
          { type: 'not_self_status', status: 'water_veil' },
        ],
      },
      weight: 40,
    });
  });

  it('chains the Nox phases and charges star extinction in phase 2', () => {
    const nox1 = getEnemy('bo_nox_phase1');
    expect(nox1).toMatchObject({
      stats: { hp: 2600, atk: 78, def: 48, spd: 30 },
      element: 'none',
      tags: ['shadow'],
      weak: ['light'],
      resist: [],
      exp: 0,
      gold: 0,
      drops: [],
      phaseNext: 'bo_nox_phase2',
    });
    expect(nox1.onDefeatEvent).toBeUndefined();
    // §8.4 形態移行: the mask breaks, three pages while the screen shakes.
    expect(nox1.phaseText).toHaveLength(3);
    expect(nox1.phaseText?.[0]).toBe('仮面が 割れた！');
    expect(nox1.ai).toContainEqual({
      priority: 1,
      cond: { type: 'hp_below', ratio: 0.5 },
      action: 'double_act',
      target: 'self',
      weight: 100,
      once: true,
    });
    expect(nox1.ai.find((r) => r.action === 'sk_bo_absorb_fragment')?.message).toBe(
      '欠片を吸い込んだ',
    );

    const nox2 = getEnemy('bo_nox_phase2');
    expect(nox2).toMatchObject({
      stats: { hp: 3600, atk: 92, def: 52, spd: 34 },
      exp: 3000,
      gold: 0,
      drops: [],
      scale: 2.67,
      onDefeatEvent: 'ev_nox_win',
    });
    expect(nox2.phaseNext).toBeUndefined();
    expect([...nox2.resist].sort()).toEqual(['earth', 'fire', 'water']);
    expect(nox2.ai).toContainEqual({
      priority: 4,
      cond: { type: 'charge', n: 2 },
      action: 'sk_bo_star_extinction',
      target: 'all',
      weight: 100,
    });
    expect(nox2.ai).toContainEqual({
      priority: 3,
      cond: { type: 'charge', n: 1 },
      action: 'charge',
      target: 'self',
      weight: 100,
      message: '星の光が吸い寄せられていく……',
    });
    expect(nox2.ai).toContainEqual({
      priority: 2,
      cond: { type: 'hp_below', ratio: 0.3 },
      action: 'charge',
      target: 'self',
      weight: 100,
    });
    expect(nox2.ai.some((r) => r.action === 'sk_bo_stardust_rain2')).toBe(true);
    expect(nox2.ai.some((r) => r.action === 'sk_bo_stardust_rain')).toBe(false);
  });

  it('drops only items that exist in src/data/items.ts', () => {
    for (const e of ENEMIES) {
      for (const d of e.drops) {
        expect(findItem(d.itemId), `${e.id} drops unknown ${d.itemId}`).toBeDefined();
        expect(d.chance).toBeGreaterThan(0);
        expect(d.chance).toBeLessThanOrEqual(1);
        if (d.qty !== undefined) expect(d.qty).toBeGreaterThan(0);
      }
    }
  });

  it('uses only built-in actions or sk_ ids in ai rules, with positive weights', () => {
    for (const e of ENEMIES) {
      for (const r of e.ai) {
        if (!BUILTIN_ACTIONS.has(r.action)) {
          expect(r.action, `${e.id}: ${r.action}`).toMatch(/^sk_(en|bo)_[a-z0-9_]+$/);
        }
        expect(Number.isInteger(r.weight)).toBe(true);
        expect(r.weight).toBeGreaterThan(0);
        expect(Number.isInteger(r.priority)).toBe(true);
        expect(r.priority).toBeGreaterThanOrEqual(0);
      }
      // Every enemy has at least one unconditional rule so the AI can always pick something.
      expect(e.ai.some((r) => r.cond.type === 'always')).toBe(true);
    }
  });

  it('looks enemies up by id', () => {
    expect(findEnemy('en_lost_star_slime')?.name).toBe('迷い星スライム');
    expect(findEnemy('en_nope')).toBeUndefined();
    expect(() => getEnemy('en_nope')).toThrow();
  });
});
