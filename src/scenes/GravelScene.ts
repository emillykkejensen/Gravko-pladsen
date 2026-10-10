import Phaser from 'phaser';
import { COLORS, SIZE } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, caption } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing } from '../objects/FeedbackEffects';
import { BED_HINGE, drawMachine } from '../objects/MachineArt';
import {
  GRAVEL_DEPTH, HoleBox, drawGravelLayer, drawGround, drawHole, drawPilesUnder, groundY, holeFor, siteSky, siteWeather,
} from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.8;
const START_X = 190;
const HOLE_CX = 640;

type Phase = 'reverse' | 'parked' | 'tipping' | 'leaving' | 'done';

/** How close to the stop sign counts as there: the truck rolls the last bit itself. */
const PARK_SLACK = 60;
const TIP_Y = 490;

/**
 * Laying gravel in the bottom of the hole.
 *
 * The truck has to be backed up to the edge — dragged, with the reversing beeper going —
 * and then tipped. Backing up is the whole skill: stop too early and the gravel misses,
 * so the truck only offers to tip once its back wheels are at the stop sign.
 */
export class GravelScene extends BaseScene {
  private x = START_X;
  private phase: Phase = 'reverse';
  private bed = 0;
  private carried = 1;
  private grab: number | null = null;
  private beepTimer = 0;

  constructor() {
    super({ key: 'GravelScene' });
  }

  init(): void {
    this.x = START_X + this.dx;
    this.phase = 'reverse';
    this.bed = 0;
    this.carried = 1;
    this.grab = null;
  }

