import { test, expect } from '@playwright/test';
import { Game, SAVE_KEY, readySave } from './game';

/**
 * The save file: what survives a reload, and what a damaged save turns into.
 */

test('progress survives a reload', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 2, gravel: 1, poured: [1, 0.5] }, { stars: 17 }));
  await page.reload();
  await game.waitForScene('MainMenuScene');
  const s = await game.state();
  expect(s.stars).toBe(17);
  expect(s.site.stage).toBe(2);
  expect(s.site.poured).toEqual([1, 0.5]);
  expect(s.machines.kran.parts).toHaveLength(6);
  game.expectNoErrors();
});

test('a damaged save is cleaned up rather than trusted', async ({ page }) => {
  const game = await Game.openWithSave(page, {
    stars: 'lots',
    machines: {
      // a part that no longer exists, and tanks fuller than full
      gravko: { parts: ['baelter', 'raketmotor'], diesel: 7, oil: -2, extra: [true] },
    },
    site: { stage: 99, dug: ['x', 3], gravel: 1, poured: [2, 'y'], placed: 0 },
    town: [{ project: 0, color: 1 }, { nonsense: true }],
  });
  const s = await game.state();
  expect(s.stars).toBe(0);
  expect(s.machines.gravko.parts).toEqual(['baelter']);
  expect(s.machines.gravko.diesel).toBe(1);
  expect(s.machines.gravko.oil).toBe(0);
  expect(s.machines.gravko.extra).toEqual([true, false, false]);
  expect(s.site.stage).toBe(4);
  expect(s.site.dug).toEqual([3]);
  expect(s.site.poured).toEqual([1, 0]);
  expect(s.town).toEqual([{ project: 0, color: 1 }]);
  // and every screen still opens on it
  for (const scene of ['TownScene', 'GarageScene', 'CraneScene']) await game.goTo(scene);
  game.expectNoErrors();
});

test('a save from an unknown version starts fresh instead of crashing', async ({ page }) => {
  const game = await Game.openWithSave(page, { version: 99, stars: 5 });
  const s = await game.state();
  expect(s.stars).toBe(0);
  await game.goTo('TownScene');
  game.expectNoErrors();
});

test('"Start forfra" asks twice, then clears everything but the sound settings', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 3 }, {
    stars: 30, town: [{ project: 0, color: 0 }], settings: { sound: false, music: false },
  }));
  await game.goTo('SettingsScene');

  await game.tap(440, 466);
  expect((await game.state()).stars, 'the first tap only asks').toBe(30);
  await game.expectScreenText('SettingsScene').toContain('Ja, slet alt');

  await game.tap(440, 466);
  const s = await game.state();
  expect(s.stars).toBe(0);
  expect(s.town).toEqual([]);
  expect(s.machines.gravko.parts).toEqual([]);
  expect(s.settings).toEqual({ sound: false, music: false });

  const raw = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
  expect(JSON.parse(raw!).stars).toBe(0);
  game.expectNoErrors();
});

test('a full town starts a new one with the next house', async ({ page }) => {
  const town = Array.from({ length: 8 }, (_, i) => ({ project: i, color: i % 6 }));
  const game = await Game.openWithSave(page, readySave({ stage: 4, placed: 2 }, { project: 8, town }));
  await game.goTo('CraneScene');
  await game.tapNamed('CraneScene', 'paint:1');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');
  const s = await game.state();
  expect(s.town).toEqual([{ project: 8, color: 1 }]);
  game.expectNoErrors();
});
