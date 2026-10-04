import Phaser from 'phaser';
import { COLORS, INK, INK_SOFT, LINE, SIZE, text } from '../config';
import { bob, press, reduceMotion } from './Motion';
import { audio } from './Audio';

/**
 * The shared drawing kit.
 *
 * The rule that everything here follows: **anything that sits on top of scenery gets an
 * outline.** The previous version relied on soft fills against soft fills, which is why
 * a green button on green grass, or a wooden lounger on sand, dissolved into its
 * background. One warm near-black line (`COLORS.outline`) around every shape is what
 * makes the whole screen read as drawn rather than laid out.
 */

/**
 * Soft drop shadow under a rounded shape. Depth is what stops flat fills from
 * reading as slabs, so most solid objects get one.
 */
export function shadow(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  radius = 10, offset = 3, alpha = 0.12
): void {
  g.fillStyle(COLORS.shadow, alpha);
  g.fillRoundedRect(x + offset * 0.4, y + offset, w, h, radius);
}

/** Fill plus outline in one call — the shape every plate, card and sign is built from. */
export function plate(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  radius: number,
  fill: number,
  fillAlpha = 1,
  line = LINE.base,
  lineAlpha = 1
): void {
  g.fillStyle(fill, fillAlpha);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(line, COLORS.outline, lineAlpha);
  g.strokeRoundedRect(x, y, w, h, radius);
}

/** The glossy top band that turns a flat fill into something with a surface. */
export function sheen(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  radius: number,
  alpha = 0.28
): void {
  g.fillStyle(COLORS.white, alpha);
  g.fillRoundedRect(x + 4, y + 4, w - 8, h * 0.42, radius);
}

/** A light card surface — used for signs, panels and boards. */
export function panel(
  scene: Phaser.Scene,
  x: number, y: number, w: number, h: number,
  fill: number = COLORS.white,
  radius = 14
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  shadow(g, x - w / 2, y - h / 2, w, h, radius, 4, 0.16);
  plate(g, x - w / 2, y - h / 2, w, h, radius, fill);
  return g;
}

/**
 * Small caption attached to an interactive object.
 *
 * Now a hand-drawn tag rather than a translucent plate: outlined, tilted a degree or
 * two, and carrying a state dot on the left. The dot is what lets a child scan a screen
 * and see which jobs are left without reading a word of Danish — an amber dot means
 * "this one still wants you", a green tick means "done".
 */
export function caption(
  scene: Phaser.Scene,
  x: number, y: number,
  label: string,
  tone: 'idle' | 'done' = 'idle'
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const done = tone === 'done';

  const t = scene.add.text(0, 0, label, text(SIZE.label, done ? INK_SOFT : INK, 'bold'))
    .setOrigin(0.5);

  const dotW = 18;
  const w = t.width + 30 + dotW;
  const h = t.height + 13;
  t.setX(dotW / 2 + 3);

  const bg = scene.add.graphics();
  shadow(bg, -w / 2, -h / 2, w, h, h / 2, 2, 0.14);
  plate(bg, -w / 2, -h / 2, w, h, h / 2, done ? COLORS.cream : COLORS.white, done ? 0.92 : 1, LINE.thin, done ? 0.5 : 0.85);

  // Drawn into the same Graphics as the plate, and outlined by underlay — one object
  // and no stroked circle. Captions are the most-repeated element in the game.
  const mx = -w / 2 + 16;
  if (done) {
    bg.fillStyle(shade(COLORS.green, -0.4));
    bg.fillCircle(mx, 0, 8.5);
    bg.fillStyle(COLORS.green);
    bg.fillCircle(mx, 0, 7.5);
    bg.lineStyle(2, COLORS.white, 1);
    bg.beginPath();
    bg.moveTo(mx - 3.2, 0);
    bg.lineTo(mx - 1, 2.6);
    bg.lineTo(mx + 3.4, -2.8);
    bg.strokePath();
  } else {
    bg.fillStyle(COLORS.outline, 0.7);
    bg.fillCircle(mx, 0, 7.5);
    bg.fillStyle(COLORS.sun);
    bg.fillCircle(mx, 0, 6.5);
  }

  c.add([bg, t]);

  // A tag pinned by hand is never quite straight. Deterministic from the label so the
  // same caption does not jitter to a new angle on every refresh().
  const lean = ((label.length % 5) - 2) * 0.5;
  c.setAngle(lean);

  return c;
}

