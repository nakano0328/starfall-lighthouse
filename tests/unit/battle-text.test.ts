import { describe, expect, it } from 'vitest';

import type { RewardOutcome } from '@core/battle/rewards';
import type { BattleTextContext } from '@core/battle/text';
import { battleEventLines, resultLines } from '@core/battle/text';
import type { BattleEvent, BattleStatus } from '@core/battle/types';
import { STATUS_NAMES } from '@core/battle/types';

const NAMES: Record<string, string> = { p0: 'ルカ', e0: '迷い星スライム' };

const ctx: BattleTextContext = {
  name: (key) => NAMES[key] ?? key,
  isEnemy: (key) => key.startsWith('e'),
};

const lines = (event: BattleEvent): string[] => battleEventLines(event, ctx);

const ALL_STATUSES = Object.keys(STATUS_NAMES) as BattleStatus[];

describe('battleEventLines', () => {
  it('is silent for events the scene handles or the engine narrates itself', () => {
    expect(lines({ type: 'round_start', round: 1 })).toEqual([]);
    expect(lines({ type: 'charge', actor: 'e0', step: 1 })).toEqual([]);
    expect(lines({ type: 'escape', success: true, chance: 60 })).toEqual([]);
    expect(lines({ type: 'escape', success: false, chance: 60 })).toEqual([]);
  });

  it('passes a message through untouched', () => {
    expect(lines({ type: 'message', text: '先制攻撃！ 敵は動けない。' })).toEqual([
      '先制攻撃！ 敵は動けない。',
    ]);
  });

  it('announces actions by kind', () => {
    expect(lines({ type: 'action', actor: 'p0', label: 'こうげき' })).toEqual([
      'ルカの こうげき！',
    ]);
    expect(
      lines({ type: 'action', actor: 'p0', label: '星の一閃', skillId: 'sk_star_slash' }),
    ).toEqual(['ルカの 星の一閃！']);
    expect(lines({ type: 'action', actor: 'p0', label: 'やくそう', itemId: 'it_herb' })).toEqual([
      'ルカは やくそうを つかった！',
    ]);
    expect(lines({ type: 'action', actor: 'e0', label: '充填', skillId: 'charge' })).toEqual([]);
  });

  describe('damage', () => {
    const hit = (over: Partial<Extract<BattleEvent, { type: 'damage' }>>): BattleEvent => ({
      type: 'damage',
      target: 'e0',
      amount: 12,
      crit: false,
      weak: false,
      immune: false,
      element: 'none',
      ...over,
    });

    it('reports a plain hit', () => {
      expect(lines(hit({}))).toEqual(['迷い星スライムに 12 のダメージ！']);
    });

    it('puts crit before weakness before the amount', () => {
      expect(lines(hit({ crit: true, weak: true, amount: 40 }))).toEqual([
        'かいしんの いちげき！',
        'こうかは ばつぐんだ！',
        '迷い星スライムに 40 のダメージ！',
      ]);
      expect(lines(hit({ crit: true }))).toEqual([
        'かいしんの いちげき！',
        '迷い星スライムに 12 のダメージ！',
      ]);
      expect(lines(hit({ weak: true, target: 'p0' }))).toEqual([
        'こうかは ばつぐんだ！',
        'ルカに 12 のダメージ！',
      ]);
    });

    it('replaces everything with the immune line', () => {
      expect(lines(hit({ immune: true, crit: true, weak: true, amount: 0 }))).toEqual([
        'カキン！ 迷い星スライムには きかない！',
      ]);
    });
  });

  it('reports HP/MP changes, misses and MP shortage', () => {
    expect(lines({ type: 'heal', target: 'p0', amount: 30 })).toEqual([
      'ルカの HP が 30 かいふくした！',
    ]);
    expect(lines({ type: 'mp_heal', target: 'p0', amount: 8 })).toEqual([
      'ルカの MP が 8 かいふくした！',
    ]);
    expect(lines({ type: 'mp_drain', target: 'p0', amount: 5 })).toEqual([
      'ルカの MP が 5 うばわれた！',
    ]);
    expect(lines({ type: 'miss', target: 'e0' })).toEqual([
      'ミス！ 迷い星スライムには あたらない！',
    ]);
    expect(lines({ type: 'no_mp', actor: 'p0' })).toEqual(['しかし ルカの MP が たりない！']);
  });

  describe('statuses', () => {
    const APPLIED: Record<BattleStatus, string[]> = {
      poison: ['ルカは 毒に おかされた！'],
      paralyze: ['ルカは しびれて うごけなくなった！'],
      blind: ['ルカは 暗闇に つつまれた！'],
      def_down: ['ルカの 防御が さがった！'],
      atk_up: ['ルカの 攻撃が あがった！'],
      taunt: ['ルカは 敵の 注意を ひきつけた！'],
      harden: ['ルカの 体が 黒く かたまった！'],
      cracked: ['ルカの 体に ひびが はいった！'],
      water_veil: ['ルカは 水の とばりに つつまれた！'],
      charging: [],
    };
    const EXPIRED: Record<BattleStatus, string[]> = {
      poison: ['ルカの 毒が きえた。'],
      paralyze: ['ルカの しびれが とれた。'],
      blind: ['ルカの 目が 見えるようになった。'],
      def_down: ['ルカの 防御が もとに もどった。'],
      atk_up: ['ルカの 攻撃が もとに もどった。'],
      taunt: ['ルカの ちょうはつが きれた。'],
      harden: ['ルカの 硬化が とけた。'],
      cracked: ['ルカの ひびが ふさがった。'],
      water_veil: ['ルカの 水の とばりが きえた。'],
      charging: [],
    };

    it.each(ALL_STATUSES)('narrates %s being applied and expiring', (status) => {
      expect(lines({ type: 'status_applied', target: 'p0', status })).toEqual(APPLIED[status]);
      expect(lines({ type: 'status_expired', target: 'p0', status })).toEqual(EXPIRED[status]);
    });

    it('produces no lines for the charging status', () => {
      expect(lines({ type: 'status_applied', target: 'e0', status: 'charging' })).toEqual([]);
      expect(lines({ type: 'status_expired', target: 'e0', status: 'charging' })).toEqual([]);
    });

    it('reports resistance and cures by status name', () => {
      expect(lines({ type: 'status_resisted', target: 'e0', status: 'poison' })).toEqual([
        '迷い星スライムには きかなかった！',
      ]);
      expect(lines({ type: 'status_cured', target: 'p0', status: 'poison' })).toEqual([
        'ルカの 毒が なおった！',
      ]);
      expect(lines({ type: 'status_cured', target: 'p0', status: 'def_down' })).toEqual([
        'ルカの 防御ダウンが なおった！',
      ]);
    });
  });

  it('distinguishes enemy and party KO', () => {
    expect(lines({ type: 'ko', target: 'e0' })).toEqual(['迷い星スライムを たおした！']);
    expect(lines({ type: 'ko', target: 'p0' })).toEqual(['ルカは たおれてしまった！']);
  });

  it('narrates revive, guard, paralysis and charge interruption', () => {
    expect(lines({ type: 'revive', target: 'p0' })).toEqual(['ルカは たちあがった！']);
    expect(lines({ type: 'guard', actor: 'p0' })).toEqual(['ルカは 身を まもっている。']);
    expect(lines({ type: 'paralyzed', actor: 'p0' })).toEqual(['ルカは しびれて うごけない！']);
    expect(lines({ type: 'charge_broken', actor: 'e0' })).toEqual([
      '迷い星スライムの 充填が 中断された！',
    ]);
  });

  it('narrates the battle ending', () => {
    expect(lines({ type: 'phase_change', actor: 'e0', next: 'bo_nox_2' })).toEqual([
      '迷い星スライムの 仮面が われた！',
    ]);
    expect(lines({ type: 'victory' })).toEqual(['敵を すべて たおした！']);
    expect(lines({ type: 'defeat' })).toEqual(['パーティは 全滅した……']);
  });
});

