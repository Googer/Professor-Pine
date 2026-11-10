# Phase 2B: Party Model, Table and Raid Durations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a raid is and does, without Discord: the `Party` table and its repository, the raid as plain data with every change as a pure function, what the clock does to it as one pure step, how long a raid lasts at a given moment (Raid Hour, Raid Day), and the active parties held in memory behind one serialised `update`.

**Architecture:** A party is an immutable plain object. `src/domain/party/` holds the type and functions that take a party and return a changed one together with what came of the change, or a reason why not; nothing there knows Discord or the database. `partyTick` is the scheduler as a function of party and time. `PartyRepository` stores a party as a row whose searchable facts are columns and whose remainder is one versioned JSON document. `PartyStore` keeps the active parties in memory, applies one change at a time per party, and writes before it replaces. Raid durations come from the settings, the weekly Raid Hour and an events feed read by `RaidEventService`.

**Tech Stack:** TypeScript 6.0, Kysely on mysql2 (MySQL 8), zod 4, Luxon, Vitest (unit, and Testcontainers for `*.db.test.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: sections 5.3 (scheduler), 5.5 (persistence), 4.1 (counts, completion question), 6.1 (new migrations), 6.7 (auto-set), 8 (testing). This is the second of the five Phase 2 plans (the table is at the top of `2026-10-10-phase-2a-command-framework.md`). Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, sections "Phase 2", "From Phase 1A" (Phase 2 items), "From Phase 1B-2" (times, groups), "From Phase 2A" (plan 2B). What the legacy bot did, with file and line references, is in the git-ignored digest `.superpowers/sdd/legacy-party-digest.md`; this plan's code already reflects it, so an implementer does not need it.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task. If something does not pass as written, suspect a transcription slip before suspecting the design.

**Amended during execution (2026-10-11).** The reviews of Tasks 1 to 3 changed the design, and Tasks 3 to 7 below show the code after those changes: the weekly Raid Hour is a fallback for a week in which the feed lists none, and the service keeps the past week of events (Task 1's fix commits `9c353a0` and `373f35d`, not shown in Task 1 below); one forum per region and a summary post tied to its forum (Task 2's fix commit `3a8a573`, not shown in Task 2 below); `raid.reportedHatched`, `setBoss` touching the times only when the kind of raid changes, and the attendee list in the state document (decisions 3, 6 and 12). Unit-test totals named in Tasks 4 to 7 are those of the branch with the fix commits.

## Decisions made in this plan

1. **A party is data; changes are functions.** `setAttendance(party, …)` and the others return `{ ok: true, party, …what came of it }` or `{ ok: false, reason }` (`Change<P, Extra>`). Nothing is mutated. The commands of plans 2C to 2E turn a `reason` into a sentence.
2. **The party's id is a UUID**, not a channel id (spec 5.5). `createdById` is always the real reporter; an anonymous report is the flag `anonymous`.
3. **A boss is stored by catalogue key**, or by the feed's name when the game master does not know it yet (`RaidBossRef`); the tier is always stored. An egg is a raid whose boss is null. Nothing else about the boss is frozen into the party (the legacy bot stored the whole boss object). Whether a raid without times is an egg or hatched is the stored fact `reportedHatched` (the report named a boss), not the boss: naming the boss an egg will have does not hatch it, as in the legacy bot.
4. **What the legacy bot did that is not copied** (digest section 9): `/done`, `/not-here` and `−1` from somebody who is not signed up are refused instead of adding them; a second report of an existing raid applies the reporter's automatic status only if they are not signed up yet; `CompletePending` carries the time from which silence counts as yes, so it survives a restart; a scheduled archiving is called off when a corrected time says the raid is still on; a raid that has ended by the clock no longer blocks a new report for its gym; the last possible time is worked out again on every change, also downwards.
5. **Counts** keep their meaning (spec 4.1): `number` is the head count including the member, 1 to `1 + maximumAdditionalAttendees`. `+1` from somebody not signed up signs them up as interested. The 20-player lobby is not enforced (the renderer of plan 2C may point it out).
6. **A change of the boss to another kind of raid** (standard to elite): an egg keeps its hatch time, a hatched raid keeps its end, and the other time is worked out again. Any other boss change leaves both times exactly as they are (working the hatch time out again from the end is not exact next to a Raid Hour). A raid that becomes elite loses its remote flags (elite raids are in person).
7. **Auto-set happens at hatch**, in the tick (spec 6.7: "eggs of that tier hatch as that boss automatically"), not at creation as in the legacy bot. A boss a member named is never replaced.
8. **The scheduler is one pure function, `partyTick`**, and it is idempotent: every rule compares the time with something the party itself records (`stageSeen`, a group's `startClearTime`, an attendee's `pendingUntil`, `deletionTime`). So the catch-up tick after a restart is the ordinary tick, and running it twice does nothing the second time.
9. **Raid durations in effect** (Matt, 2026-10-10: detect them, do not ask). A standard raid whose egg hatches during a Raid Hour stays 25 minutes, during a Raid Day 60 (`settings.raidEvents.hatchedDuration`). Raid Hours and Raid Days come from the events feed of ScrapedDuck (Leek Duck's event list; `pokemon-go-api` has no events file), and the weekly Raid Hour (Wednesday 18:00 to 19:00 in `settings.timezone`) is known without the feed. EX and elite raids keep their own durations; a duration a member set for a raid (`/duration`) wins over everything. Typed times are checked against the longest duration that can apply (`longestRaidDurations`), so a time that is right during an event is never refused. The feed is kept in memory only.
10. **Assumptions about events that Matt may want to correct** (each is one setting or one line): the event duration applies to every standard-kind raid hatching inside the event, whatever its tier; the incubation time is not changed by events; an event of the feed longer than 24 hours is ignored.
11. **New snowflake columns are `varchar(30)`** (as `Guild.snowflake` and `RaidBossOverride.createdBy`); times are `bigint` epoch milliseconds. No DATETIME column is added; the pool still gets `timezone: 'Z'` so that none can ever be read in the machine's zone.
12. **The state document has a version** (`v: 1`) and is validated when read. It holds the attendees as a list in the order they signed up: MySQL sorts the keys of a JSON object, which would reorder them by snowflake. A row this version cannot read (a train before Phase 3, a newer version, damage) is reported and left alone, never guessed at.
13. **`PartyStore.update` is the only way a party changes.** It runs one change at a time per party, writes the row, and only then replaces the party in memory. `change` is synchronous (a pure decision): anything that needs Discord happens before or after, in the service of plan 2C.
14. **Not in this plan:** anything that touches Discord (plan 2C on); `Region` rows by forum in memory and `regionChannelOf` for forums (plan 2C, with `/admin setup-forums`, which is what first sets a forum); `PartyAccessGrant` (plan 2E); trains and meetups (Phase 3: the table and the store already take them, the union `Party` does not yet); the end-to-end legacy parity fixture for `resolvePartyTime` (still open in the follow-ups file).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files other than `data/settings.json` (Task 1 adds one block to it). Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure: no `discord.js`, `kysely`, `node:fs`, network, `src/services/` or `src/db/` imports (type-only imports of `src/config/settings.js` are the existing exception).
- **Tests never use the network and never contact Discord.** Database tests (`*.db.test.ts`) use MySQL in Docker through `startMigratedDatabase()`; Docker must be running for Tasks 2 and 6.
- Database changes are additive only. `src/db/types.ts` is generated: never edit it by hand.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path.

## Review Focus

1. A member id that is also a property of every object (`constructor`, `toString`) or an attendee map read from JSON. Looking a member up must go by own properties only. Test: Task 4, "is not fooled by a member id that is a property of every object".
2. The bot was down while a raid hatched, ended and passed its grace time, with a meeting time and unanswered questions pending. One tick must apply all of it, and the next must do nothing. Tests: Task 5, "catches up in one tick after the bot was down, and is quiet on the next", "does both at once when the bot was down over the whole time", "completes those whose time to answer is up, also after a restart".
3. A row of `Party` that this version cannot read: a train, a newer state version, a damaged document, a mirror list that is not a list. The other parties must load, the row must be reported with its id, and nothing may be written to it. Tests: Task 6, "reports a row it cannot read instead of guessing" and "reports rows it cannot read and still lists the others"; Task 7, "logs rows it cannot read and carries on without them".
4. Two changes to one party at the same moment (two members press Join), and a database error in the middle of one. Neither change may be lost, and after the error the party in memory must be what is stored. Tests: Task 7, "applies changes to one party one after the other, each on the result of the last" and "keeps the party as it was when the write fails, and says so".
5. A raid reported or re-timed around an event boundary: an end time 20 minutes into a Raid Hour (the raid hatched before it), an egg hatching exactly when the event starts or ends, the feed unreachable on a Raid Hour Wednesday. Tests: Task 1, "keeps the usual duration for a raid that hatched before the event began", "finds an event of the feed from its first minute to just before its end", "knows the weekly Raid Hour without the feed".

---

## File Structure

```
src/config/settings.ts                       modify: the raidEvents block
data/settings.json, test/fixtures/settings.json   modify: the raidEvents block
src/domain/time/
  raid-events.ts          create: RaidEvent, parseRaidEventFeed
  raid-durations.ts       create: raidEventAt, raidDurationsAt, hatchTimeForEnd, longestRaidDurations
  party-time.ts           modify: resolvePartyTime takes the durations in effect
src/domain/party/
  party.ts                create: Party, Attendee, groups, Change, helpers
  raid.ts                 create: createRaid, times, boss, moves, gym, stage, saved
  attendance.ts           create: statuses, counts, completion question, groups, meeting time
  tick.ts                 create: partyTick, endParty
  party-state.ts          create: the JSON document: partyState, partyFromStored
src/db/
  kysely.ts               modify: timezone 'Z'
  migrations/2026_10_11_002_parties.ts   create: Party; Region.forumChannelId, summaryMessageId
  migrations/index.ts     modify: lists it
  types.ts                regenerate
  repositories/region-repository.ts   modify: forum columns, findById, findByForum, setForum,
                                               setSummaryMessage, regionsContaining
  repositories/party-repository.ts    create: PartyRepository, PartyStorage
src/services/
  raid-event-service.ts   create: RaidEventService, RaidEventProvider
  keyed-lock.ts           create: KeyedLock
  party-store.ts          create: PartyStore, PartyProvider
src/discord/guards.ts     modify: partyOf, requireParty
src/app-context.ts, src/app.ts   modify: ctx.raidEvents, ctx.parties
test/fixtures/raid-events.json   create: eleven events of the feed
test/support/
  raid-events.ts          create: readRaidEventFeed, raidEventsFixture
  parties.ts              create: testRaid, withAttendees, MemoryPartyStorage, partyStoreWith
  gyms.ts, test-context.ts   modify: forums of the invented regions; the new providers
```

---

### Task 1: Raid events and the durations in effect

**Files:**
- Create: `src/domain/time/raid-events.ts`, `src/domain/time/raid-events.test.ts`, `src/domain/time/raid-durations.ts`, `src/domain/time/raid-durations.test.ts`, `src/services/raid-event-service.ts`, `src/services/raid-event-service.test.ts`, `test/fixtures/raid-events.json`, `test/support/raid-events.ts`
- Modify: `src/config/settings.ts`, `data/settings.json`, `test/fixtures/settings.json`, `src/domain/time/party-time.ts`, `src/app-context.ts`, `src/app.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `RaidKind`, `resolvePartyTime` (`src/domain/time/party-time.ts`); `failureReason` (`src/services/failure-reason.ts`); `createTestLogger` (`test/support/test-logger.ts`).
- Produces:
  - `RaidEvent { kind: 'raid-hour' | 'raid-day'; name: string; start: number; end: number }`, `parseRaidEventFeed(json: unknown, zone: string): RaidEvent[]`.
  - `RaidDurationRules { settings; zone; events }`, `raidDurationRules(settings, events): RaidDurationRules`, `raidEventAt(time, rules): RaidEvent | undefined`, `raidDurationsAt(kind, hatchTime, rules): { incubation; hatched; event? }`, `hatchTimeForEnd(kind, endTime, rules): number`, `longestRaidDurations(kind, from, to, rules): { incubation; hatched }` (durations in minutes, times in epoch ms).
  - `PartyTimeRequest.durations?: { incubation: number; hatched: number }`.
  - `RaidEventService` (`events()`, `refresh()`, `start()`, `stop()`, `whenIdle()`), `RaidEventProvider { events(): readonly RaidEvent[] }`, `ctx.raidEvents`.
  - Test support: `readRaidEventFeed()`, `raidEventsFixture(zone?)`.
  - `settings.raidEvents: { url; refreshHours; weeklyRaidHour: { weekday; hour; minutes } | null; hatchedDuration: { 'raid-hour': number; 'raid-day': number } }`.

- [ ] **Step 1: The settings block**

Apply to `src/config/settings.ts`:

```diff
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -92,6 +92,25 @@ export const settingsSchema = z.strictObject({
       error: 'staleAfterHours must cover at least two refresh intervals',
       path: ['staleAfterHours'],
     }),
+  /** Raid Hours and Raid Days, during which a boss stays for another time than usual. */
+  raidEvents: z.strictObject({
+    /** Address of the events feed (`events.min.json` of ScrapedDuck). */
+    url: z.url({ protocol: /^https?$/ }),
+    refreshHours: z.number().int().min(1).max(168),
+    /**
+     * The Raid Hour of every week, which needs no feed: ISO weekday (1 is Monday, 3 Wednesday),
+     * the hour it starts in `timezone` and how long it lasts. Null when there is none.
+     */
+    weeklyRaidHour: z
+      .strictObject({
+        weekday: z.number().int().min(1).max(7),
+        hour: z.number().int().min(0).max(23),
+        minutes: z.number().int().min(1).max(1440),
+      })
+      .nullable(),
+    /** Minutes a boss stays when its egg hatches during such an event. */
+    hatchedDuration: z.strictObject({ 'raid-hour': minutes, 'raid-day': minutes }),
+  }),
 });
 
 export type Settings = z.output<typeof settingsSchema>;
```

Add the block to the end of **both** `data/settings.json` and `test/fixtures/settings.json` (the same change in each; shown for `data/settings.json`):

```diff
--- a/data/settings.json
+++ b/data/settings.json
@@ -93,5 +93,11 @@
     "refreshMinutes": 60,
     "staleAfterHours": 48,
     "announceChanges": false
+  },
+  "raidEvents": {
+    "url": "https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json",
+    "refreshHours": 6,
+    "weeklyRaidHour": { "weekday": 3, "hour": 18, "minutes": 60 },
+    "hatchedDuration": { "raid-hour": 25, "raid-day": 60 }
   }
 }
```

- [ ] **Step 2: The fixture feed and its test support**

Create `test/fixtures/raid-events.json` (eleven events of the feed as downloaded on 2026-10-11, without their pictures and details):

```json
[
  {
    "eventID": "october-communityday2026",
    "name": "Zorua Community Day",
    "eventType": "community-day",
    "heading": "Community Day",
    "start": "2026-10-10T14:00:00.000",
    "end": "2026-10-10T17:00:00.000"
  },
  {
    "eventID": "gbl-twilight-trails_great-league-mega-edition_ultra-league-mega-edition_master-league-mega-edition-split-2",
    "name": "Great League: Mega Edition, Ultra League: Mega Edition, and Master League: Mega Edition | Twilight Trails",
    "eventType": "go-battle-league",
    "heading": "GO Battle League",
    "start": "2026-10-06T20:00:00.000Z",
    "end": "2026-10-13T20:00:00.000Z"
  },
  {
    "eventID": "mega-blastoise-in-mega-raids-october-2026",
    "name": "Mega Blastoise in Mega Raids",
    "eventType": "raid-battles",
    "heading": "Raid Battles",
    "start": "2026-10-07T06:00:00.000",
    "end": "2026-10-13T22:00:00.000"
  },
  {
    "eventID": "yveltal-in-5-star-raid-battles-october-2026",
    "name": "Yveltal in 5-star Raid Battles",
    "eventType": "raid-battles",
    "heading": "Raid Battles",
    "start": "2026-10-07T06:00:00.000",
    "end": "2026-10-13T22:00:00.000"
  },
  {
    "eventID": "raidhour20261014",
    "name": "Dialga Raid Hour",
    "eventType": "raid-hour",
    "heading": "Raid Hour",
    "start": "2026-10-14T18:00:00.000",
    "end": "2026-10-14T19:00:00.000"
  },
  {
    "eventID": "pokemonspotlighthour2026-10-15",
    "name": "Stufful Spotlight Hour",
    "eventType": "pokemon-spotlight-hour",
    "heading": "Pok\u00e9mon Spotlight Hour",
    "start": "2026-10-15T18:00:00.000",
    "end": "2026-10-15T19:00:00.000"
  },
  {
    "eventID": "raidhour20261021",
    "name": "Palkia Raid Hour",
    "eventType": "raid-hour",
    "heading": "Raid Hour",
    "start": "2026-10-21T18:00:00.000",
    "end": "2026-10-21T19:00:00.000"
  },
  {
    "eventID": "raidhour20261028",
    "name": "Giratina (Origin Forme) Raid Hour",
    "eventType": "raid-hour",
    "heading": "Raid Hour",
    "start": "2026-10-28T18:00:00.000",
    "end": "2026-10-28T19:00:00.000"
  },
  {
    "eventID": "super-mega-raid-day-october-2026",
    "name": "Super Mega Raid Day",
    "eventType": "raid-day",
    "heading": "Raid Day",
    "start": "2026-10-31T14:00:00.000",
    "end": "2026-10-31T17:00:00.000"
  },
  {
    "eventID": "super-mega-raid-day-november-2026",
    "name": "Super Mega Raid Day",
    "eventType": "raid-day",
    "heading": "Raid Day",
    "start": "2026-11-28T14:00:00.000",
    "end": "2026-11-28T17:00:00.000"
  },
  {
    "eventID": "season-24-twilight-trails",
    "name": "Twilight Trails",
    "eventType": "season",
    "heading": "Season",
    "start": "2026-09-08T10:00:00.000",
    "end": "2026-12-01T10:00:00.000"
  }
]
```

Create `test/support/raid-events.ts`:

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRaidEventFeed, type RaidEvent } from '../../src/domain/time/raid-events.js';
import type { RaidEventProvider } from '../../src/services/raid-event-service.js';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');

/**
 * Eleven events of the feed as downloaded on 2026-10-11, without their pictures and details:
 * three Raid Hours (Wednesdays 14, 21 and 28 October 2026, 18:00 to 19:00), two Raid Days
 * (31 October and 28 November, 14:00 to 17:00) and six events of other kinds.
 */
export function readRaidEventFeed(): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, 'raid-events.json'), 'utf8'));
}

/** The Raid Hours and Raid Days of the fixture, read in the zone of the test settings. */
export function raidEventsFixture(zone = 'America/New_York'): RaidEventProvider {
  const events: readonly RaidEvent[] = parseRaidEventFeed(readRaidEventFeed(), zone);
  return { events: () => events };
}
```

- [ ] **Step 3: Write the failing tests of the domain**

Create `src/domain/time/raid-events.test.ts`:

```ts
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { readRaidEventFeed } from '../../../test/support/raid-events.js';
import { parseRaidEventFeed } from './raid-events.js';

const ZONE = 'America/New_York';
const at = (iso: string, zone = ZONE): number => DateTime.fromISO(iso, { zone }).toMillis();

describe('parseRaidEventFeed', () => {
  it('keeps the Raid Hours and Raid Days of the downloaded feed, in order of time', () => {
    const events = parseRaidEventFeed(readRaidEventFeed(), ZONE);
    expect(events.map((event) => [event.kind, event.name])).toEqual([
      ['raid-hour', 'Dialga Raid Hour'],
      ['raid-hour', 'Palkia Raid Hour'],
      ['raid-hour', 'Giratina (Origin Forme) Raid Hour'],
      ['raid-day', 'Super Mega Raid Day'],
      ['raid-day', 'Super Mega Raid Day'],
    ]);
    expect(events[0]).toEqual({
      kind: 'raid-hour',
      name: 'Dialga Raid Hour',
      start: at('2026-10-14T18:00'),
      end: at('2026-10-14T19:00'),
    });
  });

  it('reads a time without a zone as local time and keeps the zone of one that has it', () => {
    const feed = [
      {
        eventType: 'raid-hour',
        name: 'Local',
        start: '2026-10-14T18:00:00.000',
        end: '2026-10-14T19:00:00.000',
      },
      {
        eventType: 'raid-day',
        name: 'Global',
        start: '2026-10-17T18:00:00.000Z',
        end: '2026-10-17T21:00:00.000Z',
      },
    ];
    const [local, global] = parseRaidEventFeed(feed, 'Europe/Berlin');
    expect(local?.start).toBe(at('2026-10-14T18:00', 'Europe/Berlin'));
    expect(global?.start).toBe(Date.UTC(2026, 9, 17, 18));
  });

  it('leaves out a raid event it cannot read, and keeps the others', () => {
    const good = {
      eventType: 'raid-hour',
      name: 'Good',
      start: '2026-10-14T18:00',
      end: '2026-10-14T19:00',
    };
    const events = parseRaidEventFeed(
      [
        good,
        { ...good, name: 'No end', end: null },
        { ...good, name: 'Not a time', start: 'soon' },
        { ...good, name: 'Backwards', start: '2026-10-14T19:00', end: '2026-10-14T18:00' },
        { ...good, name: 'A whole week', end: '2026-10-21T18:00' },
        { ...good, name: '' },
        { ...good, name: 42 },
      ],
      ZONE,
    );
    expect(events.map((event) => event.name)).toEqual(['Good']);
  });

  it('removes control characters from a name', () => {
    const [event] = parseRaidEventFeed(
      [
        {
          eventType: 'raid-day',
          name: 'Mega\n\u202eDay\t ',
          start: '2026-10-31T14:00',
          end: '2026-10-31T17:00',
        },
      ],
      ZONE,
    );
    expect(event?.name).toBe('Mega Day');
  });

  it('accepts a feed without raid events', () => {
    expect(parseRaidEventFeed([{ eventType: 'season', name: 'Season' }], ZONE)).toEqual([]);
  });

  it('refuses what is not a list of events', () => {
    for (const json of [null, {}, [], 'events', [{ name: 'no type' }], [1, 2]]) {
      expect(() => parseRaidEventFeed(json, ZONE)).toThrow('not a list of events');
    }
  });
});
```

Create `src/domain/time/raid-durations.test.ts`:

```ts
import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { raidEventsFixture } from '../../../test/support/raid-events.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import { resolvePartyTime } from './party-time.js';
import {
  hatchTimeForEnd,
  longestRaidDurations,
  raidDurationsAt,
  raidEventAt,
  type RaidDurationRules,
} from './raid-durations.js';

const ZONE = 'America/New_York';
const MINUTE = 60_000;
const settings = loadSettings(TEST_SETTINGS_PATH);
const at = (iso: string): number => DateTime.fromISO(iso, { zone: ZONE }).toMillis();

/** The fixture's events: Raid Hours on 14, 21 and 28 October, Raid Days on 31 October and 28 November. */
const rules: RaidDurationRules = { settings, zone: ZONE, events: raidEventsFixture().events() };
const withoutFeed: RaidDurationRules = { ...rules, events: [] };
const withoutWeekly: RaidDurationRules = {
  ...rules,
  settings: { ...settings, raidEvents: { ...settings.raidEvents, weeklyRaidHour: null } },
};

describe('raidEventAt', () => {
  it('finds an event of the feed from its first minute to just before its end', () => {
    expect(raidEventAt(at('2026-10-14T18:00'), rules)?.name).toBe('Dialga Raid Hour');
    expect(raidEventAt(at('2026-10-14T18:59'), rules)?.name).toBe('Dialga Raid Hour');
    expect(raidEventAt(at('2026-10-14T19:00'), rules)).toBeUndefined();
    expect(raidEventAt(at('2026-10-14T17:59'), rules)).toBeUndefined();
    expect(raidEventAt(at('2026-10-31T15:30'), rules)?.kind).toBe('raid-day');
  });

  it('knows the weekly Raid Hour without the feed', () => {
    // 2026-11-04 is a Wednesday the fixture does not list.
    expect(raidEventAt(at('2026-11-04T18:30'), rules)).toEqual({
      kind: 'raid-hour',
      name: 'Raid Hour',
      start: at('2026-11-04T18:00'),
      end: at('2026-11-04T19:00'),
    });
    expect(raidEventAt(at('2026-10-14T18:30'), withoutFeed)?.name).toBe('Raid Hour');
    expect(raidEventAt(at('2026-11-05T18:30'), rules)).toBeUndefined();
    expect(raidEventAt(at('2026-11-04T18:30'), withoutWeekly)).toBeUndefined();
  });

  it('prefers a Raid Day to a Raid Hour at the same moment', () => {
    const day = {
      kind: 'raid-day' as const,
      name: 'Day',
      start: at('2026-10-14T14:00'),
      end: at('2026-10-14T20:00'),
    };
    expect(
      raidEventAt(at('2026-10-14T18:30'), { ...rules, events: [...rules.events, day] })?.name,
    ).toBe('Day');
  });
});

describe('raidDurationsAt', () => {
  it('gives the configured durations outside events', () => {
    expect(raidDurationsAt('standard', at('2026-10-13T18:30'), rules)).toEqual({
      incubation: 60,
      hatched: 45,
    });
  });

  it('shortens a boss that hatches during a Raid Hour and lengthens one of a Raid Day', () => {
    expect(raidDurationsAt('standard', at('2026-10-14T18:30'), rules)).toMatchObject({
      incubation: 60,
      hatched: 25,
    });
    expect(raidDurationsAt('standard', at('2026-10-31T14:00'), rules)).toMatchObject({
      hatched: 60,
    });
    expect(raidDurationsAt('standard', at('2026-10-14T18:30'), rules).event?.name).toBe(
      'Dialga Raid Hour',
    );
  });

  it('leaves EX and elite raids alone', () => {
    expect(raidDurationsAt('elite', at('2026-10-14T18:30'), rules)).toEqual({
      incubation: 1440,
      hatched: 30,
    });
    expect(raidDurationsAt('exclusive', at('2026-10-31T15:00'), rules)).toEqual({
      incubation: 20160,
      hatched: 45,
    });
  });
});

describe('hatchTimeForEnd', () => {
  it('goes back by the usual duration outside events', () => {
    expect(hatchTimeForEnd('standard', at('2026-10-13T18:45'), rules)).toBe(at('2026-10-13T18:00'));
    expect(hatchTimeForEnd('elite', at('2026-10-14T18:45'), rules)).toBe(at('2026-10-14T18:15'));
  });

  it('goes back by the duration of the event the raid hatched in', () => {
    // Ends 18:55 on a Raid Hour Wednesday: hatched 18:30, not 18:10.
    expect(hatchTimeForEnd('standard', at('2026-10-14T18:55'), rules)).toBe(at('2026-10-14T18:30'));
    // Ends 16:00 on the Raid Day: hatched 15:00.
    expect(hatchTimeForEnd('standard', at('2026-10-31T16:00'), rules)).toBe(at('2026-10-31T15:00'));
  });

  it('keeps the usual duration for a raid that hatched before the event began', () => {
    // Ends 18:20; 25 minutes earlier is 17:55, before the Raid Hour, so it was an ordinary raid.
    expect(hatchTimeForEnd('standard', at('2026-10-14T18:20'), rules)).toBe(at('2026-10-14T17:35'));
  });
});

