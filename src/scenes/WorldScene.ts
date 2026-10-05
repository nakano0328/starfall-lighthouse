import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '@/config';
import { evaluateCondition } from '@core/condition';
import { Flags } from '@core/flags';
import { GridMover } from '@core/grid/mover';
import { cameraScroll } from '@core/map/camera';
import { PLACEHOLDER_TILESET_NAME, compileMap } from '@core/map/compile';
import type { MapObject, NpcObject, WarpObject } from '@core/map/objects';
import { CollisionGrid, objectsAt, parseMapObjects } from '@core/map/objects';
import type { TiledMap } from '@core/map/tiled';
import type { SaveData } from '@core/save';
import { getMapSource } from '@data/maps';
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
  private collision!: CollisionGrid;
  private objects: MapObject[] = [];
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

    this.buildMap(this.save.location.map);
    const blockers = this.spawnObjects();
    this.collision = this.collision.withBlocked(blockers);

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
    const dir = this.input2.heldDirection();
    const dash = this.input2.isDown('dash');
    for (const event of this.mover.update(delta, dir, dash)) {
      if (event.type === 'step_end') this.onEnterTile(event.x, event.y);
      if (this.transitioning) break;
    }
    this.syncPlayerSprite();
    this.updateCamera();
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
    this.collision = CollisionGrid.fromMap(this.tiled);
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

  /**
   * Places a sprite for every visible map object and returns the tiles that
   * block movement (NPCs). Hidden NPCs neither render nor block.
   */
  private spawnObjects(): { x: number; y: number }[] {
    const blockers: { x: number; y: number }[] = [];
    for (const o of this.objects) {
      const x = tileCenter(o.tx);
      const y = tileCenter(o.ty);
      const depth = DEPTH.actors + o.ty / 1000;
      switch (o.kind) {
        case 'npc':
          if (!this.isNpcVisible(o)) break;
          this.add.image(x, y, 'sprite_npc', o.facing).setDepth(depth);
          blockers.push({ x: o.tx, y: o.ty });
          break;
        case 'chest':
          this.add
            .image(x, y, 'obj_chest', this.flags.has(o.flag) ? 'open' : 'closed')
            .setDepth(depth);
          blockers.push({ x: o.tx, y: o.ty });
          break;
        case 'sign':
          this.add.image(x, y, 'obj_sign').setDepth(depth);
          blockers.push({ x: o.tx, y: o.ty });
          break;
        case 'save_point':
          this.add.image(x, y, 'obj_save_point').setDepth(depth);
          blockers.push({ x: o.tx, y: o.ty });
          break;
        default:
          break; // warps, triggers and enemies have no static sprite
      }
    }
    return blockers;
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
