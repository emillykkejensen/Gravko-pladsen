import { test, expect } from '@playwright/test';
import { Game, readySave, readyMachine, saveKeyFor } from './game';

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
    stars: 30, earned: 50, owned: ['bus', 'lak-roed'], livery: 'lak-roed',
    town: [{ project: 0, color: 0 }], settings: { sound: false, music: false },
  }));
  await game.start();
  await game.tapNamed('TownScene', 'grownups');
  await game.waitForScene('SettingsScene');

  await game.tapNamed('SettingsScene', 'reset');
  expect((await game.state()).stars, 'the first tap only asks').toBe(30);
  await game.expectScreenText('SettingsScene').toContain('Ja, start forfra');

  await game.tapNamed('SettingsScene', 'reset');
  const s = await game.state();
  expect(s.stars).toBe(0);
  expect(s.earned).toBe(0);
  expect(s.town).toEqual([]);
  expect(s.owned).toEqual([]);
  expect(s.livery).toBe('gul');
  expect(s.machines.gravko.parts).toEqual([]);
  expect(s.settings).toEqual({ sound: false, music: false });

  expect((await game.storage(saveKeyFor(Game.PLAYER.id))).stars).toBe(0);
  game.expectNoErrors();
});

test('a save from before the bigger buildings finds its place in the new stages', async ({ page }) => {
  // Version 1 counted five stages for every building. The high-rise at its old "rejs" is
  // now at the tower crane's stage, with the piles and the rolling counted as done.
  const game = await Game.openWithSave(page, {
    version: 1,
    stars: 33,
    project: 3,
    machines: { gravko: readyMachine('gravko'), kran: readyMachine('kran') },
    site: { stage: 3, dug: [], gravel: 2, poured: [1, 1, 1, 1, 1], placed: 1 },
  });
  const s = await game.state();
  expect(s.stage).toBe('taarn');
  expect(s.site.placed, 'the frames already lifted stay up').toBe(1);
  expect(s.earned, 'every star in hand was earned').toBe(33);
  expect(s.next, 'the high-rise needs the tower crane built').toMatchObject({ kind: 'assemble', machine: 'taarnkran' });
  expect(s.machines.taarnkran.parts).toEqual([]);

  // the villa at its old "stoeb" is past the new rolling stage
  const villa = await Game.openWithSave(page, {
    version: 1, project: 1, site: { stage: 2, dug: [], gravel: 2, poured: [], placed: 0 },
  });
  expect((await villa.state()).stage).toBe('stoeb');
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
