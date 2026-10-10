import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { caption } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showSparkle } from '../objects/FeedbackEffects';
import { ROLLER_DRUM, ROLLER_DRUM_R, ROLLER_WHEEL, drawMachine } from '../objects/MachineArt';
import {
  CELL_W, GRAVEL_DEPTH, HOLE_DEPTH, HoleBox, drawGround, drawHole, drawPilesUnder, groundY, holeFor,
  siteSky, siteWeather,
} from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.6;
const START_X = 150;
const HOLE_CX = 520;
/** How far loose gravel heaps up above the ground before it is rolled. */
const HEAP = 34;
/** How much flatter a section gets for every section-width the drum rolls over it. */
const PASS = 0.55;

/**
 * Rolling the gravel flat, for a building big enough to need a firm bed.
 *
 * The truck leaves its gravel in loose heaps sticking up out of the hole; the child drives
 * the roller back and forth over them, and every pass squashes them flatter, until the bed is
 * level and firm for the foundation. The roller rides up over the heaps and tips with them,
 * so the bumps can be seen and felt going away.
 */
export class RollScene extends BaseScene {
  /** The roller's origin on screen: on the ground, between its drum and its back wheel. */
  private x = START_X;
  private grab: number | null = null;
  private phase: 'rolling' | 'done' = 'rolling';
  private turned = 0;
  private crunchTimer = 0;

  constructor() {
    super({ key: 'RollScene' });
  }

  init(): void {
    this.x = START_X + this.dx;
    this.grab = null;
    this.phase = 'rolling';
    this.turned = 0;
  }

