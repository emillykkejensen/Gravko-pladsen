import { test, expect } from '@playwright/test';
import { Game, readyMachine } from './game';

/**
 * Getting a built machine ready: diesel, oil, and its own third job. Filling is held —
 * the nozzle has to stay on the cap while the gauge climbs.
 */

const BUILT_EMPTY = { ...readyMachine('gravko'), diesel: 0, oil: 0, extra: [false, false, false] };

/** Holds a tool on a filler cap until the live gauge reads full. */
async function fill(game: Game, tool: 'diesel' | 'oil', machine: string): Promise<void> {
  const from = await game.mustFind('PrepScene', `tool:${tool}`);
  const cap = await game.mustFind('PrepScene', `cap:${tool}`);
  await game.down(from.x, from.y);
  await game.page.waitForTimeout(60);
  await game.moveTo(cap.x, cap.y, 10);
  await game.expectState(s => s.machines[machine][tool], `${tool} should fill while held`).toBe(1);
  await game.up();
  await game.settle();
}

test('diesel, oil and greasing make the excavator ready, and it drives to the site', async ({ page }) => {
  const game = await Game.openWithSave(page, { machines: { gravko: BUILT_EMPTY } });
  await game.goTo('PrepScene', { machine: 'gravko' });
  expect((await game.state()).next.kind).toBe('prepare');

  await fill(game, 'diesel', 'gravko');
  await fill(game, 'oil', 'gravko');
  for (let i = 0; i < 3; i++) await game.tapNamed('PrepScene', `extra:${i}`);

  await game.expectState(s => s.machines.gravko.extra).toEqual([true, true, true]);
  await game.expectState(s => s.next.kind, 'ready means the next job is on the site').toBe('site');
  // diesel, oil, the greasing and being ready each pay one
  await game.expectState(s => s.stars).toBe(4);

  // the tanks are saved, not just held in memory
  const save = await game.save();
  expect(save.machines.gravko.diesel).toBe(1);
  expect(save.machines.gravko.oil).toBe(1);

  await game.expectScreenText('PrepScene').toContain('Kør på arbejde!');
  await game.tapNamed('PrepScene', 'go');
  await game.waitForScene('DigScene');
  game.expectNoErrors();
});

test('letting go of the nozzle part-way keeps what went in', async ({ page }) => {
  const game = await Game.openWithSave(page, { machines: { gravko: BUILT_EMPTY } });
  await game.goTo('PrepScene', { machine: 'gravko' });

  const from = await game.mustFind('PrepScene', 'tool:diesel');
  const cap = await game.mustFind('PrepScene', 'cap:diesel');
  await game.down(from.x, from.y);
  await game.page.waitForTimeout(60);
  await game.moveTo(cap.x, cap.y, 10);
  await game.expectState(s => s.machines.gravko.diesel > 0.1).toBe(true);
  await game.up();
  await game.settle();

  const level = (await game.save()).machines.gravko.diesel;
  expect(level, 'some diesel went in').toBeGreaterThan(0.1);
  expect(level, 'but not a full tank').toBeLessThan(1);
  game.expectNoErrors();
});

test('the nozzle pours nothing away from the cap', async ({ page }) => {
  const game = await Game.openWithSave(page, { machines: { gravko: BUILT_EMPTY } });
  await game.goTo('PrepScene', { machine: 'gravko' });

  const from = await game.mustFind('PrepScene', 'tool:diesel');
  await game.down(from.x, from.y);
  await game.moveTo(300, 480, 6);
  await page.waitForTimeout(800);
  await game.up();
  expect((await game.state()).machines.gravko.diesel).toBe(0);
  game.expectNoErrors();
});

for (const machine of ['lastbil', 'betonbil', 'kran', 'vejtromle', 'pael', 'taarnkran']) {
  test(`${machine} has a third job of its own`, async ({ page }) => {
    const game = await Game.openWithSave(page, {
      machines: { [machine]: { ...readyMachine(machine), extra: [false, false, false] } },
    });
    await game.goTo('PrepScene', { machine });
    for (let i = 0; i < 3; i++) await game.tapNamed('PrepScene', `extra:${i}`);
    await game.expectState(s => s.machines[machine].extra).toEqual([true, true, true]);
    game.expectNoErrors();
  });
}
