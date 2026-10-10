import Phaser from 'phaser';
import { COLORS, DEPTH, INK, INK_SOFT, LINE, SIZE, text, textOutlined } from '../config';
import { gameState } from '../state/GameState';
import { MACHINE_IDS } from '../state/Machines';
import { BANGS_PER_PILE, TOWN_PLOTS, projectAt } from '../state/Projects';
import { SHOP_ITEMS } from '../state/Shop';
import { addBackButton, addStarCounter } from '../ui/Chrome';
import { playerTag } from '../ui/Players';
import {
  badge, caption, drawStarShape, gradientBand, plate, shade, shadow, sheen, tappable,
} from '../helpers/Draw';
import { bob, popIn, reduceMotion, transition } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { flatten } from '../helpers/Flatten';
import { nextRoute } from '../helpers/Route';
import { showConfetti, showPraise } from '../objects/FeedbackEffects';
import { drawMachine } from '../objects/MachineArt';
import {
  CELL_W, SLAB_H, drawBuilding, drawBuildingFrame, drawFoundation, drawGravelLayer, drawPile,
  siteWeather,
} from '../objects/SiteArt';
import { TownLayout, townAmbient, townBehind, townFront } from '../objects/TownArt';
import { BaseScene } from './BaseScene';

/** How small the town's buildings are drawn. */
const PLOT_SCALE = 0.42;