describe('longestRaidDurations', () => {
  it('is the usual duration when no longer one can apply', () => {
    expect(
      longestRaidDurations('standard', at('2026-10-13T12:00'), at('2026-10-13T14:00'), rules),
    ).toEqual({
      incubation: 60,
      hatched: 45,
    });
    expect(
      longestRaidDurations('standard', at('2026-10-14T17:00'), at('2026-10-14T19:00'), rules)
        .hatched,
    ).toBe(45);
  });

  it('is the Raid Day duration when the span touches a Raid Day', () => {
    expect(
      longestRaidDurations('standard', at('2026-10-31T13:15'), at('2026-10-31T15:00'), rules)
        .hatched,
    ).toBe(60);
    expect(
      longestRaidDurations('standard', at('2026-10-31T17:00'), at('2026-10-31T18:00'), rules)
        .hatched,
    ).toBe(45);
  });

  it('covers a weekly Raid Hour that lasts longer than usual', () => {
    const long: RaidDurationRules = {
      ...withoutFeed,
      settings: {
        ...settings,
        raidEvents: {
          ...settings.raidEvents,
          hatchedDuration: { 'raid-hour': 50, 'raid-day': 60 },
        },
      },
    };
    expect(
      longestRaidDurations('standard', at('2026-11-03T23:00'), at('2026-11-04T18:10'), long)
        .hatched,
    ).toBe(50);
    expect(
      longestRaidDurations('standard', at('2026-11-05T00:00'), at('2026-11-05T23:00'), long)
        .hatched,
    ).toBe(45);
  });

  it('never changes EX and elite raids', () => {
    expect(
      longestRaidDurations('elite', at('2026-10-31T13:00'), at('2026-10-31T15:00'), rules),
    ).toEqual({
      incubation: 1440,
      hatched: 30,
    });
  });
});

describe('resolvePartyTime with the durations of an event', () => {
  it('accepts a hatch time an hour ago on a Raid Day and refuses it on another day', () => {
    const ask = (now: number) => {
      const durations = longestRaidDurations(
        'standard',
        now - 60 * MINUTE,
        now + 60 * MINUTE,
        rules,
      );
      return resolvePartyTime({
        text: 'at 2:05pm',
        now,
        zone: ZONE,
        parameter: 'hatch',
        partyType: 'raid',
        raidKind: 'standard',
        settings,
        durations,
      });
    };
    expect(ask(at('2026-10-31T15:00'))).toEqual({ kind: 'time', at: at('2026-10-31T14:05') });
    expect(ask(at('2026-10-30T15:00')).kind).toBe('out-of-range');
  });

  it('lets a duration set by hand for the raid win', () => {
    const now = at('2026-10-31T15:00');
    const result = resolvePartyTime({
      text: 'in 80',
      now,
      zone: ZONE,
      parameter: 'end',
      partyType: 'raid',
      raidKind: 'standard',
      settings,
      durations: { incubation: 60, hatched: 60 },
      party: { creationTime: now, hatchTime: now, hatchedDuration: 90 },
    });
    expect(result).toEqual({ kind: 'time', at: now + 80 * MINUTE });
  });
});
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `npx vitest run --project unit src/domain/time/raid-events.test.ts src/domain/time/raid-durations.test.ts`
Expected: FAIL, the modules `./raid-events.js` and `./raid-durations.js` cannot be found.

- [ ] **Step 5: The domain**

Create `src/domain/time/raid-events.ts`:

```ts
import { DateTime } from 'luxon';
import { z } from 'zod';

/** The kinds of event during which a raid boss stays for another time than usual. */
export const RAID_EVENT_KINDS = ['raid-hour', 'raid-day'] as const;
export type RaidEventKind = (typeof RAID_EVENT_KINDS)[number];

/** An event from the events feed, or the weekly Raid Hour. Times are epoch milliseconds. */
export interface RaidEvent {
  kind: RaidEventKind;
  /** The feed's name of the event, e.g. `Dialga Raid Hour`. Shown to members: escape it. */
  name: string;
  start: number;
  /** The first moment after the event. */
  end: number;
}

/** An event longer than this is not a Raid Hour or a Raid Day, whatever the feed calls it. */
const MAX_EVENT_MS = 24 * 60 * 60_000;

const feedEvent = z.object({
  eventType: z.enum(RAID_EVENT_KINDS),
  name: z
    .string()
    .transform((name) =>
      name
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().min(1).max(100)),
  start: z.string().max(40),
  end: z.string().max(40),
});

/**
 * Reads the events feed of ScrapedDuck (`events.json`: Leek Duck's event list) and keeps the Raid
 * Hours and Raid Days. The feed gives most times as local wall-clock times without a zone
 * (`2026-10-14T18:00:00.000`): those are read in `zone`. A time with a zone keeps its own.
 *
 * Throws when the document is not a list of events at all, so that the caller keeps what it
 * had. A single raid event that cannot be read is left out.
 */
export function parseRaidEventFeed(json: unknown, zone: string): RaidEvent[] {
  const list = z
    .array(z.object({ eventType: z.string() }).loose())
    .min(1)
    .safeParse(json);
  if (!list.success) throw new Error('The events feed is not a list of events');

  const events: RaidEvent[] = [];
  for (const item of list.data) {
    const parsed = feedEvent.safeParse(item);
    if (!parsed.success) continue;
    const start = DateTime.fromISO(parsed.data.start, { zone });
    const end = DateTime.fromISO(parsed.data.end, { zone });
    if (!start.isValid || !end.isValid) continue;
    const length = end.toMillis() - start.toMillis();
    if (length <= 0 || length > MAX_EVENT_MS) continue;
    events.push({
      kind: parsed.data.eventType,
      name: parsed.data.name,
      start: start.toMillis(),
      end: end.toMillis(),
    });
  }
  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
}
```

Create `src/domain/time/raid-durations.ts`:

```ts
import { DateTime } from 'luxon';
import type { Settings } from '../../config/settings.js';
import type { RaidKind } from './party-time.js';
import type { RaidEvent } from './raid-events.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type RaidDurationSettings = Pick<
  Settings,
  | 'standardRaidIncubateDuration'
  | 'standardRaidHatchedDuration'
  | 'exclusiveRaidIncubateDuration'
  | 'exclusiveRaidHatchedDuration'
  | 'eliteRaidIncubateDuration'
  | 'eliteRaidHatchedDuration'
> & { raidEvents: Pick<Settings['raidEvents'], 'weeklyRaidHour' | 'hatchedDuration'> };

/** Everything that decides how long a raid lasts at a given moment. */
export interface RaidDurationRules {
  settings: RaidDurationSettings;
  /** IANA zone of the weekly Raid Hour (settings.timezone). */
  zone: string;
  /** Raid Hours and Raid Days from the events feed; empty when the feed could not be read. */
  events: readonly RaidEvent[];
}

/** The rules in effect: the settings with the events known at this moment. */
export function raidDurationRules(
  settings: RaidDurationSettings & Pick<Settings, 'timezone'>,
  events: readonly RaidEvent[],
): RaidDurationRules {
  return { settings, zone: settings.timezone, events };
}

/** Minutes an egg takes to hatch and minutes the boss then stays. */
export interface RaidDurations {
  incubation: number;
  hatched: number;
  /** The event that changed the hatched duration, if one did. */
  event?: RaidEvent;
}

function configured(kind: RaidKind, settings: RaidDurationSettings): RaidDurations {
  switch (kind) {
    case 'standard':
      return {
        incubation: settings.standardRaidIncubateDuration,
        hatched: settings.standardRaidHatchedDuration,
      };
    case 'exclusive':
      return {
        incubation: settings.exclusiveRaidIncubateDuration,
        hatched: settings.exclusiveRaidHatchedDuration,
      };
    case 'elite':
      return {
        incubation: settings.eliteRaidIncubateDuration,
        hatched: settings.eliteRaidHatchedDuration,
      };
  }
}

/** The weekly Raid Hour of the day `time` falls on, when that day has one. */
function weeklyRaidHourOn(time: number, rules: RaidDurationRules): RaidEvent | undefined {
  const weekly = rules.settings.raidEvents.weeklyRaidHour;
  if (!weekly) return undefined;
  const day = DateTime.fromMillis(time, { zone: rules.zone });
  if (day.weekday !== weekly.weekday) return undefined;
  const start = day.set({ hour: weekly.hour, minute: 0, second: 0, millisecond: 0 });
  return {
    kind: 'raid-hour',
    name: 'Raid Hour',
    start: start.toMillis(),
    end: start.plus({ minutes: weekly.minutes }).toMillis(),
  };
}

const contains = (event: RaidEvent, time: number): boolean =>
  time >= event.start && time < event.end;

/**
 * The Raid Hour or Raid Day going on at `time`: an event of the feed, or else the weekly Raid
 * Hour. A Raid Day wins over a Raid Hour at the same moment.
 */
export function raidEventAt(time: number, rules: RaidDurationRules): RaidEvent | undefined {
  const current = rules.events.filter((event) => contains(event, time));
  const weekly = weeklyRaidHourOn(time, rules);
  if (weekly && contains(weekly, time)) current.push(weekly);
  return current.find((event) => event.kind === 'raid-day') ?? current[0];
}

/**
 * How long a raid lasts whose egg hatches at `hatchTime`. Only standard raids follow events: a
 * boss that hatches during a Raid Hour or a Raid Day stays for the time configured for that kind
 * of event. EX and elite raids keep their own durations.
 */
export function raidDurationsAt(
  kind: RaidKind,
  hatchTime: number,
  rules: RaidDurationRules,
): RaidDurations {
  const usual = configured(kind, rules.settings);
  if (kind !== 'standard') return usual;
  const event = raidEventAt(hatchTime, rules);
  if (!event) return usual;
  return { ...usual, hatched: rules.settings.raidEvents.hatchedDuration[event.kind], event };
}

/**
 * When a raid hatched (or will hatch) that ends at `endTime`. The duration depends on the hatch
 * time, so each duration that could apply is tried, events first, and the first one that agrees
 * with itself wins; when none does, the usual duration is used.
 */
export function hatchTimeForEnd(kind: RaidKind, endTime: number, rules: RaidDurationRules): number {
  const usual = configured(kind, rules.settings).hatched;
  if (kind === 'standard') {
    const { hatchedDuration } = rules.settings.raidEvents;
    for (const minutes of [hatchedDuration['raid-day'], hatchedDuration['raid-hour'], usual]) {
      const hatch = endTime - minutes * MINUTE;
      if (raidDurationsAt(kind, hatch, rules).hatched === minutes) return hatch;
    }
  }
  return endTime - usual * MINUTE;
}

/**
 * The longest durations any raid hatching between `from` and `to` can have. Typed times are
 * checked against these, so that a time which is right during an event is never refused.
 */
export function longestRaidDurations(
  kind: RaidKind,
  from: number,
  to: number,
  rules: RaidDurationRules,
): { incubation: number; hatched: number } {
  const usual = configured(kind, rules.settings);
  if (kind !== 'standard') return usual;
  const overlapping = rules.events.filter((event) => event.start <= to && event.end > from);
  // The weekly Raid Hour of every day the span touches; a span of weeks has one in any case.
  for (let day = from; day <= Math.min(to, from + 7 * DAY) + DAY; day += DAY) {
    const weekly = weeklyRaidHourOn(day, rules);
    if (weekly && weekly.start <= to && weekly.end > from) overlapping.push(weekly);
  }
  const { hatchedDuration } = rules.settings.raidEvents;
  const hatched = Math.max(
    usual.hatched,
    ...overlapping.map((event) => hatchedDuration[event.kind]),
  );
  return { incubation: usual.incubation, hatched };
}
```

Apply to `src/domain/time/party-time.ts`:

```diff
--- a/src/domain/time/party-time.ts
+++ b/src/domain/time/party-time.ts
@@ -42,6 +42,11 @@ export interface PartyTimeRequest {
   /** Omitted while a raid is being created. */
   party?: PartyTimes;
   settings: TimeSettings;
+  /**
+   * The durations in effect for this raid when they differ from the configured ones (a Raid Hour
+   * or Raid Day; see `longestRaidDurations`). A duration set by hand for the raid still wins.
+   */
+  durations?: { incubation: number; hatched: number };
 }
 
 export type PartyTimeResult =
@@ -64,20 +69,22 @@ interface Window {
 
 function raidDurations(request: PartyTimeRequest): { incubation: number; hatched: number } {
   const { settings, raidKind, party } = request;
-  const byKind = {
-    standard: {
-      incubation: settings.standardRaidIncubateDuration,
-      hatched: settings.standardRaidHatchedDuration,
-    },
-    exclusive: {
-      incubation: settings.exclusiveRaidIncubateDuration,
-      hatched: settings.exclusiveRaidHatchedDuration,
-    },
-    elite: {
-      incubation: settings.eliteRaidIncubateDuration,
-      hatched: settings.eliteRaidHatchedDuration,
-    },
-  }[raidKind];
+  const byKind =
+    request.durations ??
+    {
+      standard: {
+        incubation: settings.standardRaidIncubateDuration,
+        hatched: settings.standardRaidHatchedDuration,
+      },
+      exclusive: {
+        incubation: settings.exclusiveRaidIncubateDuration,
+        hatched: settings.exclusiveRaidHatchedDuration,
+      },
+      elite: {
+        incubation: settings.eliteRaidIncubateDuration,
+        hatched: settings.eliteRaidHatchedDuration,
+      },
+    }[raidKind];
   // Legacy tested `!!party.duration`, so a hand-set duration of zero means "not set".
   const byHand = party?.hatchedDuration;
   return { incubation: byKind.incubation, hatched: byHand ? byHand : byKind.hatched };
```

- [ ] **Step 6: Write the failing test of the service**

Create `src/services/raid-event-service.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRaidEventFeed } from '../../test/support/raid-events.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { RaidEventService, type FetchEvents } from './raid-event-service.js';

const URL = 'https://example.test/events.json';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const downloaded = JSON.stringify(readRaidEventFeed());

type Response = Awaited<ReturnType<FetchEvents>>;

function reply(status: number, body = ''): Response {
  return { ok: status >= 200 && status <= 299, status, text: () => Promise.resolve(body) };
}

function service(fetch: FetchEvents, extra: { timeoutMs?: number } = {}) {
  const { log, entries } = createTestLogger();
  const events = new RaidEventService({
    url: URL,
    refreshMs: 6 * HOUR,
    zone: 'America/New_York',
    fetch,
    log,
    ...extra,
  });
  return { events, entries };
}

describe('RaidEventService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has no events until the feed was read, then the Raid Hours and Raid Days of the feed', async () => {
    const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, downloaded)));
    const { events, entries } = service(fetch);
    expect(events.events()).toEqual([]);
    await expect(events.refresh()).resolves.toEqual({ status: 'updated', events: 5 });
    expect(events.events().map((event) => event.kind)).toEqual([
      'raid-hour',
      'raid-hour',
      'raid-hour',
      'raid-day',
      'raid-day',
    ]);
    expect(fetch).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(entries.some((entry) => entry.msg === 'raid events read' && entry.events === 5)).toBe(
      true,
    );
  });

  it('keeps the events it has when the feed fails in any way', async () => {
    let next: () => Promise<Response> = () => Promise.resolve(reply(200, downloaded));
    const { events, entries } = service(() => next());
    await events.refresh();

    const failures: [() => Promise<Response>, string][] = [
      [() => Promise.resolve(reply(503)), 'answered 503'],
      [() => Promise.resolve(reply(200, '<html>')), 'did not send JSON'],
      [() => Promise.resolve(reply(200, '{"events":[]}')), 'not a list of events'],
      [() => Promise.resolve(reply(200, '[]')), 'not a list of events'],
      [() => Promise.resolve(reply(200, ' '.repeat(5_000_001))), 'not the events feed'],
      [
        () => Promise.reject(new TypeError('fetch failed', { cause: new Error('ENOTFOUND') })),
        'ENOTFOUND',
      ],
    ];
    for (const [answer, reason] of failures) {
      next = answer;
      const result = await events.refresh();
      expect(result).toMatchObject({ status: 'failed' });
      expect((result as { reason: string }).reason).toContain(reason);
      expect(events.events()).toHaveLength(5);
    }
    expect(entries.filter((entry) => entry.msg === 'could not read the events feed')).toHaveLength(
      failures.length,
    );
  });

  it('gives up a download that takes too long', async () => {
    const fetch: FetchEvents = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const { events } = service(fetch, { timeoutMs: 1_000 });
    const result = events.refresh();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toEqual({
      status: 'failed',
      reason: `${URL}: timed out after 1000 ms`,
    });
  });

  it('shares one download between calls made while it runs', async () => {
    const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, downloaded)));
    const { events } = service(fetch);
    await Promise.all([events.refresh(), events.refresh()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads the feed at once when started, then at the interval, sooner after a failure', async () => {
    let fail = false;
    const fetch = vi.fn<FetchEvents>(() =>
      Promise.resolve(fail ? reply(500) : reply(200, downloaded)),
    );
    const { events } = service(fetch);
    events.start();
    events.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6 * HOUR - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    fail = true;
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);

    fail = false;
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(fetch).toHaveBeenCalledTimes(3);
    events.stop();
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('ends a download in flight when stopped, without a warning, and is idle afterwards', async () => {
    const fetch: FetchEvents = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const { events, entries } = service(fetch);
    events.start();
    await vi.advanceTimersByTimeAsync(0);
    events.stop();
    await events.whenIdle();
    expect(entries.filter((entry) => entry.level === 40)).toEqual([]);
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(events.events()).toEqual([]);
  });
});
```

- [ ] **Step 7: The service and its wiring**

Create `src/services/raid-event-service.ts`:

```ts
import { parseRaidEventFeed, type RaidEvent } from '../domain/time/raid-events.js';
import type { Logger } from '../log.js';
import { failureReason } from './failure-reason.js';

/** The feed is about 60,000 characters; anything near this size is not the feed. */
const MAX_FEED_CHARS = 5_000_000;
const MINUTE_MS = 60_000;
/** The longest delay `setTimeout` accepts; anything longer fires immediately. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** The part of `fetch` this service needs. */
export type FetchEvents = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface RaidEventOptions {
  /** Address of the events feed. */
  url: string;
  /** How often the feed is read. */
  refreshMs: number;
  /** IANA zone in which the feed's local times are read (settings.timezone). */
  zone: string;
  fetch: FetchEvents;
  log: Logger;
  /** How long one download may take before it is abandoned. Default 30 seconds. */
  timeoutMs?: number;
  /** How long to wait after a failed attempt. Default 15 minutes, at most `refreshMs`. */
  retryMs?: number;
}

/** What handlers need: the Raid Hours and Raid Days known from the feed. */
export interface RaidEventProvider {
  /** In order of time; empty until the feed was read once, and when it has none. */
  events(): readonly RaidEvent[];
}

export type RefreshResult =
  | { status: 'updated'; events: number }
  /** The feed could not be read or was not valid; the events in use are unchanged. */
  | { status: 'failed'; reason: string };

/**
 * Keeps the Raid Hours and Raid Days of the events feed in memory. Nothing is stored: after a
 * restart the weekly Raid Hour of the settings applies until the first download succeeds, which
 * `start` attempts at once. A feed that cannot be read never fails anything: the events of the
 * last good read stay in use.
 */
export class RaidEventService implements RaidEventProvider {
  private current: readonly RaidEvent[] = [];
  private readonly timeoutMs: number;
  private readonly retryMs: number;
  private controller: AbortController | undefined;
  private inFlight: Promise<RefreshResult> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = true;

  constructor(private readonly options: RaidEventOptions) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retryMs = Math.min(options.retryMs ?? 15 * MINUTE_MS, options.refreshMs);
  }

  events(): readonly RaidEvent[] {
    return this.current;
  }

  /**
   * Reads the feed. Never rejects. Calls made while one is running share its result.
   */
  refresh(): Promise<RefreshResult> {
    this.inFlight ??= this.refreshOnce().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /** Resolves once no download is in flight (at once when none is). Never rejects. */
  async whenIdle(): Promise<void> {
    while (this.inFlight) await this.inFlight;
  }

  /** Reads the feed now and again every `refreshMs`. Calling it again changes nothing. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  /** Cancels the scheduled download and ends one in flight. */
  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        void this.refresh().then((result) => {
          if (this.stopped) return;
          this.schedule(result.status === 'failed' ? this.retryMs : this.options.refreshMs);
        });
      },
      Math.min(delayMs, MAX_TIMER_MS),
    );
    this.timer.unref();
  }

  private async refreshOnce(): Promise<RefreshResult> {
    const { log } = this.options;
    try {
      this.current = await this.readFeed();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (reason !== 'stopped')
        this.safely(() => log.warn({ err }, 'could not read the events feed'));
      return { status: 'failed', reason };
    }
    const events = this.current.length;
    this.safely(() => log.info({ events }, 'raid events read'));
    return { status: 'updated', events };
  }

  private async readFeed(): Promise<RaidEvent[]> {
    const { url } = this.options;
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const controller = new AbortController();
    this.controller = controller;
    let status: number;
    let body = '';
    try {
      const response = await this.options.fetch(url, {
        signal: AbortSignal.any([timeout, controller.signal]),
        headers: { Accept: 'application/json' },
      });
      status = response.status;
      if (response.ok) body = await response.text();
    } catch (err) {
      if (controller.signal.aborted) throw new Error('stopped', { cause: err });
      const reason = timeout.aborted ? `timed out after ${this.timeoutMs} ms` : failureReason(err);
      throw new Error(`${url}: ${reason}`, { cause: err });
    } finally {
      if (this.controller === controller) this.controller = undefined;
    }
    if (status < 200 || status > 299) throw new Error(`${url} answered ${status}`);
    if (body.length > MAX_FEED_CHARS) {
      throw new Error(`${url} sent ${body.length} characters, which is not the events feed`);
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error(`${url} did not send JSON`);
    }
    return parseRaidEventFeed(json, this.options.zone);
  }

  /** A broken logger must not turn a finished download into a rejected one. */
  private safely(action: () => void): void {
    try {
      action();
    } catch {
      // Nothing useful can be done about a logger that throws.
    }
  }
}
```

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -8,6 +8,7 @@ import type { GameDataProvider } from './services/game-data-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
+import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { MapProvider } from './services/static-maps.js';
 
 /** Everything a handler may use. Later phases add services here. */
