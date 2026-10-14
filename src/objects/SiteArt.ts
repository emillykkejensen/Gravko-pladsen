import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, LINE, PAINT } from '../config';
import { addBirds, drawCloud, drawSun, drawTree, gradientBand, shade } from '../helpers/Draw';
import { ProjectDef, doorXs, isDoorSlot } from '../state/Projects';

/**
 * Scenery shared by the building-site screens: the sky, the ground in cross-section, the
 * hole at each stage, and the buildings themselves.
 *
 * The site is drawn side-on, like a cut through the ground, because that is the only view
 * in which a child can see a hole getting deeper, gravel landing in the bottom of it and
 * concrete filling the formwork.
 */

/**
 * Ground level on every building-site screen, on the 550-tall stage the scenes were drawn
 * for. A taller stage (a tablet) puts the extra height into the sky, so the ground keeps its
 * distance from the bottom edge: use `groundY(scene)`, not this.
 */
export const GROUND_Y = 400;

export function groundY(scene: Phaser.Scene): number {
  return GROUND_Y + scene.scale.height - GAME_HEIGHT;
}

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
export function holeFor(pourCells: number, cx: number, ground = GROUND_Y): HoleBox {
  const w = pourCells * CELL_W + 24;
  return { x: cx - w / 2, y: ground, w, h: HOLE_DEPTH };
}

/** Sky, distant hills and a couple of trees, across the whole stage. Background layer. */
export function siteSky(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
  const { width } = scene.scale;
  const ground = groundY(scene);
  add(gradientBand(scene, 0, ground, COLORS.skyLight, COLORS.sky));

  const hills = scene.add.graphics();
  hills.fillStyle(COLORS.grassLight, 0.7);
  hills.fillEllipse(width * 0.16, ground + 10, width * 0.48, 150);
  hills.fillEllipse(width * 0.82, ground + 14, width * 0.6, 170);
  hills.fillStyle(COLORS.grass, 0.55);
  hills.fillEllipse(width * 0.49, ground + 20, width * 0.52, 120);
  add(hills);

  add(drawTree(scene, 40, ground - 4, 0.75));
  add(drawTree(scene, width - 30, ground - 2, 0.85));
}

