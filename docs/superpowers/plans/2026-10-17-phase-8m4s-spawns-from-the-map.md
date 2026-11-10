# Phase 8M-4S: Spawns from the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member reports a wild Pokémon from a point of Pine's live map (a long press or right click, or "Report spawn here" in a gym's popup) with exactly what `/wild` does: its readers, refusals, words, throttle and DMs; the point becomes plan 8D's dropped pin.

**Architecture:** `/wild`'s logic is factored into `readSpawn` and `reportSpawnAs`, which the command and the web route share; `POST /api/spawns` is guarded as 8M-4's raid report, finds the regions holding the point, checks access to the region's forum and text channel, builds the pin with `PlaceFinder.pin`, then counts in `/wild`'s throttle; the page opens a held form (8M-4's `FormHold`).

**Tech Stack:** TypeScript 6.0, Fastify, Leaflet (all from 8M-1). No new package, no migration (the pin is the report's `near`), no command change (`/wild`'s behaviour is unchanged).

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` 3.5 and 3.8, amended by plan 8D (a spawn's place is a `Place`; a point dropped on the map a `DroppedPin`). Ledger: `.superpowers/sdd/2026-10-17-phase-8m4s-spawns-from-the-map/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m4s` (worktree `var/proto-8m4s`, rebased onto `wayfarer` 83aac19d), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check (7,121 tests), the build, the userscript build and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-17; ledger), for Matt to look at:

1. **The map's point is 8D's dropped pin** (named after the nearest place in the server's regions), not a separate point field.
2. **One code path with `/wild`**, in its own throttle bucket (five in half an hour); refusals of who, where and access come before the throttle, and so do `/wild`'s readers (as its guard reads them).
3. **The reporter is named as `/wild` names them** (spawns have no privacy setting). Whether a spawn's reporter should be hideable is Matt's call.
4. **Access:** the region's forum must not bar the member, and the member must not have an overwrite of their own denying View Channel on the region's text channel; a role's denial on the text channel is not looked at (as for raids).
5. **A report while the bot restarts answers 503** with `Retry-After`; other reports not made answer 422 in `/wild`'s words.
6. **Spawns are not drawn on the map** in this plan; "Report spawn here" is in gyms' popups (the map shows no Wayspots); a press outside every region says so at once.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md`, `notifications-and-dms.md` and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing from data reaches the page as HTML; nothing of a report's text or point reaches a log.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m4s`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **`/wild` behaves exactly as before** (words, refusals, throttle, DMs).
2. **The map is `/wild`:** the same bucket, readers and DMs; the pin named as `/wild near:` names one.
3. **Refusals cost nothing** and a refused POST never has its body read before `postGuard`.
4. **Access:** never into a region the member is kept out of by its forum or by their own overwrite on its text channel.
5. **The form:** held while filled in, one form at a time, the region picker following the server's answer.

---

### Task 1: Spawn reports: one code path for /wild and the map

Prototype commit: `ccdae95c5699942d8e7618ba526c0245b66f64a0`

`readSpawn` (the Pokémon, `appearsInWild` and the exceptions, details) in `wild.ts` and `reportSpawnAs` in `spawn-report.ts` (`SpawnService.report` and `/wild`'s words, names from a `SpawnNames`; a report not made thrown as `SpawnNotMade` with its kind); `/wild` calls them and behaves as before.

**Files:**

```
 src/commands/notifications/spawn-report.test.ts | 135 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/notifications/spawn-report.ts      | 111 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/notifications/wild.ts              | 112 ++++++++++++++++++++++++++++-------------------------
 3 files changed, 306 insertions(+), 52 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/notifications/spawn-report.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/notifications/spawn-report.test.ts src/commands/notifications/spawn-report.ts src/commands/notifications/wild.ts` and `npx eslint src/commands/notifications/spawn-report.test.ts src/commands/notifications/spawn-report.ts src/commands/notifications/wild.ts`.
- [ ] **Step 4: Check the transcription:** `git diff ccdae95c5699942d8e7618ba526c0245b66f64a0 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Spawn reports: one code path for /wild and the map`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/notifications/spawn-report.test.ts src/commands/notifications/spawn-report.ts src/commands/notifications/wild.ts`.

````diff
diff --git a/src/commands/notifications/spawn-report.test.ts b/src/commands/notifications/spawn-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a0b494ac161faee7afc2dfbbaa2aa2e94daf7a01
--- /dev/null
+++ b/src/commands/notifications/spawn-report.test.ts
@@ -0,0 +1,135 @@
+import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { textDisplays } from '../../../test/support/messages.js';
+import { ALICE, PARTY_NOW } from '../../../test/support/parties.js';
+import { partyServiceWith } from '../../../test/support/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { UserError } from '../../discord/errors.js';
+import { postLink } from '../../render/notify-dm.js';
+import {
+  DISCORD_SPAWN_NAMES,
+  reportSpawnAs,
+  SpawnNotMade,
+  type SpawnNames,
+} from './spawn-report.js';
+import { readSpawn } from './wild.js';
+
+/** How the live map names a report (not at all) and a channel (by its name). */
+const MAP_NAMES: SpawnNames = {
+  report: () => undefined,
+  channel: (channelId) => (channelId === WEST_CHANNEL ? '#west' : '#unknown'),
+};
+
+async function setup() {
+  const made = await partyServiceWith();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    spawns: made.spawns,
+    wants: made.wants,
+  });
+  const report = (names: SpawnNames, more: { pin?: boolean } = {}) =>
+    reportSpawnAs(
+      ctx,
+      {
+        guildId: made.gateway.guildId,
+        regionChannelId: WEST_CHANNEL,
+        read: readSpawn(ctx, 'dratini', ' by the fountain '),
+        iv: 'perfect',
+        reporter: { id: ALICE, name: 'Alice' },
+        ...(more.pin
+          ? { near: { kind: 'pin', lat: 40.02, lon: -80.02, near: null, linkName: null } }
+          : {}),
+      },
+      names,
+    );
+  return { ...made, ctx, report };
+}
+
+describe('the spawn report /wild and the live map share', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reads the Pokémon and the details as /wild does: trimmed, and refused in its words', async () => {
+    const { ctx } = await setup();
+    const read = readSpawn(ctx, 'Dratini', '  by the fountain ');
+    expect(read.entry.key).toBe('dratini');
+    expect(read.details).toBe('by the fountain');
+    expect(readSpawn(ctx, 'dratini', 'x'.repeat(300)).details).toHaveLength(200);
+    expect(() => readSpawn(ctx, 'mewtwo', 'by the fountain')).toThrow(
+      new UserError('**Mewtwo** does not appear in the wild.'),
+    );
+    expect(() => readSpawn(ctx, 'dratini', '   ')).toThrow(
+      new UserError('Say in `details` where the Pokémon is: a street corner, a park, a gym.'),
+    );
+    expect(() => readSpawn(ctx, 'dratini', null)).toThrow(UserError);
+  });
+
+  it('posts the report and answers with the words of /wild, its link as the caller names it', async () => {
+    const made = await setup();
+    const words = await made.report(DISCORD_SPAWN_NAMES);
+    const [posted] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(textDisplays(posted?.message)[1]).toBe('**Where**\nby the fountain');
+    expect(words).toBe(
+      'Reported: a wild Dratini with 100% IVs. ' +
+        `${postLink(made.gateway.guildId, WEST_CHANNEL, posted?.id ?? '')}\n` +
+        'The report is removed in 30 minutes.',
+    );
+    // The map links no report, and names a pin dropped on it as the member's.
+    expect(await made.report(MAP_NAMES, { pin: true })).toBe(
+      'Reported: a wild Dratini with 100% IVs at your pin.\nThe report is removed in 30 minutes.',
+    );
+  });
+
+  it('refuses in the words of /wild what came of a report that was not made, a channel as the caller names it', async () => {
+    const made = await setup();
+    made.gateway.failing.set(
+      'sendMessage',
+      new DiscordAPIError(
+        { code: RESTJSONErrorCodes.MissingPermissions, message: 'Missing Permissions' },
+        RESTJSONErrorCodes.MissingPermissions,
+        403,
+        'POST',
+        '/x',
+        {},
+      ),
+    );
+    // Each is told apart by its kind, so that the map can answer each as it should; each is a
+    // `UserError`, which /wild answers as any.
+    await expect(made.report(MAP_NAMES)).rejects.toThrow(
+      new SpawnNotMade(
+        'I am not allowed to post in #west, so the report was not made. Tell a moderator.',
+        'refused',
+      ),
+    );
+    await expect(made.report(DISCORD_SPAWN_NAMES)).rejects.toThrow(
+      new SpawnNotMade(
+        `I am not allowed to post in <#${WEST_CHANNEL}>, so the report was not made. Tell a moderator.`,
+        'refused',
+      ),
+    );
+    made.gateway.failing.delete('sendMessage');
+    made.gateway.gone.add(WEST_CHANNEL);
+    await expect(made.report(MAP_NAMES)).rejects.toThrow(
+      new SpawnNotMade(
+        'The channel of this region is gone, so I cannot post the report. Tell a moderator.',
+        'no-channel',
+      ),
+    );
+    made.gateway.gone.delete(WEST_CHANNEL);
+    await made.spawns.flush();
+    await expect(made.report(MAP_NAMES)).rejects.toThrow(
+      new SpawnNotMade(
+        'I am restarting just now, so the report was not made. Report it again in a minute.',
+        'closed',
+      ),
+    );
+    await expect(made.report(MAP_NAMES)).rejects.toBeInstanceOf(UserError);
+  });
+});
diff --git a/src/commands/notifications/spawn-report.ts b/src/commands/notifications/spawn-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9c1f6f1baed40e740ce27f96a9190aaac497c260
--- /dev/null
+++ b/src/commands/notifications/spawn-report.ts
@@ -0,0 +1,111 @@
+import type { AppContext } from '../../app-context.js';
+import { UserError } from '../../discord/errors.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import type { Place } from '../../domain/geo/place.js';
+import { postLink } from '../../render/notify-dm.js';
+import { IV_WORDS, SPAWN_MINUTES } from '../../render/spawn.js';
+import { plain, type NamedMember } from '../../render/text.js';
+import { placeWords } from '../place-option.js';
+
+/**
+ * Reporting a wild Pokémon as `/wild` and the live map (plan 8M-4S) share it: the report through
+ * `SpawnService` (`reportSpawnAs`), and the command's words for what came of it, a report and a
+ * channel named by the caller (`SpawnNames`). What both read first (the Pokémon and the details)
+ * is `readSpawn` of `wild.ts`.
+ */
+
+/** Said when the text channel of the region no longer exists. */
+export const CHANNEL_GONE =
+  'The channel of this region is gone, so I cannot post the report. Tell a moderator.';
+
+/** Said for a report that comes while the bot shuts down. */
+export const RESTARTING =
+  'I am restarting just now, so the report was not made. Report it again in a minute.';
+
+/**
+ * A report that was not made, in `/wild`'s words, and why (`kind`): the region's channel gone
+ * (`no-channel`), the bot not allowed to post there (`refused`), the bot shutting down
+ * (`closed`). A `UserError`, so `/wild` answers it as any; the map answers `closed` as a
+ * moment's unavailability (503) and the others as refusals.
+ */
+export class SpawnNotMade extends UserError {
+  override name = 'SpawnNotMade';
+
+  constructor(
+    message: string,
+    readonly kind: 'no-channel' | 'refused' | 'closed',
+  ) {
+    super(message);
+  }
+}
+
+/** What reporting needs: the spawn service. */
+export type SpawnReporting = Pick<AppContext, 'spawns'>;
+
+/**
+ * How an answer names the report and a region's channel: on Discord the report's link and a
+ * mention; on the map no report (undefined leaves the link out) and a channel by its name.
+ */
+export interface SpawnNames {
+  report(guildId: string, channelId: string, messageId: string): string | undefined;
+  channel(channelId: string): string;
+}
+
+export const DISCORD_SPAWN_NAMES: SpawnNames = {
+  report: (guildId, channelId, messageId) => postLink(guildId, channelId, messageId),
+  channel: (channelId) => `<#${channelId}>`,
+};
+
+/** A report whose Pokémon, details and region are known. */
+export interface SpawnReportRequest {
+  guildId: string;
+  /** The text channel of the region the report goes to. */
+  regionChannelId: string;
+  /** What `readSpawn` read: the Pokémon and the details. */
+  read: { entry: Pick<PokemonEntry, 'dex' | 'key' | 'name'>; details: string };
+  iv?: 'perfect' | 'zero' | undefined;
+  reporter: NamedMember;
+  /** Where it is: a place a member named (`/wild near:`) or a point of the map (a pin). */
+  near?: Place | undefined;
+}
+
+/**
+ * Reports the spawn as the member and gives the command's words for it: what was reported (the
+ * IVs and the place included: the member sees what was taken), the report's link as `names`
+ * gives it, and when it goes away. A report that was not made is thrown as a `SpawnNotMade` in
+ * the command's words.
+ */
+export async function reportSpawnAs(
+  ctx: SpawnReporting,
+  request: SpawnReportRequest,
+  names: SpawnNames,
+): Promise<string> {
+  const { guildId, regionChannelId, read, iv, near } = request;
+  const { entry } = read;
+  const outcome = await ctx.spawns.report({
+    guildId,
+    regionChannelId,
+    pokemon: { dex: entry.dex, key: entry.key, name: entry.name },
+    details: read.details,
+    iv,
+    reporter: request.reporter,
+    ...(near === undefined ? {} : { near }),
+  });
+  if (outcome.kind === 'no-channel') throw new SpawnNotMade(CHANNEL_GONE, 'no-channel');
+  if (outcome.kind === 'refused') {
+    throw new SpawnNotMade(
+      `I am not allowed to post in ${names.channel(regionChannelId)}, so the report was not ` +
+        'made. Tell a moderator.',
+      'refused',
+    );
+  }
+  if (outcome.kind === 'closed') throw new SpawnNotMade(RESTARTING, 'closed');
+  // The channel is named by the link alone: Discord shows a message link as its channel.
+  const ivs = iv === undefined ? '' : ` with ${IV_WORDS[iv]}`;
+  const place = near === undefined ? '' : ` ${placeWords(near)}`;
+  const link = names.report(guildId, outcome.channelId, outcome.messageId);
+  return (
+    `Reported: a wild ${plain(entry.name)}${ivs}${place}.${link === undefined ? '' : ` ${link}`}\n` +
+    `The report is removed in ${String(SPAWN_MINUTES)} minutes.`
+  );
+}
diff --git a/src/commands/notifications/wild.ts b/src/commands/notifications/wild.ts
index cf248305c617104ea6e3cca2966493588037f289..f3e5342360d14e0126ade7a11bfacde0d53afa6f 100644
--- a/src/commands/notifications/wild.ts
+++ b/src/commands/notifications/wild.ts
@@ -1,7 +1,7 @@
 import { SlashCommandBuilder } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Guard, SimpleCommand } from '../../discord/command.js';