@@ -20,6 +21,8 @@ export interface AppContext {
   readonly gameData: GameDataProvider;
   /** The raid bosses in effect: the feed's list with the moderators' overrides. */
   readonly raidBosses: RaidBossProvider;
+  /** Raid Hours and Raid Days from the events feed (see `raidDurationRules`). */
+  readonly raidEvents: RaidEventProvider;
   /** The gyms, and finding them by what members type. */
   readonly gyms: GymProvider;
   /** Pokémon by what members type: names, nicknames, forms. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -23,6 +23,7 @@ import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
+import { RaidEventService } from './services/raid-event-service.js';
 import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
 
@@ -66,6 +67,13 @@ export async function startApp(
     fetch: (url, init) => fetch(url, init),
     log,
   });
+  const raidEvents = new RaidEventService({
+    url: config.settings.raidEvents.url,
+    refreshMs: config.settings.raidEvents.refreshHours * HOUR_MS,
+    zone: config.settings.timezone,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
   const gyms = new GymDirectory({
     gyms: new GymRepository(db),
     regions: new RegionRepository(db),
@@ -102,6 +110,7 @@ export async function startApp(
     commands,
     gameData,
     raidBosses,
+    raidEvents,
     gyms,
     pokemon,
     maps,
@@ -137,6 +146,7 @@ export async function startApp(
   ctx.features = features;
   // Listeners for the raid boss list (Phase 5) must be attached before this call.
   raidBosses.startAutoSync();
+  raidEvents.start();
   log.info({ features }, 'optional features');
 
   const shutdown = createShutdown(
@@ -158,6 +168,14 @@ export async function startApp(
           await raidBosses.whenIdle();
         },
       },
+      {
+        name: 'raid events',
+        timeoutMs: 1_000,
+        run: async () => {
+          raidEvents.stop();
+          await raidEvents.whenIdle();
+        },
+      },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
     ],
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -6,6 +6,7 @@ import type { DB } from '../../src/db/types.js';
 import { catalogueFixture } from './game-data.js';
 import { gymsFixture, mapsFixture, pokemonFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
+import { raidEventsFixture } from './raid-events.js';
 import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { TEST_ENV } from './test-env.js';
@@ -23,6 +24,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     commands: [],
     gameData,
     raidBosses: raidBossesFixture(),
+    raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project unit src/domain/time src/services/raid-event-service.test.ts`
Expected: PASS (5 files, 141 tests).

- [ ] **Step 9: Format, check, commit**

```bash
npx prettier --write src/config/settings.ts data/settings.json test/fixtures/settings.json test/fixtures/raid-events.json test/support/raid-events.ts test/support/test-context.ts src/domain/time src/services/raid-event-service.ts src/services/raid-event-service.test.ts src/app.ts src/app-context.ts
npm run check
git add data/settings.json test/fixtures/settings.json test/fixtures/raid-events.json test/support/raid-events.ts test/support/test-context.ts src/config/settings.ts src/domain/time src/services/raid-event-service.ts src/services/raid-event-service.test.ts src/app.ts src/app-context.ts
git commit -m "Raid events: Raid Hour and Raid Day durations from the events feed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 886 unit tests.

---

### Task 2: The `Party` table, the forum columns of `Region`, and the pool's time zone

**Files:**
- Create: `src/db/migrations/2026_10_11_002_parties.ts`
- Modify: `src/db/migrations/index.ts`, `src/db/kysely.ts`, `src/db/repositories/region-repository.ts`, `src/db/repositories/region-repository.db.test.ts`, `src/db/migrator.db.test.ts`, `test/support/gyms.ts`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Consumes: `startMigratedDatabase()` (`test/support/migrated-db.ts`), `inTransaction`, `snowflakeParam`.
- Produces:
  - Table `Party` (columns as in the migration below) and `Region.forumChannelId`, `Region.summaryMessageId` (`varchar(30)`, nullable).
  - `Region` (of `region-repository.ts`) gains `forumChannelId: string | null` and `summaryMessageId: string | null`.
  - `RegionRepository.findById(id)`, `findByForum(forumChannelId)`, `setForum(id, forumChannelId | null): Promise<boolean>`, `setSummaryMessage(id, messageId | null): Promise<boolean>`, `regionsContaining(point, guildId?): Promise<Region[]>`.
  - Test support: `WEST_FORUM`, `EAST_FORUM` (`test/support/gyms.ts`).

Docker must be running for this task.

- [ ] **Step 1: The migration**

Create `src/db/migrations/2026_10_11_002_parties.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Parties on forums (spec sections 5.1 and 5.5).
 *
 * `Party` holds one row per raid, train or meetup. What the scheduler and the duplicate check
 * search by has its own column; everything else a party knows (attendees, groups, boss, moves)
 * is the JSON document `state`, which only `PartyRepository` reads and writes. Times are epoch
 * milliseconds. New snowflake columns are `varchar(30)` like `Guild.snowflake`, so they are
 * strings in SQL as well as in code; never compare one with the BIGINT `Region.channelId` in SQL.
 *
 * `Region` gains the forum that holds the region's party posts and the pinned summary post in it.
 *
 * MySQL commits each statement of a migration by itself, so the statements are written to be
 * safe to run again after a failure half-way.
 */
export const parties: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    await sql`
      create table if not exists Party (
        id char(36) not null,
        guildId int unsigned not null,
        type varchar(16) not null,
        status varchar(16) not null default 'active',
        regionId int unsigned default null,
        gymId int unsigned default null,
        forumChannelId varchar(30) default null,
        forumPostId varchar(30) default null,
        regionLinkMessageId varchar(30) default null,
        mirrorMessages json not null,
        createdById varchar(30) not null,
        hatchTime bigint default null,
        endTime bigint default null,
        lastPossibleTime bigint default null,
        deletionTime bigint default null,
        saved tinyint(1) not null default 0,
        state json not null,
        createdAt bigint not null,
        updatedAt bigint not null,
        primary key (id),
        unique key party_forumpostid_unique (forumPostId),
        key party_status_deletiontime_index (status, deletionTime),
        key party_gymid_status_index (gymId, status),
        constraint party_guildid_foreign foreign key (guildId) references Guild (id)
          on delete cascade,
        constraint party_regionid_foreign foreign key (regionId) references Region (id)
          on delete set null,
        constraint party_gymid_foreign foreign key (gymId) references Gym (id)
          on delete set null
      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);

    for (const column of ['forumChannelId', 'summaryMessageId']) {
      const existing = await sql<{ n: number }>`
        select count(*) as n from information_schema.columns
        where table_schema = database() and table_name = 'Region' and column_name = ${column}`.execute(
        db,
      );
      if (Number(existing.rows[0]?.n ?? 0) === 0) {
        await sql`alter table Region add column ${sql.ref(column)} varchar(30) default null`.execute(
          db,
        );
      }
    }
  },
  async down() {
    // Additive only: the table and the columns stay.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -1,6 +1,7 @@
 import type { Migration } from 'kysely/migration';
 import { baseline } from './2026_10_09_000_baseline.js';
 import { raidBosses } from './2026_10_10_001_raid_bosses.js';
+import { parties } from './2026_10_11_002_parties.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -9,4 +10,5 @@ import { raidBosses } from './2026_10_10_001_raid_bosses.js';
 export const migrations: Record<string, Migration> = {
   '2026_10_09_000_baseline': baseline,
   '2026_10_10_001_raid_bosses': raidBosses,
+  '2026_10_11_002_parties': parties,
 };
```

- [ ] **Step 2: Regenerate the database types**

Run: `npm run db:codegen`
Expected: "Introspected 18 tables", and `git diff src/db/types.ts` shows exactly this (never edit the file by hand):

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -9,6 +9,18 @@ export type Generated<T> = T extends ColumnType<infer S, infer I, infer U>
   ? ColumnType<S, I | undefined, U>
   : ColumnType<T, T | undefined, T>;
 
+export type Json = ColumnType<JsonValue, string, string>;
+
+export type JsonArray = JsonValue[];
+
+export type JsonObject = {
+  [x: string]: JsonValue | undefined;
+};
+
+export type JsonPrimitive = boolean | number | string | null;
+
+export type JsonValue = JsonArray | JsonObject | JsonPrimitive;
+
 export type LineString = Point[];
 
 export type Point = {
@@ -86,6 +98,28 @@ export interface GymNotification {
   userId: number | null;
 }
 
+export interface Party {
+  createdAt: string;
+  createdById: string;
+  deletionTime: string | null;
+  endTime: string | null;
+  forumChannelId: string | null;
+  forumPostId: string | null;
+  guildId: number;
+  gymId: number | null;
+  hatchTime: string | null;
+  id: string;
+  lastPossibleTime: string | null;
+  mirrorMessages: Json;
+  regionId: number | null;
+  regionLinkMessageId: string | null;
+  saved: Generated<number>;
+  state: Json;
+  status: Generated<string>;
+  type: string;
+  updatedAt: string;
+}
+
 export interface Pokemon {
   elite: Generated<number | null>;
   exclusive: Generated<number | null>;
@@ -135,8 +169,10 @@ export interface Region {
   bounds: Polygon | null;
   channelId: string | null;
   description: string | null;
+  forumChannelId: string | null;
   guildId: number | null;
   id: Generated<number>;
+  summaryMessageId: string | null;
 }
 
 export interface Role {
@@ -181,6 +217,7 @@ export interface DB {
   Gym: Gym;
   GymMeta: GymMeta;
   GymNotification: GymNotification;
+  Party: Party;
   Pokemon: Pokemon;
   PokemonNotification: PokemonNotification;
   RaidBoss: RaidBoss;
```

- [ ] **Step 3: The tests of the migration**

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -23,18 +23,26 @@ async function migrate(database: TestDatabase): Promise<void> {
 }
 
 /** The tables the new bot adds to a database it takes over. */
-const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride'];
+const ADDED_TABLES = ['RaidBoss', 'RaidBossOverride', 'Party'];
+/** The columns it adds to tables of the legacy bot, as `Table.column`. */
+const ADDED_COLUMNS = ['Region.forumChannelId', 'Region.summaryMessageId'];
 
 /**
  * Everything about the Pine tables that a new install must reproduce exactly. `except` leaves
- * tables out, to compare only what the legacy bot created.
+ * tables out and `exceptColumns` columns, to compare only what the legacy bot created.
  */
-async function describeSchema(database: TestDatabase, except: readonly string[] = []) {
+async function describeSchema(
+  database: TestDatabase,
+  except: readonly string[] = [],
+  exceptColumns: readonly string[] = [],
+) {
   const kept = <Row extends { t: string }>(rows: Row[]): Row[] =>
     rows.filter((row) => !except.includes(row.t));
   const described = await describeTables(database);
   return {
-    columns: kept(described.columns),
+    columns: kept(described.columns).filter(
+      (row) => !exceptColumns.includes(`${row.t}.${String(row.c)}`),
+    ),
     indexes: kept(described.indexes),
     foreignKeys: kept(described.foreignKeys),
   };
@@ -83,8 +91,20 @@ describe('runMigrations', () => {
     expect(rows.map((r) => r.name)).toEqual([
       '2026_10_09_000_baseline',
       '2026_10_10_001_raid_bosses',
+      '2026_10_11_002_parties',
+    ]);
+    expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS)).toEqual(before);
+    const columns = await database.query<{ name: string; type: string; nullable: string }>(
+      `select column_name as name, column_type as type, is_nullable as nullable
+       from information_schema.columns
+       where table_schema = database() and table_name = 'Region' and column_name in (?, ?)
+       order by name`,
+      ['forumChannelId', 'summaryMessageId'],
+    );
+    expect(columns).toEqual([
+      { name: 'forumChannelId', type: 'varchar(30)', nullable: 'YES' },
+      { name: 'summaryMessageId', type: 'varchar(30)', nullable: 'YES' },
     ]);
-    expect(await describeSchema(database, ADDED_TABLES)).toEqual(before);
     const tables = await database.query<{ name: string }>(ALL_TABLES);
     expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(ADDED_TABLES));
   });
@@ -94,12 +114,46 @@ describe('runMigrations', () => {
     await migrate(database);
     // What a failure between the two statements leaves behind: one table, no migration record.
     await database.query('drop table RaidBossOverride');
-    await database.query("delete from kysely_migration where name = '2026_10_10_001_raid_bosses'");
+    // Later migrations are forgotten with it: Kysely refuses a gap in what was executed.
+    await database.query("delete from kysely_migration where name >= '2026_10_10_001_raid_bosses'");
     await expect(migrate(database)).resolves.toBeUndefined();
     const tables = await database.query<{ name: string }>(ALL_TABLES);
     expect(tables.map((r) => r.name)).toEqual(expect.arrayContaining(ADDED_TABLES));
   });
 
+  it('finishes the party migration if it failed half-way', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await migrate(database);
+    const complete = await describeSchema(database);
+    // What a failure after the first added column leaves behind.
+    await database.query('alter table Region drop column summaryMessageId');
+    await database.query("delete from kysely_migration where name = '2026_10_11_002_parties'");
+    await expect(migrate(database)).resolves.toBeUndefined();
+    expect(await describeSchema(database)).toEqual(complete);
+  });
+
+  it('lets the legacy bot delete a gym, a region or a guild that a party refers to', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await migrate(database);
+    await database.query("insert into Guild (id, snowflake) values (1, '412345678901234567')");
+    await database.query('insert into Region (id, guildId, channelId) values (1, 1, 1)');
+    await database.query("insert into Gym (id, name) values (1, 'Fountain')");
+    const insert = `insert into Party (id, guildId, type, regionId, gymId, mirrorMessages, createdById, state, createdAt, updatedAt)
+                    values (?, 1, 'raid', 1, 1, '[]', '1', '{}', 0, 0)`;
+    await database.query(insert, ['a']);
+    await database.query(insert, ['b']);
+
+    await database.query('delete from Gym where id = 1');
+    await database.query('delete from Region where id = 1');
+    const kept = await database.query('select id, gymId, regionId, status from Party order by id');
+    expect(kept).toEqual([
+      { id: 'a', gymId: null, regionId: null, status: 'active' },
+      { id: 'b', gymId: null, regionId: null, status: 'active' },
+    ]);
+    await database.query('delete from Guild where id = 1');
+    await expect(database.query('select id from Party')).resolves.toEqual([]);
+  });
+
   it('is idempotent', async () => {
     database = await startDatabase({ legacySchema: true });
     await migrate(database);
```

- [ ] **Step 4: The pool's time zone**

Apply to `src/db/kysely.ts`:

```diff
--- a/src/db/kysely.ts
+++ b/src/db/kysely.ts
@@ -4,7 +4,9 @@ import type { DbConfig } from './db-config.js';
 
 /**
  * BIGINT and DECIMAL values come back as strings (bigNumberStrings), so Discord
- * snowflakes stored in BIGINT columns keep full precision.
+ * snowflakes stored in BIGINT columns keep full precision. Dates are read and written as UTC
+ * (`timezone: 'Z'`), whatever zone the machine is in; the bot's own columns hold epoch
+ * milliseconds and need none of it.
  */
 export function createDb<Schema>(config: DbConfig): Kysely<Schema> {
   return new Kysely<Schema>({
@@ -14,6 +16,7 @@ export function createDb<Schema>(config: DbConfig): Kysely<Schema> {
         charset: 'utf8mb4',
         supportBigNumbers: true,
         bigNumberStrings: true,
+        timezone: 'Z',
         connectionLimit: 10,
       }),
     }),
```

- [ ] **Step 5: Write the failing tests of the region repository**

Apply to `src/db/repositories/region-repository.db.test.ts`:

```diff
--- a/src/db/repositories/region-repository.db.test.ts
+++ b/src/db/repositories/region-repository.db.test.ts
@@ -10,6 +10,10 @@ const GUILD = '412345678901234567';
 const OTHER_GUILD = '412345678901234568';
 const DOWNTOWN = '1234567890123456788';
 const NORTH = '1234567890123456789';
+const OTHER = '1234567890123456790';
+const FORUM = '1234567890123456800';
+const OTHER_FORUM = '1234567890123456801';
+const SUMMARY = '1234567890123456900';
 
 /** About 11 km square around downtown Pittsburgh. */
 const DOWNTOWN_RING: LatLon[] = [
@@ -57,6 +61,8 @@ describe('RegionRepository', () => {
       channelId: DOWNTOWN,
       description: null,
       bounds: DOWNTOWN_RING,
+      forumChannelId: null,
+      summaryMessageId: null,
     });
     expect(await regions.findByChannel(DOWNTOWN)).toEqual(saved);
   });
@@ -135,4 +141,62 @@ describe('RegionRepository', () => {
     expect((await regions.findByChannel(DOWNTOWN))?.bounds).toBeNull();
     expect(await regions.channelsContaining({ lat: 40.45, lon: -80 })).toEqual([]);
   });
+
+  it('finds a region by its row id', async () => {
+    const saved = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+    await expect(regions.findById(saved.id)).resolves.toEqual(saved);
+    await expect(regions.findById(saved.id + 1000)).resolves.toBeUndefined();
+  });
+
+  it('gives the regions containing a point as rows, oldest first', async () => {
+    const downtown = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+    await regions.saveBounds(guildId, NORTH, NORTH_RING);
+    const overlapping = await regions.saveBounds(otherGuildId, OTHER, DOWNTOWN_RING);
+    const point = { lat: 40.45, lon: -80.0 };
+    await expect(regions.regionsContaining(point)).resolves.toEqual([downtown, overlapping]);
+    await expect(regions.regionsContaining(point, otherGuildId)).resolves.toEqual([overlapping]);
+    await expect(regions.regionsContaining({ lat: 41, lon: -80 })).resolves.toEqual([]);
+  });
+
+  it('links a region to its forum and finds it by the forum', async () => {
+    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+    await expect(regions.setForum(id, FORUM)).resolves.toBe(true);
+    await expect(regions.findByForum(FORUM)).resolves.toMatchObject({ id, forumChannelId: FORUM });
+    await expect(regions.findByChannel(DOWNTOWN)).resolves.toMatchObject({ forumChannelId: FORUM });
+    await expect(regions.findByForum(DOWNTOWN)).resolves.toBeUndefined();
+    await expect(regions.setForum(id + 1000, FORUM)).resolves.toBe(false);
+  });
+
+  it('remembers the summary post and forgets it when the forum changes', async () => {
+    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+    await regions.setForum(id, FORUM);
+    await expect(regions.setSummaryMessage(id, SUMMARY)).resolves.toBe(true);
+    await expect(regions.findById(id)).resolves.toMatchObject({ summaryMessageId: SUMMARY });
+
+    // The same forum again keeps the post; another forum, or none, forgets it.
+    await expect(regions.setForum(id, FORUM)).resolves.toBe(true);
+    await expect(regions.findById(id)).resolves.toMatchObject({ summaryMessageId: SUMMARY });
+    await regions.setForum(id, OTHER_FORUM);
+    await expect(regions.findById(id)).resolves.toMatchObject({
+      forumChannelId: OTHER_FORUM,
+      summaryMessageId: null,
+    });
+    await regions.setSummaryMessage(id, SUMMARY);
+    await regions.setForum(id, null);
+    await expect(regions.findById(id)).resolves.toMatchObject({
+      forumChannelId: null,
+      summaryMessageId: null,
+    });
+    await expect(regions.setSummaryMessage(id + 1000, SUMMARY)).resolves.toBe(false);
+  });
+
+  it('keeps the outline and the forum apart when the outline is replaced', async () => {
+    const { id } = await regions.saveBounds(guildId, DOWNTOWN, DOWNTOWN_RING);
+    await regions.setForum(id, FORUM);
+    await regions.saveBounds(guildId, DOWNTOWN, NORTH_RING);
+    await expect(regions.findById(id)).resolves.toMatchObject({
+      bounds: NORTH_RING,
+      forumChannelId: FORUM,
+    });
+  });
 });
```

Run: `npx tsc --noEmit`
Expected: FAIL, `findById`, `regionsContaining`, `setForum`, `findByForum` and `setSummaryMessage` do not exist on `RegionRepository`.

- [ ] **Step 6: The region repository and the invented regions**

Apply to `src/db/repositories/region-repository.ts`:

```diff
--- a/src/db/repositories/region-repository.ts
+++ b/src/db/repositories/region-repository.ts
@@ -13,6 +13,10 @@ export interface Region {
   description: string | null;
   /** Closed outline; null for a row created before its outline was imported. */
   bounds: LatLon[] | null;
+  /** The forum that holds the region's party posts; null until `/admin setup-forums` made one. */
+  forumChannelId: string | null;
+  /** The pinned "Active raids" post in that forum. */
+  summaryMessageId: string | null;
 }
 
 interface RegionRow {
@@ -21,6 +25,8 @@ interface RegionRow {
   channelId: string | null;
   description: string | null;
   bounds: Polygon | null;
+  forumChannelId: string | null;
+  summaryMessageId: string | null;
 }
 
 function toRegion(row: RegionRow): Region | undefined {
@@ -31,6 +37,8 @@ function toRegion(row: RegionRow): Region | undefined {
     channelId: row.channelId,
     description: row.description,
     bounds: ringFromPolygon(row.bounds),
+    forumChannelId: row.forumChannelId,
+    summaryMessageId: row.summaryMessageId,
   };
 }
 
@@ -38,7 +46,15 @@ function toRegions(rows: RegionRow[]): Region[] {
   return rows.map(toRegion).filter((region): region is Region => region !== undefined);
 }
 
-const COLUMNS = ['id', 'guildId', 'channelId', 'description', 'bounds'] as const;
+const COLUMNS = [
+  'id',
+  'guildId',
+  'channelId',
+  'description',
+  'bounds',
+  'forumChannelId',
+  'summaryMessageId',
+] as const;
 
 /** The Region table. All spatial SQL for regions lives here. */
 export class RegionRepository {
@@ -54,6 +70,51 @@ export class RegionRepository {
     return row ? toRegion(row) : undefined;
   }
 
+  async findById(id: number): Promise<Region | undefined> {
+    const row = await this.db
+      .selectFrom('Region')
+      .select(COLUMNS)
+      .where('id', '=', id)
+      .executeTakeFirst();
+    return row ? toRegion(row) : undefined;
+  }
+
+  /** The region whose party posts are in this forum. */
+  async findByForum(forumChannelId: string): Promise<Region | undefined> {
+    const row = await this.db
+      .selectFrom('Region')
+      .select(COLUMNS)
+      .where('forumChannelId', '=', forumChannelId)
+      .orderBy('id')
+      .executeTakeFirst();
+    return row ? toRegion(row) : undefined;
+  }
+
+  /**
+   * Sets or clears the region's forum. The summary post belongs to the forum, so it is forgotten
+   * whenever the forum changes. Returns false when there is no such region.
+   */
+  async setForum(id: number, forumChannelId: string | null): Promise<boolean> {
+    const result = await this.db
+      .updateTable('Region')
+      .set({ forumChannelId, summaryMessageId: null })
+      .where('id', '=', id)
+      .where((eb) =>
+        forumChannelId === null
+          ? eb('forumChannelId', 'is not', null)
+          : eb.or([eb('forumChannelId', 'is', null), eb('forumChannelId', '!=', forumChannelId)]),
+      )
+      .executeTakeFirst();
+    if (result.numUpdatedRows > 0n) return true;
+    return (await this.findById(id)) !== undefined;
+  }
+
+  /** Returns false when there is no such region. */
+  async setSummaryMessage(id: number, summaryMessageId: string | null): Promise<boolean> {
+    await this.db.updateTable('Region').set({ summaryMessageId }).where('id', '=', id).execute();
+    return (await this.findById(id)) !== undefined;
+  }
+
   async listForGuild(guildId: number): Promise<Region[]> {
     const rows = await this.db
       .selectFrom('Region')
@@ -119,6 +180,18 @@ export class RegionRepository {
     return rows.map((row) => row.channelId).filter((id): id is string => id !== null);
   }
 
+  /** The regions containing the point, oldest first. Empty when none do. */
+  async regionsContaining(point: LatLon, guildId?: number): Promise<Region[]> {
+    let query = this.db
+      .selectFrom('Region')
+      .select(COLUMNS)
+      .where('channelId', 'is not', null)
+      .where('bounds', 'is not', null)
+      .where(sql<boolean>`ST_Contains(bounds, POINT(${point.lat}, ${point.lon}))`);
+    if (guildId !== undefined) query = query.where('guildId', '=', guildId);
+    return toRegions(await query.orderBy('id').execute());
+  }
+
   /** Returns false when the channel was not a region. */
   async delete(channelId: string): Promise<boolean> {
     const result = await this.db
```

Apply to `test/support/gyms.ts`:

```diff
--- a/test/support/gyms.ts
+++ b/test/support/gyms.ts
@@ -6,6 +6,9 @@ import type { LatLon } from '../../src/domain/geo/lat-lon.js';
 export const WEST_CHANNEL = '100000000000000001';
 export const EAST_CHANNEL = '100000000000000002';
 export const UNBOUNDED_CHANNEL = '100000000000000003';
+/** The forums holding the party posts of West and East. */
+export const WEST_FORUM = '100000000000000011';
+export const EAST_FORUM = '100000000000000012';
 
 function square(south: number, west: number, north: number, east: number): LatLon[] {
   return [
@@ -29,6 +32,8 @@ export function testRegions(): Region[] {
       channelId: WEST_CHANNEL,
       description: null,
       bounds: square(40.0, -80.1, 40.1, -80.0),
+      forumChannelId: WEST_FORUM,
+      summaryMessageId: null,
     },
     {
       id: 2,
@@ -36,8 +41,18 @@ export function testRegions(): Region[] {
       channelId: EAST_CHANNEL,
       description: null,
       bounds: square(40.0, -80.0, 40.1, -79.9),
+      forumChannelId: EAST_FORUM,
+      summaryMessageId: null,
+    },
+    {
+      id: 3,
+      guildId: 1,
+      channelId: UNBOUNDED_CHANNEL,
+      description: null,
+      bounds: null,
+      forumChannelId: null,
+      summaryMessageId: null,
     },
-    { id: 3, guildId: 1, channelId: UNBOUNDED_CHANNEL, description: null, bounds: null },
   ];
 }
 
```

- [ ] **Step 7: Run the database tests of this task**

Run: `npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/region-repository.db.test.ts`
Expected: PASS (2 files, 29 tests; about four minutes).

- [ ] **Step 8: Format, check, commit**

```bash
npx prettier --write src/db test/support/gyms.ts
npm run check
git add src/db/kysely.ts src/db/migrations/2026_10_11_002_parties.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/region-repository.db.test.ts src/db/repositories/region-repository.ts src/db/types.ts test/support/gyms.ts
git commit -m "Party table, forum columns of Region, UTC for the pool" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 886 unit tests (this task adds only database tests).

---

### Task 3: The party as data, and what can be done to a raid

**Files:**
- Create: `src/domain/party/party.ts`, `src/domain/party/raid.ts`, `src/domain/party/raid.test.ts`, `test/support/parties.ts`

**Interfaces:**
- Consumes: Task 1 (`RaidDurationRules`, `raidDurationRules`, `raidDurationsAt`, `hatchTimeForEnd`, `longestRaidDurations`, `raidEventsFixture`); `PartyStatus` (`src/domain/party/status.ts`); `RaidTier`, `raidDurationKind`, `sameRaidTier` (`src/domain/pogo/raid-tier.ts`).
- Produces (`party.ts`): `GROUP_IDS`, `GroupId`, `isGroupId`, `AttendeeStatus`, `Attendee { number; status; group; remote; pendingUntil? }`, `PartyGroup { id; label?; startTime?; startClearTime? }`, `MirrorMessage`, `PartyType`, `PartyLifeStatus`, `PartyCore`, `RaidBossRef = { key } | { name }`, `sameBoss`, `RaidStage`, `RaidDetails { tier; boss; reportedHatched; fastMove; chargedMove; hatchedDuration; stageSeen }`, `RaidParty`, `Party`, `PartyProblem`, `Refusal`, `Change<P, Extra>`, `refused(reason)`, `attendeeOf(party, memberId)`, `groupOf(party, id)`, `headCount(party, groupId?)`, `membersWhere(party, keep)`, `remoteAllowed(party)`.
- Produces (`raid.ts`): `NewRaid`, `createRaid(input, rules): RaidParty`, `raidKindOf(party)`, `raidStage(party, now)`, `blocksNewRaid(party, now)`, `setHatchTime(party, time, rules, now)`, `setEndTime(party, time, rules, now)`, `setHatchedDuration(party, minutes, maxMinutes, rules, now): Change<RaidParty>`, `BossChange`, `setBoss(party, change, rules, now): { party; changed; wasEgg }`, `setMoveset(party, { fastMove?, chargedMove? }): Change<RaidParty>`, `setGym(party, gymId, regionId): { party; regionChanged }`, `setSaved(party, saved)`.
- Produces (test support): `PARTY_ZONE`, `MINUTE`, `REPORTER`, `ALICE`, `BOB`, `CAROL`, `at(iso)`, `PARTY_NOW`, `testRaidRules()`, `testRaid(overrides?)`, `withAttendees(party, attendees)`.

- [ ] **Step 1: The model**

Create `src/domain/party/party.ts`:

```ts
import type { RaidTier } from '../pogo/raid-tier.js';
import { PartyStatus } from './status.js';

/** A party has at most five groups, named by these letters in this order. */
export const GROUP_IDS = ['A', 'B', 'C', 'D', 'E'] as const;
export type GroupId = (typeof GROUP_IDS)[number];

export function isGroupId(value: string): value is GroupId {
  return (GROUP_IDS as readonly string[]).includes(value);
}

/** A status an attendee can have. Not interested means: no attendee record. */
export type AttendeeStatus = Exclude<PartyStatus, typeof PartyStatus.NotInterested>;

export interface Attendee {
  /** Head count this member brings, themself included; at least 1. Shown as `+<number - 1>`. */
  number: number;
  status: AttendeeStatus;
  group: GroupId;
  /** Takes part with a remote raid pass. */
  remote: boolean;
  /**
   * Set while the status is `CompletePending`: the moment (epoch ms) from which no answer to
   * "have you completed this raid?" counts as yes.
   */
  pendingUntil?: number;
}

export interface PartyGroup {
  id: GroupId;
  label?: string;
  /** The group's meeting time, epoch ms. */
  startTime?: number;
  /** Set once the meeting time has passed: when it is removed and the group is asked. */
  startClearTime?: number;
}

/** A copy of the party's message outside its post (spec 5.2). */
export interface MirrorMessage {
  channelId: string;
  messageId: string;
  kind: 'ex' | 'remote';
}

export type PartyType = 'raid' | 'train' | 'meetup';
export type PartyLifeStatus = 'active' | 'ended';

/** What every kind of party has. Times are epoch milliseconds. */
export interface PartyCore {
  /** UUID; also the id in the custom ids of the party's controls. */
  id: string;
  /** Row id of the guild (`Guild.id`), not its snowflake. */
  guildId: number;
  status: PartyLifeStatus;
  /** Row id of the region the party is in; null once that region was deleted. */
  regionId: number | null;
  gymId: number | null;
  /** The forum the post is in, and the post (a thread). Null until the post exists. */
  forumChannelId: string | null;
  forumPostId: string | null;
  /** The "new raid at …" line in the region's text channel. */
  regionLinkMessageId: string | null;
  mirrorMessages: readonly MirrorMessage[];
  /** Snowflake of the member who reported it, also when the report is anonymous. */
  createdById: string;
  /** The reporter asked not to be named (`User.raidPrivacy`). */
  anonymous: boolean;
  hatchTime: number | null;
  endTime: number | null;
  /** The latest moment the party can still be going on; what the clean-up goes by. */
  lastPossibleTime: number | null;
  /** When the post is archived; null while that is not scheduled. */
  deletionTime: number | null;
  /** Kept by a moderator: never archived automatically. */
  saved: boolean;
  createdAt: number;
  updatedAt: number;
  /**
   * By member snowflake, in the order they signed up. (Snowflakes are too long to be array
   * indices, so an object keeps that order; the stored document is a list for the same reason.)
   */
  attendees: Readonly<Record<string, Attendee>>;
  /** In the order they were created; never empty. */
  groups: readonly PartyGroup[];
  /** The group a new attendee lands in: the newest one. */
  defaultGroupId: GroupId;
}

/**
 * A raid's boss: the catalogue key of a Pokémon the game master knows, or the feed's name for
 * one it does not know yet. Names of known Pokémon are never stored: they can change.
 */
export type RaidBossRef = { key: string } | { name: string };

export function sameBoss(a: RaidBossRef | null, b: RaidBossRef | null): boolean {
  if (a === null || b === null) return a === b;
  if ('key' in a) return 'key' in b && a.key === b.key;
  return 'name' in b && a.name === b.name;
}

export type RaidStage = 'egg' | 'hatched' | 'ended';

export interface RaidDetails {
  tier: RaidTier;
  /** Null for an egg, and for a raid whose boss nobody has named. */
  boss: RaidBossRef | null;
  /**
   * The report named a boss, so the raid had hatched when it was reported. Without times this,
   * and not the boss, says whether the raid is an egg: naming the boss an egg will have does
   * not hatch it.
   */
  reportedHatched: boolean;
  /** Move ids of the catalogue (`Move.id`). */
  fastMove: string | null;
  chargedMove: string | null;
  /** Minutes the hatched raid lasts, when a member set it for this raid (`/duration`). */
  hatchedDuration: number | null;
  /** The stage the post last showed; the scheduler compares it with the clock (see `partyTick`). */
  stageSeen: RaidStage;
}

export interface RaidParty extends PartyCore {
  type: 'raid';
  raid: RaidDetails;
}

/** Trains and meetups join this union in Phase 3. */
export type Party = RaidParty;

/** Why a change was refused. The commands turn these into sentences. */
export type PartyProblem =
  /** The member has no attendee record. */
  | 'not-attending'
  | 'no-such-group'
  /** A head count below 1 or above the allowed maximum. */
  | 'bad-count'
  /** Elite raids cannot be done remotely. */
  | 'in-person-only'
  | 'too-many-groups'
  /** The member was not asked whether they completed the raid. */
  | 'not-pending'
  | 'label-too-long'
  | 'no-boss'
  | 'bad-duration';

/** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
export interface Refusal {
  ok: false;
  reason: PartyProblem;
  party?: undefined;
}

/** The outcome of a change: the changed party (a new object) and what came of it, or why not. */
export type Change<P, Extra = unknown> = ({ ok: true; party: P } & Extra) | Refusal;

export function refused(reason: PartyProblem): Refusal {
  return { ok: false, reason };
}

export function attendeeOf(party: PartyCore, memberId: string): Attendee | undefined {
  return Object.hasOwn(party.attendees, memberId) ? party.attendees[memberId] : undefined;
}

export function groupOf(party: PartyCore, id: string): PartyGroup | undefined {
  return party.groups.find((group) => group.id === id);
}

/**
 * Heads expected: the numbers of everybody who has not completed the raid, of one group or of
 * all. Members asked whether they completed it still count.
 */
export function headCount(party: PartyCore, groupId?: GroupId): number {
  let total = 0;
  for (const attendee of Object.values(party.attendees)) {
    if (attendee.status === PartyStatus.Complete) continue;
    if (groupId !== undefined && attendee.group !== groupId) continue;
    total += attendee.number;
  }
  return total;
}

/** Snowflakes of the attendees for which `keep` holds, in the order they signed up. */
export function membersWhere(
  party: PartyCore,
  keep: (attendee: Attendee, memberId: string) => boolean,
): string[] {
  return Object.entries(party.attendees)
    .filter(([memberId, attendee]) => keep(attendee, memberId))
    .map(([memberId]) => memberId);
}

/** Whether members may take part remotely. Elite raids are in person only. */
export function remoteAllowed(party: Party): boolean {
  return party.raid.tier.level !== 'Elite';
}
```

- [ ] **Step 2: Test support and the failing test**

Create `test/support/parties.ts`:

```ts
import { DateTime } from 'luxon';
import { loadSettings } from '../../src/config/settings.js';
import type { Attendee, RaidParty } from '../../src/domain/party/party.js';
import { createRaid, type NewRaid } from '../../src/domain/party/raid.js';
import { PartyStatus } from '../../src/domain/party/status.js';
import { raidDurationRules, type RaidDurationRules } from '../../src/domain/time/raid-durations.js';
import { raidEventsFixture } from './raid-events.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';

export const PARTY_ZONE = 'America/New_York';
export const MINUTE = 60_000;

/** Snowflakes of invented members. */
export const REPORTER = '200000000000000001';
export const ALICE = '200000000000000002';
export const BOB = '200000000000000003';
export const CAROL = '200000000000000004';

/** Epoch ms of a wall-clock time in the zone of the test settings. */
export function at(iso: string): number {
  const time = DateTime.fromISO(iso, { zone: PARTY_ZONE });
  if (!time.isValid) throw new Error(`bad test time ${iso}`);
  return time.toMillis();
}

/** Tuesday 13 October 2026, 14:00: a day without a Raid Hour or Raid Day. */
export const PARTY_NOW = at('2026-10-13T14:00');

/** The test settings with the events of the fixture feed. */
export function testRaidRules(): RaidDurationRules {
  return raidDurationRules(loadSettings(TEST_SETTINGS_PATH), raidEventsFixture().events());
}

/**
 * A tier 5 egg at gym 1 of region 1, reported at `PARTY_NOW` by `REPORTER`, who is signed up
 * as interested. Nothing of it exists on Discord yet (no forum post).
 */
export function testRaid(overrides: Partial<NewRaid> = {}): RaidParty {
  return createRaid(
    {
      id: '00000000-0000-4000-8000-000000000001',
      guildId: 1,
      regionId: 1,
      gymId: 1,
      createdById: REPORTER,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
      now: PARTY_NOW,
      ...overrides,
    },
    testRaidRules(),
  );
}

/** The raid with these attendees added or replaced; each defaults to coming, alone, group A. */
export function withAttendees(
  party: RaidParty,
  attendees: Record<string, Partial<Attendee>>,
): RaidParty {
  const added: Record<string, Attendee> = {};
  for (const [memberId, attendee] of Object.entries(attendees)) {
    added[memberId] = {
      number: 1,
      status: PartyStatus.Coming,
      group: 'A',
      remote: false,
      ...attendee,
    };
  }
  return { ...party, attendees: { ...party.attendees, ...added } };
}
```

Create `src/domain/party/raid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import {
  blocksNewRaid,
  raidStage,
  setBoss,
  setEndTime,
  setGym,
  setHatchedDuration,
  setHatchTime,
  setMoveset,
  setSaved,
} from './raid.js';
import { PartyStatus } from './status.js';

const rules = testRaidRules();
const T5 = { level: 'T5', shadow: false } as const;
const ELITE = { level: 'Elite', shadow: false } as const;
const YVELTAL = { key: 'yveltal' };

describe('createRaid', () => {
  it('makes an egg with one group, the reporter signed up, and no times', () => {
    const raid = testRaid();
    expect(raid).toMatchObject({
      type: 'raid',
      status: 'active',
      hatchTime: null,
      endTime: null,
      deletionTime: null,
      saved: false,
      forumPostId: null,
      mirrorMessages: [],
      groups: [{ id: 'A' }],
      defaultGroupId: 'A',
      attendees: {
        [REPORTER]: { number: 1, status: PartyStatus.Interested, group: 'A', remote: false },
      },
      raid: {
        tier: T5,
        boss: null,
        reportedHatched: false,
        fastMove: null,
        chargedMove: null,
        hatchedDuration: null,
        stageSeen: 'egg',
      },
    });
    // An egg seen now hatches within 60 minutes and then lasts 45.
    expect(raid.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
  });

  it('signs nobody up when the reporter wants no automatic status', () => {
    expect(testRaid({ autoStatus: PartyStatus.NotInterested }).attendees).toEqual({});
    expect(testRaid({ autoStatus: PartyStatus.Coming }).attendees[REPORTER]?.status).toBe(
      PartyStatus.Coming,
    );
  });

  it('keeps the moves only for a boss, and shows a raid with a boss as hatched', () => {
    const boss = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST' });
    expect(boss.raid).toMatchObject({
      boss: YVELTAL,
      reportedHatched: true,
      fastMove: 'SNARL_FAST',
      chargedMove: null,
      stageSeen: 'hatched',
    });
    // Seen hatched at 14:00, it cannot last beyond the 45 minutes a boss stays.
    expect(boss.lastPossibleTime).toBe(PARTY_NOW + 45 * MINUTE);
    expect(testRaid({ boss: null, fastMove: 'SNARL_FAST' }).raid.fastMove).toBeNull();
  });

  it('allows for the longer raids of a Raid Day, and for the days an EX or elite egg takes', () => {
    // Saturday 31 October 2026: Raid Day from 14:00 to 17:00, bosses stay 60 minutes.
    const day = at('2026-10-31T13:30');
    expect(testRaid({ now: day }).lastPossibleTime).toBe(day + 120 * MINUTE);
    expect(testRaid({ tier: ELITE }).lastPossibleTime).toBe(PARTY_NOW + (1440 + 30) * MINUTE);
    expect(testRaid({ tier: { level: 'EX', shadow: false } }).lastPossibleTime).toBe(
      PARTY_NOW + (20160 + 45) * MINUTE,
    );
  });
});

describe('raid times', () => {
  it('derives the end from the hatch time and drops the seconds', () => {
    const raid = setHatchTime(testRaid(), at('2026-10-13T14:30') + 42_000, rules, PARTY_NOW);
    expect(raid.hatchTime).toBe(at('2026-10-13T14:30'));
    expect(raid.endTime).toBe(at('2026-10-13T15:15'));
    expect(raid.lastPossibleTime).toBe(raid.endTime);
  });

  it('derives the hatch time from the end and drops the seconds', () => {
    const raid = setEndTime(testRaid(), at('2026-10-13T14:40') + 42_000, rules, PARTY_NOW);
    expect(raid.hatchTime).toBe(at('2026-10-13T13:55'));
    expect(raid.endTime).toBe(at('2026-10-13T14:40'));
  });

  it('uses the Raid Hour and Raid Day durations for a raid that hatches in one', () => {
    // Wednesday 14 October 2026, Raid Hour 18:00 to 19:00: bosses stay 25 minutes.
    const hour = at('2026-10-14T17:50');
    const egg = setHatchTime(testRaid({ now: hour }), at('2026-10-14T18:00'), rules, hour);
    expect(egg.endTime).toBe(at('2026-10-14T18:25'));
    const hatched = setEndTime(
      testRaid({ now: at('2026-10-14T18:40') }),
      at('2026-10-14T18:55'),
      rules,
      hour,
    );
    expect(hatched.hatchTime).toBe(at('2026-10-14T18:30'));

    const day = at('2026-10-31T14:10');
    expect(setHatchTime(testRaid({ now: day }), at('2026-10-31T14:30'), rules, day).endTime).toBe(
      at('2026-10-31T15:30'),
    );
  });

  it('uses the durations of EX and elite raids', () => {
    const elite = setHatchTime(testRaid({ tier: ELITE }), at('2026-10-14T18:00'), rules, PARTY_NOW);
    expect(elite.endTime).toBe(at('2026-10-14T18:30'));
  });

  it('lets a duration set for the raid win, moving the end and keeping the hatch time', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const long = setHatchedDuration(egg, 90, 180, rules, PARTY_NOW);
    expect(long).toMatchObject({
      ok: true,
      party: { hatchTime: egg.hatchTime, endTime: at('2026-10-13T16:00') },
    });
    if (!long.ok) return;
    expect(long.party.lastPossibleTime).toBe(at('2026-10-13T16:00'));
    // Later time changes use it too, in both directions.
    expect(setHatchTime(long.party, at('2026-10-13T14:00'), rules, PARTY_NOW).endTime).toBe(
      at('2026-10-13T15:30'),
    );
    expect(setEndTime(long.party, at('2026-10-13T16:30'), rules, PARTY_NOW).hatchTime).toBe(
      at('2026-10-13T15:00'),
    );
  });

  it('stores a duration for a raid without times and counts it into the last possible time', () => {
    const change = setHatchedDuration(testRaid(), 120, 180, rules, PARTY_NOW);
    expect(change).toMatchObject({
      ok: true,
      party: { hatchTime: null, endTime: null, lastPossibleTime: PARTY_NOW + 180 * MINUTE },
    });
  });

  it('calls a scheduled archiving off when a longer duration says the raid is still on', () => {
    const now = at('2026-10-13T15:30');
    const over = {
      ...setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW),
      deletionTime: now + MINUTE,
    };
    expect(setHatchedDuration(over, 90, 180, rules, now)).toMatchObject({
      ok: true,
      party: { endTime: at('2026-10-13T16:00'), deletionTime: null },
    });
    expect(setHatchedDuration(over, 50, 180, rules, now)).toMatchObject({
      ok: true,
      party: { endTime: at('2026-10-13T15:20'), deletionTime: now + MINUTE },
    });
  });

  it('refuses a duration outside 1 minute to the maximum', () => {
    for (const minutes of [0, -5, 181, 2.5, Number.NaN]) {
      expect(setHatchedDuration(testRaid(), minutes, 180, rules, PARTY_NOW)).toEqual({
        ok: false,
        reason: 'bad-duration',
      });
    }
  });

  it('calls a scheduled archiving off when the corrected time says the raid is still on', () => {
    const over = {
      ...setEndTime(testRaid(), PARTY_NOW - 10 * MINUTE, rules, PARTY_NOW),
      deletionTime: PARTY_NOW + 5 * MINUTE,
    };
    expect(setEndTime(over, PARTY_NOW + 20 * MINUTE, rules, PARTY_NOW).deletionTime).toBeNull();
    expect(setEndTime(over, PARTY_NOW - 5 * MINUTE, rules, PARTY_NOW).deletionTime).toBe(
      PARTY_NOW + 5 * MINUTE,
    );
    expect(setHatchTime(over, PARTY_NOW - 10 * MINUTE, rules, PARTY_NOW).deletionTime).toBeNull();
  });
});

describe('raidStage and blocksNewRaid', () => {
  const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);

  it('goes by the clock: egg until the hatch time, hatched until the end, then ended', () => {
    expect(raidStage(egg, at('2026-10-13T14:29'))).toBe('egg');
    expect(raidStage(egg, at('2026-10-13T14:30'))).toBe('hatched');
    expect(raidStage(egg, at('2026-10-13T15:14'))).toBe('hatched');
    expect(raidStage(egg, at('2026-10-13T15:15'))).toBe('ended');
  });

  it('without times: what it was reported as, and ended after the last possible time', () => {
    expect(raidStage(testRaid(), PARTY_NOW)).toBe('egg');
    expect(raidStage(testRaid(), PARTY_NOW + 105 * MINUTE - 1)).toBe('egg');
    expect(raidStage(testRaid(), PARTY_NOW + 105 * MINUTE)).toBe('ended');
    const seenHatched = testRaid({ boss: YVELTAL });
    expect(raidStage(seenHatched, PARTY_NOW)).toBe('hatched');
    expect(raidStage(seenHatched, PARTY_NOW + 45 * MINUTE)).toBe('ended');
  });

  it('does not hatch a timeless egg when its boss is named, nor turn a raid seen hatched back', () => {
    const named = setBoss(testRaid(), { tier: T5, boss: YVELTAL }, rules, PARTY_NOW).party;
    expect(raidStage(named, PARTY_NOW)).toBe('egg');
    expect(named.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
    const unnamed = setBoss(
      testRaid({ boss: YVELTAL }),
      { tier: T5, boss: null },
      rules,
      PARTY_NOW,
    );
    expect(raidStage(unnamed.party, PARTY_NOW)).toBe('hatched');
  });

  it('blocks a new raid at the gym only until the raid has ended', () => {
    expect(blocksNewRaid(egg, at('2026-10-13T15:14'))).toBe(true);
    expect(blocksNewRaid(egg, at('2026-10-13T15:15'))).toBe(false);
    expect(blocksNewRaid({ ...egg, status: 'ended' }, at('2026-10-13T14:00'))).toBe(false);
  });
});

describe('setBoss', () => {
  it('names the boss of an egg, keeps the times, and says the raid was an egg', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const change = setBoss(
      egg,
      { tier: T5, boss: YVELTAL, chargedMove: 'DARK_PULSE' },
      rules,
      PARTY_NOW,
    );
    expect(change).toMatchObject({ changed: true, wasEgg: true });
    expect(change.party).toMatchObject({ hatchTime: egg.hatchTime, endTime: egg.endTime });
    expect(change.party.raid).toMatchObject({
      boss: YVELTAL,
      fastMove: null,
      chargedMove: 'DARK_PULSE',
    });
  });

  it('changes nothing when boss and tier are what they were', () => {
    const raid = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST' });
    const change = setBoss(raid, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW);
    expect(change).toEqual({ party: raid, changed: false, wasEgg: false });
  });

  it('forgets the moves of the boss before', () => {
    const raid = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST', chargedMove: 'DARK_PULSE' });
    const change = setBoss(raid, { tier: T5, boss: { key: 'xerneas' } }, rules, PARTY_NOW);
    expect(change.party.raid).toMatchObject({
      boss: { key: 'xerneas' },
      fastMove: null,
      chargedMove: null,
    });
    const egg = setBoss(raid, { tier: T5, boss: null, fastMove: 'SNARL_FAST' }, rules, PARTY_NOW);
    expect(egg.party.raid).toMatchObject({ boss: null, fastMove: null });
  });

  it('tells a boss the game master knows from one known only by the name of the feed', () => {
    const raid = testRaid({ boss: { name: 'Newmon' } });
    expect(setBoss(raid, { tier: T5, boss: { name: 'Newmon' } }, rules, PARTY_NOW).changed).toBe(
      false,
    );
    expect(setBoss(raid, { tier: T5, boss: { key: 'newmon' } }, rules, PARTY_NOW).changed).toBe(
      true,
    );
  });

  it('keeps the hatch time of an egg and the end of a hatched raid when the kind changes', () => {
    // An egg hatching at 14:30: as an elite raid it lasts 30 minutes, not 45.
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const eliteEgg = setBoss(egg, { tier: ELITE, boss: null }, rules, PARTY_NOW).party;
    expect(eliteEgg).toMatchObject({
      hatchTime: at('2026-10-13T14:30'),
      endTime: at('2026-10-13T15:00'),
    });

    // A hatched raid ending 14:40: as an elite raid it hatched at 14:10, not 13:55.
    const hatched = setEndTime(testRaid(), at('2026-10-13T14:40'), rules, PARTY_NOW);
    const eliteBoss = setBoss(
      hatched,
      { tier: ELITE, boss: { key: 'mewtwo' } },
      rules,
      PARTY_NOW,
    ).party;
    expect(eliteBoss).toMatchObject({
      hatchTime: at('2026-10-13T14:10'),
      endTime: at('2026-10-13T14:40'),
    });
  });

  it('leaves both times alone when the kind of raid stays the same, also next to an event', () => {
    // Wednesday 14 October 2026, Raid Hour from 18:00. An egg hatching at 17:50 ends at 18:35;
    // read backwards from that end, the Raid Hour would make it a 25-minute raid from 18:10.
    const reported = at('2026-10-14T17:00');
    const now = at('2026-10-14T17:50');
    const egg = setHatchTime(testRaid({ now: reported }), now, rules, reported);
    expect(egg).toMatchObject({ hatchTime: now, endTime: at('2026-10-14T18:35') });
    const named = setBoss(egg, { tier: T5, boss: YVELTAL }, rules, now).party;
    expect(named).toMatchObject({ hatchTime: now, endTime: at('2026-10-14T18:35') });
    const mega = { tier: { level: 'Mega', shadow: false }, boss: null } as const;
    expect(setBoss(egg, mega, rules, now).party).toMatchObject({
      hatchTime: now,
      endTime: at('2026-10-14T18:35'),
    });
  });

  it('keeps a duration set for the raid when the kind changes', () => {
    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const long = setHatchedDuration(egg, 90, 180, rules, PARTY_NOW);
    if (!long.ok) throw new Error('refused');
    const elite = setBoss(long.party, { tier: ELITE, boss: null }, rules, PARTY_NOW).party;
    expect(elite).toMatchObject({
      hatchTime: at('2026-10-13T14:30'),
      endTime: at('2026-10-13T16:00'),
    });
  });

  it('works out the last possible time again, also downwards', () => {
    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
    const normal = setBoss(ex, { tier: T5, boss: YVELTAL }, rules, PARTY_NOW).party;
    expect(normal.lastPossibleTime).toBe(PARTY_NOW + 105 * MINUTE);
  });

  it('makes everybody in-person when the raid becomes elite', () => {
    const raid = withAttendees(testRaid(), {
      [ALICE]: { remote: true },
      [BOB]: { remote: false, number: 2 },
    });
    const elite = setBoss(raid, { tier: ELITE, boss: null }, rules, PARTY_NOW).party;
    expect(elite.attendees[ALICE]).toMatchObject({ remote: false });
    expect(elite.attendees[BOB]).toMatchObject({ remote: false, number: 2 });
    const mega = setBoss(
      raid,
      { tier: { level: 'Mega', shadow: false }, boss: null },
      rules,
      PARTY_NOW,
    ).party;
    expect(mega.attendees[ALICE]).toMatchObject({ remote: true });
  });
});

describe('setMoveset, setGym, setSaved', () => {
  it('sets the moves given and keeps the other; an egg has none', () => {
    const raid = testRaid({ boss: YVELTAL, fastMove: 'SNARL_FAST' });
    expect(setMoveset(raid, { chargedMove: 'DARK_PULSE' })).toMatchObject({
      ok: true,
      party: { raid: { fastMove: 'SNARL_FAST', chargedMove: 'DARK_PULSE' } },
    });
    expect(setMoveset(raid, { fastMove: 'GUST_FAST' })).toMatchObject({
      ok: true,
      party: { raid: { fastMove: 'GUST_FAST', chargedMove: null } },
    });
    expect(setMoveset(testRaid(), { fastMove: 'SNARL_FAST' })).toEqual({
      ok: false,
      reason: 'no-boss',
    });
  });

  it('moves the raid to a gym and says whether that is another region', () => {
    expect(setGym(testRaid(), 2, 1)).toMatchObject({
      party: { gymId: 2, regionId: 1 },
      regionChanged: false,
    });
    expect(setGym(testRaid(), 7, 2)).toMatchObject({
      party: { gymId: 7, regionId: 2 },
      regionChanged: true,
    });
  });

  it('keeps a party a moderator saved from being archived, and lets it go again', () => {
    const scheduled = { ...testRaid(), deletionTime: PARTY_NOW + MINUTE };
    expect(setSaved(scheduled, true)).toMatchObject({ saved: true, deletionTime: null });
    expect(setSaved(setSaved(scheduled, true), false)).toMatchObject({
      saved: false,
      deletionTime: null,
    });
    expect(setSaved(scheduled, false)).toMatchObject({
      saved: false,
      deletionTime: PARTY_NOW + MINUTE,
    });
  });
});
```

Run: `npx vitest run --project unit src/domain/party/raid.test.ts`
Expected: FAIL, the module `raid.js` cannot be found.

- [ ] **Step 3: The raid**

Create `src/domain/party/raid.ts`:

```ts
import { raidDurationKind, sameRaidTier, type RaidTier } from '../pogo/raid-tier.js';
import type { RaidKind } from '../time/party-time.js';
import {
  hatchTimeForEnd,
  longestRaidDurations,
  raidDurationsAt,
  type RaidDurationRules,
} from '../time/raid-durations.js';
import {
  refused,
  sameBoss,
  type Attendee,
  type Change,
  type RaidBossRef,
  type RaidParty,
  type RaidStage,
} from './party.js';
import { PartyStatus } from './status.js';

const MINUTE = 60_000;

export interface NewRaid {
  /** A fresh UUID. */
  id: string;
  guildId: number;
  regionId: number;
  gymId: number;
  /** Snowflake of the reporter. */
  createdById: string;
  anonymous: boolean;
  /** The reporter's automatic status (`User.status`); not interested signs nobody up. */
  autoStatus: PartyStatus;
  tier: RaidTier;
  /** Null for an egg; a boss means the raid was seen hatched. */
  boss: RaidBossRef | null;
  fastMove?: string | null;
  chargedMove?: string | null;
  now: number;
}

export function raidKindOf(party: RaidParty): RaidKind {
  return raidDurationKind(party.raid.tier);
}

/**
 * Egg, hatched or ended, by the clock. A raid without times is what it was reported as (an
 * egg, or hatched when the report named a boss) until the last moment it could be going on has
 * passed. Naming the boss later changes nothing here.
 */
export function raidStage(party: RaidParty, now: number): RaidStage {
  const { hatchTime, endTime, lastPossibleTime } = party;
  if (now >= (endTime ?? lastPossibleTime ?? Infinity)) return 'ended';
  if (hatchTime === null) return party.raid.reportedHatched ? 'hatched' : 'egg';
  return now < hatchTime ? 'egg' : 'hatched';
}

/** Whether this raid stands in the way of a new report for its gym: it does until it has ended. */
export function blocksNewRaid(party: RaidParty, now: number): boolean {
  return party.status === 'active' && raidStage(party, now) !== 'ended';
}

/**
 * The latest moment a raid without an end time can be going on. An egg reported at `createdAt`
 * hatches within the incubation time and then lasts the hatched time; a raid reported hatched
 * hatched before `createdAt` and lasts no longer than the hatched time from then.
 */
function latestWithoutTimes(party: RaidParty, rules: RaidDurationRules): number {
  const kind = raidKindOf(party);
  const { createdAt } = party;
  const usual = raidDurationsAt(kind, createdAt, rules);
  const reportedHatched = party.raid.reportedHatched;
  // The span of possible hatch times: before the report, or within the incubation time after it.
  const from = reportedHatched ? createdAt - usual.hatched * MINUTE : createdAt;
  const to = reportedHatched ? createdAt : createdAt + usual.incubation * MINUTE;
  const longest = longestRaidDurations(kind, from, to, rules);
  const hatched = party.raid.hatchedDuration ?? longest.hatched;
  return createdAt + ((reportedHatched ? 0 : longest.incubation) + hatched) * MINUTE;
}

/**
 * Brings what follows from the times up to date: the last possible time, and a scheduled
 * archiving is called off when the raid turns out to be still going on. `deletionTime` belongs
 * to the scheduler (`partyTick`) alone: it sets it when the raid is over, and nothing else may
 * schedule an archiving through it, or a corrected time would call that off too.
 */
function settled(party: RaidParty, rules: RaidDurationRules, now: number): RaidParty {
  const lastPossibleTime = party.endTime ?? latestWithoutTimes(party, rules);
  const deletionTime = lastPossibleTime > now ? null : party.deletionTime;
  return { ...party, lastPossibleTime, deletionTime };
}

/** Minutes this raid lasts once hatched at `hatchTime`. */
function hatchedMinutes(party: RaidParty, hatchTime: number, rules: RaidDurationRules): number {
  return party.raid.hatchedDuration ?? raidDurationsAt(raidKindOf(party), hatchTime, rules).hatched;
}

export function createRaid(input: NewRaid, rules: RaidDurationRules): RaidParty {
  const { autoStatus, now } = input;
  const attendees: Record<string, Attendee> = {};
  if (
    autoStatus === PartyStatus.Interested ||
    autoStatus === PartyStatus.Coming ||
    autoStatus === PartyStatus.Present
  ) {
    attendees[input.createdById] = { number: 1, status: autoStatus, group: 'A', remote: false };
  }
  const raid: RaidParty = {
    id: input.id,
    type: 'raid',
    guildId: input.guildId,
    status: 'active',
    regionId: input.regionId,
    gymId: input.gymId,
    forumChannelId: null,
    forumPostId: null,
    regionLinkMessageId: null,
    mirrorMessages: [],
    createdById: input.createdById,
    anonymous: input.anonymous,
    hatchTime: null,
    endTime: null,
    lastPossibleTime: null,
    deletionTime: null,
    saved: false,
    createdAt: now,
    updatedAt: now,
    attendees,
    groups: [{ id: 'A' }],
    defaultGroupId: 'A',
    raid: {
      tier: input.tier,
      boss: input.boss,
      fastMove: input.boss ? (input.fastMove ?? null) : null,
      chargedMove: input.boss ? (input.chargedMove ?? null) : null,
      reportedHatched: input.boss !== null,
      hatchedDuration: null,
      stageSeen: input.boss === null ? 'egg' : 'hatched',
    },
  };
  return settled(raid, rules, now);
}

/**
 * Sets when the egg hatches (or hatched); the end follows from it. Seconds are dropped. The
 * caller has checked the time (`resolvePartyTime`).
 */
export function setHatchTime(
  party: RaidParty,
  time: number,
  rules: RaidDurationRules,
  now: number,
): RaidParty {
  const hatchTime = Math.floor(time / MINUTE) * MINUTE;
  const endTime = hatchTime + hatchedMinutes(party, hatchTime, rules) * MINUTE;
  return settled({ ...party, hatchTime, endTime }, rules, now);
}

/** Sets when the raid ends; the hatch time follows from it. Seconds are dropped. */
export function setEndTime(
  party: RaidParty,
  time: number,
  rules: RaidDurationRules,
  now: number,
): RaidParty {
  const endTime = Math.floor(time / MINUTE) * MINUTE;
  const byHand = party.raid.hatchedDuration;
  const hatchTime =
    byHand === null
      ? hatchTimeForEnd(raidKindOf(party), endTime, rules)
      : endTime - byHand * MINUTE;
  return settled({ ...party, hatchTime, endTime }, rules, now);
}

/**
 * Sets how long this raid lasts once hatched, for the raids that differ from the rule. The
 * hatch time stays and the end moves, whether the raid has hatched or not (as the legacy bot
 * did): a member who gives a duration is correcting how long the boss stays.
 */
export function setHatchedDuration(
  party: RaidParty,
  minutes: number,
  maxMinutes: number,
  rules: RaidDurationRules,
  now: number,
): Change<RaidParty> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > maxMinutes)
    return refused('bad-duration');
  const changed: RaidParty = { ...party, raid: { ...party.raid, hatchedDuration: minutes } };
  const endTime = party.hatchTime === null ? party.endTime : party.hatchTime + minutes * MINUTE;
  return { ok: true, party: settled({ ...changed, endTime }, rules, now) };
}

export interface BossChange {
  tier: RaidTier;
  /** Null turns the raid back into an egg of that tier. */
  boss: RaidBossRef | null;
  /** Moves to preset, e.g. when the boss has only one. Earlier moves are forgotten in any case. */
  fastMove?: string | null;
  chargedMove?: string | null;
}

/**
 * Sets the boss, or the tier of an egg. Only when the new tier is another kind of raid (a
 * standard raid turns out to be elite) are the times touched: an egg keeps its hatch time and a
 * hatched raid keeps its end, and the other time is worked out again. Any other boss change
 * leaves both times exactly as they are. An elite raid is in person only, so remote flags are
 * dropped.
 *
 * `changed` is false when boss and tier are what they were; `wasEgg` says whether the raid had
 * no boss before (attendees who asked to be told about the boss are told then).
 */
export function setBoss(
  party: RaidParty,
  change: BossChange,
  rules: RaidDurationRules,
  now: number,
): { party: RaidParty; changed: boolean; wasEgg: boolean } {
  const before = party.raid;
  const wasEgg = before.boss === null;
  if (sameBoss(before.boss, change.boss) && sameRaidTier(before.tier, change.tier)) {
    return { party, changed: false, wasEgg };
  }
  let next: RaidParty = {
    ...party,
    raid: {
      ...before,
      tier: change.tier,
      boss: change.boss,
      fastMove: change.boss ? (change.fastMove ?? null) : null,
      chargedMove: change.boss ? (change.chargedMove ?? null) : null,
    },
  };
  if (change.tier.level === 'Elite') {
    next = {
      ...next,
      attendees: Object.fromEntries(
        Object.entries(next.attendees).map(([id, attendee]) => [
          id,
          { ...attendee, remote: false },
        ]),
      ),
    };
  }
  const kindChanged = raidDurationKind(before.tier) !== raidDurationKind(change.tier);
  if (kindChanged && next.hatchTime !== null && next.endTime !== null) {
    next =
      now < next.hatchTime
        ? setHatchTime(next, next.hatchTime, rules, now)
        : setEndTime(next, next.endTime, rules, now);
  }
  return { party: settled(next, rules, now), changed: true, wasEgg };
}

/** Sets one or both moves of the boss. The caller has checked that the boss can have them. */
export function setMoveset(
  party: RaidParty,
  moves: { fastMove?: string; chargedMove?: string },
): Change<RaidParty> {
  if (party.raid.boss === null) return refused('no-boss');
  return {
    ok: true,
    party: {
      ...party,
      raid: {
        ...party.raid,
        fastMove: moves.fastMove ?? party.raid.fastMove,
        chargedMove: moves.chargedMove ?? party.raid.chargedMove,
      },
    },
  };
}

/** Moves the raid to another gym. `regionChanged` means its post must move to another forum. */
export function setGym(
  party: RaidParty,
  gymId: number,
  regionId: number,
): { party: RaidParty; regionChanged: boolean } {
  return { party: { ...party, gymId, regionId }, regionChanged: regionId !== party.regionId };
}

/** A moderator keeps the party (never archived automatically) or lets it go again. */
export function setSaved<P extends { saved: boolean; deletionTime: number | null }>(
  party: P,
  saved: boolean,
): P {
  return { ...party, saved, deletionTime: saved ? null : party.deletionTime };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run --project unit src/domain/party/raid.test.ts`
Expected: PASS (1 file, 29 tests).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/domain/party test/support/parties.ts
npm run check
git add src/domain/party/party.ts src/domain/party/raid.ts src/domain/party/raid.test.ts test/support/parties.ts
git commit -m "Party model: the raid as data, its times, boss, moves and stage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Attendance and groups

**Files:**
- Create: `src/domain/party/attendance.ts`, `src/domain/party/attendance.test.ts`

**Interfaces:**
- Consumes: Task 3 (`Party`, `Attendee`, `Change`, `refused`, `attendeeOf`, `groupOf`, `membersWhere`, `remoteAllowed`, `GROUP_IDS`; test support).
- Produces: `MAX_GROUP_LABEL`, `AttendanceLimits { maxNumber }`, `attendanceLimits(settings)`, `AttendanceOptions { number?; group?; remote? }`, and, each generic over `P extends Party`:
  - `setAttendance(party, memberId, status, options, limits): Change<P, { joined: boolean }>` (status is interested, coming or present)
  - `setRemote(party, memberId, remote, options, limits): Change<P, { joined: boolean }>`
  - `changeNumber(party, memberId, delta: 1 | -1, limits): Change<P, { joined: boolean; changed: boolean }>`
  - `setNotHere(party, memberId): Change<P>`, `leaveParty(party, memberId): Change<P>`
  - `completeRaid(party, memberId, now, timeoutMinutes): Change<P, { asked: string[] }>`
  - `askGroupWhetherComplete(party, groupId, now, timeoutMinutes): { party: P; asked: string[] }`
  - `answerCompletion(party, memberId, completed: boolean): Change<P>`
  - `completeUnanswered(party, now): { party: P; completed: string[] }`
  - `joinGroup(party, memberId, groupId, limits): Change<P, { joined: boolean }>`
  - `createGroup(party, memberId, limits): Change<P, { group: GroupId; joined: boolean; others: string[] }>`
  - `labelGroup(party, memberId, text): Change<P, { group: GroupId }>`
  - `setMeetingTime(party, memberId, time: number | null): Change<P, { group: GroupId; others: string[] }>`
  - `applyAutoStatus(party, memberId, status): P`

- [ ] **Step 1: Write the failing test**

Create `src/domain/party/attendance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testRaid,
  withAttendees,
} from '../../../test/support/parties.js';
import {
  answerCompletion,
  applyAutoStatus,
  attendanceLimits,
  changeNumber,
  completeRaid,
  completeUnanswered,
  createGroup,
  joinGroup,
  labelGroup,
  leaveParty,
  setAttendance,
  setMeetingTime,
  setNotHere,
  setRemote,
} from './attendance.js';
import { headCount, type Change, type RaidParty } from './party.js';
import { PartyStatus } from './status.js';

const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;

/** The party of a change that must have worked. */
function done<Extra>(change: Change<RaidParty, Extra>): RaidParty {
  if (!change.ok) throw new Error(`refused: ${change.reason}`);
  return change.party;
}

describe('setAttendance', () => {
  it('signs a new member up alone, in person, in the default group', () => {
    const change = setAttendance(testRaid(), ALICE, Coming, {}, limits);
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(done(change).attendees[ALICE]).toEqual({
      number: 1,
      status: Coming,
      group: 'A',
      remote: false,
    });
  });

  it('takes count, group and remote for a new member', () => {
    const party = done(createGroup(testRaid(), REPORTER, limits));
    const change = setAttendance(
      party,
      ALICE,
      Present,
      { number: 3, group: 'A', remote: true },
      limits,
    );
    expect(done(change).attendees[ALICE]).toEqual({
      number: 3,
      status: Present,
      group: 'A',
      remote: true,
    });
  });

  it('changes only the status of an attendee unless more is given', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { number: 4, group: 'A', remote: true } });
    const change = setAttendance(party, ALICE, Present, {}, limits);
    expect(change).toMatchObject({ ok: true, joined: false });
    expect(done(change).attendees[ALICE]).toEqual({
      number: 4,
      status: Present,
      group: 'A',
      remote: true,
    });
    expect(
      done(setAttendance(party, ALICE, Coming, { number: 2 }, limits)).attendees[ALICE]?.number,
    ).toBe(2);
  });

  it('works from every status and forgets a pending question', () => {
    const party = withAttendees(testRaid(), {
      [ALICE]: { status: Complete },
      [BOB]: { status: CompletePending, pendingUntil: PARTY_NOW + 5 * MINUTE },
    });
    expect(done(setAttendance(party, ALICE, Interested, {}, limits)).attendees[ALICE]?.status).toBe(
      Interested,
    );
    expect(done(setAttendance(party, BOB, Coming, {}, limits)).attendees[BOB]).toEqual({
      number: 1,
      status: Coming,
      group: 'A',
      remote: false,
    });
  });

  it('refuses a head count outside 1 to 21, an unknown group, and remote on an elite raid', () => {
    const party = testRaid();
    for (const number of [0, -1, 22, 1.5, Number.NaN]) {
      expect(setAttendance(party, ALICE, Coming, { number }, limits)).toEqual({
        ok: false,
        reason: 'bad-count',
      });
    }
    expect(setAttendance(party, ALICE, Coming, { number: 21 }, limits).ok).toBe(true);
    expect(setAttendance(party, ALICE, Coming, { group: 'B' }, limits)).toEqual({
      ok: false,
      reason: 'no-such-group',
    });
    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
    expect(setAttendance(elite, ALICE, Coming, { remote: true }, limits)).toEqual({
      ok: false,
      reason: 'in-person-only',
    });
    expect(setAttendance(elite, ALICE, Coming, { remote: false }, limits).ok).toBe(true);
  });

  it('never changes the party it was given', () => {
    const party = testRaid();
    const before = structuredClone(party);
    setAttendance(party, ALICE, Coming, { number: 2 }, limits);
    expect(party).toEqual(before);
  });

  it('is not fooled by a member id that is a property of every object', () => {
    const change = setAttendance(testRaid(), 'constructor', Coming, {}, limits);
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(leaveParty(testRaid(), 'toString')).toEqual({ ok: false, reason: 'not-attending' });
  });
});

