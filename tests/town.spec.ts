import { test, expect, Page } from '@playwright/test';
import { AT, Game, readyMachine, readySave, townOf } from './game';

/**
 * The town's long road, what it shows of what is coming, the stars a building pays, the
 * upgrades, and the buttons kept clear of the bottom edge.
 */

const scrollX = (page: Page) => page.evaluate(() => (window.__game.scene.getScene('TownScene') as any).cameras.main.scrollX);

test('the road shows every building to come, faded, and slides left and right', async ({ page }) => {
  const game = await Game.open(page);
  await game.start();
  // the faded buildings say what they will be
  await game.expectScreenText('TownScene').toContain('Busstationen');
  await game.expectScreenText('TownScene').toContain('Hospitalet');

  // a finger slides the road along
  const before = await scrollX(page);
  await game.drag({ x: 700, y: 240 }, { x: 200, y: 240 }, 12);
  const after = await scrollX(page);
  expect(after, 'the road moved to show more of it').toBeGreaterThan(before + 200);

  // and the arrow at the end slides it back
  await game.tapNamed('TownScene', 'road:left');
  await expect.poll(() => scrollX(page)).toBeLessThan(after);

  // the signpost does not slide with it, and still works
  await game.tap(AT.sign.x, AT.sign.y);
  await game.waitForScene('AssembleScene');
  game.expectNoErrors();
});

test('a finished building is the only thing that pays stars, the bigger the more', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 3, gravel: 1, poured: [1, 1, 1, 1] }));
  await game.goTo('CraneScene');
  await page.evaluate(() => {
    window.__state.placePiece();
    window.__state.placePiece();
    window.__state.completeStage();
  });
  expect((await game.state()).stars, 'raising the frame pays nothing').toBe(0);
  await game.goTo('CraneScene');
  await game.tapNamed('CraneScene', 'paint:0');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');
  await game.expectState(s => s.stars, 'the little house is worth five').toBe(5);
  const worth: number[] = await page.evaluate(async (url) => {
    const m: any = await import(/* @vite-ignore */ url);
    return m.PROJECTS.map((p: { stars: number }) => p.stars);
  }, '/src/state/Projects.ts');
  expect(worth, 'each building pays at least as much as the one before').toEqual([...worth].sort((a, b) => a - b));
  game.expectNoErrors();
});

test('upgrades make a machine do more at a time', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }, { project: 1, town: townOf(1) }));
  const own = (ids: string[]) => page.evaluate((list) => { window.__state.owned = list; }, ids);

  // a big bucket scoops two chunks, down the same column
  await own(['op-gravko-1']);
  expect(await page.evaluate(() => window.__state.scoop(0))).toEqual([0, 1]);
  // a giant one four
  await own(['op-gravko-1', 'op-gravko-2']);
  expect(await page.evaluate(() => window.__state.scoop(2))).toHaveLength(4);

  // a big truck bed brings the villa's two loads in one trip
  await page.evaluate(() => {
    window.__state.site.stage = 1;
  });
  await own(['op-lastbil-1']);
  expect(await page.evaluate(() => window.__state.tipGravel())).toBe(true);
  expect((await game.state()).site.gravel).toBe(2);

  // a strong hook lifts two floors at once: the villa's two, then the roof
  await page.evaluate(() => {
    window.__state.site.stage = 4;
  });
  await own(['op-kran-1']);
  expect(await page.evaluate(() => window.__state.liftCount)).toBe(2);
  await game.goTo('CraneScene');
  await game.expectScreenText('CraneScene').toContain('Løft 2 på én gang!');
  const piece = await game.mustFind('CraneScene', 'piece');
  const slot = await game.sceneCall<{ x: number; y: number }>('CraneScene', 'slot');
  await game.drag(piece, slot, 16);
  await game.expectState(s => s.site.placed, 'both floors in one lift').toBe(2);
  game.expectNoErrors();
});

test('the buttons a child presses stay clear of the bottom edge', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 4, placed: 2 }));
  const floor = 550 - 96;
  await game.goTo('CraneScene');
  await game.tapNamed('CraneScene', 'paint:0');
  expect((await game.mustFind('CraneScene', 'paint:0')).y).toBeLessThanOrEqual(floor);
  expect((await game.mustFind('CraneScene', 'go')).y).toBeLessThanOrEqual(floor);

  await game.goTo('PrepScene', { machine: 'gravko' });
  expect((await game.mustFind('PrepScene', 'go')).y).toBeLessThanOrEqual(floor);
  game.expectNoErrors();
});

test('the workshop has a bay for every machine, and they all fit', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({}, {
    project: 17, town: townOf(17), owned: ['op-gravko-1'],
  }));
  await game.goTo('GarageScene');
  for (const id of ['gravko', 'bulldozer', 'laesser', 'nedriv', 'asfalt', 'lift']) {
    const at = await game.mustFind('GarageScene', `card:${id}`);
    expect(at.y, `${id}'s card is on the screen`).toBeLessThan(550 - 60);
  }
  await game.tapNamed('GarageScene', 'card:lift');
  await game.waitForScene('PrepScene');
  game.expectNoErrors();
});

test('every new machine can be got ready: filled up and its own job done', async ({ page }) => {
  const game = await Game.openWithSave(page, {
    project: 17, town: townOf(17),
    machines: Object.fromEntries(['bulldozer', 'laesser', 'nedriv', 'asfalt', 'lift'].map(id => [id,
      { ...readyMachine(id), diesel: 0, oil: 0, extra: [false, false, false] }])),
  });
  for (const id of ['bulldozer', 'laesser', 'nedriv', 'asfalt', 'lift']) {
    await game.goTo('PrepScene', { machine: id });
    for (let i = 0; i < 3; i++) await game.tapNamed('PrepScene', `extra:${i}`);
    await game.expectState(s => s.machines[id].extra, `${id}'s own job`).toEqual([true, true, true]);
  }
  game.expectNoErrors();
});

test('a machine can be upgraded in the workshop, while it is being filled up', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({}, { stars: 12 }));
  await game.goTo('PrepScene', { machine: 'gravko' });
  await game.expectScreenText('PrepScene').toContain('Opgrader: Stor skovl');
  await game.tapNamed('PrepScene', 'upgrade');
  await game.expectState(s => s.owned).toEqual(['op-gravko-1']);
  expect((await game.state()).stars).toBe(7);
  await game.expectScreenText('PrepScene', 'the next one is offered').toContain('Opgrader: Kæmpeskovl');
  // ten stars for the next one, and only seven left: nothing is spent
  await game.tapNamed('PrepScene', 'upgrade');
  expect((await game.state()).owned).toEqual(['op-gravko-1']);
  expect((await game.state()).stars).toBe(7);
  game.expectNoErrors();
});

test('ordinary buildings stand between the big ones on the road', async ({ page }) => {
  const game = await Game.open(page);
  const kinds: string[] = await page.evaluate(async (url) => {
    const m: any = await import(/* @vite-ignore */ url);
    return m.PROJECTS.map((p: { kind: string }) => p.kind);
  }, '/src/state/Projects.ts');
  expect(kinds).toHaveLength(17);
  const big = ['busstation', 'brandstation', 'politi', 'togstation', 'hospital'];
  const at = big.map(k => kinds.indexOf(k));
  for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1], `two buildings before ${big[i]}`).toBe(3);
  await game.start();
  await game.expectScreenText('TownScene').toContain('Rækkehusene');
  game.expectNoErrors();
});
