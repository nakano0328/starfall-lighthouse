import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { DIALOG_EFFECT_COMMANDS } from '@core/dialog/runner';
import { compileMap } from '@core/map/compile';
import { parseMapObjects } from '@core/map/objects';
import { DIALOGS } from '@data/dialogs';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import type { DialogNode, EventCommand } from '@data/types';
import { MAP_IDS, getMapSource } from '@data/maps';

const MAX_LINES = 3;
const MAX_LINE_CHARS = 28;

describe('authored dialogs', () => {
  const ids = Object.keys(DIALOGS);

  it('have at least the Minato conversations', () => {
    expect(ids.length).toBeGreaterThanOrEqual(10);
  });

  it('use dlg_ ids and reference only existing nodes', () => {
    for (const [id, node] of Object.entries(DIALOGS)) {
      expect(id, id).toMatch(/^dlg_[a-z0-9_]+$/);
      expect(node.id).toBe(id);
      if (node.next !== undefined) expect(DIALOGS[node.next], `${id}.next`).toBeDefined();
      for (const b of node.branches ?? []) {
        expect(DIALOGS[b.next], `${id} branch → ${b.next}`).toBeDefined();
        if (b.if !== undefined) validateCondition(b.if);
      }
      for (const c of node.choices ?? []) {
        if (c.next !== undefined) expect(DIALOGS[c.next], `${id} choice → ${c.next}`).toBeDefined();
      }
    }
  });

  it('keep pages within the window (3 lines, 28 chars per line) and choices to 4', () => {
    for (const [id, node] of Object.entries(DIALOGS)) {
      node.pages.forEach((page, i) => {
        expect(page.trim().length, `${id} page ${i} empty`).toBeGreaterThan(0);
        const lines = page.split('\n');
        expect(lines.length, `${id} page ${i} lines`).toBeLessThanOrEqual(MAX_LINES);
        for (const line of lines) {
          expect([...line].length, `${id} page ${i}: "${line}"`).toBeLessThanOrEqual(
            MAX_LINE_CHARS,
          );
        }
      });
      if (node.choices) {
        expect(node.choices.length).toBeGreaterThan(0);
        expect(node.choices.length).toBeLessThanOrEqual(4);
        expect(node.pages.length, `${id} choices need a page`).toBeGreaterThan(0);
      }
      if (node.pages.length === 0) {
        expect(
          node.branches !== undefined || node.next !== undefined,
          `${id} empty node needs branches or next`,
        ).toBe(true);
      }
    }
  });

  // DialogRunner.enter consults `branches` only when `pages` is empty, and a routed node
  // never runs its own `effects` / `next` / `choices`; anything else authored on it would be
  // silently dropped at runtime, so reject it here (docs/GAME_DESIGN.md §10.1).
  it('treat a node with branches as a pure router', () => {
    for (const [id, node] of Object.entries(DIALOGS)) {
      if (node.branches === undefined) continue;
      expect(node.branches.length, `${id} branches must not be empty`).toBeGreaterThan(0);
      expect(
        node.pages.length === 0 &&
          node.choices === undefined &&
          node.next === undefined &&
          node.effects === undefined,
        `${id}: a node with branches is a pure router; pages/choices/next/effects are ignored by DialogRunner`,
      ).toBe(true);
    }
  });

  // docs/GAME_DESIGN.md §2: image keys are `portrait_<char>_<expr>`. This only guards the
  // key format; replace it with a manifest membership check (IMAGE_KEYS) once portraits are
  // registered in src/assets/manifest.ts (Phase 6).
  it('use portrait keys in the §2 format', () => {
    for (const [id, node] of Object.entries(DIALOGS)) {
      if (node.portrait !== undefined)
        expect(node.portrait, `${id} portrait`).toMatch(/^portrait_[a-z0-9]+_[a-z0-9]+$/);
    }
  });

  it('only carry the effects allowed in dialogs', () => {
    for (const [id, node] of Object.entries(DIALOGS)) {
      const effects = [
        ...(node.effects ?? []),
        ...(node.choices ?? []).flatMap((c) => c.effects ?? []),
      ];
      for (const e of effects) {
        expect(DIALOG_EFFECT_COMMANDS.has(e.cmd), `${id} effect ${e.cmd}`).toBe(true);
        // Same checks as events-data.test.ts: an unknown id or a non-positive qty is silently
        // a no-op at runtime (Inventory.add rejects it, MenuScene hides the entry). Equipment
        // ids are valid too: quest rewards such as eq_acc_sea_ring (§14) land in the same bag.
        if (e.cmd === 'give_item' || e.cmd === 'take_item') {
          expect(findItem(e.item) ?? findEquip(e.item), `${id} ${e.cmd} ${e.item}`).toBeDefined();
          expect(Number.isInteger(e.qty) && e.qty > 0, `${id} ${e.cmd} qty ${e.qty}`).toBe(true);
        }
        if (e.cmd === 'set_flag')
          expect(e.key, `${id} set_flag ${e.key}`).toMatch(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/);
      }
    }
  });

  // docs/GAME_DESIGN.md §10.3: the opening narration is given verbatim (U+2014 EM DASH ×2).
  it('spell the opening narration exactly as the spec', () => {
    expect(DIALOGS['dlg_narration_opening']?.pages).toEqual([
      '海辺の小さな島、ミナト島。',
      '島の灯台は夜ごと星の光を集め、\n空から落ちた迷い星を空へ帰していた。',
      '\u2014\u2014その夜までは。',
    ]);
  });

  // docs/GAME_DESIGN.md §13: `ev_opening` / `dlg_grandpa_01` set only `minato.intro_done`;
  // `minato.talked_to_grandpa` (row 5) is reserved for `dlg_grandpa_after_shatter`, which
  // happens after `main.core_shattered` and opens the village east exit (§3.1).
  it('do not open the east exit before the core shatters', () => {
    const setFlagKeys = (node: DialogNode): string[] =>
      [...(node.effects ?? []), ...(node.choices ?? []).flatMap((c) => c.effects ?? [])]
        .filter((e): e is Extract<EventCommand, { cmd: 'set_flag' }> => e.cmd === 'set_flag')
        .map((e) => e.key);

    const grandpa01 = DIALOGS['dlg_grandpa_01'];
    expect(grandpa01).toBeDefined();
    if (grandpa01) expect(setFlagKeys(grandpa01)).toEqual(['minato.intro_done']);

    for (const [id, node] of Object.entries(DIALOGS)) {
      if (id === 'dlg_grandpa_after_shatter') continue;
      expect(setFlagKeys(node), `${id} sets minato.talked_to_grandpa`).not.toContain(
        'minato.talked_to_grandpa',
      );
    }
  });

  it('exist for every NPC and sign placed on a map', () => {
    for (const mapId of MAP_IDS) {
      for (const o of parseMapObjects(compileMap(getMapSource(mapId)))) {
        if (o.kind === 'npc')
          expect(DIALOGS[o.dialog], `${mapId} ${o.id} → ${o.dialog}`).toBeDefined();
        if (o.kind === 'sign')
          expect(DIALOGS[o.textId], `${mapId} sign → ${o.textId}`).toBeDefined();
      }
    }
  });
});