  create(): void {
    if (gameState.stage.id !== 'grus') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'reverse') return;
      // anywhere on or around the truck picks it up
      if (Math.abs(p.x - this.x) < 190 && p.y > this.gy - 190 && p.y < this.gy + 60) {
        this.grab = p.x - this.x;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab === null || !p.isDown) return;
      this.moveTo(p.x - this.grab);
    });
    this.input.on('pointerup', () => { this.grab = null; });
  }

  /* The layout, written for the 880×550 stage and moved to the middle of this one. */
  private get gy(): number { return groundY(this); }
  private get startX(): number { return START_X + this.dx; }
  private get holeCX(): number { return HOLE_CX + this.dx; }
  private get tipY(): number { return TIP_Y + this.dy; }

  private get hole(): HoleBox {
    return holeFor(gameState.currentProject.pourCells, this.holeCX, this.gy);
  }

  /** Where the truck stops: its tipping hinge just over the hole's near edge. */
  private get stopX(): number {
    return this.hole.x + 14 + BED_HINGE.x * S;
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height, this.gy);
    drawHole(g, this.hole);
    drawPilesUnder(g, this.hole, gameState.currentProject.piles);
    this.bg(g);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Kør grus i hullet', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const p = gameState.currentProject;
    const hole = this.hole;

    const gravel = this.dyn(this.add.graphics());
    drawGravelLayer(gravel, hole, (gameState.site.gravel / p.gravelLoads) * GRAVEL_DEPTH);

    // the stop sign at the edge of the hole
    const sign = this.dyn(this.add.graphics().setPosition(hole.x - 18, this.gy));
    sign.fillStyle(COLORS.steelDeep);
    sign.fillRect(-2, -64, 4, 64);
    const parked = this.phase === 'parked';
    sign.fillStyle(COLORS.outline);
    sign.fillCircle(0, -72, 16);
    sign.fillStyle(parked ? COLORS.green : COLORS.red);
    sign.fillCircle(0, -72, 14);
    sign.fillStyle(COLORS.white);
    sign.fillRect(-8, -74, 16, 4);

    this.dyn(caption(this, this.scale.width - 120, 96,
      `Læs ${Math.min(gameState.site.gravel + 1, p.gravelLoads)} af ${p.gravelLoads}`));

    const hint = this.phase === 'reverse' ? 'Træk lastbilen hen til hullet'
      : this.phase === 'parked' ? 'Tryk på Tip!' : '';
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96, hint));

    // the truck, facing away from the hole so its bed tips into it
    const truck = this.dyn(this.add.graphics().setName('truck'));
    const stream = this.dyn(this.add.graphics());
    this.everyFrame(dt => {
      truck.setPosition(this.x, this.gy).setScale(-S, S);
      truck.clear();
      drawMachine(truck, 'lastbil', undefined, { bedAngle: this.bed, bedLoad: this.carried });

      stream.clear();
      if (this.phase === 'tipping' && this.bed > 0.45 && this.carried > 0) {
        // gravel sliding off the back of the bed into the hole
        const lip = { x: this.x - (BED_HINGE.x - 10) * S, y: this.gy + BED_HINGE.y * S };
        stream.fillStyle(COLORS.gravelDeep);
        for (let i = 0; i < 8; i++) {
          const t = (this.time.now / 300 + i / 8) % 1;
          stream.fillCircle(lip.x + 6 + Math.sin(i * 3) * 6, lip.y + t * (hole.y + hole.h - lip.y), 4);
        }
      }

      if (this.phase === 'reverse' && this.grab !== null) {
        this.beepTimer -= dt;
        if (this.beepTimer <= 0) {
          audio.beep();
          this.beepTimer = 0.45;
        }
      }
    });

    if (this.phase === 'parked') {
      const tip = button(this, this.x - 60, this.tipY, 'Tip!', COLORS.orange, () => this.tip(), 150, 56, SIZE.heading);
      tip.setName('tip');
      this.dyn(tip);
      popIn(this, tip, 0, 0.6);
    }

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));

    // reversing: the arrow points the way to drive, just past the back of the truck;
    // parked: it points at the button
    const pointer = new Pointer(this, o => this.dyn(o));
    this.everyFrame(() => {
      if (this.phase === 'reverse' && this.grab === null) {
        pointer.point(Math.min(this.x + 150, this.stopX + 60), this.gy - 150, 'right');
      } else if (this.phase === 'parked') {
        pointer.point(this.x - 60, this.tipY - 34);
      } else {
        pointer.hide();
      }
    });
  }

  private moveTo(x: number): void {
    this.x = Phaser.Math.Clamp(x, 100 + this.dx, this.stopX);
    if (this.x >= this.stopX - PARK_SLACK) {
      this.x = this.stopX;
      this.grab = null;
      this.phase = 'parked';
      audio.clank();
      showRing(this, this.hole.x - 18, this.gy - 72, COLORS.green);
      this.refresh();
    }
  }

  private tip(): void {
    if (this.phase !== 'parked') return;
    this.phase = 'tipping';
    this.refresh();
    audio.winch();

    const state = { bed: 0 };
    const up = () => {
      audio.dump();
      this.tweens.add({
        targets: state,
        bed: 0.95,
        duration: dur(1300),
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          this.bed = state.bed;
          this.carried = Math.max(0, 1 - Math.max(0, state.bed - 0.45) * 2);
        },
        onComplete: () => {
          this.bed = 0.95;
          this.carried = 0;
          gameState.tipGravel();
          this.refresh();
          down();
        },
      });
    };
    const down = () => {
      this.tweens.add({
        targets: state,
        bed: 0,
        duration: dur(800),
        delay: dur(300),
        onUpdate: () => { this.bed = state.bed; },
        onComplete: () => {
          this.bed = 0;
          if (gameState.gravelDone) this.finish();
          else this.fetchMore();
        },
      });
    };
    if (reduceMotion()) {
      this.bed = 0;
      this.carried = 0;
      gameState.tipGravel();
      if (gameState.gravelDone) this.finish();
      else this.fetchMore();
      return;
    }
    up();
  }

  /** Drives off for another load and comes back with it. */
  private fetchMore(): void {
    audio.horn();
    if (reduceMotion()) {
      this.x = this.startX;
      this.carried = 1;
      this.phase = 'reverse';
      this.refresh();
      return;
    }
    this.phase = 'leaving';
    this.refresh();
    const state = { x: this.x };
    this.tweens.chain({
      targets: state,
      tweens: [
        { x: -260, duration: dur(1100), ease: 'Quad.easeIn', onUpdate: () => { this.x = state.x; } },
        { x: this.startX, duration: dur(1100), ease: 'Quad.easeOut', onUpdate: () => { this.x = state.x; } },
      ],
      onComplete: () => {
        this.x = this.startX;
        this.carried = 1;
        this.phase = 'reverse';
        this.refresh();
      },
    });
  }

  private finish(): void {
    this.phase = 'done';
    gameState.completeStage();
    const hole = this.hole;
    audio.horn();
    showConfetti(this, hole.x + hole.w / 2, 260, 36);
    showPraise(this, hole.x + hole.w / 2, 220, 'Gruset er lagt!');
    award(this, 3, hole.x + hole.w / 2, this.gy);
    this.refresh();
  }
}