describe('setRemote', () => {
  it('signs a new member up as interested with the flag', () => {
    const change = setRemote(testRaid(), ALICE, true, { number: 2 }, limits);
    expect(change).toMatchObject({ ok: true, joined: true });
    expect(done(change).attendees[ALICE]).toEqual({
      number: 2,
      status: Interested,
      group: 'A',
      remote: true,
    });
  });

  it('keeps the status of an attendee, both ways', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { status: Present } });
    const remote = done(setRemote(party, ALICE, true, {}, limits));
    expect(remote.attendees[ALICE]).toMatchObject({ status: Present, remote: true });
    expect(done(setRemote(remote, ALICE, false, {}, limits)).attendees[ALICE]).toMatchObject({
      status: Present,
      remote: false,
    });
  });

  it('is refused on an elite raid, for a new member and for an attendee', () => {
    const elite = withAttendees(testRaid({ tier: { level: 'Elite', shadow: false } }), {
      [ALICE]: {},
    });
    expect(setRemote(elite, ALICE, true, {}, limits)).toEqual({
      ok: false,
      reason: 'in-person-only',
    });
    expect(setRemote(elite, BOB, true, {}, limits)).toEqual({
      ok: false,
      reason: 'in-person-only',
    });
    expect(setRemote(elite, ALICE, false, {}, limits).ok).toBe(true);
  });
});

