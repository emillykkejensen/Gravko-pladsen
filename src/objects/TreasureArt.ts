import Phaser from 'phaser';
import { COLORS, LINE } from '../config';
import { shade } from '../helpers/Draw';

/**
 * The things dug up under the building site (state/Treasures), each drawn in the game's own
 * style: a flat fill, a darker side, a white highlight and the warm outline.
 *
 * Every drawing is centred on the origin and fits a box about 80 across, so the chest, the
 * find card and the glint in the earth can all scale it the same way.
 */

type G = Phaser.GameObjects.Graphics;

const INKLINE = COLORS.outline;

/** A closed shape with a darker copy nudged down-right behind it: the shaded side. */
function solid(g: G, pts: { x: number; y: number }[], color: number, line = LINE.base): void {
  g.fillStyle(shade(color, -0.28));
  g.fillPoints(pts.map(p => ({ x: p.x + 2, y: p.y + 3 })), true);
  g.fillStyle(color);
  g.fillPoints(pts, true);
  g.lineStyle(line, INKLINE, 1);
  g.strokePoints(pts, true, true);
}

function blob(g: G, cx: number, cy: number, rx: number, ry: number, color: number, wobble = 0, seed = 1): void {
  const pts = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const k = 1 + wobble * Math.sin(a * 3 + seed) * 0.5 + wobble * Math.cos(a * 5 + seed * 2) * 0.3;
    return { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k };
  });
  solid(g, pts, color);
}

function shine(g: G, x: number, y: number, w: number, h: number, alpha = 0.55): void {
  g.fillStyle(COLORS.white, alpha);
  g.fillEllipse(x, y, w, h);
}

/** Two dots and a smile, for the finds that are alive. */
function littleFace(g: G, x: number, y: number, s = 1): void {
  g.fillStyle(INKLINE);
  g.fillCircle(x - 4 * s, y - 2 * s, 2 * s);
  g.fillCircle(x + 4 * s, y - 2 * s, 2 * s);
  g.lineStyle(1.8 * s, INKLINE, 1);
  g.beginPath();
  g.arc(x, y + 1 * s, 3.4 * s, 0.3, Math.PI - 0.3, false);
  g.strokePath();
  g.fillStyle(COLORS.pink, 0.6);
  g.fillCircle(x - 7 * s, y + 2 * s, 2 * s);
  g.fillCircle(x + 7 * s, y + 2 * s, 2 * s);
}

/* ---------------------------------------------------------------- the finds --- */

function worm(g: G): void {
  const pts = Array.from({ length: 15 }, (_, i) => ({ x: -32 + i * 4.4, y: Math.sin(i * 0.75) * 9 + 6 }));
  // outline first, then the body over it, then the rings
  for (const p of pts) {
    g.fillStyle(INKLINE);
    g.fillCircle(p.x, p.y, 9.5);
  }
  for (const p of pts) {
    g.fillStyle(0xE8939A);
    g.fillCircle(p.x, p.y, 7.5);
  }
  g.lineStyle(1.5, shade(0xE8939A, -0.3), 1);
  for (let i = 2; i < pts.length - 2; i += 2) g.lineBetween(pts[i].x - 2, pts[i].y - 6, pts[i].x + 1, pts[i].y + 6);
  g.fillStyle(COLORS.white, 0.45);
  for (let i = 1; i < pts.length; i += 3) g.fillCircle(pts[i].x - 2, pts[i].y - 4, 2.2);
  const head = pts[pts.length - 1];
  g.fillStyle(INKLINE);
  g.fillCircle(head.x + 2, head.y, 12);
  g.fillStyle(0xEFA2A8);
  g.fillCircle(head.x + 2, head.y, 10);
  littleFace(g, head.x + 3, head.y, 0.85);
}

function amber(g: G): void {
  blob(g, 0, 0, 30, 24, 0xEFA12E, 0.22, 2);
  g.fillStyle(0xF8C55A, 0.9);
  g.fillEllipse(-4, -3, 36, 26);
  // a tiny insect caught inside
  g.fillStyle(shade(0xEFA12E, -0.55), 0.9);
  g.fillEllipse(4, 4, 9, 5);
  g.fillCircle(9, 3, 2.5);
  g.lineStyle(1.2, shade(0xEFA12E, -0.55), 0.9);
  g.lineBetween(2, 2, -3, -3);
  g.lineBetween(5, 2, 3, -4);
  g.lineBetween(2, 6, -2, 10);
  g.lineBetween(6, 6, 6, 10);
  g.fillStyle(COLORS.white, 0.35);
  g.fillEllipse(-2, -2, 6, 3);
  shine(g, -13, -11, 14, 8, 0.7);
}

