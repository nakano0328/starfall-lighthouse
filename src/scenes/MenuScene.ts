import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { expToNext } from '@core/party/exp';
import type { PartyMember } from '@core/party/member';
import { memberLevel, memberStats, useItemOnMember } from '@core/party/member';
import {
  SAVE_SLOT_COUNT,
  deserialize,
  formatPlayTime,
  serialize,
  slotKey,
  slotSummary,
} from '@core/save';
import type { SettingKey, Settings } from '@core/settings';
import {
  SETTINGS_KEY,
  SETTING_KEYS,
  adjustSetting,
  parseSettings,
  serializeSettings,
  settingLabel,
} from '@core/settings';
import type { GameState } from '@core/state';
import { toSaveData } from '@core/state';
import { CHARACTERS } from '@data/characters';
import { findItem } from '@data/items';
import { getMapMeta } from '@data/maps';
import { MIGRATION_CONTEXT, placeName } from '@data/saveContext';
import { levelFromExp } from '@core/party/exp';
import type { ItemDef } from '@data/types';
import { InputBindings } from '@ui/InputBindings';
import type { ListMenuItem } from '@ui/ListMenu';
import { ListMenu } from '@ui/ListMenu';
import { Window } from '@ui/Window';

import { SceneKey } from './keys';

export interface MenuSceneData {
  state: GameState;
  /** Towns/interiors allow saving anywhere; elsewhere only at a save point. */
  canSave: boolean;
  /** Open straight on a tab (save points open the save list). */
  startMode?: 'save';
}

/** Layout: command column on the left, content panel on the right (GAME_DESIGN §11.2). */
const LEFT = { x: 16, y: 16, w: 160, h: GAME_HEIGHT - 32 } as const;
const RIGHT = { x: 184, y: 16, w: GAME_WIDTH - 184 - 16, h: GAME_HEIGHT - 32 } as const;
const LINE = 26;
/** Save slot rows: a 16px slot name with two 12px detail lines (§11.1 補足) underneath. */
const SLOT_LINE = 52;
const SLOT_DETAIL = { x: 40, dy: 10, fontSize: 12 } as const;
/** Settings: values are a second text at a fixed column so mixed-width labels line up. */
const SETTINGS_VALUE_X = 136;

type Mode =
  | 'root'
  | 'status'
  | 'status_detail'
  | 'items'
  | 'item_action'
  | 'item_target'
  | 'equip'
  | 'equip_slots'
  | 'save'
  | 'save_confirm'
  | 'settings'
  | 'title_confirm';

const ITEM_TABS = [
  { label: '回復', categories: ['heal', 'cure', 'field'] },
  { label: '攻撃', categories: ['attack'] },
  { label: 'だいじなもの', categories: ['key'] },
] as const;

const SETTING_LABELS: Record<SettingKey, string> = {
  textSpeed: '文字速度',
  bgmVolume: 'BGM 音量',
  seVolume: 'SE 音量',
  battleSpeed: 'バトル速度',
  showControls: '操作ガイド',
};

/**
 * Pause menu overlay (ステータス／アイテム／装備／セーブ／設定／とじる). Runs on top of
 * the paused WorldScene; closing resumes it. Equipment lists arrive with the
 * equipment data (Phase 3); loading saves arrives with #10.
 */
export class MenuScene extends Phaser.Scene {
  private state!: GameState;
  private canSave = false;
  private input2!: InputBindings;
  private settings!: Settings;
  private mode: Mode = 'root';
  private rootMenu!: ListMenu;
  private panel!: Phaser.GameObjects.Container;
  private panelText!: Phaser.GameObjects.Text;
  private panelValueText!: Phaser.GameObjects.Text;
  private panelMenu: ListMenu | undefined;
  private subMenu: ListMenu | undefined;
  /** Detail lines under each save slot row; destroyed with the slot list. */
  private slotDetails: Phaser.GameObjects.Text[] = [];
  private message!: Phaser.GameObjects.Text;
  private tabIndex = 0;
  private memberIndex = 0;
  private selectedItem: ItemDef | undefined;
  private selectedSlot = 0;
  private settingIndex = 0;

