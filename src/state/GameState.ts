import { PAINT } from '../config';
import { mirror, unmirror } from '../helpers/Native';
import {
  DIESEL_PER_JOB, EXTRA_SPOTS, MACHINE_IDS, MACHINES, MachineId, OIL_PER_JOB,
} from './Machines';
import {
  BANGS_PER_PILE, LANDMARKS, PROJECTS, ProjectDef, StageDef, StageId, V1_STAGES, firstUse, framePieces,
  projectAt, projectById, stagesOf, windowSpots,
} from './Projects';
import { Profile, findProfile, lastProfileId, migrateLegacySave, saveKeyFor, setLastProfile } from './Profiles';
import { CAPACITY, DEFAULT_LIVERY, LIVERIES, SHOP_ITEMS, ShopItem, UPGRADES, Upgrade, itemById } from './Shop';

/**
 * All persisted progress. The single source of truth: scenes mutate it, then redraw from it.
 *
 * Mutators that stand for a one-time achievement return a boolean, so a scene can celebrate
 * only on the transition and never on a repeated tap:
 *
 *   if (!gameState.placePart('gravko', 'bom')) return;   // already on, or machine still locked
 *   audio.clank();
 *
 * Stars are paid for one thing only: a finished building moving into the town.
 *
 * Every player has their own copy, under their own key (see state/Profiles); `profileId` says
 * whose is on the table.
 */

/**
 * Version 2 added the bigger buildings' stages, so a version 1 save counts its stage in the
 * old five-stage list and is translated on load. Version 3 gave every building its own plot
 * on a road that keeps going, and added the town's big buildings after the high-rise; an
 * older save keeps its first four buildings on their plots and its later houses further down
 * the road. Version 4 put ordinary buildings between the big ones, which moved them along
 * the road. Anything else starts fresh.
 */
const SAVE_VERSION = 4;

/** Where version 3's big buildings (its plots 4-8) stand on version 4's road. */
const V3_BIG = [4, 7, 10, 13, 16];

export interface MachineState {
  /** Parts snapped into place, in the order they went on. */
  parts: string[];
  /** 0-1. A building-site job uses DIESEL_PER_JOB. */
  diesel: number;
  /** 0-1. A building-site job uses OIL_PER_JOB. */
  oil: number;
  /** Which spots of the machine's third preparation job are done. */
  extra: boolean[];
}

export interface SiteState {
  /** Index into the current project's stages. */
  stage: number;
  /** Hole chunks scooped out, by index (column * rows + layer). */
  dug: number[];
  /** Truckloads tipped. */
  gravel: number;
  /** How flat each section of gravel has been rolled, 0-1. */
  rolled: number[];
  /** How full each section of formwork is, 0-1. */
  poured: number[];
  /** Steel frames lifted into place; floors + 1 means the roof is on too. */
  placed: number;
  /** How many times each pile has been hit; BANGS_PER_PILE drives it all the way down. */
  piles: number[];
  /** How flat each heap of earth has been pushed, 0-1. */
  planed: number[];
  /** Rocks tipped into the skip, by index. */
  rocks: number[];
  /** Blocks of the old shed knocked down. */
  wrecked: number;
  /** How much of each strip of asphalt is laid, 0-1. */
  paved: number[];
  /** Windows put in, by index into windowSpots(). */
  windows: number[];
}

export interface Building {
  /** Which project it was — decides its shape, and is the plot it stands on. */
  project: number;
  /** Paint colour, as a PAINT index. */
  color: number;
}

export interface Settings {
  sound: boolean;
  music: boolean;
}

export type NextStep =
  | { kind: 'assemble'; machine: MachineId; label: string }
  | { kind: 'prepare'; machine: MachineId; label: string }
  | { kind: 'site'; machine: MachineId | null; label: string };

