import Phaser from 'phaser';
import { COLORS, DEPTH, SIZE } from '../config';
import { gameState } from '../state/GameState';
import { MACHINES, MachineId } from '../state/Machines';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, caption, plate } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showConfetti, showPraise, showRing, showSparkle } from '../objects/FeedbackEffects';
import { ART, drawMachine, drawMachineProgress, machineBounds, partGraphic } from '../objects/MachineArt';
import { FLOOR_Y, workshopBackdrop } from '../objects/SiteArt';
import { Pointer, drawTargetZone, hintBanner } from '../ui/Guide';
import { BaseScene } from './BaseScene';

/**
 * How close to its place a part has to be let go for it to snap on, at the least. Bigger
 * parts get more on top (see `snapRadius`). Generous on purpose: a small hand dragging on
 * a phone lands a part roughly where it goes, and roughly is good enough.
 */
const SNAP = 120;

/** Where the parts lie on the floor. */
const PILE_Y = 498;

interface Drag {
  part: string;
  c: Phaser.GameObjects.Container;
  home: { x: number; y: number };
  homeScale: number;
}

/**
 * Building a machine: drag each part from the floor to where it goes.
 *
 * The finished machine is drawn as a pale silhouette, so the child can see the shape they
 * are building before it exists. Parts go on in any order, and every empty place pulses.
 * Picking a part up lights up the big patch it snaps to; let go anywhere in that patch and
 * it clicks on. A part let go far away slides back to the floor: nothing breaks, nothing
 * is lost.
 */
export class AssembleScene extends BaseScene {
  private machine: MachineId = 'gravko';
  private drag: Drag | null = null;
  private origin = { x: 0, y: 0 };
  private scaleM = 1;

  constructor() {
    super({ key: 'AssembleScene' });
  }

  init(data: { machine?: MachineId }): void {
    this.machine = data?.machine && MACHINES[data.machine] ? data.machine : 'gravko';
    this.drag = null;
  }

