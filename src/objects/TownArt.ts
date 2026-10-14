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

/**
 * Where the town's row of houses is: the shop's things find their places from it.
 *
 * The town is a road longer than the screen, which the child slides along, so `width` is the
 * whole road's, not the stage's.
 */
export interface TownLayout {
  width: number;
  /** The pavement line the houses stand on. */
  plotY: number;
  /** The middle of each plot. */
  plotXs: number[];
  /** Middle of the road. */
  roadY: number;
  /** The middle of each of the town's own buildings' plots, by project id. */
  landmarks: Record<string, number>;
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
    // in the gap between the second and third plots, which the trees leave free
    const gap = t.plotXs.length > 2 ? t.plotXs[2] - t.plotXs[1] : 150;
    const x = t.plotXs.length > 2 ? t.plotXs[1] + gap / 2 : t.width / 2;
    add(statue(scene, x, t.plotY - 84, true));
  }
}

/** Where the train runs: along the hills behind the houses, so it passes behind them. */
export function railY(t: TownLayout): number {
  return t.plotY - 26;
}

/** The railway behind the houses, once there is a train. Static, so it lives in the backdrop. */
export function townRail(g: Phaser.GameObjects.Graphics, width: number, t: Pick<TownLayout, 'plotY'>): void {
  if (!owns('tog')) return;
  const y = t.plotY - 26;
  g.fillStyle(COLORS.woodDeep);
  for (let x = 0; x < width; x += 14) g.fillRect(x, y - 2, 8, 6);
  g.lineStyle(2.5, COLORS.steelDeep, 1);
  g.lineBetween(0, y - 3, width, y - 3);
  g.lineBetween(0, y + 3, width, y + 3);
}

/** Things that move: the wind turbine, the balloon, the fireworks and the vehicles. */
export function townAmbient(scene: Phaser.Scene, add: Add, t: TownLayout): void {
  if (owns('moelle')) add(windmill(scene, t.width * 0.28, t.plotY - 30, true)).setName('deco:moelle');
  if (owns('ballon')) add(balloon(scene, t.width * 0.72, t.plotY - 150, true)).setName('deco:ballon');
  if (owns('fyrvaerkeri')) fireworks(scene, add, t);
  if (owns('tog')) add(drive(scene, train(scene), railY(t) + 1, t.width, 1, 150, 4000, 1600)).setName('deco:tog');
  if (owns('helikopter')) add(helicopter(scene, t.landmarks.hospital ?? t.width / 2, t.plotY - 180, true)).setName('deco:helikopter');
  // the road's two lanes: one each way, the far one a little higher up
  if (owns('bus')) add(drive(scene, bus(scene), t.roadY + 10, t.width, 1, 110, 2600, 0)).setName('deco:bus');
  if (owns('brandbil')) add(drive(scene, fireEngine(scene), t.roadY - 4, t.width, -1, 150, 3600, 1200)).setName('deco:brandbil');
  if (owns('politibil')) add(drive(scene, policeCar(scene), t.roadY + 10, t.width, 1, 170, 5200, 4200)).setName('deco:politibil');
  if (owns('ambulance')) add(drive(scene, ambulance(scene), t.roadY - 4, t.width, -1, 160, 4800, 6000)).setName('deco:ambulance');
}

/**
 * Sends a vehicle along the whole road, round and round: off one end, a pause, back on at the
 * other. `dir` 1 drives left to right. With reduced motion it is parked in the middle.
 */