class GameState {
  /** Stars to spend. */
  stars = 0;
  /** Every star ever earned. The rank ladder reads this, so spending never costs a rank. */
  earned = 0;
  machines: Record<MachineId, MachineState> = this.freshMachines();
  /** The building on the site: projectAt(project), and the plot it moves into. */
  project = 0;
  site: SiteState = this.freshSite();
  town: Building[] = [];
  settings: Settings = this.freshSettings();
  /** Star-shop items bought, by id. */
  owned: string[] = [];
  /** Which coat of paint the machines wear: a LIVERIES id. */
  livery: string = DEFAULT_LIVERY;
  /**
   * Whose town this is. Every save, load and reset goes to this player's key.
   *
   * Null only when there is nobody to be — no players yet — and then nothing is written:
   * the title screen must not invent a save for a child who has not been created.
   */
  profileId: string | null = null;

  constructor() {
    // A save from before profiles becomes the first player's before anything reads it.
    migrateLegacySave();
    // Until somebody taps a card, wear whoever played last: their sound and music settings
    // are what the title screen should obey.
    this.profileId = lastProfileId();
    this.load();
  }

  /* ---------------------------------------------------------------- fresh shapes --- */

  private freshMachine(): MachineState {
    return { parts: [], diesel: 0, oil: 0, extra: Array(EXTRA_SPOTS).fill(false) };
  }

  private freshMachines(): Record<MachineId, MachineState> {
    const machines = {} as Record<MachineId, MachineState>;
    for (const id of MACHINE_IDS) machines[id] = this.freshMachine();
    return machines;
  }

  private freshSite(): SiteState {
    return {
      stage: 0, dug: [], gravel: 0, rolled: [], poured: [], placed: 0, piles: [],
      planed: [], rocks: [], wrecked: 0, paved: [], windows: [],
    };
  }

  private freshSettings(): Settings {
    return { sound: true, music: true };
  }

  /* ------------------------------------------------------------------- machines --- */

  isBuilt(id: MachineId): boolean {
    return this.machines[id].parts.length === MACHINES[id].parts.length;
  }

  hasPart(id: MachineId, part: string): boolean {
    return this.machines[id].parts.includes(part);
  }

  /**
   * Whether a machine can be worked on in the workshop yet.
   *
   * Machines unlock as the site first needs them: on the first building the excavator first,
   * the truck once the hole is dug, and so on; the road roller with the villa, the pile
   * driver with the shop and the tower crane with the high-rise. Seven silhouettes to choose
   * from when only one of them has a job to do just confused a five-year-old. A machine that
   * is already built stays open, and once a building has used a machine it stays open too.
   */
  isUnlocked(id: MachineId): boolean {
    if (this.isBuilt(id)) return true;
    const first = firstUse(id);
    if (!first) return false;
    if (this.project !== first.project) return this.project > first.project;
    return first.stage <= this.site.stage;
  }

  /** The building a locked machine is waiting for — what its padlock says. */
  neededFor(id: MachineId): ProjectDef | null {
    const first = firstUse(id);
    return first ? projectAt(first.project) : null;
  }

  /** Whether a part may snap on now: the machine is open, and the part is not on yet. */
  canPlace(id: MachineId, part: string): boolean {
    if (!this.isUnlocked(id)) return false;
    return MACHINES[id].parts.some(p => p.id === part) && !this.hasPart(id, part);
  }

  placePart(id: MachineId, part: string): boolean {
    if (!this.canPlace(id, part)) return false;
    this.machines[id].parts.push(part);
    this.save();
    return true;
  }

  /** What a machine still needs before it can go to work. */
  needs(id: MachineId): { diesel: boolean; oil: boolean; extra: boolean } {
    const m = this.machines[id];
    return {
      diesel: m.diesel < DIESEL_PER_JOB - 1e-6,
      oil: m.oil < OIL_PER_JOB - 1e-6,
      extra: m.extra.some(done => !done),
    };
  }

  isReady(id: MachineId): boolean {
    if (!this.isBuilt(id)) return false;
    const n = this.needs(id);
    return !n.diesel && !n.oil && !n.extra;
  }

  /**
   * Pours into a tank. Called every frame while the nozzle is held over the filler cap, so
   * it does not write the save itself except on the frame the tank becomes full; the scene
   * calls save() when the nozzle is let go. Returns true on exactly that frame.
   */
  fill(id: MachineId, what: 'diesel' | 'oil', amount: number): boolean {
    const m = this.machines[id];
    if (m[what] >= 1) return false;
    m[what] = Math.min(1, m[what] + amount);
    if (m[what] >= 1) {
      this.save();
      return true;
    }
    return false;
  }

