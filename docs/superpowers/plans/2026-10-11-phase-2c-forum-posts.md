# Phase 2C: Forum Posts and `/raid` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member reports a raid with `/raid` and gets a forum post for it: the post shows the raid as it is, is kept up to date, is listed in the pinned summary of its region's forum, and a moderator sets the forums up with `/admin setup-forums`.

**Architecture:** What a post shows is computed by pure functions in `src/render/` from a party and what the catalogue, the boss list and the gym say. Everything asked of Discord goes through one small interface, `PartyGateway`, with a discord.js implementation and an in-memory fake, so that everything above it is tested without Discord. `PartyService` joins the store of plan 2B with the gateway: it stores a reported raid, creates its post, and gathers changes into at most one edit of a post every two seconds. `/raid` reads what the member picked or typed, asks when a gym is ambiguous or lies in another region, and hands the report to the service.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on mysql2, zod 4, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: sections 4.3 (`/raid` and gym lookup), 5.1 (layout, titles, tags, summary, link line), 5.2 (create and update), 6.7 (boss list), 7 (errors, deferring, renders that find their post gone). This is the third of the five Phase 2 plans. Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, sections "From Phase 2A" (plan 2C) and "From Phase 2B" (plan 2C), "From Phase 1C" (Phase 2).

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (1,177 unit tests at the end). If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **A post is rendered by pure functions** (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink` in `src/render/`). The view carries everything: the party, the time, the gym, the boss as shown, the catalogue, two emoji. The same view gives the same post.
2. **Times are Discord timestamps** (`<t:…:t>`, `<t:…:R>`): each reader sees them in their own zone and "in 12 minutes" counts down by itself, so a post does not need editing as time passes or the date changes.
3. **Attendees are shown as mentions** (an embed never pings), in the order they signed up, by status: Here, Coming, Interested per group, and Done. Team emoji and sorting by team are gone: they needed every member's roles, which the bot does not get without a privileged intent.
4. **The controls of a post (buttons, group menu) are plan 2D.** A post of this plan has none. "Set time" buttons and the screenshot option of `/raid` (spec 4.3) are plan 2D and Phase 7.
5. **Tags:** the stage (`Egg`, `Hatched`, `Ended`), the tier (`T1`, `T3`, `T5`, `Mega`, `Elite`, `EX`) and `Shadow`. Mega legendary and super mega raids carry `Mega` (the spec has no tag for them; the title and the embed say which it is).
6. **Boss pictures come from the raid boss feed** (`assets.image`), stored with the boss in a new column: the public icon files cannot be worked out from ids. A boss that is not on the list has no picture.
7. **`PartyGateway` is the only code that calls discord.js for parties.** A method working on something a moderator may have deleted answers `false` or `undefined` for "gone" and throws for anything else. Its discord.js implementation is thin and has no unit tests of its own: the staging checklist at the end is its test.
8. **A raid is stored before its post exists** (the store's check-and-insert is what prevents two raids at one gym). If the post cannot be created, the raid is ended again at once; at start, every active raid without a post is ended.
9. **Changes are gathered** (`Coalescer`): many changes of a party within two seconds are one edit of its post; the same for a forum's summary. A title is changed at most twice in ten minutes (Discord's limit for renaming a thread), and the newest title is applied with a later change. A post that is gone ends its party (spec 7).
10. **One forum per region**, named `<region channel>-raids`, created next to the region's channel by `/admin setup-forums`, which also adds missing tags and creates and pins the summary post. It is safe to run again and repairs a deleted forum or summary.
11. **`/raid boss gym [time]`.** Both `boss` and `gym` autocomplete, and a picked choice carries an exact value (`b:<key>:<level>:<shadow>`, `e:<level>:<shadow>`, `g:<gym id>`). Typed text also works: a tier is an egg; the name of a current boss is that boss; any other Pokémon needs its tier first (`t3 pikachu`), because nothing else says what tier it is. A typed gym is acted on only when exactly one gym has every word as typed; otherwise the best few are offered in a menu. A gym in another region is confirmed with buttons. The time is the hatch time for an egg and the end time for a boss.
12. **A boss named in a report means the raid was seen hatched** (plan 2B). `/raid boss:Yveltal` without a time is therefore over 45 minutes later; with an end time the clock decides.
13. **The reporter's settings** (automatic status, anonymous reports) are read through `ctx.users`. An anonymous report shows no reporter.
14. **Requests waiting for an answer** (the gym menu, the confirmation) are kept in memory for ten minutes under a random token that is the id in the controls' custom id; a restart forgets them and the control says it has expired.
15. **Not in this plan:** controls on posts, the scheduler loop, archiving, removal of the link line when a raid ends (2D); mirrors and access for other regions' members (2E); notifications (Phase 4).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure. `src/render/` may import `discord.js` for types and `escapeMarkdown` only, and never calls Discord.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` (`test/support/fake-gateway.ts`) and the fake interactions. Database tests need Docker (Task 1 only).
- Database changes are additive only. `src/db/types.ts` is generated: never edit it by hand.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members or by a feed is shown through `plain()` (`src/render/text.ts`).
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Invisible characters (U+200B and the like) appear in this plan's code only as `\uXXXX` escapes inside string literals; they must stay escapes in the files (check with `grep -c $'\u200b' <file>`: 0).
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path.

## Review Focus

1. Text a member or a feed wrote reaches a post, a title or a reply: a group label with Markdown, a gym notice with `@everyone`, a boss name from the feed, a gym search text echoed in an error. It must show as plain text and never ping. Tests: Task 2, "escapes Markdown and tidies white space", "keeps a typed mention, channel link, emoji or timestamp from being read as one", "tells about the gym…"; Task 7, "says what would work for a Pokémon that is no current boss…".
2. Discord's size limits: a title of a long boss and a long gym name, a group of 120 trainers, 80 raids in a summary. Nothing may exceed a limit or cut a character in half. Tests: Task 2, "never exceeds the 100 characters of a post title…", "warns a group of more than twenty and cuts a list…", "fits into one message however many raids there are…", "never cuts a character made of two units in half".
3. Things deleted by hand while the bot runs: a forum, a post, the summary post, a region's channel. A report must say the region has no forum; a party whose post is gone must end; `/admin setup-forums` must repair. Tests: Task 5, "treats a forum that was deleted by hand as no forum", "ends a party whose post somebody deleted", "makes a new summary post when the old one was deleted"; Task 6, "makes a new forum for a region whose forum was deleted", "says so for a region whose channel is gone…".
4. A report that fails half-way, and two reports of one gym at once. No active raid may be left without a post, and one raid must come of two reports. Tests: Task 5, "ends the raid again when its post cannot be created…", "makes one raid of two reports of a gym at the same moment", "ends active parties that have no post…".
5. A control of `/raid` used by another member, used twice, used after it expired, or with a value that was not offered. Tests: Task 8, "lets only the member who asked use the menu, and only for a gym that was offered", "offers a menu when several gyms fit…" (the second use), Task 8's `pending-requests.test.ts`.

---

## File Structure

```
src/db/migrations/2026_10_11_003_raid_boss_image.ts   create: RaidBoss.image
src/domain/pogo/raid-boss-feed.ts, raid-bosses.ts     modify: the picture of a boss
src/db/repositories/raid-boss-repository.ts           modify: stores it
src/render/
  text.ts               create: plain, truncate, timestamp, fitItems, count, titleCase, LIMITS
  raid-post.ts          create: renderRaidPost, raidTitle, raidTags, shownBoss, shownAutoset, FORUM_TAGS
  summary.ts            create: renderSummary, renderRegionLink, SUMMARY_TITLE
src/discord/
  party-gateway.ts      create: PartyGateway, DiscordPartyGateway, isGone, OutgoingMessage
  guards.ts             modify: regionChannelOf also for a forum and its posts
  router.ts             modify: one debug line per handled interaction
src/services/
  region-directory.ts   create: RegionDirectory, RegionProvider (ctx.regions)
  coalescer.ts          create: Coalescer
  party-service.ts      create: PartyService (ctx.partyService)
  pending-requests.ts   create: PendingRequests
src/commands/
  admin/index.ts, admin/setup-forums.ts   create: /admin setup-forums
  raids/raid-input.ts   create: what a report names: boss, gym, time
  raids/raid.ts         create: /raid and its controls
  index.ts              modify: lists /raid and /admin
src/components/index.ts modify: lists the controls of /raid
src/app-context.ts, src/app.ts   modify: ctx.regions, ctx.partyService, ctx.users; wiring
test/support/
  fake-gateway.ts       create: FakePartyGateway
  party-service.ts      create: partyServiceWith, TestRegions
  providers.ts, test-context.ts, raid-bosses.ts, fake-interactions.ts   modify
```

---

### Task 1: Boss pictures from the feed

**Files:**
- Create: `src/db/migrations/2026_10_11_003_raid_boss_image.ts`
- Modify: `src/db/migrations/index.ts`, `src/db/migrator.db.test.ts`, `src/db/repositories/raid-boss-repository.db.test.ts`, `src/db/repositories/raid-boss-repository.ts`, `src/domain/pogo/raid-boss-feed.test.ts`, `src/domain/pogo/raid-boss-feed.ts`, `src/domain/pogo/raid-bosses.test.ts`, `src/domain/pogo/raid-bosses.ts`, `test/support/raid-bosses.ts`
- Regenerate: `src/db/types.ts`

**Interfaces:**
- Consumes: `parseRaidBossFeed`, `FeedBoss`, `effectiveBosses`, `RaidBoss`, `RaidBossRepository`, `MemoryRaidBossStore`, the migrator.
- Produces: `FeedBoss.image?: string` (a plain https address of at most 300 characters, or absent), `RaidBoss.image?: string` (absent for a boss from an override), the column `RaidBoss.image varchar(300) null` (migration `2026_10_11_003_raid_boss_image`).

Docker must be running for this task (`npm run db:codegen` and two database test files). One test string contains the escape `\u202e` inside a string literal: keep it an escape.

- [ ] **Step 1: Test support**

Apply to `test/support/raid-bosses.ts`:

```diff
--- a/test/support/raid-bosses.ts
+++ b/test/support/raid-bosses.ts
@@ -60,9 +60,11 @@ export class MemoryRaidBossStore implements RaidBossStore {
         listed.add(identity(boss));
         const row = this.rows.find((candidate) => identity(candidate) === identity(boss));
         if (row) {
+          delete row.image;
           Object.assign(row, {
             shiny: boss.shiny,
             name: boss.name,
+            ...(boss.image === undefined ? {} : { image: boss.image }),
             lastSeen: now,
             firstSeen: row.active ? row.firstSeen : now,
             active: true,
```

- [ ] **Step 2: Write the failing tests**

Apply to `src/db/migrator.db.test.ts`:

```diff
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -97,6 +97,7 @@ describe('runMigrations', () => {
       '2026_10_09_000_baseline',
       '2026_10_10_001_raid_bosses',
       '2026_10_11_002_parties',
+      '2026_10_11_003_raid_boss_image',
     ]);
     expect(await describeSchema(database, ADDED_TABLES, ADDED_COLUMNS, ADDED_INDEXES)).toEqual(
       before,
@@ -152,7 +153,7 @@ describe('runMigrations', () => {
     // What a failure after the first added column leaves behind: no second column, no index.
     await database.query('alter table Region drop index region_forumchannelid_unique');
     await database.query('alter table Region drop column summaryMessageId');
-    await database.query("delete from kysely_migration where name = '2026_10_11_002_parties'");
+    await database.query("delete from kysely_migration where name >= '2026_10_11_002_parties'");
     await expect(migrate(database)).resolves.toBeUndefined();
     expect(await describeSchema(database)).toEqual(complete);
   });
```

Apply to `src/db/repositories/raid-boss-repository.db.test.ts`:

```diff
--- a/src/db/repositories/raid-boss-repository.db.test.ts
+++ b/src/db/repositories/raid-boss-repository.db.test.ts
@@ -99,6 +99,15 @@ describe('RaidBossRepository', () => {
       expect(await bosses.lastSyncedAt()).toBe(NOW);
     });
 
+    it('stores the picture of a boss, replaces it, and clears it when the feed has none', async () => {
+      await bosses.replaceFeed([boss('YVELTAL', T5, { image: 'https://example.test/a.png' })], NOW);
+      expect((await bosses.listActive())[0]?.image).toBe('https://example.test/a.png');
+      await bosses.replaceFeed([boss('YVELTAL', T5, { image: 'https://example.test/b.png' })], NOW);
+      expect((await bosses.listActive())[0]?.image).toBe('https://example.test/b.png');
+      await bosses.replaceFeed([boss('YVELTAL', T5)], NOW);
+      expect((await bosses.listActive())[0]).not.toHaveProperty('image');
+    });
+
     it('stores text outside the Latin alphabet', async () => {
       await bosses.replaceFeed([boss('MR_MIME', T3, { name: 'Flabébé ♀ メガ' })], NOW);
       expect((await bosses.listActive())[0]?.name).toBe('Flabébé ♀ メガ');
```

Apply to `src/domain/pogo/raid-boss-feed.test.ts`:

```diff
--- a/src/domain/pogo/raid-boss-feed.test.ts
+++ b/src/domain/pogo/raid-boss-feed.test.ts
@@ -23,9 +23,16 @@ describe('parseRaidBossFeed: the feed as downloaded', () => {
       tier: { level: 'T5', shadow: false },
       shiny: true,
       name: 'Yveltal',
+      image: 'https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm717.icon.png',
     });
   });
 
+  it('keeps the address of every picture of the downloaded feed', () => {
+    for (const listed of bosses) {
+      expect(listed.image).toMatch(/^https:\/\/raw\.githubusercontent\.com\/.+\.png$/);
+    }
+  });
+
   it('keeps the form id of a mega, a named form and a costume', () => {
     expect(bosses.find((b) => b.pokemonId === 'BLASTOISE')).toMatchObject({
       form: 'BLASTOISE_MEGA',
@@ -248,3 +255,49 @@ describe('parseRaidBossFeed: a feed that must not replace the list', () => {
     expect(() => parseRaidBossFeed(feed({ lvl1: many }))).toThrow(/expected format/);
   });
 });
+
+describe('parseRaidBossFeed: pictures', () => {
+  const one = (assets: unknown) =>
+    parseRaidBossFeed({ currentList: { lvl5: [boss('MEWTWO', { assets })] } }).bosses[0];
+
+  it('keeps a plain https address', () => {
+    expect(one({ image: 'https://example.test/pm150.icon.png' })?.image).toBe(
+      'https://example.test/pm150.icon.png',
+    );
+  });
+
+  it('leaves the picture out, and keeps the boss, when the address is not usable', () => {
+    const unusable: unknown[] = [
+      undefined,
+      null,
+      'not an object',
+      {},
+      { image: null },
+      { image: 42 },
+      { image: 'http://example.test/pm150.png' },
+      { image: 'javascript:alert(1)' },
+      { image: 'https://example.test/pm 150.png' },
+      { image: 'https://example.test/\u202epm150.png' },
+      { image: `https://example.test/${'a'.repeat(300)}.png` },
+    ];
+    for (const assets of unusable) {
+      const listed = one(assets);
+      expect(listed).toMatchObject({ pokemonId: 'MEWTWO' });
+      expect(listed).not.toHaveProperty('image');
+    }
+  });
+
+  it('takes the picture of the second entry when the first of a boss listed twice has none', () => {
+    const { bosses: listed } = parseRaidBossFeed({
+      currentList: {
+        lvl5: [
+          boss('MEWTWO'),
+          boss('MEWTWO', { assets: { image: 'https://example.test/second.png' } }),
+          boss('MEWTWO', { assets: { image: 'https://example.test/third.png' } }),
+        ],
+      },
+    });
+    expect(listed).toHaveLength(1);
+    expect(listed[0]?.image).toBe('https://example.test/second.png');
+  });
+});
```

Apply to `src/domain/pogo/raid-bosses.test.ts`:

```diff
--- a/src/domain/pogo/raid-bosses.test.ts
+++ b/src/domain/pogo/raid-bosses.test.ts
@@ -165,9 +165,24 @@ describe('effectiveBosses: the feed alone', () => {
       entry: catalogue.byKey('blastoise_mega'),
       source: 'feed',
       autoset: false,
+      image:
+        'https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm9.fMEGA.icon.png',
     });
   });
 
+  it('gives a boss the picture of whichever feed row has one, and an override boss none', () => {
+    const plain = feedBoss('PIKACHU', T3);
+    const costume = feedBoss('PIKACHU', T3, {
+      form: 'PIKACHU_NEW_HAT',
+      name: 'Pikachu',
+      image: 'https://example.test/hat.png',
+    });
+    const [pikachu] = effectiveBosses([plain, costume], [], catalogue, NOW);
+    expect(pikachu?.image).toBe('https://example.test/hat.png');
+    const added = effectiveBosses([], [override('add', 'ZEKROM', T5)], catalogue, NOW);
+    expect(added[0]).not.toHaveProperty('image');
+  });
+
   it('keeps a Pokémon the game master does not know, under the name of the feed', () => {
     const [boss] = effectiveBosses(
       [feedBoss('NEWMON', T5, { form: 'NEWMON_SKY', name: 'Newmon (Sky Forme)' })],
```

Run: `npx vitest run --project unit src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-bosses.test.ts`
Expected: FAIL (the new picture tests fail: `image` is undefined).

- [ ] **Step 3: The implementation**

Create `src/db/migrations/2026_10_11_003_raid_boss_image.ts`:

```ts
import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The address of a boss's picture, as the raid boss feed gives it (`assets.image`). The public
 * icon files cannot be worked out from a Pokémon's ids, so the feed's address is kept with the
 * boss. Null for a boss stored before this column existed, until the next sync fills it in.
 *
 * Safe to run again after a failure half-way: the column is added only when it is missing.
 */
export const raidBossImage: Migration = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
  async up(db: Kysely<any>) {
    const existing = await sql<{ n: number }>`
      select count(*) as n from information_schema.columns
      where table_schema = database() and table_name = 'RaidBoss' and column_name = 'image'`.execute(
      db,
    );
    if (Number(existing.rows[0]?.n ?? 0) === 0) {
      await sql`alter table RaidBoss add column image varchar(300) default null`.execute(db);
    }
  },
  async down() {
    // Additive only: the column stays.
  },
};
```

Apply to `src/db/migrations/index.ts`:

```diff
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -2,6 +2,7 @@ import type { Migration } from 'kysely/migration';
 import { baseline } from './2026_10_09_000_baseline.js';
 import { raidBosses } from './2026_10_10_001_raid_bosses.js';
 import { parties } from './2026_10_11_002_parties.js';
+import { raidBossImage } from './2026_10_11_003_raid_boss_image.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -11,4 +12,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_09_000_baseline': baseline,
   '2026_10_10_001_raid_bosses': raidBosses,
   '2026_10_11_002_parties': parties,
+  '2026_10_11_003_raid_boss_image': raidBossImage,
 };
```

Apply to `src/db/repositories/raid-boss-repository.ts`:

```diff
--- a/src/db/repositories/raid-boss-repository.ts
+++ b/src/db/repositories/raid-boss-repository.ts
@@ -66,6 +66,7 @@ export class RaidBossRepository implements RaidBossStore {
         tier,
         shiny: row.shiny === 1,
         name: row.name,
+        ...(row.image === null ? {} : { image: row.image }),
         firstSeen: Number(row.firstSeen),
         lastSeen: Number(row.lastSeen),
       });
