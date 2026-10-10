import Phaser from 'phaser';
import { COLORS, SIZE } from '../config';
import { gameState } from '../state/GameState';
import { BANGS_PER_PILE } from '../state/Projects';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, caption } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing } from '../objects/FeedbackEffects';
import { MAST_X, drawMachine } from '../objects/MachineArt';
import {
  PILE_BELOW, drawGround, drawPile, groundY, holeFor, pileXs, siteSky, siteWeather,
} from '../objects/SiteArt';
import { stageDoneButton } from '../ui/StageDone';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

const S = 0.62;
const START_X = 150;
/** Where the building will stand, so the piles go where its hole will be. */
const HOLE_CX = 520;
/** A driven pile's head stays a little proud of the ground. */
const PROUD = 8;
/** Whole pile, head to tip. Before the first bang its tip just touches the ground. */
const PILE_LEN = PILE_BELOW + 44 + PROUD;
/** How high the hammer is hauled up before it drops, in machine units. */
const LIFT = 110;

type Phase = 'drive' | 'parked' | 'banging' | 'done';

/**
 * Banking the piles in, for a building heavy enough to need them.
 *
 * The rig is driven along the site until its mast stands over one of the marked crosses —
 * it clicks into place when it is close — and then every tap on "Bank!" hauls the hammer up
 * and drops it, and the pile goes a third of the way into the ground. Three bangs a pile;
 * the ground is drawn in cross-section, so the pile can be seen going in.
 *
 * Piles go in before the hole is dug, from level ground, the way a real pile rig works.
 */
export class PileScene extends BaseScene {
  private x = START_X;
  private phase: Phase = 'drive';
  /** The pile under the mast, while parked or banging. */
  private target = -1;
  private grab: number | null = null;
  /** The hammer's bottom edge, in machine units, while it is moving on its own. */
  private lifted: number | null = null;
  private beepTimer = 0;

  constructor() {
    super({ key: 'PileScene' });
  }

  init(): void {
    this.x = START_X + this.dx;
    this.phase = 'drive';
    this.target = -1;
    this.grab = null;
    this.lifted = null;
  }

