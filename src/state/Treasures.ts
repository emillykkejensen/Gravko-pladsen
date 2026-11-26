/**
 * What lies buried under the building site.
 *
 * Every hole the excavator digs hides one thing, so digging is not only clearing earth: there
 * is something to find. A child sees it glint through the earth, digs towards it, and it pops
 * up out of the bucket. It is then kept in the treasure chest (`TreasureScene`), where the
 * ones still to find wait as question marks.
 *
 * Each find is real, and most are things that really are dug up in Denmark — amber, a fossil
 * sea urchin, a flint axe, a Viking coin, a rune stone — with one true sentence about it for
 * a grown-up to read aloud. The order runs from the familiar (a worm, a horseshoe, a potato)
 * towards the extraordinary, and the last of the town's own buildings, the hospital, finds the
 * Golden Horn.
 *
 * No Phaser here: the tests import it in Node. How each find is drawn lives in
 * objects/TreasureArt.ts, keyed by the same ids.
 */

export interface TreasureDef {
  /** Part of the save format: never rename one. */
  id: string;
  /** "Rav" — the label under it in the chest. */
  title: string;
  /** "et stykke rav" — for "Du fandt et stykke rav!" */
  name: string;
  /** One true sentence or two, short enough to read aloud while the child keeps digging. */
  fact: string;
}

/** In the order they are found: the project on plot i finds TREASURES[i]. Append only. */
export const TREASURES: TreasureDef[] = [
  {
    id: 'orm', title: 'Regnorm', name: 'en regnorm',
    fact: 'Regnorme graver gange i jorden. Så kan luft og regnvand komme ned til planternes rødder.',
  },
  {
    id: 'rav', title: 'Rav', name: 'et stykke rav',
    fact: 'Rav er harpiks fra træer, der voksede for millioner af år siden. Nogle gange sidder der et lille insekt inden i.',
  },
  {
    id: 'hestesko', title: 'Hestesko', name: 'en gammel hestesko',
    fact: 'Heste får sko af jern, så hovene ikke bliver slidt. Mange hænger en hestesko op for at få held.',
  },
  {
    id: 'kartoffel', title: 'Kartoffel', name: 'en kartoffel',
    fact: 'Kartofler vokser nede i jorden. Lægger man én kartoffel, kan der vokse mange nye.',
  },
  {
    id: 'soepindsvin', title: 'Søpindsvin', name: 'et forstenet søpindsvin',
    fact: 'Engang var Danmark dækket af hav. Søpindsvinet er blevet til sten — det kaldes et fossil.',
  },
  {
    id: 'legetoej', title: 'Legetøjsbil', name: 'en gammel legetøjsbil',
    fact: 'En bil af blik. Sådan så legetøj ud, da dine oldeforældre var børn.',
  },
  {
    id: 'floekse', title: 'Flintøkse', name: 'en flintøkse',
    fact: 'I stenalderen havde man ikke metal. Man slog flint til, så den fik en skarp æg.',
  },
  {
    id: 'muldvarp', title: 'Muldvarp', name: 'en muldvarp',
    fact: 'Muldvarpen bor under jorden og graver med sine store poter. Den kan næsten ikke se.',
  },
  {
    id: 'ammonit', title: 'Ammonit', name: 'en ammonit',
    fact: 'Ammonitter var havdyr med et snoet skal. De levede på dinosaurernes tid.',
  },
  {
    id: 'moent', title: 'Vikingemønt', name: 'en vikingemønt',
    fact: 'Vikingerne betalte med sølv. Nogle gange huggede de en mønt over for at betale det rigtige.',
  },
  {
    id: 'hajtand', title: 'Hajtand', name: 'en forstenet hajtand',
    fact: 'Hajer taber tænder hele livet og får hele tiden nye. Derfor finder man mange hajtænder.',
  },
  {
    id: 'flaskepost', title: 'Flaskepost', name: 'en flaskepost',
    fact: 'Før telefonen puttede nogen et brev i en flaske og håbede, at nogen ville finde det.',
  },
  {
    id: 'runesten', title: 'Runesten', name: 'en lille runesten',
    fact: 'Runer var vikingernes bogstaver. De huggede dem i sten og malede dem røde.',
  },
  {
    id: 'mammut', title: 'Mammuttand', name: 'en stødtand fra en mammut',
    fact: 'Mammutter var store, lodne elefanter fra istiden. De levede også i Danmark.',
  },
  {
    id: 'krystal', title: 'Bjergkrystal', name: 'en bjergkrystal',
    fact: 'Krystaller vokser inde i sten, meget langsomt — i tusindvis af år.',
  },
  {
    id: 'dino', title: 'Dinosaurknogle', name: 'en dinosaurknogle',
    fact: 'Dinosaurerne levede for over 66 millioner år siden. På Bornholm har man fundet deres fodspor!',
  },
  {
    id: 'guldhorn', title: 'Guldhornet', name: 'et guldhorn',
    fact: 'I 1639 fandt en pige et guldhorn på en mark i Sønderjylland. Det blev lavet for omkring 1.600 år siden.',
  },
];

export function treasureById(id: string): TreasureDef | null {
  return TREASURES.find(t => t.id === id) ?? null;
}

/** What the building on plot `project` finds. After the last one they come round again. */
export function treasureFor(project: number): TreasureDef {
  const i = Math.max(0, Math.floor(project));
  return TREASURES[i % TREASURES.length];
}

/**
 * Which chunk of a hole the find is buried in: down at the bottom of the hole, so it is dug
 * towards, in a column that moves along from one building to the next.
 */
export function treasureChunk(project: number, holeCols: number, holeRows: number): number {
  const col = (Math.max(0, Math.floor(project)) + 1) % holeCols;
  return col * holeRows + (holeRows - 1);
}
