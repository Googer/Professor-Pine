# Phase 2A: Command Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every later command and control one way to be written: subcommands, acknowledging slow commands, per-member limits, buttons, select menus and modals, and "where am I" inside a forum post, so that the party work of Phase 2 and the admin work of Phase 5 build on the same contract.

**Architecture:** Everything is in `src/discord/` and stays independent of parties. A command is either a `SimpleCommand` or a `GroupedCommand` whose subcommands are built from parts by `commandGroup`, so that a subcommand's definition and its handler are one object and several files can add to one command (`/admin`). The router finds the handler, runs the guards of the command and of the subcommand, applies the handler's throttle, acknowledges if the handler asks for it, and turns a `UserError` into a private reply whatever was sent before. Component handlers have one typed method per kind of control. `channelContext` describes a channel and a thread in it the same way.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Vitest. No new dependencies, no database changes.

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: section 3.2 (router and guards), 4.2 (which commands are subcommands, throttles, the rule that admin commands carry guards), the last paragraphs of 4.2 (`/help`), and section 7 (error handling, deferring). This is the first of the Phase 2 plans. Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, section "Phase 2 (raids on forums; first real commands and components)", the two decisions of "Phase 5 (admin)" and the two items of "Phase 6 (utilities)".

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task: 841 unit tests pass, lint, format and typecheck are clean after every task. If something does not pass as written, suspect a transcription slip before suspecting the design.

## How Phase 2 is divided

| Plan | Contents |
|---|---|
| **2A** (this plan) | The command framework: subcommands, deferral, throttles, typed component handlers, channel context and guards, test fakes, `/help` |
| 2B | `Party` table and repository, the raid model and its transitions, scheduler decisions as pure functions, the raid durations in effect (Raid Hour, events feed) |
| 2C | Renderer, `PartyService`, `/admin setup-forums`, tags, the summary post, `/raid` with gym and boss autocomplete |
| 2D | Buttons and group select, the party and raid slash commands, the completion prompt, the scheduler tick, archiving, catching up after a restart |
| 2E | Mirrors, `AccessService`, `/admin save-party`, `/where`, `/shout`, `/delete`, `/status`, the staging checklist of the phase |

Phase 5 (admin) and Phase 6 (utilities) depend on this plan and not on 2B to 2E, so either can be worked on beside them once 2A is merged.

## Decisions made in this plan

1. **Subcommands are parts.** A `GroupedCommand` is built by `commandGroup({ data, help, guards, groups, parts })`. Each part carries its own `SlashCommandSubcommandBuilder`, guards, `execute`, `autocomplete`, `defer`, `throttle` and help. The handlers are keyed by path: `create`, or `boss add` for subcommand `add` of group `boss`. The router refuses at construction a command whose definition and handlers disagree, so a mismatch fails at start and in tests, not when a member uses it.
2. **Guards run in this order:** the command's, then the subcommand's. A use counts against a throttle only after the guards have let it through.
3. **The handler says how it defers; the router does it.** `defer: 'ephemeral' | 'public'` on a handler makes the router call `deferReply` after the guards and the throttle, and the handler answers with `editReply`. A handler that opens a modal must not defer (Discord does not allow a modal after a deferral).
4. **An error is always private.** After a public deferral with nothing sent yet, the router deletes the "thinking…" message and then sends the error as an ephemeral follow-up. Without the deletion, the first follow-up would take the place of the deferred reply and be public. This is how discord.js and the Discord documentation describe it; it has not been seen against Discord yet, so it is on the staging checklist of plan 2C, the first plan with a publicly deferring command.
5. **Throttles** (spec 4.2: `/raid` 20 per 900 s, `/shout` 3 per 180 s, `/request` 3 per 1800 s, `/spawn` 15 per 900 s) are `throttle: { uses, perSeconds }` on a handler. The window opens with the member's first use, as the legacy bot counted. Kept in memory; a restart forgets it. Nobody is exempt (the legacy bot exempted the owner).
6. **Component handlers are typed per control.** `ComponentHandler` has optional `button`, `select` and `modal` functions instead of one `handle`. A control whose handler has no function for its kind is answered like a control that no longer exists. Handlers are listed in `src/components/index.ts`.
7. **A thread is described by the channel it is in.** `channelContext(interaction)` gives the base channel (the parent of a thread or forum post), its name and its category. `requireBotChannel` and `requirePvpContext` use it, so they also hold inside threads, and a DM is recognised by the missing server (`!interaction.inGuild()`), not by the channel cache. An archived post is not in the cache: only its id is known then. Plan 2B's "is this a party post" must therefore go by `channelId`, never by the cache.
8. **Region of an interaction:** `regionChannelOf(interaction, ctx)` is the base channel when `ctx.gyms.isRegion` knows it. Plan 2B extends it to a region's forum when `Region.forumChannelId` exists. Guards `requireRegion` and `requireBotChannelOrRegion` (the legacy rule for gym administration) are built on it.
9. **Commands are offered in servers only unless they say otherwise.** `buildCommandPayload` sets `contexts: [Guild]` on a command that sets none; Discord's own default would offer every command in DMs too. `/help` sets Guild and BotDM. This settles the Phase 5 question about the owner in DMs: staff commands do not exist in DMs, and `requireManagement` keeps refusing outside a server.
10. **Staff commands are not shown to other members.** `/help` leaves them out of the overview (as before), out of autocomplete, and answers "There is no /x command" for them, exactly as for a command that does not exist. Discord itself hides commands a member may not use (`default_member_permissions`), so this only keeps `/help` consistent with it.
11. **`enabled(config)`** on a command leaves it out of both the router and the registration when this installation lacks what it needs (`/maps` without `REGION_MAP_LINK`). `deploy-cli` therefore loads the settings as well as the environment.
12. **`/help` for subcommands:** `/help command:gym` lists every subcommand with its description; `/help command:gym create` explains one. The overview shows one line per command with its description, and falls back to names only when that would exceed the 6,000 characters Discord allows in one embed (about 80 commands will).
13. **Help categories are a type** (`HelpCategory`, the keys of `CATEGORY_LABELS`), so a typo in a command's category fails the typecheck.
14. **Not in this plan:** the pool's `timezone: 'Z'` and `inParty` (plan 2B, with the `Party` table), a test of `startApp`'s wiring (plan 2D, when the scheduler is wired in), the shape of the DM "stop" custom id (Phase 4).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure. Nothing in this plan touches `src/domain/`, `src/db/` or `src/services/`.
- **Tests never use the network and never contact Discord.** Interactions in tests are the fakes of `test/support/fake-interactions.ts`.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting). No task of this plan needs Docker.
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`.

## Review Focus

1. A member uses a subcommand the bot does not have (the deployed commands are older or newer than the running code). The member must get "That command is not available", nothing may throw, and the log must say which command and subcommand. Test: Task 2, "answers a subcommand it does not know".
2. A command fails after it was publicly acknowledged. The error text must reach only the member, and the "thinking…" message must not stay. Tests: Task 3, "keeps an error private after a public deferral" and "leaves the answer alone when the error comes after it, or the deferral was private".
3. A member hammers a throttled command, or is refused by a guard first. Refused uses must not count, another member must not be affected, and the member must be told how long to wait. Tests: Task 3, "refuses a member who uses a throttled command too often" and "does not count a use that a guard refused"; Task 3, `throttle.test.ts`.
4. A control arrives whose handler has nothing for it: a modal for a handler that only has buttons, a custom id from the legacy bot, an id with an empty part. The member must be told the control is no longer active; nothing may throw. Tests: Task 4, "answers a kind of control its handler does not have as no longer active", and the custom-id cases.
5. An interaction comes from a thread, from a forum post that is not in the cache, or from a DM. Guards must judge it by the channel the thread is in, must not crash on a missing channel, and must not mistake an uncached thread for a DM. Tests: Task 5, `channel-context.test.ts`, "requireBotChannel also holds in a thread of the bot channel", "requirePvpContext holds in a thread under the PvP category and in an uncached DM".

---

## File Structure

```
src/discord/
  command.ts           modify: SimpleCommand, GroupedCommand, CommandHandler (defer, throttle),
                               typed ComponentHandler, enabled, subcommandPath, declaredSubcommands
  command-group.ts     create: commandGroup, SubcommandPart
  throttle.ts          create: Throttles, waitText
  channel-context.ts   create: channelContext
  router.ts            modify: subcommand dispatch, deferral, throttles, private errors, typed components
  guards.ts            modify: thread-aware guards, regionChannelOf, requireRegion, requireBotChannelOrRegion
  deploy.ts            modify: servers-only by default
  deploy-cli.ts        modify: registers only the enabled commands
  client.ts            modify: cause on the final login error, no "retrying" line for the last attempt
src/components/
  index.ts             create: the list of component handlers (empty for now)
src/commands/
  categories.ts        modify: HelpCategory
  util/help.ts         modify: subcommands, staff commands hidden, DMs
  util/help-render.ts  modify: whole-line truncation, embed size, subcommand help
src/app.ts             modify: enabled commands, component list
test/support/
  fake-interactions.ts modify: select and modal fakes, typed payloads, options, threads, reply state
```

---

### Task 1: Test fakes for every kind of interaction

**Files:**
- Replace: `test/support/fake-interactions.ts`
- Create: `test/support/fake-interactions.test.ts`
- Modify: `src/commands/util/help.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by every later task and plan): `fakeChatInput(o)`, `fakeAutocomplete(o)`, `fakeButton(o)`, `fakeSelect(o)`, `fakeModal(o)`, each taking `FakeOptions`; `sent(mock, call = 0): SentPayload` to read what a `reply`, `followUp` or `editReply` was called with; constants `FAKE_GUILD_ID`, `FAKE_CHANNEL_ID`, `FAKE_PARENT_ID`, `FAKE_USER_ID`. A fake keeps `deferred`, `replied` and `ephemeral` the way discord.js does (`ephemeral` is `null` until a reply or `deferReply` sets it; `deferUpdate` leaves it `null`).

- [ ] **Step 1: Write the test of the fakes**

Create `test/support/fake-interactions.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  FAKE_CHANNEL_ID,
  FAKE_PARENT_ID,
  fakeAutocomplete,
  fakeButton,
  fakeChatInput,
  fakeModal,
  fakeSelect,
  sent,
} from './fake-interactions.js';

describe('fake interactions', () => {
  it('says what kind of interaction it is', () => {
    expect(fakeChatInput().isChatInputCommand()).toBe(true);
    expect(fakeAutocomplete().isAutocomplete()).toBe(true);
    const button = fakeButton({ customId: 'p:1:join' });
    expect([button.isMessageComponent(), button.isButton(), button.isAnySelectMenu()]).toEqual([
      true,
      true,
      false,
    ]);
    const select = fakeSelect({ customId: 'p:1:group', values: ['B'] });
    expect([select.isMessageComponent(), select.isButton(), select.isAnySelectMenu()]).toEqual([
      true,
      false,
      true,
    ]);
    expect(select.values).toEqual(['B']);
    const modal = fakeModal({ customId: 'p:1:time', fields: { time: '6pm' } });
    expect([modal.isModalSubmit(), modal.isMessageComponent()]).toEqual([true, false]);
    expect(modal.fields.getTextInputValue('time')).toBe('6pm');
    expect(modal.fields.getTextInputValue('other')).toBe('');
  });

  it('gives option values by type, and null for an option that was not given', () => {
    const i = fakeChatInput({
      subcommandGroup: 'boss',
      subcommand: 'add',
      options: { pokemon: 'mewtwo', count: 3, remote: true },
      resolved: { member: { id: '1' } },
    });
    expect(i.options.getSubcommandGroup()).toBe('boss');
    expect(i.options.getSubcommand()).toBe('add');
    expect(i.options.getString('pokemon')).toBe('mewtwo');
    expect(i.options.getInteger('count')).toBe(3);
    expect(i.options.getBoolean('remote')).toBe(true);
    expect(i.options.getString('count')).toBeNull();
    expect(i.options.getString('missing')).toBeNull();
    expect(i.options.getUser('member')).toEqual({ id: '1' });
    expect(i.options.getAttachment('missing')).toBeNull();
    expect(fakeChatInput().options.getSubcommand(false)).toBeNull();
  });

  it('gives the focused autocomplete option as text or with its name', () => {
    const i = fakeAutocomplete({ focused: 'big f', focusedName: 'gym' });
    expect(i.options.getFocused()).toBe('big f');
    expect(i.options.getFocused(true)).toEqual({ name: 'gym', value: 'big f' });
  });

  it('keeps deferred, replied and ephemeral as discord.js does', async () => {
    const replied = fakeChatInput();
    expect([replied.deferred, replied.replied, replied.ephemeral]).toEqual([false, false, null]);
    await replied.reply({ content: 'Done.', flags: MessageFlags.Ephemeral });
    expect([replied.deferred, replied.replied, replied.ephemeral]).toEqual([false, true, true]);
    expect(sent(replied.reply).content).toBe('Done.');

    const deferred = fakeChatInput();
    await deferred.deferReply();
    expect([deferred.deferred, deferred.replied, deferred.ephemeral]).toEqual([true, false, false]);
    await deferred.editReply({ content: 'Here.' });
    expect(deferred.replied).toBe(true);

    const hidden = fakeChatInput();
    await hidden.deferReply({ flags: MessageFlags.Ephemeral });
    expect(hidden.ephemeral).toBe(true);

    const button = fakeButton({ customId: 'p:1:join' });
    await button.deferUpdate();
    expect([button.deferred, button.replied, button.ephemeral]).toEqual([true, false, null]);
  });

  it('complains when a test reads a payload that was never sent', () => {
    expect(() => sent(fakeChatInput().reply)).toThrow(/nothing was sent/);
  });

  it('is in a text channel unless told otherwise', () => {
    const text = fakeChatInput({ channelName: 'downtown', parentName: 'RAIDS' });
    expect(text.channelId).toBe(FAKE_CHANNEL_ID);
    expect(text.channel?.isThread()).toBe(false);
    expect(text.channel?.name).toBe('downtown');
    expect(text.channel?.parent?.name).toBe('RAIDS');

    const post = fakeChatInput({
      channelName: 'Mewtwo · Big Fountain',
      thread: { parentName: 'downtown-raids', categoryName: 'RAIDS' },
    });
    expect(post.channel?.isThread()).toBe(true);
    expect(post.channel?.parentId).toBe(FAKE_PARENT_ID);
    expect(post.channel?.parent).toEqual({
      id: FAKE_PARENT_ID,
      name: 'downtown-raids',
      parent: { name: 'RAIDS' },
    });

    expect(fakeChatInput({ uncachedChannel: true }).channel).toBeNull();
    const dm = fakeChatInput({ isDm: true });
    expect([dm.inGuild(), dm.guildId, dm.channel?.isDMBased()]).toEqual([false, null, true]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run --project unit test/support/fake-interactions.test.ts`
Expected: FAIL (`fakeModal`, `fakeSelect`, `sent` and the `FAKE_…` constants are not exported).

- [ ] **Step 3: Replace the fakes**

Replace `test/support/fake-interactions.ts` with:

