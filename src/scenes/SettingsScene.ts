import { COLORS, INK, INK_SOFT, SIZE, rankFor, text } from '../config';
import { gameState } from '../state/GameState';
import { MACHINE_IDS, MACHINES } from '../state/Machines';
import { addBackButton, addSceneTitle } from '../ui/Chrome';
import { button, gradientBand, panel } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { BaseScene } from './BaseScene';

/**
 * The grown-up screen. Deliberately plain and text-heavy — it is for a parent, not for the
 * child: sound, music, how far the child has come, and a way to start over.
 */
export class SettingsScene extends BaseScene {
  private confirmingReset = false;

  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.confirmingReset = false;
    super.create();
  }

  protected buildBackground(): void {
    this.bg(gradientBand(this, 0, this.scale.height, COLORS.wall, COLORS.wallDeep));
  }

  protected buildChrome(): void {
    addBackButton(this, 'MainMenuScene', 'Menu');
    addSceneTitle(this, 'For de voksne', COLORS.blue);
  }

  protected buildDynamic(): void {
    const cx = this.scale.width / 2;

    this.dyn(panel(this, cx, 170, 560, 120, COLORS.cream));
    this.dyn(this.add.text(cx, 132, 'Lyd', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
    this.toggle(cx - 130, 186, 'Lydeffekter', gameState.settings.sound, on => {
      gameState.setSetting('sound', on);
      if (!on) audio.stopMusic();
      else audio.unlock();
    });
    this.toggle(cx + 130, 186, 'Musik', gameState.settings.music, on => {
      gameState.setSetting('music', on);
      audio.syncMusic();
    });

    this.dyn(panel(this, cx, 330, 560, 150, COLORS.cream));
    this.dyn(this.add.text(cx, 278, 'Hvor langt er vi?', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
    const built = MACHINE_IDS.filter(id => gameState.isBuilt(id)).map(id => MACHINES[id].short.toLowerCase());
    const lines = [
      `${gameState.stars} stjerner — ${rankFor(gameState.stars).name}`,
      `${gameState.project} bygninger færdige, ${gameState.town.length} i byen nu`,
      built.length ? `Maskiner bygget: ${built.join(', ')}` : 'Ingen maskiner bygget endnu',
    ];
    lines.forEach((l, i) => {
      this.dyn(this.add.text(cx, 314 + i * 28, l, text(SIZE.body, INK_SOFT, 'semibold')).setOrigin(0.5));
    });

    const label = this.confirmingReset ? 'Ja, slet alt' : 'Start forfra';
    const color = this.confirmingReset ? COLORS.red : COLORS.stoneDeep;
    this.dyn(button(this, cx, 466, label, color, () => {
      if (!this.confirmingReset) {
        this.confirmingReset = true;
        this.refresh();
        return;
      }
      this.confirmingReset = false;
      gameState.reset();
      this.events.emit('starsChanged', gameState.stars);
      this.refresh();
    }, 220, 50, SIZE.body));
    if (this.confirmingReset) {
      this.dyn(this.add.text(cx, 512, 'Maskiner, byen og stjerner bliver slettet.',
        text(SIZE.label, INK_SOFT, 'semibold')).setOrigin(0.5));
    }
  }

  private toggle(x: number, y: number, label: string, on: boolean, set: (on: boolean) => void): void {
    this.dyn(button(this, x, y, `${label}: ${on ? 'til' : 'fra'}`, on ? COLORS.green : COLORS.stoneDeep, () => {
      set(!on);
      this.refresh();
    }, 220, 48, SIZE.body));
  }
}
