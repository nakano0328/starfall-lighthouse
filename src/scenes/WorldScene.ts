import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '@/config';
import type { SaveData } from '@core/save';
import { InputBindings } from '@ui/InputBindings';

import { SceneKey } from './keys';

export interface WorldSceneData {
  /** The run being played; location/flags are read from and written back to it. */
  save: SaveData;
}

/**
 * Field scene. Phase 2 skeleton: draws a placeholder ground, puts the player at the
 * save location and fades in. Map loading (#5), movement (#6), dialog (#7) and
 * interactions (#8) are layered onto this scene by the following tasks.
 */
export class WorldScene extends Phaser.Scene {
  private save!: SaveData;
  private input2!: InputBindings;
  private player!: Phaser.GameObjects.Image;

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

    const cols = Math.ceil(GAME_WIDTH / TILE_SIZE) + 2;
    const rows = Math.ceil(GAME_HEIGHT / TILE_SIZE) + 2;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const frame = (x + y) % 7 === 0 ? 'grass_dark' : 'grass';
        this.add.image(x * TILE_SIZE, y * TILE_SIZE, 'ts_placeholder', frame).setOrigin(0);
      }
    }

    const { x, y, facing } = this.save.location;
    this.player = this.add
      .image(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 'sprite_player', facing)
      .setDepth(10);
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.add
      .text(8, 8, `${this.save.location.map}  (${x}, ${y})`, {
        fontFamily: 'sans-serif',
        fontSize: '12px',
        color: COLORS.textDim,
      })
      .setScrollFactor(0)
      .setDepth(100);

    this.cameras.main.fadeIn(300, 0, 0, 0);

    if (window.__starfall) window.__starfall.scene = SceneKey.World;
  }

  override update(): void {
    // Temporary until the pause menu exists (#9): X / Esc returns to the title.
    if (this.input2.justPressed('cancel')) {
      this.scene.start(SceneKey.Title);
    }
  }
}
