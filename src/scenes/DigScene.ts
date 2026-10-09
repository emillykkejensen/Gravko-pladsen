import Phaser from 'phaser';
import { COLORS } from '../config';
import { gameState } from '../state/GameState';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { caption } from '../helpers/Draw';
import { dur } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise } from '../objects/FeedbackEffects';
import { ArmPose, GRAVKO_REST, Pt, drawMachine } from '../objects/MachineArt';
import { GROUND_Y, drawGround, drawHole, siteSky, siteWeather } from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.8;
const BASE_X = 232;
/** Boom and stick, longer than in the workshop drawing so the bucket reaches the whole hole. */
const L1 = 222;
const L2 = 172;
/** How far below the wrist the bucket's teeth are, in machine units. */
const TIP = 46;
/** Machine units per second the bucket moves towards the finger. */
const SPEED = 720;

const CHUNK_W = 36;
const CHUNK_H = 32;
const HOLE_X = 342;

/** The spoil heap behind the excavator. */
const HEAP_X = 70;
/** A full bucket anywhere left of this, above the ground, empties onto the heap. */
const DUMP_RIGHT = 170;
const DUMP_TOP = GROUND_Y - 190;

/**
 * Digging the hole.
 *
 * The child drags the bucket and the excavator works out the arm, the same way a real
 * operator thinks about where the bucket goes rather than which lever does what. Drag it
 * into the earth and it bites off a chunk; swing it back over the heap and it empties.
 * The excavator turns round on its tracks to face whichever side the finger is on.
 *
 * Only the top chunk in each column can be reached — a hole is dug from the top down.
 */
export class DigScene extends BaseScene {
  /** Wrist position in machine coordinates, eased towards `goal`. */
  private wrist: Pt = { ...GRAVKO_REST.wrist };
  private goal: Pt = { ...GRAVKO_REST.wrist };
  private face = 1;
  private carried = 0;
  private bucket = 0.2;
  private finished = false;

  constructor() {
    super({ key: 'DigScene' });
  }

  init(): void {
    this.wrist = { ...GRAVKO_REST.wrist };
    this.goal = { ...GRAVKO_REST.wrist };
    this.face = 1;
    this.carried = 0;
    this.bucket = 0.2;
    this.finished = false;
  }

