import { describe, expect, it } from 'vitest';

import { CHARACTERS } from '@data/characters';
import { ENCOUNTERS } from '@data/encounters';
import { ENEMIES, findEnemy } from '@data/enemies';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { MAP_SOURCES } from '@data/maps';
import { findSkill } from '@data/skills';
import type { MapMeta } from '@data/types';

const PSEUDO_ACTIONS = new Set(['attack', 'guard', 'charge', 'double_act']);

describe('cross-table references', () => {
  it('every enemy AI action is a pseudo-action or an existing enemy-only skill', () => {
    for (const enemy of ENEMIES) {
      for (const rule of enemy.ai) {
        if (PSEUDO_ACTIONS.has(rule.action)) continue;
        const skill = findSkill(rule.action);
        expect(skill, `${enemy.id} → ${rule.action}`).toBeDefined();
        expect(skill?.enemyOnly, `${rule.action} should be enemy-only`).toBe(true);
      }
      for (const drop of enemy.drops) {
        expect(findItem(drop.itemId), `${enemy.id} drops ${drop.itemId}`).toBeDefined();
      }
      if (enemy.phaseNext !== undefined) {
        expect(findEnemy(enemy.phaseNext), `${enemy.id} → ${enemy.phaseNext}`).toBeDefined();
      }
    }
  });

  it('every encounter group names existing enemies', () => {
    for (const group of ENCOUNTERS) {
      for (const { enemyId } of group.enemies) {
        expect(findEnemy(enemyId), `${group.id} → ${enemyId}`).toBeDefined();
      }
    }
  });

  it('every party skill and starting equipment exists', () => {
    for (const def of Object.values(CHARACTERS)) {
      for (const { skillId } of def.skills) {
        expect(findSkill(skillId)?.enemyOnly, `${def.id} learns ${skillId}`).not.toBe(true);
      }
      for (const id of Object.values(def.initialEquipment)) {
        if (id !== null) expect(findEquip(id), `${def.id} wears ${id}`).toBeDefined();
      }
    }
  });

  it('every map encounter group exists', () => {
    const metas: MapMeta[] = Object.values(MAP_SOURCES).map((m) => m.meta);
    for (const meta of metas) {
      for (const id of meta.encounterGroups) {
        expect(
          ENCOUNTERS.some((g) => g.id === id),
          `${meta.id} → ${id}`,
        ).toBe(true);
      }
    }
  });
});
