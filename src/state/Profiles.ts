import { LEGACY_MIRROR_KEY, mirror, readMirror, unmirror } from '../helpers/Native';

/**
 * Who is playing.
 *
 * Several children share one tablet, and each of them has a town of their own. The list
 * of players is a small index in its own key; every player's progress is an ordinary save
 * under a key of its own:
 *
 *   gravko-spil-profiles      { version: 1, profiles: [{ id, name, avatar }], last }
 *   gravko-spil-save:<id>     one player's town, machines and building site
 *
 * Keeping the saves separate rather than nesting them inside the index means a save is in
 * exactly the format a single save always was, a write for one child can never clobber
 * another child's town, and deleting a player is removing one key.
 *
 * Nothing here knows about Phaser or the scenes, so it can be driven from a test directly.
 */

export const PROFILES_KEY = 'gravko-spil-profiles';
/** The one save from before there were profiles — and the prefix every player's save shares. */
export const LEGACY_SAVE_KEY = 'gravko-spil-save';

/** Six cards fit a row on the title screen, and six children is a big household already. */
export const MAX_PROFILES = 6;
/** Long enough for any first name a child has; short enough to fit on a card. */
export const MAX_NAME_LENGTH = 10;

/** The animal faces a player can pick. The ids are stored, so append, never rename. */
export const AVATARS = ['kat', 'hund', 'kanin', 'bjørn', 'ræv', 'frø', 'gris', 'løve'] as const;
export type Avatar = typeof AVATARS[number];

export interface Profile {
  id: string;
  name: string;
  avatar: Avatar;
}

interface ProfileIndex {
  version: 1;
  profiles: Profile[];
  /** Who played last, so the title screen can wear their sound settings. */
  last: string | null;
}

export function saveKeyFor(id: string): string {
  return `${LEGACY_SAVE_KEY}:${id}`;
}

/* ------------------------------------------------------------------ reading --- */

/**
 * The index, normalised. Null when there is none, which is different from an empty one:
 * no index at all is what triggers the migration and the native restore.
 */
function readIndex(): ProfileIndex | null {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? parseIndex(raw) : null;
  } catch {
    return null;
  }
}

function parseIndex(raw: string): ProfileIndex | null {
  let data: { profiles?: unknown; last?: unknown } | null;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.profiles)) return null;

  const profiles: Profile[] = [];
  for (const p of data.profiles as Partial<Profile>[]) {
    if (!p || typeof p.id !== 'string' || !p.id) continue;
    if (profiles.some(q => q.id === p.id)) continue;
    profiles.push({
      id: p.id,
      name: cleanName(typeof p.name === 'string' ? p.name : '') || 'Spiller',
      avatar: AVATARS.includes(p.avatar as Avatar) ? p.avatar as Avatar : AVATARS[0],
    });
  }

  const last = typeof data.last === 'string' && profiles.some(p => p.id === data.last)
    ? data.last
    : null;
  return { version: 1, profiles: profiles.slice(0, MAX_PROFILES), last };
}

/** Writes the index, and its native mirror. False if web storage refused it. */
function writeIndex(index: ProfileIndex): boolean {
  const json = JSON.stringify(index);
  mirror(PROFILES_KEY, json);
  try {
    localStorage.setItem(PROFILES_KEY, json);
    return true;
  } catch {
    return false;
  }
}

export function listProfiles(): Profile[] {
  return readIndex()?.profiles ?? [];
}

export function findProfile(id: string | null): Profile | null {
  if (!id) return null;
  return listProfiles().find(p => p.id === id) ?? null;
}

export function lastProfileId(): string | null {
  return readIndex()?.last ?? null;
}

/** For the title screen's cards: how many stars a player has, read off their save. */
export function starsOf(id: string): number {
  try {
    const raw = localStorage.getItem(saveKeyFor(id));
    const stars = raw ? JSON.parse(raw)?.stars : 0;
    return typeof stars === 'number' ? stars : 0;
  } catch {
    return 0;
  }
}

/* ------------------------------------------------------------------ writing --- */

