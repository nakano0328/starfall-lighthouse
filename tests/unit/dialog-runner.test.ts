import { describe, expect, it } from 'vitest';

import type { DialogHost } from '@core/dialog/runner';
import { DialogError, DialogRunner } from '@core/dialog/runner';
import { Flags } from '@core/flags';
import type { DialogNode, EventCommand } from '@data/types';

function host(flags = new Flags()): DialogHost & { applied: EventCommand[] } {
  const applied: EventCommand[] = [];
  return {
    flags,
    applied,
    applyEffect: (cmd) => {
      applied.push(cmd);
    },
    format: (t) => t.replace('{luka}', 'ルカ'),
  };
}

const nodes: Record<string, DialogNode> = {
  dlg_entry: {
    id: 'dlg_entry',
    pages: [],
    branches: [{ if: 'a.done', next: 'dlg_after' }, { next: 'dlg_first' }],
  },
  dlg_first: {
    id: 'dlg_first',
    speaker: 'じい',
    portrait: 'portrait_x',
    pages: ['こんにちは {luka}。', '二ページ目。'],
    effects: [
      { cmd: 'give_item', item: 'it_herb', qty: 1 },
      { cmd: 'set_flag', key: 'a.done', value: true },
      { cmd: 'set_flag', key: 'a.count', increment: 2 },
    ],
    next: 'dlg_choice',
  },
  dlg_choice: {
    id: 'dlg_choice',
    pages: ['どうする？'],
    choices: [
      { text: 'はい', next: 'dlg_yes' },
      { text: 'いいえ', effects: [{ cmd: 'set_flag', key: 'a.no', value: true }] },
    ],
    effects: [{ cmd: 'play_se', key: 'se_cursor' }],
    next: 'dlg_after',
  },
  dlg_yes: { id: 'dlg_yes', pages: ['はいを選んだ。'] },
  dlg_after: { id: 'dlg_after', pages: ['もう会った。'] },
  dlg_pass: {
    id: 'dlg_pass',
    pages: [],
    effects: [{ cmd: 'set_flag', key: 'p.x', value: 1 }],
    next: 'dlg_after',
  },
  dlg_loop_a: { id: 'dlg_loop_a', pages: [], next: 'dlg_loop_b' },
  dlg_loop_b: { id: 'dlg_loop_b', pages: [], next: 'dlg_loop_a' },
  dlg_bad: {
    id: 'dlg_bad',
    pages: ['x'],
    effects: [{ cmd: 'warp', map: 'm', x: 0, y: 0, facing: 'up' }],
  },
  dlg_dead_branch: {
    id: 'dlg_dead_branch',
    pages: [],
    branches: [{ if: 'never.set', next: 'dlg_after' }],
  },
};