-import { MAX_PLACE_TEXT, namedPlace, nearChoices, orList, placeWords } from '../place-option.js';
+import { MAX_PLACE_TEXT, namedPlace, nearChoices, orList } from '../place-option.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
@@ -10,27 +10,26 @@ import type { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
 import { appearsInWild, wildExceptions, type WildExceptions } from '../../domain/pogo/wild.js';
 import { searchTokens } from '../../domain/search/text.js';
-import { postLink } from '../../render/notify-dm.js';
-import { IV_WORDS, SPAWN_MINUTES } from '../../render/spawn.js';
+import { SPAWN_MINUTES } from '../../render/spawn.js';
 import { count, plain, truncate } from '../../render/text.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 import { answer } from '../../discord/late-reply.js';
+import { DISCORD_SPAWN_NAMES, reportSpawnAs } from './spawn-report.js';
 
 /** Where `/wild` works, said wherever it does not. */
 export const WILD_FROM_A_REGION =
   'Report a wild Pokémon from the channel of a region, its forum or a post there.';
 
-/** Said when the text channel of the region no longer exists. */
-export const CHANNEL_GONE =
-  'The channel of this region is gone, so I cannot post the report. Tell a moderator.';
+/** The name `/wild` is used and counted under, and the map's reports with it (plan 8M-4S). */
+export const WILD_COMMAND = 'wild';
 
-/** Said for a report that comes while the bot shuts down. */
-export const RESTARTING =
-  'I am restarting just now, so the report was not made. Report it again in a minute.';
+/** What reading a report's Pokémon needs: the game data, the settings and the Pokémon search. */
+export type WildReading = Pick<AppContext, 'gameData' | 'config' | 'log' | 'pokemon'>;
 
 /**
  * Five reports in half an hour (Matt, 2026-10-13): the legacy bot allowed 15 in a quarter of an
- * hour, which let one member send every wanter of a Pokémon that many direct messages.
+ * hour, which let one member send every wanter of a Pokémon that many direct messages. From
+ * Discord and from the live map together.
  */
 export const WILD_THROTTLE: Throttle = { uses: 5, perSeconds: 1800 };
 
@@ -75,7 +74,9 @@ const listKey = (listed: readonly string[]): string => JSON.stringify(listed);
  * once, as a warning, and ignored; and again for a catalogue that was not read yet (the game
  * data is refreshed while the bot runs).
  */
-export function wildExceptionsOf(ctx: AppContext): WildExceptions {
+export function wildExceptionsOf(
+  ctx: Pick<AppContext, 'gameData' | 'config' | 'log'>,
+): WildExceptions {
   const { catalogue } = ctx.gameData;
   const listed = ctx.config.settings.wildSpawnExceptions;
   let byList = readExceptions.get(catalogue);
@@ -98,7 +99,9 @@ export function wildExceptionsOf(ctx: AppContext): WildExceptions {
 }
 
 /** Whether an entry can be reported in this bot: `appearsInWild` with the settings' exceptions. */
-function wildIn(ctx: AppContext): (entry: PokemonEntry) => boolean {
+function wildIn(
+  ctx: Pick<AppContext, 'gameData' | 'config' | 'log'>,
+): (entry: PokemonEntry) => boolean {
   const { species } = wildExceptionsOf(ctx);
   return (entry) => appearsInWild(entry, species);
 }
@@ -139,7 +142,7 @@ function andList(names: readonly string[]): string {
  * typed. Text that names nothing outright is never guessed at: what it may have meant is only
  * suggested. One letter is too little to act on, as for `/raid`: it names a form of Unown.
  */
-export function wildPokemon(ctx: AppContext, value: string): PokemonEntry {
+export function wildPokemon(ctx: WildReading, value: string): PokemonEntry {
   const text = value.trim();
   const wild = wildIn(ctx);
   const picked = /^[a-z0-9_]+$/i.test(text)
@@ -161,6 +164,22 @@ export function wildPokemon(ctx: AppContext, value: string): PokemonEntry {
   );
 }
 
+/**
+ * A report's Pokémon and details as `/wild` and the live map read them, before anything is
+ * posted or counted: the Pokémon (`wildPokemon`), then the details, which must say something
+ * (`SAY_WHERE`; trimmed, cut to `MAX_DETAILS`). A refusal is thrown as a `UserError`.
+ */
+export function readSpawn(
+  ctx: WildReading,
+  pokemon: string,
+  details: string | null,
+): { entry: PokemonEntry; details: string } {
+  const entry = wildPokemon(ctx, pokemon);
+  const said = (details ?? '').trim();
+  if (said === '') throw new UserError(SAY_WHERE);
+  return { entry, details: truncate(said, MAX_DETAILS) };
+}
+
 /**
  * The choices for the `pokemon` option: what the search finds of what appears in the wild.
  * Nothing when the text names outright a Pokémon that does not: near misses of `Mewtwo` are
@@ -168,7 +187,7 @@ export function wildPokemon(ctx: AppContext, value: string): PokemonEntry {
  * without its preference for legendaries (`plain`), here and in the suggestions of a refusal:
  * of those only the exceptions of the settings are left, and they are not what is likelier met.
  */
-export function wildChoices(ctx: AppContext, typed: string): Choice[] {
+export function wildChoices(ctx: WildReading, typed: string): Choice[] {
   if (typed.trim() === '') return [];
   const wild = wildIn(ctx);
   const named = ctx.pokemon.exact(typed);
@@ -186,12 +205,14 @@ export function wildChoices(ctx: AppContext, typed: string): Choice[] {
 const requireSpawnReport: Guard = async (interaction, ctx) => {
   if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(WILD_FROM_A_REGION);
   if (interaction.isChatInputCommand()) {
-    wildPokemon(ctx, interaction.options.getString('pokemon', true));
-    // Not asked for as required: a client with the definition from before the option was
-    // required may send none, and that use is answered with the sentence like any other.
-    if ((interaction.options.getString('details') ?? '').trim() === '') {
-      throw new UserError(SAY_WHERE);
-    }
+    // `details` is not asked for as required: a client with the definition from before the
+    // option was required may send none, and that use is answered with the sentence like any
+    // other.
+    readSpawn(
+      ctx,
+      interaction.options.getString('pokemon', true),
+      interaction.options.getString('details'),
+    );
     await namedPlace(interaction, ctx, interaction.options.getString('near'));
   }
 };
@@ -207,7 +228,7 @@ const requireSpawnReport: Guard = async (interaction, ctx) => {
  */
 export const wildCommand: SimpleCommand = {
   data: new SlashCommandBuilder()
-    .setName('wild')
+    .setName(WILD_COMMAND)
     .setDescription('Report a wild Pokémon in this region')
     .addStringOption((option) =>
       option
@@ -276,40 +297,27 @@ export const wildCommand: SimpleCommand = {
   async execute(interaction, ctx) {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(WILD_FROM_A_REGION);
-    const entry = wildPokemon(ctx, interaction.options.getString('pokemon', true));
-    const details = (interaction.options.getString('details') ?? '').trim();
-    if (details === '') throw new UserError(SAY_WHERE);
+    const read = readSpawn(
+      ctx,
+      interaction.options.getString('pokemon', true),
+      interaction.options.getString('details'),
+    );
     const picked = interaction.options.getString('iv');
     const iv = IV_CHOICES.find((choice) => choice.value === picked)?.value;
     const place = await namedPlace(interaction, ctx, interaction.options.getString('near'));
-    const guildId = guildIdOf(interaction);
-    const outcome = await ctx.spawns.report({
-      guildId,
-      regionChannelId,
-      pokemon: { dex: entry.dex, key: entry.key, name: entry.name },
-      details: truncate(details, MAX_DETAILS),
-      iv,
-      reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
-      ...(place === undefined ? {} : { near: place }),
-    });
-    if (outcome.kind === 'no-channel') throw new UserError(CHANNEL_GONE);
-    if (outcome.kind === 'refused') {
-      throw new UserError(
-        `I am not allowed to post in <#${regionChannelId}>, so the report was not made. ` +
-          'Tell a moderator.',
-      );
-    }
-    if (outcome.kind === 'closed') throw new UserError(RESTARTING);
-    // What was reported, IVs included: the member sees whether the choice was taken. The
-    // channel is named by the link alone: Discord shows a message link as its channel.
-    const ivs = iv === undefined ? '' : ` with ${IV_WORDS[iv]}`;
-    const near = place === undefined ? '' : ` ${placeWords(place)}`;
-    await answer(interaction, {
-      content:
-        `Reported: a wild ${plain(entry.name)}${ivs}${near}. ` +
-        `${postLink(guildId, outcome.channelId, outcome.messageId)}\n` +
-        `The report is removed in ${String(SPAWN_MINUTES)} minutes.`,
-    });
+    const content = await reportSpawnAs(
+      ctx,
+      {
+        guildId: guildIdOf(interaction),
+        regionChannelId,
+        read,
+        iv,
+        reporter: { id: interaction.user.id, name: memberInfo(interaction).name },
+        near: place,
+      },
+      DISCORD_SPAWN_NAMES,
+    );
+    await answer(interaction, { content });
   },
 
   async autocomplete(interaction, ctx) {
````

### Task 2: Map spawns: the pick list and the report route

Prototype commit: `078fb1c4bdbf87a28f45d149d571a2928c7e2e97`

`GET /s/<guild>/api/wild-options` (members, ETag) and `POST /s/<guild>/api/spawns`: the per-address limit and `postGuard` before the body; the member checks; the regions holding the point (`regionsAtPoint`; none refused, several asked); the region's forum not barred and no own View Channel deny on its text channel (`ownViewDenied`); `/wild`'s readers; the pin from `PlaceFinder.pin`; then `/wild`'s throttle and `reportSpawnAs`; a restart answers 503 with `Retry-After`; nothing of the text or the point logged.

**Files:**

```
 src/app.ts                            |   5 +
 src/discord/party-gateway.test.ts     |  38 +++++++
 src/discord/party-gateway.ts          |  13 +++
 src/domain/web/spawn-data.ts          |  25 +++++
 src/services/region-directory.test.ts |  41 ++++++-
 src/services/region-directory.ts      |  18 ++++
 src/web/acting.ts                     |  43 ++++++++
 src/web/guild-routes.ts               |   4 +
 src/web/raid-routes.ts                |  31 ++----
 src/web/server.ts                     |   3 +
 src/web/spawn-report.test.ts          | 436 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/spawn-routes.ts               | 265 +++++++++++++++++++++++++++++++++++++++++++++
 src/web/wild-options.ts               |  20 ++++
 test/support/fake-gateway.ts          |  17 ++-
 test/support/web.ts                   |  33 ++++++
 15 files changed, 969 insertions(+), 23 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/discord/party-gateway.test.ts src/services/region-directory.test.ts src/web/spawn-report.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/web/spawn-data.ts src/services/region-directory.test.ts src/services/region-directory.ts src/web/acting.ts src/web/guild-routes.ts src/web/raid-routes.ts src/web/server.ts src/web/spawn-report.test.ts src/web/spawn-routes.ts src/web/wild-options.ts test/support/fake-gateway.ts test/support/web.ts` and `npx eslint src/app.ts src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/web/spawn-data.ts src/services/region-directory.test.ts src/services/region-directory.ts src/web/acting.ts src/web/guild-routes.ts src/web/raid-routes.ts src/web/server.ts src/web/spawn-report.test.ts src/web/spawn-routes.ts src/web/wild-options.ts test/support/fake-gateway.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 078fb1c4bdbf87a28f45d149d571a2928c7e2e97 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Map spawns: the pick list and the report route`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/web/spawn-data.ts src/services/region-directory.test.ts src/services/region-directory.ts src/web/acting.ts src/web/guild-routes.ts src/web/raid-routes.ts src/web/server.ts src/web/spawn-report.test.ts src/web/spawn-routes.ts src/web/wild-options.ts test/support/fake-gateway.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index fd3cf1aaa26e345cfbf8caf93de772c359cfe13e..9d48242a8eba1190241e5a89ee1273b9af020f02 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -839,6 +839,11 @@ export async function startApp(
       },
       // Reporting and changing raids on the map: what the raid commands read and call.
       raids: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
+      spawns: {
+        ctx,
+        channelName: (channelId) => partyGateway.channelName(channelId),
+        channels: partyGateway,
+      },
       now: () => Date.now(),
       log,
     });
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index 2d0f6929e9031abdb98d56b9996a08150eec9a3c..80cb0e2d2c73ee9a4cab38b5448f47aa92a9f5d0 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -4,6 +4,7 @@ import {
   MessageFlags,
   OverwriteType,
   PermissionFlagsBits,
+  PermissionsBitField,
   RESTJSONErrorCodes,
   RateLimitError,
   type Client,
@@ -674,3 +675,40 @@ describe('DiscordPartyGateway: edits of v2 messages', () => {
     expect(discord.conversions).toEqual([id]);
   });
 });
+
+describe('DiscordPartyGateway: an overwrite of a member that keeps them out of a channel', () => {
+  const ALICE = '300000000000000001';
+  const BOB = '300000000000000002';
+  const CAROL = '300000000000000003';
+
+  /** A region's text channel with Alice denied View Channel, Bob only Send Messages. */
+  function gatewayOver(fetch: () => Promise<unknown>) {
+    const gateway = new DiscordPartyGateway();
+    gateway.use({ channels: { fetch } } as unknown as Client);
+    return gateway;
+  }
+  const channel = {
+    isDMBased: () => false,
+    isThread: () => false,
+    permissionOverwrites: {
+      cache: new Map([
+        [ALICE, { type: OverwriteType.Member, deny: new PermissionsBitField(['ViewChannel']) }],
+        [BOB, { type: OverwriteType.Member, deny: new PermissionsBitField(['SendMessages']) }],
+      ]),
+    },
+  };
+
+  it('is true only for an overwrite of their own that denies View Channel', async () => {
+    const gateway = gatewayOver(() => Promise.resolve(channel));
+    await expect(gateway.ownViewDenied('c', ALICE)).resolves.toBe(true);
+    await expect(gateway.ownViewDenied('c', BOB)).resolves.toBe(false);
+    await expect(gateway.ownViewDenied('c', CAROL)).resolves.toBe(false);
+  });
+
+  it('is false for a channel that is gone, and passes on any other failure', async () => {
+    const gone = gatewayOver(() => Promise.reject(apiError(RESTJSONErrorCodes.UnknownChannel)));
+    await expect(gone.ownViewDenied('c', ALICE)).resolves.toBe(false);
+    const away = gatewayOver(() => Promise.reject(new Error('Discord is away')));
+    await expect(away.ownViewDenied('c', ALICE)).rejects.toThrow('Discord is away');
+  });
+});
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index f1f96d242b4cdfbd5c487138ef284a3e7740d6ec..ed1a8000bc8af73f47033f310abbe1c43643162f 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -192,6 +192,12 @@ export interface PartyGateway {
    * is not in its server.
    */
   memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
+  /**
+   * Whether a channel (a region's text channel) has a permission overwrite of the member's own
+   * that denies them View Channel: somebody keeps them out of it on purpose. Overwrites of
+   * their roles are not looked at. False when the channel is gone.
+   */
+  ownViewDenied(channelId: string, memberId: string): Promise<boolean>;
   /**
    * Lets a member into a forum with a permission overwrite of their own: see the forum, read
    * what was written, write in its posts (not that, when a role of theirs may not write there).
@@ -1057,6 +1063,13 @@ export class DiscordPartyGateway implements PartyGateway {
       : 'hidden';
   }
 
+  async ownViewDenied(channelId: string, memberId: string): Promise<boolean> {
+    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
+    if (!channel || channel.isDMBased() || channel.isThread()) return false;
+    const own = channel.permissionOverwrites.cache.get(memberId);
+    return own?.type === OverwriteType.Member && own.deny.has(PermissionFlagsBits.ViewChannel);
+  }
+
   /**
    * Whether the forum has an overwrite that denies a permission to a role the member holds;
    * `everybody` says whether the role everybody has counts.
diff --git a/src/domain/web/spawn-data.ts b/src/domain/web/spawn-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f3380f850455322af478fbd314777660f0f426f2
--- /dev/null
+++ b/src/domain/web/spawn-data.ts
@@ -0,0 +1,25 @@
+/**
+ * What the spawn reports of the live map answer (plan 8M-4S), as the page reads them. Types
+ * alone, with no import: the page's bundle (`src/web/client/`) takes them without the server's
+ * code.
+ */
+
+/**
+ * `GET /s/<guild>/api/wild-options`: every Pokémon `/wild` takes (those that appear in the wild,
+ * with the settings' exceptions), each as `[value, name]`: the value is what the report sends
+ * (the catalogue's key, as a choice of `/wild` has it), the name what the member picks by.
+ */
+export interface WildOptionsView {
+  pokemon: Array<[string, string]>;
+}
+
+/**
+ * `POST /s/<guild>/api/spawns` answers this (beside the few words of a failure, `{ error }`):
+ * whether the report was made, the words of `/wild` as text, and for a point that lies in several
+ * regions without one picked, the regions to pick from (by id, named as `/api/geo` names them).
+ */
+export interface SpawnAnswer {
+  ok: boolean;
+  text: string;
+  regions?: Array<{ id: number; name: string }>;
+}
diff --git a/src/services/region-directory.test.ts b/src/services/region-directory.test.ts
index 070f5fba9689b2ec0d1b72f09066ac0c42d9e6ef..949783a394e8d4cb80b0a66671abe63adeb70a14 100644
--- a/src/services/region-directory.test.ts
+++ b/src/services/region-directory.test.ts
@@ -9,7 +9,12 @@ import {
 } from '../../test/support/gyms.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import type { Region } from '../db/repositories/region-repository.js';
-import { gymInGuild, gymRegionsInGuild, RegionDirectory } from './region-directory.js';
+import {
+  gymInGuild,
+  gymRegionsInGuild,
+  RegionDirectory,
+  regionsAtPoint,
+} from './region-directory.js';
 
 function directory(list: () => Promise<Region[]> = () => Promise.resolve(testRegions())) {
   const { log, entries } = createTestLogger();
@@ -49,6 +54,40 @@ describe('gymRegionsInGuild', () => {
   });
 });
 
+describe('regionsAtPoint', () => {
+  const inWest = { lat: 40.05, lon: -80.05 };
+  const inEast = { lat: 40.05, lon: -79.95 };
+  /** An outline over West and East together. */
+  const both = testRegions()[0]!.bounds!.map((corner) => ({
+    ...corner,
+    lon: corner.lon === -80 ? -79.9 : corner.lon,
+  }));
+
+  it("gives this server's regions whose outlines hold the point, never another server's or one without an outline", () => {
+    const all: Region[] = [
+      { ...testRegions()[0]!, id: 9, guildId: 2, channelId: 'foreign-channel', bounds: both },
+      ...testRegions(),
+      { ...testRegions()[2]!, id: 8, channelId: 'outline-less-channel', bounds: null },
+    ];
+    expect(regionsAtPoint(all, 1, inWest).map((region) => region.id)).toEqual([1]);
+    expect(regionsAtPoint(all, 1, inEast).map((region) => region.id)).toEqual([2]);
+    expect(regionsAtPoint(all, 2, inEast).map((region) => region.id)).toEqual([9]);
+    expect(regionsAtPoint(all, 1, { lat: 41, lon: -81 })).toEqual([]);
+  });
+
+  it('takes the first row of a channel that has several, whether or not it holds the point', () => {
+    const all: Region[] = [
+      ...testRegions(),
+      // A later row of West's channel over both squares, and one of a new channel likewise.
+      { ...testRegions()[0]!, id: 7, bounds: both },
+      { ...testRegions()[0]!, id: 8, channelId: 'second-channel', bounds: both },
+    ];
+    expect(regionsAtPoint(all, 1, inWest).map((region) => region.id)).toEqual([1, 8]);
+    // West's first row does not hold a point of East: its later row is not asked.
+    expect(regionsAtPoint(all, 1, inEast).map((region) => region.id)).toEqual([2, 8]);
+  });
+});
+
 describe('RegionDirectory', () => {
   it('refuses to be read before it was loaded', () => {
     const { regions } = directory();
diff --git a/src/services/region-directory.ts b/src/services/region-directory.ts
index 21dc7f0684db686bbda8cc55fc8aae3f26832941..e636495f2d544ee26ca7c3110b350a8a3b71b7bc 100644
--- a/src/services/region-directory.ts
+++ b/src/services/region-directory.ts
@@ -1,4 +1,6 @@
 import type { Region } from '../db/repositories/region-repository.js';
+import type { LatLon } from '../domain/geo/lat-lon.js';
+import { ringContains } from '../domain/geo/region-membership.js';
 import type { Logger } from '../log.js';
 
 /** The part of `RegionRepository` the directory reads. */
@@ -35,6 +37,22 @@ export function gymInGuild(
   return gymRegionsInGuild(gyms, regions, gymId, guildId).length > 0;
 }
 
+/**
+ * The regions of a server whose outlines hold a point (a point of the live map, plan 8M-4S), in
+ * the order the regions are given (oldest first), one per channel (of several rows of one
+ * channel the first, as `gymsByRegion` counts them). A region without an outline holds nothing.
+ */
+export function regionsAtPoint<
+  R extends { guildId: number | null; channelId: string; bounds: readonly LatLon[] | null },
+>(regions: readonly R[], guildId: number, point: LatLon): R[] {
+  const channels = new Set<string>();
+  return regions.filter((region) => {
+    if (region.guildId !== guildId || channels.has(region.channelId)) return false;
+    channels.add(region.channelId);
+    return region.bounds !== null && ringContains(region.bounds, point);
+  });
+}
+
 /** What handlers need: the regions, from memory. */
 export interface RegionProvider {
   /** By row id. */
diff --git a/src/web/acting.ts b/src/web/acting.ts
index 650decdc6d72c766d65a1609346a078614605aeb..0c43be8092995eb99db2da46aa24ded4c6e9351a 100644
--- a/src/web/acting.ts
+++ b/src/web/acting.ts
@@ -64,6 +64,49 @@ export async function actingOnTheMap(
   return { member: acting.member, standing: acting.standing };
 }
 
+/**
+ * Whether somebody is a member who counts on the map, for a GET of a member's data (the pick
+ * lists of the forms): the member directory, kept a minute (403 for none, 503 while Discord
+ * cannot say); the answer already sent if not.
+ */
+export async function memberOrFailure(
+  deps: WebDeps,
+  request: FastifyRequest,
+  reply: FastifyReply,
+  guild: string,
+  userId: string,
+): Promise<FastifyReply | undefined> {
+  try {
+    if (!(await deps.members.find(guild, userId))) return sendFailure(request, reply, 403);
+  } catch (err) {
+    deps.log.warn(
+      { err, guild, user: userId },
+      'could not ask whether somebody on the web pages is a member',
+    );
+    return sendFailure(request, reply, 503);
+  }
+  return undefined;
+}
+
+/**
+ * Discord could not say how a member stands to a forum: nothing is written (503, logged with
+ * `doing`).
+ */
+export function unreachableOnTheMap(
+  deps: WebDeps,
+  reply: FastifyReply,
+  err: unknown,
+  guild: string,
+  userId: string,
+  doing: string,
+): FastifyReply {
+  deps.log.warn(
+    { err, guild, user: userId },
+    `could not ask Discord who ${doing} on the web pages`,
+  );
+  return reply.code(503).send({ error: UNREACHABLE });
+}
+
 /**
  * Whether a member is staff of the server on the map, as the commands' guards decide it
  * (`isManagement`: an admin or a moderator by role, or the bot's owner): staff may change any
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 015ad56c4ff874dfcddfd2b5efbdc84074a467ed..b6df1323fcba719c4e819c151c0cab398a051364 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -8,6 +8,7 @@ import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
 import { raidRoutes } from './raid-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import { spawnRoutes } from './spawn-routes.js';
 import type { WebDeps } from './server.js';
 
 /** The requests for a server's regions and gyms one address may make in a minute (spec 5). */
@@ -114,4 +115,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // Reporting and changing raids on the live map (plan 8M-4): for the same members.
   raidRoutes(scope, map);
+
+  // Reporting wild Pokémon on the live map (plan 8M-4S): for the same members.
+  spawnRoutes(scope, map);
 }
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 7b70e6a2793caa1f30af95028dbaad5311615427..f004d6baed19220334cbf6b47a1f199e581e1164 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -33,7 +33,13 @@ import {
   type RaidMovesView,
 } from '../domain/web/raid-options-data.js';
 import { gymRegionsInGuild } from '../services/region-directory.js';
-import { actingOnTheMap, isMapStaff, throttledOnTheMap, UNREACHABLE } from './acting.js';
+import {
+  actingOnTheMap,
+  isMapStaff,
+  memberOrFailure as mapMemberOrFailure,
+  throttledOnTheMap,
+  unreachableOnTheMap,
+} from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
@@ -224,32 +230,15 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     guild: string,
     userId: string,
     doing: string,
-  ) => {
-    deps.log.warn(
-      { err, guild, user: userId },
-      `could not ask Discord who ${doing} on the web pages`,
-    );
-    return reply.code(503).send({ error: UNREACHABLE });
-  };
+  ) => unreachableOnTheMap(deps, reply, err, guild, userId, doing);
 
   /** Whether somebody is a member who counts on the map, for a GET; the answer sent if not. */
-  const memberOrFailure = async (
+  const memberOrFailure = (
     request: FastifyRequest,
     reply: FastifyReply,
     guild: string,
     userId: string,
-  ): Promise<FastifyReply | undefined> => {
-    try {
-      if (!(await deps.members.find(guild, userId))) return sendFailure(request, reply, 403);
-    } catch (err) {
-      deps.log.warn(
-        { err, guild, user: userId },
-        'could not ask whether somebody on the web pages is a member',
-      );
-      return sendFailure(request, reply, 503);
-    }
-    return undefined;
-  };
+  ) => mapMemberOrFailure(deps, request, reply, guild, userId);
 
   /** The active raid of this server by id, as the store has it (an ended one is not there). */
   const activeRaid = async (guild: string, partyId: string) => {
diff --git a/src/web/server.ts b/src/web/server.ts
index 55e1f8ca44b2fd41f8b80d4be60c8858357ec017..0b394a2f7f82a88481f5c1d93911860af7b1e8e2 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -17,6 +17,7 @@ import { HASHED_NAME, type WebAssets } from './page.js';
 import type { PartyWebDeps } from './party-routes.js';
 import type { RaidWebDeps } from './raid-routes.js';
 import type { Sessions } from './sessions.js';
+import type { SpawnWebDeps } from './spawn-routes.js';
 
 /** `settings.web` once it is set. */
 export type WebSettings = NonNullable<Settings['web']>;
@@ -47,6 +48,8 @@ export interface WebDeps {
   parties: PartyWebDeps;
   /** Reporting and changing raids on the live map (plan 8M-4). */
   raids: RaidWebDeps;
+  /** Reporting wild Pokémon on the live map (plan 8M-4S). */
+  spawns: SpawnWebDeps;
   now: () => number;
   log: Logger;
 }
diff --git a/src/web/spawn-report.test.ts b/src/web/spawn-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..78b476ac147d8d35468e18fa7636a487afaa10b4
--- /dev/null
+++ b/src/web/spawn-report.test.ts
@@ -0,0 +1,436 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { dmSummary, textDisplays } from '../../test/support/messages.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { MemoryUsers } from '../../test/support/users.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  spawnWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { WILD_COMMAND, WILD_THROTTLE, wildCommand } from '../commands/notifications/wild.js';
+import type { UserSettings } from '../db/repositories/user-repository.js';
+import { InteractionRouter } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { pokemonTarget } from '../domain/pogo/notification-target.js';
+import { RaidPrivacy } from '../domain/party/status.js';
+import type { SpawnAnswer, WildOptionsView } from '../domain/web/spawn-data.js';
+import { UNREACHABLE } from './acting.js';
+
+const SPAWNS = `/s/${FAKE_GUILD_ID}/api/spawns`;
+const OPTIONS = `/s/${FAKE_GUILD_ID}/api/wild-options`;
+
+/** A point in West far from every gym: a pin dropped on the map, named by nothing. */
+const IN_WEST = { lat: 40.02, lon: -80.02 };
+/** A few metres from the Pinewood Public Library (The Stacks), gym 1 in West. */
+const AT_THE_STACKS = { lat: 40.0501, lon: -80.0501 };
+/** Outside every region of the server. */
+const NOWHERE = { lat: 41.5, lon: -81.5 };
+
+/**
+ * The map of a server with the party and spawn services of a test: Alice a member (in the
+ * directory, and fetched fresh as `Alice`), Bob too; the clock the parties' own; `settings`
+ * what members set; `exceptions` the settings' `wildSpawnExceptions`.
+ */
+async function reporting(
+  options: {
+    throttles?: Throttles;
+    settings?: Map<string, Partial<UserSettings>>;
+    exceptions?: string[];
+  } = {},
+) {
+  const throttles = options.throttles ?? new Throttles();
+  const made = await partyServiceWith();
+  const base = createTestContext({}).ctx.config;
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    spawns: made.spawns,
+    wants: made.wants,
+    users: new MemoryUsers(options.settings),
+    ...(options.exceptions
+      ? {
+          config: {
+            ...base,
+            settings: { ...base.settings, wildSpawnExceptions: options.exceptions },
+          },
+        }
+      : {}),
+  });
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'valor').add(BOB, 'Bob');
+  const names = new Map([
+    [WEST_CHANNEL, 'west'],
+    [EAST_CHANNEL, 'east'],
+  ]);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    spawns: spawnWebWith(ctx, { channelName: (id) => names.get(id), channels: made.gateway }),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const report = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: SPAWNS,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<SpawnAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  /** The reports that stand in a region's channel. */
+  const reports = (channelId = WEST_CHANNEL) => made.gateway.messagesIn(channelId);
+  return { made, ctx, web, acting, members, headers, report, reports, throttles };
+}
+
+describe('reporting a wild Pokémon on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("reports at the point as /wild does: as the member, the point as a pin, the command's words, and who wants it is told", async () => {
+    const map = await reporting();
+    web = map.web;
+    await map.made.wants.set(BOB, map.made.gateway.guildId, pokemonTarget(147), 'both');
+    const answer = await map.report({
+      pokemon: 'dratini',
+      details: ' by the fountain ',
+      ...IN_WEST,
+    });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toEqual({
+      ok: true,
+      text: 'Reported: a wild Dratini at your pin.\nThe report is removed in 30 minutes.',
+    });
+    const [posted] = map.reports();
+    const shown = textDisplays(posted?.message);
+    expect(shown[0]).toMatch(
+      new RegExp(`^### Wild Dratini\\nReported by \\*\\*Alice\\*\\* \\(<@${ALICE}>\\)`),
+    );
+    expect(shown[1]).toBe(
+      '**Where**\nby the fountain\n📍 Dropped pin · ' +
+        '[Map](<https://www.google.com/maps/search/?api=1&query=40.02%2C-80.02>)',
+    );
+    await map.made.notify.flush();
+    expect(map.made.dms.to(BOB).map((message) => dmSummary(message))).toEqual([
+      [`A wild **Dratini** has been reported in <#${WEST_CHANNEL}> by **Alice**.`, 'Dratini'],
+    ]);
+  });
+
+  it('names a point by the place it is near, takes the IVs, and keeps six decimals of the point', async () => {
+    const map = await reporting();
+    web = map.web;
+    const answer = await map.report({
+      pokemon: 'Gastly',
+      details: 'by the steps',
+      iv: 'perfect',
+      lat: AT_THE_STACKS.lat + 0.0000004,
+      lon: AT_THE_STACKS.lon,
+    });
+    expect(answer.json.text).toBe(
+      'Reported: a wild Gastly with 100% IVs near The Stacks.\nThe report is removed in 30 minutes.',
+    );
+    expect(textDisplays(map.reports()[0]?.message)[1]).toBe(
+      '**Where**\nby the steps\n📍 Near **The Stacks** (gym) · ' +
+        '[Map](<https://www.google.com/maps/search/?api=1&query=40.0501%2C-80.0501>)',
+    );
+  });
+
+  it("refuses a point in no region of the server in /wild's words, counting nothing", async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles });
+    web = map.web;
+    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...NOWHERE });
+    expect(answer.status).toBe(422);
+    expect(answer.json).toEqual({
+      ok: false,
+      text: 'That pin is not in a region of this server. Give a place in the regions here.',
+    });
+    expect(map.reports()).toEqual([]);
+    expect(throttles.size).toBe(0);
+  });
+
+  it('reports a point that lies in one region there, whatever region the body names', async () => {
+    const map = await reporting();
+    web = map.web;
+    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST, region: 2 });
+    expect(answer.status).toBe(200);
+    expect(map.reports(WEST_CHANNEL)).toHaveLength(1);
+    expect(map.reports(EAST_CHANNEL)).toEqual([]);
+  });
+
+  it('asks which region of a point that lies in several, and reports into the one picked', async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles });
+    web = map.web;
+    // East reaches into West here.
+    const east = map.made.regions.rows.find((region) => region.id === 2);
+    if (east?.bounds) {
+      east.bounds = east.bounds.map((corner) => ({
+        ...corner,
+        lon: corner.lon === -80 ? -80.05 : corner.lon,
+      }));
+    }
+    const asked = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(asked.status).toBe(422);
+    expect(asked.json).toEqual({
+      ok: false,
+      text: 'This point lies in several regions: pick the one to report the spawn in.',
+      regions: [
+        { id: 1, name: 'west' },
+        { id: 2, name: 'east' },
+      ],
+    });
+    expect(throttles.size).toBe(0);
+    // A region the point does not lie in is no answer.
+    expect(
+      (await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST, region: 3 })).status,
+    ).toBe(422);
+    const picked = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST, region: 2 });
+    expect(picked.status).toBe(200);
+    expect(map.reports(EAST_CHANNEL)).toHaveLength(1);
+    expect(map.reports(WEST_CHANNEL)).toEqual([]);
+  });
+
+  it("refuses what never appears in the wild and details that say nothing in /wild's words, counting nothing; the settings' exceptions are taken", async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles, exceptions: ['Articuno'] });
+    web = map.web;
+    const mewtwo = await map.report({ pokemon: 'mewtwo', details: 'here', ...IN_WEST });
+    expect(mewtwo.status).toBe(422);
+    expect(mewtwo.json).toEqual({ ok: false, text: 'Mewtwo does not appear in the wild.' });
+    // The lake trio is no exception in these settings.
+    expect((await map.report({ pokemon: 'uxie', details: 'here', ...IN_WEST })).json.text).toBe(
+      'Uxie does not appear in the wild.',
+    );
+    const blank = await map.report({ pokemon: 'dratini', details: '   ', ...IN_WEST });
+    expect(blank.status).toBe(422);
+    expect(blank.json.text).toBe(
+      'Say in details where the Pokémon is: a street corner, a park, a gym.',
+    );
+    expect(throttles.size).toBe(0);
+    expect(map.reports()).toEqual([]);
+    expect((await map.report({ pokemon: 'articuno', details: 'here', ...IN_WEST })).status).toBe(
+      200,
+    );
+    expect(map.reports()).toHaveLength(1);
+  });
+
+  it("refuses a member kept out of the region's forum, before anything is counted, and while Discord cannot say", async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles });
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
+      403,
+    );
+    map.made.gateway.barred.delete(WEST_FORUM);
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    const away = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(away.status).toBe(503);
+    expect(away.json).toEqual({ error: UNREACHABLE });
+    map.made.gateway.failing.delete('memberAccess');
+    map.acting.holdBack(ALICE, 'timed-out');
+    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).json).toEqual({
+      error: 'You are timed out in this server, so you cannot do that now.',
+    });
+    map.acting.remove(ALICE);
+    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
+      403,
+    );
+    expect(throttles.size).toBe(0);
+    expect(map.reports()).toEqual([]);
+  });
+
+  it("refuses a member kept out of the region's channel by an overwrite of their own, with a forum and without one, and while Discord cannot say", async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles });
+    web = map.web;
+    map.made.gateway.ownViewDenials.set(WEST_CHANNEL, new Set([ALICE]));
+    const kept = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(kept.status).toBe(403);
+    // West without a forum: its channel still keeps Alice out.
+    const west = map.made.regions.rows.find((region) => region.id === 1);
+    if (west) west.forumChannelId = null;
+    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
+      403,
+    );
+    map.made.gateway.failing.set('ownViewDenied', new Error('Discord is away'));
+    const away = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(away.status).toBe(503);
+    expect(away.json).toEqual({ error: UNREACHABLE });
+    map.made.gateway.failing.delete('ownViewDenied');
+    expect(throttles.size).toBe(0);
+    expect(map.reports()).toEqual([]);
+    // Bob has no such overwrite; nor has Alice in East.
+    const bob = await map.web.posting(BOB, 'Bob');
+    expect(
+      (await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST }, bob)).status,
+    ).toBe(200);
+    expect(
+      (await map.report({ pokemon: 'dratini', details: 'here', lat: 40.05, lon: -79.95 })).status,
+    ).toBe(200);
+  });
+
+  it('shares the limit of /wild: a report on the map counts, and /wild is refused after it', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < WILD_THROTTLE.uses - 1; n++) {
+      throttles.use(WILD_COMMAND, ALICE, WILD_THROTTLE, PARTY_NOW);
+    }
+    const map = await reporting({ throttles });
+    web = map.web;
+    expect((await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST })).status).toBe(
+      200,
+    );
+    const over = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(over.status).toBe(429);
+    expect(over.json).toEqual({ error: 'You can use /wild again in 30 minutes.' });
+    expect(over.headers['retry-after']).toBe('1800');
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+    const router = new InteractionRouter(map.ctx, [wildCommand], [], {
+      throttles,
+      now: () => PARTY_NOW,
+    });
+    const used = fakeChatInput({
+      commandName: 'wild',
+      channelId: WEST_CHANNEL,
+      userId: ALICE,
+      options: { pokemon: 'dratini', details: 'by the fountain' },
+    });
+    await router.handle(used as never);
+    expect(sent(used.reply).content).toBe('You can use /wild again in 30 minutes.');
+    expect(map.reports()).toHaveLength(1);
+  });
+
+  it('names the reporter in the report as /wild does, by the name Discord has now, and nobody in its answer', async () => {
+    const map = await reporting({
+      settings: new Map([[ALICE, { raidPrivacy: RaidPrivacy.Anonymous }]]),
+    });
+    web = map.web;
+    // Renamed since the session began: the report names the member as Discord has them now.
+    map.acting.add(ALICE, 'Alicia');
+    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(textDisplays(map.reports()[0]?.message)[0]).toContain(
+      `Reported by **Alicia** (<@${ALICE}>)`,
+    );
+    const everything = JSON.stringify(answer.json);
+    for (const text of ['Alice', 'Alicia', ALICE]) expect(everything).not.toContain(text);
+  });
+
+  it("says in /wild's words that the region's channel refuses the report, naming the channel", async () => {
+    const map = await reporting();
+    web = map.web;
+    map.made.gateway.gone.add(WEST_CHANNEL);
+    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(answer.status).toBe(422);
+    expect(answer.json).toEqual({
+      ok: false,
+      text: 'The channel of this region is gone, so I cannot post the report. Tell a moderator.',
+    });
+  });
+
+  it('answers a report that comes while the bot restarts as unavailable for a minute (503), not as a refusal', async () => {
+    const map = await reporting();
+    web = map.web;
+    await map.made.spawns.flush();
+    const answer = await map.report({ pokemon: 'dratini', details: 'here', ...IN_WEST });
+    expect(answer.status).toBe(503);
+    expect(answer.headers['retry-after']).toBe('60');
+    expect(answer.json).toEqual({
+      error: 'I am restarting just now, so the report was not made. Report it again in a minute.',
+    });
+    expect(map.reports()).toEqual([]);
+    const logged = map.web.entries.find((entry) => entry.msg === 'a spawn was reported on the map');
+    expect(logged).toMatchObject({ user: ALICE, region: 1, outcome: 'closed' });
+  });
+
+  it('refuses a malformed body (400), and without the CSRF token (403)', async () => {
+    const map = await reporting();
+    web = map.web;
+    const good = { pokemon: 'dratini', details: 'here', ...IN_WEST };
+    expect((await map.report({ ...good, lat: '40.02' })).status).toBe(400);
+    expect((await map.report({ ...good, lat: 91 })).status).toBe(400);
+    expect((await map.report({ ...good, extra: true })).status).toBe(400);
+    expect((await map.report({ ...good, details: 'x'.repeat(201) })).status).toBe(400);
+    expect((await map.report({ ...good, iv: 'shiny' })).status).toBe(400);
+    expect((await map.report({ ...good, pokemon: '' })).status).toBe(400);
+    const { 'x-pine-csrf': _token, ...withoutToken } = map.headers;
+    expect((await map.report(good, withoutToken)).status).toBe(403);
+    expect(map.reports()).toEqual([]);
+  });
+
+  it('logs a report as a command is logged: who, where, what came of it; never a text', async () => {
+    const map = await reporting();
+    web = map.web;
+    const answer = await map.report({ pokemon: 'dratini', details: 'by the fountain', ...IN_WEST });
+    const logged = map.web.entries.find((entry) => entry.msg === 'a spawn was reported on the map');
+    expect(logged).toMatchObject({
+      user: ALICE,
+      guild: FAKE_GUILD_ID,
+      region: 1,
+      outcome: 'posted',
+    });
+    const everything = JSON.stringify(map.web.entries);
+    for (const text of [answer.json.text, 'by the fountain', 'Alice', '40.02']) {
+      expect(everything).not.toContain(text);
+    }
+  });
+});
+
+describe('the Pokémon a member may report on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('lists what /wild takes, with the settings’ exceptions, for members only, kept by its ETag', async () => {
+    const map = await reporting();
+    web = map.web;
+    const asked = (cookie?: string, etag?: string) =>
+      map.web.app.inject({
+        method: 'GET',
+        url: OPTIONS,
+        headers: {
+          ...(cookie === undefined ? {} : { cookie }),
+          ...(etag === undefined ? {} : { 'if-none-match': etag }),
+        },
+      });
+    expect((await asked()).statusCode).toBe(401);
+    expect((await asked(await map.web.loggedIn('300000000000000099', 'Eve'))).statusCode).toBe(403);
+    const cookie = await map.web.loggedIn(ALICE, 'Alice');
+    const answer = await asked(cookie);
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const { pokemon } = answer.json<WildOptionsView>();
+    const keys = new Set(pokemon.map(([key]) => key));
+    expect(pokemon).toContainEqual(['dratini', 'Dratini']);
+    expect(pokemon).toContainEqual(['rattata_alola', 'Alolan Rattata']);
+    for (const key of ['uxie', 'mesprit', 'azelf']) expect(keys.has(key)).toBe(true);
+    for (const key of ['mewtwo', 'mew', 'kartana', 'kyogre_primal', 'charizard_mega_x']) {
+      expect(keys.has(key)).toBe(false);
+    }
+    const again = await asked(cookie, String(answer.headers.etag));
+    expect(again.statusCode).toBe(304);
+    // While Discord cannot say who is a member, nobody gets the list.
+    map.members.failing = new Error('Discord is away');
+    const away = await asked(cookie);
+    expect(away.statusCode).toBe(503);
+    expect(away.json()).toEqual({ error: 'Not available just now. Try again in a moment.' });
+  });
+});
diff --git a/src/web/spawn-routes.ts b/src/web/spawn-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..36739495673c0d914d452d5905746354d188a77e
--- /dev/null
+++ b/src/web/spawn-routes.ts
@@ -0,0 +1,265 @@
+import type { FastifyInstance } from 'fastify';
+import { z } from 'zod';
+import type { AppContext } from '../app-context.js';
+import { PIN_NOT_HERE } from '../commands/place-option.js';
+import {
+  reportSpawnAs,
+  SpawnNotMade,
+  type SpawnNames,
+  type SpawnReporting,
+} from '../commands/notifications/spawn-report.js';
+import {
+  MAX_DETAILS,
+  readSpawn,
+  WILD_COMMAND,
+  WILD_THROTTLE,
+  wildExceptionsOf,
+  type WildReading,
+} from '../commands/notifications/wild.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import type { PartyGateway } from '../discord/party-gateway.js';
+import { UserError } from '../discord/errors.js';
+import type { WildExceptions } from '../domain/pogo/wild.js';
+import type { SpawnAnswer } from '../domain/web/spawn-data.js';
+import { regionsAtPoint } from '../services/region-directory.js';
+import {
+  actingOnTheMap,
+  memberOrFailure,
+  throttledOnTheMap,
+  unreachableOnTheMap,
+} from './acting.js';
+import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
+import { etagMatches, etagOf } from './geo-cache.js';
+import type { GuildRequest } from './guild-routes.js';
+import { pageWords } from './page-words.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+import { wildOptions } from './wild-options.js';
+
+/** The requests for the pick list one address may make in a minute (a form asks once). */
+const OPTIONS_PER_MINUTE = 30;
+
+/** The spawn reports one address may send in a minute, whoever sends them. */
+export const SPAWN_WRITES_PER_ADDRESS_MINUTE = 30;
+
+/**
+ * What reporting a spawn on the map reads and calls (plan 8M-4S): exactly what `/wild` uses (the
+ * game data, the settings' exceptions, the Pokémon search, the spawn service), the regions the
+ * point may lie in, and the place finder that names the point as a pin.
+ */
+export type SpawnWebContext = WildReading &
+  SpawnReporting &
+  Pick<AppContext, 'placeFinder' | 'regions'>;
+
+/** What the spawn reports of the live map need beyond the parties' own (`PartyWebDeps`). */
+export interface SpawnWebDeps {
+  ctx: SpawnWebContext;
+  /** A channel's name as the bot sees it now: a region's, which an answer names. */
+  channelName(channelId: string): string | undefined;
+  /** Whether an overwrite of the member's own keeps them out of a region's channel. */
+  channels: Pick<PartyGateway, 'ownViewDenied'>;
+}
+
+/**
+ * The body of a report: the Pokémon as `/wild` takes it (a value of the pick list, or typed), the
+ * details (required as in `/wild`: blanks are refused in its words, so they are no malformed
+ * body), the IVs when checked, the point (latitude and longitude, kept to six decimals), and the
+ * region when the point lies in several. Anything else is malformed.
+ */
+const spawnBodySchema = z
+  .object({
+    pokemon: z.string().trim().min(1).max(100),
+    details: z.string().max(MAX_DETAILS),
+    iv: z.enum(['perfect', 'zero']).optional(),
+    lat: z.number().min(-90).max(90),
+    lon: z.number().min(-180).max(180),
+    region: z.number().int().positive().optional(),
+  })
+  .strict();
+
+/** How long a report that came while the bot shut down asks the page to wait (`Retry-After`). */
+const RESTART_RETRY_SECONDS = 60;
+
+/** What a report answers for a point that lies in several regions without one picked. */
+export const SEVERAL_REGIONS_HERE =
+  'This point lies in several regions: pick the one to report the spawn in.';
+
+/** A coordinate to six decimals (about 10 cm), as the page sends it and the map shows places. */
+const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
+
+/** The pick list's JSON and ETag, by the exceptions read against a catalogue (each its own). */
+const optionsCache = new WeakMap<WildExceptions, { body: string; etag: string }>();
+
+/**
+ * Wild Pokémon on the live map (spec 3.5, 3.8): the pick list of a report for members of the
+ * server (`/s/<guild>/api/wild-options`: `wildOptions`, kept per catalogue and settings, an ETag
+ * of its JSON, `private, no-cache`, 304 when the page has it), and a report at a point
+ * (`POST /s/<guild>/api/spawns`), which is `/wild` as the member: the same readers, the same
+ * report, the same throttle, the command's words.
+ */
+export function spawnRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { sessions, spawns, parties } = deps;
+  const { ctx } = spawns;
+
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
+  /** A region as an answer names it: its channel's name, or its number where the bot sees none. */
+  const regionName = (region: Pick<Region, 'id' | 'channelId'>): string =>
+    spawns.channelName(region.channelId) ?? `Region ${region.id}`;
+
+  /** How the map's answers name a report (not at all) and a region's channel (`#west`). */
+  const names: SpawnNames = {
+    report: () => undefined,
+    channel: (channelId) => {
+      const seen = spawns.channelName(channelId);
+      if (seen !== undefined) return `#${seen}`;
+      const region = ctx.regions.byChannel(channelId);
+      return region ? `Region ${region.id}` : '#unknown';
+    },
+  };
+
+  const optionsLimiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/wild-options',
+    { onRequest: limitedPerAddress(optionsLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const refused = await memberOrFailure(
+        deps,
+        request,
+        reply,
+        request.params.guild,
+        session.userId,
+      );
+      if (refused) return refused;
+      const exceptions = wildExceptionsOf(ctx);
+      let kept = optionsCache.get(exceptions);
+      if (!kept) {
+        const body = JSON.stringify(wildOptions(ctx.gameData.catalogue, exceptions.species));
+        kept = { body, etag: etagOf(body) };
+        optionsCache.set(exceptions, kept);
+      }
+      void reply.header('etag', kept.etag);
+      if (etagMatches(request.headers['if-none-match'], kept.etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(kept.body);
+    },
+  );
+
+  // A report (spec 3.8): before the body is read (`onRequest`), at most
+  // `SPAWN_WRITES_PER_ADDRESS_MINUTE` from one address and the guard of every POST (Origin,
+  // session, CSRF token). Then who reports (`actingOnTheMap`), where: the regions of this server
+  // the point lies in (none: refused as `/wild` refuses a pin outside them; several: asked which,
+  // with the regions), how the member stands to the forum of the region picked (barred 403, as
+  // for a raid there) and to its channel (an overwrite of their own that denies View Channel
+  // 403); then `/wild`'s readers (the Pokémon, the details) and the pin, as its guard reads them,
+  // and only then `/wild`'s throttle in its own window, so that a report refused for who
+  // reports, where or what is not counted; then `/wild`'s report as the member
+  // (`reportSpawnAs`), the point as a pin, and the command's words (the bot shutting down 503
+  // with `Retry-After`, the other reports not made 422).
+  const writeLimiter = new RateLimiter({ uses: SPAWN_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const writeGuards = [
+    limitedPerAddress(writeLimiter, { now: deps.now }),
+    postGuard(sessions, deps.settings.publicUrl),
+  ];
+  scope.post('/api/spawns', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = spawnBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const doing = 'reported a spawn';
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting.sent;
+    const refusal = (text: string) => {
+      const refused: SpawnAnswer = { ok: false, text: words(text) };
+      return reply.code(422).send(refused);
+    };
+    const row = await parties.guilds.idFor(guild);
+    const point = { lat: sixDecimals(body.data.lat), lon: sixDecimals(body.data.lon) };
+    const lying = row === undefined ? [] : regionsAtPoint(ctx.regions.all(), row, point);
+    const [first] = lying;
+    if (row === undefined || first === undefined) return refusal(PIN_NOT_HERE);
+    const picked =
+      lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
+    if (picked === undefined) {
+      const ask: SpawnAnswer = {
+        ok: false,
+        text: SEVERAL_REGIONS_HERE,
+        regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
+      };
+      return reply.code(422).send(ask);
+    }
+    try {
+      const forum = picked.forumChannelId;
+      if (forum !== null && (await parties.forums.memberAccess(forum, userId)) === 'barred') {
+        return sendFailure(request, reply, 403);
+      }
+      // The report goes into the region's channel: somebody kept out of it by an overwrite of
+      // their own is not to post there from the map (a role's denial is not looked at).
+      if (await spawns.channels.ownViewDenied(picked.channelId, userId)) {
+        return sendFailure(request, reply, 403);
+      }
+    } catch (err) {
+      return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
+    }
+    let read: ReturnType<typeof readSpawn>;
+    try {
+      read = readSpawn(ctx, body.data.pokemon, body.data.details);
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      return refusal(err.message);
+    }
+    const pin = ctx.placeFinder.pin(row, point, null);
+    if (!pin) return refusal(PIN_NOT_HERE);
+    const throttled = throttledOnTheMap(
+      deps,
+      reply,
+      { command: WILD_COMMAND },
+      userId,
+      WILD_THROTTLE,
+    );
+    if (throttled) return throttled;
+    let text: string;
+    try {
+      text = await reportSpawnAs(
+        ctx,
+        {
+          guildId: guild,
+          regionChannelId: picked.channelId,
+          read,
+          iv: body.data.iv,
+          reporter: { id: userId, name: acting.member.name },
+          near: pin,
+        },
+        names,
+      );
+    } catch (err) {
+      if (!(err instanceof SpawnNotMade)) throw err;
+      const closed = err.kind === 'closed';
+      deps.log.info(
+        { user: userId, guild, region: picked.id, outcome: closed ? 'closed' : 'not-made' },
+        'a spawn was reported on the map',
+      );
+      // The bot shutting down is no refusal: the page may try again once it is back.
+      if (closed) {
+        return reply
+          .code(503)
+          .header('retry-after', String(RESTART_RETRY_SECONDS))
+          .send({ error: words(err.message) });
+      }
+      return refusal(err.message);
+    }
+    deps.log.info(
+      { user: userId, guild, region: picked.id, outcome: 'posted' },
+      'a spawn was reported on the map',
+    );
+    const answer: SpawnAnswer = { ok: true, text: words(text) };
+    return answer;
+  });
+}
diff --git a/src/web/wild-options.ts b/src/web/wild-options.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5dc69ff77a0930e10891253c07942dae8ebc9775
--- /dev/null
+++ b/src/web/wild-options.ts
@@ -0,0 +1,20 @@
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import { appearsInWild } from '../domain/pogo/wild.js';
+import type { WildOptionsView } from '../domain/web/spawn-data.js';
+
+/**
+ * The pick list of a spawn report on the map (spec 3.8): every entry of the catalogue `/wild`
+ * takes (`appearsInWild` with the settings' exceptions, `exceptions`: the species of
+ * `wildExceptionsOf`), a form as that form, in the catalogue's order, each as its key and name.
+ * Pure.
+ */
+export function wildOptions(
+  catalogue: Pick<PokemonCatalogue, 'all'>,
+  exceptions: ReadonlySet<string>,
+): WildOptionsView {
+  return {
+    pokemon: catalogue.all
+      .filter((entry) => appearsInWild(entry, exceptions))
+      .map((entry): [string, string] => [entry.key, entry.name]),
+  };
+}
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index e6493793897e0ef163f5a8c239a655e9deb87b51..13f71737aa12f86750c0b494b718760a86f75174 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -178,7 +178,7 @@ interface V2Component {
  * overwrites `admitMember` made, `barred` those with which somebody keeps a member out (by an
  * overwrite of the member's own, or of a role of theirs): `dismissMember` leaves such a member
  * alone and answers false. `memberAccess` only looks (in discord.js it reads the cache), so it
- * is not listed in `calls`.
+ * is not listed in `calls`; nor is `ownViewDenied`, which answers by `ownViewDenials`.
  *
  * A server has the channels a test gives it (`addChannel`) and those created through the
  * gateway, which refuses as Discord does: without Manage Channels (`noCreating`), a name that
@@ -311,6 +311,11 @@ export class FakePartyGateway implements PartyGateway {
    * overwrite into a bar is: remove from `admitted`, add here.
    */
   readonly barred = new Map<string, Set<string>>();
+  /**
+   * By channel (a region's text channel): the members an overwrite of their own denies View
+   * Channel (`ownViewDenied`).
+   */
+  readonly ownViewDenials = new Map<string, Set<string>>();
   /** Members who are no longer in the server. */
   readonly leftServer = new Set<string>();
   /** The server of every channel (the fakes' `FAKE_GUILD_ID`). */
@@ -1070,6 +1075,16 @@ export class FakePartyGateway implements PartyGateway {
     );
   }
 
+  ownViewDenied(channelId: string, memberId: string): Promise<boolean> {
+    return this.attempt(
+      'ownViewDenied',
+      channelId,
+      () =>
+        !this.gone.has(channelId) && (this.ownViewDenials.get(channelId)?.has(memberId) ?? false),
+      false,
+    );
+  }
+
   admitMember(forumId: string, memberId: string) {
     return this.attempt('admitMember', `${forumId} ${memberId}`, () => {
       if (!this.forums.has(forumId) || this.gone.has(forumId)) return false;
diff --git a/test/support/web.ts b/test/support/web.ts
index c901e38d65378ef57a439dcf00dd64165998e9e7..d1660f7e41d9c2451272d0f53c8fbd1f5204700f 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -17,6 +17,7 @@ import { LoginLinks } from '../../src/web/login-links.js';
 import type { WebAssets } from '../../src/web/page.js';
 import type { ActingAnswer, ActingMembers, PartyWebDeps } from '../../src/web/party-routes.js';
 import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
+import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
@@ -279,6 +280,35 @@ const NO_RAIDS: RaidWebDeps = {
   channelName: () => undefined,
 };
 
+/**
+ * Reporting wild Pokémon on the map over a test's context (`createTestContext`, with the spawn
+ * service, wants and regions of `partyServiceWith`), as the bot wires it. Pass as `spawns`.
+ * `channelName` names the channels the bot sees (none by default); `channels` says who an
+ * overwrite of their own keeps out of a region's channel (give the fake gateway; nobody by
+ * default).
+ */
+export function spawnWebWith(
+  ctx: SpawnWebContext,
+  options: Partial<Omit<SpawnWebDeps, 'ctx'>> = {},
+): SpawnWebDeps {
+  return { ctx, channelName: () => undefined, channels: NOBODY_KEPT_OUT, ...options };
+}
+
+/** No overwrite of a member's own keeps anybody out of a channel. */
+const NOBODY_KEPT_OUT: SpawnWebDeps['channels'] = { ownViewDenied: () => Promise.resolve(false) };
+
+/** No spawns can be reported: a test that does passes `spawnWebWith`. */
+const NO_SPAWNS: SpawnWebDeps = {
+  ctx: new Proxy({} as SpawnWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no spawns in this test: give spawnWebWith');
+    },
+  }),
+  channelName: () => undefined,
+  channels: NOBODY_KEPT_OUT,
+};
+
 /** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
 export const TEST_WEB: WebSettings = {
   port: 0,
@@ -366,6 +396,8 @@ export interface WebTestOptions {
   parties?: PartyWebDeps;
   /** Reporting and changing raids on the map (`raidWebWith`); none by default. */
   raids?: RaidWebDeps;
+  /** Reporting wild Pokémon on the map (`spawnWebWith`); none by default. */
+  spawns?: SpawnWebDeps;
 }
 
 /**
@@ -490,6 +522,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     },
     parties: options.parties ?? NO_PARTIES,
     raids: options.raids ?? NO_RAIDS,
+    spawns: options.spawns ?? NO_SPAWNS,
     now: () => clock.now,
     log,
   });
````

### Task 3: Map spawns: the form on a long press, and in a gym's popup

Prototype commit: `353cf421dffb742fad1e92457f95324ba0b6e744`

A long press or right click on the map (not outside every region: said at once) and "Report spawn here" in a gym's popup open a form (Pokémon from a list, where it is, IVs, the region when several) held like 8M-4's; the server's regions redraw it; a success says so and closes it.

**Files:**

```
 src/web/client/main.ts             |  33 ++++-----
 src/web/client/map.css             |   3 +-
 src/web/client/party-layer.ts      |  65 +++++++++++++++---
 src/web/client/raid-ui.ts          |  15 +++--
 src/web/client/spawn-forms.test.ts | 275 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/spawn-forms.ts      | 285 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/spawn-ui.ts         | 211 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 7 files changed, 855 insertions(+), 32 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/spawn-forms.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/web/client/main.ts src/web/client/party-layer.ts src/web/client/raid-ui.ts src/web/client/spawn-forms.test.ts src/web/client/spawn-forms.ts src/web/client/spawn-ui.ts` and `npx eslint src/web/client/main.ts src/web/client/party-layer.ts src/web/client/raid-ui.ts src/web/client/spawn-forms.test.ts src/web/client/spawn-forms.ts src/web/client/spawn-ui.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 353cf421dffb742fad1e92457f95324ba0b6e744 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Map spawns: the form on a long press, and in a gym's popup`, the paragraph above as the body and the trailer, staging exactly
  `src/web/client/main.ts src/web/client/map.css src/web/client/party-layer.ts src/web/client/raid-ui.ts src/web/client/spawn-forms.test.ts src/web/client/spawn-forms.ts src/web/client/spawn-ui.ts`.

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 0b0c19110e56a4473a9bd9959a446ea421ce8575..54d2c8274568cd31e8ad367780095395d8665b20 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -24,22 +24,26 @@ const REGION_COLOUR = '#3060c0';
 
 /**
  * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
- * for a member (plan 8M-4), and whether a raid form is open (the popup's content is held then:
- * `heldContent`). Nothing until then.
+ * (plan 8M-4) and "Report spawn here" (plan 8M-4S) for a member, and whether a form is open (the
+ * popup's content is held then: `heldContent`). Nothing until then.
  */
 const gymExtras: {
-  of: (gym: MapGym) => HTMLElement | undefined;
+  of: (gym: MapGym) => HTMLElement[];
   editing: () => boolean;
-} = { of: () => undefined, editing: () => false };
+} = { of: () => [], editing: () => false };
 
 /**
- * Shows the regions and gyms; gives the gyms by id, where the parties are put, and the regions'
- * names by id.
+ * Shows the regions and gyms; gives the gyms by id, where the parties are put, the regions'
+ * names by id, and the regions with their outlines (where a point of the map lies).
  */
 async function showGeo(
   map: L.Map,
   guild: string,
-): Promise<{ gyms: Map<number, MapGym>; names: Map<number, string> }> {
+): Promise<{
+  gyms: Map<number, MapGym>;
+  names: Map<number, string>;
+  regions: GeoView['regions'];
+}> {
   const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
   const regions = L.featureGroup();
@@ -64,8 +68,7 @@ async function showGeo(
       heldContent(
         () => {
           const popup = renderNode(gymPopup(gym, names), document);
-          const extra = gymExtras.of(gym);
-          if (extra) popup.append(extra);
+          popup.append(...gymExtras.of(gym));
           return popup;
         },
         () => gymExtras.editing(),
@@ -102,7 +105,7 @@ async function showGeo(
     });
     if (matches.length === 1) matches[0]?.dot.openPopup();
   });
-  return { gyms: new Map(view.gyms.map((gym) => [gym.id, gym])), names };
+  return { gyms: new Map(view.gyms.map((gym) => [gym.id, gym])), names, regions: view.regions };
 }
 
 function start(): void {
@@ -121,17 +124,17 @@ function start(): void {
   }
   const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links');
   showGeo(map, guild)
-    .then(async ({ gyms, names }) => {
+    .then(async ({ gyms, names, regions }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
       // cannot be reached the server says whether it still knows them as a member. A member
-      // may report raids at gyms (plan 8M-4), not while the map is read-only: by `/api/me` at
-      // first, then by the list of parties at each draw.
+      // may report raids at gyms (plan 8M-4) and spawns at any point (plan 8M-4S), not while
+      // the map is read-only: by `/api/me` at first, then by the list of parties at each draw.
       const me = await account;
       if (!me.loggedIn || !(me.member || me.readOnly)) return;
       const mayReport = me.member && !me.readOnly;
-      const raids = showParties(map, guild, me, gyms, names, mayReport);
+      const raids = showParties(map, guild, me, gyms, names, regions, mayReport);
       gymExtras.editing = () => raids.editing();
-      gymExtras.of = (gym) => raids.reportControl(gym);
+      gymExtras.of = (gym) => raids.gymControls(gym);
     })
     .catch(() => say('The map could not be loaded. Try again in a moment.'));
 }
diff --git a/src/web/client/map.css b/src/web/client/map.css
index b1637b6a4490bb6bba33f56c9055ead0474226a8..27de8e8a131154d93d54c47f1c5ca0261d7d9e96 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -227,8 +227,9 @@ body {
   margin: 2px 0 6px;
 }
 
-/* Reporting and changing raids (plan 8M-4). */
+/* Reporting and changing raids (plan 8M-4), reporting spawns (plan 8M-4S). */
 .report-raid,
+.report-spawn,
 .raid-form .press,
 .party-popup .change-raid {
   margin-top: 6px;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 4e486b52027ee9abc8ac0515734923d26f08b18b..33ab5735dfd43307df7e40c6ded35f8545554bdb 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -1,4 +1,5 @@
 import * as L from 'leaflet';
+import type { GeoView } from '../../domain/web/geo-data.js';
 import type { PartiesView } from '../../domain/web/party-data.js';
 import { byId, getJson, say } from './common.js';
 import type { Me } from './notice.js';
@@ -18,6 +19,8 @@ import {
 import { renderNode, type MapGym, type PageNode } from './popup.js';
 import { FormHold, OpenPopup, reportBox, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
+import { spawnBox, spawnPoint } from './spawn-forms.js';
+import { spawnUi } from './spawn-ui.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -40,18 +43,26 @@ const ICON_SIZE = 36;
 /** Makes the elements of a node; a click on a button in them presses it. */
 type Draw = (node: PageNode) => HTMLElement;
 
-/** What the map page's gym dots need of the raids: "Report raid", and whether a form is open. */
+/**
+ * What the map page's gym dots need of the parties: "Report raid" and "Report spawn here", and
+ * whether a form is open.
+ */
 export interface MapRaids {
-  /** "Report raid" for a gym's own popup, when it is offered now (`reportOffered`). */
-  reportControl(gym: MapGym): HTMLElement | undefined;
-  /** A raid form is open in the popup that is open: its content is held (`heldContent`). */
+  /**
+   * "Report raid" and "Report spawn here" for a gym's own popup, when they are offered now
+   * (`reportOffered`); none otherwise.
+   */
+  gymControls(gym: MapGym): HTMLElement[];
+  /** A form is open in the popup that is open: its content is held (`heldContent`). */
   editing(): boolean;
 }
 
 /**
- * `mayReport`: a member who may report raids by what `/api/me` said at the load (not while the
- * map is read-only), who gets "Report raid" also in the popups of gyms that show raids; from the
- * first list on, it follows whether the list is read-only (`reportOffered`).
+ * `mayReport`: a member who may report raids and spawns by what `/api/me` said at the load (not
+ * while the map is read-only), who gets "Report raid" and "Report spawn here" also in the popups
+ * of gyms that show raids, and the spawn form on a long press or right click on the map (plan
+ * 8M-4S); from the first list on, it follows whether the list is read-only (`reportOffered`).
+ * `regions` are the server's regions with their outlines, which say where a point lies.
  */
 export function showParties(
   map: L.Map,
@@ -59,6 +70,7 @@ export function showParties(
   me: Extract<Me, { loggedIn: true }>,
   gyms: ReadonlyMap<number, MapGym>,
   regionNames: ReadonlyMap<number, string>,
+  regions: GeoView['regions'],
   mayReport: boolean,
 ): MapRaids {
   const layer = L.layerGroup().addTo(map);
@@ -134,6 +146,9 @@ export function showParties(
       else if (target.dataset.report !== undefined) {
         const gym = gyms.get(Number(target.dataset.report));
         if (gym) raidForms.reportClicked(target, gym);
+      } else if (target.dataset.spawn !== undefined) {
+        const gym = gyms.get(Number(target.dataset.spawn));
+        if (gym) spawnForms.spawnClicked(target, gym);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       }
@@ -179,7 +194,7 @@ export function showParties(
               }),
               keyboard: true,
             });
-      const extras = reportOffered(mayReport, next) ? [reportBox(gymId)] : [];
+      const extras = reportOffered(mayReport, next) ? [reportBox(gymId), spawnBox(gymId)] : [];
       withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context(), extras)).addTo(
         layer,
       );
@@ -263,6 +278,34 @@ export function showParties(
     },
   });
 
+  // Reporting wild Pokémon (plan 8M-4S): a long press or a right click on the map opens the form
+  // in a popup at that point (Leaflet's `contextmenu`, which it also fires for a long press on a
+  // phone), "Report spawn here" in a gym's popup in its place; held like the raid forms. Not
+  // while the map is read-only.
+  const spawnForms = spawnUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    regions,
+    hold,
+    popupAt: (point, content) => {
+      const popup = L.popup().setLatLng([point.lat, point.lon]).setContent(content).openOn(map);
+      return {
+        close: () => {
+          map.closePopup(popup);
+        },
+      };
+    },
+  });
+  map.on('contextmenu', (event) => {
+    if (!reportOffered(mayReport, view)) return;
+    spawnForms.spawnAt(spawnPoint(event.latlng.lat, event.latlng.lng));
+  });
+
   const poller = new Poller({
     everyMs: EVERY_MS,
     visible: () => document.visibilityState === 'visible',
@@ -302,8 +345,10 @@ export function showParties(
   }, COUNTDOWN_MS);
   void poller.start();
   return {
-    reportControl: (gym) =>
-      reportOffered(mayReport, view) ? raidForms.reportControl(gym) : undefined,
+    gymControls: (gym) =>
+      reportOffered(mayReport, view)
+        ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym)]
+        : [],
     editing: () => hold.editing,
   };
 }
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index cb49dbdba93683207691150644775c621d08fcc5..86abe1c66709db05444ba08c275f9f7c3db15c5d 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -44,10 +44,13 @@ export interface RaidUiDeps {
   hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
 }
 
