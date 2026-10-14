import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { caption, plate } from '../helpers/Draw';
import { dur, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise } from '../objects/FeedbackEffects';
import { BALL_R, Pt, WRECK_TIP, drawMachine } from '../objects/MachineArt';
import { drawGround, groundY, siteSky, siteWeather } from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.62;
const CRANE_X = 420;
/** The chain on the site, in machine units — longer than the workshop's, to reach the shed. */
const CHAIN = 260;
/** The shed's left wall, on the 880 stage, and its blocks. */
const SHED_X = 566;
const COLS = 3;
const BLOCK_W = 42;
const BLOCK_H = 34;
/** Gravity for the swing, in px/s². */
const G = 900;
/** How far back the ball can be pulled, and how far forward. Radians from straight down. */
const BACK = -1.35;
const FORWARD = 1.1;
/** A swing has to be going at least this fast to knock anything down. */
const HARD = 0.9;

/**
 * Knocking the old shed down.
 *
 * An old wooden shed stands on the plot. The child pulls the wrecking ball back and lets go;
 * it swings into the shed and knocks a block or two down, then swings back to be pulled
 * again. A gentle nudge does nothing — it has to be swung — and a heavier ball knocks more
 * down at a time. The blocks come down from the side the ball hits, top first.
 */
export class WreckScene extends BaseScene {
  /** The chain's angle from straight down: negative is back, towards the crane. */
  private angle = 0;
  private spin = 0;
  private grab = false;
  private phase: 'swinging' | 'done' = 'swinging';

  constructor() {
    super({ key: 'WreckScene' });
  }

  init(): void {
    this.angle = 0;
    this.spin = 0;
    this.grab = false;
    this.phase = 'swinging';
  }

