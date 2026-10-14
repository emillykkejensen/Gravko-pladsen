import Phaser from 'phaser';
import { COLORS, INK, INK_SOFT, LINE, SIZE, text, textOutlined } from '../config';
import { gameState } from '../state/GameState';
import { MACHINE_IDS, MACHINES, MachineId } from '../state/Machines';
import { addBackButton, addSceneTitle, addStarCounter } from '../ui/Chrome';
import { plate, progressBar, shadow, sheen, tappable } from '../helpers/Draw';
import { bob, pulse, wobble } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import { showToast } from '../objects/FeedbackEffects';
import { drawMachine, drawMachineProgress, machineBounds } from '../objects/MachineArt';
import { workshopBackdrop } from '../objects/SiteArt';
import { BaseScene } from './BaseScene';

const CARD_W = 196;
const GAP_X = 12;
/** Room between the rows for the arrow over a card in the row below. */
const GAP_Y = 20;
/** Tallest a card gets; on the 550 stage three rows make them shorter. */
const MAX_CARD_H = 206;
/** Room left under the bottom row. */
const BOTTOM_GAP = 30;

/**
 * The workshop: one bay per machine, in rows.
 *
 * A machine that is not built shows as a silhouette with the parts already on drawn in;
 * a built one shows its tank gauges, what it still needs and how far it is upgraded. A
 * machine stays locked until the site has a job for it — the first four with the first
 * house, the road roller with the villa, the pile driver with the shop, the tower crane with
 * the high-rise, and one new machine with each of the town's big buildings — so the child
 * only ever chooses between machines that matter, and a padlock says which building the
 * others are waiting for. The one the site is waiting for gets the arrow.
 *
 * Twelve bays fit as three rows of four on the 880 stage, with the cards squeezed to fit the
 * height; a wider stage gets more to a row.
 */
export class GarageScene extends BaseScene {
  constructor() {
    super({ key: 'GarageScene' });
  }

