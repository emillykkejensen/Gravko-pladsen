import { test, expect } from '@playwright/test';
import { AT, Game, readyMachine } from './game';

/**
 * Building a machine: parts are dragged from the floor onto the machine, in any order.
 * On the first building, machines unlock one at a time as the site needs them.
 */

async function placeAll(game: Game, machine: string, parts: string[]): Promise<void> {
  for (const part of parts) {
    const from = await game.mustFind('AssembleScene', `part:${part}`);
    const to = await game.mustFind('AssembleScene', `slot:${part}`);
    await game.drag(from, to);
    await game.expectState(s => s.machines[machine].parts.includes(part), `${part} should snap on`).toBe(true);
  }
}

test('the signpost leads a new player to the workshop, and the excavator can be built', async ({ page }) => {
  const game = await Game.open(page);
  await game.start();

  await game.tap(AT.sign.x, AT.sign.y);
  await game.waitForScene('AssembleScene');

  // top-down, the opposite of how a real one goes together: any order is fine
  await placeAll(game, 'gravko', ['skovl', 'arm', 'hus', 'bom', 'krop', 'baelter']);

  const s = await game.state();
  expect(s.machines.gravko.parts).toHaveLength(6);
  // one star a part, and three more for the finished machine
  await game.expectState(st => st.stars, 'parts and the finished machine pay').toBe(9);
  await game.expectScreenText('AssembleScene').toContain('Gør den klar!');
  await game.expectState(st => st.next.kind).toBe('prepare');
  game.expectNoErrors();
});

test('a part let go roughly near its place snaps on', async ({ page }) => {
  const game = await Game.open(page);
  await game.goTo('AssembleScene', { machine: 'gravko' });

  // the bucket first, with no arm to hang it on, and let go well off the mark
  const bucket = await game.mustFind('AssembleScene', 'part:skovl');
  const where = await game.sceneCall<{ x: number; y: number }>('AssembleScene', 'target', 'skovl');
  await game.drag(bucket, { x: where.x - 70, y: where.y + 50 });

  await game.expectState(s => s.machines.gravko.parts, 'it snaps on anyway').toEqual(['skovl']);
  await game.expectState(s => s.stars, 'and pays its star').toBe(1);
  game.expectNoErrors();
});

test('on the first building, only the machine the site needs can be built', async ({ page }) => {
  const game = await Game.open(page);
  expect(await page.evaluate(() => ['gravko', 'lastbil', 'betonbil', 'kran'].map(id => window.__state.isUnlocked(id))))
    .toEqual([true, false, false, false]);
  expect(await page.evaluate(() => window.__state.placePart('lastbil', 'hjul')), 'a locked machine takes no parts')
    .toBe(false);

  // a locked card in the workshop says "later" instead of opening
  await game.goTo('GarageScene');
  await game.tapNamed('GarageScene', 'card:lastbil');
  await page.waitForTimeout(400);
  expect(await game.activeScenes()).toContain('GarageScene');

  // and the workshop itself sends a stale route back
  await page.evaluate(() => window.__game.scene.getScene('GarageScene').scene.start('AssembleScene', { machine: 'kran' }));
  await game.waitForScene('GarageScene');
  expect(await game.activeScenes()).not.toContain('AssembleScene');

  // once the hole is dug, the truck opens
  await page.evaluate(() => {
    window.__state.machines.gravko = { parts: ['baelter', 'krop', 'hus', 'bom', 'arm', 'skovl'], diesel: 1, oil: 1, extra: [true, true, true] };
    for (let i = 0; i < 8; i++) window.__state.dig(i);
    window.__state.completeStage();
  });
  expect(await page.evaluate(() => ['gravko', 'lastbil', 'betonbil', 'kran'].map(id => window.__state.isUnlocked(id))))
    .toEqual([true, true, false, false]);
  game.expectNoErrors();
});

test('a part let go far from its place goes back to the floor', async ({ page }) => {
  const game = await Game.open(page);
  await game.goTo('AssembleScene', { machine: 'gravko' });

  const tracks = await game.mustFind('AssembleScene', 'part:baelter');
  await game.drag(tracks, { x: 100, y: 160 });
  expect((await game.state()).machines.gravko.parts).toEqual([]);

  const home = await game.mustFind('AssembleScene', 'part:baelter');
  expect(Math.abs(home.x - tracks.x) + Math.abs(home.y - tracks.y), 'back where it was').toBeLessThan(4);
  game.expectNoErrors();
});

test('progress on a machine survives leaving the workshop', async ({ page }) => {
  // the mixer opens once the gravel is in
  const game = await Game.openWithSave(page, {
    machines: { gravko: readyMachine('gravko'), lastbil: readyMachine('lastbil') },
    site: { stage: 2, dug: [0, 1, 2, 3, 4, 5, 6, 7], gravel: 1, poured: [], placed: 0 },
  });
  await game.goTo('AssembleScene', { machine: 'betonbil' });
  await placeAll(game, 'betonbil', ['hjul', 'ramme']);

  await game.tap(AT.back.x, AT.back.y);
  await game.waitForScene('GarageScene');
  await game.expectScreenText('GarageScene').toContain('2 af 5 dele');

  const save = await game.save();
  expect(save.machines.betonbil.parts).toEqual(['hjul', 'ramme']);
  game.expectNoErrors();
});
