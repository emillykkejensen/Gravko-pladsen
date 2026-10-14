import type { MachineId } from './Machines';

/**
 * What gets built, and in which order.
 *
 * Every building goes through the same core stages, because that is how a real one goes up
 * and because it gives each machine its own job: the excavator digs the hole, the truck
 * lays gravel in the bottom, the mixer pours the foundation and the crane lifts the steel
 * frame onto it. The child then paints it, and it moves into the town.
 *
 * Bigger buildings add stages, each with a machine of its own, so growing a project means
 * building something new in the workshop rather than only doing more of the same: the villa
 * has its gravel rolled flat, the shop stands on piles, and the high-rise is too tall for the
 * mobile crane and needs a tower crane. The town's big buildings carry on the same way — the
 * bus station has its ground pushed flat by a bulldozer, the fire station has rocks cleared
 * by a wheel loader, the police station has an old shed knocked down first, the railway
 * station gets an asphalt platform and the hospital has its windows put in from a lift
 * truck — and each new job stays on for every building after it.
 *
 * Every building has its own plot on the town's road, in this order, and the ones not built
 * yet stand there faded, so a child can see what is coming. After the hospital the road
 * keeps going with ordinary houses, each borrowing one of the big buildings' jobs in turn.
 */

export type StageId =
  | 'riv' | 'sten' | 'planer' | 'pael' | 'grav' | 'grus' | 'tromle' | 'stoeb' | 'rejs' | 'taarn'
  | 'vinduer' | 'asfalt' | 'mal';

export interface StageDef {
  id: StageId;
  /** The machine that does it, or null for painting. */
  machine: MachineId | null;
  /** Title on the building-site screen. */
  title: string;
  /** The scene that plays it. */
  scene: string;
}

export const STAGE_DEFS: Record<StageId, StageDef> = {
  // The old shed comes down before anything else happens on the plot.
  riv: { id: 'riv', machine: 'nedriv', title: 'Riv det gamle skur ned', scene: 'WreckScene' },
  sten: { id: 'sten', machine: 'laesser', title: 'Saml stenene op', scene: 'RockScene' },
  planer: { id: 'planer', machine: 'bulldozer', title: 'Skub jorden flad', scene: 'PlanerScene' },
  // Piles go in before the hole is dug, from level ground, the way a real pile rig works.
  pael: { id: 'pael', machine: 'pael', title: 'Bank pælene ned', scene: 'PileScene' },
  grav: { id: 'grav', machine: 'gravko', title: 'Grav hullet', scene: 'DigScene' },
  grus: { id: 'grus', machine: 'lastbil', title: 'Kør grus i hullet', scene: 'GravelScene' },
  tromle: { id: 'tromle', machine: 'vejtromle', title: 'Tril gruset fast', scene: 'RollScene' },
  stoeb: { id: 'stoeb', machine: 'betonbil', title: 'Støb fundamentet', scene: 'PourScene' },
  rejs: { id: 'rejs', machine: 'kran', title: 'Byg stålskelettet', scene: 'CraneScene' },
  // The same job as `rejs`, for a building too tall for the mobile crane.
  taarn: { id: 'taarn', machine: 'taarnkran', title: 'Byg stålskelettet', scene: 'CraneScene' },
  vinduer: { id: 'vinduer', machine: 'lift', title: 'Sæt vinduerne i', scene: 'WindowScene' },
  asfalt: { id: 'asfalt', machine: 'asfalt', title: 'Læg asfalt', scene: 'AsphaltScene' },
  // Painting happens in the crane scene, on the finished frame — no machine needed.
  mal: { id: 'mal', machine: null, title: 'Mal huset', scene: 'CraneScene' },
};

/** The order stages always come in, whichever of them a building has. */
export const STAGE_ORDER: StageId[] = [
  'riv', 'sten', 'planer', 'pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'taarn', 'vinduer', 'asfalt', 'mal',
];

/** The stages of the very first version of the game, which saves of version 1 count in. */
export const V1_STAGES: StageId[] = ['grav', 'grus', 'stoeb', 'rejs', 'mal'];

export type RoofKind = 'saddel' | 'flad';

/** What a building looks like once it is finished. */
export type BuildingKind =
  | 'hus' | 'villa' | 'butik' | 'hoejhus' | 'busstation' | 'brandstation' | 'politi' | 'togstation' | 'hospital';

