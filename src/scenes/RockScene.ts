import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { caption, plate } from '../helpers/Draw';
import { dur } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing, showSparkle } from '../objects/FeedbackEffects';
import { LOADER_REST, Pt, drawMachine, drawRock, loaderTip } from '../objects/MachineArt';
import { drawGround, groundY, siteSky, siteWeather } from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.62;
const START_X = 330;
/** The skip the rocks go in, at the left of the plot. */
const SKIP_X = 96;
const SKIP_W = 130;
const SKIP_H = 70;
/** The rocks lie across this stretch of the plot. */
const ROCKS_FROM = 430;
const ROCKS_TO = 800;
/** The arm raised, carrying, high enough to tip over the skip's side. */
const ARM_UP = -0.35;

/**
 * Clearing the rocks off the plot.
 *
 * Big rocks lie where the building is going. The child drives the wheel loader into them —
 * dragged, like the truck — and the bucket scoops one up; then turns round and drives to the
 * skip, and the bucket tips them in. The loader always faces the way it is going, so driving
 * back to the skip turns it round with its bucket in front. A bigger bucket holds two rocks,
 * then four, before it lifts.
 */
export class RockScene extends BaseScene {
  private x = START_X;
  private face: 1 | -1 = 1;
  private grab: number | null = null;
  /** Rocks in the bucket, by index. */
  private carried: number[] = [];
  private arm = LOADER_REST;
  private tilt = 0;
  private roll = 0;
  private tipping = false;
  private phase: 'clearing' | 'done' = 'clearing';

  constructor() {
    super({ key: 'RockScene' });
  }

  init(): void {
    this.x = START_X + this.dx;
    this.face = 1;
    this.grab = null;
    this.carried = [];
    this.arm = LOADER_REST;
    this.tilt = 0;
    this.roll = 0;
    this.tipping = false;
    this.phase = 'clearing';
  }

