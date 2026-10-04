import Phaser from 'phaser';
import { COLORS, DEPTH, INK, INK_SOFT, LINE, rankFor, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { drawStarShape, plate, ribbon, shade, shadow, sheen } from '../helpers/Draw';
import { bob, reduceMotion, transition } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { setBackTarget } from '../helpers/Navigation';
import { flyStarsToCounter, setStarTarget, showRankUp } from '../objects/FeedbackEffects';

/**
 * Screen chrome: back, stars, sound, title.
 *
 * All four used to be flat white pills, which is what made every screen read as a form
 * with a picture on it. They are now built from the same chunky, outlined vocabulary as
 * the rest of the game, and the star counter has been promoted from a number in a
 * corner to the thing the child is actually working towards.
 */

/**
 * Back arrow, top left.
 *
 * `word` exists because the town's back arrow goes to the title screen rather than up a
 * level, and "Tilbage" there would be a lie.
 */
export function addBackButton(
  scene: Phaser.Scene,
  target = 'TownScene',
  word = 'Tilbage'
): Phaser.GameObjects.Container {
  // Android's hardware back button reads this, so the two buttons cannot drift apart.
  setBackTarget(scene, target);

  const label = scene.add.text(0, 0, word, text(SIZE.label, '#FFFFFF', 'bold')).setOrigin(0, 0.5);
  label.setShadow(0, 1.5, 'rgba(74,58,44,0.5)', 0, false, true);

  // Sized from the measured label, so the word never spills past the pill or collides
  // with the arrow the way a hardcoded width did.
  const arrowW = 22;
  const padding = 13;
  const w = padding + arrowW + label.width + padding;
  const h = 40;
  const lip = 5;

  const c = scene.add.container(padding + w / 2, 38).setDepth(DEPTH.chrome).setScrollFactor(0);

  const base = scene.add.graphics();
  shadow(base, -w / 2, -h / 2, w, h + lip, h / 2, 3, 0.2);
  plate(base, -w / 2, -h / 2 + lip, w, h, h / 2, shade(COLORS.orange, -0.3), 1, LINE.base);

  const face = scene.add.container(0, 0);
  const g = scene.add.graphics();
  plate(g, -w / 2, -h / 2, w, h, h / 2, COLORS.orange, 1, LINE.base);
  sheen(g, -w / 2, -h / 2, w, h, h / 2, 0.26);

  const ax = -w / 2 + padding;
  const arrow = scene.add.graphics();
  arrow.lineStyle(3.5, COLORS.white, 1);
  arrow.beginPath();
  arrow.moveTo(ax + 8, -5.5);
  arrow.lineTo(ax + 1, 0);
  arrow.lineTo(ax + 8, 5.5);
  arrow.strokePath();
  arrow.beginPath();
  arrow.moveTo(ax + 1, 0);
  arrow.lineTo(ax + arrowW - 4, 0);
  arrow.strokePath();

  label.setPosition(ax + arrowW, 0);
  face.add([g, arrow, label]);

  c.add([base, face]);
  c.setSize(w, h + lip);
  c.setInteractive({ useHandCursor: true });

  if (!reduceMotion()) {
    c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.06, duration: 120 }));
    c.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 120 }));
  }
  c.on('pointerdown', () => {
    audio.tap();
    if (reduceMotion()) {
      transition(scene, target, 180);
      return;
    }
    scene.tweens.add({
      targets: face,
      y: lip,
      duration: 70,
      yoyo: true,
      onComplete: () => transition(scene, target, 180),
    });
  });

  return c;
}

/**
 * Star counter, top right.
 *
 * Now a badge rather than a number: a gold star, the count, the child's current rank,
 * and a bar filling towards the next one. Stars accumulated into nothing before, so the
 * counter had nothing to say beyond "some things happened".
 *
 * The listener is removed on shutdown. Phaser does not clear user listeners off
 * scene.events itself, so the previous version left a closure from every past scene
 * generation writing to a destroyed Text object — which crashed the WebGL renderer.
 */
