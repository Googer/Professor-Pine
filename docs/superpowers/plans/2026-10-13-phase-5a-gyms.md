# Phase 5A: Gym Administration (`/gym`, the upkeep of gym data, elite raid gyms): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff add a gym, change its texts, move it, mark it as an elite raid gym, delete it, look at everything Pine knows of it and export the server's gyms; Pine keeps a gym's address, nearby places and nearest gym up to date by itself.

**Architecture:** Phase 5 (admin) is three plans: 5A (this one), 5B (regions) and 5C (boss overrides, member settings, the role-authorization export). `/gym` is a command group of its own, registered like `/admin` (Manage Server by default, the bot's own staff check on top), with every answer private. Everything a command does goes through `GymAdminService` (`ctx.gymAdmin`), which works one change at a time, keeps `GymDirectory` in step and has the posts that show a gym rendered anew; what Google knows of a place sits behind a port (`GeoGateway`, called with `fetch`) and is fetched on the side by `GymUpkeep`. What a staff member types (a location, the texts) is read by pure functions in `src/domain/`. A deletion is one transaction for the row and what refers to it, then the directory forgets the gym, then the trains are mended.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies. No migration (the key of `Party.gymId` already clears itself when a gym is deleted; a database test pins it).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: row 204 of 4.2 and the line on `default_member_permissions` under it, 3.2. Where the spec and this plan differ the plan is newer. The design brief is the git-ignored `.superpowers/sdd/phase-5a-design.md`; the reviews and the rulings on them are `review-a.txt`, `review-b.txt`, `review-c.txt`, `review-rulings.md` and `review-rulings-2.md` in `.superpowers/sdd/2026-10-13-phase-5a-gyms/`; what the legacy bot did is `.superpowers/sdd/phase-5-legacy-notes.txt` (sections 1 to 3, 8).

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with the typecheck and the tests of each task clean and the full check, build and database suite clean on the tip (3,941 unit tests; the database suite, 240 tests). Two reviewers went through that branch, a third through the first fixes, and the second fixes carry out what the third found; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan

1. **Who and where.** `/gym` is offered by Discord only to members with Manage Server (or to whom a server admin grants it under Integrations), and the bot's own guard (`requireBotManagement`) applies on top. It is tied to no channel, every answer is private, servers only. Staff may touch any gym Pine knows (Matt, 2026-10-13).
2. **Autocomplete of staff commands is guarded.** For a command with `default_member_permissions` the router runs the command-level guards also for an autocomplete interaction and answers an empty list on a refusal. Ordinary commands are untouched.
3. **The commands:** `/gym add location name`, `edit gym` (one pre-filled form), `move gym location`, `elite gym eligible`, `delete gym`, `show gym`, `refresh gym`, `export`; `/admin clear-image-cache`. `show` is the spec's `find` and `detail` in one; `refresh` replaces `geocode` and `places`; `import` and the queue display are dropped (Matt).
4. **The `gym` option** is free text with autocomplete over every gym, the region of the channel first; a choice's value is `id:<n>`. Typed without picking: `#123` and `id:123` are always ids; bare digits are an id unless no gym has it (then a text search) or another gym is called by those digits (then refused, both listed); other text acts only on a clear hit, otherwise it is refused with suggestions.
5. **A location** is coordinates or a maps link. The link a gym's "View in map" in Pokémon GO shares is the main way (Matt: it carries the gym's exact coordinates) and reads as an exact point; a Google Maps pin wins over the map's centre; a route is read by where it ends; a place read only from where a map was centred is `approximate`, and the question says so. A short link is followed by hand: `https` only, the Maps short-link hosts and Google's own, five hops, five seconds, no body read.
6. **`add`** answers with what it understood and the buttons Add, Add with details… and Cancel (Add anyway when another gym lies within 10 metres), and asks again when a gym appeared there since. The details form has nickname, description, notice and keywords.
7. **`edit`** writes only the fields the staff member changed against what the form showed, so two people editing different fields do not undo each other. A refused form keeps what was typed behind "Open the form again". A request lives six hours.
8. **`move` is never refused** for a raid at the gym or a train through it (Matt: a correction is 10 to 20 metres); the answer says from where to where and how far, and what stays when the regions change. It asks first for a move of more than 500 metres, beside another gym, or for an approximate place, as one question.
9. **Elite, not EX** (Matt): the game calls a former EX gym an elite raid gym. A gym counts when either stored flag is set; `/gym elite gym eligible:true` sets the tag, `false` clears both; every sentence a reader sees about such a gym says "elite raid gym", and the channel setting is `channels['elite-gym-raids']` (default name `elite-gym-raids`). Nothing stored is renamed. The EX raid tier keeps its name until the plan that removes it. An elite-tier raid at an elite raid gym shows the sentence and gets the copy like any other raid there.
10. **`delete`** is refused while an active raid is at the gym. Otherwise it asks, listing what goes with it, and on Delete decides again: one transaction for the saved routes, the gym targets and the row; then the directory forgets the gym (from then on a report, `/location`, a train's stop and a loaded route refuse it with a sentence, `gym-gone`); then the gym is taken off the route of every active train, best effort; then the announcement. Nothing visible happens before the gym is really gone. The hourly upkeep takes stops the directory does not know off active trains.
11. **Announcements.** Where `settings.postNewGyms` is on, a new gym and a deletion are told in the server's channel for bot updates, without a ping, only where the bot may post embeds (a text fallback is not built). Edits are not announced. Every change staff make is logged with who, which gym and what, never the texts.
12. **Upkeep.** The address parts come from Google's Geocoding API, nearby places from Places API (New) (the key in a header; a refusal is remembered for an hour and the queue waits it out), the nearest gym is computed in memory for the gyms concerned only. Without a key, or when a call fails, the gym is saved all the same and the answer says what is missing. The key is never logged.
13. **Text rules.** Name and nickname must fit `varchar(255)` once entity-encoded; typed limits are 100 characters for name and nickname, 1,000 for the description, 500 for the notice, 30 keywords of at most 50. Control and direction characters are stripped (ZWNJ and the flag tag characters are kept). A notice keeps its line breaks in a post. The export is one TSV (name, longitude, latitude) of the gyms in this server's regions; names are left as they are apart from control characters and quotes (Matt).
14. **Known and left** (to the follow-ups file): a gym target added in the instant between the transaction and the directory forgetting the gym leaves an orphan row that every reader skips; the intermediate commits of Tasks 5 and 6 already carry the request variants and texts of the later subcommands (they compile; nothing refers to a later file).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files (Task 3 changes one key of `data/settings.json`, which is the new bot's). Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database, no `he`). Repositories are the only code that knows column names; a write in several steps goes through `inTransaction`.
- No migration and no generated file changes in this plan.
- **Tests never use the network and never contact Discord or Google.** Google in tests is `FakeGeo` (`test/support/geo.ts`); Discord is the fake interactions and the fake gateway. Database tests never use production rows.
- The Google API key is never logged, never in a file name, never in anything sent to Discord.
- Text staff typed is shown through `plain()` / `plainLines()`. Custom ids are built and parsed only through `src/discord/custom-id.ts`. A party changes only through its services.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Each task names the commit of the prototype it transcribes (branch `proto/phase-5a` of this repository). `git diff <that commit> -- src test scripts data/settings.json` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Inside the plan a task needs the typecheck and its own tests green (and whatever else its change could have broken); the full `npm run check` must be green after the last task (lint, format check, typecheck, all unit tests). `npx prettier --write <files you touched>` before every commit.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. A wrong place must never be stored silently: Task 1, `src/domain/geo/location-input.test.ts` ("takes the pin of a Google Maps address, not the middle of the map", "reads a route by where it ends, never by where it starts", "does not take two whole numbers for a place: that is a decimal comma", the test of the link Pokémon GO shares), and Task 6, `edit-move.test.ts` ("asks first when the new place is more than 500 metres away", "asks first when the place was only read from the middle of a map").
2. A deletion against everything that happens at the same moment: Task 4, `src/services/gym-admin-service.test.ts` ("lets a report that came first win: the deletion finds the raid", "answers a report that waited for a deletion with a sentence, and stores no raid", "takes the gym off a route whose new stop was being written while the gym went", "takes the gym off a route that was being loaded while the gym went", "leaves no ghost when the directory cannot read the database after the row is gone"), and `gym-removal-repository.db.test.ts` (the rollback).
3. Nothing of the key or of an address with it reaches a log line or Discord, and a short link cannot send the bot to another host: Task 2, `src/services/geo-gateway.test.ts` ("logs a failure without the address and without the key", "does not request a first address that is not a short link of the hosts it follows", "gives up after five addresses").
4. The wrong gym must never be acted on: Task 5, `src/commands/gyms/gym.test.ts` ("takes digits for the number of a gym, unless another gym is called so", "does not act on a number that another gym with a longer number is called by", "refuses text that does not name one gym for certain, with the gyms it might mean").
5. Nothing a staff member typed is lost or undone: Task 6, `edit-move.test.ts` ("does not undo what somebody else changed in another field meanwhile", "refuses texts that cannot be stored, keeps what was typed and opens the form again", "opens the form again with exactly what was typed, uncut", "leaves a text out of the form that is too long for it, keeps it, and says so"); and no message exceeds Discord's limits whatever a gym is called: Task 7, `delete-export.test.ts` ("holds its questions and answers to 2,000 characters whatever the gyms are called"), `src/render/gym-view.test.ts`.

---

## File Structure

New files (everything else is modified in place; each task lists its files):

```
src/domain/geo/distance.test.ts  (create, task 1)
src/domain/geo/distance.ts  (create, task 1)
src/domain/geo/location-input.test.ts  (create, task 1)
src/domain/geo/location-input.ts  (create, task 1)
src/domain/gyms/gym-export.test.ts  (create, task 1)
src/domain/gyms/gym-export.ts  (create, task 1)
src/domain/gyms/gym-text.test.ts  (create, task 1)
src/domain/gyms/gym-text.ts  (create, task 1)
src/domain/gyms/nearest.test.ts  (create, task 1)
src/domain/gyms/nearest.ts  (create, task 1)
src/domain/geo/google.test.ts  (create, task 2)
src/domain/geo/google.ts  (create, task 2)
src/services/geo-gateway.test.ts  (create, task 2)
src/services/geo-gateway.ts  (create, task 2)
src/services/gym-upkeep.test.ts  (create, task 2)
src/services/gym-upkeep.ts  (create, task 2)
test/support/geo.ts  (create, task 2)
test/support/gym-store.ts  (create, task 2)
src/db/repositories/gym-removal-repository.db.test.ts  (create, task 4)
src/db/repositories/gym-removal-repository.ts  (create, task 4)
src/render/gym-view.ts  (create, task 4)
src/services/gym-admin-service.test.ts  (create, task 4)
src/services/gym-admin-service.ts  (create, task 4)
test/support/gym-admin.ts  (create, task 4)
src/commands/gyms/add.ts  (create, task 5)
src/commands/gyms/controls.ts  (create, task 5)
src/commands/gyms/form.ts  (create, task 5)
src/commands/gyms/gym-option.ts  (create, task 5)
src/commands/gyms/gym.test.ts  (create, task 5)
src/commands/gyms/index.ts  (create, task 5)
src/commands/gyms/shared.ts  (create, task 5)
src/commands/gyms/show.ts  (create, task 5)
src/render/gym-view.test.ts  (create, task 5)
test/support/gym-commands.ts  (create, task 5)
src/commands/gyms/edit-move.test.ts  (create, task 6)
src/commands/gyms/edit.ts  (create, task 6)
src/commands/gyms/elite.ts  (create, task 6)
src/commands/gyms/move.ts  (create, task 6)
src/commands/admin/clear-image-cache.ts  (create, task 7)
src/commands/gyms/delete-export.test.ts  (create, task 7)
src/commands/gyms/delete.ts  (create, task 7)
src/commands/gyms/upkeep.ts  (create, task 7)
```

---

### Task 1: Gym rules: reading a location, the texts, the nearest gym, the export

**Files:**
- Create: `src/domain/geo/distance.test.ts`, `src/domain/geo/distance.ts`, `src/domain/geo/location-input.test.ts`, `src/domain/geo/location-input.ts`, `src/domain/gyms/gym-export.test.ts`, `src/domain/gyms/gym-export.ts`, `src/domain/gyms/gym-text.test.ts`, `src/domain/gyms/gym-text.ts`, `src/domain/gyms/nearest.test.ts`, `src/domain/gyms/nearest.ts`
- Modify: `src/db/repositories/party-repository.db.test.ts`, `src/domain/search/gym-index.test.ts`, `src/domain/search/gym-index.ts`

**Interfaces:**
- Consumes: `LatLon` of `src/domain/geo/`; the ignored words of `src/domain/search/gym-index.ts`; `PartyRepository` (for the database test of an ended raid whose gym was deleted).
- Produces: `src/domain/geo/distance.ts` (`metresBetween`, `placesWithin`, `nearestTo`); `src/domain/geo/location-input.ts` (pure): `readLocation(text)`, which answers a point (`approximate` when it was read from where a map was centred), a short link to be followed, or what could not be read, with the sentence that says what is read; `src/domain/gyms/gym-text.ts` (pure): the tidying and the limits of name, nickname, description, notice and keywords, what a form shows and what changed against it (`gymFormTexts`, `changedGymTexts`), the stored length through an encoder that is passed in; `src/domain/gyms/nearest.ts`: `nearestGymChanges` (which gyms get a new nearest gym after an addition, a move or a removal); `src/domain/gyms/gym-export.ts`: `gymsTsv`, `TSV_HEADER`; `searchedWords` exported from `gym-index.ts` (a name of ignored words only is found by nothing).

`party-repository.db.test.ts` gains the test that the key of `Party.gymId` clears itself and that an ended raid of a deleted gym is still read. Nothing uses any of it yet.

Reference commit of the prototype for this task: `034f990`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/db/repositories/party-repository.db.test.ts`:

```diff
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -485,4 +485,33 @@ describe('PartyRepository', () => {
     const back = await parties.findById(testRaid().id);
     expect(back).toMatchObject({ ok: true, party: { gymId: null, regionId: null } });
   });
+
+  it('still reads an ended raid whose gym was deleted, wherever ended raids are read', async () => {
+    // Deleting a gym must not be stopped by the raids that once were there: the key of
+    // `Party.gymId` sets it to null, for an ended row as for an active one.
+    const rule = await sql<{ rule: string }>`
+      select delete_rule as rule from information_schema.referential_constraints
+      where constraint_schema = database() and table_name = 'Party'
+        and constraint_name = 'party_gymid_foreign'`.execute(db);
+    expect(rule.rows.map((row) => row.rule)).toEqual(['SET NULL']);
+
+    await sql`insert into Gym (id, name) values (4, 'Gone')`.execute(db);
+    const ended: RaidParty = {
+      ...endParty(fullRaid(5)),
+      gymId: 4,
+      updatedAt: PARTY_NOW,
+    };
+    const post = ended.forumPostId ?? '';
+    await parties.insert(ended);
+    const deleted = await db.deleteFrom('Gym').where('id', '=', 4).executeTakeFirst();
+    expect(deleted.numDeletedRows).toBe(1n);
+
+    const back = await parties.findById(ended.id);
+    expect(back).toEqual({ ok: true, party: { ...ended, gymId: null } });
+    const old = await parties.listEndedBefore(PARTY_NOW + MINUTE, 10);
+    expect(old.unreadable).toEqual([]);
+    expect(old.parties).toEqual([{ ...ended, gymId: null }]);
+    await expect(parties.endedPosts([post])).resolves.toEqual([post]);
+    await expect(parties.delete(ended.id)).resolves.toBe(true);
+  });
 });
```

Create `src/domain/geo/distance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { metresBetween, nearestTo, placesWithin } from './distance.js';

const at = (id: number, lat: number, lon: number) => ({ id, lat, lon });

describe('metresBetween', () => {
  it('is zero for one point and the same both ways', () => {
    const a = { lat: 40.4406, lon: -79.9959 };
    const b = { lat: 40.4416, lon: -79.9949 };
    expect(metresBetween(a, a)).toBe(0);
    expect(metresBetween(a, b)).toBeCloseTo(metresBetween(b, a), 9);
  });

  it('measures a degree of latitude as about 111.2 km', () => {
    expect(metresBetween({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
  });

  it('measures a degree of longitude shorter away from the equator', () => {
    const atEquator = metresBetween({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    const at60 = metresBetween({ lat: 60, lon: 0 }, { lat: 60, lon: 1 });
    expect(at60 / atEquator).toBeCloseTo(0.5, 3);
  });

  it('measures across the date line and to the other side of the earth', () => {
    expect(metresBetween({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeCloseTo(111_195, -1);
    expect(metresBetween({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(20_015_087, -2);
  });
});

describe('placesWithin', () => {
  // A ten-thousandth of a degree of latitude is 11.1 metres.
  const places = [at(1, 40.0, -80.0), at(2, 40.00005, -80.0), at(3, 40.0002, -80.0)];

  it('gives what lies within the distance, nearest first, with the distance', () => {
    const found = placesWithin({ lat: 40.00001, lon: -80.0 }, places, 10);
    expect(found.map(({ place }) => place.id)).toEqual([1, 2]);
    expect(found[0]?.metres).toBeCloseTo(1.11, 1);
    expect(found[1]?.metres).toBeCloseTo(4.45, 1);
  });

  it('leaves out the place that is being moved', () => {
    const found = placesWithin({ lat: 40.0, lon: -80.0 }, places, 10, 1);
    expect(found.map(({ place }) => place.id)).toEqual([2]);
  });

  it('puts the lower id first of two that are equally near', () => {
    const twins = [at(9, 40.0, -80.0), at(4, 40.0, -80.0)];
    expect(placesWithin({ lat: 40.0, lon: -80.0 }, twins, 10).map((f) => f.place.id)).toEqual([
      4, 9,
    ]);
  });

  it('gives nothing when nothing is near', () => {
    expect(placesWithin({ lat: 41, lon: -80 }, places, 10)).toEqual([]);
  });
});

describe('nearestTo', () => {
  const places = [at(1, 40.0, -80.0), at(2, 40.001, -80.0), at(3, 40.01, -80.0)];

  it('gives the nearest other place with its distance', () => {
    const nearest = nearestTo(at(1, 40.0, -80.0), places);
    expect(nearest?.place.id).toBe(2);
    expect(nearest?.metres).toBeCloseTo(111.2, 0);
    expect(nearestTo(at(3, 40.01, -80.0), places)?.place.id).toBe(2);
  });

  it('does not count the place itself, by its id', () => {
    expect(nearestTo(at(2, 40.0, -80.0), places)?.place.id).toBe(1);
  });

  it('takes the lower id of two that are equally near', () => {
    const twins = [at(7, 40.001, -80.0), at(5, 40.001, -80.0), at(1, 40.0, -80.0)];
    expect(nearestTo(at(1, 40.0, -80.0), twins)?.place.id).toBe(5);
  });

  it('gives nothing for the only place', () => {
    expect(nearestTo(at(1, 40.0, -80.0), [at(1, 40.0, -80.0)])).toBeUndefined();
    expect(nearestTo(at(1, 40.0, -80.0), [])).toBeUndefined();
  });
});
```

Create `src/domain/geo/location-input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LOCATION_FORMS, readLocation } from './location-input.js';

const point = (lat: number, lon: number) => ({ kind: 'point', point: { lat, lon } });
/** A point read from where a map was centred. */
const near = (lat: number, lon: number) => ({ ...point(lat, lon), approximate: true });

describe('readLocation', () => {
  it.each([
    ['40.4406,-79.9959', 40.4406, -79.9959],
    ['40.4406, -79.9959', 40.4406, -79.9959],
    ['  40.4406 -79.9959 ', 40.4406, -79.9959],
    ['-33.8568;151.2153', -33.8568, 151.2153],
    ['40.0, -80', 40, -80],
    ['40 -80.5', 40, -80.5],
    ['+40.5,+10.25', 40.5, 10.25],
    ['40.4406° N, 79.9959° W', 40.4406, -79.9959],
    ['33.8568 S 151.2153 E', -33.8568, 151.2153],
  ])('reads the coordinates %s', (text, lat, lon) => {
    expect(readLocation(text)).toEqual(point(lat, lon));
  });

  it('reads degrees, minutes and seconds, whichever comes first', () => {
    const read = readLocation(`40°26'26.2"N 79°59'45.2"W`);
    expect(read.kind).toBe('point');
    if (read.kind !== 'point') return;
    expect(read.point.lat).toBeCloseTo(40.440611, 5);
    expect(read.point.lon).toBeCloseTo(-79.995889, 5);
    expect(readLocation(`79°59'45.2"W 40°26'26.2"N`)).toEqual(read);
    // Two latitudes are no place.
    expect(readLocation(`40°26'26.2"N 41°26'26.2"N`)).toEqual({ kind: 'unreadable' });
  });

  it('refuses minutes or seconds of sixty or more', () => {
    expect(readLocation(`40°60'26.2"N 79°59'45.2"W`)).toEqual({ kind: 'unreadable' });
    expect(readLocation(`40°26'60"N 79°59'45.2"W`)).toEqual({ kind: 'unreadable' });
    expect(readLocation(`40°26'26.2"N 79°59'75.2"W`)).toEqual({ kind: 'unreadable' });
    expect(readLocation(`40°59'59.9"N 79°59'59.9"W`).kind).toBe('point');
  });

  it('does not take two whole numbers for a place: that is a decimal comma', () => {
    expect(readLocation('40,44')).toEqual({ kind: 'unreadable' });
    expect(readLocation('40, -80')).toEqual({ kind: 'unreadable' });
    expect(readLocation('40 44')).toEqual({ kind: 'unreadable' });
    expect(readLocation('91, 10')).toEqual({ kind: 'unreadable' });
    // In a link the two numbers are a pair by their place in it.
    expect(readLocation('https://www.google.com/maps?q=40,-80')).toEqual(point(40, -80));
  });

  it('refuses numbers that are no place on earth', () => {
    expect(readLocation('91.0, 10')).toEqual({ kind: 'out-of-range' });
    expect(readLocation('-90.01,10')).toEqual({ kind: 'out-of-range' });
    expect(readLocation('45, 180.5')).toEqual({ kind: 'out-of-range' });
    expect(readLocation('90.0, -180')).toEqual(point(90, -180));
    expect(readLocation('https://maps.google.com/?q=95,10')).toEqual({ kind: 'out-of-range' });
  });

  it('takes the pin of a Google Maps address, not the middle of the map', () => {
    const address =
      'https://www.google.com/maps/place/Big+Fountain/@40.4420,-79.9990,17z/' +
      'data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d40.4406!4d-79.9959!16s%2Fg%2F1';
    expect(readLocation(address)).toEqual(point(40.4406, -79.9959));
  });

  it('takes the last pin when an address has several', () => {
    const address =
      'https://www.google.com/maps/place/A/@40.5,-79.9,12z/data=!4m9!1m2!3d40.1!4d-79.1!1m2!3d40.2!4d-79.2';
    expect(readLocation(address)).toEqual(point(40.2, -79.2));
  });

  it('reads the link that "View in map" of Pokémon GO shares as the place itself', () => {
    // The main way staff give a location (Matt, 2026-10-13): the gym, View in map, share.
    const shared =
      'https://maps.google.com/?q=40.434846,-79.923097&entry=gps&g_ep=CAESBzI1LjMuMTAYACDXggM%3D&shorturl=1';
    expect(readLocation(shared)).toEqual(point(40.434846, -79.923097));
    for (const spelled of [
      'https://maps.google.com/?q=40.434846%2C-79.923097&entry=gps&shorturl=1',
      'https://maps.google.com/?q=40.434846,+-79.923097&entry=gps',
      'https://maps.google.com/?q=40.434846, -79.923097&entry=gps',
      'HTTPS://MAPS.GOOGLE.COM/?q=40.434846,-79.923097&entry=gps',
      'maps.google.com/?q=40.434846,-79.923097&shorturl=1',
    ]) {
      expect(readLocation(spelled), spelled).toEqual(point(40.434846, -79.923097));
    }
    // With the name of the place behind the coordinates, as some apps write it.
    expect(readLocation('https://maps.google.com/?q=40.43,-79.92(Big+Fountain)')).toEqual(
      point(40.43, -79.92),
    );
    expect(readLocation('https://maps.google.com/?q=40.43,-79.92 (Big Fountain)')).toEqual(
      point(40.43, -79.92),
    );
  });

  it('reads a route by where it ends, never by where it starts', () => {
    // Asked for by its destination.
    expect(
      readLocation('https://www.google.com/maps/dir/?api=1&destination=40.4406,-79.9959'),
    ).toEqual(point(40.4406, -79.9959));
    expect(
      readLocation(
        'https://www.google.com/maps/dir/?api=1&origin=40.1,-79.1&destination=40.4406%2C-79.9959',
      ),
    ).toEqual(point(40.4406, -79.9959));
    // The end as coordinates, whatever follows it in the path.
    expect(
      readLocation(
        'https://www.google.com/maps/dir/Home/40.4406,-79.9959/@40.3,-79.5,11z/data=!4m2!1d-79.1!2d40.1',
      ),
    ).toEqual(point(40.4406, -79.9959));
    expect(
      readLocation('https://www.google.com/maps/dir/Home/40.4406,-79.9959/am=t/data=!3e0'),
    ).toEqual(point(40.4406, -79.9959));
    // An end that is named: the last waypoint of the data (longitude first), when the data has
    // one for every named stop. That is where Google found the name, so it is only near.
    expect(
      readLocation(
        'https://www.google.com/maps/dir/40.4406,-79.9959/Point+State+Park/@40.44,-80.0,15z/' +
          'data=!3m1!4b1!4m9!4m8!1m0!1m5!1m1!1s0x8834f1:0x1!2m2!1d-80.0119!2d40.4416!3e2',
      ),
    ).toEqual(near(40.4416, -80.0119));
    expect(
      readLocation(
        'https://www.google.com/maps/dir/Home/Cafe/Park/@40.44,-80.0,15z/data=!4m14' +
          '!1m5!1m1!1s0x1!2m2!1d-79.9!2d40.1!1m5!1m1!1s0x2!2m2!1d-79.8!2d40.2' +
          '!1m5!1m1!1s0x3!2m2!1d-80.0119!2d40.4416',
      ),
    ).toEqual(near(40.4416, -80.0119));
    // No place, and never the start:
    for (const address of [
      // a start as coordinates and an end that nothing says;
      'https://www.google.com/maps/dir/40.4406,-79.9959/Point+State+Park',
      'https://www.google.com/maps/dir/40.4406,-79.9959/Point+State+Park/@40.44,-80.0,15z',
      'https://www.google.com/maps/dir/Home/Park/@40.44,-80.0,15z/data=!3m1!4b1',
      'https://www.google.com/maps/dir/Home/Park/@40.44,-80.0,15z/data=!4m2!3d40.1!4d-79.1',
      // a start that Google found and an end it did not (`!1m0`): the one waypoint is the start;
      'https://www.google.com/maps/dir/Point+State+Park/Somewhere+typed/@40.44,-80.0,15z/' +
        'data=!4m9!4m8!1m5!1m1!1s0x8834f1:0x1!2m2!1d-80.0119!2d40.4416!1m0!3e0',
      // fewer waypoints than names.
      'https://www.google.com/maps/dir/Home/Cafe/Park/@40.44,-80.0,15z/' +
        'data=!4m14!1m5!1m1!1s0x1!2m2!1d-79.9!2d40.1!1m5!1m1!1s0x2!2m2!1d-80.0119!2d40.4416',
    ]) {
      expect(readLocation(address), address).toEqual({ kind: 'unreadable' });
    }
  });

  it('reads coordinates that were searched for as the place', () => {
    expect(readLocation('https://www.google.com/maps/search/40.4406,+-79.9959')).toEqual(
      point(40.4406, -79.9959),
    );
    expect(
      readLocation('https://www.google.com/maps/search/40.4406,-79.9959/@40.5,-79.9,15z'),
    ).toEqual(point(40.4406, -79.9959));
  });

  it.each([
    ['https://www.google.com/maps?q=40.4406,-79.9959', 40.4406, -79.9959],
    ['https://maps.google.com/?q=loc:40.4406,-79.9959', 40.4406, -79.9959],
    ['https://www.google.com/maps/search/?api=1&query=40.4406%2C-79.9959', 40.4406, -79.9959],
    ['https://www.google.co.uk/maps?q=51.5007,-0.1246', 51.5007, -0.1246],
    ['www.google.com/maps?q=40.4406,-79.9959', 40.4406, -79.9959],
    ['https://www.google.com/maps/place/40.4406,-79.9959', 40.4406, -79.9959],
    ['https://www.google.com/maps/dir/Home/40.4406,-79.9959', 40.4406, -79.9959],
    [
      'https://www.google.com/maps/dir/40.1,-79.1/40.4406,-79.9959/@40.3,-79.5,11z',
      40.4406,
      -79.9959,
    ],
  ])('reads the Google Maps address %s', (address, lat, lon) => {
    expect(readLocation(address)).toEqual(point(lat, lon));
  });

  it('reads the place of a Google Maps address written in degrees, minutes and seconds', () => {
    const read = readLocation(
      `https://www.google.com/maps/place/40%C2%B026'26.2%22N+79%C2%B059'45.2%22W/@40.5,-79.9,17z`,
    );
    expect(read.kind).toBe('point');
    if (read.kind !== 'point') return;
    expect(read.point.lat).toBeCloseTo(40.440611, 5);
    expect(read.point.lon).toBeCloseTo(-79.995889, 5);
  });

  it('reads the middle of a map or of a place page as near the place, and says so', () => {
    expect(readLocation('https://www.google.com/maps/@40.4406,-79.9959,17z')).toEqual(
      near(40.4406, -79.9959),
    );
    expect(readLocation('https://www.google.com/maps/@40.4406,-79.9959,17.25z/data=!5m1')).toEqual(
      near(40.4406, -79.9959),
    );
    expect(
      readLocation('https://www.google.com/maps/place/Big+Fountain/@40.4406,-79.9959,17z'),
    ).toEqual(near(40.4406, -79.9959));
    expect(readLocation('https://maps.google.com/maps?ll=40.4406,-79.9959&z=16')).toEqual(
      near(40.4406, -79.9959),
    );
    // A pin, a place in coordinates and a typed pair are the place itself.
    expect(readLocation('40.4406,-79.9959')).not.toHaveProperty('approximate');
    expect(
      readLocation('https://www.google.com/maps/place/40.4406,-79.9959/@40.5,-79.9,17z'),
    ).toEqual(point(40.4406, -79.9959));
    // Apple's `ll` is its place.
    expect(readLocation('https://maps.apple.com/?ll=40.4406,-79.9959')).not.toHaveProperty(
      'approximate',
    );
  });

  it.each([
    ['a search', 'https://www.google.com/maps/search/pizza/@40.4406,-79.9959,15z'],
    ['a search with data', 'https://www.google.com/maps/search/pizza/@40.44,-79.99,15z/data=!3m1'],
    [
      'a name with the centre of the map',
      'https://www.google.com/maps?q=Starbucks&ll=40.44,-79.99',
    ],
    ['a query by name', 'https://www.google.com/maps/@40.44,-79.99,15z?query=Starbucks'],
    ['a Street View', 'https://www.google.com/maps/@40.4406,-79.9959,3a,75y,90t/data=!3m6!1e1'],
    ['a map without a zoom', 'https://www.google.com/maps/@40.4406,-79.9959'],
  ])('does not take the middle of the map of %s for a place', (_what, address) => {
    expect(readLocation(address)).toEqual({ kind: 'unreadable' });
  });

  it('reads Apple Maps and Ingress intel links', () => {
    expect(readLocation('https://maps.apple.com/?ll=40.4406,-79.9959&q=Pin')).toEqual(
      point(40.4406, -79.9959),
    );
    expect(readLocation('https://maps.apple.com/place?coordinate=40.4406,-79.9959')).toEqual(
      point(40.4406, -79.9959),
    );
    // `pll` is the portal; `ll` only the middle of the map.
    expect(
      readLocation('https://intel.ingress.com/intel?ll=40.5,-79.5&z=17&pll=40.4406,-79.9959'),
    ).toEqual(point(40.4406, -79.9959));
    expect(readLocation('https://intel.ingress.com/intel?ll=40.5,-79.5&z=17')).toEqual({
      kind: 'unreadable',
    });
  });

  it('names a short link of the Maps app as one, without following it', () => {
    expect(readLocation('https://maps.app.goo.gl/AbC123xyz')).toEqual({
      kind: 'short-link',
      url: 'https://maps.app.goo.gl/AbC123xyz',
    });
    expect(readLocation('maps.app.goo.gl/AbC123xyz?g_st=ic')).toEqual({
      kind: 'short-link',
      url: 'https://maps.app.goo.gl/AbC123xyz?g_st=ic',
    });
    expect(readLocation('http://goo.gl/maps/AbC123')).toEqual({
      kind: 'short-link',
      url: 'https://goo.gl/maps/AbC123',
    });
    // `goo.gl` shortens anything: only its Maps links count.
    expect(readLocation('https://goo.gl/AbC123')).toEqual({ kind: 'unreadable' });
    expect(readLocation('https://maps.app.goo.gl/')).toEqual({ kind: 'unreadable' });
  });

  it.each([
    '',
    'the library',
    '40.4406',
    '40.4406, -79.9959, 12',
    'https://example.com/?q=40.4406,-79.9959',
    'https://google.com.evil.example/maps?q=40.4406,-79.9959',
    'https://www.google.com/maps/place/Big+Fountain',
    'https://www.google.com/maps?q=Big+Fountain',
    'javascript:alert(1)',
    '40.4406, -79.9959 https://example.com',
  ])('does not read %j', (text) => {
    expect(readLocation(text)).toEqual({ kind: 'unreadable' });
  });

  it('says what it reads', () => {
    expect(LOCATION_FORMS).toContain('40.4406, -79.9959');
  });
});
```

Create `src/domain/gyms/gym-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gymsTsv, TSV_HEADER } from './gym-export.js';

const gym = (id: number, name: string, lat = 40.5, lon = -80.25) => ({ id, name, lat, lon });

describe('gymsTsv', () => {
  it('writes the header and one line per gym, longitude before latitude', () => {
    expect(gymsTsv([gym(1, 'Big Fountain', 40.4406, -79.9959)])).toBe(
      'Gym Name\tLongitude\tLatitude\nBig Fountain\t-79.9959\t40.4406\n',
    );
  });

  it('writes only the header for no gyms', () => {
    expect(gymsTsv([])).toBe(`${TSV_HEADER}\n`);
  });

  it('sorts by name, and gyms of one name by id', () => {
    const lines = gymsTsv([
      gym(9, 'Starbucks', 1, 1),
      gym(5, 'Starbucks', 2, 2),
      gym(3, 'old stone fountain'),
      gym(4, 'Café Élan'),
      gym(7, 'Cafe Luna'),
    ])
      .trimEnd()
      .split('\n')
      .slice(1);
    expect(lines.map((line) => line.split('\t')[0])).toEqual([
      'Café Élan',
      'Cafe Luna',
      'old stone fountain',
      'Starbucks',
      'Starbucks',
    ]);
    expect(lines[3]).toBe('Starbucks\t2\t2');
  });

  it('keeps a name in its cell and on its line', () => {
    const [, line] = gymsTsv([gym(1, ' The "Old"\tMill\r\nby the\n\nriver ')]).split('\n');
    expect(line).toBe("The 'Old' Mill by the river\t-80.25\t40.5");
  });

  it('makes a space of every other control character too, and leaves a leading sign alone', () => {
    const [, line] = gymsTsv([gym(1, 'Old\u0000Mill\u001b[0m\u0085End')]).split('\n');
    expect(line).toBe('Old Mill [0m End\t-80.25\t40.5');
    const [, formula] = gymsTsv([gym(1, '=SUM(A1)')]).split('\n');
    expect(formula).toBe('=SUM(A1)\t-80.25\t40.5');
  });

  it('does not turn the input around', () => {
    const gyms = [gym(2, 'B'), gym(1, 'A')];
    gymsTsv(gyms);
    expect(gyms.map((one) => one.id)).toEqual([2, 1]);
  });
});
```

Create `src/domain/gyms/gym-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  changedGymTexts,
  GYM_TEXT_LIMITS,
  gymFormTexts,
  gymTextProblems,
  keywordsLine,
  KEYWORDS_LINE,
  parseKeywords,
  tidyGymTexts,
  tidyLine,
  tidyParagraph,
  type GymTexts,
} from './gym-text.js';

/** As long as typed: for texts whose stored form is no wider. */
const asTyped = (text: string): number => text.length;
/** An apostrophe is six characters once stored, as `he.encode` writes it. */
const encoded = (text: string): number => text.replace(/'/g, '&#x27;').length;

describe('tidyLine', () => {
  it('makes one line with single spaces of whatever was typed', () => {
    expect(tidyLine('  Big \t Fountain\r\n by the\u00a0lake ')).toBe('Big Fountain by the lake');
    expect(tidyLine('\n\n')).toBe('');
  });

  it('drops invisible formatting characters but keeps the joiner of emoji', () => {
    expect(tidyLine('Big\u202e Fountain\u200b')).toBe('Big Fountain');
    expect(tidyLine('Family \u{1f468}\u200d\u{1f467}')).toBe('Family \u{1f468}\u200d\u{1f467}');
    expect(tidyLine('a\u0000b')).toBe('a b');
    // The non-joiner belongs to words of Persian and of Indic scripts; the tag characters make
    // the flags of England, Scotland and Wales.
    expect(tidyLine('\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645')).toBe(
      '\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645',
    );
    const scotland = '\u{1f3f4}\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}';
    expect(tidyLine(`Thistle ${scotland}`)).toBe(`Thistle ${scotland}`);
  });
});

describe('tidyParagraph', () => {
  it('keeps the lines, tidies each and allows one empty line between two', () => {
    expect(tidyParagraph('  Park  closes at dusk. \r\n\r\n\r\n\r\n  Use the  east gate.\n')).toBe(
      'Park closes at dusk.\n\nUse the east gate.',
    );
    expect(tidyParagraph(' \n \n')).toBe('');
  });
});

describe('parseKeywords', () => {
  it('reads lower-case keywords, each once, in the order typed', () => {
    expect(parseKeywords('Plaza,  Town  Square ,plaza,, FOUNTAIN')).toEqual([
      'plaza',
      'town square',
      'fountain',
    ]);
  });

  it('takes a line break for a comma and nothing for no keywords', () => {
    expect(parseKeywords('plaza\nsquare')).toEqual(['plaza', 'square']);
    expect(parseKeywords(' , ,')).toEqual([]);
    expect(parseKeywords('')).toEqual([]);
  });

  it('reads back the line it is shown as', () => {
    const keywords = ['plaza', 'town square'];
    expect(keywordsLine(keywords)).toBe('plaza, town square');
    expect(parseKeywords(keywordsLine(keywords))).toEqual(keywords);
  });
});

describe('tidyGymTexts', () => {
  it('tidies every field that was sent and leaves out the others', () => {
    expect(
      tidyGymTexts({
        name: ' Big  Fountain ',
        nickname: '  ',
        description: 'By the\n\n\n\nlake',
        keywords: 'Plaza, plaza',
      }),
    ).toEqual({
      name: 'Big Fountain',
      nickname: null,
      description: 'By the\n\nlake',
      keywords: ['plaza'],
    });
    expect(tidyGymTexts({ notice: ' \n ' })).toEqual({ notice: null });
  });
});

describe('gymTextProblems', () => {
  it('finds nothing wrong with ordinary texts', () => {
    const texts: GymTexts = {
      name: 'Big Fountain',
      nickname: null,
      description: 'By the lake',
      notice: null,
      keywords: ['plaza'],
    };
    expect(gymTextProblems(texts, asTyped)).toEqual([]);
    expect(gymTextProblems({}, asTyped)).toEqual([]);
  });

  it('refuses a name of nothing', () => {
    expect(gymTextProblems({ name: '' }, asTyped)).toEqual([{ field: 'name', kind: 'blank' }]);
  });

  it('says by how much a text is longer than may be typed', () => {
    const problems = gymTextProblems(
      {
        name: 'n'.repeat(GYM_TEXT_LIMITS.name + 3),
        nickname: 'k'.repeat(GYM_TEXT_LIMITS.nickname + 1),
        description: 'd'.repeat(GYM_TEXT_LIMITS.description + 20),
        notice: 'x'.repeat(GYM_TEXT_LIMITS.notice + 7),
      },
      asTyped,
    );
    expect(problems).toEqual([
      { field: 'name', kind: 'too-long', by: 3, limit: 100 },
      { field: 'nickname', kind: 'too-long', by: 1, limit: 100 },
      { field: 'description', kind: 'too-long', by: 20, limit: 1_000 },
      { field: 'notice', kind: 'too-long', by: 7, limit: 500 },
    ]);
  });

  it('says by how much a name or nickname is too wide once stored', () => {
    // 60 apostrophes are 60 characters typed and 360 stored.
    const quotes = "'".repeat(60);
    expect(gymTextProblems({ name: quotes, nickname: quotes }, encoded)).toEqual([
      { field: 'name', kind: 'too-long-stored', by: 105 },
      { field: 'nickname', kind: 'too-long-stored', by: 105 },
    ]);
    // Exactly as wide as the column is fine.
    const fits = "'".repeat(42) + 'abc';
    expect(encoded(fits)).toBe(255);
    expect(gymTextProblems({ name: fits }, encoded)).toEqual([]);
    // A description and a notice are in columns without that limit.
    expect(gymTextProblems({ description: quotes, notice: quotes }, encoded)).toEqual([]);
  });

  it('names a keyword that is too long, and says how many are too many', () => {
    const long = 'k'.repeat(GYM_TEXT_LIMITS.keyword + 2);
    expect(gymTextProblems({ keywords: ['plaza', long] }, asTyped)).toEqual([
      { field: 'keywords', kind: 'keyword-too-long', keyword: long, by: 2, limit: 50 },
    ]);
    const many = Array.from({ length: GYM_TEXT_LIMITS.keywords + 4 }, (_, i) => `k${i}`);
    expect(gymTextProblems({ keywords: many }, asTyped)).toEqual([
      { field: 'keywords', kind: 'too-many-keywords', by: 4, limit: 30 },
    ]);
  });
});

describe('changedGymTexts', () => {
  const shown: GymTexts = {
    name: 'Big Fountain',
    nickname: 'The Splash',
    description: null,
    notice: 'Closes at dusk',
    keywords: ['plaza', 'square'],
  };

  it('gives nothing for a form that came back as it was filled', () => {
    expect(changedGymTexts(shown, { ...shown, keywords: [...shown.keywords] })).toEqual({});
  });

  it('gives only the fields that differ', () => {
    expect(
      changedGymTexts(shown, { ...shown, nickname: null, description: 'By the lake' }),
    ).toEqual({ nickname: null, description: 'By the lake' });
    expect(changedGymTexts(shown, { ...shown, keywords: ['square', 'plaza'] })).toEqual({
      keywords: ['square', 'plaza'],
    });
    expect(changedGymTexts(shown, { ...shown, keywords: [] })).toEqual({ keywords: [] });
  });

  it('does not take a field the form did not have for emptied', () => {
    const { notice: _notice, ...withoutNotice } = shown;
    expect(changedGymTexts(withoutNotice, { name: 'Bigger Fountain' })).toEqual({
      name: 'Bigger Fountain',
    });
  });
});

describe('gymFormTexts', () => {
  const gym: GymTexts = {
    name: 'Big  Fountain',
    nickname: null,
    description: 'By the lake',
    notice: null,
    keywords: ['plaza'],
  };

  it('shows every field of an ordinary gym, tidied', () => {
    const { shown, tooLong } = gymFormTexts(gym);
    expect(tooLong).toEqual([]);
    expect(shown).toEqual({ ...gym, name: 'Big Fountain' });
    // A form sent back untouched changes nothing, also where tidying changed the text.
    expect(
      changedGymTexts(
        shown,
        tidyGymTexts({
          name: 'Big Fountain',
          nickname: '',
          description: 'By the lake',
          notice: '',
          keywords: 'plaza',
        }),
      ),
    ).toEqual({});
  });

  it('leaves a text out of the form that is longer than its field', () => {
    const { shown, tooLong } = gymFormTexts({
      ...gym,
      name: 'n'.repeat(GYM_TEXT_LIMITS.name + 1),
      notice: 'x'.repeat(GYM_TEXT_LIMITS.notice + 1),
      keywords: Array.from({ length: 40 }, (_, i) => `${'k'.repeat(48)}${i}`),
    });
    expect(tooLong).toEqual(['name', 'notice', 'keywords']);
    expect(shown).toEqual({ nickname: null, description: 'By the lake' });
    expect(KEYWORDS_LINE).toBe(1_560);
  });

  it('shows a text that is exactly as long as its field', () => {
    const name = 'n'.repeat(GYM_TEXT_LIMITS.name);
    expect(gymFormTexts({ ...gym, name }).shown.name).toBe(name);
  });
});
```

Create `src/domain/gyms/nearest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nearestTo } from '../geo/distance.js';
import { nearestGymChanges, type NearGym } from './nearest.js';

/** Gyms on one line, a hundredth of a degree of latitude (1.1 km) per step of `at`. */
const gym = (id: number, at: number, nearestGym: number | null = null): NearGym => ({
  id,
  lat: 40 + at / 100,
  lon: -80,
  nearestGym,
});

/** The gyms with the nearest gym of each as it should be stored. */
function settled(gyms: readonly NearGym[]): NearGym[] {
  return gyms.map((one) => ({ ...one, nearestGym: nearestTo(one, gyms)?.place.id ?? null }));
}

/** The gyms after the changes were written. */
function applied(gyms: readonly NearGym[], changes: ReturnType<typeof nearestGymChanges>) {
  return gyms.map((one) => {
    const change = changes.find(({ id }) => id === one.id);
    return change ? { ...one, nearestGym: change.nearestGym } : one;
  });
}

describe('nearestGymChanges', () => {
  // 1 at 0, 2 at 1, 3 at 5, 4 at 6: pairs (1, 2) and (3, 4).
  const before = settled([gym(1, 0), gym(2, 1), gym(3, 5), gym(4, 6)]);

  it('gives a new gym its nearest and makes it the nearest of the gyms it is nearer to', () => {
    // A new gym at 4.6: nearest to 3, and nearer to 3 than 4 is.
    const gyms = [...before, gym(5, 4.6)];
    const changes = nearestGymChanges(gyms, { placed: 5 });
    expect(changes).toEqual([
      { id: 3, nearestGym: 5 },
      { id: 5, nearestGym: 3 },
    ]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('answers only the gyms whose stored value is wrong', () => {
    // Far from everything: nobody else changes.
    const gyms = [...before, gym(5, 50)];
    expect(nearestGymChanges(gyms, { placed: 5 })).toEqual([{ id: 5, nearestGym: 4 }]);
    // And once that is stored, nothing is left to write.
    expect(nearestGymChanges(settled(gyms), { placed: 5 })).toEqual([]);
  });

  it('has the gyms that pointed at a moved gym look anew', () => {
    // Gym 2 moves from 1 to 5.4: gym 1 is left with 3, and 3 and 4 have a nearer neighbour.
    const gyms = before.map((one) => (one.id === 2 ? { ...one, lat: 40.054 } : one));
    const changes = nearestGymChanges(gyms, { placed: 2 });
    expect(changes).toEqual([
      { id: 1, nearestGym: 3 },
      { id: 2, nearestGym: 3 },
      { id: 3, nearestGym: 2 },
      { id: 4, nearestGym: 2 },
    ]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('has the gyms that pointed at a deleted gym look anew, and no others', () => {
    const gyms = before.filter((one) => one.id !== 4);
    const changes = nearestGymChanges(gyms, { removed: 4 });
    expect(changes).toEqual([{ id: 3, nearestGym: 2 }]);
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('leaves the last gym without a nearest one', () => {
    const [first] = settled([gym(1, 0), gym(2, 1)]);
    if (!first) throw new Error('no gym');
    expect(nearestGymChanges([first], { removed: 2 })).toEqual([{ id: 1, nearestGym: null }]);
    expect(nearestGymChanges([gym(1, 0)], { placed: 1 })).toEqual([]);
  });

  it('gives a gym that points at nothing, at itself or at a gym that is gone its nearest when a gym is placed', () => {
    const gyms = [gym(1, 0, null), gym(2, 1, 2), gym(3, 5, 99), gym(4, 6, 3), gym(5, 30)];
    const changes = nearestGymChanges(gyms, { placed: 5 });
    expect(applied(gyms, changes)).toEqual(settled(gyms));
  });

  it('does not look at gyms a deletion did not touch', () => {
    // Gym 1 points at nothing (old data): a deletion elsewhere is not the moment to mend it.
    const gyms = [gym(1, 0, null), gym(2, 1, 1), gym(3, 5, 2)];
    expect(nearestGymChanges(gyms, { removed: 9 })).toEqual([]);
  });

  it('prefers the lower id of two gyms that are equally near', () => {
    // Gym 9 points at 5, which is exactly as near as the new gym 3 at the same place.
    const gyms = [gym(9, 0, 5), gym(5, 1, 9), gym(3, 1)];
    expect(nearestGymChanges(gyms, { placed: 3 })).toEqual([
      { id: 3, nearestGym: 5 },
      { id: 5, nearestGym: 3 },
      { id: 9, nearestGym: 3 },
    ]);
  });

  it('agrees with a full comparison after any one addition, move or deletion', () => {
    // A fixed scatter of gyms; every single change of it must end where a full pass ends.
    const scatter = settled(
      [3, 17, 4, 40, 41, 12, 28, 29.5, 8, 35].map((at, index) => gym(index + 1, at)),
    );
    for (const target of scatter) {
      const without = scatter.filter((one) => one.id !== target.id);
      const removed = nearestGymChanges(without, { removed: target.id });
      expect(applied(without, removed)).toEqual(settled(without));
      for (const at of [0, 16.5, 28.7, 60]) {
        const moved = scatter.map((one) =>
          one.id === target.id ? { ...gym(one.id, at), nearestGym: one.nearestGym } : one,
        );
        expect(applied(moved, nearestGymChanges(moved, { placed: target.id }))).toEqual(
          settled(moved),
        );
      }
    }
    const added = [...scatter, gym(99, 28.2)];
    expect(applied(added, nearestGymChanges(added, { placed: 99 }))).toEqual(settled(added));
  });

  it('agrees with a full comparison on a few hundred random maps, in both directions', () => {
    // A small generator with a fixed seed (mulberry32): the same maps on every run.
    let state = 20261013;
    const random = (): number => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // A town of two kilometres across; a tenth of the gyms share a place with another.
    const somewhere = (id: number, among: readonly NearGym[]): NearGym => {
      const twin =
        among.length > 0 && random() < 0.1 ? among[Math.floor(random() * among.length)] : undefined;
      return {
        id,
        lat: twin ? twin.lat : 40 + random() * 0.02,
        lon: twin ? twin.lon : -80 + random() * 0.02,
        nearestGym: null,
      };
    };
    for (let round = 0; round < 300; round++) {
      const gyms: NearGym[] = [];
      const size = 1 + Math.floor(random() * 14);
      for (let id = 1; id <= size; id++) gyms.push(somewhere(id, gyms));
      const before = settled(gyms);
      const pick = before[Math.floor(random() * before.length)];
      if (!pick) throw new Error('no gym');
      const what = random();
      if (what < 0.34) {
        const added = [...before, somewhere(size + 1, before)];
        expect(
          applied(added, nearestGymChanges(added, { placed: size + 1 })),
          `add ${round}`,
        ).toEqual(settled(added));
      } else if (what < 0.67) {
        const moved = before.map((one) =>
          one.id === pick.id ? { ...somewhere(one.id, before), nearestGym: one.nearestGym } : one,
        );
        expect(
          applied(moved, nearestGymChanges(moved, { placed: pick.id })),
          `move ${round}`,
        ).toEqual(settled(moved));
      } else {
        const left = before.filter((one) => one.id !== pick.id);
        expect(
          applied(left, nearestGymChanges(left, { removed: pick.id })),
          `remove ${round}`,
        ).toEqual(settled(left));
      }
    }
  });
});
```

Apply to `src/domain/search/gym-index.test.ts`:

```diff
--- a/src/domain/search/gym-index.test.ts
+++ b/src/domain/search/gym-index.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { testGyms } from '../../../test/support/gyms.js';
-import { GymIndex, type GymSearchOptions, type SearchableGym } from './gym-index.js';
+import { GymIndex, searchedWords, type GymSearchOptions, type SearchableGym } from './gym-index.js';
 
 const IGNORED = ['ex', 'raid', 'gym', 'sponsored'];
 const index = new GymIndex(testGyms(), IGNORED);
@@ -260,3 +260,20 @@ describe('GymIndex: unfinished letters and numbers', () => {
     expect(matches.map((match) => [match.gym.id, match.allWords])).toEqual([[500, true]]);
   });
 });
+
+describe('searchedWords', () => {
+  it('gives the words of a text the search goes by', () => {
+    expect(searchedWords("St. Mary's Church", IGNORED)).toEqual(['st', 'marys', 'church']);
+    expect(searchedWords('The Old Raid Gym', IGNORED)).toEqual(['old']);
+  });
+
+  it('gives nothing for a name of ignored words only: such a gym is found by its number alone', () => {
+    expect(searchedWords('The Gym', IGNORED)).toEqual([]);
+    expect(searchedWords('EX-Raid Gym (Sponsored)', IGNORED)).toEqual([]);
+    expect(searchedWords('The Gym', [])).toEqual(['gym']);
+    // And the index agrees: nothing finds it but its number.
+    const own = new GymIndex([invented(500, 'The Gym')], IGNORED);
+    expect(own.search('the gym')).toEqual([]);
+    expect(own.search('500').map((match) => match.gym.id)).toEqual([500]);
+  });
+});
```

Run: `npx vitest run --project unit src/domain/geo/distance.test.ts src/domain/geo/location-input.test.ts src/domain/gyms/gym-export.test.ts src/domain/gyms/gym-text.test.ts src/domain/gyms/nearest.test.ts src/domain/search/gym-index.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Create `src/domain/geo/distance.ts`:

```ts
import type { LatLon } from './lat-lon.js';

const EARTH_RADIUS_M = 6_371_000;
const RADIANS = Math.PI / 180;

/** The distance between two points in metres, along the surface of the earth (haversine). */
export function metresBetween(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLon = (b.lon - a.lon) * RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A place with an id: what the functions here need of a gym. */
export interface Placed extends LatLon {
  id: number;
}

/**
 * Those of `places` that lie within `metres` of a point, nearest first (ties: the lower id),
 * each with its distance. `exceptId` leaves one out: the gym that is being moved.
 */
export function placesWithin<P extends Placed>(
  point: LatLon,
  places: Iterable<P>,
  metres: number,
  exceptId?: number,
): { place: P; metres: number }[] {
  const found: { place: P; metres: number }[] = [];
  for (const place of places) {
    if (place.id === exceptId) continue;
    const distance = metresBetween(point, place);
    if (distance <= metres) found.push({ place, metres: distance });
  }
  return found.sort((a, b) => a.metres - b.metres || a.place.id - b.place.id);
}

/**
 * The one of `places` nearest to `of`, which itself does not count, with its distance; of
 * several equally near, the one with the lowest id. Undefined when there is no other.
 */
export function nearestTo<P extends Placed>(
  of: Placed,
  places: Iterable<P>,
): { place: P; metres: number } | undefined {
  let best: { place: P; metres: number } | undefined;
  for (const place of places) {
    if (place.id === of.id) continue;
    const metres = metresBetween(of, place);
    if (!best || metres < best.metres || (metres === best.metres && place.id < best.place.id)) {
      best = { place, metres };
    }
  }
  return best;
}
```

Create `src/domain/geo/location-input.ts`:

```ts
import type { LatLon } from './lat-lon.js';

/**
 * What a text says about where something is. `point`: coordinates; `approximate` when they are
 * only where a map was centred (an address without a pin: the place is somewhere near, and
 * whoever acts on it is told to check). `short-link`: an address that only leads to one (what
 * the Google Maps app shares): whoever may use the network follows it and reads the address it
 * leads to. `out-of-range`: numbers that are no place on earth. `unreadable`: anything else.
 */
export type LocationReading =
  | { kind: 'point'; point: LatLon; approximate?: true }
  | { kind: 'short-link'; url: string }
  | { kind: 'out-of-range' }
  | { kind: 'unreadable' };

/** The forms `readLocation` reads, as a sentence for whoever typed something else. */
export const LOCATION_FORMS =
  'Give the coordinates as `40.4406, -79.9959`, or paste a link to the place from Google Maps ' +
  '(also the short link its app shares), Apple Maps or the Ingress intel map.';

/** The hosts of the short links the Google Maps app shares. */
const SHORT_HOSTS: ReadonlySet<string> = new Set(['maps.app.goo.gl', 'goo.gl']);

const NUMBER = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
const PAIR = new RegExp(String.raw`^\s*(${NUMBER})\s*(?:,|;|\s)\s*(${NUMBER})\s*$`);
/** `40.4406° N, 79.9959° W`: decimal degrees with the letters of the compass. */
const COMPASS_PAIR = new RegExp(
  String.raw`^\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([NS])\s*[,;]?\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])\s*$`,
  'i',
);
/** `40°26'46.3"N 79°58'55.9"W`: degrees, minutes and seconds, as Google Maps writes a pin. */
const DMS = String.raw`(\d{1,3})\s*°\s*(\d{1,2})\s*['′’]\s*(\d{1,2}(?:\.\d+)?)\s*(?:"|″|”|'')\s*([NSEW])`;
const DMS_PAIR = new RegExp(String.raw`^\s*${DMS}\s*[,;+]?\s*${DMS}\s*$`, 'i');

function inRange(point: LatLon): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lon) <= 180
  );
}

function checked(point: LatLon): LocationReading {
  return inRange(point) ? { kind: 'point', point } : { kind: 'out-of-range' };
}

/** The reading as one of a map's centre: near the place, not the place. */
function approximately(reading: LocationReading): LocationReading {
  return reading.kind === 'point' ? { ...reading, approximate: true } : reading;
}

/**
 * Degrees, minutes and seconds with a letter of the compass, as decimal degrees; undefined when
 * the minutes or the seconds are 60 or more (that is no way to write an angle).
 */
function fromDms(
  degrees: string,
  minutes: string,
  seconds: string,
  letter: string,
): number | undefined {
  if (Number(minutes) >= 60 || Number(seconds) >= 60) return undefined;
  const value = Number(degrees) + Number(minutes) / 60 + Number(seconds) / 3600;
  return /[SW]/i.test(letter) ? -value : value;
}

/**
 * Two numbers as coordinates, latitude first: `40.44,-79.99`, with a space instead of the comma
 * or after it, with the letters of the compass, or as degrees, minutes and seconds. Undefined
 * for a text that is none of these.
 */
function readPair(text: string): LocationReading | undefined {
  const plain = PAIR.exec(text);
  if (plain) return checked({ lat: Number(plain[1]), lon: Number(plain[2]) });
  const compass = COMPASS_PAIR.exec(text);
  if (compass) {
    const [, lat = '', ns = '', lon = '', ew = ''] = compass;
    return checked({
      lat: /s/i.test(ns) ? -Number(lat) : Number(lat),
      lon: /w/i.test(ew) ? -Number(lon) : Number(lon),
    });
  }
  const dms = DMS_PAIR.exec(text);
  if (dms) {
    const [, d1 = '', m1 = '', s1 = '', l1 = '', d2 = '', m2 = '', s2 = '', l2 = ''] = dms;
    const first = fromDms(d1, m1, s1, l1);
    const second = fromDms(d2, m2, s2, l2);
    // Latitude first as a rule, but the letters say which is which.
    const latFirst = /[NS]/i.test(l1);
    if (first === undefined || second === undefined || latFirst === /[NS]/i.test(l2)) {
      return undefined;
    }
    return checked(latFirst ? { lat: first, lon: second } : { lat: second, lon: first });
  }
  return undefined;
}

/**
 * Whether a typed text is two whole numbers and nothing else (`40,44`): more likely one number
 * with a decimal comma than a place, since nobody knows a gym to the degree.
 */
function wholeNumbers(text: string): boolean {
  return /^\s*[-+]?\d+\s*(?:,|;|\s)\s*[-+]?\d+\s*$/.test(text);
}

/** The address a text is, when it is one: with `https://` put before a bare host and path. */
function asUrl(text: string): URL | undefined {
  const trimmed = text.trim();
  const address = /^https?:\/\//i.test(trimmed);
  // A space inside an address that was pasted (after the comma of its coordinates, in the name
  // of its place) is a space of the address; any other text with a space is no address.
  if (!address && /\s/.test(trimmed)) return undefined;
  const candidate = address
    ? trimmed.replace(/\s+/g, '%20')
    : /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(trimmed)
      ? `https://${trimmed}`
      : undefined;
  if (candidate === undefined) return undefined;
  try {
    return new URL(candidate);
  } catch {
    return undefined;
  }
}

function isGoogle(host: string): boolean {
  return /^(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(host);
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return text;
  }
}

/** The first of these query parameters that holds coordinates. */
function fromParams(url: URL, names: readonly string[]): LocationReading | undefined {
  for (const name of names) {
    const value = url.searchParams.get(name);
    if (value === null) continue;
    // `q=loc:40.44,-79.99` and `q=40.44,-79.99(Name)` are what some apps share.
    const reading = readPair(value.replace(/^loc:/i, '').replace(/\s*\([^()]*\)\s*$/, ''));
    if (reading) return reading;
  }
  return undefined;
}

/** The last match of a pair of numbers in an address, as `[first, second]`. */
function lastPair(href: string, pattern: RegExp): [number, number] | undefined {
  const found = [...href.matchAll(pattern)];
  const last = found[found.length - 1];
  return last ? [Number(last[1]), Number(last[2])] : undefined;
}

/**
 * A route (`/maps/dir/<from>/<to>/…`): the gym is where the route ends, never where it starts.
 * That is what the address was asked for (`destination`), or the last stop of the path when it
 * is coordinates. When the last stop is a name, the data of the address may have where Google
 * found each named stop (`!1d<lon>!2d<lat>`, longitude first, in the order of the stops): the
 * last of them is the end only when there is one for every named stop (a stop Google did not
 * find has none, and the last one would be some earlier stop), and it is only near the place
 * (`approximate`). Anything else says nothing: the middle of the map of a route is the middle
 * of the route, and a pin in its data is not known to be its end.
 */
function readRoute(url: URL, segments: readonly string[]): LocationReading | undefined {
  const asked = fromParams(url, ['destination']);
  if (asked) return asked;
  // Not a stop: the map's centre (`@…`) and what sets the view (`data=…`, `am=t`).
  const stops = segments
    .slice(segments.indexOf('dir') + 1)
    .filter((segment) => segment !== '' && !segment.startsWith('@') && !/^[a-z]+=/.test(segment));
  const end = readPair(stops[stops.length - 1] ?? '');
  if (end) return end;
  const named = stops.filter((stop) => readPair(stop) === undefined).length;
  const waypoints = [...url.href.matchAll(new RegExp(`!1d(${NUMBER})!2d(${NUMBER})`, 'g'))];
  const last = waypoints[waypoints.length - 1];
  if (!last || named === 0 || waypoints.length !== named) return undefined;
  return approximately(checked({ lat: Number(last[2]), lon: Number(last[1]) }));
}

/**
 * A Google Maps address. The pin (`!3d<lat>!4d<lon>`) is the place itself and wins; then what
 * the address was asked for when that is coordinates (`q`, `query`, `destination`) and the
 * place in its path (`/place/<coordinates>`, `/search/<coordinates>`). A route is read by where it ends (`readRoute`).
 *
 * Where a map was centred (`ll`, `@lat,lon,<zoom>z`) is beside the place whenever the map was
 * moved, so it is read only when the address has nothing better and is of a kind where the
 * centre is near the place: a bare map or a place page, never a search (`/search/`, `q=name`),
 * a route or a Street View (`@lat,lon,3a,…`, which is where the camera stood). Such a reading
 * is `approximate`.
 */
function readGoogle(url: URL): LocationReading | undefined {
  const segments = url.pathname.split('/').map(decoded);
  if (segments.includes('dir')) return readRoute(url, segments);
  const pin = lastPair(url.href, new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`, 'g'));
  if (pin) return checked({ lat: pin[0], lon: pin[1] });
  const asked = fromParams(url, ['q', 'query', 'destination']);
  if (asked) return asked;
  // The place of the path, or what was searched for, when that is coordinates.
  for (const kind of ['place', 'search']) {
    const at = segments.indexOf(kind);
    const named = at >= 0 ? readPair(segments[at + 1] ?? '') : undefined;
    if (named) return named;
  }
  // Asked for by name: the map shows results, and its centre is none of them.
  const searched =
    segments.includes('search') || url.searchParams.has('q') || url.searchParams.has('query');
  if (searched) return undefined;
  const centred = fromParams(url, ['ll']);
  if (centred) return approximately(centred);
  const centre = new RegExp(`/@(${NUMBER}),(${NUMBER}),\\d+(?:\\.\\d+)?z(?:/|$)`).exec(
    url.pathname,
  );
  if (centre) return approximately(checked({ lat: Number(centre[1]), lon: Number(centre[2]) }));
  return undefined;
}

/**
 * Reads where a gym is from what a moderator typed or pasted: coordinates (latitude first), or
 * a link to the place from Google Maps, Apple Maps (`ll`, `coordinate`: its place) or the
 * Ingress intel map (`pll`, the portal: its `ll` is only the middle of the map). It is pure: a
 * short link is named as one (`short-link`), not followed.
 */
export function readLocation(text: string): LocationReading {
  const pair = readPair(text);
  if (pair) return wholeNumbers(text) ? { kind: 'unreadable' } : pair;
  const url = asUrl(text);
  if (!url) return { kind: 'unreadable' };
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host)) {
    // Only what the Maps app shares: `goo.gl` shortens anything.
    const maps =
      host === 'maps.app.goo.gl' ? url.pathname.length > 1 : /^\/maps\/./.test(url.pathname);
    return maps
      ? { kind: 'short-link', url: `https://${host}${url.pathname}${url.search}` }
      : { kind: 'unreadable' };
  }
  let reading: LocationReading | undefined;
  if (isGoogle(host)) reading = readGoogle(url);
  else if (host === 'maps.apple.com') reading = fromParams(url, ['ll', 'coordinate']);
  else if (host === 'intel.ingress.com' || host === 'www.ingress.com' || host === 'ingress.com') {
    reading = fromParams(url, ['pll']);
  }
  return reading ?? { kind: 'unreadable' };
}
```

Create `src/domain/gyms/gym-export.ts`:

```ts
/** What the export needs of a gym. */
export interface ExportedGym {
  id: number;
  name: string;
  lat: number;
  lon: number;
}

/** The first line of the export, as the legacy bot wrote it: the map tools go by it. */
export const TSV_HEADER = 'Gym Name\tLongitude\tLatitude';

/**
 * A name as a cell of the export: a tab or a line break would end the cell or the row, so each
 * run of them, and of any other control character, is a space, and a double quote is an
 * apostrophe (as the legacy bot wrote it: the map tools that read the file take a double quote
 * for the start of a quoted cell). A name that begins with `=`, `+`, `-` or `@` is left as it
 * is: the file is for a map layer, not for a spreadsheet (Matt has yet to rule otherwise).
 */
function cell(name: string): string {
  return name
    .replace(/[\p{Cc}\u2028\u2029]+/gu, ' ')
    .replace(/"/g, "'")
    .trim();
}

/**
 * The gyms as a file of tab-separated values, one gym per line under the header, by name (and
 * by id for gyms of one name), longitude before latitude. Every line ends with a line feed.
 */
export function gymsTsv(gyms: readonly ExportedGym[]): string {
  const rows = [...gyms]
    .map((gym) => ({ ...gym, name: cell(gym.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id - b.id)
    .map((gym) => `${gym.name}\t${gym.lon}\t${gym.lat}`);
  return [TSV_HEADER, ...rows].map((line) => `${line}\n`).join('');
}
```

Create `src/domain/gyms/gym-text.ts`:

```ts
/**
 * What a moderator may type for a gym. The typed limits are what the form allows; the stored
 * limit is the width of the columns `Gym.name` and `GymMeta.nickname`, which hold the text
 * HTML-entity-encoded (an apostrophe is six characters there, a letter outside Latin-1 more).
 */
export const GYM_TEXT_LIMITS = {
  name: 100,
  nickname: 100,
  description: 1_000,
  /** Shown in every raid post at the gym. */
  notice: 500,
  /** One keyword. */
  keyword: 50,
  /** How many keywords a gym has at most. */
  keywords: 30,
  /** `varchar(255)`, of the encoded text. */
  stored: 255,
} as const;

/** The longest line of keywords a form takes: every keyword at its longest, with the commas. */
export const KEYWORDS_LINE = GYM_TEXT_LIMITS.keywords * (GYM_TEXT_LIMITS.keyword + 2);

/** The texts of a gym a moderator sets. */
export interface GymTexts {
  name: string;
  nickname: string | null;
  description: string | null;
  notice: string | null;
  keywords: string[];
}

export type GymTextField = keyof GymTexts;

/** The fields in the order a form shows them. */
export const GYM_TEXT_FIELDS: readonly GymTextField[] = [
  'name',
  'nickname',
  'description',
  'notice',
  'keywords',
];

/**
 * Why a text cannot be a gym's. `blank`: a name of nothing. `too-long`: longer than may be
 * typed, by `by` characters. `too-long-stored`: short enough as typed, but its stored form
 * (entity-encoded) is `by` characters wider than the column. `keyword-too-long`: the keyword
 * `keyword` is `by` characters too long. `too-many-keywords`: `by` keywords too many.
 */
export type GymTextProblem =
  | { field: 'name'; kind: 'blank' }
  | { field: GymTextField; kind: 'too-long'; by: number; limit: number }
  | { field: 'name' | 'nickname'; kind: 'too-long-stored'; by: number }
  | { field: 'keywords'; kind: 'keyword-too-long'; keyword: string; by: number; limit: number }
  | { field: 'keywords'; kind: 'too-many-keywords'; by: number; limit: number };

/**
 * Whether an invisible formatting character is one that text is written with: the zero-width
 * joiner and non-joiner, and the tag characters of the flags of England, Scotland and Wales.
 */
function writtenWith(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code === 0x200c || code === 0x200d || (code >= 0xe0020 && code <= 0xe007f);
}

/**
 * A text of one line as it is kept: control characters and line breaks are white space, runs
 * of white space are one space, none at either end. Other invisible formatting characters go,
 * but for those that text is written with: the zero-width joiner (emoji are built with it), the
 * non-joiner (words of Persian and of Indic scripts) and the tag characters (the flags of
 * England, Scotland and Wales).
 */
export function tidyLine(text: string): string {
  return text
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .replace(/\p{Cf}/gu, (character) => (writtenWith(character) ? character : ''))
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * A text of several lines as it is kept: each line tidied like `tidyLine`, at most one empty
 * line between two, none at either end.
 */
export function tidyParagraph(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map(tidyLine)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A text that may be left out: null for nothing. */
function orNull(text: string): string | null {
  return text === '' ? null : text;
}

/**
 * The keywords a text names, separated by commas (or line breaks): lower case, tidied, each
 * once, in the order they were typed; empty ones are dropped.
 */
export function parseKeywords(text: string): string[] {
  const keywords = text
    .split(/[,\n\r]/)
    .map((keyword) => tidyLine(keyword).toLowerCase())
    .filter((keyword) => keyword !== '');
  return [...new Set(keywords)];
}

/** The keywords as one line a form shows, and `parseKeywords` reads back. */
export function keywordsLine(keywords: readonly string[]): string {
  return keywords.join(', ');
}

/** What a moderator typed into the fields of a form, tidied; a field that is not there is left out. */
export function tidyGymTexts(typed: {
  name?: string;
  nickname?: string;
  description?: string;
  notice?: string;
  keywords?: string;
}): Partial<GymTexts> {
  return {
    ...(typed.name === undefined ? {} : { name: tidyLine(typed.name) }),
    ...(typed.nickname === undefined ? {} : { nickname: orNull(tidyLine(typed.nickname)) }),
    ...(typed.description === undefined
      ? {}
      : { description: orNull(tidyParagraph(typed.description)) }),
    ...(typed.notice === undefined ? {} : { notice: orNull(tidyParagraph(typed.notice)) }),
    ...(typed.keywords === undefined ? {} : { keywords: parseKeywords(typed.keywords) }),
  };
}

/**
 * What is wrong with these texts (already tidied), in the order of the form; empty when they
 * may be saved. `storedLength` gives the length of a text as the database holds it: the domain
 * does not know the encoding, the repository does (`storedTextLength`).
 */
export function gymTextProblems(
  texts: Partial<GymTexts>,
  storedLength: (text: string) => number,
): GymTextProblem[] {
  const problems: GymTextProblem[] = [];
  const typed = (field: 'name' | 'nickname' | 'description' | 'notice'): boolean => {
    const text = texts[field];
    const limit = GYM_TEXT_LIMITS[field];
    if (typeof text !== 'string' || text.length <= limit) return false;
    problems.push({ field, kind: 'too-long', by: text.length - limit, limit });
    return true;
  };
  const stored = (field: 'name' | 'nickname'): void => {
    const text = texts[field];
    if (typeof text !== 'string') return;
    const by = storedLength(text) - GYM_TEXT_LIMITS.stored;
    if (by > 0) problems.push({ field, kind: 'too-long-stored', by });
  };
  if (texts.name !== undefined) {
    if (texts.name === '') problems.push({ field: 'name', kind: 'blank' });
    else if (!typed('name')) stored('name');
  }
  if (!typed('nickname')) stored('nickname');
  typed('description');
  typed('notice');
  if (texts.keywords !== undefined) {
    const { keyword: limit, keywords: most } = GYM_TEXT_LIMITS;
    for (const keyword of texts.keywords) {
      if (keyword.length > limit) {
        problems.push({
          field: 'keywords',
          kind: 'keyword-too-long',
          keyword,
          by: keyword.length - limit,
          limit,
        });
      }
    }
    if (texts.keywords.length > most) {
      problems.push({
        field: 'keywords',
        kind: 'too-many-keywords',
        by: texts.keywords.length - most,
        limit: most,
      });
    }
  }
  return problems;
}

function sameKeywords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((keyword, index) => keyword === b[index]);
}

/**
 * The fields a moderator changed in a form: those of `sent` that differ from what the form was
 * filled with (`shown`). Only they are written, so that two moderators who each change another
 * field of one gym do not undo each other. A field the form did not have is not in `sent`.
 */
export function changedGymTexts(
  shown: Partial<GymTexts>,
  sent: Partial<GymTexts>,
): Partial<GymTexts> {
  const changed: Partial<GymTexts> = {};
  if (sent.name !== undefined && sent.name !== shown.name) changed.name = sent.name;
  if (sent.nickname !== undefined && sent.nickname !== shown.nickname) {
    changed.nickname = sent.nickname;
  }
  if (sent.description !== undefined && sent.description !== shown.description) {
    changed.description = sent.description;
  }
  if (sent.notice !== undefined && sent.notice !== shown.notice) changed.notice = sent.notice;
  if (sent.keywords !== undefined && !sameKeywords(sent.keywords, shown.keywords ?? [])) {
    changed.keywords = sent.keywords;
  }
  return changed;
}

/**
 * What a form shows for each field of a gym, and which fields it cannot show: a text longer
 * than the form's field allows would come back cut and be saved cut, so that field is left out
 * (`tooLong`) and stays as it is. `shown` holds the texts as the form's fields have them
 * (tidied, so that sending the form back untouched changes nothing).
 */
export function gymFormTexts(gym: GymTexts): { shown: Partial<GymTexts>; tooLong: GymTextField[] } {
  const all: GymTexts = {
    name: tidyLine(gym.name),
    nickname: orNull(tidyLine(gym.nickname ?? '')),
    description: orNull(tidyParagraph(gym.description ?? '')),
    notice: orNull(tidyParagraph(gym.notice ?? '')),
    keywords: parseKeywords(keywordsLine(gym.keywords)),
  };
  const lengths: Record<GymTextField, [number, number]> = {
    name: [all.name.length, GYM_TEXT_LIMITS.name],
    nickname: [all.nickname?.length ?? 0, GYM_TEXT_LIMITS.nickname],
    description: [all.description?.length ?? 0, GYM_TEXT_LIMITS.description],
    notice: [all.notice?.length ?? 0, GYM_TEXT_LIMITS.notice],
    keywords: [keywordsLine(all.keywords).length, KEYWORDS_LINE],
  };
  const tooLong = GYM_TEXT_FIELDS.filter((field) => lengths[field][0] > lengths[field][1]);
  const shown: Partial<GymTexts> = { ...all };
  for (const field of tooLong) delete shown[field];
  return { shown, tooLong };
}
```

Create `src/domain/gyms/nearest.ts`:

```ts
import { metresBetween, nearestTo, type Placed } from '../geo/distance.js';

/** What the bookkeeping of nearest gyms needs of a gym (`Gym` of the repository has it). */
export interface NearGym extends Placed {
  /** The id of the gym nearest to this one as it is stored; null when none is. */
  nearestGym: number | null;
}

/** A gym whose stored nearest gym is no longer right, with what it should be. */
export interface NearestChange {
  id: number;
  /** Null when there is no other gym. */
  nearestGym: number | null;
}

/** What happened to the gyms: one was added or moved (`placed`), or one is gone (`removed`). */
export interface NearestEvent {
  /** The id of the gym that was added or moved; it is among `gyms`, where it lies now. */
  placed?: number;
  /** The id of the gym that was deleted; it is not among `gyms`. */
  removed?: number;
}

/**
 * Which gyms need another nearest gym after one gym was added, moved or deleted, given every
 * gym as it is now. Only the gyms concerned are looked at, and only those whose stored value is
 * wrong are answered (the legacy bot compared every gym with every other and rewrote them all):
 *
 * - the gym that was added or moved itself;
 * - the gyms that pointed at the gym that moved or is gone: each looks for its nearest anew;
 * - every other gym for which the added or moved gym is now nearer than the one it points at
 *   (or that points at none, or at a gym that does not exist).
 *
 * Of two gyms equally near, the one with the lower id is the nearest. Sorted by id.
 */
export function nearestGymChanges(gyms: readonly NearGym[], event: NearestEvent): NearestChange[] {
  const byId = new Map(gyms.map((gym) => [gym.id, gym]));
  const placed = event.placed === undefined ? undefined : byId.get(event.placed);
  const changes: NearestChange[] = [];
  const note = (gym: NearGym, nearest: number | null): void => {
    if (gym.nearestGym !== nearest) changes.push({ id: gym.id, nearestGym: nearest });
  };
  for (const gym of gyms) {
    const pointsAt = gym.nearestGym === null ? undefined : byId.get(gym.nearestGym);
    // The gyms that look for their nearest among all gyms.
    const anew =
      gym.id === placed?.id ||
      (gym.nearestGym !== null &&
        (gym.nearestGym === event.removed || gym.nearestGym === placed?.id)) ||
      (placed !== undefined && (!pointsAt || pointsAt.id === gym.id));
    if (anew) {
      note(gym, nearestTo(gym, gyms)?.place.id ?? null);
      continue;
    }
    // After a deletion nothing came nearer to anybody.
    if (!placed || !pointsAt) continue;
    const now = metresBetween(gym, pointsAt);
    const offered = metresBetween(gym, placed);
    if (offered < now || (offered === now && placed.id < pointsAt.id)) note(gym, placed.id);
  }
  return changes.sort((a, b) => a.id - b.id);
}
```

Apply to `src/domain/search/gym-index.ts`:

```diff
--- a/src/domain/search/gym-index.ts
+++ b/src/domain/search/gym-index.ts
@@ -109,6 +109,21 @@ function toDocument(gym: SearchableGym): GymDocument {
   };
 }
 
+/** The words the gym search ignores, as it compares them: the common words and these, folded. */
+function ignoredTokens(ignoredWords: Iterable<string>): Set<string> {
+  return new Set([...STOP_WORDS, ...[...ignoredWords].flatMap(searchTokens)]);
+}
+
+/**
+ * The words of a text the gym search goes by: its words as they are indexed, without those the
+ * search ignores (the common English words and `ignoredWords`, settings.blacklistWords). A gym
+ * whose name has none can be found by its name no more than a gym without one.
+ */
+export function searchedWords(text: string, ignoredWords: Iterable<string>): string[] {
+  const ignored = ignoredTokens(ignoredWords);
+  return searchTokens(text).filter((token) => !ignored.has(token));
+}
+
 /**
  * Finds gyms by what members type. It is lenient on purpose: a word of two letters or more may
  * be the beginning of a longer one, a longer word may be slightly misspelt, and it may match the
@@ -126,7 +141,7 @@ export class GymIndex<G extends SearchableGym> {
   private readonly ignored: ReadonlySet<string>;
 
   constructor(gyms: Iterable<G>, ignoredWords: Iterable<string> = []) {
-    const ignored = new Set([...STOP_WORDS, ...[...ignoredWords].flatMap(searchTokens)]);
+    const ignored = ignoredTokens(ignoredWords);
     this.ignored = ignored;
     this.index = new MiniSearch<GymDocument>({
       fields: [...FIELDS],
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/geo/distance.test.ts src/domain/geo/location-input.test.ts src/domain/gyms/gym-export.test.ts src/domain/gyms/gym-text.test.ts src/domain/gyms/nearest.test.ts src/domain/search/gym-index.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/party-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/party-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 034f990 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/db/repositories/party-repository.db.test.ts src/domain/geo/distance.test.ts src/domain/geo/distance.ts src/domain/geo/location-input.test.ts src/domain/geo/location-input.ts src/domain/gyms/gym-export.test.ts src/domain/gyms/gym-export.ts src/domain/gyms/gym-text.test.ts src/domain/gyms/gym-text.ts src/domain/gyms/nearest.test.ts src/domain/gyms/nearest.ts src/domain/search/gym-index.test.ts src/domain/search/gym-index.ts
npm run typecheck; npx eslint src/db/repositories/party-repository.db.test.ts src/domain/geo/distance.test.ts src/domain/geo/distance.ts src/domain/geo/location-input.test.ts src/domain/geo/location-input.ts src/domain/gyms/gym-export.test.ts src/domain/gyms/gym-export.ts src/domain/gyms/gym-text.test.ts src/domain/gyms/gym-text.ts src/domain/gyms/nearest.test.ts src/domain/gyms/nearest.ts src/domain/search/gym-index.test.ts src/domain/search/gym-index.ts   # both clean; the full check runs after the last task
git add src/db/repositories/party-repository.db.test.ts src/domain/geo/distance.test.ts src/domain/geo/distance.ts src/domain/geo/location-input.test.ts src/domain/geo/location-input.ts src/domain/gyms/gym-export.test.ts src/domain/gyms/gym-export.ts src/domain/gyms/gym-text.test.ts src/domain/gyms/gym-text.ts src/domain/gyms/nearest.test.ts src/domain/gyms/nearest.ts src/domain/search/gym-index.test.ts src/domain/search/gym-index.ts
git commit -F <a file with the message below>
```

The commit message:

```
Gym rules: reading a location, texts, nearest gym, the TSV export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 2: Gym upkeep: Google behind a port, the nearest gyms, address and places

**Files:**
- Create: `src/domain/geo/google.test.ts`, `src/domain/geo/google.ts`, `src/services/geo-gateway.test.ts`, `src/services/geo-gateway.ts`, `src/services/gym-upkeep.test.ts`, `src/services/gym-upkeep.ts`, `test/support/geo.ts`, `test/support/gym-store.ts`
- Modify: `src/db/repositories/gym-repository.ts`, `src/domain/search/gym-lookup.ts`, `src/services/gym-directory.test.ts`, `src/services/gym-directory.ts`

**Interfaces:**
- Consumes: Task 1; `GymRepository`; `GymDirectory`; `env.GOOGLE_API_KEY`; `failureReason`.
- Produces: `src/domain/geo/google.ts` (pure): reading the answers of the Geocoding API and of Places API (New), the legacy list of 96 place types, the `geodata` document; `src/services/geo-gateway.ts`: the port `GeoGateway` (`reverseGeocode`, `placesNear`, `followShortLink(url, readable)`), each answering a value, `none`, `no-key`, `denied` (with `retryInMs`) or `failed`, and its `fetch` implementation `GoogleGeo`; `src/services/gym-upkeep.ts`: `GymUpkeep` (`gymChanged`, `placed`, `removed`, `refresh`, `flush`, `stop`): the nearest gyms of the gyms concerned, the address and the places of a gym, a slow queue for the gyms whose nearest gym changed, a generation per gym so a stale answer is never written; `GymDirectory.all()` and `GymLookup.all()`; `NewGym` takes notice and keywords; `test/support/geo.ts` (`FakeGeo`) and `test/support/gym-store.ts` (`MemoryGyms` with `holdOn` / `failingOn`, `gymDirectoryWith`).

`GoogleGeo` has unit tests over a `fetch` that is passed in; nothing in this plan contacts Google.

Reference commit of the prototype for this task: `fcce9ca`.

- [ ] **Step 1: Write the failing tests**

Create `src/domain/geo/google.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addressText } from './geodata.js';
import {
  geodataJson,
  geodataParts,
  PLACE_TYPES,
  placesRadius,
  placesRequest,
  placesText,
  readGeocode,
  readPlaces,
} from './google.js';

/** A reverse geocoding answer in the shape Google documents, written by hand. */
const GEOCODE_ANSWER = {
  plus_code: { compound_code: 'C2R4+6J Pinewood, PA, USA' },
  results: [
    {
      address_components: [
        { long_name: '12', short_name: '12', types: ['street_number'] },
        { long_name: 'Maple Avenue', short_name: 'Maple Ave', types: ['route'] },
        { long_name: 'Old Town', short_name: 'Old Town', types: ['neighborhood', 'political'] },
        { long_name: 'Pinewood', short_name: 'Pinewood', types: ['locality', 'political'] },
        {
          long_name: 'Pennsylvania',
          short_name: 'PA',
          types: ['administrative_area_level_1', 'political'],
        },
        { long_name: '15999', short_name: '15999', types: ['postal_code'] },
      ],
      formatted_address: '12 Maple Ave, Pinewood, PA 15999, USA',
      types: ['street_address'],
    },
    {
      address_components: [
        { long_name: 'Maple Avenue', short_name: 'Maple Ave', types: ['Route'] },
        { long_name: 'Market Street', short_name: 'Market St', types: ['route'] },
        { long_name: 'Pinewood', short_name: 'Pinewood', types: ['locality', 'political'] },
      ],
      types: ['intersection'],
    },
    { address_components: 'nonsense' },
    null,
  ],
  status: 'OK',
};

describe('readGeocode', () => {
  it('collects the distinct short names of every type over every result', () => {
    expect(readGeocode(GEOCODE_ANSWER)).toEqual({
      kind: 'ok',
      components: {
        street_number: '12',
        route: 'Maple Ave Market St',
        neighborhood: 'Old Town',
        political: 'Old Town Pinewood PA',
        locality: 'Pinewood',
        administrative_area_level_1: 'PA',
        postal_code: '15999',
      },
    });
  });

  it('reads an answer without results as an address of nothing', () => {
    expect(readGeocode({ results: [], status: 'ZERO_RESULTS' })).toEqual({
      kind: 'ok',
      components: {},
    });
    expect(readGeocode({ results: [], status: 'OK' })).toEqual({ kind: 'ok', components: {} });
  });

  it('tells a refused key from other failures', () => {
    expect(
      readGeocode({
        error_message: 'This API project is not authorized to use this API.',
        results: [],
        status: 'REQUEST_DENIED',
      }),
    ).toEqual({ kind: 'denied', message: 'This API project is not authorized to use this API.' });
    expect(readGeocode({ results: [], status: 'REQUEST_DENIED' })).toEqual({
      kind: 'denied',
      message: 'REQUEST_DENIED',
    });
    expect(readGeocode({ results: [], status: 'OVER_QUERY_LIMIT' })).toEqual({
      kind: 'failed',
      status: 'OVER_QUERY_LIMIT',
    });
    expect(readGeocode('<html>')).toEqual({ kind: 'failed', status: 'not an answer' });
    expect(readGeocode({})).toEqual({ kind: 'failed', status: 'no status' });
  });
});

describe('geodataJson and geodataParts', () => {
  it('stores the parts as the search and the legacy bot read them', () => {
    const reading = readGeocode(GEOCODE_ANSWER);
    if (reading.kind !== 'ok') throw new Error('not read');
    const stored = geodataJson(reading.components);
    expect(stored).toBe(
      '{"addressComponents":{"street_number":"12","route":"Maple Ave Market St",' +
        '"neighborhood":"Old Town","political":"Old Town Pinewood PA","locality":"Pinewood",' +
        '"administrative_area_level_1":"PA","postal_code":"15999"}}',
    );
    expect(addressText(stored)).toBe('Maple Ave Market St Old Town Pinewood 15999');
    expect(geodataParts(stored).slice(0, 2)).toEqual([
      { type: 'street_number', value: '12' },
      { type: 'route', value: 'Maple Ave Market St' },
    ]);
  });

  it('stores nothing for an address of nothing', () => {
    expect(geodataJson({})).toBeNull();
  });

  it('shows nothing of a stored text it cannot read', () => {
    expect(geodataParts(null)).toEqual([]);
    expect(geodataParts('not json')).toEqual([]);
    expect(geodataParts('{"other":1}')).toEqual([]);
    expect(geodataParts('{"addressComponents":"x"}')).toEqual([]);
    // Older rows may hold lists; an empty value is left out.
    expect(geodataParts('{"addressComponents":{"route":["A St","B St"],"premise":" "}}')).toEqual([
      { type: 'route', value: 'A St B St' },
    ]);
  });
});

describe('readPlaces', () => {
  /** A Nearby Search answer of the Places API (New), written by hand. */
  const answer = {
    places: [
      {
        types: ['bakery', 'food', 'store'],
        displayName: { text: 'Corner Bakery', languageCode: 'en' },
      },
      { types: ['dentist', 'health'], displayName: { text: ' Maple   Dental ' } },
      { types: ['transit_station'], displayName: { text: 'Maple Ave at Market St' } },
      { types: ['cafe'], displayName: { text: 'Corner Bakery' } },
      { types: ['park'], displayName: {} },
      { types: ['park'] },
      { displayName: { text: 'No Types' } },
      'nonsense',
    ],
  };

  it('keeps the names of the places of a kind worth keeping, each once, in order', () => {
    expect(readPlaces(answer)).toEqual(['Corner Bakery', 'Maple Dental']);
  });

  it('reads an answer without places as none', () => {
    expect(readPlaces({})).toEqual([]);
    expect(readPlaces({ places: 'x' })).toEqual([]);
    expect(readPlaces(null)).toEqual([]);
  });

  it('stores the names joined by spaces, and nothing for none', () => {
    expect(placesText(['Corner Bakery', 'Maple Dental'])).toBe('Corner Bakery Maple Dental');
    expect(placesText([])).toBeNull();
  });

  it('has the legacy list of kinds', () => {
    expect(PLACE_TYPES.size).toBe(96);
    expect(PLACE_TYPES.has('library')).toBe(true);
    expect(PLACE_TYPES.has('transit_station')).toBe(false);
  });
});

describe('placesRadius and placesRequest', () => {
  it('looks half the way to the nearest gym, within its bounds', () => {
    expect(placesRadius(300)).toBe(150);
    expect(placesRadius(20)).toBe(25);
    expect(placesRadius(0)).toBe(25);
    expect(placesRadius(5_000)).toBe(500);
    expect(placesRadius(undefined)).toBe(500);
    expect(placesRadius(Number.NaN)).toBe(500);
  });

  it('asks for twenty places in a circle around the point', () => {
    expect(placesRequest({ lat: 40.44, lon: -79.99 }, 150)).toEqual({
      maxResultCount: 20,
      languageCode: 'en',
      locationRestriction: {
        circle: { center: { latitude: 40.44, longitude: -79.99 }, radius: 150 },
      },
    });
  });
});
```

Create `src/services/geo-gateway.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createTestLogger } from '../../test/support/test-logger.js';
import { readLocation } from '../domain/geo/location-input.js';
import { GoogleGeo, MAX_LINK_HOPS, type GeoFetch, type GeoResponse } from './geo-gateway.js';

const KEY = 'test-key-123+/=';
const POINT = { lat: 40.4406, lon: -79.9959 };

interface Call {
  url: string;
  init: Parameters<GeoFetch>[1];
}

/** A `fetch` that answers from a list and records what it was asked. Nothing leaves the test. */
function fakeFetch(answers: (GeoResponse | Error | 'hang')[]) {
  const calls: Call[] = [];
  let cancelled = 0;
  const fetch: GeoFetch = (url, init) => {
    calls.push({ url, init });
    const answer = answers.shift();
    if (answer === undefined) return Promise.reject(new Error('no answer left'));
    if (answer instanceof Error) return Promise.reject(answer);
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted'));
        });
      });
    }
    return Promise.resolve({
      ...answer,
      body: {
        cancel: () => {
          cancelled += 1;
          return Promise.resolve();
        },
      },
    });
  };
  return { fetch, calls, cancelledBodies: () => cancelled };
}

function json(body: unknown, status = 200): GeoResponse {
  return {
    status,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

function redirect(location: string | null, status = 302): GeoResponse {
  return {
    status,
    headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) },
    json: () => Promise.reject(new Error('the body of a redirect must not be read')),
  };
}

function geo(answers: (GeoResponse | Error | 'hang')[], options: { apiKey?: string } = {}) {
  const { log, entries } = createTestLogger();
  const faked = fakeFetch(answers);
  const clock = { now: 1_000_000 };
  const gateway = new GoogleGeo({
    apiKey: 'apiKey' in options ? options.apiKey : KEY,
    fetch: faked.fetch,
    log,
    now: () => clock.now,
    linkTimeoutMs: 40,
  });
  return { gateway, entries, clock, ...faked };
}

const logged = (entries: readonly unknown[]): string => JSON.stringify(entries);
/** The entries at pino's level for warnings. */
const warnings = (entries: ReadonlyArray<Record<string, unknown>>) =>
  entries.filter((entry) => entry.level === 40);
const readable = (address: string): boolean => readLocation(address).kind === 'point';

describe('GoogleGeo: reverse geocoding', () => {
  const answer = {
    status: 'OK',
    results: [
      {
        address_components: [
          { long_name: 'Maple Avenue', short_name: 'Maple Ave', types: ['route'] },
        ],
      },
    ],
  };

  it('asks the Geocoding API for the point and reads the address parts', async () => {
    const { gateway, calls } = geo([json(answer)]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({
      ok: true,
      value: { route: 'Maple Ave' },
    });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]?.url ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://maps.googleapis.com/maps/api/geocode/json',
    );
    expect(url.searchParams.get('latlng')).toBe('40.4406,-79.9959');
    expect(url.searchParams.get('key')).toBe(KEY);
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('asks nothing without a key', async () => {
    for (const apiKey of [undefined, '']) {
      const { gateway, calls } = geo([], { apiKey });
      expect(gateway.enabled).toBe(false);
      await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: false, reason: 'no-key' });
      await expect(gateway.placesNear(POINT, 100)).resolves.toEqual({
        ok: false,
        reason: 'no-key',
      });
      expect(calls).toEqual([]);
    }
  });

  it('logs a failure without the address and without the key', async () => {
    const failure = new TypeError('fetch failed', {
      cause: new Error(`connect ECONNREFUSED https://maps.googleapis.com/?key=${KEY}`),
    });
    const { gateway, entries } = geo([failure, json({ status: 'OVER_QUERY_LIMIT' })]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: false, reason: 'failed' });
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(warnings(entries)).toHaveLength(2);
    expect(logged(entries)).not.toContain(KEY);
    expect(logged(entries)).not.toContain(encodeURIComponent(KEY));
    expect(logged(entries)).toContain('OVER_QUERY_LIMIT');
  });

  it('lets go of the body of a 403 unread', async () => {
    const { gateway, cancelledBodies } = geo([json({ error: 'forbidden' }, 403)]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toMatchObject({ reason: 'denied' });
    expect(cancelledBodies()).toBe(1);
    const places = geo([json({ error: 'forbidden' }, 403)]);
    await expect(places.gateway.placesNear(POINT, 100)).resolves.toMatchObject({
      reason: 'denied',
    });
    expect(places.cancelledBodies()).toBe(1);
  });

  it('remembers a refused key for an hour, and says so once', async () => {
    const refusal = json({
      status: 'REQUEST_DENIED',
      error_message: `The key ${KEY} is not allowed`,
    });
    const { gateway, calls, entries, clock } = geo([refusal, json(answer)]);
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({
      ok: false,
      reason: 'denied',
      retryInMs: 3_600_000,
    });
    clock.now += 600_000;
    // It says how long it is still left alone.
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({
      ok: false,
      reason: 'denied',
      retryInMs: 3_000_000,
    });
    clock.now -= 600_000;
    expect(calls).toHaveLength(1);
    expect(warnings(entries)).toHaveLength(1);
    expect(logged(entries)).not.toContain(KEY);
    clock.now += 3_600_000;
    await expect(gateway.reverseGeocode(POINT)).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
  });
});

describe('GoogleGeo: places', () => {
  const answer = {
    places: [
      { types: ['bakery'], displayName: { text: 'Corner Bakery' } },
      { types: ['route'], displayName: { text: 'Maple Avenue' } },
    ],
  };

  it('asks the Places API (New) with the key in a header and reads the names', async () => {
    const { gateway, calls } = geo([json(answer)]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({
      ok: true,
      value: ['Corner Bakery'],
    });
    const [call] = calls;
    expect(call?.url).toBe('https://places.googleapis.com/v1/places:searchNearby');
    expect(call?.url).not.toContain(KEY);
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toEqual({
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': KEY,
      'X-Goog-FieldMask': 'places.displayName,places.types',
    });
    expect(JSON.parse(call?.init.body ?? '')).toEqual({
      maxResultCount: 20,
      languageCode: 'en',
      locationRestriction: {
        circle: { center: { latitude: 40.4406, longitude: -79.9959 }, radius: 150 },
      },
    });
  });

  it('reads an answer without places as none', async () => {
    const { gateway } = geo([json({})]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({ ok: true, value: [] });
  });

  it('remembers a 403 for an hour, apart from the Geocoding API', async () => {
    const { gateway, calls, entries, clock } = geo([
      json({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403),
      json({ status: 'ZERO_RESULTS', results: [] }),
      json(answer),
    ]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toMatchObject({ reason: 'denied' });
    await expect(gateway.placesNear(POINT, 150)).resolves.toMatchObject({ reason: 'denied' });
    expect(calls).toHaveLength(1);
    expect(warnings(entries)).toHaveLength(1);
    // The other API is still asked.
    await expect(gateway.reverseGeocode(POINT)).resolves.toEqual({ ok: true, value: {} });
    clock.now += 3_599_999;
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({
      ok: false,
      reason: 'denied',
      retryInMs: 1,
    });
    clock.now += 1;
    await expect(gateway.placesNear(POINT, 150)).resolves.toMatchObject({ ok: true });
  });

  it('answers another status and a broken connection as a failure', async () => {
    const { gateway, entries } = geo([json({}, 500), new Error('socket hang up')]);
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({ ok: false, reason: 'failed' });
    await expect(gateway.placesNear(POINT, 150)).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(logged(entries)).toContain('HTTP 500');
    expect(logged(entries)).toContain('socket hang up');
  });
});

describe('GoogleGeo: short links', () => {
  const SHORT = 'https://maps.app.goo.gl/AbC123';
  const LONG =
    'https://www.google.com/maps/place/Big+Fountain/@40.5,-79.9,17z/data=!3d40.4406!4d-79.9959';

  it('gives the address a short link redirects to, without reading any body', async () => {
    const { gateway, calls, cancelledBodies } = geo([redirect(LONG)]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBe(LONG);
    expect(calls.map((call) => call.url)).toEqual([SHORT]);
    expect(calls[0]?.init).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(calls[0]?.init.headers).toBeUndefined();
    expect(cancelledBodies()).toBe(1);
  });

  it('follows on through addresses that say nothing yet, relative ones too', async () => {
    const { gateway, calls } = geo([
      redirect('https://maps.google.com/?cid=123', 301),
      redirect('/maps?cid=123&hl=en'),
      redirect(LONG, 307),
    ]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBe(LONG);
    expect(calls.map((call) => call.url)).toEqual([
      SHORT,
      'https://maps.google.com/?cid=123',
      'https://maps.google.com/maps?cid=123&hl=en',
    ]);
  });

  it.each([
    ['another host', 'https://consent.example.com/?continue=x'],
    ['a host that only looks like Google', 'https://www.google.com.evil.example/maps'],
    ['plain http', 'http://www.google.com/maps?cid=1'],
    ['another port', 'https://www.google.com:8443/maps?cid=1'],
    ['an address with a user in it', 'https://user@www.google.com/maps?cid=1'],
  ])('never requests %s', async (_what, address) => {
    const { gateway, calls } = geo([redirect(address), redirect(LONG)]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([SHORT]);
  });

  it('does not request a first address that is not a short link of the hosts it follows', async () => {
    const { gateway, calls } = geo([redirect(LONG)]);
    await expect(
      gateway.followShortLink('https://example.com/short', readable),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('gives up after five addresses', async () => {
    const hop = (n: number) => `https://www.google.com/maps?cid=${n}`;
    const { gateway, calls } = geo(Array.from({ length: 8 }, (_, n) => redirect(hop(n))));
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(calls).toHaveLength(MAX_LINK_HOPS);
  });

  it('gives up on an answer that is no redirect, or names no address', async () => {
    const page = geo([json('<html>', 200)]);
    await expect(page.gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(page.cancelledBodies()).toBe(1);
    const nowhere = geo([redirect(null)]);
    await expect(nowhere.gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    const garbled = geo([redirect('https://')]);
    await expect(garbled.gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
  });

  it('gives up when the hops together take longer than allowed', async () => {
    const { gateway, calls, entries } = geo([redirect('https://maps.google.com/?cid=1'), 'hang']);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    // One limit for the whole way: the second request got the signal of the first.
    expect(calls[1]?.init.signal).toBe(calls[0]?.init.signal);
    expect(entries.some((entry) => entry.msg === 'could not follow a short link')).toBe(true);
  });

  it('answers a broken connection as no address', async () => {
    const { gateway } = geo([new Error('getaddrinfo ENOTFOUND maps.app.goo.gl')]);
    await expect(gateway.followShortLink(SHORT, readable)).resolves.toBeUndefined();
  });
});
```

Apply to `src/services/gym-directory.test.ts`:

```diff
--- a/src/services/gym-directory.test.ts
+++ b/src/services/gym-directory.test.ts
@@ -154,4 +154,13 @@ describe('GymDirectory', () => {
     const { service } = directory();
     await expect(service.refreshGym(1)).rejects.toThrow('Gyms have not been loaded yet');
   });
+
+  it('lists every gym, as a list of its own', async () => {
+    const { service } = directory();
+    await service.load();
+    const all = service.all();
+    expect(all.map((gym) => gym.id).sort((a, b) => a - b)).toEqual(testGyms().map((gym) => gym.id));
+    all.length = 0;
+    expect(service.all()).toHaveLength(testGyms().length);
+  });
 });
```

Create `src/services/gym-upkeep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FAKE_ADDRESS, FakeGeoGateway } from '../../test/support/geo.js';
import { gymDirectoryWith, MemoryGyms } from '../../test/support/gym-store.js';
import { testRaid, testTrain } from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { metresBetween } from '../domain/geo/distance.js';
import type { Party, TrainParty } from '../domain/party/party.js';
import { GymUpkeep, type GymUpkeepOptions } from './gym-upkeep.js';

/** Gym 10 (Lakeview Trailhead) lies far from every other gym: what is put beside it is its nearest. */
const LONELY = 10;
const BESIDE_LONELY = { lat: 40.5009, lon: -80.05 };

async function upkeepWith(
  options: Partial<Omit<GymUpkeepOptions, 'parties'>> & { parties?: Party[] } = {},
) {
  const { gyms, directory } = await gymDirectoryWith();
  const geo = new FakeGeoGateway();
  const { log, entries } = createTestLogger();
  const changed: string[] = [];
  const timers: (() => void)[] = [];
  /** How long each timer of the line was set for, in order. */
  const waits: number[] = [];
  const { parties = [], ...rest } = options;
  const upkeep = new GymUpkeep({
    gyms,
    directory,
    geo,
    parties: { active: () => parties },
    posts: { changed: (partyId) => changed.push(partyId) },
    log,
    // A test fires the timer of the line by hand, or calls `flush`.
    setTimer: (run, ms) => {
      timers.push(run);
      waits.push(ms);
      return () => {
        const index = timers.indexOf(run);
        if (index >= 0) timers.splice(index, 1);
      };
    },
    ...rest,
  });
  /** A gym as gym administration adds one: the row, then the directory. */
  const add = async (lat: number, lon: number, name = 'New Gym') => {
    const created = await gyms.create({ name, lat, lon });
    await directory.refreshGym(created.id);
    return created.id;
  };
  return { upkeep, gyms, directory, geo, entries, changed, timers, waits, add };
}

const onRoute = (train: TrainParty, route: number[]): TrainParty => ({
  ...train,
  train: { ...train.train, route },
});

describe('GymUpkeep.gymChanged', () => {
  it('reads the gym again and has every party that shows it rendered anew', async () => {
    const raidThere = testRaid({ id: '00000000-0000-4000-8000-000000000011', gymId: 2 });
    const raidElsewhere = testRaid({ id: '00000000-0000-4000-8000-000000000012', gymId: 3 });
    const trainThrough = onRoute(testTrain({ id: '00000000-0000-4000-8000-000000000013' }), [1, 2]);
    const trainElsewhere = onRoute(testTrain({ id: '00000000-0000-4000-8000-000000000014' }), [3]);
    const { upkeep, gyms, directory, changed } = await upkeepWith({
      parties: [raidThere, raidElsewhere, trainThrough, trainElsewhere],
    });
    await gyms.update(2, { notice: 'Closed for repairs' });
    expect(directory.get(2)?.notice).toBeNull();

    const gym = await upkeep.gymChanged(2);

    expect(gym?.notice).toBe('Closed for repairs');
    expect(directory.get(2)?.notice).toBe('Closed for repairs');
    expect(changed).toEqual([raidThere.id, trainThrough.id]);
  });

  it('answers undefined for a gym that is gone, and still tells the posts', async () => {
    const raidThere = testRaid({ gymId: 2 });
    const { upkeep, gyms, directory, changed } = await upkeepWith({ parties: [raidThere] });
    await gyms.delete(2);
    await expect(upkeep.gymChanged(2)).resolves.toBeUndefined();
    expect(directory.get(2)).toBeUndefined();
    expect(changed).toEqual([raidThere.id]);
  });

  it('is not stopped by posts that cannot be told', async () => {
    const { upkeep, entries } = await upkeepWith({
      parties: [testRaid({ gymId: 2 })],
      posts: {
        changed: () => {
          throw new Error('no posts');
        },
      },
    });
    await expect(upkeep.gymChanged(2)).resolves.toMatchObject({ id: 2 });
    expect(entries.some((entry) => entry.level === 40)).toBe(true);
  });
});

describe('GymUpkeep.placed', () => {
  it('writes the nearest gyms of the gyms concerned, and of no others', async () => {
    const { upkeep, gyms, directory, add } = await upkeepWith();
    const before = directory.get(LONELY)?.nearestGym;
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    gyms.writes.length = 0;

    await upkeep.placed(id);

    expect(before).not.toBe(id);
    expect(gyms.written('nearestGym')).toEqual([
      [LONELY, id],
      [id, LONELY],
    ]);
    expect(directory.get(id)?.nearestGym).toBe(LONELY);
    expect(directory.get(LONELY)?.nearestGym).toBe(id);
    await upkeep.flush();
  });

  it('asks about the new gym on the side and lets the gym beside it wait for its places', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);

    await upkeep.placed(id);
    // The line: the lonely gym, whose circle is now half the way to the new one.
    expect(upkeep.waiting).toBe(1);

    await upkeep.flush();
    expect(upkeep.waiting).toBe(0);
    const lonely = directory.get(LONELY);
    if (!lonely) throw new Error('no gym');
    const half = metresBetween(lonely, BESIDE_LONELY) / 2;
    expect(half).toBeGreaterThan(25);
    expect(geo.questions('geocode').map((asked) => asked.point)).toEqual([BESIDE_LONELY]);
    // Each is asked about once, in a circle of half the way to the other.
    const places = geo.questions('places');
    expect(places).toHaveLength(2);
    expect(places).toEqual(
      expect.arrayContaining([
        { what: 'places', point: BESIDE_LONELY, radius: half },
        { what: 'places', point: { lat: lonely.lat, lon: lonely.lon }, radius: half },
      ]),
    );
    expect(gyms.row(id)).toMatchObject({
      geodata: JSON.stringify({ addressComponents: FAKE_ADDRESS }),
      places: 'Corner Bakery Maple Dental',
    });
    // The directory has what was written: the gym is found by it.
    expect(directory.search(null, 'corner bakery').map((hit) => hit.gym.id)).toContain(id);
    expect(directory.get(LONELY)?.places).toBe('Corner Bakery Maple Dental');
  });

  it('asks about one gym of the line at every turn of the timer', async () => {
    const { upkeep, geo, timers, add } = await upkeepWith();
    // Two gyms get a nearer neighbour: the lonely one and the one put beside it first.
    const first = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(first);
    await upkeep.flush();
    geo.asked.length = 0;
    const second = await add(40.50045, -80.05, 'Between');
    await upkeep.placed(second);
    expect(upkeep.waiting).toBe(2);
    expect(timers).toHaveLength(1);

    const places = (): number => geo.questions('places').length;
    // The new gym itself is asked about at once; the line waits for the timer.
    await expect.poll(places).toBe(1);
    timers.shift()?.();
    await expect.poll(places).toBe(2);
    await expect.poll(() => timers.length).toBe(1);
    expect(upkeep.waiting).toBe(1);
    timers.shift()?.();
    await expect.poll(places).toBe(3);
    await upkeep.flush();
    // The line is empty: no timer is left.
    expect(timers).toHaveLength(0);
    expect(places()).toBe(3);
  });

  it('lets the gyms that keep a moved gym as their nearest wait for their places too', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    geo.asked.length = 0;
    gyms.writes.length = 0;

    // A little further away: each is still the other's nearest, but the circles are larger.
    await gyms.update(id, { lat: 40.502 });
    await directory.refreshGym(id);
    await upkeep.placed(id);
    await upkeep.flush();

    expect(gyms.written('nearestGym')).toEqual([]);
    const asked = geo.questions('places').map((question) => question.point.lat);
    expect(asked.sort()).toEqual([40.5, 40.502]);
    expect(geo.questions('geocode').map((question) => question.point.lat)).toEqual([40.502]);
  });

  it('writes the nearest gyms without an API key, and asks nothing', async () => {
    const { upkeep, gyms, geo, add } = await upkeepWith();
    geo.enabled = false;
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    expect(upkeep.fetches).toBe(false);
    expect(upkeep.waiting).toBe(0);
    await upkeep.flush();
    expect(gyms.row(id)).toMatchObject({ nearestGym: LONELY, geodata: null, places: null });
    expect(geo.asked).toEqual([]);
  });

  it('never rejects: a write that fails is logged', async () => {
    const { upkeep, gyms, entries, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    gyms.failing = new Error('database is down');
    await expect(upkeep.placed(id)).resolves.toBeUndefined();
    await upkeep.flush();
    expect(
      entries.some((entry) => entry.msg === 'could not bring the nearest gyms up to date'),
    ).toBe(true);
  });
});

describe('GymUpkeep.removed', () => {
  it('gives the gyms that pointed at a deleted gym another nearest one', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    const others = directory.all().filter((gym) => gym.id !== LONELY && gym.id !== id);
    const lonely = directory.get(LONELY);
    if (!lonely) throw new Error('no gym');
    const expected = others.sort((a, b) => metresBetween(lonely, a) - metresBetween(lonely, b))[0]
      ?.id;
    gyms.writes.length = 0;
    geo.asked.length = 0;

    await gyms.delete(id);
    await directory.refreshGym(id);
    await upkeep.removed(id);

    expect(gyms.written('nearestGym')).toEqual([[LONELY, expected]]);
    expect(directory.get(LONELY)?.nearestGym).toBe(expected);
    expect(upkeep.waiting).toBe(1);
    await upkeep.flush();
    // Far from everything again: the largest circle.
    expect(geo.questions('places')).toEqual([
      { what: 'places', point: { lat: lonely.lat, lon: lonely.lon }, radius: 500 },
    ]);
  });

  it('takes a deleted gym out of the line', async () => {
    const { upkeep, gyms, directory, geo, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    expect(upkeep.waiting).toBe(1);
    await gyms.delete(LONELY);
    await directory.refreshGym(LONELY);
    await upkeep.removed(LONELY);
    await upkeep.flush();
    expect(geo.questions('places').some((asked) => asked.point.lat === 40.5)).toBe(false);
  });
});

describe('GymUpkeep.refresh', () => {
  it('asks about a gym now and says what it got', async () => {
    const { upkeep, gyms, geo } = await upkeepWith();
    geo.addresses.set('40.06,-80.06', { route: 'Market St', locality: 'Pinewood' });
    geo.placesAt.set('40.06,-80.06', ['Riverside Plaza', 'Cafe Luna']);

    const first = await upkeep.refresh(2);
    expect(first).toMatchObject({ geodata: 'updated', places: 'updated' });
    expect(first?.gym).toMatchObject({
      id: 2,
      geodata: '{"addressComponents":{"route":"Market St","locality":"Pinewood"}}',
      places: 'Riverside Plaza Cafe Luna',
    });
    expect(gyms.row(2)?.places).toBe('Riverside Plaza Cafe Luna');

    gyms.writes.length = 0;
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'unchanged',
      places: 'unchanged',
    });
    expect(gyms.writes).toEqual([]);
  });

  it('writes nothing for a place Google knows nothing of', async () => {
    const { upkeep, gyms, geo } = await upkeepWith();
    geo.addresses.set('40.06,-80.06', {});
    geo.placesAt.set('40.06,-80.06', []);
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'updated',
      places: 'updated',
    });
    expect(gyms.row(2)).toMatchObject({ geodata: null, places: null });
  });

  it.each(['no-key', 'denied', 'failed'] as const)(
    'keeps what the gym had when Google answers %s',
    async (reason) => {
      const { upkeep, gyms, geo } = await upkeepWith();
      const before = gyms.row(2);
      geo.failing = { geocode: reason, places: reason };
      gyms.writes.length = 0;
      await expect(upkeep.refresh(2)).resolves.toMatchObject({ geodata: reason, places: reason });
      expect(gyms.writes).toEqual([]);
      expect(gyms.row(2)).toEqual(before);
    },
  );

  it('says each of the two by itself', async () => {
    const { upkeep, geo } = await upkeepWith();
    geo.failing = { places: 'denied' };
    await expect(upkeep.refresh(2)).resolves.toMatchObject({
      geodata: 'updated',
      places: 'denied',
    });
  });

  it('answers undefined for a gym that is not there, or goes while Google is asked', async () => {
    const { upkeep, gyms, directory, geo } = await upkeepWith();
    await expect(upkeep.refresh(999)).resolves.toBeUndefined();
    let release: () => void = () => undefined;
    geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    const refreshing = upkeep.refresh(2);
    await gyms.delete(2);
    await directory.refreshGym(2);
    release();
    await expect(refreshing).resolves.toBeUndefined();
    expect(gyms.written('geodata')).toEqual([]);
  });

  it('does not write the address of the place a gym has left meanwhile', async () => {
    const { upkeep, gyms, directory, geo } = await upkeepWith();
    geo.addresses.set('40.06,-80.06', { route: 'Old St' });
    geo.addresses.set('40.061,-80.06', { route: 'New St' });
    let release: () => void = () => undefined;
    geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    // Asked about where it is, then moved (as gym administration moves it) before the answer.
    const refreshing = upkeep.refresh(2);
    await gyms.update(2, { lat: 40.061 });
    await directory.refreshGym(2);
    await upkeep.placed(2);
    release();
    geo.hold = undefined;
    await expect(refreshing).resolves.toMatchObject({ geodata: 'unchanged' });
    await upkeep.flush();
    expect(gyms.written('geodata')).toEqual([[2, '{"addressComponents":{"route":"New St"}}']]);
  });

  it('rejects when what it got cannot be written', async () => {
    const { upkeep, gyms } = await upkeepWith();
    gyms.failing = new Error('database is down');
    await expect(upkeep.refresh(2)).rejects.toThrow('database is down');
  });
});

describe('GymUpkeep: answers that come late, and an API that is denied', () => {
  it('does not let an older answer about places overwrite a newer one', async () => {
    const { upkeep, gyms, geo } = await upkeepWith();
    geo.placesAt.set('40.06,-80.06', ['Old Cafe']);
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    // The first question is on its way, with the answer of that moment.
    const older = upkeep.refresh(2);
    await expect.poll(() => geo.questions('places').length).toBe(1);
    geo.placesAt.set('40.06,-80.06', ['New Cafe']);
    await expect(upkeep.refresh(2)).resolves.toMatchObject({ places: 'updated' });
    expect(gyms.row(2)?.places).toBe('New Cafe');

    release();
    await expect(older).resolves.toMatchObject({ places: 'unchanged' });
    expect(gyms.row(2)?.places).toBe('New Cafe');
    expect(gyms.written('places')).toEqual([[2, 'New Cafe']]);
  });

  it('drops an answer about places that was asked for before the nearest gym changed', async () => {
    const { upkeep, gyms, geo, add } = await upkeepWith();
    let release: () => void = () => undefined;
    geo.holdPlaces.push(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    geo.placesAt.set('40.5,-80.05', ['Wide Circle Cafe']);
    // Asked while the lonely gym has no gym near it: the largest circle.
    const early = upkeep.refresh(LONELY);
    await expect.poll(() => geo.questions('places').length).toBe(1);
    geo.placesAt.set('40.5,-80.05', ['Small Circle Cafe']);
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    // The gym is asked about again, in its new circle, and that answer comes first.
    const flushing = upkeep.flush();
    await expect.poll(() => gyms.row(LONELY)?.places).toBe('Small Circle Cafe');
    release();
    await flushing;
    await expect(early).resolves.toMatchObject({ places: 'unchanged' });
    expect(gyms.row(LONELY)?.places).toBe('Small Circle Cafe');
  });

  it('keeps the line while the API is denied, and waits until it may be asked again', async () => {
    const { upkeep, gyms, geo, timers, waits, add } = await upkeepWith({ placesEveryMs: 5_000 });
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await expect.poll(() => geo.questions('places').length).toBe(1);
    expect(waits).toEqual([5_000]);
    geo.failing = { places: 'denied' };
    geo.retryInMs = 1_800_000;

    timers.shift()?.();
    await expect.poll(() => timers.length).toBe(1);
    // The gym still waits, and the next look is when the denial is over.
    expect(upkeep.waiting).toBe(1);
    expect(waits).toEqual([5_000, 1_800_000]);
    expect(gyms.row(LONELY)?.places).toBeNull();

    geo.failing = {};
    timers.shift()?.();
    await expect.poll(() => upkeep.waiting).toBe(0);
    await upkeep.flush();
    expect(gyms.row(LONELY)?.places).toBe('Corner Bakery Maple Dental');
  });

  it('does not spin on a denied API when everything is flushed', async () => {
    const { upkeep, geo, add } = await upkeepWith();
    geo.failing = { places: 'denied' };
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    expect(upkeep.waiting).toBe(2);
    await upkeep.stop();
  });

  it('lets the new gym itself wait for its places when the API is denied', async () => {
    const { upkeep, gyms, geo, add } = await upkeepWith();
    geo.failing = { places: 'denied' };
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    await upkeep.placed(id);
    await upkeep.flush();
    // Its address came; its places wait in the line with those of the gym beside it.
    expect(gyms.row(id)?.geodata).not.toBeNull();
    expect(gyms.row(id)?.places).toBeNull();
    expect(upkeep.waiting).toBe(2);
    geo.failing = {};
    await upkeep.flush();
    expect(upkeep.waiting).toBe(0);
    expect(gyms.row(id)?.places).toBe('Corner Bakery Maple Dental');
    expect(gyms.row(LONELY)?.places).toBe('Corner Bakery Maple Dental');
  });
});

describe('GymUpkeep.stop', () => {
  it('forgets the line and waits for what is on its way', async () => {
    const { upkeep, gyms, geo, timers, add } = await upkeepWith();
    const id = await add(BESIDE_LONELY.lat, BESIDE_LONELY.lon);
    let release: () => void = () => undefined;
    geo.hold = new Promise((resolve) => {
      release = resolve;
    });
    await upkeep.placed(id);
    expect(upkeep.waiting).toBe(1);

    let stopped = false;
    const stopping = upkeep.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopped).toBe(false);
    expect(upkeep.waiting).toBe(0);
    expect(timers).toHaveLength(0);
    release();
    await stopping;
    // The gym that was being asked about got its answer; the one in the line was not asked.
    expect(gyms.row(id)?.places).toBe('Corner Bakery Maple Dental');
    expect(geo.questions('places')).toHaveLength(1);

    // And nothing is queued or asked from now on.
    geo.asked.length = 0;
    await upkeep.placed(id);
    expect(upkeep.waiting).toBe(0);
    await upkeep.stop();
    await new Promise((resolve) => setImmediate(resolve));
    expect(geo.asked).toEqual([]);
  });
});

describe('MemoryGyms', () => {
  it('starts with the invented gyms, each with its nearest', async () => {
    const gyms = new MemoryGyms();
    const all = await gyms.listAll();
    expect(all).toHaveLength(12);
    expect(all.every((gym) => gym.nearestGym !== null && gym.nearestGym !== gym.id)).toBe(true);
  });
});
```

Create `test/support/geo.ts`:

```ts
import type { AddressComponents } from '../../src/domain/geo/google.js';
import type { LatLon } from '../../src/domain/geo/lat-lon.js';
import type {
  GeoAnswer,
  GeoFailure,
  GeoGateway,
  GeoRefusal,
} from '../../src/services/geo-gateway.js';

/** What a fake geocoding gives for a point unless a test says otherwise. */
export const FAKE_ADDRESS: AddressComponents = { route: 'Test Road', locality: 'Pinewood' };
/** The places the fake finds near a point unless a test says otherwise. */
export const FAKE_PLACES: readonly string[] = ['Corner Bakery', 'Maple Dental'];

const key = (point: LatLon): string => `${point.lat},${point.lon}`;

/**
 * Google and the short links as a test wants them: nothing leaves the process. Every point has
 * the address `FAKE_ADDRESS` and the places `FAKE_PLACES` unless `addresses` or `placesAt` say
 * otherwise for it (by `"lat,lon"`); `failing` makes a question answer that failure; `links`
 * says where a short link leads. Every question is recorded in `asked`, in order. Like the real
 * one it never throws and never answers in the same turn of the event loop, and its answer is
 * what the place had when the question was asked. `hold` makes every question from then on wait
 * for that promise; `holdPlaces` holds the next questions about places, one promise each (for
 * an older answer that arrives after a newer one). A denied API says when to ask again
 * (`retryInMs`).
 */
export class FakeGeoGateway implements GeoGateway {
  enabled = true;
  failing: { geocode?: GeoFailure; places?: GeoFailure } = {};
  hold: Promise<void> | undefined;
  readonly holdPlaces: Promise<void>[] = [];
  retryInMs = 3_600_000;
  readonly addresses = new Map<string, AddressComponents>();
  readonly placesAt = new Map<string, string[]>();
  readonly links = new Map<string, string>();
  readonly asked: Array<
    | { what: 'geocode'; point: LatLon }
    | { what: 'places'; point: LatLon; radius: number }
    | { what: 'link'; url: string }
  > = [];

  private async answer<T>(value: () => T, held?: Promise<void>): Promise<T> {
    // Decided when asked, as Google would: what changes while the answer is on its way is not in it.
    const decided = value();
    await this.hold;
    await held;
    return new Promise((resolve) => {
      setImmediate(() => {
        resolve(decided);
      });
    });
  }

  private refusal(reason: GeoFailure): GeoRefusal {
    return reason === 'denied'
      ? { ok: false, reason, retryInMs: this.retryInMs }
      : { ok: false, reason };
  }

  /** The questions of one kind, in order. */
  questions<W extends 'geocode' | 'places' | 'link'>(what: W) {
    return this.asked.filter(
      (question): question is Extract<(typeof this.asked)[number], { what: W }> =>
        question.what === what,
    );
  }

  reverseGeocode(point: LatLon): Promise<GeoAnswer<AddressComponents>> {
    return this.answer(() => {
      const reason = this.enabled ? this.failing.geocode : 'no-key';
      if (reason) return this.refusal(reason);
      this.asked.push({ what: 'geocode', point: { lat: point.lat, lon: point.lon } });
      return { ok: true, value: { ...(this.addresses.get(key(point)) ?? FAKE_ADDRESS) } };
    });
  }

  placesNear(point: LatLon, radiusMetres: number): Promise<GeoAnswer<string[]>> {
    return this.answer(() => {
      const reason = this.enabled ? this.failing.places : 'no-key';
      if (reason) return this.refusal(reason);
      this.asked.push({
        what: 'places',
        point: { lat: point.lat, lon: point.lon },
        radius: radiusMetres,
      });
      return { ok: true, value: [...(this.placesAt.get(key(point)) ?? FAKE_PLACES)] };
    }, this.holdPlaces.shift());
  }

  followShortLink(
    url: string,
    readable: (address: string) => boolean,
  ): Promise<string | undefined> {
    return this.answer(() => {
      this.asked.push({ what: 'link', url });
      const address = this.links.get(url);
      return address !== undefined && readable(address) ? address : undefined;
    });
  }
}
```

Create `test/support/gym-store.ts`:

```ts
import type {
  Gym,
  GymPatch,
  GymStorage,
  NewGym,
} from '../../src/db/repositories/gym-repository.js';
import { loadSettings } from '../../src/config/settings.js';
import { GymDirectory } from '../../src/services/gym-directory.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import { nearestTo } from '../../src/domain/geo/distance.js';
import { testGyms, testRegions } from './gyms.js';
import { createTestLogger } from './test-logger.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';

/**
 * The invented gyms with the nearest gym of each as the upkeep keeps it: as in production,
 * where every gym has one.
 */
export function settledTestGyms(): Gym[] {
  const gyms = testGyms();
  return gyms.map((gym) => ({ ...gym, nearestGym: nearestTo(gym, gyms)?.place.id ?? null }));
}

/**
 * The gyms kept in memory as `GymRepository` keeps them, whose behaviour
 * gym-repository.db.test.ts pins down: `create` gives the next id, `update` changes only the
 * fields of the patch and answers undefined for a gym that is not there, keywords are stored
 * lower case and trimmed. It starts with the invented gyms (`settledTestGyms`) unless told
 * otherwise.
 *
 * `writes` records every change in order. Set `failing` to make every call reject, and `hold`
 * to a promise to make every call from then on wait for it (a test that needs something to
 * happen while a write is on its way).
 */
export class MemoryGyms implements GymStorage {
  failing: Error | undefined;
  hold: Promise<void> | undefined;
  readonly writes: Array<
    | { what: 'create'; id: number }
    | { what: 'update'; id: number; patch: GymPatch }
    | { what: 'delete'; id: number }
  > = [];
  private readonly rows = new Map<number, Gym>();
  private nextId: number;

  constructor(gyms: readonly Gym[] = settledTestGyms()) {
    for (const gym of gyms) this.rows.set(gym.id, { ...gym });
    this.nextId = Math.max(0, ...gyms.map((gym) => gym.id)) + 1;
  }

  private async attempt<T>(work: () => T): Promise<T> {
    await this.hold;
    return new Promise((resolve, reject) => {
      // Like a real query, the answer never comes in the same turn of the event loop.
      setImmediate(() => {
        if (this.failing) reject(this.failing);
        else resolve(work());
      });
    });
  }

  /** The row as it is, without waiting: for what a test asserts. */
  row(id: number): Gym | undefined {
    const gym = this.rows.get(id);
    return gym && { ...gym, keywords: [...gym.keywords] };
  }

  /** The changes to one column that were written, as `[gym id, value]`, in order. */
  written<K extends keyof GymPatch>(field: K): [number, GymPatch[K]][] {
    return this.writes.flatMap((write) =>
      write.what === 'update' && field in write.patch
        ? [[write.id, write.patch[field]] as [number, GymPatch[K]]]
        : [],
    );
  }

  get(id: number): Promise<Gym | undefined> {
    return this.attempt(() => this.row(id));
  }

  listAll(): Promise<Gym[]> {
    return this.attempt(() =>
      [...this.rows.keys()]
        .sort((a, b) => a - b)
        .flatMap((id) => {
          const gym = this.row(id);
          return gym ? [gym] : [];
        }),
    );
  }

  create(gym: NewGym): Promise<Gym> {
    return this.attempt(() => {
      const id = this.nextId++;
      const created: Gym = {
        id,
        pogoId: gym.pogoId ?? null,
        name: gym.name,
        lat: gym.lat,
        lon: gym.lon,
        nickname: gym.nickname ?? null,
        description: gym.description ?? null,
        keywords: [],
        notice: null,
        taggedEx: false,
        confirmedEx: false,
        imageUrl: null,
        sponsor: null,
        geodata: null,
        places: null,
        nearestGym: null,
      };
      this.rows.set(id, created);
      this.writes.push({ what: 'create', id });
      return { ...created };
    });
  }

  update(id: number, patch: GymPatch): Promise<Gym | undefined> {
    return this.attempt(() => {
      const gym = this.rows.get(id);
      if (!gym) return undefined;
      const defined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ) as GymPatch;
      const keywords = defined.keywords
        ?.map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword !== '');
      this.rows.set(id, { ...gym, ...defined, ...(keywords ? { keywords } : {}) });
      this.writes.push({ what: 'update', id, patch: defined });
      return this.row(id);
    });
  }

  delete(id: number): Promise<boolean> {
    return this.attempt(() => {
      const existed = this.rows.delete(id);
      if (existed) this.writes.push({ what: 'delete', id });
      return existed;
    });
  }
}

/**
 * A real `GymDirectory` over gyms in memory and the invented regions, loaded: what gym
 * administration changes shows in it after `refreshGym`, as in the bot. `regions` are the rows
 * the directory sorts the gyms by (a test that changes them calls `directory.load()`).
 */
export async function gymDirectoryWith(
  gyms: MemoryGyms = new MemoryGyms(),
  regions: { rows: Region[] } = { rows: testRegions() },
) {
  const { log } = createTestLogger();
  const directory = new GymDirectory({
    gyms,
    regions: { listAll: () => Promise.resolve(regions.rows) },
    ignoredWords: loadSettings(TEST_SETTINGS_PATH).blacklistWords,
    log,
  });
  await directory.load();
  return { gyms, directory, regions };
}
```

Run: `npx vitest run --project unit src/domain/geo/google.test.ts src/services/geo-gateway.test.ts src/services/gym-directory.test.ts src/services/gym-upkeep.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/db/repositories/gym-repository.ts`:

```diff
--- a/src/db/repositories/gym-repository.ts
+++ b/src/db/repositories/gym-repository.ts
@@ -157,8 +157,19 @@ function metaColumns(patch: GymPatch): Updateable<DB['GymMeta']> {
   return columns;
 }
 
+/** What gym administration needs of the tables; lets tests keep the gyms in memory. */
+export interface GymStorage {
+  get(id: number): Promise<Gym | undefined>;
+  listAll(): Promise<Gym[]>;
+  create(gym: NewGym): Promise<Gym>;
+  /** Undefined, having written nothing, when there is no such gym. */
+  update(id: number, patch: GymPatch): Promise<Gym | undefined>;
+  /** False when there was no such gym. */
+  delete(id: number): Promise<boolean>;
+}
+
 /** The Gym and GymMeta tables. Gyms without coordinates are invisible to the bot. */
-export class GymRepository {
+export class GymRepository implements GymStorage {
   constructor(private readonly db: Kysely<DB>) {}
 
   private select() {
```

Create `src/domain/geo/google.ts`:

```ts
import type { LatLon } from './lat-lon.js';

/**
 * Reading what Google's Geocoding API and Places API (New) answer, and asking the latter. Pure:
 * the requests themselves are made by `GoogleGeo` (`src/services/geo-gateway.ts`).
 */

/** The parts of an address by their type, each with its short names joined by spaces. */
export type AddressComponents = Record<string, string>;

/**
 * What a Geocoding answer says. `ok`: the address parts of the point (none when Google knows
 * nothing there). `denied`: the key may not use the API. `failed`: anything else, with what
 * Google called it.
 */
export type GeocodeReading =
  | { kind: 'ok'; components: AddressComponents }
  | { kind: 'denied'; message: string }
  | { kind: 'failed'; status: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * The address parts of a reverse geocoding answer, as the legacy bot kept them: every type
 * (lower case) of every address component of every result collects the distinct short names of
 * its components, in the order Google gave them, joined by spaces.
 */
export function readGeocode(body: unknown): GeocodeReading {
  if (!isRecord(body)) return { kind: 'failed', status: 'not an answer' };
  const status = typeof body.status === 'string' ? body.status : 'no status';
  if (status === 'ZERO_RESULTS') return { kind: 'ok', components: {} };
  if (status === 'REQUEST_DENIED') {
    const message = typeof body.error_message === 'string' ? body.error_message : status;
    return { kind: 'denied', message };
  }
  if (status !== 'OK') return { kind: 'failed', status };
  const names = new Map<string, string[]>();
  for (const result of Array.isArray(body.results) ? body.results : []) {
    if (!isRecord(result) || !Array.isArray(result.address_components)) continue;
    for (const component of result.address_components) {
      if (!isRecord(component) || typeof component.short_name !== 'string') continue;
      const name = component.short_name.trim();
      if (name === '') continue;
      for (const type of strings(component.types)) {
        const key = type.toLowerCase();
        const known = names.get(key) ?? [];
        if (!known.includes(name)) known.push(name);
        names.set(key, known);
      }
    }
  }
  const components: AddressComponents = {};
  for (const [type, known] of names) components[type] = known.join(' ');
  return { kind: 'ok', components };
}

/**
 * The address parts as `GymMeta.geodata` holds them (`{"addressComponents": {…}}`, which
 * `addressText` and the legacy bot read); null when there are none.
 */
export function geodataJson(components: AddressComponents): string | null {
  return Object.keys(components).length === 0
    ? null
    : JSON.stringify({ addressComponents: components });
}

/**
 * The address parts of a stored geocoding result, type by type, for showing them. Empty for
 * text that is missing, is not JSON or has another shape.
 */
export function geodataParts(geodata: string | null): { type: string; value: string }[] {
  if (!geodata) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(geodata);
  } catch {
    return [];
  }
  const components = isRecord(parsed) ? parsed.addressComponents : undefined;
  if (!isRecord(components)) return [];
  return Object.entries(components).flatMap(([type, value]) => {
    const text = typeof value === 'string' ? value : strings(value).join(' ');
    return text.trim() === '' ? [] : [{ type, value: text }];
  });
}

/**
 * The kinds of place whose names help to find a gym: the legacy bot's list (`evaluatePlace`).
 * A place is kept when one of its types is among them.
 */
export const PLACE_TYPES: ReadonlySet<string> = new Set(
  (
    'accounting airport amusement_park aquarium art_gallery atm bakery bank bar beauty_salon ' +
    'bicycle_store book_store bowling_alley bus_station cafe campground car_dealer car_rental ' +
    'car_repair car_wash casino cemetery church city_hall clothing_store convenience_store ' +
    'courthouse dentist department_store doctor electrician electronics_store embassy ' +
    'establishment finance fire_station florist food funeral_home furniture_store gas_station ' +
    'general_contractor grocery_or_supermarket gym hair_care hardware_store health hindu_temple ' +
    'home_goods_store hospital insurance_agency jewelry_store laundry lawyer library ' +
    'liquor_store local_government_office locksmith lodging meal_delivery meal_takeaway mosque ' +
    'movie_rental movie_theater moving_company museum night_club painter park parking pet_store ' +
    'pharmacy physiotherapist place_of_worship plumber police post_office real_estate_agency ' +
    'restaurant roofing_contractor rv_park school shoe_store shopping_mall spa stadium storage ' +
    'store subway_station synagogue taxi_stand train_station travel_agency university ' +
    'veterinary_care zoo'
  ).split(' '),
);

/** Where the Places API (New) answers a Nearby Search. */
export const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';
/** The fields asked for: the name and the types, nothing that costs more. */
export const PLACES_FIELD_MASK = 'places.displayName,places.types';
/** Where the Geocoding API answers. */
export const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

/** The body of a Nearby Search around a point: the twenty places Google ranks first, in English. */
export function placesRequest(point: LatLon, radiusMetres: number): unknown {
  return {
    maxResultCount: 20,
    languageCode: 'en',
    locationRestriction: {
      circle: { center: { latitude: point.lat, longitude: point.lon }, radius: radiusMetres },
    },
  };
}

/**
 * The names of the places of a Nearby Search answer that are of a kind worth keeping
 * (`PLACE_TYPES`), each once, in Google's order. An answer without places has none.
 */
export function readPlaces(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.places)) return [];
  const names: string[] = [];
  for (const place of body.places) {
    if (!isRecord(place) || !isRecord(place.displayName)) continue;
    const text = place.displayName.text;
    if (typeof text !== 'string') continue;
    const name = text.replace(/\s+/g, ' ').trim();
    if (name === '' || names.includes(name)) continue;
    if (strings(place.types).some((type) => PLACE_TYPES.has(type))) names.push(name);
  }
  return names;
}

/** The names as `GymMeta.places` holds them: joined by spaces; null for none. */
export function placesText(names: readonly string[]): string | null {
  return names.length === 0 ? null : names.join(' ');
}

/** The smallest and the largest circle places are looked for in, in metres. */
export const PLACES_RADIUS = { min: 25, max: 500 } as const;

/**
 * How far around a gym places are looked for: half the way to the nearest other gym, so that a
 * place counts for the gym it is nearest to, but never less than `min` or more than `max`
 * metres; `max` when there is no other gym.
 */
export function placesRadius(nearestMetres: number | undefined): number {
  if (nearestMetres === undefined || !Number.isFinite(nearestMetres)) return PLACES_RADIUS.max;
  return Math.min(PLACES_RADIUS.max, Math.max(PLACES_RADIUS.min, nearestMetres / 2));
}
```

Apply to `src/domain/search/gym-lookup.ts`:

```diff
--- a/src/domain/search/gym-lookup.ts
+++ b/src/domain/search/gym-lookup.ts
@@ -70,6 +70,11 @@ export class GymLookup<G extends LocatedGym> {
     return this.index.get(id);
   }
 
+  /** Every gym, in no particular order (a new list). */
+  all(): G[] {
+    return this.index.all();
+  }
+
   /** Whether the channel is a region with an outline. */
   isRegion(channelId: string): boolean {
     return this.regions.some((region) => region.channelId === channelId && region.bounds !== null);
```

Create `src/services/geo-gateway.ts`:

```ts
import {
  GEOCODE_ENDPOINT,
  PLACES_ENDPOINT,
  PLACES_FIELD_MASK,
  placesRequest,
  readGeocode,
  readPlaces,
  type AddressComponents,
} from '../domain/geo/google.js';
import type { LatLon } from '../domain/geo/lat-lon.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';

/**
 * Why Google gave nothing. `no-key`: no API key is configured. `denied`: the key may not use
 * that API (it is not asked again for a while). `failed`: anything else; it was logged.
 */
export type GeoFailure = 'no-key' | 'denied' | 'failed';

export type GeoAnswer<T> = { ok: true; value: T } | GeoRefusal;

/** Nothing came; for `denied`, `retryInMs` says how long that API is still left alone. */
export interface GeoRefusal {
  ok: false;
  reason: GeoFailure;
  retryInMs?: number;
}

/**
 * What gym administration asks of the outside world: Google, about a point, and the address a
 * short link leads to. Nothing here throws: a failure is an answer. Tests use `FakeGeoGateway`
 * (`test/support/geo.ts`); nothing in a test touches the network.
 */
export interface GeoGateway {
  /** False when no Google API key is configured: both questions then answer `no-key`. */
  readonly enabled: boolean;
  /** The address parts of a point (none when Google knows nothing there). */
  reverseGeocode(point: LatLon): Promise<GeoAnswer<AddressComponents>>;
  /** The names of the places within `radiusMetres` of a point that are worth keeping. */
  placesNear(point: LatLon, radiusMetres: number): Promise<GeoAnswer<string[]>>;
  /**
   * The address a short link of the Maps app leads to: the first address on its way that
   * `readable` accepts. Undefined when it leads to none, or could not be followed.
   */
  followShortLink(url: string, readable: (address: string) => boolean): Promise<string | undefined>;
}

/** What is used of an answer: never its body as text, and of a redirect not even that. */
export interface GeoResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  body?: { cancel(): Promise<void> } | null;
}

export type GeoFetch = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    redirect: 'manual' | 'error';
    signal: AbortSignal;
  },
) => Promise<GeoResponse>;

export interface GoogleGeoOptions {
  /** `GOOGLE_API_KEY`; without it nothing is asked of Google. */
  apiKey: string | undefined;
  fetch: GeoFetch;
  log: Logger;
  now?: () => number;
  /** How long one question to Google may take. Default ten seconds. */
  timeoutMs?: number;
  /** How long following a short link may take, all its hops together. Default five seconds. */
  linkTimeoutMs?: number;
  /** How long an API that refused the key is not asked again. Default an hour. */
  deniedForMs?: number;
}

/** The only hosts a short link is ever followed to. */
const LINK_HOSTS: ReadonlySet<string> = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'google.com',
  'www.google.com',
  'maps.google.com',
]);
/** A short link is followed over at most this many addresses. */
export const MAX_LINK_HOPS = 5;

type Api = 'geocoding' | 'places';

/**
 * Google's Geocoding API and Places API (New) over `fetch`, and the redirects of a short link
 * followed by hand.
 *
 * The API key is only ever in a request: the Geocoding API takes it in the address, the Places
 * API in a header. No address is logged, and what a failure says is logged with the key taken
 * out of it. A refused key (`REQUEST_DENIED`, 403) is logged once and that API is left alone
 * for an hour.
 */
export class GoogleGeo implements GeoGateway {
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly linkTimeoutMs: number;
  private readonly deniedForMs: number;
  private readonly deniedUntil = new Map<Api, number>();

  constructor(private readonly options: GoogleGeoOptions) {
    this.now = options.now ?? (() => Date.now());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.linkTimeoutMs = options.linkTimeoutMs ?? 5_000;
    this.deniedForMs = options.deniedForMs ?? 3_600_000;
  }

  get enabled(): boolean {
    return this.options.apiKey !== undefined && this.options.apiKey !== '';
  }

  /** A text that may be logged: without the key, wherever it stands in it. */
  private safe(text: string): string {
    const key = this.options.apiKey;
    if (!key) return text;
    return text.split(key).join('[key]').split(encodeURIComponent(key)).join('[key]');
  }

  private denied(api: Api, message: string, response?: GeoResponse): GeoRefusal {
    // What the refusal says in its body is of no use: let go of it unread.
    void response?.body?.cancel().catch(() => undefined);
    this.deniedUntil.set(api, this.now() + this.deniedForMs);
    this.options.log.warn(
      { api, reason: this.safe(message) },
      'Google refused the API key; not asking again for a while',
    );
    return { ok: false, reason: 'denied', retryInMs: this.deniedForMs };
  }

  private failed(api: Api, reason: string): GeoRefusal {
    this.options.log.warn({ api, reason: this.safe(reason) }, 'a request to Google failed');
    return { ok: false, reason: 'failed' };
  }

  /** Why an API is not asked now; undefined when it may be. */
  private unavailable(api: Api): GeoRefusal | undefined {
    if (!this.enabled) return { ok: false, reason: 'no-key' };
    const until = this.deniedUntil.get(api);
    if (until === undefined) return undefined;
    const left = until - this.now();
    if (left > 0) return { ok: false, reason: 'denied', retryInMs: left };
    this.deniedUntil.delete(api);
    return undefined;
  }

  async reverseGeocode(point: LatLon): Promise<GeoAnswer<AddressComponents>> {
    const api: Api = 'geocoding';
    const unavailable = this.unavailable(api);
    if (unavailable) return unavailable;
    const query = new URLSearchParams({
      latlng: `${point.lat},${point.lon}`,
      language: 'en',
      key: this.options.apiKey ?? '',
    });
    let body: unknown;
    try {
      const response = await this.options.fetch(`${GEOCODE_ENDPOINT}?${query.toString()}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 403) return this.denied(api, 'HTTP 403', response);
      // Google answers 200 also for what it refuses, and says why in the body.
      body = await response.json();
    } catch (err) {
      return this.failed(api, failureReason(err));
    }
    const reading = readGeocode(body);
    if (reading.kind === 'denied') return this.denied(api, reading.message);
    if (reading.kind === 'failed') return this.failed(api, reading.status);
    return { ok: true, value: reading.components };
  }

  async placesNear(point: LatLon, radiusMetres: number): Promise<GeoAnswer<string[]>> {
    const api: Api = 'places';
    const unavailable = this.unavailable(api);
    if (unavailable) return unavailable;
    try {
      const response = await this.options.fetch(PLACES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.options.apiKey ?? '',
          'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify(placesRequest(point, radiusMetres)),
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 403) return this.denied(api, 'HTTP 403', response);
      if (response.status !== 200) return this.failed(api, `HTTP ${response.status}`);
      return { ok: true, value: readPlaces(await response.json()) };
    } catch (err) {
      return this.failed(api, failureReason(err));
    }
  }

  /**
   * Follows the redirects of a short link by hand. Only `https` addresses of the hosts in
   * `LINK_HOSTS` are ever requested (a redirect anywhere else ends it), over at most
   * `MAX_LINK_HOPS` addresses and `linkTimeoutMs` in all, and no body is read: where a link
   * leads is in the `Location` header of the answer.
   */
  async followShortLink(
    url: string,
    readable: (address: string) => boolean,
  ): Promise<string | undefined> {
    const signal = AbortSignal.timeout(this.linkTimeoutMs);
    let current = url;
    for (let hop = 0; hop < MAX_LINK_HOPS; hop++) {
      const target = requestable(current);
      if (!target) return undefined;
      let next: string;
      try {
        const response = await this.options.fetch(target.href, {
          method: 'GET',
          redirect: 'manual',
          signal,
        });
        const location = response.headers.get('location');
        // The page itself is of no use: let go of it unread.
        void response.body?.cancel().catch(() => undefined);
        if (response.status < 300 || response.status >= 400 || location === null) {
          return undefined;
        }
        next = new URL(location, target).href;
      } catch (err) {
        this.options.log.warn({ reason: failureReason(err), hop }, 'could not follow a short link');
        return undefined;
      }
      if (readable(next)) return next;
      current = next;
    }
    return undefined;
  }
}

/** The address as one that may be requested while following a short link; undefined otherwise. */
function requestable(address: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return undefined;
  }
  const plain = url.protocol === 'https:' && url.port === '' && url.username === '';
  return plain && url.password === '' && LINK_HOSTS.has(url.hostname) ? url : undefined;
}
```

Apply to `src/services/gym-directory.ts`:

```diff
--- a/src/services/gym-directory.ts
+++ b/src/services/gym-directory.ts
@@ -104,6 +104,14 @@ export class GymDirectory implements GymProvider {
     return this.current.get(id);
   }
 
+  /**
+   * Every gym, in no particular order (a new list): for the upkeep of the gyms, which measures
+   * from one gym to all others. Handlers search; they do not list.
+   */
+  all(): Gym[] {
+    return this.current.all();
+  }
+
   isRegion(channelId: string): boolean {
     return this.current.isRegion(channelId);
   }
```

Create `src/services/gym-upkeep.ts`:

```ts
import type { Gym, GymStorage } from '../db/repositories/gym-repository.js';
import { metresBetween } from '../domain/geo/distance.js';
import { geodataJson, placesRadius, placesText } from '../domain/geo/google.js';
import { nearestGymChanges, type NearestEvent } from '../domain/gyms/nearest.js';
import { isRaid, isTrain, type Party } from '../domain/party/party.js';
import type { Logger } from '../log.js';
import type { GeoFailure, GeoGateway } from './geo-gateway.js';

/**
 * What came of fetching one thing about a gym: it was written (`updated`), it is what the gym
 * had already (`unchanged`), or why Google gave nothing (the gym then keeps what it had).
 */
export type FetchOutcome = 'updated' | 'unchanged' | GeoFailure;

/** What `refresh` got for a gym, which is given as it is afterwards. */
export interface GymRefresh {
  gym: Gym;
  geodata: FetchOutcome;
  places: FetchOutcome;
}

/** The part of `GymDirectory` the upkeep works on. */
export interface GymsInMemory {
  all(): Gym[];
  get(id: number): Gym | undefined;
  refreshGym(id: number): Promise<Gym | undefined>;
}

export interface GymUpkeepOptions {
  gyms: Pick<GymStorage, 'update'>;
  directory: GymsInMemory;
  geo: GeoGateway;
  /** The active parties, to find those that show a gym. */
  parties: { active(): Party[] };
  /** Told of every party that shows a gym that changed, to render its post anew. */
  posts: { changed(partyId: string): void };
  log: Logger;
  /**
   * How long the gyms that wait for their places are apart: one of them is asked about every
   * so often. Default five seconds.
   */
  placesEveryMs?: number;
  /**
   * Starts the timer for the next gym that waits and gives the function that cancels it.
   * Default: `setTimeout`, unref'd. A test passes its own, or calls `flush`.
   */
  setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * What follows from a change of a gym, behind the change itself: the directory and the posts
 * that show the gym (`gymChanged`), which gym is nearest to which (`placed`, `removed`), and
 * what Google knows of the place: its address (`geodata`) and the places around it (`places`),
 * by which the gym is found.
 *
 * Nothing waits for Google. A gym that was added or moved is asked about at once, on the side;
 * the gyms whose nearest gym changed with it wait in a line for their places (the circle they
 * are looked for in is half the way to the nearest gym), one every few seconds. The line is in
 * memory only: a restart forgets it, as with the legacy bot, and `/gym refresh` asks again.
 * Only tests and the shutdown wait for it (`flush`, `stop`). While Google refuses the key for
 * places, the line keeps its gyms and looks again when the refusal is over.
 *
 * An answer is written only when nothing about its question has changed since it was asked: every
 * question about a gym has a number (`generation`), which goes up with each new question of its
 * kind for that gym and whenever the gym is put somewhere or gets another nearest gym. An answer
 * whose number is no longer the gym's is dropped, so an older answer never overwrites a newer
 * one, whichever comes first.
 *
 * The bookkeeping of nearest gyms assumes one change at a time: gym administration holds its
 * lock around `placed` and `removed`.
 */
export class GymUpkeep {
  private readonly placesEveryMs: number;
  private readonly setTimer: (run: () => void, ms: number) => () => void;
  /** The gyms that wait for their places, in the order they were queued. */
  private readonly queue = new Set<number>();
  private readonly running = new Set<Promise<unknown>>();
  /** The number of the newest question of each kind about each gym (`address:12`, `places:12`). */
  private readonly generation = new Map<string, number>();
  private cancelTimer: (() => void) | undefined;
  /** How long Google's refusal of the key for places still lasted when it was last met. */
  private deniedForMs = 0;
  private stopped = false;

  constructor(private readonly options: GymUpkeepOptions) {
    this.placesEveryMs = options.placesEveryMs ?? 5_000;
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        timer.unref();
        return () => {
          clearTimeout(timer);
        };
      });
  }

  /** Whether Google is asked at all: without an API key a gym has neither address nor places. */
  get fetches(): boolean {
    return this.options.geo.enabled;
  }

  /** How many gyms wait for their places. */
  get waiting(): number {
    return this.queue.size;
  }

  /**
   * After anything about a gym changed (its texts, its flags, its place; also when it was added
   * or deleted): the directory reads it again, and every active party that shows it (a raid
   * there, a train with it on its route) has its post rendered anew. Gives the gym as it is
   * now; undefined when it is gone.
   */
  async gymChanged(id: number): Promise<Gym | undefined> {
    const gym = await this.options.directory.refreshGym(id);
    this.showAnew(id);
    return gym;
  }

  private showAnew(gymId: number): void {
    const { parties, posts, log } = this.options;
    try {
      for (const party of parties.active()) {
        const shows = isRaid(party)
          ? party.gymId === gymId
          : isTrain(party) && party.train.route.includes(gymId);
        if (shows) posts.changed(party.id);
      }
    } catch (err) {
      log.warn({ err, gym: gymId }, 'could not render the posts that show a gym anew');
    }
  }

  /**
   * After a gym was added or moved (the directory has it where it is now): the nearest gyms of
   * the gyms concerned are written, which is waited for; then the gym is asked about on the
   * side, and the gyms whose places are now looked for in another circle wait in the line.
   * Never rejects: what fails is logged, and the gym stays as it is.
   */
  async placed(id: number): Promise<void> {
    // Whatever is on its way about this gym was asked about another place.
    this.outdate('address', id);
    this.outdate('places', id);
    const changed = await this.settle({ placed: id });
    // The gyms that have this one as their nearest: their circle follows it, also when a move
    // left it their nearest.
    const pointing = this.options.directory
      .all()
      .filter((gym) => gym.nearestGym === id)
      .map((gym) => gym.id);
    const others = [...changed, ...pointing].filter((other) => other !== id);
    // Their circle follows the distance to this gym: what was asked in the old circle is void.
    for (const other of pointing) this.outdate('places', other);
    this.aside(async () => {
      const refreshed = await this.refreshNow(id);
      // Refused for now: it waits in the line like the others, for when the API may be asked.
      if (refreshed?.places === 'denied') this.queuePlaces([id]);
    });
    this.queuePlaces(others);
  }

  /**
   * After a gym was deleted (the directory no longer has it): the gyms that pointed at it get
   * another nearest gym, and wait in the line for their places. Never rejects.
   */
  async removed(id: number): Promise<void> {
    this.queue.delete(id);
    this.generation.delete(`address:${id}`);
    this.generation.delete(`places:${id}`);
    this.queuePlaces(await this.settle({ removed: id }));
  }

  /** Writes the nearest gyms an event changed; gives the gyms that were written. */
  private async settle(event: NearestEvent): Promise<number[]> {
    const { gyms, directory, log } = this.options;
    const done: number[] = [];
    try {
      for (const change of nearestGymChanges(directory.all(), event)) {
        await gyms.update(change.id, { nearestGym: change.nearestGym });
        await directory.refreshGym(change.id);
        // Another nearest gym is another circle to look for places in.
        this.outdate('places', change.id);
        done.push(change.id);
      }
    } catch (err) {
      log.warn({ err, ...event }, 'could not bring the nearest gyms up to date');
    }
    return done;
  }

  /**
   * Asks Google about one gym now, its address and then its places, and writes what differs
   * (`/gym refresh`). Undefined when there is no such gym. Rejects when a write fails.
   */
  refresh(id: number): Promise<GymRefresh | undefined> {
    const work = this.refreshNow(id).finally(() => this.running.delete(work));
    this.running.add(work);
    return work;
  }

  private async refreshNow(id: number): Promise<GymRefresh | undefined> {
    const geodata = await this.fetchGeodata(id);
    if (geodata === undefined) return undefined;
    const places = await this.fetchPlaces(id);
    const gym = this.options.directory.get(id);
    return places === undefined || !gym ? undefined : { gym, geodata, places };
  }

  /** Makes every answer that is on its way about a gym one that is no longer wanted. */
  private outdate(kind: 'address' | 'places', id: number): void {
    const key = `${kind}:${id}`;
    this.generation.set(key, (this.generation.get(key) ?? 0) + 1);
  }

  /**
   * Notes a new question about a gym and gives the test for its answer: whether it is still the
   * newest question of its kind about that gym, and nothing has outdated it.
   */
  private question(kind: 'address' | 'places', id: number): () => boolean {
    this.outdate(kind, id);
    const key = `${kind}:${id}`;
    const asked = this.generation.get(key);
    return () => this.generation.get(key) === asked;
  }

  /** The address of a gym's place; undefined when the gym is gone. */
  private async fetchGeodata(id: number): Promise<FetchOutcome | undefined> {
    const { gyms, directory, geo } = this.options;
    const asked = directory.get(id);
    if (!asked) return undefined;
    const wanted = this.question('address', id);
    const answer = await geo.reverseGeocode({ lat: asked.lat, lon: asked.lon });
    const gym = directory.get(id);
    if (!gym) return undefined;
    if (!answer.ok) return answer.reason;
    // Moved, or asked about again, while Google was asked: a newer answer is the one to write.
    if (!wanted()) return 'unchanged';
    const geodata = geodataJson(answer.value);
    if (geodata === gym.geodata) return 'unchanged';
    await gyms.update(id, { geodata });
    await directory.refreshGym(id);
    return 'updated';
  }

  /** The places around a gym, within half the way to its nearest gym; undefined when it is gone. */
  private async fetchPlaces(id: number): Promise<FetchOutcome | undefined> {
    const { gyms, directory, geo } = this.options;
    const asked = directory.get(id);
    if (!asked) return undefined;
    const nearest = asked.nearestGym === null ? undefined : directory.get(asked.nearestGym);
    const radius = placesRadius(nearest && metresBetween(asked, nearest));
    const wanted = this.question('places', id);
    const answer = await geo.placesNear({ lat: asked.lat, lon: asked.lon }, radius);
    const gym = directory.get(id);
    if (!gym) return undefined;
    if (!answer.ok) {
      if (answer.reason === 'denied') this.deniedForMs = answer.retryInMs ?? this.placesEveryMs;
      return answer.reason;
    }
    if (!wanted()) return 'unchanged';
    const places = placesText(answer.value);
    if (places === gym.places) return 'unchanged';
    await gyms.update(id, { places });
    await directory.refreshGym(id);
    return 'updated';
  }

  private queuePlaces(ids: readonly number[]): void {
    if (this.stopped || !this.fetches) return;
    for (const id of ids) this.queue.add(id);
    this.schedule();
  }

  /** Sets the timer for the next gym of the line: after the usual pause, or after `waitMs`. */
  private schedule(waitMs = this.placesEveryMs): void {
    if (this.cancelTimer || this.queue.size === 0 || this.stopped) return;
    this.cancelTimer = this.setTimer(
      () => {
        this.cancelTimer = undefined;
        this.aside(async () => {
          const denied = await this.next();
          this.schedule(denied);
        });
      },
      Math.max(waitMs, this.placesEveryMs),
    );
  }

  /**
   * Asks about the gym that has waited longest. Never rejects. When Google refuses the key the
   * gym stays the first of the line, and the answer is how long the refusal still lasts.
   */
  private async next(): Promise<number | undefined> {
    const [id] = this.queue;
    if (id === undefined) return undefined;
    // Out of the line while it is asked about: nobody else takes it meanwhile.
    this.queue.delete(id);
    try {
      const outcome = await this.fetchPlaces(id);
      if (outcome === 'denied' && !this.stopped) {
        const behind = [...this.queue];
        this.queue.clear();
        for (const waiting of [id, ...behind]) this.queue.add(waiting);
        return this.deniedForMs;
      }
    } catch (err) {
      this.options.log.warn({ err, gym: id }, 'could not bring the places of a gym up to date');
    }
    return undefined;
  }

  /** Runs work nobody waits for; what it throws is logged. Nothing is started after `stop`. */
  private aside(run: () => Promise<unknown>): void {
    if (this.stopped) return;
    const work: Promise<unknown> = run()
      .catch((err: unknown) => {
        this.options.log.warn({ err }, 'the upkeep of a gym failed');
      })
      .finally(() => this.running.delete(work));
    this.running.add(work);
  }

  /**
   * Does everything that waits, now, without the pauses of the line, and waits for it; the gyms
   * that wait for an API that is denied keep waiting. For tests.
   */
  async flush(): Promise<void> {
    for (;;) {
      this.cancelTimer?.();
      this.cancelTimer = undefined;
      // A denied API ends it: the gyms stay in the line for when it may be asked again.
      let denied: number | undefined;
      while (this.queue.size > 0 && denied === undefined) denied = await this.next();
      if (this.running.size === 0) return;
      await Promise.allSettled([...this.running]);
    }
  }

  /**
   * For shutdown: forgets the gyms that wait, starts nothing more and waits for what is on its
   * way (a write must finish before the database closes).
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    this.queue.clear();
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/domain/geo/google.test.ts src/services/geo-gateway.test.ts src/services/gym-directory.test.ts src/services/gym-upkeep.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff fcce9ca -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/db/repositories/gym-repository.ts src/domain/geo/google.test.ts src/domain/geo/google.ts src/domain/search/gym-lookup.ts src/services/geo-gateway.test.ts src/services/geo-gateway.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/gym-upkeep.test.ts src/services/gym-upkeep.ts test/support/geo.ts test/support/gym-store.ts
npm run typecheck; npx eslint src/db/repositories/gym-repository.ts src/domain/geo/google.test.ts src/domain/geo/google.ts src/domain/search/gym-lookup.ts src/services/geo-gateway.test.ts src/services/geo-gateway.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/gym-upkeep.test.ts src/services/gym-upkeep.ts test/support/geo.ts test/support/gym-store.ts   # both clean; the full check runs after the last task
git add src/db/repositories/gym-repository.ts src/domain/geo/google.test.ts src/domain/geo/google.ts src/domain/search/gym-lookup.ts src/services/geo-gateway.test.ts src/services/geo-gateway.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/gym-upkeep.test.ts src/services/gym-upkeep.ts test/support/geo.ts test/support/gym-store.ts
git commit -F <a file with the message below>
```

The commit message:

```
Gym upkeep: Google behind a port, nearest gyms, address and places

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 3: Elite raid gyms: what was said of an EX gym says elite raid gym

**Files:**
- Modify: `data/settings.json`, `src/commands/trains/route.ts`, `src/config/settings.ts`, `src/discord/party-gateway.test.ts`, `src/domain/party/party.ts`, `src/domain/party/raid.test.ts`, `src/domain/party/raid.ts`, `src/render/mirrors.test.ts`, `src/render/mirrors.ts`, `src/render/raid-post.test.ts`, `src/render/raid-post.ts`, `src/render/train-post.test.ts`, `src/render/train-post.ts`, `src/services/access-service.ts`, `src/services/party-mirrors.test.ts`, `src/services/party-mirrors.ts`, `src/services/party-service.meetup.test.ts`, `src/services/party-service.train.test.ts`, `test/fixtures/settings.json`, `test/support/gyms.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: The renderers of raid and train posts and of the copies; `settings.channels`; `raidMirrors`; the test support of gyms and of the party service.
- Produces: `isEliteGym(gym)` (either stored flag) in `src/domain/party/party.ts`, used wherever a gym's flag is shown or decides; the sentence "This is an elite raid gym."; the settings key `channels['elite-gym-raids']` (schema, `data/settings.json`, the test fixture); `ELITE_GYM_CHANNEL` in `test/support/party-service.ts`.

Nothing stored is renamed (`taggedEx`, `confirmedEx`, the mirror kind `ex`, `features.exGymChannel`). The EX raid tier keeps its name.

Reference commit of the prototype for this task: `b5ff379`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/discord/party-gateway.test.ts`:

```diff
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -114,7 +114,7 @@ describe('FakePartyGateway', () => {
     const gateway = new FakePartyGateway();
     gateway.channelNames.set('500000000000000001', 'remote-raids');
     expect(gateway.findChannel('100000000000000001', 'remote-raids')).toBe('500000000000000001');
-    expect(gateway.findChannel('100000000000000001', 'potential-ex-gym-raids')).toBeUndefined();
+    expect(gateway.findChannel('100000000000000001', 'elite-gym-raids')).toBeUndefined();
     gateway.gone.add('500000000000000001');
     expect(gateway.findChannel('100000000000000001', 'remote-raids')).toBeUndefined();
   });
```

Apply to `src/domain/party/raid.test.ts`:

```diff
--- a/src/domain/party/raid.test.ts
+++ b/src/domain/party/raid.test.ts
@@ -471,7 +471,7 @@ describe('raidMirrors', () => {
   const tagged = { taggedEx: true, confirmedEx: false };
   const hosted = { taggedEx: false, confirmedEx: true };
 
-  it('wants a raid in the remote channel, and in the EX channel when its gym can host EX raids', () => {
+  it('wants a raid in the remote channel, and in the channel for elite raid gyms when its gym is one', () => {
     const egg = testRaid();
     expect(raidMirrors(egg, plain, PARTY_NOW)).toEqual(['remote']);
     expect(raidMirrors(egg, tagged, PARTY_NOW)).toEqual(['ex', 'remote']);
```

Apply to `src/render/mirrors.test.ts`:

```diff
--- a/src/render/mirrors.test.ts
+++ b/src/render/mirrors.test.ts
@@ -26,7 +26,7 @@ describe('renderMirror', () => {
     expect(remote.components?.length).toBeGreaterThan(0);
     expect(remote.content).toBe('A raid in <#100000000000000001>: <#900000000000000001>');
     expect(renderMirror('ex', rendered, place).content).toBe(
-      'A raid at a gym that can host EX raids in <#100000000000000001>: <#900000000000000001>',
+      'A raid at an elite raid gym in <#100000000000000001>: <#900000000000000001>',
     );
   });
 
```

Apply to `src/render/raid-post.test.ts`:

```diff
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -556,16 +556,14 @@ describe('renderRaidPost', () => {
     ).toContain('**Moves** ???? / Dark Pulse');
   });
 
-  it('tells about the gym: EX history, the EX tag, and its notice as plain text', () => {
+  it('tells about the gym: that it is an elite raid gym, and its notice as plain text', () => {
     const about = (gym: Partial<PostGym>, party = egg) =>
       renderRaidPost(view(party, { gym: { ...library!, ...gym } })).embed.fields?.find(
         (field) => field.name === 'About this gym',
       )?.value;
     expect(about({})).toBeUndefined();
-    expect(about({ taggedEx: true })).toBe('This gym has the EX gym tag.');
-    expect(about({ taggedEx: true, confirmedEx: true })).toBe(
-      'This gym has hosted EX raids before.',
-    );
+    expect(about({ taggedEx: true })).toBe('This is an elite raid gym.');
+    expect(about({ taggedEx: true, confirmedEx: true })).toBe('This is an elite raid gym.');
     expect(about({ notice: 'Closes at **dusk** @everyone' })).toBe(
       'Closes at \\*\\*dusk\\*\\* @\u200beveryone',
     );
```

Apply to `src/render/train-post.test.ts`:

```diff
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -156,7 +156,7 @@ describe('renderTrainPost', () => {
     expect(field(post.embed, /^Route/)?.name).toBe('Route: 3 stops, finished');
   });
 
-  it('lists the route: done stops struck through, the current one marked, EX gyms marked', () => {
+  it('lists the route: done stops struck through, the current one marked, elite raid gyms marked', () => {
     const exGyms = (id: number): PostGym | undefined => {
       const found = gym(id);
       return found && id === 7 ? { ...found, taggedEx: true } : found;
@@ -167,7 +167,7 @@ describe('renderTrainPost', () => {
       value: [
         '~~1\\. Veterans Memorial Bridge~~',
         '**2\\. The Stacks** (the train is here)',
-        '3\\. Harbor Lighthouse Mural · EX gym',
+        '3\\. Harbor Lighthouse Mural · elite raid gym',
         '4\\. Old Stone Fountain',
       ].join('\n'),
     });
@@ -217,7 +217,7 @@ describe('renderTrainPost', () => {
     };
     const post = renderTrainPost(view(onRoute([4, 11]), { gym: noted }));
     expect(field(post.embed, /About this gym/)?.value).toBe(
-      'This gym has hosted EX raids before.\nMind the \\*traffic\\*',
+      'This is an elite raid gym.\nMind the \\*traffic\\*',
     );
     // At the next stop it is that gym's notice.
     const next = renderTrainPost(view(onRoute([4, 11], 1), { gym: noted }));
```

Apply to `src/services/party-mirrors.test.ts`:

```diff
--- a/src/services/party-mirrors.test.ts
+++ b/src/services/party-mirrors.test.ts
@@ -1,6 +1,6 @@
 import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
-import { EX_CHANNEL, REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { ELITE_GYM_CHANNEL, REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE, asRaid, at, MINUTE, withAttendees } from '../../test/support/parties.js';
 import {
   gatewayWithMirrorChannels,
@@ -18,7 +18,7 @@ const alice: Member = { id: ALICE, name: 'Alice' };
 const yveltal = { boss: { key: 'yveltal' } } as const;
 const ELITE = { level: 'Elite', shadow: false } as const;
 
-/** The invented gyms, with the Library (gym 1) as a gym that can host EX raids. */
+/** The invented gyms, with the Library (gym 1) as an elite raid gym. */
 function gymsWithExLibrary(): PartyServiceOptions['gyms'] {
   const gyms = gymsFixture();
   return {
@@ -49,15 +49,15 @@ describe('the copies of a raid in other channels', () => {
     expect(made.current().mirrorMessages).toEqual([
       { channelId: REMOTE_CHANNEL, messageId: copy?.id, kind: 'remote' },
     ]);
-    // The Library cannot host EX raids.
-    expect(gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    // The Library is no elite raid gym.
+    expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
   });
 
-  it('puts a raid at an EX gym into the EX channel as well, but not an EX raid', async () => {
+  it('puts a raid at an elite raid gym into the channel for those as well, but not an EX raid', async () => {
     const made = await mirrored({}, { gyms: gymsWithExLibrary() });
-    expect(made.gateway.messagesIn(EX_CHANNEL)).toHaveLength(1);
-    expect(made.gateway.messagesIn(EX_CHANNEL)[0]?.message.content).toBe(
-      `A raid at a gym that can host EX raids in <#${WEST_CHANNEL}>: <#${made.postId}>`,
+    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toHaveLength(1);
+    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)[0]?.message.content).toBe(
+      `A raid at an elite raid gym in <#${WEST_CHANNEL}>: <#${made.postId}>`,
     );
     expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['ex', 'remote']);
 
@@ -65,7 +65,7 @@ describe('the copies of a raid in other channels', () => {
       { tier: { level: 'EX', shadow: false } },
       { gyms: gymsWithExLibrary() },
     );
-    expect(ex.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    expect(ex.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
     expect(ex.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
   });
 
@@ -81,7 +81,7 @@ describe('the copies of a raid in other channels', () => {
     const off = await mirrored(yveltal, { gyms: gymsWithExLibrary(), settings });
     expect(off.current().mirrorMessages).toEqual([]);
     expect(off.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
-    expect(off.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    expect(off.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
   });
 
   it('shows a change in the copy too, and edits nothing when nothing changed', async () => {
@@ -134,7 +134,7 @@ describe('the copies of a raid in other channels', () => {
     service.changed(made.party.id);
     await service.flush();
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
-    expect(gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
     expect(made.current().mirrorMessages).toEqual([]);
   });
 
@@ -567,7 +567,7 @@ describe('the copies of a raid when it ends', () => {
 
     expect(await service.end(made.party.id)).toBe(true);
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
-    expect(gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    expect(gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
     expect(gateway.messagesIn(postId)).toEqual([]);
     expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
     expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
```

Apply to `src/services/party-service.meetup.test.ts`:

```diff
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -2,7 +2,7 @@ import { describe, expect, it } from 'vitest';
 import {
   EAST_CHANNEL,
   EAST_FORUM,
-  EX_CHANNEL,
+  ELITE_GYM_CHANNEL,
   REMOTE_CHANNEL,
   UNBOUNDED_CHANNEL,
   WEST_CHANNEL,
@@ -248,7 +248,7 @@ describe('PartyService: the post of a meetup', () => {
     expect(embed?.description?.endsWith('\n\n**Information**\nBring snacks.')).toBe(true);
   });
 
-  it('has no copies in the channels for remote raids and raids at EX gyms', async () => {
+  it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
     const made = await createdMeetup(
       {},
       { renderDelayMs: 0, sharedDelayMs: 0 },
@@ -257,7 +257,7 @@ describe('PartyService: the post of a meetup', () => {
     await made.attendance.setRemote(made.party.id, alice, true);
     await made.service.flush();
     expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
-    expect(made.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
     expect(made.current().mirrorMessages).toEqual([]);
   });
 
```

Apply to `src/services/party-service.train.test.ts`:

```diff
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -2,7 +2,7 @@ import { describe, expect, it } from 'vitest';
 import {
   EAST_CHANNEL,
   EAST_FORUM,
-  EX_CHANNEL,
+  ELITE_GYM_CHANNEL,
   REMOTE_CHANNEL,
   UNBOUNDED_CHANNEL,
   WEST_CHANNEL,
@@ -154,7 +154,7 @@ describe('PartyService: the post of a train', () => {
     expect(fields[1]?.value).toBe(`**Here** ❄️ Alice\n**Interested** <@${REPORTER}>`);
   });
 
-  it('has no copies in the channels for remote raids and raids at EX gyms', async () => {
+  it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
     const made = await createdTrain(
       { route: [4] },
       { renderDelayMs: 0, sharedDelayMs: 0 },
@@ -163,7 +163,7 @@ describe('PartyService: the post of a train', () => {
     await made.attendance.setRemote(made.party.id, alice, true);
     await made.service.flush();
     expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
-    expect(made.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
+    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toEqual([]);
     expect(made.current().mirrorMessages).toEqual([]);
   });
 
```

Apply to `test/fixtures/settings.json`:

```diff
--- a/test/fixtures/settings.json
+++ b/test/fixtures/settings.json
@@ -45,7 +45,7 @@
     "bot-lab": "the-bot-lab",
     "mod-bot-lab": "mod-bot-only",
     "unown": "unown-sightings",
-    "ex-gym-raids": "potential-ex-gym-raids",
+    "elite-gym-raids": "elite-gym-raids",
     "remote-raids": "remote-raids",
     "pvp": "rank-checker",
     "bot-updates": "bot-updates"
```

Apply to `test/support/gyms.ts`:

```diff
--- a/test/support/gyms.ts
+++ b/test/support/gyms.ts
@@ -9,9 +9,9 @@ export const UNBOUNDED_CHANNEL = '100000000000000003';
 /** The forums holding the party posts of West and East. */
 export const WEST_FORUM = '100000000000000011';
 export const EAST_FORUM = '100000000000000012';
-/** The server's channels for copies of raids: those that can be joined remotely, those at EX gyms. */
+/** The server's channels for copies of raids: those that can be joined remotely, those at elite raid gyms. */
 export const REMOTE_CHANNEL = '100000000000000021';
-export const EX_CHANNEL = '100000000000000022';
+export const ELITE_GYM_CHANNEL = '100000000000000022';
 
 function square(south: number, west: number, north: number, east: number): LatLon[] {
   return [
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -37,7 +37,7 @@ import { MemoryWants } from './wants.js';
 import { catalogueFixture } from './game-data.js';
 import {
   EAST_FORUM,
-  EX_CHANNEL,
+  ELITE_GYM_CHANNEL,
   REMOTE_CHANNEL,
   testRegions,
   WEST_CHANNEL,
@@ -134,14 +134,14 @@ export class MemoryAccessGrants implements AccessGrantStorage {
 
 /**
  * A fake gateway whose server has the two channels for copies of raids, under the names of the
- * test settings (`REMOTE_CHANNEL`, `EX_CHANNEL`). Without them, as in most tests, a raid has no
+ * test settings (`REMOTE_CHANNEL`, `ELITE_GYM_CHANNEL`). Without them, as in most tests, a raid has no
  * copies. Pass it as `{ gateway }` in `kept`.
  */
 export function gatewayWithMirrorChannels(): FakePartyGateway {
   const { channels } = loadSettings(TEST_SETTINGS_PATH);
   const gateway = new FakePartyGateway();
   gateway.channelNames.set(REMOTE_CHANNEL, channels['remote-raids']);
-  gateway.channelNames.set(EX_CHANNEL, channels['ex-gym-raids']);
+  gateway.channelNames.set(ELITE_GYM_CHANNEL, channels['elite-gym-raids']);
   return gateway;
 }
 
```

Run: `npx vitest run --project unit src/discord/party-gateway.test.ts src/domain/party/raid.test.ts src/render/mirrors.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/party-mirrors.test.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `data/settings.json`:

```diff
--- a/data/settings.json
+++ b/data/settings.json
@@ -45,7 +45,7 @@
     "bot-lab": "the-bot-lab",
     "mod-bot-lab": "mod-bot-only",
     "unown": "unown-sightings",
-    "ex-gym-raids": "potential-ex-gym-raids",
+    "elite-gym-raids": "elite-gym-raids",
     "remote-raids": "remote-raids",
     "pvp": "rank-checker",
     "bot-updates": "bot-updates"
```

Apply to `src/commands/trains/route.ts`:

```diff
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -92,7 +92,7 @@ const show: SubcommandPart = {
   help: {
     details:
       'Shows you every stop in order: those the train has left struck through, the one it is ' +
-      'at marked, EX gyms marked, each a link to Google Maps. The post itself shows the route ' +
+      'at marked, elite raid gyms marked, each a link to Google Maps. The post itself shows the route ' +
       'too, without the links.',
     examples: ['/route show'],
   },
```

Apply to `src/config/settings.ts`:

```diff
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -59,7 +59,7 @@ export const settingsSchema = z.strictObject({
     'bot-lab': z.string().min(1),
     'mod-bot-lab': z.string().min(1),
     unown: z.string().min(1),
-    'ex-gym-raids': z.string().min(1),
+    'elite-gym-raids': z.string().min(1),
     'remote-raids': z.string().min(1),
     pvp: z.string().min(1),
     'bot-updates': z.string().min(1),
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -88,7 +88,7 @@ export interface PartyGroup {
 
 /**
  * A copy of the party's message besides the first message of its post (spec 5.2), with the same
- * controls. `ex` and `remote` are in the server's channels for raids at EX gyms and for raids
+ * controls. `ex` and `remote` are in the server's channels for raids at elite raid gyms and for raids
  * that can be joined remotely; `status` is the copy `/status` puts at the bottom of the post
  * itself (`channelId` is then the post). `region` is a train's copy in the text channel of
  * another region its route has a stop in: one in each such channel. The newest of a kind (of a
```

Apply to `src/domain/party/raid.ts`:

```diff
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -96,7 +96,7 @@ export function raidStage(party: RaidParty, now: number): RaidStage {
 
 /**
  * The channels besides its own post in which a raid's message should stand (spec 5.2): `ex` for
- * a raid, itself not an EX raid, at a gym that can host EX raids; `remote` for a raid that can be
+ * a raid, itself not an EX raid, at an elite raid gym; `remote` for a raid that can be
  * joined remotely (every raid but an elite one). None once the raid has ended by the clock: what
  * is over is of no use to somebody looking for a raid. Whether the server has such channels, and
  * wants them, is the caller's to know.
```

Apply to `src/render/mirrors.ts`:

```diff
--- a/src/render/mirrors.ts
+++ b/src/render/mirrors.ts
@@ -40,6 +40,6 @@ export function renderMirror(
     };
   }
   const region = place.regionChannelId === undefined ? '' : ` in <#${place.regionChannelId}>`;
-  const what = kind === 'ex' ? 'A raid at a gym that can host EX raids' : 'A raid';
+  const what = kind === 'ex' ? 'A raid at an elite raid gym' : 'A raid';
   return { ...rendered.message, content: `${what}${region}: <#${place.postId}>` };
 }
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -146,6 +146,16 @@ export function shownAutoset(
   };
 }
 
+/**
+ * Whether a gym is an elite raid gym, as the game now calls what was an EX gym: either of the
+ * two stored flags says so (`taggedEx`: it has the tag; `confirmedEx`: it has hosted such a
+ * raid). The columns keep their names, which the legacy bot shares; what anybody reads is
+ * "elite raid gym".
+ */
+export function isEliteGym(gym: { taggedEx: boolean; confirmedEx: boolean }): boolean {
+  return gym.taggedEx || gym.confirmedEx;
+}
+
 export function gymName(gym: PostGym | undefined): string {
   // `||`: a nickname that was cleared to an empty text names nothing.
   return gym ? gym.nickname || gym.name : 'Unknown gym';
@@ -241,14 +251,13 @@ export function bossFacts(
 }
 
 /**
- * What a post says about the gym it is at: that it is an EX gym (not for an EX raid, which says
+ * What a post says about the gym it is at: that it is an elite raid gym (not for an EX raid, which says
  * so itself: `exRaid`), and the notice the moderators gave the gym. Empty when there is nothing.
  */
 export function gymNotes(gym: PostGym | undefined, exRaid = false): string[] {
   const notes: string[] = [];
   if (gym && !exRaid) {
-    if (gym.confirmedEx) notes.push('This gym has hosted EX raids before.');
-    else if (gym.taggedEx) notes.push('This gym has the EX gym tag.');
+    if (isEliteGym(gym)) notes.push('This is an elite raid gym.');
   }
   // A notice of nothing but white space is empty once plain; Discord refuses an empty field value.
   const notice = gym?.notice ? plain(gym.notice) : '';
```

Apply to `src/render/train-post.ts`:

```diff
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -18,6 +18,7 @@ import {
   bossFacts,
   gymMapsUrl,
   gymName,
+  isEliteGym,
   gymNotes,
   type PostGym,
   type ShownBoss,
@@ -69,7 +70,7 @@ export function stopLink(gym: PostGym | undefined, bare = false): string {
 
 /**
  * The route, one line per stop, numbered from 1: a stop the train has left is struck through,
- * the one it is at stands out and says so, and an EX gym is marked. With `links`, every stop is
+ * the one it is at stands out and says so, and an elite raid gym is marked. With `links`, every stop is
  * a link to its place (for a message; `bare` as for `stopLink`).
  */
 export function routeLines(
@@ -80,7 +81,7 @@ export function routeLines(
   return route.map((gymId, index) => {
     const gym = view.gym(gymId);
     const name = options.links ? stopLink(gym, options.bare) : plain(gymName(gym));
-    const ex = gym && (gym.taggedEx || gym.confirmedEx) ? ' · EX gym' : '';
+    const ex = gym && isEliteGym(gym) ? ' · elite raid gym' : '';
     // The dot is escaped: a numbered list would count anew after a line that is cut out.
     const text = `${index + 1}\\. ${name}${ex}`;
     if (index < stop) return `~~${text}~~`;
```

Apply to `src/services/access-service.ts`:

```diff
--- a/src/services/access-service.ts
+++ b/src/services/access-service.ts
@@ -38,7 +38,7 @@ function takingPart(party: Party): string[] {
 
 /**
  * Access for members of other regions (spec 5.4). A member can sign up for a raid whose post
- * they cannot see: through a copy of it in the server's channel for remote raids or for EX gyms,
+ * they cannot see: through a copy of it in the server's channel for remote raids or for elite raid gyms,
  * by reporting a raid at a gym of another region, or because the raid they are in moved there.
  * Such a member is let into the forum of that region, with a permission overwrite of their own,
  * for as long as they are signed up for a party there, done or not: until they leave and are
```

Apply to `src/services/party-mirrors.ts`:

```diff
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -93,7 +93,7 @@ function slotOf(copy: WantedCopy): string {
 
 /**
  * The copies of a party's message besides the first message of its post (spec 5.2): one in the
- * server's channel for raids at EX gyms, one in its channel for raids that can be joined
+ * server's channel for raids at elite raid gyms, one in its channel for raids that can be joined
  * remotely, one of a train in the text channel of every other region its route has a stop in,
  * and the one `/status` puts at the bottom of the post. Each carries the controls of the post,
  * which name the party in their custom ids, so a member signs up where they see it.
@@ -157,7 +157,7 @@ export class PartyMirrors {
     if (!enabled) return undefined;
     return gateway.findChannel(
       near,
-      settings.channels[kind === 'ex' ? 'ex-gym-raids' : 'remote-raids'],
+      settings.channels[kind === 'ex' ? 'elite-gym-raids' : 'remote-raids'],
     );
   }
 
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/discord/party-gateway.test.ts src/domain/party/raid.test.ts src/render/mirrors.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/party-mirrors.test.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff b5ff379 -- src test scripts data/settings.json   # must print nothing
npx prettier --check data/settings.json src/commands/trains/route.ts src/config/settings.ts src/discord/party-gateway.test.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/render/mirrors.test.ts src/render/mirrors.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/train-post.test.ts src/render/train-post.ts src/services/access-service.ts src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts test/fixtures/settings.json test/support/gyms.ts test/support/party-service.ts
npm run typecheck; npx eslint data/settings.json src/commands/trains/route.ts src/config/settings.ts src/discord/party-gateway.test.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/render/mirrors.test.ts src/render/mirrors.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/train-post.test.ts src/render/train-post.ts src/services/access-service.ts src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts test/fixtures/settings.json test/support/gyms.ts test/support/party-service.ts   # both clean; the full check runs after the last task
git add data/settings.json src/commands/trains/route.ts src/config/settings.ts src/discord/party-gateway.test.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/render/mirrors.test.ts src/render/mirrors.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/train-post.test.ts src/render/train-post.ts src/services/access-service.ts src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-service.meetup.test.ts src/services/party-service.train.test.ts test/fixtures/settings.json test/support/gyms.ts test/support/party-service.ts
git commit -F <a file with the message below>
```

The commit message:

```
Elite raid gyms: what was said of an EX gym says "elite raid gym"

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 4: The gym administration service: add, edit, move, the elite flag, delete

**Files:**
- Create: `src/db/repositories/gym-removal-repository.db.test.ts`, `src/db/repositories/gym-removal-repository.ts`, `src/render/gym-view.ts`, `src/services/gym-admin-service.test.ts`, `src/services/gym-admin-service.ts`, `test/support/gym-admin.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/parties/in-train.test.ts`, `src/commands/raids/raid.test.ts`, `src/commands/raids/raid.ts`, `src/db/repositories/gym-notification-repository.db.test.ts`, `src/db/repositories/gym-notification-repository.ts`, `src/db/repositories/gym-repository.db.test.ts`, `src/db/repositories/gym-repository.ts`, `src/db/repositories/saved-route-repository.db.test.ts`, `src/db/repositories/saved-route-repository.ts`, `src/domain/party/party.ts`, `src/render/activity.ts`, `src/services/gym-directory.test.ts`, `src/services/gym-directory.ts`, `src/services/party-scheduler.ts`, `src/services/party-service.ts`, `src/services/party-store.test.ts`, `src/services/party-store.ts`, `src/services/raid-change-service.ts`, `src/services/train-service.routes.test.ts`, `src/services/train-service.test.ts`, `src/services/train-service.ts`, `test/support/gym-store.ts`, `test/support/gym-targets.ts`, `test/support/party-service.ts`, `test/support/saved-routes.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Tasks 1 to 3; `KeyedLock`; `PartyStore`, `PartyService`, `RaidChangeService`, `TrainService`; `SavedRouteRepository`, `GymNotificationRepository`; `PartyGateway.findChannel`; the scheduler's hourly upkeep; `createTestContext`.
- Produces: `src/services/gym-admin-service.ts`: `GymAdminService` (`ctx.gymAdmin`): `readLocation(text)`, `near(point)`, `regionsOf`, `regionsAt`, `shownBy`, `add`, `edit`, `setElite`, `move`, `refresh`, `targetCount`, `references(gymId)`, `delete`, `flush`, each change under one lock, with a log line of who changed what; `StaffPlace` (the server, the channel, the staff member); `src/db/repositories/gym-removal-repository.ts`: `GymRemovalRepository` (one transaction for the saved routes, the gym targets and the row) and its twin `MemoryGymRemoval`; `SavedRouteRepository.removeGym` / `mentioning`, `GymNotificationRepository.removeGym` / `membersTargeting`; `GymDirectory.forget(id)`; the refusal `gym-gone` (`PartyProblem`, `ReportOutcome`, `RelocateOutcome`) with its sentence; `PartyStore.addRaidUnlessTaken` takes `gymExists`; `TrainService.gymRemoved(gymId, staff)` answering `{ changed, failed }` and `removeUnknownStops()` in the hourly upkeep; `src/render/gym-view.ts` (the announcement); `test/support/gym-admin.ts`; `partyServiceWith` gives all its services one gym list.

`gym-removal-repository.db.test.ts` is new; `saved-route-repository.db.test.ts`, `gym-notification-repository.db.test.ts` and `gym-repository.db.test.ts` change.

Reference commit of the prototype for this task: `a78c3e9`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/parties/in-train.test.ts`:

```diff
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -544,7 +544,13 @@ describe('/where in the post of a train', () => {
     const made = await setup([4]);
     await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
     expect(await made.answer('where')).toBe('This train has finished its route: it is at no gym.');
-    const gone = await setup([999]);
+    // A stop that is no longer in the gym list: only a row from before gyms took their stops
+    // with them can have one (a gym that is not there cannot be added, and a deleted one is
+    // taken off every route), so the train is given it behind the service's back.
+    const gone = await setup([4]);
+    await gone.store.update(gone.party.id, (party) => ({
+      party: party.type === 'train' ? { ...party, train: { ...party.train, route: [999] } } : party,
+    }));
     expect(await gone.answer('where')).toBe('I no longer know the gym this train is at.');
   });
 });
```

Apply to `src/commands/raids/raid.test.ts`:

```diff
--- a/src/commands/raids/raid.test.ts
+++ b/src/commands/raids/raid.test.ts
@@ -19,7 +19,9 @@ import { at, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
+import type { GymLookup } from '../../domain/search/gym-lookup.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { FORUM_TAGS } from '../../render/party-post.js';
 import { raid, raidControls } from './raid.js';
@@ -115,6 +117,21 @@ describe('/raid', () => {
     });
   });
 
+  it('says so when the gym was deleted from the gym list a moment before', async () => {
+    const { run, store, gateway, gyms } = await setup();
+    // The member still had the gym in their list; the services no longer have it.
+    (gyms as GymLookup<Gym>).remove(2);
+    const used = await run({ boss: 'yveltal', gym: 'stone fountain' });
+    expect(sent(used.editReply)).toEqual({
+      content:
+        'Old Stone Fountain was removed from my gym list just now, so there is no raid to ' +
+        'report there.',
+      components: [],
+    });
+    expect(store.active()).toEqual([]);
+    expect(gateway.posts.size).toBe(0);
+  });
+
   it('uses the member’s settings: automatic status and anonymous reports', async () => {
     const users = new MemoryUsers(undefined, {
       autoStatus: PartyStatus.Coming,
```

Apply to `src/db/repositories/gym-notification-repository.db.test.ts`:

```diff
--- a/src/db/repositories/gym-notification-repository.db.test.ts
+++ b/src/db/repositories/gym-notification-repository.db.test.ts
@@ -197,4 +197,24 @@ describe('GymNotificationRepository', () => {
     ];
     expect(await script(targets)).toEqual(await script(memory));
   });
+
+  it('counts the members who target a gym over all servers, and removes its targets', async () => {
+    for (const store of [targets, new MemoryGymTargets()]) {
+      await db.deleteFrom('GymNotification').execute();
+      await store.add(ALICE, HOME, 17);
+      await store.add(ALICE, AWAY, 17);
+      await store.add(BOB, HOME, 17);
+      await store.add(BOB, HOME, 170);
+      expect(await store.membersTargeting(17)).toBe(2);
+      expect(await store.membersTargeting(170)).toBe(1);
+      expect(await store.membersTargeting(1)).toBe(0);
+
+      expect(await store.removeGym(17)).toBe(3);
+
+      expect(await store.membersTargeting(17)).toBe(0);
+      expect(await store.list(ALICE, HOME)).toEqual({ gymIds: [], unreadable: 0 });
+      expect(await store.list(BOB, HOME)).toEqual({ gymIds: [170], unreadable: 0 });
+      expect(await store.removeGym(17)).toBe(0);
+    }
+  });
 });
```

Create `src/db/repositories/gym-removal-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { GymRemovalRepository } from './gym-removal-repository.js';
import { GymRepository } from './gym-repository.js';
import { SavedRouteRepository } from './saved-route-repository.js';

const ALICE = '312345678901234567';
const BOB = '312345678901234568';
const HOME = '412345678901234567';
const AWAY = '412345678901234568';

describe('GymRemovalRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let gyms: GymRepository;
  let routes: SavedRouteRepository;
  let targets: GymNotificationRepository;
  let removal: GymRemovalRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    gyms = new GymRepository(db);
    routes = new SavedRouteRepository(db);
    targets = new GymNotificationRepository(db);
    removal = new GymRemovalRepository(db);
    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('SavedRoutes').execute();
    await db.deleteFrom('GymNotification').execute();
    await db.deleteFrom('Gym').execute();
    await db.deleteFrom('User').execute();
  });

  it('removes the gym with the saved routes and the gym targets that name it', async () => {
    const gone = await gyms.create({ name: 'Going', lat: 40, lon: -80 });
    const stays = await gyms.create({ name: 'Staying', lat: 41, lon: -80 });
    await routes.save(ALICE, 1, 'Loop', [gone.id, stays.id]);
    await routes.save(BOB, 1, 'Only', [gone.id]);
    await routes.save(BOB, 1, 'Other', [stays.id]);
    // One member in two servers is one member.
    await targets.add(ALICE, HOME, gone.id);
    await targets.add(ALICE, AWAY, gone.id);
    await targets.add(BOB, HOME, gone.id);
    await targets.add(BOB, HOME, stays.id);

    await expect(removal.remove(gone.id)).resolves.toEqual({ routes: 2, targets: 2 });

    await expect(gyms.get(gone.id)).resolves.toBeUndefined();
    await expect(gyms.get(stays.id)).resolves.toBeDefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', gyms: [stays.id] }]);
    expect(await routes.list(BOB, 1)).toMatchObject([{ name: 'Other', gyms: [stays.id] }]);
    expect(await targets.membersTargeting(gone.id)).toBe(0);
    expect(await targets.list(BOB, HOME)).toEqual({ gymIds: [stays.id], unreadable: 0 });
  });

  it('cleans up what names a gym whose row is gone already', async () => {
    await routes.save(ALICE, 1, 'Loop', [77, 78]);
    await targets.add(ALICE, HOME, 77);
    await expect(removal.remove(77)).resolves.toEqual({ routes: 1, targets: 1 });
    expect(await routes.list(ALICE, 1)).toMatchObject([{ gyms: [78] }]);
  });

  it('changes nothing when a part of it fails', async () => {
    const gym = await gyms.create({ name: 'Going', lat: 40, lon: -80 });
    await routes.save(ALICE, 1, 'Loop', [gym.id]);
    await targets.add(ALICE, HOME, gym.id);
    // The last step of the removal is refused by the database: a row that must keep the gym.
    await sql`create table GymKeeper (gymId int unsigned not null,
      constraint gymkeeper_gym foreign key (gymId) references Gym (id))`.execute(db);
    await sql`insert into GymKeeper (gymId) values (${gym.id})`.execute(db);
    try {
      await expect(removal.remove(gym.id)).rejects.toThrow();
    } finally {
      await sql`drop table GymKeeper`.execute(db);
    }
    await expect(gyms.get(gym.id)).resolves.toBeDefined();
    expect(await routes.list(ALICE, 1)).toMatchObject([{ name: 'Loop', gyms: [gym.id] }]);
    expect(await targets.membersTargeting(gym.id)).toBe(1);
  });
});
```

Apply to `src/db/repositories/gym-repository.db.test.ts`:

```diff
--- a/src/db/repositories/gym-repository.db.test.ts
+++ b/src/db/repositories/gym-repository.db.test.ts
@@ -5,7 +5,7 @@ import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
 import type { DB } from '../types.js';
 import { GuildRepository } from './guild-repository.js';
-import { GymRepository } from './gym-repository.js';
+import { GymRepository, storedTextLength } from './gym-repository.js';
 import { RegionRepository } from './region-repository.js';
 
 const DOWNTOWN = '1234567890123456788';
@@ -58,6 +58,43 @@ describe('GymRepository', () => {
     expect(await gyms.get(created.id)).toEqual(created);
   });
 
+  it('creates a gym with everything a moderator may give it at once', async () => {
+    const created = await gyms.create({
+      name: "Rosie's Diner",
+      lat: 40.45,
+      lon: -80.0,
+      nickname: 'Rosie',
+      description: 'Neon sign',
+      notice: "Don't block the drive",
+      keywords: [' Diner ', 'NEON', ''],
+    });
+    expect(created).toMatchObject({
+      name: "Rosie's Diner",
+      nickname: 'Rosie',
+      description: 'Neon sign',
+      notice: "Don't block the drive",
+      keywords: ['diner', 'neon'],
+    });
+    const meta = await db
+      .selectFrom('GymMeta')
+      .select(['notice', 'keywords'])
+      .where('gymId', '=', created.id)
+      .executeTakeFirstOrThrow();
+    // As the legacy bot stores them: the notice encoded, the keywords joined by comma and space.
+    expect(meta).toEqual({ notice: he.encode("Don't block the drive"), keywords: 'diner, neon' });
+  });
+
+  it('measures a text as it is stored', async () => {
+    expect(storedTextLength('Big Fountain')).toBe(12);
+    expect(storedTextLength("Rosie's")).toBe(he.encode("Rosie's").length);
+    expect(storedTextLength("Rosie's")).toBeGreaterThan(7);
+    // What it says fits does fit, and is read back whole.
+    const name = "'".repeat(42) + 'abc';
+    expect(storedTextLength(name)).toBe(255);
+    const created = await gyms.create({ name, lat: 40.45, lon: -80.0 });
+    expect(created.name).toBe(name);
+  });
+
   it('returns undefined for an unknown gym', async () => {
     expect(await gyms.get(987654)).toBeUndefined();
     expect(await gyms.update(987654, { notice: 'x' })).toBeUndefined();
```

Apply to `src/db/repositories/saved-route-repository.db.test.ts`:

```diff
--- a/src/db/repositories/saved-route-repository.db.test.ts
+++ b/src/db/repositories/saved-route-repository.db.test.ts
@@ -186,6 +186,108 @@ describe('SavedRouteRepository', () => {
     await db.deleteFrom('User').execute();
     expect(await db.selectFrom('SavedRoutes').select('name').execute()).toEqual([]);
   });
+
+  it('counts the routes that have a gym as a stop, whoever saved them and where', async () => {
+    await routes.save(ALICE, WEST, 'Downtown loop', [4, 17, 7]);
+    await routes.save(ALICE, EAST, 'East side', [17]);
+    await routes.save(BOB, WEST, 'Lunch', [170, 1]);
+    await routes.save(BOB, EAST, 'Other', [2, 3]);
+    expect(await routes.countWithGym(17)).toBe(2);
+    expect(await routes.countWithGym(1)).toBe(1);
+    expect(await routes.countWithGym(70)).toBe(0);
+    expect(await routes.countWithGym(99)).toBe(0);
+  });
+
+  it('takes a gym off every saved route and removes a route left without a stop', async () => {
+    await routes.save(ALICE, WEST, 'Downtown loop', [4, 17, 7]);
+    await routes.save(ALICE, EAST, 'East side', [17]);
+    await routes.save(BOB, WEST, 'Lunch', [170, 1]);
+    // A row as the legacy bot may have left it: spaces, the gym twice.
+    const userId = await users.ensure(BOB);
+    await db
+      .insertInto('SavedRoutes')
+      .values({ userId, region: EAST, name: 'Legacy', gyms: '17, 5,17' })
+      .execute();
+
+    expect(await routes.removeGym(17)).toEqual({ changed: 2, removed: 1 });
+
+    expect(await routes.list(ALICE, WEST)).toMatchObject([{ name: 'Downtown loop', gyms: [4, 7] }]);
+    expect(await routes.list(ALICE, EAST)).toEqual([]);
+    // 170 is another gym.
+    expect(await routes.list(BOB, WEST)).toMatchObject([{ name: 'Lunch', gyms: [170, 1] }]);
+    expect(await routes.list(BOB, EAST)).toMatchObject([{ name: 'Legacy', gyms: [5] }]);
+    expect(await routes.countWithGym(17)).toBe(0);
+    expect(await routes.removeGym(17)).toEqual({ changed: 0, removed: 0 });
+  });
+
+  it('takes a gym off the routes inside a transaction of the caller, and back out with it', async () => {
+    await routes.save(ALICE, WEST, 'Downtown loop', [4, 17, 7]);
+    await routes.save(ALICE, EAST, 'East side', [17]);
+    await expect(
+      db.transaction().execute(async (trx) => {
+        expect(await new SavedRouteRepository(trx).removeGym(17)).toEqual({
+          changed: 1,
+          removed: 1,
+        });
+        throw new Error('the rest of it failed');
+      }),
+    ).rejects.toThrow('the rest of it failed');
+    expect(await routes.countWithGym(17)).toBe(2);
+  });
+
+  it('saves the very same route again as a replacement of its one row', async () => {
+    const first = await routes.save(ALICE, WEST, 'Loop', [4, 17]);
+    // Nothing differs: the database changes no row, and it is a replacement all the same.
+    const again = await routes.save(ALICE, WEST, 'Loop', [4, 17]);
+    expect(again).toMatchObject({ kind: 'replaced' });
+    expect(again.kind === 'replaced' && first.kind === 'saved' && again.route.id).toBe(
+      first.kind === 'saved' ? first.route.id : -1,
+    );
+    expect(await routes.list(ALICE, WEST)).toHaveLength(1);
+  });
+
+  it('decides by the route as it is when its turn comes, not as it was listed', async () => {
+    // Three routes with the gym. While the removal runs, a member saves two of them anew:
+    // one without the gym, one with other stops beside it.
+    await routes.save(ALICE, WEST, 'Without', [4, 17, 7]);
+    await routes.save(ALICE, EAST, 'Changed', [17, 1]);
+    await routes.save(BOB, WEST, 'Untouched', [17, 2]);
+    let saved: () => void = () => undefined;
+    const resaved = new Promise<void>((resolve) => {
+      saved = resolve;
+    });
+    let commit: () => void = () => undefined;
+    const held = new Promise<void>((resolve) => {
+      commit = resolve;
+    });
+    // The member's saves, written and not yet committed: their rows are locked.
+    const saving = db.transaction().execute(async (trx) => {
+      await trx
+        .updateTable('SavedRoutes')
+        .set({ gyms: '4,7' })
+        .where('name', '=', 'Without')
+        .execute();
+      await trx
+        .updateTable('SavedRoutes')
+        .set({ gyms: '17,8,9' })
+        .where('name', '=', 'Changed')
+        .execute();
+      saved();
+      await held;
+    });
+    await resaved;
+    // The removal lists the rows as they were committed (all three have the gym) and waits
+    // for the first of them.
+    const removing = routes.removeGym(17);
+    await new Promise((resolve) => setTimeout(resolve, 300));
+    commit();
+    await saving;
+
+    await expect(removing).resolves.toEqual({ changed: 2, removed: 0 });
+    expect(await routes.list(ALICE, WEST)).toMatchObject([{ name: 'Without', gyms: [4, 7] }]);
+    expect(await routes.list(ALICE, EAST)).toMatchObject([{ name: 'Changed', gyms: [8, 9] }]);
+    expect(await routes.list(BOB, WEST)).toMatchObject([{ name: 'Untouched', gyms: [2] }]);
+  });
 });
 
 describe('routeGyms', () => {
```

Create `src/services/gym-admin-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gymAdminWith, STAFF, STAFF_PLACE, UPDATES_CHANNEL } from '../../test/support/gym-admin.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, asTrain, BOB, REPORTER } from '../../test/support/parties.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import { nearestTo } from '../domain/geo/distance.js';
import { PartyStatus } from '../domain/party/status.js';
import { currentStop } from '../domain/party/train.js';
import type { Member } from './attendance-service.js';
import type { RaidReport } from './party-service.js';

type Made = Awaited<ReturnType<typeof gymAdminWith>>;

const staff: Member = { id: STAFF, name: 'Morgan' };
const maker: Member = { id: REPORTER, name: 'Rae' };
/** A place in West, far from every invented gym. */
const FREE = { lat: 40.015, lon: -80.015 };

function gymOf(made: Made, id: number): Gym {
  const gym = made.directory.get(id);
  if (!gym) throw new Error(`no gym ${id}`);
  return gym;
}

const report = (made: Made, gymId: number, more: Partial<RaidReport> = {}): RaidReport => ({
  gym: gymOf(made, gymId),
  reporterId: REPORTER,
  anonymous: false,
  autoStatus: PartyStatus.Interested,
  tier: { level: 'T5', shadow: false },
  boss: null,
  ...more,
});

/** A train of the member who made it, on a route of these gyms. */
async function trainOn(made: Made, route: readonly number[]) {
  const created = await made.service.createTrain({
    name: 'Saturday legendaries',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
  });
  if (created.kind !== 'created') throw new Error('no train');
  for (const gymId of route) await made.trains.addStop(created.party.id, maker, gymId);
  await settle(made);
  const postId = created.party.forumPostId ?? '';
  for (const message of made.gateway.messagesIn(postId)) {
    await made.gateway.deleteMessage(postId, message.id);
  }
  return {
    id: created.party.id,
    postId,
    current: () => asTrain(made.store.get(created.party.id)),
    said: () => made.gateway.messagesIn(postId).map((message) => message.message.content ?? ''),
  };
}

/** Lets everything that is under way go out. */
async function settle(made: Made): Promise<void> {
  await made.upkeep.flush();
  await made.admin.flush();
  await made.trains.flush();
  await made.attendance.flush();
  await made.service.flush();
}

const announced = (made: Made) =>
  made.gateway.messagesIn(UPDATES_CHANNEL).map((message) => message.message);

/**
 * Holds the deletion of a gym's row (and nothing else: what reads the gyms goes on), so that a
 * test can do something while a deletion is inside the gym's lock; gives the release.
 */
function heldDelete(made: Made): () => void {
  let release: () => void = () => undefined;
  made.gymStore.holdOn.delete = new Promise((resolve) => {
    release = resolve;
  });
  return () => {
    made.gymStore.holdOn = {};
    release();
  };
}

/**
 * Holds the next write of one party (the change is decided, its row is on its way), so that a
 * test can do something meanwhile; gives the release.
 */
function heldSave(made: Made, partyId: string): () => void {
  const save = made.storage.save.bind(made.storage);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = false;
  made.storage.save = async (party) => {
    if (party.id === partyId && !held) {
      held = true;
      await gate;
    }
    return save(party);
  };
  return release;
}

/** Waits until every timer-less step that is under way has had its turn. */
async function turns(count = 20): Promise<void> {
  for (let turn = 0; turn < count; turn++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('GymAdminService: reading a location', () => {
  it('reads coordinates and links without asking anybody', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.readLocation('40.4406, -79.9959')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: false,
    });
    // Where a map was centred is only near the place.
    await expect(
      made.admin.readLocation('https://www.google.com/maps/@40.4406,-79.9959,17z'),
    ).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: true,
    });
    await expect(made.admin.readLocation('the library')).resolves.toEqual({ kind: 'unreadable' });
    await expect(made.admin.readLocation('95.5, 10')).resolves.toEqual({ kind: 'out-of-range' });
    expect(made.geo.asked).toEqual([]);
  });

  it('follows a short link to the address it leads to', async () => {
    const made = await gymAdminWith();
    made.geo.links.set(
      'https://maps.app.goo.gl/AbC123',
      'https://www.google.com/maps/place/X/@40.5,-79.9,17z/data=!3d40.4406!4d-79.9959',
    );
    await expect(made.admin.readLocation('https://maps.app.goo.gl/AbC123')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: false,
    });
    expect(made.geo.questions('link')).toEqual([
      { what: 'link', url: 'https://maps.app.goo.gl/AbC123' },
    ]);
  });

  it('tells a short link that names no coordinates from one that could not be followed', async () => {
    const made = await gymAdminWith();
    // What many links of the app lead to: a place by its name and Google's own id.
    made.geo.links.set(
      'https://maps.app.goo.gl/Named',
      'https://www.google.com/maps/place/Big+Fountain/data=!4m2!3m1!1s0x8834f1:0x1',
    );
    await expect(made.admin.readLocation('https://maps.app.goo.gl/Named')).resolves.toEqual({
      kind: 'link-nowhere',
    });
    await expect(made.admin.readLocation('https://maps.app.goo.gl/Unknown')).resolves.toEqual({
      kind: 'link-failed',
    });
  });

  it('takes where a map was centred only when the link leads to nothing better', async () => {
    const made = await gymAdminWith();
    // The fake hands every address of the link's way to the reader, as the real one does.
    const centred = 'https://www.google.com/maps/place/Big+Fountain/@40.5,-79.9,17z';
    const pinned = `${centred}/data=!3d40.4406!4d-79.9959`;
    made.geo.followShortLink = (_url, readable) =>
      Promise.resolve([centred, pinned].find((address) => readable(address)));
    await expect(made.admin.readLocation('https://maps.app.goo.gl/Two')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.4406, lon: -79.9959 },
      approximate: false,
    });
    made.geo.followShortLink = (_url, readable) =>
      Promise.resolve([centred].find((address) => readable(address)));
    await expect(made.admin.readLocation('https://maps.app.goo.gl/One')).resolves.toEqual({
      kind: 'point',
      point: { lat: 40.5, lon: -79.9 },
      approximate: true,
    });
  });
});

describe('GymAdminService: where a gym is', () => {
  it('finds the gyms within ten metres of a point, nearest first', async () => {
    const made = await gymAdminWith();
    // The Library is at 40.05, -80.05; 0.00005 degrees of latitude are 5.6 metres.
    const near = made.admin.near({ lat: 40.05005, lon: -80.05 });
    expect(near.map(({ gym }) => gym.id)).toEqual([1]);
    expect(near[0]?.metres).toBeCloseTo(5.56, 1);
    expect(made.admin.near({ lat: 40.0502, lon: -80.05 })).toEqual([]);
    // The gym that is being moved does not stand in its own way.
    expect(made.admin.near({ lat: 40.05005, lon: -80.05 }, 1)).toEqual([]);
  });

  it('names the regions of a server a gym or a point lies in', async () => {
    const made = await gymAdminWith();
    expect(made.admin.regionsOf(1, 1).map((region) => region.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.admin.regionsOf(10, 1)).toEqual([]);
    expect(made.admin.regionsOf(1, 2)).toEqual([]);
    expect(made.admin.regionsOf(1, undefined)).toEqual([]);
    expect(made.admin.regionsAt(FREE, 1).map((region) => region.channelId)).toEqual([WEST_CHANNEL]);
    expect(made.admin.regionsAt({ lat: 40.05, lon: -79.95 }, 1).map((r) => r.channelId)).toEqual([
      EAST_CHANNEL,
    ]);
    expect(made.admin.regionsAt({ lat: 41, lon: -80 }, 1)).toEqual([]);
    expect(made.admin.regionsAt(FREE, 2)).toEqual([]);
  });
});

describe('GymAdminService.add', () => {
  it('stores the gym, makes it findable at once and settles the nearest gyms', async () => {
    const made = await gymAdminWith();
    const gym = await made.admin.add(
      { name: 'Clock Tower', ...FREE, nickname: 'Big Ben', keywords: ['clock'] },
      STAFF_PLACE,
    );
    expect(gym).toMatchObject({ id: 13, name: 'Clock Tower', nickname: 'Big Ben', ...FREE });
    expect(gym.nearestGym).not.toBeNull();
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', keywords: ['clock'] });
    // Found before anything was fetched: the answer does not wait for Google.
    expect(made.directory.search(WEST_CHANNEL, 'clock tower')[0]?.gym.id).toBe(13);
    expect(made.directory.regionsOf(13)).toEqual([WEST_CHANNEL]);
    expect(made.gymStore.row(13)?.geodata).toBeNull();

    await settle(made);
    expect(made.gymStore.row(13)).toMatchObject({
      geodata: '{"addressComponents":{"route":"Test Road","locality":"Pinewood"}}',
      places: 'Corner Bakery Maple Dental',
    });
    expect(made.directory.get(13)?.places).toBe('Corner Bakery Maple Dental');
  });

  it('tells the channel for bot updates, without a ping', async () => {
    const made = await gymAdminWith();
    await made.admin.add({ name: 'Clock *Tower*', ...FREE, nickname: 'Big Ben' }, STAFF_PLACE);
    await settle(made);
    expect(announced(made)).toEqual([
      {
        content: 'A gym was added to the gym list.',
        embeds: [
          {
            title: 'Clock \\*Tower\\*',
            url: 'https://www.google.com/maps/search/?api=1&query=40.015%2C-80.015',
            description: `Also known as **Big Ben**.\nIt lies in <#${WEST_CHANNEL}>.`,
            color: 0x3498db,
            footer: { text: 'Gym #13' },
          },
        ],
      },
    ]);
  });

  it('says of a gym outside every region of the server that it lies in none', async () => {
    const made = await gymAdminWith();
    await made.admin.add({ name: 'Far Away', lat: 41, lon: -80 }, STAFF_PLACE);
    await settle(made);
    expect(announced(made)[0]?.embeds?.[0]?.description).toBe(
      'It lies in no region of this server.',
    );
  });

  it('announces nothing where the setting is off or the server has no such channel', async () => {
    const off = await gymAdminWith();
    off.settings.postNewGyms = false;
    await off.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(off);
    expect(announced(off)).toEqual([]);

    const none = await gymAdminWith();
    none.gateway.channelNames.delete(UPDATES_CHANNEL);
    await none.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(none);
    expect(none.gateway.messages).toEqual([]);
  });

  it('adds the gym also when the announcement fails, and logs that', async () => {
    const made = await gymAdminWith();
    made.gateway.failing.set('sendMessage', new Error('Missing Access'));
    await expect(
      made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE),
    ).resolves.toMatchObject({ id: 13 });
    await settle(made);
    expect(
      made.entries.some((entry) => entry.msg === 'could not announce a change of the gym list'),
    ).toBe(true);
  });

  it('adds the gym without an API key, with neither address nor places', async () => {
    const made = await gymAdminWith();
    made.geo.enabled = false;
    expect(made.admin.fetches).toBe(false);
    const gym = await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    await settle(made);
    expect(made.directory.get(gym.id)).toMatchObject({ geodata: null, places: null });
    expect(made.directory.get(gym.id)?.nearestGym).not.toBeNull();
  });
});

describe('GymAdminService.edit and setElite', () => {
  it('writes only the fields that are given', async () => {
    const made = await gymAdminWith();
    made.gymStore.writes.length = 0;
    const gym = await made.admin.edit(1, { nickname: null, notice: 'Closed on Sundays' }, STAFF);
    expect(gym).toMatchObject({
      id: 1,
      name: 'Pinewood Public Library',
      nickname: null,
      notice: 'Closed on Sundays',
      description: 'Mural of readers beside the front doors',
    });
    expect(made.gymStore.writes).toEqual([
      { what: 'update', id: 1, patch: { nickname: null, notice: 'Closed on Sundays' } },
    ]);
    // Found by its new texts and no longer by the old ones.
    expect(made.directory.search(null, 'stacks').some((hit) => hit.gym.id === 1)).toBe(false);
  });

  it('writes nothing for no change, and answers the gym as it is', async () => {
    const made = await gymAdminWith();
    made.gymStore.writes.length = 0;
    await expect(made.admin.edit(1, {}, STAFF)).resolves.toMatchObject({ id: 1 });
    expect(made.gymStore.writes).toEqual([]);
  });

  it('answers undefined for a gym that is not there', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.edit(99, { notice: 'x' }, STAFF)).resolves.toBeUndefined();
    await expect(made.admin.setElite(99, true, STAFF)).resolves.toBeUndefined();
    await expect(made.admin.move(99, FREE, STAFF)).resolves.toBeUndefined();
  });

  it('shows a changed gym in the post of a raid there and of a train through it', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 1));
    if (raid.kind !== 'created') throw new Error('no raid');
    const train = await trainOn(made, [2, 1]);
    await settle(made);

    await made.admin.edit(
      1,
      { name: 'Reading Room', nickname: null, notice: 'Closed on Sundays' },
      STAFF,
    );
    await settle(made);

    const post = made.gateway.posts.get(raid.party.forumPostId ?? '');
    expect(post?.title).toContain('Reading Room');
    expect(JSON.stringify(post?.message)).toContain('Closed on Sundays');
    expect(JSON.stringify(made.gateway.posts.get(train.postId)?.message)).toContain('Reading Room');
  });

  it('makes a gym an elite raid gym by its tag, and clears both flags when it is none', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.setElite(1, true, STAFF)).resolves.toMatchObject({
      taggedEx: true,
      confirmedEx: false,
    });
    // A gym that the legacy bot marked as having hosted such a raid keeps that.
    await made.gymStore.update(2, { confirmedEx: true });
    await expect(made.admin.setElite(2, true, STAFF)).resolves.toMatchObject({
      taggedEx: true,
      confirmedEx: true,
    });
    await expect(made.admin.setElite(2, false, STAFF)).resolves.toMatchObject({
      taggedEx: false,
      confirmedEx: false,
    });
    expect(made.gymStore.row(2)).toMatchObject({ taggedEx: false, confirmedEx: false });
  });
});

describe('GymAdminService.move', () => {
  it('moves the gym, sorts it into its new region and fetches its address again', async () => {
    const made = await gymAdminWith();
    const target = { lat: 40.05, lon: -79.95 };
    const moved = await made.admin.move(6, target, STAFF);
    expect(moved?.gym).toMatchObject({ id: 6, ...target });
    // Where it was, and how far it went.
    expect(moved?.from).toEqual({ lat: 40.03, lon: -80.03 });
    expect(moved?.metres).toBeGreaterThan(7_000);
    expect(moved?.metres).toBeLessThan(7_500);
    expect(made.directory.regionsOf(6)).toEqual([EAST_CHANNEL]);
    expect(made.directory.search(EAST_CHANNEL, 'maple leaf mosaic')[0]?.place).toBe('local');
    await settle(made);
    expect(made.geo.questions('geocode').map((asked) => asked.point)).toEqual([target]);
    // No gym keeps a nearest gym that the move made wrong.
    const all = made.directory.all();
    for (const gym of all) {
      expect([gym.id, gym.nearestGym]).toEqual([gym.id, nearestTo(gym, all)?.place.id]);
    }
    expect(announced(made)).toEqual([]);
  });

  it('is never refused for a raid at the gym or a train through it: they stay what they are', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 6));
    if (raid.kind !== 'created') throw new Error('no raid');
    const train = await trainOn(made, [1, 6]);
    expect(made.admin.shownBy(6)).toMatchObject({
      raids: [{ id: raid.party.id }],
      trains: [{ id: train.id }],
    });
    await expect(made.admin.move(6, { lat: 40.05, lon: -79.95 }, STAFF)).resolves.toBeDefined();
    expect(made.store.get(raid.party.id)).toMatchObject({ gymId: 6, regionId: 1 });
    expect(train.current().train.route).toEqual([1, 6]);
    expect(made.admin.inAnyRegion(6)).toBe(true);
    await made.admin.move(6, { lat: 41, lon: -80 }, STAFF);
    expect(made.admin.inAnyRegion(6)).toBe(false);
  });
});

describe('GymAdminService: the log of what staff change', () => {
  it('notes who changed which gym and what, never the texts', async () => {
    const made = await gymAdminWith();
    const gym = await made.admin.add({ name: 'Secret Name', ...FREE }, STAFF_PLACE);
    await made.admin.edit(gym.id, { notice: 'Secret notice', nickname: 'Secret nick' }, STAFF);
    await made.admin.setElite(gym.id, true, STAFF);
    await made.admin.move(gym.id, { lat: 40.016, lon: -80.015 }, STAFF);
    await made.admin.delete(gym.id, staff, STAFF_PLACE);
    const noted = made.entries.filter((entry) => entry.staff === STAFF);
    expect(noted.map((entry) => entry.msg)).toEqual([
      'a gym was added',
      'the texts of a gym were changed',
      'the elite flag of a gym was set',
      'a gym was moved',
      'a gym was deleted',
    ]);
    expect(noted.every((entry) => entry.gym === gym.id && entry.level === 30)).toBe(true);
    expect(noted[1]).toMatchObject({ fields: ['notice', 'nickname'] });
    expect(noted[2]).toMatchObject({ elite: true });
    expect(noted[3]).toMatchObject({
      from: { lat: 40.015, lon: -80.015 },
      to: { lat: 40.016, lon: -80.015 },
    });
    expect(JSON.stringify(noted)).not.toContain('Secret');
    // A change that was not made is not noted.
    made.entries.length = 0;
    await made.admin.edit(1, {}, STAFF);
    await made.admin.edit(99, { notice: 'x' }, STAFF);
    expect(made.entries.filter((entry) => entry.staff === STAFF)).toEqual([]);
  });
});

describe('GymAdminService.add when something after the row fails', () => {
  it('answers the gym that was stored, and logs what failed', async () => {
    const made = await gymAdminWith();
    // The row is written, and then the directory cannot read it.
    made.gymStore.failingOn.get = new Error('database is down');
    const gym = await made.admin.add({ name: 'Clock Tower', ...FREE }, STAFF_PLACE);
    expect(gym).toMatchObject({ id: 13, name: 'Clock Tower' });
    expect(made.gymStore.row(13)).toBeDefined();
    expect(
      made.entries.some(
        (entry) => entry.msg === 'a gym was added, but not everything after it worked',
      ),
    ).toBe(true);
  });
});

describe('GymAdminService.delete', () => {
  it('says what refers to a gym', async () => {
    const made = await gymAdminWith();
    await trainOn(made, [4, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    made.routes.add(BOB, 2, 'Other', [6]);
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    const references = await made.admin.references(6);
    expect(references).toMatchObject({ raids: [], trains: 1, routes: 2, targets: 1 });
    expect(await made.admin.targetCount(6)).toBe(1);
    expect(await made.admin.references(3)).toEqual({ raids: [], trains: 0, routes: 0, targets: 0 });
  });

  it('refuses while an active raid is at the gym, and deletes nothing', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 6));
    if (raid.kind !== 'created') throw new Error('no raid');
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);

    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);

    expect(outcome).toMatchObject({ kind: 'raid-there', raid: { id: raid.party.id } });
    expect(made.gymStore.row(6)).toBeDefined();
    expect(made.routes.rows[0]?.gyms).toEqual([6, 1]);
    expect((await made.admin.references(6)).raids.map((party) => party.id)).toEqual([
      raid.party.id,
    ]);
  });

  it('deletes the gym with everything that refers to it', async () => {
    const made = await gymAdminWith();
    // A train that is at the gym, and one that has it further down its route.
    const at = await trainOn(made, [6, 4]);
    await made.attendance.signUp(at.id, maker, PartyStatus.Present);
    const later = await trainOn(made, [1, 6, 2]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    made.routes.add(BOB, 1, 'Only', [6]);
    // One member in two servers is one member.
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    await made.gymTargets.add(ALICE, '412345678901234568', 6);
    await made.gymTargets.add(BOB, made.gateway.guildId, 6);
    await made.gymTargets.add(BOB, made.gateway.guildId, 4);
    await settle(made);
    for (const train of [at, later]) {
      for (const message of made.gateway.messagesIn(train.postId)) {
        await made.gateway.deleteMessage(train.postId, message.id);
      }
    }
    // A gym right beside it, which has it as its nearest.
    const beside = await made.admin.add({ name: 'Beside', lat: 40.0302, lon: -80.03 }, STAFF_PLACE);
    await settle(made);
    const pointing = made.directory.all().filter((gym) => gym.nearestGym === 6);
    expect(pointing.map((gym) => gym.id)).toContain(beside.id);

    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);
    await settle(made);

    expect(outcome).toMatchObject({
      kind: 'deleted',
      gym: { id: 6, name: 'Maple Leaf Mosaic' },
      trains: 2,
      routes: 2,
      // Members, not rows.
      targets: 2,
      unmended: [],
    });
    expect(made.gymStore.row(6)).toBeUndefined();
    expect(made.directory.get(6)).toBeUndefined();
    expect(made.directory.search(null, 'maple leaf mosaic').some((hit) => hit.gym.id === 6)).toBe(
      false,
    );
    // The train that was there has moved on, as after any removal of its current stop.
    expect(at.current().train.route).toEqual([4]);
    expect(currentStop(at.current())).toBe(4);
    expect(at.current().attendees[REPORTER]?.status).toBe(PartyStatus.Coming);
    // The line that says why, and the announcement of where the train is going, which pings
    // the member who is signed up and names the staff member as the one who moved it.
    expect(at.said().sort()).toEqual([
      "**Maple Leaf Mosaic** was removed from Pine's gym list.",
      expect.stringMatching(
        /^The train is moving to \[Veterans Memorial Bridge\].*Moved by \*\*Morgan\*\*.*\n<@200000000000000001>$/s,
      ) as string,
    ]);
    // The other train stays where it is and is told as well.
    expect(later.current().train.route).toEqual([1, 2]);
    expect(currentStop(later.current())).toBe(1);
    expect(later.said()).toEqual(["**Maple Leaf Mosaic** was removed from Pine's gym list."]);
    expect(JSON.stringify(made.gateway.posts.get(later.postId)?.message)).not.toContain(
      'Maple Leaf Mosaic',
    );
    // Saved routes and gym targets, of everybody.
    expect(made.routes.rows.map((row) => [row.name, row.gyms])).toEqual([['Loop', [1]]]);
    expect(made.gymTargets.rows.map((row) => row.gym)).toEqual(['4']);
    // The gyms that had it as their nearest have another.
    for (const gym of pointing) {
      const now = made.directory.get(gym.id)?.nearestGym;
      expect(now).not.toBe(6);
      expect(now).not.toBeNull();
    }
    expect(announced(made).at(-1)).toEqual({
      content: '**Maple Leaf Mosaic** (#6) was removed from the gym list.',
    });
  });

  it('answers gone for a gym that is not there, also the second time', async () => {
    const made = await gymAdminWith();
    await expect(made.admin.delete(99, staff, STAFF_PLACE)).resolves.toEqual({ kind: 'gone' });
    await made.admin.delete(6, staff, STAFF_PLACE);
    await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toEqual({ kind: 'gone' });
    await settle(made);
    expect(announced(made)).toHaveLength(1);
  });

  it.each(['routes', 'gymTargets', 'gymStore'] as const)(
    'changes nothing, and tells nobody, when the %s cannot be written',
    async (store) => {
      const made = await gymAdminWith();
      const train = await trainOn(made, [6, 1]);
      await made.attendance.signUp(train.id, maker, PartyStatus.Present);
      made.routes.add(ALICE, 1, 'Loop', [6, 1]);
      await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
      await settle(made);
      const saidBefore = train.said();
      made[store].failing = new Error('database is down');

      await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toEqual({ kind: 'failed' });
      made[store].failing = undefined;
      await settle(made);

      // The gym is there, and so is everything that names it.
      expect(made.gymStore.row(6)).toBeDefined();
      expect(made.directory.get(6)).toBeDefined();
      expect(made.routes.rows.map((row) => row.gyms)).toEqual([[6, 1]]);
      expect(made.gymTargets.rows.map((row) => row.gym)).toEqual(['6']);
      // Nothing visible happened: the train is at the gym, its post was told nothing, nobody
      // was pinged, the channel for updates is silent.
      expect(train.current().train.route).toEqual([6, 1]);
      expect(train.current().attendees[REPORTER]?.status).toBe(PartyStatus.Present);
      expect(train.said()).toEqual(saidBefore);
      expect(announced(made)).toEqual([]);
      // And it can be deleted once the database works again.
      await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toMatchObject({
        kind: 'deleted',
        trains: 1,
        routes: 1,
        targets: 1,
      });
    },
  );

  it('leaves no ghost when the directory cannot read the database after the row is gone', async () => {
    const made = await gymAdminWith();
    const gym = report(made, 6);
    // The removal works; every read of a gym after it fails.
    made.gymStore.failingOn.get = new Error('database is down');

    await expect(made.admin.delete(6, staff, STAFF_PLACE)).resolves.toMatchObject({
      kind: 'deleted',
    });

    expect(made.gymStore.row(6)).toBeUndefined();
    expect(made.directory.get(6)).toBeUndefined();
    expect(made.directory.search(null, 'maple leaf mosaic').some((hit) => hit.gym.id === 6)).toBe(
      false,
    );
    // A report there answers with a sentence instead of failing on the database's key.
    await expect(made.service.reportRaid(gym)).resolves.toEqual({ kind: 'gym-gone' });
    expect(made.store.active()).toEqual([]);
    await settle(made);
    expect(announced(made)).toHaveLength(1);
  });

  it('answers deleted also when the trains cannot be looked at, and names them', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1, 6]);
    made.trains.gymRemoved = () => Promise.reject(new Error('trains failed'));
    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);
    expect(outcome).toMatchObject({ kind: 'deleted', trains: 0 });
    expect(outcome.kind === 'deleted' && outcome.unmended.map((left) => left.id)).toEqual([
      train.id,
    ]);
    expect(made.directory.get(6)).toBeUndefined();
    expect(
      made.entries.some(
        (entry) => entry.msg === 'could not take a deleted gym off the routes of trains',
      ),
    ).toBe(true);
  });

  it('has the hourly upkeep take the stop off a train that could not be changed then', async () => {
    const made = await gymAdminWith();
    const broken = await trainOn(made, [6, 1]);
    await made.attendance.signUp(broken.id, maker, PartyStatus.Present);
    await settle(made);
    const remove = made.removal.remove.bind(made.removal);
    made.removal.remove = async (id) => {
      const counts = await remove(id);
      made.storage.failing = new Error('party table is locked');
      return counts;
    };
    await made.admin.delete(6, staff, STAFF_PLACE);
    made.storage.failing = undefined;
    await settle(made);
    expect(broken.current().train.route).toEqual([6, 1]);
    const before = broken.said().length;

    made.clock.now += 3_600_000;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    await settle(made);

    expect(broken.current().train.route).toEqual([1]);
    expect(currentStop(broken.current())).toBe(1);
    // The bot's own act: a line in the post, and no ping.
    const said = made.gateway.messagesIn(broken.postId).slice(before);
    expect(said.map((message) => message.message)).toEqual([
      { content: "A stop was removed: its gym is no longer in Pine's gym list." },
    ]);
  });

  it('names a train that could not be changed, and deletes the gym all the same', async () => {
    const made = await gymAdminWith();
    const broken = await trainOn(made, [1, 6]);
    // The removal of the gym works; the train cannot be stored.
    const remove = made.removal.remove.bind(made.removal);
    made.removal.remove = async (id) => {
      const counts = await remove(id);
      made.storage.failing = new Error('party table is locked');
      return counts;
    };

    const outcome = await made.admin.delete(6, staff, STAFF_PLACE);
    made.storage.failing = undefined;

    expect(outcome).toMatchObject({ kind: 'deleted', trains: 0 });
    if (outcome.kind !== 'deleted') return;
    expect(outcome.unmended.map((train) => train.id)).toEqual([broken.id]);
    expect(made.directory.get(6)).toBeUndefined();
    expect(broken.current().train.route).toEqual([1, 6]);
    expect(
      made.entries.filter((entry) => entry.msg === 'a train keeps a deleted gym on its route'),
    ).toHaveLength(1);
  });

  it('lets a report that came first win: the deletion finds the raid', async () => {
    const made = await gymAdminWith();
    // Both at once: the report takes the gym's lock in the same turn it is made.
    const reporting = made.service.reportRaid(report(made, 6));
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    const [reported, deleted] = await Promise.all([reporting, deleting]);
    expect(reported.kind).toBe('created');
    expect(deleted.kind).toBe('raid-there');
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('answers a report that waited for a deletion with a sentence, and stores no raid', async () => {
    const made = await gymAdminWith();
    const gym = report(made, 6);
    const release = heldDelete(made);
    // The deletion is inside the gym's lock, waiting for its row to go.
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    const reporting = made.service.reportRaid(gym);
    await turns();
    release();

    const [deleted, reported] = await Promise.all([deleting, reporting]);
    expect(deleted.kind).toBe('deleted');
    expect(reported).toEqual({ kind: 'gym-gone' });
    expect(made.store.active()).toEqual([]);
    await settle(made);
    expect(made.gateway.posts.size).toBe(0);
  });

  it('refuses to move a raid to a gym that was deleted, and to make it a stop', async () => {
    const made = await gymAdminWith();
    const raid = await made.service.reportRaid(report(made, 1));
    if (raid.kind !== 'created') throw new Error('no raid');
    const train = await trainOn(made, [1]);
    // A gym of the raid's own region, and one of the other region.
    for (const gymId of [6, 8]) {
      await made.admin.delete(gymId, staff, STAFF_PLACE);
      await expect(made.raids.setGym(raid.party.id, maker, gymId)).resolves.toEqual({
        kind: 'refused',
        reason: 'gym-gone',
      });
      await expect(made.trains.addStop(train.id, maker, gymId)).resolves.toEqual({
        kind: 'refused',
        reason: 'gym-gone',
      });
    }
    expect(train.current().train.route).toEqual([1]);
  });

  it('lets a move of a raid to the gym that came first win, and refuses one that waited', async () => {
    const first = await gymAdminWith();
    const raid = await first.service.reportRaid(report(first, 1));
    if (raid.kind !== 'created') throw new Error('no raid');
    const moving = first.raids.setGym(raid.party.id, maker, 6);
    const deleting = first.admin.delete(6, staff, STAFF_PLACE);
    const [moved, deleted] = await Promise.all([moving, deleting]);
    expect(moved).toMatchObject({ kind: 'ok', changed: true });
    expect(deleted.kind).toBe('raid-there');

    // A gym of the raid's own region, and one of another region (the raid would get a new
    // post there: that is stored under the gym's lock too).
    for (const gymId of [6, 8]) {
      const made = await gymAdminWith();
      const other = await made.service.reportRaid(report(made, 1));
      if (other.kind !== 'created') throw new Error('no raid');
      await settle(made);
      const posts = made.gateway.posts.size;
      const target = gymOf(made, gymId);
      expect(made.raids.gymMove(other.party, target).kind).toBe(gymId === 6 ? 'local' : 'region');
      const release = heldDelete(made);
      const removing = made.admin.delete(gymId, staff, STAFF_PLACE);
      await turns();
      const late = made.raids.setGym(other.party.id, maker, gymId);
      await turns();
      release();
      await expect(removing).resolves.toMatchObject({ kind: 'deleted' });
      await expect(late).resolves.toEqual({ kind: 'refused', reason: 'gym-gone' });
      expect(made.store.get(other.party.id)?.gymId).toBe(1);
      await settle(made);
      expect(made.store.active()).toHaveLength(1);
      expect(made.gateway.posts.size).toBe(posts);
    }
  });

  it('takes the gym off a route it was put on while it was being deleted', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1]);
    const release = heldDelete(made);
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    // The gym is still in the list: the stop is taken.
    await expect(made.trains.addStop(train.id, maker, 6)).resolves.toMatchObject({ kind: 'ok' });
    release();
    await expect(deleting).resolves.toMatchObject({ kind: 'deleted', trains: 1, unmended: [] });
    expect(train.current().train.route).toEqual([1]);
    // From here on the stop is refused.
    await expect(made.trains.addStop(train.id, maker, 6)).resolves.toEqual({
      kind: 'refused',
      reason: 'gym-gone',
    });
  });

  it('takes the gym off a route whose new stop was being written while the gym went', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1]);
    const release = heldSave(made, train.id);
    // Decided while the gym exists; the row of the train is on its way.
    const adding = made.trains.addStop(train.id, maker, 6);
    await turns();
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    // The gym is gone already, and the train in memory does not have the stop yet.
    expect(made.directory.get(6)).toBeUndefined();
    expect(train.current().train.route).toEqual([1]);
    release();

    const [added, deleted] = await Promise.all([adding, deleting]);
    expect(added).toMatchObject({ kind: 'ok' });
    expect(deleted).toMatchObject({ kind: 'deleted', trains: 1, unmended: [] });
    expect(train.current().train.route).toEqual([1]);
  });

  it('takes the gym off a route that was being loaded while the gym went', async () => {
    const made = await gymAdminWith();
    const train = await trainOn(made, [1]);
    const saved = made.routes.add(REPORTER, 1, 'Round', [2, 6]);
    const release = heldSave(made, train.id);
    const loading = made.trains.loadRoute(train.id, maker, saved.id);
    await turns();
    const deleting = made.admin.delete(6, staff, STAFF_PLACE);
    await turns();
    expect(made.directory.get(6)).toBeUndefined();
    release();

    const [loaded, deleted] = await Promise.all([loading, deleting]);
    expect(loaded).toMatchObject({ kind: 'ok' });
    expect(deleted).toMatchObject({ kind: 'deleted', trains: 1, unmended: [] });
    expect(train.current().train.route).toEqual([2]);
  });
});
```

Apply to `src/services/gym-directory.test.ts`:

```diff
--- a/src/services/gym-directory.test.ts
+++ b/src/services/gym-directory.test.ts
@@ -155,6 +155,36 @@ describe('GymDirectory', () => {
     await expect(service.refreshGym(1)).rejects.toThrow('Gyms have not been loaded yet');
   });
 
+  it('forgets a gym at once, also while the database cannot be read', async () => {
+    const { service, state } = directory();
+    await service.load();
+    state.failing = true;
+    expect(service.forget(1)).toBe(true);
+    expect(service.get(1)).toBeUndefined();
+    expect(service.regionsOf(1)).toEqual([]);
+    expect(ids(service, null, 'pinewood public library')).not.toContain(1);
+    expect(service.forget(1)).toBe(false);
+    expect(state.fetched).toEqual([]);
+    // A read that fails afterwards does not bring it back.
+    await expect(service.refreshGym(1)).rejects.toThrow('database is down');
+    expect(service.get(1)).toBeUndefined();
+  });
+
+  it('does not let a read that is on its way put a forgotten gym back', async () => {
+    const { service, state } = directory();
+    await service.load();
+    // A re-read of the gym and a whole load, both of which see the row as it still was.
+    const refreshing = service.refreshGym(1);
+    const loading = service.load();
+    // The row goes, and the gym is forgotten, before either has finished.
+    expect(service.forget(1)).toBe(true);
+    await Promise.all([refreshing, loading]);
+    state.gyms = state.gyms.filter((gym) => gym.id !== 1);
+    await new Promise((resolve) => setImmediate(resolve));
+    expect(service.get(1)).toBeUndefined();
+    expect(ids(service, null, 'pinewood public library')).not.toContain(1);
+  });
+
   it('lists every gym, as a list of its own', async () => {
     const { service } = directory();
     await service.load();
```

Apply to `src/services/party-store.test.ts`:

```diff
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -433,6 +433,41 @@ describe('PartyStore', () => {
       ).resolves.toMatchObject({ added: false, existing: { id: ID(2) } });
     });
 
+    it('stores nothing for a gym that is gone, which it asks under the lock of the gym', async () => {
+      const { store, storage } = await partyStoreWith();
+      // Whoever deletes a gym holds its lock until the gym is gone.
+      let gone = false;
+      let release: () => void = () => undefined;
+      const deleting = store.withGymLock(
+        1,
+        () =>
+          new Promise<void>((resolve) => {
+            release = () => {
+              gone = true;
+              resolve();
+            };
+          }),
+      );
+      const asked: boolean[] = [];
+      const adding = store.addRaidUnlessTaken(testRaid({ id: ID(1) }), PARTY_NOW, () => {
+        asked.push(gone);
+        return !gone;
+      });
+      await new Promise((resolve) => setImmediate(resolve));
+      // Not asked before the lock is free.
+      expect(asked).toEqual([]);
+      release();
+      await deleting;
+      await expect(adding).resolves.toEqual({ added: false, existing: undefined });
+      expect(asked).toEqual([true]);
+      expect(storage.writes).toEqual([]);
+      expect(store.active()).toEqual([]);
+      // A gym that is there is stored as ever.
+      await expect(
+        store.addRaidUnlessTaken(testRaid({ id: ID(2) }), PARTY_NOW, () => true),
+      ).resolves.toMatchObject({ added: true });
+    });
+
     it('refuses a raid without a gym', async () => {
       const { store, storage } = await partyStoreWith();
       const raid: RaidParty = { ...testRaid(), gymId: null };
```

Apply to `src/services/train-service.routes.test.ts`:

```diff
--- a/src/services/train-service.routes.test.ts
+++ b/src/services/train-service.routes.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest';
 import { EAST_CHANNEL, testGyms, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
 import { createdMeetup, createdTrain } from '../../test/support/party-service.js';
+import { gymsFixture } from '../../test/support/providers.js';
 import { MAX_SAVED_ROUTES } from '../db/repositories/saved-route-repository.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { PostGym } from '../render/raid-post.js';
@@ -137,6 +138,33 @@ describe('TrainService.loadRoute', () => {
     expect(made.current().train.route).toEqual([2, 3]);
   });
 
+  it('decides inside the store which gyms exist: one deleted while the load waited is left out', async () => {
+    // The gym list as the services see it; gym 6 goes at the moment the store takes the change,
+    // as when its deletion finished while the load waited for the train's turn.
+    const list = gymsFixture();
+    let gone = false;
+    const gyms = {
+      get: (id: number) => (gone && id === 6 ? undefined : list.get(id)),
+      regionsOf: (id: number) => (gone && id === 6 ? [] : list.regionsOf(id)),
+    };
+    const made = await createdTrain({ route: [4] }, { gyms });
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    const saved = made.routes.add(ALICE, WEST, 'Round', [2, 6, 3]);
+    const update = made.store.update.bind(made.store);
+    const whileGoing: typeof made.store.update = (id, change) =>
+      update(id, (party) => {
+        gone = true;
+        return change(party);
+      });
+    made.store.update = whileGoing;
+
+    const outcome = await made.trains.loadRoute(made.party.id, alice, saved.id);
+
+    expect(outcome).toMatchObject({ kind: 'ok', missing: 1 });
+    expect(made.current().train.route).toEqual([2, 3]);
+    expect((await lines(made)).at(-1)).toContain('2 stops');
+  });
+
   it('is for a member who is signed up, and only with a route of their own for this region', async () => {
     const made = await boarded();
     const mine = made.routes.add(ALICE, WEST, 'Mine', [2]);
```

Apply to `src/services/train-service.test.ts`:

```diff
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
-import { testGyms } from '../../test/support/gyms.js';
+import { testGyms, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
+import { gymsFixture } from '../../test/support/providers.js';
 import { createdMeetup, createdTrain, reportedRaid } from '../../test/support/party-service.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -84,6 +85,131 @@ describe('TrainService: the route', () => {
     expect(messages(made)).toEqual([]);
   });
 
+  it('refuses a gym that is not in the gym list, whoever asks', async () => {
+    const made = await createdTrain({ route: [4] });
+    for (const staff of [false, true]) {
+      expect(await made.trains.addStop(made.party.id, maker, 999, staff)).toEqual({
+        kind: 'refused',
+        reason: 'gym-gone',
+      });
+    }
+    await settled(made);
+    expect(made.current().train.route).toEqual([4]);
+    expect(made.said()).toEqual([]);
+  });
+
+  it('takes a gym that is deleted off every route that has it, and says why', async () => {
+    const made = await boarded([4, 1, 7]);
+    const staff: Member = { id: '200000000000000009', name: 'Morgan' };
+
+    const changed = await made.trains.gymRemoved(1, staff, 'The Library');
+    await settled(made);
+
+    expect(changed.changed.map((party) => party.id)).toEqual([made.party.id]);
+    expect(changed.failed).toEqual([]);
+    // Not the stop the train is at: it stays where it is, and nobody is pinged.
+    expect(made.current().train.route).toEqual([4, 7]);
+    expect(currentStop(made.current())).toBe(4);
+    expect(made.said()).toEqual(["**The Library** was removed from Pine's gym list."]);
+    // A gym no train has changes nothing.
+    const nothing = { changed: [], failed: [] };
+    expect(await made.trains.gymRemoved(1, staff, 'The Library')).toEqual(nothing);
+    expect(await made.trains.gymRemoved(12, staff, 'Post Office')).toEqual(nothing);
+  });
+
+  it('takes stops whose gym the list no longer knows off the routes, as its own act', async () => {
+    const list = gymsFixture();
+    const gone = new Set<number>();
+    const gyms = {
+      get: (id: number) => (gone.has(id) ? undefined : list.get(id)),
+      regionsOf: (id: number) => list.regionsOf(id),
+      size: 12,
+    };
+    const made = await createdTrain({ route: [4, 1, 7, 2] }, { gyms });
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
+    await settled(made);
+    for (const message of made.gateway.messagesIn(made.postId)) {
+      await made.gateway.deleteMessage(made.postId, message.id);
+    }
+    // Nothing is unknown: nothing happens.
+    expect(await made.trains.removeUnknownStops()).toBe(0);
+
+    // The stop the train is at and one further on.
+    gone.add(4).add(7);
+    expect(await made.trains.removeUnknownStops()).toBe(1);
+    await settled(made);
+
+    expect(made.current().train.route).toEqual([1, 2]);
+    expect(currentStop(made.current())).toBe(1);
+    // As after any removal of the current stop, who was here is coming again; nobody is pinged.
+    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Coming);
+    expect(made.gateway.messagesIn(made.postId).map((message) => message.message)).toEqual([
+      { content: "2 stops were removed: their gyms are no longer in Pine's gym list." },
+    ]);
+    expect(await made.trains.removeUnknownStops()).toBe(0);
+  });
+
+  it('sweeps nothing while the gym list knows no gym at all', async () => {
+    const gyms = { get: () => undefined, regionsOf: () => [], size: 0 };
+    const made = await createdTrain({}, { gyms });
+    // A route from before the list was lost.
+    await made.store.update(made.party.id, (party) => ({
+      party:
+        party.type === 'train' ? { ...party, train: { ...party.train, route: [4, 1] } } : party,
+    }));
+    expect(await made.trains.removeUnknownStops()).toBe(0);
+    expect(made.current().train.route).toEqual([4, 1]);
+  });
+
+  it('answers the trains it could not change, and goes on with the others', async () => {
+    const made = await boarded([4, 1, 7]);
+    const other = await made.service.createTrain({
+      name: 'Sunday round',
+      creatorId: REPORTER,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (other.kind !== 'created') throw new Error('no train');
+    await made.trains.addStop(other.party.id, maker, 1);
+    await settled(made);
+    const staff: Member = { id: '200000000000000009', name: 'Morgan' };
+    // The first train cannot be stored; the second can.
+    const save = made.storage.save.bind(made.storage);
+    made.storage.save = (party) =>
+      party.id === made.party.id ? Promise.reject(new Error('row is locked')) : save(party);
+
+    const outcome = await made.trains.gymRemoved(1, staff, 'The Library');
+
+    expect(outcome.failed.map((party) => party.id)).toEqual([made.party.id]);
+    expect(outcome.changed.map((party) => party.id)).toEqual([other.party.id]);
+    expect(made.current().train.route).toEqual([4, 1, 7]);
+    expect(
+      made.entries.some(
+        (entry) => entry.msg === 'could not take a deleted gym off the route of a train',
+      ),
+    ).toBe(true);
+  });
+
+  it('moves a train on whose current stop is deleted, for a staff member who is not on it', async () => {
+    const made = await boarded([4, 1, 7]);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
+    await made.trains.setConductor(made.party.id, bob);
+    await settled(made);
+    const staff: Member = { id: '200000000000000009', name: 'Morgan' };
+
+    await made.trains.gymRemoved(4, staff, 'The Bridge');
+    await settled(made);
+
+    expect(made.current().train.route).toEqual([1, 7]);
+    expect(currentStop(made.current())).toBe(1);
+    // As after any removal of the current stop: who was here is coming again.
+    expect(attendeeOf(made.current(), ALICE)?.status).toBe(PartyStatus.Coming);
+    // The staff member is not signed up, and is not made so.
+    expect(attendeeOf(made.current(), staff.id)).toBeUndefined();
+    expect(lines(made)).toContain("**The Bridge** was removed from Pine's gym list.");
+    expect(lines(made).some((line) => line.startsWith('The train is moving to'))).toBe(true);
+  });
+
   it('removes and moves stops by their numbers, keeping the train at its gym', async () => {
     const made = await boarded();
     await made.trains.move(made.party.id, alice, 'next', false);
```

Create `test/support/gym-admin.ts`:

```ts
import type { GymRemoval, RemovedGym } from '../../src/db/repositories/gym-removal-repository.js';
import { GymAdminService, type StaffPlace } from '../../src/services/gym-admin-service.js';
import { GymUpkeep } from '../../src/services/gym-upkeep.js';
import type { Party } from '../../src/domain/party/party.js';
import { FakeGeoGateway } from './geo.js';
import { gymDirectoryWith, MemoryGyms } from './gym-store.js';
import type { MemoryGymTargets } from './gym-targets.js';
import { WEST_CHANNEL } from './gyms.js';
import { partyServiceWith, TestRegions, type Outliving } from './party-service.js';
import type { MemorySavedRoutes } from './saved-routes.js';

/** The channel for bot updates of the fakes' server, under the name of the test settings. */
export const UPDATES_CHANNEL = '100000000000000031';

/** The staff member of `STAFF_PLACE`. */
export const STAFF = '200000000000000009';

/** A staff member of the fakes' server (the guild of row 1), using a command in West's channel. */
export const STAFF_PLACE: StaffPlace = { staffId: STAFF, guildId: 1, channelIds: [WEST_CHANNEL] };

/**
 * The removal of a gym with what names it, over the stores in memory, as
 * `GymRemovalRepository` does it in one transaction (gym-removal-repository.db.test.ts pins
 * that down): all of it or none. When any of the three stores is failing, or `failing` is set,
 * it rejects and nothing has changed.
 */
export class MemoryGymRemoval implements GymRemoval {
  failing: Error | undefined;

  constructor(
    private readonly gyms: MemoryGyms,
    private readonly routes: MemorySavedRoutes,
    private readonly targets: MemoryGymTargets,
  ) {}

  async remove(gymId: number): Promise<RemovedGym> {
    await new Promise((resolve) => setImmediate(resolve));
    const failing =
      this.failing ??
      this.gyms.failing ??
      this.gyms.failingOn.delete ??
      this.routes.failing ??
      this.targets.failing;
    if (failing) throw failing;
    const routes = await this.routes.removeGym(gymId);
    const targets = await this.targets.membersTargeting(gymId);
    await this.targets.removeGym(gymId);
    await this.gyms.delete(gymId);
    return { routes: routes.changed + routes.removed, targets };
  }
}

/**
 * Gym administration over fakes, with everything `partyServiceWith` gives over the same gyms:
 * the invented gyms in memory (`gymStore`, each with its nearest gym) behind a real
 * `GymDirectory` that every service reads, so that a gym that is added, changed or deleted is
 * so for raids and trains too; Google as a fake (`geo`); the saved routes and gym targets of
 * `partyServiceWith`; and a server that has the channel for bot updates (`UPDATES_CHANNEL`).
 *
 * Nothing runs by itself: `upkeep.flush()` fetches what waits (the line never moves on its own),
 * `admin.flush()` waits for the announcements.
 */
export async function gymAdminWith(parties: readonly Party[] = [], kept?: Partial<Outliving>) {
  const regions = kept?.regions ?? new TestRegions();
  const { gyms: gymStore, directory } = await gymDirectoryWith(new MemoryGyms(), regions);
  const made = await partyServiceWith(parties, { gyms: directory }, { ...kept, regions });
  made.gateway.channelNames.set(UPDATES_CHANNEL, made.settings.channels['bot-updates']);
  const geo = new FakeGeoGateway();
  const upkeep = new GymUpkeep({
    gyms: gymStore,
    directory,
    geo,
    parties: made.store,
    posts: made.service,
    log: made.log,
    // The line waits for `flush`.
    setTimer: () => () => undefined,
  });
  const removal = new MemoryGymRemoval(gymStore, made.routes, made.gymTargets);
  const admin = new GymAdminService({
    gyms: gymStore,
    removal,
    directory,
    regions,
    store: made.store,
    trains: made.trains,
    routes: made.routes,
    targets: made.gymTargets,
    upkeep,
    geo,
    gateway: made.gateway,
    settings: made.settings,
    log: made.log,
  });
  return { ...made, admin, upkeep, geo, gymStore, removal, directory };
}
```

Apply to `test/support/gym-store.ts`:

```diff
--- a/test/support/gym-store.ts
+++ b/test/support/gym-store.ts
@@ -21,6 +21,9 @@ export function settledTestGyms(): Gym[] {
   return gyms.map((gym) => ({ ...gym, nearestGym: nearestTo(gym, gyms)?.place.id ?? null }));
 }
 
+/** The methods of the storage, for a test that holds or fails one of them. */
+export type GymMethod = 'get' | 'listAll' | 'create' | 'update' | 'delete';
+
 /**
  * The gyms kept in memory as `GymRepository` keeps them, whose behaviour
  * gym-repository.db.test.ts pins down: `create` gives the next id, `update` changes only the
@@ -28,13 +31,16 @@ export function settledTestGyms(): Gym[] {
  * lower case and trimmed. It starts with the invented gyms (`settledTestGyms`) unless told
  * otherwise.
  *
- * `writes` records every change in order. Set `failing` to make every call reject, and `hold`
- * to a promise to make every call from then on wait for it (a test that needs something to
- * happen while a write is on its way).
+ * `writes` records every change in order. Set `failing` to make every call reject, or
+ * `failingOn` to make the calls of one method reject. `hold` is a promise that every call from
+ * then on waits for, `holdOn` one for the calls of one method (a test that needs something to
+ * happen while a write is on its way, without stopping what reads meanwhile).
  */
 export class MemoryGyms implements GymStorage {
   failing: Error | undefined;
+  failingOn: Partial<Record<GymMethod, Error>> = {};
   hold: Promise<void> | undefined;
+  holdOn: Partial<Record<GymMethod, Promise<void>>> = {};
   readonly writes: Array<
     | { what: 'create'; id: number }
     | { what: 'update'; id: number; patch: GymPatch }
@@ -48,12 +54,14 @@ export class MemoryGyms implements GymStorage {
     this.nextId = Math.max(0, ...gyms.map((gym) => gym.id)) + 1;
   }
 
-  private async attempt<T>(work: () => T): Promise<T> {
+  private async attempt<T>(method: GymMethod, work: () => T): Promise<T> {
     await this.hold;
+    await this.holdOn[method];
     return new Promise((resolve, reject) => {
       // Like a real query, the answer never comes in the same turn of the event loop.
       setImmediate(() => {
-        if (this.failing) reject(this.failing);
+        const failing = this.failing ?? this.failingOn[method];
+        if (failing) reject(failing);
         else resolve(work());
       });
     });
@@ -75,11 +83,11 @@ export class MemoryGyms implements GymStorage {
   }
 
   get(id: number): Promise<Gym | undefined> {
-    return this.attempt(() => this.row(id));
+    return this.attempt('get', () => this.row(id));
   }
 
   listAll(): Promise<Gym[]> {
-    return this.attempt(() =>
+    return this.attempt('listAll', () =>
       [...this.rows.keys()]
         .sort((a, b) => a - b)
         .flatMap((id) => {
@@ -90,7 +98,7 @@ export class MemoryGyms implements GymStorage {
   }
 
   create(gym: NewGym): Promise<Gym> {
-    return this.attempt(() => {
+    return this.attempt('create', () => {
       const id = this.nextId++;
       const created: Gym = {
         id,
@@ -100,8 +108,10 @@ export class MemoryGyms implements GymStorage {
         lon: gym.lon,
         nickname: gym.nickname ?? null,
         description: gym.description ?? null,
-        keywords: [],
-        notice: null,
+        keywords: (gym.keywords ?? [])
+          .map((keyword) => keyword.trim().toLowerCase())
+          .filter((keyword) => keyword !== ''),
+        notice: gym.notice ?? null,
         taggedEx: false,
         confirmedEx: false,
         imageUrl: null,
@@ -117,7 +127,7 @@ export class MemoryGyms implements GymStorage {
   }
 
   update(id: number, patch: GymPatch): Promise<Gym | undefined> {
-    return this.attempt(() => {
+    return this.attempt('update', () => {
       const gym = this.rows.get(id);
       if (!gym) return undefined;
       const defined = Object.fromEntries(
@@ -133,7 +143,7 @@ export class MemoryGyms implements GymStorage {
   }
 
   delete(id: number): Promise<boolean> {
-    return this.attempt(() => {
+    return this.attempt('delete', () => {
       const existed = this.rows.delete(id);
       if (existed) this.writes.push({ what: 'delete', id });
       return existed;
```

Apply to `test/support/gym-targets.ts`:

```diff
--- a/test/support/gym-targets.ts
+++ b/test/support/gym-targets.ts
@@ -5,6 +5,7 @@ import {
   type GymTargetList,
   type GymTargetRow,
   type GymTargetStorage,
+  type GymTargetUpkeep,
 } from '../../src/db/repositories/gym-notification-repository.js';
 
 interface Row extends GymTargetRow {
@@ -18,7 +19,7 @@ interface Row extends GymTargetRow {
  * the same functions. `addRow` puts a row as the legacy bot may have left it. Set `failing` to
  * make every call reject.
  */
-export class MemoryGymTargets implements GymTargetStorage {
+export class MemoryGymTargets implements GymTargetStorage, GymTargetUpkeep {
   failing: Error | undefined;
   readonly rows: Row[] = [];
   private nextId = 1;
@@ -97,4 +98,20 @@ export class MemoryGymTargets implements GymTargetStorage {
       return ids.length;
     });
   }
+
+  membersTargeting(gymId: number): Promise<number> {
+    return this.attempt(
+      () =>
+        new Set(this.rows.filter((row) => row.gym === String(gymId)).map((row) => row.memberId))
+          .size,
+    );
+  }
+
+  removeGym(gymId: number): Promise<number> {
+    return this.attempt(() => {
+      const ids = this.rows.filter((row) => row.gym === String(gymId)).map((row) => row.id);
+      this.drop(ids);
+      return ids.length;
+    });
+  }
 }
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -230,12 +230,15 @@ export async function partyServiceWith(
   const settings = loadSettings(TEST_SETTINGS_PATH);
   const userSettings = kept?.userSettings ?? new Map<string, Partial<UserSettings>>();
   const users = new MemoryUsers(userSettings);
+  // One list of gyms for all the services, as in the bot; a test of gym administration passes
+  // its own (a directory that changes).
+  const gyms = forService.gyms ?? gymsFixture();
   const service = new PartyService({
     store,
     gateway,
     regions,
     regionStore: regions,
-    gyms: gymsFixture(),
+    gyms,
     raidBosses: raidBossesFixture(),
     gameData: { catalogue: catalogueFixture() },
     raidEvents: raidEventsFixture(),
@@ -271,7 +274,7 @@ export async function partyServiceWith(
     dms,
     guilds: { snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined) },
     regions,
-    gyms: gymsFixture(),
+    gyms,
     gameData: overrides.gameData ?? { catalogue: catalogueFixture() },
     raidBosses: overrides.raidBosses ?? raidBossesFixture(),
     settings: overrides.settings ?? settings,
@@ -322,7 +325,7 @@ export async function partyServiceWith(
     posts: service,
     lines,
     questions: attendance,
-    gyms: gymsFixture(),
+    gyms,
     regions,
     gameData: { catalogue: catalogueFixture() },
     notify,
@@ -350,7 +353,7 @@ export async function partyServiceWith(
     posts: service,
     lines,
     users,
-    gyms: gymsFixture(),
+    gyms,
     regions,
     routes,
     log,
@@ -363,6 +366,7 @@ export async function partyServiceWith(
     store,
     posts: service,
     attendance,
+    routes: trains,
     access,
     lines,
     gateway,
@@ -394,6 +398,7 @@ export async function partyServiceWith(
     lines,
     users,
     userSettings,
+    gyms,
     store,
     storage,
     database,
```

Apply to `test/support/saved-routes.ts`:

```diff
--- a/test/support/saved-routes.ts
+++ b/test/support/saved-routes.ts
@@ -2,6 +2,7 @@ import {
   MAX_SAVED_ROUTES,
   type SavedRoute,
   type SavedRouteStorage,
+  type SavedRouteUpkeep,
   type SaveRouteOutcome,
 } from '../../src/db/repositories/saved-route-repository.js';
 
@@ -18,9 +19,10 @@ function route({ id, name, gyms }: Row): SavedRoute {
  * The saved routes kept in memory as `SavedRouteRepository` keeps them, whose behaviour
  * saved-route-repository.db.test.ts pins down: a route belongs to a member and a region, a
  * namesake (whatever its case) is replaced, and a member has at most `MAX_SAVED_ROUTES` per
- * region. Set `failing` to make every call reject.
+ * region; `countWithGym` and `removeGym` are for the deletion of a gym. Set `failing` to make
+ * every call reject.
  */
-export class MemorySavedRoutes implements SavedRouteStorage {
+export class MemorySavedRoutes implements SavedRouteStorage, SavedRouteUpkeep {
   failing: Error | undefined;
   readonly rows: Row[] = [];
   private nextId = 1;
@@ -88,4 +90,25 @@ export class MemorySavedRoutes implements SavedRouteStorage {
       return route(row);
     });
   }
+
+  countWithGym(gymId: number): Promise<number> {
+    return this.attempt(() => this.rows.filter((row) => row.gyms.includes(gymId)).length);
+  }
+
+  removeGym(gymId: number): Promise<{ changed: number; removed: number }> {
+    return this.attempt(() => {
+      let changed = 0;
+      let removed = 0;
+      for (const row of [...this.rows]) {
+        if (!row.gyms.includes(gymId)) continue;
+        row.gyms = row.gyms.filter((id) => id !== gymId);
+        if (row.gyms.length > 0) changed += 1;
+        else {
+          this.rows.splice(this.rows.indexOf(row), 1);
+          removed += 1;
+        }
+      }
+      return { changed, removed };
+    });
+  }
 }
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -5,6 +5,7 @@ import { loadSettings } from '../../src/config/settings.js';
 import { ClickAnswers } from '../../src/discord/click-answers.js';
 import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
+import type { GymAdminService } from '../../src/services/gym-admin-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { SpawnService } from '../../src/services/spawn-service.js';
@@ -55,6 +56,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     raidBosses: raidBossesFixture(),
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
+    gymAdmin: unavailable<GymAdminService>(
+      'gymAdmin',
+      'pass { gymAdmin: admin, gyms: directory, … } from gymAdminWith()',
+    ),
     regions: regionsFixture(),
     // The invented regions belong to the guild of row 1, the server of the fake interactions.
     guilds: { idFor: (snowflake) => Promise.resolve(snowflake === FAKE_GUILD_ID ? 1 : undefined) },
```

Run: `npx vitest run --project unit src/commands/parties/in-train.test.ts src/commands/raids/raid.test.ts src/services/gym-admin-service.test.ts src/services/gym-directory.test.ts src/services/party-store.test.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -13,6 +13,7 @@ import type { Logger } from './log.js';
 import type { AttendanceService } from './services/attendance-service.js';
 import type { DmSender } from './services/dm-sender.js';
 import type { GameDataProvider } from './services/game-data-service.js';
+import type { GymAdminService } from './services/gym-admin-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { PartyService } from './services/party-service.js';
 import type { PartyProvider } from './services/party-store.js';
@@ -41,6 +42,8 @@ export interface AppContext {
   readonly raidEvents: RaidEventProvider;
   /** The gyms, and finding them by what members type. */
   readonly gyms: GymProvider;
+  /** Gym administration (`/gym`): adding, changing, moving and deleting gyms. */
+  readonly gymAdmin: GymAdminService;
   /** The regions: by id, by text channel and by forum. */
   readonly regions: RegionProvider;
   /** The row of a server (`Guild.id`), by which regions and parties say whose they are. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -9,6 +9,7 @@ import { runMigrations } from './db/migrator.js';
 import { AccessGrantRepository } from './db/repositories/access-grant-repository.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
 import { GymNotificationRepository } from './db/repositories/gym-notification-repository.js';
+import { GymRemovalRepository } from './db/repositories/gym-removal-repository.js';
 import { NewTrainRepository } from './db/repositories/new-train-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
 import { PartyRepository } from './db/repositories/party-repository.js';
@@ -37,7 +38,10 @@ import { AccessService } from './services/access-service.js';
 import { AttendanceService } from './services/attendance-service.js';
 import { QueuedDmSender } from './services/dm-sender.js';
 import { GameDataService } from './services/game-data-service.js';
+import { GoogleGeo } from './services/geo-gateway.js';
+import { GymAdminService } from './services/gym-admin-service.js';
 import { GymDirectory } from './services/gym-directory.js';
+import { GymUpkeep } from './services/gym-upkeep.js';
 import { ImageCache } from './services/image-cache.js';
 import { NotifyService } from './services/notify-service.js';
 import { PartyLines } from './services/party-lines.js';
@@ -109,8 +113,9 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  const gymRepository = new GymRepository(db);
   const gyms = new GymDirectory({
-    gyms: new GymRepository(db),
+    gyms: gymRepository,
     regions: new RegionRepository(db),
     ignoredWords: config.settings.blacklistWords,
     log,
@@ -137,6 +142,7 @@ export async function startApp(
   });
   const guilds = new GuildRepository(db);
   const users = new UserRepository(db);
+  const savedRoutes = new SavedRouteRepository(db);
   const partyService = new PartyService({
     store: parties,
     gateway: partyGateway,
@@ -237,7 +243,36 @@ export async function startApp(
     users,
     gyms,
     regions,
-    routes: new SavedRouteRepository(db),
+    routes: savedRoutes,
+    log,
+  });
+  // Google, asked about the place of a gym; without a key nothing is asked.
+  const geo = new GoogleGeo({
+    apiKey: config.env.GOOGLE_API_KEY,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
+  const gymUpkeep = new GymUpkeep({
+    gyms: gymRepository,
+    directory: gyms,
+    geo,
+    parties,
+    posts: partyService,
+    log,
+  });
+  const gymAdmin = new GymAdminService({
+    gyms: gymRepository,
+    removal: new GymRemovalRepository(db),
+    directory: gyms,
+    regions,
+    store: parties,
+    trains,
+    routes: savedRoutes,
+    targets: gymTargets,
+    upkeep: gymUpkeep,
+    geo,
+    gateway: partyGateway,
+    settings: config.settings,
     log,
   });
   const scheduler = new PartyScheduler({
@@ -245,6 +280,7 @@ export async function startApp(
     posts: partyService,
     attendance,
     access,
+    routes: trains,
     lines,
     gateway: partyGateway,
     raidBosses,
@@ -292,6 +328,7 @@ export async function startApp(
     raidBosses,
     raidEvents,
     gyms,
+    gymAdmin,
     regions,
     guilds,
     parties,
@@ -418,6 +455,9 @@ export async function startApp(
       // Answers, lines and edits that are still waiting go out while Discord is connected.
       { name: 'click answers', timeoutMs: 3_000, run: () => clickAnswers.flush() },
       { name: 'start times', timeoutMs: 5_000, run: () => timedParties.flush() },
+      // The line of gyms that wait for their places is forgotten; what is being written finishes.
+      { name: 'gym upkeep', timeoutMs: 5_000, run: () => gymUpkeep.stop() },
+      { name: 'gym announcements', timeoutMs: 3_000, run: () => gymAdmin.flush() },
       { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
       { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
```

Apply to `src/commands/raids/raid.ts`:

```diff
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -90,6 +90,9 @@ async function finish(
       content = `There is already a raid at ${gymName(gym)}. ${where}${marked}`;
       break;
     }
+    case 'gym-gone':
+      content = `${gymName(gym)} was removed from my gym list just now, so there is no raid to report there.`;
+      break;
     case 'no-region':
       content = `${gymName(gym)} is not in any region of this server, so I have nowhere to post the raid.`;
       break;
```

Apply to `src/db/repositories/gym-notification-repository.ts`:

```diff
--- a/src/db/repositories/gym-notification-repository.ts
+++ b/src/db/repositories/gym-notification-repository.ts
@@ -38,6 +38,17 @@ export interface GymTargetStorage {
   targeting(guildId: string, gymId: number): Promise<string[]>;
 }
 
+/**
+ * What gym administration needs of the targets: those of one gym over all members and servers.
+ * A gym id is compared as text, spelled as both bots write it (see `targeting`).
+ */
+export interface GymTargetUpkeep {
+  /** How many members have this gym as a target. */
+  membersTargeting(gymId: number): Promise<number>;
+  /** Removes every target of this gym, in every server; gives how many rows went. */
+  removeGym(gymId: number): Promise<number>;
+}
+
 /** A row of `GymNotification` as far as targets need it. */
 export interface GymTargetRow {
   id: number;
@@ -92,7 +103,7 @@ export function rowsOfGymTarget(rows: readonly GymTargetRow[], gymId: number): n
  * the next `add` of that gym leaves one. Whether a gym still exists, and where it lies, is not
  * known here: the commands ask `ctx.gyms`.
  */
-export class GymNotificationRepository implements GymTargetStorage {
+export class GymNotificationRepository implements GymTargetStorage, GymTargetUpkeep {
   constructor(private readonly db: Kysely<DB>) {}
 
   /** The member's rows of a server; a plain read (see `PokemonNotificationRepository.rows`). */
@@ -174,4 +185,22 @@ export class GymNotificationRepository implements GymTargetStorage {
       return Number(result.numDeletedRows);
     });
   }
+
+  async membersTargeting(gymId: number): Promise<number> {
+    const row = await this.db
+      .selectFrom('GymNotification')
+      .select((eb) => eb.fn.count<string>('userId').distinct().as('members'))
+      .where('gym', '=', String(gymId))
+      .executeTakeFirst();
+    return Number(row?.members ?? 0);
+  }
+
+  /** One statement: nothing about a member is decided here, so no member's row is locked. */
+  async removeGym(gymId: number): Promise<number> {
+    const result = await this.db
+      .deleteFrom('GymNotification')
+      .where('gym', '=', String(gymId))
+      .executeTakeFirst();
+    return Number(result.numDeletedRows);
+  }
 }
```

Create `src/db/repositories/gym-removal-repository.ts`:

```ts
import type { Kysely } from 'kysely';
import { inTransaction } from '../transaction.js';
import type { DB } from '../types.js';
import { GymNotificationRepository } from './gym-notification-repository.js';
import { GymRepository } from './gym-repository.js';
import { SavedRouteRepository } from './saved-route-repository.js';

/** What went with a gym that was removed. */
export interface RemovedGym {
  /** The saved routes that had it as a stop (changed, or removed when it was their only one). */
  routes: number;
  /** The members who had it as a gym target, each once, over all servers. */
  targets: number;
}

/**
 * Removing a gym with what names it in the database (`GymAdminService.delete`); lets tests keep
 * it in memory. All of it or none: when it rejects, nothing has changed.
 */
export interface GymRemoval {
  remove(gymId: number): Promise<RemovedGym>;
}

/**
 * The gym's row (with its metadata), the saved routes that have it as a stop and every gym
 * target of it, in one transaction: either the gym is gone with what named it, or everything
 * is as it was. A gym that has no row any more (the legacy bot shares the table) is no failure:
 * what named it is cleaned up all the same.
 */
export class GymRemovalRepository implements GymRemoval {
  constructor(private readonly db: Kysely<DB>) {}

  remove(gymId: number): Promise<RemovedGym> {
    return inTransaction(this.db, async (trx) => {
      const routes = await new SavedRouteRepository(trx).removeGym(gymId);
      const targets = new GymNotificationRepository(trx);
      const members = await targets.membersTargeting(gymId);
      await targets.removeGym(gymId);
      await new GymRepository(trx).delete(gymId);
      return { routes: routes.changed + routes.removed, targets: members };
    });
  }
}
```

Apply to `src/db/repositories/gym-repository.ts`:

```diff
--- a/src/db/repositories/gym-repository.ts
+++ b/src/db/repositories/gym-repository.ts
@@ -40,6 +40,8 @@ export interface NewGym {
   pogoId?: string | null;
   nickname?: string | null;
   description?: string | null;
+  notice?: string | null;
+  keywords?: string[];
 }
 
 export interface GymPatch {
@@ -84,6 +86,15 @@ function encode(text: string | null): string | null {
   return text === null ? null : he.encode(text);
 }
 
+/**
+ * How long a text is as the database holds it: `Gym.name` and `GymMeta.nickname` are
+ * `varchar(255)` of the encoded text, which is longer than what was typed (an apostrophe is
+ * six characters, a letter outside Latin-1 up to nine).
+ */
+export function storedTextLength(text: string): number {
+  return he.encode(text).length;
+}
+
 function decode(text: string | null): string | null {
   return text === null ? null : he.decode(text);
 }
@@ -249,6 +260,8 @@ export class GymRepository implements GymStorage {
           gymId,
           nickname: encode(gym.nickname ?? null),
           description: encode(gym.description ?? null),
+          notice: encode(gym.notice ?? null),
+          keywords: formatKeywords(gym.keywords ?? []),
         })
         .execute();
       return gymId;
```

Apply to `src/db/repositories/saved-route-repository.ts`:

```diff
--- a/src/db/repositories/saved-route-repository.ts
+++ b/src/db/repositories/saved-route-repository.ts
@@ -41,6 +41,20 @@ export interface SavedRouteStorage {
   remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
 }
 
+/**
+ * What deleting a gym needs of the table (`GymAdminService`): the routes of all members and
+ * regions that have the gym as a stop.
+ */
+export interface SavedRouteUpkeep {
+  /** How many saved routes have this gym as a stop. */
+  countWithGym(gymId: number): Promise<number>;
+  /**
+   * Takes a gym off every saved route. A route that is left without a stop is removed.
+   * `changed` counts the routes that lost the stop and remain, `removed` those that went.
+   */
+  removeGym(gymId: number): Promise<{ changed: number; removed: number }>;
+}
+
 /**
  * The gyms of a stored route: ids separated by commas. The legacy bot wrote them as it had
  * them, so the text may be empty, hold a gym twice or hold what is no id: what is no id is left
@@ -65,7 +79,7 @@ function toRoute(row: { id: number; name: string | null; gyms: string | null }):
  * row id of the region, `gyms` the gym ids as text. Members are named by their snowflake here;
  * a member without a `User` row has no routes, and gets the row when they save their first.
  */
-export class SavedRouteRepository implements SavedRouteStorage {
+export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep {
   constructor(private readonly db: Kysely<DB>) {}
 
   private rows(db: Kysely<DB>, memberId: string, regionId: number) {
@@ -140,15 +154,22 @@ export class SavedRouteRepository implements SavedRouteStorage {
       const existing = await this.rows(trx, memberId, regionId).orderBy('SavedRoutes.id').execute();
       // The column compares names without regard to case, and so does this.
       const same = existing.find((row) => (row.name ?? '').toLowerCase() === name.toLowerCase());
-      if (same) {
-        await trx
-          .updateTable('SavedRoutes')
-          .set({ name, gyms: text })
-          .where('id', '=', same.id)
-          .execute();
+      // The rows were read without a lock on them (only the member's row is locked): the
+      // namesake may have gone since, when the gym that was its only stop was deleted
+      // (`removeGym`). Then nothing was replaced, and the route is saved as a new one.
+      const replaced =
+        same === undefined
+          ? undefined
+          : await trx
+              .updateTable('SavedRoutes')
+              .set({ name, gyms: text })
+              .where('id', '=', same.id)
+              .executeTakeFirst();
+      if (same && replaced && replaced.numUpdatedRows > 0n) {
         return { kind: 'replaced', route: { id: same.id, name, gyms: [...gyms] } };
       }
-      if (existing.length >= MAX_SAVED_ROUTES) return { kind: 'full' };
+      const others = same ? existing.length - 1 : existing.length;
+      if (others >= MAX_SAVED_ROUTES) return { kind: 'full' };
       const inserted = await trx
         .insertInto('SavedRoutes')
         .values({ userId: user.id, region: regionId, name, gyms: text })
@@ -169,4 +190,60 @@ export class SavedRouteRepository implements SavedRouteStorage {
       return toRoute(row);
     });
   }
+
+  /**
+   * The rows whose text has the digits of this id somewhere: a superset of the routes with the
+   * gym (17 is also in 170), which the caller narrows by reading the text (`routeGyms`).
+   */
+  private mentioning(db: Kysely<DB>, gymId: number) {
+    return db
+      .selectFrom('SavedRoutes')
+      .select(['id', 'gyms'])
+      .where('gyms', 'like', `%${String(gymId)}%`)
+      .orderBy('id');
+  }
+
+  async countWithGym(gymId: number): Promise<number> {
+    const rows = await this.mentioning(this.db, gymId).execute();
+    return rows.filter((row) => routeGyms(row.gyms).includes(gymId)).length;
+  }
+
+  /**
+   * The rows that may have the gym are listed without a lock; each of them is then read again
+   * by its key with a lock, and decided by what it holds at that moment: a route that a member
+   * saved anew since the listing is taken as it is now, and a save of that row meanwhile waits
+   * for this (as this waits for it). A row is locked only while it is decided, never the table.
+   * It runs in a transaction of its own or inside the caller's (`GymRemovalRepository`), which
+   * then keeps the locks until it ends.
+   */
+  async removeGym(gymId: number): Promise<{ changed: number; removed: number }> {
+    const listed = await this.mentioning(this.db, gymId).execute();
+    return inTransaction(this.db, async (trx) => {
+      let changed = 0;
+      let removed = 0;
+      for (const { id } of listed) {
+        const row = await trx
+          .selectFrom('SavedRoutes')
+          .select(['id', 'gyms'])
+          .where('id', '=', id)
+          .forUpdate()
+          .executeTakeFirst();
+        const gyms = routeGyms(row?.gyms ?? null);
+        if (!row || !gyms.includes(gymId)) continue;
+        const kept = gyms.filter((stop) => stop !== gymId);
+        if (kept.length === 0) {
+          await trx.deleteFrom('SavedRoutes').where('id', '=', id).execute();
+          removed += 1;
+        } else {
+          await trx
+            .updateTable('SavedRoutes')
+            .set({ gyms: kept.join(',') })
+            .where('id', '=', id)
+            .execute();
+          changed += 1;
+        }
+      }
+      return { changed, removed };
+    });
+  }
 }
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -401,6 +401,8 @@ export type PartyProblem =
   | 'gym-taken'
   /** The gym lies in no region of the raid's server that has a forum for its post. */
   | 'other-region'
+  /** The gym was deleted from the gym list meanwhile: nothing can be at it or go there. */
+  | 'gym-gone'
   /** The boss of the raid does not have that move. */
   | 'not-a-move'
   /** The train has no route yet: there is nowhere to move it. */
```

Apply to `src/render/activity.ts`:

```diff
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -137,6 +137,8 @@ export function problemText(
         `A ${word} cannot start after it ends. Give an earlier start, or change the end first ` +
         'with `/end`.'
       );
+    case 'gym-gone':
+      return 'That gym is no longer in my gym list.';
     case 'other-region':
       return (
         'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
```

Create `src/render/gym-view.ts`:

```ts
import type { OutgoingMessage } from '../discord/party-gateway.js';
import { gymMapsUrl } from './raid-post.js';
import { LIMITS, plain, truncate } from './text.js';

/** What the sentences about a gym need of it (`Gym` of the repository has all of it). */
export interface NamedGym {
  id: number;
  name: string;
  nickname: string | null;
  lat: number;
  lon: number;
}

/** The colour of what is said about the gym list. */
export const GYM_COLOUR = 0x3498db;

/** A gym's name as a sentence shows it: plain, without its nickname. */
export function gymLabel(gym: { name: string }): string {
  return plain(gym.name);
}

/** A gym as staff tell it from its namesakes: `**Name** (Nickname, #12)`. */
export function gymWithId(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
  // `||`: a nickname that was cleared to an empty text names nothing.
  const nickname = gym.nickname ? `${plain(gym.nickname)}, ` : '';
  return `**${gymLabel(gym)}** (${nickname}#${gym.id})`;
}

/** The regions a gym lies in, as a sentence about one server: its channels, or that there is none. */
export function regionsSentence(regions: readonly { channelId: string }[]): string {
  if (regions.length === 0) return 'It lies in no region of this server.';
  const channels = regions.map((region) => `<#${region.channelId}>`);
  const last = channels.pop() ?? '';
  return `It lies in ${channels.length === 0 ? last : `${channels.join(', ')} and ${last}`}.`;
}

/**
 * What the channel for bot updates is told of a new gym: its name as a link to the place, its
 * nickname, and the regions of that server it lies in. It pings nobody.
 */
export function gymAnnouncement(
  gym: NamedGym,
  regions: readonly { channelId: string }[],
): OutgoingMessage {
  const lines = [
    ...(gym.nickname ? [`Also known as **${plain(gym.nickname)}**.`] : []),
    regionsSentence(regions),
  ];
  return {
    content: 'A gym was added to the gym list.',
    embeds: [
      {
        title: truncate(gymLabel(gym), LIMITS.embedTitle),
        url: gymMapsUrl(gym),
        description: lines.join('\n'),
        color: GYM_COLOUR,
        footer: { text: `Gym #${gym.id}` },
      },
    ],
  };
}

/** What the channel for bot updates is told of a gym that was deleted: one line. */
export function gymRemovedLine(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
  return `${gymWithId(gym)} was removed from the gym list.`;
}
```

Create `src/services/gym-admin-service.ts`:

```ts
import type { Settings } from '../config/settings.js';
import type { GymTargetUpkeep } from '../db/repositories/gym-notification-repository.js';
import type { GymRemoval } from '../db/repositories/gym-removal-repository.js';
import type { Gym, GymStorage, NewGym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { SavedRouteUpkeep } from '../db/repositories/saved-route-repository.js';
import type { PartyGateway } from '../discord/party-gateway.js';
import { metresBetween, placesWithin } from '../domain/geo/distance.js';
import type { LatLon } from '../domain/geo/lat-lon.js';
import { readLocation } from '../domain/geo/location-input.js';
import { ringContains } from '../domain/geo/region-membership.js';
import type { GymTexts } from '../domain/gyms/gym-text.js';
import { isRaid, isTrain, type RaidParty, type TrainParty } from '../domain/party/party.js';
import type { Logger } from '../log.js';
import { gymAnnouncement, gymLabel, gymRemovedLine } from '../render/gym-view.js';
import type { Member } from './attendance-service.js';
import type { GeoGateway } from './geo-gateway.js';
import type { GymRefresh, GymsInMemory, GymUpkeep } from './gym-upkeep.js';
import { KeyedLock } from './keyed-lock.js';
import type { PartyStore } from './party-store.js';
import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
import type { TrainService } from './train-service.js';

/** Another gym this near to a place is asked about before a gym is put there. */
export const DUPLICATE_METRES = 10;
/** A move of a gym further than this is asked about first: a gym is corrected by metres. */
export const FAR_MOVE_METRES = 500;

/**
 * Who a staff member is and where, for what is said and noted about a change beyond the answer
 * to them: their snowflake (the log says who changed what), the row id of their server
 * (`Guild.id`; undefined when the server has no row yet), whose regions an answer names, and
 * channels of that server (the one the command was used in first), by which its channel for
 * bot updates is found.
 */
export interface StaffPlace {
  staffId: string;
  guildId: number | undefined;
  channelIds: readonly string[];
}

/**
 * What a text says about where a gym is. `approximate`: read from where a map was centred, not
 * from a pin. `link-nowhere`: a short link that was followed and names no coordinates;
 * `link-failed`: one that could not be followed at all.
 */
export type LocationOutcome =
  | { kind: 'point'; point: LatLon; approximate: boolean }
  | { kind: 'unreadable' | 'out-of-range' | 'link-failed' | 'link-nowhere' };

/** What a gym has that goes with it when it is deleted. */
export interface GymReferences {
  /** The active raids at the gym: while there is one, the gym cannot be deleted. */
  raids: RaidParty[];
  /** How many active trains have it as a stop. */
  trains: number;
  /** How many saved routes have it as a stop. */
  routes: number;
  /** How many members have it as a gym target. */
  targets: number;
}

export type DeleteOutcome =
  /** There is no such gym (any more). */
  | { kind: 'gone' }
  /** An active raid is at the gym. */
  | { kind: 'raid-there'; raid: RaidParty }
  /** The gym and what refers to it could not be removed: nothing has changed. */
  | { kind: 'failed' }
  /**
   * The gym as it was, and what went with it: the trains it was taken off, the saved routes
   * that had it, the members who had it as a gym target. `unmended` are the active trains that
   * still have it on their route because that could not be changed.
   */
  | {
      kind: 'deleted';
      gym: Gym;
      trains: number;
      routes: number;
      targets: number;
      unmended: TrainParty[];
    };

export interface GymAdminOptions {
  gyms: GymStorage;
  /** The gym's row with the saved routes and gym targets that name it, removed as one. */
  removal: GymRemoval;
  directory: GymsInMemory & { regionsOf(gymId: number): string[]; forget(id: number): boolean };
  regions: Pick<RegionProvider, 'byChannel' | 'all'>;
  store: Pick<PartyStore, 'active' | 'withGymLock'>;
  trains: Pick<TrainService, 'gymRemoved'>;
  routes: Pick<SavedRouteUpkeep, 'countWithGym'>;
  targets: Pick<GymTargetUpkeep, 'membersTargeting'>;
  upkeep: Pick<GymUpkeep, 'gymChanged' | 'placed' | 'removed' | 'refresh' | 'fetches'>;
  geo: Pick<GeoGateway, 'followShortLink'>;
  /** To announce a new gym and a deletion in the server's channel for bot updates. */
  gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage'>;
  settings: Settings;
  log: Logger;
}

/**
 * Gym administration (`/gym`): adding a gym, changing its texts, its place and whether it is an
 * elite raid gym, and deleting it with what refers to it. Every change is written first; then
 * the directory reads the gym again and the posts that show it are rendered anew
 * (`GymUpkeep.gymChanged`), so what an answer shows is what members find. Every change is noted
 * in the log with who made it: the staff member, the gym, and what (the fields of an edit by
 * name, never their texts; the old and the new place of a move).
 *
 * Adding, moving and deleting run one at a time (one lock): the question "is another gym
 * within ten metres" and the bookkeeping of nearest gyms assume that nothing else changes where
 * gyms are meanwhile. Changing texts or the elite flag needs no lock.
 *
 * A deletion and a raid at the gym exclude each other: the deletion holds the lock a report of
 * that gym takes (`PartyStore.withGymLock`) from its check for a raid until the directory no
 * longer has the gym, and whoever stores a raid at a gym asks under that lock whether the gym
 * still exists.
 */
export class GymAdminService {
  private readonly lock = new KeyedLock<'gyms'>();
  private readonly announcing = new Set<Promise<unknown>>();

  constructor(private readonly options: GymAdminOptions) {}

  /** Whether address and nearby places are fetched at all (a Google API key is configured). */
  get fetches(): boolean {
    return this.options.upkeep.fetches;
  }

  /**
   * Reads where a gym is from what a staff member typed (`readLocation`); a short link of the
   * Maps app is followed to the address it leads to, which is then read the same way.
   */
  async readLocation(text: string): Promise<LocationOutcome> {
    const reading = readLocation(text);
    if (reading.kind === 'point') {
      return { kind: 'point', point: reading.point, approximate: reading.approximate === true };
    }
    if (reading.kind !== 'short-link') return reading;
    // The first address on the link's way that names the place itself. One that only has
    // where a map was centred is kept for when nothing better follows, and the link is
    // followed on: a later address may carry the pin. Without either, whether the link led
    // anywhere at all says which sentence to answer.
    let led = false;
    let nearby: LatLon | undefined;
    const address = await this.options.geo.followShortLink(reading.url, (candidate) => {
      led = true;
      const read = readLocation(candidate);
      if (read.kind !== 'point') return false;
      if (read.approximate !== true) return true;
      nearby ??= read.point;
      return false;
    });
    const followed = address === undefined ? undefined : readLocation(address);
    if (followed?.kind === 'point') {
      return { kind: 'point', point: followed.point, approximate: followed.approximate === true };
    }
    if (nearby) return { kind: 'point', point: nearby, approximate: true };
    return { kind: led ? 'link-nowhere' : 'link-failed' };
  }

  /**
   * The gyms within `DUPLICATE_METRES` of a point, nearest first: any gym, wherever it lies.
   * `exceptId` leaves out the gym that is being moved.
   */
  near(point: LatLon, exceptId?: number): { gym: Gym; metres: number }[] {
    return placesWithin(point, this.options.directory.all(), DUPLICATE_METRES, exceptId).map(
      ({ place, metres }) => ({ gym: place, metres }),
    );
  }

  /** The regions of a server (by its row id) a gym lies in. */
  regionsOf(gymId: number, guildId: number | undefined): Region[] {
    const { directory, regions } = this.options;
    return guildId === undefined ? [] : gymRegionsInGuild(directory, regions, gymId, guildId);
  }

  /** The regions of a server (by its row id) a point lies in: where a gym there would be. */
  regionsAt(point: LatLon, guildId: number | undefined): Region[] {
    if (guildId === undefined) return [];
    return this.options.regions
      .all()
      .filter(
        (region) =>
          region.guildId === guildId &&
          region.bounds !== null &&
          ringContains(region.bounds, point),
      );
  }

  /** Whether a gym lies in a region of any server: only there a raid can be reported at it. */
  inAnyRegion(gymId: number): boolean {
    const { directory, regions } = this.options;
    return directory
      .regionsOf(gymId)
      .some((channelId) => (regions.byChannel(channelId)?.guildId ?? null) !== null);
  }

  /** The active parties that show a gym: the raids at it, and the trains with it on their route. */
  shownBy(gymId: number): { raids: RaidParty[]; trains: TrainParty[] } {
    const active = this.options.store.active();
    return {
      raids: active.filter(isRaid).filter((party) => party.gymId === gymId),
      trains: active.filter(isTrain).filter((party) => party.train.route.includes(gymId)),
    };
  }

  /**
   * Adds a gym. It answers once the row is stored, the gym can be found and the nearest gyms
   * are settled; its address and the places around it are fetched on the side
   * (`GymUpkeep.placed`). Where `settings.postNewGyms` is on, the server's channel for bot
   * updates is told. Once the row exists the gym is added, whatever fails after it: that is
   * logged, and the gym is answered as it was stored.
   */
  add(gym: NewGym, place: StaffPlace): Promise<Gym> {
    const { gyms, upkeep, directory, log } = this.options;
    return this.lock.run('gyms', async () => {
      const created = await gyms.create(gym);
      log.info(
        { staff: place.staffId, gym: created.id, lat: created.lat, lon: created.lon },
        'a gym was added',
      );
      try {
        await upkeep.gymChanged(created.id);
        await upkeep.placed(created.id);
      } catch (err) {
        log.error({ err, gym: created.id }, 'a gym was added, but not everything after it worked');
      }
      const now = directory.get(created.id) ?? created;
      this.announce(place, () => gymAnnouncement(now, this.regionsOf(now.id, place.guildId)));
      return now;
    });
  }

  /**
   * Writes the texts of a gym that are given (the fields a staff member changed, already
   * checked). Undefined, having written nothing, when there is no such gym.
   */
  async edit(id: number, texts: Partial<GymTexts>, staffId: string): Promise<Gym | undefined> {
    const { gyms, upkeep, log } = this.options;
    const fields = Object.keys(texts);
    if (fields.length > 0) {
      if (!(await gyms.update(id, texts))) return undefined;
      log.info({ staff: staffId, gym: id, fields }, 'the texts of a gym were changed');
    }
    return upkeep.gymChanged(id);
  }

  /**
   * Whether a gym is an elite raid gym (`isEliteGym`). Yes sets the tag (`taggedEx`) and
   * leaves what the gym is said to have hosted; no clears both flags, since either makes it
   * one. Undefined when there is no such gym.
   */
  async setElite(id: number, eligible: boolean, staffId: string): Promise<Gym | undefined> {
    const { gyms, upkeep, log } = this.options;
    const patch = eligible ? { taggedEx: true } : { taggedEx: false, confirmedEx: false };
    if (!(await gyms.update(id, patch))) return undefined;
    log.info({ staff: staffId, gym: id, elite: eligible }, 'the elite flag of a gym was set');
    return upkeep.gymChanged(id);
  }

  /**
   * Moves a gym to another place: the row, the directory and the posts, the nearest gyms; its
   * address and places are fetched again on the side. The picture of the old place is simply
   * no longer named (`ImageCache` names a file by what it shows). A move is never refused for
   * what is at the gym (Matt, 2026-10-13): it is a correction, and a raid there or a train
   * through it stays what it is. Gives the gym as it is now and where it was; undefined when
   * there is no such gym.
   */
  move(
    id: number,
    point: LatLon,
    staffId: string,
  ): Promise<{ gym: Gym; from: LatLon; metres: number } | undefined> {
    const { gyms, upkeep, directory, log } = this.options;
    return this.lock.run('gyms', async () => {
      const before = directory.get(id);
      if (!before) return undefined;
      const from = { lat: before.lat, lon: before.lon };
      if (!(await gyms.update(id, { lat: point.lat, lon: point.lon }))) return undefined;
      log.info({ staff: staffId, gym: id, from, to: point }, 'a gym was moved');
      const moved = await upkeep.gymChanged(id);
      if (!moved) return undefined;
      await upkeep.placed(id);
      return { gym: directory.get(id) ?? moved, from, metres: metresBetween(from, point) };
    });
  }

  /** Asks Google about a gym again, now (`GymUpkeep.refresh`). */
  refresh(id: number): Promise<GymRefresh | undefined> {
    return this.options.upkeep.refresh(id);
  }

  /** How many members have a gym as a gym target, over all servers. */
  targetCount(id: number): Promise<number> {
    return this.options.targets.membersTargeting(id);
  }

  /** What refers to a gym now: what the question before a deletion lists. */
  async references(id: number): Promise<GymReferences> {
    const { routes, targets } = this.options;
    const shown = this.shownBy(id);
    const [saved, targeting] = await Promise.all([
      routes.countWithGym(id),
      targets.membersTargeting(id),
    ]);
    return { raids: shown.raids, trains: shown.trains.length, routes: saved, targets: targeting };
  }

  /**
   * Deletes a gym, as the act of the staff member `by`. Everything is decided now, whatever a
   * question said minutes ago. In this order, so that nothing anybody sees happens before the
   * gym is really gone:
   *
   * 1. under the lock of the gym: refused while an active raid is there;
   * 2. the gym's row, the saved routes that have it and the gym targets of it go in one
   *    transaction (`GymRemoval`). When that fails nothing has changed (`failed`);
   * 3. the directory forgets the gym, at once and without asking the database: from here a
   *    report, a `/location`, a new stop and a loaded route refuse it;
   * 4. the gym is taken off the route of every active train (`TrainService.gymRemoved`), whose
   *    post says why. A train that could not be changed is logged and answered (`unmended`);
   *    the hourly upkeep takes the stop off later (`TrainService.removeUnknownStops`);
   * 5. the gyms that had it as their nearest get another, and the server's channel for bot
   *    updates is told.
   */
  delete(id: number, by: Member, place: StaffPlace): Promise<DeleteOutcome> {
    const { directory, removal, store, upkeep, log } = this.options;
    return this.lock.run('gyms', async () => {
      const removed = await store.withGymLock(id, async () => {
        const gym = directory.get(id);
        if (!gym) return { kind: 'gone' as const };
        const [raid] = this.shownBy(id).raids;
        if (raid) return { kind: 'raid-there' as const, raid };
        let counts: { routes: number; targets: number };
        try {
          counts = await removal.remove(id);
        } catch (err) {
          log.error({ err, gym: id }, 'could not delete a gym');
          return { kind: 'failed' as const };
        }
        // Inside the lock, and without a read that could fail: a report that waits for the
        // lock must find the gym gone, or it would store a raid the database refuses.
        directory.forget(id);
        return { kind: 'removed' as const, gym, ...counts };
      });
      if (removed.kind !== 'removed') return removed;
      const { gym, routes, targets } = removed;
      log.info({ staff: place.staffId, gym: id, routes, targets }, 'a gym was deleted');
      // One look: every active train is asked in its own turn (`gymRemoved`), so a stop
      // that was being written while the gym went is seen too.
      let mended = 0;
      try {
        mended = (await this.options.trains.gymRemoved(id, by, gymLabel(gym))).changed.length;
      } catch (err) {
        log.warn({ err, gym: id }, 'could not take a deleted gym off the routes of trains');
      }
      const unmended = this.shownBy(id).trains;
      for (const train of unmended) {
        log.warn({ gym: id, party: train.id }, 'a train keeps a deleted gym on its route');
      }
      try {
        await upkeep.gymChanged(id);
      } catch (err) {
        log.warn({ err, gym: id }, 'could not bring the directory up to date after a deletion');
      }
      await upkeep.removed(id);
      this.announce(place, () => ({ content: gymRemovedLine(gym) }));
      return { kind: 'deleted', gym, trains: mended, routes, targets, unmended };
    });
  }

  /**
   * Tells the server's channel for bot updates, where the setting asks for it and the server
   * has such a channel in which the bot may post. Nobody waits for it, and a failure is only
   * logged.
   */
  private announce(
    place: StaffPlace,
    message: () => Parameters<PartyGateway['sendMessage']>[1],
  ): void {
    const { gateway, settings, log } = this.options;
    if (!settings.postNewGyms) return;
    const sending: Promise<unknown> = (async () => {
      const name = settings.channels['bot-updates'];
      for (const near of place.channelIds) {
        const channelId = gateway.findChannel(near, name);
        if (channelId === undefined) continue;
        await gateway.sendMessage(channelId, message());
        return;
      }
    })()
      .catch((err: unknown) => {
        log.warn({ err }, 'could not announce a change of the gym list');
      })
      .finally(() => this.announcing.delete(sending));
    this.announcing.add(sending);
  }

  /** Waits for the announcements that are on their way. For tests and shutdown. */
  async flush(): Promise<void> {
    while (this.announcing.size > 0) await Promise.allSettled([...this.announcing]);
  }
}
```

Apply to `src/services/gym-directory.ts`:

```diff
--- a/src/services/gym-directory.ts
+++ b/src/services/gym-directory.ts
@@ -96,6 +96,23 @@ export class GymDirectory implements GymProvider {
     });
   }
 
+  /**
+   * Takes a gym out of memory at once, without reading anything: for a gym whose row was just
+   * deleted, so that nothing finds it in the moment before (or when) the database can be asked.
+   * False when there was no such gym.
+   *
+   * It is taken out now, and once more behind whatever is on its way: a `refreshGym` of it or
+   * a `load` that read the database before the row went would otherwise put it back.
+   */
+  forget(id: number): boolean {
+    const known = this.current.remove(id);
+    void this.enqueue(() => {
+      this.lookup?.remove(id);
+      return Promise.resolve();
+    });
+    return known;
+  }
+
   get size(): number {
     return this.current.size;
   }
```

Apply to `src/services/party-scheduler.ts`:

```diff
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -32,6 +32,11 @@ export interface PartySchedulerOptions {
   attendance: Pick<AttendanceService, 'ask' | 'removeQuestions'>;
   /** The access of members of other regions, whose leftovers are swept with the forums. */
   access?: { sweep(): Promise<unknown> };
+  /**
+   * The routes of the trains, swept with the forums: stops whose gym the gym list no longer
+   * knows are taken off (`TrainService.removeUnknownStops`).
+   */
+  routes?: { removeUnknownStops(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -202,11 +207,12 @@ export class PartyScheduler {
   }
 
   /**
-   * Archives open posts of ended parties, looks after the summaries and takes back the access
-   * to forums that nothing calls for any more: at start and hourly.
+   * Archives open posts of ended parties, looks after the summaries, takes back the access to
+   * forums that nothing calls for any more, and takes stops off the routes of trains whose gym
+   * is gone: at start and hourly.
    */
   private upkeep(): void {
-    const { posts, access, log } = this.options;
+    const { posts, access, routes, log } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -220,6 +226,7 @@ export class PartyScheduler {
       await step(() => posts.sweepPosts());
       await step(() => posts.checkSummaries());
       if (access) await step(() => access.sweep());
+      if (routes) await step(() => routes.removeUnknownStops());
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -105,6 +105,8 @@ export type ReportOutcome =
   | { kind: 'exists'; party: RaidParty; joined: boolean }
   /** The gym lies in no region of this server. */
   | { kind: 'no-region' }
+  /** The gym was deleted from the gym list while the report was on its way. */
+  | { kind: 'gym-gone' }
   /** The gym's region has no forum yet (`/admin setup-forums`). */
   | { kind: 'no-forum'; region: Region };
 
@@ -144,6 +146,8 @@ export type RelocateOutcome =
   | { kind: 'taken'; other: RaidParty }
   /** The region has no forum (any more): the raid stays where it is. */
   | { kind: 'no-forum' }
+  /** The gym was deleted from the gym list meanwhile: the raid stays where it is. */
+  | { kind: 'gym-gone' }
   /** `party` is the raid in its new place, `from` the party it was, which has ended. */
   | { kind: 'moved'; party: RaidParty; from: RaidParty };
 
@@ -454,6 +458,11 @@ export class PartyService {
     });
   }
 
+  /** Whether the gym list still has a gym: asked under the gym's lock when a raid is stored. */
+  private gymExists(gymId: number): boolean {
+    return this.options.gyms.get(gymId) !== undefined;
+  }
+
   /**
    * Stores a reported raid and creates its post. When the gym already has such a raid, the
    * reporter is signed up for that one with their automatic status, unless they already are.
@@ -466,6 +475,9 @@ export class PartyService {
   private async report(report: RaidReport, mayRepeat: boolean): Promise<ReportOutcome> {
     const { store, log } = this.options;
     const { gym } = report;
+    // Deleted since the member picked it: it lies in no region any more, but that is not what
+    // to tell them. (Asked again under the gym's lock, where it counts.)
+    if (!this.gymExists(gym.id)) return { kind: 'gym-gone' };
     const { region, any } = this.regionFor(gym, report.regionChannelId);
     if (!region?.forumChannelId)
       return any ? { kind: 'no-forum', region: any } : { kind: 'no-region' };
@@ -506,8 +518,9 @@ export class PartyService {
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
 
-    const stored = await store.addRaidUnlessTaken(raid, now);
+    const stored = await store.addRaidUnlessTaken(raid, now, () => this.gymExists(gym.id));
     if (!stored.added) {
+      if (!stored.existing) return { kind: 'gym-gone' };
       const existingId = stored.existing.id;
       const inFlight = this.creating.get(existingId);
       if (inFlight) {
@@ -671,8 +684,10 @@ export class PartyService {
       gymId: gym.id,
     });
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
-    const stored = await store.addRaidUnlessTaken(raid, this.now());
-    if (!stored.added) return { kind: 'taken', other: stored.existing };
+    const stored = await store.addRaidUnlessTaken(raid, this.now(), () => this.gymExists(gym.id));
+    if (!stored.added) {
+      return stored.existing ? { kind: 'taken', other: stored.existing } : { kind: 'gym-gone' };
+    }
     // Before the old party ends: who was told about it is not told again about the new one.
     this.notifier?.raidMoving(partyId, raid.id);
     // A failure in here ends the new party again and leaves the old one alone.
```

Apply to `src/services/party-store.ts`:

```diff
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -197,14 +197,25 @@ export class PartyStore implements PartyProvider {
    * the clock, in which case that raid is returned and nothing is stored. The check and the
    * insert happen under the gym's lock, so two reports cannot both find the gym free (spec 5.2);
    * this is the one way a reported raid is stored. A party without a gym is refused.
+   *
+   * `gymExists` is asked under the same lock, before anything else: the deletion of a gym
+   * (`GymAdminService.delete`) holds that lock from its check for a raid there until the gym is
+   * gone, so a report that waited for it finds no gym and stores nothing (`existing` is then
+   * undefined), instead of a row that names a gym the database no longer has.
    */
   async addRaidUnlessTaken(
     party: RaidParty,
     now: number,
-  ): Promise<{ added: true; party: RaidParty } | { added: false; existing: RaidParty }> {
+    gymExists: () => boolean = () => true,
+  ): Promise<
+    | { added: true; party: RaidParty }
+    | { added: false; existing: RaidParty }
+    | { added: false; existing: undefined }
+  > {
     const { gymId } = party;
     if (gymId === null) throw new Error(`Raid ${party.id} has no gym`);
     return this.withGymLock(gymId, async () => {
+      if (!gymExists()) return { added: false, existing: undefined };
       const existing = this.raidAt(gymId, raidKindOf(party), now);
       if (existing) return { added: false, existing };
       await this.add(party);
@@ -215,7 +226,7 @@ export class PartyStore implements PartyProvider {
   /**
    * Runs `work` alone for this gym. `addRaidUnlessTaken` uses it for new reports; other changes
    * that can make a raid block a gym (moving a raid to another gym, changing its kind, moving
-   * its end later) need it too. Updates of parties inside it are fine: they use another lock,
+   * its end later) need it too, and so does the deletion of the gym itself. Updates of parties inside it are fine: they use another lock,
    * and `add` itself does not take this one. It is not re-entrant: asking for the same gym again
    * from inside `work` and waiting for it never finishes. Hold it only for the check and the
    * write, never across a call to Discord.
```

Apply to `src/services/raid-change-service.ts`:

```diff
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -269,7 +269,7 @@ export class RaidChangeService {
    * of another region of the same server makes it a new party with a post in that region's forum
    * (`PartyService.relocate`; `from` in the outcome), and the new post says who moved it from
    * where. A gym that lies in no region of this server that has a forum is refused
-   * (`other-region`).
+   * (`other-region`), and so is one that was deleted from the gym list meanwhile (`gym-gone`).
    *
    * `moved` is for the answer to an interaction in the raid's post when the raid moves to
    * another region: it is called with the raid in its new place before the old post is closed
@@ -282,10 +282,11 @@ export class RaidChangeService {
     moved?: (party: RaidParty) => Promise<unknown>,
   ): Promise<RaidChangeOutcome> {
     const { gyms, regions, store, posts, lines } = this.options;
-    const gym = gyms.get(gymId);
-    if (!gym) throw new Error(`There is no gym ${gymId}`);
     const before = store.get(partyId);
     if (!before || !isRaid(before)) return { kind: 'gone' };
+    // Deleted from the gym list since the member picked it.
+    const gym = gyms.get(gymId);
+    if (!gym) return { kind: 'refused', reason: 'gym-gone' };
     const move = this.gymMove(before, gym);
     if (move.kind === 'local') return this.setGymInRegion(partyId, member, gym);
     if (move.kind === 'nowhere') return { kind: 'refused', reason: 'other-region' };
@@ -297,6 +298,8 @@ export class RaidChangeService {
         return { kind: 'refused', reason: 'gym-taken', other: outcome.other };
       case 'no-forum':
         return { kind: 'refused', reason: 'other-region' };
+      case 'gym-gone':
+        return { kind: 'refused', reason: 'gym-gone' };
       case 'moved': {
         const { party, from } = outcome;
         const old = from.gymId === null ? undefined : gyms.get(from.gymId);
@@ -338,6 +341,8 @@ export class RaidChangeService {
       member,
       (party) => {
         if (party.gymId === gymId) return { ok: true, party };
+        // Asked here, under the gym's lock: the deletion of a gym holds it until the gym is gone.
+        if (!gyms.get(gymId)) return refused('gym-gone');
         const region = party.regionId === null ? undefined : regions.byId(party.regionId);
         if (!region || !gyms.regionsOf(gymId).includes(region.channelId)) {
           return refused('other-region');
```

Apply to `src/services/train-service.ts`:

```diff
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -7,6 +7,7 @@ import {
   MAX_ROUTE_STOPS,
   memberOf,
   membersWhere,
+  refused,
   type Change,
   type PartyProblem,
   type RaidBossRef,
@@ -58,8 +59,15 @@ export interface TrainServiceOptions {
   lines: Pick<PartyLines, 'say'>;
   /** The members' settings: who lets the bot ping them when the train moves. */
   users: UserSettingsReader;
-  /** The gyms, to name the stops, and the region channels each lies in. */
-  gyms: { get(id: number): PostGym | undefined; regionsOf(gymId: number): string[] };
+  /**
+   * The gyms, to name the stops, and the region channels each lies in; `size`, how many gyms
+   * the list knows, for the sweep of stops whose gym is gone (`removeUnknownStops`).
+   */
+  gyms: {
+    get(id: number): PostGym | undefined;
+    regionsOf(gymId: number): string[];
+    readonly size?: number;
+  };
   /** The regions, to tell the gyms of the server of a train from those of another. */
   regions: Pick<RegionProvider, 'byChannel'>;
   /** The routes members saved (the table `SavedRoutes`). */
@@ -73,6 +81,9 @@ export interface TrainServiceOptions {
   announceDelayMs?: number;
 }
 
+/** Who removes a stop when the bot itself does (`removeUnknownStops`): nobody's snowflake. */
+const SWEEPER = '0';
+
 /**
  * What the value of a choice of the list of saved routes looks like (`id:` and the id of a
  * row): a route cannot be called so, and whatever else is typed for a route is a name.
@@ -172,7 +183,9 @@ export class TrainService {
    * a gym that is on the route already. `number` is the number of the new stop. A stop added
    * to a finished route is where the train then goes (`moved`): that takes the right to move
    * the train (`staff` says whether the member is staff), and the others are told. The first
-   * stop of a route is an ordinary edit: a line, and no announcement.
+   * stop of a route is an ordinary edit: a line, and no announcement. A gym that is no longer in
+   * the gym list is refused (`gym-gone`), which is asked inside the store: the member picked it
+   * a moment ago, and it may have been deleted since.
    */
   addStop(
     partyId: string,
@@ -183,7 +196,10 @@ export class TrainService {
     return this.movable(
       partyId,
       member,
-      (party) => addStop(party, member.id, gymId, staff),
+      (party) =>
+        this.options.gyms.get(gymId) === undefined
+          ? refused('gym-gone')
+          : addStop(party, member.id, gymId, staff),
       (_party, added) =>
         `${memberText(member)} added stop ${added.number} to the route: ${this.named(gymId)}.`,
     );
@@ -207,6 +223,111 @@ export class TrainService {
     );
   }
 
+  /**
+   * Takes a gym that was deleted from the gym list off the route of every active train that
+   * has it as a stop, as the act of the staff member who deleted it: where it was the stop a
+   * train is at, the train moves on like after any removal of its current stop (who is here is
+   * coming again, and the others are told where it goes). Each post is told why, by the name
+   * the gym had (`name`, made plain by the caller).
+   *
+   * Every active train is asked, through its own turn in the store, whether it has the gym: not
+   * only those that have it in memory. A stop that was decided while the gym still existed and
+   * whose row is on its way is not in memory yet, and only a change that waits behind it sees
+   * it. For a train without the gym the change does nothing and writes nothing.
+   *
+   * Each train by itself: `changed` are the trains it was taken off, `failed` those for which
+   * the removal was refused or could not be stored, which is logged. It never rejects for one
+   * train's sake: the gym is gone already, and the other trains are still to do.
+   */
+  async gymRemoved(
+    gymId: number,
+    member: Member,
+    name: string,
+  ): Promise<{ changed: TrainParty[]; failed: TrainParty[] }> {
+    const changed: TrainParty[] = [];
+    const failed: TrainParty[] = [];
+    for (const train of this.options.store.active().filter(isTrain)) {
+      try {
+        const outcome = await this.movable(
+          train.id,
+          member,
+          (party) => {
+            const number = party.train.route.indexOf(gymId) + 1;
+            // Not on its route (any more): nothing to do, and nothing to say.
+            if (number === 0) return { ok: true, party, gymId, moved: false };
+            return removeStop(party, member.id, number, true);
+          },
+          () => `**${name}** was removed from Pine's gym list.`,
+        );
+        if (outcome.kind === 'refused') {
+          throw new Error(`The removal of a deleted gym was refused: ${outcome.reason}`);
+        }
+        if (outcome.kind === 'ok' && outcome.changed) changed.push(outcome.party);
+      } catch (err) {
+        this.options.log.warn(
+          { err, party: train.id, gym: gymId },
+          'could not take a deleted gym off the route of a train',
+        );
+        failed.push(train);
+      }
+    }
+    return { changed, failed };
+  }
+
+  /**
+   * Takes every stop off the routes of the active trains whose gym the gym list does not know:
+   * what a deletion could not mend (a train that could not be stored then, or the bot stopped
+   * between the end of the gym and the trains). It is the bot's own act: the post is told in a
+   * line, and nobody is pinged, also when the train was at that stop (who was here is coming
+   * again, as after any removal of the current stop). Gives how many trains were changed.
+   *
+   * Nothing is done while the gym list knows no gym at all: against a list that is empty, a
+   * sweep would empty every route. (A list that could not be read keeps what it had.)
+   */
+  async removeUnknownStops(): Promise<number> {
+    const { store, gyms, posts, lines, log } = this.options;
+    if (gyms.size === 0) return 0;
+    let mended = 0;
+    for (const train of store.active().filter(isTrain)) {
+      try {
+        const stored = await storedChange<TrainParty, { removed: number }>(
+          store,
+          train.id,
+          isTrain,
+          (party) => {
+            let current = party;
+            let removed = 0;
+            for (;;) {
+              const index = current.train.route.findIndex((id) => gyms.get(id) === undefined);
+              if (index < 0) break;
+              const without = removeStop(current, SWEEPER, index + 1, true);
+              if (!without.ok) return without;
+              current = without.party;
+              removed += 1;
+            }
+            return { ok: true, party: current, removed };
+          },
+        );
+        if (stored.kind !== 'ok' || !stored.written) continue;
+        mended += 1;
+        posts.changed(train.id);
+        const { removed } = stored.extra;
+        const postId = stored.party.forumPostId;
+        if (postId !== null) {
+          lines.say(
+            postId,
+            removed === 1
+              ? "A stop was removed: its gym is no longer in Pine's gym list."
+              : `${count(removed, 'stop')} were removed: their gyms are no longer in Pine's gym list.`,
+          );
+        }
+      } catch (err) {
+        log.warn({ err, party: train.id }, 'could not take unknown stops off the route of a train');
+      }
+    }
+    return mended;
+  }
+
   /** Moves the stop with the number `from` to the number `to` (`moveStop`). */
   moveStop(
     partyId: string,
@@ -431,19 +552,22 @@ export class TrainService {
     if (!before || !isTrain(before) || before.regionId === null) return { kind: 'gone' };
     const route = await routes.get(member.id, before.regionId, routeId);
     if (!route) return { kind: 'none' };
-    const existing = [...new Set(route.gyms)].filter(
-      (gymId) => gyms.get(gymId) !== undefined && this.reaches(before, gymId),
-    );
-    const missing = new Set(route.gyms).size - existing.length;
-    const cut = Math.max(0, existing.length - MAX_ROUTE_STOPS);
     const loaded = await this.movable(
       partyId,
       member,
       (party) => {
+        // Decided here, inside the store: a gym that was deleted while the load waited for the
+        // train's turn is left out like one that was gone before.
+        const distinct = [...new Set(route.gyms)];
+        const existing = distinct.filter(
+          (gymId) => gyms.get(gymId) !== undefined && this.reaches(party, gymId),
+        );
+        const missing = distinct.length - existing.length;
+        const cut = Math.max(0, existing.length - MAX_ROUTE_STOPS);
         const replaced = replaceRoute(party, member.id, existing, staff);
         return replaced.ok ? { ...replaced, route, missing, cut } : replaced;
       },
-      (party) =>
+      (party, { cut }) =>
         `${memberText(member)} loaded ` +
         // A route of the legacy bot may have no name.
         (route.name === ''
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/in-train.test.ts src/commands/raids/raid.test.ts src/services/gym-admin-service.test.ts src/services/gym-directory.test.ts src/services/party-store.test.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts`
Expected: PASS.

This task also changes database tests (`src/db/repositories/gym-notification-repository.db.test.ts`, `src/db/repositories/gym-removal-repository.db.test.ts`, `src/db/repositories/gym-repository.db.test.ts`, `src/db/repositories/saved-route-repository.db.test.ts`). They need Docker; run them when it is available (`npx vitest run --project db src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-removal-repository.db.test.ts src/db/repositories/gym-repository.db.test.ts src/db/repositories/saved-route-repository.db.test.ts`), otherwise say in the report that they were not run: the controller runs the whole database suite after the last task.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff a78c3e9 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/app-context.ts src/app.ts src/commands/parties/in-train.test.ts src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/gym-removal-repository.db.test.ts src/db/repositories/gym-removal-repository.ts src/db/repositories/gym-repository.db.test.ts src/db/repositories/gym-repository.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-repository.ts src/domain/party/party.ts src/render/activity.ts src/render/gym-view.ts src/services/gym-admin-service.test.ts src/services/gym-admin-service.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts src/services/train-service.ts test/support/gym-admin.ts test/support/gym-store.ts test/support/gym-targets.ts test/support/party-service.ts test/support/saved-routes.ts test/support/test-context.ts
npm run typecheck; npx eslint src/app-context.ts src/app.ts src/commands/parties/in-train.test.ts src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/gym-removal-repository.db.test.ts src/db/repositories/gym-removal-repository.ts src/db/repositories/gym-repository.db.test.ts src/db/repositories/gym-repository.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-repository.ts src/domain/party/party.ts src/render/activity.ts src/render/gym-view.ts src/services/gym-admin-service.test.ts src/services/gym-admin-service.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts src/services/train-service.ts test/support/gym-admin.ts test/support/gym-store.ts test/support/gym-targets.ts test/support/party-service.ts test/support/saved-routes.ts test/support/test-context.ts   # both clean; the full check runs after the last task
git add src/app-context.ts src/app.ts src/commands/parties/in-train.test.ts src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/db/repositories/gym-notification-repository.db.test.ts src/db/repositories/gym-notification-repository.ts src/db/repositories/gym-removal-repository.db.test.ts src/db/repositories/gym-removal-repository.ts src/db/repositories/gym-repository.db.test.ts src/db/repositories/gym-repository.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-repository.ts src/domain/party/party.ts src/render/activity.ts src/render/gym-view.ts src/services/gym-admin-service.test.ts src/services/gym-admin-service.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/party-store.test.ts src/services/party-store.ts src/services/raid-change-service.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts src/services/train-service.ts test/support/gym-admin.ts test/support/gym-store.ts test/support/gym-targets.ts test/support/party-service.ts test/support/saved-routes.ts test/support/test-context.ts
git commit -F <a file with the message below>
```

The commit message:

```
Gym administration service: add, edit, move, elite flag, delete

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 5: The gym command: show and add, the gym option, guarded autocomplete for staff

**Files:**
- Create: `src/commands/gyms/add.ts`, `src/commands/gyms/controls.ts`, `src/commands/gyms/form.ts`, `src/commands/gyms/gym-option.ts`, `src/commands/gyms/gym.test.ts`, `src/commands/gyms/index.ts`, `src/commands/gyms/shared.ts`, `src/commands/gyms/show.ts`, `src/render/gym-view.test.ts`, `test/support/gym-commands.ts`
- Modify: `src/commands/admin/self-roles.test.ts`, `src/commands/index.ts`, `src/commands/raids/boss.test.ts`, `src/commands/raids/raid-input.ts`, `src/components/index.ts`, `src/discord/custom-id.ts`, `src/discord/router.test.ts`, `src/discord/router.ts`, `src/render/gym-view.ts`, `src/services/pending-requests.test.ts`, `src/services/pending-requests.ts`, `test/support/fake-interactions.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4; `commandGroup`; `InteractionRouter`; `PendingRequests`; `encodeCustomId` / `parseCustomId`; `src/commands/raids/raid-input.ts`; the fake interactions.
- Produces: The router runs the command-level guards of a command with `default_member_permissions` for an autocomplete interaction and answers an empty list on a refusal; `/gym` (`src/commands/gyms/index.ts`), listed in `src/commands/index.ts`; `gym-option.ts` (`respondWithGyms`, `chosenGym`, `staffGymHits`) and the shared decision rule `clearGymHit` in `raid-input.ts`; `/gym show` and `/gym add` (`show.ts`, `add.ts`, `form.ts`); `shared.ts` (`pendingGyms`, `PENDING_HOURS`, the answers) and the component handler `gymControls` (`controls.ts`, custom-id kind `gym`: `gym:<token>:<action>`, documented in `custom-id.ts`, listed in `src/components/index.ts`); `PendingRequests.peek`; the gym view of `src/render/gym-view.ts` (`gymWithId`, the embed, the cuts); `isFromMessage()` on the fake modal; `test/support/gym-commands.ts`.

`shared.ts`, `controls.ts` and the documentation in `custom-id.ts` already name the requests and controls of Tasks 6 and 7; nothing here refers to a file of a later task.

Reference commit of the prototype for this task: `63d8eb9`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/self-roles.test.ts`:

```diff
--- a/src/commands/admin/self-roles.test.ts
+++ b/src/commands/admin/self-roles.test.ts
@@ -51,12 +51,15 @@ function setup() {
   };
   const answer = async (subcommand: string, options: Options = {}, extra: object = {}) =>
     (await answers(subcommand, options, extra)).join('\n');
-  const choices = async (subcommand: string, focused: string) => {
+  const choices = async (subcommand: string, focused: string, extra: object = {}) => {
     const interaction = fakeAutocomplete({
       commandName: 'admin',
       subcommandGroup: 'self-roles',
       subcommand,
       focused,
+      // The lists of a command for staff are for staff: the router asks the command's guards.
+      roleNames: ['Moderator'],
+      ...extra,
     });
     await router.handle(interaction as never);
     return interaction.respond.mock.calls[0]?.[0] ?? [];
@@ -699,6 +702,8 @@ describe('/admin self-roles group and ungroup', () => {
     expect(await choices('ungroup', 'r')).toEqual([
       { name: 'Regions · any number', value: 'Regions' },
     ]);
+    // A member who is not staff learns nothing from the list.
+    expect(await choices('ungroup', 'r', { roleNames: [] })).toEqual([]);
     expect(await answer('ungroup', { name: 'regions' })).toBe(
       'Removed the group **Regions**. Its 3 roles are under "Other" now.',
     );
```

Create `src/commands/gyms/gym.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { sent } from '../../../test/support/fake-interactions.js';
import { UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonId,
  buttonsOf,
  embedOf,
  gymCommandsWith,
  MEMBER,
  MODERATOR,
} from '../../../test/support/gym-commands.js';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { PENDING_HOURS } from './shared.js';

const choices = (interaction: { respond: { mock: { calls: unknown[][] } } }) =>
  interaction.respond.mock.calls[0]?.[0] as { name: string; value: string }[];

const FREE = '40.015, -80.015';
const FREE_LINK =
  '[40.015, -80.015](<https://www.google.com/maps/search/?api=1&query=40.015%2C-80.015>)';

describe('/gym: who may use it', () => {
  it('is shown to staff only and tied to no channel', async () => {
    const { ctx } = await gymCommandsWith();
    const { gym } = await import('./index.js');
    const json = gym.data.toJSON();
    expect(json.default_member_permissions).toBe('32');
    expect(gym.guards).toHaveLength(1);
    expect(ctx.config.settings.channels['bot-lab']).toBeDefined();
  });

  it('refuses a member who is not staff, whatever Discord let through', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('show', { gym: 'id:1' }, { userId: MEMBER, roleNames: [] });
    expect(used.reply).toHaveBeenCalledWith({
      content: 'Only admins, moderators and bot developers can do that.',
      flags: MessageFlags.Ephemeral,
    });
    expect(used.deferReply).not.toHaveBeenCalled();
  });

  it('answers a member who is not staff an empty list while they type', async () => {
    const made = await gymCommandsWith();
    const typed = await made.typing('show', 'library', { userId: MEMBER, roleNames: [] });
    expect(choices(typed)).toEqual([]);
    const staff = await made.typing('show', 'library');
    expect(choices(staff)).toEqual([
      { name: 'Pinewood Public Library · The Stacks · #1', value: 'id:1' },
    ]);
  });
});

describe('/gym: the gym option', () => {
  it('lists the gyms of the region by name while nothing is typed, and none elsewhere', async () => {
    const made = await gymCommandsWith();
    const here = choices(await made.typing('show', ''));
    expect(here.map((choice) => choice.name)).toEqual([
      'Maple Leaf Mosaic · #6',
      'Old Stone Fountain · #2',
      'Pinewood Post Office Gym · #12',
      'Pinewood Public Library · The Stacks · #1',
      'Riverside Park Gazebo · #11',
      "St. Mary's Church · #3",
      'Starbucks · #5',
      'Veterans Memorial Bridge · #4',
    ]);
    expect(choices(await made.typing('show', '  ', { channelId: '600000000000000009' }))).toEqual(
      [],
    );
  });

  it('finds every gym, the gyms of the region first', async () => {
    const made = await gymCommandsWith();
    // Two gyms of one name, told apart by their numbers: the one of this region first.
    expect(choices(await made.typing('show', 'starbucks'))).toEqual([
      { name: 'Starbucks · #5', value: 'id:5' },
      { name: 'Starbucks · #9', value: 'id:9' },
    ]);
    expect(
      choices(await made.typing('show', 'starbucks', { channelId: EAST_CHANNEL })).map(
        (choice) => choice.value,
      ),
    ).toEqual(['id:9', 'id:5']);
    // A gym of no region, and one far in another region, are found from here too.
    expect(choices(await made.typing('show', 'lakeview'))).toEqual([
      { name: 'Lakeview Trailhead · #10', value: 'id:10' },
    ]);
    expect(choices(await made.typing('show', 'fresco')).map((choice) => choice.value)).toEqual([
      'id:8',
    ]);
  });

  it('puts the gym with a typed number first', async () => {
    const made = await gymCommandsWith();
    expect(choices(await made.typing('show', '#9'))[0]).toEqual({
      name: 'Starbucks · #9',
      value: 'id:9',
    });
    expect(choices(await made.typing('show', '12'))[0]?.value).toBe('id:12');
    expect(choices(await made.typing('show', '#999'))).toEqual([]);
  });

  it('keeps the number of a gym with a long name in the choice', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(
      3,
      { name: 'Cathedral '.repeat(10).trim(), nickname: 'N'.repeat(100) },
      MODERATOR,
    );
    const [choice] = choices(await made.typing('show', 'cathedral'));
    expect(choice?.name).toHaveLength(100);
    expect(choice?.name.endsWith('… · #3')).toBe(true);
  });

  it.each([['id:1'], ['#1'], ['1'], ['pinewood public library'], ['Stacks']])(
    'takes %j for the Library',
    async (typed) => {
      const made = await gymCommandsWith();
      const shown = await made.use('show', { gym: typed });
      expect(embedOf(answerOf(shown)).footer?.text).toBe('Gym #1 · 40.05, -80.05');
    },
  );

  it('refuses text that does not name one gym for certain, with the gyms it might mean', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('show', { gym: 'starbucks' });
    expect(sent(used.followUp)).toEqual({
      content:
        '"starbucks" does not name one gym for certain. Pick it from the list, or give its ' +
        'number:\n- **Starbucks** (#5)\n- **Starbucks** (#9)',
      flags: MessageFlags.Ephemeral,
    });
    // A misspelling is a guess, even of one gym.
    const guess = await made.use('show', { gym: 'libary' });
    expect(sent(guess.followUp).content).toContain(
      '- **Pinewood Public Library** (The Stacks, #1)',
    );
  });

  it('takes digits for the number of a gym, unless another gym is called so', async () => {
    const made = await gymCommandsWith();
    // Gym 12 exists, and no gym has 12 in its name: the number.
    const twelve = await made.use('show', { gym: '12' });
    expect(embedOf(answerOf(twelve)).footer?.text).toMatch(/^Gym #12 /);
    // Not gym 120 or 121 either, which the search would find by the beginning of their number.
    await made.gymStore.create({ name: 'Liberty Bell', lat: 40.021, lon: -80.021 });
    await made.directory.refreshGym(13);
    const one = await made.use('show', { gym: '1' });
    expect(embedOf(answerOf(one)).footer?.text).toMatch(/^Gym #1 /);

    // A gym that is called "1776": its name is no longer hidden behind gym #12's number…
    await made.admin.edit(13, { name: '12' }, MODERATOR);
    const both = await made.use('show', { gym: '12' });
    expect(sent(both.followUp).content).toBe(
      '"12" is the number of one gym and in the name of another. Pick the one you mean from ' +
        'the list, or write the number as `#12`:\n' +
        '- **Pinewood Post Office Gym** (#12)\n- **12** (#13)',
    );
    // …and the number with its sign is always the number.
    expect(embedOf(answerOf(await made.use('show', { gym: '#12' }))).footer?.text).toMatch(
      /^Gym #12 /,
    );
    expect(embedOf(answerOf(await made.use('show', { gym: 'id:12' }))).footer?.text).toMatch(
      /^Gym #12 /,
    );
    // Digits that are no gym's number are text like any other.
    await made.admin.edit(13, { name: 'Route 1776 Marker' }, MODERATOR);
    const named = await made.use('show', { gym: '1776' });
    expect(embedOf(answerOf(named)).footer?.text).toMatch(/^Gym #13 /);
    expect(sent((await made.use('show', { gym: '4242' })).followUp).content).toMatch(
      /^I found no gym for "4242"\./,
    );
  });

  it('keeps a gym that is called by the digits, whatever its own number begins with', async () => {
    const made = await gymCommandsWith();
    // Gym 120 is called "12 Apostles", and no gym has the number 12.
    await made.gymStore.delete(12);
    await made.directory.refreshGym(12);
    for (let id = 13; id <= 120; id++) {
      await made.gymStore.create({
        name: id === 120 ? '12 Apostles' : `Filler ${String.fromCharCode(97 + (id % 26))}`,
        lat: 41 + id / 1000,
        lon: -81,
      });
    }
    await made.directory.load();
    const apostles = await made.use('show', { gym: '12' });
    expect(embedOf(answerOf(apostles)).footer?.text).toMatch(/^Gym #120 /);
  });

  it('does not act on a number that another gym with a longer number is called by', async () => {
    const made = await gymCommandsWith();
    // Gym 1 exists, and gym 13 is called "1 Main Street": `1` could mean either.
    await made.gymStore.create({ name: '1 Main Street', lat: 41, lon: -81 });
    await made.directory.refreshGym(13);
    const both = await made.use('show', { gym: '1' });
    expect(sent(both.followUp).content).toBe(
      '"1" is the number of one gym and in the name of another. Pick the one you mean from ' +
        'the list, or write the number as `#1`:\n' +
        '- **Pinewood Public Library** (The Stacks, #1)\n- **1 Main Street** (#13)',
    );
  });

  it('names a gym whose legacy name shows as nothing by its number', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(3, { name: '\u202e\u200b\u0007', nickname: null });
    await made.directory.refreshGym(3);
    const shown = answerOf(await made.use('show', { gym: '#3' }));
    expect(embedOf(shown).title).toBe('Gym #3');
    const typed = await made.typing('show', '#3');
    expect(choices(typed)).toEqual([{ name: 'Gym · #3', value: 'id:3' }]);
    const refused = await made.use('show', { gym: 'starbucks' });
    expect(sent(refused.followUp).content).not.toContain('****');
  });

  it('shows a legacy name without its control and direction characters, the number in its place', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(3, { name: 'Old\u202e Mill\u0007\u200f', nickname: '\u202eXY' });
    await made.directory.refreshGym(3);
    const [choice] = choices(await made.typing('show', 'mill'));
    expect(choice).toEqual({ name: 'Old Mill · XY · #3', value: 'id:3' });
    const refused = await made.use('show', { gym: 'old' });
    expect(sent(refused.followUp).content).toContain('- **Old Mill** (XY, #3)');
  });

  it('refuses text that names no gym, and a number that no gym has', async () => {
    const made = await gymCommandsWith();
    expect(sent((await made.use('show', { gym: 'zzzz *qqqq*' })).followUp).content).toBe(
      'I found no gym for "zzzz \\*qqqq\\*". Type part of its name and pick it from the list, ' +
        'or give its number (`#123`).',
    );
    expect(sent((await made.use('show', { gym: '#999' })).followUp).content).toBe(
      'There is no gym #999.',
    );
    expect(sent((await made.use('show', { gym: 'id:999' })).followUp).content).toBe(
      'There is no gym #999.',
    );
  });
});

describe('/gym show', () => {
  it('shows the gym for the staff member alone, with how many members target it', async () => {
    const made = await gymCommandsWith();
    await made.gymTargets.add(MEMBER, made.gateway.guildId, 1);
    const shown = await made.use('show', { gym: 'id:1' });
    expect(shown.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(shown);
    expect(answer).toMatchObject({ content: '', files: [], components: [] });
    const embed = embedOf(answer);
    expect(embed.title).toBe('Pinewood Public Library (The Stacks)');
    const fields = Object.fromEntries((embed.fields ?? []).map((f) => [f.name, f.value]));
    expect(fields).toMatchObject({
      'Elite raid gym': 'No',
      Regions: `<#${WEST_CHANNEL}>`,
      'Gym targets': '1 member',
    });
    expect(fields['Nearest gym']).toMatch(/^\*\*.+\*\* \(#\d+\), \d+(\.\d)? k?m away$/);
  });

  it('attaches the map picture when there is one', async () => {
    const made = await gymCommandsWith();
    Object.assign(made.ctx, {
      maps: { enabled: true, gym: () => Promise.resolve('var/images/gyms/1-abc.png') },
    });
    const answer = answerOf(await made.use('show', { gym: 'id:1' }));
    expect(answer.files).toEqual(['var/images/gyms/1-abc.png']);
    expect(embedOf(answer).image).toEqual({ url: 'attachment://1-abc.png' });
  });

  it('shows the gym also when its map or its targets cannot be had', async () => {
    const made = await gymCommandsWith();
    Object.assign(made.ctx, {
      maps: { enabled: true, gym: () => Promise.reject(new Error('disk full')) },
    });
    made.gymTargets.failing = new Error('database is down');
    const answer = answerOf(await made.use('show', { gym: 'id:1' }));
    const fields = Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
    expect(fields['Gym targets']).toBe('Unknown');
    expect(answer.files).toEqual([]);
  });
});

describe('/gym add', () => {
  it('asks with what it understood and stores nothing before the answer', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('add', { location: FREE, name: '  Clock   Tower ' });
    expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const question = answerOf(asked);
    expect(question.content).toBe(
      `Add **Clock Tower** at ${FREE_LINK}?\nIt would lie in <#${WEST_CHANNEL}>.`,
    );
    expect(buttonsOf(question).map(([label]) => label)).toEqual([
      'Add',
      'Add with details…',
      'Cancel',
    ]);
    expect(made.gymStore.writes).toEqual([]);
  });

  it('adds the gym on Add, shows it and tells the channel for bot updates', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));

    const pressed = await made.press(buttonId(question, 'Add'));

    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    const answer = answerOf(pressed);
    expect(answer.content).toBe(
      'Added **Clock Tower** (#13).\nIts address and the places around it are being fetched ' +
        'from Google; `/gym show` has them in a moment.',
    );
    expect(answer.components).toEqual([]);
    expect(embedOf(answer)).toMatchObject({
      title: 'Clock Tower',
      footer: { text: 'Gym #13 · 40.015, -80.015' },
    });
    expect(made.gymStore.row(13)).toMatchObject({ name: 'Clock Tower', lat: 40.015, lon: -80.015 });
    expect(made.directory.search(WEST_CHANNEL, 'clock tower')[0]?.gym.id).toBe(13);
    await made.settle();
    expect(made.gateway.messagesIn(UPDATES_CHANNEL)).toHaveLength(1);
    expect(made.gymStore.row(13)?.places).toBe('Corner Bakery Maple Dental');
    // Answered once: a second press (a double click) is only acknowledged, and writes nothing
    // over the answer of the first.
    const again = await made.press(buttonId(question, 'Add'));
    expect(again.deferUpdate).toHaveBeenCalledTimes(1);
    expect(again.update).not.toHaveBeenCalled();
    expect(again.editReply).not.toHaveBeenCalled();
    expect(again.reply).not.toHaveBeenCalled();
    expect(made.gymStore.row(14)).toBeUndefined();
  });

  it('says that a question has expired when it is older than anything it remembers', async () => {
    const made = await gymCommandsWith();
    const pressed = await made.press('gym:00000000000000aa:add');
    expect(sent(pressed.update)).toEqual({
      content: 'That has expired. Use the command again.',
      embeds: [],
      components: [],
    });
  });

  it('keeps a question for hours: a form may be open for long', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const made = await gymCommandsWith();
      const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
      vi.setSystemTime(Date.now() + PENDING_HOURS * 3_600_000 - 60_000);
      const opened = await made.press(buttonId(question, 'Add with details…'));
      expect(opened.showModal).toHaveBeenCalledTimes(1);
      await made.submit(buttonId(question, 'Add with details…').replace(/details$/, 'form'), {
        nickname: 'Big Ben',
      });
      expect(made.gymStore.row(13)?.nickname).toBe('Big Ben');

      const late = answerOf(await made.use('add', { location: '40.02, -80.02', name: 'Late' }));
      vi.setSystemTime(Date.now() + PENDING_HOURS * 3_600_000);
      const pressed = await made.press(buttonId(late, 'Add'));
      expect(sent(pressed.update).content).toBe('That has expired. Use the command again.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says so when the place was only read from the middle of a map', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('add', {
        location: 'https://www.google.com/maps/@40.015,-80.015,17z',
        name: 'Clock Tower',
      }),
    );
    expect(question.content?.split('\n')).toEqual([
      `Add **Clock Tower** at ${FREE_LINK}?`,
      'I read this from where the map was centred, not from a pin: check the link before you go on.',
      `It would lie in <#${WEST_CHANNEL}>.`,
    ]);
  });

  it('names a gym within ten metres and offers to add anyway', async () => {
    const made = await gymCommandsWith();
    // 5.6 metres north of the Library.
    const question = answerOf(
      await made.use('add', { location: '40.05005,-80.05', name: 'Library Annex' }),
    );
    expect(question.content?.split('\n').slice(2)).toEqual([
      'Another gym lies within 10 metres of that place:',
      '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual([
      'Add anyway',
      'Add with details…',
      'Cancel',
    ]);
    await made.press(buttonId(question, 'Add anyway'));
    expect(made.gymStore.row(13)?.name).toBe('Library Annex');
  });

  it('asks again when a gym was put at that place since the question', async () => {
    const made = await gymCommandsWith();
    const first = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const second = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    await made.press(buttonId(first, 'Add'));

    const pressed = await made.press(buttonId(second, 'Add'));

    const again = answerOf(pressed);
    expect(again.content?.split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was added yet.',
      `Add **Clock Tower** at ${FREE_LINK}?`,
      `It would lie in <#${WEST_CHANNEL}>.`,
      'Another gym lies within 10 metres of that place:',
      '- **Clock Tower** (#13), 0 m away',
    ]);
    expect(made.gymStore.row(14)).toBeUndefined();
    await made.press(buttonId(again, 'Add anyway'));
    expect(made.gymStore.row(14)?.name).toBe('Clock Tower');
  });

  it('adds nothing on Cancel', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const pressed = await made.press(buttonId(question, 'Cancel'));
    expect(sent(pressed.update)).toEqual({
      content: 'Nothing was added.',
      embeds: [],
      components: [],
    });
    expect(made.gymStore.writes).toEqual([]);
  });

  it('opens a form for the details and adds the gym with what was sent', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const opened = await made.press(buttonId(question, 'Add with details…'));
    const form = opened.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      title: string;
      components: { components: { custom_id: string; max_length: number; value?: string }[] }[];
    };
    expect(form.title).toBe('Add Clock Tower');
    expect(
      form.components.map((row) => [row.components[0]?.custom_id, row.components[0]?.max_length]),
    ).toEqual([
      ['nickname', 100],
      ['description', 1_000],
      ['notice', 500],
      ['keywords', 1_560],
    ]);

    const submitted = await made.submit(form.custom_id, {
      nickname: ' Big Ben ',
      description: 'Four faces.\n\n\n\nChimes on the hour.',
      notice: '',
      keywords: 'Clock, tower , CLOCK',
    });

    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    expect(answerOf(submitted).content).toContain('Added **Clock Tower** (Big Ben, #13).');
    expect(made.gymStore.row(13)).toMatchObject({
      name: 'Clock Tower',
      nickname: 'Big Ben',
      description: 'Four faces.\n\nChimes on the hour.',
      notice: null,
      keywords: ['clock', 'tower'],
    });
    // The question was answered by the form: its Add button adds no second gym.
    await made.press(buttonId(question, 'Add'));
    expect(made.gymStore.row(14)).toBeUndefined();
  });

  it('refuses a form whose texts cannot be stored, keeps what was typed and opens it again', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const formId = buttonId(question, 'Add with details…').replace(/details$/, 'form');
    const typed = {
      nickname: "'".repeat(60),
      description: 'Four faces.\nChimes on the hour.',
      notice: '',
      keywords: `clock, ${'k'.repeat(52)}`,
    };
    const refused = await made.submit(formId, typed);
    // The form was opened from the question: the refusal takes its place, so that no button
    // of the question stays that would add the gym without the details.
    expect(refused.reply).not.toHaveBeenCalled();
    const refusal = sent(refused.update);
    expect(refusal.content).toBe(
      'The nickname is too long as I store it, by 105 characters: apostrophes, accents and ' +
        'letters of other alphabets take several characters each. Shorten it.\n' +
        'The keyword "kkkkkkkkkkkkkkkkkkkkkkkkkkkkk…" is 2 characters too long: a keyword may have 50.\n' +
        'Nothing was saved. What you typed is kept:',
    );
    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again', 'Cancel']);
    expect(made.gymStore.writes).toEqual([]);

    // The form opens with what was typed, the paragraph included.
    const reopened = await made.press(buttonId(refusal, 'Open the form again'));
    const form = reopened.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      components: { components: { custom_id: string; value?: string }[] }[];
    };
    expect(form.custom_id).toBe(formId);
    expect(
      Object.fromEntries(
        form.components.map((row) => [row.components[0]?.custom_id, row.components[0]?.value]),
      ),
    ).toEqual({
      nickname: "'".repeat(60),
      description: 'Four faces.\nChimes on the hour.',
      notice: undefined,
      keywords: `clock, ${'k'.repeat(52)}`,
    });
    // Corrected and sent again, it adds the gym.
    await made.submit(form.custom_id, { ...typed, nickname: 'Big Ben', keywords: 'clock' });
    expect(made.gymStore.row(13)).toMatchObject({
      name: 'Clock Tower',
      nickname: 'Big Ben',
      description: 'Four faces.\nChimes on the hour.',
      keywords: ['clock'],
    });
  });

  it('adds nothing when a refused form is given up', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const formId = buttonId(question, 'Add with details…').replace(/details$/, 'form');
    const refused = await made.submit(formId, { keywords: 'k'.repeat(52) });
    const cancelled = await made.press(buttonId(sent(refused.update), 'Cancel'));
    expect(sent(cancelled.update).content).toBe('Nothing was added.');
    expect(made.gymStore.writes).toEqual([]);
  });

  it('keeps the details when the question has to be asked anew', async () => {
    const made = await gymCommandsWith();
    const first = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const second = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    await made.press(buttonId(first, 'Add'));
    // The details are sent for the second question, at whose place a gym now stands.
    const typed = {
      nickname: 'Big Ben',
      description: 'Four faces.',
      notice: '',
      keywords: 'Clock',
    };
    const submitted = await made.submit(
      buttonId(second, 'Add with details…').replace(/details$/, 'form'),
      typed,
    );
    const again = answerOf(submitted);
    expect(again.content).toContain('A gym was added at that place since I asked');
    expect(made.gymStore.row(14)).toBeUndefined();

    // "Add with details…" of the new question opens with them.
    const opened = await made.press(buttonId(again, 'Add with details…'));
    const form = opened.showModal.mock.calls[0]?.[0] as {
      custom_id: string;
      components: { components: { custom_id: string; value?: string }[] }[];
    };
    expect(
      Object.fromEntries(
        form.components.map((row) => [row.components[0]?.custom_id, row.components[0]?.value]),
      ),
    ).toEqual({
      nickname: 'Big Ben',
      description: 'Four faces.',
      notice: undefined,
      keywords: 'Clock',
    });
    await made.submit(form.custom_id, typed);
    expect(made.gymStore.row(14)).toMatchObject({ nickname: 'Big Ben', keywords: ['clock'] });
  });

  it('lets nobody else answer the question, and nobody who is not staff', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: FREE, name: 'Clock Tower' }));
    const other = await made.press(buttonId(question, 'Add'), { userId: '200000000000000007' });
    expect(sent(other.reply).content).toBe('That is somebody else’s question.');
    const member = await made.press(buttonId(question, 'Add'), { userId: MEMBER, roleNames: [] });
    expect(sent(member.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    const form = await made.press(buttonId(question, 'Add with details…'), {
      userId: '200000000000000007',
    });
    expect(form.showModal).not.toHaveBeenCalled();
    expect(made.gymStore.writes).toEqual([]);
    // It is still the staff member's to answer.
    await made.press(buttonId(question, 'Add'));
    expect(made.gymStore.row(13)).toBeDefined();
  });

  it('follows a short link, and says so when it leads nowhere', async () => {
    const made = await gymCommandsWith();
    made.geo.links.set(
      'https://maps.app.goo.gl/AbC123',
      'https://www.google.com/maps/place/X/@40.5,-79.9,17z/data=!3d40.015!4d-80.015',
    );
    const question = answerOf(
      await made.use('add', { location: 'https://maps.app.goo.gl/AbC123', name: 'Clock Tower' }),
    );
    expect(question.content).toContain(FREE_LINK);
    const lost = await made.use('add', { location: 'https://maps.app.goo.gl/Nope', name: 'X' });
    expect(sent(lost.followUp).content).toBe(
      'I could not follow that link. Paste the coordinates instead.',
    );
    // What many links of the app lead to: a place by its name, without coordinates.
    made.geo.links.set(
      'https://maps.app.goo.gl/Named',
      'https://www.google.com/maps/place/Big+Fountain/data=!4m2!3m1!1s0x8834f1:0x1',
    );
    const named = await made.use('add', { location: 'https://maps.app.goo.gl/Named', name: 'X' });
    expect(sent(named.followUp).content).toBe(
      'That link does not say where the place is. Open it, long-press the pin, and paste the ' +
        'coordinates Google shows.',
    );
  });

  it('says in its help how to get a location from the game', async () => {
    const { gym } = await import('./index.js');
    const add = gym.subcommands.get('add');
    expect(typeof add?.help?.details === 'string' && add.help.details).toMatch(
      /^In Pokémon GO open the gym, choose View in map, share the link and paste it here\. Coordinates \(`40\.4406, -79\.9959`\) work too\./,
    );
    const subcommands = (gym.data.toJSON().options ?? []) as {
      name: string;
      options?: { name: string; description: string }[];
    }[];
    const option = subcommands
      .find((sub) => sub.name === 'add')
      ?.options?.find((one) => one.name === 'location');
    expect(option?.description).toBe(
      'The link Pokémon GO shares (gym, View in map, share), or coordinates like 40.4406, -79.9959',
    );
    expect(option?.description.length).toBeLessThanOrEqual(100);
  });

  it('adds a gym from the link that "View in map" of Pokémon GO shares', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('add', {
        location: 'https://maps.google.com/?q=40.015,-80.015&entry=gps&g_ep=CAESBzI1&shorturl=1',
        name: 'Clock Tower',
      }),
    );
    // The place itself: no warning about the middle of a map.
    expect(question.content).toBe(
      `Add **Clock Tower** at ${FREE_LINK}?\nIt would lie in <#${WEST_CHANNEL}>.`,
    );
  });

  it('refuses a location it cannot read with what it reads, and a name of nothing', async () => {
    const made = await gymCommandsWith();
    const unreadable = await made.use('add', { location: 'by the lake', name: 'Clock Tower' });
    expect(sent(unreadable.followUp).content).toBe(
      'I could not read a place from that. Give the coordinates as `40.4406, -79.9959`, or ' +
        'paste a link to the place from Google Maps (also the short link its app shares), ' +
        'Apple Maps or the Ingress intel map.',
    );
    const nowhere = await made.use('add', { location: '95.5, 10', name: 'Clock Tower' });
    expect(sent(nowhere.followUp).content).toMatch(/^Those numbers are no place: a latitude/);
    const nameless = await made.use('add', { location: FREE, name: ' \n ' });
    expect(sent(nameless.followUp).content).toBe('A gym needs a name.');
    const wide = await made.use('add', { location: FREE, name: "'".repeat(50) });
    expect(sent(wide.followUp).content).toMatch(
      /^The name is too long as I store it, by 45 characters/,
    );
    expect(made.pending()).toBeGreaterThanOrEqual(0);
    expect(made.gymStore.writes).toEqual([]);
  });

  it('says of a place outside every region that it lies in none, and adds the gym all the same', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('add', { location: '41.0, -80', name: 'Far Away' }));
    expect(question.content).toContain('It would lie in no region of this server.');
    const answer = answerOf(await made.press(buttonId(question, 'Add')));
    const fields = Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
    expect(fields.Regions).toBe('None of this server');
  });

  it('notes a name the search ignores, and that nothing is fetched without a key', async () => {
    const made = await gymCommandsWith();
    made.geo.enabled = false;
    const question = answerOf(await made.use('add', { location: FREE, name: 'The Gym' }));
    const answer = answerOf(await made.press(buttonId(question, 'Add')));
    expect(answer.content?.split('\n')).toEqual([
      'Added **The Gym** (#13).',
      'No Google API key is configured, so it has no address and no nearby places.',
      'Its name consists only of words the search ignores, so members will not find it by ' +
        'name: only by its number (#13), or by a nickname or keywords you give it.',
    ]);
  });
});
```

Apply to `src/commands/raids/boss.test.ts`:

```diff
--- a/src/commands/raids/boss.test.ts
+++ b/src/commands/raids/boss.test.ts
@@ -178,7 +178,8 @@ describe('the command list', () => {
         name,
       ).toHaveLength(1);
     }
-    // `/gym` is kept for the gym administration (Phase 5).
-    expect(names).not.toContain('gym');
+    // `/gym` is the gym administration (plan 5A), a group of subcommands: the raid command for
+    // another gym is `/location`.
+    expect(commands.find((command) => command.data.name === 'gym')?.subcommands).toBeDefined();
   });
 });
```

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -1,5 +1,6 @@
 import {
   MessageFlags,
+  PermissionFlagsBits,
   SlashCommandBuilder,
   SlashCommandSubcommandBuilder,
   type Interaction,
@@ -616,6 +617,88 @@ describe('InteractionRouter', () => {
     expect(none.respond).toHaveBeenCalledWith([]);
   });
 
+  describe('autocomplete of a command for staff', () => {
+    const refuse: Guard = () => {
+      throw new UserError('Only staff can do that.');
+    };
+    /** `/gym edit` with a list; for staff (`default_member_permissions`) unless told otherwise. */
+    function staffGym(options: { staff?: boolean; guards?: Guard[]; partGuards?: Guard[] }) {
+      const choices = vi.fn((i: { respond(c: unknown[]): Promise<void> }) =>
+        i.respond([{ name: 'Big Fountain', value: 'id:1' }]),
+      );
+      const data = new SlashCommandBuilder().setName('gym').setDescription('Gyms');
+      if (options.staff !== false)
+        data.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
+      const grouped = commandGroup({
+        data,
+        help: { category: 'admin' },
+        ...(options.guards ? { guards: options.guards } : {}),
+        parts: [
+          part('edit', {
+            autocomplete: choices as never,
+            ...(options.partGuards ? { guards: options.partGuards } : {}),
+          }),
+        ],
+      });
+      return { grouped, choices };
+    }
+    const typing = () => fakeAutocomplete({ commandName: 'gym', subcommand: 'edit' });
+
+    it('runs the guards of the command and answers an empty list to whom they refuse', async () => {
+      const { ctx, entries } = createTestContext();
+      const { grouped, choices } = staffGym({ guards: [refuse] });
+      const i = typing();
+      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(i));
+      expect(choices).not.toHaveBeenCalled();
+      expect(i.respond).toHaveBeenCalledTimes(1);
+      expect(i.respond).toHaveBeenCalledWith([]);
+      // A refusal is no error: nothing is logged, nothing is said.
+      expect(entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
+    });
+
+    it('answers the list to whom the guards let through, also an asynchronous one', async () => {
+      const { ctx } = createTestContext();
+      const seen: unknown[] = [];
+      const allow: Guard = async (interaction) => {
+        await Promise.resolve();
+        seen.push(interaction);
+      };
+      const { grouped, choices } = staffGym({ guards: [allow] });
+      const i = typing();
+      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(i));
+      expect(seen).toEqual([i]);
+      expect(choices).toHaveBeenCalledTimes(1);
+      expect(i.respond).toHaveBeenCalledWith([{ name: 'Big Fountain', value: 'id:1' }]);
+    });
+
+    it('does not run the guards of the subcommand', async () => {
+      const { ctx } = createTestContext();
+      const { grouped, choices } = staffGym({ guards: [], partGuards: [refuse] });
+      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(typing()));
+      expect(choices).toHaveBeenCalledTimes(1);
+    });
+
+    it('does not run the guards of a command that is for everybody', async () => {
+      const { ctx } = createTestContext();
+      const { grouped, choices } = staffGym({ staff: false, guards: [refuse] });
+      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(typing()));
+      expect(choices).toHaveBeenCalledTimes(1);
+    });
+
+    it('answers an empty list and logs when a guard fails for another reason', async () => {
+      const { ctx, entries } = createTestContext();
+      const broken: Guard = () => {
+        throw new Error('roles unavailable');
+      };
+      const { grouped, choices } = staffGym({ guards: [broken] });
+      const i = typing();
+      await new InteractionRouter(ctx, [grouped], []).handle(asInteraction(i));
+      expect(choices).not.toHaveBeenCalled();
+      expect(i.respond).toHaveBeenCalledWith([]);
+      expect(entries.some((entry) => entry.msg === 'autocomplete failed')).toBe(true);
+    });
+  });
+
   it('responds with no choices for a command without autocomplete', async () => {
     const { ctx } = createTestContext();
     const i = fakeAutocomplete();
```

Create `src/render/gym-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { testGyms } from '../../test/support/gyms.js';
import {
  distanceText,
  gymAnnouncement,
  gymRemovedLine,
  gymWithId,
  regionsSentence,
  renderGymView,
  type GymView,
  type ViewedGym,
} from './gym-view.js';
import { LIMITS } from './text.js';

const library = (): ViewedGym => {
  const gym = testGyms().find((one) => one.id === 1);
  if (!gym) throw new Error('no gym 1');
  return gym;
};

const view = (gym: Partial<ViewedGym> = {}, more: Partial<GymView> = {}): GymView => ({
  gym: { ...library(), ...gym },
  regions: [{ channelId: '100000000000000001' }],
  nearest: { gym: { id: 12, name: 'Pinewood Post Office Gym', nickname: null }, metres: 1_402.4 },
  targets: 3,
  ...more,
});

const fieldsOf = (shown: GymView): Record<string, string> =>
  Object.fromEntries((renderGymView(shown).fields ?? []).map(({ name, value }) => [name, value]));

describe('sentences about a gym', () => {
  it('tells a gym from its namesakes by nickname and number', () => {
    expect(gymWithId({ id: 9, name: 'Starbucks', nickname: null })).toBe('**Starbucks** (#9)');
    expect(gymWithId({ id: 1, name: 'Library', nickname: 'The *Stacks*' })).toBe(
      '**Library** (The \\*Stacks\\*, #1)',
    );
    expect(gymWithId({ id: 1, name: 'Library', nickname: '' })).toBe('**Library** (#1)');
  });

  it('cuts a long name and nickname before escaping, and always keeps the number', () => {
    const long = gymWithId({ id: 4711, name: 'a*'.repeat(128), nickname: 'b_'.repeat(128) });
    // 80 and 40 characters, the last of each an ellipsis; what is left is escaped whole.
    expect(long).toBe(`**${'a\\*'.repeat(39)}a…** (${'b\\_'.repeat(19)}b…, #4711)`);
    expect(long.length).toBeLessThan(270);
  });

  it('takes control and direction characters out of a legacy name', () => {
    expect(gymWithId({ id: 3, name: 'Old\u202e Mill\u0007', nickname: '\u200fXY\u2066' })).toBe(
      '**Old Mill** (XY, #3)',
    );
    expect(gymRemovedLine({ id: 3, name: '\u202eMill', nickname: null })).toBe(
      '**Mill** (#3) was removed from the gym list.',
    );
  });

  it('names a gym whose name shows as nothing by what it is', () => {
    const invisible = { id: 12, name: '\u202e\u200b\u0007', nickname: '\u200e', lat: 40, lon: -80 };
    expect(gymWithId(invisible)).toBe('**Gym** (#12)');
    expect(gymRemovedLine(invisible)).toBe('**Gym** (#12) was removed from the gym list.');
    expect(gymAnnouncement(invisible, []).embeds?.[0]?.title).toBe('Gym #12');
    const embed = renderGymView(view({ ...invisible }));
    expect(embed.title).toBe('Gym #12');
  });

  it('counts the regions that do not fit into the sentence', () => {
    const many = Array.from({ length: 60 }, (_, n) => ({
      channelId: String(100000000000000000 + n),
    }));
    const sentence = regionsSentence(many);
    expect(sentence.length).toBeLessThan(340);
    expect(sentence).toMatch(/^It lies in <#100000000000000000>, .*, …and \d+ more\.$/);
  });

  it('names the regions a gym lies in', () => {
    expect(regionsSentence([])).toBe('It lies in no region of this server.');
    expect(regionsSentence([{ channelId: '1' }])).toBe('It lies in <#1>.');
    expect(regionsSentence([{ channelId: '1' }, { channelId: '2' }, { channelId: '3' }])).toBe(
      'It lies in <#1>, <#2> and <#3>.',
    );
  });

  it('says a distance in metres, and in kilometres from one on', () => {
    expect(distanceText(4.4)).toBe('4 m');
    expect(distanceText(999.4)).toBe('999 m');
    expect(distanceText(1_402.4)).toBe('1.4 km');
  });

  it('announces a new gym without its nickname when it has none', () => {
    const message = gymAnnouncement({ ...library(), nickname: null }, []);
    expect(message.embeds?.[0]?.description).toBe('It lies in no region of this server.');
    expect(message.mention).toBeUndefined();
  });

  it('says in one line that a gym was removed', () => {
    expect(gymRemovedLine(library())).toBe(
      '**Pinewood Public Library** (The Stacks, #1) was removed from the gym list.',
    );
  });
});

describe('renderGymView', () => {
  it('shows everything that is known of a gym', () => {
    const embed = renderGymView(
      view({ notice: 'Closed on *Sundays*', keywords: ['books', 'mural'] }),
    );
    expect(embed).toEqual({
      title: 'Pinewood Public Library (The Stacks)',
      url: 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05',
      description: 'Mural of readers beside the front doors',
      color: 0x3498db,
      fields: [
        { name: 'Notice', value: 'Closed on \\*Sundays\\*', inline: false },
        { name: 'Elite raid gym', value: 'No', inline: true },
        { name: 'Regions', value: '<#100000000000000001>', inline: true },
        { name: 'Gym targets', value: '3 members', inline: true },
        {
          name: 'Nearest gym',
          value: '**Pinewood Post Office Gym** (#12), 1.4 km away',
          inline: false,
        },
        { name: 'Keywords', value: 'books, mural', inline: false },
        {
          name: 'Address (from Google)',
          value: [
            '**street\\_number**: 12',
            '**route**: Maple Avenue',
            '**locality**: Pinewood',
            '**administrative\\_area\\_level\\_1**: Pennsylvania',
            '**country**: United States',
            '**postal\\_code**: 15999',
            '**neighborhood**: Old Town',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Nearby places (from Google)',
          value: 'Corner Bakery, Maple Dental',
          inline: false,
        },
      ],
      footer: { text: 'Gym #1 · 40.05, -80.05' },
    });
  });

  it('leaves out what a gym does not have, and says none where staff would wonder', () => {
    const shown = view(
      { nickname: null, description: null, notice: null, geodata: null, places: null },
      { regions: [], nearest: undefined, targets: undefined },
    );
    const embed = renderGymView(shown);
    expect(embed.title).toBe('Pinewood Public Library');
    expect(embed.description).toBeUndefined();
    expect(embed.image).toBeUndefined();
    expect(fieldsOf(shown)).toEqual({
      'Elite raid gym': 'No',
      Regions: 'None of this server',
      'Gym targets': 'Unknown',
      'Nearest gym': 'None',
      Keywords: 'None',
    });
  });

  it('calls a gym an elite raid gym when either stored flag is set', () => {
    expect(fieldsOf(view({ taggedEx: true }))['Elite raid gym']).toBe('Yes');
    expect(fieldsOf(view({ confirmedEx: true }))['Elite raid gym']).toBe('Yes');
    expect(JSON.stringify(renderGymView(view({ taggedEx: true, confirmedEx: true })))).not.toMatch(
      /\bEX\b/,
    );
  });

  it('shows the map picture when there is one', () => {
    expect(renderGymView(view({}, { image: 'attachment://gym.png' })).image).toEqual({
      url: 'attachment://gym.png',
    });
  });

  it('counts one member as one', () => {
    expect(fieldsOf(view({}, { targets: 1 }))['Gym targets']).toBe('1 member');
    expect(fieldsOf(view({}, { targets: 0 }))['Gym targets']).toBe('0 members');
  });

  it('shows what staff typed as plain text', () => {
    const shown = view({
      name: '**Bold** [link](https://example.com)',
      nickname: '@everyone',
      description: '# Heading\n<@123> and <#456>',
      keywords: ['_under_'],
      places: '*Star* Cafe',
    });
    const text = JSON.stringify(renderGymView(shown));
    expect(text).not.toContain('**Bold**');
    expect(text).not.toContain('](https://example.com)');
    const description = renderGymView(shown).description ?? '';
    expect(description.startsWith('\\# Heading\n')).toBe(true);
    // A mention typed as text stays text.
    expect(description).not.toContain('<@123>');
    expect(description).not.toContain('<#456>');
    expect(text).not.toContain('@everyone');
    expect(fieldsOf(shown).Keywords).toBe('\\_under\\_');
    expect(fieldsOf(shown)['Nearby places (from Google)']).toBe('\\*Star\\* Cafe');
  });

  it('stays within the limits of an embed whatever the texts of the gym', () => {
    const long = (length: number): string => 'word '.repeat(Math.ceil(length / 5)).slice(0, length);
    const shown = view(
      {
        name: long(255),
        nickname: long(255),
        description: long(20_000),
        notice: long(20_000),
        keywords: Array.from({ length: 400 }, (_, index) => `keyword-number-${index}`),
        geodata: JSON.stringify({
          addressComponents: Object.fromEntries(
            Array.from({ length: 80 }, (_, index) => [`type_${index}`, long(200)]),
          ),
        }),
        places: long(20_000),
      },
      { regions: Array.from({ length: 200 }, (_, index) => ({ channelId: `${1e17 + index}` })) },
    );
    const embed = renderGymView(shown);
    expect(embed.title?.length).toBeLessThanOrEqual(LIMITS.embedTitle);
    expect(embed.description?.length).toBeLessThanOrEqual(2_000);
    expect(embed.fields?.length).toBeLessThanOrEqual(LIMITS.fields);
    let total = (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
    total += embed.footer?.text.length ?? 0;
    for (const { name, value } of embed.fields ?? []) {
      expect(name.length).toBeLessThanOrEqual(LIMITS.fieldName);
      expect(value.length).toBeGreaterThan(0);
      expect(value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
      total += name.length + value.length;
    }
    expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
  });
});
```

Apply to `src/services/pending-requests.test.ts`:

```diff
--- a/src/services/pending-requests.test.ts
+++ b/src/services/pending-requests.test.ts
@@ -34,4 +34,23 @@ describe('PendingRequests', () => {
     expect(pending.take(tokens[1] ?? '', ALICE)).toBe('expired');
     expect(pending.take(tokens[4] ?? '', ALICE)).toEqual({ value: 5 });
   });
+
+  it('lets its owner look at a value without taking it', () => {
+    let now = 1_000;
+    const pending = new PendingRequests<string>({ ttlMs: 600_000, now: () => now });
+    const token = pending.put(ALICE, 'report');
+    expect(pending.peek(token, BOB)).toBe('not-yours');
+    expect(pending.peek(token, ALICE)).toEqual({ value: 'report' });
+    expect(pending.peek(token, ALICE)).toEqual({ value: 'report' });
+    expect(pending.size).toBe(1);
+    expect(pending.take(token, ALICE)).toEqual({ value: 'report' });
+    expect(pending.peek(token, ALICE)).toBe('expired');
+    // Looking does not keep a request alive.
+    const old = pending.put(ALICE, 'old');
+    now += 599_999;
+    expect(pending.peek(old, ALICE)).toEqual({ value: 'old' });
+    now += 1;
+    expect(pending.peek(old, ALICE)).toBe('expired');
+    expect(pending.size).toBe(0);
+  });
 });
```

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -84,6 +84,11 @@ export interface FakeOptions {
   values?: string[];
   /** Modal: the text typed into each input, by the input's custom id. */
   fields?: Record<string, string>;
+  /**
+   * Modal: the form was opened by a slash command, not by a control of a message
+   * (`isFromMessage()` is then false: there is no message to update).
+   */
+  modalFromCommand?: boolean;
   /**
    * A control: the rows of controls of the message it is on, as Discord's API has them
    * (`interaction.message.components`, each with its `toJSON()`).
@@ -284,6 +289,8 @@ function base(kind: Kind, o: FakeOptions) {
     isAnySelectMenu: () => kind === 'select',
     isStringSelectMenu: () => kind === 'select',
     isModalSubmit: () => kind === 'modal',
+    /** A form that a control of a message opened; `modalFromCommand` says a command did. */
+    isFromMessage: () => kind === 'modal' && o.modalFromCommand !== true,
     inCachedGuild: () => guildId !== null,
     inGuild: () => guildId !== null,
     options: {
```

Create `test/support/gym-commands.ts`:

```ts
import { gymControls } from '../../src/commands/gyms/controls.js';
import { gym } from '../../src/commands/gyms/index.js';
import { pendingGyms } from '../../src/commands/gyms/shared.js';
import { admin } from '../../src/commands/admin/index.js';
import { InteractionRouter } from '../../src/discord/router.js';
import type { Party } from '../../src/domain/party/party.js';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
  type FakeOptions,
  type SentPayload,
} from './fake-interactions.js';
import { gymAdminWith } from './gym-admin.js';
import { WEST_CHANNEL } from './gyms.js';
import { createTestContext } from './test-context.js';

/** A moderator of the fakes' server, and a member who is none. */
export const MODERATOR = '200000000000000009';
export const MEMBER = '200000000000000008';

/** The buttons of a message, as `[label, custom id]`, in order. */
export function buttonsOf(payload: SentPayload): [string, string][] {
  return (payload.components ?? []).flatMap((row) => {
    const json = (
      row as { toJSON(): { components: { label?: string; custom_id?: string }[] } }
    ).toJSON();
    return json.components.map((one): [string, string] => [one.label ?? '', one.custom_id ?? '']);
  });
}

/** The custom id of the button with this label under a message. */
export function buttonId(payload: SentPayload, label: string): string {
  const found = buttonsOf(payload).find(([text]) => text === label);
  if (!found) throw new Error(`no button "${label}" among ${JSON.stringify(buttonsOf(payload))}`);
  return found[1];
}

/** What a fake was last answered with: the newest edit of the reply, else the reply or update. */
export function answerOf(interaction: FakeInteraction): SentPayload {
  for (const mock of [
    interaction.editReply,
    interaction.update,
    interaction.followUp,
    interaction.reply,
  ]) {
    const calls = mock.mock.calls.length;
    if (calls > 0) return sent(mock, calls - 1);
  }
  throw new Error('the interaction was not answered');
}

/** The first embed of an answer, as Discord gets it. */
export function embedOf(payload: SentPayload) {
  const [embed] = payload.embeds ?? [];
  if (!embed) throw new Error('the answer has no embed');
  return 'toJSON' in embed ? embed.toJSON() : embed;
}

/**
 * `/gym` and `/admin` over the fakes of `gymAdminWith`, routed like in the bot, used by a
 * moderator in the channel of West unless a call says otherwise. `use` runs a subcommand,
 * `typing` asks for the list of its `gym` option, `press` presses a button and `submit` sends a
 * form, each through the router and each answering the fake interaction to read back.
 */
export async function gymCommandsWith(parties: readonly Party[] = []) {
  const made = await gymAdminWith(parties);
  const { ctx, entries } = createTestContext({
    gymAdmin: made.admin,
    gyms: made.directory,
    regions: made.regions,
    parties: made.store,
    partyService: made.service,
    attendance: made.attendance,
    raids: made.raids,
    trains: made.trains,
    gymTargets: made.gymTargets,
  });
  const router = new InteractionRouter(ctx, [gym, admin], [gymControls]);
  const staff: FakeOptions = {
    userId: MODERATOR,
    roleNames: ['Moderator'],
    displayName: 'Morgan',
    channelId: WEST_CHANNEL,
    guildId: made.gateway.guildId,
  };
  const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
    await router.handle(interaction as never);
    return interaction;
  };
  return {
    ...made,
    ctx,
    logged: entries,
    router,
    use: (
      subcommand: string,
      options: Record<string, string | boolean> = {},
      extra: FakeOptions = {},
    ) => handled(fakeChatInput({ commandName: 'gym', subcommand, options, ...staff, ...extra })),
    typing: (subcommand: string, focused: string, extra: FakeOptions = {}) =>
      handled(
        fakeAutocomplete({
          commandName: 'gym',
          subcommand,
          focused,
          focusedName: 'gym',
          ...staff,
          ...extra,
        }),
      ),
    press: (customId: string, extra: FakeOptions = {}) =>
      handled(fakeButton({ customId, ...staff, ...extra })),
    submit: (customId: string, fields: Record<string, string>, extra: FakeOptions = {}) =>
      handled(fakeModal({ customId, fields, ...staff, ...extra })),
    /** Lets everything that is under way go out. */
    settle: async () => {
      await made.upkeep.flush();
      await made.admin.flush();
      await made.trains.flush();
      await made.attendance.flush();
      await made.service.flush();
    },
    /** How many questions and forms of `/gym` wait for their answer, over all tests. */
    pending: () => pendingGyms.size,
  };
}
```

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/commands/gyms/gym.test.ts src/commands/raids/boss.test.ts src/discord/router.test.ts src/render/gym-view.test.ts src/services/pending-requests.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Create `src/commands/gyms/add.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  type ButtonBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { GYM_TEXT_LIMITS, tidyLine, type GymTexts } from '../../domain/gyms/gym-text.js';
import { gymLabel, gymWithId, regionsSentence } from '../../render/gym-view.js';
import { gymForm, sentForm } from './form.js';
import {
  APPROXIMATE,
  assertGymTexts,
  button,
  content,
  HOW_TO_LOCATE,
  LOCATION_OPTION,
  EXPIRED,
  fetchNote,
  gymViewMessage,
  markAnswered,
  nameNote,
  nearLines,
  pendingGyms,
  placeOrRefuse,
  pointLink,
  refuseForm,
  staffPlace,
  textRefusal,
  type ButtonAnswer,
  type FormAnswer,
  type FormOpener,
  type GivenPlace,
  type PendingGym,
  type TypedTexts,
} from './shared.js';

type PendingAdd = Extract<PendingGym, { what: 'add' }>;

/** The fields of the form behind "Add with details…": everything but the name, which is given. */
export const DETAIL_FIELDS = ['nickname', 'description', 'notice', 'keywords'] as const;

/**
 * The question of `/gym add`: what was understood (the name, the place as a link, the regions
 * of this server it lies in), that the place is only the middle of a map when it is, and, when
 * other gyms lie within ten metres, which. It is kept as a pending request of the staff member;
 * the buttons carry its token. `before` is a line above the question, for one that is asked a
 * second time; `typed` is what the form for the details was sent with then, so that "Add with
 * details…" opens with it.
 */
export function addQuestion(
  ctx: AppContext,
  userId: string,
  guildId: number | undefined,
  name: string,
  place: GivenPlace,
  before?: string,
  typed?: TypedTexts,
) {
  const { point, approximate } = place;
  const near = ctx.gymAdmin.near(point);
  const regions = ctx.gymAdmin.regionsAt(point, guildId);
  const token = pendingGyms.put(userId, {
    what: 'add',
    name,
    point,
    approximate,
    nearIds: near.map(({ gym }) => gym.id),
    typed,
  });
  return {
    content: content([
      before,
      `Add **${gymLabel({ name })}** at ${pointLink(point)}?`,
      approximate ? APPROXIMATE : undefined,
      regionsSentence(regions).replace(/^It lies/, 'It would lie'),
      ...nearLines(near),
    ]),
    embeds: [],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(token, 'add', near.length === 0 ? 'Add' : 'Add anyway', ButtonStyle.Primary),
        button(token, 'details', 'Add with details…', ButtonStyle.Secondary),
        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
      ),
    ],
  };
}

/**
 * Adds the gym of a question that was answered with Add, or with the form (`details`), and
 * shows it in the place of the question. The interaction has been acknowledged: storing the
 * gym and settling its neighbours can take more than a moment.
 */
async function addAnswered(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  ctx: AppContext,
  request: PendingAdd,
  details: Partial<GymTexts> = {},
  typed?: TypedTexts,
): Promise<void> {
  const place = await staffPlace(interaction, ctx);
  // The question may be minutes old: a gym that was put there meanwhile is asked about first.
  const fresh = ctx.gymAdmin
    .near(request.point)
    .some(({ gym }) => !request.nearIds.includes(gym.id));
  if (fresh) {
    await interaction.editReply(
      addQuestion(
        ctx,
        interaction.user.id,
        place.guildId,
        request.name,
        request,
        'A gym was added at that place since I asked, so nothing was added yet.',
        // The details are not lost with the question: its form opens with them.
        typed ?? request.typed,
      ),
    );
    return;
  }
  const gym = await ctx.gymAdmin.add(
    {
      name: request.name,
      lat: request.point.lat,
      lon: request.point.lon,
      nickname: details.nickname ?? null,
      description: details.description ?? null,
      notice: details.notice ?? null,
      keywords: details.keywords ?? [],
    },
    place,
  );
  await interaction.editReply(
    await gymViewMessage(ctx, place, gym, [
      `Added ${gymWithId(gym)}.`,
      fetchNote(ctx),
      nameNote(ctx, gym),
    ]),
  );
}

/** The form behind "Add with details…", filled with what was typed when it is opened again. */
function detailsForm(token: string, request: PendingAdd) {
  return gymForm({
    token,
    action: 'form',
    title: `Add ${request.name}`,
    fields: DETAIL_FIELDS,
    texts: {},
    typed: request.typed,
  });
}

const openDetails: FormOpener = (token, request) =>
  request.what === 'add' ? detailsForm(token, request) : undefined;

/** The buttons of the question of `/gym add` that open its form, also again after a refusal. */
export const addOpeners: Readonly<Record<string, FormOpener>> = {
  'add:details': openDetails,
  'add:reopen': openDetails,
};

/** The Add button of the question. */
export const addAnswers: Readonly<Record<string, ButtonAnswer>> = {
  'add:add': async (interaction, ctx, request) => {
    if (request.what === 'add') await addAnswered(interaction, ctx, request);
  },
};

/**
 * The form behind "Add with details…" was sent. Its texts are checked first: a refusal leaves
 * the question to answer, keeps what was typed and offers the form again.
 */
export const addForms: Readonly<Record<string, FormAnswer>> = {
  'add:form': async (interaction, ctx, token, request) => {
    if (request.what !== 'add') return;
    const { typed, texts: details } = sentForm(interaction, DETAIL_FIELDS);
    const refusal = textRefusal(details);
    if (refusal !== undefined) {
      request.typed = typed;
      await refuseForm(interaction, token, refusal);
      return;
    }
    // Answered once: the Add button under the question no longer works either.
    if (pendingGyms.take(token, interaction.user.id) === 'expired') throw new UserError(EXPIRED);
    markAnswered(token);
    if (interaction.isFromMessage()) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await addAnswered(interaction, ctx, request, details, typed);
  },
};

/**
 * `/gym add`: a new gym, by its place and its name. The place is read (a short link is
 * followed), then the staff member is asked with what was understood; nothing is stored before
 * they press Add.
 */
export const addGym: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('add')
    .setDescription('Add a gym to the gym list')
    .addStringOption((option) =>
      option
        .setName('location')
        .setDescription(LOCATION_OPTION)
        .setRequired(true)
        .setMaxLength(1_000),
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('The name of the gym, as in the game')
        .setRequired(true)
        .setMaxLength(GYM_TEXT_LIMITS.name),
    ),
  help: {
    details:
      `${HOW_TO_LOCATE} A link to the place from Google Maps (also the short link its app ` +
      'shares), Apple Maps or the Ingress intel map is read as well. I show ' +
      'what I understood and ask before anything is stored; "Add with details…" opens a form ' +
      'for a nickname, a description, a notice and keywords. A gym may lie outside every ' +
      'region. Its address and the places around it are fetched from Google afterwards.',
    examples: [
      '/gym add location:https://maps.google.com/?q=40.4406,-79.9959… name:Big Fountain',
      '/gym add location:40.4406, -79.9959 name:Big Fountain',
    ],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const name = tidyLine(interaction.options.getString('name', true));
    assertGymTexts({ name });
    const place = placeOrRefuse(
      await ctx.gymAdmin.readLocation(interaction.options.getString('location', true)),
    );
    const { guildId } = await staffPlace(interaction, ctx);
    await interaction.editReply(addQuestion(ctx, interaction.user.id, guildId, name, place));
  },
};
```

Create `src/commands/gyms/controls.ts`:

```ts
import type { ComponentHandler } from '../../discord/command.js';
import type { CustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { requireBotManagement } from '../../discord/guards.js';
import { STALE_COMPONENT } from '../../discord/router.js';
import { addAnswers, addForms, addOpeners } from './add.js';
import {
  EXPIRED,
  GYM_KIND,
  markAnswered,
  NOT_YOURS,
  pendingGyms,
  wasAnswered,
  type ButtonAnswer,
  type FormAnswer,
  type FormOpener,
  type PendingGym,
} from './shared.js';

/** What a question says once it was answered with Cancel. */
const CANCELLED: Readonly<Record<PendingGym['what'], string>> = {
  add: 'Nothing was added.',
  edit: 'Nothing was changed.',
  move: 'The gym stays where it is.',
  delete: 'The gym was kept.',
};

/**
 * What the controls of `/gym` do, by what their request is about and their action
 * (`add:add`, `edit:reopen`); each subcommand brings its own. A button either answers its
 * question (`ANSWERS`: the request is taken, the question is answered once) or opens a form
 * (`OPENERS`: the request stays); a form that was sent is answered by `FORMS`.
 */
const ANSWERS: Readonly<Record<string, ButtonAnswer>> = {
  ...addAnswers,
};
const OPENERS: Readonly<Record<string, FormOpener>> = { ...addOpeners };
const FORMS: Readonly<Record<string, FormAnswer>> = { ...addForms };
/** The actions that open a form, whatever the request is about. */
const OPENING: ReadonlySet<string> = new Set(
  Object.keys(OPENERS).map((key) => key.split(':')[1] ?? ''),
);

/** The request of a control, for the member who made it; refused for anybody else. */
function requestOf(id: CustomId, userId: string, how: 'take' | 'peek'): PendingGym | undefined {
  const found = how === 'take' ? pendingGyms.take(id.id, userId) : pendingGyms.peek(id.id, userId);
  if (found === 'not-yours') throw new UserError(NOT_YOURS);
  return found === 'expired' ? undefined : found.value;
}

/**
 * The buttons and forms of `/gym` (custom-id kind `gym`): each belongs to a pending request of
 * the staff member who used the command, by the token in its custom id, and nobody else may
 * answer it. The guard of `/gym` applies here as well: a control can be pressed by whoever sees
 * it, and a custom id can be sent by anybody.
 *
 * A question is answered once. A second press on it (a double click) is only acknowledged, so
 * that it does not write over the answer of the first; a press on a question that is older than
 * the bot remembers says that it has expired.
 */
export const gymControls: ComponentHandler = {
  kind: GYM_KIND,
  guards: [requireBotManagement],

  async button(interaction, id, ctx) {
    // A button that only opens a form: the question stays, and so does its request.
    if (OPENING.has(id.action)) {
      const request = requestOf(id, interaction.user.id, 'peek');
      const form = request && OPENERS[`${request.what}:${id.action}`]?.(id.id, request);
      if (form) {
        await interaction.showModal(form);
        return;
      }
    }
    const request = requestOf(id, interaction.user.id, 'take');
    if (!request) {
      if (wasAnswered(id.id)) await interaction.deferUpdate();
      else await interaction.update({ content: EXPIRED, embeds: [], components: [] });
      return;
    }
    markAnswered(id.id);
    if (id.action === 'cancel') {
      await interaction.update({ content: CANCELLED[request.what], embeds: [], components: [] });
      return;
    }
    const answer = ANSWERS[`${request.what}:${id.action}`];
    if (!answer) throw new UserError(STALE_COMPONENT);
    // The answer takes the place of the question, also when it is a refusal: buttons that no
    // longer do anything must not stay under it.
    await interaction.deferUpdate();
    try {
      await answer(interaction, ctx, request);
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      await interaction.editReply({ content: err.message, embeds: [], components: [] });
    }
  },

  async modal(interaction, id, ctx) {
    // Looked at, not taken: a form that is refused can be opened again with what was typed.
    const request = requestOf(id, interaction.user.id, 'peek');
    if (!request) throw new UserError(EXPIRED);
    const answer = FORMS[`${request.what}:${id.action}`];
    if (!answer) throw new UserError(STALE_COMPONENT);
    await answer(interaction, ctx, id.id, request);
  },
};
```

Create `src/commands/gyms/form.ts`:

```ts
import {
  ComponentType,
  TextInputStyle,
  type APIModalInteractionResponseCallbackData,
  type APITextInputComponent,
  type ModalSubmitInteraction,
} from 'discord.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import {
  GYM_TEXT_FIELDS,
  GYM_TEXT_LIMITS,
  KEYWORDS_LINE,
  keywordsLine,
  tidyGymTexts,
  type GymTextField,
  type GymTexts,
} from '../../domain/gyms/gym-text.js';
import { truncate } from '../../render/text.js';
import { GYM_KIND, type TypedTexts } from './shared.js';

type Input = Omit<APITextInputComponent, 'type' | 'custom_id' | 'value'>;

/** The inputs of the form, by the field each is for; the custom id of an input is its field. */
const INPUTS: Readonly<Record<GymTextField, Input>> = {
  name: {
    label: 'Name, as in the game',
    style: TextInputStyle.Short,
    required: true,
    max_length: GYM_TEXT_LIMITS.name,
  },
  nickname: {
    label: 'Nickname',
    style: TextInputStyle.Short,
    required: false,
    max_length: GYM_TEXT_LIMITS.nickname,
    placeholder: 'What members call it. Leave it empty for none.',
  },
  description: {
    label: 'Description',
    style: TextInputStyle.Paragraph,
    required: false,
    max_length: GYM_TEXT_LIMITS.description,
    placeholder: 'What helps to find it. Leave it empty for none.',
  },
  notice: {
    label: 'Notice, shown in every raid post here',
    style: TextInputStyle.Paragraph,
    required: false,
    max_length: GYM_TEXT_LIMITS.notice,
    placeholder: 'Warnings, parking, opening hours. Leave it empty for none.',
  },
  keywords: {
    label: 'Keywords, separated by commas',
    style: TextInputStyle.Short,
    required: false,
    max_length: KEYWORDS_LINE,
    placeholder: 'Other words members search by. Leave it empty for none.',
  },
};

function valueOf(field: GymTextField, texts: Partial<GymTexts>): string {
  if (field === 'keywords') return keywordsLine(texts.keywords ?? []);
  return texts[field] ?? '';
}

/**
 * A text cut to what an input takes, never in the middle of a character (a cut through a
 * surrogate pair leaves half an emoji, which Discord refuses).
 */
function cut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let kept = '';
  for (const character of text) {
    if (kept.length + character.length > limit) break;
    kept += character;
  }
  return kept;
}

/**
 * A form for texts of a gym: one input per field of `fields`, in the order of the form, each
 * filled with what `texts` has for it, or with what was typed into it before (`typed`: a form
 * that is opened again after a refusal shows exactly what was sent, not a tidied version of
 * it). The custom id is `gym:<token>:<action>`. A form holds five inputs, which is exactly the
 * fields a gym has.
 */
export function gymForm(options: {
  token: string;
  action: string;
  title: string;
  fields: readonly GymTextField[];
  texts: Partial<GymTexts>;
  typed?: TypedTexts | undefined;
}): APIModalInteractionResponseCallbackData {
  const { token, action, fields, texts, typed } = options;
  return {
    custom_id: encodeCustomId({ kind: GYM_KIND, id: token, action }),
    title: truncate(options.title, 45),
    components: GYM_TEXT_FIELDS.filter((field) => fields.includes(field)).map((field) => {
      // Never longer than the input takes (Discord refuses the whole form otherwise): what
      // was typed into the input fits it, and what a caller fills in is within it; this is
      // the guard.
      const value = cut(typed?.[field] ?? valueOf(field, texts), INPUTS[field].max_length ?? 4_000);
      return {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.TextInput,
            custom_id: field,
            ...INPUTS[field],
            ...(value === '' ? {} : { value }),
          },
        ],
      };
    }),
  };
}

/**
 * What a staff member sent with a form that has these fields: as it was typed (`typed`, for
 * the form when it is opened again) and tidied (`texts`, `tidyGymTexts`: what is checked and
 * stored).
 */
export function sentForm(
  interaction: ModalSubmitInteraction,
  fields: readonly GymTextField[],
): { typed: TypedTexts; texts: Partial<GymTexts> } {
  const typed: TypedTexts = {};
  for (const field of fields) typed[field] = interaction.fields.getTextInputValue(field);
  return { typed, texts: tidyGymTexts(typed) };
}
```

Create `src/commands/gyms/gym-option.ts`:

```ts
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { UserError } from '../../discord/errors.js';
import { regionChannelOf } from '../../discord/guards.js';
import { tidyLine } from '../../domain/gyms/gym-text.js';
import type { GymHit } from '../../domain/search/gym-lookup.js';
import { searchTokens } from '../../domain/search/text.js';
import { gymWithId } from '../../render/gym-view.js';
import { plain, truncate } from '../../render/text.js';
import { byName, CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
import { clearGymHit } from '../raids/raid-input.js';

/** The name of the option by which a subcommand of `/gym` takes an existing gym. */
export const GYM_OPTION = 'gym';

/** A gym by its number, written so that it cannot be anything else: `id:123` (a choice), `#123`. */
const EXPLICIT_NUMBER = /^(?:id:|#)(\d{1,10})$/i;
/** Digits alone: the number of a gym, or a name that is a number ("1776"). */
const BARE_NUMBER = /^(\d{1,10})$/;
/** How many gyms a refusal of typed text suggests. */
const SUGGESTIONS = 5;

/**
 * The gyms a text names, for staff, who may touch every gym wherever it lies (Matt,
 * 2026-10-13): what the search finds from the region of the channel (its own gyms, then those
 * just outside it), then what it finds among all gyms, as many of each as a list of choices
 * holds. Gyms that have only some of the words (guesses) are given only when no gym anywhere
 * has every word.
 */
function staffGymHits(
  ctx: AppContext,
  regionChannelId: string | undefined,
  text: string,
): GymHit<Gym>[] {
  const limit = MAX_CHOICES;
  const near =
    regionChannelId === undefined ? [] : ctx.gyms.search(regionChannelId, text, { limit });
  const seen = new Set(near.map((hit) => hit.gym.id));
  // As many again from everywhere: those already found from the region do not count.
  const anywhere = ctx.gyms.search(null, text, { limit: limit + near.length });
  const all = [...near, ...anywhere.filter((hit) => !seen.has(hit.gym.id))];
  const whole = all.filter((hit) => hit.allWords);
  return (whole.length > 0 ? whole : all).slice(0, limit);
}

/** Adds the `gym` option to a subcommand: free text, with the list of gyms while typing. */
export function withGymOption(
  builder: SlashCommandSubcommandBuilder,
  description = 'The gym: type part of its name and pick it, or give its number (#123)',
): SlashCommandSubcommandBuilder {
  return builder.addStringOption((option) =>
    option
      .setName(GYM_OPTION)
      .setDescription(description)
      .setRequired(true)
      .setMaxLength(100)
      .setAutocomplete(true),
  );
}

/**
 * A gym as a choice of the list: its name, its nickname and its number, which is what tells two
 * gyms of one name apart and therefore always stays: the texts before it are cut to fit. A
 * choice is shown as it is, so control characters and invisible formatting characters of a
 * legacy name are taken out (a direction override would turn the number around).
 */
export function gymChoice(gym: Pick<Gym, 'id' | 'name' | 'nickname'>): Choice {
  const number = ` · #${gym.id}`;
  const nickname = gym.nickname ? tidyLine(gym.nickname) : '';
  // A legacy name of nothing but invisible characters shows as nothing: say what it is.
  const name = tidyLine(gym.name) || 'Gym';
  const texts = [name, ...(nickname === '' ? [] : [nickname])].join(' · ');
  return {
    name: `${truncate(texts, CHOICE_NAME - number.length)}${number}`,
    value: `id:${gym.id}`,
  };
}

/**
 * The choices for the `gym` option: every gym that fits what was typed (`staffGymHits`: the
 * gyms of the region the command is used in first). A number finds the gym with that number
 * first. While nothing is typed: the gyms of the region, by name.
 */
export function gymChoices(interaction: AutocompleteInteraction, ctx: AppContext): Choice[] {
  const typed = interaction.options.getFocused().trim();
  const region = regionChannelOf(interaction, ctx);
  if (typed === '') {
    if (region === undefined) return [];
    return ctx.gyms
      .inRegion(region)
      .sort((a, b) => byName(a.name, b.name) || a.id - b.id)
      .slice(0, MAX_CHOICES)
      .map(gymChoice);
  }
  const numbered = EXPLICIT_NUMBER.exec(typed) ?? BARE_NUMBER.exec(typed);
  const byNumber = numbered ? ctx.gyms.get(Number(numbered[1])) : undefined;
  const found = staffGymHits(ctx, region, typed).map((hit) => hit.gym);
  const gyms = byNumber ? [byNumber, ...found.filter((gym) => gym.id !== byNumber.id)] : found;
  return gyms.slice(0, MAX_CHOICES).map(gymChoice);
}

/** Answers the list of gyms for the `gym` option of a subcommand of `/gym`. */
export async function respondWithGyms(
  interaction: AutocompleteInteraction,
  ctx: AppContext,
): Promise<void> {
  await interaction.respond(gymChoices(interaction, ctx));
}

/** Whether a word is one of the words staff gave a gym: of its name, nickname or keywords. */
function calledBy(gym: Gym, word: string): boolean {
  return [gym.name, gym.nickname ?? '', ...gym.keywords].some((text) =>
    searchTokens(text).includes(word),
  );
}

const listed = (gyms: readonly Gym[]): string =>
  gyms
    .slice(0, SUGGESTIONS)
    .map((gym) => `- ${gymWithId(gym)}`)
    .join('\n');

/**
 * The gym the `gym` option names: a choice of the list or a number with its sign (`id:123`,
 * `#123`), which is always that gym; or text. Text is acted on only when it clearly means one
 * gym (the rule of `/raid`: exactly one gym has every word as typed); otherwise it is refused,
 * with the gyms it might mean.
 *
 * Digits alone are the number of a gym, unless they are also in the name of another gym (a gym
 * called "1776"): then neither is acted on, and both are named. Digits that are no gym's number
 * are text like any other. Throws a `UserError` for anything that names no one gym.
 */
export function chosenGym(interaction: ChatInputCommandInteraction, ctx: AppContext): Gym {
  const typed = interaction.options.getString(GYM_OPTION, true).trim();
  const quoted = `"${plain(truncate(typed, 80))}"`;
  const explicit = EXPLICIT_NUMBER.exec(typed);
  if (explicit) {
    const gym = ctx.gyms.get(Number(explicit[1]));
    if (!gym) throw new UserError(`There is no gym #${explicit[1] ?? ''}.`);
    return gym;
  }
  const found = staffGymHits(ctx, regionChannelOf(interaction, ctx), typed);
  const digits = BARE_NUMBER.test(typed);
  // The search also finds a gym by its own number, and by the beginning of it. For digits a
  // gym that was found by its number alone is not one that is called so: `12` is gym 12, never
  // gym 120. One that has the digits as a word of its own ("12 Apostles", gym 120) stays.
  const hits = digits
    ? found.filter((hit) => calledBy(hit.gym, typed) || !String(hit.gym.id).startsWith(typed))
    : found;
  const numbered = digits ? ctx.gyms.get(Number(typed)) : undefined;
  if (numbered) {
    // Another gym that is called so: the digits are a word of its name, its nickname or its
    // keywords (an address with that house number does not make a gym be called so).
    const named = hits.map((hit) => hit.gym).filter((gym) => calledBy(gym, typed));
    if (named.length === 0) return numbered;
    throw new UserError(
      `${quoted} is the number of one gym and in the name of another. Pick the one you mean ` +
        `from the list, or write the number as \`#${typed}\`:\n${listed([numbered, ...named])}`,
    );
  }
  const clear = clearGymHit(hits);
  if (clear) return clear;
  if (hits.length === 0) {
    throw new UserError(
      `I found no gym for ${quoted}. Type part of its name and pick it from the list, or give ` +
        'its number (`#123`).',
    );
  }
  throw new UserError(
    `${quoted} does not name one gym for certain. Pick it from the list, or give its number:\n` +
      listed(hits.map((hit) => hit.gym)),
  );
}
```

Create `src/commands/gyms/index.ts`:

```ts
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { requireBotManagement } from '../../discord/guards.js';
import { addGym } from './add.js';
import { showGym } from './show.js';

/** The subcommands of `/gym`, each in a file of its own in this folder. */
const parts: readonly SubcommandPart[] = [showGym, addGym];

/**
 * `/gym`: the gym list, for staff. Discord offers it only to members who may manage the server
 * (or to whom a server admin grants it), and the bot's own check applies on top: admins,
 * moderators and bot developers. It is tied to no channel, and every answer is for the staff
 * member alone. Staff may touch every gym, wherever it lies.
 */
export const gym = commandGroup({
  data: new SlashCommandBuilder()
    .setName('gym')
    .setDescription('Look after the gym list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  guards: [requireBotManagement],
  parts,
});
```

Create `src/commands/gyms/shared.ts`:

```ts
import { basename } from 'node:path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type APIEmbed,
  type APIModalInteractionResponseCallbackData,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import { BoundedMap } from '../../bounded-map.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { storedTextLength } from '../../db/repositories/gym-repository.js';
import type { LocatedInteraction } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { guildIdOf } from '../../discord/guards.js';
import { metresBetween } from '../../domain/geo/distance.js';
import type { LatLon } from '../../domain/geo/lat-lon.js';
import { LOCATION_FORMS } from '../../domain/geo/location-input.js';
import {
  gymTextProblems,
  type GymTextField,
  type GymTextProblem,
  type GymTexts,
} from '../../domain/gyms/gym-text.js';
import { searchedWords } from '../../domain/search/gym-index.js';
import { distanceText, gymWithId, renderGymView } from '../../render/gym-view.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { count, LIMITS, plain, truncate } from '../../render/text.js';
import type { LocationOutcome, StaffPlace } from '../../services/gym-admin-service.js';
import { PendingRequests } from '../../services/pending-requests.js';

/** The custom-id kind of the controls of `/gym` (documented in `custom-id.ts`). */
export const GYM_KIND = 'gym';

/** A place a staff member gave, and whether it was only read from where a map was centred. */
export interface GivenPlace {
  point: LatLon;
  approximate: boolean;
}

/** What a staff member typed into the inputs of a form, as it was typed, by field. */
export type TypedTexts = Partial<Record<GymTextField, string>>;

/** What a question or a form of `/gym` waits with until the staff member answers. */
export type PendingGym =
  /**
   * `/gym add`: the name and the place, read and checked, and the gyms within ten metres that
   * the question named (a gym that appears there afterwards is asked about again). `typed` is
   * what the form behind "Add with details…" was last sent with, as it was typed, when that
   * was refused or the question had to be asked anew.
   */
  | {
      what: 'add';
      name: string;
      point: LatLon;
      approximate: boolean;
      nearIds: readonly number[];
      typed?: TypedTexts | undefined;
    }
  /**
   * `/gym edit`: the gym, the texts the form was filled with first (what is written is what
   * differs from them, however often the form is opened again), the fields it could not show
   * (`gymFormTexts`), and what it was last sent with, when that was refused.
   */
  | {
      what: 'edit';
      gymId: number;
      shown: Partial<GymTexts>;
      tooLong: readonly GymTextField[];
      typed?: TypedTexts | undefined;
    }
  /**
   * `/gym move`: the gym, where it was when the question was asked (`from`) and where it goes,
   * whether that place was only read from the middle of a map, and the gyms within ten metres
   * of it that the question named.
   */
  | {
      what: 'move';
      gymId: number;
      from: LatLon;
      point: LatLon;
      approximate: boolean;
      nearIds: readonly number[];
    }
  /** `/gym delete`: the gym. */
  | { what: 'delete'; gymId: number };

/**
 * How long a question or a form of `/gym` can be answered. Long: a form that is open while its
 * request is forgotten loses what was typed into it, and staff look things up while they type.
 * The requests are few and small, and their number is bounded.
 */
export const PENDING_HOURS = 6;

/** The questions and forms of `/gym` that wait for their answer, by the token of their controls. */
export const pendingGyms = new PendingRequests<PendingGym>({
  ttlMs: PENDING_HOURS * 3_600_000,
  max: 1_000,
});

/**
 * The tokens of the questions that were answered a while ago. A second press on a button of
 * such a question (a double click, a slow connection) is only acknowledged: it must not write
 * "That has expired" over the answer the first press is showing.
 */
const answered = new BoundedMap<string, true>(1_000);

export function markAnswered(token: string): void {
  answered.set(token, true);
}

export function wasAnswered(token: string): boolean {
  return answered.has(token);
}

/** What a staff member is told whose question or form is no longer known (also after a restart). */
export const EXPIRED = 'That has expired. Use the command again.';
export const NOT_YOURS = 'That is somebody else’s question.';
export const GYM_GONE = 'That gym no longer exists.';

/** What runs for a button of a question, by what the question is about and the button. */
export type ButtonAnswer = (
  interaction: ButtonInteraction,
  ctx: AppContext,
  request: PendingGym,
) => Promise<void>;

/** The form a button of a question opens, filled from its request; undefined when it has none. */
export type FormOpener = (
  token: string,
  request: PendingGym,
) => APIModalInteractionResponseCallbackData | undefined;

/** What runs for a form that was sent, by what it is about and its action. */
export type FormAnswer = (
  interaction: ModalSubmitInteraction,
  ctx: AppContext,
  token: string,
  request: PendingGym,
) => Promise<void>;

/** A button of a question of `/gym`: `gym:<token>:<action>`. */
export function button(
  token: string,
  action: string,
  label: string,
  style: ButtonStyle,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(encodeCustomId({ kind: GYM_KIND, id: token, action }))
    .setLabel(label)
    .setStyle(style);
}

/**
 * Where the staff member is (`StaffPlace`): who they are, the row of their server, whose
 * regions an answer names, and the channels by which its channel for bot updates is found: the
 * one the command was used in, then those of the server's regions (a post that is not in the
 * cache is no help).
 */
export async function staffPlace(
  interaction: LocatedInteraction,
  ctx: AppContext,
): Promise<StaffPlace> {
  const guildId = await ctx.guilds.idFor(guildIdOf(interaction));
  const regions = ctx.regions
    .all()
    .filter((region) => guildId !== undefined && region.guildId === guildId)
    .map((region) => region.channelId);
  return {
    staffId: interaction.user.id,
    guildId,
    channelIds: [...(interaction.channelId === null ? [] : [interaction.channelId]), ...regions],
  };
}

/** The place a staff member typed, or the refusal that says what is read. */
export function placeOrRefuse(outcome: LocationOutcome): GivenPlace {
  switch (outcome.kind) {
    case 'point':
      return { point: outcome.point, approximate: outcome.approximate };
    case 'link-failed':
      throw new UserError('I could not follow that link. Paste the coordinates instead.');
    case 'link-nowhere':
      throw new UserError(
        'That link does not say where the place is. Open it, long-press the pin, and paste ' +
          'the coordinates Google shows.',
      );
    case 'out-of-range':
      throw new UserError(
        'Those numbers are no place: a latitude lies between -90 and 90, a longitude between ' +
          `-180 and 180, latitude first. ${LOCATION_FORMS}`,
      );
    case 'unreadable':
      throw new UserError(`I could not read a place from that. ${LOCATION_FORMS}`);
  }
}

/**
 * How staff get the location of a gym (Matt, 2026-10-13): the game itself hands out a link to
 * the exact place. Said in the help of `/gym add` and `/gym move`.
 */
export const HOW_TO_LOCATE =
  'In Pokémon GO open the gym, choose View in map, share the link and paste it here. ' +
  'Coordinates (`40.4406, -79.9959`) work too.';
/** The same in the hundred characters the description of an option has. */
export const LOCATION_OPTION =
  'The link Pokémon GO shares (gym, View in map, share), or coordinates like 40.4406, -79.9959';

/** What a question says of a place that was read from the middle of a map. */
export const APPROXIMATE =
  'I read this from where the map was centred, not from a pin: check the link before you go on.';

/** A place as an answer shows it: the coordinates as a link to Google Maps. */
export function pointLink(point: LatLon): string {
  return `[${point.lat}, ${point.lon}](<${gymMapsUrl(point)}>)`;
}

/** How many of the gyms near a place a question names; the rest are counted. */
const NEAR_SHOWN = 3;

/** The gyms within ten metres of a place, as lines of a question; empty when there are none. */
export function nearLines(
  near: readonly { gym: Pick<Gym, 'id' | 'name' | 'nickname'>; metres: number }[],
): string[] {
  if (near.length === 0) return [];
  const listed = near
    .slice(0, NEAR_SHOWN)
    .map(({ gym, metres }) => `- ${gymWithId(gym)}, ${distanceText(metres)} away`);
  return [
    near.length === 1
      ? 'Another gym lies within 10 metres of that place:'
      : `${count(near.length, 'other gym')} lie within 10 metres of that place:`,
    ...listed,
    ...(near.length > NEAR_SHOWN ? [`- …and ${near.length - NEAR_SHOWN} more`] : []),
  ];
}

/** Lines as the text of one message: never longer than Discord takes. */
export function content(lines: readonly (string | undefined)[]): string {
  return truncate(
    lines.filter((line): line is string => line !== undefined).join('\n'),
    LIMITS.content,
  );
}

const FIELD_WORDS: Readonly<Record<GymTextField, string>> = {
  name: 'name',
  nickname: 'nickname',
  description: 'description',
  notice: 'notice',
  keywords: 'keywords',
};

const characters = (n: number): string => count(n, 'character');

/** Why a text cannot be a gym's, as a sentence that says how much too long it is. */
export function textProblemText(problem: GymTextProblem): string {
  const field = FIELD_WORDS[problem.field];
  switch (problem.kind) {
    case 'blank':
      return 'A gym needs a name.';
    case 'too-long':
      return `The ${field} is ${characters(problem.by)} too long: it may have ${problem.limit}.`;
    case 'too-long-stored':
      return (
        `The ${field} is too long as I store it, by ${characters(problem.by)}: apostrophes, ` +
        'accents and letters of other alphabets take several characters each. Shorten it.'
      );
    case 'keyword-too-long':
      return (
        `The keyword "${plain(truncate(problem.keyword, 30))}" is ${characters(problem.by)} ` +
        `too long: a keyword may have ${problem.limit}.`
      );
    case 'too-many-keywords':
      return `That is ${count(problem.by, 'keyword')} too many: a gym may have ${problem.limit}.`;
  }
}

/** Why these texts (already tidied) cannot be a gym's, every reason on a line; undefined when they can. */
export function textRefusal(texts: Partial<GymTexts>): string | undefined {
  const problems = gymTextProblems(texts, storedTextLength);
  return problems.length === 0 ? undefined : problems.map(textProblemText).join('\n');
}

/** Refuses texts that cannot be a gym's (already tidied), with every reason in one answer. */
export function assertGymTexts(texts: Partial<GymTexts>): void {
  const refusal = textRefusal(texts);
  if (refusal !== undefined) throw new UserError(refusal);
}

/**
 * Answers a form whose texts cannot be stored: the reasons, a button that opens the form again
 * with what was typed (which the caller has kept in the request), so that a keyword that is too
 * long does not cost a paragraph typed beside it, and one to give up. A form that a button of
 * a message opened is answered in the place of that message, so that no control stays behind
 * that leads nowhere (the question of `/gym add`, an earlier refusal); a form a command opened
 * gets a message of its own.
 */
export async function refuseForm(
  interaction: ModalSubmitInteraction,
  token: string,
  refusal: string,
): Promise<void> {
  const answer = {
    content: content([refusal, 'Nothing was saved. What you typed is kept:']),
    embeds: [],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(token, 'reopen', 'Open the form again', ButtonStyle.Primary),
        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
      ),
    ],
  };
  if (interaction.isFromMessage()) await interaction.update(answer);
  else await interaction.reply({ ...answer, flags: MessageFlags.Ephemeral });
}

/**
 * What staff are told of a gym whose whole name consists of words the search ignores ("The
 * Gym"): a note, not a refusal. Undefined for any other name.
 */
export function nameNote(ctx: AppContext, gym: Pick<Gym, 'id' | 'name'>): string | undefined {
  if (searchedWords(gym.name, ctx.config.settings.blacklistWords).length > 0) return undefined;
  return (
    'Its name consists only of words the search ignores, so members will not find it by name: ' +
    `only by its number (#${gym.id}), or by a nickname or keywords you give it.`
  );
}

/** What an answer says of the address and places of a gym that was just added or moved. */
export function fetchNote(ctx: AppContext): string {
  return ctx.gymAdmin.fetches
    ? 'Its address and the places around it are being fetched from Google; `/gym show` has ' +
        'them in a moment.'
    : 'No Google API key is configured, so it has no address and no nearby places.';
}

/** A message with the full view of a gym, as the answer to a command or under a question. */
export interface GymViewMessage {
  content: string;
  embeds: APIEmbed[];
  files: string[];
  components: [];
}

/**
 * The full view of a gym under these lines: what `/gym show` answers, and every change of a
 * gym. The map picture is attached when there is one; the number of members who target the gym
 * is "Unknown" when it cannot be read. Neither stands in the way of the answer.
 */
export async function gymViewMessage(
  ctx: AppContext,
  place: StaffPlace,
  gym: Gym,
  lines: readonly (string | undefined)[],
): Promise<GymViewMessage> {
  const [targets, map] = await Promise.all([
    ctx.gymAdmin.targetCount(gym.id).catch((err: unknown) => {
      ctx.log.warn({ err, gym: gym.id }, 'could not count the gym targets of a gym');
      return undefined;
    }),
    ctx.maps.gym(gym).catch((err: unknown) => {
      ctx.log.warn({ err, gym: gym.id }, 'could not get the map of a gym');
      return undefined;
    }),
  ]);
  const nearestGym = gym.nearestGym === null ? undefined : ctx.gyms.get(gym.nearestGym);
  const embed = renderGymView({
    gym,
    regions: ctx.gymAdmin.regionsOf(gym.id, place.guildId),
    nearest: nearestGym && { gym: nearestGym, metres: metresBetween(gym, nearestGym) },
    targets,
    image: map === undefined ? undefined : `attachment://${basename(map)}`,
  });
  return {
    content: content(lines),
    embeds: [embed],
    files: map === undefined ? [] : [map],
    components: [],
  };
}
```

Create `src/commands/gyms/show.ts`:

```ts
import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { gymViewMessage, staffPlace } from './shared.js';

/**
 * `/gym show`: everything Pine knows of a gym (the spec's `find` and `detail` in one). The
 * same view is the answer of every change of a gym.
 */
export const showGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('show')
      .setDescription('Show everything I know of a gym'),
  ),
  help: {
    details:
      'Name, nickname and number, a link to the place, description, notice, whether it is an ' +
      'elite raid gym, keywords, the regions of this server it lies in, the nearest gym, how ' +
      'many members have it as a gym target, and the address and nearby places Google gave, ' +
      'by which it is also found. Pick the gym from the list, or give its number.',
    examples: ['/gym show gym:Big Fountain', '/gym show gym:#123'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const gym = chosenGym(interaction, ctx);
    const place = await staffPlace(interaction, ctx);
    await interaction.editReply(await gymViewMessage(ctx, place, gym, []));
  },
  autocomplete: respondWithGyms,
};
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,6 +1,7 @@
 import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
 import { friendCode, nickname } from './friends/friends.js';
+import { gym } from './gyms/index.js';
 import { info } from './meetups/info.js';
 import { meetup } from './meetups/meetup.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
@@ -75,4 +76,5 @@ export const commands: readonly CommandModule[] = [
   friendCode,
   nickname,
   admin,
+  gym,
 ];
```

Apply to `src/commands/raids/raid-input.ts`:

```diff
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -530,6 +530,17 @@ export function gymChoices(
   });
 }
 
+/**
+ * The gym that typed text clearly means, among what a search found: the only gym that has every
+ * word as typed. Undefined when there is none or more than one: text is never acted on by a
+ * guess. This is the one rule for acting on a typed gym, for `/raid` and for `/gym` alike.
+ */
+export function clearGymHit(hits: readonly GymHit<Gym>[]): Gym | undefined {
+  const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
+  const [only] = clear;
+  return only && clear.length === 1 ? only.gym : undefined;
+}
+
 export type GymAnswer =
   /** One gym, clearly. */
   | { kind: 'gym'; gym: Gym }
@@ -556,9 +567,8 @@ export function reportedGym(
   }
   const hits = gymHits(ctx, regionChannelId, text, 5, accepts);
   if (hits.length === 0) return { kind: 'none' };
-  const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
-  const [only] = clear;
-  if (only && clear.length === 1) return { kind: 'gym', gym: only.gym };
+  const clear = clearGymHit(hits);
+  if (clear) return { kind: 'gym', gym: clear };
   return { kind: 'several', gyms: hits.map((hit) => hit.gym) };
 }
 
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,3 +1,4 @@
+import { gymControls } from '../commands/gyms/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
 import { targetControls, targetRemovalControls } from '../commands/notifications/targets.js';
 import { wantControls } from '../commands/notifications/wants.js';
@@ -19,4 +20,5 @@ export const components: readonly ComponentHandler[] = [
   partyButtons,
   dmControls,
   roleControls,
+  gymControls,
 ];
```

Apply to `src/discord/custom-id.ts`:

```diff
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -16,6 +16,15 @@
  * menus, `page` the page the message shows, so that it is shown again after the change. The
  * buttons that turn the pages are `roles:page:prev:<page>` and `roles:page:next:<page>`, with
  * the page the message shows. Nothing else about such a message is kept anywhere.
+ *
+ * The controls of `/gym` have the kind `gym` (`src/commands/gyms/controls.ts`), and their id is
+ * the token of a pending request (`PendingRequests`), which holds what the staff member asked
+ * for; only they may answer it. Under the question of `/gym add`: `gym:<token>:add`,
+ * `gym:<token>:details` (opens the form) and `gym:<token>:cancel`; the form itself is
+ * `gym:<token>:form`. The form of `/gym edit` is `gym:<token>:edit`. Under the refusal of
+ * either form: `gym:<token>:reopen`, which opens the form again with what was typed. Under the question of
+ * `/gym move`: `gym:<token>:move` and `gym:<token>:cancel`; under that of `/gym delete`:
+ * `gym:<token>:delete` and `gym:<token>:cancel`.
  */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
```

Apply to `src/discord/router.ts`:

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -16,6 +16,7 @@ import {
   type ComponentHandler,
   type Guard,
   type GuardableInteraction,
+  type LocatedInteraction,
 } from './command.js';
 import { decodeCustomId, type CustomId } from './custom-id.js';
 import { UserError } from './errors.js';
@@ -60,6 +61,8 @@ export class InteractionRouter {
   private readonly commands = new Map<string, CommandModule>();
   private readonly components = new Map<string, ComponentHandler>();
   private readonly throttles = new Throttles();
+  /** The commands Discord shows to staff only (`default_member_permissions`), by name. */
+  private readonly staffOnly = new Set<string>();
   private readonly now: () => number;
 
   constructor(
@@ -74,6 +77,8 @@ export class InteractionRouter {
         throw new Error(`Duplicate command /${command.data.name}`);
       assertHandlersMatch(command);
       this.commands.set(command.data.name, command);
+      const permissions = command.data.toJSON().default_member_permissions;
+      if (permissions !== undefined && permissions !== null) this.staffOnly.add(command.data.name);
     }
     for (const handler of components) {
       if (this.components.has(handler.kind))
@@ -132,8 +137,26 @@ export class InteractionRouter {
     });
   }
 
+  /**
+   * Answers the list of an option while it is typed. For a command that is for staff
+   * (`default_member_permissions`) the guards of the command run first, and whoever they refuse
+   * gets an empty list, never an error: Discord hides such a command, but a server can grant it
+   * to anybody, and its lists must tell them no more than the command would. The guards of a
+   * subcommand and those of ordinary commands do not run here: some read options that are not
+   * there yet while the member types.
+   */
   private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
     try {
+      const command = this.commands.get(interaction.commandName);
+      if (command && this.staffOnly.has(command.data.name)) {
+        try {
+          await runGuards(command.guards ?? [], interaction, this.ctx);
+        } catch (err) {
+          if (!(err instanceof UserError)) throw err;
+          await interaction.respond([]);
+          return;
+        }
+      }
       const handler = this.find(interaction)?.handler;
       if (handler?.autocomplete) await handler.autocomplete(interaction, this.ctx);
       else await interaction.respond([]);
@@ -242,7 +265,7 @@ function runnerFor(
 
 async function runGuards(
   guards: readonly Guard[],
-  interaction: GuardableInteraction,
+  interaction: LocatedInteraction,
   ctx: AppContext,
 ): Promise<void> {
   for (const guard of guards) await guard(interaction, ctx);
```

Apply to `src/render/gym-view.ts`:

```diff
--- a/src/render/gym-view.ts
+++ b/src/render/gym-view.ts
@@ -1,6 +1,9 @@
+import type { APIEmbed, APIEmbedField } from 'discord.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
-import { gymMapsUrl } from './raid-post.js';
-import { LIMITS, plain, truncate } from './text.js';
+import { geodataParts } from '../domain/geo/google.js';
+import { tidyLine } from '../domain/gyms/gym-text.js';
+import { gymMapsUrl, isEliteGym } from './raid-post.js';
+import { count, fitItems, LIMITS, plain, plainLines, truncate } from './text.js';
 
 /** What the sentences about a gym need of it (`Gym` of the repository has all of it). */
 export interface NamedGym {
@@ -14,22 +17,55 @@ export interface NamedGym {
 /** The colour of what is said about the gym list. */
 export const GYM_COLOUR = 0x3498db;
 
-/** A gym's name as a sentence shows it: plain, without its nickname. */
-export function gymLabel(gym: { name: string }): string {
-  return plain(gym.name);
+/**
+ * How much of a name and of a nickname a sentence shows (`gymWithId`): a row of the legacy bot
+ * may hold 255 characters of either, and a question names several gyms in one message.
+ */
+const NAMED = { name: 80, nickname: 40 } as const;
+/** How much room the channels of the regions get in a sentence (`regionsSentence`). */
+const REGIONS_SHOWN = 300;
+
+/**
+ * A text of a gym as a line shows it: without control characters and without invisible
+ * formatting characters (a legacy name may hold a direction override, which would turn the
+ * number beside it around), cut to `limit` before it is escaped, so that no escape is cut in
+ * two and what closes the bold stays.
+ */
+function shown(text: string, limit?: number): string {
+  const tidy = tidyLine(text);
+  return plain(limit === undefined ? tidy : truncate(tidy, limit));
 }
 
-/** A gym as staff tell it from its namesakes: `**Name** (Nickname, #12)`. */
+/**
+ * A gym's name as a sentence shows it: plain, without its nickname. A legacy name of nothing
+ * but characters that are not shown would be an empty text (`****`, an embed without a title):
+ * such a gym is named by its number.
+ */
+export function gymLabel(gym: { name: string; id?: number }, limit?: number): string {
+  const name = shown(gym.name, limit);
+  if (name !== '') return name;
+  return gym.id === undefined ? 'Gym' : `Gym #${gym.id}`;
+}
+
+/**
+ * A gym as staff tell it from its namesakes: `**Name** (Nickname, #12)`. Name and nickname are
+ * cut (`NAMED`); the number, which is what tells two gyms apart, always stays.
+ */
 export function gymWithId(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
   // `||`: a nickname that was cleared to an empty text names nothing.
-  const nickname = gym.nickname ? `${plain(gym.nickname)}, ` : '';
-  return `**${gymLabel(gym)}** (${nickname}#${gym.id})`;
+  const nick = gym.nickname ? shown(gym.nickname, NAMED.nickname) : '';
+  return `**${gymLabel({ name: gym.name }, NAMED.name)}** (${nick === '' ? '' : `${nick}, `}#${gym.id})`;
 }
 
-/** The regions a gym lies in, as a sentence about one server: its channels, or that there is none. */
+/**
+ * The regions a gym lies in, as a sentence about one server: its channels, or that there is
+ * none. A server with more regions than fit is told how many more there are.
+ */
 export function regionsSentence(regions: readonly { channelId: string }[]): string {
   if (regions.length === 0) return 'It lies in no region of this server.';
   const channels = regions.map((region) => `<#${region.channelId}>`);
+  const all = channels.join(', ');
+  if (all.length > REGIONS_SHOWN) return `It lies in ${fitItems(channels, REGIONS_SHOWN)}.`;
   const last = channels.pop() ?? '';
   return `It lies in ${channels.length === 0 ? last : `${channels.join(', ')} and ${last}`}.`;
 }
@@ -43,7 +79,7 @@ export function gymAnnouncement(
   regions: readonly { channelId: string }[],
 ): OutgoingMessage {
   const lines = [
-    ...(gym.nickname ? [`Also known as **${plain(gym.nickname)}**.`] : []),
+    ...(gym.nickname ? [`Also known as **${shown(gym.nickname, NAMED.name)}**.`] : []),
     regionsSentence(regions),
   ];
   return {
@@ -64,3 +100,115 @@ export function gymAnnouncement(
 export function gymRemovedLine(gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>): string {
   return `${gymWithId(gym)} was removed from the gym list.`;
 }
+
+/** A distance as staff read it: metres up to a kilometre, kilometres with one decimal beyond. */
+export function distanceText(metres: number): string {
+  return metres < 1_000 ? `${Math.round(metres)} m` : `${(metres / 1_000).toFixed(1)} km`;
+}
+
+/** What the full view shows of a gym (`Gym` of the repository has all of it). */
+export interface ViewedGym extends NamedGym {
+  description: string | null;
+  notice: string | null;
+  keywords: readonly string[];
+  taggedEx: boolean;
+  confirmedEx: boolean;
+  geodata: string | null;
+  places: string | null;
+}
+
+export interface GymView {
+  gym: ViewedGym;
+  /** The regions of the server the view is shown in that the gym lies in. */
+  regions: readonly { channelId: string }[];
+  /** The gym nearest to it, with the distance; undefined when there is none. */
+  nearest?: { gym: Pick<NamedGym, 'id' | 'name' | 'nickname'>; metres: number } | undefined;
+  /** How many members have it as a gym target; undefined when that could not be read. */
+  targets?: number | undefined;
+  /** The address of the map picture (an attachment of the message); undefined without one. */
+  image?: string | undefined;
+}
+
+/**
+ * How much of each text the view shows at most. Discord counts 6,000 characters for an embed:
+ * a title of 256, these, a notice of a whole field (1,024), the nearest gym (at most 270), the
+ * short fields, the names of the fields and the footer come to about 5,700.
+ */
+const SHOWN = {
+  description: 1_200,
+  regions: 500,
+  keywords: 600,
+  address: 900,
+  places: 700,
+} as const;
+
+/**
+ * Everything Pine knows of a gym, as staff need it (`/gym show`, and the answer of every
+ * change): name and nickname as a link to the place, the description, the notice, whether it
+ * is an elite raid gym, the keywords, the regions, the nearest gym, how many members target
+ * it, and what Google gave: the address parts and the nearby places. Every text is plain and
+ * cut to what its place holds (`SHOWN`), so the embed is within Discord's limits whatever the
+ * gym's texts.
+ */
+export function renderGymView(view: GymView): APIEmbed {
+  const { gym } = view;
+  const nickname = gym.nickname ? shown(gym.nickname) : '';
+  const title = nickname === '' ? gymLabel(gym) : `${gymLabel(gym)} (${nickname})`;
+  const fields: APIEmbedField[] = [];
+  const field = (
+    name: string,
+    value: string,
+    inline = false,
+    limit: number = LIMITS.fieldValue,
+  ): void => {
+    // Discord refuses a field without a value.
+    if (value !== '') fields.push({ name, value: truncate(value, limit), inline });
+  };
+  field('Notice', gym.notice ? plainLines(gym.notice) : '');
+  field('Elite raid gym', isEliteGym(gym) ? 'Yes' : 'No', true);
+  field(
+    'Regions',
+    view.regions.length === 0
+      ? 'None of this server'
+      : fitItems(
+          view.regions.map((region) => `<#${region.channelId}>`),
+          SHOWN.regions,
+        ),
+    true,
+  );
+  field(
+    'Gym targets',
+    view.targets === undefined ? 'Unknown' : count(view.targets, 'member'),
+    true,
+  );
+  field(
+    'Nearest gym',
+    // Cut inside `gymWithId`, before escaping: never here, where a cut could lose the `**`.
+    view.nearest
+      ? `${gymWithId(view.nearest.gym)}, ${distanceText(view.nearest.metres)} away`
+      : 'None',
+  );
+  field(
+    'Keywords',
+    gym.keywords.length === 0 ? 'None' : fitItems(gym.keywords.map(plain), SHOWN.keywords),
+  );
+  field(
+    'Address (from Google)',
+    fitItems(
+      geodataParts(gym.geodata).map(({ type, value }) => `**${plain(type)}**: ${plain(value)}`),
+      SHOWN.address,
+      '\n',
+    ),
+  );
+  field('Nearby places (from Google)', gym.places ? plain(gym.places) : '', false, SHOWN.places);
+  const description = gym.description ? plainLines(gym.description) : '';
+  return {
+    title: truncate(title, LIMITS.embedTitle),
+    url: gymMapsUrl(gym),
+    ...(description === '' ? {} : { description: truncate(description, SHOWN.description) }),
+    color: GYM_COLOUR,
+    fields,
+    ...(view.image === undefined ? {} : { image: { url: view.image } }),
+    footer: { text: `Gym #${gym.id} · ${gym.lat}, ${gym.lon}` },
+  };
+}
```

Apply to `src/services/pending-requests.ts`:

```diff
--- a/src/services/pending-requests.ts
+++ b/src/services/pending-requests.ts
@@ -51,6 +51,20 @@ export class PendingRequests<T> {
     return { value: request.value };
   }
 
+  /**
+   * The value for a token, which stays: for a question that leads to a form first (the member
+   * may close the form and press another button of the question after all). `expired` and
+   * `not-yours` as for `take`.
+   */
+  peek(token: string, userId: string): { value: T } | 'expired' | 'not-yours' {
+    const request = this.requests.get(token);
+    if (!request || request.expires <= this.now()) {
+      this.requests.delete(token);
+      return 'expired';
+    }
+    return request.ownerId === userId ? { value: request.value } : 'not-yours';
+  }
+
   get size(): number {
     return this.requests.size;
   }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/commands/gyms/gym.test.ts src/commands/raids/boss.test.ts src/discord/router.test.ts src/render/gym-view.test.ts src/services/pending-requests.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff 63d8eb9 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/admin/self-roles.test.ts src/commands/gyms/add.ts src/commands/gyms/controls.ts src/commands/gyms/form.ts src/commands/gyms/gym-option.ts src/commands/gyms/gym.test.ts src/commands/gyms/index.ts src/commands/gyms/shared.ts src/commands/gyms/show.ts src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/raid-input.ts src/components/index.ts src/discord/custom-id.ts src/discord/router.test.ts src/discord/router.ts src/render/gym-view.test.ts src/render/gym-view.ts src/services/pending-requests.test.ts src/services/pending-requests.ts test/support/fake-interactions.ts test/support/gym-commands.ts
npm run typecheck; npx eslint src/commands/admin/self-roles.test.ts src/commands/gyms/add.ts src/commands/gyms/controls.ts src/commands/gyms/form.ts src/commands/gyms/gym-option.ts src/commands/gyms/gym.test.ts src/commands/gyms/index.ts src/commands/gyms/shared.ts src/commands/gyms/show.ts src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/raid-input.ts src/components/index.ts src/discord/custom-id.ts src/discord/router.test.ts src/discord/router.ts src/render/gym-view.test.ts src/render/gym-view.ts src/services/pending-requests.test.ts src/services/pending-requests.ts test/support/fake-interactions.ts test/support/gym-commands.ts   # both clean; the full check runs after the last task
git add src/commands/admin/self-roles.test.ts src/commands/gyms/add.ts src/commands/gyms/controls.ts src/commands/gyms/form.ts src/commands/gyms/gym-option.ts src/commands/gyms/gym.test.ts src/commands/gyms/index.ts src/commands/gyms/shared.ts src/commands/gyms/show.ts src/commands/index.ts src/commands/raids/boss.test.ts src/commands/raids/raid-input.ts src/components/index.ts src/discord/custom-id.ts src/discord/router.test.ts src/discord/router.ts src/render/gym-view.test.ts src/render/gym-view.ts src/services/pending-requests.test.ts src/services/pending-requests.ts test/support/fake-interactions.ts test/support/gym-commands.ts
git commit -F <a file with the message below>
```

The commit message:

```
Gym commands: /gym show and /gym add, guarded autocomplete for staff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 6: The gym command: edit, move, elite

**Files:**
- Create: `src/commands/gyms/edit-move.test.ts`, `src/commands/gyms/edit.ts`, `src/commands/gyms/elite.ts`, `src/commands/gyms/move.ts`
- Modify: `src/commands/gyms/controls.ts`, `src/commands/gyms/index.ts`, `src/render/raid-post.test.ts`, `src/render/raid-post.ts`

**Interfaces:**
- Consumes: Task 5.
- Produces: `/gym edit gym` (`edit.ts`: the pre-filled form, only what changed is written, a refused form opened again with what was typed), `/gym move gym location` (`move.ts`: the question for a far move, a gym nearby or an approximate place; from where to where; what stays when the regions change; the pointer to `/location` in a raid's post), `/gym elite gym eligible` (`elite.ts`); a notice keeps its line breaks in a raid post and a train post (`plainLines`).

Reference commit of the prototype for this task: `ea3b862`.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/gyms/edit-move.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { sent } from '../../../test/support/fake-interactions.js';
import { STAFF_PLACE, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonId,
  buttonsOf,
  embedOf,
  gymCommandsWith,
  MEMBER,
  MODERATOR,
} from '../../../test/support/gym-commands.js';
import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { REPORTER } from '../../../test/support/parties.js';
import { PartyStatus } from '../../domain/party/status.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

interface Form {
  custom_id: string;
  title: string;
  components: { components: { custom_id: string; value?: string; required?: boolean }[] }[];
}

/** `/gym edit` for a gym: the form that opened. */
async function editForm(made: Made, gym: string): Promise<Form> {
  const used = await made.use('edit', { gym });
  const form = used.showModal.mock.calls[0]?.[0] as Form | undefined;
  if (!form) throw new Error(`no form opened: ${JSON.stringify(used.reply.mock.calls)}`);
  return form;
}

const filled = (form: Form): Record<string, string> =>
  Object.fromEntries(
    form.components.map((row) => [
      row.components[0]?.custom_id ?? '',
      row.components[0]?.value ?? '',
    ]),
  );

const fieldsOf = (answer: ReturnType<typeof answerOf>): Record<string, string> =>
  Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));

describe('/gym edit', () => {
  it('opens a form at once, filled with the texts of the gym', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(
      1,
      { notice: 'Closed on Sundays', keywords: ['books', 'mural'] },
      MODERATOR,
    );
    const used = await made.use('edit', { gym: 'id:1' });
    expect(used.deferReply).not.toHaveBeenCalled();
    const form = used.showModal.mock.calls[0]?.[0] as Form;
    expect(form.title).toBe('Edit Pinewood Public Library');
    expect(form.custom_id).toMatch(/^gym:[0-9a-f]{16}:edit$/);
    expect(filled(form)).toEqual({
      name: 'Pinewood Public Library',
      nickname: 'The Stacks',
      description: 'Mural of readers beside the front doors',
      notice: 'Closed on Sundays',
      keywords: 'books, mural',
    });
    expect(form.components[0]?.components[0]?.required).toBe(true);
    expect(form.components[1]?.components[0]?.required).toBe(false);
  });

  it('writes only the fields that were changed, and shows the gym', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    made.gymStore.writes.length = 0;

    const submitted = await made.submit(
      form.custom_id,
      { ...filled(form), nickname: '', notice: 'Closed on Sundays', keywords: 'Books,  mural' },
      { modalFromCommand: true },
    );

    expect(made.gymStore.writes).toEqual([
      {
        what: 'update',
        id: 1,
        patch: { nickname: null, notice: 'Closed on Sundays', keywords: ['books', 'mural'] },
      },
    ]);
    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(submitted);
    expect(answer.content).toBe(
      'Changed the nickname, the notice and the keywords of **Pinewood Public Library** (#1).',
    );
    expect(embedOf(answer).title).toBe('Pinewood Public Library');
    expect(fieldsOf(answer)).toMatchObject({
      Notice: 'Closed on Sundays',
      Keywords: 'books, mural',
    });
    // Edits are not announced.
    await made.settle();
    expect(made.gateway.messagesIn(UPDATES_CHANNEL)).toEqual([]);
  });

  it('writes nothing for a form that came back as it was, and says so', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    made.gymStore.writes.length = 0;
    const submitted = await made.submit(form.custom_id, filled(form), { modalFromCommand: true });
    expect(answerOf(submitted)).toEqual({
      content: 'Nothing was changed.',
      components: [],
      flags: MessageFlags.Ephemeral,
    });
    expect(made.gymStore.writes).toEqual([]);
  });

  it('does not undo what somebody else changed in another field meanwhile', async () => {
    const made = await gymCommandsWith();
    const mine = await editForm(made, 'id:1');
    const theirs = await editForm(made, 'id:1');
    await made.submit(theirs.custom_id, { ...filled(theirs), notice: 'Closed on Sundays' });
    await made.submit(mine.custom_id, { ...filled(mine), nickname: 'Reading Room' });
    expect(made.gymStore.row(1)).toMatchObject({
      nickname: 'Reading Room',
      notice: 'Closed on Sundays',
    });
  });

  it('shows a changed notice in the post of a raid at the gym', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.get(1);
    if (!gym) throw new Error('no gym');
    const raid = await made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error('no raid');
    await made.settle();
    const form = await editForm(made, 'id:1');
    await made.submit(form.custom_id, { ...filled(form), notice: 'Closed on Sundays' });
    await made.settle();
    const post = made.gateway.posts.get(raid.party.forumPostId ?? '');
    expect(JSON.stringify(post?.message)).toContain('Closed on Sundays');
  });

  it('refuses texts that cannot be stored, keeps what was typed and opens the form again', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    made.gymStore.writes.length = 0;
    const typed = {
      ...filled(form),
      name: "'".repeat(50),
      description: 'A long paragraph\nthat nobody types twice gladly.',
    };
    const refused = await made.submit(form.custom_id, typed, { modalFromCommand: true });
    const refusal = answerOf(refused);
    expect(refusal.content).toMatch(/^The name is too long as I store it, by 45 characters/);
    expect(refusal.content).toContain('Nothing was saved. What you typed is kept:');
    // The first form came from the command: its refusal is a message of its own.
    expect(refused.reply).toHaveBeenCalledTimes(1);
    expect(refusal.flags).toBe(MessageFlags.Ephemeral);
    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again', 'Cancel']);
    expect(made.gymStore.writes).toEqual([]);

    // The form again, with what was typed.
    const reopened = await made.press(buttonId(refusal, 'Open the form again'));
    const again = reopened.showModal.mock.calls[0]?.[0] as Form;
    expect(again.custom_id).toBe(form.custom_id);
    expect(filled(again)).toEqual(typed);

    // Corrected: what is written is what differs from the gym as the first form showed it.
    const submitted = await made.submit(again.custom_id, { ...typed, name: 'Reading Room' });
    expect(made.gymStore.writes).toEqual([
      {
        what: 'update',
        id: 1,
        patch: {
          name: 'Reading Room',
          description: 'A long paragraph\nthat nobody types twice gladly.',
        },
      },
    ]);
    expect(answerOf(submitted).content).toBe(
      'Changed the name and the description of **Reading Room** (The Stacks, #1).',
    );
    // Answered in the place of the refusal: its button does not stay under a finished edit.
    expect(submitted.deferUpdate).toHaveBeenCalledTimes(1);
    expect(submitted.reply).not.toHaveBeenCalled();
    expect(answerOf(submitted).components).toEqual([]);
  });

  it('answers a second refusal, and "nothing changed", in the place of the first', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    const bad = { ...filled(form), name: "'".repeat(50) };
    const first = await made.submit(form.custom_id, bad, { modalFromCommand: true });
    expect(first.reply).toHaveBeenCalledTimes(1);
    // Sent again as it was, from the form the refusal opened.
    const second = await made.submit(form.custom_id, bad);
    expect(second.reply).not.toHaveBeenCalled();
    expect(sent(second.update).content).toMatch(/^The name is too long as I store it/);
    expect(buttonsOf(sent(second.update)).map(([label]) => label)).toEqual([
      'Open the form again',
      'Cancel',
    ]);
    // Put back to what it was: nothing to write, said where the refusal stood.
    const third = await made.submit(form.custom_id, filled(form));
    expect(sent(third.update)).toEqual({ content: 'Nothing was changed.', components: [] });
    expect(made.gymStore.row(1)?.name).toBe('Pinewood Public Library');
  });

  it('opens the form again with exactly what was typed, uncut', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    // Thirty-one keywords, written with spaces and capitals as a member types them, and a
    // notice that ends in an emoji right at the limit of its field.
    const keywords = Array.from({ length: 31 }, (_, n) => ` Key Word ${n} `).join(',');
    const notice = `${'n'.repeat(498)}\u{1f600}`;
    const typed = { ...filled(form), keywords, notice };
    const refused = await made.submit(form.custom_id, typed, { modalFromCommand: true });
    const reopened = await made.press(buttonId(answerOf(refused), 'Open the form again'));
    const again = reopened.showModal.mock.calls[0]?.[0] as Form;
    expect(filled(again).keywords).toBe(keywords);
    expect(filled(again).notice).toBe(notice);
  });

  it('refuses a name of nothing, a keyword that is too long and too many keywords the same way', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    const blank = await made.submit(form.custom_id, { ...filled(form), name: '  ' });
    expect(answerOf(blank).content).toMatch(/^A gym needs a name\.\n/);
    const keywords = Array.from({ length: 33 }, (_, n) => `k${n}`).join(',');
    const many = await made.submit(form.custom_id, { ...filled(form), keywords });
    expect(answerOf(many).content).toMatch(/^That is 3 keywords too many: a gym may have 30\.\n/);
    expect(buttonsOf(answerOf(many)).map(([label]) => label)).toEqual([
      'Open the form again',
      'Cancel',
    ]);
    expect(made.gymStore.row(1)?.keywords).toEqual([]);
  });

  it('leaves a text out of the form that is too long for it, keeps it, and says so', async () => {
    const made = await gymCommandsWith();
    const long = 'x'.repeat(600);
    await made.gymStore.update(1, { notice: long });
    await made.directory.refreshGym(1);

    const form = await editForm(made, 'id:1');
    expect(Object.keys(filled(form))).toEqual(['name', 'nickname', 'description', 'keywords']);
    expect(
      made.logged.some(
        (entry) => entry.msg === 'texts of a gym are too long for the form of /gym edit',
      ),
    ).toBe(true);

    const submitted = await made.submit(form.custom_id, { ...filled(form), nickname: 'Stacks' });
    expect(answerOf(submitted).content).toBe(
      'Changed the nickname of **Pinewood Public Library** (Stacks, #1).\n' +
        'The notice of this gym is too long for the form and is unchanged. An admin has to ' +
        'shorten it in the database first.',
    );
    expect(made.gymStore.row(1)).toMatchObject({ nickname: 'Stacks', notice: long });
  });

  it('refuses a form whose request is gone, as after a restart, and one of somebody else', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:1');
    const other = await made.submit(form.custom_id, filled(form), { userId: '200000000000000007' });
    expect(answerOf(other).content).toBe('That is somebody else’s question.');
    const member = await made.submit(form.custom_id, filled(form), {
      userId: MEMBER,
      roleNames: [],
    });
    expect(answerOf(member).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    const unknown = await made.submit('gym:0000000000000000:edit', { name: 'X' });
    expect(answerOf(unknown)).toEqual({
      content: 'That has expired. Use the command again.',
      flags: MessageFlags.Ephemeral,
    });
    // Sent twice: the second finds nothing to answer.
    await made.submit(form.custom_id, { ...filled(form), nickname: 'Stacks' });
    const twice = await made.submit(form.custom_id, { ...filled(form), nickname: 'Other' });
    expect(answerOf(twice).content).toBe('That has expired. Use the command again.');
    expect(made.gymStore.row(1)?.nickname).toBe('Stacks');
  });

  it('says so when the gym was deleted while the form was open', async () => {
    const made = await gymCommandsWith();
    const form = await editForm(made, 'id:6');
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    const submitted = await made.submit(form.custom_id, { ...filled(form), nickname: 'Leaf' });
    expect(sent(submitted.followUp).content).toBe('That gym no longer exists.');
  });

  it('notes a new name that the search ignores, and not again with every later change', async () => {
    const made = await gymCommandsWith();
    const note = 'Its name consists only of words the search ignores';
    const form = await editForm(made, 'id:1');
    const renamed = await made.submit(form.custom_id, { ...filled(form), name: 'The Gym' });
    expect(answerOf(renamed).content).toContain(note);
    // It has a nickname: members find it, and a change of its notice says nothing of its name.
    const second = await editForm(made, 'id:1');
    const noticed = await made.submit(second.custom_id, { ...filled(second), notice: 'Wet paint' });
    expect(answerOf(noticed).content).not.toContain(note);
    // Without nickname and keywords nothing finds it: said with every change.
    const third = await editForm(made, 'id:1');
    const bare = await made.submit(third.custom_id, { ...filled(third), nickname: '' });
    expect(answerOf(bare).content).toContain(note);
    const fourth = await editForm(made, 'id:1');
    const still = await made.submit(fourth.custom_id, { ...filled(fourth), notice: '' });
    expect(answerOf(still).content).toContain(note);
  });

  it('says of several texts, and of the keywords, that they are too long for the form', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(1, {
      notice: 'x'.repeat(600),
      keywords: Array.from({ length: 40 }, (_, n) => `${'k'.repeat(48)}${n}`),
    });
    await made.directory.refreshGym(1);
    const form = await editForm(made, 'id:1');
    const both = await made.submit(form.custom_id, filled(form));
    expect(answerOf(both).content).toBe(
      'Nothing was changed.\nThe notice and the keywords of this gym are too long for the form ' +
        'and are unchanged. An admin has to shorten them in the database first.',
    );
    await made.gymStore.update(1, { notice: null });
    await made.directory.refreshGym(1);
    const next = await editForm(made, 'id:1');
    const one = await made.submit(next.custom_id, filled(next));
    expect(answerOf(one).content).toContain(
      'The keywords of this gym are too long for the form and are unchanged. An admin has to ' +
        'shorten them in the database first.',
    );
  });
});

describe('/gym move', () => {
  const link = (lat: number, lon: number): string =>
    `[${lat}, ${lon}](<https://www.google.com/maps/search/?api=1&query=${lat}%2C${lon}>)`;

  it('moves the gym at once for a correction of some metres, and says from where to where', async () => {
    const made = await gymCommandsWith();
    const moved = await made.use('move', { gym: 'id:6', location: '40.0302, -80.03' });
    expect(moved.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const answer = answerOf(moved);
    expect(answer.content).toBe(
      `Moved **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)} (22 m).\n` +
        'Its address and the places around it are being fetched from Google; `/gym show` has ' +
        'them in a moment.',
    );
    expect(answer.components).toEqual([]);
    expect(embedOf(answer).footer?.text).toBe('Gym #6 · 40.0302, -80.03');
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.0302, lon: -80.03 });
  });

  it('asks first when the new place is more than 500 metres away', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('move', { gym: 'id:6', location: '40.05, -79.95' });
    const question = answerOf(asked);
    expect(question.content?.split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
      'That is 7.2 km from where it is now.',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);

    const pressed = await made.press(buttonId(question, 'Move anyway'));
    const answer = answerOf(pressed);
    expect(answer.content?.split('\n')[0]).toBe(
      `Moved **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)} (7.2 km).`,
    );
    expect(fieldsOf(answer).Regions).toBe(`<#${EAST_CHANNEL}>`);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.05, lon: -79.95 });
    // 499 metres are a correction; the limit is 500.
    const near = await made.use('move', { gym: 'id:6', location: '40.0544, -79.95' });
    expect(answerOf(near).content).toMatch(/^Moved /);
  });

  it('asks one question when the place is far away and beside another gym', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' });
    const question = answerOf(asked);
    expect(question.content?.split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05005, -80.05)}?`,
      'That is 2.8 km from where it is now.',
      'Another gym lies within 10 metres of that place:',
      '- **Pinewood Public Library** (The Stacks, #1), 6 m away',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);

    const pressed = await made.press(buttonId(question, 'Move anyway'));
    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(answerOf(pressed).content).toMatch(/^Moved \*\*Maple Leaf Mosaic\*\* \(#6\) from /);
    expect(made.gymStore.row(6)).toMatchObject({ lat: 40.05005, lon: -80.05 });
  });

  it('asks first when the place was only read from the middle of a map', async () => {
    const made = await gymCommandsWith();
    const asked = await made.use('move', {
      gym: 'id:6',
      location: 'https://www.google.com/maps/@40.0302,-80.03,17z',
    });
    const question = answerOf(asked);
    expect(question.content?.split('\n')).toEqual([
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
      'I read this from where the map was centred, not from a pin: check the link before you go on.',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Move', 'Cancel']);
    await made.press(buttonId(question, 'Move'));
    expect(made.gymStore.row(6)?.lat).toBe(40.0302);
  });

  it('asks again when a gym was put beside the new place since the question', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05, -79.95' }));
    await made.admin.add({ name: 'Newcomer', lat: 40.05002, lon: -79.95 }, STAFF_PLACE);

    const pressed = await made.press(buttonId(question, 'Move anyway'));

    const again = answerOf(pressed);
    expect(again.content?.split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was moved yet.',
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.05, -79.95)}?`,
      'That is 7.2 km from where it is now.',
      'Another gym lies within 10 metres of that place:',
      '- **Newcomer** (#13), 2 m away',
    ]);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
    await made.press(buttonId(again, 'Move anyway'));
    expect(made.gymStore.row(6)?.lat).toBe(40.05);
  });

  it('asks again, with all it said, when the gym itself was moved since the question', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('move', {
        gym: 'id:6',
        location: 'https://www.google.com/maps/@40.05,-79.95,17z',
      }),
    );
    expect(question.content).toContain('I read this from where the map was centred');
    // Somebody else corrects the gym meanwhile.
    await made.admin.move(6, { lat: 40.0301, lon: -80.03 }, MODERATOR);

    const pressed = await made.press(buttonId(question, 'Move anyway'));

    const again = answerOf(pressed);
    expect(again.content?.split('\n')).toEqual([
      'The gym was moved since I asked, so nothing was moved yet.',
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.0301, -80.03)} to ${link(40.05, -79.95)}?`,
      'That is 7.2 km from where it is now.',
      'I read this from where the map was centred, not from a pin: check the link before you go on.',
    ]);
    expect(made.gymStore.row(6)?.lat).toBe(40.0301);
    await made.press(buttonId(again, 'Move anyway'));
    expect(made.gymStore.row(6)?.lat).toBe(40.05);
  });

  it('keeps the warning about the middle of a map when it asks again for a gym nearby', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(
      await made.use('move', {
        gym: 'id:6',
        location: 'https://www.google.com/maps/@40.0302,-80.03,17z',
      }),
    );
    await made.admin.add({ name: 'Newcomer', lat: 40.03021, lon: -80.03 }, STAFF_PLACE);
    const again = answerOf(await made.press(buttonId(question, 'Move')));
    expect(again.content?.split('\n')).toEqual([
      'A gym was added at that place since I asked, so nothing was moved yet.',
      `Move **Maple Leaf Mosaic** (#6) from ${link(40.03, -80.03)} to ${link(40.0302, -80.03)}?`,
      'I read this from where the map was centred, not from a pin: check the link before you go on.',
      'Another gym lies within 10 metres of that place:',
      '- **Newcomer** (#13), 1 m away',
    ]);
  });

  it('leaves the gym where it is on Cancel', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' }));
    const pressed = await made.press(buttonId(question, 'Cancel'));
    expect(sent(pressed.update).content).toBe('The gym stays where it is.');
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
  });

  it('takes the question away when the gym was deleted before the answer', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '40.05, -79.95' }));
    await made.admin.delete(6, { id: REPORTER }, STAFF_PLACE);
    const pressed = await made.press(buttonId(question, 'Move anyway'));
    // In the place of the question, without its buttons: not a note beside dead buttons.
    expect(pressed.followUp).not.toHaveBeenCalled();
    expect(answerOf(pressed)).toEqual({
      content: 'That gym no longer exists.',
      embeds: [],
      components: [],
    });
  });

  it('does not take the gym itself for another gym near its new place', async () => {
    const made = await gymCommandsWith();
    // Five metres from where it is.
    const moved = await made.use('move', { gym: 'id:1', location: '40.05005,-80.05' });
    expect(answerOf(moved).content).toMatch(/^Moved \*\*Pinewood Public Library\*\*/);
  });

  it('is never refused for a raid or a train, and says what stays when the regions change', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.get(6);
    if (!gym) throw new Error('no gym');
    const raid = await made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error('no raid');
    for (const name of ['Saturday', 'Sunday']) {
      const train = await made.service.createTrain({
        name,
        creatorId: REPORTER,
        regionChannelId: WEST_CHANNEL,
      });
      if (train.kind !== 'created') throw new Error('no train');
      await made.trains.addStop(train.party.id, { id: REPORTER }, 6);
    }
    const lines = async (location: string): Promise<string[]> => {
      const used = await made.use('move', { gym: 'id:6', location });
      const first = answerOf(used);
      const answer = first.components?.length
        ? answerOf(await made.press(buttonId(first, 'Move anyway')))
        : first;
      return answer.content?.split('\n').slice(2) ?? [];
    };

    // Within its region: nothing to say.
    expect(await lines('40.0302, -80.03')).toEqual([]);
    // Into another region of this server.
    expect(await lines('40.05, -79.95')).toEqual([
      `The raid at it stays in <#${raid.party.forumPostId ?? ''}>.`,
      'It stays a stop of 2 trains.',
    ]);
    expect(made.store.get(raid.party.id)).toMatchObject({ gymId: 6, regionId: 1 });
    // Out of every region.
    expect(await lines('41.0, -80')).toEqual([
      `The raid at it stays in <#${raid.party.forumPostId ?? ''}>.`,
      'It stays a stop of 2 trains.',
      'It now lies in no region: raids cannot be reported there.',
    ]);
    // Further out, still in none: that is not news.
    expect(await lines('41.001, -80')).toEqual([]);
  });

  it('says nothing of regions for a gym nothing is at', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('move', { gym: 'id:6', location: '41.0, -80' }));
    const answer = answerOf(await made.press(buttonId(question, 'Move anyway')));
    expect(answer.content?.split('\n').slice(2)).toEqual([
      'It now lies in no region: raids cannot be reported there.',
    ]);
  });

  it('points to /location when it is used in the post of a raid', async () => {
    const made = await gymCommandsWith();
    const gym = made.directory.get(1);
    if (!gym) throw new Error('no gym');
    const raid = await made.service.reportRaid({
      gym,
      reporterId: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    if (raid.kind !== 'created') throw new Error('no raid');
    const inPost = { channelId: raid.party.forumPostId ?? '', thread: { parentId: WEST_FORUM } };
    const moved = await made.use('move', { gym: 'id:6', location: '40.0302, -80.03' }, inPost);
    expect(answerOf(moved).content?.split('\n').at(-1)).toBe(
      'To change this raid’s gym, use `/location`.',
    );
    const asked = await made.use('move', { gym: 'id:6', location: '40.05005,-80.05' }, inPost);
    expect(answerOf(asked).content?.split('\n').at(-1)).toBe(
      'To change this raid’s gym, use `/location`.',
    );
    // The raid is where it was.
    expect(made.store.get(raid.party.id)?.gymId).toBe(1);
  });

  it('says in its help how to get a location from the game', async () => {
    const { gym } = await import('./index.js');
    const details = gym.subcommands.get('move')?.help?.details;
    expect(typeof details === 'string' && details).toMatch(
      /^In Pokémon GO open the gym, choose View in map, share the link and paste it here\. Coordinates \(`40\.4406, -79\.9959`\) work too\. /,
    );
    const subcommands = (gym.data.toJSON().options ?? []) as {
      name: string;
      options?: { name: string; description: string }[];
    }[];
    expect(
      subcommands.find((sub) => sub.name === 'move')?.options?.find((o) => o.name === 'location')
        ?.description,
    ).toBe(
      'The link Pokémon GO shares (gym, View in map, share), or coordinates like 40.4406, -79.9959',
    );
  });

  it('refuses a location it cannot read', async () => {
    const made = await gymCommandsWith();
    const used = await made.use('move', { gym: 'id:6', location: 'next door' });
    expect(sent(used.followUp).content).toMatch(/^I could not read a place from that\./);
    expect(made.gymStore.row(6)?.lat).toBe(40.03);
  });
});

describe('/gym elite', () => {
  it('marks a gym as an elite raid gym and takes the mark away', async () => {
    const made = await gymCommandsWith();
    const marked = await made.use('elite', { gym: 'id:1', eligible: true });
    expect(answerOf(marked).content).toBe(
      '**Pinewood Public Library** (The Stacks, #1) is now marked as an elite raid gym.',
    );
    expect(fieldsOf(answerOf(marked))['Elite raid gym']).toBe('Yes');
    expect(made.gymStore.row(1)).toMatchObject({ taggedEx: true, confirmedEx: false });
    const again = await made.use('elite', { gym: 'id:1', eligible: true });
    expect(answerOf(again).content).toContain('was an elite raid gym already.');

    const cleared = await made.use('elite', { gym: 'id:1', eligible: false });
    expect(answerOf(cleared).content).toContain('is no longer marked as an elite raid gym.');
    expect(fieldsOf(answerOf(cleared))['Elite raid gym']).toBe('No');
    const none = await made.use('elite', { gym: 'id:1', eligible: false });
    expect(answerOf(none).content).toContain('was no elite raid gym.');
  });

  it('clears both stored flags of a gym the legacy bot marked', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(2, { confirmedEx: true });
    await made.directory.refreshGym(2);
    const cleared = await made.use('elite', { gym: 'id:2', eligible: false });
    expect(answerOf(cleared).content).toContain('is no longer marked as an elite raid gym.');
    expect(made.gymStore.row(2)).toMatchObject({ taggedEx: false, confirmedEx: false });
  });

  it('names a gym whose legacy name shows as nothing, instead of an empty bold', async () => {
    const made = await gymCommandsWith();
    await made.gymStore.update(3, { name: '\u202e\u200b\u0007', nickname: null });
    await made.directory.refreshGym(3);
    const elite = answerOf(await made.use('elite', { gym: '#3', eligible: true }));
    expect(elite.content).toBe('**Gym** (#3) is now marked as an elite raid gym.');
    expect(embedOf(elite).title).toBe('Gym #3');
  });

  it('never says EX', async () => {
    const made = await gymCommandsWith();
    const answer = answerOf(await made.use('elite', { gym: 'id:1', eligible: true }));
    expect(JSON.stringify([answer.content, embedOf(answer)])).not.toMatch(/\bEX\b/);
    const { gym } = await import('./index.js');
    expect(JSON.stringify(gym.data.toJSON())).not.toMatch(/\bex\b/i);
  });
});
```

Apply to `src/render/raid-post.test.ts`:

```diff
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -571,6 +571,21 @@ describe('renderRaidPost', () => {
     expect(about({ taggedEx: true }, ex)).toBeUndefined();
   });
 
+  it('keeps the lines of a notice that was written as a paragraph', () => {
+    const post = renderRaidPost(
+      view(egg, {
+        gym: {
+          ...library!,
+          taggedEx: true,
+          notice: 'Park closes at *dusk*.\r\n\r\n\r\n  Use the east gate.\n# Not a heading',
+        },
+      }),
+    );
+    expect(post.embed.fields?.find((field) => field.name === 'About this gym')?.value).toBe(
+      'This is an elite raid gym.\nPark closes at \\*dusk\\*.\n\nUse the east gate.\n\\# Not a heading',
+    );
+  });
+
   it('adds no field for a notice that is empty once it is made plain', () => {
     const post = renderRaidPost(view(egg, { gym: { ...library!, notice: '     ' } }));
     expect(post.embed.fields?.some((field) => field.name === 'About this gym')).toBe(false);
```

Run: `npx vitest run --project unit src/commands/gyms/edit-move.test.ts src/render/raid-post.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Apply to `src/commands/gyms/controls.ts`:

```diff
--- a/src/commands/gyms/controls.ts
+++ b/src/commands/gyms/controls.ts
@@ -4,6 +4,8 @@ import { UserError } from '../../discord/errors.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { addAnswers, addForms, addOpeners } from './add.js';
+import { editForms, editOpeners } from './edit.js';
+import { moveAnswers } from './move.js';
 import {
   EXPIRED,
   GYM_KIND,
@@ -33,9 +35,10 @@ const CANCELLED: Readonly<Record<PendingGym['what'], string>> = {
  */
 const ANSWERS: Readonly<Record<string, ButtonAnswer>> = {
   ...addAnswers,
+  ...moveAnswers,
 };
-const OPENERS: Readonly<Record<string, FormOpener>> = { ...addOpeners };
-const FORMS: Readonly<Record<string, FormAnswer>> = { ...addForms };
+const OPENERS: Readonly<Record<string, FormOpener>> = { ...addOpeners, ...editOpeners };
+const FORMS: Readonly<Record<string, FormAnswer>> = { ...addForms, ...editForms };
 /** The actions that open a form, whatever the request is about. */
 const OPENING: ReadonlySet<string> = new Set(
   Object.keys(OPENERS).map((key) => key.split(':')[1] ?? ''),
```

Create `src/commands/gyms/edit.ts`:

```ts
import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import {
  changedGymTexts,
  GYM_TEXT_FIELDS,
  gymFormTexts,
  type GymTextField,
} from '../../domain/gyms/gym-text.js';
import { gymWithId } from '../../render/gym-view.js';
import { gymForm, sentForm } from './form.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import {
  content,
  EXPIRED,
  GYM_GONE,
  gymViewMessage,
  markAnswered,
  nameNote,
  pendingGyms,
  refuseForm,
  staffPlace,
  textRefusal,
  type FormAnswer,
  type FormOpener,
  type PendingGym,
} from './shared.js';

type PendingEdit = Extract<PendingGym, { what: 'edit' }>;

/** "the name", "the name and the notice", "the name, the notice and the keywords". */
function fieldList(fields: readonly GymTextField[]): string {
  const words = fields.map((field) => `the ${field}`);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

/**
 * What staff are told about texts the form could not show: a text longer than its field would
 * come back cut and be saved cut, so it was left out and is as it was. Undefined when the form
 * had every field.
 */
function tooLongNote(fields: readonly GymTextField[]): string | undefined {
  if (fields.length === 0) return undefined;
  // "The keywords are", "The name and the notice are", "The notice is".
  const several = fields.length > 1 || fields[0] === 'keywords';
  const [is, it] = several ? ['are', 'them'] : ['is', 'it'];
  return (
    `${fieldList(fields).replace(/^t/, 'T')} of this gym ${is} too long for the form and ${is} ` +
    `unchanged. An admin has to shorten ${it} in the database first.`
  );
}

/** The fields the form of an edit has: those it could show when it was first opened. */
function formFields(request: PendingEdit): GymTextField[] {
  return GYM_TEXT_FIELDS.filter((field) => Object.hasOwn(request.shown, field));
}

/** The form of an edit: filled with the gym's texts, or with what was typed when it is opened again. */
function editForm(token: string, request: PendingEdit, name: string) {
  return gymForm({
    token,
    action: 'edit',
    title: `Edit ${name}`,
    fields: formFields(request),
    texts: request.shown,
    typed: request.typed,
  });
}

/**
 * `/gym edit`: the texts of a gym in one form, filled with what they are. Only what the staff
 * member changes is written, so two people who each change another field do not undo each
 * other. It opens at once, without a deferral: the gym comes from memory.
 */
export const editGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('edit')
      .setDescription('Change the name, nickname, description, notice and keywords of a gym'),
  ),
  help: {
    details:
      'A form opens with the texts as they are: change what you want and send it. A nickname, ' +
      'description or notice that you empty is removed; the keywords you leave are the ' +
      'keywords it has. Only the fields you changed are written. The notice is shown in ' +
      'every raid post at the gym. To move a gym use `/gym move`, to mark it as an elite raid ' +
      'gym `/gym elite`.',
    examples: ['/gym edit gym:Big Fountain'],
  },
  async execute(interaction, ctx) {
    const gym = chosenGym(interaction, ctx);
    const { shown, tooLong } = gymFormTexts(gym);
    if (tooLong.length > 0) {
      ctx.log.warn(
        { gym: gym.id, fields: tooLong },
        'texts of a gym are too long for the form of /gym edit',
      );
    }
    const request: PendingEdit = { what: 'edit', gymId: gym.id, shown, tooLong };
    if (formFields(request).length === 0) throw new UserError(tooLongNote(tooLong) ?? EXPIRED);
    const token = pendingGyms.put(interaction.user.id, request);
    await interaction.showModal(editForm(token, request, gym.name));
  },
  autocomplete: respondWithGyms,
};

/** "Open the form again", under a form that was refused: the form with what was typed. */
export const editOpeners: Readonly<Record<string, FormOpener>> = {
  'edit:reopen': (token, request) =>
    request.what === 'edit' ? editForm(token, request, request.shown.name ?? 'gym') : undefined,
};

/**
 * The form of `/gym edit` was sent. What differs from what the form was first filled with is
 * checked and written; nothing else is touched. A refusal keeps what was typed and offers the
 * form again. The first form comes from the command and gets a message of its own; one that was
 * opened again is answered in the place of the refusal it was opened from.
 */
export const editForms: Readonly<Record<string, FormAnswer>> = {
  'edit:edit': async (interaction, ctx, token, request) => {
    if (request.what !== 'edit') return;
    const { typed, texts: sent } = sentForm(interaction, formFields(request));
    const changed = changedGymTexts(request.shown, sent);
    const refusal = textRefusal(changed);
    if (refusal !== undefined) {
      request.typed = typed;
      await refuseForm(interaction, token, refusal);
      return;
    }
    if (pendingGyms.take(token, interaction.user.id) === 'expired') throw new UserError(EXPIRED);
    markAnswered(token);
    const names = GYM_TEXT_FIELDS.filter((field) => Object.hasOwn(changed, field));
    const note = tooLongNote(request.tooLong);
    // A form that was opened again from the refusal of an earlier one is answered in the place
    // of that refusal: its button must not stay under an edit that is done.
    const again = interaction.isFromMessage();
    if (names.length === 0) {
      const nothing = { content: content(['Nothing was changed.', note]), components: [] };
      if (again) await interaction.update(nothing);
      else await interaction.reply({ ...nothing, flags: MessageFlags.Ephemeral });
      return;
    }
    if (again) await interaction.deferUpdate();
    else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const place = await staffPlace(interaction, ctx);
    const gym = await ctx.gymAdmin.edit(request.gymId, changed, place.staffId);
    if (!gym) throw new UserError(GYM_GONE);
    // Said when the name was just made so, or while nothing else finds the gym either: not
    // again with every later change of a gym that has a nickname or keywords.
    const findable = gym.nickname !== null || gym.keywords.length > 0;
    await interaction.editReply(
      await gymViewMessage(ctx, place, gym, [
        `Changed ${fieldList(names)} of ${gymWithId(gym)}.`,
        note,
        names.includes('name') || !findable ? nameNote(ctx, gym) : undefined,
      ]),
    );
  },
};
```

Create `src/commands/gyms/elite.ts`:

```ts
import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { gymWithId } from '../../render/gym-view.js';
import { isEliteGym } from '../../render/raid-post.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { GYM_GONE, gymViewMessage, staffPlace } from './shared.js';

/**
 * `/gym elite`: whether a gym is an elite raid gym, as the game now calls what was an EX gym
 * (Matt, 2026-10-13). One answer, yes or no: the two flags the legacy bot kept (tagged, has
 * hosted) both mean yes, and no clears both. Elite raids are rare, so this is all there is.
 */
export const eliteGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('elite')
      .setDescription('Say whether a gym is an elite raid gym'),
  ).addBooleanOption((option) =>
    option
      .setName('eligible')
      .setDescription('True: it is an elite raid gym. False: it is none')
      .setRequired(true),
  ),
  help: {
    details:
      'An elite raid gym is marked in raid posts and on train routes, and a raid there is ' +
      'also shown in the channel for raids at elite raid gyms, where the server has one.',
    examples: ['/gym elite gym:Big Fountain eligible:True'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const before = chosenGym(interaction, ctx);
    const eligible = interaction.options.getBoolean('eligible', true);
    const place = await staffPlace(interaction, ctx);
    const gym = await ctx.gymAdmin.setElite(before.id, eligible, place.staffId);
    if (!gym) throw new UserError(GYM_GONE);
    const was = isEliteGym(before);
    const line =
      was === eligible
        ? `${gymWithId(gym)} ${eligible ? 'was an elite raid gym already' : 'was no elite raid gym'}.`
        : `${gymWithId(gym)} is ${eligible ? 'now marked as an elite raid gym' : 'no longer marked as an elite raid gym'}.`;
    await interaction.editReply(await gymViewMessage(ctx, place, gym, [line]));
  },
  autocomplete: respondWithGyms,
};
```

Apply to `src/commands/gyms/index.ts`:

```diff
--- a/src/commands/gyms/index.ts
+++ b/src/commands/gyms/index.ts
@@ -2,10 +2,13 @@ import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { addGym } from './add.js';
+import { editGym } from './edit.js';
+import { eliteGym } from './elite.js';
+import { moveGym } from './move.js';
 import { showGym } from './show.js';
 
 /** The subcommands of `/gym`, each in a file of its own in this folder. */
-const parts: readonly SubcommandPart[] = [showGym, addGym];
+const parts: readonly SubcommandPart[] = [showGym, addGym, editGym, moveGym, eliteGym];
 
 /**
  * `/gym`: the gym list, for staff. Discord offers it only to members who may manage the server
```

Create `src/commands/gyms/move.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonStyle,
  SlashCommandSubcommandBuilder,
  type ButtonBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { raidOf } from '../../discord/guards.js';
import { metresBetween } from '../../domain/geo/distance.js';
import type { LatLon } from '../../domain/geo/lat-lon.js';
import { distanceText, gymWithId } from '../../render/gym-view.js';
import { count } from '../../render/text.js';
import { FAR_MOVE_METRES } from '../../services/gym-admin-service.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import {
  APPROXIMATE,
  button,
  content,
  fetchNote,
  GYM_GONE,
  gymViewMessage,
  HOW_TO_LOCATE,
  LOCATION_OPTION,
  nearLines,
  pendingGyms,
  placeOrRefuse,
  pointLink,
  staffPlace,
  type ButtonAnswer,
} from './shared.js';

/** What staff are told who move a gym in the post of a raid: that is not how a raid moves. */
export const USE_LOCATION = 'To change this raid’s gym, use `/location`.';

/**
 * The question before a move that needs one: another gym lies within ten metres of the new
 * place, the new place is far from the old one (a wrong paste), or it was only read from the
 * middle of a map. One question for all of them. It is kept as a pending request.
 */
function moveQuestion(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
  gym: Gym,
  point: LatLon,
  approximate: boolean,
  before?: string,
) {
  const near = ctx.gymAdmin.near(point, gym.id);
  const metres = metresBetween(gym, point);
  const far = metres > FAR_MOVE_METRES;
  const token = pendingGyms.put(interaction.user.id, {
    what: 'move',
    gymId: gym.id,
    from: { lat: gym.lat, lon: gym.lon },
    point,
    approximate,
    nearIds: near.map((found) => found.gym.id),
  });
  return {
    content: content([
      before,
      `Move ${gymWithId(gym)} from ${pointLink(gym)} to ${pointLink(point)}?`,
      far ? `That is ${distanceText(metres)} from where it is now.` : undefined,
      approximate ? APPROXIMATE : undefined,
      ...nearLines(near),
      raidOf(interaction, ctx) ? USE_LOCATION : undefined,
    ]),
    embeds: [],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button(token, 'move', near.length > 0 || far ? 'Move anyway' : 'Move', ButtonStyle.Primary),
        button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
      ),
    ],
  };
}

/**
 * Moves a gym and shows it, as the answer to the command or in the place of its question: from
 * where to where and how far, and what the move means for what is at the gym. A move is never
 * refused for a raid or a train (Matt, 2026-10-13: it is a correction of a few metres); when
 * the regions of this server the gym lies in are others than before, the answer says that the
 * raid there stays in its post and the trains keep their stop, and when the gym now lies in no
 * region at all, that no raid can be reported there. The interaction has been acknowledged.
 */
async function moveAnswered(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  ctx: AppContext,
  gymId: number,
  point: LatLon,
): Promise<void> {
  const place = await staffPlace(interaction, ctx);
  const regionsNow = (): string[] =>
    ctx.gymAdmin
      .regionsOf(gymId, place.guildId)
      .map((region) => region.channelId)
      .sort();
  const regionsBefore = regionsNow();
  const reportable = ctx.gymAdmin.inAnyRegion(gymId);
  const moved = await ctx.gymAdmin.move(gymId, point, place.staffId);
  if (!moved) throw new UserError(GYM_GONE);
  const { gym, from, metres } = moved;
  const shown = ctx.gymAdmin.shownBy(gymId);
  const elsewhere = regionsBefore.join() !== regionsNow().join();
  await interaction.editReply(
    await gymViewMessage(ctx, place, gym, [
      `Moved ${gymWithId(gym)} from ${pointLink(from)} to ${pointLink(point)} (${distanceText(metres)}).`,
      fetchNote(ctx),
      ...(elsewhere
        ? shown.raids.map((raid) =>
            raid.forumPostId === null
              ? 'The raid at it stays where it was reported.'
              : `The raid at it stays in <#${raid.forumPostId}>.`,
          )
        : []),
      elsewhere && shown.trains.length > 0
        ? `It stays a stop of ${count(shown.trains.length, 'train')}.`
        : undefined,
      reportable && !ctx.gymAdmin.inAnyRegion(gymId)
        ? 'It now lies in no region: raids cannot be reported there.'
        : undefined,
      raidOf(interaction, ctx) ? USE_LOCATION : undefined,
    ]),
  );
}

/**
 * "Move" / "Move anyway" under the question. Like Add, it looks again: when a gym was put
 * within ten metres of the new place since the question, or the gym itself is no longer where
 * the question said it was (somebody else moved it), the question is asked anew, with
 * everything it said the first time.
 */
export const moveAnswers: Readonly<Record<string, ButtonAnswer>> = {
  'move:move': async (interaction, ctx, request) => {
    if (request.what !== 'move') return;
    const gym = ctx.gyms.get(request.gymId);
    if (!gym) throw new UserError(GYM_GONE);
    const fresh = ctx.gymAdmin
      .near(request.point, gym.id)
      .some((found) => !request.nearIds.includes(found.gym.id));
    const elsewhere = gym.lat !== request.from.lat || gym.lon !== request.from.lon;
    if (fresh || elsewhere) {
      await interaction.editReply(
        moveQuestion(
          interaction,
          ctx,
          gym,
          request.point,
          request.approximate,
          elsewhere
            ? 'The gym was moved since I asked, so nothing was moved yet.'
            : 'A gym was added at that place since I asked, so nothing was moved yet.',
        ),
      );
      return;
    }
    await moveAnswered(interaction, ctx, request.gymId, request.point);
  },
};

/**
 * `/gym move`: a gym gets another place (it was put down wrongly, or the game moved it). The
 * staff member is asked first when another gym lies within ten metres of the new place, when
 * the new place is more than 500 metres from the old one, or when it was read from the middle
 * of a map.
 */
export const moveGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('move')
      .setDescription('Move a gym to another place on the map'),
  ).addStringOption((option) =>
    option
      .setName('location')
      .setDescription(LOCATION_OPTION)
      .setRequired(true)
      .setMaxLength(1_000),
  ),
  help: {
    details:
      `${HOW_TO_LOCATE} The location is read as for ` +
      '`/gym add`. The gym keeps its texts, its raids and its ' +
      'place on train routes; its address and the places around it are fetched again, and ' +
      'the regions it lies in follow its new place. I ask first when the new place is more ' +
      'than 500 metres away or right beside another gym. This corrects where a gym is: to ' +
      'move a raid to another gym, use `/location` in the raid’s post.',
    examples: ['/gym move gym:Big Fountain location:40.4406, -79.9959'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const gym = chosenGym(interaction, ctx);
    const { point, approximate } = placeOrRefuse(
      await ctx.gymAdmin.readLocation(interaction.options.getString('location', true)),
    );
    const near = ctx.gymAdmin.near(point, gym.id);
    const far = metresBetween(gym, point) > FAR_MOVE_METRES;
    if (near.length === 0 && !far && !approximate) {
      await moveAnswered(interaction, ctx, gym.id, point);
      return;
    }
    await interaction.editReply(moveQuestion(interaction, ctx, gym, point, approximate));
  },
  autocomplete: respondWithGyms,
};
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -34,7 +34,16 @@ import {
   type RenderedPost,
   type ShrinkableField,
 } from './party-post.js';
-import { fitItems, LIMITS, memberName, plain, timestamp, titleCase, truncate } from './text.js';
+import {
+  fitItems,
+  LIMITS,
+  memberName,
+  plain,
+  plainLines,
+  timestamp,
+  titleCase,
+  truncate,
+} from './text.js';
 
 const HOUR = 3_600_000;
 
@@ -259,8 +268,9 @@ export function gymNotes(gym: PostGym | undefined, exRaid = false): string[] {
   if (gym && !exRaid) {
     if (isEliteGym(gym)) notes.push('This is an elite raid gym.');
   }
-  // A notice of nothing but white space is empty once plain; Discord refuses an empty field value.
-  const notice = gym?.notice ? plain(gym.notice) : '';
+  // A notice of nothing but white space is empty once plain; Discord refuses an empty field
+  // value. It is written as a paragraph (`/gym edit`), and its lines stay lines.
+  const notice = gym?.notice ? plainLines(gym.notice) : '';
   if (notice !== '') notes.push(notice);
   return notes;
 }
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/gyms/edit-move.test.ts src/render/raid-post.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff ea3b862 -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/gyms/controls.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/edit.ts src/commands/gyms/elite.ts src/commands/gyms/index.ts src/commands/gyms/move.ts src/render/raid-post.test.ts src/render/raid-post.ts
npm run typecheck; npx eslint src/commands/gyms/controls.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/edit.ts src/commands/gyms/elite.ts src/commands/gyms/index.ts src/commands/gyms/move.ts src/render/raid-post.test.ts src/render/raid-post.ts   # both clean; the full check runs after the last task
git add src/commands/gyms/controls.ts src/commands/gyms/edit-move.test.ts src/commands/gyms/edit.ts src/commands/gyms/elite.ts src/commands/gyms/index.ts src/commands/gyms/move.ts src/render/raid-post.test.ts src/render/raid-post.ts
git commit -F <a file with the message below>
```

The commit message:

```
Gym commands: /gym edit, /gym move, /gym elite

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: the typecheck, the lint of these files and the tests of Step 3 green.

---

### Task 7: The gym command: delete, refresh, export; clearing the image cache

**Files:**
- Create: `src/commands/admin/clear-image-cache.ts`, `src/commands/gyms/delete-export.test.ts`, `src/commands/gyms/delete.ts`, `src/commands/gyms/upkeep.ts`
- Modify: `src/commands/admin/index.ts`, `src/commands/admin/self-roles.test.ts`, `src/commands/gyms/controls.ts`, `src/commands/gyms/index.ts`, `src/discord/deploy.test.ts`, `src/discord/deploy.ts`, `src/services/static-maps.test.ts`, `src/services/static-maps.ts`, `test/support/providers.ts`

**Interfaces:**
- Consumes: Tasks 5 and 6; `MapProvider`; `src/commands/admin/index.ts`; `src/discord/deploy.ts`.
- Produces: `/gym delete gym` (`delete.ts`: the question with what goes with the gym, decided again on Delete), `/gym refresh gym` and `/gym export` (`upkeep.ts`); `/admin clear-image-cache` (`MapProvider.clear()`); the test that no command's definition exceeds Discord's 8,000 characters (`MAX_COMMAND_CHARACTERS` in `deploy.ts`).

Reference commit of the prototype for this task: `a7670fe`.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/admin/self-roles.test.ts`:

```diff
--- a/src/commands/admin/self-roles.test.ts
+++ b/src/commands/admin/self-roles.test.ts
@@ -77,6 +77,7 @@ describe('/admin self-roles', () => {
     expect(paths(ctx.config)).toEqual([
       'setup-forums',
       'save-party',
+      'clear-image-cache',
       'self-roles add',
       'self-roles remove',
       'self-roles list',
@@ -90,7 +91,7 @@ describe('/admin self-roles', () => {
         features: { ...ctx.config.settings.features, roles: false },
       },
     };
-    expect(paths(off)).toEqual(['setup-forums', 'save-party']);
+    expect(paths(off)).toEqual(['setup-forums', 'save-party', 'clear-image-cache']);
   });
 
   it('is for staff, and answers privately', async () => {
```

Create `src/commands/gyms/delete-export.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { STAFF_PLACE, UPDATES_CHANNEL } from '../../../test/support/gym-admin.js';
import {
  answerOf,
  buttonId,
  buttonsOf,
  embedOf,
  gymCommandsWith,
  MEMBER,
  MODERATOR,
} from '../../../test/support/gym-commands.js';
import { WEST_CHANNEL } from '../../../test/support/gyms.js';
import { ALICE, asTrain, BOB, REPORTER } from '../../../test/support/parties.js';
import { PartyStatus } from '../../domain/party/status.js';
import { LIMITS } from '../../render/text.js';

type Made = Awaited<ReturnType<typeof gymCommandsWith>>;

async function raidAt(made: Made, gymId: number) {
  const gym = made.directory.get(gymId);
  if (!gym) throw new Error('no gym');
  const raid = await made.service.reportRaid({
    gym,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: { level: 'T5', shadow: false },
    boss: null,
  });
  if (raid.kind !== 'created') throw new Error('no raid');
  return raid.party;
}

async function trainOn(made: Made, route: readonly number[]) {
  const created = await made.service.createTrain({
    name: 'Saturday legendaries',
    creatorId: REPORTER,
    regionChannelId: WEST_CHANNEL,
  });
  if (created.kind !== 'created') throw new Error('no train');
  for (const gymId of route) {
    await made.trains.addStop(created.party.id, { id: REPORTER, name: 'Rae' }, gymId);
  }
  await made.settle();
  return created.party;
}

describe('/gym delete', () => {
  it('asks first, with what goes with the gym', async () => {
    const made = await gymCommandsWith();
    await trainOn(made, [1, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    made.routes.add(BOB, 1, 'Only', [6]);
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);

    const asked = await made.use('delete', { gym: 'id:6' });

    expect(asked.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    const question = answerOf(asked);
    expect(question.content?.split('\n')).toEqual([
      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.',
      'With it go:',
      '- its stop on the route of 1 active train',
      '- its stop on 2 saved routes',
      '- the gym target of 1 member',
    ]);
    expect(buttonsOf(question).map(([label]) => label)).toEqual(['Delete', 'Keep']);
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('says so when nothing refers to the gym', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    expect(question.content).toBe(
      'Delete **Maple Leaf Mosaic** (#6)? This cannot be undone.\nNothing refers to it.',
    );
  });

  it('deletes on Delete: the gym, its stops, its saved routes and its targets', async () => {
    const made = await gymCommandsWith();
    const train = await trainOn(made, [1, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));

    const pressed = await made.press(buttonId(question, 'Delete'));
    await made.settle();

    expect(pressed.deferUpdate).toHaveBeenCalledTimes(1);
    expect(answerOf(pressed)).toEqual({
      content: [
        'Deleted **Maple Leaf Mosaic** (#6).',
        'With it went:',
        '- its stop on the route of 1 active train',
        '- its stop on 1 saved route',
        '- the gym target of 1 member',
      ].join('\n'),
      embeds: [],
      components: [],
    });
    expect(made.gymStore.row(6)).toBeUndefined();
    expect(made.directory.get(6)).toBeUndefined();
    expect(asTrain(made.store.get(train.id)).train.route).toEqual([1]);
    // The post of the train says why, and names nobody as a mention.
    const said = made.gateway
      .messagesIn(train.forumPostId ?? '')
      .map((message) => message.message.content ?? '');
    expect(said).toContain("**Maple Leaf Mosaic** was removed from Pine's gym list.");
    expect(made.routes.rows.map((row) => row.gyms)).toEqual([[1]]);
    expect(made.gymTargets.rows).toEqual([]);
    expect(made.gateway.messagesIn(UPDATES_CHANNEL).map((m) => m.message)).toEqual([
      { content: '**Maple Leaf Mosaic** (#6) was removed from the gym list.' },
    ]);
    // The gym is no longer offered or accepted.
    const typed = await made.typing('show', 'maple leaf mosaic');
    const offered = typed.respond.mock.calls[0]?.[0] ?? [];
    expect(offered.some((choice) => choice.value === 'id:6')).toBe(false);
    expect(sent((await made.use('show', { gym: 'id:6' })).followUp).content).toBe(
      'There is no gym #6.',
    );
  });

  it('keeps the gym on Keep', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    const pressed = await made.press(buttonId(question, 'Keep'));
    expect(sent(pressed.update)).toEqual({
      content: 'The gym was kept.',
      embeds: [],
      components: [],
    });
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('refuses while an active raid is at the gym, with a link to its post', async () => {
    const made = await gymCommandsWith();
    const raid = await raidAt(made, 6);
    const used = await made.use('delete', { gym: 'id:6' });
    expect(sent(used.followUp).content).toBe(
      `A raid is at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym cannot be ` +
        'deleted while a raid is there: wait until the raid is over, or close it with ' +
        '`/delete` in its post.',
    );
    expect(used.editReply).not.toHaveBeenCalled();
  });

  it('decides again on Delete: a raid that was reported since the question keeps the gym', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    const raid = await raidAt(made, 6);

    const pressed = await made.press(buttonId(question, 'Delete'));

    expect(answerOf(pressed).content).toBe(
      `A raid was reported at **Maple Leaf Mosaic** (#6): <#${raid.forumPostId ?? ''}>. A gym ` +
        'cannot be deleted while a raid is there: wait until the raid is over, or close it ' +
        'with `/delete` in its post.',
    );
    expect(made.gymStore.row(6)).toBeDefined();
  });

  it('counts on Delete what is there then, not what the question listed', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    expect(question.content).toContain('Nothing refers to it.');
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    const pressed = await made.press(buttonId(question, 'Delete'));
    expect(answerOf(pressed).content).toBe(
      'Deleted **Maple Leaf Mosaic** (#6).\nWith it went:\n- its stop on 1 saved route',
    );
    expect(made.routes.rows.map((row) => row.gyms)).toEqual([[1]]);
  });

  it('says so when the gym is gone already, and when the clean-up fails', async () => {
    const made = await gymCommandsWith();
    const first = answerOf(await made.use('delete', { gym: 'id:6' }));
    const second = answerOf(await made.use('delete', { gym: 'id:6' }));
    await made.press(buttonId(first, 'Delete'));
    expect(answerOf(await made.press(buttonId(second, 'Delete'))).content).toBe(
      'That gym no longer exists.',
    );

    const question = answerOf(await made.use('delete', { gym: 'id:3' }));
    made.routes.failing = new Error('database is down');
    expect(answerOf(await made.press(buttonId(question, 'Delete'))).content).toBe(
      'I could not delete the gym, and nothing was changed. Try again in a moment; the log ' +
        'says what failed.',
    );
    expect(made.gymStore.row(3)).toBeDefined();
  });

  it('names a train it could not take the gym off, and counts what really went', async () => {
    const made = await gymCommandsWith();
    const broken = await trainOn(made, [1, 6]);
    made.routes.add(ALICE, 1, 'Loop', [6, 1]);
    // One member with the target in two servers is one member.
    await made.gymTargets.add(ALICE, made.gateway.guildId, 6);
    await made.gymTargets.add(ALICE, '412345678901234568', 6);
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    expect(question.content).toContain('- the gym target of 1 member');
    // The gym goes; the train cannot be stored afterwards.
    const remove = made.removal.remove.bind(made.removal);
    made.removal.remove = async (id) => {
      const counts = await remove(id);
      made.storage.failing = new Error('party table is locked');
      return counts;
    };

    const pressed = await made.press(buttonId(question, 'Delete'));
    made.storage.failing = undefined;

    expect(answerOf(pressed).content?.split('\n')).toEqual([
      'Deleted **Maple Leaf Mosaic** (#6).',
      'With it went:',
      '- its stop on 1 saved route',
      '- the gym target of 1 member',
      `I could not take it off the route of <#${broken.forumPostId ?? ''}>: use \`/route remove\` in its post.`,
    ]);
    expect(made.directory.get(6)).toBeUndefined();
  });

  it('does not write "expired" over the answer when Delete is pressed twice', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    const first = await made.press(buttonId(question, 'Delete'));
    const second = await made.press(buttonId(question, 'Delete'));
    expect(answerOf(first).content).toBe('Deleted **Maple Leaf Mosaic** (#6).');
    expect(second.deferUpdate).toHaveBeenCalledTimes(1);
    expect(second.update).not.toHaveBeenCalled();
    expect(second.editReply).not.toHaveBeenCalled();
  });

  it('lets only the staff member who asked delete', async () => {
    const made = await gymCommandsWith();
    const question = answerOf(await made.use('delete', { gym: 'id:6' }));
    const other = await made.press(buttonId(question, 'Delete'), { userId: '200000000000000007' });
    expect(sent(other.reply).content).toBe('That is somebody else’s question.');
    const member = await made.press(buttonId(question, 'Delete'), {
      userId: MEMBER,
      roleNames: [],
    });
    expect(sent(member.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(made.gymStore.row(6)).toBeDefined();
  });
});

describe('/gym refresh', () => {
  it('asks Google again and says what it got', async () => {
    const made = await gymCommandsWith();
    const refreshed = await made.use('refresh', { gym: 'id:2' });
    const answer = answerOf(refreshed);
    expect(answer.content?.split('\n')).toEqual([
      '**Old Stone Fountain** (#2):',
      'Its address was fetched anew.',
      'Its nearby places were fetched anew.',
    ]);
    const fields = Object.fromEntries((embedOf(answer).fields ?? []).map((f) => [f.name, f.value]));
    expect(fields['Nearby places (from Google)']).toBe('Corner Bakery Maple Dental');
    expect(fields['Address (from Google)']).toBe('**route**: Test Road\n**locality**: Pinewood');

    expect(
      answerOf(await made.use('refresh', { gym: 'id:2' }))
        .content?.split('\n')
        .slice(1),
    ).toEqual([
      'Its address is as before: Google says the same.',
      'Its nearby places are as before: Google says the same.',
    ]);
  });

  it('says that there is no key, and what failed', async () => {
    const made = await gymCommandsWith();
    made.geo.failing = { geocode: 'failed', places: 'denied' };
    expect(
      answerOf(await made.use('refresh', { gym: 'id:2' }))
        .content?.split('\n')
        .slice(1),
    ).toEqual([
      'Its address could not be fetched (the log says why). It keeps what it had.',
      'Its nearby places could not be fetched: Google refuses the API key for the Places API ' +
        '(New), which has to be enabled for the key’s project. It keeps what it had.',
    ]);
    made.geo.enabled = false;
    expect(
      answerOf(await made.use('refresh', { gym: 'id:2' }))
        .content?.split('\n')
        .slice(1),
    ).toEqual(['No Google API key is configured, so there is nothing to fetch.']);
    expect(made.gymStore.row(2)?.places).toBe('Riverside Plaza, Cafe Luna');
  });
});

describe('/gym export', () => {
  it('attaches one file with the gyms that lie in a region of this server, by name', async () => {
    const made = await gymCommandsWith();
    await made.admin.edit(3, { name: 'The "Old"\tChurch' }, MODERATOR);
    const exported = await made.use('export');
    const answer = answerOf(exported);
    expect(answer.content).toBe('The 11 gyms that lie in a region of this server.');
    const [file] = (answer.files ?? []) as { name: string; attachment: Buffer }[];
    expect(file?.name).toBe('gyms.tsv');
    const lines = file?.attachment.toString('utf8').split('\n') ?? [];
    expect(lines[0]).toBe('Gym Name\tLongitude\tLatitude');
    expect(lines.slice(1, 4)).toEqual([
      'Café Élan Fresco\t-79.92\t40.05',
      'Harbor Lighthouse Mural\t-79.99\t40.05',
      'Maple Leaf Mosaic\t-80.03\t40.03',
    ]);
    expect(lines).toContain("The 'Old' Church\t-80.07\t40.07");
    // Gym 10 lies in no region: it is not exported. Eleven gyms, the header, the last line feed.
    expect(lines).toHaveLength(13);
    expect(lines.some((line) => line.startsWith('Lakeview Trailhead'))).toBe(false);
  });

  it('says so when the server has no regions, or no gym in them', async () => {
    const made = await gymCommandsWith();
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]) {
      await made.admin.delete(id, { id: MODERATOR }, STAFF_PLACE);
    }
    expect(sent((await made.use('export')).followUp).content).toBe(
      'No gym lies in a region of this server.',
    );
    made.regions.rows = [];
    expect(sent((await made.use('export')).followUp).content).toBe(
      'This server has no regions yet.',
    );
  });
});

describe('/admin clear-image-cache', () => {
  it('deletes the cached map pictures and says how many', async () => {
    const made = await gymCommandsWith();
    let left = 7;
    Object.assign(made.ctx, {
      maps: {
        ...made.ctx.maps,
        clear: () => {
          const deleted = left;
          left = 0;
          return Promise.resolve(deleted);
        },
      },
    });
    const run = async () => {
      const interaction = fakeChatInput({
        commandName: 'admin',
        subcommand: 'clear-image-cache',
        userId: MODERATOR,
        roleNames: ['Bot Developer'],
      });
      await made.router.handle(interaction as never);
      return interaction;
    };
    const first = await run();
    expect(first.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(first.editReply).toHaveBeenCalledWith({ content: 'Deleted 7 cached map pictures.' });
    expect((await run()).editReply).toHaveBeenCalledWith({
      content: 'There were no cached map pictures to delete.',
    });
  });

  it('is for staff', async () => {
    const made = await gymCommandsWith();
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'clear-image-cache',
      userId: MEMBER,
    });
    await made.router.handle(interaction as never);
    expect(sent(interaction.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
  });
});

describe('/gym: what it says fits one message', () => {
  it('holds its questions and answers to 2,000 characters whatever the gyms are called', async () => {
    const made = await gymCommandsWith();
    // Five gyms on one spot, each with the longest name and nickname a row can hold, all of it
    // Markdown that doubles when it is escaped; and a server with many regions.
    const nasty = '*_~`|'.repeat(51);
    const spot = { lat: 40.015, lon: -80.015 };
    for (let n = 0; n < 5; n++) {
      const gym = await made.gymStore.create({ name: nasty, ...spot, nickname: nasty });
      await made.directory.refreshGym(gym.id);
    }
    const square = made.regions.rows[0]?.bounds ?? null;
    for (let n = 0; n < 60; n++) {
      made.regions.rows.push({
        id: 100 + n,
        guildId: 1,
        channelId: String(200000000000000000n + BigInt(n)),
        description: null,
        bounds: square,
        forumChannelId: null,
        summaryMessageId: null,
      });
    }
    await made.directory.load();

    const name = '*'.repeat(100);
    const add = answerOf(await made.use('add', { location: '40.015, -80.015', name }));
    expect(add.content?.length).toBeLessThanOrEqual(LIMITS.content);
    expect(add.content).toContain('5 other gyms lie within 10 metres of that place:');
    expect(add.content).toContain('- …and 2 more');
    expect(add.content).toMatch(/…and \d+ more\.\n/);

    const move = answerOf(await made.use('move', { gym: '#13', location: '40.01505, -80.015' }));
    expect(move.content?.length).toBeLessThanOrEqual(LIMITS.content);
    // Nothing of it was cut off by the limit: it names the gym by its number, lists three of
    // the gyms beside the new place with theirs, and ends with its last line.
    const lines = move.content?.split('\n') ?? [];
    expect(lines[0]).toMatch(
      /, #13\) from \[40\.015, -80\.015\]\(.+\) to \[40\.01505, -80\.015\]\(.+\)\?$/,
    );
    expect(lines.slice(1)).toEqual([
      '4 other gyms lie within 10 metres of that place:',
      expect.stringMatching(/, #14\), 6 m away$/) as string,
      expect.stringMatching(/, #15\), 6 m away$/) as string,
      expect.stringMatching(/, #16\), 6 m away$/) as string,
      '- …and 1 more',
    ]);
    expect(buttonsOf(move).map(([label]) => label)).toEqual(['Move anyway', 'Cancel']);

    const remove = answerOf(await made.use('delete', { gym: '#13' }));
    expect(remove.content?.length).toBeLessThanOrEqual(LIMITS.content);
    // The number is what tells such gyms apart: it is never cut away.
    expect(remove.content).toContain(', #13)? This cannot be undone.');

    const shown = answerOf(await made.use('show', { gym: '#13' }));
    expect(shown.content?.length).toBeLessThanOrEqual(LIMITS.content);
    const refused = await made.use('show', { gym: '*_~`|' });
    expect(sent(refused.followUp).content?.length).toBeLessThanOrEqual(LIMITS.content);
  });
});
```

Apply to `src/discord/deploy.test.ts`:

```diff
--- a/src/discord/deploy.test.ts
+++ b/src/discord/deploy.test.ts
@@ -7,7 +7,12 @@ import { describe, expect, it } from 'vitest';
 import { createTestContext } from '../../test/support/test-context.js';
 import { commands } from '../commands/index.js';
 import { enabledCommands, type CommandModule } from './command.js';
-import { buildCommandPayload, MAX_COMMANDS, parseDeployArgs } from './deploy.js';
+import {
+  buildCommandPayload,
+  MAX_COMMAND_CHARACTERS,
+  MAX_COMMANDS,
+  parseDeployArgs,
+} from './deploy.js';
 
 const stub = (name: string): CommandModule => ({
   data: { name, toJSON: () => ({ name, description: name }) },
@@ -51,6 +56,58 @@ describe('buildCommandPayload', () => {
     expect(help?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
   });
 
+  it('keeps every command within the 8,000 characters Discord allows one command', () => {
+    const { ctx } = createTestContext();
+    // What Discord counts: every name, description and choice value, over all subcommands.
+    const size = (option: {
+      name: string;
+      description?: string;
+      options?: unknown[];
+      choices?: { name: string; value: string | number }[];
+    }): number =>
+      option.name.length +
+      (option.description?.length ?? 0) +
+      (option.choices ?? []).reduce(
+        (sum, choice) => sum + choice.name.length + String(choice.value).length,
+        0,
+      ) +
+      ((option.options ?? []) as Parameters<typeof size>[0][]).reduce(
+        (sum, inner) => sum + size(inner),
+        0,
+      );
+    // With everything switched on: the largest each command can be.
+    const everything = {
+      ...ctx.config,
+      settings: {
+        ...ctx.config.settings,
+        features: { ...ctx.config.settings.features, roles: true, notifications: true },
+      },
+    };
+    const sizes = buildCommandPayload(enabledCommands(commands, everything)).map(
+      (command) => [command.name, size(command)] as const,
+    );
+    expect(sizes.find(([name]) => name === 'gym')?.[1]).toBeGreaterThan(500);
+    for (const [name, characters] of sizes) {
+      expect(characters, `/${name}`).toBeLessThanOrEqual(MAX_COMMAND_CHARACTERS);
+    }
+    // The measure counts what it should: a command built to be too large is found.
+    const huge = new SlashCommandBuilder().setName('huge').setDescription('x'.repeat(100));
+    for (let n = 0; n < 25; n++) {
+      huge.addSubcommand((sub) =>
+        sub
+          .setName(`sub${n}`)
+          .setDescription('d'.repeat(100))
+          .addStringOption((option) =>
+            option
+              .setName('choice')
+              .setDescription('d'.repeat(100))
+              .addChoices({ name: 'n'.repeat(100), value: 'v'.repeat(100) }),
+          ),
+      );
+    }
+    expect(size(huge.toJSON())).toBeGreaterThan(MAX_COMMAND_CHARACTERS);
+  });
+
   it('rejects duplicate names', () => {
     expect(() => buildCommandPayload([stub('a'), stub('a')])).toThrow(/Duplicate command \/a/);
   });
```

Apply to `src/services/static-maps.test.ts`:

```diff
--- a/src/services/static-maps.test.ts
+++ b/src/services/static-maps.test.ts
@@ -100,4 +100,17 @@ describe('StaticMaps', () => {
     expect(entries[0]?.reason).toBe('Google Static Maps warned: Error geocoding: quota exceeded');
     expect(JSON.stringify(entries)).not.toContain('SECRET-KEY');
   });
+
+  it('deletes every picture it keeps and says how many, and downloads anew afterwards', async () => {
+    const { maps: service } = maps('k');
+    const gym = { id: 12, lat: 40.05, lon: -80.05 };
+    await service.gym(gym);
+    await service.gym({ id: 13, lat: 40.06, lon: -80.05 });
+    await service.region(west());
+    expect(await service.clear()).toBe(3);
+    expect(await service.clear()).toBe(0);
+    expect(urls).toHaveLength(3);
+    await service.gym(gym);
+    expect(urls).toHaveLength(4);
+  });
 });
```

Apply to `test/support/providers.ts`:

```diff
--- a/test/support/providers.ts
+++ b/test/support/providers.ts
@@ -49,6 +49,7 @@ export function mapsFixture(): MapProvider {
     enabled: false,
     gym: () => Promise.resolve(undefined),
     region: () => Promise.resolve(undefined),
+    clear: () => Promise.resolve(0),
   };
 }
 
```

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/commands/gyms/delete-export.test.ts src/discord/deploy.test.ts src/services/static-maps.test.ts`
Expected: FAIL (the code of Step 2 does not exist yet: type errors or failing assertions in the new and changed tests).

- [ ] **Step 2: The implementation**

Create `src/commands/admin/clear-image-cache.ts`:

```ts
import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { count } from '../../render/text.js';

/**
 * `/admin clear-image-cache`: deletes the map pictures the bot keeps of gyms and regions. A
 * picture is named by what it shows, so a moved gym or a redrawn region gets a new one by
 * itself; what this removes is what nothing names any more (pictures of deleted and moved gyms
 * and of old outlines), at the cost of downloading the others once more.
 */
export const clearImageCache: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('clear-image-cache')
    .setDescription('Delete the map pictures I keep of gyms and regions'),
  help: {
    details:
      'I keep every map picture I download. Pictures of gyms that were deleted or moved and ' +
      'of regions that were redrawn are never used again and stay until this is run. The ' +
      'pictures still in use are downloaded again when they are next shown.',
    examples: ['/admin clear-image-cache'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const deleted = await ctx.maps.clear();
    await interaction.editReply({
      content:
        deleted === 0
          ? 'There were no cached map pictures to delete.'
          : `Deleted ${count(deleted, 'cached map picture')}.`,
    });
  },
};
```

Apply to `src/commands/admin/index.ts`:

```diff
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -1,6 +1,7 @@
 import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
+import { clearImageCache } from './clear-image-cache.js';
 import { saveParty } from './save-party.js';
 import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
 import { setupForums } from './setup-forums.js';
@@ -9,7 +10,12 @@ import { setupForums } from './setup-forums.js';
  * The subcommands of `/admin`. Each lives in a file of its own in this folder; a later plan
  * adds one by appending it here (and its group, if it has one, to `groups` below).
  */
-const parts: readonly SubcommandPart[] = [setupForums, saveParty, ...selfRoleParts];
+const parts: readonly SubcommandPart[] = [
+  setupForums,
+  saveParty,
+  clearImageCache,
+  ...selfRoleParts,
+];
 
 /** `/admin`: for staff. Discord offers it only to members who may manage the server. */
 export const admin = commandGroup({
```

Apply to `src/commands/gyms/controls.ts`:

```diff
--- a/src/commands/gyms/controls.ts
+++ b/src/commands/gyms/controls.ts
@@ -4,6 +4,7 @@ import { UserError } from '../../discord/errors.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { addAnswers, addForms, addOpeners } from './add.js';
+import { deleteAnswers } from './delete.js';
 import { editForms, editOpeners } from './edit.js';
 import { moveAnswers } from './move.js';
 import {
@@ -36,6 +37,7 @@ const CANCELLED: Readonly<Record<PendingGym['what'], string>> = {
 const ANSWERS: Readonly<Record<string, ButtonAnswer>> = {
   ...addAnswers,
   ...moveAnswers,
+  ...deleteAnswers,
 };
 const OPENERS: Readonly<Record<string, FormOpener>> = { ...addOpeners, ...editOpeners };
 const FORMS: Readonly<Record<string, FormAnswer>> = { ...addForms, ...editForms };
```

Create `src/commands/gyms/delete.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonStyle,
  SlashCommandSubcommandBuilder,
  type ButtonBuilder,
} from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import type { RaidParty } from '../../domain/party/party.js';
import { gymWithId } from '../../render/gym-view.js';
import { count } from '../../render/text.js';
import { actingMember } from '../parties/reply.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { button, content, GYM_GONE, pendingGyms, staffPlace, type ButtonAnswer } from './shared.js';

/** Why a gym with a raid stays, with the raid's post. */
function raidThere(gym: string, raid: RaidParty, when: string): string {
  const post = raid.forumPostId === null ? '' : `: <#${raid.forumPostId}>`;
  return (
    `A raid ${when} at ${gym}${post}. A gym cannot be deleted while a raid is there: wait ` +
    'until the raid is over, or close it with `/delete` in its post.'
  );
}

/** What goes with a gym, as lines under `heading`; one line when nothing does. */
function goesWith(
  references: { trains: number; routes: number; targets: number },
  heading: string,
): string[] {
  const lines = [
    ...(references.trains > 0
      ? [`- its stop on the route of ${count(references.trains, 'active train')}`]
      : []),
    ...(references.routes > 0 ? [`- its stop on ${count(references.routes, 'saved route')}`] : []),
    ...(references.targets > 0
      ? [`- the gym target of ${count(references.targets, 'member')}`]
      : []),
  ];
  return lines.length === 0 ? [] : [heading, ...lines];
}

/**
 * `/gym delete`: takes a gym out of the gym list, with what refers to it. Refused while an
 * active raid is there; otherwise the staff member is asked, with what goes with the gym.
 */
export const deleteGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('delete')
      .setDescription('Delete a gym from the gym list, with what refers to it'),
  ),
  help: {
    details:
      'For a gym that no longer exists in the game. I ask first and say what goes with it: ' +
      'it is taken off the route of every active train (the train’s post says why) and off ' +
      'every saved route, and members who have it as a gym target lose that target. It ' +
      'cannot be deleted while a raid is there. A gym that was only put down wrongly is ' +
      'moved with `/gym move` instead.',
    examples: ['/gym delete gym:Big Fountain'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const gym = chosenGym(interaction, ctx);
    const references = await ctx.gymAdmin.references(gym.id);
    const [raid] = references.raids;
    if (raid) throw new UserError(raidThere(gymWithId(gym), raid, 'is'));
    const token = pendingGyms.put(interaction.user.id, { what: 'delete', gymId: gym.id });
    const going = goesWith(references, 'With it go:');
    await interaction.editReply({
      content: content([
        `Delete ${gymWithId(gym)}? This cannot be undone.`,
        ...(going.length === 0 ? ['Nothing refers to it.'] : going),
      ]),
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(token, 'delete', 'Delete', ButtonStyle.Danger),
          button(token, 'cancel', 'Keep', ButtonStyle.Secondary),
        ),
      ],
    });
  },
  autocomplete: respondWithGyms,
};

/**
 * Delete was pressed under the question. Everything is decided again now (the question may be
 * minutes old), by the service, and what the answer counts is what really went; the answer
 * takes the place of the question. A train that still has the gym on its route, because it
 * could not be changed, is named with its post.
 */
export const deleteAnswers: Readonly<Record<string, ButtonAnswer>> = {
  'delete:delete': async (interaction, ctx, request) => {
    if (request.what !== 'delete') return;
    const { gymId } = request;
    const before = ctx.gyms.get(gymId);
    const place = await staffPlace(interaction, ctx);
    const outcome = await ctx.gymAdmin.delete(gymId, actingMember(interaction), place);
    let lines: string[];
    switch (outcome.kind) {
      case 'gone':
        lines = [GYM_GONE];
        break;
      case 'raid-there':
        lines = [raidThere(before ? gymWithId(before) : 'that gym', outcome.raid, 'was reported')];
        break;
      case 'failed':
        lines = [
          'I could not delete the gym, and nothing was changed. Try again in a moment; the ' +
            'log says what failed.',
        ];
        break;
      case 'deleted':
        lines = [
          `Deleted ${gymWithId(outcome.gym)}.`,
          ...goesWith(outcome, 'With it went:'),
          ...outcome.unmended.map((train) =>
            train.forumPostId === null
              ? 'I could not take it off the route of a train that has no post yet.'
              : `I could not take it off the route of <#${train.forumPostId}>: use ` +
                '`/route remove` in its post.',
          ),
        ];
        break;
    }
    await interaction.editReply({ content: content(lines), embeds: [], components: [] });
  },
};
```

Apply to `src/commands/gyms/index.ts`:

```diff
--- a/src/commands/gyms/index.ts
+++ b/src/commands/gyms/index.ts
@@ -2,13 +2,24 @@ import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
 import { addGym } from './add.js';
+import { deleteGym } from './delete.js';
 import { editGym } from './edit.js';
 import { eliteGym } from './elite.js';
 import { moveGym } from './move.js';
 import { showGym } from './show.js';
+import { exportGyms, refreshGym } from './upkeep.js';
 
 /** The subcommands of `/gym`, each in a file of its own in this folder. */
-const parts: readonly SubcommandPart[] = [showGym, addGym, editGym, moveGym, eliteGym];
+const parts: readonly SubcommandPart[] = [
+  showGym,
+  addGym,
+  editGym,
+  moveGym,
+  eliteGym,
+  deleteGym,
+  refreshGym,
+  exportGyms,
+];
 
 /**
  * `/gym`: the gym list, for staff. Discord offers it only to members who may manage the server
```

Create `src/commands/gyms/upkeep.ts`:

```ts
import { AttachmentBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import { gymsTsv } from '../../domain/gyms/gym-export.js';
import { gymWithId } from '../../render/gym-view.js';
import { count } from '../../render/text.js';
import type { FetchOutcome } from '../../services/gym-upkeep.js';
import { chosenGym, respondWithGyms, withGymOption } from './gym-option.js';
import { GYM_GONE, gymViewMessage, staffPlace } from './shared.js';

/** The name of the file `/gym export` attaches. */
export const EXPORT_FILE = 'gyms.tsv';

/** What came of fetching one thing about a gym, as a sentence. */
function fetched(what: 'address' | 'nearby places', api: string, outcome: FetchOutcome): string {
  const several = what === 'nearby places';
  switch (outcome) {
    case 'updated':
      return `Its ${what} ${several ? 'were' : 'was'} fetched anew.`;
    case 'unchanged':
      return `Its ${what} ${several ? 'are' : 'is'} as before: Google says the same.`;
    case 'no-key':
      return `Its ${what} could not be fetched: no Google API key is configured.`;
    case 'denied':
      return (
        `Its ${what} could not be fetched: Google refuses the API key for the ${api}, which ` +
        'has to be enabled for the key’s project. It keeps what it had.'
      );
    case 'failed':
      return `Its ${what} could not be fetched (the log says why). It keeps what it had.`;
  }
}

/**
 * `/gym refresh`: asks Google about one gym again, now: its address and the places around it
 * (the legacy `geocode` and `gym-places` in one). Says what it got, for each of the two.
 */
export const refreshGym: SubcommandPart = {
  data: withGymOption(
    new SlashCommandSubcommandBuilder()
      .setName('refresh')
      .setDescription('Fetch the address and the nearby places of a gym from Google again'),
  ),
  help: {
    details:
      'A gym is also found by the street it is on and by the names of places around it, ' +
      'which I fetch from Google when a gym is added or moved. Use this when that failed, or ' +
      'when the surroundings of a gym have changed.',
    examples: ['/gym refresh gym:Big Fountain'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const chosen = chosenGym(interaction, ctx);
    const refreshed = await ctx.gymAdmin.refresh(chosen.id);
    if (!refreshed) throw new UserError(GYM_GONE);
    const { gym, geodata, places } = refreshed;
    const lines =
      geodata === 'no-key' && places === 'no-key'
        ? ['No Google API key is configured, so there is nothing to fetch.']
        : [
            fetched('address', 'Geocoding API', geodata),
            fetched('nearby places', 'Places API (New)', places),
          ];
    const place = await staffPlace(interaction, ctx);
    await interaction.editReply(
      await gymViewMessage(ctx, place, gym, [`${gymWithId(gym)}:`, ...lines]),
    );
  },
  autocomplete: respondWithGyms,
};

/**
 * `/gym export`: the gyms that lie in a region of this server as one file of tab-separated
 * values (name, longitude, latitude), for laying them over a map (Matt, 2026-10-13: one file,
 * without the legacy split by EX status).
 */
export const exportGyms: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('export')
    .setDescription('Get the gyms of this server as a file, for laying them over a map'),
  help: {
    details:
      `One file, \`${EXPORT_FILE}\`: a line per gym that lies in a region of this server, ` +
      'with its name, longitude and latitude, separated by tabs and sorted by name.',
    examples: ['/gym export'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const { guildId } = await staffPlace(interaction, ctx);
    const regions = ctx.regions
      .all()
      .filter((region) => guildId !== undefined && region.guildId === guildId);
    if (regions.length === 0) throw new UserError('This server has no regions yet.');
    // A gym in two regions that overlap is one line.
    const gyms = new Map<number, Gym>();
    for (const region of regions) {
      for (const gym of ctx.gyms.inRegion(region.channelId)) gyms.set(gym.id, gym);
    }
    if (gyms.size === 0) throw new UserError('No gym lies in a region of this server.');
    const file = new AttachmentBuilder(Buffer.from(gymsTsv([...gyms.values()]), 'utf8'), {
      name: EXPORT_FILE,
    });
    await interaction.editReply({
      content:
        gyms.size === 1
          ? 'The one gym that lies in a region of this server.'
          : `The ${count(gyms.size, 'gym')} that lie in a region of this server.`,
      files: [file],
    });
  },
};
```

Apply to `src/discord/deploy.ts`:

```diff
--- a/src/discord/deploy.ts
+++ b/src/discord/deploy.ts
@@ -6,6 +6,12 @@ import {
 import type { CommandModule } from './command.js';
 
 export const MAX_COMMANDS = 100;
+/**
+ * Discord allows one command this many characters over its name, its description and those of
+ * all its subcommands, options and choices (with the choices' values). `/admin` and `/gym`
+ * grow with every plan: a test keeps every command below it.
+ */
+export const MAX_COMMAND_CHARACTERS = 8_000;
 
 /**
  * What is sent to Discord to register the commands. A command that does not say where it may
```

Apply to `src/services/static-maps.ts`:

```diff
--- a/src/services/static-maps.ts
+++ b/src/services/static-maps.ts
@@ -16,6 +16,11 @@ export interface MapProvider {
   gym(gym: { id: number; lat: number; lon: number }): Promise<string | undefined>;
   /** Path of a picture of the region's outline; undefined when it cannot be had. */
   region(region: { id: number; bounds: readonly LatLon[] | null }): Promise<string | undefined>;
+  /**
+   * Deletes every picture that is kept (`/admin clear-image-cache`) and gives how many there
+   * were. Those still in use are downloaded again when they are next asked for.
+   */
+  clear(): Promise<number>;
 }
 
 /** Google answers a request it cannot fulfil (quota, bad key) with a picture of an error. */
@@ -48,6 +53,10 @@ export class StaticMaps implements MapProvider {
     return this.picture('regions', region.id, regionMap(region.bounds));
   }
 
+  clear(): Promise<number> {
+    return this.cache.clear();
+  }
+
   private picture(folder: string, id: number, map: StaticMap): Promise<string | undefined> {
     if (!this.enabled) return Promise.resolve(undefined);
     const query = staticMapQuery(map);
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/self-roles.test.ts src/commands/gyms/delete-export.test.ts src/discord/deploy.test.ts src/services/static-maps.test.ts`
Expected: PASS.

- [ ] **Step 4: Check the transcription, format, check, commit**

```bash
git diff a7670fe -- src test scripts data/settings.json   # must print nothing
npx prettier --check src/commands/admin/clear-image-cache.ts src/commands/admin/index.ts src/commands/admin/self-roles.test.ts src/commands/gyms/controls.ts src/commands/gyms/delete-export.test.ts src/commands/gyms/delete.ts src/commands/gyms/index.ts src/commands/gyms/upkeep.ts src/discord/deploy.test.ts src/discord/deploy.ts src/services/static-maps.test.ts src/services/static-maps.ts test/support/providers.ts
npm run check > check.log 2>&1; echo $?   # must print 0; then delete check.log
git add src/commands/admin/clear-image-cache.ts src/commands/admin/index.ts src/commands/admin/self-roles.test.ts src/commands/gyms/controls.ts src/commands/gyms/delete-export.test.ts src/commands/gyms/delete.ts src/commands/gyms/index.ts src/commands/gyms/upkeep.ts src/discord/deploy.test.ts src/discord/deploy.ts src/services/static-maps.test.ts src/services/static-maps.ts test/support/providers.ts
git commit -F <a file with the message below>
```

The commit message:

```
Gym commands: /gym delete, refresh and export; clear-image-cache

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Expected: `npm run check` green with 3,941 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-5a HEAD -- src test scripts data/settings.json` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other.
2. Whole-branch review (Opus, high effort) of the seven commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line (5A is built), the row for `/gym` being the gym administration, and conventions for `ctx.gymAdmin` (`GymAdminService`: one change at a time, the order of a deletion, `gym-gone`), `GeoGateway` and `GymUpkeep`, `readLocation`, the text rules of `src/domain/gyms/`, elite raid gyms (`isEliteGym`, the setting `elite-gym-raids`, nothing stored renamed), the guarded autocomplete of staff commands, the custom-id kind `gym`, the test twins (`MemoryGyms`, `FakeGeo`, `MemoryGymRemoval`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 5A" section (what staging must verify, what is left open, the items for 5B, 5C and Phase 8: the channel rename, the key's APIs). The spec ("as built" for row 204 of 4.2), the Gantt chart and memory.
5. `var/stage/settings.json` (the git-ignored staging copy) gets the renamed channel key before the bot is next started.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `npm run deploy-commands -- --guild <test server>` comes first (one new command, `/gym`, and a new subcommand of `/admin`). There is no migration. The test server's channel for raids at elite raid gyms must be renamed `elite-gym-raids` (or the name set in the staging settings). `GOOGLE_API_KEY` is set in `.env`, with the Geocoding API, Places API (New) and Maps Static API enabled and allowed for the key.

What no test can show (try these first):

- [ ] `/gym add` with the link Pokémon GO shares for a gym ("View in map", share): the question shows the right coordinates without a warning about a map's centre; with a link of the Google Maps app for a named place: either the place or the sentence that says to paste coordinates.
- [ ] After Add: within a minute `/gym show` has the address lines and the nearby places (Google was really asked; nothing about the key in the log).
- [ ] The form of `/gym edit` opens at once, pre-filled; a description with line breaks comes back as typed; "Open the form again" after a refused form shows what was typed.
- [ ] With the second account (not staff): `/gym` is not offered at all. With the second account given Manage Server but no staff role: `/gym` is offered, its `gym` option lists nothing, and the command is refused.

Staff:

- [ ] `/gym add location name` with plain coordinates: the question names the regions; Add; the answer shows the gym; the channel for bot updates gets the announcement; `/raid` finds the gym at once.
- [ ] Add again at the same place: the question names the gym within 10 metres and offers "Add anyway"; Cancel adds nothing. "Add with details…": the form; a keyword of more than 50 characters is refused with the button to open the form again.
- [ ] `/gym edit`: change only the notice; the post of a raid at that gym shows it, with its line breaks kept. Two forms open at once for different fields: neither undoes the other.
- [ ] `/gym move` by a few metres: "Moved … from … to … (N m)". By more than 500 metres: the question; Cancel leaves it. In a raid's post: the pointer to `/location`. With a raid at the gym: not refused, the post follows.
- [ ] `/gym elite gym eligible:True`: `/gym show` and a raid's post at the gym say "elite raid gym", the raid gets its copy in `elite-gym-raids`; `False` takes it away. Nothing says "EX" about a gym.
- [ ] `/gym delete` with an active raid at the gym: refused with the link. Without: the question lists the trains, saved routes and members; Delete; the train's post says the stop was removed and why; `/targets` of the second account no longer has it; the announcement in the channel for bot updates. A double click on Delete shows the result, not "expired".
- [ ] `/gym show` for a gym with every text filled: nothing cut wrongly, the map picture, the nearest gym with its distance. Typed `#<id>`, a bare number, a name that is not clear (the suggestions).
- [ ] `/gym refresh`: says what it got. `/gym export`: one file `gyms.tsv`, opens in a spreadsheet, the columns right.
- [ ] `/admin clear-image-cache`: the number of files; the next post has its map again.

To note down: how the question and the gym view read on a phone; how long `/gym add` takes to answer with a short link.