  doExtra(id: MachineId, spot: number): boolean {
    const m = this.machines[id];
    if (spot < 0 || spot >= m.extra.length || m.extra[spot]) return false;
    m.extra[spot] = true;
    this.save();
    return true;
  }

  /* ------------------------------------------------------------------ upgrades --- */

  /** How many of a machine's upgrades have been bought: 0, 1 or 2. */
  level(id: MachineId): number {
    let n = 0;
    while (n < 2 && UPGRADES.some(u => u.machine === id && u.level === n + 1 && this.owns(u.id))) n++;
    return n;
  }

  /** How many times as much a machine does at a time: 1, 2 or 4. */
  capacity(id: MachineId): number {
    return CAPACITY[this.level(id)];
  }

  /* ----------------------------------------------------------------- the project --- */

  get currentProject(): ProjectDef {
    return projectAt(this.project);
  }

  /** The current building's stages. */
  get stages(): StageDef[] {
    return stagesOf(this.currentProject);
  }

  get stage(): StageDef {
    const stages = this.stages;
    return stages[Math.min(this.site.stage, stages.length - 1)];
  }

  /** Whether the current building has been through a stage already. False if it has none. */
  isPast(id: StageId): boolean {
    const i = this.currentProject.stages.indexOf(id);
    return i >= 0 && i < this.site.stage;
  }

  /** Whether one of the town's own buildings (by its id, "busstation") stands in the town. */
  hasBuilt(projectId: string): boolean {
    const p = projectById(projectId);
    return !!p && this.town.some(b => b.project === p.index);
  }

  /** The building standing on a plot, if any. */
  buildingAt(plot: number): Building | null {
    return this.town.find(b => b.project === plot) ?? null;
  }

  /** The first plot with nothing on it: where the next building goes. */
  private firstFreePlot(): number {
    let i = 0;
    while (this.town.some(b => b.project === i)) i++;
    return i;
  }

  /** Whether everything the town was waiting for is built: the road goes on with houses. */
  get landmarksDone(): boolean {
    return PROJECTS.every(p => this.town.some(b => b.project === p.index));
  }

  /**
   * One hit of the pile driver's hammer. True on the hit that drives the pile all the way in.
   * A heavier weight drives it further each time.
   */
  bang(pile: number): boolean {
    const n = this.currentProject.piles;
    if (this.stage.id !== 'pael' || pile < 0 || pile >= n) return false;
    while (this.site.piles.length < n) this.site.piles.push(0);
    if (this.site.piles[pile] >= BANGS_PER_PILE) return false;
    this.site.piles[pile] = Math.min(BANGS_PER_PILE, this.site.piles[pile] + this.capacity('pael'));
    this.save();
    return this.site.piles[pile] >= BANGS_PER_PILE;
  }

  get pilesDone(): boolean {
    const n = this.currentProject.piles;
    return this.site.piles.length >= n && this.site.piles.slice(0, n).every(b => b >= BANGS_PER_PILE);
  }

  /** Scoops one chunk of earth. Only the top chunk left in a column can be reached. */
  canDig(chunk: number): boolean {
    const { holeCols, holeRows } = this.currentProject;
    if (chunk < 0 || chunk >= holeCols * holeRows || this.site.dug.includes(chunk)) return false;
    const layer = chunk % holeRows;
    const col = Math.floor(chunk / holeRows);
    for (let l = 0; l < layer; l++) {
      if (!this.site.dug.includes(col * holeRows + l)) return false;
    }
    return true;
  }

  dig(chunk: number): boolean {
    if (this.stage.id !== 'grav' || !this.canDig(chunk)) return false;
    this.site.dug.push(chunk);
    this.save();
    return true;
  }

  /**
   * One bucketful: the chunk the teeth bit into, and as many more as a bigger bucket holds —
   * the nearest ones it can reach, down the same column first. Returns what was dug.
   */
  scoop(chunk: number): number[] {
    if (!this.dig(chunk)) return [];
    const got = [chunk];
    const { holeCols, holeRows } = this.currentProject;
    const col0 = Math.floor(chunk / holeRows);
    const room = this.capacity('gravko');
    while (got.length < room) {
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < holeCols * holeRows; i++) {
        if (!this.canDig(i)) continue;
        const score = Math.abs(Math.floor(i / holeRows) - col0) * 10 + (i % holeRows);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      if (best < 0 || !this.dig(best)) break;
      got.push(best);
    }
    return got;
  }

