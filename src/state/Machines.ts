/**
 * The four machines, as data.
 *
 * No Phaser here — the test harness imports this in Node. How each part is drawn lives in
 * objects/MachineArt.ts, keyed by the same ids.
 */

export type MachineId = 'gravko' | 'lastbil' | 'betonbil' | 'kran';

export const MACHINE_IDS: MachineId[] = ['gravko', 'lastbil', 'betonbil', 'kran'];

/**
 * One part. Parts go on in any order — a five-year-old should not have to work out that
 * the cab needs a chassis first, so a cab dropped onto an empty silhouette simply waits
 * there for the rest of the machine to arrive.
 */
export interface PartDef {
  id: string;
  name: string;
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
      { id: 'baelter', name: 'Bælter' },
      { id: 'krop', name: 'Krop' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'bom', name: 'Bom' },
      { id: 'arm', name: 'Arm' },
      { id: 'skovl', name: 'Skovl' },
    ],
    extra: { title: 'Smør leddene', kind: 'grease', done: 'Smurt' },
  },
  lastbil: {
    id: 'lastbil',
    name: 'Lastbilen',
    short: 'Lastbil',
    job: 'kører grus',
    parts: [
      { id: 'hjul', name: 'Hjul' },
      { id: 'ramme', name: 'Ramme' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'lad', name: 'Lad' },
    ],
    extra: { title: 'Pump dækkene', kind: 'tyre', done: 'Pumpet' },
  },
  betonbil: {
    id: 'betonbil',
    name: 'Betonbilen',
    short: 'Betonbil',
    job: 'støber fundamentet',
    parts: [
      { id: 'hjul', name: 'Hjul' },
      { id: 'ramme', name: 'Ramme' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'tromle', name: 'Tromle' },
      { id: 'rende', name: 'Rende' },
    ],
    extra: { title: 'Vask tromlen', kind: 'mud', done: 'Ren' },
  },
  kran: {
    id: 'kran',
    name: 'Kranbilen',
    short: 'Kran',
    job: 'løfter stålet på plads',
    parts: [
      { id: 'hjul', name: 'Hjul' },
      { id: 'ramme', name: 'Ramme' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'drej', name: 'Drejeskive' },
      { id: 'bom', name: 'Kranarm' },
      { id: 'krog', name: 'Krog' },
    ],
    extra: { title: 'Spænd boltene', kind: 'bolt', done: 'Spændt' },
  },
};

/** How many spots the third preparation job has. */
export const EXTRA_SPOTS = 3;

/** Diesel and oil one job on the building site uses. A full tank does two jobs. */
export const DIESEL_PER_JOB = 0.5;
export const OIL_PER_JOB = 0.25;
