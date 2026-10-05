import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '@/config';
import { evaluateCondition } from '@core/condition';
import type { DialogStep } from '@core/dialog/runner';
import { DialogRunner } from '@core/dialog/runner';
import { formatDialogText } from '@core/dialog/text';
import { Flags } from '@core/flags';
import { FACING_DELTA, GridMover } from '@core/grid/mover';
import { cameraScroll } from '@core/map/camera';
import { PLACEHOLDER_TILESET_NAME, compileMap } from '@core/map/compile';
import type { MapObject, NpcObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, objectsAt, parseMapObjects } from '@core/map/objects';
import type { TiledMap } from '@core/map/tiled';
import type { SaveData } from '@core/save';
import type { Settings } from '@core/settings';
import { SETTINGS_KEY, TEXT_SPEED_MS, parseSettings } from '@core/settings';
import { DIALOGS } from '@data/dialogs';
import { getMapSource } from '@data/maps';
import { PARTY_NAMES } from '@data/names';
import type { Facing } from '@data/types';
import { DialogBox } from '@ui/DialogBox';
import { InputBindings } from '@ui/InputBindings';

import { SceneKey } from './keys';

export interface WorldSceneData {
  /** The run being played; location/flags are read from and written back to it. */
  save: SaveData;
}

/** Draw order: ground 0, deco 1, objects/actors 10 (+ y for sorting), above 20, HUD 100. */
const DEPTH = { ground: 0, deco: 1, actors: 10, above: 20, hud: 100 } as const;

/** Map transition fade (docs/GAME_DESIGN.md §9.2) and post-warp invulnerability. */
const WARP_FADE_MS = 250;
const WARP_SAFE_MS = 1000;

/**
 * Field scene. Compiles the authored map for the save location into Tiled JSON,
 * renders its layers, places map objects and the player, moves the player on the
 * grid, follows with the camera and handles warps. Dialog (#7) and interactions
 * (#8) build on this.
 */
export class WorldScene extends Phaser.Scene {
  private save!: SaveData;
  private flags!: Flags;
  private input2!: InputBindings;
  private player!: Phaser.GameObjects.Image;
  private mover!: GridMover;
  private hud!: Phaser.GameObjects.Text;
  private tiled!: TiledMap;
  private baseCollision!: CollisionGrid;
  private collision!: CollisionGrid;
  private objects: MapObject[] = [];
  private readonly npcs = new Map<string, { obj: NpcObject; image: Phaser.GameObjects.Image }>();
  private talkingTo: { obj: NpcObject; image: Phaser.GameObjects.Image } | null = null;
  private settings!: Settings;
  private runner!: DialogRunner;
  private dialogBox!: DialogBox;
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;
  private transitioning = false;
  /** Enemies may not engage the player before this time (scene time, ms). */
  private safeUntil = 0;

  constructor() {
    super(SceneKey.World);
  }

  init(data: WorldSceneData): void {
    this.save = data.save;
    this.flags = Flags.wrap(this.save.flags);
    this.transitioning = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.night);
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    this.settings = parseSettings(readStorage(SETTINGS_KEY));
    this.npcs.clear();
    this.talkingTo = null;
    this.buildMap(this.save.location.map);
    this.spawnObjects();
    this.refreshNpcs();

    this.runner = new DialogRunner(DIALOGS, {
      flags: this.flags,
      // give_item / take_item / play_se / heal_party arrive with the inventory work (#8).
      applyEffect: () => undefined,
      format: (text) =>
        formatDialogText(text, { names: PARTY_NAMES, gold: 0, itemName: () => undefined }),
    });
    this.dialogBox = new DialogBox(this, TEXT_SPEED_MS[this.settings.textSpeed], {
      onAdvance: () => this.applyDialogStep(this.runner.advance()),
      onChoose: (index) => this.applyDialogStep(this.runner.choose(index)),
    });
    this.dialogBox.setDepth(DEPTH.hud);

