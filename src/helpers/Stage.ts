import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, MAX_STAGE_HEIGHT, MAX_STAGE_WIDTH } from '../config';

/**
 * The stage takes the screen's shape.
 *
 * GAME_WIDTH × GAME_HEIGHT is the smallest stage, not the only one. A phone held sideways is
 * about twice as wide as it is tall, and a fixed 1.6 stage scaled to fit it left a band of
 * empty sky down both sides; a tablet is squarer, and lost the same band top and bottom. So
 * the stage keeps its height and grows wider on anything wider than 1.6, or keeps its width
 * and grows taller on anything squarer — every scene lays itself out from `scale.width` and
 * `scale.height`, so a wider stage is simply more room. Past the caps it letterboxes rather
 * than stretch a scene into a strip.
 */
export function stageSize(
  parent: HTMLElement | null = document.getElementById('game-container')
): { width: number; height: number } {
  const w = parent?.clientWidth || window.innerWidth;
  const h = parent?.clientHeight || window.innerHeight;
  if (!w || !h) return { width: GAME_WIDTH, height: GAME_HEIGHT };

  const aspect = w / h;
  if (aspect >= GAME_WIDTH / GAME_HEIGHT) {
    return { width: Math.round(Math.min(GAME_HEIGHT * aspect, MAX_STAGE_WIDTH)), height: GAME_HEIGHT };
  }
  return { width: GAME_WIDTH, height: Math.round(Math.min(GAME_WIDTH / aspect, MAX_STAGE_HEIGHT)) };
}

/**
 * Keeps the stage matching the screen when it changes shape — a phone turned round, a
 * window resized, the Android system bars sliding away after launch.
 *
 * Scenes lay out once, in `create()`, so a new size means starting the scene that is up
 * again — with the same data, so the workshop stays on the same machine. Everything a scene
 * shows comes from GameState, so a restart loses nothing but a truck half-way to the hole.
 */
export function followScreen(game: Phaser.Game): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const relayout = () => {
    timer = null;
    const size = stageSize();
    const current = game.scale.gameSize;
    if (size.width === current.width && size.height === current.height) return;

    const active = game.scene.getScenes(true);
    if (active.some(s => s.scene.key === 'BootScene')) {
      timer = setTimeout(relayout, 500);
      return;
    }

    game.scale.setGameSize(size.width, size.height);
    for (const scene of active) scene.scene.restart();
  };

  window.addEventListener('resize', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(relayout, 200);
  });
}