  create(): void {
    if (gameState.stage.id !== 'riv') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    // Anywhere under the boom and short of the shed takes hold of the ball, even while it
    // is still swinging: chasing a moving ball with a finger is no fun.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'swinging') return;
      const face = this.face() ?? this.scale.width;
      if (p.y < this.tip.y - 20 || p.x > face - 6) return;
      this.grab = true;
      this.spin = 0;
      this.hold(p);
      audio.winch();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab && p.isDown) this.hold(p);
    });
    const letGo = () => {
      if (!this.grab) return;
      this.grab = false;
      this.spin = 0;
    };
    this.input.on('pointerup', letGo);
    this.input.on('gameout', letGo);
  }

  private get gy(): number {
    return groundY(this);
  }

  /** The ball follows the finger round the boom tip, as far as the chain lets it. */
  private hold(p: Phaser.Input.Pointer): void {
    const tip = this.tip;
    this.angle = Phaser.Math.Clamp(Math.atan2(p.x - tip.x, Math.max(10, p.y - tip.y)), BACK, this.maxForward());
  }

  /** The boom's tip, on screen, where the chain hangs from. */
  get tip(): Pt {
    return { x: CRANE_X + this.dx + WRECK_TIP.x * S, y: this.gy + WRECK_TIP.y * S };
  }

  private get length(): number {
    return CHAIN * S;
  }

  /** The ball's middle, on screen. */
  ball(angle = this.angle): Pt {
    const tip = this.tip;
    return { x: tip.x + Math.sin(angle) * this.length, y: tip.y + Math.cos(angle) * this.length };
  }

  private get rows(): number {
    return Math.ceil(gameState.currentProject.shed / COLS);
  }

  /** The order blocks come down in: the column nearest the crane first, top first. */
  private order(): { col: number; row: number }[] {
    const out: { col: number; row: number }[] = [];
    for (let col = 0; col < COLS; col++) {
      for (let row = this.rows - 1; row >= 0; row--) {
        if (out.length < gameState.currentProject.shed) out.push({ col, row });
      }
    }
    return out;
  }

  private blockAt(b: { col: number; row: number }): { x: number; y: number } {
    return { x: SHED_X + this.dx + b.col * BLOCK_W, y: this.gy - 6 - (b.row + 1) * BLOCK_H };
  }

  /** The shed's near wall: the left side of the first block still standing. */
  private face(): number | null {
    const next = this.order()[gameState.site.wrecked];
    return next ? this.blockAt(next).x : null;
  }

  /** Furthest the ball can be pushed by hand: up to the shed's wall. */
  private maxForward(): number {
    const face = this.face();
    if (face === null) return FORWARD;
    const reach = (face - BALL_R * S - 2 - this.tip.x) / this.length;
    return Math.min(FORWARD, Math.asin(Phaser.Math.Clamp(reach, -1, 1)));
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
    addSceneTitle(this, 'Riv det gamle skur ned', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const total = gameState.currentProject.shed;
    const wrecked = gameState.site.wrecked;

    // the rubble from what has come down, in a heap at the shed's foot
    const rubble = this.dyn(this.add.graphics());
    for (let i = 0; i < wrecked; i++) {
      const x = SHED_X + this.dx + 20 + ((i * 37) % (COLS * BLOCK_W));
      const y = this.gy - 10 - Math.floor(i / 3) * 6;
      rubble.save();
      rubble.fillStyle(COLORS.woodDeep);
      rubble.fillRect(x - 18, y - 4, 36, 8);
      rubble.lineStyle(1.5, COLORS.outline);
      rubble.strokeRect(x - 18, y - 4, 36, 8);
      rubble.restore();
    }

    // the shed: planked blocks, a door and a window, a tin roof while it still has one
    const shed = this.dyn(this.add.graphics());
    const standing = this.order().slice(wrecked);
    for (const b of standing) {
      const at = this.blockAt(b);
      plate(shed, at.x, at.y, BLOCK_W, BLOCK_H, 2, COLORS.wood, 1, 2);
      shed.lineStyle(1.5, COLORS.woodDeep);
      for (let ly = at.y + 9; ly < at.y + BLOCK_H - 2; ly += 9) shed.lineBetween(at.x + 3, ly, at.x + BLOCK_W - 3, ly);
      if (b.row === 0 && b.col === 1) plate(shed, at.x + 12, at.y + 6, 22, BLOCK_H - 6, 2, COLORS.woodDeep, 1, 1.5);
      if (b.row === 1 && b.col === 2) plate(shed, at.x + 12, at.y + 8, 22, 18, 2, COLORS.window, 1, 1.5);
    }
    if (wrecked === 0) {
      const top = this.gy - 6 - this.rows * BLOCK_H;
      const x0 = SHED_X + this.dx - 10;
      const w = COLS * BLOCK_W + 20;
      shed.fillStyle(COLORS.steelDeep);
      shed.fillPoints([{ x: x0, y: top }, { x: x0 + w, y: top }, { x: x0 + w - 12, y: top - 22 }, { x: x0 + 12, y: top - 22 }], true);
      shed.lineStyle(2.5, COLORS.outline);
      shed.strokePoints([{ x: x0, y: top }, { x: x0 + w, y: top }, { x: x0 + w - 12, y: top - 22 }, { x: x0 + 12, y: top - 22 }], true, true);
    }

    this.dyn(caption(this, this.scale.width - 120, 96, `${wrecked} af ${total}`, wrecked >= total ? 'done' : 'idle'));
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96,
      this.phase === 'swinging' ? 'Træk kuglen tilbage og giv slip' : ''));

    const crane = this.dyn(this.add.graphics().setName('wrecker'));
    const pointer = new Pointer(this, o => this.dyn(o));

    this.everyFrame(dt => {
      if (!this.grab) this.swing(dt);

      const ball = this.ball();
      const local = { x: (ball.x - CRANE_X - this.dx) / S, y: (ball.y - this.gy) / S };
      crane.setPosition(CRANE_X + this.dx, this.gy).setScale(S);
      crane.clear();
      drawMachine(crane, 'nedriv', undefined, { ball: local });

      if (this.phase !== 'swinging') {
        pointer.hide();
        return;
      }
      // the arrow says: take hold of the ball and pull it back
      if (!this.grab && Math.abs(this.spin) < 0.4) pointer.point(ball.x - 50, ball.y, 'left');
      else pointer.hide();
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  /** The ball on its chain, swinging under gravity, until it hits the shed. */
  private swing(dt: number): void {
    // a few small steps a frame keep a fast swing from passing through the wall
    const steps = 4;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.spin += (-G / this.length) * Math.sin(this.angle) * h;
      this.spin *= 1 - 0.4 * h;
      this.angle += this.spin * h;
      const face = this.face();
      if (face !== null && this.spin > 0 && this.ball().x + BALL_R * S >= face) {
        this.hit(this.spin);
        return;
      }
    }
  }

  private hit(speed: number): void {
    // back off the wall, bouncing
    this.angle = Math.min(this.angle, this.maxForward());
    this.spin = -Math.abs(speed) * 0.35;
    if (speed < HARD || this.phase !== 'swinging') {
      audio.thud();
      return;
    }
    const before = gameState.site.wrecked;
    const down = gameState.wreck();
    if (down <= 0) return;
    audio.clank();
    audio.thud();
    if (!reduceMotion()) this.cameras.main.shake(dur(140), 0.006);
    this.order().slice(before, before + down).forEach((b, i) => this.tumble(this.blockAt(b), i));
    if (gameState.shedDown) {
      this.time.delayedCall(dur(500), () => this.finish());
    }
    this.time.delayedCall(dur(60), () => this.refresh());
  }

  /** A block knocked off, falling and turning over onto the heap. */
  private tumble(at: { x: number; y: number }, i: number): void {
    const g = this.add.graphics().setPosition(at.x + BLOCK_W / 2, at.y + BLOCK_H / 2).setDepth(900);
    plate(g, -BLOCK_W / 2, -BLOCK_H / 2, BLOCK_W, BLOCK_H, 2, COLORS.wood, 1, 2);
    if (reduceMotion()) {
      g.destroy();
      return;
    }
    this.tweens.add({
      targets: g,
      x: g.x + 40 + i * 20,
      y: this.gy - 14,
      angle: 120 + i * 30,
      alpha: 0,
      duration: 650,
      ease: 'Quad.easeIn',
      onComplete: () => g.destroy(),
    });
    for (let k = 0; k < 5; k++) {
      const dust = this.add.circle(at.x + BLOCK_W / 2, at.y + BLOCK_H, Phaser.Math.Between(4, 8), COLORS.stone)
        .setStrokeStyle(1.2, COLORS.outline, 0.5).setDepth(900);
      this.tweens.add({
        targets: dust,
        x: dust.x + Phaser.Math.Between(-30, 50),
        y: this.gy - Phaser.Math.Between(10, 40),
        alpha: 0,
        duration: 600,
        onComplete: () => dust.destroy(),
      });
    }
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    this.grab = false;
    gameState.completeStage();
    const cx = SHED_X + this.dx + (COLS * BLOCK_W) / 2;
    audio.horn();
    showConfetti(this, cx, 240 + this.dy, 36);
    showPraise(this, cx, 210 + this.dy, 'Skuret er revet ned!');
    this.refresh();
  }
}
