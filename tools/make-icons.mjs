/**
 * Draws the launcher icon and the splash screen at every density Android asks for.
 *
 * The game has no image assets and no image tooling in this environment, so the artwork is
 * an SVG rendered by headless Chromium at each exact pixel size — sharper than resampling
 * one big PNG down to 48px, which is where a launcher icon actually lives.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const P = {
  sky: '#A9DAF0',
  skyLight: '#D6EDF8',
  grass: '#8CC96E',
  yellow: '#F7C21B',
  yellowDeep: '#D99A0B',
  rubber: '#3A332D',
  rubberLight: '#58504A',
  steel: '#C4CBD1',
  glass: '#4F86C6',
  ink: '#4A3A2C',
};

/**
 * The excavator from the game, drawn in a 100x100 box.
 *
 * Tracks, body, the cab with its face, and the arm reaching up and forward — the
 * silhouette is the arm, so it is drawn thick enough to survive at 48px. `scale` shrinks
 * everything toward the centre for the adaptive foreground, where only the middle ~66%
 * survives the launcher's crop.
 */
function gravko(scale = 1) {
  const s = (n) => 50 + (n - 50) * scale;
  const w = (n) => n * scale;
  const line = `stroke="${P.ink}" stroke-width="${w(2.2)}" stroke-linejoin="round" stroke-linecap="round"`;
  return `
    <g>
      <!-- arm: boom up from the body, stick down to the bucket -->
      <path d="M ${s(54)} ${s(58)} L ${s(70)} ${s(24)} L ${s(84)} ${s(52)}" fill="none"
            stroke="${P.ink}" stroke-width="${w(11)}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M ${s(54)} ${s(58)} L ${s(70)} ${s(24)} L ${s(84)} ${s(52)}" fill="none"
            stroke="${P.yellow}" stroke-width="${w(7)}" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M ${s(78)} ${s(50)} L ${s(91)} ${s(52)} L ${s(90)} ${s(64)} L ${s(80)} ${s(66)} Z" fill="${P.rubber}" ${line}/>
      <!-- body -->
      <rect x="${s(12)}" y="${s(50)}" width="${w(48)}" height="${w(20)}" rx="${w(3)}" fill="${P.yellow}" ${line}/>
      <rect x="${s(12)}" y="${s(62)}" width="${w(48)}" height="${w(5)}" fill="${P.rubber}"/>
      <!-- cab with the face -->
      <rect x="${s(34)}" y="${s(26)}" width="${w(24)}" height="${w(30)}" rx="${w(3)}" fill="${P.rubber}" ${line}/>
      <rect x="${s(37)}" y="${s(29)}" width="${w(17)}" height="${w(16)}" rx="${w(2)}" fill="${P.glass}"/>
      <ellipse cx="${s(42)}" cy="${s(35)}" rx="${w(1.3)}" ry="${w(2)}" fill="${P.ink}"/>
      <ellipse cx="${s(49)}" cy="${s(35)}" rx="${w(1.3)}" ry="${w(2)}" fill="${P.ink}"/>
      <path d="M ${s(42)} ${s(39.5)} Q ${s(45.5)} ${s(42.5)} ${s(49)} ${s(39.5)}" fill="none" stroke="${P.ink}" stroke-width="${w(1.4)}" stroke-linecap="round"/>
      <!-- tracks -->
      <rect x="${s(8)}" y="${s(70)}" width="${w(58)}" height="${w(15)}" rx="${w(7.5)}" fill="${P.rubber}" ${line}/>
      <circle cx="${s(16)}" cy="${s(77.5)}" r="${w(4.5)}" fill="${P.steel}"/>
      <circle cx="${s(58)}" cy="${s(77.5)}" r="${w(4.5)}" fill="${P.steel}"/>
      <rect x="${s(24)}" y="${s(75.5)}" width="${w(26)}" height="${w(4)}" rx="${w(2)}" fill="${P.rubberLight}"/>
    </g>`;
}

const svg = {
  /** Legacy square icon: full bleed, rounded by the launcher. */
  legacy: () => `
    <rect width="100" height="100" fill="${P.sky}"/>
    <ellipse cx="50" cy="138" rx="86" ry="52" fill="${P.grass}"/>
    ${gravko(1)}`,

  /** Round icon: the same, already circular. */
  round: () => `
    <defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>
    <g clip-path="url(#c)">
      <rect width="100" height="100" fill="${P.sky}"/>
      <ellipse cx="50" cy="138" rx="86" ry="54" fill="${P.grass}"/>
      ${gravko(0.88)}
    </g>`,

  /** Adaptive foreground: transparent, artwork inside the safe zone. */
  foreground: () => gravko(0.6),

  /** Splash: one wide frame, letterboxed by Android on whatever screen it gets. */
  splash: () => `
    <rect width="100" height="100" fill="${P.skyLight}"/>
    <ellipse cx="50" cy="140" rx="90" ry="56" fill="${P.grass}"/>
    ${gravko(0.72)}`,
};

async function render(page, kind, size, out) {
  const body = svg[kind]();
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">${body}</svg>`
  );
  const shot = await page.locator('svg').screenshot({ omitBackground: true });
  writeFileSync(out, shot);
  return shot.length;
}

const RES = 'android/app/src/main/res';
// mdpi is the 1x baseline; a launcher icon is 48dp, an adaptive one 108dp.
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ deviceScaleFactor: 1 });
let total = 0;

for (const [name, factor] of DENSITIES) {
  const dir = `${RES}/mipmap-${name}`;
  mkdirSync(dir, { recursive: true });
  total += await render(page, 'legacy', Math.round(48 * factor), `${dir}/ic_launcher.png`);
  total += await render(page, 'round', Math.round(48 * factor), `${dir}/ic_launcher_round.png`);
  total += await render(page, 'foreground', Math.round(108 * factor), `${dir}/ic_launcher_foreground.png`);

  // Splash lives in orientation-specific folders; the game is landscape but Android can
  // still show the portrait one for an instant while it rotates.
  for (const orientation of ['land', 'port']) {
    const sdir = `${RES}/drawable-${orientation}-${name}`;
    mkdirSync(sdir, { recursive: true });
    total += await render(page, 'splash', Math.round(320 * factor), `${sdir}/splash.png`);
  }
}
total += await render(page, 'splash', 480, `${RES}/drawable/splash.png`);

// A 1024px master, for a store listing or anything else that wants one later.
mkdirSync('docs/brand', { recursive: true });
total += await render(page, 'legacy', 1024, 'docs/brand/icon-1024.png');

await browser.close();
console.log(`wrote icons and splashes, ${(total / 1024).toFixed(0)} KB total`);
