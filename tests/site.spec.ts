import { test, expect } from '@playwright/test';
import { AT, Game, readySave } from './game';

/**
 * The building site, stage by stage. Each test starts with every machine ready, so it
 * covers one stage's mechanics; the last one walks a whole building into the town.
 */

const CHUNK_W = 36;
const CHUNK_H = 32;
const HOLE_X = 342;
const GROUND_Y = 400;

/** Digs the whole hole: bucket into the next chunk, back over the heap, repeat. */
async function digHole(game: Game): Promise<void> {
  for (let guard = 0; guard < 30; guard++) {
    const s = await game.state();
    if (s.site.stage !== 0) return;
    const { holeCols, holeRows } = await game.page.evaluate(() => window.__state.currentProject);
    // the first chunk that can be reached, top-down
    let target = -1;
    for (let i = 0; i < holeCols * holeRows && target < 0; i++) {
      if (await game.page.evaluate((c) => window.__state.canDig(c), i)) target = i;
    }
    if (target < 0) return;
    const col = Math.floor(target / holeRows);
    const layer = target % holeRows;
    const dug = s.site.dug.length;

    await game.down(HOLE_X + col * CHUNK_W + CHUNK_W / 2, GROUND_Y + layer * CHUNK_H + CHUNK_H / 2);
    await game.expectState(st => st.site.dug.length, 'the bucket bites a chunk').toBe(dug + 1);
    await game.moveTo(AT.heap.x, AT.heap.y, 6);
    await expect.poll(() => game.sceneField<number>('DigScene', 'carried'), { timeout: 15_000, message: 'the bucket empties on the heap' })
      .toBe(0);
    await game.up();
  }
}

test('digging: the bucket scoops chunk by chunk and empties on the heap', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }));
  await game.goTo('DigScene');

  await digHole(game);

  const s = await game.state();
  expect(s.site.stage, 'the hole is signed off').toBe(1);
  expect(s.site.dug).toHaveLength(8);
  // a job uses half a tank
  expect(s.machines.gravko.diesel).toBe(0.5);
  expect(s.machines.gravko.oil).toBe(0.75);
  await game.expectScreenText('DigScene').toContain('Videre!');
  game.expectNoErrors();
});

test('digging: only the top chunk of a column can be scooped', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }));
  await game.goTo('DigScene');
  const reach = await page.evaluate(() => [window.__state.canDig(0), window.__state.canDig(1)]);
  expect(reach, 'layer 0 first, layer 1 only once it is gone').toEqual([true, false]);
  // reaching deep into the first column digs the top chunk, not the one underneath —
  // approached from straight above, so the bucket does not clip a neighbouring column
  await game.down(HOLE_X + CHUNK_W / 2, GROUND_Y - 90);
  await page.waitForTimeout(800);
  await game.moveTo(HOLE_X + CHUNK_W / 2, GROUND_Y + CHUNK_H * 1.5, 10);
  await game.expectState(s => s.site.dug).toEqual([0]);
  await game.up();
  game.expectNoErrors();
});

test('gravel: the truck backs up to the hole and tips', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 1 }));
  await game.goTo('GravelScene');

  const stop = await game.sceneField<number>('GravelScene', 'stopX');
  const at = await game.sceneField<number>('GravelScene', 'x');
  await game.drag({ x: at, y: GROUND_Y - 60 }, { x: stop + 40, y: GROUND_Y - 60 }, 20);
  expect(await game.sceneField<string>('GravelScene', 'phase'), 'parked at the stop sign').toBe('parked');

  await game.tapNamed('GravelScene', 'tip');
  await game.expectState(s => s.site.stage, 'one load is enough for the first house').toBe(2);
  expect((await game.state()).site.gravel).toBe(1);
  game.expectNoErrors();
});

test('gravel: the truck will not tip before it reaches the hole', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 1 }));
  await game.goTo('GravelScene');
  const at = await game.sceneField<number>('GravelScene', 'x');
  await game.drag({ x: at, y: GROUND_Y - 60 }, { x: at + 80, y: GROUND_Y - 60 }, 6);
  expect(await game.sceneField<string>('GravelScene', 'phase')).toBe('reverse');
  expect(await game.find('GravelScene', 'tip'), 'no tip button yet').toBeNull();
  game.expectNoErrors();
});

test('pouring: holding over each section fills it, then the concrete dries', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 2, gravel: 1 }));
  await game.goTo('PourScene');

  const slabX = await game.sceneField<number>('PourScene', 'slabX');
  for (let i = 0; i < 4; i++) {
    await game.down(slabX + i * 40 + 20, 360);
    await game.expectState(s => (s.site.poured[i] ?? 0) >= 1, `section ${i} fills`).toBe(true);
    await game.up();
  }
  await game.expectState(s => s.site.stage, 'dry and signed off').toBe(3);
  expect((await game.state()).machines.betonbil.diesel).toBe(0.5);
  game.expectNoErrors();
});

