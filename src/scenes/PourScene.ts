import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { caption, progressBar } from '../helpers/Draw';
import { dur } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showSparkle } from '../objects/FeedbackEffects';
import { CHUTE_ROOT, Pt, drawMachine } from '../objects/MachineArt';
import {
  CELL_W, GRAVEL_DEPTH, GROUND_Y, SLAB_H, drawFoundation, drawGravelLayer, drawGround, drawHole,
  holeFor, siteSky, siteWeather,
} from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.8;
const TRUCK_X = 730;
const HOLE_CX = 330;
/** Formwork per second while concrete is running into it. */
const POUR_RATE = 0.9;
/** How fast the chute swings to follow the finger, px per second. */
const SWING = 520;

type Phase = 'pouring' | 'drying' | 'done';

/**
 * Pouring the foundation.
 *
 * The mixer's drum turns all the time — faster while it pours — and the chute swings to
 * wherever the finger is. Holding the finger over a section of formwork runs concrete into
 * it; every section has to be filled to the top. Then the concrete has to dry, which the
 * sun does while the child watches the grey turn pale.
 */
export class PourScene extends BaseScene {
  private tipX = 0;
  private goalX = 0;
  private holding = false;
  private phase: Phase = 'pouring';
  private dry = 0;
  private drum = 0;
  private pourTimer = 0;

  constructor() {
    super({ key: 'PourScene' });
  }

  init(): void {
    this.holding = false;
    this.phase = 'pouring';
    this.dry = 0;
  }

