import Phaser from 'phaser';
import { COLORS, LINE, PAINT } from '../config';
import { addBirds, drawCloud, drawSun, drawTree, gradientBand, shade } from '../helpers/Draw';
import type { ProjectDef } from '../state/Projects';

/**
 * Scenery shared by the building-site screens: the sky, the ground in cross-section, the
 * hole at each stage, and the buildings themselves.
 *
 * The site is drawn side-on, like a cut through the ground, because that is the only view
 * in which a child can see a hole getting deeper, gravel landing in the bottom of it and
 * concrete filling the formwork.
 */

/** Ground level on every building-site screen. */
export const GROUND_Y = 400;

/** Width of one section of foundation; the building is as wide as its foundation. */
export const CELL_W = 40;

/** Height of one storey of steel frame. */
export const FLOOR_H = 46;

/** How thick the poured foundation slab is. */
export const SLAB_H = 22;

/**
 * The hole as the later stages see it: a gravel bed with the foundation on top, and exactly
 * deep enough for both, so the finished slab is flush with the ground and the building
 * stands on level earth.
 */
export const GRAVEL_DEPTH = 22;
export const HOLE_DEPTH = GRAVEL_DEPTH + SLAB_H;

/** The hole for the current building, centred on `cx`, sized to its foundation. */
export function holeFor(pourCells: number, cx: number): { x: number; y: number; w: number; h: number } {
  const w = pourCells * CELL_W + 24;
  return { x: cx - w / 2, y: GROUND_Y, w, h: HOLE_DEPTH };
}

/** Sky, distant hills and a couple of trees. Background layer. */
export function siteSky(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
  const { width } = scene.scale;
  add(gradientBand(scene, 0, GROUND_Y, COLORS.skyLight, COLORS.sky));

  const hills = scene.add.graphics();
  hills.fillStyle(COLORS.grassLight, 0.7);
  hills.fillEllipse(140, GROUND_Y + 10, 420, 150);
  hills.fillEllipse(720, GROUND_Y + 14, 520, 170);
  hills.fillStyle(COLORS.grass, 0.55);
  hills.fillEllipse(430, GROUND_Y + 20, 460, 120);
  add(hills);

  add(drawTree(scene, 40, GROUND_Y - 4, 0.75));
  add(drawTree(scene, width - 30, GROUND_Y - 2, 0.85));
}