@@ -77,7 +78,7 @@ export class RaidBossRepository implements RaidBossStore {
    * Makes `bosses` the stored feed list, in one transaction: a boss already stored keeps its
    * `firstSeen` if it was still active and starts again if it had gone; every listed boss gets
    * `lastSeen = now`; a stored boss that is not listed becomes inactive. Of a boss listed twice
-   * the last entry's `shiny` and `name` are stored (the parser removes duplicates before that).
+   * the last entry's `shiny`, `name` and `image` are stored (the parser removes duplicates before that).
    */
   async replaceFeed(bosses: readonly FeedBoss[], now: number): Promise<void> {
     await inTransaction(this.db, async (trx) => {
@@ -101,6 +102,7 @@ export class RaidBossRepository implements RaidBossStore {
             .set({
               shiny: boss.shiny ? 1 : 0,
               name: boss.name,
+              image: boss.image ?? null,
               lastSeen: String(now),
               active: 1,
               ...(row.active === 1 ? {} : { firstSeen: String(now) }),
@@ -117,6 +119,7 @@ export class RaidBossRepository implements RaidBossStore {
               shadow,
               shiny: boss.shiny ? 1 : 0,
               name: boss.name,
+              image: boss.image ?? null,
               firstSeen: String(now),
               lastSeen: String(now),
               active: 1,
```

Apply to `src/domain/pogo/raid-boss-feed.ts`:

```diff
--- a/src/domain/pogo/raid-boss-feed.ts
+++ b/src/domain/pogo/raid-boss-feed.ts
@@ -15,6 +15,8 @@ export interface FeedBoss {
   shiny: boolean;
   /** The feed's English name. Shown only for a Pokémon the game master does not know yet. */
   name: string;
+  /** Address of the boss's picture (`assets.image`), when the feed gives a usable one. */
+  image?: string;
 }
 
 export interface ParsedFeed {
@@ -63,6 +65,15 @@ const bossName = z
   )
   .pipe(z.string().min(1).max(100));
 
+/**
+ * A picture address is shown by Discord, so only a plain https address of a sensible length is
+ * kept; anything else is left out, never a reason to refuse the boss.
+ */
+const imageAddress = z
+  .url({ protocol: /^https$/ })
+  .max(300)
+  .regex(/^[\x21-\x7e]+$/);
+
 const bossListSchema = z
   .array(
     z.object({
@@ -70,6 +81,7 @@ const bossListSchema = z
       form: gameMasterId.nullish(),
       shiny: z.boolean(),
       names: z.object({ English: bossName }),
+      assets: z.object({ image: z.unknown() }).nullish().catch(undefined),
     }),
   )
   .max(200);
@@ -122,8 +134,10 @@ export function parseRaidBossFeed(raw: unknown): ParsedFeed {
       const form = boss.form == null || boss.form === boss.id ? null : boss.form;
       const identity = `${boss.id}|${form ?? ''}|${tier.level}|${String(tier.shadow)}`;
       const earlier = seen.get(identity);
+      const image = imageAddress.safeParse(boss.assets?.image);
       if (earlier) {
         earlier.shiny ||= boss.shiny;
+        if (earlier.image === undefined && image.success) earlier.image = image.data;
         continue;
       }
       const entry: FeedBoss = {
@@ -132,6 +146,7 @@ export function parseRaidBossFeed(raw: unknown): ParsedFeed {
         tier: { ...tier },
         shiny: boss.shiny,
         name: boss.names.English,
+        ...(image.success ? { image: image.data } : {}),
       };
       seen.set(identity, entry);
       bosses.push(entry);
```

Apply to `src/domain/pogo/raid-bosses.ts`:

```diff
--- a/src/domain/pogo/raid-bosses.ts
+++ b/src/domain/pogo/raid-bosses.ts
@@ -58,6 +58,8 @@ export interface RaidBoss extends BossIds {
   source: 'feed' | 'override';
   /** A moderator chose this boss as what eggs of its tier hatch as. */
   autoset: boolean;
+  /** Address of the boss's picture, when the feed gave one. A boss from an override has none. */
+  image?: string;
 }
 
 const GAME_MASTER_ID = /^[A-Z][A-Z0-9_]{0,63}$/;
@@ -165,6 +167,7 @@ export function effectiveBosses(
     const existing = bosses.get(slot(key, boss.tier));
     if (existing) {
       existing.shiny ||= boss.shiny;
+      existing.image ??= boss.image;
       continue;
     }
     bosses.set(slot(key, boss.tier), {
@@ -177,6 +180,7 @@ export function effectiveBosses(
       entry,
       source: 'feed',
       autoset: false,
+      ...(boss.image === undefined ? {} : { image: boss.image }),
     });
   }
 
```

Then run `npm run db:codegen` (Docker must be running). Expected: `git diff src/db/types.ts` shows exactly this, and nothing else; never edit that file by hand:

```diff
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -144,6 +144,7 @@ export interface RaidBoss {
   firstSeen: string;
   form: Generated<string>;
   id: Generated<number>;
+  image: string | null;
   lastSeen: string;
   level: string;
   name: string;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-bosses.test.ts`
Expected: PASS (the two files of `src/domain/pogo` named above).

Run: `npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/db/migrations/2026_10_11_003_raid_boss_image.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts src/db/repositories/raid-boss-repository.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-bosses.ts test/support/raid-bosses.ts
npm run check
git add src/db/migrations/2026_10_11_003_raid_boss_image.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/raid-boss-repository.db.test.ts src/db/repositories/raid-boss-repository.ts src/db/types.ts src/domain/pogo/raid-boss-feed.test.ts src/domain/pogo/raid-boss-feed.ts src/domain/pogo/raid-bosses.test.ts src/domain/pogo/raid-bosses.ts test/support/raid-bosses.ts
git commit -m "Raid bosses: the picture address from the feed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,068 unit tests.

---

### Task 2: The renderer: raid post, summary, link line

**Files:**
- Create: `src/render/raid-post.test.ts`, `src/render/raid-post.ts`, `src/render/summary.test.ts`, `src/render/summary.ts`, `src/render/text.test.ts`, `src/render/text.ts`

**Interfaces:**
- Consumes: Plan 2B's party model (`RaidParty`, `headCount`, `membersWhere`, `raidStage`), `PokemonCatalogue` (`weaknesses`, `raidCatchCp`, `boostedIn`, `move`, `byKey`), `RaidBoss`, `raidTierLabel`; test support `testRaid`, `withAttendees`, `raidBossesFixture`, `catalogueFixture`, `testGyms`.
- Produces: `src/render/text.ts`: `LIMITS`, `plain(text)`, `truncate(text, limit)`, `timestamp(ms, style?)`, `fitItems(items, limit, separator?)`, `count(n, singular, plural?)`, `titleCase(id)`. `src/render/raid-post.ts`: `FORUM_TAGS`, `ForumTag`, `PostGym`, `ShownBoss`, `RaidPostView`, `RenderedPost { title; tags; embed }`, `shownBoss(party, catalogue, bosses)`, `shownAutoset(tier, autoset)`, `raidTitle(view)`, `raidTags(party, now)`, `renderRaidPost(view)`, `trainerCount(party)`. `src/render/summary.ts`: `SUMMARY_TITLE`, `ListedRaid`, `renderSummary(raids, now)`, `renderRegionLink(title, postId)`.

The two long expectations in `raid-post.test.ts` are inline snapshots: write them exactly as shown (they were generated by the code below). `text.ts` and two test files contain `\u200b` escapes inside string literals: keep them escapes.

- [ ] **Step 1: Write the failing tests**

Create `src/render/raid-post.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import {
  ALICE,
  at,
  BOB,
  CAROL,
  MINUTE,
  PARTY_NOW,
  REPORTER,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../test/support/parties.js';
import { raidBossesFixture } from '../../test/support/raid-bosses.js';
import type { RaidParty } from '../domain/party/party.js';
import { setBoss, setHatchTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import {
  raidTags,
  raidTitle,
  renderRaidPost,
  shownAutoset,
  shownBoss,
  type PostGym,
  type RaidPostView,
} from './raid-post.js';

const catalogue = catalogueFixture();
const bosses = raidBossesFixture().bosses();
const rules = testRaidRules();
const [library, fountain] = testGyms();
const T5 = { level: 'T5', shadow: false } as const;
const emoji = { shiny: '✨', remote: '🛰️' };

function view(party: RaidParty, extra: Partial<RaidPostView> = {}): RaidPostView {
  return {
    party,
    now: PARTY_NOW,
    gym: library,
    boss: shownBoss(party, catalogue, bosses),
    catalogue,
    showUnknownMoves: true,
    emoji,
    ...extra,
  };
}

/** An egg reported at 14:00 that hatches at 14:30 and ends at 15:15. */
const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
const yveltal = setBoss(egg, { tier: T5, boss: { key: 'yveltal' } }, rules, PARTY_NOW).party;

describe('shownBoss', () => {
  it('is undefined for an egg', () => {
    expect(shownBoss(egg, catalogue, bosses)).toBeUndefined();
  });

  it('takes name and stats from the catalogue and shiny and picture from the boss list', () => {
    const shown = shownBoss(yveltal, catalogue, bosses);
    expect(shown).toMatchObject({ name: 'Yveltal', shiny: true });
    expect(shown?.entry?.key).toBe('yveltal');
    expect(shown?.image).toMatch(/pm717\.icon\.png$/);
  });

  it('shows a Pokémon that is no current boss without shiny mark or picture', () => {
    const mewtwo = setBoss(egg, { tier: T5, boss: { key: 'mewtwo' } }, rules, PARTY_NOW).party;
    const shown = shownBoss(mewtwo, catalogue, bosses);
    expect(shown).toMatchObject({ name: 'Mewtwo', shiny: false });
    expect(shown).not.toHaveProperty('image');
  });

  it('shows a boss the game master does not know by the name of the feed, without an entry', () => {
    const newmon = setBoss(egg, { tier: T5, boss: { name: 'Newmon' } }, rules, PARTY_NOW).party;
    expect(shownBoss(newmon, catalogue, bosses)).toEqual({ name: 'Newmon', shiny: false });
  });

  it('gives a key the catalogue has lost a readable name', () => {
    const gone = setBoss(egg, { tier: T5, boss: { key: 'gone_mon' } }, rules, PARTY_NOW).party;
    expect(shownBoss(gone, catalogue, bosses)).toEqual({ name: 'Gone Mon', shiny: false });
  });
});

describe('shownAutoset', () => {
  it('names what an egg will hatch as only for the tier it was asked for', () => {
    const t5 = raidBossesFixture().autoset(T5);
    expect(shownAutoset(T5, t5)?.name).toBe(t5?.name);
    expect(shownAutoset({ level: 'T3', shadow: false }, t5)).toBeUndefined();
    expect(shownAutoset(T5, undefined)).toBeUndefined();
  });
});

describe('raidTitle and raidTags', () => {
  it('names the boss or the egg, and the gym by its nickname', () => {
    expect(raidTitle(view(egg))).toBe('T5 egg · The Stacks');
    expect(raidTitle(view(yveltal))).toBe('Yveltal · The Stacks');
    expect(raidTitle(view(egg, { gym: fountain }))).toBe('T5 egg · Old Stone Fountain');
    expect(raidTitle(view(egg, { gym: undefined }))).toBe('T5 egg · Unknown gym');
    const hatched = view(egg, { now: at('2026-10-13T14:31') });
    expect(raidTitle(hatched)).toBe('T5 raid · The Stacks');
    const shadow = testRaid({ tier: { level: 'T3', shadow: true } });
    expect(raidTitle(view(shadow))).toBe('Shadow T3 egg · The Stacks');
  });

  it('never exceeds the 100 characters of a post title, and keeps the gym', () => {
    const gym: PostGym = { ...library!, nickname: null, name: 'G'.repeat(90) };
    const long = setBoss(egg, { tier: T5, boss: { name: 'B'.repeat(90) } }, rules, PARTY_NOW);
    const title = raidTitle(view(long.party, { gym }));
    expect(title.length).toBeLessThanOrEqual(100);
    expect(title).toMatch(/^B+… · G{59}…$/);
  });

  it('tags the stage, the tier and shadow raids', () => {
    expect(raidTags(egg, PARTY_NOW)).toEqual(['Egg', 'T5']);
    expect(raidTags(egg, at('2026-10-13T14:30'))).toEqual(['Hatched', 'T5']);
    expect(raidTags(egg, at('2026-10-13T15:15'))).toEqual(['Ended', 'T5']);
    expect(raidTags(testRaid({ tier: { level: 'T1', shadow: true } }), PARTY_NOW)).toEqual([
      'Egg',
      'T1',
      'Shadow',
    ]);
    for (const level of ['Mega', 'MegaLegendary', 'SuperMega'] as const) {
      expect(raidTags(testRaid({ tier: { level, shadow: false } }), PARTY_NOW)).toEqual([
        'Egg',
        'Mega',
      ]);
    }
    expect(raidTags(testRaid({ tier: { level: 'Elite', shadow: false } }), PARTY_NOW)[1]).toBe(
      'Elite',
    );
    expect(raidTags(testRaid({ tier: { level: 'EX', shadow: false } }), PARTY_NOW)[1]).toBe('EX');
  });
});

describe('renderRaidPost', () => {
  it('shows an egg with its times and who is interested', () => {
    expect(renderRaidPost(view(egg))).toMatchInlineSnapshot(`
      {
        "embed": {
          "color": 15844367,
          "description": "**T5 egg**
      Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.
      Reported by <@200000000000000001>.",
          "fields": [
            {
              "name": "Trainers (1)",
              "value": "**Interested** <@200000000000000001>",
            },
          ],
          "title": "The Stacks",
          "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
        },
        "tags": [
          "Egg",
          "T5",
        ],
        "title": "T5 egg · The Stacks",
      }
    `);
  });

  it('shows a hatched raid with boss, groups, a meeting time and everybody in their place', () => {
    const party: RaidParty = {
      ...withAttendees(
        { ...yveltal, raid: { ...yveltal.raid, fastMove: 'SNARL_FAST' } },
        {
          [ALICE]: { status: PartyStatus.Present, number: 3 },
          [BOB]: { status: PartyStatus.Coming, remote: true, group: 'B' },
          [CAROL]: { status: PartyStatus.Complete },
          '200000000000000009': { status: PartyStatus.CompletePending, pendingUntil: PARTY_NOW },
        },
      ),
      groups: [{ id: 'A', label: 'park *side*', startTime: at('2026-10-13T14:45') }, { id: 'B' }],
      defaultGroupId: 'B',
    };
    expect(renderRaidPost(view(party, { now: at('2026-10-13T14:40') }))).toMatchInlineSnapshot(`
      {
        "embed": {
          "color": 3066993,
          "description": "**T5 raid** against **Yveltal** ✨
      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
      Reported by <@200000000000000001>.",
          "fields": [
            {
              "name": "Boss",
              "value": "**Weak to** Rock, Electric, Ice, Fairy
      **Catch CP** 2073–2160, boosted 2591–2701 (Windy, Fog)
      **Moves** Snarl / ????",
            },
            {
              "name": "Group A: park \\*side\\* (5)",
              "value": "Meeting at <t:1791917100:t> (<t:1791917100:R>)
      **Here** <@200000000000000002> +2, <@200000000000000009>
      **Interested** <@200000000000000001>",
            },
            {
              "name": "Group B (1)",
              "value": "**Coming** <@200000000000000003> 🛰️",
            },
            {
              "name": "Done (1)",
              "value": "<@200000000000000004>",
            },
          ],
          "thumbnail": {
            "url": "https://raw.githubusercontent.com/pokemon-go-api/assets/main/Pokemon/pm717.icon.png",
          },
          "title": "The Stacks",
          "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
        },
        "tags": [
          "Hatched",
          "T5",
        ],
        "title": "Yveltal · The Stacks",
      }
    `);
  });

  it('shows an ended raid without times as over, and an anonymous report without the reporter', () => {
    const raid = testRaid({ anonymous: true, boss: { name: 'Newmon' } });
    const post = renderRaidPost(view(raid, { now: PARTY_NOW + 50 * MINUTE }));
    expect(post.tags).toEqual(['Ended', 'T5']);
    expect(post.embed.description).toBe('**T5 raid** against **Newmon**\nThis raid is over.');
    // A boss the game master does not know has no types, CP or moves to show.
    expect(post.embed.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
  });

  it('says what an egg will hatch as when that is certain, with that boss its picture', () => {
    const hatchesAs = shownBoss(yveltal, catalogue, bosses);
    const post = renderRaidPost(view(egg, { hatchesAs }));
    expect(post.embed.description).toContain('**T5 egg**, which hatches as **Yveltal**');
    expect(post.embed.thumbnail?.url).toMatch(/pm717/);
    expect(post.embed.fields?.[0]?.name).toBe('Likely boss');
    // The moves of a boss that is not there yet are not shown.
    expect(post.embed.fields?.[0]?.value).not.toContain('Moves');
  });

  it('hides the moves line while no move is known when the setting says so', () => {
    const quiet = renderRaidPost(view(yveltal, { showUnknownMoves: false }));
    expect(quiet.embed.fields?.[0]?.value).not.toContain('Moves');
    const known = { ...yveltal, raid: { ...yveltal.raid, chargedMove: 'DARK_PULSE' } };
    expect(
      renderRaidPost(view(known, { showUnknownMoves: false })).embed.fields?.[0]?.value,
    ).toContain('**Moves** ???? / Dark Pulse');
  });

  it('tells about the gym: EX history, the EX tag, and its notice as plain text', () => {
    const about = (gym: Partial<PostGym>, party = egg) =>
      renderRaidPost(view(party, { gym: { ...library!, ...gym } })).embed.fields?.find(
        (field) => field.name === 'About this gym',
      )?.value;
    expect(about({})).toBeUndefined();
    expect(about({ taggedEx: true })).toBe('This gym has the EX gym tag.');
    expect(about({ taggedEx: true, confirmedEx: true })).toBe(
      'This gym has hosted EX raids before.',
    );
    expect(about({ notice: 'Closes at **dusk** @everyone' })).toBe(
      'Closes at \\*\\*dusk\\*\\* @\u200beveryone',
    );
    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
    expect(about({ taggedEx: true }, ex)).toBeUndefined();
  });

  it('warns a group of more than twenty and cuts a list that is too long for its field', () => {
    const many: Record<string, object> = {};
    for (let n = 0; n < 120; n++) many[`3000000000000000${String(n).padStart(3, '0')}`] = {};
    const post = renderRaidPost(view(withAttendees(egg, many)));
    const field = post.embed.fields?.find((f) => f.name.startsWith('Trainers'));
    expect(field?.name).toBe('Trainers (121)');
    expect(field?.value).toContain('More than 20 trainers');
    expect(field?.value).toMatch(/…and \d+ more/);
    expect(field?.value.length).toBeLessThanOrEqual(1024);
  });

  it('shows a post without its gym when the gym is gone', () => {
    const post = renderRaidPost(view(egg, { gym: undefined }));
    expect(post.embed.title).toBe('Unknown gym');
    expect(post.embed).not.toHaveProperty('url');
  });

  it('has the same result for the same view', () => {
    expect(renderRaidPost(view(yveltal))).toEqual(renderRaidPost(view(yveltal)));
    expect(REPORTER).toBe('200000000000000001');
  });
});
```

Create `src/render/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  MINUTE,
  PARTY_NOW,
  testRaid,
  testRaidRules,
  withAttendees,
} from '../../test/support/parties.js';
import type { RaidParty } from '../domain/party/party.js';
import { setEndTime, setHatchTime } from '../domain/party/raid.js';
import { endParty } from '../domain/party/tick.js';
import { renderRegionLink, renderSummary, type ListedRaid } from './summary.js';

const rules = testRaidRules();
const ID = (n: number): string => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

function listed(party: RaidParty, title: string, post: string | null): ListedRaid {
  return { party: { ...party, forumPostId: post }, title };
}

describe('renderSummary', () => {
  it('says so when there is no raid', () => {
    expect(renderSummary([], PARTY_NOW)).toBe('No raids right now. Report one with `/raid`.');
  });

  it('lists the raids by when they end, with a link, the time that matters and the head count', () => {
    const egg = setHatchTime(testRaid({ id: ID(1) }), at('2026-10-13T14:30'), rules, PARTY_NOW);
    const hatched = withAttendees(
      setEndTime(testRaid({ id: ID(2) }), at('2026-10-13T14:20'), rules, PARTY_NOW),
      { [ALICE]: { number: 3 } },
    );
    const timeless = testRaid({ id: ID(3) });
    const text = renderSummary(
      [
        listed(egg, 'T5 egg · The Stacks', '300000000000000001'),
        listed(timeless, 'T5 egg · Old Stone Fountain', '300000000000000003'),
        listed(hatched, 'Yveltal · Starbucks', '300000000000000002'),
      ],
      PARTY_NOW,
    );
    expect(text.split('\n')).toEqual([
      `<#300000000000000002> · ends <t:${at('2026-10-13T14:20') / 1000}:R> · 4 trainers`,
      `<#300000000000000001> · hatches <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
      '<#300000000000000003> · no time set · 1 trainer',
    ]);
  });

  it('leaves out raids that have ended, by the clock or for good', () => {
    const over = setEndTime(testRaid({ id: ID(1) }), PARTY_NOW - MINUTE, rules, PARTY_NOW);
    const archived = endParty(testRaid({ id: ID(2) }));
    const text = renderSummary(
      [listed(over, 'a', '300000000000000001'), listed(archived, 'b', '300000000000000002')],
      PARTY_NOW,
    );
    expect(text).toBe('No raids right now. Report one with `/raid`.');
  });

  it('names a raid whose post does not exist yet by its title', () => {
    expect(renderSummary([listed(testRaid(), 'T5 egg · The Stacks', null)], PARTY_NOW)).toBe(
      '**T5 egg · The Stacks** · no time set · 1 trainer',
    );
  });

  it('fits into one message however many raids there are, and counts the rest', () => {
    const many = Array.from({ length: 80 }, (_, n) =>
      listed(testRaid({ id: ID(n) }), `raid ${n}`, `3000000000000000${String(n).padStart(2, '0')}`),
    );
    const text = renderSummary(many, PARTY_NOW);
    expect(text.length).toBeLessThanOrEqual(2000);
    const lines = text.split('\n');
    const last = lines.at(-1);
    expect(last).toMatch(/^…and \d+ more$/);
    expect(lines.length - 1 + Number(/\d+/.exec(last ?? '')?.[0])).toBe(80);
  });
});

describe('renderRegionLink', () => {
  it('links the post under its title', () => {
    expect(renderRegionLink('T5 egg · The Stacks', '300000000000000001')).toBe(
      'New raid: **T5 egg · The Stacks** → <#300000000000000001>',
    );
  });
});
```

Create `src/render/text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { count, fitItems, plain, timestamp, titleCase, truncate } from './text.js';

describe('plain', () => {
  it('escapes Markdown and tidies white space', () => {
    expect(plain('  park   *side* _now_ \n')).toBe('park \\*side\\* \\_now\\_');
    expect(plain('[click](https://example.test)')).toBe('\\[click](https://example.test)');
    expect(plain('# big')).toBe('\\# big');
  });

  it('keeps a typed mention, channel link, emoji or timestamp from being read as one', () => {
    expect(plain('@everyone')).toBe('@\u200beveryone');
    expect(plain('<@123456789012345678>')).toBe('<\u200b@\u200b123456789012345678>');
    expect(plain('<#123456789012345678>')).toBe('<\u200b#123456789012345678>');
    expect(plain('<:pine:1> <a:spin:2> <t:1:R>')).toBe(
      '<\u200b:pine:1> <\u200ba:spin:2> <\u200bt:1:R>',
    );
    expect(plain('2 < 3')).toBe('2 < 3');
  });
});

describe('truncate', () => {
  it('leaves a text that fits and cuts a longer one to the limit with an ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    expect(truncate('exactly10!', 10)).toBe('exactly10!');
    expect(truncate('this is too long', 10)).toBe('this is t…');
    expect(truncate('this is too long', 10)).toHaveLength(10);
    expect(truncate('word  and more', 6)).toBe('word…');
  });

  it('never cuts a character made of two units in half', () => {
    const cut = truncate('ab😀😀😀', 5);
    expect(cut).toBe('ab😀…');
    expect(/[\uD800-\uDBFF]$/.test(cut.slice(0, -1))).toBe(false);
  });
});

describe('timestamp', () => {
  it('writes a moment the way Discord shows it in the reader’s own zone', () => {
    expect(timestamp(1_760_000_000_999)).toBe('<t:1760000000:t>');
    expect(timestamp(1_760_000_000_000, 'R')).toBe('<t:1760000000:R>');
  });
});

describe('fitItems', () => {
  it('joins what fits and counts what does not', () => {
    expect(fitItems(['a', 'b', 'c'], 20)).toBe('a, b, c');
    expect(fitItems(['alpha', 'beta', 'gamma', 'delta'], 24)).toBe('alpha, beta, …and 2 more');
    expect(fitItems(['alpha', 'beta'], 3)).toBe('al…');
    expect(fitItems([], 10)).toBe('');
  });
});

describe('count and titleCase', () => {
  it('counts with the right word', () => {
    expect(count(1, 'trainer')).toBe('1 trainer');
    expect(count(0, 'trainer')).toBe('0 trainers');
    expect(count(2, 'party', 'parties')).toBe('2 parties');
  });

  it('turns an id into words', () => {
    expect(titleCase('partly_cloudy')).toBe('Partly Cloudy');
    expect(titleCase('fairy')).toBe('Fairy');
  });
});
```

Run: `npx vitest run --project unit src/render/raid-post.test.ts src/render/summary.test.ts src/render/text.test.ts`
Expected: FAIL (the modules of `src/render` cannot be found).

- [ ] **Step 2: The implementation**

Create `src/render/raid-post.ts`:

```ts
import type { APIEmbed, APIEmbedField } from 'discord.js';
import {
  headCount,
  membersWhere,
  type Attendee,
  type PartyGroup,
  type RaidParty,
  type RaidStage,
} from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
import type { PokemonEntry } from '../domain/pogo/game-master.js';
import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
import { raidTierLabel, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
import { count, fitItems, LIMITS, plain, timestamp, titleCase, truncate } from './text.js';

/** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
export const FORUM_TAGS = [
  'Egg',
  'Hatched',
  'Ended',
  'T1',
  'T3',
  'T5',
  'Mega',
  'Elite',
  'EX',
  'Shadow',
  'Train',
  'Meetup',
] as const;
export type ForumTag = (typeof FORUM_TAGS)[number];

/** A lobby holds this many trainers; a bigger group is told to split. */
const LOBBY_SIZE = 20;

const STAGE_COLOURS: Readonly<Record<RaidStage, number>> = {
  egg: 0xf1c40f,
  hatched: 0x2ecc71,
  ended: 0xe74c3c,
};

/** What the post needs to know of the gym (`Gym` of the gym repository has all of it). */
export interface PostGym {
  name: string;
  nickname: string | null;
  lat: number;
  lon: number;
  notice: string | null;
  taggedEx: boolean;
  confirmedEx: boolean;
}

/** The boss as it is shown: resolved from the party's reference (see `shownBoss`). */
export interface ShownBoss {
  name: string;
  /** Undefined for a Pokémon the game master does not know: no types, CP or moves to show. */
  entry?: PokemonEntry;
  shiny: boolean;
  image?: string;
}

export interface RaidPostView {
  party: RaidParty;
  now: number;
  /** Undefined when the gym no longer exists. */
  gym: PostGym | undefined;
  /** Undefined for an egg. */
  boss: ShownBoss | undefined;
  /** What an egg of this tier will hatch as, when that is certain. */
  hatchesAs?: ShownBoss;
  catalogue: PokemonCatalogue;
  /** Show the moves line also while no move is known (`settings.showUnknownMoves`). */
  showUnknownMoves: boolean;
  /** Emoji as message text (`<:pineshiny:123>`), or plain characters when the server has none. */
  emoji: { shiny: string; remote: string };
}

/** What a forum post of a party shows. The controls are added by the caller. */
export interface RenderedPost {
  /** The post's title. */
  title: string;
  /** Names of the tags to apply. */
  tags: ForumTag[];
  embed: APIEmbed;
}

/**
 * The boss a party's reference stands for, with what the boss list knows about it (shiny,
 * picture): the list's boss of the same Pokémon in the raid's tier, or else in any tier.
 */
export function shownBoss(
  party: RaidParty,
  catalogue: PokemonCatalogue,
  bosses: readonly RaidBoss[],
): ShownBoss | undefined {
  const ref = party.raid.boss;
  if (ref === null) return undefined;
  if ('name' in ref) {
    const listed = bosses.find((boss) => !boss.entry && boss.name === ref.name);
    return {
      name: ref.name,
      shiny: listed?.shiny ?? false,
      ...(listed?.image === undefined ? {} : { image: listed.image }),
    };
  }
  const entry = catalogue.byKey(ref.key);
  const same = bosses.filter((boss) => boss.entry !== undefined && boss.entry.key === entry?.key);
  const listed = same.find((boss) => sameRaidTier(boss.tier, party.raid.tier)) ?? same[0];
  return {
    name: entry?.name ?? titleCase(ref.key),
    ...(entry ? { entry } : {}),
    shiny: listed?.shiny ?? false,
    ...(listed?.image === undefined ? {} : { image: listed.image }),
  };
}

/** What an egg of the raid's tier is sure to hatch as, from the boss list. */
export function shownAutoset(tier: RaidTier, autoset: RaidBoss | undefined): ShownBoss | undefined {
  if (!autoset || !sameRaidTier(autoset.tier, tier)) return undefined;
  return {
    name: autoset.name,
    ...(autoset.entry ? { entry: autoset.entry } : {}),
    shiny: autoset.shiny,
    ...(autoset.image === undefined ? {} : { image: autoset.image }),
  };
}

function gymName(gym: PostGym | undefined): string {
  return gym ? (gym.nickname ?? gym.name) : 'Unknown gym';
}

function tierWords(tier: RaidTier): string {
  return raidTierLabel(tier);
}

/** `Yveltal · Big Fountain`, `T5 egg · Big Fountain`, `T5 raid · Big Fountain`. */
export function raidTitle(view: Pick<RaidPostView, 'party' | 'gym' | 'boss' | 'now'>): string {
  const { party, boss } = view;
  const stage = raidStage(party, view.now);
  const what = boss
    ? boss.name
    : `${tierWords(party.raid.tier)} ${stage === 'egg' ? 'egg' : 'raid'}`;
  // The gym is what tells posts apart, so it is the boss name that gives way.
  const where = truncate(gymName(view.gym), 60);
  return `${truncate(what, LIMITS.title - where.length - 3)} · ${where}`;
}

/** The stage, the tier and whether it is a shadow raid: three tags at most. */
export function raidTags(party: RaidParty, now: number): ForumTag[] {
  const stage: Record<RaidStage, ForumTag> = { egg: 'Egg', hatched: 'Hatched', ended: 'Ended' };
  const level: Record<RaidTier['level'], ForumTag> = {
    T1: 'T1',
    T3: 'T3',
    T5: 'T5',
    Mega: 'Mega',
    MegaLegendary: 'Mega',
    SuperMega: 'Mega',
    Elite: 'Elite',
    EX: 'EX',
  };
  const { tier } = party.raid;
  return [
    stage[raidStage(party, now)],
    level[tier.level],
    ...(tier.shadow ? ['Shadow' as const] : []),
  ];
}

function describeTimes(party: RaidParty, stage: RaidStage): string {
  const { hatchTime, endTime } = party;
  if (hatchTime === null || endTime === null) {
    return stage === 'ended' ? 'This raid is over.' : 'No time has been set yet.';
  }
  if (stage === 'egg') {
    return `Hatches ${timestamp(hatchTime, 'R')}, at ${timestamp(hatchTime)}. Ends at ${timestamp(endTime)}.`;
  }
  if (stage === 'hatched') {
    return `Hatched at ${timestamp(hatchTime)}. Ends ${timestamp(endTime, 'R')}, at ${timestamp(endTime)}.`;
  }
  return `Ended at ${timestamp(endTime)}.`;
}

function bossField(view: RaidPostView, boss: ShownBoss, title: string): APIEmbedField | undefined {
  const { catalogue, party } = view;
  const { entry } = boss;
  if (!entry) return undefined;
  const lines: string[] = [];
  const weaknesses = catalogue
    .weaknesses(entry)
    .map((weakness) => `${titleCase(weakness.type)}${weakness.multiplier > 1.6 ? ' ×2' : ''}`);
  if (weaknesses.length > 0) lines.push(`**Weak to** ${weaknesses.join(', ')}`);
  const cp = catalogue.raidCatchCp(entry, party.raid.tier.shadow);
  const weather = catalogue.boostedIn(entry).map(titleCase).join(', ');
  lines.push(
    `**Catch CP** ${cp.min}–${cp.max}, boosted ${cp.minBoosted}–${cp.maxBoosted}` +
      (weather === '' ? '' : ` (${weather})`),
  );
  const { fastMove, chargedMove } = party.raid;
  if (boss === view.boss && (view.showUnknownMoves || fastMove !== null || chargedMove !== null)) {
    const name = (id: string | null): string => (id && catalogue.move(id)?.name) ?? '????';
    lines.push(`**Moves** ${name(fastMove)} / ${name(chargedMove)}`);
  }
  return { name: title, value: truncate(lines.join('\n'), LIMITS.fieldValue) };
}

function attendeeText(memberId: string, attendee: Attendee, remote: string): string {
  const extra = attendee.number > 1 ? ` +${attendee.number - 1}` : '';
  return `<@${memberId}>${extra}${attendee.remote ? ` ${remote}` : ''}`;
}

function groupField(view: RaidPostView, group: PartyGroup, single: boolean): APIEmbedField {
  const { party, emoji } = view;
  const heads = headCount(party, group.id);
  const label = group.label ? `: ${plain(group.label)}` : '';
  const name = truncate(
    `${single && !group.label ? 'Trainers' : `Group ${group.id}${label}`} (${heads})`,
    LIMITS.fieldName,
  );
  const lines: string[] = [];
  if (group.startTime !== undefined) {
    lines.push(`Meeting at ${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`);
  }
  if (heads > LOBBY_SIZE) {
    lines.push(`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`);
  }
  const sections: [string, (attendee: Attendee) => boolean][] = [
    ['Here', (a) => a.status === PartyStatus.Present || a.status === PartyStatus.CompletePending],
    ['Coming', (a) => a.status === PartyStatus.Coming],
    ['Interested', (a) => a.status === PartyStatus.Interested],
  ];
  const budget = Math.floor((LIMITS.fieldValue - lines.join('\n').length - 60) / sections.length);
  for (const [title, belongs] of sections) {
    const members = membersWhere(party, (a) => a.group === group.id && belongs(a));
    if (members.length === 0) continue;
    const texts = members.map((id) => {
      const attendee = party.attendees[id];
      return attendee ? attendeeText(id, attendee, emoji.remote) : `<@${id}>`;
    });
    lines.push(`**${title}** ${fitItems(texts, budget)}`);
  }
  return { name, value: lines.length > 0 ? lines.join('\n') : 'Nobody yet.' };
}

/** The forum post of a raid: title, tags and the embed. Pure: the same view gives the same post. */
export function renderRaidPost(view: RaidPostView): RenderedPost {
  const { party, gym, boss, now, emoji } = view;
  const stage = raidStage(party, now);
  const tier = tierWords(party.raid.tier);

  const headline = boss
    ? `**${tier} raid** against **${plain(boss.name)}**${boss.shiny ? ` ${emoji.shiny}` : ''}`
    : `**${tier} ${stage === 'egg' ? 'egg' : 'raid'}**` +
      (view.hatchesAs ? `, which hatches as **${plain(view.hatchesAs.name)}**` : '');
  const description = [
    headline,
    describeTimes(party, stage),
    ...(party.anonymous ? [] : [`Reported by <@${party.createdById}>.`]),
  ].join('\n');

  const fields: APIEmbedField[] = [];
  const shown = boss ?? view.hatchesAs;
  const info = shown && bossField(view, shown, boss ? 'Boss' : 'Likely boss');
  if (info) fields.push(info);

  const single = party.groups.length === 1;
  for (const group of party.groups) fields.push(groupField(view, group, single));

  const done = membersWhere(party, (a) => a.status === PartyStatus.Complete).map(
    (id) => `<@${id}>`,
  );
  if (done.length > 0)
    fields.push({ name: `Done (${done.length})`, value: fitItems(done, LIMITS.fieldValue) });

  const location: string[] = [];
  if (gym && party.raid.tier.level !== 'EX') {
    if (gym.confirmedEx) location.push('This gym has hosted EX raids before.');
    else if (gym.taggedEx) location.push('This gym has the EX gym tag.');
  }
  if (gym?.notice) location.push(plain(gym.notice));
  if (location.length > 0) {
    fields.push({
      name: 'About this gym',
      value: truncate(location.join('\n'), LIMITS.fieldValue),
    });
  }

  const embed: APIEmbed = {
    title: truncate(gymName(gym), LIMITS.embedTitle),
    ...(gym
      ? { url: `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}` }
      : {}),
    description: truncate(description, LIMITS.embedDescription),
    color: STAGE_COLOURS[stage],
    ...(shown?.image === undefined ? {} : { thumbnail: { url: shown.image } }),
    fields: fields.slice(0, LIMITS.fields),
  };
  return { title: raidTitle(view), tags: raidTags(party, now), embed };
}

/** How many trainers are expected in all, for lists of raids. */
export function trainerCount(party: RaidParty): string {
  return count(headCount(party), 'trainer');
}
```

Create `src/render/summary.ts`:

```ts
import { headCount, type RaidParty } from '../domain/party/party.js';
import { raidStage } from '../domain/party/raid.js';
import { count, LIMITS, timestamp } from './text.js';

/** The title of the pinned post that lists a region's raids (spec 5.1). */
export const SUMMARY_TITLE = 'Active raids';

/** A raid for a list: the party and the title its post has. */
export interface ListedRaid {
  party: RaidParty;
  title: string;
}

/** When a raid ends, or the latest it can; raids are listed in this order. */
function endOf(party: RaidParty): number {
  return party.endTime ?? party.lastPossibleTime ?? Infinity;
}

function line({ party, title }: ListedRaid, now: number): string {
  const post = party.forumPostId === null ? `**${title}**` : `<#${party.forumPostId}>`;
  const stage = raidStage(party, now);
  let when = 'no time set';
  if (party.hatchTime !== null && party.endTime !== null) {
    when =
      stage === 'egg'
        ? `hatches ${timestamp(party.hatchTime, 'R')}`
        : `ends ${timestamp(party.endTime, 'R')}`;
  }
  return `${post} · ${when} · ${count(headCount(party), 'trainer')}`;
}

/**
 * The text of the summary post: the region's raids that have not ended by the clock, soonest
 * end first. A raid that has ended but whose post is still open is left out. What does not fit
 * into one message is counted in a last line.
 */
export function renderSummary(raids: readonly ListedRaid[], now: number): string {
  const going = raids
    .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
    .sort((a, b) => endOf(a.party) - endOf(b.party) || a.party.createdAt - b.party.createdAt);
  if (going.length === 0) return 'No raids right now. Report one with `/raid`.';
  const lines: string[] = [];
  let length = 0;
  for (const [index, raid] of going.entries()) {
    const text = line(raid, now);
    const rest = going.length - index;
    // Room is kept for the line that says how many were left out.
    if (length + text.length + 1 > LIMITS.content - 30 && rest > 0) {
      lines.push(`…and ${rest} more`);
      break;
    }
    lines.push(text);
    length += text.length + 1;
  }
  return lines.join('\n');
}

/**
 * The line posted in the region's text channel when a party is created, linking to its post
 * (spec 5.1). It is deleted when the party ends.
 */
export function renderRegionLink(title: string, postId: string): string {
  return `New raid: **${title}** → <#${postId}>`;
}
```

Create `src/render/text.ts`:

```ts
import { escapeMarkdown } from 'discord.js';

/** Discord's limits for the parts of a message this bot fills. */
export const LIMITS = {
  /** A forum post's title (a thread name). */
  title: 100,
  embedTitle: 256,
  embedDescription: 4096,
  fieldName: 256,
  fieldValue: 1024,
  fields: 25,
  content: 2000,
} as const;

/**
 * Text that members or a feed wrote, made safe to show: Markdown is escaped, and a mention or
 * channel link typed as text stays text (`@everyone` would not ping, since the client sends no
 * mentions by default, but it should not look like one either).
 */
export function plain(text: string): string {
  return escapeMarkdown(text.replace(/\s+/g, ' ').trim(), {
    maskedLink: true,
    heading: true,
    bulletedList: true,
    numberedList: true,
  })
    .replace(/@/g, '@\u200b')
    .replace(/<(?=[#@&:a/t])/g, '<\u200b');
}

/** `text`, cut to `limit` characters with an ellipsis when it is longer. Never splits a pair. */
export function truncate(text: string, limit: number): string {
  const characters = Array.from(text);
  if (text.length <= limit) return text;
  let kept = '';
  for (const character of characters) {
    if (kept.length + character.length > limit - 1) break;
    kept += character;
  }
  return `${kept.trimEnd()}…`;
}

/** A moment as Discord shows it in each reader's own time zone: `<t:1760000000:t>`. */
export function timestamp(ms: number, style: 't' | 'R' | 'f' | 'd' = 't'): string {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/**
 * As many of `items` as fit into `limit` characters when joined with `separator`; when some do
 * not, the text ends with how many were left out.
 */
export function fitItems(items: readonly string[], limit: number, separator = ', '): string {
  const all = items.join(separator);
  if (all.length <= limit) return all;
  for (let kept = items.length - 1; kept > 0; kept--) {
    const text = `${items.slice(0, kept).join(separator)}${separator}…and ${items.length - kept} more`;
    if (text.length <= limit) return text;
  }
  return truncate(items[0] ?? '', limit);
}

/** `1 trainer`, `3 trainers`. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** `fairy` → `Fairy`, `partly_cloudy` → `Partly Cloudy`. */
export function titleCase(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/render/raid-post.test.ts src/render/summary.test.ts src/render/text.test.ts`
Expected: PASS (3 files, 32 tests).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/render/raid-post.test.ts src/render/raid-post.ts src/render/summary.test.ts src/render/summary.ts src/render/text.test.ts src/render/text.ts
npm run check
git add src/render/raid-post.test.ts src/render/raid-post.ts src/render/summary.test.ts src/render/summary.ts src/render/text.test.ts src/render/text.ts
git commit -m "Renderer: what a raid post, the summary and the link line show" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,100 unit tests.

---

### Task 3: The gateway to Discord, and its fake

**Files:**
- Create: `src/discord/party-gateway.test.ts`, `src/discord/party-gateway.ts`, `test/support/fake-gateway.ts`

**Interfaces:**
- Consumes: discord.js (`Client`, `ChannelType`, `DiscordAPIError`, `RESTJSONErrorCodes`).
- Produces: `OutgoingMessage { content?; embeds?; components?; mention? }`, `TagIds`, `NewPost { title; message; tagIds }`, `PartyGateway` with `createForum(regionChannelId, name, tagNames)`, `ensureTags(forumId, tagNames)`, `createPost(forumId, post)`, `editPost(postId, message)`, `renamePost`, `setPostTags`, `pinPost`, `sendMessage(channelId, message)`, `deleteMessage(channelId, messageId)`, `channelName(channelId)`, `emoji(channelId, name)`; `isGone(err)`; `DiscordPartyGateway` (constructed with the client in this task; Task 6 changes that). Test support: `FakePartyGateway` (`forums`, `posts`, `messages`, `deleted`, `gone`, `failing`, `calls`, `channelNames`, `emojis`, `addForum`, `postsIn`, `messagesIn`).

`DiscordPartyGateway` cannot be tested without Discord; it must type-check against discord.js, and the staging checklist exercises it. Do not add tests that mock discord.js classes.

- [ ] **Step 1: Test support**

Create `test/support/fake-gateway.ts`:

```ts
import type {
  NewPost,
  OutgoingMessage,
  PartyGateway,
  TagIds,
} from '../../src/discord/party-gateway.js';

export interface FakePost {
  id: string;
  forumId: string;
  title: string;
  message: OutgoingMessage;
  tagIds: string[];
  pinned: boolean;
  /** How often the first message was edited, the title changed, the tags set. */
  edits: number;
  renames: number;
  retags: number;
}

export interface FakeMessage {
  id: string;
  channelId: string;
  message: OutgoingMessage;
}

type Method = keyof PartyGateway;

/**
 * A `PartyGateway` kept in memory: forums with tags, posts, and messages sent to channels and
 * posts. `gone` holds ids of things that were deleted by hand; `failing` makes the named methods
 * reject. `calls` lists every call in order, as `method id`.
 */
export class FakePartyGateway implements PartyGateway {
  readonly forums = new Map<
    string,
    { name: string; regionChannelId?: string; tags: Record<string, string> }
  >();
  readonly posts = new Map<string, FakePost>();
  readonly messages: FakeMessage[] = [];
  readonly deleted: { channelId: string; messageId: string }[] = [];
  readonly gone = new Set<string>();
  readonly failing = new Map<Method, Error>();
  readonly calls: string[] = [];
  readonly channelNames = new Map<string, string>();
  readonly emojis = new Map<string, string>();
  private next = 1;

  private id(): string {
    return `90000000000000${String(this.next++).padStart(4, '0')}`;
  }

  private begin(method: Method, id: string): void {
    this.calls.push(`${method} ${id}`);
    const failure = this.failing.get(method);
    if (failure) throw failure;
  }

  /** A forum that exists already, with these tags; gives its tag ids. */
  addForum(forumId: string, tagNames: readonly string[] = [], name = 'raids'): TagIds {
    const tags: Record<string, string> = {};
    for (const tag of tagNames) tags[tag] = this.id();
    this.forums.set(forumId, { name, tags });
    return tags;
  }

  /** The posts of a forum, oldest first. */
  postsIn(forumId: string): FakePost[] {
    return [...this.posts.values()].filter((post) => post.forumId === forumId);
  }

  /** The messages sent to a channel or post that were not deleted, oldest first. */
  messagesIn(channelId: string): FakeMessage[] {
    return this.messages.filter(
      (message) =>
        message.channelId === channelId &&
        !this.deleted.some((gone) => gone.messageId === message.id),
    );
  }

  createForum(regionChannelId: string, name: string, tagNames: readonly string[]) {
    return this.attempt('createForum', regionChannelId, () => {
      if (this.gone.has(regionChannelId)) return undefined;
      const forumId = this.id();
      const tags = this.addForum(forumId, tagNames, name);
      const forum = this.forums.get(forumId);
      if (forum) forum.regionChannelId = regionChannelId;
      return { forumId, tags };
    });
  }

  ensureTags(forumId: string, tagNames: readonly string[]) {
    return this.attempt('ensureTags', forumId, () => {
      const forum = this.forums.get(forumId);
      if (!forum || this.gone.has(forumId)) return undefined;
      for (const tag of tagNames) forum.tags[tag] ??= this.id();
      return { ...forum.tags };
    });
  }

  createPost(forumId: string, post: NewPost) {
    return this.attempt('createPost', forumId, () => {
      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
      const id = this.id();
      this.posts.set(id, {
        id,
        forumId,
        title: post.title,
        message: post.message,
        tagIds: [...post.tagIds],
        pinned: false,
        edits: 0,
        renames: 0,
        retags: 0,
      });
      return id;
    });
  }

  private onPost(method: Method, postId: string, change: (post: FakePost) => void) {
    return this.attempt(method, postId, () => {
      const post = this.posts.get(postId);
      if (!post || this.gone.has(postId)) return false;
      change(post);
      return true;
    });
  }

  editPost(postId: string, message: OutgoingMessage) {
    return this.onPost('editPost', postId, (post) => {
      post.message = message;
      post.edits++;
    });
  }

  renamePost(postId: string, title: string) {
    return this.onPost('renamePost', postId, (post) => {
      post.title = title;
      post.renames++;
    });
  }

  setPostTags(postId: string, tagIds: readonly string[]) {
    return this.onPost('setPostTags', postId, (post) => {
      post.tagIds = [...tagIds];
      post.retags++;
    });
  }

  pinPost(postId: string) {
    return this.onPost('pinPost', postId, (post) => {
      post.pinned = true;
    });
  }

  sendMessage(channelId: string, message: OutgoingMessage) {
    return this.attempt('sendMessage', channelId, () => {
      if (this.gone.has(channelId)) return undefined;
      const id = this.id();
      this.messages.push({ id, channelId, message });
      return id;
    });
  }

  deleteMessage(channelId: string, messageId: string) {
    return this.attempt('deleteMessage', messageId, () => {
      this.deleted.push({ channelId, messageId });
    });
  }

  channelName(channelId: string): string | undefined {
    return this.channelNames.get(channelId);
  }

  emoji(_channelId: string, name: string): string | undefined {
    return this.emojis.get(name);
  }

  /** Like a real call, the answer never comes in the same turn of the event loop. */
  private attempt<T>(method: Method, id: string, work: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          this.begin(method, id);
          resolve(work());
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/discord/party-gateway.test.ts`:

```ts
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { FakePartyGateway } from '../../test/support/fake-gateway.js';
import { isGone } from './party-gateway.js';

function apiError(code: number, status = 404): DiscordAPIError {
  return new DiscordAPIError({ code, message: 'no' }, code, status, 'GET', '/x', {});
}

describe('isGone', () => {
  it('recognises what Discord answers for a deleted channel, message or server', () => {
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownChannel))).toBe(true);
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownMessage))).toBe(true);
    expect(isGone(apiError(RESTJSONErrorCodes.UnknownGuild))).toBe(true);
  });

  it('is false for every other failure', () => {
    expect(isGone(apiError(RESTJSONErrorCodes.MissingPermissions, 403))).toBe(false);
    expect(isGone(apiError(RESTJSONErrorCodes.MissingAccess, 403))).toBe(false);
    expect(isGone(new Error('Unknown Channel'))).toBe(false);
    expect(isGone(undefined)).toBe(false);
  });
});

describe('FakePartyGateway', () => {
  it('creates a forum with tags, posts in it, and keeps what was done to a post', async () => {
    const gateway = new FakePartyGateway();
    const forum = await gateway.createForum('100000000000000001', 'west-raids', ['Egg', 'T5']);
    expect(Object.keys(forum?.tags ?? {})).toEqual(['Egg', 'T5']);
    const forumId = forum?.forumId ?? '';
    const postId = await gateway.createPost(forumId, {
      title: 'T5 egg · The Stacks',
      message: { content: 'one' },
      tagIds: [forum?.tags.Egg ?? ''],
    });
    expect(postId).toBeDefined();
    await expect(gateway.editPost(postId ?? '', { content: 'two' })).resolves.toBe(true);
    await expect(gateway.renamePost(postId ?? '', 'Yveltal · The Stacks')).resolves.toBe(true);
    await expect(gateway.pinPost(postId ?? '')).resolves.toBe(true);
    expect(gateway.postsIn(forumId)).toEqual([
      expect.objectContaining({
        title: 'Yveltal · The Stacks',
        message: { content: 'two' },
        pinned: true,
        edits: 1,
        renames: 1,
      }),
    ]);
  });

  it('adds only the tags a forum lacks', async () => {
    const gateway = new FakePartyGateway();
    const before = gateway.addForum('f', ['Egg']);
    const after = await gateway.ensureTags('f', ['Egg', 'Hatched']);
    expect(after?.Egg).toBe(before.Egg);
    expect(Object.keys(after ?? {})).toEqual(['Egg', 'Hatched']);
  });

  it('answers as Discord does for what is gone, and rejects where a test says so', async () => {
    const gateway = new FakePartyGateway();
    gateway.addForum('f');
    const postId = (await gateway.createPost('f', { title: 't', message: {}, tagIds: [] })) ?? '';
    gateway.gone.add(postId);
    await expect(gateway.editPost(postId, {})).resolves.toBe(false);
    await expect(
      gateway.createPost('nowhere', { title: 't', message: {}, tagIds: [] }),
    ).resolves.toBeUndefined();
    gateway.gone.add('c');
    await expect(gateway.sendMessage('c', { content: 'x' })).resolves.toBeUndefined();
    gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    await expect(gateway.sendMessage('d', { content: 'x' })).rejects.toThrow('Missing Permissions');
  });

  it('remembers messages until they are deleted', async () => {
    const gateway = new FakePartyGateway();
    const id = (await gateway.sendMessage('c', { content: 'x' })) ?? '';
    expect(gateway.messagesIn('c')).toHaveLength(1);
    await gateway.deleteMessage('c', id);
    expect(gateway.messagesIn('c')).toEqual([]);
    expect(gateway.calls).toEqual(['sendMessage c', `deleteMessage ${id}`]);
  });
});
```

Run: `npx vitest run --project unit src/discord/party-gateway.test.ts`
Expected: FAIL (the module `party-gateway.js` cannot be found).

- [ ] **Step 3: The implementation**

Create `src/discord/party-gateway.ts`:

```ts
import {
  ChannelType,
  DiscordAPIError,
  RESTJSONErrorCodes,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type Client,
  type ForumChannel,
  type AnyThreadChannel,
} from 'discord.js';

/** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
export interface OutgoingMessage {
  content?: string;
  embeds?: APIEmbed[];
  components?: APIActionRowComponent<APIComponentInMessageActionRow>[];
  /** Members and roles the message may ping; everything else in it stays silent. */
  mention?: { users?: string[]; roles?: string[] };
}

/** Tag ids of a forum by tag name. */
export type TagIds = Readonly<Record<string, string>>;

export interface NewPost {
  title: string;
  message: OutgoingMessage;
  tagIds: readonly string[];
}

/**
 * Everything the party code asks of Discord, so that it can be tested without Discord. A
 * method that works on something that may have been deleted by hand (a post, a forum, a
 * message) answers `false` or `undefined` when it is gone, and throws for any other failure.
 */
export interface PartyGateway {
  /**
   * Creates the forum for a region's party posts next to the region's text channel (same
   * category, so it has that category's permissions), with these tags. Undefined when the
   * region's channel is gone.
   */
  createForum(
    regionChannelId: string,
    name: string,
    tagNames: readonly string[],
  ): Promise<{ forumId: string; tags: TagIds } | undefined>;
  /** Adds the tags the forum lacks and gives all its tags. Undefined when it is gone. */
  ensureTags(forumId: string, tagNames: readonly string[]): Promise<TagIds | undefined>;
  /** Creates a post and gives its id (the id of the thread). Undefined when the forum is gone. */
  createPost(forumId: string, post: NewPost): Promise<string | undefined>;
  /** Replaces the post's first message. */
  editPost(postId: string, message: OutgoingMessage): Promise<boolean>;
  renamePost(postId: string, title: string): Promise<boolean>;
  setPostTags(postId: string, tagIds: readonly string[]): Promise<boolean>;
  /** Pins the post in its forum (a forum has one pinned post). */
  pinPost(postId: string): Promise<boolean>;
  /** Sends a message into a text channel or a post; gives its id. */
  sendMessage(channelId: string, message: OutgoingMessage): Promise<string | undefined>;
  /** Deletes a message; one that is already gone is fine. */
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  /** The name of a channel the bot can see, from the cache. */
  channelName(channelId: string): string | undefined;
  /**
   * A custom emoji, by name, of the server a channel is in, as message text (`<:name:id>`).
   * From the cache; undefined when the server has none of that name.
   */
  emoji(channelId: string, name: string): string | undefined;
}

const GONE: ReadonlySet<number | string> = new Set([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.UnknownGuild,
]);

/** Whether Discord says the thing asked about no longer exists. */
export function isGone(err: unknown): boolean {
  return err instanceof DiscordAPIError && GONE.has(err.code);
}

function payload(message: OutgoingMessage) {
  return {
    content: message.content ?? '',
    embeds: message.embeds ?? [],
    components: message.components ?? [],
    allowedMentions: {
      parse: [],
      users: message.mention?.users ?? [],
      roles: message.mention?.roles ?? [],
    },
  };
}

/** The gateway over a logged-in discord.js client. */
export class DiscordPartyGateway implements PartyGateway {
  constructor(private readonly client: Client) {}

  /** Runs `work`; a "gone" answer of Discord becomes undefined. */
  private async unlessGone<T>(work: () => Promise<T>): Promise<T | undefined> {
    try {
      return await work();
    } catch (err) {
      if (isGone(err)) return undefined;
      throw err;
    }
  }

  /** Runs `work`; false when Discord says the thing is gone, true when it worked. */
  private async done(work: () => Promise<unknown>): Promise<boolean> {
    try {
      await work();
      return true;
    } catch (err) {
      if (isGone(err)) return false;
      throw err;
    }
  }

  private async forum(forumId: string): Promise<ForumChannel | undefined> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(forumId));
    return channel?.type === ChannelType.GuildForum ? channel : undefined;
  }

  private async post(postId: string): Promise<AnyThreadChannel | undefined> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(postId));
    return channel?.isThread() ? channel : undefined;
  }

  private static tagIds(forum: ForumChannel): TagIds {
    return Object.fromEntries(forum.availableTags.map((tag) => [tag.name, tag.id]));
  }

  async createForum(
    regionChannelId: string,
    name: string,
    tagNames: readonly string[],
  ): Promise<{ forumId: string; tags: TagIds } | undefined> {
    const region = await this.unlessGone(() => this.client.channels.fetch(regionChannelId));
    if (!region || region.isDMBased() || region.isThread()) return undefined;
    const forum = await region.guild.channels.create({
      name,
      type: ChannelType.GuildForum,
      parent: region.parentId,
      availableTags: tagNames.map((tag) => ({ name: tag, moderated: true })),
    });
    return { forumId: forum.id, tags: DiscordPartyGateway.tagIds(forum) };
  }

  async ensureTags(forumId: string, tagNames: readonly string[]): Promise<TagIds | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const have = new Set(forum.availableTags.map((tag) => tag.name));
    const missing = tagNames.filter((tag) => !have.has(tag));
    if (missing.length === 0) return DiscordPartyGateway.tagIds(forum);
    const updated = await forum.setAvailableTags([
      ...forum.availableTags,
      ...missing.map((tag) => ({ name: tag, moderated: true })),
    ]);
    return DiscordPartyGateway.tagIds(updated);
  }

  async createPost(forumId: string, post: NewPost): Promise<string | undefined> {
    const forum = await this.forum(forumId);
    if (!forum) return undefined;
    const thread = await forum.threads.create({
      name: post.title,
      message: payload(post.message),
      appliedTags: [...post.tagIds],
    });
    return thread.id;
  }

  async editPost(postId: string, message: OutgoingMessage): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    // The first message of a forum post has the id of the post.
    return this.done(() => post.messages.edit(postId, payload(message)));
  }

  async renamePost(postId: string, title: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(() => post.setName(title));
  }

  async setPostTags(postId: string, tagIds: readonly string[]): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(() => post.setAppliedTags([...tagIds]));
  }

  async pinPost(postId: string): Promise<boolean> {
    const post = await this.post(postId);
    if (!post) return false;
    return this.done(() => post.pin());
  }

  async sendMessage(channelId: string, message: OutgoingMessage): Promise<string | undefined> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel?.isSendable()) return undefined;
    return this.unlessGone(async () => (await channel.send(payload(message))).id);
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
    if (!channel?.isTextBased()) return;
    await this.done(() => channel.messages.delete(messageId));
  }

  channelName(channelId: string): string | undefined {
    const channel = this.client.channels.cache.get(channelId);
    return channel && 'name' in channel && typeof channel.name === 'string'
      ? channel.name
      : undefined;
  }

  emoji(channelId: string, name: string): string | undefined {
    const channel = this.client.channels.cache.get(channelId);
    if (!channel || channel.isDMBased()) return undefined;
    return channel.guild.emojis.cache.find((candidate) => candidate.name === name)?.toString();
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/discord/party-gateway.test.ts`
Expected: PASS (1 file, 6 tests).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/discord/party-gateway.test.ts src/discord/party-gateway.ts test/support/fake-gateway.ts
npm run check
git add src/discord/party-gateway.test.ts src/discord/party-gateway.ts test/support/fake-gateway.ts
git commit -m "Party gateway: what parties ask of Discord, with a fake for tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,106 unit tests.

---

### Task 4: Regions in memory, and a region by its forum

**Files:**
- Create: `src/services/region-directory.test.ts`, `src/services/region-directory.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/discord/guards.test.ts`, `src/discord/guards.ts`, `test/support/providers.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: `Region` and `RegionRepository.listAll` (plan 2B gave regions `forumChannelId`), `channelContext`, the invented regions of `test/support/gyms.ts` (`WEST_FORUM`, `EAST_FORUM`).
- Produces: `RegionProvider { byId(id); byChannel(channelId); byForum(forumChannelId); all() }`, `RegionDirectory` (`load()`), `ctx.regions`; `regionChannelOf(interaction, ctx)` also answers for a region's forum and a post in it. Test support: `regionsFixture()`.

- [ ] **Step 1: Test support**

Apply to `test/support/providers.ts`:

```diff
--- a/test/support/providers.ts
+++ b/test/support/providers.ts
@@ -2,6 +2,7 @@ import { CURATED_NICKNAMES } from '../../src/domain/pogo/nicknames.js';
 import { PokemonSearch, mergeNicknames } from '../../src/domain/pogo/pokemon-search.js';
 import { GymLookup } from '../../src/domain/search/gym-lookup.js';
 import type { GymProvider } from '../../src/services/gym-directory.js';
+import type { RegionProvider } from '../../src/services/region-directory.js';
 import type { PokemonFinder } from '../../src/services/pokemon-search-service.js';
 import type { MapProvider } from '../../src/services/static-maps.js';
 import { loadSettings } from '../../src/config/settings.js';
@@ -50,3 +51,14 @@ export function mapsFixture(): MapProvider {
     region: () => Promise.resolve(undefined),
   };
 }
+
+/** The invented regions: West and East with their forums, and one without outline or forum. */
+export function regionsFixture(): RegionProvider {
+  const regions = testRegions();
+  return {
+    byId: (id) => regions.find((region) => region.id === id),
+    byChannel: (channelId) => regions.find((region) => region.channelId === channelId),
+    byForum: (forumId) => regions.find((region) => region.forumChannelId === forumId),
+    all: () => regions,
+  };
+}
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -5,7 +5,7 @@ import { loadSettings } from '../../src/config/settings.js';
 import type { DB } from '../../src/db/types.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
-import { gymsFixture, mapsFixture, pokemonFixture } from './providers.js';
+import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
 import { raidEventsFixture } from './raid-events.js';
 import { createTestLogger } from './test-logger.js';
@@ -27,6 +27,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     raidBosses: raidBossesFixture(),
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
+    regions: regionsFixture(),
     parties: noParties(),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
```

- [ ] **Step 2: Write the failing tests**

Apply to `src/discord/guards.test.ts`:

```diff
--- a/src/discord/guards.test.ts
+++ b/src/discord/guards.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { fakeAutocomplete, fakeChatInput } from '../../test/support/fake-interactions.js';
-import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { partyStoreWith, testRaid } from '../../test/support/parties.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { GuardableInteraction, LocatedInteraction } from './command.js';
@@ -142,6 +142,15 @@ describe('guards', () => {
     expect(regionChannelOf(autocomplete as unknown as LocatedInteraction, ctx)).toBe(WEST_CHANNEL);
   });
 
+  it('regionChannelOf also knows a region by its forum and by a post in that forum', () => {
+    expect(regionChannelOf(as(fakeChatInput({ channelId: WEST_FORUM })), ctx)).toBe(WEST_CHANNEL);
+    const inPost = fakeChatInput({ thread: { parentId: WEST_FORUM } });
+    expect(regionChannelOf(as(inPost), ctx)).toBe(WEST_CHANNEL);
+    expect(() => requireRegion(as(inPost), ctx)).not.toThrow();
+    const elsewhere = fakeChatInput({ thread: { parentId: '100000000000000099' } });
+    expect(regionChannelOf(as(elsewhere), ctx)).toBeUndefined();
+  });
+
   it('requireRegion refuses anywhere else, and DMs', () => {
     expect(() => requireRegion(as(fakeChatInput({ channelId: WEST_CHANNEL })), ctx)).not.toThrow();
     expect(() => requireRegion(as(fakeChatInput()), ctx)).toThrow('Use this in a region channel.');
```

Create `src/services/region-directory.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  testRegions,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../test/support/gyms.js';
import { createTestLogger } from '../../test/support/test-logger.js';
import type { Region } from '../db/repositories/region-repository.js';
import { RegionDirectory } from './region-directory.js';

function directory(list: () => Promise<Region[]> = () => Promise.resolve(testRegions())) {
  const { log, entries } = createTestLogger();
  return { regions: new RegionDirectory({ regions: { listAll: list }, log }), entries };
}

describe('RegionDirectory', () => {
  it('refuses to be read before it was loaded', () => {
    const { regions } = directory();
    expect(() => regions.all()).toThrow('Regions have not been loaded yet');
    expect(() => regions.byId(1)).toThrow('Regions have not been loaded yet');
  });

  it('finds a region by id, by its channel and by its forum', async () => {
    const { regions, entries } = directory();
    await regions.load();
    expect(regions.all().map((region) => region.id)).toEqual([1, 2, 3]);
    expect(regions.byId(2)?.channelId).toBe(EAST_CHANNEL);
    expect(regions.byChannel(WEST_CHANNEL)?.id).toBe(1);
    expect(regions.byForum(EAST_FORUM)?.id).toBe(2);
    expect(regions.byForum(WEST_FORUM)?.channelId).toBe(WEST_CHANNEL);
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
    expect(regions.byId(9)).toBeUndefined();
    expect(regions.byChannel(WEST_FORUM)).toBeUndefined();
    expect(regions.byForum(WEST_CHANNEL)).toBeUndefined();
    expect(entries.at(-1)).toMatchObject({ msg: 'regions loaded', regions: 3, forums: 2 });
  });

  it('keeps the last complete state when a later load fails, and takes the next one', async () => {
    let answer: () => Promise<Region[]> = () => Promise.resolve(testRegions());
    const { regions } = directory(() => answer());
    await regions.load();
    answer = () => Promise.reject(new Error('connection lost'));
    await expect(regions.load()).rejects.toThrow('connection lost');
    expect(regions.all()).toHaveLength(3);
    answer = () => Promise.resolve(testRegions().slice(0, 1));
    await regions.load();
    expect(regions.all()).toHaveLength(1);
  });
});
```

Run: `npx vitest run --project unit src/discord/guards.test.ts src/services/region-directory.test.ts`
Expected: FAIL (the module `region-directory.js` cannot be found).

- [ ] **Step 3: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -10,6 +10,7 @@ import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
+import type { RegionProvider } from './services/region-directory.js';
 import type { MapProvider } from './services/static-maps.js';
 
 /** Everything a handler may use. Later phases add services here. */
@@ -26,6 +27,8 @@ export interface AppContext {
   readonly raidEvents: RaidEventProvider;
   /** The gyms, and finding them by what members type. */
   readonly gyms: GymProvider;
+  /** The regions: by id, by text channel and by forum. */
+  readonly regions: RegionProvider;
   /** The raids (later also trains and meetups) that have not ended. */
   readonly parties: PartyProvider;
   /** Pokémon by what members type: names, nicknames, forms. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -26,6 +26,7 @@ import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidEventService } from './services/raid-event-service.js';
+import { RegionDirectory } from './services/region-directory.js';
 import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
 
@@ -82,6 +83,7 @@ export async function startApp(
     ignoredWords: config.settings.blacklistWords,
     log,
   });
+  const regions = new RegionDirectory({ regions: new RegionRepository(db), log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
   const maps = new StaticMaps(
@@ -94,6 +96,7 @@ export async function startApp(
     // Reads the list of the last run from the database; the feed is read after the login.
     await raidBosses.load();
     await gyms.load();
+    await regions.load();
     await parties.load();
     await pokemon.reloadNicknames();
   } catch (err) {
@@ -116,6 +119,7 @@ export async function startApp(
     raidBosses,
     raidEvents,
     gyms,
+    regions,
     parties,
     pokemon,
     maps,
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -50,17 +50,18 @@ export function memberRoleNames(interaction: LocatedInteraction): string[] {
 }
 
 /**
- * The region an interaction happened in, as the id of the region's channel: the channel itself,
- * or the channel a thread belongs to. Undefined anywhere else.
+ * The region an interaction happened in, as the id of the region's text channel: that channel
+ * itself or a thread in it, or the region's forum or a post in it. Undefined anywhere else.
  */
 export function regionChannelOf(
   interaction: LocatedInteraction,
   ctx: AppContext,
 ): string | undefined {
   const { baseChannelId } = channelContext(interaction);
-  return baseChannelId !== undefined && ctx.gyms.isRegion(baseChannelId)
-    ? baseChannelId
-    : undefined;
+  if (baseChannelId === undefined) return undefined;
+  if (ctx.gyms.isRegion(baseChannelId)) return baseChannelId;
+  const ofForum = ctx.regions.byForum(baseChannelId)?.channelId;
+  return ofForum !== undefined && ctx.gyms.isRegion(ofForum) ? ofForum : undefined;
 }
 
 function assertGuild(interaction: LocatedInteraction): void {
```

Create `src/services/region-directory.ts`:

```ts
import type { Region } from '../db/repositories/region-repository.js';
import type { Logger } from '../log.js';

/** The part of `RegionRepository` the directory reads. */
export interface RegionListing {
  listAll(): Promise<Region[]>;
}

/** What handlers need: the regions, from memory. */
export interface RegionProvider {
  /** By row id. */
  byId(id: number): Region | undefined;
  /** By the region's text channel. */
  byChannel(channelId: string): Region | undefined;
  /** By the forum that holds the region's party posts. */
  byForum(forumChannelId: string): Region | undefined;
  /** Every region, oldest first. */
  all(): readonly Region[];
}

/**
 * All regions in memory, read from the database. Call `load` again after a region was added or
 * removed or got its forum (`/admin setup-forums`); reads use the last complete state.
 */
export class RegionDirectory implements RegionProvider {
  private regions: readonly Region[] | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: { regions: RegionListing; log: Logger }) {}

  private get current(): readonly Region[] {
    if (!this.regions) throw new Error('Regions have not been loaded yet');
    return this.regions;
  }

  /** Reads every region. Loads asked for at the same time run one after the other. */
  load(): Promise<void> {
    const result = this.queue.then(async () => {
      this.regions = await this.options.regions.listAll();
      const forums = this.regions.filter((region) => region.forumChannelId !== null).length;
      this.options.log.info({ regions: this.regions.length, forums }, 'regions loaded');
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  byId(id: number): Region | undefined {
    return this.current.find((region) => region.id === id);
  }

  byChannel(channelId: string): Region | undefined {
    return this.current.find((region) => region.channelId === channelId);
  }

  byForum(forumChannelId: string): Region | undefined {
    return this.current.find((region) => region.forumChannelId === forumChannelId);
  }

  all(): readonly Region[] {
    return this.current;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/discord/guards.test.ts src/services/region-directory.test.ts`
Expected: PASS (2 files; `region-directory.test.ts` has 3 tests).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app-context.ts src/app.ts src/discord/guards.test.ts src/discord/guards.ts src/services/region-directory.test.ts src/services/region-directory.ts test/support/providers.ts test/support/test-context.ts
npm run check
git add src/app-context.ts src/app.ts src/discord/guards.test.ts src/discord/guards.ts src/services/region-directory.test.ts src/services/region-directory.ts test/support/providers.ts test/support/test-context.ts
git commit -m "Regions in memory: by id, by channel and by forum" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,110 unit tests.

---

### Task 5: `PartyService`: reporting a raid, posts and summaries kept up to date

**Files:**
- Create: `src/services/coalescer.test.ts`, `src/services/coalescer.ts`, `src/services/party-service.test.ts`, `src/services/party-service.ts`, `test/support/party-service.ts`
- Modify: `src/discord/party-gateway.ts`, `test/support/fake-gateway.ts`

**Interfaces:**
- Consumes: Task 2 (`renderRaidPost`, `shownBoss`, `shownAutoset`, `FORUM_TAGS`, `renderSummary`, `renderRegionLink`, `SUMMARY_TITLE`), Task 3 (`PartyGateway`, `FakePartyGateway`), Task 4 (`RegionProvider`), plan 2B (`PartyStore.addRaidUnlessTaken`, `update`, `createRaid`, `setHatchTime`, `setEndTime`, `applyAutoStatus`, `endParty`, `raidDurationRules`).
- Produces: `PartyGateway.postInfo(postId): Promise<{ title; tagIds } | undefined>`. `Coalescer<K>` (`request(key)`, `flush()`, `stop()`, `pending`). `PartyService` with `reportRaid(report: RaidReport): Promise<ReportOutcome>` (`created` | `exists` with `joined` | `no-region` | `no-forum`), `changed(partyId)`, `summaryChanged(regionId)`, `flush()`, `view(party)`, `rules()`, `ensureSummary(region)`, `endPartiesWithoutPost()`, `forgetTags(forumId)`; `RaidReport { gym; reporterId; anonymous; autoStatus; tier; boss; fastMove?; chargedMove?; time? }`; `SummaryStore { setSummaryMessage }`. Test support: `partyServiceWith(parties?)` giving `{ service, store, storage, gateway, regions, tags, entries, clock }`, `TestRegions`.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -126,6 +126,14 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  postInfo(postId: string) {
+    return this.attempt('postInfo', postId, () => {
+      const post = this.posts.get(postId);
+      if (!post || this.gone.has(postId)) return undefined;
+      return { title: post.title, tagIds: [...post.tagIds] };
+    });
+  }
+
   editPost(postId: string, message: OutgoingMessage) {
     return this.onPost('editPost', postId, (post) => {
       post.message = message;
```

Create `test/support/party-service.ts`:

```ts
import { loadSettings } from '../../src/config/settings.js';
import type { Region } from '../../src/db/repositories/region-repository.js';
import type { Party } from '../../src/domain/party/party.js';
import { FORUM_TAGS } from '../../src/render/raid-post.js';
import { PartyService } from '../../src/services/party-service.js';
import { FakePartyGateway } from './fake-gateway.js';
import { catalogueFixture } from './game-data.js';
import { EAST_FORUM, testRegions, WEST_FORUM } from './gyms.js';
import { MemoryPartyStorage, PARTY_NOW } from './parties.js';
import { gymsFixture } from './providers.js';
import { raidBossesFixture } from './raid-bosses.js';
import { raidEventsFixture } from './raid-events.js';
import { createTestLogger } from './test-logger.js';
import { TEST_SETTINGS_PATH } from './test-settings.js';
import { PartyStore } from '../../src/services/party-store.js';

/** The invented regions as a directory whose rows a test can change; `load` does nothing. */
export class TestRegions {
  rows: Region[] = testRegions();
  readonly summaries: { id: number; forumChannelId: string; messageId: string | null }[] = [];
  byId = (id: number) => this.rows.find((region) => region.id === id);
  byChannel = (channelId: string) => this.rows.find((region) => region.channelId === channelId);
  byForum = (forumId: string) => this.rows.find((region) => region.forumChannelId === forumId);
  all = () => this.rows;
  load = () => Promise.resolve();
  /** What `RegionRepository.setSummaryMessage` does, on the rows above. */
  setSummaryMessage = (id: number, forumChannelId: string, messageId: string | null) => {
    this.summaries.push({ id, forumChannelId, messageId });
    const region = this.rows.find((row) => row.id === id && row.forumChannelId === forumChannelId);
    if (!region) return Promise.resolve(false);
    region.summaryMessageId = messageId;
    return Promise.resolve(true);
  };
}

/**
 * A party service over fakes: the invented gyms and regions (West and East have forums, which
 * exist on the fake gateway with every tag), the fixture bosses and events, a store over memory
 * and a clock a test can move (`clock.now`). Posts are brought up to date only by `flush()`.
 */
export async function partyServiceWith(parties: readonly Party[] = []) {
  const clock = { now: PARTY_NOW };
  const now = () => clock.now;
  const storage = new MemoryPartyStorage(parties);
  const { log, entries } = createTestLogger();
  const store = new PartyStore({ storage, log, now });
  await store.load();
  const gateway = new FakePartyGateway();
  const tags = {
    [WEST_FORUM]: gateway.addForum(WEST_FORUM, FORUM_TAGS, 'west-raids'),
    [EAST_FORUM]: gateway.addForum(EAST_FORUM, FORUM_TAGS, 'east-raids'),
  };
  const regions = new TestRegions();
  const service = new PartyService({
    store,
    gateway,
    regions,
    regionStore: regions,
    gyms: gymsFixture(),
    raidBosses: raidBossesFixture(),
    gameData: { catalogue: catalogueFixture() },
    raidEvents: raidEventsFixture(),
    settings: loadSettings(TEST_SETTINGS_PATH),
    log,
    now,
    // Long enough that nothing runs by itself during a test.
    renderDelayMs: 3_600_000,
  });
  return { service, store, storage, gateway, regions, tags, entries, clock };
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/coalescer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Coalescer } from './coalescer.js';

function gate(): { opened: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

describe('Coalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function make(work: (key: string) => Promise<void> = () => Promise.resolve()) {
    const runs: string[] = [];
    const errors: unknown[] = [];
    const coalescer = new Coalescer<string>({
      delayMs: 2_000,
      work: (key) => {
        runs.push(key);
        return work(key);
      },
      onError: (err) => errors.push(err),
    });
    return { coalescer, runs, errors };
  }

  it('makes one run of many requests within the delay, per key', async () => {
    const { coalescer, runs } = make();
    coalescer.request('a');
    coalescer.request('a');
    coalescer.request('b');
    await vi.advanceTimersByTimeAsync(1_999);
    expect(runs).toEqual([]);
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toEqual(['a', 'b']);
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runs).toEqual(['a', 'b', 'a']);
  });

  it('runs once more after a run during which it was asked for again, never two at once', async () => {
    const first = gate();
    let active = 0;
    let most = 0;
    const { coalescer, runs } = make(async () => {
      active++;
      most = Math.max(most, active);
      if (runs.length === 1) await first.opened;
      active--;
    });
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(2_000);
    coalescer.request('a');
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toEqual(['a']);
    first.open();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runs).toEqual(['a', 'a']);
    expect(most).toBe(1);
  });

  it('hands a failure to onError and carries on', async () => {
    const { coalescer, runs, errors } = make((key) =>
      key === 'bad' ? Promise.reject(new Error('broken')) : Promise.resolve(),
    );
    coalescer.request('bad');
    coalescer.request('good');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(errors).toEqual([new Error('broken')]);
    coalescer.request('bad');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runs).toEqual(['bad', 'good', 'bad']);
  });

  it('flushes what is waiting at once, and what was asked for meanwhile', async () => {
    const { coalescer, runs } = make((key) => {
      if (key === 'a' && runs.length === 1) coalescer.request('c');
      return Promise.resolve();
    });
    coalescer.request('a');
    coalescer.request('b');
    expect(coalescer.pending).toBe(2);
    const flushed = coalescer.flush();
    await vi.advanceTimersByTimeAsync(0);
    await flushed;
    expect(runs).toEqual(['a', 'b', 'c']);
    expect(coalescer.pending).toBe(0);
  });

  it('ignores requests once stopped', async () => {
    const { coalescer, runs } = make();
    coalescer.request('a');
    await coalescer.stop();
    coalescer.request('a');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runs).toEqual(['a']);
  });
});
```

Create `src/services/party-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EAST_FORUM, testGyms, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
import { ALICE, at, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
import { partyServiceWith } from '../../test/support/party-service.js';
import { attendanceLimits, setAttendance } from '../domain/party/attendance.js';
import { setBoss } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { RaidReport } from './party-service.js';

const [library, fountain, , , , , lighthouse, , , trailhead] = testGyms();
const T5 = { level: 'T5', shadow: false } as const;
const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });

function report(extra: Partial<RaidReport> = {}): RaidReport {
  if (!library) throw new Error('no gym');
  return {
    gym: library,
    reporterId: REPORTER,
    anonymous: false,
    autoStatus: PartyStatus.Interested,
    tier: T5,
    boss: null,
    ...extra,
  };
}

describe('PartyService.reportRaid', () => {
  it('stores the raid, creates its post with tags, links it in the region channel and lists it', async () => {
    const { service, store, gateway, tags, regions } = await partyServiceWith();
    regions.rows[0]!.summaryMessageId = (await gateway.createPost(WEST_FORUM, {
      title: 'Active raids',
      message: { content: '' },
      tagIds: [],
    }))!;
    const outcome = await service.reportRaid(report({ time: { hatch: at('2026-10-13T14:30') } }));
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const { party } = outcome;

    const [, post] = gateway.postsIn(WEST_FORUM);
    expect(post).toMatchObject({
      id: party.forumPostId,
      title: 'T5 egg · The Stacks',
      tagIds: [tags[WEST_FORUM].Egg, tags[WEST_FORUM].T5],
    });
    expect(post?.message.embeds?.[0]?.description).toContain('**T5 egg**');
    expect(party).toMatchObject({
      forumChannelId: WEST_FORUM,
      regionId: 1,
      gymId: 1,
      hatchTime: at('2026-10-13T14:30'),
      endTime: at('2026-10-13T15:15'),
    });
    const [link] = gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(
      `New raid: **T5 egg · The Stacks** → <#${party.forumPostId}>`,
    );
    expect(party.regionLinkMessageId).toBe(link?.id);
    expect(store.get(party.id)).toBe(party);

    await service.flush();
    expect(gateway.posts.get(regions.rows[0]!.summaryMessageId)?.message.content).toContain(
      `<#${party.forumPostId}> · hatches`,
    );
  });

  it('takes an end time for a raid seen hatched, and the reporter as its first attendee', async () => {
    const { service } = await partyServiceWith();
    const outcome = await service.reportRaid(
      report({
        boss: { key: 'yveltal' },
        time: { end: at('2026-10-13T14:40') },
        autoStatus: PartyStatus.Coming,
      }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    expect(outcome.party).toMatchObject({
      hatchTime: at('2026-10-13T13:55'),
      endTime: at('2026-10-13T14:40'),
      raid: { boss: { key: 'yveltal' }, reportedHatched: true },
      attendees: { [REPORTER]: { status: PartyStatus.Coming } },
    });
  });

  it('puts a raid in the forum of the region its gym lies in', async () => {
    const { service, gateway } = await partyServiceWith();
    const outcome = await service.reportRaid(report({ gym: lighthouse! }));
    expect(outcome).toMatchObject({
      kind: 'created',
      party: { regionId: 2, forumChannelId: EAST_FORUM },
    });
    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(1);
  });

  it('signs the reporter up for the raid the gym already has, without a second post', async () => {
    const { service, gateway, store } = await partyServiceWith();
    const first = await service.reportRaid(report());
    const again = await service.reportRaid(
      report({ reporterId: ALICE, autoStatus: PartyStatus.Coming }),
    );
    if (first.kind !== 'created' || again.kind !== 'exists') throw new Error('unexpected');
    expect(again.joined).toBe(true);
    expect(again.party.id).toBe(first.party.id);
    expect(store.get(first.party.id)?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
    });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    // Somebody who is signed up already stays exactly as they are.
    const third = await service.reportRaid(
      report({ reporterId: ALICE, autoStatus: PartyStatus.Interested }),
    );
    expect(third).toMatchObject({ kind: 'exists', joined: false });
    expect(store.get(first.party.id)?.attendees[ALICE]).toMatchObject({
      status: PartyStatus.Coming,
    });
  });

  it('makes one raid of two reports of a gym at the same moment', async () => {
    const { service, gateway } = await partyServiceWith();
    const outcomes = await Promise.all([
      service.reportRaid(report()),
      service.reportRaid(report({ reporterId: ALICE })),
    ]);
    expect(outcomes.map((outcome) => outcome.kind).sort()).toEqual(['created', 'exists']);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('allows an elite raid beside a standard one at the same gym', async () => {
    const { service, gateway } = await partyServiceWith();
    await service.reportRaid(report());
    const elite = await service.reportRaid(report({ tier: { level: 'Elite', shadow: false } }));
    expect(elite.kind).toBe('created');
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('says so when the gym lies in no region, or its region has no forum', async () => {
    const { service, regions, storage } = await partyServiceWith();
    await expect(service.reportRaid(report({ gym: trailhead! }))).resolves.toEqual({
      kind: 'no-region',
    });
    regions.rows[0]!.forumChannelId = null;
    await expect(service.reportRaid(report({ gym: fountain! }))).resolves.toMatchObject({
      kind: 'no-forum',
      region: { id: 1 },
    });
    expect(storage.writes).toEqual([]);
  });

  it('ends the raid again when its post cannot be created, so that the gym is free', async () => {
    const { service, store, gateway, entries } = await partyServiceWith();
    gateway.failing.set('createPost', new Error('Missing Permissions'));
    await expect(service.reportRaid(report())).rejects.toThrow('Missing Permissions');
    expect(store.active()).toEqual([]);
    gateway.failing.clear();
    await expect(service.reportRaid(report())).resolves.toMatchObject({ kind: 'created' });
    expect(entries.filter((entry) => Number(entry.level) >= 50)).toEqual([]);
  });

  it('treats a forum that was deleted by hand as no forum', async () => {
    const { service, store, gateway } = await partyServiceWith();
    gateway.gone.add(WEST_FORUM);
    await expect(service.reportRaid(report())).resolves.toMatchObject({ kind: 'no-forum' });
    expect(store.active()).toEqual([]);
  });

  it('keeps the raid when only the link line fails', async () => {
    const { service, gateway, entries } = await partyServiceWith();
    gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    const outcome = await service.reportRaid(report());
    expect(outcome).toMatchObject({ kind: 'created', party: { regionLinkMessageId: null } });
    expect(entries.some((entry) => entry.msg === 'could not post the link to a new raid')).toBe(
      true,
    );
  });
});

describe('PartyService: keeping posts up to date', () => {
  async function withRaid() {
    const made = await partyServiceWith();
    const outcome = await made.service.reportRaid(
      report({ time: { hatch: at('2026-10-13T14:30') } }),
    );
    if (outcome.kind !== 'created') throw new Error(outcome.kind);
    const postId = outcome.party.forumPostId ?? '';
    return { ...made, party: outcome.party, postId };
  }

  it('makes one edit of many changes', async () => {
    const { service, store, gateway, party, postId } = await withRaid();
    for (const member of [ALICE, '200000000000000003', '200000000000000004']) {
      await store.update(party.id, (p) => setAttendance(p, member, PartyStatus.Coming, {}, limits));
      service.changed(party.id);
    }
    expect(gateway.posts.get(postId)?.edits).toBe(0);
    await service.flush();
    const post = gateway.posts.get(postId);
    expect(post?.edits).toBe(1);
    expect(post?.message.embeds?.[0]?.fields?.map((field) => field.name)).toContain('Trainers (4)');
    // Title and tags did not change, so neither was touched.
    expect(post).toMatchObject({ renames: 0, retags: 0 });
  });

  it('renames the post and changes its tags when the raid hatches and gets its boss', async () => {
    const { service, store, gateway, party, postId, tags, clock } = await withRaid();
    clock.now = at('2026-10-13T14:31');
    await store.update(party.id, (p) =>
      setBoss(p, { tier: T5, boss: { key: 'yveltal' } }, service.rules(), clock.now),
    );
    service.changed(party.id);
    await service.flush();
    expect(gateway.posts.get(postId)).toMatchObject({
      title: 'Yveltal · The Stacks',
      tagIds: [tags[WEST_FORUM].Hatched, tags[WEST_FORUM].T5],
      renames: 1,
      retags: 1,
    });
  });

  it('renames a post at most twice in ten minutes; the latest title is applied later', async () => {
    const { service, store, gateway, party, postId, clock } = await withRaid();
    const name = async (key: string) => {
      await store.update(party.id, (p) =>
        setBoss(p, { tier: T5, boss: { key } }, service.rules(), clock.now),
      );
      service.changed(party.id);
      await service.flush();
    };
    await name('yveltal');
    await name('xerneas');
    await name('mewtwo');
    expect(gateway.posts.get(postId)).toMatchObject({ title: 'Xerneas · The Stacks', renames: 2 });
    clock.now += 10 * MINUTE;
    service.changed(party.id);
    await service.flush();
    expect(gateway.posts.get(postId)).toMatchObject({ title: 'Mewtwo · The Stacks', renames: 3 });
  });

  it('ends a party whose post somebody deleted', async () => {
    const { service, store, gateway, party, postId, entries } = await withRaid();
    gateway.gone.add(postId);
    service.changed(party.id);
    await service.flush();
    expect(store.get(party.id)).toBeUndefined();
    expect(entries.some((entry) => entry.msg === 'a party post is gone; ending the party')).toBe(
      true,
    );
  });

  it('logs a failed edit and tries again with the next change', async () => {
    const { service, gateway, party, postId, entries } = await withRaid();
    gateway.failing.set('editPost', new Error('500'));
    service.changed(party.id);
    await service.flush();
    expect(entries.some((entry) => entry.msg === 'could not update a party post')).toBe(true);
    gateway.failing.clear();
    service.changed(party.id);
    await service.flush();
    expect(gateway.posts.get(postId)?.edits).toBe(1);
  });

  it('does nothing for a party that has ended or has no post', async () => {
    const { service, gateway } = await partyServiceWith([testRaid()]);
    service.changed(testRaid().id);
    service.changed('00000000-0000-4000-8000-000000000099');
    await service.flush();
    expect(gateway.calls).toEqual([]);
  });
});

describe('PartyService: the summary and tidying up', () => {
  it('creates the pinned summary post once and records it for its forum', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    const [summary] = gateway.postsIn(WEST_FORUM);
    expect(summary).toMatchObject({ title: 'Active raids', pinned: true, tagIds: [] });
    expect(summary?.message.content).toBe('No raids right now. Report one with `/raid`.');
    expect(regions.summaries).toEqual([
      { id: 1, forumChannelId: WEST_FORUM, messageId: summary?.id },
    ]);
    await expect(service.ensureSummary(west)).resolves.toBe(false);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
  });

  it('makes a new summary post when the old one was deleted', async () => {
    const { service, gateway, regions } = await partyServiceWith();
    const west = regions.rows[0]!;
    await service.ensureSummary(west);
    gateway.gone.add(west.summaryMessageId ?? '');
    await expect(service.ensureSummary(west)).resolves.toBe(true);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(2);
  });

  it('refuses a region without a forum', async () => {
    const { service, regions } = await partyServiceWith();
    await expect(service.ensureSummary(regions.rows[2]!)).rejects.toThrow('has no forum');
  });

  it('ends active parties that have no post, as a stop half-way through a report leaves them', async () => {
    const orphan = testRaid();
    const posted = {
      ...testRaid({ id: '00000000-0000-4000-8000-000000000002', gymId: 2 }),
      forumPostId: '300000000000000001',
    };
    const { service, store, entries } = await partyServiceWith([orphan, posted]);
    await expect(service.endPartiesWithoutPost()).resolves.toBe(1);
    expect(store.active().map((party) => party.id)).toEqual([posted.id]);
    expect(entries.some((entry) => entry.msg === 'ended raids that had no post')).toBe(true);
    await expect(service.endPartiesWithoutPost()).resolves.toBe(0);
  });
});
```

Run: `npx vitest run --project unit src/services/coalescer.test.ts src/services/party-service.test.ts`
Expected: FAIL (the modules `coalescer.js` and `party-service.js` cannot be found).

- [ ] **Step 3: The implementation**

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -48,6 +48,8 @@ export interface PartyGateway {
   ensureTags(forumId: string, tagNames: readonly string[]): Promise<TagIds | undefined>;
   /** Creates a post and gives its id (the id of the thread). Undefined when the forum is gone. */
   createPost(forumId: string, post: NewPost): Promise<string | undefined>;
+  /** The post's title and applied tags as Discord has them. Undefined when it is gone. */
+  postInfo(postId: string): Promise<{ title: string; tagIds: string[] } | undefined>;
   /** Replaces the post's first message. */
   editPost(postId: string, message: OutgoingMessage): Promise<boolean>;
   renamePost(postId: string, title: string): Promise<boolean>;
@@ -170,6 +172,11 @@ export class DiscordPartyGateway implements PartyGateway {
     return thread.id;
   }
 
+  async postInfo(postId: string): Promise<{ title: string; tagIds: string[] } | undefined> {
+    const post = await this.post(postId);
+    return post ? { title: post.name, tagIds: [...post.appliedTags] } : undefined;
+  }
+
   async editPost(postId: string, message: OutgoingMessage): Promise<boolean> {
     const post = await this.post(postId);
     if (!post) return false;
```

Create `src/services/coalescer.ts`:

```ts
/**
 * Runs work per key at most once per `delayMs`, however often it is asked for: the first
 * request starts the wait, later ones during the wait are part of the same run, and a request
 * made while the work is running leads to one more run after it. Work for one key never
 * overlaps itself. Failures go to `onError`; they never stop later runs.
 *
 * This is what keeps the edits of a post few: many changes in two seconds are one edit.
 */
export class Coalescer<K> {
  private readonly waiting = new Map<K, NodeJS.Timeout>();
  private readonly running = new Map<K, Promise<void>>();
  private readonly again = new Set<K>();
  private stopped = false;

  constructor(
    private readonly options: {
      delayMs: number;
      work: (key: K) => Promise<void>;
      onError: (err: unknown, key: K) => void;
    },
  ) {}

  /** Asks for a run for this key. Returns at once. */
  request(key: K): void {
    if (this.stopped) return;
    if (this.running.has(key)) {
      this.again.add(key);
      return;
    }
    if (this.waiting.has(key)) return;
    const timer = setTimeout(() => {
      this.waiting.delete(key);
      this.start(key);
    }, this.options.delayMs);
    timer.unref();
    this.waiting.set(key, timer);
  }

  private start(key: K): void {
    const run = this.options
      .work(key)
      .catch((err: unknown) => {
        this.options.onError(err, key);
      })
      .finally(() => {
        this.running.delete(key);
        if (this.again.delete(key)) this.request(key);
      });
    this.running.set(key, run);
  }

  /**
   * Runs everything that is waiting now and resolves once nothing is waiting or running any
   * more, including runs asked for meanwhile. For shutdown and for tests.
   */
  async flush(): Promise<void> {
    for (;;) {
      for (const [key, timer] of [...this.waiting]) {
        clearTimeout(timer);
        this.waiting.delete(key);
        this.start(key);
      }
      if (this.running.size === 0) return;
      await Promise.all(this.running.values());
    }
  }

  /** Flushes, then ignores every later request. */
  async stop(): Promise<void> {
    await this.flush();
    this.stopped = true;
  }

  /** Keys with a run waiting or going on. */
  get pending(): number {
    return new Set([...this.waiting.keys(), ...this.running.keys()]).size;
  }
}
```

Create `src/services/party-service.ts`:

```ts
import type { Settings } from '../config/settings.js';
import type { Gym } from '../db/repositories/gym-repository.js';
import type { Region } from '../db/repositories/region-repository.js';
import type { PartyGateway, TagIds } from '../discord/party-gateway.js';
import { applyAutoStatus } from '../domain/party/attendance.js';
import type { RaidBossRef, RaidParty } from '../domain/party/party.js';
import { createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
import type { PartyStatus } from '../domain/party/status.js';
import { endParty } from '../domain/party/tick.js';
import type { RaidTier } from '../domain/pogo/raid-tier.js';
import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
import type { Logger } from '../log.js';
import {
  FORUM_TAGS,
  renderRaidPost,
  shownAutoset,
  shownBoss,
  type RaidPostView,
  type RenderedPost,
} from '../render/raid-post.js';
import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
import { Coalescer } from './coalescer.js';
import type { GameDataProvider } from './game-data-service.js';
import type { PartyStore } from './party-store.js';
import type { RaidBossProvider } from './raid-boss-service.js';
import type { RaidEventProvider } from './raid-event-service.js';
import type { RegionProvider } from './region-directory.js';

const MINUTE = 60_000;
/** Discord lets a thread be renamed twice in ten minutes. */
const RENAMES = 2;
const RENAME_WINDOW_MS = 10 * MINUTE;

export interface RaidReport {
  gym: Gym;
  /** Snowflake of the reporter. */
  reporterId: string;
  anonymous: boolean;
  /** The reporter's automatic status (`User.status`). */
  autoStatus: PartyStatus;
  tier: RaidTier;
  /** Null for an egg; a boss means the raid was seen hatched. */
  boss: RaidBossRef | null;
  fastMove?: string | null;
  chargedMove?: string | null;
  /** A time the caller has checked (`resolvePartyTime`): when the egg hatches, or the raid ends. */
  time?: { hatch: number } | { end: number };
}

export type ReportOutcome =
  /** A new raid with its post. */
  | { kind: 'created'; party: RaidParty }
  /** The gym has such a raid already; `joined` says whether the reporter was signed up for it. */
  | { kind: 'exists'; party: RaidParty; joined: boolean }
  /** The gym lies in no region of this server. */
  | { kind: 'no-region' }
  /** The gym's region has no forum yet (`/admin setup-forums`). */
  | { kind: 'no-forum'; region: Region };

/** What the party service needs of the region table. */
export interface SummaryStore {
  setSummaryMessage(id: number, forumChannelId: string, messageId: string | null): Promise<boolean>;
}

export interface PartyServiceOptions {
  store: PartyStore;
  gateway: PartyGateway;
  regions: RegionProvider & { load(): Promise<void> };
  regionStore: SummaryStore;
  gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
  raidBosses: RaidBossProvider;
  gameData: GameDataProvider;
  raidEvents: RaidEventProvider;
  settings: Settings;
  log: Logger;
  now?: () => number;
  /** How long changes of one post are gathered into one edit. Default two seconds. */
  renderDelayMs?: number;
}

/**
 * Parties on Discord: creates the forum post of a reported raid, keeps posts and the pinned
 * summary of each forum up to date, and tidies up what went wrong half-way. The parties
 * themselves are in the store; this service is what talks to Discord about them.
 */
export class PartyService {
  private readonly now: () => number;
  private readonly posts: Coalescer<string>;
  private readonly summaries: Coalescer<number>;
  private readonly tags = new Map<string, TagIds>();
  private readonly renames = new Map<string, number[]>();

  constructor(private readonly options: PartyServiceOptions) {
    this.now = options.now ?? (() => Date.now());
    const delayMs = options.renderDelayMs ?? 2_000;
    this.posts = new Coalescer({
      delayMs,
      work: (partyId) => this.renderPost(partyId),
      onError: (err, party) => options.log.error({ err, party }, 'could not update a party post'),
    });
    this.summaries = new Coalescer({
      delayMs,
      work: (regionId) => this.renderSummary(regionId),
      onError: (err, region) => options.log.error({ err, region }, 'could not update a summary'),
    });
  }

  /** The durations in effect, with the events known at this moment. */
  rules(): RaidDurationRules {
    return raidDurationRules(this.options.settings, this.options.raidEvents.events());
  }

  /** Everything the renderer needs to show a raid as it is now. */
  view(party: RaidParty): RaidPostView {
    const { gateway, gyms, raidBosses, gameData, settings } = this.options;
    const catalogue = gameData.catalogue;
    const boss = shownBoss(party, catalogue, raidBosses.bosses());
    const hatchesAs = boss
      ? undefined
      : shownAutoset(party.raid.tier, raidBosses.autoset(party.raid.tier));
    const where = party.forumChannelId;
    const emoji = (name: string, fallback: string): string =>
      (where === null ? undefined : gateway.emoji(where, name)) ?? fallback;
    return {
      party,
      now: this.now(),
      gym: party.gymId === null ? undefined : gyms.get(party.gymId),
      boss,
      ...(hatchesAs ? { hatchesAs } : {}),
      catalogue,
      showUnknownMoves: settings.showUnknownMoves,
      emoji: {
        shiny: emoji(settings.emoji.shiny, '✨'),
        remote: emoji(settings.emoji.remote, '🛰️'),
      },
    };
  }

  /** The region whose forum takes a raid at this gym: the first of the gym's regions that has one. */
  private regionFor(gym: Gym): { region?: Region; any?: Region } {
    const regions = this.options.gyms
      .regionsOf(gym.id)
      .map((channelId) => this.options.regions.byChannel(channelId))
      .filter((region): region is Region => region !== undefined);
    const region = regions.find((candidate) => candidate.forumChannelId !== null);
    return { ...(region ? { region } : {}), ...(regions[0] ? { any: regions[0] } : {}) };
  }

  private async tagIds(forumId: string): Promise<TagIds> {
    let ids = this.tags.get(forumId);
    if (!ids) {
      ids = (await this.options.gateway.ensureTags(forumId, FORUM_TAGS)) ?? {};
      this.tags.set(forumId, ids);
    }
    return ids;
  }

  private static applied(post: RenderedPost, ids: TagIds): string[] {
    return post.tags.map((tag) => ids[tag]).filter((id): id is string => id !== undefined);
  }

  /**
   * Stores a reported raid and creates its post. When the gym already has such a raid, the
   * reporter is signed up for that one with their automatic status, unless they already are.
   */
  async reportRaid(report: RaidReport): Promise<ReportOutcome> {
    const { store, gateway, log } = this.options;
    const { gym } = report;
    const { region, any } = this.regionFor(gym);
    if (!region?.forumChannelId)
      return any ? { kind: 'no-forum', region: any } : { kind: 'no-region' };
    if (region.guildId === null) return { kind: 'no-region' };
    const forumId = region.forumChannelId;

    const now = this.now();
    const rules = this.rules();
    let raid = createRaid(
      {
        id: crypto.randomUUID(),
        guildId: region.guildId,
        regionId: region.id,
        gymId: gym.id,
        createdById: report.reporterId,
        anonymous: report.anonymous,
        autoStatus: report.autoStatus,
        tier: report.tier,
        boss: report.boss,
        fastMove: report.fastMove ?? null,
        chargedMove: report.chargedMove ?? null,
        now,
      },
      rules,
    );
    if (report.time && 'hatch' in report.time)
      raid = setHatchTime(raid, report.time.hatch, rules, now);
    else if (report.time) raid = setEndTime(raid, report.time.end, rules, now);

    const stored = await store.addRaidUnlessTaken(raid, now);
    if (!stored.added) {
      const signedUp = await store.update(stored.existing.id, (party) =>
        applyAutoStatus(party, report.reporterId, report.autoStatus),
      );
      if (signedUp?.written) this.changed(stored.existing.id);
      return {
        kind: 'exists',
        party: signedUp?.party ?? stored.existing,
        joined: signedUp?.joined ?? false,
      };
    }

    // The row exists; from here on a failure must not leave an active raid without a post.
    let postId: string | undefined;
    const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
    try {
      const ids = await this.tagIds(forumId);
      postId = await gateway.createPost(forumId, {
        title: rendered.title,
        message: { embeds: [rendered.embed] },
        tagIds: PartyService.applied(rendered, ids),
      });
    } catch (err) {
      await this.abandon(raid.id);
      throw err;
    }
    if (postId === undefined) {
      // The forum was deleted by hand: the region has none any more as far as reports go.
      this.tags.delete(forumId);
      await this.abandon(raid.id);
      return { kind: 'no-forum', region };
    }
    const post = postId;
    const posted = await store.update(raid.id, (party) => ({
      party: { ...party, forumChannelId: forumId, forumPostId: post },
    }));
    let party = posted?.party ?? raid;

    try {
      const linkId = await gateway.sendMessage(region.channelId, {
        content: renderRegionLink(rendered.title, post),
      });
      if (linkId !== undefined) {
        const linked = await store.update(raid.id, (current) => ({
          party: { ...current, regionLinkMessageId: linkId },
        }));
        party = linked?.party ?? party;
      }
    } catch (err) {
      log.warn({ err, party: raid.id }, 'could not post the link to a new raid');
    }
    this.summaries.request(region.id);
    return { kind: 'created', party };
  }

  /** Ends a raid whose post could not be made, so that it does not block its gym. */
  private async abandon(partyId: string): Promise<void> {
    try {
      await this.options.store.update(partyId, (party) => ({ party: endParty(party) }));
    } catch (err) {
      this.options.log.error({ err, party: partyId }, 'could not end a raid without a post');
    }
  }

  /**
   * Ends every active party that has no post: what a stop between storing a raid and creating
   * its post leaves behind. Call once at start, before anything else uses the store.
   */
  async endPartiesWithoutPost(): Promise<number> {
    const orphans = this.options.store.active().filter((party) => party.forumPostId === null);
    for (const party of orphans) await this.abandon(party.id);
    if (orphans.length > 0) {
      this.options.log.warn({ parties: orphans.map((p) => p.id) }, 'ended raids that had no post');
    }
    return orphans.length;
  }

  /** A party changed: its post and its region's summary are brought up to date shortly. */
  changed(partyId: string): void {
    this.posts.request(partyId);
    const regionId = this.options.store.get(partyId)?.regionId;
    if (regionId !== null && regionId !== undefined) this.summaries.request(regionId);
  }

  /** The summary of a region is brought up to date shortly. */
  summaryChanged(regionId: number): void {
    this.summaries.request(regionId);
  }

  /** Does everything that is waiting now. For shutdown and for tests. */
  async flush(): Promise<void> {
    await this.posts.flush();
    await this.summaries.flush();
  }

  private mayRename(postId: string): boolean {
    const now = this.now();
    const recent = (this.renames.get(postId) ?? []).filter((at) => now - at < RENAME_WINDOW_MS);
    this.renames.set(postId, recent);
    return recent.length < RENAMES;
  }

  private async renderPost(partyId: string): Promise<void> {
    const { store, gateway, log } = this.options;
    const party = store.get(partyId);
    if (!party?.forumPostId) return;
    const postId = party.forumPostId;
    const rendered = renderRaidPost(this.view(party));

    const edited = await gateway.editPost(postId, { embeds: [rendered.embed] });
    const info = edited ? await gateway.postInfo(postId) : undefined;
    if (!info) {
      // Somebody deleted the post: the party is over (spec 7).
      log.warn({ party: partyId, post: postId }, 'a party post is gone; ending the party');
      await this.abandon(partyId);
      if (party.regionId !== null) this.summaries.request(party.regionId);
      return;
    }
    if (info.title !== rendered.title) {
      if (this.mayRename(postId)) {
        this.renames.get(postId)?.push(this.now());
        await gateway.renamePost(postId, rendered.title);
      } else {
        // The latest title wins: it is tried again with the next change of the post.
        log.debug({ party: partyId }, 'renamed too often; the title waits');
      }
    }
    if (party.forumChannelId !== null) {
      const wanted = PartyService.applied(rendered, await this.tagIds(party.forumChannelId));
      const same =
        wanted.length === info.tagIds.length && wanted.every((id) => info.tagIds.includes(id));
      if (!same) await gateway.setPostTags(postId, wanted);
    }
  }

  private summaryText(regionId: number): string {
    const now = this.now();
    const raids = this.options.store.inRegion(regionId).map((party) => ({
      party,
      title: renderRaidPost(this.view(party)).title,
    }));
    return renderSummary(raids, now);
  }

  private async renderSummary(regionId: number): Promise<void> {
    const region = this.options.regions.byId(regionId);
    if (!region?.forumChannelId || !region.summaryMessageId) return;
    const edited = await this.options.gateway.editPost(region.summaryMessageId, {
      content: this.summaryText(regionId),
    });
    if (!edited) {
      this.options.log.warn(
        { region: regionId },
        'the summary post is gone; run /admin setup-forums',
      );
    }
  }

  /**
   * Makes sure the region's forum has its pinned summary post. Returns whether one was created.
   * The region must have a forum.
   */
  async ensureSummary(region: Region): Promise<boolean> {
    const { gateway, regionStore, regions } = this.options;
    const forumId = region.forumChannelId;
    if (forumId === null) throw new Error(`Region ${region.id} has no forum`);
    if (region.summaryMessageId !== null && (await gateway.postInfo(region.summaryMessageId))) {
      this.summaries.request(region.id);
      return false;
    }
    const postId = await gateway.createPost(forumId, {
      title: SUMMARY_TITLE,
      message: { content: this.summaryText(region.id) },
      tagIds: [],
    });
    if (postId === undefined) throw new Error(`The forum of region ${region.id} is gone`);
    await gateway.pinPost(postId);
    await regionStore.setSummaryMessage(region.id, forumId, postId);
    await regions.load();
    return true;
  }

  /** Forgets what is remembered about a forum's tags (after `/admin setup-forums` changed them). */
  forgetTags(forumId: string): void {
    this.tags.delete(forumId);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/services/coalescer.test.ts src/services/party-service.test.ts`
Expected: PASS (2 files, 25 tests).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/discord/party-gateway.ts src/services/coalescer.test.ts src/services/coalescer.ts src/services/party-service.test.ts src/services/party-service.ts test/support/fake-gateway.ts test/support/party-service.ts
npm run check
git add src/discord/party-gateway.ts src/services/coalescer.test.ts src/services/coalescer.ts src/services/party-service.test.ts src/services/party-service.ts test/support/fake-gateway.ts test/support/party-service.ts
git commit -m "Party service: a reported raid gets its post; posts and summaries follow changes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,135 unit tests.

---

### Task 6: `/admin setup-forums`, and the party service in the context

**Files:**
- Create: `src/commands/admin/index.ts`, `src/commands/admin/setup-forums.test.ts`, `src/commands/admin/setup-forums.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/index.ts`, `src/discord/party-gateway.ts`, `src/services/party-service.ts`, `test/support/fake-gateway.ts`, `test/support/party-service.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Task 5 (`PartyService`, `partyServiceWith`, `TestRegions`), Task 3 (the gateway), `commandGroup`, `requireBotManagement`, `RegionRepository.setForum`.
- Produces: `PartyGateway.guildOf(channelId)`; `DiscordPartyGateway` is now constructed without a client and given one with `use(client)`. `SummaryStore.setForum`; `ForumSetup { region; forum: 'created' | 'ready' | 'no-channel'; summary }`; `PartyService.setupForums(guildId): Promise<ForumSetup[]>`. The command `admin` (`src/commands/admin/index.ts`, with its `parts` list for later plans) and the part `setupForums`. `ctx.partyService`. In `createTestContext` the party service is a stand-in that throws when used: tests pass `{ partyService, parties, regions }` from `partyServiceWith()`.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -44,6 +44,9 @@ export class FakePartyGateway implements PartyGateway {
   readonly calls: string[] = [];
   readonly channelNames = new Map<string, string>();
   readonly emojis = new Map<string, string>();
+  readonly channelGuilds = new Map<string, string>();
+  /** The server of every channel not named in `channelGuilds` (the fakes' `FAKE_GUILD_ID`). */
+  guildId = '412345678901234567';
   private next = 1;
 
   private id(): string {
@@ -180,6 +183,11 @@ export class FakePartyGateway implements PartyGateway {
     return this.channelNames.get(channelId);
   }
 
+  /** Every channel is in `guildId` unless `channelGuilds` says otherwise. */
+  guildOf(channelId: string): string | undefined {
+    return this.channelGuilds.get(channelId) ?? this.guildId;
+  }
+
   emoji(_channelId: string, name: string): string | undefined {
     return this.emojis.get(name);
   }
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -23,6 +23,20 @@ export class TestRegions {
   byForum = (forumId: string) => this.rows.find((region) => region.forumChannelId === forumId);
   all = () => this.rows;
   load = () => Promise.resolve();
+  /** What `RegionRepository.setForum` does, on the rows above. */
+  setForum = (id: number, forumChannelId: string | null) => {
+    const region = this.rows.find((row) => row.id === id);
+    if (!region) return Promise.resolve('no-region' as const);
+    if (
+      forumChannelId !== null &&
+      this.rows.some((row) => row.id !== id && row.forumChannelId === forumChannelId)
+    ) {
+      return Promise.resolve('forum-taken' as const);
+    }
+    if (region.forumChannelId !== forumChannelId) region.summaryMessageId = null;
+    region.forumChannelId = forumChannelId;
+    return Promise.resolve('set' as const);
+  };
   /** What `RegionRepository.setSummaryMessage` does, on the rows above. */
   setSummaryMessage = (id: number, forumChannelId: string, messageId: string | null) => {
     this.summaries.push({ id, forumChannelId, messageId });
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -3,6 +3,7 @@ import type { AppContext } from '../../src/app-context.js';
 import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
 import type { DB } from '../../src/db/types.js';
+import type { PartyService } from '../../src/services/party-service.js';
 import { catalogueFixture } from './game-data.js';
 import { noParties } from './parties.js';
 import { gymsFixture, mapsFixture, pokemonFixture, regionsFixture } from './providers.js';
@@ -14,6 +15,15 @@ import { TEST_ENV } from './test-env.js';
 
 export { TEST_SETTINGS_PATH };
 
+/** For a part of the context most tests do not need: using it says how to provide it. */
+function unavailable<T extends object>(name: string, hint: string): T {
+  return new Proxy({} as T, {
+    get() {
+      throw new Error(`This test context has no ${name}; ${hint}`);
+    },
+  });
+}
+
 /** An AppContext with real settings, the test env, a capturing logger and no database. */
 export function createTestContext(overrides: Partial<AppContext> = {}) {
   const { log, entries } = createTestLogger();
@@ -29,6 +39,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     gyms: gymsFixture(),
     regions: regionsFixture(),
     parties: noParties(),
+    partyService: unavailable<PartyService>(
+      'partyService',
+      'pass { partyService, parties, regions } from partyServiceWith()',
+    ),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
     maps: mapsFixture(),
```

- [ ] **Step 2: Write the failing tests**

Create `src/commands/admin/setup-forums.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  EAST_FORUM,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { FORUM_TAGS } from '../../render/raid-post.js';
import { admin } from './index.js';

async function setup() {
  const made = await partyServiceWith();
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [admin], []);
  const run = async (roleNames: string[] = ['Admin']) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'setup-forums',
      roleNames,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, run };
}

describe('/admin setup-forums', () => {
  it('gives every region its forum, tags and pinned summary, and says what it did', async () => {
    const { run, gateway, regions } = await setup();
    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
    const interaction = await run();

    const north = regions.byChannel(UNBOUNDED_CHANNEL);
    expect(north?.forumChannelId).toEqual(expect.any(String));
    const created = gateway.forums.get(north?.forumChannelId ?? '');
    expect(created).toMatchObject({ name: 'north-raids', regionChannelId: UNBOUNDED_CHANNEL });
    expect(Object.keys(created?.tags ?? {})).toEqual([...FORUM_TAGS]);
    for (const region of regions.all()) {
      const summary = gateway.posts.get(region.summaryMessageId ?? '');
      expect(summary).toMatchObject({
        title: 'Active raids',
        pinned: true,
        forumId: region.forumChannelId,
      });
    }
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(sent(interaction.editReply).content?.split('\n')).toEqual([
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted and pinned the list of active raids.`,
      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, posted and pinned the list of active raids.`,
      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, posted and pinned the list of active raids.`,
    ]);
  });

  it('changes nothing when run again', async () => {
    const { run, gateway } = await setup();
    await run();
    const forums = gateway.forums.size;
    const posts = gateway.posts.size;
    const again = await run();
    expect(gateway.forums.size).toBe(forums);
    expect(gateway.posts.size).toBe(posts);
    expect(sent(again.editReply).content).toContain(
      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready.`,
    );
  });

  it('adds the tags an older forum lacks', async () => {
    const { run, gateway } = await setup();
    const west = gateway.forums.get(WEST_FORUM);
    if (west) west.tags = { Egg: '1' };
    await run();
    expect(Object.keys(gateway.forums.get(WEST_FORUM)?.tags ?? {}).sort()).toEqual(
      [...FORUM_TAGS].sort(),
    );
    expect(gateway.forums.get(WEST_FORUM)?.tags.Egg).toBe('1');
  });

  it('makes a new forum for a region whose forum was deleted', async () => {
    const { run, gateway, regions } = await setup();
    gateway.gone.add(WEST_FORUM);
    const interaction = await run();
    const west = regions.byChannel(WEST_CHANNEL);
    expect(west?.forumChannelId).not.toBe(WEST_FORUM);
    expect(sent(interaction.editReply).content).toContain(
      `<#${WEST_CHANNEL}>: created <#${west?.forumChannelId}>`,
    );
  });

  it('says so for a region whose channel is gone, and carries on with the others', async () => {
    const { run, gateway, regions } = await setup();
    gateway.gone.add(UNBOUNDED_CHANNEL);
    const interaction = await run();
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
    expect(sent(interaction.editReply).content).toContain(
      `Region channel ${UNBOUNDED_CHANNEL}: I cannot see it any more, so it has no forum.`,
    );
    expect(sent(interaction.editReply).content).toContain(`<#${EAST_CHANNEL}>`);
  });

  it('leaves the regions of other servers alone', async () => {
    const { run, gateway, regions } = await setup();
    gateway.channelGuilds.set(UNBOUNDED_CHANNEL, '999999999999999999');
    await run();
    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
  });

  it('is for staff only', async () => {
    const { run, gateway } = await setup();
    const interaction = await run(['Member']);
    expect(sent(interaction.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(gateway.calls).toEqual([]);
  });

  it('is offered only to members who may manage the server', () => {
    expect(admin.data.toJSON().default_member_permissions).toBe('32');
  });
});
```

Run: `npx vitest run --project unit src/commands/admin/setup-forums.test.ts`
Expected: FAIL (the module `./index.js` of `src/commands/admin` cannot be found).

- [ ] **Step 3: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -6,6 +6,7 @@ import type { IntentFlags } from './discord/intents.js';
 import type { Logger } from './log.js';
 import type { GameDataProvider } from './services/game-data-service.js';
 import type { GymProvider } from './services/gym-directory.js';
+import type { PartyService } from './services/party-service.js';
 import type { PartyProvider } from './services/party-store.js';
 import type { PokemonFinder } from './services/pokemon-search-service.js';
 import type { RaidBossProvider } from './services/raid-boss-service.js';
@@ -31,6 +32,8 @@ export interface AppContext {
   readonly regions: RegionProvider;
   /** The raids (later also trains and meetups) that have not ended. */
   readonly parties: PartyProvider;
+  /** Parties on Discord: reporting a raid, keeping posts and summaries up to date. */
+  readonly partyService: PartyService;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -16,12 +16,14 @@ import type { DB } from './db/types.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { enabledCommands } from './discord/command.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
+import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
 import { createLogger, type Logger } from './log.js';
 import { GameDataService } from './services/game-data-service.js';
 import { GymDirectory } from './services/gym-directory.js';
 import { ImageCache } from './services/image-cache.js';
+import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
 import { RaidBossService } from './services/raid-boss-service.js';
@@ -83,8 +85,22 @@ export async function startApp(
     ignoredWords: config.settings.blacklistWords,
     log,
   });
-  const regions = new RegionDirectory({ regions: new RegionRepository(db), log });
+  const regionRepository = new RegionRepository(db);
+  const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
+  const partyGateway = new DiscordPartyGateway();
+  const partyService = new PartyService({
+    store: parties,
+    gateway: partyGateway,
+    regions,
+    regionStore: regionRepository,
+    gyms,
+    raidBosses,
+    gameData,
+    raidEvents,
+    settings: config.settings,
+    log,
+  });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
   const maps = new StaticMaps(
     config.env.GOOGLE_API_KEY,
@@ -121,6 +137,7 @@ export async function startApp(
     gyms,
     regions,
     parties,
+    partyService,
     pokemon,
     maps,
     features: requested,
@@ -133,6 +150,7 @@ export async function startApp(
     log,
     create: createClient,
     configure(client) {
+      partyGateway.use(client);
       client.once(Events.ClientReady, (ready) => {
         log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
@@ -156,6 +174,8 @@ export async function startApp(
   // Listeners for the raid boss list (Phase 5) must be attached before this call.
   raidBosses.startAutoSync();
   raidEvents.start();
+  // What a stop between storing a raid and creating its post left behind.
+  await partyService.endPartiesWithoutPost();
   log.info({ features }, 'optional features');
 
   const shutdown = createShutdown(
@@ -185,6 +205,8 @@ export async function startApp(
           await raidEvents.whenIdle();
         },
       },
+      // Edits that are still waiting go out while Discord is connected.
+      { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
```

Create `src/commands/admin/index.ts`:

```ts
import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
import { requireBotManagement } from '../../discord/guards.js';
import { setupForums } from './setup-forums.js';

/**
 * The subcommands of `/admin`. Each lives in a file of its own in this folder; a later plan
 * adds one by appending it here (and its group, if it has one, to `groups` below).
 */
const parts: readonly SubcommandPart[] = [setupForums];

/** `/admin`: for staff. Discord offers it only to members who may manage the server. */
export const admin = commandGroup({
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Set up and look after Professor Pine')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  help: { category: 'admin' },
  guards: [requireBotManagement],
  parts,
});
```

Create `src/commands/admin/setup-forums.ts`:

```ts
import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import type { ForumSetup } from '../../services/party-service.js';

function line(result: ForumSetup): string {
  const { region } = result;
  if (result.forum === 'no-channel') {
    return `Region channel ${region.channelId}: I cannot see it any more, so it has no forum.`;
  }
  const forum = region.forumChannelId === null ? 'its forum' : `<#${region.forumChannelId}>`;
  const what = [
    result.forum === 'created' ? `created ${forum}` : `${forum} is ready`,
    ...(result.summary ? ['posted and pinned the list of active raids'] : []),
  ];
  return `<#${region.channelId}>: ${what.join(', ')}.`;
}

/** `/admin setup-forums`: every region of this server gets its forum, tags and summary post. */
export const setupForums: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('setup-forums')
    .setDescription(
      'Create the raid forum, its tags and the list of active raids for every region',
    ),
  help: {
    details:
      'For each region of this server: creates the forum for its raid posts next to the ' +
      "region's channel if it has none, adds the tags that are missing, and posts and pins the " +
      'list of active raids. It changes nothing that is already there, so it is safe to run again.',
    examples: ['/admin setup-forums'],
  },
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    if (!interaction.inGuild()) throw new UserError('This only works in a server.');
    const results = await ctx.partyService.setupForums(interaction.guildId);
    if (results.length === 0) {
      await interaction.editReply({ content: 'This server has no regions yet.' });
      return;
    }
    const text = results.map(line).join('\n');
    await interaction.editReply({ content: text.length > 2000 ? `${text.slice(0, 1999)}…` : text });
  },
};
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,5 +1,6 @@
 import type { CommandModule } from '../discord/command.js';
+import { admin } from './admin/index.js';
 import { help } from './util/help.js';
 
 /** Every slash command. The router and the deploy script both read this list. */
-export const commands: readonly CommandModule[] = [help];
+export const commands: readonly CommandModule[] = [help, admin];
```

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -62,6 +62,8 @@ export interface PartyGateway {
   deleteMessage(channelId: string, messageId: string): Promise<void>;
   /** The name of a channel the bot can see, from the cache. */
   channelName(channelId: string): string | undefined;
+  /** The id of the server a channel is in, from the cache. */
+  guildOf(channelId: string): string | undefined;
   /**
    * A custom emoji, by name, of the server a channel is in, as message text (`<:name:id>`).
    * From the cache; undefined when the server has none of that name.
@@ -93,9 +95,22 @@ function payload(message: OutgoingMessage) {
   };
 }
 
-/** The gateway over a logged-in discord.js client. */
+/**
+ * The gateway over a discord.js client. The client is handed over once it exists (the login
+ * may try several clients); anything asked before that fails.
+ */
 export class DiscordPartyGateway implements PartyGateway {
-  constructor(private readonly client: Client) {}
+  private current: Client | undefined;
+
+  /** The client to talk through from now on. */
+  use(client: Client): void {
+    this.current = client;
+  }
+
+  private get client(): Client {
+    if (!this.current) throw new Error('Discord is not connected yet');
+    return this.current;
+  }
 
   /** Runs `work`; a "gone" answer of Discord becomes undefined. */
   private async unlessGone<T>(work: () => Promise<T>): Promise<T | undefined> {
@@ -221,6 +236,11 @@ export class DiscordPartyGateway implements PartyGateway {
       : undefined;
   }
 
+  guildOf(channelId: string): string | undefined {
+    const channel = this.client.channels.cache.get(channelId);
+    return channel && !channel.isDMBased() ? channel.guildId : undefined;
+  }
+
   emoji(channelId: string, name: string): string | undefined {
     const channel = this.client.channels.cache.get(channelId);
     if (!channel || channel.isDMBased()) return undefined;
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -59,9 +59,19 @@ export type ReportOutcome =
 
 /** What the party service needs of the region table. */
 export interface SummaryStore {
+  setForum(id: number, forumChannelId: string | null): Promise<'set' | 'no-region' | 'forum-taken'>;
   setSummaryMessage(id: number, forumChannelId: string, messageId: string | null): Promise<boolean>;
 }
 
+/** What `/admin setup-forums` did for one region. */
+export interface ForumSetup {
+  region: Region;
+  /** `created`: a new forum; `ready`: the forum was there; `no-channel`: the region's channel is gone. */
+  forum: 'created' | 'ready' | 'no-channel';
+  /** Whether a new summary post was made. */
+  summary: boolean;
+}
+
 export interface PartyServiceOptions {
   store: PartyStore;
   gateway: PartyGateway;
@@ -382,4 +392,36 @@ export class PartyService {
   forgetTags(forumId: string): void {
     this.tags.delete(forumId);
   }
+
+  /**
+   * Gives every region of a server what parties need: a forum next to the region's channel
+   * (created when the region has none, or when the one it had was deleted), the tags, and the
+   * pinned summary post. Safe to run again: what is there is left alone.
+   */
+  async setupForums(guildId: string): Promise<ForumSetup[]> {
+    const { gateway, regions, regionStore } = this.options;
+    const results: ForumSetup[] = [];
+    const mine = regions.all().filter((region) => gateway.guildOf(region.channelId) === guildId);
+    for (const before of mine) {
+      let forum: ForumSetup['forum'] = 'ready';
+      const existing = before.forumChannelId;
+      if (existing !== null) this.tags.delete(existing);
+      const tags = existing === null ? undefined : await gateway.ensureTags(existing, FORUM_TAGS);
+      if (!tags) {
+        const name = `${gateway.channelName(before.channelId) ?? 'region'}-raids`;
+        const made = await gateway.createForum(before.channelId, name, FORUM_TAGS);
+        if (!made) {
+          results.push({ region: before, forum: 'no-channel', summary: false });
+          continue;
+        }
+        await regionStore.setForum(before.id, made.forumId);
+        await regions.load();
+        forum = 'created';
+      }
+      const region = regions.byId(before.id) ?? before;
+      const summary = await this.ensureSummary(region);
+      results.push({ region: regions.byId(before.id) ?? region, forum, summary });
+    }
+    return results;
+  }
 }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/setup-forums.test.ts`
Expected: PASS (1 file, 8 tests).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app-context.ts src/app.ts src/commands/admin/index.ts src/commands/admin/setup-forums.test.ts src/commands/admin/setup-forums.ts src/commands/index.ts src/discord/party-gateway.ts src/services/party-service.ts test/support/fake-gateway.ts test/support/party-service.ts test/support/test-context.ts
npm run check
git add src/app-context.ts src/app.ts src/commands/admin/index.ts src/commands/admin/setup-forums.test.ts src/commands/admin/setup-forums.ts src/commands/index.ts src/discord/party-gateway.ts src/services/party-service.ts test/support/fake-gateway.ts test/support/party-service.ts test/support/test-context.ts
git commit -m "/admin setup-forums: a forum, its tags and the summary post for every region" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,143 unit tests.

---

### Task 7: Reading what a raid report names: boss, gym, time

**Files:**
- Create: `src/commands/raids/raid-input.test.ts`, `src/commands/raids/raid-input.ts`

**Interfaces:**
- Consumes: `ctx.raidBosses`, `ctx.pokemon.exact`, `ctx.gyms.search` / `get` / `regionsOf`, `ctx.raidEvents`, `raidBossRef`, `matchNamed`, `resolvePartyTime`, `longestRaidDurations`, `raidDurationRules`, `plain`, `truncate`, `timestamp`.
- Produces: `src/commands/raids/raid-input.ts`: `MAX_CHOICES`, `ReportedBoss { tier; boss; label }`, `Choice { name; value }`, `bossChoices(ctx, typed)`, `reportedBoss(ctx, value)` (throws `UserError`), `gymChoices(ctx, regionChannelId, typed, regionName)`, `GymAnswer` (`gym` | `several` | `none`), `reportedGym(ctx, regionChannelId, value)`, `reportedTime(ctx, reported, text, now)` (throws `UserError`).

The test file contains one `\u200b` escape inside a regular expression: keep it an escape.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/raids/raid-input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EAST_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
import { at, PARTY_NOW } from '../../../test/support/parties.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { UserError } from '../../discord/errors.js';
import {
  bossChoices,
  gymChoices,
  reportedBoss,
  reportedGym,
  reportedTime,
  type ReportedBoss,
} from './raid-input.js';

/** The fixture has 14 bosses, among them Yveltal (T5), Shadow Landorus (T5) and Mega Blastoise. */
const { ctx } = createTestContext();
const T5 = { level: 'T5', shadow: false } as const;

describe('bossChoices', () => {
  it('offers the current bosses first, then an egg for every tier', () => {
    const choices = bossChoices(ctx, '');
    expect(choices).toHaveLength(25);
    expect(choices[0]).toEqual({ name: 'Pikachu (T1)', value: 'b:pikachu:T1:0' });
    expect(choices[13]).toEqual({
      name: 'Mega Blastoise (Mega)',
      value: 'b:blastoise_mega:Mega:0',
    });
    expect(choices[14]).toEqual({ name: 'T1 egg', value: 'e:T1:0' });
    expect(choices[15]).toEqual({ name: 'Shadow T1 egg', value: 'e:T1:1' });
    expect(choices.map((choice) => choice.name)).toContain('Elite egg');
  });

  it('narrows to what was typed, by name or by tier, whatever the case', () => {
    expect(bossChoices(ctx, 'yve')).toEqual([{ name: 'Yveltal (T5)', value: 'b:yveltal:T5:0' }]);
    expect(bossChoices(ctx, 'T5').map((choice) => choice.name)).toEqual([
      'Yveltal (T5)',
      'Landorus (Incarnate Forme) (Shadow T5)',
      'T5 egg',
      'Shadow T5 egg',
    ]);
    expect(bossChoices(ctx, 'shadow egg').map((choice) => choice.name)).toEqual([
      'Shadow T1 egg',
      'Shadow T3 egg',
      'Shadow T5 egg',
    ]);
    expect(bossChoices(ctx, 'zzz')).toEqual([]);
  });
});

describe('reportedBoss', () => {
  it('reads every value the choices offer back as what was picked', () => {
    for (const choice of bossChoices(ctx, '')) {
      expect(reportedBoss(ctx, choice.value).label).toBe(choice.name);
    }
    expect(reportedBoss(ctx, 'e:T5:0')).toEqual({ tier: T5, boss: null, label: 'T5 egg' });
    expect(reportedBoss(ctx, 'b:yveltal:T5:0')).toEqual({
      tier: T5,
      boss: { key: 'yveltal' },
      label: 'Yveltal (T5)',
    });
  });

  it('reads a typed tier as an egg', () => {
    const egg = (text: string) => reportedBoss(ctx, text);
    expect(egg('t5')).toMatchObject({ tier: T5, boss: null });
    expect(egg('5')).toMatchObject({ tier: T5, boss: null });
    expect(egg('Tier 5 egg')).toMatchObject({ tier: T5, boss: null });
    expect(egg('shadow t3')).toMatchObject({ tier: { level: 'T3', shadow: true }, boss: null });
    expect(egg('mega')).toMatchObject({ tier: { level: 'Mega', shadow: false } });
    expect(egg('mega legendary')).toMatchObject({
      tier: { level: 'MegaLegendary', shadow: false },
    });
    expect(egg('super mega egg')).toMatchObject({ tier: { level: 'SuperMega', shadow: false } });
    expect(egg('elite')).toMatchObject({ tier: { level: 'Elite', shadow: false } });
    expect(egg('EX raid')).toMatchObject({ tier: { level: 'EX', shadow: false } });
  });

  it('reads a typed name of a current boss, also half typed, with its tier from the list', () => {
    expect(reportedBoss(ctx, 'Yveltal')).toMatchObject({ tier: T5, boss: { key: 'yveltal' } });
    expect(reportedBoss(ctx, 'yvel')).toMatchObject({ boss: { key: 'yveltal' } });
    expect(reportedBoss(ctx, 'mega blastoise')).toMatchObject({
      tier: { level: 'Mega', shadow: false },
      boss: { key: 'blastoise_mega' },
    });
    expect(reportedBoss(ctx, 'landorus')).toMatchObject({
      tier: { level: 'T5', shadow: true },
      boss: { key: 'landorus_incarnate' },
    });
  });

  it('takes any Pokémon as a boss when its tier comes first', () => {
    expect(reportedBoss(ctx, 't5 mewtwo')).toEqual({
      tier: T5,
      boss: { key: 'mewtwo' },
      label: 'Mewtwo (T5)',
    });
    expect(reportedBoss(ctx, 't3 yveltal')).toMatchObject({
      tier: { level: 'T3', shadow: false },
      boss: { key: 'yveltal' },
    });
  });

  it('says what would work for a Pokémon that is no current boss, and for text it cannot read', () => {
    expect(() => reportedBoss(ctx, 'mewtwo')).toThrow(
      'Mewtwo is not on the current boss list. To report it anyway, put its tier first, for example `t5 mewtwo`.',
    );
    expect(() => reportedBoss(ctx, 'qwertyuiop')).toThrow(UserError);
    expect(() => reportedBoss(ctx, 'a')).toThrow('I do not know a raid boss or tier called "a"');
    expect(() => reportedBoss(ctx, 'shadow mega')).toThrow(UserError);
    expect(() => reportedBoss(ctx, '**@everyone**')).toThrow(/\\\*\\\*@\u200beveryone/);
  });

  it('refuses a choice whose boss has left the list, and a damaged value', () => {
    expect(() => reportedBoss(ctx, 'b:zekrom:T5:0')).toThrow('no longer on the list');
    expect(() => reportedBoss(ctx, 'b:yveltal:T3:0')).toThrow('no longer on the list');
    expect(() => reportedBoss(ctx, 'e:T9:0')).toThrow(UserError);
    expect(() => reportedBoss(ctx, 'e:Mega:1')).toThrow(UserError);
  });
});

describe('gymChoices and reportedGym', () => {
  const regionName = (channelId: string) => (channelId === EAST_CHANNEL ? 'east' : 'west');

  it('offers nothing until something is typed', () => {
    expect(gymChoices(ctx, WEST_CHANNEL, '  ', regionName)).toEqual([]);
  });

  it('offers the gyms that fit, with nickname, and the region of one that lies elsewhere', () => {
    expect(gymChoices(ctx, WEST_CHANNEL, 'library', regionName)).toEqual([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
    // Gym 7 lies in East, just over the border of West.
    expect(gymChoices(ctx, WEST_CHANNEL, 'lighthouse', regionName)).toEqual([
      { name: 'Harbor Lighthouse Mural · east', value: 'g:7' },
    ]);
    const starbucks = gymChoices(ctx, undefined, 'starbucks', regionName);
    expect(starbucks.map((choice) => choice.value).sort()).toEqual(['g:5', 'g:9']);
  });

  it('takes a picked gym by its id', () => {
    expect(reportedGym(ctx, WEST_CHANNEL, 'g:7')).toMatchObject({ kind: 'gym', gym: { id: 7 } });
    expect(reportedGym(ctx, WEST_CHANNEL, 'g:999')).toEqual({ kind: 'none' });
  });

  it('acts on typed text only when exactly one gym has every word as typed', () => {
    expect(reportedGym(ctx, WEST_CHANNEL, 'stone fountain')).toMatchObject({
      kind: 'gym',
      gym: { id: 2 },
    });
    // Misspelt: found, but offered, not acted on.
    expect(reportedGym(ctx, WEST_CHANNEL, 'fountian')).toMatchObject({
      kind: 'several',
      gyms: [{ id: 2 }],
    });
    // Two gyms have the word.
    const pinewood = reportedGym(ctx, WEST_CHANNEL, 'pinewood');
    expect(pinewood.kind).toBe('several');
    expect(reportedGym(ctx, WEST_CHANNEL, 'zzzzzz')).toEqual({ kind: 'none' });
  });
});

describe('reportedTime', () => {
  const egg: ReportedBoss = { tier: T5, boss: null, label: 'T5 egg' };
  const boss: ReportedBoss = { tier: T5, boss: { key: 'yveltal' }, label: 'Yveltal (T5)' };

  it('is nothing for no text', () => {
    expect(reportedTime(ctx, egg, null, PARTY_NOW)).toBeUndefined();
    expect(reportedTime(ctx, egg, '  ', PARTY_NOW)).toBeUndefined();
  });

  it('reads the hatch time of an egg and the end time of a boss', () => {
    expect(reportedTime(ctx, egg, '20', PARTY_NOW)).toEqual({ hatch: at('2026-10-13T14:20') });
    expect(reportedTime(ctx, egg, 'at 2:45pm', PARTY_NOW)).toEqual({
      hatch: at('2026-10-13T14:45'),
    });
    expect(reportedTime(ctx, boss, 'in 30', PARTY_NOW)).toEqual({ end: at('2026-10-13T14:30') });
  });

  it('allows the longer raids of a Raid Day', () => {
    // Saturday 31 October 2026, Raid Day 14:00 to 17:00: a boss stays 60 minutes, so an egg seen
    // now can end up to 120 minutes from now; on another day 105.
    const now = at('2026-10-31T14:30');
    expect(reportedTime(ctx, boss, '110', now)).toEqual({ end: at('2026-10-31T16:20') });
    expect(() => reportedTime(ctx, boss, '110', PARTY_NOW)).toThrow(UserError);
  });

  it('says what a time must be when it cannot be right, and when it is no time', () => {
    expect(() => reportedTime(ctx, egg, '90', PARTY_NOW)).toThrow(
      /cannot be the time the egg hatches: it must be between <t:\d+:f> and <t:\d+:f>\./,
    );
    expect(() => reportedTime(ctx, boss, 'soon', PARTY_NOW)).toThrow(
      'I could not read "soon" as the time the raid ends.',
    );
  });
});
```

Run: `npx vitest run --project unit src/commands/raids/raid-input.test.ts`
Expected: FAIL (the module `raid-input.js` cannot be found).

- [ ] **Step 2: The implementation**

Create `src/commands/raids/raid-input.ts`:

```ts
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { RaidBossRef } from '../../domain/party/party.js';
import { raidBossRef } from '../../domain/party/raid.js';
import type { RaidBoss } from '../../domain/pogo/raid-bosses.js';
import {
  isRaidLevel,
  RAID_LEVELS,
  raidDurationKind,
  raidTier,
  raidTierLabel,
  sameRaidTier,
  type RaidLevel,
  type RaidTier,
} from '../../domain/pogo/raid-tier.js';
import { matchNamed } from '../../domain/search/word-match.js';
import { resolvePartyTime } from '../../domain/time/party-time.js';
import { longestRaidDurations, raidDurationRules } from '../../domain/time/raid-durations.js';
import { UserError } from '../../discord/errors.js';
import { plain, timestamp, truncate } from '../../render/text.js';

const MINUTE = 60_000;
/** Discord shows at most this many choices, each with a name of at most 100 characters. */
export const MAX_CHOICES = 25;
const CHOICE_NAME = 100;

/** What a report says the raid is: an egg of a tier, or a boss. */
export interface ReportedBoss {
  tier: RaidTier;
  /** Null for an egg. */
  boss: RaidBossRef | null;
  /** How the bot words it back: `T5 egg`, `Yveltal (T5)`. */
  label: string;
}

export interface Choice {
  name: string;
  value: string;
}

const tierCode = (tier: RaidTier): string => `${tier.level}:${tier.shadow ? '1' : '0'}`;

function tierFromCode(level: string | undefined, shadow: string | undefined): RaidTier | undefined {
  return level !== undefined && isRaidLevel(level) ? raidTier(level, shadow === '1') : undefined;
}

function bossLabel(boss: RaidBoss): string {
  return `${boss.name} (${raidTierLabel(boss.tier)})`;
}

const eggLabel = (tier: RaidTier): string => `${raidTierLabel(tier)} egg`;

/** Every tier a raid can have, in the order of the levels, shadow after plain. */
function allTiers(): RaidTier[] {
  return RAID_LEVELS.flatMap((level) =>
    [raidTier(level, false), raidTier(level, true)].filter(
      (tier): tier is RaidTier => tier !== undefined,
    ),
  );
}

/**
 * The choices for the `boss` option: the current bosses first, then an egg for every tier,
 * narrowed to what was typed. A choice's value says exactly what was picked, so that the
 * report does not depend on the name being typed back.
 */
export function bossChoices(ctx: AppContext, typed: string): Choice[] {
  const words = typed.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const fits = (name: string): boolean => {
    const lower = name.toLowerCase();
    return words.every((word) => lower.includes(word));
  };
  const bosses = ctx.raidBosses.bosses().map((boss) => ({
    name: bossLabel(boss),
    value: `b:${boss.key}:${tierCode(boss.tier)}`,
  }));
  const eggs = allTiers().map((tier) => ({ name: eggLabel(tier), value: `e:${tierCode(tier)}` }));
  return [...bosses, ...eggs]
    .filter((choice) => fits(choice.name) && choice.value.length <= 100)
    .slice(0, MAX_CHOICES)
    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
}

const LEVEL_WORDS: Readonly<Record<string, RaidLevel>> = {
  '1': 'T1',
  t1: 'T1',
  '3': 'T3',
  t3: 'T3',
  '5': 'T5',
  t5: 'T5',
  legendary: 'T5',
  mega: 'Mega',
  megalegendary: 'MegaLegendary',
  supermega: 'SuperMega',
  elite: 'Elite',
  ex: 'EX',
};

/** A tier typed as words at the start of a text (`shadow t5`, `tier 3`, `mega`), and the rest. */
function leadingTier(text: string): { tier: RaidTier; rest: string } | undefined {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let shadow = false;
  if (words[0] === 'shadow') {
    shadow = true;
    words.shift();
  }
  if (words[0] === 'tier' || words[0] === 'level') words.shift();
  // "mega legendary" and "super mega" are two words.
  const two = LEVEL_WORDS[`${words[0] ?? ''}${words[1] ?? ''}`];
  const level = two ?? LEVEL_WORDS[words[0] ?? ''];
  if (!level) return undefined;
  const tier = raidTier(level, shadow);
  if (!tier) return undefined;
  const rest = words.slice(two ? 2 : 1).filter((word) => word !== 'egg' && word !== 'raid');
  return { tier, rest: rest.join(' ') };
}

/**
 * What the `boss` option names: a choice of the list, or typed text. Typed text may be a tier
 * (an egg), a current boss by name, or a tier followed by any Pokémon (a boss the list does not
 * have). Throws a `UserError` that says what would work.
 */
export function reportedBoss(ctx: AppContext, value: string): ReportedBoss {
  const text = value.trim();
  const bosses = ctx.raidBosses.bosses();
  const [kind, ...parts] = text.split(':');
  if (kind === 'e' && parts.length === 2) {
    const tier = tierFromCode(parts[0], parts[1]);
    if (tier) return { tier, boss: null, label: eggLabel(tier) };
  }
  if (kind === 'b' && parts.length === 3) {
    const tier = tierFromCode(parts[1], parts[2]);
    const boss = tier && bosses.find((b) => b.key === parts[0] && sameRaidTier(b.tier, tier));
    if (boss) return { tier: boss.tier, boss: raidBossRef(boss), label: bossLabel(boss) };
    throw new UserError('That boss is no longer on the list. Pick again from the list.');
  }

  const typedTier = leadingTier(text);
  if (typedTier && typedTier.rest === '') {
    return { tier: typedTier.tier, boss: null, label: eggLabel(typedTier.tier) };
  }
  const name = typedTier ? typedTier.rest : text;
  const candidates = typedTier
    ? bosses.filter((boss) => sameRaidTier(boss.tier, typedTier.tier))
    : bosses;
  const [listed, second] = matchNamed(
    candidates.map((boss) => ({ value: boss, names: [boss.name, boss.key.replace(/_/g, ' ')] })),
    name,
  );
  if (listed && (!second || second.key === listed.key)) {
    // One Pokémon in several tiers (a shadow and a plain raid): the first is the plain one.
    return { tier: listed.tier, boss: raidBossRef(listed), label: bossLabel(listed) };
  }
  if (listed && second) {
    throw new UserError(
      `"${plain(name)}" could be ${bossLabel(listed)} or ${bossLabel(second)}. Pick one from the list.`,
    );
  }
  // Single letters name the Unown forms: too little to act on.
  const entry = name.length > 1 ? ctx.pokemon.exact(name) : undefined;
  if (entry && typedTier) {
    const label = `${entry.name} (${raidTierLabel(typedTier.tier)})`;
    return { tier: typedTier.tier, boss: { key: entry.key }, label };
  }
  if (entry) {
    throw new UserError(
      `${entry.name} is not on the current boss list. To report it anyway, put its tier first, ` +
        `for example \`t5 ${entry.name.toLowerCase()}\`.`,
    );
  }
  throw new UserError(
    `I do not know a raid boss or tier called "${plain(truncate(name, 80))}". Pick one from the list, ` +
      'or type a tier such as `t5` for an egg.',
  );
}

function gymLabel(gym: Gym, region: string | undefined): string {
  const parts = [gym.name, ...(gym.nickname ? [gym.nickname] : []), ...(region ? [region] : [])];
  return truncate(parts.join(' · '), CHOICE_NAME);
}

/**
 * The choices for the `gym` option: the gyms matching what was typed, the region's own first.
 * `regionName` gives the name of a region channel, to say where a gym of another region lies.
 */
export function gymChoices(
  ctx: AppContext,
  regionChannelId: string | undefined,
  typed: string,
  regionName: (channelId: string) => string | undefined,
): Choice[] {
  if (typed.trim() === '') return [];
  return ctx.gyms
    .search(regionChannelId ?? null, typed, { limit: MAX_CHOICES })
    .map(({ gym, place }) => {
      const elsewhere = place === 'local' ? undefined : ctx.gyms.regionsOf(gym.id)[0];
      const region = elsewhere === undefined ? undefined : regionName(elsewhere);
      return { name: gymLabel(gym, region), value: `g:${String(gym.id)}` };
    });
}

export type GymAnswer =
  /** One gym, clearly. */
  | { kind: 'gym'; gym: Gym }
  /** Several gyms fit: the member chooses. */
  | { kind: 'several'; gyms: Gym[] }
  | { kind: 'none' };

/**
 * The gym the `gym` option names: a choice of the list, or typed text. Typed text is acted on
 * only when exactly one gym has every word as typed; otherwise the best few are offered.
 */
export function reportedGym(
  ctx: AppContext,
  regionChannelId: string | undefined,
  value: string,
): GymAnswer {
  const text = value.trim();
  const picked = /^g:(\d{1,10})$/.exec(text);
  if (picked) {
    const gym = ctx.gyms.get(Number(picked[1]));
    return gym ? { kind: 'gym', gym } : { kind: 'none' };
  }
  const hits = ctx.gyms.search(regionChannelId ?? null, text, { limit: 5 });
  if (hits.length === 0) return { kind: 'none' };
  const clear = hits.filter((hit) => hit.allWords && !hit.corrected);
  const [only] = clear;
  if (only && clear.length === 1) return { kind: 'gym', gym: only.gym };
  return { kind: 'several', gyms: hits.map((hit) => hit.gym) };
}

/**
 * The time of a report: when the egg hatches, or when a raid that was seen hatched ends.
 * Undefined for no text. Throws a `UserError` for a text that is no time or lies outside what
 * such a raid can have.
 */
export function reportedTime(
  ctx: AppContext,
  reported: ReportedBoss,
  text: string | null,
  now: number,
): { hatch: number } | { end: number } | undefined {
  if (text === null || text.trim() === '') return undefined;
  const { settings } = ctx.config;
  const kind = raidDurationKind(reported.tier);
  const rules = raidDurationRules(settings, ctx.raidEvents.events());
  // A raid reported now hatched at most its own length ago and hatches within the egg time.
  const usual = longestRaidDurations(kind, now, now, rules);
  const durations = longestRaidDurations(
    kind,
    now - usual.hatched * MINUTE,
    now + usual.incubation * MINUTE,
    rules,
  );
  const parameter = reported.boss === null ? 'hatch' : 'end';
  const result = resolvePartyTime({
    text,
    now,
    zone: settings.timezone,
    parameter,
    partyType: 'raid',
    raidKind: kind,
    settings,
    durations,
  });
  const what = parameter === 'hatch' ? 'the time the egg hatches' : 'the time the raid ends';
  if (result.kind === 'time')
    return parameter === 'hatch' ? { hatch: result.at } : { end: result.at };
  if (result.kind === 'out-of-range') {
    throw new UserError(
      `"${plain(truncate(text, 80))}" cannot be ${what}: it must be between ` +
        `${timestamp(result.first, 'f')} and ${timestamp(result.last, 'f')}.`,
    );
  }
  throw new UserError(
    `I could not read "${plain(truncate(text, 80))}" as ${what}. Try \`20\` (minutes from now) or \`6:15pm\`.`,
  );
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/raid-input.test.ts`
Expected: PASS (1 file, 16 tests).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts
npm run check
git add src/commands/raids/raid-input.test.ts src/commands/raids/raid-input.ts
git commit -m "/raid: reading the boss, the gym and the time of a report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,159 unit tests.

---

### Task 8: `/raid`, its gym menu and its region confirmation

**Files:**
- Create: `src/commands/raids/raid.test.ts`, `src/commands/raids/raid.ts`, `src/services/pending-requests.test.ts`, `src/services/pending-requests.ts`
- Modify: `src/app-context.ts`, `src/app.ts`, `src/commands/index.ts`, `src/components/index.ts`, `test/support/fake-interactions.ts`, `test/support/test-context.ts`

**Interfaces:**
- Consumes: Task 7 (`raid-input.ts`), Task 6 (`ctx.partyService`), Task 4 (`regionChannelOf`, `requireRegion`), `encodeCustomId`, `ComponentHandler`, `UserRepository.get` / `DEFAULT_USER_SETTINGS`.
- Produces: `PendingRequests<T>` (`put(ownerId, value): token`, `take(token, userId): { value } | 'expired' | 'not-yours'`, `size`). `ctx.users: { get(snowflake): Promise<UserSettings> }`. The command `raid` and the component handler `raidControls` (kind `raid`; actions `gym`, `yes`, `no`), both listed. The fake interactions gain `isStringSelectMenu`.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -160,6 +160,7 @@ function base(kind: Kind, o: FakeOptions) {
     isMessageComponent: () => kind === 'button' || kind === 'select',
     isButton: () => kind === 'button',
     isAnySelectMenu: () => kind === 'select',
+    isStringSelectMenu: () => kind === 'select',
     isModalSubmit: () => kind === 'modal',
     inCachedGuild: () => guildId !== null,
     inGuild: () => guildId !== null,
```

Apply to `test/support/test-context.ts`:

```diff
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -2,6 +2,7 @@ import type { Kysely } from 'kysely';
 import type { AppContext } from '../../src/app-context.js';
 import { loadEnv } from '../../src/config/env.js';
 import { loadSettings } from '../../src/config/settings.js';
+import { DEFAULT_USER_SETTINGS } from '../../src/db/repositories/user-repository.js';
 import type { DB } from '../../src/db/types.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import { catalogueFixture } from './game-data.js';
@@ -39,6 +40,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     gyms: gymsFixture(),
     regions: regionsFixture(),
     parties: noParties(),
+    // Every member has the default settings.
+    users: { get: (snowflake) => Promise.resolve({ snowflake, ...DEFAULT_USER_SETTINGS }) },
     partyService: unavailable<PartyService>(
       'partyService',
       'pass { partyService, parties, regions } from partyServiceWith()',
```

- [ ] **Step 2: Write the failing tests**

Create `src/commands/raids/raid.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeSelect,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { at, PARTY_NOW } from '../../../test/support/parties.js';
import { partyServiceWith } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { DEFAULT_USER_SETTINGS } from '../../db/repositories/user-repository.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { raid, raidControls } from './raid.js';

const OTHER_MEMBER = '700000000000000002';

async function setup(users?: Parameters<typeof createTestContext>[0]) {
  const made = await partyServiceWith();
  const { ctx } = createTestContext({
    partyService: made.service,
    parties: made.store,
    regions: made.regions,
    ...users,
  });
  const router = new InteractionRouter(ctx, [raid], [raidControls]);
  const run = async (options: Record<string, string>, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, router, run, handle };
}

/** The custom id of the n-th control of the first row of a reply. */
function customId(interaction: FakeInteraction, index = 0): string {
  const row = sent(interaction.editReply).components?.[0] as {
    toJSON(): { components: { custom_id: string }[] };
  };
  return row.toJSON().components[index]?.custom_id ?? '';
}

describe('/raid', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports an egg picked from the lists, with its hatch time, and links the post', async () => {
    const { run, store, gateway } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:1', time: '30' });
    const [party] = store.active();
    expect(party).toMatchObject({
      gymId: 1,
      hatchTime: at('2026-10-13T14:30'),
      raid: { tier: { level: 'T5', shadow: false }, boss: null },
      createdById: interaction.user.id,
      anonymous: false,
    });
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
    expect(sent(interaction.editReply)).toMatchObject({
      content: `Reported: T5 egg at The Stacks. Its post is <#${party?.forumPostId}>.`,
      components: [],
    });
  });

  it('reports a boss typed by name at a gym typed by name, with the end time', async () => {
    const { run, store } = await setup();
    await run({ boss: 'yveltal', gym: 'stone fountain', time: 'at 2:40pm' });
    expect(store.active()[0]).toMatchObject({
      gymId: 2,
      endTime: at('2026-10-13T14:40'),
      raid: { boss: { key: 'yveltal' }, reportedHatched: true },
    });
  });

  it('uses the member’s settings: automatic status and anonymous reports', async () => {
    const users = {
      get: (snowflake: string) =>
        Promise.resolve({
          snowflake,
          ...DEFAULT_USER_SETTINGS,
          autoStatus: PartyStatus.Coming,
          raidPrivacy: RaidPrivacy.Anonymous,
        }),
    };
    const { run, store } = await setup({ users });
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(store.active()[0]).toMatchObject({
      anonymous: true,
      attendees: { [interaction.user.id]: { status: PartyStatus.Coming } },
    });
  });

  it('shows the raid a gym already has and says the member was signed up', async () => {
    const { run, store, gateway } = await setup();
    await run({ boss: 'e:T5:0', gym: 'g:1' });
    const again = await run({ boss: 'e:T3:0', gym: 'g:1' }, { userId: OTHER_MEMBER });
    const [party] = store.active();
    expect(sent(again.editReply).content).toBe(
      `There is already a raid at The Stacks. Its post is <#${party?.forumPostId}>. You have been marked as interested.`,
    );
    expect(party?.attendees).toHaveProperty(OTHER_MEMBER);
    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
    const third = await run({ boss: 'e:T5:0', gym: 'g:1' }, { userId: OTHER_MEMBER });
    expect(sent(third.editReply).content).not.toContain('You have been marked');
  });

  it('offers a menu when several gyms fit, and reports at the one chosen', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    expect(sent(interaction.editReply).content).toBe(
      'Several gyms fit "pinewood". Which one do you mean?',
    );
    expect(store.active()).toEqual([]);

    const select = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
    expect(select.deferUpdate).toHaveBeenCalled();
    expect(store.active()[0]).toMatchObject({ gymId: 12 });
    expect(sent(select.editReply).content).toContain(
      'Reported: T5 egg at Pinewood Post Office Gym.',
    );
    // The menu works once.
    const second = await handle(fakeSelect({ customId: customId(interaction), values: ['1'] }));
    expect(sent(second.update)).toEqual({
      content: 'That choice has expired. Use `/raid` again.',
      components: [],
    });
    expect(store.active()).toHaveLength(1);
  });

  it('lets only the member who asked use the menu, and only for a gym that was offered', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
    const stranger = await handle(
      fakeSelect({ customId: customId(interaction), values: ['12'], userId: OTHER_MEMBER }),
    );
    expect(sent(stranger.reply).content).toBe('That is somebody else’s report.');
    const forged = await handle(fakeSelect({ customId: customId(interaction), values: ['7'] }));
    expect(sent(forged.reply).content).toBe('That gym no longer exists. Use `/raid` again.');
    expect(store.active()).toEqual([]);
  });

  it('asks before reporting at a gym of another region, and reports there on yes', async () => {
    const { run, handle, store, gateway } = await setup();
    // Gym 7 lies in East; the command is used in West.
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    expect(sent(interaction.editReply).content).toMatch(
      /^Harbor Lighthouse Mural is in <#\d+>, not in this region\. Report the raid there\?$/,
    );
    expect(store.active()).toEqual([]);
    const yes = await handle(fakeButton({ customId: customId(interaction, 0) }));
    expect(store.active()[0]).toMatchObject({ gymId: 7, regionId: 2 });
    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(1);
    expect(sent(yes.editReply).content).toContain('Reported: T5 egg at Harbor Lighthouse Mural.');
  });

  it('reports nothing on cancel', async () => {
    const { run, handle, store } = await setup();
    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
    const no = await handle(fakeButton({ customId: customId(interaction, 1) }));
    expect(sent(no.update)).toEqual({ content: 'Nothing was reported.', components: [] });
    expect(store.active()).toEqual([]);
  });

  it('refuses what it cannot read before anything is created', async () => {
    const { run, store } = await setup();
    const text = async (options: Record<string, string>) => {
      const interaction = await run(options);
      return sent(interaction.followUp).content;
    };
    expect(await text({ boss: 'mewtwo', gym: 'g:1' })).toContain('is not on the current boss list');
    expect(await text({ boss: 'e:T5:0', gym: 'zzzzzz' })).toBe(
      'I found no gym for "zzzzzz". Type part of its name and pick it from the list.',
    );
    expect(await text({ boss: 'e:T5:0', gym: 'g:1', time: 'soon' })).toContain(
      'I could not read "soon"',
    );
    expect(store.active()).toEqual([]);
  });

  it('says so when the region has no forum, and when the gym lies in no region', async () => {
    const { run, regions } = await setup();
    const west = regions.rows[0];
    if (west) west.forumChannelId = null;
    const noForum = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(sent(noForum.editReply).content).toBe(
      `The region <#${WEST_CHANNEL}> has no raid forum yet. A moderator can create it with \`/admin setup-forums\`.`,
    );
  });

  it('works from the region’s forum and its posts, and not elsewhere', async () => {
    const { run, store } = await setup();
    await run(
      { boss: 'e:T5:0', gym: 'g:1' },
      { channelId: undefined, thread: { parentId: WEST_FORUM } },
    );
    expect(store.active()).toHaveLength(1);
    const elsewhere = await run(
      { boss: 'e:T5:0', gym: 'g:2' },
      { channelId: '600000000000000009' },
    );
    expect(sent(elsewhere.reply).content).toBe('Use this in a region channel.');
    expect(store.active()).toHaveLength(1);
  });

  it('lets a member report twenty raids in a quarter of an hour, not more', async () => {
    const { run } = await setup();
    for (let n = 0; n < 20; n++) await run({ boss: 'e:T5:0', gym: 'zzzzzz' });
    const refused = await run({ boss: 'e:T5:0', gym: 'g:1' });
    expect(sent(refused.reply).content).toMatch(/^You can use \/raid again in /);
  });
});