  constructor() {
    super(SceneKey.Menu);
  }

  private startMode: 'save' | undefined;

  init(data: MenuSceneData): void {
    this.state = data.state;
    this.canSave = data.canSave;
    this.startMode = data.startMode;
    this.mode = 'root';
    this.tabIndex = 0;
    this.memberIndex = 0;
    this.selectedItem = undefined;
    this.selectedSlot = 0;
    this.settingIndex = 0;
  }

  create(): void {
    this.settings = parseSettings(readStorage(SETTINGS_KEY));
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setOrigin(0);
    new Window(this, LEFT.x, LEFT.y, LEFT.w, LEFT.h);
    new Window(this, RIGHT.x, RIGHT.y, RIGHT.w, RIGHT.h);

    this.rootMenu = new ListMenu(this, {
      x: LEFT.x + 8,
      y: LEFT.y + 24,
      lineHeight: 30,
      items: [
        { label: 'ステータス' },
        { label: 'アイテム' },
        { label: '装備' },
        // Greyed outside towns/save points (§11.2); the explanation sits in the right panel.
        { label: 'セーブ', disabled: !this.canSave },
        { label: '設定' },
        { label: 'とじる' },
      ],
      onConfirm: (index) => this.onRootConfirm(index),
      onCancel: () => this.close(),
    });

    this.panel = this.add.container(RIGHT.x, RIGHT.y);
    this.panelText = this.add.text(16, 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: COLORS.textMain,
      lineSpacing: 6,
      wordWrap: { width: RIGHT.w - 32 },
    });
    this.panel.add(this.panelText);
    this.panelValueText = this.add.text(SETTINGS_VALUE_X, 14, '', {
      fontFamily: 'sans-serif',
      fontSize: '14px',
      color: COLORS.textMain,
      lineSpacing: 6,
    });
    this.panel.add(this.panelValueText);
    this.slotDetails = [];
    this.message = this.add
      .text(RIGHT.x + 16, RIGHT.y + RIGHT.h - 24, '', {
        fontFamily: 'sans-serif',
        fontSize: '13px',
        color: COLORS.textAccent,
      })
      .setOrigin(0, 0.5);

