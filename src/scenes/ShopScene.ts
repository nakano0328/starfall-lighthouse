import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import type { Merchandise } from '@core/shop';
import { buy, maxAffordable, sell, sellableEntries, shopStock } from '@core/shop';
import type { GameState } from '@core/state';
import { findEquip } from '@data/equipment';
import { findItem } from '@data/items';
import { maxQtyOf } from '@data/saveContext';
import { getShop } from '@data/shops';
import { InputBindings } from '@ui/InputBindings';
import type { ListMenuItem } from '@ui/ListMenu';
import { ListMenu } from '@ui/ListMenu';
import { Window } from '@ui/Window';

import { SceneKey } from './keys';

export interface ShopSceneData {
  state: GameState;
  shopId: string;
}

const LEFT = { x: 16, y: 16, w: 160, h: GAME_HEIGHT - 32 } as const;
const RIGHT = { x: 184, y: 16, w: GAME_WIDTH - 184 - 16, h: GAME_HEIGHT - 32 } as const;
const LINE = 26;
const PAGE_SIZE = 8;
const LOOKUP = { item: findItem, equip: findEquip };

type Mode = 'root' | 'buy' | 'sell' | 'qty' | 'confirm' | 'done';

interface Row extends Merchandise {
  qty: number;
  unitPrice: number;
}

/**
 * Shop overlay (docs/GAME_DESIGN.md §7.5, §9.2): 買う／売る／やめる over the paused
 * field. Every purchase and sale goes through a quantity pick and a はい／いいえ
 * confirmation (§11.4 連打防止).
 */
export class ShopScene extends Phaser.Scene {
  private state!: GameState;
  private shopId = '';
  private input2!: InputBindings;
  private mode: Mode = 'root';
  private rootMenu!: ListMenu;
  private listMenu: ListMenu | undefined;
  private confirmMenu: ListMenu | undefined;
  private header!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private description!: Phaser.GameObjects.Text;
  private message!: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private page = 0;
  private dealing: 'buy' | 'sell' = 'buy';
  private chosen: Row | undefined;
  private qty = 1;
  private maxQty = 1;

  constructor() {
    super(SceneKey.Shop);
  }

  init(data: ShopSceneData): void {
    this.state = data.state;
    this.shopId = data.shopId;
    this.mode = 'root';
    this.rows = [];
    this.page = 0;
    this.chosen = undefined;
  }

