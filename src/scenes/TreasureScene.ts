import { COLORS, INK, INK_SOFT, LINE, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { TREASURES, TreasureDef, treasureById } from '../state/Treasures';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { caption, gradientBand, plate, shade, shadow, tappable } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showSparkle, showToast } from '../objects/FeedbackEffects';
import { drawChest, drawRays, drawTreasure } from '../objects/TreasureArt';
import { BaseScene } from './BaseScene';

/** The shelf of finds: columns across. */
const COLS = 6;
const SLOT = 70;
const GAP = 8;

/**
 * The treasure chest: everything dug up under the building sites, kept.
 *
 * One find stands big on the left in its burst of light, with its name and its fact — the
 * newest when the chest opens, or whichever the child taps. The shelf on the right has a
 * place for every find there is; the ones still buried are question marks, so a child can
 * see how many are left to find, and the newest have a red dot until they have been seen.
 */
export class TreasureScene extends BaseScene {
  /** The find on show, by id. */
  private chosen: string | null = null;
  /** The finds that were new when the chest was opened: they keep their dot this visit. */
  private fresh = new Set<string>();

  constructor() {
    super({ key: 'TreasureScene' });
  }

  init(): void {
    const found = gameState.treasures;
    this.fresh = new Set(found.slice(gameState.treasuresSeen));
    this.chosen = found[found.length - 1] ?? null;
    gameState.seeTreasures();
  }

  /* The layout, written for the 880×550 stage and moved to the middle of this one. */
  private get top(): number { return Math.round(this.dy / 2); }
  private get showX(): number { return 188 + this.dx; }
  private get shelfX(): number { return 374 + this.dx; }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    // a warm wooden room: planks on the wall, a darker floor
    this.bg(gradientBand(this, 0, height, COLORS.woodLight, shade(COLORS.wood, -0.05)));
    const g = this.add.graphics();
    g.lineStyle(2, shade(COLORS.wood, -0.18), 0.5);
    for (let y = 70; y < height - 50; y += 34) g.lineBetween(0, y, width, y);
    g.lineStyle(1.5, shade(COLORS.wood, -0.18), 0.35);
    for (let y = 70, row = 0; y < height - 50; y += 34, row++) {
      for (let x = (row % 2) * 90 + 40; x < width; x += 180) g.lineBetween(x, y, x, y + 34);
    }
    g.fillStyle(COLORS.woodDeep);
    g.fillRect(0, height - 50, width, 50);
    g.lineStyle(LINE.base, COLORS.outline, 0.8);
    g.lineBetween(0, height - 50, width, height - 50);

    // the shelves the finds sit on
    const rows = Math.ceil(TREASURES.length / COLS);
    for (let r = 0; r < rows; r++) {
      const y = this.slotY(r) + SLOT / 2 + 2;
      const x0 = this.shelfX - 10;
      const w = COLS * (SLOT + GAP) + 12;
      g.fillStyle(COLORS.shadow, 0.18);
      g.fillRect(x0 + 2, y + 10, w, 6);
      g.fillStyle(COLORS.woodDeep);
      g.fillRect(x0, y, w, 10);
      g.lineStyle(LINE.thin, COLORS.outline, 0.9);
      g.strokeRect(x0, y, w, 10);
    }
    this.bg(g);
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Skattekisten', COLORS.woodDeep);
    addStarCounter(this);
  }

  private slotY(row: number): number {
    return 168 + this.top + row * (SLOT + 26);
  }

  protected buildDynamic(): void {
    const found = gameState.treasures;
    this.dyn(caption(this, this.shelfX + (COLS * (SLOT + GAP)) / 2 - 4, 112 + this.top,
      `${found.length} af ${TREASURES.length} skatte fundet`, found.length === TREASURES.length ? 'done' : 'idle'));

    this.buildShowcase();
    TREASURES.forEach((t, i) => this.buildSlot(t, i));
  }

  /** The chosen find, big, with what it is. */
  private buildShowcase(): void {
    const x = this.showX;
    const y = 250 + this.top;
    const w = 320;
    const h = 330;
    const g = this.dyn(this.add.graphics());
    shadow(g, x - w / 2, y - 132, w, h, 22, 5, 0.22);
    plate(g, x - w / 2, y - 132, w, h, 22, COLORS.cream, 0.97, LINE.base);

    const chosen = this.chosen ? treasureById(this.chosen) : null;
    if (!chosen) {
      // nothing yet: the chest, shut, and a reason to go digging
      const chest = this.dyn(this.add.graphics().setPosition(x, y - 26).setScale(1));
      drawChest(chest, 3);
      this.dyn(this.add.text(x, y + 72, 'Kisten er tom', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
      this.dyn(this.add.text(x, y + 104, 'Grav et hul — der gemmer sig\nnoget nede i jorden!',
        { ...text(SIZE.label, INK_SOFT, 'semibold'), align: 'center' }).setOrigin(0.5, 0));
      return;
    }

    const rays = this.dyn(this.add.graphics().setPosition(x, y - 40));
    drawRays(rays, 96);
    if (!reduceMotion()) this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    const art = this.dyn(this.add.graphics().setPosition(x, y - 40).setScale(1.7)).setName(`showing:${chosen.id}`);
    drawTreasure(art, chosen.id);
    if (!reduceMotion()) {
      this.tweens.add({ targets: art, y: y - 46, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    this.dyn(this.add.text(x, y + 62, chosen.title, text(SIZE.title, INK, 'bold')).setOrigin(0.5));
    this.dyn(this.add.text(x, y + 88, chosen.fact,
      { ...text(SIZE.label, INK_SOFT, 'semibold'), wordWrap: { width: w - 44 }, align: 'center' }).setOrigin(0.5, 0));
  }

  /** One place on the shelf: the find if it has been dug up, a question mark if not. */
  private buildSlot(t: TreasureDef, i: number): void {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = this.shelfX + col * (SLOT + GAP) + SLOT / 2;
    const y = this.slotY(row);
    const have = gameState.treasures.includes(t.id);
    const chosen = this.chosen === t.id;

    const c = this.dyn(this.add.container(x, y)).setName(`treasure:${t.id}`);
    const g = this.add.graphics();
    const half = SLOT / 2;
    if (have) {
      plate(g, -half, -half, SLOT, SLOT, 14, chosen ? COLORS.skyLight : COLORS.cream, chosen ? 1 : 0.95,
        chosen ? LINE.thick : LINE.thin);
      c.add(g);
      const art = this.add.graphics().setScale(0.72);
      drawTreasure(art, t.id);
      c.add(art);
      if (this.fresh.has(t.id)) {
        c.add(this.add.circle(half - 6, -half + 6, 8, COLORS.red).setStrokeStyle(1.5, COLORS.outline));
      }
    } else {
      // still in the ground somewhere
      plate(g, -half, -half, SLOT, SLOT, 14, shade(COLORS.woodDeep, -0.1), 0.55, LINE.thin, 0.5);
      c.add(g);
      c.add(this.add.text(0, 0, '?', text(SIZE.title + 6, '#F3E2C4', 'bold')).setOrigin(0.5).setAlpha(0.8));
    }

    tappable(this, c, SLOT, SLOT, () => {
      if (!have) {
        showToast(this, x, y - half - 10, 'Den ligger stadig i jorden!');
        return;
      }
      if (chosen) {
        // tapping the one on show makes it do a little jump
        showSparkle(this, this.showX, 210 + this.top, 160, 140);
        audio.sparkle();
        return;
      }
      this.chosen = t.id;
      audio.sparkle();
      this.refresh();
    }, have ? 'pop' : 'tap');
  }
}