    if (this.startMode === 'save') {
      this.rootMenu.setSelected(3);
      this.showSave();
    } else {
      this.showRoot();
    }
  }

  override update(_time: number, delta: number): void {
    this.state.save.playTimeSec += delta / 1000;
    switch (this.mode) {
      case 'root':
        this.rootMenu.update(this.input2);
        return;
      case 'items':
        if (this.input2.justPressed('left')) this.switchTab(-1);
        else if (this.input2.justPressed('right')) this.switchTab(1);
        else this.panelMenu?.update(this.input2);
        return;
      case 'settings':
        this.updateSettings();
        return;
      default:
        (this.subMenu ?? this.panelMenu)?.update(this.input2);
    }
  }

  // ---- probes for e2e --------------------------------------------------------

  get currentMode(): Mode {
    return this.mode;
  }

  // ---- root -----------------------------------------------------------------

  private onRootConfirm(index: number): void {
    switch (index) {
      case 0:
        return this.showStatusList();
      case 1:
        return this.showItems();
      case 2:
        return this.showEquipList();
      case 3:
        return this.showSave();
      case 4:
        return this.showSettings();
      default:
        return this.close();
    }
  }

  private showRoot(): void {
    this.setMode('root');
    this.panelText.setText(this.partySummary());
  }

  private partySummary(): string {
    const lines = this.state.party.map((m) => {
      const def = CHARACTERS[m.id];
      const max = memberStats(def, m);
      const ko = m.ko ? '（戦闘不能）' : '';
      return `${def.name}  Lv ${memberLevel(m)}${ko}\n  HP ${m.hp} / ${max.hp}   MP ${m.mp} / ${max.mp}`;
    });
    const meta = getMapMeta(this.state.save.location.map);
    lines.push('');
    lines.push(
      `所持金 ${this.state.gold} G   プレイ時間 ${formatPlayTime(this.state.save.playTimeSec)}`,
    );
    lines.push(`現在地 ${meta.displayName}`);
    if (!this.canSave) lines.push('', '※ ここではセーブできない。星の祠で記録できる。');
    return lines.join('\n');
  }

  private close(): void {
    writeStorage(SETTINGS_KEY, serializeSettings(this.settings));
    this.scene.resume(SceneKey.World);
    this.scene.stop();
  }

  // ---- status ---------------------------------------------------------------

  private showStatusList(): void {
    this.setMode('status');
    this.panelText.setText('だれの ステータスを見る？');
    this.panelMenu = this.makePanelMenu(
      this.state.party.map((m) => ({ label: CHARACTERS[m.id].name })),
      (index) => {
        this.memberIndex = index;
        this.showStatusDetail();
      },
      () => this.showRoot(),
    );
  }

  private showStatusDetail(): void {
    this.setMode('status_detail');
    const m = this.state.party[this.memberIndex];
    if (!m) return this.showRoot();
    const def = CHARACTERS[m.id];
    const level = memberLevel(m);
    const s = memberStats(def, m);
    const skills = def.skills.filter((sk) => sk.level <= level).map((sk) => sk.skillId);
    this.panelText.setText(
      [
        `${def.name}   Lv ${level}   次のレベルまで ${expToNext(m.exp)}`,
        `HP ${m.hp} / ${s.hp}   MP ${m.mp} / ${s.mp}`,
        `攻撃 ${s.atk}   防御 ${s.def}   素早さ ${s.spd}   運 ${s.luk}`,
        '',
        `武器 ${equipName(m.equipment.weapon)}   防具 ${equipName(m.equipment.armor)}   アクセサリ ${equipName(m.equipment.accessory)}`,
        '',
        `習得スキル: ${skills.length > 0 ? skills.join('、') : 'なし'}`,
        '',
        'X で もどる',
      ].join('\n'),
    );
    this.subMenu = this.makePanelMenu(
      [],
      () => undefined,
      () => this.showStatusList(),
    );
  }

  // ---- items ----------------------------------------------------------------

  private showItems(): void {
    this.setMode('items');
    this.renderItemList();
  }

  private switchTab(delta: 1 | -1): void {
    this.tabIndex = (this.tabIndex + delta + ITEM_TABS.length) % ITEM_TABS.length;
    this.renderItemList();
  }

  private currentItems(): { item: ItemDef; qty: number }[] {
    const tab = ITEM_TABS[this.tabIndex];
    if (!tab) return [];
    const cats: readonly string[] = tab.categories;
    return this.state.inventory
      .entries()
      .map((e) => ({ item: findItem(e.itemId), qty: e.qty }))
      .filter(
        (e): e is { item: ItemDef; qty: number } =>
          e.item !== undefined && cats.includes(e.item.category),
      );
  }

  private renderItemList(): void {
    const tabs = ITEM_TABS.map((t, i) =>
      i === this.tabIndex ? `[${t.label}]` : ` ${t.label} `,
    ).join('  ');
    const items = this.currentItems();
    this.panelText.setText(
      `${tabs}\n← → でタブ切替${items.length === 0 ? '\n\n（なにも持っていない）' : ''}`,
    );
    this.panelMenu?.destroy();
    this.panelMenu = new ListMenu(this, {
      x: RIGHT.x + 16,
      y: RIGHT.y + 70,
      lineHeight: LINE,
      fontSize: 16,
      items: items.map((e) => ({ label: `${e.item.name}  ×${e.qty}` })),
      onConfirm: (index) => {
        const entry = items[index];
        if (!entry) return;
        this.selectedItem = entry.item;
        this.showItemAction();
      },
      onCancel: () => this.showRoot(),
    });
  }

  private showItemAction(): void {
    const item = this.selectedItem;
    if (!item) return this.showItems();
    this.setMode('item_action');
    this.panelText.setText(`${item.name}\n${item.description}`);
    const keyItem = item.category === 'key';
    this.subMenu = this.makePanelMenu(
      [
        { label: 'つかう', disabled: !item.usableInField },
        { label: 'すてる', disabled: keyItem },
        { label: 'やめる' },
      ],
      (index) => {
        if (index === 0) {
          // Party-wide consumables (§7.1 味方全体) skip the target pick.
          if (item.scope === 'ally_all') this.useItemOnAll();
          else this.showItemTarget();
        } else if (index === 1) this.dropItem();
        else this.showItems();
      },
      () => this.showItems(),
    );
  }

  private showItemTarget(): void {
    this.setMode('item_target');
    this.panelText.setText(`${this.selectedItem?.name ?? ''} を だれに？`);
    this.subMenu = this.makePanelMenu(
      this.state.party.map((m) => ({ label: `${CHARACTERS[m.id].name}  HP ${m.hp}` })),
      (index) => this.useItem(index),
      () => this.showItemAction(),
    );
  }

  private useItem(memberIndex: number): void {
    const item = this.selectedItem;
    const member: PartyMember | undefined = this.state.party[memberIndex];
    if (!item || !member) return this.showItems();
    const result = useItemOnMember(item, CHARACTERS[member.id], member);
    if (result.ok) {
      this.state.inventory.remove(item.id, 1);
      this.setMessage(result.message);
    } else {
      this.setMessage(
        result.reason === 'no_effect' ? 'なにも起こらなかった。' : 'ここでは使えない。',
      );
    }
    this.showItems();
  }

  /** Applies an `ally_all` item to every member; consumed when at least one benefited. */
  private useItemOnAll(): void {
    const item = this.selectedItem;
    if (!item) return this.showItems();
    const messages: string[] = [];
    let unusable = false;
    for (const member of this.state.party) {
      const result = useItemOnMember(item, CHARACTERS[member.id], member);
      if (result.ok) messages.push(result.message);
      else if (result.reason === 'not_usable') unusable = true;
    }
    const [single] = messages;
    if (messages.length > 0) {
      this.state.inventory.remove(item.id, 1);
      this.setMessage(messages.length === 1 && single ? single : partyUseMessage(item));
    } else {
      this.setMessage(unusable ? 'ここでは使えない。' : 'なにも起こらなかった。');
    }
    this.showItems();
  }

  private dropItem(): void {
    const item = this.selectedItem;
    if (!item) return this.showItems();
    this.state.inventory.remove(item.id, 1);
    this.setMessage(`${item.name}を すてた。`);
    this.showItems();
  }

  // ---- equipment (frame only) -------------------------------------------------

  private showEquipList(): void {
    this.setMode('equip');
    this.panelText.setText('だれの 装備を見る？');
    this.panelMenu = this.makePanelMenu(
      this.state.party.map((m) => ({ label: CHARACTERS[m.id].name })),
      (index) => {
        this.memberIndex = index;
        this.showEquipSlots();
      },
      () => this.showRoot(),
    );
  }

  private showEquipSlots(): void {
    this.setMode('equip_slots');
    const m = this.state.party[this.memberIndex];
    if (!m) return this.showRoot();
    this.panelText.setText(
      `${CHARACTERS[m.id].name} の装備\n（装備の変更は 装備品データの追加後に対応）`,
    );
    this.subMenu = this.makePanelMenu(
      [
        { label: `武器        ${equipName(m.equipment.weapon)}`, disabled: true },
        { label: `防具        ${equipName(m.equipment.armor)}`, disabled: true },
        { label: `アクセサリ  ${equipName(m.equipment.accessory)}`, disabled: true },
      ],
      () => undefined,
      () => this.showEquipList(),
    );
  }

  // ---- save -----------------------------------------------------------------

  private showSave(): void {
    if (!this.canSave) {
      this.setMessage('ここではセーブできない。星の祠で記録できる。');
      return;
    }
    this.setMode('save');
    this.panelText.setText('どこに 記録する？');
    const rows = this.slotRows();
    const menu = this.makePanelMenu(
      rows.map((row) => ({ label: row.label })),
      (index) => {
        // Every save goes through a confirmation (§11.4), empty slots included.
        this.selectedSlot = index;
        this.showSaveConfirm();
      },
      () => this.showRoot(),
      SLOT_LINE,
    );
    this.panelMenu = menu;
    rows.forEach((row, i) => {
      if (row.detail === undefined) return;
      this.slotDetails.push(
        this.add.text(
          RIGHT.x + SLOT_DETAIL.x,
          menu.y + i * SLOT_LINE + SLOT_DETAIL.dy,
          row.detail,
          {
            fontFamily: 'sans-serif',
            fontSize: `${SLOT_DETAIL.fontSize}px`,
            color: COLORS.textDim,
            wordWrap: { width: RIGHT.w - SLOT_DETAIL.x - 16 },
          },
        ),
      );
    });
  }

  /**
   * Slot name for the list plus the §11.2 summary (章名・場所・Lv・プレイ時間・保存日時)
   * as two detail lines; one 16px line cannot hold all of it inside the panel.
   */
  private slotRows(): { label: string; detail?: string }[] {
    const rows: { label: string; detail?: string }[] = [];
    for (let slot = 0; slot < SAVE_SLOT_COUNT; slot += 1) {
      const raw = readStorage(slotKey(slot));
      const data = raw === null ? null : deserialize(raw, MIGRATION_CONTEXT);
      if (!data) {
        rows.push({ label: `スロット ${slot + 1}   ----` });
        continue;
      }
      const s = slotSummary(data, placeName);
      const leader = CHARACTERS[s.leaderId].name;
      rows.push({
        label: `スロット ${slot + 1}`,
        detail: [
          `${s.chapter}  ${s.place}`,
          `${leader} Lv${levelFromExp(s.leaderExp)}  ${s.playTime}  ${formatSavedAt(s.savedAt)}`,
        ].join('\n'),
      });
    }
    return rows;
  }

  private showSaveConfirm(): void {
    this.setMode('save_confirm');
    const occupied = readStorage(slotKey(this.selectedSlot)) !== null;
    this.panelText.setText(
      `スロット ${this.selectedSlot + 1} に ${occupied ? '上書き' : '記録'}しますか？`,
    );
    this.subMenu = this.makePanelMenu(
      [{ label: 'はい' }, { label: 'いいえ' }],
      (index) => (index === 0 ? this.writeSave(this.selectedSlot) : this.showSave()),
      () => this.showSave(),
    );
  }

  private writeSave(slot: number): void {
    const data = toSaveData(this.state, Date.now());
    const ok = writeStorage(slotKey(slot), serialize(data));
    this.setMessage(ok ? `スロット ${slot + 1} に 記録した。` : '記録に 失敗した。');
    this.showSave();
  }

  // ---- settings ---------------------------------------------------------------

  private showSettings(): void {
    this.setMode('settings');
    this.settingIndex = 0;
    this.renderSettings();
  }

  private renderSettings(): void {
    // Labels and values are separate texts: padding by character count cannot
    // align 'BGM 音量' (half-width letters) with the all-CJK labels.
    const labels = SETTING_KEYS.map((key, i) => {
      const cursor = i === this.settingIndex ? '▶' : '　';
      return `${cursor} ${SETTING_LABELS[key]}`;
    });
    const values = SETTING_KEYS.map((key) => `◀ ${settingLabel(this.settings, key)} ▶`);
    const back = SETTING_KEYS.length;
    labels.push(
      `${this.settingIndex === back ? '▶' : '　'} タイトルへ戻る`,
      '',
      '← → で変更   X で もどる',
    );
    values.push('', '', '');
    this.panelText.setText(labels.join('\n'));
    this.panelValueText.setText(values.join('\n'));
  }

  private updateSettings(): void {
    const rowCount = SETTING_KEYS.length + 1;
    if (this.input2.justPressed('down')) {
      this.settingIndex = (this.settingIndex + 1) % rowCount;
      this.renderSettings();
    } else if (this.input2.justPressed('up')) {
      this.settingIndex = (this.settingIndex - 1 + rowCount) % rowCount;
      this.renderSettings();
    } else if (this.input2.justPressed('left') || this.input2.justPressed('right')) {
      const key = SETTING_KEYS[this.settingIndex];
      if (key) {
        this.settings = adjustSetting(this.settings, key, this.input2.isDown('left') ? -1 : 1);
        this.renderSettings();
      }
    } else if (this.input2.justPressed('confirm')) {
      if (this.settingIndex === SETTING_KEYS.length) this.showTitleConfirm();
    } else if (this.input2.justPressed('cancel')) {
      writeStorage(SETTINGS_KEY, serializeSettings(this.settings));
      this.showRoot();
    }
  }

  private showTitleConfirm(): void {
    this.setMode('title_confirm');
    this.panelText.setText('タイトルに戻りますか？\n（記録していない進行は失われます）');
    this.subMenu = this.makePanelMenu(
      [{ label: 'いいえ' }, { label: 'はい' }],
      (index) => {
        if (index === 1) {
          writeStorage(SETTINGS_KEY, serializeSettings(this.settings));
          this.scene.stop(SceneKey.World);
          this.scene.start(SceneKey.Title);
        } else this.showSettings();
      },
      () => this.showSettings(),
    );
  }

  // ---- helpers ------------------------------------------------------------------

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.panelMenu?.destroy();
    this.subMenu?.destroy();
    this.panelMenu = undefined;
    this.subMenu = undefined;
    this.slotDetails.forEach((text) => text.destroy());
    this.slotDetails = [];
    this.panelValueText.setText('');
    if (mode === 'root') this.panelText.setText('');
    this.rootMenu.setAlpha(mode === 'root' ? 1 : 0.6);
  }

  /** List placed under the header text (measured, so wrapped headers never overlap it). */
  private makePanelMenu(
    items: ListMenuItem[],
    onConfirm: (index: number) => void,
    onCancel: () => void,
    lineHeight = LINE,
  ): ListMenu {
    const headerBottom = RIGHT.y + this.panelText.y + this.panelText.height;
    return new ListMenu(this, {
      x: RIGHT.x + 16,
      y: headerBottom + LINE,
      lineHeight,
      fontSize: 16,
      items,
      onConfirm,
      onCancel,
    });
  }

  private setMessage(text: string): void {
    this.message.setText(text);
    this.time.delayedCall(2500, () => {
      if (this.message.text === text) this.message.setText('');
    });
  }
}

function equipName(id: string | null): string {
  return id === null ? 'なし' : id;
}

/** `YYYY/MM/DD HH:mm` in local time for the slot list (§11.2 保存日時). */
function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** One-line summary for an `ally_all` item when several members benefited. */
function partyUseMessage(item: ItemDef): string {
  switch (item.effect.type) {
    case 'heal_hp':
      return 'みんなの HP が 回復した。';
    case 'heal_mp':
      return 'みんなの MP が 回復した。';
    case 'cure':
      return 'みんなの 状態異常が 治った。';
    case 'revive':
      return 'みんなが 目を覚ました！';
    default:
      return `${item.name}を つかった。`;
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
