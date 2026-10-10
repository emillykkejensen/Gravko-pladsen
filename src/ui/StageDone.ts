import type Phaser from 'phaser';
import { COLORS, SIZE } from '../config';
import { button } from '../helpers/Draw';
import { popIn } from '../helpers/Motion';
import { nextRoute } from '../helpers/Route';
import { transition } from '../helpers/Motion';

/**
 * The button a finished stage leaves behind. It goes straight to the next thing to do —
 * usually the workshop, to build the machine the next stage needs — so a child who just
 * follows the big green button walks the whole game in order.
 */
export function stageDoneButton(
  scene: Phaser.Scene,
  add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  x = scene.scale.width / 2,
  y = scene.scale.height - 50
): Phaser.GameObjects.Container {
  const go = button(scene, x, y, 'Videre!', COLORS.green, () => {
    const route = nextRoute();
    transition(scene, route.scene, 220, route.data);
  }, 220, 58, SIZE.heading);
  go.setName('go');
  add(go);
  popIn(scene, go, 200, 0.5);
  return go;
}
