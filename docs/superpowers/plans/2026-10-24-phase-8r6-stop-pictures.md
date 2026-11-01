# Phase 8R-6: Pictures at the Stops: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the seventh plan of reports at stops (Gantt phase 17). It builds the design `docs/superpowers/specs/2026-10-23-stop-pictures-design.md`, which came from the staging of 8R-1 to 8R-5 on 2026-10-23.

Leek Duck's Pokémon icons are not square, and Discord crops a thumbnail to a square, so the pictures in the post and the DMs lost heads and feet. Each task block of the post also had only one picture, even where its versions had different rewards. Now:

- **Every picture is padded to a square** and served by the bot's web server.
- **The picture follows one rule:**
  - a known Pokémon shows the Pokémon;
  - a "one of" or an uncertain grunt shows the game's encounter picture (a commit of PokeMiners' `QuestPokemonReward.png`);
  - items and Mega Energy show their own picture;
  - leaders and Giovanni show their portraits;
  - a picture that is gone (404 or 410) shows none.
- **The post "Today's Stops"** (renamed from "Today at the stops"):
  - a picture on every reward line, at most six per task;
  - a busy day decided for the whole post, dropping item pictures first;
  - during an event's window, the day's research below the event's tasks, under "Back at <time>, after <event>", without pictures.
- **DMs** follow the same rule. **The grunt message** has one thumbnail beside its heading, and no gallery.
- **The staging's small fixes:**
  - "Rare Candy · Research" in a DM's reason line;
  - answers no longer say "pinned";
  - "Changed in #…" for a grunt refined in place;
  - `/want rocket` ranks whole words first;
  - "one of" is found by the task search;
  - "Already reported" is given back, up to the window's uses (Matt, 2026-10-24).

**Architecture:**

- **The domain:**
  - `src/domain/stops/pictures.ts`: `researchPicture`, `rocketPicture`, `ENCOUNTER_PICTURE`, `isPictureSource`, `PictureLookup`;
  - `src/domain/rocket/portraits.ts`.
- **Services:**
  - `StopPictures` (`src/services/stop-pictures.ts`):
    - `prepare(sources)` with a 2.5 s deadline, renewals in the background and a shared queue of four fetches;
    - `url(source)`, which gives the square, the feed's address, or nothing when the picture is gone;
    - `close()`, `idle()`, kept in `var/pictures/` (at most 2,000) under the hash of the source;
    - `GET /pictures/<key>.png`.
- **Callers of `prepare`:**
  - `StopPostService`, with `postPictures` read off the layout through the same lookup as the draw;
  - `NotifyService`;
  - `GruntMessageService`.
- **The map:** a hideout's picture is `rocketPicture` through `StopPictures.url`.
- **The give-back:** a `UserError` with `givesBack` and `said` after the answer, and `givenBackOnTheMap` on the map.

**Tech stack:** TypeScript 6.0, Node 24, discord.js v14, sharp, Kysely and Vitest.

- No new dependency.
- **No migration**, no setting, no game data change and no party state change.
- **No command option changes:** only help texts and autocomplete values change, so no deploy is needed for this plan alone.

**Spec:**

- the design above, with its review answers (Q1–Q9) and Matt's later decisions: the name "Today's Stops", the day's research during an event's window, and the cap on giving uses back;
- the brief `.superpowers/sdd/8r-6-pictures/design.md`;
- the fix rounds `fix-round-1.md` and `fix-round-2.md`;
- the ledger (git-ignored).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8r6` (tip `7fae7797`, tag `proto-8r6-r4`), one commit per task, on `stop-reports` f9d28e5b. Each commit typechecks and passes its tests. On the tip of round 3 (6108f95a), the full check (9,554 tests), the build and the database suite (597) pass. The last change was help text only, checked with the typecheck and its tests.

**Reviews:**

- **The design:** a fresh Opus reviewer read it before any code was written (Q1–Q9).
- **The prototype:** two Opus reviewers read it.
  - Tasks 1–4: L1–L6. Two were Important: `prepare` held up draws and answers, and a gone portrait showed a broken picture.
  - Tasks 5–8: R1–R5, all Minor; R3 was ruled by Matt.
- **The fixes:** reviewed once (F1–F3, one Important: a promise leak). The last round was checked by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/stop-reports.md`, `notifications-and-dms.md`, `discord-framework.md`, `web.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip.

---

### Task 1: 8R-6 task 1: The picture rule in the domain

Prototype commit: `5f78831fa8752af85429d74acfa5f4798e0dea7c`

Which picture a research reward line, a research DM, a grunt, a leader,
Giovanni and a decoy get (design 2026-10-23-stop-pictures-design.md, the
rule for every picture): the Pokemon when it is known, the game's encounter
picture while it is not, an item's or Mega Energy's own, the portrait of a
leader or Giovanni, none where there is none. The encounter picture and the
portraits are constants; isPictureSource is the host allowlist a fetch takes.

**Files:**

```
 src/domain/rocket/portraits.ts    |  22 +++++++
 src/domain/stops/pictures.test.ts | 205 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/stops/pictures.ts      | 104 +++++++++++++++++++++++++++++
 3 files changed, 331 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/stops/pictures.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 5f78831fa8752af85429d74acfa5f4798e0dea7c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 1: The picture rule in the domain`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/rocket/portraits.ts b/src/domain/rocket/portraits.ts
new file mode 100644
index 0000000000000000000000000000000000000000..894f63b4cf0d906cca981341c8d86afafa172063
--- /dev/null
+++ b/src/domain/rocket/portraits.ts
@@ -0,0 +1,22 @@
+import type { Leader } from './lineups.js';
+
+/*
+ * The portraits of Team GO Rocket's leaders and boss (plan 8R-6; design
+ * `2026-10-23-stop-pictures-design.md`, rule 5): Leek Duck's, 128 by 128 and square already. A
+ * hideout of a leader or Giovanni shows the portrait, the Pokémon caught stays in the text. They
+ * pass the host check of the feeds' pictures (`leekDuckPicture`); one that fails to load shows no
+ * picture.
+ */
+
+/** Where Leek Duck keeps the portraits. */
+const PORTRAITS = 'https://cdn.leekduck.com/assets/img/rocket/';
+
+/** Cliff's, Arlo's and Sierra's portraits. */
+export const LEADER_PORTRAITS: Readonly<Record<Leader, string>> = {
+  cliff: `${PORTRAITS}leader-cliff.png`,
+  arlo: `${PORTRAITS}leader-arlo.png`,
+  sierra: `${PORTRAITS}leader-sierra.png`,
+};
+
+/** Giovanni's portrait. */
+export const GIOVANNI_PORTRAIT = `${PORTRAITS}boss-giovanni.png`;
diff --git a/src/domain/stops/pictures.test.ts b/src/domain/stops/pictures.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..498a8729c73f222602b30b6a98613c99b47ffad3
--- /dev/null
+++ b/src/domain/stops/pictures.test.ts
@@ -0,0 +1,205 @@
+import { describe, expect, it } from 'vitest';
+import type { TaskReward } from '../research/task.js';
+import type { RocketCatch } from '../rocket/lineups.js';
+import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../rocket/portraits.js';
+import {
+  ENCOUNTER_PICTURE,
+  isPictureSource,
+  researchPicture,
+  rocketPicture,
+  type StopPicture,
+} from './pictures.js';
+
+const ICONS = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+
+function encounter(name: string, dex: number, image: string | null = `${ICONS}pm${dex}.icon.png`) {
+  return {
+    kind: 'encounter',
+    name,
+    key: name.toLowerCase(),
+    dex,
+    shiny: false,
+    cp: null,
+    image,
+  } satisfies TaskReward;
+}
+
+const GIBLE = encounter('Gible', 443);
+const LARVITAR = encounter('Larvitar', 246);
+const UNPICTURED = encounter('Missingno', 0, null);
+const RARE_CANDY: TaskReward = {
+  kind: 'item',
+  item: 'rare-candy',
+  name: 'Rare Candy',
+  quantity: 3,
+  image: 'https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png',
+};
+const RAZZ: TaskReward = {
+  kind: 'item',
+  item: 'golden-razz-berry',
+  name: 'Golden Razz Berry',
+  quantity: 2,
+  image: 'https://cdn.leekduck.com/assets/img/items/Golden%20Razz%20Berry.png',
+};
+const ENERGY: TaskReward = {
+  kind: 'energy',
+  dex: 254,
+  name: 'Sceptile Mega Energy',
+  quantity: 20,
+  image: 'https://cdn.leekduck.com/assets/img/items/mega-energy.png',
+};
+const TYPED_ITEM: TaskReward = {
+  kind: 'item',
+  item: 'stardust',
+  name: 'Stardust',
+  quantity: 0,
+  image: null,
+};
+
+function catchOf(name: string, dex: number): RocketCatch {
+  return {
+    name,
+    key: name.toLowerCase(),
+    dex,
+    shiny: false,
+    image: `${ICONS}pm${dex}.icon.png`,
+  };
+}
+
+const MAGIKARP = catchOf('Magikarp', 129);
+const FEEBAS = catchOf('Feebas', 349);
+const CUBONE = catchOf('Cubone', 104);
+
+describe('the picture of a research reward line, a DM and a confirmation', () => {
+  const cases: [string, readonly TaskReward[], StopPicture | undefined][] = [
+    ['a Pokémon named: its picture', [GIBLE], { source: GIBLE.image!, kind: 'pokemon' }],
+    [
+      '"one of" a task’s encounters: the encounter picture',
+      [GIBLE, LARVITAR],
+      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
+    ],
+    [
+      'a report of before plan 8R-5 with encounters and items: "one of", the encounter picture',
+      [GIBLE, RARE_CANDY],
+      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
+    ],
+    ['an item: its picture', [RARE_CANDY], { source: RARE_CANDY.image!, kind: 'item' }],
+    ['Mega Energy: its picture', [ENERGY], { source: ENERGY.image!, kind: 'item' }],
+    ['a typed task without a reward: none', [], undefined],
+    ['a typed reward without a picture: none', [TYPED_ITEM], undefined],
+    ['a Pokémon the feed gave no picture: none', [UNPICTURED], undefined],
+    ['items alone, several (a report of before plan 8R-5): none', [RARE_CANDY, RAZZ], undefined],
+  ];
+  it.each(cases)('%s', (_name, rewards, expected) => {
+    expect(researchPicture(rewards)).toEqual(expected);
+  });
+});
+
+describe('the picture of Team GO Rocket', () => {
+  const cases: [string, string, readonly RocketCatch[], StopPicture | undefined][] = [
+    [
+      'a grunt of one possible catch: that Pokémon',
+      'grunt:water:male',
+      [MAGIKARP],
+      { source: MAGIKARP.image!, kind: 'pokemon' },
+    ],
+    [
+      'a lineup of two or more catches: the encounter picture',
+      'grunt:water:female',
+      [MAGIKARP, FEEBAS],
+      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
+    ],
+    [
+      'a grunt "not sure which": the encounter picture',
+      'grunt:water',
+      [MAGIKARP, FEEBAS, CUBONE],
+      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
+    ],
+    ['a grunt whose catches are not known: none', 'grunt:none', [], undefined],
+    [
+      'a decoy of one catch: that Pokémon',
+      'decoy',
+      [CUBONE],
+      { source: CUBONE.image!, kind: 'pokemon' },
+    ],
+    [
+      'a decoy of several: the encounter picture',
+      'decoy',
+      [MAGIKARP, FEEBAS],
+      { source: ENCOUNTER_PICTURE, kind: 'pokemon' },
+    ],
+    [
+      'Cliff: his portrait, whatever can be caught',
+      'leader:cliff',
+      [CUBONE],
+      { source: LEADER_PORTRAITS.cliff, kind: 'pokemon' },
+    ],
+    [
+      'Arlo: his portrait',
+      'leader:arlo',
+      [MAGIKARP, FEEBAS],
+      { source: LEADER_PORTRAITS.arlo, kind: 'pokemon' },
+    ],
+    [
+      'Sierra: her portrait, also with nothing known',
+      'leader:sierra',
+      [],
+      { source: LEADER_PORTRAITS.sierra, kind: 'pokemon' },
+    ],
+    [
+      'Giovanni: his portrait',
+      'giovanni',
+      [CUBONE],
+      { source: GIOVANNI_PORTRAIT, kind: 'pokemon' },
+    ],
+    ['a key that names nobody: none', 'grunt:nothing', [MAGIKARP], undefined],
+  ];
+  it.each(cases)('%s', (_name, key, catches, expected) => {
+    expect(rocketPicture(key, catches)).toEqual(expected);
+  });
+
+  it('a catch the feed gave no picture: none', () => {
+    expect(rocketPicture('grunt:water', [{ ...MAGIKARP, image: null }])).toBeUndefined();
+  });
+});
+
+describe('where a picture may be fetched from', () => {
+  it('takes the encounter picture, the portraits and Leek Duck’s pictures', () => {
+    for (const url of [
+      ENCOUNTER_PICTURE,
+      GIOVANNI_PORTRAIT,
+      ...Object.values(LEADER_PORTRAITS),
+      GIBLE.image!,
+      RARE_CANDY.image!,
+    ]) {
+      expect(isPictureSource(url), url).toBe(true);
+    }
+  });
+
+  it('refuses any other host, scheme, port, or a user in the address', () => {
+    for (const url of [
+      'http://cdn.leekduck.com/assets/img/items/Rare%20Candy.png',
+      'https://leekduck.com/assets/img/items/Rare%20Candy.png',
+      'https://cdn.leekduck.com.example.com/x.png',
+      'https://cdn.leekduck.com:8443/x.png',
+      'https://user@cdn.leekduck.com/x.png',
+      'https://raw.githubusercontent.com/someone/else/master/x.png',
+      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/refs/heads/master/Images/Quests/Other.png',
+      'not an address',
+      '',
+    ]) {
+      expect(isPictureSource(url), url).toBe(false);
+    }
+  });
+
+  it('takes the encounter picture from one commit of PokeMiners’ assets, never from a branch that may change', () => {
+    expect(ENCOUNTER_PICTURE).toMatch(
+      /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/Quests\/QuestPokemonReward\.png$/,
+    );
+    expect(
+      isPictureSource(
+        'https://raw.githubusercontent.com/PokeMiners/pogo_assets/refs/heads/master/Images/Quests/QuestPokemonReward.png',
+      ),
+    ).toBe(false);
+  });
+});
diff --git a/src/domain/stops/pictures.ts b/src/domain/stops/pictures.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0f18fa13fe88282b8136765bf9986518bc5f71d2
--- /dev/null
+++ b/src/domain/stops/pictures.ts
@@ -0,0 +1,104 @@
+import { leekDuckPicture } from '../research/leekduck.js';
+import type { TaskReward } from '../research/task.js';
+import { parseRocketKey, type RocketCatch } from '../rocket/lineups.js';
+import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../rocket/portraits.js';
+
+/*
+ * Which picture a report at a stop shows (plan 8R-6; design `2026-10-23-stop-pictures-design.md`,
+ * "The rule for every picture"), in the pinned post, the DMs and a grunt's message alike: when
+ * the Pokémon is known, its picture; while it is not (a "one of", a grunt whose catch is open),
+ * the game's encounter picture; an item or Mega Energy its own; a leader or Giovanni the
+ * portrait; none where there is none. The address given is the source (a feed's, or one of the
+ * constants here): `StopPictures` makes it square and gives the address a message names. Pure.
+ */
+
+/**
+ * The game's generic encounter picture (PokeMiners' `Images/Quests/QuestPokemonReward.png`, 128
+ * by 126, transparent): "this may not be yours", before a word is read (Matt). Pinned to one
+ * commit of their assets (byte-identical to master's on 2026-10-24), so it cannot change under
+ * the bot.
+ */
+export const ENCOUNTER_PICTURE =
+  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Quests/QuestPokemonReward.png';
+
+/**
+ * What a picture is of, for the busy day of the pinned post (design, "The post's layout"): the
+ * pictures of items and Mega Energy go first; the encounter picture and the portraits count as
+ * Pokémon.
+ */
+export type PictureKind = 'pokemon' | 'item';
+
+/** A picture by the rule: its source address and what it is of. */
+export interface StopPicture {
+  source: string;
+  kind: PictureKind;
+}
+
+/**
+ * The address a message names for a source (`StopPictures.url`: the square picture the bot
+ * serves, or the source itself while it is not ready), or none where the source is gone (it
+ * answered 404 or 410): the renderer then shows no picture (rule 6). Renderers take it as a
+ * lookup.
+ */
+export type PictureLookup = (source: string) => string | undefined;
+
+/** The source as it is: where no `StopPictures` is given (tests, the plain text post). */
+export const AS_FED: PictureLookup = (source) => source;
+
+/**
+ * Whether a picture may be fetched from this address (design, "Safety"): https of Leek Duck's CDN
+ * as the feeds' check takes it (`leekDuckPicture`, the portraits among them), or the encounter
+ * picture itself; nothing else.
+ */
+export function isPictureSource(url: string): boolean {
+  if (url === ENCOUNTER_PICTURE) return true;
+  if (leekDuckPicture(url) !== url) return false;
+  try {
+    const parsed = new URL(url);
+    return parsed.hostname === 'cdn.leekduck.com' && parsed.port === '' && parsed.username === '';
+  } catch {
+    return false;
+  }
+}
+
+/** A picture of this source and kind; none without a source. */
+function pictured(source: string | null, kind: PictureKind): StopPicture | undefined {
+  return source === null ? undefined : { source, kind };
+}
+
+/**
+ * The picture of a research reward line, a research DM and a confirmation (rules 2 to 4, 6): of
+ * one reward that reward's (a Pokémon, an item, Mega Energy); of two or more ("one of" a task's
+ * encounters, or a report of before plan 8R-5 that holds every reward of its task) the encounter
+ * picture, while any of them is a Pokémon (several items alone are no encounter: none); of none
+ * (a typed task without its reward), none.
+ */
+export function researchPicture(rewards: readonly TaskReward[]): StopPicture | undefined {
+  const [only, ...others] = rewards;
+  if (only === undefined) return undefined;
+  if (others.length === 0)
+    return pictured(only.image, only.kind === 'encounter' ? 'pokemon' : 'item');
+  return rewards.some((reward) => reward.kind === 'encounter')
+    ? { source: ENCOUNTER_PICTURE, kind: 'pokemon' }
+    : undefined;
+}
+
+/**
+ * The picture of a Team GO Rocket report by who it is of (its `rocketKey`) and what can be caught
+ * (rules 2, 3, 5, 6): a leader or Giovanni the portrait; a grunt or the decoy of one possible
+ * catch that Pokémon, of two or more the encounter picture, of none known none.
+ */
+export function rocketPicture(
+  key: string,
+  catches: readonly Pick<RocketCatch, 'image'>[],
+): StopPicture | undefined {
+  const who = parseRocketKey(key);
+  if (who === undefined) return undefined;
+  if (who.kind === 'leader') return { source: LEADER_PORTRAITS[who.leader], kind: 'pokemon' };
+  if (who.kind === 'giovanni') return { source: GIOVANNI_PORTRAIT, kind: 'pokemon' };
+  const [only, ...others] = catches;
+  if (only === undefined) return undefined;
+  return others.length === 0
+    ? pictured(only.image, 'pokemon')
+    : { source: ENCOUNTER_PICTURE, kind: 'pokemon' };
+}
````

### Task 2: 8R-6 task 2: StopPictures and its route

Prototype commit: `2fb57443f4e4d0228dbe0f20098792b88a2186e0`

StopPictures fetches a feed's picture from the hosts the feeds' checks allow
(a byte limit, sharp's limitInputPixels, no redirect), pads it to a square
with transparent edges, centred and unscaled, and keeps it in var/pictures/
under a hash of its source, at most 2,000, the index read back from the
folder at start. prepare(sources) makes what is missing or older than seven
days; a failed fetch is not tried again for half an hour; url(source) names
<publicUrl>/pictures/<key>.png?v=<version> once the web server listens at a
public address, the source itself otherwise. GET /pictures/<key>.png serves
only what it made, kept thirty days as the eggs. Wired in app.ts; closed
first at shutdown. moveIntoPlace is shared with ImageCache.

**Files:**

```
 src/app.ts                         |  19 +-
 src/services/image-cache.ts        |  36 ++--
 src/services/stop-pictures.test.ts | 586 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/stop-pictures.ts      | 416 ++++++++++++++++++++++++++++++++++++++++
 src/web/server.test.ts             |  31 +++
 src/web/server.ts                  |  18 ++
 test/support/responses.ts          |  14 +-
 test/support/web.ts                |   3 +
 8 files changed, 1109 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/stop-pictures.test.ts src/web/server.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2fb57443f4e4d0228dbe0f20098792b88a2186e0 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 2: StopPictures and its route`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 4ebd7b4f76372d2c58794d7123f8ceb31128b505..a262384137d578a78379888190edbdcd0dc929bc 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -153,6 +153,7 @@ import { LoginLinks } from './web/login-links.js';
 import { Sessions } from './web/sessions.js';
 import { startWebServer } from './web/start.js';
 import { EggPictures } from './services/egg-pictures.js';
+import { PICTURE_FOLDER, StopPictures } from './services/stop-pictures.js';
 
 /** Parsed game data is kept here between runs, so the bot can start while offline. */
 const GAME_DATA_CACHE = 'var/game-data-cache.json';
@@ -404,6 +405,15 @@ export async function startApp(
   const savedRoutes = new SavedRouteRepository(db);
   // Eggs' pictures from the web server only once it listens (`startWebServer`), files till then.
   const eggPictures = new EggPictures(config.settings);
+  // The square pictures of the reports at stops (plan 8R-6): kept in var/pictures/, named at the
+  // web server's address once it listens, the feeds' addresses till then.
+  const stopPictures = new StopPictures({
+    settings: config.settings,
+    folder: PICTURE_FOLDER,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
+  void stopPictures.start();
   const partyService = new PartyService({
     eggPictures,
     wayspots,
@@ -1221,12 +1231,16 @@ export async function startApp(
         access: scriptAccess,
         zone: config.settings.timezone,
       },
+      pictures: stopPictures,
       now: () => Date.now(),
       log,
     });
   if (web && webSettings) {
     void connected.then(async () => {
-      if (!webClosed && (await startWebServer(web, webSettings, log))) eggPictures.serving();
+      if (!webClosed && (await startWebServer(web, webSettings, log))) {
+        eggPictures.serving();
+        stopPictures.serving();
+      }
     });
   }
 
@@ -1340,6 +1354,9 @@ export async function startApp(
       { name: 'self-assigned roles', timeoutMs: 5_000, run: () => selfRoles.idle() },
       // The spawn reports that wait for their half hour are deleted now: they would stay for good.
       { name: 'spawn reports', timeoutMs: 5_000, run: () => spawns.flush() },
+      // No more pictures fetched: the fetches on their way are aborted, and what is drawn from
+      // now on names the pictures made or the feeds' addresses.
+      { name: 'pictures of the stops', timeoutMs: 1_000, run: () => stopPictures.close() },
       // The grunts' messages stand on (their reports do): the next start's sweep deletes them.
       {
         name: 'grunt reports',
diff --git a/src/services/image-cache.ts b/src/services/image-cache.ts
index bb22772019fd68386d920d4a18597135d5c80407..2b45242dbf23b2b819e59796c3d0c515dd2dd6d6 100644
--- a/src/services/image-cache.ts
+++ b/src/services/image-cache.ts
@@ -65,6 +65,28 @@ let temporaryCounter = 0;
 
 const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
 
+/**
+ * The rename that makes a written file the one in its place (the pictures of `ImageCache` and
+ * `StopPictures`). Tried again a few times, after a short pause, when it is refused the way
+ * Windows refuses it while another program holds the file.
+ */
+export async function moveIntoPlace(
+  temporary: string,
+  file: string,
+  move: (from: string, to: string) => Promise<void> = rename,
+  pauseMs = 50,
+): Promise<void> {
+  for (let attempt = 1; ; attempt += 1) {
+    try {
+      await move(temporary, file);
+      return;
+    } catch (err) {
+      if (attempt >= RENAME_ATTEMPTS || !HELD_BY_ANOTHER.has(errorCode(err) ?? '')) throw err;
+      await pause(pauseMs);
+    }
+  }
+}
+
 function errorCode(err: unknown): string | undefined {
   if (typeof err !== 'object' || err === null || !('code' in err)) return undefined;
   return typeof err.code === 'string' ? err.code : undefined;
@@ -199,18 +221,8 @@ export class ImageCache {
    * The rename that makes a download the picture. Tried again a few times, after a short pause,
    * when it is refused the way Windows refuses it while another program holds the file.
    */
-  private async moveIntoPlace(temporary: string, file: string): Promise<void> {
-    const move = this.options.rename ?? rename;
-    const pauseMs = this.options.renamePauseMs ?? 50;
-    for (let attempt = 1; ; attempt += 1) {
-      try {
-        await move(temporary, file);
-        return;
-      } catch (err) {
-        if (attempt >= RENAME_ATTEMPTS || !HELD_BY_ANOTHER.has(errorCode(err) ?? '')) throw err;
-        await pause(pauseMs);
-      }
-    }
+  private moveIntoPlace(temporary: string, file: string): Promise<void> {
+    return moveIntoPlace(temporary, file, this.options.rename, this.options.renamePauseMs);
   }
 
   private async download(request: ImageRequest, signal: AbortSignal): Promise<Buffer> {
diff --git a/src/services/stop-pictures.test.ts b/src/services/stop-pictures.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c8e0161e9c11a046ac41779b7e086b63b1ef95cb
--- /dev/null
+++ b/src/services/stop-pictures.test.ts
@@ -0,0 +1,586 @@
+import { getEventListeners } from 'node:events';
+import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import sharp from 'sharp';
+import { describe, expect, it, onTestFinished, vi } from 'vitest';
+import { bytesResponse } from '../../test/support/responses.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
+import { PINE_USER_AGENT } from './research-task-service.js';
+import {
+  FAILED_AGAIN_MS,
+  MAX_PICTURE_BYTES,
+  PREPARE_DEADLINE_MS,
+  RENEW_MS,
+  StopPictures,
+  type FetchPicture,
+} from './stop-pictures.js';
+
+const PUBLIC = 'https://map.example.test';
+const LARVITAR = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm246.icon.png';
+const GIBLE = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm443.icon.png';
+const CANDY = 'https://cdn.leekduck.com/assets/img/items/Rare%20Candy.png';
+const DAY = 24 * 60 * 60_000;
+
+/** A picture of this size, opaque red (or `colour`): what Leek Duck sends, not square. */
+function png(width: number, height: number, red = 255): Promise<Buffer> {
+  return sharp({
+    create: { width, height, channels: 4, background: { r: red, g: 0, b: 0, alpha: 1 } },
+  })
+    .png()
+    .toBuffer();
+}
+
+/** A download that answers a picture of this size. */
+async function pngAnswer(width: number, height: number, red = 255) {
+  return {
+    ...bytesResponse(await png(width, height, red), { headers: { 'content-type': 'image/png' } }),
+    ok: true,
+  };
+}
+
+/** A download answering `status`, as Leek Duck answers a picture it does not have. */
+function failing(status: number): ReturnType<FetchPicture> {
+  return Promise.resolve({ ...bytesResponse(new Uint8Array(0), { status }), ok: false });
+}
+
+/**
+ * A download held until `release()` (a picture of 40 by 60 by `red`), refused as `fetch` refuses
+ * it when its signal aborts; `asked` resolves when it was asked for.
+ */
+function held(red = 255) {
+  let release!: () => void;
+  let wasAsked!: () => void;
+  const released = new Promise<void>((resolve) => {
+    release = resolve;
+  });
+  const asked = new Promise<void>((resolve) => {
+    wasAsked = resolve;
+  });
+  const answer = (_url: string, signal: AbortSignal): ReturnType<FetchPicture> => {
+    wasAsked();
+    return new Promise((resolve, reject) => {
+      signal.addEventListener('abort', () => {
+        reject(new DOMException('This operation was aborted', 'AbortError'));
+      });
+      void released.then(() => resolve(pngAnswer(40, 60, red)));
+    });
+  };
+  return { answer, release, asked };
+}
+
+/** `setTimeout` faked for this test (the deadline of `prepare`). */
+function fakeTimers(): void {
+  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+  onTestFinished(() => {
+    vi.useRealTimers();
+  });
+}
+
+/** A folder of its own, removed when the test is over. */
+function folder(): string {
+  const dir = mkdtempSync(path.join(tmpdir(), 'pine-pictures-'));
+  onTestFinished(() => {
+    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
+  });
+  return dir;
+}
+
+interface Asked {
+  url: string;
+  headers: Record<string, string>;
+  redirect: string;
+}
+
+/**
+ * A `StopPictures` over a folder, at `clock.now`, its downloads answered by `answer` (a picture
+ * of 40 by 60 by default); `asked` the downloads it made.
+ */
+function picturesWith(
+  options: {
+    dir?: string;
+    publicUrl?: string | undefined;
+    answer?: (url: string, signal: AbortSignal) => ReturnType<FetchPicture>;
+    maxPictures?: number;
+  } = {},
+) {
+  const { log, entries } = createTestLogger();
+  const clock = { now: Date.UTC(2026, 9, 23, 12) };
+  const asked: Asked[] = [];
+  const dir = options.dir ?? folder();
+  const answer = options.answer ?? (() => pngAnswer(40, 60));
+  const publicUrl = 'publicUrl' in options ? options.publicUrl : PUBLIC;
+  const pictures = new StopPictures({
+    settings: {
+      web:
+        publicUrl === undefined
+          ? undefined
+          : { port: 8080, host: '127.0.0.1', publicUrl, trustProxy: false, tiles: 'osm' },
+    },
+    folder: dir,
+    fetch: (url, init) => {
+      asked.push({ url, headers: init.headers, redirect: init.redirect });
+      return answer(url, init.signal);
+    },
+    log,
+    now: () => clock.now,
+    ...(options.maxPictures === undefined ? {} : { maxPictures: options.maxPictures }),
+  });
+  return { pictures, clock, asked, dir, entries };
+}
+
+const served = /^https:\/\/map\.example\.test\/pictures\/([0-9a-f]{32})\.png\?v=([0-9a-f]{8})$/;
+
+/** The key and version of a served address; throws for any other. */
+function servedAs(url: string | undefined): { key: string; version: string } {
+  const match = served.exec(url ?? '');
+  if (!match?.[1] || !match[2]) throw new Error(`not a served picture: ${String(url)}`);
+  return { key: match[1], version: match[2] };
+}
+
+describe('StopPictures (plan 8R-6)', () => {
+  it('pads a feed’s picture to a square with transparent edges, unscaled, and names it once the web server listens', async () => {
+    const { pictures, asked } = picturesWith();
+    await pictures.start();
+    await pictures.prepare([LARVITAR]);
+    expect(asked).toEqual([
+      {
+        url: LARVITAR,
+        headers: { Accept: 'image/*', 'User-Agent': PINE_USER_AGENT },
+        redirect: 'error',
+      },
+    ]);
+    // Before the web server listens: the feed's own address.
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    pictures.serving();
+    const { key } = servedAs(pictures.url(LARVITAR));
+    // The key is a hash of the source, never the address itself.
+    expect(pictures.url(LARVITAR)).not.toContain('leekduck');
+    const bytes = await pictures.read(key);
+    if (!bytes) throw new Error('no picture');
+    const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
+    expect([info.width, info.height, info.channels]).toEqual([60, 60, 4]);
+    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
+    // Ten columns of transparency each side of the 40 wide picture, which is whole.
+    expect([alpha(0, 0), alpha(9, 30), alpha(50, 30), alpha(59, 59)]).toEqual([0, 0, 0, 0]);
+    expect([alpha(10, 0), alpha(49, 59), alpha(30, 30)]).toEqual([255, 255, 255]);
+  });
+
+  it('gives the feed’s address while a picture is not ready, and for one never asked for', async () => {
+    const { pictures } = picturesWith();
+    pictures.serving();
+    expect(pictures.url(GIBLE)).toBe(GIBLE);
+    expect(pictures.url(ENCOUNTER_PICTURE)).toBe(ENCOUNTER_PICTURE);
+    expect(await pictures.read('0'.repeat(32))).toBeUndefined();
+  });
+
+  it('fetches nothing and names the feed’s address without a public address', async () => {
+    for (const publicUrl of [undefined, 'http://localhost:8080']) {
+      const { pictures, asked } = picturesWith({ publicUrl });
+      pictures.serving();
+      await pictures.prepare([LARVITAR]);
+      expect(asked, String(publicUrl)).toEqual([]);
+      expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    }
+  });
+
+  it('fetches only from the hosts the feeds’ checks allow', async () => {
+    const { pictures, asked } = picturesWith();
+    pictures.serving();
+    const elsewhere = 'https://pictures.example.test/pm246.png';
+    await pictures.prepare([elsewhere, 'http://cdn.leekduck.com/x.png', ENCOUNTER_PICTURE]);
+    expect(asked.map((one) => one.url)).toEqual([ENCOUNTER_PICTURE]);
+    expect(pictures.url(elsewhere)).toBe(elsewhere);
+    servedAs(pictures.url(ENCOUNTER_PICTURE));
+  });
+
+  it('asks once for a picture asked for twice at once', async () => {
+    const { pictures, asked } = picturesWith();
+    await Promise.all([pictures.prepare([GIBLE, GIBLE]), pictures.prepare([GIBLE])]);
+    expect(asked).toHaveLength(1);
+  });
+
+  it('refuses a picture too large, one that is no picture, and one of too many pixels, and remembers the failure for a while', async () => {
+    const big = await png(10, 10);
+    const answers: Record<string, () => ReturnType<FetchPicture>> = {
+      [LARVITAR]: () =>
+        Promise.resolve({
+          ...bytesResponse(new Uint8Array(MAX_PICTURE_BYTES + 1), {
+            headers: { 'content-type': 'image/png' },
+          }),
+          ok: true,
+        }),
+      [GIBLE]: () =>
+        Promise.resolve({
+          ...bytesResponse(new TextEncoder().encode('<html>'), {
+            headers: { 'content-type': 'text/html' },
+          }),
+          ok: true,
+        }),
+      [CANDY]: async () => ({
+        ...bytesResponse(await png(5_000, 5_000), { headers: { 'content-type': 'image/png' } }),
+        ok: true,
+      }),
+      [ENCOUNTER_PICTURE]: () =>
+        Promise.resolve({ ...bytesResponse(big, { status: 503 }), ok: false }),
+    };
+    const { pictures, asked, clock, entries } = picturesWith({
+      answer: (url) => answers[url]!(),
+    });
+    pictures.serving();
+    const all = [LARVITAR, GIBLE, CANDY, ENCOUNTER_PICTURE];
+    await pictures.prepare(all);
+    expect(all.map((url) => pictures.url(url))).toEqual(all);
+    expect(asked).toHaveLength(4);
+    expect(entries.filter((entry) => entry.msg === 'could not make a picture square')).toHaveLength(
+      4,
+    );
+    // An outage of Leek Duck is not tried again on every redraw.
+    clock.now += FAILED_AGAIN_MS - 1;
+    await pictures.prepare(all);
+    expect(asked).toHaveLength(4);
+    clock.now += 1;
+    await pictures.prepare([LARVITAR]);
+    expect(asked).toHaveLength(5);
+  });
+
+  it('reads what it made back from its folder after a restart, without fetching it again', async () => {
+    const first = picturesWith();
+    await first.pictures.start();
+    await first.pictures.prepare([LARVITAR]);
+    first.pictures.serving();
+    const before = first.pictures.url(LARVITAR);
+    const again = picturesWith({ dir: first.dir });
+    await again.pictures.start();
+    again.pictures.serving();
+    expect(again.pictures.url(LARVITAR)).toBe(before);
+    await again.pictures.prepare([LARVITAR]);
+    expect(again.asked).toEqual([]);
+    expect(await again.pictures.read(servedAs(before).key)).toBeInstanceOf(Buffer);
+  });
+
+  it('leaves out what is no picture of its own in its folder', async () => {
+    const dir = folder();
+    writeFileSync(path.join(dir, 'notes.png'), 'not mine');
+    writeFileSync(path.join(dir, `${'a'.repeat(32)}.png.123.tmp`), 'left over');
+    const { pictures } = picturesWith({ dir });
+    await pictures.start();
+    expect(await pictures.read('notes')).toBeUndefined();
+    expect(readdirSync(dir)).toEqual(['notes.png']);
+  });
+
+  it('fetches a picture again after seven days, a new version where it changed, and keeps the old one where the fetch fails', async () => {
+    let red = 255;
+    let fails = false;
+    const { pictures, asked, clock, dir } = picturesWith({
+      answer: async () =>
+        fails
+          ? Promise.reject(new Error('Leek Duck is down'))
+          : {
+              ...bytesResponse(await png(40, 60, red), {
+                headers: { 'content-type': 'image/png' },
+              }),
+              ok: true,
+            },
+    });
+    pictures.serving();
+    await pictures.prepare([GIBLE]);
+    const first = servedAs(pictures.url(GIBLE));
+    clock.now += RENEW_MS - 1;
+    await pictures.prepare([GIBLE]);
+    expect(asked).toHaveLength(1);
+    clock.now += 1;
+    red = 128;
+    // Fetched again in the background: the old one is served meanwhile.
+    await pictures.prepare([GIBLE]);
+    await pictures.idle();
+    expect(asked).toHaveLength(2);
+    const renewed = servedAs(pictures.url(GIBLE));
+    expect(renewed.key).toBe(first.key);
+    expect(renewed.version).not.toBe(first.version);
+    clock.now += RENEW_MS;
+    fails = true;
+    await pictures.prepare([GIBLE]);
+    await pictures.idle();
+    expect(asked).toHaveLength(3);
+    expect(pictures.url(GIBLE)).toBe(`${PUBLIC}/pictures/${renewed.key}.png?v=${renewed.version}`);
+    // After a restart, the file's time says when it was made.
+    const file = path.join(dir, `${first.key}.png`);
+    const old = new Date(clock.now - 2 * RENEW_MS);
+    utimesSync(file, old, old);
+    const again = picturesWith({ dir });
+    again.clock.now = clock.now;
+    await again.pictures.start();
+    await again.pictures.prepare([GIBLE]);
+    await again.pictures.idle();
+    expect(again.asked).toHaveLength(1);
+  });
+
+  it('keeps at most so many pictures, the oldest deleted from its folder first', async () => {
+    const { pictures, dir, clock } = picturesWith({ maxPictures: 2 });
+    pictures.serving();
+    await pictures.prepare([LARVITAR]);
+    clock.now += DAY;
+    await pictures.prepare([GIBLE]);
+    clock.now += DAY;
+    await pictures.prepare([CANDY]);
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    servedAs(pictures.url(GIBLE));
+    servedAs(pictures.url(CANDY));
+    await pictures.idle();
+    expect(readdirSync(dir).filter((name) => name.endsWith('.png'))).toHaveLength(2);
+    // Read back with the same bound, a fuller folder keeps its newest.
+    const again = picturesWith({ dir, maxPictures: 1 });
+    await again.pictures.start();
+    again.pictures.serving();
+    expect(readdirSync(dir).filter((name) => name.endsWith('.png'))).toHaveLength(1);
+    servedAs(again.pictures.url(CANDY));
+  });
+
+  it('returns from prepare at its deadline while a fetch hangs, names the feed’s address meanwhile, and the picture once it lands', async () => {
+    const download = held();
+    const { pictures } = picturesWith({ answer: download.answer });
+    pictures.serving();
+    fakeTimers();
+    let done = false;
+    const preparing = pictures.prepare([LARVITAR]).then(() => {
+      done = true;
+    });
+    await download.asked;
+    await vi.advanceTimersByTimeAsync(PREPARE_DEADLINE_MS - 1);
+    expect(done).toBe(false);
+    await vi.advanceTimersByTimeAsync(1);
+    expect(done).toBe(true);
+    await preparing;
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    // It goes on in the background: the next redraw names the square picture.
+    download.release();
+    await pictures.idle();
+    servedAs(pictures.url(LARVITAR));
+  });
+
+  it('serves a picture older than seven days at once while it is fetched again', async () => {
+    const renewal = held(128);
+    let renewing = false;
+    const { pictures, clock } = picturesWith({
+      answer: (url, signal) => (renewing ? renewal.answer(url, signal) : pngAnswer(40, 60)),
+    });
+    pictures.serving();
+    await pictures.prepare([GIBLE]);
+    const first = servedAs(pictures.url(GIBLE));
+    clock.now += RENEW_MS;
+    renewing = true;
+    fakeTimers();
+    let done = false;
+    const preparing = pictures.prepare([GIBLE]).then(() => {
+      done = true;
+    });
+    await renewal.asked;
+    await vi.advanceTimersByTimeAsync(0);
+    expect(done).toBe(true);
+    await preparing;
+    expect(servedAs(pictures.url(GIBLE))).toEqual(first);
+    renewal.release();
+    await pictures.idle();
+    expect(servedAs(pictures.url(GIBLE)).version).not.toBe(first.version);
+  });
+
+  it('aborts a fetch on its way when closed, without remembering it as failed, and prepares nothing afterwards', async () => {
+    const download = held();
+    const { pictures, asked, entries } = picturesWith({ answer: download.answer });
+    pictures.serving();
+    const preparing = pictures.prepare([LARVITAR]);
+    await download.asked;
+    await pictures.close();
+    await preparing;
+    expect(entries.filter((entry) => entry.msg === 'could not make a picture square')).toEqual([]);
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    // After the close: at once, and nothing asked.
+    fakeTimers();
+    let done = false;
+    const after = pictures.prepare([GIBLE]).then(() => {
+      done = true;
+    });
+    await vi.advanceTimersByTimeAsync(0);
+    expect(done).toBe(true);
+    await after;
+    expect(asked.map((one) => one.url)).toEqual([LARVITAR]);
+  });
+
+  it('names no picture for a source that is gone (404 or 410), and the feed’s address for any other failure', async () => {
+    const answers: Record<string, () => ReturnType<FetchPicture>> = {
+      [LARVITAR]: () => failing(404),
+      [GIBLE]: () => failing(410),
+      [CANDY]: () => failing(500),
+      [ENCOUNTER_PICTURE]: () => Promise.reject(new Error('Leek Duck is down')),
+    };
+    const { pictures } = picturesWith({ answer: (url) => answers[url]!() });
+    const all = [LARVITAR, GIBLE, CANDY, ENCOUNTER_PICTURE];
+    await pictures.prepare(all);
+    // Before the web server listens the address is named as it is.
+    expect(all.map((url) => pictures.url(url))).toEqual(all);
+    pictures.serving();
+    expect(all.map((url) => pictures.url(url))).toEqual([
+      undefined,
+      undefined,
+      CANDY,
+      ENCOUNTER_PICTURE,
+    ]);
+  });
+
+  it('names no picture once a kept one is gone at its source, and names it again once it is back', async () => {
+    let status = 200;
+    const { pictures, clock } = picturesWith({
+      answer: () => (status === 200 ? pngAnswer(40, 60) : failing(status)),
+    });
+    pictures.serving();
+    await pictures.prepare([GIBLE]);
+    servedAs(pictures.url(GIBLE));
+    clock.now += RENEW_MS;
+    status = 404;
+    await pictures.prepare([GIBLE]);
+    await pictures.idle();
+    expect(pictures.url(GIBLE)).toBeUndefined();
+    clock.now += FAILED_AGAIN_MS;
+    status = 200;
+    await pictures.prepare([GIBLE]);
+    await pictures.idle();
+    servedAs(pictures.url(GIBLE));
+  });
+
+  it('refuses a picture larger than 1024 on a side, and one that is no png, jpeg, webp or gif', async () => {
+    const svg = new TextEncoder().encode(
+      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>',
+    );
+    const answers: Record<string, () => ReturnType<FetchPicture>> = {
+      [LARVITAR]: () => pngAnswer(1025, 10),
+      [GIBLE]: () =>
+        Promise.resolve({
+          ...bytesResponse(svg, { headers: { 'content-type': 'image/svg+xml' } }),
+          ok: true,
+        }),
+      [CANDY]: () => pngAnswer(1024, 10),
+    };
+    const { pictures, entries } = picturesWith({ answer: (url) => answers[url]!() });
+    pictures.serving();
+    await pictures.prepare([LARVITAR, GIBLE, CANDY]);
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    expect(pictures.url(GIBLE)).toBe(GIBLE);
+    servedAs(pictures.url(CANDY));
+    expect(
+      entries
+        .filter((entry) => entry.msg === 'could not make a picture square')
+        .map((entry) => String(entry.source))
+        .sort(),
+    ).toEqual([LARVITAR, GIBLE].sort());
+  });
+
+  it('with the index full, makes room for a picture that lands by one picture only, never one being fetched again', async () => {
+    const renewal = held(128);
+    let renewing = false;
+    const { pictures, clock, dir } = picturesWith({
+      maxPictures: 2,
+      answer: (url, signal) =>
+        url === LARVITAR && renewing ? renewal.answer(url, signal) : pngAnswer(40, 60),
+    });
+    pictures.serving();
+    await pictures.prepare([LARVITAR]);
+    clock.now += DAY;
+    await pictures.prepare([GIBLE]);
+    const larvitar = servedAs(pictures.url(LARVITAR));
+    // Larvitar is fetched again while Rare Candy lands: Gible makes room, not Larvitar.
+    clock.now += RENEW_MS - DAY;
+    renewing = true;
+    await pictures.prepare([LARVITAR]);
+    await renewal.asked;
+    await pictures.prepare([CANDY]);
+    expect(pictures.url(GIBLE)).toBe(GIBLE);
+    expect(servedAs(pictures.url(LARVITAR))).toEqual(larvitar);
+    servedAs(pictures.url(CANDY));
+    renewal.release();
+    await pictures.idle();
+    expect(servedAs(pictures.url(LARVITAR)).version).not.toBe(larvitar.version);
+    servedAs(pictures.url(CANDY));
+    const files = readdirSync(dir).filter((name) => name.endsWith('.png'));
+    expect(files.sort()).toEqual(
+      [servedAs(pictures.url(LARVITAR)).key, servedAs(pictures.url(CANDY)).key]
+        .map((key) => `${key}.png`)
+        .sort(),
+    );
+  });
+
+  it('with the index full, keeps exactly the two pictures that land together', async () => {
+    const candy = held();
+    const encounter = held();
+    const { pictures, clock, dir } = picturesWith({
+      maxPictures: 2,
+      answer: (url, signal) =>
+        url === CANDY
+          ? candy.answer(url, signal)
+          : url === ENCOUNTER_PICTURE
+            ? encounter.answer(url, signal)
+            : pngAnswer(40, 60),
+    });
+    pictures.serving();
+    await pictures.prepare([LARVITAR]);
+    clock.now += DAY;
+    await pictures.prepare([GIBLE]);
+    clock.now += DAY;
+    const preparing = pictures.prepare([CANDY, ENCOUNTER_PICTURE]);
+    await Promise.all([candy.asked, encounter.asked]);
+    candy.release();
+    encounter.release();
+    await preparing;
+    await pictures.idle();
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+    expect(pictures.url(GIBLE)).toBe(GIBLE);
+    const kept = [CANDY, ENCOUNTER_PICTURE].map((url) => `${servedAs(pictures.url(url)).key}.png`);
+    expect(readdirSync(dir).sort()).toEqual(kept.sort());
+  });
+
+  it('leaves nothing listening on its shutdown signal once prepare returned, however often it is called', async () => {
+    const { pictures, clock } = picturesWith();
+    pictures.serving();
+    // The shutdown signal is private: its listeners are what leaked (nodejs/node#17469).
+    const { signal } = (pictures as unknown as { stopping: AbortController }).stopping;
+    for (let call = 0; call < 50; call += 1) {
+      // Every tenth call renews the pictures; the others find them kept.
+      if (call % 10 === 0) clock.now += RENEW_MS;
+      await pictures.prepare([LARVITAR, GIBLE]);
+      await pictures.idle();
+    }
+    expect(getEventListeners(signal, 'abort')).toEqual([]);
+  });
+
+  it('returns from prepare at once when closed, though a fetch does not heed the abort', async () => {
+    let release!: () => void;
+    const released = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    let wasAsked!: () => void;
+    const asked = new Promise<void>((resolve) => {
+      wasAsked = resolve;
+    });
+    const { pictures } = picturesWith({
+      answer: () => {
+        wasAsked();
+        return released.then(() => pngAnswer(40, 60));
+      },
+    });
+    pictures.serving();
+    fakeTimers();
+    let done = false;
+    const preparing = pictures.prepare([LARVITAR]).then(() => {
+      done = true;
+    });
+    await asked;
+    const closing = pictures.close();
+    await vi.advanceTimersByTimeAsync(0);
+    expect(done).toBe(true);
+    await preparing;
+    release();
+    await closing;
+    expect(pictures.url(LARVITAR)).toBe(LARVITAR);
+  });
+});
diff --git a/src/services/stop-pictures.ts b/src/services/stop-pictures.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1b9f74144453e16d1fc5242d6a2e84bfca7c1b09
--- /dev/null
+++ b/src/services/stop-pictures.ts
@@ -0,0 +1,416 @@
+import { createHash } from 'node:crypto';
+import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+import sharp from 'sharp';
+import { BoundedMap } from '../bounded-map.js';
+import { isLocalAddress, type Settings } from '../config/settings.js';
+import { isPictureSource } from '../domain/stops/pictures.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import { moveIntoPlace } from './image-cache.js';
+import { readLimitedBytes, type LimitedResponse } from './limited-json.js';
+import { PINE_USER_AGENT } from './research-task-service.js';
+
+/** Where the square pictures are kept (git-ignored; the stack's writable volume is `/app/var`). */
+export const PICTURE_FOLDER = 'var/pictures';
+
+/** The path under which the web server serves them (`GET /pictures/<key>.png`). */
+export const PICTURE_PATH = '/pictures/';
+
+/** The largest picture fetched: Leek Duck's icons are some 10 to 40 KB. */
+export const MAX_PICTURE_BYTES = 512 * 1024;
+
+/** The most pixels a picture fetched may have (sharp's `limitInputPixels`): 1024 by 1024. */
+export const MAX_PICTURE_PIXELS = 1024 * 1024;
+
+/** The longest side a picture fetched may have: no long strip passes the pixel limit. */
+export const MAX_PICTURE_SIDE = 1024;
+
+/** The formats a picture fetched may have (sharp's names): no SVG, nothing else. */
+const PICTURE_FORMATS: ReadonlySet<string> = new Set(['png', 'jpeg', 'webp', 'gif']);
+
+/** How many pictures are kept, on disk and in the index: the oldest made goes first. */
+export const MAX_PICTURES = 2_000;
+
+/** A picture is fetched again after this long, so one Leek Duck changes at its address is renewed. */
+export const RENEW_MS = 7 * 24 * 60 * 60_000;
+
+/** How long a failed fetch is remembered: an outage is not tried again on every redraw. */
+export const FAILED_AGAIN_MS = 30 * 60_000;
+
+/**
+ * How long `prepare` waits for the pictures it lacks: a post, a DM or a grunt's message is held
+ * up no longer by a slow Leek Duck. What lands later is named at the next redraw.
+ */
+export const PREPARE_DEADLINE_MS = 2_500;
+
+/** How long one fetch may take. */
+const TIMEOUT_MS = 10_000;
+
+/** How many fetches run at once, whoever asked for them. */
+const AT_ONCE = 4;
+
+/** How many failed fetches are remembered. */
+const FAILURES_KEPT = 1_000;
+
+/** A picture's file: its key (`keyOf`) and `.png`. */
+const FILE = /^([0-9a-f]{32})\.png$/;
+
+/** A picture's key: the start of the SHA-256 of its source address, never the address itself. */
+function keyOf(source: string): string {
+  return createHash('sha256').update(source).digest('hex').slice(0, 32);
+}
+
+/** A picture's version, the start of the SHA-256 of what is served (`?v=`). */
+function versionOf(bytes: Uint8Array): string {
+  return createHash('sha256').update(bytes).digest('hex').slice(0, 8);
+}
+
+/** A download of a picture: never followed to another address. */
+export type FetchPicture = (
+  url: string,
+  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'error' },
+) => Promise<LimitedResponse & { ok: boolean }>;
+
+export interface StopPicturesOptions {
+  /** `settings.web`: the public address the pictures are named at. */
+  settings: Pick<Settings, 'web'>;
+  /** The folder they are kept in (`PICTURE_FOLDER`; a test gives a folder of its own). */
+  folder: string;
+  fetch: FetchPicture;
+  log: Logger;
+  now?: () => number;
+  /** How many pictures are kept (`MAX_PICTURES`). */
+  maxPictures?: number;
+}
+
+/**
+ * What the post, the DMs and the grunts' messages need of `StopPictures`: the pictures made
+ * before they are drawn, then their addresses.
+ */
+export type PictureMaker = Pick<StopPictures, 'prepare' | 'url'>;
+
+/** A picture kept: its version and when it was made (its file's time). */
+interface Kept {
+  version: string;
+  madeAt: number;
+}
+
+/** A failed fetch: when, and whether its source is gone (it answered 404 or 410). */
+interface Failure {
+  at: number;
+  gone: boolean;
+}
+
+/** A source that answered 404 or 410: it has no picture (rule 6). */
+class PictureGone extends Error {}
+
+/**
+ * The square pictures of the reports at stops (plan 8R-6; design
+ * `2026-10-23-stop-pictures-design.md`, "How the pictures are served"): Leek Duck's icons are not
+ * square, and Discord shows a thumbnail as a square and crops the rest. `prepare(sources)` fetches
+ * what is missing or older than `RENEW_MS` (from the hosts the feeds' checks allow alone,
+ * `isPictureSource`; a byte limit, sharp's `limitInputPixels`, `MAX_PICTURE_SIDE` and the formats
+ * of `PICTURE_FORMATS`), pads it to a square with transparent edges, centred and unscaled, as
+ * `scripts/eggs/make-eggs.ts` made the eggs, and keeps it in its folder under a hash of the
+ * source. It waits only for the missing ones, and for `PREPARE_DEADLINE_MS` at most: an old one is
+ * served while it is fetched again, and fetches still running go on in the background (`idle`;
+ * `close` aborts them). `url(source)` gives renderers the address the bot's web server serves it
+ * at (`<publicUrl>/pictures/<key>.png?v=<version>`), the source itself while it is not ready or
+ * its fetch failed, none once the source answered 404 or 410 (the picture is gone), and the
+ * source as it is before the web server listens (`serving`) and without a public address, where
+ * nothing is fetched. No attachments. A failed fetch is not tried again for `FAILED_AGAIN_MS`;
+ * the old picture is kept where a renewal fails for another reason. At most `maxPictures` are
+ * kept, never making room by one that is being fetched again; `start` reads the index back from
+ * the folder, so a restart fetches nothing again.
+ */
+export class StopPictures {
+  private readonly now: () => number;
+  private readonly max: number;
+  private readonly kept: BoundedMap<string, Kept>;
+  private readonly failed = new BoundedMap<string, Failure>(FAILURES_KEPT);
+  private readonly fetching = new Map<string, Promise<void>>();
+  /** Files of pictures that made room, being deleted. */
+  private readonly removing = new Set<Promise<void>>();
+  private readonly stopping = new AbortController();
+  /** Fetches running, and those waiting for one of the `AT_ONCE` places. */
+  private running = 0;
+  private readonly queued: (() => void)[] = [];
+  private loading: Promise<void> | undefined;
+  private served = false;
+
+  constructor(private readonly options: StopPicturesOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.max = options.maxPictures ?? MAX_PICTURES;
+    this.kept = new BoundedMap(this.max);
+  }
+
+  /** The web server listens: from now on the pictures are named at its address. */
+  serving(): void {
+    this.served = true;
+  }
+
+  /**
+   * Reads the pictures kept in the folder (the index of the route and of `url`), oldest first,
+   * and deletes what passes the bound and what an earlier process left half written. Never
+   * rejects: a folder that cannot be read is logged, and pictures are made anew.
+   */
+  start(): Promise<void> {
+    this.loading ??= this.load().catch((err: unknown) => {
+      this.options.log.warn({ err }, 'could not read the pictures of the stops');
+    });
+    return this.loading;
+  }
+
+  private async load(): Promise<void> {
+    const { folder } = this.options;
+    const found: { key: string; madeAt: number; version: string }[] = [];
+    for (const name of await this.list()) {
+      if (name.endsWith('.tmp')) {
+        await rm(path.join(folder, name), { force: true }).catch(() => undefined);
+        continue;
+      }
+      const key = FILE.exec(name)?.[1];
+      if (key === undefined || this.kept.has(key)) continue;
+      try {
+        const file = path.join(folder, name);
+        const [{ mtimeMs }, bytes] = await Promise.all([stat(file), readFile(file)]);
+        found.push({ key, madeAt: mtimeMs, version: versionOf(bytes) });
+      } catch {
+        // Gone meanwhile: made again when asked for.
+      }
+    }
+    found.sort((a, b) => a.madeAt - b.madeAt);
+    for (const extra of found.splice(0, Math.max(0, found.length - this.max))) {
+      await rm(this.fileOf(extra.key), { force: true }).catch(() => undefined);
+    }
+    for (const { key, madeAt, version } of found) {
+      if (!this.kept.has(key)) this.kept.set(key, { madeAt, version });
+    }
+  }
+
+  private async list(): Promise<string[]> {
+    try {
+      return await readdir(this.options.folder);
+    } catch {
+      return [];
+    }
+  }
+
+  /** Whether pictures are named at the bot's own address: only at a public one. */
+  private publicUrl(): string | undefined {
+    const { web } = this.options.settings;
+    return web === undefined || isLocalAddress(web.publicUrl) ? undefined : web.publicUrl;
+  }
+
+  /**
+   * The address a message names for a source (`PictureLookup`): the square picture where it is
+   * made and the web server listens at a public address, none where the source is gone (404 or
+   * 410), else the source itself.
+   */
+  url(source: string): string | undefined {
+    const base = this.publicUrl();
+    if (!this.served || base === undefined) return source;
+    const key = keyOf(source);
+    if (this.failed.get(key)?.gone === true) return undefined;
+    const kept = this.kept.get(key);
+    return kept === undefined ? source : `${base}${PICTURE_PATH}${key}.png?v=${kept.version}`;
+  }
+
+  /** A picture this service made, for the route; undefined for any other key. */
+  async read(key: string): Promise<Buffer | undefined> {
+    if (!this.kept.has(key)) return undefined;
+    try {
+      return await readFile(this.fileOf(key));
+    } catch {
+      return undefined;
+    }
+  }
+
+  /**
+   * Fetches and pads what of `sources` is missing or older than `RENEW_MS`, `AT_ONCE` at a time;
+   * a source of another host, one that failed within `FAILED_AGAIN_MS`, and every source without
+   * a public address are passed over. Waits for the missing ones only, `PREPARE_DEADLINE_MS` at
+   * most, and not at all once closed; the rest go on in the background. Never rejects.
+   */
+  async prepare(sources: Iterable<string>): Promise<void> {
+    if (this.publicUrl() === undefined || this.stopping.signal.aborted) return;
+    // The deadline ends at its time or at `close`. Its listener is removed when `prepare` returns:
+    // a race against a promise that lives as long as the service would keep a reaction per call.
+    const { signal } = this.stopping;
+    let timer: ReturnType<typeof setTimeout> | undefined;
+    let stop: (() => void) | undefined;
+    const deadline = new Promise<void>((resolve) => {
+      timer = setTimeout(resolve, PREPARE_DEADLINE_MS);
+      stop = () => resolve();
+      signal.addEventListener('abort', stop, { once: true });
+    });
+    try {
+      await Promise.race([this.begin(sources), deadline]);
+    } finally {
+      clearTimeout(timer);
+      if (stop) signal.removeEventListener('abort', stop);
+    }
+  }
+
+  /** Begins the fetches `prepare` asks for; resolves when the missing pictures have landed. */
+  private async begin(sources: Iterable<string>): Promise<void> {
+    if (this.loading) await this.loading;
+    if (this.stopping.signal.aborted) return;
+    const now = this.now();
+    const missing: Promise<void>[] = [];
+    for (const source of new Set(sources)) {
+      if (!isPictureSource(source)) continue;
+      const key = keyOf(source);
+      const kept = this.kept.get(key);
+      if (kept !== undefined && now - kept.madeAt < RENEW_MS) continue;
+      const failure = this.failed.get(key);
+      if (failure !== undefined && now - failure.at < FAILED_AGAIN_MS) continue;
+      const fetched = this.fetchOnce(source, key);
+      if (kept === undefined) missing.push(fetched);
+    }
+    await Promise.all(missing);
+  }
+
+  /** Resolves once no fetch runs and no file is being deleted (tests, `close`). */
+  async idle(): Promise<void> {
+    while (this.fetching.size > 0 || this.removing.size > 0) {
+      await Promise.all([...this.fetching.values(), ...this.removing]);
+    }
+  }
+
+  /** Aborts the fetches on their way and makes no more (shutdown); resolves once they ended. */
+  close(): Promise<void> {
+    this.stopping.abort();
+    return this.idle();
+  }
+
+  /** One fetch of a source at a time, whoever asks. */
+  private fetchOnce(source: string, key: string): Promise<void> {
+    let pending = this.fetching.get(key);
+    if (!pending) {
+      pending = this.make(source, key).finally(() => this.fetching.delete(key));
+      this.fetching.set(key, pending);
+    }
+    return pending;
+  }
+
+  /** One of the `AT_ONCE` places of a fetch; `release` hands it to the next waiting. */
+  private async place(): Promise<void> {
+    if (this.running < AT_ONCE) {
+      this.running += 1;
+      return;
+    }
+    await new Promise<void>((resolve) => this.queued.push(resolve));
+  }
+
+  private release(): void {
+    const next = this.queued.shift();
+    if (next) next();
+    else this.running -= 1;
+  }
+
+  private async make(source: string, key: string): Promise<void> {
+    const { log } = this.options;
+    await this.place();
+    try {
+      if (this.stopping.signal.aborted) return;
+      const square = await this.squareOf(source);
+      if (this.stopping.signal.aborted) return;
+      const madeAt = this.now();
+      await this.save(key, square, madeAt);
+      this.failed.delete(key);
+      this.keep(key, { version: versionOf(square), madeAt });
+    } catch (err) {
+      if (this.stopping.signal.aborted) return;
+      this.failed.set(key, { at: this.now(), gone: err instanceof PictureGone });
+      log.warn({ source, reason: failureReason(err) }, 'could not make a picture square');
+    } finally {
+      this.release();
+    }
+  }
+
+  /**
+   * Puts a picture in the index, at once: with the index full the oldest that is not being
+   * fetched again makes room (the oldest of all where every one is), its file deleted after.
+   */
+  private keep(key: string, kept: Kept): void {
+    this.kept.delete(key);
+    const keys = this.kept.keys();
+    const room = this.kept.size + 1 - this.max;
+    const victims =
+      room > 0
+        ? [
+            ...keys.filter((one) => !this.fetching.has(one)),
+            ...keys.filter((one) => this.fetching.has(one)),
+          ].slice(0, room)
+        : [];
+    for (const victim of victims) this.kept.delete(victim);
+    this.kept.set(key, kept);
+    for (const victim of victims) {
+      const removed = rm(this.fileOf(victim), { force: true })
+        .catch(() => undefined)
+        .finally(() => this.removing.delete(removed));
+      this.removing.add(removed);
+    }
+  }
+
+  /** The source fetched and padded to a square with transparent edges, centred and unscaled. */
+  private async squareOf(source: string): Promise<Buffer> {
+    const response = await this.options.fetch(source, {
+      signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), this.stopping.signal]),
+      headers: { Accept: 'image/*', 'User-Agent': PINE_USER_AGENT },
+      redirect: 'error',
+    });
+    if (response.status === 404 || response.status === 410) {
+      throw new PictureGone(`the server answered ${String(response.status)}`);
+    }
+    if (!response.ok) throw new Error(`the server answered ${String(response.status)}`);
+    const type = response.headers.get('content-type') ?? '';
+    if (!type.toLowerCase().startsWith('image/')) {
+      throw new Error(`the server sent ${type === '' ? 'no content type' : type}, not a picture`);
+    }
+    const read = await readLimitedBytes(response, MAX_PICTURE_BYTES);
+    if (!read.ok) throw new Error(`the picture is ${read.reason}`);
+    const options = { limitInputPixels: MAX_PICTURE_PIXELS };
+    const { width, height, format } = await sharp(read.bytes, options).metadata();
+    if (!PICTURE_FORMATS.has(format)) throw new Error(`the picture is ${format}`);
+    const side = Math.max(width, height);
+    if (side > MAX_PICTURE_SIDE) {
+      throw new Error(`the picture is ${String(width)} by ${String(height)}`);
+    }
+    const left = Math.floor((side - width) / 2);
+    const top = Math.floor((side - height) / 2);
+    return sharp(read.bytes, options)
+      .ensureAlpha()
+      .extend({
+        left,
+        right: side - width - left,
+        top,
+        bottom: side - height - top,
+        background: { r: 0, g: 0, b: 0, alpha: 0 },
+      })
+      .png({ compressionLevel: 9 })
+      .toBuffer();
+  }
+
+  /** Writes a picture in its place, its file's time when it was made (read back at `start`). */
+  private async save(key: string, bytes: Buffer, madeAt: number): Promise<void> {
+    const file = this.fileOf(key);
+    const temporary = `${file}.${String(process.pid)}.${String(madeAt)}.tmp`;
+    try {
+      await mkdir(this.options.folder, { recursive: true });
+      await writeFile(temporary, bytes);
+      const at = new Date(madeAt);
+      await utimes(temporary, at, at);
+      await moveIntoPlace(temporary, file);
+    } catch (err) {
+      await rm(temporary, { force: true }).catch(() => undefined);
+      throw err;
+    }
+  }
+
+  private fileOf(key: string): string {
+    return path.join(this.options.folder, `${key}.png`);
+  }
+}
diff --git a/src/web/server.test.ts b/src/web/server.test.ts
index 6cc88cf27b5f0370fa78aefa2772b152c208170f..946bface59cd4c27d784a26ded1ac3225e7a1548 100644
--- a/src/web/server.test.ts
+++ b/src/web/server.test.ts
@@ -101,6 +101,37 @@ describe('the web server', () => {
     expect(head.statusCode).toBe(200);
   });
 
+  it('serves the square pictures of the stops it made to anybody, kept long, and nothing else under /pictures/ (plan 8R-6)', async () => {
+    const key = 'ab'.repeat(16);
+    const picture = Buffer.from('a square picture');
+    const asked: string[] = [];
+    web = webServerWith({
+      pictures: {
+        read: (wanted) => {
+          asked.push(wanted);
+          return Promise.resolve(wanted === key ? picture : undefined);
+        },
+      },
+    });
+    const answer = await web.app.inject({ url: `/pictures/${key}.png?v=0123abcd` });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toBe('image/png');
+    expect(answer.headers['cache-control']).toBe('public, max-age=2592000');
+    expect(answer.rawPayload.equals(picture)).toBe(true);
+    for (const url of [
+      `/pictures/${'cd'.repeat(16)}.png`,
+      `/pictures/${key}`,
+      `/pictures/${key.toUpperCase()}.png`,
+      '/pictures/',
+      `/pictures/..%2F${key}.png`,
+      '/pictures/../package.json',
+    ]) {
+      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
+    }
+    // Only a key of the right shape is looked up.
+    expect(asked).toEqual([key, 'cd'.repeat(16)]);
+  });
+
   it('says nothing about itself at its root', async () => {
     web = webServerWith();
     const answer = await web.app.inject({ url: '/' });
diff --git a/src/web/server.ts b/src/web/server.ts
index fce12afd1363b3c1e5cc11c924b334039ec63962..c1f72a7742c6c2ed74a86d57780a1e0df288e3d9 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -8,6 +8,7 @@ import type { MemberDirectory } from '../discord/member-directory.js';
 import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
 import type { Logger } from '../log.js';
 import { EGG_FOLDER, EGG_PATH } from '../services/egg-pictures.js';
+import { PICTURE_PATH } from '../services/stop-pictures.js';
 import { sendFailure, shortPage } from './answers.js';
 import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
@@ -69,6 +70,8 @@ export interface WebDeps {
   stops: StopWebDeps;
   /** The Wayspot export tool and who may have it (plan 8W-P): `/userscript`. */
   tool: ToolWebDeps;
+  /** The square pictures of the reports at stops (plan 8R-6, `StopPictures`): `/pictures/`. */
+  pictures: { read(key: string): Promise<Buffer | undefined> };
   now: () => number;
   log: Logger;
 }
@@ -150,6 +153,7 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
     },
   });
   eggRoutes(app);
+  pictureRoutes(app, deps.pictures);
   toolFileRoutes(app, deps);
   toolPageRoutes(app, deps);
   void app.register((instance, _options, done) => {
@@ -188,3 +192,17 @@ function eggRoutes(app: FastifyInstance): void {
     return reply.type('image/png').header('cache-control', EGG_CACHE).send(picture);
   });
 }
+
+/**
+ * The square pictures of the reports at stops (plan 8R-6): public, `GET /pictures/<key>.png` for
+ * the pictures `StopPictures` made and nothing else, kept as long as the eggs (their address
+ * carries `?v=` of what they show).
+ */
+function pictureRoutes(app: FastifyInstance, pictures: WebDeps['pictures']): void {
+  app.get<{ Params: { file: string } }>(`${PICTURE_PATH}:file`, async (request, reply) => {
+    const key = /^([0-9a-f]{32})\.png$/.exec(request.params.file)?.[1];
+    const picture = key === undefined ? undefined : await pictures.read(key);
+    if (picture === undefined) return sendFailure(request, reply, 404);
+    return reply.type('image/png').header('cache-control', EGG_CACHE).send(picture);
+  });
+}
diff --git a/test/support/responses.ts b/test/support/responses.ts
index cb5b05f77129048c2c07a7ab84bdf724622a709e..38a7d1e02054103f8f874357dfd893b3c4c43140 100644
--- a/test/support/responses.ts
+++ b/test/support/responses.ts
@@ -15,7 +15,19 @@ export function jsonResponse(
     headers?: Record<string, string>;
   } = {},
 ): LimitedResponse & { cancelled: () => boolean; readBytes: () => number } {
-  const bytes = new TextEncoder().encode(options.raw ?? JSON.stringify(body));
+  return bytesResponse(new TextEncoder().encode(options.raw ?? JSON.stringify(body)), options);
+}
+
+/** `jsonResponse` of bytes as they are: a picture (plan 8R-6). */
+export function bytesResponse(
+  bytes: Uint8Array,
+  options: {
+    status?: number;
+    contentLength?: number;
+    pieceBytes?: number;
+    headers?: Record<string, string>;
+  } = {},
+): LimitedResponse & { cancelled: () => boolean; readBytes: () => number } {
   const pieceBytes = options.pieceBytes ?? 64 * 1024;
   let at = 0;
   let cancelled = false;
diff --git a/test/support/web.ts b/test/support/web.ts
index 45a7b851d8ac6dad0798e3e4bf7586f2fd49b1df..acf831ef97e757dda2354b77d87f9ea1d67a6892 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -527,6 +527,8 @@ export interface WebTestOptions {
   stops?: StopWebDeps;
   /** The Wayspot export tool and who may have it (`toolWebWith`); no tool file by default. */
   tool?: ToolWebDeps;
+  /** The square pictures of the stops (plan 8R-6); none by default. */
+  pictures?: WebDeps['pictures'];
 }
 
 /**
@@ -700,6 +702,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     maxes: options.maxes ?? NO_MAXES,
     stops: options.stops ?? NO_STOPS,
     tool: options.tool ?? NO_TOOL,
+    pictures: options.pictures ?? { read: () => Promise.resolve(undefined) },
     now: () => clock.now,
     log,
   });
````

### Task 3: 8R-6 task 3: Pictures in the post Today's Stops

Prototype commit: `84ecc3f9d7e9f98b6b7389046106b95f4b057ae9`

Every reward line of the post "Today at the stops" carries its picture by the
rule: each version of a task a section with its thumbnail, the task's text a
line above; "one of" the encounter picture; a leader or Giovanni the
portrait, a decoy its catch while its lineup has one. At most six lines of a
task are pictured (Pokemon first, then items); lines without a picture share
one text display; a version with no stop shown has no section. A busy day is
decided for the whole post: laid out with every picture, and where that
needs more than one message, without the item and Mega Energy pictures, then
spilled as before. StopPostService has the pictures made (prepare) before it
draws and names them as StopPictures.url gives them.

Under an event's window (Matt, 2026-10-23) the day's research stays in the
post, below the window's tasks, under "### Back at <time>, after <event>",
without pictures; the line "The day's research comes back at" goes.

**Files:**

```
 src/app.ts                      |   1 +
 src/render/stop-post.test.ts    | 380 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/render/stop-post.ts         | 346 ++++++++++++++++++++++++++++++++++++++++--------------
 src/services/stop-posts.test.ts |  51 ++++++--
 src/services/stop-posts.ts      |  34 +++++-
 5 files changed, 701 insertions(+), 111 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/stop-post.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 84ecc3f9d7e9f98b6b7389046106b95f4b057ae9 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 3: Pictures in the post Today's Stops`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index a262384137d578a78379888190edbdcd0dc929bc..85cb929b5b59d310ac32cd4b7988cccd8a4612bf 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1076,6 +1076,7 @@ export async function startApp(
           const region = regions.byChannel(channelId);
           if (region) partyService.summaryChanged(region.id);
         },
