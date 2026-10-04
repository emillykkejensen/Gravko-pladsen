/**
 * Logical game size.
 *
 * The canvas is scaled to FIT whatever it is given, so this is really a zoom control: a
 * smaller logical stage means every drawn shape and every label covers more of the screen.
 * Same stage as Sommer Hotellet, for the same reason — a five-year-old holds a phone at
 * arm's length.
 *
 * The 1.6 aspect ratio is deliberate — changing it would letterbox instead of zoom.
 */
export const GAME_WIDTH = 880;
export const GAME_HEIGHT = 550;

/**
 * Palette.
 *
 * Backgrounds stay soft, and everything that sits on them is outlined and a step more
 * saturated. Contrast comes from the ink line, not from shouting fills. The machines are
 * the one place the game is allowed to be loud: construction yellow is the brand.
 */
export const COLORS = {
  // sky
  sky: 0x9FD6F2,
  skyLight: 0xD9EFFB,
  skyDeep: 0x7CBFE4,

  // ground
  grass: 0x86C963,
  grassLight: 0xA6DC85,
  grassDeep: 0x5FA347,

  sand: 0xF2DCA4,
  sandLight: 0xFAEDCD,
  sandDeep: 0xD9BA7C,

  /** Dug earth. Warmer than sand, so a hole reads as a hole and not as a sandpit. */
  dirt: 0xB07C4F,
  dirtLight: 0xC9976A,
  dirtDeep: 0x7E5434,

  gravel: 0xB9B4AA,
  gravelDeep: 0x8F897E,

  concrete: 0xC9CBCB,
  concreteWet: 0x9EA3A6,
  concreteDeep: 0x8A8F92,

  asphalt: 0x6E6A66,
  asphaltLight: 0x8A8580,

  // water
  water: 0x54B4E2,
  waterLight: 0x93D6F0,
  waterDeep: 0x2F8CC0,

  // wood
  wood: 0xCE9C69,
  woodLight: 0xE3BB8D,
  woodDeep: 0xA0764B,

  // building
  roof: 0xE0715A,
  roofDeep: 0xB55345,
  wall: 0xFDF6E8,
  wallDeep: 0xF0E2C9,
  window: 0xCDEAF7,

  /** Machine yellow — the excavator in the reference picture. */
  machine: 0xF7C21B,
  machineLight: 0xFFDA5C,
  machineDeep: 0xD99A0B,
  /** The black trim and rubber. Warm, like the outline, never pure black. */
  rubber: 0x3A332D,
  rubberLight: 0x58504A,
  steel: 0x9AA3AB,
  steelLight: 0xC4CBD1,
  steelDeep: 0x6D757D,
  /** Cab glass — the blue of the reference picture's window. */
  glass: 0x4F86C6,
  glassLight: 0x7FAADB,

  /** Steel beams on the crane site. */
  beam: 0xD9534A,
  beamDeep: 0xA83C35,

  diesel: 0x3FA34D,
  oil: 0xE8A33B,

  // accents
  red: 0xE8705A,
  orange: 0xF5A249,
  yellow: 0xF8CE55,
  green: 0x74C255,
  pink: 0xF593AC,
  purple: 0xAE87D6,
  teal: 0x54C4B8,
  blue: 0x5B9BE0,
  sun: 0xFFCF52,
  sunDeep: 0xF2AE2C,

  // neutrals — warm, so nothing reads as printer grey
  white: 0xFFFFFF,
  cream: 0xFDF7EA,
  stone: 0xDCD4C7,
  stoneDeep: 0xB5AA9A,
  ink: 0x5A4E42,
  inkSoft: 0x8A7E70,
  shadow: 0x4A3B2E,

  /**
   * The cartoon outline. One warm near-black used for every stroke in the game, so the
   * whole screen reads as drawn by the same hand.
   */
  outline: 0x4A3A2C,
};

/** Same values as CSS strings, for Text objects. */
export const INK = '#5A4E42';
export const INK_SOFT = '#8A7E70';
export const INK_ON_DARK = '#FFFFFF';
export const OUTLINE_CSS = '#4A3A2C';

/** Nunito, bundled in public/fonts so the game makes no network requests. */
export const FONT = "Nunito, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";

/** Type scale. Every size in the game comes from here, so legibility is one edit. */
export const SIZE = {
  display: 49,
  title: 29,
  heading: 21,
  body: 17,
  label: 15,
  tiny: 13,
};

export type Weight = 'regular' | 'semibold' | 'bold';
const WEIGHTS: Record<Weight, string> = { regular: '400', semibold: '600', bold: '700' };

export function text(
  size: number,
  color: string = INK,
  weight: Weight = 'semibold'
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: WEIGHTS[weight] };
}

/** Outlined text, for anything sitting on scenery rather than on a plate. */
export function textOutlined(
  size: number,
  color = '#FFFFFF',
  stroke = OUTLINE_CSS,
  thickness = 6
): Phaser.Types.GameObjects.Text.TextStyle {
  return { ...text(size, color, 'bold'), stroke, strokeThickness: thickness };
}

/** Stroke weights, so the outline stays consistent across every shape in the game. */
export const LINE = {
  hair: 1.5,
  thin: 2,
  base: 2.5,
  thick: 3.5,
  heavy: 5,
};

/** Shared depths so effects always draw above a refreshed layer. */
export const DEPTH = {
  background: 0,
  ambient: 5,
  dynamic: 10,
  /** Whatever the player is dragging, so it never slides under the machine. */
  dragging: 600,
  chrome: 800,
  effects: 900,
  overlay: 950,
};

/**
 * Builder ranks. A read-out of effort, not a gate — nothing to unlock, nothing to fail,
 * no way to go backwards.
 */
export const RANKS = [
  { at: 0, name: 'Lærling' },
  { at: 10, name: 'Hjælper' },
  { at: 25, name: 'Maskinfører' },
  { at: 45, name: 'Formand' },
  { at: 70, name: 'Byggeleder' },
  { at: 100, name: 'Bygmester' },
];

export interface RankInfo {
  index: number;
  name: string;
  /** 0-1 through the current rank; 1 when the last rank is reached. */
  progress: number;
  starsInto: number;
  starsNeeded: number;
  isMax: boolean;
}

export function rankFor(stars: number): RankInfo {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (stars >= RANKS[i].at) index = i;
  }
  const isMax = index === RANKS.length - 1;
  const from = RANKS[index].at;
  const to = isMax ? from : RANKS[index + 1].at;
  const span = to - from;
  // Clamped by hand rather than with Phaser.Math: the Playwright harness imports this
  // module in Node, where there is no DOM for Phaser to attach to.
  const progress = span > 0 ? Math.min(1, Math.max(0, (stars - from) / span)) : 1;
  return {
    index,
    name: RANKS[index].name,
    progress: isMax ? 1 : progress,
    starsInto: stars - from,
    starsNeeded: isMax ? 0 : span,
    isMax,
  };
}

/** Shown in a big bouncy pop when something is finished. Rotated so it never nags. */
export const PRAISE = ['Flot!', 'Sådan!', 'Godt gået!', 'Super!', 'Hurra!', 'Fint klaret!', 'Mega godt!'];

/** House colours the child picks from when a building is finished. */
export const PAINT = [
  { name: 'Rød', color: 0xE0715A },
  { name: 'Gul', color: 0xF8CE55 },
  { name: 'Blå', color: 0x5B9BE0 },
  { name: 'Grøn', color: 0x74C255 },
  { name: 'Lilla', color: 0xAE87D6 },
  { name: 'Lyserød', color: 0xF593AC },
];
