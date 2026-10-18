import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import type { SaveData } from '@core/save';
import { allSaveKeys, readSave } from '@core/save';
import { MIGRATION_CONTEXT, loadGameState } from '@data/saveContext';
import { InputBindings } from '@ui/InputBindings';
import type { ListMenuItem } from '@ui/ListMenu';
import { ListMenu } from '@ui/ListMenu';

import { SceneKey } from './keys';
import type { WorldSceneData } from './WorldScene';

/**
 * Defeat screen (docs/GAME_DESIGN.md §5.11 / §11.5): 「最後のセーブから再開」 when any
 * slot holds a save (the most recently written one), otherwise only 「タイトルへ」.
 * The boss-retry option arrives with the auto backup in Phase 5.
 */
export class GameOverScene extends Phaser.Scene {
  private input2!: InputBindings;
  private menu!: ListMenu;
  private leaving = false;

  constructor() {
    super(SceneKey.GameOver);
  }

  create(): void {
    this.leaving = false;
    this.cameras.main.setBackgroundColor(0x05061a);
    this.add
      .text(GAME_WIDTH / 2, 110, 'ゲームオーバー', {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        color: COLORS.textDanger,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 150, '星の光が とだえてしまった……', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);

    const latest = latestSave(readStorage);
    const items: ListMenuItem[] = [
      { label: '最後のセーブから再開', disabled: latest === null },
      { label: 'タイトルへ' },
    ];
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
    this.menu = new ListMenu(this, {
      x: GAME_WIDTH / 2 - 110,
      y: 220,
      items,
      onConfirm: (index) => {
        if (index === 0 && latest) this.leave(SceneKey.World, { state: loadGameState(latest) });
        else if (index === 1) this.leave(SceneKey.Title);
      },
    });
    this.cameras.main.fadeIn(400, 0, 0, 0);
    if (window.__starfall) window.__starfall.scene = SceneKey.GameOver;
  }

  override update(): void {
    if (!this.leaving) this.menu.update(this.input2);
  }

  private leave(target: SceneKey, data?: WorldSceneData): void {
    this.leaving = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(target, data);
    });
  }

  /** e2e/debug: the option list. */
  get options(): ListMenu {
    return this.menu;
  }
}

/** The save with the newest `savedAt` across the slots and the auto backup, or null when none exists. */
export function latestSave(read: (key: string) => string | null): SaveData | null {
  let best: SaveData | null = null;
  for (const key of allSaveKeys()) {
    const data = readSave(read, key, MIGRATION_CONTEXT);
    if (data && (best === null || data.savedAt > best.savedAt)) best = data;
  }
  return best;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const GAME_OVER_LAYOUT = { width: GAME_WIDTH, height: GAME_HEIGHT } as const;