  get holeDug(): boolean {
    const { holeCols, holeRows } = this.currentProject;
    return this.site.dug.length >= holeCols * holeRows;
  }

  /** Loads one trip of the truck brings: more with a bigger bed, never more than is needed. */
  get gravelPerTrip(): number {
    return Math.max(1, Math.min(this.capacity('lastbil'), this.currentProject.gravelLoads - this.site.gravel));
  }

  tipGravel(): boolean {
    if (this.stage.id !== 'grus' || this.gravelDone) return false;
    this.site.gravel = Math.min(this.currentProject.gravelLoads, this.site.gravel + this.gravelPerTrip);
    this.save();
    return true;
  }

  get gravelDone(): boolean {
    return this.site.gravel >= this.currentProject.gravelLoads;
  }

  /**
   * The roller's drum going over one section of gravel. Called every frame while it rolls,
   * so like `fill` it writes the save only on the frame the section is flat, and returns
   * true on exactly that frame.
   */
  roll(cell: number, amount: number): boolean {
    const cells = this.currentProject.pourCells;
    if (this.stage.id !== 'tromle' || cell < 0 || cell >= cells) return false;
    while (this.site.rolled.length < cells) this.site.rolled.push(0);
    if (this.site.rolled[cell] >= 1) return false;
    this.site.rolled[cell] = Math.min(1, this.site.rolled[cell] + amount * this.capacity('vejtromle'));
    if (this.site.rolled[cell] >= 1) {
      this.save();
      return true;
    }
    return false;
  }

  get gravelRolled(): boolean {
    const cells = this.currentProject.pourCells;
    return this.site.rolled.length >= cells && this.site.rolled.slice(0, cells).every(f => f >= 1);
  }

  /** Concrete into one section of formwork. Returns true on the frame it becomes full. */
  pour(cell: number, amount: number): boolean {
    const cells = this.currentProject.pourCells;
    if (this.stage.id !== 'stoeb' || cell < 0 || cell >= cells) return false;
    while (this.site.poured.length < cells) this.site.poured.push(0);
    if (this.site.poured[cell] >= 1) return false;
    this.site.poured[cell] = Math.min(1, this.site.poured[cell] + amount * this.capacity('betonbil'));
    if (this.site.poured[cell] >= 1) {
      this.save();
      return true;
    }
    return false;
  }

  get foundationPoured(): boolean {
    const cells = this.currentProject.pourCells;
    return this.site.poured.length >= cells && this.site.poured.slice(0, cells).every(f => f >= 1);
  }

  /**
   * How many pieces the crane lifts in one go: one frame, or with a stronger hook two or four
   * at once, stacked — never more than are left.
   */
  get liftCount(): number {
    const id = this.stage.id;
    const crane: MachineId = id === 'taarn' ? 'taarnkran' : 'kran';
    const left = framePieces(this.currentProject) - this.site.placed;
    return Math.max(1, Math.min(this.capacity(crane), left));
  }

  /** The next steel frame (or the roof), or the next few, lifted into place by either crane. */
  placePiece(): boolean {
    const id = this.stage.id;
    if ((id !== 'rejs' && id !== 'taarn') || this.frameDone) return false;
    this.site.placed = Math.min(framePieces(this.currentProject), this.site.placed + this.liftCount);
    this.save();
    return true;
  }

  get frameDone(): boolean {
    return this.site.placed >= framePieces(this.currentProject);
  }

  /**
   * The bulldozer's blade going over one heap of earth. Called every frame while it pushes,
   * so like `roll` it writes the save only on the frame the heap is flat, and returns true on
   * exactly that frame.
   */
  plane(mound: number, amount: number): boolean {
    const n = this.currentProject.mounds;
    if (this.stage.id !== 'planer' || mound < 0 || mound >= n) return false;
    while (this.site.planed.length < n) this.site.planed.push(0);
    if (this.site.planed[mound] >= 1) return false;
    this.site.planed[mound] = Math.min(1, this.site.planed[mound] + amount * this.capacity('bulldozer'));
    if (this.site.planed[mound] >= 1) {
      this.save();
      return true;
    }
    return false;
  }

