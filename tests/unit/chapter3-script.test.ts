import { describe, expect, it } from 'vitest';

import { evaluateCondition } from '@core/condition';
import type { DialogHost, DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import type { EventHost } from '@core/events/interpreter';
import { EventInterpreter } from '@core/events/interpreter';
import type { FlagMap } from '@core/flags';
import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import { TIDE_FLAG } from '@core/map/tide';
import { ITEM_FLAG_PREFIX } from '@core/state';
import type { DialogNodeJson } from '@data/dialogs';
import { DIALOGS } from '@data/dialogs';
import haganeDialogs from '@data/dialogs/hagane.json';
import minatoDialogs from '@data/dialogs/minato.json';
import ruinsDialogs from '@data/dialogs/ruins.json';
import { EVENTS } from '@data/events';
import ruinsEvents from '@data/events/ruins.json';
import type { CharacterId, EventCommand } from '@data/types';

/**
 * Plays the chapter 3 story data (docs/GAME_DESIGN.md §3.2 tide, §13 rows 11–14,
 * §14 sq_old_chart) through the real DialogRunner / EventInterpreter, the same way
 * chapter2-script.test.ts does for chapter 2.
 *
 * The scholar's hand-over branch uses the `item.it_old_chart>=1` condition. The
 * talk host installs the same bag resolver as GameState (src/core/state.ts), so
 * the branch reads the real bag rather than a mirrored flag.
 */

/** Tighter than dialogs-data.test.ts (28): §10.1 says 3 lines × 22 chars as the target. */
const MAX_LINES = 3;
const MAX_LINE_CHARS = 22;

type TalkHost = DialogHost & { inventory: Inventory; gold: number; applied: EventCommand[] };

/** Dialog host that keeps a bag and a purse, like WorldScene's applyEffect. */
function talkHost(initial: FlagMap = {}): TalkHost {
  const inventory = new Inventory(() => 99);
  const flags = new Flags(initial);
  flags.setResolver((key) =>
    key.startsWith(ITEM_FLAG_PREFIX)
      ? inventory.count(key.slice(ITEM_FLAG_PREFIX.length))
      : undefined,
  );
  const host: TalkHost = {
    flags,
    inventory,
    gold: 0,
    applied: [],
    applyEffect: (cmd) => {
      host.applied.push(cmd);
      if (cmd.cmd === 'give_item') inventory.add(cmd.item, cmd.qty);
      else if (cmd.cmd === 'take_item') inventory.remove(cmd.item, cmd.qty);
      else if (cmd.cmd === 'give_gold') host.gold += cmd.amount;
    },
    format: (text) => text,
  };
  return host;
}

/**
 * Plays a conversation to its end, picking `choose` on every choice page.
 * Returns the ids of the nodes that showed a page, in order.
 */
function talk(host: DialogHost, entry: string, choose = 0): string[] {
  const runner = new DialogRunner(DIALOGS, host);
  const seen: string[] = [];
  let step: DialogStep = runner.start(entry);
  let guard = 0;
  while (step.kind === 'page') {
    if ((guard += 1) > 200) throw new Error(`${entry}: conversation did not end`);
    if (seen.at(-1) !== step.nodeId) seen.push(step.nodeId);
    step = step.choices ? runner.choose(choose) : runner.advance();
  }
  return seen;
}

/** Every page shown by a conversation (no choices on the way), joined with newlines. */
function talkText(host: DialogHost, entry: string): string {
  const runner = new DialogRunner(DIALOGS, host);
  const pages: string[] = [];
  let step: DialogStep = runner.start(entry);
  while (step.kind === 'page') {
    pages.push(step.text);
    step = runner.advance();
  }
  return pages.join('\n');
}

type ScriptHost = EventHost & { log: string[]; gold: number };

/** Event host that records what a scene would show and keeps the real flags/bag. */
function scriptHost(initial: FlagMap = {}): ScriptHost {
  const host: ScriptHost = {
    log: [],
    gold: 0,
    flags: new Flags(initial),
    inventory: new Inventory(() => 99),
    itemName: (id) => id,
    say: (id) => {
      host.log.push(`say ${id}`);
      return Promise.resolve();
    },
    message: (text) => {
      host.log.push(`message ${text}`);
      return Promise.resolve();
    },
    choice: () => Promise.resolve(0),
    move: (actor, path) => {
      host.log.push(`move ${actor} ${path.join(',')}`);
      return Promise.resolve();
    },
    face: (actor, dir) => {
      host.log.push(`face ${actor} ${dir}`);
    },
    wait: () => Promise.resolve(),
    warp: () => Promise.resolve(),
    fade: () => Promise.resolve(),
    shake: () => Promise.resolve(),
    flash: (_ms, color) => {
      host.log.push(`flash ${color}`);
      return Promise.resolve();
    },
    playBgm: () => undefined,
    playSe: (key) => {
      host.log.push(`se ${key}`);
    },
    healParty: () => undefined,
    addMember: (id: CharacterId) => {
      host.log.push(`add ${id}`);
    },
    giveGold: (amount) => {
      host.gold += amount;
    },
    showChapter: (title) => {
      host.log.push(`chapter ${title}`);
      return Promise.resolve();
    },
    spawnNpc: (id) => {
      host.log.push(`spawn ${id}`);
    },
    setTide: (tide) => {
      host.log.push(`tide ${tide}`);
      return Promise.resolve();
    },
    removeNpc: (id) => {
      host.log.push(`remove ${id}`);
    },
    battle: () => Promise.resolve('win'),
    endGame: () => undefined,
  };
  return host;
}

/** End of chapter 2 (§13 row 10): the south gate is open, nothing at the camp yet. */
const CHAPTER_3: FlagMap = {
  'main.chapter': 3,
  'minato.intro_done': true,
  'minato.mio_joined': true,
  'main.core_shattered': true,
  'minato.talked_to_grandpa': true,
  'forest.boss_defeated': true,
  'hagane.arrived': true,
  'hagane.goro_joined': true,
  'mine.boss_defeated': true,
  'fragments.count': 2,
  'shop.hagane_tier3': true,
};
const SCHOLAR_MET: FlagMap = { ...CHAPTER_3, 'ruins.scholar_met': true };
const TIDE_LEARNED: FlagMap = { ...SCHOLAR_MET, 'ruins.tide_learned': true };
const CHART_ACCEPTED: FlagMap = { ...TIDE_LEARNED, 'sq.chart': 1 };
const CHART_DONE: FlagMap = { ...TIDE_LEARNED, 'sq.chart': 2 };
/** After ev_ruins_boss_win → ev_nox_appear (§13 row 14). */
const CHAPTER_4: FlagMap = {
  ...TIDE_LEARNED,
  'main.chapter': 4,
  'ruins.tide': 'low',
  'ruins.boss_defeated': true,
  'fragments.count': 3,
};

describe('chapter 3 script: the scholar (§13 rows 11–12)', () => {
  it.each<[string, FlagMap, string]>([
    ['on arrival', CHAPTER_3, 'dlg_scholar_01'],
    ['once met', SCHOLAR_MET, 'dlg_scholar_03'],
    ['once the tide is learned', TIDE_LEARNED, 'dlg_scholar_offer'],
    ['with the chart quest accepted', CHART_ACCEPTED, 'dlg_scholar_searching'],
    ['with the chart quest done', CHART_DONE, 'dlg_scholar_thanks'],
    ['after the guardian', CHAPTER_4, 'dlg_scholar_offer'],
  ])('routes dlg_ruins_scholar %s', (_label, flags, expected) => {
    expect(talk(talkHost(flags), 'dlg_ruins_scholar')[0]).toBe(expected);
  });

  it('first meeting: she names the sunken ruins and the fallen fragment, then opens the camp', () => {
    const host = talkHost(CHAPTER_3);
    expect(talk(host, 'dlg_ruins_scholar')).toEqual([
      'dlg_scholar_01',
      'dlg_scholar_01_luka',
      'dlg_scholar_01_end',
    ]);
    expect(host.flags.has('ruins.scholar_met')).toBe(true);
    expect(host.flags.has('ruins.tide_learned')).toBe(false);
    expect(host.applied).toEqual([]);
    expect(host.inventory.count('it_tide_rune')).toBe(0);
    const text = talkText(talkHost(CHAPTER_3), 'dlg_ruins_scholar');
    for (const word of ['遺跡', '星の欠片', '商人', 'テント', '石碑']) expect(text).toContain(word);
    expect(DIALOGS['dlg_scholar_01']?.speaker).toBe('学者リーネ');
    expect(DIALOGS['dlg_scholar_01_luka']?.speaker).toBe('ルカ');
  });

  it('second talk (dlg_scholar_03): explains the steles and hands over the tide rune once', () => {
    const host = talkHost(CHAPTER_3);
    talk(host, 'dlg_ruins_scholar');
    expect(talk(host, 'dlg_ruins_scholar')).toEqual(['dlg_scholar_03', 'dlg_scholar_03_mio']);
    expect(host.inventory.count('it_tide_rune')).toBe(1);
    expect(host.flags.has('ruins.tide_learned')).toBe(true);
    expect(host.flags.get('sq.chart', 0)).toBe(0);
    expect(host.applied).toEqual([
      { cmd: 'give_item', item: 'it_tide_rune', qty: 1 },
      { cmd: 'play_se', key: 'se_item' },
    ]);
    const text = talkText(talkHost(SCHOLAR_MET), 'dlg_ruins_scholar');
    for (const word of ['潮の石碑', '潮のしるべ', '満潮', '干潮']) expect(text).toContain(word);

    // A third talk moves on to the quest offer; the rune is never given twice.
    expect(talk(host, 'dlg_ruins_scholar', 1)[0]).toBe('dlg_scholar_offer');
    expect(host.inventory.count('it_tide_rune')).toBe(1);
  });
});

describe('chapter 3 script: sq_old_chart (§14)', () => {
  it('is offered once the tide is learned, and can be declined without starting', () => {
    const host = talkHost(TIDE_LEARNED);
    expect(talk(host, 'dlg_ruins_scholar', 1)).toEqual([
      'dlg_scholar_offer',
      'dlg_scholar_decline',
    ]);
    expect(host.flags.get('sq.chart', 0)).toBe(0);
    expect(host.applied).toEqual([]);
    // Declining keeps the offer open.
    expect(talk(host, 'dlg_ruins_scholar', 1)[0]).toBe('dlg_scholar_offer');
    expect(DIALOGS['dlg_scholar_offer']?.choices?.map((c) => c.text)).toEqual([
      'ひきうける',
      'あとで',
    ]);
    expect(DIALOGS['dlg_scholar_offer']?.pages.join('')).toContain('干潮');
  });

  it('accepting sets sq.chart to 1 and the scholar then waits for the chart', () => {
    const host = talkHost(TIDE_LEARNED);
    expect(talk(host, 'dlg_ruins_scholar', 0)).toEqual(['dlg_scholar_offer', 'dlg_scholar_accept']);
    expect(host.flags.get('sq.chart', 0)).toBe(1);
    expect(host.applied).toEqual([]);
    expect(talk(host, 'dlg_ruins_scholar')).toEqual(['dlg_scholar_searching']);
    expect(talkText(host, 'dlg_ruins_scholar')).toContain('干潮');
    expect(host.inventory.count('eq_acc_lantern_pendant')).toBe(0);
  });

  it('hands over the chart: chart −1, pendant +1, se_item, sq.chart 2, then the Nox lore', () => {
    const host = talkHost(CHART_ACCEPTED);
    host.inventory.add('it_old_chart', 1);
    expect(talk(host, 'dlg_ruins_scholar')).toEqual([
      'dlg_scholar_handover',
      'dlg_scholar_handover_lore',
      'dlg_scholar_handover_luka',
    ]);
    expect(host.inventory.count('it_old_chart')).toBe(0);
    expect(host.inventory.count('eq_acc_lantern_pendant')).toBe(1);
    expect(host.flags.get('sq.chart', 0)).toBe(2);
    expect(host.applied).toEqual([
      { cmd: 'take_item', item: 'it_old_chart', qty: 1 },
      { cmd: 'give_item', item: 'eq_acc_lantern_pendant', qty: 1 },
      { cmd: 'play_se', key: 'se_item' },
    ]);
    // §14: the reward talk touches Nox's identity.
    const lore = DIALOGS['dlg_scholar_handover_lore']?.pages.join('\n') ?? '';
    expect(lore).toContain('昔、帰れなかった 星がいた');
    expect(lore).toContain('灯台');

    // Done: thanks only, nothing paid twice even with another chart.
    host.inventory.add('it_old_chart', 1);
    expect(talk(host, 'dlg_ruins_scholar')).toEqual(['dlg_scholar_thanks']);
    expect(host.inventory.count('it_old_chart')).toBe(1);
    expect(host.inventory.count('eq_acc_lantern_pendant')).toBe(1);
    expect(host.applied).toHaveLength(3);
    expect(talkText(host, 'dlg_ruins_scholar')).toContain('帰れなかった 星');
  });

  it('hands over even when the chest was opened before accepting', () => {
    const host = talkHost(TIDE_LEARNED);
    host.inventory.add('it_old_chart', 1);
    expect(talk(host, 'dlg_ruins_scholar')[0]).toBe('dlg_scholar_handover');
    expect(host.flags.get('sq.chart', 0)).toBe(2);
    expect(host.inventory.count('eq_acc_lantern_pendant')).toBe(1);
  });

  it('routes the hand-over on the item.it_old_chart>=1 bag condition', () => {
    const router = DIALOGS['dlg_ruins_scholar'];
    expect(router?.branches?.map((b) => b.if)).toEqual([
      'sq.chart==2',
      'item.it_old_chart>=1',
      'sq.chart==1',
      'ruins.tide_learned',
      'ruins.scholar_met',
      undefined,
    ]);
    expect(evaluateCondition('item.it_old_chart>=1', new Flags({}))).toBe(false);
    const host = talkHost();
    host.inventory.add('it_old_chart', 1);
    expect(evaluateCondition('item.it_old_chart>=1', host.flags)).toBe(true);
  });

  it('every scholar path ends so the scene can return to the field', () => {
    const cases: [FlagMap, number, number][] = [
      [CHAPTER_3, 0, 0],
      [SCHOLAR_MET, 0, 0],
      [TIDE_LEARNED, 0, 0],
      [TIDE_LEARNED, 1, 0],
      [TIDE_LEARNED, 0, 1],
      [CHART_ACCEPTED, 0, 0],
      [CHART_ACCEPTED, 0, 1],
      [CHART_DONE, 0, 0],
      [CHART_DONE, 0, 1],
    ];
    for (const [flags, choose, charts] of cases) {
      const host = talkHost(flags);
      host.inventory.add('it_old_chart', charts);
      const seen = talk(host, 'dlg_ruins_scholar', choose);
      expect(seen.length).toBeGreaterThan(0);
      const last = DIALOGS[seen.at(-1) ?? ''];
      expect(last?.next).toBeUndefined();
      expect(last?.choices).toBeUndefined();
    }
  });
});

describe('chapter 3 script: the camp and the signs', () => {
  it('the merchant and the assistant have one page and no effects (shop / 60G tent follow)', () => {
    for (const entry of ['dlg_camp_merchant', 'dlg_camp_assistant']) {
      const host = talkHost(SCHOLAR_MET);
      expect(talk(host, entry)).toEqual([entry]);
      expect(DIALOGS[entry]?.pages).toHaveLength(1);
      expect(host.applied).toEqual([]);
    }
    expect(talkText(talkHost(), 'dlg_camp_assistant')).toContain('60G');
    expect(talkText(talkHost(), 'dlg_camp_assistant')).toContain('テント');
  });

  it('Nox has a one-page silent fallback for the hidden NPC', () => {
    const host = talkHost(CHAPTER_4);
    expect(talk(host, 'dlg_nox_idle')).toEqual(['dlg_nox_idle']);
    expect(DIALOGS['dlg_nox_idle']?.speaker).toBe('ノクス');
    expect(DIALOGS['dlg_nox_idle']?.pages).toEqual(['……。']);
    expect(host.applied).toEqual([]);
  });

  it('the signs point the way and hint at the steles and the guardian (§3.2, §8.4)', () => {
    const shore = talkText(talkHost(), 'dlg_sign_shore');
    expect(shore).toContain('磯の道');
    expect(shore).toContain('北：鉱山町ハガネ');
    expect(shore).toContain('南：学者のキャンプ');
    const camp = talkText(talkHost(), 'dlg_sign_camp');
    expect(camp).toContain('学者のキャンプ');
    expect(camp).toContain('沈んだ遺跡');
    const entrance = talkText(talkHost(), 'dlg_sign_ruins_entrance');
    expect(entrance).toContain('石碑の 文字は 潮を 動かす');
    expect(entrance).toContain('学者');
    const b1 = talkText(talkHost(), 'dlg_sign_ruins_b1');
    expect(b1).toContain('番人は 土を 嫌う');
    expect(b1).toContain('大潮は 防御で 耐えよ');
  });
});

describe('chapter 3 script: the tide steles (§3.2, §13 row 13)', () => {
  it('ev_ruins_stele_unreadable only says the text cannot be read and leaves the tide alone', async () => {
    const host = scriptHost(SCHOLAR_MET);
    await new EventInterpreter(host, EVENTS).run('ev_ruins_stele_unreadable');
    expect(host.log).toEqual(['say dlg_stele_unreadable']);
    expect(host.flags.peek(TIDE_FLAG)).toBeUndefined();
    expect(talkText(talkHost(), 'dlg_stele_unreadable')).toContain('読めない');
  });

  it('ev_ruins_tide_toggle flips ruins.tide unset → low → high and plays the switch', async () => {
    expect(EVENTS['ev_ruins_tide_toggle']).toEqual([
      { cmd: 'say', dialog: 'dlg_stele_glow' },
      { cmd: 'set_tide', value: 'toggle' },
    ]);
    const host = scriptHost(TIDE_LEARNED);
    const it = new EventInterpreter(host, EVENTS);
    expect(host.flags.peek(TIDE_FLAG)).toBeUndefined();

    await it.run('ev_ruins_tide_toggle');
    expect(host.flags.peek(TIDE_FLAG)).toBe('low');
    expect(host.log).toEqual(['say dlg_stele_glow', 'tide low']);

    await it.run('ev_ruins_tide_toggle');
    expect(host.flags.peek(TIDE_FLAG)).toBe('high');
    expect(host.log).toEqual(['say dlg_stele_glow', 'tide low', 'say dlg_stele_glow', 'tide high']);

    const text = talkText(talkHost(), 'dlg_stele_glow');
    expect(text).toContain('青く 光る');
    expect(text).toContain('潮');
  });
});

describe('chapter 3 script: the guardian and Nox (§13 row 14)', () => {
  it('ev_ruins_boss_intro only plays the intro, with the earth hint and the great-tide warning', async () => {
    const host = scriptHost(TIDE_LEARNED);
    await new EventInterpreter(host, EVENTS).run('ev_ruins_boss_intro');
    expect(host.log).toEqual(['say dlg_ruins_boss_intro']);
    expect(talk(talkHost(TIDE_LEARNED), 'dlg_ruins_boss_intro')).toEqual([
      'dlg_ruins_boss_intro',
      'dlg_ruins_boss_intro_goro',
      'dlg_ruins_boss_intro_mio',
      'dlg_ruins_boss_intro_luka',
    ]);
    expect(DIALOGS['dlg_ruins_boss_intro']?.speaker).toBeUndefined();
    expect(DIALOGS['dlg_ruins_boss_intro_goro']?.speaker).toBe('ゴロー');
    expect(DIALOGS['dlg_ruins_boss_intro_mio']?.speaker).toBe('ミオ');
    expect(DIALOGS['dlg_ruins_boss_intro_luka']?.speaker).toBe('ルカ');
    const text = talkText(talkHost(TIDE_LEARNED), 'dlg_ruins_boss_intro');
    for (const word of ['番人', '欠片', '土の わざ', '防御']) expect(text).toContain(word);
  });

  it('ev_ruins_boss_win gives the third fragment, sets the count to 3 by value and chapter 4 without a title', async () => {
    expect(EVENTS['ev_ruins_boss_win']).toEqual([
      { cmd: 'say', dialog: 'dlg_ruins_boss_win' },
      { cmd: 'give_item', item: 'it_fragment_3', qty: 1 },
      { cmd: 'set_flag', key: 'fragments.count', value: 3 },
      { cmd: 'set_flag', key: 'ruins.boss_defeated', value: true },
      { cmd: 'set_flag', key: 'main.chapter', value: 4 },
    ]);
    const host = scriptHost(TIDE_LEARNED);
    const it = new EventInterpreter(host, EVENTS);
    await it.run('ev_ruins_boss_win');
    expect(host.log).toEqual(['say dlg_ruins_boss_win', 'message it_fragment_3を 手に入れた！']);
    expect(host.inventory.count('it_fragment_3')).toBe(1);
    expect(host.flags.get('fragments.count', -1)).toBe(3);
    expect(host.flags.has('ruins.boss_defeated')).toBe(true);
    expect(host.flags.get('main.chapter', -1)).toBe(4);
    // The chapter title belongs to ev_nox_appear, after Nox has spoken.
    expect(host.log.some((l) => l.startsWith('chapter'))).toBe(false);

    // §13 補足: the count is written, never incremented, so a replay cannot reach 4.
    await it.run('ev_ruins_boss_win');
    expect(host.flags.get('fragments.count', -1)).toBe(3);

    expect(talk(talkHost(CHAPTER_4), 'dlg_ruins_boss_win')).toEqual([
      'dlg_ruins_boss_win',
      'dlg_ruins_boss_win_luka',
      'dlg_ruins_boss_win_mio',
      'dlg_ruins_boss_win_goro',
    ]);
    expect(talkText(talkHost(CHAPTER_4), 'dlg_ruins_boss_win')).toContain('欠片');
  });

  it('ev_nox_appear shows Nox on stage, lets him speak, removes him and opens the final chapter', async () => {
    const host = scriptHost({ ...CHAPTER_4, 'ruins.tide': 'high' });
    host.inventory.add('it_fragment_3', 1);
    let onStageAtSpawn: boolean | undefined;
    let onStageAtRemove: boolean | undefined;
    host.spawnNpc = (id) => {
      onStageAtSpawn = host.flags.has('ruins.nox_on_stage');
      host.log.push(`spawn ${id}`);
    };
    host.removeNpc = (id) => {
      onStageAtRemove = host.flags.has('ruins.nox_on_stage');
      host.log.push(`remove ${id}`);
    };
    await new EventInterpreter(host, EVENTS).run('ev_nox_appear');
    expect(host.log).toEqual([
      'se se_fade',
      'flash black',
      'spawn npc_nox',
      'say dlg_nox_appear',
      'se se_fade',
      'flash black',
      'remove npc_nox',
      'say dlg_nox_gone',
      'chapter 終章　ほしふる灯台',
    ]);
    // The NPC is placed with hidden_if "!ruins.nox_on_stage", so the flag must be up
    // while he is spawned and down again once he has gone.
    expect(onStageAtSpawn).toBe(true);
    expect(onStageAtRemove).toBe(true);
    expect(host.flags.has('ruins.nox_on_stage')).toBe(false);
    // Nothing else changes: the fragment stays, the chapter was already 4.
    expect(host.inventory.count('it_fragment_3')).toBe(1);
    expect(host.flags.get('main.chapter', -1)).toBe(4);
    expect(host.flags.peek(TIDE_FLAG)).toBe('high');
  });

  it('Nox wants the fragments and the lighthouse, says he waits there, and keeps his origin', () => {
    expect(talk(talkHost(CHAPTER_4), 'dlg_nox_appear')).toEqual([
      'dlg_nox_appear',
      'dlg_nox_appear_nox',
    ]);
    expect(DIALOGS['dlg_nox_appear']?.speaker).toBeUndefined();
    expect(DIALOGS['dlg_nox_appear_nox']?.speaker).toBe('ノクス');
    expect(DIALOGS['dlg_nox_appear_nox']?.pages.length).toBeGreaterThanOrEqual(3);
    expect(DIALOGS['dlg_nox_appear_nox']?.pages.length).toBeLessThanOrEqual(4);
    const nox = DIALOGS['dlg_nox_appear_nox']?.pages.join('\n') ?? '';
    for (const word of ['欠片', '灯台', '集め', '灯台で 待つ']) expect(nox).toContain(word);
    // §4.5: his identity (the star the lighthouse failed to send home) is for the finale.
    expect(nox).not.toContain('迷い星');
    expect(nox).not.toContain('帰れなかった');

    expect(talk(talkHost(CHAPTER_4), 'dlg_nox_gone')).toEqual([
      'dlg_nox_gone',
      'dlg_nox_gone_goro',
      'dlg_nox_gone_luka',
    ]);
    expect(DIALOGS['dlg_nox_gone']?.speaker).toBe('ミオ');
    expect(DIALOGS['dlg_nox_gone_luka']?.speaker).toBe('ルカ');
    expect(talkText(talkHost(CHAPTER_4), 'dlg_nox_gone')).toContain('灯台');
  });
});

describe('chapter 3 script: town reactions (§13 row 14)', () => {
  it('Hagane elder and south guard react to the guardian first', () => {
    expect(talk(talkHost(CHAPTER_4), 'dlg_hagane_elder')).toEqual(['dlg_hagane_elder_ch4']);
    expect(talk(talkHost(TIDE_LEARNED), 'dlg_hagane_elder')).toEqual(['dlg_hagane_elder_ch3']);
    expect(talk(talkHost(CHAPTER_4), 'dlg_hagane_south_guard')).toEqual([
      'dlg_hagane_south_guard_ch4',
    ]);
    expect(talk(talkHost(TIDE_LEARNED), 'dlg_hagane_south_guard')).toEqual([
      'dlg_hagane_south_guard_open',
    ]);
    expect(talkText(talkHost(CHAPTER_4), 'dlg_hagane_elder')).toContain('灯台');
    expect(talkText(talkHost(CHAPTER_4), 'dlg_hagane_south_guard')).toContain('番人');
  });

  it('the Minato boy reacts to the guardian first', () => {
    expect(talk(talkHost(CHAPTER_4), 'dlg_minato_boy')).toEqual(['dlg_minato_boy_ch4']);
    expect(talk(talkHost(TIDE_LEARNED), 'dlg_minato_boy')).toEqual(['dlg_minato_boy_ch2']);
    expect(talkText(talkHost(CHAPTER_4), 'dlg_minato_boy')).toContain('灯台');
  });

  it('the Minato innkeeper adds her reaction in front of the necklace quest, which still completes', () => {
    expect(talk(talkHost(TIDE_LEARNED), 'dlg_minato_innkeeper', 1)).toEqual([
      'dlg_minato_innkeeper_offer',
      'dlg_minato_innkeeper_decline',
    ]);
    expect(talk(talkHost(CHAPTER_4), 'dlg_minato_innkeeper', 1)).toEqual([
      'dlg_minato_innkeeper_ch4',
      'dlg_minato_innkeeper_offer',
      'dlg_minato_innkeeper_decline',
    ]);
    const host = talkHost({ ...CHAPTER_4, 'sq.necklace': 1, 'chest.forest_05': true });
    host.inventory.add('it_shell_necklace', 1);
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual([
      'dlg_minato_innkeeper_ch4',
      'dlg_minato_innkeeper_handover',
    ]);
    expect(host.inventory.count('eq_acc_sea_ring')).toBe(1);
    expect(host.flags.get('sq.necklace', 0)).toBe(2);
    expect(talk(host, 'dlg_minato_innkeeper')).toEqual([
      'dlg_minato_innkeeper_ch4',
      'dlg_minato_innkeeper_thanks',
    ]);
  });

  it('grandpa is untouched: three fragments route to dlg_grandpa_final (§13 row 15)', () => {
    expect(talk(talkHost(CHAPTER_4), 'dlg_grandpa_entry')).toEqual(['dlg_grandpa_final']);
    expect(talk(talkHost(TIDE_LEARNED), 'dlg_grandpa_entry')).toEqual([
      'dlg_grandpa_wait_mountain',
    ]);
  });
});

describe('chapter 3 script: references', () => {
  const TOWN_CH4 = [
    'dlg_hagane_elder_ch4',
    'dlg_hagane_south_guard_ch4',
    'dlg_minato_boy_ch4',
    'dlg_minato_innkeeper_ch4',
  ];
  const townDialogs: Record<string, DialogNodeJson> = {
    ...(haganeDialogs as Record<string, DialogNodeJson>),
    ...(minatoDialogs as Record<string, DialogNodeJson>),
  };
  const newDialogs: Record<string, DialogNodeJson> = {
    ...(ruinsDialogs as Record<string, DialogNodeJson>),
    ...Object.fromEntries(TOWN_CH4.map((id) => [id, townDialogs[id] as DialogNodeJson])),
  };
  const newEvents = ruinsEvents as Record<string, EventCommand[]>;

  it('every next, branch and choice target in the new dialogs exists', () => {
    for (const id of TOWN_CH4) expect(townDialogs[id], id).toBeDefined();
    for (const [id, node] of Object.entries(newDialogs)) {
      const targets = [
        node.next,
        ...(node.branches ?? []).map((b) => b.next),
        ...(node.choices ?? []).map((c) => c.next),
      ].filter((t): t is string => t !== undefined);
      for (const t of targets) expect(DIALOGS[t], `${id} → ${t}`).toBeDefined();
    }
    expect(Object.keys(ruinsDialogs)).toEqual(
      expect.arrayContaining([
        'dlg_sign_shore',
        'dlg_sign_camp',
        'dlg_sign_ruins_entrance',
        'dlg_sign_ruins_b1',
        'dlg_ruins_scholar',
        'dlg_scholar_01',
        'dlg_scholar_03',
        'dlg_camp_merchant',
        'dlg_camp_assistant',
        'dlg_nox_idle',
        'dlg_stele_unreadable',
        'dlg_stele_glow',
        'dlg_ruins_boss_intro',
        'dlg_ruins_boss_win',
        'dlg_nox_appear',
        'dlg_nox_gone',
      ]),
    );
  });

  it('every say in the new events names an existing dialog', () => {
    for (const [id, commands] of Object.entries(newEvents)) {
      for (const c of commands) {
        if (c.cmd === 'say') expect(DIALOGS[c.dialog], `${id} say ${c.dialog}`).toBeDefined();
      }
    }
    expect(Object.keys(newEvents).sort()).toEqual([
      'ev_nox_appear',
      'ev_ruins_boss_intro',
      'ev_ruins_boss_win',
      'ev_ruins_stele_unreadable',
      'ev_ruins_tide_toggle',
    ]);
  });

  it('keeps every page within 3 lines × 22 chars (§10.1)', () => {
    for (const [id, node] of Object.entries(newDialogs)) {
      node.pages.forEach((page, i) => {
        const lines = page.split('\n');
        expect(lines.length, `${id} page ${i} lines`).toBeLessThanOrEqual(MAX_LINES);
        for (const line of lines) {
          expect([...line].length, `${id} page ${i}: "${line}"`).toBeLessThanOrEqual(
            MAX_LINE_CHARS,
          );
        }
      });
    }
  });
});
