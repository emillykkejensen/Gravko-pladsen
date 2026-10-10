# Gravko-pladsen

Et byggepladsspil for børn — byg maskinerne, gør dem klar, og byg byen. Ingen point at
tabe, ingen måde at ødelægge noget.

A building-site game for children (roughly ages 4–8), in Danish. Assemble an excavator, a
dump truck, a concrete mixer and a mobile crane from their parts, fill them with diesel and
oil, and use them to build houses — dig the hole, lay the gravel, pour the foundation, lift
the steel frame — then paint each house and watch it move into the town. The bigger
buildings need bigger machines: a road roller, a pile driver and a tower crane.

Several children can share one tablet: each picks their own card on the title screen and
gets their own town, machines and stars back exactly as they left them. Stars are spent in
the star shop, on things for the town, a new colour for the machines and new paint for the
houses. The game fills the whole screen, whatever its shape.

## How a house gets built

Every building goes through the same core stages, and each needs its own machine. The
bigger buildings add stages of their own:

| Stage | Machine | What the child does | Scene |
| --- | --- | --- | --- |
| Bank pælene ned | Pælerammen | drives the rig over each cross, then *Bank!* three times a pile | `PileScene` |
| Grav hullet | Gravkoen | drags the bucket into the earth and back over the heap | `DigScene` |
| Kør grus i hullet | Lastbilen | backs the truck up to the stop sign, then tips | `GravelScene` |
| Tril gruset fast | Vejtromlen | drives the roller back and forth until the heaps are flat | `RollScene` |
| Støb fundamentet | Betonbilen | holds the chute over each section of formwork; the sun dries it | `PourScene` |
| Byg stålskelettet | Kranbilen, or Tårnkranen for the high-rise | drags each steel frame (and the roof) into place | `CraneScene` |
| Mal huset | — | picks a colour, then *Flyt ind!* | `CraneScene` |

| Building | Stages | New machine |
| --- | --- | --- |
| *Det lille hus* | grav, grus, støb, rejs, mal | the first four |
| *Villaen* (two storeys) | … adds *tril gruset fast* before the foundation | Vejtromlen |
| *Butikken* (wide, with an awning) | … adds *bank pælene ned* before anything is dug | Pælerammen |
| *Højhuset* (four storeys) | … raised by the tower crane instead of the mobile one | Tårnkranen |

So each bigger building starts with a trip to the workshop to build something new. The
stage lists are data (`stages` on each project in `state/Projects.ts`); a scene only plays
one stage, and `GameState.stage` is whatever the current building's list says is next.

Before a machine can do its first job it has to be **built** in the workshop — each part
dragged from the floor onto a pale silhouette of the finished machine, in any order. Picking
a part up lights a big patch around where it goes, and letting go anywhere in that patch
snaps it on — and then **made ready**:

| | Parts | Its own job |
| --- | --- | --- |
| Gravko | bælter, krop, førerhus, bom, arm, skovl | grease three joints |
| Lastbil | hjul, ramme, førerhus, lad | pump three tyres |
| Betonbil | hjul, ramme, førerhus, tromle, rende | wash three mud spots off the drum |
| Kran | hjul, ramme, førerhus, drejeskive, kranarm, krog | tighten three bolts |
| Vejtromle | tromle, ramme, baghjul, motor, førerhus | squirt water on three dry spots |
| Pæleramme | bælter, krop, førerhus, mast, faldlod | switch on three lamps |
| Tårnkran | fundament, tårn, førerhus, udligger, kontravægt, krog | hoist three Danish flags — a *rejsegilde* in miniature |

Every machine also takes diesel (hold the nozzle on the filler cap) and oil (hold the can on
the oil cap).

A job on the site uses half a tank of diesel and a quarter of the oil, so after the first
time a machine comes back to the pump every other job. Filling is held rather than tapped —
the nozzle stays on the cap while the gauge climbs — because that is what filling a tank
feels like, and it gives the gauge something to show.

