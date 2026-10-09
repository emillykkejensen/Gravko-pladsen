import Phaser from 'phaser';
import { COLORS, INK, LINE, SIZE, text } from '../config';
import { plate, shadow } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';

type Add = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

export type PointDir = 'down' | 'up' | 'left' | 'right';

const ROTATION: Record<PointDir, number> = {
  down: 0,
  up: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

/**
 * The big bouncing arrow that shows where the finger goes next.
 *
 * Every screen uses the same one — same colour, same size, same bounce — so a child who
 * cannot read learns one rule for the whole game: follow the orange arrow. Its tip sits
 * exactly on the point it is given, and it bounces towards it.
 *
 * Create it last in buildDynamic() so it draws over the machines, then call `point()` or
 * `hide()` from an everyFrame updater.
 */
export class Pointer {
  private readonly g: Phaser.GameObjects.Graphics;
  private at: { x: number; y: number } | null = null;
  private dir: PointDir = 'down';

  constructor(private readonly scene: Phaser.Scene, add: Add) {
    this.g = add(scene.add.graphics());
    // Drawn pointing down with the tip at the origin.
    const pts = [
      { x: -11, y: -62 }, { x: 11, y: -62 }, { x: 11, y: -30 },
      { x: 26, y: -30 }, { x: 0, y: 0 }, { x: -26, y: -30 }, { x: -11, y: -30 },
    ];
    this.g.fillStyle(COLORS.shadow, 0.22);
    this.g.fillPoints(pts.map(p => ({ x: p.x + 3, y: p.y + 4 })), true);
    this.g.fillStyle(COLORS.orange);
    this.g.fillPoints(pts, true);
    this.g.fillStyle(COLORS.white, 0.35);
    this.g.fillRect(-6, -58, 5, 26);
    this.g.lineStyle(LINE.heavy - 1, COLORS.outline);
    this.g.strokePoints(pts, true, true);
    this.g.setVisible(false);
  }

  point(x: number, y: number, dir: PointDir = 'down'): void {
    this.at = { x, y };
    this.dir = dir;
    this.tick();
  }

  hide(): void {
    this.at = null;
    this.g.setVisible(false);
  }

  /** Moves the arrow along its bounce. `point()` calls it; call it per frame otherwise. */
  tick(): void {
    if (!this.at || !this.g.active) return;
    const back = reduceMotion() ? 4 : 6 + (Math.sin(this.scene.time.now / 160) + 1) * 7;
    const r = ROTATION[this.dir];
    // "back" is away from the tip, along the arrow's shaft
    const bx = Math.sin(r) * back;
    const by = -Math.cos(r) * back;
    this.g.setPosition(this.at.x + bx, this.at.y + by).setRotation(r).setVisible(true);
  }
}

/**
 * A place something has to go: a soft glowing patch with a thick white outline, breathing
 * slowly. Used for wherever the child should drop or hold something — the earth heap, a
 * filler cap, the next section of formwork — so a target looks the same on every screen.
 */
export function drawTargetZone(
  g: Phaser.GameObjects.Graphics,
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  shape: 'round' | 'box' = 'box'
): void {
  const breathe = reduceMotion() ? 0.5 : (Math.sin(scene.time.now / 260) + 1) / 2;
  g.fillStyle(COLORS.sun, 0.35 + breathe * 0.3);
  g.lineStyle(4, COLORS.white, 0.75 + breathe * 0.25);
  if (shape === 'round') {
    g.fillEllipse(x + w / 2, y + h / 2, w, h);
    g.strokeEllipse(x + w / 2, y + h / 2, w, h);
  } else {
    g.fillRoundedRect(x, y, w, h, 14);
    g.strokeRoundedRect(x, y, w, h, 14);
  }
}

/**
 * What to do on this screen, in one short line on a plate big enough to read from arm's
 * length — or for a grown-up to read aloud. Plain text on the sky was too easy to miss.
 */
export function hintBanner(
  scene: Phaser.Scene,
  x: number, y: number,
  label: string
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  if (!label) return c;
  const t = scene.add.text(0, 0, label, text(SIZE.heading, INK, 'bold')).setOrigin(0.5);
  const w = t.width + 40;
  const h = t.height + 16;
  const g = scene.add.graphics();
  shadow(g, -w / 2, -h / 2, w, h, h / 2, 3, 0.18);
  plate(g, -w / 2, -h / 2, w, h, h / 2, COLORS.cream, 0.97, LINE.base);
  c.add([g, t]);
  return c;
}
