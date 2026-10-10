import Phaser from 'phaser';
import { COLORS, LINE } from '../config';
import { bunting, drawTree, plate, shade } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { gameState } from '../state/GameState';
import { drawMachine, inLivery } from './MachineArt';

/**
 * The things a child can buy for their town in the star shop, and where each one goes.
 *
 * Every decoration has a place of its own that nothing else in the town uses — the sky, the
 * hills behind the houses, the road, the gaps on the pavement — so buying them all never
 * stacks one on another, and the houses and the signpost stay clear. Each is drawn by the
 * same function for the town and for its card in the shop.
 */

type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

/** Where the town's row of houses is: the shop's things find their places from it. */
export interface TownLayout {
  width: number;
  /** The pavement line the houses stand on. */
  plotY: number;
  /** The middle of each plot. */
  plotXs: number[];
  /** Middle of the road. */
  roadY: number;
}

const owns = (id: string) => gameState.owns(id);

/* ------------------------------------------------------------------ layers --- */

/** Behind the houses: bunting across the sky, trees and the golden excavator on the hills. */
export function townBehind(scene: Phaser.Scene, add: Add, t: TownLayout): void {
  if (owns('flag')) {
    add(bunting(scene, -10, t.plotY - 168, t.width + 10, t.plotY - 168, Math.round(t.width / 46), 12));
  }
  if (owns('traer')) {
    // in the gaps between plots, peeking over the roofs
    const gap = t.plotXs.length > 1 ? t.plotXs[1] - t.plotXs[0] : 108;
    for (let i = 0; i < t.plotXs.length - 1; i += 2) {
      add(drawTree(scene, t.plotXs[i] + gap / 2, t.plotY - 46, 0.85));
    }
  }
  if (owns('statue')) {
    add(statue(scene, t.width * 0.5, t.plotY - 70, true));
  }
}

/** Things that move: the wind turbine, the balloon, the fireworks and the bus. */
export function townAmbient(scene: Phaser.Scene, add: Add, t: TownLayout): void {
  if (owns('moelle')) add(windmill(scene, t.width * 0.28, t.plotY - 30, true)).setName('deco:moelle');
  if (owns('ballon')) add(balloon(scene, t.width * 0.72, t.plotY - 150, true)).setName('deco:ballon');
  if (owns('fyrvaerkeri')) fireworks(scene, add, t);
  if (owns('bus')) add(bus(scene, t.roadY, t.width, true)).setName('deco:bus');
}

/** In front of the houses: the street lamps, in the gaps on the pavement. */
export function townFront(scene: Phaser.Scene, add: Add, t: TownLayout): void {
  if (!owns('lygter')) return;
  const g = scene.add.graphics();
  const gap = t.plotXs.length > 1 ? t.plotXs[1] - t.plotXs[0] : 108;
  for (let i = 0; i < t.plotXs.length - 1; i += 2) {
    paintLamp(g, t.plotXs[i + 1] + gap / 2, t.plotY + 16);
  }
  add(g);
}

/** The thing itself, sized for a card in the shop. */
export function decorationPreview(scene: Phaser.Scene, id: string): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  switch (id) {
    case 'lygter': {
      const g = scene.add.graphics();
      paintLamp(g, -22, 34);
      paintLamp(g, 22, 34);
      c.add(g);
      break;
    }
    case 'flag':
      c.add(bunting(scene, -60, -20, 60, -20, 5, 6));
      break;
    case 'traer':
      c.add(drawTree(scene, -22, 26, 0.7));
      c.add(drawTree(scene, 24, 30, 0.8));
      break;
    case 'bus':
      c.add(bus(scene, 14, 0, false).setScale(0.9));
      break;
    case 'moelle':
      c.add(windmill(scene, 0, 44, false).setScale(0.62));
      break;
    case 'ballon':
      c.add(balloon(scene, 0, 0, false).setScale(0.85));
      break;
    case 'fyrvaerkeri': {
      const g = scene.add.graphics();
      paintBurst(g, -22, -10, 28, COLORS.pink);
      paintBurst(g, 26, 6, 22, COLORS.sun);
      paintBurst(g, 0, 26, 16, COLORS.teal);
      c.add(g);
      break;
    }
    case 'statue':
      c.add(statue(scene, 0, 40, false));
      break;
  }
  return c;
}

/* ------------------------------------------------------------------ pieces --- */

