import Phaser from 'phaser';
import { COLORS, DEPTH, INK, INK_SOFT, LINE, SIZE, text } from '../config';
import {
  button, drawCloud, gradientBand, plate, shade, shadow, tappable,
} from '../helpers/Draw';
import { dur, transition, wobble } from '../helpers/Motion';
import { flatten } from '../helpers/Flatten';
import { AVATARS, Avatar, createProfile, listProfiles, MAX_NAME_LENGTH } from '../state/Profiles';
import { addBackButton, addSceneTitle } from '../ui/Chrome';
import { avatarTint, drawAvatar, switchPlayer } from '../ui/Players';

/** Alphabetical, not QWERTY: a child looking for the E finds it after the D. */
const KEY_ROWS = ['ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZÆØÅ'];
const KEY_W = 70;
const KEY_H = 52;
const KEY_GAP = 9;

const AVATAR_R = 32;
const AVATAR_STEP = 86;

/**
 * A new player: pick an animal, type a name, done.
 *
 * Everything is on the canvas — the keyboard included. A DOM input would raise the phone's
 * own keyboard over half a landscape screen inside the Android WebView, could not be
 * reached by the test harness, and would look like a form rather than part of the game.
 *
 * A plain scene rather than a BaseScene: it has no layers worth rebuilding, and the town in
 * memory here still belongs to whoever played last until "Færdig" is pressed.
 */
export class ProfileScene extends Phaser.Scene {
  private name = '';
  private avatar: Avatar = AVATARS[0];
  private finished = false;

  private field!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
  private caret!: Phaser.GameObjects.Rectangle;
  private preview: Phaser.GameObjects.Container | null = null;
  private avatarDiscs = new Map<Avatar, Phaser.GameObjects.Graphics>();

