import { describe, expect, it } from 'vitest';

import { validateCondition } from '@core/condition';
import { DIALOG_EFFECT_COMMANDS } from '@core/dialog/runner';
import { compileMap } from '@core/map/compile';
import { parseMapObjects } from '@core/map/objects';
import { DIALOGS } from '@data/dialogs';
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

  it('only carry the effects allowed in dialogs', () => {
    for (const [id, node] of Object.entries(DIALOGS)) {
      const effects = [
        ...(node.effects ?? []),
        ...(node.choices ?? []).flatMap((c) => c.effects ?? []),
      ];
      for (const e of effects)
        expect(DIALOG_EFFECT_COMMANDS.has(e.cmd), `${id} effect ${e.cmd}`).toBe(true);
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