/**
 * The chunky button.
 *
 * Built as a face sitting on a darker lip, so pressing it can push the face down onto
 * the lip instead of merely scaling it — the difference between a web control and
 * something a four-year-old wants to poke again.
 */
export function button(
  scene: Phaser.Scene,
  x: number, y: number,
  label: string,
  color: number,
  onClick: () => void,
  w = 210, h = 52,
  size = SIZE.heading
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const r = h / 2;
  const lip = Math.max(5, Math.round(h * 0.14));

  const base = scene.add.graphics();
  shadow(base, -w / 2, -h / 2, w, h + lip, r, 4, 0.2);
  plate(base, -w / 2, -h / 2 + lip, w, h, r, shade(color, -0.24), 1, LINE.thick);
  c.add(base);

  // Everything that moves on press lives in one child container.
  const face = scene.add.container(0, 0);
  const g = scene.add.graphics();
  plate(g, -w / 2, -h / 2, w, h, r, color, 1, LINE.thick);
  sheen(g, -w / 2, -h / 2, w, h, r);
  const t = scene.add.text(0, 0, label, text(size, '#FFFFFF', 'bold')).setOrigin(0.5);
  t.setShadow(0, 2, 'rgba(74,58,44,0.45)', 0, false, true);
  face.add([g, t]);
  c.add(face);

  c.setSize(w, h + lip);
  c.setInteractive({ useHandCursor: true });

  if (!reduceMotion()) {
    c.on('pointerover', () => scene.tweens.add({ targets: c, scale: 1.05, duration: 130, ease: 'Back.easeOut' }));
    c.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 130 }));
  }

  c.on('pointerdown', () => {
    audio.tap();
    if (reduceMotion()) {
      onClick();
      return;
    }
    scene.tweens.add({
      targets: face,
      y: lip,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: onClick,
    });
  });

  return c;
}

/** Makes any container tappable with the same squash feedback as `button`. */
export function tappable(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  w: number, h: number,
  onClick: () => void,
  sound: 'tap' | 'pop' | 'bell' = 'pop'
): void {
  target.setSize(w, h);
  target.setInteractive({ useHandCursor: true });
  const base = target.scale;
  if (!reduceMotion()) {
    target.on('pointerover', () => scene.tweens.add({ targets: target, scale: base * 1.06, duration: 130, ease: 'Back.easeOut' }));
    target.on('pointerout', () => scene.tweens.add({ targets: target, scale: base, duration: 130 }));
  }
  target.on('pointerdown', () => {
    audio[sound]();
    press(scene, target, onClick, 0.9);
  });
}

/**
 * Lightens (`amount` > 0) or darkens a colour.
 *
 * Used for the button lip, the shaded side of every solid, and the pressed state, so
 * those shades are derived from one hue rather than hand-picked per call site — which
 * is what let the old palette drift.
 */
export function shade(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const mix = (v: number) => amount >= 0
    ? Math.round(v + (255 - v) * amount)
    : Math.round(v * (1 + amount));
  return Phaser.Display.Color.GetColor(mix(c.red), mix(c.green), mix(c.blue));
}

/** Vertical gradient band — replaces the flat sky and grass fills. */
export function gradientBand(
  scene: Phaser.Scene,
  y: number, h: number,
  top: number, bottom: number
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, y, scene.scale.width, h);
  return g;
}

/**
 * Title banner: a ribbon with folded tails.
 *
 * Scene titles used to be bare outlined text floating in the sky, which is why every
 * screen opened looking like a slide. A banner gives the title somewhere to hang from.
 */