export function addStarCounter(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const w = 212;
  const h = 58;
  const c = scene.add.container(scene.scale.width - 118, 42)
    .setDepth(DEPTH.chrome)
    .setScrollFactor(0);

  const g = scene.add.graphics();
  shadow(g, -w / 2, -h / 2, w, h, 18, 4, 0.2);
  plate(g, -w / 2, -h / 2, w, h, 18, COLORS.cream, 0.97, LINE.base);
  sheen(g, -w / 2, -h / 2, w, h, 16, 0.5);
  c.add(g);

  const starHolder = scene.add.container(-w / 2 + 30, 0);
  const star = scene.add.graphics();
  drawStarShape(star, 0, 0, 19);
  starHolder.add(star);
  c.add(starHolder);

  const count = scene.add.text(-w / 2 + 54, 0, `${gameState.stars}`, text(SIZE.title - 2, INK, 'bold'))
    .setOrigin(0, 0.5);
  c.add(count);

  const info = rankFor(gameState.stars);
  const rankLabel = scene.add.text(-2, -12, info.name, text(SIZE.tiny, INK_SOFT, 'bold'))
    .setOrigin(0, 0.5);
  c.add(rankLabel);

  // The bar is redrawn in place rather than rebuilt, so a star earned mid-scene animates
  // instead of popping to its new width.
  const barW = 100;
  const barH = 11;
  const barX = 46;
  const barY = 12;
  const barFill = scene.add.graphics();
  const barFrame = scene.add.graphics();
  plate(barFrame, barX - barW / 2, barY - barH / 2, barW, barH, barH / 2, COLORS.white, 0.9, LINE.hair);
  c.add([barFrame, barFill]);

  const drawBar = (fraction: number) => {
    barFill.clear();
    if (fraction <= 0) return;
    const fw = Math.max(barH, barW * fraction);
    const x = barX - barW / 2;
    const y = barY - barH / 2;
    barFill.fillStyle(shade(COLORS.sun, -0.25));
    barFill.fillRoundedRect(x, y, fw, barH, barH / 2);
    barFill.fillStyle(COLORS.sun);
    barFill.fillRoundedRect(x, y, fw, barH - 2.5, barH / 2);
    barFill.lineStyle(LINE.hair, COLORS.outline, 0.8);
    barFill.strokeRoundedRect(x, y, fw, barH, barH / 2);
  };
  drawBar(info.progress);

  // Register where earned stars should fly to.
  setStarTarget(scene, c.x + starHolder.x, c.y);

  const onChange = (value: number) => {
    if (!count.active) return;
    count.setText(`${value}`);
    const next = rankFor(value);
    rankLabel.setText(next.name);

    if (reduceMotion()) {
      drawBar(next.progress);
      return;
    }

    // Tween a plain object and redraw from it — Graphics has no width to tween.
    const state = { p: 0 };
    const current = next.progress;
    scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 420,
      ease: 'Cubic.easeOut',
      onUpdate: tween => {
        state.p = tween.getValue() ?? 0;
        drawBar(current * (state.p / 100));
      },
    });

    scene.tweens.add({ targets: c, scale: 1.1, duration: 150, yoyo: true, ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: starHolder, angle: starHolder.angle + 360, duration: 520, ease: 'Cubic.easeOut' });
  };

  scene.events.on('starsChanged', onChange);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off('starsChanged', onChange));

  return c;
}

/**
 * Grants stars, plays the counter animation, and keeps the two concerns separate.
 *
 * Pass the position the star was earned at and it flies from there to the counter,
 * which is what connects the reward to the thing that produced it.
 */
export function award(scene: Phaser.Scene, count = 1, x?: number, y?: number): void {
  const before = rankFor(gameState.stars).index;
  gameState.addStars(count);
  const after = rankFor(gameState.stars);

  scene.events.emit('starsChanged', gameState.stars);
  audio.star(count);

  if (x !== undefined && y !== undefined) {
    flyStarsToCounter(scene, x, y, Math.min(count, 3));
  }

  if (after.index > before) {
    // Let the counter finish its bump before the screen is taken over.
    scene.time.delayedCall(420, () => showRankUp(scene, after.name));
  }
}

/**
 * Centred scene title, on a hanging ribbon.
 *
 * Outdoor scenes get a coloured banner keyed to the place; interiors can pass their own
 * colour. Bare outlined text over the sky was the single biggest reason the old screens
 * read as slides rather than rooms.
 *
 * The ribbon shrinks to fit the gap between the back button and the star counter, so a
 * long title never grows its banner into either of them.
 */
export function addSceneTitle(
  scene: Phaser.Scene,
  label: string,
  color: number = COLORS.roof,
  y = 34
): Phaser.GameObjects.Container {
  const c = ribbon(scene, scene.scale.width / 2, y, label, color);
  c.setDepth(DEPTH.chrome);

  const maxWidth = TITLE_MAX_WIDTH;
  if (c.width > maxWidth) c.setScale(maxWidth / c.width);

  bob(scene, c, 3, 2600);
  return c;
}

/**
 * How wide a scene title may be: the band between the back button (which ends at x≈150)
 * and the star counter (which starts at x≈656), with a little margin.
 */
const TITLE_MAX_WIDTH = 470;