describe('/raid autocomplete', () => {
  it('lists bosses and eggs for the boss option', async () => {
    const { router } = await setup();
    const interaction = fakeAutocomplete({
      commandName: 'raid',
      channelId: WEST_CHANNEL,
      focusedName: 'boss',
      focused: 'yve',
    });
    await router.handle(interaction as never);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Yveltal (T5)', value: 'b:yveltal:T5:0' },
    ]);
  });

  it('lists the gyms of the region for the gym option, also from a post of its forum', async () => {
    const { router } = await setup();
    const interaction = fakeAutocomplete({
      commandName: 'raid',
      thread: { parentId: WEST_FORUM },
      focusedName: 'gym',
      focused: 'libr',
    });
    await router.handle(interaction as never);
    expect(interaction.respond).toHaveBeenCalledWith([
      { name: 'Pinewood Public Library · The Stacks', value: 'g:1' },
    ]);
  });
});
```

Create `src/services/pending-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PendingRequests } from './pending-requests.js';

const ALICE = '200000000000000002';
const BOB = '200000000000000003';

describe('PendingRequests', () => {
  it('gives a value back once, to the member who put it there', () => {
    const pending = new PendingRequests<string>();
    const token = pending.put(ALICE, 'report');
    expect(token).toMatch(/^[0-9a-f]{16}$/);
    expect(pending.take(token, BOB)).toBe('not-yours');
    expect(pending.take(token, ALICE)).toEqual({ value: 'report' });
    expect(pending.take(token, ALICE)).toBe('expired');
    expect(pending.take('0000000000000000', ALICE)).toBe('expired');
  });

  it('forgets a request after its time', () => {
    let now = 1_000;
    const pending = new PendingRequests<string>({ ttlMs: 600_000, now: () => now });
    const token = pending.put(ALICE, 'report');
    now += 599_999;
    const other = pending.put(ALICE, 'second');
    now += 1;
    expect(pending.take(token, ALICE)).toBe('expired');
    expect(pending.take(other, ALICE)).toEqual({ value: 'second' });
  });

  it('never holds more than its maximum: the oldest go first', () => {
    const pending = new PendingRequests<number>({ max: 3 });
    const tokens = [1, 2, 3, 4, 5].map((n) => pending.put(ALICE, n));
    expect(pending.size).toBe(3);
    expect(pending.take(tokens[0] ?? '', ALICE)).toBe('expired');
    expect(pending.take(tokens[1] ?? '', ALICE)).toBe('expired');
    expect(pending.take(tokens[4] ?? '', ALICE)).toEqual({ value: 5 });
  });
});
```

Run: `npx vitest run --project unit src/commands/raids/raid.test.ts src/services/pending-requests.test.ts`
Expected: FAIL (the modules `raid.js` and `pending-requests.js` cannot be found).

- [ ] **Step 3: The implementation**

Apply to `src/app-context.ts`:

```diff
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -1,5 +1,6 @@
 import type { Kysely } from 'kysely';
 import type { Config } from './config/index.js';
