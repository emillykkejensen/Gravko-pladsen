import { test, expect } from '@playwright/test';
import { AT, Game, readySave, townOf } from './game';

/**
 * Every screen opens on a realistic save without throwing. The flow tests cover what the
 * screens do; this catches the screen that cannot even be drawn.
 */

test('the title screen reaches the town', async ({ page }) => {
  const game = await Game.open(page);
  await game.start();
  await game.expectScreenText('TownScene', 'a new game points at building the excavator')
    .toContain('Byg gravkoen');
  game.expectNoErrors();
});

test('the town has an on-screen way back to the title screen', async ({ page }) => {
  const game = await Game.open(page);
  await game.start();
  await game.tap(AT.back.x, AT.back.y);
  await game.waitForScene('MainMenuScene');
  game.expectNoErrors();
});

const SCREENS: [string, Record<string, unknown>, object?][] = [
  ['GarageScene', {}],
  ['AssembleScene', {}, { machine: 'gravko' }],
  ['AssembleScene', readySave({ stage: 3 }, { machines: {} }), { machine: 'kran' }],
  ['PrepScene', readySave(), { machine: 'betonbil' }],
  ['DigScene', readySave({ stage: 0, dug: [0] })],
  ['GravelScene', readySave({ stage: 1 })],
  ['PourScene', readySave({ stage: 2, poured: [1, 0.4] })],
  ['CraneScene', readySave({ stage: 3, placed: 1 })],
  ['CraneScene', readySave({ stage: 4, placed: 2 })],
  ['SettingsScene', {}],
  ['ShopScene', { stars: 14, owned: ['bus', 'lak-blaa'], livery: 'lak-blaa' }],
  ['ProfileScene', {}],
  ['TownScene', readySave({ stage: 3 }, { project: 2, owned: ['lygter', 'flag', 'traer', 'bus', 'moelle', 'ballon', 'fyrvaerkeri', 'statue'] })],
  ['GarageScene', readySave({ stage: 2 }, { project: 1, machines: {} })],
  ['AssembleScene', readySave({ stage: 5 }, { project: 3, machines: {} }), { machine: 'taarnkran' }],
  ['PrepScene', readySave({}, { livery: 'lak-guld', owned: ['lak-guld'] }), { machine: 'pael' }],
  ['PileScene', readySave({ stage: 0, piles: [3, 1] }, { project: 2 })],
  ['DigScene', readySave({ stage: 1, piles: [3, 3, 3] }, { project: 2 })],
  ['RollScene', readySave({ stage: 2, gravel: 2, rolled: [1, 0.5] }, { project: 1 })],
  ['CraneScene', readySave({ stage: 5, placed: 3 }, { project: 3 })],
  ['CraneScene', readySave({ stage: 6, placed: 5 }, { project: 3 })],
  ['WreckScene', readySave({ stage: 0, wrecked: 2 }, { project: 6, town: townOf(6) })],
  ['RockScene', readySave({ stage: 1, rocks: [0] }, { project: 6, town: townOf(6) })],
  ['PlanerScene', readySave({ stage: 2, planed: [1, 0.5] }, { project: 6, town: townOf(6) })],
  ['WindowScene', readySave({ stage: 9, placed: 5, windows: [0, 3] }, { project: 8, town: townOf(8) })],
  ['AsphaltScene', readySave({ stage: 10, paved: [1, 0.3] }, { project: 8, town: townOf(8) })],
  ['CraneScene', readySave({ stage: 11, placed: 5 }, { project: 8, town: townOf(8) })],
  ['TownScene', readySave({ stage: 4 }, {
    project: 14, town: townOf(14),
    owned: ['bus', 'brandbil', 'politibil', 'tog', 'ambulance', 'helikopter', 'lygter', 'traer', 'flag', 'statue'],
  })],
  ['ShopScene', { stars: 40, town: townOf(5), machines: { gravko: readySave().machines.gravko } }],
  ['GarageScene', readySave({}, { project: 9, town: townOf(9) })],
];

SCREENS.forEach(([scene, save, data], i) => {
  test(`${scene} draws without errors (${i})`, async ({ page }) => {
    const game = await Game.openWithSave(page, save);
    await game.goTo(scene, data);
    expect(await game.activeScenes()).toContain(scene);
    // a few frames, so per-frame drawing has run too
    await page.waitForTimeout(400);
    game.expectNoErrors();
  });
});

test('a building-site screen opened at the wrong stage goes back to the town', async ({ page }) => {
  // The routes never do this, but the hardware back button and a stale save could: the
  // pour screen with nothing dug must not let concrete into a hole that is not there.
  const game = await Game.openWithSave(page, readySave({ stage: 0 }));
  await game.goTo('MainMenuScene');
  await page.evaluate(() => window.__game.scene.getScene('MainMenuScene').scene.start('PourScene'));
  await game.waitForScene('TownScene');
  game.expectNoErrors();
});