describe('changeNumber', () => {
  it('adds and takes away one, within 1 and the maximum', () => {
    let party = withAttendees(testRaid(), { [ALICE]: { number: 1 } });
    expect(changeNumber(party, ALICE, -1, limits)).toMatchObject({ ok: true, changed: false });
    party = done(changeNumber(party, ALICE, 1, limits));
    expect(party.attendees[ALICE]?.number).toBe(2);
    party = withAttendees(party, { [ALICE]: { number: 21 } });
    expect(changeNumber(party, ALICE, 1, limits)).toMatchObject({ ok: true, changed: false });
    expect(done(changeNumber(party, ALICE, -1, limits)).attendees[ALICE]?.number).toBe(20);
  });

  it('signs somebody up as interested on +1 and refuses -1 from somebody not signed up', () => {
    const change = changeNumber(testRaid(), ALICE, 1, limits);
    expect(change).toMatchObject({ ok: true, joined: true, changed: true });
    expect(done(change).attendees[ALICE]).toMatchObject({ number: 1, status: Interested });
    expect(changeNumber(testRaid(), ALICE, -1, limits)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });
});

describe('setNotHere and leaveParty', () => {
  it('puts an attendee back to interested and removes one who leaves', () => {
    const party = withAttendees(testRaid(), { [ALICE]: { status: Present, number: 2 } });
    expect(done(setNotHere(party, ALICE)).attendees[ALICE]).toMatchObject({
      status: Interested,
      number: 2,
    });
    expect(done(leaveParty(party, ALICE)).attendees).not.toHaveProperty(ALICE);
    expect(done(leaveParty(party, ALICE)).attendees).toHaveProperty(REPORTER);
  });

  it('refuses both from somebody who is not signed up, instead of adding them', () => {
    expect(setNotHere(testRaid(), ALICE)).toEqual({ ok: false, reason: 'not-attending' });
    expect(leaveParty(testRaid(), ALICE)).toEqual({ ok: false, reason: 'not-attending' });
  });
});

describe('completing a raid', () => {
  const party = withAttendees(done(createGroup(testRaid(), REPORTER, limits)), {
    [ALICE]: { status: Present, group: 'A' },
    [BOB]: { status: Present, group: 'A', number: 2 },
    [CAROL]: { status: Coming, group: 'A' },
    '200000000000000009': { status: Present, group: 'B' },
  });

  it('completes the member and asks the present members of the same group', () => {
    const change = completeRaid(party, ALICE, PARTY_NOW, 5);
    expect(change).toMatchObject({ ok: true, asked: [BOB] });
    const after = done(change);
    expect(after.attendees[ALICE]?.status).toBe(Complete);
    expect(after.attendees[BOB]).toMatchObject({
      status: CompletePending,
      pendingUntil: PARTY_NOW + 5 * MINUTE,
    });
    expect(after.attendees[CAROL]?.status).toBe(Coming);
    expect(after.attendees['200000000000000009']?.status).toBe(Present);
  });

  it('refuses somebody who never signed up, instead of adding them as complete', () => {
    expect(completeRaid(party, '200000000000000099', PARTY_NOW, 5)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });

  it('takes yes and no as an answer, once', () => {
    const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
    const yes = done(answerCompletion(asked, BOB, true));
    expect(yes.attendees[BOB]).toEqual({ number: 2, status: Complete, group: 'A', remote: false });
    const no = done(answerCompletion(asked, BOB, false));
    expect(no.attendees[BOB]).toEqual({ number: 2, status: Present, group: 'A', remote: false });
    expect(answerCompletion(yes, BOB, false)).toEqual({ ok: false, reason: 'not-pending' });
    expect(answerCompletion(asked, CAROL, true)).toEqual({ ok: false, reason: 'not-pending' });
    expect(answerCompletion(asked, '200000000000000099', true)).toEqual({
      ok: false,
      reason: 'not-pending',
    });
  });

  it('counts silence as yes once the time is up, and not a moment before', () => {
    const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
    expect(completeUnanswered(asked, PARTY_NOW + 5 * MINUTE - 1)).toEqual({
      party: asked,
      completed: [],
    });
    const late = completeUnanswered(asked, PARTY_NOW + 5 * MINUTE);
    expect(late.completed).toEqual([BOB]);
    expect(late.party.attendees[BOB]).toEqual({
      number: 2,
      status: Complete,
      group: 'A',
      remote: false,
    });
  });

  it('leaves the completed out of the head count but keeps those who were asked', () => {
    const asked = done(completeRaid(party, ALICE, PARTY_NOW, 5));
    // Group A: Bob 2 (asked) and Carol 1; Alice is done. Group B: the reporter and one more.
    expect(headCount(asked, 'A')).toBe(3);
    expect(headCount(asked)).toBe(5);
  });
});

describe('groups', () => {
  it('opens groups B to E, makes the newest the default and moves the member into it', () => {
    let party = withAttendees(testRaid(), {
      [ALICE]: { status: Present, number: 3 },
      [BOB]: { status: Complete },
    });
    const change = createGroup(party, ALICE, limits);
    expect(change).toMatchObject({ ok: true, group: 'B', joined: false, others: [REPORTER] });
    party = done(change);
    expect(party.groups.map((group) => group.id)).toEqual(['A', 'B']);
    expect(party.defaultGroupId).toBe('B');
    expect(party.attendees[ALICE]).toMatchObject({ group: 'B', status: Present, number: 3 });
    expect(done(setAttendance(party, CAROL, Coming, {}, limits)).attendees[CAROL]?.group).toBe('B');

    for (const id of ['C', 'D', 'E']) {
      const next = createGroup(party, ALICE, limits);
      expect(next).toMatchObject({ ok: true, group: id });
      party = done(next);
    }
    expect(createGroup(party, ALICE, limits)).toEqual({ ok: false, reason: 'too-many-groups' });
  });

  it('adds somebody who is not signed up as coming when they open or join a group', () => {
    const opened = createGroup(testRaid(), ALICE, limits);
    expect(opened).toMatchObject({ ok: true, joined: true });
    expect(done(opened).attendees[ALICE]).toEqual({
      number: 1,
      status: Coming,
      group: 'B',
      remote: false,
    });
    const joined = joinGroup(done(opened), BOB, 'A', limits);
    expect(joined).toMatchObject({ ok: true, joined: true });
    expect(done(joined).attendees[BOB]).toMatchObject({ status: Coming, group: 'A' });
  });

  it('moves an attendee to another group and refuses a group that does not exist', () => {
    const party = withAttendees(done(createGroup(testRaid(), REPORTER, limits)), {
      [ALICE]: { status: Present, number: 2, group: 'A' },
    });
    expect(done(joinGroup(party, ALICE, 'B', limits)).attendees[ALICE]).toMatchObject({
      status: Present,
      number: 2,
      group: 'B',
    });
    expect(joinGroup(party, ALICE, 'C', limits)).toEqual({ ok: false, reason: 'no-such-group' });
    expect(joinGroup(party, BOB, 'C', limits)).toEqual({ ok: false, reason: 'no-such-group' });
  });

  it('labels the group of an attendee, tidies the text, and removes the label with an empty one', () => {
    let party = done(labelGroup(testRaid(), REPORTER, '  park   side \n'));
    expect(party.groups).toEqual([{ id: 'A', label: 'park side' }]);
    party = done(labelGroup(party, REPORTER, '   '));
    expect(party.groups).toEqual([{ id: 'A' }]);
    expect(labelGroup(party, ALICE, 'mine')).toEqual({ ok: false, reason: 'not-attending' });
    expect(labelGroup(party, REPORTER, 'x'.repeat(101))).toEqual({
      ok: false,
      reason: 'label-too-long',
    });
    expect(labelGroup(party, REPORTER, 'x'.repeat(100)).ok).toBe(true);
  });

  it('sets and removes the meeting time of the own group and names who to tell', () => {
    const base = withAttendees(done(createGroup(testRaid(), REPORTER, limits)), {
      [ALICE]: { group: 'A', status: Interested },
      [BOB]: { group: 'A', status: Complete },
      [CAROL]: { group: 'A', status: Present },
    });
    const meet = PARTY_NOW + 30 * MINUTE;
    const change = setMeetingTime(base, ALICE, meet);
    expect(change).toMatchObject({ ok: true, group: 'A', others: [CAROL] });
    let party = done(change);
    expect(party.groups).toEqual([{ id: 'A', startTime: meet }, { id: 'B' }]);

    // A new time forgets that the old one had passed; null removes both.
    party = {
      ...party,
      groups: [{ id: 'A', startTime: meet, startClearTime: meet + 10 * MINUTE }, { id: 'B' }],
    };
    expect(done(setMeetingTime(party, ALICE, meet + MINUTE)).groups[0]).toEqual({
      id: 'A',
      startTime: meet + MINUTE,
    });
    expect(done(setMeetingTime(party, ALICE, null)).groups[0]).toEqual({ id: 'A' });
    expect(setMeetingTime(party, '200000000000000099', meet)).toEqual({
      ok: false,
      reason: 'not-attending',
    });
  });
});

describe('applyAutoStatus', () => {
  it('signs up somebody who is not an attendee and leaves an attendee exactly as they are', () => {
    const party = withAttendees(testRaid(), {
      [ALICE]: { status: Present, number: 3, remote: true },
    });
    expect(applyAutoStatus(party, ALICE, Interested)).toBe(party);
    expect(applyAutoStatus(party, BOB, Coming).attendees[BOB]).toEqual({
      number: 1,
      status: Coming,
      group: 'A',
      remote: false,
    });
    expect(applyAutoStatus(party, BOB, PartyStatus.NotInterested)).toBe(party);
  });
});
```

Run: `npx vitest run --project unit src/domain/party/attendance.test.ts`
Expected: FAIL, the module `attendance.js` cannot be found.

- [ ] **Step 2: The implementation**

Create `src/domain/party/attendance.ts`:

```ts
import {
  attendeeOf,
  GROUP_IDS,
  groupOf,
  membersWhere,
  refused,
  remoteAllowed,
  type Attendee,
  type AttendeeStatus,
  type Change,
  type GroupId,
  type Party,
  type PartyGroup,
} from './party.js';
import { PartyStatus } from './status.js';

const MINUTE = 60_000;
/** A group label is shown in the post and in a select menu, which takes 100 characters. */
export const MAX_GROUP_LABEL = 100;

export interface AttendanceLimits {
  /** The largest head count one member may bring, themself included. */
  maxNumber: number;
}

/** `maximumAdditionalAttendees` of the settings counts the people a member brings along. */
export function attendanceLimits(settings: {
  maximumAdditionalAttendees: number;
}): AttendanceLimits {
  return { maxNumber: 1 + settings.maximumAdditionalAttendees };
}

export interface AttendanceOptions {
  /** Head count, the member included. Kept as it is when omitted (1 for a new attendee). */
  number?: number;
  /** Kept when omitted (the default group for a new attendee). */
  group?: GroupId;
  /** Kept when omitted (in person for a new attendee). */
  remote?: boolean;
}

function withAttendee<P extends Party>(party: P, memberId: string, attendee: Attendee): P {
  return { ...party, attendees: { ...party.attendees, [memberId]: attendee } };
}

function withGroup<P extends Party>(party: P, group: PartyGroup): P {
  return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
}

function checked(
  party: Party,
  options: AttendanceOptions,
  limits: AttendanceLimits,
): 'no-such-group' | 'bad-count' | 'in-person-only' | undefined {
  const { number, group, remote } = options;
  if (
    number !== undefined &&
    (!Number.isInteger(number) || number < 1 || number > limits.maxNumber)
  )
    return 'bad-count';
  if (group !== undefined && !groupOf(party, group)) return 'no-such-group';
  if (remote === true && !remoteAllowed(party)) return 'in-person-only';
  return undefined;
}

/**
 * Signs a member up as interested, coming or present, or changes an attendee to that status.
 * It works from every status (a member who was done can come back). What `options` leaves out
 * stays as it is.
 */
export function setAttendance<P extends Party>(
  party: P,
  memberId: string,
  status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
  options: AttendanceOptions,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  const problem = checked(party, options, limits);
  if (problem) return refused(problem);
  const existing = attendeeOf(party, memberId);
  const attendee: Attendee = {
    number: options.number ?? existing?.number ?? 1,
    status,
    group: options.group ?? existing?.group ?? party.defaultGroupId,
    remote: options.remote ?? existing?.remote ?? false,
  };
  return { ok: true, party: withAttendee(party, memberId, attendee), joined: !existing };
}

/**
 * Marks a member as taking part remotely or in person. An attendee keeps their status; anybody
 * else is signed up as interested.
 */
export function setRemote<P extends Party>(
  party: P,
  memberId: string,
  remote: boolean,
  options: Omit<AttendanceOptions, 'remote'>,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) {
    return setAttendance(party, memberId, PartyStatus.Interested, { ...options, remote }, limits);
  }
  const problem = checked(party, { ...options, remote }, limits);
  if (problem) return refused(problem);
  const attendee: Attendee = {
    ...existing,
    number: options.number ?? existing.number,
    group: options.group ?? existing.group,
    remote,
  };
  return { ok: true, party: withAttendee(party, memberId, attendee), joined: false };
}

/**
 * One more or one fewer in a member's head count. `+1` from somebody who is not signed up signs
 * them up as interested, alone. The count stays between 1 and the maximum; `changed` says
 * whether anything moved.
 */
export function changeNumber<P extends Party>(
  party: P,
  memberId: string,
  delta: 1 | -1,
  limits: AttendanceLimits,
): Change<P, { joined: boolean; changed: boolean }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) {
    if (delta < 0) return refused('not-attending');
    const signedUp = setAttendance(party, memberId, PartyStatus.Interested, {}, limits);
    return signedUp.ok ? { ...signedUp, changed: true } : signedUp;
  }
  const number = Math.min(Math.max(existing.number + delta, 1), limits.maxNumber);
  if (number === existing.number) return { ok: true, party, joined: false, changed: false };
  return {
    ok: true,
    party: withAttendee(party, memberId, { ...existing, number }),
    joined: false,
    changed: true,
  };
}

