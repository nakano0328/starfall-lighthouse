import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '@/config';
import { createEnemyBattler, createPartyBattler } from '@core/battle/battlers';
import { BattleEngine } from '@core/battle/engine';
import { applyRewards, computeRewards, syncPartyAfterBattle } from '@core/battle/rewards';
import { mathRng, seededRng } from '@core/battle/rng';
import type { Rng } from '@core/battle/rng';
import { hasStatus } from '@core/battle/status';
import { battleEventLines, resultLines } from '@core/battle/text';
import type { BattleEvent, Battler, Command, RoundInput } from '@core/battle/types';
import { STATUS_NAMES } from '@core/battle/types';
import type { Settings } from '@core/settings';
import { SETTINGS_KEY, parseSettings } from '@core/settings';
import type { GameState } from '@core/state';
import { CHARACTERS, getCharacter } from '@data/characters';
import { getEncounter } from '@data/encounters';
import { getEnemy } from '@data/enemies';
import { findEquip } from '@data/equipment';
import { findItem, getItem } from '@data/items';
import { getSkill } from '@data/skills';
import type { ItemDef, SkillDef, TargetScope } from '@data/types';
import { InputBindings } from '@ui/InputBindings';
import type { ListMenuItem } from '@ui/ListMenu';
import { ListMenu } from '@ui/ListMenu';
import { Window } from '@ui/Window';

import { SceneKey } from './keys';

export type BattleResult = 'win' | 'lose' | 'escape';

export interface BattleSceneData {
  state: GameState;
  groupId: string;
  /** Enemies skip their first round (§5.12 先制攻撃). */
  preemptive?: boolean;
  /** Deterministic rng for tests; Math.random otherwise. */
  seed?: number;
  /** Called once with the result after the scene has stopped itself. */
  onEnd: (result: BattleResult) => void;
}

/** Window layout from docs/GAME_DESIGN.md §11.3. */
const LAYOUT = {
  message: { x: 16, y: 16, w: 608, h: 40 },
  enemyTop: 56,
  enemyBottom: 264,
  command: { x: 16, y: 160, w: 160, h: 100 },
  sub: { x: 184, y: 160, w: 440, h: 100 },
  status: { x: 16, y: 264, w: 608, h: 80 },
} as const;

/** Message hold per line; halved by the バトル速度 setting (§5.13), quartered while Z is held. */
const LINE_MS = 650;
const POP_MS = 600;
const SUB_PAGE_SIZE = 4;
const DEPTH = { bg: 0, enemies: 10, windows: 20, text: 30, popup: 40 } as const;

type Phase = 'intro' | 'command' | 'sub' | 'target' | 'resolve' | 'result' | 'done';

interface SubItem extends ListMenuItem {
  kind: 'skill' | 'item';
  id: string;
  scope: TargetScope;
  description: string;
  revive: boolean;
}

interface EnemySprite {
  battler: Battler;
  image: Phaser.GameObjects.Image;
  marker: Phaser.GameObjects.Text;
}

interface StatusRow {
  name: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  mpText: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
}

/**
 * Turn-based battle screen (docs/GAME_DESIGN.md §5, §11.3). Runs on top of the
 * paused WorldScene; collects one command per member, hands the round to the
 * pure BattleEngine and animates the events it returns. The party is drawn only
 * as a status window (first-person view).
 */
export class BattleScene extends Phaser.Scene {
  private data2!: BattleSceneData;
  private state!: GameState;
  private engine!: BattleEngine;
  private rng!: Rng;
  private input2!: InputBindings;
  private settings!: Settings;
  private phase: Phase = 'intro';
  private enemySprites: EnemySprite[] = [];
  private rows: StatusRow[] = [];
  private messageText!: Phaser.GameObjects.Text;
  private actorLabel!: Phaser.GameObjects.Text;
  private commandWindow!: Window;
  private commandMenu: ListMenu | undefined;
  private subWindow!: Window;
  private subMenu: ListMenu | undefined;
  private subItems: SubItem[] = [];
  private subPage = 0;
  private subPageText!: Phaser.GameObjects.Text;
  private subDescription!: Phaser.GameObjects.Text;
  private subKind: 'skill' | 'item' = 'skill';
  private pendingSub: SubItem | undefined;
  private targetKeys: string[] = [];
  private targetIndex = 0;
  private targetBlink: Phaser.Tweens.Tween | undefined;
  private inputOrder: Battler[] = [];
  private inputIndex = 0;
  private commands: Record<string, Command> = {};
  private skipHeld = false;
  private waitResolve: (() => void) | undefined;
  private readonly logLines: string[] = [];
  private finished = false;

