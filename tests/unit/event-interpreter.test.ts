import { describe, expect, it } from 'vitest';

import type { EventHost } from '@core/events/interpreter';
import { EventError, EventInterpreter, pickupMessage } from '@core/events/interpreter';
import { Flags } from '@core/flags';
import { Inventory } from '@core/inventory';
import type { EventCommand } from '@data/types';

function makeHost(): EventHost & { log: string[]; resolvers: (() => void)[] } {
  const log: string[] = [];
  const resolvers: (() => void)[] = [];
  const timed = (label: string) =>
    new Promise<void>((resolve) => {
      log.push(`${label}:start`);
      resolvers.push(() => {
        log.push(`${label}:end`);
        resolve();
      });
    });
  return {
    log,
    resolvers,
    flags: new Flags(),
    inventory: new Inventory(() => 99),
    itemName: (id) => (id === 'it_herb' ? 'やくそう' : id),
    say: (id) => timed(`say ${id}`),
    message: (text) => {
      log.push(`message ${text}`);
      return Promise.resolve();
    },
    choice: (texts) => {
      log.push(`choice ${texts.join('/')}`);
      return Promise.resolve(1);
    },
    move: (actor, path) => timed(`move ${actor} ${path.join(',')}`),
    face: (actor, dir) => {
      log.push(`face ${actor} ${dir}`);
    },
    wait: (ms) => timed(`wait ${ms}`),
    warp: (map) => timed(`warp ${map}`),
    fade: (dir, ms) => timed(`fade ${dir} ${ms}`),
    shake: (ms) => timed(`shake ${ms}`),
    flash: (ms) => timed(`flash ${ms}`),
    playBgm: (key) => {
      log.push(`bgm ${key}`);
    },
    playSe: (key) => {
      log.push(`se ${key}`);
    },
    healParty: () => {
      log.push('heal');
    },
    addMember: (id) => {
      log.push(`add ${id}`);
    },
    showChapter: (title) => timed(`chapter ${title}`),
    spawnNpc: (id) => {
      log.push(`spawn ${id}`);
    },
    removeNpc: (id) => {
      log.push(`remove ${id}`);
    },
    battle: (group) => {
      log.push(`battle ${group}`);
      return Promise.resolve('win');
    },
    endGame: () => {
      log.push('end');
    },
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('EventInterpreter', () => {
  it('runs commands in order, awaiting each timed one', async () => {
    const host = makeHost();
    const events: Record<string, EventCommand[]> = {
      ev_a: [
        { cmd: 'play_bgm', key: 'none' },
        { cmd: 'say', dialog: 'dlg_x' },
        { cmd: 'face', actor: 'player', dir: 'up' },
        { cmd: 'set_flag', key: 'a.b', value: 3 },
        { cmd: 'set_flag', key: 'a.b', increment: 2 },
        { cmd: 'set_flag', key: 'a.c' },
      ],
    };
    const it = new EventInterpreter(host, events);
    const run = it.run('ev_a');
    await flush();
    expect(it.running).toBe(true);
    expect(host.log).toEqual(['bgm none', 'say dlg_x:start']);
    host.resolvers.shift()?.();
    await run;
    expect(it.running).toBe(false);
    expect(host.log.slice(2)).toEqual(['say dlg_x:end', 'face player up']);
    expect(host.flags.get('a.b', 0)).toBe(5);
    expect(host.flags.get('a.c', false)).toBe(true);
  });

  it('lets wait:false moves overlap and finishes them before the script ends', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_m: [
        { cmd: 'move', actor: 'npc_a', path: ['left'], wait: false },
        { cmd: 'face', actor: 'npc_b', dir: 'down' },
      ],
    });
    const run = it.run('ev_m');
    await flush();
    expect(host.log).toEqual(['move npc_a left:start', 'face npc_b down']);
    expect(it.running).toBe(true);
    host.resolvers.shift()?.();
    await run;
    expect(host.log.at(-1)).toBe('move npc_a left:end');
  });

  it('gives and takes items with pickup messages, resolves choices into flags', async () => {
    const host = makeHost();
    host.inventory.add('it_herb', 98);
    const it = new EventInterpreter(host, {
      ev_i: [
        { cmd: 'give_item', item: 'it_herb', qty: 3 },
        { cmd: 'take_item', item: 'it_herb', qty: 500 },
        { cmd: 'choice', text: ['はい', 'いいえ'], set: 'q.answer' },
      ],
    });
    await it.run('ev_i');
    expect(host.inventory.count('it_herb')).toBe(0);
    expect(host.log[0]).toBe('message やくそうを 手に入れた！（持ちきれない分は あきらめた）');
    expect(host.flags.get('q.answer', -1)).toBe(1);
  });

  it('runs the win event after a battle and rejects unknown events', async () => {
    const host = makeHost();
    const it = new EventInterpreter(host, {
      ev_b: [{ cmd: 'battle', group: 'grp_boss', win_event: 'ev_w' }],
      ev_w: [{ cmd: 'set_flag', key: 'forest.boss_defeated', value: true }],
    });
    await it.run('ev_b');
    expect(host.flags.has('forest.boss_defeated')).toBe(true);
    await expect(it.run('ev_nope')).rejects.toThrow(EventError);
  });

  it('formats pickup messages', () => {
    expect(pickupMessage('やくそう', 1, 1)).toBe('やくそうを 手に入れた！');
    expect(pickupMessage('やくそう', 2, 2)).toBe('やくそうを 2こ 手に入れた！');
    expect(pickupMessage('やくそう', 1, 3)).toBe(
      'やくそうを 手に入れた！（持ちきれない分は あきらめた）',
    );
    expect(pickupMessage('やくそう', 0, 1)).toBe('やくそうは これ以上 持てない。');
  });
});
