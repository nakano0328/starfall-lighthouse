import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { ENEMIES } from '@data/enemies';

import { ACTOR_STYLES, renderActorSheet } from './actors';
import { BATTLE_BG_IDS, renderBattleBackground } from './backgrounds';
import { renderEnemy } from './enemies';
import {
  renderChest,
  renderCursor,
  renderGate,
  renderSavePoint,
  renderSign,
  renderVine,
} from './objects';
import type { Pixmap } from './pixmap';
import { PORTRAITS, renderPortrait } from './portraits';
import { AREA_IDS, renderTileset } from './tiles';

/**
 * Generates the game's pixel art into public/assets/images/ (docs/ADR/0003-generated-art.md).
 * Run with `npm run art`. Every generator is deterministic, so the PNGs only change when
 * the code does.
 */
export interface ArtFile {
  /** Path under public/assets/images/. */
  path: string;
  render: () => Pixmap;
}

export function artFiles(): ArtFile[] {
  const files: ArtFile[] = [];
  for (const area of AREA_IDS) {
    files.push({ path: `tiles/ts_${area}.png`, render: () => renderTileset(area) });
  }
  for (const [key, style] of Object.entries(ACTOR_STYLES)) {
    files.push({ path: `characters/${key}.png`, render: () => renderActorSheet(style) });
  }
  for (const id of BATTLE_BG_IDS) {
    files.push({ path: `backgrounds/${id}.png`, render: () => renderBattleBackground(id) });
  }
  for (const enemy of ENEMIES) {
    const size = Math.round(96 * (enemy.scale ?? 1));
    files.push({
      path: `enemies/${enemy.imageKey}.png`,
      render: () => renderEnemy(enemy.id, size),
    });
  }
  for (const portrait of PORTRAITS) {
    files.push({ path: `portraits/${portrait.key}.png`, render: () => renderPortrait(portrait) });
  }
  files.push(
    { path: 'objects/obj_chest.png', render: renderChest },
    { path: 'objects/obj_sign.png', render: renderSign },
    { path: 'objects/obj_save_point.png', render: renderSavePoint },
    { path: 'objects/obj_gate.png', render: renderGate },
    { path: 'objects/obj_vine.png', render: renderVine },
    { path: 'ui/ui_cursor.png', render: renderCursor },
  );
  return files;
}

export async function main(args: string[]): Promise<void> {
  const outDir = args[0] ?? join(process.cwd(), 'public', 'assets', 'images');
  const filter = args[1];
  for (const file of artFiles()) {
    if (filter && !file.path.includes(filter)) continue;
    const target = join(outDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    const pm = file.render();
    writeFileSync(target, pm.toPng());
    console.info(`${file.path}  ${pm.width}x${pm.height}`);
  }
}