describe('resultLines', () => {
  const names = {
    member: (index: number) => ['ルカ', 'ミオ', 'ゴロー'][index] ?? `member${index}`,
    item: (id: string) => ({ it_herb: 'やくそう', it_potion_s: 'ポーション' })[id] ?? id,
    skill: (id: string) =>
      ({ sk_first_aid: 'おうきゅうてあて', sk_star_slash: '星の一閃' })[id] ?? id,
  };

  it('lists EXP, gold, drops and level-ups in order', () => {
    const outcome: RewardOutcome = {
      rewards: {
        exp: 100,
        gold: 25,
        drops: [
          { itemId: 'it_herb', qty: 2 },
          { itemId: 'it_potion_s', qty: 1 },
        ],
      },
      expByMember: [100, 50],
      levelUps: [
        {
          memberIndex: 0,
          id: 'ch_luka',
          from: 1,
          to: 3,
          gains: { hp: 26, mp: 9, atk: 6, def: 4, spd: 4, luk: 2 },
          newSkills: ['sk_first_aid', 'sk_star_slash'],
        },
      ],
    };

    expect(resultLines(outcome, names)).toEqual([
      '100 の経験値を 手に入れた！',
      '25G を 手に入れた！',
      'やくそうを 2こ 手に入れた！',
      'ポーションを 手に入れた！',
      'ルカは レベル 3 に あがった！',
      '最大HP +26  最大MP +9  攻撃 +6  防御 +4  素早さ +4  運 +2',
      'おうきゅうてあてを おぼえた！',
      '星の一閃を おぼえた！',
    ]);
  });

  it('skips the EXP and gold lines when they are zero', () => {
    const outcome: RewardOutcome = {
      rewards: { exp: 0, gold: 0, drops: [] },
      expByMember: [0],
      levelUps: [],
    };
    expect(resultLines(outcome, names)).toEqual([]);
  });

  it('keeps a level-up without new skills to its two lines', () => {
    const outcome: RewardOutcome = {
      rewards: { exp: 20, gold: 0, drops: [] },
      expByMember: [20, 20],
      levelUps: [
        {
          memberIndex: 1,
          id: 'ch_mio',
          from: 1,
          to: 2,
          gains: { hp: 10, mp: 5, atk: 2, def: 2, spd: 3, luk: 1 },
          newSkills: [],
        },
      ],
    };
    expect(resultLines(outcome, names)).toEqual([
      '20 の経験値を 手に入れた！',
      'ミオは レベル 2 に あがった！',
      '最大HP +10  最大MP +5  攻撃 +2  防御 +2  素早さ +3  運 +1',
    ]);
  });
});
