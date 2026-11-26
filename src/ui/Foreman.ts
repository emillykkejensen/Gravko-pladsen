import Phaser from 'phaser';
import { COLORS, INK, INK_SOFT, LINE, SIZE, text } from '../config';
import { drawPerson, plate, shadow } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';

type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

/**
 * Bas, the foreman: the one grown-up on the building site.
 *
 * The site used to be machines and nobody else. He turns up when a job is done — a stage
 * finished, a machine built — to say well done and to say *why* that job mattered: the gravel
 * is there so the house does not sink, the piles hold it where the ground is soft. It is the
 * one place the game explains how a house really goes up, said by a person rather than
 * printed on a sign.
 *
 * He never asks for anything and never has to be tapped; he stands beside the big button the
 * job left behind.
 */

/** What he says when a stage is done, by stage id: well done, and what it was for. */
export const STAGE_TALK: Record<string, string> = {
  riv: 'Det gamle skur er væk. Nu er der plads til det nye hus!',
  sten: 'Stenene er væk, så maskinerne kan komme til.',
  planer: 'Jorden er flad. Et hus skal stå på flad jord!',
  pael: 'Pælene holder huset, hvor jorden er blød.',
  grav: 'Hullet er gravet. Nu skal der grus i bunden!',
  grus: 'Gruset gør bunden fast, så huset ikke synker.',
  tromle: 'Nu er gruset trykket hårdt og fast.',
  stoeb: 'Betonen bliver hård som sten. Det er husets fundament!',
  vinduer: 'Vinduerne er sat i. Nu kan solen skinne ind!',
  asfalt: 'Asfalten bliver hård, når den bliver kold.',
};

/** What he says first. Rotated, so it is not the same words every time. */
const CHEERS = ['Godt arbejde!', 'Flot klaret!', 'Sådan, makker!', 'Super godt!', 'Det var flot!'];

/** The foreman, standing with his feet on the origin: hi-vis vest and a yellow hard hat. */
export function drawForeman(scene: Phaser.Scene, scale = 1): Phaser.GameObjects.Container {
  const s = scale;
  const c = scene.add.container(0, 0);
  // drawPerson's feet are 38 below its origin
  const body = drawPerson(scene, 0, -38 * s, COLORS.orange, s);
  const kit = scene.add.graphics().setPosition(0, -38 * s);
  // reflective stripes across the vest
  kit.fillStyle(COLORS.white, 0.85);
  kit.fillRect(-16 * s, 6 * s, 32 * s, 3.5 * s);
  kit.fillRect(-16 * s, 15 * s, 32 * s, 3.5 * s);
  // the hard hat: a dome with a brim, and a ridge down the middle
  kit.fillStyle(COLORS.machineDeep);
  kit.slice(0, -27 * s, 16 * s, Math.PI, Math.PI * 2, false);
  kit.fillPath();
  kit.fillStyle(COLORS.machine);
  kit.slice(0, -28 * s, 15 * s, Math.PI, Math.PI * 2, false);
  kit.fillPath();
  kit.lineStyle(LINE.base * s, COLORS.outline, 0.9);
  kit.beginPath();
  kit.arc(0, -28 * s, 15 * s, Math.PI, Math.PI * 2, false);
  kit.strokePath();
  kit.fillStyle(COLORS.machine);
  kit.fillRoundedRect(-20 * s, -30 * s, 40 * s, 5 * s, 2 * s);
  kit.strokeRoundedRect(-20 * s, -30 * s, 40 * s, 5 * s, 2 * s);
  kit.fillStyle(COLORS.machineLight);
  kit.fillRect(-2.5 * s, -42 * s, 5 * s, 12 * s);
  kit.fillStyle(COLORS.white, 0.5);
  kit.fillEllipse(-6 * s, -37 * s, 8 * s, 4 * s);
  c.add([body, kit]);
  return c;
}

/**
 * A speech bubble that stays: a plate with a tail pointing down at whoever is talking, at
 * (tailX, tailY). A heading in bold if there is one, then the words.
 */
function bubble(
  scene: Phaser.Scene, tailX: number, tailY: number, head: string, body: string, width: number, lean: number
): Phaser.GameObjects.Container {
  const c = scene.add.container(tailX, tailY);
  const pad = 14;
  const h1 = scene.add.text(0, 0, head, text(SIZE.body + 1, INK, 'bold')).setOrigin(0.5, 0);
  const t = scene.add.text(0, h1.height + 2, body,
    { ...text(SIZE.label, INK_SOFT, 'semibold'), wordWrap: { width: width - pad * 2 }, align: 'center' }).setOrigin(0.5, 0);
  const w = Math.max(width * 0.5, Math.min(width, Math.max(h1.width, t.width) + pad * 2));
  const h = h1.height + t.height + pad * 2 - 2;
  // the bubble sits above the tail, shifted along by `lean` so it clears the button
  const bx = lean - w / 2;
  const by = -14 - h;
  const g = scene.add.graphics();
  shadow(g, bx, by, w, h, 14, 4, 0.18);
  g.fillStyle(COLORS.white);
  g.fillTriangle(-8, -16, 8, -16, 0, 0);
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.lineBetween(-8, -15, 0, 0);
  g.lineBetween(0, 0, 8, -15);
  plate(g, bx, by, w, h, 14, COLORS.white, 1, LINE.base);
  g.fillStyle(COLORS.white);
  g.fillRect(-7, -17, 14, 4);
  h1.setPosition(lean, by + pad - 2);
  t.setPosition(lean, by + pad + h1.height);
  c.add([g, h1, t]);
  return c;
}

/**
 * The foreman pops up at (x, feetY), gives a whistle, and says his piece in a bubble over his
 * head. `head` is the bold first line; leave it out for a cheer. Everything goes through `add`,
 * so it belongs to the scene's dynamic layer and goes when the scene redraws.
 */
export function foremanSays(
  scene: Phaser.Scene, add: Add,
  x: number, feetY: number,
  words: string, head?: string,
  opts: { scale?: number; width?: number; lean?: number; delay?: number } = {}
): Phaser.GameObjects.Container {
  const scale = opts.scale ?? 1.05;
  const c = add(scene.add.container(x, feetY)).setName('foreman');
  const man = drawForeman(scene, scale);
  const say = bubble(scene, 0, -84 * scale, head ?? Phaser.Utils.Array.GetRandom(CHEERS), words,
    opts.width ?? 250, opts.lean ?? 0);
  c.add([man, say]);

  const delay = opts.delay ?? 450;
  if (reduceMotion()) {
    audio.whistle();
    return c;
  }
  // up out of the ground, a whistle and two hops for joy
  man.setY(30).setAlpha(0);
  say.setScale(0).setAlpha(0);
  scene.tweens.add({ targets: man, y: 0, alpha: 1, duration: 260, delay, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: man, y: -14, duration: 150, yoyo: true, repeat: 1, delay: delay + 320, ease: 'Quad.easeOut',
  });
  scene.tweens.add({ targets: say, scale: 1, alpha: 1, duration: 280, delay: delay + 200, ease: 'Back.easeOut' });
  scene.time.delayedCall(delay + 180, () => audio.whistle());
  return c;
}
