import Phaser from 'phaser';
import { COLORS, INK, LINE, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { EXTRA_SPOTS, ExtraKind, MACHINES, MachineId } from '../state/Machines';
import { addBackButton, addSceneTitle, addStarCounter, award } from '../ui/Chrome';
import { button, plate, progressBar, shade, shadow, sheen, tappable } from '../helpers/Draw';
import { dur, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { nextRoute } from '../helpers/Route';
import {
  showCheckmark, showConfetti, showPraise, showSparkle, showSplash, showToast,
} from '../objects/FeedbackEffects';
import { SERVICE, drawMachine, machineBounds } from '../objects/MachineArt';
import { drawFlag } from '../objects/TownArt';
import { floorY, workshopBackdrop } from '../objects/SiteArt';
import { Pointer, drawTargetZone } from '../ui/Guide';
import { BaseScene } from './BaseScene';

/** How close the nozzle has to be to the filler cap to pour. Generous, for small hands. */
const REACH = 70;
/** Tank per second while pouring. */
const DIESEL_RATE = 0.45;
const OIL_RATE = 0.6;

const PUMP = { x: 70, top: 214 };
const NOZZLE_HOME = { x: 132, y: 286 };
const CAN_HOME = { x: 188, y: 406 };
const GO = { x: 640, y: 500 };

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

  /* The layout, written for the 880×550 stage and moved to the middle of this one. */
  private get floor(): number { return floorY(this); }
  private get pump() { return { x: PUMP.x + this.dx, top: PUMP.top + this.dy }; }
  private get nozzleHome() { return { x: NOZZLE_HOME.x + this.dx, y: NOZZLE_HOME.y + this.dy }; }
  private get canHome() { return { x: CAN_HOME.x + this.dx, y: CAN_HOME.y + this.dy }; }
  private get goAt() { return { x: GO.x + this.dx, y: GO.y + this.dy }; }

  create(): void {
    const b = machineBounds(this.machine);
    this.scaleM = Math.min(0.92, 520 / b.w, 260 / b.h);
    this.origin = { x: 560 + this.dx - (b.x + b.w / 2) * this.scaleM, y: this.floor - 6 };

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
      this.dyn(button(this, this.scale.width / 2, 300 + this.dy, 'Byg den først', COLORS.orange,
        () => this.goTo('AssembleScene', { machine: this.machine }), 240, 56));
      return;
    }

    const m = this.dyn(this.add.graphics().setPosition(this.origin.x, this.origin.y).setScale(this.scaleM));
    drawMachine(m, this.machine);

    this.buildChecklist();
    const zone = this.dyn(this.add.graphics());
    this.buildCaps();
    this.buildExtraSpots();
    this.buildTools();

    if (gameState.isReady(this.machine)) this.buildGo();
    this.buildPointer(zone);
  }

  /* --------------------------------------------------------------- guidance --- */

  /**
   * One job at a time, shown with the arrow: pick up the nozzle, hold it on the glowing
   * cap; then the oil; then the machine's own job, spot by spot; then the button. The
   * tools and spots were all there before, but small against a busy machine, and a child
   * could not tell which to start with.
   */
  private buildPointer(zone: Phaser.GameObjects.Graphics): void {
    const pointer = new Pointer(this, o => this.dyn(o));
    const glow = (p: { x: number; y: number }, r: number) =>
      drawTargetZone(zone, this, p.x - r, p.y - r, r * 2, r * 2, 'round');

    this.everyFrame(() => {
      zone.clear();
      const needs = gameState.needs(this.machine);
      if (this.dragging) {
        const cap = this.at(SERVICE[this.machine][this.dragging]);
        glow(cap, REACH * 0.7);
        pointer.point(cap.x, cap.y - 18);
        return;
      }
      if (needs.diesel) {
        glow(this.at(SERVICE[this.machine].diesel), 26);
        pointer.point(this.nozzleHome.x, this.nozzleHome.y - 18);
        return;
      }
      if (needs.oil) {
        glow(this.at(SERVICE[this.machine].oil), 26);
        pointer.point(this.canHome.x - 10, this.canHome.y - 50);
        return;
      }
      const spot = gameState.machines[this.machine].extra.findIndex(done => !done);
      if (spot >= 0) {
        const p = this.at(SERVICE[this.machine].extra[spot]);
        pointer.point(p.x, p.y - 26);
        return;
      }
      if (gameState.isReady(this.machine)) pointer.point(this.goAt.x, this.goAt.y - 34);
      else pointer.hide();
    });
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
      const x = this.scale.width / 2 - 150 + i * 200;
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
      g.fillCircle(0, 0, 15);
      g.fillStyle(color);
      g.fillCircle(0, 0, 12.5);
      g.fillStyle(COLORS.white, 0.4);
      g.fillCircle(-4, -4, 4.5);
      c.add(g);
      // a ring that pulses on the cap that still wants filling
      if ((tool === 'diesel' ? needs.diesel : needs.oil) || m[tool] < 1) {
        const ring = this.add.circle(0, 0, 20).setStrokeStyle(4, color, 0.95);
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
        this.drawExtraDone(g, def.extra.kind);
        return;
      }
      // a bright halo behind the spot, so it stands out against the machine's yellow
      const halo = this.add.circle(0, 0, 23, COLORS.white, 0.85).setStrokeStyle(4, COLORS.outline, 0.9);
      c.add(halo);
      c.sendToBack(halo);
      g.setScale(1.2);
      this.drawExtraIcon(g, def.extra.kind);
      const ring = this.add.circle(0, 0, 27).setStrokeStyle(5, COLORS.orange, 1);
      c.add(ring);
      if (!reduceMotion()) {
        this.tweens.add({ targets: ring, scale: 1.35, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });
      }
      tappable(this, c, 76, 76, () => this.doExtra(i, p), 'tap');
    });
  }

  /** What a finished spot leaves behind: a greased nipple, a lit lamp, a flag flying. */
  private drawExtraDone(g: Phaser.GameObjects.Graphics, kind: ExtraKind): void {
    switch (kind) {
      case 'grease':
        g.fillStyle(COLORS.rubber);
        g.fillCircle(0, 0, 6);
        g.fillStyle(COLORS.white, 0.6);
        g.fillCircle(-2, -2, 2);
        break;
      case 'lamp':
        g.fillStyle(COLORS.sun, 0.35);
        g.fillCircle(0, 0, 20);
        this.drawBulb(g, COLORS.sun);
        break;
      case 'flag':
        drawFlag(g, 0, 0);
        break;
      default:
        break;
    }
  }

  private drawBulb(g: Phaser.GameObjects.Graphics, color: number): void {
    g.fillStyle(COLORS.outline);
    g.fillRoundedRect(-6, 4, 12, 9, 3);
    g.fillCircle(0, -2, 11);
    g.fillStyle(color);
    g.fillCircle(0, -2, 9);
    g.fillStyle(COLORS.white, 0.6);
    g.fillCircle(-3, -5, 3);
    g.fillStyle(COLORS.steelLight);
    g.fillRoundedRect(-4.5, 5, 9, 6, 2);
  }

  private drawExtraIcon(g: Phaser.GameObjects.Graphics, kind: ExtraKind): void {
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
      case 'water':
        // a dry, dusty spot that wants a squirt of water
        g.fillStyle(COLORS.outline);
        g.fillCircle(0, 2, 13);
        g.fillTriangle(-11, -3, 11, -3, 0, -18);
        g.fillStyle(COLORS.water);
        g.fillCircle(0, 2, 11);
        g.fillTriangle(-9, -2, 9, -2, 0, -15);
        g.fillStyle(COLORS.white, 0.6);
        g.fillCircle(-4, 0, 3.5);
        break;
      case 'lamp':
        this.drawBulb(g, COLORS.stone);
        break;
      case 'flag':
        // the flagpole, waiting for its flag
        g.fillStyle(COLORS.outline);
        g.fillRoundedRect(-3, -16, 6, 30, 3);
        g.fillStyle(COLORS.steelLight);
        g.fillRoundedRect(-1.5, -15, 3, 28, 1.5);
        g.fillStyle(COLORS.sun);
        g.fillCircle(0, -17, 3.5);
        break;
    }
  }

  private doExtra(i: number, p: { x: number; y: number }): void {
    if (!gameState.doExtra(this.machine, i)) return;
    const kind = MACHINES[this.machine].extra.kind;
    if (kind === 'grease' || kind === 'bolt') audio.ratchet();
    else if (kind === 'tyre') audio.pump();
    else if (kind === 'lamp' || kind === 'flag') audio.pop();
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
    const { x, top } = this.pump;
    shadow(g, x - 34, top, 68, this.floor - top, 10, 5, 0.2);
    plate(g, x - 34, top, 68, this.floor - top, 10, COLORS.diesel, 1, 3);
    sheen(g, x - 34, top, 68, this.floor - top, 10, 0.3);
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
      const from = { x: this.pump.x + 26, y: this.pump.top + 40 };
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
    const c = this.dyn(this.add.container(this.nozzleHome.x, this.nozzleHome.y)).setName('tool:diesel');
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
    const c = this.dyn(this.add.container(this.canHome.x, this.canHome.y)).setName('tool:oil');
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
    this.dyn(this.add.text(this.canHome.x, this.canHome.y + 42, 'Olie', text(SIZE.label, INK, 'bold')).setOrigin(0.5));
    this.dyn(this.add.text(this.pump.x, this.floor + 20, 'Diesel', text(SIZE.label, INK, 'bold')).setOrigin(0.5));
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
    const home = tool === 'diesel' ? this.nozzleHome : this.canHome;
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
    const go = button(this, this.goAt.x, this.goAt.y, toSite ? 'Kør på arbejde!' : 'Videre!', COLORS.green, () => {
      audio.horn();
      this.goTo(route.scene, route.data);
    }, 240, 56, SIZE.heading);
    go.setName('go');
    this.dyn(go);
    popIn(this, go, 200, 0.6);
  }
}