/** A present member steps back to interested ("not here"). Only for an attendee. */
export function setNotHere<P extends Party>(party: P, memberId: string): Change<P> {
  const existing = attendeeOf(party, memberId);
  if (!existing) return refused('not-attending');
  const { pendingUntil: _pendingUntil, ...rest } = existing;
  return {
    ok: true,
    party: withAttendee(party, memberId, { ...rest, status: PartyStatus.Interested }),
  };
}

/** Removes a member from the party. */
export function leaveParty<P extends Party>(party: P, memberId: string): Change<P> {
  if (!attendeeOf(party, memberId)) return refused('not-attending');
  const { [memberId]: _left, ...attendees } = party.attendees;
  return { ok: true, party: { ...party, attendees } };
}

/**
 * Members of a group who are present are asked whether they completed the raid: they become
 * `CompletePending` until `now + timeoutMinutes`, after which silence counts as yes.
 */
function askPresent<P extends Party>(
  party: P,
  groupId: GroupId,
  except: string | undefined,
  now: number,
  timeoutMinutes: number,
): { party: P; asked: string[] } {
  const asked = membersWhere(
    party,
    (attendee, memberId) =>
      memberId !== except && attendee.group === groupId && attendee.status === PartyStatus.Present,
  );
  if (asked.length === 0) return { party, asked };
  const attendees = { ...party.attendees };
  for (const memberId of asked) {
    const attendee = attendees[memberId];
    if (!attendee) continue;
    attendees[memberId] = {
      ...attendee,
      status: PartyStatus.CompletePending,
      pendingUntil: now + timeoutMinutes * MINUTE,
    };
  }
  return { party: { ...party, attendees }, asked };
}

/**
 * A member has completed the raid. The others of their group who are present are asked whether
 * they have too (`asked`). Only for an attendee.
 */
export function completeRaid<P extends Party>(
  party: P,
  memberId: string,
  now: number,
  timeoutMinutes: number,
): Change<P, { asked: string[] }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) return refused('not-attending');
  const { pendingUntil: _pendingUntil, ...rest } = existing;
  const done = withAttendee(party, memberId, { ...rest, status: PartyStatus.Complete });
  return { ok: true, ...askPresent(done, existing.group, memberId, now, timeoutMinutes) };
}

/** Asks the present members of a group, as after its meeting time (see `completeRaid`). */
export function askGroupWhetherComplete<P extends Party>(
  party: P,
  groupId: GroupId,
  now: number,
  timeoutMinutes: number,
): { party: P; asked: string[] } {
  return askPresent(party, groupId, undefined, now, timeoutMinutes);
}

/** A member's answer to "have you completed this raid?": yes completes, no is present again. */
export function answerCompletion<P extends Party>(
  party: P,
  memberId: string,
  completed: boolean,
): Change<P> {
  const existing = attendeeOf(party, memberId);
  if (existing?.status !== PartyStatus.CompletePending) return refused('not-pending');
  const { pendingUntil: _pendingUntil, ...rest } = existing;
  const status: AttendeeStatus = completed ? PartyStatus.Complete : PartyStatus.Present;
  return { ok: true, party: withAttendee(party, memberId, { ...rest, status }) };
}

/**
 * Completes everybody whose time to answer has run out; `completed` lists them. A pending
 * attendee without a time (it cannot happen through these functions) counts as run out.
 */
export function completeUnanswered<P extends Party>(
  party: P,
  now: number,
): { party: P; completed: string[] } {
  const completed = membersWhere(
    party,
    (attendee) =>
      attendee.status === PartyStatus.CompletePending && (attendee.pendingUntil ?? 0) <= now,
  );
  if (completed.length === 0) return { party, completed };
  const attendees = { ...party.attendees };
  for (const memberId of completed) {
    const attendee = attendees[memberId];
    if (!attendee) continue;
    const { pendingUntil: _pendingUntil, ...rest } = attendee;
    attendees[memberId] = { ...rest, status: PartyStatus.Complete };
  }
  return { party: { ...party, attendees }, completed };
}

/** Moves a member to a group. Somebody who is not signed up joins it as coming, alone. */
export function joinGroup<P extends Party>(
  party: P,
  memberId: string,
  groupId: GroupId,
  limits: AttendanceLimits,
): Change<P, { joined: boolean }> {
  const existing = attendeeOf(party, memberId);
  if (!existing) {
    return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
  }
  if (!groupOf(party, groupId)) return refused('no-such-group');
  return {
    ok: true,
    party: withAttendee(party, memberId, { ...existing, group: groupId }),
    joined: false,
  };
}

/**
 * Opens the next group and moves the member into it. It becomes the group new attendees land
 * in. `others` are the attendees who have not completed the raid, to be told about it.
 */
export function createGroup<P extends Party>(
  party: P,
  memberId: string,
  limits: AttendanceLimits,
): Change<P, { group: GroupId; joined: boolean; others: string[] }> {
  const id = GROUP_IDS[party.groups.length];
  if (id === undefined) return refused('too-many-groups');
  const opened: P = { ...party, groups: [...party.groups, { id }], defaultGroupId: id };
  const moved = joinGroup(opened, memberId, id, limits);
  if (!moved.ok) return moved;
  const others = membersWhere(
    moved.party,
    (attendee, other) => other !== memberId && attendee.status !== PartyStatus.Complete,
  );
  return { ...moved, group: id, others };
}

/** Sets the label of the member's own group; an empty text removes it. Only for an attendee. */
export function labelGroup<P extends Party>(
  party: P,
  memberId: string,
  text: string,
): Change<P, { group: GroupId }> {
  const existing = attendeeOf(party, memberId);
  const group = existing && groupOf(party, existing.group);
  if (!group) return refused('not-attending');
  const label = text.replace(/\s+/g, ' ').trim();
  if (label.length > MAX_GROUP_LABEL) return refused('label-too-long');
  const { label: _old, ...rest } = group;
  return {
    ok: true,
    party: withGroup(party, label === '' ? rest : { ...rest, label }),
    group: group.id,
  };
}

/**
 * Sets the meeting time of the member's own group, or removes it with null. `others` are the
 * attendees of that group who have not completed the raid, to be told. Only for an attendee.
 */
export function setMeetingTime<P extends Party>(
  party: P,
  memberId: string,
  time: number | null,
): Change<P, { group: GroupId; others: string[] }> {
  const existing = attendeeOf(party, memberId);
  const group = existing && groupOf(party, existing.group);
  if (!group) return refused('not-attending');
  const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
  const others = membersWhere(
    party,
    (attendee, other) =>
      other !== memberId && attendee.group === group.id && attendee.status !== PartyStatus.Complete,
  );
  return {
    ok: true,
    party: withGroup(party, time === null ? rest : { ...rest, startTime: time }),
    group: group.id,
    others,
  };
}

/**
 * The reporter's automatic status when they report a raid that already exists: applied only to
 * somebody who is not signed up, so that a second report never resets what a member chose.
 */
export function applyAutoStatus<P extends Party>(
  party: P,
  memberId: string,
  status: PartyStatus,
): P {
  if (attendeeOf(party, memberId)) return party;
  if (
    status !== PartyStatus.Interested &&
    status !== PartyStatus.Coming &&
    status !== PartyStatus.Present
  )
    return party;
  const attendee: Attendee = { number: 1, status, group: party.defaultGroupId, remote: false };
  return withAttendee(party, memberId, attendee);
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run --project unit src/domain/party/attendance.test.ts`
Expected: PASS (1 file, 25 tests).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/domain/party
npm run check
git add src/domain/party/attendance.ts src/domain/party/attendance.test.ts
git commit -m "Party model: attendance, the completion question, groups and meeting times" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: What the clock does: `partyTick`

**Files:**
- Create: `src/domain/party/tick.ts`, `src/domain/party/tick.test.ts`

**Interfaces:**
- Consumes: Task 3 (`RaidParty`, `raidStage`, `setBoss`, `setHatchTime`, `setEndTime`, `setSaved`), Task 4 (`askGroupWhetherComplete`, `completeUnanswered`), Task 1 (`RaidDurationRules`).
- Produces:
  - `TickSettings` (`startClearTime`, `deletionGraceTime`, `deletionWarningTime`, `raidCompleteTimeout` of the settings, all minutes).
  - `TickInput { now; previous: number | null; settings; rules; autoset(tier) }`, where `autoset` returns `{ boss: RaidBossRef; fastMove?; chargedMove? } | undefined`.
  - `TickEffect`: `{ kind: 'stage'; from; to; bossSet }`, `{ kind: 'refresh' }`, `{ kind: 'ask-complete'; group; members }`, `{ kind: 'completed'; members }`, `{ kind: 'warn'; deletionTime }`, `{ kind: 'end' }`.
  - `partyTick(party: RaidParty, input: TickInput): { party: RaidParty; effects: TickEffect[] }`.
  - `endParty(party)`: the party with `status: 'ended'`.

The order of the effects of one tick is fixed: stage, ask-complete (per group), completed, warn or end, refresh.

- [ ] **Step 1: Write the failing test**

Create `src/domain/party/tick.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import { TEST_SETTINGS_PATH } from '../../../test/support/test-context.js';
import { loadSettings } from '../../config/settings.js';
import type { RaidParty } from './party.js';
import { setEndTime, setHatchTime, setSaved } from './raid.js';
import { PartyStatus } from './status.js';
import { endParty, partyTick, type TickInput } from './tick.js';

const rules = testRaidRules();
/** Start-clear 10, grace 5, warning 10, completion timeout 5 minutes. */
const settings = loadSettings(TEST_SETTINGS_PATH);
const { Present, Coming, CompletePending, Complete } = PartyStatus;

function tick(party: RaidParty, now: number, extra: Partial<TickInput> = {}) {
  return partyTick(party, {
    now,
    previous: now - MINUTE,
    settings,
    rules,
    autoset: () => undefined,
    ...extra,
  });
}

/** An egg reported at 14:00 that hatches at 14:30 and ends at 15:15. */
const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);

describe('partyTick: stages', () => {
  it('does nothing while nothing is due', () => {
    expect(tick(egg, at('2026-10-13T14:29'))).toEqual({ party: egg, effects: [] });
  });

  it('reports the hatch once', () => {
    const first = tick(egg, at('2026-10-13T14:30'));
    expect(first.effects).toEqual([{ kind: 'stage', from: 'egg', to: 'hatched', bossSet: false }]);
    expect(first.party.raid.stageSeen).toBe('hatched');
    expect(tick(first.party, at('2026-10-13T14:31')).effects).toEqual([]);
  });

  it('gives a hatching egg the boss its tier is sure to have', () => {
    const result = tick(egg, at('2026-10-13T14:30'), {
      autoset: (tier) =>
        tier.level === 'T5' ? { boss: { key: 'yveltal' }, fastMove: 'SNARL_FAST' } : undefined,
    });
    expect(result.effects).toEqual([{ kind: 'stage', from: 'egg', to: 'hatched', bossSet: true }]);
    expect(result.party.raid).toMatchObject({
      boss: { key: 'yveltal' },
      fastMove: 'SNARL_FAST',
      stageSeen: 'hatched',
    });
    expect(result.party).toMatchObject({ hatchTime: egg.hatchTime, endTime: egg.endTime });
  });

  it('leaves a boss alone that a member already named', () => {
    const named = { ...egg, raid: { ...egg.raid, boss: { key: 'xerneas' } } };
    const result = tick(named, at('2026-10-13T14:30'), {
      autoset: () => ({ boss: { key: 'yveltal' } }),
    });
    expect(result.party.raid.boss).toEqual({ key: 'xerneas' });
    expect(result.effects).toEqual([{ kind: 'stage', from: 'egg', to: 'hatched', bossSet: false }]);
  });

  it('reports the end, and a raid that goes back to being an egg after a correction', () => {
    const hatched = tick(egg, at('2026-10-13T14:30')).party;
    expect(tick(hatched, at('2026-10-13T15:15')).effects).toEqual([
      { kind: 'stage', from: 'hatched', to: 'ended', bossSet: false },
    ]);
    const corrected = setHatchTime(hatched, at('2026-10-13T14:50'), rules, at('2026-10-13T14:31'));
    expect(tick(corrected, at('2026-10-13T14:32')).effects).toEqual([
      { kind: 'stage', from: 'hatched', to: 'egg', bossSet: false },
    ]);
  });

  it('catches up in one tick after the bot was down, and is quiet on the next', () => {
    // Down from 14:10 to 15:40: hatch and end were missed, and the grace time has passed.
    const late = at('2026-10-13T15:40');
    const first = tick(egg, late, { previous: null });
    expect(first.effects).toEqual([
      { kind: 'stage', from: 'egg', to: 'ended', bossSet: false },
      { kind: 'warn', deletionTime: late + 10 * MINUTE },
    ]);
    expect(tick(first.party, late + MINUTE).effects).toEqual([]);
  });
});

describe('partyTick: meeting times', () => {
  const meet = at('2026-10-13T14:40');
  const meeting: RaidParty = {
    ...withAttendees(egg, {
      [ALICE]: { status: Present },
      [BOB]: { status: Coming },
      [CAROL]: { status: Present, group: 'A', number: 2 },
    }),
    groups: [{ id: 'A', startTime: meet }],
    raid: { ...egg.raid, stageSeen: 'hatched' },
  };

  it('keeps a meeting time shown for ten minutes after it passed', () => {
    expect(tick(meeting, meet).effects).toEqual([]);
    const passed = tick(meeting, meet + MINUTE);
    expect(passed.effects).toEqual([{ kind: 'refresh' }]);
    expect(passed.party.groups).toEqual([
      { id: 'A', startTime: meet, startClearTime: meet + 10 * MINUTE },
    ]);
    expect(tick(passed.party, meet + 10 * MINUTE).effects).toEqual([]);
  });

  it('then removes it and asks the present members of the group', () => {
    const passed = tick(meeting, meet + MINUTE).party;
    const now = meet + 11 * MINUTE;
    const cleared = tick(passed, now);
    expect(cleared.effects).toEqual([
      { kind: 'ask-complete', group: 'A', members: [ALICE, CAROL] },
      { kind: 'refresh' },
    ]);
    expect(cleared.party.groups).toEqual([{ id: 'A' }]);
    expect(cleared.party.attendees[ALICE]).toMatchObject({
      status: CompletePending,
      pendingUntil: now + 5 * MINUTE,
    });
    expect(cleared.party.attendees[BOB]?.status).toBe(Coming);
  });

  it('does both at once when the bot was down over the whole time', () => {
    const result = tick(meeting, meet + 30 * MINUTE, { previous: null });
    expect(result.party.groups).toEqual([{ id: 'A' }]);
    expect(result.effects).toContainEqual({
      kind: 'ask-complete',
      group: 'A',
      members: [ALICE, CAROL],
    });
  });

  it('asks nobody when nobody of the group is present', () => {
    const nobody = withAttendees(meeting, {
      [ALICE]: { status: Coming },
      [CAROL]: { status: Complete },
    });
    expect(tick(nobody, meet + 30 * MINUTE).effects).toEqual([{ kind: 'refresh' }]);
  });
});

describe('partyTick: unanswered questions', () => {
  it('completes those whose time to answer is up, also after a restart', () => {
    const asked = withAttendees(
      { ...egg, raid: { ...egg.raid, stageSeen: 'hatched' } },
      {
        [ALICE]: { status: CompletePending, pendingUntil: at('2026-10-13T14:45') },
        [BOB]: { status: CompletePending, pendingUntil: at('2026-10-13T14:50') },
      },
    );
    const result = tick(asked, at('2026-10-13T14:46'), { previous: null });
    expect(result.effects).toEqual([{ kind: 'completed', members: [ALICE] }]);
    expect(result.party.attendees[ALICE]?.status).toBe(Complete);
    expect(result.party.attendees[BOB]?.status).toBe(CompletePending);
  });
});

describe('partyTick: archiving', () => {
  const ended = (now: number): RaidParty => ({
    ...setEndTime(testRaid(), at('2026-10-13T15:15'), rules, PARTY_NOW),
    raid: { ...egg.raid, stageSeen: now >= at('2026-10-13T15:15') ? 'ended' : 'hatched' },
  });

  it('schedules it five minutes after the end, ten minutes ahead, with a warning', () => {
    const before = at('2026-10-13T15:20');
    expect(tick(ended(before), before).effects).toEqual([]);
    const after = before + 1;
    const result = tick(ended(after), after);
    expect(result.effects).toEqual([{ kind: 'warn', deletionTime: after + 10 * MINUTE }]);
    expect(result.party.deletionTime).toBe(after + 10 * MINUTE);
  });

  it('asks for the end at the archiving time, every tick until the party is ended', () => {
    const now = at('2026-10-13T15:21');
    const scheduled = tick(ended(now), now).party;
    expect(tick(scheduled, now + 10 * MINUTE - 1).effects).toEqual([]);
    expect(tick(scheduled, now + 10 * MINUTE).effects).toEqual([{ kind: 'end' }]);
    expect(tick(scheduled, now + 11 * MINUTE).effects).toEqual([{ kind: 'end' }]);
    const gone = endParty(scheduled);
    expect(gone.status).toBe('ended');
    expect(tick(gone, now + 12 * MINUTE)).toEqual({ party: gone, effects: [] });
  });

  it('goes by the last possible time for a raid nobody gave a time', () => {
    const raid = testRaid();
    const over = PARTY_NOW + 110 * MINUTE;
    expect(tick({ ...raid, raid: { ...raid.raid, stageSeen: 'ended' } }, over).effects).toEqual([]);
    expect(tick({ ...raid, raid: { ...raid.raid, stageSeen: 'ended' } }, over + 1).effects).toEqual(
      [{ kind: 'warn', deletionTime: over + 1 + 10 * MINUTE }],
    );
  });

  it('never schedules or ends a party a moderator saved', () => {
    const now = at('2026-10-13T16:00');
    const saved = setSaved(ended(now), true);
    expect(tick(saved, now).effects).toEqual([]);
    expect(tick({ ...saved, deletionTime: now - MINUTE }, now).effects).toEqual([]);
  });

  it('starts over when a corrected time called the archiving off', () => {
    const now = at('2026-10-13T15:21');
    const scheduled = tick(ended(now), now).party;
    const corrected = setEndTime(scheduled, at('2026-10-13T15:45'), rules, now);
    expect(corrected.deletionTime).toBeNull();
    expect(tick(corrected, now + 10 * MINUTE).effects).toEqual([
      { kind: 'stage', from: 'ended', to: 'hatched', bossSet: false },
    ]);
  });
});

describe('partyTick: the date', () => {
  it('asks for a fresh post when the day changed since the previous tick', () => {
    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
    const midnight = at('2026-10-14T00:00');
    expect(tick(ex, midnight + 1000, { previous: midnight - 1000 }).effects).toEqual([
      { kind: 'refresh' },
    ]);
    expect(tick(ex, midnight + 61_000, { previous: midnight + 1000 }).effects).toEqual([]);
    expect(tick(ex, midnight + 1000, { previous: null }).effects).toEqual([]);
  });
});
```

Run: `npx vitest run --project unit src/domain/party/tick.test.ts`
Expected: FAIL, the module `tick.js` cannot be found.

- [ ] **Step 2: The implementation**

Create `src/domain/party/tick.ts`:

```ts
import { DateTime } from 'luxon';
import type { Settings } from '../../config/settings.js';
import type { RaidTier } from '../pogo/raid-tier.js';
import type { RaidDurationRules } from '../time/raid-durations.js';
import { askGroupWhetherComplete, completeUnanswered } from './attendance.js';
import type { GroupId, PartyGroup, RaidBossRef, RaidParty, RaidStage } from './party.js';
import { raidStage, setBoss } from './raid.js';

const MINUTE = 60_000;

export type TickSettings = Pick<
  Settings,
  'startClearTime' | 'deletionGraceTime' | 'deletionWarningTime' | 'raidCompleteTimeout'
>;

export interface TickInput {
  now: number;
  /** When the previous tick ran; null for the first tick after a start. */
  previous: number | null;
  settings: TickSettings;
  rules: RaidDurationRules;
  /**
   * What an egg of this tier hatches as when nobody has said (`ctx.raidBosses.autoset`), with
   * the moves to preset; undefined when that is not certain.
   */
  autoset: (
    tier: RaidTier,
  ) => { boss: RaidBossRef; fastMove?: string | null; chargedMove?: string | null } | undefined;
}

/** What the caller must do after a tick, besides saving the party. */
export type TickEffect =
  /** The raid hatched or ended (or went back, after a time was corrected): post, tags, title. */
  | { kind: 'stage'; from: RaidStage; to: RaidStage; bossSet: boolean }
  /** Show the post anew: a meeting time passed or was removed, or the date changed. */
  | { kind: 'refresh' }
  /** These present members of a group are asked whether they completed the raid. */
  | { kind: 'ask-complete'; group: GroupId; members: string[] }
  /** These members did not answer in time and count as having completed the raid. */
  | { kind: 'completed'; members: string[] }
  /** The post will be archived at `deletionTime`: say so in it. */
  | { kind: 'warn'; deletionTime: number }
  /** Archive the post and call `endParty`. */
  | { kind: 'end' };

export interface TickResult {
  party: RaidParty;
  effects: TickEffect[];
}

/**
 * Everything the clock does to a raid, as one pure step: given the party and the time, the
 * party as it should be now and what the caller has to do about it.
 *
 * Nothing depends on a tick having run at the right moment. Each rule compares the time with
 * what the party itself records (the stage its post shows, a group's clear time, an attendee's
 * time to answer, the archiving time), so one tick after the bot was down for an hour applies
 * everything that was missed, and a second tick straight after it does nothing.
 */
export function partyTick(party: RaidParty, input: TickInput): TickResult {
  const { now, settings } = input;
  const effects: TickEffect[] = [];
  if (party.status !== 'active') return { party, effects };
  let current = party;

  // The stage by the clock against the stage the post shows.
  const from = current.raid.stageSeen;
  const to = raidStage(current, now);
  if (to !== from) {
    let bossSet = false;
    if (to === 'hatched' && current.raid.boss === null) {
      const hatchesAs = input.autoset(current.raid.tier);
      if (hatchesAs) {
        const change = { tier: current.raid.tier, ...hatchesAs };
        current = setBoss(current, change, input.rules, now).party;
        bossSet = true;
      }
    }
    current = { ...current, raid: { ...current.raid, stageSeen: to } };
    effects.push({ kind: 'stage', from, to, bossSet });
  }

  // A meeting time stays shown for a while after it passed; then the group is asked.
  let refresh = false;
  for (const { id } of current.groups) {
    let group = current.groups.find((g) => g.id === id);
    if (group?.startTime === undefined || now <= group.startTime) continue;
    if (group.startClearTime === undefined) {
      group = { ...group, startClearTime: group.startTime + settings.startClearTime * MINUTE };
      current = withGroup(current, group);
      refresh = true;
    }
    if (group.startClearTime !== undefined && now > group.startClearTime) {
      const { startTime: _startTime, startClearTime: _startClearTime, ...rest } = group;
      const asked = askGroupWhetherComplete(
        withGroup(current, rest),
        id,
        now,
        settings.raidCompleteTimeout,
      );
      current = asked.party;
      refresh = true;
      if (asked.asked.length > 0) {
        effects.push({ kind: 'ask-complete', group: id, members: asked.asked });
      }
    }
  }

  const unanswered = completeUnanswered(current, now);
  if (unanswered.completed.length > 0) {
    current = unanswered.party;
    effects.push({ kind: 'completed', members: unanswered.completed });
  }

  if (!current.saved) {
    const over = current.lastPossibleTime;
    if (
      current.deletionTime === null &&
      over !== null &&
      now > over + settings.deletionGraceTime * MINUTE
    ) {
      const deletionTime = now + settings.deletionWarningTime * MINUTE;
      current = { ...current, deletionTime };
      effects.push({ kind: 'warn', deletionTime });
    } else if (current.deletionTime !== null && now >= current.deletionTime) {
      effects.push({ kind: 'end' });
    }
  }

  // Times are shown without a date only on the day itself.
  const { zone } = input.rules;
  if (
    input.previous !== null &&
    !DateTime.fromMillis(input.previous, { zone }).hasSame(
      DateTime.fromMillis(now, { zone }),
      'day',
    )
  ) {
    refresh = true;
  }
  if (refresh) effects.push({ kind: 'refresh' });

  return { party: current, effects };
}

function withGroup(party: RaidParty, group: PartyGroup): RaidParty {
  return { ...party, groups: party.groups.map((g) => (g.id === group.id ? group : g)) };
}