+import type { UserSettings } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import type { CommandModule } from './discord/command.js';
 import type { IntentFlags } from './discord/intents.js';
@@ -34,6 +35,8 @@ export interface AppContext {
   readonly parties: PartyProvider;
   /** Parties on Discord: reporting a raid, keeping posts and summaries up to date. */
   readonly partyService: PartyService;
+  /** A member's settings (the defaults for a member who never changed one). */
+  readonly users: { get(snowflake: string): Promise<UserSettings> };
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
   /** Map pictures of gyms and regions, as files to attach. */
```

Apply to `src/app.ts`:

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -12,6 +12,7 @@ import { PartyRepository } from './db/repositories/party-repository.js';
 import { PokemonRepository } from './db/repositories/pokemon-repository.js';
 import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
+import { UserRepository } from './db/repositories/user-repository.js';
 import type { DB } from './db/types.js';
 import { createClient, loginWithFallback } from './discord/client.js';
 import { enabledCommands } from './discord/command.js';
@@ -138,6 +139,7 @@ export async function startApp(
     regions,
     parties,
     partyService,
+    users: new UserRepository(db),
     pokemon,
     maps,
     features: requested,
```

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -1,6 +1,7 @@
 import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
+import { raid } from './raids/raid.js';
 import { help } from './util/help.js';
 
 /** Every slash command. The router and the deploy script both read this list. */
-export const commands: readonly CommandModule[] = [help, admin];
+export const commands: readonly CommandModule[] = [help, raid, admin];
```

Create `src/commands/raids/raid.ts`:

```ts
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { AppContext } from '../../app-context.js';
import type { Gym } from '../../db/repositories/gym-repository.js';
import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
import { encodeCustomId } from '../../discord/custom-id.js';
import { UserError } from '../../discord/errors.js';
import { regionChannelOf, requireRegion } from '../../discord/guards.js';
import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
import { plain, truncate } from '../../render/text.js';
import { PendingRequests } from '../../services/pending-requests.js';
import {
  bossChoices,
  gymChoices,
  reportedBoss,
  reportedGym,
  reportedTime,
  type ReportedBoss,
} from './raid-input.js';

/** The custom-id kind of the controls this command shows. */
const KIND = 'raid';
const EXPIRED = 'That choice has expired. Use `/raid` again.';

/** A report that waits for the member to choose a gym or to confirm one in another region. */
interface PendingReport {
  reported: ReportedBoss;
  time: { hatch: number } | { end: number } | undefined;
  /** The region the command was used in. */
  regionChannelId: string | undefined;
  /** The gyms offered in the menu; for a confirmation, the one gym. */
  gymIds: number[];
}

const pending = new PendingRequests<PendingReport>();

type Answerable = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;

const gymName = (gym: Gym): string => plain(gym.nickname ?? gym.name);

const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
  [PartyStatus.Interested]: 'interested',
  [PartyStatus.Coming]: 'coming',
  [PartyStatus.Present]: 'here',
};