export function setLastProfile(id: string): void {
  const index = readIndex();
  if (!index || index.last === id || !index.profiles.some(p => p.id === id)) return;
  index.last = id;
  writeIndex(index);
}

/** Adds a player. Null when the game already has as many as the title screen can show. */
export function createProfile(name: string, avatar: Avatar): Profile | null {
  const index = readIndex() ?? { version: 1, profiles: [], last: null };
  if (index.profiles.length >= MAX_PROFILES) return null;

  const profile: Profile = {
    id: newId(index.profiles),
    name: cleanName(name) || defaultName(index.profiles),
    avatar,
  };
  index.profiles.push(profile);
  return writeIndex(index) ? profile : null;
}

/** Removes a player and their town, from both copies. Nobody else is touched. */
export function deleteProfile(id: string): void {
  const index = readIndex();
  if (!index) return;
  index.profiles = index.profiles.filter(p => p.id !== id);
  if (index.last === id) index.last = null;
  writeIndex(index);

  const key = saveKeyFor(id);
  try {
    localStorage.removeItem(key);
  } catch {
    // the index no longer lists it, which is what matters
  }
  unmirror(key);
}

/** Whitespace tidied and cut to length. Empty if there was nothing to keep. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
}

/** "Spiller 2" — the lowest number nobody is already called, so a deleted one is reused. */
function defaultName(profiles: Profile[]): string {
  for (let n = 1; ; n++) {
    const name = `Spiller ${n}`;
    if (!profiles.some(p => p.name === name)) return name;
  }
}

/** Short, unique on this device, and safe inside a storage key. */
function newId(profiles: Profile[]): string {
  let id: string;
  do {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  } while (profiles.some(p => p.id === id));
  return id;
}

/* ---------------------------------------------------------------- migration --- */

/**
 * A save from before profiles becomes the first player's.
 *
 * Runs when there is no index yet but the old single save exists. The child who earned those
 * stars must find them again, so the order is careful: copy the save to its new key, write
 * the index, and only then remove the old key. A failure anywhere before the last step leaves
 * the old save where it was, and the migration simply runs again on the next launch.
 */
export function migrateLegacySave(): boolean {
  try {
    if (localStorage.getItem(PROFILES_KEY)) return false;
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!legacy) return false;

    const profile: Profile = { id: newId([]), name: 'Spiller 1', avatar: AVATARS[0] };
    const key = saveKeyFor(profile.id);
    localStorage.setItem(key, legacy);
    mirror(key, legacy);

    if (!writeIndex({ version: 1, profiles: [profile], last: profile.id })) {
      localStorage.removeItem(key);
      return false;
    }

    localStorage.removeItem(LEGACY_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Puts the players back from native storage, when the WebView has lost its web storage.
 *
 * Only runs when there is no index, so it can never overwrite anything newer. The saves go
 * back before the index: an index is what marks the restore as done, so one that stops
 * half-way is retried on the next launch rather than leaving a player with an empty town.
 *
 * A phone that last mirrored before profiles existed has the one save under its old native
 * key; that is put back as the old single save and migrated like any other.
 *
 * `read` is the native store. It returns nothing in a browser, which makes this a no-op
 * there — and lets a test hand it a pretend one.
 */
export async function restoreFromMirror(
  read: (key: string) => Promise<string | null> = readMirror
): Promise<boolean> {
  try {
    if (localStorage.getItem(PROFILES_KEY)) return false;

    const rawIndex = await read(PROFILES_KEY);
    const index = rawIndex ? parseIndex(rawIndex) : null;
    if (index) {
      for (const profile of index.profiles) {
        const key = saveKeyFor(profile.id);
        if (localStorage.getItem(key)) continue;
        const save = await read(key);
        if (save) localStorage.setItem(key, save);
      }
      localStorage.setItem(PROFILES_KEY, JSON.stringify(index));
      return true;
    }

    if (localStorage.getItem(LEGACY_SAVE_KEY)) return false;
    const legacy = await read(LEGACY_MIRROR_KEY);
    if (!legacy) return false;
    localStorage.setItem(LEGACY_SAVE_KEY, legacy);
    return migrateLegacySave();
  } catch {
    return false;
  }
}