-/** The controls that open a raid form ("Report raid", "Change…") under `root`, on or off. */
+/**
+ * The controls that open a form ("Report raid", "Change…", "Report spawn here") under `root`, on
+ * or off.
+ */
 export function formControls(root: ParentNode, on: boolean): void {
   for (const button of root.querySelectorAll<HTMLButtonElement>(
-    'button[data-report], button[data-change-raid]',
+    'button[data-report], button[data-change-raid], button[data-spawn]',
   )) {
     button.disabled = !on;
   }
@@ -60,7 +63,7 @@ const inPopup = (place: HTMLElement): boolean => place.closest('.leaflet-popup')
 const NO_OPTIONS = 'The pick lists could not be loaded. Try again in a moment.';
 
 /** The values of a form's fields by name. */
-function fieldsOf(form: HTMLElement): Record<string, string> {
+export function fieldsOf(form: HTMLElement): Record<string, string> {
   const values: Record<string, string> = {};
   for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
     'input[name], select[name]',
@@ -71,7 +74,7 @@ function fieldsOf(form: HTMLElement): Record<string, string> {
 }
 
 /** Says a form's answer under it, and in the notice. */
-function answer(form: HTMLElement, text: string): void {
+export function sayUnder(form: HTMLElement, text: string): void {
   const line = form.querySelector<HTMLElement>('.form-answer');
   if (line) {
     line.textContent = text;
@@ -99,7 +102,7 @@ export function raidUi(deps: RaidUiDeps) {
   /** Sends a body to an address of the raids with the page's token; disables the form meanwhile. */
   const send = async (form: HTMLElement, url: string, body: FormBody) => {
     if ('text' in body) {
-      answer(form, body.text);
+      sayUnder(form, body.text);
       return undefined;
     }
     const buttons = form.querySelectorAll('button');
@@ -121,7 +124,7 @@ export function raidUi(deps: RaidUiDeps) {
     });
     deps.csrf.set(sent.csrf);
     for (const each of buttons) each.disabled = false;
-    answer(form, sent.text);
+    sayUnder(form, sent.text);
     return sent;
   };
 
diff --git a/src/web/client/spawn-forms.test.ts b/src/web/client/spawn-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..abc879e8498f9e4c4a462d5814ccf73acf47302f
--- /dev/null
+++ b/src/web/client/spawn-forms.test.ts
@@ -0,0 +1,275 @@
+import { describe, expect, it } from 'vitest';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { WildOptionsView } from '../../domain/web/spawn-data.js';
+import type { Me } from './notice.js';
+import type { PressSteps } from './parties.js';
+import type { PageNode } from './popup.js';
+import {
+  pressedWhere,
+  redrawnAfter,
+  regionsAt,
+  sendSpawnForm,
+  spawnAnswerOf,
+  spawnBody,
+  spawnBox,
+  spawnForm,
+  spawnPoint,
+} from './spawn-forms.js';
+
+const OPTIONS: WildOptionsView = {
+  pokemon: [
+    ['dratini', 'Dratini'],
+    ['rattata_alola', 'Alolan Rattata'],
+    ['uxie', 'Uxie'],
+  ],
+};
+
+/** West and East as `/api/geo` gives them, East reaching 0.05° into West. */
+const REGIONS: GeoView['regions'] = [
+  {
+    id: 1,
+    name: 'west',
+    outline: [
+      [40, -80.1],
+      [40.1, -80.1],
+      [40.1, -80],
+      [40, -80],
+      [40, -80.1],
+    ],
+  },
+  {
+    id: 2,
+    name: 'east',
+    outline: [
+      [40, -80.05],
+      [40.1, -80.05],
+      [40.1, -79.9],
+      [40, -79.9],
+      [40, -80.05],
+    ],
+  },
+];
+
+/** Every node of a tree, depth first. */
+function all(node: PageNode): PageNode[] {
+  return [node, ...(node.children ?? []).flatMap(all)];
+}
+
+const byName = (node: PageNode, name: string) =>
+  all(node).find((one) => one.attributes?.name === name);
+const optionsOf = (node: PageNode | undefined) =>
+  all(node ?? { tag: 'none' })
+    .filter((one) => one.tag === 'option')
+    .map((one) => [one.attributes?.value, one.text]);
+
+describe('"Report spawn here" in a gym\'s popup (spawnBox)', () => {
+  it('is a button that names the gym whose place is the point', () => {
+    const box = spawnBox(4);
+    expect(box.className).toBe('spawn-box');
+    expect(box.children).toEqual([
+      {
+        tag: 'button',
+        className: 'report-spawn',
+        text: 'Report spawn here',
+        attributes: { type: 'button', 'data-spawn': '4' },
+      },
+    ]);
+  });
+});
+
+describe('the regions a point lies in (regionsAt)', () => {
+  it('gives every region of the map whose outline holds the point, by id and name', () => {
+    expect(regionsAt({ lat: 40.05, lon: -80.08 }, REGIONS)).toEqual([{ id: 1, name: 'west' }]);
+    expect(regionsAt({ lat: 40.05, lon: -80.02 }, REGIONS)).toEqual([
+      { id: 1, name: 'west' },
+      { id: 2, name: 'east' },
+    ]);
+    expect(regionsAt({ lat: 41, lon: -81 }, REGIONS)).toEqual([]);
+  });
+
+  it('keeps a point to six decimals, as the server does', () => {
+    expect(spawnPoint(40.123456789, -80.0000004)).toEqual({ lat: 40.123457, lon: -80 });
+  });
+});
+
+describe('where a press on the map may report (pressedWhere)', () => {
+  it('gives the regions of a point in one or several, and says at once that a point outside them is in none', () => {
+    expect(pressedWhere({ lat: 40.05, lon: -80.08 }, REGIONS)).toEqual({
+      regions: [{ id: 1, name: 'west' }],
+    });
+    expect(pressedWhere({ lat: 40.05, lon: -80.02 }, REGIONS)).toEqual({
+      regions: [
+        { id: 1, name: 'west' },
+        { id: 2, name: 'east' },
+      ],
+    });
+    expect(pressedWhere({ lat: 41, lon: -81 }, REGIONS)).toEqual({
+      text: 'That point is not in a region of this server.',
+    });
+    expect(pressedWhere({ lat: 40.05, lon: -80.08 }, [])).toEqual({
+      text: 'That point is not in a region of this server.',
+    });
+  });
+});
+
+describe('the form of a spawn report (spawnForm)', () => {
+  it("offers /wild's Pokémon to pick by name, asks where it is, and the IVs only if checked", () => {
+    const form = spawnForm(OPTIONS, []);
+    expect(form.attributes).toMatchObject({ 'data-form': 'spawn' });
+    expect(byName(form, 'pokemon')?.attributes).toMatchObject({
+      list: 'wild-pokemon',
+      maxlength: '100',
+    });
+    const list = all(form).find((one) => one.tag === 'datalist');
+    expect(list?.attributes).toEqual({ id: 'wild-pokemon' });
+    expect(optionsOf(list)).toEqual([
+      ['Dratini', undefined],
+      ['Alolan Rattata', undefined],
+      ['Uxie', undefined],
+    ]);
+    expect(byName(form, 'details')?.attributes).toMatchObject({ maxlength: '200' });
+    expect(optionsOf(byName(form, 'iv'))).toEqual([
+      ['', 'Not checked'],
+      ['perfect', 'Perfect (100%)'],
+      ['zero', 'Zero (0%)'],
+    ]);
+    expect(byName(form, 'region')).toBeUndefined();
+  });
+
+  it('asks for the region of a point that lies in several, and keeps what was filled in', () => {
+    const form = spawnForm(
+      OPTIONS,
+      [
+        { id: 1, name: 'west' },
+        { id: 2, name: 'east' },
+      ],
+      { pokemon: 'Dratini', details: 'by the bench', iv: 'zero', region: '2' },
+    );
+    expect(optionsOf(byName(form, 'region'))).toEqual([
+      ['', 'Pick the region'],
+      ['1', 'west'],
+      ['2', 'east'],
+    ]);
+    const selected = all(form).filter((one) => one.attributes?.selected !== undefined);
+    expect(selected.map((one) => one.attributes?.value)).toEqual(['zero', '2']);
+    expect(byName(form, 'pokemon')?.attributes?.value).toBe('Dratini');
+    expect(byName(form, 'details')?.attributes?.value).toBe('by the bench');
+  });
+});
+
+describe('the body of a spawn report (spawnBody)', () => {
+  const point = { lat: 40.05, lon: -80.02 };
+  const values = { pokemon: 'Dratini', details: ' by the bench ', iv: '', region: '' };
+
+  it('sends a Pokémon picked by its name as its key, and typed text as it is', () => {
+    expect(spawnBody(point, values, OPTIONS)).toEqual({
+      body: { pokemon: 'dratini', details: 'by the bench', lat: 40.05, lon: -80.02 },
+    });
+    expect(spawnBody(point, { ...values, pokemon: ' alolan rattata ' }, OPTIONS)).toEqual({
+      body: { pokemon: 'rattata_alola', details: 'by the bench', lat: 40.05, lon: -80.02 },
+    });
+    expect(spawnBody(point, { ...values, pokemon: 'dratni' }, OPTIONS)).toMatchObject({
+      body: { pokemon: 'dratni' },
+    });
+  });
+
+  it('sends the IVs and the region when they are picked', () => {
+    expect(spawnBody(point, { ...values, iv: 'perfect', region: '2' }, OPTIONS)).toEqual({
+      body: {
+        pokemon: 'dratini',
+        details: 'by the bench',
+        iv: 'perfect',
+        lat: 40.05,
+        lon: -80.02,
+        region: 2,
+      },
+    });
+  });
+
+  it('says what is missing first', () => {
+    expect(spawnBody(point, { ...values, pokemon: ' ' }, OPTIONS)).toEqual({
+      text: 'Pick the Pokémon first.',
+    });
+    expect(spawnBody(point, { ...values, details: '  ' }, OPTIONS)).toEqual({
+      text: 'Say where it is first: a street corner, a park, a gym.',
+    });
+  });
+});
+
+describe('sending a spawn report (sendSpawnForm)', () => {
+  const steps = (answers: Array<{ status: number; body: unknown }>, me?: Me): PressSteps => ({
+    post: () => {
+      const next = answers.shift();
+      return next ? Promise.resolve(next) : Promise.reject(new Error('no answer'));
+    },
+    me: () => Promise.resolve(me ?? { loggedIn: false }),
+  });
+
+  it('gives the words, whether it was made, and the regions to pick from when asked', async () => {
+    expect(
+      await sendSpawnForm('token', steps([{ status: 200, body: { ok: true, text: 'Reported.' } }])),
+    ).toEqual({ text: 'Reported.', csrf: 'token', ok: true });
+    const several = await sendSpawnForm(
+      'token',
+      steps([
+        {
+          status: 422,
+          body: { ok: false, text: 'Pick one.', regions: [{ id: 1, name: 'west' }] },
+        },
+      ]),
+    );
+    expect(several).toEqual({
+      ok: false,
+      text: 'Pick one.',
+      csrf: 'token',
+      regions: [{ id: 1, name: 'west' }],
+    });
+  });
+
+  it('tries once more with a new token after a 403, as a press does', async () => {
+    const sent = await sendSpawnForm(
+      'old',
+      steps(
+        [
+          { status: 403, body: { error: 'Forbidden' } },
+          { status: 200, body: { ok: true, text: 'Done.' } },
+        ],
+        { loggedIn: true, name: 'Alice', member: true, csrf: 'new', readOnly: false },
+      ),
+    );
+    expect(sent).toMatchObject({ text: 'Done.', csrf: 'new', ok: true });
+  });
+
+  it('draws the form again with the regions whenever an answer names them, keeping what was filled in', () => {
+    const filled = { pokemon: 'Dratini', details: 'by the bench', iv: 'zero', region: '' };
+    const west = { id: 1, name: 'west' };
+    const east = { id: 2, name: 'east' };
+    // The page saw the point in one region, the server in two.
+    expect(redrawnAfter({ ok: false, regions: [west, east] }, filled)).toEqual({
+      regions: [west, east],
+      filled,
+    });
+    // The form offered two already: the server's regions are taken all the same, and a region
+    // picked that is not among them is picked no more.
+    const north = { id: 4, name: 'north' };
+    expect(redrawnAfter({ ok: false, regions: [east, north] }, { ...filled, region: '1' })).toEqual(
+      { regions: [east, north], filled },
+    );
+    expect(redrawnAfter({ ok: false, regions: [east, north] }, { ...filled, region: '2' })).toEqual(
+      { regions: [east, north], filled: { ...filled, region: '2' } },
+    );
+    // An answer without regions leaves the form as it is.
+    expect(redrawnAfter({ ok: false }, filled)).toBeUndefined();
+    expect(redrawnAfter({ ok: true }, filled)).toBeUndefined();
+  });
+
+  it('reads what the server answered, and nothing else', () => {
+    expect(spawnAnswerOf('nonsense')).toEqual({ ok: false });
+    expect(spawnAnswerOf({ ok: true, regions: 'x' })).toEqual({ ok: true });
+    expect(spawnAnswerOf({ ok: false, regions: [{ id: '1', name: 2 }] })).toEqual({ ok: false });
+    expect(spawnAnswerOf({ ok: false, regions: [{ id: 1, name: 'west' }, 'x'] })).toEqual({
+      ok: false,
+      regions: [{ id: 1, name: 'west' }],
+    });
+  });
+});
diff --git a/src/web/client/spawn-forms.ts b/src/web/client/spawn-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..238b06550de3586f1d073f839e7eaed1305f7bf4
--- /dev/null
+++ b/src/web/client/spawn-forms.ts
@@ -0,0 +1,285 @@
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { ringContains } from '../../domain/geo/region-membership.js';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { WildOptionsView } from '../../domain/web/spawn-data.js';
+import { pressParty, type PressSteps, type Pressed } from './parties.js';
+import type { PageNode } from './popup.js';
+import type { FormBody } from './raid-forms.js';
+
+/**
+ * Reporting a wild Pokémon on the live map (plan 8M-4S, spec 3.8), the parts that need no
+ * Leaflet: "Report spawn here" in a gym's popup, the regions a point lies in, the form as a tree
+ * of nodes (`renderNode` sets every text as text), the body it sends, and sending it with the
+ * page's CSRF token as a press is sent. What a member types is read by the server with `/wild`'s
+ * readers; the page only says what is missing.
+ */
+
+/** As much as `/wild` takes of the Pokémon and of the details (its options' lengths). */
+const POKEMON_LENGTH = 100;
+const DETAILS_LENGTH = 200;
+
+/** The id of the form's list of Pokémon (one form is open at a time). */
+const POKEMON_LIST = 'wild-pokemon';
+
+/** A region a point lies in, by id and name, as `/api/geo` names it. */
+export interface PointRegion {
+  id: number;
+  name: string;
+}
+
+/** A coordinate to six decimals (about 10 cm), as the server keeps the point. */
+const sixDecimals = (value: number): number => Math.round(value * 1e6) / 1e6;
+
+/** The point of a report: where the map was pressed, or a gym's place, to six decimals. */
+export function spawnPoint(lat: number, lon: number): LatLon {
+  return { lat: sixDecimals(lat), lon: sixDecimals(lon) };
+}
+
+/**
+ * The regions of the map whose outlines hold the point, in the order of `/api/geo`: where it
+ * lies in several, the form asks which (the server decides by the same outlines).
+ */
+export function regionsAt(point: LatLon, regions: GeoView['regions']): PointRegion[] {
+  return regions
+    .filter((region) =>
+      ringContains(
+        region.outline.map(([lat, lon]) => ({ lat, lon })),
+        point,
+      ),
+    )
+    .map((region) => ({ id: region.id, name: region.name }));
+}
+
+/** What a press on the map says of a point that lies in no region of the map's outlines. */
+export const NOT_IN_A_REGION = 'That point is not in a region of this server.';
+
+/**
+ * Where a long press or a right click on the map may report: the regions the point lies in by
+ * the outlines of `/api/geo`, or, for a point in none, the words that say so at once (no form
+ * is opened). The server still decides by its own outlines, at their edges too.
+ */
+export function pressedWhere(
+  point: LatLon,
+  regions: GeoView['regions'],
+): { regions: PointRegion[] } | { text: string } {
+  const lying = regionsAt(point, regions);
+  return lying.length === 0 ? { text: NOT_IN_A_REGION } : { regions: lying };
+}
+
+/** "Report spawn here" in the box a click opens the form in (`spawn-box`), in a gym's popup. */
+export function spawnBox(gymId: number): PageNode {
+  return {
+    tag: 'div',
+    className: 'spawn-box',
+    children: [
+      {
+        tag: 'button',
+        className: 'report-spawn',
+        text: 'Report spawn here',
+        attributes: { type: 'button', 'data-spawn': String(gymId) },
+      },
+    ],
+  };
+}
+
+/** What a spawn form holds, kept when it is drawn anew (a region to pick, say). */
+export interface SpawnValues {
+  pokemon: string;
+  details: string;
+  iv: string;
+  region: string;
+}
+
+const option = (value: string, text: string, selected: boolean): PageNode => ({
+  tag: 'option',
+  text,
+  attributes: { value, ...(selected ? { selected: '' } : {}) },
+});
+
+const labelled = (text: string, ...children: PageNode[]): PageNode => ({
+  tag: 'label',
+  className: 'form-row',
+  children: [{ tag: 'span', text }, ...children],
+});
+
+/** The IVs as `/wild`'s option offers them; none when they were not checked. */
+const IV_OPTIONS: ReadonlyArray<[string, string]> = [
+  ['', 'Not checked'],
+  ['perfect', 'Perfect (100%)'],
+  ['zero', 'Zero (0%)'],
+];
+
+/**
+ * The form of a spawn report at a point: the Pokémon, picked by name from `/wild`'s list while
+ * typing (a `datalist`, which the browser filters), where it is (`details`, required as in
+ * `/wild`), the IVs if checked, and the region where the point lies in several.
+ */
+export function spawnForm(
+  options: WildOptionsView,
+  regions: readonly PointRegion[],
+  filled: Partial<SpawnValues> = {},
+): PageNode {
+  const text = (name: string, length: number, placeholder: string, value: string | undefined) =>
+    ({
+      tag: 'input',
+      attributes: {
+        name,
+        type: 'text',
+        maxlength: String(length),
+        placeholder,
+        autocomplete: 'off',
+        ...(name === 'pokemon' ? { list: POKEMON_LIST } : {}),
+        ...(value === undefined ? {} : { value }),
+      },
+    }) satisfies PageNode;
+  return {
+    tag: 'div',
+    className: 'raid-form spawn-form',
+    attributes: { 'data-form': 'spawn' },
+    children: [
+      { tag: 'strong', className: 'name', text: 'Wild Pokémon here' },
+      labelled(
+        'Pokémon',
+        text('pokemon', POKEMON_LENGTH, 'Type to pick from the list', filled.pokemon),
+        {
+          tag: 'datalist',
+          attributes: { id: POKEMON_LIST },
+          children: options.pokemon.map(([, name]): PageNode => ({
+            tag: 'option',
+            attributes: { value: name },
+          })),
+        },
+      ),
+      labelled(
+        'Where it is',
+        text('details', DETAILS_LENGTH, 'a street corner, a park, a gym nearby', filled.details),
+      ),
+      labelled('IVs', {
+        tag: 'select',
+        attributes: { name: 'iv' },
+        children: IV_OPTIONS.map(([value, name]) =>
+          option(value, name, (filled.iv ?? '') === value && value !== ''),
+        ),
+      }),
+      ...(regions.length > 1
+        ? [
+            labelled('Region', {
+              tag: 'select',
+              attributes: { name: 'region' },
+              children: [
+                option('', 'Pick the region', (filled.region ?? '') === ''),
+                ...regions.map((region) =>
+                  option(String(region.id), region.name, String(region.id) === filled.region),
+                ),
+              ],
+            }),
+          ]
+        : []),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Report',
+            attributes: { type: 'button', 'data-submit': 'spawn' },
+          },
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Cancel',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+        ],
+      },
+      { tag: 'div', className: 'form-answer', attributes: { hidden: '' } },
+    ],
+  };
+}
+
+/**
+ * The body of a spawn report (`POST /s/<guild>/api/spawns`), or what the member must fill in
+ * first. A Pokémon whose name is one of the list's (whatever its letter case) is sent as its
+ * value, as a choice of `/wild` is; anything else as typed, for the server to read or refuse.
+ */
+export function spawnBody(point: LatLon, values: SpawnValues, options: WildOptionsView): FormBody {
+  const typed = values.pokemon.trim();
+  if (typed === '') return { text: 'Pick the Pokémon first.' };
+  const details = values.details.trim();
+  if (details === '') return { text: 'Say where it is first: a street corner, a park, a gym.' };
+  const folded = typed.toLocaleLowerCase();
+  const picked = options.pokemon.find(([, name]) => name.toLocaleLowerCase() === folded);
+  const region = Number(values.region);
+  return {
+    body: {
+      pokemon: picked ? picked[0] : typed,
+      details,
+      ...(values.iv === 'perfect' || values.iv === 'zero' ? { iv: values.iv } : {}),
+      lat: point.lat,
+      lon: point.lon,
+      ...(values.region !== '' && Number.isInteger(region) ? { region } : {}),
+    },
+  };
+}
+
+/**
+ * What the page takes of a report's answer: whether it was made, and the regions to pick from
+ * when the point lies in several (only those it can read).
+ */
+export interface SpawnAnswered {
+  ok: boolean;
+  regions?: PointRegion[];
+}
+
+export function spawnAnswerOf(body: unknown): SpawnAnswered {
+  if (typeof body !== 'object' || body === null) return { ok: false };
+  const { ok, regions } = body as { ok?: unknown; regions?: unknown };
+  const answered: SpawnAnswered = { ok: ok === true };
+  if (Array.isArray(regions)) {
+    const read = regions.flatMap((region: unknown): PointRegion[] => {
+      if (typeof region !== 'object' || region === null) return [];
+      const { id, name } = region as { id?: unknown; name?: unknown };
+      return typeof id === 'number' && typeof name === 'string' ? [{ id, name }] : [];
+    });
+    if (read.length > 0) answered.regions = read;
+  }
+  return answered;
+}
+
+/**
+ * The form after an answer that made no report: whenever the answer names regions (the server
+ * decides by the outlines it has now, which may differ from the page's), drawn again with those,
+ * keeping what was filled in, a region picked only while it is among them. Undefined: the form
+ * stays as it is.
+ */
+export function redrawnAfter(
+  answered: SpawnAnswered,
+  values: SpawnValues,
+): { regions: PointRegion[]; filled: SpawnValues } | undefined {
+  if (answered.ok || answered.regions === undefined) return undefined;
+  const { regions } = answered;
+  const kept = regions.some((region) => String(region.id) === values.region);
+  return { regions, filled: kept ? values : { ...values, region: '' } };
+}
+
+/**
+ * Sends a spawn report with the page's CSRF token as a press is sent (`pressParty`: a 403 of a
+ * stale token is tried once more with a new one): the words to say, the token now, and what the
+ * answer says.
+ */
+export async function sendSpawnForm(
+  csrf: string,
+  steps: PressSteps,
+): Promise<Pressed & SpawnAnswered> {
+  let last: unknown;
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      const answer = await steps.post(token);
+      last = answer.body;
+      return answer;
+    },
+    me: () => steps.me(),
+  });
+  return { ...pressed, ...spawnAnswerOf(last) };
+}
diff --git a/src/web/client/spawn-ui.ts b/src/web/client/spawn-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4f6a8b2d58e898a49f8aa54a4bb9044b7b558cd2
--- /dev/null
+++ b/src/web/client/spawn-ui.ts
@@ -0,0 +1,211 @@
+import type { LatLon } from '../../domain/geo/lat-lon.js';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { WildOptionsView } from '../../domain/web/spawn-data.js';
+import { getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode, type MapGym } from './popup.js';
+import type { FormClaim, FormHold } from './raid-forms.js';
+import { fieldsOf, sayUnder } from './raid-ui.js';
+import {
+  pressedWhere,
+  redrawnAfter,
+  regionsAt,
+  sendSpawnForm,
+  spawnBody,
+  spawnBox,
+  spawnForm,
+  spawnPoint,
+  type PointRegion,
+  type SpawnValues,
+} from './spawn-forms.js';
+
+/**
+ * The spawn form of the live map in the page (plan 8M-4S, spec 3.8): a long press or a right
+ * click on the map opens it in a popup at that point; "Report spawn here" in a gym's popup opens
+ * it in place of its button, the gym's place being the point. The pick list comes from
+ * `/api/wild-options` (the browser revalidates it by its ETag). It is held like the raid forms
+ * (`FormHold`, one form at a time). A success is said and closes the form; nothing else on the
+ * map changes (spawns are not drawn).
+ */
+export interface SpawnUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  /** The server's regions with their outlines, as `/api/geo` gives them. */
+  regions: GeoView['regions'];
+  /** The form that is open, shared with the raid forms. */
+  hold: Pick<FormHold<unknown>, 'editing' | 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
+  /** Opens a popup of its own at the point with this content; `close` closes it. */
+  popupAt(point: LatLon, content: HTMLElement): { close(): void };
+}
+
+/** What the page says when the pick list cannot be loaded. */
+const NO_OPTIONS = 'The list of Pokémon could not be loaded. Try again in a moment.';
+
+/** What the page says of a long press while another form is open. */
+const FORM_OPEN = 'Close the form that is open first.';
+
+export function spawnUi(deps: SpawnUiDeps) {
+  const { guild, hold } = deps;
+
+  /** Sends a report with the page's token; disables the form's buttons meanwhile. */
+  const send = async (form: HTMLElement, body: Record<string, string | number>) => {
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await sendSpawnForm(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(`/s/${guild}/api/spawns`, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    for (const each of buttons) each.disabled = false;
+    return sent;
+  };
+
+  /**
+   * Draws the form into `box` once the pick list came, when its claim still holds and the box is
+   * still in the page, asking for a region where `lying` (the regions the page sees the point
+   * in) has several; `finish` closes it (and lets the hold go).
+   */
+  const openForm = async (
+    box: HTMLElement,
+    point: LatLon,
+    lying: readonly PointRegion[],
+    claim: FormClaim,
+    finish: () => void,
+  ): Promise<void> => {
+    let options: WildOptionsView;
+    try {
+      options = await getJson<WildOptionsView>(`/s/${guild}/api/wild-options`);
+    } catch {
+      say(NO_OPTIONS);
+      if (hold.holds(claim)) finish();
+      return;
+    }
+    if (!hold.ready(claim, box.isConnected)) return;
+    let regions = lying;
+    // The form is drawn anew whenever the server's answer names regions (`redrawnAfter`); each
+    // drawing has its own click handler.
+    const draw = (filled: Partial<SpawnValues>): void => {
+      const form = renderNode(spawnForm(options, regions, filled), document);
+      form.addEventListener('click', (event) => {
+        clicked(form, event);
+      });
+      box.replaceChildren(form);
+      hold.fit();
+    };
+    const clicked = (form: HTMLElement, event: Event): void => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) {
+        finish();
+        return;
+      }
+      if (target.dataset.submit !== 'spawn') return;
+      const fields = fieldsOf(form);
+      const values: SpawnValues = {
+        pokemon: fields.pokemon ?? '',
+        details: fields.details ?? '',
+        iv: fields.iv ?? '',
+        region: fields.region ?? '',
+      };
+      const body = spawnBody(point, values, options);
+      if ('text' in body) {
+        sayUnder(form, body.text);
+        return;
+      }
+      void send(form, body.body).then((sent) => {
+        // A form gone with its popup meanwhile: nothing more to do.
+        if (!hold.holds(claim)) {
+          say(sent.text);
+          return;
+        }
+        if (sent.ok) {
+          finish();
+          say(sent.text);
+          return;
+        }
+        // The server names the regions to pick from: the form offers those.
+        const redrawn = redrawnAfter(sent, values);
+        if (redrawn) {
+          regions = redrawn.regions;
+          draw(redrawn.filled);
+        }
+        const shown = box.firstElementChild;
+        if (shown instanceof HTMLElement) sayUnder(shown, sent.text);
+        else say(sent.text);
+      });
+    };
+    draw({});
+  };
+
+  /**
+   * A click on "Report spawn here" (`spawnBox`): the form in place of the button, the gym's place
+   * the point.
+   */
+  const spawnClicked = (button: HTMLButtonElement, gym: MapGym): void => {
+    const box = button.parentElement;
+    if (!box) return;
+    const claim = hold.take(box.closest('.leaflet-popup') !== null);
+    if (!claim) return;
+    const point = spawnPoint(gym.lat, gym.lon);
+    void openForm(box, point, regionsAt(point, deps.regions), claim, () => {
+      box.replaceChildren(button);
+      hold.release(claim);
+    });
+  };
+
+  return {
+    /** "Report spawn here" for a gym's own popup; a click opens the form in its place. */
+    spawnControl(gym: MapGym): HTMLElement {
+      const box = renderNode(spawnBox(gym.id), document);
+      const button = box.querySelector('button');
+      button?.addEventListener('click', () => {
+        spawnClicked(button, gym);
+      });
+      return box;
+    },
+
+    /** A click on "Report spawn here" in the popup of a gym that shows raids. */
+    spawnClicked,
+
+    /**
+     * A long press or a right click on the map: the form in a popup at that point; a point in no
+     * region of the map's outlines is said to be in none, and nothing opens.
+     */
+    spawnAt(point: LatLon): void {
+      if (hold.editing) {
+        say(FORM_OPEN);
+        return;
+      }
+      const where = pressedWhere(point, deps.regions);
+      if ('text' in where) {
+        say(where.text);
+        return;
+      }
+      const box = document.createElement('div');
+      box.className = 'spawn-box';
+      box.textContent = 'Loading the Pokémon…';
+      // Opened first: opening it closes any other popup, which must not take the new claim.
+      const popup = deps.popupAt(point, box);
+      const claim = hold.take(true);
+      if (!claim) return;
+      void openForm(box, point, where.regions, claim, () => {
+        hold.release(claim);
+        popup.close();
+      });
+    },
+  };
+}
+
+export type SpawnUi = ReturnType<typeof spawnUi>;
````

