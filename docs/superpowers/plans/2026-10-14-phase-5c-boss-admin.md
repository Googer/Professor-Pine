# Phase 5C: Raid Boss Administration, Nicknames, Member Settings for Staff, the Role-Authorization Export: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff see the raid boss list as members see it and change it with overrides (add, hide, autoset, shiny, remove, sync), manage Pokémon nicknames, look at a member's settings; the bot announces a changed boss list and warns of an outdated one; a script exports the legacy role authorization for the move to Discord's own command permissions.

**Architecture:** Phase 5 (admin) is three plans: 5A (gyms) and 5B (regions) are done; 5C is the last. Everything is under `/admin` (subcommand groups `boss` and `nickname`, and `member-settings`), Manage Server by default with `requireBotManagement` on top, every answer private. Commands reach `RaidBossService` through `ctx.raidBossAdmin` and the nicknames through `ctx.nicknames` (`PokemonSearchService`, changes one at a time). What members see is `effectiveBosses` (the feed with the overrides); a sync's change is worked out on that (`diffBosses`) and posted by `RaidBossAnnouncer` in each server's bot-updates channel once the client is ready. The export is a read-only script with a pure report.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely on MySQL, Vitest. No new dependencies, no migration.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: 6.7 (raid bosses), the phase table's row 5, the cutover steps. The design brief is the git-ignored `.superpowers/sdd/phase-5c-design.md`; the reviews' rulings are `review-a-rulings.md`, `review-b-rulings.md` and `rereview-rulings.md` in `.superpowers/sdd/2026-10-14-phase-5c-boss-admin/`; what the legacy bot did is `.superpowers/sdd/phase-5-legacy-notes.txt` (sections 5 to 7).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto/phase-5c`), one commit per task, with the typecheck and the tests of each task clean and the full check, build and database suite clean on the tip (4,490 unit tests; the database suite, 293 tests). Two reviewers went through that branch and a third through the fixes; what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the plan.

## Decisions made in this plan (the controller's rulings overnight; Matt has not seen them)

1. **`/admin boss`**: `list [tier]` (the list as members see it, tier by tier, each boss marked: from the feed and how it was identified, added, autoset, shiny, unknown to the game data with its feed ids; hidden overrides and overrides that do nothing listed apart; "old?" with its reason), `sync` (reads the feed now; 3 per minute; says what changed in the feed and, when an override makes it differ, what members see; unknown headings and a list that shrank by half are said), `add`, `hide`, `autoset` (with `days`: 0 for good; without it an add or autoset lasts 30 days, a hide for good), `shiny`, `remove` (autocomplete of the overrides in force). A mega or primal form only for the mega tiers, and only those for them.
2. **`/admin nickname add|remove|list`**: a nickname is 2 to 30 characters, not digits only, not a word the bot reads otherwise (shadow, mega, none, tier and IV words), not a name or nickname of another Pokémon; removal works on every legacy row of the Pokémon. The legacy column format is kept.
3. **`/admin member-settings member`**: the member's settings as `/settings show` says them (in the third person), friend code, nickname, wants and gym targets of this server (five by name, the rest counted), new-train DMs; no ping; the member is not told.
4. **Announcements**: a changed boss list, as members see it, in every server's bot-updates channel (embeds allowed), one message per sync, no ping, when `settings.raidBosses.announceChanges`; an outdated list warned once per staleness (and again after a restart while it lasts), with the time, never the error; nothing before the client is ready (at most ten wait); nothing after shutdown began.
5. **The export**: `npm run role-auth:export [--json]` reads the legacy role-authorization tables and prints per server the commands with a required role, their roles (ids), the new slash commands they correspond to (every one of the 107 legacy command names and Commando's built-ins mapped), and warnings. Read only; never contacts Discord.
6. **`/help command:<command> <group>`** lists a group's subcommands; the overview of a command shows a group as one line.
7. **Not built:** the staff audit trail (needs a design with Matt), the game data refresh from `sync`, the owner in DMs for staff guards.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure. Repositories are the only code that knows column names.
- **Tests never use the network and never contact Discord or the feed.** Database tests never use production rows.
- Text from the feed is shown through `plain()`. Custom ids are built and parsed only through `src/discord/custom-id.ts`.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto/phase-5c` of this repository). Apply it exactly; `git diff <that commit> -- src test scripts` must print nothing before the task is committed; fix differences by hand, never by checking files out of that commit.
- Inside the plan a task needs the typecheck and its own tests green (and whatever else its change could have broken); the full `npm run check` must be green after the last task. `npx prettier --write <files you touched>` before every commit.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash.

## Review Focus

1. Members must never be told of a boss change they do not see, nor miss one they do: the announcer and `diffBosses` tests (a hide and an add override), the sync answer's second block only when an override is involved.
2. An override must act on exactly the Pokémon staff meant: `chosenPokemon` (exact names only; `ids:` values only for stored feed rows or overrides), unknown bosses' `~` keys never equal a catalogue key.
3. Nicknames: no nickname that would change what another command reads; removal from every row; the legacy column stays readable.
4. Nothing announced before ready or after shutdown; a sync after stop sends no request.
5. The export reads only, and maps every legacy command name.

---

### Task 1: The boss list and the nicknames for staff, and help for a group of subcommands

Prototype commit: `5a50168ffaf5389d0f5987d944a5312ab3cc70b5`

RaidBossService says what a read of the feed found beyond its bosses (the
headings Pine does not know, a list that shrank to less than half, logged),
gives the stored feed rows, and is offered to handlers as ctx.raidBossAdmin.
A feed that was never read is stale only at the second failure in a row.

PokemonSearchService runs nickname reads and the changes staff make one at a
time, refuses a nickname that is no nickname or names another Pokemon, and is
offered as ctx.nicknames. /help command:<group> lists the subcommands of the
group, for whoever may see the command.


**Files:**

```
 src/app-context.ts                                |   8 ++++--
 src/app.ts                                        |   4 ++-
 src/commands/util/help-render.test.ts             |  45 ++++++++++++++++++++++++++-----
 src/commands/util/help-render.ts                  |  41 +++++++++++++++++++++++++---
 src/commands/util/help.test.ts                    |  24 +++++++++++++++--
 src/commands/util/help.ts                         |  32 ++++++++++++++++------
 src/db/repositories/pokemon-repository.db.test.ts |  36 +++++++++++++++++++++++++
 src/db/repositories/pokemon-repository.ts         |  53 +++++++++++++++++++++++-------------
 src/domain/pogo/boss-diff.test.ts                 |  38 ++++++++++++++++++++++++++
 src/domain/pogo/boss-diff.ts                      |  24 +++++++++++++++++
 src/domain/pogo/nickname-rules.test.ts            |  74 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/nickname-rules.ts                 |  71 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/pokemon-search.ts                 |  14 ++++++++++
 src/services/pokemon-search-service.test.ts       | 174 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/services/pokemon-search-service.ts            | 129 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 src/services/raid-boss-service.test.ts            | 210 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------
 src/services/raid-boss-service.ts                 | 205 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------------
 test/support/nicknames.ts                         | 104 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/raid-bosses.ts                       |  62 +++++++++++++++++++++++++++++++++++++++++-
 test/support/test-context.ts                      |  10 +++++++
 20 files changed, 1259 insertions(+), 99 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `The boss list and the nicknames for staff, and help for a group of subcommands`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 869d013c12be4f530824d7445a78035f7e4b1d7f..85860c3dd99c12f6695062e3f2f6ccd19edfb0da 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -18,8 +18,8 @@ import type { GymAdminService } from './services/gym-admin-service.js';
 import type { GymProvider } from './services/gym-directory.js';
 import type { PartyService } from './services/party-service.js';
 import type { PartyProvider } from './services/party-store.js';
-import type { PokemonFinder } from './services/pokemon-search-service.js';
-import type { RaidBossProvider } from './services/raid-boss-service.js';
+import type { PokemonFinder, PokemonNicknames } from './services/pokemon-search-service.js';
+import type { RaidBossAdmin, RaidBossProvider } from './services/raid-boss-service.js';
 import type { RaidChangeService } from './services/raid-change-service.js';
 import type { RaidEventProvider } from './services/raid-event-service.js';
 import type { RegionAdminService } from './services/region-admin-service.js';
@@ -40,6 +40,8 @@ export interface AppContext {
   readonly gameData: GameDataProvider;
   /** The raid bosses in effect: the feed's list with the moderators' overrides. */
   readonly raidBosses: RaidBossProvider;
+  /** The boss list for staff (`/admin boss`): the feed as stored, the overrides, a sync now. */
+  readonly raidBossAdmin: RaidBossAdmin;
   /** Raid Hours and Raid Days from the events feed (see `raidDurationRules`). */
   readonly raidEvents: RaidEventProvider;
   /** The gyms, and finding them by what members type. */
@@ -86,6 +88,8 @@ export interface AppContext {
   readonly dms: DmSender;
   /** Pokémon by what members type: names, nicknames, forms. */
   readonly pokemon: PokemonFinder;
+  /** The nicknames staff add for searching (`/admin nickname`); `pokemon` finds by them. */
+  readonly nicknames: PokemonNicknames;
   /** Map pictures of gyms and regions, as files to attach. */
   readonly maps: MapProvider;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
diff --git a/src/app.ts b/src/app.ts
index 4c7548861421d21179023113ffd6acc80b9f9ff1..3a45d1444dfde4e9479be106bfdb35fe557d42bb 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -324,7 +324,7 @@ export async function startApp(
     log,
   });
   const clickAnswers = new ClickAnswers({ log });
-  const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db));
+  const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
   const maps = new StaticMaps(
     config.env.GOOGLE_API_KEY,
     new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
@@ -360,6 +360,7 @@ export async function startApp(
     commands,
     gameData,
     raidBosses,
+    raidBossAdmin: raidBosses,
     raidEvents,
     gyms,
     gymAdmin,
@@ -383,6 +384,7 @@ export async function startApp(
     spawns,
     dms,
     pokemon,
+    nicknames: pokemon,
     maps,
     features: requested,
   };
diff --git a/src/commands/util/help-render.test.ts b/src/commands/util/help-render.test.ts
index 47038018bd83198054d2c37d0190209030666c57..b57b5668a81b71c03b88bcdcdc14ba8b79e7367a 100644
--- a/src/commands/util/help-render.test.ts
+++ b/src/commands/util/help-render.test.ts
@@ -1,4 +1,8 @@
-import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
+import {
+  ApplicationCommandOptionType,
+  SlashCommandBuilder,
+  SlashCommandSubcommandBuilder,
+} from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { commandGroup } from '../../discord/command-group.js';
 import type { CommandModule, SimpleCommand } from '../../discord/command.js';
@@ -234,14 +238,32 @@ describe('renderCommandHelp', () => {
     expect(renderCommandHelp(command, off).toJSON().description).toBe('About wild\n\nPosts.');
   });
 
-  it('lists every subcommand with what it does', () => {
-    const usage = renderCommandHelp(route(), SETTINGS).toJSON().fields?.[0]?.value;
-    expect(usage).toBe(
+  it('lists every subcommand with what it does, and a group on one line', () => {
+    const json = renderCommandHelp(route(), SETTINGS).toJSON();
+    expect(json.fields?.[0]?.value).toBe(
       '`/route show` Show the route\n' +
         '`/route add <gym>` Add a stop\n' +
-        '`/route saved load <name>` Use a saved route',
+        '`/route saved …` Saved routes',
+    );
+    expect(json.description).toBe(
+      'The route of a train\n\nUse `/help command:route saved` for the subcommands of a group.',
     );
   });
+
+  it('names every subcommand and group of every command of this bot', () => {
+    for (const command of commands) {
+      const json = command.data.toJSON();
+      const usage = renderCommandHelp(command, SETTINGS).toJSON().fields?.[0]?.value ?? '';
+      for (const option of json.options ?? []) {
+        const nested =
+          option.type === ApplicationCommandOptionType.Subcommand ||
+          option.type === ApplicationCommandOptionType.SubcommandGroup;
+        if (!nested) continue;
+        expect(usage, `/${json.name} ${option.name}`).toContain(`/${json.name} ${option.name}`);
+      }
+      expect(usage, `/${json.name}`).not.toMatch(/more$/);
+    }
+  });
 });
 
 function route(): CommandModule {
@@ -294,9 +316,18 @@ describe('renderSubcommandHelp', () => {
     });
   });
 
-  it('is undefined for a subcommand the command does not have, and for a group name', () => {
+  it('is undefined for a subcommand the command does not have', () => {
     expect(renderSubcommandHelp(route(), 'remove', SETTINGS)).toBeUndefined();
-    expect(renderSubcommandHelp(route(), 'saved', SETTINGS)).toBeUndefined();
+    expect(renderSubcommandHelp(route(), 'saved load now', SETTINGS)).toBeUndefined();
+    expect(renderSubcommandHelp(route(), 'show', SETTINGS)?.toJSON().title).toBe('/route show');
     expect(renderSubcommandHelp(cmd('join', 'basic-raid'), 'now', SETTINGS)).toBeUndefined();
   });
+
+  it('lists the subcommands of a group with what each does', () => {
+    expect(renderSubcommandHelp(route(), 'saved', SETTINGS)?.toJSON()).toMatchObject({
+      title: '/route saved',
+      description: 'Saved routes',
+      fields: [{ name: 'Usage', value: '`/route saved load <name>` Use a saved route' }],
+    });
+  });
 });
diff --git a/src/commands/util/help-render.ts b/src/commands/util/help-render.ts
index 9bcdf241b5e1ec3e0fa98e85938980a99b0451b4..feba4f72b86488f5cd413089dc8527a7d7920b44 100644
--- a/src/commands/util/help-render.ts
+++ b/src/commands/util/help-render.ts
@@ -139,24 +139,59 @@ function helpEmbed(
   return embed;
 }
 
+/**
+ * Help for a command: a usage line per subcommand, and one per group of subcommands (`/admin
+ * boss …` with what the group is for), so that a command with many stays readable; its
+ * description then says how to see a group's subcommands.
+ */
 export function renderCommandHelp(command: CommandModule, settings: Settings): EmbedBuilder {
   const json = command.data.toJSON();
+  const options = json.options ?? [];
+  const groups = options.filter(
+    (option) => option.type === ApplicationCommandOptionType.SubcommandGroup,
+  );
+  const usage = options.flatMap((option) =>
+    option.type === ApplicationCommandOptionType.SubcommandGroup
+      ? [`\`/${json.name} ${option.name} …\` ${option.description}`]
+      : usageLines(json.name, [option]),
+  );
+  const [first] = groups;
+  const hint = first
+    ? `Use \`/help command:${json.name} ${first.name}\` for the subcommands of a group.`
+    : undefined;
   return helpEmbed(
     `/${json.name}`,
-    json.description,
+    [json.description, hint].filter(Boolean).join('\n\n'),
     command.help,
-    usageLines(json.name, json.options ?? []),
+    options.some(isNested) ? usage : usageLines(json.name, options),
     settings,
   );
 }
 
