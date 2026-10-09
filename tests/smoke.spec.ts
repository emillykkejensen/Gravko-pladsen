import { test, expect } from '@playwright/test';
import { AT, Game, readySave } from './game';

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
