import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_TITLE, GAME_TITLE_EN, GAME_VERSION, GAME_WIDTH } from '@/config';
import { createNewSave, findSlotsWithSaves } from '@core/save';
import { createMember } from '@core/party/member';
import { createGameState } from '@core/state';
import { CHARACTERS } from '@data/characters';
import { findItem } from '@data/items';
import { InputBindings } from '@ui/InputBindings';
import { ListMenu } from '@ui/ListMenu';

import { SceneKey } from './keys';
import type { WorldSceneData } from './WorldScene';

/**
 * Title screen: はじめから / つづきから / 設定 (GAME_DESIGN §11.5).
 * つづきから is greyed out until a save exists; 設定 arrives with the menu work (#9).
 */
export class TitleScene extends Phaser.Scene {
  private input2!: InputBindings;
  private menu!: ListMenu;
  private starting = false;

  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    this.starting = false;
    this.cameras.main.setBackgroundColor(COLORS.night);
    this.spawnStars(60);

    this.add
      .image(GAME_WIDTH / 2 + 180, GAME_HEIGHT / 2 + 60, 'px_lighthouse')
      .setScale(2)
      .setOrigin(0.5, 1);

    this.add
      .text(GAME_WIDTH / 2, 86, GAME_TITLE, {
        fontFamily: 'sans-serif',
        fontSize: '40px',
        color: COLORS.textMain,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 124, GAME_TITLE_EN, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH - 8, GAME_HEIGHT - 8, `v${GAME_VERSION} 開発中`, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 1);

    const hasSave = findSlotsWithSaves(readStorage).length > 0;
    this.input2 = new InputBindings(this);
    this.menu = new ListMenu(this, {
      x: GAME_WIDTH / 2 - 80,
      y: 200,
      items: [
        { label: 'はじめから' },
        { label: 'つづきから', disabled: !hasSave, ...(hasSave ? {} : { note: '（セーブなし）' }) },
        { label: '設定', disabled: true, note: '（準備中）' },
      ],
      onConfirm: (index) => this.onConfirm(index),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    if (window.__starfall) {
      window.__starfall.ready = true;
      window.__starfall.scene = SceneKey.Title;
    }
  }

  override update(): void {
    if (!this.starting) this.menu.update(this.input2);
  }

  private onConfirm(index: number): void {
    if (index === 0) this.startNewGame();
  }

  private startNewGame(): void {
    this.starting = true;
    const save = createNewSave(Date.now());
    const data: WorldSceneData = {
      state: createGameState(save, {
        maxQtyOf: (itemId) => findItem(itemId)?.maxQty ?? 99,
        party: [createMember(CHARACTERS.ch_luka)],
      }),
    };
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SceneKey.World, data);
    });
  }

  private spawnStars(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const x = Phaser.Math.Between(0, GAME_WIDTH);
      const y = Phaser.Math.Between(0, GAME_HEIGHT - 80);
      const star = this.add.image(x, y, 'px_star').setAlpha(Phaser.Math.FloatBetween(0.3, 1));
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: 0.1 },
        duration: Phaser.Math.Between(800, 2400),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 1500),
      });
    }
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
