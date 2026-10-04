import Phaser from 'phaser';
import { COLORS, DEPTH, INK, SIZE, text, textOutlined } from '../config';
import { gameState } from '../state/GameState';
import { TOWN_PLOTS, projectAt } from '../state/Projects';
import { addBackButton, addStarCounter } from '../ui/Chrome';
import {
  caption, gradientBand, plate, shade, shadow, sheen, tappable,
} from '../helpers/Draw';
import { bob, popIn, reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { flatten } from '../helpers/Flatten';
import { nextRoute } from '../helpers/Route';
import { showConfetti, showPraise } from '../objects/FeedbackEffects';
import { drawMachine } from '../objects/MachineArt';
import {
  CELL_W, SLAB_H, drawBuilding, drawBuildingFrame, drawFoundation, drawGravelLayer,
  siteWeather,
} from '../objects/SiteArt';
import { BaseScene } from './BaseScene';

/** Where the town's buildings stand, and how small they are drawn there. */
const PLOT_Y = 288;
const PLOT_SCALE = 0.42;
const plotX = (i: number) => 60 + i * 108;

const GARAGE = { x: 180, y: 488 };
const SITE = { x: 680, y: 488 };
const SIGN = { x: 432, y: 418 };

/**
 * The hub: the town along the back, the workshop and the building site in front, and a
 * signpost in the middle that always points at the next thing to do.
 *
 * The town is the reward that does not reset. Every finished building gets its own plot,
 * in the colour the child painted it, and stays there.
 */
export class TownScene extends BaseScene {
  /** Set when arriving straight from painting a building, so it can make an entrance. */
  private arrived: number | null = null;

  /**
   * Drawings that reflect state but do not move: the town's buildings, the site in
   * miniature, the machines in the garage door. Collected here during buildDynamic() and
   * baked into one texture at the end of it — eight houses of outlined vector art cost
   * the same every frame as the whole rest of the scene, and they never change between
   * refreshes.
   */
  private still!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'TownScene' });
  }

  init(data: { arrived?: number }): void {
    this.arrived = typeof data?.arrived === 'number' ? data.arrived : null;
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    this.bg(gradientBand(this, 0, PLOT_Y + 10, COLORS.skyLight, COLORS.sky));

    const g = this.add.graphics();
    g.fillStyle(shade(COLORS.grass, 0.25));
    g.fillEllipse(200, PLOT_Y + 10, 520, 150);
    g.fillEllipse(700, PLOT_Y + 12, 560, 170);

    // the town's own strip of grass, with a pavement under the plots
    g.fillStyle(COLORS.grass);
    g.fillRect(0, PLOT_Y - 6, width, 26);
    g.fillStyle(COLORS.stone);
    g.fillRect(0, PLOT_Y + 14, width, 10);
    g.lineStyle(2, COLORS.outline, 0.8);
    g.lineBetween(0, PLOT_Y + 14, width, PLOT_Y + 14);

    // the road
    g.fillStyle(COLORS.asphalt);
    g.fillRect(0, PLOT_Y + 24, width, 50);
    g.fillStyle(COLORS.white, 0.85);
    for (let x = 10; x < width; x += 60) g.fillRect(x, PLOT_Y + 47, 32, 5);
    g.lineStyle(2, COLORS.outline, 0.8);
    g.lineBetween(0, PLOT_Y + 74, width, PLOT_Y + 74);

    // front grass
    g.fillGradientStyle(COLORS.grassLight, COLORS.grassLight, COLORS.grassDeep, COLORS.grassDeep, 1);
    g.fillRect(0, PLOT_Y + 75, width, height - PLOT_Y - 75);
    this.bg(g);

    this.drawGarage(GARAGE.x, GARAGE.y);
    this.drawSiteFence(SITE.x, SITE.y);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'MainMenuScene', 'Menu');
    addStarCounter(this);
  }

  protected buildDynamic(): void {
    this.still = this.add.container(0, 0);
    this.buildTown();
    this.buildSiteNow();
    this.buildGarageDoor();
    const baked = this.dyn(flatten(this, this.still, DEPTH.dynamic));
    this.dynamic.sendToBack(baked);
    this.buildSign();
  }

  /** Adds a drawing to the layer that is baked at the end of the refresh. */
  private keep<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.still.add(obj);
    return obj;
  }

  /* ------------------------------------------------------------------ the town --- */

  private buildTown(): void {
    for (let i = 0; i < TOWN_PLOTS; i++) {
      const x = plotX(i);
      const b = gameState.town[i];
      if (!b) {
        // an empty plot: a little "for sale" style sign, so the row reads as waiting
        const g = this.keep(this.add.graphics());
        g.lineStyle(2, COLORS.outline, 0.3);
        g.strokeRect(x - 38, PLOT_Y - 4, 76, 14);
        g.fillStyle(COLORS.woodDeep);
        g.fillRect(x - 2, PLOT_Y - 34, 4, 32);
        plate(g, x - 16, PLOT_Y - 46, 32, 20, 4, COLORS.cream, 1, 1.5);
        g.fillStyle(COLORS.machine);
        g.fillCircle(x, PLOT_Y - 36, 5);
        continue;
      }
      const arriving = this.arrived === i;
      const g = this.add.graphics().setPosition(x, PLOT_Y + 4).setScale(PLOT_SCALE);
      // the newest house stays live, so it can pop in
      if (arriving) this.dyn(g);
      else this.keep(g);
      drawBuilding(g, projectAt(b.project), b.color);

      if (arriving) {
        popIn(this, g as unknown as Phaser.GameObjects.Container, 250, 0.2);
        this.time.delayedCall(300, () => {
          showConfetti(this, x, PLOT_Y - 60, 30);
          audio.horn();
        });
      }
    }

    if (this.arrived !== null && gameState.town.length >= TOWN_PLOTS) {
      this.time.delayedCall(900, () => {
        showConfetti(this, this.scale.width / 2, 200, 50);
        showPraise(this, this.scale.width / 2, 200, 'Byen er færdig!');
      });
    }
    this.arrived = null;
  }

  /* --------------------------------------------------------- the building site --- */

  private drawSiteFence(x: number, y: number): void {
    const g = this.add.graphics();
    const w = 330;
    // trampled earth
    g.fillStyle(COLORS.sandDeep);
    g.fillEllipse(x, y - 10, w + 20, 90);
    g.fillStyle(COLORS.sand);
    g.fillEllipse(x, y - 14, w, 76);
    // the back fence: posts and a mesh panel
    g.fillStyle(COLORS.steelLight, 0.35);
    g.fillRect(x - w / 2, y - 112, w, 70);
    g.lineStyle(1, COLORS.steelDeep, 0.6);
    for (let fx = x - w / 2; fx <= x + w / 2; fx += 12) g.lineBetween(fx, y - 112, fx + 12, y - 42);
    g.lineStyle(3, COLORS.outline, 0.9);
    for (let fx = x - w / 2; fx <= x + w / 2; fx += w / 4) g.lineBetween(fx, y - 116, fx, y - 40);
    g.lineBetween(x - w / 2, y - 112, x + w / 2, y - 112);
    this.bg(g);
  }

  /** The current project, drawn small at whatever stage it has reached. */
  private buildSiteNow(): void {
    const p = gameState.currentProject;
    const stage = gameState.stage.id;
    const c = this.keep(this.add.container(SITE.x, SITE.y - 26));
    const g = this.add.graphics();
    c.add(g);

    const s = 0.55;
    const w = p.pourCells * CELL_W * s;
    const holeW = Math.max(w + 20, 90);
    const holeH = 34;

    // the hole: a mound of earth before anything is dug, an open pit after
    if (stage === 'grav') {
      const dugFraction = gameState.site.dug.length / (p.holeCols * p.holeRows);
      g.fillStyle(COLORS.dirt);
      g.fillEllipse(0, 0, holeW, 26);
      g.fillStyle(COLORS.dirtDeep, dugFraction);
      g.fillEllipse(0, 0, holeW * 0.9, 18 * Math.max(0.2, dugFraction));
      // pegs and string marking out where to dig
      g.lineStyle(2, COLORS.white, 0.9);
      g.strokeRect(-holeW / 2, -10, holeW, 20);
    } else {
      g.fillStyle(COLORS.dirtDeep);
      g.fillRect(-holeW / 2, -4, holeW, holeH);
      g.lineStyle(2.5, COLORS.outline, 0.9);
      g.strokeRect(-holeW / 2, -4, holeW, holeH);
      if (stage === 'grus') {
        drawGravelLayer(g, { x: -holeW / 2, y: -4, w: holeW, h: holeH },
          (gameState.site.gravel / p.gravelLoads) * 10);
      } else {
        drawGravelLayer(g, { x: -holeW / 2, y: -4, w: holeW, h: holeH }, 10);
      }
    }

    if (stage === 'stoeb' || stage === 'rejs' || stage === 'mal') {
      const f = this.add.graphics().setScale(s).setPosition(-w / 2, -4 + holeH - 10 - SLAB_H * s);
      const fills = stage === 'stoeb'
        ? Array.from({ length: p.pourCells }, (_, i) => gameState.site.poured[i] ?? 0)
        : Array(p.pourCells).fill(1);
      drawFoundation(f, 0, 0, fills, stage === 'stoeb' ? 0 : 1, stage === 'stoeb');
      c.add(f);
    }

    if (stage === 'rejs' || stage === 'mal') {
      const b = this.add.graphics().setScale(s).setPosition(0, -4 + holeH - 10 - SLAB_H * s);
      drawBuildingFrame(b, p, stage === 'mal' ? p.floors + 1 : gameState.site.placed, false);
      c.add(b);
    }

    // the machine at work beside the hole, if it is built
    const machine = gameState.stage.machine;
    if (machine && gameState.isBuilt(machine)) {
      const m = this.add.graphics().setScale(0.28).setPosition(holeW / 2 + 50, 16);
      drawMachine(m, machine);
      c.add(m);
    }

    const label = caption(this, SITE.x, SITE.y + 30, `Byggepladsen: ${p.name}`);
    this.dyn(label);

    // the whole site is one big target
    const hit = this.dyn(this.add.container(SITE.x, SITE.y - 50));
    tappable(this, hit, 330, 170, () => this.goNext(), 'tap');
  }

  /* --------------------------------------------------------------- the garage --- */

  private drawGarage(x: number, y: number): void {
    const g = this.add.graphics();
    const w = 270;
    const h = 150;
    const top = y - h - 10;
    shadow(g, x - w / 2, top, w, h, 10, 6, 0.2);
    plate(g, x - w / 2, top, w, h, 10, COLORS.stone, 1, 3);
    // a corrugated roof edge
    plate(g, x - w / 2 - 12, top - 22, w + 24, 30, 8, COLORS.machine, 1, 3);
    sheen(g, x - w / 2 - 12, top - 22, w + 24, 30, 8, 0.3);
    g.fillStyle(COLORS.rubber);
    for (let i = 0; i < 12; i++) {
      const sx = x - w / 2 - 6 + i * ((w + 12) / 12);
      g.fillPoints([
        { x: sx, y: top + 6 }, { x: sx + 10, y: top + 6 }, { x: sx + 4, y: top - 18 }, { x: sx - 6, y: top - 18 },
      ], true);
    }
    // a window
    plate(g, x + 72, top + 26, 46, 36, 6, COLORS.window, 1, 2.5);
    // the name board, on its own plate so the roof stripes do not run through the letters
    plate(g, x - 92, top + 12, 124, 28, 6, COLORS.cream, 1, 2.5);
    this.bg(g);
    this.bg(this.add.text(x - 30, top + 26, 'VÆRKSTED', text(SIZE.label, INK, 'bold')).setOrigin(0.5));
  }

  private buildGarageDoor(): void {
    const x = GARAGE.x - 30;
    const top = GARAGE.y - 108;
    const art = this.keep(this.add.container(x, top + 49));
    const c = this.dyn(this.add.container(x, top + 49));
    const g = this.add.graphics();
    plate(g, -78, -49, 156, 98, 6, COLORS.steelLight, 1, 3);
    g.lineStyle(2, COLORS.steelDeep, 0.8);
    for (let ly = -36; ly < 49; ly += 14) g.lineBetween(-74, ly, 74, ly);
    art.add(g);

    // built machines peek out of the door, so the garage shows what is in it
    const built = (['gravko', 'lastbil', 'betonbil', 'kran'] as const).filter(id => gameState.isBuilt(id));
    built.slice(0, 2).forEach((id, i) => {
      const m = this.add.graphics().setScale(0.2).setPosition(-34 + i * 70, 48);
      drawMachine(m, id);
      art.add(m);
    });

    this.dyn(caption(this, GARAGE.x, GARAGE.y + 30, 'Værkstedet'));
    tappable(this, c, 156, 98, () => this.goTo('GarageScene'), 'tap');
  }

  /* ----------------------------------------------------------------- the sign --- */

  private buildSign(): void {
    const step = gameState.nextStep();
    // the sign points at where the job is done: the garage for machines, the site for work
    const left = step.kind !== 'site';

    const c = this.dyn(this.add.container(SIGN.x, SIGN.y));
    const t = this.add.text(0, -8, step.label, text(SIZE.heading, '#FFFFFF', 'bold')).setOrigin(0.5);
    t.setShadow(0, 2, 'rgba(74,58,44,0.45)', 0, false, true);
    const sub = this.add.text(0, 20, 'Tryk her!', textOutlined(SIZE.label, '#FFF6D8', '#4A3A2C', 3)).setOrigin(0.5);
    const w = Math.max(200, t.width + 70);
    const h = 74;

    const g = this.add.graphics();
    // the post
    g.fillStyle(COLORS.woodDeep);
    g.fillRect(-6, 20, 12, 70);
    g.lineStyle(2.5, COLORS.outline);
    g.strokeRect(-6, 20, 12, 70);
    // an arrow-shaped board
    const tip = left ? -1 : 1;
    const pts = [
      { x: -w / 2 * tip, y: -h / 2 },
      { x: (w / 2 - 6) * tip, y: -h / 2 },
      { x: (w / 2 + 26) * tip, y: 0 },
      { x: (w / 2 - 6) * tip, y: h / 2 },
      { x: -w / 2 * tip, y: h / 2 },
    ];
    g.fillStyle(COLORS.shadow, 0.2);
    g.fillPoints(pts.map(p => ({ x: p.x + 2, y: p.y + 5 })), true);
    g.fillStyle(COLORS.orange);
    g.fillPoints(pts, true);
    g.fillStyle(COLORS.white, 0.25);
    g.fillRect(Math.min(pts[0].x, pts[1].x) + 6, -h / 2 + 5, w - 18, 12);
    g.lineStyle(3.5, COLORS.outline);
    g.strokePoints(pts, true, true);

    // a tiny picture of the machine the step is about
    if (step.machine) {
      const icon = this.add.graphics().setScale(0.13).setPosition(-tip * (w / 2 - 34), 22);
      drawMachine(icon, step.machine);
      c.add([g, icon, t, sub]);
    } else {
      c.add([g, t, sub]);
    }

    tappable(this, c, w + 30, h, () => this.goNext(), 'tap');
    if (!reduceMotion()) {
      this.tweens.add({ targets: c, x: SIGN.x + tip * 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    bob(this, sub, 3, 900);
  }

  private goNext(): void {
    const route = nextRoute();
    this.goTo(route.scene, route.data);
  }
}