/** The party after its post was archived. */
export function endParty<P extends { status: string; deletionTime: number | null }>(
  party: P,
): P & { status: 'ended' } {
  return { ...party, status: 'ended' };
}
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run --project unit src/domain/party/tick.test.ts`
Expected: PASS (1 file, 17 tests).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/domain/party
npm run check
git add src/domain/party/tick.ts src/domain/party/tick.test.ts
git commit -m "Party model: the scheduler as one pure, idempotent step" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 970 unit tests.

---

### Task 6: The state document and `PartyRepository`

**Files:**
- Create: `src/domain/party/party-state.ts`, `src/domain/party/party-state.test.ts`, `src/db/repositories/party-repository.ts`, `src/db/repositories/party-repository.db.test.ts`

**Interfaces:**
- Consumes: Task 2 (the `Party` table and its generated type), Task 3 (`Party`, `PartyCore`, `RaidParty`, test support), Task 5 (`endParty`).
- Produces (`party-state.ts`): `PARTY_STATE_VERSION`, `PartyState`, `PartyColumns` (the party's columns plus `type: string`), `partyState(party): PartyState`, `StoredParty = { ok: true; party } | { ok: false; id; problem }`, `partyFromStored(columns, storedState: unknown, storedMirrors: unknown): StoredParty`.
- Produces (`party-repository.ts`): `UnreadableParty { id; problem }`, `PartyList { parties; unreadable }`, `PartyStorage { insert(party); save(party): Promise<boolean>; listActive(): Promise<PartyList> }`, `PartyRepository implements PartyStorage` with also `findById(id): Promise<StoredParty | undefined>`, `listEndedBefore(before, limit): Promise<PartyList>`, `delete(id): Promise<boolean>`.

Docker must be running for this task.

- [ ] **Step 1: Write the failing test of the state document**

Create `src/domain/party/party-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BOB,
  PARTY_NOW,
  REPORTER,
  testRaid,
  withAttendees,
} from '../../../test/support/parties.js';
import { partyFromStored, partyState, type PartyColumns } from './party-state.js';
import type { RaidParty } from './party.js';
import { PartyStatus } from './status.js';

/** A raid with everything a state document can hold. */
function fullRaid(): RaidParty {
  const raid = withAttendees(
    testRaid({ boss: { key: 'yveltal' }, fastMove: 'SNARL_FAST', anonymous: true }),
    {
      [ALICE]: {
        status: PartyStatus.CompletePending,
        pendingUntil: PARTY_NOW + 300_000,
        number: 3,
        remote: true,
      },
      [BOB]: { status: PartyStatus.Complete, group: 'B' },
    },
  );
  return {
    ...raid,
    groups: [
      {
        id: 'A',
        label: 'park side',
        startTime: PARTY_NOW + 600_000,
        startClearTime: PARTY_NOW + 1_200_000,
      },
      { id: 'B' },
    ],
    defaultGroupId: 'B',
    mirrorMessages: [
      { channelId: '300000000000000001', messageId: '300000000000000002', kind: 'remote' },
    ],
    raid: { ...raid.raid, hatchedDuration: 90, stageSeen: 'hatched' },
  };
}

function columnsOf(party: RaidParty): PartyColumns {
  const {
    anonymous: _a,
    attendees: _b,
    groups: _c,
    defaultGroupId: _d,
    raid: _e,
    ...columns
  } = party;
  return { ...columns, mirrorMessages: [] };
}

/**
 * What MySQL hands back for a JSON column: the document, parsed, with the keys of every object
 * sorted (MySQL keeps them by length, then by bytes).
 */
function stored(value: unknown): unknown {
  const sortKeys = (_key: string, part: unknown): unknown =>
    part !== null && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).sort(
            ([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0),
          ),
        )
      : part;
  return JSON.parse(JSON.stringify(value), sortKeys);
}

describe('party state', () => {
  it('comes back from storage exactly as it went in', () => {
    const raid = fullRaid();
    const back = partyFromStored(
      columnsOf(raid),
      stored(partyState(raid)),
      stored(raid.mirrorMessages),
    );
    expect(back).toEqual({ ok: true, party: raid });
  });

  it('stores the version, and neither the columns nor a name for a known boss', () => {
    const state = partyState(fullRaid());
    expect(state.v).toBe(1);
    expect(Object.keys(state).sort()).toEqual([
      'anonymous',
      'attendees',
      'defaultGroupId',
      'groups',
      'raid',
      'v',
    ]);
    expect(state.raid?.boss).toEqual({ key: 'yveltal' });
  });

  it('keeps the attendees in the order they signed up, whatever their snowflakes', () => {
    // Later sign-ups with smaller snowflakes, which a JSON object in MySQL would sort first.
    const raid = withAttendees(testRaid(), { [BOB]: {}, [ALICE]: {}, '100000000000000009': {} });
    const order = Object.keys(raid.attendees);
    expect(order).toEqual([REPORTER, BOB, ALICE, '100000000000000009']);
    const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
    expect(back.ok && Object.keys(back.party.attendees)).toEqual(order);
  });

  it('keeps a boss known only by the name of the feed', () => {
    const raid = testRaid({ boss: { name: 'Newmon' } });
    const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
    expect(back).toMatchObject({ ok: true, party: { raid: { boss: { name: 'Newmon' } } } });
  });

  it('reports a row it cannot read instead of guessing', () => {
    const raid = fullRaid();
    const state = stored(partyState(raid)) as Record<string, unknown>;
    const columns = columnsOf(raid);
    const problem = (s: unknown, c: PartyColumns = columns, m: unknown = []): string => {
      const result = partyFromStored(c, s, m);
      return result.ok ? 'read' : result.problem;
    };
    expect(problem(state, { ...columns, type: 'train' })).toBe('a party of type "train"');
    expect(problem({ ...state, v: 2 })).toMatch(/^state: /);
    expect(problem('{}')).toMatch(/^state: /);
    expect(problem(null)).toMatch(/^state: /);
    expect(problem({ ...state, raid: undefined })).toBe('a raid without its raid details');
    expect(problem({ ...state, defaultGroupId: 'C' })).toMatch(/default group/);
    expect(problem({ ...state, groups: [] })).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        attendees: [{ id: 'nobody', number: 1, status: 1, group: 'A', remote: false }],
      }),
    ).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        attendees: [{ id: ALICE, number: 0, status: 1, group: 'A', remote: false }],
      }),
    ).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        attendees: [{ id: ALICE, number: 1, status: -1, group: 'A', remote: false }],
      }),
    ).toMatch(/^state: /);
    const alice = { id: ALICE, number: 1, status: 1, group: 'A', remote: false };
    expect(problem({ ...state, attendees: [alice, alice] })).toMatch(/listed twice/);
    expect(problem({ ...state, attendees: { [ALICE]: alice } })).toMatch(/^state: /);
    expect(
      problem({
        ...state,
        raid: { ...(state.raid as object), tier: { level: 'Mega', shadow: true } },
      }),
    ).toMatch(/shadow/);
    expect(problem(state, columns, [{ channelId: 'x', messageId: '1', kind: 'ex' }])).toMatch(
      /^mirrorMessages: /,
    );
    expect(problem(state, columns, null)).toMatch(/^mirrorMessages: /);
    const failed = partyFromStored({ ...columns, type: 'meetup' }, state, []);
    expect(failed).toMatchObject({ ok: false, id: raid.id });
  });
});
```

Run: `npx vitest run --project unit src/domain/party/party-state.test.ts`
Expected: FAIL, the module `party-state.js` cannot be found.

- [ ] **Step 2: The state document**

Create `src/domain/party/party-state.ts`:

```ts
import { z } from 'zod';
import { RAID_LEVELS, raidTier } from '../pogo/raid-tier.js';
import {
  GROUP_IDS,
  type Attendee,
  type MirrorMessage,
  type Party,
  type PartyCore,
  type RaidDetails,
} from './party.js';
import { PartyStatus } from './status.js';

/** The version written into every state document; raise it when the shape changes. */
export const PARTY_STATE_VERSION = 1;

const snowflake = z.string().regex(/^\d{15,20}$/);
const time = z.number().int().nonnegative();
const groupId = z.enum(GROUP_IDS);

const attendee = z.object({
  number: z.number().int().min(1),
  status: z.union([
    z.literal(PartyStatus.Interested),
    z.literal(PartyStatus.Coming),
    z.literal(PartyStatus.Present),
    z.literal(PartyStatus.CompletePending),
    z.literal(PartyStatus.Complete),
  ]),
  group: groupId,
  remote: z.boolean(),
  pendingUntil: time.optional(),
});

const group = z.object({
  id: groupId,
  label: z.string().optional(),
  startTime: time.optional(),
  startClearTime: time.optional(),
});

const tier = z
  .object({ level: z.enum(RAID_LEVELS), shadow: z.boolean() })
  .refine((value) => raidTier(value.level, value.shadow) !== undefined, {
    error: 'this level has no shadow raids',
  });

const raid = z.object({
  tier,
  boss: z
    .union([z.object({ key: z.string().min(1) }), z.object({ name: z.string().min(1) })])
    .nullable(),
  reportedHatched: z.boolean(),
  fastMove: z.string().nullable(),
  chargedMove: z.string().nullable(),
  hatchedDuration: z.number().int().min(1).nullable(),
  stageSeen: z.enum(['egg', 'hatched', 'ended']),
});

const state = z
  .object({
    v: z.literal(PARTY_STATE_VERSION),
    anonymous: z.boolean(),
    /**
     * A list, in the order the members signed up, and not an object by member: MySQL sorts the
     * keys of a JSON object, which would put the attendees in the order of their snowflakes.
     */
    attendees: z.array(attendee.extend({ id: snowflake })),
    groups: z.array(group).min(1).max(GROUP_IDS.length),
    defaultGroupId: groupId,
    raid: raid.optional(),
  })
  .refine((value) => value.groups.some((g) => g.id === value.defaultGroupId), {
    error: 'the default group is not one of the groups',
  })
  .refine((value) => new Set(value.attendees.map((a) => a.id)).size === value.attendees.length, {
    error: 'a member is listed twice',
  });

const mirrors = z.array(
  z.object({ channelId: snowflake, messageId: snowflake, kind: z.enum(['ex', 'remote']) }),
);

/** The part of a party that is stored as one JSON document (the `state` column). */
export type PartyState = z.output<typeof state>;

/** What the `Party` table keeps in columns of its own. */
export type PartyColumns = Omit<
  PartyCore,
  'anonymous' | 'attendees' | 'groups' | 'defaultGroupId'
> & {
  type: string;
};

export function partyState(party: Party): PartyState {
  const raidDetails: RaidDetails = party.raid;
  return {
    v: PARTY_STATE_VERSION,
    anonymous: party.anonymous,
    attendees: Object.entries(party.attendees).map(([id, attendee]) => ({ ...attendee, id })),
    groups: [...party.groups],
    defaultGroupId: party.defaultGroupId,
    raid: raidDetails,
  };
}

export type StoredParty = { ok: true; party: Party } | { ok: false; id: string; problem: string };

/**
 * Puts a party together from its columns and the two JSON documents as the database returned
 * them. A row this version cannot read (a train before Phase 3, a newer state version, a
 * damaged document) is reported, never guessed at: the caller leaves such a row alone.
 */
export function partyFromStored(
  columns: PartyColumns,
  storedState: unknown,
  storedMirrors: unknown,
): StoredParty {
  const fail = (problem: string): StoredParty => ({ ok: false, id: columns.id, problem });
  if (columns.type !== 'raid') return fail(`a party of type "${columns.type}"`);
  const parsed = state.safeParse(storedState);
  if (!parsed.success) return fail(`state: ${z.prettifyError(parsed.error)}`);
  const mirrorMessages = mirrors.safeParse(storedMirrors);
  if (!mirrorMessages.success)
    return fail(`mirrorMessages: ${z.prettifyError(mirrorMessages.error)}`);
  const { anonymous, groups, defaultGroupId, raid: raidDetails } = parsed.data;
  if (!raidDetails) return fail('a raid without its raid details');
  const attendees: Record<string, Attendee> = {};
  for (const { id, ...attendee } of parsed.data.attendees) attendees[id] = attendee;
  const messages: MirrorMessage[] = mirrorMessages.data;
  return {
    ok: true,
    party: {
      ...columns,
      type: 'raid',
      mirrorMessages: messages,
      anonymous,
      attendees,
      groups,
      defaultGroupId,
      raid: raidDetails,
    },
  };
}
```

Run: `npx vitest run --project unit src/domain/party/party-state.test.ts`
Expected: PASS (1 file, 5 tests).

- [ ] **Step 3: Write the failing test of the repository**

Create `src/db/repositories/party-repository.db.test.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
import {
  ALICE,
  MINUTE,
  PARTY_NOW,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../../test/support/parties.js';
import type { RaidParty } from '../../domain/party/party.js';
import { setHatchTime } from '../../domain/party/raid.js';
import { PartyStatus } from '../../domain/party/status.js';
import { endParty } from '../../domain/party/tick.js';
import type { DB } from '../types.js';
import { PartyRepository } from './party-repository.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;
const POST = '1234567890123456789';
const FORUM = '1234567890123456700';

describe('PartyRepository', () => {
  let stop: () => Promise<void>;
  let db: Kysely<DB>;
  let parties: PartyRepository;

  beforeAll(async () => {
    ({ db, stop } = await startMigratedDatabase());
    parties = new PartyRepository(db);
    await sql`insert into Guild (id, snowflake) values (1, '412345678901234567')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (1, 1, 1234567890123456788)`.execute(
      db,
    );
    await sql`insert into Gym (id, name) values (1, 'Fountain'), (2, 'Library')`.execute(db);
  });
  afterAll(async () => {
    await stop();
  });
  beforeEach(async () => {
    await db.deleteFrom('Party').execute();
  });

  /** A raid with times, a second attendee, a post and a mirror: every column in use. */
  function fullRaid(n = 1): RaidParty {
    const raid = setHatchTime(
      testRaid({ id: ID(n) }),
      PARTY_NOW + 30 * MINUTE,
      testRaidRules(),
      PARTY_NOW,
    );
    return {
      ...withAttendees(raid, { [ALICE]: { status: PartyStatus.Present, number: 2, remote: true } }),
      forumChannelId: FORUM,
      forumPostId: String(BigInt(POST) + BigInt(n)),
      regionLinkMessageId: '1234567890123456600',
      mirrorMessages: [
        { channelId: '1234567890123456500', messageId: '1234567890123456501', kind: 'ex' },
      ],
      deletionTime: PARTY_NOW + 120 * MINUTE,
    };
  }

  it('stores a new raid and reads it back exactly', async () => {
    const egg = testRaid();
    await parties.insert(egg);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: egg });

    const full = fullRaid(2);
    await parties.insert(full);
    await expect(parties.findById(full.id)).resolves.toEqual({ ok: true, party: full });
    await expect(parties.findById(ID(9))).resolves.toBeUndefined();
  });

  it('keeps a 19-digit post id and times beyond 32 bits exactly', async () => {
    const raid = { ...fullRaid(), forumPostId: '1234567890123456789', endTime: 1_800_000_000_123 };
    await parties.insert(raid);
    const back = await parties.findById(raid.id);
    expect(back).toMatchObject({
      ok: true,
      party: { forumPostId: '1234567890123456789', endTime: 1_800_000_000_123 },
    });
  });

  it('keeps the attendees in the order they signed up, whatever their snowflakes', async () => {
    // MySQL sorts the keys of a JSON object; the later sign-ups here have the smaller ids.
    const raid = withAttendees(testRaid(), { [ALICE]: {}, '100000000000000009': {} });
    const order = Object.keys(raid.attendees);
    await parties.insert(raid);
    const back = await parties.findById(raid.id);
    expect(back?.ok && Object.keys(back.party.attendees)).toEqual(order);
  });

  it('saves every change of a party', async () => {
    const egg = testRaid();
    await parties.insert(egg);
    const changed: RaidParty = {
      ...fullRaid(),
      gymId: 2,
      saved: true,
      updatedAt: PARTY_NOW + MINUTE,
    };
    await expect(parties.save(changed)).resolves.toBe(true);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: changed });

    // Back to nothing: every nullable column can be cleared again.
    await expect(parties.save(egg)).resolves.toBe(true);
    await expect(parties.findById(egg.id)).resolves.toEqual({ ok: true, party: egg });
  });

  it('says whether the row exists, also when nothing changed', async () => {
    const egg = testRaid();
    await expect(parties.save(egg)).resolves.toBe(false);
    await parties.insert(egg);
    await expect(parties.save(egg)).resolves.toBe(true);
  });

  it('refuses a second party for the same post, and a second row with the same id', async () => {
    await parties.insert(fullRaid(1));
    await expect(parties.insert({ ...fullRaid(1), id: ID(2) })).rejects.toThrow(/Duplicate/);
    await expect(parties.insert(fullRaid(1))).rejects.toThrow(/Duplicate/);
    // Parties without a post do not collide with each other.
    await parties.insert(testRaid({ id: ID(3) }));
    await parties.insert(testRaid({ id: ID(4) }));
  });

  it('lists the active parties oldest first and leaves ended ones out', async () => {
    await parties.insert(testRaid({ id: ID(2), now: PARTY_NOW + MINUTE }));
    await parties.insert(testRaid({ id: ID(1), now: PARTY_NOW }));
    await parties.insert(endParty(testRaid({ id: ID(3), now: PARTY_NOW - MINUTE })));
    const { parties: active, unreadable } = await parties.listActive();
    expect(active.map((party) => party.id)).toEqual([ID(1), ID(2)]);
    expect(unreadable).toEqual([]);
  });

  it('reports rows it cannot read and still lists the others', async () => {
    await parties.insert(testRaid({ id: ID(1) }));
    await parties.insert(testRaid({ id: ID(2) }));
    await parties.insert(testRaid({ id: ID(3) }));
    await sql`update Party set state = '{"v": 99}' where id = ${ID(2)}`.execute(db);
    await sql`update Party set type = 'train' where id = ${ID(3)}`.execute(db);
    const { parties: active, unreadable } = await parties.listActive();
    expect(active.map((party) => party.id)).toEqual([ID(1)]);
    expect(unreadable).toEqual([
      { id: ID(2), problem: expect.stringMatching(/^state: /) as string },
      { id: ID(3), problem: 'a party of type "train"' },
    ]);
    await expect(parties.findById(ID(2))).resolves.toMatchObject({ ok: false, id: ID(2) });
  });

  it('lists ended parties older than a moment, for the sweep, and deletes one', async () => {
    const ended = (n: number, updatedAt: number): RaidParty => ({
      ...endParty(testRaid({ id: ID(n) })),
      updatedAt,
    });
    await parties.insert(ended(1, PARTY_NOW + 2 * MINUTE));
    await parties.insert(ended(2, PARTY_NOW));
    await parties.insert(ended(3, PARTY_NOW + MINUTE));
    await parties.insert({ ...testRaid({ id: ID(4) }), updatedAt: PARTY_NOW - MINUTE });

    const old = await parties.listEndedBefore(PARTY_NOW + 2 * MINUTE, 10);
    expect(old.parties.map((party) => party.id)).toEqual([ID(2), ID(3)]);
    const one = await parties.listEndedBefore(PARTY_NOW + 2 * MINUTE, 1);
    expect(one.parties.map((party) => party.id)).toEqual([ID(2)]);

    await expect(parties.delete(ID(2))).resolves.toBe(true);
    await expect(parties.delete(ID(2))).resolves.toBe(false);
    await expect(parties.findById(ID(2))).resolves.toBeUndefined();
  });

  it('keeps the party when its gym or region is deleted', async () => {
    await sql`insert into Gym (id, name) values (3, 'Gone')`.execute(db);
    await sql`insert into Region (id, guildId, channelId) values (2, 1, 1234567890123456787)`.execute(
      db,
    );
    await parties.insert(testRaid({ gymId: 3, regionId: 2 }));
    await sql`delete from Gym where id = 3`.execute(db);
    await sql`delete from Region where id = 2`.execute(db);
    const back = await parties.findById(testRaid().id);
    expect(back).toMatchObject({ ok: true, party: { gymId: null, regionId: null } });
  });
});
```

- [ ] **Step 4: The repository**

Create `src/db/repositories/party-repository.ts`:

```ts
import type { Kysely, Selectable } from 'kysely';
import {
  partyFromStored,
  partyState,
  type PartyColumns,
  type StoredParty,
} from '../../domain/party/party-state.js';
import type { Party, PartyLifeStatus } from '../../domain/party/party.js';
import type { DB, Party as PartyTable } from '../types.js';

/** A row of `Party` that could not be read as a party; it is left as it is. */
export interface UnreadableParty {
  id: string;
  problem: string;
}

export interface PartyList {
  parties: Party[];
  unreadable: UnreadableParty[];
}

/** What the party store needs from storage. */
export interface PartyStorage {
  insert(party: Party): Promise<void>;
  /** Writes everything that can change. Returns false when there is no such row. */
  save(party: Party): Promise<boolean>;
  /** Every party that has not ended, oldest first. */
  listActive(): Promise<PartyList>;
}

const epoch = (value: string | null): number | null => (value === null ? null : Number(value));

