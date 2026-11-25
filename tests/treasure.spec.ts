import { test, expect } from '@playwright/test';
import { AT, Game, readySave, saveKeyFor, townOf } from './game';
import { TREASURES, treasureChunk, treasureFor } from '../src/state/Treasures';

/**
 * Finding things: a treasure buried in every hole, the chest that keeps them, the people
 * who live in the town, and the foreman who explains each job.
 */

const CHUNK_W = 36;
const CHUNK_H = 32;
const HOLE_X = 342;
const GROUND_Y = 400;

/** Scoops one chunk (it must be reachable) and empties the bucket on the heap. */
async function scoop(game: Game, chunk: number, rows: number): Promise<void> {
  const dug = (await game.state()).site.dug.length;
  const col = Math.floor(chunk / rows);
  const layer = chunk % rows;
  // from straight above, so the bucket does not clip a neighbouring column on the way down
  await game.down(HOLE_X + col * CHUNK_W + CHUNK_W / 2, GROUND_Y - 90);
  await game.page.waitForTimeout(600);
  await game.moveTo(HOLE_X + col * CHUNK_W + CHUNK_W / 2, GROUND_Y + layer * CHUNK_H + CHUNK_H / 2, 10);
  await game.expectState(s => s.site.dug.length, 'the bucket bites a chunk').toBeGreaterThan(dug);
  await game.moveTo(AT.heap.x, AT.heap.y, 8);
  await expect.poll(() => game.sceneField<number>('DigScene', 'carried'), { timeout: 15_000 }).toBe(0);
  await game.up();
}

/** Where a town object is on the screen: the road slides, so its camera scroll comes off. */
async function onScreen(game: Game, name: string): Promise<{ x: number; y: number }> {
  const at = await game.mustFind('TownScene', name);
  const scroll = await game.page.evaluate(() => window.__game.scene.getScene('TownScene').cameras.main.scrollX);
  return { x: at.x - scroll, y: at.y };
}

test('every building has its own find, buried at the bottom of the hole', () => {
  expect(new Set(TREASURES.map(t => t.id)).size, 'ids are unique').toBe(TREASURES.length);
  // the town's own buildings each find something new, the hospital last of all the golden horn
  expect(TREASURES).toHaveLength(17);
  expect(treasureFor(0).id).toBe('orm');
  expect(treasureFor(16).id).toBe('guldhorn');
  // and after that they come round again
  expect(treasureFor(17).id).toBe('orm');
  for (const [cols, rows] of [[4, 2], [5, 3], [6, 3]]) {
    for (let p = 0; p < 20; p++) {
      const chunk = treasureChunk(p, cols, rows);
      expect(chunk % rows, 'in the bottom layer').toBe(rows - 1);
      expect(chunk).toBeLessThan(cols * rows);
    }
  }
});

test('digging down to the glint brings up the find, and it goes in the chest', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }));
  await game.goTo('DigScene');
  // the first house: 4 columns of 2, the worm at the bottom of the second column
  const chunk = await page.evaluate(() => window.__state.treasureChunk);
  expect(chunk).toBe(3);

  await scoop(game, 2, 2);
  expect((await game.state()).site.dug).toEqual([2]);
  expect(await page.evaluate(() => window.__state.treasures), 'nothing found in the top layer').toEqual([]);

  await scoop(game, 3, 2);
  await game.expectScreenText('DigScene').toContain('Du fandt en regnorm!');
  await game.expectScreenText('DigScene', 'it is new to the chest').toContain('Ny!');
  expect(await page.evaluate(() => [window.__state.treasures, window.__state.newTreasures, window.__state.treasureChunk]))
    .toEqual([['orm'], 1, -1]);
  // kept, for the next time the game is opened
  const saved = await game.save();
  expect(saved.treasures).toEqual(['orm']);
  game.expectNoErrors();
});

test('a house further down the road finds the same thing again, without counting it twice', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }, {
    project: 17, town: townOf(17), treasures: ['orm'], treasuresSeen: 1,
  }));
  const found = await page.evaluate(() => {
    const s = window.__state;
    const chunk = s.treasureChunk;
    const other = (chunk + 1) % (s.currentProject.holeCols * s.currentProject.holeRows);
    return { miss: s.unearth([other]), hit: s.unearth([chunk]), treasures: s.treasures, fresh: s.newTreasures };
  });
  expect(found.miss, 'only the chunk it is buried in').toBeNull();
  expect(found.hit.treasure.id).toBe('orm');
  expect(found.hit.fresh).toBe(false);
  expect(found.treasures).toEqual(['orm']);
  expect(found.fresh).toBe(0);
  game.expectNoErrors();
});

