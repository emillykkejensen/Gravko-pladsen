import { PAINT } from '../config';
import { mirror, unmirror } from '../helpers/Native';
import {
  DIESEL_PER_JOB, EXTRA_SPOTS, MACHINE_IDS, MACHINES, MachineId, OIL_PER_JOB,
} from './Machines';
import {
  BANGS_PER_PILE, ProjectDef, StageDef, StageId, TOWN_PLOTS, V1_STAGES, firstUse, projectAt, stagesOf,
} from './Projects';
import { Profile, findProfile, lastProfileId, migrateLegacySave, saveKeyFor, setLastProfile } from './Profiles';
import { DEFAULT_LIVERY, LIVERIES, itemById } from './Shop';

/**
 * All persisted progress. The single source of truth: scenes mutate it, then redraw from it.
 *
 * Mutators that stand for a one-time achievement return a boolean, so a scene can pay a
 * star only on the transition and never on a repeated tap:
 *
 *   if (!gameState.placePart('gravko', 'bom')) return;   // already on, or machine still locked
 *   award(this);
 *
 * Every player has their own copy, under their own key (see state/Profiles); `profileId` says
 * whose is on the table.
 */

/**
 * Version 2 added the bigger buildings' stages, so a version 1 save counts its stage in the
 * old five-stage list and is translated on load. Anything else starts fresh.
 */
const SAVE_VERSION = 2;

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
}

export interface Building {
  /** Which project it was — decides its shape. */
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
  /** How many buildings have been started — the current one is projectAt(project). */
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
    return { stage: 0, dug: [], gravel: 0, rolled: [], poured: [], placed: 0, piles: [] };
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

  get townFull(): boolean {
    return this.town.length >= TOWN_PLOTS;
  }

  /** One hit of the pile driver's hammer. True on the hit that drives the pile all the way in. */
  bang(pile: number): boolean {
    const n = this.currentProject.piles;
    if (this.stage.id !== 'pael' || pile < 0 || pile >= n) return false;
    while (this.site.piles.length < n) this.site.piles.push(0);
    if (this.site.piles[pile] >= BANGS_PER_PILE) return false;
    this.site.piles[pile]++;
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

  get holeDug(): boolean {
    const { holeCols, holeRows } = this.currentProject;
    return this.site.dug.length >= holeCols * holeRows;
  }

  tipGravel(): boolean {
    if (this.stage.id !== 'grus' || this.gravelDone) return false;
    this.site.gravel++;
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
    this.site.rolled[cell] = Math.min(1, this.site.rolled[cell] + amount);
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
    this.site.poured[cell] = Math.min(1, this.site.poured[cell] + amount);
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

  /** The next steel frame (or the roof) lifted into place, by either crane. */
  placePiece(): boolean {
    const id = this.stage.id;
    if ((id !== 'rejs' && id !== 'taarn') || this.frameDone) return false;
    this.site.placed++;
    this.save();
    return true;
  }

  get frameDone(): boolean {
    return this.site.placed >= this.currentProject.floors + 1;
  }

  /** Whether the current stage's own work is finished and it can be signed off. */
  get stageWorkDone(): boolean {
    switch (this.stage.id) {
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
   * Paints the finished building and moves it into the town. The next project starts at
   * once, so there is always a hole waiting to be dug. Returns the plot it went to.
   *
   * A full town starts over with this building as the first in a new one — the finished
   * town has already had its celebration, and a child should never be told there is no
   * room for the house they just built.
   */
  paint(color: number): number {
    if (this.stage.id !== 'mal' || !this.hasPaint(color)) return -1;
    if (this.townFull) this.town = [];
    this.town.push({ project: this.project, color });
    this.project++;
    this.site = this.freshSite();
    this.save();
    return this.town.length - 1;
  }

  /** Clears the town for a fresh one. Machines, stars and the project count stay. */
  newTown(): void {
    this.town = [];
    this.save();
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
   * Spends stars on a shop item. False if it is unknown, already bought or too dear —
   * nothing is spent then. Only the balance goes down; `earned`, and with it the rank,
   * stays where it was.
   */
  buy(id: string): boolean {
    const item = itemById(id);
    if (!item || this.owns(id) || this.stars < item.cost) return false;
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
    if (!data || (data.version !== 1 && data.version !== SAVE_VERSION)) return;

    const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
    const clamp01 = (v: unknown) => Math.min(1, Math.max(0, num(v, 0)));
    const count = (v: unknown) => Math.max(0, Math.floor(num(v, 0)));

    this.stars = Math.max(0, num(data.stars, 0));
    // Before the shop, every star earned was a star in hand.
    this.earned = Math.max(this.stars, num(data.earned, this.stars));
    this.project = count(data.project);

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

    const site = data.site ?? {};
    const stages = this.currentProject.stages;
    let stage = count(site.stage);
    if (data.version === 1) {
      // Version 1 counted in the old five stages. Find the same stage in this building's
      // list; anything the bigger buildings added before it counts as done.
      const old = V1_STAGES[Math.min(stage, V1_STAGES.length - 1)];
      const same = old === 'rejs' && !stages.includes('rejs') ? 'taarn' : old;
      stage = Math.max(0, stages.indexOf(same));
    }
    this.site = {
      stage: Math.min(stages.length - 1, stage),
      dug: Array.isArray(site.dug) ? site.dug.filter((n: unknown) => typeof n === 'number') : [],
      gravel: count(site.gravel),
      rolled: Array.isArray(site.rolled) ? site.rolled.map(clamp01) : [],
      poured: Array.isArray(site.poured) ? site.poured.map(clamp01) : [],
      placed: count(site.placed),
      piles: Array.isArray(site.piles)
        ? site.piles.map((b: unknown) => Math.min(BANGS_PER_PILE, count(b)))
        : [],
    };

    this.town = Array.isArray(data.town)
      ? data.town
        .filter((b: any) => b && typeof b.project === 'number' && typeof b.color === 'number')
        .map((b: Building) => ({ project: count(b.project), color: PAINT[b.color] ? b.color : 0 }))
        .slice(0, TOWN_PLOTS)
      : [];

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