### Task 4: Docs: spawns on the map, and the staging checklist of 8M-4S

Prototype commit: `3f6f1bb1a798a663702f5ee544856bbc69f6ee89`

`web.md` ("Spawns on the map"), `notifications-and-dms.md`, `testing.md`; the staging checklist `docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md`.

**Files:**

```
 docs/architecture/notifications-and-dms.md              |  2 +-
 docs/architecture/testing.md                            |  3 ++-
 docs/architecture/web.md                                | 21 ++++++++++++++-------
 docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md | 35 +++++++++++++++++++++++++++++++++++
 4 files changed, 52 insertions(+), 9 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/notifications-and-dms.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff 3f6f1bb1a798a663702f5ee544856bbc69f6ee89 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Docs: spawns on the map, and the staging checklist of 8M-4S`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/notifications-and-dms.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md`.

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 05e2795667a2561b958df2f8c25597a464bde8a7..a2ae2bf48af1ee16ed0cf44eb8e1cc2804b4551d 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -22,6 +22,6 @@ What members ask to be told about (wants, gym targets, new trains, boss-set), ho
 
 ## Spawn reports
 
-- A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild`: a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
+- A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild` and by the live map (plan 8M-4S; `web.md`, "Spawns on the map") through one code path: `readSpawn` (`wild.ts`: the Pokémon and the details, as the command's guard and handler read them) and `reportSpawnAs` (`spawn-report.ts`: the report, the command's words, a report's link and a channel named by the caller's `SpawnNames`); a map report's point is its `near`, a pin (`PlaceFinder.pin`). The report is a components-v2 message in the region's text channel (`spawnMessage`: `### Wild X`, the IVs and the reporter, when it goes away, the picture beside them; `**Where**`; `SPAWN_CAUTION` and the footer in small print; plan 8B-1), classic text where the bot may not post embeds (`spawnTextMessage`, with the legacy warning); a message Discord refuses with Invalid Form Body is sent once more without its picture (the Unown copy too), and the DM says when the report goes away as the report does (`SpawnNews.goneAt`); deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one (`sightingMessage`: the same container headed by the sentence that names the region, which stays). Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
 - `/wild near:` (plan 8W-2) names a gym, PokéStop or power spot of the server's regions: the option's autocomplete is `ctx.placeFinder` (`nearChoices`: `placeLabel` "Fountain Square (PokéStop) · Market Street", the title cut and never where it is; the member's region first), resolved in the command's guard so that a refusal does not count (`namedPlace`, `src/commands/place-option.ts`: a value whose place is gone or of another kind now is `PLACE_GONE` "That place is gone from the list; pick it again.", one outside the regions `NOT_HERE`; typed text only on `clearOf` of the one search, the one hit of every word; the guard and the command each resolve it, one search each, else "Which place is …?" with five suggestions); `details` stays required. A maps link or coordinates typed there are a pin (plan 8D, Matt, 2026-10-17; the option takes `MAX_PLACE_TEXT` 1,500 characters for long links, and its autocomplete offers nothing for one): `readPin` (`src/domain/geo/pin-input.ts`, pure, over `readLocation`: coordinates, `geo:` with a phone's label, Google Maps with the place's pin before the map's centre and `/place/<name>/` as `linkName`, Apple Maps `ll`, `coordinate`, `q` with coordinates, `sll` only on a map that asks for nothing (a search near a point, `q=coffee&sll=…`, is `no-point`, as Google’s search link), OpenStreetMap `mlat`/`mlon`, `#map=`) and `PlaceFinder.pin` (refused outside the server's regions, `PIN_NOT_HERE`; named by the nearest gym, PokéStop or power spot within 50 m); a short link (`maps.app.goo.gl`, `goo.gl/maps`, Apple's `maps.apple/p/…`, OpenStreetMap's `osm.org/go/…`) is refused with `SHORT_LINK` and never followed, a link of a maps site that shows no one place (a search, a Street View, `geo:0,0?q=<address>`) with `NO_POINT`, numbers that are no place with `NO_PLACE_ON_EARTH`; the autocomplete offers nothing for any of them. A pin is named by the nearest of the server's gyms (by its nickname, as its post) and of the kept PokéStops and power spots in the server's regions with a title. The option's helpers are `src/commands/place-option.ts` (`namedPlace`, `nearChoices`, `placeLabel`, `placeWords`), shared with `/meetup`. The report carries the place as a snapshot, `SpawnReport.near` (`SpawnPlace`, which is `Place`: never looked up again, the report is short-lived; a pin is `pinLine` without a label, `📍 Near **X** (PokéStop) · [Map](<…>)`, `📍 **<link's name>**` or `📍 Dropped pin`, without a picture): `nearLine` ("Near **<title>** (PokéStop) · <address> · [Map](<…>)": the address a gym's `addressLine`, a Wayspot's `wayspotAddressLine` (`wayfarer-address.ts`: as a gym made of it would show it, never the town, postal code and country Wayfarer repeats), "(no address available)" for none, so that the picture never sits beside a bare name; title and address through `plainNoLinks`) after the details under **Where**, with the place's picture beside them where `wayspotPicture` allows (the Pokémon's beside the head), in the sighting, the text report and the DM's brief alike; a message Discord refuses is sent once more without either picture.
 - Text a member typed that reaches other members' DMs or a spawn report goes through `plainNoLinks` (`src/render/text.ts`), which also breaks bare addresses; a member's name is always shown through it. `plain()` leaves an address alone (a meetup's description may link).
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index a9740e14b0c7a833d8a692d0c995014a1180cc52..11293c9a2f623781a3a84c01839eb1c89f1a4be7 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -50,7 +50,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`).
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
+- Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 2c2d474e861c06fe5aaf4c7ff722b514c845d85e..fcbab2afd6a79438e3a14721a8ecf3aea0a71e70 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, the region editor, the Content Security Policy, and the rules for the routes of 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, the region editor, the Content Security Policy, and the rules for the routes of 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
@@ -29,7 +29,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
 
 ## The public map
 
