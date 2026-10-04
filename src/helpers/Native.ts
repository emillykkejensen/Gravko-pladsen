import type Phaser from 'phaser';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { goBack } from './Navigation';

/**
 * Everything the Android build needs that a browser gives for free.
 *
 * The game is the same code in both places; this is the thin layer that makes a WebView
 * behave like a game console rather than a browser tab. On the web every function here is
 * either a no-op or falls through to the browser API, so nothing is branched at the call
 * site.
 */

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------------- exit --- */

/**
 * Closes the app, where closing an app is a thing that exists.
 *
 * Android has a hardware back button but no visible way out of a fullscreen, immersive
 * WebView, so the title screen needs a button that does this. A browser tab cannot be
 * closed by a script it did not open, so there the caller falls back to saying so.
 */
export function canExit(): boolean {
  return isNative();
}

export function exitApp(): void {
  if (!isNative()) return;
  App.exitApp().catch(() => undefined);
}

/* ------------------------------------------------------------------- save file --- */

const MIRROR_KEY = 'save';

/**
 * A second copy of the save in native storage.
 *
 * `localStorage` inside a WebView is not durable the way a file is — Android can clear web
 * storage to reclaim space, and some devices drop it when the app updates. Losing 40 stars
 * that took a week to earn is the kind of thing that ends a game's life in a household, so
 * every write is mirrored into SharedPreferences and read back if localStorage comes up
 * empty on a later launch.
 */
export function mirrorSave(json: string): void {
  if (!isNative()) return;
  Preferences.set({ key: MIRROR_KEY, value: json }).catch(() => undefined);
}

export async function restoreSaveIfEmpty(storageKey: string): Promise<boolean> {
  if (!isNative()) return false;
  try {
    if (window.localStorage.getItem(storageKey)) return false;
    const { value } = await Preferences.get({ key: MIRROR_KEY });
    if (!value) return false;
    window.localStorage.setItem(storageKey, value);
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------------- app shell --- */

/**
 * Locks the app to landscape, hides the system bars, keeps the screen awake and makes the
 * hardware back button mean what the on-screen arrow means.
 *
 * Each piece is guarded on its own: an older device without one of these APIs should lose
 * that single behaviour, not the whole setup.
 */
export async function setupNative(game: Phaser.Game): Promise<void> {
  if (!isNative()) return;

  try {
    await ScreenOrientation.lock({ orientation: 'landscape' });
  } catch {
    // some devices refuse the lock; the game still scales to whatever it gets
  }

  try {
    // A child reading a task does not touch the screen for half a minute, and a display
    // that dims mid-question reads as the game breaking.
    await KeepAwake.keepAwake();
  } catch {
    // ignore
  }

  try {
    await App.addListener('backButton', () => {
      if (goBack(game) === 'exit') App.exitApp();
    });
  } catch {
    // ignore
  }
}
