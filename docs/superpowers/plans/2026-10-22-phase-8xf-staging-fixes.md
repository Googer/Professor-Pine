# Phase 8X-F: Fixes from the 8X Staging Run: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine findings of the 8X staging run of 2026-10-22 (follow-ups, "From the staging run of 8X"):

- **Typed `/route add`:** a clear stop of the other kind that fits strictly better wins over several of the train's own kind (a gym's exact name on a max train is added, as design 6.2 says); a tie still answers "Several places fit".
- **`/max spot:` with nothing typed** lists the region's power spots by name (the helper `regionSpotChoices`, shared with `/route add`).
- **`/boss tier:`** for a max battle's boss on no list; without it such a boss asks "Which tier?" as `/max` does (in a Gigantamax battle a Pokémon that can Gigantamax is taken as G); `tier:` in a raid's or train's post is refused.
- **A per-open token** (`~` and the opening moment in base 36, the last argument) in the custom ids of Meet…, the which-group dialog and Group…, so that Discord's client does not restore a value submitted before; forms opened before still submit.
- **Max and big events kept in the database** (migration 029, table `MaxEvent`, `MaxEventRepository` with its memory twin): the week's featured boss and a big event survive a restart after ScrapedDuck drops them.
- **Words:** `endSentence` (no doubled period after a place name ending in one, "Inc.."); the answer about a battle already at the spot names its boss and "this spot"; "at an unlisted power spot" mid-sentence in DMs; "Over the lobby size: somebody should consider moving to another group."; the want dialog's Dynamax choice without ", 1 to 5 stars".
- **Notification DMs:** the note under the news, the Stop buttons last, after all text; the note counted against Discord's 40 components.
- **Docs:** `MOVE_NONE` in Pokebattler's max teams (Hydreigon's "Bite" alone, no code change); the 8X-5 staging checklist's steps 8 and 14; the raid events still only in memory (follow-ups).

**Architecture:** `src/commands/trains/route.ts`, `raid-input.ts`; `src/commands/place-option.ts` (`regionSpotChoices`), `max/max.ts`, `max/max-input.ts`, `max/max-changes.ts`, `max/max-report.ts`, `raids/boss.ts`; `src/discord/dialog.ts` (`openToken`, `withoutOpenToken`), `render/meet-dialog.ts`, `render/group-dialogs.ts`, `commands/parties/meet-dialog.ts`, `group-dialogs.ts`; `src/db/migrations/2026_10_22_029_max_events.ts`, `db/repositories/max-event-repository.ts`, `services/raid-event-service.ts`, `app.ts`, `test/support/max-event-store.ts`; `src/render/text.ts` (`endSentence`) and its sites; `src/render/notify-dm.ts`.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely, Vitest. No new dependency. **Migration 029** (additive: a new table). **A command change** (`/boss tier:`): deploy the commands before staging. No party state change.

**Spec:** design `docs/superpowers/specs/2026-10-20-max-battles-design.md`; the brief `.superpowers/sdd/8x-f-staging-fixes/design.md` (its review R1–R11) and the ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8xf`, tip `88319dbc`), one commit per task, on `max-battles` 62a04a3b. Each commit typechecks and its tests pass; on the tip the full check (8,813 tests), the build and the database suite are clean.

**Reviews:** a fresh Opus reviewer read the brief before any code (three Important: the typed-route rule against design 6.2, `/boss`'s tier rather than a refusal, the events in the database; all folded in as R1–R11). Two Opus reviewers went through the prototype (tasks 1–4: one Important, a Dynamax battle's boss listed only as Gigantamax refused as a change of kind, and five Minor; tasks 5–8: six Minor), then two fix reviews (the first: two Minor). Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **`/boss tier:`** rather than a refusal for a boss on no list (a spot holds one battle, so "report it anew" would lead nowhere). In a Gigantamax battle, a Pokémon that can Gigantamax is taken as G without asking (G is the only tier such a battle can have).
2. **The token** is new on every opening of the three dialogs, not the group's meeting time (a group without a time would reuse its id).
3. **`/max spot:` empty** lists only the region's power spots (none outside a region channel), as `/route add` does.
4. **The events table is rewritten whole** after each read (one transaction, no unique key: the merge decides what one event is); events started more than eight days ago, big events once over, and events not begun that the feed no longer lists are dropped. The raid events stay in memory only (follow-ups).
5. **`endSentence`** also ends at `!`, `?` and after a masked link's address.
6. **On the map** the answer about a battle already at the spot ends at "at this spot." (no post to open); on Discord it names the post, or says ": its post is being made".
7. **No small print** in `/counters` about an attacker shown with its fast move alone; the Stop button's label is unchanged.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8xf`). Apply it exactly with `git apply`, never retype; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green (task 5 also its database test, `npm run test:db` is not needed per task: `npx vitest run --project db src/db/repositories/max-event-repository.db.test.ts` with `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1`). The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **Typed `/route add`:** the rule against design 6.2 and the area file; ties and gyms beyond the train's reach.
2. **`/boss`:** a listed boss unchanged; an unlisted one asks; a raid's and train's `/boss` unchanged but for `tier:`.
3. **The token:** every dialog id within 100 characters, old forms still submit, stamps never mistaken for tokens.
4. **The events table:** additive migration, load before the first read, a failed read or write changes nothing else.
5. **Words and DMs:** every site of `endSentence`; the 40-component limit; `withStopped` still finds its button.

## Tasks

### Task 1: 8X-F 1: typed route add takes a better fit of the other kind over several of its own

Prototype commit: `86367d18a34b5d7637f1523a1ee159e8ff0dc142`

A gym's exact full name typed on a max train, with several power spots containing
all its words, said "Several places fit" (staging of 8X, "Allegheny Station").
typedStop now compares the other kind's stop beyond doubt with the best fit of the
own kind's several too; a tie stays several. The mirror case (a raid train, several
gyms, a power spot named exactly that) takes the spot.

**Files:**

```
 docs/architecture/trains.md                            |  2 +-
 docs/superpowers/plans/2026-10-21-phase-8x4-staging.md |  2 +-
 src/commands/raids/raid-input.ts                       | 13 +++++++--
 src/commands/trains/route.test.ts                      | 56 ++++++++++++++++++++++++++++++++++++++
 src/commands/trains/route.ts                           | 54 ++++++++++++++++++++++++++++--------
 5 files changed, 111 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/route.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 86367d18a34b5d7637f1523a1ee159e8ff0dc142 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 1: typed route add takes a better fit of the other kind over several of its own`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index fd35240ed9afe9e2613913b1ca8e6bba63234eaa..70064120861e565617fc1bd558b485df5e18857d 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -29,7 +29,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 - **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid) and the Manage train panel's menu "What the train goes to" under the mode's (`party:<id>:kind`, `pressKind`, `TrainService.setKind`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices): the post's heading and brief, `/help`, the panel; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
 - **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). The Manage train panel opens on a train without a route too, with what applies: no moves, no Reverse, no mode, the kind menu (so a kind set wrongly at `/train` can be changed before the first stop).
 - **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the panel's ids stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A power spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (power spot)` in lists, the panel and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a power spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown power spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
-- **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them. A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, unless the other kind's stop beyond doubt fits the typed text strictly better (`PlaceFit`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better; its several (some fitting every word) are "Several places fit"; without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
+- **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them. A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better, and a max train takes a gym's exact full name though several power spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
 - **Saved routes** keep stops: `SavedRoute.stops`, the column `SavedRoutes.gyms` their keys separated by commas (`routeText`, `routeStops`, which also reads the legacy bot's gym ids; no migration). `removeGym` keeps a route's power spots and removes only a route left without a stop; `countWithGym` and `removeGym` narrow their `LIKE` by the parsed stops. `/route load` leaves out stops gone or of no region of the server.
 - **Copies** in other regions go also where a power spot of the route lies (`stopRegionsInGuild` in `PartyMirrors.regionChannels`). The history records a spot's stop with its `wayspotId` (`history.md`). The map draws the line through the spots its data gives (`web.md`).
 
diff --git a/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md b/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md
index ba054cfda4fbb8c766f52d8c6e7db114c87cc918..2bf95df08b3e99f448bc30952c07b9b0c3709c8c 100644
--- a/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md
+++ b/docs/superpowers/plans/2026-10-21-phase-8x4-staging.md
@@ -19,7 +19,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 ## Power Spot stops
 
 9. `/route add stop:` on the max train: the list with nothing typed shows the region's Power Spots first, then gyms, each marked `(power spot)` / `(gym)`; typed text that fits a gym and a spot equally offers the spot first. On a raid train, gyms first. Add two spots and two gyms: the post's route lists `<title> (power spot)`, Where shows a spot's Wayfarer picture, address and Map.
-10. **Typed text without picking** (raid train): a gym's full name adds the gym; a Power Spot's full name that no gym has adds the spot; a name several gyms fit says "Several places fit"; a spot named exactly what was typed beats a gym that only contains the words (plan decision 1).
+10. **Typed text without picking** (raid train): a gym's full name adds the gym; a Power Spot's full name that no gym has adds the spot; a name several gyms fit says "Several places fit"; a spot named exactly what was typed beats a gym that only contains the words (plan decision 1), also when several gyms contain them (plan 8X-F). The mirror case on the max train: a gym's exact full name adds the gym though several Power Spots contain all its words (the staging's "Allegheny Station" against "Allegheny County Fire Station" and "West Mifflin #3 Volunteer Fire Company - Allegheny County Station 295"); a part of the name that fits the gym no better still says "Several places fit".
 11. **Moving through spots:** Next, Previous, Skip and Finish through a spot; the movement message names it and pings as at a gym; Reverse at the first stop; Loop and Turn back with a spot at the end. Gym targets fire only at gym stops.
 12. **A copy in another region:** a spot stop in another region of the server makes the train's copy there, as a gym stop does.
 13. **Saved routes:** `/route save` a mixed route; `/route load` it in a new train: the same stops; delete one of its gyms with the gym tools: the saved route keeps its spots ("left without a stop" counts only routes with none).