  protected buildBackground(): void {
    workshopBackdrop(this, o => this.bg(o));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'Værkstedet', COLORS.machineDeep);
    addStarCounter(this);
  }

  /** As many cards to a row as fit, and the rows that makes. */
  private get grid(): { perRow: number; rows: number; h: number; top: number } {
    const n = MACHINE_IDS.length;
    const fit = Math.max(1, Math.floor((this.scale.width - 24 + GAP_X) / (CARD_W + GAP_X)));
    const rows = Math.ceil(n / Math.min(fit, n));
    const perRow = Math.ceil(n / rows);
    const top = 84;
    // the bottom row stays clear of the bottom edge, where a phone's home gesture starts
    const room = this.scale.height - top - BOTTOM_GAP;
    const h = Math.min(MAX_CARD_H, Math.floor((room - (rows - 1) * GAP_Y) / rows));
    return { perRow, rows, h, top: top + Math.max(0, (room - rows * h - (rows - 1) * GAP_Y) / 2) };
  }

  private get cardH(): number {
    return this.grid.h;
  }

  /** Where each bay's card goes: rows of equal length, each row centred. */
  private slot(i: number): { x: number; y: number } {
    const { perRow, h, top } = this.grid;
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, MACHINE_IDS.length - row * perRow);
    const col = i - row * perRow;
    return {
      x: this.scale.width / 2 + (col - (inRow - 1) / 2) * (CARD_W + GAP_X),
      y: top + h / 2 + row * (h + GAP_Y),
    };
  }

  protected buildDynamic(): void {
    const step = gameState.nextStep();
    const wanted = step.kind !== 'site' ? step.machine : null;
    MACHINE_IDS.forEach((id, i) => {
      const at = this.slot(i);
      this.buildCard(id, at.x, at.y, id === wanted);
    });
  }

  /**
   * Where things go on a card `h` tall: the name plate on top, the machine under it, and the
   * status at the bottom. A short card (three rows on a phone) drops the gauges' labels.
   */
  private rows(h: number) {
    const top = -h / 2;
    const plateH = h < 160 ? 26 : 32;
    const artTop = top + 10 + plateH + 6;
    const statusH = h < 160 ? 44 : 78;
    return { top, plateH, artTop, artH: Math.max(30, h / 2 - statusH - artTop), status: h / 2 - statusH };
  }

  /** The machine fitted into the art space of a card. */
  private art(id: MachineId, built: boolean, parts: string[], top: number, h: number): Phaser.GameObjects.Graphics {
    const b = machineBounds(id);
    const scale = Math.min((CARD_W - 28) / b.w, h / b.h);
    const art = this.add.graphics().setScale(scale)
      .setPosition(-(b.x + b.w / 2) * scale, top + h - (b.y + b.h) * scale);
    if (built) drawMachine(art, id);
    else drawMachineProgress(art, id, parts);
    return art;
  }

  private namePlate(c: Phaser.GameObjects.Container, label: string, color: number, ink: string, alpha = 1): void {
    const { top, plateH } = this.rows(this.cardH);
    const g = this.add.graphics();
    plate(g, -CARD_W / 2 + 12, top + 8, CARD_W - 24, plateH, 10, color, 1, 2.5, alpha);
    c.add(g);
    const name = this.add.text(0, top + 8 + plateH / 2, label,
      text(plateH < 30 ? SIZE.body : SIZE.heading, ink, 'bold')).setOrigin(0.5);
    if (name.width > CARD_W - 36) name.setScale((CARD_W - 36) / name.width);
    c.add(name);
  }

  private buildCard(id: MachineId, x: number, y: number, wanted: boolean): void {
    if (!gameState.isUnlocked(id)) {
      this.buildLockedCard(id, x, y);
      return;
    }
    const def = MACHINES[id];
    const m = gameState.machines[id];
    const built = gameState.isBuilt(id);
    const ready = gameState.isReady(id);
    const h = this.cardH;
    const r = this.rows(h);

    const c = this.dyn(this.add.container(x, y)).setName(`card:${id}`);
    const g = this.add.graphics();
    shadow(g, -CARD_W / 2, -h / 2, CARD_W, h, 18, 5, 0.2);
    plate(g, -CARD_W / 2, -h / 2, CARD_W, h, 18, wanted ? COLORS.cream : COLORS.white, 1, 3);
    sheen(g, -CARD_W / 2, -h / 2, CARD_W, h, 16, 0.4);
    c.add(g);
    this.namePlate(c, def.short, COLORS.machine, INK);
    c.add(this.art(id, built, m.parts, r.artTop, r.artH));

    // upgrades bought, as little stars by the name
    const level = gameState.level(id);
    for (let i = 0; i < level; i++) {
      const star = this.add.star(CARD_W / 2 - 22 - i * 16, r.top + 4, 5, 4, 8, COLORS.sun).setStrokeStyle(1.5, COLORS.outline);
      c.add(star);
    }

    const compact = h < 160;
    // status
    if (!built) {
      c.add(this.add.text(0, r.status + (compact ? 10 : 18), `${m.parts.length} af ${def.parts.length} dele`,
        text(compact ? SIZE.label : SIZE.body, INK_SOFT, 'bold')).setOrigin(0.5));
      c.add(this.add.text(0, r.status + (compact ? 30 : 52), 'Byg den!', text(compact ? SIZE.body : SIZE.heading, INK, 'bold')).setOrigin(0.5));
    } else {
      if (compact) {
        c.add(progressBar(this, -44, r.status + 10, 76, 12, m.diesel, COLORS.diesel));
        c.add(progressBar(this, 44, r.status + 10, 76, 12, m.oil, COLORS.oil));
      } else {
        this.gauge(c, r.status + 14, 'Diesel', m.diesel, COLORS.diesel);
        this.gauge(c, r.status + 38, 'Olie', m.oil, COLORS.oil);
      }
      const needs = gameState.needs(id);
      const label = ready ? 'Klar!' : needs.extra ? def.extra.title : 'Tank op';
      const t = this.add.text(0, r.status + (compact ? 31 : 64), label,
        textOutlined(compact ? SIZE.body : SIZE.heading - 2, ready ? '#B4F09A' : '#FFFFFF', '#4A3A2C', 5)).setOrigin(0.5);
      if (t.width > CARD_W - 16) t.setScale((CARD_W - 16) / t.width);
      c.add(t);
    }

    tappable(this, c, CARD_W, h, () => {
      this.goTo(built ? 'PrepScene' : 'AssembleScene', { machine: id });
    }, 'tap');

    if (wanted) {
      pulse(this, c, 1.03);
      const arrow = this.dyn(this.add.graphics().setPosition(x, y - h / 2 - 4));
      arrow.fillStyle(COLORS.outline);
      arrow.fillTriangle(-17, -16, 17, -16, 0, 10);
      arrow.fillStyle(COLORS.orange);
      arrow.fillTriangle(-13, -14, 13, -14, 0, 6);
      bob(this, arrow, 6, 600);
    }
  }

  /** A machine the site has no job for yet: a grey card, a faint outline and a padlock. */
  private buildLockedCard(id: MachineId, x: number, y: number): void {
    const def = MACHINES[id];
    const h = this.cardH;
    const r = this.rows(h);
    const c = this.dyn(this.add.container(x, y)).setName(`card:${id}`);
    const g = this.add.graphics();
    shadow(g, -CARD_W / 2, -h / 2, CARD_W, h, 18, 5, 0.12);
    plate(g, -CARD_W / 2, -h / 2, CARD_W, h, 18, COLORS.stone, 1, 3, 0.5);
    c.add(g);
    this.namePlate(c, def.short, COLORS.stoneDeep, INK_SOFT, 0.5);

    c.add(this.art(id, false, [], r.artTop, r.artH).setAlpha(0.6));

    // the padlock, over the machine
    const lock = this.add.graphics().setPosition(CARD_W / 2 - 30, r.artTop + r.artH - 4).setScale(h < 160 ? 0.7 : 1);
    lock.lineStyle(7, COLORS.outline);
    lock.beginPath();
    lock.arc(0, -14, 13, Math.PI, 0);
    lock.strokePath();
    lock.lineStyle(4, COLORS.steelLight);
    lock.beginPath();
    lock.arc(0, -14, 13, Math.PI, 0);
    lock.strokePath();
    plate(lock, -21, -16, 42, 34, 7, COLORS.machine, 1, LINE.thick);
    lock.fillStyle(COLORS.outline);
    lock.fillCircle(0, -2, 5);
    lock.fillRect(-2, -2, 4, 11);
    c.add(lock);

    // which building it is waiting for, for a grown-up to read out
    const forProject = gameState.neededFor(id);
    if (forProject) {
      const t = this.add.text(0, h / 2 - 20, `Til ${forProject.definite}`, text(SIZE.label, INK_SOFT, 'bold')).setOrigin(0.5);
      if (t.width > CARD_W - 16) t.setScale((CARD_W - 16) / t.width);
      c.add(t);
    }

    tappable(this, c, CARD_W, h, () => {
      audio.nudge();
      wobble(this, c);
      showToast(this, x, y - 60, 'Den skal bruges senere!');
    }, 'tap');
  }

  private gauge(c: Phaser.GameObjects.Container, y: number, label: string, level: number, color: number): void {
    c.add(this.add.text(-CARD_W / 2 + 16, y, label, text(SIZE.label, INK, 'bold')).setOrigin(0, 0.5));
    c.add(progressBar(this, 34, y, 100, 15, level, color));
  }
}