export interface ProjectDef {
  /** Its plot on the road, and which shop things it opens: the same as its index. */
  index: number;
  /** What the shop's vehicles ask for: "busstation". Repeated houses have their kind's id. */
  id: string;
  kind: BuildingKind;
  name: string;
  /** "villaen" — for sentences such as "Den skal bruges til villaen". */
  definite: string;
  /** Stars paid when it moves into the town. The only stars there are. */
  stars: number;
  /** The stages this building goes through, in order. Always ends with painting. */
  stages: StageId[];
  /** Hole size in chunks the excavator scoops out: columns across, layers down. */
  holeCols: number;
  holeRows: number;
  /** Truckloads of gravel. */
  gravelLoads: number;
  /** Sections of foundation formwork the mixer fills. Also the building's width. */
  pourCells: number;
  /** Steel frames the crane lifts, one per floor. The roof is one more lift. */
  floors: number;
  roof: RoofKind;
  /** Piles the pile driver banks into the ground; 0 for a building without a pile stage. */
  piles: number;
  /** Heaps of earth the bulldozer pushes flat. */
  mounds: number;
  /** Big rocks the wheel loader picks up. */
  rocks: number;
  /** Blocks in the old shed the wrecking ball knocks down. */
  shed: number;
  /** Strips of asphalt the paver lays. */
  asphalt: number;
}

type Shape = Omit<ProjectDef, 'index' | 'stages' | 'mounds' | 'rocks' | 'shed' | 'asphalt'>
  & Partial<Pick<ProjectDef, 'mounds' | 'rocks' | 'shed' | 'asphalt'>>;

const def = (index: number, stages: StageId[], shape: Shape): ProjectDef => ({
  mounds: 0, rocks: 0, shed: 0, asphalt: 0, ...shape, index, stages,
});

/** The core stages every building has, with the jobs the bigger ones add slotted in. */
const withStages = (...extra: StageId[]): StageId[] => {
  const crane: StageId = extra.includes('taarn') ? 'taarn' : 'rejs';
  const all = new Set<StageId>(['grav', 'grus', 'stoeb', crane, 'mal', ...extra]);
  return STAGE_ORDER.filter(s => all.has(s));
};

/** The town's own buildings, each on its own plot, in the order they are built. */
export const PROJECTS: ProjectDef[] = [
  def(0, withStages(), {
    id: 'hus', kind: 'hus', name: 'Det lille hus', definite: 'det lille hus', stars: 5,
    holeCols: 4, holeRows: 2, gravelLoads: 1, pourCells: 4, floors: 1, roof: 'saddel', piles: 0,
  }),
  def(1, withStages('tromle'), {
    id: 'villa', kind: 'villa', name: 'Villaen', definite: 'villaen', stars: 6,
    holeCols: 5, holeRows: 2, gravelLoads: 2, pourCells: 5, floors: 2, roof: 'saddel', piles: 0,
  }),
  def(2, withStages('pael', 'tromle'), {
    id: 'butik', kind: 'butik', name: 'Butikken', definite: 'butikken', stars: 8,
    holeCols: 6, holeRows: 2, gravelLoads: 2, pourCells: 6, floors: 1, roof: 'flad', piles: 3,
  }),
  def(3, withStages('pael', 'tromle', 'taarn'), {
    id: 'hoejhus', kind: 'hoejhus', name: 'Højhuset', definite: 'højhuset', stars: 10,
    holeCols: 5, holeRows: 3, gravelLoads: 2, pourCells: 5, floors: 4, roof: 'flad', piles: 4,
  }),
  def(4, withStages('planer', 'pael', 'tromle'), {
    id: 'busstation', kind: 'busstation', name: 'Busstationen', definite: 'busstationen', stars: 10,
    holeCols: 6, holeRows: 2, gravelLoads: 2, pourCells: 6, floors: 1, roof: 'flad', piles: 3,
    mounds: 3,
  }),
  def(5, withStages('sten', 'planer', 'pael', 'tromle'), {
    id: 'brandstation', kind: 'brandstation', name: 'Brandstationen', definite: 'brandstationen', stars: 12,
    holeCols: 6, holeRows: 2, gravelLoads: 2, pourCells: 6, floors: 2, roof: 'flad', piles: 3,
    mounds: 3, rocks: 4,
  }),
  def(6, withStages('riv', 'sten', 'planer', 'pael', 'tromle'), {
    id: 'politi', kind: 'politi', name: 'Politistationen', definite: 'politistationen', stars: 12,
    holeCols: 5, holeRows: 2, gravelLoads: 2, pourCells: 5, floors: 2, roof: 'flad', piles: 3,
    mounds: 3, rocks: 4, shed: 6,
  }),
  def(7, withStages('riv', 'sten', 'planer', 'pael', 'tromle', 'asfalt'), {
    id: 'togstation', kind: 'togstation', name: 'Togstationen', definite: 'togstationen', stars: 14,
    holeCols: 6, holeRows: 2, gravelLoads: 2, pourCells: 6, floors: 2, roof: 'saddel', piles: 4,
    mounds: 4, rocks: 5, shed: 6, asphalt: 5,
  }),
  def(8, withStages('riv', 'sten', 'planer', 'pael', 'tromle', 'taarn', 'vinduer', 'asfalt'), {
    id: 'hospital', kind: 'hospital', name: 'Hospitalet', definite: 'hospitalet', stars: 15,
    holeCols: 6, holeRows: 3, gravelLoads: 3, pourCells: 6, floors: 4, roof: 'flad', piles: 4,
    mounds: 4, rocks: 5, shed: 9, asphalt: 5,
  }),
];

