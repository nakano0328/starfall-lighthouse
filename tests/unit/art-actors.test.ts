import { describe, expect, it } from 'vitest';

import {
  ACTOR_FRAMES,
  ACTOR_FRAME_SIZE,
  ACTOR_KEYS,
  ACTOR_STRIDES,
  IMAGES,
  imageAsset,
} from '@/assets/manifest';
import { MAP_SOURCES } from '@data/maps';

import { ACTOR_STYLES, renderActorFrame, renderActorSheet } from '../../scripts/art/actors';
import { artFiles } from '../../scripts/art/index';
import {
  renderChest,
  renderCursor,
  renderGate,
  renderSavePoint,
  renderSign,
  renderVine,
} from '../../scripts/art/objects';

describe('generated actor sheets (ADR-0003)', () => {
  it('exist for every actor key in the manifest, and the manifest points at their file', () => {
    for (const key of ACTOR_KEYS) {
      expect(ACTOR_STYLES[key], key).toBeDefined();
      expect(imageAsset(key).src).toBe(`characters/${key}.png`);
      expect(imageAsset(key).placeholder).toBe('actor');
    }
    const paths = artFiles().map((f) => f.path);
    for (const key of ACTOR_KEYS) expect(paths).toContain(`characters/${key}.png`);
  });

  it('lay out strides × facings at 32 px and render identically on each run', () => {
    const style = ACTOR_STYLES['sprite_player'];
    if (!style) throw new Error('no player style');
    const a = renderActorSheet(style);
    const b = renderActorSheet(style);
    expect(a.width).toBe(ACTOR_FRAME_SIZE * ACTOR_STRIDES.length);
    expect(a.height).toBe(ACTOR_FRAME_SIZE * ACTOR_FRAMES.length);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('mirrors left into right and keeps a transparent margin around the figure', () => {
    for (const [key, style] of Object.entries(ACTOR_STYLES)) {
      const left = renderActorFrame(style, 'left', '');
      const right = renderActorFrame(style, 'right', '');
      for (let y = 0; y < 32; y += 4) {
        for (let x = 0; x < 32; x += 1) {
          expect(right.get(31 - x, y), `${key} ${x},${y}`).toEqual(left.get(x, y));
        }
      }
      const down = renderActorFrame(style, 'down', 'a');
      expect(down.get(0, 0).a, key).toBe(0);
      expect(down.get(31, 31).a, key).toBe(0);
      // Something is drawn around the body centre.
      expect(down.get(16, 20).a, key).toBeGreaterThan(0);
    }
  });

  it('are used by every NPC on the maps (no villager left on the generic sheet by accident)', () => {
    const keys = new Set<string>(IMAGES.map((a) => a.key));
    for (const source of Object.values(MAP_SOURCES)) {
      for (const o of source.objects) {
        if (o.type !== 'npc') continue;
        expect(keys.has(o.sprite), `${source.meta.id}/${o.id} uses ${o.sprite}`).toBe(true);
        expect(o.sprite, `${source.meta.id}/${o.id}`).not.toBe('sprite_npc');
      }
    }
  });
});

describe('generated objects', () => {
  it('have the sizes the scenes expect', () => {
    expect([renderChest().width, renderChest().height]).toEqual([64, 32]);
    for (const render of [renderSign, renderSavePoint, renderGate, renderVine]) {
      const pm = render();
      expect([pm.width, pm.height]).toEqual([32, 32]);
      expect(pm.get(0, 0).a).toBe(0);
    }
    const cursor = renderCursor();
    expect([cursor.width, cursor.height]).toEqual([16, 16]);
    expect(cursor.get(5, 8).a).toBe(255);
  });

  it('are listed in the art files and the manifest', () => {
    const paths = artFiles().map((f) => f.path);
    for (const key of ['obj_chest', 'obj_sign', 'obj_save_point', 'obj_gate', 'obj_vine']) {
      expect(paths).toContain(`objects/${key}.png`);
      expect(imageAsset(key).src).toBe(`objects/${key}.png`);
    }
    expect(paths).toContain('ui/ui_cursor.png');
    expect(imageAsset('ui_cursor').src).toBe('ui/ui_cursor.png');
  });
});
