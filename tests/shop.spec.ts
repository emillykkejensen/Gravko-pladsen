import { test, expect } from '@playwright/test';
import { Game, readySave } from './game';

/**
 * The star shop: what stars are for.
 *
 * Spending must feel like getting something — the thing turns up in the town, on the
 * machines, on the paint shelf — and must never feel like losing something: the rank counts
 * every star ever earned, so it does not go down when the balance does.
 */

test('buying something spends the stars, keeps the rank, and it turns up in the town', async ({ page }) => {
  const game = await Game.openWithSave(page, { stars: 20, earned: 50 });
  await game.start();
  await game.expectScreenText('TownScene').toContain('Stjernebutik');
  expect(await game.find('TownScene', 'deco:bus')).toBeNull();

  await game.tapNamed('TownScene', 'shop');
  await game.waitForScene('ShopScene');
  await game.tapNamed('ShopScene', 'item:bus');

  const s = await game.state();
  expect(s.stars, 'the bus cost twelve').toBe(8);
  expect(s.earned, 'but nothing earned is taken back').toBe(50);
  expect(s.owned).toEqual(['bus']);
  await game.expectScreenText('ShopScene').toContain('Købt');
  await game.expectScreenText('ShopScene', 'the rank is the same as before').toContain('Formand');
  expect((await game.save()).owned).toEqual(['bus']);

  // tapping it again buys nothing twice
  await game.tapNamed('ShopScene', 'item:bus');
  expect((await game.state()).stars).toBe(8);

  await game.goTo('TownScene');
  await game.mustFind('TownScene', 'deco:bus');
  game.expectNoErrors();
});

test('something too dear is not bought, and nothing is spent', async ({ page }) => {
  const game = await Game.openWithSave(page, { stars: 3 });
  await game.goTo('ShopScene');
  await game.tapNamed('ShopScene', 'item:statue');
  expect((await game.state()).owned).toEqual([]);
  expect((await game.state()).stars).toBe(3);
  expect(await page.evaluate(() => window.__state.buy('nonsense')), 'an unknown item buys nothing').toBe(false);
  game.expectNoErrors();
});

test('a new coat of paint goes straight on the machines, and yellow can come back', async ({ page }) => {
  const game = await Game.openWithSave(page, { stars: 25 });
  await game.goTo('ShopScene');
  await game.tapNamed('ShopScene', 'tab:maskiner');
  await game.tapNamed('ShopScene', 'item:lak-roed');
  await game.expectState(s => s.livery).toBe('lak-roed');
  expect((await game.state()).stars).toBe(15);
  await game.expectScreenText('ShopScene').toContain('Valgt');

  // back to yellow, free, and red again, free — it is theirs now
  await game.tapNamed('ShopScene', 'item:gul');
  await game.expectState(s => s.livery).toBe('gul');
  await game.tapNamed('ShopScene', 'item:lak-roed');
  await game.expectState(s => s.livery).toBe('lak-roed');
  expect((await game.state()).stars).toBe(15);

  // one that has not been bought cannot be put on from outside the shop either
  expect(await page.evaluate(() => window.__state.setLivery('lak-guld'))).toBe(false);

  await page.reload();
  await game.waitForScene('MainMenuScene');
  await game.start();
  await game.expectState(s => s.livery, 'the paint is in the save').toBe('lak-roed');
  game.expectNoErrors();
});

test('a bought house colour joins the paint pots', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 4, placed: 2 }, { stars: 30 }));
  await game.goTo('CraneScene');
  expect(await game.find('CraneScene', 'paint:10'), 'no rainbow until it is bought').toBeNull();
  expect(await page.evaluate(() => window.__state.paint(10)), 'and the state will not paint with it').toBe(-1);

  await game.goTo('ShopScene');
  await game.tapNamed('ShopScene', 'tab:huse');
  await game.tapNamed('ShopScene', 'item:maling-regnbue');
  await game.expectState(s => s.owned).toEqual(['maling-regnbue']);

  await game.goTo('CraneScene');
  await game.tapNamed('CraneScene', 'paint:10');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');
  expect((await game.state()).town).toEqual([{ project: 0, color: 10 }]);
  game.expectNoErrors();
});

test('everything in the shop can be bought, and the town still draws with all of it', async ({ page }) => {
  const game = await Game.openWithSave(page, { stars: 1000 });
  const ids: string[] = await page.evaluate(async (url) => {
    const shop: any = await import(/* @vite-ignore */ url);
    return shop.SHOP_ITEMS.map((i: { id: string }) => i.id);
  }, '/src/state/Shop.ts');
  expect(ids.length).toBeGreaterThan(15);
  for (const id of ids) {
    expect(await page.evaluate((i) => window.__state.buy(i), id), `${id} can be bought`).toBe(true);
  }
  const spent = 1000 - (await game.state()).stars;
  expect(spent).toBeGreaterThan(200);
  await game.goTo('TownScene');
  for (const id of ['bus', 'ballon', 'moelle']) await game.mustFind('TownScene', `deco:${id}`);
  await game.goTo('ShopScene');
  await game.expectScreenText('ShopScene').toContain('8/8');
  game.expectNoErrors();
});
