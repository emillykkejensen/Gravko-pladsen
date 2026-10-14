import Phaser from 'phaser';
import { COLORS, INK, INK_SOFT, LINE, PAINT, SIZE, text } from '../config';
import { gameState } from '../state/GameState';
import {
  DECORATIONS, HOUSE_PAINTS, LIVERIES, Livery, ShopItem, Shelf, UPGRADES, Upgrade, VEHICLES, upgradeFor,
} from '../state/Shop';
import { MACHINE_IDS, MACHINES } from '../state/Machines';
import { PROJECTS, projectById } from '../state/Projects';
import { showSparkle, showToast } from '../objects/FeedbackEffects';
import { drawMachine, inLivery, machineBounds } from '../objects/MachineArt';
import { drawBuilding } from '../objects/SiteArt';
import { decorationPreview } from '../objects/TownArt';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { bunting, gradientBand, plate, shadow, tappable } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { BaseScene } from './BaseScene';

/**
 * The upgrade shelf shows one card per machine: the next upgrade it can have, or the last
 * one once it has both.
 */
function upgradeShelf(): ShopItem[] {
  return MACHINE_IDS.map(id => upgradeFor(id, Math.min(2, gameState.level(id) + 1))!);
}

const SHELVES: { id: Shelf; label: string; items: () => ShopItem[]; note: string }[] = [
  { id: 'byen', label: 'Byen', items: () => DECORATIONS, note: 'Tingene kommer op i byen, når du har købt dem' },
  { id: 'biler', label: 'Biler', items: () => VEHICLES, note: 'Bilerne kører i byen. Byg deres hus først!' },
  { id: 'maskiner', label: 'Farver', items: () => LIVERIES, note: 'Tryk på en farve, du har, for at male maskinerne' },
  { id: 'huse', label: 'Husene', items: () => HOUSE_PAINTS, note: 'De nye farver står ved malerspandene, når et hus skal males' },
  { id: 'opgrader', label: 'Opgrader', items: upgradeShelf, note: 'En opgraderet maskine kan mere på én gang' },
];

