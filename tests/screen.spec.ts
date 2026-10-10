import { test, expect, Page } from '@playwright/test';
import { Game, readySave } from './game';

/**
 * The game fills whatever screen it is given.
 *
 * It used to be a fixed 880×550 stage scaled to fit, which on a phone — about twice as wide
 * as it is tall — left a band of empty sky down each side. The stage now takes the screen's
 * own shape: wider on a phone, taller on a tablet, and exactly 880×550 at the 1.6 the scenes
 * were drawn for, which is what every other test runs at.
 */

async function stage(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => ({
    width: window.__game.scale.gameSize.width,
    height: window.__game.scale.gameSize.height,
  }));
}

async function canvasBox(page: Page) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

/** Everything tappable that hangs off the edge of the stage, in a scene. */
async function offStage(page: Page, key: string): Promise<string[]> {
  return page.evaluate((k) => {
    const scene = window.__game.scene.getScene(k) as any;
    const { width, height } = scene.scale;
    const off: string[] = [];
    const walk = (objs: any[]) => {
      for (const o of objs || []) {
        if (!o?.active) continue;
        if (o.input?.enabled && o.getWorldTransformMatrix) {
          const m = o.getWorldTransformMatrix();
          if (m.tx < 0 || m.tx > width || m.ty < 0 || m.ty > height) {
            off.push(`${o.name || o.type} at ${Math.round(m.tx)},${Math.round(m.ty)}`);
          }
        }
        if (Array.isArray(o.list)) walk(o.list);
      }
    };
    walk(scene.children.list);
    return off;
  }, key);
}

test('on a phone held sideways the game fills the screen edge to edge', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const game = await Game.open(page);

  const box = await canvasBox(page);
  expect(Math.abs(box.width - 844), 'no band down either side').toBeLessThan(3);
  expect(Math.abs(box.height - 390)).toBeLessThan(3);

  const size = await stage(page);
  expect(size.height, 'the height the scenes were drawn for').toBe(550);
  expect(size.width, 'and the width of the phone').toBeGreaterThan(1150);
  game.expectNoErrors();
});

test('on a tablet the game fills the screen top to bottom', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const game = await Game.open(page);

  const box = await canvasBox(page);
  expect(Math.abs(box.width - 1024)).toBeLessThan(3);
  expect(Math.abs(box.height - 768)).toBeLessThan(3);
  expect(await stage(page)).toEqual({ width: 880, height: 660 });
  game.expectNoErrors();
});

const SCENES: [string, Record<string, unknown>, object?][] = [
  ['TownScene', { owned: ['bus', 'ballon', 'moelle', 'lygter'] }],
  ['GarageScene', {}],
  ['AssembleScene', {}, { machine: 'gravko' }],
  ['PrepScene', {}, { machine: 'kran' }],
  ['DigScene', {}],
  ['PileScene', { project: 2 }],
  ['RollScene', { project: 1 }],
  ['CraneScene', { project: 3 }],
  ['ShopScene', {}],
  ['SettingsScene', {}],
  ['ProfileScene', {}],
];

for (const [w, h, shape] of [[844, 390, 'a phone'], [1024, 768, 'a tablet']] as const) {
  test(`every scene lays itself out at ${shape}'s shape`, async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: w, height: h });

    for (const [key, patch, data] of SCENES) {
      // each scene on a save at the stage it plays, so the site screens do not send us home
      const stages: Record<string, number> = { PileScene: 0, RollScene: 2, CraneScene: 5 };
      const game = await Game.openWithSave(page, readySave({ stage: stages[key] ?? 0 }, patch));
      await game.goTo(key, data);
      await page.waitForTimeout(300);
      expect(await offStage(page, key), `${key}: everything tappable is on screen`).toEqual([]);
      game.expectNoErrors();
    }
  });
}

test('turning the screen lays the game out again, on the same machine', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const game = await Game.openWithSave(page, {});
  await game.goTo('AssembleScene', { machine: 'gravko' });
  expect((await stage(page)).width).toBeGreaterThan(1150);

  await page.setViewportSize({ width: 1200, height: 750 });
  await expect.poll(() => stage(page), { timeout: 15_000 }).toEqual({ width: 880, height: 550 });
  await game.waitForScene('AssembleScene');
  expect(await game.sceneField<string>('AssembleScene', 'machine'), 'the workshop is still on the excavator')
    .toBe('gravko');
  await game.mustFind('AssembleScene', 'part:baelter');

  const box = await canvasBox(page);
  expect(Math.abs(box.width - 1200)).toBeLessThan(3);
  game.expectNoErrors();
});