/** Reports the raid and tells the member what came of it. The interaction is acknowledged. */
async function finish(
  interaction: Answerable,
  ctx: AppContext,
  request: PendingReport,
  gym: Gym,
): Promise<void> {
  const settings = await ctx.users.get(interaction.user.id);
  const outcome = await ctx.partyService.reportRaid({
    gym,
    reporterId: interaction.user.id,
    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
    autoStatus: settings.autoStatus,
    tier: request.reported.tier,
    boss: request.reported.boss,
    ...(request.time ? { time: request.time } : {}),
  });
  let content: string;
  switch (outcome.kind) {
    case 'created':
      content = `Reported: ${request.reported.label} at ${gymName(gym)}. Its post is <#${outcome.party.forumPostId ?? ''}>.`;
      break;
    case 'exists': {
      const post = outcome.party.forumPostId;
      const where = post === null ? 'It is being set up right now.' : `Its post is <#${post}>.`;
      const status = STATUS_WORDS[settings.autoStatus];
      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
      content = `There is already a raid at ${gymName(gym)}. ${where}${marked}`;
      break;
    }
    case 'no-region':
      content = `${gymName(gym)} is not in any region of this server, so I have nowhere to post the raid.`;
      break;
    case 'no-forum':
      content =
        `The region <#${outcome.region.channelId}> has no raid forum yet. ` +
        'A moderator can create it with `/admin setup-forums`.';
      break;
  }
  await interaction.editReply({ content, components: [] });
}

