import Phaser from 'phaser';
import { COLORS, DEPTH } from '../config';
import { drawPerson } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showHearts, showToast } from './FeedbackEffects';

/**
 * The people who live in the town.
 *
 * A town of finished buildings with nobody in it was a picture of a town. Now every house that
 * moves in brings a family, who walk up the pavement and in at the front door; the people who
 * already live there stroll up and down in front of their homes; and any of them says hello
 * when tapped. They are the reason a house is worth building.
 *
 * Everybody is drawn by `drawPerson` (helpers/Draw), the same figure Sommer Hotellet's guests
 * are, small enough to stand on the town's pavement.
 */

/** How big a grown-up is in the town, next to houses drawn at 0.42. */
export const PERSON_SCALE = 0.36;
/** And a child. */
export const CHILD_SCALE = 0.27;

/** Clothes. Bright, so a person reads against the walls behind them. */
const CLOTHES = [COLORS.red, COLORS.blue, COLORS.green, COLORS.purple, COLORS.teal, COLORS.orange, COLORS.pink];

/** What people say when tapped. Warm, short, and about the town the child built. */
export const GREETINGS = [
  'Hej!', 'Hej med dig!', 'Tak for mit hus!', 'Hvor er her dejligt!', 'Godt bygget!',
  'Jeg elsker min by!', 'Se, hvor flot!', 'Kom på besøg!',
];

/** Somebody's clothes, picked by a number so the same plot always has the same people. */
export function clothes(n: number): number {
  return CLOTHES[((n % CLOTHES.length) + CLOTHES.length) % CLOTHES.length];
}

/** A person standing with their feet on `y`. */
export function townsperson(
  scene: Phaser.Scene, x: number, feetY: number, color: number, scale = PERSON_SCALE
): Phaser.GameObjects.Container {
  // drawPerson's feet are 38 below its origin
  const c = scene.add.container(x, feetY);
  const body = drawPerson(scene, 0, -38 * scale, color, scale);
  body.setData('restY', body.y);
  c.add(body);
  return c;
}

/**
 * Walks a person up and down between two points, turning round at each end, with a little
 * bounce in their step. Stands still with reduced motion.
 */
export function stroll(
  scene: Phaser.Scene, c: Phaser.GameObjects.Container, from: number, to: number, speed: number, delay = 0
): void {
  if (reduceMotion()) return;
  const body = c.list[0] as Phaser.GameObjects.Container;
  c.setX(from);
  const face = (dir: number) => body.setScale(dir, 1);
  face(to > from ? 1 : -1);
  scene.tweens.add({
    targets: c, x: to, duration: (Math.abs(to - from) / speed) * 1000, delay,
    yoyo: true, repeat: -1, hold: 1400, repeatDelay: 1800, ease: 'Sine.easeInOut',
    onYoyo: () => face(to > from ? -1 : 1),
    onRepeat: () => face(to > from ? 1 : -1),
  });
  body.setData('walks', true);
  bounce(scene, body, delay);
}

/** The little up-and-down of somebody walking. */
function bounce(scene: Phaser.Scene, body: Phaser.GameObjects.Container, delay = 0): void {
  scene.tweens.add({ targets: body, y: body.getData('restY') - 2.5, duration: 180, yoyo: true, repeat: -1, delay });
}

/**
 * Says hello: a hop, a few hearts and a line in a speech bubble. The hop is on the figure
 * inside the container, so it never fights the walking tween.
 */
export function greet(scene: Phaser.Scene, c: Phaser.GameObjects.Container, line?: string): void {
  const body = c.list[0] as Phaser.GameObjects.Container;
  const say = line ?? Phaser.Utils.Array.GetRandom(GREETINGS);
  audio.hello();
  showToast(scene, c.x, c.y - 52, say);
  if (reduceMotion()) return;
  const y = body.getData('restY') as number;
  scene.tweens.killTweensOf(body);
  body.setY(y);
  scene.tweens.add({
    targets: body, y: y - 16, duration: 170, yoyo: true, repeat: 1, ease: 'Quad.easeOut',
    onComplete: () => {
      if (body.active && body.getData('walks')) bounce(scene, body);
    },
  });
  showHearts(scene, c.x, c.y - 30);
}

/**
 * A family moving in: they come walking up the pavement from the left, one behind the other,
 * to the front door, and go in. Hearts over the house when the last one is inside.
 *
 * With reduced motion there is no walk: just the hearts.
 */
export function moveIn(
  scene: Phaser.Scene, doorX: number, feetY: number, seed: number, onInside?: () => void
): void {
  if (reduceMotion()) {
    showHearts(scene, doorX, feetY - 50);
    onInside?.();
    return;
  }
  const family = [
    { color: clothes(seed), scale: PERSON_SCALE },
    { color: clothes(seed + 3), scale: PERSON_SCALE },
    { color: clothes(seed + 5), scale: CHILD_SCALE },
  ];
  family.forEach((m, i) => {
    const p = townsperson(scene, doorX - 130 - i * 22, feetY, m.color, m.scale).setDepth(DEPTH.effects - 1);
    const body = p.list[0] as Phaser.GameObjects.Container;
    scene.tweens.add({ targets: body, y: body.y - 2.5, duration: 160, yoyo: true, repeat: 7 + i });
    scene.tweens.chain({
      targets: p,
      tweens: [
        { x: doorX, duration: 1300 + i * 260, delay: 500, ease: 'Sine.easeOut' },
        // in at the door: smaller and gone
        { scale: 0.5, alpha: 0, y: feetY - 4, duration: 260 },
      ],
      onComplete: () => {
        p.destroy();
        if (i === family.length - 1) {
          audio.door();
          showHearts(scene, doorX, feetY - 60);
          onInside?.();
        }
      },
    });
  });
}

/**
 * Somebody comes out of the front door to see who knocked: pops out, says hello, and goes
 * back in.
 */
export function answerDoor(scene: Phaser.Scene, doorX: number, feetY: number, seed: number, line: string): void {
  const p = townsperson(scene, doorX, feetY, clothes(seed)).setDepth(DEPTH.effects - 1);
  if (reduceMotion()) {
    greet(scene, p, line);
    scene.time.delayedCall(1200, () => p.destroy());
    return;
  }
  p.setScale(0.3).setAlpha(0);
  scene.tweens.chain({
    targets: p,
    tweens: [
      { scale: 1, alpha: 1, x: doorX + 12, duration: 240, ease: 'Back.easeOut' },
      { x: doorX + 12, duration: 1500 },
      { scale: 0.4, alpha: 0, x: doorX, duration: 240 },
    ],
    onComplete: () => p.destroy(),
  });
  scene.time.delayedCall(240, () => {
    if (p.active) greet(scene, p, line);
  });
}
