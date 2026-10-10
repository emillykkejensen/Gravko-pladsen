import Phaser from 'phaser';
import { COLORS, INK, LINE, SIZE, text } from '../config';
import { plate, shade, shadow } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { gameState } from '../state/GameState';
import type { Avatar, Profile } from '../state/Profiles';

/**
 * Players on screen: the animal faces they pick, the tag that says whose town is open, and
 * the one function that changes who is playing. The same eight animals as Sommer Hotellet,
 * so a child who plays both is the same fox in each.
 */

/**
 * Makes `id` the player whose town is open.
 *
 * One child may have the music off, so the music is brought into line with whoever it is.
 * Picking the child who is already playing reloads nothing.
 */
export function switchPlayer(id: string | null): void {
  if (id !== gameState.profileId) gameState.loadProfile(id);
  audio.syncMusic();
}

/** The colour a player's card and tag are tinted with — the animal's own, softened. */
export function avatarTint(avatar: Avatar): number {
  return shade(LOOKS[avatar].accent, 0.62);
}

/**
 * An animal face in a disc.
 *
 * `radius` is the disc. The faces are drawn on a 40-unit grid and scaled to sit inside it,
 * with the rabbit's ears and the lion's mane reaching nearly to the rim. Every shape is
 * outlined in the game's one ink colour, like everything else that sits on a surface.
 */
export function drawAvatar(
  scene: Phaser.Scene,
  avatar: Avatar,
  x: number, y: number,
  radius: number,
  disc: number = COLORS.white
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const s = (radius * 0.82) / 40;
  const k = (v: number) => v * s;
  const stroke = (width: number, alpha = 0.95) =>
    g.lineStyle(Math.max(1, width * Math.max(s, 0.5)), COLORS.outline, alpha);

  g.fillStyle(disc);
  g.fillCircle(0, 0, radius);
  g.lineStyle(radius > 24 ? LINE.base : LINE.thin, COLORS.outline, 0.9);
  g.strokeCircle(0, 0, radius);

  LOOKS[avatar].paint({ g, k, stroke });
  c.add(g);
  return c;
}

/**
 * A pill with the active player's face and name, so it is always clear whose town this is.
 *
 * Anchored by one edge rather than its centre, so it can sit snugly beside another control
 * whatever length the name is. A name too long for `maxWidth` is shrunk, never cut.
 */
export function playerTag(
  scene: Phaser.Scene,
  profile: Profile,
  x: number, y: number,
  maxWidth = 220,
  anchor: 'left' | 'right' = 'left'
): Phaser.GameObjects.Container {
  const h = 40;
  const r = 15;
  const pad = 5;
  const gap = 7;
  const tail = 14;

  const name = scene.add.text(0, 0, profile.name, text(SIZE.label + 1, INK, 'bold')).setOrigin(0, 0.5);
  const fixed = pad + r * 2 + gap + tail;
  if (fixed + name.width > maxWidth) name.setScale(Math.max(0.6, (maxWidth - fixed) / name.width));
  const w = fixed + name.displayWidth;
  const left = anchor === 'left' ? 0 : -w;

  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  shadow(g, left, -h / 2, w, h, h / 2, 3, 0.18);
  plate(g, left, -h / 2, w, h, h / 2, COLORS.cream, 0.97, LINE.thin);
  c.add(g);
  c.add(drawAvatar(scene, profile.avatar, left + pad + r, 0, r, avatarTint(profile.avatar)));
  name.setPosition(left + pad + r * 2 + gap, 0);
  c.add(name);
  return c;
}

/* ---------------------------------------------------------------- the faces --- */

interface Pen {
  g: Phaser.GameObjects.Graphics;
  /** Grid units to pixels. */
  k: (v: number) => number;
  /** Sets the outline, scaled with the face but never thinner than a pixel. */
  stroke: (width: number, alpha?: number) => void;
}

const LOOKS: Record<Avatar, { accent: number; paint: (pen: Pen) => void }> = {
  kat: { accent: COLORS.orange, paint: cat },
  hund: { accent: COLORS.wood, paint: dog },
  kanin: { accent: COLORS.purple, paint: rabbit },
  bjørn: { accent: COLORS.woodDeep, paint: bear },
  ræv: { accent: COLORS.red, paint: fox },
  frø: { accent: COLORS.green, paint: frog },
  gris: { accent: COLORS.pink, paint: pig },
  løve: { accent: COLORS.sun, paint: lion },
};

