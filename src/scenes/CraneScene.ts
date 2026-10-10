import Phaser from 'phaser';
import { COLORS, PAINT, SIZE } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, caption, shade, tappable } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing, showSparkle } from '../objects/FeedbackEffects';
import { HOOK_DROP, JIB_END, JIB_Y, Pt, TOWER_HOOK_REST, drawMachine } from '../objects/MachineArt';
import {
  CELL_W, FLOOR_H, GRAVEL_DEPTH, SLAB_H, drawBuilding, drawBuildingFrame, drawFoundation,
  drawFrame, drawGravelLayer, drawGround, drawHole, drawPilesUnder, drawRoofFrame, groundY, holeFor,
  roofHeight, siteSky, siteWeather,
} from '../objects/SiteArt';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

/** How close to its place a frame has to be let go. Generous, for small hands. */
const SNAP = 110;
const PILE_SCALE = 0.42;

/**
 * Where everything stands, for each crane, on the 880×550 stage.
 *
 * The mobile crane parks on the left with its boom over the building and the steel on the
 * right. The tower crane stands between the steel and the building and turns round to face
 * whichever it is lifting from — its jib only reaches so far, and turning is what a tower
 * crane does.
 */
const LAYOUT = {
  kran: { crane: 170, scale: 0.75, hole: 540, pile: 800 },
  taarnkran: { crane: 370, scale: 0.52, hole: 580, pile: 170 },
};

type Crane = keyof typeof LAYOUT;

/**
 * Raising the steel frame, then painting the building.
 *
 * The child drags the next frame off the stack and the crane follows: the mobile crane's
 * boom stretches and swings so the hook is always over the load; the tower crane turns and
 * runs its trolley along the jib. Frames go on from the bottom up, the roof last, and only
 * the next one's place is shown. Then the frame is painted in a colour of the child's
 * choosing, and the building moves into the town.
 */
export class CraneScene extends BaseScene {
  private dragging = false;
  private piece: Pt = { x: 0, y: 0 };
  private paint: number | null = null;
  /** Which way the tower crane's jib points: 1 towards the building, -1 towards the steel. */
  private face = -1;

  constructor() {
    super({ key: 'CraneScene' });
  }

  init(): void {
    this.dragging = false;
    this.paint = null;
    this.face = -1;
  }

