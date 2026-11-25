import type Phaser from 'phaser';
import { BUTTON_FLOOR, COLORS, SIZE } from '../config';
import { button } from '../helpers/Draw';
import { popIn } from '../helpers/Motion';
import { nextRoute } from '../helpers/Route';
import { transition } from '../helpers/Motion';
import { gameState } from '../state/GameState';
import { STAGE_TALK, foremanSays } from './Foreman';

/**
 * The button a finished stage leaves behind. It goes straight to the next thing to do —
 * usually the workshop, to build the machine the next stage needs — so a child who just
 * follows the big green button walks the whole game in order.
 */
export function stageDoneButton(
  scene: Phaser.Scene,
  add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
  x = scene.scale.width / 2,
  y = scene.scale.height - BUTTON_FLOOR
): Phaser.GameObjects.Container {
  const go = button(scene, x, y, 'Videre!', COLORS.green, () => {
    const route = nextRoute();
    transition(scene, route.scene, 220, route.data);
  }, 220, 58, SIZE.heading);
  go.setName('go');
  add(go);
  popIn(scene, go, 200, 0.5);

  // The foreman comes to say well done, and what the job was for. The stage just finished is
  // the one before the site's current one: the scene has already moved the site on.
  const done = gameState.stages[gameState.site.stage - 1];
  const talk = done && STAGE_TALK[done.id];
  if (talk) {
    const fx = Math.max(60, x - 190);
    foremanSays(scene, add, fx, y + 34, talk, undefined, { lean: Math.min(60, fx - 40) - 30 });
  }
  return go;
}