/**
 * Goes on with a report once its gym is known: a gym outside the region the command was used
 * in is confirmed first, otherwise the raid is reported.
 */
async function withGym(
  interaction: Answerable,
  ctx: AppContext,
  request: PendingReport,
  gym: Gym,
): Promise<void> {
  const regions = ctx.gyms.regionsOf(gym.id);
  const here = request.regionChannelId;
  const [elsewhere] = regions;
  if (here === undefined || regions.includes(here) || elsewhere === undefined) {
    await finish(interaction, ctx, request, gym);
    return;
  }
  const token = pending.put(interaction.user.id, { ...request, gymIds: [gym.id] });
  const button = (action: string, label: string, style: ButtonStyle) =>
    new ButtonBuilder()
      .setCustomId(encodeCustomId({ kind: KIND, id: token, action }))
      .setLabel(label)
      .setStyle(style);
  await interaction.editReply({
    content: `${gymName(gym)} is in <#${elsewhere}>, not in this region. Report the raid there?`,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button('yes', 'Report it there', ButtonStyle.Primary),
        button('no', 'Cancel', ButtonStyle.Secondary),
      ),
    ],
  });
}

export const raid: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('raid')
    .setDescription('Report a raid or an egg at a gym')
    .addStringOption((option) =>
      option
        .setName('boss')
        .setDescription('The boss, or the tier of an egg: pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('gym')
        .setDescription('The gym: type part of its name and pick from the list')
        .setRequired(true)
        .setMaxLength(100)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('time')
        .setDescription(
          'For an egg: when it hatches. For a boss: when the raid ends. E.g. 20 or 6:15pm',
        )
        .setMaxLength(40),
    ),
  help: {
    category: 'raid-crud',
    details:
      "Creates a post for the raid in the raid forum of the gym's region. Pick the boss (or the " +
      'tier, for an egg) and the gym from the lists that appear while you type. The time is ' +
      'optional: minutes from now (`20`) or a clock time (`6:15pm`); for an egg it is when the ' +
      'egg hatches, for a boss when the raid ends. If the gym already has a raid, you are shown ' +
      'its post instead.',
    examples: [
      '/raid boss:T5 egg gym:Big Fountain time:25',
      '/raid boss:Yveltal (T5) gym:Library time:6:15pm',
    ],
  },
  guards: [requireRegion],
  defer: 'ephemeral',
  throttle: { uses: 20, perSeconds: 900 },

  async execute(interaction, ctx) {
    const regionChannelId = regionChannelOf(interaction, ctx);
    const reported = reportedBoss(ctx, interaction.options.getString('boss', true));
    const time = reportedTime(ctx, reported, interaction.options.getString('time'), Date.now());
    const typedGym = interaction.options.getString('gym', true);
    const answer = reportedGym(ctx, regionChannelId, typedGym);
    const request: PendingReport = { reported, time, regionChannelId, gymIds: [] };
    if (answer.kind === 'none') {
      throw new UserError(
        `I found no gym for "${plain(truncate(typedGym, 80))}". Type part of its name and pick it from the list.`,
      );
    }
    if (answer.kind === 'gym') {
      await withGym(interaction, ctx, request, answer.gym);
      return;
    }
    const token = pending.put(interaction.user.id, {
      ...request,
      gymIds: answer.gyms.map((gym) => gym.id),
    });
    const menu = new StringSelectMenuBuilder()
      .setCustomId(encodeCustomId({ kind: KIND, id: token, action: 'gym' }))
      .setPlaceholder('Choose the gym')
      .addOptions(
        answer.gyms.map((gym) => ({
          label: truncate(gym.name, 100),
          value: String(gym.id),
          ...(gym.nickname ? { description: truncate(gym.nickname, 100) } : {}),
        })),
      );
    await interaction.editReply({
      content: `Several gyms fit "${plain(truncate(typedGym, 80))}". Which one do you mean?`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    });
  },

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'boss') {
      await interaction.respond(bossChoices(ctx, focused.value));
      return;
    }
    const regionName = (channelId: string): string | undefined =>
      interaction.guild?.channels.cache.get(channelId)?.name;
    await interaction.respond(
      gymChoices(ctx, regionChannelOf(interaction, ctx), focused.value, regionName),
    );
  },
};