Projects grow: *Det lille hus*, *Villaen*, *Butikken*, *Højhuset*, then round again. The
town has eight plots; when they are all full there is a celebration and the next house
starts a new town.

### The signpost

A five-year-old should never have to work out what comes next. `GameState.nextStep()`
answers it — build this machine, fill that one up, go to work — and the town's signpost,
the button a finished machine leaves behind and the button a finished stage leaves behind
all route through it (`helpers/Route.ts`). Following the big button walks the whole game in
order.

The workshop only opens a machine once the site has a job for it (`GameState.isUnlocked()`):
on the first building the excavator first, the truck once the hole is dug, and so on; the
road roller with the villa, the pile driver with the shop, the tower crane with the
high-rise. The others show as grey cards with a padlock and the building they are for —
*Til butikken*. A built machine stays open, and so does any machine a building has already
asked for.

### Follow the orange arrow

Every screen has one big bouncing orange arrow (`ui/Guide.ts`) pointing at the next thing to
touch — the part to pick up, the filler cap to hold the nozzle on, the grease nipple, the
next chunk of earth — and wherever something has to be dropped or held glows yellow with a
white outline: the heap behind the excavator, the next section of formwork, the place the
steel frame goes. A child who cannot read the hint line can still play the whole game.

### Stars and the star shop

Stars are earned for effort: one per part snapped on, one each for a full tank, a full can
and the machine's own job, one per pile banked in, three for a finished machine or stage,
five for a house moving into town. A star is paid by the state transition, never by the
tap, so nothing can be farmed.

They are spent in the **Stjernebutik**, the button under the star counter in the town (a
red badge says how many things the child can afford right now). Three shelves:

| Shelf | What | Where it shows |
| --- | --- | --- |
| Byen | street lamps, bunting, trees, a bus, a wind turbine, a balloon, fireworks, a golden excavator | in the town, each in a place of its own |
| Maskinerne | red, blue, green, pink, purple or gold paint for every machine | every machine, everywhere; yellow is always free to go back to |
| Husene | orange, turquoise, white, brown and rainbow paint | as more paint pots when a house is painted |

Every town decoration has a place no other one uses — the sky, the hills behind the houses,
the road, the gaps on the pavement — so buying all of them never stacks one on another and
the signpost stays clear (`objects/TownArt.ts`). The machines' colour is a *livery*
(`state/Shop.ts`): `MachineArt` reads it at draw time, so the shop's previews can draw any
livery with `inLivery()` and the site's machines change the moment it is bought.

Spending never costs a rank. `GameState` keeps two counts — `stars`, the balance, and
`earned`, every star ever earned — and the rank ladder (*Lærling* → *Byens helt*) reads
`earned`. Nothing bought can be lost, and "Start forfra" is the only thing that clears it.

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

## Filling the screen

`GAME_WIDTH`/`GAME_HEIGHT` in `config.ts` are 880×550, and they are the **smallest** the
stage gets, not its size. A fixed 880×550 scaled to fit left a band of empty sky down both
sides of a phone, which is about twice as wide as it is tall. So `main.ts` gives the stage
the screen's own shape before the game starts (`helpers/Stage.ts`, the same as Sommer
Hotellet): the height stays 550 and the width grows on anything wider than 1.6 — a phone
gets roughly 1,190 — and on anything squarer, a tablet, the width stays 880 and the height
grows instead. Both stop at `MAX_STAGE_WIDTH`/`MAX_STAGE_HEIGHT`, past which the game
letterboxes rather than stretch a scene into a strip. Turning the screen or resizing the
window re-runs it, resizes the stage and restarts whatever scene is up, with the same data,
so the workshop stays on the same machine.

That works because scenes lay themselves out from `this.scale.width`/`height`:

