import Phaser from 'phaser';
import { COLORS, INK, LINE, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { EXTRA_SPOTS, MACHINES, MachineId } from '../state/Machines';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, plate, progressBar, shade, shadow, sheen, tappable } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { nextRoute } from '../helpers/Route';
import {
  showCheckmark, showConfetti, showPraise, showSparkle, showSplash, showToast,
} from '../objects/FeedbackEffects';
import { SERVICE, drawMachine, machineBounds } from '../objects/MachineArt';
import { FLOOR_Y, workshopBackdrop } from '../objects/SiteArt';
import { BaseScene } from './BaseScene';

/** How close the nozzle has to be to the filler cap to pour. */
const REACH = 44;
/** Tank per second while pouring. */
const DIESEL_RATE = 0.45;
const OIL_RATE = 0.6;

const PUMP = { x: 70, top: 214 };
const NOZZLE_HOME = { x: 132, y: 286 };
const CAN_HOME = { x: 188, y: 406 };

type Tool = 'diesel' | 'oil';

/**
 * Getting a machine ready for work: diesel, oil, and one job of its own.
 *
 * Filling is held, not tapped — the nozzle has to stay on the cap while the gauge climbs,
 * which is what filling a tank actually feels like and gives the gauge something to show.
 * The third job is different for every machine (grease the excavator's joints, pump the
 * truck's tyres, wash the mixer's drum, tighten the crane's bolts) so the four machines do
 * not feel like one machine painted four ways.
 *
 * A building-site job uses half a tank of diesel and a quarter of the oil, so after the
 * first visit a machine comes back here every other job to fill up again.
 */
export class PrepScene extends BaseScene {
  private machine: MachineId = 'gravko';
  private origin = { x: 0, y: 0 };
  private scaleM = 1;
  private dragging: Tool | null = null;
  private pointer = { x: 0, y: 0 };
  private glugTimer = 0;
  private celebrated = false;

  constructor() {
    super({ key: 'PrepScene' });
  }

  init(data: { machine?: MachineId }): void {
    this.machine = data?.machine && MACHINES[data.machine] ? data.machine : 'gravko';
    this.dragging = null;
    this.celebrated = gameState.isReady(this.machine);
  }