function eyes({ g, k }: Pen, dx: number, y: number, r = 3.8): void {
  for (const x of [-dx, dx]) {
    g.fillStyle(COLORS.outline);
    g.fillCircle(k(x), k(y), k(r));
    g.fillStyle(COLORS.white, 0.95);
    g.fillCircle(k(x - r * 0.3), k(y - r * 0.38), k(r * 0.38));
  }
}

function cheeks({ g, k }: Pen, dx: number, y: number, color: number = COLORS.pink, alpha = 0.5): void {
  g.fillStyle(color, alpha);
  g.fillCircle(k(-dx), k(y), k(5));
  g.fillCircle(k(dx), k(y), k(5));
}

/** The little "w" under a nose that cats, rabbits, bears and lions all share. */
function snoot({ g, k, stroke }: Pen, y: number, r = 3.4): void {
  stroke(LINE.thin);
  for (const x of [-r, r]) {
    g.beginPath();
    g.arc(k(x), k(y), k(r), 0.15, Math.PI - 0.15, false);
    g.strokePath();
  }
}

function smile({ g, k, stroke }: Pen, y: number, r: number, width: number = LINE.thin): void {
  stroke(width);
  g.beginPath();
  g.arc(0, k(y - r), k(r), 0.45, Math.PI - 0.45, false);
  g.strokePath();
}

function filledCircle(pen: Pen, x: number, y: number, r: number, fill: number, line: number = LINE.base): void {
  const { g, k, stroke } = pen;
  g.fillStyle(fill);
  g.fillCircle(k(x), k(y), k(r));
  stroke(line);
  g.strokeCircle(k(x), k(y), k(r));
}

function filledEllipse(pen: Pen, x: number, y: number, w: number, h: number, fill: number, line: number = LINE.base): void {
  const { g, k, stroke } = pen;
  g.fillStyle(fill);
  g.fillEllipse(k(x), k(y), k(w), k(h));
  stroke(line);
  g.strokeEllipse(k(x), k(y), k(w), k(h));
}

function filledTriangle(pen: Pen, pts: number[], fill: number, line: number = LINE.base): void {
  const { g, k, stroke } = pen;
  const [x1, y1, x2, y2, x3, y3] = pts.map(k);
  g.fillStyle(fill);
  g.fillTriangle(x1, y1, x2, y2, x3, y3);
  if (line > 0) {
    stroke(line);
    g.strokeTriangle(x1, y1, x2, y2, x3, y3);
  }
}

function cat(pen: Pen): void {
  const { g, k, stroke } = pen;
  const fur = 0xF5A249;
  for (const side of [-1, 1]) {
    filledTriangle(pen, [side * 30, -6, side * 25, -40, side * 6, -27], fur);
    filledTriangle(pen, [side * 24, -14, side * 23, -32, side * 12, -25], COLORS.pink, 0);
  }
  filledEllipse(pen, 0, 4, 64, 56, fur);

  // forehead stripes
  g.fillStyle(shade(fur, -0.22));
  g.fillRoundedRect(k(-2), k(-22), k(4), k(10), k(2));
  g.fillRoundedRect(k(-10), k(-20), k(4), k(8), k(2));
  g.fillRoundedRect(k(6), k(-20), k(4), k(8), k(2));

  cheeks(pen, 19, 12);
  eyes(pen, 11, 0);
  g.fillStyle(COLORS.pink);
  g.fillTriangle(k(-4.5), k(7), k(4.5), k(7), 0, k(12));
  stroke(LINE.hair, 0.9);
  g.strokeTriangle(k(-4.5), k(7), k(4.5), k(7), 0, k(12));
  snoot(pen, 12);

  stroke(LINE.hair, 0.6);
  g.lineBetween(k(-15), k(9), k(-35), k(5));
  g.lineBetween(k(-15), k(13), k(-34), k(15));
  g.lineBetween(k(15), k(9), k(35), k(5));
  g.lineBetween(k(15), k(13), k(34), k(15));
}

