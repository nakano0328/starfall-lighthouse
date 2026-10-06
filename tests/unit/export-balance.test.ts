import { describe, expect, it } from 'vitest';

import { MAX_LEVEL } from '@core/party/exp';
import { ENCOUNTERS } from '@data/encounters';
import { ENEMIES } from '@data/enemies';
import { EQUIPMENT } from '@data/equipment';
import { SKILLS } from '@data/skills';

import {
  CHAPTER_PLANS,
  buildTables,
  chapterCurve,
  groupRewards,
  toCsv,
} from '../../scripts/export-balance';

describe('balance export (PLAN Phase 4 #5–6)', () => {
  it('builds one table per data set with a row per entry', () => {
    const tables = Object.fromEntries(buildTables().map((t) => [t.name, t]));
    expect(Object.keys(tables)).toEqual([
      'enemies',
      'encounters',
      'equipment',
      'skills',
      'level_curve',
      'chapter_curve',
    ]);
    expect(tables['enemies']?.rows).toHaveLength(ENEMIES.length);
    expect(tables['encounters']?.rows).toHaveLength(ENCOUNTERS.length);
    expect(tables['equipment']?.rows).toHaveLength(EQUIPMENT.length);
    expect(tables['skills']?.rows).toHaveLength(SKILLS.length);
    expect(tables['level_curve']?.rows).toHaveLength(MAX_LEVEL);
    expect(tables['chapter_curve']?.rows).toHaveLength(CHAPTER_PLANS.length);
    for (const t of Object.values(tables)) {
      for (const row of t.rows) expect(row, t.name).toHaveLength(t.header.length);
    }
  });

  it('sums a group payout per surviving member (§5.10)', () => {
    expect(
      groupRewards({
        id: 'g',
        enemies: [{ enemyId: 'en_lost_star_slime', count: 2 }],
        canEscape: true,
        battleBgKey: 'bg_coast',
        bgmKey: 'bgm_battle',
      }),
    ).toEqual({ exp: 2 * 7, gold: 2 * 5 });
  });

  it('accumulates the §6.2 route chapter by chapter and reaches the level targets', () => {
    const rows = chapterCurve();
    expect(rows.map((r) => r.name)).toEqual(CHAPTER_PLANS.map((p) => p.name));
    let total = 0;
    for (const r of rows) {
      total += r.expGain;
      expect(r.expTotal).toBe(total);
      expect(r.expGain).toBe(r.expPerBattle * r.battles + r.bossExp);
    }
    // The curve is the balance contract of docs/GAME_DESIGN.md §6.2: every chapter lands in range.
    expect(rows.map((r) => [r.name, r.level, r.ok])).toEqual(
      rows.map((r) => [r.name, r.level, true]),
    );
  });

  it('quotes CSV cells that contain commas or quotes', () => {
    const csv = toCsv({
      name: 't',
      header: ['a', 'b'],
      rows: [
        ['x,y', 'say "hi"'],
        [1, true],
      ],
    });
    expect(csv).toBe('a,b\n"x,y","say ""hi"""\n1,true\n');
  });
});