  create(): void {
    const b = machineBounds(this.machine);
    this.scaleM = Math.min(0.92, 520 / b.w, 260 / b.h);
    this.origin = { x: 560 - (b.x + b.w / 2) * this.scaleM, y: FLOOR_Y - 6 };

    super.create();

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointer = { x: p.x, y: p.y };
    });
    this.input.on('pointerup', () => this.letGo());
    this.input.on('gameout', () => this.letGo());
  }

  /** A machine-space point on screen. */
  private at(p: { x: number; y: number }): { x: number; y: number } {
    return { x: this.origin.x + p.x * this.scaleM, y: this.origin.y + p.y * this.scaleM };
  }

  protected buildBackground(): void {
    workshopBackdrop(this, o => this.bg(o));
    this.bg(this.drawPump());
  }

  protected buildChrome(): void {
    addBackButton(this, 'GarageScene');
    addSceneTitle(this, `Gør ${MACHINES[this.machine].name.toLowerCase()} klar`, COLORS.machineDeep);
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    if (!gameState.isBuilt(this.machine)) {
      this.dyn(button(this, 480, 300, 'Byg den først', COLORS.orange,
        () => this.goTo('AssembleScene', { machine: this.machine }), 240, 56));
      return;
    }

    const m = this.dyn(this.add.graphics().setPosition(this.origin.x, this.origin.y).setScale(this.scaleM));
    drawMachine(m, this.machine);

    this.buildChecklist();
    this.buildCaps();
    this.buildExtraSpots();
    this.buildTools();

    if (gameState.isReady(this.machine)) this.buildGo();
  }

  /* ------------------------------------------------------------- checklist --- */

  private buildChecklist(): void {
    const def = MACHINES[this.machine];
    const m = gameState.machines[this.machine];
    const needs = gameState.needs(this.machine);
    const extraDone = m.extra.filter(Boolean).length;

    const items = [
      { label: 'Diesel', color: COLORS.diesel, level: () => m.diesel, ok: () => !needs.diesel },
      { label: 'Olie', color: COLORS.oil, level: () => m.oil, ok: () => !needs.oil },
      { label: def.extra.title, color: COLORS.blue, level: () => extraDone / EXTRA_SPOTS, ok: () => !needs.extra },
    ];

    items.forEach((item, i) => {
      const x = 290 + i * 200;
      const y = 100;
      const g = this.dyn(this.add.graphics());
      shadow(g, x - 92, y - 26, 184, 52, 14, 3, 0.16);
      plate(g, x - 92, y - 26, 184, 52, 14, COLORS.cream, 1, 2.5);
      this.dyn(this.add.text(x, y - 10, item.label, text(SIZE.label, INK, 'bold')).setOrigin(0.5));
      let bar = this.dyn(progressBar(this, x, y + 11, 150, 13, item.level(), item.color));
      if (item.ok()) this.drawTick(x + 78, y - 18);

      // diesel and oil climb while pouring, so their bars are redrawn every frame
      if (i < 2) {
        let shown = item.level();
        this.everyFrame(() => {
          const now = item.level();
          if (Math.abs(now - shown) < 0.004) return;
          shown = now;
          bar.destroy();
          bar = this.dyn(progressBar(this, x, y + 11, 150, 13, now, item.color));
        });
      }
    });
  }

  private drawTick(x: number, y: number): void {
    const g = this.dyn(this.add.graphics());
    g.fillStyle(COLORS.green);
    g.fillCircle(x, y, 11);
    g.lineStyle(LINE.thin, COLORS.outline);
    g.strokeCircle(x, y, 11);
    g.lineStyle(3, COLORS.white);
    g.beginPath();
    g.moveTo(x - 5, y);
    g.lineTo(x - 1, y + 4);
    g.lineTo(x + 6, y - 4);
    g.strokePath();
  }

  /* ---------------------------------------------------------------- caps --- */

  private buildCaps(): void {
    const needs = gameState.needs(this.machine);
    const m = gameState.machines[this.machine];
    (['diesel', 'oil'] as Tool[]).forEach(tool => {
      const p = this.at(SERVICE[this.machine][tool]);
      const color = tool === 'diesel' ? COLORS.diesel : COLORS.oil;
      const c = this.dyn(this.add.container(p.x, p.y)).setName(`cap:${tool}`);
      const g = this.add.graphics();
      g.fillStyle(COLORS.outline);
      g.fillCircle(0, 0, 11);
      g.fillStyle(color);
      g.fillCircle(0, 0, 9);
      g.fillStyle(COLORS.white, 0.4);
      g.fillCircle(-3, -3, 3.5);
      c.add(g);
      // a ring that pulses on the cap that still wants filling
      if ((tool === 'diesel' ? needs.diesel : needs.oil) || m[tool] < 1) {
        const ring = this.add.circle(0, 0, 16).setStrokeStyle(3, color, 0.9);
        c.add(ring);
        if (!reduceMotion()) {
          this.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 900, repeat: -1 });
        }
      }
    });
  }

  /* --------------------------------------------------------- the third job --- */

  private buildExtraSpots(): void {
    const def = MACHINES[this.machine];
    const done = gameState.machines[this.machine].extra;
    SERVICE[this.machine].extra.forEach((spot, i) => {
      const p = this.at(spot);
      const c = this.dyn(this.add.container(p.x, p.y)).setName(`extra:${i}`);
      const g = this.add.graphics();
      c.add(g);
      if (done[i]) {
        if (def.extra.kind === 'grease') {
          g.fillStyle(COLORS.rubber);
          g.fillCircle(0, 0, 6);
          g.fillStyle(COLORS.white, 0.6);
          g.fillCircle(-2, -2, 2);
        }
        return;
      }
      this.drawExtraIcon(g, def.extra.kind);
      const ring = this.add.circle(0, 0, 22).setStrokeStyle(3, COLORS.blue, 0.9);
      c.add(ring);
      if (!reduceMotion()) {
        this.tweens.add({ targets: ring, scale: 1.4, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
      }
      tappable(this, c, 54, 54, () => this.doExtra(i, p), 'tap');
    });
  }

  private drawExtraIcon(g: Phaser.GameObjects.Graphics, kind: 'grease' | 'tyre' | 'mud' | 'bolt'): void {
    switch (kind) {
      case 'grease':
        // a grease nipple
        g.fillStyle(COLORS.outline);
        g.fillCircle(0, 0, 9);
        g.fillStyle(COLORS.steelLight);
        g.fillCircle(0, 0, 7);
        g.fillStyle(COLORS.steelDeep);
        g.fillCircle(0, 0, 3);
        break;
      case 'tyre':
        // a speech-bubble "!" — this tyre is soft
        g.fillStyle(COLORS.outline);
        g.fillCircle(0, 0, 13);
        g.fillStyle(COLORS.white);
        g.fillCircle(0, 0, 11);
        g.fillStyle(COLORS.red);
        g.fillRoundedRect(-2.5, -8, 5, 10, 2);
        g.fillCircle(0, 6, 2.6);
        break;
      case 'mud':
        g.fillStyle(COLORS.dirtDeep);
        g.fillCircle(0, 0, 16);
        g.fillCircle(-12, 6, 9);
        g.fillCircle(11, -7, 8);
        g.fillStyle(COLORS.dirt);
        g.fillCircle(-2, -2, 11);
        g.fillCircle(8, 6, 6);
        break;
      case 'bolt': {
        const pts = Array.from({ length: 6 }, (_, k) => {
          const a = (k / 6) * Math.PI * 2 + 0.3;
          return { x: Math.cos(a) * 10, y: Math.sin(a) * 10 };
        });
        g.fillStyle(COLORS.steelLight);
        g.fillPoints(pts, true);
        g.lineStyle(LINE.thin, COLORS.outline);
        g.strokePoints(pts, true, true);
        g.fillStyle(COLORS.steelDeep);
        g.fillCircle(0, 0, 3.5);
        break;
      }
    }
  }

  private doExtra(i: number, p: { x: number; y: number }): void {
    if (!gameState.doExtra(this.machine, i)) return;
    const kind = MACHINES[this.machine].extra.kind;
    if (kind === 'grease' || kind === 'bolt') audio.ratchet();
    else if (kind === 'tyre') audio.pump();
    else {
      audio.wash();
      showSplash(this, p.x, p.y);
    }
    showSparkle(this, p.x, p.y, 50, 50);
    showCheckmark(this, p.x, p.y - 30);
    if (!gameState.needs(this.machine).extra) {
      award(this, 1, p.x, p.y);
      showToast(this, p.x, p.y - 70, MACHINES[this.machine].extra.done + '!');
    }
    this.afterJob();
  }

  /* ----------------------------------------------------------------- tools --- */

  private drawPump(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const { x, top } = PUMP;
    shadow(g, x - 34, top, 68, FLOOR_Y - top, 10, 5, 0.2);
    plate(g, x - 34, top, 68, FLOOR_Y - top, 10, COLORS.diesel, 1, 3);
    sheen(g, x - 34, top, 68, FLOOR_Y - top, 10, 0.3);
    plate(g, x - 24, top + 16, 48, 34, 6, COLORS.cream, 1, 2);
    g.fillStyle(COLORS.outline);
    g.fillRect(x - 16, top + 26, 32, 4);
    g.fillRect(x - 16, top + 36, 20, 4);
    plate(g, x - 26, top - 16, 52, 20, 8, COLORS.white, 1, 2.5);
    g.fillStyle(COLORS.diesel);
    g.fillCircle(x, top - 6, 6);
    // the holster the nozzle hangs in
    plate(g, x + 30, top + 60, 16, 30, 4, shade(COLORS.diesel, -0.3), 1, 2);
    return g;
  }

  private buildTools(): void {
    const hose = this.dyn(this.add.graphics());
    const nozzle = this.makeNozzle();
    const can = this.makeCan();

    this.everyFrame(dt => {
      // the dragged tool follows the finger, everything else sits at home
      if (this.dragging === 'diesel') nozzle.setPosition(this.pointer.x, this.pointer.y);
      if (this.dragging === 'oil') can.setPosition(this.pointer.x, this.pointer.y);

      // hose from the pump to the nozzle, sagging a little
      const from = { x: PUMP.x + 26, y: PUMP.top + 40 };
      const to = { x: nozzle.x - 18, y: nozzle.y + 6 };
      const sag = { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + 60 };
      const curve = new Phaser.Curves.QuadraticBezier(
        new Phaser.Math.Vector2(from.x, from.y), new Phaser.Math.Vector2(sag.x, sag.y), new Phaser.Math.Vector2(to.x, to.y));
      const pts = curve.getPoints(18);
      hose.clear();
      hose.lineStyle(9, COLORS.outline);
      hose.strokePoints(pts);
      hose.lineStyle(5.5, COLORS.rubberLight);
      hose.strokePoints(pts);

      // pour while held on the cap
      if (!this.dragging) return;
      const tool = this.dragging;
      const holder = tool === 'diesel' ? nozzle : can;
      const cap = this.at(SERVICE[this.machine][tool]);
      const near = Phaser.Math.Distance.Between(holder.x, holder.y - (tool === 'oil' ? 0 : 0), cap.x, cap.y) < REACH;
      if (tool === 'oil') can.setAngle(near ? -55 : 0);
      if (!near) return;

      this.glugTimer -= dt;
      if (this.glugTimer <= 0) {
        audio.glug();
        this.glugTimer = 0.2;
      }
      const full = gameState.fill(this.machine, tool, dt * (tool === 'diesel' ? DIESEL_RATE : OIL_RATE));
      if (full) {
        showToast(this, cap.x, cap.y - 60, tool === 'diesel' ? 'Fuld tank!' : 'Fuld af olie!');
        showSparkle(this, cap.x, cap.y, 60, 60);
        award(this, 1, cap.x, cap.y);
        this.letGo();
      }
    });
  }

  private makeNozzle(): Phaser.GameObjects.Container {
    const c = this.dyn(this.add.container(NOZZLE_HOME.x, NOZZLE_HOME.y)).setName('tool:diesel');
    const g = this.add.graphics();
    // handle and spout, pointing right
    plate(g, -22, -8, 30, 20, 6, COLORS.diesel, 1, 2.5);
    plate(g, 6, -6, 22, 9, 3, COLORS.steelLight, 1, 2);
    g.lineStyle(3, COLORS.outline);
    g.lineBetween(-14, 12, -6, 20);
    c.add(g);
    c.setSize(70, 54).setInteractive({ useHandCursor: true });
    c.on('pointerdown', (p: Phaser.Input.Pointer) => this.pickUp('diesel', p));
    return c;
  }

  private makeCan(): Phaser.GameObjects.Container {
    const c = this.dyn(this.add.container(CAN_HOME.x, CAN_HOME.y)).setName('tool:oil');
    const g = this.add.graphics();
    shadow(g, -20, -26, 40, 52, 8, 3, 0.18);
    plate(g, -20, -26, 40, 52, 8, COLORS.oil, 1, 2.5);
    sheen(g, -20, -26, 40, 52, 8, 0.3);
    // spout up and to the left, so tipping the can left pours
    g.fillStyle(COLORS.steelLight);
    g.fillPoints([{ x: -14, y: -24 }, { x: -6, y: -24 }, { x: -26, y: -46 }, { x: -32, y: -42 }], true);
    g.lineStyle(2, COLORS.outline);
    g.strokePoints([{ x: -14, y: -24 }, { x: -6, y: -24 }, { x: -26, y: -46 }, { x: -32, y: -42 }], true);
    // a drop on the label
    g.fillStyle(COLORS.white);
    g.fillCircle(0, 4, 8);
    g.fillTriangle(-6, 0, 6, 0, 0, -10);
    g.fillStyle(COLORS.oil);
    g.fillCircle(0, 5, 4);
    c.add(g);
    this.dyn(this.add.text(CAN_HOME.x, CAN_HOME.y + 42, 'Olie', text(SIZE.label, INK, 'bold')).setOrigin(0.5));
    this.dyn(this.add.text(PUMP.x, FLOOR_Y + 20, 'Diesel', text(SIZE.label, INK, 'bold')).setOrigin(0.5));
    c.setSize(64, 76).setInteractive({ useHandCursor: true });
    c.on('pointerdown', (p: Phaser.Input.Pointer) => this.pickUp('oil', p));
    return c;
  }

  private pickUp(tool: Tool, p: Phaser.Input.Pointer): void {
    if (this.dragging) return;
    if (gameState.machines[this.machine][tool] >= 1) {
      showToast(this, p.x, p.y - 50, tool === 'diesel' ? 'Tanken er fuld' : 'Der er olie nok');
      audio.thud();
      return;
    }
    audio.tap();
    this.dragging = tool;
    this.pointer = { x: p.x, y: p.y };
  }

  private letGo(): void {
    if (!this.dragging) return;
    const tool = this.dragging;
    this.dragging = null;
    gameState.save();
    const name = tool === 'diesel' ? 'tool:diesel' : 'tool:oil';
    const c = this.dynamic.getByName(name) as Phaser.GameObjects.Container | null;
    const home = tool === 'diesel' ? NOZZLE_HOME : CAN_HOME;
    if (c) {
      c.setAngle(0);
      this.tweens.add({ targets: c, x: home.x, y: home.y, duration: dur(240), ease: 'Quad.easeOut' });
    }
    this.afterJob();
  }

  /* ------------------------------------------------------------------ ready --- */

  private afterJob(): void {
    if (gameState.isReady(this.machine) && !this.celebrated) {
      this.celebrated = true;
      const cx = this.origin.x + 40;
      this.time.delayedCall(dur(300), () => {
        audio.engine();
        showConfetti(this, cx, 200, 30);
        showPraise(this, cx, 210, 'Klar til arbejde!');
        award(this, 1, cx, 240);
      });
    }
    // The tool tween has to finish before the layer is rebuilt under it.
    this.time.delayedCall(dur(280), () => this.refresh());
  }

  private buildGo(): void {
    const route = nextRoute();
    const toSite = gameState.stage.machine === this.machine && route.scene === gameState.stage.scene;
    const go = button(this, 640, 500, toSite ? 'Kør på arbejde!' : 'Videre!', COLORS.green, () => {
      audio.horn();
      this.goTo(route.scene, route.data);
    }, 240, 56, SIZE.heading);
    go.setName('go');
    this.dyn(go);
    popIn(this, go, 200, 0.6);
  }
}