+        pictures: stopPictures,
       });
   researchPostLinks.posts = stopPosts;
   if (stopPosts) partyService.setStopPosts(stopPosts);
diff --git a/src/render/stop-post.test.ts b/src/render/stop-post.test.ts
index 86427465762d80653fb9091cf45998021ba60545..807e9289adf9c1135f246ce68162bc7d0b557ecd 100644
--- a/src/render/stop-post.test.ts
+++ b/src/render/stop-post.test.ts
@@ -1,10 +1,27 @@
-import { describe, expect, it } from 'vitest';
+import { mkdtempSync, rmSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { ComponentType } from 'discord.js';
+import { describe, expect, it, onTestFinished } from 'vitest';
 import { textOf } from '../../test/support/messages.js';
 import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { pageTask, pikachuTask } from '../../test/support/research.js';
+import { bytesResponse } from '../../test/support/responses.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
 import { feedChoice } from '../../test/support/rocket.js';
-import { stopPostMessages, stopPostText, type PostHideout, type PostTask } from './stop-post.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import type { TaskReward } from '../domain/research/task.js';
+import { GIOVANNI_PORTRAIT, LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
+import { StopPictures } from '../services/stop-pictures.js';
+import {
+  postPictures,
+  stopPostMessages,
+  stopPostText,
+  type PostHideout,
+  type PostTask,
+} from './stop-post.js';
 
 const DRAGON = pageTask('Catch a Dragon-type Pokémon');
 
@@ -56,12 +73,11 @@ describe('the post "Today at the stops"', () => {
     const [empty] = stopPostMessages({ day: 'Saturday, November 21', tasks: [] }).messages;
     expect(textOf(empty)).toContain('Nothing reported right now.');
     const [one] = stopPostMessages({ day: 'Saturday, November 21', tasks: [atStops(1)] }).messages;
-    expect(JSON.stringify(one)).toContain(
-      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm147.icon.png',
-    );
+    // Its reward is one of seven: the encounter picture (plan 8R-6).
+    expect(JSON.stringify(one)).toContain(ENCOUNTER_PICTURE);
   });
 
-  it('shows a task’s versions in one block, a line before each one’s stops, one picture (plan 8R-5)', () => {
+  it('shows a task’s versions in one block, a line before each one’s stops (plan 8R-5)', () => {
     const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;
     const by = (n: number) => ({
       stop: reportedStop(n, { name: `Stop ${String(n)}`, address: null }),
@@ -87,7 +103,6 @@ describe('the post "Today at the stops"', () => {
         '- **Stop 3** · **Member 3**',
       ].join('\n'),
     );
-    expect(JSON.stringify(layout.messages[0]).match(/pokemon_icons_crop/g)).toHaveLength(1);
     expect([...layout.placement]).toEqual([
       ['task', 0],
       ['task:0000000a', 0],
@@ -311,3 +326,354 @@ describe('the post "Today at the stops"', () => {
     }
   });
 });
+
+/** A part of a post's message: a text display, or a section's text with its picture. */
+interface Piece {
+  text: string;
+  picture?: string;
+}
+
+/** The parts of a post's message in order, separators left out. */
+function piecesOf(message: V2Message | undefined): Piece[] {
+  const [box] = message?.components ?? [];
+  const parts = (box as { components?: unknown[] } | undefined)?.components ?? [];
+  return parts.flatMap((part): Piece[] => {
+    const one = part as {
+      type: ComponentType;
+      content?: string;
+      components?: { content: string }[];
+      accessory?: { media: { url: string } };
+    };
+    if (one.type === ComponentType.TextDisplay) return [{ text: one.content ?? '' }];
+    if (one.type === ComponentType.Section) {
+      return [
+        {
+          text: one.components?.[0]?.content ?? '',
+          ...(one.accessory ? { picture: one.accessory.media.url } : {}),
+        },
+      ];
+    }
+    return [];
+  });
+}
+
+/** Every picture of a post's messages, in order. */
+function picturesIn(messages: readonly V2Message[]): string[] {
+  return messages.flatMap((message) =>
+    piecesOf(message).flatMap((piece) => (piece.picture === undefined ? [] : [piece.picture])),
+  );
+}
+
+describe('the pictures of the post (plan 8R-6)', () => {
+  const DAY = 'Saturday, November 21';
+  const [LILEEP, ANORITH] = pageTask('Make 3 Great Throws in a row').rewards;
+  const item = (name: string): TaskReward => ({
+    kind: 'item',
+    item: name.toLowerCase().replace(/ /g, '-'),
+    name,
+    quantity: 1,
+    image: `https://cdn.leekduck.com/assets/img/items/${name.replace(/ /g, '%20')}.png`,
+  });
+  const by = (n: number, name = `Stop ${String(n)}`) => ({
+    stop: reportedStop(n, { name, address: null }),
+    reporter: { id: `20000000000000${String(1000 + n)}`, name: `Member ${String(n)}` },
+  });
+  /** A task of these versions, each at one stop of its own (or `stops` each). */
+  const taskOf = (
+    key: string,
+    versions: readonly (readonly TaskReward[])[],
+    stops = 1,
+  ): PostTask => ({
+    key,
+    research: { text: `Task ${key}`, category: null, rewards: [], typed: false },
+    versions: versions.map((rewards, v) => ({
+      key: `${key}:${String(v)}`,
+      rewards,
+      stops: Array.from({ length: stops }, (_, i) => by(100 * v + i + 1)),
+    })),
+  });
+
+  it('gives every reward line its picture and "one of" the encounter picture, the task’s text a line above', () => {
+    const task = taskOf('throws', [[LILEEP!], [item('Rare Candy')], [LILEEP!, ANORITH!], []]);
+    const [message] = stopPostMessages({ day: DAY, tasks: [task] }).messages;
+    const pieces = piecesOf(message).slice(1);
+    expect(pieces).toEqual([
+      { text: '**Task throws**' },
+      { text: 'Lileep\n- **Stop 1** · **Member 1**', picture: LILEEP!.image },
+      { text: 'Rare Candy ×1\n- **Stop 101** · **Member 101**', picture: item('Rare Candy').image },
+      {
+        text: 'one of Lileep, Anorith\n- **Stop 201** · **Member 201**',
+        picture: ENCOUNTER_PICTURE,
+      },
+      // A line without a picture: text alone.
+      { text: 'reward not said\n- **Stop 301** · **Member 301**' },
+    ]);
+  });
+
+  it('keeps one block for a task of one version, "one of" with the encounter picture', () => {
+    const [message] = stopPostMessages({
+      day: DAY,
+      tasks: [taskOf('one', [[LILEEP!, ANORITH!]], 2)],
+    }).messages;
+    expect(piecesOf(message).slice(1)).toEqual([
+      {
+        text: '**Task one** · one of Lileep, Anorith\n- **Stop 1** · **Member 1**\n- **Stop 2** · **Member 2**',
+        picture: ENCOUNTER_PICTURE,
+      },
+    ]);
+  });
+
+  it('pictures at most six lines of a task, Pokémon first, and puts lines without one in one text', () => {
+    const items = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Razz Berry'].map((name) => [
+      item(name),
+    ]);
+    const pokemon = Array.from({ length: 5 }, () => [LILEEP!]);
+    const task = taskOf('many', [...items, ...pokemon]);
+    const [message] = stopPostMessages({ day: DAY, tasks: [task] }).messages;
+    expect(picturesIn([message!])).toEqual([
+      item('Poke Ball').image,
+      ...pokemon.map(() => LILEEP!.image),
+    ]);
+    // The task's text and the three items without a picture after the first: two texts.
+    const texts = piecesOf(message)
+      .slice(1)
+      .filter((piece) => piece.picture === undefined);
+    expect(texts.map((piece) => piece.text)).toEqual([
+      '**Task many**',
+      [
+        'Great Ball ×1',
+        '- **Stop 101** · **Member 101**',
+        'Ultra Ball ×1',
+        '- **Stop 201** · **Member 201**',
+        'Razz Berry ×1',
+        '- **Stop 301** · **Member 301**',
+      ].join('\n'),
+    ]);
+    expectV2Sendable(message!);
+  });
+
+  it('gives a version with no stop shown no picture (the fifteen stops of a task)', () => {
+    const task = taskOf('full', [[LILEEP!], [item('Rare Candy')]], 15);
+    const [message] = stopPostMessages({ day: DAY, tasks: [task] }).messages;
+    expect(picturesIn([message!])).toEqual([LILEEP!.image]);
+    expect(textOf(message)).toContain('- …and 15 more stops');
+    expect(textOf(message)).not.toContain('Rare Candy');
+  });
+
+  it('shows a leader’s and Giovanni’s portrait, a decoy’s one catch, and the encounter picture for a decoy of several', () => {
+    const hideout = (key: string, catches = feedChoice(key).catches): PostHideout => ({
+      key,
+      name: feedChoice(key).name,
+      catches,
+      stops: [by(1, 'Hideout stop')],
+    });
+    const decoy = feedChoice('decoy').catches;
+    const layout = stopPostMessages({
+      day: DAY,
+      tasks: [],
+      hideouts: [
+        hideout('giovanni'),
+        hideout('leader:cliff'),
+        hideout('decoy'),
+        hideout('decoy', [...decoy, ...feedChoice('leader:arlo').catches]),
+      ],
+    });
+    expect(picturesIn(layout.messages)).toEqual([
+      GIOVANNI_PORTRAIT,
+      LEADER_PORTRAITS.cliff,
+      decoy[0]!.image,
+      ENCOUNTER_PICTURE,
+    ]);
+    // The heading stands on its own, the Pokémon caught stay in the text.
+    const pieces = piecesOf(layout.messages[0]);
+    expect(pieces[1]).toEqual({ text: '### Team GO Rocket hideouts' });
+    expect(pieces[2]?.text).toContain('**Giovanni** · catch Zekrom');
+  });
+
+  it('names each picture as the lookup gives it, and lists every source for `prepare`', () => {
+    const view = {
+      day: DAY,
+      tasks: [taskOf('throws', [[LILEEP!], [LILEEP!, ANORITH!]])],
+      hideouts: [
+        {
+          key: 'leader:arlo',
+          name: 'Arlo',
+          catches: feedChoice('leader:arlo').catches,
+          stops: [by(9)],
+        },
+      ],
+    };
+    const looked = (source: string) =>
+      `https://map.example.test/pictures/${String(source.length)}.png`;
+    expect(picturesIn(stopPostMessages(view, looked).messages)).toEqual(
+      [LILEEP!.image!, ENCOUNTER_PICTURE, LEADER_PORTRAITS.arlo].map(looked),
+    );
+    expect(postPictures(view)).toEqual([LILEEP!.image, ENCOUNTER_PICTURE, LEADER_PORTRAITS.arlo]);
+  });
+
+  it('asks `prepare` only for the pictures the layout shows', () => {
+    const items = ['Poke Ball', 'Great Ball', 'Ultra Ball', 'Razz Berry'].map((name) => [
+      item(name),
+    ]);
+    // Six pictures of a task at most: of four items and five Pokémon, the first item's alone.
+    const many = taskOf('many', [...items, ...Array.from({ length: 5 }, () => [LILEEP!])]);
+    expect(postPictures({ day: DAY, tasks: [many] })).toEqual([
+      LILEEP!.image,
+      item('Poke Ball').image,
+    ]);
+    // A version with no stop shown, the day's research under a window: none.
+    const full = taskOf('full', [[LILEEP!], [item('Rare Candy')]], 15);
+    const waiting = { at: Date.UTC(2026, 10, 21, 22), tasks: [taskOf('day', [[ANORITH!]])] };
+    expect(postPictures({ day: DAY, tasks: [full], waiting })).toEqual([LILEEP!.image]);
+    // A busy day: no item pictures, and none of the tasks counted by "…and N more tasks".
+    const own = (n: number): TaskReward => ({ ...LILEEP!, image: `${LILEEP!.image!}?n=${n}` });
+    const busy = Array.from({ length: 40 }, (_, n) =>
+      taskOf(`busy${String(n)}`, [[own(n)], [item('Rare Candy')]], 2),
+    );
+    const view = { day: DAY, tasks: busy };
+    const { messages } = stopPostMessages(view);
+    expect(textOf(messages.at(-1))).toMatch(/…and \d+ more tasks/);
+    const shown = picturesIn(messages);
+    expect(shown.length).toBeLessThan(busy.length);
+    expect(postPictures(view)).toEqual(shown);
+  });
+
+  it('asks `prepare` for the pictures the lookup draws: a source gone frees its place for the seventh line', () => {
+    const own = (n: number): TaskReward => ({ ...LILEEP!, image: `${LILEEP!.image!}?n=${n}` });
+    const sources = Array.from({ length: 7 }, (_, n) => own(n).image!);
+    const view = {
+      day: DAY,
+      tasks: [
+        taskOf(
+          'seven',
+          sources.map((_, n) => [own(n)]),
+        ),
+      ],
+    };
+    const gone = (source: string) => (source === sources[0] ? undefined : source);
+    expect(postPictures(view)).toEqual(sources.slice(0, 6));
+    // The gone one stays listed: `prepare` asks for it again once its failure is old.
+    expect(postPictures(view, gone)).toEqual(sources);
+    expect(picturesIn(stopPostMessages(view, gone).messages)).toEqual(sources.slice(1));
+  });
+
+  it('shows no picture where the lookup names none (a source gone), the line’s text kept', () => {
+    const view = {
+      day: DAY,
+      tasks: [taskOf('throws', [[LILEEP!], [item('Rare Candy')]])],
+      hideouts: [{ key: 'leader:arlo', name: 'Arlo', catches: [], stops: [by(9)] }],
+    };
+    const gone = new Set([LEADER_PORTRAITS.arlo, LILEEP!.image]);
+    const { messages } = stopPostMessages(view, (source) =>
+      gone.has(source) ? undefined : source,
+    );
+    expect(picturesIn(messages)).toEqual([item('Rare Candy').image]);
+    expect(textOf(messages[0])).toContain('**Arlo**');
+    expect(textOf(messages[0])).toContain('Lileep');
+    expectV2Sendable(messages[0]!);
+  });
+
+  it('shows a hideout without its portrait when the portrait answers 404, and with the feed’s address when it answers 500 (StopPictures)', async () => {
+    const dir = mkdtempSync(path.join(tmpdir(), 'pine-pictures-'));
+    onTestFinished(() => {
+      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
+    });
+    const status: Record<string, number> = {
+      [LEADER_PORTRAITS.cliff]: 404,
+      [LEADER_PORTRAITS.arlo]: 500,
+    };
+    const pictures = new StopPictures({
+      settings: {
+        web: {
+          port: 8080,
+          host: '127.0.0.1',
+          publicUrl: 'https://map.example.test',
+          trustProxy: false,
+          tiles: 'osm',
+        },
+      },
+      folder: dir,
+      fetch: (url) =>
+        Promise.resolve({
+          ...bytesResponse(new Uint8Array(0), { status: status[url] ?? 500 }),
+          ok: false,
+        }),
+      log: createTestLogger().log,
+    });
+    const hideout = (leader: 'cliff' | 'arlo'): PostHideout => ({
+      key: `leader:${leader}`,
+      name: leader === 'cliff' ? 'Cliff' : 'Arlo',
+      catches: [],
+      stops: [by(leader === 'cliff' ? 1 : 2)],
+    });
+    const view = { day: DAY, tasks: [], hideouts: [hideout('cliff'), hideout('arlo')] };
+    await pictures.prepare(postPictures(view));
+    pictures.serving();
+    const { messages } = stopPostMessages(view, (source) => pictures.url(source));
+    expect(picturesIn(messages)).toEqual([LEADER_PORTRAITS.arlo]);
+    expect(textOf(messages[0])).toContain('**Cliff**');
+    expectV2Sendable(messages[0]!);
+  });
+
+  it('lets the item pictures go on a day too busy for one message, and keeps the Pokémon’s', () => {
+    const items = Array.from({ length: 12 }, (_, n) =>
+      taskOf(`item${String(n)}`, [[item('Rare Candy')]]),
+    );
+    const view = { day: DAY, tasks: [taskOf('pokemon', [[LILEEP!]]), ...items] };
+    const { messages } = stopPostMessages(view);
+    expect(messages).toHaveLength(1);
+    expect(picturesIn(messages)).toEqual([LILEEP!.image]);
+    // The same input, the same layout: redraws do not flicker.
+    expect(stopPostMessages(view)).toEqual(stopPostMessages(view));
+    // A day that fits with every picture keeps them.
+    const quiet = stopPostMessages({
+      day: DAY,
+      tasks: [taskOf('pokemon', [[LILEEP!]]), ...items.slice(0, 3)],
+    });
+    expect(picturesIn(quiet.messages)).toEqual([
+      LILEEP!.image,
+      ...items.slice(0, 3).map(() => item('Rare Candy').image),
+    ]);
+  });
+
+  it('spills as before when even without the item pictures it needs more messages, within Discord’s limits', () => {
+    const tasks = Array.from({ length: 30 }, (_, n) =>
+      taskOf(`busy${String(n)}`, [[LILEEP!], [item('Rare Candy')], [LILEEP!, ANORITH!]], 2),
+    );
+    const { messages } = stopPostMessages({ day: DAY, tasks });
+    expect(messages).toHaveLength(3);
+    for (const message of messages) expectV2Sendable(message);
+    expect(picturesIn(messages)).not.toContain(item('Rare Candy').image);
+    expect(picturesIn(messages)).toContain(ENCOUNTER_PICTURE);
+  });
+
+  it('keeps the day’s research under an event’s window, after the window’s tasks, without pictures', () => {
+    const at = Date.UTC(2026, 10, 21, 22);
+    const view = {
+      day: DAY,
+      event: 'Pawniard Community Day',
+      until: 'until 5:00 PM',
+      tasks: [taskOf('window', [[LILEEP!]])],
+      waiting: { at, tasks: [taskOf('day', [[ANORITH!], [item('Rare Candy')]])] },
+      hideouts: [{ key: 'giovanni', name: 'Giovanni', catches: [], stops: [by(7)] }],
+    };
+    const layout = stopPostMessages(view);
+    const text = textOf(layout.messages[0]);
+    const heading = `### Back at <t:${String(at / 1_000)}:t>, after Pawniard Community Day`;
+    expect(text.indexOf('**Task window**')).toBeGreaterThan(0);
+    expect(text.indexOf(heading)).toBeGreaterThan(text.indexOf('**Task window**'));
+    expect(text.indexOf('**Task day**')).toBeGreaterThan(text.indexOf(heading));
+    expect(text.indexOf('### Team GO Rocket hideouts')).toBeGreaterThan(
+      text.indexOf('**Task day**'),
+    );
+    expect(text).not.toContain('comes back');
+    expect(picturesIn(layout.messages)).toEqual([LILEEP!.image, GIOVANNI_PORTRAIT]);
+    expect(layout.placement.get('day')).toBe(0);
+    const classic = stopPostText(view).messages[0]?.content ?? '';
+    expect(classic.indexOf('**Task day**')).toBeGreaterThan(classic.indexOf(heading));
+    // Only the day's research waiting: something is reported.
+    const waitingOnly = stopPostMessages({ ...view, tasks: [], hideouts: [] });
+    expect(textOf(waitingOnly.messages[0])).not.toContain('Nothing reported right now.');
+    expect(textOf(waitingOnly.messages[0])).toContain(heading);
+  });
+});
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 3c945f6a041e9e9fdbf8916e0585b2802150a16b..8d0a7071e3e6ef8fdafcc21ad2df178dca0927cf 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -2,6 +2,13 @@ import type { APIComponentInContainer } from 'discord.js';
 import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
 import type { TaskReward } from '../domain/research/task.js';
 import type { RocketCatch } from '../domain/rocket/lineups.js';
+import {
+  AS_FED,
+  researchPicture,
+  rocketPicture,
+  type PictureLookup,
+  type StopPicture,
+} from '../domain/stops/pictures.js';
 import type { Reporter, ReportedStop, ResearchDetail } from '../domain/stops/report.js';
 import { cutText, TEXT_BUDGET } from './party-post.js';
 import { RESEARCH_COLOUR, rewardWords, stopLine, taskText } from './research.js';
@@ -14,7 +21,10 @@ import { container, countComponents, section, separator, textDisplay, thumbnail
  * research grouped by task, each with its rewards and its stops, then Team GO Rocket's hideouts
  * (plan 8R-2: Giovanni, Cliff, Arlo, Sierra, the decoy grunt, each with its stops), in
  * components-v2 messages of Discord's limits (40 components, `TEXT_BUDGET` of text), spilling
- * into a second and a third, then "…and N more tasks".
+ * into a second and a third, then "…and N more tasks". Since plan 8R-6 (design
+ * `2026-10-23-stop-pictures-design.md`) every reward line has its picture by the rule
+ * (`researchPicture`, `rocketPicture`), and the day's research that waits under an event's window
+ * stays in the post below the window's, without pictures.
  */
 
 /** At most this many messages make one post (design 9.7). */
@@ -27,6 +37,13 @@ const CLASSIC_TEXT = 2_000;
 /** How many stops of one task or hideout a post names; the rest are counted. */
 const STOPS_SHOWN = 15;
 
+/**
+ * How many reward lines of one task carry a picture (plan 8R-6, design Q3): Pokémon first, then
+ * items, in the list's order; the rest are text. A section and its thumbnail are three of a
+ * message's 40 components.
+ */
+export const PICTURES_PER_TASK = 6;
+
 /** A stop of the post with who reported it there. */
 interface PostStop {
   stop: ReportedStop;
@@ -75,8 +92,12 @@ export interface StopPostView {
   hideouts?: PostHideout[] | undefined;
   /** The event of the period on now, when it is one's (its name). */
   event?: string | undefined;
-  /** Under an intra-day event: how many stops' research waits, and until when. */
-  waiting?: { stops: number; at: number } | undefined;
+  /**
+   * Under an intra-day event's window (or a big event's daily hours): when the day's research
+   * comes back, and its tasks, most stops first (plan 8R-6, Matt: shown below the window's,
+   * without pictures, under `### Back at <time>, after <event>`).
+   */
+  waiting?: { at: number; tasks: PostTask[] } | undefined;
   /**
    * When the period on now ends (an event's), as its line ends it: `until midnight`, `until
    * <time>`, with the day when it is not today (`periodEndWords`; review B7).
@@ -84,19 +105,19 @@ export interface StopPostView {
   until?: string | undefined;
 }
 
+/** A run of a block's lines, with the picture its line may carry by the rule. */
+interface Piece {
+  text: string;
+  picture?: StopPicture | undefined;
+}
+
 /** A part of the post that stays in one message: a task or a hideout. */
 interface Block {
   /** What a DM finds it by: a task's key and its versions' (R9), a hideout's `rocketKey`. */
   keys: string[];
   kind: 'task' | 'hideout';
-  /** Its text in at most `room` characters, by whole lines. */
-  body: (room: number) => string;
-  picture: string | undefined;
-}
-
-/** The picture beside a task: its first reward's that has one. */
-function pictureOf(rewards: readonly TaskReward[]): string | undefined {
-  return rewards.find((reward) => reward.image !== null)?.image ?? undefined;
+  /** Its lines in at most `room` characters in all, by whole lines, in runs. */
+  pieces: (room: number) => Piece[];
 }
 
 /** The line that counts the stops a block's text does not name. */
@@ -104,45 +125,83 @@ function moreStops(left: number): string {
   return `- …and ${count(left, 'more stop')}`;
 }
 
-/**
- * A head and its stops as text of at most `room` characters: the head, then a line per stop with
- * who reported it, as many whole lines as fit (`STOPS_SHOWN` at most; each line is made of parts
- * cut before they are escaped, design 9.7, and never cut itself: review B6), then the rest
- * counted.
- */
-function stopsBody(head: string, stops: readonly PostStop[], room: number): string {
-  return groupsBody(head, [{ stops }], room);
+/** Groups of stops, each under its own line where it has one, with its picture by the rule. */
+interface StopGroup {
+  line?: string;
+  stops: readonly PostStop[];
+  picture?: StopPicture | undefined;
 }
 
 /**
- * A head and groups of stops, each under its own line where it has one (a task's versions, plan
- * 8R-5), as text of at most `room` characters: whole lines only, `STOPS_SHOWN` stops at most in
- * all, a group's line only with at least one of its stops, then the rest counted.
+ * The stop lines of each group that fit `room` characters after `used` of them: whole lines
+ * only, `STOPS_SHOWN` stops at most in all, a group's line only with at least one of its stops
+ * (each line made of parts cut before they are escaped, design 9.7, and never cut itself: review
+ * B6), and how many are left over to be counted.
  */
-function groupsBody(
-  head: string,
-  groups: readonly { line?: string; stops: readonly PostStop[] }[],
+function fill(
+  used: number,
+  groups: readonly StopGroup[],
   room: number,
-): string {
+): { lines: string[][]; more: number } {
   const total = groups.reduce((sum, group) => sum + group.stops.length, 0);
-  const lines: string[] = [];
-  let used = head.length;
+  const lines: string[][] = groups.map(() => []);
   let shown = 0;
-  fill: for (const group of groups) {
+  let length = used;
+  fill: for (const [at, group] of groups.entries()) {
     for (const [index, { stop, reporter }] of group.stops.entries()) {
       if (shown >= STOPS_SHOWN) break fill;
       const own = `- ${stopLine(stop)} · ${memberByName(reporter)}`;
       const line = index === 0 && group.line !== undefined ? `${group.line}\n${own}` : own;
       const left = total - shown - 1;
       const tail = left > 0 ? 1 + moreStops(left).length : 0;
-      if (used + 1 + line.length + tail > room) break fill;
-      lines.push(line);
-      used += 1 + line.length;
+      if (length + 1 + line.length + tail > room) break fill;
+      lines[at]?.push(own);
+      length += 1 + line.length;
       shown += 1;
     }
   }
-  const more = total - shown;
-  return [head, ...lines, ...(more > 0 ? [moreStops(more)] : [])].join('\n');
+  return { lines, more: total - shown };
+}
+
+/**
+ * A head and groups of stops as pieces of at most `room` characters in all (`fill`), after a
+ * heading of their section where it has one (its own piece). One group without a line is one
+ * piece with its picture (a task of one version, a hideout: one block, as before); several are the
+ * head, then a piece per group with a stop shown (its line and its stops, its picture), then the
+ * line that counts the rest: a group with no stop shown has no piece and no picture.
+ */
+function stopPieces(
+  heading: string | undefined,
+  head: string,
+  groups: readonly StopGroup[],
+  room: number,
+): Piece[] {
+  const used = head.length + (heading === undefined ? 0 : heading.length + 1);
+  const { lines, more } = fill(used, groups, room);
+  const tail = more > 0 ? [moreStops(more)] : [];
+  const top = heading === undefined ? [] : [{ text: heading }];
+  const [only] = groups;
+  if (groups.length === 1 && only?.line === undefined) {
+    const shown = lines[0] ?? [];
+    return [
+      ...top,
+      {
+        text: [head, ...shown, ...tail].join('\n'),
+        picture: shown.length > 0 ? only?.picture : undefined,
+      },
+    ];
+  }
+  return [
+    ...top,
+    { text: head },
+    ...groups.flatMap((group, at): Piece[] => {
+      const shown = lines[at] ?? [];
+      if (shown.length === 0) return [];
+      const text = [...(group.line === undefined ? [] : [group.line]), ...shown].join('\n');
+      return [{ text, picture: group.picture }];
+    }),
+    ...tail.map((text) => ({ text })),
+  ];
 }
 
 /** The line of a version among others whose reward was not said. */
@@ -151,48 +210,82 @@ const REWARD_NOT_SAID = 'reward not said';
 /** The heading of the Rocket section, over its first hideout. */
 const ROCKET_HEADING = '### Team GO Rocket hideouts';
 
-/** The blocks of a view: its tasks, then its hideouts under their heading. */
-function blocksOf(view: StopPostView): Block[] {
-  const tasks = view.tasks.map((task): Block => {
-    const keys = [task.key, ...task.versions.map((version) => version.key)];
-    const [only, ...others] = task.versions;
-    // One version: its rewards beside the task, as before plan 8R-5. Several: a line of each
-    // version's rewards before its stops (R9).
-    const single = only !== undefined && others.length === 0;
-    const rewards = single ? rewardWords(only.rewards) : '';
-    const head = `**${taskText(task.research)}**${rewards === '' ? '' : ` · ${rewards}`}`;
-    // A version whose reward was not said (a typed task without `reward:`) has a line of its own
-    // too, else its stops would run on under the version before it (review R1).
-    const groups = task.versions.map((version) => {
-      const line = rewardWords(version.rewards);
-      return single
-        ? { stops: version.stops }
-        : { line: line === '' ? REWARD_NOT_SAID : line, stops: version.stops };
-    });
-    return {
-      keys: [...new Set(keys)],
-      kind: 'task',
-      body: (room) => groupsBody(head, groups, room),
-      // One picture: the first version's that has one.
-      picture: pictureOf(task.versions.flatMap((version) => version.rewards)),
-    };
+/** The heading of the day's research under an event's window (plan 8R-6). */
+function backHeading(at: number, event: string | undefined): string {
+  return `### Back at ${timestamp(at, 't')}${event === undefined ? '' : `, after ${plain(event)}`}`;
+}
+
+/**
+ * A task's block: its text with its version's rewards beside it where it has one version, else
+ * its text a line of its own and a line of each version's rewards before its stops (R9), each
+ * with its picture by the rule (`researchPicture`) unless `pictured` is false.
+ */
+function taskBlock(task: PostTask, pictured: boolean, heading?: string): Block {
+  const keys = [task.key, ...task.versions.map((version) => version.key)];
+  const [only, ...others] = task.versions;
+  const single = only !== undefined && others.length === 0;
+  const rewards = single ? rewardWords(only.rewards) : '';
+  const head = `**${taskText(task.research)}**${rewards === '' ? '' : ` · ${rewards}`}`;
+  // A version whose reward was not said (a typed task without `reward:`) has a line of its own
+  // too, else its stops would run on under the version before it (review R1).
+  const groups = task.versions.map((version): StopGroup => {
+    const line = rewardWords(version.rewards);
+    const picture = pictured ? researchPicture(version.rewards) : undefined;
+    return single
+      ? { stops: version.stops, picture }
+      : { line: line === '' ? REWARD_NOT_SAID : line, stops: version.stops, picture };
   });
+  return {
+    keys: [...new Set(keys)],
+    kind: 'task',
+    pieces: (room) => stopPieces(heading, head, groups, room),
+  };
+}
+
+/**
+ * The blocks of a view: its tasks; the day's research that waits under an event's window, under
+ * its heading and without pictures (plan 8R-6); then its hideouts under their heading.
+ */
+function blocksOf(view: StopPostView): Block[] {
+  const tasks = view.tasks.map((task) => taskBlock(task, true));
+  const waiting = (view.waiting?.tasks ?? []).map((task, index) =>
+    taskBlock(
+      task,
+      false,
+      index === 0 && view.waiting ? backHeading(view.waiting.at, view.event) : undefined,
+    ),
+  );
   const hideouts = (view.hideouts ?? []).map((hideout, index): Block => {
     const catches = catchWords(hideout.catches);
-    const head =
-      `${index === 0 ? `${ROCKET_HEADING}\n` : ''}**${plain(hideout.name)}**` +
-      `${catches === '' ? '' : ` · catch ${catches}`}`;
+    const head = `**${plain(hideout.name)}**${catches === '' ? '' : ` · catch ${catches}`}`;
+    const group = { stops: hideout.stops, picture: rocketPicture(hideout.key, hideout.catches) };
     return {
       keys: [hideout.key],
       kind: 'hideout',
-      body: (room) => stopsBody(head, hideout.stops, room),
-      picture: hideout.catches.find((one) => one.image !== null)?.image ?? undefined,
+      pieces: (room) => stopPieces(index === 0 ? ROCKET_HEADING : undefined, head, [group], room),
     };
   });
-  return [...tasks, ...hideouts];
+  return [...tasks, ...waiting, ...hideouts];
 }
 
-/** The head of the post: its title, the day, an event's line and the waiting line. */
+/**
+ * The pictures a post shows, by their sources, each once (a task's Pokémon before its items;
+ * plan 8R-6): what
+ * `StopPictures.prepare` makes before the post is drawn. Read off the layout with every picture
+ * there, so only what it can show: `PICTURES_PER_TASK` of a task, none of a version with no stop
+ * shown or of a task counted by "…and N more", none of the day's research under a window, none
+ * of items and Mega Energy on a busy day. `picture` is the lookup the post is drawn with
+ * (`StopPictures.url`): a source gone takes no place, so the next line's picture is listed, and
+ * the gone one with it, to be asked for again once its failure is old.
+ */
+export function postPictures(view: StopPostView, picture: PictureLookup = AS_FED): string[] {
+  const items = layoutOf(view, true, picture).messages.length <= 1;
+  const sources = new Set<string>();
+  layoutOf(view, items, picture, sources);
+  return [...sources];
+}
+
+/** The head of the post: its title, the day, an event's line. */
 function headText(view: StopPostView, part: number): string {
   if (part > 0) return `-# Today at the stops, continued (${String(part + 1)})`;
   const lines = [
@@ -204,13 +297,11 @@ function headText(view: StopPostView, part: number): string {
       `**${plain(view.event)}**: its tasks${view.until === undefined ? '' : ` ${view.until}`}.`,
     );
   }
-  if (view.waiting !== undefined) {
-    lines.push(
-      `The day’s research comes back at ${timestamp(view.waiting.at, 't')} ` +
-        `(${count(view.waiting.stops, 'stop')}).`,
-    );
-  }
-  if (view.tasks.length === 0 && (view.hideouts ?? []).length === 0) {
+  if (
+    view.tasks.length === 0 &&
+    (view.hideouts ?? []).length === 0 &&
+    (view.waiting?.tasks ?? []).length === 0
+  ) {
     lines.push(
       'Nothing reported right now. `/research report` and `/rocket report` tell the region ' +
         'what a stop has.',
@@ -219,13 +310,52 @@ function headText(view: StopPostView, part: number): string {
   return lines.join('\n');
 }
 
-/** A block as components: its text with its picture beside it, or the text alone. */
-function blockParts(block: Block, room: number): APIComponentInContainer[] {
-  // `cutText` only as a backstop: the body fits `room` by whole lines.
-  const body = cutText(block.body(room), room);
-  return [
-    block.picture === undefined ? textDisplay(body) : section(body, thumbnail(block.picture)),
-  ];
+/**
+ * A block as components: its pieces, `PICTURES_PER_TASK` of their pictures at most beside them
+ * (Pokémon first, then items, in order; none of items and Mega Energy where `items` is false), the
+ * address of each as `picture` names it, none where it names none (a source gone, which takes no
+ * place of the six); consecutive pieces without a picture in one text.
+ */
+function blockParts(
+  block: Block,
+  room: number,
+  items: boolean,
+  picture: PictureLookup,
+): APIComponentInContainer[] {
+  const pieces = block.pieces(room);
+  const candidates = pieces.flatMap((piece, at) =>
+    piece.picture !== undefined && (items || piece.picture.kind === 'pokemon')
+      ? [{ at, kind: piece.picture.kind }]
+      : [],
+  );
+  const addresses = new Map<number, string>();
+  for (const one of [
+    ...candidates.filter((candidate) => candidate.kind === 'pokemon'),
+    ...candidates.filter((candidate) => candidate.kind !== 'pokemon'),
+  ]) {
+    if (addresses.size >= PICTURES_PER_TASK) break;
+    const source = pieces[one.at]?.picture?.source;
+    const address = source === undefined ? undefined : picture(source);
+    if (address !== undefined) addresses.set(one.at, address);
+  }
+  const parts: APIComponentInContainer[] = [];
+  let run: string[] = [];
+  const endRun = () => {
+    // `cutText` only as a backstop: the pieces fit `room` by whole lines.
+    if (run.length > 0) parts.push(textDisplay(cutText(run.join('\n'), room)));
+    run = [];
+  };
+  for (const [at, piece] of pieces.entries()) {
+    const address = addresses.get(at);
+    if (address !== undefined) {
+      endRun();
+      parts.push(section(cutText(piece.text, room), thumbnail(address)));
+    } else {
+      run.push(piece.text);
+    }
+  }
+  endRun();
+  return parts;
 }
 
 /** The line that counts what the post has no room for: `…and 4 more tasks and 1 more hideout`. */
@@ -240,20 +370,48 @@ function leftLine(left: readonly Block[]): string {
 }
 
 /**
- * The post as components-v2 messages (design 6, 9.7): research first, then the hideouts (plan
- * 8R-2), in as many messages as they need of `MAX_POST_MESSAGES`, each a container of the
- * research colour within Discord's limits; a block too long for a message is cut (text cut before
- * it is escaped: each line is made of escaped parts, cut whole by `cutText` as a backstop); what
- * does not fit the last message is counted there: "…and 4 more tasks and 1 more hideout".
+ * The post as components-v2 messages (design 6, 9.7): research first, then the day's research
+ * waiting under an event's window, then the hideouts (plan 8R-2), in as many messages as they
+ * need of `MAX_POST_MESSAGES`, each a container of the research colour within Discord's limits; a
+ * block too long for a message is cut (text cut before it is escaped: each line is made of
+ * escaped parts, cut whole by `cutText` as a backstop); what does not fit the last message is
+ * counted there: "…and 4 more tasks and 1 more hideout". A busy day is decided for the whole post
+ * (plan 8R-6): laid out with every picture, and where that needs more than one message, once more
+ * without the pictures of items and Mega Energy, which then spills as it must; the same view
+ * always gives the same layout. `picture` gives the address of each picture's source
+ * (`StopPictures.url`).
  */
-export function stopPostMessages(view: StopPostView): PostLayout<V2Message> {
+export function stopPostMessages(
+  view: StopPostView,
+  picture: PictureLookup = AS_FED,
+): PostLayout<V2Message> {
+  const every = layoutOf(view, true, picture);
+  return every.messages.length > 1 ? layoutOf(view, false, picture) : every;
+}
+
+/**
+ * The post laid out with the pictures of items and Mega Energy or without; `shownSources`, where
+ * given, gathers the sources of the pictures of the blocks placed (`postPictures`).
+ */
+function layoutOf(
+  view: StopPostView,
+  items: boolean,
+  picture: PictureLookup,
+  shownSources?: Set<string>,
+): PostLayout<V2Message> {
   const messages: APIComponentInContainer[][] = [];
   const placement = new Map<string, number>();
   let parts: APIComponentInContainer[] = [textDisplay(headText(view, 0))];
   const blocks = blocksOf(view);
   let shown = 0;
   for (const block of blocks) {
-    const own = blockParts(block, TEXT_BUDGET - TAIL_ROOM - 200);
+    // Every source looked up, a gone one too: `prepare` asks for it again once its failure is old.
+    const sources: string[] = [];
+    const named: PictureLookup = (source) => {
+      sources.push(source);
+      return picture(source);
+    };
+    const own = blockParts(block, TEXT_BUDGET - TAIL_ROOM - 200, items, named);
     const joined = [...parts, separator(), ...own];
     if (fits(joined)) {
       parts = joined;
@@ -262,7 +420,9 @@ export function stopPostMessages(view: StopPostView): PostLayout<V2Message> {
       messages.push(parts);
       parts = [textDisplay(headText(view, messages.length)), ...own];
     }
-    for (const key of block.keys) placement.set(key, messages.length);
+    // The window's task first: a DM of now finds it there, not among the day's that waits.
+    for (const key of block.keys) if (!placement.has(key)) placement.set(key, messages.length);
+    for (const source of sources) shownSources?.add(source);
     shown += 1;
   }
   if (shown < blocks.length) parts.push(textDisplay(leftLine(blocks.slice(shown))));
@@ -310,7 +470,13 @@ export function stopPostText(view: StopPostView): PostLayout<ClassicMessage> {
   const blocks = blocksOf(view);
   let shown = 0;
   for (const block of blocks) {
-    const text = cutText(block.body(1_800), 1_800);
+    const text = cutText(
+      block
+        .pieces(1_800)
+        .map((piece) => piece.text)
+        .join('\n'),
+      1_800,
+    );
     const joined = `${current}\n\n${text}`;
     if (joined.length <= CLASSIC_TEXT - TAIL_ROOM) {
       current = joined;
@@ -319,7 +485,7 @@ export function stopPostText(view: StopPostView): PostLayout<ClassicMessage> {
       messages.push(current);
       current = text;
     }
-    for (const key of block.keys) placement.set(key, messages.length);
+    for (const key of block.keys) if (!placement.has(key)) placement.set(key, messages.length);
     shown += 1;
   }
   if (shown < blocks.length) current = `${current}\n${leftLine(blocks.slice(shown))}`;
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index d58947ef5b4f41022ea24071e5f92c36c7c6b145..277eb169e0f9e76abb0ceb03b67013c064ffdd2a 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -20,6 +20,7 @@ import { createTestLogger } from '../../test/support/test-logger.js';
 import type { ResearchTask } from '../domain/research/task.js';
 import type { TaskVersion } from '../domain/research/versions.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
+import type { PictureMaker } from './stop-pictures.js';
 import { StopPostService } from './stop-posts.js';
 import { StopReportService } from './stop-reports.js';
 
@@ -31,7 +32,7 @@ const ASH = { id: '200000000000000061', name: 'Ash' };
 const west = (n: number) => reportedStop(n, { lat: 40.05 + n / 1_000, lon: -80.05 });
 const east = reportedStop(90, { lat: 40.05, lon: -79.95 });
 
-function postsWith(initial: ResearchEvent[] = []) {
+function postsWith(initial: ResearchEvent[] = [], pictures?: PictureMaker) {
   const clock = { now: at('2026-11-21T10:00') };
   const { log, entries } = createTestLogger();
   const gateway = new FakePartyGateway();
@@ -74,6 +75,7 @@ function postsWith(initial: ResearchEvent[] = []) {
       now: () => clock.now,
       delayMs: 0,
       changed: (channelId) => changes.push(channelId),
+      ...(pictures ? { pictures } : {}),
     });
   const posts = make();
   const report = (task: ResearchTask, stops = [west(1)]) =>
@@ -564,7 +566,7 @@ describe('StopPostService', () => {
     ).toHaveLength(1);
   });
 
-  it('under an intra-day event, shows its tasks and says when the day’s research comes back', async () => {
+  it('under an intra-day event, shows its tasks, then the day’s research and when it comes back', async () => {
     made = postsWith([PAWNIARD_DAY]);
     await made.report(pageTask('Catch 7 Pokémon'), [west(1), west(2)]);
     made.clock.now = at('2026-11-21T15:00');
@@ -572,11 +574,44 @@ describe('StopPostService', () => {
     await made.posts.flush();
     const shown = made.said()[0] ?? '';
     expect(shown).toContain('**Pawniard Community Day**: its tasks until <t:');
-    expect(shown).toContain(
-      `The day’s research comes back at <t:${String(PAWNIARD_DAY.end / 1_000)}:t> (2 stops).`,
-    );
-    expect(shown).toContain('Catch a Dragon-type Pokémon');
-    expect(shown).not.toContain('Catch 7 Pokémon');
+    // The day's research stays, below the window's, under its heading (plan 8R-6).
+    const heading = `### Back at <t:${String(PAWNIARD_DAY.end / 1_000)}:t>, after Pawniard Community Day`;
+    expect(shown.indexOf('Catch a Dragon-type Pokémon')).toBeGreaterThan(0);
+    expect(shown.indexOf(heading)).toBeGreaterThan(shown.indexOf('Catch a Dragon-type Pokémon'));
+    expect(shown.indexOf('Catch 7 Pokémon')).toBeGreaterThan(shown.indexOf(heading));
+    expect(shown).not.toContain('comes back');
+  });
+
+  it('has the post’s pictures made before it is drawn, and names each as the pictures give it (plan 8R-6)', async () => {
+    const prepared: { sources: string[]; sentBefore: number }[] = [];
+    const calls: string[] = [];
+    const looked = (source: string) => {
+      calls.push('url');
+      return `https://map.example.test/pictures/${String(source.length)}.png`;
+    };
+    made = postsWith([], {
+      prepare: (sources) => {
+        calls.push('prepare');
+        prepared.push({
+          sources: [...sources],
+          sentBefore: made?.gateway.messagesIn(WEST_CHANNEL).length ?? -1,
+        });
+        return Promise.resolve();
+      },
+      url: looked,
+    });
+    const task = pageTask('Make 3 Great Throws in a row');
+    const [lileep] = researchTasksFixture().versions(task);
+    if (!lileep) throw new Error('a version');
+    await made.reportVersion(task, lileep);
+    await made.posts.flush();
+    const source = lileep.rewards[0]?.image ?? '';
+    expect(prepared).toEqual([{ sources: [source], sentBefore: 0 }]);
+    // What is prepared is chosen with the same lookup as the draw: a source gone frees its place.
+    expect(calls[0]).toBe('url');
+    const [post] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(JSON.stringify(post?.message)).toContain(looked(source));
+    expect(JSON.stringify(post?.message)).not.toContain(source);
   });
 
   it('says a multi-day event’s tasks hold until midnight, and its last day’s until its hour (B7)', async () => {
@@ -651,7 +686,7 @@ describe('StopPostService', () => {
     made.setEvents([{ ...PAWNIARD_DAY, start: at('2026-11-21T09:00') }]);
     await made.posts.flush();
     expect(made.said()[0]).toContain('**Pawniard Community Day**: its tasks until');
-    expect(made.said()[0]).toContain('The day’s research comes back at');
+    expect(made.said()[0]).toContain('### Back at');
     // Its end is the next change: the timer follows the events.
     made.clock.now = PAWNIARD_DAY.end + 1_000;
     await vi.advanceTimersByTimeAsync(PAWNIARD_DAY.end - at('2026-11-21T10:00') + 2_000);
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index c1d2bf04a3c6d951d689ed0cc70278d51d3407dd..d4cd21f37d6e14159b457aa6646c2f595937500c 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -19,6 +19,7 @@ import { taskOfSubject, type ResearchSubjectKey } from '../domain/research/repor
 import { versionValue } from '../domain/research/versions.js';
 import type { Logger } from '../log.js';
 import {
+  postPictures,
   stopPostMessages,
   stopPostText,
   type PostLayout,
@@ -33,6 +34,7 @@ import { Gathered } from './gathered.js';
 import { KeyedLock } from './keyed-lock.js';
 import { isNetworkError } from './network-error.js';
 import type { ResearchEventProvider } from './raid-event-service.js';
+import type { PictureMaker } from './stop-pictures.js';
 import { isHideoutReport, type StopReportService } from './stop-reports.js';
 
 /** How long after the last change of a channel's reports its post is drawn (design 6). */
@@ -64,6 +66,11 @@ export interface StopPostServiceOptions {
    * that would be the same is not edited).
    */
   changed?: (channelId: string) => void;
+  /**
+   * The square pictures (plan 8R-6, `StopPictures`): made before a post is drawn, and named by
+   * their address. Without it the post names the feeds' addresses.
+   */
+  pictures?: PictureMaker;
 }
 
 /**
@@ -264,9 +271,13 @@ export class StopPostService {
       hideouts: hideoutsOf(hideouts),
       event: period.event?.name,
       until: period.kind === 'day' ? undefined : periodEndWords(period.end, now, this.options.zone),
+      // The day's research under an event's window stays, below the window's (plan 8R-6).
       waiting:
         period.waiting && waiting.length > 0
-          ? { stops: waiting.length, at: period.waiting.at }
+          ? {
+              at: period.waiting.at,
+              tasks: grouped(waiting, (report) => this.options.reports.versionOf(report)),
+            }
           : undefined,
     };
   }
@@ -284,11 +295,22 @@ export class StopPostService {
     if (!view) return;
     // Nothing reported and no post yet: none is made (design 6: at the first report, research or
     // hideout).
-    const empty = view.tasks.length === 0 && (view.hideouts ?? []).length === 0;
-    if (!post && empty && view.waiting === undefined) return;
-    const layout: PostLayout<OutgoingMessage> = gateway.mayPost(channelId)
-      ? stopPostMessages(view)
-      : stopPostText(view);
+    const empty =
+      view.tasks.length === 0 &&
+      (view.hideouts ?? []).length === 0 &&
+      (view.waiting?.tasks ?? []).length === 0;
+    if (!post && empty) return;
+    const { pictures } = this.options;
+    let layout: PostLayout<OutgoingMessage>;
+    if (gateway.mayPost(channelId)) {
+      // The pictures made first (plan 8R-6): one not ready names the feed's address till the next.
+      // Both laid out with the same lookup: a source gone frees its place for the next picture.
+      const lookup = pictures ? (source: string) => pictures.url(source) : undefined;
+      await pictures?.prepare(postPictures(view, lookup));
+      layout = stopPostMessages(view, lookup);
+    } else {
+      layout = stopPostText(view);
+    }
     const { messages } = layout;
     const ids: string[] = [];
     const before = post?.messageIds ?? [];
````

### Task 4: 8R-6 task 4: Pictures in DMs and the grunt message

Prototype commit: `81d4b18f4c1f0079b60ae50ee42fdab77de04259`

Research DMs show the encounter picture on a "one of", a reward's own on a
reward's, the Pokemon on a confirmation; Rocket DMs the encounter picture
while the catch is open, the Pokemon of one, a leader's or Giovanni's
portrait. A grunt's message has one picture beside its heading by the same
rule and no gallery; the stop's photo stays beside Where; a grunt narrowed
in place takes the picture of its new catches (DMs already sent stay). The
notifier and GruntMessageService have the picture made (prepare) before a DM
goes or a message is posted or edited, and name it as StopPictures.url does.

**Files:**

```
 src/app.ts                                   |  2 ++
 src/render/research.test.ts                  | 37 ++++++++++++++++++++++++++-
 src/render/research.ts                       | 49 ++++++++++++++++++++++-------------
 src/render/rocket.test.ts                    | 41 ++++++++++++++++++++++--------
 src/render/rocket.ts                         | 66 +++++++++++++++++++++---------------------------
 src/services/grunt-messages.test.ts          | 54 +++++++++++++++++++++++++++++++++++++--
 src/services/grunt-messages.ts               | 35 ++++++++++++++++++++++---
 src/services/notify-service.research.test.ts | 49 ++++++++++++++++++++++++++++++++++-
 src/services/notify-service.rocket.test.ts   | 30 ++++++++++++++++++++++
 src/services/notify-service.ts               | 56 +++++++++++++++++++++++++++++++---------
 10 files changed, 334 insertions(+), 85 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/research.test.ts src/render/rocket.test.ts src/services/grunt-messages.test.ts src/services/notify-service.research.test.ts src/services/notify-service.rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 81d4b18f4c1f0079b60ae50ee42fdab77de04259 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 4: Pictures in DMs and the grunt message`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 85cb929b5b59d310ac32cd4b7988cccd8a4612bf..98acb387c1a9a79ef3b1b80427197dfce6ef4f7e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -457,6 +457,7 @@ export async function startApp(
   const notify = new NotifyService({
     store: parties,
     posts: partyService,
+    pictures: stopPictures,
     wants,
     targetWants,
     gymTargets,
@@ -512,6 +513,7 @@ export async function startApp(
         gateway: partyGateway,
         store: new GruntMessageRepository(db),
         reports: stopReports,
+        pictures: stopPictures,
         log,
       });
   // Who wants a Rocket report hears of it once its messages are posted (plan 8R-2, design 7).
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index 54a5b11a39b267494f699c72ed5d25cf05f5c024..76ce8863628e6820bf8b52ee237c3b78eeb2acb1 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -1,15 +1,18 @@
 import { DateTime } from 'luxon';
 import { describe, expect, it } from 'vitest';
 import { textOf } from '../../test/support/messages.js';
-import { pikachuTask } from '../../test/support/research.js';
+import { pageTask, pikachuTask } from '../../test/support/research.js';
 import { researchReport, reportedStop } from '../../test/support/stop-report-cases.js';
 import type { TaskVersion } from '../domain/research/versions.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
+import type { TaskReward } from '../domain/research/task.js';
 import type { ResearchReport } from '../domain/stops/report.js';
 import {
   DISCORD_CHANNEL,
   periodEndWords,
   researchAlready,
   researchAnswer,
+  researchConfirmBrief,
   researchConfirmSentence,
   researchDmBrief,
   researchWords,
@@ -216,3 +219,35 @@ describe('periodEndWords', () => {
     );
   });
 });
+
+describe('the pictures of the research DMs (plan 8R-6)', () => {
+  const looked = (source: string) =>
+    `https://map.example.test/pictures/${String(source.length)}.png`;
+  const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;
+
+  it('shows the encounter picture on a "one of" DM, the reward on a reward’s, the Pokémon on a confirmation', () => {
+    const brief = (rewards: TaskReward[]) =>
+      researchDmBrief({ research: { rewards }, stops: [], until: 'until midnight' }, looked);
+    expect(brief([lileep!, anorith!]).picture).toBe(looked(ENCOUNTER_PICTURE));
+    expect(brief([lileep!]).picture).toBe(looked(lileep!.image!));
+    expect(brief([]).picture).toBeUndefined();
+    const confirmed = researchConfirmBrief(
+      {
+        research: { text: 'Make 3 Great Throws in a row', rewards: [lileep!] },
+        until: 'until midnight',
+      },
+      looked,
+    );
+    expect(confirmed.picture).toBe(looked(lileep!.image!));
+  });
+
+  it('names the feed’s address without a lookup', () => {
+    expect(
+      researchDmBrief({
+        research: { rewards: [lileep!, anorith!] },
+        stops: [],
+        until: 'until midnight',
+      }).picture,
+    ).toBe(ENCOUNTER_PICTURE);
+  });
+});
diff --git a/src/render/research.ts b/src/render/research.ts
index fe82703f771ebfd38a44f7d616de0676bda84550..1900ef19815498b9a8e409877288db40694db897 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -9,6 +9,7 @@ import { DateTime } from 'luxon';
 import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import { taskOfSubject } from '../domain/research/reports.js';
+import { AS_FED, researchPicture, type PictureLookup } from '../domain/stops/pictures.js';
 import { rewardsInShort, type TaskReward } from '../domain/research/task.js';
 import type {
   ReportedStop,
@@ -303,19 +304,31 @@ export function researchConfirmSentence(view: {
   return `Confirmed: the reward at ${stops} is **${reward}**.`;
 }
 
+/**
+ * A DM's picture by the rule (plan 8R-6, `researchPicture`), its address as `picture` names it;
+ * none where it names none (the source is gone).
+ */
+function dmPicture(rewards: readonly TaskReward[], picture: PictureLookup): { picture?: string } {
+  const shown = researchPicture(rewards);
+  const address = shown === undefined ? undefined : picture(shown.source);
+  return address === undefined ? {} : { picture: address };
+}
+
 /**
  * The brief of the direct message that confirms a "one of" (plan 8R-5): the task, until when, and
- * the reward's picture.
+ * the reward's picture (plan 8R-6: the Pokémon, now known).
  */
-export function researchConfirmBrief(view: {
-  research: Pick<ResearchDetail, 'text' | 'rewards'>;
-  until: string;
-}): { accent: number; picture?: string; lines: string[] } {
-  const picture = view.research.rewards.find((reward) => reward.image !== null)?.image;
+export function researchConfirmBrief(
+  view: {
+    research: Pick<ResearchDetail, 'text' | 'rewards'>;
+    until: string;
+  },
+  picture: PictureLookup = AS_FED,
+): { accent: number; picture?: string; lines: string[] } {
   const { until } = view;
   return {
     accent: RESEARCH_COLOUR,
-    ...(picture == null ? {} : { picture }),
+    ...dmPicture(view.research.rewards, picture),
     lines: [
       `**${plainNoLinks(truncate(view.research.text, 120))}**`,
       `${until.charAt(0).toUpperCase()}${until.slice(1)}.`,
@@ -326,17 +339,19 @@ export function researchConfirmBrief(view: {
 /**
  * Field research in brief, for a direct message (`notifyDm`): the rewards ("one of" where one is
  * drawn), a line per stop with its address (ten at most, the rest counted) and until when
- * (`periodEndWords`: the day too when it is not today, review B7), with the first reward's
- * picture and the colour of research.
+ * (`periodEndWords`: the day too when it is not today, review B7), with its picture by the rule
+ * (plan 8R-6: a reward's own, the encounter picture for "one of") and the colour of research.
  */
-export function researchDmBrief(view: {
-  research: Pick<ResearchDetail, 'rewards'>;
-  stops: readonly Pick<ReportedStop, 'name' | 'address'>[];
-  /** When the reports end, as a sentence ends (`periodEndWords`). */
-  until: string;
-}): { accent: number; picture?: string; lines: string[] } {
+export function researchDmBrief(
+  view: {
+    research: Pick<ResearchDetail, 'rewards'>;
+    stops: readonly Pick<ReportedStop, 'name' | 'address'>[];
+    /** When the reports end, as a sentence ends (`periodEndWords`). */
+    until: string;
+  },
+  picture: PictureLookup = AS_FED,
+): { accent: number; picture?: string; lines: string[] } {
   const { rewards } = view.research;
-  const picture = rewards.find((reward) => reward.image !== null)?.image ?? undefined;
   const short = rewards.length === 0 ? '' : plainNoLinks(rewardsInShort(rewards));
   const stops = view.stops.slice(0, DM_STOPS_SHOWN).map((stop) => {
     const name = `**${plainNoLinks(truncate(stop.name, 80))}**`;
@@ -348,7 +363,7 @@ export function researchDmBrief(view: {
   const { until } = view;
   return {
     accent: RESEARCH_COLOUR,
-    ...(picture === undefined ? {} : { picture }),
+    ...dmPicture(rewards, picture),
     lines: [
       ...(short === '' ? [] : [`**Rewards** ${rewards.length === 1 ? short : `one of ${short}`}`]),
       ...stops,
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index 209ff93ba491d59899176991d94e32255e359532..81b176cd40f1686effd6bf1d7eb3f66a77720d08 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -4,7 +4,8 @@ import {
   customIdsOf,
   galleryOf,
   textOf,
-  thumbnailOf,
+  thumbnailBeside,
+  thumbnailsOf,
 } from '../../test/support/messages.js';
 import { feedChoice } from '../../test/support/rocket.js';
 import {
@@ -13,6 +14,8 @@ import {
   reportedStop,
   rocketReport,
 } from '../../test/support/stop-report-cases.js';
+import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 import type { RocketReport } from '../domain/stops/report.js';
 import {
   alreadyReported,
@@ -22,6 +25,7 @@ import {
   gruntTextMessage,
   ROCKET_COLOUR,
   rocketAnswer,
+  rocketDmBrief,
   rocketDmSentence,
   rocketLabel,
   rocketWords,
@@ -43,8 +47,8 @@ const view = (overrides: Partial<GruntView> = {}): GruntView => ({
 });
 
 describe('gruntMessage', () => {
-  it('shows the grunt, its catches with their pictures, the stop, when it goes, and who reported it', () => {
-    const message = gruntMessage(view(), GONE);
+  it('shows the grunt with one picture beside its heading, its catches, the stop, when it goes, and who reported it', () => {
+    const message = gruntMessage(view({ picture: ENCOUNTER_PICTURE }), GONE);
     const text = textOf(message);
     expect(text).toContain('### Water-type grunt');
     expect(text).toContain('**Catch** one of Mudkip, Tentacool, Krabby, Magikarp, Feebas');
@@ -52,14 +56,13 @@ describe('gruntMessage', () => {
     expect(text).toMatch(/\*\*Where\*\* \*\*Yellow Mural\*\* · Market Street · \[Map\]\(<https:/);
     expect(text).toContain('-# Reported by **Ash**');
     expect(text).not.toContain('<@');
-    expect(thumbnailOf(message)).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/abc/);
-    expect(galleryOf(message)).toEqual([
-      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm258.icon.png',
-      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm72.icon.png',
-      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm98.icon.png',
-      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
-      'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm349.icon.png',
-    ]);
+    // One picture beside the heading (plan 8R-6), the stop's photo beside Where; no gallery.
+    expect(thumbnailBeside(message, '### Water-type grunt')).toBe(ENCOUNTER_PICTURE);
+    expect(thumbnailBeside(message, '**Where**')).toMatch(
+      /^https:\/\/lh3\.googleusercontent\.com\/abc/,
+    );
+    expect(thumbnailsOf(message)).toHaveLength(2);
+    expect(galleryOf(message)).toEqual([]);
     expect(message.components[0]).toMatchObject({ accent_color: ROCKET_COLOUR });
   });
 
@@ -77,6 +80,22 @@ describe('gruntMessage', () => {
     expect(text).not.toContain('@everyone');
     expect(text).not.toContain('**Catch**');
     expect(galleryOf(message)).toEqual([]);
+    expect(thumbnailsOf(message)).toEqual([]);
+  });
+});
+
+describe('rocketDmBrief (plan 8R-6)', () => {
+  const looked = (source: string) =>
+    `https://map.example.test/pictures/${String(source.length)}.png`;
+  const pictureOf = (key: string, catches = feedChoice(key).catches) =>
+    rocketDmBrief({ key, catches, stop: reportedStop(1), ends: { goneAt: GONE } }, looked).picture;
+
+  it('shows the encounter picture while the catch is open, the Pokémon of one, a leader’s portrait', () => {
+    const water = feedChoice('grunt:water').catches;
+    expect(pictureOf('grunt:water')).toBe(looked(ENCOUNTER_PICTURE));
+    expect(pictureOf('grunt:water:male', water.slice(0, 1))).toBe(looked(water[0]!.image!));
+    expect(pictureOf('leader:arlo')).toBe(looked(LEADER_PORTRAITS.arlo));
+    expect(pictureOf('grunt:none', [])).toBeUndefined();
   });
 });
 
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index 898758ac552121c64a6fa366b890ad4c4f13a5f3..e943b279d123cec7fd26add348f95dd79d2bee59 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -1,12 +1,8 @@
-import {
-  ButtonStyle,
-  ComponentType,
-  type APIButtonComponentWithCustomId,
-  type APIComponentInContainer,
-} from 'discord.js';
+import { ButtonStyle, ComponentType, type APIButtonComponentWithCustomId } from 'discord.js';
 import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
 import { catchesInShort, typeKeyOf, type RocketCatch } from '../domain/rocket/lineups.js';
+import { AS_FED, rocketPicture, type PictureLookup } from '../domain/stops/pictures.js';
 import type { ReportedStop, RocketDetail, RocketReport } from '../domain/stops/report.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { cutText } from './party-post.js';
@@ -21,15 +17,7 @@ import {
   truncate,
   type NamedMember,
 } from './text.js';
-import {
-  actionRow,
-  container,
-  GALLERY_ITEMS,
-  mediaGallery,
-  section,
-  textDisplay,
-  thumbnail,
-} from './v2.js';
+import { actionRow, container, section, textDisplay, thumbnail } from './v2.js';
 
 /*
  * Team GO Rocket's messages (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2): a
@@ -47,6 +35,12 @@ export interface GruntView {
   catches: readonly RocketCatch[];
   stop: ReportedStop;
   reporter: NamedMember;
+  /**
+   * The address of its one picture beside the heading (plan 8R-6: by the rule, `rocketPicture`,
+   * as `StopPictures.url` names it); none where it has none, and in a message sent again
+   * without pictures.
+   */
+  picture?: string | undefined;
 }
 
 /**
@@ -104,20 +98,12 @@ function capitalised(text: string): string {
   return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
 }
 
-/** The pictures of the catches, as a gallery shows them (those with one, ten at most). */
-function catchGallery(catches: readonly RocketCatch[]): APIComponentInContainer[] {
-  const pictured = catches.flatMap((one) =>
-    one.image === null ? [] : [{ url: one.image, description: plain(one.name) }],
-  );
-  return pictured.length === 0 ? [] : [mediaGallery(pictured.slice(0, GALLERY_ITEMS))];
-}
-
 /**
  * A grunt's report in the region channel (design 5.2), a components-v2 message like a spawn
- * report: `### Water-type grunt`, what can be caught, when the report goes away; where, with the
- * stop's address line, its maps link and its picture beside it; the catches' pictures; the
- * reporter in the small print (`memberByName`, no ping). Everything a member or a feed wrote
- * through `plainNoLinks`.
+ * report: `### Water-type grunt`, what can be caught, when the report goes away, with its one
+ * picture beside them (plan 8R-6: no gallery); where, with the stop's address line, its maps
+ * link and its picture beside it; the reporter in the small print (`memberByName`, no ping).
+ * Everything a member or a feed wrote through `plainNoLinks`.
  */
 export function gruntMessage(view: GruntView, goneAt: number): V2Message {
   const catches = catchWords(view.catches);
@@ -132,9 +118,8 @@ export function gruntMessage(view: GruntView, goneAt: number): V2Message {
     v2: true,
     components: [
       container(ROCKET_COLOUR, [
-        textDisplay(head),
+        view.picture === undefined ? textDisplay(head) : section(head, thumbnail(view.picture)),
         picture === undefined ? textDisplay(where) : section(where, thumbnail(picture)),
-        ...catchGallery(view.catches),
         textDisplay(`-# Reported by ${memberByName(view.reporter)} · /rocket reports one`),
       ]),
     ],
@@ -288,15 +273,22 @@ export function rocketDmSentence(view: {
 /**
  * Team GO Rocket in brief, for a direct message (`notifyDm`): what can be caught, the stop with
  * its address line, and when the report goes (a grunt) or until when it stands (a hideout), with
- * the first catch's picture and Rocket's colour.
+ * its picture by the rule (plan 8R-6, `rocketPicture` of who, `key`: the encounter picture while
+ * the catch is open, the Pokémon of one, a leader's or Giovanni's portrait) and Rocket's colour.
  */
-export function rocketDmBrief(view: {
-  catches: readonly RocketCatch[];
-  stop: Pick<ReportedStop, 'name' | 'address'>;
-  /** A grunt: when its report goes; a hideout: until when, as a sentence ends it. */
-  ends: { goneAt: number } | { until: string };
-}): { accent: number; picture?: string; lines: string[] } {
-  const picture = view.catches.find((one) => one.image !== null)?.image ?? undefined;
+export function rocketDmBrief(
+  view: {
+    /** Who it is of (`rocketKey`). */
+    key: string;
+    catches: readonly RocketCatch[];
+    stop: Pick<ReportedStop, 'name' | 'address'>;
+    /** A grunt: when its report goes; a hideout: until when, as a sentence ends it. */
+    ends: { goneAt: number } | { until: string };
+  },
+  lookup: PictureLookup = AS_FED,
+): { accent: number; picture?: string; lines: string[] } {
+  const shown = rocketPicture(view.key, view.catches);
+  const picture = shown === undefined ? undefined : lookup(shown.source);
   const catches = catchWords(view.catches);
   const ends =
     'goneAt' in view.ends
diff --git a/src/services/grunt-messages.test.ts b/src/services/grunt-messages.test.ts
index c8a4654abb290ad340cf03c1f43c8619b6725af5..c23dfcb08c4f96593914f3219b4536a80ec5cd6e 100644
--- a/src/services/grunt-messages.test.ts
+++ b/src/services/grunt-messages.test.ts
@@ -6,9 +6,10 @@ import {
 } from '../../test/support/fake-gateway.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { heldCall, type HeldCall } from '../../test/support/held-call.js';
-import { textOf } from '../../test/support/messages.js';
+import { galleryOf, textOf, thumbnailBeside, thumbnailsOf } from '../../test/support/messages.js';
 import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
 import {
+  MAGIKARP,
   magikarpLineup,
   MUDKIP,
   REPORT_NOW,
@@ -16,8 +17,10 @@ import {
 } from '../../test/support/stop-report-cases.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { watchForTest } from '../../test/support/timers.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 import type { RocketReport, StopReport } from '../domain/stops/report.js';
 import { GIVE_UP_MS, GruntMessageService } from './grunt-messages.js';
+import type { PictureMaker } from './stop-pictures.js';
 import type { StopReportListener } from './stop-reports.js';
 
 const HALF_HOUR = 30 * 60_000;
@@ -29,7 +32,7 @@ const grunt = (id: number, overrides: Partial<Omit<RocketReport, 'id'>> = {}): R
 });
 
 /** A service over a store and the fake gateway; `again()` is the service of the next process. */
-function messagesWith() {
+function messagesWith(pictures?: PictureMaker) {
   const gateway = new FakePartyGateway();
   const store = new MemoryGruntMessages();
   const clock = { now: REPORT_NOW };
@@ -77,6 +80,7 @@ function messagesWith() {
       },
       store,
       reports: { listen: (listener) => listeners.push(listener) },
+      ...(pictures ? { pictures } : {}),
       log,
       now: () => clock.now,
       setTimer: (run, ms) => {
@@ -265,6 +269,52 @@ describe('GruntMessageService', () => {
     );
   });
 
+  it('shows one picture beside the heading, made before it is posted, and a refine’s new one (plan 8R-6)', async () => {
+    const prepared: { sources: string[]; sent: number }[] = [];
+    const looked = (source: string) =>
+      `https://map.example.test/pictures/${String(source.length)}.png`;
+    const held: { sent: () => number } = { sent: () => -1 };
+    const made = messagesWith({
+      prepare: (sources) => {
+        prepared.push({ sources: [...sources], sent: held.sent() });
+        return Promise.resolve();
+      },
+      url: looked,
+    });
+    held.sent = () => made.gateway.messagesIn(WEST_CHANNEL).length;
+    // Not sure which: two lineups' catches, the encounter picture.
+    const open = grunt(1, { rocket: { name: 'Water-type grunt', catches: [MUDKIP, MAGIKARP] } });
+    await made.messages.post(open, [WEST_CHANNEL]);
+    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(thumbnailBeside(posted?.message, '### Water-type grunt')).toBe(
+      looked(ENCOUNTER_PICTURE),
+    );
+    expect(galleryOf(posted?.message)).toEqual([]);
+    // Narrowed to a lineup of one catch: that Pokémon.
+    await made.messages.refine({ ...magikarpLineup(), id: 1 });
+    const [edited] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(thumbnailBeside(edited?.message, '### Water-type grunt')).toBe(
+      looked(MAGIKARP.image ?? ''),
+    );
+    expect(prepared).toEqual([
+      { sources: [ENCOUNTER_PICTURE], sent: 0 },
+      { sources: [MAGIKARP.image], sent: 1 },
+    ]);
+  });
+
+  it('sends a message Discord refused for its pictures once more without the heading’s picture too (plan 8R-6)', async () => {
+    const made = messagesWith({
+      prepare: () => Promise.resolve(),
+      url: (source) => `https://map.example.test/pictures/${String(source.length)}.png`,
+    });
+    made.gateway.rejectThumbnails = true;
+    const open = grunt(1, { rocket: { name: 'Water-type grunt', catches: [MUDKIP, MAGIKARP] } });
+    await made.messages.post(open, [WEST_CHANNEL]);
+    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(textOf(posted?.message)).toContain('### Water-type grunt');
+    expect(thumbnailsOf(posted?.message)).toEqual([]);
+  });
+
   describe('one report’s posting and refines in turn (reviews R1, R2, R4)', () => {
     /** The other lineup, by Ash, a minute after Misty's Magikarp lineup. */
     const mudkips: RocketReport = {
diff --git a/src/services/grunt-messages.ts b/src/services/grunt-messages.ts
index 01dc9394a7ff01102838681cec8a427f8ed06f8d..4b4a05f0cabb1a956aa1dcae9f23d6f6248e384e 100644
--- a/src/services/grunt-messages.ts
+++ b/src/services/grunt-messages.ts
@@ -6,10 +6,12 @@ import {
   type OutgoingMessage,
   type PartyGateway,
 } from '../discord/party-gateway.js';
+import { AS_FED, rocketPicture, type PictureLookup } from '../domain/stops/pictures.js';
 import { isRocketReport, type RocketReport, type StopReport } from '../domain/stops/report.js';
 import type { Logger } from '../log.js';
 import { gruntMessage, gruntTextMessage, type GruntView } from '../render/rocket.js';
 import { KeyedLock } from './keyed-lock.js';
+import type { PictureMaker } from './stop-pictures.js';
 import { isHideoutReport, type StopReportListener } from './stop-reports.js';
 
 /** A grunt's message in a region channel. */
@@ -51,13 +53,23 @@ const ENDED_KEPT = 1_000;
 /** How a grunt's message was sent: components v2, or plain text where the bot may not embed. */
 type MessageKind = 'v2' | 'text';
 
-/** What a grunt's message shows of its report: the type's name, never a lineup's gender. */
-function viewOf(report: RocketReport): GruntView {
+/** The source of a grunt's one picture by the rule (plan 8R-6, `rocketPicture`), if any. */
+function pictureSource(report: RocketReport): string | undefined {
+  return rocketPicture(report.subjectKey, report.rocket.catches)?.source;
+}
+
+/**
+ * What a grunt's message shows of its report: the type's name, never a lineup's gender; its one
+ * picture by the rule (plan 8R-6), as `picture` names it.
+ */
+function viewOf(report: RocketReport, picture: PictureLookup): GruntView {
+  const source = pictureSource(report);
   return {
     name: report.rocket.name,
     catches: report.rocket.catches,
     stop: report.stop,
     reporter: report.reporter,
+    picture: source === undefined ? undefined : picture(source),
   };
 }
 
@@ -67,6 +79,7 @@ function withoutPictures(view: GruntView): GruntView {
     ...view,
     catches: view.catches.map((one) => ({ ...one, image: null })),
     stop: { ...view.stop, image: null },
+    picture: undefined,
   };
 }
 
@@ -87,6 +100,11 @@ export interface GruntMessageServiceOptions {
    * `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
    */
   setTimer?: (run: () => void, ms: number) => () => void;
+  /**
+   * The square pictures (plan 8R-6, `StopPictures`): made before a grunt is posted or edited,
+   * and named by their address. Without it the message names the feed's.
+   */
+  pictures?: PictureMaker;
 }
 
 /**
@@ -166,7 +184,7 @@ export class GruntMessageService {
     channelIds: readonly string[],
   ): Promise<PostedGrunt[]> {
     const posted: PostedGrunt[] = [];
-    const view = viewOf(report);
+    const view = await this.viewWithPicture(report);
     this.shown.set(report.id, Math.max(this.shown.get(report.id) ?? 0, report.madeAt));
     for (const channelId of channelIds) {
       // Ended meanwhile (replaced, taken back): nothing more of it is sent (fix F3).
@@ -229,7 +247,8 @@ export class GruntMessageService {
       return { standing: messages, complete: false };
     }
     this.shown.set(report.id, report.madeAt);
-    const view = viewOf(report);
+    // A narrowed grunt takes the picture its new catches give (design Q9).
+    const view = await this.viewWithPicture(report);
     const standing: PostedGrunt[] = [];
     // Ended meanwhile (replaced, taken back): its messages go, nothing more is edited, retimed or
     // kept; also where it ended while an edit was on its way (review R4). At shutdown nothing
@@ -272,6 +291,14 @@ export class GruntMessageService {
     return { standing, complete };
   }
 
+  /** A report's view, its picture made first (plan 8R-6); `prepare` never rejects. */
+  private async viewWithPicture(report: RocketReport): Promise<GruntView> {
+    const { pictures } = this.options;
+    const source = pictureSource(report);
+    if (pictures && source !== undefined) await pictures.prepare([source]);
+    return viewOf(report, pictures ? (one) => pictures.url(one) : AS_FED);
+  }
+
   /** Deletes a message now; one whose delete fails is tried once more a minute later (fix A3). */
   private removeNow(channelId: string, messageId: string): void {
     this.track(
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index 6cbfc871135b9a6f7dea7c72fe22ac2c5d15b373..a6376ca6246e4a5654a408c1e44ad49818f5ed21 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -1,7 +1,13 @@
 import { describe, expect, it, vi } from 'vitest';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
-import { dmBrief, dmReasons, dmSentence, linksOf } from '../../test/support/messages.js';
+import {
+  dmBrief,
+  dmReasons,
+  dmSentence,
+  linksOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { pageTask, researchTasksOfPage } from '../../test/support/research.js';
@@ -14,6 +20,7 @@ import { watchEachTest } from '../../test/support/timers.js';
 import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
 import type { ResearchTask } from '../domain/research/task.js';
 import { rewardHash, taskVersions } from '../domain/research/versions.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 import type { ReportedStop } from '../domain/stops/report.js';
 import { postLink } from '../render/notify-dm.js';
 import type { NotifyServiceOptions } from './notify-service.js';
@@ -261,6 +268,46 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
       expect(dmBrief(made.dms.to(CAROL)[0])[0]).toBe('**Rewards** Gible');
     });
 
+    it('shows the encounter picture on a "one of" DM and the Pokémon on its confirmation, made before they go (plan 8R-6)', async () => {
+      const prepared: { sources: string[]; sent: number }[] = [];
+      const looked = (source: string) =>
+        `https://map.example.test/pictures/${String(source.length)}.png`;
+      const held: { sent: () => number } = { sent: () => -1 };
+      const made = await researchWith({
+        pictures: {
+          prepare: (sources) => {
+            prepared.push({ sources: [...sources], sent: held.sent() });
+            return Promise.resolve();
+          },
+          url: looked,
+        },
+      });
+      held.sent = () => made.dms.to(ALICE).length;
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1)]);
+      await made.reportVersion(GIBLE, [west(1)], BOB_);
+      const [oneOf, confirmation] = made.dms.to(ALICE);
+      const gible = GIBLE.research.rewards[0]?.image ?? '';
+      expect(thumbnailOf(oneOf)).toBe(looked(ENCOUNTER_PICTURE));
+      expect(dmSentence(confirmation)).toBe(confirmed('**Yellow Mural 1**'));
+      expect(thumbnailOf(confirmation)).toBe(looked(gible));
+      expect(prepared).toEqual([
+        { sources: [ENCOUNTER_PICTURE], sent: 0 },
+        { sources: [gible], sent: 1 },
+      ]);
+    });
+
+    it('shows no picture on a DM whose picture is gone at its source (plan 8R-6)', async () => {
+      const made = await researchWith({
+        pictures: { prepare: () => Promise.resolve(), url: () => undefined },
+      });
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1)]);
+      const [oneOf] = made.dms.to(ALICE);
+      expect(dmSentence(oneOf)).toContain('Field research has been reported');
+      expect(thumbnailOf(oneOf)).toBeUndefined();
+    });
+
     it('confirms Gible after Beldum to whoever was told of the "one of" there (R5)', async () => {
       const made = await researchWith();
       await made.want(ALICE, WANT_GIBLE);
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index f581e8a844388b9456c60e821ffbe2e017ec04ce..94c237b8a129a3ab91171c8f83947d497247bfd1 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -7,6 +7,7 @@ import {
   dmSentence,
   linksOf,
   textOf,
+  thumbnailOf,
 } from '../../test/support/messages.js';
 import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
@@ -18,6 +19,8 @@ import { watchEachTest } from '../../test/support/timers.js';
 import type { TargetWant } from '../domain/notify/target-wants.js';
 import { lineupChoice, type RocketLineupChoice } from '../domain/rocket/lineups.js';
 import { pokemonTarget } from '../domain/pogo/notification-target.js';
+import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 import type { ReportedStop } from '../domain/stops/report.js';
 import { postLink } from '../render/notify-dm.js';
 import { DM_PRIORITY } from './dm-sender.js';
@@ -126,6 +129,33 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
     );
   });
 
+  it('shows the encounter picture for a grunt whose catch is open and a leader’s portrait, made before the DMs go (plan 8R-6)', async () => {
+    const prepared: { sources: string[]; sent: number }[] = [];
+    const looked = (source: string) =>
+      `https://map.example.test/pictures/${String(source.length)}.png`;
+    const held: { sent: () => number } = { sent: () => -1 };
+    const made = await rocketWith({
+      pictures: {
+        prepare: (sources) => {
+          prepared.push({ sources: [...sources], sent: held.sent() });
+          return Promise.resolve();
+        },
+        url: looked,
+      },
+    });
+    held.sent = () => made.dms.to(ALICE).length;
+    await made.want(ALICE, rocketWant('grunt:water'), rocketWant('leader:arlo'));
+    await made.report('grunt:water');
+    await made.report('leader:arlo', west(2));
+    const [grunt, arlo] = made.dms.to(ALICE);
+    expect(thumbnailOf(grunt)).toBe(looked(ENCOUNTER_PICTURE));
+    expect(thumbnailOf(arlo)).toBe(looked(LEADER_PORTRAITS.arlo));
+    expect(prepared).toEqual([
+      { sources: [ENCOUNTER_PICTURE], sent: 0 },
+      { sources: [LEADER_PORTRAITS.arlo], sent: 1 },
+    ]);
+  });
+
   it('tells a member of a grunt type at most once an hour', async () => {
     const made = await rocketWith();
     await made.want(ALICE, rocketWant('grunt:water'));
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 235ed8013eb6e4470d0ee114bacdac8462bf055b..cac81326239ae494382b70f06f3f38680777de11 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -100,9 +100,11 @@ import type { RaidBossProvider } from './raid-boss-service.js';
 import { regionsAtPoint, type RegionProvider } from './region-directory.js';
 import type { SpawnNews } from './spawn-service.js';
 import { typeKeyOf } from '../domain/rocket/lineups.js';
+import type { PictureMaker } from './stop-pictures.js';
 import { isHideoutReport, type ResearchNews } from './stop-reports.js';
 import type { RocketNews } from './rocket-reports.js';
 import { gruntHourNote, rocketDmBrief, rocketDmSentence } from '../render/rocket.js';
+import { researchPicture, rocketPicture, type PictureLookup } from '../domain/stops/pictures.js';
 import type { StopReport } from '../domain/stops/report.js';
 import { isOneOf, researchSubjectOf, taskOfSubject } from '../domain/research/reports.js';
 import type { TaskReward } from '../domain/research/task.js';
@@ -263,6 +265,11 @@ export interface NotifyServiceOptions {
    * Without it, it names every stop it was reported at.
    */
   stopReports?: { kept(serverId: string, id: number): Promise<StopReport | undefined> };
+  /**
+   * The square pictures of the reports at stops (plan 8R-6, `StopPictures`): made before a
+   * research or Rocket DM goes, and named by their address. Without it a DM names the feed's.
+   */
+  pictures?: PictureMaker;
   gyms: { get(id: number): PostGym | undefined };
   gameData: GameDataProvider;
   raidBosses: Pick<RaidBossProvider, 'bosses'>;
@@ -410,6 +417,12 @@ export class NotifyService implements PartyNotifier {
    */
   private readonly rocketTold = new BoundedMap<string, true>(RESEARCH_TOLD_KEPT);
   private readonly lines = new KeyedLock<string>();
+  /**
+   * The address of a picture of a stop's DM (plan 8R-6): `StopPictures.url` (none where the
+   * source is gone), or the feed's without it.
+   */
+  private readonly pictureLookup: PictureLookup = (source) =>
+    this.options.pictures ? this.options.pictures.url(source) : source;
   private readonly background = new Set<Promise<void>>();
   private readonly snowflakes = new Map<number, string>();
   /**
@@ -853,8 +866,17 @@ export class NotifyService implements PartyNotifier {
    * DM; each channel's DM then names that channel's stops.
    */
   private async researchEvents(news: ResearchNews, reportedAt: number): Promise<Announcement[]> {
-    const { regions, guilds, members, targetWants, gameData, researchPosts, stopReports, log } =
-      this.options;
+    const {
+      regions,
+      guilds,
+      members,
+      targetWants,
+      gameData,
+      researchPosts,
+      stopReports,
+      pictures,
+      log,
+    } = this.options;
     const [first] = news.reports;
     if (!first || !targetWants) return [];
     const { research, subjectKey } = first;
@@ -976,6 +998,9 @@ export class NotifyService implements PartyNotifier {
               });
           }
           const ids = [...wanting.keys()].filter((id) => untold(id).length > 0);
+          // The DM's picture made first (plan 8R-6): a reward's own, "one of"'s the encounter's.
+          const picture = researchPicture(research.rewards);
+          if (ids.length > 0 && picture) await pictures?.prepare([picture.source]);
           viewing = await viewersNow(
             guildId,
             [...wanting.keys()].filter((id) => inAny.some((report) => isNews(id, report))),
@@ -1003,7 +1028,7 @@ export class NotifyService implements PartyNotifier {
             return notifyDm(
               {
                 sentence: researchConfirmSentence({ stops, rewards: research.rewards }),
-                brief: researchConfirmBrief({ research, until }),
+                brief: researchConfirmBrief({ research, until }, this.pictureLookup),
                 links,
               },
               shown,
@@ -1026,7 +1051,7 @@ export class NotifyService implements PartyNotifier {
                 regionChannelId: channelId,
                 reporter: news.reporter,
               }),
-              brief: researchDmBrief({ research: { rewards }, stops, until }),
+              brief: researchDmBrief({ research: { rewards }, stops, until }, this.pictureLookup),
               links,
             },
             shown,
@@ -1063,7 +1088,7 @@ export class NotifyService implements PartyNotifier {
   }
 
   private announceRocket(news: RocketNews): void {
-    const { targetWants, wants, gameData, researchPosts, log, settings } = this.options;
+    const { targetWants, wants, gameData, researchPosts, pictures, log, settings } = this.options;
     const { report } = news;
     const hideout = isHideoutReport(report);
     const named = report.subjectKey.startsWith('leader:') || report.subjectKey === 'giovanni';
@@ -1115,6 +1140,9 @@ export class NotifyService implements PartyNotifier {
             }
           }
           const ids = [...new Set([...targeted.keys(), ...shadow.keys()])];
+          // The DM's picture made first (plan 8R-6): the encounter's, a Pokémon's or a portrait.
+          const picture = rocketPicture(report.subjectKey, report.rocket.catches);
+          if (ids.length > 0 && picture) await pictures?.prepare([picture.source]);
           if (hideout && ids.length > 0 && researchPosts) {
             messageId = await researchPosts
               .messageOf(channelId, report.subjectKey)
@@ -1155,13 +1183,17 @@ export class NotifyService implements PartyNotifier {
                 regionChannelId: channelId,
                 reporter: report.reporter,
               }),
-              brief: rocketDmBrief({
-                catches: report.rocket.catches,
-                stop: report.stop,
-                ends: hideout
-                  ? { until: periodEndWords(report.endsAt, eventAt, settings.timezone) }
-                  : { goneAt: report.endsAt },
-              }),
+              brief: rocketDmBrief(
+                {
+                  key: report.subjectKey,
+                  catches: report.rocket.catches,
+                  stop: report.stop,
+                  ends: hideout
+                    ? { until: periodEndWords(report.endsAt, eventAt, settings.timezone) }
+                    : { goneAt: report.endsAt },
+                },
+                this.pictureLookup,
+              ),
               links:
                 messageId === undefined
                   ? []
````

### Task 5: 8R-6 task 5: Portraits on the map

Prototype commit: `bc337a5f9c20436c51dc10cff249e512e087a385`

A hideout's picture in GET /api/stop-reports is the pinned post's, by the
rule: a leader's or Giovanni's portrait, a decoy's one catch or the
encounter picture, only from a host the page may load. The encounter
picture's origin is named in pictureOrigins (raw.githubusercontent.com, the
megas' portraits' host already, so the policy itself is unchanged).

**Files:**

```
 src/domain/web/stop-report-data.ts      |  5 +++--
 src/domain/web/stop-report-view.test.ts | 57 ++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/domain/web/stop-report-view.ts      | 18 ++++++++++++++++-
 src/web/headers.test.ts                 |  6 ++++++
 src/web/headers.ts                      | 13 ++++++++----
 src/web/server.ts                       |  9 ++++++---
 src/web/stop-reports.test.ts            | 19 ++++++++++++++++++
 src/web/stop-routes.ts                  |  1 +
 test/support/web.ts                     | 13 +++++++++---
 9 files changed, 127 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/stop-report-view.test.ts src/web/headers.test.ts src/web/stop-reports.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bc337a5f9c20436c51dc10cff249e512e087a385 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 5: Portraits on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index 69c649138e702ae6d6e9cfc4b0bcb0a02c5d58b3..2a0706fbb0097651b84871b096c1a355aefec5e0 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -95,8 +95,9 @@ export interface MapGrunt extends MapStopReportBase {
 
 /**
  * A hideout reported at a stop for the day (a leader, Giovanni, the decoy): who (`leader:arlo`,
- * `giovanni`, `decoy`), its name, the catches, and its picture (the first catch's, as the pinned
- * post shows it beside the hideout).
+ * `giovanni`, `decoy`), its name, the catches, and its picture as the pinned post shows it beside
+ * the hideout (plan 8R-6: a leader's or Giovanni's portrait, a decoy's one catch or the encounter
+ * picture; only from `pictureOrigins`).
  */
 export interface MapHideout extends MapStopReportBase {
   who: string;
diff --git a/src/domain/web/stop-report-view.test.ts b/src/domain/web/stop-report-view.test.ts
index a164b54a30677c8b97d3a7baaafc8f5b1a2228cd..d6286a9a52a9585b6147698e2cae8ee71e2316f5 100644
--- a/src/domain/web/stop-report-view.test.ts
+++ b/src/domain/web/stop-report-view.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import {
   DRATINI,
+  MAGIKARP,
   magikarpLineup,
   MUDKIP,
   REPORT_NOW,
@@ -9,6 +10,9 @@ import {
   researchReport,
   rocketReport,
 } from '../../../test/support/stop-report-cases.js';
+import { LEADER_PORTRAITS } from '../rocket/portraits.js';
+import type { RocketCatch } from '../rocket/lineups.js';
+import { ENCOUNTER_PICTURE } from '../stops/pictures.js';
 import type { StopReport } from '../stops/report.js';
 import { stopReportView, type StopReportViewInput } from './stop-report-view.js';
 
@@ -133,14 +137,65 @@ describe('stopReportView', () => {
       ],
     });
     expect(view.grunts[0]?.catches[0]?.image).toBe(MUDKIP.image);
+    // A leader's picture is the portrait, as the pinned post shows it (plan 8R-6).
     expect(view.hideouts[0]).toMatchObject({
       who: 'leader:arlo',
       name: 'Arlo',
-      picture: MUDKIP.image,
+      picture: LEADER_PORTRAITS.arlo,
       catches: [{ name: 'Mudkip', value: null }],
     });
   });
 
+  it('gives a decoy its one catch’s picture, and the encounter picture where it has several (plan 8R-6)', () => {
+    const decoy = (catches: RocketCatch[], id: number): StopReport => ({
+      ...rocketReport({
+        stop: reportedStop(id),
+        subjectKey: 'decoy',
+        rocket: { name: 'Decoy grunt', catches },
+        endsAt: REPORT_NOW + 12 * 3_600_000,
+      }),
+      id,
+    });
+    const reports = [decoy([MUDKIP], 8), decoy([MUDKIP, MAGIKARP], 9)];
+    const origins = [CDN, new URL(ENCOUNTER_PICTURE).origin];
+    expect(
+      stopReportView(input({ reports, pictureOrigins: origins })).hideouts.map(
+        (one) => one.picture,
+      ),
+    ).toEqual([MUDKIP.image, ENCOUNTER_PICTURE]);
+    // Only from a host the page may load.
+    expect(stopReportView(input({ reports })).hideouts.map((one) => one.picture)).toEqual([
+      MUDKIP.image,
+      undefined,
+    ]);
+  });
+
+  it('names a hideout’s picture as the post does: the square one Pine serves, none where it is gone (plan 8R-6)', () => {
+    const leader = (key: string, id: number): StopReport => ({
+      ...rocketReport({
+        stop: reportedStop(id),
+        subjectKey: key,
+        rocket: { name: key, catches: [MUDKIP] },
+        endsAt: REPORT_NOW + 12 * 3_600_000,
+      }),
+      id,
+    });
+    const pine = 'https://map.example.test';
+    const view = stopReportView(
+      input({
+        reports: [leader('leader:arlo', 8), leader('leader:cliff', 9)],
+        pictureOrigins: [CDN, pine],
+        picture: (source) =>
+          source === LEADER_PORTRAITS.cliff ? undefined : `${pine}/pictures/arlo.png`,
+      }),
+    );
+    expect(view.hideouts.map((one) => one.picture)).toEqual([
+      `${pine}/pictures/arlo.png`,
+      undefined,
+    ]);
+    expect(view.hideouts[1]).not.toHaveProperty('picture');
+  });
+
   it('names a grunt of one lineup by its first slot, the gender never (plan 8R-4L)', () => {
     const view = stopReportView(
       input({ reports: [{ ...magikarpLineup({ stop: reportedStop(4) }), id: 7 }] }),
diff --git a/src/domain/web/stop-report-view.ts b/src/domain/web/stop-report-view.ts
index 3412b5e3770cf60c2bf8833ad918ef17a9259e8e..2cfa020dae997118b0d74262888b13f6a746b1a8 100644
--- a/src/domain/web/stop-report-view.ts
+++ b/src/domain/web/stop-report-view.ts
@@ -9,6 +9,7 @@ import {
   type StopReport,
 } from '../stops/report.js';
 import type { ResearchPeriod } from '../time/research-periods.js';
+import { AS_FED, rocketPicture, type PictureLookup } from '../stops/pictures.js';
 import { allowedPicture } from './picture.js';
 import type {
   MapGrunt,
@@ -39,6 +40,12 @@ export interface StopReportViewInput {
   link(report: StopReport): string | undefined;
   /** The origins the page may load pictures from (`pictureOrigins`). */
   pictureOrigins: readonly string[];
+  /**
+   * The address of a hideout's picture as the pinned post names it (plan 8R-6,
+   * `StopPictures.url`: the square picture Pine serves, none where the source is gone); the
+   * source itself without it.
+   */
+  picture?: PictureLookup;
 }
 
 /** A coordinate to six decimals (about 10 cm), as the map's places are. */
@@ -139,9 +146,18 @@ function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
   };
 }
 
+/**
+ * A hideout as the map shows it; its picture as the pinned post's (plan 8R-6, `rocketPicture`): a
+ * leader's or Giovanni's portrait, a decoy's one catch or the encounter picture, named as the post
+ * names it (`picture`: none where it is gone), only from a host the page may load.
+ */
 function mapHideout(report: RocketReport, input: StopReportViewInput): MapHideout {
   const catches = report.rocket.catches.map((caught) => mapCatch(caught, input.pictureOrigins));
-  const picture = catches.find((caught) => caught.image !== undefined)?.image;
+  const source = rocketPicture(report.subjectKey, report.rocket.catches)?.source;
+  const picture = allowedPicture(
+    source === undefined ? undefined : (input.picture ?? AS_FED)(source),
+    input.pictureOrigins,
+  );
   return {
     ...base(report, input),
     who: report.subjectKey,
diff --git a/src/web/headers.test.ts b/src/web/headers.test.ts
index 02fbfc1df519f8b1164cc2a8333c4a7e54e53e90..5ee8b38d4a8e6e82181e0fb1fdec7cdc1266bdc1 100644
--- a/src/web/headers.test.ts
+++ b/src/web/headers.test.ts
@@ -1,6 +1,8 @@
 import { describe, expect, it } from 'vitest';
 import { MEGA_PORTRAIT_BASE, POKEMON_ICON_BASE } from '../domain/pogo/pokemon-icons.js';
 import { RAID_EGG_PICTURES_URL } from '../domain/pogo/raid-eggs.js';
+import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 import { contentSecurityPolicy, pictureOrigins, securityHeaders } from './headers.js';
 
 /** The directives of a policy, by name. */
@@ -52,6 +54,10 @@ describe('pictureOrigins', () => {
     ]);
     // The eggs no longer come from pogo_assets (plan 8D-F); the portraits share that host.
     expect(new URL(RAID_EGG_PICTURES_URL).origin).toBe(new URL(MEGA_PORTRAIT_BASE).origin);
+    // The stops' encounter picture may be loaded (plan 8R-6), and the leaders' portraits.
+    const origins = pictureOrigins('https://map.example.test');
+    expect(origins).toContain(new URL(ENCOUNTER_PICTURE).origin);
+    expect(origins).toContain(new URL(LEADER_PORTRAITS.cliff).origin);
   });
 });
 
diff --git a/src/web/headers.ts b/src/web/headers.ts
index 0004888db701842f94e8aa5727bf5a119a22ca0c..d678e9ddb565f5313e5574b49cf97971f67f542f 100644
--- a/src/web/headers.ts
+++ b/src/web/headers.ts
@@ -1,4 +1,5 @@
 import { MEGA_PORTRAIT_BASE, POKEMON_ICON_BASE } from '../domain/pogo/pokemon-icons.js';
+import { ENCOUNTER_PICTURE } from '../domain/stops/pictures.js';
 
 /** OpenStreetMap's standard tiles (one host since 2024; no subdomains). */
 export const OSM_TILES = 'https://tile.openstreetmap.org';
@@ -14,14 +15,18 @@ export interface PolicyOptions {
 
 /**
  * The origins the pictures of posts come from: the Pokémon icons (`pokemonPicture`; the raid
- * boss feed's pictures are on the same CDN), the megas' portraits (`MEGA_PORTRAIT_BASE`) and the
- * raid eggs, which Pine serves itself
- * (`eggPictures`, plan 8D-F: `publicUrl`), each once.
+ * boss feed's pictures, the stops' rewards, catches and leaders' portraits are on the same CDN),
+ * the megas' portraits (`MEGA_PORTRAIT_BASE`), the game's encounter picture of the stops (plan
+ * 8R-6, `ENCOUNTER_PICTURE`; the same host today) and the raid eggs and the stops' square
+ * pictures, which Pine serves itself (`eggPictures`, plan 8D-F, and `StopPictures`: `publicUrl`),
+ * each once.
  */
 export function pictureOrigins(publicUrl: string): string[] {
   return [
     ...new Set(
-      [POKEMON_ICON_BASE, MEGA_PORTRAIT_BASE, publicUrl].map((url) => new URL(url).origin),
+      [POKEMON_ICON_BASE, MEGA_PORTRAIT_BASE, ENCOUNTER_PICTURE, publicUrl].map(
+        (url) => new URL(url).origin,
+      ),
     ),
   ];
 }
diff --git a/src/web/server.ts b/src/web/server.ts
index c1f72a7742c6c2ed74a86d57780a1e0df288e3d9..fe7cb0424167ad2335e7920c78e3e570661c9e1f 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -8,7 +8,7 @@ import type { MemberDirectory } from '../discord/member-directory.js';
 import { EGG_PICTURE_NAMES } from '../domain/pogo/raid-eggs.js';
 import type { Logger } from '../log.js';
 import { EGG_FOLDER, EGG_PATH } from '../services/egg-pictures.js';
-import { PICTURE_PATH } from '../services/stop-pictures.js';
+import { PICTURE_PATH, type StopPictures } from '../services/stop-pictures.js';
 import { sendFailure, shortPage } from './answers.js';
 import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
@@ -70,8 +70,11 @@ export interface WebDeps {
   stops: StopWebDeps;
   /** The Wayspot export tool and who may have it (plan 8W-P): `/userscript`. */
   tool: ToolWebDeps;
-  /** The square pictures of the reports at stops (plan 8R-6, `StopPictures`): `/pictures/`. */
-  pictures: { read(key: string): Promise<Buffer | undefined> };
+  /**
+   * The square pictures of the reports at stops (plan 8R-6, `StopPictures`): `/pictures/`, and
+   * the address of a hideout's picture on the map, as the pinned post names it.
+   */
+  pictures: Pick<StopPictures, 'read' | 'url'>;
   now: () => number;
   log: Logger;
 }
diff --git a/src/web/stop-reports.test.ts b/src/web/stop-reports.test.ts
index 123a12316c948ad093e277ee7f94beb170600049..e7ed48a56fc21650f505b9be8e5a3a1854c7ffc6 100644
--- a/src/web/stop-reports.test.ts
+++ b/src/web/stop-reports.test.ts
@@ -19,8 +19,10 @@ import { readTask } from '../commands/research/research-input.js';
 import { reportResearchAs, stopsByKey } from '../commands/research/research-report.js';
 import { reportRocketAs } from '../commands/rocket/rocket-report.js';
 import { DISCORD_CHANNEL } from '../render/research.js';
+import { LEADER_PORTRAITS } from '../domain/rocket/portraits.js';
 import type { StopReportsView } from '../domain/web/stop-report-data.js';
 import { StopPostService } from '../services/stop-posts.js';
+import type { WebDeps } from './server.js';
 import { STOP_REPORTS_PER_MINUTE, type StopWebDeps } from './stop-routes.js';
 
 const URL = `/s/${FAKE_GUILD_ID}/api/stop-reports`;
@@ -36,6 +38,7 @@ async function setup(
   postsOf: (made: Awaited<ReturnType<typeof stopReportingWith>>) => StopWebDeps['posts'] = () => ({
     linkOf: (channelId: string, key: string) => `${channelId.slice(-2)}${key.length}`,
   }),
+  pictures?: WebDeps['pictures'],
 ) {
   const made = await stopReportingWith();
   const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
@@ -44,6 +47,7 @@ async function setup(
     members,
     parties: partyWebWith(made.made, { acting: new FakeActingMembers().add(ALICE, 'Alice') }),
     stops: stopWebWith(made.ctx, { posts, grunts: made.grunts }),
+    ...(pictures ? { pictures } : {}),
   });
   web.clock.now = STOP_NOON;
   const research = async (keys: string[], reporter = ALICE_AS) =>
@@ -122,6 +126,21 @@ describe('the reports at stops on the map', () => {
     ]);
   });
 
+  it('names a hideout’s picture as the pinned post does, none where it is gone (plan 8R-6)', async () => {
+    const made = await setup(undefined, {
+      read: () => Promise.resolve(undefined),
+      url: (source) => (source === LEADER_PORTRAITS.arlo ? undefined : source),
+    });
+    web = made.web;
+    await made.rocket('leader:arlo', wayspotId(1));
+    await made.rocket('leader:cliff', wayspotId(2));
+    const view = (await made.ask()).json<StopReportsView>();
+    expect(view.hideouts.map((one) => [one.who, one.picture])).toEqual([
+      ['leader:arlo', undefined],
+      ['leader:cliff', LEADER_PORTRAITS.cliff],
+    ]);
+  });
+
   it('leaves out what lies only in a region whose forum keeps the member out', async () => {
     const made = await setup();
     web = made.web;
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index c9bbf80142235602bdc72e92231364fd6b6008eb..07aadbc11417bcd65b7f2f32baa06148dea75b85 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -188,6 +188,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       readOnly: viewer.readOnly,
       link,
       pictureOrigins: deps.pictureOrigins,
+      picture: (source) => deps.pictures.url(source),
     });
   };
 
diff --git a/test/support/web.ts b/test/support/web.ts
index acf831ef97e757dda2354b77d87f9ea1d67a6892..81397cfa60b631a8946dbece86ec855477876500 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -527,8 +527,11 @@ export interface WebTestOptions {
   stops?: StopWebDeps;
   /** The Wayspot export tool and who may have it (`toolWebWith`); no tool file by default. */
   tool?: ToolWebDeps;
-  /** The square pictures of the stops (plan 8R-6); none by default. */
-  pictures?: WebDeps['pictures'];
+  /**
+   * The square pictures of the stops (plan 8R-6): none made by default, and every source named
+   * as it is.
+   */
+  pictures?: Partial<WebDeps['pictures']>;
 }
 
 /**
@@ -702,7 +705,11 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     maxes: options.maxes ?? NO_MAXES,
     stops: options.stops ?? NO_STOPS,
     tool: options.tool ?? NO_TOOL,
-    pictures: options.pictures ?? { read: () => Promise.resolve(undefined) },
+    pictures: {
+      read: () => Promise.resolve(undefined),
+      url: (source) => source,
+      ...options.pictures,
+    },
     now: () => clock.now,
     log,
   });
````

### Task 6: 8R-6 task 6: Small fixes from the 8R staging

Prototype commit: `24a2868a0886ef312134024adcd55074ffe82b48`

1. A DM's reason for an item or Mega Energy reads "Rare Candy · Research",
   "Charizard Mega Energy · Research", the shape of "Gible · Research"
   (targetReasonLabel).
2. No answer says "pinned" any more: In the post "Today's Stops" of #...
3. A grunt refined in place is answered "Changed in #...", not "Posted in"
   (RocketReported.changed, RocketAnswerView.changed).
4. /want ranks a whole-word match before a near one: "rocket" gives Team GO
   Rocket before Rowlet (wholeWordsBeforeGuesses; the order of the Pokemon,
   tiers and IVs among themselves unchanged).
5. The task search finds the "one of" choices by "one of".

Matt (2026-10-23): the post "Today at the stops" is "Today's Stops"
everywhere: its heading and continued line, every answer, the summary's
link, the help, the permission check's words, comments and tests (the
migration's comment left as it was).

**Files:**

```
 docs/guides/migrating-a-legacy-instance.md    |  6 +++---
 docs/guides/new-instance.md                   |  4 ++--
 src/app-context.ts                            |  2 +-
 src/app.ts                                    |  2 +-
 src/commands/choices.ts                       | 29 +++++++++++++++++++++++++++++
 src/commands/notifications/wants.test.ts      | 28 ++++++++++++++++++++++++++++
 src/commands/notifications/wants.ts           | 13 +++++++++++--
 src/commands/research/research-input.ts       |  5 ++++-
 src/commands/research/research-report.test.ts |  2 +-
 src/commands/research/research.test.ts        | 21 ++++++++++++++++++++-
 src/commands/research/research.ts             |  4 ++--
 src/commands/rocket/rocket-report.ts          |  1 +
 src/commands/rocket/rocket.test.ts            |  6 +++++-
 src/commands/rocket/rocket.ts                 |  2 +-
 src/db/repositories/stop-post-repository.ts   |  2 +-
 src/discord/party-gateway.ts                  |  2 +-
 src/domain/pogo/want-boxes.test.ts            |  9 +++++++++
 src/domain/pogo/want-boxes.ts                 | 17 +++++++++++++++++
 src/domain/web/stop-report-data.ts            |  2 +-
 src/ops/cutover-check.test.ts                 |  2 +-
 src/ops/permissions.ts                        |  4 ++--
 src/render/research.test.ts                   |  6 ++----
 src/render/research.ts                        |  2 +-
 src/render/rocket.test.ts                     |  8 ++++++--
 src/render/rocket.ts                          |  7 +++++--
 src/render/stop-post.test.ts                  |  2 +-
 src/render/stop-post.ts                       |  9 +++------
 src/render/summary.test.ts                    |  6 +++---
 src/render/summary.ts                         |  8 +++-----
 src/services/notify-service.research.test.ts  |  7 +++++--
 src/services/notify-service.ts                |  6 +++---
 src/services/party-service.test.ts            |  2 +-
 src/services/party-service.ts                 |  2 +-
 src/services/rocket-reports.ts                |  8 ++++++--
 src/services/stop-posts.test.ts               |  4 ++--
 src/services/stop-posts.ts                    |  2 +-
 src/web/stop-report-post.test.ts              |  2 +-
 37 files changed, 185 insertions(+), 59 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/wants.test.ts src/commands/research/research-report.test.ts src/commands/research/research.test.ts src/commands/rocket/rocket.test.ts src/domain/pogo/want-boxes.test.ts src/ops/cutover-check.test.ts src/render/research.test.ts src/render/rocket.test.ts src/render/stop-post.test.ts src/render/summary.test.ts src/services/notify-service.research.test.ts src/services/party-service.test.ts src/services/stop-posts.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 24a2868a0886ef312134024adcd55074ffe82b48 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 6: Small fixes from the 8R staging`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 6f2d8a6e0d31b87ab47d26a3efa9858922d8723b..6fd1d02a092af9a7e6fd4794fc43e87e6d854e26 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -221,7 +221,7 @@ It reads the database and, with the bot's token, Discord's API (reading only; it
 - **application**: `DISCORD_APP_ID` must be the token's application. A `FAIL` names the right one.
 - **intents**: the settings ask for none, so this passes.
 - **emoji**: warns until you upload the game's icons as the application's emoji (below).
-- **servers**, **server …** and the region lines: whether the bot is in the database's server, and the permissions its role lacks in the server, in each region's channel and in the category where its forum will be. A missing required one is a `FAIL` that says what it is for; give the bot's role that permission in Server Settings → Roles (or fix the category's overwrites), and run the check again. In a region's forum the line names the permissions as the forum's settings do: Manage Posts (Manage Threads), without which the bot makes no post with its tags there, Create Posts (Send Messages), Send Messages in Posts. Pin Messages in a region's channel is optional: with it the bot pins the channel's post "Today at the stops" (field research reported there); without it the post stands unpinned, and the region's line warns. Give the bot's role Pin Messages in the region channels if you want the post pinned.
+- **servers**, **server …** and the region lines: whether the bot is in the database's server, and the permissions its role lacks in the server, in each region's channel and in the category where its forum will be. A missing required one is a `FAIL` that says what it is for; give the bot's role that permission in Server Settings → Roles (or fix the category's overwrites), and run the check again. In a region's forum the line names the permissions as the forum's settings do: Manage Posts (Manage Threads), without which the bot makes no post with its tags there, Create Posts (Send Messages), Send Messages in Posts. Pin Messages in a region's channel is optional: with it the bot pins the channel's post "Today’s Stops" (field research reported there); without it the post stands unpinned, and the region's line warns. Give the bot's role Pin Messages in the region channels if you want the post pinned.
 - **forums**: every region without a forum warns. That is expected: step 4.9 makes them.
 - **names**: channels, a category or a role the settings name that your server does not have. Fix `pine-settings.json` or the server.
 - **announcements**: whether the bot may post in the channels it announces in (bot updates, the moderators' channel, Unown sightings, the elite and remote raid channels).
@@ -279,7 +279,7 @@ They can take a little while to show up in Discord.
 
 ### 4.10 Check that it works
 
-- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a Power Spot (`/max`; the Power Spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the Power Spots first); a meetup (`/meetup`); field research (`/research report`, which the region's pinned post "Today at the stops" shows); Team GO Rocket (`/rocket report`: a grunt is a message in the region channel for half an hour, a leader, Giovanni or a decoy goes in the pinned post).
+- In a region channel: a raid (`/raid`), then join it with the buttons in its post; a max battle at a Power Spot (`/max`; the Power Spots come from `/gym import` of a Wayfarer export, and without it only a maps link works for `spot:`, as an "Unlisted power spot"); a train (`/train`; `kind:` for a train of Dynamax or Gigantamax battles, whose `/route add stop:` offers the Power Spots first); a meetup (`/meetup`); field research (`/research report`, which the region's pinned post "Today’s Stops" shows); Team GO Rocket (`/rocket report`: a grunt is a message in the region channel for half an hour, a leader, Giovanni or a decoy goes in the pinned post).
 - A direct message: set a want (`/want`) and have somebody else report that boss.
 - A screenshot of a raid posted with a mention of the bot (the bot itself, not a role of the same name).
 
@@ -335,7 +335,7 @@ The first only says what it would do, line by line: which rows it would add, and
 
 - **Screenshots** are read when they are posted with a mention of the bot, or attached to `/raid`. The mention must be of the bot itself (picked from the list Discord shows after `@`), not of a role of the same name. A screenshot dropped in a channel without either is not read (that would need Message Content).
 - **Settings and notifications** keep what members set before: wants, gym targets, mentions, auto-status, privacy, friend codes. They are changed through `/settings`, `/want` and `/target`. `/want` asks in a dialog what a Pokémon is wanted for (Raids, Dynamax, Gigantamax, Spawns, Research, Shadow), ticked as the member's wants are.
-- **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), the region's pinned post "Today at the stops" lists the day's tasks, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
+- **Field research** is new: `/research report` names a PokéStop's task (up to five stops at once), the region's pinned post "Today’s Stops" lists the day's tasks, and members who want a reward get a DM. Sponsored PokéStops, which Wayfarer does not list, are added by staff with `/pokestop add`.
 - **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in the pinned post until midnight. `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
 - **Unown**: members with the `unown` role get a want for Unown the first time they use the bot, instead of the role being pinged.
 - **The party history**: the bot keeps a history of ended raids, max battles, trains and meetups for statistics. It keeps a member's Discord id only if they opt in with `/settings history enabled:True`; without it they are counted, anonymously.
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 1ddb7198b0c7c0e533042d4fc7efb8e32920361d..d5f1842e330624aa95a4e9554c6f46bc77b5895e 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -31,7 +31,7 @@ In the [Discord Developer Portal](https://discord.com/developers/applications):
    - Manage Threads (archiving, locking, renaming and pinning posts, and the tags of a post; in a forum's own permissions Discord calls it **Manage Posts**, and without it there the bot makes no post at all and tells the member so)
    - Add Reactions and Use External Emojis (optional)
    - Manage Messages (optional: taking a screenshot away once it became a raid, and deleting a message the moderators delete from a report)
-   - Pin Messages (optional: pinning the post "Today at the stops" of a region channel; without it the post stands unpinned)
+   - Pin Messages (optional: pinning the post "Today’s Stops" of a region channel; without it the post stands unpinned)
 
    As a number for the link's `permissions=`, that is `2252092140285008`. `./pine cutover-check` (section 4) checks the bot's role against these.
 
@@ -173,7 +173,7 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of what is going on ("Going on now": its raids, max battles, trains and meetups). It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
-Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today at the stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
+Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a Power Spot: the Power Spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with Power Spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today’s Stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
 ## 8. Running it
 
diff --git a/src/app-context.ts b/src/app-context.ts
index 54440928d235da4122d33730e017f0313676c7d6..0ca49cf45ba6608de1277ac10ab954e810639730 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -96,7 +96,7 @@ export interface AppContext {
   /** Reports at stops (plan 8R-1): field research, in research periods. */
   readonly stopReports: StopReportService;
   /**
-   * The message of a region channel's pinned post "Today at the stops" that holds a subject, as
+   * The message of a region channel's pinned post "Today’s Stops" that holds a subject, as
    * last drawn (`StopPostService.linkOf`; plan 8R-5: "Already reported" links it); none in
    * rehearsal mode, which makes no posts.
    */
diff --git a/src/app.ts b/src/app.ts
index 98acb387c1a9a79ef3b1b80427197dfce6ef4f7e..d02b2b689037479a0344e804f2b1bc314e439f48 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1059,7 +1059,7 @@ export async function startApp(
     ),
   );
   log.info({ features }, 'optional features');
-  // The pinned posts "Today at the stops" (plan 8R-1), once Discord is there: those of a day
+  // The pinned posts "Today’s Stops" (plan 8R-1), once Discord is there: those of a day
   // that ended deleted, today's drawn anew. None in rehearsal mode (nothing is posted outside
   // party posts there; design 6).
   const stopPosts = rehearsal
diff --git a/src/commands/choices.ts b/src/commands/choices.ts
index 32b712c36dead95aba2899fad97258272936c227..694004efef8a783b508799d68b65575aeb3bb5cc 100644
--- a/src/commands/choices.ts
+++ b/src/commands/choices.ts
@@ -31,3 +31,32 @@ export function beginningFirst(text: string): (a: { name: string }, b: { name: s
   const begins = (name: string): boolean => name.toLowerCase().startsWith(text);
   return (a, b) => Number(!begins(a.name)) - Number(!begins(b.name)) || byName(a.name, b.name);
 }
+
+/**
+ * Two lists of choices as one (plan 8R-6, the 8R staging's finding 5): `first` in its order, and
+ * the choices of `more` whose name holds every word typed as a whole word moved up before the
+ * first of `first` that is only a near match (a guess: a typed word begins none of its name's
+ * words), the rest of `more` after. `rocket` gives Team GO Rocket before Rowlet; nothing
+ * changes for words only begun (`dra`), nor in the order of `first`.
+ */
+export function wholeWordsBeforeGuesses<T extends { name: string }>(
+  first: readonly T[],
+  more: readonly T[],
+  typed: string,
+): T[] {
+  const words = searchTokens(typed);
+  if (words.length === 0) return [...first, ...more];
+  const holds = (name: string): boolean => {
+    const shown = searchTokens(name);
+    return words.every((word) => shown.includes(word));
+  };
+  const begun = (name: string): boolean => {
+    const shown = searchTokens(name);
+    return words.every((word) => shown.some((one) => one.startsWith(word)));
+  };
+  const whole = more.filter((one) => holds(one.name));
+  const rest = more.filter((one) => !holds(one.name));
+  const at = first.findIndex((one) => !begun(one.name));
+  const cut = at < 0 ? first.length : at;
+  return [...first.slice(0, cut), ...whole, ...first.slice(cut), ...rest];
+}
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index d29c8006fcc538e2c1dc4010f0d4d017fce28015..2b606c43b6e009d9ebe5df38d916a0d336e4070a 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -1403,6 +1403,34 @@ describe('/want: Team GO Rocket (plan 8R-2)', () => {
     });
   });
 
+  it('ranks a whole-word match first: Team GO Rocket before Rowlet (plan 8R-6, the staging’s finding 5)', async () => {
+    const made = setup([], rocketChoicesOfFeed());
+    const offered = (await made.choices('want', 'rocket')).map((one) => one.name);
+    expect(offered[0]).toBe('Team GO Rocket (every grunt, leader and Giovanni)');
+    // Rowlet, a near match, still comes, after.
+    const rowlet = offered.findIndex((name) => name.startsWith('Rowlet'));
+    expect(rowlet).toBeGreaterThan(0);
+    // Words begun only rank as before: the Pokémon first.
+    const dra = (await made.choices('want', 'dra')).map((one) => one.name);
+    expect(dra[0]).not.toMatch(/grunt|Rocket/);
+  });
+
+  it('puts the Pokémon that begin with the words first, then a whole-word Rocket choice, then the guesses (plan 8R-6)', async () => {
+    const offered = (await setup([], rocketChoicesOfFeed()).choices('want', 'dark')).map(
+      (one) => one.name,
+    );
+    // Darkrai begins with "dark"; Arceus (every form) is a guess, by its Dark-Type form, and
+    // the guesses keep their order after it.
+    expect(offered).toEqual([
+      'Darkrai',
+      'Dark-type grunt',
+      'Arceus (every form)',
+      'Arceus (Dark-Type)',
+      'Silvally (every form)',
+      'Silvally (Type: Dark)',
+    ]);
+  });
+
   it('offers the lineups’ catches a text names before other Pokémon (design 9.9)', async () => {
     const without = (await setup().choices('want', 'grim')).map((one) => String(one.value));
     const made = setup([], rocketChoicesOfFeed());
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index 64405e0f7d105701a06f17ae79fd0468e55c459f..2aa7eac7e353afe6c19cdb141b2c8cb972e29dd3 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -47,7 +47,13 @@ import { parseStopArgs, stopArgs, type NotifyReason } from '../../domain/notify/
 import { renderMemberList } from '../../render/member-list.js';
 import { count, plain, truncate } from '../../render/text.js';
 import { memberListControls } from './list-controls.js';
-import { CHOICE_NAME, MAX_CHOICES, beginningFirst, type Choice } from '../choices.js';
+import {
+  CHOICE_NAME,
+  MAX_CHOICES,
+  beginningFirst,
+  wholeWordsBeforeGuesses,
+  type Choice,
+} from '../choices.js';
 import { removeAllQuestion } from './remove-all.js';
 import { NOTIFICATION_THROTTLE, notificationsEnabled } from './shared.js';
 import {
@@ -586,7 +592,10 @@ export const want: SimpleCommand = {
       0,
       MAX_CHOICES - Math.min(rewards.length, REWARD_ROOM),
     );
-    await interaction.respond([...others, ...rewards].slice(0, MAX_CHOICES));
+    // A whole-word match before a near one (plan 8R-6): `rocket` gives Team GO Rocket before Rowlet.
+    await interaction.respond(
+      wholeWordsBeforeGuesses(others, rewards, typed).slice(0, MAX_CHOICES),
+    );
   },
 };
 
diff --git a/src/commands/research/research-input.ts b/src/commands/research/research-input.ts
index 49e1286bbd2bda01cc5b426028655709ae52ba4a..01ae74834bc7434dbc9930c40ddb3f27128c9267 100644
--- a/src/commands/research/research-input.ts
+++ b/src/commands/research/research-input.ts
@@ -177,7 +177,10 @@ export function taskChoices(
       const names = version.rewards.map((reward) => reward.name);
       if (whole) {
         byText.push(versionChoice(task, version.label, version.value));
-      } else if (hasWords(`${task.text} ${names.join(' ')}`, words)) {
+      } else if (
+        // "One of" found by its own words too (plan 8R-6, the staging's finding 6).
+        hasWords(`${task.text} ${version.oneOf ? 'one of ' : ''}${names.join(' ')}`, words)
+      ) {
         // "One of" with the rewards typed first (R12).
         const label = version.oneOf
           ? oneOfLabel(
diff --git a/src/commands/research/research-report.test.ts b/src/commands/research/research-report.test.ts
index b1d949fb1720182274347fdcb93ab7ec0a28dd63..ef9aeefbb13cc2fb16d9a817fae586ed2beed151 100644
--- a/src/commands/research/research-report.test.ts
+++ b/src/commands/research/research-report.test.ts
@@ -112,7 +112,7 @@ describe('reportResearchAs', () => {
     ]);
     expect(reported.view).toMatchObject({ channels: [WEST_CHANNEL], until: 'until midnight' });
     expect(researchWords(reported.view, () => '#west').where).toBe(
-      'In the pinned post "Today at the stops" of #west, until midnight.',
+      'In the post "Today’s Stops" of #west, until midnight.',
     );
     expect(store.rows.size).toBe(2);
   });
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 512cbed7707364dd844effa5e75705e217bbd9ed..611ad8aa2c6c3363734f064868ca7633fcaadad1 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -182,7 +182,7 @@ describe('/research report', () => {
     );
     expect(said(answer)).toContain('- **Yellow Mural**\n- **Paititi Inti**');
     expect(said(answer)).toContain(
-      `-# In the pinned post "Today at the stops" of <#${WEST_CHANNEL}>, until midnight.`,
+      `-# In the post "Today’s Stops" of <#${WEST_CHANNEL}>, until midnight.`,
     );
     // Within 2 km and without the task: Little Bench, not Far Stop nor the power spot.
     const [menu] = selectsOf(asV2(answer));
@@ -393,6 +393,25 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
     ]);
   });
 
+  it('finds the "one of" choices by "one of" (plan 8R-6, the staging’s finding 6)', async () => {
+    const made = await setup();
+    const choices = (await made.typing('task', 'one of')).respond.mock.calls[0]?.[0] as Choices;
+    expect(choices.length).toBeGreaterThan(1);
+    for (const choice of choices) expect(choice.name).toContain(' · one of ');
+    expect(choices).toContainEqual({
+      name: 'Make 3 Excellent Throws in a row · one of Larvitar, Beldum, Gible',
+      value: THROWS.key,
+    });
+    const narrowed = (await made.typing('task', 'one of beldum excellent')).respond.mock
+      .calls[0]?.[0] as Choices;
+    expect(narrowed).toEqual([
+      {
+        name: 'Make 3 Excellent Throws in a row · one of Beldum, Larvitar, Gible',
+        value: THROWS.key,
+      },
+    ]);
+  });
+
   it('reads the version a choice, a key or a text with its reward names (R2)', () => {
     const { ctx } = createTestContext();
     const subject = (task: string, reward: string | null = null) =>
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 8be2b8d19692ad370f6bd13243b6e515ffce6439..44254df459cb1b2568c3fa07f9ae8fa579d7ce82 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -448,8 +448,8 @@ const reportResearch: SubcommandPart = {
       'from theirs (your region’s first), or paste a maps link to a stop. A report replaces ' +
       'your own at a stop today, and a "one of" by one of its Pokémon. Another member’s report ' +
       'is asked about first: tick the stops whose report you replace. The same report again, ' +
-      'or one that says less, is "Already reported". Nothing is posted: the pinned post "Today ' +
-      'at the stops" of the region shows every task of the day, and members who want a reward ' +
+      'or one that says less, is "Already reported". Nothing is posted: the post "Today’s ' +
+      'Stops" of the region shows every task of the day, and members who want a reward ' +
       'get a direct message. A task missing from the list can be typed in full, with its ' +
       '`reward`. Your answer offers the same task at more stops nearby and takes the report ' +
       `back. You can make ${String(settings.research.throttle.uses)} reports in ` +
diff --git a/src/commands/rocket/rocket-report.ts b/src/commands/rocket/rocket-report.ts
index fa08acb577f55068c4b3255418216c80367773f3..7b67e9f19e370fdd9ba6d8bca4456a10be1263cf 100644
--- a/src/commands/rocket/rocket-report.ts
+++ b/src/commands/rocket/rocket-report.ts
@@ -119,6 +119,7 @@ export async function reportRocketAs(
           posted: outcome.posted,
           rehearsal: ctx.rehearsal !== undefined,
           until: periodEndWords(outcome.report.endsAt, Date.now(), ctx.config.settings.timezone),
+          ...(outcome.changed === true ? { changed: true } : {}),
         },
       };
   }
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index d6d44394b78065ceb69c77be3d3f6f05e69e7d90..86c1c44c858ab14d5381fd7a8093696378bf5f02 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -197,7 +197,7 @@ describe('/rocket report', () => {
     const arlo = answerOf(await made.report({ who: 'leader:arlo', stop: stop(1) }));
     expect(said(arlo)).toContain('**Arlo** at **Yellow Mural** · catch Alolan Grimer');
     expect(said(arlo)).toContain(
-      'In the pinned post "Today at the stops" of <#100000000000000001>, until midnight.',
+      'In the post "Today’s Stops" of <#100000000000000001>, until midnight.',
     );
     expect(posted(made)).toEqual([]);
     const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
@@ -429,6 +429,10 @@ describe('/rocket report of one lineup of a grunt type (plan 8R-4L)', () => {
     vi.setSystemTime(Date.now() + 60_000);
     const misty = answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) }, made.as(MISTY)));
     expect(said(misty)).toContain('(was: Water-type grunt, not sure which)');
+    // Its message was edited, not posted (plan 8R-6, the staging's finding 3).
+    expect(said(ash)).toMatch(/Posted in <#\d+>; it goes away/);
+    expect(said(misty)).toMatch(/Changed in <#\d+>; it goes away <t:\d+:R>\./);
+    expect(said(misty)).not.toContain('Posted in');
     await made.messages.flush();
     expect(made.gateway.deleted).toEqual([]);
     expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 065c71145cbdbe5bf470325da74425aac4242b1a..3f9232e5d5dba453042a476a61ec4266cc03c588 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -244,7 +244,7 @@ const reportRocket: SubcommandPart = {
       'while you type (it finds them by what can be caught too: `dratini`), and the stop from ' +
       'theirs (your region’s first), or paste a maps link to a stop. A grunt is posted in the ' +
       `region’s channel for ${String(settings.rocket.gruntMinutes)} minutes; a leader, Giovanni ` +
-      'or a decoy grunt goes in the pinned post "Today at the stops" until midnight, and keeps ' +
+      'or a decoy grunt goes in the post "Today’s Stops" until midnight, and keeps ' +
       `grunts away from the stop all day. ${GIOVANNI_ONLY_WHEN_SURE} A ` +
       'stop has one report: a newer one replaces it (a grunt where a hideout was reported asks ' +
       'first), and the same grunt twice is answered with the report that stands. Members who ' +
diff --git a/src/db/repositories/stop-post-repository.ts b/src/db/repositories/stop-post-repository.ts
index e2fc001413d6e28df5b82e5ccce2771150013d2c..5937e856b66a793d01a26045ce565cfbec476b2e 100644
--- a/src/db/repositories/stop-post-repository.ts
+++ b/src/db/repositories/stop-post-repository.ts
@@ -3,7 +3,7 @@ import { z } from 'zod';
 import type { DB } from '../types.js';
 
 /**
- * The pinned "Today at the stops" post of a region channel and a local day (plan 8R-1; design
+ * The pinned "Today’s Stops" post of a region channel and a local day (plan 8R-1; design
  * 6, 9.5): its messages in order (the first, and those it spilled into), and the server.
  */
 export interface StopPostRecord {
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 97d7ade471bc9cd4f29accefa8f518c20cd4a263..6f36ddbcf3b81ed8f432fb36ac21962ffc7e1270 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -217,7 +217,7 @@ export interface PartyGateway {
   /** Deletes a message; one that is already gone is fine. */
   deleteMessage(channelId: string, messageId: string): Promise<void>;
   /**
-   * Pins a message of the bot in a text channel (plan 8R-1: the post "Today at the stops"),
+   * Pins a message of the bot in a text channel (plan 8R-1: the post "Today’s Stops"),
    * and deletes Discord's notice "… pinned a message" where the bot may: `pinned`;
    * `not-allowed` without Pin Messages; `full` when the channel has Discord's most pins;
    * `gone` for a message or channel that is gone. Anything else is thrown.
diff --git a/src/domain/pogo/want-boxes.test.ts b/src/domain/pogo/want-boxes.test.ts
index 702694a028354c41c749440269f3594720e4569f..4099a963e8515b612095d123e04f516ae0090a05 100644
--- a/src/domain/pogo/want-boxes.test.ts
+++ b/src/domain/pogo/want-boxes.test.ts
@@ -7,6 +7,7 @@ import {
   pokemonBoxes,
   subjectOf,
   subjectOfTarget,
+  targetReasonLabel,
   targetWantLabel,
   tierBoxes,
   type BoxFacts,
@@ -93,6 +94,14 @@ describe('the boxes of /want’s dialog', () => {
     expect(subjectOfTarget({ kind: 'rocket', who: 'giovanni' })).toBeUndefined();
   });
 
+  it('names an item’s and Mega Energy’s reason in a DM as a Pokémon’s is, the rest as before (plan 8R-6)', () => {
+    const reason = (want: Parameters<typeof targetReasonLabel>[1]) =>
+      targetReasonLabel(catalogueFixture(), want);
+    expect(reason({ kind: 'research-item', item: 'rare-candy' })).toBe('Rare Candy · Research');
+    expect(reason({ kind: 'research-energy', dex: 6 })).toBe('Charizard Mega Energy · Research');
+    expect(reason({ kind: 'rocket', who: 'leader:arlo' })).toBe('Arlo (Team GO Rocket leader)');
+  });
+
   it('takes a shadow want for its Pokémon’s subject, and none of IVs', () => {
     expect(subjectOf(pokemonTarget(645, undefined, true))).toEqual({ kind: 'pokemon', dex: 645 });
     expect(subjectOf({ kind: 'tier', tier: { level: 'T5', shadow: true } })).toEqual(T5);
diff --git a/src/domain/pogo/want-boxes.ts b/src/domain/pogo/want-boxes.ts
index eb31e27db5874607bcc6b5441879e18fc60152d9..09127c3cea0b6a6802ba9c3f6875d70f857d5065 100644
--- a/src/domain/pogo/want-boxes.ts
+++ b/src/domain/pogo/want-boxes.ts
@@ -241,6 +241,23 @@ function plainTargetLabel(
   }
 }
 
+/**
+ * What a `TargetWant` is called as the reason of a direct message (plan 8R-6, the 8R staging's
+ * finding 1): an item or Mega Energy in the shape of a Pokémon's reason, `Rare Candy · Research`,
+ * `Charizard Mega Energy · Research` (`Gible · Research`, `changeOf`); any other as
+ * `targetWantLabel` names it. Not made plain here.
+ */
+export function targetReasonLabel(catalogue: PokemonCatalogue, want: TargetWant): string {
+  switch (want.kind) {
+    case 'research-item':
+      return `${itemNameOf(want.item)} · Research`;
+    case 'research-energy':
+      return `${speciesNameOf(catalogue, want.dex) ?? `Pokémon #${String(want.dex)}`} Mega Energy · Research`;
+    default:
+      return targetWantLabel(catalogue, want);
+  }
+}
+
 /**
  * What a Rocket target is called (plan 8R-2): `Water-type grunt`, `Grunt (no type)`, `Decoy
  * grunt`, `Arlo (Team GO Rocket leader)`, `Any Team GO Rocket leader`, `Giovanni (Team GO
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index 2a0706fbb0097651b84871b096c1a355aefec5e0..5ed79268396a42e28717524596574c42046f9686 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -53,7 +53,7 @@ interface MapStopReportBase {
   /** Whether this member may take it back here: their own, or any for staff; never read-only. */
   mayTakeBack: boolean;
   /**
-   * Where it is on Discord: the message of the pinned post "Today at the stops" that holds a
+   * Where it is on Discord: the message of the pinned post "Today’s Stops" that holds a
    * task or a hideout, a grunt's own message; absent where there is none the member may see.
    */
   link?: string;
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 9342dfffff77caefae04937fabe02a3060721e20..be37e76244f19498566f51f2279539b37614d0d9 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -534,7 +534,7 @@ describe('cutoverCheck', () => {
       });
     });
 
-    it('wants Pin Messages in a region channel, to pin "Today at the stops" (plan 8R-1)', async () => {
+    it('wants Pin Messages in a region channel, to pin "Today’s Stops" (plan 8R-1)', async () => {
       shape.north.overwrites = [overwrite(shape.botRole, [], [P.PinMessages])];
       expect((await check()).find((one) => one.what === 'region')).toMatchObject({
         status: 'warn',
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index 5926cb167f42586c375b7a2a2f9cb314b3b36eb5..5bf0284ddb620fb6bc4f56733f9369064bd3d2c3 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -141,7 +141,7 @@ export const SERVER_NEEDS: readonly Need[] = [
 
 /**
  * What it needs in a region's channel: the link to a new post, spawn reports, screenshot replies,
- * the pinned post "Today at the stops" (plan 8R-1: without Pin Messages it stands unpinned).
+ * the pinned post "Today’s Stops" (plan 8R-1: without Pin Messages it stands unpinned).
  */
 export const REGION_CHANNEL_NEEDS: readonly Need[] = [
   VIEW,
@@ -159,7 +159,7 @@ export const REGION_CHANNEL_NEEDS: readonly Need[] = [
   need(
     P.PinMessages,
     'Pin Messages',
-    'pinning the post "Today at the stops" (plan 8R-1; src/services/stop-posts.ts)',
+    'pinning the post "Today’s Stops" (plan 8R-1; src/services/stop-posts.ts)',
     true,
   ),
 ];
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index 76ce8863628e6820bf8b52ee237c3b78eeb2acb1..556cfb2d2614971b76a471e1c36d44abcd932f73 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -62,7 +62,7 @@ describe('researchAnswer', () => {
                 "type": 10,
               },
               {
-                "content": "-# In the pinned post "Today at the stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
+                "content": "-# In the post "Today’s Stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
                 "type": 10,
               },
               {
@@ -145,9 +145,7 @@ describe('researchWords', () => {
         '- **Yellow Mural 1** · Market Street (was: Catch 7 \\*Pokémon\\*)\n' +
         '- **Yellow Mural 2** · Market Street',
     );
-    expect(words.where).toBe(
-      'In the pinned post "Today at the stops" of #west, #east, until midnight.',
-    );
+    expect(words.where).toBe('In the post "Today’s Stops" of #west, #east, until midnight.');
   });
 });
 
diff --git a/src/render/research.ts b/src/render/research.ts
index 1900ef19815498b9a8e409877288db40694db897..1a7912a79cd1ad485ae7ec431ed5abdd3bee453a 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -195,7 +195,7 @@ export function researchWords(
       ? `It stands ${view.until}.`
       : view.channels.length === 0
         ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
-        : `In the pinned post "Today at the stops" of ${view.channels.map(channel).join(', ')}, ${view.until}.`;
+        : `In the post "Today’s Stops" of ${view.channels.map(channel).join(', ')}, ${view.until}.`;
   return { head, where };
 }
 
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index 81b176cd40f1686effd6bf1d7eb3f66a77720d08..d69c286a1c26dc2e41624e4d53563e257e9d9d18 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -211,7 +211,7 @@ describe('rocketAnswer', () => {
                 "type": 10,
               },
               {
-                "content": "-# In the pinned post "Today at the stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
+                "content": "-# In the post "Today’s Stops" of <#100000000000000011>, <#100000000000000012>, until midnight.",
                 "type": 10,
               },
               {
@@ -308,6 +308,10 @@ describe('a lineup of a grunt type in the answer (plan 8R-4L)', () => {
       **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Magikarp (was: Water-type grunt · Magikarp, Goldeen)
       -# Posted in <#100000000000000011>, <#100000000000000012>; it goes away <t:1792593060:R>."
     `);
+    // A grunt changed in place says its messages were changed (plan 8R-6).
+    expect(rocketWords({ ...refined, changed: true }, () => '#west').where).toBe(
+      'Changed in #west, #west; it goes away <t:1792593060:R>.',
+    );
     // The very same lineup is "again".
     expect(rocketWords({ ...refined, replaced: lineup() }, () => '#west').head).toContain(
       '· catch Magikarp (again)',
@@ -361,7 +365,7 @@ describe('rocketWords', () => {
       where: 'Posted in #west, #east; it goes away <t:1792593000:R>.',
     });
     expect(rocketWords(hideout, named).where).toBe(
-      'In the pinned post "Today at the stops" of #west, #east, until midnight.',
+      'In the post "Today’s Stops" of #west, #east, until midnight.',
     );
   });
 });
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index e943b279d123cec7fd26add348f95dd79d2bee59..fd5cc1986ee82cf6b71a89266980fbf80edfce67 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -147,6 +147,8 @@ export interface RocketAnswerView {
   rehearsal: boolean;
   /** A hideout's end as a sentence ends (`periodEndWords`: `until midnight`). */
   until: string;
+  /** A grunt refined in place: its messages were edited ("Changed in", plan 8R-6). */
+  changed?: boolean;
 }
 
 /**
@@ -217,7 +219,7 @@ export function rocketWords(
       ? `It stands ${view.until}.`
       : view.channels.length === 0
         ? `It lies in no region now, so no post shows it; it stands ${view.until}.`
-        : `In the pinned post "Today at the stops" of ${channels(view.channels)}, ${view.until}.`;
+        : `In the post "Today’s Stops" of ${channels(view.channels)}, ${view.until}.`;
   } else if (view.rehearsal) {
     where = `It stands until ${timestamp(report.endsAt, 't')} (rehearsal mode posts nothing).`;
   } else if (view.posted.length === 0) {
@@ -226,7 +228,8 @@ export function rocketWords(
       `${timestamp(report.endsAt, 't')}.`;
   } else {
     where =
-      `Posted in ${channels(view.posted.map((one) => one.channelId))}; it goes away ` +
+      `${view.changed === true ? 'Changed' : 'Posted'} in ` +
+      `${channels(view.posted.map((one) => one.channelId))}; it goes away ` +
       `${timestamp(report.endsAt, 'R')}.`;
   }
   return { head, where };
diff --git a/src/render/stop-post.test.ts b/src/render/stop-post.test.ts
index 807e9289adf9c1135f246ce68162bc7d0b557ecd..9cd9468210c2ecc87e8be4dddd5239cd48378a4e 100644
--- a/src/render/stop-post.test.ts
+++ b/src/render/stop-post.test.ts
@@ -54,7 +54,7 @@ function atStops(
   };
 }
 
-describe('the post "Today at the stops"', () => {
+describe('the post "Today’s Stops"', () => {
   it('names fifteen stops of a task and counts the rest, within Discord’s limits', () => {
     const [message, ...more] = stopPostMessages({
       day: 'Saturday, November 21',
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 8d0a7071e3e6ef8fdafcc21ad2df178dca0927cf..3255a0df1eb535acbe62d5d4e976518580112c30 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -17,7 +17,7 @@ import { count, memberByName, plain, timestamp } from './text.js';
 import { container, countComponents, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /*
- * The pinned "Today at the stops" post of a region channel (plan 8R-1; design 6, 9.5, 9.7):
+ * The pinned "Today’s Stops" post of a region channel (plan 8R-1; design 6, 9.5, 9.7):
  * research grouped by task, each with its rewards and its stops, then Team GO Rocket's hideouts
  * (plan 8R-2: Giovanni, Cliff, Arlo, Sierra, the decoy grunt, each with its stops), in
  * components-v2 messages of Discord's limits (40 components, `TEXT_BUDGET` of text), spilling
@@ -287,11 +287,8 @@ export function postPictures(view: StopPostView, picture: PictureLookup = AS_FED
 
 /** The head of the post: its title, the day, an event's line. */
 function headText(view: StopPostView, part: number): string {
-  if (part > 0) return `-# Today at the stops, continued (${String(part + 1)})`;
-  const lines = [
-    `## Today at the stops`,
-    `-# ${plain(view.day)} · field research and Team GO Rocket`,
-  ];
+  if (part > 0) return `-# Today’s Stops, continued (${String(part + 1)})`;
+  const lines = [`## Today’s Stops`, `-# ${plain(view.day)} · field research and Team GO Rocket`];
   if (view.event !== undefined) {
     lines.push(
       `**${plain(view.event)}**: its tasks${view.until === undefined ? '' : ` ${view.until}`}.`,
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index e7463a42e90dfc91d912e7dd8ef8525731c35827..2c6ba69657ce86d12068b680e60ad6f60c5fc4ae 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -542,7 +542,7 @@ describe('renderSummary with trains', () => {
   });
 });
 
-describe('renderSummary: "Today at the stops" (plan 8X-G)', () => {
+describe('renderSummary: "Today’s Stops" (plan 8X-G)', () => {
   const POST = 'https://discord.com/channels/1/2/3';
 
   it('links the pinned post of the stops, with its counts, last', () => {
@@ -550,12 +550,12 @@ describe('renderSummary: "Today at the stops" (plan 8X-G)', () => {
     const texts = textDisplays(
       renderSummary([raid], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 6, hideouts: 2 } }),
     );
-    expect(texts.at(-1)).toBe(`[Today at the stops](<${POST}>): 6 tasks · 2 hideouts`);
+    expect(texts.at(-1)).toBe(`[Today’s Stops](<${POST}>): 6 tasks · 2 hideouts`);
     expect(
       textDisplays(
         renderSummary([], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 1, hideouts: 0 } }),
       ),
-    ).toEqual([NOTHING, `[Today at the stops](<${POST}>): 1 task`]);
+    ).toEqual([NOTHING, `[Today’s Stops](<${POST}>): 1 task`]);
   });
 
   it('says nothing of the stops where nothing is reported', () => {
diff --git a/src/render/summary.ts b/src/render/summary.ts
index 311c0fc12f7ab3c551de99f9c17ef955d42076f0..b425e7f255dfa4dcd22fa9dd023d7b3fefb3f3a2 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -151,7 +151,7 @@ export interface ListedTrain {
 export const PASSING_HEADING = '**Passing through**';
 
 /**
- * The pinned post "Today at the stops" of the region's channel (plan 8R-1), for its line in the
+ * The pinned post "Today’s Stops" of the region's channel (plan 8R-1), for its line in the
  * summary (plan 8X-G): the address of its first message, and how many tasks and hideouts it
  * names, as it names them.
  */
@@ -170,7 +170,7 @@ export interface SummaryMore {
 }
 
 /**
- * The line of the stops: `[Today at the stops](<link>): 6 tasks · 2 hideouts`; undefined where
+ * The line of the stops: `[Today’s Stops](<link>): 6 tasks · 2 hideouts`; undefined where
  * nothing is reported.
  */
 function stopsLine(stops: StopsLine | undefined): string | undefined {
@@ -179,9 +179,7 @@ function stopsLine(stops: StopsLine | undefined): string | undefined {
     ...(stops.tasks > 0 ? [count(stops.tasks, 'task')] : []),
     ...(stops.hideouts > 0 ? [count(stops.hideouts, 'hideout')] : []),
   ];
-  return counts.length === 0
-    ? undefined
-    : `[Today at the stops](<${stops.url}>): ${counts.join(' · ')}`;
+  return counts.length === 0 ? undefined : `[Today’s Stops](<${stops.url}>): ${counts.join(' · ')}`;
 }
 
 /** The heading of the trains in a region's list, under its raids and above its meetups. */
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index a6376ca6246e4a5654a408c1e44ad49818f5ed21..63329822e596eb36e7a29adeff7bdc27750f7536 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -200,8 +200,11 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
     await made.want(BOB, { kind: 'research-energy', dex: energyDex });
     await made.report(candy, [west(1)]);
     await made.report(energy, [west(2)]);
-    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Rare Candy (research)']]);
-    expect(made.dms.to(BOB)).toHaveLength(1);
+    // Named as a Pokémon's reason is, "Gible · Research" (plan 8R-6, the staging's finding 1).
+    expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Rare Candy · Research']]);
+    expect(made.dms.to(BOB).map(dmReasons)).toEqual([
+      [expect.stringMatching(/^\S.* Mega Energy · Research$/)],
+    ]);
   });
 
   it('says until when a multi-day event’s day and its last day hold (B7)', async () => {
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index cac81326239ae494382b70f06f3f38680777de11..5efa799c9ba25a4e619e3645362ea423cb659587 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -8,7 +8,7 @@ import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { pokemonTarget, type Want } from '../domain/pogo/notification-target.js';
 import { raidTierLabel, sameRaidTier } from '../domain/pogo/raid-tier.js';
 import { changeSubject } from '../domain/pogo/species-answer.js';
-import { targetWantLabel, type BoxSubject } from '../domain/pogo/want-boxes.js';
+import { targetReasonLabel, targetWantLabel, type BoxSubject } from '../domain/pogo/want-boxes.js';
 import type { NewTrainStorage } from '../db/repositories/new-train-repository.js';
 import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { MemberDirectory } from '../discord/member-directory.js';
@@ -252,7 +252,7 @@ export interface NotifyServiceOptions {
   };
   regions: Pick<RegionProvider, 'byId' | 'all'>;
   /**
-   * The message of a region channel's pinned post "Today at the stops" that holds a task
+   * The message of a region channel's pinned post "Today’s Stops" that holds a task
    * (`StopPostService.messageOf`), for a research DM's link (plan 8R-1); none in rehearsal
    * mode, which makes no posts: the DM has no link then.
    */
@@ -1462,7 +1462,7 @@ export class NotifyService implements PartyNotifier {
         return { label: 'new trains', stop, command: '/settings new-train' };
       case 'target':
         return {
-          label: plain(targetWantLabel(gameData.catalogue, reason.want)),
+          label: plain(targetReasonLabel(gameData.catalogue, reason.want)),
           stop,
           command: '/unwant',
         };
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index d238c5f407838ab54575ab38b1d32502f7bdcfb6..009477d50082f0d1736fca9370834d25efbbd70f 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -614,7 +614,7 @@ describe('PartyService: the summary and tidying up', () => {
           : undefined,
     });
     expect(textDisplays(service.summaryMessage(1)).at(-1)).toBe(
-      `[Today at the stops](<https://discord.com/channels/${gateway.guildId}/${WEST_CHANNEL}/` +
+      `[Today’s Stops](<https://discord.com/channels/${gateway.guildId}/${WEST_CHANNEL}/` +
         '1700000000000000001>): 3 tasks · 1 hideout',
     );
     expect(textDisplays(service.summaryMessage(2))).toHaveLength(1);
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index e6a475e846049746dafee922380eacd4647daa1d..b9ef5263e4347e9b4e8544f2d62ffd839948b9a5 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -482,7 +482,7 @@ export type SplitOutcome =
 
 /** What the party service needs of the region table. */
 /**
- * What the summary reads of the pinned post "Today at the stops" of a region's channel (plan
+ * What the summary reads of the pinned post "Today’s Stops" of a region's channel (plan
  * 8X-G; `StopPostService.summaryOf`): its server and first message, and how many tasks and
  * hideouts it names; undefined where the channel has no post today.
  */
diff --git a/src/services/rocket-reports.ts b/src/services/rocket-reports.ts
index 1c6a9ae7dfc956bea1c08948540387e10e00a366..267f64698d6098f8ebae873f3f3e96f366707d3b 100644
--- a/src/services/rocket-reports.ts
+++ b/src/services/rocket-reports.ts
@@ -37,6 +37,8 @@ export type RocketReported =
       channels: string[];
       /** The grunt's messages (none for a hideout, or in rehearsal mode). */
       posted: PostedGrunt[];
+      /** A grunt refined in place (plan 8R-4L): its messages were edited, not posted (8R-6). */
+      changed?: true;
     }
   /** The same grunt stands (Matt's answer 4): its messages, for the answer's link. */
   | { kind: 'already'; standing: RocketReport; posted: PostedGrunt[] }
@@ -187,7 +189,9 @@ export class RocketService {
       const now = await this.asNow(report);
       if (!now) return { kind: 'overtaken', channels };
       // Refined again meanwhile (review R2): that refine tells.
-      if (now !== report) return { kind: 'reported', report: now, replaced, channels, posted };
+      if (now !== report) {
+        return { kind: 'reported', report: now, replaced, channels, posted, changed: true };
+      }
       // Its messages all found gone (review R5): unseen, it is taken back as a grunt posted
       // nowhere is, and what it refined is lost with it. Where the refine could not tell (F2:
       // its messages could not be read, or it stopped on the way), it is told with what stands.
@@ -206,7 +210,7 @@ export class RocketService {
       posted,
       alsoActors,
     );
-    return { kind: 'reported', report, replaced, channels, posted };
+    return { kind: 'reported', report, replaced, channels, posted, changed: true };
   }
 
   /** Tells the notifier of a report in these channels, with its messages there. */
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index 277eb169e0f9e76abb0ceb03b67013c064ffdd2a..01ef0142b27a51bcfb5b89bea4d59f2dc5f438df 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -139,7 +139,7 @@ describe('StopPostService', () => {
     await made.report(pageTask('Catch a Dragon-type Pokémon'));
     await made.posts.flush();
     const [first] = made.gateway.messagesIn(WEST_CHANNEL);
-    expect(made.said()[0]).toContain('## Today at the stops');
+    expect(made.said()[0]).toContain('## Today’s Stops');
     expect(made.said()[0]).toContain('Saturday, November 21');
     expect(made.said()[0]).toContain(
       '**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew +4\n- **Yellow Mural 1** · Market Street · **Ash**',
@@ -463,7 +463,7 @@ describe('StopPostService', () => {
     }
     expect(made.gateway.pinnedIn(WEST_CHANNEL)).toEqual(messages.map((one) => one.id));
     expect(made.said()[2]).toMatch(/…and \d+ more tasks$/);
-    expect(made.said()[1]).toMatch(/^-# Today at the stops, continued \(2\)/);
+    expect(made.said()[1]).toMatch(/^-# Today’s Stops, continued \(2\)/);
     // A DM of a task links to the message that holds it; none for a task only counted.
     const shownIn = (n: number) =>
       tasks.find((task) => made?.said()[n]?.includes(`**${task.text}**`) === true);
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index d4cd21f37d6e14159b457aa6646c2f595937500c..db23f3c3091bee7b04206ca58b486968b0e7e6c2 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -74,7 +74,7 @@ export interface StopPostServiceOptions {
 }
 
 /**
- * The pinned post "Today at the stops" of every region channel (plan 8R-1; design 6, 9.5–9.7,
+ * The pinned post "Today’s Stops" of every region channel (plan 8R-1; design 6, 9.5–9.7,
  * 9.11): the research of the period on, then the day's Team GO Rocket hideouts (plan 8R-2; a
  * grunt has a message of its own and is not shown here); made at the first report of the day in
  * the region (research or hideout), pinned (Discord's notice of the pin
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 7bfd16cf7b5dbe39071325d982cbc4c35da36770..22d3f839cb5f3be10e8529e35dd6eede9f5e809f 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -349,7 +349,7 @@ describe('reports at stops from the map', () => {
       expect(answer.json.text).toBe(
         'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew\n' +
           '- Yellow Mural\n- Paititi Inti\n' +
-          'In the pinned post "Today at the stops" of #west, until midnight.',
+          'In the post "Today’s Stops" of #west, until midnight.',
       );
       expect(
         answer.json.research?.map((one) => [one.stop.name, one.reporter, one.mayTakeBack]),
````

### Task 7: 8R-6 task 7: Already reported not counted

Prototype commit: `c5a15dd2daeb47c2313e41ff3126e389534b8a7b`

Matt (the 8R staging's finding 7): a use of /research report, of "Same task
at more stops..." and of the "Replace field research?" dialog that reported
at no stop, and a /rocket report (or its dialog) of a grunt standing
already, is answered as before and given back (a UserError with givesBack
and said, after the answer). A use that reports at any stop still counts,
also when other stops were reported already. On the map the research and
Rocket 409s of "Already reported" are given back through givenBackOnTheMap,
as the asks answers are. The router gives back at most as many uses as the
window holds. The help of both commands says so.

**Files:**

```
 src/commands/research/research.test.ts | 64 ++++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/research/research.ts      | 20 +++++++++++++++-
 src/commands/rocket/rocket.test.ts     | 68 ++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/commands/rocket/rocket.ts          |  6 +++--
 src/web/stop-report-post.test.ts       | 14 +++++++----
 src/web/stop-routes.ts                 | 19 ++++++++++-----
 6 files changed, 172 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research.test.ts src/commands/rocket/rocket.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c5a15dd2daeb47c2313e41ff3126e389534b8a7b -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 7: Already reported not counted`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 611ad8aa2c6c3363734f064868ca7633fcaadad1..5b9a9d5444247ecb9599eb06a4a2c6587cc6c78c 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -295,6 +295,28 @@ describe('the controls of /research report’s answer', () => {
     made.ctx.config.settings.research.throttle.uses = 10;
   });
 
+  it('gives the menu’s use back where its stops were all reported already meanwhile (plan 8R-6)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.research.throttle.uses = 2;
+    try {
+      const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
+      const [menu] = selectsOf(asV2(answer));
+      // Misty reports the same task at the stop the menu offers, before Ash picks it.
+      await made.report({ task: DRAGON.key, stop: stop(3) }, made.as(MISTY));
+      const picked = await made.pick(menu?.customId ?? '', [wayspotId(3)]);
+      expect(said(answerOf(picked))).toMatch(/^Already reported:/);
+      // Ash's second use is still there.
+      expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(2) })))).toContain(
+        '### Field research reported',
+      );
+      expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(2) })))).toMatch(
+        /^You can use \/research report again in/,
+      );
+    } finally {
+      made.ctx.config.settings.research.throttle.uses = 10;
+    }
+  });
+
   it('acts on nothing of a report replaced since, and gives the menu’s use back (A1, B11)', async () => {
     const made = await setup();
     made.ctx.config.settings.research.throttle.uses = 2;
@@ -505,6 +527,34 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
     ]);
   });
 
+  it('gives back the use of a Submit that reports nothing: every contest left unticked, the rest reported already (plan 8R-6)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.research.throttle.uses = 2;
+    try {
+      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
+      await made.report({ task: GIBLE, stop: stop(2) }, made.as(MISTY));
+      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
+      const answer = said(answerOf(await made.submit(dialog, {})));
+      expect(answer).toMatch(/^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible/);
+      expect(answer).not.toContain('### Field research reported');
+      expect([...made.store.rows.values()].map((one) => one.reporter.name)).toEqual([
+        'Misty',
+        'Misty',
+      ]);
+      // The dialog's use went back: two more reports are taken, a third is not.
+      for (const task of [GIBLE, BELDUM]) {
+        expect(said(answerOf(await made.report({ task, stop: stop(3) })))).toContain(
+          '### Field research reported',
+        );
+      }
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(3) })))).toMatch(
+        /^You can use \/research report again in/,
+      );
+    } finally {
+      made.ctx.config.settings.research.throttle.uses = 10;
+    }
+  });
+
   it('reports the same version at more stops, also once the first was narrowed (R14)', async () => {
     const made = await setup();
     // Gible stands at Paititi Inti: the "one of" of its task is not offered there (R8).
@@ -860,17 +910,27 @@ describe('/research report and the versions of a task (plan 8R-5)', () => {
     expect(answer).toContain('**Win 3 raids in the rain** · Rare Candy\n- **Yellow Mural**\n');
   });
 
-  it('counts a use that found every stop reported already', async () => {
+  it('gives back a use that found every stop reported already, and counts one that reports at any (plan 8R-6)', async () => {
     const made = await setup();
     made.ctx.config.settings.research.throttle.uses = 2;
     try {
       await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
+      // Given back as the router gives back: at most as many as the window holds.
       for (let n = 0; n < 2; n++) {
         expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(1) })))).toMatch(
           /^Already reported:/,
         );
       }
-      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toMatch(
+      // Reported at one stop, already at the other (review Q8): counted.
+      const mixed = said(
+        answerOf(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) })),
+      );
+      expect(mixed).toContain('### Field research reported');
+      expect(mixed).toContain('Already reported:');
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(3) })))).toContain(
+        '### Field research reported',
+      );
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(3) })))).toMatch(
         /^You can use \/research report again in/,
       );
     } finally {
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 44254df459cb1b2568c3fa07f9ae8fa579d7ce82..092548b7678c9dce29f6f32f6d7fdd27708dd03d 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -167,6 +167,20 @@ async function answerOf(
   });
 }
 
+/** Why a use is given back after its answer: every stop was reported already (plan 8R-6). */
+const ALREADY_REPORTED = 'Already reported';
+
+/**
+ * Gives a use back that reported nothing (plan 8R-6, Matt: "Already reported" does not count
+ * against the throttle): thrown after the answer, a `UserError` the router says no more and whose
+ * use goes back. A use that reports at any stop counts, also when others were reported already.
+ */
+function givenBackWhenNothingReported({ outcome }: ResearchReported): void {
+  if (outcome.saved.length === 0) {
+    throw new UserError(ALREADY_REPORTED, { givesBack: true, said: true });
+  }
+}
+
 /**
  * The version "Same task at more stops…" reports (R14): the one its custom id carries, as the
  * list has it, else as a report of the period keeps it (a typed task; one gone from the list), so
@@ -453,7 +467,8 @@ const reportResearch: SubcommandPart = {
       'get a direct message. A task missing from the list can be typed in full, with its ' +
       '`reward`. Your answer offers the same task at more stops nearby and takes the report ' +
       `back. You can make ${String(settings.research.throttle.uses)} reports in ` +
-      `${String(settings.research.throttle.minutes)} minutes.`,
+      `${String(settings.research.throttle.minutes)} minutes; up to ` +
+      `${String(settings.research.throttle.uses)} answers of "Already reported" in that time do not count.`,
     examples: [
       '/research report task:Make 2 Excellent Throws stop:Yellow Mural stop2:Paititi Inti',
       '/research report task:Catch 3 Pokémon in the rain stop:Fountain Square reward:Rare Candy',
@@ -477,6 +492,7 @@ const reportResearch: SubcommandPart = {
       reporter: reporterOf(interaction),
     });
     await answer(interaction, v2Answer(await answerOf(interaction, ctx, reported, use.subject)));
+    givenBackWhenNothingReported(reported);
   },
   autocomplete: async (interaction, ctx) => {
     await interaction.respond(await researchChoices(interaction, ctx));
@@ -596,6 +612,7 @@ export const researchControls: ComponentHandler = {
       true,
     );
     await answerApart(interaction, await answerOf(interaction, ctx, reported, use.subject));
+    givenBackWhenNothingReported(reported);
   },
   async modal(interaction, id, ctx) {
     if (id.action !== RESEARCH_ACTIONS.replace) throw new UserError(STALE_COMPONENT);
@@ -629,6 +646,7 @@ export const researchControls: ComponentHandler = {
       use.also,
     );
     await answerApart(interaction, await answerOf(interaction, ctx, reported, use.subject));
+    givenBackWhenNothingReported(reported);
   },
   async button(interaction, id, ctx) {
     const ids = [id.id, ...id.args];
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index 86c1c44c858ab14d5381fd7a8093696378bf5f02..6c9dce143d2b34b3ba1fb840e9064d0060c24030 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -242,10 +242,24 @@ describe('/rocket report', () => {
       /^I do not know "someone" in Team GO Rocket/,
     );
     expect(made.store.rows.size).toBe(0);
-    // Nothing counted: the limit is all there.
-    for (let n = 0; n < 10; n++)
-      await made.report({ who: 'grunt:water', stop: stop(n % 2 ? 1 : 2) });
-    expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(1) })))).toMatch(
+    // Nothing counted: the limit is all there (ten grunts of other types, none reported already).
+    const types = [
+      'water',
+      'fire',
+      'grass',
+      'ice',
+      'rock',
+      'ground',
+      'dark',
+      'bug',
+      'poison',
+      'ghost',
+    ];
+    for (const [n, type] of types.entries()) {
+      await made.report({ who: `grunt:${type}`, stop: stop(n % 2 ? 1 : 2) });
+    }
+    expect(made.store.rows.size).toBe(2);
+    expect(said(answerOf(await made.report({ who: 'grunt:dragon', stop: stop(1) })))).toMatch(
       /^You can use \/rocket report again in/,
     );
 
@@ -536,6 +550,52 @@ describe('/rocket report’s throttle around the dialog (fix B7)', () => {
     }
   });
 
+  it('gives back the use of a dialog’s Submit that finds the same grunt reported meanwhile (plan 8R-6)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 2;
+    try {
+      await made.report({ who: 'leader:arlo', stop: stop(1) }, made.as(MISTY));
+      const asking = await made.report({ who: 'grunt:water', stop: stop(1) });
+      // Misty replaces Arlo with the same grunt first.
+      const hers = await made.report({ who: 'grunt:water', stop: stop(1) }, made.as(MISTY));
+      await made.submit(hers, made.as(MISTY));
+      expect(said(answerOf(await made.submit(asking)))).toMatch(
+        /^Already reported: a \*\*Water-type grunt\*\* at \*\*Yellow Mural\*\*/,
+      );
+      // The dialog's use went back: two more reports are taken, a third is not.
+      for (const who of ['grunt:fire', 'grunt:ice']) {
+        expect(said(answerOf(await made.report({ who, stop: stop(2) })))).toContain(
+          '### Team GO Rocket reported',
+        );
+      }
+      expect(said(answerOf(await made.report({ who: 'grunt:grass', stop: stop(2) })))).toMatch(
+        refusedLater,
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+
+  it('gives back the use of a grunt reported already (plan 8R-6)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.rocket.throttle.uses = 2;
+    try {
+      await made.report({ who: 'grunt:water', stop: stop(1) });
+      expect(said(answerOf(await made.report({ who: 'water', stop: stop(1) })))).toMatch(
+        /^Already reported:/,
+      );
+      // The second use is still there, and then the window is full.
+      expect(said(answerOf(await made.report({ who: 'grunt:fire', stop: stop(2) })))).toContain(
+        '### Team GO Rocket reported',
+      );
+      expect(said(answerOf(await made.report({ who: 'grunt:ice', stop: stop(2) })))).toMatch(
+        refusedLater,
+      );
+    } finally {
+      made.ctx.config.settings.rocket.throttle.uses = 10;
+    }
+  });
+
   it('counts the dialog’s Submit as the command’s one use', async () => {
     const made = await setup();
     made.ctx.config.settings.rocket.throttle.uses = 2;
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 3f9232e5d5dba453042a476a61ec4266cc03c588..9ff917d5047fa289545a8ac5bea15bcc26df0388 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -168,7 +168,8 @@ async function report(
           ? undefined
           : postLink(serverId, message.channelId, message.messageId);
       await answer(interaction, { content: alreadyReported(outcome.standing, link) });
-      return;
+      // "Already reported" does not count (plan 8R-6, Matt): answered, the use given back.
+      throw new UserError('Already reported', { givesBack: true, said: true });
     }
     case 'reported':
       await answer(interaction, v2Answer(rocketAnswer(outcome.view)));
@@ -250,7 +251,8 @@ const reportRocket: SubcommandPart = {
       'first), and the same grunt twice is answered with the report that stands. Members who ' +
       'want it get a direct message. Your answer takes the report back. You can make ' +
       `${String(settings.rocket.throttle.uses)} reports in ` +
-      `${String(settings.rocket.throttle.minutes)} minutes.`,
+      `${String(settings.rocket.throttle.minutes)} minutes; up to ` +
+      `${String(settings.rocket.throttle.uses)} answers of "Already reported" in that time do not count.`,
     examples: [
       '/rocket report who:Water-type grunt stop:Yellow Mural',
       '/rocket report who:Arlo stop:Fountain Square',
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 22d3f839cb5f3be10e8529e35dd6eede9f5e809f..4bdf24ef5b71ba4ca0433c5303782de1cbac2b55 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -113,7 +113,7 @@ describe('reports at stops from the map', () => {
         return found.value;
       };
 
-      it('answers a version standing already with it, counted (R8)', async () => {
+      it('answers a version standing already with it, given back (R8, plan 8R-6)', async () => {
         const made = await setup();
         web = made.web;
         expect(
@@ -134,9 +134,12 @@ describe('reports at stops from the map', () => {
         expect(answer.json.already?.map((one) => [one.stop.name, one.reporter, one.oneOf])).toEqual(
           [['Yellow Mural', 'Bob', false]],
         );
-        // Counted, as /research counts it: the tenth use of ten.
+        // Given back, as /research gives it back (plan 8R-6): the tenth use is still there.
         expect(
           (await made.post('/research', { task: version('Beldum'), stops: [wayspotId(2)] })).status,
+        ).toBe(200);
+        expect(
+          (await made.post('/research', { task: version('Beldum'), stops: [wayspotId(3)] })).status,
         ).toBe(429);
       });
 
@@ -638,7 +641,7 @@ describe('reports at stops from the map', () => {
       );
     });
 
-    it('answers the same grunt again as reported already, with it, and counts the use', async () => {
+    it('answers the same grunt again as reported already, with it, and gives the use back (plan 8R-6)', async () => {
       const made = await setup();
       web = made.web;
       await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) }, made.bob);
@@ -651,11 +654,14 @@ describe('reports at stops from the map', () => {
       );
       expect(again.json.grunt?.link).toMatch(/^https:\/\/discord\.com\/channels\//);
       expect(made.made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
-      // Counted, as on Discord (8R-2): the tenth use is the last.
+      // Given back, as on Discord (plan 8R-6): the ninth and tenth uses are still there.
       expect((await made.post('/rocket', { who: 'grunt:fire', stop: wayspotId(2) })).status).toBe(
         200,
       );
       expect((await made.post('/rocket', { who: 'grunt:ice', stop: wayspotId(2) })).status).toBe(
+        200,
+      );
+      expect((await made.post('/rocket', { who: 'grunt:rock', stop: wayspotId(2) })).status).toBe(
         429,
       );
     });
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 07aadbc11417bcd65b7f2f32baa06148dea75b85..a2d3e2e6a84847cbf933b0e99342de5fac33af7f 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -8,6 +8,7 @@ import {
   RESEARCH_REMOVE,
   RESEARCH_REPORT,
   researchThrottle,
+  researchWindow,
   STOP_OPTIONS,
 } from '../commands/research/research-input.js';
 import {
@@ -379,7 +380,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
   // uncounted unless the window is full (429); only then `/research report`'s
   // throttle in its window (`researchWindow`: the map shares the command's, design 9.12); then
   // `reportResearchAs` as the member, `replacing` the reports ticked. The stops reported already
-  // (R8) come back as `already`; where every stop was, a 409, counted as on Discord.
+  // (R8) come back as `already`; where every stop was, a 409, given back as on Discord (8R-6).
   scope.post('/api/research', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
     void reply.header('cache-control', 'no-store');
     const session = await sessions.of(request, reply);
@@ -466,6 +467,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
     const throttled = throttledOnTheMap(deps, reply, key, userId, throttle);
     if (throttled) return noted('throttled', throttled);
     const reporter = reporterNamed(userId, acting.member.name, session.userName);
+    const countedAt = deps.now();
     const reported = await countedOnTheMap(deps, key, userId, throttle, () =>
       reportResearchAs(
         ctx,
@@ -500,8 +502,12 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       research: among(made),
       already: among(standing),
     };
-    // Every stop reported already: counted, as `/research` counts it (R8).
-    if (made.length === 0) return noted('already', reply.code(409).send(answer));
+    // Every stop reported already: given back, as `/research` gives it back (plan 8R-6, Matt);
+    // a use that reports at any stop counts.
+    if (made.length === 0) {
+      givenBackOnTheMap(deps, researchWindow(settings), userId, throttle, countedAt);
+      return noted('already', reply.code(409).send(answer));
+    }
     return noted('reported', reply.send(answer));
   });
 
@@ -538,8 +544,8 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
   // with the hideout's id, uncounted, unless `/rocket report`'s window is full (429, as Discord
   // opens no dialog then); only then the command's throttle in its window (`rocketWindow`); then
   // `reportRocketAs` as the member. What is none of the member's doing gives the use back (a
-  // hideout reported meanwhile, asked about; a grunt posted nowhere; one overtaken); the same
-  // grunt standing stays counted (8R-2).
+  // hideout reported meanwhile, asked about; a grunt posted nowhere; one overtaken), and so does
+  // the same grunt standing already, "Already reported" (plan 8R-6, Matt: it does not count).
   scope.post('/api/rocket', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
     void reply.header('cache-control', 'no-store');
     const session = await sessions.of(request, reply);
@@ -617,7 +623,8 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
         return noted('reported', reply.send(answer));
       }
       case 'already': {
-        // Counted, as `/rocket` counts it (8R-2). The reporter by name, never an id.
+        // Given back, as `/rocket` gives it back (plan 8R-6). The reporter by name, never an id.
+        givenBackOnTheMap(deps, rocketWindow(settings), userId, throttle, countedAt);
         const by = outcome.standing.reporter.name.trim();
         const text = alreadyReported(
           outcome.standing,
````

### Task 8: 8R-6 task 8: Docs for pictures at the stops

Prototype commit: `7fae7797cbe1fa7e1d0de027cebd1a3bd1f55366`

stop-reports.md: the rule, StopPictures, where prepare runs, the post's
layout and busy day, the day's research under a window, DMs, the grunt's
one picture, the map; the small fixes and "Already reported" given back;
the post named "Today's Stops". notifications-and-dms.md: the item reason's
words and the DMs' pictures. web.md: GET /pictures/<key>.png,
pictureOrigins, the hideout's picture and the 409s given back. utilities.md
points to the stops' pictures; operations.md names var/pictures/.

**Files:**

```
 docs/architecture/discord-framework.md     |  2 +-
 docs/architecture/notifications-and-dms.md |  6 +++---
 docs/architecture/operations.md            |  2 +-
 docs/architecture/parties-and-posts.md     |  2 +-
 docs/architecture/stop-reports.md          | 35 ++++++++++++++++++++++++++++-------
 docs/architecture/utilities.md             |  2 ++
 docs/architecture/web.md                   | 10 +++++-----
 7 files changed, 41 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, no test files in this task (docs only)); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7fae7797cbe1fa7e1d0de027cebd1a3bd1f55366 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-6 task 8: Docs for pictures at the stops`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index ca57c95faff0c37e74993e06223927a3f2b88e85..08ac20422012461c54246b93a991cc835f3fb3ea 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -18,7 +18,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/counters`; `/max`, plan 8X-3, which asks in a dialog about a new battle that ends within five minutes, and reads what its guard read, kept by the interaction); a command that opens a dialog declares none (the dialog is its first answer). A component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/report` and of Report to moderators, `src/commands/parties/report.ts` and `report-message.ts`, and `deferSubmit` in the Submit of every one-shot dialog, below). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
-- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s dialog, whose Submit refused for no post in the other forum gives back the Submit and the use that opened it, plans 8S-4 and 8Q, the time carried in the dialog's custom id: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
+- Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; `/location`'s dialog, whose Submit refused for no post in the other forum gives back the Submit and the use that opened it, plans 8S-4 and 8Q, the time carried in the dialog's custom id: `CHANGE_THROTTLE` as `location`; a move that landed and was answered before a later step failed is logged and keeps both counted; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. One exception by Matt's ruling (plan 8R-6): "Already reported" does not count, so `/research report` (with its "Same task at more stops…" and its dialog "Replace field research?"), `/rocket report` (with its dialog "Replace a hideout?") and the map's research and Rocket routes give back a use that reported at no stop, after their answer (`said` and `givesBack`; on the map `givenBackOnTheMap`); see `stop-reports.md`. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids, and since 8S-4 the changes of a raid, in the window of their command). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
 ## Controls and how a press answers
 
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 5f7d29a8c733fdc7fff04cbad4ee69de7b2775c2..88660eaee10a3871ced9cfc18f11fa4c96a1ff27 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -14,14 +14,14 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 ## The notifier
 
-- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop; since plan 8R-4L a lineup's report is wanted, quiet and announced by its type, `typeKeyOf`, its Shadow wants judged by its own catches, and a grunt refined in place by a lineup is told again as a report, the hour per type keeping a second DM away, never to its reporter or the reporter of the grunt it changed, `RocketNews.alsoActors`, review R3, who have heard of the type for the hour; DMs sent before a refine are not changed). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
-- **Research by version** (plan 8R-5; `stop-reports.md`, "Research rewards reported apart"): `researchReported` works every version of a task off in the task's line (R3, `research:<server>:<task>`, `taskOfSubject`; a typed task's `typed:<text key>`), taken as the report is made (review R6), and so is the DMs' time (review F6: every channel's `eventAt` and the start of `periodEndWords` are the report's, however late its turn comes): the server's row, the reports by region channel and each channel's event (`researchEvents`) are read when its turn comes, every channel's event delivered in the same turn, so the reports of a task are told in the order they were made. A reward's report tells who wants that reward; a "one of" who wants any of its encounters, its DM's rewards line naming the member's own first (R12: `**Rewards** one of Gible, Larvitar, Beldum`). The memory `researchTold` is by subject, so a member told of a task's "one of" at a stop is told of the task's key alone there. A reward's report whose untold stops the member was all told of as "one of" there is a confirmation (R4, R5; the message's variant has its kind): `researchConfirmSentence` "Confirmed: the reward at **Yellow Mural** and **Paititi Inti** is **Gible**." with `researchConfirmBrief` (the task, until when, the reward's picture) and the usual link and reasons; where any untold stop is new for them, the usual DM names every untold stop instead. The kind is decided once per member across all the news' untold stops, in every region channel the member views (review R3, the controller's call; F4: a stop in a channel they are kept out of does not count, the viewers of each channel read once by the first channel's event where the stops lie in several and a confirmation can be sent, for every member who wants the reward and has an untold stop in any channel (review P1: not only those of the first channel), a channel whose viewers could not be read counting for all): a confirmation only where every untold stop of the news, in whichever region they view, was told of as "one of", else the usual DM; then each channel's DM (one per report and region channel, as plan 8R-1) is of that kind and names that channel's untold stops. That covers a correction after a narrowing too (told of the "one of" there, then Beldum, then Gible: Gible is confirmed). The reporter of a "one of" a report replaced (`ResearchNews.replaced`) counts as told of it at that stop, as Rocket's `alsoActors`. A narrowing to a reward a member does not want tells them nothing, and a "one of" turning out another reward is not said (Matt). When a "one of"'s turn comes it reads its reports again (`NotifyServiceOptions.stopReports`, `StopReportService.kept`; Matt's R6; once, by its first channel's event after the wants are read, for every channel alike) and leaves out every stop whose report was replaced or taken back since (another `madeAt`, or gone), so the narrowing's own DM tells the wanters of the reward as usual.
+- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop; since plan 8R-4L a lineup's report is wanted, quiet and announced by its type, `typeKeyOf`, its Shadow wants judged by its own catches, and a grunt refined in place by a lineup is told again as a report, the hour per type keeping a second DM away, never to its reporter or the reporter of the grunt it changed, `RocketNews.alsoActors`, review R3, who have heard of the type for the hour; DMs sent before a refine are not changed). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off. The research and Rocket DMs show their picture by the rule of the stops and have it made first, waiting 2.5 seconds at most, and show none where its source is gone (plan 8R-6, `NotifyServiceOptions.pictures`, `StopPictures`: `stop-reports.md`, "Pictures at the stops").
+- **Research by version** (plan 8R-5; `stop-reports.md`, "Research rewards reported apart"): `researchReported` works every version of a task off in the task's line (R3, `research:<server>:<task>`, `taskOfSubject`; a typed task's `typed:<text key>`), taken as the report is made (review R6), and so is the DMs' time (review F6: every channel's `eventAt` and the start of `periodEndWords` are the report's, however late its turn comes): the server's row, the reports by region channel and each channel's event (`researchEvents`) are read when its turn comes, every channel's event delivered in the same turn, so the reports of a task are told in the order they were made. A reward's report tells who wants that reward; a "one of" who wants any of its encounters, its DM's rewards line naming the member's own first (R12: `**Rewards** one of Gible, Larvitar, Beldum`). The memory `researchTold` is by subject, so a member told of a task's "one of" at a stop is told of the task's key alone there. A reward's report whose untold stops the member was all told of as "one of" there is a confirmation (R4, R5; the message's variant has its kind): `researchConfirmSentence` "Confirmed: the reward at **Yellow Mural** and **Paititi Inti** is **Gible**." with `researchConfirmBrief` (the task, until when, the Pokémon's picture) and the usual link and reasons; where any untold stop is new for them, the usual DM names every untold stop instead. The kind is decided once per member across all the news' untold stops, in every region channel the member views (review R3, the controller's call; F4: a stop in a channel they are kept out of does not count, the viewers of each channel read once by the first channel's event where the stops lie in several and a confirmation can be sent, for every member who wants the reward and has an untold stop in any channel (review P1: not only those of the first channel), a channel whose viewers could not be read counting for all): a confirmation only where every untold stop of the news, in whichever region they view, was told of as "one of", else the usual DM; then each channel's DM (one per report and region channel, as plan 8R-1) is of that kind and names that channel's untold stops. That covers a correction after a narrowing too (told of the "one of" there, then Beldum, then Gible: Gible is confirmed). The reporter of a "one of" a report replaced (`ResearchNews.replaced`) counts as told of it at that stop, as Rocket's `alsoActors`. A narrowing to a reward a member does not want tells them nothing, and a "one of" turning out another reward is not said (Matt). When a "one of"'s turn comes it reads its reports again (`NotifyServiceOptions.stopReports`, `StopReportService.kept`; Matt's R6; once, by its first channel's event after the wants are read, for every channel alike) and leaves out every stop whose report was replaced or taken back since (another `madeAt`, or gone), so the narrowing's own DM tells the wanters of the reward as usual.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
 
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn` (spawns, Rocket grunts), `normal` (raid wants, gym targets, new trains, max battles, field research, Rocket hideouts), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
-- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`; a Change… without its button, its id too long or no room left, names `/want` or `/unwant`: "To change or stop what has no button here, use `/want` or `/unwant` in the server.", `stopHint`, W4 of plan 8R-4). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag). **Change…** (plan 8R-4, design 4, R15–R20): a reason of a Pokémon (`p`, `ps`, `rp`, `dx`, `gx`) or a tier (`t`, `ts`) has Change… instead of Stop (`changeOf` in `notify-service.ts`, `ShownReason.change`), `dm:<server>:change:sp:<dex>` (a form's species, an Unown letter its own, `changeSubject`) or `…:st:<level>` (`changeButtonId`); the reason's label names the want and the box it fired by ("Costumed Pikachu · Research"; a raid's plain want `Raids`, a spawn's `Spawns`, a shadow want `Shadow`), and reasons of one species or tier are one section with one Change… (`grouped`, named by the species where their names differ; counted once in `stopButtonRoom`, F5; like Stop, after all text, plan 8X-F). IV wants, items, Mega Energy, gym targets and the settings keep Stop (Team GO Rocket's reasons have Change… of its dialog); a `stop` id of a species or tier (`subject`, of DMs before 8R-4, which were only ever sent on the test server, Matt) is `STALE_COMPONENT`. The press (`openChange`) answers before anything else: wants switched off (`notificationsEnabled`), a member no longer in the server (`ctx.members.find`) or nothing held of it ("**Pikachu** is not on your list; `/want` adds it.", S2: Change… never writes) are refused as `UserError`s, answered privately (`readForChange`, the one check of every Change…, B9); else it reads the rows in time (`readInTime`) and opens `/want`'s dialog for that server (`wantDialogFor` with `server`: "Your Pikachu want in <server>. Change what you want a DM about, or tick Remove to stop them all.", the server's name by `serverNameOf` through `plain`, F14; Remove at least, Mew's is Remove alone), its id carrying the server's snowflake. The Submit's guard takes a server or a snowflake in the id (`requireWantServer`); from a DM (`submitFromDm`) it is acknowledged with `deferUpdate`, asks again whether wants are on and the member is in that server (`changeRefusal`, B2: refused below with `followUp`, nothing written), writes for that server and the presser alone, shows that message's Change… of the subject as a disabled `Changed` (`Removed` where it took the want off; `withChanged`) under the messages' lock (`dmMessages`, `src/components/dm-messages.ts`, shared with Stop; the message read anew first), and answers below with `followUp`, also when the button could not be changed.
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`; a Change… without its button, its id too long or no room left, names `/want` or `/unwant`: "To change or stop what has no button here, use `/want` or `/unwant` in the server.", `stopHint`, W4 of plan 8R-4). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag). **Change…** (plan 8R-4, design 4, R15–R20): a reason of a Pokémon (`p`, `ps`, `rp`, `dx`, `gx`) or a tier (`t`, `ts`) has Change… instead of Stop (`changeOf` in `notify-service.ts`, `ShownReason.change`), `dm:<server>:change:sp:<dex>` (a form's species, an Unown letter its own, `changeSubject`) or `…:st:<level>` (`changeButtonId`); the reason's label names the want and the box it fired by ("Costumed Pikachu · Research"; a raid's plain want `Raids`, a spawn's `Spawns`, a shadow want `Shadow`), and reasons of one species or tier are one section with one Change… (`grouped`, named by the species where their names differ; counted once in `stopButtonRoom`, F5; like Stop, after all text, plan 8X-F). IV wants, items, Mega Energy (their reason `Rare Candy · Research`, `Charizard Mega Energy · Research`: `targetReasonLabel`, plan 8R-6), gym targets and the settings keep Stop (Team GO Rocket's reasons have Change… of its dialog); a `stop` id of a species or tier (`subject`, of DMs before 8R-4, which were only ever sent on the test server, Matt) is `STALE_COMPONENT`. The press (`openChange`) answers before anything else: wants switched off (`notificationsEnabled`), a member no longer in the server (`ctx.members.find`) or nothing held of it ("**Pikachu** is not on your list; `/want` adds it.", S2: Change… never writes) are refused as `UserError`s, answered privately (`readForChange`, the one check of every Change…, B9); else it reads the rows in time (`readInTime`) and opens `/want`'s dialog for that server (`wantDialogFor` with `server`: "Your Pikachu want in <server>. Change what you want a DM about, or tick Remove to stop them all.", the server's name by `serverNameOf` through `plain`, F14; Remove at least, Mew's is Remove alone), its id carrying the server's snowflake. The Submit's guard takes a server or a snowflake in the id (`requireWantServer`); from a DM (`submitFromDm`) it is acknowledged with `deferUpdate`, asks again whether wants are on and the member is in that server (`changeRefusal`, B2: refused below with `followUp`, nothing written), writes for that server and the presser alone, shows that message's Change… of the subject as a disabled `Changed` (`Removed` where it took the want off; `withChanged`) under the messages' lock (`dmMessages`, `src/components/dm-messages.ts`, shared with Stop; the message read anew first), and answers below with `followUp`, also when the button could not be changed.
 - The owner's DM of a request for the Wayspot export tool (plan 8W-P; `web.md`, "The Wayspot export tool"): a new request, or one asked again after a refusal, queues a DM to `OWNER_ID` through `DmSender` (`normal`, expiring after 7 days; the queue is in memory, so a restart loses it and the page is the fallback), only while at most `OPEN_REQUESTS_NOTIFIED` 20 requests are open (any Discord account can ask; the rest wait on the page). It is `accessRequestDm` (`src/render/script-access-dm.ts`): who asks by name (`plainNoLinks`) and id as plain text, no mention, the community line through `plainNoLinks`, when, and **Approve** / **Refuse**, custom ids `scriptaccess:<row id>:approve|refuse:<askedAt in base 36>`. The handler (`scriptAccessControls`, `src/components/script-access.ts`) has a guard that the presser is `OWNER_ID` (a guard refusal counts against no throttle) and `SCRIPT_ACCESS_THROTTLE` 20 a minute; a press decides the request as it is now and for the asking it was drawn for, and edits the DM to what was decided and when without its buttons (`accessDecidedDm`): decided meanwhile, "Decided already: …"; asked again since, "Asked again since, <time>: decide it on its new DM or on the page."; a row gone or a button it cannot read is out of date. No fresh web login is needed for the DM.
 
 ## Spawn reports
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index 3502da121d70052c14ebbdfbd06e747367566f19..ef2e4a96105269ceb464d3f3bc22f28499c27a9b 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -16,7 +16,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 
 - `Dockerfile`: multi-stage on `node:24-slim`. The build stage runs `npm ci --ignore-scripts` (the workspace `packages/wayspot-core`'s `package.json` copied first: the lock file names it) and `npm run build` (the package `@pine/wayspot-core`, the bot, then the web pages' bundle by `scripts/web/build.ts`, which `.dockerignore` lets in; before plan 8W-P it did not, and the image did not build); the runtime stage has the production dependencies (also without install scripts: none is needed for the CPU, as in the checkout), the package's `package.json` and compiled `dist/` (where the workspace link `node_modules/@pine/wayspot-core` points), `dist/`, `package.json` (it says the files are ES modules), the square raid egg pictures `pictures/eggs/` (plan 8D-F: `EGG_FOLDER` finds them beside `dist/` as beside `src/`), the package's `LICENSE` beside its `package.json` (`@pine/wayspot-core` is MIT, unlike the rest of Pine, and its notice goes with every copy; `.dockerignore` lets it in), the icons of the posts' buttons `pictures/emoji/` (plan 8D-G, for `emoji-upload`: `EMOJI_FOLDER`, the same way) and the default `data/settings.json`. onnxruntime-node keeps its library for the image's platform only (`TARGETARCH`: linux x64, or arm64; arm64 is untested). Runs as `node`, `NODE_ENV=production`, `node --enable-source-maps dist/index.js`, `STOPSIGNAL SIGTERM`. About 490 MB unpacked.
 - The runtime reads from disk only its settings and what it keeps under `var/`: no `assets/`, `lang-data/` (the legacy bot's tesseract data) or the other `data/*.json`, and no legacy JavaScript. `.dockerignore` lets in only what the build needs (never `.env`, `var/`, `.git`, `node_modules`).
-- `var/` is a volume (`pine-var`), writable by `node` because the image's folder is: the game data cache, map pictures, the screen reader's models (downloaded at first use) and screenshots, and the health files.
+- `var/` is a volume (`pine-var`), writable by `node` because the image's folder is: the game data cache, map pictures, the square pictures of the stops (`var/pictures/`, plan 8R-6, at most 2,000), the screen reader's models (downloaded at first use) and screenshots, and the health files.
 - The one-off commands run in the same image: `dist/db/migrate-cli.js`, `dist/discord/deploy-cli.js`, `dist/ops/restore-cli.js`, `dist/ops/health-cli.js`, `dist/ops/emoji-upload-cli.js`, `dist/ops/role-auth-cli.js`, `dist/ops/history-import-cli.js`, and the watchdog `dist/ops/watchdog-cli.js`. What an operator of an installation runs is such a CLI under `src/` (its logic in a module beside it, tested; the CLI only reads the environment and the arguments), with an npm script for the checkout (`tsx` on the `.ts`) and a `./pine` command for the stack; the tsx scripts of `scripts/` are the developers' and are not in the image.
 
 ## The stack
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 1fa8ebd9702775560d61ede7bec86db8692cf2f0..811d55f0d454d124a6a8f4f69fbf81374d60307e 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -65,7 +65,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else; a forum it cannot look through for a refusal of Discord's is warned of by name, the other failures (the network away) once per sweep with how many forums (plan 8X-H), and each sweep says at debug what it archived. A closing of which a part failed for the network or a rate limit (the link line, a copy, its last showing, a leftover's deletion, the last words, the tags, the archiving, a moderator's deletion; `worthRedoing`, review r0 B2, B5: a refusal of Discord's such as Missing Access would fail again and is not kept, and a post that is gone drops it whatever else failed) is kept in memory (`undoneClosings`, a `BoundedMap` of `UNDONE_CLOSINGS_MAX`, the party as it ended, its last words and whether they were said, `delete` where a moderator chose to delete the post and the deletion failed for the network, review r0 B3: meanwhile it is closed and archived as usual, `endAs` says `deleting` (review r1 C1: the moderator is told that it is archived for now and will be deleted within the hour, and the report keeps `delete`), and the redo deletes it; Discord refusing the deletion leaves it archived and `archived`, as before; a post that is gone is `archived`) and done again by `redoClosings()`, the first step of the hourly upkeep and so of the catch-up on reconnect (plan 8X-H, Matt 2026-10-23: such a post kept its live controls, and the sweep only archives; review r0 B4), for a day after the party ended (`UNDONE_CLOSING_KEPT_MS`: no post opened and archived again days later); a redo (`closePost`'s `redo`) sets the tags of the last showing for every kind of party, also a raid the clock ended, whose showing with Ended may have failed in the same outage (review F2), and, where the post is to be archived, shows it first, before the copy in it and the leftovers are deleted: the post may be archived already, and Discord refuses a deletion in an archived post (50083) until something opens it (review F4); ending between parties with the clock's stop and with the first closing that fails again (one probe a run while the network is away: a request that is black-holed takes about a minute, review r1 C2); it logs `closed ended parties again` with how many were redone and failed again. A restart forgets them, and the sweep archives what is left open as before. Accepted risk (review r0 B12): last words that Discord received but whose answer the network lost are said again by the redo, so they may stand twice in the post. `redrawPosts()` shows every active post anew as `emojiChanged` does, paced (it only queues them, one party every `EMOJI_RENDER_GAP_MS`, so N posts take N × 250 ms, beside the upkeep and the feeds, review r0 B10): an edit that failed leaves its post stale until something shows it anew (`showPost` forgot what it sent before trying), and a current post makes no edit. The updates of a post or a summary that failed for the network are warnings (`isNetworkError`, `src/services/network-error.ts`), errors otherwise (operations.md, "The catch-up on reconnect").
-- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Going on now` (`SUMMARY_TITLE`; plan 8X-G, Matt 2026-10-22: every kind of party, `Active raids` before; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today at the stops](<link>): 6 tasks · 2 hideouts`, `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Going on now` post the bot made in the forum, or one it made as `Active raids` before plan 8X-G (`LEGACY_SUMMARY_TITLE`; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Going on now` (`SUMMARY_TITLE`; plan 8X-G, Matt 2026-10-22: every kind of party, `Active raids` before; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today’s Stops](<link>): 6 tasks · 2 hideouts`, `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Going on now` post the bot made in the forum, or one it made as `Active raids` before plan 8X-G (`LEGACY_SUMMARY_TITLE`; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
 - Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks in a dialog whether to archive the post or delete it, plan 8Q, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - The forum of a region holds its raids, max battles, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 06c89cfdf9d713cabd5f4e9d07787c9842ae1b54..1973c08a12953c2df146cb2017bb4f17e55cdbb3 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -1,6 +1,6 @@
 # Reports at stops
 
-What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today at the stops", and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map's server side (plan 8R-3) is in `web.md`, "Reports at stops on the map": it shares the code paths below. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
+What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/2026-10-21-stop-reports-design.md`): stops of Pine's own, the field research task list, research periods, the stop reports and `/research`, the pinned post "Today’s Stops", and the research wants and their DMs; Team GO Rocket (plan 8R-2): the lineups, `/rocket`, grunts' messages, the post's hideouts, Rocket wants and DMs. The map's server side (plan 8R-3) is in `web.md`, "Reports at stops on the map": it shares the code paths below. Their pictures (plan 8R-6) are under "Pictures at the stops" below. Read before changing anything under `src/domain/stops/`, `src/domain/research/`, `src/domain/rocket/`, `src/commands/research/`, `src/commands/rocket/`, `src/commands/stops/`, or `src/services/` `stop-reports.ts`, `stop-posts.ts`, `research-task-service.ts`, `rocket-lineup-service.ts`, `rocket-reports.ts`, `grunt-messages.ts`, `pine-stops.ts`.
 
 ## The tables (migration 027)
 
@@ -31,7 +31,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 - `StopReportService` (`ctx.stopReports`) reports a version of a task at one to five stops in the period on now (`reportResearch`): since plan 8R-5 each stop as `decideResearch` decides with the stop's row of the period locked (`saveUnless`; "Research rewards reported apart" below), the report it replaces given back; it ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very version in the period; since plan 8R-5 the news carries the reports they replaced, `replaced`, so that the notifier tells a narrowing of a "one of" from a first report). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's version never changes what it is (its id; for Rocket, the id and `madeAt`, plan 8R-4L, review L1: a grunt refined in place keeps its id) (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, refs, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. A `ReportRef` is an id or a version `{ id, madeAt }` (review L1): one refined in place since is `changed`, before whose it is, and nothing of it is taken back (`StopReportStorage.remove(id, serverId, madeAt?)` asks the version again with the row locked); `kept(serverId, id)` gives a report by its id as it is kept now. The hourly upkeep (`PartyScheduler`, `stops`) sweeps ended reports.
 - `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a version of the list (found by reward words too; since plan 8R-5 one choice per reward and "one of", below) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
 - **One code path with the map** (plan 8R-3; `src/commands/research/research-report.ts`): `reportResearchAs(ctx, serverId, { stops, subject, reporter }, also?)` is the report as the member and the view of its answer's words (`ResearchWordsView`: the region channels whose posts show it, until when, none named in rehearsal mode); `/research report`, "Same task at more stops…" and the map call it. `stopsByKey` names stops by their keys (a titled PokéStop in a region of the server, a stop of Pine's own by `pine-<id>`, each once; the menu's and the map's). `takeBackAs(ctx, serverId, ref, by, staff)` takes a report back by its `ReportRef` (`removed` with `tookBackWords`, `not-yours`, `changed` where it was refined in place since the version asked for, `gone`): `/research remove` by the id it read, `/rocket remove` by the version it read (`{ id, madeAt }`, fix round 2, F6: a report refined meanwhile is `REPORT_CHANGED`), and the map. `reporterNamed` names a reporter (the name shown, else the account's, cut to 100). `NOT_YOUR_REPORT`, `REPORT_CHANGED` and `NOTHING_LEFT` (a Take back that finds nothing) are its words. `researchWords(view, channel)` (`src/render/research.ts`) words the answer with the caller's `ChannelNamer` (`DISCORD_CHANNEL`, `<#id>`, for the commands); `researchAnswer` wraps it with the controls and is the same message as before (an inline snapshot guards it).
-- The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced; since plan 8R-5 the same version is reported already, below), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as`, gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
+- The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced; since plan 8R-5 the same version is reported already, below), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as` (a pick that found every stop reported already is given back, plan 8R-6), gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
 
 ## Research rewards reported apart (plan 8R-5)
 
@@ -40,7 +40,7 @@ Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its
 - **Versions** (`src/domain/research/versions.ts`, pure): `taskVersions(task, catalogue)` gives one version per reward in the page's order (a reward the task lists twice, shiny or not, is one version, the first kept, and counts once towards "one of": review W4; value `<task key>:<reward hash>`, `rewardHash`: 8 hex digits, FNV-1a of `rewardKey`, `hexHash` of `src/domain/short-hash.ts`; label `Gible`, `Rare Candy ×3`, a costumed encounter `… (costumed)` (`COSTUMED_MARK`) where its name does not say what it wears, not where it does, `Pikachu wearing a Cosmog suit` (review L9, `wornBy`); `costumed` flags a costumed reward's version, L7; a version's costumed encounter carries `costumed: true` itself, kept in the report's detail, so `rewardsInShort` says `(costumed)` wherever its rewards are worded: the post's lines, the answer and its "was", "Already reported", the dialog and the DMs, review W1; a report of before has none, and `rewardKey` never reads it), then, for a task of two or more encounters, its "one of" (value the task's key alone, rewards its encounters only, label `one of Gible, Larvitar, Beldum`, `oneOfLabel`, the rewards `first` matches before the others). A task of one reward is that one version; of none, its key alone. `rewardKey` (moved from `leekduck.ts`, which merges a task listed twice by it) tells a costume only with the catalogue. `ResearchTaskService.versions(task)` and `byVersion(value)` (R1; `versionIndex`) work them out once per list and catalogue; the test fixture gives them too. A version gone from the list (a reward hash the task no longer has) is `TASK_LIST_CHANGED`.
 - **Subjects** (`src/domain/research/reports.ts`, pure): a report's `subjectKey` is its version: `<task>`, `<task>:<hash>`, `typed:<text key>` or `typed:<text key>:<hash>` (R11: a typed task with its reward), read only by `researchSubjectOf` (never split on `:`; `taskOfSubject` the task). A report's detail keeps the rewards it stands for (the one reward, the encounters of "one of"), so the post, the DMs and the map read it as before. `isOneOf(report)` (R10): its task's key alone with two or more rewards in its detail; a report made before plan 8R-5 has every reward of its task there, items too, and reads as such a "one of" until its period ends (nothing converts it). No migration: `subjectKey` is `varchar(64)`, the longest 31 characters.
 - **The decision** `decideResearch(standing, report, now, by, replacing)` against the stop's report of the report's own period only (R15: no `standingAt`, so a report under an intra-day window never meets the day's), each with the hashes of the rewards it stands for (`StopReportServiceOptions.rewardHash`, required, review L5: the game data's catalogue in `app.ts`, `fixtureRewardHash` of `test/support/stop-reports.ts` in tests; without the catalogue no reward would be costumed, and a costumed reward over its "one of" would ask): nothing standing or ended `new`; a reward over the "one of" of its task that holds it (or one of no reward, a typed task without one) `narrow`, replaced without asking; "one of" over one of its rewards `less` and the same version `again`, both reported already (`ResearchOutcome.already`); anything else a contradiction (another reward of the task, "one of" over an item or Mega Energy version, another task), `asks` (`ResearchOutcome.asks`, Matt's R7), unless it is the reporter's own report or one the member ticked (`replacing`, its id), `correct`, replaced. A key alone with one reward is that reward's version (R10). `StopReportService.contested(serverId, stops, subject, by)` reads the contradictions without a lock, so that a member is asked before anything is reported; `reportResearch` decides again under the lock, and a contradiction met there after all (another report meanwhile, or one left unticked) keeps its report and is answered as reported already. `ResearchNews.replaced` carries the reports the news replaced (the notifier's confirmations).
-- **`/research report`** (`research-input.ts`, `research.ts`): `task`'s choices are one per version (`versionChoice`: `Make 3 Excellent Throws in a row · Gible`, the task's text cut first), in the list's order; with words typed, every version of the tasks whose text has them all first, then the versions that have them across the task's text and their rewards' names together (`excellent gible`; R12), a "one of" naming the rewards typed first; with nothing typed the first 25. `readTask` (R2) takes a version (`<16 hex>:<8 hex>`, before the typed fallback), or a task's key or its text in full: with `reward:` the version of that reward (a plain one before a costumed one, by `TaskVersion.costumed`; `<task> does not give <reward>: pick the reward from the list.` where it has none; `PICK_THE_REWARD` where two fit alike, Rare Candy ×1 and ×3: review L7), without its only version, else its "one of", else `PICK_THE_REWARD`. The guard reads the task, the stops and `contested`; where another member's report is contradicted the command declares no `defer` and opens the dialog **"Replace field research?"** (`replaceDialog`; `readInTime` with nothing more to read; `PendingRequests`, `research:<token>:replace`, `carriesOn` the command's use and window): `replaceQuestion` (shared with the map: `Another member’s report stands at stops you named. Tick each one to replace that report with **task** · reward; a stop left unticked keeps its report.`, `you picked` from "Same task at more stops…", then `Submit reports at the other stops as well.` only where the use has stops without a contest, review L4) and a checkbox group "Replace the report at" of the contested stops, unticked (one option each, by the report's id: the stop's name, and `Make 3 … · Gible, by Misty at 10:42 AM` in the description, no markdown: `contestedDescription`, who and when always kept, the name cut to 32 and the task's text to the room left, the time as `clockText` since a description shows no Discord timestamp, review L3). Cancel reports nothing; Submit (`deferSubmit`) reports at every stop, `replacing` the ticked ones among those it asked about; a listed version gone from the list since the dialog opened is `TASK_LIST_CHANGED`, the use given back (review L8), and so is one whose research period ended since (the question keeps the key of the period it was counted in, `PERIOD_ENDED`, review W2: nothing is reported into the next day). Another member's Submit is `That is somebody else’s report.`, one answered already or too old `That question has expired.` The answer (`researchWords`): a stop's replaced report as `(was: one of Larvitar, Beldum, Gible)` or `(was: Gible)` within the task, nothing where the task's reward was not said (a typed task given its reward, review L6), `(was: <other task>)` else; the stops reported already after the lines (`researchAlready`: `Already reported: **task** · Gible at **Stop**, by **Misty** <t:R>.` and the link to the message of the pinned post that holds it, `postLinkOf` over `ctx.stopPostLinks`, `StopPostService.linkOf` as last drawn; none in rehearsal mode); where every stop was reported already only those lines, without Take back or "Same task at more stops…", and the use counts (R8, as `/rocket`'s `already`).
+- **`/research report`** (`research-input.ts`, `research.ts`): `task`'s choices are one per version (`versionChoice`: `Make 3 Excellent Throws in a row · Gible`, the task's text cut first), in the list's order; with words typed, every version of the tasks whose text has them all first, then the versions that have them across the task's text and their rewards' names together (`excellent gible`; R12), a "one of" naming the rewards typed first; with nothing typed the first 25. `readTask` (R2) takes a version (`<16 hex>:<8 hex>`, before the typed fallback), or a task's key or its text in full: with `reward:` the version of that reward (a plain one before a costumed one, by `TaskVersion.costumed`; `<task> does not give <reward>: pick the reward from the list.` where it has none; `PICK_THE_REWARD` where two fit alike, Rare Candy ×1 and ×3: review L7), without its only version, else its "one of", else `PICK_THE_REWARD`. The guard reads the task, the stops and `contested`; where another member's report is contradicted the command declares no `defer` and opens the dialog **"Replace field research?"** (`replaceDialog`; `readInTime` with nothing more to read; `PendingRequests`, `research:<token>:replace`, `carriesOn` the command's use and window): `replaceQuestion` (shared with the map: `Another member’s report stands at stops you named. Tick each one to replace that report with **task** · reward; a stop left unticked keeps its report.`, `you picked` from "Same task at more stops…", then `Submit reports at the other stops as well.` only where the use has stops without a contest, review L4) and a checkbox group "Replace the report at" of the contested stops, unticked (one option each, by the report's id: the stop's name, and `Make 3 … · Gible, by Misty at 10:42 AM` in the description, no markdown: `contestedDescription`, who and when always kept, the name cut to 32 and the task's text to the room left, the time as `clockText` since a description shows no Discord timestamp, review L3). Cancel reports nothing; Submit (`deferSubmit`) reports at every stop, `replacing` the ticked ones among those it asked about; a listed version gone from the list since the dialog opened is `TASK_LIST_CHANGED`, the use given back (review L8), and so is one whose research period ended since (the question keeps the key of the period it was counted in, `PERIOD_ENDED`, review W2: nothing is reported into the next day). Another member's Submit is `That is somebody else’s report.`, one answered already or too old `That question has expired.` The answer (`researchWords`): a stop's replaced report as `(was: one of Larvitar, Beldum, Gible)` or `(was: Gible)` within the task, nothing where the task's reward was not said (a typed task given its reward, review L6), `(was: <other task>)` else; the stops reported already after the lines (`researchAlready`: `Already reported: **task** · Gible at **Stop**, by **Misty** <t:R>.` and the link to the message of the pinned post that holds it, `postLinkOf` over `ctx.stopPostLinks`, `StopPostService.linkOf` as last drawn; none in rehearsal mode); where every stop was reported already only those lines, without Take back or "Same task at more stops…", and the use is given back (plan 8R-6, Matt: "Already reported" does not count; below).
 - **"Same task at more stops…"** (R14) carries its version in its custom id (`research:<id>:more:<version, . for :>`), so a first report narrowed or replaced meanwhile does not stop it: `moreSubject` takes the first report while it stands with that version, else the version as the list has it, else as a report of the period keeps it (a typed task), else `REPORT_ENDED` (given back); a first report of an ended period is `REPORT_ENDED` too, and so is a first report gone (taken back, replaced) where the answer's message was made in another period than now (`interaction.message.createdTimestamp`, review L1: yesterday's task is not reported into today); a menu of before plan 8R-5 (no version) reports its first report's subject as before. Its stops leave out those where the version stands, and for "one of" those where any version of the task stands (R8). A contradiction there opens the same dialog, `you picked` in its words; the reads (the subject, the stops, `contested`) are raced against `DIALOG_READ_MS` of the pick (`readOrDefer`, review F1, the slow-read rule): back in time, a contest opens the dialog (`askToReplace` checks the clock once more, `SLOW_READ` with the use given back; review L2), and without one the answer is deferred; past the budget the pick is deferred privately at once, and when the reads come back a contest is answered `SLOW_READ` in the deferred reply, the use given back (no dialog can open after a deferral), while without one the report goes on. A contradiction met after the reads is said as reported already.
 
 ## Team GO Rocket (plan 8R-2)
@@ -49,13 +49,13 @@ Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its
 - **One Rocket report per stop and day** (design 5.2, Matt's answer 4). A report is a `StopReport` row of the kind `rocket` (`RocketReport`: the detail is who by name and the catches as the lineups had them; `subjectKey` its `rocketKey`) in the day's period (`rocketDay`: `day:<date>` to local midnight; events change no hideout). Grunt and hideout share the row of the unique `(serverId, stopKey, kind, periodKey)`, so which stands is decided with that row locked: `StopReportStorage.saveUnless(report, keeps)` asks `decideRocket` (`src/domain/rocket/reports.ts`, pure) inside the transaction: nothing standing (or ended), reported; a hideout (a leader, Giovanni, the decoy) replaces whatever stands; the same grunt standing is `already`; another grunt replaces it; a grunt where a hideout stands `asks`, unless the member said Replace to that very hideout (`replacing` its id). Of one grunt type (plan 8R-4L, S10): "not sure which" where a lineup stands is `already` (the lineup says more); a lineup where "not sure which" or the other lineup stands, or the same lineup whose first slot differs (`StandingRocket.rocket.lineup`: the lineups rotated within the grunt's time, review L5), is `refine`, which changes the standing report **in place** (Matt's B2): `saveUnless`'s `decide` answers a `StandingVerdict` (`keep`, `replace`, `update`), and `update` gives that row the new report's who, detail, reporter, `madeAt` and `endsAt` under the stop's lock, keeping its id (a version strictly newer than the standing one, fix round 2, F1: `newerThan` makes `madeAt` at least a millisecond after the standing row's and moves `endsAt` as much, for grunts' in-place refines only, never for a report bound to a period, fix wave K2, so the writes of one id come in the order of their `madeAt`, whatever clock each read, and two versions are never equal; the report given back is the one written, which the messages and the DMs show; `SaveOutcome.inPlace`; the other rows of its place go as a replacement takes them; a duplicate met by the update runs the whole again, as an insert's does); `reportRocket` answers `refined`, tells nothing `ended` and draws no post. `StopReportService.reportRocket` gives the outcome; a grunt stands `gruntMs` (`gruntMinutes`), a hideout until midnight; what it replaced while it stood is told to the listeners as `ended`, a hideout made or replaced draws the posts (`changed`), the same hideout again is no news. The decision holds across midnight (fix A2): `reportRocket` passes `standingAt`, so a Rocket report of another period that still stands at the stop (a grunt of yesterday past midnight) is the one decided against, locked with the rest and replaced (told as `ended`). `rocketAt(serverId, stopKey)` is the stop's Rocket report; `at` is research only. `takeBack` tells what it removed as `ended` too, and `changed` only of research and hideouts (none for a grunt alone, fix A4).
 - **Reporting** goes through `RocketService` (`src/services/rocket-reports.ts`, `ctx.rocket`; `/rocket` and the map call it through `reportRocketAs`): the region channels whose outlines hold the stop first (`channelsAt`, `regionsAtPoint`; fix wave, L-1: one that cannot be found stores nothing, and no await comes between the stored outcome and the queueing of its posting's or refine's turn, so a refine stored after it never takes its turn before the posting), the report (`rocketSubject(choice)`), then for a grunt its message in each of those channels, then `NotifyService.rocketReported` with the messages (`RocketNews`); `already` comes back with the standing grunt's messages (`messagesOf`). Only finding the channels throws, before anything is stored, and storing, before anything is posted (fix A1): a channel whose message fails is passed over, and the notifier is told of what was posted. Outside rehearsal mode a grunt posted in none of its stop's region channels (all refused, or the bot shutting down) is taken back and answered `unposted` (fix A5: unseen, it would only answer "Already reported" without a link); a hideout it had replaced is put back under a new id in the grunt's place in one step under the stop's lock, so there is no moment without a report (`StopReportService.restore`, fix S4: unless its day has ended or another report than the grunt stands there by then; no new DM; the post is drawn anew), a grunt it had replaced cannot come back (its message is gone) and is named (fix R2); `/rocket` says so and gives the use back. A grunt that is no longer kept once its messages are posted (replaced by a newer report, or taken back, while they went out; `StopReportService.kept`, read anew) is `overtaken` (fix F3): nobody is told, its messages are deleted, and `/rocket` answers that a newer report at the stop took its place and gives the use back. A grunt refined in place while its messages were posted (another `madeAt`, review R2) tells nobody, as its refine tells; it is answered with the report as it stands, or, where it was posted nowhere, as `unposted` with the use given back (fix wave, K1: the refine's turn finds no message either and takes the refined version back; a hideout the grunt had replaced is put back in that version's place, `restore` asking for it by its id and `madeAt`, so the refine's undo finds it gone and takes nothing back; a grunt it had replaced is named as lost). A grunt `refined` in place (plan 8R-4L) has its messages edited (`GruntMessageService.refine`), then the notifier told as of a new report (the hour per type keeps a second DM from anyone told of the type; a member with a Shadow want of the new lineup's catches who was not told is told), and is answered as `reported` with what it refined as `replaced` (the notifier is told the reporter of what it refined as `RocketNews.alsoActors`, who is not told of it, review R3; one refined again meanwhile tells nobody, review R2; one whose messages were all found gone, outside rehearsal mode, is taken back as `unposted`, what it refined named as lost, review R5, but only after a complete pass, `RefinedGrunt.complete`: one whose refine could not tell is told with the messages known to stand, fix round 2, F2; one whose messages could not be read even at the second try, `RefinedGrunt.unread`, is told as rehearsal mode tells, by the stop's region channels without message ids, so that Shadow wanters of the new lineup still hear, and its messages keep their old end, fix wave, L-5); its id, and so an answer's Take back (now the new reporter's) and every DM's "Go to report", stay. Outside rehearsal mode a grunt's DMs name only the channels it was posted in (fix R3). In rehearsal mode it has no message service: nothing is posted, the report is kept and told.
 - **One code path with the map** (plan 8R-3; `src/commands/rocket/rocket-report.ts`): `reportRocketAs(ctx, serverId, { choice, stop, reporter, replacing? }, channel)` reports through `ctx.rocket.report` and gives each outcome for the caller (`reported` with the view of `rocketWords`, `already` with the grunt's messages, `asks` with the hideout, `unposted` and `overtaken` with their words, the channels named by `channel`); `/rocket report`, its dialog's Submit and the map call it. `hideoutQuestion(hideout, grunt)` is the question's words (the dialog adds "Submit replaces it."); `rocketWords(view, channel)` the answer's, which `rocketAnswer` wraps (an inline snapshot guards it); `alreadyReported(standing, link, by?)` names the reporter as the caller gives them (the map: by name, never an id). `GIOVANNI_ONLY_WHEN_SURE` is the warning of `/rocket report`'s help and of Giovanni's choice on the map.
-- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, `**Where**` the stop's line with its maps link and picture, a gallery of the catches' pictures (ten at most), the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). A report's posting, refines and end run in turn per report id (`KeyedLock`, review R1): a refine edits every message its posting sent, and an end deletes what a refine kept. A grunt refined in place (plan 8R-4L, `refine`) has each of its messages edited where it stands as the kind it was sent as (`sentAs`, review R6: components v2, or plain text, never by what the bot may do in the channel by then; where Discord refuses the edit for what it holds, components v2 once more without pictures; a message known to be components v2 is never edited as plain text, one sent as plain text is tried as components v2 after; a message of an earlier process, whose kind is not known, is guessed by the rule `send` used, `mayPost`, then tried as the other kind, fix round 2, F4), keeping the message ids; it gives the messages that stand and whether it looked at every one (`RefinedGrunt`, F2: `complete` false for five causes, fix wave K3: `messagesOf` failed, read once more and failed again, L-5, `unread`; a newer version is shown already; the service closed on the way; the report ended on the way; a delete of one of its messages was on its way); a refine older (`madeAt`) than what the messages show already edits nothing (`shown`, review R2), and one whose report ended while an edit was on its way retimes and keeps nothing (review R4); a message whose edit fails stays as it was and is logged, one gone is forgotten; each one's delete follows the new `endsAt` (`GruntMessageStorage.retime`, the timer set anew). The heading stays the type's name (`### Water-type grunt`), never the gender. `messagesOfReports(ids)` reads the messages of many reports at once (`GruntMessageStorage.ofReports`; the map's list, plan 8R-3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports); it posts and edits no more, sets no timer, and waits for the postings, refines and ends on their way (`KeyedLock.whenIdle`, fix round 2, F5): an edit made meanwhile is recorded with its new end, which the next start's sweep keeps.
-- **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. Plan 8R-4L (S8, S11, B3–B5, B14): once the typed words find something, a grunt type of two lineups is three choices, each lineup by its first slot (`Water-type grunt · Magikarp, Feebas`, value `lineupValue`) in the feed's order, then `Water-type grunt · not sure which` (`NOT_SURE_WHICH`, the type's key and both lineups' catches), while the whole list fits 25, else one choice per type; with nothing typed one per type (24 today; 28 with the lineups); "Did you mean" names each type once. `readWho` takes `<lineup key>#<fingerprint>` while the type's lineups hold that lineup with that fingerprint (a rotation that changed it, or a type that lost its second lineup, is `LINEUPS_CHANGED`), as it does a lineup's key without `#`, a merged key with one and a `#` value of no key; a name typed is the merged choice. The report's `subjectKey` is the lineup's key and its catches the lineup's (`rocketSubject`, with `RocketDetail.lineup` the first slot in short); its name stays the type's in the grunt's message, the DMs and the pinned post. A grunt is named with its lineup where it is named apart from its catches (`rocketLabel`: `Water-type grunt · Magikarp, Feebas`): the answer's "was" line (a grunt of the same type without one as "Water-type grunt, not sure which"), "Already reported", the hideout question and the map's view. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message. The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced ("again" only where its key and its `rocket.lineup` are the new one's, fix wave, L-3; else "was:" with its `rocketLabel`, so a lineup whose first slot rotated is named as it was), where it shows (the grunt's channels and when it goes; a hideout's pinned posts until midnight; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for every :>:<madeAt in base 36>`, taking back that version only, review L1: a report refined in place since answers `REPORT_CHANGED` to anyone, its first reporter and staff too; `replaceAll` both ways since plan 8R-4L (S9), a fourth argument refused; the longest Wayfarer key with `grunt.electric.female` and a ten-digit id is 90 characters; the bare `rocket:<id>:back` where that would pass 100 characters; `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop made at the same moment and standing now, a hideout put back under a new id, which keeps its `madeAt` (fix S3), never a newer report of the same who (fix F1)). `/rocket remove` takes back one's own report at a stop, any for staff.
+- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, with one picture beside them by the rule (plan 8R-6, `GruntView.picture`; no gallery), `**Where**` the stop's line with its maps link and picture, the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). A report's posting, refines and end run in turn per report id (`KeyedLock`, review R1): a refine edits every message its posting sent, and an end deletes what a refine kept. A grunt refined in place (plan 8R-4L, `refine`) has each of its messages edited where it stands as the kind it was sent as (`sentAs`, review R6: components v2, or plain text, never by what the bot may do in the channel by then; where Discord refuses the edit for what it holds, components v2 once more without pictures; a message known to be components v2 is never edited as plain text, one sent as plain text is tried as components v2 after; a message of an earlier process, whose kind is not known, is guessed by the rule `send` used, `mayPost`, then tried as the other kind, fix round 2, F4), keeping the message ids; it gives the messages that stand and whether it looked at every one (`RefinedGrunt`, F2: `complete` false for five causes, fix wave K3: `messagesOf` failed, read once more and failed again, L-5, `unread`; a newer version is shown already; the service closed on the way; the report ended on the way; a delete of one of its messages was on its way); a refine older (`madeAt`) than what the messages show already edits nothing (`shown`, review R2), and one whose report ended while an edit was on its way retimes and keeps nothing (review R4); a message whose edit fails stays as it was and is logged, one gone is forgotten; each one's delete follows the new `endsAt` (`GruntMessageStorage.retime`, the timer set anew). The heading stays the type's name (`### Water-type grunt`), never the gender. `messagesOfReports(ids)` reads the messages of many reports at once (`GruntMessageStorage.ofReports`; the map's list, plan 8R-3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports); it posts and edits no more, sets no timer, and waits for the postings, refines and ends on their way (`KeyedLock.whenIdle`, fix round 2, F5): an edit made meanwhile is recorded with its new end, which the next start's sweep keeps.
+- **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. Plan 8R-4L (S8, S11, B3–B5, B14): once the typed words find something, a grunt type of two lineups is three choices, each lineup by its first slot (`Water-type grunt · Magikarp, Feebas`, value `lineupValue`) in the feed's order, then `Water-type grunt · not sure which` (`NOT_SURE_WHICH`, the type's key and both lineups' catches), while the whole list fits 25, else one choice per type; with nothing typed one per type (24 today; 28 with the lineups); "Did you mean" names each type once. `readWho` takes `<lineup key>#<fingerprint>` while the type's lineups hold that lineup with that fingerprint (a rotation that changed it, or a type that lost its second lineup, is `LINEUPS_CHANGED`), as it does a lineup's key without `#`, a merged key with one and a `#` value of no key; a name typed is the merged choice. The report's `subjectKey` is the lineup's key and its catches the lineup's (`rocketSubject`, with `RocketDetail.lineup` the first slot in short); its name stays the type's in the grunt's message, the DMs and the pinned post. A grunt is named with its lineup where it is named apart from its catches (`rocketLabel`: `Water-type grunt · Magikarp, Feebas`): the answer's "was" line (a grunt of the same type without one as "Water-type grunt, not sure which"), "Already reported", the hideout question and the map's view. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message, and gives the use back (plan 8R-6). The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced ("again" only where its key and its `rocket.lineup` are the new one's, fix wave, L-3; else "was:" with its `rocketLabel`, so a lineup whose first slot rotated is named as it was), where it shows (the grunt's channels and when it goes, `Posted in #…`, or `Changed in #…` for a grunt refined in place, plan 8R-6, `RocketReported.changed`; a hideout's posts until midnight, `In the post "Today’s Stops" of #…`; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for every :>:<madeAt in base 36>`, taking back that version only, review L1: a report refined in place since answers `REPORT_CHANGED` to anyone, its first reporter and staff too; `replaceAll` both ways since plan 8R-4L (S9), a fourth argument refused; the longest Wayfarer key with `grunt.electric.female` and a ten-digit id is 90 characters; the bare `rocket:<id>:back` where that would pass 100 characters; `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop made at the same moment and standing now, a hideout put back under a new id, which keeps its `madeAt` (fix S3), never a newer report of the same who (fix F1)). `/rocket remove` takes back one's own report at a stop, any for staff.
 
-## The pinned post "Today at the stops"
+## The pinned post "Today’s Stops"
 
 - `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. The region's summary post links it (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the post's first message and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged` of the channel's region) is told after each draw and each delete, so the summary is drawn anew after every draw of the post and edited where the counts changed. Where the post lives, the region's channel or its forum, is open until the 8R staging.
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, one picture; the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, a picture per reward line (plan 8R-6, "Pictures at the stops"); the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"); within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it); under an intra-day window (or a big event's daily hours) the day's research waiting stays below the window's tasks (plan 8R-6, Matt: `StopPostView.waiting.tasks`, under `### Back at <t:…:t>, after <event>`, in the same blocks without pictures, before the hideouts; the line "The day's research comes back at" is gone; it counts in the layout and the busy day as any block, and the placement keeps the window's message for a key both have). Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (its picture by the rule beside it, plan 8R-6: a leader's or Giovanni's portrait) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 - `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
 ## Wants and DMs
@@ -63,3 +63,24 @@ Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier"). "Grunt (no type)" is typed as `no type`, `no type grunt` or `grunt (no type)`; `none` typed in full is zero IVs, the legacy word (fix F4), and the list of choices offers both for it.
 - A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority (plan 8R-5: a "one of" by any of its encounters, its DM naming the member's reward first; see `notifications-and-dms.md`, "Research by version"), one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
 - A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
+
+## Pictures at the stops (plan 8R-6)
+
+Design `docs/superpowers/specs/2026-10-23-stop-pictures-design.md` and its mockups (Matt, 2026-10-23: Leek Duck's icons are not square, and Discord crops a thumbnail to a square).
+
+- **The rule** (`src/domain/stops/pictures.ts`, pure): `researchPicture(rewards)` for a reward line of the post, a research DM and a confirmation: one reward its own picture (a Pokémon `pokemon`, an item or Mega Energy `item`); two or more ("one of", or a report of before plan 8R-5 holding every reward of its task) the game's encounter picture `ENCOUNTER_PICTURE` (PokeMiners' `Images/Quests/QuestPokemonReward.png`, pinned to their commit `c2a686eb`, byte-identical to master's on 2026-10-24, so it cannot change under the bot) while any is an encounter, several items alone none; none without a reward or a picture. `rocketPicture(key, catches)`: a leader or Giovanni the portrait (`LEADER_PORTRAITS`, `GIOVANNI_PORTRAIT` in `src/domain/rocket/portraits.ts`, Leek Duck's, square already), a grunt or the decoy of one possible catch that Pokémon, of two or more the encounter picture, of none known none. A `StopPicture` is the source address and its kind; the encounter picture and the portraits count as Pokémon. `isPictureSource(url)` is the allowlist a fetch takes: https of `cdn.leekduck.com` as `leekDuckPicture` takes it, and the encounter picture's address. Renderers take a `PictureLookup` (source to address, or none where the source is gone: the renderer then shows no picture, rule 6; `AS_FED` the source itself) and stay pure.
+- **`StopPictures`** (`src/services/stop-pictures.ts`, made in `app.ts`, told `serving()` beside the eggs, closed first at shutdown; the services take it as `PictureMaker`, its `prepare` and `url`): `prepare(sources)` fetches what is missing or older than `RENEW_MS` (only `isPictureSource`, `redirect: 'error'`, Pine's User-Agent, ten seconds, `MAX_PICTURE_BYTES` 512 KB read with `readLimitedBytes`, an `image/*` answer, sharp's `limitInputPixels` `MAX_PICTURE_PIXELS`, then refused where its longest side passes `MAX_PICTURE_SIDE` (1024) or it is no png, jpeg, webp or gif, SVG among them; four at once across every `prepare`, one fetch per source whoever asks). It waits only for the missing pictures, and for `PREPARE_DEADLINE_MS` (2.5 seconds) at most, so a slow Leek Duck holds up no post, DM or grunt's message for long; an old picture is served while it is fetched again; the fetches still running go on in the background (`idle()` waits for them, `close()` aborts them, records none as failed, and every `prepare` after it returns at once), and what lands late is named at the next redraw (nothing is redrawn on landing). It pads it to a square with transparent edges, centred and unscaled, as `scripts/eggs/make-eggs.ts` made the eggs, and keeps it in `var/pictures/<key>.png` (`PICTURE_FOLDER`; `key` the first 32 hex digits of the SHA-256 of the source address, never the address; written through a temporary file and `moveIntoPlace`, shared with `ImageCache`, its file's time when it was made). At most `MAX_PICTURES` (2,000) are kept, in a `BoundedMap`: a picture that lands in a full index makes room at once, before anything is awaited, by the oldest made that is not being fetched again (the oldest of all where every one is), whose file is deleted after; `start()` reads the index back from the folder (each file's time and the SHA-256 of what it holds, the oldest beyond the bound deleted, leftover `.tmp` files removed), so a restart fetches nothing again. A picture older than `RENEW_MS` (7 days) is fetched again by the next `prepare` (the old one served meanwhile, and kept where the fetch fails for any reason but a gone source); a failed fetch is not tried again for `FAILED_AGAIN_MS` (30 minutes), logged as "could not make a picture square" with the source and the reason, and remembered with whether the source is gone (it answered 404 or 410, `PictureGone`). `url(source)` gives `<publicUrl>/pictures/<key>.png?v=<8 hex of its SHA-256>` once the web server listens at a public address (`settings.web`, not this machine's: `isLocalAddress`); none (`undefined`) for a source that is gone, also over a picture kept from before, until a later fetch of it works, so every renderer leaves the picture out (rule 6; a portrait that answers 404 gives a hideout without one); and the source itself before `serving()` and without a public address (nothing is fetched then), and while a picture is not ready or its fetch failed for another reason: the feed's cropped icon, PokeMiners' raw address for the encounter picture. No attachments. `read(key)` is the route's: only what it made.
+- **Where `prepare` runs:** `StopPostService.draw` before it lays a post out (in the channel's queue, after `POST_DELAY_MS`; not for the plain text post); the notifier's research and Rocket announcements in `gather`, once somebody is to be told; `GruntMessageService` in a report's turn before it posts or edits its messages. A post drawn before the pictures are ready (a fetch past the deadline, the start's catch-up) names the feeds' addresses until its next redraw.
+- **The pinned post** (`stopPostMessages(view, picture)`; `postPictures(view, picture)` the sources `prepare` gets, read off the layout itself with the same lookup as the draw (`StopPostService` passes `StopPictures.url` to both), so only those it can show, a gone source listed too so that it is asked for again once its failure is old while the next line's picture takes its place: none past the six of a task, none of a version with no stop shown or of a task counted by "…and N more", none of the day's research under a window, none of items and Mega Energy on a busy day): each version of a task a section with its thumbnail by the rule, the task's text a text display above them; a task of one version one block as before (one section); a hideout one section after the heading `### Team GO Rocket hideouts`, a text display of its own. At most `PICTURES_PER_TASK` (6) pieces of a block carry a picture, Pokémon first, then items, in the list's order (a picture the lookup names none for takes no place among the six, and its piece is text); pieces without one in a row share one text display (the task's text, the lines past the six, `reward not said`, the "…and N more stops" line); a version with no stop shown has no piece and no picture. **A busy day** is decided for the whole post: laid out with every picture; where that needs more than one message, laid out again without the pictures of items and Mega Energy, and spilled as before from there. The same view always gives the same layout. The day's research under a window (above) has no pictures.
+- **DMs:** `researchDmBrief(view, picture)` and `researchConfirmBrief(view, picture)` by `researchPicture` (a "one of" DM the encounter picture, also with the member's reward named first; a confirmation the Pokémon); `rocketDmBrief({ key, … }, picture)` by `rocketPicture`; a DM whose picture is gone has none. DMs sent stay as they are when a grunt is refined.
+- **A grunt's message:** one picture beside its heading (`GruntView.picture`, worked out in `GruntMessageService` from the report as it is, so a grunt refined in place takes the picture of its new catches); the stop's photo stays beside Where; a message sent again without pictures has neither.
+- **The map** follows the post: a hideout's `picture` is `rocketPicture`'s source as `StopPictures.url` names it (`stop-report-view.ts`, `StopReportViewInput.picture`: the square picture Pine serves, none where it is gone), only from `pictureOrigins`, which names Pine's own origin and the encounter picture's (`web.md`).
+
+## The 8R staging's small fixes (plan 8R-6)
+
+- A DM's reason for an item or Mega Energy is `Rare Candy · Research`, `Charizard Mega Energy · Research` (`targetReasonLabel`, `src/domain/pogo/want-boxes.ts`), the shape of `Gible · Research`; lists and answers keep `targetWantLabel`.
+- No answer says "pinned": `In the post "Today’s Stops" of #…` (`researchWords`, `rocketWords`); the bot cannot know whether the post will be pinned when it answers. The post is "Today’s Stops" (Matt, 2026-10-23) in its heading (`## Today’s Stops`, `-# Today’s Stops, continued (n)`), every answer, the summary's link, the help and the permission check's words; nothing finds a post by its title.
+- A grunt refined in place is answered `Changed in #…` (above).
+- `/want`'s list puts the choices of Team GO Rocket, items and Mega Energy that hold every typed word as a whole word before the first Pokémon that is only a near match (`wholeWordsBeforeGuesses`, `src/commands/choices.ts`): `rocket` gives Team GO Rocket before Rowlet; the order of the Pokémon, tiers and IVs among themselves is unchanged.
+- The task search finds a "one of" choice by the words `one of` too (`taskChoices`).
+- **"Already reported" does not count** (Matt): `/research report`, "Same task at more stops…" and the "Replace field research?" dialog's Submit that reported at no stop, and `/rocket report` (and its dialog) answered `already`, answer as before and throw a `UserError` with `givesBack` and `said`, so the router gives the use back; a use that reports at any stop counts, also when other stops were reported already (review Q8). The router gives back at most as many uses as the window holds, so a member who keeps meeting "Already reported" is counted after that (Matt, 2026-10-24: keep that cap, and say it in the help). On the map the research POST's 409 of every stop reported already and the Rocket POST's `already` 409 are given back with `givenBackOnTheMap` in the command's window, as the `asks` answers are. The help of both commands says so.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 33656552b665860fdc98c5cd11dbf5e0d579f59d..fd6c00fdd59092ffda19f62c1fc519386f93a881 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -34,6 +34,8 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 
 ## Pictures and emoji
 
+- The pictures of the reports at stops (which picture a reward, a grunt or a leader shows, and the square copies the web server serves) are in `stop-reports.md`, "Pictures at the stops" (plan 8R-6).
+
 - The picture of a Pokémon is `pokemonPicture(source)` (`src/domain/pogo/pokemon-icons.ts`): the feed's picture of a current boss wins, else the game's icon (`iconName`: the first candidate that exists in the list of icon files the bot downloads with the game data, `settings.gameData.iconsUrl`; a form that only changes the look shows the species' plain file, a species with per-form files a preferred form, never a mega's), served by Leek Duck's CDN (`POKEMON_ICON_BASE`). A mega the icon list lacks (13 of 61 on 2026-10-23, the newest) shows its portrait from PokeMiners' `Images/Mega Portraits 512x512` (`MEGA_PORTRAIT_BASE`, `portraitNamesOf`, the listing at `settings.gameData.megaPortraitsUrl`, which has a default): its names are kept in the same `PokemonIcons` (`portraits()`, `iconsOnly()`), downloaded, saved and refreshed with the icons, a failed listing of either keeping its own part of the list in use; the web map's image policy allows the portraits' origin (`pictureOrigins`). Tests use `iconsFixture()`.
 - Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep, and at once when Discord refuses one on a button (`refused()`, at most once in `REFUSED_REREAD_GAP_MS`, a minute, logged; plan 8D-H, `parties-and-posts.md`); a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`, the leagues of Go Battle League for `/rank` (`leaguelittle leaguegreat leagueultra leaguemaster`, `LEAGUE_ICON`, from `Images/Combat`), and legacy Pine's reaction icons for the posts' buttons, `pinejoin pinehere pinedone pineremote pineleave` (`CONTROL_ICON_NAMES`, plan 8D-G); the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. An answer that is no post finds them the same way through `ctx.emoji` (`EmojiFinder`, `emojiFinder` in `src/services/application-emoji.ts`: `find(name, guildId)`, the application's first, then the server's by the interaction's own server id (`DiscordApplicationEmoji.inServer`, from the cache of servers, not through a channel), none of a server in a DM; the test context finds none). `npm run emoji:upload` / `./pine emoji-upload` (`src/ops/emoji-upload.ts`) makes them from PokeMiners' pogo_assets at a pinned commit, the buttons' icons from the bot's own files (`pictures/emoji/<name>.png`, `EMOJI_FOLDER`: copies of the legacy bot's `assets/images/reactions/`, 43 to 130 pixels), each fitted into a transparent square of `EMOJI_PIXELS` (128) under Discord's 256 KiB (`emojiImage`), an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`src/ops/role-auth.ts`): Discord sets each by itself.
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index a5cf6fd8e8bceb65b71d2834ba0aa89ffe67ca0f..477f2b9ed24e363b30f32e9194f8d2fa2eed5906 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -12,11 +12,11 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Headers and the Content Security Policy
 
-- Every answer carries `securityHeaders` (`src/web/headers.ts`, pure, tested): the CSP (`default-src 'none'`; scripts, styles and fonts from Pine alone, no inline script or style; pictures from Pine, `data:`, `https://tile.openstreetmap.org`, `https://tile.googleapis.com` with Google's tiles, and the picture hosts of posts (`pictureOrigins`: the origins of `POKEMON_ICON_BASE` and of `publicUrl`, whose `/eggs/` serves the eggs, never typed by hand); connections to Pine and, with Google's tiles, the Map Tiles API; `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` (Google checks a browser key's referrer by Pine's origin). Leaflet sets `style` attributes from its script, which `style-src` does not govern; a page that needs an inline style or script is a design error.
+- Every answer carries `securityHeaders` (`src/web/headers.ts`, pure, tested): the CSP (`default-src 'none'`; scripts, styles and fonts from Pine alone, no inline script or style; pictures from Pine, `data:`, `https://tile.openstreetmap.org`, `https://tile.googleapis.com` with Google's tiles, and the picture hosts of posts (`pictureOrigins`: the origins of `POKEMON_ICON_BASE`, `MEGA_PORTRAIT_BASE`, the stops' `ENCOUNTER_PICTURE` (plan 8R-6; the megas' host) and `publicUrl`, whose `/eggs/` serves the eggs and `/pictures/` the stops' square pictures, never typed by hand); connections to Pine and, with Google's tiles, the Map Tiles API; `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` (Google checks a browser key's referrer by Pine's origin). Leaflet sets `style` attributes from its script, which `style-src` does not govern; a page that needs an inline style or script is a design error.
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
@@ -100,10 +100,10 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page (`src/web/client/`) has none of it yet (no layer, popups, Report research / Report Rocket, right-click, filter): left for the UX pass (follow-ups, "From the 8R-3 prototype"). No migration, no command change.
 - **One code path per command** (spec 3.5; `stop-reports.md`, "Reports and `/research`"): `reportResearchAs` and `stopsByKey` (`src/commands/research/research-report.ts`), `reportRocketAs` and `hideoutQuestion` (`src/commands/rocket/rocket-report.ts`), `takeBackAs`; the answers' words are `researchWords` and `rocketWords` with the caller's `ChannelNamer` (on the map a region channel as `#west`, `Region 5` where the bot sees no name), the heading of the command's answer left out, made page text by `pageWords`. The web server is given what the commands read and call (`StopWebDeps.ctx`, `StopWebContext`), the channel names the bot sees (`channelName`), the pinned posts' messages as last drawn (`posts`: `StopPostService.linkOf`, which draws nothing and waits for nothing, unlike `messageOf`, which flushes the gathered redraw and would edit a post on every poll) and the grunts' messages (`grunts`: `GruntMessageService.messagesOfReports`, one read for every grunt of a request, `GruntMessageStorage.ofReports`); both undefined in rehearsal mode, which leaves the web server off anyway.
 - **Who sees which reports** (review R1): a report lies in the regions of the server whose outlines hold its stop's snapshot (`regionsAtPoints`: the server's regions taken once a request and each outline's box tried first, `containment` as the pinned post's; each report placed once, for who may see it and for the view alike; a stop renamed or gone later the same day stays, design 3), and shows unless the member is `barred` from the forum of every one of them (a region without a forum always shows it): the parties' rule, through the same `PartyViewers` (one for `/api/parties` and `/api/stop-reports`, made in `guildRoutes`, so that what Discord said of a forum serves both; read-only while Discord is away, 503 for a member it has not confirmed lately). No text channel is fetched. A report in no region now is shown to nobody.
-- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (its version, plan 8R-5: `<task key>:<reward hash>`, the task's key alone for "one of", `typed:<key>[:<hash>]` for a typed task: it tells versions apart; the same version at more stops is sent as `sameAs` of the report's `id` while the report stands, and once it is gone (narrowed or replaced since, where `sameAs` is `REPORT_ENDED`) as the report's `task` with `more: true` for a listed one (review R4, the controller's call; F3), a typed one's `task` being refused), `text`, `category`, `typed`, `oneOf` (R13: `isOneOf`, a report of before plan 8R-5 with every reward of its task too), `rewards` (the one reward, or those "one of" stands for); grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
+- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (its version, plan 8R-5: `<task key>:<reward hash>`, the task's key alone for "one of", `typed:<key>[:<hash>]` for a typed task: it tells versions apart; the same version at more stops is sent as `sameAs` of the report's `id` while the report stands, and once it is gone (narrowed or replaced since, where `sameAs` is `REPORT_ENDED`) as the report's `task` with `more: true` for a listed one (review R4, the controller's call; F3), a typed one's `task` being refused), `text`, `category`, `typed`, `oneOf` (R13: `isOneOf`, a report of before plan 8R-5 with every reward of its task too), `rewards` (the one reward, or those "one of" stands for); grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (as the post shows it, plan 8R-6: `rocketPicture`, a leader's or Giovanni's portrait, a decoy's one catch or the encounter picture, named as `StopPictures.url` names it, `WebDeps.pictures`: the square picture under `/pictures/` once it is made, none where its source is gone). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
 - **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards, versions }` (`versions`, plan 8R-5, R13: `{ value, label, oneOf }` as `/research` offers them, `ResearchTaskProvider.versions`; a report sends a `value` as its `task`), `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
-- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, more?, stops, replacing? }` or `{ sameAs, stops, replacing? }` (strict, one or the other, never both nor neither; `replacing` the ids of the reports the member said to replace, up to five, plan 8R-5: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…" while that report stands; `more: true` beside `task` for "Same task at more stops…" once it is gone, the report's `task` sent as `task` (review R4, F3); one to five stop keys, each up to 60). `sameAs` and `more` are "Same task at more stops…" alike: its question says the stops `picked` and `reportResearchAs` gets `also` (the "Also reported" of Discord's answer; the map's words leave the heading out). A listed report of before plan 8R-5 has its task's bare key as `task`: one whose rewards are only items names no one reward, and `more` with it is refused with `PICK_THE_REWARD` (422), accepted since such reports stand only on the day of the deploy. Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a Power Spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Without `replacing`, **the contradiction question** (plan 8R-5, R7), where `/research` opens its dialog: other members' reports at the stops that the version contradicts (`StopReportService.contested`), unless `/research report`'s window is full (429, nothing counted), 422 `{ ok: false, text: replaceQuestion(…), asks: { reports, hidden? } }` (the contested reports as the list shows them, where shown; those it does not show the member, in a region they are kept out of or all where `shownTo` fails, by id and stop name only as `hidden: { id, stop }[]`, review R5, so that the page can still overrule them); sent again with `replacing` (any of their ids, none for none), those are replaced and the others keep theirs, decided anew inside the store. Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research, already }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew`, a line per stop, where it shows; the stops reported already after them, R8, by the reporter's name and without a link), the stops reported already (the same version, or one that says more, standing there; or a contradiction met after the question) as `already`; where every stop was, 409 `{ ok: false, text, research: [], already }`, counted as `/research` counts it, the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `already`, `asks`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends `sameAs` with the listed report's id; once that is `REPORT_ENDED`, the report's `task` with `more: true`; a typed task only `sameAs`. It is counted in `/research report`'s window as the command's menu is.
-- **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key, a lineup's `value` (plan 8R-4L: a fingerprint not of now is `LINEUPS_CHANGED`, uncounted) or a name typed in full, 1 to 100; a lineup over "not sure which" or the other lineup refines the grunt in place, as `/rocket` does, its `grunt` keeping its id; the question names a lineup by `rocketLabel`; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (counted, as `/rocket` counts it, 8R-2); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
+- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, more?, stops, replacing? }` or `{ sameAs, stops, replacing? }` (strict, one or the other, never both nor neither; `replacing` the ids of the reports the member said to replace, up to five, plan 8R-5: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…" while that report stands; `more: true` beside `task` for "Same task at more stops…" once it is gone, the report's `task` sent as `task` (review R4, F3); one to five stop keys, each up to 60). `sameAs` and `more` are "Same task at more stops…" alike: its question says the stops `picked` and `reportResearchAs` gets `also` (the "Also reported" of Discord's answer; the map's words leave the heading out). A listed report of before plan 8R-5 has its task's bare key as `task`: one whose rewards are only items names no one reward, and `more` with it is refused with `PICK_THE_REWARD` (422), accepted since such reports stand only on the day of the deploy. Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a Power Spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Without `replacing`, **the contradiction question** (plan 8R-5, R7), where `/research` opens its dialog: other members' reports at the stops that the version contradicts (`StopReportService.contested`), unless `/research report`'s window is full (429, nothing counted), 422 `{ ok: false, text: replaceQuestion(…), asks: { reports, hidden? } }` (the contested reports as the list shows them, where shown; those it does not show the member, in a region they are kept out of or all where `shownTo` fails, by id and stop name only as `hidden: { id, stop }[]`, review R5, so that the page can still overrule them); sent again with `replacing` (any of their ids, none for none), those are replaced and the others keep theirs, decided anew inside the store. Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research, already }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew`, a line per stop, where it shows; the stops reported already after them, R8, by the reporter's name and without a link), the stops reported already (the same version, or one that says more, standing there; or a contradiction met after the question) as `already`; where every stop was, 409 `{ ok: false, text, research: [], already }`, the use given back as `/research` gives it back (plan 8R-6: `givenBackOnTheMap` in `researchWindow`), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `already`, `asks`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends `sameAs` with the listed report's id; once that is `REPORT_ENDED`, the report's `task` with `more: true`; a typed task only `sameAs`. It is counted in `/research report`'s window as the command's menu is.
+- **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key, a lineup's `value` (plan 8R-4L: a fingerprint not of now is `LINEUPS_CHANGED`, uncounted) or a name typed in full, 1 to 100; a lineup over "not sure which" or the other lineup refines the grunt in place, as `/rocket` does, its `grunt` keeping its id; the question names a lineup by `rocketLabel`; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (the use given back, as `/rocket` gives it back, plan 8R-6); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
 - **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty, `{}`, or `{ madeAt }`, the report's `madeAt` as the list gave it, plan 8R-4L, review L1; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), with a `madeAt` that is no longer the report's before that (a grunt refined in place since keeps its id: 409 `{ ok: false, text: REPORT_CHANGED }`, for its first reporter and staff alike, and again where `takeBackAs` meets a refine meanwhile, `changed`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
 
 ## The region editor (plans 8M-2, 8M-2F)
````