function toStored(row: Selectable<PartyTable>): StoredParty {
  const columns: PartyColumns = {
    id: row.id,
    type: row.type,
    guildId: row.guildId,
    status: row.status === 'ended' ? 'ended' : 'active',
    regionId: row.regionId,
    gymId: row.gymId,
    forumChannelId: row.forumChannelId,
    forumPostId: row.forumPostId,
    regionLinkMessageId: row.regionLinkMessageId,
    mirrorMessages: [],
    createdById: row.createdById,
    hatchTime: epoch(row.hatchTime),
    endTime: epoch(row.endTime),
    lastPossibleTime: epoch(row.lastPossibleTime),
    deletionTime: epoch(row.deletionTime),
    saved: row.saved === 1,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
  return partyFromStored(columns, row.state, row.mirrorMessages);
}

/** The columns that change during a party's life, as they are written. */
function changeable(party: Party) {
  return {
    status: party.status,
    regionId: party.regionId,
    gymId: party.gymId,
    forumChannelId: party.forumChannelId,
    forumPostId: party.forumPostId,
    regionLinkMessageId: party.regionLinkMessageId,
    mirrorMessages: JSON.stringify(party.mirrorMessages),
    hatchTime: party.hatchTime === null ? null : String(party.hatchTime),
    endTime: party.endTime === null ? null : String(party.endTime),
    lastPossibleTime: party.lastPossibleTime === null ? null : String(party.lastPossibleTime),
    deletionTime: party.deletionTime === null ? null : String(party.deletionTime),
    saved: party.saved ? 1 : 0,
    state: JSON.stringify(partyState(party)),
    updatedAt: String(party.updatedAt),
  };
}

function sorted(stored: StoredParty[]): PartyList {
  const list: PartyList = { parties: [], unreadable: [] };
  for (const item of stored) {
    if (item.ok) list.parties.push(item.party);
    else list.unreadable.push({ id: item.id, problem: item.problem });
  }
  return list;
}

/**
 * The `Party` table. What the scheduler and the duplicate check search by is in columns; the
 * rest of a party is the JSON document `state` (see `party-state.ts`).
 */
export class PartyRepository implements PartyStorage {
  constructor(private readonly db: Kysely<DB>) {}

  async insert(party: Party): Promise<void> {
    await this.db
      .insertInto('Party')
      .values({
        id: party.id,
        guildId: party.guildId,
        type: party.type,
        createdById: party.createdById,
        createdAt: String(party.createdAt),
        ...changeable(party),
      })
      .execute();
  }

  async save(party: Party): Promise<boolean> {
    const result = await this.db
      .updateTable('Party')
      .set(changeable(party))
      .where('id', '=', party.id)
      .executeTakeFirst();
    // MySQL counts only rows whose values changed, so an unchanged party is looked up.
    if (result.numUpdatedRows > 0n) return true;
    const row = await this.db
      .selectFrom('Party')
      .select('id')
      .where('id', '=', party.id)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** The party with this id, whatever its status; undefined when there is none. */
  async findById(id: string): Promise<StoredParty | undefined> {
    const row = await this.db
      .selectFrom('Party')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toStored(row) : undefined;
  }

  async listActive(): Promise<PartyList> {
    return this.list('active');
  }

  /**
   * Ended parties whose last change is older than `before` (epoch ms), oldest first, at most
   * `limit`: for the sweep that deletes old archived posts.
   */
  async listEndedBefore(before: number, limit: number): Promise<PartyList> {
    const rows = await this.db
      .selectFrom('Party')
      .selectAll()
      .where('status', '=', 'ended')
      .where('updatedAt', '<', String(before))
      .orderBy('updatedAt')
      .orderBy('id')
      .limit(limit)
      .execute();
    return sorted(rows.map(toStored));
  }

  /** Removes a party for good. Returns false when there was none. */
  async delete(id: string): Promise<boolean> {
    const result = await this.db.deleteFrom('Party').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  private async list(status: PartyLifeStatus): Promise<PartyList> {
    const rows = await this.db
      .selectFrom('Party')
      .selectAll()
      .where('status', '=', status)
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return sorted(rows.map(toStored));
  }
}
```

- [ ] **Step 5: Run the database test**

Run: `npx vitest run --project db src/db/repositories/party-repository.db.test.ts`
Expected: PASS (1 file, 10 tests).

- [ ] **Step 6: Format, check, commit**

```bash
npx prettier --write src/domain/party src/db/repositories
npm run check
git add src/domain/party/party-state.ts src/domain/party/party-state.test.ts src/db/repositories/party-repository.ts src/db/repositories/party-repository.db.test.ts
git commit -m "Party repository: columns to search by, one versioned state document" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `PartyStore`, `ctx.parties` and `requireParty`

**Files:**
- Create: `src/services/keyed-lock.ts`, `src/services/keyed-lock.test.ts`, `src/services/party-store.ts`, `src/services/party-store.test.ts`
- Modify: `test/support/parties.ts`, `test/support/test-context.ts`, `src/app-context.ts`, `src/app.ts`, `src/discord/guards.ts`, `src/discord/guards.test.ts`

**Interfaces:**
- Consumes: Task 6 (`PartyStorage`, `PartyList`, `PartyRepository`), Task 3 (`Party`, `RaidParty`, `blocksNewRaid`, `raidKindOf`), Task 4 (in the tests), `channelContext`, `Guard`, `LocatedInteraction`, `UserError`.
- Produces:
  - `KeyedLock<K>` with `run<T>(key, work): Promise<T>` and `size`.
  - `PartyProvider { get(id); byPost(forumPostId); active(); inRegion(regionId); raidAt(gymId, kind, now) }` and `ctx.parties: PartyProvider`.
  - `PartyStore implements PartyProvider` with `load()`, `add(party): Promise<Party>`, `update<R extends { party?: Party }>(id, change: (party: Party) => R): Promise<R | undefined>`, `withGymLock<T>(gymId, work): Promise<T>`.
  - `partyOf(interaction, ctx): Party | undefined`, `requireParty: Guard` (`src/discord/guards.ts`).
  - Test support: `MemoryPartyStorage`, `partyStoreWith(parties?, now?)`, `noParties()`.

- [ ] **Step 1: The lock, test first**

Create `src/services/keyed-lock.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { KeyedLock } from './keyed-lock.js';

/** A promise and the function that resolves it. */
function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('KeyedLock', () => {
  it('runs work for one key one after the other, in the order asked', async () => {
    const lock = new KeyedLock<string>();
    const first = gate();
    const order: string[] = [];
    const a = lock.run('k', async () => {
      order.push('a starts');
      await first.opened;
      order.push('a ends');
      return 'a';
    });
    const b = lock.run('k', () => {
      order.push('b runs');
      return 'b';
    });
    await Promise.resolve();
    expect(order).toEqual(['a starts']);
    first.open();
    await expect(Promise.all([a, b])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual(['a starts', 'a ends', 'b runs']);
  });

  it('does not make different keys wait for each other', async () => {
    const lock = new KeyedLock<number>();
    const held = gate();
    const slow = lock.run(1, () => held.opened);
    await expect(lock.run(2, () => 'free')).resolves.toBe('free');
    held.open();
    await slow;
  });

  it('carries on after work that failed, and hands the failure to its caller only', async () => {
    const lock = new KeyedLock<string>();
    const failed = lock.run('k', () => {
      throw new Error('broken');
    });
    const next = lock.run('k', () => 'fine');
    await expect(failed).rejects.toThrow('broken');
    await expect(next).resolves.toBe('fine');
  });

  it('forgets a key once nothing is running or waiting for it', async () => {
    const lock = new KeyedLock<string>();
    await Promise.all([lock.run('a', () => 1), lock.run('a', () => 2), lock.run('b', () => 3)]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(lock.size).toBe(0);
  });
});
```

Run: `npx vitest run --project unit src/services/keyed-lock.test.ts`
Expected: FAIL, the module `keyed-lock.js` cannot be found.

Create `src/services/keyed-lock.ts`:

```ts
/**
 * Runs work one after the other per key: a second call for the same key starts only when the
 * first has finished, whether it succeeded or not. Calls for different keys do not wait for
 * each other. In one process only, which is all Pine has.
 */
export class KeyedLock<K> {
  private readonly tails = new Map<K, Promise<unknown>>();

  run<T>(key: K, work: () => T | Promise<T>): Promise<T> {
    const before = this.tails.get(key) ?? Promise.resolve();
    const result = before.then(work);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** Keys with work running or waiting. */
  get size(): number {
    return this.tails.size;
  }
}
```

Run it again. Expected: PASS (4 tests).

- [ ] **Step 2: Test support for the store**

Apply to `test/support/parties.ts`:

```diff
--- a/test/support/parties.ts
+++ b/test/support/parties.ts
@@ -1,10 +1,13 @@
 import { DateTime } from 'luxon';
 import { loadSettings } from '../../src/config/settings.js';
-import type { Attendee, RaidParty } from '../../src/domain/party/party.js';
+import type { PartyList, PartyStorage } from '../../src/db/repositories/party-repository.js';
+import type { Attendee, Party, RaidParty } from '../../src/domain/party/party.js';
 import { createRaid, type NewRaid } from '../../src/domain/party/raid.js';
 import { PartyStatus } from '../../src/domain/party/status.js';
 import { raidDurationRules, type RaidDurationRules } from '../../src/domain/time/raid-durations.js';
+import { PartyStore, type PartyProvider } from '../../src/services/party-store.js';
 import { raidEventsFixture } from './raid-events.js';
+import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 
 export const PARTY_ZONE = 'America/New_York';
@@ -71,3 +74,85 @@ export function withAttendees(
   }
   return { ...party, attendees: { ...party.attendees, ...added } };
 }
+
+/**
+ * A `PartyStorage` kept in memory, for tests of what is built on the store. It follows
+ * `PartyRepository`, whose behaviour party-repository.db.test.ts pins down: a second row with
+ * the same id or the same post is refused, and `save` says whether the row exists. Set `failing`
+ * to make every call reject.
+ */
+export class MemoryPartyStorage implements PartyStorage {
+  failing: Error | undefined;
+  readonly rows = new Map<string, Party>();
+  /** Every party written, in order: `insert` and `save` calls. */
+  readonly writes: Party[] = [];
+
+  constructor(parties: readonly Party[] = []) {
+    for (const party of parties) this.rows.set(party.id, party);
+  }
+
+  private attempt<T>(work: () => T): Promise<T> {
+    return new Promise((resolve, reject) => {
+      // Like a real query, the answer never comes in the same turn of the event loop.
+      setImmediate(() => {
+        if (this.failing) reject(this.failing);
+        else {
+          try {
+            resolve(work());
+          } catch (err) {
+            reject(err instanceof Error ? err : new Error(String(err)));
+          }
+        }
+      });
+    });
+  }
+
+  insert(party: Party): Promise<void> {
+    return this.attempt(() => {
+      const samePost = [...this.rows.values()].some(
+        (row) => party.forumPostId !== null && row.forumPostId === party.forumPostId,
+      );
+      if (this.rows.has(party.id) || samePost) throw new Error('Duplicate entry');
+      this.rows.set(party.id, party);
+      this.writes.push(party);
+    });
+  }
+
+  save(party: Party): Promise<boolean> {
+    return this.attempt(() => {
+      if (!this.rows.has(party.id)) return false;
+      this.rows.set(party.id, party);
+      this.writes.push(party);
+      return true;
+    });
+  }
+
+  listActive(): Promise<PartyList> {
+    return this.attempt(() => ({
+      parties: [...this.rows.values()]
+        .filter((party) => party.status === 'active')
+        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
+      unreadable: [],
+    }));
+  }
+}
+
+/** A loaded store over these parties, with its storage and what it logged. */
+export async function partyStoreWith(parties: readonly Party[] = [], now?: () => number) {
+  const storage = new MemoryPartyStorage(parties);
+  const { log, entries } = createTestLogger();
+  const store = new PartyStore({ storage, log, ...(now ? { now } : {}) });
+  await store.load();
+  return { store, storage, entries };
+}
+
+/** What `createTestContext` has for `ctx.parties`: no party anywhere. */
+export function noParties(): PartyProvider {
+  return {
+    get: () => undefined,
+    byPost: () => undefined,
+    active: () => [],
+    inRegion: () => [],
+    raidAt: () => undefined,
+  };
+}
```

- [ ] **Step 3: Write the failing test of the store**

Create `src/services/party-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BOB,
  MemoryPartyStorage,
  MINUTE,
  PARTY_NOW,
  partyStoreWith,
  testRaid,
  testRaidRules,
} from '../../test/support/parties.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import { attendanceLimits, leaveParty, setAttendance } from '../domain/party/attendance.js';
import type { Party } from '../domain/party/party.js';
import { setEndTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import { endParty } from '../domain/party/tick.js';
import { PartyStore } from './party-store.js';

const ID = (n: number): string => `00000000-0000-4000-8000-00000000000${String(n)}`;
const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
const join = (memberId: string) => (party: Party) =>
  setAttendance(party, memberId, PartyStatus.Coming, {}, limits);

describe('PartyStore', () => {
  it('refuses to be read before it was loaded', () => {
    const { log } = createTestLogger();
    const store = new PartyStore({ storage: new MemoryPartyStorage(), log });
    expect(() => store.get(ID(1))).toThrow('Parties have not been loaded yet');
    expect(() => store.active()).toThrow('Parties have not been loaded yet');
  });

  it('loads the active parties and finds them by id, post, region and gym', async () => {
    const posted = { ...testRaid({ id: ID(1) }), forumPostId: '300000000000000001' };
    const east = testRaid({ id: ID(2), regionId: 2, gymId: 7, now: PARTY_NOW + MINUTE });
    const over = endParty(testRaid({ id: ID(3) }));
    const { store, entries } = await partyStoreWith([east, posted, over]);

    expect(store.active().map((party) => party.id)).toEqual([ID(1), ID(2)]);
    expect(store.get(ID(2))).toBe(east);
    expect(store.get(ID(3))).toBeUndefined();
    expect(store.byPost('300000000000000001')).toBe(posted);
    expect(store.byPost('300000000000000002')).toBeUndefined();
    expect(store.inRegion(2)).toEqual([east]);
    expect(entries.at(-1)).toMatchObject({ msg: 'parties loaded', parties: 2, unreadable: 0 });
  });

  it('logs rows it cannot read and carries on without them', async () => {
    const storage = new MemoryPartyStorage([testRaid()]);
    storage.listActive = () =>
      Promise.resolve({
        parties: [testRaid()],
        unreadable: [{ id: ID(9), problem: 'state: bad' }],
      });
    const { log, entries } = createTestLogger();
    const store = new PartyStore({ storage, log });
    await store.load();
    expect(store.active()).toHaveLength(1);
    expect(entries).toContainEqual(
      expect.objectContaining({
        level: 40,
        party: ID(9),
        problem: 'state: bad',
        msg: 'could not read a party',
      }),
    );
  });

  it('finds the raid that blocks a new report: same gym and kind, not ended by the clock', async () => {
    const rules = testRaidRules();
    const raid = setEndTime(testRaid({ id: ID(1) }), at('2026-10-13T14:40'), rules, PARTY_NOW);
    const elite = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
    const { store } = await partyStoreWith([raid, elite]);
    expect(store.raidAt(1, 'standard', at('2026-10-13T14:39'))?.id).toBe(ID(1));
    expect(store.raidAt(1, 'standard', at('2026-10-13T14:40'))).toBeUndefined();
    expect(store.raidAt(1, 'elite', PARTY_NOW)?.id).toBe(ID(2));
    expect(store.raidAt(1, 'exclusive', PARTY_NOW)).toBeUndefined();
    expect(store.raidAt(2, 'standard', PARTY_NOW)).toBeUndefined();
  });

  it('adds a party to the database and to memory', async () => {
    const { store, storage } = await partyStoreWith();
    const raid = testRaid();
    await expect(store.add(raid)).resolves.toBe(raid);
    expect(store.get(raid.id)).toBe(raid);
    expect(storage.rows.get(raid.id)).toBe(raid);
    await expect(store.add(raid)).rejects.toThrow('Duplicate');
  });

  it('writes a change, stamps it with the time, and hands back what the change returned', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid], () => PARTY_NOW + 5 * MINUTE);
    const result = await store.update(raid.id, join(ALICE));
    expect(result).toMatchObject({ ok: true, joined: true });
    const stored = storage.rows.get(raid.id);
    expect(stored).toMatchObject({ updatedAt: PARTY_NOW + 5 * MINUTE });
    expect(stored?.attendees).toHaveProperty(ALICE);
    expect(result?.party).toBe(stored);
    expect(store.get(raid.id)).toBe(stored);
  });

  it('writes nothing for a change that was refused or changed nothing', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    await expect(store.update(raid.id, (party) => leaveParty(party, ALICE))).resolves.toEqual({
      ok: false,
      reason: 'not-attending',
    });
    await expect(store.update(raid.id, (party) => ({ party }))).resolves.toEqual({ party: raid });
    expect(storage.writes).toEqual([]);
    expect(store.get(raid.id)).toBe(raid);
  });

  it('answers undefined for a party that is not active', async () => {
    const { store } = await partyStoreWith();
    await expect(store.update(ID(9), join(ALICE))).resolves.toBeUndefined();
  });

  it('applies changes to one party one after the other, each on the result of the last', async () => {
    const raid = testRaid();
    const { store } = await partyStoreWith([raid]);
    await Promise.all([store.update(raid.id, join(ALICE)), store.update(raid.id, join(BOB))]);
    expect(Object.keys(store.get(raid.id)?.attendees ?? {})).toEqual(
      expect.arrayContaining([ALICE, BOB]),
    );
  });

  it('keeps the party as it was when the write fails, and says so', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    storage.failing = new Error('connection lost');
    await expect(store.update(raid.id, join(ALICE))).rejects.toThrow('connection lost');
    expect(store.get(raid.id)).toBe(raid);
    storage.failing = undefined;
    await expect(store.update(raid.id, join(ALICE))).resolves.toMatchObject({ ok: true });
  });

  it('drops a party whose row has vanished', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    storage.rows.delete(raid.id);
    await expect(store.update(raid.id, join(ALICE))).rejects.toThrow('no longer in the database');
    expect(store.get(raid.id)).toBeUndefined();
  });

  it('takes an ended party out of memory once it is written', async () => {
    const raid = testRaid();
    const { store, storage } = await partyStoreWith([raid]);
    const result = await store.update(raid.id, (party) => ({ party: endParty(party) }));
    expect(result?.party).toMatchObject({ status: 'ended' });
    expect(storage.rows.get(raid.id)).toMatchObject({ status: 'ended' });
    expect(store.get(raid.id)).toBeUndefined();
    expect(store.active()).toEqual([]);
  });

  it('refuses a change that returns another party', async () => {
    const raid = testRaid();
    const { store } = await partyStoreWith([raid]);
    await expect(store.update(raid.id, () => ({ party: testRaid({ id: ID(2) }) }))).rejects.toThrow(
      'returned party',
    );
  });

  it('never lets the time of the last change go backwards', async () => {
    const raid = { ...testRaid(), updatedAt: PARTY_NOW + 10 * MINUTE };
    const { store } = await partyStoreWith([raid], () => PARTY_NOW);
    const result = await store.update(raid.id, join(ALICE));
    expect(result?.party?.updatedAt).toBe(PARTY_NOW + 10 * MINUTE);
  });

  it('lets one report at a time look at a gym', async () => {
    const { store } = await partyStoreWith();
    const order: string[] = [];
    const report = (name: string) =>
      store.withGymLock(1, async () => {
        const free = store.raidAt(1, 'standard', PARTY_NOW) === undefined;
        order.push(`${name}: ${free ? 'free' : 'taken'}`);
        if (free) await store.add(testRaid());
      });
    await Promise.all([report('first'), report('second')]);
    expect(order).toEqual(['first: free', 'second: taken']);
    expect(store.active()).toHaveLength(1);
  });
});
```

- [ ] **Step 4: The store**

Create `src/services/party-store.ts`:

```ts
import type { PartyStorage } from '../db/repositories/party-repository.js';
import type { Party, RaidParty } from '../domain/party/party.js';
import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
import type { RaidKind } from '../domain/time/party-time.js';
import type { Logger } from '../log.js';
import { KeyedLock } from './keyed-lock.js';

const NOT_LOADED = 'Parties have not been loaded yet';

/** What handlers and guards read: the parties that have not ended, from memory. */
export interface PartyProvider {
  get(id: string): Party | undefined;
  /** The party whose forum post this is. */
  byPost(forumPostId: string): Party | undefined;
  /** Every active party, oldest first. */
  active(): Party[];
  /** The active parties of a region, oldest first. */
  inRegion(regionId: number): Party[];
  /**
   * The raid at this gym that stands in the way of a new report of the same kind (standard, EX
   * or elite): one that has not ended by the clock.
   */
  raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined;
}

export interface PartyStoreOptions {
  storage: PartyStorage;
  log: Logger;
  now?: () => number;
}

/**
 * The active parties in memory, with the database behind them. Every change goes through
 * `update`, which runs one change at a time per party, writes the row first and only then
 * replaces the party in memory: what handlers read is always what is stored.
 */
export class PartyStore implements PartyProvider {
  private readonly parties = new Map<string, Party>();
  private readonly locks = new KeyedLock<string>();
  private readonly gymLocks = new KeyedLock<number>();
  private readonly now: () => number;
  private loaded = false;

  constructor(private readonly options: PartyStoreOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  /** Reads every active party. A row that cannot be read is logged and left alone. */
  async load(): Promise<void> {
    const { parties, unreadable } = await this.options.storage.listActive();
    this.parties.clear();
    for (const party of parties) this.parties.set(party.id, party);
    for (const row of unreadable) {
      this.options.log.warn({ party: row.id, problem: row.problem }, 'could not read a party');
    }
    this.loaded = true;
    this.options.log.info(
      { parties: parties.length, unreadable: unreadable.length },
      'parties loaded',
    );
  }

  private get all(): Map<string, Party> {
    if (!this.loaded) throw new Error(NOT_LOADED);
    return this.parties;
  }

  get(id: string): Party | undefined {
    return this.all.get(id);
  }

  byPost(forumPostId: string): Party | undefined {
    for (const party of this.all.values()) if (party.forumPostId === forumPostId) return party;
    return undefined;
  }

  active(): Party[] {
    return [...this.all.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
  }

  inRegion(regionId: number): Party[] {
    return this.active().filter((party) => party.regionId === regionId);
  }

  raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined {
    return this.active().find(
      (party) => party.gymId === gymId && raidKindOf(party) === kind && blocksNewRaid(party, now),
    );
  }

  /** Stores a new party. Rejects when the row cannot be written (its id or post already exists). */
  async add(party: Party): Promise<Party> {
    const parties = this.all;
    return this.locks.run(party.id, async () => {
      await this.options.storage.insert(party);
      if (party.status === 'active') parties.set(party.id, party);
      return party;
    });
  }

  /**
   * Applies a change to an active party: `change` gets the party as it is now and returns what
   * a function of `src/domain/party` returns, an object whose `party` is the changed party (or
   * that has none, when the change was refused). A changed party is stamped with the time,
   * written, and then replaces the old one; an ended party leaves memory. The result is what
   * `change` returned, with the party as stored. Undefined when there is no such active party.
   *
   * Changes to one party run one at a time, in the order they were asked for. `change` must not
   * wait for anything: it is a pure decision. When the write fails, the party in memory stays as
   * it was and the error is the caller's.
   */
  async update<R extends { party?: Party }>(
    id: string,
    change: (party: Party) => R,
  ): Promise<R | undefined> {
    const parties = this.all;
    return this.locks.run(id, async () => {
      const current = parties.get(id);
      if (!current) return undefined;
      const result = change(current);
      const changed = result.party;
      if (changed === undefined || changed === current) return result;
      if (changed.id !== id)
        throw new Error(`A change of party ${id} returned party ${changed.id}`);
      const stamped: Party = { ...changed, updatedAt: Math.max(this.now(), current.updatedAt) };
      if (!(await this.options.storage.save(stamped))) {
        parties.delete(id);
        throw new Error(`Party ${id} is no longer in the database`);
      }
      if (stamped.status === 'active') parties.set(id, stamped);
      else parties.delete(id);
      return { ...result, party: stamped };
    });
  }

  /**
   * Runs `work` alone for this gym, so that two reports of the same raid cannot both find the
   * gym free (spec 5.2). Updates of parties inside it are fine: they use another lock.
   */
  withGymLock<T>(gymId: number, work: () => Promise<T>): Promise<T> {
    return this.gymLocks.run(gymId, work);
  }
}
```

- [ ] **Step 5: The context**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -6,6 +6,7 @@ import type { IntentFlags } from './discord/intents.js';
 import type { Logger } from './log.js';
 import type { GameDataProvider } from './services/game-data-service.js';
 import type { GymProvider } from './services/gym-directory.js';
+import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
@@ -25,6 +26,8 @@ export interface AppContext {
   readonly raidEvents: RaidEventProvider;
   /** The gyms, and finding them by what members type. */
   readonly gyms: GymProvider;
+  /** The raids (later also trains and meetups) that have not ended. */
+  readonly parties: PartyProvider;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -8,6 +8,7 @@ import { createDb } from './db/kysely.js';
 import { runMigrations } from './db/migrator.js';
 import { GuildRepository } from './db/repositories/guild-repository.js';
 import { GymRepository } from './db/repositories/gym-repository.js';
+import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
@@ -21,6 +22,7 @@ import { createLogger, type Logger } from './log.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
+import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
@@ -80,6 +82,7 @@ export async function startApp(
     ignoredWords: config.settings.blacklistWords,
     log,
   });
+  const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
   const maps = new StaticMaps(
     config.env.GOOGLE_API_KEY,
@@ -91,6 +94,7 @@ export async function startApp(
     // Reads the list of the last run from the database; the feed is read after the login.
     await raidBosses.load();
     await gyms.load();
+    await parties.load();
     await pokemon.reloadNicknames();
   } catch (err) {
     await db.destroy();
@@ -112,6 +116,7 @@ export async function startApp(
     raidBosses,
     raidEvents,
     gyms,
+    parties,
     pokemon,
     maps,
     features: requested,
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -4,6 +4,7 @@ import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
 import type { DB } from '../../src/db/types.js';
 import { catalogueFixture } from './game-data.js';
+import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
@@ -26,6 +27,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     raidBosses: raidBossesFixture(),
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
+    parties: noParties(),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
     maps: mapsFixture(),
```

Run: `npx vitest run --project unit src/services/party-store.test.ts`
Expected: PASS (1 file, 15 tests).

- [ ] **Step 6: The guard, test first**

Apply to `src/discord/guards.test.ts`:

```diff
--- a/src/discord/guards.test.ts
+++ b/src/discord/guards.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { fakeAutocomplete, fakeChatInput } from '../../test/support/fake-interactions.js';
 import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { partyStoreWith, testRaid } from '../../test/support/parties.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { GuardableInteraction, LocatedInteraction } from './command.js';
 import { UserError } from './errors.js';
@@ -9,12 +10,14 @@ import {
   isBotManagement,
   isManagement,
   isPvpContext,
+  partyOf,
   regionChannelOf,
   requireBotChannel,
   requireBotChannelOrRegion,
   requireBotManagement,
   requireGuild,
   requireManagement,
+  requireParty,
   requirePvpContext,
   requireRegion,
 } from './guards.js';
@@ -159,3 +162,41 @@ describe('guards', () => {
     );
   });
 });
+
+describe('party posts', () => {
+  const POST = '300000000000000001';
+
+  async function withParty() {
+    const raid = { ...testRaid(), forumPostId: POST };
+    const { store } = await partyStoreWith([raid]);
+    return { raid, ctx: createTestContext({ parties: store }).ctx };
+  }
+
+  it('partyOf finds the party by the id of its post, cached or not', async () => {
+    const { raid, ctx: withRaid } = await withParty();
+    const inPost = fakeChatInput({ channelId: POST, thread: {} });
+    expect(partyOf(as(inPost), withRaid)).toBe(raid);
+    const uncached = fakeChatInput({ channelId: POST, uncachedChannel: true });
+    expect(partyOf(as(uncached), withRaid)).toBe(raid);
+    const autocomplete = fakeAutocomplete({ channelId: POST, thread: {} });
+    expect(partyOf(autocomplete as unknown as LocatedInteraction, withRaid)).toBe(raid);
+    expect(partyOf(as(fakeChatInput({ channelId: WEST_CHANNEL })), withRaid)).toBeUndefined();
+    expect(partyOf(as(fakeChatInput({ isDm: true })), withRaid)).toBeUndefined();
+  });
+
+  it('requireParty passes in the post of an active party and refuses anywhere else', async () => {
+    const { ctx: withRaid } = await withParty();
+    expect(() =>
+      requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), withRaid),
+    ).not.toThrow();
+    expect(() => requireParty(as(fakeChatInput({ channelId: WEST_CHANNEL })), withRaid)).toThrow(
+      'Use this in the post of a raid that is still active.',
+    );
+    expect(() => requireParty(as(fakeChatInput({ channelId: POST, thread: {} })), ctx)).toThrow(
+      UserError,
+    );
+    expect(() => requireParty(as(fakeChatInput({ isDm: true })), withRaid)).toThrow(
+      'This only works in a server.',
+    );
+  });
+});
```

Run: `npx tsc --noEmit`
Expected: FAIL, `partyOf` and `requireParty` are not exported by `./guards.js`.

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,5 +1,6 @@
 import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
+import type { Party } from '../domain/party/party.js';
 import { channelContext } from './channel-context.js';
 import type { Guard, LocatedInteraction } from './command.js';
 import { UserError } from './errors.js';
@@ -118,3 +119,21 @@ export const requirePvpContext: Guard = (interaction, ctx) => {
     throw new UserError(`Use this in a DM with me or under ${ctx.config.settings.categories.pvp}.`);
   }
 };
+
+/**
+ * The party whose forum post an interaction came from, by the id of the post alone: the post
+ * need not be in the cache. Undefined anywhere else, also for a copy of the party's message in
+ * another channel (a control there carries the party's id in its custom id instead).
+ */
+export function partyOf(interaction: LocatedInteraction, ctx: AppContext): Party | undefined {
+  const { channelId } = channelContext(interaction);
+  return channelId === null ? undefined : ctx.parties.byPost(channelId);
+}
+
+/** For commands that act on the party of the post they are used in. */
+export const requireParty: Guard = (interaction, ctx) => {
+  assertGuild(interaction);
+  if (!partyOf(interaction, ctx)) {
+    throw new UserError('Use this in the post of a raid that is still active.');
+  }
+};
```

Run: `npx vitest run --project unit src/discord/guards.test.ts`
Expected: PASS.

- [ ] **Step 7: Format, check, commit**

```bash
npx prettier --write src/services src/discord/guards.ts src/discord/guards.test.ts src/app.ts src/app-context.ts test/support
npm run check
git add src/services/keyed-lock.ts src/services/keyed-lock.test.ts src/services/party-store.ts src/services/party-store.test.ts test/support/parties.ts test/support/test-context.ts src/app-context.ts src/app.ts src/discord/guards.ts src/discord/guards.test.ts
git commit -m "Party store: active parties in memory, one change at a time, written first" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 996 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `npm run test:db` once, complete.
2. Whole-branch review (Opus, high effort) of the seven commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for the party model (`src/domain/party/`, `Change`, `partyTick`), `PartyStore.update`, `ctx.parties`, `requireParty`, `ctx.raidEvents` and the raid durations, the test support (`testRaid`, `partyStoreWith`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete what this plan did; add a "From Phase 2B" section. The spec (section 5.5 "as built"), the Gantt chart and memory.

Nothing in this plan can be seen on Discord, so it has no staging checklist of its own. One thing to try at the next start of the bot (with Matt's go-ahead, as always): the log line `raid events read` with a count, and `parties loaded` with zero.

## As built (2026-10-11)

Executed as commits `6894f6d`..`061c2e6`. The seven task commits equal the code shown above (Tasks 3 to 7 after the amendment). On top of them: `9c353a0` and `373f35d` (raid events: the weekly Raid Hour as a fallback, tolerant feed reading, a week of events remembered), `3a8a573` (one forum per region, the summary post tied to its forum), `03eb5a9` (Task 3's review, already in the code above), `838cf18` (attendance: moving group answers the completion question; an unchanged party is the same object; `completeRaid` asks only for a caller who was coming, present or asked), `5a31522` (`partyTick` returns `render` instead of a `refresh` effect; `end` stands alone; auto-set also when hatch and end were both missed), `65f8599` (the state document is checked when written; stricter reader; `UnreadableParty` carries the post's ids), `afdbcca` (`addRaidUnlessTaken`, `whenIdle` and a shutdown step, `load` once) and `061c2e6` after the whole-branch review (a boss is stored by reference only, `raidBossRef` and `tickAutoset`; `update` reports `written`; mirrors checked when written; a future event the feed dropped is forgotten). Where this text and the code differ, the code is right. Open items: "From Phase 2B" in `phase-0-follow-ups.md`.
