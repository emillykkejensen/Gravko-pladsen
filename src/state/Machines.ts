/**
 * The machines, as data.
 *
 * No Phaser here — the test harness imports this in Node. How each part is drawn lives in
 * objects/MachineArt.ts, keyed by the same ids.
 *
 * The first four build every house. The last three arrive with the bigger buildings: the
 * road roller with the villa, the pile driver with the shop, and the tower crane with the
 * high-rise, which is taller than the mobile crane can reach.
 */

export type MachineId = 'gravko' | 'lastbil' | 'betonbil' | 'kran' | 'vejtromle' | 'pael' | 'taarnkran';

/** Also the order of the workshop's bays, and part of the save format: append, never reorder. */
export const MACHINE_IDS: MachineId[] = ['gravko', 'lastbil', 'betonbil', 'kran', 'vejtromle', 'pael', 'taarnkran'];

/**
 * One part. Parts go on in any order — a five-year-old should not have to work out that
 * the cab needs a chassis first, so a cab dropped onto an empty silhouette simply waits
 * there for the rest of the machine to arrive.
 */
export interface PartDef {
  id: string;
  name: string;
}

export type ExtraKind = 'grease' | 'tyre' | 'mud' | 'bolt' | 'water' | 'lamp' | 'flag';

/** The third preparation job — the one that is different for each machine. */
export interface ExtraJob {
  /** Title on the job card. */
  title: string;
  /** What the child taps: a grease nipple, a soft tyre, mud, a bolt, a dry spot, a lamp or a flag. */
  kind: ExtraKind;
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
  vejtromle: {
    id: 'vejtromle',
    name: 'Vejtromlen',
    short: 'Vejtromle',
    job: 'triller gruset fast',
    parts: [
      { id: 'tromle', name: 'Tromle' },
      { id: 'ramme', name: 'Ramme' },
      { id: 'hjul', name: 'Baghjul' },
      { id: 'motor', name: 'Motor' },
      { id: 'hus', name: 'Førerhus' },
    ],
    extra: { title: 'Sprøjt vand på', kind: 'water', done: 'Våd' },
  },
  pael: {
    id: 'pael',
    name: 'Pælerammen',
    short: 'Pæleramme',
    job: 'banker pæle ned i jorden',
    parts: [
      { id: 'baelter', name: 'Bælter' },
      { id: 'krop', name: 'Krop' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'mast', name: 'Mast' },
      { id: 'lod', name: 'Faldlod' },
    ],
    extra: { title: 'Tænd lygterne', kind: 'lamp', done: 'Tændt' },
  },
  taarnkran: {
    id: 'taarnkran',
    name: 'Tårnkranen',
    short: 'Tårnkran',
    job: 'løfter stålet helt op til toppen',
    parts: [
      { id: 'fod', name: 'Fundament' },
      { id: 'taarn', name: 'Tårn' },
      { id: 'top', name: 'Førerhus' },
      { id: 'udligger', name: 'Udligger' },
      { id: 'vaegt', name: 'Kontravægt' },
      { id: 'krog', name: 'Krog' },
    ],
    // Flags on a crane are the Danish topping-out, the rejsegilde, in miniature.
    extra: { title: 'Hejs flagene', kind: 'flag', done: 'Hejst' },
  },
};

/** How many spots the third preparation job has. */
export const EXTRA_SPOTS = 3;

/** Diesel and oil one job on the building site uses. A full tank does two jobs. */
export const DIESEL_PER_JOB = 0.5;
export const OIL_PER_JOB = 0.25;