function horseshoe(g: G): void {
  // a U opening upwards, drawn as points so the gap at the top stays open
  const arcPts = (r: number) => Array.from({ length: 25 }, (_, i) => {
    const a = Math.PI * (-0.08 + (i / 24) * 1.16);
    return { x: Math.cos(a) * r, y: -6 + Math.sin(a) * r * 1.05 };
  });
  const outer = arcPts(32);
  const inner = arcPts(17).reverse();
  solid(g, [...outer, ...inner], COLORS.steel);
  g.lineStyle(3, COLORS.steelLight, 0.9);
  g.strokePoints(arcPts(28).slice(3, 12), false);
  // the nail holes
  g.fillStyle(COLORS.steelDeep);
  for (const i of [3, 6, 9, 15, 18, 21]) {
    const p = arcPts(24.5)[i];
    g.fillCircle(p.x, p.y, 2.2);
  }
}

function potato(g: G): void {
  blob(g, 0, 2, 32, 22, 0xD2A86A, 0.12, 4);
  g.fillStyle(shade(0xD2A86A, -0.25));
  for (const [x, y] of [[-14, -2], [8, -8], [16, 8], [-4, 10], [-20, 10]]) g.fillEllipse(x, y, 5, 3);
  shine(g, -12, -9, 16, 7, 0.4);
  // a sprout, because a potato left in the ground grows
  g.lineStyle(LINE.base, INKLINE, 1);
  g.fillStyle(COLORS.green);
  g.fillEllipse(10, -27, 10, 16);
  g.strokeEllipse(10, -27, 10, 16);
  g.fillEllipse(20, -24, 12, 8);
  g.strokeEllipse(20, -24, 12, 8);
  g.lineBetween(10, -20, 10, -17);
}

function seaUrchin(g: G): void {
  const c = 0xE4D8BE;
  g.fillStyle(shade(c, -0.3));
  g.fillCircle(2, 3, 30);
  g.fillStyle(c);
  g.fillCircle(0, 0, 30);
  g.lineStyle(LINE.base, INKLINE, 1);
  g.strokeCircle(0, 0, 30);
  // the five-pointed star of dotted rows every one of them carries
  g.fillStyle(shade(c, -0.35));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    for (const side of [-1, 1]) {
      for (let d = 6; d <= 24; d += 4.5) {
        const spread = 0.17 * side * Math.sin((d / 26) * Math.PI);
        g.fillCircle(Math.cos(a + spread) * d, Math.sin(a + spread) * d, 1.6);
      }
    }
  }
  g.fillStyle(shade(c, -0.4));
  g.fillCircle(0, 0, 3);
  shine(g, -12, -14, 14, 8, 0.6);
}

function toyCar(g: G): void {
  const red = COLORS.red;
  solid(g, [
    { x: -34, y: 2 }, { x: -30, y: -10 }, { x: -14, y: -12 }, { x: -8, y: -26 }, { x: 14, y: -26 },
    { x: 22, y: -12 }, { x: 32, y: -10 }, { x: 34, y: 6 }, { x: -34, y: 6 },
  ], red);
  g.fillStyle(COLORS.window);
  g.fillRoundedRect(-5, -22, 8, 10, 2);
  g.fillRoundedRect(6, -22, 10, 10, 2);
  g.lineStyle(LINE.thin, INKLINE, 1);
  g.strokeRoundedRect(-5, -22, 8, 10, 2);
  g.strokeRoundedRect(6, -22, 10, 10, 2);
  g.fillStyle(COLORS.white, 0.4);
  g.fillRect(-28, -8, 50, 3);
  // a little rust, from all those years in the ground
  g.fillStyle(0xA0623B, 0.55);
  g.fillCircle(24, 0, 3);
  g.fillCircle(-22, -2, 2);
  for (const wx of [-20, 20]) {
    g.fillStyle(COLORS.rubber);
    g.fillCircle(wx, 8, 9);
    g.lineStyle(LINE.thin, INKLINE, 1);
    g.strokeCircle(wx, 8, 9);
    g.fillStyle(COLORS.steelLight);
    g.fillCircle(wx, 8, 3.5);
  }
}