/** Lifts every remaining frame (and the roof) into place. */
async function raiseFrame(game: Game): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    const s = await game.state();
    if (s.site.stage !== 3) return;
    const placed = s.site.placed;
    const piece = await game.mustFind('CraneScene', 'piece');
    const slot = await game.sceneCall<{ x: number; y: number }>('CraneScene', 'slot');
    await game.drag(piece, slot, 16);
    await game.expectState(st => st.site.placed > placed || st.site.stage !== 3, 'the frame snaps on').toBe(true);
  }
}

test('the crane: frames go on bottom-up, then the house is painted and moves to town', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 3, gravel: 1, poured: [1, 1, 1, 1] }));
  await game.goTo('CraneScene');

  // a frame dropped short of its place goes back on the stack
  const piece = await game.mustFind('CraneScene', 'piece');
  await game.drag(piece, { x: 300, y: 200 });
  expect((await game.state()).site.placed).toBe(0);

  await raiseFrame(game);
  await game.expectState(s => s.site.stage, 'frame and roof done: time to paint').toBe(4);
  await game.expectScreenText('CraneScene').toContain('Vælg en farve til huset');

  await game.tapNamed('CraneScene', 'paint:2');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');

  const s = await game.state();
  expect(s.town).toEqual([{ project: 0, color: 2 }]);
  expect(s.project, 'the next building is under way').toBe(1);
  expect(s.site.stage).toBe(0);
  game.expectNoErrors();
});

test('a machine that has done two jobs needs filling up before a third', async ({ page }) => {
  // one chunk left to dig, on the excavator's second job of the tank
  const game = await Game.openWithSave(page, readySave({ stage: 0, dug: [0, 1, 2, 3, 4, 5, 6] }));
  await page.evaluate(() => {
    window.__state.machines.gravko.diesel = 0.5;
  });
  await game.goTo('DigScene');
  await digHole(game);
  const s = await game.state();
  expect(s.site.stage).toBe(1);
  expect(s.machines.gravko.diesel).toBe(0);
  expect(await page.evaluate(() => window.__state.isReady('gravko')), 'an empty tank is not ready').toBe(false);
  game.expectNoErrors();
});

/**
 * The order of the whole game, as the signpost tells it. Each screen's own mechanics are
 * covered above; this finishes each job straight in the state and checks the signpost then
 * sends the child to the right place for the next one.
 */
test('the signpost walks the whole first house in order', async ({ page }) => {
  // thirteen trips through the town under software WebGL
  test.setTimeout(300_000);
  const game = await Game.open(page);
  await game.start();

  const follow = async (expected: string) => {
    await game.goTo('TownScene');
    await game.tap(AT.sign.x, AT.sign.y);
    await game.waitForScene(expected);
  };
  const build = (m: string) => page.evaluate((id) => {
    const ids = ['baelter', 'krop', 'hus', 'bom', 'arm', 'skovl', 'hjul', 'ramme', 'lad', 'tromle', 'rende', 'drej', 'krog'];
    for (let i = 0; i < 10; i++) ids.forEach(p => window.__state.placePart(id, p));
  }, m);
  const ready = (m: string) => page.evaluate((id) => {
    window.__state.fill(id, 'diesel', 1);
    window.__state.fill(id, 'oil', 1);
    [0, 1, 2].forEach(i => window.__state.doExtra(id, i));
  }, m);

  const stages: [string, string, () => Promise<unknown>][] = [
    ['gravko', 'DigScene', () => page.evaluate(() => {
      for (let i = 0; i < 8; i++) window.__state.dig(i);
      window.__state.completeStage();
    })],
    ['lastbil', 'GravelScene', () => page.evaluate(() => {
      window.__state.tipGravel();
      window.__state.completeStage();
    })],
    ['betonbil', 'PourScene', () => page.evaluate(() => {
      for (let i = 0; i < 4; i++) window.__state.pour(i, 1);
      window.__state.completeStage();
    })],
    ['kran', 'CraneScene', () => page.evaluate(() => {
      for (let i = 0; i < 2; i++) window.__state.placePiece();
      window.__state.completeStage();
    })],
  ];

  for (const [machine, scene, work] of stages) {
    await follow('AssembleScene');
    expect(await game.sceneField<string>('AssembleScene', 'machine'), `the ${machine} is built first`).toBe(machine);
    await build(machine);
    await follow('PrepScene');
    expect(await game.sceneField<string>('PrepScene', 'machine')).toBe(machine);
    await ready(machine);
    await follow(scene);
    await work();
  }

  // painting needs no machine, so the sign goes straight to the house
  await follow('CraneScene');
  await game.expectScreenText('CraneScene').toContain('Vælg en farve til huset');
  await game.tapNamed('CraneScene', 'paint:3');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');

  const s = await game.state();
  expect(s.town).toEqual([{ project: 0, color: 3 }]);
  // the machines are all built now, and the excavator has diesel for one more job
  await follow('DigScene');
  game.expectNoErrors();
});
