import { test, expect } from '@playwright/test';
import { Game, readySave, readyMachine, saveKeyFor, townOf } from './game';

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
    project: 1,
    site: { stage: 99, dug: ['x', 3], gravel: 1, poured: [2, 'y'], placed: 0, rocks: [1, 1, 'z'], wrecked: -4 },
    town: [{ project: 0, color: 1 }, { nonsense: true }, { project: 0, color: 3 }],
  });
  const s = await game.state();
  expect(s.stars).toBe(0);
  expect(s.machines.gravko.parts).toEqual(['baelter']);
  expect(s.machines.gravko.diesel).toBe(1);
  expect(s.machines.gravko.oil).toBe(0);
  expect(s.machines.gravko.extra).toEqual([true, false, false]);
  expect(s.site.stage, 'the villa\'s last stage').toBe(5);
  expect(s.site.dug).toEqual([3]);
  expect(s.site.poured).toEqual([1, 0]);
  expect(s.site.rocks).toEqual([1]);
  expect(s.site.wrecked).toBe(0);
  expect(s.town, 'one building to a plot').toEqual([{ project: 0, color: 3 }]);
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

test('the town never fills up: after the hospital the road goes on with houses', async ({ page }) => {
  const town = townOf(8);
  const game = await Game.openWithSave(page, readySave({ stage: 11, placed: 5 }, { project: 8, town }));
  expect((await game.state()).stage).toBe('mal');
  await game.goTo('CraneScene');
  await game.tapNamed('CraneScene', 'paint:1');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');
  const s = await game.state();
  expect(s.town, 'nothing is swept away').toEqual([...town, { project: 8, color: 1 }]);
  expect(s.project, 'the next plot along').toBe(9);
  expect(s.stars, 'the hospital is worth fifteen').toBe(15);
  // a house again, borrowing one of the big buildings' jobs
  const stages: string[] = await page.evaluate(() => window.__state.stages.map((st: { id: string }) => st.id));
  expect(stages).toEqual(['planer', 'grav', 'grus', 'stoeb', 'rejs', 'mal']);
  await game.expectScreenText('TownScene', 'everything the town waited for is there').toContain('Byen er færdig!');
  game.expectNoErrors();
});

test('a save from before the long road keeps its houses, on plots of their own', async ({ page }) => {
  // Version 2: the four buildings came round again, and a full town of eight started over.
  // This one has built ten: the first eight were swept away, two stand in the new town,
  // and the shop of the third round is half dug.
  const game = await Game.openWithSave(page, {
    version: 2,
    stars: 40,
    project: 10,
    town: [{ project: 8, color: 2 }, { project: 9, color: 5 }],
    site: { stage: 2, dug: [0, 1], gravel: 0, poured: [], placed: 0, piles: [3, 3, 3] },
  });
  const s = await game.state();
  expect(s.town.map((b: { project: number }) => b.project), 'the first four, then the houses after the hospital')
    .toEqual([0, 1, 2, 3, 13, 14]);
  expect(s.town[0].color, 'the little house in the colour its twin was painted').toBe(2);
  expect(s.project, 'and the bus station is next').toBe(4);
  expect(s.site.stage).toBe(0);
  expect(s.site.dug).toEqual([]);
  expect(s.stars).toBe(40);
  await game.goTo('TownScene');
  game.expectNoErrors();
});
