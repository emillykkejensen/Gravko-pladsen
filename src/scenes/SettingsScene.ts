import { COLORS, DEPTH, INK, INK_SOFT, SIZE, rankFor, text } from '../config';
import { gameState } from '../state/GameState';
import { MACHINE_IDS, MACHINES } from '../state/Machines';
import { SHOP_ITEMS } from '../state/Shop';
import { deleteProfile, lastProfileId } from '../state/Profiles';
import { addBackButton, addSceneTitle } from '../ui/Chrome';
import { playerTag, switchPlayer } from '../ui/Players';
import { button, gradientBand, panel } from '../helpers/Draw';
import { audio } from '../helpers/Audio';
import { transition } from '../helpers/Motion';
import { BaseScene } from './BaseScene';

/**
 * The grown-up screen. Deliberately plain and text-heavy — it is for a parent, not for the
 * child: sound, music, how far the child has come, and a way to start over or remove them.
 *
 * Everything here belongs to one player, because every setting lives in their save: one
 * child can have the music off and the other on, and "Start forfra" wipes one town only.
 */
export class SettingsScene extends BaseScene {
  /** Which of the two destructive buttons is waiting for its second tap, if either. */
  private confirming: 'reset' | 'delete' | null = null;

  constructor() {
    super({ key: 'SettingsScene' });
  }

  init(): void {
    // The scene object outlives a visit, so a half-confirmed reset must not greet the next one.
    this.confirming = null;
  }

  protected buildBackground(): void {
    this.bg(gradientBand(this, 0, this.scale.height, COLORS.wall, COLORS.wallDeep));
  }

  protected buildChrome(): void {
    addBackButton(this, 'TownScene');
    addSceneTitle(this, 'For de voksne', COLORS.blue);
    // Every setting on this screen belongs to one child, so say which one.
    const profile = gameState.profile;
    if (profile) {
      playerTag(this, profile, this.scale.width - 16, 38, 220, 'right').setDepth(DEPTH.chrome);
    }
  }

  protected buildDynamic(): void {
    const cx = this.scale.width / 2;
    const top = this.dy / 2;

    this.dyn(panel(this, cx, top + 150, 560, 110, COLORS.cream));
    this.dyn(this.add.text(cx, top + 116, 'Lyd', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
    this.toggle(cx - 130, top + 164, 'Lydeffekter', gameState.settings.sound, on => {
      gameState.setSetting('sound', on);
      if (!on) audio.stopMusic();
      else audio.unlock();
    });
    this.toggle(cx + 130, top + 164, 'Musik', gameState.settings.music, on => {
      gameState.setSetting('music', on);
      audio.syncMusic();
    });

    this.dyn(panel(this, cx, top + 312, 560, 170, COLORS.cream));
    this.dyn(this.add.text(cx, top + 250, 'Hvor langt er vi?', text(SIZE.heading, INK, 'bold')).setOrigin(0.5));
    const built = MACHINE_IDS.filter(id => gameState.isBuilt(id)).map(id => MACHINES[id].short.toLowerCase());
    const bought = SHOP_ITEMS.filter(i => gameState.owns(i.id)).length;
    const lines = [
      `${gameState.stars} stjerner at bruge, ${gameState.earned} tjent i alt — ${rankFor(gameState.earned).name}`,
      `${gameState.project} bygninger færdige, ${gameState.town.length} i byen nu`,
      built.length ? `Maskiner bygget: ${built.join(', ')}` : 'Ingen maskiner bygget endnu',
      `${bought} af ${SHOP_ITEMS.length} ting købt i stjernebutikken`,
    ];
    lines.forEach((l, i) => {
      const t = this.dyn(this.add.text(cx, top + 284 + i * 28, l, text(SIZE.body, INK_SOFT, 'semibold')).setOrigin(0.5));
      if (t.width > 540) t.setScale(540 / t.width);
    });

    this.buildDangerZone(cx, this.scale.height - 60);
  }

  private toggle(x: number, y: number, label: string, on: boolean, set: (on: boolean) => void): void {
    this.dyn(button(this, x, y, `${label}: ${on ? 'til' : 'fra'}`, on ? COLORS.green : COLORS.stoneDeep, () => {
      set(!on);
      this.refresh();
    }, 220, 48, SIZE.body)).setName(`toggle:${label}`);
  }

  /* ----------------------------------------------------------------- reset --- */

  /**
   * Start forfra and Slet spiller — both only ever about this one child.
   *
   * Each needs a second tap, and arming one disarms the other, so there is never more than
   * one thing waiting to happen.
   */
  private buildDangerZone(cx: number, y: number): void {
    const profile = gameState.profile;
    const name = profile?.name ?? 'spilleren';

    this.confirmButton(profile ? cx - 130 : cx, y, 'reset', 'Start forfra', 'Ja, start forfra', () => {
      gameState.reset();
      this.events.emit('starsChanged', gameState.stars);
      this.refresh();
    });

    if (profile) {
      this.confirmButton(cx + 130, y, 'delete', 'Slet spiller', `Ja, slet ${name}`, () => {
        deleteProfile(profile.id);
        // Back to whoever is left — which is nobody in particular, so the title screen
        // runs on defaults until a card is picked.
        switchPlayer(lastProfileId());
        transition(this, 'MainMenuScene');
      });
    }

    if (this.confirming) {
      // Danish genitive: "Emils", but "Jonas'"
      const whose = /[sxz]$/i.test(name) ? `${name}'` : `${name}s`;
      const what = this.confirming === 'reset'
        ? `${whose} maskiner, by og stjerner bliver slettet.`
        : `${name} og alt, ${name} har bygget, bliver slettet.`;
      this.dyn(this.add.text(cx, y + 44, what, text(SIZE.label, INK_SOFT, 'semibold')).setOrigin(0.5));
    }
  }

  private confirmButton(
    x: number, y: number,
    which: 'reset' | 'delete',
    label: string,
    confirmLabel: string,
    onConfirm: () => void
  ): void {
    const armed = this.confirming === which;
    const b = button(this, x, y, armed ? confirmLabel : label, armed ? COLORS.red : COLORS.stoneDeep, () => {
      if (!armed) {
        this.confirming = which;
        this.refresh();
        return;
      }
      this.confirming = null;
      onConfirm();
    }, 230, 50, SIZE.body);
    b.setName(which);
    this.dyn(b);
  }
}
