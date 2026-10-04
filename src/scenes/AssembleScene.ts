import Phaser from 'phaser';
import { COLORS, DEPTH, INK_SOFT, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { MACHINES, MachineId } from '../state/Machines';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, caption, plate } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import {
  showConfetti, showPraise, showRing, showSparkle, showToast,
} from '../objects/FeedbackEffects';
import { ART, drawMachine, drawMachineProgress, machineBounds, partGraphic } from '../objects/MachineArt';
import { FLOOR_Y, workshopBackdrop } from '../objects/SiteArt';
import { BaseScene } from './BaseScene';

/** How close to its place a part has to be let go for it to snap on. */
const SNAP = 70;

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
 * are building before it exists. Parts go on bottom-up — a cab needs something to sit on —
 * and the places that can take a part right now pulse. A part let go in the wrong place,
 * or before what it sits on, slides back to the floor: nothing breaks, nothing is lost.
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

  protected buildDynamic(): void {
    const def = MACHINES[this.machine];
    const placed = gameState.machines[this.machine].parts;

    // silhouette plus whatever is already on
    const m = this.dyn(this.add.graphics().setPosition(this.origin.x, this.origin.y).setScale(this.scaleM));
    drawMachineProgress(m, this.machine, placed);

    // the places that can take a part right now
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

    const left = loose.length;
    this.dyn(this.add.text(this.scale.width / 2, 92, `Træk delene op på plads — ${left} tilbage`,
      text(SIZE.body, INK_SOFT, 'bold')).setOrigin(0.5));
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
    const near = Phaser.Math.Distance.Between(drag.c.x, drag.c.y, t.x, t.y) < SNAP
      || Phaser.Math.Distance.Between(x, y, t.x, t.y) < SNAP;

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

    if (near) {
      // right place, wrong moment: say what has to go on first
      const def = MACHINES[this.machine].parts.find(p => p.id === drag.part)!;
      const missing = def.needs.find(n => !gameState.hasPart(this.machine, n));
      const name = MACHINES[this.machine].parts.find(p => p.id === missing)?.name;
      if (name) showToast(this, t.x, t.y - 60, `Først: ${name.toLowerCase()}`);
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
