import { describe, expect, it } from 'vitest';

import { ENCOUNTERS, findEncounter, getEncounter } from '@data/encounters';

describe('encounters data', () => {
  it('has the 23 groups of GAME_DESIGN §8.2 with unique grp_ ids', () => {
    expect(ENCOUNTERS).toHaveLength(23);
    expect(new Set(ENCOUNTERS.map((g) => g.id)).size).toBe(23);
    for (const g of ENCOUNTERS) {
      expect(g.id).toMatch(/^grp_[a-z0-9_]+$/);
      expect(g.battleBgKey).toMatch(/^bg_[a-z0-9_]+$/);
      expect(g.bgmKey).toMatch(/^bgm_[a-z0-9_]+$/);
    }
  });

  it('references only enemy ids and keeps groups to at most three foes', () => {
    for (const g of ENCOUNTERS) {
      expect(g.enemies.length).toBeGreaterThan(0);
      const total = g.enemies.reduce((sum, e) => sum + e.count, 0);
      for (const e of g.enemies) {
        expect(e.enemyId).toMatch(/^(en|bo)_[a-z0-9_]+$/);
        expect(e.count).toBeGreaterThanOrEqual(1);
        expect(e.count).toBeLessThanOrEqual(3);
      }
      if (g.id.startsWith('grp_boss_')) {
        expect(total).toBe(1);
      } else {
        expect(total).toBeLessThanOrEqual(3);
      }
    }
  });

  it('separates boss groups (no escape, boss bgm, bo_ enemy) from normal ones', () => {
    const bosses = ENCOUNTERS.filter((g) => g.id.startsWith('grp_boss_'));
    expect(bosses).toHaveLength(5);
    for (const g of bosses) {
      expect(g.canEscape).toBe(false);
      expect(g.bgmKey).toBe('bgm_boss');
      expect(g.enemies).toHaveLength(1);
      expect(g.enemies[0]?.enemyId).toMatch(/^bo_/);
    }
    for (const g of ENCOUNTERS.filter((x) => !x.id.startsWith('grp_boss_'))) {
      expect(g.canEscape).toBe(true);
      expect(g.bgmKey).toBe('bgm_battle');
      for (const e of g.enemies) expect(e.enemyId).toMatch(/^en_/);
    }
  });

  it('matches a few spec rows exactly', () => {
    expect(getEncounter('grp_coast_b')).toEqual({
      id: 'grp_coast_b',
      enemies: [{ enemyId: 'en_lost_star_slime', count: 3 }],
      canEscape: true,
      battleBgKey: 'bg_coast',
      bgmKey: 'bgm_battle',
    });
    expect(getEncounter('grp_mine_d').enemies).toEqual([
      { enemyId: 'en_minecart_ghost', count: 1 },
      { enemyId: 'en_ore_spider', count: 1 },
      { enemyId: 'en_glow_bug', count: 1 },
    ]);
    expect(getEncounter('grp_tower_c').enemies).toEqual([
      { enemyId: 'en_false_light', count: 1 },
      { enemyId: 'en_lost_star_slime', count: 2 },
    ]);
    expect(getEncounter('grp_boss_nox2')).toEqual({
      id: 'grp_boss_nox2',
      enemies: [{ enemyId: 'bo_nox_phase2', count: 1 }],
      canEscape: false,
      battleBgKey: 'bg_lighthouse_top',
      bgmKey: 'bgm_boss',
    });
    expect(findEncounter('grp_nope')).toBeUndefined();
    expect(() => getEncounter('grp_nope')).toThrow();
  });
});