/** Every item a shelf could sell, for counting how much of it is bought. */
const SHELF_ALL: Record<Shelf, ShopItem[]> = {
  byen: DECORATIONS, biler: VEHICLES, maskiner: LIVERIES, huse: HOUSE_PAINTS, opgrader: UPGRADES,
};

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
    const items = shelf.items();
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
    const w = Math.min(186, Math.floor((this.scale.width - 40) / SHELVES.length) - 10);
    const h = 40;
    SHELVES.forEach((shelf, i) => {
      const active = shelf.id === this.shelf;
      const buyable = SHELF_ALL[shelf.id].filter(item => item.cost > 0);
      const owned = buyable.filter(item => gameState.owns(item.id)).length;
      const x = cx + (i - (SHELVES.length - 1) / 2) * (w + 12);
      const c = this.dyn(this.add.container(x, y)).setName(`tab:${shelf.id}`);

      const g = this.add.graphics();
      if (active) shadow(g, -w / 2, -h / 2, w, h, h / 2, 3, 0.18);
      plate(g, -w / 2, -h / 2, w, h, h / 2, active ? COLORS.sunDeep : COLORS.white, active ? 1 : 0.9,
        active ? LINE.base : LINE.thin, active ? 1 : 0.4);
      c.add(g);
      c.add(this.add.text(-18, 0, shelf.label, text(SIZE.body, active ? '#FFFFFF' : INK, 'bold')).setOrigin(0.5));
      c.add(this.add.text(w / 2 - 26, 0, `${owned}/${buyable.length}`,
        text(SIZE.tiny, active ? '#FFF6DD' : INK_SOFT, 'bold')).setOrigin(0.5));
      // something here the child can buy now
      if (!active && buyable.some(item => !gameState.owns(item.id) && gameState.isAvailable(item) && gameState.canAfford(item.cost))) {
        c.add(this.add.circle(w / 2 - 6, -h / 2 + 4, 6, COLORS.red).setStrokeStyle(1.5, COLORS.outline));
      }

      if (active) return;
      tappable(this, c, w, h, () => {
        this.shelf = shelf.id;
        this.refresh();
      }, 'tap');
    });
  }

  private buildCard(item: ShopItem, x: number, y: number, w: number, h: number): void {
    if (!gameState.owns(item.id) && !gameState.isAvailable(item)) {
      this.buildLockedCard(item, x, y, w, h);
      return;
    }
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
    this.upgradeBadge(c, item, w, h);

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

  /** On an upgrade's card: how much more the machine will do, in the corner. */
  private upgradeBadge(c: Phaser.GameObjects.Container, item: ShopItem, w: number, h: number): void {
    const up = item as Upgrade;
    if (!up.machine) return;
    const b = this.add.container(w / 2 - 22, -h / 2 + 20);
    const g = this.add.graphics();
    plate(g, -18, -12, 36, 24, 10, COLORS.orange, 1, LINE.thin);
    b.add(g);
    b.add(this.add.text(0, 0, up.level === 1 ? 'x2' : 'x4', text(SIZE.label, '#FFFFFF', 'bold')).setOrigin(0.5));
    c.add(b);
    const machine = this.add.text(0, -h / 2 + 14, MACHINES[up.machine].short, text(SIZE.tiny, INK_SOFT, 'bold')).setOrigin(0.5);
    if (machine.width > w - 64) machine.setScale((w - 64) / machine.width);
    c.add(machine.setX(-14));
  }

  /**
   * Something that cannot be bought yet, shown so the child knows it is there: a vehicle
   * whose building is not in the town, an upgrade for a machine not yet built.
   */
  private buildLockedCard(item: ShopItem, x: number, y: number, w: number, h: number): void {
    const c = this.dyn(this.add.container(x, y)).setName(`item:${item.id}`);
    const g = this.add.graphics();
    plate(g, -w / 2, -h / 2, w, h, 18, COLORS.stone, 0.7, 2.5, 0.4);
    c.add(g);
    const preview = this.preview(item).setPosition(0, -14).setAlpha(0.35);
    c.add(preview);
    const label = this.add.text(0, h / 2 - 44, item.name, text(SIZE.label, INK_SOFT, 'bold')).setOrigin(0.5);
    if (label.width > w - 12) label.setScale((w - 12) / label.width);
    c.add(label);
    this.upgradeBadge(c, item, w, h);

    const up = item as Upgrade;
    const why = item.needs
      ? `Byg ${projectById(item.needs)?.definite ?? ''}`
      : up.machine && !gameState.isBuilt(up.machine) ? 'Byg maskinen' : 'Køb den første';
    const lock = this.add.graphics().setPosition(-w / 2 + 20, h / 2 - 19).setScale(0.45);
    lock.lineStyle(7, COLORS.outline);
    lock.beginPath();
    lock.arc(0, -14, 13, Math.PI, 0);
    lock.strokePath();
    plate(lock, -21, -16, 42, 34, 7, COLORS.machine, 1, LINE.thick);
    c.add(lock);
    const t = this.add.text(8, h / 2 - 19, why, text(SIZE.tiny, INK_SOFT, 'bold')).setOrigin(0.5);
    if (t.width > w - 44) t.setScale((w - 44) / t.width);
    c.add(t);

    tappable(this, c, w, h, () => {
      audio.nudge();
      showToast(this, x, y - h / 2 - 8, why + ' først!', '#8A7E70');
    }, 'tap');
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
    if (item.shelf === 'byen' || item.shelf === 'biler') return decorationPreview(this, item.id).setScale(0.82);
    const up = item as Upgrade;
    if (up.machine) {
      const c = this.add.container(0, 0);
      const g = this.add.graphics();
      const b = machineBounds(up.machine);
      const scale = Math.min(110 / b.w, 74 / b.h);
      g.setPosition(-(b.x + b.w / 2) * scale, 40).setScale(scale);
      drawMachine(g, up.machine);
      c.add(g);
      return c;
    }

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