/** The request a control of this command belongs to; answers the member when there is none. */
async function claimed(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  token: string,
): Promise<PendingReport | undefined> {
  const taken = pending.take(token, interaction.user.id);
  if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
  if (taken === 'expired') {
    await interaction.update({ content: EXPIRED, components: [] });
    return undefined;
  }
  return taken.value;
}

/** The gym menu and the confirmation buttons of `/raid`. */
export const raidControls: ComponentHandler = {
  kind: KIND,

  async select(interaction, id, ctx) {
    if (id.action !== 'gym' || !interaction.isStringSelectMenu()) throw new UserError(EXPIRED);
    const request = await claimed(interaction, id.id);
    if (!request) return;
    const gymId = Number(interaction.values[0]);
    const gym = request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
    if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
    await interaction.deferUpdate();
    await withGym(interaction, ctx, request, gym);
  },

  async button(interaction, id, ctx) {
    const request = await claimed(interaction, id.id);
    if (!request) return;
    if (id.action !== 'yes') {
      await interaction.update({ content: 'Nothing was reported.', components: [] });
      return;
    }
    const gym = ctx.gyms.get(request.gymIds[0] ?? -1);
    if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
    await interaction.deferUpdate();
    await finish(interaction, ctx, request, gym);
  },
};
```

Apply to `src/components/index.ts`:

```diff
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,4 +1,5 @@
+import { raidControls } from '../commands/raids/raid.js';
 import type { ComponentHandler } from '../discord/command.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