  create(): void {
    if (gameState.stage.id !== 'pael') {
      this.scene.start('TownScene');
      return;
    }
    super.create();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase !== 'drive') return;
      // anywhere on or around the rig picks it up
      if (Math.abs(p.x - this.x) < 170 && p.y > this.gy - 280 && p.y < this.gy + 60) {
        this.grab = p.x - this.x;
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.grab === null || !p.isDown) return;
      this.moveTo(p.x - this.grab);
    });
    this.input.on('pointerup', () => { this.grab = null; });
  }

  private get gy(): number {
    return groundY(this);
  }

  /** Where the crosses are: under where the building's hole will be dug. */
  private get marks(): number[] {
    const p = gameState.currentProject;
    return pileXs(holeFor(p.pourCells, HOLE_CX + this.dx, this.gy), p.piles);
  }

  /** Where the mast is, on screen. */
  get mastX(): number {
    return this.x + MAST_X * S;
  }

  private bangs(i: number): number {
    return gameState.site.piles[i] ?? 0;
  }

  /** The first pile still to go in — where the arrow sends the rig. */
  private nextPile(): number {
    return this.marks.findIndex((_, i) => this.bangs(i) < BANGS_PER_PILE);
  }

  /** The top of a pile on screen, from how many bangs it has had. */
  private pileTop(i: number): number {
    const sunk = (this.bangs(i) / BANGS_PER_PILE) * (PILE_LEN - PROUD);
    return this.gy - PILE_LEN + sunk;
  }

  /** How close the mast has to come to a cross to click into place over it. */
  private get slack(): number {
    const m = this.marks;
    const gap = m.length > 1 ? m[1] - m[0] : 80;
    return Math.min(30, gap / 2 - 2);
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
    addSceneTitle(this, 'Bank pælene ned', COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    const marks = this.marks;
    const n = marks.length;
    const driven = marks.filter((_, i) => this.bangs(i) >= BANGS_PER_PILE).length;

    // the crosses, and the piles already in
    const ground = this.dyn(this.add.graphics());
    marks.forEach((x, i) => {
      if (this.bangs(i) >= BANGS_PER_PILE) {
        drawPile(ground, x, this.pileTop(i), PILE_LEN - 10);
        return;
      }
      if (i === this.target) return;
      ground.lineStyle(5, COLORS.outline, 0.9);
      ground.lineBetween(x - 9, this.gy - 12, x + 9, this.gy);
      ground.lineBetween(x + 9, this.gy - 12, x - 9, this.gy);
      ground.lineStyle(3, COLORS.white, 1);
      ground.lineBetween(x - 9, this.gy - 12, x + 9, this.gy);
      ground.lineBetween(x + 9, this.gy - 12, x - 9, this.gy);
    });

    this.dyn(caption(this, this.scale.width - 120, 96, `${driven} af ${n}`, driven >= n ? 'done' : 'idle'));
    const hint = this.phase === 'drive' ? 'Kør pælerammen hen til et kryds'
      : this.phase === 'parked' ? 'Tryk på Bank!' : '';
    this.dyn(hintBanner(this, this.scale.width / 2 - 40, 96, hint));

    const zone = this.dyn(this.add.graphics());
    const rig = this.dyn(this.add.graphics().setName('rig'));
    const pile = this.dyn(this.add.graphics());
    this.everyFrame(dt => {
      // the hammer rests on the pile's head, or high up the mast between piles
      const head = this.target >= 0 ? (this.pileTop(this.target) - this.gy) / S : -300;
      const hammer = this.lifted ?? head;
      rig.setPosition(this.x, this.gy).setScale(S);
      rig.clear();
      drawMachine(rig, 'pael', undefined, { hammer });

      pile.clear();
      if (this.target >= 0) {
        const sinking = this.lifted !== null && this.lifted > head ? (this.lifted - head) * S : 0;
        drawPile(pile, this.mastX, this.pileTop(this.target) + sinking, PILE_LEN - 10);
      }

      if (this.phase === 'drive' && this.grab !== null) {
        this.beepTimer -= dt;
        if (this.beepTimer <= 0) {
          audio.beep();
          this.beepTimer = 0.45;
        }
      }
    });

    if (this.phase === 'parked') {
      const bang = button(this, this.bangX, this.scale.height - 52, 'Bank!', COLORS.orange,
        () => this.bang(), 150, 56, SIZE.heading);
      bang.setName('bang');
      this.dyn(bang);
      popIn(this, bang, 0, 0.6);
    }

    if (this.phase === 'done') stageDoneButton(this, o => this.dyn(o));

    // driving: the arrow stands over the next cross; parked: it points at the button
    const pointer = new Pointer(this, o => this.dyn(o));
    this.everyFrame(() => {
      zone.clear();
      const next = this.nextPile();
      if (this.phase === 'drive' && next >= 0) {
        const x = marks[next];
        drawTargetZone(zone, this, x - 24, this.gy - 30, 48, 36, 'round');
        if (this.grab === null) pointer.point(x, this.gy - 40);
        else pointer.hide();
      } else if (this.phase === 'parked') {
        pointer.point(this.bangX, this.scale.height - 86);
      } else {
        pointer.hide();
      }
    });
  }

  /** "Bank!" sits under the rig's body, clear of the pile going into the ground. */
  private get bangX(): number {
    return Math.max(90, this.mastX - 130);
  }

  private moveTo(x: number): void {
    const marks = this.marks;
    const furthest = marks[marks.length - 1] - MAST_X * S + 40;
    this.x = Phaser.Math.Clamp(x, 70 + this.dx, furthest);
    const slack = this.slack;
    const i = marks.findIndex((m, k) => this.bangs(k) < BANGS_PER_PILE && Math.abs(m - this.mastX) < slack);
    if (i < 0) return;
    // close enough: the mast clicks in over the cross, and a pile is hoisted into it
    this.x = marks[i] - MAST_X * S;
    this.grab = null;
    this.target = i;
    this.phase = 'parked';
    audio.clank();
    showRing(this, marks[i], this.gy - 6, COLORS.green);
    this.refresh();
  }

  /** One hit: haul the hammer up, let it drop, and the pile goes a third of the way in. */
  private bang(): void {
    if (this.phase !== 'parked' || this.target < 0) return;
    this.phase = 'banging';
    this.refresh();
    const head = (this.pileTop(this.target) - this.gy) / S;

    const impact = () => {
      this.lifted = null;
      audio.clank();
      audio.thud();
      this.dust(this.mastX, this.gy - 4);
      if (!reduceMotion()) this.cameras.main.shake(dur(120), 0.004);
      const pileIn = gameState.bang(this.target);
      if (pileIn) {
        const x = this.mastX;
        showRing(this, x, this.gy - 6, COLORS.machine);
        award(this, 1, x, this.gy - 20);
        this.target = -1;
        if (gameState.pilesDone) {
          this.finish();
          return;
        }
        this.phase = 'drive';
      } else {
        this.phase = 'parked';
      }
      this.refresh();
    };

    if (reduceMotion()) {
      impact();
      return;
    }
    audio.winch();
    const state = { y: head };
    this.tweens.chain({
      targets: state,
      tweens: [
        { y: head - LIFT, duration: 320, ease: 'Sine.easeOut', onUpdate: () => { this.lifted = state.y; } },
        // falls to where the pile's head will be once this bang has driven it
        {
          y: head + ((PILE_LEN - PROUD) / BANGS_PER_PILE) / S,
          duration: 130,
          ease: 'Quad.easeIn',
          onUpdate: () => { this.lifted = state.y; },
        },
      ],
      onComplete: impact,
    });
  }

  private dust(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const c = this.add.circle(x + Phaser.Math.Between(-20, 20), y, Phaser.Math.Between(4, 8), COLORS.dirtLight)
        .setStrokeStyle(1.2, COLORS.outline, 0.5).setDepth(900);
      this.tweens.add({
        targets: c,
        x: c.x + Phaser.Math.Between(-40, 40),
        y: y - Phaser.Math.Between(10, 34),
        alpha: 0,
        duration: dur(520),
        onComplete: () => c.destroy(),
      });
    }
  }

  private finish(): void {
    this.phase = 'done';
    gameState.completeStage();
    const marks = this.marks;
    const cx = (marks[0] + marks[marks.length - 1]) / 2;
    audio.horn();
    showConfetti(this, cx, 220 + this.dy, 36);
    showPraise(this, cx, 200 + this.dy, 'Pælene er banket ned!');
    award(this, 3, cx, this.gy);
    this.refresh();
  }
}
