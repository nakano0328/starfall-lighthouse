import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '@/config';
import { evaluateCondition } from '@core/condition';
import { Flags } from '@core/flags';
import { cameraScroll } from '@core/map/camera';
import { PLACEHOLDER_TILESET_NAME, compileMap } from '@core/map/compile';
import type { MapObject, NpcObject } from '@core/map/objects';
import { CollisionGrid, parseMapObjects } from '@core/map/objects';
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

/**
 * Field scene. Compiles the authored map for the save location into Tiled JSON,
 * renders its layers, places map objects and the player, and keeps the camera on
 * the player. Movement (#6), dialog (#7) and interactions (#8) build on this.
 */
export class WorldScene extends Phaser.Scene {
  private save!: SaveData;
  private input2!: InputBindings;
  private player!: Phaser.GameObjects.Image;
  private tiled!: TiledMap;
  private collision!: CollisionGrid;
  private objects: MapObject[] = [];
  private mapPixelWidth = 0;
  private mapPixelHeight = 0;

  constructor() {
    super(SceneKey.World);
  }

  init(data: WorldSceneData): void {
    this.save = data.save;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.night);
    this.input2 = new InputBindings(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input2.destroy());

    this.buildMap(this.save.location.map);
    this.spawnObjects();

    const { x, y, facing } = this.save.location;
    this.player = this.add
      .image(tileCenter(x), tileCenter(y), 'sprite_player', facing)
      .setDepth(DEPTH.actors + y / 1000);

    this.updateCamera();
    this.add
      .text(8, 8, `${this.save.location.map}  (${x}, ${y})`, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.hud);

    this.cameras.main.fadeIn(300, 0, 0, 0);
    if (window.__starfall) window.__starfall.scene = SceneKey.World;
  }

  override update(): void {
    // Temporary until the pause menu exists (#9): X / Esc returns to the title.
    if (this.input2.justPressed('cancel')) {
      this.scene.start(SceneKey.Title);
    }
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
   * Places a sprite for every visible map object (NPCs, chests, signs, save points).
   * NPCs gated by `hidden_if` / `condition` (docs/GAME_DESIGN.md §9.3) get no sprite while
   * the save flags hide them; `this.objects` keeps them so visibility can be re-evaluated
   * when flags change (#7/#8).
   */
  private spawnObjects(): void {
    const flags = new Flags(this.save.flags);
    for (const o of this.objects) {
      const x = tileCenter(o.tx);
      const y = tileCenter(o.ty);
      const depth = DEPTH.actors + o.ty / 1000;
      switch (o.kind) {
        case 'npc':
          if (!isNpcVisible(o, flags)) break;
          this.add.image(x, y, 'sprite_npc', o.facing).setDepth(depth);
          break;
        case 'chest':
          this.add.image(x, y, 'obj_chest', flags.has(o.flag) ? 'open' : 'closed').setDepth(depth);
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

/** An NPC is drawn unless its `hidden_if` holds or its `condition` fails (§9.3). */
function isNpcVisible(npc: NpcObject, flags: Flags): boolean {
  if (npc.hiddenIf !== undefined && evaluateCondition(npc.hiddenIf, flags)) return false;
  if (npc.condition !== undefined && !evaluateCondition(npc.condition, flags)) return false;
  return true;
}
