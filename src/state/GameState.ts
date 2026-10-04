import { mirrorSave } from '../helpers/Native';
import {
  DIESEL_PER_JOB, EXTRA_SPOTS, MACHINE_IDS, MACHINES, MachineId, OIL_PER_JOB,
} from './Machines';
import { ProjectDef, STAGES, StageDef, TOWN_PLOTS, projectAt } from './Projects';

/**
 * All persisted progress. The single source of truth: scenes mutate it, then redraw from it.
 *
 * Mutators that stand for a one-time achievement return a boolean, so a scene can pay a
 * star only on the transition and never on a repeated tap:
 *
 *   if (!gameState.placePart('gravko', 'bom')) return;   // already on, or nothing to sit on
 *   award(this);
 */

export const SAVE_KEY = 'gravko-spil-save';
const SAVE_VERSION = 1;

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
  /** Index into STAGES. */
  stage: number;
  /** Hole chunks scooped out, by index (column * rows + layer). */
  dug: number[];
  /** Truckloads tipped. */
  gravel: number;
  /** How full each section of formwork is, 0-1. */
  poured: number[];
  /** Steel frames lifted into place; floors + 1 means the roof is on too. */
  placed: number;
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
  stars = 0;
  machines: Record<MachineId, MachineState> = this.freshMachines();
  /** How many buildings have been started — the current one is projectAt(project). */
  project = 0;
  site: SiteState = this.freshSite();
  town: Building[] = [];
  settings: Settings = this.freshSettings();

  constructor() {
    this.load();
  }

  /* ---------------------------------------------------------------- fresh shapes --- */

  private freshMachine(): MachineState {
    // A new machine comes with a little in the tank — enough to show the gauge is a gauge,
    // not enough to skip filling it.
    return { parts: [], diesel: 0, oil: 0, extra: Array(EXTRA_SPOTS).fill(false) };
  }

  private freshMachines(): Record<MachineId, MachineState> {
    return {
      gravko: this.freshMachine(),
      lastbil: this.freshMachine(),
      betonbil: this.freshMachine(),
      kran: this.freshMachine(),
    };
  }

  private freshSite(): SiteState {
    return { stage: 0, dug: [], gravel: 0, poured: [], placed: 0 };
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

  /** Whether a part may snap on now: not already on, and whatever it sits on is. */
  canPlace(id: MachineId, part: string): boolean {
    const def = MACHINES[id].parts.find(p => p.id === part);
    if (!def || this.hasPart(id, part)) return false;
    return def.needs.every(n => this.hasPart(id, n));
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

  get stage(): StageDef {
    return STAGES[Math.min(this.site.stage, STAGES.length - 1)];
  }

  get townFull(): boolean {
    return this.town.length >= TOWN_PLOTS;
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
    if (this.site.stage !== 0 || !this.canDig(chunk)) return false;
    this.site.dug.push(chunk);
    this.save();
    return true;
  }

  get holeDug(): boolean {
    const { holeCols, holeRows } = this.currentProject;
    return this.site.dug.length >= holeCols * holeRows;
  }

  tipGravel(): boolean {
    if (this.site.stage !== 1 || this.gravelDone) return false;
    this.site.gravel++;
    this.save();
    return true;
  }

  get gravelDone(): boolean {
    return this.site.gravel >= this.currentProject.gravelLoads;
  }

  /** Concrete into one section of formwork. Returns true on the frame it becomes full. */
  pour(cell: number, amount: number): boolean {
    const cells = this.currentProject.pourCells;
    if (this.site.stage !== 2 || cell < 0 || cell >= cells) return false;
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

  /** The next steel frame (or the roof) lifted into place. */
  placePiece(): boolean {
    if (this.site.stage !== 3 || this.frameDone) return false;
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
      case 'grav': return this.holeDug;
      case 'grus': return this.gravelDone;
      case 'stoeb': return this.foundationPoured;
      case 'rejs': return this.frameDone;
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
    this.site.stage++;
    this.save();
    return true;
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
    if (this.stage.id !== 'mal') return -1;
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

  /* ----------------------------------------------------------------- the rest --- */

  addStars(count = 1): void {
    this.stars += count;
    this.save();
  }

  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings[key] = value;
    this.save();
  }

  reset(): void {
    const settings = this.settings;
    this.stars = 0;
    this.machines = this.freshMachines();
    this.project = 0;
    this.site = this.freshSite();
    this.town = [];
    this.settings = settings;
    this.save();
  }

  save(): void {
    const json = JSON.stringify({
      version: SAVE_VERSION,
      stars: this.stars,
      machines: this.machines,
      project: this.project,
      site: this.site,
      town: this.town,
      settings: this.settings,
    });

    try {
      localStorage.setItem(SAVE_KEY, json);
    } catch {
      // private browsing or a full quota — the game still plays, it just will not persist
    }

    // On Android the same bytes also go to native storage. No-op in a browser.
    mirrorSave(json);
  }

  load(): void {
    let data: Record<string, any> | null = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    if (!data || data.version !== SAVE_VERSION) return;

    const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
    const clamp01 = (v: unknown) => Math.min(1, Math.max(0, num(v, 0)));

    this.stars = num(data.stars, 0);
    this.project = Math.max(0, Math.floor(num(data.project, 0)));

    // Each machine is restored field by field, keeping only parts that still exist, so a
    // renamed part cannot leave a machine that is "built" with a piece missing.
    const machines = this.freshMachines();
    for (const id of MACHINE_IDS) {
      const saved = data.machines?.[id];
      if (!saved) continue;
      const known = new Set(MACHINES[id].parts.map(p => p.id));
      machines[id] = {
        parts: Array.isArray(saved.parts) ? saved.parts.filter((p: unknown) => known.has(p as string)) : [],
        diesel: clamp01(saved.diesel),
        oil: clamp01(saved.oil),
        extra: Array.from({ length: EXTRA_SPOTS }, (_, i) => saved.extra?.[i] === true),
      };
    }
    this.machines = machines;

    const site = data.site ?? {};
    this.site = {
      stage: Math.min(STAGES.length - 1, Math.max(0, Math.floor(num(site.stage, 0)))),
      dug: Array.isArray(site.dug) ? site.dug.filter((n: unknown) => typeof n === 'number') : [],
      gravel: Math.max(0, num(site.gravel, 0)),
      poured: Array.isArray(site.poured) ? site.poured.map(clamp01) : [],
      placed: Math.max(0, num(site.placed, 0)),
    };

    this.town = Array.isArray(data.town)
      ? data.town
        .filter((b: any) => b && typeof b.project === 'number' && typeof b.color === 'number')
        .slice(0, TOWN_PLOTS)
      : [];

    const settings = data.settings ?? {};
    this.settings = {
      sound: typeof settings.sound === 'boolean' ? settings.sound : true,
      music: typeof settings.music === 'boolean' ? settings.music : true,
    };
  }
}

export const gameState = new GameState();