function flintAxe(g: G): void {
  const c = 0x7D8796;
  const pts = [
    { x: -30, y: 18 }, { x: -24, y: 4 }, { x: -6, y: -18 }, { x: 14, y: -30 }, { x: 30, y: -24 },
    { x: 26, y: -8 }, { x: 10, y: 10 }, { x: -12, y: 26 }, { x: -24, y: 28 },
  ];
  solid(g, pts, c);
  // the facets where the flakes were struck off
  g.fillStyle(shade(c, 0.22));
  g.fillTriangle(-6, -18, 14, -30, 4, -6);
  g.fillTriangle(-24, 4, -6, -18, -10, 8);
  g.fillStyle(shade(c, -0.15));
  g.fillTriangle(4, -6, 26, -8, 10, 10);
  g.lineStyle(1.2, shade(c, -0.4), 0.8);
  g.lineBetween(4, -6, -10, 8);
  g.lineBetween(4, -6, 14, -30);
  g.lineBetween(-10, 8, -24, 28);
  // the sharp edge
  g.lineStyle(2, COLORS.white, 0.7);
  g.lineBetween(14, -29, 29, -23);
}

function mole(g: G): void {
  // a little heap of earth it is popping out of
  g.fillStyle(COLORS.dirtDeep);
  g.fillEllipse(0, 22, 76, 22);
  g.fillStyle(COLORS.dirt);
  g.fillEllipse(-2, 20, 70, 16);
  const fur = 0x4E4652;
  g.fillStyle(INKLINE);
  g.fillEllipse(0, 0, 54, 50);
  g.fillStyle(fur);
  g.fillEllipse(0, 0, 49, 45);
  g.fillStyle(shade(fur, 0.25));
  g.fillEllipse(-6, -8, 26, 18);
  // the big pink digging paws
  for (const side of [-1, 1]) {
    g.fillStyle(0xF2A7B5);
    g.fillEllipse(side * 24, 12, 18, 14);
    g.lineStyle(LINE.thin, INKLINE, 1);
    g.strokeEllipse(side * 24, 12, 18, 14);
    g.lineStyle(1.2, shade(0xF2A7B5, -0.3), 1);
    for (let k = -1; k <= 1; k++) g.lineBetween(side * 24 + k * 4, 8, side * 24 + k * 5, 18);
  }
  // eyes it hardly needs, screwed shut
  g.lineStyle(1.8, COLORS.white, 0.9);
  g.lineBetween(-10, -6, -5, -6);
  g.lineBetween(5, -6, 10, -6);
  g.fillStyle(0xF2A7B5);
  g.fillEllipse(0, 2, 12, 9);
  g.lineStyle(LINE.thin, INKLINE, 1);
  g.strokeEllipse(0, 2, 12, 9);
  g.fillStyle(COLORS.white, 0.6);
  g.fillCircle(-2, 0, 1.6);
}

function ammonite(g: G): void {
  const c = 0xD8B784;
  g.fillStyle(shade(c, -0.3));
  g.fillCircle(2, 3, 30);
  g.fillStyle(c);
  g.fillCircle(0, 0, 30);
  // the ribs, radiating across the coil
  g.lineStyle(1.4, shade(c, -0.3), 1);
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    g.lineBetween(Math.cos(a) * 18, Math.sin(a) * 18, Math.cos(a) * 29, Math.sin(a) * 29);
  }
  // the spiral
  const spiral = Array.from({ length: 70 }, (_, i) => {
    const t = i / 69;
    const a = t * Math.PI * 5.2;
    const r = 2 + t * 26;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  g.lineStyle(2.4, shade(c, -0.45), 1);
  g.strokePoints(spiral, false);
  g.lineStyle(LINE.base, INKLINE, 1);
  g.strokeCircle(0, 0, 30);
  shine(g, -12, -15, 14, 7, 0.55);
}

function coin(g: G): void {
  const c = COLORS.steelLight;
  g.fillStyle(shade(c, -0.35));
  g.fillCircle(2, 3, 29);
  g.fillStyle(c);
  g.fillCircle(0, 0, 29);
  g.lineStyle(LINE.base, INKLINE, 1);
  g.strokeCircle(0, 0, 29);
  g.lineStyle(1.5, shade(c, -0.3), 1);
  g.strokeCircle(0, 0, 23);
  // a Viking ship on it: a hull, a mast and a striped sail
  g.fillStyle(shade(c, -0.35));
  g.fillPoints([
    { x: -17, y: 6 }, { x: 17, y: 6 }, { x: 12, y: 13 }, { x: -12, y: 13 },
  ], true);
  g.fillTriangle(-17, 6, -21, -2, -14, 6);
  g.fillTriangle(17, 6, 21, -2, 14, 6);
  g.fillRect(-1, -17, 2, 23);
  g.fillRect(-10, -15, 20, 14);
  g.fillStyle(c);
  g.fillRect(-10, -11, 20, 3);
  g.fillRect(-10, -5, 20, 3);
  g.fillStyle(COLORS.white, 0.6);
  g.fillEllipse(-11, -14, 12, 6);
}

function sharkTooth(g: G): void {
  const c = 0x6E6878;
  // the root
  solid(g, [{ x: -26, y: 14 }, { x: 26, y: 14 }, { x: 22, y: 26 }, { x: 0, y: 20 }, { x: -22, y: 26 }], 0x9A7B5C);
  // the blade, with its saw edge
  const blade = [{ x: -24, y: 14 }];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    blade.push({ x: -24 + t * 24 + (i % 2) * 1.5, y: 14 - t * 44 });
  }
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    blade.push({ x: t * 24 - (i % 2) * 1.5, y: -30 + t * 44 });
  }
  solid(g, blade, c);
  g.fillStyle(COLORS.white, 0.4);
  g.fillTriangle(-6, -14, -14, 8, -4, 8);
}

