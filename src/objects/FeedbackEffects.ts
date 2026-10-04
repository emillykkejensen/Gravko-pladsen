import Phaser from 'phaser';
import { COLORS, DEPTH, LINE, PRAISE, SIZE, text, textOutlined } from '../config';
import { drawStarShape, shade } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { audio } from '../helpers/Audio';

/**
 * These are purely visual. They live above the dynamic layer (DEPTH.effects) so a
 * refresh() never destroys a reward animation that is still playing — which is what
 * used to happen when every tap restarted the scene.
 */

/**
 * Where earned stars fly to.
 *
 * Registered by the HUD when it builds, read by `flyStarsToCounter`. Kept here rather
 * than in Chrome so the dependency runs Chrome -> effects and never back again. A
 * WeakMap means a destroyed scene's entry goes away with it.
 */
const STAR_TARGETS = new WeakMap<Phaser.Scene, { x: number; y: number }>();

export function setStarTarget(scene: Phaser.Scene, x: number, y: number): void {
  STAR_TARGETS.set(scene, { x, y });
}

export function getStarTarget(scene: Phaser.Scene): { x: number; y: number } | undefined {
  return STAR_TARGETS.get(scene);
}

export function showStarBurst(scene: Phaser.Scene, x: number, y: number, count = 5): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const g = scene.add.graphics().setPosition(x, y).setDepth(DEPTH.effects).setScale(0);
    drawStarShape(g, 0, 0, 9);

    scene.tweens.add({
      targets: g,
      x: x + Math.cos(a) * Phaser.Math.Between(30, 52),
      y: y + Math.sin(a) * Phaser.Math.Between(30, 52) - 20,
      scale: { from: 0.4, to: 1.2 },
      angle: Phaser.Math.Between(-160, 160),
      alpha: { from: 1, to: 0 },
      duration: 720,
      delay: i * 45,
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}

/**
 * The earned star physically travelling to the counter.
 *
 * Stars used to appear in the top corner with no connection to the thing that earned
 * them. Watching one fly from the bed you just made to the number that counts it is the
 * single clearest way to explain the currency to someone who cannot yet read the label.
 */
export function flyStarsToCounter(scene: Phaser.Scene, x: number, y: number, count = 1): void {
  const target = getStarTarget(scene);
  if (!target) return;

  for (let i = 0; i < count; i++) {
    const g = scene.add.graphics().setPosition(x, y).setDepth(DEPTH.effects);
    drawStarShape(g, 0, 0, 13);

    if (reduceMotion()) {
      g.destroy();
      continue;
    }

    // Up and out first, then in — a straight line reads as a slide, an arc as a throw.
    scene.tweens.chain({
      targets: g,
      tweens: [
        {
          x: x + Phaser.Math.Between(-30, 30),
          y: y - Phaser.Math.Between(40, 66),
          scale: 1.35,
          angle: Phaser.Math.Between(-40, 40),
          duration: 300,
          ease: 'Quad.easeOut',
        },
        {
          x: target.x,
          y: target.y,
          scale: 0.45,
          angle: 380,
          alpha: 0.85,
          duration: 460,
          delay: i * 70,
          ease: 'Quad.easeIn',
        },
      ],
      onComplete: () => g.destroy(),
    });
  }
}

export function showHearts(scene: Phaser.Scene, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const g = scene.add.graphics().setDepth(DEPTH.effects);
    g.fillStyle(shade(COLORS.pink, -0.2));
    g.fillCircle(-3.5, -1, 4.6);
    g.fillCircle(3.5, -1, 4.6);
    g.fillTriangle(-7.6, 1, 7.6, 1, 0, 9.5);
    g.fillStyle(COLORS.pink);
    g.fillCircle(-3.5, -2, 4);
    g.fillCircle(3.5, -2, 4);
    g.fillTriangle(-7, 0, 7, 0, 0, 8);
    g.fillStyle(COLORS.white, 0.5);
    g.fillCircle(-4.5, -3.5, 1.4);
    g.setPosition(x + Phaser.Math.Between(-16, 16), y);

    scene.tweens.add({
      targets: g,
      y: y - 58,
      x: g.x + Phaser.Math.Between(-14, 14),
      scale: { from: 0.5, to: 1.3 },
      angle: Phaser.Math.Between(-25, 25),
      alpha: 0,
      duration: 950,
      delay: i * 130,
      ease: 'Sine.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}

export function showSparkle(scene: Phaser.Scene, x: number, y: number, w = 100, h = 100): void {
  // purely decorative, and ten twinkling stars is exactly what reduced motion asks to skip
  if (reduceMotion()) return;
  for (let i = 0; i < 10; i++) {
    const s = scene.add.star(
      x + Phaser.Math.Between(-w / 2, w / 2),
      y + Phaser.Math.Between(-h / 2, h / 2),
      4, 1.5, 8, COLORS.white
    ).setDepth(DEPTH.effects).setAlpha(0);

    scene.tweens.add({
      targets: s,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.3, to: 1.2 },
      angle: 90,
      duration: 380,
      delay: i * 70,
      yoyo: true,
      onComplete: () => s.destroy(),
    });
  }
}

/**
 * Confetti. Reserved for finishing a whole job — a complete room, every lounger, the
 * finished sandcastle — so it stays a treat rather than wallpaper.
 */
export function showConfetti(scene: Phaser.Scene, x: number, y: number, count = 26): void {
  const palette = [COLORS.red, COLORS.sun, COLORS.teal, COLORS.pink, COLORS.purple, COLORS.green];

  for (let i = 0; i < count; i++) {
    const col = palette[i % palette.length];
    const w = Phaser.Math.Between(6, 11);
    const h = Phaser.Math.Between(8, 14);

    const g = scene.add.graphics().setPosition(x, y).setDepth(DEPTH.effects);
    g.fillStyle(col);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 2);
    g.lineStyle(1.2, COLORS.outline, 0.5);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 2);

    if (reduceMotion()) {
      g.destroy();
      continue;
    }

    const a = -Math.PI / 2 + Phaser.Math.FloatBetween(-1.15, 1.15);
    const power = Phaser.Math.Between(120, 260);
    const peakX = x + Math.cos(a) * power;
    const peakY = y + Math.sin(a) * power;

    // Thrown up, then dropped — a single outward tween looks like a firework, and a
    // firework at floor level looks wrong.
    scene.tweens.chain({
      targets: g,
      tweens: [
        { x: peakX, y: peakY, duration: 520, ease: 'Quad.easeOut' },
        {
          y: peakY + Phaser.Math.Between(150, 260),
          x: peakX + Phaser.Math.Between(-30, 30),
          alpha: 0,
          duration: 780,
          ease: 'Quad.easeIn',
        },
      ],
      onComplete: () => g.destroy(),
    });

    scene.tweens.add({
      targets: g,
      angle: Phaser.Math.Between(-540, 540),
      scaleX: { from: 1, to: 0.25 },
      duration: Phaser.Math.Between(700, 1300),
      yoyo: true,
      repeat: 1,
    });
  }
}

export function showSplash(scene: Phaser.Scene, x: number, y: number): void {
  const ring = scene.add.ellipse(x, y, 10, 5)
    .setStrokeStyle(2.5, COLORS.white, 0.95)
    .setDepth(DEPTH.effects);
  scene.tweens.add({
    targets: ring,
    scaleX: 6, scaleY: 6, alpha: 0,
    duration: 560, ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });

  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i - 3.5) * 0.32;
    const drop = scene.add.circle(x, y, Phaser.Math.Between(3, 7), COLORS.waterLight)
      .setStrokeStyle(1.2, COLORS.waterDeep, 0.6)
      .setDepth(DEPTH.effects);
    scene.tweens.add({
      targets: drop,
      x: x + Math.cos(a) * Phaser.Math.Between(30, 60),
      y: y + Math.sin(a) * Phaser.Math.Between(32, 62),
      alpha: 0,
      scale: 0.4,
      duration: 540,
      ease: 'Quad.easeOut',
      onComplete: () => drop.destroy(),
    });
  }
}

