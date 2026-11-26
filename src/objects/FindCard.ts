import Phaser from 'phaser';
import { COLORS, DEPTH, INK, INK_SOFT, LINE, SIZE, text, textOutlined } from '../config';
import { plate, shadow } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';
import type { TreasureDef } from '../state/Treasures';
import { showConfetti, showSparkle } from './FeedbackEffects';
import { drawRays, drawTreasure } from './TreasureArt';

type Pt = { x: number; y: number };

/** How long a find stays up before a new touch may put it away. */
const READ_MS = 1200;

export interface FindCard {
  /** Puts the find away into the chest. Safe to call twice. */
  close(): void;
  /** Whether it has been on screen long enough that a new touch may put it away. */
  settled(): boolean;
}

/** "en regnorm" → "endnu en regnorm", for a find the chest already has. */
export function again(name: string): string {
  return name.replace(/^(en|et) /, 'endnu $1 ');
}

/**
 * What the bucket just brought up: the find jumps out of the earth and hangs in the sky in a
 * burst of rays, with its name and one true thing about it on a plate underneath — for a
 * grown-up to read aloud, while the child carries on digging.
 *
 * Nothing on it has to be tapped, and it never covers the hole: the next touch after it has
 * had a moment on screen, or the next bucketful, sends it into the chest.
 */
export function showFind(scene: Phaser.Scene, treasure: TreasureDef, fresh: boolean, from: Pt, at: Pt): FindCard {
  const shownAt = scene.time.now;
  const reduced = reduceMotion();
  audio.treasure();

  const c = scene.add.container(at.x, at.y).setDepth(DEPTH.effects).setName('find');

  // the plate underneath: the name, then the fact
  const head = scene.add.text(0, 30, `Du fandt ${fresh ? treasure.name : again(treasure.name)}!`,
    text(SIZE.heading, INK, 'bold')).setOrigin(0.5, 0);
  const w = Math.max(340, head.width + 40);
  const fact = scene.add.text(0, 30 + head.height + 6, treasure.fact,
    { ...text(SIZE.label, INK_SOFT, 'semibold'), wordWrap: { width: w - 40 }, align: 'center' }).setOrigin(0.5, 0);
  const h = head.height + fact.height + 30;
  const g = scene.add.graphics();
  shadow(g, -w / 2, 20, w, h, 18, 4, 0.2);
  plate(g, -w / 2, 20, w, h, 18, COLORS.cream, 0.98, LINE.base);
  c.add([g, head, fact]);

  // a "new!" tag when it is going into the chest for the first time
  if (fresh) {
    const tag = scene.add.container(w / 2 - 34, 22).setAngle(8);
    const tg = scene.add.graphics();
    plate(tg, -34, -14, 68, 28, 14, COLORS.red, 1, LINE.thin);
    tag.add([tg, scene.add.text(0, 0, 'Ny!', textOutlined(SIZE.label, '#FFFFFF', '#8A3A2C', 3)).setOrigin(0.5)]);
    c.add(tag);
  }

  // the find itself, in a slow turning burst of light
  const rays = scene.add.graphics().setPosition(0, -48);
  drawRays(rays, 74);
  const art = scene.add.graphics();
  drawTreasure(art, treasure.id);
  c.add(rays);

  // The find jumps out of the bucket and up into place on its own, so it is clearly the thing
  // that came out of the ground.
  art.setDepth(DEPTH.effects + 1);
  const home = { x: at.x, y: at.y - 48 };
  const scale = 1.25;
  if (reduced) {
    art.setPosition(home.x, home.y).setScale(scale);
  } else {
    art.setPosition(from.x, from.y).setScale(0.3);
    c.setScale(0.6).setAlpha(0);
    scene.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, delay: 260, ease: 'Back.easeOut' });
    scene.tweens.chain({
      targets: art,
      tweens: [
        { x: (from.x + home.x) / 2, y: Math.min(from.y, home.y) - 70, scale: 0.9, angle: 200, duration: 320, ease: 'Quad.easeOut' },
        { x: home.x, y: home.y, scale, angle: 360, duration: 300, ease: 'Quad.easeIn' },
      ],
      onComplete: () => {
        if (!art.active) return;
        art.setAngle(0);
        showSparkle(scene, home.x, home.y, 110, 90);
        if (fresh) showConfetti(scene, home.x, home.y, 18);
        // a little bob, so it hangs there rather than being pinned
        scene.tweens.add({ targets: art, y: home.y - 5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
    scene.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });
  }

  let open = true;
  return {
    settled: () => open && scene.time.now - shownAt > READ_MS,
    close: () => {
      if (!open) return;
      open = false;
      if (!c.active) return;
      if (reduced) {
        c.destroy();
        art.destroy();
        return;
      }
      scene.tweens.killTweensOf([c, art, rays]);
      // off up and away, small, the way back to the town where the chest is kept
      scene.tweens.add({ targets: c, alpha: 0, scale: 0.8, duration: 260, onComplete: () => c.destroy() });
      scene.tweens.add({
        targets: art, x: 70, y: 40, scale: 0.2, angle: -180, alpha: 0.3, duration: 520, ease: 'Cubic.easeIn',
        onComplete: () => art.destroy(),
      });
    },
  };
}
