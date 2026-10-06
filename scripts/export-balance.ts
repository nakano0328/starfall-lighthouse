import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAX_LEVEL, expForLevel, levelFromExp, nextExp } from '@core/party/exp';
import { statsAtLevel } from '@core/party/stats';
import { CHARACTERS } from '@data/characters';
import { ENCOUNTERS, getEncounter } from '@data/encounters';
import { ENEMIES, getEnemy } from '@data/enemies';
import { EQUIPMENT } from '@data/equipment';
import { SKILLS } from '@data/skills';
import type { CharacterId, EncounterGroup, Stats } from '@data/types';

/**
 * Balance export (docs/PLAN.md Phase 4 #5–6): dumps the enemy, encounter, equipment and
 * skill tables plus the level curve to CSV under docs/balance/, and checks the §6.2
 * per-chapter level targets against the data. Run with `npm run balance`.
 */

export interface BalanceTable {
  name: string;
  header: string[];
  rows: (string | number | boolean)[][];
}

const STAT_KEYS: (keyof Stats)[] = ['hp', 'mp', 'atk', 'def', 'spd', 'luk'];
const PARTY: CharacterId[] = ['ch_luka', 'ch_mio', 'ch_goro'];

/** The planned route through each chapter (docs/GAME_DESIGN.md §6.2). */
export interface ChapterPlan {
  name: string;
  groups: string[];
  /** Normal battles on the way, boss excluded. */
  battles: number;
  boss: string;
  /** EXP per normal battle and total EXP gain the spec table assumes. */
  specExpPerBattle: number;
  specExpGain: number;
  targetMin: number;
  targetMax: number;
}

export const CHAPTER_PLANS: readonly ChapterPlan[] = [
  {
    name: '海岸街道・森（1 章）',
    groups: [
      'grp_coast_a',
      'grp_coast_b',
      'grp_forest_a',
      'grp_forest_b',
      'grp_forest_c',
      'grp_forest_d',
    ],
    battles: 12,
    boss: 'grp_boss_tree',
    specExpPerBattle: 30,
    specExpGain: 380,
    targetMin: 5,
    targetMax: 6,
  },
  {
    name: '山道・廃坑（2 章）',
    groups: ['grp_mine_a', 'grp_mine_b', 'grp_mine_c', 'grp_mine_d'],
    battles: 14,
    boss: 'grp_boss_golem',
    specExpPerBattle: 130,
    specExpGain: 2300,
    targetMin: 10,
    targetMax: 10,
  },
  {
    name: '磯の道・遺跡（3 章）',
    groups: ['grp_ruins_a', 'grp_ruins_b', 'grp_ruins_c', 'grp_ruins_d'],
    battles: 14,
    boss: 'grp_boss_guardian',
    specExpPerBattle: 400,
    specExpGain: 6900,
    targetMin: 16,
    targetMax: 16,
  },
  {
    name: '灯台（終章）',
    groups: ['grp_tower_a', 'grp_tower_b', 'grp_tower_c', 'grp_tower_d'],
    battles: 16,
    boss: 'grp_boss_nox2',
    specExpPerBattle: 800,
    specExpGain: 12800,
    targetMin: 22,
    targetMax: 25,
  },
];

const list = (xs: readonly string[]): string => xs.join(' ');

/** EXP and gold a group pays out to each surviving member (§5.10: full EXP to survivors). */
export function groupRewards(group: EncounterGroup): { exp: number; gold: number } {
  let exp = 0;
  let gold = 0;
  for (const { enemyId, count } of group.enemies) {
    const def = getEnemy(enemyId);
    exp += def.exp * count;
    gold += def.gold * count;
  }
  return { exp, gold };
}

export function enemyTable(): BalanceTable {
  return {
    name: 'enemies',
    header: [
      'id',
      'name',
      'level',
      'boss',
      'hp',
      'atk',
      'def',
      'spd',
      'element',
      'weak',
      'resist',
      'exp',
      'gold',
      'drops',
      'phase_next',
    ],
    rows: ENEMIES.map((e) => [
      e.id,
      e.name,
      e.level,
      e.isBoss,
      e.stats.hp,
      e.stats.atk,
      e.stats.def,
      e.stats.spd,
      e.element,
      list(e.weak),
      list(e.resist),
      e.exp,
      e.gold,
      e.drops.map((d) => `${d.itemId}×${d.qty ?? 1}@${Math.round(d.chance * 100)}%`).join(' '),
      e.phaseNext ?? '',
    ]),
  };
}

export function encounterTable(): BalanceTable {
  return {
    name: 'encounters',
    header: ['id', 'enemies', 'avg_level', 'exp', 'gold', 'can_escape', 'battle_bg'],
    rows: ENCOUNTERS.map((g) => {
      const { exp, gold } = groupRewards(g);
      const count = g.enemies.reduce((n, e) => n + e.count, 0);
      const level =
        g.enemies.reduce((sum, e) => sum + getEnemy(e.enemyId).level * e.count, 0) / count;
      return [
        g.id,
        g.enemies.map((e) => `${e.enemyId}×${e.count}`).join(' '),
        Math.round(level * 10) / 10,
        exp,
        gold,
        g.canEscape,
        g.battleBgKey,
      ];
    }),
  };
}

export function equipmentTable(): BalanceTable {
  return {
    name: 'equipment',
    header: [
      'id',
      'name',
      'slot',
      'tier',
      'allowed',
      'price',
      ...STAT_KEYS,
      'element',
      'resist',
      'immune',
    ],
    rows: EQUIPMENT.map((q) => [
      q.id,
      q.name,
      q.slot,
      q.tier,
      list(q.allowed),
      q.price,
      ...STAT_KEYS.map((k) => q.bonus[k] ?? 0),
      q.element ?? '',
      Object.entries(q.resist ?? {})
        .map(([el, v]) => `${el}×${v}`)
        .join(' '),
      list(q.immune ?? []),
    ]),
  };
}