  get groundFlat(): boolean {
    const n = this.currentProject.mounds;
    return this.site.planed.length >= n && this.site.planed.slice(0, n).every(f => f >= 1);
  }

  /** Whether a rock still lies on the plot (not yet tipped in the skip). */
  rockLeft(rock: number): boolean {
    return rock >= 0 && rock < this.currentProject.rocks && !this.site.rocks.includes(rock);
  }

  /** Rocks the wheel loader's bucket holds at once. */
  get bucketRocks(): number {
    return this.capacity('laesser');
  }

  /** The loader's bucketful tipped into the skip. True if any rock was new. */
  dumpRocks(rocks: number[]): boolean {
    if (this.stage.id !== 'sten') return false;
    const fresh = [...new Set(rocks)].filter(r => this.rockLeft(r));
    if (!fresh.length) return false;
    this.site.rocks.push(...fresh);
    this.save();
    return true;
  }

  get rocksCleared(): boolean {
    const n = this.currentProject.rocks;
    return Array.from({ length: n }, (_, i) => i).every(i => this.site.rocks.includes(i));
  }

  /** One swing of the wrecking ball into the shed. Returns how many blocks came down. */
  wreck(): number {
    const n = this.currentProject.shed;
    if (this.stage.id !== 'riv' || this.site.wrecked >= n) return 0;
    const down = Math.min(this.capacity('nedriv'), n - this.site.wrecked);
    this.site.wrecked += down;
    this.save();
    return down;
  }

  get shedDown(): boolean {
    return this.site.wrecked >= this.currentProject.shed;
  }

  /** The paver laying asphalt on one strip. True on the frame the strip is done. */
  pave(cell: number, amount: number): boolean {
    const n = this.currentProject.asphalt;
    if (this.stage.id !== 'asfalt' || cell < 0 || cell >= n) return false;
    while (this.site.paved.length < n) this.site.paved.push(0);
    if (this.site.paved[cell] >= 1) return false;
    this.site.paved[cell] = Math.min(1, this.site.paved[cell] + amount * this.capacity('asfalt'));
    if (this.site.paved[cell] >= 1) {
      this.save();
      return true;
    }
    return false;
  }

  get asphaltLaid(): boolean {
    const n = this.currentProject.asphalt;
    return this.site.paved.length >= n && this.site.paved.slice(0, n).every(f => f >= 1);
  }

