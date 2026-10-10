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
 * mobile crane and needs a tower crane.
 */

export type StageId = 'pael' | 'grav' | 'grus' | 'tromle' | 'stoeb' | 'rejs' | 'taarn' | 'mal';

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
  // Piles go in before the hole is dug, from level ground, the way a real pile rig works.
  pael: { id: 'pael', machine: 'pael', title: 'Bank pælene ned', scene: 'PileScene' },
  grav: { id: 'grav', machine: 'gravko', title: 'Grav hullet', scene: 'DigScene' },
  grus: { id: 'grus', machine: 'lastbil', title: 'Kør grus i hullet', scene: 'GravelScene' },
  tromle: { id: 'tromle', machine: 'vejtromle', title: 'Tril gruset fast', scene: 'RollScene' },
  stoeb: { id: 'stoeb', machine: 'betonbil', title: 'Støb fundamentet', scene: 'PourScene' },
  rejs: { id: 'rejs', machine: 'kran', title: 'Byg stålskelettet', scene: 'CraneScene' },
  // The same job as `rejs`, for a building too tall for the mobile crane.
  taarn: { id: 'taarn', machine: 'taarnkran', title: 'Byg stålskelettet', scene: 'CraneScene' },
  // Painting happens in the crane scene, on the finished frame — no machine needed.
  mal: { id: 'mal', machine: null, title: 'Mal huset', scene: 'CraneScene' },
};

/** The stages of the very first version of the game, which saves of version 1 count in. */
export const V1_STAGES: StageId[] = ['grav', 'grus', 'stoeb', 'rejs', 'mal'];

export type RoofKind = 'saddel' | 'flad';

export interface ProjectDef {
  name: string;
  /** "villaen" — for sentences such as "Den skal bruges til villaen". */
  definite: string;
  /** The stages this building goes through, in order. Always ends with painting. */
  stages: StageId[];
  /** Hole size in chunks the excavator scoops out: columns across, layers down. */
  holeCols: number;
  holeRows: number;
  /** Truckloads of gravel. */
  gravelLoads: number;
  /** Sections of foundation formwork the mixer fills. */
  pourCells: number;
  /** Steel frames the crane lifts, one per floor. The roof is one more lift. */
  floors: number;
  roof: RoofKind;
  /** Piles the pile driver banks into the ground; 0 for a building without a pile stage. */
  piles: number;
}

export const PROJECTS: ProjectDef[] = [
  {
    name: 'Det lille hus', definite: 'det lille hus',
    stages: ['grav', 'grus', 'stoeb', 'rejs', 'mal'],
    holeCols: 4, holeRows: 2, gravelLoads: 1, pourCells: 4, floors: 1, roof: 'saddel', piles: 0,
  },
  {
    name: 'Villaen', definite: 'villaen',
    stages: ['grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal'],
    holeCols: 5, holeRows: 2, gravelLoads: 2, pourCells: 5, floors: 2, roof: 'saddel', piles: 0,
  },
  {
    name: 'Butikken', definite: 'butikken',
    stages: ['pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal'],
    holeCols: 6, holeRows: 2, gravelLoads: 2, pourCells: 6, floors: 1, roof: 'flad', piles: 3,
  },
  {
    name: 'Højhuset', definite: 'højhuset',
    stages: ['pael', 'grav', 'grus', 'tromle', 'stoeb', 'taarn', 'mal'],
    holeCols: 5, holeRows: 3, gravelLoads: 2, pourCells: 5, floors: 4, roof: 'flad', piles: 4,
  },
];

/** Projects repeat once all four are built — the town keeps growing. */
export function projectAt(index: number): ProjectDef {
  return PROJECTS[index % PROJECTS.length];
}

/** A project's stages, as definitions. */
export function stagesOf(project: ProjectDef): StageDef[] {
  return project.stages.map(id => STAGE_DEFS[id]);
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

/** Plots in the town. When all are filled the child can start a new town. */
export const TOWN_PLOTS = 8;

/** Bangs of the pile driver's hammer it takes to get one pile all the way down. */
export const BANGS_PER_PILE = 3;
