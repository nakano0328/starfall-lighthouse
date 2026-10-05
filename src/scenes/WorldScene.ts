import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '@/config';
import { mathRng } from '@core/battle/rng';
import { evaluateCondition } from '@core/condition';
import type { DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import { formatDialogText } from '@core/dialog/text';
import type { EventHost } from '@core/events/interpreter';
import { EventInterpreter, pickupMessage } from '@core/events/interpreter';
import type { SymbolState } from '@core/field/symbols';
import {
  ESCAPE_SAFE_MS,
  createSymbol,
  hasLineOfSight,
  pickGroup,
  renderPosition,
  shouldRespawn,
  stunSymbol,
  symbolSpecFromObject,
  updateSymbol,
} from '@core/field/symbols';
import { FACING_DELTA, GridMover } from '@core/grid/mover';
import { cameraScroll } from '@core/map/camera';
import { PLACEHOLDER_TILESET_NAME, compileMap } from '@core/map/compile';
import type {
  ChestObject,
  EnemyObject,
  MapObject,
  NpcObject,
  SavePointObject,
  TriggerObject,
  WarpObject,
} from '@core/map/objects';
import { CollisionGrid, markerTextFor, objectsAt, parseMapObjects } from '@core/map/objects';
import type { TiledMap } from '@core/map/tiled';
import { expForLevel } from '@core/party/exp';
import { createMember, memberStats } from '@core/party/member';
import type { Settings } from '@core/settings';
import { innPrice, payInn } from '@core/shop';
import { SETTINGS_KEY, TEXT_SPEED_MS, parseSettings } from '@core/settings';
import type { GameState } from '@core/state';
import { CHARACTERS } from '@data/characters';
import { DIALOGS } from '@data/dialogs';
import { getEncounter } from '@data/encounters';
import { getEnemy } from '@data/enemies';
import { EVENTS } from '@data/events';
import { findItem } from '@data/items';
import { getMapSource } from '@data/maps';
import { PARTY_NAMES } from '@data/names';
import type { CharacterId, Facing } from '@data/types';
import { DialogBox } from '@ui/DialogBox';
import { InputBindings } from '@ui/InputBindings';

import type { BattleResult, BattleSceneData } from './BattleScene';
import { SceneKey } from './keys';
import type { MenuSceneData } from './MenuScene';
import type { ShopSceneData } from './ShopScene';

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

interface SymbolRuntime {
  state: SymbolState;
  image: Phaser.GameObjects.Image;
}

export interface BattleStartOptions {
  preemptive?: boolean;
  /** The symbol that made contact; removed on a win, stunned on an escape. */
  source?: SymbolRuntime;
  /** Deterministic rng for tests. */
  seed?: number;
  /** Event battles decide themselves what a loss means (lose:continue). */
  fromEvent?: boolean;
}

/**
 * When each defeated symbol fell (`<map>:<id>` → Date.now()). Session-wide so a
 * symbol stays gone while the player is on the map and comes back on re-entry
 * once its respawn delay has passed (§5.12).
 */
const defeatedAt = new Map<string, number>();

interface NpcRuntime {
  obj: NpcObject;
  image: Phaser.GameObjects.Image;
  /** Quest marker above the head (§14 ！／？); empty text hides it. */
  marker: Phaser.GameObjects.Text;
  tx: number;
  ty: number;
  facing: Facing;
  /** Removed by remove_npc (or hidden by its condition). */
  hidden: boolean;
  /** Present for `move: random` NPCs: the same walker the enemy symbols use, minus chasing. */
  wander: SymbolState | undefined;
}

/** How far a wandering NPC strays from its spawn tile (§9.3 `move: random`). */
const NPC_WANDER_RADIUS = 2;
const NPC_MARKER_OFFSET_Y = 22;

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
  private symbols: SymbolRuntime[] = [];
  /** True from contact until the battle scene hands the result back. */
  private battleActive = false;
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
  /** Id of the map built by buildMap (the save location's map). */
  private mapId = '';
  /** Resolves the script `warp` that restarted the scene, once the new map has faded in. */
  private warpDone: (() => void) | null = null;
  /** X pressed mid-step: the menu opens once the player stands on a tile (§11.4). */
  private menuRequested = false;
  /** True while a scripted player step tweens the sprite itself (see syncPlayerSprite). */
  private scriptedPlayerStep = false;

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
    this.menuRequested = false;
    this.scriptedPlayerStep = false;
    this.symbols = [];
    this.battleActive = false;
    this.buildMap(this.save.location.map);
    this.spawnObjects();
    this.spawnSymbols();
    this.rebuildCollision();

    this.runner = new DialogRunner(DIALOGS, {
      flags: this.flags,
      applyEffect: (cmd) => {
        if (cmd.cmd === 'give_item') this.state.inventory.add(cmd.item, cmd.qty);
        else if (cmd.cmd === 'take_item') this.state.inventory.remove(cmd.item, cmd.qty);
        else if (cmd.cmd === 'heal_party') this.healParty();
        else if (cmd.cmd === 'give_gold') this.state.gold += cmd.amount;
        // play_se arrives with audio (Phase 6).
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
    // A script whose `warp` restarted the scene keeps running (§10.2): its host
    // reads this.dialogBox / this.time / this.tweens at call time, so it works
    // against the rebuilt scene. Any other start gets a fresh interpreter.
    const resumingScript = this.warpDone !== null && this.interpreter.running;
    if (!resumingScript) this.interpreter = new EventInterpreter(this.eventHost(), EVENTS);

    const { x, y, facing } = this.save.location;
    this.mover = new GridMover(
      { x, y, facing },
      (tx, ty) =>
        this.collision.isBlocked(tx, ty) ||
        this.symbolAt(tx, ty) !== undefined ||
        this.wanderingNpcAt(tx, ty) !== undefined,
    );
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
    // The fade-in is part of the transition (§9.2): a script `warp` resolves after it.
    void this.fade('in', WARP_FADE_MS, 'black').then(() => {
      const done = this.warpDone;
      this.warpDone = null;
      done?.();
    });
    if (window.__starfall) window.__starfall.scene = SceneKey.World;

    // A trigger under the start tile (e.g. the opening) fires right away, unless
    // the script that warped here is still running.
    if (!this.interpreter.running) this.checkTrigger(x, y);
  }

  override update(_time: number, delta: number): void {
    if (this.transitioning) return;
    this.save.playTimeSec += delta / 1000;
    if (this.dialogBox.isOpen) {
      this.menuRequested = false;
      this.dialogBox.update(this.input2, delta);
      this.mover.update(delta, null, false);
      this.syncPlayerSprite();
      return;
    }
    if (this.interpreter.running) {
      this.menuRequested = false;
      this.input2.flush();
      this.syncPlayerSprite();
      this.updateCamera();
      return;
    }
    // X mid-step is kept: no further step starts and the menu opens on the tile.
    if (this.input2.justPressed('cancel')) this.menuRequested = true;
    if (this.menuRequested && !this.mover.isMoving) {
      this.openMenu();
      return;
    }
    if (this.input2.justPressed('confirm') && !this.mover.isMoving) {
      this.interact();
      if (this.dialogBox.isOpen || this.interpreter.running) return;
    }
    const dir = this.menuRequested ? null : this.input2.heldDirection();
    const dash = this.input2.isDown('dash');
    for (const event of this.mover.update(delta, dir, dash)) {
      if (event.type === 'turn')
        this.save.location = { ...this.save.location, facing: event.facing };
      if (event.type === 'step_end') this.onEnterTile(event.x, event.y);
      if (this.transitioning || this.interpreter.running) break;
    }
    this.syncPlayerSprite();
    this.updateCamera();
    this.updateSymbols();
    this.updateNpcWander();
    if (
      this.menuRequested &&
      !this.transitioning &&
      !this.interpreter.running &&
      !this.dialogBox.isOpen &&
      !this.mover.isMoving
    ) {
      this.openMenu();
    }
  }

  /** Pauses the field and shows the pause menu; settings are re-read on resume. */
  private openMenu(override: Partial<MenuSceneData> = {}): void {
    this.menuRequested = false;
    this.input2.flush();
    const data: MenuSceneData = {
      state: this.state,
      canSave: getMapSource(this.save.location.map).meta.canSaveAnywhere,
      ...override,
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

  /** Enemy symbols currently on the map (logical tiles). */
  get symbolTiles(): { id: string; x: number; y: number; mode: string }[] {
    return this.symbols.map((s) => ({
      id: s.state.spec.id,
      x: s.state.tx,
      y: s.state.ty,
      mode: s.state.mode,
    }));
  }

  get isBattleActive(): boolean {
    return this.battleActive;
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
    this.mapId = mapId;
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
            marker: this.add
              .text(x, y - NPC_MARKER_OFFSET_Y, '', {
                fontFamily: 'sans-serif',
                fontSize: '14px',
                color: COLORS.textAccent,
                stroke: '#000000',
                strokeThickness: 3,
              })
              .setOrigin(0.5, 1)
              .setDepth(DEPTH.above + 1)
              .setVisible(false),
            tx: o.tx,
            ty: o.ty,
            facing: o.facing,
            hidden: false,
            wander:
              o.move === 'random'
                ? createSymbol(
                    {
                      id: o.id,
                      homeX: o.tx,
                      homeY: o.ty,
                      radius: NPC_WANDER_RADIUS,
                      groupIds: [],
                      respawnSec: 0,
                    },
                    this.time.now,
                    mathRng,
                  )
                : undefined,
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
          break; // warps and triggers have no sprite; enemies are symbols (spawnSymbols)
      }
    }
  }

  // ---- enemy symbols (§5.12) ---------------------------------------------------

  /** Places a wandering symbol for every `enemy` object that is alive and due. */
  private spawnSymbols(): void {
    const now = this.time.now;
    this.objects.forEach((o, index) => {
      if (o.kind !== 'enemy') return;
      const enemy = o as EnemyObject;
      if (enemy.condition !== undefined && !evaluateCondition(enemy.condition, this.flags)) return;
      const spec = symbolSpecFromObject(enemy, `enemy_${index}`);
      if (spec.defeatedFlag !== undefined && this.flags.has(spec.defeatedFlag)) return;
      if (!shouldRespawn(spec, defeatedAt.get(`${this.mapId}:${spec.id}`), Date.now())) return;
      const state = createSymbol(spec, now, mathRng);
      const image = this.add
        .image(tileCenter(state.tx), tileCenter(state.ty), 'sprite_enemy', 'down')
        .setDepth(DEPTH.actors + state.ty / 1000);
      this.symbols.push({ state, image });
    });
  }

  private symbolAt(x: number, y: number): SymbolRuntime | undefined {
    return this.symbols.find((s) => s.state.tx === x && s.state.ty === y);
  }

  /** Moves every symbol and starts a battle on contact (unless the player is safe). */
  private updateSymbols(): void {
    if (this.battleActive || this.transitioning) return;
    const now = this.time.now;
    const player = this.mover.position;
    const playerSafe = this.isSafe || this.interpreter.running || this.dialogBox.isOpen;
    for (const sym of this.symbols) {
      const env = {
        blocked: (x: number, y: number) =>
          this.collision.isBlocked(x, y) ||
          this.symbols.some((o) => o !== sym && o.state.tx === x && o.state.ty === y),
        canSee: (ax: number, ay: number, bx: number, by: number) =>
          hasLineOfSight(ax, ay, bx, by, (x, y) => this.baseCollision.isBlocked(x, y)),
        playerSafe,
      };
      const result = updateSymbol(sym.state, now, player, env, mathRng);
      const pos = renderPosition(sym.state, now);
      sym.image
        .setPosition(pos.x * TILE_SIZE + TILE_SIZE / 2, pos.y * TILE_SIZE + TILE_SIZE / 2)
        .setDepth(DEPTH.actors + pos.y / 1000)
        .setFrame(facingOf(sym.state));
      if (result.contact) {
        void this.startBattle(pickGroup(sym.state.spec, mathRng), {
          preemptive: result.contact.preemptive,
          source: sym,
        });
        return;
      }
    }
  }

  private wanderingNpcAt(x: number, y: number): NpcRuntime | undefined {
    for (const npc of this.npcs.values()) {
      if (npc.wander && npc.image.visible && npc.tx === x && npc.ty === y) return npc;
    }
    return undefined;
  }

  /** `move: random` NPCs pace around their spawn tile; they never chase or touch the player. */
  private updateNpcWander(): void {
    if (this.battleActive || this.transitioning) return;
    if (this.dialogBox.isOpen || this.interpreter.running) return;
    const now = this.time.now;
    const player = this.mover.position;
    for (const npc of this.npcs.values()) {
      const state = npc.wander;
      if (!state || !npc.image.visible || npc === this.talkingTo) continue;
      const env = {
        blocked: (x: number, y: number) =>
          this.collision.isBlocked(x, y) ||
          (x === player.x && y === player.y) ||
          this.symbolAt(x, y) !== undefined ||
          [...this.npcs.values()].some(
            (o) => o !== npc && o.image.visible && o.tx === x && o.ty === y,
          ),
        canSee: () => false,
        playerSafe: true,
      };
      updateSymbol(state, now, player, env, mathRng);
      npc.tx = state.tx;
      npc.ty = state.ty;
      const pos = renderPosition(state, now);
      const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
      const py = pos.y * TILE_SIZE + TILE_SIZE / 2;
      npc.image.setPosition(px, py).setDepth(DEPTH.actors + pos.y / 1000);
      npc.marker.setPosition(px, py - NPC_MARKER_OFFSET_Y);
      if (now < state.stepEnd) {
        npc.facing = facingOf(state);
        npc.image.setFrame(npc.facing);
      }
    }
  }

  /** The `onDefeatEvent` of the first enemy in the group that declares one (boss wins). */
  private defeatEventFor(groupId: string): string | undefined {
    for (const { enemyId } of getEncounter(groupId).enemies) {
      const ev = getEnemy(enemyId).onDefeatEvent;
      if (ev !== undefined) return ev;
    }
    return undefined;
  }

  /**
   * Runs a battle over the paused field and applies its outcome: a defeated symbol
   * disappears (boss flags are set), an escaped one is stunned and the player gets
   * 3 s of invulnerability, a loss goes to the game over screen unless the caller
   * (an event with lose:continue) handles it.
   */
  startBattle(groupId: string, options: BattleStartOptions = {}): Promise<BattleResult> {
    if (this.battleActive) return Promise.resolve('lose');
    this.battleActive = true;
    this.menuRequested = false;
    this.input2.flush();
    return new Promise<BattleResult>((resolve) => {
      const data: BattleSceneData = {
        state: this.state,
        groupId,
        preemptive: options.preemptive ?? false,
        ...(options.seed === undefined ? {} : { seed: options.seed }),
        onEnd: (result) => {
          this.scene.resume(SceneKey.World);
          this.battleActive = false;
          this.input2.flush();
          this.afterBattle(result, options.source);
          if (result === 'lose' && !options.fromEvent) this.gameOver();
          resolve(result);
          if (result === 'win' && !options.fromEvent) {
            const ev = this.defeatEventFor(groupId);
            if (ev !== undefined) void this.runEvent(ev);
          }
        },
      };
      void this.flashEncounter().then(() => {
        this.scene.launch(SceneKey.Battle, data);
        this.scene.pause(SceneKey.World);
      });
    });
  }

  private afterBattle(result: BattleResult, source: SymbolRuntime | undefined): void {
    if (result === 'win' && source) {
      defeatedAt.set(`${this.mapId}:${source.state.spec.id}`, Date.now());
      if (source.state.spec.defeatedFlag !== undefined) {
        this.flags.set(source.state.spec.defeatedFlag, true);
      }
      source.image.destroy();
      this.symbols = this.symbols.filter((s) => s !== source);
    } else if (result === 'escape') {
      if (source) stunSymbol(source.state, this.time.now);
      this.safeUntil = this.time.now + ESCAPE_SAFE_MS;
      this.tweens.add({
        targets: this.player,
        alpha: { from: 1, to: 0.3 },
        duration: 150,
        yoyo: true,
        repeat: Math.floor(ESCAPE_SAFE_MS / 300) - 1,
        onComplete: () => this.player.setAlpha(1),
      });
    }
    this.syncPlayerSprite();
  }

  /** Short white flash before the battle screen (§5.12). */
  private flashEncounter(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.cameras.main.flash(
        200,
        255,
        255,
        255,
        true,
        (_c: Phaser.Cameras.Scene2D.Camera, progress: number) => {
          if (progress >= 1) resolve();
        },
      );
    });
  }

  /** Leaves the field for the defeat screen (§5.11). */
  private gameOver(): void {
    this.transitioning = true;
    this.input2.flush();
    void this.fade('out', WARP_FADE_MS, 'black').then(() => {
      this.scene.start(SceneKey.GameOver);
    });
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
      const marker = markerTextFor(npc.obj.markers, this.flags);
      npc.marker.setText(marker).setVisible(visible && marker !== '');
      // Wanderers block dynamically (see the mover's callback); static NPCs block here.
      if (visible && !npc.wander) blockers.push({ x: npc.tx, y: npc.ty });
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
    return !this.flags.has(this.doorFlagOf(warp));
  }

  /**
   * The flag that keeps a key door open: the authored `door_flag`, else the §9.2
   * default `door.<map>_<n>` (map id without `map_`, n = 1-based ordinal of the
   * key door among this map's objects, e.g. `door.mine_b1_01`). Author `door_flag`
   * when a script or condition needs to read the flag.
   */
  private doorFlagOf(warp: WarpObject): string {
    if (warp.doorFlag !== undefined) return warp.doorFlag;
    const doors = this.objects.filter(
      (o): o is WarpObject => o.kind === 'warp' && o.requiredItem !== undefined,
    );
    const n = Math.max(0, doors.indexOf(warp)) + 1;
    return `door.${this.mapId.replace(/^map_/, '')}_${String(n).padStart(2, '0')}`;
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
      this.flags.set(this.doorFlagOf(warp), true);
      this.rebuildCollision();
      this.showMessage(['かぎを使った。']);
      return;
    }
    if (warp.lockedTextId !== undefined) this.startDialog(warp.lockedTextId);
    else this.showMessage(['かぎがかかっている。']);
  }

  /**
   * 星の祠: opens the save list regardless of the map's canSaveAnywhere (§9.2).
   * A `heal:true` point (灯台 5F の泉, §9.3) restores the party first; with a
   * `once_flag` it does so only once.
   */
  private useSavePoint(point: SavePointObject): void {
    const saveMenu: Partial<MenuSceneData> = { canSave: true, startMode: 'save' };
    const spent = point.onceFlag !== undefined && this.flags.has(point.onceFlag);
    if (!point.heal || spent) {
      this.openMenu(saveMenu);
      return;
    }
    this.healParty();
    if (point.onceFlag !== undefined) this.flags.set(point.onceFlag, true);
    this.dialogDone = () => this.openMenu(saveMenu);
    this.showMessage(['みんなの HP と MP が 全快した。']);
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
    const npc = this.talkingTo?.obj;
    if (this.talkingTo) {
      this.talkingTo.image.setFrame(this.talkingTo.facing);
      this.talkingTo = null;
    }
    // Effects may have changed flags that hide/show NPCs or unlock doors.
    this.rebuildCollision();
    const done = this.dialogDone;
    this.dialogDone = null;
    done?.();
    // Shop / inn NPCs open their counter once their greeting is over (§9.2).
    if (npc && !this.interpreter.running && !this.dialogBox.isOpen) {
      if (npc.innPrice !== undefined) this.offerInn(npc.innPrice);
      else if (npc.shop !== undefined) this.openShop(npc.shop);
    }
  }

  // ---- shop and inn (§7.5, §7.6, §9.2) ---------------------------------------

  private openShop(shopId: string): void {
    this.input2.flush();
    const data: ShopSceneData = { state: this.state, shopId };
    this.events.once(Phaser.Scenes.Events.RESUME, () => this.input2.flush());
    this.scene.launch(SceneKey.Shop, data);
    this.scene.pause();
  }

  /** 「○G で泊まりますか？」→ pay → heal → fade → save screen. */
  private offerInn(base: number): void {
    const free = this.mapId === 'map_minato_inn' && this.flags.has('minato.inn_free');
    const price = innPrice(base, free);
    this.choiceDone = (index) => {
      if (index === 0) this.stayAtInn(price);
    };
    this.input2.flush();
    this.applyDialogStep(
      this.runner.startInline(
        [
          price === 0
            ? '今夜は 無料で いいよ。泊まっていく？'
            : `ひとばん ${price}G だよ。泊まっていく？`,
        ],
        ['はい', 'いいえ'],
      ),
    );
  }

  private stayAtInn(price: number): void {
    if (!payInn(this.state, price)) {
      this.showMessage(['……お金が 足りないみたいだね。']);
      return;
    }
    this.healParty();
    this.transitioning = true;
    void this.fade('out', WARP_FADE_MS * 2, 'black')
      .then(() => new Promise<void>((resolve) => this.time.delayedCall(400, resolve)))
      .then(() => this.fade('in', WARP_FADE_MS * 2, 'black'))
      .then(() => {
        this.transitioning = false;
        this.dialogDone = () => this.openMenu({ canSave: true, startMode: 'save' });
        this.showMessage(['ぐっすり 眠った。', 'HP と MP が 全快した。']);
      });
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
    // Entered with the direction still held: the mover has already begun the next
    // step. Cancel it so the event finds the player on the trigger tile and the
    // save location (§9.1) matches the sprite.
    if (this.mover.isMoving) {
      this.mover.teleport({ x, y, facing: this.mover.position.facing });
      this.syncPlayerSprite();
    }
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

  /** Fades out and restarts the scene on the target; resolves after the new map's fade-in. */
  private warpTo(map: string, x: number, y: number, facing: Facing): Promise<void> {
    this.transitioning = true;
    this.menuRequested = false;
    this.input2.flush();
    return new Promise<void>((resolve) => {
      void this.fade('out', WARP_FADE_MS, 'black').then(() => {
        this.save.location = { map, x, y, facing };
        // The restart is only queued; the script that issued the warp must not go
        // on against this scene's objects, so the next create() resolves it (§10.2).
        this.warpDone = resolve;
        const data: WorldSceneData = { state: this.state };
        this.scene.restart(data);
      });
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
      healParty: () => this.healParty(),
      addMember: (id) => this.addMember(id),
      giveGold: (amount) => {
        this.state.gold += amount;
      },
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
      battle: async (group, lose) => {
        const result = await this.startBattle(group, { fromEvent: true });
        if (result === 'win') return 'win';
        if (lose === 'gameover') this.gameOver();
        return 'lose';
      },
      endGame: () => undefined, // ending lands in Phase 5
    };
  }

  // ---- party (§10.2 heal_party / add_member) ---------------------------------

  /** HP/MP to full, KO lifted, ailments cleared, for every member (§10.2 heal_party). */
  private healParty(): void {
    for (const m of this.state.party) {
      const max = memberStats(CHARACTERS[m.id], m);
      m.hp = max.hp;
      m.mp = max.mp;
      m.ko = false;
      m.statuses = [];
    }
  }

  /**
   * Joins a character with the leader's cumulative EXP, floored at the EXP of the
   * character's minimum join level (§4.1: ゴロー ≥ Lv7), with initial equipment.
   * A character already in the party is left alone.
   */
  private addMember(id: CharacterId): void {
    if (this.state.party.some((m) => m.id === id)) return;
    const def = CHARACTERS[id];
    const leaderExp = this.state.party[0]?.exp ?? 0;
    this.state.party.push(createMember(def, Math.max(leaderExp, expForLevel(def.joinMinLevel))));
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

  /**
   * Walks an actor along a path one tile at a time; scripted moves ignore collision.
   * A `wait:false` move still running when a `warp` restarts the scene ends with
   * the old map (its tween dies there) instead of carrying on in the new one.
   */
  private async scriptedMove(actor: string, path: Facing[]): Promise<void> {
    for (const dir of path) {
      const { dx, dy } = FACING_DELTA[dir];
      if (actor === 'player') {
        const from = this.mover.position;
        const to = { x: from.x + dx, y: from.y + dy, facing: dir };
        this.mover.face(dir);
        // The tween owns the sprite for this step; syncPlayerSprite leaves it alone.
        this.scriptedPlayerStep = true;
        const arrived = await this.tweenTo(this.player, to.x, to.y);
        this.scriptedPlayerStep = false;
        if (!arrived) return;
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
        if (!(await this.tweenTo(npc.image, nx, ny))) return;
        npc.tx = nx;
        npc.ty = ny;
        npc.image.setDepth(DEPTH.actors + ny / 1000);
      }
    }
  }

  /** Tweens an image to a tile centre. Resolves false if the scene shut down first. */
  private tweenTo(target: Phaser.GameObjects.Image, tx: number, ty: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const cut = (): void => resolve(false);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, cut);
      this.tweens.add({
        targets: target,
        x: tileCenter(tx),
        y: tileCenter(ty),
        duration: SCRIPT_STEP_MS,
        onComplete: () => {
          this.events.off(Phaser.Scenes.Events.SHUTDOWN, cut);
          resolve(true);
        },
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
    let rowY: number;
    if (this.scriptedPlayerStep) {
      // A scripted step is tweening the sprite (scriptedMove); the mover still
      // holds the start tile, so writing its position here would freeze the sprite.
      rowY = (this.player.y - TILE_SIZE / 2) / TILE_SIZE;
    } else {
      const rp = this.mover.renderPosition;
      const bob = this.mover.isMoving
        ? -Math.round(2 * Math.sin(this.mover.progress * Math.PI))
        : 0;
      this.player.setPosition(
        rp.x * TILE_SIZE + TILE_SIZE / 2,
        rp.y * TILE_SIZE + TILE_SIZE / 2 + bob,
      );
      rowY = rp.y;
    }
    this.player.setFrame(this.mover.position.facing).setDepth(DEPTH.actors + rowY / 1000);
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

/** Frame for a symbol from its current step direction (down when idle). */
function facingOf(sym: SymbolState): Facing {
  const dx = sym.tx - sym.fromX;
  const dy = sym.ty - sym.fromY;
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy < 0) return 'up';
  return 'down';
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
