import { describe, expect, it } from 'vitest';

import type { DialogHost, DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import type { EventHost } from '@core/events/interpreter';
import { EventInterpreter } from '@core/events/interpreter';
import type { FlagMap } from '@core/flags';
import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import { ITEM_FLAG_PREFIX } from '@core/state';
import type { DialogNodeJson } from '@data/dialogs';
import { DIALOGS } from '@data/dialogs';
import lighthouseDialogs from '@data/dialogs/lighthouse.json';
import minatoDialogs from '@data/dialogs/minato.json';
import { ENCOUNTERS } from '@data/encounters';
import { findEnemy } from '@data/enemies';
import { EVENTS } from '@data/events';
import lighthouseEvents from '@data/events/lighthouse.json';
import type { CharacterId, EventCommand } from '@data/types';

/**
 * Plays the final-chapter story data (docs/GAME_DESIGN.md §1.2 終章, §4.5 Nox,
 * §13 rows 15–19) through the real DialogRunner / EventInterpreter, the same way
 * chapter3-script.test.ts does for chapter 3.
 *
 * The tower maps (map_lighthouse_1f…5f, map_lighthouse_top) are authored
 * separately; this file checks the scripts and conversations they launch, not
 * their placement. The two Nox forms are one battle (bo_nox_phase1.phaseNext →
 * bo_nox_phase2, the mask-break lines come from phaseText), so no event sits
 * between them. The ending itself (ev_ending, the staff roll, main.ending_seen)
 * is Phase 5 and is deliberately absent here.
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

/** Pages of one node as authored (no formatting), joined with newlines. */
function pagesOf(id: string): string {
  return DIALOGS[id]?.pages.join('\n') ?? '';
}

type ScriptHost = EventHost & { log: string[]; gold: number; battleResult: 'win' | 'lose' };

/**
 * Event host that records what a scene would show and keeps the real flags/bag.
 * `battleResult` is what every `battle` resolves with (the real BattleScene decides).
 */
function scriptHost(initial: FlagMap = {}, battleResult: 'win' | 'lose' = 'win'): ScriptHost {
  const host: ScriptHost = {
    log: [],
    gold: 0,
    battleResult,
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
    battle: (group, lose) => {
      host.log.push(`battle ${group} ${lose}`);
      return Promise.resolve(host.battleResult);
    },
    endGame: () => {
      host.log.push('end_game');
    },
  };
  return host;
}

/** After ev_ruins_boss_win → ev_nox_appear (§13 row 14): three fragments, chapter 4. */
const CHAPTER_4: FlagMap = {
  'main.chapter': 4,
  'minato.intro_done': true,
  'minato.mio_joined': true,
  'main.core_shattered': true,
  'minato.talked_to_grandpa': true,
  'forest.boss_defeated': true,
  'hagane.arrived': true,
  'hagane.goro_joined': true,
  'mine.boss_defeated': true,
  'shop.hagane_tier3': true,
  'ruins.scholar_met': true,
  'ruins.tide_learned': true,
  'ruins.tide': 'low',
  'ruins.boss_defeated': true,
  'fragments.count': 3,
};
/** Grandpa handed over the key and the letter (§13 row 15). */
const LIGHTHOUSE_UNLOCKED: FlagMap = { ...CHAPTER_4, 'minato.lighthouse_unlocked': true };
/** Standing in front of the lamp room: every floor seen, levers pulled, fountain used. */
const TOWER_5F: FlagMap = {
  ...LIGHTHOUSE_UNLOCKED,
  'lighthouse.floor': 5,
  'lighthouse.lever_a': true,
  'lighthouse.lever_b': true,
  'lighthouse.fountain_awake': true,
  'lighthouse.fountain_used': true,
};

describe('chapter 4 script: the tower signs and gates (§3.1)', () => {
  it.each<[string, string[]]>([
    ['dlg_sign_tower_1f', ['灯台の塔 1F']],
    ['dlg_sign_tower_2f', ['灯台の塔 2F', 'レバー', '柵']],
    ['dlg_sign_tower_3f', ['灯台の塔 3F']],
    ['dlg_sign_tower_4f', ['灯台の塔 4F', '偽りの灯', '水']],
    ['dlg_sign_tower_5f', ['灯台の塔 5F', '泉', '手紙']],
  ])('%s is a one-page sign without a speaker that names its floor', (id, words) => {
    const host = talkHost(LIGHTHOUSE_UNLOCKED);
    expect(talk(host, id)).toEqual([id]);
    expect(DIALOGS[id]?.speaker).toBeUndefined();
    expect(DIALOGS[id]?.pages).toHaveLength(1);
    expect(host.applied).toEqual([]);
    const text = talkText(talkHost(), id);
    for (const word of words) expect(text).toContain(word);
  });

  it('the gates (2F levers, 5F fountain) share one plain page about the iron bars', () => {
    const host = talkHost(LIGHTHOUSE_UNLOCKED);
    expect(talk(host, 'dlg_tower_gate')).toEqual(['dlg_tower_gate']);
    expect(DIALOGS['dlg_tower_gate']?.speaker).toBeUndefined();
    expect(DIALOGS['dlg_tower_gate']?.pages).toHaveLength(1);
    expect(talkText(host, 'dlg_tower_gate')).toContain('鉄の柵が 道を 塞いでいる');
    expect(host.applied).toEqual([]);
  });

  it('Nox has a one-page silent fallback for npc_nox_top', () => {
    const host = talkHost(TOWER_5F);
    expect(talk(host, 'dlg_nox_top_idle')).toEqual(['dlg_nox_top_idle']);
    expect(DIALOGS['dlg_nox_top_idle']?.speaker).toBe('ノクス');
    expect(DIALOGS['dlg_nox_top_idle']?.pages).toHaveLength(1);
    expect(host.applied).toEqual([]);
  });
});

describe('chapter 4 script: the shadow voice on each floor (§13 row 16)', () => {
  it.each<[number, string]>([
    [1, '来たか'],
    [2, '欠片を 置いていけ'],
    [3, '帰る場所'],
    [4, '光は 要らない'],
    [5, '上で 待つ'],
  ])('ev_tower_voice_%i records the floor, then lets the voice speak', async (floor, line) => {
    const ev = `ev_tower_voice_${floor}`;
    const dlg = `dlg_tower_voice_${floor}`;
    expect(EVENTS[ev]).toEqual([
      { cmd: 'set_flag', key: 'lighthouse.floor', value: floor },
      { cmd: 'say', dialog: dlg },
    ]);
    const host = scriptHost({ ...LIGHTHOUSE_UNLOCKED, 'lighthouse.floor': floor - 1 });
    // The floor is already written when the voice speaks (slot display, §13 row 16).
    let floorAtSay: number | undefined;
    host.say = (id) => {
      floorAtSay = host.flags.get('lighthouse.floor', -1);
      host.log.push(`say ${id}`);
      return Promise.resolve();
    };
    expect(await new EventInterpreter(host, EVENTS).run(ev)).toBe('done');
    expect(host.log).toEqual([`say ${dlg}`]);
    expect(host.flags.get('lighthouse.floor', -1)).toBe(floor);
    expect(floorAtSay).toBe(floor);
    // Nothing else moves: no items, no other flags.
    expect(host.flags.toJSON()).toEqual({ ...LIGHTHOUSE_UNLOCKED, 'lighthouse.floor': floor });

    const talker = talkHost(LIGHTHOUSE_UNLOCKED);
    expect(talk(talker, dlg)).toEqual([dlg]);
    expect(talker.applied).toEqual([]);
    expect(DIALOGS[dlg]?.speaker).toBe('影の声');
    expect(DIALOGS[dlg]?.pages.length).toBeGreaterThanOrEqual(1);
    expect(DIALOGS[dlg]?.pages.length).toBeLessThanOrEqual(2);
    expect(talkText(talker, dlg)).toContain(line);
  });

  it('keeps his identity for the top: the voice never says 迷い星', () => {
    for (let floor = 1; floor <= 5; floor += 1) {
      expect(pagesOf(`dlg_tower_voice_${floor}`)).not.toContain('迷い星');
      expect(pagesOf(`dlg_tower_voice_${floor}`)).not.toContain('帰しそこねた');
    }
  });

  it('escalates: the 1F voice greets, the 5F voice names the top', () => {
    expect(pagesOf('dlg_tower_voice_1')).toContain('灯台守');
    expect(pagesOf('dlg_tower_voice_5')).toContain('欠片');
    expect(pagesOf('dlg_tower_voice_5')).toContain('上で 待つ');
  });
});

describe('chapter 4 script: the 2F levers (§3.1 順路パズル)', () => {
  it.each<['a' | 'b']>([['a'], ['b']])(
    'ev_tower_lever_%s says the lever text first, then raises lighthouse.lever_%s',
    async (lever) => {
      const ev = `ev_tower_lever_${lever}`;
      const key = `lighthouse.lever_${lever}`;
      expect(EVENTS[ev]).toEqual([
        { cmd: 'say', dialog: 'dlg_tower_lever' },
        { cmd: 'set_flag', key, value: true },
      ]);
      const host = scriptHost(LIGHTHOUSE_UNLOCKED);
      let flagAtSay: boolean | undefined;
      host.say = (id) => {
        flagAtSay = host.flags.has(key);
        host.log.push(`say ${id}`);
        return Promise.resolve();
      };
      await new EventInterpreter(host, EVENTS).run(ev);
      expect(host.log).toEqual(['say dlg_tower_lever']);
      // The gate NPCs hide on the flag, so it must land only after the text.
      expect(flagAtSay).toBe(false);
      expect(host.flags.has(key)).toBe(true);
      expect(host.flags.has(lever === 'a' ? 'lighthouse.lever_b' : 'lighthouse.lever_a')).toBe(
        false,
      );
    },
  );

  it('both levers together leave both flags up and the shared text mentions the bars', async () => {
    const host = scriptHost(LIGHTHOUSE_UNLOCKED);
    const it = new EventInterpreter(host, EVENTS);
    await it.run('ev_tower_lever_a');
    await it.run('ev_tower_lever_b');
    expect(host.flags.has('lighthouse.lever_a')).toBe(true);
    expect(host.flags.has('lighthouse.lever_b')).toBe(true);
    expect(host.log).toEqual(['say dlg_tower_lever', 'say dlg_tower_lever']);
    const text = talkText(talkHost(), 'dlg_tower_lever');
    expect(text).toContain('レバーを 引いた');
    expect(text).toContain('柵が 上がる 音');
    expect(DIALOGS['dlg_tower_lever']?.speaker).toBeUndefined();
  });
});

describe('chapter 4 script: the 5F fountain (§13 row 17)', () => {
  it('ev_tower_fountain_sealed only describes the sleeping fountain and its hollow', async () => {
    expect(EVENTS['ev_tower_fountain_sealed']).toEqual([
      { cmd: 'say', dialog: 'dlg_tower_fountain_sealed' },
    ]);
    const host = scriptHost(LIGHTHOUSE_UNLOCKED);
    host.inventory.add('it_grandpa_letter', 1);
    await new EventInterpreter(host, EVENTS).run('ev_tower_fountain_sealed');
    expect(host.log).toEqual(['say dlg_tower_fountain_sealed']);
    expect(host.flags.toJSON()).toEqual(LIGHTHOUSE_UNLOCKED);
    expect(host.inventory.count('it_grandpa_letter')).toBe(1);
    const text = talkText(talkHost(), 'dlg_tower_fountain_sealed');
    expect(text).toContain('泉は 眠っている');
    expect(text).toContain('手紙の 形');
    expect(text).toContain('くぼみ');
  });

  it("ev_tower_fountain_wake reads grandpa's letter, chimes and wakes the fountain", async () => {
    expect(EVENTS['ev_tower_fountain_wake']).toEqual([
      { cmd: 'say', dialog: 'dlg_tower_fountain_wake' },
      { cmd: 'play_se', key: 'se_item' },
      { cmd: 'set_flag', key: 'lighthouse.fountain_awake', value: true },
    ]);
    const host = scriptHost(LIGHTHOUSE_UNLOCKED);
    host.inventory.add('it_grandpa_letter', 1);
    expect(await new EventInterpreter(host, EVENTS).run('ev_tower_fountain_wake')).toBe('done');
    expect(host.log).toEqual(['say dlg_tower_fountain_wake', 'se se_item']);
    expect(host.flags.has('lighthouse.fountain_awake')).toBe(true);
    // The one-time heal (lighthouse.fountain_used) is the save point's own once_flag,
    // and the letter is a key item that stays in the bag.
    expect(host.flags.peek('lighthouse.fountain_used')).toBeUndefined();
    expect(host.inventory.count('it_grandpa_letter')).toBe(1);

    const talker = talkHost(LIGHTHOUSE_UNLOCKED);
    expect(talk(talker, 'dlg_tower_fountain_wake')).toEqual([
      'dlg_tower_fountain_wake',
      'dlg_tower_fountain_wake_luka',
      'dlg_tower_fountain_wake_end',
      'dlg_tower_fountain_wake_mio',
    ]);
    expect(talker.applied).toEqual([]);
    expect(DIALOGS['dlg_tower_fountain_wake']?.speaker).toBeUndefined();
    expect(DIALOGS['dlg_tower_fountain_wake_luka']?.speaker).toBe('ルカ');
    expect(DIALOGS['dlg_tower_fountain_wake_mio']?.speaker).toBe('ミオ');
    const text = talkText(talker, 'dlg_tower_fountain_wake');
    for (const word of ['じいちゃんの手紙', '泉', '光']) expect(text).toContain(word);
    // Luka reads the letter aloud: every page of his node is a quotation.
    for (const page of DIALOGS['dlg_tower_fountain_wake_luka']?.pages ?? []) {
      expect(page.startsWith('「')).toBe(true);
      expect(page.endsWith('」')).toBe(true);
    }
    expect(pagesOf('dlg_tower_fountain_wake_luka')).toContain('灯り');
  });
});

describe('chapter 4 script: the lighthouse top (§4.5, §8.4, §13 rows 18–19)', () => {
  it('ev_lighthouse_top plays the confrontation, then one boss battle whose win runs ev_nox_win', () => {
    expect(EVENTS['ev_lighthouse_top']).toEqual([
      { cmd: 'say', dialog: 'dlg_lighthouse_top' },
      { cmd: 'battle', group: 'grp_boss_nox', win_event: 'ev_nox_win', lose: 'gameover' },
    ]);
    expect(EVENTS['ev_nox_win']).toEqual([
      { cmd: 'say', dialog: 'dlg_nox_win' },
      { cmd: 'flash', ms: 400, color: 'white' },
      { cmd: 'say', dialog: 'dlg_nox_win_relight' },
      { cmd: 'remove_npc', id: 'npc_nox_top' },
      { cmd: 'set_flag', key: 'main.nox_defeated', value: true },
      { cmd: 'set_flag', key: 'main.chapter', value: 5 },
      { cmd: 'end_game' },
    ]);
  });

  it('the two forms are one battle: grp_boss_nox → phase 1 → phaseNext phase 2 → ev_nox_win', () => {
    const group = ENCOUNTERS.find((g) => g.id === 'grp_boss_nox');
    expect(group?.enemies.map((e) => e.enemyId)).toEqual(['bo_nox_phase1']);
    expect(findEnemy('bo_nox_phase1')?.phaseNext).toBe('bo_nox_phase2');
    // The mask-break lines are shown by the battle scene from phaseText (§8.4), so
    // the data defines no event between the forms.
    expect(findEnemy('bo_nox_phase1')?.phaseText?.[0]).toContain('仮面が 割れた');
    expect(EVENTS['ev_nox_transform']).toBeUndefined();
    expect(findEnemy('bo_nox_phase2')?.onDefeatEvent).toBe('ev_nox_win');
    expect(EVENTS['ev_nox_win']).toBeDefined();
    // The ending scene (ev_ending, staff roll) is Phase 5: end_game hands over to it.
    expect(EVENTS['ev_ending']).toBeUndefined();
  });

  it('winning: relights the lamp, removes Nox, sets main.nox_defeated and chapter 5, ends the game', async () => {
    const host = scriptHost(TOWER_5F, 'win');
    host.inventory.add('it_fragment_1', 1);
    host.inventory.add('it_fragment_2', 1);
    host.inventory.add('it_fragment_3', 1);
    expect(await new EventInterpreter(host, EVENTS).run('ev_lighthouse_top')).toBe('done');
    expect(host.log).toEqual([
      'say dlg_lighthouse_top',
      'battle grp_boss_nox gameover',
      'say dlg_nox_win',
      'flash white',
      'say dlg_nox_win_relight',
      'remove npc_nox_top',
      'end_game',
    ]);
    expect(host.flags.has('main.nox_defeated')).toBe(true);
    expect(host.flags.get('main.chapter', -1)).toBe(5);
    expect(host.flags.toJSON()).toEqual({
      ...TOWER_5F,
      'main.nox_defeated': true,
      'main.chapter': 5,
    });
    // main.ending_seen belongs to the staff roll (Phase 5); the fragments are not taken.
    expect(host.flags.peek('main.ending_seen')).toBeUndefined();
    expect(host.inventory.count('it_fragment_3')).toBe(1);
  });

  it('losing: the script stops after the battle, nothing is set and the game does not end', async () => {
    const host = scriptHost(TOWER_5F, 'lose');
    expect(await new EventInterpreter(host, EVENTS).run('ev_lighthouse_top')).toBe('stopped');
    expect(host.log).toEqual(['say dlg_lighthouse_top', 'battle grp_boss_nox gameover']);
    expect(host.flags.toJSON()).toEqual(TOWER_5F);
    expect(host.flags.has('main.nox_defeated')).toBe(false);
    expect(host.flags.get('main.chapter', -1)).toBe(4);
  });

  it('ev_nox_win also runs on its own, as the onDefeatEvent of the second form', async () => {
    const host = scriptHost(TOWER_5F);
    expect(await new EventInterpreter(host, EVENTS).run('ev_nox_win')).toBe('done');
    expect(host.log.at(-1)).toBe('end_game');
    expect(host.flags.has('main.nox_defeated')).toBe(true);
    expect(host.flags.get('main.chapter', -1)).toBe(5);
  });

  it('the confrontation: Nox reveals he is the lost star the lighthouse failed to send home', () => {
    const talker = talkHost(TOWER_5F);
    const chain = talk(talker, 'dlg_lighthouse_top');
    expect(chain).toEqual([
      'dlg_lighthouse_top',
      'dlg_lighthouse_top_nox',
      'dlg_lighthouse_top_mio',
      'dlg_lighthouse_top_goro',
      'dlg_lighthouse_top_luka',
    ]);
    expect(talker.applied).toEqual([]);
    const pages = chain.reduce((n, id) => n + (DIALOGS[id]?.pages.length ?? 0), 0);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(pages).toBeLessThanOrEqual(6);
    expect(DIALOGS['dlg_lighthouse_top']?.speaker).toBeUndefined();
    expect(DIALOGS['dlg_lighthouse_top_nox']?.speaker).toBe('ノクス');
    expect(DIALOGS['dlg_lighthouse_top_mio']?.speaker).toBe('ミオ');
    expect(DIALOGS['dlg_lighthouse_top_goro']?.speaker).toBe('ゴロー');
    expect(DIALOGS['dlg_lighthouse_top_luka']?.speaker).toBe('ルカ');
    // §4.5 正体: the reveal happens here, in his own words.
    const nox = pagesOf('dlg_lighthouse_top_nox');
    for (const word of ['灯台守', '迷い星', '帰しそこねた', '光']) expect(nox).toContain(word);
    expect(pagesOf('dlg_lighthouse_top_luka')).toContain('灯台守');
    expect(pagesOf('dlg_lighthouse_top_luka')).toContain('帰す');
  });

  it('the victory: the mask is gone, Nox is small and tired, Luka offers the light', () => {
    const talker = talkHost(TOWER_5F);
    const chain = talk(talker, 'dlg_nox_win');
    expect(chain).toEqual([
      'dlg_nox_win',
      'dlg_nox_win_nox',
      'dlg_nox_win_luka',
      'dlg_nox_win_mio',
    ]);
    expect(talker.applied).toEqual([]);
    const pages = chain.reduce((n, id) => n + (DIALOGS[id]?.pages.length ?? 0), 0);
    expect(pages).toBeGreaterThanOrEqual(4);
    expect(pages).toBeLessThanOrEqual(6);
    const narration = pagesOf('dlg_nox_win');
    expect(DIALOGS['dlg_nox_win']?.speaker).toBeUndefined();
    for (const word of ['仮面', '小さな 光', '疲れた']) expect(narration).toContain(word);
    expect(DIALOGS['dlg_nox_win_nox']?.speaker).toBe('ノクス');
    expect(DIALOGS['dlg_nox_win_luka']?.speaker).toBe('ルカ');
    expect(DIALOGS['dlg_nox_win_mio']?.speaker).toBe('ミオ');
    const luka = pagesOf('dlg_nox_win_luka');
    expect(luka).toContain('剣じゃない');
    expect(luka).toContain('灯台の 光');
    expect(pagesOf('dlg_nox_win_mio')).toContain('欠片');
  });

  it('the relight: three fragments light the lamp and Nox rises as a star; the shooting star waits for the ending', () => {
    const talker = talkHost(TOWER_5F);
    const chain = talk(talker, 'dlg_nox_win_relight');
    expect(chain).toEqual([
      'dlg_nox_win_relight',
      'dlg_nox_win_relight_nox',
      'dlg_nox_win_relight_goro',
      'dlg_nox_win_relight_mio',
      'dlg_nox_win_relight_luka',
    ]);
    expect(talker.applied).toEqual([]);
    const narration = pagesOf('dlg_nox_win_relight');
    for (const word of ['三つの 欠片', '灯室', '光が 灯った', '浮かび上がる']) {
      expect(narration).toContain(word);
    }
    expect(pagesOf('dlg_nox_win_relight_nox')).toContain('ありがとう');
    expect(pagesOf('dlg_nox_win_relight_mio')).toContain('空へ 帰っていく');
    expect(pagesOf('dlg_nox_win_relight_luka')).toContain('ノクス');
    // §4.5 結末: 「最後に ひとつ 流れ星が 落ちた」 is the ending's last image (Phase 5).
    const whole = [...talk(talkHost(TOWER_5F), 'dlg_nox_win'), ...chain].map(pagesOf).join('\n');
    expect(whole).not.toContain('流れ星');
  });
});

describe('chapter 4 script: town reactions (§13 row 15)', () => {
  it('the Minato boy waits for the light once the lighthouse is unlocked, else as in chapter 4', () => {
    expect(talk(talkHost(LIGHTHOUSE_UNLOCKED), 'dlg_minato_boy')).toEqual(['dlg_minato_boy_final']);
    expect(talk(talkHost(TOWER_5F), 'dlg_minato_boy')).toEqual(['dlg_minato_boy_final']);
    expect(talk(talkHost(CHAPTER_4), 'dlg_minato_boy')).toEqual(['dlg_minato_boy_ch4']);
    expect(
      talk(talkHost({ ...CHAPTER_4, 'ruins.boss_defeated': false }), 'dlg_minato_boy'),
    ).toEqual(['dlg_minato_boy_ch2']);
    expect(DIALOGS['dlg_minato_boy']?.branches?.map((b) => b.if)).toEqual([
      'minato.lighthouse_unlocked',
      'ruins.boss_defeated',
      'forest.boss_defeated',
      'main.core_shattered',
      'minato.intro_done',
      undefined,
    ]);
    expect(DIALOGS['dlg_minato_boy_final']?.speaker).toBe('男の子');
    expect(DIALOGS['dlg_minato_boy_final']?.pages).toHaveLength(1);
    const text = talkText(talkHost(LIGHTHOUSE_UNLOCKED), 'dlg_minato_boy');
    expect(text).toContain('灯台');
    expect(text).toContain('光');
    expect(text).toContain('待ってる');
  });

  it('grandpa is untouched: the unlocked branch still sends Luka to the lighthouse', () => {
    expect(talk(talkHost(LIGHTHOUSE_UNLOCKED), 'dlg_grandpa_entry')).toEqual([
      'dlg_grandpa_go_lighthouse',
    ]);
    expect(talk(talkHost(CHAPTER_4), 'dlg_grandpa_entry')).toEqual(['dlg_grandpa_final']);
  });
});

describe('chapter 4 script: references', () => {
  const TOWN_FINAL = ['dlg_minato_boy_final'];
  const townDialogs = minatoDialogs as Record<string, DialogNodeJson>;
  const newDialogs: Record<string, DialogNodeJson> = {
    ...(lighthouseDialogs as Record<string, DialogNodeJson>),
    ...Object.fromEntries(TOWN_FINAL.map((id) => [id, townDialogs[id] as DialogNodeJson])),
  };
  const newEvents = lighthouseEvents as Record<string, EventCommand[]>;

  it('defines every id the tower maps use', () => {
    for (const id of TOWN_FINAL) expect(townDialogs[id], id).toBeDefined();
    expect(Object.keys(lighthouseDialogs)).toEqual(
      expect.arrayContaining([
        'dlg_sign_tower_1f',
        'dlg_sign_tower_2f',
        'dlg_sign_tower_3f',
        'dlg_sign_tower_4f',
        'dlg_sign_tower_5f',
        'dlg_tower_gate',
        'dlg_nox_top_idle',
        'dlg_tower_voice_1',
        'dlg_tower_voice_2',
        'dlg_tower_voice_3',
        'dlg_tower_voice_4',
        'dlg_tower_voice_5',
        'dlg_tower_lever',
        'dlg_tower_fountain_sealed',
        'dlg_tower_fountain_wake',
        'dlg_lighthouse_top',
        'dlg_nox_win',
        'dlg_nox_win_relight',
      ]),
    );
    expect(Object.keys(newEvents).sort()).toEqual([
      'ev_lighthouse_top',
      'ev_nox_win',
      'ev_tower_fountain_sealed',
      'ev_tower_fountain_wake',
      'ev_tower_lever_a',
      'ev_tower_lever_b',
      'ev_tower_voice_1',
      'ev_tower_voice_2',
      'ev_tower_voice_3',
      'ev_tower_voice_4',
      'ev_tower_voice_5',
    ]);
  });

  it('every next, branch and choice target in the new dialogs exists', () => {
    for (const [id, node] of Object.entries(newDialogs)) {
      const targets = [
        node.next,
        ...(node.branches ?? []).map((b) => b.next),
        ...(node.choices ?? []).map((c) => c.next),
      ].filter((t): t is string => t !== undefined);
      for (const t of targets) expect(DIALOGS[t], `${id} → ${t}`).toBeDefined();
    }
  });

  it('keeps every state change in the events: no tower dialog carries effects or choices', () => {
    for (const [id, node] of Object.entries(lighthouseDialogs as Record<string, DialogNodeJson>)) {
      expect(node.effects, `${id} effects`).toBeUndefined();
      expect(node.choices, `${id} choices`).toBeUndefined();
      expect(node.branches, `${id} branches`).toBeUndefined();
    }
  });

  it('every say in the new events names an existing dialog', () => {
    for (const [id, commands] of Object.entries(newEvents)) {
      for (const c of commands) {
        if (c.cmd === 'say') expect(DIALOGS[c.dialog], `${id} say ${c.dialog}`).toBeDefined();
      }
    }
  });

  it('every conversation entered at any new node ends without choices', () => {
    for (const id of Object.keys(newDialogs)) {
      const seen = talk(talkHost(TOWER_5F), id);
      expect(seen.length).toBeGreaterThan(0);
      const last = DIALOGS[seen.at(-1) ?? ''];
      expect(last?.next).toBeUndefined();
      expect(last?.choices).toBeUndefined();
    }
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
