import Phaser from 'phaser';
import { COLORS, INK, PAINT, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, caption, shade, tappable } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing, showSparkle } from '../objects/FeedbackEffects';
import { HOOK_DROP, Pt, drawMachine } from '../objects/MachineArt';
import {
  CELL_W, FLOOR_H, GRAVEL_DEPTH, GROUND_Y, SLAB_H, drawBuilding, drawBuildingFrame, drawFoundation,
  drawFrame, drawGravelLayer, drawGround, drawHole, drawRoofFrame, holeFor, roofHeight, siteSky, siteWeather,
} from '../objects/SiteArt';
import { BaseScene } from './BaseScene';

const S = 0.75;
const CRANE_X = 170;
const HOLE_CX = 540;
const PILE = { x: 800, y: GROUND_Y - 10 };
const PILE_SCALE = 0.42;
/** How close to its place a frame has to be let go. */
const SNAP = 50;

/**
 * Raising the steel frame, then painting the building.
 *
 * The child drags the next frame off the stack and the crane follows: the boom stretches
 * and swings so the hook is always over the load. Frames go on from the bottom up, the
 * roof last, and only the next one's place is shown. Then the frame is painted in a colour
 * of the child's choosing, and the building moves into the town.
 */
export class CraneScene extends BaseScene {
  private dragging = false;
  private piece: Pt = { ...PILE };
  private paint: number | null = null;

  constructor() {
    super({ key: 'CraneScene' });
  }

  init(): void {
    this.dragging = false;
    this.paint = null;
    this.piece = { ...PILE };
  }

  create(): void {
    if (gameState.stage.id !== 'rejs' && gameState.stage.id !== 'mal') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.piece = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', () => this.drop());
    this.input.on('gameout', () => this.drop());
  }

  private get hole() {
    return holeFor(gameState.currentProject.pourCells, HOLE_CX);
  }

  /** Bottom of the building: the top of the foundation slab. */
  private get base(): number {
    const h = this.hole;
    return h.y + h.h - GRAVEL_DEPTH - SLAB_H;
  }

  private get width(): number {
    return gameState.currentProject.pourCells * CELL_W;
  }

  /** Middle of where the next frame (or the roof) goes. */
  private slot(): Pt {
    const p = gameState.currentProject;
    const n = gameState.site.placed;
    if (n < p.floors) return { x: HOLE_CX, y: this.base - n * FLOOR_H - FLOOR_H / 2 };
    return { x: HOLE_CX, y: this.base - p.floors * FLOOR_H - roofHeight(p.roof, this.width) / 2 };
  }

  private nextIsRoof(): boolean {
    return gameState.site.placed >= gameState.currentProject.floors;
  }

  /** Height of the piece being lifted, so the hook sits on its top. */
  private pieceHeight(): number {
    return this.nextIsRoof() ? roofHeight(gameState.currentProject.roof, this.width) : FLOOR_H;
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height);
    const hole = this.hole;
    drawHole(g, hole);
    drawGravelLayer(g, hole, GRAVEL_DEPTH);
    drawFoundation(g, hole.x + 12, this.base, Array(gameState.currentProject.pourCells).fill(1), 1, false);
    // earth backfilled against the slab's ends, now the formwork is gone
    g.fillStyle(COLORS.dirt);
    g.fillRect(hole.x, hole.y - 6, 12, SLAB_H + 6);
    g.fillRect(hole.x + hole.w - 12, hole.y - 6, 12, SLAB_H + 6);
    g.fillStyle(COLORS.grass);
    g.fillRect(hole.x, hole.y - 6, 12, 6);
    g.fillRect(hole.x + hole.w - 12, hole.y - 6, 12, 6);
    // a pallet for the steel
    g.fillStyle(COLORS.wood);
    g.fillRect(PILE.x - 70, GROUND_Y - 10, 140, 10);
    g.lineStyle(2, COLORS.outline);
    g.strokeRect(PILE.x - 70, GROUND_Y - 10, 140, 10);
    this.bg(g);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, gameState.stage.id === 'mal' ? 'Mal huset' : 'Byg stålskelettet', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    if (gameState.stage.id === 'mal') {
      this.buildPainting();
      return;
    }
    const p = gameState.currentProject;

