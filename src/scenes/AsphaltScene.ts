import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { windowSpots } from '../state/Projects';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { caption } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showSparkle } from '../objects/FeedbackEffects';
import { SCREED_BACK, drawMachine } from '../objects/MachineArt';
import {
  drawBuildingFrame, drawFinishedSlab, drawGround, drawWindow, groundY, holeFor, siteSky, siteWeather, slabTop, windowAt,
} from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.5;
const HOLE_CX = 700;
/** The forecourt the asphalt goes on, left of the building. */
const STRIP_FROM = 60;
const STRIP_TO = 420;
const STRIP_H = 10;
/** How much of a strip is laid for every strip-width the screed goes over it. */
const PASS = 0.5;

/**
 * Laying asphalt in front of the building: a platform for the railway station, a forecourt
 * for the hospital.
 *
 * The child drives the paver forward along the gravel, and the screed dragged behind it
 * leaves smooth black asphalt where it has been, steaming. Going over a strip again finishes
 * it; a wider screed does it in one go.
 */
export class AsphaltScene extends BaseScene {
  /** The paver's origin on screen. */
  private x = 0;
  private grab: number | null = null;
  private phase: 'paving' | 'done' = 'paving';
  private steamTimer = 0;

  constructor() {
    super({ key: 'AsphaltScene' });
  }

  init(): void {
    this.x = 0;
    this.grab = null;
    this.phase = 'paving';
  }