  constructor() {
    super({ key: 'ProfileScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.cameras.main.fadeIn(dur(260));

    this.name = '';
    this.finished = false;
    this.avatarDiscs.clear();
    this.preview = null;
    // Brothers and sisters start on different animals.
    const taken = new Set(listProfiles().map(p => p.avatar));
    this.avatar = AVATARS.find(a => !taken.has(a)) ?? AVATARS[0];

    const scenery = this.add.container(0, 0);
    scenery.add(gradientBand(this, 0, height * 0.86, COLORS.skyLight, COLORS.sky));
    scenery.add(gradientBand(this, height * 0.86, height * 0.14, COLORS.grassLight, COLORS.grassDeep));
    scenery.add(drawCloud(this, 96, 170, 0.6));
    scenery.add(drawCloud(this, width - 90, 196, 0.7));
    flatten(this, scenery, DEPTH.background);

    addBackButton(this, 'MainMenuScene', 'Tilbage');
    addSceneTitle(this, 'Ny spiller', COLORS.green);

    this.buildAvatars(width / 2, 112);
    this.buildNameField(width / 2, 190);
    this.buildKeyboard(width / 2, 268);

    button(this, width / 2, height - 52, 'Færdig', COLORS.green, () => this.finish(), 230, 58, SIZE.title)
      .setData('action', 'done')
      .setName('done');

    // A desk or laptop has a real keyboard, and it would be odd for it to do nothing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') this.erase();
      else if (e.key === 'Enter') this.finish();
      else if (/^[a-zæøå]$/i.test(e.key)) this.type(e.key.toUpperCase());
    };
    this.input.keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', onKey));
  }

  /* --------------------------------------------------------------- animals --- */

  private buildAvatars(cx: number, y: number): void {
    const left = cx - ((AVATARS.length - 1) * AVATAR_STEP) / 2;
    AVATARS.forEach((avatar, i) => {
      const c = this.add.container(left + i * AVATAR_STEP, y).setDepth(DEPTH.dynamic);
      const ring = this.add.graphics();
      c.add(ring);
      c.add(drawAvatar(this, avatar, 0, 0, AVATAR_R, avatarTint(avatar)));
      this.avatarDiscs.set(avatar, ring);
      c.setData('avatar', avatar).setName(`avatar:${avatar}`);
      tappable(this, c, AVATAR_R * 2 + 12, AVATAR_R * 2 + 12, () => this.pick(avatar, c));
    });
    this.drawSelection();
  }

  private pick(avatar: Avatar, c: Phaser.GameObjects.Container): void {
    this.avatar = avatar;
    this.drawSelection();
    this.drawPreview();
    wobble(this, c);
  }

  /** A sunny halo behind the chosen animal; nothing behind the rest. */
  private drawSelection(): void {
    for (const [avatar, ring] of this.avatarDiscs) {
      ring.clear();
      if (avatar !== this.avatar) continue;
      const r = AVATAR_R + 8;
      ring.fillStyle(COLORS.shadow, 0.18);
      ring.fillCircle(1, 4, r);
      ring.fillStyle(COLORS.sun);
      ring.fillCircle(0, 0, r);
      ring.lineStyle(LINE.thick, COLORS.outline);
      ring.strokeCircle(0, 0, r);
    }
  }

  /* ------------------------------------------------------------------ name --- */

  private buildNameField(cx: number, y: number): void {
    const w = 420;
    const h = 60;
    this.field = this.add.container(cx, y).setDepth(DEPTH.dynamic);

    const g = this.add.graphics();
    shadow(g, -w / 2, -h / 2, w, h, 18, 4, 0.18);
    plate(g, -w / 2, -h / 2, w, h, 18, COLORS.white, 1, LINE.thick);
    this.field.add(g);

    this.nameText = this.add.text(30, 0, '', text(SIZE.title, INK, 'bold')).setOrigin(0.5);
    this.field.add(this.nameText);

    this.caret = this.add.rectangle(0, 0, 3, 32, COLORS.outline).setOrigin(0, 0.5);
    this.field.add(this.caret);
    // A loop rather than a chain of one-shot timers, so it never counts as the screen
    // still moving.
    this.time.addEvent({
      delay: 520,
      loop: true,
      callback: () => this.caret.setVisible(!!this.name && !this.caret.visible),
    });

    this.drawPreview();
    this.showName();
  }

  /** The chosen animal at the start of the name, so the two read as one player. */
  private drawPreview(): void {
    this.preview?.destroy();
    this.preview = drawAvatar(this, this.avatar, -210 + 34, 0, 23, avatarTint(this.avatar));
    this.field.add(this.preview);
  }

  private showName(): void {
    if (this.name) {
      this.nameText.setText(this.name).setColor(INK).setFontSize(SIZE.title);
    } else {
      // For the grown-up helping; the empty box and the blinking keys say it to the child.
      this.nameText.setText('Skriv dit navn').setColor(INK_SOFT).setFontSize(SIZE.heading);
    }
    this.caret.setPosition(this.nameText.x + this.nameText.width / 2 + 4, 0);
    this.caret.setVisible(!!this.name);
  }

  /**
   * Adds a letter. The keys are capitals, which is what a child learns first; the name
   * comes out written the way names are — "Emil", not "EMIL".
   */
  private type(letter: string): void {
    if (this.finished) return;
    if (this.name.length >= MAX_NAME_LENGTH) {
      wobble(this, this.field);
      return;
    }
    this.name += this.name.length === 0 ? letter.toUpperCase() : letter.toLowerCase();
    this.showName();
  }

  private erase(): void {
    if (this.finished || !this.name) return;
    this.name = this.name.slice(0, -1);
    this.showName();
  }

  /* -------------------------------------------------------------- keyboard --- */

  private buildKeyboard(cx: number, top: number): void {
    KEY_ROWS.forEach((row, r) => {
      const y = top + r * (KEY_H + KEY_GAP + 3);
      // Every row is laid out ten keys wide; the last one has the delete key in its tenth.
      const left = cx - (10 * KEY_W + 9 * KEY_GAP) / 2 + KEY_W / 2;
      [...row].forEach((letter, i) => {
        button(this, left + i * (KEY_W + KEY_GAP), y, letter, COLORS.water,
          () => this.type(letter), KEY_W, KEY_H, SIZE.title).setDepth(DEPTH.dynamic).setName(`key:${letter}`);
      });
      if (r === KEY_ROWS.length - 1) {
        this.buildDeleteKey(left + 9 * (KEY_W + KEY_GAP), y);
      }
    });
  }

  /** A drawn backspace rather than "⌫", which the bundled font does not have. */
  private buildDeleteKey(x: number, y: number): void {
    const key = button(this, x, y, '', COLORS.red, () => this.erase(), KEY_W, KEY_H, SIZE.title)
      .setDepth(DEPTH.dynamic)
      .setData('key', 'delete')
      .setName('key:delete');

    const icon = this.add.graphics();
    icon.fillStyle(COLORS.white);
    icon.fillPoints([
      new Phaser.Geom.Point(-17, 0),
      new Phaser.Geom.Point(-7, -11),
      new Phaser.Geom.Point(16, -11),
      new Phaser.Geom.Point(16, 11),
      new Phaser.Geom.Point(-7, 11),
    ], true);
    icon.lineStyle(3, shade(COLORS.red, -0.1));
    icon.lineBetween(-2, -5, 8, 5);
    icon.lineBetween(-2, 5, 8, -5);

    // into the face, so it rides down with the press like a label would
    const face = key.list[1] as Phaser.GameObjects.Container;
    face.add(icon);
  }

  /* ------------------------------------------------------------------ done --- */

  /** Creates the player, makes them the one playing, and opens their (empty) town. */
  private finish(): void {
    if (this.finished) return;
    this.finished = true;

    const profile = createProfile(this.name, this.avatar);
    if (!profile) {
      // Full, or storage refused it. Nothing to open, so back to the cards.
      transition(this, 'MainMenuScene');
      return;
    }
    switchPlayer(profile.id);
    transition(this, 'TownScene', 280);
  }
}
