import Phaser from 'phaser';

/**
 * Respect the OS "reduce motion" setting. Some children are motion-sensitive, and the
 * game leans on camera fades and squash-and-stretch for almost every interaction.
 *
 * Note this is queried live rather than cached, so toggling the OS setting takes effect
 * without a reload.
 */
export function reduceMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** Animation duration, collapsed to zero when the player asked for less motion. */
export function dur(ms: number): number {
  return reduceMotion() ? 0 : ms;
}

/** Scene change, with or without the cross-fade. */
export function transition(scene: Phaser.Scene, key: string, ms = 220, data?: object): void {
  if (reduceMotion()) {
    scene.scene.start(key, data);
    return;
  }
  // A second tap during the fade would queue a second start of the same scene.
  if (scene.cameras.main.fadeEffect.isRunning) return;
  scene.cameras.main.fadeOut(ms, 0, 0, 0);
  scene.cameras.main.once('camerafadeoutcomplete', () => scene.scene.start(key, data));
}

/** The squash a control does when tapped. The callback always runs. */
export function press(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  onClick: () => void,
  scale = 0.93
): void {
  if (reduceMotion()) {
    onClick();
    return;
  }
  scene.tweens.add({
    targets: target,
    scale: target.scale * scale,
    duration: 80,
    yoyo: true,
    onComplete: onClick,
  });
}

/**
 * Entrance pop.
 *
 * Screens used to simply exist; every element was already in place before the camera
 * finished fading in, which is what made them feel like documents rather than places.
 * Popping the important things in on a short stagger costs nothing and reads as the
 * screen assembling itself.
 */
export function popIn(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container | Phaser.GameObjects.Text,
  delay = 0,
  from = 0.6
): void {
  if (reduceMotion()) return;
  const to = target.scale;
  target.setScale(to * from);
  target.setAlpha(0);
  scene.tweens.add({
    targets: target,
    scale: to,
    alpha: 1,
    duration: 340,
    delay,
    ease: 'Back.easeOut',
  });
}

/** Slow vertical float. Used for anything that should feel weightless rather than placed. */
export function bob(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject & { y: number },
  distance = 5,
  duration = 2000,
  delay = 0
): Phaser.Tweens.Tween | null {
  if (reduceMotion()) return null;
  return scene.tweens.add({
    targets: target,
    y: target.y - distance,
    duration,
    delay,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** A short happy shake — for something that has just been finished. */
export function wobble(scene: Phaser.Scene, target: Phaser.GameObjects.Container): void {
  if (reduceMotion()) return;
  scene.tweens.add({
    targets: target,
    angle: { from: -5, to: 5 },
    duration: 90,
    yoyo: true,
    repeat: 3,
    onComplete: () => target.setAngle(0),
  });
}

/**
 * The "this is waiting for you" pulse.
 *
 * Only ever applied to one or two things per screen. Applied to everything it becomes
 * noise, and a child stops being able to tell what the game is pointing at.
 */
export function pulse(scene: Phaser.Scene, target: Phaser.GameObjects.Container, amount = 1.06): void {
  if (reduceMotion()) return;
  scene.tweens.add({
    targets: target,
    scale: target.scale * amount,
    duration: 850,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}