function paintLamp(g: Phaser.GameObjects.Graphics, x: number, base: number): void {
  g.fillStyle(COLORS.sun, 0.3);
  g.fillCircle(x + 9, base - 56, 14);
  g.fillStyle(COLORS.outline);
  g.fillRoundedRect(x - 3, base - 58, 6, 58, 3);
  g.fillRoundedRect(x - 3, base - 62, 15, 6, 3);
  g.fillStyle(COLORS.steelDeep);
  g.fillRoundedRect(x - 1.5, base - 57, 3, 56, 1.5);
  g.fillStyle(COLORS.outline);
  g.fillRoundedRect(x + 3, base - 60, 13, 10, 4);
  g.fillStyle(COLORS.sun);
  g.fillRoundedRect(x + 5, base - 56, 9, 5, 2);
  g.fillStyle(COLORS.rubber);
  g.fillRoundedRect(x - 6, base - 4, 12, 6, 2);
}

/** A Danish flag on a little pole, its foot at (x, y + 14) — the crane's topping-out flags. */
export function drawFlag(g: Phaser.GameObjects.Graphics, x: number, y: number, s = 1): void {
  g.fillStyle(COLORS.outline);
  g.fillRoundedRect(x - 2.5 * s, y - 18 * s, 5 * s, 32 * s, 2 * s);
  g.fillStyle(COLORS.white);
  g.fillRoundedRect(x - 1.2 * s, y - 17 * s, 2.4 * s, 30 * s, 1 * s);
  const fx = x + 2 * s;
  const fy = y - 18 * s;
  plate(g, fx, fy, 26 * s, 18 * s, 2 * s, 0xD8343F, 1, LINE.thin * Math.max(0.6, s));
  g.fillStyle(COLORS.white);
  g.fillRect(fx + 8 * s, fy + 1, 4 * s, 18 * s - 2);
  g.fillRect(fx + 1, fy + 7 * s, 26 * s - 2, 4 * s);
}

function windmill(scene: Phaser.Scene, x: number, base: number, turning: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(x, base);
  const g = scene.add.graphics();
  const top = -150;
  g.fillStyle(COLORS.outline);
  g.fillPoints([{ x: -9, y: 0 }, { x: 9, y: 0 }, { x: 4, y: top }, { x: -4, y: top }], true);
  g.fillStyle(COLORS.white);
  g.fillPoints([{ x: -6.5, y: -1 }, { x: 6.5, y: -1 }, { x: 2.5, y: top + 1 }, { x: -2.5, y: top + 1 }], true);
  plate(g, -8, top - 7, 22, 14, 6, COLORS.white, 1, LINE.thin);
  c.add(g);

  const rotor = scene.add.graphics().setPosition(0, top);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const tip = { x: Math.cos(a) * 62, y: Math.sin(a) * 62 };
    const side = { x: Math.cos(a + 0.18) * 16, y: Math.sin(a + 0.18) * 16 };
    rotor.fillStyle(COLORS.outline);
    rotor.fillTriangle(-side.x * 0.4, -side.y * 0.4, side.x + 1, side.y + 1, tip.x, tip.y);
    rotor.fillStyle(COLORS.white);
    rotor.fillTriangle(0, 0, side.x, side.y, tip.x * 0.97, tip.y * 0.97);
  }
  rotor.fillStyle(COLORS.outline);
  rotor.fillCircle(0, 0, 6);
  rotor.fillStyle(COLORS.steelLight);
  rotor.fillCircle(0, 0, 4);
  c.add(rotor);
  if (turning && !reduceMotion()) {
    scene.tweens.add({ targets: rotor, angle: 360, duration: 5200, repeat: -1 });
  }
  return c;
}