function bottle(g: G): void {
  const glass = 0x7CC6A4;
  g.save();
  g.rotateCanvas(-0.35);
  // the note rolled up inside, seen through the glass
  g.fillStyle(glass, 1);
  g.fillRoundedRect(-30, -14, 44, 28, 10);
  g.fillRect(12, -6, 16, 12);
  g.fillStyle(COLORS.cream);
  g.fillRoundedRect(-22, -6, 30, 12, 4);
  g.lineStyle(1.2, COLORS.woodDeep, 0.8);
  g.lineBetween(-18, -2, 2, -2);
  g.lineBetween(-18, 2, -2, 2);
  g.fillStyle(glass, 0.45);
  g.fillRoundedRect(-30, -14, 44, 28, 10);
  g.lineStyle(LINE.base, INKLINE, 1);
  g.strokeRoundedRect(-30, -14, 44, 28, 10);
  g.fillStyle(glass);
  g.fillRect(12, -6, 16, 12);
  g.strokeRect(12, -6, 16, 12);
  // the cork
  g.fillStyle(COLORS.wood);
  g.fillRoundedRect(27, -7, 9, 14, 3);
  g.strokeRoundedRect(27, -7, 9, 14, 3);
  g.fillStyle(COLORS.white, 0.6);
  g.fillRoundedRect(-24, -10, 30, 4, 2);
  g.restore();
}

function runeStone(g: G): void {
  const c = 0xA8A49E;
  solid(g, [
    { x: -22, y: 30 }, { x: -26, y: 0 }, { x: -20, y: -24 }, { x: -4, y: -34 }, { x: 14, y: -30 },
    { x: 24, y: -10 }, { x: 24, y: 30 },
  ], c);
  g.fillStyle(shade(c, 0.2));
  g.fillTriangle(-20, -24, -4, -34, -10, -10);
  // runes, painted red as they were: ᚱ ᚢ ᚾ
  g.lineStyle(3, COLORS.red, 1);
  // ᚱ
  g.lineBetween(-12, -14, -12, 12);
  g.lineBetween(-12, -14, -4, -8);
  g.lineBetween(-4, -8, -12, -2);
  g.lineBetween(-12, -2, -3, 12);
  // ᚢ
  g.lineBetween(3, -14, 3, 12);
  g.lineBetween(3, -14, 12, -6);
  g.lineBetween(12, -6, 12, 12);
  // ᚾ, lower down
  g.lineBetween(-4, 16, -4, 26);
  g.lineBetween(-8, 22, 0, 18);
}

