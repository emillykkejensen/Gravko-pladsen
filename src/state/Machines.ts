/**
 * The machines, as data.
 *
 * No Phaser here — the test harness imports this in Node. How each part is drawn lives in
 * objects/MachineArt.ts, keyed by the same ids.
 *
 * The first four build every house. The next three arrive with the bigger buildings: the
 * road roller with the villa, the pile driver with the shop, and the tower crane with the
 * high-rise, which is taller than the mobile crane can reach. The last five arrive with the
 * town's big buildings, one each: the bulldozer with the bus station, the wheel loader with
 * the fire station, the wrecking crane with the police station, the asphalt paver with the
 * railway station and the lift truck with the hospital.
 */

export type MachineId =
  | 'gravko' | 'lastbil' | 'betonbil' | 'kran' | 'vejtromle' | 'pael' | 'taarnkran'
  | 'bulldozer' | 'laesser' | 'nedriv' | 'asfalt' | 'lift';

/** Also the order of the workshop's bays, and part of the save format: append, never reorder. */
export const MACHINE_IDS: MachineId[] = [
  'gravko', 'lastbil', 'betonbil', 'kran', 'vejtromle', 'pael', 'taarnkran',
  'bulldozer', 'laesser', 'nedriv', 'asfalt', 'lift',
];

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
  /** "Vidste du?" — one true thing about the real machine, told when it is built. */
  fact: string;
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
    fact: 'En gravko har tænder på skovlen, så den kan bide sig ned i hård jord.',
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
    fact: 'Lastbilens lad kan vippe op, så gruset glider af helt af sig selv.',
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
    fact: 'Tromlen drejer hele vejen, så betonen ikke når at blive hård, før den er fremme.',
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
    fact: 'Kranbilen sætter støtteben ud, så den ikke vælter, når den løfter noget tungt.',
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
    fact: 'Vejtromlen er så tung, at den trykker gruset helt fast.',
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
    fact: 'Pæle står dybt nede i jorden og holder huset, hvor jorden er blød.',
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
    fact: 'Tårnkranen har en tung kontravægt bag på armen, så den ikke tipper.',
  },
  bulldozer: {
    id: 'bulldozer',
    name: 'Bulldozeren',
    short: 'Bulldozer',
    job: 'skubber jorden flad',
    parts: [
      { id: 'baelter', name: 'Bælter' },
      { id: 'krop', name: 'Krop' },
      { id: 'motor', name: 'Motor' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'skraber', name: 'Skraber' },
    ],
    extra: { title: 'Vask bulldozeren', kind: 'mud', done: 'Ren' },
    fact: 'Bulldozeren kører på bælter, så den ikke synker ned i mudder.',
  },
  laesser: {
    id: 'laesser',
    name: 'Læssemaskinen',
    short: 'Læssemaskine',
    job: 'samler sten op',
    parts: [
      { id: 'hjul', name: 'Hjul' },
      { id: 'ramme', name: 'Ramme' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'arm', name: 'Løftearm' },
      { id: 'skovl', name: 'Skovl' },
    ],
    extra: { title: 'Smør armen', kind: 'grease', done: 'Smurt' },
    fact: 'Læssemaskinen kan løfte skovlen højt op og tømme den ned i en lastbil.',
  },
  nedriv: {
    id: 'nedriv',
    name: 'Nedrivningskranen',
    short: 'Nedrivning',
    job: 'river det gamle skur ned',
    parts: [
      { id: 'baelter', name: 'Bælter' },
      { id: 'krop', name: 'Krop' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'bom', name: 'Kranarm' },
      { id: 'kugle', name: 'Kugle' },
    ],
    extra: { title: 'Spænd kæden', kind: 'bolt', done: 'Spændt' },
    fact: 'Nedrivningskuglen er af massivt stål og kan veje lige så meget som en bil.',
  },
  asfalt: {
    id: 'asfalt',
    name: 'Asfaltmaskinen',
    short: 'Asfaltmaskine',
    job: 'lægger asfalt',
    parts: [
      { id: 'baelter', name: 'Bælter' },
      { id: 'krop', name: 'Krop' },
      { id: 'tragt', name: 'Tragt' },
      { id: 'hus', name: 'Førersæde' },
      { id: 'glatter', name: 'Glattebjælke' },
    ],
    extra: { title: 'Tænd varmen', kind: 'lamp', done: 'Tændt' },
    fact: 'Asfalten er over 100 grader varm, når den kommer ud af maskinen!',
  },
  lift: {
    id: 'lift',
    name: 'Liftbilen',
    short: 'Liftbil',
    job: 'sætter vinduerne i',
    parts: [
      { id: 'hjul', name: 'Hjul' },
      { id: 'ramme', name: 'Ramme' },
      { id: 'hus', name: 'Førerhus' },
      { id: 'arm', name: 'Liftarm' },
      { id: 'kurv', name: 'Kurv' },
    ],
    extra: { title: 'Pump dækkene', kind: 'tyre', done: 'Pumpet' },
    fact: 'Liftbilens kurv kan løfte folk højt op, så de kan arbejde sikkert.',
  },
};

/** How many spots the third preparation job has. */
export const EXTRA_SPOTS = 3;

/** Diesel and oil one job on the building site uses. A full tank does two jobs. */
export const DIESEL_PER_JOB = 0.5;
export const OIL_PER_JOB = 0.25;
