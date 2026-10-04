import { test, expect } from '@playwright/test';
import { AT, Game } from './game';

/**
 * Building a machine: parts are dragged from the floor onto the machine, bottom-up.
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

  await placeAll(game, 'gravko', ['baelter', 'krop', 'hus', 'bom', 'arm', 'skovl']);

  const s = await game.state();
  expect(s.machines.gravko.parts).toHaveLength(6);
  // one star a part, and three more for the finished machine
  await game.expectState(st => st.stars, 'parts and the finished machine pay').toBe(9);
  await game.expectScreenText('AssembleScene').toContain('Gør den klar!');
  await game.expectState(st => st.next.kind).toBe('prepare');
  game.expectNoErrors();
});

test('a part will not go on before what it sits on', async ({ page }) => {
  const game = await Game.open(page);
  await game.goTo('AssembleScene', { machine: 'gravko' });

  // the bucket dropped where it belongs, with no arm to hang it on
  const bucket = await game.mustFind('AssembleScene', 'part:skovl');
  const where = await game.sceneCall<{ x: number; y: number }>('AssembleScene', 'target', 'skovl');
  await game.drag(bucket, where);

  const s = await game.state();
  expect(s.machines.gravko.parts, 'nothing should be placed').toEqual([]);
  expect(s.stars, 'and nothing paid').toBe(0);
  // it went back to the floor and can be picked up again
  expect(await game.find('AssembleScene', 'part:skovl')).not.toBeNull();
  game.expectNoErrors();
});

test('a part let go far from its place goes back to the floor', async ({ page }) => {
  const game = await Game.open(page);
  await game.goTo('AssembleScene', { machine: 'lastbil' });

  const wheels = await game.mustFind('AssembleScene', 'part:hjul');
  await game.drag(wheels, { x: 120, y: 160 });
  expect((await game.state()).machines.lastbil.parts).toEqual([]);

  const home = await game.mustFind('AssembleScene', 'part:hjul');
  expect(Math.abs(home.x - wheels.x) + Math.abs(home.y - wheels.y), 'back where it was').toBeLessThan(4);
  game.expectNoErrors();
});

test('progress on a machine survives leaving the workshop', async ({ page }) => {
  const game = await Game.open(page);
  await game.goTo('AssembleScene', { machine: 'betonbil' });
  await placeAll(game, 'betonbil', ['hjul', 'ramme']);

  await game.tap(AT.back.x, AT.back.y);
  await game.waitForScene('GarageScene');
  await game.expectScreenText('GarageScene').toContain('2 af 5 dele');

  const save = await game.save();
  expect(save.machines.betonbil.parts).toEqual(['hjul', 'ramme']);
  game.expectNoErrors();
});
