import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '@/config';
import { evaluateCondition } from '@core/condition';
import type { DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import { formatDialogText } from '@core/dialog/text';
import type { EventHost } from '@core/events/interpreter';
import { EventInterpreter, pickupMessage } from '@core/events/interpreter';
import { FACING_DELTA, GridMover } from '@core/grid/mover';
import { cameraScroll } from '@core/map/camera';
import { PLACEHOLDER_TILESET_NAME, compileMap } from '@core/map/compile';
import type {
  ChestObject,
  MapObject,
  NpcObject,
  SavePointObject,
  TriggerObject,
  WarpObject,
} from '@core/map/objects';
import { CollisionGrid, objectsAt, parseMapObjects } from '@core/map/objects';
import type { TiledMap } from '@core/map/tiled';
import type { Settings } from '@core/settings';
import { SETTINGS_KEY, TEXT_SPEED_MS, parseSettings } from '@core/settings';
import type { GameState } from '@core/state';
import { DIALOGS } from '@data/dialogs';
import { EVENTS } from '@data/events';
import { findItem } from '@data/items';
import { getMapSource } from '@data/maps';
import { PARTY_NAMES } from '@data/names';
import type { CharacterId, Facing } from '@data/types';
import { DialogBox } from '@ui/DialogBox';
import { InputBindings } from '@ui/InputBindings';

import { SceneKey } from './keys';
import type { MenuSceneData } from './MenuScene';

export interface WorldSceneData {
  /** The run being played; location/flags/inventory are read from and written back to it. */
  state: GameState;
}

/** Draw order: ground 0, deco 1, objects/actors 10 (+ y for sorting), above 20, fade 50, HUD 100. */
const DEPTH = { ground: 0, deco: 1, actors: 10, above: 20, fade: 50, hud: 100 } as const;

/** Map transition fade (docs/GAME_DESIGN.md §9.2) and post-warp invulnerability. */
const WARP_FADE_MS = 250;
const WARP_SAFE_MS = 1000;
/** Scripted actor steps use the walking pace from §9.1. */
const SCRIPT_STEP_MS = 150;
/** Chapter title: fade in, hold, fade out = 2.5 s (§11.5). */
const CHAPTER_FADE_MS = 300;
const CHAPTER_HOLD_MS = 1900;

interface NpcRuntime {
  obj: NpcObject;
  image: Phaser.GameObjects.Image;
  tx: number;
  ty: number;
  facing: Facing;
  /** Removed by remove_npc (or hidden by its condition). */
  hidden: boolean;
}

/**
 * Field scene. Compiles the authored map for the save location into Tiled JSON,
 * renders its layers, places map objects and the player, moves the player on the
 * grid, follows with the camera, handles warps, conversations, field
 * interactions (§9.2) and event scripts (§10.2).
 */
export class WorldScene extends Phaser.Scene {
  private state!: GameState;
  private input2!: InputBindings;
  private player!: Phaser.GameObjects.Image;
  private mover!: GridMover;
  private hud!: Phaser.GameObjects.Text;
  private tiled!: TiledMap;
  private baseCollision!: CollisionGrid;
  private collision!: CollisionGrid;
  private objects: MapObject[] = [];
  private readonly npcs = new Map<string, NpcRuntime>();
  private readonly chests = new Map<string, Phaser.GameObjects.Image>();
  private talkingTo: NpcRuntime | null = null;
  private settings!: Settings;
  private runner!: DialogRunner;
  private dialogBox!: DialogBox;
  private interpreter!: EventInterpreter;
  private dialogDone: (() => void) | null = null;
  private choiceDone: ((index: number) => void) | null = null;
  private fadeRect!: Phaser.GameObjects.Rectangle;
  private fadeTween: Phaser.Tweens.Tween | undefined;
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;
  private transitioning = false;
  /** Enemies may not engage the player before this time (scene time, ms). */
  private safeUntil = 0;

  constructor() {
    super(SceneKey.World);
  }

  init(data: WorldSceneData): void {
    this.state = data.state;
    this.transitioning = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.night);
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    this.settings = parseSettings(readStorage(SETTINGS_KEY));
    this.npcs.clear();
    this.chests.clear();
    this.talkingTo = null;
    this.dialogDone = null;
    this.choiceDone = null;
    this.buildMap(this.save.location.map);
    this.spawnObjects();
    this.rebuildCollision();

    this.runner = new DialogRunner(DIALOGS, {
      flags: this.flags,
      applyEffect: (cmd) => {
        if (cmd.cmd === 'give_item') this.state.inventory.add(cmd.item, cmd.qty);
        else if (cmd.cmd === 'take_item') this.state.inventory.remove(cmd.item, cmd.qty);
        // play_se / heal_party arrive with audio (Phase 6) and the party (Phase 3).
      },
      format: (text) =>
        formatDialogText(text, {
          names: PARTY_NAMES,
          gold: this.state.gold,
          itemName: (id) => findItem(id)?.name,
        }),
    });
    this.dialogBox = new DialogBox(this, TEXT_SPEED_MS[this.settings.textSpeed], {
      onAdvance: () => this.applyDialogStep(this.runner.advance()),
      onChoose: (index) => this.onDialogChoice(index),
    });
    this.dialogBox.setDepth(DEPTH.hud);
    this.interpreter = new EventInterpreter(this.eventHost(), EVENTS);

    const { x, y, facing } = this.save.location;
    this.mover = new GridMover({ x, y, facing }, (tx, ty) => this.collision.isBlocked(tx, ty));
    this.player = this.add.image(0, 0, 'sprite_player', facing);
    this.hud = this.add
      .text(8, 8, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COLORS.textDim })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.syncPlayerSprite();
    this.updateCamera();

    // Fades are a screen-sized overlay below the HUD so dialog stays readable on black.
    this.fadeRect = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(DEPTH.fade);
    this.safeUntil = this.time.now + WARP_SAFE_MS;
    void this.fade('in', WARP_FADE_MS, 'black');
    if (window.__starfall) window.__starfall.scene = SceneKey.World;

    // A trigger under the start tile (e.g. the opening) fires right away.
    this.checkTrigger(x, y);
  }

  override update(_time: number, delta: number): void {
    if (this.transitioning) return;
    this.save.playTimeSec += delta / 1000;
    if (this.dialogBox.isOpen) {
      this.dialogBox.update(this.input2, delta);
      this.mover.update(delta, null, false);
      this.syncPlayerSprite();
      return;
    }
    if (this.interpreter.running) {
      this.input2.flush();
      this.syncPlayerSprite();
      this.updateCamera();
      return;
    }
    if (this.input2.justPressed('cancel') && !this.mover.isMoving) {
      this.openMenu();
      return;
    }
    if (this.input2.justPressed('confirm') && !this.mover.isMoving) {
      this.interact();
      if (this.dialogBox.isOpen || this.interpreter.running) return;
    }
    const dir = this.input2.heldDirection();
    const dash = this.input2.isDown('dash');
    for (const event of this.mover.update(delta, dir, dash)) {
      if (event.type === 'turn')
        this.save.location = { ...this.save.location, facing: event.facing };
      if (event.type === 'step_end') this.onEnterTile(event.x, event.y);
      if (this.transitioning || this.interpreter.running) break;
    }
    this.syncPlayerSprite();
    this.updateCamera();
  }

  /** Pauses the field and shows the pause menu; settings are re-read on resume. */
  private openMenu(): void {
    this.input2.flush();
    const data: MenuSceneData = {
      state: this.state,
      canSave: getMapSource(this.save.location.map).meta.canSaveAnywhere,
    };
    this.events.once(Phaser.Scenes.Events.RESUME, () => {
      this.settings = parseSettings(readStorage(SETTINGS_KEY));
      this.dialogBox.setTextSpeed(TEXT_SPEED_MS[this.settings.textSpeed]);
      this.input2.flush();
    });
    this.scene.launch(SceneKey.Menu, data);
    this.scene.pause();
  }

  // ---- probes for e2e / debugging ------------------------------------------

  get isDialogOpen(): boolean {
    return this.dialogBox.isOpen;
  }

  get isEventRunning(): boolean {
    return this.interpreter.running;
  }

  get isMoving(): boolean {
    return this.mover.isMoving;
  }

  /** Logical player tile: the destination while a step is in progress. */
  get playerTile(): { x: number; y: number; facing: Facing } {
    return this.mover.position;
  }

  /** True while the player is still protected after a map transition. */
  get isSafe(): boolean {
    return this.time.now < this.safeUntil;
  }

  get gameState(): GameState {
    return this.state;
  }

  private get save(): GameState['save'] {
    return this.state.save;
  }

  private get flags(): GameState['flags'] {
    return this.state.flags;
  }

  // ---- map --------------------------------------------------------------

  /** Compiles the authored map (cached per map id) and creates its tile layers. */
  private buildMap(mapId: string): void {
    const source = getMapSource(mapId);
    const cacheKey = `map:${mapId}`;
    if (!this.cache.tilemap.exists(cacheKey)) {
      this.cache.tilemap.add(cacheKey, {
        format: Phaser.Tilemaps.Formats.TILED_JSON,
        data: compileMap(source),
      });
    }
    const entry = this.cache.tilemap.get(cacheKey) as { data: TiledMap };
    this.tiled = entry.data;
    this.baseCollision = CollisionGrid.fromMap(this.tiled);
    this.collision = this.baseCollision;
    this.objects = parseMapObjects(this.tiled);

    const map = this.make.tilemap({ key: cacheKey });
    const tileset = map.addTilesetImage(PLACEHOLDER_TILESET_NAME, 'ts_placeholder');
    if (!tileset) throw new Error(`tileset ${PLACEHOLDER_TILESET_NAME} missing`);
    map.createLayer('ground', tileset, 0, 0)?.setDepth(DEPTH.ground);
    map.createLayer('deco', tileset, 0, 0)?.setDepth(DEPTH.deco);
    map.createLayer('above', tileset, 0, 0)?.setDepth(DEPTH.above);
    this.mapPixelWidth = map.widthInPixels;
    this.mapPixelHeight = map.heightInPixels;
  }

  /** Places a sprite for every map object that has one. */
  private spawnObjects(): void {
    for (const o of this.objects) {
      const x = tileCenter(o.tx);
      const y = tileCenter(o.ty);
      const depth = DEPTH.actors + o.ty / 1000;
      switch (o.kind) {
        case 'npc':
          this.npcs.set(o.id, {
            obj: o,
            image: this.add.image(x, y, 'sprite_npc', o.facing).setDepth(depth),
            tx: o.tx,
            ty: o.ty,
            facing: o.facing,
            hidden: false,
          });
          break;
        case 'chest':
          this.chests.set(
            o.flag,
            this.add
              .image(x, y, 'obj_chest', this.flags.has(o.flag) ? 'open' : 'closed')
              .setDepth(depth),
          );
          break;
        case 'sign':
          this.add.image(x, y, 'obj_sign').setDepth(depth);
          break;
        case 'save_point':
          this.add.image(x, y, 'obj_save_point').setDepth(depth);
          break;
        default:
          break; // warps, triggers and enemies have no static sprite
      }
    }
  }

  /**
   * Applies NPC visibility (hidden_if / condition / remove_npc) and rebuilds the
   * collision grid: visible NPCs, chests, signs, save points and locked doors
   * block movement.
   */
  private rebuildCollision(): void {
    const blockers: { x: number; y: number }[] = [];
    for (const npc of this.npcs.values()) {
      const visible = !npc.hidden && this.isNpcVisible(npc.obj);
      npc.image.setVisible(visible);
      if (visible) blockers.push({ x: npc.tx, y: npc.ty });
    }
    for (const o of this.objects) {
      if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point') {
        blockers.push({ x: o.tx, y: o.ty });
      } else if (o.kind === 'warp' && this.isLocked(o)) {
        for (let dy = 0; dy < o.th; dy += 1) {
          for (let dx = 0; dx < o.tw; dx += 1) blockers.push({ x: o.tx + dx, y: o.ty + dy });
        }
      }
    }
    this.collision = this.baseCollision.withBlocked(blockers);
  }

  private isNpcVisible(npc: NpcObject): boolean {
    if (npc.hiddenIf !== undefined && evaluateCondition(npc.hiddenIf, this.flags)) return false;
    if (npc.condition !== undefined && !evaluateCondition(npc.condition, this.flags)) return false;
    return true;
  }

  /** A door needs its key until its door flag is set (§9.2). */
  private isLocked(warp: WarpObject): boolean {
    if (warp.requiredItem === undefined) return false;
    return warp.doorFlag === undefined || !this.flags.has(warp.doorFlag);
  }

  private npcAt(x: number, y: number): NpcRuntime | undefined {
    for (const npc of this.npcs.values()) {
      if (npc.image.visible && npc.tx === x && npc.ty === y) return npc;
    }
    return undefined;
  }

  // ---- interactions (§9.2) --------------------------------------------------

  /** Z on the field: acts on the object in front of the player. */
  private interact(): void {
    const { x, y, facing } = this.mover.position;
    const { dx, dy } = FACING_DELTA[facing];
    const tx = x + dx;
    const ty = y + dy;
    const npc = this.npcAt(tx, ty);
    if (npc) {
      this.talkTo(npc, facing);
      return;
    }
    for (const target of objectsAt(this.objects, tx, ty)) {
      switch (target.kind) {
        case 'chest':
          this.openChest(target);
          return;
        case 'sign':
          this.startDialog(target.textId);
          return;
        case 'save_point':
          this.useSavePoint(target);
          return;
        case 'warp':
          if (this.isLocked(target)) {
            this.unlockDoor(target);
            return;
          }
          break;
        default:
          break;
      }
    }
  }

  private talkTo(npc: NpcRuntime, playerFacing: Facing): void {
    npc.image.setFrame(opposite(playerFacing));
    this.talkingTo = npc;
    this.startDialog(npc.obj.dialog);
  }

  private openChest(chest: ChestObject): void {
    if (this.flags.has(chest.flag)) {
      this.showMessage(['からっぽだ。']);
      return;
    }
    if (chest.itemId === 'gold') {
      this.state.gold += chest.qty;
      this.flags.set(chest.flag, true);
      this.chests.get(chest.flag)?.setFrame('open');
      this.showMessage([`${chest.qty}G を 手に入れた！`]);
      return;
    }
    const added = this.state.inventory.add(chest.itemId, chest.qty);
    const name = findItem(chest.itemId)?.name ?? chest.itemId;
    if (added <= 0) {
      this.showMessage([pickupMessage(name, 0, chest.qty)]);
      return;
    }
    this.flags.set(chest.flag, true);
    this.chests.get(chest.flag)?.setFrame('open');
    this.showMessage([pickupMessage(name, added, chest.qty)]);
  }

  private unlockDoor(warp: WarpObject): void {
    const itemId = warp.requiredItem;
    if (itemId === undefined) return;
    if (this.state.inventory.has(itemId)) {
      if (warp.doorFlag !== undefined) this.flags.set(warp.doorFlag, true);
      this.rebuildCollision();
      this.showMessage(['かぎを使った。']);
      return;
    }
    if (warp.lockedTextId !== undefined) this.startDialog(warp.lockedTextId);
    else this.showMessage(['かぎがかかっている。']);
  }

  private useSavePoint(_point: SavePointObject): void {
    // The save screen arrives with #10; the shrine is already a landmark on the map.
    this.showMessage(['星の祠だ。星の光がまたたいている。', '（セーブ画面は準備中です）']);
  }

  // ---- dialog ---------------------------------------------------------------

  private startDialog(id: string): void {
    this.input2.flush();
    this.applyDialogStep(this.runner.start(id));
  }

  private showMessage(pages: string[]): void {
    this.input2.flush();
    this.applyDialogStep(this.runner.startInline(pages));
  }

  private onDialogChoice(index: number): void {
    if (this.choiceDone) {
      const done = this.choiceDone;
      this.choiceDone = null;
      this.runner.cancel();
      this.applyDialogStep({ kind: 'end' });
      done(index);
      return;
    }
    this.applyDialogStep(this.runner.choose(index));
  }

  private applyDialogStep(step: DialogStep): void {
    if (step.kind === 'page') {
      this.dialogBox.show(step);
      return;
    }
    this.dialogBox.close();
    if (this.talkingTo) {
      this.talkingTo.image.setFrame(this.talkingTo.facing);
      this.talkingTo = null;
    }
    // Effects may have changed flags that hide/show NPCs or unlock doors.
    this.rebuildCollision();
    const done = this.dialogDone;
    this.dialogDone = null;
    done?.();
  }

  // ---- triggers and warps ---------------------------------------------------

  /** Called when a step lands on a tile: records the position, checks triggers and warps. */
  private onEnterTile(x: number, y: number): void {
    this.save.location = { ...this.save.location, x, y, facing: this.mover.position.facing };
    if (this.checkTrigger(x, y)) return;
    const warp = objectsAt(this.objects, x, y).find((o): o is WarpObject => o.kind === 'warp');
    if (warp && !this.isLocked(warp)) this.startWarp(warp);
  }

  /** Fires the trigger under a tile when its condition holds; once-triggers set `ev.<id>`. */
  private checkTrigger(x: number, y: number): boolean {
    const trigger = objectsAt(this.objects, x, y).find(
      (o): o is TriggerObject => o.kind === 'trigger',
    );
    if (!trigger) return false;
    const onceKey = `ev.${trigger.eventId}`;
    if (trigger.once && this.flags.has(onceKey)) return false;
    if (trigger.condition !== undefined && !evaluateCondition(trigger.condition, this.flags)) {
      return false;
    }
    if (trigger.once) this.flags.set(onceKey, true);
    void this.runEvent(trigger.eventId);
    return true;
  }

  private async runEvent(eventId: string): Promise<void> {
    this.input2.flush();
    try {
      await this.interpreter.run(eventId);
    } finally {
      if (this.scene.isActive(SceneKey.World)) this.rebuildCollision();
    }
  }

  private startWarp(warp: WarpObject): void {
    void this.warpTo(warp.targetMap, warp.targetX, warp.targetY, warp.facing);
  }

  private warpTo(map: string, x: number, y: number, facing: Facing): Promise<void> {
    this.transitioning = true;
    this.input2.flush();
    return this.fade('out', WARP_FADE_MS, 'black').then(() => {
      this.save.location = { map, x, y, facing };
      const data: WorldSceneData = { state: this.state };
      this.scene.restart(data);
    });
  }

  // ---- event host (§10.2) ---------------------------------------------------

  private eventHost(): EventHost {
    return {
      flags: this.flags,
      inventory: this.state.inventory,
      itemName: (id) => findItem(id)?.name ?? id,
      say: (dialogId) =>
        new Promise<void>((resolve) => {
          this.dialogDone = resolve;
          this.startDialog(dialogId);
        }),
      message: (text) =>
        new Promise<void>((resolve) => {
          this.dialogDone = resolve;
          this.showMessage([text]);
        }),
      choice: (texts) =>
        new Promise<number>((resolve) => {
          this.choiceDone = resolve;
          this.input2.flush();
          this.applyDialogStep(this.runner.startInline([''], texts));
        }),
      move: (actor, path) => this.scriptedMove(actor, path),
      face: (actor, dir) => {
        if (actor === 'player') {
          this.mover.face(dir);
          this.save.location = { ...this.save.location, facing: dir };
          this.syncPlayerSprite();
          return;
        }
        const npc = this.npcs.get(actor);
        if (npc) {
          npc.facing = dir;
          npc.image.setFrame(dir);
        }
      },
      wait: (ms) => new Promise<void>((resolve) => this.time.delayedCall(ms, resolve)),
      warp: (map, x, y, facing) => this.warpTo(map, x, y, facing),
      fade: (dir, ms, color) => this.fade(dir, ms, color),
      shake: (ms, intensity) =>
        new Promise<void>((resolve) => {
          this.cameras.main.shake(
            Math.max(ms, 1),
            0.02 * intensity,
            true,
            (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
              if (progress >= 1) resolve();
            },
          );
        }),
      flash: (ms, color) =>
        new Promise<void>((resolve) => {
          const v = color === 'white' ? 255 : 0;
          this.cameras.main.flash(
            Math.max(ms, 1),
            v,
            v,
            v,
            true,
            (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
              if (progress >= 1) resolve();
            },
          );
        }),
      playBgm: () => undefined, // audio lands in Phase 6
      playSe: () => undefined,
      healParty: () => undefined, // party state lands in Phase 3
      addMember: (_id: CharacterId) => undefined,
      showChapter: (title) => this.showChapter(title),
      spawnNpc: (id) => {
        const npc = this.npcs.get(id);
        if (npc) npc.hidden = false;
        this.rebuildCollision();
      },
      removeNpc: (id) => {
        const npc = this.npcs.get(id);
        if (npc) npc.hidden = true;
        this.rebuildCollision();
      },
      battle: () => Promise.resolve('win'), // battles land in Phase 3
      endGame: () => undefined, // ending lands in Phase 5
    };
  }

  private fade(dir: 'in' | 'out', ms: number, color: 'black' | 'white'): Promise<void> {
    this.fadeTween?.stop();
    this.fadeRect.setFillStyle(color === 'white' ? 0xffffff : 0x000000, 1);
    const alpha = dir === 'out' ? 1 : 0;
    if (ms <= 0) {
      this.fadeRect.setAlpha(alpha);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.fadeTween = this.tweens.add({
        targets: this.fadeRect,
        alpha,
        duration: ms,
        onComplete: () => resolve(),
      });
    });
  }

  /** Walks an actor along a path one tile at a time; scripted moves ignore collision. */
  private async scriptedMove(actor: string, path: Facing[]): Promise<void> {
    for (const dir of path) {
      const { dx, dy } = FACING_DELTA[dir];
      if (actor === 'player') {
        const from = this.mover.position;
        const to = { x: from.x + dx, y: from.y + dy, facing: dir };
        this.mover.face(dir);
        await this.tweenTo(this.player, to.x, to.y);
        this.mover.teleport(to);
        this.save.location = { ...this.save.location, ...to };
        this.syncPlayerSprite();
      } else {
        const npc = this.npcs.get(actor);
        if (!npc) continue;
        npc.facing = dir;
        npc.image.setFrame(dir);
        const nx = npc.tx + dx;
        const ny = npc.ty + dy;
        await this.tweenTo(npc.image, nx, ny);
        npc.tx = nx;
        npc.ty = ny;
        npc.image.setDepth(DEPTH.actors + ny / 1000);
      }
    }
  }

  private tweenTo(target: Phaser.GameObjects.Image, tx: number, ty: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: target,
        x: tileCenter(tx),
        y: tileCenter(ty),
        duration: SCRIPT_STEP_MS,
        onComplete: () => resolve(),
      });
    });
  }

  /** Black band with the chapter title, 2.5 s in total (§11.5). */
  private showChapter(title: string): Promise<void> {
    const band = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, 88, 0x000000, 0.85)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 1)
      .setAlpha(0);
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, title, {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: COLORS.textMain,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 2)
      .setAlpha(0);
    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: [band, text],
        alpha: 1,
        duration: CHAPTER_FADE_MS,
        hold: CHAPTER_HOLD_MS,
        yoyo: true,
        onComplete: () => {
          band.destroy();
          text.destroy();
          resolve();
        },
      });
    });
  }

  // ---- rendering --------------------------------------------------------------

  private syncPlayerSprite(): void {
    const rp = this.mover.renderPosition;
    const bob = this.mover.isMoving ? -Math.round(2 * Math.sin(this.mover.progress * Math.PI)) : 0;
    this.player
      .setPosition(rp.x * TILE_SIZE + TILE_SIZE / 2, rp.y * TILE_SIZE + TILE_SIZE / 2 + bob)
      .setFrame(this.mover.position.facing)
      .setDepth(DEPTH.actors + rp.y / 1000);
    const { x, y } = this.mover.position;
    this.hud.setText(`${this.save.location.map}  (${x}, ${y})  ${this.state.gold}G`);
  }

  private updateCamera(): void {
    const { scrollX, scrollY } = cameraScroll(
      this.mapPixelWidth,
      this.mapPixelHeight,
      GAME_WIDTH,
      GAME_HEIGHT,
      this.player.x,
      this.player.y,
    );
    this.cameras.main.setScroll(scrollX, scrollY);
  }
}

function tileCenter(tile: number): number {
  return tile * TILE_SIZE + TILE_SIZE / 2;
}

function opposite(facing: Facing): Facing {
  switch (facing) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
