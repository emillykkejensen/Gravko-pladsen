import Phaser from 'phaser';
import { COLORS, DEPTH, INK, INK_SOFT, LINE, SIZE, text, textOutlined } from '../config';
import { gameState } from '../state/GameState';
import { MACHINE_IDS } from '../state/Machines';
import { BANGS_PER_PILE, LANDMARKS, PROJECTS, StageId, projectAt, windowSpots } from '../state/Projects';
import { addBackButton, addStarCounter } from '../ui/Chrome';
import { playerTag } from '../ui/Players';
import {
  badge, caption, drawStarShape, gradientBand, plate, shade, shadow, sheen, tappable,
} from '../helpers/Draw';
import { bob, popIn, reduceMotion, transition } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { flatten, flattenWide } from '../helpers/Flatten';
import { nextRoute } from '../helpers/Route';
import { showConfetti, showPraise, showToast } from '../objects/FeedbackEffects';
import { drawMachine, drawRock, machineBounds } from '../objects/MachineArt';
import {
  CELL_W, SLAB_H, buildingTop, drawBuilding, drawBuildingFrame, drawFoundation, drawGravelLayer, drawPile,
  drawWindow, siteWeather, windowAt,
} from '../objects/SiteArt';
import { TownLayout, townAmbient, townBehind, townFront, townRail } from '../objects/TownArt';
import { BaseScene } from './BaseScene';

/** How small the town's buildings are drawn. */
const PLOT_SCALE = 0.42;
/** How far apart the plots are along the road. */
const PLOT_GAP = 150;
/** The first plot's middle, from the start of the road. */
const ROAD_START = 90;
/** How far a finger moves before a touch on the town is a slide rather than a tap. */
const SLIDE = 10;

/** Where the road was slid to, per player, so coming back to the town finds it where it was. */
const remembered = new Map<string, number>();

/**
 * The hub: the town along the back, the workshop and the building site in front, and a
 * signpost in the middle that always points at the next thing to do.
 *
 * The town is the reward that does not reset. Every building has its own plot along a road
 * longer than the screen, which the child slides left and right with a finger. A finished
 * building stands on its plot in the colour the child painted it; the ones still to come
 * stand there faded, with their names, so a child can see what they are working towards —
 * and whatever the child buys in the star shop turns up around them.
 *
 * Only the town slides. The workshop, the signpost and the site stay where they are, so the
 * way to the next job never moves; they and the sky ignore the camera, and everything on the
 * road follows it.
 */
export class TownScene extends BaseScene {
  /** Set when arriving straight from painting a building, so it can make an entrance. */
  private arrived: number | null = null;

  /**
   * Drawings that reflect state but do not move: the site in miniature and the machines in
   * the garage door. Collected here during buildDynamic() and baked into one texture at the
   * end of it, which stays put while the road slides.
   */
  private still!: Phaser.GameObjects.Container;
  /** The same for everything along the road, baked in pieces that slide with it. */
  private road!: Phaser.GameObjects.Container;

  /** Sliding the road: where the finger went down, and the road's place then. */
  private slide: { x: number; scroll: number; moved: boolean; t: number } | null = null;
  private velocity = 0;

  constructor() {
    super({ key: 'TownScene' });
  }

  init(data: { arrived?: number }): void {
    this.arrived = typeof data?.arrived === 'number' ? data.arrived : null;
    // Once the house has made its entrance it should not make it again if the screen turns.
    if (this.arrived !== null) this.sys.settings.data = {};
    this.slide = null;
    this.velocity = 0;
  }