function dog(pen: Pen): void {
  const { g, k, stroke } = pen;
  const fur = 0xDDB083;
  const ear = 0x9C6B45;
  filledEllipse(pen, 0, 2, 58, 58, fur);

  // a patch over one eye
  g.fillStyle(ear, 0.45);
  g.fillCircle(k(11), k(-5), k(9));

  // floppy ears, hanging over the sides of the head
  filledEllipse(pen, -28, 0, 17, 38, ear);
  filledEllipse(pen, 28, 0, 17, 38, ear);

  filledEllipse(pen, 0, 15, 30, 22, COLORS.cream, LINE.thin);
  eyes(pen, 11, -5);

  // tongue, under the mouth
  g.fillStyle(COLORS.pink);
  g.fillRoundedRect(k(-4), k(16), k(8), k(9), k(4));
  stroke(LINE.hair, 0.9);
  g.strokeRoundedRect(k(-4), k(16), k(8), k(9), k(4));
  snoot(pen, 13, 4);
  stroke(LINE.thin);
  g.lineBetween(0, k(9), 0, k(13));

  g.fillStyle(COLORS.outline);
  g.fillEllipse(0, k(8), k(13), k(9));
  g.fillStyle(COLORS.white, 0.6);
  g.fillEllipse(k(-2), k(6.5), k(4), k(2.5));
}

function rabbit(pen: Pen): void {
  const { g, k, stroke } = pen;
  const fur = COLORS.white;
  for (const side of [-1, 1]) {
    filledEllipse(pen, side * 11, -27, 15, 40, fur);
    g.fillStyle(COLORS.pink, 0.85);
    g.fillEllipse(k(side * 11), k(-25), k(7), k(28));
  }
  filledEllipse(pen, 0, 10, 58, 52, fur);

  cheeks(pen, 18, 16);
  eyes(pen, 10, 5);
  g.fillStyle(COLORS.pink);
  g.fillEllipse(0, k(13), k(8), k(5.5));
  snoot(pen, 16, 3);

  // two front teeth
  g.fillStyle(COLORS.white);
  g.fillRoundedRect(k(-3.5), k(19), k(7), k(6), k(1.5));
  stroke(LINE.hair, 0.9);
  g.strokeRoundedRect(k(-3.5), k(19), k(7), k(6), k(1.5));
  g.lineBetween(0, k(19), 0, k(25));
}

function bear(pen: Pen): void {
  const { g, k } = pen;
  const fur = 0xA9774E;
  const light = 0xE3BB8D;
  for (const side of [-1, 1]) {
    filledCircle(pen, side * 22, -20, 11, fur);
    g.fillStyle(light);
    g.fillCircle(k(side * 22), k(-20), k(5.5));
  }
  filledCircle(pen, 0, 4, 29, fur);
  filledEllipse(pen, 0, 15, 28, 21, light, LINE.thin);
  cheeks(pen, 19, 9, COLORS.pink, 0.35);
  eyes(pen, 11, -2);
  snoot(pen, 15, 3.5);
  g.fillStyle(COLORS.outline);
  g.fillEllipse(0, k(10), k(12), k(8));
  g.fillStyle(COLORS.white, 0.6);
  g.fillEllipse(k(-2), k(8.5), k(4), k(2.5));
}

function fox(pen: Pen): void {
  const { g, k, stroke } = pen;
  const fur = 0xEC7A3C;
  const tip = 0x5A3A28;
  for (const side of [-1, 1]) {
    const ear = [side * 29, -6, side * 24, -42, side * 5, -24];
    filledTriangle(pen, ear, fur, 0);
    filledTriangle(pen, [side * 24, -14, side * 22, -32, side * 12, -22], COLORS.cream, 0);
    // dark tips, then the outline over the lot
    filledTriangle(pen, [side * 24, -42, side * 25.5, -31, side * 18.3, -36.6], tip, 0);
    stroke(LINE.base);
    g.strokeTriangle(k(ear[0]), k(ear[1]), k(ear[2]), k(ear[3]), k(ear[4]), k(ear[5]));
  }
  filledEllipse(pen, 0, 2, 62, 52, fur);

  // white cheeks and chin
  g.fillStyle(COLORS.cream);
  g.fillEllipse(k(-11), k(14), k(26), k(18));
  g.fillEllipse(k(11), k(14), k(26), k(18));
  g.fillTriangle(k(-12), k(12), k(12), k(12), 0, k(26));

  eyes(pen, 12, -5, 3.6);
  g.fillStyle(COLORS.outline);
  g.fillCircle(0, k(15), k(3.8));
  smile(pen, 25, 4.5);
}