/** Sun, clouds and birds. Ambient layer. */
export function siteWeather(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
  add(drawSun(scene, 820, 92, 30));
  const clouds = [drawCloud(scene, 180, 110, 0.9), drawCloud(scene, 560, 80, 0.7)];
  clouds.forEach((c, i) => {
    add(c);
    scene.tweens.add({
      targets: c,
      x: c.x + 60,
      duration: 14000 + i * 5000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  });
  addBirds(scene, 2, 60, 40).forEach(b => add(b));
}

/**
 * The ground in cross-section: a grass edge on top and layered earth below, with a few
 * stones so it reads as soil rather than a brown rectangle.
 */
export function drawGround(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
  g.fillStyle(COLORS.dirt);
  g.fillRect(0, GROUND_Y, width, height - GROUND_Y);
  g.fillStyle(COLORS.dirtDeep, 0.35);
  g.fillRect(0, GROUND_Y + 70, width, height - GROUND_Y - 70);
  g.fillStyle(COLORS.dirtLight, 0.6);
  for (let i = 0; i < 26; i++) {
    const x = (i * 97) % width;
    const y = GROUND_Y + 30 + ((i * 53) % (height - GROUND_Y - 40));
    g.fillEllipse(x, y, 14 + (i % 3) * 6, 7 + (i % 2) * 3);
  }
  g.fillStyle(COLORS.grassDeep);
  g.fillRect(0, GROUND_Y - 4, width, 14);
  g.fillStyle(COLORS.grass);
  g.fillRect(0, GROUND_Y - 6, width, 10);
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.lineBetween(0, GROUND_Y - 6, width, GROUND_Y - 6);
}

export interface HoleBox { x: number; y: number; w: number; h: number }

/** An empty hole: darker earth walls and floor, with the grass edge cut back. */
export function drawHole(g: Phaser.GameObjects.Graphics, hole: HoleBox): void {
  g.fillStyle(COLORS.dirtDeep);
  g.fillRect(hole.x, hole.y - 6, hole.w, hole.h + 6);
  g.fillStyle(shade(COLORS.dirtDeep, -0.2));
  g.fillRect(hole.x, hole.y + hole.h - 8, hole.w, 8);
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.beginPath();
  g.moveTo(hole.x, hole.y - 6);
  g.lineTo(hole.x, hole.y + hole.h);
  g.lineTo(hole.x + hole.w, hole.y + hole.h);
  g.lineTo(hole.x + hole.w, hole.y - 6);
  g.strokePath();
}

/** A layer of gravel `depth` px deep at the bottom of the hole. */
export function drawGravelLayer(g: Phaser.GameObjects.Graphics, hole: HoleBox, depth: number): void {
  if (depth <= 0) return;
  const top = hole.y + hole.h - depth;
  g.fillStyle(COLORS.gravelDeep);
  g.fillRect(hole.x + 1, top, hole.w - 2, depth);
  g.fillStyle(COLORS.gravel);
  const count = Math.floor(hole.w / 9);
  for (let i = 0; i < count; i++) {
    for (let row = 0; row < Math.ceil(depth / 9); row++) {
      g.fillCircle(hole.x + 5 + i * 9 + (row % 2) * 4, top + 4 + row * 8, 3.6);
    }
  }
}

/**
 * The foundation: formwork boards around sections that fill with concrete. `fills` is one
 * 0-1 per section; `dry` fades the wet grey to finished concrete.
 */
export function drawFoundation(
  g: Phaser.GameObjects.Graphics,
  x: number, top: number,
  fills: number[],
  dry = 0,
  formwork = true
): void {
  const w = fills.length * CELL_W;
  fills.forEach((f, i) => {
    const cx = x + i * CELL_W;
    if (f <= 0) return;
    const h = SLAB_H * Math.min(1, f);
    const wet = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(COLORS.concreteWet),
      Phaser.Display.Color.ValueToColor(COLORS.concrete),
      100, Math.round(dry * 100)
    );
    g.fillStyle(Phaser.Display.Color.GetColor(wet.r, wet.g, wet.b));
    g.fillRect(cx, top + SLAB_H - h, CELL_W, h);
    if (dry < 1) {
      g.fillStyle(COLORS.white, 0.25 * (1 - dry));
      g.fillRect(cx + 4, top + SLAB_H - h + 2, CELL_W - 8, 3);
    }
  });
  if (!formwork) {
    g.lineStyle(LINE.base, COLORS.outline, 0.9);
    g.strokeRect(x, top, w, SLAB_H);
    return;
  }
  // the boards: one at each end, and a thin divider between sections
  g.fillStyle(COLORS.wood);
  g.fillRect(x - 8, top - 6, 8, SLAB_H + 6);
  g.fillRect(x + w, top - 6, 8, SLAB_H + 6);
  g.lineStyle(LINE.thin, COLORS.outline, 0.9);
  g.strokeRect(x - 8, top - 6, 8, SLAB_H + 6);
  g.strokeRect(x + w, top - 6, 8, SLAB_H + 6);
  g.lineStyle(LINE.hair, COLORS.woodDeep, 0.9);
  for (let i = 1; i < fills.length; i++) {
    g.lineBetween(x + i * CELL_W, top + 2, x + i * CELL_W, top + SLAB_H);
  }
  g.lineStyle(LINE.thin, COLORS.outline, 0.9);
  g.lineBetween(x, top + SLAB_H, x + w, top + SLAB_H);
}

/* ----------------------------------------------------------------- buildings --- */

/** Steel I-beam between two points. */
function beam(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, w = 7): void {
  g.lineStyle(w + 3, COLORS.outline, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(w, COLORS.beam, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(2, COLORS.white, 0.3);
  g.lineBetween(x1, y1 - 1, x2, y2 - 1);
}

/** One storey of steel frame: posts, a top beam and a cross brace. Origin bottom-left. */
export function drawFrame(g: Phaser.GameObjects.Graphics, x: number, bottom: number, w: number, ghost = false): void {
  if (ghost) {
    g.fillStyle(COLORS.white, 0.35);
    g.fillRect(x, bottom - FLOOR_H, w, FLOOR_H);
    g.lineStyle(LINE.base, COLORS.beam, 0.7);
    g.strokeRect(x, bottom - FLOOR_H, w, FLOOR_H);
    return;
  }
  const posts = Math.max(2, Math.round(w / 60) + 1);
  for (let i = 0; i < posts; i++) {
    const px = x + 4 + (i * (w - 8)) / (posts - 1);
    beam(g, px, bottom, px, bottom - FLOOR_H + 3, 6);
  }
  beam(g, x + 4, bottom - 4, x + w - 4, bottom - FLOOR_H + 6, 4);
  beam(g, x, bottom - FLOOR_H + 3, x + w, bottom - FLOOR_H + 3, 7);
}

/** The roof frame, as lifted by the crane: a truss for a pitched roof, a beam for a flat one. */
export function drawRoofFrame(
  g: Phaser.GameObjects.Graphics, x: number, bottom: number, w: number,
  kind: ProjectDef['roof'], ghost = false
): void {
  const h = roofHeight(kind, w);
  if (ghost) {
    g.fillStyle(COLORS.white, 0.35);
    g.lineStyle(LINE.base, COLORS.beam, 0.7);
    if (kind === 'saddel') {
      g.fillTriangle(x - 8, bottom, x + w / 2, bottom - h, x + w + 8, bottom);
      g.strokeTriangle(x - 8, bottom, x + w / 2, bottom - h, x + w + 8, bottom);
    } else {
      g.fillRect(x - 6, bottom - h, w + 12, h);
      g.strokeRect(x - 6, bottom - h, w + 12, h);
    }
    return;
  }
  if (kind === 'saddel') {
    beam(g, x - 8, bottom - 2, x + w / 2, bottom - h, 6);
    beam(g, x + w + 8, bottom - 2, x + w / 2, bottom - h, 6);
    beam(g, x - 8, bottom - 2, x + w + 8, bottom - 2, 6);
    beam(g, x + w / 2, bottom - 2, x + w / 2, bottom - h + 4, 4);
  } else {
    beam(g, x - 6, bottom - h + 4, x + w + 6, bottom - h + 4, 7);
    beam(g, x - 6, bottom - 3, x + w + 6, bottom - 3, 5);
    for (let px = x; px <= x + w; px += Math.max(30, w / 4)) beam(g, px, bottom - 3, px, bottom - h + 4, 3);
  }
}

export function roofHeight(kind: ProjectDef['roof'], w: number): number {
  return kind === 'saddel' ? Math.min(70, w * 0.38) : 16;
}

/** Total height of a finished building, for laying out the town. */
export function buildingHeight(p: ProjectDef): number {
  return p.floors * FLOOR_H + roofHeight(p.roof, p.pourCells * CELL_W);
}

/**
 * A finished, painted building. Origin is the middle of its bottom edge.
 *
 * Every storey gets windows; the ground floor gets a door; a shop gets an awning. The
 * colour is the child's own choice, and the roof stays the same for every house so the
 * town reads as one place.
 */
export function drawBuilding(g: Phaser.GameObjects.Graphics, p: ProjectDef, paint: number): void {
  const w = p.pourCells * CELL_W;
  const x = -w / 2;
  const color = PAINT[paint]?.color ?? COLORS.wall;
  const wallH = p.floors * FLOOR_H;

  // walls
  g.fillStyle(shade(color, -0.25));
  g.fillRect(x + 3, -wallH + 3, w, wallH);
  g.fillStyle(color);
  g.fillRect(x, -wallH, w, wallH);
  g.fillStyle(COLORS.white, 0.18);
  g.fillRect(x, -wallH, w * 0.18, wallH);
  g.lineStyle(LINE.base, COLORS.outline, 1);
  g.strokeRect(x, -wallH, w, wallH);

  // windows on every floor; the ground floor saves the middle for the door
  const perFloor = Math.max(2, Math.round(w / 50));
  for (let f = 0; f < p.floors; f++) {
    const fy = -(f + 1) * FLOOR_H;
    for (let i = 0; i < perFloor; i++) {
      const wx = x + ((i + 0.5) * w) / perFloor - 10;
      if (f === 0 && Math.abs(wx + 10) < 18) continue;
      g.fillStyle(COLORS.window);
      g.fillRoundedRect(wx, fy + 12, 20, 20, 3);
      g.fillStyle(COLORS.white, 0.6);
      g.fillTriangle(wx + 2, fy + 14, wx + 11, fy + 14, wx + 2, fy + 23);
      g.lineStyle(LINE.thin, COLORS.outline, 1);
      g.strokeRoundedRect(wx, fy + 12, 20, 20, 3);
      g.lineBetween(wx + 10, fy + 12, wx + 10, fy + 32);
    }
  }

  // door
  g.fillStyle(COLORS.woodDeep);
  g.fillRoundedRect(-11, -34, 22, 34, { tl: 8, tr: 8, bl: 0, br: 0 });
  g.lineStyle(LINE.thin, COLORS.outline, 1);
  g.strokeRoundedRect(-11, -34, 22, 34, { tl: 8, tr: 8, bl: 0, br: 0 });
  g.fillStyle(COLORS.sun);
  g.fillCircle(6, -16, 2.2);

  // a shop: wide and single-storey, so it gets a striped awning over the windows
  if (p.floors === 1 && p.roof === 'flad') {
    const aw = w - 10;
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 ? COLORS.white : COLORS.red);
      g.fillRect(x + 5 + (i * aw) / 8, -FLOOR_H + 2, aw / 8 + 0.5, 10);
    }
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.strokeRect(x + 5, -FLOOR_H + 2, aw, 10);
  }

  // roof
  const rh = roofHeight(p.roof, w);
  if (p.roof === 'saddel') {
    g.fillStyle(COLORS.roofDeep);
    g.fillTriangle(x - 12, -wallH + 3, 0, -wallH - rh + 3, x + w + 12, -wallH + 3);
    g.fillStyle(COLORS.roof);
    g.fillTriangle(x - 12, -wallH, 0, -wallH - rh, x + w + 12, -wallH);
    g.lineStyle(LINE.base, COLORS.outline, 1);
    g.strokeTriangle(x - 12, -wallH, 0, -wallH - rh, x + w + 12, -wallH);
    // chimney
    g.fillStyle(COLORS.roofDeep);
    g.fillRect(x + w * 0.68, -wallH - rh * 0.75, 12, rh * 0.4);
    g.strokeRect(x + w * 0.68, -wallH - rh * 0.75, 12, rh * 0.4);
  } else {
    g.fillStyle(COLORS.stoneDeep);
    g.fillRect(x - 6, -wallH - rh, w + 12, rh);
    g.lineStyle(LINE.base, COLORS.outline, 1);
    g.strokeRect(x - 6, -wallH - rh, w + 12, rh);
    if (p.floors > 2) {
      // a high-rise gets an antenna with a light on it
      g.lineStyle(3, COLORS.outline, 1);
      g.lineBetween(w * 0.25, -wallH - rh, w * 0.25, -wallH - rh - 26);
      g.fillStyle(COLORS.red);
      g.fillCircle(w * 0.25, -wallH - rh - 28, 4);
    }
  }
}

/** A building under construction: as many frames as have been lifted. Origin bottom-middle. */
export function drawBuildingFrame(g: Phaser.GameObjects.Graphics, p: ProjectDef, placed: number, ghostNext = true): void {
  const w = p.pourCells * CELL_W;
  const x = -w / 2;
  for (let f = 0; f < p.floors; f++) {
    if (f < placed) drawFrame(g, x, -f * FLOOR_H, w);
    else if (ghostNext && f === placed) drawFrame(g, x, -f * FLOOR_H, w, true);
  }
  const roofBottom = -p.floors * FLOOR_H;
  if (placed > p.floors) drawRoofFrame(g, x, roofBottom, w, p.roof);
  else if (ghostNext && placed === p.floors) drawRoofFrame(g, x, roofBottom, w, p.roof, true);
}

/* ------------------------------------------------------------------ workshop --- */

/** Floor level inside the workshop. */
export const FLOOR_Y = 440;

/**
 * The inside of the workshop: panelled wall, a tool board, a concrete floor with a hazard
 * stripe. Shared by the garage and the two machine screens so they read as one room.
 */
export function workshopBackdrop(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
  const { width, height } = scene.scale;
  add(gradientBand(scene, 0, FLOOR_Y, 0xE7EEF2, 0xCBD8E0));

  const g = scene.add.graphics();
  // wall panels
  g.lineStyle(2, 0xB3C2CC, 0.9);
  for (let x = 0; x < width; x += 110) g.lineBetween(x, 0, x, FLOOR_Y);
  g.lineBetween(0, 120, width, 120);

  // tool board with silhouettes of spanners and hammers
  g.fillStyle(COLORS.woodLight);
  g.fillRoundedRect(40, 150, 170, 110, 8);
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.strokeRoundedRect(40, 150, 170, 110, 8);
  g.fillStyle(COLORS.woodDeep, 0.5);
  for (let i = 0; i < 4; i++) {
    const tx = 64 + i * 40;
    g.fillRect(tx - 3, 168, 6, 60);
    g.fillCircle(tx, 168, 9);
  }

  // a window with the sky in it
  g.fillStyle(COLORS.sky);
  g.fillRoundedRect(width - 210, 150, 150, 90, 8);
  g.fillStyle(COLORS.white, 0.6);
  g.fillEllipse(width - 160, 180, 50, 18);
  g.lineStyle(LINE.thick, COLORS.outline, 0.9);
  g.strokeRoundedRect(width - 210, 150, 150, 90, 8);
  g.lineBetween(width - 135, 150, width - 135, 240);

  // floor
  g.fillStyle(COLORS.concrete);
  g.fillRect(0, FLOOR_Y, width, height - FLOOR_Y);
  g.fillStyle(COLORS.concreteDeep, 0.25);
  for (let i = 0; i < 18; i++) g.fillEllipse((i * 131) % width, FLOOR_Y + 30 + ((i * 47) % 80), 40, 6);
  // hazard stripe along the wall
  for (let x = 0; x < width; x += 28) {
    g.fillStyle(COLORS.machine);
    g.fillRect(x, FLOOR_Y - 12, 14, 12);
    g.fillStyle(COLORS.rubber);
    g.fillRect(x + 14, FLOOR_Y - 12, 14, 12);
  }
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.lineBetween(0, FLOOR_Y - 12, width, FLOOR_Y - 12);
  g.lineBetween(0, FLOOR_Y, width, FLOOR_Y);
  add(g);
}