    const { x, y, facing } = this.save.location;
    this.mover = new GridMover({ x, y, facing }, (tx, ty) => this.collision.isBlocked(tx, ty));
    this.player = this.add.image(0, 0, 'sprite_player', facing);
    this.hud = this.add
      .text(8, 8, '', { fontFamily: 'sans-serif', fontSize: '12px', color: COLORS.textDim })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);
    this.syncPlayerSprite();
    this.updateCamera();

    this.safeUntil = this.time.now + WARP_SAFE_MS;
    this.cameras.main.fadeIn(WARP_FADE_MS, 0, 0, 0);
    if (window.__starfall) window.__starfall.scene = SceneKey.World;
  }

  override update(_time: number, delta: number): void {
    if (this.transitioning) return;
    // Temporary until the pause menu exists (#9): X / Esc returns to the title.
    if (this.input2.justPressed('cancel')) {
      this.scene.start(SceneKey.Title);
      return;
    }
    if (this.dialogBox.isOpen) {
      this.dialogBox.update(this.input2, delta);
      this.mover.update(delta, null, false);
      this.syncPlayerSprite();
      return;
    }
    if (this.input2.justPressed('confirm') && !this.mover.isMoving) {
      this.interact();
      if (this.dialogBox.isOpen) return;
    }
    const dir = this.input2.heldDirection();
    const dash = this.input2.isDown('dash');
    for (const event of this.mover.update(delta, dir, dash)) {
      if (event.type === 'turn')
        this.save.location = { ...this.save.location, facing: event.facing };
      if (event.type === 'step_end') this.onEnterTile(event.x, event.y);
      if (this.transitioning) break;
    }
    this.syncPlayerSprite();
    this.updateCamera();
  }

  /** True while a conversation window is open (e2e/debug). */
  get isDialogOpen(): boolean {
    return this.dialogBox.isOpen;
  }

  /** True while the player is between tiles (e2e/debug). */
  get isMoving(): boolean {
    return this.mover.isMoving;
  }

  /** Logical player tile: the destination while a step is in progress (e2e/debug). */
  get playerTile(): { x: number; y: number; facing: Facing } {
    return this.mover.position;
  }

  /** Z on the field: acts on the object in front of the player (§9.2 priority). */
  private interact(): void {
    const { x, y, facing } = this.mover.position;
    const { dx, dy } = FACING_DELTA[facing];
    for (const target of objectsAt(this.objects, x + dx, y + dy)) {
      if (target.kind === 'npc') {
        const entry = this.npcs.get(target.id);
        if (!entry || !entry.image.visible) continue;
        entry.image.setFrame(opposite(facing));
        this.talkingTo = entry;
        this.startDialog(target.dialog);
        return;
      }
      if (target.kind === 'sign') {
        this.startDialog(target.textId);
        return;
      }
    }
  }

  private startDialog(id: string): void {
    this.input2.flush();
    this.applyDialogStep(this.runner.start(id));
  }

  private applyDialogStep(step: DialogStep): void {
    if (step.kind === 'page') {
      this.dialogBox.show(step);
      return;
    }
    this.dialogBox.close();
    if (this.talkingTo) {
      this.talkingTo.image.setFrame(this.talkingTo.obj.facing);
      this.talkingTo = null;
    }
    // Effects may have changed flags that hide/show NPCs.
    this.refreshNpcs();
  }

  /** True while the player is still protected after a map transition. */
  get isSafe(): boolean {
    return this.time.now < this.safeUntil;
  }

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
          });
          break;
        case 'chest':
          this.add
            .image(x, y, 'obj_chest', this.flags.has(o.flag) ? 'open' : 'closed')
            .setDepth(depth);
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
   * Applies hidden_if/condition to NPC sprites and rebuilds the collision grid:
   * visible NPCs, chests, signs and save points block movement; hidden NPCs do not.
   */
  private refreshNpcs(): void {
    const blockers: { x: number; y: number }[] = [];
    for (const o of this.objects) {
      if (o.kind === 'npc') {
        const entry = this.npcs.get(o.id);
        const visible = this.isNpcVisible(o);
        entry?.image.setVisible(visible);
        if (visible) blockers.push({ x: o.tx, y: o.ty });
      } else if (o.kind === 'chest' || o.kind === 'sign' || o.kind === 'save_point') {
        blockers.push({ x: o.tx, y: o.ty });
      }
    }
    this.collision = this.baseCollision.withBlocked(blockers);
  }

  private isNpcVisible(npc: NpcObject): boolean {
    if (npc.hiddenIf !== undefined && evaluateCondition(npc.hiddenIf, this.flags)) return false;
    if (npc.condition !== undefined && !evaluateCondition(npc.condition, this.flags)) return false;
    return true;
  }

  /** Called when a step lands on a tile: records the position and checks warps. */
  private onEnterTile(x: number, y: number): void {
    this.save.location = { ...this.save.location, x, y, facing: this.mover.position.facing };
    const warp = objectsAt(this.objects, x, y).find((o): o is WarpObject => o.kind === 'warp');
    // Locked doors (required_item) are opened by interacting with them (#8).
    if (warp && warp.requiredItem === undefined) this.startWarp(warp);
  }

  private startWarp(warp: WarpObject): void {
    this.transitioning = true;
    this.input2.flush();
    this.cameras.main.fadeOut(WARP_FADE_MS, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.save.location = {
        map: warp.targetMap,
        x: warp.targetX,
        y: warp.targetY,
        facing: warp.facing,
      };
      const data: WorldSceneData = { save: this.save };
      this.scene.restart(data);
    });
  }

  private syncPlayerSprite(): void {
    const rp = this.mover.renderPosition;
    const bob = this.mover.isMoving ? -Math.round(2 * Math.sin(this.mover.progress * Math.PI)) : 0;
    this.player
      .setPosition(rp.x * TILE_SIZE + TILE_SIZE / 2, rp.y * TILE_SIZE + TILE_SIZE / 2 + bob)
      .setFrame(this.mover.position.facing)
      .setDepth(DEPTH.actors + rp.y / 1000);
    const { x, y } = this.mover.position;
    this.hud.setText(`${this.save.location.map}  (${x}, ${y})`);
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
