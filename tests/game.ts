import { Page, expect } from '@playwright/test';
import { GAME_HEIGHT, GAME_WIDTH } from '../src/config';

/** What the audio spy has seen: node counts. */
type Tally = { contexts: number; oscillators: number; buffers: number };

type Pt = { x: number; y: number };

export const SAVE_KEY = 'gravko-spil-save';

const ALL_PARTS: Record<string, string[]> = {
  gravko: ['baelter', 'krop', 'hus', 'bom', 'arm', 'skovl'],
  lastbil: ['hjul', 'ramme', 'hus', 'lad'],
  betonbil: ['hjul', 'ramme', 'hus', 'tromle', 'rende'],
  kran: ['hjul', 'ramme', 'hus', 'drej', 'bom', 'krog'],
};

/** A machine that is built, full and ready for work. */
export const readyMachine = (id: string) => ({
  parts: [...ALL_PARTS[id]], diesel: 1, oil: 1, extra: [true, true, true],
});

/** A machine nobody has started building. */
export const emptyMachine = () => ({ parts: [], diesel: 0, oil: 0, extra: [false, false, false] });

/** A save with every machine ready, at the given stage of the first project. */
export function readySave(site: Partial<{ stage: number; dug: number[]; gravel: number; poured: number[]; placed: number }> = {}, patch: Record<string, unknown> = {}) {
  return {
    machines: {
      gravko: readyMachine('gravko'),
      lastbil: readyMachine('lastbil'),
      betonbil: readyMachine('betonbil'),
      kran: readyMachine('kran'),
    },
    site: { stage: 0, dug: [], gravel: 0, poured: [], placed: 0, ...site },
    ...patch,
  };
}

/**
 * Test harness for driving the Phaser canvas.
 *
 * Everything goes through game coordinates (GAME_WIDTH x GAME_HEIGHT, read from the game's
 * own config) rather than screen pixels, so a different viewport does not move every
 * target. Where a target moves with the game state — a part on the floor, the slot it
 * snaps to — the harness asks the scene where the named object is rather than hard-coding
 * a position.
 */
export class Game {
  readonly errors: string[] = [];