```ts
import { Collection, MessageFlags, type APIEmbed } from 'discord.js';
import { vi } from 'vitest';

/** What a test may want to read back from a reply, follow-up or edit. */
export interface SentPayload {
  content?: string;
  flags?: number;
  embeds?: ReadonlyArray<{ toJSON(): APIEmbed }>;
  components?: readonly unknown[];
  files?: readonly unknown[];
}

type OptionValue = string | number | boolean | null;

export interface FakeOptions {
  commandName?: string;
  /** `/gym create` has subcommand `create`; `/admin boss add` has group `boss`, subcommand `add`. */
  subcommand?: string;
  subcommandGroup?: string;
  customId?: string;
  deferred?: boolean;
  replied?: boolean;
  guildId?: string | null;
  channelId?: string;
  channelName?: string;
  /** Name of the category the channel is under. */
  parentName?: string | null;
  /**
   * Makes the channel a thread (a forum post is one). `parentName` is then ignored: the
   * category is that of the channel the thread belongs to.
   */
  thread?: { parentId?: string; parentName?: string; categoryName?: string };
  /** The channel is not in the cache (an archived forum post): `interaction.channel` is null. */
  uncachedChannel?: boolean;
  isDm?: boolean;
  userId?: string;
  roleNames?: string[];
  /** Option values by name, for getString, getInteger, getNumber and getBoolean. */
  options?: Record<string, OptionValue>;
  /** Resolved options by name, for getUser, getMember, getRole, getChannel and getAttachment. */
  resolved?: Record<string, unknown>;
  /** Autocomplete: what was typed so far, and in which option. */
  focused?: string;
  focusedName?: string;
  /** Select menu: the chosen values. */
  values?: string[];
  /** Modal: the text typed into each input, by the input's custom id. */
  fields?: Record<string, string>;
}

type Kind = 'chat' | 'autocomplete' | 'button' | 'select' | 'modal';

const TYPE: Record<Kind, number> = { chat: 2, autocomplete: 4, button: 3, select: 3, modal: 5 };
export const FAKE_GUILD_ID = '412345678901234567';
export const FAKE_CHANNEL_ID = '600000000000000001';
export const FAKE_PARENT_ID = '600000000000000002';
export const FAKE_USER_ID = '700000000000000001';

function fakeChannel(o: FakeOptions, id: string) {
  if (o.uncachedChannel) return null;
  const category = (name: string | null | undefined) => (name ? { name } : null);
  if (o.thread) {
    const parentId = o.thread.parentId ?? FAKE_PARENT_ID;
    return {
      id,
      name: o.channelName ?? 'post',
      parentId,
      parent: {
        id: parentId,
        name: o.thread.parentName ?? 'forum',
        parent: category(o.thread.categoryName),
      },
      isThread: () => true,
      isDMBased: () => false,
    };
  }
  return {
    id,
    name: o.channelName ?? 'general',
    parentId: null,
    parent: category(o.parentName),
    isThread: () => false,
    isDMBased: () => o.isDm ?? false,
  };
}

/**
 * Just enough of a discord.js interaction for router, guard, command and component tests.
 * It keeps `deferred`, `replied` and `ephemeral` the way discord.js does. Cast to the concrete
 * interaction type at the call site.
 */
function base(kind: Kind, o: FakeOptions) {
  const guildId = o.isDm ? null : (o.guildId ?? FAKE_GUILD_ID);
  const channelId = o.channelId ?? FAKE_CHANNEL_ID;
  const isEphemeral = (payload?: SentPayload) =>
    ((payload?.flags ?? 0) & MessageFlags.Ephemeral) !== 0;
  const value = <T extends OptionValue>(name: string, type: string): T | null => {
    const found = o.options?.[name];
    return typeof found === type ? (found as T) : null;
  };
  const resolved = (name: string) => o.resolved?.[name] ?? null;

  const interaction = {
    id: '900000000000000001',
    type: TYPE[kind],
    commandName: o.commandName,
    customId: o.customId,
    guildId,
    channelId,
    user: { id: o.userId ?? FAKE_USER_ID },
    member: {
      roles: {
        cache: new Collection(
          (o.roleNames ?? []).map((name, i) => [String(i), { id: String(i), name }]),
        ),
      },
    },
    channel: fakeChannel(o, channelId),
    deferred: o.deferred ?? false,
    replied: o.replied ?? false,
    /** As in discord.js: null until a reply or deferral says which. */
    ephemeral: null as boolean | null,
    responded: false,
    values: o.values ?? [],
    isChatInputCommand: () => kind === 'chat',
    isAutocomplete: () => kind === 'autocomplete',
    isMessageComponent: () => kind === 'button' || kind === 'select',
    isButton: () => kind === 'button',
    isAnySelectMenu: () => kind === 'select',
    isModalSubmit: () => kind === 'modal',
    inCachedGuild: () => guildId !== null,
    inGuild: () => guildId !== null,
    options: {
      getString: (name: string) => value<string>(name, 'string'),
      getInteger: (name: string) => value<number>(name, 'number'),
      getNumber: (name: string) => value<number>(name, 'number'),
      getBoolean: (name: string) => value<boolean>(name, 'boolean'),
      getUser: resolved,
      getMember: resolved,
      getRole: resolved,
      getChannel: resolved,
      getAttachment: resolved,
      getSubcommand: (_required?: boolean) => o.subcommand ?? null,
      getSubcommandGroup: (_required?: boolean) => o.subcommandGroup ?? null,
      getFocused: (full?: boolean) =>
        full ? { name: o.focusedName ?? 'option', value: o.focused ?? '' } : (o.focused ?? ''),
    },
    fields: { getTextInputValue: (id: string) => o.fields?.[id] ?? '' },
    reply: vi.fn((payload: SentPayload) => {
      interaction.replied = true;
      interaction.ephemeral = isEphemeral(payload);
      return Promise.resolve();
    }),
    deferReply: vi.fn((payload?: SentPayload) => {
      interaction.deferred = true;
      interaction.ephemeral = isEphemeral(payload);
      return Promise.resolve();
    }),
    editReply: vi.fn((_payload: SentPayload) => {
      interaction.replied = true;
      return Promise.resolve();
    }),
    deleteReply: vi.fn(() => Promise.resolve()),
    followUp: vi.fn((_payload: SentPayload) => {
      interaction.replied = true;
      return Promise.resolve();
    }),
    /** Components and modals: acknowledge, or change the message the control is on. */
    deferUpdate: vi.fn(() => {
      interaction.deferred = true;
      return Promise.resolve();
    }),
    update: vi.fn((_payload: SentPayload) => {
      interaction.replied = true;
      return Promise.resolve();
    }),
    showModal: vi.fn((_modal: unknown) => {
      interaction.replied = true;
      return Promise.resolve();
    }),
    respond: vi.fn((_choices: ReadonlyArray<{ name: string; value: string | number }>) => {
      interaction.responded = true;
      return Promise.resolve();
    }),
  };
  return interaction;
}

export const fakeChatInput = (o: FakeOptions = {}) => base('chat', { commandName: 'test', ...o });
export const fakeAutocomplete = (o: FakeOptions = {}) =>
  base('autocomplete', { commandName: 'test', ...o });
export const fakeButton = (o: FakeOptions = {}) => base('button', o);
export const fakeSelect = (o: FakeOptions = {}) => base('select', o);
export const fakeModal = (o: FakeOptions = {}) => base('modal', o);
export type FakeInteraction = ReturnType<typeof base>;

/** The payload of the n-th call (default: the first) of a fake's reply, followUp or editReply. */
export function sent(
  mock: { mock: { calls: ReadonlyArray<readonly [SentPayload?]> } },
  call = 0,
): SentPayload {
  const payload = mock.mock.calls[call]?.[0];
  if (!payload) throw new Error(`nothing was sent in call ${call}`);
  return payload;
}
```

- [ ] **Step 4: Use the typed payload in the help test**

`reply` now takes a payload, so the cast in `src/commands/util/help.test.ts` goes:

```diff
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -4,7 +4,11 @@ import {
   type ChatInputCommandInteraction,
 } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { fakeAutocomplete, fakeChatInput } from '../../../test/support/fake-interactions.js';
+import {
+  fakeAutocomplete,
+  fakeChatInput,
+  sent,
+} from '../../../test/support/fake-interactions.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { UserError } from '../../discord/errors.js';
 import { help } from './help.js';
@@ -21,12 +25,7 @@ describe('/help', () => {
   it('explains one command, accepting a leading slash', async () => {
     const i = fakeChatInput({ commandName: 'help', options: { command: '/help' } });
     await help.execute(i as unknown as ChatInputCommandInteraction, ctx);
-    // The fake's reply takes no parameters, so mock.calls is typed as empty tuples.
-    const calls = i.reply.mock.calls as unknown as Array<
-      [{ embeds: Array<{ toJSON(): { title?: string } }> }]
-    >;
-    const payload = calls[0]?.[0];
-    expect(payload?.embeds[0]?.toJSON().title).toBe('/help');
+    expect(sent(i.reply).embeds?.[0]?.toJSON().title).toBe('/help');
   });
 
   it('rejects an unknown command name', async () => {
```

- [ ] **Step 5: Check and commit**

Run: `npx prettier --write test/support/fake-interactions.ts test/support/fake-interactions.test.ts src/commands/util/help.test.ts`, then `npm run check`.
Expected: green; 779 unit tests.

