import Phaser from 'phaser';

/**
 * Bakes a container of static scenery into a single texture.
 *
 * Phaser's `Graphics` is not a cached display object: the WebGL renderer walks and
 * re-tessellates the whole command list of every Graphics object on **every frame**. The
 * outlined art style this game now uses roughly doubles that command count — every plate
 * is a fill plus a stroke, every flower petal a circle plus a ring — and strokes are the
 * expensive half, since each one is emitted as a quad per segment.
 *
 * Scenery that never changes has no business paying that cost repeatedly. Drawing it
 * once into a RenderTexture and throwing the vector objects away turns an unbounded pile
 * of per-frame geometry into one textured quad.
 *
 * The container is destroyed, so only pass scenery that is genuinely static — anything
 * tweening or redrawn must live in a layer that is not flattened.
 */
export function flatten(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  depth: number
): Phaser.GameObjects.RenderTexture {
  const { width, height } = scene.scale;

  const rt = scene.add.renderTexture(0, 0, width, height)
    .setOrigin(0, 0)
    .setDepth(depth);

  rt.draw(container);
  container.destroy(true);

  return rt;
}