-/** Help for one subcommand (`create`, `boss add`); undefined when the command has none such. */
+/**
+ * Help for one subcommand (`create`, `boss add`), or for a group of subcommands (`boss`: each
+ * of its subcommands with what it does); undefined when the command has none such.
+ */
 export function renderSubcommandHelp(
   command: CommandModule,
   path: string,
   settings: Settings,
 ): EmbedBuilder | undefined {
   const json = command.data.toJSON();
+  const group = (json.options ?? []).find(
+    (option) =>
+      option.type === ApplicationCommandOptionType.SubcommandGroup && option.name === path,
+  );
+  if (group) {
+    const name = `${json.name} ${path}`;
+    return helpEmbed(
+      `/${name}`,
+      group.description,
+      undefined,
+      usageLines(name, childrenOf(group)),
+      settings,
+    );
+  }
   for (const option of (json.options ?? []).filter(isNested)) {
     const candidates =
       option.type === ApplicationCommandOptionType.SubcommandGroup
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index 42a23ad18755122137e4bbcf8f4f936438b987d5..5590eeae816e0dca9aa349d7565b5cd1c4e2ae79 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -32,7 +32,11 @@ const route = commandGroup({
 const gym: CommandModule = commandGroup({
   data: new SlashCommandBuilder().setName('gym').setDescription('Gym administration'),
   help: { category: 'admin' },
-  parts: [{ data: sub('create'), execute: noop }],
+  groups: { meta: 'The details of a gym' },
+  parts: [
+    { data: sub('create'), execute: noop },
+    { group: 'meta', data: sub('show'), execute: noop },
+  ],
 });
 
 const { ctx } = createTestContext({ commands: [help, route, gym] });
@@ -95,6 +99,17 @@ describe('/help', () => {
     expect(payload.embeds?.[0]?.toJSON().title).toBe('/gym create');
   });
 
+  it('explains a group of subcommands to staff, and to members as if it did not exist', async () => {
+    await expect(ask({ options: { command: 'gym meta' } })).rejects.toThrow(
+      'There is no /gym meta command.',
+    );
+    const payload = await ask({ options: { command: '/Gym Meta' }, ...MODERATOR });
+    expect(payload.embeds?.[0]?.toJSON()).toMatchObject({
+      title: '/gym meta',
+      fields: [{ name: 'Usage', value: '`/gym meta show` About show' }],
+    });
+  });
+
   it('autocompletes command and subcommand names, those that start with the text first', async () => {
     expect(await choices('he')).toEqual(['help']);
     expect(await choices('')).toEqual(['help', 'route', 'route add', 'route show']);
@@ -105,7 +120,12 @@ describe('/help', () => {
 
   it('offers staff commands to staff only', async () => {
     expect(await choices('gym')).toEqual([]);
-    expect(await choices('gym', MODERATOR)).toEqual(['gym', 'gym create']);
+    expect(await choices('gym', MODERATOR)).toEqual([
+      'gym',
+      'gym create',
+      'gym meta',
+      'gym meta show',
+    ]);
   });
 
   it('works in a DM, where nobody but the owner is staff', async () => {
diff --git a/src/commands/util/help.ts b/src/commands/util/help.ts
index 7c63b69baf2e01db47fd23e2af71408733f1cfe1..b8c9cd64105660680dd03a54353c027d32905911 100644
--- a/src/commands/util/help.ts
+++ b/src/commands/util/help.ts
@@ -1,4 +1,9 @@
-import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
+import {
+  ApplicationCommandOptionType,
+  InteractionContextType,
+  MessageFlags,
+  SlashCommandBuilder,
+} from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import {
   declaredSubcommands,
@@ -53,7 +58,12 @@ export const help: SimpleCommand = {
   help: {
     category: 'util',
     details: 'Without a command, lists the commands you can use. With one, explains it.',
-    examples: ['/help', '/help command:raid', '/help command:route add'],
+    examples: [
+      '/help',
+      '/help command:raid',
+      '/help command:route add',
+      '/help command:route saved',
+    ],
   },
 
   async execute(interaction, ctx) {
@@ -81,12 +91,18 @@ export const help: SimpleCommand = {
 
   async autocomplete(interaction, ctx) {
     const typed = normalise(interaction.options.getFocused());
-    const names = visibleCommands(isStaff(interaction, ctx), ctx).flatMap((command) => [
-      command.data.name,
-      ...declaredSubcommands(command.data.toJSON().options).map(
-        (path) => `${command.data.name} ${path}`,
-      ),
-    ]);
+    const names = visibleCommands(isStaff(interaction, ctx), ctx).flatMap((command) => {
+      const { options } = command.data.toJSON();
+      const groups = (options ?? []).flatMap((option) =>
+        option.type === ApplicationCommandOptionType.SubcommandGroup ? [option.name] : [],
+      );
+      return [
+        command.data.name,
+        ...[...groups, ...declaredSubcommands(options)].map(
+          (path) => `${command.data.name} ${path}`,
+        ),
+      ];
+    });
     const startsFirst = (a: string, b: string) =>
       Number(!a.startsWith(typed)) - Number(!b.startsWith(typed)) || a.localeCompare(b);
     const choices = names
diff --git a/src/db/repositories/pokemon-repository.db.test.ts b/src/db/repositories/pokemon-repository.db.test.ts
index d775d9732d9a26afde93cb06055c5c0dba51085d..da6fe979920e256b98c8e8ac8fe20b0e133a3991 100644
--- a/src/db/repositories/pokemon-repository.db.test.ts
+++ b/src/db/repositories/pokemon-repository.db.test.ts
@@ -115,6 +115,42 @@ describe('PokemonRepository', () => {
     expect(row.nickname).toBe('alien');
   });
 
+  it('removes a nickname from every row that holds the Pokémon, as they are read together', async () => {
+    await db
+      .insertInto('Pokemon')
+      .values([
+        { name: 'deoxys', nickname: 'dna, Space  Bug' },
+        { name: 'deoxys_normal', nickname: 'DNA, alien' },
+      ])
+      .execute();
+    expect(await pokemon.removeNickname('deoxys', ' dna ')).toBe(true);
+    expect(await pokemon.removeNickname('deoxys', 'alien')).toBe(true);
+    expect(await pokemon.removeNickname('deoxys', 'space bug')).toBe(true);
+    const rows = await db
+      .selectFrom('Pokemon')
+      .select(['name', 'nickname'])
+      .orderBy('id')
+      .execute();
+    expect(rows).toEqual([
+      { name: 'deoxys', nickname: '' },
+      { name: 'deoxys_normal', nickname: '' },
+    ]);
+    expect(await pokemon.nicknames()).toEqual(new Map());
+  });
+
+  it('adds nothing that another row of the Pokémon holds already', async () => {
+    await db
+      .insertInto('Pokemon')
+      .values([
+        { name: 'deoxys', nickname: 'second' },
+        { name: 'deoxys_normal', nickname: 'first' },
+      ])
+      .execute();
+    expect(await pokemon.addNickname('deoxys', 'First')).toEqual(['second', 'first']);
+    const rows = await db.selectFrom('Pokemon').select('nickname').orderBy('id').execute();
+    expect(rows).toEqual([{ nickname: 'second' }, { nickname: 'first' }]);
+  });
+
   it('uses the lowest id when several rows could hold the Pokémon', async () => {
     await db
       .insertInto('Pokemon')
diff --git a/src/db/repositories/pokemon-repository.ts b/src/db/repositories/pokemon-repository.ts
index 9affad93d8c9f68ba5133fe3488b952780587af0..040382ac461fa766b1fa43750ae204f1c59ee22a 100644
--- a/src/db/repositories/pokemon-repository.ts
+++ b/src/db/repositories/pokemon-repository.ts
@@ -4,6 +4,7 @@ import {
   legacyNameForKey,
   legacyNamesForKey,
 } from '../../domain/pogo/legacy-names.js';
+import { tidyNickname } from '../../domain/pogo/nickname-rules.js';
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
 
@@ -22,8 +23,9 @@ function storedNicknames(stored: string | null): string[] {
     .filter((nickname) => nickname !== '');
 }
 
+/** The stored nicknames as they are compared and searched: tidied (`tidyNickname`). */
 function parseNicknames(stored: string | null): string[] {
-  return storedNicknames(stored).map((nickname) => nickname.toLowerCase());
+  return storedNicknames(stored).map(tidyNickname);
 }
 
 function clean(nickname: string): string {
@@ -77,7 +79,10 @@ export class PokemonRepository {
     const added = clean(nickname);
     if (added.length > MAX_STORED_LENGTH) throw new RangeError('The nickname is too long');
     return inTransaction(this.db, async (trx) => {
-      const row = await this.findRow(trx, key);
+      const rows = await this.findRows(trx, key);
+      const all = [...new Set(rows.flatMap((one) => parseNicknames(one.nickname)))];
+      if (all.includes(tidyNickname(added))) return all;
+      const [row] = rows;
       if (!row) {
         await trx
           .insertInto('Pokemon')
@@ -86,40 +91,50 @@ export class PokemonRepository {
         return [added];
       }
       const stored = storedNicknames(row.nickname);
-      const nicknames = stored.map((n) => n.toLowerCase());
-      if (nicknames.includes(added)) return nicknames;
       const joined = [...stored, added].join(SEPARATOR);
       if (joined.length > MAX_STORED_LENGTH) {
         throw new RangeError('The nicknames would not fit in the stored string');
       }
       await trx.updateTable('Pokemon').set({ nickname: joined }).where('id', '=', row.id).execute();
-      return [...nicknames, added];
+      return [...all, tidyNickname(added)];
     });
   }
 
-  /** Returns false when the Pokémon did not have that nickname. Other nicknames are untouched. */
+  /**
+   * Removes a nickname from every row that holds the Pokémon (`nicknames` reads them together),
+   * compared as `tidyNickname` writes it. Returns false when none had it. Other nicknames are
+   * untouched.
+   */
   async removeNickname(key: string, nickname: string): Promise<boolean> {
-    const removed = nickname.trim().toLowerCase();
+    const removed = tidyNickname(nickname);
     return inTransaction(this.db, async (trx) => {
-      const row = await this.findRow(trx, key);
-      const stored = storedNicknames(row?.nickname ?? null);
-      if (!row || !stored.some((n) => n.toLowerCase() === removed)) return false;
-      await trx
-        .updateTable('Pokemon')
-        .set({ nickname: stored.filter((n) => n.toLowerCase() !== removed).join(SEPARATOR) })
-        .where('id', '=', row.id)
-        .execute();
-      return true;
+      let found = false;
+      for (const row of await this.findRows(trx, key)) {
+        const stored = storedNicknames(row.nickname);
+        const kept = stored.filter((one) => tidyNickname(one) !== removed);
+        if (kept.length === stored.length) continue;
+        found = true;
+        await trx
+          .updateTable('Pokemon')
+          .set({ nickname: kept.join(SEPARATOR) })
+          .where('id', '=', row.id)
+          .execute();
+      }
+      return found;
     });
   }
 
-  /** The row holding this Pokémon under any of its legacy names, lowest id first. */
-  private findRow(db: Kysely<DB>, key: string) {
+  /**
+   * The rows holding this Pokémon under any of its legacy names, lowest id first, locked for the
+   * rest of the transaction.
+   */
+  private findRows(db: Kysely<DB>, key: string) {
     return db
       .selectFrom('Pokemon')
       .select(['id', 'nickname'])
       .where('name', 'in', legacyNamesForKey(key))
       .orderBy('id')
-      .executeTakeFirst();
+      .forUpdate()
+      .execute();
   }
 }
diff --git a/src/domain/pogo/boss-diff.test.ts b/src/domain/pogo/boss-diff.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..252736754450a16623734f85b4d1da5713c6d9f5
--- /dev/null
+++ b/src/domain/pogo/boss-diff.test.ts
@@ -0,0 +1,38 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { diffBosses } from './boss-diff.js';
+import type { FeedBoss } from './raid-boss-feed.js';
+import { effectiveBosses } from './raid-bosses.js';
+import type { RaidTier } from './raid-tier.js';
+
+const T1: RaidTier = { level: 'T1', shadow: false };
+const T5: RaidTier = { level: 'T5', shadow: false };
+const catalogue = catalogueFixture();
+
+function row(pokemonId: string, tier: RaidTier, form: string | null = null): FeedBoss {
+  const name = pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase();
+  return { pokemonId, form, tier, shiny: false, name };
+}
+const list = (...rows: FeedBoss[]) => effectiveBosses(rows, [], catalogue, 0);
+
+describe('diffBosses', () => {
+  it('gives the bosses that came and went, by key and tier', () => {
+    const change = diffBosses(
+      list(row('YVELTAL', T5), row('MAGIKARP', T1)),
+      list(row('ZEKROM', T5), row('MAGIKARP', T1), row('YVELTAL', T1)),
+    );
+    expect(change.added.map((boss) => `${boss.key} ${boss.tier.level}`)).toEqual([
+      'yveltal T1',
+      'zekrom T5',
+    ]);
+    expect(change.removed.map((boss) => `${boss.key} ${boss.tier.level}`)).toEqual(['yveltal T5']);
+  });
+
+  it('sees no change in a costume id the feed renamed', () => {
+    const change = diffBosses(
+      list(row('PIKACHU', T1, 'PIKACHU_GLASS_HELMET_2026')),
+      list(row('PIKACHU', T1, 'PIKACHU_GLASS_HELMET_2027')),
+    );
+    expect(change).toEqual({ added: [], removed: [] });
+  });
+});
diff --git a/src/domain/pogo/boss-diff.ts b/src/domain/pogo/boss-diff.ts
new file mode 100644
index 0000000000000000000000000000000000000000..00d5bff155d6df7e51c5c3067ea1c8c4ca1f37a8
--- /dev/null
+++ b/src/domain/pogo/boss-diff.ts
@@ -0,0 +1,24 @@
+import type { RaidBoss } from './raid-bosses.js';
+import { sameRaidTier } from './raid-tier.js';
+
+/** What members see change between two boss lists in effect. */
+export interface SeenChange {
+  /** Bosses of the later list that the earlier did not have (by key and tier), in its order. */
+  added: RaidBoss[];
+  /** Bosses of the earlier list that the later does not have, in its order. */
+  removed: RaidBoss[];
+}
+
+const same = (a: RaidBoss, b: RaidBoss): boolean => a.key === b.key && sameRaidTier(a.tier, b.tier);
+
+/**
+ * The bosses that came and went between two lists in effect (`effectiveBosses`), compared as
+ * members see them: by key and tier. A boss the feed renamed (one costume id for the next) has
+ * the same key and is no change; a boss an override hides or adds counts as the list shows it.
+ */
+export function diffBosses(before: readonly RaidBoss[], after: readonly RaidBoss[]): SeenChange {
+  return {
+    added: after.filter((boss) => !before.some((other) => same(boss, other))),
+    removed: before.filter((boss) => !after.some((other) => same(boss, other))),
+  };
+}
diff --git a/src/domain/pogo/nickname-rules.test.ts b/src/domain/pogo/nickname-rules.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fc4887d837c2963d0090c5a238903cb684a1956f
--- /dev/null
+++ b/src/domain/pogo/nickname-rules.test.ts
@@ -0,0 +1,74 @@
+import { describe, expect, it } from 'vitest';
+import { nicknameProblem, tidyNickname } from './nickname-rules.js';
+
+describe('tidyNickname', () => {
+  it('trims, joins words with one space and writes lower case', () => {
+    expect(tidyNickname('  Danger   Noodle \t')).toBe('danger noodle');
+    expect(tidyNickname('ÉCLAIR')).toBe('éclair');
+  });
+});
+
+describe('nicknameProblem', () => {
+  it('takes letters, digits, spaces and hyphens', () => {
+    expect(nicknameProblem('danger noodle')).toBeUndefined();
+    expect(nicknameProblem('big-x2')).toBeUndefined();
+    expect(nicknameProblem('pokémon')).toBeUndefined();
+    expect(nicknameProblem('ab')).toBeUndefined();
+    expect(nicknameProblem('a'.repeat(30))).toBeUndefined();
+  });
+
+  it('refuses what is too short or too long, counted in characters', () => {
+    expect(nicknameProblem('a')).toBe('length');
+    expect(nicknameProblem('a'.repeat(31))).toBe('length');
+    expect(nicknameProblem('é'.repeat(30))).toBeUndefined();
+  });
+
+  it('refuses commas, punctuation and symbols', () => {
+    expect(nicknameProblem('a, b')).toBe('characters');
+    expect(nicknameProblem('ttar!')).toBe('characters');
+    expect(nicknameProblem('<@123>')).toBe('characters');
+    expect(nicknameProblem('a_b')).toBe('characters');
+  });
+
+  it('refuses digits alone, which read as a Pokédex number', () => {
+    expect(nicknameProblem('150')).toBe('no-letter');
+    expect(nicknameProblem('1-2')).toBe('no-letter');
+  });
+
+  it('refuses the words that the Pokémon options read as something else', () => {
+    for (const word of [
+      'shadow',
+      'shadow ttar',
+      'mega',
+      'none',
+      'perfect',
+      'hundo',
+      'zero',
+      'useless',
+      'nundo',
+      'legendary',
+      'elite',
+      'super mega',
+      'mega legendary',
+      't5',
+      'tier 5',
+      'level 3',
+      '5 star',
+      'egg',
+      'raid',
+      'spawn',
+      'boss',
+      'primal',
+      'ex',
+    ]) {
+      expect(nicknameProblem(tidyNickname(word)), word).toBe('reserved');
+    }
+    expect(nicknameProblem('megaman')).toBeUndefined();
+    // Words that only a phrase makes a tier are free by themselves.
+    expect(nicknameProblem('shooting star')).toBeUndefined();
+    expect(nicknameProblem('level up')).toBeUndefined();
+    expect(nicknameProblem('super fan')).toBeUndefined();
+    expect(nicknameProblem('top tier')).toBeUndefined();
+    expect(nicknameProblem('noodle')).toBeUndefined();
+  });
+});
diff --git a/src/domain/pogo/nickname-rules.ts b/src/domain/pogo/nickname-rules.ts
new file mode 100644
index 0000000000000000000000000000000000000000..22739f5928a3831b4a2963b1d27aeb203e1c952b
--- /dev/null
+++ b/src/domain/pogo/nickname-rules.ts
@@ -0,0 +1,71 @@
+/**
+ * What a nickname that staff add for a Pokémon may be (`/admin nickname add`). The legacy table
+ * keeps every nickname of a Pokémon in one string joined with ", ", in lower case; that format
+ * stays while the legacy bot reads it.
+ */
+import { searchTokens } from '../search/text.js';
+import { wantWord } from './wants.js';
+
+export const NICKNAME_MIN = 2;
+export const NICKNAME_MAX = 30;
+
+/**
+ * Words the options that take a Pokémon read as something else: a tier, shadow, an egg, an IV
+ * target, `none` (clears a train's boss). A nickname with one of them as a word would be read
+ * that way, or take the word from every Pokémon. Words that only a phrase makes a tier (`5 star`,
+ * `tier 5`, `super mega`) are refused as that phrase by `wantWord`, and free by themselves.
+ */
+const RESERVED_WORDS: ReadonlySet<string> = new Set([
+  'shadow',
+  'none',
+  'mega',
+  'primal',
+  'legendary',
+  'elite',
+  'ex',
+  'exclusive',
+  'egg',
+  'eggs',
+  'raid',
+  'raids',
+  'spawn',
+  'spawns',
+  'boss',
+  'bosses',
+  'perfect',
+  'hundo',
+  'zero',
+  'useless',
+  'nundo',
+]);
+
+/** Letters (with their accents), digits, spaces and hyphens; nothing else. */
+const ALLOWED = /^[\p{L}\p{M}\p{N} -]+$/u;
+const LETTER = /\p{L}/u;
+
+/** A nickname as it is stored: trimmed, one space between words, lower case. */
+export function tidyNickname(text: string): string {
+  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
+}
+
+/**
+ * - `length`: shorter than `NICKNAME_MIN` or longer than `NICKNAME_MAX` characters;
+ * - `characters`: something other than letters, digits, spaces and hyphens (a comma would split
+ *   the stored string);
+ * - `no-letter`: digits alone, which members type as a Pokédex number;
+ * - `reserved`: a word the Pokémon options read as something else (`RESERVED_WORDS`), or a
+ *   tier or IV target as `/want` reads it (`t5`, `5 star`).
+ */
+export type NicknameProblem = 'length' | 'characters' | 'no-letter' | 'reserved';
+
+/** What is wrong with a tidied nickname (`tidyNickname`); undefined when it can be stored. */
+export function nicknameProblem(nickname: string): NicknameProblem | undefined {
+  const length = [...nickname].length;
+  if (length < NICKNAME_MIN || length > NICKNAME_MAX) return 'length';
+  if (!ALLOWED.test(nickname)) return 'characters';
+  if (!LETTER.test(nickname)) return 'no-letter';
+  if (wantWord(nickname) || searchTokens(nickname).some((word) => RESERVED_WORDS.has(word))) {
+    return 'reserved';
+  }
+  return undefined;
+}
diff --git a/src/domain/pogo/pokemon-search.ts b/src/domain/pogo/pokemon-search.ts
index 9ea12108c354e2bf5c6bb89ed5163331f430180e..134f1c9c56652c0244fb9a079acd79dc12adab4a 100644
--- a/src/domain/pogo/pokemon-search.ts
+++ b/src/domain/pogo/pokemon-search.ts
@@ -195,6 +195,8 @@ export function mergeNicknames(
 export class PokemonSearch {
   private readonly index: MiniSearch<PokemonDocument>;
   private readonly exactTexts = new Map<string, PokemonEntry | null>();
+  /** Every entry a folded text is the name, key, id or a nickname of. */
+  private readonly owners = new Map<string, PokemonEntry[]>();
   /** For a looks-only form: the words that tell it from its species. */
   private readonly formWords = new Map<string, Set<string>>();
   /** By entry: the words of its own key, as against those of the ids that stand for it. */
@@ -250,6 +252,9 @@ export class PokemonSearch {
   private remember(text: string, entry: PokemonEntry): void {
     const folded = searchText(text);
     if (folded === '') return;
+    const owners = this.owners.get(folded);
+    if (!owners) this.owners.set(folded, [entry]);
+    else if (!owners.includes(entry)) owners.push(entry);
     const known = this.exactTexts.get(folded);
     if (known === undefined) this.exactTexts.set(folded, entry);
     else if (known !== entry) this.exactTexts.set(folded, null);
@@ -392,6 +397,15 @@ export class PokemonSearch {
     return this.exactTexts.get(searchText(text)) ?? undefined;
   }
 
+  /**
+   * Every entry this text is already the name, the key, an id or a nickname of, compared as
+   * `exact` compares (without regard to case, spaces and punctuation); empty when it names none.
+   * For a new nickname, which must not be another Pokémon's.
+   */
+  namedBy(text: string): PokemonEntry[] {
+    return [...(this.owners.get(searchText(text)) ?? [])];
+  }
+
   /**
    * What a text finds, best first, each hit with how it fits (`PokemonMatch`): the entry the
    * text names outright, then the order the class describes; among the hits a text leads to
diff --git a/src/services/pokemon-search-service.test.ts b/src/services/pokemon-search-service.test.ts
index e3cdda60992a5bc9107e7b0948085a682d9c82ef..89f389418c328558cecbf2caceeb5b83def4882c 100644
--- a/src/services/pokemon-search-service.test.ts
+++ b/src/services/pokemon-search-service.test.ts
@@ -1,20 +1,29 @@
 import { describe, expect, it } from 'vitest';
 import { gameDataFixture } from '../../test/support/game-data.js';
+import { MemoryNicknames } from '../../test/support/nicknames.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
 import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { PokemonSearchService } from './pokemon-search-service.js';
 
 function service(stored: Record<string, string[]> = {}) {
-  const state = { stored, reads: 0, failing: false };
+  const nicknames = new MemoryNicknames(stored);
   const gameData = { catalogue: new PokemonCatalogue(gameDataFixture()) };
-  const search = new PokemonSearchService(gameData, {
-    nicknames: () => {
-      state.reads += 1;
-      return state.failing
-        ? Promise.reject(new Error('database is down'))
-        : Promise.resolve(new Map(Object.entries(state.stored)));
+  const { log, entries } = createTestLogger();
+  const search = new PokemonSearchService(gameData, nicknames, log);
+  // `stored` is replaced by a test that changes the rows behind the back of the service.
+  const state = {
+    get reads() {
+      return nicknames.reads;
     },
-  });
-  return { search, gameData, state };
+    set failing(value: boolean) {
+      nicknames.failing = value;
+    },
+    set stored(value: Record<string, string[]>) {
+      nicknames.rows.clear();
+      for (const [key, list] of Object.entries(value)) nicknames.rows.set(key, list);
+    },
+  };
+  return { search, gameData, state, nicknames, entries };
 }
 
 const first = (search: PokemonSearchService, text: string) => search.search(text)[0]?.key;
@@ -113,4 +122,151 @@ describe('PokemonSearchService', () => {
     expect(search.search('mewtwo')[0]).toBe(before);
     expect(before).toBe(gameData.catalogue.byKey('mewtwo'));
   });
+
+  describe('nicknames staff add and remove', () => {
+    const entry = (search: PokemonSearchService, key: string) => {
+      const found = search.exact(key);
+      if (!found) throw new Error(key);
+      return found;
+    };
+
+    it('adds a nickname tidied, finds the Pokémon by it at once and lists it', async () => {
+      const { search, nicknames } = service({ dratini: ['danger noodle'] });
+      await search.reloadNicknames();
+      const dratini = entry(search, 'dratini');
+      expect(await search.add(dratini, '  Noodle   Boi ')).toEqual({
+        kind: 'added',
+        nickname: 'noodle boi',
+        nicknames: ['danger noodle', 'noodle boi'],
+      });
+      expect(nicknames.rows.get('dratini')).toEqual(['danger noodle', 'noodle boi']);
+      expect(search.exact('noodle boi')?.key).toBe('dratini');
+      expect(search.stored().get('dratini')).toEqual(['danger noodle', 'noodle boi']);
+    });
+
+    it('refuses what is no nickname without writing', async () => {
+      const { search, nicknames } = service();
+      const dratini = entry(search, 'dratini');
+      expect(await search.add(dratini, 'a')).toEqual({ kind: 'refused', problem: 'length' });
+      expect(await search.add(dratini, 'a,b')).toEqual({ kind: 'refused', problem: 'characters' });
+      expect(nicknames.rows.size).toBe(0);
+    });
+
+    it('refuses a name, an id or a nickname of another Pokémon, naming it', async () => {
+      const { search } = service({ magikarp: ['splashy'] });
+      await search.reloadNicknames();
+      const dratini = entry(search, 'dratini');
+      const taken = async (text: string) => {
+        const result = await search.add(dratini, text);
+        return result.kind === 'taken' ? result.by.map((one) => one.key) : result.kind;
+      };
+      expect(await taken('Mewtwo')).toEqual(['mewtwo']);
+      expect(await taken('ttar')).toEqual(['tyranitar']);
+      expect(await taken('splashy')).toEqual(['magikarp']);
+      expect(await taken('giratina')).toEqual(['giratina_altered']);
+      expect(await taken('ho oh')).toEqual(['ho_oh']);
+    });
+
+    it('says when the text already finds that Pokémon', async () => {
+      const { search, nicknames } = service({ dratini: ['danger noodle'] });
+      await search.reloadNicknames();
+      const dratini = entry(search, 'dratini');
+      expect(await search.add(dratini, 'Dratini')).toEqual({
+        kind: 'already',
+        nickname: 'dratini',
+      });
+      expect(await search.add(dratini, 'danger noodle')).toMatchObject({ kind: 'already' });
+      expect(nicknames.rows.get('dratini')).toEqual(['danger noodle']);
+    });
+
+    it('says when the nicknames would not fit the stored string', async () => {
+      const { search } = service({ dratini: ['x'.repeat(250)] });
+      await search.reloadNicknames();
+      expect(await search.add(entry(search, 'dratini'), 'wiggle')).toEqual({
+        kind: 'full',
+        nickname: 'wiggle',
+      });
+    });
+
+    it('removes a stored nickname and stops finding the Pokémon by it', async () => {
+      const { search, nicknames } = service({ dratini: ['danger noodle', 'wiggle'] });
+      await search.reloadNicknames();
+      const dratini = entry(search, 'dratini');
+      expect(await search.remove(dratini, 'Danger Noodle')).toBe(true);
+      expect(nicknames.rows.get('dratini')).toEqual(['wiggle']);
+      expect(search.exact('danger noodle')).toBeUndefined();
+      expect(await search.remove(dratini, 'danger noodle')).toBe(false);
+      expect(await search.remove(dratini, 'ttar')).toBe(false);
+    });
+
+    it('keeps a write that stood when only the read after it fails', async () => {
+      const { search, nicknames, entries } = service();
+      await search.reloadNicknames();
+      nicknames.failing = true;
+      const dratini = entry(search, 'dratini');
+      expect(await search.add(dratini, 'wiggle')).toMatchObject({ kind: 'added' });
+      expect(search.exact('wiggle')?.key).toBe('dratini');
+      expect(
+        entries.filter((e) => e['msg'] === 'could not read the Pokémon nicknames again'),
+      ).toHaveLength(1);
+      expect(await search.remove(dratini, 'wiggle')).toBe(true);
+      expect(search.exact('wiggle')).toBeUndefined();
+    });
+
+    it('keeps every row of the Pokémon when only the read after a write fails', async () => {
+      const { search, nicknames } = service({ deoxys: ['dna'], deoxys_normal: ['alien'] });
+      await search.reloadNicknames();
+      const deoxys = entry(search, 'deoxys');
+      nicknames.failing = true;
+      expect(await search.add(deoxys, 'space bug')).toMatchObject({ kind: 'added' });
+      expect([...(search.stored().get(deoxys.key) ?? [])].sort()).toEqual([
+        'alien',
+        'dna',
+        'space bug',
+      ]);
+      expect(await search.remove(deoxys, 'Alien')).toBe(true);
+      expect(nicknames.rows.get('deoxys_normal')).toEqual([]);
+      expect([...(search.stored().get(deoxys.key) ?? [])].sort()).toEqual(['dna', 'space bug']);
+    });
+
+    it('removes a nickname from every row that holds the Pokémon', async () => {
+      const { search, nicknames } = service({ deoxys: ['dna'], deoxys_normal: ['DNA', 'alien'] });
+      await search.reloadNicknames();
+      expect(await search.remove(entry(search, 'deoxys'), 'dna')).toBe(true);
+      expect(nicknames.rows.get('deoxys')).toEqual([]);
+      expect(nicknames.rows.get('deoxys_normal')).toEqual(['alien']);
+      expect(search.exact('dna')).toBeUndefined();
+    });
+
+    it('applies overlapping reads in the order they were asked for', async () => {
+      const { search, nicknames } = service();
+      const release = nicknames.holdRead();
+      const slow = search.reloadNicknames();
+      const added = search.add(entry(search, 'dratini'), 'wiggle');
+      const fast = search.reloadNicknames();
+      // Nothing after the held read has run yet.
+      await Promise.resolve();
+      expect(nicknames.rows.size).toBe(0);
+      release();
+      await Promise.all([slow, added, fast]);
+      expect(search.exact('wiggle')?.key).toBe('dratini');
+      expect(nicknames.reads).toBe(3);
+    });
+
+    it('goes on after a read that failed', async () => {
+      const { search, nicknames } = service({ dratini: ['wiggle'] });
+      nicknames.failing = true;
+      await expect(search.reloadNicknames()).rejects.toThrow('database is down');
+      nicknames.failing = false;
+      await search.reloadNicknames();
+      expect(search.exact('wiggle')?.key).toBe('dratini');
+    });
+
+    it('knows the curated nicknames of an entry', () => {
+      const { search } = service();
+      expect(search.curated('tyranitar')).toContain('ttar');
+      expect(search.curated('toString')).toEqual([]);
+      expect(search.curated('dratini')).toEqual(['noodle']);
+    });
+  });
 });
diff --git a/src/services/pokemon-search-service.ts b/src/services/pokemon-search-service.ts
index 0f755c85bb6f6d4e72431b7313d594070ddd420c..620845f74e2b7db2810c19a4e8b8e7ef8fd325e8 100644
--- a/src/services/pokemon-search-service.ts
+++ b/src/services/pokemon-search-service.ts
@@ -1,5 +1,10 @@
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import type { PokemonEntry } from '../domain/pogo/game-master.js';
+import {
+  nicknameProblem,
+  tidyNickname,
+  type NicknameProblem,
+} from '../domain/pogo/nickname-rules.js';
 import { CURATED_NICKNAMES } from '../domain/pogo/nicknames.js';
 import {
   PokemonSearch,
@@ -7,6 +12,7 @@ import {
   type PokemonHit,
   type PokemonSearchOptions,
 } from '../domain/pogo/pokemon-search.js';
+import type { Logger } from '../log.js';
 import type { GameDataProvider } from './game-data-service.js';
 
 /** The part of `PokemonRepository` the search reads. */
@@ -14,6 +20,13 @@ export interface NicknameSource {
   nicknames(): Promise<Map<string, string[]>>;
 }
 
+/** The part of `PokemonRepository` that staff change nicknames through (`/admin nickname`). */
+export interface NicknameStore extends NicknameSource {
+  /** Throws RangeError when the stored string would be longer than its column. */
+  addNickname(key: string, nickname: string): Promise<string[]>;
+  removeNickname(key: string, nickname: string): Promise<boolean>;
+}
+
 /** What handlers need: Pokémon by what members type. */
 export interface PokemonFinder {
   /**
@@ -34,24 +47,55 @@ export interface PokemonFinder {
   exact(text: string): PokemonEntry | undefined;
 }
 
+/**
+ * What came of adding a nickname:
+ * - `added`: stored; `nicknames` are the Pokémon's stored nicknames afterwards;
+ * - `refused`: the text is no nickname (`NicknameProblem`);
+ * - `taken`: it is already the name, an id or a nickname of these other Pokémon;
+ * - `already`: it already finds this Pokémon (its name, an id, or a nickname it has);
+ * - `full`: the Pokémon's nicknames would not fit the legacy column with it.
+ */
+export type NicknameAdded =
+  | { kind: 'added'; nickname: string; nicknames: string[] }
+  | { kind: 'refused'; problem: NicknameProblem }
+  | { kind: 'taken'; nickname: string; by: PokemonEntry[] }
+  | { kind: 'already'; nickname: string }
+  | { kind: 'full'; nickname: string };
+
+/** The nicknames staff add for searching (`/admin nickname`). */
+export interface PokemonNicknames {
+  /** The moderators' nicknames as last read, by catalogue key, in lower case. */
+  stored(): ReadonlyMap<string, readonly string[]>;
+  /** The nicknames that come with the bot (`CURATED_NICKNAMES`) of an entry. */
+  curated(key: string): readonly string[];
+  add(entry: PokemonEntry, text: string): Promise<NicknameAdded>;
+  /** Whether the Pokémon had that stored nickname (curated ones cannot be removed). */
+  remove(entry: PokemonEntry, text: string): Promise<boolean>;
+}
+
 /**
  * The Pokémon search over the game data in use and the nicknames (the curated list and the
  * moderators' from the database). The index is rebuilt by itself when the game data was
- * refreshed; call `reloadNicknames` after a nickname was added or removed.
+ * refreshed; call `reloadNicknames` after a nickname was added or removed elsewhere.
+ *
+ * Reads of the nicknames and the changes staff make run one at a time, in the order they were
+ * asked for: of two overlapping reads the later one is always applied last, and a nickname is
+ * looked at for clashes and written without another change in between.
  */
-export class PokemonSearchService implements PokemonFinder {
-  private stored = new Map<string, string[]>();
+export class PokemonSearchService implements PokemonFinder, PokemonNicknames {
+  private storedNicknames = new Map<string, string[]>();
   private built: { catalogue: PokemonCatalogue; search: PokemonSearch } | undefined;
+  private queue: Promise<unknown> = Promise.resolve();
 
   constructor(
     private readonly gameData: GameDataProvider,
-    private readonly source: NicknameSource,
+    private readonly source: NicknameStore,
+    private readonly log?: Logger,
   ) {}
 
   /** Reads the moderators' nicknames. Until this has run, only the curated ones are known. */
-  async reloadNicknames(): Promise<void> {
-    this.stored = await this.source.nicknames();
-    this.built = undefined;
+  reloadNicknames(): Promise<void> {
+    return this.inTurn(() => this.read());
   }
 
   search(text: string, options?: PokemonSearchOptions): PokemonEntry[] {
@@ -66,10 +110,79 @@ export class PokemonSearchService implements PokemonFinder {
     return this.current().exact(text);
   }
 
+  stored(): ReadonlyMap<string, readonly string[]> {
+    return mergeNicknames(this.gameData.catalogue, this.storedNicknames);
+  }
+
+  curated(key: string): readonly string[] {
+    return Object.hasOwn(CURATED_NICKNAMES, key) ? (CURATED_NICKNAMES[key] ?? []) : [];
+  }
+
+  add(entry: PokemonEntry, text: string): Promise<NicknameAdded> {
+    const nickname = tidyNickname(text);
+    const problem = nicknameProblem(nickname);
+    if (problem) return Promise.resolve({ kind: 'refused', problem });
+    return this.inTurn(async (): Promise<NicknameAdded> => {
+      const owners = this.current().namedBy(nickname);
+      const others = owners.filter((owner) => owner.key !== entry.key);
+      if (others.length > 0) return { kind: 'taken', nickname, by: others };
+      if (owners.length > 0) return { kind: 'already', nickname };
+      let nicknames: string[];
+      try {
+        nicknames = await this.source.addNickname(entry.key, nickname);
+      } catch (err) {
+        if (err instanceof RangeError) return { kind: 'full', nickname };
+        throw err;
+      }
+      await this.readAfterWrite(entry.key, nicknames);
+      return { kind: 'added', nickname, nicknames };
+    });
+  }
+
+  remove(entry: PokemonEntry, text: string): Promise<boolean> {
+    const nickname = tidyNickname(text);
+    return this.inTurn(async () => {
+      const removed = await this.source.removeNickname(entry.key, nickname);
+      if (removed) {
+        const left = (this.stored().get(entry.key) ?? []).filter((one) => one !== nickname);
+        await this.readAfterWrite(entry.key, left);
+      }
+      return removed;
+    });
+  }
+
+  private async read(): Promise<void> {
+    this.storedNicknames = await this.source.nicknames();
+    this.built = undefined;
+  }
+
+  /**
+   * Reads the nicknames after a write that succeeded. If only the read fails, the write still
+   * stands: the failure is logged and the Pokémon's nicknames in memory are set to `nicknames`.
+   */
+  private async readAfterWrite(key: string, nicknames: string[]): Promise<void> {
+    try {
+      await this.read();
+    } catch (err) {
+      this.log?.warn({ err }, 'could not read the Pokémon nicknames again');
+      const patched = mergeNicknames(this.gameData.catalogue, this.storedNicknames);
+      patched.set(key, nicknames);
+      this.storedNicknames = patched;
+      this.built = undefined;
+    }
+  }
+
+  /** Runs `task` after everything asked for before it, whether that succeeded or not. */
+  private inTurn<T>(task: () => Promise<T>): Promise<T> {
+    const turn = this.queue.then(task, task);
+    this.queue = turn.catch(() => undefined);
+    return turn;
+  }
+
   private current(): PokemonSearch {
     const catalogue = this.gameData.catalogue;
     if (this.built?.catalogue !== catalogue) {
-      const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, this.stored);
+      const nicknames = mergeNicknames(catalogue, CURATED_NICKNAMES, this.storedNicknames);
       this.built = { catalogue, search: new PokemonSearch(catalogue, nicknames) };
     }
     return this.built.search;
diff --git a/src/services/raid-boss-service.test.ts b/src/services/raid-boss-service.test.ts
index a33a4c18c81bacc42003fa486d839dfcb9e77059..d2986a3db0ddcd245cdb5772d19a169767b4a22b 100644
--- a/src/services/raid-boss-service.test.ts
+++ b/src/services/raid-boss-service.test.ts
@@ -3,9 +3,14 @@ import { catalogueFixture, gameDataFixture } from '../../test/support/game-data.
 import { MemoryRaidBossStore, readRaidBossFeed } from '../../test/support/raid-bosses.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { PokemonCatalogue } from '../domain/pogo/catalogue.js';
-import type { BossListChange, NewBossOverride } from '../domain/pogo/raid-bosses.js';
+import type { NewBossOverride } from '../domain/pogo/raid-bosses.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
-import { RaidBossService, type FetchFeed, type StaleFeed } from './raid-boss-service.js';
+import {
+  RaidBossService,
+  type FeedChange,
+  type FetchFeed,
+  type StaleFeed,
+} from './raid-boss-service.js';
 
 const URL = 'https://example.test/raids.min.json';
 const MINUTE = 60_000;
@@ -71,7 +76,7 @@ describe('RaidBossService', () => {
     } = {},
   ) {
     const { log, entries } = createTestLogger();
-    const changes: BossListChange[] = [];
+    const changes: FeedChange[] = [];
     const stale: StaleFeed[] = [];
     const raidBosses = new RaidBossService({
       url: URL,
@@ -237,6 +242,33 @@ describe('RaidBossService', () => {
       expect(raidBosses.bossesOf(T5).map((b) => b.key)).toEqual(['yveltal']);
     });
 
+    it('says what members see change, with the overrides in force', async () => {
+      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'YVELTAL'], ['lvl3', 'STARMIE'])));
+      const { raidBosses, changes } = service();
+      await raidBosses.load();
+      await raidBosses.sync();
+      await raidBosses.addOverride(override({ action: 'hide', pokemonId: 'ZEKROM' }));
+      await raidBosses.addOverride(override({ action: 'add', pokemonId: 'YVELTAL' }));
+      now += HOUR;
+      respond = () =>
+        Promise.resolve(
+          reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl3', 'STARMIE'], ['lvl3', 'UMBREON'])),
+        );
+      const result = await raidBosses.sync();
+      // The feed dropped Yveltal and listed Zekrom; members still see Yveltal and never Zekrom.
+      expect(result).toMatchObject({
+        status: 'updated',
+        change: {
+          added: [{ pokemonId: 'ZEKROM' }, { pokemonId: 'UMBREON' }],
+          removed: [{ pokemonId: 'YVELTAL' }],
+        },
+      });
+      const seen = result.status === 'updated' ? result.change.seen : undefined;
+      expect(seen?.added.map((boss) => boss.key)).toEqual(['umbreon']);
+      expect(seen?.removed).toEqual([]);
+      expect(changes[0]?.seen.added.map((boss) => boss.key)).toEqual(['umbreon']);
+    });
+
     it('does not announce the first list of a new database', async () => {
       const { raidBosses, changes } = service();
       await raidBosses.load();
@@ -573,25 +605,48 @@ describe('RaidBossService', () => {
   });
 
   describe('a feed that cannot be used', () => {
-    const bad: [string, () => Promise<Response>, RegExp][] = [
-      ['an error status', () => Promise.resolve(reply(503, 'busy')), /answered 503/],
-      ['a redirect it was not sent', () => Promise.resolve(reply(302)), /answered 302/],
-      ['a page that is not JSON', () => Promise.resolve(reply(200, '<html>')), /did not send JSON/],
-      ['an empty body', () => Promise.resolve(reply(200, '')), /did not send JSON/],
+    const bad: [string, () => Promise<Response>, RegExp, object][] = [
+      [
+        'an error status',
+        () => Promise.resolve(reply(503, 'busy')),
+        /answered 503/,
+        { kind: 'status', httpStatus: 503 },
+      ],
+      [
+        'a redirect it was not sent',
+        () => Promise.resolve(reply(302)),
+        /answered 302/,
+        { kind: 'status', httpStatus: 302 },
+      ],
+      [
+        'a page that is not JSON',
+        () => Promise.resolve(reply(200, '<html>')),
+        /did not send JSON/,
+        { kind: 'unreadable' },
+      ],
+      [
+        'an empty body',
+        () => Promise.resolve(reply(200, '')),
+        /did not send JSON/,
+        { kind: 'unreadable' },
+      ],
       [
         'JSON of another shape',
         () => Promise.resolve(reply(200, '{"message":"Not Found"}')),
         /expected format/,
+        { kind: 'unreadable' },
       ],
       [
         'a list without bosses',
         () => Promise.resolve(reply(200, feedOf(['lvl9', 'RAYQUAZA']))),
         /lists no bosses/,
+        { kind: 'unreadable' },
       ],
       [
         'an enormous body',
         () => Promise.resolve(reply(200, ' '.repeat(2_000_001))),
         /not the raid boss feed/,
+        { kind: 'unreadable' },
       ],
       [
         'a network error',
@@ -602,10 +657,11 @@ describe('RaidBossService', () => {
             }),
           ),
         /ENOTFOUND/,
+        { kind: 'unreachable' },
       ],
     ];
 
-    it.each(bad)('keeps the list in use after %s', async (_what, response, reason) => {
+    it.each(bad)('keeps the list in use after %s', async (_what, response, reason, kind) => {
       const { raidBosses, entries, changes } = service();
       await raidBosses.load();
       await raidBosses.sync();
@@ -614,7 +670,7 @@ describe('RaidBossService', () => {
       respond = response;
       const result = await raidBosses.sync();
       expect(result.status).toBe('failed');
-      expect(result).toMatchObject({ reason: expect.stringMatching(reason) as unknown });
+      expect(result).toMatchObject({ reason: expect.stringMatching(reason) as unknown, ...kind });
       expect(raidBosses.bosses()).toHaveLength(14);
       expect(raidBosses.lastSyncedAt).toBe(synced);
       expect(await store.lastSyncedAt()).toBe(synced);
@@ -633,6 +689,7 @@ describe('RaidBossService', () => {
         });
       expect(await raidBosses.sync()).toMatchObject({
         status: 'failed',
+        kind: 'timeout',
         reason: expect.stringMatching(/timed out after 20 ms/) as unknown,
       });
     });
@@ -645,7 +702,11 @@ describe('RaidBossService', () => {
       now += HOUR;
       respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM']), { etag: '"new"' }));
       store.failing = new Error('connection lost');
-      expect(await raidBosses.sync()).toEqual({ status: 'failed', reason: 'connection lost' });
+      expect(await raidBosses.sync()).toEqual({
+        status: 'failed',
+        kind: 'storing',
+        reason: 'connection lost',
+      });
       expect(raidBosses.bosses()).toHaveLength(14);
       store.failing = undefined;
       expect((await raidBosses.sync()).status).toBe('updated');
@@ -715,7 +776,11 @@ describe('RaidBossService', () => {
       now += HOUR;
       respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM']), { etag: '"two"' }));
       store.failingMethods.add('listActive');
-      expect(await raidBosses.sync()).toEqual({ status: 'failed', reason: 'listActive failed' });
+      expect(await raidBosses.sync()).toEqual({
+        status: 'failed',
+        kind: 'storing',
+        reason: 'listActive failed',
+      });
       store.failingMethods.delete('listActive');
       now += HOUR;
       expect((await raidBosses.sync()).status).toBe('updated');
@@ -730,6 +795,8 @@ describe('RaidBossService', () => {
       await raidBosses.load();
       expect(await raidBosses.sync()).toEqual({
         status: 'failed',
+        kind: 'status',
+        httpStatus: 304,
         reason: `${URL} answered 304 to a request without validators`,
       });
       expect(raidBosses.lastSyncedAt).toBeUndefined();
@@ -805,16 +872,32 @@ describe('RaidBossService', () => {
       expect(stale).toHaveLength(2);
     });
 
-    it('counts from the start of the bot when the feed has never been read', async () => {
+    it('waits for a second failure in a row when the feed has never been read', async () => {
       respond = () => Promise.resolve(reply(503));
       const { raidBosses, stale } = service();
       await raidBosses.load();
-      now += 47 * HOUR;
+      now += 72 * HOUR;
       await raidBosses.sync();
       expect(stale).toEqual([]);
-      now += HOUR;
+      now += 5 * MINUTE;
       await raidBosses.sync();
       expect(stale).toEqual([{ lastSyncedAt: undefined, reason: `${URL} answered 503` }]);
+      await raidBosses.sync();
+      expect(stale).toHaveLength(1);
+    });
+
+    it('does not count a failure before a success towards the second one', async () => {
+      respond = () => Promise.resolve(reply(503));
+      const { raidBosses, stale } = service({ staleAfterMs: 0 });
+      await raidBosses.load();
+      await raidBosses.sync();
+      respond = () => Promise.resolve(reply(200, downloaded));
+      await raidBosses.sync();
+      respond = () => Promise.resolve(reply(503));
+      now += MINUTE;
+      await raidBosses.sync();
+      // A list was read: from now on the time since that read decides, not the count.
+      expect(stale).toEqual([{ lastSyncedAt: now - MINUTE, reason: `${URL} answered 503` }]);
     });
 
     it('counts from the last run when the bot starts with an old list', async () => {
@@ -845,6 +928,93 @@ describe('RaidBossService', () => {
     });
   });
 
+  describe('what a read says beyond its bosses', () => {
+    it('names the headings it does not know, until a read without them', async () => {
+      respond = () =>
+        Promise.resolve(
+          reply(
+            200,
+            JSON.stringify([
+              { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false },
+              { name: 'Mew', tier: 'Brand New Raids', canBeShiny: false },
+            ]),
+          ),
+        );
+      const { raidBosses } = service();
+      await raidBosses.load();
+      expect(raidBosses.unknownLevels).toEqual([]);
+      expect(await raidBosses.sync()).toMatchObject({
+        status: 'updated',
+        unknownLevels: ['Brand New Raids'],
+      });
+      expect(raidBosses.unknownLevels).toEqual(['Brand New Raids']);
+      now += HOUR;
+      expect(await raidBosses.sync()).toEqual({
+        status: 'unchanged',
+        unknownLevels: ['Brand New Raids'],
+      });
+      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
+      now += HOUR;
+      expect(await raidBosses.sync()).toEqual({ status: 'unchanged' });
+      expect(raidBosses.unknownLevels).toEqual([]);
+    });
+
+    it('says and logs that the list shrank to less than half', async () => {
+      const { raidBosses, entries } = service();
+      await raidBosses.load();
+      await raidBosses.sync();
+      const before = raidBosses.feedBosses().length;
+      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
+      now += HOUR;
+      expect(await raidBosses.sync()).toMatchObject({
+        status: 'updated',
+        shrank: { before, after: 1 },
+      });
+      expect(
+        entries.filter(
+          (e) => e['msg'] === 'the raid boss feed lists fewer than half the bosses it did',
+        ),
+      ).toMatchObject([{ before, after: 1 }]);
+    });
+
+    it('does not judge a short list or one that keeps half', async () => {
+      respond = () =>
+        Promise.resolve(
+          reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl5', 'MEW'], ['lvl3', 'STARMIE'])),
+        );
+      const { raidBosses } = service();
+      await raidBosses.load();
+      await raidBosses.sync();
+      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
+      now += HOUR;
+      expect(await raidBosses.sync()).not.toHaveProperty('shrank');
+      respond = () =>
+        Promise.resolve(
+          reply(
+            200,
+            feedOf(['lvl5', 'ZEKROM'], ['lvl5', 'MEW'], ['lvl3', 'STARMIE'], ['lvl1', 'MAGIKARP']),
+          ),
+        );
+      now += HOUR;
+      await raidBosses.sync();
+      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'], ['lvl5', 'MEW'])));
+      now += HOUR;
+      expect(await raidBosses.sync()).not.toHaveProperty('shrank');
+    });
+
+    it('gives the stored feed rows, which a caller cannot change', async () => {
+      respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
+      const { raidBosses } = service();
+      expect(() => raidBosses.feedBosses()).toThrow(/not been loaded/);
+      await raidBosses.load();
+      await raidBosses.sync();
+      const [row] = raidBosses.feedBosses();
+      expect(row).toMatchObject({ pokemonId: 'ZEKROM', name: 'Zekrom', firstSeen: now });
+      if (row) row.tier.level = 'T1';
+      expect(raidBosses.feedBosses()[0]?.tier.level).toBe('T5');
+    });
+  });
+
   describe('listeners', () => {
     it('keeps going when a listener throws, and stops telling one that unsubscribed', async () => {
       respond = () => Promise.resolve(reply(200, feedOf(['lvl5', 'ZEKROM'])));
@@ -1211,7 +1381,15 @@ describe('RaidBossService', () => {
       const syncing = raidBosses.sync();
       await vi.advanceTimersByTimeAsync(0);
       raidBosses.stop();
-      expect(await syncing).toEqual({ status: 'failed', reason: 'stopped' });
+      expect(await syncing).toEqual({ status: 'failed', kind: 'stopped', reason: 'stopped' });
+      // Once stopped, a sync asked for answers so at once and asks the feed nothing.
+      const asked = requests.length;
+      expect(await raidBosses.sync()).toEqual({
+        status: 'failed',
+        kind: 'stopped',
+        reason: 'stopped',
+      });
+      expect(requests).toHaveLength(asked);
     });
 
     it('is idle at once when nothing is running', async () => {
diff --git a/src/services/raid-boss-service.ts b/src/services/raid-boss-service.ts
index f4f2c07b379435f0aecc66cc857727974550cff8..32492a925f024698573117271528cdeb9ccbbac6 100644
--- a/src/services/raid-boss-service.ts
+++ b/src/services/raid-boss-service.ts
@@ -1,6 +1,7 @@
 import type { RaidBossStore, StoredBoss } from '../db/repositories/raid-boss-repository.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { feedLookupOf } from '../domain/pogo/feed-lookup.js';
+import { diffBosses, type SeenChange } from '../domain/pogo/boss-diff.js';
 import { parseRaidBossFeed } from '../domain/pogo/raid-boss-feed.js';
 import {
   autosetBoss,
@@ -25,10 +26,33 @@ const MINUTE_MS = 60_000;
 /** Consecutive failed attempts that are followed by a quick retry. */
 const QUICK_RETRIES = 3;
 const NOT_LOADED = 'The raid boss list has not been loaded yet';
+/** A list shorter than this is not judged for shrinking: a few bosses come and go each week. */
+export const SHRINK_FLOOR = 4;
 
 /** Thrown inside a sync that `stop` ended; never leaves the service. */
 class SyncStopped extends Error {}
 
+/**
+ * Why a read of the feed failed, for an answer to staff that never shows an address or a database
+ * message: `status` (the feed answered with an HTTP status that is no feed, `httpStatus`),
+ * `timeout`, `unreachable` (no answer at all), `unreadable` (an answer that is not the feed),
+ * `storing` (the database failed), `stopped` (the service was stopped).
+ */
+export type SyncFailure =
+  'status' | 'timeout' | 'unreachable' | 'unreadable' | 'storing' | 'stopped';
+
+/** A failure of the read itself, with its kind; anything else thrown in a sync is `storing`. */
+class FeedFailure extends Error {
+  constructor(
+    message: string,
+    readonly kind: Exclude<SyncFailure, 'storing' | 'stopped'>,
+    readonly httpStatus?: number,
+    options?: ErrorOptions,
+  ) {
+    super(message, options);
+  }
+}
+
 /** The part of `fetch` this service needs. */
 export type FetchFeed = (
   url: string,
@@ -72,13 +96,54 @@ export interface RaidBossProvider {
   autoset(tier: RaidTier): RaidBoss | undefined;
 }
 
+/** What a read of the feed says beyond its bosses; each part only when there is something to say. */
+export interface FeedRemarks {
+  /**
+   * The headings of the feed that Pine has no raid tier for (as `ParsedFeed.unknownLevels`): their
+   * bosses were left out. The only sign that a tier vanished because the feed renamed it.
+   */
+  unknownLevels?: string[];
+  /**
+   * The list has fewer than half the bosses it had (it had at least `SHRINK_FLOOR`): the feed may
+   * be broken in a way its checks do not see. The list is taken all the same.
+   */
+  shrank?: { before: number; after: number };
+}
+
+/**
+ * A change of the feed's list: the feed's own rows that came and went (`BossListChange`), and
+ * what members see change, the list in effect before and after with the overrides in force
+ * (`seen`): a boss an override hides or adds does not come or go for them.
+ */
+export interface FeedChange extends BossListChange {
+  seen: SeenChange;
+}
+
 export type SyncResult =
   /** The feed lists other bosses than before. */
-  | { status: 'updated'; change: BossListChange }
+  | ({ status: 'updated'; change: FeedChange } & FeedRemarks)
   /** The feed was read and lists the same bosses. */
-  | { status: 'unchanged' }
-  /** The feed could not be read or was not valid; the list in use is unchanged. */
-  | { status: 'failed'; reason: string };
+  | ({ status: 'unchanged' } & FeedRemarks)
+  /**
+   * The feed could not be read or was not valid; the list in use is unchanged. `reason` is for the
+   * log (it may hold the address or a database message); `kind` is what may be said.
+   */
+  | { status: 'failed'; kind: SyncFailure; httpStatus?: number; reason: string };
+
+/** What staff need of the boss list beyond what handlers read (`/admin boss`). */
+export interface RaidBossAdmin {
+  /** The bosses the feed listed at the last successful read, as stored. */
+  feedBosses(): StoredBoss[];
+  /** The overrides in force, oldest first. */
+  overrides(): BossOverride[];
+  addOverride(override: NewBossOverride): Promise<BossOverride>;
+  removeOverride(id: number): Promise<boolean>;
+  sync(): Promise<SyncResult>;
+  /** When the feed was last read successfully (epoch ms); undefined if it never was. */
+  readonly lastSyncedAt: number | undefined;
+  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
+  readonly unknownLevels: readonly string[];
+}
 
 export interface StaleFeed {
   /** When the feed was last read successfully (epoch ms); undefined if it never was. */
@@ -94,13 +159,12 @@ type Listener<T> = (event: T) => void | Promise<void>;
  * overrides. Nothing happens until `load` is called, and `load` never uses the network: the bot
  * starts with the list of the last run and the feed is read in the background.
  */
-export class RaidBossService implements RaidBossProvider {
+export class RaidBossService implements RaidBossProvider, RaidBossAdmin {
   private feed: StoredBoss[] = [];
   private overrideList: BossOverride[] = [];
   private loaded = false;
   private syncedAt: number | undefined;
   private attemptedAt: number | undefined;
-  private readonly startedAt: number;
   private readonly now: () => number;
   private readonly timeoutMs: number;
   private readonly retryMs: number;
@@ -119,15 +183,15 @@ export class RaidBossService implements RaidBossProvider {
   private stopped = false;
   private staleReported = false;
   private reportedSkipped = 0;
+  private lastUnknownLevels: readonly string[] = [];
   private readonly reportedLevels = new Set<string>();
-  private readonly changeListeners = new Set<Listener<BossListChange>>();
+  private readonly changeListeners = new Set<Listener<FeedChange>>();
   private readonly staleListeners = new Set<Listener<StaleFeed>>();
 
   constructor(private readonly options: RaidBossOptions) {
     this.now = options.now ?? (() => Date.now());
     this.timeoutMs = options.timeoutMs ?? 30_000;
     this.retryMs = options.retryMs ?? Math.min(options.refreshMs, 5 * MINUTE_MS);
-    this.startedAt = this.now();
   }
 
   /** Reads the stored list and overrides. Does not download anything. */
@@ -177,6 +241,17 @@ export class RaidBossService implements RaidBossProvider {
     return this.syncedAt;
   }
 
+  /** The headings Pine does not know, of the last feed that was read whole; empty before that. */
+  get unknownLevels(): readonly string[] {
+    return this.lastUnknownLevels;
+  }
+
+  /** The bosses the feed listed at the last successful read, as stored. */
+  feedBosses(): StoredBoss[] {
+    if (!this.loaded) throw new Error(NOT_LOADED);
+    return this.feed.map((boss) => ({ ...boss, tier: { ...boss.tier } }));
+  }
+
   /** The overrides in force, oldest first. */
   overrides(): BossOverride[] {
     const now = this.now();
@@ -237,7 +312,7 @@ export class RaidBossService implements RaidBossProvider {
    * Called after a sync in which the feed's bosses changed. Not called for the first sync of a
    * new database, where there is nothing to compare with. Returns a function that unsubscribes.
    */
-  onChange(listener: Listener<BossListChange>): () => void {
+  onChange(listener: Listener<FeedChange>): () => void {
     this.changeListeners.add(listener);
     return () => this.changeListeners.delete(listener);
   }
@@ -258,6 +333,10 @@ export class RaidBossService implements RaidBossProvider {
    */
   sync(): Promise<SyncResult> {
     if (!this.loaded) throw new Error(NOT_LOADED);
+    // A stopped service (shutdown) asks the feed nothing more.
+    if (this.stopped && !this.inFlight) {
+      return Promise.resolve({ status: 'failed', kind: 'stopped', reason: 'stopped' });
+    }
     this.inFlight ??= this.syncOnce().finally(() => {
       this.inFlight = undefined;
     });
@@ -317,6 +396,8 @@ export class RaidBossService implements RaidBossProvider {
     const now = this.now();
     const attemptedBefore = this.attemptedAt;
     this.attemptedAt = now;
+    const before = this.feed.length;
+    const feedBefore = this.feed;
     let change: BossListChange;
     try {
       change = await this.readFeed(now);
@@ -324,19 +405,30 @@ export class RaidBossService implements RaidBossProvider {
       if (err instanceof SyncStopped) {
         // Nothing was read, so a later `startAutoSync` must not wait for this attempt.
         this.attemptedAt = attemptedBefore;
-        return { status: 'failed', reason: 'stopped' };
+        return { status: 'failed', kind: 'stopped', reason: 'stopped' };
       }
       this.failures++;
       const reason = err instanceof Error ? err.message : String(err);
       this.safely(() => this.options.log.error({ err }, 'could not sync the raid bosses'));
       this.reportIfStale(now, reason);
-      return { status: 'failed', reason };
+      if (err instanceof FeedFailure) {
+        return {
+          status: 'failed',
+          kind: err.kind,
+          ...(err.httpStatus === undefined ? {} : { httpStatus: err.httpStatus }),
+          reason,
+        };
+      }
+      return { status: 'failed', kind: 'storing', reason };
     }
     const first = this.syncedAt === undefined;
     this.failures = 0;
     this.syncedAt = now;
     this.staleReported = false;
-    if (change.added.length === 0 && change.removed.length === 0) return { status: 'unchanged' };
+    const remarks = this.remarks(before, this.feed.length);
+    if (change.added.length === 0 && change.removed.length === 0) {
+      return { status: 'unchanged', ...remarks };
+    }
     this.safely(() =>
       this.options.log.info(
         {
@@ -346,8 +438,31 @@ export class RaidBossService implements RaidBossProvider {
         'raid bosses updated',
       ),
     );
-    if (!first) this.emit(this.changeListeners, change);
-    return { status: 'updated', change };
+    // What members see: the lists in effect before and after, with the same overrides.
+    const { catalogue } = this.options.gameData;
+    const seen = diffBosses(
+      effectiveBosses(feedBefore, this.overrideList, catalogue, now),
+      effectiveBosses(this.feed, this.overrideList, catalogue, now),
+    );
+    const feedChange: FeedChange = { ...change, seen };
+    if (!first) this.emit(this.changeListeners, feedChange);
+    return { status: 'updated', change: feedChange, ...remarks };
+  }
+
+  /** What to say of a read beyond its bosses; a list that shrank by more than half is logged. */
+  private remarks(before: number, after: number): FeedRemarks {
+    const remarks: FeedRemarks = {};
+    if (this.lastUnknownLevels.length > 0) remarks.unknownLevels = [...this.lastUnknownLevels];
+    if (before >= SHRINK_FLOOR && after * 2 < before) {
+      remarks.shrank = { before, after };
+      this.safely(() =>
+        this.options.log.warn(
+          { before, after },
+          'the raid boss feed lists fewer than half the bosses it did',
+        ),
+      );
+    }
+    return remarks;
   }
 
   /** Downloads, checks and stores the feed; returns what changed. Throws when anything fails. */
@@ -380,30 +495,62 @@ export class RaidBossService implements RaidBossProvider {
       }
     } catch (err) {
       if (controller.signal.aborted) throw new SyncStopped();
-      const reason = timeout.aborted ? `timed out after ${this.timeoutMs} ms` : failureReason(err);
-      throw new Error(`${url}: ${reason}`, { cause: err });
+      if (timeout.aborted) {
+        throw new FeedFailure(
+          `${url}: timed out after ${this.timeoutMs} ms`,
+          'timeout',
+          undefined,
+          {
+            cause: err,
+          },
+        );
+      }
+      throw new FeedFailure(`${url}: ${failureReason(err)}`, 'unreachable', undefined, {
+        cause: err,
+      });
     } finally {
       if (this.controller === controller) this.controller = undefined;
     }
 
     if (status === 304) {
-      if (!conditional) throw new Error(`${url} answered 304 to a request without validators`);
+      if (!conditional) {
+        throw new FeedFailure(`${url} answered 304 to a request without validators`, 'status', 304);
+      }
       await store.touchActive(now);
       this.feed = await store.listActive();
       await this.housekeeping(now);
       return { added: [], removed: [] };
     }
-    if (status < 200 || status > 299) throw new Error(`${url} answered ${status}`);
+    if (status < 200 || status > 299) {
+      throw new FeedFailure(`${url} answered ${status}`, 'status', status);
+    }
     if (body.length > MAX_FEED_CHARS) {
-      throw new Error(`${url} sent ${body.length} characters, which is not the raid boss feed`);
+      throw new FeedFailure(
+        `${url} sent ${body.length} characters, which is not the raid boss feed`,
+        'unreadable',
+      );
     }
     let json: unknown;
     try {
       json = JSON.parse(body);
     } catch {
-      throw new Error(`${url} did not send JSON`);
+      throw new FeedFailure(`${url} did not send JSON`, 'unreadable');
+    }
+    let parsed: ReturnType<typeof parseRaidBossFeed>;
+    try {
+      parsed = parseRaidBossFeed(json, feedLookupOf(catalogue));
+    } catch (err) {
+      throw new FeedFailure(
+        err instanceof Error ? err.message : String(err),
+        'unreadable',
+        undefined,
+        {
+          cause: err,
+        },
+      );
     }
-    const { bosses, unknownLevels, skipped } = parseRaidBossFeed(json, feedLookupOf(catalogue));
+    const { bosses, unknownLevels, skipped } = parsed;
+    this.lastUnknownLevels = unknownLevels;
     for (const level of unknownLevels) {
       if (this.reportedLevels.has(level)) continue;
       this.reportedLevels.add(level);
@@ -443,9 +590,21 @@ export class RaidBossService implements RaidBossProvider {
     }
   }
 
+  /**
+   * Tells the listeners once that the list is out of date: `staleAfterMs` after the last
+   * successful read, which is stored and so survives a restart; when the feed has never been
+   * read (a new database), at the second failure in a row, so that one failed first attempt
+   * does not count as staleness.
+   */
   private reportIfStale(now: number, reason: string): void {
-    const since = this.syncedAt ?? this.startedAt;
-    if (this.staleReported || now - since < this.options.staleAfterMs) return;
+    if (this.staleReported) return;
+    if (
+      this.syncedAt === undefined
+        ? this.failures < 2
+        : now - this.syncedAt < this.options.staleAfterMs
+    ) {
+      return;
+    }
     this.staleReported = true;
     this.safely(() =>
       this.options.log.warn(
diff --git a/test/support/nicknames.ts b/test/support/nicknames.ts
new file mode 100644
index 0000000000000000000000000000000000000000..214066a63f3d3b83cdf23cfb2a0e8e62ef94211d
--- /dev/null
+++ b/test/support/nicknames.ts
@@ -0,0 +1,104 @@
+import {
+  PokemonSearchService,
+  type NicknameStore,
+} from '../../src/services/pokemon-search-service.js';
+import {
+  keyForLegacyName,
+  legacyNameForKey,
+  legacyNamesForKey,
+} from '../../src/domain/pogo/legacy-names.js';
+import { tidyNickname } from '../../src/domain/pogo/nickname-rules.js';
+import { catalogueFixture } from './game-data.js';
+import { createTestLogger } from './test-logger.js';
+
+/**
+ * The moderators' nicknames kept in memory, as `PokemonRepository` keeps them in the legacy
+ * `Pokemon` table: `rows` by the row's name (in the order of their ids), several names of one
+ * Pokémon read together under its key (`keyForLegacyName`), in lower case, an addition going to
+ * the first row of the Pokémon, a removal taken from every row, nicknames compared tidied, and a
+ * RangeError when a row's joined string would pass the 255 characters of the column. `failing`
+ * makes reads reject; `holdRead` keeps the next read waiting until the function it gives back is
+ * called.
+ */
+export class MemoryNicknames implements NicknameStore {
+  readonly rows = new Map<string, string[]>();
+  failing = false;
+  reads = 0;
+  private held: Promise<void> | undefined;
+
+  constructor(initial: Record<string, string[]> = {}) {
+    for (const [name, nicknames] of Object.entries(initial)) this.rows.set(name, [...nicknames]);
+  }
+
+  /** The next read waits until the function given back is called. */
+  holdRead(): () => void {
+    let release: () => void = () => undefined;
+    this.held = new Promise((resolve) => {
+      release = resolve;
+    });
+    return release;
+  }
+
+  async nicknames(): Promise<Map<string, string[]>> {
+    this.reads += 1;
+    const snapshot = new Map<string, string[]>();
+    for (const [name, list] of this.rows) {
+      const tidied = list.map(tidyNickname);
+      if (tidied.length === 0) continue;
+      const key = keyForLegacyName(name);
+      snapshot.set(key, [...new Set([...(snapshot.get(key) ?? []), ...tidied])]);
+    }
+    const held = this.held;
+    this.held = undefined;
+    if (held) await held;
+    if (this.failing) throw new Error('database is down');
+    return snapshot;
+  }
+
+  /** The names of the rows that hold this Pokémon, in the order of their ids. */
+  private namesOf(key: string): string[] {
+    const names = legacyNamesForKey(key);
+    return [...this.rows.keys()].filter((name) => names.includes(name.toLowerCase()));
+  }
+
+  addNickname(key: string, nickname: string): Promise<string[]> {
+    const added = tidyNickname(nickname);
+    const names = this.namesOf(key);
+    const all = [
+      ...new Set(names.flatMap((name) => (this.rows.get(name) ?? []).map(tidyNickname))),
+    ];
+    if (all.includes(added)) return Promise.resolve(all);
+    const [first = legacyNameForKey(key)] = names;
+    const list = this.rows.get(first) ?? [];
+    if ([...list, added].join(', ').length > 255) {
+      return Promise.reject(new RangeError('The nicknames would not fit in the stored string'));
+    }
+    this.rows.set(first, [...list, added]);
+    return Promise.resolve([...all, added]);
+  }
+
+  removeNickname(key: string, nickname: string): Promise<boolean> {
+    const removed = tidyNickname(nickname);
+    let found = false;
+    for (const name of this.namesOf(key)) {
+      const list = this.rows.get(name) ?? [];
+      const kept = list.filter((one) => tidyNickname(one) !== removed);
+      if (kept.length === list.length) continue;
+      found = true;
+      this.rows.set(name, kept);
+    }
+    return Promise.resolve(found);
+  }
+}
+
+/**
+ * A real `PokemonSearchService` over the catalogue fixture and `MemoryNicknames` with these
+ * stored nicknames, already read. Pass it as `pokemon` and `nicknames` to `createTestContext`.
+ */
+export async function nicknameSearchWith(stored: Record<string, string[]> = {}) {
+  const rows = new MemoryNicknames(stored);
+  const { log, entries } = createTestLogger();
+  const search = new PokemonSearchService({ catalogue: catalogueFixture() }, rows, log);
+  await search.reloadNicknames();
+  return { search, rows, logged: entries };
+}
diff --git a/test/support/raid-bosses.ts b/test/support/raid-bosses.ts
index 3430aa7ba595f2ccab923fc95c38c8b8751808b8..658cf0f899678c505adf6ac101b1688937b58ccf 100644
--- a/test/support/raid-bosses.ts
+++ b/test/support/raid-bosses.ts
@@ -10,8 +10,13 @@ import {
   type NewBossOverride,
 } from '../../src/domain/pogo/raid-bosses.js';
 import { sameRaidTier } from '../../src/domain/pogo/raid-tier.js';
-import type { RaidBossProvider } from '../../src/services/raid-boss-service.js';
+import {
+  RaidBossService,
+  type FetchFeed,
+  type RaidBossProvider,
+} from '../../src/services/raid-boss-service.js';
 import { catalogueFixture } from './game-data.js';
+import { createTestLogger } from './test-logger.js';
 
 const fixtures = path.resolve(import.meta.dirname, '../fixtures');
 
@@ -158,3 +163,58 @@ export function raidBossesFixture(overrides: readonly BossOverride[] = []): Raid
     autoset: (tier) => autosetBoss(bosses(), tier),
   };
 }
+
+/** A response of the feed's address, as `RaidBossService` reads it. */
+export function feedReply(status: number, body = ''): Awaited<ReturnType<FetchFeed>> {
+  return {
+    ok: status >= 200 && status <= 299,
+    status,
+    headers: { get: () => null },
+    text: () => Promise.resolve(body),
+  };
+}
+
+/** When the stored list of `raidBossServiceWith` was read: the fixtures' day. */
+export const FEED_READ_AT = Date.UTC(2026, 9, 11, 12);
+
+/**
+ * A real `RaidBossService` over `MemoryRaidBossStore`, loaded with the downloaded feed as if it
+ * had been read at `FEED_READ_AT` (unless `empty`), and with these overrides. The feed is not
+ * downloaded: `respond` answers the requests of `sync()` (by default the same feed), `now` is the
+ * service's clock and `requests` counts what was asked. Pass it as `raidBosses` and
+ * `raidBossAdmin` to `createTestContext`.
+ */
+export async function raidBossServiceWith(
+  options: { overrides?: readonly NewBossOverride[]; empty?: boolean; staleAfterMs?: number } = {},
+) {
+  const store = new MemoryRaidBossStore();
+  const { log, entries } = createTestLogger();
+  const state = {
+    now: FEED_READ_AT,
+    requests: 0,
+    respond: (() =>
+      Promise.resolve(feedReply(200, JSON.stringify(readRaidBossFeed())))) as FetchFeed,
+  };
+  if (!options.empty) {
+    const feed = parseRaidBossFeed(readRaidBossFeed(), feedLookup(catalogueFixture())).bosses;
+    await store.replaceFeed(feed, state.now);
+  }
+  const service = new RaidBossService({
+    url: 'https://example.test/raids.min.json',
+    refreshMs: 60 * 60_000,
+    staleAfterMs: options.staleAfterMs ?? 48 * 60 * 60_000,
+    store,
+    gameData: { catalogue: catalogueFixture() },
+    fetch: (url, init) => {
+      state.requests += 1;
+      return state.respond(url, init);
+    },
+    log,
+    now: () => state.now,
+  });
+  for (const override of options.overrides ?? []) {
+    await store.saveOverride(override, state.now);
+  }
+  await service.load();
+  return { service, store, state, logged: entries };
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 7417fa3b1e4182f9f66dd475441fa7c08da1257c..c9216362f2c1b7e82be814045a2eb13418dfa30f 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -6,6 +6,8 @@ import { ClickAnswers } from '../../src/discord/click-answers.js';
 import type { DB } from '../../src/db/types.js';
 import type { AttendanceService } from '../../src/services/attendance-service.js';
 import type { GymAdminService } from '../../src/services/gym-admin-service.js';
+import type { PokemonNicknames } from '../../src/services/pokemon-search-service.js';
+import type { RaidBossAdmin } from '../../src/services/raid-boss-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { RegionAdminService } from '../../src/services/region-admin-service.js';
@@ -56,6 +58,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     commands: [],
     gameData,
     raidBosses: raidBossesFixture(),
+    raidBossAdmin: unavailable<RaidBossAdmin>(
+      'raidBossAdmin',
+      'pass { raidBosses: service, raidBossAdmin: service } from raidBossServiceWith()',
+    ),
     raidEvents: raidEventsFixture(),
     gyms: gymsFixture(),
     gymAdmin: unavailable<GymAdminService>(
@@ -112,6 +118,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
     pokemon: pokemonFixture(gameData),
+    nicknames: unavailable<PokemonNicknames>(
+      'nicknames',
+      'pass { pokemon: search, nicknames: search } from nicknameSearchWith()',
+    ),
     maps: mapsFixture(),
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
````

---

### Task 2: The raid boss list for staff: list and sync

Prototype commit: `60a9fb5d77d45b51d87eb6538021eafaaa11db69`

/admin boss list shows the bosses tier by tier as members see them, each
with where it came from (the feed, and how its entry was identified, as the
check script says it; or an override), the overrides acting on it with their
number and expiry, a boss the game data does not know with its ids, hidden
bosses and overrides that change nothing apart, and "old?" on an override
older than 30 days or one the feed has made pointless. /admin boss sync
reads the feed at once and says what changed by tier, the headings Pine does
not know, and a list that shrank to less than half.

The domain gains bossReport and the key helpers of effectiveBosses; the
change of a list by tier (tierChanges) is shared with the announcements.


**Files:**

```
 scripts/raid-bosses/check-feed.ts      |  35 +++++++-------
 src/commands/admin/boss-input.ts       | 207 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/boss-list.test.ts   | 385 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/boss-list.ts        | 331 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/index.ts            |   6 ++-
 src/commands/admin/self-roles.test.ts  |   5 +-
 src/domain/pogo/boss-report.test.ts    | 117 +++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/boss-report.ts         | 113 +++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/raid-boss-feed.test.ts |  68 +++++++++++++++++++--------
 src/domain/pogo/raid-boss-feed.ts      |  32 +++++++++++++
 src/domain/pogo/raid-bosses.test.ts    |  21 +++++++--
 src/domain/pogo/raid-bosses.ts         |  76 ++++++++++++++++++++++++-------
 src/render/boss-changes.test.ts        | 121 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/boss-changes.ts             | 125 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/raid-boss-service.test.ts |  10 ++--
 test/support/boss-commands.ts          | 119 +++++++++++++++++++++++++++++++++++++++++++++++
 16 files changed, 1708 insertions(+), 63 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `The raid boss list for staff: list and sync`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/scripts/raid-bosses/check-feed.ts b/scripts/raid-bosses/check-feed.ts
index b7dbf0dcd6c1b1000263d1d01d221559724b6431..42dd7e73194f976be6c4fdf9cbd8aa9f716410f0 100644
--- a/scripts/raid-bosses/check-feed.ts
+++ b/scripts/raid-bosses/check-feed.ts
@@ -19,7 +19,7 @@ import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-mas
 import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
 import {
   cleanBossName,
-  identifyBoss,
+  howIdentified,
   isMegaLevel,
   parseRaidBossFeed,
   pictureIds,
@@ -97,25 +97,26 @@ for (const raw of entries) {
   if (!entry || cleaned === undefined) continue;
   const heading = readHeading(entry.heading);
   const { name, shadow } = splitShadow(cleaned, entry.image, lookup);
-  const picture = pictureIds(entry.image, lookup);
-  const named = lookup.findByName(name);
-  const used = identifyBoss(name, entry.image, lookup, {
+  const { how: identified, used } = howIdentified(name, entry.image, lookup, {
     mega: heading ? isMegaLevel(heading.level) : false,
   });
   const label = `${shadow ? 'Shadow ' : ''}${name} (${entry.heading.trim()})`;
-  let kind: string;
-  if (picture && named) {
-    const same = keyOf(picture) === keyOf(named);
-    kind = same ? 'picture and name agree' : 'picture and name DISAGREE';
-    if (!same) {
-      const outcome = used?.resolved
-        ? `used ${keyOf(used.resolved)}`
-        : 'left unresolved (listed by the feed name)';
-      disagree.push(`${label}: picture ${keyOf(picture)}, name ${keyOf(named)}: ${outcome}`);
-    }
-  } else if (picture) kind = 'picture';
-  else if (named) kind = 'name';
-  else kind = 'neither (an id made of the name)';
+  const kind = {
+    agree: 'picture and name agree',
+    'new-form': 'a form of the named species the game data does not know yet',
+    disagree: 'picture and name DISAGREE',
+    picture: 'picture',
+    name: 'name',
+    neither: 'neither (an id made of the name)',
+  }[identified];
+  const picture = pictureIds(entry.image, lookup);
+  const named = lookup.findByName(name);
+  if (identified === 'disagree' && picture && named) {
+    const outcome = used?.resolved
+      ? `used ${keyOf(used.resolved)}`
+      : 'left unresolved (listed by the feed name)';
+    disagree.push(`${label}: picture ${keyOf(picture)}, name ${keyOf(named)}: ${outcome}`);
+  }
   const ids = used ? `${used.pokemonId}/${used.form ?? '-'}` : 'no id';
   const placed = used?.resolved ? keyOf(used.resolved) : 'unresolved';
   how.push(`  ${label}: ${kind} -> ${ids} (${placed})`);
diff --git a/src/commands/admin/boss-input.ts b/src/commands/admin/boss-input.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fae334c69e1d1935aa2ee46da7c71e00e445adca
--- /dev/null
+++ b/src/commands/admin/boss-input.ts
@@ -0,0 +1,207 @@
+import type {
+  SlashCommandIntegerOption,
+  SlashCommandStringOption,
+  SlashCommandSubcommandBuilder,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { UserError } from '../../discord/errors.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import { bossIdsOf, type BossIds } from '../../domain/pogo/raid-bosses.js';
+import {
+  isRaidLevel,
+  RAID_LEVELS,
+  raidTier,
+  raidTierLabel,
+  type RaidTier,
+} from '../../domain/pogo/raid-tier.js';
+import { searchTokens } from '../../domain/search/text.js';
+import { plain, truncate } from '../../render/text.js';
+import { CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';
+
+/** The subcommand group of `/admin` the boss list lives under. */
+export const BOSS_GROUP = 'boss';
+export const BOSS_DESCRIPTION = 'The raid boss list: what the feed says, and your changes to it';
+
+/** The longest `days` an override may be given; 0 is "for good". */
+export const MAX_DAYS = 90;
+/** How long an `add` or `autoset` lasts when no `days` is given. */
+export const DEFAULT_DAYS = 30;
+const DAY_MS = 24 * 60 * 60 * 1000;
+
+/** Every tier a boss can have, in the order of the levels, shadow after plain. */
+export function allTiers(): RaidTier[] {
+  return RAID_LEVELS.flatMap((level) =>
+    [raidTier(level, false), raidTier(level, true)].filter(
+      (tier): tier is RaidTier => tier !== undefined,
+    ),
+  );
+}
+
+/** The value of a tier among the choices of the `tier` option: `T5`, `T5:shadow`. */
+export function tierValue(tier: RaidTier): string {
+  return tier.shadow ? `${tier.level}:shadow` : tier.level;
+}
+
+/** The tier of a choice of the `tier` option; a `UserError` for anything else. */
+export function readTier(value: string): RaidTier {
+  const [level = '', shadow, ...rest] = value.split(':');
+  const tier =
+    isRaidLevel(level) && rest.length === 0 && (shadow === undefined || shadow === 'shadow')
+      ? raidTier(level, shadow === 'shadow')
+      : undefined;
+  if (!tier) throw new UserError('That is not a raid tier. Pick one from the list.');
+  return tier;
+}
+
+/** The `tier` option: a choice of every tier the bot knows. */
+export function tierOption(required: boolean, description = 'The raid tier') {
+  return (option: SlashCommandStringOption): SlashCommandStringOption =>
+    option
+      .setName('tier')
+      .setDescription(description)
+      .setRequired(required)
+      .addChoices(
+        allTiers().map((tier) => ({ name: raidTierLabel(tier), value: tierValue(tier) })),
+      );
+}
+
+/** The `pokemon` option: free text, with the list of `bossPokemonChoices`. */
+export function pokemonOption(description = 'The Pokémon') {
+  return (option: SlashCommandStringOption): SlashCommandStringOption =>
+    option
+      .setName('pokemon')
+      .setDescription(description)
+      .setRequired(true)
+      .setMaxLength(100)
+      .setAutocomplete(true);
+}
+
+/** The `days` option: how long an override lasts. */
+export function daysOption(description: string) {
+  return (option: SlashCommandIntegerOption): SlashCommandIntegerOption =>
+    option.setName('days').setDescription(description).setMinValue(0).setMaxValue(MAX_DAYS);
+}
+
+/** Adds the `days` option to a subcommand. */
+export function withDays(
+  data: SlashCommandSubcommandBuilder,
+  description: string,
+): SlashCommandSubcommandBuilder {
+  return data.addIntegerOption(daysOption(description));
+}
+
+/**
+ * When an override given `days` ends: `days` from now, never for 0, and `fallback` days (null:
+ * never) when none was given.
+ */
+export function expiryOf(days: number | null, fallback: number | null, now: number): number | null {
+  const chosen = days ?? fallback;
+  return chosen === null || chosen === 0 ? null : now + chosen * DAY_MS;
+}
+
+/** A choice's value for a boss the game master does not know: its feed ids. */
+const IDS_CHOICE = /^ids:([A-Z][A-Z0-9_]{0,63})(?::([A-Z][A-Z0-9_]{0,63}))?$/;
+
+function idsValue(ids: BossIds): string {
+  return `ids:${ids.pokemonId}${ids.form === null ? '' : `:${ids.form}`}`;
+}
+
+/** What the `pokemon` option names: the ids an override is stored with, and how to call it. */
+export interface ChosenPokemon {
+  ids: BossIds;
+  /** Undefined for a boss of the feed the game master does not know. */
+  entry: PokemonEntry | undefined;
+  /** As a sentence names it, made plain. */
+  label: string;
+}
+
+/**
+ * The choices of the `pokemon` option: with nothing typed, the bosses of the list; with text,
+ * what the text names in full, then the bosses it finds by their name, then any Pokémon the
+ * search finds (a guess only where the name shows the guessed word). A boss of the feed the game
+ * master does not know is offered under the feed's name with its ids (`ids:<id>[:<form>]`);
+ * every other choice's value is a catalogue key.
+ */
+export function bossPokemonChoices(ctx: AppContext, typed: string): Choice[] {
+  const words = searchTokens(typed);
+  const bosses = ctx.raidBosses.bosses();
+  const unknown = bosses
+    .filter((boss) => !boss.entry)
+    .map((boss) => ({
+      name: `${boss.name} (not in the game data: ${boss.form ?? boss.pokemonId})`,
+      value: idsValue(boss),
+    }));
+  const known = new Map(
+    bosses.flatMap((boss) => (boss.entry ? [[boss.entry.key, boss.entry] as const] : [])),
+  );
+  const entryChoice = (entry: PokemonEntry): Choice => ({ name: entry.name, value: entry.key });
+  let choices: Choice[];
+  if (words.length === 0) {
+    choices = [...[...known.values()].map(entryChoice), ...unknown];
+  } else {
+    const hits = ctx.pokemon.find(typed, { limit: MAX_CHOICES * 4 });
+    const named = ctx.pokemon
+      .find(typed, { filter: (entry) => known.has(entry.key) })
+      .filter((hit) => hit.named);
+    const [first] = hits;
+    const begun = (name: string): boolean => {
+      const own = searchTokens(name);
+      return words.every((word) => own.some((part) => part.startsWith(word)));
+    };
+    choices = [
+      ...(first?.match === 'exact' ? [entryChoice(first.entry)] : []),
+      ...named.map((hit) => entryChoice(hit.entry)),
+      ...unknown.filter((choice) => begun(choice.name)),
+      ...hits
+        .filter((hit) => hit.match !== 'guess' || showsGuessed(hit.entry.name, hit.guessed))
+        .map((hit) => entryChoice(hit.entry)),
+    ];
+  }
+  const listed = new Set<string>();
+  return choices
+    .filter((choice) => {
+      if (choice.value.length > 100 || listed.has(choice.value)) return false;
+      listed.add(choice.value);
+      return true;
+    })
+    .slice(0, MAX_CHOICES)
+    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
+}
+
+/**
+ * The Pokémon the `pokemon` option names: a choice of the list, or typed text that names one
+ * outright (its name, key or a nickname no other Pokémon has). Anything else is refused with
+ * what the text could be.
+ */
+export function chosenPokemon(ctx: AppContext, value: string): ChosenPokemon {
+  const text = value.trim();
+  const ids = IDS_CHOICE.exec(text);
+  if (ids?.[1]) {
+    const pokemonId = ids[1];
+    const form = ids[2] ?? null;
+    const feed = ctx.raidBossAdmin
+      .feedBosses()
+      .find((boss) => boss.pokemonId === pokemonId && boss.form === form);
+    const override = ctx.raidBossAdmin
+      .overrides()
+      .find((one) => one.pokemonId === pokemonId && one.form === form);
+    if (!feed && !override) {
+      throw new UserError('That boss is no longer in the feed. Pick again from the list.');
+    }
+    const entry = ctx.gameData.catalogue.byGameMasterId(pokemonId, form);
+    return {
+      ids: { pokemonId, form },
+      entry,
+      label: plain(entry?.name ?? feed?.name ?? form ?? pokemonId),
+    };
+  }
+  const entry = ctx.gameData.catalogue.byKey(text) ?? ctx.pokemon.exact(text);
+  if (entry) return { ids: bossIdsOf(entry), entry, label: plain(entry.name) };
+  const could = ctx.pokemon.search(text).slice(0, 3);
+  throw new UserError(
+    could.length === 0
+      ? `I do not know a Pokémon called "${plain(truncate(text, 80))}". Pick one from the list.`
+      : `"${plain(truncate(text, 80))}" is not the name of one Pokémon. Did you mean ` +
+          `${could.map((one) => plain(one.name)).join(', ')}? Pick one from the list.`,
+  );
+}
diff --git a/src/commands/admin/boss-list.test.ts b/src/commands/admin/boss-list.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c42db411da185b44bbb607418b230b8788c5cf5b
--- /dev/null
+++ b/src/commands/admin/boss-list.test.ts
@@ -0,0 +1,385 @@
+import { MessageFlags } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  bossCommandsWith,
+  MEMBER,
+  MODERATOR,
+  textsOf,
+} from '../../../test/support/boss-commands.js';
+import { FEED_READ_AT, feedReply, readRaidBossFeed } from '../../../test/support/raid-bosses.js';
+import type { NewBossOverride } from '../../domain/pogo/raid-bosses.js';
+import type { RaidTier } from '../../domain/pogo/raid-tier.js';
+import { fitMessages } from '../../render/text.js';
+import { keptTogether } from './boss-list.js';
+import { admin } from './index.js';
+
+const T3: RaidTier = { level: 'T3', shadow: false };
+const T5: RaidTier = { level: 'T5', shadow: false };
+const DAY = 24 * 60 * 60 * 1000;
+const at = (ms: number) => String(Math.floor(ms / 1000));
+
+function override(extra: Partial<NewBossOverride>): NewBossOverride {
+  return {
+    action: 'add',
+    pokemonId: 'ZEKROM',
+    form: null,
+    tier: T5,
+    shiny: null,
+    expiresAt: null,
+    createdBy: MODERATOR,
+    ...extra,
+  };
+}
+
+/** The feed as downloaded, with these entries added. */
+function feedWith(...more: object[]): string {
+  return JSON.stringify([...(readRaidBossFeed() as object[]), ...more]);
+}
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'] });
+  vi.setSystemTime(FEED_READ_AT + DAY);
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+describe('/admin boss: who may use it', () => {
+  it('is a group of /admin with list and sync', () => {
+    const json = admin.data.toJSON();
+    const group = json.options?.find((option) => option.name === 'boss');
+    expect(group?.description).toBe(
+      'The raid boss list: what the feed says, and your changes to it',
+    );
+    expect([...admin.subcommands.keys()]).toEqual(
+      expect.arrayContaining(['boss list', 'boss sync']),
+    );
+  });
+
+  it('refuses a member who is not staff', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'list', {}, { userId: MEMBER, roleNames: [] });
+    expect(used.reply).toHaveBeenCalledWith({
+      content: 'Only admins, moderators and bot developers can do that.',
+      flags: MessageFlags.Ephemeral,
+    });
+    const synced = await made.use('boss', 'sync', {}, { userId: MEMBER, roleNames: [] });
+    expect(synced.reply).toHaveBeenCalledTimes(1);
+    expect(made.bosses.state.requests).toBe(0);
+  });
+});
+
+describe('/admin boss list', () => {
+  it('shows the bosses tier by tier, how each was found, and when the feed was read', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'list');
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const text = textsOf(used).join('\n');
+    expect(text).toContain(`**Raid bosses** · the feed was read <t:${at(FEED_READ_AT)}:R>`);
+    expect(text).toContain('**T5** · eggs hatch as Yveltal');
+    expect(text).toContain(
+      `- **Yveltal** · shiny · from the feed, found by picture and name, since <t:${at(FEED_READ_AT)}:d>`,
+    );
+    expect(text).toContain('**Shadow T5** · eggs hatch as Landorus (Incarnate Forme)');
+    expect(text).toContain('**T3**\n- **Gothitelle**');
+    // The costume is found by its picture: its form is newer than the game data.
+    expect(text).toMatch(/- \*\*Pikachu\*\* · shiny · from the feed, found by .*/);
+    expect(text).not.toContain('Hidden');
+  });
+
+  it('shows one tier when asked', async () => {
+    const made = await bossCommandsWith();
+    const text = textsOf(await made.use('boss', 'list', { tier: 'T3' })).join('\n');
+    expect(text).toContain('**T3**');
+    expect(text).not.toContain('Yveltal');
+    expect(text).not.toContain('Shadow T3');
+    const shadow = textsOf(await made.use('boss', 'list', { tier: 'T3:shadow' })).join('\n');
+    expect(shadow).toContain('**Shadow T3**\n- **Drapion**');
+    const none = textsOf(await made.use('boss', 'list', { tier: 'Elite' })).join('\n');
+    expect(none).toContain('That tier has no bosses.');
+  });
+
+  it('marks the overrides, lists hidden bosses and idle overrides apart, and old ones', async () => {
+    const created = FEED_READ_AT - 31 * DAY;
+    const made = await bossCommandsWith({
+      overrides: [
+        override({ action: 'add', pokemonId: 'ZEKROM', expiresAt: FEED_READ_AT + 30 * DAY }),
+        override({ action: 'hide', pokemonId: 'STARMIE', tier: T3 }),
+        override({ action: 'autoset', pokemonId: 'MEWTWO', tier: T5 }),
+        override({ action: 'shiny', pokemonId: 'YVELTAL', tier: null, shiny: false }),
+        override({ action: 'hide', pokemonId: 'MEWTWO', tier: T5 }),
+        override({ action: 'hide', pokemonId: 'CELEBI', tier: T5 }),
+      ],
+    });
+    // Saved at the service's clock; one of them made old by hand.
+    const [, , , , , celebi] = await made.bosses.store.listOverrides();
+    if (celebi) {
+      await made.bosses.store.removeOverride(celebi.id);
+      await made.bosses.store.saveOverride(
+        override({ action: 'hide', pokemonId: 'CELEBI', tier: T5 }),
+        created,
+      );
+      await made.bosses.service.load();
+    }
+    const text = textsOf(await made.use('boss', 'list')).join('\n');
+    expect(text).toContain(`- **Zekrom** · added (#1, until <t:${at(FEED_READ_AT + 30 * DAY)}:d>)`);
+    expect(text).toContain(
+      '- **Yveltal** · from the feed, found by picture and name, since ' +
+        `<t:${at(FEED_READ_AT)}:d> · never shiny (any tier) (#4, for good)`,
+    );
+    expect(text).toContain('**Hidden**\n- Celebi (T5)');
+    expect(text).toContain('- Starmie (T3) · hidden (#2, for good)\n');
+    expect(text).toContain(
+      '- Mewtwo (T5) · hidden (#5, for good) · **old?** (the feed does not list it)',
+    );
+    expect(text).toContain(
+      '- Celebi (T5) · hidden (#7, for good) · **old?** (older than 30 days, the feed does not list it)',
+    );
+    expect(text).toContain(
+      '**Overrides that change nothing now** (their boss is hidden, or is no boss of that tier now)\n' +
+        '- Mewtwo (T5) · eggs hatch as it (#3, for good)',
+    );
+  });
+
+  it('lists a boss the game data does not know by the feed name with its ids', async () => {
+    const made = await bossCommandsWith();
+    made.bosses.state.respond = () =>
+      Promise.resolve(
+        feedReply(
+          200,
+          feedWith({
+            name: 'Brandnew_mon',
+            tier: '5-Star Raids',
+            canBeShiny: false,
+            image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm9999.icon.png',
+          }),
+        ),
+      );
+    await made.bosses.service.sync();
+    const text = textsOf(await made.use('boss', 'list', { tier: 'T5' })).join('\n');
+    expect(text).toContain(
+      '- **Brandnew\\_mon** · **not in the game data** (feed ids `BRANDNEW_MON`, no form) · ' +
+        'from the feed, ' +
+        'found by neither picture nor name',
+    );
+    expect(text).not.toContain('eggs hatch as');
+  });
+
+  it('splits a long list into several answers, keeping a tier heading with its bosses', async () => {
+    const many: NewBossOverride[] = [];
+    const names = ['MEW', 'MEWTWO', 'CELEBI', 'ZEKROM', 'RESHIRAM', 'KYOGRE', 'GROUDON', 'LUGIA'];
+    for (const level of ['T1', 'T3', 'T5', 'Elite'] as const) {
+      for (const pokemonId of names) {
+        many.push(
+          override({
+            action: 'add',
+            pokemonId,
+            tier: { level, shadow: false },
+            expiresAt: FEED_READ_AT + 20 * DAY,
+          }),
+        );
+      }
+    }
+    const made = await bossCommandsWith({ overrides: many });
+    const texts = textsOf(await made.use('boss', 'list'));
+    expect(texts.length).toBeGreaterThan(1);
+    for (const text of texts) {
+      expect(text.length).toBeLessThanOrEqual(2000);
+      // No answer ends with a heading whose bosses are in the next.
+      expect(text.split('\n').at(-1)).toMatch(/^- /);
+    }
+    expect(texts.join('\n').match(/^- \*\*/gm)?.length).toBe(14 + 32);
+  });
+
+  it('shows a name from the feed as text, never as a mention, a link or formatting', async () => {
+    const made = await bossCommandsWith();
+    made.bosses.state.respond = () =>
+      Promise.resolve(
+        feedReply(
+          200,
+          feedWith({
+            name: '@everyone [click](https://evil.test) **Mon**',
+            tier: '5-Star Raids',
+            canBeShiny: false,
+          }),
+        ),
+      );
+    await made.bosses.service.sync();
+    const text = textsOf(await made.use('boss', 'list', { tier: 'T5' })).join('\n');
+    expect(text).toContain('[click]\\(https://evil.test)');
+    expect(text).toContain('\\*\\*Mon\\*\\*');
+    expect(text).not.toContain('](https');
+  });
+
+  it('names the headings of the feed it does not know', async () => {
+    const made = await bossCommandsWith();
+    made.bosses.state.respond = () =>
+      Promise.resolve(
+        feedReply(200, feedWith({ name: 'Mew', tier: 'Brand New Raids', canBeShiny: false })),
+      );
+    await made.bosses.service.sync();
+    const text = textsOf(await made.use('boss', 'list')).join('\n');
+    expect(text).toContain(
+      'The feed has headings I do not know, whose bosses are left out: Brand New Raids.',
+    );
+  });
+
+  it('says when the feed has never been read, and that there are no bosses', async () => {
+    const made = await bossCommandsWith({ empty: true });
+    const text = textsOf(await made.use('boss', 'list')).join('\n');
+    expect(text).toBe(
+      '**Raid bosses** · the feed has not been read yet\nThere are no raid bosses.',
+    );
+  });
+});
+
+describe('/admin boss sync', () => {
+  it('says that nothing changed', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'sync');
+    expect(made.bosses.state.requests).toBe(1);
+    expect(textsOf(used)).toEqual(['The feed lists the same bosses as before.']);
+  });
+
+  it('says nothing more when members see the same change in another order', async () => {
+    const made = await bossCommandsWith();
+    const feed = readRaidBossFeed() as object[];
+    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false });
+    feed.push({ name: 'Mew', tier: '5-Star Raids', canBeShiny: false });
+    made.bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
+    expect(textsOf(await made.use('boss', 'sync'))).toEqual([
+      'The feed lists other bosses now:\n- **T5** · New: Zekrom, Mew',
+    ]);
+  });
+
+  it('speaks of no override when a costume stays beside a plain form that went', async () => {
+    const made = await bossCommandsWith();
+    const plainPikachu = {
+      name: 'Pikachu',
+      tier: '1-Star Raids',
+      canBeShiny: true,
+      image: 'https://cdn.leekduck.com/assets/img/pokemon_icons/pm25.icon.png',
+    };
+    made.bosses.state.respond = () =>
+      Promise.resolve(
+        feedReply(200, JSON.stringify([...(readRaidBossFeed() as object[]), plainPikachu])),
+      );
+    await made.bosses.service.sync();
+    made.bosses.state.respond = () =>
+      Promise.resolve(feedReply(200, JSON.stringify(readRaidBossFeed())));
+    expect(textsOf(await made.use('boss', 'sync'))).toEqual([
+      'The feed lists other bosses now:\n- **T1** · Gone: Pikachu',
+    ]);
+  });
+
+  it('says what members see when it differs from what the feed says', async () => {
+    const made = await bossCommandsWith({
+      overrides: [
+        {
+          action: 'hide',
+          pokemonId: 'ZEKROM',
+          form: null,
+          tier: T5,
+          shiny: null,
+          expiresAt: null,
+          createdBy: MODERATOR,
+        },
+      ],
+    });
+    const feed = readRaidBossFeed() as object[];
+    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false });
+    feed.push({ name: 'Mew', tier: '5-Star Raids', canBeShiny: false });
+    made.bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
+    const used = await made.use('boss', 'sync');
+    expect(textsOf(used)).toEqual([
+      'The feed lists other bosses now:\n- **T5** · New: Zekrom, Mew\n' +
+        'Members see this, with the overrides in force:\n- **T5** · New: Mew',
+    ]);
+  });
+
+  it('says each way a read can fail without an address or a database message', async () => {
+    const made = await bossCommandsWith();
+    const said = async () => textsOf(await made.use('boss', 'sync'))[0]?.split('\n')[0];
+    made.bosses.state.respond = () => Promise.resolve(feedReply(200, '<html>'));
+    expect(await said()).toBe(
+      'I could not read the raid boss feed: the feed sent something I cannot read.',
+    );
+    made.bosses.state.respond = () =>
+      Promise.reject(new TypeError('fetch failed', { cause: new Error('ENOTFOUND secret.host') }));
+    expect(await said()).toBe(
+      'I could not read the raid boss feed: the feed could not be reached.',
+    );
+    made.bosses.store.failing = new Error('Access denied for user pine@10.0.0.3');
+    made.bosses.state.respond = () =>
+      Promise.resolve(feedReply(200, JSON.stringify(readRaidBossFeed())));
+    expect(await said()).toBe(
+      'I could not read the raid boss feed: something went wrong while storing it (see the log).',
+    );
+  });
+
+  it('may be used three times a minute', async () => {
+    const made = await bossCommandsWith();
+    for (let use = 0; use < 3; use++) await made.use('boss', 'sync');
+    const fourth = await made.use('boss', 'sync');
+    expect(made.bosses.state.requests).toBe(3);
+    expect(textsOf(fourth)[0]).toMatch(/^You can use \/admin boss sync again in/);
+  });
+
+  it('says what changed, by tier', async () => {
+    const made = await bossCommandsWith();
+    const feed = (readRaidBossFeed() as { name: string }[]).filter(
+      (entry) => entry.name !== 'Yveltal',
+    );
+    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false } as never);
+    made.bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
+    const used = await made.use('boss', 'sync');
+    expect(textsOf(used)).toEqual([
+      'The feed lists other bosses now:\n- **T5** · New: Zekrom · Gone: Yveltal',
+    ]);
+  });
+
+  it('says why a read failed and that the list stays', async () => {
+    const made = await bossCommandsWith();
+    made.bosses.state.respond = () => Promise.resolve(feedReply(503));
+    const used = await made.use('boss', 'sync');
+    expect(textsOf(used)).toEqual([
+      'I could not read the raid boss feed: the feed answered 503.\n' +
+        `The list stays as it was when the feed was last read, <t:${at(FEED_READ_AT)}:R>.`,
+    ]);
+  });
+
+  it('warns of a list that shrank to less than half, and of headings it does not know', async () => {
+    const made = await bossCommandsWith();
+    made.bosses.state.respond = () =>
+      Promise.resolve(
+        feedReply(
+          200,
+          JSON.stringify([
+            { name: 'Yveltal', tier: '5-Star Raids', canBeShiny: true },
+            { name: 'Mew', tier: 'Brand New Raids', canBeShiny: false },
+          ]),
+        ),
+      );
+    const text = textsOf(await made.use('boss', 'sync')).join('\n');
+    expect(text).toContain('Gone: ');
+    expect(text).toContain(
+      'The feed has headings I do not know, whose bosses are left out: Brand New Raids.',
+    );
+    expect(text).toContain('**The feed lists 1 boss where it listed 14.**');
+  });
+});
+
+describe('keptTogether', () => {
+  it('moves a heading into the next message with its items', () => {
+    const item = `- ${'x'.repeat(998)}`;
+    const lines = ['**T1**', item, '**T3**', item];
+    const firstLines = (texts: string[]) => texts.map((text) => text.split('\n')[0]);
+    expect(firstLines(fitMessages(lines))).toEqual(['**T1**', item]);
+    expect(firstLines(fitMessages(keptTogether(lines)))).toEqual(['**T1**', '**T3**']);
+  });
+
+  it('leaves a block too long for one message as its lines', () => {
+    const item = `- ${'x'.repeat(998)}`;
+    expect(keptTogether(['**T1**', item, item, item])).toEqual(['**T1**', item, item, item]);
+  });
+});
diff --git a/src/commands/admin/boss-list.ts b/src/commands/admin/boss-list.ts
new file mode 100644
index 0000000000000000000000000000000000000000..91d012f841cd8631227808c695472b466c6e2a36
--- /dev/null
+++ b/src/commands/admin/boss-list.ts
@@ -0,0 +1,331 @@
+import {
+  MessageFlags,
+  SlashCommandSubcommandBuilder,
+  type ChatInputCommandInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { StoredBoss } from '../../db/repositories/raid-boss-repository.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { bossReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
+import { feedLookupOf } from '../../domain/pogo/feed-lookup.js';
+import {
+  howIdentified,
+  isMegaLevel,
+  type Identification,
+} from '../../domain/pogo/raid-boss-feed.js';
+import {
+  autosetBoss,
+  feedBossKey,
+  overrideKeys,
+  type BossOverride,
+  type RaidBoss,
+} from '../../domain/pogo/raid-bosses.js';
+import { raidTierLabel, sameRaidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
+import {
+  seenTierChanges,
+  tierChangeLine,
+  tierChanges,
+  type TierChange,
+} from '../../render/boss-changes.js';
+import { count, fitItems, fitMessages, LIMITS, plain, timestamp } from '../../render/text.js';
+import type { FeedChange, SyncFailure, SyncResult } from '../../services/raid-boss-service.js';
+import { BOSS_GROUP, readTier, tierOption } from './boss-input.js';
+
+const IDENTIFIED: Readonly<Record<Identification, string>> = {
+  agree: 'found by picture and name',
+  'new-form': 'a form of it the game data does not know yet',
+  disagree: 'picture and name disagree',
+  picture: 'found by its picture',
+  name: 'found by its name',
+  neither: 'found by neither picture nor name',
+};
+
+const OLD_REASONS: Readonly<Record<ReportedOverride['old'][number], string>> = {
+  age: 'older than 30 days',
+  'feed-lists-it': 'the feed lists it now',
+  'feed-dropped-it': 'the feed does not list it',
+};
+
+/** How long an override lasts: `until <date>` or `for good`. */
+export function lasting(override: BossOverride): string {
+  return override.expiresAt === null ? 'for good' : `until ${timestamp(override.expiresAt, 'd')}`;
+}
+
+/** `added (#3, until …)`, and why it may be time to remove it. */
+function overrideText(reported: ReportedOverride): string {
+  const { override, old } = reported;
+  const tag = `${actionText(override)} (#${String(override.id)}, ${lasting(override)})`;
+  return old.length === 0
+    ? tag
+    : `${tag} · **old?** (${old.map((reason) => OLD_REASONS[reason]).join(', ')})`;
+}
+
+/** What an override does to the boss it acts on. */
+function actionText(override: BossOverride): string {
+  switch (override.action) {
+    case 'add':
+      return 'added';
+    case 'autoset':
+      return 'eggs hatch as it';
+    case 'shiny':
+      return `${override.shiny ? 'can be shiny' : 'never shiny'}${override.tier === null ? ' (any tier)' : ''}`;
+    case 'hide':
+      return 'hidden';
+  }
+}
+
+/** The ids a boss of the feed has, for one the game master does not know. */
+const idsText = (boss: { pokemonId: string; form: string | null }): string =>
+  `feed ids \`${boss.pokemonId}\`, ${boss.form === null ? 'no form' : `form \`${boss.form}\``}`;
+
+/** One boss of the list: its name, shiny, where it came from and what acts on it. */
+function bossLine(
+  ctx: AppContext,
+  boss: RaidBoss,
+  rows: readonly StoredBoss[],
+  overrides: readonly ReportedOverride[],
+): string {
+  const parts = [`- **${plain(boss.name)}**`];
+  if (boss.shiny) parts.push('shiny');
+  if (!boss.entry) parts.push(`**not in the game data** (${idsText(boss)})`);
+  const [row] = rows;
+  if (row) {
+    const { how } = howIdentified(row.name, row.image, feedLookupOf(ctx.gameData.catalogue), {
+      mega: isMegaLevel(row.tier.level),
+    });
+    parts.push(`from the feed, ${IDENTIFIED[how]}, since ${timestamp(row.firstSeen, 'd')}`);
+  }
+  for (const reported of overrides) {
+    parts.push(overrideText(reported));
+  }
+  return parts.join(' · ');
+}
+
+/** An override that acts on no boss of the list, or hides one. */
+function overrideLine(reported: ReportedOverride): string {
+  const { override } = reported;
+  const tier = override.tier === null ? 'every tier' : raidTierLabel(override.tier);
+  return `- ${plain(reported.name)} (${tier}) · ${overrideText(reported)}`;
+}
+
+/**
+ * What `/admin boss list` says: when the feed was read and what it has that Pine does not know,
+ * then the bosses tier by tier as members see them, each with where it came from and what acts
+ * on it, then what is hidden and what acts on nothing. With `tier`, that tier only.
+ */
+export function bossListLines(ctx: AppContext, now: number, tier?: RaidTier): string[] {
+  const admin = ctx.raidBossAdmin;
+  const report = bossReport(admin.feedBosses(), admin.overrides(), ctx.gameData.catalogue, now);
+  const inTier = (other: RaidTier | null): boolean =>
+    tier === undefined || other === null || sameRaidTier(other, tier);
+  const read = admin.lastSyncedAt;
+  const lines = [
+    read === undefined
+      ? '**Raid bosses** · the feed has not been read yet'
+      : `**Raid bosses** · the feed was read ${timestamp(read, 'R')}`,
+  ];
+  if (admin.unknownLevels.length > 0) {
+    lines.push(
+      'The feed has headings I do not know, whose bosses are left out: ' +
+        `${fitItems(admin.unknownLevels.map(plain), 1000)}.`,
+    );
+  }
+  const shown = report.bosses.filter((one) => inTier(one.boss.tier));
+  const all = report.bosses.map((one) => one.boss);
+  let previous: RaidTier | undefined;
+  for (const { boss, rows, overrides } of shown) {
+    if (!previous || !sameRaidTier(previous, boss.tier)) {
+      const hatches = autosetBoss(all, boss.tier);
+      lines.push(
+        `**${raidTierLabel(boss.tier)}**` +
+          (hatches ? ` · eggs hatch as ${plain(hatches.name)}` : ''),
+      );
+      previous = boss.tier;
+    }
+    lines.push(bossLine(ctx, boss, rows, overrides));
+  }
+  if (shown.length === 0) {
+    lines.push(tier === undefined ? 'There are no raid bosses.' : 'That tier has no bosses.');
+  }
+  const hidden = report.hidden.filter((one) => inTier(one.override.tier));
+  if (hidden.length > 0) lines.push('**Hidden**', ...hidden.map(overrideLine));
+  const idle = report.idle.filter((one) => inTier(one.override.tier));
+  if (idle.length > 0) {
+    lines.push(
+      '**Overrides that change nothing now** (their boss is hidden, or is no boss of that tier now)',
+      ...idle.map(overrideLine),
+    );
+  }
+  return lines;
+}
+
+/**
+ * The lines in blocks: a heading (a line that is no item, `- …`) with the items under it, so
+ * that a split between messages does not leave a heading at the end of one and its bosses in the
+ * next. A block too long for one message is left as its lines.
+ */
+export function keptTogether(lines: readonly string[]): string[] {
+  const blocks: string[][] = [];
+  for (const line of lines) {
+    const last = blocks.at(-1);
+    if (line.startsWith('- ') && last) last.push(line);
+    else blocks.push([line]);
+  }
+  return blocks.flatMap((block) => {
+    const joined = block.join('\n');
+    return joined.length <= LIMITS.content ? [joined] : block;
+  });
+}
+
+/** Sends lines as one answer and as many private follow-ups as they need. */
+async function sendLines(
+  interaction: ChatInputCommandInteraction,
+  lines: readonly string[],
+): Promise<void> {
+  const [first = '', ...rest] = fitMessages(keptTogether(lines));
+  await interaction.editReply({ content: first });
+  for (const more of rest) {
+    await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
+  }
+}
+
+/** `/admin boss list`. */
+export const listBosses: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('list')
+    .setDescription('Show the raid boss list, where each boss came from, and your overrides')
+    .addStringOption(tierOption(false, 'Only this tier')),
+  help: {
+    details:
+      'The bosses tier by tier as members see them. Each says whether it came from the feed ' +
+      '(and how the feed entry was identified: by its picture, its name or both) or from an ' +
+      'override, and what overrides act on it with their number and expiry. A boss the game ' +
+      'data does not know yet is listed by the name the feed gives, with its ids. Hidden ' +
+      'bosses and overrides that change nothing are listed apart; an override older than 30 ' +
+      'days, or one the feed has made pointless, is marked "old?".',
+    examples: ['/admin boss list', '/admin boss list tier:T5'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const value = interaction.options.getString('tier');
+    const tier = value === null ? undefined : readTier(value);
+    await sendLines(interaction, bossListLines(ctx, Date.now(), tier));
+  },
+};
+
+/** Why a read failed, as staff are told it: never the address, never a database message. */
+function failureText(kind: SyncFailure, httpStatus: number | undefined): string {
+  switch (kind) {
+    case 'status':
+      return `the feed answered ${String(httpStatus ?? 'with an error')}`;
+    case 'timeout':
+      return 'the feed did not answer in time';
+    case 'unreachable':
+      return 'the feed could not be reached';
+    case 'unreadable':
+      return 'the feed sent something I cannot read';
+    case 'storing':
+      return 'something went wrong while storing it (see the log)';
+    case 'stopped':
+      return 'I am shutting down';
+  }
+}
+
+/** Whether two lists of tier changes name the same bosses per tier, in whatever order. */
+function sameTierChanges(a: readonly TierChange[], b: readonly TierChange[]): boolean {
+  const key = (changes: readonly TierChange[]): string =>
+    changes
+      .map(
+        (change) =>
+          `${raidTierLabel(change.tier)}|${[...change.added].sort().join(',')}|` +
+          [...change.removed].sort().join(','),
+      )
+      .sort()
+      .join('\n');
+  return key(a) === key(b);
+}
+
+/** Whether an override in force acts on a Pokémon that the feed or what members see changed. */
+function overrideActsOn(ctx: AppContext, change: FeedChange): boolean {
+  const { catalogue } = ctx.gameData;
+  const keys = new Set([
+    ...[...change.added, ...change.removed].map((boss) => feedBossKey(boss, catalogue).key),
+    ...[...change.seen.added, ...change.seen.removed].map((boss) => boss.key),
+  ]);
+  const keyOf = overrideKeys(ctx.raidBossAdmin.feedBosses(), catalogue);
+  return ctx.raidBossAdmin.overrides().some((override) => keys.has(keyOf(override).key));
+}
+
+/** What `/admin boss sync` says of a read of the feed. */
+export function syncLines(ctx: AppContext, result: SyncResult): string[] {
+  const read = ctx.raidBossAdmin.lastSyncedAt;
+  if (result.status === 'failed') {
+    return [
+      `I could not read the raid boss feed: ${failureText(result.kind, result.httpStatus)}.`,
+      read === undefined
+        ? 'It has never been read; the list has no bosses but your overrides.'
+        : `The list stays as it was when the feed was last read, ${timestamp(read, 'R')}.`,
+    ];
+  }
+  const lines: string[] = [];
+  if (result.status === 'unchanged') {
+    lines.push('The feed lists the same bosses as before.');
+  } else {
+    const changes = tierChanges(result.change, ctx.gameData.catalogue);
+    lines.push(
+      changes.length === 0
+        ? 'The feed renamed some bosses, but members see the same list.'
+        : 'The feed lists other bosses now:',
+      ...changes.map((change) => `- ${tierChangeLine(change)}`),
+    );
+    // What members see is said apart only when it differs (per tier, whatever the order of the
+    // names) because an override in force acts on a Pokémon that changed; a difference without
+    // one (a costume that stays beside a plain form that went) is told by the feed's lines.
+    const seenChanges = seenTierChanges(result.change.seen);
+    if (!sameTierChanges(changes, seenChanges) && overrideActsOn(ctx, result.change)) {
+      lines.push(
+        seenChanges.length === 0
+          ? 'Members see no change, with the overrides in force.'
+          : 'Members see this, with the overrides in force:',
+        ...seenChanges.map((change) => `- ${tierChangeLine(change)}`),
+      );
+    }
+  }
+  if (result.unknownLevels) {
+    lines.push(
+      'The feed has headings I do not know, whose bosses are left out: ' +
+        `${fitItems(result.unknownLevels.map(plain), 1000)}. If one is a tier that is missing ` +
+        'from the list, add its bosses with `/admin boss add` until I learn the heading.',
+    );
+  }
+  if (result.shrank) {
+    lines.push(
+      `**The feed lists ${count(result.shrank.after, 'boss', 'bosses')} where it listed ` +
+        `${String(result.shrank.before)}.** If that is not the rotation, the feed may be ` +
+        'broken; `/admin boss list` shows what is left, and `/admin boss add` puts a boss back.',
+    );
+  }
+  return lines;
+}
+
+/** `/admin boss sync`. */
+export const syncBosses: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('sync')
+    .setDescription('Read the raid boss feed now, instead of at the next hourly read'),
+  help: {
+    details:
+      'Reads the feed at once and says what changed. A read that fails leaves the list as it ' +
+      'was. The game data (names, stats, forms) is not read again by this.',
+    examples: ['/admin boss sync'],
+  },
+  defer: 'ephemeral',
+  // A read asks a server of somebody else's; staff need it now and then, not in a loop.
+  throttle: { uses: 3, perSeconds: 60 },
+  async execute(interaction, ctx) {
+    const result = await ctx.raidBossAdmin.sync();
+    await sendLines(interaction, syncLines(ctx, result));
+  },
+};
diff --git a/src/commands/admin/index.ts b/src/commands/admin/index.ts
index deddd4069a98b5be085c963d0e98dc53a4221486..0316ebc097243a043767232321f7dafddbd242cf 100644
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -1,6 +1,8 @@
 import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
+import { BOSS_DESCRIPTION, BOSS_GROUP } from './boss-input.js';
+import { listBosses, syncBosses } from './boss-list.js';
 import { clearImageCache } from './clear-image-cache.js';
 import { saveParty } from './save-party.js';
 import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
@@ -15,6 +17,8 @@ const parts: readonly SubcommandPart[] = [
   saveParty,
   clearImageCache,
   ...selfRoleParts,
+  listBosses,
+  syncBosses,
 ];
 
 /** `/admin`: for staff. Discord offers it only to members who may manage the server. */
@@ -25,6 +29,6 @@ export const admin = commandGroup({
     .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
   help: { category: 'admin' },
   guards: [requireBotManagement],
-  groups: { [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION },
+  groups: { [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION, [BOSS_GROUP]: BOSS_DESCRIPTION },
   parts,
 });
diff --git a/src/commands/admin/self-roles.test.ts b/src/commands/admin/self-roles.test.ts
index b76158008d5aa598d57be0ee67a062d254e03449..9a12eb7032910b733c7bdefaa9a965b1a91c1637 100644
--- a/src/commands/admin/self-roles.test.ts
+++ b/src/commands/admin/self-roles.test.ts
@@ -72,8 +72,11 @@ function setup() {
 describe('/admin self-roles', () => {
   it('is a group of subcommands of /admin, and is not there when the feature is off', () => {
     const { ctx } = createTestContext();
+    // The parts of plan 5C (boss list, nicknames, member settings) are not looked at here.
     const paths = (config: typeof ctx.config) =>
-      declaredSubcommands(enabledCommands([admin], config)[0]?.data.toJSON().options);
+      declaredSubcommands(enabledCommands([admin], config)[0]?.data.toJSON().options).filter(
+        (path) => !/^(boss|nickname) |^member-settings$/.test(path),
+      );
     expect(paths(ctx.config)).toEqual([
       'setup-forums',
       'save-party',
diff --git a/src/domain/pogo/boss-report.test.ts b/src/domain/pogo/boss-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b03556a4569cdf0a78b26103cbf10722e8944111
--- /dev/null
+++ b/src/domain/pogo/boss-report.test.ts
@@ -0,0 +1,117 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { bossReport, OLD_OVERRIDE_MS } from './boss-report.js';
+import type { FeedBoss } from './raid-boss-feed.js';
+import type { BossOverride } from './raid-bosses.js';
+import type { RaidTier } from './raid-tier.js';
+
+const T3: RaidTier = { level: 'T3', shadow: false };
+const T5: RaidTier = { level: 'T5', shadow: false };
+const NOW = Date.UTC(2026, 9, 14, 12);
+const DAY = 24 * 60 * 60 * 1000;
+const catalogue = catalogueFixture();
+
+function row(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
+  const name = pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase();
+  return { pokemonId, form: null, tier, shiny: false, name, ...extra };
+}
+
+let nextId = 1;
+function override(extra: Partial<BossOverride>): BossOverride {
+  return {
+    id: nextId++,
+    pokemonId: 'ZEKROM',
+    form: null,
+    tier: T5,
+    action: 'add',
+    shiny: null,
+    expiresAt: null,
+    createdBy: '123456789012345678',
+    createdAt: NOW - DAY,
+    ...extra,
+  };
+}
+
+const FEED = [row('YVELTAL', T5), row('STARMIE', T3), row('UMBREON', T3)];
+
+describe('bossReport', () => {
+  it('gives every boss with the feed rows it came from', () => {
+    const report = bossReport(FEED, [], catalogue, NOW);
+    expect(report.bosses.map(({ boss, rows }) => [boss.key, rows.length])).toEqual([
+      ['starmie', 1],
+      ['umbreon', 1],
+      ['yveltal', 1],
+    ]);
+    expect(report.hidden).toEqual([]);
+    expect(report.idle).toEqual([]);
+  });
+
+  it('puts the overrides with the bosses they act on, and hidden ones apart', () => {
+    const add = override({ action: 'add', pokemonId: 'ZEKROM' });
+    const autoset = override({ action: 'autoset', pokemonId: 'YVELTAL' });
+    const shiny = override({ action: 'shiny', pokemonId: 'STARMIE', tier: null, shiny: true });
+    const hide = override({ action: 'hide', pokemonId: 'UMBREON', tier: T3 });
+    const report = bossReport(FEED, [add, autoset, shiny, hide], catalogue, NOW);
+    const of = (key: string) =>
+      report.bosses.find((one) => one.boss.key === key)?.overrides.map((o) => o.override.id);
+    expect(of('zekrom')).toEqual([add.id]);
+    expect(report.bosses.find((one) => one.boss.key === 'zekrom')?.rows).toEqual([]);
+    expect(of('yveltal')).toEqual([autoset.id]);
+    expect(of('starmie')).toEqual([shiny.id]);
+    expect(report.bosses.some((one) => one.boss.key === 'umbreon')).toBe(false);
+    expect(report.hidden.map((o) => [o.override.id, o.name, o.old])).toEqual([
+      [hide.id, 'Umbreon', []],
+    ]);
+    expect(report.idle).toEqual([]);
+  });
+
+  it('lists overrides that act on no boss of the list as idle', () => {
+    const hide = override({ action: 'hide', pokemonId: 'ZEKROM' });
+    const add = override({ action: 'add', pokemonId: 'ZEKROM' });
+    const shiny = override({ action: 'shiny', pokemonId: 'MEWTWO', tier: null, shiny: true });
+    const report = bossReport(FEED, [hide, add, shiny], catalogue, NOW);
+    expect(report.idle.map((o) => o.override.id)).toEqual([add.id, shiny.id]);
+  });
+
+  it('marks what may be time to remove', () => {
+    const aged = override({ action: 'autoset', pokemonId: 'YVELTAL', createdAt: NOW - 31 * DAY });
+    const redundant = override({ action: 'add', pokemonId: 'YVELTAL' });
+    const moot = override({ action: 'hide', pokemonId: 'ZEKROM' });
+    const lost = override({ action: 'shiny', pokemonId: 'MEWTWO', tier: null, shiny: true });
+    const kept = override({ action: 'shiny', pokemonId: 'STARMIE', tier: T3, shiny: false });
+    const recent = override({ action: 'add', pokemonId: 'ZEKROM', createdAt: NOW - 30 * DAY });
+    const report = bossReport(FEED, [aged, redundant, moot, lost, kept, recent], catalogue, NOW);
+    const all = [
+      ...report.bosses.flatMap((one) => one.overrides),
+      ...report.hidden,
+      ...report.idle,
+    ];
+    const old = (id: number) => all.find((o) => o.override.id === id)?.old;
+    expect(old(aged.id)).toEqual(['age']);
+    expect(old(redundant.id)).toEqual(['feed-lists-it']);
+    expect(old(moot.id)).toEqual(['feed-dropped-it']);
+    expect(old(lost.id)).toEqual(['feed-dropped-it']);
+    expect(old(kept.id)).toEqual([]);
+    expect(old(recent.id)).toEqual([]);
+    expect(OLD_OVERRIDE_MS).toBe(30 * DAY);
+  });
+
+  it('leaves expired overrides out', () => {
+    const expired = override({ action: 'hide', pokemonId: 'YVELTAL', expiresAt: NOW });
+    const report = bossReport(FEED, [expired], catalogue, NOW);
+    expect(report.hidden).toEqual([]);
+    expect(report.bosses.map(({ boss }) => boss.key)).toContain('yveltal');
+  });
+
+  it('keeps a boss the game master does not know with its rows, and finds it by its ids', () => {
+    const unknown = row('NEWMON', T5, { name: 'Newmon' });
+    const hide = override({ action: 'hide', pokemonId: 'NEWMON' });
+    const shown = bossReport([...FEED, unknown], [], catalogue, NOW);
+    const boss = shown.bosses.find((one) => one.boss.key === '~newmon');
+    expect(boss?.boss.entry).toBeUndefined();
+    expect(boss?.rows).toEqual([unknown]);
+    const hidden = bossReport([...FEED, unknown], [hide], catalogue, NOW);
+    expect(hidden.bosses.some((one) => one.boss.key === '~newmon')).toBe(false);
+    expect(hidden.hidden.map((o) => [o.key, o.name, o.old])).toEqual([['~newmon', 'Newmon', []]]);
+  });
+});
diff --git a/src/domain/pogo/boss-report.ts b/src/domain/pogo/boss-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fcd5bd79b0ffb1564911b9289152d4694e2add44
--- /dev/null
+++ b/src/domain/pogo/boss-report.ts
@@ -0,0 +1,113 @@
+import type { PokemonCatalogue } from './catalogue.js';
+import type { PokemonEntry } from './game-master.js';
+import { titleCase } from './names.js';
+import type { FeedBoss } from './raid-boss-feed.js';
+import {
+  effectiveBosses,
+  feedBossKey,
+  overrideKeys,
+  type BossOverride,
+  type RaidBoss,
+} from './raid-bosses.js';
+import { sameRaidTier, type RaidTier } from './raid-tier.js';
+
+/** An override this old is marked as one to look at (`/admin boss list`). */
+export const OLD_OVERRIDE_MS = 30 * 24 * 60 * 60 * 1000;
+
+/** An override in force, with what it is for. */
+export interface ReportedOverride {
+  override: BossOverride;
+  /** The `RaidBoss.key` of the Pokémon it is for. */
+  key: string;
+  /** Its catalogue entry; undefined for a Pokémon the game master does not know. */
+  entry: PokemonEntry | undefined;
+  /** How it is named: the entry's name, or the title-cased id. */
+  name: string;
+  /**
+   * Why it may be time to remove it: `age` (older than `OLD_OVERRIDE_MS`), `feed-lists-it` (an
+   * `add` for a boss the feed lists in that tier anyway), `feed-dropped-it` (a `hide` or a
+   * `shiny` for a Pokémon the feed does not list in that tier, or in any tier). Empty when none.
+   */
+  old: ('age' | 'feed-lists-it' | 'feed-dropped-it')[];
+}
+
+/** A boss of the list in effect, with where it came from. */
+export interface ReportedBoss<T extends FeedBoss> {
+  boss: RaidBoss;
+  /** The feed rows it was made of; empty for a boss that only an override adds. */
+  rows: T[];
+  /** The overrides in force that add it, chose it for eggs, or set its shiny flag. */
+  overrides: ReportedOverride[];
+}
+
+export interface BossReport<T extends FeedBoss> {
+  /** The list in effect, in its order (`effectiveBosses`). */
+  bosses: ReportedBoss<T>[];
+  /** The `hide` overrides in force, oldest first. */
+  hidden: ReportedOverride[];
+  /**
+   * The other overrides in force that touch no boss of the list: an `add` or `autoset` whose
+   * boss is hidden, a `shiny` for a Pokémon that is no boss now. Oldest first.
+   */
+  idle: ReportedOverride[];
+}
+
+const touches = (override: BossOverride, tier: RaidTier): boolean =>
+  override.tier === null || sameRaidTier(override.tier, tier);
+
+/**
+ * The boss list in effect at `now`, as staff look at it: every boss with the feed rows it came
+ * from and the overrides that act on it, the hidden ones apart, and the overrides that act on
+ * nothing. Expired overrides are left out, as `effectiveBosses` leaves them out.
+ */
+export function bossReport<T extends FeedBoss>(
+  feed: readonly T[],
+  overrides: readonly BossOverride[],
+  catalogue: PokemonCatalogue,
+  now: number,
+): BossReport<T> {
+  const active = overrides
+    .filter((override) => override.expiresAt === null || override.expiresAt > now)
+    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
+  const rows = feed.map((row) => ({ row, key: feedBossKey(row, catalogue).key }));
+  const listed = (key: string, tier: RaidTier | null): boolean =>
+    rows.some((one) => one.key === key && (tier === null || sameRaidTier(one.row.tier, tier)));
+  const keyOf = overrideKeys(feed, catalogue);
+  const reported = active.map((override): ReportedOverride => {
+    const { key, entry } = keyOf(override);
+    const old: ReportedOverride['old'] = [];
+    if (now - override.createdAt > OLD_OVERRIDE_MS) old.push('age');
+    if (override.action === 'add' && override.tier && listed(key, override.tier)) {
+      old.push('feed-lists-it');
+    }
+    if (
+      (override.action === 'hide' || override.action === 'shiny') &&
+      !listed(key, override.tier)
+    ) {
+      old.push('feed-dropped-it');
+    }
+    const name = entry?.name ?? titleCase(override.form ?? override.pokemonId);
+    return { override, key, entry, name, old };
+  });
+
+  const used = new Set<number>();
+  const bosses = effectiveBosses(feed, overrides, catalogue, now).map((boss) => {
+    const acting = reported.filter(
+      ({ override, key }) =>
+        override.action !== 'hide' && key === boss.key && touches(override, boss.tier),
+    );
+    for (const one of acting) used.add(one.override.id);
+    return {
+      boss,
+      rows: rows
+        .filter((one) => one.key === boss.key && sameRaidTier(one.row.tier, boss.tier))
+        .map((one) => one.row),
+      overrides: acting,
+    };
+  });
+  return {
+    bosses,
+    hidden: reported.filter(({ override }) => override.action === 'hide'),
+    idle: reported.filter(({ override }) => override.action !== 'hide' && !used.has(override.id)),
+  };
+}
diff --git a/src/domain/pogo/raid-boss-feed.test.ts b/src/domain/pogo/raid-boss-feed.test.ts
index 4cf44564f44fe5a8f158cabad19131dc03889aa1..2f362b65b1685bf0b1f4f8f568e51c9a17424530 100644
--- a/src/domain/pogo/raid-boss-feed.test.ts
+++ b/src/domain/pogo/raid-boss-feed.test.ts
@@ -4,6 +4,7 @@ import { readRaidBossFeed } from '../../../test/support/raid-bosses.js';
 import { PokemonCatalogue } from './catalogue.js';
 import { feedLookup } from './feed-lookup.js';
 import {
+  howIdentified,
   identifyBoss,
   isCostumeForm,
   parseRaidBossFeed,
@@ -365,32 +366,32 @@ describe('parseRaidBossFeed: costumes and new forms', () => {
       'Mega PIKACHU/PIKACHU_MEGA',
     ]);
     expect(resolved([raid('Mega Pikachu', 'Mega Raids', 'pm25.fMEGA.icon.png')])).toEqual([
-      'pikachu_mega (unknown)',
+      '~pikachu_mega (unknown)',
     ]);
     expect(resolved([raid('Mega Pikachu X', 'Mega Raids', 'pm25.fMEGA_X.icon.png')])).toEqual([
-      'pikachu_mega_x (unknown)',
+      '~pikachu_mega_x (unknown)',
     ]);
     expect(resolved([raid('Mega Pikachu Y', 'Mega Raids', 'pm25.fMEGA_Y.icon.png')])).toEqual([
-      'pikachu_mega_y (unknown)',
+      '~pikachu_mega_y (unknown)',
     ]);
     expect(resolved([raid('Primal Pikachu', 'Primal Raids', 'pm25.fPRIMAL.icon.png')])).toEqual([
-      'pikachu_primal (unknown)',
+      '~pikachu_primal (unknown)',
     ]);
   });
 
   it('keeps a mega of an unknown number unresolved too', () => {
     const mega = raid('Mega Newmon', 'Mega Raids', 'pm9999.fMEGA.icon.png');
     expect(parse([mega]).bosses[0]).toMatchObject({ pokemonId: 'MEGA_NEWMON', form: null });
-    expect(resolved([mega])).toEqual(['mega_newmon (unknown)']);
+    expect(resolved([mega])).toEqual(['~mega_newmon (unknown)']);
   });
 
   it('keeps a new regional form or a form named in its name unresolved', () => {
     expect(resolved([raid('Alolan Pikachu', '3-Star Raids', 'pm25.fALOLA.icon.png')])).toEqual([
-      'pikachu_alola (unknown)',
+      '~pikachu_alola (unknown)',
     ]);
     expect(
       resolved([raid('Pikachu (Cosplay Forme)', '3-Star Raids', 'pm25.fCOSPLAY.icon.png')]),
-    ).toEqual(['pikachu_cosplay (unknown)']);
+    ).toEqual(['~pikachu_cosplay (unknown)']);
   });
 
   it('resolves a form the game master knows to its own entry', () => {
@@ -590,6 +591,35 @@ describe('identifyBoss', () => {
   });
 });
 
+describe('howIdentified', () => {
+  const how = (name: string, file?: string) =>
+    howIdentified(name, file === undefined ? undefined : `${ICONS}${file}`, lookup).how;
+
+  it('says which of picture and name named the boss, and whether they agree', () => {
+    expect(how('Yveltal', 'pm717.icon.png')).toBe('agree');
+    expect(how('Zekrom', 'pm717.icon.png')).toBe('disagree');
+    expect(how('Newmon', 'pm717.icon.png')).toBe('picture');
+    expect(how('Yveltal')).toBe('name');
+    expect(how('Newmon')).toBe('neither');
+  });
+
+  it('says when the picture shows a form of the named species that the game data lacks', () => {
+    expect(how('Pikachu', 'pm25.fNEW_HAT_2099.icon.png')).toBe('new-form');
+    expect(how('Yveltal', 'pm25.fNEW_HAT_2099.icon.png')).toBe('disagree');
+  });
+
+  it('gives what identifyBoss made of it', () => {
+    expect(howIdentified('Zekrom', `${ICONS}pm717.icon.png`, lookup).used).toMatchObject({
+      via: 'nothing',
+      resolved: undefined,
+    });
+    expect(howIdentified('Yveltal', undefined, lookup).used).toMatchObject({
+      pokemonId: 'YVELTAL',
+      via: 'name',
+    });
+  });
+});
+
 /** The boss list of these entries against a catalogue, as keys. */
 function resolvedKeys(
   entries: unknown,
@@ -695,13 +725,13 @@ describe('parseRaidBossFeed: costumes do not borrow the stats of another form',
 
   it('keeps Mewtwo Z of fMEGA_Z unresolved', () => {
     expect(resolvedKeys([raid('Mewtwo Z', 'Mega Raids', 'pm150.fMEGA_Z.icon.png')])).toEqual([
-      'mewtwo_mega_z (unknown)',
+      '~mewtwo_mega_z (unknown)',
     ]);
   });
 
   it('keeps a form of its own with an unexpected spelling unresolved', () => {
     expect(resolvedKeys([raid('Mewtwo', '5-Star Raids', 'pm150.fTEN_PERCENT.icon.png')])).toEqual([
-      'mewtwo_ten_percent (unknown)',
+      '~mewtwo_ten_percent (unknown)',
     ]);
   });
 });
@@ -725,10 +755,10 @@ describe('parseRaidBossFeed: a picture that names no form', () => {
   it('does not trust a plain species in a mega raid', () => {
     const entries = [raid('Mega Newmon', 'Mega Raids', 'pm25.icon.png')];
     expect(parse(entries).bosses[0]).toMatchObject({ pokemonId: 'MEGA_NEWMON', form: null });
-    expect(resolvedKeys(entries)).toEqual(['mega_newmon (unknown)']);
+    expect(resolvedKeys(entries)).toEqual(['~mega_newmon (unknown)']);
     expect(
       resolvedKeys([raid('Mega Newmon', 'Super Mega Raids', 'pm25.fGLASS_HELMET_2026.icon.png')]),
-    ).toEqual(['pikachu_glass_helmet_2026 (unknown)']);
+    ).toEqual(['~pikachu_glass_helmet_2026 (unknown)']);
   });
 
   it('trusts a mega or primal form in a mega raid, known or not', () => {
@@ -850,11 +880,11 @@ describe('a boss is identified only when picture and name agree', () => {
     ['Dusk Mane Necrozma', '5-Star Raids', 'pm800.fSUMMER_2030', ['necrozma_dusk_mane']],
     ['Kyurem (Black)', '5-Star Raids', 'pm646.f2030', ['kyurem_black']],
     ['Armored Mewtwo', '5-Star Raids', 'pm150.fA_2030', ['mewtwo_a']],
-    ['Galarian Darmanitan', '5-Star Raids', 'pm555', ['galarian_darmanitan (unknown)']],
-    ['Paldean Tauros', '3-Star Raids', 'pm128', ['paldean_tauros (unknown)']],
+    ['Galarian Darmanitan', '5-Star Raids', 'pm555', ['~galarian_darmanitan (unknown)']],
+    ['Paldean Tauros', '3-Star Raids', 'pm128', ['~paldean_tauros (unknown)']],
     ['Shadow Rider Calyrex', '5-Star Raids', 'pm898', ['calyrex_shadow_rider']],
     ['Shadow Rider Calyrex', '5-Star Raids', 'pm898.fSHADOW_RIDER', ['calyrex_shadow_rider']],
-    ['Shadow Mewtwo', '5-Star Raids', 'pm150.fSHADOW', ['mewtwo_shadow (unknown)']],
+    ['Shadow Mewtwo', '5-Star Raids', 'pm150.fSHADOW', ['~mewtwo_shadow (unknown)']],
     ['Shadow Lugia', '5-Star Raids', 'pm249.fSHADOW_2030', ['lugia']],
     ['Astronaut Pikachu', '1-Star Raids', 'pm25.fGLASS_HELMET_2026', ['pikachu']],
     ['Galarian Corsola', '3-Star Raids', 'pm222.fSPRING_2026', ['corsola_galarian']],
@@ -862,13 +892,13 @@ describe('a boss is identified only when picture and name agree', () => {
       'Alolan Raichu (Holiday)',
       '3-Star Raids',
       'pm26.fALOLA_WINTER_2030',
-      ['raichu_alola_winter_2030 (unknown)'],
+      ['~raichu_alola_winter_2030 (unknown)'],
     ],
-    ['Mewtwo', '5-Star Raids', 'pm717', ['mewtwo_unmatched (unknown)']],
-    ['Mewtwo Z', 'Mega Raids', 'pm150.fMEGA_Z', ['mewtwo_mega_z (unknown)']],
+    ['Mewtwo', '5-Star Raids', 'pm717', ['~mewtwo_unmatched (unknown)']],
+    ['Mewtwo Z', 'Mega Raids', 'pm150.fMEGA_Z', ['~mewtwo_mega_z (unknown)']],
     ['Giratina (Origin)', '5-Star Raids', 'pm487', ['giratina_origin']],
     ['Mega Blastoise', 'Mega Raids', 'pm9', ['blastoise_mega']],
-    ['Mega Newmon', 'Mega Raids', 'pm25', ['mega_newmon (unknown)']],
+    ['Mega Newmon', 'Mega Raids', 'pm25', ['~mega_newmon (unknown)']],
     ['Unown U', '3-Star Raids', 'pm201.fUNOWN_U', ['unown_u']],
   ])('%s with %s of %s', (name, heading, file, keys) => {
     expect(resolvedKeys([raid(name, heading, `${file}.icon.png`)])).toEqual(keys);
@@ -897,7 +927,7 @@ describe('a boss is identified only when picture and name agree', () => {
       raid('Mewtwo', '5-Star Raids', 'pm717.icon.png'),
     ];
     expect(parse(entries).bosses).toHaveLength(2);
-    expect(resolvedKeys(entries)).toEqual(['mewtwo_unmatched (unknown)', 'yveltal']);
+    expect(resolvedKeys(entries)).toEqual(['~mewtwo_unmatched (unknown)', 'yveltal']);
   });
 
   it('finds an entry by the usual respellings of its name, and none when the name fits several', () => {
diff --git a/src/domain/pogo/raid-boss-feed.ts b/src/domain/pogo/raid-boss-feed.ts
index 01b8d0a2979bd7e18fa8c218c4a6dbfa62b0f80c..07355abcfaae5a7136aa3fc62229a02a44fd0ce0 100644
--- a/src/domain/pogo/raid-boss-feed.ts
+++ b/src/domain/pogo/raid-boss-feed.ts
@@ -463,6 +463,38 @@ export function identifyBoss(
   return matchBoss(name, pictureIds(image, lookup), lookup, options);
 }
 
+/**
+ * How a boss was identified, as `npm run raid-bosses:check` and `/admin boss list` say it:
+ * `agree` (picture and name name one entry), `new-form` (the picture shows a form of the named
+ * species that the game data does not know yet), `disagree` (they name different entries; `used`
+ * says what `matchBoss` made of it), `picture` or `name` (only that one names anything), or
+ * `neither` (the ids are made of the name).
+ */
+export type Identification = 'agree' | 'new-form' | 'disagree' | 'picture' | 'name' | 'neither';
+
+/** `identifyBoss`, and which of the two witnesses spoke (`Identification`). */
+export function howIdentified(
+  name: string,
+  image: unknown,
+  lookup: FeedLookup,
+  options: { mega?: boolean } = {},
+): { how: Identification; used: BossIdentity | undefined } {
+  const picture = pictureIds(image, lookup);
+  const named = lookup.findByName(name);
+  const used = identifyBoss(name, image, lookup, options);
+  const key = (ids: Ids): string =>
+    lookup.keyOf(ids.pokemonId, ids.form) ?? `? ${ids.form ?? ids.pokemonId}`;
+  if (picture && named) {
+    if (key(picture) === key(named)) return { how: 'agree', used };
+    const newForm =
+      picture.form !== null &&
+      lookup.kindOf(picture.pokemonId, picture.form) === undefined &&
+      named.pokemonId === picture.pokemonId;
+    return { how: newForm ? 'new-form' : 'disagree', used };
+  }
+  return { how: picture ? 'picture' : named ? 'name' : 'neither', used };
+}
+
 /**
  * Reads the raid boss feed (`raids.json` of ScrapedDuck, Leek Duck's raid boss page as data).
  * Throws when the document does not have the expected shape or lists no boss Pine understands, so
diff --git a/src/domain/pogo/raid-bosses.test.ts b/src/domain/pogo/raid-bosses.test.ts
index fadb717357ffdf5cfa1db3411207bb3c6c3e30dd..ad1d84f595d6e31afcddee419e4b019989cfafeb 100644
--- a/src/domain/pogo/raid-bosses.test.ts
+++ b/src/domain/pogo/raid-bosses.test.ts
@@ -288,7 +288,7 @@ describe('effectiveBosses: the feed alone', () => {
       NOW,
     );
     expect(boss).toMatchObject({
-      key: 'newmon_sky',
+      key: '~newmon_sky',
       name: 'Newmon (Sky Forme)',
       entry: undefined,
       source: 'feed',
@@ -358,7 +358,7 @@ describe('effectiveBosses: overrides', () => {
       catalogue,
       NOW,
     );
-    expect(boss).toMatchObject({ key: 'newmon_sky_forme', name: 'Newmon Sky Forme' });
+    expect(boss).toMatchObject({ key: '~newmon_sky_forme', name: 'Newmon Sky Forme' });
   });
 
   it('hides a boss of one tier only', () => {
@@ -542,7 +542,7 @@ describe('effectiveBosses: overrides that name a boss by the ids of the feed', (
     );
     expect(bosses.filter((b) => b.tier.level === 'T1' && !b.tier.shadow)).toMatchObject([
       { key: 'pikachu' },
-      { key: 'pikachu_never_seen', source: 'override', entry: undefined },
+      { key: '~pikachu_never_seen', source: 'override', entry: undefined },
     ]);
   });
 
@@ -564,6 +564,21 @@ describe('effectiveBosses: overrides that name a boss by the ids of the feed', (
   });
 });
 
+describe('effectiveBosses: the key of a boss the game master does not know', () => {
+  it('can never be the key of a catalogue entry', () => {
+    // An unresolved boss whose id spells a real key (`Genesect (Burn)` stored as GENESECT_BURN).
+    const [boss] = effectiveBosses(
+      [feedBoss('TYRANITAR_UNKNOWN_FORM', T5, { name: 'Tyranitar (Odd)' })],
+      [],
+      catalogue,
+      NOW,
+    );
+    expect(boss?.entry).toBeUndefined();
+    expect(boss?.key).toBe('~tyranitar_unknown_form');
+    expect(catalogue.all.some((entry) => entry.key.startsWith('~'))).toBe(false);
+  });
+});
+
 describe('autosetBoss', () => {
   it('is the only boss of a tier', () => {
     const bosses = effectiveBosses(feed, [], catalogue, NOW);
diff --git a/src/domain/pogo/raid-bosses.ts b/src/domain/pogo/raid-bosses.ts
index de2d6774a824e576af8282be51160ad3d9b2cc88..ba7412795f63fc0d6d50ed42df60ef75708a394d 100644
--- a/src/domain/pogo/raid-bosses.ts
+++ b/src/domain/pogo/raid-bosses.ts
@@ -47,7 +47,7 @@ export interface BossOverride extends NewBossOverride {
 export interface RaidBoss extends BossIds {
   /**
    * What tells bosses of one tier apart: the catalogue key when the game master knows the
-   * Pokémon, otherwise the lower-cased form or species id.
+   * Pokémon, otherwise the lower-cased form or species id behind `UNKNOWN_KEY_PREFIX`.
    */
   key: string;
   tier: RaidTier;
@@ -126,6 +126,61 @@ function compareBosses(a: RaidBoss, b: RaidBoss): number {
   );
 }
 
+/** A form id that only says "the plain form" (`<id>_NORMAL`) counts as no form. */
+function formOf(ids: BossIds): string | null {
+  return ids.form === `${ids.pokemonId}_NORMAL` ? null : ids.form;
+}
+
+/**
+ * Put in front of the key of a boss the game master does not know: no catalogue key starts with
+ * it, so such a boss is never taken for a real entry whose key its ids spell. The key is never
+ * stored (a raid stores `raidBossRef`: a catalogue key or a name).
+ */
+export const UNKNOWN_KEY_PREFIX = '~';
+
+/**
+ * `RaidBoss.key`: the catalogue key, or for a Pokémon without an entry the lower-cased form or
+ * species id behind `UNKNOWN_KEY_PREFIX`.
+ */
+function keyOf(ids: BossIds, entry: PokemonEntry | undefined): string {
+  return entry?.key ?? `${UNKNOWN_KEY_PREFIX}${(formOf(ids) ?? ids.pokemonId).toLowerCase()}`;
+}
+
+/** Upper-cased: the table's collation ignores case, so a row may not be upper case. */
+function rawIds(ids: BossIds): string {
+  return `${ids.pokemonId}|${formOf(ids) ?? ''}`.toUpperCase();
+}
+
+/** What a feed row stands for: its catalogue entry (`resolveBoss`) and its `RaidBoss.key`. */
+export function feedBossKey(
+  boss: FeedBoss,
+  catalogue: PokemonCatalogue,
+): { key: string; entry: PokemonEntry | undefined } {
+  const entry = resolveBoss(catalogue, boss);
+  return { key: keyOf(boss, entry), entry };
+}
+
+/**
+ * What an override is for, against this feed: the entry its ids name, and the key of the boss it
+ * finds (see `effectiveBosses` for an override whose ids are those of a feed row the catalogue
+ * cannot place).
+ */
+export function overrideKeys(
+  feed: readonly FeedBoss[],
+  catalogue: PokemonCatalogue,
+): (ids: BossIds) => { key: string; entry: PokemonEntry | undefined } {
+  const feedKeys = new Map<string, { key: string; entry: PokemonEntry | undefined }>();
+  for (const boss of feed) {
+    if (!feedKeys.has(rawIds(boss))) feedKeys.set(rawIds(boss), feedBossKey(boss, catalogue));
+  }
+  return (ids) => {
+    const exact = catalogue.byGameMasterId(ids.pokemonId, ids.form);
+    const fromFeed = exact ? undefined : feedKeys.get(rawIds(ids));
+    const entry = exact ?? fromFeed?.entry;
+    return { key: fromFeed?.key ?? keyOf(ids, entry), entry };
+  };
+}
+
 /**
  * The boss list in effect at `now`: the feed's bosses, plus `add` and `autoset` overrides, minus
  * `hide` overrides, with `shiny` overrides applied; expired overrides are ignored. Two feed rows
@@ -152,21 +207,13 @@ export function effectiveBosses(
   const active = overrides
     .filter((override) => override.expiresAt === null || override.expiresAt > now)
     .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
-  const formOf = (ids: BossIds): string | null =>
-    ids.form === `${ids.pokemonId}_NORMAL` ? null : ids.form;
-  const keyOf = (ids: BossIds, entry: PokemonEntry | undefined): string =>
-    entry?.key ?? (formOf(ids) ?? ids.pokemonId).toLowerCase();
-  // Upper-cased on both sides: the table's collation ignores case, so a row may not be upper case.
-  const rawIds = (ids: BossIds): string => `${ids.pokemonId}|${formOf(ids) ?? ''}`.toUpperCase();
   const slot = (key: string, tier: RaidTier): string =>
     `${key}|${tier.level}|${String(tier.shadow)}`;
+  const overrideKey = overrideKeys(feed, catalogue);
 
   const bosses = new Map<string, RaidBoss>();
-  const feedKeys = new Map<string, { key: string; entry: PokemonEntry | undefined }>();
   for (const boss of feed) {
-    const entry = resolveBoss(catalogue, boss);
-    const key = keyOf(boss, entry);
-    if (!feedKeys.has(rawIds(boss))) feedKeys.set(rawIds(boss), { key, entry });
+    const { key, entry } = feedBossKey(boss, catalogue);
     const existing = bosses.get(slot(key, boss.tier));
     if (existing) {
       existing.shiny ||= boss.shiny;
@@ -187,12 +234,7 @@ export function effectiveBosses(
     });
   }
 
-  const targets = active.map((override) => {
-    const exact = catalogue.byGameMasterId(override.pokemonId, override.form);
-    const fromFeed = exact ? undefined : feedKeys.get(rawIds(override));
-    const entry = exact ?? fromFeed?.entry;
-    return { override, entry, key: fromFeed?.key ?? keyOf(override, entry) };
-  });
+  const targets = active.map((override) => ({ override, ...overrideKey(override) }));
   for (const { override, entry, key } of targets) {
     if ((override.action !== 'add' && override.action !== 'autoset') || !override.tier) continue;
     if (bosses.has(slot(key, override.tier))) continue;
diff --git a/src/render/boss-changes.test.ts b/src/render/boss-changes.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3d0382e7fa36bbcbd61e19dd4bcddba1938b3bbd
--- /dev/null
+++ b/src/render/boss-changes.test.ts
@@ -0,0 +1,121 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import { diffBosses } from '../domain/pogo/boss-diff.js';
+import type { FeedBoss } from '../domain/pogo/raid-boss-feed.js';
+import { effectiveBosses } from '../domain/pogo/raid-bosses.js';
+import type { RaidTier } from '../domain/pogo/raid-tier.js';
+import {
+  bossChangeAnnouncement,
+  staleWarning,
+  tierChangeLine,
+  tierChanges,
+} from './boss-changes.js';
+
+const catalogue = catalogueFixture();
+const T1: RaidTier = { level: 'T1', shadow: false };
+const T5: RaidTier = { level: 'T5', shadow: false };
+const SHADOW_T5: RaidTier = { level: 'T5', shadow: true };
+const MEGA: RaidTier = { level: 'Mega', shadow: false };
+
+function boss(pokemonId: string, tier: RaidTier, extra: Partial<FeedBoss> = {}): FeedBoss {
+  const name = pokemonId.charAt(0) + pokemonId.slice(1).toLowerCase();
+  return { pokemonId, form: null, tier, shiny: false, name, ...extra };
+}
+
+describe('tierChanges', () => {
+  it('groups by tier in the order of the levels, shadow after plain, by catalogue names', () => {
+    const changes = tierChanges(
+      {
+        added: [
+          boss('BLASTOISE', MEGA, { form: 'BLASTOISE_MEGA', name: 'Mega Blastoise' }),
+          boss('YVELTAL', T5),
+          boss('LANDORUS', SHADOW_T5, { form: 'LANDORUS_INCARNATE', name: 'Landorus' }),
+        ],
+        removed: [boss('ZEKROM', T5), boss('MAGIKARP', T1)],
+      },
+      catalogue,
+    );
+    expect(changes).toEqual([
+      { tier: T1, added: [], removed: ['Magikarp'] },
+      { tier: T5, added: ['Yveltal'], removed: ['Zekrom'] },
+      { tier: SHADOW_T5, added: ['Landorus (Incarnate Forme)'], removed: [] },
+      { tier: MEGA, added: ['Mega Blastoise'], removed: [] },
+    ]);
+  });
+
+  it('drops a boss that went and came back under other ids in the same tier', () => {
+    const changes = tierChanges(
+      {
+        added: [boss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2027', name: 'Pikachu' })],
+        removed: [boss('PIKACHU', T1, { form: 'PIKACHU_GLASS_HELMET_2026', name: 'Pikachu' })],
+      },
+      catalogue,
+    );
+    expect(changes).toEqual([]);
+  });
+
+  it('keeps a Pokémon that moved to another tier, and names an unknown one plainly', () => {
+    const changes = tierChanges(
+      {
+        added: [boss('YVELTAL', SHADOW_T5), boss('NEWMON', T5, { name: 'New_mon*' })],
+        removed: [boss('YVELTAL', T5)],
+      },
+      catalogue,
+    );
+    expect(changes.map(tierChangeLine)).toEqual([
+      '**T5** · New: New\\_mon\\* · Gone: Yveltal',
+      '**Shadow T5** · New: Yveltal',
+    ]);
+  });
+});
+
+/** The lists in effect of these feed rows, without overrides. */
+const listOf = (...rows: FeedBoss[]) => effectiveBosses(rows, [], catalogue, 0);
+
+describe('bossChangeAnnouncement', () => {
+  it('is one message with a line per tier, of what members see', () => {
+    const seen = diffBosses(listOf(boss('ZEKROM', T5)), listOf(boss('YVELTAL', T5)));
+    expect(bossChangeAnnouncement(seen)).toBe(
+      '**The raid bosses have changed**\n**T5** · New: Yveltal · Gone: Zekrom',
+    );
+  });
+
+  it('is nothing when members see no change', () => {
+    expect(bossChangeAnnouncement({ added: [], removed: [] })).toBeUndefined();
+  });
+
+  it('shows a name from the feed as text', () => {
+    const seen = diffBosses(
+      [],
+      listOf(boss('NEWMON', T5, { name: '@everyone [x](https://e.test)' })),
+    );
+    const text = bossChangeAnnouncement(seen) ?? '';
+    expect(text).toContain('everyone \\[x]\\(https://e.test)');
+    expect(text).not.toContain('@everyone');
+    expect(text).not.toContain('](');
+  });
+
+  it('is cut with a count when it would be too long', () => {
+    const many = Array.from({ length: 400 }, (_, index) =>
+      boss(
+        `NEWMON${String(index)}`,
+        { level: index % 2 ? 'T1' : 'T3', shadow: index % 4 > 1 },
+        { name: `A rather long new Pokémon name ${String(index)}` },
+      ),
+    );
+    const text = bossChangeAnnouncement(diffBosses([], listOf(...many))) ?? '';
+    expect(text.length).toBeLessThanOrEqual(2000);
+    // Every tier keeps a line, each with as many names as fit and a count of the rest.
+    const lines = text.split('\n');
+    expect(lines).toHaveLength(5);
+    expect(lines.slice(1).every((line) => /…and \d+ more$/.test(line))).toBe(true);
+  });
+});
+
+describe('staleWarning', () => {
+  it('says since when, and nothing of the error', () => {
+    const at = Date.UTC(2026, 9, 12, 8);
+    expect(staleWarning(at)).toContain(`since <t:${String(at / 1000)}:f>`);
+    expect(staleWarning(undefined)).toContain('not been able to read the raid boss feed yet');
+  });
+});
diff --git a/src/render/boss-changes.ts b/src/render/boss-changes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5d8f36593e13aae288df82a7ed589829923a19d4
--- /dev/null
+++ b/src/render/boss-changes.ts
@@ -0,0 +1,125 @@
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import type { FeedBoss } from '../domain/pogo/raid-boss-feed.js';
+import type { SeenChange } from '../domain/pogo/boss-diff.js';
+import { feedBossKey, type BossListChange, type RaidBoss } from '../domain/pogo/raid-bosses.js';
+import {
+  RAID_LEVELS,
+  raidTierLabel,
+  sameRaidTier,
+  type RaidTier,
+} from '../domain/pogo/raid-tier.js';
+import { fitItems, LIMITS, plain, timestamp } from './text.js';
+
+/** What changed in one tier: the names of the bosses that came and went, as members see them. */
+export interface TierChange {
+  tier: RaidTier;
+  added: string[];
+  removed: string[];
+}
+
+const tierRank = (tier: RaidTier): number =>
+  RAID_LEVELS.indexOf(tier.level) * 2 + (tier.shadow ? 1 : 0);
+
+/**
+ * A change of the feed's list as members would see it, by tier in the order of the levels
+ * (shadow after plain): each boss named by its catalogue entry, or by the feed's name (made
+ * plain) when the game master does not know it. A boss that went and came back under other ids
+ * in the same tier (the feed renamed a costume id) is no change and is left out.
+ */
+export function tierChanges(change: BossListChange, catalogue: PokemonCatalogue): TierChange[] {
+  const placed = (boss: FeedBoss) => ({ boss, ...feedBossKey(boss, catalogue) });
+  const added = change.added.map(placed);
+  const removed = change.removed.map(placed);
+  const same = (a: (typeof added)[number], b: (typeof added)[number]): boolean =>
+    a.key === b.key && sameRaidTier(a.boss.tier, b.boss.tier);
+  const keptAdded = [...added];
+  const keptRemoved = removed.filter((gone) => {
+    const index = keptAdded.findIndex((come) => same(come, gone));
+    if (index === -1) return true;
+    keptAdded.splice(index, 1);
+    return false;
+  });
+  const name = (one: (typeof added)[number]): string => one.entry?.name ?? one.boss.name;
+  return byTier(
+    keptAdded.map((one) => ({ tier: one.boss.tier, name: name(one) })),
+    keptRemoved.map((one) => ({ tier: one.boss.tier, name: name(one) })),
+  );
+}
+
+/**
+ * What members see change (`SeenChange`: the lists in effect before and after, with the
+ * overrides), by tier as `tierChanges` gives it: each boss by the name the list shows.
+ */
+export function seenTierChanges(seen: SeenChange): TierChange[] {
+  const named = (boss: RaidBoss) => ({ tier: boss.tier, name: boss.name });
+  return byTier(seen.added.map(named), seen.removed.map(named));
+}
+
+/** Names that came and went, grouped by tier in the order of the levels, each made plain once. */
+function byTier(
+  added: readonly { tier: RaidTier; name: string }[],
+  removed: readonly { tier: RaidTier; name: string }[],
+): TierChange[] {
+  const tiers: TierChange[] = [];
+  const tierOf = (tier: RaidTier): TierChange => {
+    let found = tiers.find((one) => sameRaidTier(one.tier, tier));
+    if (!found) {
+      found = { tier: { ...tier }, added: [], removed: [] };
+      tiers.push(found);
+    }
+    return found;
+  };
+  for (const one of added) {
+    const list = tierOf(one.tier).added;
+    if (!list.includes(plain(one.name))) list.push(plain(one.name));
+  }
+  for (const one of removed) {
+    const list = tierOf(one.tier).removed;
+    if (!list.includes(plain(one.name))) list.push(plain(one.name));
+  }
+  return tiers.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
+}
+
+/** As many characters as the names of one side of a tier's line may take. */
+const NAMES_LIMIT = 500;
+
+/**
+ * A tier's change on one line: `**T5** · New: Yveltal · Gone: Zekrom`; a long list of names is
+ * cut with a count.
+ */
+export function tierChangeLine(change: TierChange): string {
+  return [
+    `**${raidTierLabel(change.tier)}**`,
+    ...(change.added.length > 0 ? [`New: ${fitItems(change.added, NAMES_LIMIT)}`] : []),
+    ...(change.removed.length > 0 ? [`Gone: ${fitItems(change.removed, NAMES_LIMIT)}`] : []),
+  ].join(' · ');
+}
+
+/**
+ * The announcement of a changed boss list as members see it (`SeenChange`: with the overrides
+ * in force), one message (cut with a count of the tiers left out), or undefined when members see
+ * no change. It pings nobody.
+ */
+export function bossChangeAnnouncement(seen: SeenChange): string | undefined {
+  const lines = seenTierChanges(seen).map(tierChangeLine);
+  if (lines.length === 0) return undefined;
+  const head = '**The raid bosses have changed**';
+  return `${head}\n${fitItems(lines, LIMITS.content - head.length - 1, '\n')}`;
+}
+
+/**
+ * The warning that the boss list is out of date, for the moderators' channel. It says since when
+ * and never what the error was: that is in the log, and may be a raw database message.
+ */
+export function staleWarning(lastSyncedAt: number | undefined): string {
+  const since =
+    lastSyncedAt === undefined
+      ? 'I have not been able to read the raid boss feed yet, so I know no raid bosses.'
+      : `I have not been able to read the raid boss feed since ${timestamp(lastSyncedAt, 'f')} ` +
+        `(${timestamp(lastSyncedAt, 'R')}), so the raid boss list may be out of date.`;
+  return (
+    `**The raid boss list is not being updated.** ${since} I keep trying. Meanwhile ` +
+    '`/admin boss add` and `/admin boss hide` change the list, and `/admin boss sync` tries ' +
+    'again at once.'
+  );
+}
diff --git a/src/services/raid-boss-service.test.ts b/src/services/raid-boss-service.test.ts
index d2986a3db0ddcd245cdb5772d19a169767b4a22b..83c888db24f8b39e7241baf884f4d5e2575f2e93 100644
--- a/src/services/raid-boss-service.test.ts
+++ b/src/services/raid-boss-service.test.ts
@@ -388,7 +388,7 @@ describe('RaidBossService', () => {
       await raidBosses.load();
       await raidBosses.sync();
       expect(raidBosses.bosses()).toMatchObject([
-        { key: 'newmon', name: 'Newmon', entry: undefined },
+        { key: '~newmon', name: 'Newmon', entry: undefined },
       ]);
     });
 
@@ -422,7 +422,7 @@ describe('RaidBossService', () => {
       await raidBosses.load();
       expect((await raidBosses.sync()).status).toBe('updated');
       expect(raidBosses.bosses()).toMatchObject([
-        { key: 'zekrom', name: 'Zekrom', shiny: true, entry: undefined },
+        { key: '~zekrom', name: 'Zekrom', shiny: true, entry: undefined },
       ]);
     });
 
@@ -457,7 +457,7 @@ describe('RaidBossService', () => {
       await raidBosses.load();
       await raidBosses.sync();
       expect(raidBosses.bosses()).toMatchObject([
-        { key: 'zekrom', name: 'Zekrom', entry: undefined },
+        { key: '~zekrom', name: 'Zekrom', entry: undefined },
       ]);
       gameData.catalogue = catalogueFixture();
       await raidBosses.sync();
@@ -489,7 +489,7 @@ describe('RaidBossService', () => {
         pokemon: data.pokemon.filter((entry) => entry.key !== 'yveltal'),
       });
       expect(raidBosses.bossesOf(T5)).toMatchObject([
-        { key: 'yveltal', name: 'Yveltal', entry: undefined },
+        { key: '~yveltal', name: 'Yveltal', entry: undefined },
       ]);
     });
   });
@@ -540,7 +540,7 @@ describe('RaidBossService', () => {
       await raidBosses.sync();
       const shadowT5 = { level: 'T5', shadow: true } as const;
       expect(raidBosses.bossesOf(shadowT5).map((b) => [b.key, b.entry === undefined])).toEqual([
-        ['landorus_incarnate', true],
+        ['~landorus_incarnate', true],
       ]);
       expect(raidBosses.bossesOf(shadowT5)[0]?.pokemonId).toBe('LANDORUS_INCARNATE');
 
diff --git a/test/support/boss-commands.ts b/test/support/boss-commands.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5e8c97324a2418e3964889a094016bc3f09ad811
--- /dev/null
+++ b/test/support/boss-commands.ts
@@ -0,0 +1,119 @@
+import { admin } from '../../src/commands/admin/index.js';
+import type { AppContext } from '../../src/app-context.js';
+import { InteractionRouter } from '../../src/discord/router.js';
+import type { NewBossOverride } from '../../src/domain/pogo/raid-bosses.js';
+import {
+  fakeAutocomplete,
+  fakeChatInput,
+  type FakeInteraction,
+  type FakeOptions,
+  type SentPayload,
+} from './fake-interactions.js';
+import { MEMBER, MODERATOR } from './gym-commands.js';
+import { WEST_CHANNEL } from './gyms.js';
+import { nicknameSearchWith } from './nicknames.js';
+import { raidBossServiceWith } from './raid-bosses.js';
+import { createTestContext } from './test-context.js';
+
+export { MEMBER, MODERATOR };
+
+type OptionValue = string | number | boolean;
+
+/**
+ * `/admin` over a real `RaidBossService` (`raidBossServiceWith`) and a real Pokémon search with
+ * stored nicknames (`nicknameSearchWith`), routed like in the bot, used by a moderator in the
+ * channel of West unless a call says otherwise. `use(group, subcommand, options)` runs a
+ * subcommand (`group` null for one outside a group); `typing` asks for the list of an option.
+ * `Date` is not faked: tests that read dates fake it themselves; the service has its own clock
+ * (`bosses.state.now`).
+ */
+export async function bossCommandsWith(
+  options: {
+    overrides?: readonly NewBossOverride[];
+    empty?: boolean;
+    nicknames?: Record<string, string[]>;
+    context?: Partial<AppContext>;
+  } = {},
+) {
+  const bosses = await raidBossServiceWith({
+    ...(options.overrides ? { overrides: options.overrides } : {}),
+    ...(options.empty ? { empty: true } : {}),
+  });
+  const search = await nicknameSearchWith(options.nicknames ?? {});
+  const { ctx, entries } = createTestContext({
+    raidBosses: bosses.service,
+    raidBossAdmin: bosses.service,
+    pokemon: search.search,
+    nicknames: search.search,
+    ...options.context,
+  });
+  const router = new InteractionRouter(ctx, [admin], []);
+  const staff: FakeOptions = {
+    userId: MODERATOR,
+    roleNames: ['Moderator'],
+    displayName: 'Morgan',
+    channelId: WEST_CHANNEL,
+  };
+  const handled = async (interaction: FakeInteraction): Promise<FakeInteraction> => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return {
+    bosses,
+    search,
+    ctx,
+    logged: entries,
+    staff,
+    use: (
+      group: string | null,
+      subcommand: string,
+      values: Record<string, OptionValue> = {},
+      extra: FakeOptions = {},
+    ) =>
+      handled(
+        fakeChatInput({
+          commandName: 'admin',
+          ...(group === null ? {} : { subcommandGroup: group }),
+          subcommand,
+          options: values,
+          ...staff,
+          ...extra,
+        }),
+      ),
+    typing: (
+      group: string | null,
+      subcommand: string,
+      focusedName: string,
+      focused: string,
+      values: Record<string, OptionValue> = {},
+      extra: FakeOptions = {},
+    ) =>
+      handled(
+        fakeAutocomplete({
+          commandName: 'admin',
+          ...(group === null ? {} : { subcommandGroup: group }),
+          subcommand,
+          focusedName,
+          focused,
+          options: values,
+          ...staff,
+          ...extra,
+        }),
+      ),
+  };
+}
+
+/** The choices an autocomplete interaction responded with. */
+export function choicesOf(interaction: FakeInteraction): { name: string; value: string }[] {
+  return (interaction.respond.mock.calls[0]?.[0] ?? []) as { name: string; value: string }[];
+}
+
+/** Every text a command answered with: the reply or its edit, then the follow-ups, in order. */
+export function textsOf(interaction: FakeInteraction): string[] {
+  const calls = [
+    ...interaction.reply.mock.calls,
+    ...interaction.editReply.mock.calls,
+    ...interaction.followUp.mock.calls,
+  ] as unknown as [SentPayload][];
+  return calls.map(([payload]) => payload.content ?? '');
+}
````

---

### Task 3: Overrides of the raid boss list: add, hide, autoset, shiny, remove

Prototype commit: `d04f4e604689214ea7fbdd37a50ac337609fc4ec`

Each stores an override through RaidBossService and answers what the tier's
list is now. The pokemon option offers the current bosses first, then what
the search finds; typed text acts only on a name it names outright, and a
boss the game data does not know is offered and stored by its feed ids. An
add or autoset lapses after 30 days unless days is given (days:0 for good),
a hide lasts until removed; a Pokemon that is no mega form is refused for a
tier of the mega kind. remove offers the overrides in force with what they
do and when they lapse. What the service refuses becomes a sentence.


**Files:**

```
 src/commands/admin/boss-overrides.test.ts | 352 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/boss-overrides.ts      | 482 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/index.ts               |   2 +
 3 files changed, 836 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Overrides of the raid boss list: add, hide, autoset, shiny, remove`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/commands/admin/boss-overrides.test.ts b/src/commands/admin/boss-overrides.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..25ff052aedfbbcdf25b30946f035304c5a37baa2
--- /dev/null
+++ b/src/commands/admin/boss-overrides.test.ts
@@ -0,0 +1,352 @@
+import { MessageFlags } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  bossCommandsWith,
+  choicesOf,
+  MEMBER,
+  MODERATOR,
+  textsOf,
+} from '../../../test/support/boss-commands.js';
+import { FEED_READ_AT, feedReply, readRaidBossFeed } from '../../../test/support/raid-bosses.js';
+import { admin } from './index.js';
+
+const DAY = 24 * 60 * 60 * 1000;
+const NOW = FEED_READ_AT + DAY;
+const at = (ms: number) => String(Math.floor(ms / 1000));
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'] });
+  vi.setSystemTime(NOW);
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');
+
+describe('/admin boss: the subcommands', () => {
+  it('lists them in the order of the brief', () => {
+    const json = admin.data.toJSON();
+    const group = json.options?.find((option) => option.name === 'boss');
+    const names = (group && 'options' in group ? (group.options ?? []) : []).map((o) => o.name);
+    expect(names).toEqual(['list', 'add', 'hide', 'autoset', 'shiny', 'remove', 'sync']);
+  });
+
+  it('refuses a member who is not staff, and offers them no choices', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use(
+      'boss',
+      'add',
+      { pokemon: 'zekrom', tier: 'T5' },
+      { userId: MEMBER, roleNames: [] },
+    );
+    expect(used.reply).toHaveBeenCalledWith({
+      content: 'Only admins, moderators and bot developers can do that.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(made.bosses.service.overrides()).toEqual([]);
+    const typed = await made.typing(
+      'boss',
+      'add',
+      'pokemon',
+      'zek',
+      {},
+      {
+        userId: MEMBER,
+        roleNames: [],
+      },
+    );
+    expect(choicesOf(typed)).toEqual([]);
+  });
+});
+
+describe('/admin boss add', () => {
+  it('adds a boss for 30 days by default, says so, and shows the tier now', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'add', { pokemon: 'Zekrom', tier: 'T5' });
+    expect(made.bosses.service.overrides()).toMatchObject([
+      {
+        id: 1,
+        action: 'add',
+        pokemonId: 'ZEKROM',
+        form: null,
+        tier: { level: 'T5', shadow: false },
+        shiny: false,
+        expiresAt: NOW + 30 * DAY,
+        createdBy: MODERATOR,
+      },
+    ]);
+    expect(textsOf(used)).toEqual([
+      `Zekrom is a boss of T5 (override #1, until <t:${at(NOW + 30 * DAY)}:d>).\n` +
+        'It lapses after 30 days unless you give `days` (`days:0` for good), so it does not ' +
+        'outlive the rotation.\n' +
+        '**T5** now: Yveltal (shiny), Zekrom',
+    ]);
+  });
+
+  it('takes days, 0 for good, and the shiny flag', async () => {
+    const made = await bossCommandsWith();
+    await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T5', days: 3, shiny: true });
+    expect(made.bosses.service.overrides()[0]).toMatchObject({
+      expiresAt: NOW + 3 * DAY,
+      shiny: true,
+    });
+    const forGood = await made.use('boss', 'add', { pokemon: 'mew', tier: 'T5', days: 0 });
+    expect(textOf(forGood)).toContain('Mew is a boss of T5 (override #2, for good).\n**T5**');
+    expect(textOf(forGood)).not.toContain('lapses');
+  });
+
+  it('says that the feed lists it already, or that it is hidden', async () => {
+    const made = await bossCommandsWith();
+    const listed = await made.use('boss', 'add', { pokemon: 'yveltal', tier: 'T5' });
+    expect(textOf(listed)).toContain(
+      'The feed lists it in that tier already, so this changes nothing while it does.',
+    );
+    await made.use('boss', 'hide', { pokemon: 'zekrom', tier: 'T5' });
+    const hidden = await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T5' });
+    expect(textOf(hidden)).toContain(
+      'It is hidden by override #2, so members do not see it until that is removed.',
+    );
+  });
+
+  it('refuses a Pokémon that is no mega for a mega tier', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'add', { pokemon: 'charizard', tier: 'Mega' });
+    expect(textOf(used)).toBe(
+      'Charizard is no mega or primal form, so it cannot be a boss of Mega raids. Pick its ' +
+        'mega form.',
+    );
+    expect(made.bosses.service.overrides()).toEqual([]);
+    await made.use('boss', 'add', { pokemon: 'charizard_mega_x', tier: 'Mega' });
+    expect(made.bosses.service.overrides()).toMatchObject([
+      { pokemonId: 'CHARIZARD', form: 'CHARIZARD_MEGA_X' },
+    ]);
+  });
+
+  it('refuses a mega form for a tier that is not of the mega kind', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'autoset', { pokemon: 'blastoise_mega', tier: 'T5' });
+    expect(textOf(used)).toBe(
+      'Mega Blastoise is a mega form, so it can only be a boss of Mega, Mega Legendary or Super ' +
+        'Mega raids.',
+    );
+    expect(made.bosses.service.overrides()).toEqual([]);
+  });
+
+  it('calls a primal form primal when it refuses it for another tier', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'add', { pokemon: 'kyogre_primal', tier: 'T5' });
+    expect(textOf(used)).toBe(
+      'Primal Kyogre is a primal form, so it can only be a boss of Mega, Mega Legendary or ' +
+        'Super Mega raids.',
+    );
+  });
+
+  it('points to the shiny override when the feed lists the boss already', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'add', { pokemon: 'yveltal', tier: 'T5', shiny: true });
+    expect(textOf(used)).toContain(
+      'The feed lists it in that tier already, so this changes nothing while it does. To change ' +
+        'whether it can be shiny, use `/admin boss shiny`.',
+    );
+  });
+
+  it('refuses text that names no Pokémon outright, with what it could be', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'add', { pokemon: 'zekrm', tier: 'T5' });
+    expect(textOf(used)).toMatch(/^"zekrm" is not the name of one Pokémon\. Did you mean Zekrom/);
+    const nothing = await made.use('boss', 'add', { pokemon: 'qqqqqq', tier: 'T5' });
+    expect(textOf(nothing)).toBe(
+      'I do not know a Pokémon called "qqqqqq". Pick one from the list.',
+    );
+    const tier = await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T4' });
+    expect(textOf(tier)).toBe('That is not a raid tier. Pick one from the list.');
+    expect(made.bosses.service.overrides()).toEqual([]);
+  });
+
+  it('turns what the service refuses into a sentence', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use(
+      'boss',
+      'add',
+      { pokemon: 'zekrom', tier: 'T5' },
+      { userId: '12', roleNames: ['Moderator'] },
+    );
+    expect(textOf(used)).toBe('That is not a member id.');
+  });
+});
+
+describe('/admin boss hide', () => {
+  it('hides a boss for good by default', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'hide', { pokemon: 'starmie', tier: 'T3' });
+    expect(made.bosses.service.overrides()).toMatchObject([
+      { action: 'hide', pokemonId: 'STARMIE', expiresAt: null, shiny: null },
+    ]);
+    expect(textsOf(used)).toEqual([
+      'Starmie is hidden from T3 (override #1, for good).\n' +
+        '**T3** now: Gothitelle (shiny), Umbreon (shiny)',
+    ]);
+  });
+
+  it('says that a Pokémon was no boss of the tier', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'hide', { pokemon: 'zekrom', tier: 'T5', days: 2 });
+    expect(textOf(used)).toContain(
+      `Zekrom is hidden from T5 (override #1, until <t:${at(NOW + 2 * DAY)}:d>).\n` +
+        'It was no boss of T5; it stays off the list if the feed lists it there.',
+    );
+  });
+});
+
+describe('/admin boss autoset', () => {
+  it('chooses what eggs hatch as, for 30 days by default', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('boss', 'autoset', { pokemon: 'gothitelle', tier: 'T3' });
+    expect(made.bosses.service.overrides()).toMatchObject([
+      { action: 'autoset', pokemonId: 'GOTHITELLE', expiresAt: NOW + 30 * DAY },
+    ]);
+    expect(textOf(used)).toContain(
+      `Eggs of T3 hatch as Gothitelle (override #1, until <t:${at(NOW + 30 * DAY)}:d>).`,
+    );
+    expect(textOf(used)).toContain(
+      '**T3** now: Gothitelle (shiny), Starmie (shiny), Umbreon (shiny) · eggs hatch as Gothitelle',
+    );
+  });
+});
+
+describe('/admin boss shiny', () => {
+  it('sets shiny in every tier, or in one', async () => {
+    const made = await bossCommandsWith();
+    const every = await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
+    expect(textsOf(every)).toEqual([
+      'Yveltal is never shiny, in any tier (override #1, for good).\n' +
+        '**T5** now: Yveltal · eggs hatch as Yveltal',
+    ]);
+    const one = await made.use('boss', 'shiny', {
+      pokemon: 'mewtwo',
+      'can-be-shiny': true,
+      tier: 'T5',
+    });
+    expect(textsOf(one)).toEqual([
+      'Mewtwo can be shiny in T5 (override #2, for good).\nIt is no boss of T5 now.',
+    ]);
+    expect(made.bosses.service.overrides()).toMatchObject([
+      { action: 'shiny', tier: null, shiny: false },
+      { action: 'shiny', tier: { level: 'T5' }, shiny: true },
+    ]);
+  });
+});
+
+describe('/admin boss remove', () => {
+  it('offers the overrides in force with what they do and when they lapse', async () => {
+    const made = await bossCommandsWith();
+    await made.use('boss', 'add', { pokemon: 'zekrom', tier: 'T5' });
+    await made.use('boss', 'hide', { pokemon: 'starmie', tier: 'T3' });
+    const typed = await made.typing('boss', 'remove', 'override', '');
+    expect(choicesOf(typed)).toEqual([
+      { name: '#1 Zekrom added to T5 · until 2026-11-11', value: 'id:1' },
+      { name: '#2 Starmie hidden from T3 · for good', value: 'id:2' },
+    ]);
+    expect(choicesOf(await made.typing('boss', 'remove', 'override', 'star'))).toEqual([
+      { name: '#2 Starmie hidden from T3 · for good', value: 'id:2' },
+    ]);
+    await made.use('boss', 'autoset', { pokemon: 'mewtwo', tier: 'T5', days: 0 });
+    await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
+    expect(choicesOf(await made.typing('boss', 'remove', 'override', '')).slice(2)).toEqual([
+      { name: '#3 Mewtwo: eggs of T5 hatch as it · for good', value: 'id:3' },
+      { name: '#4 Yveltal: never shiny (any tier) · for good', value: 'id:4' },
+    ]);
+  });
+
+  it('offers at most 25 overrides', async () => {
+    const overrides = Array.from({ length: 32 }, (_, index) => ({
+      action: 'hide' as const,
+      pokemonId: `NEWMON${String(index)}`,
+      form: null,
+      tier: { level: index % 2 ? ('T1' as const) : ('T3' as const), shadow: false },
+      shiny: null,
+      expiresAt: NOW + (index + 1) * DAY,
+      createdBy: MODERATOR,
+    }));
+    const made = await bossCommandsWith({ overrides });
+    expect(made.bosses.service.overrides().length).toBeGreaterThan(25);
+    const choices = choicesOf(await made.typing('boss', 'remove', 'override', ''));
+    expect(choices).toHaveLength(25);
+    expect(choicesOf(await made.typing('boss', 'remove', 'override', '#1'))).toHaveLength(1);
+  });
+
+  it('removes one by choice or number and shows the tier now', async () => {
+    const made = await bossCommandsWith();
+    await made.use('boss', 'hide', { pokemon: 'starmie', tier: 'T3' });
+    const used = await made.use('boss', 'remove', { override: 'id:1' });
+    expect(textsOf(used)).toEqual([
+      'Removed override #1: Starmie hidden from T3.\n' +
+        '**T3** now: Gothitelle (shiny), Starmie (shiny), Umbreon (shiny)',
+    ]);
+    expect(made.bosses.service.overrides()).toEqual([]);
+    await made.use('boss', 'shiny', { pokemon: 'yveltal', 'can-be-shiny': false });
+    const typed = await made.use('boss', 'remove', { override: '#2' });
+    expect(textsOf(typed)).toEqual([
+      'Removed override #2: Yveltal: never shiny (any tier).\n' +
+        '**T5** now: Yveltal (shiny) · eggs hatch as Yveltal',
+    ]);
+  });
+
+  it('refuses what is no override in force', async () => {
+    const made = await bossCommandsWith();
+    expect(textOf(await made.use('boss', 'remove', { override: 'id:9' }))).toBe(
+      'There is no override #9. It may have lapsed or been removed.',
+    );
+    expect(textOf(await made.use('boss', 'remove', { override: 'zekrom' }))).toBe(
+      'Pick an override from the list, or give its number (`3` or `#3`).',
+    );
+  });
+});
+
+describe('/admin boss: the pokemon option', () => {
+  it('offers the bosses first, then what the text finds', async () => {
+    const made = await bossCommandsWith();
+    const empty = choicesOf(await made.typing('boss', 'add', 'pokemon', ''));
+    expect(empty.slice(0, 3)).toEqual([
+      { name: 'Pikachu', value: 'pikachu' },
+      { name: 'Gastly', value: 'gastly' },
+      { name: 'Gible', value: 'gible' },
+    ]);
+    expect(choicesOf(await made.typing('boss', 'add', 'pokemon', 'zekr'))[0]).toEqual({
+      name: 'Zekrom',
+      value: 'zekrom',
+    });
+    expect(choicesOf(await made.typing('boss', 'hide', 'pokemon', 'yvel'))[0]).toEqual({
+      name: 'Yveltal',
+      value: 'yveltal',
+    });
+  });
+
+  it('offers a boss the game data does not know by its ids, and acts on them', async () => {
+    const made = await bossCommandsWith();
+    made.bosses.state.respond = () =>
+      Promise.resolve(
+        feedReply(
+          200,
+          JSON.stringify([
+            ...(readRaidBossFeed() as object[]),
+            { name: 'Brandnewmon', tier: '5-Star Raids', canBeShiny: false },
+          ]),
+        ),
+      );
+    await made.bosses.service.sync();
+    const choices = choicesOf(await made.typing('boss', 'hide', 'pokemon', 'brand'));
+    expect(choices).toEqual([
+      { name: 'Brandnewmon (not in the game data: BRANDNEWMON)', value: 'ids:BRANDNEWMON' },
+    ]);
+    const used = await made.use('boss', 'hide', { pokemon: 'ids:BRANDNEWMON', tier: 'T5' });
+    expect(textOf(used)).toContain('Brandnewmon is hidden from T5 (override #1, for good).');
+    expect(made.bosses.service.bosses().some((boss) => boss.pokemonId === 'BRANDNEWMON')).toBe(
+      false,
+    );
+    expect(textOf(await made.use('boss', 'hide', { pokemon: 'ids:GONEMON', tier: 'T5' }))).toBe(
+      'That boss is no longer in the feed. Pick again from the list.',
+    );
+  });
+});
diff --git a/src/commands/admin/boss-overrides.ts b/src/commands/admin/boss-overrides.ts
new file mode 100644
index 0000000000000000000000000000000000000000..007dc9aaee7bcdc8fbf0702c97b1851b365c992c
--- /dev/null
+++ b/src/commands/admin/boss-overrides.ts
@@ -0,0 +1,482 @@
+import { SlashCommandSubcommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
+import { DateTime } from 'luxon';
+import type { AppContext } from '../../app-context.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import { bossReport, type ReportedOverride } from '../../domain/pogo/boss-report.js';
+import { isMegaLevel } from '../../domain/pogo/raid-boss-feed.js';
+import {
+  autosetBoss,
+  type BossOverride,
+  type NewBossOverride,
+  type RaidBoss,
+} from '../../domain/pogo/raid-bosses.js';
+import { raidTierLabel, sameRaidTier, type RaidTier } from '../../domain/pogo/raid-tier.js';
+import { plain, truncate } from '../../render/text.js';
+import { CHOICE_NAME, MAX_CHOICES } from '../choices.js';
+import {
+  BOSS_GROUP,
+  bossPokemonChoices,
+  chosenPokemon,
+  DEFAULT_DAYS,
+  expiryOf,
+  pokemonOption,
+  readTier,
+  tierOption,
+  withDays,
+  type ChosenPokemon,
+} from './boss-input.js';
+import { lasting } from './boss-list.js';
+
+/** The value of an override among the choices of `remove`. */
+const OVERRIDE_CHOICE = /^(?:id:|#)?(\d{1,10})$/;
+
+/** A tier's bosses after a change, on one line: `T5 now: Yveltal, Zekrom · eggs hatch as …`. */
+export function tierNow(ctx: AppContext, tier: RaidTier): string {
+  const all = ctx.raidBosses.bosses();
+  const bosses = all.filter((boss) => sameRaidTier(boss.tier, tier));
+  const label = `**${raidTierLabel(tier)}**`;
+  if (bosses.length === 0) return `${label} now has no bosses.`;
+  const hatches = autosetBoss(all, tier);
+  const names = bosses.map((boss) => `${plain(boss.name)}${boss.shiny ? ' (shiny)' : ''}`);
+  return (
+    `${label} now: ${names.join(', ')}` + (hatches ? ` · eggs hatch as ${plain(hatches.name)}` : '')
+  );
+}
+
+/** `#3, until <date>` or `#3, for good`, as the answers say it. */
+const numbered = (override: BossOverride): string =>
+  `override #${String(override.id)}, ${lasting(override)}`;
+
+/** Every override in force with the name of its Pokémon, by id. */
+function reportedOverrides(ctx: AppContext): Map<number, ReportedOverride> {
+  const admin = ctx.raidBossAdmin;
+  const report = bossReport(
+    admin.feedBosses(),
+    admin.overrides(),
+    ctx.gameData.catalogue,
+    Date.now(),
+  );
+  const all = [...report.bosses.flatMap((one) => one.overrides), ...report.hidden, ...report.idle];
+  return new Map(all.map((one) => [one.override.id, one]));
+}
+
+/**
+ * An override in a sentence or a choice, worded as the list words it: `Zekrom added to T5`,
+ * `Starmie hidden from T3`, `Mewtwo: eggs of T5 hatch as it`, `Yveltal: never shiny (any tier)`.
+ */
+function describeOverride(override: BossOverride, name: string): string {
+  const tier = override.tier === null ? 'any tier' : raidTierLabel(override.tier);
+  switch (override.action) {
+    case 'add':
+      return `${name} added to ${tier}`;
+    case 'hide':
+      return `${name} hidden from ${tier}`;
+    case 'autoset':
+      return `${name}: eggs of ${tier} hatch as it`;
+    case 'shiny':
+      return `${name}: ${override.shiny ? 'can be shiny' : 'never shiny'} (${tier})`;
+  }
+}
+
+/**
+ * Stores an override for the member of staff, refusing what `addOverride` refuses with its own
+ * sentence.
+ */
+async function store(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  chosen: ChosenPokemon,
+  override: Omit<NewBossOverride, 'pokemonId' | 'form' | 'createdBy'>,
+): Promise<BossOverride> {
+  try {
+    return await ctx.raidBossAdmin.addOverride({
+      ...chosen.ids,
+      ...override,
+      createdBy: interaction.user.id,
+    });
+  } catch (err) {
+    if (err instanceof RangeError) throw new UserError(err.message);
+    throw err;
+  }
+}
+
+/**
+ * A raid of the mega kind has a mega or primal form for its boss, and only such a raid has one:
+ * anything else is refused (a Pokémon the game data does not know is taken as it is).
+ */
+function checkTier(chosen: ChosenPokemon, tier: RaidTier): void {
+  if (!chosen.entry) return;
+  const mega = chosen.entry.kind === 'mega';
+  if (isMegaLevel(tier.level) && !mega) {
+    throw new UserError(
+      `${chosen.label} is no mega or primal form, so it cannot be a boss of ` +
+        `${raidTierLabel(tier)} raids. Pick its mega form.`,
+    );
+  }
+  if (!isMegaLevel(tier.level) && mega) {
+    const what = chosen.entry.tempEvolution === 'PRIMAL' ? 'a primal' : 'a mega';
+    throw new UserError(
+      `${chosen.label} is ${what} form, so it can only be a boss of Mega, Mega Legendary or ` +
+        'Super Mega raids.',
+    );
+  }
+}
+
+/**
+ * Whether a boss of the list is the Pokémon staff named: by its catalogue entry, or for one the
+ * game master does not know by its ids (an unknown boss's key can equal a real catalogue key).
+ */
+function sameBoss(chosen: ChosenPokemon, boss: RaidBoss): boolean {
+  return chosen.entry
+    ? boss.entry?.key === chosen.entry.key
+    : !boss.entry && boss.pokemonId === chosen.ids.pokemonId && boss.form === chosen.ids.form;
+}
+
+/** Whether the feed lists this Pokémon in this tier. */
+function feedLists(ctx: AppContext, chosen: ChosenPokemon, tier: RaidTier): boolean {
+  return ctx.raidBosses
+    .bosses()
+    .some(
+      (boss) => boss.source === 'feed' && sameBoss(chosen, boss) && sameRaidTier(boss.tier, tier),
+    );
+}
+
+/** The `hide` override in force for this Pokémon and tier, if any. */
+function hiddenBy(
+  ctx: AppContext,
+  chosen: ChosenPokemon,
+  tier: RaidTier,
+): BossOverride | undefined {
+  return ctx.raidBossAdmin
+    .overrides()
+    .find(
+      (one) =>
+        one.action === 'hide' &&
+        one.pokemonId === chosen.ids.pokemonId &&
+        one.form === chosen.ids.form &&
+        one.tier !== null &&
+        sameRaidTier(one.tier, tier),
+    );
+}
+
+/** The tiers this Pokémon is a boss of now. */
+function tiersOf(ctx: AppContext, chosen: ChosenPokemon): RaidTier[] {
+  const tiers: RaidTier[] = [];
+  for (const boss of ctx.raidBosses.bosses()) {
+    if (sameBoss(chosen, boss) && !tiers.some((tier) => sameRaidTier(tier, boss.tier))) {
+      tiers.push(boss.tier);
+    }
+  }
+  return tiers;
+}
+
+/** Whether the Pokémon is a boss of the tier now. */
+function isBoss(ctx: AppContext, chosen: ChosenPokemon, tier: RaidTier): boolean {
+  return tiersOf(ctx, chosen).some((one) => sameRaidTier(one, tier));
+}
+
+/** The answer: what was done, what to know about it, and the tier's list now. */
+async function answer(
+  interaction: ChatInputCommandInteraction,
+  lines: readonly string[],
+): Promise<void> {
+  await interaction.editReply({ content: lines.join('\n') });
+}
+
+/** The `days` an `add` or `autoset` was given, and what to say about a default. */
+function daysOf(interaction: ChatInputCommandInteraction): {
+  days: number | null;
+  defaulted: boolean;
+} {
+  const days = interaction.options.getInteger('days');
+  return { days, defaulted: days === null };
+}
+
+const DEFAULTED =
+  `It lapses after ${String(DEFAULT_DAYS)} days unless you give \`days\` (\`days:0\` for good), ` +
+  'so it does not outlive the rotation.';
+
+async function respondWithPokemon(
+  interaction: Parameters<NonNullable<SubcommandPart['autocomplete']>>[0],
+  ctx: AppContext,
+): Promise<void> {
+  const focused = interaction.options.getFocused(true);
+  await interaction.respond(
+    focused.name === 'pokemon' ? bossPokemonChoices(ctx, String(focused.value)) : [],
+  );
+}
+
+/** `/admin boss add`. */
+export const addBoss: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: withDays(
+    new SlashCommandSubcommandBuilder()
+      .setName('add')
+      .setDescription('Make a Pokémon a boss of a tier although the feed does not list it')
+      .addStringOption(pokemonOption())
+      .addStringOption(tierOption(true))
+      .addBooleanOption((option) =>
+        option.setName('shiny').setDescription('Whether it can be shiny (default: no)'),
+      ),
+    `For how many days (default ${String(DEFAULT_DAYS)}; 0 for good)`,
+  ),
+  help: {
+    details:
+      'For a boss the feed has not listed yet (a leak, an event) or lists wrongly. It lasts ' +
+      `${String(DEFAULT_DAYS)} days unless you give \`days\`; \`days:0\` keeps it until you ` +
+      'remove it with `/admin boss remove`. Adding it again replaces the earlier one.',
+    examples: [
+      '/admin boss add pokemon:Zekrom tier:T5',
+      '/admin boss add pokemon:Mew tier:T5 days:3',
+    ],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
+    const tier = readTier(interaction.options.getString('tier', true));
+    checkTier(chosen, tier);
+    const listed = feedLists(ctx, chosen, tier);
+    const { days, defaulted } = daysOf(interaction);
+    const shiny = interaction.options.getBoolean('shiny');
+    const saved = await store(interaction, ctx, chosen, {
+      action: 'add',
+      tier,
+      shiny: shiny ?? false,
+      expiresAt: expiryOf(days, DEFAULT_DAYS, Date.now()),
+    });
+    const hide = hiddenBy(ctx, chosen, tier);
+    await answer(interaction, [
+      `${chosen.label} is a boss of ${raidTierLabel(tier)} (${numbered(saved)}).`,
+      ...(defaulted ? [DEFAULTED] : []),
+      ...(listed
+        ? [
+            'The feed lists it in that tier already, so this changes nothing while it does.' +
+              (shiny === null
+                ? ''
+                : ' To change whether it can be shiny, use `/admin boss shiny`.'),
+          ]
+        : []),
+      ...(hide
+        ? [
+            `It is hidden by override #${String(hide.id)}, so members do not see it until ` +
+              'that is removed.',
+          ]
+        : []),
+      tierNow(ctx, tier),
+    ]);
+  },
+  autocomplete: respondWithPokemon,
+};
+
+/** `/admin boss hide`. */
+export const hideBoss: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: withDays(
+    new SlashCommandSubcommandBuilder()
+      .setName('hide')
+      .setDescription('Take a boss off a tier although the feed lists it')
+      .addStringOption(pokemonOption())
+      .addStringOption(tierOption(true)),
+    'For how many days (default: for good)',
+  ),
+  help: {
+    details:
+      'For a boss the feed lists wrongly or no longer has. It lasts until you remove it with ' +
+      '`/admin boss remove`, or for `days`. A hidden boss beats one you added.',
+    examples: ['/admin boss hide pokemon:Starmie tier:T3'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
+    const tier = readTier(interaction.options.getString('tier', true));
+    const was = isBoss(ctx, chosen, tier);
+    const saved = await store(interaction, ctx, chosen, {
+      action: 'hide',
+      tier,
+      shiny: null,
+      expiresAt: expiryOf(interaction.options.getInteger('days'), null, Date.now()),
+    });
+    await answer(interaction, [
+      `${chosen.label} is hidden from ${raidTierLabel(tier)} (${numbered(saved)}).`,
+      ...(was
+        ? []
+        : [
+            `It was no boss of ${raidTierLabel(tier)}; it stays off the list if the feed lists ` +
+              'it there.',
+          ]),
+      tierNow(ctx, tier),
+    ]);
+  },
+  autocomplete: respondWithPokemon,
+};
+
+/** `/admin boss autoset`. */
+export const autosetBossPart: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: withDays(
+    new SlashCommandSubcommandBuilder()
+      .setName('autoset')
+      .setDescription('Choose what eggs of a tier hatch as when nobody says')
+      .addStringOption(pokemonOption())
+      .addStringOption(tierOption(true)),
+    `For how many days (default ${String(DEFAULT_DAYS)}; 0 for good)`,
+  ),
+  help: {
+    details:
+      'An egg of the tier hatches as this Pokémon when nobody says otherwise, and it is a boss ' +
+      'of the tier. A tier with one boss does that by itself; this is for a tier with several. ' +
+      `It lasts ${String(DEFAULT_DAYS)} days unless you give \`days\` (\`days:0\` for good). ` +
+      'The newest choice for a tier counts.',
+    examples: ['/admin boss autoset pokemon:Yveltal tier:T5'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
+    const tier = readTier(interaction.options.getString('tier', true));
+    checkTier(chosen, tier);
+    const { days, defaulted } = daysOf(interaction);
+    const saved = await store(interaction, ctx, chosen, {
+      action: 'autoset',
+      tier,
+      shiny: null,
+      expiresAt: expiryOf(days, DEFAULT_DAYS, Date.now()),
+    });
+    const hide = hiddenBy(ctx, chosen, tier);
+    await answer(interaction, [
+      `Eggs of ${raidTierLabel(tier)} hatch as ${chosen.label} (${numbered(saved)}).`,
+      ...(defaulted ? [DEFAULTED] : []),
+      ...(hide
+        ? [
+            `It is hidden by override #${String(hide.id)}, so this changes nothing until that ` +
+              'is removed.',
+          ]
+        : []),
+      tierNow(ctx, tier),
+    ]);
+  },
+  autocomplete: respondWithPokemon,
+};
+
+/** `/admin boss shiny`. */
+export const shinyBoss: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('shiny')
+    .setDescription('Say whether a boss can be shiny, whatever the feed says')
+    .addStringOption(pokemonOption())
+    .addBooleanOption((option) =>
+      option.setName('can-be-shiny').setDescription('True: it can be shiny').setRequired(true),
+    )
+    .addStringOption(tierOption(false, 'Only in this tier (default: every tier)')),
+  help: {
+    details:
+      'The feed says which bosses can be shiny; this overrides it until you remove it with ' +
+      '`/admin boss remove`. One for a single tier beats one for every tier.',
+    examples: ['/admin boss shiny pokemon:Yveltal can-be-shiny:True'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const chosen = chosenPokemon(ctx, interaction.options.getString('pokemon', true));
+    const value = interaction.options.getString('tier');
+    const tier = value === null ? null : readTier(value);
+    const shiny = interaction.options.getBoolean('can-be-shiny', true);
+    const saved = await store(interaction, ctx, chosen, {
+      action: 'shiny',
+      tier,
+      shiny,
+      expiresAt: null,
+    });
+    const where = tier === null ? ', in any tier' : ` in ${raidTierLabel(tier)}`;
+    const tiers = tier === null ? tiersOf(ctx, chosen) : isBoss(ctx, chosen, tier) ? [tier] : [];
+    await answer(interaction, [
+      `${chosen.label} ${shiny ? 'can be shiny' : 'is never shiny'}${where} (${numbered(saved)}).`,
+      ...(tiers.length === 0
+        ? [tier === null ? 'It is no boss now.' : `It is no boss of ${raidTierLabel(tier)} now.`]
+        : tiers.map((one) => tierNow(ctx, one))),
+    ]);
+  },
+  autocomplete: respondWithPokemon,
+};
+
+/** `/admin boss remove`. */
+export const removeOverride: SubcommandPart = {
+  group: BOSS_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('remove')
+    .setDescription('Remove one of your overrides of the boss list')
+    .addStringOption((option) =>
+      option
+        .setName('override')
+        .setDescription('The override, by its number or from the list')
+        .setRequired(true)
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    ),
+  help: {
+    details:
+      'The list offers every override in force with its number, what it does and when it ' +
+      'lapses; `/admin boss list` shows them too. The boss list is then as the other overrides ' +
+      'and the feed say.',
+    examples: ['/admin boss remove override:3'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const typed = interaction.options.getString('override', true).trim();
+    const id = OVERRIDE_CHOICE.exec(typed)?.[1];
+    if (id === undefined) {
+      throw new UserError('Pick an override from the list, or give its number (`3` or `#3`).');
+    }
+    const reported = reportedOverrides(ctx).get(Number(id));
+    if (!reported) {
+      throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
+    }
+    const removed = await ctx.raidBossAdmin.removeOverride(reported.override.id);
+    if (!removed) {
+      throw new UserError(`There is no override #${id}. It may have lapsed or been removed.`);
+    }
+    const { override } = reported;
+    // An override for every tier (shiny) shows each tier its Pokémon is a boss of now.
+    const tiers =
+      override.tier === null
+        ? tiersOf(ctx, { ids: override, entry: reported.entry, label: plain(reported.name) })
+        : [override.tier];
+    await answer(interaction, [
+      `Removed override #${id}: ${describeOverride(override, plain(reported.name))}.`,
+      ...tiers.map((tier) => tierNow(ctx, tier)),
+    ]);
+  },
+  async autocomplete(interaction, ctx) {
+    const typed = interaction.options.getFocused().trim().toLowerCase();
+    // A number is the override of that number; anything else is looked for in the text.
+    const number = /^#?(\d{1,10})$/.exec(typed)?.[1];
+    const zone = ctx.config.settings.timezone;
+    const choices = [...reportedOverrides(ctx).values()]
+      .sort((a, b) => a.override.id - b.override.id)
+      .map(({ override, name }) => ({
+        name:
+          `#${String(override.id)} ${describeOverride(override, name)} · ` +
+          (override.expiresAt === null
+            ? 'for good'
+            : `until ${DateTime.fromMillis(override.expiresAt, { zone }).toISODate() ?? ''}`),
+        value: `id:${String(override.id)}`,
+      }))
+      .filter((choice) =>
+        number === undefined
+          ? choice.name.toLowerCase().includes(typed)
+          : choice.value === `id:${number}`,
+      )
+      .slice(0, MAX_CHOICES)
+      .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
+    await interaction.respond(choices);
+  },
+};
+
+/** The parts of `/admin boss` that change overrides, in the order Discord lists them. */
+export const overrideParts: readonly SubcommandPart[] = [
+  addBoss,
+  hideBoss,
+  autosetBossPart,
+  shinyBoss,
+  removeOverride,
+];
diff --git a/src/commands/admin/index.ts b/src/commands/admin/index.ts
index 0316ebc097243a043767232321f7dafddbd242cf..67b23a3cbf400b71062e376e9ac102c5dfd49da8 100644
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -3,6 +3,7 @@ import { commandGroup, type SubcommandPart } from '../../discord/command-group.j
 import { requireBotManagement } from '../../discord/guards.js';
 import { BOSS_DESCRIPTION, BOSS_GROUP } from './boss-input.js';
 import { listBosses, syncBosses } from './boss-list.js';
+import { overrideParts } from './boss-overrides.js';
 import { clearImageCache } from './clear-image-cache.js';
 import { saveParty } from './save-party.js';
 import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
@@ -18,6 +19,7 @@ const parts: readonly SubcommandPart[] = [
   clearImageCache,
   ...selfRoleParts,
   listBosses,
+  ...overrideParts,
   syncBosses,
 ];
````

---

### Task 4: Announcing a changed raid boss list, and a list that is out of date

Prototype commit: `e5bf6ed86e48927e3583084c9e94757dc6f30ad2`

RaidBossAnnouncer listens to RaidBossService from before its first sync and
posts in every server of the bot, in the oldest text channel of the name the
settings give where the bot may post embeds, without a ping: a change of the
feed's list in bot-updates where raidBosses.announceChanges is on (by tier,
"New: ... Gone: ...", names from the catalogue, a renamed costume id left
out, one message cut with a count), and the stale warning in the moderators'
bot channel (since when, never the error). What comes before the client is
ready waits for it.


**Files:**

```
 src/app.ts                               |  18 +++++++++++-
 src/services/raid-boss-announcer.test.ts | 236 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/raid-boss-announcer.ts      | 134 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 387 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Announcing a changed raid boss list, and a list that is out of date`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/app.ts b/src/app.ts
index 3a45d1444dfde4e9479be106bfdb35fe557d42bb..8a2d51e2eb76ffdec15358c2a34bf28735187679 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -54,6 +54,7 @@ import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
 import { PokemonSearchService } from './services/pokemon-search-service.js';
+import { RaidBossAnnouncer } from './services/raid-boss-announcer.js';
 import { RaidBossService } from './services/raid-boss-service.js';
 import { RaidChangeService } from './services/raid-change-service.js';
 import { TimedPartyService } from './services/timed-party-service.js';
@@ -135,6 +136,18 @@ export async function startApp(
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway();
+  // The servers of the client that ended up connected, once it is ready.
+  let botServers: () => readonly string[] = () => [];
+  // Changes of the boss list and a list that is out of date, told to the servers once the client
+  // is ready (what comes earlier waits). Listening from here on: before the first sync.
+  const bossAnnouncer = new RaidBossAnnouncer({
+    gateway: partyGateway,
+    servers: () => botServers(),
+    gameData,
+    settings: config.settings,
+    log,
+  });
+  bossAnnouncer.attach(raidBosses);
   const members = new DiscordMemberDirectory({ log });
   const roleGateway = new DiscordRoleGateway();
   const selfRoles = new SelfRoleService({
@@ -410,6 +423,8 @@ export async function startApp(
       client.once(Events.ClientReady, (ready) => {
         log.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'connected to Discord');
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
+        botServers = () => [...ready.guilds.cache.keys()];
+        bossAnnouncer.ready();
         markConnected();
       });
       client.on(Events.GuildCreate, (guild) => {
@@ -448,7 +463,7 @@ export async function startApp(
     },
   });
   ctx.features = features;
-  // Listeners for the raid boss list (Phase 5) must be attached before this call.
+  // The listeners of the boss list (`bossAnnouncer`) were attached before this call.
   raidBosses.startAutoSync();
   raidEvents.start();
   // The clock waits for Discord, however long that takes: a post that cannot be asked for yet
@@ -499,6 +514,7 @@ export async function startApp(
       // The line of gyms that wait for their places is forgotten; what is being written finishes.
       { name: 'gym upkeep', timeoutMs: 5_000, run: () => gymUpkeep.stop() },
       { name: 'gym announcements', timeoutMs: 3_000, run: () => gymAdmin.flush() },
+      { name: 'raid boss announcements', timeoutMs: 3_000, run: () => bossAnnouncer.close() },
       // A change of gyms or regions that has begun is finished while the database is open.
       { name: 'gym and region changes', timeoutMs: 5_000, run: () => adminLock.whenIdle() },
       { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
diff --git a/src/services/raid-boss-announcer.test.ts b/src/services/raid-boss-announcer.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b0d015e736430bbc619012d63801dfa0c16906d1
--- /dev/null
+++ b/src/services/raid-boss-announcer.test.ts
@@ -0,0 +1,236 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import {
+  feedReply,
+  raidBossServiceWith,
+  readRaidBossFeed,
+} from '../../test/support/raid-bosses.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { loadSettings } from '../config/settings.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import { diffBosses } from '../domain/pogo/boss-diff.js';
+import type { FeedBoss } from '../domain/pogo/raid-boss-feed.js';
+import { diffFeed, effectiveBosses, type NewBossOverride } from '../domain/pogo/raid-bosses.js';
+import type { RaidTier } from '../domain/pogo/raid-tier.js';
+import { RaidBossAnnouncer } from './raid-boss-announcer.js';
+import type { FeedChange } from './raid-boss-service.js';
+
+const HOUR = 60 * 60_000;
+const OTHER_GUILD = '412345678901234599';
+const T1: RaidTier = { level: 'T1', shadow: false };
+const T5: RaidTier = { level: 'T5', shadow: false };
+
+const zekrom: FeedBoss = {
+  pokemonId: 'ZEKROM',
+  form: null,
+  tier: T5,
+  shiny: false,
+  name: 'Zekrom',
+};
+const pikachu = (year: string): FeedBoss => ({
+  pokemonId: 'PIKACHU',
+  form: `PIKACHU_GLASS_HELMET_${year}`,
+  tier: T1,
+  shiny: false,
+  name: 'Pikachu',
+});
+
+/** A change of the feed from these rows to those, as the service reports it (no overrides). */
+function change(before: FeedBoss[], after: FeedBoss[]): FeedChange {
+  const list = (rows: FeedBoss[]) => effectiveBosses(rows, [], catalogueFixture(), 0);
+  return { ...diffFeed(before, after), seen: diffBosses(list(before), list(after)) };
+}
+
+const ZEKROM_OVERRIDE: NewBossOverride = {
+  action: 'add',
+  pokemonId: 'ZEKROM',
+  form: null,
+  tier: T5,
+  shiny: null,
+  expiresAt: null,
+  createdBy: '123456789012345678',
+};
+
+function setup(options: { announceChanges?: boolean; servers?: string[] } = {}) {
+  const gateway = new FakePartyGateway();
+  const base = loadSettings(TEST_SETTINGS_PATH);
+  const settings = {
+    ...base,
+    raidBosses: { ...base.raidBosses, announceChanges: options.announceChanges ?? true },
+  };
+  const { log, entries } = createTestLogger();
+  const announcer = new RaidBossAnnouncer({
+    gateway,
+    servers: () => options.servers ?? [gateway.guildId],
+    gameData: { catalogue: catalogueFixture() },
+    settings,
+    log,
+  });
+  const sentTo = (channelId: string) =>
+    gateway.messages
+      .filter((message) => message.channelId === channelId)
+      .map((message) => message.message.content);
+  return { gateway, announcer, entries, sentTo };
+}
+
+/** The feed as downloaded, without Yveltal and with Zekrom. */
+function changedFeed(): string {
+  const feed = (readRaidBossFeed() as { name: string }[]).filter(
+    (entry) => entry.name !== 'Yveltal',
+  );
+  return JSON.stringify([...feed, { name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false }]);
+}
+
+describe('RaidBossAnnouncer', () => {
+  it('posts a change of the list in the channel for bot updates of every server', async () => {
+    const { gateway, announcer, sentTo } = setup({ servers: ['412345678901234567', OTHER_GUILD] });
+    gateway.addChannel('700000000000000001', 'bot-updates');
+    gateway.addChannel('700000000000000002', 'general');
+    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
+    const bosses = await raidBossServiceWith();
+    announcer.attach(bosses.service);
+    announcer.ready();
+    bosses.state.respond = () => Promise.resolve(feedReply(200, changedFeed()));
+    bosses.state.now += HOUR;
+    await bosses.service.sync();
+    await announcer.flush();
+    const text = '**The raid bosses have changed**\n**T5** · New: Zekrom · Gone: Yveltal';
+    expect(sentTo('700000000000000001')).toEqual([text]);
+    expect(sentTo('700000000000000003')).toEqual([text]);
+    expect(gateway.messages).toHaveLength(2);
+    expect(gateway.messages[0]?.message.mention).toBeUndefined();
+  });
+
+  it('waits for the client to be ready', async () => {
+    const { gateway, announcer, sentTo } = setup();
+    gateway.addChannel('700000000000000001', 'bot-updates');
+    const bosses = await raidBossServiceWith();
+    announcer.attach(bosses.service);
+    bosses.state.respond = () => Promise.resolve(feedReply(200, changedFeed()));
+    await bosses.service.sync();
+    await announcer.flush();
+    expect(gateway.messages).toEqual([]);
+    announcer.ready();
+    await announcer.flush();
+    expect(sentTo('700000000000000001')).toHaveLength(1);
+  });
+
+  it('says nothing when the setting is off, or when members see the same list', async () => {
+    const off = setup({ announceChanges: false });
+    off.gateway.addChannel('700000000000000001', 'bot-updates');
+    off.announcer.ready();
+    off.announcer.changed(change([], [zekrom]));
+    const on = setup();
+    on.gateway.addChannel('700000000000000001', 'bot-updates');
+    on.announcer.ready();
+    on.announcer.changed(change([pikachu('2026')], [pikachu('2027')]));
+    await off.announcer.flush();
+    await on.announcer.flush();
+    expect(off.gateway.messages).toEqual([]);
+    expect(on.gateway.messages).toEqual([]);
+  });
+
+  it('announces what members see, with the overrides in force', async () => {
+    const { gateway, announcer, sentTo } = setup();
+    gateway.addChannel('700000000000000001', 'bot-updates');
+    const bosses = await raidBossServiceWith({
+      overrides: [
+        { ...ZEKROM_OVERRIDE, action: 'hide' },
+        { ...ZEKROM_OVERRIDE, action: 'add', pokemonId: 'YVELTAL' },
+      ],
+    });
+    announcer.attach(bosses.service);
+    announcer.ready();
+    const feed = (readRaidBossFeed() as { name: string }[]).filter(
+      (entry) => entry.name !== 'Yveltal',
+    );
+    feed.push({ name: 'Zekrom', tier: '5-Star Raids', canBeShiny: false } as never);
+    feed.push({ name: 'Mew', tier: '5-Star Raids', canBeShiny: false } as never);
+    bosses.state.respond = () => Promise.resolve(feedReply(200, JSON.stringify(feed)));
+    bosses.state.now += HOUR;
+    await bosses.service.sync();
+    await announcer.flush();
+    // Zekrom stays hidden and Yveltal stays added: only Mew is news to members.
+    expect(sentTo('700000000000000001')).toEqual([
+      '**The raid bosses have changed**\n**T5** · New: Mew',
+    ]);
+  });
+
+  it('posts only where the bot may post embeds, and logs what failed', async () => {
+    const { gateway, announcer, entries } = setup({ servers: ['412345678901234567', OTHER_GUILD] });
+    gateway.addChannel('700000000000000001', 'bot-updates');
+    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
+    gateway.noEmbeds.add('700000000000000001');
+    gateway.failing.set('sendMessage', new Error('Missing Access'));
+    announcer.ready();
+    announcer.changed(change([], [zekrom]));
+    await announcer.flush();
+    expect(gateway.messages).toEqual([]);
+    expect(
+      entries.filter((e) => e['msg'] === 'could not announce the raid boss list'),
+    ).toMatchObject([{ guild: OTHER_GUILD, what: 'change' }]);
+  });
+
+  it('keeps the ten newest announcements while it waits for the client', async () => {
+    const { gateway, announcer, sentTo } = setup();
+    gateway.addChannel('700000000000000005', 'mod-bot-only');
+    for (let hour = 1; hour <= 11; hour++) {
+      announcer.stale({ lastSyncedAt: hour * HOUR, reason: 'down' });
+    }
+    announcer.ready();
+    await announcer.flush();
+    const sent = sentTo('700000000000000005');
+    expect(sent).toHaveLength(10);
+    expect(sent[0]).toContain(`<t:${String((2 * HOUR) / 1000)}:f>`);
+  });
+
+  it('passes over a server it has left, and a server without the channel', async () => {
+    const { gateway, announcer, sentTo } = setup({
+      servers: ['412345678901234567', '412345678901234500', OTHER_GUILD],
+    });
+    gateway.addChannel('700000000000000003', 'bot-updates', { guildId: OTHER_GUILD });
+    announcer.ready();
+    announcer.changed(change([], [zekrom]));
+    await announcer.flush();
+    expect(gateway.messages).toHaveLength(1);
+    expect(sentTo('700000000000000003')).toHaveLength(1);
+  });
+
+  it('waits in flush for the messages on their way, and sends nothing once closed', async () => {
+    const { gateway, announcer } = setup();
+    gateway.addChannel('700000000000000001', 'bot-updates');
+    announcer.ready();
+    announcer.changed(change([], [zekrom]));
+    expect(gateway.messages).toEqual([]);
+    await announcer.flush();
+    expect(gateway.messages).toHaveLength(1);
+    await announcer.close();
+    announcer.changed(change([], [zekrom]));
+    announcer.stale({ lastSyncedAt: HOUR, reason: 'down' });
+    await announcer.flush();
+    expect(gateway.messages).toHaveLength(1);
+  });
+
+  it('warns the moderators of a stale list once, without the error, whatever the setting', async () => {
+    const { gateway, announcer, sentTo } = setup({ announceChanges: false });
+    gateway.addChannel('700000000000000005', 'mod-bot-only');
+    gateway.addChannel('700000000000000001', 'bot-updates');
+    const bosses = await raidBossServiceWith({ staleAfterMs: 48 * HOUR });
+    announcer.attach(bosses.service);
+    announcer.ready();
+    const readAt = bosses.state.now;
+    bosses.state.respond = () => Promise.resolve(feedReply(500, 'secret database text'));
+    bosses.state.now += 49 * HOUR;
+    await bosses.service.sync();
+    bosses.state.now += HOUR;
+    await bosses.service.sync();
+    await announcer.flush();
+    const [warning, ...more] = sentTo('700000000000000005');
+    expect(more).toEqual([]);
+    expect(warning).toContain(`since <t:${String(readAt / 1000)}:f>`);
+    expect(warning).not.toContain('500');
+    expect(warning).not.toContain('secret');
+    expect(sentTo('700000000000000001')).toEqual([]);
+  });
+});
diff --git a/src/services/raid-boss-announcer.ts b/src/services/raid-boss-announcer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8caa9df8b3d8195d669ca362945e5ce14d21a4e0
--- /dev/null
+++ b/src/services/raid-boss-announcer.ts
@@ -0,0 +1,134 @@
+import type { Settings } from '../config/settings.js';
+import type { PartyGateway } from '../discord/party-gateway.js';
+import type { Logger } from '../log.js';
+import { bossChangeAnnouncement, staleWarning } from '../render/boss-changes.js';
+import type { GameDataProvider } from './game-data-service.js';
+import type { FeedChange, RaidBossService, StaleFeed } from './raid-boss-service.js';
+
+/** At most this many announcements wait for Discord; older ones are dropped first. */
+const MAX_WAITING = 10;
+
+export interface RaidBossAnnouncerOptions {
+  gateway: Pick<PartyGateway, 'serverChannels' | 'mayPost' | 'sendMessage'>;
+  /** The servers (snowflakes) the bot is in, as the client knows them once it is ready. */
+  servers: () => readonly string[];
+  gameData: GameDataProvider;
+  settings: Pick<Settings, 'channels' | 'raidBosses'>;
+  log: Logger;
+}
+
+interface Announcement {
+  /** The name of the channel it goes to in every server (`settings.channels`). */
+  channel: string;
+  content: string;
+  /** For the log. */
+  what: 'change' | 'stale';
+}
+
+/**
+ * Tells the servers of the bot about the raid boss list: a change of the list as members see it
+ * (the feed's list with the overrides in force) in the channel for bot updates (`settings.channels['bot-updates']`, where
+ * `settings.raidBosses.announceChanges` is on), and a list that is out of date in the
+ * moderators' bot channel (`settings.channels['mod-bot-lab']`). A message goes to the oldest
+ * text channel of that name in each server in which the bot may post embeds, and pings nobody.
+ *
+ * What the service reports before the client is ready waits (`ready`). A message is worded when
+ * the event comes, with the game data of that moment. Nobody waits for the sending, and a
+ * failure is logged.
+ */
+export class RaidBossAnnouncer {
+  private isReady = false;
+  private closed = false;
+  private waiting: Announcement[] = [];
+  private readonly sending = new Set<Promise<void>>();
+
+  constructor(private readonly options: RaidBossAnnouncerOptions) {}
+
+  /** Listens to the service; call it before the service's first sync. */
+  attach(source: Pick<RaidBossService, 'onChange' | 'onStale'>): void {
+    source.onChange((change) => {
+      this.changed(change);
+    });
+    source.onStale((stale) => {
+      this.stale(stale);
+    });
+  }
+
+  /** The client is ready: what waited is sent, and from now on everything at once. */
+  ready(): void {
+    if (this.isReady) return;
+    this.isReady = true;
+    const waiting = this.waiting;
+    this.waiting = [];
+    for (const announcement of waiting) this.send(announcement);
+  }
+
+  /** The feed's list changed: what members see change is announced (`FeedChange.seen`). */
+  changed(change: FeedChange): void {
+    if (!this.options.settings.raidBosses.announceChanges) return;
+    const content = bossChangeAnnouncement(change.seen);
+    if (content === undefined) return;
+    this.announce({
+      channel: this.options.settings.channels['bot-updates'],
+      content,
+      what: 'change',
+    });
+  }
+
+  stale(event: StaleFeed): void {
+    this.announce({
+      channel: this.options.settings.channels['mod-bot-lab'],
+      content: staleWarning(event.lastSyncedAt),
+      what: 'stale',
+    });
+  }
+
+  /** Waits for the messages that are on their way. For tests. */
+  async flush(): Promise<void> {
+    while (this.sending.size > 0) await Promise.allSettled([...this.sending]);
+  }
+
+  /**
+   * For shutdown: waits for the messages on their way, and from then on sends nothing (the
+   * client is about to go), also not what still waits for the client.
+   */
+  async close(): Promise<void> {
+    this.closed = true;
+    this.waiting = [];
+    await this.flush();
+  }
+
+  private announce(announcement: Announcement): void {
+    if (this.closed) return;
+    if (this.isReady) {
+      this.send(announcement);
+      return;
+    }
+    this.waiting.push(announcement);
+    if (this.waiting.length > MAX_WAITING) this.waiting.shift();
+  }
+
+  private send(announcement: Announcement): void {
+    const { gateway, servers, log } = this.options;
+    for (const guildId of servers()) {
+      const channel = (gateway.serverChannels(guildId) ?? []).find(
+        (one) =>
+          one.kind === 'text' && one.name === announcement.channel && gateway.mayPost(one.id),
+      );
+      if (!channel) continue;
+      const sent: Promise<void> = gateway
+        .sendMessage(channel.id, { content: announcement.content })
+        .then(
+          () => undefined,
+          (err: unknown) => {
+            log.warn(
+              { err, guild: guildId, what: announcement.what },
+              'could not announce the raid boss list',
+            );
+          },
+        )
+        .finally(() => this.sending.delete(sent));
+      this.sending.add(sent);
+    }
+  }
+}
````

---

### Task 5: Pokemon nicknames for staff, and a member's settings for staff

Prototype commit: `951e8999cf0c2de078049890177b3513fcc8fc3f`

/admin nickname add|remove|list changes the nicknames of the legacy Pokemon
table through ctx.nicknames: a nickname has 2 to 30 letters, digits, spaces
or hyphens and a letter, and is refused when it is already the name, an id
or a nickname of another Pokemon (which is named); members find the Pokemon
by it at once. remove offers the stored nicknames of the Pokemon picked;
the bot's own nicknames cannot be removed.

/admin member-settings shows staff, privately and without a ping, what Pine
keeps of a member in the server: the lines of /settings show without their
commands, friend code and in-game name, new-train DMs here, and how many
wants and gym targets they have here with the first few by name.


**Files:**

```
 src/commands/admin/index.ts                |  10 +++++-
 src/commands/admin/member-settings.test.ts | 115 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/member-settings.ts      |  93 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/nicknames.test.ts       | 150 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/nicknames.ts            | 290 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/settings/settings.ts          |  25 ++++++++-----
 6 files changed, 673 insertions(+), 10 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `Pokemon nicknames for staff, and a member's settings for staff`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/src/commands/admin/index.ts b/src/commands/admin/index.ts
index 67b23a3cbf400b71062e376e9ac102c5dfd49da8..e016f505476e3176031d101f7734a56df62e177b 100644
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -5,6 +5,8 @@ import { BOSS_DESCRIPTION, BOSS_GROUP } from './boss-input.js';
 import { listBosses, syncBosses } from './boss-list.js';
 import { overrideParts } from './boss-overrides.js';
 import { clearImageCache } from './clear-image-cache.js';
+import { memberSettings } from './member-settings.js';
+import { NICKNAME_DESCRIPTION, NICKNAME_GROUP, nicknameParts } from './nicknames.js';
 import { saveParty } from './save-party.js';
 import { SELF_ROLES_DESCRIPTION, SELF_ROLES_GROUP, selfRoleParts } from './self-roles.js';
 import { setupForums } from './setup-forums.js';
@@ -21,6 +23,8 @@ const parts: readonly SubcommandPart[] = [
   listBosses,
   ...overrideParts,
   syncBosses,
+  ...nicknameParts,
+  memberSettings,
 ];
 
 /** `/admin`: for staff. Discord offers it only to members who may manage the server. */
@@ -31,6 +35,10 @@ export const admin = commandGroup({
     .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
   help: { category: 'admin' },
   guards: [requireBotManagement],
-  groups: { [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION, [BOSS_GROUP]: BOSS_DESCRIPTION },
+  groups: {
+    [SELF_ROLES_GROUP]: SELF_ROLES_DESCRIPTION,
+    [BOSS_GROUP]: BOSS_DESCRIPTION,
+    [NICKNAME_GROUP]: NICKNAME_DESCRIPTION,
+  },
   parts,
 });
diff --git a/src/commands/admin/member-settings.test.ts b/src/commands/admin/member-settings.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..66298c2decb79dd6589b3ccbc4c663fc343440ce
--- /dev/null
+++ b/src/commands/admin/member-settings.test.ts
@@ -0,0 +1,115 @@
+import { describe, expect, it } from 'vitest';
+import { bossCommandsWith, MEMBER, textsOf } from '../../../test/support/boss-commands.js';
+import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
+import { MemoryGymTargets } from '../../../test/support/gym-targets.js';
+import { MemoryNewTrains } from '../../../test/support/new-trains.js';
+import { MemoryUsers } from '../../../test/support/users.js';
+import { MemoryWants } from '../../../test/support/wants.js';
+import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+
+const ASH = '300000000000000001';
+const OTHER_GUILD = '412345678901234599';
+
+const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');
+
+async function setup() {
+  const users = new MemoryUsers(
+    new Map([
+      [
+        ASH,
+        {
+          mentions: false,
+          autoStatus: PartyStatus.Coming,
+          raidPrivacy: RaidPrivacy.Anonymous,
+          friendCode: '1234 5678 9012',
+          nickname: 'Ash_K',
+        },
+      ],
+    ]),
+  );
+  const wants = new MemoryWants();
+  for (const dex of [1, 4, 7, 25, 133, 150, 151]) wants.add(ASH, FAKE_GUILD_ID, dex, 'both');
+  wants.add(ASH, FAKE_GUILD_ID, -7, 'spawn');
+  wants.add(ASH, OTHER_GUILD, 384, 'raid');
+  const gymTargets = new MemoryGymTargets();
+  await gymTargets.add(ASH, FAKE_GUILD_ID, 2);
+  await gymTargets.add(ASH, FAKE_GUILD_ID, 999);
+  const newTrains = new MemoryNewTrains();
+  await newTrains.set(ASH, FAKE_GUILD_ID, true, Date.now());
+  return bossCommandsWith({ context: { users, wants, gymTargets, newTrains } });
+}
+
+const ash = (more: object = {}) => ({
+  resolved: { member: { id: ASH, bot: false, username: 'ash', globalName: 'Ash', ...more } },
+  resolvedMembers: { member: { displayName: 'Ash of Pallet' } },
+});
+
+describe('/admin member-settings', () => {
+  it('shows everything Pine keeps about the member in this server, for staff alone', async () => {
+    const made = await setup();
+    const used = await made.use(null, 'member-settings', {}, ash());
+    expect(used.deferReply).not.toHaveBeenCalled();
+    expect(used.reply).toHaveBeenCalledWith(
+      expect.objectContaining({ allowedMentions: { parse: [] }, flags: 64 }),
+    );
+    const text = textOf(used);
+    expect(text.split('\n')).toEqual([
+      `Settings of **Ash of Pallet** (<@${ASH}>):`,
+      '- Pings in posts: **off**',
+      '- Pings for groups and times: **on** (quiet while all pings are off)',
+      '- Pings for shouts: **on** (quiet while all pings are off)',
+      '- Pings when a train moves: **on** (quiet while all pings are off)',
+      '- DM when an egg gets its boss: **off**',
+      '- DM for a new train in this server: **on**',
+      '- Status when they report a raid or make a train: **Coming**',
+      '- Raid reports and trains: **Anonymous**',
+      '- Friend code: **1234 5678 9012**',
+      '- In-game name: **Ash\\_K**',
+      expect.stringMatching(
+        /^- Wants in this server: \*\*7\*\* \(Bulbasaur, Charmander, Squirtle, Pikachu, Eevee, …and 2 more\)/,
+      ),
+      '- Gym targets in this server: **2** (Old Stone Fountain, gym #999 (gone))',
+    ]);
+  });
+
+  it('counts rows it cannot read, and names the account when the member left', async () => {
+    const made = await setup();
+    const text = textOf(
+      await made.use(null, 'member-settings', {}, { ...ash(), resolvedMembers: { member: null } }),
+    );
+    expect(text).toContain(`Settings of **Ash** (<@${ASH}>):`);
+    expect(text).toMatch(/Wants in this server: \*\*7\*\* \(.*\), and 1 row I cannot read/);
+  });
+
+  it('shows the defaults of a member who never set anything', async () => {
+    const made = await setup();
+    const text = textOf(
+      await made.use(
+        null,
+        'member-settings',
+        {},
+        {
+          resolved: {
+            member: { id: '300000000000000002', bot: false, username: 'misty', globalName: null },
+          },
+          resolvedMembers: { member: null },
+        },
+      ),
+    );
+    expect(text).toContain('Settings of **misty**');
+    expect(text).toContain('- Wants in this server: **0**\n- Gym targets in this server: **0**');
+    expect(text).not.toContain('Friend code');
+  });
+
+  it('refuses a bot and a member who is not staff', async () => {
+    const made = await setup();
+    expect(textOf(await made.use(null, 'member-settings', {}, ash({ bot: true })))).toBe(
+      'Bots have no settings.',
+    );
+    expect(
+      textOf(
+        await made.use(null, 'member-settings', {}, { ...ash(), userId: MEMBER, roleNames: [] }),
+      ),
+    ).toBe('Only admins, moderators and bot developers can do that.');
+  });
+});
diff --git a/src/commands/admin/member-settings.ts b/src/commands/admin/member-settings.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d0ecbe2fdcddbd8258c860996d8907d5dfb1dd03
--- /dev/null
+++ b/src/commands/admin/member-settings.ts
@@ -0,0 +1,93 @@
+import { SlashCommandSubcommandBuilder } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf } from '../../discord/guards.js';
+import { answer } from '../../discord/late-reply.js';
+import { count, fitItems, memberText, plain } from '../../render/text.js';
+import { settingsLines } from '../settings/settings.js';
+import { wantLabel } from '../notifications/want-input.js';
+
+/** How many wants and gym targets are named before the rest is counted. */
+const NAMED = 5;
+/** As many characters as the names of one list may take. */
+const NAMES_LIMIT = 400;
+
+/** `5 (A, B, C, …and 2 more)`, with the rows that cannot be read. */
+function listLine(label: string, names: readonly string[], unreadable: number): string {
+  const shownNames =
+    names.length === 0
+      ? ''
+      : ` (${fitItems(
+          names.length > NAMED
+            ? [...names.slice(0, NAMED), `…and ${String(names.length - NAMED)} more`]
+            : names,
+          NAMES_LIMIT,
+        )})`;
+  const broken = unreadable === 0 ? '' : `, and ${count(unreadable, 'row')} I cannot read`;
+  return `${label}: **${String(names.length)}**${shownNames}${broken}`;
+}
+
+/** What Pine knows of a member in a server, on lines, for staff. */
+export async function memberSettingsLines(
+  ctx: AppContext,
+  memberId: string,
+  guildId: string,
+): Promise<string[]> {
+  const [settings, newTrain, wants, targets] = await Promise.all([
+    ctx.users.get(memberId),
+    ctx.newTrains.isOn(memberId, guildId),
+    ctx.wants.list(memberId, guildId),
+    ctx.gymTargets.list(memberId, guildId),
+  ]);
+  const gymNames = targets.gymIds.map((id) => {
+    const gym = ctx.gyms.get(id);
+    return gym ? plain(gym.name) : `gym #${String(id)} (gone)`;
+  });
+  return [
+    ...settingsLines(settings, newTrain, { commands: false }),
+    listLine(
+      'Wants in this server',
+      wants.wants.map((want) => plain(wantLabel(ctx, want.target))),
+      wants.unreadable,
+    ),
+    listLine('Gym targets in this server', gymNames, targets.unreadable),
+  ];
+}
+
+/** `/admin member-settings`. */
+export const memberSettings: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('member-settings')
+    .setDescription('Show what a member has set, for you alone')
+    .addUserOption((option) =>
+      option.setName('member').setDescription('The member').setRequired(true),
+    ),
+  help: {
+    details:
+      'Everything I keep about the member in this server: their settings, friend code and ' +
+      'in-game name, and how many wants and gym targets they have here (the first few by ' +
+      'name). Only you see the answer; the member is not told.',
+    examples: ['/admin member-settings member:@Ash'],
+  },
+  defer: 'late',
+  async execute(interaction, ctx) {
+    const guildId = guildIdOf(interaction);
+    const user = interaction.options.getUser('member', true);
+    if (user.bot) throw new UserError('Bots have no settings.');
+    // The name in this server when the member is in it (a member object of discord.js, or the
+    // raw one of the API with its server nickname), else the name of the account.
+    const member = interaction.options.getMember('member');
+    const inServer =
+      member === null ? null : 'displayName' in member ? member.displayName : (member.nick ?? null);
+    const name = inServer ?? user.globalName ?? user.username;
+    const lines = await memberSettingsLines(ctx, user.id, guildId);
+    await answer(interaction, {
+      content: [
+        `Settings of ${memberText({ id: user.id, name })}:`,
+        ...lines.map((line) => `- ${line}`),
+      ].join('\n'),
+      allowedMentions: { parse: [] },
+    });
+  },
+};
diff --git a/src/commands/admin/nicknames.test.ts b/src/commands/admin/nicknames.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9513e942ae169ecbd9df8c36be0a863b86d095b6
--- /dev/null
+++ b/src/commands/admin/nicknames.test.ts
@@ -0,0 +1,150 @@
+import { describe, expect, it } from 'vitest';
+import {
+  bossCommandsWith,
+  choicesOf,
+  MEMBER,
+  textsOf,
+} from '../../../test/support/boss-commands.js';
+import { admin } from './index.js';
+
+const textOf = (interaction: Parameters<typeof textsOf>[0]) => textsOf(interaction).join('\n');
+
+describe('/admin nickname', () => {
+  it('is a group of /admin with add, remove and list', () => {
+    expect([...admin.subcommands.keys()]).toEqual(
+      expect.arrayContaining(['nickname add', 'nickname remove', 'nickname list']),
+    );
+    const json = admin.data.toJSON();
+    const group = json.options?.find((option) => option.name === 'nickname');
+    expect(group?.description).toBe('The nicknames members can find Pokémon by');
+  });
+
+  it('is for staff only', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use(
+      'nickname',
+      'add',
+      { pokemon: 'dratini', nickname: 'wiggle' },
+      { userId: MEMBER, roleNames: [] },
+    );
+    expect(textOf(used)).toBe('Only admins, moderators and bot developers can do that.');
+    expect(made.search.rows.rows.size).toBe(0);
+  });
+});
+
+describe('/admin nickname add', () => {
+  it('adds a nickname that members find the Pokémon by at once', async () => {
+    const made = await bossCommandsWith({ nicknames: { dratini: ['danger noodle'] } });
+    const used = await made.use('nickname', 'add', {
+      pokemon: 'Dratini',
+      nickname: ' Wiggle  Worm',
+    });
+    expect(textOf(used)).toBe(
+      'Members find Dratini by **wiggle worm** now. Its nicknames: danger noodle, wiggle worm.',
+    );
+    expect(made.search.rows.rows.get('dratini')).toEqual(['danger noodle', 'wiggle worm']);
+    expect(made.ctx.pokemon.exact('wiggle worm')?.key).toBe('dratini');
+    expect(
+      made.logged.filter((e) => e['msg'] === 'a Pokémon nickname was asked for'),
+    ).toMatchObject([{ pokemon: 'dratini', outcome: 'added' }]);
+  });
+
+  it('refuses a nickname of another Pokémon, naming it, and one that is no nickname', async () => {
+    const made = await bossCommandsWith();
+    expect(
+      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'ttar' })),
+    ).toBe(
+      '**ttar** already finds Tyranitar. A nickname must name one Pokémon only: pick another.',
+    );
+    expect(textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'a,b' }))).toBe(
+      'A nickname has letters, digits, spaces and hyphens only.',
+    );
+    expect(
+      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'Shadow Noodle' })),
+    ).toBe(
+      'A nickname cannot be or have a word that the Pokémon options read as something else: a ' +
+        'tier, `shadow`, `mega`, an egg, an IV target, `none`.',
+    );
+    expect(textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: '147' }))).toBe(
+      'A nickname needs a letter: digits alone are read as a Pokédex number.',
+    );
+    expect(
+      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'noodle' })),
+    ).toBe('**noodle** finds Dratini already.');
+    expect(made.search.rows.rows.size).toBe(0);
+  });
+
+  it('says how long the stored list of nicknames may be when it is full', async () => {
+    const made = await bossCommandsWith({ nicknames: { dratini: ['x'.repeat(250)] } });
+    expect(
+      textOf(await made.use('nickname', 'add', { pokemon: 'dratini', nickname: 'wiggle' })),
+    ).toBe(
+      'Dratini has as many nicknames as the stored list holds (255 characters with their ' +
+        'commas), so **wiggle** does not fit. Remove one first with `/admin nickname remove`.',
+    );
+  });
+
+  it('refuses text that names no Pokémon outright', async () => {
+    const made = await bossCommandsWith();
+    const used = await made.use('nickname', 'add', { pokemon: 'dratni', nickname: 'wiggle' });
+    expect(textOf(used)).toMatch(/^"dratni" is not the name of one Pokémon\. Did you mean Dratini/);
+  });
+});
+
+describe('/admin nickname remove', () => {
+  it('offers the nicknames of the Pokémon picked, and removes one', async () => {
+    const made = await bossCommandsWith({
+      nicknames: { dratini: ['danger noodle', 'wiggle'], magikarp: ['splashy'] },
+    });
+    const offered = await made.typing('nickname', 'remove', 'nickname', 'w', {
+      pokemon: 'dratini',
+    });
+    expect(choicesOf(offered)).toEqual([{ name: 'wiggle', value: 'wiggle' }]);
+    const pokemon = await made.typing('nickname', 'remove', 'pokemon', '');
+    expect(choicesOf(pokemon)).toEqual([
+      { name: 'Dratini', value: 'dratini' },
+      { name: 'Magikarp', value: 'magikarp' },
+    ]);
+    const used = await made.use('nickname', 'remove', { pokemon: 'dratini', nickname: 'Wiggle' });
+    expect(textOf(used)).toBe(
+      "Members no longer find Dratini by **wiggle**. Dratini: danger noodle (and the bot's own: noodle)",
+    );
+    expect(made.ctx.pokemon.exact('wiggle')).toBeUndefined();
+  });
+
+  it("refuses a nickname the Pokémon does not have, and the bot's own", async () => {
+    const made = await bossCommandsWith({ nicknames: { dratini: ['danger noodle'] } });
+    expect(
+      textOf(await made.use('nickname', 'remove', { pokemon: 'dratini', nickname: 'splashy' })),
+    ).toBe(
+      "Dratini has no nickname **splashy**. Dratini: danger noodle (and the bot's own: noodle)",
+    );
+    expect(
+      textOf(await made.use('nickname', 'remove', { pokemon: 'dratini', nickname: 'Noodle' })),
+    ).toBe(
+      "**noodle** is one of the bot's own nicknames of Dratini, and the bot's own (see " +
+        '`/admin nickname list`) cannot be removed.',
+    );
+  });
+});
+
+describe('/admin nickname list', () => {
+  it('lists every Pokémon with nicknames staff added, or every nickname of one', async () => {
+    const made = await bossCommandsWith({
+      nicknames: { magikarp: ['splashy'], dratini: ['danger noodle', 'wiggle'], ex: ['x'] },
+    });
+    expect(textOf(await made.use('nickname', 'list'))).toBe(
+      '**Nicknames staff added** (2 Pokémon)\n- Dratini: danger noodle, wiggle\n- Magikarp: splashy',
+    );
+    expect(textOf(await made.use('nickname', 'list', { pokemon: 'tyranitar' }))).toBe(
+      "Tyranitar: none added (and the bot's own: ttar)",
+    );
+  });
+
+  it('says when staff added none', async () => {
+    const made = await bossCommandsWith();
+    expect(textOf(await made.use('nickname', 'list'))).toBe(
+      'Staff have added no nicknames. `/admin nickname add` adds one.',
+    );
+  });
+});
diff --git a/src/commands/admin/nicknames.ts b/src/commands/admin/nicknames.ts
new file mode 100644
index 0000000000000000000000000000000000000000..50ca279f3a04deb0b6322096e5c453d72f7eab0f
--- /dev/null
+++ b/src/commands/admin/nicknames.ts
@@ -0,0 +1,290 @@
+import {
+  MessageFlags,
+  SlashCommandSubcommandBuilder,
+  type AutocompleteInteraction,
+  type SlashCommandStringOption,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import {
+  NICKNAME_MAX,
+  NICKNAME_MIN,
+  tidyNickname,
+  type NicknameProblem,
+} from '../../domain/pogo/nickname-rules.js';
+import { searchTokens } from '../../domain/search/text.js';
+import { count, fitItems, fitMessages, plain, truncate } from '../../render/text.js';
+import type { NicknameAdded } from '../../services/pokemon-search-service.js';
+import { byName, CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../choices.js';
+import { chosenPokemon } from './boss-input.js';
+
+/** The subcommand group of `/admin` the nicknames live under. */
+export const NICKNAME_GROUP = 'nickname';
+export const NICKNAME_DESCRIPTION = 'The nicknames members can find Pokémon by';
+
+const PROBLEMS: Readonly<Record<NicknameProblem, string>> = {
+  length: `A nickname has ${String(NICKNAME_MIN)} to ${String(NICKNAME_MAX)} characters.`,
+  characters: 'A nickname has letters, digits, spaces and hyphens only.',
+  'no-letter': 'A nickname needs a letter: digits alone are read as a Pokédex number.',
+  reserved:
+    'A nickname cannot be or have a word that the Pokémon options read as something else: a ' +
+    'tier, `shadow`, `mega`, an egg, an IV target, `none`.',
+};
+
+/** The characters the legacy column holds for all nicknames of one Pokémon. */
+const MAX_STORED = 255;
+
+/** A nickname in a sentence. */
+const shown = (nickname: string): string => `**${plain(nickname)}**`;
+
+/** The Pokémon the `pokemon` option names; one the game data does not know has no nicknames. */
+function chosenEntry(ctx: AppContext, value: string): PokemonEntry {
+  const { entry, label } = chosenPokemon(ctx, value);
+  if (!entry) throw new UserError(`${label} is not in the game data, so it has no nicknames yet.`);
+  return entry;
+}
+
+/** The nicknames of a Pokémon, staff's and the bot's own, on one line. */
+function nicknamesLine(ctx: AppContext, entry: PokemonEntry): string {
+  const stored = ctx.nicknames.stored().get(entry.key) ?? [];
+  const curated = ctx.nicknames.curated(entry.key);
+  const own =
+    stored.length === 0 ? 'none added' : stored.map((nickname) => plain(nickname)).join(', ');
+  const builtIn =
+    curated.length === 0
+      ? ''
+      : ` (and the bot's own: ${curated.map((one) => plain(one)).join(', ')})`;
+  return `${plain(entry.name)}: ${own}${builtIn}`;
+}
+
+/**
+ * The choices of the `pokemon` option: with nothing typed, the Pokémon that have nicknames staff
+ * added; with text, what the search finds (a guess only where its name shows the guessed word).
+ */
+function nicknamePokemonChoices(ctx: AppContext, typed: string): Choice[] {
+  const catalogue = ctx.gameData.catalogue;
+  let choices: Choice[];
+  if (searchTokens(typed).length === 0) {
+    choices = [...ctx.nicknames.stored().keys()]
+      .flatMap((key) => {
+        const entry = catalogue.byKey(key);
+        return entry ? [{ name: entry.name, value: entry.key }] : [];
+      })
+      .sort((a, b) => byName(a.name, b.name));
+  } else {
+    choices = ctx.pokemon
+      .find(typed, { limit: MAX_CHOICES })
+      .filter((hit) => hit.match !== 'guess' || showsGuessed(hit.entry.name, hit.guessed))
+      .map((hit) => ({ name: hit.entry.name, value: hit.entry.key }));
+  }
+  return choices
+    .slice(0, MAX_CHOICES)
+    .map((choice) => ({ ...choice, name: truncate(choice.name, CHOICE_NAME) }));
+}
+
+async function respondWithPokemon(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+): Promise<void> {
+  const focused = interaction.options.getFocused(true);
+  if (focused.name === 'pokemon') {
+    await interaction.respond(nicknamePokemonChoices(ctx, String(focused.value)));
+    return;
+  }
+  if (focused.name !== 'nickname') {
+    await interaction.respond([]);
+    return;
+  }
+  // The stored nicknames of the Pokémon picked so far; none while it names no Pokémon.
+  const picked = interaction.options.getString('pokemon') ?? '';
+  const entry = ctx.gameData.catalogue.byKey(picked.trim()) ?? ctx.pokemon.exact(picked);
+  const typed = String(focused.value).trim().toLowerCase();
+  const stored = entry ? (ctx.nicknames.stored().get(entry.key) ?? []) : [];
+  await interaction.respond(
+    stored
+      .filter((nickname) => nickname.includes(typed))
+      .slice(0, MAX_CHOICES)
+      .map((nickname) => ({ name: truncate(nickname, CHOICE_NAME), value: nickname })),
+  );
+}
+
+/** The `pokemon` option: free text with the list of `nicknamePokemonChoices`. */
+const pokemonOption =
+  (description: string) =>
+  (option: SlashCommandStringOption): SlashCommandStringOption =>
+    option
+      .setName('pokemon')
+      .setDescription(description)
+      .setRequired(true)
+      .setMaxLength(100)
+      .setAutocomplete(true);
+
+/** What `add` says of what came of it. */
+export function addedText(entry: PokemonEntry, added: NicknameAdded): string {
+  const name = plain(entry.name);
+  switch (added.kind) {
+    case 'added':
+      return (
+        `Members find ${name} by ${shown(added.nickname)} now. Its nicknames: ` +
+        `${added.nicknames.map((one) => plain(one)).join(', ')}.`
+      );
+    case 'refused':
+      return PROBLEMS[added.problem];
+    case 'taken':
+      return `${shown(added.nickname)} already finds ${fitItems(
+        added.by.map((one) => plain(one.name)),
+        300,
+      )}. A nickname must name one Pokémon only: pick another.`;
+    case 'already':
+      return `${shown(added.nickname)} finds ${name} already.`;
+    case 'full':
+      return (
+        `${name} has as many nicknames as the stored list holds (${String(MAX_STORED)} ` +
+        `characters with their commas), so ${shown(added.nickname)} ` +
+        'does not fit. Remove one first with `/admin nickname remove`.'
+      );
+  }
+}
+
+/** `/admin nickname add`. */
+export const addNickname: SubcommandPart = {
+  group: NICKNAME_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('add')
+    .setDescription('Let members find a Pokémon by another name')
+    .addStringOption(pokemonOption('The Pokémon'))
+    .addStringOption((option) =>
+      option
+        .setName('nickname')
+        .setDescription('The nickname')
+        .setRequired(true)
+        .setMinLength(NICKNAME_MIN)
+        .setMaxLength(NICKNAME_MAX),
+    ),
+  help: {
+    details:
+      'The nickname works wherever members type a Pokémon (`/raid`, `/want`, `/wild`, …) from ' +
+      `then on. It has ${String(NICKNAME_MIN)} to ${String(NICKNAME_MAX)} letters, digits, ` +
+      'spaces or hyphens, and must not be the name or a nickname of another Pokémon.',
+    examples: ['/admin nickname add pokemon:Dratini nickname:danger noodle'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const entry = chosenEntry(ctx, interaction.options.getString('pokemon', true));
+    const added = await ctx.nicknames.add(entry, interaction.options.getString('nickname', true));
+    ctx.log.info(
+      { by: interaction.user.id, pokemon: entry.key, outcome: added.kind },
+      'a Pokémon nickname was asked for',
+    );
+    if (added.kind !== 'added') throw new UserError(addedText(entry, added));
+    await interaction.editReply({ content: addedText(entry, added) });
+  },
+  autocomplete: respondWithPokemon,
+};
+
+/** `/admin nickname remove`. */
+export const removeNickname: SubcommandPart = {
+  group: NICKNAME_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('remove')
+    .setDescription('Take back a nickname staff added for a Pokémon')
+    .addStringOption(pokemonOption('The Pokémon'))
+    .addStringOption((option) =>
+      option
+        .setName('nickname')
+        .setDescription('The nickname')
+        .setRequired(true)
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    ),
+  help: {
+    details:
+      "Only nicknames staff added can be removed; the bot's own are part of it. The list " +
+      'offers the nicknames of the Pokémon picked first.',
+    examples: ['/admin nickname remove pokemon:Dratini nickname:danger noodle'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const entry = chosenEntry(ctx, interaction.options.getString('pokemon', true));
+    // As it is stored and compared: what was typed, tidied.
+    const nickname = tidyNickname(interaction.options.getString('nickname', true));
+    const removed = await ctx.nicknames.remove(entry, nickname);
+    if (!removed) {
+      const builtIn = ctx.nicknames.curated(entry.key).includes(nickname);
+      throw new UserError(
+        builtIn
+          ? `${shown(nickname)} is one of the bot's own nicknames of ${plain(entry.name)}, and ` +
+              "the bot's own (see `/admin nickname list`) cannot be removed."
+          : `${plain(entry.name)} has no nickname ${shown(nickname)}. ${nicknamesLine(ctx, entry)}`,
+      );
+    }
+    ctx.log.info({ by: interaction.user.id, pokemon: entry.key }, 'a Pokémon nickname was removed');
+    await interaction.editReply({
+      content: `Members no longer find ${plain(entry.name)} by ${shown(nickname)}. ${nicknamesLine(ctx, entry)}`,
+    });
+  },
+  autocomplete: respondWithPokemon,
+};
+
+/** `/admin nickname list`. */
+export const listNicknames: SubcommandPart = {
+  group: NICKNAME_GROUP,
+  data: new SlashCommandSubcommandBuilder()
+    .setName('list')
+    .setDescription('Show the nicknames staff added, or every nickname of one Pokémon')
+    .addStringOption((option) =>
+      option
+        .setName('pokemon')
+        .setDescription("Only this Pokémon, with the bot's own nicknames too")
+        .setMaxLength(100)
+        .setAutocomplete(true),
+    ),
+  help: {
+    details:
+      'Without a Pokémon: every Pokémon with nicknames staff added. With one: its nicknames, ' +
+      "staff's and the bot's own.",
+    examples: ['/admin nickname list', '/admin nickname list pokemon:Dratini'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const value = interaction.options.getString('pokemon');
+    if (value !== null) {
+      const entry = chosenEntry(ctx, value);
+      await interaction.editReply({ content: nicknamesLine(ctx, entry) });
+      return;
+    }
+    const catalogue = ctx.gameData.catalogue;
+    const lines = [...ctx.nicknames.stored()]
+      .flatMap(([key, nicknames]) => {
+        const entry = catalogue.byKey(key);
+        return entry && nicknames.length > 0
+          ? [
+              {
+                name: entry.name,
+                text: `- ${plain(entry.name)}: ${nicknames.map((one) => plain(one)).join(', ')}`,
+              },
+            ]
+          : [];
+      })
+      .sort((a, b) => byName(a.name, b.name))
+      .map((line) => line.text);
+    const [first = '', ...rest] = fitMessages(
+      lines.length === 0
+        ? ['Staff have added no nicknames. `/admin nickname add` adds one.']
+        : [`**Nicknames staff added** (${count(lines.length, 'Pokémon', 'Pokémon')})`, ...lines],
+    );
+    await interaction.editReply({ content: first });
+    for (const more of rest) {
+      await interaction.followUp({ content: more, flags: MessageFlags.Ephemeral });
+    }
+  },
+  autocomplete: respondWithPokemon,
+};
+
+export const nicknameParts: readonly SubcommandPart[] = [
+  addNickname,
+  removeNickname,
+  listNicknames,
+];
diff --git a/src/commands/settings/settings.ts b/src/commands/settings/settings.ts
index 24ad1e8b1a1ff8748f13aaf9f048f527da01c2ad..4af63a79c52b5810ae57026c3dcc434c1922e99b 100644
--- a/src/commands/settings/settings.ts
+++ b/src/commands/settings/settings.ts
@@ -176,35 +176,42 @@ function autoStatusName(status: PartyStatus): string {
 /**
  * Everything a member has set, each line with the command that changes it. `newTrain` is
  * whether they are told of new trains in the server the command was used in; undefined in a
- * DM, where the line says that it is set per server.
+ * DM, where the line says that it is set per server. With `commands: false` the lines leave the
+ * commands out, for staff who look at another member's settings (`/admin member-settings`).
  */
-export function settingsLines(settings: UserSettings, newTrain?: boolean): string[] {
+export function settingsLines(
+  settings: UserSettings,
+  newTrain?: boolean,
+  options: { commands?: boolean } = {},
+): string[] {
+  const commands = options.commands ?? true;
+  const via = (command: string): string => (commands ? ` · \`${command}\`` : '');
   const onOff = (value: boolean): string => (value ? 'on' : 'off');
   const lines = FLAGS.map((setting) => {
     const quiet = setting.underMentions && settings[setting.flag] && !settings.mentions;
     return (
       `${setting.label}: **${onOff(settings[setting.flag])}**` +
-      `${quiet ? ' (quiet while all pings are off)' : ''} · \`/settings ${setting.name}\``
+      `${quiet ? ' (quiet while all pings are off)' : ''}${via(`/settings ${setting.name}`)}`
     );
   });
   lines.push(
     newTrain === undefined
-      ? `DM for a new train: set per server · \`/settings ${NEW_TRAIN.name}\` in a server`
-      : `${NEW_TRAIN.label}: **${onOff(newTrain)}** · \`/settings ${NEW_TRAIN.name}\``,
-    `Status when you report a raid or make a train: **${autoStatusName(settings.autoStatus)}** · \`/settings auto-status\``,
-    `Raid reports and trains: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}** · \`/settings privacy\``,
+      ? `DM for a new train: set per server${via(`/settings ${NEW_TRAIN.name}`)}${commands ? ' in a server' : ''}`
+      : `${NEW_TRAIN.label}: **${onOff(newTrain)}**${via(`/settings ${NEW_TRAIN.name}`)}`,
+    `Status when ${commands ? 'you report' : 'they report'} a raid or make a train: **${autoStatusName(settings.autoStatus)}**${via('/settings auto-status')}`,
+    `Raid reports and trains: **${settings.raidPrivacy === RaidPrivacy.Anonymous ? 'Anonymous' : 'Visible'}**${via('/settings privacy')}`,
   );
   // What a member registered is their own text: shown plain, and only when there is any.
   const friendCode = settings.friendCode?.trim() ?? '';
   if (friendCode !== '') {
     lines.push(
-      `Friend code: **${plain(truncate(friendCode, SHOWN_VALUE))}** · \`/friend-code register\``,
+      `Friend code: **${plain(truncate(friendCode, SHOWN_VALUE))}**${via('/friend-code register')}`,
     );
   }
   const nickname = settings.nickname?.trim() ?? '';
   if (nickname !== '') {
     lines.push(
-      `In-game name: **${plain(truncate(nickname, SHOWN_VALUE))}** · \`/nickname register\``,
+      `In-game name: **${plain(truncate(nickname, SHOWN_VALUE))}**${via('/nickname register')}`,
     );
   }
   return lines;
````

---

### Task 6: The export of the legacy role authorization for the cutover

Prototype commit: `669cb6277610f55ea04db34e462c565a0d018f9c`

npm run role-auth:export reads CommandRoleAuthorization, CommandRoles and
Guild of the configured database (RoleAuthorizationRepository, read only)
and prints per server every legacy command that requires a role or has
roles listed, with the role ids, the slash command of the new bot it became
(a mapping of every legacy command name: a command, not built yet, or
dropped), and the warnings: required with no role (staff only), roles
without required (no effect), a name the mapping does not know. Plain text,
or --json. It never contacts Discord, and says that roles are given by id.


**Files:**

```
 package.json                                                 |   1 +
 scripts/role-auth/export.ts                                  |  32 ++++++++++++++++
 scripts/role-auth/report.test.ts                             | 272 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 scripts/role-auth/report.ts                                  | 270 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/role-authorization-repository.db.test.ts |  99 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/role-authorization-repository.ts         |  76 +++++++++++++++++++++++++++++++++++++
 6 files changed, 750 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run <the test files of this diff>`); all pass.
- [ ] **Step 3: Format check:** `npx prettier --check <the files of this diff>`.
- [ ] **Step 4: Commit** with the title `The export of the legacy role authorization for the cutover`, the body above and the trailer, staging
  exactly the files of this diff.

````diff
diff --git a/package.json b/package.json
index bcc3cd1665cac2c2458b5c9798a65ca611fda000..229a5b018102660b3b3c9294130f406b80ea997f 100644
--- a/package.json
+++ b/package.json
@@ -16,6 +16,7 @@
     "db:legacy-fixture": "tsx scripts/legacy-schema/generate.ts",
     "fixtures:game-data": "tsx scripts/game-data/make-fixtures.ts",
     "raid-bosses:check": "tsx scripts/raid-bosses/check-feed.ts",
+    "role-auth:export": "tsx --env-file-if-exists=.env scripts/role-auth/export.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
     "typecheck": "tsc --noEmit",
diff --git a/scripts/role-auth/export.ts b/scripts/role-auth/export.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2e0e9236050e8126303ef925ca80685b82fdbe7f
--- /dev/null
+++ b/scripts/role-auth/export.ts
@@ -0,0 +1,32 @@
+/**
+ * Prints the legacy role authorization of the configured database (`DB_*` in `.env`) for the
+ * cutover: per server, every legacy command that requires a role or has roles listed, the
+ * slash command of the new bot it became, and what is odd about it. Run it with
+ * `npm run role-auth:export` (plain text) or `npm run role-auth:export -- --json`.
+ *
+ * It only reads (`CommandRoleAuthorization`, `CommandRoles`, `Guild`) and never contacts
+ * Discord, so roles are given by their ids.
+ */
+import { loadEnv } from '../../src/config/env.js';
+import { dbConfigFrom } from '../../src/db/db-config.js';
+import { createDb } from '../../src/db/kysely.js';
+import { RoleAuthorizationRepository } from '../../src/db/repositories/role-authorization-repository.js';
+import type { DB } from '../../src/db/types.js';
+import { exportJson, exportText, roleAuthExport } from './report.js';
+
+const args = process.argv.slice(2);
+const unknown = args.filter((arg) => arg !== '--json');
+if (unknown.length > 0) {
+  process.stderr.write(
+    `Unknown arguments: ${unknown.join(' ')}\nUsage: role-auth:export [--json]\n`,
+  );
+  process.exit(2);
+}
+
+const db = createDb<DB>(dbConfigFrom(loadEnv(process.env)));
+try {
+  const servers = roleAuthExport(await new RoleAuthorizationRepository(db).list());
+  process.stdout.write(args.includes('--json') ? exportJson(servers) : exportText(servers));
+} finally {
+  await db.destroy();
+}
diff --git a/scripts/role-auth/report.test.ts b/scripts/role-auth/report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5e375e27f21fdaece36cc7e4442fa9e8bdc8150d
--- /dev/null
+++ b/scripts/role-auth/report.test.ts
@@ -0,0 +1,272 @@
+import { describe, expect, it } from 'vitest';
+import { commands } from '../../src/commands/index.js';
+import { exportJson, exportText, LEGACY_COMMANDS, newCommandOf, roleAuthExport } from './report.js';
+
+const HOME = '412345678901234567';
+const AWAY = '412345678901234568';
+
+/**
+ * The `name` of every command under the legacy `commands/` (107 files, read on 2026-10-14), and
+ * the built-in commands of discord.js-commando that `index.js` registered.
+ */
+const LEGACY_NAMES = [
+  'aar',
+  'add-pokemon-nickname',
+  'add-role',
+  'asar',
+  'auto',
+  'auto-set',
+  'boss',
+  'boss-set-notification',
+  'boss-tier',
+  'bounds',
+  'cancel-meet',
+  'clear-image-cache',
+  'conductor',
+  'counters',
+  'create-gym',
+  'delete',
+  'delete-gym',
+  'done',
+  'duration',
+  'edit-gym',
+  'export-tsvs',
+  'find',
+  'find-gym',
+  'find-nickname',
+  'friend-code',
+  'geocode',
+  'group',
+  'gym',
+  'gym-detail',
+  'gym-places',
+  'gym-queue',
+  'hatch',
+  'help',
+  'here',
+  'howmany',
+  'iam',
+  'iamnot',
+  'import',
+  'import-gyms',
+  'info',
+  'join',
+  'label',
+  'leave',
+  'left',
+  'local',
+  'lsar',
+  'maps',
+  'mark-not-shiny',
+  'mark-shiny',
+  'maybe',
+  'meet',
+  'meetup',
+  'mentions',
+  'mentions-groups',
+  'mentions-shouts',
+  'mentions-train-stops',
+  'moveset',
+  'name',
+  'new',
+  'new-train-notification',
+  'next',
+  'not-conductor',
+  'not-here',
+  'populate-raid-bosses',
+  'previous',
+  'privacy',
+  'raid',
+  'raid-boss',
+  'raid-bosses',
+  'rank',
+  'rare',
+  'register-friend-code',
+  'register-nickname',
+  'register-silph',
+  'remote',
+  'remove-role',
+  'request',
+  'require-role',
+  'route',
+  'route-add',
+  'route-clear',
+  'route-edit',
+  'route-remove',
+  'rsar',
+  'save-party',
+  'save-route',
+  'setbounds',
+  'shout',
+  'show-role-authorization',
+  'show-role-authorizations',
+  'silph-card',
+  'skip',
+  'spawn',
+  'status',
+  'target',
+  'targets',
+  'train',
+  'train-finished',
+  'untarget',
+  'untarget-all',
+  'unwant',
+  'unwant-all',
+  'use-route',
+  'view-member-settings',
+  'want',
+  'wants',
+  'where',
+];
+const COMMANDO_NAMES = [
+  'groups',
+  'enable',
+  'disable',
+  'load',
+  'unload',
+  'reload',
+  'ping',
+  'unknown-command',
+];
+
+describe('the mapping of legacy commands', () => {
+  it('maps every command the legacy bot had, and nothing else', () => {
+    expect(LEGACY_NAMES).toHaveLength(107);
+    for (const name of [...LEGACY_NAMES, ...COMMANDO_NAMES]) {
+      expect(newCommandOf(name), name).toBeDefined();
+    }
+    expect(Object.keys(LEGACY_COMMANDS).sort()).toEqual(
+      [...LEGACY_NAMES, ...COMMANDO_NAMES].sort(),
+    );
+  });
+
+  it('maps the route commands to /route and the framework ones as dropped', () => {
+    for (const name of ['route-add', 'route-clear', 'route-edit', 'route-remove']) {
+      expect(newCommandOf(name)).toEqual({ kind: 'slash', commands: ['/route'] });
+    }
+    expect(newCommandOf('ping')).toMatchObject({ kind: 'dropped' });
+    expect(newCommandOf('wild')).toBeUndefined();
+  });
+
+  const built = new Set(commands.map((command) => `/${command.data.name}`));
+
+  it('names only commands the new bot has for what it became', () => {
+    for (const [legacy, becomes] of Object.entries(LEGACY_COMMANDS)) {
+      if (becomes.kind !== 'slash') continue;
+      for (const command of becomes.commands) {
+        expect(built.has(command), `${legacy} -> ${command}`).toBe(true);
+      }
+    }
+  });
+
+  it('names commands that are not built yet as later', () => {
+    for (const [legacy, becomes] of Object.entries(LEGACY_COMMANDS)) {
+      if (becomes.kind !== 'later') continue;
+      for (const command of becomes.commands) {
+        expect(built.has(command), `${legacy} -> ${command} is built now`).toBe(false);
+      }
+    }
+  });
+
+  it('knows the legacy names of the spec, without regard to case', () => {
+    expect(newCommandOf('meetup')).toEqual({ kind: 'slash', commands: ['/meetup'] });
+    expect(newCommandOf(' Left ')).toEqual({ kind: 'slash', commands: ['/end'] });
+    expect(newCommandOf('gym')).toEqual({ kind: 'slash', commands: ['/location'] });
+    expect(newCommandOf('spawn')).toEqual({ kind: 'slash', commands: ['/wild'] });
+    expect(newCommandOf('require-role')).toMatchObject({ kind: 'dropped' });
+    expect(newCommandOf('rank')).toEqual({ kind: 'later', commands: ['/rank'] });
+    expect(newCommandOf('toString')).toBeUndefined();
+    expect(newCommandOf('nonsense')).toBeUndefined();
+  });
+});
+
+describe('roleAuthExport', () => {
+  it('keeps what is required or has roles, by server, with its warnings', () => {
+    const servers = roleAuthExport([
+      { guild: HOME, command: 'meetup', roleRequired: true, roleIds: ['501', '502'] },
+      { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
+      { guild: HOME, command: 'raid', roleRequired: false, roleIds: ['503'] },
+      { guild: HOME, command: 'shout', roleRequired: false, roleIds: [] },
+      { guild: HOME, command: 'shout2', roleRequired: null, roleIds: [] },
+      { guild: AWAY, command: 'oddity', roleRequired: true, roleIds: ['504'] },
+    ]);
+    expect(servers).toEqual([
+      {
+        guild: HOME,
+        commands: [
+          {
+            command: 'meetup',
+            required: true,
+            roleIds: ['501', '502'],
+            becomes: { kind: 'slash', commands: ['/meetup'] },
+            warnings: [],
+          },
+          {
+            command: 'train',
+            required: true,
+            roleIds: [],
+            becomes: { kind: 'slash', commands: ['/train'] },
+            warnings: ['staff-only'],
+          },
+          {
+            command: 'raid',
+            required: false,
+            roleIds: ['503'],
+            becomes: { kind: 'slash', commands: ['/raid'] },
+            warnings: ['no-effect'],
+          },
+        ],
+      },
+      {
+        guild: AWAY,
+        commands: [
+          {
+            command: 'oddity',
+            required: true,
+            roleIds: ['504'],
+            becomes: undefined,
+            warnings: ['unknown-command'],
+          },
+        ],
+      },
+    ]);
+  });
+});
+
+describe('exportText and exportJson', () => {
+  const servers = roleAuthExport([
+    { guild: HOME, command: 'meetup', roleRequired: true, roleIds: ['501', '502'] },
+    { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
+    { guild: HOME, command: 'rare', roleRequired: false, roleIds: ['503'] },
+    { guild: AWAY, command: 'rank', roleRequired: true, roleIds: ['504'] },
+  ]);
+
+  it('prints a block per server, says that role names are not looked up', () => {
+    const text = exportText(servers);
+    expect(text).toContain('this export does not ask Discord for their names');
+    expect(text).toContain(
+      `Server ${HOME}\n` +
+        '  meetup: required, roles 501, 502 -> /meetup\n' +
+        '  train: required, no roles -> /train\n' +
+        '    warning: required with no role listed: only staff could use it\n' +
+        '  rare: not required, roles 503 -> dropped: /want and /wild take any Pokémon\n' +
+        '    warning: roles are listed but none is required: they had no effect\n',
+    );
+    expect(text).toContain(
+      `Server ${AWAY}\n  rank: required, roles 504 -> /rank (not built yet)\n`,
+    );
+    expect(text.endsWith('\n')).toBe(true);
+  });
+
+  it('says when there is nothing to export', () => {
+    expect(exportText([])).toContain(
+      'No server requires a role for any command, and no command has roles listed.',
+    );
+  });
+
+  it('gives the same as JSON', () => {
+    const json = JSON.parse(exportJson(servers)) as { note: string; servers: unknown[] };
+    expect(json.note).toContain('does not ask Discord');
+    expect(json.servers).toEqual(JSON.parse(JSON.stringify(servers)));
+  });
+});
diff --git a/scripts/role-auth/report.ts b/scripts/role-auth/report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e05ab0ca8462a31b777e100b9b78ac4c37bba883
--- /dev/null
+++ b/scripts/role-auth/report.ts
@@ -0,0 +1,270 @@
+/**
+ * The export of the legacy role authorization (`npm run role-auth:export`): which legacy
+ * command needed which roles in which server, and the slash command of the new bot each one
+ * became, so that staff can set the same up as Discord's own command permissions (Server
+ * Settings, Integrations, Professor Pine) at the cutover (spec 9.1). Pure: the database is read
+ * by `RoleAuthorizationRepository`, and Discord is never asked.
+ */
+import type { LegacyCommandRoles } from '../../src/db/repositories/role-authorization-repository.js';
+
+/**
+ * What a legacy command became:
+ * - `slash`: these commands of the new bot (top-level names: Discord sets permissions per
+ *   command, not per subcommand);
+ * - `later`: planned for a later phase of the rewrite, not built yet;
+ * - `dropped`: the new bot has nothing that does it.
+ */
+export type NewCommand =
+  | { kind: 'slash'; commands: readonly string[]; note?: string }
+  | { kind: 'later'; commands: readonly string[] }
+  | { kind: 'dropped'; note: string };
+
+const slash = (...commands: string[]): NewCommand => ({ kind: 'slash', commands });
+const later = (...commands: string[]): NewCommand => ({ kind: 'later', commands });
+const dropped = (note: string): NewCommand => ({ kind: 'dropped', note });
+
+const ROLE_AUTH_GONE = "role authorization is replaced by Discord's command permissions";
+const COMMANDO = 'a built-in command of the old command framework';
+
+/**
+ * Every command name of the legacy bot (the `name` of each command under `commands/`, read
+ * from the legacy code on 2026-10-14, and the built-in commands of discord.js-commando it
+ * registered), and what it became; from the command mapping of the spec (4.2), as the commands
+ * were built. The legacy bot keyed role authorization by the name, never by an alias, so no
+ * alias is listed (`wild` is an alias of `spawn`, `import-regions` of `import`).
+ */
+export const LEGACY_COMMANDS: Readonly<Record<string, NewCommand>> = {
+  // In a party.
+  join: slash('/join'),
+  maybe: slash('/maybe'),
+  here: slash('/here'),
+  'not-here': slash('/not-here'),
+  leave: slash('/leave'),
+  done: slash('/done'),
+  local: slash('/local'),
+  remote: slash('/remote'),
+  meet: slash('/meet'),
+  'cancel-meet': slash('/cancel-meet'),
+  group: slash('/group'),
+  new: slash('/group'),
+  label: slash('/group'),
+  status: slash('/status'),
+  where: slash('/where'),
+  shout: slash('/shout'),
+  delete: slash('/delete'),
+  // Raids.
+  raid: slash('/raid'),
+  hatch: slash('/hatch'),
+  left: slash('/end'),
+  duration: slash('/duration'),
+  boss: slash('/boss'),
+  gym: slash('/location'),
+  moveset: slash('/moveset'),
+  // Trains and meetups.
+  train: slash('/train'),
+  name: slash('/name'),
+  route: slash('/route'),
+  'route-add': slash('/route'),
+  'route-clear': slash('/route'),
+  'route-edit': slash('/route'),
+  'route-remove': slash('/route'),
+  'save-route': slash('/route'),
+  'use-route': slash('/route'),
+  conductor: slash('/conductor'),
+  'not-conductor': slash('/conductor'),
+  next: slash('/next'),
+  previous: slash('/previous'),
+  skip: slash('/skip'),
+  'train-finished': slash('/finish'),
+  meetup: slash('/meetup'),
+  info: slash('/info'),
+  // Members.
+  auto: slash('/settings'),
+  privacy: slash('/settings'),
+  mentions: slash('/settings'),
+  'mentions-groups': slash('/settings'),
+  'mentions-shouts': slash('/settings'),
+  'mentions-train-stops': slash('/settings'),
+  'boss-set-notification': slash('/settings'),
+  'new-train-notification': slash('/settings'),
+  want: slash('/want'),
+  unwant: slash('/unwant'),
+  wants: slash('/wants'),
+  'unwant-all': slash('/unwant-all'),
+  target: slash('/target'),
+  untarget: slash('/untarget'),
+  targets: slash('/targets'),
+  'untarget-all': slash('/untarget-all'),
+  'register-friend-code': slash('/friend-code'),
+  'friend-code': slash('/friend-code'),
+  'register-nickname': slash('/nickname'),
+  'find-nickname': slash('/nickname'),
+  spawn: slash('/wild'),
+  iam: slash('/iam'),
+  iamnot: slash('/iamnot'),
+  help: slash('/help'),
+  bounds: slash('/bounds'),
+  // Utilities (Phase 6).
+  request: later('/request'),
+  rank: later('/rank'),
+  counters: later('/counters'),
+  'boss-tier': later('/boss-tier'),
+  find: later('/find-region'),
+  maps: later('/maps'),
+  // Staff.
+  asar: slash('/admin'),
+  rsar: slash('/admin'),
+  lsar: slash('/admin'),
+  aar: dropped('the role every new member is given is not built'),
+  'raid-boss': slash('/admin'),
+  'raid-bosses': slash('/admin'),
+  'auto-set': slash('/admin'),
+  'mark-shiny': slash('/admin'),
+  'mark-not-shiny': slash('/admin'),
+  'add-pokemon-nickname': slash('/admin'),
+  'populate-raid-bosses': dropped('the boss list comes from the feed'),
+  rare: dropped('/want and /wild take any Pokémon'),
+  'view-member-settings': slash('/admin'),
+  'save-party': slash('/admin'),
+  'clear-image-cache': slash('/admin'),
+  'create-gym': slash('/gym'),
+  'edit-gym': slash('/gym'),
+  'delete-gym': slash('/gym'),
+  'find-gym': slash('/gym'),
+  'gym-detail': slash('/gym'),
+  geocode: slash('/gym'),
+  'gym-places': slash('/gym'),
+  'export-tsvs': slash('/gym'),
+  'gym-queue': dropped('there is no queue to show'),
+  'import-gyms': dropped('gyms are added one by one with /gym add'),
+  import: slash('/region'),
+  setbounds: slash('/region'),
+  'require-role': dropped(ROLE_AUTH_GONE),
+  'add-role': dropped(ROLE_AUTH_GONE),
+  'remove-role': dropped(ROLE_AUTH_GONE),
+  'show-role-authorization': dropped(ROLE_AUTH_GONE),
+  'show-role-authorizations': dropped(ROLE_AUTH_GONE),
+  'silph-card': dropped('The Silph Road closed'),
+  'register-silph': dropped('The Silph Road closed'),
+  howmany: dropped('not carried over'),
+  // discord.js-commando's own (help, prefix and eval were not registered).
+  groups: dropped(COMMANDO),
+  enable: dropped(COMMANDO),
+  disable: dropped(COMMANDO),
+  load: dropped(COMMANDO),
+  unload: dropped(COMMANDO),
+  reload: dropped(COMMANDO),
+  ping: dropped(COMMANDO),
+  'unknown-command': dropped(COMMANDO),
+};
+
+/** What became of a legacy command; undefined for a name this table does not know. */
+export function newCommandOf(legacy: string): NewCommand | undefined {
+  const name = legacy.trim().toLowerCase();
+  return Object.hasOwn(LEGACY_COMMANDS, name) ? LEGACY_COMMANDS[name] : undefined;
+}
+
+/**
+ * A warning about one command's settings:
+ * - `staff-only`: a role is required and none is listed, so only staff could use it;
+ * - `no-effect`: roles are listed but none is required, so they did nothing;
+ * - `unknown-command`: the table above does not know the name.
+ */
+export type Warning = 'staff-only' | 'no-effect' | 'unknown-command';
+
+export interface ExportedCommand {
+  command: string;
+  required: boolean;
+  roleIds: string[];
+  /** Undefined for a name the mapping does not know. */
+  becomes: NewCommand | undefined;
+  warnings: Warning[];
+}
+
+export interface ExportedServer {
+  /** The server's snowflake. */
+  guild: string;
+  commands: ExportedCommand[];
+}
+
+/**
+ * The export by server: every command whose `roleRequired` is set, and every command with roles
+ * listed (those roles have no effect without it, which is said). A command for which neither is
+ * the case is left out.
+ */
+export function roleAuthExport(rows: readonly LegacyCommandRoles[]): ExportedServer[] {
+  const servers: ExportedServer[] = [];
+  for (const row of rows) {
+    const required = row.roleRequired === true;
+    if (!required && row.roleIds.length === 0) continue;
+    const becomes = newCommandOf(row.command);
+    const warnings: Warning[] = [];
+    if (required && row.roleIds.length === 0) warnings.push('staff-only');
+    if (!required && row.roleIds.length > 0) warnings.push('no-effect');
+    if (!becomes) warnings.push('unknown-command');
+    let server = servers.find((one) => one.guild === row.guild);
+    if (!server) {
+      server = { guild: row.guild, commands: [] };
+      servers.push(server);
+    }
+    server.commands.push({
+      command: row.command,
+      required,
+      roleIds: [...row.roleIds],
+      becomes,
+      warnings,
+    });
+  }
+  return servers;
+}
+
+export const ROLE_NAMES_NOTE =
+  'Roles are given by their ids: this export does not ask Discord for their names. With ' +
+  'Developer Mode on, Server Settings > Roles > (a role) > Copy Role ID shows which is which.';
+
+const PERMISSIONS_NOTE =
+  'Set these up under Server Settings > Integrations > Professor Pine: Discord sets permissions ' +
+  'per command (/settings as a whole, not one of its subcommands). Admins, moderators and bot ' +
+  'developers could always use every command, as members with Manage Server can there.';
+
+const WARNING_TEXT: Readonly<Record<Warning, string>> = {
+  'staff-only': 'required with no role listed: only staff could use it',
+  'no-effect': 'roles are listed but none is required: they had no effect',
+  'unknown-command': 'a command this export does not know',
+};
+
+function becomesText(becomes: NewCommand | undefined): string {
+  if (!becomes) return 'no mapping';
+  switch (becomes.kind) {
+    case 'slash':
+      return becomes.commands.join(', ');
+    case 'later':
+      return `${becomes.commands.join(', ')} (not built yet)`;
+    case 'dropped':
+      return `dropped: ${becomes.note}`;
+  }
+}
+
+/** The export as plain text, one block per server. */
+export function exportText(servers: readonly ExportedServer[]): string {
+  const lines = ['Legacy role authorization, per server', ROLE_NAMES_NOTE, PERMISSIONS_NOTE, ''];
+  if (servers.length === 0) {
+    lines.push('No server requires a role for any command, and no command has roles listed.');
+  }
+  for (const server of servers) {
+    lines.push(`Server ${server.guild}`);
+    for (const one of server.commands) {
+      const roles = one.roleIds.length === 0 ? 'no roles' : `roles ${one.roleIds.join(', ')}`;
+      const required = one.required ? 'required' : 'not required';
+      lines.push(`  ${one.command}: ${required}, ${roles} -> ${becomesText(one.becomes)}`);
+      for (const warning of one.warnings) lines.push(`    warning: ${WARNING_TEXT[warning]}`);
+    }
+    lines.push('');
+  }
+  return `${lines.join('\n').trimEnd()}\n`;
+}
+
+/** The export as JSON, for a script of the operator's own. */
+export function exportJson(servers: readonly ExportedServer[]): string {
+  return `${JSON.stringify({ note: ROLE_NAMES_NOTE, servers }, null, 2)}\n`;
+}
diff --git a/src/db/repositories/role-authorization-repository.db.test.ts b/src/db/repositories/role-authorization-repository.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..af550ac1b97d9103755b0a71bb0750a787e31892
--- /dev/null
+++ b/src/db/repositories/role-authorization-repository.db.test.ts
@@ -0,0 +1,99 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
+import { exportText, roleAuthExport } from '../../../scripts/role-auth/report.js';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import type { DB } from '../types.js';
+import { RoleAuthorizationRepository } from './role-authorization-repository.js';
+
+const HOME = '412345678901234567';
+const AWAY = '412345678901234568';
+
+describe('RoleAuthorizationRepository', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+  let repository: RoleAuthorizationRepository;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+    repository = new RoleAuthorizationRepository(db);
+  });
+  afterAll(async () => {
+    await stop();
+  });
+  beforeEach(async () => {
+    await db.deleteFrom('CommandRoles').execute();
+    await db.deleteFrom('CommandRoleAuthorization').execute();
+    await db.deleteFrom('Guild').execute();
+    await sql`insert into Guild (id, snowflake) values (1, ${HOME}), (2, ${AWAY})`.execute(db);
+  });
+
+  it('reads nothing from empty tables', async () => {
+    expect(await repository.list()).toEqual([]);
+  });
+
+  it('puts the two tables together per server and command, as the legacy bot wrote them', async () => {
+    await sql`
+      insert into CommandRoleAuthorization (command, guildId, roleRequired) values
+        ('train', 1, 1), ('meetup', 1, 1), ('raid', 1, 0), ('train', 2, 1), (null, 1, 1)
+    `.execute(db);
+    await sql`
+      insert into CommandRoles (command, guildId, roleSnowflakeId) values
+        ('meetup', 1, '510000000000000002'), ('meetup', 1, '510000000000000001'),
+        ('raid', 1, '510000000000000003'), ('shout', 2, '510000000000000004'),
+        ('shout', 2, ''), (null, 1, '510000000000000005')
+    `.execute(db);
+    expect(await repository.list()).toEqual([
+      {
+        guild: HOME,
+        command: 'meetup',
+        roleRequired: true,
+        roleIds: ['510000000000000002', '510000000000000001'],
+      },
+      { guild: HOME, command: 'raid', roleRequired: false, roleIds: ['510000000000000003'] },
+      { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
+      { guild: AWAY, command: 'shout', roleRequired: null, roleIds: ['510000000000000004'] },
+      { guild: AWAY, command: 'train', roleRequired: true, roleIds: [] },
+    ]);
+  });
+
+  it('leaves out the rows of no server, as the legacy bot ignored them', async () => {
+    await sql`
+      insert into CommandRoleAuthorization (command, guildId, roleRequired) values
+        ('train', null, 1), ('train', 1, 1)
+    `.execute(db);
+    await sql`
+      insert into CommandRoles (command, guildId, roleSnowflakeId) values
+        ('meetup', null, '510000000000000009')
+    `.execute(db);
+    expect(await repository.list()).toEqual([
+      { guild: HOME, command: 'train', roleRequired: true, roleIds: [] },
+    ]);
+  });
+
+  it('writes nothing, and makes the export the script prints', async () => {
+    await sql`
+      insert into CommandRoleAuthorization (command, guildId, roleRequired) values ('meetup', 1, 1)
+    `.execute(db);
+    await sql`
+      insert into CommandRoles (command, guildId, roleSnowflakeId) values
+        ('meetup', 1, '510000000000000001')
+    `.execute(db);
+    const statements: string[] = [];
+    const watched = new RoleAuthorizationRepository(
+      db.withPlugin({
+        transformQuery: (args) => {
+          statements.push(args.node.kind);
+          return args.node;
+        },
+        transformResult: (args) => Promise.resolve(args.result),
+      }),
+    );
+    const text = exportText(roleAuthExport(await watched.list()));
+    expect(statements.every((kind) => kind === 'SelectQueryNode')).toBe(true);
+    expect(text).toContain(
+      `Server ${HOME}\n  meetup: required, roles 510000000000000001 -> /meetup`,
+    );
+    expect(await db.selectFrom('CommandRoles').selectAll().execute()).toHaveLength(1);
+    expect(await db.selectFrom('CommandRoleAuthorization').selectAll().execute()).toHaveLength(1);
+  });
+});
diff --git a/src/db/repositories/role-authorization-repository.ts b/src/db/repositories/role-authorization-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d49f4e9e56ff39ef74099d24be424f983377fc11
--- /dev/null
+++ b/src/db/repositories/role-authorization-repository.ts
@@ -0,0 +1,76 @@
+import type { Kysely } from 'kysely';
+import type { DB } from '../types.js';
+
+/**
+ * What the legacy bot's role authorization says of one command in one server: whether a role is
+ * required (`CommandRoleAuthorization.roleRequired`; null when that table has no row for it) and
+ * the roles listed for it (`CommandRoles`).
+ */
+export interface LegacyCommandRoles {
+  /** The server's snowflake. */
+  guild: string;
+  /** The legacy command's name, as the legacy bot keyed it (the command, not an alias). */
+  command: string;
+  roleRequired: boolean | null;
+  /** Role snowflakes, each once, in the order of their rows. */
+  roleIds: string[];
+}
+
+/**
+ * The legacy tables `CommandRoleAuthorization` and `CommandRoles`, read for the export that
+ * cutover needs (`npm run role-auth:export`). Read only: the legacy bot keeps them until the
+ * final migration drops them.
+ */
+export class RoleAuthorizationRepository {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  /**
+   * Every command either table names, per server, ordered by server and command. A row without
+   * a command, or of no server (no `Guild` row with a snowflake), is left out: the legacy bot
+   * looked its settings up by the server's snowflake and never found such a row.
+   */
+  async list(): Promise<LegacyCommandRoles[]> {
+    const [required, roles] = await Promise.all([
+      this.db
+        .selectFrom('CommandRoleAuthorization as a')
+        .innerJoin('Guild as g', 'g.id', 'a.guildId')
+        .select(['a.command', 'a.roleRequired', 'g.snowflake'])
+        .where('a.command', 'is not', null)
+        .where('g.snowflake', 'is not', null)
+        .orderBy('a.id')
+        .execute(),
+      this.db
+        .selectFrom('CommandRoles as r')
+        .innerJoin('Guild as g', 'g.id', 'r.guildId')
+        .select(['r.command', 'r.roleSnowflakeId', 'g.snowflake'])
+        .where('r.command', 'is not', null)
+        .where('g.snowflake', 'is not', null)
+        .orderBy('r.id')
+        .execute(),
+    ]);
+    const byKey = new Map<string, LegacyCommandRoles>();
+    const entry = (guild: string, command: string): LegacyCommandRoles => {
+      const key = `${guild}|${command}`;
+      let found = byKey.get(key);
+      if (!found) {
+        found = { guild, command, roleRequired: null, roleIds: [] };
+        byKey.set(key, found);
+      }
+      return found;
+    };
+    for (const row of required) {
+      if (row.command === null || row.snowflake === null) continue;
+      entry(row.snowflake, row.command).roleRequired =
+        row.roleRequired === null ? null : row.roleRequired !== 0;
+    }
+    for (const row of roles) {
+      if (row.command === null || row.snowflake === null) continue;
+      const found = entry(row.snowflake, row.command);
+      const id = row.roleSnowflakeId?.trim() ?? '';
+      if (id !== '' && !found.roleIds.includes(id)) found.roleIds.push(id);
+    }
+    return [...byKey.values()].sort(
+      (a, b) => a.guild.localeCompare(b.guild) || a.command.localeCompare(b.command),
+    );
+  }
+}
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto/phase-5c HEAD -- src test scripts` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other.
2. Whole-branch review (Opus, high effort) of the six commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `ctx.raidBossAdmin`, `ctx.nicknames`, `diffBosses` / `FeedChange.seen`, `RaidBossAnnouncer`, the `~` keys of unknown bosses, the nickname rules, the role-auth export.
4. `docs/superpowers/plans/phase-0-follow-ups.md`: a "From Phase 5C" section (staging, left open: the stale warning after a restart, announcements in news channels, override changes between syncs not announced; Phase 8: run the export before cutover). The Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of this plan has touched Discord. Each step needs Matt's go-ahead; the bot is started by Matt. `npm run deploy-commands -- --guild <test server>` comes first (`/admin` has new groups). No migration. The test server needs a `bot-updates` text channel for the announcements.

- [ ] `/admin boss list`: the list matches what `/raid`'s boss choices offer; marks and "how identified" read sensibly.
- [ ] `/admin boss add pokemon:<a Pokémon not in T3> tier:T3`: `/raid` offers it in T3 at once; `/admin boss remove` takes it away. `hide` a feed boss: gone from `/raid`. `autoset` for a tier: a reported egg of that tier hatches as it. `shiny`: the post shows the shiny mark.
- [ ] `/admin boss sync`: "unchanged" (or what changed); four presses in a minute: the throttle.
- [ ] Announcement: with `announceChanges` on, change the feed address in the staging settings to a copy with one boss less (a local file server), sync: one message in `bot-updates`, no ping.
- [ ] `/admin nickname add pokemon:Pikachu nickname:sparky`: `/raid` finds Pikachu by "sparky"; `remove`; a reserved word and a name of another Pokémon are refused.
- [ ] `/admin member-settings member:<second account>`: no ping, the second account sees nothing.
- [ ] `/help command:admin` and `/help command:admin boss`.
- [ ] `npm run role-auth:export` against the dev database (empty tables: says so).