-export const components: readonly ComponentHandler[] = [];
+export const components: readonly ComponentHandler[] = [raidControls];
```

Create `src/services/pending-requests.ts`:

```ts
import { randomBytes } from 'node:crypto';

/**
 * What a command has to remember between asking a member something with buttons or a menu and
 * the answer: the values are kept in memory under a token that goes into the custom id of the
 * controls. A request belongs to the member who made it, is answered once, and is forgotten
 * after `ttlMs` (a restart forgets all of them; the control then says it has expired).
 */
export class PendingRequests<T> {
  private readonly requests = new Map<string, { ownerId: string; value: T; expires: number }>();
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly now: () => number;

  constructor(options: { ttlMs?: number; max?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.max = options.max ?? 1_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Remembers a value for a member and gives the token to put into the custom id. */
  put(ownerId: string, value: T): string {
    const now = this.now();
    for (const [token, request] of this.requests) {
      if (request.expires <= now) this.requests.delete(token);
    }
    // Oldest first: a Map keeps the order in which entries were added.
    while (this.requests.size >= this.max) {
      const oldest = this.requests.keys().next();
      if (oldest.done) break;
      this.requests.delete(oldest.value);
    }
    const token = randomBytes(8).toString('hex');
    this.requests.set(token, { ownerId, value, expires: now + this.ttlMs });
    return token;
  }

  /**
   * The value for a token, which is then forgotten. `expired` when there is none (answered
   * already, too old, or from before a restart); `not-yours` for another member's request,
   * which stays.
   */
  take(token: string, userId: string): { value: T } | 'expired' | 'not-yours' {
    const request = this.requests.get(token);
    if (!request || request.expires <= this.now()) {
      this.requests.delete(token);
      return 'expired';
    }
    if (request.ownerId !== userId) return 'not-yours';
    this.requests.delete(token);
    return { value: request.value };
  }

  get size(): number {
    return this.requests.size;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/commands/raids/raid.test.ts src/services/pending-requests.test.ts`
Expected: PASS (2 files, 17 tests).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/app-context.ts src/app.ts src/commands/index.ts src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/components/index.ts src/services/pending-requests.test.ts src/services/pending-requests.ts test/support/fake-interactions.ts test/support/test-context.ts
npm run check
git add src/app-context.ts src/app.ts src/commands/index.ts src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/components/index.ts src/services/pending-requests.test.ts src/services/pending-requests.ts test/support/fake-interactions.ts test/support/test-context.ts
git commit -m "/raid: report a raid or an egg, with a menu for an unclear gym" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,176 unit tests.

---

### Task 9: A debug line per handled interaction

**Files:**
- Modify: `src/discord/router.test.ts`, `src/discord/router.ts`

**Interfaces:**
- Consumes: `InteractionRouter.handle`.
- Produces: One log entry at debug level, `interaction handled`, with `interaction` (as the router describes it) and `ms`, after every command, control and modal; none for autocomplete.

- [ ] **Step 1: Write the failing tests**

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -85,6 +85,22 @@ describe('InteractionRouter', () => {
     expect(entries.filter((e) => e.level === 50)).toHaveLength(0);
   });
 
+  it('writes one debug line per handled command or control, and none for autocomplete', async () => {
+    const { ctx, entries } = createTestContext();
+    const router = new InteractionRouter(ctx, [], []);
+    await router.handle(fakeChatInput({ commandName: 'nothing' }) as unknown as Interaction);
+    await router.handle(fakeButton({ customId: 'p:1:join' }) as unknown as Interaction);
+    await router.handle(fakeAutocomplete({ commandName: 'nothing' }) as unknown as Interaction);
+    const handled = entries.filter((entry) => entry.msg === 'interaction handled');
+    expect(handled).toHaveLength(2);
+    expect(handled[0]).toMatchObject({
+      level: 20,
+      interaction: { command: 'nothing', user: '700000000000000001' },
+      ms: expect.any(Number) as number,
+    });
+    expect(handled[1]).toMatchObject({ interaction: { customId: 'p:1:join' } });
+  });
+
   it('logs an unexpected error with a reference shown to the user', async () => {
     const { ctx, entries } = createTestContext();
     const cmd = command({ execute: () => Promise.reject(new Error('boom')) });
```

Run: `npx vitest run --project unit src/discord/router.test.ts`
Expected: FAIL (no entry `interaction handled` is logged).

- [ ] **Step 2: The implementation**

Apply to `src/discord/router.ts`:

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -82,11 +82,21 @@ export class InteractionRouter {
     }
   }
 
+  /**
+   * Handles one interaction; never rejects. Afterwards one line at debug level says what it was
+   * and how long it took (autocomplete is left out: it comes with every keystroke).
+   */
   async handle(interaction: Interaction): Promise<void> {
-    if (interaction.isChatInputCommand()) return this.handleCommand(interaction);
     if (interaction.isAutocomplete()) return this.handleAutocomplete(interaction);
-    if (interaction.isMessageComponent() || interaction.isModalSubmit())
-      return this.handleComponent(interaction);
+    const started = performance.now();
+    if (interaction.isChatInputCommand()) await this.handleCommand(interaction);
+    else if (interaction.isMessageComponent() || interaction.isModalSubmit())
+      await this.handleComponent(interaction);
+    else return;
+    this.ctx.log.debug(
+      { interaction: describe(interaction), ms: Math.round(performance.now() - started) },
+      'interaction handled',
+    );
   }
 
   private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/discord/router.test.ts`
Expected: PASS (the router's tests).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/discord/router.test.ts src/discord/router.ts
npm run check
git add src/discord/router.test.ts src/discord/router.ts
git commit -m "Router: one debug line per handled interaction" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,177 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `npm run test:db` once, complete.
2. Whole-branch review (Opus, high effort) of the nine commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `src/render/` and `plain()`, `PartyGateway` and its fake, `ctx.regions`, `ctx.partyService` (`reportRaid`, `changed`), `ctx.users`, `/admin`'s parts list, `PendingRequests`, `partyServiceWith`.
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete what this plan did; add a "From Phase 2C" section. The spec (sections 4.3 and 5.1 "as built"), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead. The test server needs, first: a category with a text channel that is a region (a row in `Region` with an outline, and a few gyms inside it; the invented gyms of `test/support/gyms.ts` can be inserted into the local database), and a channel named as `settings.channels['bot-lab']`.

- [ ] `npm run deploy-commands -- --guild <test server id>` registers `/help`, `/raid` and `/admin`. Members without Manage Server do not see `/admin`.
- [ ] Start the bot. The log shows `regions loaded`, `parties loaded`, `raid events read`, and no error.
- [ ] `/admin setup-forums` (as a member with an admin, moderator or bot developer role): a forum `<region>-raids` appears next to the region's channel with the twelve tags, and a pinned post "Active raids". Running it again answers "is ready" and changes nothing. The bot needs Manage Channels and Manage Threads for this.
- [ ] `/raid` in the region channel: the `boss` list shows the current bosses and the eggs; the `gym` list fills while typing, within three seconds. Reporting a T5 egg with `time:20` answers privately with a link; the post has the title `T5 egg · <gym>`, the tags Egg and T5, an embed with the hatch and end times shown in your own time zone, and you under Interested. A line "New raid: … →" appears in the region channel. The summary post lists the raid a few seconds later.
- [ ] `/raid` for the same gym again: "There is already a raid…", with the link.
- [ ] `/raid boss:yveltal gym:<part of a name that fits two gyms>`: a menu; choosing reports the raid. The boss's picture is the embed's thumbnail.
- [ ] `/raid` in a channel that is no region: "Use this in a region channel." `/raid` inside the forum and inside a post works.
- [ ] Delete a raid's post by hand, then report another raid in that region: the summary no longer lists the deleted one after the next change of it (it ends when the bot next tries to update it; the scheduler of plan 2D makes that prompt).
- [ ] An error after the private "thinking…" of `/raid` (for example `/raid boss:mewtwo gym:…`) is shown only to you.
- [ ] With `LOG_LEVEL=debug`, every command writes `interaction handled` with its duration.

## As built (2026-10-11)

Executed as commits `0b8b427`..`0efd6e7`. The nine task commits equal the code shown above. On top of them, from the reviews: `621be8f` (only a plain https address is kept as a picture), `259eddc` (lists share a field's room, the embed fits Discord's total, more text made plain), `8e51e6e` (the gateway: archived posts, the rename limit, a stricter fake), `f3d6c85` (the service: a report never leaves a raid without a post, the region a report came from, the first change shows at once), `0953e2d` (`/admin setup-forums`: regions by guild, a line per region also when one fails), `6ac4d92` (a typed boss is read as the member means it), `9c4f8de` (a Raid Day boss stays 30 minutes: Matt), `d2b8e09` and `164dde3` after the whole-branch review (a deleted first message is repaired, the rate-limit rejection narrowed, one place builds a post's message, unchanged posts are not edited; `/raid` details), and the last commit after the staging run (the summary is pinned again). The staging checklist above was run by the controller on the test server as far as it needs no clicking; its results and what is left for Matt are in "From Phase 2C" of `phase-0-follow-ups.md`. Where this text and the code differ, the code is right.