  constructor() {
    super(SceneKey.Battle);
  }

  init(data: BattleSceneData): void {
    this.data2 = data;
    this.state = data.state;
    this.phase = 'intro';
    this.enemySprites = [];
    this.rows = [];
    this.subItems = [];
    this.subPage = 0;
    this.pendingSub = undefined;
    this.targetKeys = [];
    this.targetIndex = 0;
    this.inputOrder = [];
    this.inputIndex = 0;
    this.commands = {};
    this.skipHeld = false;
    this.waitResolve = undefined;
    this.logLines.length = 0;
    this.finished = false;
    this.rng = data.seed === undefined ? mathRng : seededRng(data.seed);
  }

  create(): void {
    this.settings = parseSettings(readStorage(SETTINGS_KEY));
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input2.destroy();
      this.targetBlink?.stop();
    });

    const group = getEncounter(this.data2.groupId);
    const party = this.state.party.map((m, i) =>
      createPartyBattler(i, CHARACTERS[m.id], m, findEquip),
    );
    const enemies: Battler[] = [];
    for (const { enemyId, count } of group.enemies) {
      for (let i = 0; i < count; i += 1) {
        enemies.push(createEnemyBattler(enemies.length, getEnemy(enemyId)));
      }
    }
    this.engine = new BattleEngine({
      party,
      enemies,
      group,
      rng: this.rng,
      data: { skill: getSkill, item: findItem },
      inventory: this.state.inventory,
      ...(this.data2.preemptive ? { preemptive: true } : {}),
    });

    this.add.image(0, 0, group.battleBgKey).setOrigin(0).setDepth(DEPTH.bg);
    this.spawnEnemySprites();
    this.buildWindows();
    this.refreshStatus();
    if (window.__starfall) window.__starfall.scene = SceneKey.Battle;

    void this.intro();
  }

  override update(): void {
    if (this.finished) return;
    if (this.input2.isDown('confirm')) this.skipHeld = true;
    switch (this.phase) {
      case 'command':
        this.commandMenu?.update(this.input2);
        break;
      case 'sub':
        if (this.input2.justPressed('right')) this.flipSubPage(1);
        else if (this.input2.justPressed('left')) this.flipSubPage(-1);
        else this.subMenu?.update(this.input2);
        break;
      case 'target':
        this.updateTargetInput();
        break;
      case 'resolve':
      case 'result':
        if (this.input2.justPressed('confirm')) this.waitResolve?.();
        break;
      default:
        this.input2.flush();
    }
  }

  // ---- probes for e2e / debugging -------------------------------------------

  get phaseName(): Phase {
    return this.phase;
  }

  get round(): number {
    return this.engine.round;
  }

  get outcome(): string {
    return this.engine.outcome;
  }

  get log(): readonly string[] {
    return this.logLines;
  }

  get enemyHp(): number[] {
    return this.engine.enemies.map((e) => e.hp);
  }

  get activeMenu(): ListMenu | undefined {
    return this.phase === 'command' ? this.commandMenu : this.subMenu;
  }

  // ---- setup ----------------------------------------------------------------

  private spawnEnemySprites(): void {
    const enemies = this.engine.enemies;
    const centreY = (LAYOUT.enemyTop + LAYOUT.enemyBottom) / 2;
    enemies.forEach((battler, i) => {
      const def = getEnemy(battler.id);
      const x = (GAME_WIDTH * (i + 1)) / (enemies.length + 1);
      const image = this.add.image(x, centreY, def.imageKey).setDepth(DEPTH.enemies);
      // The final form is drawn from y 8 to y 264 (§11.3); others sit at the area's centre.
      if (image.height > LAYOUT.enemyBottom - LAYOUT.enemyTop) {
        image.setOrigin(0.5, 1).setY(LAYOUT.enemyBottom);
      }
      const marker = this.add
        .text(x, image.getTopLeft().y - 4, '▼', {
          fontFamily: 'sans-serif',
          fontSize: '14px',
          color: COLORS.textAccent,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.text)
        .setVisible(false);
      this.enemySprites.push({ battler, image, marker });
    });
  }

  private buildWindows(): void {
    const m = LAYOUT.message;
    new Window(this, m.x, m.y, m.w, m.h).setDepth(DEPTH.windows);
    this.messageText = this.add
      .text(m.x + 12, m.y + m.h / 2, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: COLORS.textMain,
      })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.text);

    const c = LAYOUT.command;
    this.commandWindow = new Window(this, c.x, c.y, c.w, c.h).setDepth(DEPTH.windows);
    this.actorLabel = this.add
      .text(c.x + c.w / 2, c.y - 2, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textAccent,
        backgroundColor: '#12264a',
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.text);
    this.commandWindow.setVisible(false);
    this.actorLabel.setVisible(false);

    const s = LAYOUT.sub;
    this.subWindow = new Window(this, s.x, s.y, s.w, s.h).setDepth(DEPTH.windows);
    this.subPageText = this.add
      .text(s.x + s.w - 10, s.y + 6, '', {
        fontFamily: 'sans-serif',
        fontSize: '11px',
        color: COLORS.textDim,
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.text);
    this.subDescription = this.add
      .text(s.x + 12, s.y + s.h - 8, '', {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setOrigin(0, 1)
      .setDepth(DEPTH.text);
    this.hideSub();

    const st = LAYOUT.status;
    new Window(this, st.x, st.y, st.w, st.h).setDepth(DEPTH.windows);
    const colW = st.w / 3;
    this.engine.party.forEach((_b, i) => {
      const x = st.x + 12 + i * colW;
      const y = st.y + 10;
      const name = this.add
        .text(x, y, '', { fontFamily: 'sans-serif', fontSize: '14px', color: COLORS.textMain })
        .setDepth(DEPTH.text);
      this.add
        .rectangle(x, y + 24, 120, 8, 0x1b1b2a, 1)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.text);
      const hpBar = this.add
        .rectangle(x, y + 24, 120, 8, 0x5ad46a, 1)
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.text + 1);
      const hpText = this.add
        .text(x + 126, y + 24, '', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: COLORS.textMain,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.text);
      const mpText = this.add
        .text(x, y + 42, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COLORS.textDim })
        .setDepth(DEPTH.text);
      const statusText = this.add
        .text(x + 80, y + 42, '', {
          fontFamily: 'sans-serif',
          fontSize: '12px',
          color: COLORS.textAccent,
        })
        .setDepth(DEPTH.text);
      this.rows.push({ name, hpBar, hpText, mpText, statusText });
    });
  }

  private refreshStatus(): void {
    this.engine.party.forEach((b, i) => {
      const row = this.rows[i];
      if (!row) return;
      const ratio = b.stats.hp > 0 ? b.hp / b.stats.hp : 0;
      row.name.setText(b.name).setColor(b.ko ? COLORS.textDim : COLORS.textMain);
      row.hpBar.width = Math.max(0, Math.round(120 * ratio));
      row.hpBar.setFillStyle(ratio <= 0.25 ? 0xff7a6b : ratio <= 0.5 ? 0xffe9a3 : 0x5ad46a, 1);
      row.hpText.setText(`${b.hp}/${b.stats.hp}`);
      row.hpText.setColor(ratio <= 0.25 ? COLORS.textDanger : COLORS.textMain);
      row.mpText.setText(`MP ${b.mp}/${b.stats.mp}`);
      row.statusText.setText(statusBadges(b));
    });
    for (const es of this.enemySprites) {
      if (
        es.battler.ko &&
        es.image.visible &&
        es.image.alpha === 1 &&
        !this.tweens.isTweening(es.image)
      ) {
        es.image.setVisible(false);
      }
    }
  }

  // ---- intro / command phase ----------------------------------------------------

  private async intro(): Promise<void> {
    const names = [...new Set(this.engine.enemies.map((e) => e.name))];
    await this.say(`${names.join('と ')}が あらわれた！`);
    if (this.engine.isPreemptive) await this.say('先制攻撃の チャンス！');
    this.beginRound();
  }

  private beginRound(): void {
    this.inputOrder = this.engine.commandableParty;
    this.inputIndex = 0;
    this.commands = {};
    if (this.inputOrder.length === 0) {
      void this.resolve({ kind: 'commands', commands: {} });
      return;
    }
    this.showCommandMenu();
  }

  private get currentActor(): Battler | undefined {
    return this.inputOrder[this.inputIndex];
  }

  private showCommandMenu(): void {
    const actor = this.currentActor;
    if (!actor) {
      void this.resolve({ kind: 'commands', commands: this.commands });
      return;
    }
    this.phase = 'command';
    this.hideSub();
    this.clearTarget();
    this.commandMenu?.destroy();
    this.commandWindow.setVisible(true);
    this.actorLabel.setText(` ${actor.name} `).setVisible(true);
    const escapeOk = this.engine.canEscape;
    this.commandMenu = new ListMenu(this, {
      x: LAYOUT.command.x + 8,
      y: LAYOUT.command.y + 16,
      lineHeight: 17,
      fontSize: 14,
      items: [
        { label: 'たたかう' },
        { label: 'スキル', disabled: actor.skills.length === 0 },
        { label: 'アイテム', disabled: this.engine.battleItems().length === 0 },
        { label: '防御' },
        { label: '逃げる', disabled: !escapeOk, ...(escapeOk ? {} : { note: '×' }) },
      ],
      onConfirm: (index) => this.onCommand(index),
      onCancel: () => this.backOneMember(),
    });
    this.commandMenu.setDepth(DEPTH.text);
    this.input2.flush();
  }

  private onCommand(index: number): void {
    const actor = this.currentActor;
    if (!actor) return;
    switch (index) {
      case 0:
        this.pendingSub = undefined;
        this.beginTarget(this.liveEnemyKeys(), 'attack');
        return;
      case 1:
        this.openSub('skill', actor);
        return;
      case 2:
        this.openSub('item', actor);
        return;
      case 3:
        this.commit({ type: 'guard' });
        return;
      case 4:
        this.commandMenu?.destroy();
        this.commandMenu = undefined;
        this.commandWindow.setVisible(false);
        this.actorLabel.setVisible(false);
        void this.resolve({ kind: 'escape' });
        return;
      default:
        return;
    }
  }

  private backOneMember(): void {
    if (this.inputIndex === 0) return;
    this.inputIndex -= 1;
    const prev = this.currentActor;
    if (prev) delete this.commands[prev.key];
    this.showCommandMenu();
  }

  private commit(command: Command): void {
    const actor = this.currentActor;
    if (!actor) return;
    this.commands[actor.key] = command;
    this.inputIndex += 1;
    this.showCommandMenu();
  }

  // ---- skill / item sub list -----------------------------------------------------

  private openSub(kind: 'skill' | 'item', actor: Battler): void {
    this.subKind = kind;
    this.subItems =
      kind === 'skill'
        ? this.engine.skillsOf(actor).map((s) => skillItem(s, actor))
        : this.engine.battleItems().map(({ item, qty }) => itemEntry(item, qty));
    if (this.subItems.length === 0) return;
    this.subPage = 0;
    this.phase = 'sub';
    this.renderSubPage();
  }

  private renderSubPage(): void {
    this.subMenu?.destroy();
    const pages = Math.max(1, Math.ceil(this.subItems.length / SUB_PAGE_SIZE));
    this.subPage = ((this.subPage % pages) + pages) % pages;
    const start = this.subPage * SUB_PAGE_SIZE;
    const pageItems = this.subItems.slice(start, start + SUB_PAGE_SIZE);
    this.subWindow.setVisible(true);
    this.subPageText.setText(pages > 1 ? `${this.subPage + 1}/${pages}  ◀ ▶` : '').setVisible(true);
    this.subMenu = new ListMenu(this, {
      x: LAYOUT.sub.x + 8,
      y: LAYOUT.sub.y + 16,
      lineHeight: 17,
      fontSize: 14,
      items: pageItems,
      onConfirm: (index) => {
        const chosen = pageItems[index];
        if (chosen) this.onSubConfirm(chosen);
      },
      onCancel: () => this.showCommandMenu(),
    });
    this.subMenu.setDepth(DEPTH.text);
    this.subDescription.setText(pageItems[0]?.description ?? '').setVisible(true);
    this.input2.flush();
  }

  private flipSubPage(delta: 1 | -1): void {
    if (this.subItems.length <= SUB_PAGE_SIZE) return;
    this.subPage += delta;
    this.renderSubPage();
  }

  private hideSub(): void {
    this.subMenu?.destroy();
    this.subMenu = undefined;
    this.subWindow.setVisible(false);
    this.subPageText.setVisible(false);
    this.subDescription.setVisible(false);
  }

  private onSubConfirm(item: SubItem): void {
    this.subDescription.setText(item.description);
    this.pendingSub = item;
    switch (item.scope) {
      case 'enemy_single':
        this.beginTarget(this.liveEnemyKeys(), this.subKind);
        return;
      case 'ally_single':
        this.beginTarget(this.allyKeys(item.revive), this.subKind);
        return;
      default:
        this.commitSub(undefined);
        return;
    }
  }

  private commitSub(target: string | undefined): void {
    const item = this.pendingSub;
    if (!item) return;
    const base =
      item.kind === 'skill'
        ? { type: 'skill' as const, skillId: item.id }
        : { type: 'item' as const, itemId: item.id };
    this.commit(target === undefined ? base : { ...base, target });
  }

  // ---- target selection --------------------------------------------------------

  private liveEnemyKeys(): string[] {
    return this.engine.enemies.filter((e) => !e.ko).map((e) => e.key);
  }

  private allyKeys(ko: boolean): string[] {
    return this.engine.party.filter((p) => p.ko === ko).map((p) => p.key);
  }

  private beginTarget(keys: string[], _for: 'attack' | 'skill' | 'item'): void {
    if (keys.length === 0) {
      this.say('対象が いない。');
      return;
    }
    this.phase = 'target';
    this.targetKeys = keys;
    this.targetIndex = 0;
    this.input2.flush();
    this.highlightTarget();
  }

  private updateTargetInput(): void {
    if (this.input2.justPressed('right') || this.input2.justPressed('down')) {
      this.targetIndex = (this.targetIndex + 1) % this.targetKeys.length;
      this.highlightTarget();
    } else if (this.input2.justPressed('left') || this.input2.justPressed('up')) {
      this.targetIndex = (this.targetIndex - 1 + this.targetKeys.length) % this.targetKeys.length;
      this.highlightTarget();
    } else if (this.input2.justPressed('confirm')) {
      const key = this.targetKeys[this.targetIndex];
      this.clearTarget();
      if (key === undefined) return;
      if (this.pendingSub) this.commitSub(key);
      else this.commit({ type: 'attack', target: key });
    } else if (this.input2.justPressed('cancel')) {
      this.clearTarget();
      if (this.pendingSub) {
        this.pendingSub = undefined;
        this.phase = 'sub';
        this.renderSubPage();
      } else {
        this.showCommandMenu();
      }
    }
  }

  private highlightTarget(): void {
    this.clearTarget(false);
    const key = this.targetKeys[this.targetIndex];
    const enemy = this.enemySprites.find((e) => e.battler.key === key);
    if (enemy) {
      enemy.marker.setVisible(true);
      this.targetBlink = this.tweens.add({
        targets: enemy.image,
        alpha: { from: 1, to: 0.45 },
        duration: 250,
        yoyo: true,
        repeat: -1,
      });
      return;
    }
    const index = this.engine.party.findIndex((p) => p.key === key);
    const row = this.rows[index];
    if (row) {
      row.name.setColor(COLORS.textAccent);
      this.targetBlink = this.tweens.add({
        targets: row.name,
        alpha: { from: 1, to: 0.3 },
        duration: 250,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private clearTarget(resetPhase = true): void {
    this.targetBlink?.stop();
    this.targetBlink = undefined;
    for (const es of this.enemySprites) {
      es.marker.setVisible(false);
      if (!es.battler.ko) es.image.setAlpha(1);
    }
    for (const row of this.rows) row.name.setAlpha(1);
    this.refreshStatus();
    if (resetPhase && this.phase === 'target') this.phase = 'command';
  }

  // ---- resolution -------------------------------------------------------------

  private async resolve(input: RoundInput): Promise<void> {
    this.phase = 'resolve';
    this.commandMenu?.destroy();
    this.commandMenu = undefined;
    this.commandWindow.setVisible(false);
    this.actorLabel.setVisible(false);
    this.hideSub();
    this.clearTarget(false);
    this.input2.flush();

    const events = this.engine.resolveRound(input);
    for (const event of events) {
      if (this.finished) return;
      await this.play(event);
    }
    await this.afterRound();
  }

  private async play(event: BattleEvent): Promise<void> {
    const lines = battleEventLines(event, {
      name: (key) => this.engine.find(key)?.name ?? key,
      isEnemy: (key) => key.startsWith('e'),
    });
    this.animate(event);
    for (const line of lines) await this.say(line);
    this.refreshStatus();
    if (event.type === 'ko' && event.target.startsWith('e')) {
      const es = this.enemySprites.find((e) => e.battler.key === event.target);
      if (es) await this.fadeOut(es.image);
    }
  }

  /** Damage numbers and flashes (§11.1 ダメージ数字). */
  private animate(event: BattleEvent): void {
    switch (event.type) {
      case 'damage': {
        const pos = this.popupPosition(event.target);
        if (!pos) return;
        const text = event.immune ? 'カキン' : String(event.amount);
        const color = event.weak ? '#ffb347' : event.immune ? COLORS.textDim : COLORS.textMain;
        this.popup(pos.x, pos.y, text, color, event.weak || event.crit ? 1.3 : 1);
        const es = this.enemySprites.find((e) => e.battler.key === event.target);
        if (es && !event.immune) this.flash(es.image);
        if (!event.target.startsWith('e') && !event.immune) this.cameras.main.shake(120, 0.004);
        return;
      }
      case 'heal':
      case 'mp_heal': {
        const pos = this.popupPosition(event.target);
        if (pos) this.popup(pos.x, pos.y, String(event.amount), '#7ae08a', 1);
        return;
      }
      case 'miss': {
        const pos = this.popupPosition(event.target);
        if (pos) this.popup(pos.x, pos.y, 'ミス', COLORS.textDim, 1);
        return;
      }
      case 'phase_change':
        this.cameras.main.shake(500, 0.01);
        return;
      default:
        return;
    }
  }

  private popupPosition(key: string): { x: number; y: number } | undefined {
    const es = this.enemySprites.find((e) => e.battler.key === key);
    if (es) return { x: es.image.x, y: es.image.getTopLeft().y + 16 };
    const index = this.engine.party.findIndex((p) => p.key === key);
    const row = this.rows[index];
    if (!row) return undefined;
    return { x: row.name.x + 60, y: row.name.y - 6 };
  }

  private popup(x: number, y: number, text: string, color: string, scale: number): void {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setScale(scale)
      .setDepth(DEPTH.popup);
    this.tweens.add({
      targets: t,
      y: y - 24,
      alpha: { from: 1, to: 0 },
      duration: POP_MS * this.speedFactor(),
      onComplete: () => t.destroy(),
    });
  }

  private flash(image: Phaser.GameObjects.Image): void {
    image.setTintFill(0xffffff);
    this.time.delayedCall(80, () => image.clearTint());
  }

  private fadeOut(image: Phaser.GameObjects.Image): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: image,
        alpha: 0,
        duration: 300 * this.speedFactor(),
        onComplete: () => {
          image.setVisible(false);
          resolve();
        },
      });
    });
  }

  private async afterRound(): Promise<void> {
    switch (this.engine.outcome) {
      case 'ongoing':
        this.beginRound();
        return;
      case 'victory':
        await this.showResult();
        this.finish('win');
        return;
      case 'defeat':
        syncPartyAfterBattle(this.engine.party, this.state.party);
        this.finish('lose');
        return;
      case 'escaped':
        syncPartyAfterBattle(this.engine.party, this.state.party);
        this.finish('escape');
        return;
      case 'phase_change':
        await this.nextPhase();
        return;
    }
  }

  private async showResult(): Promise<void> {
    this.phase = 'result';
    syncPartyAfterBattle(this.engine.party, this.state.party);
    const rewards = computeRewards(this.engine.enemies, this.engine.party, this.rng);
    const wallet = { gold: this.state.gold };
    const outcome = applyRewards(
      rewards,
      this.state.party,
      getCharacter,
      this.state.inventory,
      wallet,
    );
    this.state.gold = wallet.gold;
    const lines = resultLines(outcome, {
      member: (i) => (this.state.party[i]?.id ? CHARACTERS[this.state.party[i]!.id].name : ''),
      item: (id) => getItem(id).name,
      skill: (id) => getSkill(id).name,
    });
    for (const line of lines) await this.say(line);
  }

  /** ノクス第 2 形態: swap the enemy line-up and keep fighting (§8.4). */
  private async nextPhase(): Promise<void> {
    const boss = this.engine.enemies.find((e) => e.phaseNext !== undefined);
    const nextId = boss?.phaseNext;
    if (nextId === undefined) {
      this.finish('win');
      return;
    }
    for (const es of this.enemySprites) {
      es.image.destroy();
      es.marker.destroy();
    }
    this.enemySprites = [];
    await this.say('……闇が ふくれあがる！');
    this.engine.nextPhase([createEnemyBattler(0, getEnemy(nextId))]);
    this.spawnEnemySprites();
    this.refreshStatus();
    await this.say(`${this.engine.enemies[0]?.name ?? ''}が あらわれた！`);
    this.beginRound();
  }

  private finish(result: BattleResult): void {
    if (this.finished) return;
    this.finished = true;
    this.phase = 'done';
    const onEnd = this.data2.onEnd;
    this.scene.stop(SceneKey.Battle);
    onEnd(result);
  }

  // ---- message window -----------------------------------------------------------

  /** Shows one line and holds it; Z shortens the hold (長押しで早送り). */
  private say(text: string): Promise<void> {
    this.messageText.setText(text);
    this.logLines.push(text);
    return this.wait(LINE_MS * this.speedFactor());
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.waitResolve = undefined;
        resolve();
      };
      this.waitResolve = finish;
      this.time.delayedCall(this.skipHeld ? ms / 4 : ms, finish);
      this.skipHeld = false;
    });
  }

  private speedFactor(): number {
    return this.settings.battleSpeed === 'fast' ? 0.5 : 1;
  }
}

