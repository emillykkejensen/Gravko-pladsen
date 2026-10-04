import { test, expect } from '@playwright/test';
import { Game } from './game';

/**
 * Sound is synthesised, so there is nothing to hear in a headless browser — but the
 * contract around it can be observed: no context before the first tap, one context for the
 * whole session, actions make sound and muting silences them.
 */

test('no AudioContext exists until the player interacts', async ({ page }) => {
  const game = await Game.open(page);
  expect((await game.audioTally()).contexts, 'nothing builds an AudioContext at boot').toBe(0);
  await game.start();
  expect((await game.audioTally()).contexts, 'the first tap builds exactly one').toBe(1);
  game.expectNoErrors();
});

for (const sound of [true, false]) {
  test(`a part snapping on ${sound ? 'makes a sound' : 'is silent when muted'}`, async ({ page }) => {
    const game = await Game.openWithSave(page, { settings: { sound, music: false } });
    await game.goTo('AssembleScene', { machine: 'gravko' });
    const from = await game.mustFind('AssembleScene', 'part:baelter');
    const to = await game.mustFind('AssembleScene', 'slot:baelter');
    const { sources } = await game.countingSounds(() => game.drag(from, to));
    if (sound) expect(sources, 'the clank should play').toBeGreaterThan(2);
    else expect(sources, 'muted means silent').toBe(0);
    await game.expectState(s => s.machines.gravko.parts).toEqual(['baelter']);
    game.expectNoErrors();
  });
}