export function skillTable(): BalanceTable {
  return {
    name: 'skills',
    header: [
      'id',
      'name',
      'kind',
      'scope',
      'element',
      'mp',
      'mult',
      'add',
      'lv_mult',
      'hits',
      'accuracy',
      'enemy_only',
      'statuses',
    ],
    rows: SKILLS.map((s) => [
      s.id,
      s.name,
      s.kind,
      s.scope,
      s.element,
      s.mpCost,
      s.mult,
      s.add,
      s.lvMult ?? '',
      s.hits ?? 1,
      s.accuracy ?? '',
      s.enemyOnly ?? false,
      (s.statuses ?? [])
        .map((st) => `${st.status}@${Math.round(st.chance * 100)}%/${st.turns}t`)
        .join(' '),
    ]),
  };
}

/** Stats and skills of every member at each level (§4.3 / §6.1 / §6.4). */
export function levelCurveTable(): BalanceTable {
  const header = ['level', 'exp_total', 'exp_to_next'];
  for (const id of PARTY) {
    const name = CHARACTERS[id].name;
    for (const k of STAT_KEYS) header.push(`${name}_${k}`);
    header.push(`${name}_skills`);
  }
  const rows: BalanceTable['rows'] = [];
  for (let lv = 1; lv <= MAX_LEVEL; lv += 1) {
    const row: (string | number)[] = [lv, expForLevel(lv), nextExp(lv)];
    for (const id of PARTY) {
      const def = CHARACTERS[id];
      const stats = statsAtLevel(def.base, def.growth, lv);
      for (const k of STAT_KEYS) row.push(stats[k]);
      row.push(list(def.skills.filter((s) => s.level === lv).map((s) => s.skillId)));
    }
    rows.push(row);
  }
  return { name: 'level_curve', header, rows };
}

export interface ChapterCurveRow {
  name: string;
  expPerBattle: number;
  specExpPerBattle: number;
  battles: number;
  bossExp: number;
  expGain: number;
  specExpGain: number;
  expTotal: number;
  level: number;
  targetMin: number;
  targetMax: number;
  ok: boolean;
}

/**
 * Walks the §6.2 route with the real encounter data: the average payout of the
 * chapter's groups times the planned battle count, plus the boss, accumulated for a
 * member who fights everything from the start.
 */
export function chapterCurve(plans: readonly ChapterPlan[] = CHAPTER_PLANS): ChapterCurveRow[] {
  let expTotal = 0;
  return plans.map((p) => {
    const payouts = p.groups.map((id) => groupRewards(getEncounter(id)).exp);
    const expPerBattle = Math.round(payouts.reduce((a, b) => a + b, 0) / payouts.length);
    const bossExp = groupRewards(getEncounter(p.boss)).exp;
    const expGain = expPerBattle * p.battles + bossExp;
    expTotal += expGain;
    const level = levelFromExp(expTotal);
    return {
      name: p.name,
      expPerBattle,
      specExpPerBattle: p.specExpPerBattle,
      battles: p.battles,
      bossExp,
      expGain,
      specExpGain: p.specExpGain,
      expTotal,
      level,
      targetMin: p.targetMin,
      targetMax: p.targetMax,
      ok: level >= p.targetMin && level <= p.targetMax,
    };
  });
}

export function chapterCurveTable(): BalanceTable {
  return {
    name: 'chapter_curve',
    header: [
      'chapter',
      'exp_per_battle',
      'spec_exp_per_battle',
      'battles',
      'boss_exp',
      'exp_gain',
      'spec_exp_gain',
      'exp_total',
      'level',
      'target',
      'ok',
    ],
    rows: chapterCurve().map((r) => [
      r.name,
      r.expPerBattle,
      r.specExpPerBattle,
      r.battles,
      r.bossExp,
      r.expGain,
      r.specExpGain,
      r.expTotal,
      r.level,
      r.targetMin === r.targetMax ? `${r.targetMin}` : `${r.targetMin}〜${r.targetMax}`,
      r.ok,
    ]),
  };
}

export function buildTables(): BalanceTable[] {
  return [
    enemyTable(),
    encounterTable(),
    equipmentTable(),
    skillTable(),
    levelCurveTable(),
    chapterCurveTable(),
  ];
}

const cell = (v: string | number | boolean): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(table: BalanceTable): string {
  const lines = [table.header, ...table.rows].map((row) => row.map(cell).join(','));
  return `${lines.join('\n')}\n`;
}

/** Writes every table to `outDir` and prints the chapter check. */
export function main(args: string[] = []): void {
  const outDir = args[0] ?? join('docs', 'balance');
  mkdirSync(outDir, { recursive: true });
  for (const table of buildTables()) {
    writeFileSync(join(outDir, `${table.name}.csv`), toCsv(table), 'utf8');
  }
  const check = chapterCurve();
  console.info(`balance tables written to ${outDir}/`);
  for (const r of check) {
    const mark = r.ok ? 'OK ' : 'NG ';
    console.info(
      `${mark}${r.name}: ${r.expPerBattle} EXP × ${r.battles} + boss ${r.bossExp} = +${r.expGain} ` +
        `(spec +${r.specExpGain}) → total ${r.expTotal} → Lv${r.level} (target ${r.targetMin}〜${r.targetMax})`,
    );
  }
}
