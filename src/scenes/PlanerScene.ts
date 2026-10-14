import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { caption } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showSparkle } from '../objects/FeedbackEffects';
import { BLADE_X, drawMachine } from '../objects/MachineArt';
import { drawGround, groundY, siteSky, siteWeather } from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.62;
const START_X = 130;
/** Middle of the plot, where the heaps stand. */
const PLOT_CX = 560;
const MOUND_GAP = 112;
const MOUND_W = 92;
const MOUND_H = 70;
/** How much flatter a heap gets for every heap-width the blade pushes through it. */
const PASS = 0.5;

/**
 * Pushing the ground flat, before anything else happens on the plot.
 *
 * Heaps of earth stand where the building is going. The child drags the bulldozer forward
 * into them, and its blade shaves each one down a little, the earth rolling up in front of
 * it; backing up and pushing again finishes the job. Only pushing forward shaves — that is
 * which way a blade cuts — and a wider blade shaves more each time.
 */
export class PlanerScene extends BaseScene {
  /** The bulldozer's origin on screen: on the ground under its middle. */
  private x = START_X;
  private grab: number | null = null;
  private phase: 'pushing' | 'done' = 'pushing';
  /** Earth heaped against the blade, 0-1. */
  private heaped = 0;
  private scrapeTimer = 0;

  constructor() {
    super({ key: 'PlanerScene' });
  }

  init(): void {
    this.x = START_X + this.dx;
    this.grab = null;
    this.phase = 'pushing';
    this.heaped = 0;
  }

  create(): void {
    if (gameState.stage.id !== 'planer') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'pushing') return;
      if (Math.abs(p.x - this.x) < 170 && p.y > this.gy - 170 && p.y < this.gy + 60) {
        this.grab = p.x - this.x;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab === null || !p.isDown) return;
      this.driveTo(p.x - this.grab);
    });
    this.input.on('pointerup', () => {
      if (this.grab !== null) gameState.save();
      this.grab = null;
    });
  }

  private get gy(): number {
    return groundY(this);
  }

  /** The middle of each heap, on screen. */
  get moundXs(): number[] {
    const n = gameState.currentProject.mounds;
    return Array.from({ length: n }, (_, i) => PLOT_CX + this.dx + (i - (n - 1) / 2) * MOUND_GAP);
  }

  private flat(i: number): number {
    return gameState.site.planed[i] ?? 0;
  }

  /** The blade's cutting edge, on screen. */
  get bladeX(): number {
    return this.x + (BLADE_X + 10) * S;
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height, this.gy);
    this.bg(g);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Skub jorden flad', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const xs = this.moundXs;
    const done = () => xs.filter((_, i) => this.flat(i) >= 1).length;

    const mounds = this.dyn(this.add.graphics());
    const drawMounds = () => {
      mounds.clear();
      const base = this.gy - 6;
      xs.forEach((mx, i) => {
        const left = 1 - this.flat(i);
        if (left <= 0) {
          // a flattened heap leaves a patch of bare earth
          mounds.fillStyle(COLORS.dirt);
          mounds.fillRect(mx - MOUND_W / 2, base, MOUND_W, 6);
          return;
        }
        const h = 8 + MOUND_H * left;
        const pts: { x: number; y: number }[] = [];
        for (let k = 0; k <= 20; k++) {
          const a = (k / 20) * Math.PI;
          pts.push({ x: mx - Math.cos(a) * (MOUND_W / 2), y: base - Math.pow(Math.sin(a), 0.8) * h });
        }
        mounds.fillStyle(COLORS.dirtDeep);
        mounds.fillPoints(pts, true);
        mounds.fillStyle(COLORS.dirt);
        mounds.fillPoints(pts.map(p => ({ x: mx + (p.x - mx) * 0.86 - 3, y: base - (base - p.y) * 0.9 })), true);
        mounds.fillStyle(COLORS.dirtLight);
        mounds.fillEllipse(mx - 12, base - h * 0.7, MOUND_W * 0.26, h * 0.18);
        mounds.lineStyle(2.5, COLORS.outline, 0.9);
        mounds.strokePoints(pts, false);
      });
    };
    drawMounds();

    this.dyn(caption(this, this.scale.width - 120, 96, `${done()} af ${xs.length}`, done() >= xs.length ? 'done' : 'idle'));
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96,
      this.phase === 'pushing' ? 'Skub bulldozeren ind i jordbunkerne' : ''));

    const zone = this.dyn(this.add.graphics());
    const dozer = this.dyn(this.add.graphics().setName('bulldozer'));
    const pointer = new Pointer(this, o => this.dyn(o));

    let lastBlade = this.bladeX;
    this.everyFrame(dt => {
      const from = lastBlade;
      const to = this.bladeX;
      lastBlade = to;
      // backing up lets the earth slide off the blade
      if (to < from) this.heaped = Math.max(0, this.heaped - (from - to) / 120);
      this.heaped = Math.max(0, this.heaped - dt * 0.15);

      if (this.phase === 'pushing' && to - from > 0.01) {
        let changed = false;
        xs.forEach((mx, i) => {
          if (this.flat(i) >= 1) return;
          const left = mx - MOUND_W / 2;
          const over = Math.min(to, left + MOUND_W) - Math.max(from, left);
          if (over <= 0) return;
          changed = true;
          this.heaped = Math.min(1, this.heaped + (over / MOUND_W) * 0.8);
          if (gameState.plane(i, (over / MOUND_W) * PASS)) {
            audio.pop();
            showSparkle(this, mx, this.gy - 20, MOUND_W, 30);
            if (gameState.groundFlat) {
              this.time.delayedCall(10, () => this.finish());
              return;
            }
            this.time.delayedCall(10, () => this.refresh());
          }
        });
        if (changed) {
          this.scrapeTimer -= dt;
          if (this.scrapeTimer <= 0) {
            audio.scoop();
            this.scrapeTimer = 0.3;
          }
          drawMounds();
        }
      }

      dozer.setPosition(this.x, this.gy).setScale(S);
      dozer.clear();
      drawMachine(dozer, 'bulldozer', undefined, { blade: { lift: 0, load: this.heaped } });

      zone.clear();
      const next = xs.findIndex((_, i) => this.flat(i) < 1);
      if (this.phase !== 'pushing' || next < 0) {
        pointer.hide();
        return;
      }
      const h = 8 + MOUND_H * (1 - this.flat(next));
      drawTargetZone(zone, this, xs[next] - MOUND_W / 2 - 6, this.gy - h - 14, MOUND_W + 12, h + 10, 'round');
      if (this.grab === null) pointer.point(xs[next], this.gy - h - 16);
      else pointer.hide();
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  private driveTo(x: number): void {
    const xs = this.moundXs;
    const min = 80 + this.dx + 130 * S;
    // far enough for the blade to clear the last heap
    const max = xs[xs.length - 1] + MOUND_W / 2 + 30 - (BLADE_X + 10) * S;
    this.x = Phaser.Math.Clamp(x, min, Math.max(min, max));
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.grab = null;
    gameState.completeStage();
    const xs = this.moundXs;
    const cx = (xs[0] + xs[xs.length - 1]) / 2;
    audio.horn();
    showConfetti(this, cx, 240 + this.dy, 36);
    showPraise(this, cx, 210 + this.dy, 'Jorden er flad!');
    this.refresh();
  }
}
