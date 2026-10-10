import Phaser from 'phaser';
import { COLORS, LINE } from '../config';
import type { MachineId } from '../state/Machines';
import { gameState } from '../state/GameState';
import { Livery, liveryById } from '../state/Shop';

/**
 * How the four machines are drawn.
 *
 * Every machine is drawn in its own coordinates: the origin is on the ground under its
 * middle, x grows towards the front, and y is negative upwards. Scenes place and scale the
 * whole thing, so the workshop, the building site and the town all share one drawing.
 *
 * Each part is drawn on its own, because the workshop needs them apart — lying on the floor,
 * dragged by a child, and as a pale silhouette showing where they go. The moving parts
 * (the excavator's arm, the truck's bed, the mixer's drum and chute, the crane's boom) take
 * a pose, so the building site can drive them with the same drawing.
 *
 * The look follows the reference picture: construction yellow, warm black trim and rubber,
 * a blue windscreen with a smiling face in it, everything outlined. The yellow is the
 * machines' livery, and a child can buy them a different one in the star shop.
 */

export interface Pt { x: number; y: number }

/** A part drawn for real, or as the silhouette that shows where it goes. */
export interface Style { ghost: boolean }

const REAL: Style = { ghost: false };
const GHOST_FILL = 0.22;
const GHOST_LINE = 0.45;

/** A livery being shown off rather than worn — the shop's preview of a coat of paint. */
let trying: string | null = null;

/** The machines' paint right now. Read at draw time, so a new coat shows on the next frame. */
function paint(): Livery {
  return liveryById(trying ?? gameState.livery);
}

/** Draws with another coat of paint for the length of `draw`, for the shop's previews. */
export function inLivery(id: string, draw: () => void): void {
  const before = trying;
  trying = id;
  try {
    draw();
  } finally {
    trying = before;
  }
}

function fill(g: Phaser.GameObjects.Graphics, s: Style, color: number, alpha = 1): void {
  if (s.ghost) g.fillStyle(COLORS.outline, GHOST_FILL);
  else g.fillStyle(color, alpha);
}

function line(g: Phaser.GameObjects.Graphics, s: Style, width: number = LINE.base): void {
  g.lineStyle(s.ghost ? LINE.thin : width, COLORS.outline, s.ghost ? GHOST_LINE : 1);
}

/** Outlined rounded rectangle — the machine kit's basic plate. */
function box(
  g: Phaser.GameObjects.Graphics, s: Style,
  x: number, y: number, w: number, h: number, r: number, color: number
): void {
  fill(g, s, color);
  g.fillRoundedRect(x, y, w, h, r);
  line(g, s);
  g.strokeRoundedRect(x, y, w, h, r);
  if (!s.ghost && color === paint().body) glint(g, x, y, w, h);
}

/** The gold livery's shine: a bright diagonal streak across a painted panel. */
function glint(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  if (!paint().shiny || w < 18 || h < 12) return;
  const t = Math.min(w, h) * 0.22;
  const sx = x + w * 0.62;
  g.fillStyle(COLORS.white, 0.55);
  g.fillPoints([
    { x: sx, y: y + 3 }, { x: sx + t, y: y + 3 },
    { x: sx + t - h * 0.5, y: y + h - 3 }, { x: sx - h * 0.5, y: y + h - 3 },
  ], true);
}

function poly(g: Phaser.GameObjects.Graphics, s: Style, pts: Pt[], color: number): void {
  fill(g, s, color);
  g.fillPoints(pts, true);
  line(g, s);
  g.strokePoints(pts, true, true);
}

function disc(g: Phaser.GameObjects.Graphics, s: Style, x: number, y: number, r: number, color: number): void {
  fill(g, s, color);
  g.fillCircle(x, y, r);
  line(g, s);
  g.strokeCircle(x, y, r);
}

/** The four corners of a bar of half-width `r` between two points. */
function barPoints(a: Pt, b: Pt, r: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * r;
  const ny = ((b.x - a.x) / len) * r;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/**
 * A rounded bar between two points — booms, arms, chutes.
 *
 * Outlined by underlay rather than by stroking: a fat dark capsule first, then the coloured
 * one inside it. Stroking a polygon plus two end circles leaves the circles' strokes
 * cutting across the bar.
 */
function capsule(g: Phaser.GameObjects.Graphics, s: Style, a: Pt, b: Pt, r: number, color: number): void {
  if (s.ghost) {
    g.fillStyle(COLORS.outline, GHOST_FILL);
    g.fillPoints(barPoints(a, b, r), true);
    g.fillCircle(a.x, a.y, r);
    g.fillCircle(b.x, b.y, r);
    return;
  }
  const o = LINE.base;
  g.fillStyle(COLORS.outline);
  g.fillPoints(barPoints(a, b, r + o), true);
  g.fillCircle(a.x, a.y, r + o);
  g.fillCircle(b.x, b.y, r + o);
  g.fillStyle(color);
  g.fillPoints(barPoints(a, b, r), true);
  g.fillCircle(a.x, a.y, r);
  g.fillCircle(b.x, b.y, r);
  // a lighter stripe along the top edge gives the bar a round surface
  g.fillStyle(COLORS.white, 0.28);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = (-(b.y - a.y) / len) * r * 0.45;
  const ny = ((b.x - a.x) / len) * r * 0.45;
  const top = ny < 0 ? 1 : -1;
  g.fillPoints(barPoints(
    { x: a.x + nx * top, y: a.y + ny * top },
    { x: b.x + nx * top, y: b.y + ny * top },
    r * 0.22
  ), true);
}

function pin(g: Phaser.GameObjects.Graphics, s: Style, p: Pt, r = 6): void {
  if (s.ghost) return;
  disc(g, s, p.x, p.y, r, COLORS.steelLight);
  g.fillStyle(COLORS.steelDeep);
  g.fillCircle(p.x, p.y, r * 0.35);
}

/** A wheel: tyre, rim, hub. */
function wheel(g: Phaser.GameObjects.Graphics, s: Style, x: number, y: number, r: number): void {
  disc(g, s, x, y, r, COLORS.rubber);
  if (s.ghost) return;
  g.fillStyle(COLORS.rubberLight);
  g.fillCircle(x, y, r * 0.78);
  disc(g, s, x, y, r * 0.52, COLORS.steelLight);
  g.fillStyle(COLORS.white, 0.35);
  g.fillCircle(x - r * 0.15, y - r * 0.18, r * 0.2);
  g.fillStyle(COLORS.steelDeep);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillCircle(x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.32, r * 0.06 + 0.8);
  }
}