function tusk(g: G): void {
  const ivory = 0xF1E4C6;
  const outer: { x: number; y: number }[] = [];
  const inner: { x: number; y: number }[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const a = Math.PI * (0.95 + t * 0.85);
    const w = 9 * (1 - t) + 1;
    outer.push({ x: 6 + Math.cos(a) * (30 + w), y: 14 + Math.sin(a) * (30 + w) });
    inner.push({ x: 6 + Math.cos(a) * (30 - w), y: 14 + Math.sin(a) * (30 - w) });
  }
  solid(g, [...outer, ...inner.reverse()], ivory);
  g.lineStyle(1.3, shade(ivory, -0.25), 1);
  for (let i = 3; i < 18; i += 4) {
    const t = i / 20;
    const a = Math.PI * (0.95 + t * 0.85);
    const w = 9 * (1 - t) + 1;
    g.lineBetween(6 + Math.cos(a) * (30 - w), 14 + Math.sin(a) * (30 - w), 6 + Math.cos(a) * (30 + w), 14 + Math.sin(a) * (30 + w));
  }
  // the broken end, where it sat in the mammoth's jaw
  g.fillStyle(shade(ivory, -0.35));
  g.fillEllipse(-33, 18, 7, 20);
  g.lineStyle(LINE.thin, INKLINE, 1);
  g.strokeEllipse(-33, 18, 7, 20);
}

function crystal(g: G): void {
  const prism = (x: number, y: number, w: number, h: number, tilt: number, color: number) => {
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(tilt);
    const pts = [
      { x: -w / 2, y: 0 }, { x: -w / 2, y: -h }, { x: 0, y: -h - w * 0.8 }, { x: w / 2, y: -h }, { x: w / 2, y: 0 },
    ];
    solid(g, pts, color);
    g.fillStyle(COLORS.white, 0.45);
    g.fillPoints([{ x: -w / 2, y: -h }, { x: 0, y: -h - w * 0.8 }, { x: 0, y: 0 }, { x: -w / 2, y: 0 }], true);
    g.lineStyle(1.2, shade(color, -0.35), 0.8);
    g.lineBetween(0, -h - w * 0.8, 0, 0);
    g.restore();
  };
  // the rock they grow out of
  blob(g, 0, 22, 34, 12, COLORS.stoneDeep, 0.15, 3);
  prism(-14, 20, 14, 26, -0.45, 0xC9B8F0);
  prism(14, 20, 14, 22, 0.45, 0xB8D8F4);
  prism(0, 20, 18, 36, 0, 0xDCD0FA);
}

function bone(g: G): void {
  const c = 0xEFE2C2;
  g.save();
  g.rotateCanvas(-0.4);
  const knob = (x: number, y: number, r: number, color: number) => {
    g.fillStyle(color);
    g.fillCircle(x, y, r);
  };
  // outline, shade, fill: knobs and shaft drawn three times over
  for (const [dx, dy, grow, color] of [[0, 0, 2.5, INKLINE], [2, 3, 0, shade(c, -0.3)], [0, 0, 0, c]] as const) {
    knob(-28 + dx, -7 + dy, 9 + grow, color);
    knob(-28 + dx, 7 + dy, 9 + grow, color);
    knob(28 + dx, -7 + dy, 9 + grow, color);
    knob(28 + dx, 7 + dy, 9 + grow, color);
    g.fillStyle(color);
    g.fillRect(-28 + dx, -7 - grow + dy, 56, 14 + grow * 2);
  }
  g.fillStyle(COLORS.white, 0.5);
  g.fillRoundedRect(-20, -5, 36, 4, 2);
  g.fillCircle(-30, -10, 3);
  g.restore();
}

function goldenHorn(g: G): void {
  const gold = 0xF2C230;
  const top: { x: number; y: number }[] = [];
  const bottom: { x: number; y: number }[] = [];
  const ring: { a: number; cx: number; cy: number; w: number }[] = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22;
    // a curve from the wide mouth on the right to the narrow tip curling up on the left
    const cx = 30 - t * 60;
    const cy = -6 + Math.sin(t * Math.PI * 0.9) * 16 - t * t * 14;
    const w = 15 * (1 - t) + 2.5;
    const dx = -60;
    const dy = Math.cos(t * Math.PI * 0.9) * 16 * Math.PI * 0.9 - 28 * t;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    top.push({ x: cx + nx * w, y: cy + ny * w });
    bottom.push({ x: cx - nx * w, y: cy - ny * w });
    if (i % 3 === 1) ring.push({ a: Math.atan2(ny, nx), cx, cy, w });
  }
  solid(g, [...top, ...bottom.reverse()], gold);
  // the rings of figures that run round it
  g.lineStyle(1.6, shade(gold, -0.35), 1);
  for (const r of ring) {
    g.lineBetween(r.cx + Math.cos(r.a) * r.w, r.cy + Math.sin(r.a) * r.w, r.cx - Math.cos(r.a) * r.w, r.cy - Math.sin(r.a) * r.w);
  }
  g.fillStyle(shade(gold, -0.35));
  for (let k = 0; k < ring.length - 1; k++) {
    const a = ring[k];
    const b = ring[k + 1];
    g.fillCircle((a.cx + b.cx) / 2, (a.cy + b.cy) / 2, Math.max(1.5, a.w * 0.22));
  }
  // the open mouth
  g.fillStyle(shade(gold, -0.45));
  g.fillEllipse(31, -6, 9, 30);
  g.lineStyle(LINE.base, INKLINE, 1);
  g.strokeEllipse(31, -6, 9, 30);
  g.fillStyle(COLORS.white, 0.6);
  g.fillEllipse(8, -12, 26, 5);
}

