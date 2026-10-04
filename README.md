# Gravko-pladsen

Et byggepladsspil for børn — byg maskinerne, gør dem klar, og byg byen. Ingen point at
tabe, ingen måde at ødelægge noget.

A building-site game for children (roughly ages 4–8), in Danish. Assemble an excavator, a
dump truck, a concrete mixer and a mobile crane from their parts, fill them with diesel and
oil, and use them to build houses — dig the hole, lay the gravel, pour the foundation, lift
the steel frame — then paint each house and watch it move into the town.

## How a house gets built

Every building goes through the same four stages, and each needs its own machine:

| Stage | Machine | What the child does | Scene |
| --- | --- | --- | --- |
| Grav hullet | Gravkoen | drags the bucket into the earth and back over the heap | `DigScene` |
| Kør grus i hullet | Lastbilen | backs the truck up to the stop sign, then tips | `GravelScene` |
| Støb fundamentet | Betonbilen | holds the chute over each section of formwork; the sun dries it | `PourScene` |
| Byg stålskelettet | Kranbilen | drags each steel frame (and the roof) into place with the crane | `CraneScene` |
| Mal huset | — | picks a colour, then *Flyt ind!* | `CraneScene` |

Before a machine can do its first job it has to be **built** in the workshop — each part
dragged from the floor onto a pale silhouette of the finished machine, bottom-up (a cab
needs a chassis to sit on) — and then **made ready**:

| | Gravko | Lastbil | Betonbil | Kran |
| --- | --- | --- | --- | --- |
| Parts | bælter, krop, førerhus, bom, arm, skovl | hjul, ramme, førerhus, lad | hjul, ramme, førerhus, tromle, rende | hjul, ramme, førerhus, drejeskive, kranarm, krog |
| Diesel | hold the nozzle on the filler cap | same | same | same |
| Olie | hold the can on the oil cap | same | same | same |
| Its own job | grease three joints | pump three tyres | wash three mud spots off the drum | tighten three bolts |

A job on the site uses half a tank of diesel and a quarter of the oil, so after the first
time a machine comes back to the pump every other job. Filling is held rather than tapped —
the nozzle stays on the cap while the gauge climbs — because that is what filling a tank
feels like, and it gives the gauge something to show.

Projects grow: *Det lille hus*, *Villaen* (two storeys), *Butikken* (wide, with an awning),
*Højhuset* (four storeys), then round again. The town has eight plots; when they are all
full there is a celebration and the next house starts a new town.

### The signpost

A five-year-old should never have to work out what comes next. `GameState.nextStep()`
answers it — build this machine, fill that one up, go to work — and the town's signpost,
the button a finished machine leaves behind and the button a finished stage leaves behind
all route through it (`helpers/Route.ts`). Following the big button walks the whole game in
order. Nothing stops a child building the crane first, though: the workshop lets any machine
be worked on at any time; the signpost just points.

### Stars

Stars are a read-out of effort, not a currency: one per part snapped on, one each for a
full tank, a full can and the machine's own job, three for a finished machine or stage, five
for a house moving into town. They fill a rank ladder (*Lærling* → *Bygmester*). Nothing can
be lost. A star is paid by the state transition, never by the tap, so nothing can be farmed.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Playwright tests (starts the dev server itself) |
| `npm run android:sync` | Build, and copy it into the Android project |
| `npm run android:apk` | ...and assemble a release APK (needs JDK 21 and the Android SDK) |
| `npm run icons` | Redraw the launcher icon and splash screens |
| `npm run standalone` | Build, then inline everything into one offline HTML file |

Everything is drawn in code with Phaser's `Graphics` API and every sound is synthesised with
Web Audio — there are no image or audio assets. Nunito is bundled, so the game makes no
network requests at all once loaded; a test asserts that.

## On a phone

The game is built on the same foundation as Sommer Hotellet: the same web build inside a
Capacitor shell, so it plays offline and needs no system permissions. Every push to `main`
that passes the tests builds an APK; once the four signing secrets are set it is published
to the repository's `latest` release. **[docs/ANDROID.md](docs/ANDROID.md)** covers the
signing keys, the secrets and how to build one locally.

## How the code is laid out

