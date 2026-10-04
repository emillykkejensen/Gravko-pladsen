import Phaser from 'phaser';
import { DEPTH } from '../config';
import { dur, transition } from '../helpers/Motion';
import { flatten } from '../helpers/Flatten';

/**
 * Every interactive scene builds in four layers:
 *
 *   background  static scenery, built once in buildBackground() and then **baked into a
 *               single texture** — see helpers/Flatten for why
 *   ambient     scenery that moves under its own power: sun, clouds, birds. Built once in
 *               buildAmbient(); never rebuilt, never flattened
 *   dynamic     everything that reflects state, rebuilt by refresh()
 *   effects     star bursts and toasts, added straight to the scene at DEPTH.effects
 *
 * An interaction is: mutate `gameState`, play the feedback, call `refresh()`. A scene never
 * restarts itself to redraw — that re-runs create(), resets the fields the click handler
 * just wrote and kills the reward animation mid-tween.
 *
 * The rule for scene authors: **if it never changes, put it in `background`; if it moves,
 * put it in `ambient`; if it reflects state, put it in `dynamic`.** Something animated in
 * `background` simply freezes, because it has been baked into a picture.
 *
 * Machines that move every frame (an excavator arm following a finger, a drum turning) are
 * drawn by an `everyFrame` updater into a Graphics that lives in the dynamic layer, rather
 * than by refreshing the whole layer at frame rate.
 */
export abstract class BaseScene extends Phaser.Scene {
  protected background!: Phaser.GameObjects.Container;
  protected ambient!: Phaser.GameObjects.Container;
  protected dynamic!: Phaser.GameObjects.Container;

  /** Per-frame updates that must survive until the next refresh. */
  private updaters: ((dt: number) => void)[] = [];

  create(): void {
    this.cameras.main.fadeIn(dur(260));

    this.background = this.add.container(0, 0).setDepth(DEPTH.background);
    this.ambient = this.add.container(0, 0).setDepth(DEPTH.ambient);
    this.dynamic = this.add.container(0, 0).setDepth(DEPTH.dynamic);

    this.buildBackground();

    // The container is consumed here. It is replaced with an empty one so a late add from
    // a subclass renders in the right place instead of throwing.
    flatten(this, this.background, DEPTH.background);
    this.background = this.add.container(0, 0).setDepth(DEPTH.background);

    this.buildAmbient();
    this.buildChrome();
    this.refresh();
  }

  update(_time: number, delta: number): void {
    // Seconds, and capped: a tab coming back from the background reports one huge frame,
    // and a tank should not fill itself in that frame.
    const dt = Math.min(delta, 100) / 1000;
    // An updater may refresh() the scene, which swaps in a new list; the old list's
    // remaining updaters draw into objects that have just been destroyed, so stop there.
    const list = this.updaters;
    for (const tick of list) {
      tick(dt);
      if (this.updaters !== list) break;
    }
  }

  /** Static scenery. Runs once per scene start, then gets baked to a texture. */
  protected abstract buildBackground(): void;

  /** Scenery that animates itself. Runs once per scene start. Optional. */
  protected buildAmbient(): void {
    // most scenes have none
  }

  /** Everything derived from GameState. Safe to call on every interaction. */
  protected abstract buildDynamic(): void;

  /** Back button, star counter, title — added above every other layer. */
  protected abstract buildChrome(): void;

  protected refresh(): void {
    this.updaters = [];
    this.dynamic.removeAll(true);
    this.buildDynamic();
  }

  /** Adds a game object to the rebuildable layer. */
  protected dyn<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.dynamic.add(obj);
    return obj;
  }

  /** Adds a game object to the static, baked layer. */
  protected bg<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.background.add(obj);
    return obj;
  }

  /** Adds a game object to the animated scenery layer. */
  protected amb<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.ambient.add(obj);
    return obj;
  }

  /** Registers something that has to be updated every frame until the next refresh. */
  protected everyFrame(tick: (dt: number) => void): void {
    this.updaters.push(tick);
  }

  protected goTo(key: string, data?: object): void {
    transition(this, key, 220, data);
  }
}