/**
 * The hub: the town along the back, the workshop and the building site in front, and a
 * signpost in the middle that always points at the next thing to do.
 *
 * The town is the reward that does not reset. Every finished building gets its own plot,
 * in the colour the child painted it, and stays there — and whatever the child buys in the
 * star shop turns up around it.
 *
 * The town spreads across the whole stage, however wide; the workshop, the signpost and
 * the site keep their places relative to it, and a taller stage gets more sky.
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
    // Once the house has made its entrance it should not make it again if the screen turns.
    if (this.arrived !== null) this.sys.settings.data = {};
  }

  /* --------------------------------------------------------------- layout --- */

  private get plotY(): number {
    return 288 + this.dy;
  }

  private plotX(i: number): number {
    return 60 + i * ((this.scale.width - 120) / (TOWN_PLOTS - 1));
  }

  private get garage() {
    return { x: Math.round(this.scale.width * 0.205), y: 488 + this.dy };
  }

  private get site() {
    return { x: Math.round(this.scale.width * 0.773), y: 488 + this.dy };
  }

  /** Exposed for the tests, which tap the sign wherever the stage puts it. */
  get sign() {
    return { x: this.scale.width / 2 - 8, y: 418 + this.dy };
  }

  private get layout(): TownLayout {
    return {
      width: this.scale.width,
      plotY: this.plotY,
      plotXs: Array.from({ length: TOWN_PLOTS }, (_, i) => this.plotX(i)),
      roadY: this.plotY + 66,
    };
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    const plotY = this.plotY;
    this.bg(gradientBand(this, 0, plotY + 10, COLORS.skyLight, COLORS.sky));

    const g = this.add.graphics();
    g.fillStyle(shade(COLORS.grass, 0.25));
    g.fillEllipse(width * 0.23, plotY + 10, width * 0.6, 150);
    g.fillEllipse(width * 0.8, plotY + 12, width * 0.64, 170);
    this.bg(g);

    townBehind(this, o => this.bg(o), this.layout);

    const ground = this.add.graphics();
    // the town's own strip of grass, with a pavement under the plots
    ground.fillStyle(COLORS.grass);
    ground.fillRect(0, plotY - 6, width, 26);
    ground.fillStyle(COLORS.stone);
    ground.fillRect(0, plotY + 14, width, 10);
    ground.lineStyle(2, COLORS.outline, 0.8);
    ground.lineBetween(0, plotY + 14, width, plotY + 14);

    // the road
    ground.fillStyle(COLORS.asphalt);
    ground.fillRect(0, plotY + 24, width, 50);
    ground.fillStyle(COLORS.white, 0.85);
    for (let x = 10; x < width; x += 60) ground.fillRect(x, plotY + 47, 32, 5);
    ground.lineStyle(2, COLORS.outline, 0.8);
    ground.lineBetween(0, plotY + 74, width, plotY + 74);

    // front grass
    ground.fillGradientStyle(COLORS.grassLight, COLORS.grassLight, COLORS.grassDeep, COLORS.grassDeep, 1);
    ground.fillRect(0, plotY + 75, width, height - plotY - 75);
    this.bg(ground);
  }

  protected buildAmbient(): void {
    siteWeather(this, o => this.amb(o));
    townAmbient(this, o => this.amb(o), this.layout);
  }

  protected buildChrome(): void {
    const back = addBackButton(this, 'MainMenuScene', 'Menu');
    addStarCounter(this);
    this.addPlayerTag(back);
    this.addShopButton();
    this.addGrownUpButton();
  }

  protected buildDynamic(): void {
    this.still = this.add.container(0, 0);
    this.buildTown();
    // in front of the road, so the bus drives behind them
    this.drawGarage(this.garage.x, this.garage.y);
    this.drawSiteFence(this.site.x, this.site.y);
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

  /* ---------------------------------------------------------------- chrome --- */

  /**
   * Whose town this is: the player's animal and name, right beside the way back to the
   * cards. Two siblings taking turns otherwise have no way to tell their towns apart.
   */
  private addPlayerTag(back: Phaser.GameObjects.Container): void {
    const profile = gameState.profile;
    if (!profile) return;
    const left = back.x + back.width / 2 + 8;
    playerTag(this, profile, left, back.y, 210).setDepth(DEPTH.chrome);
  }

  /** The way into the star shop, under the counter it spends from. */
  private addShopButton(): void {
    const w = 156;
    const h = 38;
    const lip = 4;
    const c = this.add.container(this.scale.width - 90, 98).setDepth(DEPTH.chrome).setName('shop');

    const g = this.add.graphics();
    shadow(g, -w / 2, -h / 2, w, h + lip, h / 2, 3, 0.2);
    plate(g, -w / 2, -h / 2 + lip, w, h, h / 2, shade(COLORS.sunDeep, -0.3), 1, LINE.thin);
    plate(g, -w / 2, -h / 2, w, h, h / 2, COLORS.sunDeep, 1, LINE.base);
    sheen(g, -w / 2, -h / 2, w, h, h / 2, 0.28);
    c.add(g);

    const t = this.add.text(12, 0, 'Stjernebutik', text(SIZE.label, '#FFFFFF', 'bold')).setOrigin(0.5);
    t.setShadow(0, 1.5, 'rgba(74,58,44,0.5)', 0, false, true);
    c.add(t);

    const star = this.add.graphics().setPosition(-w / 2 + 24, 0);
    drawStarShape(star, 0, 0, 11);
    c.add(star);

    // how many things the child could buy right now
    const affordable = SHOP_ITEMS.filter(i => !gameState.owns(i.id) && gameState.canAfford(i.cost)).length;
    if (affordable > 0) {
      const dot = badge(this, w / 2 - 6, -h / 2 - 2, `${affordable}`, COLORS.red);
      c.add(dot);
      if (!reduceMotion()) {
        this.tweens.add({ targets: dot, scale: 1.18, duration: 700, yoyo: true, repeat: -1 });
      }
    }

    tappable(this, c, w, h + lip, () => transition(this, 'ShopScene'), 'tap');
  }

  /** Small, quiet, and out of a child's way: this player's settings, for a grown-up. */
  private addGrownUpButton(): void {
    const w = 92;
    const h = 36;
    const c = this.add.container(16 + w / 2, 98).setDepth(DEPTH.chrome).setName('grownups');
    const g = this.add.graphics();
    shadow(g, -w / 2, -h / 2, w, h, h / 2, 2, 0.16);
    plate(g, -w / 2, -h / 2, w, h, h / 2, COLORS.cream, 0.95, LINE.thin);
    c.add(g);
    c.add(this.add.text(0, 0, 'Voksne', text(SIZE.label, INK_SOFT, 'bold')).setOrigin(0.5));
    tappable(this, c, w, h, () => transition(this, 'SettingsScene'), 'tap');
  }

  /* ------------------------------------------------------------------ the town --- */

  private buildTown(): void {
    const plotY = this.plotY;
    for (let i = 0; i < TOWN_PLOTS; i++) {
      const x = this.plotX(i);
      const b = gameState.town[i];
      if (!b) {
        // an empty plot: a little "for sale" style sign, so the row reads as waiting
        const g = this.keep(this.add.graphics());
        g.lineStyle(2, COLORS.outline, 0.3);
        g.strokeRect(x - 38, plotY - 4, 76, 14);
        g.fillStyle(COLORS.woodDeep);
        g.fillRect(x - 2, plotY - 34, 4, 32);
        plate(g, x - 16, plotY - 46, 32, 20, 4, COLORS.cream, 1, 1.5);
        g.fillStyle(COLORS.machine);
        g.fillCircle(x, plotY - 36, 5);
        continue;
      }
      const arriving = this.arrived === i;
      const g = this.add.graphics().setPosition(x, plotY + 4).setScale(PLOT_SCALE);
      // the newest house stays live, so it can pop in
      if (arriving) this.dyn(g);
      else this.keep(g);
      drawBuilding(g, projectAt(b.project), b.color);

      if (arriving) {
        popIn(this, g as unknown as Phaser.GameObjects.Container, 250, 0.2);
        this.time.delayedCall(300, () => {
          showConfetti(this, x, plotY - 60, 30);
          audio.horn();
        });
      }
    }

    // the street lamps stand in front of the houses
    townFront(this, o => this.keep(o), this.layout);

    if (this.arrived !== null && gameState.town.length >= TOWN_PLOTS) {
      this.time.delayedCall(900, () => {
        showConfetti(this, this.scale.width / 2, 200 + this.dy, 50);
        showPraise(this, this.scale.width / 2, 200 + this.dy, 'Byen er færdig!');
      });
    }
    this.arrived = null;
  }

  /* --------------------------------------------------------- the building site --- */

  private drawSiteFence(x: number, y: number): void {
    const g = this.keep(this.add.graphics());
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
  }

  /** The current project, drawn small at whatever stage it has reached. */
  private buildSiteNow(): void {
    const p = gameState.currentProject;
    const stage = gameState.stage.id;
    const site = this.site;
    const c = this.keep(this.add.container(site.x, site.y - 26));
    const g = this.add.graphics();
    c.add(g);

    const s = 0.55;
    const w = p.pourCells * CELL_W * s;
    const holeW = Math.max(w + 20, 90);
    const holeH = 34;
    const dug = stage !== 'pael' && stage !== 'grav';

    // the hole: a mound of earth before anything is dug, an open pit after
    if (!dug) {
      const dugFraction = stage === 'grav' ? gameState.site.dug.length / (p.holeCols * p.holeRows) : 0;
      g.fillStyle(COLORS.dirt);
      g.fillEllipse(0, 0, holeW, 26);
      g.fillStyle(COLORS.dirtDeep, dugFraction);
      g.fillEllipse(0, 0, holeW * 0.9, 18 * Math.max(0.2, dugFraction));
      // pegs and string marking out where to dig
      g.lineStyle(2, COLORS.white, 0.9);
      g.strokeRect(-holeW / 2, -10, holeW, 20);
      // the piles going in, as heads poking out of the ground
      if (p.piles > 0) {
        for (let i = 0; i < p.piles; i++) {
          const driven = stage === 'grav' || (gameState.site.piles[i] ?? 0) >= BANGS_PER_PILE;
          const px = -holeW / 2 + ((i + 0.5) * holeW) / p.piles;
          if (driven) drawPile(g, px, -6, 10);
        }
      }
    } else {
      g.fillStyle(COLORS.dirtDeep);
      g.fillRect(-holeW / 2, -4, holeW, holeH);
      g.lineStyle(2.5, COLORS.outline, 0.9);
      g.strokeRect(-holeW / 2, -4, holeW, holeH);
      const loads = stage === 'grus' ? gameState.site.gravel / p.gravelLoads : 1;
      drawGravelLayer(g, { x: -holeW / 2, y: -4, w: holeW, h: holeH }, loads * 10);
    }

    if (stage === 'stoeb' || stage === 'rejs' || stage === 'taarn' || stage === 'mal') {
      const f = this.add.graphics().setScale(s).setPosition(-w / 2, -4 + holeH - 10 - SLAB_H * s);
      const fills = stage === 'stoeb'
        ? Array.from({ length: p.pourCells }, (_, i) => gameState.site.poured[i] ?? 0)
        : Array(p.pourCells).fill(1);
      drawFoundation(f, 0, 0, fills, stage === 'stoeb' ? 0 : 1, stage === 'stoeb');
      c.add(f);
    }

    if (stage === 'rejs' || stage === 'taarn' || stage === 'mal') {
      const b = this.add.graphics().setScale(s).setPosition(0, -4 + holeH - 10 - SLAB_H * s);
      drawBuildingFrame(b, p, stage === 'mal' ? p.floors + 1 : gameState.site.placed, false);
      c.add(b);
    }

    // the machine at work beside the hole, if it is built
    const machine = gameState.stage.machine;
    if (machine && gameState.isBuilt(machine)) {
      const scale = machine === 'taarnkran' || machine === 'pael' ? 0.2 : 0.28;
      const m = this.add.graphics().setScale(scale).setPosition(holeW / 2 + 50, 16);
      drawMachine(m, machine);
      c.add(m);
    }

    const label = caption(this, site.x, site.y + 30, `Byggepladsen: ${p.name}`);
    this.dyn(label);

    // the whole site is one big target
    const hit = this.dyn(this.add.container(site.x, site.y - 50));
    tappable(this, hit, 330, 170, () => this.goNext(), 'tap');
  }

  /* --------------------------------------------------------------- the garage --- */

  private drawGarage(x: number, y: number): void {
    const g = this.keep(this.add.graphics());
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
    this.keep(this.add.text(x - 30, top + 26, 'VÆRKSTED', text(SIZE.label, INK, 'bold')).setOrigin(0.5));
  }

  private buildGarageDoor(): void {
    const x = this.garage.x - 30;
    const top = this.garage.y - 108;
    const art = this.keep(this.add.container(x, top + 49));
    const c = this.dyn(this.add.container(x, top + 49)).setName('garageDoor');
    const g = this.add.graphics();
    plate(g, -78, -49, 156, 98, 6, COLORS.steelLight, 1, 3);
    g.lineStyle(2, COLORS.steelDeep, 0.8);
    for (let ly = -36; ly < 49; ly += 14) g.lineBetween(-74, ly, 74, ly);
    art.add(g);

    // built machines peek out of the door, so the garage shows what is in it
    const built = MACHINE_IDS.filter(id => gameState.isBuilt(id) && id !== 'taarnkran' && id !== 'pael');
    built.slice(0, 2).forEach((id, i) => {
      const m = this.add.graphics().setScale(0.2).setPosition(-34 + i * 70, 48);
      drawMachine(m, id);
      art.add(m);
    });

    this.dyn(caption(this, this.garage.x, this.garage.y + 30, 'Værkstedet'));
    tappable(this, c, 156, 98, () => this.goTo('GarageScene'), 'tap');
  }

  /* ----------------------------------------------------------------- the sign --- */

  private buildSign(): void {
    const step = gameState.nextStep();
    // the sign points at where the job is done: the garage for machines, the site for work
    const left = step.kind !== 'site';
    const at = this.sign;

    const c = this.dyn(this.add.container(at.x, at.y)).setName('sign');
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
      const tall = step.machine === 'taarnkran' || step.machine === 'pael';
      const icon = this.add.graphics().setScale(tall ? 0.07 : 0.13).setPosition(-tip * (w / 2 - 34), 22);
      drawMachine(icon, step.machine);
      c.add([g, icon, t, sub]);
    } else {
      c.add([g, t, sub]);
    }

    tappable(this, c, w + 30, h, () => this.goNext(), 'tap');
    if (!reduceMotion()) {
      this.tweens.add({ targets: c, x: at.x + tip * 8, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    bob(this, sub, 3, 900);
  }

  private goNext(): void {
    const route = nextRoute();
    this.goTo(route.scene, route.data);
  }
}
