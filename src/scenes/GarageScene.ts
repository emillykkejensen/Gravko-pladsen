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

const CARD_W = 190;
const CARD_H = 206;
const GAP_X = 14;
/** Room between the rows for the arrow over a card in the second row. */
const GAP_Y = 24;
/** Room the art gets on a card. */
const ART_H = 74;

/**
 * The workshop: one bay per machine, in two rows.
 *
 * A machine that is not built shows as a silhouette with the parts already on drawn in;
 * a built one shows its tank gauges and what it still needs. A machine stays locked until
 * the site has a job for it — the first four with the first house, the road roller with the
 * villa, the pile driver with the shop, the tower crane with the high-rise — so the child
 * only ever chooses between machines that matter, and a padlock says which building the
 * others are waiting for. The one the site is waiting for gets the arrow.
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

  /** Where each bay's card goes: four on top, the rest underneath, each row centred. */
  private slot(i: number): { x: number; y: number } {
    const perRow = Math.ceil(MACHINE_IDS.length / 2);
    const row = Math.floor(i / perRow);
    const inRow = row === 0 ? perRow : MACHINE_IDS.length - perRow;
    const col = i - row * perRow;
    const top = 88 + this.dy / 2;
    return {
      x: this.scale.width / 2 + (col - (inRow - 1) / 2) * (CARD_W + GAP_X),
      y: top + CARD_H / 2 + row * (CARD_H + GAP_Y),
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

  /** The machine fitted into the art space of a card. */
  private art(id: MachineId, built: boolean, parts: string[]): Phaser.GameObjects.Graphics {
    const b = machineBounds(id);
    const scale = Math.min((CARD_W - 28) / b.w, ART_H / b.h);
    const art = this.add.graphics().setScale(scale)
      .setPosition(-(b.x + b.w / 2) * scale, 14 - (b.y + b.h) * scale);
    if (built) drawMachine(art, id);
    else drawMachineProgress(art, id, parts);
    return art;
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

    const c = this.dyn(this.add.container(x, y)).setName(`card:${id}`);
    const g = this.add.graphics();
    shadow(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18, 5, 0.2);
    plate(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18, wanted ? COLORS.cream : COLORS.white, 1, 3);
    sheen(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 16, 0.4);
    // the name plate
    plate(g, -CARD_W / 2 + 12, -CARD_H / 2 + 10, CARD_W - 24, 32, 10, COLORS.machine, 1, 2.5);
    c.add(g);
    const name = this.add.text(0, -CARD_H / 2 + 26, def.short, text(SIZE.heading, INK, 'bold')).setOrigin(0.5);
    if (name.width > CARD_W - 36) name.setScale((CARD_W - 36) / name.width);
    c.add(name);

    c.add(this.art(id, built, m.parts));

    // status
    if (!built) {
      c.add(this.add.text(0, 38, `${m.parts.length} af ${def.parts.length} dele`,
        text(SIZE.body, INK_SOFT, 'bold')).setOrigin(0.5));
      c.add(this.add.text(0, 72, 'Byg den!', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
    } else {
      this.gauge(c, 34, 'Diesel', m.diesel, COLORS.diesel);
      this.gauge(c, 58, 'Olie', m.oil, COLORS.oil);
      const needs = gameState.needs(id);
      const label = ready ? 'Klar!' : needs.extra ? def.extra.title : 'Tank op';
      const t = this.add.text(0, 84, label,
        textOutlined(SIZE.heading - 2, ready ? '#B4F09A' : '#FFFFFF', '#4A3A2C', 5)).setOrigin(0.5);
      if (t.width > CARD_W - 16) t.setScale((CARD_W - 16) / t.width);
      c.add(t);
    }

    tappable(this, c, CARD_W, CARD_H, () => {
      this.goTo(built ? 'PrepScene' : 'AssembleScene', { machine: id });
    }, 'tap');

    if (wanted) {
      pulse(this, c, 1.03);
      const arrow = this.dyn(this.add.graphics().setPosition(x, y - CARD_H / 2 - 8));
      arrow.fillStyle(COLORS.outline);
      arrow.fillTriangle(-17, -16, 17, -16, 0, 10);
      arrow.fillStyle(COLORS.orange);
      arrow.fillTriangle(-13, -14, 13, -14, 0, 6);
      bob(this, arrow, 7, 600);
    }
  }

  /** A machine the site has no job for yet: a grey card, a faint outline and a padlock. */
  private buildLockedCard(id: MachineId, x: number, y: number): void {
    const def = MACHINES[id];
    const c = this.dyn(this.add.container(x, y)).setName(`card:${id}`);
    const g = this.add.graphics();
    shadow(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18, 5, 0.12);
    plate(g, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18, COLORS.stone, 1, 3, 0.5);
    plate(g, -CARD_W / 2 + 12, -CARD_H / 2 + 10, CARD_W - 24, 32, 10, COLORS.stoneDeep, 1, 2.5, 0.5);
    c.add(g);
    const name = this.add.text(0, -CARD_H / 2 + 26, def.short, text(SIZE.heading, INK_SOFT, 'bold')).setOrigin(0.5);
    if (name.width > CARD_W - 36) name.setScale((CARD_W - 36) / name.width);
    c.add(name);

    c.add(this.art(id, false, []).setAlpha(0.6));

    // the padlock
    const lock = this.add.graphics().setPosition(0, 50);
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
      c.add(this.add.text(0, 86, `Til ${forProject.definite}`, text(SIZE.label, INK_SOFT, 'bold')).setOrigin(0.5));
    }

    tappable(this, c, CARD_W, CARD_H, () => {
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