    const frame = this.dyn(this.add.graphics().setPosition(HOLE_CX, this.base));
    drawBuildingFrame(frame, p, gameState.site.placed);

    // the stack of steel still to lift, the next piece on top
    const left = p.floors + 1 - gameState.site.placed;
    const stack = this.dyn(this.add.graphics());
    for (let i = 0; i < left - 1; i++) {
      stack.fillStyle(COLORS.beamDeep);
      stack.fillRoundedRect(PILE.x - 60, GROUND_Y - 22 - i * 12, 120, 10, 3);
      stack.lineStyle(2, COLORS.outline);
      stack.strokeRoundedRect(PILE.x - 60, GROUND_Y - 22 - i * 12, 120, 10, 3);
    }
    const pileTop = { x: PILE.x, y: GROUND_Y - 34 - (left - 1) * 12 };
    this.piece = { ...pileTop };

    this.dyn(caption(this, this.scale.width - 120, 96, `${gameState.site.placed} af ${p.floors + 1}`));
    this.dyn(this.add.text(this.scale.width / 2, 96,
      this.nextIsRoof() ? 'Løft taget op på huset' : 'Træk stålet hen med kranen',
      text(SIZE.body, INK, 'bold')).setOrigin(0.5));

    const crane = this.dyn(this.add.graphics().setPosition(CRANE_X, GROUND_Y).setScale(S));
    const load = this.dyn(this.add.container(pileTop.x, pileTop.y)).setName('piece').setScale(PILE_SCALE);
    const lg = this.add.graphics();
    if (this.nextIsRoof()) drawRoofFrame(lg, -this.width / 2, this.pieceHeight() / 2, this.width, p.roof);
    else drawFrame(lg, -this.width / 2, FLOOR_H / 2, this.width);
    load.add(lg);
    load.setSize(this.width + 20, this.pieceHeight() + 20).setInteractive({ useHandCursor: true });
    load.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.dragging) return;
      this.dragging = true;
      this.piece = { x: ptr.x, y: ptr.y };
      audio.winch();
      this.tweens.add({ targets: load, scale: 1, duration: dur(160) });
    });
    if (!reduceMotion()) {
      this.tweens.add({ targets: load, y: pileTop.y - 5, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    this.everyFrame(() => {
      // the hook is over the load while it is lifted, and resting otherwise
      let tip: Pt;
      let hook: Pt;
      if (this.dragging) {
        load.setPosition(this.piece.x, this.piece.y);
        const top = this.piece.y - (this.pieceHeight() / 2) * load.scale;
        hook = { x: this.piece.x, y: top - 6 };
        tip = { x: this.piece.x, y: Math.min(top - 46, 150 + Math.abs(this.piece.x - CRANE_X) * 0.1) };
      } else {
        tip = { x: CRANE_X + 150 * S, y: GROUND_Y - 250 * S };
        hook = { x: tip.x, y: tip.y + HOOK_DROP * S };
      }
      const toLocal = (q: Pt) => ({ x: (q.x - CRANE_X) / S, y: (q.y - GROUND_Y) / S });
      crane.clear();
      drawMachine(crane, 'kran', undefined, { boomTip: toLocal(tip), hook: toLocal(hook) });
      if (this.dragging) {
        // the slings from the hook to the corners of the load
        const halfW = (this.width / 2) * load.scale;
        const top = this.piece.y - (this.pieceHeight() / 2) * load.scale;
        crane.lineStyle(2 / S, COLORS.outline, 0.9);
        const h = toLocal({ x: hook.x, y: hook.y + 10 });
        const a = toLocal({ x: this.piece.x - halfW, y: top });
        const b = toLocal({ x: this.piece.x + halfW, y: top });
        crane.lineBetween(h.x, h.y, a.x, a.y);
        crane.lineBetween(h.x, h.y, b.x, b.y);
      }
    });
  }

  private drop(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const slot = this.slot();
    const load = this.dynamic.getByName('piece') as Phaser.GameObjects.Container | null;
    if (Phaser.Math.Distance.Between(this.piece.x, this.piece.y, slot.x, slot.y) < SNAP
      && gameState.placePiece()) {
      audio.clank();
      showSparkle(this, slot.x, slot.y, this.width, 50);
      showRing(this, slot.x, slot.y, COLORS.beam);
      award(this, 1, slot.x, slot.y);
      if (gameState.frameDone) {
        gameState.completeStage();
        this.time.delayedCall(dur(250), () => {
          audio.horn();
          showConfetti(this, HOLE_CX, 220, 36);
          showPraise(this, HOLE_CX, 200, 'Skelettet står!');
          award(this, 3, HOLE_CX, 260);
        });
      }
      this.refresh();
      return;
    }
    audio.thud();
    if (load) {
      this.tweens.add({ targets: load, x: PILE.x, y: GROUND_Y - 34, scale: PILE_SCALE, duration: dur(300), ease: 'Quad.easeOut',
        onComplete: () => this.refresh() });
    } else {
      this.refresh();
    }
  }

  /* -------------------------------------------------------------- painting --- */

  private buildPainting(): void {
    const p = gameState.currentProject;

    // the crane parked, its job done
    const crane = this.dyn(this.add.graphics().setPosition(CRANE_X, GROUND_Y).setScale(S));
    drawMachine(crane, 'kran');

    const house = this.dyn(this.add.graphics().setPosition(HOLE_CX, this.base));
    if (this.paint === null) drawBuildingFrame(house, p, p.floors + 1, false);
    else drawBuilding(house, p, this.paint);

    this.dyn(this.add.text(this.scale.width / 2, 96,
      this.paint === null ? 'Vælg en farve til huset' : 'Flot! Prøv en anden — eller flyt ind',
      text(SIZE.body, INK, 'bold')).setOrigin(0.5));

    // paint pots along the bottom
    PAINT.forEach((paint, i) => {
      const x = 90 + i * 74;
      const c = this.dyn(this.add.container(x, 500)).setName(`paint:${i}`);
      const g = this.add.graphics();
      g.fillStyle(COLORS.shadow, 0.2);
      g.fillEllipse(2, 26, 54, 12);
      g.fillStyle(COLORS.steelLight);
      g.fillRoundedRect(-24, -20, 48, 44, 6);
      g.lineStyle(2.5, COLORS.outline);
      g.strokeRoundedRect(-24, -20, 48, 44, 6);
      g.fillStyle(paint.color);
      g.fillEllipse(0, -20, 48, 16);
      g.fillStyle(shade(paint.color, -0.2));
      g.fillRect(-24, -6, 48, 16);
      g.lineStyle(2, COLORS.outline);
      g.strokeEllipse(0, -20, 48, 16);
      if (this.paint === i) {
        g.lineStyle(4, COLORS.white);
        g.strokeRoundedRect(-30, -32, 60, 62, 10);
      }
      c.add(g);
      tappable(this, c, 60, 64, () => {
        this.paint = i;
        audio.splash();
        showSparkle(this, HOLE_CX, this.base - 60, this.width, 120);
        this.refresh();
      }, 'tap');
    });

    if (this.paint !== null) {
      const done = button(this, 690, 500, 'Flyt ind!', COLORS.green, () => this.moveIn(), 200, 56, SIZE.heading);
      done.setName('go');
      this.dyn(done);
      popIn(this, done, 100, 0.6);
    }
  }

  private moveIn(): void {
    if (this.paint === null) return;
    const plot = gameState.paint(this.paint);
    if (plot < 0) return;
    audio.horn();
    showConfetti(this, HOLE_CX, 220, 40);
    award(this, 5, HOLE_CX, this.base - 80);
    this.time.delayedCall(dur(900), () => this.goTo('TownScene', { arrived: plot }));
  }
}