diff --git a/src/commands/raids/raid-input.ts b/src/commands/raids/raid-input.ts
index 5891d8d5887214a42ee90f0a25b7f87097dc5589..c07c508fdea568da89182707144cb9c27e4f64e0 100644
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -590,8 +590,11 @@ export function clearGymHit(hits: readonly GymHit<Gym>[]): Gym | undefined {
 export type GymAnswer =
   /** One gym, clearly. */
   | { kind: 'gym'; gym: Gym }
-  /** Several gyms fit: the member chooses. */
-  | { kind: 'several'; gyms: Gym[] }
+  /**
+   * Several gyms fit: the member chooses. `everyWord`: the ids of those with every word as
+   * typed (`clearGymHit`'s test), which fit at least as a word's fit (plan 8X-F, `typedStop`).
+   */
+  | { kind: 'several'; gyms: Gym[]; everyWord: number[] }
   | { kind: 'none' };
 
 /**
@@ -615,7 +618,11 @@ export function reportedGym(
   if (hits.length === 0) return { kind: 'none' };
   const clear = clearGymHit(hits);
   if (clear) return { kind: 'gym', gym: clear };
-  return { kind: 'several', gyms: hits.map((hit) => hit.gym) };
+  return {
+    kind: 'several',
+    gyms: hits.map((hit) => hit.gym),
+    everyWord: hits.filter((hit) => hit.allWords && !hit.corrected).map((hit) => hit.gym.id),
+  };
 }
 
 /**
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index 2b5f671232f886aeac77b1d3a8c3deb9c9630427..2c1aa89c5c21737625d1c7418e1d44c557900933 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -533,6 +533,62 @@ describe('/route add stop: a gym or a power spot (plan 8X-4; design 6.2)', () =>
     );
   });
 
+  it("takes the other kind's stop that fits better than several of the train's own (staging of 8X)", async () => {
+    // As at "Allegheny Station" (2026-10-22): the gym's whole name typed on a max train, two
+    // power spots with every word and more. The gym fits better: it is taken.
+    const county = keptRow(912, {
+      kind: 'powerspot',
+      title: 'Maple Leaf County Mosaic Hall',
+      lat: 40.031,
+      lon: -80.031,
+    });
+    const company = keptRow(913, {
+      kind: 'powerspot',
+      title: 'West Maple #3 Leaf Company - Mosaic Station 295',
+      lat: 40.032,
+      lon: -80.032,
+    });
+    const max = await withSpots('dynamax', [county, company]);
+    expect(await max.answer('add', { stop: 'Maple Leaf Mosaic' })).toBe(
+      '**Maple Leaf Mosaic** is stop 4 of the route.',
+    );
+    expect(max.routeNow().at(-1)).toEqual(gymStop(6));
+    // A part of the name, which fits the gym no better than the spots: several, as before.
+    expect(await max.answer('add', { stop: 'leaf mosaic' })).toMatch(
+      /^Several places fit "leaf mosaic" \(/,
+    );
+  });
+
+  it('takes a power spot that fits better than several gyms of a raid train', async () => {
+    // Two gyms have "pinewood" among more words; a power spot is called just that.
+    const pinewood = keptRow(914, {
+      kind: 'powerspot',
+      title: 'Pinewood',
+      lat: 40.045,
+      lon: -80.045,
+    });
+    const raid = await withSpots('raid', [pinewood]);
+    expect(await raid.answer('add', { stop: 'pinewood' })).toBe(
+      '**Pinewood** (power spot) is stop 4 of the route.',
+    );
+    expect(raid.routeNow().at(-1)).toEqual(spotStop(pinewood.id));
+  });
+
+  // Review r0, F-A2: several gyms that have every word as typed fit as well as a word's fit,
+  // as one gym beyond doubt does: a power spot of a word's fit is no better.
+  it('counts several gyms with every word as fitting a word, not worse than a power spot', async () => {
+    const steps = keptRow(915, {
+      kind: 'powerspot',
+      title: 'Pine Steps',
+      lat: 40.045,
+      lon: -80.045,
+    });
+    const raid = await withSpots('raid', [steps]);
+    // "pine" begins the first word of both Pinewood gyms.
+    expect(await raid.answer('add', { stop: 'pine' })).toMatch(/^Several places fit "pine" \(/);
+    expect(inGyms(raid.routeNow())).toEqual([4, 1, 7]);
+  });
+
   it('counts a gym beyond doubt as fitting every word, not worse than a power spot beyond doubt', async () => {
     // Gym 7 is Harbor Lighthouse Mural, on the route already: beyond doubt for "harbor light",
     // which begins its words; the spot has the typed words whole. A tie: the raid train's gym.
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index 1d07bbf9bb872f2e514e7c4f37c005a314b31b17..bc62ed54a12c5cf9cbf15e05bd1740b8332fad00 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -219,14 +219,27 @@ function typedStop(
   // For gyms it and `reportedGym` must search the same gyms: those of the train's server.
   const fitting = (kind: PlaceKind): boolean =>
     found.some((choice) => choice.kind === kind && choice.fit !== 'guess');
+  // How a gym fits: by the list's fit or, where the list does not carry it, by its own names.
+  const listedGymFit = (gym: { id: number; name: string; nickname: string | null }): PlaceFit =>
+    found.find((choice) => choice.kind === 'gym' && choice.id === String(gym.id))?.fit ??
+    placeFitBy(typed, [gym.name, gym.nickname], { allWords: true, corrected: false }).fit;
   // A gym beyond doubt has every word as typed (`clearGymHit`): it fits as well as a word's fit
-  // at least, by the list's fit or, where the list does not carry it, by its own names.
+  // at least.
   const gymFit = (gym: { id: number; name: string; nickname: string | null }): PlaceFit => {
-    const fit =
-      found.find((choice) => choice.kind === 'gym' && choice.id === String(gym.id))?.fit ??
-      placeFitBy(typed, [gym.name, gym.nickname], { allWords: true, corrected: false }).fit;
+    const fit = listedGymFit(gym);
     return fitRank(fit) > fitRank('word') ? 'word' : fit;
   };
+  // The best fit of several places of one kind (those the train reaches). None of them reached
+  // is `guess`, the worst fit: then the other kind's stop beyond doubt is always better, as it
+  // would be against no place at all (review r0, F-A3).
+  const bestOf = (fits: readonly PlaceFit[]): PlaceFit =>
+    fits.reduce<PlaceFit>((best, fit) => (fitRank(fit) < fitRank(best) ? fit : best), 'guess');
+  // Of several gyms, one with every word as typed fits as one beyond doubt does (`gymFit`), the
+  // others by their list's fit (review r0, F-A2).
+  const severalGymFit = (
+    gym: { id: number; name: string; nickname: string | null },
+    everyWord: readonly number[],
+  ): PlaceFit => (everyWord.includes(gym.id) ? gymFit(gym) : listedGymFit(gym));
   const sides: Record<'gym' | 'powerspot', TypedSide> = {
     gym:
       reported.kind === 'gym'
@@ -238,17 +251,30 @@ function typedStop(
             }
           : { kind: 'none' }
         : reported.kind === 'several'
-          ? { kind: 'several', fitting: fitting('gym') }
+          ? {
+              kind: 'several',
+              fitting: fitting('gym'),
+              best: bestOf(
+                reported.gyms
+                  .filter((gym) => reached(gymStop(gym.id)))
+                  .map((gym) => severalGymFit(gym, reported.everyWord)),
+              ),
+            }
           : { kind: 'none' },
     powerspot: spot
       ? { kind: 'clear', stop: spotStop(spot.id), fit: spot.fit }
       : spots.length > 0
-        ? { kind: 'several', fitting: fitting('powerspot') }
+        ? {
+            kind: 'several',
+            fitting: fitting('powerspot'),
+            best: bestOf(spots.map((choice) => choice.fit)),
+          }
         : { kind: 'none' },
   };
-  // The train's own kind of stop decides first (`kindsFirst`): its stop beyond doubt is taken
-  // (unless the other kind's fits better), its several are several; without one, or with only
-  // guesses of it, the other kind's stop beyond doubt.
+  // The train's own kind of stop decides first (`kindsFirst`): its stop beyond doubt is taken,
+  // its several are several, unless the other kind's stop beyond doubt fits strictly better
+  // than the best of them (design 6.2: a better match first, whatever its kind; a tie is the
+  // train's kind's); without one, or with only guesses of it, the other kind's stop beyond doubt.
   const [ownKind, otherKind] = kindsFirst(party) as ['gym' | 'powerspot', 'gym' | 'powerspot'];
   const own = sides[ownKind];
   const other = sides[otherKind];
@@ -256,6 +282,9 @@ function typedStop(
     const better = other.kind === 'clear' && fitRank(other.fit) < fitRank(own.fit);
     return { kind: 'stop', stop: better ? other.stop : own.stop };
   }
+  if (own.kind === 'several' && other.kind === 'clear' && fitRank(other.fit) < fitRank(own.best)) {
+    return { kind: 'stop', stop: other.stop };
+  }
   const guessed = own.kind === 'none' || (own.kind === 'several' && !own.fitting);
   if (guessed && other.kind === 'clear') return { kind: 'stop', stop: other.stop };
   // Nothing beyond doubt: what fits, guesses too, is for the member to pick from the list.
@@ -278,8 +307,11 @@ function typedStop(
 /** What typed text found of one kind of stop (`typedStop`). */
 type TypedSide =
   | { kind: 'clear'; stop: StopRef; fit: PlaceFit }
-  /** `fitting`: some of them fit every word typed; else they are guesses only. */
-  | { kind: 'several'; fitting: boolean }
+  /**
+   * `fitting`: some of them fit every word typed; else they are guesses only. `best`: the best
+   * fit among them (of those the train reaches).
+   */
+  | { kind: 'several'; fitting: boolean; best: PlaceFit }
   | { kind: 'none' };
 
 /** How well a place fits what was typed, best first (`PlaceFit`). */
````

### Task 2: 8X-F 2: max spot lists the region's power spots before anything is typed

Prototype commit: `3dbf53584f3e0ce3885c02f75d82df3cb335aa4c`

With nothing typed, the spot option of /max offered nothing (staging of 8X). It
now offers the region's power spots by name, as a max train's /route add does;
the list is one helper of both, regionSpotChoices in place-option.ts. Outside a
region's channel it offers nothing, as before.

**Files:**

```
 docs/architecture/parties-and-posts.md |  2 +-
 docs/architecture/trains.md            |  2 +-
 src/commands/max/max.test.ts           | 58 ++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/max/max.ts                | 10 +++++++++-
 src/commands/place-option.ts           | 22 ++++++++++++++++++++-
 src/commands/trains/route.ts           | 13 +++---------
 6 files changed, 91 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3dbf53584f3e0ce3885c02f75d82df3cb335aa4c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 2: max spot lists the region's power spots before anything is typed`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 764f5f2342f33faaa613dd5c6c7a411550a34ba7..0b75a2777ca14d71d5b1e71ecc5941c1a878274f 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -34,7 +34,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 ## Max battles
 
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
-- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`).
+- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
 - How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
 - Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 70064120861e565617fc1bd558b485df5e18857d..8e0630ec4e733e667f5bc36339d616bb8dbde477 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -29,7 +29,7 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 - **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid) and the Manage train panel's menu "What the train goes to" under the mode's (`party:<id>:kind`, `pressKind`, `TrainService.setKind`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices): the post's heading and brief, `/help`, the panel; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
 - **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). The Manage train panel opens on a train without a route too, with what applies: no moves, no Reverse, no mode, the kind menu (so a kind set wrongly at `/train` can be changed before the first stop).
 - **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the panel's ids stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A power spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (power spot)` in lists, the panel and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a power spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown power spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
-- **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them. A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better, and a max train takes a gym's exact full name though several power spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
+- **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them (`regionSpotChoices`, shared with `/max spot:`). A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better, and a max train takes a gym's exact full name though several power spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
 - **Saved routes** keep stops: `SavedRoute.stops`, the column `SavedRoutes.gyms` their keys separated by commas (`routeText`, `routeStops`, which also reads the legacy bot's gym ids; no migration). `removeGym` keeps a route's power spots and removes only a route left without a stop; `countWithGym` and `removeGym` narrow their `LIKE` by the parsed stops. `/route load` leaves out stops gone or of no region of the server.
 - **Copies** in other regions go also where a power spot of the route lies (`stopRegionsInGuild` in `PartyMirrors.regionChannels`). The history records a spot's stop with its `wayspotId` (`history.md`). The map draws the line through the spots its data gives (`web.md`).
 
diff --git a/src/commands/max/max.test.ts b/src/commands/max/max.test.ts
index 46969a3614c3629b7ef067b5a964827f53b29240..49b151118e3680e96a233144ca541d34ec46c3eb 100644
--- a/src/commands/max/max.test.ts
+++ b/src/commands/max/max.test.ts
@@ -29,6 +29,7 @@ import { raidEventsFixture } from '../../../test/support/raid-events.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import { keptRow } from '../../../test/support/wayspot-cases.js';
+import type { WayspotRow } from '../../domain/wayspots/kept.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
 import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
 import { Throttles } from '../../discord/throttle.js';
@@ -58,7 +59,10 @@ const SPOT_ROW = keptRow(1, {
  * `/max` and `/end` over the services, the controls of `/max`, of a pin's notice and of `/delete`'s
  * dialog; without the moderators' channel unless `safety` names it (`reportsWith`).
  */
-async function setup(safety: SafetyOptions = { moderation: null }) {
+async function setup(
+  safety: SafetyOptions = { moderation: null },
+  moreSpots: readonly WayspotRow[] = [],
+) {
   const made = await reportsWith(safety);
   // The services read the faked Date, as the bot's read the clock (a battle is made when reported).
   Object.defineProperty(made.clock, 'now', { get: () => Date.now() });
@@ -66,7 +70,7 @@ async function setup(safety: SafetyOptions = { moderation: null }) {
   await bosses.service.sync();
   // The service's clock is the test's (Date is faked to the day of each test).
   bosses.state.now = Date.now();
-  const { wayspots } = await wayspotsWith([SPOT_ROW]);
+  const { wayspots } = await wayspotsWith([SPOT_ROW, ...moreSpots]);
   const feed = readMaxEventFeed();
   const throttles = new Throttles();
   const { ctx, entries } = createTestContext({
@@ -329,6 +333,56 @@ describe('/max', () => {
     expect(offered.map((choice) => choice.value)).toEqual([`powerspot:${TEST_SPOT.id}`]);
     expect(offered[0]?.name).toMatch(/^Gazebo of the Park \(power spot\)/);
   });
+
+  it("offers the region's power spots by name before anything is typed (staging of 8X)", async () => {
+    // A second spot of West, one of East.
+    const made = await setup({ moderation: null }, [
+      keptRow(2, { kind: 'powerspot', title: 'Anchor Statue', lat: 40.04, lon: -80.04 }),
+      keptRow(3, { kind: 'powerspot', title: 'Bell Tower', lat: 40.05, lon: -79.95 }),
+    ]);
+    const blank = async (channelId: string) => {
+      const typing = fakeAutocomplete({
+        commandName: 'max',
+        channelId,
+        focusedName: 'spot',
+        focused: '',
+      });
+      await made.handle(typing);
+      return (typing.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
+    };
+    expect(await blank(WEST_CHANNEL)).toEqual([
+      { name: 'Anchor Statue (power spot)', value: `powerspot:${keptRow(2).id}` },
+      { name: 'Gazebo of the Park (power spot)', value: `powerspot:${TEST_SPOT.id}` },
+    ]);
+    // Outside a region's channel: nothing, as before.
+    expect(await blank('199999999999999999')).toEqual([]);
+  });
+
+  // Review r0, F-A6: Discord takes 25 choices; those first by name.
+  it("offers at most 25 of the region's power spots before anything is typed, the first by name", async () => {
+    const many = Array.from({ length: 30 }, (_, n) =>
+      keptRow(10 + n, {
+        kind: 'powerspot',
+        title: `Spot ${String(n).padStart(2, '0')}`,
+        lat: 40.03 + n / 10_000,
+        lon: -80.03,
+      }),
+    );
+    const made = await setup({ moderation: null }, many);
+    const typing = fakeAutocomplete({
+      commandName: 'max',
+      channelId: WEST_CHANNEL,
+      focusedName: 'spot',
+      focused: '',
+    });
+    await made.handle(typing);
+    const offered = (typing.respond.mock.calls[0]?.[0] ?? []) as readonly { name: string }[];
+    expect(offered).toHaveLength(25);
+    expect(offered[0]?.name).toBe('Gazebo of the Park (power spot)');
+    expect(offered.slice(1).map((choice) => choice.name)).toEqual(
+      Array.from({ length: 24 }, (_, n) => `Spot ${String(n).padStart(2, '0')} (power spot)`),
+    );
+  });
 });
 
 describe('/max: a battle that ends soon (Matt, 2026-10-21)', () => {
diff --git a/src/commands/max/max.ts b/src/commands/max/max.ts
index 90f940b8581e2a52431962d58794af7b212c01ac..22d07242995032df60d585b9de6a29adb23b23b9 100644
--- a/src/commands/max/max.ts
+++ b/src/commands/max/max.ts
@@ -52,7 +52,8 @@ import {
   takenWords,
   type MaxAccess,
 } from './max-report.js';
-import { nearChoices } from '../place-option.js';
+import { nearChoices, regionSpotChoices } from '../place-option.js';
+import { MAX_CHOICES } from '../choices.js';
 
 /*
  * `/max` (plan 8X-3; design 3.2): reports a max battle at a power spot, or at a pin, "Unlisted
@@ -273,6 +274,13 @@ export const max: SimpleCommand = {
       await interaction.respond(maxBossOptions(ctx, focused.value, Date.now()));
       return;
     }
+    if (focused.name === 'spot' && focused.value.trim() === '') {
+      // Nothing typed: the region's power spots by name (plan 8X-F), as a max train's route.
+      await interaction.respond(
+        regionSpotChoices(ctx, regionChannelOf(interaction, ctx)).slice(0, MAX_CHOICES),
+      );
+      return;
+    }
     if (focused.name === 'spot' && !isPinText(focused.value)) {
       await interaction.respond(await nearChoices(interaction, ctx, focused.value, ['powerspot']));
       return;
diff --git a/src/commands/place-option.ts b/src/commands/place-option.ts
index 780df66db8faf1e06130f7a3d4951c957015bff2..c7181d5c8b7761025b8266363a812861804869e4 100644
--- a/src/commands/place-option.ts
+++ b/src/commands/place-option.ts
@@ -14,7 +14,7 @@ import {
   readPlaceValue,
   type PlaceChoice,
 } from '../services/place-finder.js';
-import { CHOICE_NAME, MAX_CHOICES, type Choice } from './choices.js';
+import { byName, CHOICE_NAME, MAX_CHOICES, type Choice } from './choices.js';
 
 /**
  * As much as an option that names a place takes: a maps link with all its data (a Google Maps
@@ -96,6 +96,26 @@ export function placeLabel(choice: Pick<PlaceChoice, 'kind' | 'title' | 'where'>
   return truncate(`${truncate(choice.title, room)}${suffix}`, CHOICE_NAME);
 }
 
+/**
+ * The power spots of a region by name, as choices (`powerspot:<Wayfarer id>`, named by their
+ * kind): what `/max spot:` and a max train's `/route add stop:` offer before anything is typed
+ * (plans 8X-4, 8X-F). None outside a region's channel.
+ */
+export function regionSpotChoices(
+  ctx: Pick<AppContext, 'wayspots'>,
+  region: string | undefined,
+): Choice[] {
+  if (region === undefined) return [];
+  return ctx.wayspots
+    .inRegion(region)
+    .filter((spot) => spot.kind === 'powerspot' && spot.title.trim() !== '')
+    .sort((a, b) => byName(a.title, b.title))
+    .map((spot) => ({
+      name: placeLabel({ kind: 'powerspot', title: spot.title, where: undefined }),
+      value: placeValue({ kind: 'powerspot', id: spot.id }),
+    }));
+}
+
 /** The row of the interaction's server, by which its regions are known. */
 function serverRow(interaction: LocatedInteraction, ctx: AppContext): Promise<number | undefined> {
   return interaction.inGuild()
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index bc62ed54a12c5cf9cbf15e05bd1740b8332fad00..cb6ca21d92fc163cf682fc8d055b78ef0d718f3b 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -37,9 +37,9 @@ import { atEndSentence, TRAIN_KIND_WORDS } from '../../render/train-words.js';
 import { SAVED_ROUTE_CHOICE } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
-import { byName, MAX_CHOICES } from '../choices.js';
+import { MAX_CHOICES } from '../choices.js';
 import { gymChoices, reportedGym } from '../raids/raid-input.js';
-import { placeLabel } from '../place-option.js';
+import { placeLabel, regionSpotChoices } from '../place-option.js';
 import { clearOf, placeValue, readPlaceValue } from '../../services/place-finder.js';
 import { placeFitBy, type PlaceFit, type PlaceKind } from '../../domain/search/place-merge.js';
 import {
@@ -338,14 +338,7 @@ function firstStops(
   if (kindsFirst(party)[0] !== 'powerspot' || region === undefined) {
     return gyms.map((choice) => ({ ...choice, value: `gym:${choice.value.slice(2)}` }));
   }
-  const spots = ctx.wayspots
-    .inRegion(region)
-    .filter((spot) => spot.kind === 'powerspot' && spot.title.trim() !== '')
-    .sort((a, b) => byName(a.title, b.title))
-    .map((spot) => ({
-      name: placeLabel({ kind: 'powerspot', title: spot.title, where: undefined }),
-      value: placeValue({ kind: 'powerspot', id: spot.id }),
-    }));
+  const spots = regionSpotChoices(ctx, region);
   const named = gyms.map((choice) => ({
     name: placeLabel({ kind: 'gym', title: choice.name, where: undefined }),
     value: `gym:${choice.value.slice(2)}`,
````

### Task 3: 8X-F 3: boss takes tier for a max battle's boss on no list

Prototype commit: `afd899f793b113d8d91bd263d49fc045bd37d5e8`

In a Dynamax battle, /boss with a boss on no max list took the battle's stars in
silence (staging of 8X: "Dynamax Machamp (2★)"). It now asks "Which tier? Add
`tier:`." as /max does, and /boss has the tier option for that; a listed boss
needs none. In a raid's or a train's post tier: is refused. A Gigantamax battle
still takes a Gigantamax boss on no list without asking: it has no stars to ask.

**Files:**

```
 docs/architecture/utilities.md        |  2 +-
 src/commands/max/in-max.test.ts       | 38 ++++++++++++++++++++++++++++++++++++++
 src/commands/max/max-changes.ts       |  8 +++++---
 src/commands/max/max-input.ts         | 24 ++++++++++++++++--------
 src/commands/parties/in-train.test.ts |  8 ++++++++
 src/commands/raids/boss.test.ts       |  9 +++++++++
 src/commands/raids/boss.ts            | 29 +++++++++++++++++++++--------
 7 files changed, 98 insertions(+), 20 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/in-max.test.ts src/commands/parties/in-train.test.ts src/commands/raids/boss.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff afd899f793b113d8d91bd263d49fc045bd37d5e8 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 3: boss takes tier for a max battle's boss on no list`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 6393caa01c3620bd01014d3ffaa80b0c85f1341b..30cbc4f29779dc528cec9cfc8d54bb437be06acf 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -25,7 +25,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended and the max events are kept in memory only, so a restart after the event undoes it and the boss is offered again until Pokebattler drops it (final review X3-F2: no migration keeps the events; step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
-- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`, in memory: only a restart in the week after the feed dropped its Monday entirely loses the week's boss). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none, and in `/boss` the battle's own tier where the Pokémon may battle in it. A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`, in memory: only a restart in the week after the feed dropped its Monday entirely loses the week's boss). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
 - The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
diff --git a/src/commands/max/in-max.test.ts b/src/commands/max/in-max.test.ts
index 695a8ded3ebc757a6ef71d0b7be55ac8c0d384d4..ab4bf6ea6417c7529d15d94f87887d2a47f2e083 100644
--- a/src/commands/max/in-max.test.ts
+++ b/src/commands/max/in-max.test.ts
@@ -115,6 +115,44 @@ describe('the commands in the post of a max battle (plan 8X-3)', () => {
     );
   });
 
+  it('/boss asks the tier of a boss on no list, as /max does, and takes `tier:` (plan 8X-F)', async () => {
+    const made = await setup();
+    expect(made.bosses.bosses().some((listed) => listed.entry?.key === 'alakazam')).toBe(false);
+    // Never the battle's own tier in silence (staging of 8X: Machamp became "(2★)").
+    expect(await made.answer('boss', { pokemon: 'Alakazam' })).toBe('Which tier? Add `tier:`.');
+    expect(made.current().max).toMatchObject({ boss: { key: 'machamp' }, tier: 'D2' });
+    expect(await made.answer('boss', { pokemon: 'Alakazam', tier: 'D4' })).toBe(
+      'The boss of this max battle is now Dynamax Alakazam (4★).',
+    );
+    expect(made.current().max).toMatchObject({ boss: { key: 'alakazam' }, tier: 'D4' });
+    // A listed boss needs none, and a tier of the other kind is refused by the battle.
+    expect(await made.answer('boss', { pokemon: 'Sneasel' })).toBe(
+      'The boss of this max battle is now Dynamax Sneasel (1★).',
+    );
+    expect(await made.answer('boss', { pokemon: 'Alakazam', tier: 'G' })).toBe(
+      'Alakazam is no Gigantamax boss.',
+    );
+  });
+
+  // Review r0, F-A1: listed only as Gigantamax, it would be read at G and refused by the battle.
+  it('/boss asks the tier in a Dynamax battle of a boss listed only as Gigantamax', async () => {
+    const made = await setup();
+    const ids = { pokemonId: 'BLASTOISE', form: null, createdBy: REPORTER, expiresAt: null };
+    await made.bosses.addOverride({ ...ids, action: 'add', tier: 'G', shiny: null });
+    expect(await made.answer('boss', { pokemon: 'Blastoise' })).toBe('Which tier? Add `tier:`.');
+    expect(await made.answer('boss', { pokemon: 'Blastoise', tier: 'D3' })).toBe(
+      'The boss of this max battle is now Dynamax Blastoise (3★).',
+    );
+  });
+
+  it('/boss in a Gigantamax battle takes a Gigantamax boss on no list without asking', async () => {
+    // A Gigantamax battle has one tier: there are no stars to ask about.
+    const made = await setup({ tier: 'G' });
+    expect(await made.answer('boss', { pokemon: 'Gengar' })).toBe(
+      'The boss of this max battle is now Gigantamax Gengar.',
+    );
+  });
+
   it('/meet sets the meeting time of the group, until the battle ends', async () => {
     const made = await setup();
     expect(await made.answer('meet', { time: '2:45pm' })).toBe(
diff --git a/src/commands/max/max-changes.ts b/src/commands/max/max-changes.ts
index 4179bec76839ff9f55d119c9e33427ca4562d110..23cb8847138ed1942a506e859471288d3b38dcfa 100644
--- a/src/commands/max/max-changes.ts
+++ b/src/commands/max/max-changes.ts
@@ -63,16 +63,18 @@ export async function changeMaxEnd(
 
 /**
  * `/boss` in a max battle's post: a boss as `/max` reads it (`readMaxBoss`: a listed one, or a
- * Pokémon the game lets battle so, with its tier); a change between Dynamax and Gigantamax is
- * refused by the battle (`max-kind-change`).
+ * Pokémon the game lets battle so, with its tier: `tierText`, `/boss tier:`, asked for a Dynamax
+ * boss on no list, plan 8X-F); a change between Dynamax and Gigantamax is refused by the battle
+ * (`max-kind-change`).
  */
 export async function changeMaxBoss(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
   party: MaxParty,
   text: string,
+  tierText: string | null = null,
 ): Promise<void> {
-  const read = readMaxBoss(ctx, text, null, Date.now(), party.max.tier);
+  const read = readMaxBoss(ctx, text, tierText, Date.now(), party.max.tier);
   const member = { id: interaction.user.id, ...memberInfo(interaction) };
   const outcome = await ctx.maxBattles.setBoss(party.id, member, read);
   await reply(
diff --git a/src/commands/max/max-input.ts b/src/commands/max/max-input.ts
index b0f1adc899e569581825a02d4c50116401e46d91..3b03d70b6d7bab24ef849369d3ba09076d4d0238 100644
--- a/src/commands/max/max-input.ts
+++ b/src/commands/max/max-input.ts
@@ -131,8 +131,10 @@ export function kindOfText(text: string): { gigantamax?: boolean; rest: string }
  * `Dynamax ` before it names the kind): its listed boss (Dynamax before Gigantamax, Gigantamax
  * loses design conflicts; the tier `tier:` names when given), else, for a Pokémon the game master
  * lets battle so, the tier `tier:` names (required then: `WHICH_TIER`), Gigantamax where it is
- * named so (it has no stars to ask), else `fallback` where it may battle in it (`/boss` in a
- * battle: its own tier). Refused with a sentence for anything else.
+ * named so (it has no stars to ask). `fallback` is the tier of the battle `/boss` changes: a
+ * name that says no kind takes the listed boss of the battle's kind first, and in a Gigantamax
+ * battle a Pokémon the game lets battle so; a Dynamax boss on no list needs `tier:` there too
+ * (plan 8X-F). Refused with a sentence for anything else.
  */
 export function readMaxBoss(
   ctx: MaxReading,
@@ -166,13 +168,22 @@ export function readMaxBoss(
   if (!entry) throw new UnknownMaxBoss(shown);
   const typed = typedMaxBoss(entry, bosses, ctx.gameData.catalogue);
   // `/boss` in a battle (`fallback`) with a name that says no kind (review B, B7): a boss of the
-  // battle's own kind first, listed, else of its tier where the game lets it battle so; only then
-  // the rest, which the battle refuses with its reason (`max-kind-change`).
+  // battle's own kind first, listed; in a Gigantamax battle one the game lets battle so (it has no
+  // stars to ask); only then the rest, which the battle refuses with its reason
+  // (`max-kind-change`). A Dynamax boss on no list is never given the battle's stars in silence:
+  // its tier is asked as `/max` asks it (plan 8X-F).
   if (fallback !== undefined && gigantamax === undefined && tier === undefined) {
     const own = (one: MaxTier): boolean => battleKindOf(one) === battleKindOf(fallback);
     const mine = typed.listed.find((boss) => own(boss.tier));
     if (mine) return read(refOf(mine), mine.name, mine.tier);
-    if (typed.others.includes(fallback)) return read({ key: entry.key }, entry.name, fallback);
+    if (fallback === 'G' && typed.others.includes('G')) {
+      return read({ key: entry.key }, entry.name, 'G');
+    }
+    // Listed only as Gigantamax, but it may battle as a Dynamax boss of the battle's kind: its
+    // stars are asked, not the Gigantamax one read and refused by the battle (review r0, F-A1).
+    if (fallback !== 'G' && typed.others.some((one) => one !== 'G')) {
+      throw new UserError(WHICH_TIER);
+    }
   }
   const ofKind = (one: MaxTier): boolean =>
     gigantamax === undefined || (one === 'G') === gigantamax;
@@ -187,9 +198,6 @@ export function readMaxBoss(
   if (tier === undefined && gigantamax === true && allowed.includes('G')) {
     return read({ key: entry.key }, entry.name, 'G');
   }
-  if (tier === undefined && fallback !== undefined && allowed.includes(fallback)) {
-    return read({ key: entry.key }, entry.name, fallback);
-  }
   if (allowed.length === 0 && typed.listed.every((boss) => !ofKind(boss.tier))) {
     throw new UserError(`${plain(entry.name)} is no max battle boss in the game.`);
   }
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 4e9ec5e0ca480d3a3cd8c855e053badeceabfe1c..7129f6682f3c73dfd54362ecd6c2a3e0f050740a 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -456,6 +456,14 @@ describe('/boss in the post of a train', () => {
     expect(made.current()).toMatchObject({ endTime: null, hatchTime: null, gymId: null });
   });
 
+  it('refuses `tier:`, which is for max battles only (plan 8X-F)', async () => {
+    const made = await setup();
+    expect(await made.answer('boss', { pokemon: 'yveltal', tier: 'D3' })).toBe(
+      '`tier:` is for a max battle whose boss is on no list. Leave it out here.',
+    );
+    expect(made.current().train.boss).toBeNull();
+  });
+
   it('ignores a tier typed before the name: a train has none', async () => {
     const made = await setup();
     expect(await made.answer('boss', { pokemon: 't3 yveltal' })).toBe(
diff --git a/src/commands/raids/boss.test.ts b/src/commands/raids/boss.test.ts
index 3e094a779bafaa0014413395c9df2d53c6641006..4fbea6e312c1cd27bbd75baf31471eed4caa732b 100644
--- a/src/commands/raids/boss.test.ts
+++ b/src/commands/raids/boss.test.ts
@@ -85,6 +85,15 @@ describe('/boss', () => {
     );
   });
 
+  it('refuses `tier:`, which is for max battles only (plan 8X-F)', async () => {
+    const made = await setup();
+    const before = made.current().raid;
+    expect(await made.answer('boss', { pokemon: 'yveltal', tier: 'D5' })).toBe(
+      '`tier:` is for a max battle whose boss is on no list. Leave it out here.',
+    );
+    expect(made.current().raid).toEqual(before);
+  });
+
   it('offers the bosses and the eggs while typing', async () => {
     const made = await setup();
     expect(await made.offered('boss', 'pokemon', 'yve')).toEqual([
diff --git a/src/commands/raids/boss.ts b/src/commands/raids/boss.ts
index dc14a32604a4644d7f899468d274051a9e4e6274..0371be526e03dfddd46c53c6a1abf514fe6ab76a 100644
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -22,7 +22,7 @@ import {
   type TrainParty,
 } from '../../domain/party/party.js';
 import { changeMaxBoss } from '../max/max-changes.js';
-import { maxBossOptions } from '../max/max-input.js';
+import { maxBossOptions, TIER_CHOICES } from '../max/max-input.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { battleKindOf } from '../../domain/pogo/max-tier.js';
 import { problemText } from '../../render/activity.js';
@@ -37,6 +37,10 @@ import { bossChoices, trainBoss, trainBossChoices } from './raid-input.js';
 const NO_TIER =
   'A train has no tier: name the Pokémon it is after, such as `yveltal`, or `none` for no boss.';
 
+/** What a member is told who gives `tier:` in the post of a raid or a train (plan 8X-F). */
+const TIER_FOR_MAX_ONLY =
+  '`tier:` is for a max battle whose boss is on no list. Leave it out here.';
+
 /** The words that take the boss off a train again. */
 const NO_BOSS = new Set(['none', 'cancel', 'unset', 'clear']);
 
@@ -88,6 +92,12 @@ export const boss: SimpleCommand = {
         .setRequired(true)
         .setMaxLength(100)
         .setAutocomplete(true),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('tier')
+        .setDescription('Max battles only: the tier of a boss on no list')
+        .addChoices(...TIER_CHOICES),
     ),
   help: {
     category: 'raid-crud',
@@ -98,21 +108,24 @@ export const boss: SimpleCommand = {
       'Pokémon the train is after, which the post then shows with its weaknesses and catch ' +
       'CP. It may be any Pokémon, also one that is no boss right now; a train has no tier, ' +
       'and `none` takes the boss off again. In the post of a max battle: the boss of the ' +
-      'rotation, picked from the max bosses (its tier follows it); a Dynamax battle cannot ' +
-      'become a Gigantamax one, nor the other way round.',
-    examples: ['/boss pokemon:yveltal', '/boss pokemon:t3'],
+      'rotation, picked from the max bosses (its tier follows it); a Dynamax boss on no list ' +
+      'needs `tier:`, as with `/max`. A Dynamax battle cannot become a Gigantamax one, nor ' +
+      'the other way round.',
+    examples: ['/boss pokemon:yveltal', '/boss pokemon:t3', '/boss pokemon:alakazam tier:D4'],
   },
   guards: [requireRaidOrTrain],
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
     const here = commandParty(interaction, ctx);
     const text = interaction.options.getString('pokemon', true);
-    if (isTrain(here)) {
-      await setTrainBoss(interaction, ctx, here, text);
+    const tier = interaction.options.getString('tier');
+    if (isMax(here)) {
+      await changeMaxBoss(interaction, ctx, here, text, tier);
       return;
     }
-    if (isMax(here)) {
-      await changeMaxBoss(interaction, ctx, here, text);
+    if (tier !== null) throw new UserError(TIER_FOR_MAX_ONLY);
+    if (isTrain(here)) {
+      await setTrainBoss(interaction, ctx, here, text);
       return;
     }
     if (!isRaid(here)) throw new UserError(notARaidOrTrain(here));
````

### Task 4: 8X-F 4: a per-open token in the custom ids of Meet…, the which-group dialog and Group…

Prototype commit: `82da1a256a50fde777ea0cb7bd90f327a0b1e5af`

Discord's client keeps what was submitted in a dialog per custom id and shows it
again in place of the value marked: Meet… preselected the time submitted before,
not the group's (staging of 8X). The three dialogs that mark a value to start with
now end their custom id in openToken(now), "~" and the moment it opened in base
36; their Submits leave it out (withoutOpenToken), so a dialog drawn before
submits as before.

**Files:**

```
 docs/architecture/discord-framework.md |  2 +-
 docs/architecture/parties-and-posts.md |  2 +-
 src/commands/parties/group-dialogs.ts  | 11 ++++++-----
 src/commands/parties/meet-dialog.ts    |  8 ++++----
 src/components/party.groups.test.ts    | 13 +++++++++++++
 src/discord/custom-id.ts               |  9 ++++++---
 src/discord/dialog.test.ts             | 17 +++++++++++++++++
 src/discord/dialog.ts                  | 23 +++++++++++++++++++++++
 src/render/group-dialogs.test.ts       | 30 ++++++++++++++++++++++++++----
 src/render/group-dialogs.ts            | 12 +++++++-----
 src/render/meet-dialog.test.ts         | 11 ++++++++++-
 src/render/meet-dialog.ts              |  9 +++++----
 12 files changed, 119 insertions(+), 28 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/party.groups.test.ts src/discord/dialog.test.ts src/render/group-dialogs.test.ts src/render/meet-dialog.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 82da1a256a50fde777ea0cb7bd90f327a0b1e5af -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 4: a per-open token in the custom ids of Meet…, the which-group dialog and Group…`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index bd7e3549e8ab259592535da7688f874196f80405..713a67e4a8e64749847975da161a841b18c01c2b 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -24,7 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 0b75a2777ca14d71d5b1e71ecc5941c1a878274f..5e64d31ec89ebc1b498db50c8c34d152d98e8fef 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -54,7 +54,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
 - The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Manage train…, Split group…, Whole route, `trains.md`). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
-- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group newest first (`newestFirst`), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) newest first, then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>` (`meetControls`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
+- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group newest first (`newestFirst`), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) newest first, then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>:<token>` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit (some 86 snowflakes after a short text, 100 at most). `inMessages(text, members)` (plan 8X-1) pings them all: the text with as many as fit, then messages of mentions alone, each within 2,000 characters and 100 pings. `pingInMessages(deps, partyId, postId, text, members)` (`src/services/party-change.ts`) sends them one after the other, asking the store before each whether the party is still active with that post (a moved raid has another), and stops otherwise or when Discord says the post is gone (`complete`, `pinged`, and `stopped`: `gone`, or `moved` for a party still active with another post); `/shout` (`AttendanceService.shout`) goes through it, answering `gone` with how many it `pinged` before ("This raid is over. I pinged 86 trainers before it ended."), or `moved` ("This raid moved to another post: I pinged 86 trainers before it moved. Shout again there.", without the count when nobody was pinged yet, and then the use of `/shout` goes back: `givesBack`); `/shout group:True` pings only the others of the shouter's own group (not Complete, those who allow shout pings; the text says `to everybody in group B:`), refused in a party of one group (`one-group`: "This raid has one group: `/shout` without `group` pings everybody."), `nobody` with the group when nobody else is in it. Since plan 8X-4 (a Gigantamax train holds a hundred) a group's meeting time, a new group's notice (its sentence and hint first), a timed party's start, a train's movement, the notice of a raid that moved and a train's split notice go through `pingInMessages` as well (its `sent` says how many messages went; the move notice is said once the first went); only the archive warning and the completion question still ping one message's worth (their ids are kept to delete them; a follow-up).
diff --git a/src/commands/parties/group-dialogs.ts b/src/commands/parties/group-dialogs.ts
index f6c1d41a556607bc49fc23751fb8c510fdeee2e0..ad8681743cee10eea288c8d70d30668950ef3a64 100644
--- a/src/commands/parties/group-dialogs.ts
+++ b/src/commands/parties/group-dialogs.ts
@@ -1,6 +1,6 @@
 import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
-import { deferSubmit } from '../../discord/dialog.js';
+import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { newGroupChangesNothing, type GroupChoice } from '../../domain/party/attendance.js';
@@ -174,7 +174,7 @@ function chosenWay(
 }
 
 /**
- * Submit of Group…'s dialog (`party:<id>:regroupform[:in][:<way>]`): acknowledged privately,
+ * Submit of Group…'s dialog (`party:<id>:regroupform[:in][:<way>][:~<token>]`): acknowledged privately,
  * then, as things are now, a new group opened with the label typed (`/group new`'s notice and
  * answer: `You opened group C (label) and are in it.`; refused inside the store where it would
  * change nothing, `newGroupRefusal`) or a move to the group picked by its stamp (`joinStamped`: a
@@ -187,8 +187,9 @@ export async function submitGroupMenu(
   interaction: ModalSubmitInteraction,
   ctx: AppContext,
   partyId: string,
-  args: readonly string[],
+  drawn: readonly string[],
 ): Promise<void> {
+  const args = withoutOpenToken(drawn);
   const signedUp = args[0] === SIGNED_UP_MARK;
   const way = chosenWay(interaction, signedUp ? args.slice(1) : args);
   if (way === undefined) throw new UserError(STALE_COMPONENT);
@@ -228,7 +229,7 @@ function pickedChoice(interaction: ModalSubmitInteraction): GroupChoice | undefi
 }
 
 /**
- * Submit of "which group?" (`party:<id>:joinform:<action>`): acknowledged privately, then the
+ * Submit of "which group?" (`party:<id>:joinform:<action>[:~<token>]`): acknowledged privately, then the
  * member is signed up as things are now (`AttendanceService.joinChosen`) and told how they stand;
  * a group that went or was opened again under its letter is `Group B has changed since: press
  * Join again.`, a member who signed up meanwhile hears they stay in their own group, a party
@@ -240,7 +241,7 @@ export async function submitWhichGroup(
   partyId: string,
   args: readonly string[],
 ): Promise<void> {
-  const [action] = args;
+  const [action] = withoutOpenToken(args);
   const choice = pickedChoice(interaction);
   if (!isJoinAction(action) || choice === undefined) throw new UserError(STALE_COMPONENT);
   await deferSubmit(interaction);
diff --git a/src/commands/parties/meet-dialog.ts b/src/commands/parties/meet-dialog.ts
index 2dd415b0ce7288e5795fb23d189e0ee99ffb3ebf..141ffeb3774be6a59d48c968cbcd5beef99aba32 100644
--- a/src/commands/parties/meet-dialog.ts
+++ b/src/commands/parties/meet-dialog.ts
@@ -1,7 +1,7 @@
 import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler } from '../../discord/command.js';
-import { deferSubmit } from '../../discord/dialog.js';
+import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { requireGuild } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
@@ -33,7 +33,7 @@ import { actingMember, outcomeWords, partyOver } from './reply.js';
 /*
  * Meet… of a raid's post on Discord (plan 8X-1B, decision 5): the button `party:<id>:meet` opens
  * the dialog of the meeting time of the member's own group (`meetDialog`); its Submit,
- * `meet:<id>:time:<group>:<stamp>`, sets it as `/meet` does (`AttendanceService.setMeetingTime`).
+ * `meet:<id>:time:<group>:<stamp>[:~<token>]`, sets it as `/meet` does (`AttendanceService.setMeetingTime`).
  * The press counts as one of the post's (`ACTION_THROTTLE`), and is refused while `/meet`'s
  * window is full (`MEET_WINDOW`, the party controls' `checks`); the Submit counts in that window,
  * so `/meet` and Meet… draw on one budget.
@@ -126,7 +126,7 @@ async function submitMeet(
   partyId: string,
   args: readonly string[],
 ): Promise<void> {
-  const [groupId, stamp] = args;
+  const [groupId, stamp] = withoutOpenToken(args);
   const time = chosenTime(interaction);
   if (groupId === undefined || !isGroupId(groupId) || stamp === undefined || time === undefined) {
     throw new UserError(STALE_COMPONENT);
@@ -150,7 +150,7 @@ async function submitMeet(
 }
 
 /**
- * The dialog of Meet… (`meet:<party id>:time:<group>:<stamp>`): a kind of its own, so that its
+ * The dialog of Meet… (`meet:<party id>:time:<group>:<stamp>[:~<token>]`): a kind of its own, so that its
  * Submit counts in `/meet`'s window (`MEET_WINDOW`; "You can use /meet again in …").
  */
 export const meetControls: ComponentHandler = {
diff --git a/src/components/party.groups.test.ts b/src/components/party.groups.test.ts
index de01f55500c8672a7a289628df5d4435585218eb..8d557a0fa7e5e48745e6c46042220003c7999001 100644
--- a/src/components/party.groups.test.ts
+++ b/src/components/party.groups.test.ts
@@ -11,6 +11,7 @@ import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { APIModalInteractionResponseCallbackData } from 'discord.js';
+import { decodeCustomId, encodeCustomId } from '../discord/custom-id.js';
 import { InteractionRouter } from '../discord/router.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -244,6 +245,18 @@ describe('Group… (plan 8X-1B, decision 3)', () => {
     expect(made.current().groups.map((group) => group.id)).toEqual(['A']);
   });
 
+  it('takes the Submit of a dialog opened before its custom id had a per-open token (plan 8X-F)', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('regroup', BOB));
+    const id = decodeCustomId(dialog.custom_id);
+    if (!id) throw new Error('no custom id');
+    // As drawn before: `party:<id>:regroupform:in:A:<stamp>`, the one way in its arguments.
+    const older = { ...dialog, custom_id: encodeCustomId({ ...id, args: id.args.slice(0, -1) }) };
+    expect(older.custom_id).not.toBe(dialog.custom_id);
+    expect(answerOf(await made.submitForm(older, {}, BOB))).toBe('You are coming.');
+    expect(attendeeOf(made.current(), BOB)?.group).toBe('A');
+  });
+
   it('signs a newcomer up as coming in the group they pick', async () => {
     const made = await setup();
     const dialog = shownDialog(await made.click('regroup'));
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 1e4ad6ecc4921aa90d7e29f8e6c4507c428bd2d4..b2f559c10b41d56b2e5673dca9dac3005997e231 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -88,15 +88,18 @@
  * for a group called otherwise, gone, or given its letter again after a split is refused), of
  * several `party:<id>:splitform`, whose radio group's value is `<group>:<mark>`.
  * Plan 8X-1B: Interested, Join and Here of a newcomer to a post of several groups open
- * `party:<id>:joinform:<maybe|join|here>` (the button pressed), whose radio group `group` is `any`
+ * `party:<id>:joinform:<maybe|join|here>[:~<token>]` (the button pressed), whose radio group `group` is `any`
  * or `<group>:<stamp>` (the group's letter and when it was opened, in base 36: a letter can be
  * given again once its group went); "Group…" is `party:<id>:regroup` and its dialog
- * `party:<id>:regroupform[:in][:new | :<group>:<stamp>]` (`in` where it was drawn for a member
+ * `party:<id>:regroupform[:in][:new | :<group>:<stamp>][:~<token>]` (`in` where it was drawn for a member
  * signed up, `Change group`; then the one way where it asks nothing), its
  * radio group `group` (`new` or `<group>:<stamp>`) and line `label`; "Meet…" is
- * `party:<id>:meet`, its dialog a kind of its own, `meet:<party id>:time:<group>:<stamp>`, so
+ * `party:<id>:meet`, its dialog a kind of its own, `meet:<party id>:time:<group>:<stamp>[:~<token>]`, so
  * that its Submit counts in `/meet`'s window, its menu `time` (a moment in ms, or `none`). The
  * letter Join of a post drawn before, `party:<id>:group:<letter>`, still joins its letter.
+ * Plan 8X-F: the three dialogs end in a per-open token, `:~<when it opened, base 36>`
+ * (`openToken`, `src/discord/dialog.ts`: Discord's client keeps a pick per custom id), which
+ * their Submits leave out; one drawn before without it submits as before.
  *
  * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
  * (`/targets`; the kinds `wants` and `targets` are the dialogs of `/unwant-all` and
diff --git a/src/discord/dialog.test.ts b/src/discord/dialog.test.ts
index e815a2951e36998c315a939c72cc35abc50b6f3e..66ea69c10ff10b86004136ec0c716afb36f87d29 100644
--- a/src/discord/dialog.test.ts
+++ b/src/discord/dialog.test.ts
@@ -8,8 +8,10 @@ import {
   SLOW_READ,
   channelInDialog,
   dialog,
+  openToken,
   pickedOf,
   readInTime,
+  withoutOpenToken,
 } from './dialog.js';
 import { UserError } from './errors.js';
 
@@ -159,6 +161,21 @@ describe('channelInDialog', () => {
   });
 });
 
+describe('the per-open token (plan 8X-F)', () => {
+  it('is a custom id argument of its own each time, which a Submit leaves out', () => {
+    expect(openToken(1_000)).not.toBe(openToken(2_000));
+    expect(withoutOpenToken(['in', 'A', 'mh0k', openToken(1_000)])).toEqual(['in', 'A', 'mh0k']);
+    // A dialog drawn before the token: as it was.
+    expect(withoutOpenToken(['in', 'A', 'mh0k'])).toEqual(['in', 'A', 'mh0k']);
+  });
+
+  // Review r0, F-A5: only the last argument is the token.
+  it('leaves an argument that is not last as it is, whatever it begins with', () => {
+    expect(withoutOpenToken(['~x', 'A', openToken(1_000)])).toEqual(['~x', 'A']);
+    expect(withoutOpenToken(['~x', 'A'])).toEqual(['~x', 'A']);
+  });
+});
+
 describe('readInTime', () => {
   const NOW = 1_800_000_000_000;
   /** An interaction made just now, by the faked clock. */
diff --git a/src/discord/dialog.ts b/src/discord/dialog.ts
index 9fa2565fa6d34f81f69bafb2033bdc2a09cf4805..a989984b442ede79f982b6754b7290197ba804a2 100644
--- a/src/discord/dialog.ts
+++ b/src/discord/dialog.ts
@@ -150,6 +150,29 @@ export function channelInDialog(name: string | undefined): string {
   return name === undefined ? 'a deleted channel' : `#${plain(name)}`;
 }
 
+/** What begins a per-open token: no other argument of a dialog's custom id begins so. */
+const OPEN_MARK = '~';
+
+/**
+ * The last argument of the custom id of a dialog that picks a value to start with (Meet…, the
+ * which-group dialog, Group…; plan 8X-F): when it was opened, in base 36 behind `~`. Discord's
+ * client keeps what was submitted in a dialog per custom id and shows it again in place of the
+ * value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so
+ * every opening gets a custom id of its own. Its Submit leaves it out (`withoutOpenToken`), so a
+ * dialog opened before the token was added submits as before.
+ */
+export function openToken(now: number): string {
+  return `${OPEN_MARK}${Math.max(0, Math.floor(now)).toString(36)}`;
+}
+
+/**
+ * A dialog's custom id arguments without its per-open token (`openToken`): the last argument
+ * where it begins with `~`; the others as they are (review r0, F-A5).
+ */
+export function withoutOpenToken(args: readonly string[]): string[] {
+  return args.at(-1)?.startsWith(OPEN_MARK) === true ? args.slice(0, -1) : [...args];
+}
+
 /**
  * What a dialog needs, read within `DIALOG_READ_MS` of when the interaction was made (`since`,
  * its `createdTimestamp`: Discord counts its three seconds from then, not from when the read
diff --git a/src/render/group-dialogs.test.ts b/src/render/group-dialogs.test.ts
index ecddbaaec1ebf8eadae38bc5078e98944c1fb455..0c8b0ba1cf295458f55e2df3e494b3a048f669f3 100644
--- a/src/render/group-dialogs.test.ts
+++ b/src/render/group-dialogs.test.ts
@@ -15,6 +15,7 @@ import {
   withAttendees,
 } from '../../test/support/parties.js';
 import { decodeCustomId } from '../discord/custom-id.js';
+import { openToken } from '../discord/dialog.js';
 import type { RaidParty } from '../domain/party/party.js';
 import {
   ANY_GROUP,
@@ -55,7 +56,7 @@ describe('whichGroupDialog', () => {
       kind: 'party',
       id: two().id,
       action: 'joinform',
-      args: ['join'],
+      args: ['join', openToken(PARTY_NOW)],
     });
     // Kept short: Discord adds its own box to every dialog.
     expect(dialogTexts(dialog)).toEqual([]);
@@ -173,7 +174,10 @@ describe('groupMenuDialog (Group…)', () => {
     const dialog = menu(three);
     checkModal(dialog);
     expect(dialog.title).toBe('Change group');
-    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ action: 'regroupform', args: ['in'] });
+    expect(decodeCustomId(dialog.custom_id)).toMatchObject({
+      action: 'regroupform',
+      args: ['in', openToken(PARTY_NOW)],
+    });
     expect(dialogTexts(dialog)).toEqual(["You're in group B (by the bridge)."]);
     expect(
       dialogChoices(dialog).map(({ label, description, picked }) => [label, description, picked]),
@@ -196,7 +200,7 @@ describe('groupMenuDialog (Group…)', () => {
     const dialog = menu(two(), ALICE);
     expect(dialog.title).toBe('Join a group');
     // No `SIGNED_UP_MARK`: its Submit signs them up.
-    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ args: [] });
+    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ args: [openToken(PARTY_NOW)] });
     expect(dialogTexts(dialog)).toEqual(['You join as coming, in the group you pick.']);
     expect(dialogChoices(dialog).map(({ label }) => label)).toEqual([
       'Group B: by the bridge',
@@ -215,7 +219,9 @@ describe('groupMenuDialog (Group…)', () => {
       "You're in group A. Submit opens group B and moves you to it.",
     ]);
     // Drawn for a member signed up (`SIGNED_UP_MARK`), then the one way.
-    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ args: ['in', NEW_GROUP] });
+    expect(decodeCustomId(dialog.custom_id)).toMatchObject({
+      args: ['in', NEW_GROUP, openToken(PARTY_NOW)],
+    });
     // Five groups: moves only, and no label asked.
     const five = withAttendees(
       {
@@ -250,6 +256,21 @@ describe('groupMenuDialog (Group…)', () => {
     ]);
   });
 
+  it('has a custom id of its own each time it opens: Discord keeps a pick per custom id (plan 8X-F)', () => {
+    const first = groupMenuDialog(view(two()), groupWays(two(), BOB));
+    const again = groupMenuDialog(
+      { ...view(two()), now: PARTY_NOW + 1_000 },
+      groupWays(two(), BOB),
+    );
+    expect(again.custom_id).not.toBe(first.custom_id);
+    const asked = (now: number) =>
+      whichGroupDialog(
+        { party: two(), memberId: ALICE, lobbySize: undefined, zone: PARTY_ZONE, now },
+        'join',
+      );
+    expect(asked(PARTY_NOW + 1_000).custom_id).not.toBe(asked(PARTY_NOW).custom_id);
+  });
+
   it('names a group to move to by its stamp in a dialog without a choice', () => {
     const party = {
       ...two(),
@@ -261,6 +282,7 @@ describe('groupMenuDialog (Group…)', () => {
     expect(decodeCustomId(dialog.custom_id)?.args).toEqual([
       'in',
       ...groupChoice(party, { id: 'A' }).split(':'),
+      openToken(PARTY_NOW),
     ]);
   });
 });
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
index 3330004d40b9d05d5854e2538edcd2602b22978a..448897345d413e8b72b33eb9bfe822c08d2711e1 100644
--- a/src/render/group-dialogs.ts
+++ b/src/render/group-dialogs.ts
@@ -1,6 +1,6 @@
 import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
-import { dialog, type DialogOption } from '../discord/dialog.js';
+import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
 import {
   chooseGroup,
   MAX_GROUP_LABEL,
@@ -146,8 +146,9 @@ const TITLES: Readonly<Record<JoinAction, (word: string) => string>> = {
  * group?", of "Any group with room" first where the groups have a size, then every group newest
  * first, the first picked to start with (decision 9: Android picks the first itself). Each group
  * by its label and a short line (`groupDescription`). Its custom id
- * `party:<id>:joinform:<action>` keeps which button it was; a choice is `ANY_GROUP` or
- * `groupChoice`.
+ * `party:<id>:joinform:<action>:<token>` keeps which button it was, and a per-open token
+ * (`openToken`, plan 8X-F: Discord's client starts with the value marked); a choice is
+ * `ANY_GROUP` or `groupChoice`.
  */
 export function whichGroupDialog(
   view: GroupDialogView,
@@ -167,7 +168,7 @@ export function whichGroupDialog(
       kind: PARTY_KIND,
       id: party.id,
       action: WHICH_GROUP_FORM,
-      args: [action],
+      args: [action, openToken(view.now)],
     }),
     title: TITLES[action](partyWord(party)),
     choice: {
@@ -239,7 +240,7 @@ function onlyWay(way: GroupWay, signedUp: boolean): string {
  * the text says what Submit does. "Label for a new group (optional)" where a new group is among
  * the ways (ignored for a move). Its custom id `party:<id>:regroupform`, `SIGNED_UP_MARK` first
  * for `Change group`, then the one way as its arguments where it asks nothing (`new`, or the
- * group's letter and stamp).
+ * group's letter and stamp), and last a per-open token (`openToken`, plan 8X-F).
  */
 export function groupMenuDialog(
   view: GroupDialogView,
@@ -274,6 +275,7 @@ export function groupMenuDialog(
       args: [
         ...(ownGroup ? [SIGNED_UP_MARK] : []),
         ...(only === undefined ? [] : wayValue(party, only).split(':')),
+        openToken(view.now),
       ],
     }),
     title: ownGroup ? 'Change group' : 'Join a group',
diff --git a/src/render/meet-dialog.test.ts b/src/render/meet-dialog.test.ts
index a49c5cd3cae2989231365f900d32a107f178ff7f..2434d2d6f211d5df13715921475dd1496dbdd964 100644
--- a/src/render/meet-dialog.test.ts
+++ b/src/render/meet-dialog.test.ts
@@ -3,6 +3,7 @@ import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
 import { checkModal } from '../../test/support/fake-interactions.js';
 import { at, PARTY_ZONE, testRaid, testRaidRules } from '../../test/support/parties.js';
 import { decodeCustomId } from '../discord/custom-id.js';
+import { openToken } from '../discord/dialog.js';
 import type { RaidParty } from '../domain/party/party.js';
 import { setHatchTime } from '../domain/party/raid.js';
 import { meetDialog, NO_MEETING } from './meet-dialog.js';
@@ -11,6 +12,14 @@ const HATCH = at('2026-10-13T14:30');
 const raid: RaidParty = setHatchTime(testRaid(), HATCH, testRaidRules(), at('2026-10-13T14:00'));
 
 describe('meetDialog', () => {
+  it('has a custom id of its own each time it opens: Discord keeps a pick per custom id (plan 8X-F)', () => {
+    // Staging of 8X: the web client preselected the time submitted before, not the group's.
+    const now = at('2026-10-13T14:12');
+    const first = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now });
+    const again = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now: now + 1_000 });
+    expect(again.custom_id).not.toBe(first.custom_id);
+  });
+
   it('asks for the meeting time of the member’s group in a menu, the hatch first on an egg', () => {
     const now = at('2026-10-13T14:12');
     const dialog = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now });
@@ -20,7 +29,7 @@ describe('meetDialog', () => {
       kind: 'meet',
       id: raid.id,
       action: 'time',
-      args: ['A', raid.createdAt.toString(36)],
+      args: ['A', raid.createdAt.toString(36), openToken(now)],
     });
     expect(dialogTexts(dialog)).toEqual(['For your group: everybody in it is told.']);
     const choices = dialogChoices(dialog);
diff --git a/src/render/meet-dialog.ts b/src/render/meet-dialog.ts
index ae82262a212e1fae097082b0b2b55356bc75bc77..79c401e8c85f6d9c1a1bd6068488278d5313784c 100644
--- a/src/render/meet-dialog.ts
+++ b/src/render/meet-dialog.ts
@@ -1,6 +1,6 @@
 import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
-import { dialog, type DialogOption } from '../discord/dialog.js';
+import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
 import { meetTimes, type MeetTime } from '../domain/party/meet-times.js';
 import { groupOf, groupStamp, type BattleParty, type GroupId } from '../domain/party/party.js';
 import { clockText } from './text.js';
@@ -17,7 +17,7 @@ import { clockText } from './text.js';
  */
 export const MEET_KIND = 'meet';
 
-/** The custom-id action of the dialog: `meet:<party id>:time:<group>:<stamp>`. */
+/** The custom-id action of the dialog: `meet:<party id>:time:<group>:<stamp>[:~<token>]`. */
 export const MEET_FORM = 'time';
 
 /** The menu of the times. */
@@ -50,7 +50,8 @@ function timeLabel(time: MeetTime, zone: string): string {
  * group has one, "No meeting time" last. The group's time is chosen to start with, else the next
  * in-game RSVP time (the hatch on an egg: the most common meeting time), else the first. A menu
  * keeps its order, so its start is marked only (Discord's `default`). Its custom id names the
- * group by its letter and stamp: a Submit for a group that went is refused.
+ * group by its letter and stamp (a Submit for a group that went is refused) and ends in a per-open
+ * token (`openToken`, plan 8X-F), so that Discord's client starts with the value marked.
  */
 export function meetDialog(view: MeetDialogView): APIModalInteractionResponseCallbackData {
   const { party, groupId, zone, now } = view;
@@ -72,7 +73,7 @@ export function meetDialog(view: MeetDialogView): APIModalInteractionResponseCal
       kind: MEET_KIND,
       id: party.id,
       action: MEET_FORM,
-      args: [groupId, group ? groupStamp(party, group) : '0'],
+      args: [groupId, group ? groupStamp(party, group) : '0', openToken(now)],
     }),
     title: party.groups.length > 1 ? `Meeting time for group ${groupId}` : 'Meeting time',
     text: 'For your group: everybody in it is told.',
````

### Task 5: 8X-F 5: max and big events kept in the database, migration 029

Prototype commit: `361c4845403836b043b8119008aab97b21464bd8`

ScrapedDuck dropped the 10-19 Max Monday within its week, and a restart then lost
the week's featured boss (staging of 8X). The max events and the big events are
now kept as RaidEventService last merged them: table MaxEvent (migration 029, a
kind column, big for a big event), MaxEventRepository and its twin
MemoryMaxEvents running maxEventCases. The table is replaced whole after each
read, so what the merge drops (a max event started eight days ago, a big event
once over, one not begun that the read no longer lists) goes from it too. They
are loaded before the first read (loadMax, after loadResearch in app.ts). A
failure to keep or load them is logged and changes nothing else.

**Files:**

```
 docs/architecture/testing.md                        |   1 +
 docs/architecture/utilities.md                      |   4 +-
 src/app.ts                                          |   5 ++
 src/db/migrations/2026_10_22_029_max_events.ts      |  39 ++++++++++++
 src/db/migrations/index.ts                          |   2 +
 src/db/migrator.db.test.ts                          |   2 +
 src/db/repositories/max-event-repository.db.test.ts |  60 +++++++++++++++++++
 src/db/repositories/max-event-repository.ts         | 127 ++++++++++++++++++++++++++++++++++++++++
 src/db/table-names.ts                               |   1 +
 src/db/types.ts                                     |  13 ++++
 src/services/raid-event-service.test.ts             | 122 ++++++++++++++++++++++++++++++++++++++
 src/services/raid-event-service.ts                  | 100 +++++++++++++++++++++++++------
 test/support/max-event-store-cases.ts               |  66 +++++++++++++++++++++
 test/support/max-event-store.test.ts                |  23 ++++++++
 test/support/max-event-store.ts                     |  53 +++++++++++++++++
 15 files changed, 599 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/raid-event-service.test.ts test/support/max-event-store.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 361c4845403836b043b8119008aab97b21464bd8 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 5: max and big events kept in the database, migration 029`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 4ba21662e923c328516a6ace8a47fe85784ae301..686207730d788041740d7f70637313c601e8b3dc 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -57,6 +57,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Reports at stops (plans 8R-1, 8R-2)
 
 - Each repository of `stop-reports.md` and its twin run one set of cases: `stopReportCases` (`test/support/stop-report-cases.ts`, with `reportedStop(n, overrides)` (Yellow Mural `n` at 40.44…, −79.99: outside the invented regions, so a test that needs a region moves it, as `west(n)` in `stop-posts.test.ts`), `researchReport()`, `REPORT_NOW`, `REPORT_SERVER`, `DRATINI`), `pineStopCases` (`newPineStop()`), `researchEventCases`, `researchTaskCases` and `stopPostCases` (`test/support/research-store-cases.ts`, with `INTO_THE_WILD`, `PAWNIARD_DAY`, `listedTask()`; twins `MemoryResearchEvents`, `MemoryResearchTasks`, `MemoryStopPosts` in `test/support/research-store.ts`), `targetWantCases` (its constants of every kind of target), `wantBoxCases`.
+- The kept max and big events (plan 8X-F, `utilities.md`): `maxEventCases` (`test/support/max-event-store-cases.ts`, with `feedMaxEvents()` and `feedBigEvents()`, those of the recorded feed) run on `MaxEventRepository` and its twin `MemoryMaxEvents` (`test/support/max-event-store.ts`, `failing` per method).
 - The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `ctx.researchTasks` of `createTestContext()`). Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 30cbc4f29779dc528cec9cfc8d54bb437be06acf..1b30331c8306577e2dfa489bed19bfa157ea82f2 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -23,9 +23,9 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
 - Both boss lists are one machine with two families (plan 8X-2): `BossFeedService<T>` (`src/services/boss-feed-service.ts`: the stored list at start, the first read when it is older than the refresh, retries, the out-of-date warning, override writes one at a time) with a `BossFeedFamily` (its noun in the log, its parser, its list in effect, its override rules); `RaidBossService` and `MaxBossService` are its families. The list rules (`familyBosses`, `familyOverrideKeys`, `familyReport`, `diffFeedIn`, `diffBossesIn`) take the family's tier operations (`RAID_OPS`, `MAX_OPS`); `effectiveBosses`, `bossReport` and the rest keep their raid signatures. The tables are kept apart per family by their levels (`RaidBossRepository`: every level but the max tiers, so the retired EX level stays the raids' to report; `MaxBossRepository`: `MAX_TIERS`): every read and write filters by the family, and an override without a tier (a shiny one for every tier) is a raid override.
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
-- Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended and the max events are kept in memory only, so a restart after the event undoes it and the boss is offered again until Pokebattler drops it (final review X3-F2: no migration keeps the events; step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
+- Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended; the max events are kept in the database since plan 8X-F (`MaxEvent`, below), an ended one while it started less than eight days ago, so only a restart later than that offers the boss again until Pokebattler drops it (step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
-- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`, in memory: only a restart in the week after the feed dropped its Monday entirely loses the week's boss). Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read). The raid events (`merged`) are still kept in memory only: a follow-up. Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
 - The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
diff --git a/src/app.ts b/src/app.ts
index e4fff99f716bd7cbb3cbee5dd10eed2e517a64b9..34d4b4899c0363865e5f380371b8330462154c6f 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -81,6 +81,7 @@ import { GruntMessageRepository } from './db/repositories/grunt-message-reposito
 import { GruntMessageService } from './services/grunt-messages.js';
 import { RocketService } from './services/rocket-reports.js';
 import { ResearchEventRepository } from './db/repositories/research-event-repository.js';
+import { MaxEventRepository } from './db/repositories/max-event-repository.js';
 import { StopReportRepository } from './db/repositories/stop-report-repository.js';
 import { StopReportService } from './services/stop-reports.js';
 import { StopPostService } from './services/stop-posts.js';
@@ -258,6 +259,8 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     // The events with field research of their own, kept as seen (plan 8R-1).
     research: new ResearchEventRepository(db),
+    // The max events and the big events, kept as last merged (plan 8X-F).
+    maxEvents: new MaxEventRepository(db, log),
     log,
   });
   // The field research task list (plan 8R-1): Leek Duck's page, the last good list kept.
@@ -771,6 +774,8 @@ export async function startApp(
     await researchTasks.load();
     await rocketLineups.load();
     await raidEvents.loadResearch();
+    // Before the first read of the feed: the week's featured boss, a max battle's default end.
+    await raidEvents.loadMax();
     await gyms.load();
     // The gyms that waited for Google before a restart, and those that lack what it gives.
     await gymUpkeep.resume();
diff --git a/src/db/migrations/2026_10_22_029_max_events.ts b/src/db/migrations/2026_10_22_029_max_events.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cd690d8a461bc6430bddced3304e6696855088d4
--- /dev/null
+++ b/src/db/migrations/2026_10_22_029_max_events.ts
@@ -0,0 +1,39 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * The max events kept across a restart (plan 8X-F; the staging of 8X: ScrapedDuck dropped the
+ * 10-19 Max Monday within its week, and a restart then lost the week's featured boss).
+ *
+ * - `MaxEvent`: the max events (`kind` `max-monday` or `max-battle`) and the big events with
+ *   Gigantamax battles all day (`kind` `big`) of the events feed, as `RaidEventService` last
+ *   merged them: the feed's `eventID` (`eventId`, null for a max event without one), the name,
+ *   start and end (epoch milliseconds), for a max event whether it is short and whether its hours
+ *   were assumed, and what its name features (`featured`, JSON `{ gigantamax, names }`, null for
+ *   nothing). The table is replaced whole after each read (`MaxEventRepository.replace`): which
+ *   rows are one event is the service's merge (`sameMaxEvent`: the feed id, else kind, name and
+ *   start), so no unique key refuses a feed that lists one id twice.
+ *
+ * Safe to run again after a failure half-way: the table is created only when it is missing.
+ */
+export const maxEvents: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists MaxEvent (
+        id int unsigned not null auto_increment,
+        kind varchar(20) not null,
+        eventId varchar(200) null,
+        name varchar(100) not null,
+        startsAt bigint not null,
+        endsAt bigint not null,
+        short tinyint(1) not null default 0,
+        hoursAssumed tinyint(1) not null default 0,
+        featured json null,
+        primary key (id)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 7f2a494fca079358a3f9f21c3437512b5e2aa623..2ef80c72ce42614b49ee18119386b857d1e9575a 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -27,6 +27,7 @@ import { maxBattleHistory } from './2026_10_21_025_max_battle_history.js';
 import { trainSpotStops } from './2026_10_21_026_train_spot_stops.js';
 import { stopReports } from './2026_10_21_027_stop_reports.js';
 import { rocket } from './2026_10_22_028_rocket.js';
+import { maxEvents } from './2026_10_22_029_max_events.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -61,4 +62,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_21_026_train_spot_stops': trainSpotStops,
   '2026_10_21_027_stop_reports': stopReports,
   '2026_10_22_028_rocket': rocket,
+  '2026_10_22_029_max_events': maxEvents,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 1c63d10885ce9a97eea21dfec138ccaf4210256a..eb7d4f95d0cc1ddb5ccd0a1238dafe98058852cc 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -64,6 +64,7 @@ const ADDED_TABLES = [
   'ResearchTask',
   'RocketLineup',
   'GruntMessage',
+  'MaxEvent',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -187,6 +188,7 @@ describe('runMigrations', () => {
       '2026_10_21_026_train_spot_stops',
       '2026_10_21_027_stop_reports',
       '2026_10_22_028_rocket',
+      '2026_10_22_029_max_events',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/max-event-repository.db.test.ts b/src/db/repositories/max-event-repository.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..36e4bcbf02c93dcb3359c21ce9c0a2991320bdbe
--- /dev/null
+++ b/src/db/repositories/max-event-repository.db.test.ts
@@ -0,0 +1,60 @@
+import type { Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { maxEventCases, feedMaxEvents } from '../../../test/support/max-event-store-cases.js';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import type { DB } from '../types.js';
+import { MaxEventRepository } from './max-event-repository.js';
+
+/** The kept max and big events of plan 8X-F (migration 029). */
+describe('MaxEventRepository', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  maxEventCases(async () => {
+    await db.deleteFrom('MaxEvent').execute();
+    return new MaxEventRepository(db);
+  });
+
+  it('leaves out a row it cannot read, and says so', async () => {
+    await db.deleteFrom('MaxEvent').execute();
+    const { log, entries } = createTestLogger();
+    const store = new MaxEventRepository(db, log);
+    const [event] = feedMaxEvents();
+    if (!event) throw new Error('no max event in the feed');
+    await store.replace({ max: [event], big: [] });
+    await db
+      .insertInto('MaxEvent')
+      .values({
+        kind: 'max-week',
+        eventId: 'max-week-2026',
+        name: 'Max Week',
+        startsAt: '1',
+        endsAt: '2',
+        featured: null,
+      })
+      .execute();
+    await db
+      .insertInto('MaxEvent')
+      .values({
+        kind: 'max-monday',
+        eventId: 'max-mondays-1999-01-04',
+        name: 'Dynamax Abra during Max Monday',
+        startsAt: '1',
+        endsAt: '2',
+        featured: JSON.stringify({ names: 'Abra' }),
+      })
+      .execute();
+    expect(await store.all()).toEqual({ max: [event], big: [] });
+    expect(
+      entries.filter((entry) => entry.msg === 'a kept max event cannot be read; left out'),
+    ).toHaveLength(2);
+  });
+});
diff --git a/src/db/repositories/max-event-repository.ts b/src/db/repositories/max-event-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3298228e54012a39f61b29460833aeafc7a30f68
--- /dev/null
+++ b/src/db/repositories/max-event-repository.ts
@@ -0,0 +1,127 @@
+import type { Kysely } from 'kysely';
+import { z } from 'zod';
+import type { BigEvent, FeaturedNames, MaxEvent } from '../../domain/time/max-events.js';
+import type { Logger } from '../../log.js';
+import { inTransaction } from '../transaction.js';
+import type { DB } from '../types.js';
+
+/** The max events and the big events Pine keeps, each kind in order of its start. */
+export interface KeptMaxEvents {
+  max: MaxEvent[];
+  big: BigEvent[];
+}
+
+/**
+ * The max events and the big events of the events feed as Pine last merged them (plan 8X-F;
+ * table `MaxEvent` of migration 029): a restart in the week after ScrapedDuck dropped a Max
+ * Monday keeps the week's featured boss, and a big event dropped while it is on keeps a max
+ * battle's default end. Twin `MemoryMaxEvents` (`test/support/max-event-store.ts`), both running
+ * `maxEventCases`.
+ */
+export interface MaxEventStorage {
+  /** Every event kept, each kind in order of its start (then its name). */
+  all(): Promise<KeptMaxEvents>;
+  /**
+   * Keeps these events in the place of all kept before, in one transaction: the lists the last
+   * read merged (`RaidEventService`), which drop what is to be forgotten.
+   */
+  replace(events: KeptMaxEvents): Promise<void>;
+}
+
+/** The `kind` of a big event's row; a max event's is its `MaxEventKind`. */
+const BIG = 'big';
+
+/** What a row's `featured` holds: `FeaturedNames`. */
+const featuredDocument = z.object({
+  gigantamax: z.boolean(),
+  names: z.array(z.string()),
+});
+
+/** Each kind in order of its start, then its name (as `RaidEventService` orders them). */
+function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
+  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+}
+
+/** The `MaxEvent` table. */
+export class MaxEventRepository implements MaxEventStorage {
+  /** `log` hears of a row that cannot be read (left out). */
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly log?: Logger,
+  ) {}
+
+  async all(): Promise<KeptMaxEvents> {
+    const rows = await this.db.selectFrom('MaxEvent').selectAll().orderBy('id').execute();
+    const max: MaxEvent[] = [];
+    const big: BigEvent[] = [];
+    for (const row of rows) {
+      const start = Number(row.startsAt);
+      const end = Number(row.endsAt);
+      if (row.kind === BIG && row.eventId !== null) {
+        big.push({ id: row.eventId, name: row.name, start, end });
+        continue;
+      }
+      const featured = this.featuredOf(row.featured);
+      if ((row.kind !== 'max-monday' && row.kind !== 'max-battle') || featured === null) {
+        this.log?.warn(
+          { event: row.eventId ?? row.name },
+          'a kept max event cannot be read; left out',
+        );
+        continue;
+      }
+      max.push({
+        kind: row.kind,
+        name: row.name,
+        start,
+        end,
+        short: row.short === 1,
+        hoursAssumed: row.hoursAssumed === 1,
+        featured,
+        id: row.eventId ?? undefined,
+      });
+    }
+    return { max: inOrder(max), big: inOrder(big) };
+  }
+
+  /** A row's `featured`: undefined for none, null for what cannot be read. */
+  private featuredOf(value: unknown): FeaturedNames | undefined | null {
+    if (value === null) return undefined;
+    try {
+      const read = featuredDocument.safeParse(
+        typeof value === 'string' ? JSON.parse(value) : value,
+      );
+      return read.success ? read.data : null;
+    } catch {
+      return null;
+    }
+  }
+
+  replace(events: KeptMaxEvents): Promise<void> {
+    return inTransaction(this.db, async (trx) => {
+      await trx.deleteFrom('MaxEvent').execute();
+      const rows = [
+        ...events.max.map((event) => ({
+          kind: event.kind,
+          eventId: event.id ?? null,
+          name: event.name,
+          startsAt: String(event.start),
+          endsAt: String(event.end),
+          short: event.short ? 1 : 0,
+          hoursAssumed: event.hoursAssumed ? 1 : 0,
+          featured: event.featured === undefined ? null : JSON.stringify(event.featured),
+        })),
+        ...events.big.map((event) => ({
+          kind: BIG,
+          eventId: event.id,
+          name: event.name,
+          startsAt: String(event.start),
+          endsAt: String(event.end),
+          short: 0,
+          hoursAssumed: 0,
+          featured: null,
+        })),
+      ];
+      if (rows.length > 0) await trx.insertInto('MaxEvent').values(rows).execute();
+    });
+  }
+}
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index 9768b15b0e6eccd05b9beca39640d460ec5fd3bb..b6c6ad8a5f46c7fd7307d1b40cf4f7bc02132dac 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -21,6 +21,7 @@ export const PINE_TABLES: readonly string[] = [
   'GymWayfarer',
   'EndedPartyPost',
   'HistoryOptIn',
+  'MaxEvent',
   'MeetupAppeal',
   'MeetupBlock',
   'MeetupPlaceAsk',
diff --git a/src/db/types.ts b/src/db/types.ts
index f699de0a92ba462debaaa8878eef25e9719ceeaa..874e3a415c0eba24ce72f479b3383548a7186e8b 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -154,6 +154,18 @@ export interface HistoryOptIn {
   serverId: string;
 }
 
+export interface MaxEvent {
+  endsAt: string;
+  eventId: string | null;
+  featured: Json | null;
+  hoursAssumed: Generated<number>;
+  id: Generated<number>;
+  kind: string;
+  name: string;
+  short: Generated<number>;
+  startsAt: string;
+}
+
 export interface MeetupAppeal {
   channelId: string | null;
   createdAt: string;
@@ -656,6 +668,7 @@ export interface DB {
   GymReview: GymReview;
   GymWayfarer: GymWayfarer;
   HistoryOptIn: HistoryOptIn;
+  MaxEvent: MaxEvent;
   MeetupAppeal: MeetupAppeal;
   MeetupBlock: MeetupBlock;
   MeetupPlaceAsk: MeetupPlaceAsk;
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index bb23a09063f28a43cc0c0d53462f985c4f289f0e..bd9cf9594f329fc36c1d802e7d9256b3fa7c8389 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -8,6 +8,8 @@ import { createTestLogger } from '../../test/support/test-logger.js';
 import { RaidEventService, type FetchEvents } from './raid-event-service.js';
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
 import { MemoryResearchEvents } from '../../test/support/research-store.js';
+import { MemoryMaxEvents } from '../../test/support/max-event-store.js';
+import type { MaxEventStorage } from '../db/repositories/max-event-repository.js';
 import { INTO_THE_WILD, PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
 
 const URL = 'https://example.test/events.json';
@@ -28,6 +30,7 @@ function service(
     now?: () => number;
     url?: string;
     research?: ResearchEventStorage;
+    maxEvents?: MaxEventStorage;
   } = {},
 ) {
   const { log, entries } = createTestLogger();
@@ -378,6 +381,125 @@ describe('RaidEventService', () => {
     });
   });
 
+  // Plan 8X-F (staging of 8X): ScrapedDuck dropped the 10-19 Max Monday within its week, and a
+  // restart lost the week's featured boss.
+  describe('the max and big events kept across a restart (plan 8X-F)', () => {
+    const full = () => readMaxEventFeed() as { eventID?: string; name: string }[];
+    const without = (...ids: string[]) =>
+      JSON.stringify(full().filter((event) => !ids.includes(event.eventID ?? '')));
+
+    it('keeps those of each read, and gives the kept ones after a restart, before any read', async () => {
+      const store = new MemoryMaxEvents();
+      const feed = JSON.stringify(full());
+      const { events } = service(() => Promise.resolve(reply(200, feed)), {
+        maxEvents: store,
+        now: () => at('2026-10-20T22:00'),
+      });
+      await events.refresh();
+      expect(await store.all()).toEqual({ max: events.maxEvents(), big: events.bigEvents() });
+      expect(events.maxEvents()).toHaveLength(7);
+
+      const again = service(() => Promise.reject(new Error('down')), { maxEvents: store });
+      await again.events.loadMax();
+      expect(again.events.maxEvents()).toEqual(events.maxEvents());
+      expect(again.events.bigEvents()).toEqual(events.bigEvents());
+    });
+
+    it("keeps the week's featured boss after a restart once the feed dropped its Monday", async () => {
+      const store = new MemoryMaxEvents();
+      let body = JSON.stringify(full());
+      let now = at('2026-10-26T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
+      const first = service(fetch, { maxEvents: store, now: () => now });
+      await first.events.refresh();
+      // Thursday, after a restart: the feed no longer lists Sableye's Monday.
+      now = at('2026-10-29T12:00');
+      body = without('max-mondays-2026-10-26');
+      const { events } = service(fetch, { maxEvents: store, now: () => now });
+      await events.loadMax();
+      await events.refresh();
+      expect(
+        featuredAt(events.maxEvents(), now, 'America/New_York').map(({ event }) => event.name),
+      ).toEqual(['Dynamax Sableye during Max Monday']);
+      // Eight days after its start it is forgotten, also by the store.
+      now = at('2026-11-03T06:00');
+      await events.refresh();
+      const kept = (await store.all()).max.map((event) => event.id);
+      expect(kept).not.toContain('max-mondays-2026-10-26');
+      expect(events.maxEvents().map((event) => event.id)).not.toContain('max-mondays-2026-10-26');
+    });
+
+    it('forgets a kept event not begun that the read no longer lists, and a big one once over', async () => {
+      const store = new MemoryMaxEvents();
+      let body = JSON.stringify(full());
+      let now = at('2026-11-14T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
+      const first = service(fetch, { maxEvents: store, now: () => now });
+      await first.events.refresh();
+      const wild = 'pokemon-go-wild-area-2026-global';
+      const cryogonal = 'max-mondays-2026-11-30';
+      // After a restart: Cryogonal's Monday moved away, the Wild Area dropped while it is on.
+      now = at('2026-11-15T09:00');
+      body = without(cryogonal, wild);
+      const { events } = service(fetch, { maxEvents: store, now: () => now });
+      await events.loadMax();
+      await events.refresh();
+      expect(events.maxEvents().map((event) => event.id)).not.toContain(cryogonal);
+      expect(events.bigEvents().map((event) => event.id)).toContain(wild);
+      expect((await store.all()).big.map((event) => event.id)).toContain(wild);
+      // Once the Wild Area is over, a read forgets it.
+      now = at('2026-11-15T19:00');
+      await events.refresh();
+      expect((await store.all()).big.map((event) => event.id)).not.toContain(wild);
+      expect((await store.all()).max.map((event) => event.id)).not.toContain(cryogonal);
+    });
+
+    it('takes a read made before the kept events were loaded over the kept copy', async () => {
+      const store = new MemoryMaxEvents({ max: [], big: [] });
+      const feed = JSON.stringify(full());
+      const { events } = service(() => Promise.resolve(reply(200, feed)), {
+        maxEvents: store,
+        now: () => at('2026-10-20T22:00'),
+      });
+      await events.refresh();
+      const read = events.maxEvents();
+      await store.replace({ max: [], big: [] });
+      await events.loadMax();
+      expect(events.maxEvents()).toEqual(read);
+    });
+
+    it('keeps the events of a read that cannot be stored, and says so', async () => {
+      const store = new MemoryMaxEvents();
+      store.failing.set('replace', new Error('database down'));
+      const feed = JSON.stringify(full());
+      const { events, entries } = service(() => Promise.resolve(reply(200, feed)), {
+        maxEvents: store,
+        now: () => at('2026-10-20T22:00'),
+      });
+      await expect(events.refresh()).resolves.toMatchObject({ status: 'updated' });
+      expect(events.maxEvents()).toHaveLength(7);
+      expect(
+        entries.some(
+          (entry) =>
+            entry.level === 40 && entry.msg === 'could not keep the max events of the feed',
+        ),
+      ).toBe(true);
+    });
+
+    it('starts without kept events when they cannot be read, and says so', async () => {
+      const store = new MemoryMaxEvents();
+      store.failing.set('all', new Error('database down'));
+      const { events, entries } = service(() => Promise.reject(new Error('down')), {
+        maxEvents: store,
+      });
+      await events.loadMax();
+      expect(events.maxEvents()).toEqual([]);
+      expect(entries.some((entry) => entry.msg === 'could not read the kept max events')).toBe(
+        true,
+      );
+    });
+  });
+
   // Plan 8X-3: the big events with Gigantamax battles all day, of the same feed.
   describe('the big events', () => {
     it('keeps the global editions of a read, and those it had when a read fails', async () => {
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index 249bb4fa11036213e0b7de518fc5cbe654bbe57d..ecd4166c5ebcea06740cc73e75862495103724f3 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -13,6 +13,7 @@ import {
   type ResearchEvent,
 } from '../domain/time/research-events.js';
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
+import type { KeptMaxEvents, MaxEventStorage } from '../db/repositories/max-event-repository.js';
 import type { Logger } from '../log.js';
 import { failureReason } from './failure-reason.js';
 
@@ -26,6 +27,18 @@ const REMEMBER_MS = 8 * 24 * 60 * MINUTE_MS;
 /** The longest delay `setTimeout` accepts; anything longer fires immediately. */
 const MAX_TIMER_MS = 2 ** 31 - 1;
 
+/** One max event by its feed id, whatever the feed renamed or moved; else by kind, name, start. */
+function sameMaxEvent(a: MaxEvent, b: MaxEvent): boolean {
+  return a.id !== undefined && b.id !== undefined
+    ? a.id === b.id
+    : a.kind === b.kind && a.name === b.name && a.start === b.start;
+}
+
+/** Events in order of their start, then their name. */
+function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
+  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+}
+
 /** Thrown inside a download that `stop` ended; not worth a warning. */
 class RefreshStopped extends Error {}
 
@@ -56,6 +69,12 @@ export interface RaidEventOptions {
    * Without it they are kept in memory only.
    */
   research?: ResearchEventStorage;
+  /**
+   * Where the max events and the big events are kept as last merged (plan 8X-F), so that a
+   * restart after the feed dropped one keeps it as a read would have. Without it they are kept
+   * in memory only.
+   */
+  maxEvents?: MaxEventStorage;
 }
 
 /** What handlers need: the Raid Hours and Raid Days known from the feed. */
@@ -100,13 +119,16 @@ export type RefreshResult =
   | { status: 'failed'; reason: string };
 
 /**
- * Keeps the Raid Hours and Raid Days of the events feed in memory. Nothing is stored: after a
+ * Keeps the Raid Hours and Raid Days of the events feed in memory. They are not stored: after a
  * restart the weekly Raid Hour of the settings applies until the first download succeeds, which
- * `start` attempts at once. A feed that cannot be read never fails anything: the events of the
- * last good read stay in use. The feed may drop an event once it is over, but the rule for the
- * weekly Raid Hour needs the whole current week, so an event that has begun and ended less than
- * eight days ago is kept after a read that no longer lists it. One that has not begun yet and is
- * no longer listed was moved or cancelled, and is dropped.
+ * `start` attempts at once (an event the feed dropped before the restart is lost: a follow-up of
+ * plan 8X-F). A feed that cannot be read never fails anything: the events of the last good read
+ * stay in use. The feed may drop an event once it is over, but the rule for the weekly Raid Hour
+ * needs the whole current week, so an event that has begun and ended less than eight days ago is
+ * kept after a read that no longer lists it. One that has not begun yet and is no longer listed
+ * was moved or cancelled, and is dropped. The max events and the big events are merged by the
+ * same rules and kept in the database (`maxEvents`, plan 8X-F; loaded by `loadMax`), as are the
+ * events with field research (`research`, `loadResearch`).
  */
 export class RaidEventService
   implements RaidEventProvider, MaxEventProvider, ResearchEventProvider
@@ -154,6 +176,52 @@ export class RaidEventService
     this.researchListeners.push(listener);
   }
 
+  /**
+   * Takes the max events and the big events kept by the last run (plan 8X-F; no network), before
+   * the first read: the week's featured boss and a max battle's default end come from them until
+   * then. An event a read has given meanwhile stays as read. One that cannot be read is logged,
+   * and the service starts without them, as before 8X-F. It must stay before `start()` in
+   * `app.ts` (review r0, X5-6): a read that came first would merge without the kept events and
+   * replace them in the database, so an event the feed dropped would be lost after all.
+   */
+  async loadMax(): Promise<void> {
+    let kept: KeptMaxEvents | undefined;
+    try {
+      kept = await this.options.maxEvents?.all();
+    } catch (err) {
+      this.safely(() => this.options.log.warn({ err }, 'could not read the kept max events'));
+      return;
+    }
+    if (!kept) return;
+    const read = this.currentMax;
+    this.currentMax = inOrder([
+      ...kept.max.filter((old) => !read.some((event) => sameMaxEvent(event, old))),
+      ...read,
+    ]);
+    const readBig = this.currentBig;
+    this.currentBig = inOrder([
+      ...kept.big.filter((old) => !readBig.some((event) => event.id === old.id)),
+      ...readBig,
+    ]);
+  }
+
+  /**
+   * Keeps the max events and the big events as merged now (`maxEvents`). What fails is logged:
+   * the events of the read stand.
+   */
+  private async keepMax(): Promise<void> {
+    try {
+      await this.options.maxEvents?.replace({
+        max: [...this.currentMax],
+        big: [...this.currentBig],
+      });
+    } catch (err) {
+      this.safely(() =>
+        this.options.log.warn({ err }, 'could not keep the max events of the feed'),
+      );
+    }
+  }
+
   /** Takes the research events kept by the last run (no network). */
   async loadResearch(): Promise<void> {
     const kept = await this.options.research?.all();
@@ -239,6 +307,7 @@ export class RaidEventService
       this.current = this.merged(read.raid);
       this.currentMax = this.mergedMax(read.max.events);
       this.currentBig = this.mergedBig(read.big);
+      await this.keepMax();
       this.tellOfHours(read.max);
       await this.keepResearch(read.json);
     } catch (err) {
@@ -271,37 +340,34 @@ export class RaidEventService
    * lists it without hours (then its hours are assumed, `parseMaxEventFeed`: the feed of
    * 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end), and a Max Monday's
    * boss is featured for its whole week (`featuredAt`). One that has not begun and is no longer
-   * listed was moved or cancelled: it goes. In memory only: only a restart in the week after the
-   * feed has dropped its Monday entirely loses the week's boss until the next one.
+   * listed was moved or cancelled: it goes. Kept in the database (`keepMax`, plan 8X-F: the
+   * staging of 8X lost the week's boss to a restart after the feed dropped its Monday), so the
+   * events known before are also those of the last run (`loadMax`).
    */
   private mergedMax(read: readonly MaxEvent[]): MaxEvent[] {
     const now = (this.options.now ?? Date.now)();
-    // One event by its feed id, whatever the feed renamed or moved: the copy just read wins.
-    const same = (a: MaxEvent, b: MaxEvent): boolean =>
-      a.id !== undefined && b.id !== undefined
-        ? a.id === b.id
-        : a.kind === b.kind && a.name === b.name && a.start === b.start;
     const dropped = this.currentMax.filter(
       (old) =>
         old.start <= now &&
         old.start > now - REMEMBER_MS &&
-        !read.some((event) => same(event, old)),
+        !read.some((event) => sameMaxEvent(event, old)),
     );
-    return [...read, ...dropped].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+    return inOrder([...read, ...dropped]);
   }
 
   /**
    * The big events just read, plus those known before that have begun and not ended, which the
    * feed no longer lists (review A of 8X-3: as `mergedMax`, by the feed's id): a Wild Area dropped
    * on its second day is still on. One that has not begun and is no longer listed was moved or
-   * cancelled, and one that is over is of no use: they go.
+   * cancelled, and one that is over is of no use: they go. Kept in the database with the max
+   * events (`keepMax`, plan 8X-F).
    */
   private mergedBig(read: readonly BigEvent[]): BigEvent[] {
     const now = (this.options.now ?? Date.now)();
     const kept = this.currentBig.filter(
       (old) => old.start <= now && now < old.end && !read.some((event) => event.id === old.id),
     );
-    return [...read, ...kept].sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+    return inOrder([...read, ...kept]);
   }
 
   /**
diff --git a/test/support/max-event-store-cases.ts b/test/support/max-event-store-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6aa93a1a34cdf04e6755e443e856dfb54db57d57
--- /dev/null
+++ b/test/support/max-event-store-cases.ts
@@ -0,0 +1,66 @@
+import { expect, it } from 'vitest';
+import type { MaxEventStorage } from '../../src/db/repositories/max-event-repository.js';
+import {
+  parseBigEventFeed,
+  parseMaxEventFeed,
+  type BigEvent,
+  type MaxEvent,
+} from '../../src/domain/time/max-events.js';
+import { readMaxEventFeed } from './max-events.js';
+
+const ZONE = 'America/New_York';
+
+/** The max events of the recorded feed (`readMaxEventFeed`), in order of their start. */
+export function feedMaxEvents(): MaxEvent[] {
+  return parseMaxEventFeed(readMaxEventFeed(), ZONE).events;
+}
+
+/** The big events of the recorded feed, in order of their start. */
+export function feedBigEvents(): BigEvent[] {
+  return parseBigEventFeed(readMaxEventFeed(), ZONE);
+}
+
+/** What the kept max and big events do (plan 8X-F), for the repository and its twin. */
+export function maxEventCases(made: () => Promise<MaxEventStorage>): void {
+  it('keeps nothing before the first read', async () => {
+    const store = await made();
+    expect(await store.all()).toEqual({ max: [], big: [] });
+  });
+
+  it('keeps the events as given, every field, each kind in order of its start', async () => {
+    const store = await made();
+    const max = feedMaxEvents();
+    const big = feedBigEvents();
+    // Among them one with assumed hours, one that features nothing, a short one.
+    expect(max.some((event) => event.hoursAssumed)).toBe(true);
+    expect(max.some((event) => event.featured === undefined)).toBe(true);
+    expect(max.some((event) => event.short)).toBe(true);
+    await store.replace({ max: [...max].reverse(), big: [...big].reverse() });
+    expect(await store.all()).toEqual({ max, big });
+  });
+
+  it('keeps an event without a feed id, and a Gigantamax one, as they are', async () => {
+    const store = await made();
+    const [first] = feedMaxEvents();
+    if (!first) throw new Error('no max event in the feed');
+    const giga: MaxEvent = {
+      ...first,
+      id: undefined,
+      name: 'Gigantamax Machamp Max Battle Day',
+      featured: { gigantamax: true, names: ['Machamp'] },
+    };
+    await store.replace({ max: [giga], big: [] });
+    expect(await store.all()).toEqual({ max: [giga], big: [] });
+  });
+
+  it('keeps what the last replace gave in the place of all it kept before', async () => {
+    const store = await made();
+    const max = feedMaxEvents();
+    const big = feedBigEvents();
+    await store.replace({ max, big });
+    await store.replace({ max: max.slice(1, 2), big: [] });
+    expect(await store.all()).toEqual({ max: max.slice(1, 2), big: [] });
+    await store.replace({ max: [], big: [] });
+    expect(await store.all()).toEqual({ max: [], big: [] });
+  });
+}
diff --git a/test/support/max-event-store.test.ts b/test/support/max-event-store.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b5ddfa23048219d664d492763eaaf51f1e44d414
--- /dev/null
+++ b/test/support/max-event-store.test.ts
@@ -0,0 +1,23 @@
+import { describe, expect, it } from 'vitest';
+import { maxEventCases } from './max-event-store-cases.js';
+import { MemoryMaxEvents } from './max-event-store.js';
+
+describe('MemoryMaxEvents', () => {
+  maxEventCases(() => Promise.resolve(new MemoryMaxEvents()));
+
+  // Review r0, X5-2: as the repository fails, by a rejected promise, never a throw at the call.
+  it('fails a method it is told to fail by rejecting its promise', async () => {
+    const store = new MemoryMaxEvents();
+    const down = new Error('database down');
+    store.failing.set('all', down);
+    store.failing.set('replace', down);
+    let all: Promise<unknown> | undefined;
+    let replace: Promise<unknown> | undefined;
+    expect(() => {
+      all = store.all();
+      replace = store.replace({ max: [], big: [] });
+    }).not.toThrow();
+    await expect(all).rejects.toBe(down);
+    await expect(replace).rejects.toBe(down);
+  });
+});
diff --git a/test/support/max-event-store.ts b/test/support/max-event-store.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6d40a4cd2e80d390c587e1cb60e8644190b62df1
--- /dev/null
+++ b/test/support/max-event-store.ts
@@ -0,0 +1,53 @@
+import type {
+  KeptMaxEvents,
+  MaxEventStorage,
+} from '../../src/db/repositories/max-event-repository.js';
+import type { BigEvent, MaxEvent } from '../../src/domain/time/max-events.js';
+
+/**
+ * The kept max and big events in memory (`MaxEventStorage`), the twin of `MaxEventRepository`;
+ * `failing` per method.
+ */
+export class MemoryMaxEvents implements MaxEventStorage {
+  private kept: KeptMaxEvents = { max: [], big: [] };
+  readonly failing = new Map<keyof MaxEventStorage, Error>();
+
+  constructor(kept: Partial<KeptMaxEvents> = {}) {
+    this.kept = copy({ max: kept.max ?? [], big: kept.big ?? [] });
+  }
+
+  /** The error a method is told to fail with: it rejects, as the repository does. */
+  private failure(method: keyof MaxEventStorage): Error | undefined {
+    return this.failing.get(method);
+  }
+
+  all(): Promise<KeptMaxEvents> {
+    const err = this.failure('all');
+    return err ? Promise.reject(err) : Promise.resolve(copy(this.kept));
+  }
+
+  replace(events: KeptMaxEvents): Promise<void> {
+    const err = this.failure('replace');
+    if (err) return Promise.reject(err);
+    this.kept = copy(events);
+    return Promise.resolve();
+  }
+}
+
+/** Each kind in order of its start (then name), as the repository gives them; copies. */
+function copy(events: KeptMaxEvents): KeptMaxEvents {
+  const order = (a: MaxEvent | BigEvent, b: MaxEvent | BigEvent): number =>
+    a.start - b.start || a.name.localeCompare(b.name);
+  return {
+    max: events.max
+      .map((event) => ({
+        ...event,
+        featured:
+          event.featured === undefined
+            ? undefined
+            : { ...event.featured, names: [...event.featured.names] },
+      }))
+      .sort(order),
+    big: events.big.map((event) => ({ ...event })).sort(order),
+  };
+}
````

### Task 6: 8X-F 6: words of the 8X staging, endSentence after a place's name

Prototype commit: `dac043ceafceeda19c8cf7c55c8edcecd10ee29c`

- endSentence (render/text.ts): a sentence that ends with a place's name gets no
  second period where what a reader sees ends in one ("Inc.."), looking through
  closing bold, a masked link's address and plain's escapes. Applied where a
  sentence ends with a gym, power spot, stop or route stop: /raid and screenshot
  reports, /location, the raid and max DMs, /research and /rocket remove, the
  train's added stop, movement and where-text, the kept-refused place ask.
- /max's exists answer names the battle's own boss "at this spot", with its post
  (Discord), "its post is being made", or no post (the map) (Matt).
- "at an unlisted power spot" in running text: the max DMs (MaxDmView.pin) and
  the meeting DM.
- LOBBY_OVER: "Over the lobby size: somebody should consider moving to another
  group." (Matt).
- The want dialog's Dynamax box without ", 1 to 5 stars" (Matt).

**Files:**

```
 docs/architecture/parties-and-posts.md   |  5 ++--
 src/commands/max/max-report.test.ts      | 71 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/max/max-report.ts           | 38 ++++++++++++++++++++--------
 src/commands/max/max.test.ts             | 12 ++++++---
 src/commands/notifications/wants.test.ts | 12 +++++++++
 src/commands/raids/location.ts           | 10 +++++---
 src/commands/raids/report.ts             |  9 ++++---
 src/commands/research/research.ts        |  9 ++++---
 src/commands/rocket/rocket.ts            |  6 ++---
 src/commands/screenshots/mention.ts      |  6 ++---
 src/commands/stops/pokestop.test.ts      |  3 +++
 src/commands/stops/pokestop.ts           |  8 +++---
 src/domain/pogo/want-boxes.ts            |  2 +-
 src/render/notify-dm.test.ts             | 39 +++++++++++++++++++++++++++++
 src/render/notify-dm.ts                  | 14 +++++++----
 src/render/party-post.lobby.test.ts      |  4 ++-
 src/render/party-post.ts                 |  2 +-
 src/render/place-asks.ts                 |  4 +--
 src/render/text.test.ts                  | 33 ++++++++++++++++++++++++
 src/render/text.ts                       | 22 ++++++++++++++++
 src/render/train-panel.ts                | 24 +++++++++++-------
 src/render/train-post.test.ts            | 12 +++++++++
 src/services/notify-service.max.test.ts  | 37 ++++++++++++++++++++++++++-
 src/services/notify-service.ts           |  8 +++++-
 src/services/train-service.test.ts       | 16 +++++++++++-
 src/services/train-service.ts            | 14 +++++++----
 src/web/max-report.test.ts               | 25 +++++++++++++++---
 src/web/max-routes.ts                    |  2 ++
 28 files changed, 381 insertions(+), 66 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/max/max-report.test.ts src/commands/max/max.test.ts src/commands/notifications/wants.test.ts src/commands/stops/pokestop.test.ts src/render/notify-dm.test.ts src/render/party-post.lobby.test.ts src/render/text.test.ts src/render/train-post.test.ts src/services/notify-service.max.test.ts src/services/train-service.test.ts src/web/max-report.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff dac043ceafceeda19c8cf7c55c8edcecd10ee29c -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 6: words of the 8X staging, endSentence after a place's name`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 5e64d31ec89ebc1b498db50c8c34d152d98e8fef..dac8c5188efd3e55683e87180da1758941f12789 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -34,7 +34,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 ## Max battles
 
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
-- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
+- One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
 - How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
 - Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
@@ -52,10 +52,11 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS` and `RETIRED_TAGS` (tags the bot once used: `/admin setup-forums` takes them off a forum, never a tag the server made); Discord allows a forum 20 tags, the server's own included (`MAX_FORUM_TAGS`, final review G2): `ensureTags` adds only what fits and logs the rest at warn, the posts go without them rather than every report failing, and `/admin setup-forums` takes the retired tags off first and names the tags a forum has no room for (`ForumSetup.tagsMissing`), `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
+- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody should consider moving to another group.", Matt, plan 8X-F) under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Manage train…, Split group…, Whole route, `trains.md`). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group newest first (`newestFirst`), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) newest first, then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>:<token>` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
+- A sentence that ends with a place's name (a gym, a power spot, a stop, a route's stop by its link) ends through `endSentence(text)` (`src/render/text.ts`, plan 8X-F): no period is added where what a reader sees already ends in one (`.`, `!`, `?`; through closing bold, a masked link's address and `plain`'s escapes), so "at **Fire Company Inc.**" never reads "Inc..". A battle at a pin is "at an unlisted power spot" in running text (the DMs' `MaxDmView.pin`, the meeting DM); the label `Unlisted power spot` stays where it is a name (the post, `/where`, the moderators' notice, the map).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit (some 86 snowflakes after a short text, 100 at most). `inMessages(text, members)` (plan 8X-1) pings them all: the text with as many as fit, then messages of mentions alone, each within 2,000 characters and 100 pings. `pingInMessages(deps, partyId, postId, text, members)` (`src/services/party-change.ts`) sends them one after the other, asking the store before each whether the party is still active with that post (a moved raid has another), and stops otherwise or when Discord says the post is gone (`complete`, `pinged`, and `stopped`: `gone`, or `moved` for a party still active with another post); `/shout` (`AttendanceService.shout`) goes through it, answering `gone` with how many it `pinged` before ("This raid is over. I pinged 86 trainers before it ended."), or `moved` ("This raid moved to another post: I pinged 86 trainers before it moved. Shout again there.", without the count when nobody was pinged yet, and then the use of `/shout` goes back: `givesBack`); `/shout group:True` pings only the others of the shouter's own group (not Complete, those who allow shout pings; the text says `to everybody in group B:`), refused in a party of one group (`one-group`: "This raid has one group: `/shout` without `group` pings everybody."), `nobody` with the group when nobody else is in it. Since plan 8X-4 (a Gigantamax train holds a hundred) a group's meeting time, a new group's notice (its sentence and hint first), a timed party's start, a train's movement, the notice of a raid that moved and a train's split notice go through `pingInMessages` as well (its `sent` says how many messages went; the move notice is said once the first went); only the archive warning and the completion question still ping one message's worth (their ids are kept to delete them; a follow-up).
 
diff --git a/src/commands/max/max-report.test.ts b/src/commands/max/max-report.test.ts
index 8fef51984ab52fbd7802073949ae5aff8036b07d..99d642cc81361d73f3d7b8da96adf1df3e809fb0 100644
--- a/src/commands/max/max-report.test.ts
+++ b/src/commands/max/max-report.test.ts
@@ -18,6 +18,7 @@ const MAP_NAMES: MaxNames = {
   ended: 'The max battle there has just ended: report it again.',
   bossHint: ' Open its post and use /boss there to change its boss.',
   pinBlocked: 'You are blocked from making meetups in this server. Pick a power spot on the map.',
+  postPending: '',
 };
 
 const MACHOP = { boss: { key: 'machop' }, tier: 'D2' as const, label: 'Dynamax Machop (2★)' };
@@ -117,6 +118,76 @@ describe('reporting a max battle as a member (reportMaxAs)', () => {
       MAX_ENDED,
     );
   });
+
+  // Plan 8X-F (Matt, staging of 8X): "against it at an unlisted power spot" read as any spot.
+  it('says of the battle there its own boss and "this spot", with its post as the caller names it', async () => {
+    const made = await maxReportingWith();
+    const result = await reportMaxAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
+      { mayJoin: () => Promise.resolve(true), staff: false },
+    );
+    const battle = asMax(made.store.active()[0]);
+    const ask = { boss: MACHOP, spot: TEST_SPOT, end: NINE };
+    const exists = (party: typeof battle, joined: boolean) =>
+      ({ kind: 'exists', party, joined }) as const;
+    expect(maxReportWords(made.ctx, exists(battle, true), ask, PartyStatus.Interested)).toBe(
+      `There is already a max battle against Dynamax Machop (2★) at this spot: <#${battle.forumPostId}>. ` +
+        'You have been marked as interested.',
+    );
+    expect(
+      maxReportWords(
+        made.ctx,
+        exists({ ...battle, forumPostId: null }, false),
+        ask,
+        PartyStatus.Interested,
+      ),
+    ).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at this spot: its post is ' +
+        'being made.',
+    );
+    expect(
+      maxReportWords(made.ctx, exists(battle, false), ask, PartyStatus.Interested, MAP_NAMES),
+    ).toBe('There is already a max battle against Dynamax Machop (2★) at this spot.');
+    // Review r0, X5-5: the map names no post, also none being made.
+    const unposted = { ...battle, forumPostId: null };
+    expect(
+      maxReportWords(made.ctx, exists(unposted, false), ask, PartyStatus.Interested, MAP_NAMES),
+    ).toBe('There is already a max battle against Dynamax Machop (2★) at this spot.');
+    expect(takenWords(made.ctx, unposted, 'D3', MAP_NAMES)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park. ' +
+        'Open its post and use /boss there to change its boss.',
+    );
+    expect(takenWords(made.ctx, unposted, 'D3')).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Gazebo of the Park: its ' +
+        'post is being made. `/boss` there changes its boss.',
+    );
+    expect(result.outcome.kind).toBe('created');
+  });
+
+  it('ends a sentence with a spot whose name ends in a period once (staging of 8X)', async () => {
+    const made = await maxReportingWith();
+    await reportMaxAs(
+      made.ctx,
+      { id: ALICE, name: 'Alice' },
+      FAKE_GUILD_ID,
+      { boss: MACHOP, spot: TEST_SPOT, end: NINE, regionChannelId: WEST_CHANNEL },
+      { mayJoin: () => Promise.resolve(true), staff: false },
+    );
+    const battle = asMax(made.store.active()[0]);
+    const spot = battle.max.spot;
+    if (spot.kind !== 'powerspot') throw new Error('not at a power spot');
+    const inc = {
+      ...battle,
+      max: { ...battle.max, spot: { ...spot, title: 'Fire Company Inc.' } },
+    };
+    expect(takenWords(made.ctx, inc, 'D3', MAP_NAMES)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at Fire Company Inc. ' +
+        'Open its post and use /boss there to change its boss.',
+    );
+  });
 });
 
 describe('a spot named without an interaction (spotAt)', () => {
diff --git a/src/commands/max/max-report.ts b/src/commands/max/max-report.ts
index 1ba3d16830e1b617567f2e5fe56c50476bd5ad24..c0cd96f8bdf75473a056f5bf0f406988cbc887ba 100644
--- a/src/commands/max/max-report.ts
+++ b/src/commands/max/max-report.ts
@@ -6,7 +6,7 @@ import { sameBoss, type MaxParty, type MaxSpot } from '../../domain/party/party.
 import { battleKindOf, maxBossTitle, type MaxTier } from '../../domain/pogo/max-tier.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { noPostWords } from '../../render/activity.js';
-import { plain, timestamp } from '../../render/text.js';
+import { endSentence, plain, timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { MaxReportOutcome, PartyService } from '../../services/party-service.js';
 import { DISCORD_NAMES, type ReportNames } from '../raids/report.js';
@@ -211,17 +211,27 @@ export function takenWords(
   reported: MaxTier,
   names: MaxNames = DISCORD_MAX_NAMES,
 ): string {
-  const name = ctx.partyService.maxView(party).boss.name;
-  const title = maxBossTitle(name, party.max.tier);
+  const hint = battleKindOf(reported) === battleKindOf(party.max.tier) ? names.bossHint : '';
+  return `${alreadyThere(ctx, party, atSpot(party.max.spot), names)}${hint}`;
+}
+
+/**
+ * `There is already a max battle against <boss> <where>: <post>.`, the battle's own boss
+ * (whatever the report named), its post as `names` names it (on the map none: the sentence ends
+ * at `where`, once, `endSentence`); while it has none, `names.postPending` (on Discord `: its
+ * post is being made`, on the map nothing).
+ */
+function alreadyThere(
+  ctx: Pick<AppContext, 'partyService'>,
+  party: MaxParty,
+  where: string,
+  names: MaxNames,
+): string {
+  const title = maxBossTitle(ctx.partyService.maxView(party).boss.name, party.max.tier);
   const named = party.forumPostId === null ? undefined : names.post(party.forumPostId);
   const post =
-    party.forumPostId === null
-      ? ': its post is being made'
-      : named === undefined
-        ? ''
-        : `: ${named}`;
-  const hint = battleKindOf(reported) === battleKindOf(party.max.tier) ? names.bossHint : '';
-  return `There is already a max battle against ${plain(title)} ${atSpot(party.max.spot)}${post}.${hint}`;
+    party.forumPostId === null ? names.postPending : named === undefined ? '' : `: ${named}`;
+  return endSentence(`There is already a max battle against ${plain(title)} ${where}${post}`);
 }
 
 /**
@@ -230,11 +240,14 @@ export function takenWords(
  * boss's battle is named: "`/boss` there changes its boss.", with its space before it;
  * `pinBlocked`, a member blocked from meetups at a pin: "Pick a power spot from the list."): on
  * Discord as `/max` says it (`DISCORD_MAX_NAMES`), on the map in the map's words (plan 8X-5).
+ * `postPending` follows the battle there while it has no post yet: `: its post is being made` on
+ * Discord, nothing on the map, which names no post at all (review r0 of 8X-F, X5-5).
  */
 export interface MaxNames extends ReportNames {
   ended: string;
   bossHint: string;
   pinBlocked: string;
+  postPending: string;
 }
 
 /**
@@ -246,6 +259,7 @@ export const DISCORD_MAX_NAMES: MaxNames = {
   ended: MAX_ENDED,
   bossHint: ' `/boss` there changes its boss.',
   pinBlocked: MAX_PIN_BLOCKED,
+  postPending: ': its post is being made',
 };
 
 const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
@@ -281,9 +295,11 @@ export function maxReportWords(
         post(outcome.party, beingMade)
       );
     case 'exists': {
+      // The battle there by its own boss, at "this spot" (plan 8X-F, Matt: "against it at an
+      // unlisted power spot" read as any spot).
       const status = STATUS_WORDS[autoStatus];
       const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
-      return `There is already a max battle against it ${at}.${post(outcome.party, beingMade)}${marked}`;
+      return `${alreadyThere(ctx, outcome.party, 'at this spot', names)}${marked}`;
     }
     case 'taken':
       return takenWords(ctx, outcome.party, ask.boss.tier, names);
diff --git a/src/commands/max/max.test.ts b/src/commands/max/max.test.ts
index 49b151118e3680e96a233144ca541d34ec46c3eb..da4cb71a3e523acc021776bb0268d1c9590b92ed 100644
--- a/src/commands/max/max.test.ts
+++ b/src/commands/max/max.test.ts
@@ -216,8 +216,10 @@ describe('/max', () => {
       { boss: 'Machop', spot: `powerspot:${TEST_SPOT.id}` },
       { userId: ALICE },
     );
-    expect(told(again)).toMatch(
-      /^There is already a max battle against it at Gazebo of the Park\./,
+    // Plan 8X-F (Matt): the boss and "this spot", whatever was typed.
+    expect(told(again)).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at this spot: ' +
+        `<#${battle?.forumPostId}>. You have been marked as interested.`,
     );
     expect(asMax(made.store.get(battle?.id ?? '')).attendees[ALICE]?.status).toBe(
       PartyStatus.Interested,
@@ -539,7 +541,7 @@ describe('/max: a battle that ends soon (Matt, 2026-10-21)', () => {
       { userId: ALICE },
     );
     expect(dialogOf(joining)).toBeUndefined();
-    expect(told(joining)).toMatch(/^There is already a max battle against it/);
+    expect(told(joining)).toMatch(/^There is already a max battle against Dynamax Uxie/);
   });
 });
 
@@ -622,7 +624,9 @@ describe('/max at an unlisted power spot', () => {
     await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: BOB });
     await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
     const joined = await made.run({ boss: 'Machop', spot: PIN_SPOT }, { userId: ALICE });
-    expect(told(joined)).toMatch(/^There is already a max battle against it at an unlisted/);
+    expect(told(joined)).toMatch(
+      /^There is already a max battle against Dynamax Machop \(2★\) at this spot: <#/,
+    );
     const battle = asMax(made.store.active()[0]);
     expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
   });
diff --git a/src/commands/notifications/wants.test.ts b/src/commands/notifications/wants.test.ts
index ff812a0c02f9546f6ab22aca691580f7f71f10d6..6c8b26b6ef2568a9bf5e8d6d71e7fe17301a80e7 100644
--- a/src/commands/notifications/wants.test.ts
+++ b/src/commands/notifications/wants.test.ts
@@ -199,6 +199,18 @@ describe('/want', () => {
       ['research', 'Research', false],
       ['shadow', 'Shadow', false],
     ]);
+    // Plan 8X-F (Matt): the Dynamax box says no stars.
+    const described = dialog.components.flatMap((component) => {
+      const inner = (component as { component?: { type?: number; options?: unknown[] } }).component;
+      if (inner?.type !== ComponentType.CheckboxGroup) return [];
+      return (inner.options as { value: string; description?: string }[]).map(
+        (option) => [option.value, option.description] as const,
+      );
+    });
+    expect(described.slice(1, 3)).toEqual([
+      ['dynamax', 'Its Dynamax max battles'],
+      ['gigantamax', 'Its Gigantamax max battles'],
+    ]);
     // A legendary is met in no spawn and can be no max boss here.
     expect(
       boxesOf(shownDialog(await made.run('want', { target: 'Mewtwo' }))).map(([box]) => box),
diff --git a/src/commands/raids/location.ts b/src/commands/raids/location.ts
index f4be4465a254d9dde50c1f393f411b20892bcd83..138fd588771d448d5034f5e6d01152d0c7b4efa4 100644
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -7,7 +7,7 @@ import { raidOf, regionChannelOf, requireGuild, requireRaid } from '../../discor
 import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
 import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
-import { plain, truncate } from '../../render/text.js';
+import { endSentence, plain, truncate } from '../../render/text.js';
 import { commandRaid, partyOver } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
 import { raidRefusalText } from './raid-changes.js';
@@ -81,7 +81,7 @@ export const location: SimpleCommand = {
         interaction,
         ctx,
         outcome,
-        () => `This raid is now at ${name}.`,
+        () => endSentence(`This raid is now at ${name}`),
         `This raid is at ${name} already.`,
       );
       return;
@@ -188,7 +188,7 @@ export const locationControls: ComponentHandler = {
       // The answer is given before the old post is closed.
       outcome = await ctx.raids.setGym(partyId, changingMember(interaction), gymId, (party) =>
         say(
-          `This raid is now at ${name}.` +
+          endSentence(`This raid is now at ${name}`) +
             (party.forumPostId === null ? '' : ` Its new post is <#${party.forumPostId}>.`),
         ),
       );
@@ -223,7 +223,9 @@ export const locationControls: ComponentHandler = {
     } else {
       // The gym lies in the raid's own region by now (somebody moved the raid meanwhile).
       await say(
-        outcome.changed ? `This raid is now at ${name}.` : `This raid is at ${name} already.`,
+        outcome.changed
+          ? endSentence(`This raid is now at ${name}`)
+          : `This raid is at ${name} already.`,
       );
     }
   },
diff --git a/src/commands/raids/report.ts b/src/commands/raids/report.ts
index 37bd34602e8302ee7ebf5cc585271143e0ec00f6..8c5e20516671c3d273523aa153af49b0dbf5497c 100644
--- a/src/commands/raids/report.ts
+++ b/src/commands/raids/report.ts
@@ -4,7 +4,7 @@ import type { MemberAccess } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { noPostWords } from '../../render/activity.js';
-import { plain } from '../../render/text.js';
+import { endSentence, plain } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import { isRaid, type Party, type RaidScreenshot } from '../../domain/party/party.js';
 import type { PartyService, ReportOutcome } from '../../services/party-service.js';
@@ -217,12 +217,15 @@ export function reportWords(
   };
   switch (outcome.kind) {
     case 'created':
-      return `Reported: ${label} at ${gymName(gym)}.${postSentence(outcome.party.forumPostId, '')}`;
+      return (
+        endSentence(`Reported: ${label} at ${gymName(gym)}`) +
+        postSentence(outcome.party.forumPostId, '')
+      );
     case 'exists': {
       const where = postSentence(outcome.party.forumPostId, ' It is being set up right now.');
       const status = STATUS_WORDS[result.autoStatus];
       const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
-      return `There is already a raid at ${gymName(gym)}.${where}${marked}`;
+      return `${endSentence(`There is already a raid at ${gymName(gym)}`)}${where}${marked}`;
     }
     case 'gym-gone':
       return `${gymName(gym)} was removed from my gym list just now, so there is no raid to report there.`;
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 04613f3e1982d5dbdf6fdfad9f9562b6102872d5..e6dc6e97e8cfec438d33846675055d40c8a97f20 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -28,6 +28,7 @@ import {
   type MoreStop,
 } from '../../render/research.js';
 import { cutWhole } from '../../domain/geo/place.js';
+import { endSentence } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
 import type { ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';
 import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
@@ -299,7 +300,7 @@ const removeResearch: SubcommandPart = {
     const [gone] = removed;
     if (!gone) throw new UserError(notYours.length > 0 ? NOT_YOUR_REPORT : REPORT_CHANGED);
     await answer(interaction, {
-      content: `Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}.`,
+      content: endSentence(`Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}`),
     });
   },
   autocomplete: async (interaction, ctx) => {
@@ -407,8 +408,10 @@ export const researchControls: ComponentHandler = {
         first === undefined
           ? 'There was nothing left to take back: the report has ended, was taken back, or was ' +
             'replaced by a newer one.'
-          : `Took back **${reportSubject(first)}** at ` +
-            `${removed.map((report) => stopLine(report.stop)).join(', ')}.`,
+          : endSentence(
+              `Took back **${reportSubject(first)}** at ` +
+                removed.map((report) => stopLine(report.stop)).join(', '),
+            ),
       ]),
     );
   },
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index 0b30deff87489e34592b3f291ce73530eb9aaffe..8e997ccfb98c380fb74ead973e718782b7abbaef 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -26,7 +26,7 @@ import {
   ROCKET_KIND,
   rocketAnswer,
 } from '../../render/rocket.js';
-import { plain } from '../../render/text.js';
+import { endSentence, plain } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import { rocketSubject } from '../../services/rocket-reports.js';
@@ -336,7 +336,7 @@ const removeRocket: SubcommandPart = {
     const [gone] = removed;
     if (!gone) throw new UserError(notYours.length > 0 ? NOT_YOUR_REPORT : REPORT_CHANGED);
     await answer(interaction, {
-      content: `Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}.`,
+      content: endSentence(`Took back **${reportSubject(gone)}** at ${stopLine(gone.stop)}`),
     });
   },
   autocomplete: async (interaction, ctx) => {
@@ -405,7 +405,7 @@ export const rocketControls: ComponentHandler = {
         first === undefined
           ? 'There was nothing left to take back: the report has ended, was taken back, or was ' +
             'replaced by a newer one.'
-          : `Took back **${reportSubject(first)}** at ${stopLine(first.stop)}.`,
+          : endSentence(`Took back **${reportSubject(first)}** at ${stopLine(first.stop)}`),
       ]),
     );
   },
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index eed91c5b8d3594a457b13c0b3e11d7c2f57917a8..f77a9c3083a47f717afdc5da2dd264f12c95dcf2 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -19,7 +19,7 @@ import { storedReport } from '../../domain/ocr/screenshot-record.js';
 import { raidBossRef } from '../../domain/party/raid.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
 import { refusalWords, shortReading } from '../../render/screenshot-reading.js';
-import { plain, truncate } from '../../render/text.js';
+import { endSentence, plain, truncate } from '../../render/text.js';
 import type { ReportOutcome } from '../../services/party-service.js';
 import { PendingRequests } from '../../services/pending-requests.js';
 import {
@@ -589,12 +589,12 @@ function outcomeWords(outcome: ShotOutcome, gym: Gym): string {
   switch (outcome.kind) {
     case 'created':
       return outcome.party.forumPostId === null
-        ? `Reported the raid at ${name}.`
+        ? endSentence(`Reported the raid at ${name}`)
         : `Reported the raid at ${name}: <#${outcome.party.forumPostId}>.`;
     case 'exists': {
       const post = outcome.party.forumPostId === null ? '' : `: <#${outcome.party.forumPostId}>`;
       const joined = outcome.joined ? ' You have been signed up for it.' : '';
-      return `There is already a raid at ${name}${post}.${joined}`;
+      return `${endSentence(`There is already a raid at ${name}${post}`)}${joined}`;
     }
     case 'gym-gone':
       return `${name} was removed from my gym list just now.`;
diff --git a/src/commands/stops/pokestop.test.ts b/src/commands/stops/pokestop.test.ts
index 4da989d618a3a0613dc4f0b3b7867767f4e8a427..146ee0f0b367411fccd8268f6ccf4a835355f440 100644
--- a/src/commands/stops/pokestop.test.ts
+++ b/src/commands/stops/pokestop.test.ts
@@ -144,6 +144,9 @@ describe('/pokestop', () => {
     const changed = answerOf(await use('edit', { stop: 'pine-2', name: 'Tea Room', address: '-' }));
     expect(said(changed)).toContain('Changed the PokéStop **Tea Room** (`pine-2`)');
     expect(stored.rows.get(2)).toMatchObject({ name: 'Tea Room', address: null });
+    // Review r0 of 8X-F, X5-4: an address that ends in a period ends the sentence once.
+    const dotted = answerOf(await use('edit', { stop: 'pine-2', address: '12 Elm St.' }));
+    expect(said(dotted)).toMatch(/, 12 Elm St\.$/);
     expect(said(answerOf(await use('remove', { stop: 'coffee corner' })))).toContain(
       'Removed the PokéStop **Coffee Corner** (`pine-1`)',
     );
diff --git a/src/commands/stops/pokestop.ts b/src/commands/stops/pokestop.ts
index 74b6e2ff06fa4191cb005e4c1707534aa38fd03b..cb3c912c40857a02b9ef906882ccb305c7f5c0d4 100644
--- a/src/commands/stops/pokestop.ts
+++ b/src/commands/stops/pokestop.ts
@@ -27,7 +27,7 @@ import {
 } from '../../domain/stops/pine-stop.js';
 import { pineStopKey } from '../../domain/stops/report.js';
 import { distanceText, GYM_COLOUR, regionsSentence } from '../../render/gym-view.js';
-import { count, plain, truncate } from '../../render/text.js';
+import { count, endSentence, plain, truncate } from '../../render/text.js';
 import { actionRow, textMessage } from '../../render/v2.js';
 import { EXPIRED, NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
 import { PINE_STOP_NEAR_METRES } from '../../services/pine-stops.js';
@@ -327,8 +327,10 @@ const editStop: SubcommandPart = {
     await answerApart(
       interaction,
       textMessage(GYM_COLOUR, [
-        `Changed the PokéStop ${stopWithKey(changed)} at ${pointLink(changed)}` +
-          `${changed.address === null ? '' : `, ${plain(changed.address)}`}.`,
+        endSentence(
+          `Changed the PokéStop ${stopWithKey(changed)} at ${pointLink(changed)}` +
+            (changed.address === null ? '' : `, ${plain(changed.address)}`),
+        ),
       ]),
     );
   },
diff --git a/src/domain/pogo/want-boxes.ts b/src/domain/pogo/want-boxes.ts
index 512975c29988c2c16fa1f01847abf74e6f2514eb..dd9f5d0f7ae7b23f96527b23868421c904babeea 100644
--- a/src/domain/pogo/want-boxes.ts
+++ b/src/domain/pogo/want-boxes.ts
@@ -63,7 +63,7 @@ export const BOX_WORDS: Readonly<Record<WantBox, string>> = {
 /** What a box of a Pokémon says under its name in the dialog. */
 export const BOX_DESCRIPTIONS: Readonly<Record<PokemonBox, string>> = {
   raids: 'Its raids and the eggs it hatches from',
-  dynamax: 'Its Dynamax max battles, 1 to 5 stars',
+  dynamax: 'Its Dynamax max battles',
   gigantamax: 'Its Gigantamax max battles',
   spawns: 'Wild ones reported with /wild',
   research: 'Field research that may reward it',
diff --git a/src/render/notify-dm.test.ts b/src/render/notify-dm.test.ts
index be87385e8688b615d09b00bae6511c28c30dfabb..9186dfab0bacb4d427ef19f2e43df29d212d7faf 100644
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -16,6 +16,7 @@ import {
   bossSetSentence,
   mapLink,
   stopButtonRoom,
+  maxDmSentence,
   meetingDmSentence,
   NEWS_COLOUR,
   notifyDm,
@@ -29,6 +30,7 @@ import {
   withoutButton,
   withStopped,
   type ControlRows,
+  type MaxDmView,
   type RaidDmView,
   type ShownReason,
 } from './notify-dm.js';
@@ -89,6 +91,43 @@ describe('raidDmSentence', () => {
     );
   });
 
+  it('ends the sentence once after a gym whose name ends in a period (plan 8X-F)', () => {
+    expect(
+      raidDmSentence(
+        view({ gym: 'Fire Company Inc.', regionChannelId: undefined, reporter: undefined }),
+      ),
+    ).toBe('A raid for **Yveltal** has been reported at **Fire Company Inc.**');
+  });
+});
+
+describe('maxDmSentence (plan 8X-F)', () => {
+  const max = (more: Partial<MaxDmView> = {}): MaxDmView => ({
+    event: 'reported',
+    title: 'Dynamax Machamp (2★)',
+    spot: 'Gazebo of the Park',
+    pin: false,
+    regionChannelId: REGION,
+    ...more,
+  });
+
+  it('names a power spot in bold, and a pin as an unlisted power spot in running text', () => {
+    expect(maxDmSentence(max())).toBe(
+      `A **Dynamax Machamp (2★)** battle has been reported at **Gazebo of the Park** (<#${REGION}>).`,
+    );
+    expect(maxDmSentence(max({ pin: true, spot: 'Unlisted power spot' }))).toBe(
+      `A **Dynamax Machamp (2★)** battle has been reported at an unlisted power spot (<#${REGION}>).`,
+    );
+    expect(maxDmSentence(max({ event: 'boss', pin: true, regionChannelId: undefined }))).toBe(
+      'The max battle at an unlisted power spot is now against **Dynamax Machamp (2★)**.',
+    );
+  });
+
+  it('ends the sentence once after a spot whose name ends in a period', () => {
+    expect(maxDmSentence(max({ spot: 'Fire Company Inc.', regionChannelId: undefined }))).toBe(
+      'A **Dynamax Machamp (2★)** battle has been reported at **Fire Company Inc.**',
+    );
+  });
+
   it('says that the raid has its boss, without naming who acted', () => {
     expect(raidDmSentence(view({ event: 'boss' }))).toBe(
       `The raid at **The Stacks** (<#${REGION}>) now has its boss, **Yveltal**.`,
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index da16a8e44692e2bc194f94fad782496833e783cc..d15f4a06e2a1bba1cbf8868d9a76eacfb9fd2269 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -14,7 +14,7 @@ import type { TrainKind } from '../domain/party/party.js';
 import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
 import { TRAIN_KIND_WORDS } from './train-words.js';
 import { cutText, MAX_COMPONENTS, type PartyBrief } from './party-post.js';
-import { memberName, plain, plainNoLinks, type NamedMember } from './text.js';
+import { endSentence, memberName, plain, plainNoLinks, type NamedMember } from './text.js';
 import {
   actionRow,
   container,
@@ -163,7 +163,7 @@ export function raidDmSentence(view: RaidDmView): string {
     case 'reported': {
       const subject = view.boss === undefined ? withArticle(egg) : `A ${what}`;
       const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
-      const sentence = `${subject} has been reported at ${where}${by}.`;
+      const sentence = endSentence(`${subject} has been reported at ${where}${by}`);
       return sentence.charAt(0).toUpperCase() + sentence.slice(1);
     }
     case 'boss':
@@ -186,6 +186,8 @@ export interface MaxDmView {
   title: string;
   /** The spot by name (`maxSpotName`). */
   spot: string;
+  /** A pin: in running text "an unlisted power spot", not its label (plan 8X-F). */
+  pin: boolean;
   regionChannelId: string | undefined;
   /** Who reported it; undefined for one who asked not to be named. */
   reporter?: NamedMember | undefined;
@@ -194,15 +196,17 @@ export interface MaxDmView {
 /**
  * The first line of a DM about a max battle, the spot in the place of a raid's gym: `A **Dynamax
  * Machamp (2★)** battle has been reported at **Gazebo** (#west) by **Rita**.`, `The max battle
- * at **Gazebo** (#west) is now against **Dynamax Sneasel (1★)**.`
+ * at **Gazebo** (#west) is now against **Dynamax Sneasel (1★)**.`; a pin `at an unlisted power
+ * spot (#west)` (plan 8X-F). The sentence ends once after a name that ends in a period.
  */
 export function maxDmSentence(view: MaxDmView): string {
   // The spot's and the boss's names reach other members' DMs: no address in them is a link.
-  const where = `**${plainNoLinks(view.spot)}**${inRegion(view.regionChannelId)}`;
+  const spot = view.pin ? 'an unlisted power spot' : `**${plainNoLinks(view.spot)}**`;
+  const where = `${spot}${inRegion(view.regionChannelId)}`;
   const title = `**${plainNoLinks(view.title)}**`;
   if (view.event === 'boss') return `The max battle at ${where} is now against ${title}.`;
   const by = view.reporter ? ` by **${memberName(view.reporter)}**` : '';
-  return `A ${title} battle has been reported at ${where}${by}.`;
+  return endSentence(`A ${title} battle has been reported at ${where}${by}`);
 }
 
 /** The note of a max battle's want DM (Q8): the hour in which no more of the boss is told. */
diff --git a/src/render/party-post.lobby.test.ts b/src/render/party-post.lobby.test.ts
index bdc13750b4c790b7dd2f6e26f987b089d0584e2b..b0e3453fa7c6d7d6460fe98baf43b8af22b439ea 100644
--- a/src/render/party-post.lobby.test.ts
+++ b/src/render/party-post.lobby.test.ts
@@ -69,7 +69,9 @@ describe('trainerBlocks with a lobby size', () => {
       '300000000000000002': { name: 'Bea', status: CompletePending, pendingUntil: 1, number: 2 },
       '300000000000000003': { name: 'Cid', status: Interested },
     });
-    expect(LOBBY_OVER).toBe('Over the lobby size: somebody could move to another group.');
+    expect(LOBBY_OVER).toBe(
+      'Over the lobby size: somebody should consider moving to another group.',
+    );
     expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toMatch(
       new RegExp(`^5/4 coming · 1 interested\\n${LOBBY_OVER}\\n🤔 Interested`),
     );
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index fa2beff455f3f069e2822fdfcf6a96e837569179..a2c0f94863993c78725ba9be696c123926e6db20 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -700,7 +700,7 @@ function groupName(group: PartyGroup, fit: Fit): string {
 }
 
 /** Under the heading of a group that holds more than its lobby size (a member's +1s, a choice). */
-export const LOBBY_OVER = 'Over the lobby size: somebody could move to another group.';
+export const LOBBY_OVER = 'Over the lobby size: somebody should consider moving to another group.';
 
 function lobbyNote(view: TrainersView, group: PartyGroup, options: TrainerOptions): string[] {
   // A party with a lobby size has its own note, in the place of the raid's.
diff --git a/src/render/place-asks.ts b/src/render/place-asks.ts
index 0f93486df4faef2f0224c6cd609004e643150b95..60a4ed59beda5bcfd50df8d400b4c28b60325bd8 100644
--- a/src/render/place-asks.ts
+++ b/src/render/place-asks.ts
@@ -11,7 +11,7 @@ import {
   placeLine,
 } from './meetup-safety.js';
 import { postLink } from './notify-dm.js';
-import { memberText, plainLines, plainNoLinks, timestamp } from './text.js';
+import { endSentence, memberText, plainLines, plainNoLinks, timestamp } from './text.js';
 import { actionRow, container, textDisplay, textMessage } from './v2.js';
 
 /**
@@ -136,7 +136,7 @@ export function askOutcomeDm(ask: PlaceAskRecord, serverName?: string): V2Messag
     ]);
   }
   return textMessage(REFUSED_ACCENT, [
-    `A moderator kept meetups refused at ${place}${on}. Members can ask again ` +
+    `${endSentence(`A moderator kept meetups refused at ${place}${on}`)} Members can ask again ` +
       `${timestamp(askableAt({ ruledAt: 0, keptAt: ask.decidedAt ?? ask.createdAt }), 'R')}.`,
   ]);
 }
diff --git a/src/render/text.test.ts b/src/render/text.test.ts
index 6fa0d193bda86f73054ceac80de9c7669abafc8c..8ec77bc4bc9f82cbc9a5fb0b40dbdddcd68b59ba 100644
--- a/src/render/text.test.ts
+++ b/src/render/text.test.ts
@@ -5,6 +5,7 @@ import {
   clockOrDay,
   count,
   cutMarkdown,
+  endSentence,
   fitItems,
   fitMessages,
   inMessages,
@@ -171,6 +172,38 @@ describe('a member whose name is an address', () => {
   });
 });
 
+describe('endSentence (plan 8X-F)', () => {
+  it('ends a sentence with a period, unless the text ends in one already', () => {
+    expect(endSentence('There is a raid at Gazebo')).toBe('There is a raid at Gazebo.');
+    // The staging of 8X: "… at West Mifflin Fire Company Inc.." read twice.
+    expect(endSentence('There is a raid at Acme Inc.')).toBe('There is a raid at Acme Inc.');
+    expect(endSentence('Is it at Yahoo!')).toBe('Is it at Yahoo!');
+    expect(endSentence('at Who?')).toBe('at Who?');
+  });
+
+  it('looks through bold, a masked link and the escapes of plain', () => {
+    expect(endSentence(`at **${plain('Acme Inc.')}**`)).toBe('at **Acme Inc.**');
+    expect(endSentence('at **Acme**')).toBe('at **Acme**.');
+    expect(endSentence(`at ${plain('1.')}`)).toBe(`at ${plain('1.')}`);
+    expect(endSentence('to [Acme Inc.](<https://maps.example/?q=1>)')).toBe(
+      'to [Acme Inc.](<https://maps.example/?q=1>)',
+    );
+    expect(endSentence('to [Acme](<https://maps.example/?q=1>)')).toBe(
+      'to [Acme](<https://maps.example/?q=1>).',
+    );
+    // A power spot says what it is after its link: the sentence ends there.
+    expect(endSentence('to [Acme Inc.](<https://maps.example>) (power spot)')).toBe(
+      'to [Acme Inc.](<https://maps.example>) (power spot).',
+    );
+  });
+
+  it('keeps the ellipsis of a cut name, and ends the sentence after it', () => {
+    expect(endSentence(`at **${truncate('A very long name of a place', 10)}**`)).toBe(
+      'at **A very lo…**.',
+    );
+  });
+});
+
 describe('truncate', () => {
   it('leaves a text that fits and cuts a longer one to the limit with an ellipsis', () => {
     expect(truncate('short', 10)).toBe('short');
diff --git a/src/render/text.ts b/src/render/text.ts
index 5fd691fc473d2cc87e7589c5c5d3f327ae834d1d..7a6e1df88df9c23c8364a9c86c410a43282b2342 100644
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -203,6 +203,28 @@ export function truncate(text: string, limit: number): string {
   return `${kept}…`;
 }
 
+/** A closing mark of markdown at the end of a text: bold, italics, underline, strike, spoiler. */
+const CLOSING_MARKS = /(?:\*\*|\*|__|_|~~|\|\|)$/u;
+/** The address part of a masked link at the end of a text: `](<https://…>)` or `](https://…)`. */
+const LINK_ADDRESS = /\]\(<?[^\s()<>]*>?\)$/u;
+
+/**
+ * A sentence that ends with `text`, with its period (plan 8X-F): none added where what a reader
+ * sees already ends in one (`.`, `!` or `?`: "at **Fire Company Inc.**", not "Inc.."), looking
+ * through closing bold and the like, a masked link's address, and the backslash `plain` puts
+ * before a period (`1\.`). A cut name's `…` (`truncate`) is no end of a sentence: the period
+ * follows it.
+ */
+export function endSentence(text: string): string {
+  let shown = text;
+  for (;;) {
+    const bare = shown.replace(LINK_ADDRESS, '').replace(CLOSING_MARKS, '');
+    if (bare === shown) break;
+    shown = bare;
+  }
+  return /[.!?]$/u.test(shown) ? text : `${text}.`;
+}
+
 /**
  * What Discord reads in angle brackets: a member, role, channel, emoji, time, command or an
  * address. `plain` puts a zero-width space after every `<` a member typed, so none of theirs is
diff --git a/src/render/train-panel.ts b/src/render/train-panel.ts
index 097e13a6460954beca1ca916abecb36b9727695e..84add91039ebc90f36b2df06d316c8e96911a3cd 100644
--- a/src/render/train-panel.ts
+++ b/src/render/train-panel.ts
@@ -29,7 +29,7 @@ import {
 } from '../domain/party/train.js';
 import { stopHandle } from '../domain/party/stops.js';
 import { PARTY_KIND, partyButton } from './party-controls.js';
-import { count, memberText, type NamedMember } from './text.js';
+import { count, endSentence, memberText, type NamedMember } from './text.js';
 import type { TrainPlaces } from './train-post.js';
 import { stopInWords, stopLink, type PostStop } from './train-stops.js';
 import { AT_END_DESCRIPTIONS, TRAIN_KIND_DESCRIPTIONS, trainKindChoice } from './train-words.js';
@@ -93,8 +93,10 @@ function finishedWords(view: TrainPlaces, link: (stop: PostStop) => string): str
   const ref = route[back];
   return (
     `The train has finished its route of ${count(route.length, 'stop')}. ` +
-    `Previous takes it back to stop ${back + 1}: ` +
-    `${ref === undefined ? '' : link(view.stop(ref))}.`
+    endSentence(
+      `Previous takes it back to stop ${back + 1}: ` +
+        (ref === undefined ? '' : link(view.stop(ref))),
+    )
   );
 }
 
@@ -114,8 +116,10 @@ export function whereText(view: TrainPlaces): string {
   const link = (shown: PostStop) => stopLink(shown);
   if (routeFinished(party)) return finishedWords(view, link);
   const at = currentStop(party);
-  const here = `The train is at stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}.`;
-  return `${here} ${nextWords(view, link)}.`;
+  const here = endSentence(
+    `The train is at stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}`,
+  );
+  return `${here} ${endSentence(nextWords(view, link))}`;
 }
 
 /** Where the train is and what comes next, as the panel shows it under its heading. */
@@ -294,17 +298,19 @@ export function movementText(movement: Movement): string {
   const by = `Moved by ${memberText(movement.by)}.`;
   if (movement.kind === 'finished') return `The train has finished its route. ${by}`;
   const where = movement.at === undefined ? UNKNOWN_STOP : stopLink(movement.at);
-  if (movement.kind === 'back') return `The train is moving back to ${where}. ${by}`;
+  // A sentence that ends with a place ends once (plan 8X-F: "Inc.." read twice).
+  if (movement.kind === 'back')
+    return `${endSentence(`The train is moving back to ${where}`)} ${by}`;
   const skipping =
     movement.kind !== 'to' && 'skipped' in movement
       ? `, skipping ${movement.skipped === undefined ? UNKNOWN_STOP : stopInWords(movement.skipped)}`
       : '';
   if (movement.kind === 'round') {
-    return `The train is going round again, back to ${where}${skipping}. ${by}`;
+    return `${endSentence(`The train is going round again, back to ${where}${skipping}`)} ${by}`;
   }
   if (movement.kind === 'turn') {
     const turned = movement.turnedAt === undefined ? UNKNOWN_STOP : stopInWords(movement.turnedAt);
-    return `The train is turning back at ${turned}, on to ${where}${skipping}. ${by}`;
+    return `${endSentence(`The train is turning back at ${turned}, on to ${where}${skipping}`)} ${by}`;
   }
-  return `The train is moving to ${where}${skipping}. ${by}`;
+  return `${endSentence(`The train is moving to ${where}${skipping}`)} ${by}`;
 }
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 122212a25c9f4b288a14bd16f22d5f2a53039916..c61c076ae128e16b718de618670850269b375a26 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -1124,4 +1124,16 @@ describe('movementText', () => {
       `The train is moving to Unknown gym. Moved by <@${BOB}>.`,
     );
   });
+
+  it('ends its sentence once after a place whose name ends in a period (plan 8X-F)', () => {
+    const one = gym(1);
+    if (!one) throw new Error('no gym 1');
+    const inc = {
+      kind: 'gym' as const,
+      gym: { ...one, nickname: null, name: 'Fire Company Inc.' },
+    };
+    expect(movementText({ kind: 'back', at: inc, by: { id: ALICE } })).toBe(
+      `The train is moving back to [Fire Company Inc.](<${maps(1)}>) Moved by <@${ALICE}>.`,
+    );
+  });
 });
diff --git a/src/services/notify-service.max.test.ts b/src/services/notify-service.max.test.ts
index ec9ea365f41802d876a08897f5f649b9fc41042f..d58e30dc888239b17850f65608de28143699c4a0 100644
--- a/src/services/notify-service.max.test.ts
+++ b/src/services/notify-service.max.test.ts
@@ -1,7 +1,15 @@
 import { describe, expect, it } from 'vitest';
 import { WEST_CHANNEL } from '../../test/support/gyms.js';
 import { dmReasons, dmSentence, linksOf, textDisplays } from '../../test/support/messages.js';
-import { ALICE, BOB, CAROL, MINUTE, REPORTER, TEST_SPOT } from '../../test/support/parties.js';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  MINUTE,
+  REPORTER,
+  TEST_PIN,
+  TEST_SPOT,
+} from '../../test/support/parties.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../test/support/wayspots.js';
 import { partyServiceWith, reportedMax } from '../../test/support/party-service.js';
@@ -179,6 +187,33 @@ describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () =
     await background.settle();
   });
 
+  // Plan 8X-F (staging of 8X): "the max battle at Unlisted power spot" read wrong.
+  it('says "at an unlisted power spot" of a battle at a pin, in the report and the meeting time', async () => {
+    const made = await reported(
+      async ({ targetWants, gateway }) => {
+        await targetWants.change(ALICE, gateway.guildId, box(DYNAMAX_MACHAMP), 0);
+      },
+      { spot: TEST_PIN },
+    );
+    expect(dmSentence(made.dms.to(ALICE)[0])).toBe(
+      `A **Dynamax Machamp (2★)** battle has been reported at an unlisted power spot ` +
+        `(<#${WEST_CHANNEL}>) by **Rita**.`,
+    );
+    const alice = { id: ALICE, name: 'Alice' };
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    await made.notify.flush();
+    const meet = made.clock.now + 20 * MINUTE;
+    await made.attendance.setMeetingTime(made.party.id, alice, meet);
+    await made.notify.flush();
+    expect(dmSentence(made.dms.to(BOB).at(-1))).toMatch(
+      new RegExp(
+        `^Meet at <t:${String(meet / 1000)}:t> for the max battle at an unlisted power spot \\(set by Alice\\)\\.`,
+      ),
+    );
+    await background.settle();
+  });
+
   it('tells who wants the boss a rotation brings, by /boss', async () => {
     const made = await reported(async ({ targetWants, gateway }) => {
       await targetWants.change(ALICE, gateway.guildId, box(boxTarget('dynamax', 215)), 0);
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 6d83a6232ce1818f3040d899393c9e4b05238986..1b8c9eaf31e903fba250583db3f17172738dd61f 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -470,6 +470,7 @@ export class NotifyService implements PartyNotifier {
               event,
               title,
               spot: this.spotName(party),
+              pin: party.max.spot.kind === 'pin',
               regionChannelId: region?.channelId,
               reporter: party.anonymous ? undefined : memberOf(party, party.createdById),
             }),
@@ -1024,7 +1025,12 @@ export class NotifyService implements PartyNotifier {
       const { gymId } = party;
       return `the raid at ${plainNoLinks(gymName(gymId === null ? undefined : this.options.gyms.get(gymId)))}`;
     }
-    if (isMax(party)) return `the max battle at ${plainNoLinks(this.spotName(party))}`;
+    if (isMax(party)) {
+      // A pin by what it is, in running text (plan 8X-F), never by its label.
+      return party.max.spot.kind === 'pin'
+        ? 'the max battle at an unlisted power spot'
+        : `the max battle at ${plainNoLinks(this.spotName(party))}`;
+    }
     return `the ${party.type} ${plainNoLinks(party.timed.name)}`;
   }
 
diff --git a/src/services/train-service.test.ts b/src/services/train-service.test.ts
index 906b2088c9c35ce8b4a2283dc0ec487c870a3fa0..6988ebe1f878f981146095ed5630e83a1c39063d 100644
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it, onTestFinished } from 'vitest';
 import { watchImmediates } from '../../test/support/timers.js';
-import { testGyms, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { testGym, testGyms, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE, BOB, CAROL, REPORTER, stops, gym, inGyms } from '../../test/support/parties.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { createdMeetup, createdTrain, reportedRaid } from '../../test/support/party-service.js';
@@ -1128,6 +1128,20 @@ describe('TrainService.reverse', () => {
     expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
   });
 
+  // Review r0 of 8X-F, X5-3: a sentence that ends with a stop's name ends once.
+  it('ends the line of a reversal once after a stop whose name ends in a period', async () => {
+    const inc = testGym(13, 'Fire Company Inc.', 40.051, -80.051);
+    const made = await createdTrain({ route: [13, 4] }, { gyms: gymsFixture([inc]) });
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    await settled(made);
+    await made.trains.reverse(made.party.id, alice, false, '13');
+    await settled(made);
+    expect(lines(made).at(-1)).toBe(
+      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
+        '**Veterans Memorial Bridge** to **Fire Company Inc.**',
+    );
+  });
+
   it('starts a route that was finished from its last stop again, from there', async () => {
     const made = await boarded();
     await made.trains.move(made.party.id, alice, 'skip', false);
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index be63d1debef3bffcecdbe41bf4039e45c1ece382..c94b81420e9a6f904d75ae4c9c51ea7060fdfd16 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -45,7 +45,7 @@ import type { PostGym } from '../render/raid-post.js';
 import { stopInWords, stopsFrom, type StopLookup } from '../render/train-stops.js';
 import { doer } from '../render/activity.js';
 import { groupWords } from '../render/party-controls.js';
-import { count, memberText, plain } from '../render/text.js';
+import { count, endSentence, memberText, plain } from '../render/text.js';
 import { movementText, type Movement } from '../render/train-panel.js';
 import { atEndSentence, atEndSetWords, TRAIN_KIND_WORDS } from '../render/train-words.js';
 import type { Member } from './attendance-service.js';
@@ -261,9 +261,11 @@ export class TrainService {
           : addStop(party, member.id, added, staff)),
       (party, result) => {
         const who = doer(party, member);
-        return who
-          ? `${who} added stop ${result.number} to the route: ${this.named(added)}.`
-          : `Stop ${result.number} was added to the route: ${this.named(added)}.`;
+        return endSentence(
+          who
+            ? `${who} added stop ${result.number} to the route: ${this.named(added)}`
+            : `Stop ${result.number} was added to the route: ${this.named(added)}`,
+        );
       },
     );
   }
@@ -498,7 +500,9 @@ export class TrainService {
             ? ''
             : `: it now runs from ${this.named(start)} to ${this.named(end)}${again}`;
         const who = doer(party, member);
-        return who ? `The route was reversed by ${who}${runs}.` : `The route was reversed${runs}.`;
+        return endSentence(
+          who ? `The route was reversed by ${who}${runs}` : `The route was reversed${runs}`,
+        );
       },
     );
   }
diff --git a/src/web/max-report.test.ts b/src/web/max-report.test.ts
index f0b0618635a8d2a00c794f001591d61dc0e7b2db..28a5192025784929a1375da047320fd35f56d20c 100644
--- a/src/web/max-report.test.ts
+++ b/src/web/max-report.test.ts
@@ -166,13 +166,30 @@ describe('reporting a max battle on the map', () => {
     const joined = await map.report({ ...PIN, boss: 'Machop' });
     expect(joined.status).toBe(409);
     expect(joined.json.text).toBe(
-      'There is already a max battle against it at an unlisted power spot. You have been marked as interested.',
+      'There is already a max battle against Dynamax Machop (2★) at this spot. You have been ' +
+        'marked as interested.',
     );
     const battle = asMax(map.made.store.active()[0]);
     expect(battle.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
     expect(joined.json.max?.id).toBe(battle.id);
   });
 
+  // Review r1 of 8X-F, R1-1 / X5-5: the map names no post, also none being made.
+  it('says of a battle whose post is not made yet only that it is at this spot', async () => {
+    const map = await reporting();
+    web = map.web;
+    expect((await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob)).status).toBe(200);
+    const [there] = map.made.store.active();
+    if (!there) throw new Error('no battle');
+    await map.made.store.update(there.id, (party) => ({ party: { ...party, forumPostId: null } }));
+    const joined = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' });
+    expect(joined.status).toBe(409);
+    expect(joined.json.text).toBe(
+      'There is already a max battle against Dynamax Machop (2★) at this spot. You have been ' +
+        'marked as interested.',
+    );
+  });
+
   it('refuses another boss at the spot, naming the battle there and no post, uncounted', async () => {
     const map = await reporting();
     web = map.web;
@@ -476,7 +493,9 @@ describe('the ending-soon question of a max battle on the map', () => {
     expect((await map.report({ ...GIGA, soon: next }, map.bob)).status).toBe(200);
     const joined = await map.report({ ...GIGA, soon: next });
     expect(joined.status).toBe(409);
-    expect(joined.json.text).toMatch(/^There is already a max battle against it at Gazebo/);
+    expect(joined.json.text).toMatch(
+      /^There is already a max battle against Gigantamax \S+ at this spot\./,
+    );
     expect(map.made.store.active()).toHaveLength(1);
   });
 
@@ -523,6 +542,6 @@ describe('the ending-soon question of a max battle on the map', () => {
     expect(typed.status).toBe(200);
     const joined = await map.report({ spot: TEST_SPOT.id, boss: 'Machop' }, map.bob);
     expect(joined.status).toBe(409);
-    expect(joined.json.text).toMatch(/^There is already a max battle against it/);
+    expect(joined.json.text).toMatch(/^There is already a max battle against Dynamax Machop/);
   });
 });
diff --git a/src/web/max-routes.ts b/src/web/max-routes.ts
index ee7e2bf640b8784a907b19f894e5b5e0ba3837f4..50f686f5232a2bd90bb2cd88ad2a5ddddeb98889 100644
--- a/src/web/max-routes.ts
+++ b/src/web/max-routes.ts
@@ -204,6 +204,8 @@ export function maxRoutes(scope: FastifyInstance, deps: WebDeps): void {
     ended: MAP_MAX_ENDED,
     bossHint: MAP_BOSS_HINT,
     pinBlocked: MAP_PIN_BLOCKED,
+    // The map names no post: none being made either (review r0 of 8X-F, X5-5).
+    postPending: '',
   };
 
   /** `/max`'s check of a report's forums (`maxBarred`), on the map's deps. */
````

### Task 7: 8X-F 7: notification DMs put their Stop buttons last, after all text

Prototype commit: `8fdc61151bee55c4834ad23546d5fa1d07e65eb1`

"You won't be told about more … for an hour" beside the Stop buttons read as
what Stop does (Matt, staging of 8X). notifyDm now puts the note under the news
and its links, then the separator, "You asked to be told about", the reasons
without a button with the command that stops them, and the Stop sections last.
The note is counted before stopButtonRoom: a DM with a note and eleven or more
stoppable reasons went one over Discord's 40 components. dmReasons in the test
support reads the sections and the listed reasons wherever they stand.

**Files:**

```
 docs/architecture/notifications-and-dms.md |  4 ++--
 src/components/dm.test.ts                  |  3 ++-
 src/render/notify-dm.test.ts               | 57 ++++++++++++++++++++++++++++++++++++++++++++++++--
 src/render/notify-dm.ts                    | 26 +++++++++++++++--------
 src/services/notify-service.max.test.ts    |  5 +++--
 test/support/messages.ts                   | 21 ++++++++++++++-----
 6 files changed, 95 insertions(+), 21 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/dm.test.ts src/render/notify-dm.test.ts src/services/notify-service.max.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8fdc61151bee55c4834ad23546d5fa1d07e65eb1 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 7: notification DMs put their Stop buttons last, after all text`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index ba41f9545ed1ab2a31c291bd4cb454b506f3b4eb..dc8ea72e1cecabe64e8972d555ea4c2b1529e565 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -13,13 +13,13 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 ## The notifier
 
-- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour.", under the news and its links, above the reasons and their Stop buttons (plan 8X-F: beside Stop it read as what Stop does); a battle at a pin is "at an unlisted power spot" in its sentences (`MaxDmView.pin`); the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
 
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn` (spawns, Rocket grunts), `normal` (raid wants, gym targets, new trains, max battles, field research, Rocket hideouts), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
-- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
+- A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), the note (`DmNews.note`, `-#`), then a separator, "You asked to be told about", the reasons that get no button in one text with the command that stops them (`stopHint`), and last, after all text, one section per reason with a `Stop` button beside it (plan 8X-F, Matt: the Stop buttons always last), as many as the message has room for beside its links, picture and note (`stopButtonRoom`, the note counted: before 8X-F a DM with a note and eleven or more stoppable reasons went one over Discord's 40 components). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a `TargetWant` is `target` with `rp`, `ri`, `re`, `dx`, `gx` (plan 8R-2: `rg:<type|none>`, `rl:<leader|any>`, `rv`, `rd`) and a subject's every box `subject` with `sp` / `st`, plan 8R-1; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
 - The owner's DM of a request for the Wayspot export tool (plan 8W-P; `web.md`, "The Wayspot export tool"): a new request, or one asked again after a refusal, queues a DM to `OWNER_ID` through `DmSender` (`normal`, expiring after 7 days; the queue is in memory, so a restart loses it and the page is the fallback), only while at most `OPEN_REQUESTS_NOTIFIED` 20 requests are open (any Discord account can ask; the rest wait on the page). It is `accessRequestDm` (`src/render/script-access-dm.ts`): who asks by name (`plainNoLinks`) and id as plain text, no mention, the community line through `plainNoLinks`, when, and **Approve** / **Refuse**, custom ids `scriptaccess:<row id>:approve|refuse:<askedAt in base 36>`. The handler (`scriptAccessControls`, `src/components/script-access.ts`) has a guard that the presser is `OWNER_ID` (a guard refusal counts against no throttle) and `SCRIPT_ACCESS_THROTTLE` 20 a minute; a press decides the request as it is now and for the asking it was drawn for, and edits the DM to what was decided and when without its buttons (`accessDecidedDm`): decided meanwhile, "Decided already: …"; asked again since, "Asked again since, <time>: decide it on its new DM or on the page."; a row gone or a button it cannot read is out of date. No fresh web login is needed for the DM.
 
 ## Spawn reports
diff --git a/src/components/dm.test.ts b/src/components/dm.test.ts
index 5cea2ba329257bc0dd38258e83dd3f4d4ba2a9bc..c62baa22462cf72fc53c6d44d43448dcfd84d653 100644
--- a/src/components/dm.test.ts
+++ b/src/components/dm.test.ts
@@ -448,7 +448,8 @@ describe('the custom id of a stop button', () => {
       { label: 'T5 raids', stop: stopButtonId(HOME, want(T5)), command: '/unwant' },
     ]);
     expect(dmReasons(message)).toEqual(['T5 raids', 'Shadow Longname']);
-    expect(textDisplays(message).at(-1)).toBe(
+    // Plan 8X-F: the reasons without a button before the Stop buttons, which come last.
+    expect(textDisplays(message).at(-2)).toBe(
       'Shadow Longname\n-# To stop what has no button here, use `/unwant` in the server.',
     );
     expect(buttonsOf(message)).toMatchObject([
diff --git a/src/render/notify-dm.test.ts b/src/render/notify-dm.test.ts
index 9186dfab0bacb4d427ef19f2e43df29d212d7faf..659234f5fa5aa317f4cfa3ddba7ccfcd6709297a 100644
--- a/src/render/notify-dm.test.ts
+++ b/src/render/notify-dm.test.ts
@@ -277,6 +277,57 @@ describe('notifyDm', () => {
     ]);
   });
 
+  // Plan 8X-F (Matt, staging of 8X): "You won't be told … for an hour" beside Stop read as if
+  // Stop silenced it for an hour. All text first, the Stop buttons last.
+  it('puts the note under the links, and the Stop buttons last, after all text', () => {
+    const message = notifyDm(
+      {
+        sentence: 'A battle.',
+        brief,
+        links: [postButton(LINK)],
+        note: "You won't be told about more Dynamax Machamp battles for an hour.",
+      },
+      [reason(1, { label: 'Long form', stop: undefined, command: '/unwant' }), reason(2)],
+    );
+    const parts = (message.components[0] as { components: { type: ComponentType }[] }).components;
+    expect(parts.map((part) => part.type)).toEqual([
+      ComponentType.Section, // the news, the picture beside it
+      ComponentType.ActionRow, // the links
+      ComponentType.TextDisplay, // the note
+      ComponentType.Separator,
+      ComponentType.TextDisplay, // "You asked to be told about"
+      ComponentType.TextDisplay, // the reasons without a button
+      ComponentType.Section, // reason 2 with its Stop
+    ]);
+    expect(textDisplays(message).slice(1)).toEqual([
+      "-# You won't be told about more Dynamax Machamp battles for an hour.",
+      '-# You asked to be told about',
+      'Long form\n-# To stop what has no button here, use `/unwant` in the server.',
+      'reason 2',
+    ]);
+    expect(dmReasons(message)).toEqual(['reason 2', 'Long form']);
+  });
+
+  it('counts the note in the room for Stop buttons, within what Discord takes (R4)', () => {
+    const reasons = Array.from({ length: 16 }, (_, n) => reason(n));
+    const message = notifyDm(
+      {
+        sentence: 'A battle.',
+        brief,
+        links: [postButton(LINK), mapLink(MAPS)],
+        note: "You won't be told about more Dynamax Machamp battles for an hour.",
+      },
+      reasons,
+    );
+    expectV2Sendable(message);
+    expect(componentCount(message)).toBeLessThanOrEqual(40);
+    // The container, the news with its picture, two links in their row, the note, the line and
+    // the heading.
+    const most = stopButtonRoom(1 + 3 + 3 + 1 + 2);
+    expect(buttonsOf(message).filter((button) => button.customId !== undefined)).toHaveLength(most);
+    expect(dmReasons(message)).toHaveLength(reasons.length);
+  });
+
   it('shows the news as text alone without a picture, and in its own colour without a brief', () => {
     const plainNews = notifyDm(
       { sentence: 'A train.', brief: { accent: 0x3498db, lines: ['No route yet'] }, links: [] },
@@ -299,7 +350,8 @@ describe('notifyDm', () => {
       { label: 'the boss of your eggs', stop: `dm:${GUILD}:stop:boss` },
     ]);
     expect(dmReasons(message)).toEqual(['reason 2', 'the boss of your eggs', 'Long form']);
-    expect(textDisplays(message).at(-1)).toBe(
+    // Before the two Stop sections, which come last (plan 8X-F).
+    expect(textDisplays(message).at(-3)).toBe(
       'Long form\n-# To stop what has no button here, use `/unwant` in the server.',
     );
     expect(buttonsOf(message).map((button) => button.customId)).toEqual([
@@ -332,7 +384,8 @@ describe('notifyDm', () => {
       expect(label.length).toBeLessThanOrEqual(150);
       expect(label).not.toMatch(/(^|[^\\])(\\\\)*\\…$/);
     }
-    expect(textDisplays(message).at(-1)).toContain('use `/untarget` in the server');
+    // The listed reasons stand before the Stop sections (plan 8X-F).
+    expect(textDisplays(message).at(-1 - most)).toContain('use `/untarget` in the server');
   });
 
   it('counts the links and the picture of the message, so any of them stays within 40', () => {
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index d15f4a06e2a1bba1cbf8868d9a76eacfb9fd2269..435c69ccb7dcd2a01c57de3db4bcb0805e9ad6fd 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -334,8 +334,9 @@ export interface DmNews {
   brief?: Pick<PartyBrief, 'accent' | 'picture' | 'pictureFile' | 'lines'> | undefined;
   links: readonly DmLink[];
   /**
-   * Said last, in small print (a max battle's want: no more of that boss for an hour, plan
-   * 8X-3, Q8), so that a quiet hour does not look like broken notifications.
+   * Said in small print under the news and its links, above the reasons and their Stop buttons
+   * (a max battle's want: no more of that boss for an hour, plan 8X-3, Q8), so that a quiet hour
+   * does not look like broken notifications; beside Stop it read as what Stop does (plan 8X-F).
    */
   note?: string;
 }
@@ -372,10 +373,12 @@ export function stopHint(reasons: readonly ShownReason[]): string {
  * A direct message of the notifier, a components-v2 message in one container of the post's
  * colour: the sentence first (a phone's notification, if it reads anything, reads the news),
  * the brief's lines under it with the picture beside them; a row of links (the post, the gym's
- * place); and under a line `-# You asked to be told about` one section per reason with its Stop
- * button beside it. The reasons that get no button (their custom id does not fit, or more than
- * the message has room for beside its links and picture: `stopButtonRoom`) are listed together in one text with the command that stops them. Nothing
- * else of the post: who comes and the boss's facts stay there. It pings nobody.
+ * place); the note (`-#`, the hour in which no more is told); and under a line `-# You asked to
+ * be told about` the reasons that get no button (their custom id does not fit, or more than the
+ * message has room for beside its links, picture and note: `stopButtonRoom`) listed together in
+ * one text with the command that stops them, then, last of all, one section per reason with its
+ * Stop button beside it (plan 8X-F: the buttons after all text). Nothing else of the post: who
+ * comes and the boss's facts stay there. It pings nobody.
  */
 export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Message {
   const { brief } = news;
@@ -387,17 +390,21 @@ export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Messa
   if (news.links.length > 0) {
     parts.push(actionRow(news.links.map((link) => linkButton(link.label, link.emoji, link.url))));
   }
+  // The note belongs to the news, above the reasons: beside the Stop buttons it read as what
+  // Stop does (plan 8X-F, Matt).
+  if (news.note !== undefined) parts.push(textDisplay(`-# ${news.note}`));
   if (reasons.length > 0) {
     parts.push(separator(), textDisplay('-# You asked to be told about'));
     const label = (reason: ShownReason): string => cutText(reason.label, LABEL_ROOM);
-    // The container and everything in it so far.
+    // The container and everything in it so far, the note too.
     const most = stopButtonRoom(1 + countComponents(parts));
     let buttons = 0;
+    const stoppable: APIComponentInContainer[] = [];
     const rest: ShownReason[] = [];
     for (const reason of reasons) {
       if (reason.stop !== undefined && buttons < most) {
         buttons += 1;
-        parts.push(section(label(reason), stopButton(reason.stop)));
+        stoppable.push(section(label(reason), stopButton(reason.stop)));
       } else {
         rest.push(reason);
       }
@@ -406,8 +413,9 @@ export function notifyDm(news: DmNews, reasons: readonly ShownReason[]): V2Messa
       const hint = stopHint(rest);
       parts.push(textDisplay([...rest.map(label), ...(hint === '' ? [] : [hint])].join('\n')));
     }
+    // The Stop buttons last, after all text (plan 8X-F).
+    parts.push(...stoppable);
   }
-  if (news.note !== undefined) parts.push(textDisplay(`-# ${news.note}`));
   return {
     v2: true,
     components: [container(brief?.accent ?? NEWS_COLOUR, parts)],
diff --git a/src/services/notify-service.max.test.ts b/src/services/notify-service.max.test.ts
index d58e30dc888239b17850f65608de28143699c4a0..f39c4880bb602a08ddab1e487d1bdec63171a292 100644
--- a/src/services/notify-service.max.test.ts
+++ b/src/services/notify-service.max.test.ts
@@ -71,7 +71,8 @@ describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () =
         `(<#${WEST_CHANNEL}>) by **Rita**.`,
     );
     expect(dmReasons(message)).toEqual(['Dynamax Machamp']);
-    expect(textDisplays(message).at(-1)).toBe(
+    // Under the news, above the reasons and their Stop buttons (plan 8X-F).
+    expect(textDisplays(message)[1]).toBe(
       "-# You won't be told about more Dynamax Machamp battles for an hour.",
     );
     expect(linksOf(message)).toEqual([
@@ -149,7 +150,7 @@ describe('NotifyService: a max battle is reported (plan 8X-3, design 3.4)', () =
     await made.notify.flush();
     const told = made.dms.to(ALICE);
     expect(told).toHaveLength(2);
-    expect(textDisplays(told[1]).at(-1)).toBe(
+    expect(textDisplays(told[1])[1]).toBe(
       "-# You won't be told about more Gigantamax Machamp battles for an hour.",
     );
     await background.settle();
diff --git a/test/support/messages.ts b/test/support/messages.ts
index 6e9c3f49c0b898a2074b341673f8fedac0f35b39..f0b53d4144312282271da7e3f5159ff4c3293e97 100644
--- a/test/support/messages.ts
+++ b/test/support/messages.ts
@@ -295,13 +295,24 @@ export function dmBrief(message: OutgoingMessage | undefined): string[] {
  * in order: those with a button, then those listed without (the hint line left out).
  */
 export function dmReasons(message: OutgoingMessage | undefined): string[] {
-  const texts = textDisplays(message);
-  const at = texts.indexOf(REASONS_HEADING);
+  // The parts of the message's container, from the heading on: the sections of the reasons with
+  // a button, and the text that lists the others (wherever the message puts it).
+  const parts = v2(message).components.flatMap(
+    (component) => (component as { components?: unknown[] }).components ?? [],
+  ) as { type?: unknown; content?: string; components?: { content?: string }[] }[];
+  const at = parts.findIndex(
+    (part) => part.type === ComponentType.TextDisplay && part.content === REASONS_HEADING,
+  );
   if (at < 0) return [];
-  return texts
-    .slice(at + 1)
-    .flatMap((text) => text.split('\n'))
+  const after = parts.slice(at + 1);
+  const withButton = after
+    .filter((part) => part.type === ComponentType.Section)
+    .map((part) => part.components?.[0]?.content ?? '');
+  const listed = after
+    .filter((part) => part.type === ComponentType.TextDisplay)
+    .flatMap((part) => (part.content ?? '').split('\n'))
     .filter((line) => !line.startsWith('-# '));
+  return [...withButton, ...listed];
 }
 
 /** The link buttons of a message, as `label url`. */
````

### Task 8: 8X-F 8: docs, MOVE_NONE in counters, the 8X-5 checklist, the raid events' hole

Prototype commit: `88319dbc71c0762b522ee75afd002eeb289edcbd`

- utilities.md: Pokebattler records MOVE_NONE where it holds the charged move
  irrelevant to a max battle (Hydreigon "Bite" in the recorded attacker teams);
  Pine shows the fast move alone and drops nothing (finding 8, no code change).
- The 8X-5 staging checklist: step 8 expects the map's actual words for a point
  outside every region (PIN_NOT_HERE); step 14's region is the region's row id.
- Follow-ups: the raid events are still kept in memory only (out of scope).

**Files:**

```
 docs/architecture/utilities.md                         | 2 +-
 docs/superpowers/plans/2026-10-22-phase-8x5-staging.md | 4 ++--
 docs/superpowers/plans/phase-0-follow-ups.md           | 1 +
 3 files changed, 4 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated `); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 88319dbc71c0762b522ee75afd002eeb289edcbd -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-F 8: docs, MOVE_NONE in counters, the 8X-5 checklist, the raid events' hole`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 1b30331c8306577e2dfa489bed19bfa157ea82f2..983e038a72962971a0a5ab089049db95a0a0da31 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -43,7 +43,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Gyms for members, issues, counters and places
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
-- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (no answer for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its own Gigantamax battle (another boss named there is not: `ownBattle`); in a train's post the train's kind decides (plan 8X-4): a raid train's boss is a raid boss (one that is no raid boss now is asked for `tier:`, and its boss moves are offered), a Dynamax train's is taken at its Dynamax tier where a max boss list names it (`currentMaxBoss` of Dynamax bosses only; else "X is not a Dynamax boss now. Say which tier to simulate with `tier`."), a Gigantamax train's at Gigantamax (refused as above where the game master has no Gigantamax of it), a boss named there alike; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point; the first three slots that fit, `MAX_TEAM_SIZE`, the rest counted as left out) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten; "Others" for a role Pine does not know), the lines sharing what is left of `TEXT_BUDGET` equally, each fitted with "…and N more", the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `askPokebattler` and `answeredMessage` (a raid's counters or a max battle's team, by the kept options' `kind`; a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
+- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (no answer for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its own Gigantamax battle (another boss named there is not: `ownBattle`); in a train's post the train's kind decides (plan 8X-4): a raid train's boss is a raid boss (one that is no raid boss now is asked for `tier:`, and its boss moves are offered), a Dynamax train's is taken at its Dynamax tier where a max boss list names it (`currentMaxBoss` of Dynamax bosses only; else "X is not a Dynamax boss now. Say which tier to simulate with `tier`."), a Gigantamax train's at Gigantamax (refused as above where the game master has no Gigantamax of it), a boss named there alike; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point, and Pokebattler records it where it holds the charged move irrelevant to a max battle, so such a member is shown with its fast move alone, no separator and no small print: plan 8X-F checked the staging's Hydreigon "Bite" against the recorded answers, `test/fixtures/pokebattler-max-teams.json`, `BITE_FAST` / `MOVE_NONE` in the attacker teams, `BRUTAL_SWING` in the shielder's: Pine drops nothing; the first three slots that fit, `MAX_TEAM_SIZE`, the rest counted as left out) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten; "Others" for a role Pine does not know), the lines sharing what is left of `TEXT_BUDGET` equally, each fitted with "…and N more", the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `askPokebattler` and `answeredMessage` (a raid's counters or a max battle's team, by the kept options' `kind`; a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
 - `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`; its small print says not to share it: it logs in whoever opens it as the member), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
diff --git a/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md b/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md
index 0d71b9a7b0dc881fd780261c5ed57a3b11eb087e..88666979a342faa14034a318c6c1e25ddbe3f770 100644
--- a/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md
+++ b/docs/superpowers/plans/2026-10-22-phase-8x5-staging.md
@@ -31,7 +31,7 @@ const post = (path, body) =>
 
 6. `await post('maxes', { spot: '<a Power Spot id from step 3>', boss: '<a value from step 4>' })` as Tester: 200 with `text` and `max`; the post appears in the spot's region's forum as `/max` makes it, the end at the next rotation as `/max`'s; the log line "a max battle was reported on the map" names the spot, not a text.
 7. The same body again as Googer: 409, it joins the battle (as `/max`'s second report does). Another boss at the same spot: 409 `taken`, the text names the post and says "Open its post and use /boss there to change its boss."; the same by a member kept out of that forum: 409 with the words but no `max` in the answer.
-8. **A point:** `post('maxes', { lat, lon, boss })` within 50 m of a known Power Spot: the battle is at that spot. A point far from any spot: a pin battle, "Unlisted power spot", and the moderators' channel gets the pin battle notice. A point outside every region: 422 "That place is not in a region of this server. Pick a power spot on the map."
+8. **A point:** `post('maxes', { lat, lon, boss })` within 50 m of a known Power Spot: the battle is at that spot. A point far from any spot: a pin battle, "Unlisted power spot", and the moderators' channel gets the pin battle notice. A point outside every region: 422 "That pin is not in a region of this server. Give a place in the regions here." (`PIN_NOT_HERE`, as `/max` says it; "That place is not in a region of this server. Pick a power spot on the map.", `MAP_NOT_HERE`, is only for a spot whose region outline moved off it meanwhile; checklist set right in plan 8X-F).
 9. **Blocked at a pin:** with Tester blocked (8S-1's block), a new pin battle: 403 with `needs: 'listed-spot'`; joining an existing pin battle there: allowed (if that battle ends before the report is stored, the report is refused as blocked, never a new pin battle).
 10. **A boss on no list:** a typed boss name the game master knows but no list names, without `tier`: 422 "Which tier? Pick the tier of this boss." with `needs: 'tier'`; with `tier: 'D3'`: reported. A name the game master does not know: 422 "I know no Pokémon called "…". Pick a boss from the list." with `needs: 'boss'`.
 11. **Ending soon:** at a spot during a short max event, less than five minutes before a rotation: 422 with `soon.choices` (each with its `end`), counted nothing; sending the report again with `soon: { value, end }` of a choice reports it with that end, counted once; a `soon` with an `end` that has passed: "That battle has ended meanwhile: nothing was reported."; `soon` with a typed `end`: 400. (If no event is on, skip this step; the tests cover it.)
@@ -40,7 +40,7 @@ const post = (path, body) =>
 ## Remote and train kinds
 
 13. `await post('parties/<a raid id>/remote')` as Tester, signed up: 200, the post shows Tester as remote; again: off. The same on a max battle, a meetup and a train (every post that has Remote); on an elite raid that refuses Remote: refused in the post's words. `get('parties')`: each party's attendance has `remote: { offered, on }`.
-14. **A train's kind:** `post('trains', { region: <channel id>, name: 'Map Wild Area', kind: 'gigantamax' })`: the post `### Gigantamax Train: Map Wild Area` with the `Max battle` tag. `get('parties')`: its `trainKind` `gigantamax`, `trainKindWords`, `may.kind` true for Googer while it has no route (`panel` null).
+14. **A train's kind:** `post('trains', { region: <region id>, name: 'Map Wild Area', kind: 'gigantamax' })` (`region` is the region's row id, a number, as `get('geo')` lists it in `regions`, not its channel id; plan 8X-F): the post `### Gigantamax Train: Map Wild Area` with the `Max battle` tag. `get('parties')`: its `trainKind` `gigantamax`, `trainKindWords`, `may.kind` true for Googer while it has no route (`panel` null).
 15. `post('trains/<id>/move/kind', { kind: 'dynamax' })` as its maker: "This train is a Max Battle Train now.", the post's heading and tags change, its log line; as Tester (not its maker, no rights): 403, uncounted. The log line "a train's kind was set on the map".
 16. Add a Power Spot stop from the console (`post('trains/<id>/route', { drawn: [], add: { stop: 'w<spot id>' } })` or the body `web.md` gives): the route lists it as `<title> (power spot)`.
 
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index 517ccea9f84fe0adee6d65a2123fe0b487725d73..4ff1ce401d7367710fdcf50ea55b5c8c31defc3d 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -1563,6 +1563,7 @@ Run on the dev bot from the main checkout (typescript-migration 1ce8098b, with 8
   9. The 8X-5 checklist's step 14: `region` is the region's id, not its channel id.
 - **Matt's notes for later (not 8X-F unless he says so):** raid and max posts alike: the tier after the boss in a raid's title and heading ("Palkia (5★)"); the top of the post the same for both (drop Types from max posts, or add it to raids and trains); a Catch CP line for max battles (research first: whether weather boost applies; Matt's max catches were always level 20). Forever Friends (2025): only Remote Trades and XP are documented, no damage bonus above Best Friends; Pokebattler takes `FRIENDSHIP_LEVEL_5` but answers as for Best Friends: nothing to add.
 - **Not run, for the staging after 8X-F:** 8X-1B 9 (Android/iPhone preselection), 12, 13 (phone), 15, 17–24; 8X-2 5, 9; 8X-3 16, 17, 17a/b, 19 (history), and the second report within the hour of step 18; 8X-4 5, 7, 8, 10 (raid train), 12–24 (with 8B-3's leftovers); 8X-6 3–6, 8–10, 9a–e (8B-2's leftovers); 8X-5 8 (a far pin from the map), 11, 12. **Dated:** 2026-10-24 (Lake Trio Max Battle Day: were Dynamax battles up before 14:00, Q-B; do the trio linger in Pokebattler's feed after 17:00, 8X-2 step 11, 8X-3 step 20); 2026-11-14/15 (Wild Area: Gigantamax first, their default ends, 8X-3 step 21).
+- **Left by 8X-F (finding 5):** the max events and the big events are kept in the database since 8X-F (migration 029), but the raid events (Raid Hours, Raid Days, `RaidEventService.merged`) are still kept in memory only: a restart after ScrapedDuck dropped a Raid Hour of the current week loses it for the weekly Raid Hour rule until the next one. Same hole, out of 8X-F's scope; the same table (a `kind` column) or one of its own would close it.
 - **Left on the dev database:** parties at state 14 in #north-side until they expire (`var/stage/TEST-SERVER-STATE.md`), a Gigantamax Machamp boss override until 11/21.
 
 ## From Phase 8X-5 (max battles on the map, the server side, 2026-10-22)
````