@@ -53,7 +53,14 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4; spec `docs/superpowe
 - **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum: `barred` from any of them 403, Discord unreachable 503; only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is: `{ user, guild, gym, outcome }`, "a raid was reported on the map", never the text.
 - **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
 - **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise.
-- **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S, after plan 8D's pins of maps links; trains and meetups are 8M-5; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
+- **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains and meetups are 8M-5; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
+
+## Spawns on the map (plan 8M-4S)
+
+- **One code path with `/wild`** (spec 3.5, 3.8): what `/wild` does beyond `SpawnService.report` is `readSpawn` (`src/commands/notifications/wild.ts`: the Pokémon by `wildPokemon`, `appearsInWild` with the settings' exceptions; then the details, which must say something, `SAY_WHERE`, trimmed and cut to `MAX_DETAILS`; a refusal thrown as a `UserError`) and `reportSpawnAs` (`src/commands/notifications/spawn-report.ts`: the report through `SpawnService`, the command's words, a report's link and a region's channel named by the caller's `SpawnNames`: the link and a mention on Discord, `DISCORD_SPAWN_NAMES`; on the map no link and a channel as `#name`; `no-channel`, `refused` and `closed` thrown in `/wild`'s words as a `SpawnNotMade`, a `UserError` with that `kind`). The command's guard and handler and the map call them; the web server is given what `/wild` reads and calls (`SpawnWebDeps.ctx`, `SpawnWebContext`: the bot's context in `src/app.ts`), the channel names the bot sees (`channelName`) and the gateway's `ownViewDenied` (`channels`).
+- **The pick list** `GET /s/<guild>/api/wild-options` (members, as `/api/raid-options`: 401, 403, 503; 30 a minute per address): `wildOptions` (`src/web/wild-options.ts`, pure; types in `src/domain/web/spawn-data.ts`, without imports): every catalogue entry `/wild` takes (`appearsInWild` with `wildExceptionsOf(ctx).species`), a form as that form, in the catalogue's order, as `[key, name]` (about 1,180, 33 KB); kept per catalogue and settings (a `WeakMap` by the `WildExceptions` read), an ETag of its JSON, `private, no-cache`, 304.
+- **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or power spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is: `{ user, guild, region, outcome }` (`posted`, `not-made` or `closed`), "a spawn was reported on the map", never a text or the point.
+- **The page** (`src/web/client/spawn-forms.ts`, pure: "Report spawn here" (`spawnBox`), the regions a point lies in by the outlines of `/api/geo` (`regionsAt`, `ringContains`), the form as a tree of nodes, its body, reading an answer, `sendSpawnForm` over `pressParty`; the DOM side `spawn-ui.ts`): for a member while the map is not read-only (`reportOffered`, as "Report raid"), a long press or a right click on the map (Leaflet's `contextmenu`, which it also fires for a long press on a phone) opens the form in a popup of its own at that point (`spawnAt`; with another form open it says "Close the form that is open first." and opens nothing; at a point in no region of the map's outlines it says "That point is not in a region of this server." at once and opens nothing, `pressedWhere`: the server still decides by its own outlines, at their edges too), and "Report spawn here" in a gym's popup (its own, and that of a gym that shows raids, after "Report raid") opens it in place of its button, the gym's place being the point (the map shows no Wayspots, so no Wayspot popup has it). The form (`spawnForm`): the Pokémon, typed and picked by name from a `datalist` of the pick list (the browser filters it), sent as its key when the name is one of the list's (whatever its letter case), else as typed for the server to read; "Where it is" (required: "Say where it is first: …", the page's own); the IVs, "Not checked" by default; the region where the point lies in several of the map's outlines; whenever the server's answer names regions, the form is drawn again with those, keeping what was filled in (`redrawnAfter`: a region picked stays picked only while it is among them). It is held like the raid forms (`FormHold`: the hold taken before the list is asked for, the controls that open a form, `data-spawn` among them, off meanwhile, a popup's content held, `ready` before it is drawn); a success is said in the notice and closes the form; a refusal is said under the form and in the notice. Spawns are not drawn on the map.
 
 ## The region editor (plans 8M-2, 8M-2F)
 
@@ -70,5 +77,5 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4; spec `docs/superpowe
 ## Adding a route (8M-5)
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
-- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs` and `changeRaidTime` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
-- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown taken out, `unplain`); a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
+- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime` and `reportSpawnAs` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
+- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown taken out, `unplain`); a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`, `SpawnNames`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md b/docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..6e7af940ac21c9cce5ff8abeef23f9ebd7ff8ce1
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md
@@ -0,0 +1,35 @@
+# Phase 8M-4S staging checklist: reporting wild Pokémon on the live map
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role). A phone (or the browser's device mode with touch) for the long press.
+
+## Before
+
+1. No migration and no command change in this plan (`/wild`'s options, name and help are as they were): no deploy. `npm run build` (it runs `npm run web:build`): a new `dist/web/assets/map-<hash>.js`.
+2. Tester wants Dratini (`/want target:Dratini` on Discord) for step 5. Note a point of West far from every gym, PokéStop and power spot, one a few metres from a PokéStop with a title, and, if the test server's outlines overlap anywhere, a point in two regions (else skip step 8).
+
+## Reporting
+
+3. Logged out, and logged in as somebody who is no member (or without the map's member role): a right click on the map shows the browser's own menu and no form; no "Report spawn here" in a gym's popup.
+4. Googer logs in with `/maps`. A right click on the point of West far from every place: a popup opens there with "Loading the Pokémon…", then the form: "Wild Pokémon here", "Pokémon" (type `drat`: the browser offers "Dratini" from the list), "Where it is", "IVs" ("Not checked"), Report and Cancel. The popup stays while typing (it is not drawn anew under the form).
+5. Pick Dratini, type `by the bench`, Report: the notice says "Reported: a wild Dratini at your pin. The report is removed in 30 minutes."; the popup closes; nothing on the map changes. On Discord: West's channel has the report, "### Wild Dratini", "Reported by **Googer**", **Where** "by the bench" and "📍 Dropped pin · Map", the Map link opening the point; Tester got the DM ("A wild **Dratini** has been reported in #west by **Googer**."), with the pin in its brief. The report is deleted after 30 minutes.
+6. A long press (phone, or device mode) on the point near the PokéStop opens the same form; report a Pokémon typed in lower case (`gastly`) with IVs "Perfect (100%)": "Reported: a wild Gastly with 100% IVs near <stop>. …"; the report says "📍 Near **<stop>** (PokéStop)" and "with 100% IVs".
+7. A gym's popup (one without raids, and one whose marker shows raids) has "Report spawn here" (after "Report raid" there): click it, the form takes the button's place and stays; Report: "… near <gym's name as its post names it>." Cancel instead puts the button back.
+8. The point in two regions: the form has "Region" with "Pick the region" and both; Report without one picked: "This point lies in several regions: pick the one to report the spawn in.", the form kept; with East picked the report goes to East's channel.
+9. A right click outside every region: no form opens; the notice says "That point is not in a region of this server." at once and nothing is posted. (Just inside an outline's edge the form opens and the server decides; a point the server places outside answers "That pin is not in a region of this server. Give a place in the regions here.")
+10. Refusals in `/wild`'s words, as text, the form kept: `Mewtwo` "Mewtwo does not appear in the wild." (no asterisks); `Mega Charizard X` "… is a mega: those are met in raids, not in the wild."; `zzzz` "I do not know \"zzzz\" as a Pokémon. …"; the details left blank: "Say where it is first: a street corner, a park, a gym." (the page's own); blanks only, resent from the network panel (`"details": "  "`): "Say in details where the Pokémon is: …" (the backticks taken out). None of these counts against the limit (step 11).
+11. `/wild`'s limit is one: five reports in half an hour between the map and `/wild` on Discord; the sixth is refused on whichever side, "You can use /wild again in 30 minutes." (429 with `Retry-After: 1800` on the map, privately on Discord). The reports go away by themselves.
+12. One form at a time: with a raid form open in a gym's popup, a right click on the map says "Close the form that is open first." and opens nothing; "Report spawn here" and "Report raid" are greyed out until the form closes. With the spawn form open at a point, a click elsewhere on the map closes its popup and the form with it; a late answer opens nothing.
+13. A forum Tester is kept out of (an overwrite for Tester that denies View Channel on West's forum): Tester's report at a point of West answers 403 and posts nothing; at a point of East it goes through. Remove the overwrite; then the same with an overwrite for Tester that denies View Channel on West's text channel: 403 at a point of West, East goes through. Remove it afterwards. (A role's denial on the text channel is not looked at, as for raids.)
+14. While Discord cannot be reached, and a report that comes while the bot shuts down (not staged: covered by the route tests): no form, writes 503; a report during the shutdown 503 with `Retry-After: 60` and "I am restarting just now, so the report was not made. Report it again in a minute."
+15. The bot's log: one info line "a spawn was reported on the map" per report (`user`, `guild`, `region`, `outcome`), no Pokémon name, typed text or point.
+
+## Afterwards
+
+16. Remove Tester's `/want` of step 2 and any overwrite of step 13 (the forum's and the text channel's); the reports delete themselves.
+
+## Left open (to the follow-ups if not settled here)
+
+- For Matt: spawns have no privacy setting, so the map names the reporter as `/wild` names them (the brief's "per their setting" has no setting to follow; the controller's ruling). Whether a spawn's reporter should be hideable (by `raidPrivacy`, or a setting of its own) is a question for Matt.
+- Spawns are not drawn on the map; the map shows no PokéStops or power spots, so only gyms' popups have "Report spawn here".
+- The pick list is every Pokémon `/wild` takes (about 1,180 names, 33 KB once per form, revalidated by its ETag); a browser's `datalist` filters by what is typed, without `/wild`'s search order or nicknames (a nickname typed is still read by the server when it names one Pokémon outright).
+- The size of the form on a phone, and whether Leaflet's long press works on every phone browser (Safari through its `tapHold`, others through the browser's own `contextmenu`).
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m4s HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the spawn route's, the forms') ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `package.json` and `package-lock.json`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and the cutover session is not committing (ask it). Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-4S": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-4S.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-17-phase-8m4s-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, Matt starts the bot; two accounts: a spawn reported from the map, its message in the region channel and the wanters' DMs.
