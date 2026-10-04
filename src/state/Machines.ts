/**
 * The four machines, as data.
 *
 * No Phaser here — the test harness imports this in Node. How each part is drawn lives in
 * objects/MachineArt.ts, keyed by the same ids.
 */

export type MachineId = 'gravko' | 'lastbil' | 'betonbil' | 'kran';

export const MACHINE_IDS: MachineId[] = ['gravko', 'lastbil', 'betonbil', 'kran'];

export interface PartDef {
  id: string;
  name: string;
  /**
   * Parts that have to be on the machine first. A cab cannot sit on a chassis that is not
   * there yet; the part still drags, it just will not snap until its base is in place.
   */
  needs: string[];
}

/** The third preparation job — the one that is different for each machine. */
export interface ExtraJob {
  /** Title on the job card. */
  title: string;
  /** What the child taps: the art draws a nipple, a tyre, a mud spot or a bolt. */
  kind: 'grease' | 'tyre' | 'mud' | 'bolt';
  /** What the done-caption says. */
  done: string;
}

export interface MachineDef {
  id: MachineId;
  /** "Gravkoen" — every sentence in the game uses the definite form. */
  name: string;
  /** Short form for buttons: "Gravko". */
  short: string;
  /** What it does on the building site, as a verb phrase. */
  job: string;
  parts: PartDef[];
  extra: ExtraJob;
}

export const MACHINES: Record<MachineId, MachineDef> = {
  gravko: {
    id: 'gravko',
    name: 'Gravkoen',
    short: 'Gravko',
    job: 'graver hullet',
    parts: [
      { id: 'baelter', name: 'Bælter', needs: [] },
      { id: 'krop', name: 'Krop', needs: ['baelter'] },
      { id: 'hus', name: 'Førerhus', needs: ['krop'] },
      { id: 'bom', name: 'Bom', needs: ['krop'] },
      { id: 'arm', name: 'Arm', needs: ['bom'] },
      { id: 'skovl', name: 'Skovl', needs: ['arm'] },
    ],
    extra: { title: 'Smør leddene', kind: 'grease', done: 'Smurt' },
  },
  lastbil: {
    id: 'lastbil',
    name: 'Lastbilen',
    short: 'Lastbil',
    job: 'kører grus',
    parts: [
      { id: 'hjul', name: 'Hjul', needs: [] },
      { id: 'ramme', name: 'Ramme', needs: ['hjul'] },
      { id: 'hus', name: 'Førerhus', needs: ['ramme'] },
      { id: 'lad', name: 'Lad', needs: ['ramme'] },
    ],
    extra: { title: 'Pump dækkene', kind: 'tyre', done: 'Pumpet' },
  },
  betonbil: {
    id: 'betonbil',
    name: 'Betonbilen',
    short: 'Betonbil',
    job: 'støber fundamentet',
    parts: [
      { id: 'hjul', name: 'Hjul', needs: [] },
      { id: 'ramme', name: 'Ramme', needs: ['hjul'] },
      { id: 'hus', name: 'Førerhus', needs: ['ramme'] },
      { id: 'tromle', name: 'Tromle', needs: ['ramme'] },
      { id: 'rende', name: 'Rende', needs: ['tromle'] },
    ],
    extra: { title: 'Vask tromlen', kind: 'mud', done: 'Ren' },
  },
  kran: {
    id: 'kran',
    name: 'Kranbilen',
    short: 'Kran',
    job: 'løfter stålet på plads',
    parts: [
      { id: 'hjul', name: 'Hjul', needs: [] },
      { id: 'ramme', name: 'Ramme', needs: ['hjul'] },
      { id: 'hus', name: 'Førerhus', needs: ['ramme'] },
      { id: 'drej', name: 'Drejeskive', needs: ['ramme'] },
      { id: 'bom', name: 'Kranarm', needs: ['drej'] },
      { id: 'krog', name: 'Krog', needs: ['bom'] },
    ],
    extra: { title: 'Spænd boltene', kind: 'bolt', done: 'Spændt' },
  },
};

/** How many spots the third preparation job has. */
export const EXTRA_SPOTS = 3;

/** Diesel and oil one job on the building site uses. A full tank does two jobs. */
export const DIESEL_PER_JOB = 0.5;
export const OIL_PER_JOB = 0.25;