/** An expanding ring — draws the eye to whatever just happened. */
export function showRing(scene: Phaser.Scene, x: number, y: number, color = COLORS.sun): void {
  if (reduceMotion()) return;
  const ring = scene.add.circle(x, y, 18)
    .setStrokeStyle(4, color, 0.9)
    .setDepth(DEPTH.effects);
  scene.tweens.add({
    targets: ring,
    scale: 3.2,
    alpha: 0,
    duration: 620,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** A soft tick, drawn rather than an emoji, so it matches the rest of the art. */
export function showCheckmark(scene: Phaser.Scene, x: number, y: number): void {
  const c = scene.add.container(x, y).setDepth(DEPTH.effects).setScale(0);

  const disc = scene.add.graphics();
  disc.fillStyle(shade(COLORS.green, -0.25));
  disc.fillCircle(0, 2, 18);
  disc.fillStyle(COLORS.green);
  disc.fillCircle(0, 0, 18);
  disc.lineStyle(LINE.base, COLORS.outline, 0.9);
  disc.strokeCircle(0, 0, 18);
  disc.fillStyle(COLORS.white, 0.3);
  disc.fillCircle(-5, -6, 8);

  const tick = scene.add.graphics();
  tick.lineStyle(4, COLORS.white, 1);
  tick.beginPath();
  tick.moveTo(-7, 0);
  tick.lineTo(-2, 5.5);
  tick.lineTo(8, -6);
  tick.strokePath();

  c.add([disc, tick]);

  scene.tweens.add({
    targets: c,
    scale: 1,
    duration: 300,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: c,
        alpha: 0,
        y: y - 30,
        delay: 520,
        duration: 380,
        onComplete: () => c.destroy(),
      });
    },
  });
}

