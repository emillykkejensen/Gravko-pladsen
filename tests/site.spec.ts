import { test, expect } from '@playwright/test';
import { AT, Game, readyMachine, readySave } from './game';

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

/** Lifts every remaining frame (and the roof) into place, with whichever crane it is. */
async function raiseFrame(game: Game): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    const s = await game.state();
    if (s.stage !== 'rejs' && s.stage !== 'taarn') return;
    const placed = s.site.placed;
    const piece = await game.mustFind('CraneScene', 'piece');
    const slot = await game.sceneCall<{ x: number; y: number }>('CraneScene', 'slot');
    await game.drag(piece, slot, 16);
    await game.expectState(st => st.site.placed > placed || st.stage === 'mal', 'the frame snaps on').toBe(true);
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

/* ------------------------------------------------------- the bigger buildings --- */

test('the pile driver drives to each cross, and three bangs put a pile in', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }, { project: 2 }));
  await game.goTo('PileScene');
  expect((await game.state()).stage).toBe('pael');

  const marks = await game.sceneField<number[]>('PileScene', 'marks');
  expect(marks, 'the shop stands on three piles').toHaveLength(3);
  for (let i = 0; i < marks.length; i++) {
    // drive the rig until its mast is over the cross; it clicks into place
    const x = await game.sceneField<number>('PileScene', 'x');
    const mast = await game.sceneField<number>('PileScene', 'mastX');
    await game.drag({ x, y: GROUND_Y - 60 }, { x: x + (marks[i] - mast), y: GROUND_Y - 60 }, 14);
    await expect.poll(() => game.sceneField<string>('PileScene', 'phase'), { message: `parked over cross ${i}` })
      .toBe('parked');
    for (let bang = 0; bang < 3; bang++) await game.tapNamed('PileScene', 'bang');
    await game.expectState(s => s.site.piles[i], `pile ${i} is all the way in`).toBe(3);
  }
  await game.expectState(s => s.stage, 'then the hole is dug').toBe('grav');
  expect((await game.state()).machines.pael.diesel, 'the job used half a tank').toBe(0.5);
  // one star a pile and three for the job, on top of nothing
  expect((await game.state()).stars).toBe(6);
  await game.expectScreenText('PileScene').toContain('Videre!');
  game.expectNoErrors();
});

test('the pile driver will not bang until it is over a cross', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 0 }, { project: 2 }));
  await game.goTo('PileScene');
  const x = await game.sceneField<number>('PileScene', 'x');
  await game.drag({ x, y: GROUND_Y - 60 }, { x: x + 20, y: GROUND_Y - 60 }, 4);
  expect(await game.sceneField<string>('PileScene', 'phase')).toBe('drive');
  expect(await game.find('PileScene', 'bang'), 'no bang button yet').toBeNull();
  expect(await page.evaluate(() => window.__state.bang(0)), 'and the state agrees: the stage is open').toBe(false);
  game.expectNoErrors();
});

test('the road roller flattens the gravel by driving back and forth over it', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 2, gravel: 2 }, { project: 1 }));
  await game.goTo('RollScene');
  expect((await game.state()).stage).toBe('tromle');

  for (let pass = 0; pass < 6 && (await game.state()).stage === 'tromle'; pass++) {
    const x = await game.sceneField<number>('RollScene', 'x');
    // there and back again, over every heap
    const to = pass % 2 === 0 ? x + 420 : x - 420;
    await game.drag({ x, y: GROUND_Y - 40 }, { x: to, y: GROUND_Y - 40 }, 24);
  }
  await game.expectState(s => s.stage, 'flat, so the foundation is next').toBe('stoeb');
  const s = await game.state();
  expect(s.site.rolled).toEqual([1, 1, 1, 1, 1]);
  expect(s.machines.vejtromle.diesel).toBe(0.5);
  game.expectNoErrors();
});

test('the high-rise is raised by the tower crane, then painted', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({ stage: 5, gravel: 2 }, { project: 3 }));
  await game.goTo('CraneScene');
  expect((await game.state()).stage).toBe('taarn');

  await raiseFrame(game);
  await game.expectState(s => s.stage, 'four floors and a roof: time to paint').toBe('mal');
  expect((await game.state()).site.placed).toBe(5);
  expect((await game.state()).machines.taarnkran.diesel).toBe(0.5);

  await game.tapNamed('CraneScene', 'paint:4');
  await game.tapNamed('CraneScene', 'go');
  await game.waitForScene('TownScene');
  expect((await game.state()).town).toEqual([{ project: 3, color: 4 }]);
  game.expectNoErrors();
});

test('each building goes through its own stages, and the signpost asks for each new machine', async ({ page }) => {
  const game = await Game.openWithSave(page, readySave({}, {
    project: 1,
    machines: Object.fromEntries(['gravko', 'lastbil', 'betonbil', 'kran'].map(id => [id, readyMachine(id)])),
  }));

  const order = (project: number) => page.evaluate((p) => {
    const s = window.__state;
    s.project = p;
    s.site = { stage: 0, dug: [], gravel: 0, rolled: [], poured: [], placed: 0, piles: [] };
    return s.stages.map((st: { id: string }) => st.id);
  }, project);
  expect(await order(0)).toEqual(['grav', 'grus', 'stoeb', 'rejs', 'mal']);
  expect(await order(1)).toEqual(['grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal']);
  expect(await order(2)).toEqual(['pael', 'grav', 'grus', 'tromle', 'stoeb', 'rejs', 'mal']);
  expect(await order(3)).toEqual(['pael', 'grav', 'grus', 'tromle', 'stoeb', 'taarn', 'mal']);

  // the shop starts with the pile driver, which nobody has built yet
  await order(2);
  await game.goTo('TownScene');
  await game.expectScreenText('TownScene').toContain('Byg pælerammen');
  await game.tap(AT.sign.x, AT.sign.y);
  await game.waitForScene('AssembleScene');
  expect(await game.sceneField<string>('AssembleScene', 'machine')).toBe('pael');
  game.expectNoErrors();
});
