import type Phaser from 'phaser';
import { transition } from './Motion';

/**
 * Where "back" goes from each scene.
 *
 * The on-screen back arrow already knows its target, so rather than keeping a second copy
 * of the map, `addBackButton` records it here and Android's hardware back button asks the
 * same question. One source of truth means the two buttons can never disagree.
 */
const targets = new WeakMap<Phaser.Scene, string>();

export function setBackTarget(scene: Phaser.Scene, target: string): void {
  targets.set(scene, target);
}

export function backTargetOf(scene: Phaser.Scene): string | null {
  return targets.get(scene) ?? null;
}

export type BackResult = 'moved' | 'busy' | 'exit';

/**
 * What the hardware back button should do right now.
 *
 * - `moved`: the active scene has somewhere to go back to.
 * - `exit`: we are on the title screen, so back means leave the app.
 *
 * `busy` is kept for a scene that is mid-transition; nothing raises it yet.
 */
export function goBack(game: Phaser.Game): BackResult {
  const active = game.scene.getScenes(true);

  for (const scene of active) {
    const target = backTargetOf(scene);
    if (target) {
      transition(scene, target, 180);
      return 'moved';
    }
  }
  return 'exit';
}
