# The Android app

The game is a web game. The Android app is the same code — the same `dist/` that a browser
loads — inside a [Capacitor](https://capacitorjs.com) shell, which is a native app whose
whole screen is a WebView pointed at files inside the APK. Nothing about the game was
rewritten for it.

That choice was deliberate. Phaser draws every pixel through WebGL onto a `<canvas>`, and
React Native has neither a canvas nor a DOM, so a React Native version would be a rewrite of
all of the game rather than a way to package it. A Trusted Web Activity was the other
option, but it is a shell around a hosted URL: it needs somewhere to host the game, HTTPS,
Digital Asset Links, and a working connection every time a child opens it.

## Installing it

Every push to `main` that passes the tests builds an APK and puts it on the
[latest release](../../releases/tag/latest). On the phone, open that page, download
**gravko-pladsen.apk** and tap it. Android asks once for permission to install apps from
the browser.

Android 7 (2016) or newer, and it works with no network.

It requests no system permissions — not even `INTERNET`, since the WebView reads the game
out of the APK. Manifest merging does add one entry, `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
which androidx.core defines for its own non-exported broadcast receivers: it is scoped to
this app's own signature, grants nothing beyond its own process and is never shown to the
person installing. CI fails the build if a real `android.permission.*` ever appears.

## What the wrapper adds

A WebView is not Chrome, and a game on a phone is not a page in a tab. Six things exist only
for the app, and all six are tested in `tests/native.spec.ts` — in a browser, by reproducing
the conditions rather than by installing anything.

| | Why |
| --- | --- |
| **A way out** | An immersive WebView has no system bars and no address bar, so without this there is no exit at all. The title screen's **Afslut** button calls `App.exitApp()`; on the web, where no page may close its own tab, it says goodbye instead. |
| **Landscape lock and immersive fullscreen** | The game fills the screen in landscape (see "Filling the screen" in the README). A status bar across the building site breaks the picture and a navigation bar sits where a child rests their thumbs. |
| **The hardware back button** | It means what the on-screen arrow means: workshop → town → title screen, and only then does it close the app. `addBackButton` registers the target and `helpers/Navigation.ts` answers the question, so the two buttons cannot disagree. |
| **Keep-awake** | A child watching the concrete dry does not touch the screen for a while. |
| **Every player's save mirrored to native storage** | `localStorage` in a WebView is not durable: Android can clear web storage to reclaim space. Every write — the list of players and each player's save, under the same keys — also goes to SharedPreferences, and is read back if web storage comes up empty. |
| **A bundled font** | Nunito used to come from Google Fonts. With no network in the app, that would silently fall back to a system face and every label would change width. It is now a 38 KB variable file in `public/fonts/`. |

## Signing

Android identifies an app by its signing key. **A build signed with a different key cannot
install over the previous one** — Android makes you uninstall first, and uninstalling takes
the save with it. So the same key has to sign every build for the life of the app, and the
one thing worth being careful with here is the keystore.

Four repository secrets, under Settings → Secrets and variables → Actions:

| Secret | What it is |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the `.jks` file, base64-encoded (`base64 -w0 gravko-pladsen.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the store password |
| `ANDROID_KEY_ALIAS` | `gravko-pladsen` |
| `ANDROID_KEY_PASSWORD` | the key password (the same as the store password) |

Without them the build still runs, signs with Android's debug key, and uploads the APK as a
build artifact — but the publish step checks the signer and refuses to put a debug-signed
build on the release, precisely so that nobody installs one and loses their stars to the
first properly signed update.

To generate a keystore:

```sh
keytool -genkeypair -v \
  -keystore gravko-pladsen.jks -alias gravko-pladsen \
  -keyalg RSA -keysize 4096 -validity 10950 -storetype PKCS12 \
  -dname "CN=Gravko-pladsen, O=Werktoej, C=DK"
```

Keep the file somewhere that is not this repository — `.gitignore` covers `*.jks` and
`*.keystore` so it cannot be committed by accident. Losing it means never being able to
update the installed app again.

## Versions

`versionCode` is the CI run number and `versionName` is `1.0.<run number>`, so every build
installs over the one before it instead of being refused as a downgrade. Nothing needs
bumping by hand.

## Building it locally

Needs JDK 21 and the Android SDK (`compileSdk` 36); Android Studio installs both.

```sh
npm run android:sync    # build the web app and copy it into android/
npm run android:apk     # ...and assemble a release APK
```

The APK lands in `android/app/build/outputs/apk/release/`. Without the keystore environment
variables it is debug-signed, which is fine for looking at but not for keeping.

`npx cap open android` opens the project in Android Studio, where an emulator is the quickest
way to see the wrapper behaviour that a browser cannot show: the immersive bars, the back
button, and the exit button actually closing the app.

## The icon

`npm run icons` redraws the launcher icon and splash screens at every density from the SVG in
`tools/make-icons.mjs`, rendering each size in headless Chromium rather than resampling one
large PNG — a launcher icon is 48px on an mdpi screen, and that is where resampling shows.

## Not done

- **iOS.** `npx cap add ios` would work the same way, but building an IPA needs macOS and a
  paid Apple developer account, neither of which CI has.
- **Play Store.** That needs an AAB rather than an APK, a developer account, a privacy
  policy and a content rating. Sideloading is enough for a game for one family.