/** The big buildings' jobs, which the houses after the hospital take turns to borrow. */
const BORROWED: StageId[] = ['planer', 'sten', 'riv', 'asfalt', 'vinduer'];

/** What a borrowed job needs, for a house that has not got it from its own shape. */
const BORROWED_SIZE: Pick<ProjectDef, 'mounds' | 'rocks' | 'shed' | 'asphalt'> = {
  mounds: 3, rocks: 4, shed: 6, asphalt: 4,
};

const cache = new Map<number, ProjectDef>();

/**
 * The building on plot `index`. The first nine are the town's own; after them the road keeps
 * going with the four houses in turn, each also borrowing one of the big buildings' jobs, so
 * every machine keeps getting work.
 */
export function projectAt(index: number): ProjectDef {
  const i = Math.max(0, Math.floor(index));
  if (i < PROJECTS.length) return PROJECTS[i];
  const hit = cache.get(i);
  if (hit) return hit;
  const k = i - PROJECTS.length;
  const base = PROJECTS[k % 4];
  const borrowed = BORROWED[k % BORROWED.length];
  const p: ProjectDef = {
    ...base,
    ...BORROWED_SIZE,
    index: i,
    stars: 8,
    stages: STAGE_ORDER.filter(s => s === borrowed || base.stages.includes(s)),
  };
  cache.set(i, p);
  return p;
}

/** How many plots the town's own buildings take; houses follow after them. */
export const LANDMARKS = PROJECTS.length;

/** A project's stages, as definitions. */
export function stagesOf(project: ProjectDef): StageDef[] {
  return project.stages.map(id => STAGE_DEFS[id]);
}

/** The town's own building with this id, if there is one. */
export function projectById(id: string): ProjectDef | null {
  return PROJECTS.find(p => p.id === id) ?? null;
}

/**
 * The first time the game asks for a machine: which project, and which of its stages.
 * Null for a machine no project uses.
 */
export function firstUse(machine: MachineId): { project: number; stage: number } | null {
  for (let p = 0; p < PROJECTS.length; p++) {
    const stage = PROJECTS[p].stages.findIndex(id => STAGE_DEFS[id].machine === machine);
    if (stage >= 0) return { project: p, stage };
  }
  return null;
}

/**
 * How many steel frames the building has to lift into place: one per floor, and the roof.
 */
export function framePieces(p: ProjectDef): number {
  return p.floors + 1;
}

/** Windows the lift truck puts in: two on every floor but the ground floor's middle. */
export function windowCount(p: ProjectDef): number {
  return windowSpots(p).length;
}

/**
 * Where each window goes, as (floor, slot) pairs, bottom floor first. The ground floor's
 * middle is the door.
 */
export function windowSpots(p: ProjectDef): { floor: number; slot: number }[] {
  const per = windowsPerFloor(p);
  const spots: { floor: number; slot: number }[] = [];
  for (let f = 0; f < p.floors; f++) {
    for (let s = 0; s < per; s++) {
      if (f === 0 && isDoorSlot(p, s)) continue;
      spots.push({ floor: f, slot: s });
    }
  }
  return spots;
}

export function windowsPerFloor(p: ProjectDef): number {
  return Math.max(2, Math.round((p.pourCells * 40) / 50));
}

/** Whether a ground-floor window slot is where the door goes. */
export function isDoorSlot(p: ProjectDef, slot: number): boolean {
  const per = windowsPerFloor(p);
  const w = p.pourCells * 40;
  const wx = -w / 2 + ((slot + 0.5) * w) / per - 10;
  return Math.abs(wx + 10) < 18;
}

/** Bangs of the pile driver's hammer it takes to get one pile all the way down. */
export const BANGS_PER_PILE = 3;
