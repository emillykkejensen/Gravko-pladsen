import type { MachineId } from './Machines';

/**
 * What gets built, and in which order.
 *
 * Every building goes through the same four stages, because that is how a real one goes up
 * and because it gives each machine its own job: the excavator digs the hole, the truck
 * lays gravel in the bottom, the mixer pours the foundation and the crane lifts the steel
 * frame onto it. The child then paints it, and it moves into the town.
 *
 * Projects differ in size, not in kind — a bigger hole, more concrete, more floors — so the
 * fourth building asks for more of the same skills rather than new rules.
 */

export type StageId = 'grav' | 'grus' | 'stoeb' | 'rejs' | 'mal';

export interface StageDef {
  id: StageId;
  /** The machine that does it, or null for painting. */
  machine: MachineId | null;
  /** Title on the building-site screen. */
  title: string;
  /** The scene that plays it. */
  scene: string;
}

export const STAGES: StageDef[] = [
  { id: 'grav', machine: 'gravko', title: 'Grav hullet', scene: 'DigScene' },
  { id: 'grus', machine: 'lastbil', title: 'Kør grus i hullet', scene: 'GravelScene' },
  { id: 'stoeb', machine: 'betonbil', title: 'Støb fundamentet', scene: 'PourScene' },
  { id: 'rejs', machine: 'kran', title: 'Byg stålskelettet', scene: 'CraneScene' },
  // Painting happens in the crane scene, on the finished frame — no machine needed.
  { id: 'mal', machine: null, title: 'Mal huset', scene: 'CraneScene' },
];

export type RoofKind = 'saddel' | 'flad';

export interface ProjectDef {
  name: string;
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
}

export const PROJECTS: ProjectDef[] = [
  { name: 'Det lille hus', holeCols: 4, holeRows: 2, gravelLoads: 1, pourCells: 4, floors: 1, roof: 'saddel' },
  { name: 'Villaen', holeCols: 5, holeRows: 2, gravelLoads: 2, pourCells: 5, floors: 2, roof: 'saddel' },
  { name: 'Butikken', holeCols: 6, holeRows: 2, gravelLoads: 2, pourCells: 6, floors: 1, roof: 'flad' },
  { name: 'Højhuset', holeCols: 5, holeRows: 3, gravelLoads: 2, pourCells: 5, floors: 4, roof: 'flad' },
];

/** Projects repeat once all four are built — the town keeps growing. */
export function projectAt(index: number): ProjectDef {
  return PROJECTS[index % PROJECTS.length];
}

/** Plots in the town. When all are filled the child can start a new town. */
export const TOWN_PLOTS = 8;