  create(): void {
    super.create();
    this.backdrop.setScrollFactor(0);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.roadWidth, this.scale.height);
    const plot = this.arrived ?? null;
    const saved = gameState.profileId ? remembered.get(gameState.profileId) : undefined;
    const focus = plot ?? gameState.project;
    cam.scrollX = plot === null && saved !== undefined ? saved : this.plotX(focus) - this.scale.width / 2;
    this.remember();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      // a button (the shop, the arrows at the ends) is a button, not the road
      if (over.length || p.y > this.layout.roadY + 30 || p.y < 70) return;
      this.slide = { x: p.x, scroll: cam.scrollX, moved: false, t: this.time.now };
      this.velocity = 0;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.slide || !p.isDown) return;
      const dx = p.x - this.slide.x;
      if (!this.slide.moved && Math.abs(dx) < SLIDE) return;
      this.slide.moved = true;
      const before = cam.scrollX;
      cam.scrollX = this.slide.scroll - dx;
      const dt = Math.max(1, this.time.now - this.slide.t);
      this.velocity = ((cam.scrollX - before) / dt) * 1000;
      this.slide.t = this.time.now;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const s = this.slide;
      this.slide = null;
      if (!s) return;
      if (s.moved) {
        this.remember();
        return;
      }
      this.velocity = 0;
      this.tapRoad(p.x + cam.scrollX, p.y);
    });
  }

  update(time: number, delta: number): void {
    super.update(time, delta);
    // a flick keeps the road sliding a little, slowing down
    if (!this.slide && Math.abs(this.velocity) > 5) {
      const cam = this.cameras.main;
      cam.scrollX += (this.velocity * Math.min(delta, 100)) / 1000;
      this.velocity *= Math.pow(0.05, Math.min(delta, 100) / 1000);
      if (Math.abs(this.velocity) <= 5) this.remember();
    }
    this.updateEdges();
  }

  private remember(): void {
    if (gameState.profileId) remembered.set(gameState.profileId, this.cameras.main.scrollX);
  }

  /* --------------------------------------------------------------- layout --- */

  private get plotY(): number {
    return 288 + this.dy;
  }

  /** How many plots the road shows: every building of the town's own, and two more. */
  private get plots(): number {
    const last = Math.max(gameState.project, ...gameState.town.map(b => b.project));
    return Math.max(LANDMARKS, last + 1) + 2;
  }

  /** The middle of a plot, along the road. */
  plotX(i: number): number {
    return ROAD_START + i * PLOT_GAP;
  }

  /** The whole road, from the first plot to past the last, never narrower than the screen. */
  private get roadWidth(): number {
    return Math.max(this.scale.width, this.plotX(this.plots - 1) + ROAD_START);
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
    const landmarks: Record<string, number> = {};
    for (const p of PROJECTS) landmarks[p.id] = this.plotX(p.index);
    return {
      width: this.roadWidth,
      plotY: this.plotY,
      plotXs: Array.from({ length: this.plots }, (_, i) => this.plotX(i)),
      roadY: this.plotY + 49,
      landmarks,
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
    townRail(g, width, { plotY });
    this.bg(g);

    const ground = this.add.graphics();
    // the town's own strip of grass, with a pavement under the plots
    ground.fillStyle(COLORS.grass);
    ground.fillRect(0, plotY - 6, width, 26);
    ground.fillStyle(COLORS.stone);
    ground.fillRect(0, plotY + 14, width, 10);
    ground.lineStyle(2, COLORS.outline, 0.8);
    ground.lineBetween(0, plotY + 14, width, plotY + 14);

    // the road; its white dashes are drawn along it, so they slide with the houses
    ground.fillStyle(COLORS.asphalt);
    ground.fillRect(0, plotY + 24, width, 50);
    ground.lineStyle(2, COLORS.outline, 0.8);
    ground.lineBetween(0, plotY + 74, width, plotY + 74);

    // front grass
    ground.fillGradientStyle(COLORS.grassLight, COLORS.grassLight, COLORS.grassDeep, COLORS.grassDeep, 1);
    ground.fillRect(0, plotY + 75, width, height - plotY - 75);
    this.bg(ground);
  }

  protected buildAmbient(): void {
    // the weather stays put; the vehicles drive along the road
    siteWeather(this, o => {
      (this.amb(o) as unknown as Phaser.GameObjects.Components.ScrollFactor).setScrollFactor(0);
      return o;
    });
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
    this.road = this.add.container(0, 0);
    this.buildTown();
    const road: Phaser.GameObjects.RenderTexture[] = [];
    flattenWide(this, this.road, this.roadWidth, DEPTH.dynamic, rt => road.push(this.dyn(rt)));
    // in front of the road, so the vehicles drive behind them
    this.drawGarage(this.garage.x, this.garage.y);
    this.drawSiteFence(this.site.x, this.site.y);
    this.buildSiteNow();
    this.buildGarageDoor();
    // back to front: the road, then the workshop and the site, then their labels and the sign
    const baked = this.dyn(flatten(this, this.still, DEPTH.dynamic)).setScrollFactor(0);
    this.dynamic.sendToBack(baked);
    for (const rt of road.reverse()) this.dynamic.sendToBack(rt);
    this.buildSign();
    this.buildEdges();
  }

  /** Adds a drawing to the fixed layer that is baked at the end of the refresh. */
  private keep<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.still.add(obj);
    return obj;
  }

  /** Adds a drawing to the road, which is baked at the end of the refresh and slides. */
  private onRoad<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.road.add(obj);
    return obj;
  }

  /** Adds a live object that stays put while the road slides. */
  private fixed<T extends Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.ScrollFactor>(obj: T): T {
    this.dyn(obj).setScrollFactor(0);
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
    playerTag(this, profile, left, back.y, 210).setDepth(DEPTH.chrome).setScrollFactor(0);
  }

  /** The way into the star shop, under the counter it spends from. */
  private addShopButton(): void {
    const w = 156;
    const h = 38;
    const lip = 4;
    const c = this.add.container(this.scale.width - 90, 98).setDepth(DEPTH.chrome).setName('shop').setScrollFactor(0);

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
    const affordable = gameState.affordable.length;
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
    const c = this.add.container(16 + w / 2, 98).setDepth(DEPTH.chrome).setName('grownups').setScrollFactor(0);
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
    const t = this.layout;

    townBehind(this, o => this.onRoad(o), t);

    // the road's dashes, which slide with the houses so the road visibly moves
    const dashes = this.onRoad(this.add.graphics());
    dashes.fillStyle(COLORS.white, 0.85);
    for (let x = 10; x < t.width; x += 60) dashes.fillRect(x, plotY + 47, 32, 5);

    for (let i = 0; i < this.plots; i++) {
      const x = this.plotX(i);
      const b = gameState.buildingAt(i);
      const p = projectAt(i);
      if (!b) {
        if (i < LANDMARKS || i === gameState.project) {
          // still to come: the building itself, faded, so the child can see what it will be
          const ghost = this.onRoad(this.add.graphics().setPosition(x, plotY + 4).setScale(PLOT_SCALE).setAlpha(0.3));
          drawBuilding(ghost, p, 8);
          const outline = this.onRoad(this.add.graphics());
          outline.lineStyle(2, COLORS.outline, 0.25);
          outline.strokeRect(x - 44, plotY - 4, 88, 14);
        } else {
          // an ordinary plot further down the road: a little sign, so the row reads as waiting
          const g = this.onRoad(this.add.graphics());
          g.lineStyle(2, COLORS.outline, 0.3);
          g.strokeRect(x - 38, plotY - 4, 76, 14);
          g.fillStyle(COLORS.woodDeep);
          g.fillRect(x - 2, plotY - 34, 4, 32);
          plate(g, x - 16, plotY - 46, 32, 20, 4, COLORS.cream, 1, 1.5);
          g.fillStyle(COLORS.machine);
          g.fillCircle(x, plotY - 36, 5);
        }
        if (i === gameState.project) this.nowBuilding(x, plotY - buildingTop(p) * PLOT_SCALE - (i < LANDMARKS ? 50 : 30));
        if (i < LANDMARKS) {
          // live rather than baked, so it can be read out (and found by the tests)
          this.dyn(this.add.text(x, plotY - buildingTop(p) * PLOT_SCALE - 12, p.name,
            textOutlined(SIZE.tiny, '#FFFFFF', '#8A7E70', 3)).setOrigin(0.5).setAlpha(0.95));
        }
        continue;
      }
      const arriving = this.arrived === i;
      const g = this.add.graphics().setPosition(x, plotY + 4).setScale(PLOT_SCALE);
      // the newest house stays live, so it can pop in
      if (arriving) this.dyn(g);
      else this.onRoad(g);
      drawBuilding(g, p, b.color);

      if (arriving) {
        popIn(this, g as unknown as Phaser.GameObjects.Container, 250, 0.2);
        this.time.delayedCall(300, () => {
          showConfetti(this, x, plotY - 60, 30);
          audio.horn();
        });
      }
    }

    // the street lamps stand in front of the houses
    townFront(this, o => this.onRoad(o), t);

    // the hospital finished: everything the town was waiting for is there
    if (this.arrived === LANDMARKS - 1 && gameState.landmarksDone) {
      this.time.delayedCall(900, () => {
        const cx = this.cameras.main.scrollX + this.scale.width / 2;
        showConfetti(this, cx, 200 + this.dy, 50);
        showPraise(this, cx, 200 + this.dy, 'Byen er færdig!');
      });
    }
    this.arrived = null;
  }

  /** A little flag over the plot the building on the site is for: "this one is next". */
  private nowBuilding(x: number, y: number): void {
    const g = this.onRoad(this.add.graphics());
    g.fillStyle(COLORS.outline);
    g.fillRect(x - 1.5, y - 2, 3, 20);
    plate(g, x + 1, y - 2, 30, 18, 3, COLORS.orange, 1, LINE.thin);
    g.fillStyle(COLORS.white);
    g.fillCircle(x + 16, y + 7, 4);
  }

  /** A tap on the road, not a slide: a building says what it is, or what it will be. */
  private tapRoad(x: number, y: number): void {
    const i = Math.round((x - ROAD_START) / PLOT_GAP);
    if (i < 0 || i >= this.plots || Math.abs(x - this.plotX(i)) > 60) return;
    if (y > this.plotY + 20 || y < this.plotY - 140) return;
    const p = projectAt(i);
    const built = !!gameState.buildingAt(i);
    if (!built && i >= LANDMARKS && i !== gameState.project) return;
    audio.tap();
    const label = built ? p.name : i === gameState.project ? `${p.name} bygges nu!` : `${p.name} kommer senere`;
    showToast(this, this.plotX(i), this.plotY - buildingTop(p) * PLOT_SCALE - 30, label);
  }

  /**
   * Arrows at the ends of the road when there is more of it that way: they show the town
   * slides, and a tap on one slides it a screen along.
   */
  private edges: Phaser.GameObjects.Container[] = [];

  private buildEdges(): void {
    const y = this.plotY - 60;
    this.edges = [-1, 1].map(dir => {
      const x = dir < 0 ? 26 : this.scale.width - 26;
      const c = this.fixed(this.add.container(x, y)).setName(dir < 0 ? 'road:left' : 'road:right');
      const g = this.add.graphics();
      plate(g, -20, -26, 40, 52, 14, COLORS.cream, 0.92, LINE.base);
      g.fillStyle(COLORS.orange);
      g.lineStyle(LINE.base, COLORS.outline);
      const pts = [{ x: -7 * dir, y: -12 }, { x: 9 * dir, y: 0 }, { x: -7 * dir, y: 12 }];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true, true);
      c.add(g);
      tappable(this, c, 48, 60, () => {
        this.velocity = 0;
        const cam = this.cameras.main;
        const to = Phaser.Math.Clamp(cam.scrollX + dir * this.scale.width * 0.7, 0, this.roadWidth - this.scale.width);
        if (reduceMotion()) {
          cam.scrollX = to;
          this.remember();
          return;
        }
        this.tweens.add({ targets: cam, scrollX: to, duration: 420, ease: 'Sine.easeInOut', onComplete: () => this.remember() });
      }, 'tap');
      return c;
    });
    this.updateEdges();
  }

  private updateEdges(): void {
    if (this.edges.length < 2 || !this.edges[0].active) return;
    const cam = this.cameras.main;
    this.edges[0].setVisible(cam.scrollX > 4);
    this.edges[1].setVisible(cam.scrollX < this.roadWidth - this.scale.width - 4);
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
    const past = (id: StageId) => gameState.isPast(id) || !p.stages.includes(id);
    const site = this.site;
    const c = this.keep(this.add.container(site.x, site.y - 26));
    const g = this.add.graphics();
    c.add(g);

    const s = 0.55;
    const w = p.pourCells * CELL_W * s;
    const holeW = Math.max(w + 20, 90);
    const holeH = 34;
    const dug = past('grav');

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
          const driven = past('pael') || (gameState.site.piles[i] ?? 0) >= BANGS_PER_PILE;
          const px = -holeW / 2 + ((i + 0.5) * holeW) / p.piles;
          if (driven) drawPile(g, px, -6, 10);
        }
      }
      // heaps of earth still to push flat
      if (!past('planer')) {
        for (let i = 0; i < p.mounds; i++) {
          const left = 1 - (gameState.site.planed[i] ?? 0);
          if (left <= 0) continue;
          const mx = -holeW / 2 + ((i + 0.5) * holeW) / p.mounds;
          const mh = 6 + 16 * left;
          const dome = Array.from({ length: 13 }, (_, k) => {
            const a = (k / 12) * Math.PI;
            return { x: mx - Math.cos(a) * 16, y: 2 - Math.sin(a) * mh };
          });
          g.fillStyle(COLORS.dirtLight);
          g.fillPoints(dome, true);
          g.lineStyle(1.5, COLORS.outline, 0.8);
          g.strokePoints(dome, false);
        }
      }
      // rocks still lying about
      if (!past('sten')) {
        for (let i = 0; i < p.rocks; i++) {
          if (!gameState.rockLeft(i)) continue;
          drawRock(g, -holeW / 2 + 10 + ((i + 0.5) * (holeW - 20)) / p.rocks, -6 + (i % 2) * 6, 7);
        }
      }
      // the old shed, coming down
      if (!past('riv')) {
        const left = p.shed - gameState.site.wrecked;
        for (let i = 0; i < left; i++) {
          const col = i % 3;
          const row = Math.floor(i / 3);
          plate(g, -30 + col * 20, -18 - row * 14, 20, 14, 2, COLORS.woodDeep, 1, 1.5);
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

    const framed = past('stoeb');
    if (stage === 'stoeb' || framed) {
      const f = this.add.graphics().setScale(s).setPosition(-w / 2, -4 + holeH - 10 - SLAB_H * s);
      const fills = stage === 'stoeb'
        ? Array.from({ length: p.pourCells }, (_, i) => gameState.site.poured[i] ?? 0)
        : Array(p.pourCells).fill(1);
      drawFoundation(f, 0, 0, fills, stage === 'stoeb' ? 0 : 1, stage === 'stoeb');
      c.add(f);
    }

    if (framed) {
      const b = this.add.graphics().setScale(s).setPosition(0, -4 + holeH - 10 - SLAB_H * s);
      const raised = stage === 'rejs' || stage === 'taarn';
      drawBuildingFrame(b, p, raised ? gameState.site.placed : p.floors + 1, false);
      // the windows the lift has put in
      if (p.stages.includes('vinduer')) {
        const spots = windowSpots(p);
        spots.forEach((spot, i) => {
          if (past('vinduer') || gameState.site.windows.includes(i)) {
            const at = windowAt(p, spot.floor, spot.slot);
            drawWindow(b, at.x, at.y);
          }
        });
      }
      c.add(b);
    }

    // a strip of asphalt in front of the building
    if (stage === 'asfalt') {
      const n = p.asphalt;
      for (let i = 0; i < n; i++) {
        const laid = gameState.site.paved[i] ?? 0;
        g.fillStyle(laid >= 1 ? COLORS.asphalt : COLORS.gravel);
        g.fillRect(-holeW / 2 + (i * holeW) / n, holeH - 2, holeW / n + 0.5, 8);
      }
    }

    // the machine at work beside the hole, if it is built
    const machine = gameState.stage.machine;
    if (machine && gameState.isBuilt(machine)) {
      const bounds = machineBounds(machine);
      const scale = Math.min(0.28, 110 / bounds.h);
      const m = this.add.graphics().setScale(scale).setPosition(holeW / 2 + 50, 16);
      drawMachine(m, machine);
      c.add(m);
    }

    const label = caption(this, site.x, site.y + 30, `Byggepladsen: ${p.name}`);
    this.fixed(label);

    // the whole site is one big target
    const hit = this.fixed(this.add.container(site.x, site.y - 50));
    tappable(this, hit, 330, 150, () => this.goNext(), 'tap');
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
    const c = this.fixed(this.add.container(x, top + 49)).setName('garageDoor');
    const g = this.add.graphics();
    plate(g, -78, -49, 156, 98, 6, COLORS.steelLight, 1, 3);
    g.lineStyle(2, COLORS.steelDeep, 0.8);
    for (let ly = -36; ly < 49; ly += 14) g.lineBetween(-74, ly, 74, ly);
    art.add(g);

    // built machines peek out of the door, so the garage shows what is in it
    const built = MACHINE_IDS.filter(id => gameState.isBuilt(id) && machineBounds(id).h < 300);
    built.slice(0, 2).forEach((id, i) => {
      const m = this.add.graphics().setScale(0.2).setPosition(-34 + i * 70, 48);
      drawMachine(m, id);
      art.add(m);
    });

    this.fixed(caption(this, this.garage.x, this.garage.y + 30, 'Værkstedet'));
    tappable(this, c, 156, 98, () => this.goTo('GarageScene'), 'tap');
  }

  /* ----------------------------------------------------------------- the sign --- */

  private buildSign(): void {
    const step = gameState.nextStep();
    // the sign points at where the job is done: the garage for machines, the site for work
    const left = step.kind !== 'site';
    const at = this.sign;

    const c = this.fixed(this.add.container(at.x, at.y)).setName('sign');
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
      const icon = this.add.graphics().setScale(Math.min(0.13, 30 / machineBounds(step.machine).h))
        .setPosition(-tip * (w / 2 - 34), 22);
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