/**
 * The windscreen with a face in it — the thing that makes a machine a character.
 * Eyes as short upright ovals and a small smile, like the reference picture.
 */
export function face(g: Phaser.GameObjects.Graphics, cx: number, cy: number, size: number, happy = true): void {
  g.fillStyle(COLORS.outline);
  g.fillEllipse(cx - size * 0.32, cy - size * 0.1, size * 0.13, size * 0.22);
  g.fillEllipse(cx + size * 0.32, cy - size * 0.1, size * 0.13, size * 0.22);
  g.fillStyle(COLORS.white, 0.9);
  g.fillCircle(cx - size * 0.3, cy - size * 0.15, size * 0.035 + 0.6);
  g.fillCircle(cx + size * 0.34, cy - size * 0.15, size * 0.035 + 0.6);
  g.lineStyle(Math.max(2, size * 0.07), COLORS.outline, 1);
  g.beginPath();
  if (happy) g.arc(cx, cy + size * 0.06, size * 0.2, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
  else g.arc(cx, cy + size * 0.3, size * 0.16, Phaser.Math.DegToRad(205), Phaser.Math.DegToRad(335), false);
  g.strokePath();
  // cheeks
  g.fillStyle(COLORS.pink, 0.45);
  g.fillCircle(cx - size * 0.42, cy + size * 0.12, size * 0.08);
  g.fillCircle(cx + size * 0.42, cy + size * 0.12, size * 0.08);
}

/** A cab: black frame, blue glass with a face, a yellow lower half. */
function cab(
  g: Phaser.GameObjects.Graphics, s: Style,
  x: number, y: number, w: number, h: number,
  lower = 0.42
): void {
  box(g, s, x, y, w, h, 12, COLORS.rubber);
  if (s.ghost) return;
  // the lower body panel
  const ly = y + h * (1 - lower);
  box(g, s, x, ly, w, h * lower, 8, paint().body);
  g.fillStyle(COLORS.white, 0.25);
  g.fillRoundedRect(x + 4, ly + 3, w - 8, h * lower * 0.3, 5);
  // windscreen
  const gx = x + 8;
  const gy = y + 8;
  const gw = w * 0.62;
  const gh = h * (1 - lower) - 14;
  box(g, s, gx, gy, gw, gh, 8, COLORS.glass);
  g.fillStyle(COLORS.glassLight, 0.6);
  g.fillTriangle(gx + 4, gy + 4, gx + gw * 0.45, gy + 4, gx + 4, gy + gh * 0.45);
  face(g, gx + gw / 2, gy + gh / 2 + 2, Math.min(gw, gh) * 0.82);
  // side window
  box(g, s, gx + gw + 6, gy, w - gw - 22, gh, 6, COLORS.glass);
}

/* =========================================================== the excavator ======== */

export interface ArmPose {
  /** Where the boom is pinned to the body. */
  root: Pt;
  /** Boom-to-arm joint. */
  elbow: Pt;
  /** Arm-to-bucket joint. */
  wrist: Pt;
  /** Bucket angle in radians; 0 points it straight down. Positive curls it in. */
  bucket: number;
  /** 0 empty, 1 full of earth. */
  load: number;
}

export const GRAVKO_REST: ArmPose = {
  root: { x: 70, y: -92 },
  elbow: { x: 190, y: -222 },
  wrist: { x: 262, y: -122 },
  bucket: 0.2,
  load: 0,
};

export const GRAVKO_BOOM = Math.hypot(GRAVKO_REST.elbow.x - GRAVKO_REST.root.x, GRAVKO_REST.elbow.y - GRAVKO_REST.root.y);
export const GRAVKO_STICK = Math.hypot(GRAVKO_REST.wrist.x - GRAVKO_REST.elbow.x, GRAVKO_REST.wrist.y - GRAVKO_REST.elbow.y);

function gravkoTracks(g: Phaser.GameObjects.Graphics, s: Style): void {
  box(g, s, -112, -50, 224, 50, 25, COLORS.rubber);
  if (s.ghost) return;
  // tread
  g.fillStyle(COLORS.rubberLight);
  for (let x = -96; x <= 96; x += 16) g.fillRect(x, -4, 8, 3);
  box(g, s, -82, -38, 164, 26, 13, COLORS.rubberLight);
  box(g, s, -50, -31, 100, 12, 6, COLORS.steelDeep);
  wheel(g, s, -82, -25, 18);
  wheel(g, s, 82, -25, 18);
}

function gravkoBody(g: Phaser.GameObjects.Graphics, s: Style): void {
  // the slewing ring between tracks and body
  box(g, s, -60, -62, 120, 16, 6, COLORS.rubber);
  // body with the counterweight curving down at the back
  fill(g, s, paint().body);
  const body = [
    { x: -108, y: -128 }, { x: 62, y: -128 }, { x: 62, y: -60 },
    { x: -92, y: -60 }, { x: -108, y: -76 },
  ];
  g.fillPoints(body, true);
  line(g, s, LINE.thick);
  g.strokePoints(body, true, true);
  if (s.ghost) return;
  // black stripe along the bottom, like the reference
  g.fillStyle(COLORS.rubber);
  g.fillRect(-100, -84, 162, 14);
  g.lineStyle(LINE.thin, COLORS.outline);
  g.strokeRect(-100, -84, 162, 14);
  // sheen
  g.fillStyle(COLORS.white, 0.3);
  g.fillRoundedRect(-100, -124, 150, 12, 6);
  // engine hood on top
  box(g, s, -104, -146, 82, 20, 8, COLORS.rubber);
  g.fillStyle(COLORS.rubberLight);
  for (let x = -94; x < -32; x += 12) g.fillRect(x, -140, 6, 9);
  // a sweep of deeper yellow on the side panel
  g.fillStyle(paint().deep, 0.7);
  g.fillTriangle(-30, -84, 20, -84, 20, -112);
}

function gravkoCab(g: Phaser.GameObjects.Graphics, s: Style): void {
  cab(g, s, -8, -200, 86, 140);
}

function gravkoBucket(
  g: Phaser.GameObjects.Graphics, s: Style,
  wrist: Pt, angle: number, load: number
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // bucket outline in its own frame: x across the mouth, y down from the wrist
  const local = [
    { x: -12, y: -6 }, { x: 20, y: 2 }, { x: 26, y: 40 },
    { x: 8, y: 56 }, { x: -20, y: 44 }, { x: -22, y: 12 },
  ];
  const to = (p: Pt) => ({ x: wrist.x + p.x * cos - p.y * sin, y: wrist.y + p.x * sin + p.y * cos });
  poly(g, s, local.map(to), COLORS.rubber);
  if (s.ghost) return;
  // teeth along the mouth
  g.fillStyle(COLORS.steelLight);
  for (let i = 0; i < 3; i++) {
    const a = to({ x: -16 + i * 7, y: 50 - i * 4 });
    const b = to({ x: -22 + i * 7, y: 58 - i * 4 });
    const c = to({ x: -12 + i * 7, y: 52 - i * 4 });
    g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
  }
  if (load > 0) {
    // a heap of earth in the mouth, growing with the load
    const heap = to({ x: 4, y: 20 });
    g.fillStyle(COLORS.dirtDeep);
    g.fillCircle(heap.x, heap.y, 14 * load + 4);
    g.fillStyle(COLORS.dirt);
    g.fillCircle(heap.x - 3, heap.y - 3, 11 * load + 3);
    g.fillStyle(COLORS.dirtLight);
    g.fillCircle(heap.x - 6, heap.y - 6, 4 * load + 1);
  }
  pin(g, s, wrist, 5);
}

/** The whole arm — boom, stick and bucket — in any pose. */
export function drawGravkoArm(g: Phaser.GameObjects.Graphics, pose: ArmPose, s: Style = REAL, only?: 'bom' | 'arm' | 'skovl'): void {
  if (!only || only === 'bom') {
    capsule(g, s, pose.root, pose.elbow, 15, paint().body);
    if (!s.ghost) {
      // the hydraulic ram under the boom
      const mid = { x: (pose.root.x + pose.elbow.x) / 2, y: (pose.root.y + pose.elbow.y) / 2 };
      const base = { x: pose.root.x - 10, y: pose.root.y + 18 };
      capsule(g, s, base, mid, 5, COLORS.steelLight);
      pin(g, s, pose.root, 7);
    }
  }
  if (!only || only === 'arm') {
    capsule(g, s, pose.elbow, pose.wrist, 11, paint().body);
    if (!s.ghost) {
      // black inner panel like the reference picture's arm
      const a = Phaser.Math.Linear(pose.elbow.x, pose.wrist.x, 0.2);
      const b = Phaser.Math.Linear(pose.elbow.y, pose.wrist.y, 0.2);
      const c = Phaser.Math.Linear(pose.elbow.x, pose.wrist.x, 0.75);
      const d = Phaser.Math.Linear(pose.elbow.y, pose.wrist.y, 0.75);
      g.fillStyle(COLORS.rubber);
      g.fillPoints(barPoints({ x: a, y: b }, { x: c, y: d }, 4), true);
      pin(g, s, pose.elbow, 7);
    }
  }
  if (!only || only === 'skovl') {
    gravkoBucket(g, s, pose.wrist, pose.bucket, pose.load);
  }
}

/* ============================================================== the trucks ======== */

/** The dump truck's bed, hinged at its back corner. `angle` in radians tips it up. */
export const BED_HINGE: Pt = { x: -136, y: -64 };

export function drawTruckBed(g: Phaser.GameObjects.Graphics, angle: number, load: number, s: Style = REAL): void {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const to = (p: Pt) => {
    const dx = p.x - BED_HINGE.x;
    const dy = p.y - BED_HINGE.y;
    return { x: BED_HINGE.x + dx * cos - dy * sin, y: BED_HINGE.y + dx * sin + dy * cos };
  };
  const shape = [
    { x: -146, y: -136 }, { x: 46, y: -136 }, { x: 40, y: -64 }, { x: -136, y: -64 },
  ];
  if (load > 0 && !s.ghost) {
    // gravel heaped above the rim
    const top = -136 - 22 * load;
    g.fillStyle(COLORS.gravelDeep);
    const heap = [
      to({ x: -138, y: -134 }), to({ x: -110, y: top + 6 }), to({ x: -50, y: top }),
      to({ x: 10, y: top + 6 }), to({ x: 40, y: -134 }),
    ];
    g.fillPoints(heap, true);
    g.fillStyle(COLORS.gravel);
    for (let i = 0; i < 9; i++) {
      const p = to({ x: -120 + i * 18, y: top + 10 + (i % 3) * 4 });
      g.fillCircle(p.x, p.y, 6);
    }
  }
  poly(g, s, shape.map(to), paint().body);
  if (s.ghost) return;
  g.lineStyle(LINE.thin, paint().deep);
  for (let x = -110; x <= 20; x += 32) {
    const a = to({ x, y: -130 });
    const b = to({ x: x + 2, y: -70 });
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  const lip = [to({ x: -150, y: -142 }), to({ x: 50, y: -142 }), to({ x: 48, y: -132 }), to({ x: -148, y: -132 })];
  poly(g, s, lip, paint().deep);
}

function truckWheels(g: Phaser.GameObjects.Graphics, s: Style, xs: number[], r = 26): void {
  for (const x of xs) wheel(g, s, x, -r, r);
}

function truckFrame(g: Phaser.GameObjects.Graphics, s: Style, tank = true): void {
  box(g, s, -142, -64, 272, 22, 7, COLORS.rubber);
  if (s.ghost) return;
  // bumper and lamp
  box(g, s, 124, -60, 14, 16, 4, COLORS.steelLight);
  disc(g, s, -142, -54, 5, COLORS.red);
  if (tank) {
    // the diesel tank hangs under the frame, so the filler cap has somewhere to be
    box(g, s, 6, -50, 46, 22, 8, COLORS.steel);
    g.fillStyle(COLORS.white, 0.3);
    g.fillRoundedRect(10, -47, 38, 6, 3);
  }
}

function truckCab(g: Phaser.GameObjects.Graphics, s: Style): void {
  cab(g, s, 56, -156, 78, 94, 0.45);
  if (s.ghost) return;
  // grille and headlight on the nose
  box(g, s, 126, -100, 10, 30, 3, COLORS.rubberLight);
  disc(g, s, 132, -110, 5, COLORS.sun);
  // amber beacon on the roof
  box(g, s, 82, -166, 20, 12, 5, COLORS.orange);
}

/* ------------------------------------------------------------- the mixer ---- */

export const DRUM_CENTER: Pt = { x: -48, y: -112 };
/** Where the chute hangs off the back of the drum. */
export const CHUTE_ROOT: Pt = { x: -136, y: -84 };
export const CHUTE_REST: Pt = { x: -182, y: -46 };

export function drawDrum(g: Phaser.GameObjects.Graphics, phase: number, s: Style = REAL): void {
  const { x, y } = DRUM_CENTER;
  // cradle
  box(g, s, x - 70, y + 34, 150, 14, 5, COLORS.rubber);
  // the drum — a fat barrel, tipped up towards the back
  fill(g, s, COLORS.steelLight);
  g.fillEllipse(x, y, 176, 92);
  line(g, s, LINE.thick);
  g.strokeEllipse(x, y, 176, 92);
  if (s.ghost) return;
  // the spiral stripes, slid along by `phase` so the drum visibly turns
  g.fillStyle(paint().body);
  for (let i = -2; i < 4; i++) {
    const sx = x - 80 + (((i * 40 + phase * 40) % 200) + 200) % 200;
    if (sx < x - 82 || sx > x + 70) continue;
    const half = Math.sqrt(Math.max(0, 1 - ((sx - x) / 88) ** 2)) * 44;
    g.fillPoints([
      { x: sx, y: y - half + 2 }, { x: sx + 16, y: y - half + 2 },
      { x: sx + 4, y: y + half - 2 }, { x: sx - 12, y: y + half - 2 },
    ], true);
  }
  g.lineStyle(LINE.thick, COLORS.outline);
  g.strokeEllipse(x, y, 176, 92);
  g.fillStyle(COLORS.white, 0.4);
  g.fillEllipse(x - 10, y - 26, 110, 16);
  // the open end, where the concrete comes out
  box(g, s, x - 98, y - 28, 22, 50, 9, COLORS.steelDeep);
}

export function drawChute(g: Phaser.GameObjects.Graphics, tip: Pt, s: Style = REAL, wet = false): void {
  capsule(g, s, CHUTE_ROOT, tip, 8, paint().deep);
  if (s.ghost) return;
  if (wet) {
    g.fillStyle(COLORS.concreteWet);
    g.fillPoints(barPoints(CHUTE_ROOT, tip, 3.5), true);
  }
  pin(g, s, CHUTE_ROOT, 6);
}

/* -------------------------------------------------------------- the crane ---- */

export const BOOM_ROOT: Pt = { x: -64, y: -96 };
export const BOOM_TIP_REST: Pt = { x: 150, y: -250 };
export const HOOK_DROP = 60;

export function drawCraneBoom(g: Phaser.GameObjects.Graphics, tip: Pt, s: Style = REAL): void {
  // telescopic: an outer section to 55%, then a narrower inner one to the tip
  const mid = {
    x: Phaser.Math.Linear(BOOM_ROOT.x, tip.x, 0.55),
    y: Phaser.Math.Linear(BOOM_ROOT.y, tip.y, 0.55),
  };
  capsule(g, s, mid, tip, 9, paint().light);
  capsule(g, s, BOOM_ROOT, mid, 14, paint().body);
  if (s.ghost) return;
  // warning stripes at the base
  pin(g, s, BOOM_ROOT, 8);
  pin(g, s, tip, 6);
}

/** The hook block on its rope. `from` is the boom tip. */
export function drawHook(g: Phaser.GameObjects.Graphics, from: Pt, to: Pt, s: Style = REAL): void {
  if (!s.ghost) {
    g.lineStyle(2.5, COLORS.outline);
    g.lineBetween(from.x - 3, from.y, to.x - 3, to.y - 14);
    g.lineBetween(from.x + 3, from.y, to.x + 3, to.y - 14);
  }
  box(g, s, to.x - 11, to.y - 22, 22, 18, 5, paint().body);
  if (s.ghost) return;
  g.lineStyle(4.5, COLORS.outline);
  g.beginPath();
  g.arc(to.x, to.y + 6, 8, Phaser.Math.DegToRad(-80), Phaser.Math.DegToRad(200), false);
  g.strokePath();
  g.lineStyle(2.5, COLORS.steelLight);
  g.beginPath();
  g.arc(to.x, to.y + 6, 8, Phaser.Math.DegToRad(-80), Phaser.Math.DegToRad(200), false);
  g.strokePath();
}

function craneTurntable(g: Phaser.GameObjects.Graphics, s: Style): void {
  box(g, s, -112, -88, 146, 26, 9, paint().body);
  if (s.ghost) return;
  // black and yellow hazard stripes on the counterweight
  g.fillStyle(COLORS.rubber);
  for (let x = -104; x < -60; x += 14) {
    g.fillPoints([{ x, y: -84 }, { x: x + 7, y: -84 }, { x: x + 1, y: -66 }, { x: x - 6, y: -66 }], true);
  }
  // operator's little cab beside the boom
  box(g, s, -20, -122, 48, 36, 8, COLORS.rubber);
  box(g, s, -14, -116, 30, 22, 5, COLORS.glass);
  face(g, 1, -105, 20);
}

/* ---------------------------------------------------------- the road roller ---- */

/** The roller's front drum: the whole point of the machine. */
export const ROLLER_DRUM: Pt = { x: 92, y: -50 };
export const ROLLER_DRUM_R = 50;
export const ROLLER_WHEEL: Pt = { x: -92, y: -40 };

/** Five bolts round a hub, turned by `phase` so a rolling drum visibly rolls. */
function hubBolts(g: Phaser.GameObjects.Graphics, c: Pt, r: number, phase: number): void {
  g.fillStyle(COLORS.steelDeep);
  for (let i = 0; i < 5; i++) {
    const a = phase + (i / 5) * Math.PI * 2;
    g.fillCircle(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, Math.max(2, r * 0.18));
  }
}

function rollerDrum(g: Phaser.GameObjects.Graphics, s: Style, phase = 0): void {
  const { x, y } = ROLLER_DRUM;
  disc(g, s, x, y, ROLLER_DRUM_R, COLORS.steel);
  if (s.ghost) return;
  g.fillStyle(COLORS.steelLight);
  g.fillCircle(x, y, ROLLER_DRUM_R * 0.82);
  disc(g, s, x, y, ROLLER_DRUM_R * 0.58, paint().body);
  disc(g, s, x, y, ROLLER_DRUM_R * 0.22, COLORS.rubber);
  hubBolts(g, { x, y }, ROLLER_DRUM_R * 0.4, phase);
  g.fillStyle(COLORS.white, 0.35);
  g.fillEllipse(x - 18, y - 28, 26, 9);
}

function rollerWheel(g: Phaser.GameObjects.Graphics, s: Style, phase = 0): void {
  wheel(g, s, ROLLER_WHEEL.x, ROLLER_WHEEL.y, 40);
  if (!s.ghost) hubBolts(g, ROLLER_WHEEL, 13, phase);
}

function rollerFrame(g: Phaser.GameObjects.Graphics, s: Style): void {
  // the chassis between the wheels
  box(g, s, -140, -96, 176, 46, 10, paint().body);
  if (!s.ghost) {
    g.fillStyle(COLORS.rubber);
    g.fillRect(-132, -66, 160, 10);
    // the joint the machine bends at to steer
    box(g, s, 26, -92, 30, 34, 6, COLORS.rubberLight);
  }
  // the hood over the drum
  box(g, s, 30, -124, 126, 22, 10, paint().body);
  if (!s.ghost) {
    g.fillStyle(COLORS.rubber);
    for (let x = 40; x < 150; x += 22) {
      g.fillPoints([{ x, y: -121 }, { x: x + 10, y: -121 }, { x: x + 4, y: -105 }, { x: x - 6, y: -105 }], true);
    }
    g.lineStyle(LINE.base, COLORS.outline);
    g.strokeRoundedRect(30, -124, 126, 22, 10);
  }
}

function rollerMotor(g: Phaser.GameObjects.Graphics, s: Style): void {
  box(g, s, -148, -138, 84, 46, 10, paint().body);
  if (s.ghost) return;
  // grille slats and an exhaust pipe with a cap
  g.fillStyle(COLORS.rubber);
  for (let x = -138; x < -80; x += 12) g.fillRect(x, -126, 6, 22);
  box(g, s, -82, -164, 10, 30, 4, COLORS.steelDeep);
  box(g, s, -86, -170, 18, 8, 3, COLORS.rubber);
}

function rollerCab(g: Phaser.GameObjects.Graphics, s: Style): void {
  cab(g, s, -58, -206, 86, 112);
  if (s.ghost) return;
  box(g, s, -30, -216, 22, 12, 5, COLORS.orange);
}

/* ---------------------------------------------------------- the pile driver ---- */

/** The mast's rail, which the hammer slides up and down. */
export const MAST_X = 118;
export const MAST_FOOT = -20;
export const MAST_TOP = -404;
/** The hammer's bottom edge at rest, high up the mast. */
export const HAMMER_REST = -300;
export const HAMMER_H = 58;

function pileBody(g: Phaser.GameObjects.Graphics, s: Style): void {
  box(g, s, -60, -62, 120, 16, 6, COLORS.rubber);
  fill(g, s, paint().body);
  const body = [
    { x: -110, y: -122 }, { x: 96, y: -122 }, { x: 96, y: -60 },
    { x: -94, y: -60 }, { x: -110, y: -76 },
  ];
  g.fillPoints(body, true);
  line(g, s, LINE.thick);
  g.strokePoints(body, true, true);
  if (s.ghost) return;
  g.fillStyle(COLORS.rubber);
  g.fillRect(-102, -84, 196, 12);
  g.fillStyle(COLORS.white, 0.3);
  g.fillRoundedRect(-102, -118, 190, 10, 5);
  // the winch drum the hammer's cable comes off
  disc(g, s, -70, -102, 13, COLORS.steelLight);
  g.fillStyle(COLORS.steelDeep);
  g.fillCircle(-70, -102, 4);
}

function pileCab(g: Phaser.GameObjects.Graphics, s: Style): void {
  cab(g, s, -36, -202, 92, 82);
}

function pileMast(g: Phaser.GameObjects.Graphics, s: Style): void {
  // the brace from the body up to the mast
  capsule(g, s, { x: 40, y: -122 }, { x: MAST_X - 8, y: -262 }, 6, COLORS.steelLight);
  // the mast: a tall rail with hazard stripes, a foot and a sheave on top
  box(g, s, MAST_X - 12, MAST_TOP, 24, MAST_FOOT - MAST_TOP, 6, paint().body);
  if (!s.ghost) {
    g.fillStyle(COLORS.rubber);
    for (let y = MAST_TOP + 20; y < MAST_FOOT - 14; y += 34) g.fillRect(MAST_X - 9, y, 18, 10);
    g.lineStyle(LINE.base, COLORS.outline);
    g.strokeRoundedRect(MAST_X - 12, MAST_TOP, 24, MAST_FOOT - MAST_TOP, 6);
  }
  box(g, s, MAST_X - 20, MAST_FOOT - 4, 40, 14, 5, COLORS.rubber);
  disc(g, s, MAST_X, MAST_TOP - 2, 13, COLORS.steelLight);
  if (!s.ghost) {
    g.fillStyle(COLORS.steelDeep);
    g.fillCircle(MAST_X, MAST_TOP - 2, 4);
  }
}

/** The drop hammer, its bottom edge at `bottom`, and the cable up over the sheave. */
export function drawHammer(g: Phaser.GameObjects.Graphics, bottom: number, s: Style = REAL): void {
  const top = bottom - HAMMER_H;
  if (!s.ghost) {
    g.lineStyle(2.5, COLORS.outline);
    g.lineBetween(MAST_X, MAST_TOP + 10, MAST_X, top);
  }
  box(g, s, MAST_X - 22, top, 44, HAMMER_H, 7, COLORS.rubber);
  if (s.ghost) return;
  box(g, s, MAST_X - 22, top + 18, 44, 16, 4, paint().body);
  g.fillStyle(COLORS.white, 0.2);
  g.fillRect(MAST_X - 18, top + 4, 8, HAMMER_H - 10);
}

/* --------------------------------------------------------- the tower crane ---- */

export const TOWER_TOP = -420;
/** Where the jib's underside is — the trolley runs along it. */
export const JIB_Y = -440;
export const JIB_END = 430;
export const COUNTER_END = -170;
export const PEAK: Pt = { x: 0, y: -522 };
export const TROLLEY_REST = 300;
export const TOWER_HOOK_REST = -380;

/** A lattice girder between two x positions: top and bottom chords and a zigzag. */
function lattice(
  g: Phaser.GameObjects.Graphics, s: Style,
  x1: number, x2: number, top: number, bottom: number, color: number
): void {
  const left = Math.min(x1, x2);
  const w = Math.abs(x2 - x1);
  if (s.ghost) {
    g.fillStyle(COLORS.outline, GHOST_FILL);
    g.fillRect(left, top, w, bottom - top);
    return;
  }
  const bar = (a: Pt, b: Pt, r: number) => {
    g.lineStyle(r * 2 + LINE.base * 2, COLORS.outline);
    g.lineBetween(a.x, a.y, b.x, b.y);
  };
  const paintBar = (a: Pt, b: Pt, r: number) => {
    g.lineStyle(r * 2, color);
    g.lineBetween(a.x, a.y, b.x, b.y);
  };
  const step = Math.max(14, bottom - top);
  const bars: [Pt, Pt, number][] = [
    [{ x: left, y: top }, { x: left + w, y: top }, 2.5],
    [{ x: left, y: bottom }, { x: left + w, y: bottom }, 3],
  ];
  for (let x = left, up = true; x < left + w - 1; x += step, up = !up) {
    const nx = Math.min(left + w, x + step);
    bars.push([{ x, y: up ? bottom : top }, { x: nx, y: up ? top : bottom }, 1.8]);
  }
  for (const [a, b, r] of bars) bar(a, b, r);
  for (const [a, b, r] of bars) paintBar(a, b, r);
}

/** The same, standing up: the tower. */
function latticeTower(
  g: Phaser.GameObjects.Graphics, s: Style,
  bottom: number, top: number, half: number, color: number
): void {
  if (s.ghost) {
    g.fillStyle(COLORS.outline, GHOST_FILL);
    g.fillRect(-half, top, half * 2, bottom - top);
    return;
  }
  const bars: [Pt, Pt, number][] = [
    [{ x: -half, y: bottom }, { x: -half, y: top }, 3.5],
    [{ x: half, y: bottom }, { x: half, y: top }, 3.5],
  ];
  const step = half * 2;
  for (let y = bottom, left = true; y > top + 1; y -= step, left = !left) {
    const ny = Math.max(top, y - step);
    bars.push([{ x: left ? -half : half, y }, { x: left ? half : -half, y: ny }, 2]);
    bars.push([{ x: -half, y }, { x: half, y }, 1.6]);
  }
  for (const [a, b, r] of bars) {
    g.lineStyle(r * 2 + LINE.base * 2, COLORS.outline);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (const [a, b, r] of bars) {
    g.lineStyle(r * 2, color);
    g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

function towerFoot(g: Phaser.GameObjects.Graphics, s: Style): void {
  box(g, s, -72, -26, 144, 26, 6, COLORS.concrete);
  if (s.ghost) return;
  g.fillStyle(COLORS.concreteDeep, 0.5);
  g.fillRect(-64, -10, 128, 4);
  box(g, s, -50, -38, 100, 14, 4, paint().deep);
}

function towerMast(g: Phaser.GameObjects.Graphics, s: Style): void {
  latticeTower(g, s, -36, TOWER_TOP, 18, paint().body);
}

function towerTop(g: Phaser.GameObjects.Graphics, s: Style): void {
  // the tower head: an A-frame the jib is tied to
  if (!s.ghost) {
    g.lineStyle(9, COLORS.outline);
    g.lineBetween(-16, JIB_Y - 18, PEAK.x, PEAK.y);
    g.lineBetween(16, JIB_Y - 18, PEAK.x, PEAK.y);
    g.lineStyle(4.5, paint().body);
    g.lineBetween(-16, JIB_Y - 18, PEAK.x, PEAK.y);
    g.lineBetween(16, JIB_Y - 18, PEAK.x, PEAK.y);
  } else {
    g.fillStyle(COLORS.outline, GHOST_FILL);
    g.fillTriangle(-16, JIB_Y - 18, PEAK.x, PEAK.y, 16, JIB_Y - 18);
  }
  // the slewing ring, and the operator's cab hanging beside it
  box(g, s, -28, TOWER_TOP - 12, 56, 16, 5, COLORS.rubber);
  box(g, s, 22, JIB_Y + 2, 50, 44, 8, COLORS.rubber);
  if (s.ghost) return;
  box(g, s, 28, JIB_Y + 8, 38, 26, 6, COLORS.glass);
  face(g, 47, JIB_Y + 22, 24);
  disc(g, s, PEAK.x, PEAK.y, 6, COLORS.steelLight);
}

function towerJib(g: Phaser.GameObjects.Graphics, s: Style): void {
  lattice(g, s, 16, JIB_END, JIB_Y - 18, JIB_Y, paint().body);
  if (s.ghost) return;
  box(g, s, JIB_END - 6, JIB_Y - 22, 12, 26, 4, paint().deep);
}

function towerCounter(g: Phaser.GameObjects.Graphics, s: Style): void {
  lattice(g, s, COUNTER_END, -16, JIB_Y - 16, JIB_Y, paint().body);
  // the concrete blocks that balance the load
  for (let i = 0; i < 3; i++) box(g, s, COUNTER_END + 4 + i * 20, JIB_Y - 4, 18, 38, 3, COLORS.concrete);
}

/**
 * The ropes from the tower head out to the jib and the counter-jib. Only once both ends are
 * on: drawn with either part alone, a rope would hang off it into thin air.
 */
function towerTies(g: Phaser.GameObjects.Graphics, has: (part: string) => boolean): void {
  if (!has('top')) return;
  g.lineStyle(2, COLORS.outline, 0.9);
  if (has('udligger')) g.lineBetween(PEAK.x, PEAK.y, JIB_END - 120, JIB_Y - 18);
  if (has('vaegt')) g.lineBetween(PEAK.x, PEAK.y, COUNTER_END + 20, JIB_Y - 16);
}

/** The trolley at `at.x` along the jib, and the hook hanging from it down to `at.y`. */
export function drawTowerHook(g: Phaser.GameObjects.Graphics, at: Pt, s: Style = REAL): void {
  box(g, s, at.x - 16, JIB_Y - 4, 32, 12, 4, COLORS.rubber);
  drawHook(g, { x: at.x, y: JIB_Y + 8 }, at, s);
}

/* ================================================================ registry ======== */

export interface PartArt {
  /** Middle of the part in machine coordinates — where it snaps to. */
  center: Pt;
  /** Rough size, for the drag hit area. */
  size: { w: number; h: number };
  draw: (g: Phaser.GameObjects.Graphics, s: Style) => void;
}

export const ART: Record<MachineId, Record<string, PartArt>> = {
  gravko: {
    baelter: { center: { x: 0, y: -25 }, size: { w: 224, h: 50 }, draw: gravkoTracks },
    krop: { center: { x: -22, y: -100 }, size: { w: 170, h: 86 }, draw: gravkoBody },
    hus: { center: { x: 35, y: -130 }, size: { w: 86, h: 140 }, draw: gravkoCab },
    bom: { center: { x: 130, y: -157 }, size: { w: 120, h: 130 }, draw: (g, s) => drawGravkoArm(g, GRAVKO_REST, s, 'bom') },
    arm: { center: { x: 226, y: -172 }, size: { w: 80, h: 110 }, draw: (g, s) => drawGravkoArm(g, GRAVKO_REST, s, 'arm') },
    skovl: { center: { x: 262, y: -95 }, size: { w: 56, h: 64 }, draw: (g, s) => drawGravkoArm(g, GRAVKO_REST, s, 'skovl') },
  },
  lastbil: {
    hjul: { center: { x: 0, y: -26 }, size: { w: 250, h: 52 }, draw: (g, s) => truckWheels(g, s, [-100, -46, 96]) },
    ramme: { center: { x: -6, y: -53 }, size: { w: 272, h: 30 }, draw: (g, s) => truckFrame(g, s) },
    hus: { center: { x: 95, y: -109 }, size: { w: 80, h: 96 }, draw: truckCab },
    lad: { center: { x: -50, y: -100 }, size: { w: 196, h: 76 }, draw: (g, s) => drawTruckBed(g, 0, 0, s) },
  },
  betonbil: {
    hjul: { center: { x: 0, y: -26 }, size: { w: 250, h: 52 }, draw: (g, s) => truckWheels(g, s, [-100, -46, 96]) },
    ramme: { center: { x: -6, y: -53 }, size: { w: 272, h: 30 }, draw: (g, s) => truckFrame(g, s) },
    hus: { center: { x: 95, y: -109 }, size: { w: 80, h: 96 }, draw: truckCab },
    tromle: { center: { x: -48, y: -108 }, size: { w: 176, h: 96 }, draw: (g, s) => drawDrum(g, 0, s) },
    rende: { center: { x: -160, y: -64 }, size: { w: 60, h: 56 }, draw: (g, s) => drawChute(g, CHUTE_REST, s) },
  },
  kran: {
    hjul: { center: { x: 0, y: -24 }, size: { w: 260, h: 48 }, draw: (g, s) => truckWheels(g, s, [-104, -56, 50, 98], 24) },
    ramme: { center: { x: -6, y: -53 }, size: { w: 272, h: 30 }, draw: (g, s) => truckFrame(g, s, true) },
    hus: { center: { x: 95, y: -109 }, size: { w: 80, h: 96 }, draw: truckCab },
    drej: { center: { x: -40, y: -96 }, size: { w: 146, h: 60 }, draw: craneTurntable },
    bom: { center: { x: 43, y: -173 }, size: { w: 214, h: 154 }, draw: (g, s) => drawCraneBoom(g, BOOM_TIP_REST, s) },
    krog: {
      center: { x: 150, y: -215 },
      size: { w: 40, h: 70 },
      draw: (g, s) => drawHook(g, BOOM_TIP_REST, { x: BOOM_TIP_REST.x, y: BOOM_TIP_REST.y + HOOK_DROP }, s),
    },
  },
  vejtromle: {
    tromle: { center: ROLLER_DRUM, size: { w: 100, h: 100 }, draw: (g, s) => rollerDrum(g, s) },
    ramme: { center: { x: 8, y: -87 }, size: { w: 296, h: 74 }, draw: rollerFrame },
    hjul: { center: ROLLER_WHEEL, size: { w: 80, h: 80 }, draw: (g, s) => rollerWheel(g, s) },
    motor: { center: { x: -106, y: -131 }, size: { w: 84, h: 78 }, draw: rollerMotor },
    hus: { center: { x: -15, y: -155 }, size: { w: 86, h: 122 }, draw: rollerCab },
  },
  pael: {
    baelter: { center: { x: 0, y: -25 }, size: { w: 224, h: 50 }, draw: gravkoTracks },
    krop: { center: { x: -7, y: -88 }, size: { w: 206, h: 76 }, draw: pileBody },
    hus: { center: { x: 10, y: -161 }, size: { w: 92, h: 82 }, draw: pileCab },
    mast: { center: { x: 86, y: -211 }, size: { w: 104, h: 411 }, draw: pileMast },
    lod: {
      center: { x: MAST_X, y: HAMMER_REST - HAMMER_H / 2 },
      size: { w: 44, h: HAMMER_H },
      draw: (g, s) => drawHammer(g, HAMMER_REST, s),
    },
  },
  taarnkran: {
    fod: { center: { x: 0, y: -19 }, size: { w: 144, h: 38 }, draw: towerFoot },
    taarn: { center: { x: 0, y: -228 }, size: { w: 44, h: 392 }, draw: towerMast },
    top: { center: { x: 22, y: -458 }, size: { w: 100, h: 128 }, draw: towerTop },
    udligger: { center: { x: 226, y: -449 }, size: { w: 420, h: 26 }, draw: towerJib },
    vaegt: { center: { x: -93, y: -430 }, size: { w: 154, h: 56 }, draw: towerCounter },
    krog: {
      center: { x: TROLLEY_REST, y: -405 },
      size: { w: 40, h: 80 },
      draw: (g, s) => drawTowerHook(g, { x: TROLLEY_REST, y: TOWER_HOOK_REST }, s),
    },
  },
};

/**
 * Back to front. Not the order parts go on: the excavator's boom is built after its body
 * but drawn behind it, so the body hides the boom's root.
 */
export const DRAW_ORDER: Record<MachineId, string[]> = {
  gravko: ['baelter', 'bom', 'arm', 'skovl', 'krop', 'hus'],
  lastbil: ['ramme', 'hjul', 'lad', 'hus'],
  betonbil: ['ramme', 'hjul', 'rende', 'tromle', 'hus'],
  kran: ['ramme', 'hjul', 'bom', 'krog', 'drej', 'hus'],
  vejtromle: ['hjul', 'tromle', 'ramme', 'motor', 'hus'],
  pael: ['baelter', 'mast', 'lod', 'krop', 'hus'],
  taarnkran: ['fod', 'taarn', 'vaegt', 'udligger', 'krog', 'top'],
};

/** Where the filler caps and the third job's spots are, in machine coordinates. */
export const SERVICE: Record<MachineId, { diesel: Pt; oil: Pt; extra: Pt[] }> = {
  gravko: {
    diesel: { x: -84, y: -104 },
    oil: { x: -56, y: -150 },
    extra: [GRAVKO_REST.root, GRAVKO_REST.elbow, GRAVKO_REST.wrist],
  },
  lastbil: {
    diesel: { x: 29, y: -48 },
    oil: { x: 112, y: -82 },
    extra: [{ x: -100, y: -26 }, { x: -46, y: -26 }, { x: 96, y: -26 }],
  },
  betonbil: {
    diesel: { x: 29, y: -48 },
    oil: { x: 112, y: -82 },
    extra: [{ x: -100, y: -120 }, { x: -48, y: -136 }, { x: 4, y: -104 }],
  },
  kran: {
    diesel: { x: 29, y: -48 },
    oil: { x: 112, y: -82 },
    extra: [BOOM_ROOT, { x: -100, y: -75 }, { x: 18, y: -75 }],
  },
  vejtromle: {
    diesel: { x: -24, y: -80 },
    oil: { x: -122, y: -116 },
    // two sprinklers on the drum's hood, one over the back tyre
    extra: [{ x: 48, y: -132 }, { x: 138, y: -132 }, { x: -92, y: -90 }],
  },
  pael: {
    diesel: { x: -30, y: -96 },
    oil: { x: 72, y: -100 },
    // the lamp at the top of the mast, the beacon on the cab, the light at the back
    extra: [{ x: MAST_X, y: MAST_TOP + 30 }, { x: 10, y: -214 }, { x: -104, y: -100 }],
  },
  taarnkran: {
    diesel: { x: -44, y: -14 },
    oil: { x: 0, y: -200 },
    // a flag on the peak and one at each end of the jib, the way a topping-out looks
    extra: [{ x: PEAK.x, y: PEAK.y - 10 }, { x: JIB_END - 10, y: JIB_Y - 34 }, { x: COUNTER_END + 20, y: JIB_Y - 32 }],
  },
};

export interface Pose {
  arm?: ArmPose;
  bedAngle?: number;
  bedLoad?: number;
  drumPhase?: number;
  chuteTip?: Pt;
  wetChute?: boolean;
  boomTip?: Pt;
  /** The crane's hook; on the tower crane, its x is also where the trolley is. */
  hook?: Pt;
  /** How far the roller's drum and wheel have turned, in radians. */
  rollPhase?: number;
  /** The pile driver's hammer: where its bottom edge is, in machine coordinates. */
  hammer?: number;
}

/**
 * A whole machine (or the parts of one that are on) into one Graphics.
 *
 * `pose` drives the moving parts; parts left out of `parts` are simply not drawn.
 */
export function drawMachine(
  g: Phaser.GameObjects.Graphics,
  id: MachineId,
  parts?: string[],
  pose: Pose = {}
): void {
  const has = (p: string) => !parts || parts.includes(p);
  for (const part of DRAW_ORDER[id]) {
    if (!has(part)) continue;
    if (id === 'gravko' && pose.arm && (part === 'bom' || part === 'arm' || part === 'skovl')) {
      drawGravkoArm(g, pose.arm, REAL, part);
    } else if (id === 'lastbil' && part === 'lad' && (pose.bedAngle !== undefined || pose.bedLoad !== undefined)) {
      drawTruckBed(g, pose.bedAngle ?? 0, pose.bedLoad ?? 0);
    } else if (id === 'betonbil' && part === 'tromle' && pose.drumPhase !== undefined) {
      drawDrum(g, pose.drumPhase);
    } else if (id === 'betonbil' && part === 'rende' && pose.chuteTip) {
      drawChute(g, pose.chuteTip, REAL, pose.wetChute);
    } else if (id === 'kran' && part === 'bom' && pose.boomTip) {
      drawCraneBoom(g, pose.boomTip);
    } else if (id === 'kran' && part === 'krog' && pose.boomTip) {
      drawHook(g, pose.boomTip, pose.hook ?? { x: pose.boomTip.x, y: pose.boomTip.y + HOOK_DROP });
    } else if (id === 'vejtromle' && part === 'tromle' && pose.rollPhase !== undefined) {
      rollerDrum(g, REAL, pose.rollPhase);
    } else if (id === 'vejtromle' && part === 'hjul' && pose.rollPhase !== undefined) {
      rollerWheel(g, REAL, pose.rollPhase * (ROLLER_DRUM_R / 40));
    } else if (id === 'pael' && part === 'lod' && pose.hammer !== undefined) {
      drawHammer(g, pose.hammer);
    } else if (id === 'taarnkran' && part === 'krog' && pose.hook) {
      drawTowerHook(g, pose.hook);
    } else {
      ART[id][part].draw(g, REAL);
    }
  }
  if (id === 'taarnkran') towerTies(g, has);
}

/**
 * One part on its own, as a Graphics offset so the part's middle sits on the parent's
 * origin. Put it in a container and the container can be dragged by its middle.
 */
export function partGraphic(scene: Phaser.Scene, id: MachineId, part: string, ghost = false): Phaser.GameObjects.Graphics {
  const art = ART[id][part];
  const g = scene.add.graphics().setPosition(-art.center.x, -art.center.y);
  art.draw(g, { ghost });
  return g;
}

/** The box a whole machine occupies, in its own coordinates — for fitting it to a space. */
export function machineBounds(id: MachineId): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const art of Object.values(ART[id])) {
    x0 = Math.min(x0, art.center.x - art.size.w / 2);
    x1 = Math.max(x1, art.center.x + art.size.w / 2);
    y0 = Math.min(y0, art.center.y - art.size.h / 2);
    y1 = Math.max(y1, art.center.y + art.size.h / 2);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Every part as a silhouette, then the parts that are on drawn for real over it. */
export function drawMachineProgress(g: Phaser.GameObjects.Graphics, id: MachineId, placed: string[]): void {
  for (const part of DRAW_ORDER[id]) {
    if (!placed.includes(part)) ART[id][part].draw(g, { ghost: true });
  }
  drawMachine(g, id, placed);
}