  create(): void {
    if (gameState.stage.id !== 'tromle') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'rolling') return;
      if (Math.abs(p.x - this.x) < 190 && p.y > this.gy - 190 && p.y < this.gy + 60) {
        this.grab = p.x - this.x;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab === null || !p.isDown) return;
      this.rollTo(p.x - this.grab);
    });
    this.input.on('pointerup', () => {
      if (this.grab !== null) gameState.save();
      this.grab = null;
    });
  }

  private get gy(): number {
    return groundY(this);
  }

  private get hole(): HoleBox {
    return holeFor(gameState.currentProject.pourCells, HOLE_CX + this.dx, this.gy);
  }

  /** Left edge of the gravel sections — the foundation's footprint. */
  private get cellsX(): number {
    return this.hole.x + 12;
  }

  private flatness(i: number): number {
    return gameState.site.rolled[i] ?? 0;
  }

  /** The top of the gravel in one section: heaped up when loose, down in the hole when flat. */
  private cellTop(i: number): number {
    const flat = this.gy + HOLE_DEPTH - GRAVEL_DEPTH;
    return Phaser.Math.Linear(this.gy - HEAP, flat, this.flatness(i));
  }

  /** What a wheel standing at `x`, `r` wide, rests on: the ground, or the highest gravel under it. */
  private surface(x: number, r: number): number {
    const hole = this.hole;
    if (x + r * 0.6 < hole.x || x - r * 0.6 > hole.x + hole.w) return this.gy;
    // the ends of the bed, either side of the sections, are already as low as they go
    let top = this.gy + HOLE_DEPTH - GRAVEL_DEPTH;
    const cells = gameState.currentProject.pourCells;
    for (let i = 0; i < cells; i++) {
      const left = this.cellsX + i * CELL_W;
      if (x + r * 0.7 > left && x - r * 0.7 < left + CELL_W) top = Math.min(top, this.cellTop(i));
    }
    // a wheel half over the edge of the hole rests on the edge
    if (x - r * 0.6 < hole.x || x + r * 0.6 > hole.x + hole.w) top = Math.min(top, this.gy);
    return top;
  }

  /** Where the drum's middle is, on screen. */
  get drumX(): number {
    return this.x + ROLLER_DRUM.x * S;
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height, this.gy);
    const hole = this.hole;
    drawHole(g, hole);
    drawPilesUnder(g, hole, gameState.currentProject.piles);
    this.bg(g);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Tril gruset fast', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const cells = gameState.currentProject.pourCells;
    const flat = () => Array.from({ length: cells }, (_, i) => this.flatness(i)).filter(f => f >= 1).length;

    const gravel = this.dyn(this.add.graphics());
    const drawGravel = () => {
      const hole = this.hole;
      const bottom = hole.y + hole.h;
      gravel.clear();
      // the strips at either end, already as low as they will go
      gravel.fillStyle(COLORS.gravelDeep);
      gravel.fillRect(hole.x + 1, bottom - GRAVEL_DEPTH, 11, GRAVEL_DEPTH);
      gravel.fillRect(hole.x + hole.w - 12, bottom - GRAVEL_DEPTH, 11, GRAVEL_DEPTH);
      for (let i = 0; i < cells; i++) {
        const x = this.cellsX + i * CELL_W;
        const top = this.cellTop(i);
        const loose = 1 - this.flatness(i);
        // a loose heap is a rounded mound; a rolled section is flat
        const mound = loose * 16;
        gravel.fillStyle(COLORS.gravelDeep);
        gravel.fillRect(x, top + mound, CELL_W, bottom - top - mound);
        if (mound > 0.5) gravel.fillEllipse(x + CELL_W / 2, top + mound, CELL_W + 8, mound * 2);
        gravel.fillStyle(COLORS.gravel);
        for (let k = 0; k < 5; k++) {
          const t = (k - 2) / 2.2;
          gravel.fillCircle(x + CELL_W / 2 + t * 16, top + mound * (0.2 + t * t * 0.9) + 3, 3.4 + loose * 1.6);
        }
        gravel.fillStyle(COLORS.gravel, 0.6);
        for (let row = 1; row < (bottom - top - mound) / 9; row++) {
          for (let k = 0; k < 4; k++) gravel.fillCircle(x + 6 + k * 10 + (row % 2) * 4, top + mound + row * 9, 2.6);
        }
      }
    };
    drawGravel();

    this.dyn(caption(this, this.scale.width - 120, 96, `${flat()} af ${cells}`, flat() >= cells ? 'done' : 'idle'));
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96,
      this.phase === 'rolling' ? 'Kør tromlen frem og tilbage over gruset' : ''));

    const zone = this.dyn(this.add.graphics());
    const roller = this.dyn(this.add.graphics().setName('roller'));
    const pointer = new Pointer(this, o => this.dyn(o));

    let lastDrum = this.drumX;
    this.everyFrame(dt => {
      // Squash whatever the drum went over since the last frame — every section it crossed,
      // in proportion, so a slow frame that jumps the drum along still rolls them all.
      const from = Math.min(lastDrum, this.drumX);
      const to = Math.max(lastDrum, this.drumX);
      this.turned += (this.drumX - lastDrum) / (ROLLER_DRUM_R * S);
      lastDrum = this.drumX;
      if (this.phase === 'rolling' && to - from > 0.01) {
        let changed = false;
        for (let i = 0; i < cells; i++) {
          const left = this.cellsX + i * CELL_W;
          const over = Math.min(to, left + CELL_W) - Math.max(from, left);
          if (over <= 0 || this.flatness(i) >= 1) continue;
          changed = true;
          if (gameState.roll(i, (over / CELL_W) * PASS)) {
            audio.pop();
            showSparkle(this, left + CELL_W / 2, this.cellTop(i), 40, 24);
            if (gameState.gravelRolled) {
              this.time.delayedCall(10, () => this.finish());
              return;
            }
            this.time.delayedCall(10, () => this.refresh());
          }
        }
        if (changed) {
          this.crunchTimer -= dt;
          if (this.crunchTimer <= 0) {
            audio.scoop();
            this.crunchTimer = 0.3;
          }
          drawGravel();
        }
      }

      // the drum and the back wheel each ride on whatever is under them, and the roller tips between
      const wheelX = this.x + ROLLER_WHEEL.x * S;
      const drumY = this.surface(this.drumX, ROLLER_DRUM_R * S);
      const wheelY = this.surface(wheelX, 40 * S);
      const angle = Math.atan2(drumY - wheelY, this.drumX - wheelX);
      roller.setPosition(this.x, (drumY + wheelY) / 2).setRotation(angle).setScale(S);
      roller.clear();
      drawMachine(roller, 'vejtromle', undefined, { rollPhase: this.turned });

      // the arrow stands over the bumpiest heap until the finger is on the roller
      zone.clear();
      const next = Array.from({ length: cells }, (_, k) => k).find(k => this.flatness(k) < 1);
      if (this.phase !== 'rolling' || next === undefined) {
        pointer.hide();
        return;
      }
      const x = this.cellsX + next * CELL_W;
      drawTargetZone(zone, this, x - 4, this.cellTop(next) - 18, CELL_W + 8, 30);
      if (this.grab === null) pointer.point(x + CELL_W / 2, this.cellTop(next) - 22);
      else pointer.hide();
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  private rollTo(x: number): void {
    const hole = this.hole;
    // far enough each way for the drum to clear the gravel on both sides
    const min = 70 + this.dx;
    const max = hole.x + hole.w + 30 - ROLLER_DRUM.x * S + ROLLER_DRUM_R * S;
    this.x = Phaser.Math.Clamp(x, min, Math.max(min, max));
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.grab = null;
    gameState.completeStage();
    const hole = this.hole;
    audio.horn();
    showConfetti(this, hole.x + hole.w / 2, 240 + this.dy, 36);
    showPraise(this, hole.x + hole.w / 2, 210 + this.dy, 'Gruset er trillet fast!');
    award(this, 3, hole.x + hole.w / 2, this.gy);
    this.refresh();
  }
}