  /**
   * A window put in from the lift's basket, and with a bigger basket the ones beside it on the
   * same floor. Returns the windows that went in.
   */
  putWindow(spot: number): number[] {
    const spots = windowSpots(this.currentProject);
    if (this.stage.id !== 'vinduer' || spot < 0 || spot >= spots.length || this.site.windows.includes(spot)) return [];
    const got = [spot];
    const floor = spots[spot].floor;
    const near = spots
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.floor === floor && i !== spot && !this.site.windows.includes(i))
      .sort((a, b) => Math.abs(a.s.slot - spots[spot].slot) - Math.abs(b.s.slot - spots[spot].slot));
    for (const { i } of near) {
      if (got.length >= this.capacity('lift')) break;
      got.push(i);
    }
    this.site.windows.push(...got);
    this.save();
    return got;
  }

  get windowsIn(): boolean {
    return this.site.windows.length >= windowSpots(this.currentProject).length;
  }

  /** Whether the current stage's own work is finished and it can be signed off. */
  get stageWorkDone(): boolean {
    switch (this.stage.id) {
      case 'riv': return this.shedDown;
      case 'sten': return this.rocksCleared;
      case 'planer': return this.groundFlat;
      case 'vinduer': return this.windowsIn;
      case 'asfalt': return this.asphaltLaid;
      case 'pael': return this.pilesDone;
      case 'grav': return this.holeDug;
      case 'grus': return this.gravelDone;
      case 'tromle': return this.gravelRolled;
      case 'stoeb': return this.foundationPoured;
      case 'rejs':
      case 'taarn': return this.frameDone;
      case 'mal': return false;
    }
  }

  /**
   * Signs off a finished stage: the machine that did it has used some diesel and oil, and
   * the site moves on to the next stage. Returns false if the work is not actually done.
   */
  completeStage(): boolean {
    if (!this.stageWorkDone) return false;
    const machine = this.stage.machine;
    if (machine) {
      const m = this.machines[machine];
      m.diesel = Math.max(0, m.diesel - DIESEL_PER_JOB);
      m.oil = Math.max(0, m.oil - OIL_PER_JOB);
    }
    this.site.stage = Math.min(this.site.stage + 1, this.stages.length - 1);
    this.save();
    return true;
  }

  /** Whether a house colour is in the paint shelf: one of the first six, or bought. */
  hasPaint(color: number): boolean {
    const paint = PAINT[color];
    return !!paint && (!paint.item || this.owns(paint.item));
  }

  /**
   * Paints the finished building and moves it onto its plot in the town. The next project
   * starts at once, so there is always something waiting on the site. Returns the plot.
   *
   * The town never fills up: after the town's own buildings the road keeps going with houses.
   * Stars are paid by the scene, from the building's own `stars`.
   */
  paint(color: number): number {
    if (this.stage.id !== 'mal' || !this.hasPaint(color)) return -1;
    const plot = this.project;
    this.town = this.town.filter(b => b.project !== plot);
    this.town.push({ project: plot, color });
    this.town.sort((a, b) => a.project - b.project);
    this.project = this.firstFreePlot();
    this.site = this.freshSite();
    this.save();
    return plot;
  }

  /**
   * The one thing the child should do next.
   *
   * The town screen turns this into a pointing sign, so a five-year-old never has to work
   * out the order of things: build the machine, fill it up, go to work.
   */
  nextStep(): NextStep {
    const stage = this.stage;
    const machine = stage.machine;
    if (!machine) return { kind: 'site', machine: null, label: 'Mal huset!' };
    const def = MACHINES[machine];
    if (!this.isBuilt(machine)) {
      return { kind: 'assemble', machine, label: `Byg ${def.name.toLowerCase()}` };
    }
    if (!this.isReady(machine)) {
      return { kind: 'prepare', machine, label: `Gør ${def.name.toLowerCase()} klar` };
    }
    return { kind: 'site', machine, label: stage.title };
  }

  /* ------------------------------------------------------------------- the shop --- */

  owns(id: string): boolean {
    return this.owned.includes(id);
  }

  canAfford(cost: number): boolean {
    return this.stars >= cost;
  }

  /**
   * Whether a shop item can be bought yet: a vehicle once its building stands in the town, an
   * upgrade once its machine is built and the one before it is bought.
   */
  isAvailable(item: ShopItem): boolean {
    if (item.needs && !this.hasBuilt(item.needs)) return false;
    const up = item as Upgrade;
    if (up.machine) {
      if (!this.isBuilt(up.machine)) return false;
      if (up.level > 1 && this.level(up.machine) < up.level - 1) return false;
    }
    return true;
  }

  /** What the child could buy right now: for sale, not bought, and enough stars. */
  get affordable(): ShopItem[] {
    return SHOP_ITEMS.filter(i => !this.owns(i.id) && this.isAvailable(i) && this.canAfford(i.cost));
  }

  /**
   * Spends stars on a shop item. False if it is unknown, already bought, not for sale yet or
   * too dear — nothing is spent then. Only the balance goes down; `earned`, and with it the
   * rank, stays where it was.
   */
  buy(id: string): boolean {
    const item = itemById(id);
    if (!item || this.owns(id) || !this.isAvailable(item) || this.stars < item.cost) return false;
    this.stars -= item.cost;
    this.owned.push(id);
    // a new coat of paint goes straight on: that is what the child just paid for
    if (LIVERIES.some(l => l.id === id)) this.livery = id;
    this.save();
    return true;
  }

  /** Puts a coat of paint on the machines. Only yellow, or one that has been bought. */
  setLivery(id: string): boolean {
    if (id !== DEFAULT_LIVERY && !this.owns(id)) return false;
    if (!LIVERIES.some(l => l.id === id) || this.livery === id) return false;
    this.livery = id;
    this.save();
    return true;
  }

  /* ----------------------------------------------------------------- the rest --- */

  addStars(count = 1): void {
    this.stars += count;
    this.earned += count;
    this.save();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    this.save();
  }

  /* ------------------------------------------------------------- persistence --- */

  /** The active player's save key; null before there is anyone to save for. */
  private get saveKey(): string | null {
    return this.profileId ? saveKeyFor(this.profileId) : null;
  }

  /** The active player's name and face, or null before anyone has been created. */
  get profile(): Profile | null {
    return findProfile(this.profileId);
  }

  /**
   * Makes `id` the player whose town this is, and puts their town on the table.
   *
   * Memory is emptied first: `load()` only fills in what a save has, so a player with no
   * save yet would otherwise sit down in the previous child's town.
   */
  loadProfile(id: string | null): void {
    this.profileId = id;
    this.clear();
    this.load();
    if (id) setLastProfile(id);
  }

  /**
   * "Start forfra": this player's machines, town, stars and shopping go back to the
   * beginning. Their sound settings stay — a parent who turned the music off meant it.
   * Nobody else's town is touched.
   */
  reset(): void {
    const settings = this.settings;
    this.clear();
    this.settings = settings;
    const key = this.saveKey;
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // localStorage may be unavailable; the in-memory reset is still correct
    }
    // or the native copy would put the old town back the next time web storage is lost
    unmirror(key);
    this.save();
  }

  /** An empty game in memory. Touches nothing on disk. */
  private clear(): void {
    this.stars = 0;
    this.earned = 0;
    this.machines = this.freshMachines();
    this.project = 0;
    this.site = this.freshSite();
    this.town = [];
    this.settings = this.freshSettings();
    this.owned = [];
    this.livery = DEFAULT_LIVERY;
  }

  save(): void {
    const key = this.saveKey;
    if (!key) return;

    const json = JSON.stringify({
      version: SAVE_VERSION,
      stars: this.stars,
      earned: this.earned,
      machines: this.machines,
      project: this.project,
      site: this.site,
      town: this.town,
      settings: this.settings,
      owned: this.owned,
      livery: this.livery,
    });

    try {
      localStorage.setItem(key, json);
    } catch {
      // private browsing or a full quota — the game still plays, it just will not persist
    }

    // On Android the same bytes also go to native storage. No-op in a browser.
    mirror(key, json);
  }

  load(): void {
    const key = this.saveKey;
    if (!key) return;

    let data: Record<string, any> | null = null;
    try {
      const raw = localStorage.getItem(key);
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!data || ![1, 2, 3, SAVE_VERSION].includes(data.version)) return;

    const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
    const clamp01 = (v: unknown) => Math.min(1, Math.max(0, num(v, 0)));
    const count = (v: unknown) => Math.max(0, Math.floor(num(v, 0)));

    this.stars = Math.max(0, num(data.stars, 0));
    // Before the shop, every star earned was a star in hand.
    this.earned = Math.max(this.stars, num(data.earned, this.stars));
    const savedProject = count(data.project);
    this.project = savedProject;

    // Each machine is restored field by field, keeping only parts that still exist, so a
    // renamed part cannot leave a machine that is "built" with a piece missing.
    const machines = this.freshMachines();
    for (const id of MACHINE_IDS) {
      const saved = data.machines?.[id];
      if (!saved) continue;
      const known = new Set(MACHINES[id].parts.map(p => p.id));
      const parts: string[] = Array.isArray(saved.parts)
        ? saved.parts.filter((p: unknown) => known.has(p as string))
        : [];
      machines[id] = {
        parts: [...new Set(parts)],
        diesel: clamp01(saved.diesel),
        oil: clamp01(saved.oil),
        extra: Array.from({ length: EXTRA_SPOTS }, (_, i) => saved.extra?.[i] === true),
      };
    }
    this.machines = machines;

    const savedTown: Building[] = Array.isArray(data.town)
      ? data.town
        .filter((b: any) => b && typeof b.project === 'number' && typeof b.color === 'number')
        .map((b: Building) => ({ project: count(b.project), color: PAINT[b.color] ? b.color : 0 }))
      : [];

    // Before version 3 the four buildings came round again and again, and a full town of
    // eight started over. Now every building has its own plot, so an older town is laid out
    // on the new road: the first four where they belong, counting as built even if a new
    // town had swept them away, and every house after them further down the road, past the
    // town's big buildings, which come next.
    const old = data.version === 1 || data.version === 2;
    // Version 3 had the big buildings straight after one another; version 4 put ordinary
    // buildings between them. The same building moves to its new plot, and a house after the
    // hospital to the same place in the houses after the new hospital.
    const v3plot = (j: number) => (j < 4 ? j : j <= 8 ? V3_BIG[j - 4] : LANDMARKS + j - 9);
    if (data.version === 3) {
      this.project = v3plot(savedProject);
      const town = new Map<number, Building>();
      for (const b of savedTown) town.set(v3plot(b.project), { project: v3plot(b.project), color: b.color });
      this.town = [...town.values()];
    } else if (old) {
      const town = new Map<number, Building>();
      for (const b of savedTown) {
        const plot = b.project < 4 ? b.project : LANDMARKS + b.project - 4;
        town.set(plot, { project: plot, color: b.color });
      }
      for (let i = 0; i < Math.min(savedProject, 4); i++) {
        if (town.has(i)) continue;
        // swept away by a new town: it was built, in the colour its later twin got if any
        const twin = savedTown.find(b => b.project % 4 === i);
        town.set(i, { project: i, color: twin?.color ?? i });
      }
      this.town = [...town.values()];
    } else {
      const town = new Map<number, Building>();
      for (const b of savedTown) town.set(b.project, b);
      this.town = [...town.values()];
    }
    this.town.sort((a, b) => a.project - b.project);
    // An old save already past the first four starts afresh on the bus station, and a
    // version 3 one on a house after the hospital, whose jobs have changed, starts it afresh.
    const resumes = old ? savedProject < 4 : data.version !== 3 || savedProject <= 8;
    if (!resumes || this.town.some(b => b.project === this.project)) this.project = this.firstFreePlot();

    const site = resumes ? data.site ?? {} : {};
    const stages = this.currentProject.stages;
    let stage = count(site.stage);
    if (data.version === 1) {
      // Version 1 counted in the old five stages. Find the same stage in this building's
      // list; anything the bigger buildings added before it counts as done.
      const old = V1_STAGES[Math.min(stage, V1_STAGES.length - 1)];
      const same = old === 'rejs' && !stages.includes('rejs') ? 'taarn' : old;
      stage = Math.max(0, stages.indexOf(same));
    }
    const nums = (v: unknown, f: (n: unknown) => number) => (Array.isArray(v) ? v.map(f) : []);
    const ints = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => typeof n === 'number'))] : []);
    this.site = {
      stage: Math.min(stages.length - 1, stage),
      dug: Array.isArray(site.dug) ? site.dug.filter((n: unknown) => typeof n === 'number') : [],
      gravel: count(site.gravel),
      rolled: nums(site.rolled, clamp01),
      poured: nums(site.poured, clamp01),
      placed: count(site.placed),
      piles: nums(site.piles, (b: unknown) => Math.min(BANGS_PER_PILE, count(b))),
      planed: nums(site.planed, clamp01),
      rocks: ints(site.rocks),
      wrecked: count(site.wrecked),
      paved: nums(site.paved, clamp01),
      windows: ints(site.windows),
    };

    this.owned = Array.isArray(data.owned)
      ? [...new Set((data.owned as unknown[]).filter((id): id is string => typeof id === 'string' && !!itemById(id)))]
      : [];
    this.livery = typeof data.livery === 'string' && (data.livery === DEFAULT_LIVERY || this.owned.includes(data.livery))
      ? data.livery
      : DEFAULT_LIVERY;

    const settings = data.settings ?? {};
    this.settings = {
      sound: typeof settings.sound === 'boolean' ? settings.sound : true,
      music: typeof settings.music === 'boolean' ? settings.music : true,
    };
  }
}

export const gameState = new GameState();
