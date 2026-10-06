import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_TITLE, GAME_TITLE_EN, GAME_VERSION, GAME_WIDTH } from '@/config';
import type { SaveData } from '@core/save';
import {
  SAVE_KEY_AUTO,
  SAVE_SLOT_COUNT,
  anySaveCleared,
  deserialize,
  findSlotsWithSaves,
  readSave,
  slotKey,
  slotSummary,
} from '@core/save';
import { levelFromExp } from '@core/party/exp';
import { CHARACTERS } from '@data/characters';
import { MIGRATION_CONTEXT, loadGameState, newGameState, placeName } from '@data/saveContext';
import { InputBindings } from '@ui/InputBindings';
import type { ListMenuItem } from '@ui/ListMenu';
import { ListMenu } from '@ui/ListMenu';
import { Window } from '@ui/Window';

import { SceneKey } from './keys';
import type { WorldSceneData } from './WorldScene';

/**
 * Title screen: はじめから / つづきから / 設定 (GAME_DESIGN §11.5). つづきから opens the
 * slot list; 設定 lives in the pause menu for now.
 */
export class TitleScene extends Phaser.Scene {
  private input2!: InputBindings;
  private menu!: ListMenu;
  private slotMenu: ListMenu | undefined;
  private slotWindow: Window | undefined;
  private mode: 'main' | 'slots' = 'main';
  private starting = false;
  private cleared = false;

  constructor() {
    super(SceneKey.Title);
  }

  create(): void {
    this.starting = false;
    this.mode = 'main';
    this.slotMenu = undefined;
    this.slotWindow = undefined;
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

    const hasSave =
      findSlotsWithSaves(readStorage, MIGRATION_CONTEXT).length > 0 ||
      readSave(readStorage, SAVE_KEY_AUTO, MIGRATION_CONTEXT) !== null;
    // A star once any save has seen the ending (§11.5).
    this.cleared = anySaveCleared(readStorage, MIGRATION_CONTEXT);
    if (this.cleared) {
      this.add
        .text(GAME_WIDTH / 2 + 150, 70, '★', {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          color: COLORS.textAccent,
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5);
    }
    this.input2 = new InputBindings(this);
    this.menu = new ListMenu(this, {
      x: GAME_WIDTH / 2 - 80,
      y: 200,
      items: [
        { label: 'はじめから' },
        { label: 'つづきから', disabled: !hasSave, ...(hasSave ? {} : { note: '（セーブなし）' }) },
        { label: '設定', disabled: true, note: '（メニューから変更できます）' },
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
    if (this.starting) return;
    if (this.mode === 'main') this.menu.update(this.input2);
    else this.slotMenu?.update(this.input2);
  }

  /** e2e/debug: which list is active. */
  get currentMode(): 'main' | 'slots' {
    return this.mode;
  }

  /** e2e/debug: whether the clear star is shown. */
  get hasCleared(): boolean {
    return this.cleared;
  }

  /** e2e/debug: the slot list labels (つづきから). */
  get slotLabels(): string[] {
    return this.slotMenu?.itemLabels ?? [];
  }

  private onConfirm(index: number): void {
    if (index === 0) this.startGame(newGameState(Date.now()));
    else if (index === 1) this.showSlots();
  }

  private showSlots(): void {
    this.mode = 'slots';
    const items: ListMenuItem[] = [];
    const saves: (SaveData | null)[] = [];
    for (let slot = 0; slot < SAVE_SLOT_COUNT; slot += 1) {
      const raw = readStorage(slotKey(slot));
      const data = raw === null ? null : deserialize(raw, MIGRATION_CONTEXT);
      saves.push(data);
      if (!data) {
        items.push({ label: `スロット ${slot + 1}   ----`, disabled: true });
        continue;
      }
      const s = slotSummary(data, placeName);
      const leader = CHARACTERS[s.leaderId].name;
      items.push({
        label: `スロット ${slot + 1}   ${s.chapter}  ${s.place}  ${leader} Lv${levelFromExp(s.leaderExp)}  ${s.playTime}`,
      });
    }
    // The auto backup (ボス前 / クリア後の巻き戻し, §5.11 / §13 #20) continues like a slot.
    const auto = readSave(readStorage, SAVE_KEY_AUTO, MIGRATION_CONTEXT);
    saves.push(auto);
    if (auto) {
      const s = slotSummary(auto, placeName);
      const leader = CHARACTERS[s.leaderId].name;
      items.push({
        label: `オート      ${s.chapter}  ${s.place}  ${leader} Lv${levelFromExp(s.leaderExp)}  ${s.playTime}`,
      });
    } else {
      items.push({ label: 'オート      ----', disabled: true });
    }
    items.push({ label: 'もどる' });
    this.slotWindow = new Window(this, 40, 176, GAME_WIDTH - 80, 178);
    this.menu.setVisible(false);
    this.slotMenu = new ListMenu(this, {
      x: 56,
      y: 200,
      lineHeight: 28,
      fontSize: 15,
      items,
      onConfirm: (index) => {
        const data = saves[index];
        if (index < saves.length && data) this.startGame(loadGameState(data));
        else this.hideSlots();
      },
      onCancel: () => this.hideSlots(),
    });
  }

  private hideSlots(): void {
    this.mode = 'main';
    this.slotMenu?.destroy();
    this.slotWindow?.destroy();
    this.slotMenu = undefined;
    this.slotWindow = undefined;
    this.menu.setVisible(true);
    this.input2.flush();
  }

  private startGame(state: WorldSceneData['state']): void {
    this.starting = true;
    const data: WorldSceneData = { state };
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
