import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { windowSpots } from '../state/Projects';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { caption } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing, showSparkle } from '../objects/FeedbackEffects';
import { LIFT_MIN, LIFT_REACH, LIFT_REST, LIFT_ROOT, Pt, drawMachine } from '../objects/MachineArt';
import {
  drawBuildingFrame, drawFinishedSlab, drawGround, drawWindow, groundY, holeFor, siteSky, siteWeather, slabTop, windowAt,
} from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.7;
const TRUCK_X = 280;
const HOLE_CX = 600;
/** How close the basket has to come to a window for it to go in. Generous. */
const NEAR = 40;
/** Machine units per second the basket moves towards the finger. */
const SPEED = 900;

/**
 * Putting the windows in, from the lift truck's basket.
 *
 * The steel frame stands; the child drags the basket up to each window opening, and the pane
 * goes in when the basket gets there. The arm follows the finger the way the excavator's
 * does, stretching and swinging, and a bigger basket puts in the windows beside it on the
 * same floor too.
 */
export class WindowScene extends BaseScene {
  /** The basket's pin, in the truck's own coordinates, eased towards `goal`. */
  private tip: Pt = { ...LIFT_REST };
  private goal: Pt = { ...LIFT_REST };
  private grab = false;
  private phase: 'fitting' | 'done' = 'fitting';

  constructor() {
    super({ key: 'WindowScene' });
  }

  init(): void {
    this.tip = { ...LIFT_REST };
    this.goal = { ...LIFT_REST };
    this.grab = false;
    this.phase = 'fitting';
  }

  create(): void {
    if (gameState.stage.id !== 'vinduer') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'fitting') return;
      this.grab = true;
      this.steer(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab && p.isDown) this.steer(p.x, p.y);
    });
    this.input.on('pointerup', () => { this.grab = false; });
  }

  private get gy(): number {
    return groundY(this);
  }

  private get truckX(): number {
    return TRUCK_X + this.dx;
  }

  private get hole() {
    return holeFor(gameState.currentProject.pourCells, HOLE_CX + this.dx, this.gy);
  }

  /** Where the building stands. */
  private get base(): number {
    return slabTop(this.hole);
  }

  /** The middle of a window opening, on screen. */
  windowCenter(i: number): Pt {
    const p = gameState.currentProject;
    const spot = windowSpots(p)[i];
    const at = windowAt(p, spot.floor, spot.slot);
    return { x: HOLE_CX + this.dx + at.x + 10, y: this.base + at.y + 10 };
  }

  /** Where the basket's floor is, on screen — what has to reach the window. */
  private basketOnScreen(): Pt {
    return { x: this.truckX + this.tip.x * S, y: this.gy + (this.tip.y + 20) * S };
  }

  /** Points the basket at a spot on screen: the arm stretches as far as it goes, no further. */
  private steer(x: number, y: number): void {
    // never lower than just off the ground
    const local = { x: (x - this.truckX) / S, y: Math.min((y - this.gy) / S - 20, -64) };
    let dx = local.x - LIFT_ROOT.x;
    let dy = local.y - LIFT_ROOT.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Phaser.Math.Clamp(d, LIFT_MIN, LIFT_REACH) / d;
    dx *= k;
    dy *= k;
    this.goal = { x: LIFT_ROOT.x + dx, y: LIFT_ROOT.y + dy };
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height, this.gy);
    drawFinishedSlab(g, this.hole, gameState.currentProject);
    this.bg(g);
    const b = this.add.graphics().setPosition(HOLE_CX + this.dx, this.base);
    drawBuildingFrame(b, gameState.currentProject, gameState.currentProject.floors + 1, false);
    this.bg(b);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Sæt vinduerne i', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const p = gameState.currentProject;
    const spots = windowSpots(p);
    const n = spots.length;

    // the panes already in, and pale openings where the rest go
    const panes = this.dyn(this.add.graphics().setPosition(HOLE_CX + this.dx, this.base));
    const drawPanes = () => {
      panes.clear();
      spots.forEach((spot, i) => {
        const at = windowAt(p, spot.floor, spot.slot);
        if (gameState.site.windows.includes(i)) {
          drawWindow(panes, at.x, at.y, p.kind === 'togstation' && spot.floor === 0);
        } else {
          panes.fillStyle(COLORS.white, 0.35);
          panes.fillRoundedRect(at.x, at.y, 20, 20, 3);
          panes.lineStyle(1.5, COLORS.outline, 0.35);
          panes.strokeRoundedRect(at.x, at.y, 20, 20, 3);
        }
      });
    };
    drawPanes();

    const done = gameState.site.windows.length;
    this.dyn(caption(this, this.scale.width - 120, 96, `${done} af ${n}`, done >= n ? 'done' : 'idle'));
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96,
      this.phase === 'fitting' ? 'Kør kurven hen til vinduerne' : ''));

    const zone = this.dyn(this.add.graphics());
    const truck = this.dyn(this.add.graphics().setName('lift'));
    const pointer = new Pointer(this, o => this.dyn(o));

    this.everyFrame(dt => {
      const dx = this.goal.x - this.tip.x;
      const dy = this.goal.y - this.tip.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist > step) {
        this.tip.x += (dx / dist) * step;
        this.tip.y += (dy / dist) * step;
      } else {
        this.tip = { ...this.goal };
      }

      const left = n - gameState.site.windows.length;
      truck.setPosition(this.truckX, this.gy).setScale(S);
      truck.clear();
      drawMachine(truck, 'lift', undefined, { lift: { tip: this.tip, panes: left } });

      zone.clear();
      if (this.phase !== 'fitting') {
        pointer.hide();
        return;
      }

      const basket = this.basketOnScreen();
      for (let i = 0; i < n; i++) {
        if (gameState.site.windows.includes(i)) continue;
        const c = this.windowCenter(i);
        if (Phaser.Math.Distance.Between(basket.x, basket.y, c.x, c.y) < NEAR) {
          const got = gameState.putWindow(i);
          if (got.length) {
            audio.clank();
            for (const w of got) {
              const at = this.windowCenter(w);
              showSparkle(this, at.x, at.y, 30, 30);
              showRing(this, at.x, at.y, COLORS.window);
            }
            drawPanes();
            if (gameState.windowsIn) {
              this.time.delayedCall(10, () => this.finish());
              return;
            }
            this.time.delayedCall(10, () => this.refresh());
            return;
          }
        }
      }

      const next = Array.from({ length: n }, (_, i) => i).find(i => !gameState.site.windows.includes(i));
      if (next === undefined) {
        pointer.hide();
        return;
      }
      const c = this.windowCenter(next);
      drawTargetZone(zone, this, c.x - 18, c.y - 18, 36, 36);
      if (!this.grab) pointer.point(c.x, c.y - 20);
      else pointer.hide();
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.grab = false;
    this.goal = { ...LIFT_REST };
    gameState.completeStage();
    audio.horn();
    showConfetti(this, HOLE_CX + this.dx, 200 + this.dy, 36);
    showPraise(this, HOLE_CX + this.dx, 180 + this.dy, 'Vinduerne er sat i!');
    this.refresh();
  }
}