  create(): void {
    // The workshop only offers machines the site has a job for; a stale route or the
    // back button must not open one that is still locked.
    if (!gameState.isUnlocked(this.machine)) {
      this.scene.start('GarageScene');
      return;
    }
    // Fit the machine into the space above the floor, a little right of centre.
    const b = machineBounds(this.machine);
    this.scaleM = Math.min(1, 540 / b.w, 280 / b.h);
    this.origin = {
      x: 470 - (b.x + b.w / 2) * this.scaleM,
      y: FLOOR_Y - 14,
    };

    super.create();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.drag) this.drag.c.setPosition(p.x, p.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.drop(p.x, p.y));
    this.input.on('gameout', () => this.drop(-999, -999));
  }

  protected buildBackground(): void {
    workshopBackdrop(this, o => this.bg(o));
    // the lift the machine is built on
    const g = this.add.graphics();
    plate(g, this.origin.x - 230, FLOOR_Y - 18, 460, 16, 6, COLORS.steel, 1, 2.5);
    this.bg(g);
    // a pallet under the parts
    const p = this.add.graphics();
    plate(p, 20, PILE_Y + 26, this.scale.width - 40, 12, 4, COLORS.wood, 1, 2);
    this.bg(p);
  }

  protected buildChrome(): void {
    addBackButton(this, 'GarageScene');
    addSceneTitle(this, `Byg ${MACHINES[this.machine].name.toLowerCase()}`, COLORS.machineDeep);
    addStarCounter(this);
  }

  /** Where a part's middle ends up when it is on the machine. */
  private target(part: string): { x: number; y: number } {
    const c = ART[this.machine][part].center;
    return { x: this.origin.x + c.x * this.scaleM, y: this.origin.y + c.y * this.scaleM };
  }

  /** How far from its place a part can be let go and still snap on. */
  private snapRadius(part: string): number {
    const { w, h } = ART[this.machine][part].size;
    return Math.max(SNAP, Math.max(w, h) * this.scaleM * 0.5 + 60);
  }

  protected buildDynamic(): void {
    const def = MACHINES[this.machine];
    const placed = gameState.machines[this.machine].parts;

    // the patch the part in hand snaps to, under everything else
    const zone = this.dyn(this.add.graphics());

    // silhouette plus whatever is already on
    const m = this.dyn(this.add.graphics().setPosition(this.origin.x, this.origin.y).setScale(this.scaleM));
    drawMachineProgress(m, this.machine, placed);

    // every place still waiting for its part
    for (const part of def.parts) {
      if (!gameState.canPlace(this.machine, part.id)) continue;
      const t = this.target(part.id);
      const slot = this.dyn(this.add.container(t.x, t.y)).setName(`slot:${part.id}`).setScale(this.scaleM);
      slot.add(partGraphic(this, this.machine, part.id, true));
      if (!reduceMotion()) {
        this.tweens.add({ targets: slot, alpha: 0.35, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }

    if (gameState.isBuilt(this.machine)) {
      this.buildFinished();
      return;
    }

    // the parts still on the floor — in reverse, so the first part is not simply leftmost
    const loose = def.parts.filter(p => !placed.includes(p.id)).reverse();
    const spacing = (this.scale.width - 80) / Math.max(loose.length, 1);
    loose.forEach((part, i) => {
      const art = ART[this.machine][part.id];
      const x = 40 + spacing * (i + 0.5);
      const scale = Math.min(0.85, (spacing - 18) / art.size.w, 86 / art.size.h);
      const c = this.dyn(this.add.container(x, PILE_Y)).setName(`part:${part.id}`).setScale(scale);
      c.add(partGraphic(this, this.machine, part.id));
      c.setSize(Math.max(art.size.w, 70 / scale), Math.max(art.size.h, 70 / scale));
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p: Phaser.Input.Pointer) => this.pickUp(part.id, c, p));
    });

    this.dyn(hintBanner(this, this.scale.width / 2, 96, 'Træk delene op på maskinen'));

    // Nothing in hand: the arrow points at a part on the floor. A part in hand: the arrow
    // points at where it goes, and that place glows.
    const firstLoose = this.dynamic.getByName(`part:${loose[0].id}`) as Phaser.GameObjects.Container;
    const pointer = new Pointer(this, o => this.dyn(o));
    this.everyFrame(() => {
      zone.clear();
      if (this.drag) {
        const t = this.target(this.drag.part);
        const r = this.snapRadius(this.drag.part);
        drawTargetZone(zone, this, t.x - r, t.y - r * 0.8, r * 2, r * 1.6, 'round');
        const art = ART[this.machine][this.drag.part];
        pointer.point(t.x, t.y - (art.size.h * this.scaleM) / 2 - 6);
      } else {
        pointer.point(firstLoose.x, PILE_Y - 52);
      }
    });
  }

  private pickUp(part: string, c: Phaser.GameObjects.Container, p: Phaser.Input.Pointer): void {
    if (this.drag) return;
    audio.tap();
    this.drag = { part, c, home: { x: c.x, y: c.y }, homeScale: c.scale };
    this.dynamic.bringToTop(c);
    c.setPosition(p.x, p.y);
    this.tweens.add({ targets: c, scale: this.scaleM, duration: dur(140), ease: 'Back.easeOut' });
  }

  private drop(x: number, y: number): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;

    const t = this.target(drag.part);
    const r = this.snapRadius(drag.part);
    const near = Phaser.Math.Distance.Between(drag.c.x, drag.c.y, t.x, t.y) < r
      || Phaser.Math.Distance.Between(x, y, t.x, t.y) < r;

    if (near && gameState.placePart(this.machine, drag.part)) {
      drag.c.setPosition(t.x, t.y).setScale(this.scaleM);
      audio.clank();
      showSparkle(this, t.x, t.y, 90, 70);
      showRing(this, t.x, t.y, COLORS.machine);
      const done = gameState.isBuilt(this.machine);
      award(this, 1, t.x, t.y);
      if (done) {
        this.celebrate();
      }
      this.refresh();
      return;
    }

    audio.thud();
    this.tweens.add({
      targets: drag.c,
      x: drag.home.x,
      y: drag.home.y,
      scale: drag.homeScale,
      duration: dur(260),
      ease: 'Quad.easeOut',
    });
  }

  private celebrate(): void {
    const cx = this.origin.x + 60;
    this.time.delayedCall(dur(250), () => {
      audio.engine();
      showConfetti(this, cx, 220, 36);
      showPraise(this, cx, 200, `${MACHINES[this.machine].short} er bygget!`);
      award(this, 3, cx, 240);
    });
    if (!reduceMotion()) {
      this.time.delayedCall(900, () => audio.horn());
    }
  }

  private buildFinished(): void {
    // A finished machine is redrawn whole, so its moving parts sit in their rest pose.
    const m = this.dyn(this.add.graphics().setPosition(this.origin.x, this.origin.y).setScale(this.scaleM));
    drawMachine(m, this.machine);

    const c = caption(this, this.scale.width / 2, 92, 'Færdig! Nu skal den have diesel og olie.', 'done');
    this.dyn(c);

    const go = button(this, this.scale.width / 2, PILE_Y, 'Gør den klar!', COLORS.green,
      () => this.goTo('PrepScene', { machine: this.machine }), 250, 58, SIZE.heading);
    go.setName('go');
    this.dyn(go);
    popIn(this, go, 300, 0.5);
    go.setDepth(DEPTH.dynamic);
  }
}