  constructor(readonly page: Page) {
    page.on('pageerror', e => this.errors.push(e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource|net::|ERR_|favicon/.test(t)) return;
      this.errors.push(t);
    });
  }

  static async open(page: Page): Promise<Game> {
    const game = new Game(page);
    // Reduced motion collapses fades and the press squash, so the suite is not gated on
    // animation time under software WebGL.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => window.localStorage.clear());
    await Game.installAudioSpy(page);
    await page.goto('/');
    await game.waitForScene('MainMenuScene');
    return game;
  }

  /** Opens the game on a prepared save. Sound is on and music off unless the patch says. */
  static async openWithSave(page: Page, patch: Record<string, unknown>): Promise<Game> {
    const game = new Game(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await Game.installAudioSpy(page);
    await page.addInitScript(([key, seed]) => {
      window.localStorage.setItem(key as string, JSON.stringify(seed));
    }, [SAVE_KEY, {
      version: 1,
      stars: 0,
      machines: {
        gravko: emptyMachine(), lastbil: emptyMachine(), betonbil: emptyMachine(), kran: emptyMachine(),
      },
      project: 0,
      site: { stage: 0, dug: [], gravel: 0, poured: [], placed: 0 },
      town: [],
      // music off: a continuous pad would pollute the audio counts
      settings: { sound: true, music: false },
      ...patch,
    }] as const);
    await page.goto('/');
    await game.waitForScene('MainMenuScene');
    return game;
  }

  /** Counts Web Audio nodes as they are created, through a passthrough AudioContext. */
  private static async installAudioSpy(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const tally = { contexts: 0, oscillators: 0, buffers: 0 };
      (window as any).__audio = tally;
      const Real = window.AudioContext;
      if (!Real) return;
      window.AudioContext = class extends Real {
        constructor(...args: any[]) {
          super(...(args as []));
          tally.contexts++;
        }
        createOscillator() {
          tally.oscillators++;
          return super.createOscillator();
        }
        createBufferSource() {
          tally.buffers++;
          return super.createBufferSource();
        }
      } as unknown as typeof AudioContext;
    });
  }

  async audioTally(): Promise<Tally> {
    return this.page.evaluate(() => ({ ...(window as any).__audio }));
  }

  /** How many sound sources a block of work started. */
  async countingSounds<T>(work: () => Promise<T>): Promise<{ result: T; sources: number }> {
    const before = await this.audioTally();
    const result = await work();
    const after = await this.audioTally();
    return { result, sources: after.oscillators - before.oscillators + (after.buffers - before.buffers) };
  }

  /* ---------------------------------------------------------------- pointer --- */

  private async screen(gx: number, gy: number): Promise<Pt> {
    const box = await this.page.locator('canvas').boundingBox();
    if (!box) throw new Error('canvas not found');
    return { x: box.x + (gx / GAME_WIDTH) * box.width, y: box.y + (gy / GAME_HEIGHT) * box.height };
  }

  async tap(gx: number, gy: number): Promise<void> {
    const p = await this.screen(gx, gy);
    await this.page.mouse.click(p.x, p.y);
    await this.settle();
  }

  async down(gx: number, gy: number): Promise<void> {
    const p = await this.screen(gx, gy);
    await this.page.mouse.move(p.x, p.y);
    await this.page.mouse.down();
  }

  async moveTo(gx: number, gy: number, steps = 8): Promise<void> {
    const p = await this.screen(gx, gy);
    await this.page.mouse.move(p.x, p.y, { steps });
  }

  async up(): Promise<void> {
    await this.page.mouse.up();
  }

  /** Press, glide, release — a finger dragging something across the screen. */
  async drag(from: Pt, to: Pt, steps = 12): Promise<void> {
    await this.down(from.x, from.y);
    // a frame for the game to see the press before the move starts
    await this.page.waitForTimeout(60);
    await this.moveTo(to.x, to.y, steps);
    await this.page.waitForTimeout(60);
    await this.up();
    await this.settle();
  }

  /**
   * Waits for the game to stop moving rather than sleeping a fixed time. Software WebGL
   * runs at a few frames a second, so a fixed wait fires the next tap into the old scene.
   */
  async settle(timeout = 15_000): Promise<void> {
    await this.page.waitForFunction(() => {
      const scenes = window.__game.scene.getScenes(true);
      if (scenes.length === 0) return false;
      for (const raw of scenes) {
        const scene = raw as any;
        const cam = scene.cameras?.main;
        if (cam?.fadeEffect?.isRunning || cam?.flashEffect?.isRunning) return false;
        const busyTweens = scene.tweens.getTweens().some((t: any) => {
          if (t.isPlaying && !t.isPlaying()) return false;
          const loops = t.data?.some?.((d: any) => d.repeat === -1);
          return !loops;
        });
        if (busyTweens) return false;
        const pending = (scene.time?._active ?? []) as any[];
        if (pending.some((e: any) => !e.loop && !e.repeat && !e.paused)) return false;
      }
      return true;
    }, undefined, { timeout, polling: 100 });
  }

  /* ----------------------------------------------------------------- scenes --- */

  async activeScenes(): Promise<string[]> {
    return this.page.evaluate(() => window.__game.scene.getScenes(true).map(s => s.scene.key));
  }

  async waitForScene(key: string): Promise<void> {
    await expect
      .poll(() => this.activeScenes(), { timeout: 25_000, message: `waiting for ${key}` })
      .toContain(key);
    await this.settle();
  }

  /** Starts a scene directly, the way a route through the game would. */
  async goTo(key: string, data?: object): Promise<void> {
    await this.page.evaluate(([k, d]) => {
      const active = window.__game.scene.getScenes(true)[0];
      active.scene.start(k as string, d as object | undefined);
    }, [key, data] as const);
    await this.waitForScene(key);
  }

  /** Title screen to town. */
  async start(): Promise<void> {
    await this.tap(AT.play.x, AT.play.y);
    await this.waitForScene('TownScene');
  }

  /**
   * Where a named game object is, in game coordinates. Searches containers too, and uses
   * the world transform, so a part inside a scaled container is found where it is drawn.
   */
  async find(sceneKey: string, name: string): Promise<Pt | null> {
    return this.page.evaluate(([key, n]) => {
      const scene = window.__game.scene.getScene(key) as any;
      const walk = (objs: any[]): any => {
        for (const o of objs) {
          if (!o) continue;
          if (o.name === n && o.active) return o;
          if (Array.isArray(o.list)) {
            const hit = walk(o.list);
            if (hit) return hit;
          }
        }
        return null;
      };
      const o = walk(scene.children.list);
      if (!o) return null;
      const m = o.getWorldTransformMatrix();
      return { x: m.tx, y: m.ty };
    }, [sceneKey, name] as const);
  }

  async mustFind(sceneKey: string, name: string): Promise<Pt> {
    let found: Pt | null = null;
    await expect.poll(async () => {
      found = await this.find(sceneKey, name);
      return found !== null;
    }, { timeout: 15_000, message: `${name} should be on screen in ${sceneKey}` }).toBe(true);
    return found!;
  }

  /** Taps a named object, wherever it currently is. */
  async tapNamed(sceneKey: string, name: string): Promise<void> {
    const p = await this.mustFind(sceneKey, name);
    await this.tap(p.x, p.y);
  }

  /** A field of a scene instance — for state that lives in the scene, not in the save. */
  async sceneField<T>(sceneKey: string, field: string): Promise<T> {
    return this.page.evaluate(([key, f]) => (window.__game.scene.getScene(key) as any)[f], [sceneKey, field] as const);
  }

  /** Calls a method on a scene and returns the result. */
  async sceneCall<T>(sceneKey: string, method: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(([key, m, a]) => {
      const scene = window.__game.scene.getScene(key as string) as any;
      return scene[m as string](...(a as unknown[]));
    }, [sceneKey, method, args] as const);
  }

  /* ------------------------------------------------------------------ state --- */

  /** The live game state — the tank gauges move between saves. */
  async state(): Promise<any> {
    return this.page.evaluate(() => JSON.parse(JSON.stringify({
      stars: window.__state.stars,
      machines: window.__state.machines,
      project: window.__state.project,
      site: window.__state.site,
      town: window.__state.town,
      settings: window.__state.settings,
      next: window.__state.nextStep(),
    })));
  }

  /** Polls the live state, so a slow renderer means a slower pass rather than a failure. */
  expectState(read: (s: any) => unknown, message?: string) {
    return expect.poll(async () => read(await this.state()), { timeout: 20_000, message });
  }

  /** The persisted save, which is what survives closing the game. */
  async save(): Promise<any> {
    return this.page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, SAVE_KEY);
  }

  /** Every Text string currently on screen in a scene, containers included. */
  async visibleText(sceneKey: string): Promise<string[]> {
    return this.page.evaluate((key) => {
      const out: string[] = [];
      const walk = (objs: any[]) => {
        for (const o of objs) {
          if (!o) continue;
          if (o.type === 'Text' && typeof o.text === 'string' && o.visible && o.active) out.push(o.text);
          if (Array.isArray(o.list)) walk(o.list);
        }
      };
      const scene = window.__game.scene.getScene(key) as any;
      walk(scene.children.list);
      return out;
    }, sceneKey);
  }

  expectScreenText(sceneKey: string, message?: string) {
    return expect.poll(async () => (await this.visibleText(sceneKey)).join(' | '), { timeout: 15_000, message });
  }

  expectNoErrors(): void {
    expect(this.errors, `page errors: ${this.errors.join(' | ')}`).toEqual([]);
  }
}

/** Fixed click targets, in game coordinates. */
export const AT = {
  play: { x: 690, y: 300 },
  grownUps: { x: 690, y: 382 },
  back: { x: 60, y: 40 },
  /** The signpost in the town that always points at the next job. */
  sign: { x: 432, y: 410 },
  garageDoor: { x: 150, y: 430 },
  /** Over the spoil heap, where the excavator empties its bucket. */
  heap: { x: 90, y: 330 },
};

declare global {
  interface Window {
    __game: import('phaser').Game;
    __state: any;
  }
}