function drive(
  scene: Phaser.Scene, c: Phaser.GameObjects.Container, y: number, width: number,
  dir: 1 | -1, speed: number, pause: number, delay: number
): Phaser.GameObjects.Container {
  c.setY(y).setScale(dir, 1);
  if (reduceMotion()) {
    c.setX(width * (dir > 0 ? 0.6 : 0.4));
    return c;
  }
  const from = dir > 0 ? -140 : width + 140;
  const to = dir > 0 ? width + 140 : -140;
  c.setX(from);
  scene.tweens.add({
    targets: c, x: to, duration: (Math.abs(to - from) / speed) * 1000,
    repeat: -1, repeatDelay: pause, delay,
  });
  return c;
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
      c.add(bus(scene).setPosition(0, 24).setScale(0.9));
      break;
    case 'brandbil':
      c.add(fireEngine(scene).setPosition(0, 24).setScale(0.9));
      break;
    case 'politibil':
      c.add(policeCar(scene).setPosition(0, 24));
      break;
    case 'ambulance':
      c.add(ambulance(scene).setPosition(0, 24).setScale(0.95));
      break;
    case 'tog':
      c.add(train(scene).setPosition(44, 20).setScale(0.46));
      break;
    case 'helikopter':
      c.add(helicopter(scene, 0, 4, false));
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

/** Two wheels under a vehicle `w` wide, its origin on the road under its middle. */
function wheels(g: Phaser.GameObjects.Graphics, xs: number[], r = 10): void {
  for (const wx of xs) {
    g.fillStyle(COLORS.outline);
    g.fillCircle(wx, -4, r);
    g.fillStyle(COLORS.rubberLight);
    g.fillCircle(wx, -4, r * 0.75);
    g.fillStyle(COLORS.steelLight);
    g.fillCircle(wx, -4, r * 0.35);
  }
}

/** A blue light on the roof, flashing when the vehicle is out on the road. */
function beacon(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, color = COLORS.blue): void {
  const g = scene.add.graphics();
  plate(g, x - 7, y - 8, 14, 9, 3, color, 1, LINE.thin);
  g.fillStyle(COLORS.white, 0.5);
  g.fillRect(x - 4, y - 6, 3, 4);
  c.add(g);
  if (reduceMotion()) return;
  const glow = scene.add.circle(x, y - 4, 11, color, 0.45);
  c.add(glow);
  scene.tweens.add({ targets: glow, alpha: 0, duration: 260, yoyo: true, repeat: -1 });
}

function fireEngine(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const w = 104;
  plate(g, -w / 2, -42, w - 30, 34, 6, COLORS.red, 1, LINE.base);
  plate(g, w / 2 - 34, -50, 32, 42, 8, COLORS.red, 1, LINE.base);
  plate(g, w / 2 - 28, -45, 20, 16, 3, COLORS.window, 1, LINE.thin);
  // roller shutters along the side, and the ladder on the roof
  g.fillStyle(shade(COLORS.red, -0.2));
  for (let i = 0; i < 3; i++) g.fillRect(-w / 2 + 6 + i * 22, -36, 18, 20);
  g.lineStyle(3, COLORS.outline);
  g.lineBetween(-w / 2 + 2, -50, w / 2 - 38, -50);
  g.lineBetween(-w / 2 + 2, -44, w / 2 - 38, -44);
  g.lineStyle(2.5, COLORS.steelLight);
  g.lineBetween(-w / 2 + 2, -50, w / 2 - 38, -50);
  g.lineBetween(-w / 2 + 2, -44, w / 2 - 38, -44);
  for (let x = -w / 2 + 8; x < w / 2 - 38; x += 9) g.lineBetween(x, -50, x, -44);
  g.fillStyle(COLORS.white);
  g.fillRect(-w / 2 + 2, -14, w - 4, 3);
  wheels(g, [-w / 2 + 18, w / 2 - 20]);
  c.add(g);
  beacon(scene, c, w / 2 - 18, -50);
  return c;
}

function policeCar(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const w = 76;
  plate(g, -w / 2 + 14, -40, w - 30, 18, 7, COLORS.white, 1, LINE.base);
  plate(g, -w / 2 + 19, -36, 16, 12, 3, COLORS.window, 1, LINE.thin);
  plate(g, -w / 2 + 39, -36, 16, 12, 3, COLORS.window, 1, LINE.thin);
  plate(g, -w / 2, -26, w, 20, 7, COLORS.white, 1, LINE.base);
  // the yellow and blue checks of a Danish police car
  for (let i = 0; i < 8; i++) {
    g.fillStyle(i % 2 ? COLORS.blue : COLORS.yellow);
    g.fillRect(-w / 2 + 4 + i * ((w - 8) / 8), -20, (w - 8) / 8, 7);
  }
  wheels(g, [-w / 2 + 15, w / 2 - 15], 9);
  c.add(g);
  beacon(scene, c, -2, -40);
  return c;
}

function ambulance(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const w = 92;
  plate(g, -w / 2, -48, w - 22, 40, 6, COLORS.white, 1, LINE.base);
  plate(g, w / 2 - 26, -36, 26, 28, 8, COLORS.white, 1, LINE.base);
  plate(g, w / 2 - 20, -32, 14, 12, 3, COLORS.window, 1, LINE.thin);
  g.fillStyle(COLORS.yellow);
  g.fillRect(-w / 2 + 2, -24, w - 4, 6);
  // a red cross on the side
  g.fillStyle(COLORS.red);
  g.fillRect(-18, -44, 8, 20);
  g.fillRect(-24, -38, 20, 8);
  wheels(g, [-w / 2 + 16, w / 2 - 16]);
  c.add(g);
  beacon(scene, c, -w / 2 + 12, -48);
  return c;
}

/** A locomotive and two carriages, on its own rails; origin under the middle of the engine. */
function train(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  // the carriages trail behind the engine, to the left
  for (let k = 1; k <= 2; k++) {
    const x = -k * 96;
    plate(g, x - 44, -40, 88, 34, 7, COLORS.teal, 1, LINE.base);
    for (let i = 0; i < 4; i++) plate(g, x - 36 + i * 19, -34, 14, 12, 3, COLORS.window, 1, LINE.thin);
    g.fillStyle(COLORS.white, 0.7);
    g.fillRect(x - 40, -18, 80, 3);
    for (const wx of [x - 28, x + 28]) {
      g.fillStyle(COLORS.outline);
      g.fillCircle(wx, -5, 7);
      g.fillStyle(COLORS.steelLight);
      g.fillCircle(wx, -5, 3.5);
    }
    g.fillStyle(COLORS.outline);
    g.fillRect(x + 44, -16, 8, 4);
  }
  // the engine, its nose to the right
  plate(g, -46, -48, 74, 42, 8, COLORS.red, 1, LINE.base);
  g.fillStyle(COLORS.red);
  g.fillPoints([{ x: 24, y: -48 }, { x: 40, y: -36 }, { x: 46, y: -6 }, { x: 24, y: -6 }], true);
  g.lineStyle(LINE.base, COLORS.outline);
  g.strokePoints([{ x: 24, y: -48 }, { x: 40, y: -36 }, { x: 46, y: -6 }, { x: 24, y: -6 }], true, true);
  plate(g, 18, -42, 16, 14, 3, COLORS.window, 1, LINE.thin);
  g.fillStyle(COLORS.white, 0.75);
  g.fillRect(-42, -20, 84, 4);
  for (const wx of [-30, 2, 28]) {
    g.fillStyle(COLORS.outline);
    g.fillCircle(wx, -5, 8);
    g.fillStyle(COLORS.steelLight);
    g.fillCircle(wx, -5, 4);
  }
  // the pantograph up to the wire
  g.lineStyle(2, COLORS.outline);
  g.lineBetween(-20, -48, -10, -60);
  g.lineBetween(-10, -60, -24, -64);
  c.add(g);
  return c;
}

/** A rescue helicopter circling over the hospital, its rotor a blur. */
function helicopter(scene: Phaser.Scene, x: number, y: number, flying: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  // tail boom and rotor
  g.fillStyle(COLORS.outline);
  g.fillRect(-64, -6, 46, 9);
  g.fillStyle(COLORS.red);
  g.fillRect(-62, -4, 44, 5);
  g.fillStyle(COLORS.outline);
  g.fillCircle(-64, -2, 9);
  g.fillStyle(COLORS.steelLight);
  g.fillCircle(-64, -2, 6);
  // the cabin
  plate(g, -26, -20, 52, 34, 16, COLORS.red, 1, LINE.base);
  plate(g, 6, -16, 18, 16, 6, COLORS.window, 1, LINE.thin);
  g.fillStyle(COLORS.white);
  g.fillRect(-16, -6, 14, 4);
  g.fillRect(-11, -11, 4, 14);
  // skids
  g.lineStyle(3, COLORS.outline);
  g.lineBetween(-22, 22, 24, 22);
  g.lineBetween(-12, 14, -14, 22);
  g.lineBetween(12, 14, 14, 22);
  g.fillStyle(COLORS.outline);
  g.fillRect(-2, -28, 4, 9);
  c.add(g);
  const rotor = scene.add.graphics();
  rotor.fillStyle(COLORS.outline, 0.8);
  rotor.fillRoundedRect(-58, -32, 116, 5, 2);
  c.add(rotor);
  if (flying && !reduceMotion()) {
    scene.tweens.add({ targets: rotor, scaleX: 0.15, duration: 90, yoyo: true, repeat: -1 });
    scene.tweens.add({ targets: c, x: x + 140, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onYoyo: () => c.setScale(-1, 1), onRepeat: () => c.setScale(1, 1) });
    scene.tweens.add({ targets: c, y: y - 18, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }
  return c;
}

function bus(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
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
  return c;
}

function statue(scene: Phaser.Scene, x: number, base: number, onHill: boolean): Phaser.GameObjects.Container {
  const c = scene.add.container(x, base);
  const g = scene.add.graphics();
  if (onHill) {
    // Its own hill, rising behind the houses, so it stands up above the roofs. A dome whose
    // foot is the town's grass line: the road is drawn under the town now, not over it, so
    // a whole ellipse would show its lower half as a green circle across the road.
    const foot = 82;
    const dome = Array.from({ length: 25 }, (_, i) => {
      const a = (i / 24) * Math.PI;
      return { x: -Math.cos(a) * 92, y: foot - Math.pow(Math.sin(a), 0.7) * (foot + 4) };
    });
    g.fillStyle(shade(COLORS.grass, 0.08));
    g.fillPoints(dome, true);
    g.lineStyle(LINE.thin, COLORS.outline, 0.25);
    g.strokePoints(dome, false);
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
