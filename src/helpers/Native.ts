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

/**
 * Where the one save was mirrored before there were player profiles.
 *
 * Only ever read now, by `restoreFromMirror` in state/Profiles, for a phone whose web storage
 * was lost before it ever ran a build with profiles.
 */
export const LEGACY_MIRROR_KEY = 'save';

/**
 * A second copy of what the game stores, in native storage.
 *
 * `localStorage` inside a WebView is not durable the way a file is — Android can clear web
 * storage to reclaim space, and some devices drop it when the app updates. Losing 40 stars
 * that took a week to earn is the kind of thing that ends a game's life in a household, so
 * every write is mirrored into SharedPreferences, under the same key it has in
 * localStorage, and read back if localStorage comes up empty on a later launch.
 */
export function mirror(key: string, value: string): void {
  if (!isNative()) return;
  Preferences.set({ key, value }).catch(() => undefined);
}

/** Drops the native copy too, so a deleted player cannot come back from the mirror. */
export function unmirror(key: string): void {
  if (!isNative()) return;
  Preferences.remove({ key }).catch(() => undefined);
}

/** The native copy of one key. Always null in a browser, which has no second copy. */
export async function readMirror(key: string): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch {
    return null;
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