function skillItem(skill: SkillDef, actor: Battler): SubItem {
  return {
    kind: 'skill',
    id: skill.id,
    label: `${skill.name}  MP${skill.mpCost}`,
    disabled: actor.mp < skill.mpCost,
    scope: skill.scope,
    description: skill.description,
    revive: false,
  };
}

function itemEntry(item: ItemDef, qty: number): SubItem {
  return {
    kind: 'item',
    id: item.id,
    label: `${item.name}  ×${qty}`,
    scope: item.scope,
    description: item.description,
    revive: item.effect.type === 'revive',
  };
}

/** Short badges for the status column (§11.3): 毒 麻 暗 防↓ 攻↑ 盾. */
function statusBadges(b: Battler): string {
  if (b.ko) return '戦闘不能';
  const badges: string[] = [];
  if (hasStatus(b, 'poison')) badges.push('毒');
  if (hasStatus(b, 'paralyze')) badges.push('麻');
  if (hasStatus(b, 'blind')) badges.push('暗');
  if (hasStatus(b, 'def_down')) badges.push('防↓');
  if (hasStatus(b, 'atk_up')) badges.push('攻↑');
  if (hasStatus(b, 'taunt')) badges.push('盾');
  return badges.join(' ');
}

export const BATTLE_STATUS_LABELS = STATUS_NAMES;
export const BATTLE_LAYOUT = { ...LAYOUT, GAME_HEIGHT } as const;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