  create(): void {
    if (gameState.stage.id !== 'sten') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'clearing' || this.tipping) return;
      if (Math.abs(p.x - this.x) < 170 && p.y > this.gy - 190 && p.y < this.gy + 60) {
        this.grab = p.x - this.x;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab === null || !p.isDown || this.tipping) return;
      this.driveTo(p.x - this.grab);
    });
    this.input.on('pointerup', () => { this.grab = null; });
  }

  private get gy(): number {
    return groundY(this);
  }

  private get skip() {
    return { x: SKIP_X + this.dx - SKIP_W / 2, y: this.gy - SKIP_H, w: SKIP_W, h: SKIP_H };
  }

  /** Where each rock lies, on screen, and how big it is. */
  rock(i: number): { x: number; y: number; r: number } {
    const n = gameState.currentProject.rocks;
    const t = n > 1 ? i / (n - 1) : 0.5;
    const r = 20 + ((i * 7) % 3) * 3;
    return { x: Phaser.Math.Linear(ROCKS_FROM, ROCKS_TO, t) + this.dx, y: this.gy - 6 - r * 0.6, r };
  }

  /** Whether a rock still lies on the ground, neither in the skip nor in the bucket. */
  private onGround(i: number): boolean {
    return gameState.rockLeft(i) && !this.carried.includes(i);
  }

  /** The middle of the bucket's mouth, on screen. */
  private bucketAt(): Pt {
    const tip = loaderTip(this.arm);
    return { x: this.x + this.face * (tip.x + 36) * S, y: this.gy + (tip.y + 6) * S };
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
    addSceneTitle(this, 'Saml stenene op', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const n = gameState.currentProject.rocks;
    const inSkip = gameState.site.rocks.length;

    // the skip, with the rocks already in it heaped up inside
    const skip = this.dyn(this.add.graphics());
    const k = this.skip;
    for (let i = 0; i < Math.min(inSkip, 8); i++) {
      drawRock(skip, k.x + 22 + (i % 4) * 28, k.y + 8 - Math.floor(i / 4) * 14, 15);
    }
    skip.fillStyle(COLORS.blue);
    skip.fillPoints([
      { x: k.x - 10, y: k.y }, { x: k.x + k.w + 10, y: k.y }, { x: k.x + k.w - 6, y: k.y + k.h - 4 }, { x: k.x + 6, y: k.y + k.h - 4 },
    ], true);
    skip.lineStyle(2.5, COLORS.outline);
    skip.strokePoints([
      { x: k.x - 10, y: k.y }, { x: k.x + k.w + 10, y: k.y }, { x: k.x + k.w - 6, y: k.y + k.h - 4 }, { x: k.x + 6, y: k.y + k.h - 4 },
    ], true, true);
    skip.lineStyle(2, COLORS.waterDeep);
    for (let x = k.x + 20; x < k.x + k.w - 8; x += 24) skip.lineBetween(x, k.y + 8, x, k.y + k.h - 12);
    plate(skip, k.x + 10, k.y + k.h - 6, 20, 8, 3, COLORS.rubber, 1, 1.5);
    plate(skip, k.x + k.w - 30, k.y + k.h - 6, 20, 8, 3, COLORS.rubber, 1, 1.5);

    const rocks = this.dyn(this.add.graphics());
    const drawRocks = () => {
      rocks.clear();
      for (let i = 0; i < n; i++) {
        if (!this.onGround(i)) continue;
        const r = this.rock(i);
        drawRock(rocks, r.x, r.y, r.r);
      }
    };
    drawRocks();

    this.dyn(caption(this, this.scale.width - 120, 96, `${inSkip} af ${n}`, inSkip >= n ? 'done' : 'idle'));
    const room = gameState.bucketRocks;
    const full = this.carried.length >= room || this.carried.length >= n - inSkip;
    const hint = this.phase !== 'clearing' ? ''
      : full ? 'Kør stenene hen til containeren'
        : room > 1 ? `Saml ${Math.min(room, n - inSkip)} sten op i skovlen` : 'Kør hen og tag en sten';
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96, hint));

    const zone = this.dyn(this.add.graphics());
    const loader = this.dyn(this.add.graphics().setName('loader'));
    const pointer = new Pointer(this, o => this.dyn(o));

    let lastBucket = this.bucketAt().x;
    this.everyFrame(dt => {
      // the arm goes up once the bucket is full, or on the way back to the skip with some
      const loaded = this.carried.length > 0;
      const wantUp = !this.tipping && loaded && (this.full() || this.face === -1);
      const want = this.tipping ? ARM_UP : wantUp ? ARM_UP : LOADER_REST;
      this.arm += (want - this.arm) * Math.min(1, dt * 6);
      const wantTilt = this.tipping ? -0.9 : loaded ? 0.35 : 0;
      this.tilt += (wantTilt - this.tilt) * Math.min(1, dt * 8);

      loader.setPosition(this.x, this.gy).setScale(S * this.face, S);
      loader.clear();
      drawMachine(loader, 'laesser', undefined, {
        loader: { arm: this.arm, tilt: this.tilt, rocks: this.tipping ? 0 : this.carried.length, roll: this.roll },
      });

      if (this.phase !== 'clearing' || this.tipping) {
        zone.clear();
        pointer.hide();
        return;
      }

      // scoop: the bucket low, facing the rocks, with room in it
      // (everything the bucket's mouth passed over since the last frame, so a quick drag
      // does not jump it over a rock)
      const b = this.bucketAt();
      const from = Math.min(lastBucket, b.x);
      const to = Math.max(lastBucket, b.x);
      lastBucket = b.x;
      if (this.face === 1 && !this.full() && this.arm > LOADER_REST - 0.15) {
        let picked = false;
        for (let i = 0; i < n && !this.full(); i++) {
          if (!this.onGround(i)) continue;
          const r = this.rock(i);
          if (r.x > from - r.r - 14 && r.x < to + r.r + 14) {
            this.carried.push(i);
            picked = true;
            showRing(this, r.x, r.y, COLORS.stone);
          }
        }
        if (picked) {
          audio.scoop();
          this.refresh();
          return;
        }
      }

      // tip: carrying, facing the skip, the bucket over it
      if (loaded && this.face === -1) {
        if (b.x < k.x + k.w + 6) {
          this.tip();
          return;
        }
      }

      zone.clear();
      if (loaded && (this.full() || this.face === -1)) {
        drawTargetZone(zone, this, k.x - 12, k.y - 60, k.w + 24, 56);
        if (this.grab === null) pointer.point(k.x + k.w / 2, k.y - 62);
        else pointer.hide();
      } else {
        const next = Array.from({ length: n }, (_, i) => i).find(i => this.onGround(i));
        if (next === undefined) {
          pointer.hide();
          return;
        }
        const r = this.rock(next);
        drawTargetZone(zone, this, r.x - r.r - 10, r.y - r.r - 10, r.r * 2 + 20, r.r * 2 + 16, 'round');
        if (this.grab === null) pointer.point(r.x, r.y - r.r - 12);
        else pointer.hide();
      }
    });

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));
  }

  /** Whether the bucket holds all it can, or every rock still lying about. */
  private full(): boolean {
    const left = gameState.currentProject.rocks - gameState.site.rocks.length;
    return this.carried.length >= Math.min(gameState.bucketRocks, left);
  }

  private driveTo(x: number): void {
    const min = this.skip.x + this.skip.w + 40;
    const max = ROCKS_TO + this.dx + 30;
    const to = Phaser.Math.Clamp(x, min, max);
    const moved = to - this.x;
    // the loader faces the way it drives
    if (moved > 3) this.face = 1;
    else if (moved < -3) this.face = -1;
    this.roll += moved / (36 * S);
    this.x = to;
  }

  /** Tips the bucket into the skip. */
  private tip(): void {
    if (this.tipping) return;
    this.tipping = true;
    this.grab = null;
    const rocks = [...this.carried];
    audio.dump();
    this.time.delayedCall(dur(450), () => {
      this.carried = [];
      gameState.dumpRocks(rocks);
      const k = this.skip;
      showSparkle(this, k.x + k.w / 2, k.y, k.w, 40);
      this.time.delayedCall(dur(250), () => {
        this.tipping = false;
        if (gameState.rocksCleared) this.finish();
        else this.refresh();
      });
    });
  }

  private finish(): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    gameState.completeStage();
    const cx = (ROCKS_FROM + ROCKS_TO) / 2 + this.dx;
    audio.horn();
    showConfetti(this, cx, 240 + this.dy, 36);
    showPraise(this, cx, 210 + this.dy, 'Stenene er væk!');
    this.refresh();
  }
}