- **scenery** — the sky, the ground, the workshop wall — runs across the whole stage;
- **chrome** — the back button, the star counter, the title — hangs off the edges;
- the **town** spreads its eight plots across the full width;
- each **scene's own layout**, written for 880×550, is centred across and stood on the
  bottom: `BaseScene` has `dx` and `dy` to add to a design x and y, and `groundY()` /
  `floorY()` in `SiteArt` give the ground and the workshop floor on any stage. A taller
  stage gets more sky, not a machine floating in the middle of the screen.

Keep it that way when adding to a scene — a position written as a bare number assumes the
880 stage, and on a phone it ends up on the wrong side of a gap. The safe-area insets are
padding on `<body>`, so nothing lands under a camera cut-out.

The tests run at exactly 1.6 (a 1200×750 viewport), where the stage is 880×550 and every
target in `AT` holds; `tests/screen.spec.ts` covers a phone and a tablet.

## Players

The title screen asks **Hvem spiller?** and shows a card per player — an animal face, a
name, a star count — and each card opens that child's own town exactly as they left it.
Up to six players, which is a full row of cards. It is Sommer Hotellet's design, moved over
whole:

```
gravko-spil-profiles        { version: 1, profiles: [{ id, name, avatar }], last }
gravko-spil-save:<id>       one player's save, in the format under State below
```

Each player's save is its **own key** rather than an entry inside the index, so a write for
one child can never clobber another's, and deleting a player is removing one key.
`GameState` has `profileId` and `loadProfile(id)`; `save()`, `load()` and `reset()` all go to
the active player's key. Before anybody taps a card the game wears whoever played last, so
the title screen obeys their sound settings; with no players at all it writes nothing.

Every setting lives in the save, so every setting is per player. The grown-up screen —
**Voksne**, in the town's top-left corner — says whose settings it shows, and both of its
destructive buttons, **Start forfra** and **Slet spiller**, act on that one child only,
behind a second tap.

A save from before profiles is **migrated, never dropped**: with no index but the old
`gravko-spil-save` present, it becomes "Spiller 1" — copy, write the index, then remove the
old key, so a failure anywhere leaves the old save to migrate on the next launch.

New players are made in `ProfileScene`: pick one of eight animals (drawn in `ui/Players.ts`,
the same faces as Sommer Hotellet) and type a name on a keyboard drawn on the canvas — not a
DOM input, which would raise the phone's own keyboard over half the screen. The keys are
alphabetical and in capitals; the name comes out written the way names are, "Emil". An
empty name becomes the lowest free "Spiller N".

On Android every key is mirrored into native storage under the same name, and
`restoreFromMirror()` puts the saves and then the index back if the WebView comes up with
no index. Deleting or resetting a player removes the native copy too.

## On a phone

The game is built on the same foundation as Sommer Hotellet: the same web build inside a
Capacitor shell, so it plays offline and needs no system permissions. Every push to `main`
that passes the tests builds an APK; once the four signing secrets are set it is published
to the repository's `latest` release. **[docs/ANDROID.md](docs/ANDROID.md)** covers the
signing keys, the secrets and how to build one locally.

## How the code is laid out