/**
 * A big bouncy word of praise.
 *
 * Outlined text with no plate behind it, because it is meant to feel shouted rather
 * than displayed. The word rotates through `PRAISE` so it does not become the same
 * three characters every single time.
 */
export function showPraise(scene: Phaser.Scene, x: number, y: number, word?: string): void {
  const label = word ?? Phaser.Utils.Array.GetRandom(PRAISE);
  const t = scene.add.text(x, y, label, textOutlined(SIZE.title + 8, '#FFFFFF', '#4A3A2C', 7))
    .setOrigin(0.5)
    .setDepth(DEPTH.effects)
    .setScale(0)
    .setAngle(-7);

  scene.tweens.add({
    targets: t,
    scale: 1,
    angle: 4,
    duration: 380,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: t,
        y: y - 34,
        alpha: 0,
        scale: 1.15,
        delay: 620,
        duration: 420,
        onComplete: () => t.destroy(),
      });
    },
  });
}

/**
 * Short floating message, e.g. a hint about which part goes on first.
 *
 * Now an outlined speech bubble with a tail, so a line of dialogue is visibly coming
 * out of somebody rather than hovering nearby.
 */
export function showToast(
  scene: Phaser.Scene,
  x: number, y: number,
  message: string,
  color = '#5A4E42'
): void {
  const t = scene.add.text(0, 0, message, text(SIZE.body, color, 'bold')).setOrigin(0.5);
  const w = t.width + 30;
  const h = t.height + 16;
  const r = Math.min(14, h / 2);

  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.shadow, 0.16);
  bg.fillRoundedRect(-w / 2 + 1, -h / 2 + 4, w, h, r);

  // Tail drawn before the body so the body's outline closes over its top edge.
  bg.fillStyle(COLORS.white);
  bg.fillTriangle(-7, h / 2 - 2, 7, h / 2 - 2, -1, h / 2 + 11);
  bg.lineStyle(LINE.base, COLORS.outline, 0.9);
  bg.beginPath();
  bg.moveTo(-7, h / 2 - 1);
  bg.lineTo(-1, h / 2 + 11);
  bg.lineTo(7, h / 2 - 1);
  bg.strokePath();

  bg.fillStyle(COLORS.white, 1);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  bg.lineStyle(LINE.base, COLORS.outline, 0.9);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

  const c = scene.add.container(x, y, [bg, t]).setDepth(DEPTH.effects).setScale(0.6);

  scene.tweens.add({ targets: c, scale: 1, duration: 250, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: c,
    y: y - 28,
    alpha: 0,
    delay: 1300,
    duration: 500,
    onComplete: () => c.destroy(),
  });
}

/**
 * The whole-screen celebration for reaching a new rank.
 *
 * Deliberately the only thing in the game that covers the play area, and it clears
 * itself — nothing to dismiss, nothing to get stuck behind.
 */
export function showRankUp(scene: Phaser.Scene, rankName: string): void {
  const { width, height } = scene.scale;
  audio.success();

  const veil = scene.add.rectangle(width / 2, height / 2, width, height, COLORS.sun, 0.001)
    .setDepth(DEPTH.overlay);
  scene.tweens.add({
    targets: veil,
    fillAlpha: 0.3,
    duration: 260,
    yoyo: true,
    hold: 700,
    onComplete: () => veil.destroy(),
  });

  const c = scene.add.container(width / 2, height * 0.42).setDepth(DEPTH.overlay).setScale(0);

  const star = scene.add.graphics();
  drawStarShape(star, 0, -54, 42);

  const head = scene.add.text(0, 8, 'Ny rang!', textOutlined(SIZE.title, '#FFFFFF', '#4A3A2C', 6))
    .setOrigin(0.5);
  const name = scene.add.text(0, 46, rankName, textOutlined(SIZE.display - 10, '#FFF6D8', '#4A3A2C', 7))
    .setOrigin(0.5);

  c.add([star, head, name]);

  showConfetti(scene, width / 2, height * 0.34, 40);

  scene.tweens.add({
    targets: c,
    scale: 1,
    duration: 460,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: c,
        alpha: 0,
        scale: 1.2,
        delay: 1200,
        duration: 480,
        onComplete: () => c.destroy(),
      });
    },
  });

  if (!reduceMotion()) {
    scene.tweens.add({
      targets: star,
      angle: 360,
      duration: 1400,
      ease: 'Cubic.easeOut',
    });
  }
}
