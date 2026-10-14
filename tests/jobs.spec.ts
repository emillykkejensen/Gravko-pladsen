import { test, expect } from '@playwright/test';
import { Game, readySave, townOf } from './game';

/**
 * The town's big buildings' own jobs, each with its own machine: knocking the old shed down,
 * clearing the rocks, pushing the ground flat, putting the windows in and laying asphalt.
 * Each test starts at that stage with every machine ready.
 */

const GROUND_Y = 400;

/** A save on plot `project` at its stage `stage`, with the plots before it built. */
const at = (project: number, stage: number, site: Record<string, unknown> = {}) =>
  readySave({ stage, ...site }, { project, town: townOf(project) });

test('the stages of the big buildings, in order', async ({ page }) => {
  const game = await Game.openWithSave(page, {});
  const stages = (p: number) => page.evaluate((i) => {
    const s = window.__state;
    s.project = i;
    return s.stages.map((st: { id: string }) => st.id);
  }, p);
  expect(await stages(4)).toEqual(['planer', 'pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal']);
  expect(await stages(5)).toEqual(['sten', 'planer', 'pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal']);
  expect(await stages(6)).toEqual(['riv', 'sten', 'planer', 'pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal']);
  expect(await stages(7)).toEqual(['riv', 'sten', 'planer', 'pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'asfalt', 'mal']);
  expect(await stages(8)).toEqual([
    'riv', 'sten', 'planer', 'pael', 'grav', 'grus', 'tromle', 'stoeb', 'taarn', 'vinduer', 'asfalt', 'mal',
  ]);
  game.expectNoErrors();
});

test('the bulldozer pushes the heaps flat by driving into them', async ({ page }) => {
  const game = await Game.openWithSave(page, at(4, 0));
  await game.goTo('PlanerScene');
  expect((await game.state()).stage).toBe('planer');

  for (let pass = 0; pass < 8 && (await game.state()).stage === 'planer'; pass++) {
    const x = await game.sceneField<number>('PlanerScene', 'x');
    // forward into the heaps, then back for another go
    const to = pass % 2 === 0 ? x + 520 : x - 520;
    await game.drag({ x, y: GROUND_Y - 40 }, { x: to, y: GROUND_Y - 40 }, 26);
  }
  await game.expectState(s => s.stage, 'flat, so the piles are next').toBe('pael');
  const s = await game.state();
  expect(s.site.planed).toEqual([1, 1, 1]);
  expect(s.machines.bulldozer.diesel).toBe(0.5);
  expect(s.stars).toBe(0);
  await game.expectScreenText('PlanerScene').toContain('Videre!');
  game.expectNoErrors();
});

test('the wheel loader scoops each rock and tips it in the skip', async ({ page }) => {
  const game = await Game.openWithSave(page, at(5, 0));
  await game.goTo('RockScene');
  expect((await game.state()).stage).toBe('sten');

  for (let i = 0; i < 4; i++) {
    const rock = await game.sceneCall<{ x: number }>('RockScene', 'rock', i);
    let x = await game.sceneField<number>('RockScene', 'x');
    // out to the rock, with the bucket in front
    await game.drag({ x, y: GROUND_Y - 40 }, { x: x + (rock.x - x), y: GROUND_Y - 40 }, 14);
    await expect.poll(() => game.sceneField<number[]>('RockScene', 'carried'), { message: `rock ${i} in the bucket` })
      .toEqual([i]);
    // and back to the skip, which turns the loader round
    x = await game.sceneField<number>('RockScene', 'x');
    await game.drag({ x, y: GROUND_Y - 40 }, { x: 60, y: GROUND_Y - 40 }, 14);
    await game.expectState(s => s.site.rocks.includes(i), `rock ${i} in the skip`).toBe(true);
    await expect.poll(() => game.sceneField<boolean>('RockScene', 'tipping')).toBe(false);
  }
  await game.expectState(s => s.stage, 'the plot is clear').toBe('planer');
  expect((await game.state()).machines.laesser.diesel).toBe(0.5);
  game.expectNoErrors();
});

test('a bigger bucket carries two rocks to the skip at once', async ({ page }) => {
  const game = await Game.openWithSave(page, { ...at(5, 0), owned: ['op-laesser-1'] });
  await game.goTo('RockScene');
  const second = await game.sceneCall<{ x: number }>('RockScene', 'rock', 1);
  const x = await game.sceneField<number>('RockScene', 'x');
  await game.drag({ x, y: GROUND_Y - 40 }, { x: second.x + 10, y: GROUND_Y - 40 }, 18);
  await expect.poll(() => game.sceneField<number[]>('RockScene', 'carried')).toEqual([0, 1]);
  const back = await game.sceneField<number>('RockScene', 'x');
  await game.drag({ x: back, y: GROUND_Y - 40 }, { x: 60, y: GROUND_Y - 40 }, 14);
  await game.expectState(s => [...s.site.rocks].sort()).toEqual([0, 1]);
  game.expectNoErrors();
});

test('the wrecking ball knocks the old shed down, swing by swing', async ({ page }) => {
  const game = await Game.openWithSave(page, at(6, 0));
  await game.goTo('WreckScene');
  expect((await game.state()).stage).toBe('riv');

  // a gentle push does nothing: it has to be swung
  const tip = await game.sceneField<{ x: number; y: number }>('WreckScene', 'tip');
  for (let swing = 0; swing < 14 && (await game.state()).stage === 'riv'; swing++) {
    const wrecked = (await game.state()).site.wrecked;
    const ball = await game.sceneCall<{ x: number; y: number }>('WreckScene', 'ball');
    await game.drag(ball, { x: tip.x - 150, y: tip.y + 80 }, 10);
    await game.expectState(s => s.site.wrecked > wrecked || s.stage !== 'riv', 'the swing knocks a block down')
      .toBe(true);
  }
  await game.expectState(s => s.stage, 'the shed is gone').toBe('sten');
  expect((await game.state()).site.wrecked).toBe(6);
  game.expectNoErrors();
});

test('the lift truck puts the windows in where the basket reaches them', async ({ page }) => {
  // the hospital, its frame up
  const game = await Game.openWithSave(page, at(8, 9, { placed: 5 }));
  await game.goTo('WindowScene');
  expect((await game.state()).stage).toBe('vinduer');
  const n: number = await page.evaluate(() => window.__state.currentProject.floors * 5 - 1);

  for (let i = 0; i < n && (await game.state()).stage === 'vinduer'; i++) {
    if ((await game.state()).site.windows.includes(i)) continue;
    const c = await game.sceneCall<{ x: number; y: number }>('WindowScene', 'windowCenter', i);
    await game.down(c.x, c.y);
    await game.expectState(s => s.site.windows.includes(i) || s.stage !== 'vinduer', `window ${i} goes in`).toBe(true);
    await game.up();
  }
  await game.expectState(s => s.stage, 'then the asphalt').toBe('asfalt');
  expect((await game.state()).machines.lift.diesel).toBe(0.5);
  game.expectNoErrors();
});

test('the paver lays the asphalt, strip by strip', async ({ page }) => {
  const game = await Game.openWithSave(page, at(7, 9, { placed: 3 }));
  await game.goTo('AsphaltScene');
  expect((await game.state()).stage).toBe('asfalt');

  for (let pass = 0; pass < 6 && (await game.state()).stage === 'asfalt'; pass++) {
    const x = await game.sceneField<number>('AsphaltScene', 'x');
    const to = pass % 2 === 0 ? x + 460 : x - 460;
    await game.drag({ x, y: GROUND_Y - 30 }, { x: to, y: GROUND_Y - 30 }, 26);
  }
  await game.expectState(s => s.stage, 'laid, so it can be painted').toBe('mal');
  expect((await game.state()).site.paved).toEqual([1, 1, 1, 1, 1]);
  game.expectNoErrors();
});
