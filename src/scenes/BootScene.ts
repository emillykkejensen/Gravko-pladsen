import Phaser from 'phaser';
import { COLORS, INK_SOFT, SIZE, text } from '../config';
import { drawStarShape, gradientBand } from '../helpers/Draw';
import { reduceMotion } from '../helpers/Motion';
import { gameState } from '../state/GameState';
import { lastProfileId, restoreFromMirror } from '../state/Profiles';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // The loading screen is the first thing anyone sees, so it gets the same sky as the
    // game rather than a flat fill — otherwise the first frame is a visible seam.
    gradientBand(this, 0, height, COLORS.skyLight, COLORS.sky);

    const label = this.add.text(width / 2, height / 2 + 62, 'Indlæser...', text(SIZE.body, INK_SOFT, 'bold'))
      .setOrigin(0.5);

    // Three bouncing stars, not dots.
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics().setPosition(width / 2 - 34 + i * 34, height / 2);
      drawStarShape(g, 0, 0, 15);
      if (reduceMotion()) continue;
      this.tweens.add({
        targets: g,
        y: height / 2 - 22,
        angle: 180,
        duration: 400,
        delay: i * 130,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Phaser measures text against whatever font is available at draw time, so wait for
    // the font before the first scene lays anything out.
    const ready = document.fonts?.ready ?? Promise.resolve();

    // On Android, native storage is the durable copy: if the WebView has lost its web
    // storage, put every player back before the title screen lists them. No-op in a browser.
    const restored = restoreFromMirror().then(did => {
      if (did) gameState.loadProfile(lastProfileId());
    });

    Promise.race([
      Promise.all([ready, restored]),
      new Promise(r => setTimeout(r, 2500)),
    ]).then(() => {
      label.destroy();
      this.scene.start('MainMenuScene');
    });
  }
}