```
src/
  config.ts              palette, type scale, depths, ranks, paint colours
  main.ts                Phaser game config and scene list
  state/
    GameState.ts         all persisted progress; the single source of truth
    Machines.ts          the four machines as data: parts, what each part needs, the third job
    Projects.ts          the stages every building goes through, and the buildings
  objects/
    MachineArt.ts        every machine drawn part by part, with poses for the moving parts
    SiteArt.ts           sky, ground in cross-section, holes, foundations, frames, houses, workshop
    FeedbackEffects.ts   star bursts, confetti, praise, toasts
  scenes/
    BaseScene.ts         the four-layer background/ambient/dynamic/effects pattern
    BootScene.ts         waits for the webfont, then hands over to the menu
    MainMenuScene.ts     title screen with a waving excavator, and the way out
    TownScene.ts         the hub: the town, the workshop, the site and the signpost
    GarageScene.ts       one bay per machine, with its tanks and what it still needs
    AssembleScene.ts     drag parts onto the machine
    PrepScene.ts         diesel, oil and the machine's own job
    DigScene.ts          the excavator, steered by its bucket (two-bone IK)
    GravelScene.ts       back the truck up, tip the gravel
    PourScene.ts         the mixer's chute, the formwork, the drying
    CraneScene.ts        lift the frames, then paint the house
    SettingsScene.ts     sound, music, progress and "start over", for grown-ups
  helpers/
    Draw.ts              shared shapes: plates, captions, buttons, scenery
    Motion.ts            prefers-reduced-motion handling, transitions, entrance animation
    Flatten.ts           bakes static drawing to a texture (see below)
    Route.ts             where the next thing to do lives
    Audio.ts             synthesised sound effects and music
    Navigation.ts        where "back" goes, for the on-screen arrow and Android's button
    Native.ts            the Android wrapper: orientation, keep-awake, back button, save mirror
  ui/
    Chrome.ts            back button, star counter, scene titles
    StageDone.ts         the "Videre!" button a finished stage leaves behind
tests/
  game.ts                canvas-driving harness: taps, drags, holds, named-object lookup
  smoke.spec.ts          every screen draws on a realistic save
  assemble.spec.ts       building machines, the bottom-up rule, parts that miss
  prepare.spec.ts        filling tanks by holding, each machine's third job
  site.spec.ts           each stage's mechanics, fuel use, and the signpost's order
  state.spec.ts          reloads, damaged saves, starting over, a full town
  native.spec.ts         the Android back button and offline play
  sound.spec.ts          the audio contract
```

### The layer pattern

Scenes never restart themselves to redraw. `BaseScene` gives every scene four layers —
**background** (static, baked to one texture), **ambient** (moves under its own power: sun,
clouds, birds), **dynamic** (rebuilt from `GameState` by `refresh()`) and **effects** (added
at `DEPTH.effects`, so a refresh cannot kill a reward animation mid-flight). An interaction
is: mutate `gameState`, play the feedback, call `refresh()`.

The machines on the building site move every frame — an arm following a finger, a drum
turning — so they are drawn by an `everyFrame` updater into a `Graphics` in the dynamic layer
rather than by refreshing at frame rate. An updater may itself refresh the scene; `BaseScene`
stops running the old list of updaters the moment that happens, because the objects they
draw into have just been destroyed.

### Drawing the machines

`objects/MachineArt.ts` draws each machine in its own coordinates — origin on the ground under
its middle, y negative upwards — one part at a time. That one drawing serves everywhere:

- the **workshop** draws every part as a silhouette (`ghost`), then the parts that are on for
  real, and gives each loose part its own container offset so it drags by its middle;
- the **building site** passes a `Pose` — the excavator's arm joints, the truck bed's angle,
  the drum's phase, the chute's tip, the crane boom's tip and hook — so the same parts move;
- the **town**, the **garage** and the **signpost** just scale it down.

The excavator's arm is solved with two-bone IK: the child drags the bucket, and the elbow is
whichever of the two solutions bends upward, which is how a real excavator holds its boom.
The boom and stick are longer on the site than in the workshop drawing so the bucket reaches
the whole hole from where the excavator stands, and the upper body turns round (mirrors) to
face the spoil heap behind it.

The look follows the reference picture: construction yellow, warm black trim and rubber, a
blue windscreen with a smiling face. One rule from Sommer Hotellet holds it together —
**anything sitting on scenery gets an outline**, always the same warm near-black.

### State

All progress lives in `src/state/GameState.ts`, persisted to `localStorage` under
`gravko-spil-save` with a `version`, and mirrored to native storage on Android. `load()`
restores field by field and clamps everything: a part id that no longer exists is dropped, a
tank cannot be fuller than full, a stage past the end is the last stage. A save from another
version starts fresh rather than half-loading.

Tank filling is called every frame while the nozzle is held, so it does not write the save
itself except on the frame the tank becomes full; the scene saves when the nozzle is let go.

### Testing

The suite drives the canvas the way a child does — taps, drags and held fingers, in game
coordinates — and asks scenes where their named objects are (`part:bom`, `slot:bom`,
`tool:diesel`, `cap:diesel`, `piece`, `paint:2`, `go`) rather than hard-coding positions. It
runs with `prefers-reduced-motion`, which the game honours by collapsing fades and skipping
decorative effects, so tests are not gated on animation time under software WebGL.

There are deliberately **no retries**: this suite drives a canvas, and a retry would paper
over exactly the timing bugs worth knowing about.

### Sound

`helpers/Audio.ts` synthesises everything: a clank when a part snaps on, glugs while a tank
fills, the scoop of the bucket and the slide of earth off it, the reversing beeper, the
winch, the horn, and a generative ambient bed of music that never repeats exactly. The
context is built on the first gesture, never at boot, and nothing in the game sounds like
being told off.
