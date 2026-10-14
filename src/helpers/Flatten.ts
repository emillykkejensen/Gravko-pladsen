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

/** Widest a single baked texture gets; wider strips are baked in pieces. */
const CHUNK = 2048;

/**
 * Bakes static drawing that lies in world coordinates across a stretch wider than the
 * screen — the town's road, which the child slides along — in pieces no wider than a
 * texture can safely be. The pieces are added to `add` in place, so they scroll with the
 * camera like the drawing they replace.
 */
export function flattenWide(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width: number,
  depth: number,
  add: (rt: Phaser.GameObjects.RenderTexture) => void
): void {
  const height = scene.scale.height;
  for (let x = 0; x < width; x += CHUNK) {
    const w = Math.min(CHUNK, width - x);
    const rt = scene.add.renderTexture(x, 0, w, height).setOrigin(0, 0).setDepth(depth);
    rt.draw(container, -x, 0);
    add(rt);
  }
  container.destroy(true);
}