  create(): void {
    if (gameState.stage.id !== 'rejs' && gameState.stage.id !== 'taarn' && gameState.stage.id !== 'mal') {
      this.scene.start('TownScene');
      return;
    }
    this.piece = this.pileTop();
    super.create();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragging) this.piece = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', () => this.drop());
    this.input.on('gameout', () => this.drop());
  }

  /** The crane this building needs: the tower crane for the high-rise, else the mobile one. */
  private get crane(): Crane {
    return gameState.currentProject.stages.includes('taarn') ? 'taarnkran' : 'kran';
  }

  private get gy(): number {
    return groundY(this);
  }

  private get craneX(): number {
    return LAYOUT[this.crane].crane + this.dx;
  }

  private get holeCX(): number {
    return LAYOUT[this.crane].hole + this.dx;
  }

  private get pileX(): number {
    return LAYOUT[this.crane].pile + this.dx;
  }

  private get S(): number {
    return LAYOUT[this.crane].scale;
  }

  private get hole() {
    return holeFor(gameState.currentProject.pourCells, this.holeCX, this.gy);
  }

  /** Bottom of the building: the top of the foundation slab. */
  private get base(): number {
    const h = this.hole;
    return h.y + h.h - GRAVEL_DEPTH - SLAB_H;
  }

  private get width(): number {
    return gameState.currentProject.pourCells * CELL_W;
  }

  /** Steel frames (and the roof) still waiting on the pallet. */
  private get left(): number {
    return gameState.currentProject.floors + 1 - gameState.site.placed;
  }

  /** Where the next piece sits, on top of the stack. */
  private pileTop(): Pt {
    return { x: this.pileX, y: this.gy - 34 - Math.max(0, this.left - 1) * 12 };
  }

  /** Middle of where the next frame (or the roof) goes. */
  private slot(): Pt {
    const p = gameState.currentProject;
    const n = gameState.site.placed;
    if (n < p.floors) return { x: this.holeCX, y: this.base - n * FLOOR_H - FLOOR_H / 2 };
    return { x: this.holeCX, y: this.base - p.floors * FLOOR_H - roofHeight(p.roof, this.width) / 2 };
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
    drawGround(g, width, height, this.gy);
    const hole = this.hole;
    drawHole(g, hole);
    drawPilesUnder(g, hole, gameState.currentProject.piles);
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
    g.fillRect(this.pileX - 70, this.gy - 10, 140, 10);
    g.lineStyle(2, COLORS.outline);
    g.strokeRect(this.pileX - 70, this.gy - 10, 140, 10);
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

    // where the piece in hand goes glows, under the frame
    const zone = this.dyn(this.add.graphics());
    const frame = this.dyn(this.add.graphics().setPosition(this.holeCX, this.base));
    drawBuildingFrame(frame, p, gameState.site.placed);

    // the stack of steel still to lift, the next piece on top
    const stack = this.dyn(this.add.graphics());
    for (let i = 0; i < this.left - 1; i++) {
      stack.fillStyle(COLORS.beamDeep);
      stack.fillRoundedRect(this.pileX - 60, this.gy - 22 - i * 12, 120, 10, 3);
      stack.lineStyle(2, COLORS.outline);
      stack.strokeRoundedRect(this.pileX - 60, this.gy - 22 - i * 12, 120, 10, 3);
    }
    const pileTop = this.pileTop();
    this.piece = { ...pileTop };

    this.dyn(caption(this, this.scale.width - 120, 96, `${gameState.site.placed} af ${p.floors + 1}`));
    this.dyn(hintBanner(this, this.scale.width / 2 - 20, 96,
      this.nextIsRoof() ? 'Løft taget op på huset' : 'Træk stålet hen på huset'));

    const crane = this.dyn(this.add.graphics().setPosition(this.craneX, this.gy).setScale(this.S));
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

    const pointer = new Pointer(this, o => this.dyn(o));
    this.everyFrame(() => {
      zone.clear();
      if (this.dragging) {
        const slot = this.slot();
        const h = this.pieceHeight();
        drawTargetZone(zone, this, slot.x - this.width / 2 - 20, slot.y - h / 2 - 16, this.width + 40, h + 32);
        pointer.point(slot.x, slot.y - h / 2 - 18);
      } else {
        pointer.point(load.x, load.y - 30);
      }
    });

    this.everyFrame(() => {
      if (this.dragging) load.setPosition(this.piece.x, this.piece.y);
      crane.clear();
      if (this.crane === 'taarnkran') this.drawTowerCrane(crane, load);
      else this.drawMobileCrane(crane, load);
    });
  }

  /** The mobile crane: the boom stretches and swings so the hook is over the load. */
  private drawMobileCrane(crane: Phaser.GameObjects.Graphics, load: Phaser.GameObjects.Container): void {
    const S = this.S;
    let tip: Pt;
    let hook: Pt;
    if (this.dragging) {
      const top = this.piece.y - (this.pieceHeight() / 2) * load.scale;
      hook = { x: this.piece.x, y: top - 6 };
      tip = { x: this.piece.x, y: Math.min(top - 46, 150 + this.dy + Math.abs(this.piece.x - this.craneX) * 0.1) };
    } else {
      tip = { x: this.craneX + 150 * S, y: this.gy - 250 * S };
      hook = { x: tip.x, y: tip.y + HOOK_DROP * S };
    }
    const toLocal = (q: Pt) => ({ x: (q.x - this.craneX) / S, y: (q.y - this.gy) / S });
    drawMachine(crane, 'kran', undefined, { boomTip: toLocal(tip), hook: toLocal(hook) });
    if (this.dragging) this.drawSlings(crane, toLocal(hook), load, toLocal);
  }

  /**
   * The tower crane: it turns to face the load, the trolley runs out along the jib to be
   * over it, and the hook comes down onto it. Resting, it faces the steel, ready to lift.
   */
  private drawTowerCrane(crane: Phaser.GameObjects.Graphics, load: Phaser.GameObjects.Container): void {
    const S = this.S;
    const target = this.dragging ? this.piece : this.pileTop();
    const top = target.y - (this.pieceHeight() / 2) * (this.dragging ? load.scale : PILE_SCALE);
    this.face = target.x < this.craneX ? -1 : 1;
    const trolley = Phaser.Math.Clamp(((target.x - this.craneX) / S) * this.face, 60, JIB_END - 18);
    // on the load while lifting it, hanging just over the stack while waiting
    const hookY = Math.max(JIB_Y + 24, (top - (this.dragging ? 6 : 36) - this.gy) / S);
    crane.setScale(S * this.face, S);
    const hook = { x: trolley, y: hookY };
    drawMachine(crane, 'taarnkran', undefined, { hook });
    if (this.dragging) {
      const toLocal = (q: Pt) => ({ x: ((q.x - this.craneX) / S) * this.face, y: (q.y - this.gy) / S });
      this.drawSlings(crane, hook, load, toLocal);
    }
  }

  /** The slings from the hook to the corners of the load. */
  private drawSlings(
    crane: Phaser.GameObjects.Graphics,
    hook: Pt,
    load: Phaser.GameObjects.Container,
    toLocal: (q: Pt) => Pt
  ): void {
    const halfW = (this.width / 2) * load.scale;
    const top = this.piece.y - (this.pieceHeight() / 2) * load.scale;
    crane.lineStyle(2 / this.S, COLORS.outline, 0.9);
    const a = toLocal({ x: this.piece.x - halfW, y: top });
    const b = toLocal({ x: this.piece.x + halfW, y: top });
    crane.lineBetween(hook.x, hook.y + 10, a.x, a.y);
    crane.lineBetween(hook.x, hook.y + 10, b.x, b.y);
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
          showConfetti(this, this.holeCX, 220 + this.dy, 36);
          showPraise(this, this.holeCX, 200 + this.dy, 'Skelettet står!');
          award(this, 3, this.holeCX, 260 + this.dy);
        });
      }
      this.refresh();
      return;
    }
    audio.thud();
    const home = this.pileTop();
    if (load) {
      this.tweens.add({ targets: load, x: home.x, y: home.y, scale: PILE_SCALE, duration: dur(300), ease: 'Quad.easeOut',
        onComplete: () => this.refresh() });
    } else {
      this.refresh();
    }
  }

  /* -------------------------------------------------------------- painting --- */

  /** Where the "Flyt ind!" button goes: bottom right, clear of the paint pots. */
  private get goAt(): Pt {
    return { x: this.scale.width - 130, y: this.scale.height - 50 };
  }

  private buildPainting(): void {
    const p = gameState.currentProject;

    // the crane parked, its job done
    const crane = this.dyn(this.add.graphics().setPosition(this.craneX, this.gy).setScale(this.S));
    if (this.crane === 'taarnkran') {
      drawMachine(crane, 'taarnkran', undefined, { hook: { x: 120, y: TOWER_HOOK_REST + 40 } });
    } else {
      drawMachine(crane, 'kran');
    }

    const house = this.dyn(this.add.graphics().setPosition(this.holeCX, this.base));
    if (this.paint === null) drawBuildingFrame(house, p, p.floors + 1, false);
    else drawBuilding(house, p, this.paint);

    this.dyn(hintBanner(this, this.scale.width / 2 - 20, 96,
      this.paint === null ? 'Vælg en farve til huset' : 'Flot! Tryk på Flyt ind!'));

    // paint pots along the bottom: the first six, and any bought in the star shop
    const pots = PAINT.map((_, i) => i).filter(i => gameState.hasPaint(i));
    const step = Math.min(74, (this.goAt.x - 120 - 50) / Math.max(1, pots.length - 1));
    const potY = this.scale.height - 50;
    pots.forEach((index, i) => {
      const paint = PAINT[index];
      const x = 50 + i * step;
      const c = this.dyn(this.add.container(x, potY)).setName(`paint:${index}`);
      const g = this.add.graphics();
      g.fillStyle(COLORS.shadow, 0.2);
      g.fillEllipse(2, 26, 54, 12);
      g.fillStyle(COLORS.steelLight);
      g.fillRoundedRect(-24, -20, 48, 44, 6);
      g.lineStyle(2.5, COLORS.outline);
      g.strokeRoundedRect(-24, -20, 48, 44, 6);
      g.fillStyle(paint.color);
      g.fillEllipse(0, -20, 48, 16);
      if (paint.stripes) {
        paint.stripes.forEach((col, k) => {
          g.fillStyle(col);
          g.fillRect(-24 + (k * 48) / paint.stripes!.length, -6, 48 / paint.stripes!.length + 0.5, 16);
        });
      } else {
        g.fillStyle(shade(paint.color, -0.2));
        g.fillRect(-24, -6, 48, 16);
      }
      g.lineStyle(2, COLORS.outline);
      g.strokeEllipse(0, -20, 48, 16);
      if (this.paint === index) {
        g.lineStyle(4, COLORS.white);
        g.strokeRoundedRect(-30, -32, 60, 62, 10);
      }
      c.add(g);
      tappable(this, c, Math.min(60, step), 64, () => {
        this.paint = index;
        audio.splash();
        showSparkle(this, this.holeCX, this.base - 60, this.width, 120);
        this.refresh();
      }, 'tap');
    });

    if (this.paint !== null) {
      const done = button(this, this.goAt.x, this.goAt.y, 'Flyt ind!', COLORS.green, () => this.moveIn(), 200, 56, SIZE.heading);
      done.setName('go');
      this.dyn(done);
      popIn(this, done, 100, 0.6);
    }

    // first the paint pots, then the button
    const pointer = new Pointer(this, o => this.dyn(o));
    if (this.paint === null) pointer.point(50 + Math.min(2, pots.length - 1) * step, potY - 24);
    else pointer.point(this.goAt.x, this.goAt.y - 34);
    this.everyFrame(() => pointer.tick());
  }

  private moveIn(): void {
    if (this.paint === null) return;
    const plot = gameState.paint(this.paint);
    if (plot < 0) return;
    audio.horn();
    showConfetti(this, this.holeCX, 220 + this.dy, 40);
    award(this, 5, this.holeCX, this.base - 80);
    this.time.delayedCall(dur(900), () => this.goTo('TownScene', { arrived: plot }));
  }
}