  create(): void {
    if (gameState.stage.id !== 'grav') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    const steer = (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.finished) return;
      this.steer(p.x, p.y);
    };
    this.input.on('pointerdown', steer);
    this.input.on('pointermove', steer);
  }

  private get hole() {
    const p = gameState.currentProject;
    return { x: HOLE_X, y: GROUND_Y, w: p.holeCols * CHUNK_W, h: p.holeRows * CHUNK_H };
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    siteSky(this, o => this.bg(o));
    const g = this.add.graphics();
    drawGround(g, width, height);
    this.bg(g);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Grav hullet', COLORS.machineDeep);
    addStarCounter(this);
  }

  /** Points the bucket's teeth at a spot on screen. */
  private steer(x: number, y: number): void {
    // turn round when the finger goes behind the cab
    if (this.face === 1 && x < BASE_X - 30) this.face = -1;
    else if (this.face === -1 && x > BASE_X + 30) this.face = 1;
    this.goal = {
      x: (x - BASE_X) / (S * this.face),
      y: (y - GROUND_Y) / S - TIP,
    };
  }

  protected buildDynamic(): void {
    const p = gameState.currentProject;
    const hole = this.hole;

    // the dug part of the hole, chunk by chunk, and the earth still in it
    const earth = this.dyn(this.add.graphics());
    const drawEarth = () => {
      earth.clear();
      for (let col = 0; col < p.holeCols; col++) {
        for (let layer = 0; layer < p.holeRows; layer++) {
          const i = col * p.holeRows + layer;
          const x = hole.x + col * CHUNK_W;
          const y = hole.y + layer * CHUNK_H;
          if (gameState.site.dug.includes(i)) {
            earth.fillStyle(COLORS.dirtDeep);
            earth.fillRect(x, y - (layer === 0 ? 6 : 0), CHUNK_W, CHUNK_H + (layer === 0 ? 6 : 0));
          } else if (gameState.canDig(i)) {
            // the chunk the bucket can reach next is a shade lighter
            earth.fillStyle(COLORS.dirtLight, 0.7);
            earth.fillRect(x + 2, y + 2, CHUNK_W - 4, CHUNK_H - 4);
            earth.lineStyle(2, COLORS.white, 0.6);
            earth.strokeRect(x + 2, y + 2, CHUNK_W - 4, CHUNK_H - 4);
          }
        }
      }
      if (gameState.holeDug) drawHole(earth, hole);
      // pegs and string marking out the hole
      earth.lineStyle(2, COLORS.white, 0.95);
      earth.lineBetween(hole.x - 4, GROUND_Y - 14, hole.x + hole.w + 4, GROUND_Y - 14);
      earth.fillStyle(COLORS.orange);
      for (const px of [hole.x - 6, hole.x + hole.w + 2]) {
        earth.fillRect(px, GROUND_Y - 22, 5, 22);
        earth.lineStyle(1.5, COLORS.outline);
        earth.strokeRect(px, GROUND_Y - 22, 5, 22);
      }
    };
    drawEarth();

    // the heap grows with every bucket tipped on it
    const heap = this.dyn(this.add.graphics());
    const drawHeap = () => {
      const n = gameState.site.dug.length - (this.carried > 0 ? 1 : 0);
      heap.clear();
      if (n <= 0) return;
      const total = p.holeCols * p.holeRows;
      const h = 14 + (n / total) * 70;
      const w = 70 + (n / total) * 90;
      heap.fillStyle(COLORS.dirtDeep);
      heap.fillEllipse(HEAP_X, GROUND_Y, w + 8, h * 2 + 8);
      heap.fillStyle(COLORS.dirt);
      heap.fillEllipse(HEAP_X - 4, GROUND_Y - 3, w, h * 2);
      heap.fillStyle(COLORS.dirtLight);
      heap.fillEllipse(HEAP_X - 14, GROUND_Y - h * 0.7, w * 0.3, h * 0.4);
      heap.lineStyle(2.5, COLORS.outline, 0.9);
      heap.strokeEllipse(HEAP_X, GROUND_Y, w + 8, h * 2 + 8);
      // ground hides the bottom half of the ellipse
      heap.fillStyle(COLORS.grass);
      heap.fillRect(HEAP_X - w, GROUND_Y - 2, w * 2, 8);
    };
    drawHeap();

    // where a full bucket goes: the whole patch over the heap glows
    const zone = this.dyn(this.add.graphics());

    // the machine: tracks stay put, the upper body turns round
    const tracks = this.dyn(this.add.graphics().setPosition(BASE_X, GROUND_Y).setScale(S));
    drawMachine(tracks, 'gravko', ['baelter']);
    const upper = this.dyn(this.add.graphics().setPosition(BASE_X, GROUND_Y).setScale(S));

    let hint: Phaser.GameObjects.Container | null = null;
    const setHint = () => {
      hint?.destroy();
      hint = this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96,
        this.finished ? '' : this.carried > 0 ? 'Tøm skovlen på jordbunken' : 'Grav jord op af hullet'));
    };
    setHint();

    let progress = this.dyn(caption(this, this.scale.width - 120, 96,
      `${gameState.site.dug.length} af ${p.holeCols * p.holeRows}`));
    const updateProgress = () => {
      progress.destroy();
      progress = this.dyn(caption(this, this.scale.width - 120, 96,
        `${gameState.site.dug.length} af ${p.holeCols * p.holeRows}`, gameState.holeDug ? 'done' : 'idle'));
    };

    this.everyFrame(dt => {
      // ease the wrist towards the goal
      const dx = this.goal.x - this.wrist.x;
      const dy = this.goal.y - this.wrist.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist > step) {
        this.wrist.x += (dx / dist) * step;
        this.wrist.y += (dy / dist) * step;
      } else {
        this.wrist = { ...this.goal };
      }
      // the bucket curls in when full, hangs open when empty
      const want = this.carried > 0 ? 1.25 : 0.15;
      this.bucket += (want - this.bucket) * Math.min(1, dt * 10);

      const pose = this.solve();
      upper.setScale(S * this.face, S);
      upper.clear();
      drawMachine(upper, 'gravko', ['bom', 'arm', 'skovl', 'krop', 'hus'], { arm: pose });

      zone.clear();
      if (this.finished) {
        pointer.hide();
        return;
      }
      if (this.carried > 0) {
        drawTargetZone(zone, this, 12, DUMP_TOP, DUMP_RIGHT - 12, GROUND_Y - 6 - DUMP_TOP);
        pointer.point(HEAP_X + 10, GROUND_Y - 70);
      } else {
        const next = this.nextChunk();
        if (next) pointer.point(next.x, next.y);
        else pointer.hide();
      }

      const tip = this.tipOnScreen(pose);
      if (this.carried === 0) {
        const chunk = this.chunkAt(tip);
        if (chunk >= 0 && gameState.dig(chunk)) {
          this.carried = 1;
          audio.scoop();
          this.crumbs(tip.x, tip.y, COLORS.dirt);
          drawEarth();
          updateProgress();
          setHint();
        }
      } else if (tip.x < DUMP_RIGHT && tip.y < GROUND_Y - 6) {
        this.carried = 0;
        this.bucket = -0.6;
        audio.dump();
        this.crumbs(tip.x, tip.y, COLORS.dirt, 10);
        drawHeap();
        setHint();
        if (gameState.holeDug) this.finish();
      }
    });

    // last, so it draws over the excavator's arm
    const pointer = new Pointer(this, o => this.dyn(o));
  }

  /** The top of the next chunk the bucket can reach, on screen — where the arrow points. */
  private nextChunk(): Pt | null {
    const p = gameState.currentProject;
    for (let col = 0; col < p.holeCols; col++) {
      for (let layer = 0; layer < p.holeRows; layer++) {
        if (gameState.canDig(col * p.holeRows + layer)) {
          return { x: this.hole.x + (col + 0.5) * CHUNK_W, y: this.hole.y + layer * CHUNK_H + 4 };
        }
      }
    }
    return null;
  }

  /** Two-bone IK: the elbow that puts the wrist where it should be, bending upward. */
  private solve(): ArmPose {
    const r = GRAVKO_REST.root;
    let dx = this.wrist.x - r.x;
    let dy = this.wrist.y - r.y;
    let d = Math.hypot(dx, dy);
    const max = L1 + L2 - 1;
    const min = Math.abs(L1 - L2) + 1;
    if (d > max || d < min) {
      const k = Phaser.Math.Clamp(d, min, max) / (d || 1);
      dx *= k;
      dy *= k;
      d = Math.hypot(dx, dy);
      this.wrist = { x: r.x + dx, y: r.y + dy };
    }
    const a = Math.atan2(dy, dx);
    const b = Math.acos(Phaser.Math.Clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const e1 = { x: r.x + Math.cos(a - b) * L1, y: r.y + Math.sin(a - b) * L1 };
    const e2 = { x: r.x + Math.cos(a + b) * L1, y: r.y + Math.sin(a + b) * L1 };
    const elbow = e1.y < e2.y ? e1 : e2;
    return { root: r, elbow, wrist: { ...this.wrist }, bucket: this.bucket, load: this.carried };
  }

  private tipOnScreen(pose: ArmPose): Pt {
    // the teeth, rotated with the bucket, in machine coordinates
    const tx = pose.wrist.x - Math.sin(pose.bucket) * TIP;
    const ty = pose.wrist.y + Math.cos(pose.bucket) * TIP;
    return { x: BASE_X + tx * S * this.face, y: GROUND_Y + ty * S };
  }

  private chunkAt(tip: Pt): number {
    const p = gameState.currentProject;
    const hole = this.hole;
    const col = Math.floor((tip.x - hole.x) / CHUNK_W);
    const layer = Math.floor((tip.y - hole.y + 8) / CHUNK_H);
    if (col < 0 || col >= p.holeCols || layer < 0 || layer >= p.holeRows) return -1;
    // reaching into a deeper chunk digs the top one left in that column
    for (let l = 0; l <= layer; l++) {
      const i = col * p.holeRows + l;
      if (gameState.canDig(i)) return i;
    }
    return -1;
  }

  private crumbs(x: number, y: number, color: number, count = 6): void {
    for (let i = 0; i < count; i++) {
      const c = this.add.circle(x + Phaser.Math.Between(-12, 12), y, Phaser.Math.Between(3, 6), color)
        .setStrokeStyle(1.2, COLORS.outline, 0.6).setDepth(900);
      this.tweens.add({
        targets: c,
        y: y + Phaser.Math.Between(20, 50),
        x: c.x + Phaser.Math.Between(-20, 20),
        alpha: 0,
        duration: dur(500),
        onComplete: () => c.destroy(),
      });
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    gameState.completeStage();
    this.goal = { ...GRAVKO_REST.wrist };
    this.face = 1;
    const hole = this.hole;
    this.time.delayedCall(dur(300), () => {
      audio.horn();
      showConfetti(this, hole.x + hole.w / 2, 260, 36);
      showPraise(this, hole.x + hole.w / 2, 220, 'Hullet er gravet!');
      award(this, 3, hole.x + hole.w / 2, GROUND_Y);
      stageDoneButton(this, o => this.dyn(o));
    });
  }
}