  create(): void {
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setOrigin(0);
    new Window(this, LEFT.x, LEFT.y, LEFT.w, LEFT.h);
    new Window(this, RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h);

    const shop = getShop(this.shopId);
    this.add.text(LEFT.x + 12, LEFT.y + 12, shop.name, {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: COLORS.textDim,
      wordWrap: { width: LEFT.w - 24 },
    });
    this.rootMenu = new ListMenu(this, {
      x: LEFT.x + 8,
      y: LEFT.y + 64,
      lineHeight: 30,
      items: [{ label: '買う' }, { label: '売る' }, { label: 'やめる' }],
      onConfirm: (index) => {
        if (index === 0) this.showList('buy');
        else if (index === 1) this.showList('sell');
        else this.close();
      },
      onCancel: () => this.close(),
    });
    this.header = this.add.text(RIGHT.x + 16, RIGHT.y + 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: COLORS.textMain,
      lineSpacing: 6,
    });
    this.goldText = this.add
      .text(RIGHT.x + RIGHT.w - 16, RIGHT.y + 14, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: COLORS.textAccent,
      })
      .setOrigin(1, 0);
    this.description = this.add
      .text(RIGHT.x + 16, RIGHT.y + RIGHT.h - 48, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: COLORS.textDim,
        wordWrap: { width: RIGHT.w - 32 },
      })
      .setOrigin(0, 0.5);
    this.message = this.add
      .text(RIGHT.x + 16, RIGHT.y + RIGHT.h - 20, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: COLORS.textAccent,
      })
      .setOrigin(0, 0.5);
    this.showRoot('いらっしゃい！');
    if (window.__starfall) window.__starfall.scene = SceneKey.Shop;
  }

  override update(_time: number, delta: number): void {
    this.state.save.playTimeSec += delta / 1000;
    switch (this.mode) {
      case 'root':
        this.rootMenu.update(this.input2);
        return;
      case 'buy':
      case 'sell':
        if (this.input2.justPressed('right')) this.flipPage(1);
        else if (this.input2.justPressed('left')) this.flipPage(-1);
        else {
          this.listMenu?.update(this.input2);
          this.refreshDescription();
        }
        return;
      case 'qty':
        this.updateQty();
        return;
      case 'confirm':
        this.confirmMenu?.update(this.input2);
        return;
      default:
        return;
    }
  }

  // ---- probes for e2e ----------------------------------------------------------

  get currentMode(): Mode {
    return this.mode;
  }

  get activeList(): ListMenu | undefined {
    return this.listMenu;
  }

  get quantity(): number {
    return this.qty;
  }

  // ---- screens -----------------------------------------------------------------

  private showRoot(greeting?: string): void {
    this.setMode('root');
    this.header.setText(greeting ?? '');
    this.description.setText('');
    this.refreshGold();
  }

  private showList(dealing: 'buy' | 'sell', keepPage = false): void {
    this.dealing = dealing;
    this.rows =
      dealing === 'buy'
        ? shopStock(getShop(this.shopId), this.state.flags, LOOKUP).map((m) => ({
            ...m,
            qty: this.state.inventory.count(m.id),
            unitPrice: m.price,
          }))
        : sellableEntries(this.state.inventory, LOOKUP).map((e) => ({
            ...e,
            unitPrice: e.sellPrice,
          }));
    if (!keepPage) this.page = 0;
    this.setMode(dealing);
    this.renderList();
  }

  private renderList(): void {
    const pages = Math.max(1, Math.ceil(this.rows.length / PAGE_SIZE));
    this.page = ((this.page % pages) + pages) % pages;
    const slice = this.rows.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const title = this.dealing === 'buy' ? 'なにを 買う？' : 'なにを 売る？';
    const paging = pages > 1 ? `   ◀ ${this.page + 1}/${pages} ▶` : '';
    this.header.setText(
      `${title}${paging}${this.rows.length === 0 ? '\n（売れるものがない）' : ''}`,
    );
    this.refreshGold();
    this.listMenu?.destroy();
    const items: ListMenuItem[] = slice.map((r) => ({
      label: `${r.name.padEnd(12, '　')} ${String(r.unitPrice).padStart(4)}G  ${
        this.dealing === 'buy' ? `持${r.qty}` : `×${r.qty}`
      }`,
      disabled: this.dealing === 'buy' && this.state.gold < r.unitPrice,
    }));
    this.listMenu = new ListMenu(this, {
      x: RIGHT.x + 16,
      y: RIGHT.y + 58,
      lineHeight: LINE,
      fontSize: 15,
      items,
      onConfirm: (index) => {
        const row = slice[index];
        if (row) this.pickQuantity(row);
      },
      onCancel: () => this.showRoot(),
    });
    this.refreshDescription();
  }

  private flipPage(delta: 1 | -1): void {
    if (this.rows.length <= PAGE_SIZE) return;
    this.page += delta;
    this.renderList();
  }

  private pickQuantity(row: Row): void {
    this.chosen = row;
    this.qty = 1;
    this.maxQty =
      this.dealing === 'buy'
        ? maxAffordable(this.state, this.state.inventory, row.id, maxQtyOf(row.id), LOOKUP)
        : row.qty;
    if (this.maxQty <= 0) {
      this.setMessage(this.dealing === 'buy' ? 'これ以上は 持てない。' : '売れるものがない。');
      return;
    }
    this.setMode('qty');
    this.renderQty();
  }

  private renderQty(): void {
    const row = this.chosen;
    if (!row) return;
    const total = row.unitPrice * this.qty;
    this.header.setText(
      `${row.name}  ${row.unitPrice}G\nいくつ ${this.dealing === 'buy' ? '買う' : '売る'}？   ◀ ${this.qty} ▶  （最大 ${this.maxQty}）\n合計 ${total}G`,
    );
  }

  private updateQty(): void {
    if (this.input2.justPressed('right')) this.qty = Math.min(this.maxQty, this.qty + 1);
    else if (this.input2.justPressed('left')) this.qty = Math.max(1, this.qty - 1);
    else if (this.input2.justPressed('up')) this.qty = Math.min(this.maxQty, this.qty + 10);
    else if (this.input2.justPressed('down')) this.qty = Math.max(1, this.qty - 10);
    else if (this.input2.justPressed('confirm')) {
      this.showConfirm();
      return;
    } else if (this.input2.justPressed('cancel')) {
      this.showList(this.dealing, true);
      return;
    }
    this.renderQty();
  }

  private showConfirm(): void {
    const row = this.chosen;
    if (!row) return;
    this.setMode('confirm');
    const total = row.unitPrice * this.qty;
    this.header.setText(
      `${row.name}を ${this.qty}こ、${total}G で ${this.dealing === 'buy' ? '買います' : '売ります'}。\nよろしいですか？`,
    );
    this.confirmMenu = new ListMenu(this, {
      x: RIGHT.x + 16,
      y: RIGHT.y + 90,
      lineHeight: LINE,
      fontSize: 16,
      items: [{ label: 'いいえ' }, { label: 'はい' }],
      onConfirm: (index) => {
        if (index === 1) this.deal();
        else {
          this.setMode('qty');
          this.renderQty();
        }
      },
      onCancel: () => {
        this.setMode('qty');
        this.renderQty();
      },
    });
  }

  private deal(): void {
    const row = this.chosen;
    if (!row) return;
    if (this.dealing === 'buy') {
      const result = buy(this.state, this.state.inventory, row.id, this.qty, LOOKUP);
      this.setMessage(
        result === 'ok'
          ? 'まいどあり！'
          : result === 'no_gold'
            ? 'お金が 足りない。'
            : 'これ以上は 持てない。',
      );
    } else {
      const result = sell(this.state, this.state.inventory, row.id, this.qty, LOOKUP);
      this.setMessage(result === 'ok' ? 'ありがとう、買い取ったよ。' : '売れないものだ。');
    }
    this.showList(this.dealing, true);
  }

  private close(): void {
    this.setMode('done');
    this.scene.resume(SceneKey.World);
    this.scene.stop();
  }

  // ---- helpers -----------------------------------------------------------------

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.listMenu?.destroy();
    this.confirmMenu?.destroy();
    this.listMenu = undefined;
    this.confirmMenu = undefined;
    this.rootMenu.setAlpha(mode === 'root' ? 1 : 0.6);
  }

  private refreshGold(): void {
    this.goldText.setText(`所持金 ${this.state.gold}G`);
  }

  private refreshDescription(): void {
    const index = this.listMenu?.selectedIndex ?? -1;
    const row = index < 0 ? undefined : this.rows[this.page * PAGE_SIZE + index];
    this.description.setText(row?.description ?? '');
  }

  private setMessage(text: string): void {
    this.message.setText(text);
    this.time.delayedCall(2500, () => {
      if (this.message.text === text) this.message.setText('');
    });
  }
}