export function ribbon(
  scene: Phaser.Scene,
  x: number, y: number,
  label: string,
  color: number = COLORS.roof,
  size = SIZE.title
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);

  const t = scene.add.text(0, 0, label, text(size, '#FFFFFF', 'bold')).setOrigin(0.5);
  t.setShadow(0, 2, 'rgba(74,58,44,0.5)', 0, false, true);

  const w = t.width + 56;
  const h = t.height + 16;
  const tail = 22;

  const g = scene.add.graphics();

  // tails first, so the body overlaps their inner ends
  const deep = shade(color, -0.28);
  [-1, 1].forEach(side => {
    const ox = side * (w / 2 - 4);
    g.fillStyle(deep);
    g.beginPath();
    g.moveTo(ox, -h / 2 + 3);
    g.lineTo(ox + side * tail, -h / 2 - 3);
    g.lineTo(ox + side * tail, h / 2 + 7);
    g.lineTo(ox, h / 2 - 3);
    g.closePath();
    g.fillPath();
    g.lineStyle(LINE.base, COLORS.outline);
    g.strokePath();
  });

  shadow(g, -w / 2, -h / 2, w, h, 9, 4, 0.2);
  plate(g, -w / 2, -h / 2, w, h, 9, color, 1, LINE.thick);
  sheen(g, -w / 2, -h / 2, w, h, 8, 0.22);

  c.add([g, t]);
  c.setSize(w + tail * 2, h);
  return c;
}

/**
 * A string of triangular flags. Nothing says "somewhere nice is happening here" for
 * this age group as cheaply as bunting, and it fills the dead sky the old screens had.
 *
 * Every flag is painted into a single Graphics rather than getting its own object. Each
 * Graphics is a separate batch flush in Phaser's WebGL renderer, and thirteen of them
 * animating independently cost more frame time than the ripple was worth — the whole
 * string sways as one instead.
 */
export function bunting(
  scene: Phaser.Scene,
  x1: number, y1: number,
  x2: number, y2: number,
  count = 9,
  sag = 26
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();
  const palette = [COLORS.red, COLORS.sun, COLORS.teal, COLORS.pink, COLORS.purple, COLORS.green];

  // Quadratic sag, so the line hangs instead of running straight across.
  const at = (t: number) => {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 + sag * 2;
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
      y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
    };
  };

  g.lineStyle(LINE.base, COLORS.outline, 0.75);
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const p = at(i / 40);
    if (i === 0) g.moveTo(p.x, p.y);
    else g.lineTo(p.x, p.y);
  }
  g.strokePath();

  for (let i = 0; i < count; i++) {
    const p = at((i + 0.5) / count);
    const col = palette[i % palette.length];
    // Alternating widths stand in for the old per-flag flutter.
    const half = i % 2 === 0 ? 9 : 7;

    g.fillStyle(col);
    g.fillTriangle(p.x - half, p.y, p.x + half, p.y, p.x, p.y + 22);
    g.lineStyle(LINE.thin, COLORS.outline, 0.85);
    g.strokeTriangle(p.x - half, p.y, p.x + half, p.y, p.x, p.y + 22);
    g.fillStyle(COLORS.white, 0.22);
    g.fillTriangle(p.x - half, p.y, p.x, p.y, p.x - half / 2, p.y + 11);
  }

  c.add(g);
  bob(scene, c, 4, 3200);
  return c;
}

/** Chunky progress bar. Reads as a filling tube rather than a row of dots. */
export function progressBar(
  scene: Phaser.Scene,
  x: number, y: number,
  w: number, h: number,
  fraction: number,
  color: number = COLORS.green
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const r = h / 2;
  const f = Phaser.Math.Clamp(fraction, 0, 1);

  plate(g, -w / 2, -h / 2, w, h, r, COLORS.white, 0.92, LINE.thin);

  if (f > 0) {
    // Never narrower than its own cap, or the first sliver draws as a lens shape.
    const fw = Math.max(h, w * f);
    g.fillStyle(shade(color, -0.2));
    g.fillRoundedRect(-w / 2, -h / 2, fw, h, r);
    g.fillStyle(color);
    g.fillRoundedRect(-w / 2, -h / 2, fw, h - 3, r);
    g.fillStyle(COLORS.white, 0.35);
    g.fillRoundedRect(-w / 2 + 3, -h / 2 + 2.5, fw - 6, h * 0.32, r);
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  }

  c.add(g);
  return c;
}

