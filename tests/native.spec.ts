import { test, expect } from '@playwright/test';
import { AT, Game } from './game';

/**
 * The conditions the Android build runs under, reproduced in a browser: a hardware back
 * button, and no network.
 */

const NAVIGATION = '/src/helpers/Navigation.ts';

test('the hardware back button goes where the on-screen arrow goes', async ({ page }) => {
  const game = await Game.open(page);

  const back = () =>
    page.evaluate(async (url) => {
      const nav: any = await import(/* @vite-ignore */ url);
      return nav.goBack(window.__game) as string;
    }, NAVIGATION);

  expect(await back(), 'the title screen is the way out').toBe('exit');

  await game.start();
  await game.tap(AT.garageDoor.x, AT.garageDoor.y);
  await game.waitForScene('GarageScene');

  expect(await back(), 'the workshop goes back to the town').toBe('moved');
  await game.waitForScene('TownScene');
  expect(await back(), 'the town goes back to the menu').toBe('moved');
  await game.waitForScene('MainMenuScene');
  expect(await back(), 'and then out').toBe('exit');
  game.expectNoErrors();
});

test('nothing is fetched from the network, so the app works offline', async ({ page }) => {
  const offsite: string[] = [];
  page.on('request', request => {
    const { hostname } = new URL(request.url());
    if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
      offsite.push(request.url());
    }
  });

  const game = await Game.open(page);
  await game.start();
  await game.tap(AT.garageDoor.x, AT.garageDoor.y);
  await game.waitForScene('GarageScene');

  expect(offsite, 'the game must not talk to anything but its own origin').toEqual([]);
  const fontLoaded = await page.evaluate(() => document.fonts.check('700 16px Nunito'));
  expect(fontLoaded, 'Nunito should be loaded from the bundle').toBe(true);
  game.expectNoErrors();
});