  create(): void {
    if (gameState.stage.id !== 'asfalt') {
      this.scene.start('TownScene');
      return;
    }
    this.x = this.minX;
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'paving') return;
      if (Math.abs(p.x - this.x) < 150 && p.y > this.gy - 140 && p.y < this.gy + 60) {
        this.grab = p.x - this.x;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab === null || !p.isDown) return;
      this.x = Phaser.Math.Clamp(p.x - this.grab, this.minX, this.maxX);
    });
    this.input.on('pointerup', () => {
      if (this.grab !== null) gameState.save();
      this.grab = null;
    });
  }

  private get gy(): number {
    return groundY(this);
  }

  private get cells(): number {
    return gameState.currentProject.asphalt;
  }

  private get cellW(): number {
    return (STRIP_TO - STRIP_FROM) / this.cells;
  }

  private cellX(i: number): number {
    return STRIP_FROM + this.dx + i * this.cellW;
  }

  /** The middle of the screed, on screen: where the asphalt comes out. */
  get screedX(): number {
    return this.x + (SCREED_BACK + 32) * S;
  }

  private get minX(): number {
    return STRIP_FROM + this.dx - 16 - (SCREED_BACK + 32) * S;
  }

  private get maxX(): number {
    return STRIP_TO + this.dx + 16 - (SCREED_BACK + 32) * S;
  }

  private laid(i: number): number {
    return gameState.site.paved[i] ?? 0;
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height, this.gy);
    const p = gameState.currentProject;
    const hole = holeFor(p.pourCells, HOLE_CX + this.dx, this.gy);
    drawFinishedSlab(g, hole, p);
    this.bg(g);
    // the building as it stands, waiting for its paint
    const b = this.add.graphics().setPosition(HOLE_CX + this.dx, slabTop(hole));
    drawBuildingFrame(b, p, p.floors + 1, false);
    if (p.stages.includes('vinduer')) {
      for (const spot of windowSpots(p)) {
        const at = windowAt(p, spot.floor, spot.slot);
        drawWindow(b, at.x, at.y);
      }
    }
    this.bg(b);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Læg asfalt', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const n = this.cells;
    const done = () => Array.from({ length: n }, (_, i) => this.laid(i)).filter(f => f >= 1).length;

    const strip = this.dyn(this.add.graphics());
    const drawStrip = () => {
      strip.clear();
      const top = this.gy - 6 - STRIP_H + 4;
      for (let i = 0; i < n; i++) {
        const x = this.cellX(i);
        const w = this.cellW;
        // the gravel bed, then the asphalt over it from the left as far as it is laid
        strip.fillStyle(COLORS.gravel);
        strip.fillRect(x, top, w, STRIP_H);
        strip.fillStyle(COLORS.gravelDeep);
        for (let k = 0; k < w; k += 9) strip.fillCircle(x + 4 + k, top + 5, 2.4);
        const f = Math.min(1, this.laid(i));
        if (f > 0) {
          strip.fillStyle(COLORS.rubber);
          strip.fillRect(x, top - 2, w * f, STRIP_H + 2);
          strip.fillStyle(COLORS.white, 0.18);
          strip.fillRect(x, top - 1, w * f, 3);
        }
        if (this.phase === 'done') {
          // the lines painted on, now it is finished
          strip.fillStyle(COLORS.white);
          strip.fillRect(x + w / 2 - 10, top + 2, 20, 3);
        }
      }
      strip.lineStyle(2, COLORS.outline, 0.9);
      strip.strokeRect(this.cellX(0), top - 2, STRIP_TO - STRIP_FROM, STRIP_H + 2);
    };
    drawStrip();

    this.dyn(caption(this, this.scale.width - 120, 96, `${done()} af ${n}`, done() >= n ? 'done' : 'idle'));
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96,
      this.phase === 'paving' ? 'Kør asfaltmaskinen hen over gruset' : ''));

    const zone = this.dyn(this.add.graphics());
    const paver = this.dyn(this.add.graphics().setName('paver'));
    const pointer = new Pointer(this, o => this.dyn(o));

    let last = this.screedX;
    this.everyFrame(dt => {
      const from = last;
      const to = this.screedX;
      last = to;
      let paving = false;
      // only going forward lays asphalt: the screed smooths what comes out behind it
      if (this.phase === 'paving' && to - from > 0.01) {
        for (let i = 0; i < n; i++) {
          const left = this.cellX(i);
          const over = Math.min(to, left + this.cellW) - Math.max(from, left);
          if (over <= 0 || this.laid(i) >= 1) continue;
          paving = true;
          if (gameState.pave(i, (over / this.cellW) * PASS)) {
            audio.pop();
            showSparkle(this, left + this.cellW / 2, this.gy - 10, this.cellW, 20);
            if (gameState.asphaltLaid) {
              this.time.delayedCall(10, () => this.finish());
              return;
            }
            this.time.delayedCall(10, () => this.refresh());
          }
        }
        if (paving) drawStrip();
      }
      if (paving) {
        this.steamTimer -= dt;
        if (this.steamTimer <= 0) {
          this.steamTimer = 0.18;
          this.steam(to - 10, this.gy - 14);
        }
      }

      const total = Array.from({ length: n }, (_, i) => Math.min(1, this.laid(i))).reduce((a, b) => a + b, 0);
      paver.setPosition(this.x, this.gy - 4).setScale(S);
      paver.clear();
      drawMachine(paver, 'asfalt', undefined, { paver: { load: 1 - (total / n) * 0.8, hot: true } });

      zone.clear();
      const next = Array.from({ length: n }, (_, k) => k).find(k => this.laid(k) < 1);
      if (this.phase !== 'paving' || next === undefined) {
        pointer.hide();
        return;
      }
      drawTargetZone(zone, this, this.cellX(next) - 4, this.gy - 26, this.cellW + 8, 26);
      if (this.grab === null) pointer.point(this.cellX(next) + this.cellW / 2, this.gy - 28);
      else pointer.hide();
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  private steam(x: number, y: number): void {
    if (reduceMotion()) return;
    const c = this.add.circle(x + Phaser.Math.Between(-8, 8), y, Phaser.Math.Between(4, 7), COLORS.white, 0.7).setDepth(900);
    this.tweens.add({
      targets: c, y: y - Phaser.Math.Between(30, 50), alpha: 0, scale: 1.8, duration: 700,
      onComplete: () => c.destroy(),
    });
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.grab = null;
    gameState.completeStage();
    const cx = (STRIP_FROM + STRIP_TO) / 2 + this.dx;
    audio.horn();
    showConfetti(this, cx, 240 + this.dy, 36);
    showPraise(this, cx, 210 + this.dy, 'Asfalten er lagt!');
    this.refresh();
  }
}
