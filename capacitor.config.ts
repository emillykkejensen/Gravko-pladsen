import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android wrapper. The game itself is untouched web code — Capacitor puts the built
 * `dist/` inside an APK and serves it from the app's own storage, so it plays offline.
 *
 * `appId` is the Android package name. Changing it after release makes a different app:
 * it installs alongside the old one instead of over it, with its own empty save.
 */
const config: CapacitorConfig = {
  appId: 'dk.werktoej.gravkospil',
  appName: 'Gravko-pladsen',
  webDir: 'dist',
  android: {
    // A child will find every scrollbar and long-press menu there is to find.
    allowMixedContent: false,
    captureInput: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#0f2a44',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 600,
      backgroundColor: '#0f2a44',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