const ART: Record<string, (g: G) => void> = {
  orm: worm,
  rav: amber,
  hestesko: horseshoe,
  kartoffel: potato,
  soepindsvin: seaUrchin,
  legetoej: toyCar,
  floekse: flintAxe,
  muldvarp: mole,
  ammonit: ammonite,
  moent: coin,
  hajtand: sharkTooth,
  flaskepost: bottle,
  runesten: runeStone,
  mammut: tusk,
  krystal: crystal,
  dino: bone,
  guldhorn: goldenHorn,
};

/** Draws a find centred on the origin of `g`. Scale the Graphics to size it. */
export function drawTreasure(g: G, id: string): void {
  ART[id]?.(g);
}

/**
 * A ring of soft rays behind a find, turned slowly by whoever owns it: the "look what you
 * found" glow.
 */
export function drawRays(g: G, radius: number, color = COLORS.sun): void {
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const spread = 0.13;
    g.fillStyle(color, i % 2 ? 0.35 : 0.55);
    g.fillTriangle(
      Math.cos(a - spread) * radius * 0.3, Math.sin(a - spread) * radius * 0.3,
      Math.cos(a + spread) * radius * 0.3, Math.sin(a + spread) * radius * 0.3,
      Math.cos(a) * radius, Math.sin(a) * radius,
    );
  }
  g.fillStyle(COLORS.white, 0.5);
  g.fillCircle(0, 0, radius * 0.42);
}

/** A treasure chest, for the town's button into the collection. Origin at its middle. */
export function drawChest(g: G, s = 1, open = false): void {
  const w = 34 * s;
  const h = 20 * s;
  // body
  g.fillStyle(shade(COLORS.woodDeep, -0.2));
  g.fillRoundedRect(-w / 2 + 1.5, -h / 2 + 2 * s + 2, w, h, 3 * s);
  g.fillStyle(COLORS.woodDeep);
  g.fillRoundedRect(-w / 2, -h / 2 + 2 * s, w, h, 3 * s);
  g.lineStyle(LINE.thin, INKLINE, 1);
  g.strokeRoundedRect(-w / 2, -h / 2 + 2 * s, w, h, 3 * s);
  if (open) {
    // gold heaped up inside
    g.fillStyle(COLORS.sun);
    g.fillEllipse(0, -h / 2 + 2 * s, w * 0.86, 10 * s);
    g.fillStyle(COLORS.white, 0.7);
    g.fillCircle(-5 * s, -h / 2, 1.8 * s);
    g.fillCircle(6 * s, -h / 2 + 1 * s, 1.4 * s);
  }
  // lid
  g.fillStyle(COLORS.wood);
  const lidY = open ? -h / 2 - 12 * s : -h / 2 - 7 * s;
  g.fillRoundedRect(-w / 2 - 1, lidY, w + 2, 11 * s, { tl: 8 * s, tr: 8 * s, bl: 2, br: 2 });
  g.lineStyle(LINE.thin, INKLINE, 1);
  g.strokeRoundedRect(-w / 2 - 1, lidY, w + 2, 11 * s, { tl: 8 * s, tr: 8 * s, bl: 2, br: 2 });
  // gold bands and the lock
  g.fillStyle(COLORS.sunDeep);
  g.fillRect(-w / 2 + 5 * s, lidY, 4 * s, h + 13 * s);
  g.fillRect(w / 2 - 9 * s, lidY, 4 * s, h + 13 * s);
  g.fillRoundedRect(-4 * s, -h / 2 + 1 * s, 8 * s, 9 * s, 2 * s);
  g.lineStyle(1.2, INKLINE, 1);
  g.strokeRoundedRect(-4 * s, -h / 2 + 1 * s, 8 * s, 9 * s, 2 * s);
}