/** Small round count badge — "3 jobs left" on a map button. */
export function badge(
  scene: Phaser.Scene,
  x: number, y: number,
  label: string,
  color: number = COLORS.red
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const r = 14;

  g.fillStyle(COLORS.shadow, 0.2);
  g.fillCircle(1, 2.5, r);
  g.fillStyle(color);
  g.fillCircle(0, 0, r);
  g.fillStyle(COLORS.white, 0.3);
  g.fillCircle(-4, -5, r * 0.42);
  g.lineStyle(LINE.base, COLORS.outline);
  g.strokeCircle(0, 0, r);

  c.add([g, scene.add.text(0, 0, label, text(SIZE.label, '#FFFFFF', 'bold')).setOrigin(0.5)]);
  return c;
}

/** A five-pointed star drawn to the same spec everywhere: gold, shaded, outlined. */
export function drawStarShape(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number,
  radius: number,
  outline = true
): void {
  g.fillStyle(COLORS.sunDeep);
  g.fillPoints(starPoints(x, y + radius * 0.12, radius), true);
  g.fillStyle(COLORS.sun);
  g.fillPoints(starPoints(x, y, radius), true);
  if (outline) {
    g.lineStyle(LINE.thin, COLORS.outline, 0.9);
    g.strokePoints(starPoints(x, y, radius), true, true);
  }
}