test('a damaged save keeps only finds that exist, once each', async ({ page }) => {
  const game = await Game.openWithSave(page, { treasures: ['rav', 'nonsense', 'rav', 7, 'dino'], treasuresSeen: 40 });
  const s = await page.evaluate(() => [window.__state.treasures, window.__state.treasuresSeen, window.__state.newTreasures]);
  expect(s).toEqual([['rav', 'dino'], 2, 0]);
  // and a save from before there were treasures simply has none
  await page.evaluate((key) => {
    const raw = JSON.parse(window.localStorage.getItem(key)!);
    delete raw.treasures;
    delete raw.treasuresSeen;
    window.localStorage.setItem(key, JSON.stringify(raw));
  }, saveKeyFor(Game.PLAYER.id));
  await page.reload();
  await game.waitForScene('MainMenuScene');
  expect(await page.evaluate(() => [window.__state.treasures, window.__state.newTreasures])).toEqual([[], 0]);
  game.expectNoErrors();
});

test('the chest: new finds are counted in the town, and seen once it is opened', async ({ page }) => {
  const game = await Game.openWithSave(page, { treasures: ['orm', 'rav', 'hestesko'], treasuresSeen: 1 });
  await game.start();
  expect(await page.evaluate(() => window.__state.newTreasures), 'two new finds on the badge').toBe(2);
  await game.tapNamed('TownScene', 'chest');
  await game.waitForScene('TreasureScene');
  await game.expectScreenText('TreasureScene').toContain(`3 af ${TREASURES.length} skatte fundet`);
  // the newest is on show, with what it is
  await game.mustFind('TreasureScene', 'showing:hestesko');
  await game.expectScreenText('TreasureScene').toContain('Hestesko');
  expect(await page.evaluate(() => window.__state.newTreasures), 'opening the chest sees them').toBe(0);
  expect((await game.save()).treasuresSeen).toBe(3);

  // another one on the shelf is put on show
  await game.tapNamed('TreasureScene', 'treasure:orm');
  await game.mustFind('TreasureScene', 'showing:orm');
  await game.expectScreenText('TreasureScene').toContain('Regnorme graver gange');

  // one still in the ground just says so
  await game.tapNamed('TreasureScene', 'treasure:guldhorn');
  await game.mustFind('TreasureScene', 'showing:orm');

  await game.tap(AT.back.x, AT.back.y);
  await game.waitForScene('TownScene');
  game.expectNoErrors();
});

test('an empty chest says there is something to dig for', async ({ page }) => {
  const game = await Game.open(page);
  await game.start();
  await game.tapNamed('TownScene', 'chest');
  await game.waitForScene('TreasureScene');
  await game.expectScreenText('TreasureScene').toContain('Kisten er tom');
  await game.expectScreenText('TreasureScene').toContain(`0 af ${TREASURES.length} skatte fundet`);
  game.expectNoErrors();
});

test('the town has people: one for each building, and they say hello', async ({ page }) => {
  const game = await Game.openWithSave(page, { project: 3, town: townOf(3) });
  await game.start();
  for (const i of [0, 1, 2]) await game.mustFind('TownScene', `person:${i}`);
  expect(await game.find('TownScene', 'person:3'), 'nobody lives on the site yet').toBeNull();

  const person = await onScreen(game, 'person:1');
  await game.tap(person.x, person.y - 12);
  expect(await game.activeScenes(), 'a hello, not a trip somewhere').toContain('TownScene');

  // a knock on a finished building: someone comes to the door to welcome you
  const plot = await onScreen(game, 'person:2');
  await game.tap(plot.x + 44, plot.y - 70);
  await game.expectScreenText('TownScene').toContain('Velkommen til butikken!');
  game.expectNoErrors();
});

test('the foreman says what a finished stage was for, and tells a fact about a new machine', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0, dug: [0, 1, 2, 3, 4, 5, 6] }));
  await game.goTo('DigScene');
  await scoop(game, 7, 2);
  await game.expectState(s => s.site.stage).toBe(1);
  await game.mustFind('DigScene', 'foreman');
  await game.expectScreenText('DigScene').toContain('Hullet er gravet. Nu skal der grus i bunden!');

  await game.goTo('AssembleScene', { machine: 'gravko' });
  await game.expectScreenText('AssembleScene').toContain('Vidste du?');
  await game.expectScreenText('AssembleScene').toContain('tænder på skovlen');
  game.expectNoErrors();
});