  create(): void {
    if (gameState.stage.id !== 'stoeb') {
      this.scene.start('TownScene');
      return;
    }
    this.tipX = this.chuteRoot.x - 70;
    this.goalX = this.tipX;
    super.create();

    const aim = (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.phase !== 'pouring') return;
      this.goalX = Phaser.Math.Clamp(p.x, this.slabX + 6, this.chuteRoot.x - 50);
      this.holding = p.y > 150;
    };
    this.input.on('pointerdown', aim);
    this.input.on('pointermove', aim);
    this.input.on('pointerup', () => { this.holding = false; });
    this.input.on('gameout', () => { this.holding = false; });
  }

  private get hole() {
    return holeFor(gameState.currentProject.pourCells, HOLE_CX);
  }

  private get slabX(): number {
    return this.hole.x + 12;
  }

  private get slabTop(): number {
    const h = this.hole;
    return h.y + h.h - GRAVEL_DEPTH - SLAB_H;
  }

  private get chuteRoot(): Pt {
    return { x: TRUCK_X + CHUTE_ROOT.x * S, y: GROUND_Y + CHUTE_ROOT.y * S };
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height);
    drawHole(g, this.hole);
    drawGravelLayer(g, this.hole, GRAVEL_DEPTH);
    this.bg(g);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Støb fundamentet', COLORS.machineDeep);
    addStarCounter(this);
  }

  /** Which section of formwork is under a point, or -1. */
  private cellAt(x: number): number {
    const cells = gameState.currentProject.pourCells;
    const i = Math.floor((x - this.slabX) / CELL_W);
    return i >= 0 && i < cells ? i : -1;
  }

  protected buildDynamic(): void {
    const cells = gameState.currentProject.pourCells;
    const fills = () => Array.from({ length: cells }, (_, i) => gameState.site.poured[i] ?? 0);

    // the section of formwork that wants concrete next glows
    const zone = this.dyn(this.add.graphics());
    const slab = this.dyn(this.add.graphics());
    const drawSlab = () => {
      slab.clear();
      drawFoundation(slab, this.slabX, this.slabTop, fills(), this.dry, this.phase === 'pouring');
    };
    drawSlab();

    const filled = fills().filter(f => f >= 1).length;
    this.dyn(caption(this, this.scale.width - 120, 96, `${filled} af ${cells}`, filled >= cells ? 'done' : 'idle'));

    const hint = this.phase === 'pouring' ? 'Hold fingeren på det gule felt'
      : this.phase === 'drying' ? 'Solen tørrer betonen ...' : '';
    this.dyn(hintBanner(this, this.scale.width / 2 - 60, 96, hint));

    const truck = this.dyn(this.add.graphics().setPosition(TRUCK_X, GROUND_Y).setScale(S));
    const stream = this.dyn(this.add.graphics());

    let dryBar: Phaser.GameObjects.Container | null = null;

    const pointer = new Pointer(this, o => this.dyn(o));
    this.everyFrame(() => {
      zone.clear();
      const next = this.phase === 'pouring' ? fills().findIndex(f => f < 1) : -1;
      if (next < 0) {
        pointer.hide();
        return;
      }
      const x = this.slabX + next * CELL_W;
      drawTargetZone(zone, this, x - 4, this.slabTop - 30, CELL_W + 8, SLAB_H + 36);
      // the arrow stands aside while concrete is running, so it does not hide the stream
      if (this.holding) pointer.hide();
      else pointer.point(x + CELL_W / 2, this.slabTop - 34);
    });

    this.everyFrame(dt => {
      // the chute swings towards the finger
      const dx = this.goalX - this.tipX;
      this.tipX += Math.sign(dx) * Math.min(Math.abs(dx), SWING * dt);
      const tip = { x: this.tipX, y: this.slabTop - 34 };
      const local = { x: (tip.x - TRUCK_X) / S, y: (tip.y - GROUND_Y) / S };

      const pouring = this.phase === 'pouring' && this.holding && Math.abs(dx) < 30;
      this.drum += dt * (pouring ? 4 : 1.2);

      truck.clear();
      drawMachine(truck, 'betonbil', undefined, {
        drumPhase: this.drum, chuteTip: local, wetChute: pouring,
      });

      stream.clear();
      if (pouring) {
        const cell = this.cellAt(tip.x);
        // a ribbon of concrete from the chute to the surface
        stream.fillStyle(COLORS.concreteWet);
        stream.fillRect(tip.x - 5, tip.y, 10, this.slabTop + SLAB_H - tip.y - 2);
        stream.fillStyle(COLORS.white, 0.3);
        stream.fillRect(tip.x - 3, tip.y, 2, this.slabTop + SLAB_H - tip.y - 2);
        this.pourTimer -= dt;
        if (this.pourTimer <= 0) {
          audio.pour();
          this.pourTimer = 0.3;
        }
        if (cell >= 0) {
          const full = gameState.pour(cell, dt * POUR_RATE);
          drawSlab();
          if (full) {
            audio.pop();
            showSparkle(this, this.slabX + (cell + 0.5) * CELL_W, this.slabTop, 40, 30);
            if (gameState.foundationPoured) this.startDrying();
            else this.time.delayedCall(10, () => this.refresh());
          }
        }
      }

      if (this.phase === 'drying') {
        this.dry = Math.min(1, this.dry + dt / 2.4);
        drawSlab();
        dryBar?.destroy();
        dryBar = this.dyn(progressBar(this, this.slabX + cells * CELL_W / 2, this.slabTop - 70, 160, 16, this.dry, COLORS.sun));
        if (this.dry >= 1) this.finish();
      }
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  private startDrying(): void {
    this.phase = 'drying';
    this.holding = false;
    this.goalX = this.chuteRoot.x - 70;
    // reduced motion skips the wait, not the result
    if (dur(1) === 0) this.dry = 1;
    this.time.delayedCall(10, () => this.refresh());
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    gameState.completeStage();
    const cx = this.slabX + gameState.currentProject.pourCells * CELL_W / 2;
    audio.horn();
    showConfetti(this, cx, 260, 36);
    showPraise(this, cx, 220, 'Fundamentet er støbt!');
    award(this, 3, cx, this.slabTop);
    this.refresh();
  }
}