function starPoints(cx: number, cy: number, radius: number): Phaser.Geom.Point[] {
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.46;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    pts.push(new Phaser.Geom.Point(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

export function drawSun(scene: Phaser.Scene, x: number, y: number, radius = 26): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);

  const rays = scene.add.graphics();
  // Tapered spikes rather than dots — a ring of circles read as a cog.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const inner = radius + 4;
    const outer = radius + (i % 2 === 0 ? 20 : 13);
    const spread = 0.1;
    rays.fillStyle(COLORS.sun, 0.55);
    rays.fillTriangle(
      Math.cos(a - spread) * inner, Math.sin(a - spread) * inner,
      Math.cos(a + spread) * inner, Math.sin(a + spread) * inner,
      Math.cos(a) * outer, Math.sin(a) * outer
    );
  }

  const glow = scene.add.graphics();
  glow.fillStyle(COLORS.sun, 0.25);
  glow.fillCircle(0, 0, radius * 1.4);

  const body = scene.add.graphics();
  body.fillStyle(COLORS.sunDeep);
  body.fillCircle(0, 2, radius);
  body.fillStyle(COLORS.sun);
  body.fillCircle(0, 0, radius);
  body.lineStyle(LINE.base, COLORS.outline, 0.75);
  body.strokeCircle(0, 0, radius);
  body.fillStyle(COLORS.white, 0.4);
  body.fillEllipse(-radius * 0.33, -radius * 0.38, radius * 0.55, radius * 0.4);

  // A face. Every machine on this site has one; the sun is allowed one too.
  // Drawn into the body rather than its own object — it never animates separately.
  const face = body;
  face.fillStyle(COLORS.outline, 0.75);
  face.fillCircle(-radius * 0.3, -radius * 0.1, radius * 0.1);
  face.fillCircle(radius * 0.3, -radius * 0.1, radius * 0.1);
  face.lineStyle(radius * 0.09, COLORS.outline, 0.7);
  face.beginPath();
  face.arc(0, radius * 0.06, radius * 0.42, 0.35, Math.PI - 0.35, false);
  face.strokePath();
  face.fillStyle(COLORS.roof, 0.28);
  face.fillCircle(-radius * 0.56, radius * 0.2, radius * 0.16);
  face.fillCircle(radius * 0.56, radius * 0.2, radius * 0.16);

  c.add([rays, glow, body]);

  if (!reduceMotion()) {
    scene.tweens.add({ targets: rays, angle: 360, duration: 34000, repeat: -1 });
    scene.tweens.add({
      targets: glow, scale: 1.14, duration: 3000,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  return c;
}

export function drawCloud(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const s = scale;

  g.fillStyle(COLORS.skyDeep, 0.28);
  g.fillCircle(2 * s, 8 * s, 22 * s);
  g.fillCircle(-20 * s, 11 * s, 15 * s);
  g.fillCircle(22 * s, 11 * s, 17 * s);

  g.fillStyle(COLORS.white, 0.97);
  g.fillCircle(0, 0, 22 * s);
  g.fillCircle(-20 * s, 6 * s, 15 * s);
  g.fillCircle(20 * s, 6 * s, 17 * s);
  g.fillCircle(8 * s, -12 * s, 15 * s);

  c.add(g);
  return c;
}

/** Two wing strokes — the cheapest possible bird, and it fills a lot of empty sky. */
export function drawBird(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScale(scale);
  const g = scene.add.graphics();
  g.lineStyle(2.4, COLORS.outline, 0.55);
  g.beginPath();
  g.moveTo(-11, 0);
  g.lineTo(-5, -6);
  g.lineTo(0, -1);
  g.lineTo(5, -6);
  g.lineTo(11, 0);
  g.strokePath();
  c.add(g);

  if (!reduceMotion()) {
    scene.tweens.add({
      targets: g,
      scaleY: { from: 1, to: 0.45 },
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  return c;
}

/**
 * Sends a few birds drifting across the top of an outdoor scene. Slow enough to be
 * scenery, not slow enough to look frozen.
 */
export function addBirds(scene: Phaser.Scene, count = 3, topY = 70, band = 60): Phaser.GameObjects.Container[] {
  const { width } = scene.scale;
  const out: Phaser.GameObjects.Container[] = [];
  for (let i = 0; i < count; i++) {
    const y = topY + (i / Math.max(1, count - 1)) * band;
    const b = drawBird(scene, -40 - i * 120, y, 0.7 + (i % 2) * 0.35);
    out.push(b);
    if (reduceMotion()) {
      b.setX(160 + i * 240);
      continue;
    }
    scene.tweens.add({
      targets: b,
      x: width + 60,
      duration: 26000 + i * 7000,
      repeat: -1,
      delay: i * 5200,
      ease: 'Linear',
    });
    scene.tweens.add({
      targets: b,
      y: y + 16,
      duration: 3400 + i * 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  return out;
}

export function drawTree(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const s = scale;

  g.fillStyle(COLORS.shadow, 0.12);
  g.fillEllipse(4 * s, 22 * s, 50 * s, 13 * s);

  g.fillStyle(COLORS.woodDeep);
  g.fillRoundedRect(-7 * s, -18 * s, 14 * s, 40 * s, 5 * s);
  g.fillStyle(COLORS.wood);
  g.fillRoundedRect(-7 * s, -18 * s, 8 * s, 40 * s, 4 * s);
  g.lineStyle(LINE.thin * s, COLORS.outline, 0.75);
  g.strokeRoundedRect(-7 * s, -18 * s, 14 * s, 40 * s, 5 * s);

  g.fillStyle(COLORS.grassDeep);
  g.fillCircle(3 * s, -36 * s, 29 * s);
  g.fillCircle(-17 * s, -22 * s, 21 * s);
  g.fillCircle(19 * s, -22 * s, 21 * s);

  g.fillStyle(COLORS.grass);
  g.fillCircle(0, -40 * s, 26 * s);
  g.fillCircle(-16 * s, -25 * s, 18 * s);
  g.fillCircle(16 * s, -25 * s, 18 * s);

  g.fillStyle(COLORS.grassLight, 0.6);
  g.fillCircle(-8 * s, -48 * s, 11 * s);

  // One outline traced around the outside of the canopy lumps, not each lump.
  g.lineStyle(LINE.base * s, COLORS.outline, 0.7);
  g.strokeCircle(3 * s, -36 * s, 29 * s);
  g.strokeCircle(-17 * s, -22 * s, 21 * s);
  g.strokeCircle(19 * s, -22 * s, 21 * s);

  c.add(g);
  return c;
}

/**
 * Paints a flower into an existing Graphics.
 *
 * The `paint*` half of this module exists so a scene can batch a whole field of scenery
 * into one Graphics object. Eleven separate flower objects on the title screen cost
 * eleven draw calls to say the same thing one costs.
 */
export function paintFlower(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number,
  petal: number = COLORS.pink,
  scale = 1
): void {
  const s = scale;

  g.lineStyle(2.8 * s, COLORS.grassDeep);
  g.beginPath();
  g.moveTo(x, y + 20 * s);
  g.lineTo(x, y + 2 * s);
  g.strokePath();

  g.fillStyle(COLORS.grassDeep);
  g.fillEllipse(x - 6 * s, y + 12 * s, 12.5 * s, 7.5 * s);
  g.fillStyle(COLORS.grass);
  g.fillEllipse(x - 6 * s, y + 12 * s, 11 * s, 6 * s);

  // Outlined by underlay rather than by stroking each petal: a stroked circle costs
  // Phaser a full triangle strip round the rim, and these flowers are redrawn every
  // frame in the garden's dynamic layer. Two fills beat a fill plus a stroke, and at
  // this size the result is indistinguishable.
  const ring = shade(COLORS.outline, 0.28);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * 6.5 * s;
    const py = y + Math.sin(a) * 6.5 * s;
    g.fillStyle(ring, 0.75);
    g.fillCircle(px, py, 7 * s);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.fillStyle(petal, 1);
    g.fillCircle(x + Math.cos(a) * 6.5 * s, y + Math.sin(a) * 6.5 * s, 6 * s);
  }
  g.fillStyle(ring, 0.75);
  g.fillCircle(x, y, 5 * s);
  g.fillStyle(COLORS.sun);
  g.fillCircle(x, y, 4 * s);
}

/** A flower as its own object — for the ones that have to appear, move or be tapped. */
export function drawFlower(
  scene: Phaser.Scene,
  x: number, y: number,
  petal: number = COLORS.pink,
  scale = 1
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  paintFlower(g, 0, 0, petal, scale);
  c.add(g);
  return c;
}

/**
 * Scatters decorative flowers across a band of ground, all into one Graphics.
 *
 * `rng` is passed a 0-1 position so callers can keep a deterministic layout if they
 * want one; by default the placement is random per scene start.
 */
export function scatterFlowers(
  scene: Phaser.Scene,
  count: number,
  topY: number, bottomY: number,
  scale = 0.6,
  margin = 36
): Phaser.GameObjects.Graphics {
  const { width } = scene.scale;
  const g = scene.add.graphics();
  const petals = [COLORS.pink, COLORS.yellow, COLORS.purple, COLORS.white];
  for (let i = 0; i < count; i++) {
    paintFlower(
      g,
      Phaser.Math.Between(margin, width - margin),
      Phaser.Math.Between(topY, bottomY),
      petals[i % petals.length],
      scale
    );
  }
  return g;
}

/**
 * A person — the families who move into the finished houses.
 *
 * The eyes are a separate Graphics positioned on the eye line, so collapsing its
 * scaleY reads as a blink rather than as the whole face squashing.
 */
export function drawPerson(
  scene: Phaser.Scene,
  x: number, y: number,
  bodyColor: number,
  scale = 1
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const s = scale;
  const line = LINE.thin * s;

  g.fillStyle(COLORS.shadow, 0.12);
  g.fillEllipse(0, 36 * s, 42 * s, 11 * s);

  // legs
  g.fillStyle(shade(bodyColor, -0.45));
  g.fillRoundedRect(-9 * s, 24 * s, 7 * s, 14 * s, 3 * s);
  g.fillRoundedRect(2 * s, 24 * s, 7 * s, 14 * s, 3 * s);
  g.lineStyle(line, COLORS.outline, 0.8);
  g.strokeRoundedRect(-9 * s, 24 * s, 7 * s, 14 * s, 3 * s);
  g.strokeRoundedRect(2 * s, 24 * s, 7 * s, 14 * s, 3 * s);

  // arms behind the torso, so the silhouette reads wide
  g.fillStyle(shade(bodyColor, -0.12));
  g.fillRoundedRect(-24 * s, -4 * s, 9 * s, 26 * s, 4.5 * s);
  g.fillRoundedRect(15 * s, -4 * s, 9 * s, 26 * s, 4.5 * s);
  g.lineStyle(line, COLORS.outline, 0.8);
  g.strokeRoundedRect(-24 * s, -4 * s, 9 * s, 26 * s, 4.5 * s);
  g.strokeRoundedRect(15 * s, -4 * s, 9 * s, 26 * s, 4.5 * s);
  g.fillStyle(0xF6D9BE);
  g.fillCircle(-19.5 * s, 21 * s, 4.8 * s);
  g.fillCircle(19.5 * s, 21 * s, 4.8 * s);
  g.strokeCircle(-19.5 * s, 21 * s, 4.8 * s);
  g.strokeCircle(19.5 * s, 21 * s, 4.8 * s);

  // torso
  g.fillStyle(bodyColor);
  g.fillRoundedRect(-17 * s, -8 * s, 34 * s, 34 * s, 11 * s);
  g.lineStyle(LINE.base * s, COLORS.outline, 0.85);
  g.strokeRoundedRect(-17 * s, -8 * s, 34 * s, 34 * s, 11 * s);
  // collar
  g.fillStyle(COLORS.white, 0.6);
  g.fillRoundedRect(-9 * s, -9 * s, 18 * s, 6 * s, 3 * s);

  // neck + head
  g.fillStyle(0xF6D9BE);
  g.fillRoundedRect(-4 * s, -14 * s, 8 * s, 8 * s, 3 * s);
  g.fillCircle(0, -24 * s, 14 * s);
  g.lineStyle(LINE.base * s, COLORS.outline, 0.85);
  g.strokeCircle(0, -24 * s, 14 * s);
  // hair
  g.fillStyle(shade(bodyColor, -0.55));
  g.slice(0, -24 * s, 14.5 * s, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360), false);
  g.fillPath();

  // mouth + cheeks (the eyes go on their own object below)
  g.lineStyle(1.8 * s, COLORS.outline, 0.85);
  g.beginPath();
  g.arc(0, -21 * s, 5 * s, 0.25, Math.PI - 0.25, false);
  g.strokePath();
  g.fillStyle(COLORS.pink, 0.45);
  g.fillCircle(-9 * s, -21 * s, 3.4 * s);
  g.fillCircle(9 * s, -21 * s, 3.4 * s);

  const eyes = scene.add.graphics().setPosition(0, -26 * s);
  eyes.fillStyle(COLORS.outline);
  eyes.fillCircle(-4.5 * s, 0, 2 * s);
  eyes.fillCircle(4.5 * s, 0, 2 * s);
  eyes.fillStyle(COLORS.white, 0.9);
  eyes.fillCircle(-5.3 * s, -0.8 * s, 0.7 * s);
  eyes.fillCircle(3.7 * s, -0.8 * s, 0.7 * s);

  c.add([g, eyes]);
  blink(scene, eyes);
  return c;
}

/** Head-and-shoulders only — for somebody seen in a window. */
export function drawHead(
  scene: Phaser.Scene,
  x: number, y: number,
  bodyColor: number,
  scale = 1
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const s = scale;

  g.fillStyle(bodyColor);
  g.fillRoundedRect(-11 * s, -2 * s, 22 * s, 12 * s, 5 * s);
  g.lineStyle(LINE.thin * s, COLORS.outline, 0.85);
  g.strokeRoundedRect(-11 * s, -2 * s, 22 * s, 12 * s, 5 * s);

  g.fillStyle(0xF6D9BE);
  g.fillCircle(0, -9 * s, 11 * s);
  g.strokeCircle(0, -9 * s, 11 * s);
  g.fillStyle(shade(bodyColor, -0.55));
  g.slice(0, -9 * s, 11.4 * s, Phaser.Math.DegToRad(185), Phaser.Math.DegToRad(355), false);
  g.fillPath();

  g.lineStyle(1.5 * s, COLORS.outline, 0.85);
  g.beginPath();
  g.arc(0, -6 * s, 3.6 * s, 0.25, Math.PI - 0.25, false);
  g.strokePath();
  g.fillStyle(COLORS.pink, 0.45);
  g.fillCircle(-6.5 * s, -6 * s, 2.6 * s);
  g.fillCircle(6.5 * s, -6 * s, 2.6 * s);

  const eyes = scene.add.graphics().setPosition(0, -10 * s);
  eyes.fillStyle(COLORS.outline);
  eyes.fillCircle(-3.5 * s, 0, 1.7 * s);
  eyes.fillCircle(3.5 * s, 0, 1.7 * s);

  c.add([g, eyes]);
  blink(scene, eyes);
  return c;
}

/**
 * Random slow blinking.
 *
 * Rescheduled per blink rather than run as a repeating tween so a crowd of people never
 * falls into lockstep, which reads as uncanny rather than alive.
 */
function blink(scene: Phaser.Scene, eyes: Phaser.GameObjects.Graphics): void {
  if (reduceMotion()) return;
  const next = () => {
    if (!eyes.active) return;
    scene.time.delayedCall(Phaser.Math.Between(2200, 6000), () => {
      if (!eyes.active) return;
      scene.tweens.add({
        targets: eyes,
        scaleY: 0.1,
        duration: 70,
        yoyo: true,
        onComplete: next,
      });
    });
  };
  next();
}

/**
 * Potted palm. Used to break up the wide empty walls in the interiors, which were the
 * flattest part of the old build.
 *
 * Pot and all five fronds go into one Graphics, using the canvas-transform commands to
 * place the rotated fronds. Giving each frond its own object and its own sway tween was
 * six draw calls and five tweens per plant, which is not what a background plant should
 * cost; the whole plant leans as one instead.
 */
export function drawPalm(scene: Phaser.Scene, x: number, y: number, scale = 1): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScale(scale);
  const g = scene.add.graphics();

  // fronds first, so the pot's rim overlaps their stems
  [-62, -30, 0, 30, 62].forEach((deg, i) => {
    g.save();
    g.translateCanvas(0, 2);
    g.rotateCanvas(Phaser.Math.DegToRad(deg));
    g.fillStyle(i % 2 === 0 ? COLORS.grassDeep : COLORS.grass);
    g.fillEllipse(0, -30, 19, 58);
    g.lineStyle(LINE.thin, COLORS.outline, 0.6);
    g.strokeEllipse(0, -30, 19, 58);
    g.restore();
  });

  g.fillStyle(COLORS.shadow, 0.14);
  g.fillEllipse(0, 44, 56, 13);

  // pot
  g.fillStyle(COLORS.roofDeep);
  g.fillRoundedRect(-23, 8, 46, 38, { tl: 4, tr: 4, bl: 13, br: 13 });
  g.fillStyle(COLORS.roof);
  g.fillRoundedRect(-23, 8, 20, 38, { tl: 4, tr: 0, bl: 13, br: 0 });
  g.lineStyle(LINE.base, COLORS.outline, 0.85);
  g.strokeRoundedRect(-23, 8, 46, 38, { tl: 4, tr: 4, bl: 13, br: 13 });
  g.fillStyle(COLORS.wallDeep);
  g.fillRoundedRect(-27, 2, 54, 12, 5);
  g.lineStyle(LINE.base, COLORS.outline, 0.85);
  g.strokeRoundedRect(-27, 2, 54, 12, 5);

  c.add(g);

  if (!reduceMotion()) {
    scene.tweens.add({
      targets: c,
      angle: { from: -1.6, to: 1.6 },
      duration: 3600 + (Math.abs(x) % 700),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  return c;
}

/**
 * A floating balloon on a string. Purely decorative; one or two per outdoor scene is
 * enough to make the sky feel occupied.
 */
export function drawBalloon(
  scene: Phaser.Scene,
  x: number, y: number,
  color: number = COLORS.red,
  scale = 1
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y).setScale(scale);
  const g = scene.add.graphics();

  g.lineStyle(1.6, COLORS.outline, 0.5);
  g.beginPath();
  g.moveTo(0, 20);
  g.lineTo(3, 34);
  g.lineTo(-2, 46);
  g.strokePath();

  g.fillStyle(shade(color, -0.2));
  g.fillEllipse(0, 0, 34, 42);
  g.fillStyle(color);
  g.fillEllipse(-1.5, -1.5, 31, 39);
  g.lineStyle(LINE.base, COLORS.outline, 0.85);
  g.strokeEllipse(0, 0, 34, 42);
  g.fillStyle(COLORS.white, 0.4);
  g.fillEllipse(-8, -10, 9, 12);
  g.fillStyle(shade(color, -0.3));
  g.fillTriangle(-4, 20, 4, 20, 0, 26);

  c.add(g);
  bob(scene, c, 9, 2600 + (x % 400));
  return c;
}
