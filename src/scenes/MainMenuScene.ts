import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, SIZE, textOutlined } from '../config';
import { addBirds, button, drawCloud, drawSun, gradientBand, shade } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { canExit, exitApp } from '../helpers/Native';
import { dur, popIn, reduceMotion, transition } from '../helpers/Motion';
import { flatten } from '../helpers/Flatten';
import { ArmPose, GRAVKO_REST, drawMachine } from '../objects/MachineArt';
import { drawGround, GROUND_Y } from '../objects/SiteArt';

/** The arm raised in a wave, for the title screen. */
const WAVE: ArmPose = {
  root: GRAVKO_REST.root,
  elbow: { x: 150, y: -262 },
  wrist: { x: 250, y: -280 },
  bucket: -1.6,
  load: 0,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(dur(400));

    const scenery = this.add.container(0, 0);
    scenery.add(gradientBand(this, 0, GROUND_Y + 4, COLORS.skyLight, COLORS.sky));
    const hills = this.add.graphics();
    hills.fillStyle(shade(COLORS.grass, 0.26));
    hills.fillEllipse(width * 0.2, GROUND_Y + 14, width * 0.7, 170);
    hills.fillStyle(shade(COLORS.grass, 0.16));
    hills.fillEllipse(width * 0.8, GROUND_Y + 18, width * 0.75, 200);
    scenery.add(hills);
    const ground = this.add.graphics();
    drawGround(ground, width, height);
    scenery.add(ground);
    // a little heap of earth beside the excavator, so it has obviously been working
    const heap = this.add.graphics();
    heap.fillStyle(COLORS.dirtDeep);
    heap.fillEllipse(70, GROUND_Y - 2, 150, 64);
    heap.fillStyle(COLORS.dirt);
    heap.fillEllipse(64, GROUND_Y - 6, 120, 50);
    heap.lineStyle(2.5, COLORS.outline, 0.9);
    heap.strokeEllipse(70, GROUND_Y - 2, 150, 64);
    scenery.add(heap);
    flatten(this, scenery, DEPTH.background);

    drawSun(this, width - 90, 110, 30);
    addBirds(this, 3, 70, 40);
    const c1 = drawCloud(this, 170, 90, 0.9);
    const c2 = drawCloud(this, 620, 130, 0.66);
    if (!reduceMotion()) {
      this.tweens.add({ targets: c1, x: '+=150', duration: 22000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: c2, x: '-=120', duration: 18000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    this.addExcavator(240, GROUND_Y + 8);
    this.addTitle(width / 2 + 160, 92);

    const play = button(this, 690, 300, 'Spil', COLORS.green,
      () => transition(this, 'TownScene', 280), 220, 62, SIZE.title);
    popIn(this, play, 480, 0.5);
    if (!reduceMotion()) {
      this.time.delayedCall(880, () => {
        if (!play.active) return;
        this.tweens.add({ targets: play, scale: 1.04, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });
    }

    button(this, 690, 382, 'For voksne', COLORS.blue,
      () => transition(this, 'SettingsScene', 220), 190, 46, SIZE.body);

    // The Android build runs fullscreen with the system bars hidden, so this is the only
    // way out of the app.
    button(this, 690, 452, 'Afslut', COLORS.stoneDeep, () => this.leave(), 150, 42, SIZE.label);
  }

  /** The excavator from the reference picture, waving its arm now and then. */
  private addExcavator(x: number, y: number): void {
    const g = this.add.graphics().setPosition(x, y).setScale(0.95);
    const draw = (t: number) => {
      g.clear();
      const pose: ArmPose = {
        root: GRAVKO_REST.root,
        elbow: { x: lerp(GRAVKO_REST.elbow.x, WAVE.elbow.x, t), y: lerp(GRAVKO_REST.elbow.y, WAVE.elbow.y, t) },
        wrist: { x: lerp(GRAVKO_REST.wrist.x, WAVE.wrist.x, t), y: lerp(GRAVKO_REST.wrist.y, WAVE.wrist.y, t) },
        bucket: lerp(GRAVKO_REST.bucket, WAVE.bucket, t),
        load: 0,
      };
      drawMachine(g, 'gravko', undefined, { arm: pose });
    };
    draw(0);
    popIn(this, g as unknown as Phaser.GameObjects.Container, 200, 0.7);

    if (reduceMotion()) return;
    // Wave, rest, wave — with a long rest in between, so it is a greeting and not a tic.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 900,
      delay: 1200,
      hold: 500,
      yoyo: true,
      repeat: -1,
      repeatDelay: 2600,
      ease: 'Sine.easeInOut',
      onUpdate: tw => draw(tw.getValue() ?? 0),
    });
    this.tweens.add({ targets: g, y: y - 3, duration: 260, yoyo: true, repeat: -1, repeatDelay: 1800 });
  }

  private addTitle(cx: number, cy: number): void {
    const title = this.add.text(cx, cy, 'Gravko-pladsen', {
      fontFamily: FONT,
      fontSize: `${SIZE.display + 4}px`,
      color: '#FFDA5C',
      fontStyle: '700',
      stroke: '#4A3A2C',
      strokeThickness: 10,
    }).setOrigin(0.5);
    title.setShadow(0, 5, 'rgba(74,58,44,0.35)', 0, false, true);

    const sub = this.add.text(cx, cy + 48, 'Byg maskinerne — byg byen',
      textOutlined(SIZE.body + 2, '#FFFFFF', '#4A3A2C', 5)).setOrigin(0.5);

    popIn(this, title, 120, 0.4);
    popIn(this, sub, 300, 0.6);

    if (reduceMotion()) return;
    this.tweens.add({
      targets: [title, sub], y: '-=7', duration: 2400, delay: 700,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: title, angle: { from: -1.4, to: 1.4 }, duration: 3800,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private leave(): void {
    if (canExit()) {
      exitApp();
      return;
    }
    // A browser tab cannot be closed by a page it did not open, so say goodbye instead.
    audio.stopMusic();
    const { width, height } = this.scale;
    const veil = this.add.rectangle(width / 2, height / 2, width, height, COLORS.outline, 0.55)
      .setDepth(DEPTH.overlay).setInteractive();
    const bye = this.add.text(width / 2, height / 2, 'Farvel og tak for i dag!',
      textOutlined(SIZE.title, '#FFFFFF', '#4A3A2C', 6)).setOrigin(0.5).setDepth(DEPTH.overlay);
    veil.once('pointerdown', () => {
      veil.destroy();
      bye.destroy();
      audio.syncMusic();
    });
  }
}
