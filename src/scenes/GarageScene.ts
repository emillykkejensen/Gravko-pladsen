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
const CARD_H = 300;
const CARD_Y = 310;
const cardX = (i: number) => 128 + i * 208;

/**
 * The workshop: one bay per machine.
 *
 * A machine that is not built shows as a silhouette with the parts already on drawn in;
 * a built one shows its tank gauges and what it still needs. On the first building a
 * machine stays locked until the site has a job for it, so the child only ever chooses
 * between machines that matter — and the one the site is waiting for gets the arrow.
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

  protected buildDynamic(): void {
    const step = gameState.nextStep();
    const wanted = step.kind !== 'site' ? step.machine : null;
    MACHINE_IDS.forEach((id, i) => this.buildCard(id, cardX(i), CARD_Y, id === wanted));
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
    plate(g, -CARD_W / 2 + 14, -CARD_H / 2 + 12, CARD_W - 28, 36, 10, COLORS.machine, 1, 2.5);
    c.add(g);
    c.add(this.add.text(0, -CARD_H / 2 + 30, def.short, text(SIZE.heading, INK, 'bold')).setOrigin(0.5));

    // the machine itself, fitted to the card
    const b = machineBounds(id);
    const scale = Math.min((CARD_W - 24) / b.w, 120 / b.h);
    const art = this.add.graphics().setScale(scale)
      .setPosition(-(b.x + b.w / 2) * scale, -10 - (b.y + b.h) * scale + 60);
    if (built) drawMachine(art, id);
    else drawMachineProgress(art, id, m.parts);
    c.add(art);

    // status
    if (!built) {
      c.add(this.add.text(0, 78, `${m.parts.length} af ${def.parts.length} dele`,
        text(SIZE.body, INK_SOFT, 'bold')).setOrigin(0.5));
      c.add(this.add.text(0, 112, 'Byg den!', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
    } else {
      this.gauge(c, 64, 'Diesel', m.diesel, COLORS.diesel);
      this.gauge(c, 92, 'Olie', m.oil, COLORS.oil);
      const needs = gameState.needs(id);
      const label = ready ? 'Klar!' : needs.extra ? def.extra.title : 'Tank op';
      c.add(this.add.text(0, 126, label,
        textOutlined(SIZE.heading, ready ? '#B4F09A' : '#FFFFFF', '#4A3A2C', 5)).setOrigin(0.5));
    }

    tappable(this, c, CARD_W, CARD_H, () => {
      this.goTo(built ? 'PrepScene' : 'AssembleScene', { machine: id });
    }, 'tap');

    if (wanted) {
      pulse(this, c, 1.03);
      const arrow = this.dyn(this.add.graphics().setPosition(x, y - CARD_H / 2 - 22));
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
    plate(g, -CARD_W / 2 + 14, -CARD_H / 2 + 12, CARD_W - 28, 36, 10, COLORS.stoneDeep, 1, 2.5, 0.5);
    c.add(g);
    c.add(this.add.text(0, -CARD_H / 2 + 30, def.short, text(SIZE.heading, INK_SOFT, 'bold')).setOrigin(0.5));

    const b = machineBounds(id);
    const scale = Math.min((CARD_W - 24) / b.w, 120 / b.h);
    const art = this.add.graphics().setScale(scale).setAlpha(0.6)
      .setPosition(-(b.x + b.w / 2) * scale, -10 - (b.y + b.h) * scale + 60);
    drawMachineProgress(art, id, []);
    c.add(art);

    // the padlock
    const lock = this.add.graphics().setPosition(0, 96);
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

    tappable(this, c, CARD_W, CARD_H, () => {
      audio.nudge();
      wobble(this, c);
      showToast(this, x, y - 60, 'Den skal bruges senere!');
    }, 'tap');
  }

  private gauge(c: Phaser.GameObjects.Container, y: number, label: string, level: number, color: number): void {
    c.add(this.add.text(-CARD_W / 2 + 18, y, label, text(SIZE.label, INK, 'bold')).setOrigin(0, 0.5));
    c.add(progressBar(this, 34, y, 100, 16, level, color));
  }
}
