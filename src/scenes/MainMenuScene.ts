import Phaser from 'phaser';
import { COLORS, DEPTH, FONT, INK, INK_SOFT, LINE, OUTLINE_CSS, SIZE, text, textOutlined } from '../config';
import {
  addBirds, button, drawCloud, drawStarShape, drawSun, gradientBand, plate, shade, shadow, sheen,
} from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { canExit, exitApp } from '../helpers/Native';
import { dur, popIn, pulse, reduceMotion, transition } from '../helpers/Motion';
import { flatten } from '../helpers/Flatten';
import { ArmPose, GRAVKO_REST, drawMachine } from '../objects/MachineArt';
import { drawGround } from '../objects/SiteArt';
import { MAX_PROFILES, Profile, listProfiles, starsOf } from '../state/Profiles';
import { avatarTint, drawAvatar, switchPlayer } from '../ui/Players';

/** The arm raised in a wave, for the title screen. */
const WAVE: ArmPose = {
  root: GRAVKO_REST.root,
  elbow: { x: 150, y: -262 },
  wrist: { x: 250, y: -280 },
  bucket: -1.6,
  load: 0,
};

/** Six of these and their gaps fit across the stage with a margin to spare. */
const CARD_W = 124;
const CARD_H = 124;
const CARD_GAP = 14;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The title screen: who is playing?
 *
 * Several children share one tablet, and each card opens that child's own town, machines
 * and building site exactly as they left them — so the first thing the game asks is whose
 * turn it is, with an animal face to find rather than a name to read. The excavator waves
 * from the top of the earth bank, and the cards sit on the ground in front of it.
 */
export class MainMenuScene extends Phaser.Scene {
  /** Set once a card has been tapped, so a second tap during the fade cannot switch again. */
  private leaving = false;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(dur(400));
    this.leaving = false;

    // The ground sits higher than on the building site, to leave the earth free for a row
    // of player cards; a taller stage gets the extra height as sky.
    const ground = height - 210;

    const scenery = this.add.container(0, 0);
    scenery.add(gradientBand(this, 0, ground + 4, COLORS.skyLight, COLORS.sky));
    const hills = this.add.graphics();
    hills.fillStyle(shade(COLORS.grass, 0.26));
    hills.fillEllipse(width * 0.2, ground + 14, width * 0.7, 170);
    hills.fillStyle(shade(COLORS.grass, 0.16));
    hills.fillEllipse(width * 0.8, ground + 18, width * 0.75, 200);
    scenery.add(hills);
    const earth = this.add.graphics();
    drawGround(earth, width, height, ground);
    scenery.add(earth);
    // a little heap of earth beside the excavator, so it has obviously been working
    const heapX = width / 2 - 330;
    const heap = this.add.graphics();
    heap.fillStyle(COLORS.dirtDeep);
    heap.fillEllipse(heapX, ground - 2, 130, 56);
    heap.fillStyle(COLORS.dirt);
    heap.fillEllipse(heapX - 6, ground - 6, 104, 44);
    heap.lineStyle(2.5, COLORS.outline, 0.9);
    heap.strokeEllipse(heapX, ground - 2, 130, 56);
    scenery.add(heap);
    flatten(this, scenery, DEPTH.background);