describe('DialogRunner', () => {
  it('resolves branches, formats pages and runs effects before next', () => {
    const h = host();
    const r = new DialogRunner(nodes, h);
    const p1 = r.start('dlg_entry');
    expect(p1).toMatchObject({
      kind: 'page',
      nodeId: 'dlg_first',
      speaker: 'じい',
      portrait: 'portrait_x',
      text: 'こんにちは ルカ。',
      pageIndex: 0,
      pageCount: 2,
    });
    expect(r.active).toBe(true);
    const p2 = r.advance();
    expect(p2).toMatchObject({ kind: 'page', text: '二ページ目。', pageIndex: 1 });
    expect(h.applied).toEqual([]);
    const p3 = r.advance();
    expect(h.applied).toEqual([{ cmd: 'give_item', item: 'it_herb', qty: 1 }]);
    expect(h.flags.has('a.done')).toBe(true);
    expect(h.flags.get('a.count', 0)).toBe(2);
    expect(p3).toMatchObject({ kind: 'page', nodeId: 'dlg_choice', choices: ['はい', 'いいえ'] });
  });

  it('waits for a choice on the last page and follows the chosen branch', () => {
    const h = host();
    const r = new DialogRunner(nodes, h);
    r.start('dlg_choice');
    expect(r.advance()).toMatchObject({ kind: 'page', nodeId: 'dlg_choice' });
    const after = r.choose(0);
    expect(h.applied).toEqual([{ cmd: 'play_se', key: 'se_cursor' }]);
    expect(after).toMatchObject({ kind: 'page', nodeId: 'dlg_yes' });
    expect(r.advance()).toEqual({ kind: 'end' });
    expect(r.active).toBe(false);
  });

  it('uses the node next when the choice has none, after the choice effects', () => {
    const h = host();
    const r = new DialogRunner(nodes, h);
    r.start('dlg_choice');
    expect(r.choose(1)).toMatchObject({ kind: 'page', nodeId: 'dlg_after' });
    expect(h.flags.has('a.no')).toBe(true);
    expect(() => r.choose(5)).toThrow(DialogError);
  });

  it('takes the visited branch once the flag is set', () => {
    const flags = new Flags({ 'a.done': true });
    const r = new DialogRunner(nodes, host(flags));
    expect(r.start('dlg_entry')).toMatchObject({ kind: 'page', nodeId: 'dlg_after' });
  });

  it('passes through empty nodes, ends on dead branches and detects loops', () => {
    const h = host();
    const r = new DialogRunner(nodes, h);
    expect(r.start('dlg_pass')).toMatchObject({ kind: 'page', nodeId: 'dlg_after' });
    expect(h.flags.get('p.x', 0)).toBe(1);
    expect(r.start('dlg_dead_branch')).toEqual({ kind: 'end' });
    expect(() => r.start('dlg_loop_a')).toThrow(/loop/);
    expect(() => r.start('dlg_missing')).toThrow(/unknown dialog/);
  });

  it('rejects effects that are not allowed in dialogs and supports cancel', () => {
    const r = new DialogRunner(nodes, host());
    r.start('dlg_bad');
    expect(() => r.advance()).toThrow(/not allowed/);
    r.start('dlg_first');
    r.cancel();
    expect(r.active).toBe(false);
    expect(r.advance()).toEqual({ kind: 'end' });
  });

  it('shows inline pages with no speaker and no effects', () => {
    const h = host();
    const r = new DialogRunner(nodes, h);
    expect(r.startInline(['一行目。', '{luka} の二行目。'])).toEqual({
      kind: 'page',
      nodeId: '__inline',
      text: '一行目。',
      pageIndex: 0,
      pageCount: 2,
    });
    expect(r.active).toBe(true);
    expect(r.advance()).toEqual({
      kind: 'page',
      nodeId: '__inline',
      text: 'ルカ の二行目。',
      pageIndex: 1,
      pageCount: 2,
    });
    expect(r.advance()).toEqual({ kind: 'end' });
    expect(r.active).toBe(false);
    expect(h.applied).toEqual([]);
  });

  it('shows one empty inline page when given no pages', () => {
    const r = new DialogRunner(nodes, host());
    expect(r.startInline([])).toEqual({
      kind: 'page',
      nodeId: '__inline',
      text: '',
      pageIndex: 0,
      pageCount: 1,
    });
    expect(r.advance()).toEqual({ kind: 'end' });
  });

  it('offers inline choices on the last page and waits for one', () => {
    const h = host();
    const r = new DialogRunner(nodes, h);
    const page = r.startInline([''], ['はい', 'いいえ']);
    expect(page).toEqual({
      kind: 'page',
      nodeId: '__inline',
      text: '',
      pageIndex: 0,
      pageCount: 1,
      choices: ['はい', 'いいえ'],
    });
    expect(r.advance()).toEqual(page);
    expect(r.active).toBe(true);
    expect(r.choose(1)).toEqual({ kind: 'end' });
    expect(r.active).toBe(false);
    expect(h.applied).toEqual([]);
  });
});