```
src/
  config.ts              stage size, palette, type scale, depths, ranks, house paints
  main.ts                Phaser game config and scene list
  state/
    GameState.ts         all persisted progress; the single source of truth
    Profiles.ts          who the players are, where each one's save lives, migration and restore
    Machines.ts          the seven machines as data: parts, the third job
    Projects.ts          the stages, the buildings and which stages each goes through
    Shop.ts              the star shop's catalogue: town things, liveries, house paints
  objects/
    MachineArt.ts        every machine drawn part by part, with poses and a livery
    SiteArt.ts           sky, ground in cross-section, holes, piles, foundations, houses, workshop
    TownArt.ts           what the star shop puts in the town, and where
    FeedbackEffects.ts   star bursts, confetti, praise, toasts
  scenes/
    BaseScene.ts         the four-layer background/ambient/dynamic/effects pattern
    BootScene.ts         waits for the webfont and the native restore, then the menu
    MainMenuScene.ts     title screen: a card per player, a waving excavator, the way out
    ProfileScene.ts      a new player: pick an animal, type a name on the on-screen keyboard
    TownScene.ts         the hub: the town, the workshop, the site, the signpost, the shop
    GarageScene.ts       one bay per machine, with its tanks and what it still needs
    AssembleScene.ts     drag parts onto the machine
    PrepScene.ts         diesel, oil and the machine's own job
    PileScene.ts         drive the pile driver over each cross and bank the piles in
    DigScene.ts          the excavator, steered by its bucket (two-bone IK)
    GravelScene.ts       back the truck up, tip the gravel
    RollScene.ts         roll the gravel heaps flat
    PourScene.ts         the mixer's chute, the formwork, the drying
    CraneScene.ts        lift the frames with either crane, then paint the house
    ShopScene.ts         spend stars, on three shelves
    SettingsScene.ts     one player's sound, progress, "start over" and "delete", for grown-ups
  helpers/
    Draw.ts              shared shapes: plates, captions, buttons, scenery
    Motion.ts            prefers-reduced-motion handling, transitions, entrance animation
    Flatten.ts           bakes static drawing to a texture (see below)
    Stage.ts             gives the stage the screen's shape, and follows it when it turns
    Route.ts             where the next thing to do lives
    Audio.ts             synthesised sound effects and music
    Navigation.ts        where "back" goes, for the on-screen arrow and Android's button
    Native.ts            the Android wrapper: orientation, keep-awake, back button, storage mirror
  ui/
    Chrome.ts            back button, star counter, scene titles
    Players.ts           the animal faces, the whose-town-is-this tag, switching player
    StageDone.ts         the "Videre!" button a finished stage leaves behind
    Guide.ts             the orange pointing arrow, glowing drop zones, the hint banner
tests/
  game.ts                canvas-driving harness: players, taps, drags, holds, named-object lookup
  smoke.spec.ts          every screen draws on a realistic save
  assemble.spec.ts       building machines in any order, rough drops, locked machines
  prepare.spec.ts        filling tanks by holding, each machine's third job
  site.spec.ts           each stage's mechanics, fuel use, and the signpost's order
  state.spec.ts          reloads, damaged and old saves, starting over, a full town
  profiles.spec.ts       players: creating, switching, resetting, deleting, migrating, restoring
  shop.spec.ts           buying, liveries, house paints, the rank staying put
  screen.spec.ts         a phone and a tablet, and turning the screen
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
  the drum's phase, the chute's tip, the crane boom's tip and hook, the roller's turn, the
  pile driver's hammer, the tower crane's trolley — so the same parts move;
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

All progress lives in `src/state/GameState.ts`, persisted to `localStorage` under the
active player's key (see [Players](#players)) with a `version`, and mirrored to native
storage on Android. `load()` restores field by field and clamps everything: a part id that
no longer exists is dropped, a tank cannot be fuller than full, a stage past the end is the
last stage, a shop item nobody sells any more is forgotten.

Version 2 added the bigger buildings' stages, so `site.stage` now counts in the current
building's own list. A version 1 save counted in the old five stages; `load()` finds the
same stage in the new list, and whatever the bigger building added before it counts as done
— a high-rise at its old *rejs* comes back at the tower crane's stage, and asks for the tower
crane to be built. Its stars all count as earned. A save from any other version starts fresh
rather than half-loading.

Tank filling is called every frame while the nozzle is held, so it does not write the save
itself except on the frame the tank becomes full; the scene saves when the nozzle is let go.

### Testing

The suite drives the canvas the way a child does — taps, drags and held fingers, in game
coordinates — and asks scenes where their named objects are (`part:bom`, `slot:bom`,
`tool:diesel`, `cap:diesel`, `piece`, `paint:2`, `bang`, `go`, `player:p1`, `item:bus`)
rather than hard-coding positions. `Game.open(page)` seeds one player who has not played
yet and `game.start()` taps their card; `Game.openWithSave(page, patch)` seeds that player's
save too, once per open, so a test can `page.reload()` and find what it left behind. It
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