```bash
git add test/support/fake-interactions.ts test/support/fake-interactions.test.ts src/commands/util/help.test.ts
git commit -m "Test fakes: select menus, modals, options, threads and reply state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Subcommands

**Files:**
- Replace: `src/discord/command.ts`
- Create: `src/discord/command-group.ts`, `src/discord/command-group.test.ts`
- Modify: `src/discord/router.ts`, `src/discord/router.test.ts`, `src/commands/util/help.ts`

**Interfaces:**
- Consumes: the fakes of Task 1 (`subcommand`, `subcommandGroup` options).
- Produces:
  - `CommandHandler { guards?, execute(interaction, ctx), autocomplete?(interaction, ctx) }`
  - `SimpleCommand` (a `CommandHandler` with `data` and `help`), `GroupedCommand { data, help, guards?, subcommands: ReadonlyMap<string, SubcommandHandler> }`, `CommandModule = SimpleCommand | GroupedCommand`
  - `SubcommandHandler` = `CommandHandler` plus `help?: { details?, examples? }`
  - `subcommandPath(group: string | null, subcommand: string | null): string`, `declaredSubcommands(options): string[]`
  - `commandGroup(definition: CommandGroupDefinition): GroupedCommand` and `SubcommandPart` (a `SubcommandHandler` with `data: SlashCommandSubcommandBuilder` and optional `group`)
  - The router logs `no handler for command` (warn) with `interaction.command` and `interaction.subcommand`.

- [ ] **Step 1: Write the tests of `commandGroup`**

Create `src/discord/command-group.test.ts`:

```ts
import {
  ApplicationCommandOptionType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { commandGroup, type SubcommandPart } from './command-group.js';
import { declaredSubcommands, subcommandPath, type Guard } from './command.js';

const sub = (name: string) =>
  new SlashCommandSubcommandBuilder().setName(name).setDescription(name);
const part = (name: string, extra: Partial<SubcommandPart> = {}): SubcommandPart => ({
  data: sub(name),
  execute: vi.fn(() => Promise.resolve()),
  ...extra,
});
const admin = () => new SlashCommandBuilder().setName('admin').setDescription('Administration');
const help = { category: 'admin' };

describe('subcommandPath', () => {
  it('spells a path with and without a group', () => {
    expect(subcommandPath(null, 'create')).toBe('create');
    expect(subcommandPath('boss', 'add')).toBe('boss add');
    expect(subcommandPath(null, null)).toBe('');
  });
});

describe('commandGroup', () => {
  it('adds every part to the definition and keys its handler by path', () => {
    const addRan = vi.fn(() => Promise.resolve());
    const setup = part('setup-forums');
    const add = part('add', { group: 'boss', execute: addRan });
    const hide = part('hide', { group: 'boss' });
    const command = commandGroup({
      data: admin(),
      help,
      groups: { boss: 'Raid bosses' },
      parts: [add, setup, hide],
    });

    expect([...command.subcommands.keys()]).toEqual(['boss add', 'setup-forums', 'boss hide']);
    expect(command.subcommands.get('boss add')).toMatchObject({ execute: addRan });
    const json = command.data.toJSON();
    expect(declaredSubcommands(json.options)).toEqual(['setup-forums', 'boss add', 'boss hide']);
    expect(json.options?.[1]).toMatchObject({
      type: ApplicationCommandOptionType.SubcommandGroup,
      name: 'boss',
      description: 'Raid bosses',
    });
  });

  it('keeps the guards, help and autocomplete of a part, and the guards of the command', () => {
    const everywhere: Guard = () => undefined;
    const here: Guard = () => undefined;
    const autocomplete = vi.fn(() => Promise.resolve());
    const command = commandGroup({
      data: admin(),
      help,
      guards: [everywhere],
      parts: [part('sync', { guards: [here], autocomplete, help: { details: 'Reads the feed.' } })],
    });
    expect(command.guards).toEqual([everywhere]);
    expect(command.subcommands.get('sync')).toMatchObject({
      guards: [here],
      autocomplete,
      help: { details: 'Reads the feed.' },
    });
    expect(command.subcommands.get('sync')).not.toHaveProperty('data');
    expect(command.subcommands.get('sync')).not.toHaveProperty('group');
  });

  it('refuses a definition that Discord or the router could not use', () => {
    expect(() =>
      commandGroup({ data: admin(), help, parts: [part('sync'), part('sync')] }),
    ).toThrow('Duplicate subcommand /admin sync');
    expect(() =>
      commandGroup({ data: admin(), help, parts: [part('add', { group: 'boss' })] }),
    ).toThrow('/admin boss add: no group "boss" is defined');
    expect(() =>
      commandGroup({ data: admin(), help, groups: { boss: 'Raid bosses' }, parts: [part('sync')] }),
    ).toThrow('/admin: group "boss" has no subcommands');
    expect(() => commandGroup({ data: admin(), help, parts: [] })).toThrow(
      '/admin has no subcommands',
    );
  });
});

describe('declaredSubcommands', () => {
  it('is empty for a command with ordinary options only', () => {
    const json = new SlashCommandBuilder()
      .setName('raid')
      .setDescription('Report a raid')
      .addStringOption((option) => option.setName('boss').setDescription('The boss'))
      .toJSON();
    expect(declaredSubcommands(json.options)).toEqual([]);
    expect(declaredSubcommands(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Add the router tests**

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -1,4 +1,9 @@
-import { MessageFlags, type Interaction } from 'discord.js';
+import {
+  MessageFlags,
+  SlashCommandBuilder,
+  SlashCommandSubcommandBuilder,
+  type Interaction,
+} from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import {
   fakeAutocomplete,
@@ -6,13 +11,14 @@ import {
   fakeChatInput,
 } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
-import type { CommandModule, ComponentHandler } from './command.js';
+import { commandGroup, type SubcommandPart } from './command-group.js';
+import type { ComponentHandler, Guard, SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
 import { InteractionRouter, STALE_COMPONENT } from './router.js';
 
 const asInteraction = (fake: unknown) => fake as Interaction;
 
-function command(overrides: Partial<CommandModule> = {}): CommandModule {
+function command(overrides: Partial<SimpleCommand> = {}): SimpleCommand {
   return {
     data: { name: 'test', toJSON: () => ({ name: 'test', description: 'Test' }) },
     help: { category: 'util' },
@@ -21,6 +27,26 @@ function command(overrides: Partial<CommandModule> = {}): CommandModule {
   };
 }
 
+function part(name: string, extra: Partial<SubcommandPart> = {}): SubcommandPart {
+  return {
+    data: new SlashCommandSubcommandBuilder().setName(name).setDescription(name),
+    execute: vi.fn(() => Promise.resolve()),
+    ...extra,
+  };
+}
+
+function gym(parts: SubcommandPart[], guards?: Guard[]) {
+  return commandGroup({
+    data: new SlashCommandBuilder().setName('gym').setDescription('Gyms'),
+    help: { category: 'admin' },
+    ...(guards ? { guards } : {}),
+    ...(parts.some((p) => p.group) ? { groups: { queue: 'The import queue' } } : {}),
+    parts,
+  });
+}
+
+const ran = () => vi.fn(() => Promise.resolve());
+
 describe('InteractionRouter', () => {
   it('runs guards then the command', async () => {
     const { ctx } = createTestContext();
@@ -94,14 +120,142 @@ describe('InteractionRouter', () => {
     expect(entries.some((e) => e.msg === 'could not send error reply')).toBe(true);
   });
 
-  it('answers an unknown command', async () => {
-    const { ctx } = createTestContext();
+  it('answers an unknown command and logs a warning', async () => {
+    const { ctx, entries } = createTestContext();
     const i = fakeChatInput({ commandName: 'gone' });
     await new InteractionRouter(ctx, [], []).handle(asInteraction(i));
     expect(i.reply).toHaveBeenCalledWith({
       content: 'That command is not available.',
       flags: MessageFlags.Ephemeral,
     });
+    expect(entries.find((e) => e.msg === 'no handler for command')).toMatchObject({
+      level: 40,
+      interaction: { command: 'gone' },
+    });
+  });
+
+  it('runs the subcommand that was used, alone and inside a group', async () => {
+    const { ctx } = createTestContext();
+    const [create, show] = [ran(), ran()];
+    const router = new InteractionRouter(
+      ctx,
+      [gym([part('create', { execute: create }), part('show', { group: 'queue', execute: show })])],
+      [],
+    );
+
+    await router.handle(asInteraction(fakeChatInput({ commandName: 'gym', subcommand: 'create' })));
+    expect(create).toHaveBeenCalledTimes(1);
+    expect(show).not.toHaveBeenCalled();
+
+    await router.handle(
+      asInteraction(
+        fakeChatInput({ commandName: 'gym', subcommandGroup: 'queue', subcommand: 'show' }),
+      ),
+    );
+    expect(show).toHaveBeenCalledTimes(1);
+    expect(create).toHaveBeenCalledTimes(1);
+  });
+
+  it('runs the guards of the command, then those of the subcommand, then the subcommand', async () => {
+    const { ctx } = createTestContext();
+    const order: string[] = [];
+    const create = part('create', {
+      guards: [() => void order.push('create guard')],
+      execute: vi.fn(() => {
+        order.push('create');
+        return Promise.resolve();
+      }),
+    });
+    const remove = part('delete', { guards: [() => void order.push('delete guard')] });
+    const router = new InteractionRouter(
+      ctx,
+      [gym([create, remove], [() => void order.push('gym guard')])],
+      [],
+    );
+    await router.handle(asInteraction(fakeChatInput({ commandName: 'gym', subcommand: 'create' })));
+    expect(order).toEqual(['gym guard', 'create guard', 'create']);
+  });
+
+  it('does not run a subcommand whose own guard refuses', async () => {
+    const { ctx } = createTestContext();
+    const removed = ran();
+    const create = part('create');
+    const remove = part('delete', {
+      execute: removed,
+      guards: [
+        () => {
+          throw new UserError('Only admins and moderators can do that.');
+        },
+      ],
+    });
+    const router = new InteractionRouter(ctx, [gym([create, remove])], []);
+    const i = fakeChatInput({ commandName: 'gym', subcommand: 'delete' });
+    await router.handle(asInteraction(i));
+    expect(removed).not.toHaveBeenCalled();
+    expect(i.reply).toHaveBeenCalledWith({
+      content: 'Only admins and moderators can do that.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('answers a subcommand it does not know (the deployed commands are out of date)', async () => {
+    const { ctx, entries } = createTestContext();
+    const router = new InteractionRouter(ctx, [gym([part('create')])], []);
+    const i = fakeChatInput({ commandName: 'gym', subcommand: 'rename' });
+    await router.handle(asInteraction(i));
+    expect(i.reply).toHaveBeenCalledWith({
+      content: 'That command is not available.',
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(entries.find((e) => e.msg === 'no handler for command')).toMatchObject({
+      interaction: { command: 'gym', subcommand: 'rename' },
+    });
+  });
+
+  it('sends autocomplete to the subcommand being typed', async () => {
+    const { ctx } = createTestContext();
+    const editChoices = vi.fn(() => Promise.resolve());
+    const router = new InteractionRouter(
+      ctx,
+      [gym([part('create'), part('edit', { autocomplete: editChoices })])],
+      [],
+    );
+    await router.handle(
+      asInteraction(fakeAutocomplete({ commandName: 'gym', subcommand: 'edit' })),
+    );
+    expect(editChoices).toHaveBeenCalledTimes(1);
+
+    const none = fakeAutocomplete({ commandName: 'gym', subcommand: 'create' });
+    await router.handle(asInteraction(none));
+    expect(none.respond).toHaveBeenCalledWith([]);
+  });
+
+  it('responds with no choices for a command without autocomplete', async () => {
+    const { ctx } = createTestContext();
+    const i = fakeAutocomplete();
+    await new InteractionRouter(ctx, [command()], []).handle(asInteraction(i));
+    expect(i.respond).toHaveBeenCalledWith([]);
+  });
+
+  it('refuses at construction a command whose definition and handlers disagree', () => {
+    const { ctx } = createTestContext();
+    const grouped = gym([part('create')]);
+    const missingHandler = { ...grouped, subcommands: new Map() };
+    expect(() => new InteractionRouter(ctx, [missingHandler], [])).toThrow(
+      '/gym declares the subcommands [create] but handles []',
+    );
+    const extraHandler = {
+      ...grouped,
+      subcommands: new Map([...grouped.subcommands, ['edit', part('edit')]]),
+    };
+    expect(() => new InteractionRouter(ctx, [extraHandler], [])).toThrow(
+      '/gym declares the subcommands [create] but handles [create, edit]',
+    );
+    // A command that declares subcommands needs a handler for each, not one `execute`.
+    const simple = command({ data: grouped.data });
+    expect(() => new InteractionRouter(ctx, [simple], [])).toThrow(
+      '/gym declares the subcommands [create] but handles []',
+    );
   });
 
   it('routes components by custom-id kind', async () => {
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run --project unit src/discord/command-group.test.ts src/discord/router.test.ts`
Expected: FAIL (`./command-group.js` does not exist).

- [ ] **Step 4: The contract**

Replace `src/discord/command.ts` with:

```ts
import {
  ApplicationCommandOptionType,
  type APIApplicationCommandOption,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';
import type { AppContext } from '../app-context.js';
import type { CustomId } from './custom-id.js';

export type GuardableInteraction =
  ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

/** A precondition. Throw a UserError to refuse; return normally to allow. */
export type Guard = (interaction: GuardableInteraction, ctx: AppContext) => void | Promise<void>;

export interface CommandHelp {
  /** Help category id, e.g. 'basic-raid'. Categories outside settings.helpGroups are staff-only. */
  category: string;
  details?: string;
  examples?: string[];
}

/** What runs for one slash command, or for one subcommand of a grouped command. */
export interface CommandHandler {
  guards?: readonly Guard[];
  execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
}

/** A SlashCommandBuilder (or anything with the same shape). */
export interface CommandData {
  readonly name: string;
  toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
}

interface CommandBase {
  data: CommandData;
  help: CommandHelp;
}

/** A command without subcommands: `/join`, `/raid`. */
export interface SimpleCommand extends CommandBase, CommandHandler {
  subcommands?: undefined;
}

export interface SubcommandHandler extends CommandHandler {
  /** Shown by `/help` for this subcommand, in addition to its description. */
  help?: Pick<CommandHelp, 'details' | 'examples'>;
}

/**
 * A command made of subcommands: `/gym create`, `/admin boss add`. Build one with
 * `commandGroup` (command-group.ts), which keeps the definition and the handlers together.
 */
export interface GroupedCommand extends CommandBase {
  /** Guards for every subcommand; they run before the subcommand's own. */
  guards?: readonly Guard[];
  /** Handlers by path: `create`, or `boss add` for subcommand `add` of group `boss`. */
  subcommands: ReadonlyMap<string, SubcommandHandler>;
}

export type CommandModule = SimpleCommand | GroupedCommand;

/** The path of a subcommand as the keys of `GroupedCommand.subcommands` spell it. */
export function subcommandPath(group: string | null, subcommand: string | null): string {
  return [group, subcommand].filter(Boolean).join(' ');
}

/** The subcommand paths a command definition declares; empty for a command without any. */
export function declaredSubcommands(
  options: readonly APIApplicationCommandOption[] | undefined,
): string[] {
  return (options ?? []).flatMap((option) => {
    if (option.type === ApplicationCommandOptionType.Subcommand) return [option.name];
    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      return (option.options ?? []).map((sub) => subcommandPath(option.name, sub.name));
    }
    return [];
  });
}

/** Handles buttons, selects and modals whose custom id has this `kind`. */
export interface ComponentHandler {
  kind: string;
  guards?: readonly Guard[];
  handle(
    interaction: MessageComponentInteraction | ModalSubmitInteraction,
    id: CustomId,
    ctx: AppContext,
  ): Promise<void>;
}
```

- [ ] **Step 5: The builder**

Create `src/discord/command-group.ts`:

```ts
import {
  SlashCommandSubcommandGroupBuilder,
  type SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import {
  subcommandPath,
  type CommandHelp,
  type GroupedCommand,
  type Guard,
  type SubcommandHandler,
} from './command.js';

/** One subcommand: its definition and what runs for it, kept in one place. */
export interface SubcommandPart extends SubcommandHandler {
  /** The subcommand group it belongs to: `boss` for `/admin boss add`. */
  group?: string;
  data: SlashCommandSubcommandBuilder;
}

export interface CommandGroupDefinition {
  /** Name, description, permissions and contexts of the command; the subcommands are added. */
  data: SlashCommandBuilder;
  help: CommandHelp;
  /** Guards for every subcommand; they run before a subcommand's own. */
  guards?: readonly Guard[];
  /** Subcommand groups by name, with the description Discord shows for each. */
  groups?: Readonly<Record<string, string>>;
  parts: readonly SubcommandPart[];
}

/**
 * Builds a command of subcommands from its parts, so that a subcommand's definition and its
 * handler cannot drift apart and several files can contribute to one command (`/admin`).
 * Subcommands keep the order of `parts`; groups come after them, in the order of `groups`.
 */
export function commandGroup(definition: CommandGroupDefinition): GroupedCommand {
  const { data, help, guards, parts } = definition;
  const groups = new Map(
    Object.entries(definition.groups ?? {}).map(([name, description]) => [
      name,
      new SlashCommandSubcommandGroupBuilder().setName(name).setDescription(description),
    ]),
  );
  const used = new Set<string>();
  const subcommands = new Map<string, SubcommandHandler>();
  for (const { group = null, data: subcommand, ...handler } of parts) {
    const path = subcommandPath(group, subcommand.name);
    if (subcommands.has(path)) throw new Error(`Duplicate subcommand /${data.name} ${path}`);
    if (group === null) {
      data.addSubcommand(subcommand);
    } else {
      const builder = groups.get(group);
      if (!builder) throw new Error(`/${data.name} ${path}: no group "${group}" is defined`);
      builder.addSubcommand(subcommand);
      used.add(group);
    }
    subcommands.set(path, handler);
  }
  for (const [name, builder] of groups) {
    // Discord refuses a group without subcommands.
    if (!used.has(name)) throw new Error(`/${data.name}: group "${name}" has no subcommands`);
    data.addSubcommandGroup(builder);
  }
  if (subcommands.size === 0) throw new Error(`/${data.name} has no subcommands`);
  return { data, help, ...(guards ? { guards } : {}), subcommands };
}
```

- [ ] **Step 6: Dispatch in the router**

Apply to `src/discord/router.ts`:

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -8,7 +8,15 @@ import {
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
-import type { CommandModule, ComponentHandler, Guard, GuardableInteraction } from './command.js';
+import {
+  declaredSubcommands,
+  subcommandPath,
+  type CommandHandler,
+  type CommandModule,
+  type ComponentHandler,
+  type Guard,
+  type GuardableInteraction,
+} from './command.js';
 import { decodeCustomId } from './custom-id.js';
 import { UserError } from './errors.js';
 
@@ -37,6 +45,7 @@ export class InteractionRouter {
     for (const command of commands) {
       if (this.commands.has(command.data.name))
         throw new Error(`Duplicate command /${command.data.name}`);
+      assertHandlersMatch(command);
       this.commands.set(command.data.name, command);
     }
     for (const handler of components) {
@@ -54,18 +63,21 @@ export class InteractionRouter {
   }
 
   private async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
-    const command = this.commands.get(interaction.commandName);
+    const found = this.find(interaction);
     await this.guarded(interaction, async () => {
-      if (!command) throw new UserError(UNKNOWN_COMMAND);
-      await runGuards(command.guards, interaction, this.ctx);
-      await command.execute(interaction, this.ctx);
+      if (!found) {
+        this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
+        throw new UserError(UNKNOWN_COMMAND);
+      }
+      await runGuards(found.guards, interaction, this.ctx);
+      await found.handler.execute(interaction, this.ctx);
     });
   }
 
   private async handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
-    const command = this.commands.get(interaction.commandName);
     try {
-      if (command?.autocomplete) await command.autocomplete(interaction, this.ctx);
+      const handler = this.find(interaction)?.handler;
+      if (handler?.autocomplete) await handler.autocomplete(interaction, this.ctx);
       else await interaction.respond([]);
     } catch (err) {
       this.ctx.log.error({ err, interaction: describe(interaction) }, 'autocomplete failed');
@@ -73,6 +85,18 @@ export class InteractionRouter {
     }
   }
 
+  /** The handler of a command or of the subcommand used, with the guards that apply to it. */
+  private find(
+    interaction: ChatInputCommandInteraction | AutocompleteInteraction,
+  ): { handler: CommandHandler; guards: readonly Guard[] } | undefined {
+    const command = this.commands.get(interaction.commandName);
+    if (!command) return undefined;
+    if (!command.subcommands) return { handler: command, guards: command.guards ?? [] };
+    const handler = command.subcommands.get(subcommandOf(interaction) ?? '');
+    if (!handler) return undefined;
+    return { handler, guards: [...(command.guards ?? []), ...(handler.guards ?? [])] };
+  }
+
   private async handleComponent(
     interaction: MessageComponentInteraction | ModalSubmitInteraction,
   ): Promise<void> {
@@ -83,7 +107,7 @@ export class InteractionRouter {
         this.ctx.log.warn({ customId: interaction.customId }, 'no handler for component');
         throw new UserError(STALE_COMPONENT);
       }
-      await runGuards(handler.guards, interaction, this.ctx);
+      await runGuards(handler.guards ?? [], interaction, this.ctx);
       await handler.handle(interaction, id, this.ctx);
     });
   }
@@ -111,11 +135,32 @@ export class InteractionRouter {
 }
 
 async function runGuards(
-  guards: readonly Guard[] | undefined,
+  guards: readonly Guard[],
   interaction: GuardableInteraction,
   ctx: AppContext,
 ): Promise<void> {
-  for (const guard of guards ?? []) await guard(interaction, ctx);
+  for (const guard of guards) await guard(interaction, ctx);
+}
+
+/** A command whose definition and handlers disagree would fail when used; fail at start. */
+function assertHandlersMatch(command: CommandModule): void {
+  const declared = declaredSubcommands(command.data.toJSON().options).sort();
+  const handled = [...(command.subcommands?.keys() ?? [])].sort();
+  if (declared.join('\n') !== handled.join('\n')) {
+    throw new Error(
+      `/${command.data.name} declares the subcommands [${declared.join(', ')}] ` +
+        `but handles [${handled.join(', ')}]`,
+    );
+  }
+}
+
+function subcommandOf(interaction: Interaction | GuardableInteraction): string | undefined {
+  if (!interaction.isChatInputCommand() && !interaction.isAutocomplete()) return undefined;
+  const path = subcommandPath(
+    interaction.options.getSubcommandGroup(false),
+    interaction.options.getSubcommand(false),
+  );
+  return path === '' ? undefined : path;
 }
 
 function describe(interaction: Interaction | GuardableInteraction) {
@@ -126,6 +171,7 @@ function describe(interaction: Interaction | GuardableInteraction) {
     guild: interaction.guildId,
     channel: interaction.channelId,
     command: 'commandName' in interaction ? interaction.commandName : undefined,
+    subcommand: subcommandOf(interaction),
     customId: 'customId' in interaction ? interaction.customId : undefined,
   };
 }
```

- [ ] **Step 7: `/help` is a simple command**

```diff
--- a/src/commands/util/help.ts
+++ b/src/commands/util/help.ts
@@ -1,12 +1,12 @@
 import { MessageFlags, SlashCommandBuilder } from 'discord.js';
-import type { CommandModule } from '../../discord/command.js';
+import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { isBotManagement, memberRoleNames } from '../../discord/guards.js';
 import { renderCommandHelp, renderHelpOverview } from './help-render.js';
 
 const MAX_CHOICES = 25;
 
-export const help: CommandModule = {
+export const help: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('help')
     .setDescription('Show what Professor Pine can do')
```

- [ ] **Step 8: Check and commit**

Run: `npx prettier --write src/discord/command.ts src/discord/command-group.ts src/discord/command-group.test.ts src/discord/router.ts src/discord/router.test.ts src/commands/util/help.ts`, then `npm run check`.
Expected: green; 791 unit tests.

```bash
git add src/discord/command.ts src/discord/command-group.ts src/discord/command-group.test.ts src/discord/router.ts src/discord/router.test.ts src/commands/util/help.ts
git commit -m "Subcommands: commandGroup builds a command from parts, the router dispatches by path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Deferral, throttles and private errors

**Files:**
- Create: `src/discord/throttle.ts`, `src/discord/throttle.test.ts`
- Modify: `src/discord/command.ts`, `src/discord/router.ts`, `src/discord/router.test.ts`

**Interfaces:**
- Consumes: `CommandHandler`, `commandGroup` (Task 2); the fakes' `deferReply`, `editReply`, `deleteReply`, `ephemeral` (Task 1).
- Produces:
  - `Throttle { uses: number; perSeconds: number }`, `class Throttles { use(command, userId, throttle, now): number | undefined; readonly size }`, `waitText(seconds): string`
  - `CommandHandler.defer?: 'ephemeral' | 'public'` and `CommandHandler.throttle?: Throttle`
  - `new InteractionRouter(ctx, commands, components, options?: { now?: () => number })`
  - `replyEphemeral(interaction, content)` removes a pending public "thinking…" message before it follows up.
  - A throttled member gets `You can use /<name> again in <waitText>.`, where `<name>` is `raid` or `gym create`.

- [ ] **Step 1: Write the throttle tests**

Create `src/discord/throttle.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Throttles, waitText } from './throttle.js';

const RAID = { uses: 3, perSeconds: 900 };
const ALICE = '700000000000000001';
const BOB = '700000000000000002';
const T0 = 1_800_000_000_000;

describe('Throttles', () => {
  it('allows the configured number of uses, then says how long to wait', () => {
    const throttles = new Throttles();
    expect(throttles.use('raid', ALICE, RAID, T0)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 1_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 2_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 3_000)).toBe(897);
    // A refused use does not extend the wait.
    expect(throttles.use('raid', ALICE, RAID, T0 + 899_001)).toBe(1);
  });

  it('opens a new window once the old one has closed', () => {
    const throttles = new Throttles();
    for (let i = 0; i < 3; i++) throttles.use('raid', ALICE, RAID, T0);
    expect(throttles.use('raid', ALICE, RAID, T0 + 899_999)).toBe(1);
    expect(throttles.use('raid', ALICE, RAID, T0 + 900_000)).toBeUndefined();
    expect(throttles.use('raid', ALICE, RAID, T0 + 900_001)).toBeUndefined();
  });

  it('counts each member and each command separately', () => {
    const throttles = new Throttles();
    const once = { uses: 1, perSeconds: 60 };
    expect(throttles.use('shout', ALICE, once, T0)).toBeUndefined();
    expect(throttles.use('shout', BOB, once, T0)).toBeUndefined();
    expect(throttles.use('request', ALICE, once, T0)).toBeUndefined();
    expect(throttles.use('gym create', ALICE, once, T0)).toBeUndefined();
    expect(throttles.use('shout', ALICE, once, T0)).toBe(60);
  });

  it('forgets closed windows when it holds many', () => {
    const throttles = new Throttles();
    const once = { uses: 1, perSeconds: 60 };
    for (let i = 0; i < 5_000; i++) throttles.use('shout', String(i), once, T0);
    expect(throttles.size).toBe(5_000);
    throttles.use('shout', ALICE, once, T0 + 60_000);
    expect(throttles.size).toBe(1);
  });
});

describe('waitText', () => {
  it('speaks in seconds under a minute and in whole minutes above, rounded up', () => {
    expect(waitText(1)).toBe('1 second');
    expect(waitText(45)).toBe('45 seconds');
    expect(waitText(60)).toBe('1 minute');
    expect(waitText(61)).toBe('2 minutes');
    expect(waitText(897)).toBe('15 minutes');
  });
});
```

- [ ] **Step 2: Add the router tests**

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -117,7 +117,195 @@ describe('InteractionRouter', () => {
     await expect(
       new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i)),
     ).resolves.toBeUndefined();
-    expect(entries.some((e) => e.msg === 'could not send error reply')).toBe(true);
+    const failed = entries.find((e) => e.msg === 'interaction failed');
+    expect(entries.find((e) => e.msg === 'could not send error reply')).toMatchObject({
+      level: 40,
+      ref: failed?.ref,
+      interaction: { command: 'test', user: '700000000000000001' },
+    });
+  });
+
+  it('uses followUp when the command had already answered', async () => {
+    const { ctx } = createTestContext();
+    const cmd = command({
+      execute: async (interaction) => {
+        await interaction.reply({ content: 'Working on it.' });
+        throw new UserError('That gym is in another region.');
+      },
+    });
+    const i = fakeChatInput();
+    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
+    expect(i.deleteReply).not.toHaveBeenCalled();
+    expect(i.followUp).toHaveBeenCalledWith({
+      content: 'That gym is in another region.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('acknowledges first when the command asks for it, after the guards', async () => {
+    const { ctx } = createTestContext();
+    const order: string[] = [];
+    const cmd = (defer: 'ephemeral' | 'public') =>
+      command({
+        defer,
+        guards: [() => void order.push('guard')],
+        execute: (interaction) => {
+          order.push(interaction.deferred ? 'execute after deferral' : 'execute');
+          return Promise.resolve();
+        },
+      });
+    const hidden = fakeChatInput();
+    await new InteractionRouter(ctx, [cmd('ephemeral')], []).handle(asInteraction(hidden));
+    expect(order).toEqual(['guard', 'execute after deferral']);
+    expect(hidden.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+
+    const open = fakeChatInput();
+    await new InteractionRouter(ctx, [cmd('public')], []).handle(asInteraction(open));
+    expect(open.deferReply).toHaveBeenCalledWith({});
+    expect(open.ephemeral).toBe(false);
+  });
+
+  it('does not acknowledge a command that a guard refuses', async () => {
+    const { ctx } = createTestContext();
+    const cmd = command({
+      defer: 'public',
+      guards: [
+        () => {
+          throw new UserError('Use this in a raid post.');
+        },
+      ],
+    });
+    const i = fakeChatInput();
+    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
+    expect(i.deferReply).not.toHaveBeenCalled();
+    expect(i.reply).toHaveBeenCalledWith({
+      content: 'Use this in a raid post.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('keeps an error private after a public deferral by removing the "thinking" message', async () => {
+    const { ctx } = createTestContext();
+    const cmd = command({
+      defer: 'public',
+      execute: () => Promise.reject(new UserError('There is already a raid at that gym.')),
+    });
+    const i = fakeChatInput();
+    const order: string[] = [];
+    i.deleteReply.mockImplementation(() => {
+      order.push('delete');
+      return Promise.resolve();
+    });
+    i.followUp.mockImplementation(() => {
+      order.push('followUp');
+      return Promise.resolve();
+    });
+    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
+    expect(order).toEqual(['delete', 'followUp']);
+    expect(i.followUp).toHaveBeenCalledWith({
+      content: 'There is already a raid at that gym.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('leaves the answer alone when the error comes after it, or the deferral was private', async () => {
+    const { ctx } = createTestContext();
+    const answered = command({
+      defer: 'public',
+      execute: async (interaction) => {
+        await interaction.editReply({ content: 'Raid created.' });
+        throw new Error('boom');
+      },
+    });
+    const i = fakeChatInput();
+    await new InteractionRouter(ctx, [answered], []).handle(asInteraction(i));
+    expect(i.deleteReply).not.toHaveBeenCalled();
+    expect(i.followUp).toHaveBeenCalledTimes(1);
+
+    const hidden = command({
+      defer: 'ephemeral',
+      execute: () => Promise.reject(new UserError('No such gym.')),
+    });
+    const j = fakeChatInput();
+    await new InteractionRouter(ctx, [hidden], []).handle(asInteraction(j));
+    expect(j.deleteReply).not.toHaveBeenCalled();
+    expect(j.followUp).toHaveBeenCalledWith({
+      content: 'No such gym.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('refuses a member who uses a throttled command too often, until the window closes', async () => {
+    const { ctx } = createTestContext();
+    let now = 1_800_000_000_000;
+    const execute = ran();
+    const cmd = command({ throttle: { uses: 2, perSeconds: 180 }, execute });
+    const router = new InteractionRouter(ctx, [cmd], [], { now: () => now });
+    const use = async (userId?: string) => {
+      const i = fakeChatInput(userId ? { userId } : {});
+      await router.handle(asInteraction(i));
+      return i;
+    };
+
+    await use();
+    await use();
+    now += 30_000;
+    const third = await use();
+    expect(execute).toHaveBeenCalledTimes(2);
+    expect(third.reply).toHaveBeenCalledWith({
+      content: 'You can use /test again in 3 minutes.',
+      flags: MessageFlags.Ephemeral,
+    });
+
+    await use('700000000000000002');
+    expect(execute).toHaveBeenCalledTimes(3);
+
+    now += 150_000;
+    await use();
+    expect(execute).toHaveBeenCalledTimes(4);
+  });
+
+  it('does not count a use that a guard refused, and throttles subcommands separately', async () => {
+    const { ctx } = createTestContext();
+    let allowed = false;
+    const [create, remove] = [ran(), ran()];
+    const once = { uses: 1, perSeconds: 60 };
+    const router = new InteractionRouter(
+      ctx,
+      [
+        gym([
+          part('create', {
+            throttle: once,
+            execute: create,
+            guards: [
+              () => {
+                if (!allowed) throw new UserError('Not here.');
+              },
+            ],
+          }),
+          part('delete', { throttle: once, execute: remove }),
+        ]),
+      ],
+      [],
+      { now: () => 1_800_000_000_000 },
+    );
+    const use = async (subcommand: string) => {
+      const i = fakeChatInput({ commandName: 'gym', subcommand });
+      await router.handle(asInteraction(i));
+      return i;
+    };
+
+    await use('create');
+    allowed = true;
+    await use('create');
+    expect(create).toHaveBeenCalledTimes(1);
+    await use('delete');
+    expect(remove).toHaveBeenCalledTimes(1);
+    const again = await use('create');
+    expect(again.reply).toHaveBeenCalledWith({
+      content: 'You can use /gym create again in 1 minute.',
+      flags: MessageFlags.Ephemeral,
+    });
   });
 
   it('answers an unknown command and logs a warning', async () => {
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run --project unit src/discord/throttle.test.ts src/discord/router.test.ts`
Expected: FAIL (`./throttle.js` does not exist; `defer` and `throttle` are not properties of a command).

- [ ] **Step 4: The throttles**

Create `src/discord/throttle.ts`:

```ts
/** At most `uses` runs per member within `perSeconds` seconds. */
export interface Throttle {
  uses: number;
  perSeconds: number;
}

const PRUNE_ABOVE = 5_000;

/**
 * Counts how often each member used each throttled command. The window opens with a member's
 * first use and closes `perSeconds` later, as the legacy bot counted. Kept in memory only: a
 * restart forgets it.
 */
export class Throttles {
  private readonly windows = new Map<string, { opened: number; closes: number; uses: number }>();

  /**
   * Records one use at time `now` (epoch milliseconds). Answers undefined when it is allowed,
   * or the number of seconds until the member may use the command again.
   */
  use(command: string, userId: string, throttle: Throttle, now: number): number | undefined {
    const key = `${command}\n${userId}`;
    const window = this.windows.get(key);
    if (!window || now >= window.closes) {
      if (this.windows.size >= PRUNE_ABOVE) this.prune(now);
      this.windows.set(key, { opened: now, closes: now + throttle.perSeconds * 1000, uses: 1 });
      return undefined;
    }
    if (window.uses < throttle.uses) {
      window.uses += 1;
      return undefined;
    }
    return Math.ceil((window.closes - now) / 1000);
  }

  /** How many members' windows are held; for tests. */
  get size(): number {
    return this.windows.size;
  }

  private prune(now: number): void {
    for (const [key, window] of this.windows) if (now >= window.closes) this.windows.delete(key);
  }
}

/** "45 seconds", "1 minute", "12 minutes": how long a member has to wait, rounded up. */
export function waitText(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? '1 second' : `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}
```

- [ ] **Step 5: The two handler options**

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -9,6 +9,7 @@ import {
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import type { CustomId } from './custom-id.js';
+import type { Throttle } from './throttle.js';
 
 export type GuardableInteraction =
   ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;
@@ -26,6 +27,15 @@ export interface CommandHelp {
 /** What runs for one slash command, or for one subcommand of a grouped command. */
 export interface CommandHandler {
   guards?: readonly Guard[];
+  /**
+   * Set this when `execute` may take more than two seconds (Discord allows three for the first
+   * answer). The router then acknowledges before `execute` runs, and `execute` answers with
+   * `editReply`. `public` shows "thinking…" to everyone and the answer is public; `ephemeral`
+   * shows both to the member only. A command that opens a modal must not defer.
+   */
+  defer?: 'ephemeral' | 'public';
+  /** How often one member may use this. A use counts once the guards have let it through. */
+  throttle?: Throttle;
   execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
   autocomplete?(interaction: AutocompleteInteraction, ctx: AppContext): Promise<void>;
 }
```

- [ ] **Step 6: The router**

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -19,29 +19,48 @@ import {
 } from './command.js';
 import { decodeCustomId } from './custom-id.js';
 import { UserError } from './errors.js';
+import { Throttles, waitText } from './throttle.js';
 
 export const STALE_COMPONENT = 'This control is no longer active.';
 const UNKNOWN_COMMAND = 'That command is not available.';
 const genericError = (ref: string) => `Something went wrong (ref \`${ref}\`).`;
 
+/**
+ * Tells the member something only they can see, whatever was sent before. After a public
+ * deferral with no answer yet, the "thinking…" message is removed first: the first follow-up
+ * would take its place and be as public as the deferral.
+ */
 export async function replyEphemeral(
   interaction: GuardableInteraction,
   content: string,
 ): Promise<void> {
   const payload = { content, flags: MessageFlags.Ephemeral } as const;
-  if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
-  else await interaction.reply(payload);
+  if (!interaction.deferred && !interaction.replied) {
+    await interaction.reply(payload);
+    return;
+  }
+  if (!interaction.replied && interaction.ephemeral === false) await interaction.deleteReply();
+  await interaction.followUp(payload);
+}
+
+export interface RouterOptions {
+  /** The clock the throttles use; epoch milliseconds. */
+  now?: () => number;
 }
 
 export class InteractionRouter {
   private readonly commands = new Map<string, CommandModule>();
   private readonly components = new Map<string, ComponentHandler>();
+  private readonly throttles = new Throttles();
+  private readonly now: () => number;
 
   constructor(
     private readonly ctx: AppContext,
     commands: readonly CommandModule[],
     components: readonly ComponentHandler[],
+    options: RouterOptions = {},
   ) {
+    this.now = options.now ?? Date.now;
     for (const command of commands) {
       if (this.commands.has(command.data.name))
         throw new Error(`Duplicate command /${command.data.name}`);
@@ -69,8 +88,20 @@ export class InteractionRouter {
         this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
         throw new UserError(UNKNOWN_COMMAND);
       }
+      const { handler, name } = found;
       await runGuards(found.guards, interaction, this.ctx);
-      await found.handler.execute(interaction, this.ctx);
+      if (handler.throttle) {
+        const wait = this.throttles.use(name, interaction.user.id, handler.throttle, this.now());
+        if (wait !== undefined) {
+          throw new UserError(`You can use /${name} again in ${waitText(wait)}.`);
+        }
+      }
+      if (handler.defer) {
+        await interaction.deferReply(
+          handler.defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {},
+        );
+      }
+      await handler.execute(interaction, this.ctx);
     });
   }
 
@@ -85,16 +116,25 @@ export class InteractionRouter {
     }
   }
 
-  /** The handler of a command or of the subcommand used, with the guards that apply to it. */
+  /**
+   * The handler of a command or of the subcommand used, with the guards that apply to it and
+   * its name as a member types it (`raid`, `gym create`).
+   */
   private find(
     interaction: ChatInputCommandInteraction | AutocompleteInteraction,
-  ): { handler: CommandHandler; guards: readonly Guard[] } | undefined {
+  ): { handler: CommandHandler; guards: readonly Guard[]; name: string } | undefined {
     const command = this.commands.get(interaction.commandName);
     if (!command) return undefined;
-    if (!command.subcommands) return { handler: command, guards: command.guards ?? [] };
-    const handler = command.subcommands.get(subcommandOf(interaction) ?? '');
+    const name = command.data.name;
+    if (!command.subcommands) return { handler: command, guards: command.guards ?? [], name };
+    const path = subcommandOf(interaction) ?? '';
+    const handler = command.subcommands.get(path);
     if (!handler) return undefined;
-    return { handler, guards: [...(command.guards ?? []), ...(handler.guards ?? [])] };
+    return {
+      handler,
+      guards: [...(command.guards ?? []), ...(handler.guards ?? [])],
+      name: `${name} ${path}`,
+    };
   }
 
   private async handleComponent(
@@ -120,15 +160,19 @@ export class InteractionRouter {
       await run();
     } catch (err) {
       let content: string;
+      let ref: string | undefined;
       if (err instanceof UserError) {
         content = err.message;
       } else {
-        const ref = randomBytes(3).toString('hex');
+        ref = randomBytes(3).toString('hex');
         this.ctx.log.error({ err, ref, interaction: describe(interaction) }, 'interaction failed');
         content = genericError(ref);
       }
       await replyEphemeral(interaction, content).catch((replyErr: unknown) =>
-        this.ctx.log.warn({ err: replyErr }, 'could not send error reply'),
+        this.ctx.log.warn(
+          { err: replyErr, ref, interaction: describe(interaction) },
+          'could not send error reply',
+        ),
       );
     }
   }
```

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write src/discord/throttle.ts src/discord/throttle.test.ts src/discord/command.ts src/discord/router.ts src/discord/router.test.ts`, then `npm run check`.
Expected: green; 803 unit tests.

```bash
git add src/discord/throttle.ts src/discord/throttle.test.ts src/discord/command.ts src/discord/router.ts src/discord/router.test.ts
git commit -m "Router: acknowledges for a handler that asks, throttles per member, keeps errors private

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Typed component handlers

**Files:**
- Create: `src/components/index.ts`
- Modify: `src/discord/command.ts`, `src/discord/router.ts`, `src/discord/router.test.ts`, `src/discord/custom-id.test.ts`, `src/app.ts`

**Interfaces:**
- Consumes: `fakeButton`, `fakeSelect`, `fakeModal` (Task 1); the router of Task 3.
- Produces:
  - `ComponentHandler { kind; guards?; button?: (interaction: ButtonInteraction, id: CustomId, ctx) => Promise<void>; select?: (interaction: AnySelectMenuInteraction, id, ctx) => Promise<void>; modal?: (interaction: ModalSubmitInteraction, id, ctx) => Promise<void> }`. The three are properties holding functions, not methods.
  - `components: readonly ComponentHandler[]` in `src/components/index.ts`, read by `src/app.ts`.
  - The router logs `no handler for component` (warn) with `interaction.customId`.

- [ ] **Step 1: Change and add the tests**

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -9,6 +9,8 @@ import {
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeModal,
+  fakeSelect,
 } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { commandGroup, type SubcommandPart } from './command-group.js';
@@ -446,18 +448,110 @@ describe('InteractionRouter', () => {
     );
   });
 
-  it('routes components by custom-id kind', async () => {
+  it('routes a button, a select menu and a modal to the handler of their kind', async () => {
     const { ctx } = createTestContext();
-    const handle = vi.fn(() => Promise.resolve());
-    const handler: ComponentHandler = { kind: 'p', handle };
-    await new InteractionRouter(ctx, [], [handler]).handle(
-      asInteraction(fakeButton({ customId: 'p:abc:join' })),
+    const [button, select, modal, other] = [ran(), ran(), ran(), ran()];
+    const router = new InteractionRouter(
+      ctx,
+      [],
+      [
+        { kind: 'p', button, select, modal },
+        { kind: 'dm', button: other },
+      ],
     );
-    expect(handle).toHaveBeenCalledWith(
-      expect.anything(),
+
+    const click = fakeButton({ customId: 'p:abc:join' });
+    await router.handle(asInteraction(click));
+    expect(button).toHaveBeenCalledWith(
+      click,
       { kind: 'p', id: 'abc', action: 'join', args: [] },
       ctx,
     );
+
+    const choice = fakeSelect({ customId: 'p:abc:group', values: ['B'] });
+    await router.handle(asInteraction(choice));
+    expect(select).toHaveBeenCalledWith(
+      choice,
+      { kind: 'p', id: 'abc', action: 'group', args: [] },
+      ctx,
+    );
+
+    const form = fakeModal({ customId: 'p:abc:time:hatch', fields: { time: '6pm' } });
+    await router.handle(asInteraction(form));
+    expect(modal).toHaveBeenCalledWith(
+      form,
+      { kind: 'p', id: 'abc', action: 'time', args: ['hatch'] },
+      ctx,
+    );
+
+    expect([button, select, modal].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
+    expect(other).not.toHaveBeenCalled();
+  });
+
+  it('answers a kind of control its handler does not have as no longer active', async () => {
+    const { ctx, entries } = createTestContext();
+    const button = ran();
+    const router = new InteractionRouter(ctx, [], [{ kind: 'p', button }]);
+    const form = fakeModal({ customId: 'p:abc:time' });
+    await router.handle(asInteraction(form));
+    expect(form.reply).toHaveBeenCalledWith({
+      content: STALE_COMPONENT,
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(button).not.toHaveBeenCalled();
+    expect(entries.find((e) => e.msg === 'no handler for component')).toMatchObject({
+      level: 40,
+      interaction: { customId: 'p:abc:time' },
+    });
+  });
+
+  it('runs the guards of a component handler before it', async () => {
+    const { ctx } = createTestContext();
+    const button = ran();
+    const refuse: Guard = () => {
+      throw new UserError('This only works in a server.');
+    };
+    const router = new InteractionRouter(ctx, [], [{ kind: 'p', guards: [refuse], button }]);
+    const click = fakeButton({ customId: 'p:abc:join' });
+    await router.handle(asInteraction(click));
+    expect(button).not.toHaveBeenCalled();
+    expect(click.reply).toHaveBeenCalledWith({
+      content: 'This only works in a server.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('reports an error from a component after it acknowledged, as a follow-up', async () => {
+    const { ctx } = createTestContext();
+    const handler: ComponentHandler = {
+      kind: 'p',
+      button: async (interaction) => {
+        await interaction.deferUpdate();
+        throw new UserError('This raid has ended.');
+      },
+    };
+    const click = fakeButton({ customId: 'p:abc:join' });
+    await new InteractionRouter(ctx, [], [handler]).handle(asInteraction(click));
+    expect(click.deleteReply).not.toHaveBeenCalled();
+    expect(click.followUp).toHaveBeenCalledWith({
+      content: 'This raid has ended.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('rejects duplicate component kinds at construction', () => {
+    const { ctx } = createTestContext();
+    expect(
+      () =>
+        new InteractionRouter(
+          ctx,
+          [],
+          [
+            { kind: 'p', button: ran() },
+            { kind: 'p', modal: ran() },
+          ],
+        ),
+    ).toThrow('Duplicate component kind "p"');
   });
 
   it('tells the user a legacy or unknown control is no longer active', async () => {
```

Apply to `src/discord/custom-id.test.ts` (no change to `custom-id.ts`: these pin what it already does):

```diff
--- a/src/discord/custom-id.test.ts
+++ b/src/discord/custom-id.test.ts
@@ -33,6 +33,43 @@ describe('custom ids', () => {
     ).toThrow(/100/);
   });
 
+  it('accepts exactly 100 characters and refuses 101', () => {
+    // "p:" + id + ":join" is 7 characters plus the id.
+    const fits = encodeCustomId({ kind: 'p', id: 'x'.repeat(93), action: 'join' });
+    expect(fits).toHaveLength(MAX_CUSTOM_ID_LENGTH);
+    expect(decodeCustomId(fits)?.id).toHaveLength(93);
+    expect(() => encodeCustomId({ kind: 'p', id: 'x'.repeat(94), action: 'join' })).toThrow(
+      'custom id is 101 characters; Discord allows 100',
+    );
+  });
+
+  it('rejects an empty argument or one containing the separator', () => {
+    expect(() => encodeCustomId({ kind: 'p', id: PARTY, action: 'group', args: [''] })).toThrow(
+      /empty/,
+    );
+    expect(() => encodeCustomId({ kind: 'p', id: PARTY, action: 'group', args: ['a:b'] })).toThrow(
+      /":"/,
+    );
+    expect(() => encodeCustomId({ kind: '', id: PARTY, action: 'join' })).toThrow(/empty/);
+    expect(() => encodeCustomId({ kind: 'p', id: PARTY, action: 'jo:in' })).toThrow(/":"/);
+  });
+
+  it('keeps several arguments in order', () => {
+    const raw = encodeCustomId({
+      kind: 'dm',
+      id: 'stop',
+      action: 'pokemon',
+      args: ['150', 'raid'],
+    });
+    expect(decodeCustomId(raw)?.args).toEqual(['150', 'raid']);
+  });
+
+  it('returns undefined for an id with an empty argument', () => {
+    expect(decodeCustomId('p:abc:group:')).toBeUndefined();
+    expect(decodeCustomId('p:abc:group::B')).toBeUndefined();
+    expect(decodeCustomId('')).toBeUndefined();
+  });
+
   it('returns undefined for malformed or legacy ids', () => {
     expect(decodeCustomId('join')).toBeUndefined();
     expect(decodeCustomId('p:only-two')).toBeUndefined();
```

- [ ] **Step 2: Run them and see the router tests fail**

Run: `npx vitest run --project unit src/discord/router.test.ts src/discord/custom-id.test.ts`
Expected: the custom-id tests pass; the router tests FAIL to typecheck or run (`button` is not a property of `ComponentHandler`).

- [ ] **Step 3: The handler type**

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -1,7 +1,9 @@
 import {
   ApplicationCommandOptionType,
+  type AnySelectMenuInteraction,
   type APIApplicationCommandOption,
   type AutocompleteInteraction,
+  type ButtonInteraction,
   type ChatInputCommandInteraction,
   type MessageComponentInteraction,
   type ModalSubmitInteraction,
@@ -92,13 +94,15 @@ export function declaredSubcommands(
   });
 }
 
-/** Handles buttons, selects and modals whose custom id has this `kind`. */
+/**
+ * Handles the buttons, select menus and modals whose custom id has this `kind`. A handler
+ * implements only what it puts on screen; anything else with its kind is answered as a control
+ * that is no longer active. List every handler in `src/components/index.ts`.
+ */
 export interface ComponentHandler {
   kind: string;
   guards?: readonly Guard[];
-  handle(
-    interaction: MessageComponentInteraction | ModalSubmitInteraction,
-    id: CustomId,
-    ctx: AppContext,
-  ): Promise<void>;
+  button?: (interaction: ButtonInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
+  select?: (interaction: AnySelectMenuInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
+  modal?: (interaction: ModalSubmitInteraction, id: CustomId, ctx: AppContext) => Promise<void>;
 }
```

- [ ] **Step 4: The router**

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -17,7 +17,7 @@ import {
   type Guard,
   type GuardableInteraction,
 } from './command.js';
-import { decodeCustomId } from './custom-id.js';
+import { decodeCustomId, type CustomId } from './custom-id.js';
 import { UserError } from './errors.js';
 import { Throttles, waitText } from './throttle.js';
 
@@ -143,12 +143,13 @@ export class InteractionRouter {
     const id = decodeCustomId(interaction.customId);
     const handler = id ? this.components.get(id.kind) : undefined;
     await this.guarded(interaction, async () => {
-      if (!id || !handler) {
-        this.ctx.log.warn({ customId: interaction.customId }, 'no handler for component');
+      const run = id && handler ? runnerFor(handler, interaction, id, this.ctx) : undefined;
+      if (!handler || !run) {
+        this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for component');
         throw new UserError(STALE_COMPONENT);
       }
       await runGuards(handler.guards ?? [], interaction, this.ctx);
-      await handler.handle(interaction, id, this.ctx);
+      await run();
     });
   }
 
@@ -178,6 +179,20 @@ export class InteractionRouter {
   }
 }
 
+/** What the handler does with this kind of control; undefined when it has nothing for it. */
+function runnerFor(
+  handler: ComponentHandler,
+  interaction: MessageComponentInteraction | ModalSubmitInteraction,
+  id: CustomId,
+  ctx: AppContext,
+): (() => Promise<void>) | undefined {
+  const { button, select, modal } = handler;
+  if (interaction.isModalSubmit()) return modal && (() => modal(interaction, id, ctx));
+  if (interaction.isButton()) return button && (() => button(interaction, id, ctx));
+  if (interaction.isAnySelectMenu()) return select && (() => select(interaction, id, ctx));
+  return undefined;
+}
+
 async function runGuards(
   guards: readonly Guard[],
   interaction: GuardableInteraction,
```

- [ ] **Step 5: The list of handlers**

Create `src/components/index.ts`:

```ts
import type { ComponentHandler } from '../discord/command.js';

/** Every handler of buttons, select menus and modals. The router reads this list. */
export const components: readonly ComponentHandler[] = [];
```

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,6 +1,7 @@
 import { Events } from 'discord.js';
 import type { AppContext } from './app-context.js';
 import { commands } from './commands/index.js';
+import { components } from './components/index.js';
 import { loadConfig } from './config/index.js';
 import { dbConfigFrom } from './db/db-config.js';
 import { createDb } from './db/kysely.js';
@@ -104,7 +105,7 @@ export async function startApp(
     maps,
     features: requested,
   };
-  const router = new InteractionRouter(ctx, commands, []);
+  const router = new InteractionRouter(ctx, commands, components);
   const guilds = new GuildRepository(db);
 
   const { client, features } = await loginWithFallback(requested, {
```

- [ ] **Step 6: Check and commit**

Run: `npx prettier --write src/components/index.ts src/discord/command.ts src/discord/router.ts src/discord/router.test.ts src/discord/custom-id.test.ts src/app.ts`, then `npm run check`.
Expected: green; 811 unit tests.

```bash
git add src/components/index.ts src/discord/command.ts src/discord/router.ts src/discord/router.test.ts src/discord/custom-id.test.ts src/app.ts
git commit -m "Component handlers: one typed function per button, select menu and modal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Channel context, guards, and which commands are offered where

**Files:**
- Create: `src/discord/channel-context.ts`, `src/discord/channel-context.test.ts`
- Modify: `src/discord/guards.ts`, `src/discord/guards.test.ts`, `src/discord/command.ts`, `src/discord/command-group.ts`, `src/discord/command-group.test.ts`, `src/discord/deploy.ts`, `src/discord/deploy.test.ts`, `src/discord/deploy-cli.ts`, `src/discord/client.ts`, `src/discord/client.test.ts`, `src/app.ts`, `src/commands/util/help.ts`

**Interfaces:**
- Consumes: the fakes' `thread`, `uncachedChannel`, `channelId` options (Task 1); `WEST_CHANNEL` of `test/support/gyms.ts` (a region of the test fixtures); `ctx.gyms.isRegion(channelId)`.
- Produces:
  - `channelContext(interaction): ChannelContext` with `channelId`, `baseChannelId` (undefined for an uncached channel), `name`, `categoryName`, `isThread`, `isDm`
  - `regionChannelOf(interaction, ctx): string | undefined`; guards `requireRegion`, `requireBotChannelOrRegion`
  - `CommandModule.enabled?: (config: Config) => boolean`, `enabledCommands(commands, config): CommandModule[]`, and `enabled` on `CommandGroupDefinition`
  - `buildCommandPayload` adds `contexts: [InteractionContextType.Guild]` to a command that sets none.

- [ ] **Step 1: Write the channel context tests**

Create `src/discord/channel-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  FAKE_CHANNEL_ID,
  FAKE_PARENT_ID,
  fakeButton,
  fakeChatInput,
} from '../../test/support/fake-interactions.js';
import { channelContext } from './channel-context.js';
import type { GuardableInteraction } from './command.js';

const as = (fake: unknown) => fake as GuardableInteraction;

describe('channelContext', () => {
  it('describes a text channel by itself and its category', () => {
    const context = channelContext(
      as(fakeChatInput({ channelName: 'downtown', parentName: 'RAIDS' })),
    );
    expect(context).toEqual({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: FAKE_CHANNEL_ID,
      name: 'downtown',
      categoryName: 'RAIDS',
      isThread: false,
      isDm: false,
    });
  });

  it('describes a forum post by the forum it is in and the category of that forum', () => {
    const context = channelContext(
      as(
        fakeButton({
          customId: 'p:1:join',
          channelName: 'Mewtwo · Big Fountain',
          thread: { parentName: 'downtown-raids', categoryName: 'RAIDS' },
        }),
      ),
    );
    expect(context).toEqual({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: FAKE_PARENT_ID,
      name: 'downtown-raids',
      categoryName: 'RAIDS',
      isThread: true,
      isDm: false,
    });
  });

  it('has no category for a channel outside one', () => {
    expect(channelContext(as(fakeChatInput())).categoryName).toBeUndefined();
    expect(
      channelContext(as(fakeChatInput({ thread: { parentName: 'the-bot-lab' } }))).categoryName,
    ).toBeUndefined();
  });

  it('knows only the id of a channel that is not cached (an archived post)', () => {
    expect(channelContext(as(fakeChatInput({ uncachedChannel: true })))).toEqual({
      channelId: FAKE_CHANNEL_ID,
      baseChannelId: undefined,
      name: undefined,
      categoryName: undefined,
      isThread: false,
      isDm: false,
    });
  });

  it('recognises a DM by the missing server, cached or not', () => {
    expect(channelContext(as(fakeChatInput({ isDm: true }))).isDm).toBe(true);
    expect(channelContext(as(fakeChatInput({ isDm: true, uncachedChannel: true }))).isDm).toBe(
      true,
    );
  });
});
```

- [ ] **Step 2: Add the guard, deploy, group and login tests**

```diff
--- a/src/discord/guards.test.ts
+++ b/src/discord/guards.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { fakeChatInput } from '../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { GuardableInteraction } from './command.js';
 import { UserError } from './errors.js';
@@ -8,11 +9,14 @@ import {
   isBotManagement,
   isManagement,
   isPvpContext,
+  regionChannelOf,
   requireBotChannel,
+  requireBotChannelOrRegion,
   requireBotManagement,
   requireGuild,
   requireManagement,
   requirePvpContext,
+  requireRegion,
 } from './guards.js';
 
 const OWNER = '223456789012345678'; // TEST_ENV.OWNER_ID
@@ -85,10 +89,68 @@ describe('guards', () => {
     ).not.toThrow();
   });
 
+  it('requireBotChannel also holds in a thread of the bot channel', () => {
+    const inThread = fakeChatInput({
+      channelName: 'How do I add a gym?',
+      thread: { parentName: 'the-bot-lab' },
+    });
+    expect(() => requireBotChannel(as(inThread), ctx)).not.toThrow();
+    const elsewhere = fakeChatInput({
+      channelName: 'the-bot-lab',
+      thread: { parentName: 'general' },
+    });
+    expect(() => requireBotChannel(as(elsewhere), ctx)).toThrow(UserError);
+  });
+
   it('requirePvpContext uses the parent category', () => {
     expect(() => requirePvpContext(as(fakeChatInput({ parentName: 'RAIDS' })), ctx)).toThrow(
       UserError,
     );
     expect(() => requirePvpContext(as(fakeChatInput({ isDm: true })), ctx)).not.toThrow();
+    expect(() =>
+      requirePvpContext(as(fakeChatInput({ parentName: 'PVP CHAT AND TOURNAMENTS' })), ctx),
+    ).not.toThrow();
+  });
+
+  it('requirePvpContext holds in a thread under the PvP category and in an uncached DM', () => {
+    const thread = fakeChatInput({
+      thread: { parentName: 'rank-checker', categoryName: 'PVP CHAT AND TOURNAMENTS' },
+    });
+    expect(() => requirePvpContext(as(thread), ctx)).not.toThrow();
+    expect(() =>
+      requirePvpContext(as(fakeChatInput({ isDm: true, uncachedChannel: true })), ctx),
+    ).not.toThrow();
+    expect(() => requirePvpContext(as(fakeChatInput({ uncachedChannel: true })), ctx)).toThrow(
+      UserError,
+    );
+  });
+
+  it('finds the region of a region channel and of a thread in it', () => {
+    const inChannel = fakeChatInput({ channelId: WEST_CHANNEL });
+    expect(regionChannelOf(as(inChannel), ctx)).toBe(WEST_CHANNEL);
+    const inThread = fakeChatInput({ thread: { parentId: WEST_CHANNEL } });
+    expect(regionChannelOf(as(inThread), ctx)).toBe(WEST_CHANNEL);
+    expect(regionChannelOf(as(fakeChatInput()), ctx)).toBeUndefined();
+    expect(regionChannelOf(as(fakeChatInput({ uncachedChannel: true })), ctx)).toBeUndefined();
+  });
+
+  it('requireRegion refuses anywhere else, and DMs', () => {
+    expect(() => requireRegion(as(fakeChatInput({ channelId: WEST_CHANNEL })), ctx)).not.toThrow();
+    expect(() => requireRegion(as(fakeChatInput()), ctx)).toThrow('Use this in a region channel.');
+    expect(() => requireRegion(as(fakeChatInput({ isDm: true })), ctx)).toThrow(
+      'This only works in a server.',
+    );
+  });
+
+  it('requireBotChannelOrRegion accepts either and names both otherwise', () => {
+    expect(() =>
+      requireBotChannelOrRegion(as(fakeChatInput({ channelName: 'mod-bot-only' })), ctx),
+    ).not.toThrow();
+    expect(() =>
+      requireBotChannelOrRegion(as(fakeChatInput({ channelId: WEST_CHANNEL })), ctx),
+    ).not.toThrow();
+    expect(() => requireBotChannelOrRegion(as(fakeChatInput()), ctx)).toThrow(
+      'Use this in #the-bot-lab or in a region channel.',
+    );
   });
 });
```

```diff
--- a/src/discord/deploy.test.ts
+++ b/src/discord/deploy.test.ts
@@ -1,6 +1,8 @@
+import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { createTestContext } from '../../test/support/test-context.js';
 import { commands } from '../commands/index.js';
-import type { CommandModule } from './command.js';
+import { enabledCommands, type CommandModule } from './command.js';
 import { buildCommandPayload, MAX_COMMANDS, parseDeployArgs } from './deploy.js';
 
 const stub = (name: string): CommandModule => ({
@@ -14,6 +16,24 @@ describe('buildCommandPayload', () => {
     expect(buildCommandPayload(commands).map((c) => c.name)).toContain('help');
   });
 
+  it('offers a command in servers only unless it says otherwise', () => {
+    const everywhere: CommandModule = {
+      ...stub('rank'),
+      data: new SlashCommandBuilder()
+        .setName('rank')
+        .setDescription('PvP rank')
+        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
+    };
+    const [raid, rank] = buildCommandPayload([stub('raid'), everywhere]);
+    expect(raid?.contexts).toEqual([InteractionContextType.Guild]);
+    expect(rank?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
+  });
+
+  it('offers /help in a DM with the bot as well', () => {
+    const help = buildCommandPayload(commands).find((c) => c.name === 'help');
+    expect(help?.contexts).toEqual([InteractionContextType.Guild, InteractionContextType.BotDM]);
+  });
+
   it('rejects duplicate names', () => {
     expect(() => buildCommandPayload([stub('a'), stub('a')])).toThrow(/Duplicate command \/a/);
   });
@@ -24,6 +44,26 @@ describe('buildCommandPayload', () => {
   });
 });
 
+describe('enabledCommands', () => {
+  it('leaves out a command this installation is not set up for', () => {
+    const { ctx } = createTestContext();
+    const maps: CommandModule = {
+      ...stub('maps'),
+      enabled: (config) => !!config.env.REGION_MAP_LINK,
+    };
+    const always: CommandModule = { ...stub('find'), enabled: () => true };
+    const names = (config: typeof ctx.config) =>
+      enabledCommands([stub('raid'), maps, always], config).map((c) => c.data.name);
+
+    expect(names(ctx.config)).toEqual(['raid', 'find']);
+    const withLink = {
+      ...ctx.config,
+      env: { ...ctx.config.env, REGION_MAP_LINK: 'https://x.test' },
+    };
+    expect(names(withLink)).toEqual(['raid', 'maps', 'find']);
+  });
+});
+
 describe('parseDeployArgs', () => {
   it('parses --guild <id> and --global', () => {
     expect(parseDeployArgs(['--guild', '412345678901234567'])).toEqual({
```

```diff
--- a/src/discord/command-group.test.ts
+++ b/src/discord/command-group.test.ts
@@ -60,6 +60,7 @@ describe('commandGroup', () => {
       parts: [part('sync', { guards: [here], autocomplete, help: { details: 'Reads the feed.' } })],
     });
     expect(command.guards).toEqual([everywhere]);
+    expect(command).not.toHaveProperty('enabled');
     expect(command.subcommands.get('sync')).toMatchObject({
       guards: [here],
       autocomplete,
@@ -69,6 +70,13 @@ describe('commandGroup', () => {
     expect(command.subcommands.get('sync')).not.toHaveProperty('group');
   });
 
+  it('keeps the condition under which the command is offered', () => {
+    const enabled = () => false;
+    expect(commandGroup({ data: admin(), help, enabled, parts: [part('sync')] }).enabled).toBe(
+      enabled,
+    );
+  });
+
   it('refuses a definition that Discord or the router could not use', () => {
     expect(() =>
       commandGroup({ data: admin(), help, parts: [part('sync'), part('sync')] }),
```

```diff
--- a/src/discord/client.test.ts
+++ b/src/discord/client.test.ts
@@ -53,6 +53,24 @@ describe('loginWithFallback', () => {
     expect(entries.some((e) => String(e.msg).includes('autoAssignRole'))).toBe(true);
   });
 
+  it('gives up with the refusal as the cause when nothing is accepted, without a retry line', async () => {
+    const { log, entries } = createTestLogger();
+    const { create, created } = fakeFactory(() => false);
+
+    const failure = await loginWithFallback(
+      { ocrPassive: true, autoAssignRole: false },
+      { token: 't', log, create, configure: vi.fn() },
+    ).catch((err: unknown) => err as Error);
+
+    expect(failure).toBeInstanceOf(Error);
+    expect((failure as Error).message).toBe(
+      'Discord rejected the login even without privileged intents',
+    );
+    expect((failure as Error).cause).toMatchObject({ code: 4014 });
+    expect(created).toHaveLength(2);
+    expect(entries.filter((e) => String(e.msg).includes('retrying with fewer'))).toHaveLength(1);
+  });
+
   it('rethrows errors that are not about intents', async () => {
     const { log } = createTestLogger();
     const create = () =>
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run --project unit src/discord`
Expected: FAIL (`./channel-context.js` does not exist; `regionChannelOf`, `requireRegion`, `requireBotChannelOrRegion` and `enabledCommands` are not exported).

- [ ] **Step 4: The channel context**

Create `src/discord/channel-context.ts`:

```ts
import type { GuardableInteraction } from './command.js';

/** Where an interaction happened, seen the same way from a channel and from a thread in it. */
export interface ChannelContext {
  /** The channel itself; for a thread or forum post, the thread. Null only in odd DM cases. */
  channelId: string | null;
  /**
   * The channel a thread or forum post belongs to; for any other channel, the channel itself.
   * Undefined when Discord did not tell: a thread the bot has not cached (an archived post).
   */
  baseChannelId: string | undefined;
  /** Name of the base channel. */
  name: string | undefined;
  /** Name of the category the base channel is under. */
  categoryName: string | undefined;
  isThread: boolean;
  isDm: boolean;
}

interface Named {
  id: string;
  name?: unknown;
  parent?: { name: string } | null;
}

const nameOf = (channel: Named | null | undefined): string | undefined =>
  typeof channel?.name === 'string' ? channel.name : undefined;

/**
 * A party post is a thread: its own name is the post's title and its parent is the forum, not
 * the category. Guards and commands ask this instead of reading `interaction.channel`, so that
 * "in the bot channel" and "under the PvP category" also hold inside threads of those.
 */
export function channelContext(interaction: GuardableInteraction): ChannelContext {
  const channel = interaction.channel;
  const isDm = !interaction.inGuild();
  if (!channel) {
    return {
      channelId: interaction.channelId,
      baseChannelId: undefined,
      name: undefined,
      categoryName: undefined,
      isThread: false,
      isDm,
    };
  }
  if (channel.isThread()) {
    const parent = channel.parent;
    return {
      channelId: channel.id,
      baseChannelId: channel.parentId ?? undefined,
      name: nameOf(parent),
      categoryName: parent?.parent?.name,
      isThread: true,
      isDm,
    };
  }
  return {
    channelId: channel.id,
    baseChannelId: channel.id,
    name: nameOf(channel),
    categoryName: 'parent' in channel ? channel.parent?.name : undefined,
    isThread: false,
    isDm,
  };
}
```

- [ ] **Step 5: The guards**

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,4 +1,6 @@
+import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
+import { channelContext } from './channel-context.js';
 import type { Guard, GuardableInteraction } from './command.js';
 import { UserError } from './errors.js';
 
@@ -46,19 +48,20 @@ export function memberRoleNames(interaction: GuardableInteraction): string[] {
   return interaction.member.roles.cache.map((role) => role.name);
 }
 
-function channelName(interaction: GuardableInteraction): string | undefined {
-  const channel = interaction.channel;
-  return channel && 'name' in channel && typeof channel.name === 'string'
-    ? channel.name
+/**
+ * The region an interaction happened in, as the id of the region's channel: the channel itself,
+ * or the channel a thread belongs to. Undefined anywhere else.
+ */
+export function regionChannelOf(
+  interaction: GuardableInteraction,
+  ctx: AppContext,
+): string | undefined {
+  const { baseChannelId } = channelContext(interaction);
+  return baseChannelId !== undefined && ctx.gyms.isRegion(baseChannelId)
+    ? baseChannelId
     : undefined;
 }
 
-function parentName(interaction: GuardableInteraction): string | undefined {
-  const channel = interaction.channel;
-  if (!channel || !('parent' in channel) || !channel.parent) return undefined;
-  return channel.parent.name;
-}
-
 function assertGuild(interaction: GuardableInteraction): void {
   if (!interaction.inCachedGuild()) throw new UserError('This only works in a server.');
 }
@@ -85,14 +88,33 @@ export const requireBotManagement: Guard = (interaction, ctx) => {
 
 export const requireBotChannel: Guard = (interaction, ctx) => {
   assertGuild(interaction);
-  if (!isBotChannelName(channelName(interaction), ctx.config.settings)) {
+  if (!isBotChannelName(channelContext(interaction).name, ctx.config.settings)) {
     throw new UserError(`Use this in #${ctx.config.settings.channels['bot-lab']}.`);
   }
 };
 
+export const requireRegion: Guard = (interaction, ctx) => {
+  assertGuild(interaction);
+  if (regionChannelOf(interaction, ctx) === undefined) {
+    throw new UserError('Use this in a region channel.');
+  }
+};
+
+/** For commands whose answer is public and long: gym and region administration. */
+export const requireBotChannelOrRegion: Guard = (interaction, ctx) => {
+  assertGuild(interaction);
+  const { settings } = ctx.config;
+  if (
+    !isBotChannelName(channelContext(interaction).name, settings) &&
+    regionChannelOf(interaction, ctx) === undefined
+  ) {
+    throw new UserError(`Use this in #${settings.channels['bot-lab']} or in a region channel.`);
+  }
+};
+
 export const requirePvpContext: Guard = (interaction, ctx) => {
-  const isDm = interaction.channel?.isDMBased() ?? false;
-  if (!isPvpContext({ isDm, parentName: parentName(interaction) }, ctx.config.settings)) {
+  const { isDm, categoryName } = channelContext(interaction);
+  if (!isPvpContext({ isDm, parentName: categoryName }, ctx.config.settings)) {
     throw new UserError(`Use this in a DM with me or under ${ctx.config.settings.categories.pvp}.`);
   }
 };
```

- [ ] **Step 6: `enabled`, and servers only by default**

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -10,6 +10,7 @@ import {
   type RESTPostAPIChatInputApplicationCommandsJSONBody,
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
+import type { Config } from '../config/index.js';
 import type { CustomId } from './custom-id.js';
 import type { Throttle } from './throttle.js';
 
@@ -49,8 +50,17 @@ export interface CommandData {
 }
 
 interface CommandBase {
+  /**
+   * The definition sent to Discord. A command is offered in servers only, unless its definition
+   * sets other contexts (`setContexts`), as commands that also work in a DM with the bot do.
+   */
   data: CommandData;
   help: CommandHelp;
+  /**
+   * For a command that needs something optional (an API key, a setting): whether this
+   * installation has it. A command that is not enabled is neither registered nor routed.
+   */
+  enabled?: (config: Config) => boolean;
 }
 
 /** A command without subcommands: `/join`, `/raid`. */
@@ -76,6 +86,14 @@ export interface GroupedCommand extends CommandBase {
 
 export type CommandModule = SimpleCommand | GroupedCommand;
 
+/** The commands this installation offers. */
+export function enabledCommands(
+  commands: readonly CommandModule[],
+  config: Config,
+): CommandModule[] {
+  return commands.filter((command) => command.enabled?.(config) ?? true);
+}
+
 /** The path of a subcommand as the keys of `GroupedCommand.subcommands` spell it. */
 export function subcommandPath(group: string | null, subcommand: string | null): string {
   return [group, subcommand].filter(Boolean).join(' ');
```

```diff
--- a/src/discord/command-group.ts
+++ b/src/discord/command-group.ts
@@ -1,3 +1,4 @@
+import type { Config } from '../config/index.js';
 import {
   SlashCommandSubcommandGroupBuilder,
   type SlashCommandBuilder,
@@ -24,6 +25,8 @@ export interface CommandGroupDefinition {
   help: CommandHelp;
   /** Guards for every subcommand; they run before a subcommand's own. */
   guards?: readonly Guard[];
+  /** Whether this installation offers the command at all; see `CommandModule.enabled`. */
+  enabled?: (config: Config) => boolean;
   /** Subcommand groups by name, with the description Discord shows for each. */
   groups?: Readonly<Record<string, string>>;
   parts: readonly SubcommandPart[];
@@ -35,7 +38,7 @@ export interface CommandGroupDefinition {
  * Subcommands keep the order of `parts`; groups come after them, in the order of `groups`.
  */
 export function commandGroup(definition: CommandGroupDefinition): GroupedCommand {
-  const { data, help, guards, parts } = definition;
+  const { data, help, guards, enabled, parts } = definition;
   const groups = new Map(
     Object.entries(definition.groups ?? {}).map(([name, description]) => [
       name,
@@ -63,5 +66,11 @@ export function commandGroup(definition: CommandGroupDefinition): GroupedCommand
     data.addSubcommandGroup(builder);
   }
   if (subcommands.size === 0) throw new Error(`/${data.name} has no subcommands`);
-  return { data, help, ...(guards ? { guards } : {}), subcommands };
+  return {
+    data,
+    help,
+    ...(guards ? { guards } : {}),
+    ...(enabled ? { enabled } : {}),
+    subcommands,
+  };
 }
```

```diff
--- a/src/discord/deploy.ts
+++ b/src/discord/deploy.ts
@@ -1,8 +1,15 @@
-import type { RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
+import {
+  InteractionContextType,
+  type RESTPostAPIChatInputApplicationCommandsJSONBody,
+} from 'discord.js';
 import type { CommandModule } from './command.js';
 
 export const MAX_COMMANDS = 100;
 
+/**
+ * What is sent to Discord to register the commands. A command that does not say where it may
+ * be used is offered in servers only: Discord's own default would also offer it in DMs.
+ */
 export function buildCommandPayload(
   commands: readonly CommandModule[],
 ): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
@@ -14,7 +21,7 @@ export function buildCommandPayload(
     const json = command.data.toJSON();
     if (seen.has(json.name)) throw new Error(`Duplicate command /${json.name}`);
     seen.add(json.name);
-    return json;
+    return { ...json, contexts: json.contexts ?? [InteractionContextType.Guild] };
   });
 }
 
```

```diff
--- a/src/discord/deploy-cli.ts
+++ b/src/discord/deploy-cli.ts
@@ -1,11 +1,13 @@
 import { REST, Routes } from 'discord.js';
 import { commands } from '../commands/index.js';
-import { loadEnv } from '../config/env.js';
+import { loadConfig } from '../config/index.js';
+import { enabledCommands } from './command.js';
 import { buildCommandPayload, parseDeployArgs } from './deploy.js';
 
-const env = loadEnv(process.env);
+const config = loadConfig(process.env);
+const { env } = config;
 const target = parseDeployArgs(process.argv.slice(2));
-const body = buildCommandPayload(commands);
+const body = buildCommandPayload(enabledCommands(commands, config));
 const rest = new REST().setToken(env.DISCORD_TOKEN);
 const route =
   target.scope === 'guild'
```

```diff
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,6 +1,6 @@
 import { Events } from 'discord.js';
 import type { AppContext } from './app-context.js';
-import { commands } from './commands/index.js';
+import { commands as allCommands } from './commands/index.js';
 import { components } from './components/index.js';
 import { loadConfig } from './config/index.js';
 import { dbConfigFrom } from './db/db-config.js';
@@ -13,6 +13,7 @@ import { RaidBossRepository } from './db/repositories/raid-boss-repository.js';
 import { RegionRepository } from './db/repositories/region-repository.js';
 import type { DB } from './db/types.js';
 import { createClient, loginWithFallback } from './discord/client.js';
+import { enabledCommands } from './discord/command.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
@@ -93,6 +94,7 @@ export async function startApp(
     ocrPassive: config.settings.ocr.passive,
     autoAssignRole: config.settings.autoAssignRole,
   };
+  const commands = enabledCommands(allCommands, config);
   const ctx: AppContext = {
     config,
     log,
```

`/help` also works in a DM with the bot:

```diff
--- a/src/commands/util/help.ts
+++ b/src/commands/util/help.ts
@@ -1,4 +1,4 @@
-import { MessageFlags, SlashCommandBuilder } from 'discord.js';
+import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { isBotManagement, memberRoleNames } from '../../discord/guards.js';
@@ -10,6 +10,7 @@ export const help: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('help')
     .setDescription('Show what Professor Pine can do')
+    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
     .addStringOption((option) =>
       option.setName('command').setDescription('The command to explain').setAutocomplete(true),
     ),
```

- [ ] **Step 7: The final login error keeps its cause**

```diff
--- a/src/discord/client.ts
+++ b/src/discord/client.ts
@@ -41,7 +41,9 @@ export async function loginWithFallback(
   requested: IntentFlags,
   deps: LoginDeps,
 ): Promise<{ client: Client; features: IntentFlags }> {
-  for (const candidate of fallbackCandidates(requested)) {
+  const candidates = fallbackCandidates(requested);
+  let refusal: unknown;
+  for (const [index, candidate] of candidates.entries()) {
     const client = deps.create(intentsFor(candidate));
     deps.configure(client);
     try {
@@ -49,10 +51,13 @@ export async function loginWithFallback(
     } catch (err) {
       await client.destroy();
       if (!isDisallowedIntentsError(err)) throw err;
-      deps.log.warn(
-        { tried: candidate },
-        'Discord rejected a privileged intent; retrying with fewer',
-      );
+      refusal = err;
+      if (index < candidates.length - 1) {
+        deps.log.warn(
+          { tried: candidate },
+          'Discord rejected a privileged intent; retrying with fewer',
+        );
+      }
       continue;
     }
     for (const flag of Object.keys(FLAG_HELP) as Array<keyof IntentFlags>) {
@@ -60,5 +65,7 @@ export async function loginWithFallback(
     }
     return { client, features: candidate };
   }
-  throw new Error('Discord rejected the login even without privileged intents');
+  throw new Error('Discord rejected the login even without privileged intents', {
+    cause: refusal,
+  });
 }
```

- [ ] **Step 8: Check and commit**

Run: `npx prettier --write` on the fourteen files above, then `npm run check`.
Expected: green; 826 unit tests.

```bash
git add src/discord/channel-context.ts src/discord/channel-context.test.ts src/discord/guards.ts src/discord/guards.test.ts src/discord/command.ts src/discord/command-group.ts src/discord/command-group.test.ts src/discord/deploy.ts src/discord/deploy.test.ts src/discord/deploy-cli.ts src/discord/client.ts src/discord/client.test.ts src/app.ts src/commands/util/help.ts
git commit -m "Guards see threads by the channel they are in; commands are offered in servers only by default

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `/help` for subcommands, staff and long lists

**Files:**
- Replace: `src/commands/categories.ts`, `src/commands/util/help-render.ts`, `src/commands/util/help.ts`, `src/commands/util/help-render.test.ts`, `src/commands/util/help.test.ts`
- Modify: `src/discord/command.ts`, `src/discord/guards.ts`, `src/discord/command-group.test.ts`

**Interfaces:**
- Consumes: `commandGroup`, `declaredSubcommands`, `subcommandPath`, `SubcommandHandler.help` (Task 2); the fakes and `sent` (Task 1).
- Produces:
  - `HelpCategory` (the keys of `CATEGORY_LABELS`); `CommandHelp.category: HelpCategory`
  - `fitLines(lines, limit): string`, `isStaffCommand(command, helpGroups): boolean`, `renderHelpOverview(commands, helpGroups, includeStaff)`, `renderCommandHelp(command)`, `renderSubcommandHelp(command, path): EmbedBuilder | undefined`
  - `memberRoleNames` also accepts an `AutocompleteInteraction`.

- [ ] **Step 1: Replace the two test files**

Replace `src/commands/util/help-render.test.ts` with:

```ts
import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { commandGroup } from '../../discord/command-group.js';
import type { CommandModule, SimpleCommand } from '../../discord/command.js';
import type { HelpCategory } from '../categories.js';
import {
  fitLines,
  isStaffCommand,
  renderCommandHelp,
  renderHelpOverview,
  renderSubcommandHelp,
} from './help-render.js';

const noop = () => Promise.resolve();

function cmd(
  name: string,
  category: HelpCategory,
  build?: (b: SlashCommandBuilder) => void,
  description = `About ${name}`,
): SimpleCommand {
  const data = new SlashCommandBuilder().setName(name).setDescription(description);
  build?.(data);
  return { data, help: { category }, execute: noop };
}

const all = [
  cmd('join', 'basic-raid'),
  cmd('raid', 'raid-crud'),
  cmd('gym', 'admin'),
  cmd('help', 'util'),
];
const groups = ['basic-raid', 'raid-crud', 'util'];

/** Characters Discord counts against the 6,000 allowed in one embed. */
function embedSize(json: ReturnType<ReturnType<typeof renderHelpOverview>['toJSON']>): number {
  return (
    (json.title?.length ?? 0) +
    (json.description?.length ?? 0) +
    (json.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
  );
}

describe('fitLines', () => {
  it('keeps everything that fits', () => {
    expect(fitLines(['one', 'two'], 7)).toBe('one\ntwo');
  });

  it('ends at a whole line and says how many were left out', () => {
    const lines = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    expect(fitLines(lines, 30)).toBe(lines.join('\n'));
    expect(fitLines(lines, 29)).toBe('alpha\nbeta\ngamma\n…and 2 more');
    expect(fitLines(lines, 25)).toBe('alpha\nbeta\n…and 3 more');
    expect(fitLines(lines, 17)).toBe('alpha\n…and 4 more');
  });

  it('cuts a single line that is too long by itself', () => {
    expect(fitLines(['abcdefghij', 'k'], 6)).toBe('abcde…');
    expect(fitLines([], 10)).toBe('');
  });
});

describe('isStaffCommand', () => {
  it('is a command whose category the settings do not list', () => {
    expect(isStaffCommand(cmd('gym', 'admin'), groups)).toBe(true);
    expect(isStaffCommand(cmd('join', 'basic-raid'), groups)).toBe(false);
  });
});

describe('renderHelpOverview', () => {
  it('lists public categories in helpGroups order with labels', () => {
    const fields = renderHelpOverview(all, groups, false).toJSON().fields ?? [];
    expect(fields.map((f) => f.name)).toEqual([
      'Raid Basics',
      'Raid Creation and Maintenance',
      'Utility',
    ]);
    expect(fields[0]?.value).toBe('`/join` About join');
  });

  it('appends staff-only categories for staff', () => {
    const fields = renderHelpOverview(all, groups, true).toJSON().fields ?? [];
    expect(fields.map((f) => f.name)).toEqual([
      'Raid Basics',
      'Raid Creation and Maintenance',
      'Utility',
      'Administration',
    ]);
  });

  it('ignores a help group the settings name that no command is filed under', () => {
    const fields = renderHelpOverview(all, ['silph', ...groups], false).toJSON().fields ?? [];
    expect(fields).toHaveLength(3);
  });

  it('ends a long category at a whole line', () => {
    const many = Array.from({ length: 80 }, (_, i) => cmd(`command-number-${i}`, 'util'));
    const field = renderHelpOverview(many, ['util'], false).toJSON().fields?.[0];
    expect(field?.value.length).toBeLessThanOrEqual(1024);
    expect(field?.value).toMatch(/\n…and \d+ more$/);
    expect(field?.value.split('\n').slice(0, -1).every((line) => line.includes(' About '))).toBe(
      true,
    );
  });

  it('falls back to names only when descriptions would exceed what one embed holds', () => {
    const categories: HelpCategory[] = [
      'basic-raid',
      'raid-crud',
      'train',
      'meetup',
      'roles',
      'notifications',
      'friends',
      'util',
    ];
    const long = 'x'.repeat(90);
    const many = categories.flatMap((category) =>
      Array.from({ length: 10 }, (_, i) => cmd(`${category}-${i}`, category, undefined, long)),
    );
    const json = renderHelpOverview(many, categories, false).toJSON();
    expect(embedSize(json)).toBeLessThanOrEqual(6000);
    expect(json.fields).toHaveLength(8);
    expect(json.fields?.[0]?.value).toBe(
      Array.from({ length: 10 }, (_, i) => `\`/basic-raid-${i}\``).join(' '),
    );
  });
});

describe('renderCommandHelp', () => {
  it('shows usage with required and optional options, details and examples', () => {
    const command = cmd('meet', 'basic-raid', (b) =>
      b
        .addStringOption((o) => o.setName('time').setDescription('When').setRequired(true))
        .addStringOption((o) => o.setName('group').setDescription('Which group')),
    );
    command.help = {
      category: 'basic-raid',
      details: 'Sets your meeting time.',
      examples: ['/meet time:2:30'],
    };
    const json = renderCommandHelp(command).toJSON();
    expect(json.title).toBe('/meet');
    expect(json.description).toBe('About meet\n\nSets your meeting time.');
    expect(json.fields).toEqual([
      { name: 'Usage', value: '`/meet <time> [group]`' },
      { name: 'Examples', value: '`/meet time:2:30`' },
    ]);
  });

  it('lists every subcommand with what it does', () => {
    const usage = renderCommandHelp(route()).toJSON().fields?.[0]?.value;
    expect(usage).toBe(
      '`/route show` Show the route\n' +
        '`/route add <gym>` Add a stop\n' +
        '`/route saved load <name>` Use a saved route',
    );
  });
});

function route(): CommandModule {
  const sub = (name: string, description: string) =>
    new SlashCommandSubcommandBuilder().setName(name).setDescription(description);
  return commandGroup({
    data: new SlashCommandBuilder().setName('route').setDescription('The route of a train'),
    help: { category: 'train' },
    groups: { saved: 'Saved routes' },
    parts: [
      { data: sub('show', 'Show the route'), execute: noop },
      {
        data: sub('add', 'Add a stop').addStringOption((o) =>
          o.setName('gym').setDescription('Gym').setRequired(true),
        ),
        help: { details: 'The stop goes to the end of the route.', examples: ['/route add gym:mall'] },
        execute: noop,
      },
      {
        group: 'saved',
        data: sub('load', 'Use a saved route').addStringOption((o) =>
          o.setName('name').setDescription('Route').setRequired(true),
        ),
        execute: noop,
      },
    ],
  });
}

describe('renderSubcommandHelp', () => {
  it('explains one subcommand with its own details and examples', () => {
    expect(renderSubcommandHelp(route(), 'add')?.toJSON()).toMatchObject({
      title: '/route add',
      description: 'Add a stop\n\nThe stop goes to the end of the route.',
      fields: [
        { name: 'Usage', value: '`/route add <gym>`' },
        { name: 'Examples', value: '`/route add gym:mall`' },
      ],
    });
  });

  it('finds a subcommand inside a group', () => {
    expect(renderSubcommandHelp(route(), 'saved load')?.toJSON()).toMatchObject({
      title: '/route saved load',
      description: 'Use a saved route',
      fields: [{ name: 'Usage', value: '`/route saved load <name>`' }],
    });
  });

  it('is undefined for a subcommand the command does not have, and for a group name', () => {
    expect(renderSubcommandHelp(route(), 'remove')).toBeUndefined();
    expect(renderSubcommandHelp(route(), 'saved')).toBeUndefined();
    expect(renderSubcommandHelp(cmd('join', 'basic-raid'), 'now')).toBeUndefined();
  });
});
```

Replace `src/commands/util/help.test.ts` with:

```ts
import {
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeAutocomplete,
  fakeChatInput,
  sent,
  type FakeOptions,
} from '../../../test/support/fake-interactions.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { commandGroup } from '../../discord/command-group.js';
import type { CommandModule } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { help } from './help.js';

const noop = () => Promise.resolve();
const sub = (name: string) =>
  new SlashCommandSubcommandBuilder().setName(name).setDescription(`About ${name}`);
const route = commandGroup({
  data: new SlashCommandBuilder().setName('route').setDescription('The route of a train'),
  help: { category: 'train' },
  parts: [
    { data: sub('show'), execute: noop },
    { data: sub('add'), execute: noop },
  ],
});
const gym: CommandModule = commandGroup({
  data: new SlashCommandBuilder().setName('gym').setDescription('Gym administration'),
  help: { category: 'admin' },
  parts: [{ data: sub('create'), execute: noop }],
});

const { ctx } = createTestContext({ commands: [help, route, gym] });

const ask = async (o: FakeOptions = {}) => {
  const i = fakeChatInput({ commandName: 'help', ...o });
  await help.execute(i as unknown as ChatInputCommandInteraction, ctx);
  return sent(i.reply);
};
const choices = async (focused: string, o: FakeOptions = {}) => {
  const i = fakeAutocomplete({ commandName: 'help', focused, ...o });
  await help.autocomplete?.(i as unknown as AutocompleteInteraction, ctx);
  return (i.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.value);
};
const MODERATOR = { roleNames: ['moderator'] };

describe('/help', () => {
  it('replies ephemerally with the overview', async () => {
    const payload = await ask();
    expect(payload.flags).toBe(MessageFlags.Ephemeral);
    expect(payload.embeds?.[0]?.toJSON().fields?.map((f) => f.name)).toEqual(['Trains', 'Utility']);
  });

  it('shows staff the staff categories too', async () => {
    const payload = await ask(MODERATOR);
    expect(payload.embeds?.[0]?.toJSON().fields?.map((f) => f.name)).toEqual([
      'Trains',
      'Utility',
      'Administration',
    ]);
  });

  it('explains one command, however its name was typed', async () => {
    for (const command of ['help', '/help', ' /Help ', '/ help']) {
      const payload = await ask({ options: { command } });
      expect(payload.embeds?.[0]?.toJSON().title).toBe('/help');
    }
  });

  it('explains one subcommand', async () => {
    const payload = await ask({ options: { command: '/Route  Add' } });
    expect(payload.embeds?.[0]?.toJSON().title).toBe('/route add');
  });

  it('rejects an unknown command or subcommand, naming what was asked', async () => {
    await expect(ask({ options: { command: 'nope' } })).rejects.toThrow(
      new UserError('There is no /nope command.'),
    );
    await expect(ask({ options: { command: 'route remove' } })).rejects.toThrow(
      'There is no /route remove command.',
    );
  });

  it('tells other members that a staff command does not exist, and explains it to staff', async () => {
    await expect(ask({ options: { command: 'gym' } })).rejects.toThrow(
      'There is no /gym command.',
    );
    await expect(ask({ options: { command: 'gym create' } })).rejects.toThrow(
      'There is no /gym create command.',
    );
    const payload = await ask({ options: { command: 'gym create' }, ...MODERATOR });
    expect(payload.embeds?.[0]?.toJSON().title).toBe('/gym create');
  });

  it('autocompletes command and subcommand names, those that start with the text first', async () => {
    expect(await choices('he')).toEqual(['help']);
    expect(await choices('')).toEqual(['help', 'route', 'route add', 'route show']);
    expect(await choices('/Route a')).toEqual(['route add']);
    expect(await choices('o')).toEqual(['route', 'route add', 'route show']);
    expect(await choices('show')).toEqual(['route show']);
  });

  it('offers staff commands to staff only', async () => {
    expect(await choices('gym')).toEqual([]);
    expect(await choices('gym', MODERATOR)).toEqual(['gym', 'gym create']);
  });

  it('works in a DM, where nobody but the owner is staff', async () => {
    const payload = await ask({ isDm: true });
    expect(payload.embeds?.[0]?.toJSON().fields?.map((f) => f.name)).toEqual(['Trains', 'Utility']);
    const owner = await ask({ isDm: true, userId: ctx.config.env.OWNER_ID });
    expect(owner.embeds?.[0]?.toJSON().fields).toHaveLength(3);
  });

  it('offers at most 25 choices', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...help,
      data: new SlashCommandBuilder().setName(`help${i}`).setDescription('x'),
    }));
    const { ctx: crowded } = createTestContext({ commands: many });
    const i = fakeAutocomplete({ commandName: 'help', focused: 'help' });
    await help.autocomplete?.(i as unknown as AutocompleteInteraction, crowded);
    expect(i.respond.mock.calls[0]?.[0]).toHaveLength(25);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project unit src/commands`
Expected: FAIL (`fitLines`, `isStaffCommand`, `renderSubcommandHelp` and `HelpCategory` are not exported).

- [ ] **Step 3: Categories as a type**

Replace `src/commands/categories.ts` with:

```ts
/** Display names for help categories; ids match settings.helpGroups. */
export const CATEGORY_LABELS = {
  'basic-raid': 'Raid Basics',
  'raid-crud': 'Raid Creation and Maintenance',
  train: 'Trains',
  meetup: 'Meetups',
  roles: 'Roles',
  notifications: 'Notifications',
  friends: 'Friend Codes',
  util: 'Utility',
  admin: 'Administration',
  region: 'Region setting',
} as const;

/** A help category a command can be filed under. */
export type HelpCategory = keyof typeof CATEGORY_LABELS;
```

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -10,6 +10,7 @@ import {
   type RESTPostAPIChatInputApplicationCommandsJSONBody,
 } from 'discord.js';
 import type { AppContext } from '../app-context.js';
+import type { HelpCategory } from '../commands/categories.js';
 import type { Config } from '../config/index.js';
 import type { CustomId } from './custom-id.js';
 import type { Throttle } from './throttle.js';
@@ -21,8 +22,8 @@ export type GuardableInteraction =
 export type Guard = (interaction: GuardableInteraction, ctx: AppContext) => void | Promise<void>;
 
 export interface CommandHelp {
-  /** Help category id, e.g. 'basic-raid'. Categories outside settings.helpGroups are staff-only. */
-  category: string;
+  /** Where `/help` files the command. Categories outside settings.helpGroups are staff-only. */
+  category: HelpCategory;
   details?: string;
   examples?: string[];
 }
```

A test literal needs `as const` now:

```diff
--- a/src/discord/command-group.test.ts
+++ b/src/discord/command-group.test.ts
@@ -15,7 +15,7 @@ const part = (name: string, extra: Partial<SubcommandPart> = {}): SubcommandPart
   ...extra,
 });
 const admin = () => new SlashCommandBuilder().setName('admin').setDescription('Administration');
-const help = { category: 'admin' };
+const help = { category: 'admin' } as const;
 
 describe('subcommandPath', () => {
   it('spells a path with and without a group', () => {
```

- [ ] **Step 4: Role names for autocomplete too**

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -1,3 +1,4 @@
+import type { AutocompleteInteraction } from 'discord.js';
 import type { AppContext } from '../app-context.js';
 import type { Settings } from '../config/index.js';
 import { channelContext } from './channel-context.js';
@@ -43,7 +44,9 @@ export function isPvpContext(
 }
 
 /** Role names of the invoking member; empty outside a cached guild. */
-export function memberRoleNames(interaction: GuardableInteraction): string[] {
+export function memberRoleNames(
+  interaction: GuardableInteraction | AutocompleteInteraction,
+): string[] {
   if (!interaction.inCachedGuild()) return [];
   return interaction.member.roles.cache.map((role) => role.name);
 }
```

- [ ] **Step 5: Rendering**

Replace `src/commands/util/help-render.ts` with:

```ts
import {
  ApplicationCommandOptionType,
  EmbedBuilder,
  type APIApplicationCommandOption,
} from 'discord.js';
import {
  subcommandPath,
  type CommandHelp,
  type CommandModule,
} from '../../discord/command.js';
import { CATEGORY_LABELS, type HelpCategory } from '../categories.js';

/** Discord's limits for one embed. */
const FIELD_LIMIT = 1024;
const DESCRIPTION_LIMIT = 4096;
const MAX_FIELDS = 25;
const EMBED_LIMIT = 6000;

const OVERVIEW_TITLE = 'Professor Pine commands';
const OVERVIEW_HINT = 'Use `/help command:<name>` for details on one command.';

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * As many whole lines as fit in `limit` characters; when some do not, the last line says how
 * many were left out. A single line longer than the limit is cut.
 */
export function fitLines(lines: readonly string[], limit: number): string {
  const all = lines.join('\n');
  if (all.length <= limit) return all;
  for (let kept = lines.length - 1; kept > 0; kept--) {
    const text = [...lines.slice(0, kept), `…and ${lines.length - kept} more`].join('\n');
    if (text.length <= limit) return text;
  }
  return truncate(lines[0] ?? '', limit);
}

/** A command in a category outside `settings.helpGroups` is for staff. */
export function isStaffCommand(command: CommandModule, helpGroups: readonly string[]): boolean {
  return !helpGroups.includes(command.help.category);
}

const byName = (a: CommandModule, b: CommandModule) => a.data.name.localeCompare(b.data.name);

export function renderHelpOverview(
  commands: readonly CommandModule[],
  helpGroups: readonly string[],
  includeStaff: boolean,
): EmbedBuilder {
  const byCategory = new Map<HelpCategory, CommandModule[]>();
  for (const command of commands) {
    const list = byCategory.get(command.help.category) ?? [];
    list.push(command);
    byCategory.set(command.help.category, list);
  }
  const categories = [...byCategory.keys()];
  const order = [
    ...helpGroups.flatMap((group) => categories.filter((category) => category === group)),
    ...(includeStaff ? categories.filter((c) => !helpGroups.includes(c)).sort() : []),
  ];

  const fieldsWith = (line: (command: CommandModule) => string, separator: string) =>
    order.slice(0, MAX_FIELDS).map((category) => {
      const lines = (byCategory.get(category) ?? []).sort(byName).map(line);
      return {
        name: CATEGORY_LABELS[category],
        value:
          separator === '\n'
            ? fitLines(lines, FIELD_LIMIT)
            : truncate(lines.join(separator), FIELD_LIMIT),
      };
    });
  const size = (fields: ReadonlyArray<{ name: string; value: string }>) =>
    OVERVIEW_TITLE.length +
    OVERVIEW_HINT.length +
    fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);

  // One line per command with its description; names only when that is too long for one embed.
  let fields = fieldsWith((c) => `\`/${c.data.name}\` ${c.data.toJSON().description}`, '\n');
  if (size(fields) > EMBED_LIMIT) fields = fieldsWith((c) => `\`/${c.data.name}\``, ' ');
  while (size(fields) > EMBED_LIMIT) fields.pop();

  return new EmbedBuilder()
    .setTitle(OVERVIEW_TITLE)
    .setDescription(OVERVIEW_HINT)
    .addFields(fields);
}

type Option = APIApplicationCommandOption;

function isNested(option: Option): boolean {
  return (
    option.type === ApplicationCommandOptionType.Subcommand ||
    option.type === ApplicationCommandOptionType.SubcommandGroup
  );
}

const childrenOf = (option: Option): readonly Option[] =>
  'options' in option && option.options ? option.options : [];

function usageLine(path: string, options: readonly Option[]): string {
  const args = options.map((o) => ('required' in o && o.required ? `<${o.name}>` : `[${o.name}]`));
  return `\`/${[path, ...args].join(' ')}\``;
}

/** One line per way of using the command; a subcommand's line ends with its description. */
function usageLines(path: string, options: readonly Option[], description?: string): string[] {
  const nested = options.filter(isNested);
  if (nested.length === 0) {
    const line = usageLine(path, options);
    return [description ? `${line} ${description}` : line];
  }
  return nested.flatMap((o) => usageLines(`${path} ${o.name}`, childrenOf(o), o.description));
}

function helpEmbed(
  title: string,
  description: string,
  help: Pick<CommandHelp, 'details' | 'examples'> | undefined,
  usage: readonly string[],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      truncate([description, help?.details].filter(Boolean).join('\n\n'), DESCRIPTION_LIMIT),
    )
    .addFields({ name: 'Usage', value: fitLines(usage, FIELD_LIMIT) });
  if (help?.examples?.length) {
    const examples = help.examples.map((e) => `\`${e}\``);
    embed.addFields({ name: 'Examples', value: fitLines(examples, FIELD_LIMIT) });
  }
  return embed;
}

export function renderCommandHelp(command: CommandModule): EmbedBuilder {
  const json = command.data.toJSON();
  return helpEmbed(
    `/${json.name}`,
    json.description,
    command.help,
    usageLines(json.name, json.options ?? []),
  );
}

/** Help for one subcommand (`create`, `boss add`); undefined when the command has none such. */
export function renderSubcommandHelp(
  command: CommandModule,
  path: string,
): EmbedBuilder | undefined {
  const json = command.data.toJSON();
  for (const option of (json.options ?? []).filter(isNested)) {
    const candidates =
      option.type === ApplicationCommandOptionType.SubcommandGroup
        ? childrenOf(option).map((sub) => ({ sub, group: option.name }))
        : [{ sub: option, group: null }];
    for (const { sub, group } of candidates) {
      if (subcommandPath(group, sub.name) !== path) continue;
      const name = `${json.name} ${path}`;
      return helpEmbed(`/${name}`, sub.description, command.subcommands?.get(path)?.help, [
        usageLine(name, childrenOf(sub)),
      ]);
    }
  }
  return undefined;
}
```

- [ ] **Step 6: The command**

Replace `src/commands/util/help.ts` with:

```ts
import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { AppContext } from '../../app-context.js';
import {
  declaredSubcommands,
  type CommandModule,
  type SimpleCommand,
} from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { isBotManagement, memberRoleNames } from '../../discord/guards.js';
import {
  isStaffCommand,
  renderCommandHelp,
  renderHelpOverview,
  renderSubcommandHelp,
} from './help-render.js';

const MAX_CHOICES = 25;

/** What was typed as a command name: `/Gym  Create ` is `gym create`. */
function normalise(text: string): string {
  return text.trim().replace(/^\//, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

type Asker = Parameters<typeof memberRoleNames>[0];

function isStaff(interaction: Asker, ctx: AppContext): boolean {
  return isBotManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID);
}

/** The commands a member may read about: staff commands are shown to staff only. */
function visibleCommands(staff: boolean, ctx: AppContext): readonly CommandModule[] {
  return staff
    ? ctx.commands
    : ctx.commands.filter((c) => !isStaffCommand(c, ctx.config.settings.helpGroups));
}

export const help: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show what Professor Pine can do')
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
    .addStringOption((option) =>
      option.setName('command').setDescription('The command to explain').setAutocomplete(true),
    ),
  help: {
    category: 'util',
    details: 'Without a command, lists the commands you can use. With one, explains it.',
    examples: ['/help', '/help command:raid', '/help command:route add'],
  },

  async execute(interaction, ctx) {
    const staff = isStaff(interaction, ctx);
    const visible = visibleCommands(staff, ctx);
    const asked = normalise(interaction.options.getString('command') ?? '');
    if (asked === '') {
      await interaction.reply({
        embeds: [renderHelpOverview(visible, ctx.config.settings.helpGroups, staff)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const [name = '', ...rest] = asked.split(' ');
    const command = visible.find((c) => c.data.name === name);
    const embed =
      command && (rest.length === 0 ? renderCommandHelp(command) : renderSubcommandHelp(command, rest.join(' ')));
    // A staff command is reported to other members exactly as one that does not exist.
    if (!embed) throw new UserError(`There is no /${asked} command.`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },

  async autocomplete(interaction, ctx) {
    const typed = normalise(interaction.options.getFocused());
    const names = visibleCommands(isStaff(interaction, ctx), ctx).flatMap((command) => [
      command.data.name,
      ...declaredSubcommands(command.data.toJSON().options).map(
        (path) => `${command.data.name} ${path}`,
      ),
    ]);
    const startsFirst = (a: string, b: string) =>
      Number(!a.startsWith(typed)) - Number(!b.startsWith(typed)) || a.localeCompare(b);
    const choices = names
      .filter((n) => n.includes(typed))
      .sort(startsFirst)
      .slice(0, MAX_CHOICES);
    await interaction.respond(choices.map((n) => ({ name: `/${n}`, value: n })));
  },
};
```

- [ ] **Step 7: Check and commit**

Run: `npx prettier --write src/commands/categories.ts src/commands/util/help.ts src/commands/util/help-render.ts src/commands/util/help.test.ts src/commands/util/help-render.test.ts src/discord/command.ts src/discord/guards.ts src/discord/command-group.test.ts`, then `npm run check`.
Expected: green; 841 unit tests.

```bash
git add src/commands/categories.ts src/commands/util/help.ts src/commands/util/help-render.ts src/commands/util/help.test.ts src/commands/util/help-render.test.ts src/discord/command.ts src/discord/guards.ts src/discord/command-group.test.ts
git commit -m "/help: subcommands, staff commands hidden from others, lists that fit one embed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the last task

The controller, not an implementer, does these:

1. Whole-branch review (Opus, high effort) of the six commits; one fix wave if it finds something.
2. `npm run test:db` once (nothing here touches the database; this only proves nothing else broke).
3. `CLAUDE.md`: the status line, and conventions for `commandGroup`, `defer`, `throttle`, typed component handlers and `src/components/index.ts`, `channelContext` and `regionChannelOf`, servers-only by default, `enabled`, and the fakes.
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete what this plan did from the "Phase 2", "Phase 5" and "Phase 6" sections; add a "From Phase 2A" section. The Gantt chart and memory.

## As built (2026-10-11)

Executed as commits `15a1b7f`..`fa6789e`: the six tasks as written (their code equals the prototype), `e811e52` (the legacy entries of `.prettierignore` anchored, which had hidden `src/commands/` from Prettier since Phase 0) and `fa6789e`, the fix wave after the whole-branch review. That wave changed what the tasks above show: `LocatedInteraction` (any interaction, also autocomplete) is the parameter of `Guard`, `channelContext`, `regionChannelOf` and `memberRoleNames`; the fakes refuse what discord.js refuses; a simple command invoked with a subcommand is answered as not available; an error reply is cut to 2,000 characters; `/help command:` has a maximum length of 100; `integration_types` defaults to server installs; `err.url` and `err.requestBody` are redacted in logs; `Throttles` lost its unused `opened` field. 859 unit tests, 97 database tests. Open items: "From Phase 2A" in `phase-0-follow-ups.md`.

## Staging checklist (with Matt, on the test application and server)

This is the first time the TypeScript bot connects to Discord. It needs `.env` filled in, a local MySQL, and Matt's go-ahead for each step.

- [ ] `npm run deploy-commands -- --guild <test server id>` prints "Registered 1 command(s)".
- [ ] `npm run dev` logs "connected to Discord" and the server count; no privileged intent is requested.
- [ ] `/help` in the test server shows the overview, visible only to the member.
- [ ] `/help command:help` explains the command; the option autocompletes.
- [ ] `/help` in a DM with the bot works. This needs `npm run deploy-commands` without `--guild` first (a guild-scoped command never appears in a DM); every command then shows twice in the test server until one registration is removed.
- [ ] Stopping with Ctrl+C logs the shutdown steps and exits.