/** Sun, clouds and birds. Ambient layer. */
export function siteWeather(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
  const { width } = scene.scale;
  add(drawSun(scene, width - 60, 92, 30));
  const clouds = [drawCloud(scene, width * 0.2, 110, 0.9), drawCloud(scene, width * 0.64, 80, 0.7)];
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
export function drawGround(g: Phaser.GameObjects.Graphics, width: number, height: number, ground = GROUND_Y): void {
  g.fillStyle(COLORS.dirt);
  g.fillRect(0, ground, width, height - ground);
  g.fillStyle(COLORS.dirtDeep, 0.35);
  g.fillRect(0, ground + 70, width, height - ground - 70);
  g.fillStyle(COLORS.dirtLight, 0.6);
  for (let i = 0; i < Math.round(width / 34); i++) {
    const x = (i * 97) % width;
    const y = ground + 30 + ((i * 53) % (height - ground - 40));
    g.fillEllipse(x, y, 14 + (i % 3) * 6, 7 + (i % 2) * 3);
  }
  g.fillStyle(COLORS.grassDeep);
  g.fillRect(0, ground - 4, width, 14);
  g.fillStyle(COLORS.grass);
  g.fillRect(0, ground - 6, width, 10);
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.lineBetween(0, ground - 6, width, ground - 6);
}

export interface HoleBox { x: number; y: number; w: number; h: number }

/** How far a pile reaches below the bottom of the hole. */
export const PILE_BELOW = 84;
export const PILE_W = 14;

/** Where each pile goes, spread evenly under the foundation. */
export function pileXs(hole: HoleBox, count: number): number[] {
  const inner = hole.w - 40;
  return Array.from({ length: count }, (_, i) => hole.x + 20 + ((i + 0.5) * inner) / count);
}

/**
 * One concrete pile, its head at `top`. Drawn in the ground's cross-section, so the
 * piles the pile driver banked in can still be seen under the hole on every later stage.
 */
export function drawPile(g: Phaser.GameObjects.Graphics, x: number, top: number, length: number): void {
  g.fillStyle(COLORS.concrete);
  g.fillRect(x - PILE_W / 2, top, PILE_W, length);
  g.fillStyle(COLORS.white, 0.35);
  g.fillRect(x - PILE_W / 2 + 2, top + 2, 3, length - 4);
  g.fillStyle(COLORS.concreteDeep);
  g.fillTriangle(x - PILE_W / 2, top + length, x + PILE_W / 2, top + length, x, top + length + 10);
  g.lineStyle(LINE.thin, COLORS.outline, 0.9);
  g.strokeRect(x - PILE_W / 2, top, PILE_W, length);
  g.strokeTriangle(x - PILE_W / 2, top + length, x + PILE_W / 2, top + length, x, top + length + 10);
}

/** The piles under a hole that has been dug, if the building has any. */
export function drawPilesUnder(g: Phaser.GameObjects.Graphics, hole: HoleBox, count: number): void {
  for (const x of pileXs(hole, count)) drawPile(g, x, hole.y + hole.h, PILE_BELOW - 10);
}

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

/**
 * The hole once the foundation has set: the gravel bed, the slab flush with the ground and
 * earth backfilled against its ends. Where every stage after the foundation stands.
 */
export function drawFinishedSlab(g: Phaser.GameObjects.Graphics, hole: HoleBox, p: ProjectDef): void {
  drawHole(g, hole);
  drawPilesUnder(g, hole, p.piles);
  drawGravelLayer(g, hole, GRAVEL_DEPTH);
  drawFoundation(g, hole.x + 12, slabTop(hole), Array(p.pourCells).fill(1), 1, false);
  g.fillStyle(COLORS.dirt);
  g.fillRect(hole.x, hole.y - 6, 12, SLAB_H + 6);
  g.fillRect(hole.x + hole.w - 12, hole.y - 6, 12, SLAB_H + 6);
  g.fillStyle(COLORS.grass);
  g.fillRect(hole.x, hole.y - 6, 12, 6);
  g.fillRect(hole.x + hole.w - 12, hole.y - 6, 12, 6);
}

/** The top of the finished slab: where the building stands. */
export function slabTop(hole: HoleBox): number {
  return hole.y + hole.h - GRAVEL_DEPTH - SLAB_H;
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
 * town reads as one place. The town's big buildings each get what makes them that building
 * at a glance: the bus station's canopy and stop sign, the fire station's red doors and hose
 * tower, the police station's blue light, the railway station's clock and the hospital's red
 * cross and helipad.
 */
export function drawBuilding(g: Phaser.GameObjects.Graphics, p: ProjectDef, paint: number): void {
  const w = p.pourCells * CELL_W;
  const x = -w / 2;
  const color = PAINT[paint]?.color ?? COLORS.wall;
  const wallH = p.floors * FLOOR_H;
  const kind = p.kind;

  // the fire station's hose tower stands behind the building's right end
  if (kind === 'brandstation') {
    const tx = x + w - 34;
    const th = wallH + 44;
    g.fillStyle(shade(color, -0.12));
    g.fillRect(tx, -th, 30, th);
    g.lineStyle(LINE.base, COLORS.outline, 1);
    g.strokeRect(tx, -th, 30, th);
    g.fillStyle(COLORS.roofDeep);
    g.fillTriangle(tx - 4, -th, tx + 15, -th - 18, tx + 34, -th);
    g.strokeTriangle(tx - 4, -th, tx + 15, -th - 18, tx + 34, -th);
    g.fillStyle(COLORS.window);
    g.fillRect(tx + 9, -th + 10, 12, 14);
    g.strokeRect(tx + 9, -th + 10, 12, 14);
  }

  // walls
  g.fillStyle(shade(color, -0.25));
  g.fillRect(x + 3, -wallH + 3, w, wallH);
  g.fillStyle(color);
  g.fillRect(x, -wallH, w, wallH);
  const stripes = PAINT[paint]?.stripes;
  if (stripes) {
    stripes.forEach((c, i) => {
      g.fillStyle(c);
      g.fillRect(x + (i * w) / stripes.length, -wallH, w / stripes.length + 0.5, wallH);
    });
  }
  g.fillStyle(COLORS.white, 0.18);
  g.fillRect(x, -wallH, w * 0.18, wallH);
  g.lineStyle(LINE.base, COLORS.outline, 1);
  g.strokeRect(x, -wallH, w, wallH);

  // windows on every floor; the ground floor saves the middle for the door
  const perFloor = Math.max(2, Math.round(w / 50));
  for (let f = 0; f < p.floors; f++) {
    const fy = -(f + 1) * FLOOR_H;
    // the fire station's ground floor is its engine doors, the bus station's is glass
    if (f === 0 && (kind === 'brandstation' || kind === 'busstation')) continue;
    for (let i = 0; i < perFloor; i++) {
      const wx = x + ((i + 0.5) * w) / perFloor - 10;
      if (f === 0 && isDoorSlot(p, i)) continue;
      drawWindow(g, wx, fy + 12, kind === 'togstation' && f === 0);
      // a little balcony under each window of the apartment block, above the ground floor
      if (kind === 'boligblok' && f > 0) {
        g.fillStyle(COLORS.white, 0.85);
        g.fillRect(wx - 4, fy + 30, 28, 9);
        g.lineStyle(LINE.thin, COLORS.outline, 1);
        g.strokeRect(wx - 4, fy + 30, 28, 9);
        g.lineBetween(wx + 3, fy + 30, wx + 3, fy + 39);
        g.lineBetween(wx + 10, fy + 30, wx + 10, fy + 39);
        g.lineBetween(wx + 17, fy + 30, wx + 17, fy + 39);
      }
    }
  }

  // the terraced houses: a line between each home, and a shade of difference in each
  if (kind === 'raekkehus') {
    g.fillStyle(COLORS.white, 0.12);
    g.fillRect(x + w / 3, -wallH, w / 3, wallH);
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.lineBetween(x + w / 3, -wallH, x + w / 3, 0);
    g.lineBetween(x + (2 * w) / 3, -wallH, x + (2 * w) / 3, 0);
  }

  if (kind === 'brandstation') {
    // two tall red engine doors, with a door for people between them
    for (const dx of [x + 8, x + w - 62]) {
      g.fillStyle(COLORS.red);
      g.fillRoundedRect(dx, -40, 54, 40, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.lineStyle(LINE.thin, COLORS.outline, 1);
      g.strokeRoundedRect(dx, -40, 54, 40, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.lineStyle(1.5, shade(COLORS.red, -0.3), 1);
      for (let ly = -32; ly < 0; ly += 7) g.lineBetween(dx + 3, ly, dx + 51, ly);
    }
  } else if (kind === 'busstation') {
    // a glass front, all the way along the ground floor
    g.fillStyle(COLORS.window);
    g.fillRect(x + 6, -40, w - 12, 36);
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.strokeRect(x + 6, -40, w - 12, 36);
    for (let gx = x + 6 + (w - 12) / 5; gx < x + w - 8; gx += (w - 12) / 5) g.lineBetween(gx, -40, gx, -4);
    g.fillStyle(COLORS.white, 0.5);
    g.fillTriangle(x + 10, -36, x + 40, -36, x + 10, -14);
  }

  // door, or one for each home
  if (kind !== 'brandstation') {
    for (const dx of doorXs(p)) {
      g.fillStyle(kind === 'busstation' ? COLORS.glassLight : COLORS.woodDeep);
      g.fillRoundedRect(dx - 11, -34, 22, 34, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.lineStyle(LINE.thin, COLORS.outline, 1);
      g.strokeRoundedRect(dx - 11, -34, 22, 34, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.fillStyle(COLORS.sun);
      g.fillCircle(dx + 6, -16, 2.2);
    }
  } else {
    g.fillStyle(COLORS.woodDeep);
    g.fillRect(-9, -30, 18, 30);
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.strokeRect(-9, -30, 18, 30);
  }

  // a shop: wide and single-storey, so it gets a striped awning over the windows
  if (kind === 'butik') {
    const aw = w - 10;
    for (let i = 0; i < 8; i++) {
      g.fillStyle(i % 2 ? COLORS.white : COLORS.red);
      g.fillRect(x + 5 + (i * aw) / 8, -FLOOR_H + 2, aw / 8 + 0.5, 10);
    }
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.strokeRect(x + 5, -FLOOR_H + 2, aw, 10);
  }

  // the police station's blue band and sign, the hospital's red cross
  if (kind === 'politi') {
    g.fillStyle(COLORS.blue);
    g.fillRect(x, -FLOOR_H - 2, w, 9);
    g.lineStyle(LINE.thin, COLORS.outline, 1);
    g.strokeRect(x, -FLOOR_H - 2, w, 9);
    plateFlat(g, -24, -wallH + 6, 48, 14, COLORS.blue);
    g.fillStyle(COLORS.white);
    for (let i = 0; i < 6; i++) g.fillRect(-18 + i * 6.5, -wallH + 10, 4, 6);
  }
  if (kind === 'hospital') {
    plateFlat(g, -17, -wallH + 6, 34, 34, COLORS.white);
    g.fillStyle(COLORS.red);
    g.fillRect(-5, -wallH + 10, 10, 26);
    g.fillRect(-13, -wallH + 18, 26, 10);
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
    if (kind === 'togstation') {
      // the station clock in the gable
      const cy = -wallH - rh * 0.42;
      g.fillStyle(COLORS.white);
      g.fillCircle(0, cy, 13);
      g.lineStyle(LINE.thin, COLORS.outline, 1);
      g.strokeCircle(0, cy, 13);
      g.lineStyle(2.5, COLORS.outline, 1);
      g.lineBetween(0, cy, 0, cy - 9);
      g.lineBetween(0, cy, 6, cy + 2);
    } else {
      // a chimney, or one for each home
      g.fillStyle(COLORS.roofDeep);
      const chimneys = kind === 'raekkehus' ? [0.16, 0.5, 0.84] : [0.68];
      for (const at of chimneys) {
        // up from wherever the roof slope is under it
        const cx = x + w * at;
        const slope = rh * (1 - Math.abs(cx + 6) / (w / 2 + 12));
        g.fillRect(cx, -wallH - slope - 6, 12, Math.max(10, slope * 0.4) + 6);
        g.strokeRect(cx, -wallH - slope - 6, 12, Math.max(10, slope * 0.4) + 6);
      }
    }
  } else {
    const over = kind === 'busstation' ? 34 : 6;
    g.fillStyle(COLORS.stoneDeep);
    g.fillRect(x - 6, -wallH - rh, w + 6 + over, rh);
    g.lineStyle(LINE.base, COLORS.outline, 1);
    g.strokeRect(x - 6, -wallH - rh, w + 6 + over, rh);
    if (kind === 'hoejhus') {
      // a high-rise gets an antenna with a light on it
      g.lineStyle(3, COLORS.outline, 1);
      g.lineBetween(w * 0.25, -wallH - rh, w * 0.25, -wallH - rh - 26);
      g.fillStyle(COLORS.red);
      g.fillCircle(w * 0.25, -wallH - rh - 28, 4);
    }
    if (kind === 'politi') {
      plateFlat(g, -8, -wallH - rh - 12, 16, 12, COLORS.blue);
      g.fillStyle(COLORS.white, 0.6);
      g.fillRect(-4, -wallH - rh - 9, 3, 6);
    }
    if (kind === 'hospital') {
      // the helipad: a white H in a circle on the roof's edge
      g.fillStyle(COLORS.stone);
      g.fillEllipse(w * 0.22, -wallH - rh, 64, 14);
      g.lineStyle(LINE.thin, COLORS.outline, 1);
      g.strokeEllipse(w * 0.22, -wallH - rh, 64, 14);
      g.lineStyle(2, COLORS.white, 1);
      g.lineBetween(w * 0.22 - 7, -wallH - rh - 4, w * 0.22 - 7, -wallH - rh + 4);
      g.lineBetween(w * 0.22 + 7, -wallH - rh - 4, w * 0.22 + 7, -wallH - rh + 4);
      g.lineBetween(w * 0.22 - 7, -wallH - rh, w * 0.22 + 7, -wallH - rh);
    }
    if (kind === 'busstation') {
      // the canopy's post, and the bus stop sign on its pole
      g.fillStyle(COLORS.outline);
      g.fillRect(x + w + 22, -wallH, 5, wallH);
      g.fillRect(x + w + 46, -64, 4, 64);
      g.fillStyle(COLORS.sun);
      g.fillCircle(x + w + 48, -70, 12);
      g.lineStyle(LINE.thin, COLORS.outline, 1);
      g.strokeCircle(x + w + 48, -70, 12);
      g.fillStyle(COLORS.red);
      g.fillRect(x + w + 42, -73, 12, 6);
    }
  }
}

/** A flat outlined plate — signs on the buildings. */
function plateFlat(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
  g.fillStyle(color);
  g.fillRoundedRect(x, y, w, h, 3);
  g.lineStyle(LINE.thin, COLORS.outline, 1);
  g.strokeRoundedRect(x, y, w, h, 3);
}

/** One window, top-left at (wx, wy), 20 square — arched for the railway station. */
export function drawWindow(g: Phaser.GameObjects.Graphics, wx: number, wy: number, arched = false): void {
  const r = arched ? { tl: 10, tr: 10, bl: 2, br: 2 } : 3;
  g.fillStyle(COLORS.window);
  g.fillRoundedRect(wx, wy, 20, 20, r);
  g.fillStyle(COLORS.white, 0.6);
  g.fillTriangle(wx + 2, wy + 2, wx + 11, wy + 2, wx + 2, wy + 11);
  g.lineStyle(LINE.thin, COLORS.outline, 1);
  g.strokeRoundedRect(wx, wy, 20, 20, r);
  g.lineBetween(wx + 10, wy, wx + 10, wy + 20);
}

/** Where a window spot's top-left corner is, relative to the building's bottom middle. */
export function windowAt(p: ProjectDef, floor: number, slot: number): { x: number; y: number } {
  const w = p.pourCells * CELL_W;
  const per = Math.max(2, Math.round(w / 50));
  return { x: -w / 2 + ((slot + 0.5) * w) / per - 10, y: -(floor + 1) * FLOOR_H + 12 };
}

/** Total height of a finished building above its base, with what sticks up — for the town. */
export function buildingTop(p: ProjectDef): number {
  const extra = p.kind === 'brandstation' ? 62 - roofHeight(p.roof, p.pourCells * CELL_W)
    : p.kind === 'hoejhus' ? 30 : p.kind === 'politi' ? 12 : 0;
  return buildingHeight(p) + Math.max(0, extra);
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

/** Floor level inside the workshop, on the 550 stage; `floorY(scene)` on any other. */
export const FLOOR_Y = 440;

export function floorY(scene: Phaser.Scene): number {
  return FLOOR_Y + scene.scale.height - GAME_HEIGHT;
}

/**
 * The inside of the workshop: panelled wall, a tool board, a concrete floor with a hazard
 * stripe. Shared by the garage and the two machine screens so they read as one room.
 */
export function workshopBackdrop(scene: Phaser.Scene, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
  const { width, height } = scene.scale;
  const floor = floorY(scene);
  // the tool board and the window hang at the same height above the floor on any stage
  const top = floor - 290;
  add(gradientBand(scene, 0, floor, 0xE7EEF2, 0xCBD8E0));

  const g = scene.add.graphics();
  // wall panels
  g.lineStyle(2, 0xB3C2CC, 0.9);
  for (let x = 0; x < width; x += 110) g.lineBetween(x, 0, x, floor);
  g.lineBetween(0, top - 30, width, top - 30);

  // tool board with silhouettes of spanners and hammers
  g.fillStyle(COLORS.woodLight);
  g.fillRoundedRect(40, top, 170, 110, 8);
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.strokeRoundedRect(40, top, 170, 110, 8);
  g.fillStyle(COLORS.woodDeep, 0.5);
  for (let i = 0; i < 4; i++) {
    const tx = 64 + i * 40;
    g.fillRect(tx - 3, top + 18, 6, 60);
    g.fillCircle(tx, top + 18, 9);
  }

  // a window with the sky in it
  g.fillStyle(COLORS.sky);
  g.fillRoundedRect(width - 210, top, 150, 90, 8);
  g.fillStyle(COLORS.white, 0.6);
  g.fillEllipse(width - 160, top + 30, 50, 18);
  g.lineStyle(LINE.thick, COLORS.outline, 0.9);
  g.strokeRoundedRect(width - 210, top, 150, 90, 8);
  g.lineBetween(width - 135, top, width - 135, top + 90);

  // floor
  g.fillStyle(COLORS.concrete);
  g.fillRect(0, floor, width, height - floor);
  g.fillStyle(COLORS.concreteDeep, 0.25);
  for (let i = 0; i < Math.round(width / 49); i++) g.fillEllipse((i * 131) % width, floor + 30 + ((i * 47) % 80), 40, 6);
  // hazard stripe along the wall
  for (let x = 0; x < width; x += 28) {
    g.fillStyle(COLORS.machine);
    g.fillRect(x, floor - 12, 14, 12);
    g.fillStyle(COLORS.rubber);
    g.fillRect(x + 14, floor - 12, 14, 12);
  }
  g.lineStyle(LINE.base, COLORS.outline, 0.9);
  g.lineBetween(0, floor - 12, width, floor - 12);
  g.lineBetween(0, floor, width, floor);
  add(g);
}
