import Phaser from 'phaser';
import { COLORS, INK, INK_SOFT, LINE, PAINT, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import { DECORATIONS, HOUSE_PAINTS, LIVERIES, Livery, ShopItem, Shelf } from '../state/Shop';
import { PROJECTS } from '../state/Projects';
import { showSparkle, showToast } from '../objects/FeedbackEffects';
import { drawMachine, inLivery, machineBounds } from '../objects/MachineArt';
import { drawBuilding } from '../objects/SiteArt';
import { decorationPreview } from '../objects/TownArt';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { bunting, gradientBand, plate, shadow, tappable } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { BaseScene } from './BaseScene';

const SHELVES: { id: Shelf; label: string; items: ShopItem[]; note: string }[] = [
  { id: 'byen', label: 'Byen', items: DECORATIONS, note: 'Tingene kommer op i byen, når du har købt dem' },
  { id: 'maskiner', label: 'Maskinerne', items: LIVERIES, note: 'Tryk på en farve, du har, for at male maskinerne' },
  { id: 'huse', label: 'Husene', items: HOUSE_PAINTS, note: 'De nye farver står ved malerspandene, når et hus skal males' },
];

/**
 * The star shop: where stars go.
 *
 * Stars used to pile up into a rank and nothing else. Now they buy things the child can see
 * — lamps and a bus and fireworks for the town, a new colour for every machine, new paint
 * for the houses — which is a reason to want the next one. Spending lowers the balance, never
 * the rank, and nothing bought is ever taken away.
 */
export class ShopScene extends BaseScene {
  private shelf: Shelf = 'byen';

  constructor() {
    super({ key: 'ShopScene' });
  }

  protected buildBackground(): void {
    const { width, height } = this.scale;
    this.bg(gradientBand(this, 0, height, COLORS.cream, COLORS.sandLight));
    this.bg(bunting(this, -10, 62, width + 10, 62, Math.round(width / 52), 6));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addStarCounter(this);
    addSceneTitle(this, 'Stjernebutikken', COLORS.sunDeep);
  }

  protected buildDynamic(): void {
    const { width, height } = this.scale;
    const shelf = SHELVES.find(s => s.id === this.shelf) ?? SHELVES[0];

    this.buildTabs(width / 2, 120);

    // The grid sizes itself from the shelf, so adding an item reflows it rather than
    // pushing a card off the bottom of the screen.
    const items = shelf.items;
    const cols = Math.ceil(items.length / 2);
    const cardW = Math.min(180, Math.floor((width - 40) / cols) - 12);
    const cardH = 150;
    const stepX = cardW + 12;
    const startX = width / 2 - ((cols - 1) * stepX) / 2;
    const top = 166 + Math.max(0, (height - 550) / 2);
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      this.buildCard(item, startX + col * stepX, top + cardH / 2 + row * (cardH + 14), cardW, cardH);
    });

    this.dyn(this.add.text(width / 2, height - 18, shelf.note,
      text(SIZE.tiny, INK_SOFT, 'semibold')).setOrigin(0.5));
  }

  /** One tab per shelf, with how much of it is bought. */
  private buildTabs(cx: number, y: number): void {
    const w = 186;
    const h = 40;
    SHELVES.forEach((shelf, i) => {
      const active = shelf.id === this.shelf;
      const buyable = shelf.items.filter(item => item.cost > 0);
      const owned = buyable.filter(item => gameState.owns(item.id)).length;
      const x = cx + (i - (SHELVES.length - 1) / 2) * (w + 12);
      const c = this.dyn(this.add.container(x, y)).setName(`tab:${shelf.id}`);

      const g = this.add.graphics();
      if (active) shadow(g, -w / 2, -h / 2, w, h, h / 2, 3, 0.18);
      plate(g, -w / 2, -h / 2, w, h, h / 2, active ? COLORS.sunDeep : COLORS.white, active ? 1 : 0.9,
        active ? LINE.base : LINE.thin, active ? 1 : 0.4);
      c.add(g);
      c.add(this.add.text(-16, 0, shelf.label, text(SIZE.body, active ? '#FFFFFF' : INK, 'bold')).setOrigin(0.5));
      c.add(this.add.text(w / 2 - 30, 0, `${owned}/${buyable.length}`,
        text(SIZE.tiny, active ? '#FFF6DD' : INK_SOFT, 'bold')).setOrigin(0.5));

      if (active) return;
      tappable(this, c, w, h, () => {
        this.shelf = shelf.id;
        this.refresh();
      }, 'tap');
    });
  }

  private buildCard(item: ShopItem, x: number, y: number, w: number, h: number): void {
    const livery = LIVERIES.find(l => l.id === item.id);
    // yellow is every child's from the start
    const isOwned = item.cost === 0 || gameState.owns(item.id);
    const chosen = !!livery && gameState.livery === livery.id;
    const affordable = gameState.canAfford(item.cost);

    const c = this.dyn(this.add.container(x, y)).setName(`item:${item.id}`);
    const g = this.add.graphics();
    shadow(g, -w / 2, -h / 2, w, h, 18, 4, isOwned ? 0.1 : 0.16);
    plate(g, -w / 2, -h / 2, w, h, 18, COLORS.white, isOwned ? 0.78 : 1, 2.5,
      chosen ? 1 : isOwned ? 0.8 : 0.35);
    if (chosen) {
      g.lineStyle(4, COLORS.green, 1);
      g.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 15);
    }
    c.add(g);

    const preview = this.preview(item, livery);
    preview.setPosition(0, -14);
    c.add(preview);

    const label = this.add.text(0, h / 2 - 44, item.name, text(SIZE.label, INK, 'bold')).setOrigin(0.5);
    if (label.width > w - 12) label.setScale((w - 12) / label.width);
    c.add(label);

    if (isOwned) {
      // a coat of paint can be put back on; anything else is simply there now
      const word = livery ? (chosen ? 'Valgt' : 'Vælg') : 'Købt';
      const tag = this.add.graphics();
      tag.fillStyle(livery && !chosen ? COLORS.blue : COLORS.green);
      tag.fillRoundedRect(-36, h / 2 - 30, 72, 22, 11);
      c.add(tag);
      c.add(this.add.text(0, h / 2 - 19, word, text(SIZE.tiny, '#FFFFFF', 'bold')).setOrigin(0.5));
      if (livery && !chosen) {
        tappable(this, c, w, h, () => {
          gameState.setLivery(livery.id);
          audio.splash();
          showSparkle(this, x, y, w, h);
          this.refresh();
        }, 'tap');
      }
      return;
    }

    // price tag
    const tag = this.add.container(0, h / 2 - 19);
    const tg = this.add.graphics();
    tg.fillStyle(affordable ? COLORS.sun : COLORS.stone);
    tg.fillRoundedRect(-38, -12, 76, 24, 12);
    tg.lineStyle(LINE.hair, COLORS.outline, 0.5);
    tg.strokeRoundedRect(-38, -12, 76, 24, 12);
    tag.add(tg);
    tag.add(this.add.star(-19, 0, 5, 4, 8.5, affordable ? COLORS.white : COLORS.stoneDeep)
      .setStrokeStyle(1, COLORS.outline, 0.6));
    tag.add(this.add.text(8, 0, `${item.cost}`,
      text(SIZE.body, affordable ? INK : INK_SOFT, 'bold')).setOrigin(0.5));
    c.add(tag);
    if (!affordable) c.setAlpha(0.75);

    tappable(this, c, w, h, () => this.buy(item, x, y, h));
  }

  private buy(item: ShopItem, x: number, y: number, h: number): void {
    if (!gameState.buy(item.id)) {
      const short = item.cost - gameState.stars;
      audio.denied();
      showToast(this, x, y - h / 2 - 8, `Du mangler ${short} ${short === 1 ? 'stjerne' : 'stjerner'}`, '#B9584A');
      return;
    }
    audio.purchase();
    showSparkle(this, x, y, 140, h);
    showToast(this, x, y - h / 2 - 8, `${item.name} er købt!`, '#4A7F33');
    this.events.emit('starsChanged', gameState.stars);
    this.refresh();
  }

  /** What the card shows: the thing for the town, a machine in the colour, a painted house. */
  private preview(item: ShopItem, livery?: Livery): Phaser.GameObjects.Container {
    if (item.shelf === 'byen') return decorationPreview(this, item.id).setScale(0.82);

    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    if (livery) {
      const b = machineBounds('gravko');
      const scale = 0.26;
      g.setPosition(-(b.x + b.w / 2) * scale, 40).setScale(scale);
      inLivery(livery.id, () => drawMachine(g, 'gravko'));
    } else {
      const paint = PAINT.findIndex(p => p.item === item.id);
      g.setPosition(0, 40).setScale(0.55);
      drawBuilding(g, PROJECTS[1], Math.max(0, paint));
    }
    c.add(g);
    return c;
  }
}
