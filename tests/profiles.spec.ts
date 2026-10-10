import { test, expect } from '@playwright/test';
import { GAME_WIDTH } from '../src/config';
import { AT, Game, LEGACY_SAVE_KEY, PROFILES_KEY, TestProfile, readyMachine, saveKeyFor } from './game';

/**
 * Player profiles: several children on one tablet, each with a town of their own.
 *
 * What matters is what a child would notice — that their name and animal stick, that their
 * stars and machines are theirs and nobody else's, that picking their card puts them back
 * exactly where they stopped, and that a save from before profiles existed is not lost.
 */

const ALMA: TestProfile = { id: 'a', name: 'Alma', avatar: 'kat' };
const BO: TestProfile = { id: 'b', name: 'Bo', avatar: 'frø' };

const PROFILES_URL = '/src/state/Profiles.ts';

async function typeName(game: Game, word: string): Promise<void> {
  for (const letter of word) await game.tapNamed('ProfileScene', `key:${letter}`);
}

/** Every text on one player's title-screen card. */
async function cardText(game: Game, id: string): Promise<string[]> {
  return game.page.evaluate((name) => {
    const scene = window.__game.scene.getScene('MainMenuScene') as any;
    const card = scene.children.list.find((o: any) => o.name === name);
    const out: string[] = [];
    const walk = (objs: any[]) => {
      for (const o of objs || []) {
        if (o.type === 'Text') out.push(o.text);
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    if (card) walk(card.list);
    return out;
  }, `player:${id}`);
}

test('a new player is made on the on-screen keyboard, and their name and animal stick', async ({ page }) => {
  const game = await Game.openWithStorage(page, {});

  await game.expectScreenText('MainMenuScene').toContain('Hvem spiller?');
  await game.expectScreenText('MainMenuScene', 'with nobody yet, there is a card to add somebody')
    .toContain('Ny spiller');
  expect(await page.evaluate(() => Object.keys(window.localStorage)),
    'the title screen must not invent a save before anybody exists').toEqual([]);

  await game.tapNamed('MainMenuScene', 'player:new');
  await game.waitForScene('ProfileScene');

  await game.tapNamed('ProfileScene', 'avatar:ræv');
  // a slip, and the delete key to take it back
  await typeName(game, 'EMIX');
  await game.tapNamed('ProfileScene', 'key:delete');
  await typeName(game, 'L');
  await game.expectScreenText('ProfileScene', 'typed in capitals, written like a name').toContain('Emil');

  await game.tapNamed('ProfileScene', 'done');
  await game.waitForScene('TownScene');

  const index = await game.storage(PROFILES_KEY);
  expect(index?.profiles).toEqual([{ id: expect.any(String), name: 'Emil', avatar: 'ræv' }]);
  const id = index!.profiles[0].id;
  expect(index?.last, 'the new player is the one playing').toBe(id);
  await game.expectScreenText('TownScene', 'the town says whose it is').toContain('Emil');

  // Their workshop is their own save, under their own key.
  await game.goTo('AssembleScene', { machine: 'gravko' });
  await game.drag(await game.mustFind('AssembleScene', 'part:baelter'), await game.mustFind('AssembleScene', 'slot:baelter'));
  await game.expectState(s => s.stars).toBe(1);
  expect((await game.storage(saveKeyFor(id)))?.machines.gravko.parts).toEqual(['baelter']);

  // Close the game and open it again.
  await page.reload();
  await game.waitForScene('MainMenuScene');
  expect(await cardText(game, id), 'the card is still there, with the star on it')
    .toEqual(expect.arrayContaining(['Emil', '1']));
  await game.start(id);
  await game.expectState(s => s.machines.gravko.parts).toEqual(['baelter']);
  game.expectNoErrors();
});

test('an empty name becomes the next free "Spiller N", on an animal nobody has', async ({ page }) => {
  const game = await Game.openWithStorage(page, Game.players([
    ALMA,
    { id: 's1', name: 'Spiller 1', avatar: 'hund' },
  ]));
  await game.tapNamed('MainMenuScene', 'player:new');
  await game.waitForScene('ProfileScene');
  await game.tapNamed('ProfileScene', 'done');
  await game.waitForScene('TownScene');

  const index = await game.storage(PROFILES_KEY);
  expect(index?.profiles).toHaveLength(3);
  expect(index?.profiles[2]).toMatchObject({ name: 'Spiller 2', avatar: 'kanin' });
  game.expectNoErrors();
});

test('the new-player screen has a way back, and leaving it creates nobody', async ({ page }) => {
  const game = await Game.open(page);
  await game.tapNamed('MainMenuScene', 'player:new');
  await game.waitForScene('ProfileScene');
  await typeName(game, 'OLE');
  await game.tap(AT.back.x, AT.back.y);
  await game.waitForScene('MainMenuScene');
  expect((await game.storage(PROFILES_KEY))?.profiles).toEqual([Game.PLAYER]);
  game.expectNoErrors();
});

test('two players keep their own stars, machines, shopping and sound', async ({ page }) => {
  const game = await Game.openWithStorage(page, {
    ...Game.players([ALMA, BO]),
    [saveKeyFor(ALMA.id)]: Game.saveWith({
      stars: 12, earned: 20, owned: ['bus'], machines: { gravko: readyMachine('gravko') },
      settings: { sound: true, music: true },
    }),
  });

  await game.start(ALMA.id);
  await game.expectState(s => s.stars).toBe(12);
  expect(await game.find('TownScene', 'deco:bus'), 'her town has the bus she bought').not.toBeNull();
  await game.tap(AT.back.x, AT.back.y);
  await game.waitForScene('MainMenuScene');
  expect(await cardText(game, ALMA.id)).toContain('12');

  // Bo starts from nothing — none of Alma's stars, machines or bus — and turns his music off.
  await game.start(BO.id);
  const bo = await game.state();
  expect(bo.stars).toBe(0);
  expect(bo.owned).toEqual([]);
  expect(bo.machines.gravko.parts).toEqual([]);
  expect(await game.find('TownScene', 'deco:bus')).toBeNull();
  await game.tapNamed('TownScene', 'grownups');
  await game.waitForScene('SettingsScene');
  await game.expectScreenText('SettingsScene', 'the grown-up screen says whose it is').toContain('Bo');
  await game.tapNamed('SettingsScene', 'toggle:Musik');
  await game.expectState(s => s.settings.sound).toBe(true);
  await game.expectState(s => s.settings.music, 'Bo has the music off').toBe(false);

  const alma = await game.storage(saveKeyFor(ALMA.id));
  expect(alma.settings.music, 'Alma still has hers on').toBe(true);
  expect(alma.stars).toBe(12);

  // Close the game and open it again; each child finds their own town.
  await page.reload();
  await game.waitForScene('MainMenuScene');
  expect((await game.storage(PROFILES_KEY))?.last).toBe(BO.id);
  await game.start(ALMA.id);
  await game.expectState(s => s.machines.gravko.parts).toHaveLength(6);
  await game.expectState(s => s.settings.music).toBe(true);
  game.expectNoErrors();
});

test('a save from before profiles becomes "Spiller 1", stars and all', async ({ page }) => {
  const game = await Game.openWithStorage(page, {
    [LEGACY_SAVE_KEY]: { ...Game.saveWith({ stars: 17, project: 1 }), version: 1 },
  });

  const index = await game.storage(PROFILES_KEY);
  expect(index?.profiles).toEqual([{ id: expect.any(String), name: 'Spiller 1', avatar: 'kat' }]);
  const id = index!.profiles[0].id;
  expect(index?.last).toBe(id);
  expect(await game.storage(LEGACY_SAVE_KEY), 'moved, not copied').toBeNull();
  expect((await game.storage(saveKeyFor(id))).stars).toBe(17);
  expect(await cardText(game, id)).toEqual(expect.arrayContaining(['Spiller 1', '17']));

  await game.start(id);
  const s = await game.state();
  expect(s.stars).toBe(17);
  expect(s.earned).toBe(17);
  expect(s.project).toBe(1);
  game.expectNoErrors();
});

test('Start forfra starts this player over, and nobody else', async ({ page }) => {
  const game = await Game.openWithStorage(page, {
    ...Game.players([ALMA, BO]),
    [saveKeyFor(ALMA.id)]: Game.saveWith({ stars: 5 }),
    [saveKeyFor(BO.id)]: Game.saveWith({ stars: 8 }),
  });
  await game.start(BO.id);
  await game.tapNamed('TownScene', 'grownups');
  await game.waitForScene('SettingsScene');
  await game.tapNamed('SettingsScene', 'reset');
  await game.expectScreenText('SettingsScene').toContain('Ja, start forfra');
  await game.tapNamed('SettingsScene', 'reset');

  await game.expectState(s => s.stars, "Bo's stars are gone").toBe(0);
  expect((await game.storage(saveKeyFor(ALMA.id))).stars, "Alma's are not").toBe(5);
  expect((await game.storage(PROFILES_KEY))?.profiles, 'Bo is still a player').toEqual([ALMA, BO]);
  game.expectNoErrors();
});

test('Slet spiller removes that player and their town, and goes back to the cards', async ({ page }) => {
  const game = await Game.openWithStorage(page, {
    ...Game.players([ALMA, BO]),
    [saveKeyFor(ALMA.id)]: Game.saveWith({ stars: 5 }),
    [saveKeyFor(BO.id)]: Game.saveWith({ stars: 8 }),
  });
  await game.start(BO.id);
  await game.tapNamed('TownScene', 'grownups');
  await game.waitForScene('SettingsScene');
  await game.tapNamed('SettingsScene', 'delete');
  await game.expectScreenText('SettingsScene').toContain('Ja, slet Bo');
  await game.tapNamed('SettingsScene', 'delete');
  await game.waitForScene('MainMenuScene');

  const index = await game.storage(PROFILES_KEY);
  expect(index?.profiles).toEqual([ALMA]);
  expect(index?.last, 'nobody is the last player any more').toBeNull();
  expect(await game.storage(saveKeyFor(BO.id)), "Bo's town is gone").toBeNull();
  expect((await game.storage(saveKeyFor(ALMA.id))).stars, "Alma's is not").toBe(5);
  expect(await page.evaluate(() => window.__state.profileId)).toBeNull();
  const labels = await game.visibleText('MainMenuScene');
  expect(labels).toContain('Alma');
  expect(labels).not.toContain('Bo');
  game.expectNoErrors();
});

test('six players fill the row, all on the stage, and there is no room for a seventh', async ({ page }) => {
  const six: TestProfile[] = ['kat', 'hund', 'kanin', 'bjørn', 'ræv', 'løve']
    .map((avatar, i) => ({ id: `p${i}`, name: `Wilhelmine${i}`.slice(0, 10), avatar }));
  const game = await Game.openWithStorage(page, Game.players(six));

  for (const p of six) {
    const at = await game.mustFind('MainMenuScene', `player:${p.id}`);
    expect(at.x - 62, 'inside the left edge').toBeGreaterThanOrEqual(0);
    expect(at.x + 62, 'inside the right edge').toBeLessThanOrEqual(GAME_WIDTH);
  }
  expect(await game.find('MainMenuScene', 'player:new')).toBeNull();
  game.expectNoErrors();
});

test('players come back from the native copy when web storage has been lost', async ({ page }) => {
  // The browser has no native store, so the restore is handed a pretend one — the same
  // function the Android build runs at boot, with Preferences swapped for a dictionary.
  const game = await Game.openWithStorage(page, {});
  const mirrored = {
    [PROFILES_KEY]: JSON.stringify({ version: 1, profiles: [ALMA, BO], last: BO.id }),
    [saveKeyFor(ALMA.id)]: JSON.stringify(Game.saveWith({ stars: 4 })),
    [saveKeyFor(BO.id)]: JSON.stringify(Game.saveWith({ stars: 6 })),
  };
  const restored = await page.evaluate(async ([url, store]) => {
    const profiles: any = await import(/* @vite-ignore */ url);
    // and in a real browser, with nothing native to read, it does nothing at all
    const untouched = await profiles.restoreFromMirror();
    const did = await profiles.restoreFromMirror(async (key: string) => store[key] ?? null);
    // once there is an index it never runs again, so it cannot overwrite anything newer
    const again = await profiles.restoreFromMirror(async () => { throw new Error('read'); });
    return { untouched, did, again };
  }, [PROFILES_URL, mirrored] as const);
  expect(restored).toEqual({ untouched: false, did: true, again: false });

  await page.reload();
  await game.waitForScene('MainMenuScene');
  expect(await cardText(game, ALMA.id)).toEqual(expect.arrayContaining(['Alma', '4']));
  expect(await cardText(game, BO.id)).toEqual(expect.arrayContaining(['Bo', '6']));
  await game.start(BO.id);
  await game.expectState(s => s.stars).toBe(6);
  game.expectNoErrors();
});

test('a native copy from before profiles is put back as "Spiller 1"', async ({ page }) => {
  const game = await Game.openWithStorage(page, {});
  const restored = await page.evaluate(async ([url, legacy]) => {
    const profiles: any = await import(/* @vite-ignore */ url);
    return profiles.restoreFromMirror(async (key: string) => (key === 'save' ? legacy : null));
  }, [PROFILES_URL, JSON.stringify(Game.saveWith({ stars: 23 }))] as const);
  expect(restored).toBe(true);

  const index = await game.storage(PROFILES_KEY);
  expect(index?.profiles.map((p: TestProfile) => p.name)).toEqual(['Spiller 1']);
  expect((await game.storage(saveKeyFor(index!.profiles[0].id))).stars).toBe(23);
  expect(await game.storage(LEGACY_SAVE_KEY)).toBeNull();
  game.expectNoErrors();
});