    drawSun(this, width - 60, 250, 30);
    addBirds(this, 3, 70, 40);
    const c1 = drawCloud(this, width * 0.2, 90, 0.9);
    const c2 = drawCloud(this, width * 0.7, 130, 0.66);
    if (!reduceMotion()) {
      this.tweens.add({ targets: c1, x: '+=150', duration: 22000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: c2, x: '-=120', duration: 18000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    this.addExcavator(width / 2 - 230, ground + 6);
    this.addTitle(width / 2 + 70, ground - 236);
    this.addPlayers(ground);

    // The Android build runs fullscreen with the system bars hidden, so this is the only
    // way out of the app. Top left, where every other screen keeps its way out.
    const exitW = 116;
    button(this, 14 + exitW / 2, 38, 'Afslut', COLORS.stoneDeep,
      () => this.leave(), exitW, 40, SIZE.label).setDepth(DEPTH.chrome);
  }

  /* --------------------------------------------------------------- players --- */

  /**
   * "Hvem spiller?" and a card per player, plus "Ny spiller" while there is room.
   *
   * This replaced a single "Spil" button: every child gets their own town, so the first
   * thing to choose is whose it is.
   */
  private addPlayers(ground: number): void {
    const { width } = this.scale;
    const profiles = listProfiles();

    const ask = this.add.text(width / 2 + 70, ground - 150, 'Hvem spiller?',
      textOutlined(SIZE.title, '#FFFFFF', OUTLINE_CSS, 7)).setOrigin(0.5);
    popIn(this, ask, 380, 0.6);

    const cards: (Profile | null)[] = [...profiles];
    if (profiles.length < MAX_PROFILES) cards.push(null);

    const rowW = cards.length * CARD_W + (cards.length - 1) * CARD_GAP;
    const y = ground + 32 + CARD_H / 2;
    cards.forEach((profile, i) => {
      const x = width / 2 - rowW / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP);
      const card = profile ? this.profileCard(x, y, profile) : this.newPlayerCard(x, y);
      popIn(this, card, 460 + i * 70, 0.5);
      // With nobody to pick yet, the one card there is gets the gentle pulse "Spil" had.
      if (!profile && profiles.length === 0 && !reduceMotion()) {
        this.time.delayedCall(900, () => card.active && pulse(this, card, 1.05));
      }
    });
  }

  private profileCard(x: number, y: number, profile: Profile): Phaser.GameObjects.Container {
    const tint = avatarTint(profile.avatar);
    const { card, face } = this.cardShell(x, y, tint, () => {
      switchPlayer(profile.id);
      transition(this, 'TownScene', 280);
    });

    face.add(drawAvatar(this, profile.avatar, 0, -22, 32));

    const name = this.add.text(0, 24, profile.name, text(SIZE.body + 1, INK, 'bold')).setOrigin(0.5);
    if (name.width > CARD_W - 16) name.setScale((CARD_W - 16) / name.width);
    face.add(name);

    // the star count, so a child can see their own progress before they pick it
    const stars = this.add.text(0, 46, `${starsOf(profile.id)}`, text(SIZE.label, INK_SOFT, 'bold'))
      .setOrigin(0, 0.5);
    const starR = 8;
    const pairW = starR * 2 + 5 + stars.width;
    const star = this.add.graphics();
    drawStarShape(star, -pairW / 2 + starR, 45, starR);
    stars.setX(-pairW / 2 + starR * 2 + 5);
    face.add([star, stars]);

    card.setName(`player:${profile.id}`);
    return card;
  }

  private newPlayerCard(x: number, y: number): Phaser.GameObjects.Container {
    const { card, face } = this.cardShell(x, y, COLORS.cream, () => transition(this, 'ProfileScene'));

    const plus = this.add.graphics();
    plus.fillStyle(shade(COLORS.green, -0.3));
    plus.fillCircle(0, -20, 30);
    plus.fillStyle(COLORS.green);
    plus.fillCircle(0, -22, 30);
    plus.lineStyle(LINE.base, COLORS.outline);
    plus.strokeCircle(0, -22, 30);
    plus.fillStyle(COLORS.white);
    plus.fillRoundedRect(-4.5, -38, 9, 32, 4.5);
    plus.fillRoundedRect(-16, -26.5, 32, 9, 4.5);
    face.add(plus);

    face.add(this.add.text(0, 32, 'Ny spiller', text(SIZE.body + 1, INK, 'bold')).setOrigin(0.5));
    card.setName('player:new');
    return card;
  }

  /**
   * A card built like the chunky button: a face sitting on a darker lip, which a tap pushes
   * down rather than merely squashing.
   */
  private cardShell(
    x: number, y: number,
    tint: number,
    onPick: () => void
  ): { card: Phaser.GameObjects.Container; face: Phaser.GameObjects.Container } {
    const w = CARD_W;
    const h = CARD_H;
    const lip = 6;
    const r = 20;
    const card = this.add.container(x, y).setDepth(DEPTH.dynamic);

    const base = this.add.graphics();
    shadow(base, -w / 2, -h / 2, w, h + lip, r, 5, 0.22);
    plate(base, -w / 2, -h / 2 + lip, w, h, r, shade(tint, -0.25), 1, LINE.thick);
    card.add(base);

    const face = this.add.container(0, 0);
    const g = this.add.graphics();
    plate(g, -w / 2, -h / 2, w, h, r, tint, 1, LINE.thick);
    sheen(g, -w / 2, -h / 2, w, h, r - 2, 0.3);
    face.add(g);
    card.add(face);

    card.setSize(w, h + lip);
    card.setInteractive({ useHandCursor: true });
    if (!reduceMotion()) {
      card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.05, duration: 130, ease: 'Back.easeOut' }));
      card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 130 }));
    }
    card.on('pointerdown', () => {
      if (this.leaving) return;
      this.leaving = true;
      audio.tap();
      if (reduceMotion()) {
        onPick();
        return;
      }
      this.tweens.add({ targets: face, y: lip, duration: 70, yoyo: true, ease: 'Quad.easeOut', onComplete: onPick });
    });

    return { card, face };
  }

  /* ------------------------------------------------------------- scenery --- */

  /** The excavator from the reference picture, waving its arm now and then. */
  private addExcavator(x: number, y: number): void {
    const g = this.add.graphics().setPosition(x, y).setScale(0.62);
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

  /**
   * Leaving the game. On Android this closes the app; a browser will not let a page close a
   * tab it did not open, so there the game says goodbye instead.
   */
  private leave(): void {
    if (canExit()) {
      exitApp();
      return;
    }
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
