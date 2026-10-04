/**
 * Bundles the whole game into one self-contained HTML file.
 *
 * Everything is already drawn in code, so the only external pieces are the JS bundle and
 * the font — inline both and the result is a single file that plays with no server, no
 * network and no install: open it from a USB stick, email it, host it anywhere.
 *
 * Run `npm run standalone` after a build. Output: dist/gravko-pladsen.html
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const bundleName = readdirSync('dist/assets').find(f => f.endsWith('.js'));
const bundle = readFileSync(`dist/assets/${bundleName}`, 'utf8');
if (bundle.includes('</script')) throw new Error('bundle contains a script end tag; needs escaping');

// The same font file the game and the APK use, inlined so this page fetches nothing at all.
const font = readFileSync('dist/fonts/nunito.woff2').toString('base64');

const head = `<title>Gravko-pladsen</title>

<style>
  @font-face {
    font-family: 'Nunito';
    font-style: normal;
    font-weight: 400 700;
    font-display: block;
    src: url(data:font/woff2;base64,${font}) format('woff2');
  }

  /*
    The game paints its own daylight, so this page commits to a single look rather than
    following the viewer's theme — a dark variant would fight the sky. Colours are the
    game's own tokens from src/config.ts.
  */
  :root {
    --sky:   #A9DAF0;
    --cream: #FBF3E4;
    --ink:   #5A4E42;
    --roof:  #D9705C;
    --font:  Nunito, 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif;
  }

  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--sky);
    color: var(--ink);
    font-family: var(--font);
    -webkit-tap-highlight-color: transparent;
    overscroll-behavior: none;
  }

  #game-container {
    width: 100vw;
    height: 100dvh;
    height: 100vh;
  }
  #game-container canvas { display: block; touch-action: none; }

  /*
    The game is 960x600. Held upright, a phone letterboxes that into a strip barely tall
    enough to read, so portrait gets a card instead of a bad game.
  */
  #rotate {
    position: fixed;
    inset: 0;
    display: none;
    place-items: center;
    background: var(--sky);
    padding: 2rem;
    text-align: center;
  }
  @media (orientation: portrait) and (max-width: 860px) {
    #rotate { display: grid; }
    #game-container { display: none; }
  }

  #rotate .card {
    max-width: 22rem;
    background: var(--cream);
    border-radius: 22px;
    padding: 2.25rem 1.75rem;
    box-shadow: 0 2px 4px rgba(90, 78, 66, .12), 0 18px 40px -20px rgba(90, 78, 66, .45);
  }
  #rotate h1 {
    margin: 0 0 .5rem;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--roof);
    text-wrap: balance;
  }
  #rotate p { margin: 0; font-size: 1rem; line-height: 1.5; color: var(--ink); }
  #rotate .phone {
    width: 74px;
    height: 74px;
    margin: 0 auto 1.25rem;
    border: 5px solid var(--roof);
    border-radius: 14px;
    animation: tip 2.6s ease-in-out infinite;
  }
  @keyframes tip {
    0%, 40%   { transform: rotate(0deg); }
    60%, 100% { transform: rotate(-90deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    #rotate .phone { animation: none; transform: rotate(-90deg); }
  }
</style>

<div id="game-container"></div>

<div id="rotate">
  <div class="card">
    <div class="phone"></div>
    <h1>Drej telefonen</h1>
    <p>Gravko-pladsen spilles på tværs. Hold telefonen sidelæns, så fylder byggepladsen hele skærmen.</p>
  </div>
</div>

<script type="module">
// The artifact skeleton owns <head>, so the viewport rule has to be set at runtime —
// without it a phone renders against a ~980px virtual viewport and zooms the canvas out.
(function () {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
})();

`;

const foot = `
</script>
`;

const out = process.argv[2] ?? 'dist/gravko-pladsen.html';
writeFileSync(out, head + bundle + foot);
const size = (head.length + bundle.length + foot.length) / 1024 / 1024;
console.log(`wrote ${out} — ${size.toFixed(2)} MB, from bundle ${bundleName}`);