function balloon(scene: Phaser.Scene, x: number, y: number, floating: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const stripes = [COLORS.red, COLORS.sun, COLORS.teal, COLORS.sun, COLORS.red];
  // the envelope, as stripes clipped to an egg shape by drawing each as a narrow ellipse
  g.fillStyle(COLORS.outline);
  g.fillEllipse(0, -6, 74, 84);
  stripes.forEach((col, i) => {
    g.fillStyle(col);
    g.fillEllipse(0, -6, 70 - i * 14, 80);
  });
  g.fillStyle(COLORS.white, 0.3);
  g.fillEllipse(-16, -24, 12, 26);
  // ropes and the basket
  g.lineStyle(1.6, COLORS.outline);
  g.lineBetween(-20, 26, -10, 46);
  g.lineBetween(20, 26, 10, 46);
  plate(g, -12, 44, 24, 16, 4, COLORS.wood, 1, LINE.thin);
  c.add(g);
  if (floating && !reduceMotion()) {
    scene.tweens.add({ targets: c, y: y - 16, x: x + 30, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  return c;
}

function bus(scene: Phaser.Scene, roadY: number, width: number, driving: boolean): Phaser.GameObjects.Container {
  // parked between the workshop and the site when it cannot drive
  const c = scene.add.container(driving ? width * 0.6 : 0, roadY);
  const g = scene.add.graphics();
  const w = 92;
  const h = 40;
  plate(g, -w / 2, -h - 6, w, h, 9, COLORS.red, 1, LINE.base);
  g.fillStyle(COLORS.white, 0.25);
  g.fillRoundedRect(-w / 2 + 4, -h - 3, w - 8, 8, 4);
  for (let i = 0; i < 4; i++) {
    plate(g, -w / 2 + 8 + i * 20, -h + 2, 15, 14, 3, COLORS.window, 1, LINE.thin);
  }
  // the door at the front, and a sign on the roof
  plate(g, w / 2 - 14, -h + 2, 9, 28, 2, COLORS.window, 1, LINE.thin);
  plate(g, -16, -h - 14, 32, 9, 3, COLORS.sun, 1, LINE.thin);
  for (const wx of [-w / 2 + 18, w / 2 - 20]) {
    g.fillStyle(COLORS.outline);
    g.fillCircle(wx, -4, 10);
    g.fillStyle(COLORS.rubberLight);
    g.fillCircle(wx, -4, 7.5);
    g.fillStyle(COLORS.steelLight);
    g.fillCircle(wx, -4, 3.5);
  }
  c.add(g);
  if (driving && !reduceMotion()) {
    // round and round the town: off one side, a pause, back on the other
    c.setX(-70);
    scene.tweens.add({ targets: c, x: width + 70, duration: 9000, repeat: -1, repeatDelay: 2600 });
  }
  return c;
}

function statue(scene: Phaser.Scene, x: number, base: number, onHill: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(x, base);
  const g = scene.add.graphics();
  if (onHill) {
    // its own hill, rising behind the houses, so it stands up above the roofs
    g.fillStyle(shade(COLORS.grass, 0.08));
    g.fillEllipse(0, 80, 300, 164);
    g.lineStyle(LINE.thin, COLORS.outline, 0.25);
    g.strokeEllipse(0, 80, 300, 164);
  }
  plate(g, -30, -18, 60, 22, 5, COLORS.stone, 1, LINE.base);
  g.fillStyle(COLORS.stoneDeep, 0.5);
  g.fillRect(-26, -6, 52, 4);
  c.add(g);
  const m = scene.add.graphics().setPosition(-12, -18).setScale(0.2);
  inLivery('lak-guld', () => drawMachine(m, 'gravko'));
  c.add(m);
  // a glint or two, so it reads as gold rather than as one more yellow machine
  const shine = scene.add.graphics();
  for (const [sx, sy, r] of [[-30, -60, 6], [30, -40, 5], [8, -76, 4]]) {
    shine.fillStyle(COLORS.white);
    shine.fillTriangle(sx - r * 0.3, sy, sx + r * 0.3, sy, sx, sy - r * 1.4);
    shine.fillTriangle(sx - r * 0.3, sy, sx + r * 0.3, sy, sx, sy + r * 1.4);
    shine.fillTriangle(sx, sy - r * 0.3, sx, sy + r * 0.3, sx - r * 1.4, sy);
    shine.fillTriangle(sx, sy - r * 0.3, sx, sy + r * 0.3, sx + r * 1.4, sy);
  }
  c.add(shine);
  return c;
}

function paintBurst(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineStyle(3, color, 1);
    g.lineBetween(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35, x + Math.cos(a) * r, y + Math.sin(a) * r);
    g.fillStyle(COLORS.white);
    g.fillCircle(x + Math.cos(a) * r, y + Math.sin(a) * r, 2);
  }
  g.fillStyle(COLORS.white);
  g.fillCircle(x, y, 3);
}

/**
 * A burst somewhere in the sky every few seconds. With reduced motion there is no show,
 * just a couple of bursts hanging there, so the purchase still shows.
 */
function fireworks(scene: Phaser.Scene, add: Add, t: TownLayout): void {
  const colors = [COLORS.pink, COLORS.sun, COLORS.teal, COLORS.purple, COLORS.red];
  if (reduceMotion()) {
    const g = scene.add.graphics();
    paintBurst(g, t.width * 0.4, t.plotY - 190, 26, COLORS.pink);
    paintBurst(g, t.width * 0.58, t.plotY - 215, 20, COLORS.sun);
    add(g);
    return;
  }
  let n = 0;
  scene.time.addEvent({
    delay: 2400,
    loop: true,
    callback: () => {
      const g = add(scene.add.graphics());
      const x = Phaser.Math.Between(Math.round(t.width * 0.25), Math.round(t.width * 0.75));
      const y = Phaser.Math.Between(t.plotY - 230, t.plotY - 150);
      paintBurst(g, 0, 0, 30, colors[n++ % colors.length]);
      g.setPosition(x, y).setScale(0.2);
      scene.tweens.add({
        targets: g, scale: 1.2, alpha: 0, duration: 1300, ease: 'Cubic.easeOut',
        onComplete: () => g.destroy(),
      });
    },
  });
}
