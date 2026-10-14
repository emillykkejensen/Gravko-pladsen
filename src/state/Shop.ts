import { PAINT } from '../config';
import { MACHINE_IDS, MachineId } from './Machines';

/**
 * What stars buy.
 *
 * Stars used to be a read-out of effort and nothing else, so after the first few houses there
 * was no reason to want the next one. Now they are spent in the star shop, on three shelves:
 *
 *   Byen        things for the town — lamps, trees, a wind turbine, a balloon in the sky
 *   Biler       vehicles for the town's own buildings: a bus once there is a bus station,
 *               a fire engine once there is a fire station, and so on
 *   Maskinerne  a new coat of paint for every machine
 *   Husene      new colours to paint the houses in
 *   Opgrader    bigger buckets, beds and hooks, so a machine does more at a time
 *
 * Spending never costs the child their rank: the rank ladder counts every star ever earned
 * (`GameState.earned`), and only the balance goes down. Nothing bought can be lost.
 *
 * No Phaser here; how each thing is drawn lives in objects/TownArt.ts and MachineArt.ts.
 * Ids are stored in the save, so append, never rename.
 */

export type Shelf = 'byen' | 'biler' | 'maskiner' | 'huse' | 'opgrader';

export interface ShopItem {
  id: string;
  name: string;
  cost: number;
  shelf: Shelf;
  /** The town's own building (a ProjectDef id) that has to stand before this can be bought. */
  needs?: string;
}

/** Things for the town, each with its own place in it so they never stand on each other. */
export const DECORATIONS: ShopItem[] = [
  { id: 'lygter', name: 'Lygtepæle', cost: 5, shelf: 'byen' },
  { id: 'flag', name: 'Vimpler', cost: 6, shelf: 'byen' },
  { id: 'traer', name: 'Træer', cost: 8, shelf: 'byen' },
  { id: 'moelle', name: 'Vindmøllen', cost: 14, shelf: 'byen' },
  { id: 'ballon', name: 'Luftballonen', cost: 18, shelf: 'byen' },
  { id: 'fyrvaerkeri', name: 'Fyrværkeri', cost: 24, shelf: 'byen' },
  { id: 'statue', name: 'Guldgravkoen', cost: 30, shelf: 'byen' },
];

/**
 * Vehicles for the town, each waiting for the building it belongs to: a bus needs a bus
 * station to drive from. A bus bought before there were bus stations stays bought.
 */
export const VEHICLES: ShopItem[] = [
  { id: 'bus', name: 'Bussen', cost: 10, shelf: 'biler', needs: 'busstation' },
  { id: 'brandbil', name: 'Brandbilen', cost: 12, shelf: 'biler', needs: 'brandstation' },
  { id: 'politibil', name: 'Politibilen', cost: 12, shelf: 'biler', needs: 'politi' },
  { id: 'tog', name: 'Toget', cost: 16, shelf: 'biler', needs: 'togstation' },
  { id: 'ambulance', name: 'Ambulancen', cost: 14, shelf: 'biler', needs: 'hospital' },
  { id: 'helikopter', name: 'Helikopteren', cost: 20, shelf: 'biler', needs: 'hospital' },
];

/** A coat of paint for the machines: the body colour and its light and deep steps. */
export interface Livery extends ShopItem {
  body: number;
  light: number;
  deep: number;
  /** Gold, which gets a glint on every panel — the most expensive thing ought to look it. */
  shiny?: boolean;
}

/** The first is the machines' own construction yellow, which every child already has. */
export const LIVERIES: Livery[] = [
  { id: 'gul', name: 'Gul', cost: 0, shelf: 'maskiner', body: 0xF7C21B, light: 0xFFDA5C, deep: 0xD99A0B },
  { id: 'lak-roed', name: 'Rød', cost: 10, shelf: 'maskiner', body: 0xE8604A, light: 0xF4897A, deep: 0xC0432F },
  { id: 'lak-blaa', name: 'Blå', cost: 10, shelf: 'maskiner', body: 0x63B6F2, light: 0x96D0F8, deep: 0x3A8BCB },
  { id: 'lak-groen', name: 'Grøn', cost: 10, shelf: 'maskiner', body: 0x6CC24A, light: 0x97DB7A, deep: 0x4E9A33 },
  { id: 'lak-lyseroed', name: 'Lyserød', cost: 12, shelf: 'maskiner', body: 0xF58FB0, light: 0xF9B5CB, deep: 0xD9668C },
  { id: 'lak-lilla', name: 'Lilla', cost: 12, shelf: 'maskiner', body: 0xB08ADB, light: 0xCBB0EA, deep: 0x8B63B8 },
  {
    id: 'lak-guld', name: 'Guld', cost: 40, shelf: 'maskiner',
    body: 0xE3AC2F, light: 0xFFE68A, deep: 0xA8741A, shiny: true,
  },
];

export const DEFAULT_LIVERY = LIVERIES[0].id;

export function liveryById(id: string): Livery {
  return LIVERIES.find(l => l.id === id) ?? LIVERIES[0];
}

/** House colours that have to be bought: every PAINT entry that names a shop item. */
export const HOUSE_PAINTS: ShopItem[] = PAINT
  .filter(p => p.item)
  .map(p => ({ id: p.item!, name: p.name, cost: p.cost ?? 0, shelf: 'huse' as const }));

/**
 * A machine upgrade. Each machine has two, bought in turn: the first lets it do twice as much
 * at a time, the second four times — a bucket that scoops two chunks of earth, then four; a
 * truck bed that brings two loads of gravel, then the whole hole's worth; a crane that lifts
 * two floors at once, then four.
 */
export interface Upgrade extends ShopItem {
  machine: MachineId;
  /** 1 or 2. */
  level: number;
}

/** What each machine's two upgrades are called. */
const UPGRADE_NAMES: Record<MachineId, [string, string]> = {
  gravko: ['Stor skovl', 'Kæmpeskovl'],
  lastbil: ['Stort lad', 'Kæmpelad'],
  betonbil: ['Stor tromle', 'Kæmpetromle'],
  kran: ['Stærk krog', 'Superkrog'],
  vejtromle: ['Bred tromle', 'Kæmpetromle'],
  pael: ['Tungt lod', 'Kæmpelod'],
  taarnkran: ['Stærk krog', 'Superkrog'],
  bulldozer: ['Bred skraber', 'Kæmpeskraber'],
  laesser: ['Stor skovl', 'Kæmpeskovl'],
  nedriv: ['Tung kugle', 'Kæmpekugle'],
  asfalt: ['Bred glatter', 'Kæmpeglatter'],
  lift: ['Stor kurv', 'Kæmpekurv'],
};

export const UPGRADE_COSTS = [5, 10];

export const UPGRADES: Upgrade[] = MACHINE_IDS.flatMap(machine => [1, 2].map(level => ({
  id: `op-${machine}-${level}`,
  name: UPGRADE_NAMES[machine][level - 1],
  cost: UPGRADE_COSTS[level - 1],
  shelf: 'opgrader' as const,
  machine,
  level,
})));

export function upgradeFor(machine: MachineId, level: number): Upgrade | null {
  return UPGRADES.find(u => u.machine === machine && u.level === level) ?? null;
}

/** How many times as much a machine does at a time, at each upgrade level. */
export const CAPACITY = [1, 2, 4];

export const SHOP_ITEMS: ShopItem[] = [...DECORATIONS, ...VEHICLES, ...LIVERIES.slice(1), ...HOUSE_PAINTS, ...UPGRADES];

export function itemById(id: string): ShopItem | null {
  return SHOP_ITEMS.find(i => i.id === id) ?? null;
}