function frog(pen: Pen): void {
  const { g, k } = pen;
  const skin = 0x74C255;
  filledCircle(pen, -15, -17, 13, skin);
  filledCircle(pen, 15, -17, 13, skin);
  filledEllipse(pen, 0, 8, 74, 50, skin);
  // the head covers the bottom of each eye bump, so redraw the tops over it
  g.fillStyle(skin);
  g.fillCircle(k(-15), k(-17), k(11.5));
  g.fillCircle(k(15), k(-17), k(11.5));

  for (const x of [-15, 15]) {
    filledCircle(pen, x, -18, 8.5, COLORS.white, LINE.thin);
    g.fillStyle(COLORS.outline);
    g.fillCircle(k(x), k(-17), k(4.4));
    g.fillStyle(COLORS.white, 0.95);
    g.fillCircle(k(x - 1.4), k(-18.6), k(1.6));
  }

  cheeks(pen, 24, 13);
  g.fillStyle(COLORS.outline, 0.8);
  g.fillCircle(k(-4), k(1), k(1.4));
  g.fillCircle(k(4), k(1), k(1.4));
  smile(pen, 22, 18, LINE.base);
}

function pig(pen: Pen): void {
  const { g, k, stroke } = pen;
  const skin = 0xF7B5C3;
  const deep = 0xEC8FA6;
  for (const side of [-1, 1]) {
    filledTriangle(pen, [side * 13, -24, side * 31, -36, side * 29, -8], skin);
  }
  filledCircle(pen, 0, 4, 29, skin);
  cheeks(pen, 20, 6, deep, 0.5);
  eyes(pen, 11, -6, 3.6);

  filledEllipse(pen, 0, 12, 26, 18, deep, LINE.thin);
  g.fillStyle(COLORS.outline, 0.8);
  g.fillEllipse(k(-5), k(12), k(4.5), k(7));
  g.fillEllipse(k(5), k(12), k(4.5), k(7));

  stroke(LINE.thin);
  g.beginPath();
  g.arc(0, k(20), k(5), 0.5, Math.PI - 0.5, false);
  g.strokePath();
}

function lion(pen: Pen): void {
  const { g, k } = pen;
  const mane = [COLORS.orange, 0xE08A2E];
  const face = 0xFFD66B;

  // The mane is a ring of scallops. Every scallop goes down in ink first and a size
  // larger, then every one again in colour, so the ring gets one clean outline instead of
  // an ink line through each overlap.
  const petals = 12;
  const at = (i: number) => {
    const a = (i / petals) * Math.PI * 2;
    return { x: Math.cos(a) * 28, y: 3 + Math.sin(a) * 28 };
  };
  g.fillStyle(COLORS.outline, 0.95);
  for (let i = 0; i < petals; i++) g.fillCircle(k(at(i).x), k(at(i).y), k(12) + Math.max(1, LINE.base * k(1)));
  for (let i = 0; i < petals; i++) {
    g.fillStyle(mane[i % 2]);
    g.fillCircle(k(at(i).x), k(at(i).y), k(12));
  }

  filledCircle(pen, -17, -16, 7, face);
  filledCircle(pen, 17, -16, 7, face);
  filledCircle(pen, 0, 4, 24, face);

  g.fillStyle(COLORS.cream);
  g.fillEllipse(0, k(14), k(24), k(15));
  cheeks(pen, 15, 9, COLORS.orange, 0.35);
  eyes(pen, 9, -1, 3.4);

  g.fillStyle(COLORS.outline);
  g.fillTriangle(k(-5), k(8), k(5), k(8), 0, k(13));
  snoot(pen, 13, 3);
  g.fillStyle(COLORS.outline, 0.55);
  for (const x of [-8, -5, 5, 8]) g.fillCircle(k(x), k(Math.abs(x) === 8 ? 14 : 17), k(0.9));
}
