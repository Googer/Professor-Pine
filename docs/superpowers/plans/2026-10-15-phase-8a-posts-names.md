# Phase 8A: The Look of the Posts and the Command Names: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pine's raid, train and meetup posts become Discord's newer message layout (components v2): each status line with its button beside it, counts in every heading, the reporter at the bottom, a Map button; the in-game type, weather and team icons come from the bot's own application emoji; the commands get the names members know (`/interested` with `/hmm`, `/coming`, `/little` `/great` `/ultra` `/master`).

**Architecture:** The first of Phase 8's plans (8A look and names, then the cutover tooling, Phase 9 Docker, the rehearsal and guides, the cutover). The renderers (`src/render/`) build a `PostLayout` and turn it into one v2 message (`postMessage(layout, variant)`): the post, its copies, its last showing without controls and its picture-less retry are variants of one layout, never edited by hand. `OutgoingMessage` is a union of the classic message and the v2 message; the gateway sends the v2 flag on every send and edit and converts a classic message by an edit. The fake gateway is as strict as Discord about v2 (40 components, text budget, sections, buttons) and refuses as Discord does (400/50035). A forum post whose v2 first message Discord refuses starts as a line of text and is edited into the post at once. DMs keep a classic embed, the post's card. `ApplicationEmoji` reads the application's emoji at start and hourly; `PartyService.emoji` looks a name up there, then in the server, then falls back to words. A command may have other forms (`alsoAs`), registered under their own names and sharing the original's handlers and throttle.

**Tech Stack:** TypeScript 6.0, discord.js 14.27 (components v2: `MessageFlags.IsComponentsV2`, application emoji), sharp (the upload script only), Vitest. No new dependency, no migration. The command definitions change: `npm run deploy-commands -- --global` before staging; the emoji are uploaded with `npm run emoji:upload -- --apply` (Matt).

**Spec:** the design brief `.superpowers/sdd/2026-10-15-phase-8a-posts-names/design.md` (git-ignored; its rulings R1–R10, written from Matt's answers of 2026-10-15), Matt's answers in `docs/superpowers/plans/phase-0-follow-ups.md` ("Phase 8", the paragraph "8A answers" and after), the drafts he approved (https://claude.ai/artifact/KqYyaWjfA5SjeUEozCeb4Q, the components-v2 section; samples sent to the test server by `var/stage/v2-samples.mts`), and section 9 of `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`. The prototype's reviews and rulings: `proto-review.md` beside the brief.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8a`), one commit per task, each commit typechecked with its own tests green, and the full check and build clean on the tip (5,076 unit tests). Two Opus reviewers went through that branch (Discord correctness and layouts; emoji, commands, the DM card and the tests), a third through the fixes of the first round; what they found is already in the code below.

## Decisions in this plan (Matt, 2026-10-15)

1. **Components v2 for posts** (raid, train, meetup, their copies, the `/status` copy): one container, the title as a heading (a raid's gym name links to Maps; "Raid Train: …", "Meetup: …"), a thumbnail beside the header (boss or egg), the boss block (Weaknesses and Catch CP with icons, Moveset), "Location Information" (elite raid gym, the gym's notice), the status lines with their buttons (Interested 🤔, Join 🏃 beside Coming, Here ✅ beside Present, Done 🎉 beside Complete for raids), counts in every heading (the +1s counted), no emoji in headings, names not cut; with several groups a line per group (label, trainers, meeting time) with "Join A…E" beside it; bottom rows Leave, −1, +1, Remote, Map (raids), Set time, Screenshot feedback; "Reported by" / "Created by" at the bottom in small print with the mention. One message per post (forum messages cannot be inserted later).
2. **Legacy wording:** "Level 5 raid" (Mega raid, Elite raid, Shadow Level 5 raid …), "Present", "Complete".
3. **Application emoji** for the 18 types, the weather (`sunny clear rain partlycloudy cloudy windy snow fog`) and the teams (`instinct mystic valor teamless`), uploaded from PokeMiners' pogo_assets at a pinned commit; a server's own emoji of the same name, then words, as fallbacks.
4. **Command names:** `/maybe` is `/interested`, with `/hmm` as another name; `/coming` is another name of `/join`; `/little`, `/great`, `/ultra`, `/master` are `/rank` in that league. The button ids (`party:<id>:maybe`) stay.
5. **`/counters`** already says "About N trainers with the best counters" from Pokebattler's estimator: nothing to build.

Rulings made without Matt (asleep), to look at: meetups keep the Remote button they have today (the drafts showed none: one line to change); thread titles and forum tags still say "T5" while the post says "Level 5 raid" (renaming posts is rate-limited); empty status lines show as "Present (0)" in the one-group layout so their buttons have a place; with several groups "Join A" makes a member Coming in A (from not signed up, Interested or Present) and only moves one who is Coming.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network** (the upload script's download and upload are not run by tests).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8a`). Apply it exactly; `git diff <that commit> -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` and the build after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. A post that Discord refuses never updates again: every state of every kind (five groups, pictures, Set time, Screenshot feedback, long names, long notes and labels full of Markdown characters, a 50-stop route) stays within 40 components and the text budget, for the post and every copy.
2. Every member can still do what today's buttons allowed, in every layout (one group, several groups, ended, copies without the move row).
3. A classic message is converted by an edit, and an ordinary edit of a v2 message sends nothing Discord refuses.
4. The forum's first message: whichever path Discord takes, no stray "Setting up this post…" stays, no raid without a post, no post without a raid.
5. Emoji: a post shows icons once the application's list is read, and words, never broken markup, without it.

---


### Task 1: Components-v2 messages in the gateway and the fake gateway

Prototype commit: `9c585fe0abebfde25b486364d03da58c82b9ae2f`

OutgoingMessage is a union of ClassicMessage and V2Message; a V2Message
carries only components, by type. discordPayload sends and edits a v2
message with its flag and components only; editAs sends an edit and,
only when Discord refuses a v2 edit (a classic message still has its
content), sends it once more through the REST route with content and
embeds cleared (conversionBody), so a classic post is converted by its
next edit. DMs, spawn reports and gym views are typed as classic.

The fake gateway is as strict as Discord about v2 messages (no content
or embeds, at most 40 components counted with nested ones, at most
4,000 characters of text displays or a test's textLimit, sections with
an accessory, rows of one to five controls, unique custom ids, link
buttons with an address and no custom id, https thumbnails only beside
a section, no empty or nested container, accent colours in range),
checks post edits too, refuses turning a v2 message back into a
classic one, and can refuse a v2 starter of a post (refuseV2Starter).
It refuses as Discord does, with Invalid Form Body (refusedBody), so
the retries on that answer run in tests. test/support/messages.ts
reads messages in tests.

**Files:**

```
 src/app.ts                              |   2 +-
 src/components/party.train-copy.test.ts |   5 +-
 src/discord/dm-gateway.ts               |   6 +-
 src/discord/party-gateway.test.ts       | 126 +++++++++++++++++++++++-
 src/discord/party-gateway.ts            | 148 +++++++++++++++++++++++++---
 src/render/gym-view.ts                  |   4 +-
 src/render/mirrors.ts                   |   4 +-
 src/render/notify-dm.ts                 |   4 +-
 src/render/party-post.ts                |   4 +-
 src/render/spawn.ts                     |   8 +-
 src/services/attendance-service.test.ts |   3 +-
 src/services/dm-sender.ts               |   4 +-
 src/services/notify-service.ts          |   6 +-
 src/services/party-mirrors.ts           |  12 +--
 src/services/party-service.ts           |   4 +-
 test/support/dms.ts                     |  10 +-
 test/support/fake-gateway.test.ts       | 264 ++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/fake-gateway.ts            | 274 +++++++++++++++++++++++++++++++++++++++++++++-------
 test/support/messages.test.ts           |  92 ++++++++++++++++++
 test/support/messages.ts                | 131 +++++++++++++++++++++++++
 20 files changed, 1023 insertions(+), 88 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/components/party.train-copy.test.ts src/discord/party-gateway.test.ts src/services/attendance-service.test.ts test/support/fake-gateway.test.ts test/support/messages.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 9c585fe0abebfde25b486364d03da58c82b9ae2f -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Components-v2 messages in the gateway and the fake gateway`, the body above and the trailer, staging exactly
  `src/app.ts src/components/party.train-copy.test.ts src/discord/dm-gateway.ts src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/render/gym-view.ts src/render/mirrors.ts src/render/notify-dm.ts src/render/party-post.ts src/render/spawn.ts src/services/attendance-service.test.ts src/services/dm-sender.ts src/services/notify-service.ts src/services/party-mirrors.ts src/services/party-service.ts test/support/dms.ts test/support/fake-gateway.test.ts test/support/fake-gateway.ts test/support/messages.test.ts test/support/messages.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index b18231f6e0fc224a161315c257712bc450f566b9..bf64a831c32f4c3c275ffe5625e05fa6a1e71afa 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -149,7 +149,7 @@ export async function startApp(
   const regionRepository = new RegionRepository(db);
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
-  const partyGateway = new DiscordPartyGateway();
+  const partyGateway = new DiscordPartyGateway(log);
   // The servers of the client that ended up connected, once it is ready.
   let botServers: () => readonly string[] = () => [];
   // Changes of the boss list and a list that is out of date, told to the servers once the client
diff --git a/src/components/party.train-copy.test.ts b/src/components/party.train-copy.test.ts
index f503c05acc9105ddcc423a0d797be6022c01111f..ddf4d4ce205bb5c10668b66670d0c35a73398b21 100644
--- a/src/components/party.train-copy.test.ts
+++ b/src/components/party.train-copy.test.ts
@@ -1,3 +1,4 @@
+import { customIdsOf } from '../../test/support/messages.js';
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
@@ -40,9 +41,7 @@ async function setup() {
     .messagesIn(EAST_CHANNEL)
     .find((sent) => sent.message.embeds !== undefined);
   if (!copy) throw new Error('the train has no copy in the channel of East');
-  const ids = (copy.message.components ?? []).flatMap((row) =>
-    row.components.flatMap((control) => ('custom_id' in control ? [control.custom_id] : [])),
-  );
+  const ids = customIdsOf(copy.message);
   /** A press on the last button of the copy that has this action, by Alice unless said otherwise. */
   const press = async (action: string, userId = ALICE): Promise<FakeInteraction> => {
     const customId = ids.findLast((id) => decodeCustomId(id)?.action === action);
diff --git a/src/discord/dm-gateway.ts b/src/discord/dm-gateway.ts
index 41203117ab08c482c693b90347756a52381caa79..39bd88237daab0fe597aca26ecd3d657b1175839 100644
--- a/src/discord/dm-gateway.ts
+++ b/src/discord/dm-gateway.ts
@@ -1,6 +1,6 @@
 import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, type Client } from 'discord.js';
 import { BoundedMap } from '../bounded-map.js';
-import { discordPayload, type OutgoingMessage } from './party-gateway.js';
+import { discordPayload, type ClassicMessage } from './party-gateway.js';
 
 /**
  * What became of a direct message: `sent` when it went out; `closed` when Discord says this
@@ -16,7 +16,7 @@ export type DmOutcome = 'sent' | 'closed' | 'slow-down';
  * send this message to this user. Throws for any failure that `DmOutcome` does not name.
  */
 export interface DmGateway {
-  send(userId: string, message: OutgoingMessage): Promise<DmOutcome>;
+  send(userId: string, message: ClassicMessage): Promise<DmOutcome>;
 }
 
 /** Discord's answers that mean "nobody can write to this member", which no retry changes. */
@@ -70,7 +70,7 @@ export class DiscordDmGateway implements DmGateway {
     this.current = client;
   }
 
-  async send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
+  async send(userId: string, message: ClassicMessage): Promise<DmOutcome> {
     const client = this.current;
     if (!client) throw new Error('Discord is not connected yet');
     const known = this.channels.get(userId);
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index 79cdbcd2d869fa1d9f80914d6fcca5df35416100..2c1102ea5bc27ea983d90e8324a14e72ca794f48 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -1,7 +1,22 @@
-import { DiscordAPIError, RESTJSONErrorCodes, RateLimitError } from 'discord.js';
+import {
+  ComponentType,
+  DiscordAPIError,
+  MessageFlags,
+  RESTJSONErrorCodes,
+  RateLimitError,
+} from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { FakePartyGateway } from '../../test/support/fake-gateway.js';
-import { isGone, isMissingPermission, isRefusedBody, rateLimitWaitMs } from './party-gateway.js';
+import {
+  conversionBody,
+  editAs,
+  discordPayload,
+  isGone,
+  isMissingPermission,
+  isRefusedBody,
+  rateLimitWaitMs,
+  type OutgoingMessage,
+} from './party-gateway.js';
 
 function apiError(code: number, status = 404): DiscordAPIError {
   return new DiscordAPIError({ code, message: 'no' }, code, status, 'GET', '/x', {});
@@ -266,3 +281,110 @@ describe('FakePartyGateway', () => {
     });
   });
 });
+
+describe('discordPayload and editAs', () => {
+  const v2: OutgoingMessage = {
+    v2: true,
+    components: [{ type: ComponentType.TextDisplay, content: 'hello' }],
+  };
+
+  it('send a classic message with its content, embeds and rows, pinging nobody unnamed', () => {
+    const classic: OutgoingMessage = { content: 'hi', mention: { users: ['1'] } };
+    const payload = {
+      content: 'hi',
+      embeds: [],
+      components: [],
+      allowedMentions: { parse: [], users: ['1'], roles: [] },
+    };
+    expect(discordPayload(classic)).toEqual(payload);
+  });
+
+  it('send a components-v2 message with its flag and without content or embeds', () => {
+    const payload = discordPayload(v2);
+    expect(payload).toEqual({
+      components: v2.components,
+      flags: MessageFlags.IsComponentsV2,
+      allowedMentions: { parse: [], users: [], roles: [] },
+    });
+    expect(payload).not.toHaveProperty('content');
+    expect(payload).not.toHaveProperty('embeds');
+  });
+
+  /** Discord as far as an edit goes: a classic message takes a v2 edit only with its content and embeds cleared. */
+  function discord(classic: boolean) {
+    const edits: object[] = [];
+    const conversions: object[] = [];
+    return {
+      edits,
+      conversions,
+      edit: (payload: object) => {
+        edits.push(payload);
+        if (classic && 'flags' in payload) {
+          return Promise.reject(apiError(RESTJSONErrorCodes.InvalidFormBodyOrContentType, 400));
+        }
+        return Promise.resolve();
+      },
+      convert: (body: object) => {
+        conversions.push(body);
+        return Promise.resolve();
+      },
+    };
+  }
+
+  it('edits a v2 message with its flag and components only, nothing cleared', async () => {
+    const target = discord(false);
+    await editAs(v2, target.edit, target.convert);
+    expect(target.edits).toEqual([discordPayload(v2)]);
+    expect(target.edits[0]).not.toHaveProperty('content');
+    expect(target.edits[0]).not.toHaveProperty('embeds');
+    expect(target.conversions).toEqual([]);
+  });
+
+  it('converts a classic message once Discord refuses the edit, clearing content and embeds', async () => {
+    const target = discord(true);
+    await editAs(v2, target.edit, target.convert);
+    expect(target.edits).toHaveLength(1);
+    expect(target.conversions).toEqual([
+      {
+        content: null,
+        embeds: [],
+        components: v2.components,
+        flags: MessageFlags.IsComponentsV2,
+        allowed_mentions: { parse: [], users: [], roles: [] },
+      },
+    ]);
+    expect(conversionBody(v2)).toEqual(target.conversions[0]);
+  });
+
+  it('says with what code Discord refused the edit it converts after', async () => {
+    const target = discord(true);
+    const codes: unknown[] = [];
+    await editAs(v2, target.edit, target.convert, {
+      refused: (code) => {
+        codes.push(code);
+      },
+    });
+    expect(codes).toEqual([RESTJSONErrorCodes.InvalidFormBodyOrContentType]);
+    expect(target.conversions).toHaveLength(1);
+  });
+
+  it('converts at once a message its caller knows to be classic, without a doomed edit', async () => {
+    const target = discord(true);
+    await editAs(v2, target.edit, target.convert, { convert: true });
+    expect(target.edits).toEqual([]);
+    expect(target.conversions).toEqual([conversionBody(v2)]);
+    // A classic message is edited as it is, whatever the caller said.
+    await editAs({ content: 'hi' }, target.edit, target.convert, { convert: true });
+    expect(target.edits).toHaveLength(1);
+    expect(target.conversions).toHaveLength(1);
+  });
+
+  it('edits a classic message as it is, and passes on any other failure', async () => {
+    const target = discord(true);
+    await editAs({ content: 'hi' }, target.edit, target.convert);
+    expect(target.conversions).toEqual([]);
+    const gone = apiError(RESTJSONErrorCodes.UnknownMessage);
+    await expect(editAs(v2, () => Promise.reject(gone), target.convert)).rejects.toBe(gone);
+    expect(target.conversions).toEqual([]);
+  });
+});
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 2baabcc432de2402b09ce915a33ce45677934ba5..3ce14d447c3e569cbd2dd14ff953ab1bad364592 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -2,31 +2,54 @@ import {
   ChannelFlags,
   ChannelType,
   DiscordAPIError,
+  MessageFlags,
   OverwriteType,
   PermissionFlagsBits,
   RESTJSONErrorCodes,
   RateLimitError,
+  Routes,
   ThreadAutoArchiveDuration,
   type APIActionRowComponent,
   type APIComponentInMessageActionRow,
   type APIEmbed,
+  type APIMessageTopLevelComponent,
   type Client,
   type ForumChannel,
   type AnyThreadChannel,
   type GuildMember,
 } from 'discord.js';
+import type { Logger } from '../log.js';
 import type { ServerChannel } from '../domain/regions/region-import.js';
 import { fetchGuildMember } from './member-directory.js';
 
-/** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
-export interface OutgoingMessage {
+/** Members and roles a message may ping; everything else in it stays silent. */
+interface Mentions {
+  mention?: { users?: string[]; roles?: string[] };
+}
+
+/** A message of text, embeds and rows of controls under them. */
+export interface ClassicMessage extends Mentions {
+  v2?: false;
   content?: string;
   embeds?: APIEmbed[];
   components?: APIActionRowComponent<APIComponentInMessageActionRow>[];
-  /** Members and roles the message may ping; everything else in it stays silent. */
-  mention?: { users?: string[]; roles?: string[] };
 }
 
+/**
+ * A message made of components alone (Discord's components v2: containers, sections, text
+ * displays, separators, thumbnails and rows). It can carry no content and no embeds: Discord
+ * refuses those beside the flag. A message that is v2 stays v2: every edit sends the flag again.
+ */
+export interface V2Message extends Mentions {
+  v2: true;
+  components: APIMessageTopLevelComponent[];
+  content?: never;
+  embeds?: never;
+}
+
+/** A message this bot sends or edits. Nobody is pinged unless `mention` names them. */
+export type OutgoingMessage = ClassicMessage | V2Message;
+
 /**
  * How a member stands to a forum. `visible`: they can see it. `hidden`: they cannot, and nothing
  * says that they in particular should not. `barred`: they cannot, and somebody set that on
@@ -86,7 +109,7 @@ export interface PartyGateway {
    * Replaces the post's first message. False when the post is gone, and also when only its first
    * message was deleted (the thread may still exist: `postInfo` still answers then).
    */
-  editPost(postId: string, message: OutgoingMessage): Promise<boolean>;
+  editPost(postId: string, message: OutgoingMessage, options?: EditOptions): Promise<boolean>;
   /**
    * Changes the post's title. Discord allows two renames in ten minutes: `{ laterMs }` when it
    * refused for that reason, with the wait Discord named (nothing waits for the limit to free),
@@ -128,7 +151,12 @@ export interface PartyGateway {
    * Replaces a message this bot sent, in a text channel or a post. False when the message or its
    * channel is gone.
    */
-  editMessage(channelId: string, messageId: string, message: OutgoingMessage): Promise<boolean>;
+  editMessage(
+    channelId: string,
+    messageId: string,
+    message: OutgoingMessage,
+    options?: EditOptions,
+  ): Promise<boolean>;
   /** Deletes a message; one that is already gone is fine. */
   deleteMessage(channelId: string, messageId: string): Promise<void>;
   /**
@@ -280,20 +308,81 @@ export function rateLimitWaitMs(err: unknown): number | undefined {
     : undefined;
 }
 
+function allowedMentions(message: OutgoingMessage) {
+  return {
+    parse: [],
+    users: message.mention?.users ?? [],
+    roles: message.mention?.roles ?? [],
+  };
+}
+
 /** A message as discord.js sends it: nobody is pinged but whom `mention` names. */
 export function discordPayload(message: OutgoingMessage) {
+  if (message.v2) {
+    return {
+      components: message.components,
+      flags: MessageFlags.IsComponentsV2 as const,
+      allowedMentions: allowedMentions(message),
+    };
+  }
   return {
     content: message.content ?? '',
     embeds: message.embeds ?? [],
     components: message.components ?? [],
-    allowedMentions: {
-      parse: [],
-      users: message.mention?.users ?? [],
-      roles: message.mention?.roles ?? [],
-    },
+    allowedMentions: allowedMentions(message),
+  };
+}
+
+/**
+ * The body of the edit that makes a classic message (a post made before the posts were v2) a
+ * components-v2 message, as the API takes it: content and embeds cleared (`null` stays `null`
+ * only on this route; discord.js would send an empty text), the flag, the components.
+ */
+export function conversionBody(message: V2Message) {
+  return {
+    content: null,
+    embeds: [],
+    components: message.components,
+    flags: MessageFlags.IsComponentsV2,
+    allowed_mentions: allowedMentions(message),
   };
 }
 
+/** How an edit is made (`editPost`, `editMessage`). */
+export interface EditOptions {
+  /**
+   * The caller knows the message is classic (a post's first line of text): a v2 edit converts
+   * it at once (`conversionBody`) instead of trying the plain edit Discord would refuse.
+   */
+  convert?: boolean;
+}
+
+/**
+ * Edits a message into `message`: through `edit` as `discordPayload` makes it (a v2 message
+ * with its flag and components only). When Discord refuses a v2 edit for its form (a classic
+ * message still has content or embeds), it is made once more through `convert` with those
+ * cleared (`conversionBody`), and `refused` is told Discord's code; a caller that knows the
+ * message is classic (`convert`) converts it at once. Any other failure is passed on.
+ */
+export async function editAs(
+  message: OutgoingMessage,
+  edit: (payload: ReturnType<typeof discordPayload>) => Promise<unknown>,
+  convert: (body: ReturnType<typeof conversionBody>) => Promise<unknown>,
+  how: EditOptions & { refused?: (code: number | string) => void } = {},
+): Promise<void> {
+  if (message.v2 && how.convert) {
+    await convert(conversionBody(message));
+    return;
+  }
+  try {
+    await edit(discordPayload(message));
+  } catch (err) {
+    if (!message.v2 || !isRefusedBody(err)) throw err;
+    if (err instanceof DiscordAPIError) how.refused?.(err.code);
+    await convert(conversionBody(message));
+  }
+}
+
 /**
  * The gateway over a discord.js client. The client is handed over once it exists (the login
  * may try several clients); anything asked before that fails.
@@ -301,6 +390,22 @@ export function discordPayload(message: OutgoingMessage) {
 export class DiscordPartyGateway implements PartyGateway {
   private current: Client | undefined;
 
+  /** `log` hears of every classic message converted after Discord refused a plain edit. */
+  constructor(private readonly log?: Logger) {}
+
+  /** What `editAs` is told: the caller's options, and the refusal a conversion follows, logged. */
+  private editHow(messageId: string, options?: EditOptions) {
+    return {
+      ...options,
+      refused: (code: number | string) => {
+        this.log?.info(
+          { message: messageId, code },
+          'Discord refused a components-v2 edit of a classic message; converting it',
+        );
+      },
+    };
+  }
+
   /** The client to talk through from now on. */
   use(client: Client): void {
     this.current = client;
@@ -470,13 +575,22 @@ export class DiscordPartyGateway implements PartyGateway {
     if (post.archived) await post.setArchived(false);
   }
 
-  async editPost(postId: string, message: OutgoingMessage): Promise<boolean> {
+  async editPost(
+    postId: string,
+    message: OutgoingMessage,
+    options?: EditOptions,
+  ): Promise<boolean> {
     const post = await this.post(postId);
     if (!post) return false;
     // The first message of a forum post has the id of the post.
     return this.done(async () => {
       await this.reopen(post);
-      await post.messages.edit(postId, discordPayload(message));
+      await editAs(
+        message,
+        (payload) => post.messages.edit(postId, payload),
+        (body) => this.client.rest.patch(Routes.channelMessage(postId, postId), { body }),
+        this.editHow(postId, options),
+      );
     });
   }
 
@@ -563,12 +677,18 @@ export class DiscordPartyGateway implements PartyGateway {
     channelId: string,
     messageId: string,
     message: OutgoingMessage,
+    options?: EditOptions,
   ): Promise<boolean> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel?.isTextBased()) return false;
     return this.done(async () => {
       if (channel.isThread()) await this.reopen(channel);
-      await channel.messages.edit(messageId, discordPayload(message));
+      await editAs(
+        message,
+        (payload) => channel.messages.edit(messageId, payload),
+        (body) => this.client.rest.patch(Routes.channelMessage(channelId, messageId), { body }),
+        this.editHow(messageId, options),
+      );
     });
   }
 
diff --git a/src/render/gym-view.ts b/src/render/gym-view.ts
index d48bb97b29d238e9cdbe6ce9621bc41f3c0a7a89..a543dce94355823f47b67851691ec834127efbeb 100644
--- a/src/render/gym-view.ts
+++ b/src/render/gym-view.ts
@@ -1,5 +1,5 @@
 import type { APIEmbed, APIEmbedField } from 'discord.js';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import { addressLine } from '../domain/geo/google.js';
 import { tidyLine } from '../domain/gyms/gym-text.js';
 import { isEliteGym } from '../domain/party/raid.js';
@@ -78,7 +78,7 @@ export function regionsSentence(regions: readonly { channelId: string }[]): stri
 export function gymAnnouncement(
   gym: NamedGym,
   regions: readonly { channelId: string }[],
-): OutgoingMessage {
+): ClassicMessage {
   const lines = [
     ...(gym.nickname ? [`Also known as **${shown(gym.nickname, NAMED.name)}**.`] : []),
     regionsSentence(regions),
diff --git a/src/render/mirrors.ts b/src/render/mirrors.ts
index 1d984aeab7a7ef638e8e2dee8900a28d3256aac6..174017becd0b36f68009c7cbf5f2fd6ab5e11622 100644
--- a/src/render/mirrors.ts
+++ b/src/render/mirrors.ts
@@ -1,4 +1,4 @@
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import type { MirrorKind } from '../domain/party/party.js';
 import { invitationControls } from './party-controls.js';
 import type { RenderedPost } from './party-post.js';
@@ -28,7 +28,7 @@ export function renderMirror(
   kind: MirrorKind,
   rendered: RenderedPost,
   place: MirrorPlace,
-): OutgoingMessage {
+): ClassicMessage {
   if (kind === 'status') return rendered.message;
   if (kind === 'region') {
     return {
diff --git a/src/render/notify-dm.ts b/src/render/notify-dm.ts
index abbd63794ddfbe0b78233309e3bf22841fb822e0..b4959238e251f3377ec09917dae9df6812122043 100644
--- a/src/render/notify-dm.ts
+++ b/src/render/notify-dm.ts
@@ -7,7 +7,7 @@ import {
   type APIEmbed,
 } from 'discord.js';
 import { encodeCustomIdIfFits } from '../discord/custom-id.js';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import { stopArgs, type NotifyReason } from '../domain/notify/reasons.js';
 import { raidTierLabel, type RaidTier } from '../domain/pogo/raid-tier.js';
 import { memberName, plain, truncate, type NamedMember } from './text.js';
@@ -270,7 +270,7 @@ export function notifyDm(
   sentence: string,
   reasons: readonly ShownReason[],
   embed: APIEmbed | undefined,
-): OutgoingMessage {
+): ClassicMessage {
   const lines = [sentence, reasonLine(reasons), stopHint(reasons)].filter((line) => line !== '');
   const rows = stopRow(reasons);
   return {
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 312cd2b6b89e00ea646f5fdf4cd8c83c0c836cf1..a10100cee555107b34c2bd8c1d656eccf20579c2 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -1,5 +1,5 @@
 import type { APIEmbed, APIEmbedField } from 'discord.js';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import {
   headCount,
   membersWhere,
@@ -60,7 +60,7 @@ export interface RenderedPost {
    * The whole first message, the one that is sent and edited: the embed and the controls. This
    * is the only place that builds it.
    */
-  message: OutgoingMessage;
+  message: ClassicMessage;
 }
 
 /** Runs of white space become one space and the ends are trimmed: Discord keeps titles so. */
diff --git a/src/render/spawn.ts b/src/render/spawn.ts
index 9c8434961b58067843e08917d597f2c3cedaab4c..ac76d8735e791fa216afaeea0652788a3aacb29a 100644
--- a/src/render/spawn.ts
+++ b/src/render/spawn.ts
@@ -1,5 +1,5 @@
 import type { APIEmbed } from 'discord.js';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import { memberName, memberText, plain, plainNoLinks, type NamedMember } from './text.js';
 
 /** The colour of a spawn report, as the legacy bot's. */
@@ -65,7 +65,7 @@ export function spawnEmbed(view: SpawnView, footer?: string): APIEmbed {
  * The public message in the region's text channel: who reported what, in a sentence that pings
  * nobody, with the embed and its footer (`spawnFooter`). It is deleted after `SPAWN_MINUTES`.
  */
-export function spawnMessage(view: SpawnView, footer: string): OutgoingMessage {
+export function spawnMessage(view: SpawnView, footer: string): ClassicMessage {
   return {
     content: `A wild ${spawnName(view)} has been reported by ${memberText(view.reporter)}:`,
     embeds: [spawnEmbed(view, footer)],
@@ -77,7 +77,7 @@ export function spawnMessage(view: SpawnView, footer: string): OutgoingMessage {
  * the message without its embed, and the report without where it is): everything as text, the
  * footer in small print, no picture.
  */
-export function spawnTextMessage(view: SpawnView, footer: string): OutgoingMessage {
+export function spawnTextMessage(view: SpawnView, footer: string): ClassicMessage {
   const { content = '' } = spawnMessage(view, footer);
   const { description = '' } = spawnEmbed(view);
   return { content: `${content}\n${description}\n-# ${footer}` };
@@ -97,6 +97,6 @@ export function spawnSentence(view: SpawnView, regionChannelId: string, link?: s
 }
 
 /** The message in the server's channel for Unown sightings, which stays. */
-export function sightingMessage(view: SpawnView, regionChannelId: string): OutgoingMessage {
+export function sightingMessage(view: SpawnView, regionChannelId: string): ClassicMessage {
   return { content: spawnSentence(view, regionChannelId), embeds: [spawnEmbed(view)] };
 }
diff --git a/src/services/attendance-service.test.ts b/src/services/attendance-service.test.ts
index ab71de7e6b3e412351afbd0acc275308e42e9144..ae2d5963badaeed69c6d28e1b8add10f76ed1298 100644
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -1,3 +1,4 @@
+import { rowsOf } from '../../test/support/messages.js';
 import { describe, expect, it } from 'vitest';
 import {
   ALICE,
@@ -186,7 +187,7 @@ describe('AttendanceService: completing a raid', () => {
       .find((message) => message.message.components?.length);
     expect(question?.message.content).toContain(`<@${BOB}>, <@${CAROL}>: have you completed`);
     expect(question?.message.mention).toEqual({ users: [CAROL] });
-    const ids = question?.message.components?.[0]?.components.map((c) =>
+    const ids = rowsOf(question?.message)[0]?.components.map((c) =>
       'custom_id' in c ? decodeCustomId(c.custom_id) : undefined,
     );
     expect(ids).toEqual([
diff --git a/src/services/dm-sender.ts b/src/services/dm-sender.ts
index 3bf8f37cc2331cc2241bd569052ec4a26d1a8d66..c1c9cde8b54bda5b9f158465412a59c307de8f0a 100644
--- a/src/services/dm-sender.ts
+++ b/src/services/dm-sender.ts
@@ -1,7 +1,7 @@
 import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
 import { BoundedMap } from '../bounded-map.js';
 import type { DmGateway, DmOutcome } from '../discord/dm-gateway.js';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import type { Logger } from '../log.js';
 
 /**
@@ -26,7 +26,7 @@ export interface DmJob {
    * The message, built by the caller once per event: the sender renders nothing, and the jobs
    * of one event may share the object.
    */
-  message: OutgoingMessage;
+  message: ClassicMessage;
   priority: DmPriority;
   /** When what the message is about happened (epoch ms): delivery time is measured from it. */
   eventAt: number;
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 63d7524602f73944409a08e2d870bd0198d97ad5..5295271cfbed468467f1f1e788739839196e309e 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -6,7 +6,7 @@ import type { NewTrainStorage } from '../db/repositories/new-train-repository.js
 import type { UserSettingsReader } from '../db/repositories/user-repository.js';
 import type { MemberDirectory } from '../discord/member-directory.js';
 import { MEMBERS_PER_LOOKUP } from '../discord/member-viewers.js';
-import type { OutgoingMessage } from '../discord/party-gateway.js';
+import type { ClassicMessage } from '../discord/party-gateway.js';
 import {
   bossId,
   raidNumbers,
@@ -185,7 +185,7 @@ interface Announcement {
   expiresAt: number;
   gather(guildId: string): Promise<Candidates>;
   /** The message for a member these reasons fired for; built once per set of reasons. */
-  message(guildId: string, reasons: readonly NotifyReason[]): OutgoingMessage;
+  message(guildId: string, reasons: readonly NotifyReason[]): ClassicMessage;
   priority(reasons: readonly NotifyReason[]): DmPriority;
 }
 
@@ -803,7 +803,7 @@ export class NotifyService implements PartyNotifier {
     if (guildId === undefined) return;
     const { ids, reasonsOf } = await event.gather(guildId);
     /** The message per set of reasons; null for a set whose message could not be made. */
-    const messages = new Map<string, OutgoingMessage | null>();
+    const messages = new Map<string, ClassicMessage | null>();
     let told = 0;
     for (let start = 0; start < ids.length; start += BATCH) {
       // The party ended meanwhile: nobody else is told, and nothing more is remembered.
diff --git a/src/services/party-mirrors.ts b/src/services/party-mirrors.ts
index 51d888f3b79efa8aad2fea67241e12efb85e268e..897c8e9be1a67f9cf80f21de5c2392c2145a1041 100644
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -2,7 +2,7 @@ import type { Settings } from '../config/settings.js';
 import {
   isMissingPermission,
   isRefusedBody,
-  type OutgoingMessage,
+  type ClassicMessage,
   type PartyGateway,
 } from '../discord/party-gateway.js';
 import {
@@ -62,14 +62,14 @@ export interface PartyMirrorsOptions {
 }
 
 /** The message without the picture of its embeds, for when Discord refuses the picture. */
-function withoutPicture(message: OutgoingMessage): OutgoingMessage {
+function withoutPicture(message: ClassicMessage): ClassicMessage {
   return {
     ...message,
     embeds: (message.embeds ?? []).map(({ thumbnail: _picture, ...rest }) => rest),
   };
 }
 
-function hasPicture(message: OutgoingMessage): boolean {
+function hasPicture(message: ClassicMessage): boolean {
   return (message.embeds ?? []).some((embed) => embed.thumbnail !== undefined);
 }
 
@@ -397,7 +397,7 @@ export class PartyMirrors {
   }
 
   /** Edits a copy unless it shows this already. False when the copy is gone. */
-  private async edit(mirror: MirrorMessage, message: OutgoingMessage): Promise<boolean> {
+  private async edit(mirror: MirrorMessage, message: ClassicMessage): Promise<boolean> {
     const { gateway, log } = this.options;
     const key = JSON.stringify(message);
     if (this.sent.get(mirror.messageId) === key) return true;
@@ -420,7 +420,7 @@ export class PartyMirrors {
   }
 
   /** Sends a message; when Discord refuses its picture, once more without it. */
-  private async send(channelId: string, message: OutgoingMessage): Promise<string | undefined> {
+  private async send(channelId: string, message: ClassicMessage): Promise<string | undefined> {
     const { gateway, log } = this.options;
     try {
       return await gateway.sendMessage(channelId, message);
@@ -442,7 +442,7 @@ export class PartyMirrors {
     partyId: string,
     kind: MirrorKind,
     channelId: string,
-    message: OutgoingMessage,
+    message: ClassicMessage,
   ): Promise<'recorded' | 'no-channel' | 'unrecorded'> {
     const { store, gateway, log } = this.options;
     const messageId = await this.send(channelId, message);
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 30b3d5a95c20a6e9b4b7842dce9e1df2375af775..94f1251895922f0c2cdc869133c15aac17388258 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -7,7 +7,7 @@ import {
   isMissingPermission,
   isRefusedBody,
   rateLimitWaitMs,
-  type OutgoingMessage,
+  type ClassicMessage,
   type PartyGateway,
   type TagIds,
 } from '../discord/party-gateway.js';
@@ -472,7 +472,7 @@ export class PartyService {
   }
 
   /** The message of a rendered post without the picture of its embeds. */
-  private static withoutPicture(rendered: RenderedPost): OutgoingMessage {
+  private static withoutPicture(rendered: RenderedPost): ClassicMessage {
     return {
       ...rendered.message,
       embeds: (rendered.message.embeds ?? []).map(({ thumbnail: _picture, ...rest }) => rest),
diff --git a/test/support/dms.ts b/test/support/dms.ts
index 8790db8b1eaea202b321dfae278149062ad121dd..f1f899bf41c5f91c7ecf0175797f7a18aa10ed73 100644
--- a/test/support/dms.ts
+++ b/test/support/dms.ts
@@ -1,5 +1,5 @@
 import type { DmGateway, DmOutcome } from '../../src/discord/dm-gateway.js';
-import type { OutgoingMessage } from '../../src/discord/party-gateway.js';
+import type { ClassicMessage } from '../../src/discord/party-gateway.js';
 import type {
   DmJob,
   DmSender,
@@ -20,7 +20,7 @@ import { FakePartyGateway } from './fake-gateway.js';
  * their way at once.
  */
 export class FakeDmGateway implements DmGateway {
-  readonly sent: { userId: string; message: OutgoingMessage }[] = [];
+  readonly sent: { userId: string; message: ClassicMessage }[] = [];
   readonly closed = new Set<string>();
   /** A send to one of these is answered `slow-down`, as when Discord opens no more DM channels. */
   readonly slow = new Set<string>();
@@ -39,7 +39,7 @@ export class FakeDmGateway implements DmGateway {
     for (const answer of this.held.splice(0)) answer();
   }
 
-  send(userId: string, message: OutgoingMessage): Promise<DmOutcome> {
+  send(userId: string, message: ClassicMessage): Promise<DmOutcome> {
     this.asked.push(userId);
     this.running += 1;
     this.most = Math.max(this.most, this.running);
@@ -72,7 +72,7 @@ export class FakeDmGateway implements DmGateway {
   }
 
   /** The messages that went to one member, oldest first. */
-  to(userId: string): OutgoingMessage[] {
+  to(userId: string): ClassicMessage[] {
     return this.sent.filter((sent) => sent.userId === userId).map((sent) => sent.message);
   }
 }
@@ -86,7 +86,7 @@ export class RecordingDms implements DmSender {
   }
 
   /** The messages for one member, in the order they were put in line. */
-  to(userId: string): OutgoingMessage[] {
+  to(userId: string): ClassicMessage[] {
     return this.jobs.filter((job) => job.userId === userId).map((job) => job.message);
   }
 
diff --git a/test/support/fake-gateway.test.ts b/test/support/fake-gateway.test.ts
index e788003278f308c58341c191c6f0e730511cbdd8..16c1e0ac9e4da20319da3f21152359b83bd65f13 100644
--- a/test/support/fake-gateway.test.ts
+++ b/test/support/fake-gateway.test.ts
@@ -1,4 +1,10 @@
+import { ButtonStyle, ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import {
+  isRefusedBody,
+  type OutgoingMessage,
+  type V2Message,
+} from '../../src/discord/party-gateway.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { EAST_FORUM, WEST_FORUM } from './gyms.js';
 import { ALICE, BOB } from './parties.js';
@@ -302,3 +308,261 @@ describe('FakePartyGateway: the channels of a server', () => {
     expect(await fake.openPosts(WEST_FORUM)).toBeUndefined();
   });
 });
+
+describe('FakePartyGateway: the limits of a components-v2 message', () => {
+  const POST = '300000000000000001';
+  const FORUM = '300000000000000002';
+  const text = (content: string) => ({ type: ComponentType.TextDisplay, content });
+  const button = (id: string, label = 'Go') => ({
+    type: ComponentType.Button,
+    style: ButtonStyle.Secondary,
+    label,
+    custom_id: id,
+  });
+  const thumbnail = (url: string) => ({ type: ComponentType.Thumbnail, media: { url } });
+  const container = (...components: object[]) => ({ type: ComponentType.Container, components });
+  const message = (...components: object[]) => ({ v2: true, components }) as V2Message;
+
+  async function sending(sent: OutgoingMessage): Promise<string> {
+    const fake = new FakePartyGateway();
+    try {
+      await fake.sendMessage(POST, sent);
+      return 'sent';
+    } catch (err) {
+      return err instanceof Error ? err.message : String(err);
+    }
+  }
+
+  it('takes a container of text, a section with a button, a thumbnail and a row', async () => {
+    expect(
+      await sending(
+        message(
+          container(
+            {
+              type: ComponentType.Section,
+              components: [text('### Title')],
+              accessory: thumbnail('https://x.test/a.png'),
+            },
+            { type: ComponentType.Separator, divider: true, spacing: 1 },
+            { type: ComponentType.Section, components: [text('Coming')], accessory: button('a') },
+            { type: ComponentType.ActionRow, components: [button('b'), button('c')] },
+          ),
+        ),
+      ),
+    ).toBe('sent');
+  });
+
+  it('refuses content or embeds beside the flag, even empty ones', async () => {
+    const refused = /^Invalid Form Body: a v2 message has no content/;
+    expect(await sending({ ...message(text('a')), content: '' } as never)).toMatch(refused);
+    expect(await sending({ ...message(text('a')), embeds: [] } as never)).toMatch(refused);
+  });
+
+  it('counts every component, nested ones included, up to 40', async () => {
+    // A container and 39 text displays are 40; one more is refused.
+    const many = (n: number) => Array.from({ length: n }, (_, i) => text(`line ${i}`));
+    expect(await sending(message(container(...many(39))))).toBe('sent');
+    expect(await sending(message(container(...many(40))))).toBe(
+      'Invalid Form Body: a message has at most 40 components, not 41',
+    );
+    // A section counts itself, its text and its button.
+    const sections = Array.from({ length: 14 }, (_, i) => ({
+      type: ComponentType.Section,
+      components: [text('x')],
+      accessory: button(`s${i}`),
+    }));
+    expect(await sending(message(...sections))).toBe(
+      'Invalid Form Body: a message has at most 40 components, not 42',
+    );
+  });
+
+  it('refuses more than 4000 characters over the text displays, and an empty one', async () => {
+    expect(await sending(message(text('a'.repeat(2000)), text('b'.repeat(2000))))).toBe('sent');
+    expect(await sending(message(text('a'.repeat(2000)), text('b'.repeat(2001))))).toBe(
+      'Invalid Form Body: the text displays have at most 4000 characters, not 4001',
+    );
+    expect(await sending(message(text(' ')))).toBe('Invalid Form Body: a text display needs text');
+  });
+
+  it('refuses a section without its accessory or with too many texts', async () => {
+    expect(await sending(message({ type: ComponentType.Section, components: [text('a')] }))).toBe(
+      'Invalid Form Body: a section needs a button or a thumbnail beside it',
+    );
+    expect(
+      await sending(
+        message({
+          type: ComponentType.Section,
+          components: [text('a'), text('b'), text('c'), text('d')],
+          accessory: button('a'),
+        }),
+      ),
+    ).toBe('Invalid Form Body: a section has 1 to 3 text displays, not 4');
+  });
+
+  it('refuses a custom id used twice, a long label, a full row and a nested container', async () => {
+    const row = (...buttons: object[]) => ({ type: ComponentType.ActionRow, components: buttons });
+    expect(await sending(message(row(button('a'), button('a'))))).toBe(
+      'Invalid Form Body: the custom id a is used twice in the message',
+    );
+    expect(await sending(message(row(button('a', 'l'.repeat(81)))))).toBe(
+      'Invalid Form Body: a button label has at most 80 characters',
+    );
+    expect(
+      await sending(message(row(...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => button(id))))),
+    ).toBe('Invalid Form Body: a row has 1 to 5 controls, not 6');
+    expect(await sending(message(container(container(text('a')))))).toBe(
+      'Invalid Form Body: a container cannot be inside another component',
+    );
+  });
+
+  it('refuses a thumbnail that is not at an https address', async () => {
+    const section = {
+      type: ComponentType.Section,
+      components: [text('a')],
+      accessory: thumbnail('http://x.test/a.png'),
+    };
+    expect(await sending(message(section))).toBe(
+      'Invalid Form Body: a thumbnail needs an https address',
+    );
+  });
+
+  it('lets an edit make a classic message v2, never back, and checks edits of posts', async () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(FORUM);
+    const post = { title: 'Old', message: { content: 'old' }, tagIds: [] };
+    const postId = (await fake.createPost(FORUM, post)) ?? '';
+    expect(await fake.editPost(postId, message(text('new')))).toBe(true);
+    await expect(fake.editPost(postId, { content: 'back' })).rejects.toThrow(
+      'a components-v2 message cannot become classic',
+    );
+    await expect(fake.editPost(postId, message(text(' ')))).rejects.toThrow('needs text');
+    const id = (await fake.sendMessage(POST, { content: 'hello' })) ?? '';
+    expect(await fake.editMessage(POST, id, message(text('new')))).toBe(true);
+    await expect(fake.editMessage(POST, id, { content: 'back' })).rejects.toThrow(
+      'cannot become classic',
+    );
+  });
+
+  it('records how a classic message became v2: told it was classic, or after a refused edit', async () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(FORUM);
+    const post = { title: 'Old', message: { content: 'old' }, tagIds: [] };
+    const known = (await fake.createPost(FORUM, post)) ?? '';
+    const unknown = (await fake.createPost(FORUM, post)) ?? '';
+    await fake.editPost(known, message(text('new')), { convert: true });
+    await fake.editPost(unknown, message(text('new')));
+    // A v2 message edited again is no conversion.
+    await fake.editPost(known, message(text('newer')), { convert: true });
+    const id = (await fake.sendMessage(POST, { content: 'hello' })) ?? '';
+    await fake.editMessage(POST, id, message(text('new')), { convert: true });
+    expect(fake.converted).toEqual([
+      { id: known, direct: true },
+      { id: unknown, direct: false },
+      { id, direct: true },
+    ]);
+  });
+
+  it('refuses a v2 first message of a post when told to, and a thumbnail when told to', async () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(FORUM);
+    fake.refuseV2Starter = true;
+    await expect(
+      fake.createPost(FORUM, { title: 'A', message: message(text('a')), tagIds: [] }),
+    ).rejects.toThrow('Invalid Form Body');
+    expect(
+      await fake.createPost(FORUM, { title: 'A', message: { content: 'a' }, tagIds: [] }),
+    ).toBeDefined();
+    fake.rejectThumbnails = true;
+    const pictured = message({
+      type: ComponentType.Section,
+      components: [text('a')],
+      accessory: thumbnail('https://x.test/a.png'),
+    });
+    await expect(fake.sendMessage(POST, pictured)).rejects.toThrow('Invalid Form Body');
+  });
+});
+
+describe('FakePartyGateway: how it refuses', () => {
+  const POST = '300000000000000001';
+  const FORUM = '300000000000000002';
+  const text = (content: string) => ({ type: ComponentType.TextDisplay, content });
+  const message = (...components: object[]) => ({ v2: true, components }) as V2Message;
+  const container = (...components: object[]) => ({ type: ComponentType.Container, components });
+
+  async function refusal(work: () => Promise<unknown>): Promise<unknown> {
+    try {
+      await work();
+      return undefined;
+    } catch (err) {
+      return err;
+    }
+  }
+
+  it('answers as Discord does, Invalid Form Body, for a message, a title or tags it will not take', async () => {
+    const fake = new FakePartyGateway();
+    fake.addForum(FORUM);
+    const refusals = [
+      await refusal(() => fake.sendMessage(POST, message(text(' ')))),
+      await refusal(() => fake.sendMessage(POST, { content: 'x'.repeat(2001) })),
+      await refusal(() => fake.sendMessage(POST, { embeds: [{ title: 't'.repeat(257) }] })),
+      await refusal(() =>
+        fake.createPost(FORUM, { title: '', message: { content: 'a' }, tagIds: [] }),
+      ),
+      await refusal(() =>
+        fake.createPost(FORUM, { title: 'A', message: { content: 'a' }, tagIds: ['nope'] }),
+      ),
+    ];
+    for (const err of refusals) {
+      expect(isRefusedBody(err)).toBe(true);
+      expect((err as Error).message).toMatch(/^Invalid Form Body: /);
+    }
+  });
+
+  it('refuses a v2 message whose text is over the limit a test gave it', async () => {
+    const fake = new FakePartyGateway();
+    fake.textLimit = 10;
+    const err = await refusal(() => fake.sendMessage(POST, message(text('a'.repeat(11)))));
+    expect(isRefusedBody(err)).toBe(true);
+    expect(await fake.sendMessage(POST, message(text('a'.repeat(10))))).toBeDefined();
+  });
+
+  it('refuses a link button with a custom id, another button without one, a stray thumbnail', async () => {
+    const fake = new FakePartyGateway();
+    const row = (button: object) => ({ type: ComponentType.ActionRow, components: [button] });
+    const send = (sent: V2Message) => refusal(() => fake.sendMessage(POST, sent));
+    const link = { type: ComponentType.Button, style: ButtonStyle.Link, label: 'Map' };
+    expect(await send(message(row({ ...link, url: 'https://x.test' })))).toBeUndefined();
+    expect(String(await send(message(row(link))))).toContain('a link button has an address');
+    expect(
+      String(await send(message(row({ ...link, url: 'https://x.test', custom_id: 'a' })))),
+    ).toContain('a link button has an address and no custom id');
+    const plain = { type: ComponentType.Button, style: ButtonStyle.Secondary, label: 'Go' };
+    expect(String(await send(message(row(plain))))).toContain('a button has a custom id');
+    const picture = { type: ComponentType.Thumbnail, media: { url: 'https://x.test/a.png' } };
+    expect(String(await send(message(container(picture))))).toContain(
+      'a thumbnail stands only beside a section',
+    );
+  });
+
+  it('refuses an empty container and an accent colour out of range', async () => {
+    const fake = new FakePartyGateway();
+    const send = (sent: V2Message) => refusal(() => fake.sendMessage(POST, sent));
+    expect(String(await send(message(container())))).toContain('a container needs a component');
+    expect(
+      String(
+        await send(
+          message({
+            type: ComponentType.Container,
+            accent_color: 0x1000000,
+            components: [text('a')],
+          }),
+        ),
+      ),
+    ).toContain('an accent colour is a number from 0 to 0xFFFFFF');
+    expect(
+      await send(
+        message({ type: ComponentType.Container, accent_color: 0xffffff, components: [text('a')] }),
+      ),
+    ).toBeUndefined();
+  });
+});
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index c06d6ed2292009bcf4e835d131e6677779931d7b..ddc99e3844ac5e49ff31876d7c65b7ed4749ba1f 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1,7 +1,8 @@
-import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
+import { ButtonStyle, ComponentType, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
 import type { ServerChannel } from '../../src/domain/regions/region-import.js';
 import type {
   CreatedChannel,
+  EditOptions,
   MemberAccess,
   NewPost,
   OutgoingMessage,
@@ -37,15 +38,46 @@ export interface FakeMessage {
 
 type Method = keyof PartyGateway;
 
+/**
+ * What Discord answers for a message, title or tags it will not take: 400, Invalid Form Body
+ * (50035), with the reason in the message, so that the code that retries on that answer (the
+ * picture, the first message of a post) runs in tests as it does against Discord.
+ */
+export function refusedBody(what: string): DiscordAPIError {
+  return new DiscordAPIError(
+    {
+      code: RESTJSONErrorCodes.InvalidFormBodyOrContentType,
+      message: `Invalid Form Body: ${what}`,
+    },
+    RESTJSONErrorCodes.InvalidFormBodyOrContentType,
+    400,
+    'POST',
+    '/channels',
+    {},
+  );
+}
+
+/** What the bot keeps the text of a v2 message to (Discord documents no total). */
+const TEXT_LIMIT = 4000;
+
+/** A component of a v2 message as the fake looks at it: its type and whatever else it has. */
+interface V2Component {
+  type: ComponentType;
+  components?: unknown;
+  accessory?: unknown;
+  [key: string]: unknown;
+}
+
 /**
  * A `PartyGateway` kept in memory: forums with tags, posts, and messages sent to channels and
  * posts. `gone` holds ids of things that were deleted by hand; `failing` makes the named methods
  * reject. `calls` lists every call in order, as `method id`.
  *
- * It is as strict as Discord where tests rely on it: a message needs content or an embed, an
- * embed keeps within its limits (title 256, description 4096, 25 fields with a name of 1 to 256
- * and a value of 1 to 1024 characters that are not all white space, 6000 over all embeds of a
- * message with footers and author names), a title
+ * It is as strict as Discord where tests rely on it: a classic message needs content or an
+ * embed, an embed keeps within its limits (title 256, description 4096, 25 fields with a name of
+ * 1 to 256 and a value of 1 to 1024 characters that are not all white space, 6000 over all embeds
+ * of a message with footers and author names); a components-v2 message carries neither, keeps
+ * within the limits of `checkV2` and stays v2 through every edit; a title
  * is 1 to 100 characters, a post has at most five tags, all of the forum, a forum has one pinned
  * post, and nothing can be sent into a forum. Like Discord, it opens an archived post again for
  * anything that is edited or sent in it. A message that was deleted, or whose id is in `gone`,
@@ -101,8 +133,24 @@ export class FakePartyGateway implements PartyGateway {
   /** The ids of the forums deleted with `deleteChannel`, in order. */
   readonly deletedChannels: string[] = [];
   readonly failing = new Map<Method, Error>();
-  /** Makes every send and edit refuse (Invalid Form Body) an embed with a thumbnail. */
+  /**
+   * The classic messages an edit made v2, in order: `direct` when the caller said it was classic
+   * (`{ convert: true }`), false when the gateway converted it only after Discord refused the
+   * plain edit (a request more).
+   */
+  readonly converted: { id: string; direct: boolean }[] = [];
+  /** Makes every send and edit refuse (Invalid Form Body) a message with a thumbnail. */
   rejectThumbnails = false;
+  /**
+   * Makes `createPost` refuse (Invalid Form Body) a components-v2 message as the first message
+   * of a post: whether Discord takes one there is not documented.
+   */
+  refuseV2Starter = false;
+  /**
+   * The characters a components-v2 message may have over its text displays; a test lowers it to
+   * have the messages of a post refused as Discord would refuse one too long.
+   */
+  textLimit = TEXT_LIMIT;
   readonly calls: string[] = [];
   readonly channelNames = new Map<string, string>();
   /**
@@ -230,34 +278,176 @@ export class FakePartyGateway implements PartyGateway {
   }
 
   private checkPicture(message: OutgoingMessage): void {
-    if (this.rejectThumbnails && message.embeds?.some((embed) => embed.thumbnail)) {
-      throw new DiscordAPIError(
-        { code: RESTJSONErrorCodes.InvalidFormBodyOrContentType, message: 'Invalid Form Body' },
-        RESTJSONErrorCodes.InvalidFormBodyOrContentType,
-        400,
-        'POST',
-        '/channels',
-        {},
-      );
-    }
+    if (!this.rejectThumbnails) return;
+    const pictured = message.v2
+      ? FakePartyGateway.flatten(message.components).some(
+          (component) => component.type === ComponentType.Thumbnail,
+        )
+      : message.embeds?.some((embed) => embed.thumbnail);
+    if (pictured) throw refusedBody('the picture was refused');
   }
 
-  /** Refuses a message that Discord would refuse (see the class comment). */
-  static checkMessage(message: OutgoingMessage): void {
-    if ((message.content ?? '').length > 2000)
-      throw new Error('A message has at most 2000 characters');
+  /**
+   * Refuses a message that Discord would refuse (see the class comment), as Discord does
+   * (`refusedBody`). `textLimit` is the total of a v2 message's text displays: a test lowers it
+   * on its gateway (`textLimit`) to have a message refused.
+   */
+  static checkMessage(message: OutgoingMessage, textLimit = TEXT_LIMIT): void {
     if ((message.mention?.users?.length ?? 0) > 100)
-      throw new Error('A message pings at most 100 users');
-    if ((message.components?.length ?? 0) > 5) throw new Error('A message has at most 5 rows');
+      throw refusedBody('a message pings at most 100 users');
+    if (message.v2) {
+      FakePartyGateway.checkV2(message, textLimit);
+      return;
+    }
+    if ((message.content ?? '').length > 2000)
+      throw refusedBody('a message has at most 2000 characters');
+    if ((message.components?.length ?? 0) > 5) throw refusedBody('a message has at most 5 rows');
     for (const row of message.components ?? []) {
-      if (row.components.length > 5) throw new Error('A row has at most 5 controls');
+      if (row.components.length > 5) throw refusedBody('a row has at most 5 controls');
     }
     if (!message.content && !message.embeds?.length) {
-      throw new Error('Invalid Form Body: a message needs content or an embed');
+      throw refusedBody('a message needs content or an embed');
     }
     FakePartyGateway.checkEmbeds(message.embeds ?? []);
   }
 
+  /** Every component of a v2 message, nested ones (a section's accessory too), depth first. */
+  static flatten(components: readonly object[]): V2Component[] {
+    const all: V2Component[] = [];
+    const visit = (component: V2Component): void => {
+      all.push(component);
+      if (Array.isArray(component.components)) {
+        for (const child of component.components) visit(child as V2Component);
+      }
+      if (component.accessory !== undefined) visit(component.accessory as V2Component);
+    };
+    for (const component of components) visit(component as V2Component);
+    return all;
+  }
+
+  /**
+   * The limits of a components-v2 message: no content or embeds beside the flag, at least one
+   * component and at most 40 counted with every nested one, at most 4,000 characters over its
+   * text displays (Discord documents no total: the bot keeps to this), a text display of at
+   * least one character, a section of one to three text displays and a button or thumbnail
+   * beside them, a row of one to five controls, a label of at most 80 characters, a custom id of
+   * at most 100 that no other control of the message has, a thumbnail by an https address, and
+   * no container but at the top.
+   */
+  private static checkV2(message: OutgoingMessage, textLimit: number): void {
+    const refuse = (what: string): never => {
+      throw refusedBody(what);
+    };
+    // Discord refuses the keys themselves, also when they are empty.
+    if ('content' in message || 'embeds' in message)
+      refuse('a v2 message has no content or embeds');
+    const top = (message.components ?? []) as V2Component[];
+    if (top.length === 0) refuse('a message needs a component');
+    const all = FakePartyGateway.flatten(top);
+    if (all.length > 40) refuse(`a message has at most 40 components, not ${all.length}`);
+    const containers = all.filter((component) => component.type === ComponentType.Container);
+    if (containers.some((container) => !top.includes(container))) {
+      refuse('a container cannot be inside another component');
+    }
+    const accessories = new Set(all.map((component) => component.accessory));
+    let text = 0;
+    const ids = new Set<string>();
+    for (const component of all) {
+      const inner = (
+        Array.isArray(component.components) ? component.components : []
+      ) as V2Component[];
+      switch (component.type) {
+        case ComponentType.TextDisplay: {
+          const content = typeof component.content === 'string' ? component.content : '';
+          if (content.trim() === '') refuse('a text display needs text');
+          text += content.length;
+          break;
+        }
+        case ComponentType.Section: {
+          if (inner.length < 1 || inner.length > 3) {
+            refuse(`a section has 1 to 3 text displays, not ${inner.length}`);
+          }
+          if (inner.some((child) => child.type !== ComponentType.TextDisplay)) {
+            refuse('a section holds text displays only');
+          }
+          const accessory = component.accessory as V2Component | undefined;
+          if (
+            accessory?.type !== ComponentType.Button &&
+            accessory?.type !== ComponentType.Thumbnail
+          ) {
+            refuse('a section needs a button or a thumbnail beside it');
+          }
+          break;
+        }
+        case ComponentType.ActionRow:
+          if (inner.length < 1 || inner.length > 5) {
+            refuse(`a row has 1 to 5 controls, not ${inner.length}`);
+          }
+          break;
+        case ComponentType.Button: {
+          const label = typeof component.label === 'string' ? component.label : '';
+          if (label.length > 80) refuse('a button label has at most 80 characters');
+          const link = component.style === ButtonStyle.Link;
+          if (link && (typeof component.url !== 'string' || 'custom_id' in component)) {
+            refuse('a link button has an address and no custom id');
+          }
+          if (!link && (typeof component.custom_id !== 'string' || 'url' in component)) {
+            refuse('a button has a custom id and no address');
+          }
+          const id = component.custom_id;
+          if (typeof id === 'string') {
+            if (id.length > 100) refuse('a custom id has at most 100 characters');
+            if (ids.has(id)) refuse(`the custom id ${id} is used twice in the message`);
+            ids.add(id);
+          }
+          break;
+        }
+        case ComponentType.Thumbnail: {
+          const url = (component.media as { url?: unknown } | undefined)?.url;
+          if (typeof url !== 'string' || !url.startsWith('https://')) {
+            refuse('a thumbnail needs an https address');
+          }
+          if (!accessories.has(component)) refuse('a thumbnail stands only beside a section');
+          break;
+        }
+        default:
+          break;
+      }
+    }
+    for (const container of containers) {
+      const inner = Array.isArray(container.components) ? container.components : [];
+      if (inner.length === 0) refuse('a container needs a component');
+      const accent = container.accent_color;
+      if (
+        accent !== undefined &&
+        accent !== null &&
+        (typeof accent !== 'number' || !Number.isInteger(accent) || accent < 0 || accent > 0xffffff)
+      ) {
+        refuse('an accent colour is a number from 0 to 0xFFFFFF');
+      }
+    }
+    if (text > textLimit) {
+      refuse(`the text displays have at most ${textLimit} characters, not ${text}`);
+    }
+  }
+
+  /** A message that is v2 cannot be edited back into a classic one. */
+  /** Records an edit that makes a classic message v2 (`converted`). */
+  private noteConversion(
+    id: string,
+    before: OutgoingMessage,
+    after: OutgoingMessage,
+    options?: EditOptions,
+  ): void {
+    if (!before.v2 && after.v2) this.converted.push({ id, direct: options?.convert === true });
+  }
+
+  private static checkEdit(before: OutgoingMessage, after: OutgoingMessage): void {
+    if (before.v2 && !after.v2) {
+      throw refusedBody('a components-v2 message cannot become classic');
+    }
+  }
+
   /**
    * The limits of the embeds of a message, which Discord answers with "Invalid Form Body" when
    * one is passed. The 6000 characters are counted over all embeds of the message together,
@@ -266,7 +456,7 @@ export class FakePartyGateway implements PartyGateway {
    */
   private static checkEmbeds(embeds: NonNullable<OutgoingMessage['embeds']>): void {
     const refuse = (what: string): never => {
-      throw new Error(`Invalid Form Body: ${what}`);
+      throw refusedBody(what);
     };
     let total = 0;
     for (const embed of embeds) {
@@ -301,22 +491,25 @@ export class FakePartyGateway implements PartyGateway {
 
   /** The message as Discord keeps it in this channel: without its embeds where the bot may not. */
   private kept(channelId: string, message: OutgoingMessage): OutgoingMessage {
-    if (!this.noEmbeds.has(channelId) || message.embeds === undefined) return message;
+    // What Discord does to a v2 message there is not known: it is kept as it is.
+    if (!this.noEmbeds.has(channelId) || message.v2 || message.embeds === undefined) {
+      return message;
+    }
     const { embeds: _dropped, ...rest } = message;
     return rest;
   }
 
   private static checkTitle(title: string): void {
     if (title.length < 1 || title.length > 100) {
-      throw new Error(`Invalid Form Body: a title is 1 to 100 characters, not ${title.length}`);
+      throw refusedBody(`a title is 1 to 100 characters, not ${title.length}`);
     }
   }
 
   private static checkTags(forum: { tags: Record<string, string> }, tagIds: readonly string[]) {
-    if (tagIds.length > 5) throw new Error('Invalid Form Body: at most five tags');
+    if (tagIds.length > 5) throw refusedBody('at most five tags');
     const known = new Set(Object.values(forum.tags));
     for (const tag of tagIds) {
-      if (!known.has(tag)) throw new Error(`Invalid Form Body: the forum has no tag ${tag}`);
+      if (!known.has(tag)) throw refusedBody(`the forum has no tag ${tag}`);
     }
   }
 
@@ -324,7 +517,10 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('createPost', forumId, () => {
       const forum = this.forums.get(forumId);
       if (!forum || this.gone.has(forumId)) return undefined;
-      FakePartyGateway.checkMessage(post.message);
+      FakePartyGateway.checkMessage(post.message, this.textLimit);
+      if (this.refuseV2Starter && post.message.v2) {
+        throw refusedBody('a components-v2 message as the first message of a post');
+      }
       this.checkPicture(post.message);
       FakePartyGateway.checkTitle(post.title);
       FakePartyGateway.checkTags(forum, post.tagIds);
@@ -362,11 +558,14 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  editPost(postId: string, message: OutgoingMessage) {
+  editPost(postId: string, message: OutgoingMessage, options?: EditOptions) {
     return this.attempt('editPost', postId, () => {
       const post = this.posts.get(postId);
       if (!post || this.gone.has(postId) || this.messageGone.has(postId)) return false;
+      FakePartyGateway.checkMessage(message, this.textLimit);
+      FakePartyGateway.checkEdit(post.message, message);
       this.checkPicture(message);
+      this.noteConversion(postId, post.message, message, options);
       FakePartyGateway.reopen(post);
       post.message = message;
       post.edits++;
@@ -456,7 +655,7 @@ export class FakePartyGateway implements PartyGateway {
   sendMessage(channelId: string, message: OutgoingMessage) {
     return this.attempt('sendMessage', channelId, () => {
       if (this.gone.has(channelId) || this.forums.has(channelId)) return undefined;
-      FakePartyGateway.checkMessage(message);
+      FakePartyGateway.checkMessage(message, this.textLimit);
       this.checkPicture(message);
       const post = this.posts.get(channelId);
       if (post) FakePartyGateway.reopen(post);
@@ -466,13 +665,20 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
-  editMessage(channelId: string, messageId: string, message: OutgoingMessage) {
+  editMessage(
+    channelId: string,
+    messageId: string,
+    message: OutgoingMessage,
+    options?: EditOptions,
+  ) {
     return this.attempt('editMessage', messageId, () => {
       if (this.gone.has(channelId) || this.gone.has(messageId)) return false;
       const found = this.messagesIn(channelId).find((sent) => sent.id === messageId);
       if (!found) return false;
-      FakePartyGateway.checkMessage(message);
+      FakePartyGateway.checkMessage(message, this.textLimit);
+      FakePartyGateway.checkEdit(found.message, message);
       this.checkPicture(message);
+      this.noteConversion(messageId, found.message, message, options);
       const post = this.posts.get(channelId);
       if (post) FakePartyGateway.reopen(post);
       found.message = this.kept(channelId, message);
diff --git a/test/support/messages.test.ts b/test/support/messages.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d9d30f9c7d514fe7abbc5c33a3e7945cc346085c
--- /dev/null
+++ b/test/support/messages.test.ts
@@ -0,0 +1,92 @@
+import { ButtonStyle, ComponentType } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import type { OutgoingMessage } from '../../src/discord/party-gateway.js';
+import {
+  accentOf,
+  buttonLabels,
+  buttonsOf,
+  classic,
+  componentCount,
+  customIdsOf,
+  textOf,
+  thumbnailOf,
+  v2,
+} from './messages.js';
+
+const MAP = 'https://maps.test/a';
+const message: OutgoingMessage = {
+  v2: true,
+  components: [
+    {
+      type: ComponentType.Container,
+      accent_color: 0x2ecc71,
+      components: [
+        {
+          type: ComponentType.Section,
+          components: [{ type: ComponentType.TextDisplay, content: '### Title' }],
+          accessory: { type: ComponentType.Thumbnail, media: { url: 'https://x.test/a.png' } },
+        },
+        {
+          type: ComponentType.Section,
+          components: [{ type: ComponentType.TextDisplay, content: '**Coming (1)**\nAlice' }],
+          accessory: {
+            type: ComponentType.Button,
+            style: ButtonStyle.Primary,
+            label: 'Join',
+            emoji: { name: '🏃' },
+            custom_id: 'party:1:join',
+          },
+        },
+        {
+          type: ComponentType.ActionRow,
+          components: [
+            { type: ComponentType.Button, style: ButtonStyle.Link, label: 'Map', url: MAP },
+          ],
+        },
+      ],
+    },
+  ],
+};
+
+describe('reading a message in tests', () => {
+  it('reads the text, buttons, colour, picture and size of a v2 message', () => {
+    expect(textOf(message)).toBe('### Title\n**Coming (1)**\nAlice');
+    expect(buttonLabels(message)).toEqual(['Join', 'Map']);
+    expect(customIdsOf(message)).toEqual(['party:1:join']);
+    expect(buttonsOf(message)[0]).toEqual({
+      label: 'Join',
+      emoji: '🏃',
+      style: ButtonStyle.Primary,
+      customId: 'party:1:join',
+      url: undefined,
+    });
+    expect(buttonsOf(message)[1]?.url).toBe(MAP);
+    expect(accentOf(message)).toBe(0x2ecc71);
+    expect(thumbnailOf(message)).toBe('https://x.test/a.png');
+    // The container, two sections with a text and an accessory each, a row with its button.
+    expect(componentCount(message)).toBe(9);
+  });
+
+  it('reads the buttons of a classic message from its rows, and tells the kinds apart', () => {
+    const plain: OutgoingMessage = {
+      content: 'hi',
+      components: [
+        {
+          type: ComponentType.ActionRow,
+          components: [
+            {
+              type: ComponentType.Button,
+              style: ButtonStyle.Success,
+              label: 'Yes',
+              custom_id: 'a',
+            },
+          ],
+        },
+      ],
+    };
+    expect(customIdsOf(plain)).toEqual(['a']);
+    expect(classic(plain).content).toBe('hi');
+    expect(() => v2(plain)).toThrow('classic');
+    expect(() => classic(message)).toThrow('components v2');
+  });
+});
diff --git a/test/support/messages.ts b/test/support/messages.ts
new file mode 100644
index 0000000000000000000000000000000000000000..82cb140103364bd2c563062d59833b3c4cc955ab
--- /dev/null
+++ b/test/support/messages.ts
@@ -0,0 +1,131 @@
+import {
+  ComponentType,
+  type APIActionRowComponent,
+  type APIButtonComponent,
+  type APIComponentInMessageActionRow,
+  type APIMessageTopLevelComponent,
+} from 'discord.js';
+import type {
+  ClassicMessage,
+  OutgoingMessage,
+  V2Message,
+} from '../../src/discord/party-gateway.js';
+
+/**
+ * Reading what the bot sent, for tests: a classic message (text, embeds, rows) or a
+ * components-v2 message (a party's post and its copies), whichever the test expects.
+ */
+
+type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
+
+/** The message as a classic one; fails the test when it is v2 (or missing). */
+export function classic(message: OutgoingMessage | undefined): ClassicMessage {
+  if (!message) throw new Error('There is no message');
+  if (message.v2) throw new Error('The message is components v2, not classic');
+  return message;
+}
+
+/** The message as a components-v2 one; fails the test when it is classic (or missing). */
+export function v2(message: OutgoingMessage | undefined): V2Message {
+  if (!message) throw new Error('There is no message');
+  if (!message.v2) throw new Error('The message is classic, not components v2');
+  return message;
+}
+
+/** The rows of controls of a classic message. */
+export function rowsOf(message: OutgoingMessage | undefined): Row[] {
+  return classic(message).components ?? [];
+}
+
+/** Every component of a v2 message, depth first, containers and sections before what they hold. */
+export function allComponents(message: OutgoingMessage | undefined): unknown[] {
+  const found: unknown[] = [];
+  const visit = (component: APIMessageTopLevelComponent | Record<string, unknown>): void => {
+    found.push(component);
+    const inner = (component as { components?: unknown[] }).components;
+    for (const child of inner ?? []) visit(child as Record<string, unknown>);
+    const accessory = (component as { accessory?: unknown }).accessory;
+    if (accessory !== undefined) visit(accessory as Record<string, unknown>);
+  };
+  for (const component of v2(message).components) visit(component);
+  return found;
+}
+
+/** How many components Discord counts in a v2 message: every one, nested ones included. */
+export function componentCount(message: OutgoingMessage | undefined): number {
+  return allComponents(message).length;
+}
+
+/** The text displays of a v2 message, in order. */
+export function textDisplays(message: OutgoingMessage | undefined): string[] {
+  return allComponents(message)
+    .filter(
+      (component): component is { type: ComponentType.TextDisplay; content: string } =>
+        (component as { type?: unknown }).type === ComponentType.TextDisplay,
+    )
+    .map((component) => component.content);
+}
+
+/** All the text of a v2 message, its text displays joined by line breaks. */
+export function textOf(message: OutgoingMessage | undefined): string {
+  return textDisplays(message).join('\n');
+}
+
+/** A button as a test reads it. */
+export interface ShownButton {
+  label: string | undefined;
+  emoji: string | undefined;
+  style: number;
+  customId: string | undefined;
+  url: string | undefined;
+}
+
+/** Every button of a message (v2: also those beside sections), in order. */
+export function buttonsOf(message: OutgoingMessage | undefined): ShownButton[] {
+  const components = message?.v2
+    ? allComponents(message)
+    : rowsOf(message).flatMap((row) => row.components);
+  return components
+    .filter(
+      (component): component is APIButtonComponent =>
+        (component as { type?: unknown }).type === ComponentType.Button,
+    )
+    .map((button) => ({
+      label: 'label' in button ? button.label : undefined,
+      emoji: 'emoji' in button ? button.emoji?.name : undefined,
+      style: button.style,
+      customId: 'custom_id' in button ? button.custom_id : undefined,
+      url: 'url' in button ? button.url : undefined,
+    }));
+}
+
+/** The labels of every button of a message, in order. */
+export function buttonLabels(message: OutgoingMessage | undefined): (string | undefined)[] {
+  return buttonsOf(message).map((button) => button.label);
+}
+
+/** The custom ids of every button of a message, in order (link buttons have none). */
+export function customIdsOf(message: OutgoingMessage | undefined): string[] {
+  return buttonsOf(message).flatMap((button) =>
+    button.customId === undefined ? [] : [button.customId],
+  );
+}
+
+/** The accent colour of the (first) container of a v2 message. */
+export function accentOf(message: OutgoingMessage | undefined): number | undefined {
+  const container = v2(message).components.find(
+    (component) => component.type === ComponentType.Container,
+  );
+  return container?.type === ComponentType.Container
+    ? (container.accent_color ?? undefined)
+    : undefined;
+}
+
+/** The address of the (first) thumbnail of a v2 message. */
+export function thumbnailOf(message: OutgoingMessage | undefined): string | undefined {
+  const thumbnail = allComponents(message).find(
+    (component): component is { type: ComponentType.Thumbnail; media: { url: string } } =>
+      (component as { type?: unknown }).type === ComponentType.Thumbnail,
+  );
+  return thumbnail?.media.url;
+}
````


### Task 2: Emoji of the bot's application first, and the script that uploads them

Prototype commit: `1dc28e1760d8b31d16e488d406f3fad32deaabef`

The emoji of a post (shiny, remote, teams, and from now on the game's
icons of types and weather) are looked for by name in the bot's own
application first, then among the server's emoji, then fall back to
characters (or words for types and weather). ApplicationEmoji keeps the
application's list in memory: read after the connection and again with
the hourly upkeep; a failed read is logged and the last good list
stays, and a read that finds other emoji has every active post shown
anew (PartyService.emojiChanged, through the usual render). PostEmoji
gains `icon` and `teamless`, which marks members without a team only
where an emoji of that name exists.

src/domain/pogo/game-icons.ts names the emoji (the legacy server names)
and maps the game master's weather to them. `npm run emoji:upload`
(scripts/emoji/) fits the game's icons from PokeMiners' pogo_assets at
a pinned commit into 128-pixel PNGs and uploads only the names the
application lacks; a dry run unless `--apply`. An icon that fails is
said in one line (Discord's status and code only) while the others go
on; it ends with a count and a non-zero exit status when anything
failed. It is not run by the tests.

**Files:**

```
 package.json                             |   1 +
 scripts/emoji/icons.test.ts              |  62 ++++++++++++++++++++++++
 scripts/emoji/icons.ts                   |  87 +++++++++++++++++++++++++++++++++
 scripts/emoji/upload.ts                  |  80 +++++++++++++++++++++++++++++++
 src/app.ts                               |  16 ++++++-
 src/discord/application-emoji.ts         |  26 ++++++++++
 src/domain/pogo/game-icons.test.ts       |  25 ++++++++++
 src/domain/pogo/game-icons.ts            |  66 +++++++++++++++++++++++++
 src/render/party-post.test.ts            |  40 ++++++++++++++++
 src/render/party-post.ts                 |  25 +++++++---
 src/services/application-emoji.test.ts   | 104 ++++++++++++++++++++++++++++++++++++++++
 src/services/application-emoji.ts        |  63 ++++++++++++++++++++++++
 src/services/party-scheduler.test.ts     |  27 +++++++++++
 src/services/party-scheduler.ts          |   7 ++-
 src/services/party-service.emoji.test.ts | 133 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.ts            |  85 +++++++++++++++++++++++++++-----
 16 files changed, 826 insertions(+), 21 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit scripts/emoji/icons.test.ts src/domain/pogo/game-icons.test.ts src/render/party-post.test.ts src/services/application-emoji.test.ts src/services/party-scheduler.test.ts src/services/party-service.emoji.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 1dc28e1760d8b31d16e488d406f3fad32deaabef -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Emoji of the bot's application first, and the script that uploads them`, the body above and the trailer, staging exactly
  `package.json scripts/emoji/icons.test.ts scripts/emoji/icons.ts scripts/emoji/upload.ts src/app.ts src/discord/application-emoji.ts src/domain/pogo/game-icons.test.ts src/domain/pogo/game-icons.ts src/render/party-post.test.ts src/render/party-post.ts src/services/application-emoji.test.ts src/services/application-emoji.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/services/party-service.emoji.test.ts src/services/party-service.ts`.

````diff
diff --git a/package.json b/package.json
index 5c0a6c771abc1399d523e61ef522641ce6f328f0..9e796a6a88399da84c61916d687f1ec2de0f7fd9 100644
--- a/package.json
+++ b/package.json
@@ -19,6 +19,7 @@
     "ocr:check": "tsx scripts/ocr/check.ts",
     "ocr:review": "tsx scripts/ocr/review.ts",
     "role-auth:export": "tsx --env-file-if-exists=.env scripts/role-auth/export.ts",
+    "emoji:upload": "tsx --env-file-if-exists=.env scripts/emoji/upload.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
     "typecheck": "tsc --noEmit",
diff --git a/scripts/emoji/icons.test.ts b/scripts/emoji/icons.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ccf2f3b98413615a1bcb38e845349abe182d6f54
--- /dev/null
+++ b/scripts/emoji/icons.test.ts
@@ -0,0 +1,62 @@
+import { DiscordAPIError, HTTPError } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { GAME_ICON_NAMES } from '../../src/domain/pogo/game-icons.js';
+import { failureReason, iconSources, missingIcons, POGO_ASSETS } from './icons.js';
+
+describe('iconSources', () => {
+  it('has an icon of the pinned assets for every emoji the bot looks for, once', () => {
+    const sources = iconSources();
+    expect(sources.map((source) => source.name)).toEqual(GAME_ICON_NAMES);
+    expect(new Set(sources.map((source) => source.name)).size).toBe(sources.length);
+    for (const source of sources) {
+      expect(source.url.startsWith(POGO_ASSETS)).toBe(true);
+      // Discord's rule for an emoji's name.
+      expect(source.name).toMatch(/^[a-z0-9_]{2,32}$/);
+    }
+    expect(POGO_ASSETS).toMatch(/\/[0-9a-f]{40}\/Images\/$/);
+  });
+
+  it('takes the type, weather and team icons from their files, spaces encoded', () => {
+    const url = (name: string) => iconSources().find((source) => source.name === name)?.url;
+    expect(url('rock')).toBe(`${POGO_ASSETS}Types/POKEMON_TYPE_ROCK.png`);
+    expect(url('partlycloudy')).toBe(
+      `${POGO_ASSETS}Weather/weatherIcon_small_partlycloudy_day.png`,
+    );
+    expect(url('sunny')).toBe(`${POGO_ASSETS}Weather/weatherIcon_small_sunny.png`);
+    expect(url('instinct')).toBe(`${POGO_ASSETS}Pokestops%20and%20Gyms/team_yellow.png`);
+    expect(url('teamless')).toBe(`${POGO_ASSETS}Pokestops%20and%20Gyms/TeamLess.png`);
+  });
+});
+
+describe('missingIcons', () => {
+  it('leaves out what the application has, and replaces nothing', () => {
+    const missing = missingIcons(iconSources(), ['rock', 'valor', 'something-else']);
+    expect(missing.map((source) => source.name)).not.toContain('rock');
+    expect(missing.map((source) => source.name)).not.toContain('valor');
+    expect(missing).toHaveLength(GAME_ICON_NAMES.length - 2);
+  });
+});
+
+describe('failureReason', () => {
+  it('says what Discord answered by its status and code, never what was sent', () => {
+    const refused = new DiscordAPIError(
+      { code: 50035, message: 'Invalid Form Body' },
+      50035,
+      400,
+      'POST',
+      '/applications/1/emojis',
+      { body: { image: 'data:image/png;base64,AAAA' } },
+    );
+    expect(failureReason(refused)).toBe('Discord answered 400 (code 50035)');
+    expect(failureReason(new HTTPError(503, 'Service Unavailable', 'GET', '/x', {}))).toBe(
+      'Discord answered 503',
+    );
+  });
+
+  it('gives the message of anything else, and a word for what is no error', () => {
+    expect(failureReason(new Error('rock: the icon answered 404'))).toBe(
+      'rock: the icon answered 404',
+    );
+    expect(failureReason('nonsense')).toBe('an unknown failure');
+  });
+});
diff --git a/scripts/emoji/icons.ts b/scripts/emoji/icons.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e58823cd164f73abc83c64cf008b4926e1b7c1c
--- /dev/null
+++ b/scripts/emoji/icons.ts
@@ -0,0 +1,87 @@
+import { DiscordAPIError, HTTPError } from 'discord.js';
+import {
+  TEAM_ICON_NAMES,
+  TYPE_ICON_NAMES,
+  WEATHER_ICON_NAMES,
+} from '../../src/domain/pogo/game-icons.js';
+
+/**
+ * Where the game's icons for the bot's emoji come from: PokeMiners' copy of the game's assets,
+ * at a fixed commit, so that a later change there cannot change what is uploaded.
+ */
+export const POGO_ASSETS =
+  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';
+
+/** An emoji is uploaded as a PNG of this many pixels a side, the icon fitted in. */
+export const EMOJI_PIXELS = 128;
+/** Discord takes an emoji of at most 256 KiB. */
+export const MAX_EMOJI_BYTES = 256 * 1024;
+/** An icon of the game is a few KiB; anything over this is no icon. */
+export const MAX_ICON_BYTES = 2 * 1024 * 1024;
+
+/** One emoji to make: its name and the address of the game's icon it is made from. */
+export interface IconSource {
+  name: string;
+  url: string;
+}
+
+type WeatherIconName = (typeof WEATHER_ICON_NAMES)[number];
+type TeamIconName = (typeof TEAM_ICON_NAMES)[number];
+
+/** The small weather icons; partly cloudy is the day's. */
+const WEATHER_FILES: Readonly<Record<WeatherIconName, string>> = {
+  sunny: 'Weather/weatherIcon_small_sunny.png',
+  clear: 'Weather/weatherIcon_small_clear.png',
+  rain: 'Weather/weatherIcon_small_rain.png',
+  partlycloudy: 'Weather/weatherIcon_small_partlycloudy_day.png',
+  cloudy: 'Weather/weatherIcon_small_cloudy.png',
+  windy: 'Weather/weatherIcon_small_windy.png',
+  snow: 'Weather/weatherIcon_small_snow.png',
+  fog: 'Weather/weatherIcon_small_fog.png',
+};
+
+const TEAM_FILES: Readonly<Record<TeamIconName, string>> = {
+  instinct: 'Pokestops and Gyms/team_yellow.png',
+  mystic: 'Pokestops and Gyms/team_blue.png',
+  valor: 'Pokestops and Gyms/team_red.png',
+  teamless: 'Pokestops and Gyms/TeamLess.png',
+};
+
+/** A path of the assets as an address (its spaces encoded). */
+function assetUrl(path: string): string {
+  return POGO_ASSETS + path.split('/').map(encodeURIComponent).join('/');
+}
+
+/** Every emoji the bot looks for, with the icon it is made from. */
+export function iconSources(): IconSource[] {
+  return [
+    ...TYPE_ICON_NAMES.map((type) => ({
+      name: type,
+      url: assetUrl(`Types/POKEMON_TYPE_${type.toUpperCase()}.png`),
+    })),
+    ...WEATHER_ICON_NAMES.map((name) => ({ name, url: assetUrl(WEATHER_FILES[name]) })),
+    ...TEAM_ICON_NAMES.map((name) => ({ name, url: assetUrl(TEAM_FILES[name]) })),
+  ];
+}
+
+/**
+ * Why an icon could not be made or uploaded, in a line the script may print: what Discord
+ * answered by its status and code (never the request, which holds the picture and may hold
+ * more), or the message of a failure of the script's own.
+ */
+export function failureReason(err: unknown): string {
+  if (err instanceof DiscordAPIError) {
+    return `Discord answered ${String(err.status)} (code ${String(err.code)})`;
+  }
+  if (err instanceof HTTPError) return `Discord answered ${String(err.status)}`;
+  return err instanceof Error ? err.message : 'an unknown failure';
+}
+
+/** The emoji of `sources` the application does not have yet (by name; nothing is replaced). */
+export function missingIcons(
+  sources: readonly IconSource[],
+  existing: Iterable<string>,
+): IconSource[] {
+  const have = new Set(existing);
+  return sources.filter((source) => !have.has(source.name));
+}
diff --git a/scripts/emoji/upload.ts b/scripts/emoji/upload.ts
new file mode 100644
index 0000000000000000000000000000000000000000..13ae2cf7b711869ce3d5dd59e4ab88c555d0d115
--- /dev/null
+++ b/scripts/emoji/upload.ts
@@ -0,0 +1,80 @@
+// Uploads the game's icons for types, weather and teams as emoji of the bot's application
+// (`npm run emoji:upload`). Only the names the application lacks are made; nothing is renamed,
+// replaced or deleted. A dry run by default: it says what it would upload. `--apply` uploads.
+// Reads DISCORD_TOKEN and DISCORD_APP_ID from the environment and prints neither. An icon that
+// fails is said in one line and the others go on; the script ends with a count, and a non-zero
+// exit status when anything failed.
+import { REST, Routes, type APIApplicationEmoji } from 'discord.js';
+import sharp from 'sharp';
+import {
+  EMOJI_PIXELS,
+  failureReason,
+  iconSources,
+  MAX_EMOJI_BYTES,
+  MAX_ICON_BYTES,
+  missingIcons,
+  type IconSource,
+} from './icons.js';
+
+const apply = process.argv.slice(2).includes('--apply');
+const token = process.env.DISCORD_TOKEN;
+const appId = process.env.DISCORD_APP_ID;
+if (!token || !appId) {
+  process.stderr.write('DISCORD_TOKEN and DISCORD_APP_ID must be set (in .env).\n');
+  process.exit(1);
+}
+
+/** The icon, fitted into a square PNG with a transparent margin. */
+async function emojiImage(source: IconSource): Promise<Buffer> {
+  const response = await fetch(source.url, { signal: AbortSignal.timeout(15_000) });
+  if (!response.ok) throw new Error(`${source.name}: the icon answered ${response.status}`);
+  const bytes = Buffer.from(await response.arrayBuffer());
+  if (bytes.length > MAX_ICON_BYTES) throw new Error(`${source.name}: the icon is too large`);
+  const image = await sharp(bytes)
+    .resize(EMOJI_PIXELS, EMOJI_PIXELS, {
+      fit: 'contain',
+      background: { r: 0, g: 0, b: 0, alpha: 0 },
+    })
+    .png()
+    .toBuffer();
+  if (image.length > MAX_EMOJI_BYTES) throw new Error(`${source.name}: the emoji is too large`);
+  return image;
+}
+
+const rest = new REST().setToken(token);
+let listed: { items: APIApplicationEmoji[] };
+try {
+  listed = (await rest.get(Routes.applicationEmojis(appId))) as { items: APIApplicationEmoji[] };
+} catch (err) {
+  process.stderr.write(`Could not list the emoji of the application: ${failureReason(err)}\n`);
+  process.exit(1);
+}
+const existing = listed.items.flatMap((emoji) => (emoji.name ? [emoji.name] : []));
+const missing = missingIcons(iconSources(), existing);
+process.stdout.write(
+  `The application has ${existing.length} emoji; ${missing.length} of the game's icons are missing.\n`,
+);
+let done = 0;
+let failed = 0;
+for (const source of missing) {
+  try {
+    const image = await emojiImage(source);
+    if (!apply) {
+      process.stdout.write(`would upload ${source.name} (${image.length} bytes)\n`);
+    } else {
+      await rest.post(Routes.applicationEmojis(appId), {
+        body: { name: source.name, image: `data:image/png;base64,${image.toString('base64')}` },
+      });
+      process.stdout.write(`uploaded ${source.name}\n`);
+    }
+    done++;
+  } catch (err) {
+    failed++;
+    process.stderr.write(`${source.name} failed: ${failureReason(err)}\n`);
+  }
+}
+process.stdout.write(
+  `${apply ? 'Uploaded' : 'Would upload'} ${done} of ${missing.length}; ${failed} failed.\n`,
+);
+if (!apply && done > 0) process.stdout.write('Run again with --apply to upload them.\n');
+if (failed > 0) process.exitCode = 1;
diff --git a/src/app.ts b/src/app.ts
index bf64a831c32f4c3c275ffe5625e05fa6a1e71afa..bb7661ae4591a4094bdff97668bc3378776b007d 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -35,6 +35,7 @@ import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordRoleGateway } from './discord/role-gateway.js';
 import { postedMessage } from './discord/screenshot-message.js';
+import { DiscordApplicationEmoji } from './discord/application-emoji.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
@@ -61,6 +62,7 @@ import { OcrService } from './services/ocr-service.js';
 import { ScreenshotService } from './services/screenshot-service.js';
 import { ScreenshotStore } from './services/screenshot-store.js';
 import { PartyLines } from './services/party-lines.js';
+import { ApplicationEmoji } from './services/application-emoji.js';
 import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
 import { PartyStore } from './services/party-store.js';
@@ -150,6 +152,9 @@ export async function startApp(
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
   const partyGateway = new DiscordPartyGateway(log);
+  // The bot's own emoji (types, weather, teams), looked for before a server's.
+  const appEmojiSource = new DiscordApplicationEmoji();
+  const appEmoji = new ApplicationEmoji(appEmojiSource, log);
   // The servers of the client that ended up connected, once it is ready.
   let botServers: () => readonly string[] = () => [];
   // Changes of the boss list and a list that is out of date, told to the servers once the client
@@ -194,9 +199,14 @@ export async function startApp(
     gameData,
     raidEvents,
     users,
+    appEmoji,
     settings: config.settings,
     log,
   });
+  // The posts are shown anew with the application's emoji once they are read, or change.
+  appEmoji.onChange(() => {
+    partyService.emojiChanged();
+  });
   const wants = new PokemonNotificationRepository(
     db,
     formReader(() => gameData.catalogue),
@@ -365,6 +375,7 @@ export async function startApp(
     spawns,
     pictures: maps,
     screenshots: screenshotStore,
+    emoji: appEmoji,
     lines,
     gateway: partyGateway,
     raidBosses,
@@ -492,6 +503,7 @@ export async function startApp(
     create: createClient,
     configure(client) {
       partyGateway.use(client);
+      appEmojiSource.use(client);
       members.use(client);
       roleGateway.use(client);
       dmGateway.use(client);
@@ -500,6 +512,8 @@ export async function startApp(
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
         botServers = () => [...ready.guilds.cache.keys()];
         bossAnnouncer.ready();
+        // Before the first posts are shown; `refresh` logs what fails and never throws.
+        void appEmoji.refresh();
         markConnected();
         // The reader's files (about 15 MB the first time) are had now, so that the first
         // screenshot does not wait for them; never awaited, and `ensure` logs what fails.
@@ -610,7 +624,7 @@ export async function startApp(
       { name: 'gym and region changes', timeoutMs: 5_000, run: () => adminLock.whenIdle() },
       { name: 'train moves', timeoutMs: 5_000, run: () => trains.flush() },
       { name: 'party lines', timeoutMs: 5_000, run: () => attendance.flush() },
-      { name: 'party posts', timeoutMs: 5_000, run: () => partyService.flush() },
+      { name: 'party posts', timeoutMs: 5_000, run: () => partyService.close() },
       { name: 'forum access', timeoutMs: 5_000, run: () => access.flush() },
       // A member's roles are changed one request after the other: a change that has begun is
       // finished while Discord is connected and the database is open.
diff --git a/src/discord/application-emoji.ts b/src/discord/application-emoji.ts
new file mode 100644
index 0000000000000000000000000000000000000000..879bede33708461184ab15516d93e1d380648ea1
--- /dev/null
+++ b/src/discord/application-emoji.ts
@@ -0,0 +1,26 @@
+import type { Client } from 'discord.js';
+import type { ApplicationEmojiSource } from '../services/application-emoji.js';
+
+/**
+ * The emoji of the bot's application as discord.js reads them (one request for all). The
+ * client is handed over once it exists, like the gateways'; a read before that, or before the
+ * client knows its application, fails.
+ */
+export class DiscordApplicationEmoji implements ApplicationEmojiSource {
+  private client: Client | undefined;
+
+  use(client: Client): void {
+    this.client = client;
+  }
+
+  async list(): Promise<ReadonlyMap<string, string>> {
+    const application = this.client?.application;
+    if (!application) throw new Error('Discord is not connected yet');
+    const emojis = await application.emojis.fetch();
+    const found = new Map<string, string>();
+    for (const emoji of emojis.values()) {
+      if (emoji.name) found.set(emoji.name, emoji.toString());
+    }
+    return found;
+  }
+}
diff --git a/src/domain/pogo/game-icons.test.ts b/src/domain/pogo/game-icons.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..035ad8e27de7e12c84bf98b9a8bbfcc9d87a22c3
--- /dev/null
+++ b/src/domain/pogo/game-icons.test.ts
@@ -0,0 +1,25 @@
+import { describe, expect, it } from 'vitest';
+import { GAME_ICON_NAMES, typeWord, WEATHER_ICON, weatherWord } from './game-icons.js';
+import { POKEMON_TYPES, WEATHER_CONDITIONS } from './types.js';
+
+describe('the names of the game icons', () => {
+  it('has an emoji for every type, by the legacy names', () => {
+    for (const type of POKEMON_TYPES) expect(GAME_ICON_NAMES).toContain(type);
+    expect(GAME_ICON_NAMES).toEqual(expect.arrayContaining(['instinct', 'mystic', 'valor']));
+  });
+
+  it('shows every weather of the game master by an emoji the upload makes', () => {
+    for (const weather of WEATHER_CONDITIONS) {
+      expect(GAME_ICON_NAMES).toContain(WEATHER_ICON[weather]);
+    }
+    expect(WEATHER_ICON.clear).toBe('sunny');
+    expect(WEATHER_ICON.partly_cloudy).toBe('partlycloudy');
+    expect(WEATHER_ICON.overcast).toBe('cloudy');
+  });
+
+  it('names types and weather in words where there is no emoji', () => {
+    expect(typeWord('rock')).toBe('Rock');
+    expect(weatherWord('partly_cloudy')).toBe('Partly cloudy');
+    expect(weatherWord('clear')).toBe('Sunny');
+  });
+});
diff --git a/src/domain/pogo/game-icons.ts b/src/domain/pogo/game-icons.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7d36108bfab04709ecb6f8ad3f653036e204effa
--- /dev/null
+++ b/src/domain/pogo/game-icons.ts
@@ -0,0 +1,66 @@
+import { POKEMON_TYPES, type PokemonType, type Weather } from './types.js';
+
+/**
+ * The names of the emoji that show the game's icons for types, weather and teams. They are the
+ * names the legacy bot looked up among a server's own emoji, so a server that uploaded them for
+ * it keeps showing its own where the bot's application has none.
+ */
+
+/** A type's emoji has the type's name: `rock`, `electric`. */
+export const TYPE_ICON_NAMES: readonly PokemonType[] = POKEMON_TYPES;
+
+/**
+ * The emoji of each weather of the game master. The game's clear weather is shown by the sunny
+ * icon; the night-time clear icon is uploaded under `clear` for the legacy names, but not shown.
+ */
+export const WEATHER_ICON: Readonly<Record<Weather, string>> = {
+  clear: 'sunny',
+  rainy: 'rain',
+  partly_cloudy: 'partlycloudy',
+  overcast: 'cloudy',
+  windy: 'windy',
+  snow: 'snow',
+  fog: 'fog',
+};
+
+/** Every weather emoji, in the legacy bot's names. */
+export const WEATHER_ICON_NAMES = [
+  'sunny',
+  'clear',
+  'rain',
+  'partlycloudy',
+  'cloudy',
+  'windy',
+  'snow',
+  'fog',
+] as const;
+
+/** The teams' emoji; `teamless` is for a member without a team. */
+export const TEAM_ICON_NAMES = ['instinct', 'mystic', 'valor', 'teamless'] as const;
+
+/** Every emoji of the game's icons that the bot looks for, as the upload script makes them. */
+export const GAME_ICON_NAMES: readonly string[] = [
+  ...TYPE_ICON_NAMES,
+  ...WEATHER_ICON_NAMES,
+  ...TEAM_ICON_NAMES,
+];
+
+/** A weather in words where no emoji shows it: as the game names it, in sentence case. */
+const WEATHER_WORDS: Readonly<Record<Weather, string>> = {
+  clear: 'Sunny',
+  rainy: 'Rainy',
+  partly_cloudy: 'Partly cloudy',
+  overcast: 'Cloudy',
+  windy: 'Windy',
+  snow: 'Snow',
+  fog: 'Fog',
+};
+
+export function weatherWord(weather: Weather): string {
+  return WEATHER_WORDS[weather];
+}
+
+/** A type in words where no emoji shows it: `Rock`. */
+export function typeWord(type: PokemonType): string {
+  return type.charAt(0).toUpperCase() + type.slice(1);
+}
diff --git a/src/render/party-post.test.ts b/src/render/party-post.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..443ed06ef0952262e25c85ec3e564304efc3d6f2
--- /dev/null
+++ b/src/render/party-post.test.ts
@@ -0,0 +1,40 @@
+import { describe, expect, it } from 'vitest';
+import { testRaid, withAttendees } from '../../test/support/parties.js';
+import { attendeeTexts, inShownOrder, type PostEmoji } from './party-post.js';
+
+const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
+const party = withAttendees(testRaid(), {
+  '300000000000000001': { name: 'Ann' },
+  '300000000000000002': { name: 'Bea' },
+  '300000000000000003': { name: 'Cid', team: 'mystic' },
+  '300000000000000004': { name: 'Dot', team: 'mystic', number: 2 },
+  '300000000000000005': { name: 'Eve', team: 'valor', remote: true },
+});
+const ids = inShownOrder(
+  party,
+  Object.keys(party.attendees).filter((id) => id.startsWith('3')),
+);
+
+describe('attendeeTexts', () => {
+  it('writes the emoji of a team once, before the first of its members', () => {
+    const emoji: PostEmoji = { shiny: '✨', remote: '📡', teams };
+    expect(attendeeTexts(party, ids, emoji)).toEqual([
+      'Ann',
+      'Bea',
+      '❄️ Cid',
+      'Dot +1',
+      '🔥 Eve 📡',
+    ]);
+  });
+
+  it('marks the members without a team only where there is a teamless emoji', () => {
+    const emoji: PostEmoji = { shiny: '✨', remote: '📡', teams, teamless: '<:teamless:1>' };
+    expect(attendeeTexts(party, ids, emoji)).toEqual([
+      '<:teamless:1> Ann',
+      'Bea',
+      '❄️ Cid',
+      'Dot +1',
+      '🔥 Eve 📡',
+    ]);
+  });
+});
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index a10100cee555107b34c2bd8c1d656eccf20579c2..d702d9c4fa463e4ef6c20a02c8f37dc2ec1094c8 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -36,11 +36,21 @@ export const ENDED_COLOUR = 0xe74c3c;
 /** Said in the post of a party that a moderator keeps (`/admin save-party`). */
 export const KEPT_OPEN = 'Kept open by a moderator: this post is not archived by itself.';
 
-/** Emoji as message text (`<:pineshiny:123>`), or plain characters when the server has none. */
+/**
+ * Emoji as message text (`<:pineshiny:123>`): the bot's application's of that name, else the
+ * server's, else plain characters.
+ */
 export interface PostEmoji {
   shiny: string;
   remote: string;
   teams: Readonly<Record<Team, string>>;
+  /** Before the members without a team; nothing where no emoji of that name exists. */
+  teamless?: string;
+  /**
+   * The emoji of one of the game's icons by its name (`GAME_ICON_NAMES`), undefined where there
+   * is none: the text then names it in words.
+   */
+  icon?: (name: string) => string | undefined;
 }
 
 /** What the lists of trainers in a post are made from. */
@@ -79,21 +89,24 @@ function attendeeText(memberId: string, attendee: Attendee, emoji: PostEmoji): s
  * saw (a mention would double every entry, and reads "@unknown-user" where the reader's client
  * has not loaded the member; only one the bot has no name for is a mention), and the emoji of a team
  * once, before the first of its members (a server's own emoji is some thirty characters, which
- * for every trainer would halve what fits into a field).
+ * for every trainer would halve what fits into a field). Members without a team have the
+ * `teamless` emoji where there is one, and nothing otherwise.
  */
 export function attendeeTexts(
   party: Party,
   memberIds: readonly string[],
   emoji: PostEmoji,
 ): string[] {
-  let before: Team | undefined;
+  let before: Team | 'none' | undefined;
   return memberIds.map((id) => {
     const attendee = party.attendees[id];
     if (!attendee) return `<@${id}>`;
     const text = attendeeText(id, attendee, emoji);
-    const first = attendee.team !== undefined && attendee.team !== before;
-    before = attendee.team;
-    return first && attendee.team ? `${emoji.teams[attendee.team]} ${text}` : text;
+    const team = attendee.team ?? 'none';
+    const first = team !== before;
+    before = team;
+    const mark = attendee.team ? emoji.teams[attendee.team] : emoji.teamless;
+    return first && mark !== undefined ? `${mark} ${text}` : text;
   });
 }
 
diff --git a/src/services/application-emoji.test.ts b/src/services/application-emoji.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..90c78ef408725ede37cf8c17f4ca2daf30e0b373
--- /dev/null
+++ b/src/services/application-emoji.test.ts
@@ -0,0 +1,104 @@
+import { describe, expect, it } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { ApplicationEmoji } from './application-emoji.js';
+
+describe('ApplicationEmoji', () => {
+  it('knows nothing before the first read, and the emoji of the application after it', async () => {
+    const { log } = createTestLogger();
+    const emoji = new ApplicationEmoji(
+      { list: () => Promise.resolve(new Map([['rock', '<:rock:1>']])) },
+      log,
+    );
+    expect(emoji.get('rock')).toBeUndefined();
+    await emoji.refresh();
+    expect(emoji.get('rock')).toBe('<:rock:1>');
+    expect(emoji.get('ice')).toBeUndefined();
+  });
+
+  it('keeps the last good list when a read fails, and says so', async () => {
+    const { log, entries } = createTestLogger();
+    let fail = false;
+    const emoji = new ApplicationEmoji(
+      {
+        list: () =>
+          fail
+            ? Promise.reject(new Error('down'))
+            : Promise.resolve(new Map([['ice', '<:ice:2>']])),
+      },
+      log,
+    );
+    await emoji.refresh();
+    fail = true;
+    await emoji.refresh();
+    expect(emoji.get('ice')).toBe('<:ice:2>');
+    expect(entries.at(-1)).toMatchObject({
+      level: 40,
+      msg: 'could not read the emoji of the application; keeping the last list',
+    });
+  });
+
+  it('tells its listener when the list it knows changes: the first read, and a read that differs', async () => {
+    const { log } = createTestLogger();
+    let found = new Map([['rock', '<:rock:1>']]);
+    let fail = false;
+    const emoji = new ApplicationEmoji(
+      { list: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve(found)) },
+      log,
+    );
+    let told = 0;
+    emoji.onChange(() => {
+      told++;
+    });
+    await emoji.refresh();
+    expect(told).toBe(1);
+    // The same emoji again (another map with the same entries): nothing to show anew.
+    found = new Map([['rock', '<:rock:1>']]);
+    await emoji.refresh();
+    expect(told).toBe(1);
+    fail = true;
+    await emoji.refresh();
+    expect(told).toBe(1);
+    fail = false;
+    found = new Map([
+      ['rock', '<:rock:1>'],
+      ['ice', '<:ice:2>'],
+    ]);
+    await emoji.refresh();
+    expect(told).toBe(2);
+    found = new Map([
+      ['rock', '<:rock:9>'],
+      ['ice', '<:ice:2>'],
+    ]);
+    await emoji.refresh();
+    expect(told).toBe(3);
+  });
+
+  it('tells nobody when the first read finds nothing', async () => {
+    const { log } = createTestLogger();
+    const emoji = new ApplicationEmoji({ list: () => Promise.resolve(new Map()) }, log);
+    let told = 0;
+    emoji.onChange(() => {
+      told++;
+    });
+    await emoji.refresh();
+    expect(told).toBe(0);
+  });
+
+  it('shares a read that is under way', async () => {
+    const { log } = createTestLogger();
+    let reads = 0;
+    const emoji = new ApplicationEmoji(
+      {
+        list: () => {
+          reads++;
+          return Promise.resolve(new Map());
+        },
+      },
+      log,
+    );
+    await Promise.all([emoji.refresh(), emoji.refresh()]);
+    expect(reads).toBe(1);
+    await emoji.refresh();
+    expect(reads).toBe(2);
+  });
+});
diff --git a/src/services/application-emoji.ts b/src/services/application-emoji.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4f729019f9522b002b60077fbde815e4bd76da35
--- /dev/null
+++ b/src/services/application-emoji.ts
@@ -0,0 +1,63 @@
+import type { Logger } from '../log.js';
+
+function sameEmoji(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
+  if (a.size !== b.size) return false;
+  for (const [name, text] of a) if (b.get(name) !== text) return false;
+  return true;
+}
+
+/** Where the emoji of the bot's own application come from: by name, as message text. */
+export interface ApplicationEmojiSource {
+  /** Every emoji of the application, by name (`<:rock:123>`, `<a:name:id>` when animated). */
+  list(): Promise<ReadonlyMap<string, string>>;
+}
+
+/**
+ * The emoji of the bot's own application (Discord lets an application have up to 2,000 that it
+ * may use in every server), kept in memory: read after the connection and again with the hourly
+ * upkeep. A read that fails is logged and the last good list stays; before the first good read
+ * there is none, and the posts fall back to the server's emoji or to words. When a read finds
+ * other emoji than were known (the first read, an upload), the listener is told, so that the
+ * posts can be shown anew with them.
+ */
+export class ApplicationEmoji {
+  private known: ReadonlyMap<string, string> = new Map();
+  private reading: Promise<void> | undefined;
+  private listener: (() => void) | undefined;
+
+  constructor(
+    private readonly source: ApplicationEmojiSource,
+    private readonly log: Logger,
+  ) {}
+
+  /** Who is told when the emoji change (the party posts, `PartyService.emojiChanged`). */
+  onChange(listener: () => void): void {
+    this.listener = listener;
+  }
+
+  /** Reads the list anew; a read already under way is shared. Never throws. */
+  refresh(): Promise<void> {
+    this.reading ??= this.source
+      .list()
+      .then((found) => {
+        const changed = !sameEmoji(this.known, found);
+        this.known = found;
+        if (changed) this.listener?.();
+      })
+      .catch((err: unknown) => {
+        this.log.warn(
+          { err },
+          'could not read the emoji of the application; keeping the last list',
+        );
+      })
+      .finally(() => {
+        this.reading = undefined;
+      });
+    return this.reading;
+  }
+
+  /** The emoji of that name as message text, or undefined when the application has none. */
+  get(name: string): string | undefined {
+    return this.known.get(name);
+  }
+}
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 401e91a087bf4dff8481148a1cc10bbf8306da1e..6c375efaa721be33bcb75e92797dd1f14cd04ee7 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -615,6 +615,33 @@ describe('PartyScheduler: running', () => {
     expect(pruned).toBe(1);
   });
 
+  it('has the emoji of the application read anew with the upkeep', async () => {
+    const made = await reportedRaid();
+    let read = 0;
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      emoji: {
+        refresh: () => {
+          read += 1;
+          return Promise.resolve();
+        },
+      },
+      lines: made.lines,
+      gateway: made.gateway,
+      raidBosses: { autoset: () => undefined },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+      upkeepMs: 0,
+    });
+    await scheduler.tick();
+    await scheduler.whenIdle();
+    expect(read).toBe(1);
+  });
+
   it('has the standing spawn reports swept with the forums, also when another step fails', async () => {
     const made = await reportedRaid();
     let swept = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index 7fcf4dae6441bf085e83fc8b94bf828512918ac2..f4002e87082597659371ad4a18fa25bdb93b63b7 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -43,6 +43,8 @@ export interface PartySchedulerOptions {
   pictures?: { prunePlaces(): Promise<unknown> };
   /** The screenshots kept on disk, of which those that are due go with the upkeep. */
   screenshots?: { sweep(): Promise<unknown> };
+  /** The emoji of the bot's application, read anew with the upkeep (`ApplicationEmoji`). */
+  emoji?: { refresh(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -216,10 +218,10 @@ export class PartyScheduler {
    * Archives open posts of ended parties, looks after the summaries, takes back the access to
    * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
    * gone, has the spawn reports deleted that no process deleted at their time, and the kept
-   * screenshots that are due: at start and hourly.
+   * screenshots that are due, and reads the application's emoji anew: at start and hourly.
    */
   private upkeep(): void {
-    const { posts, access, routes, spawns, pictures, screenshots, log } = this.options;
+    const { posts, access, routes, spawns, pictures, screenshots, emoji, log } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -237,6 +239,7 @@ export class PartyScheduler {
       if (spawns) await step(() => spawns.sweep());
       if (pictures) await step(() => pictures.prunePlaces());
       if (screenshots) await step(() => screenshots.sweep());
+      if (emoji) await step(() => emoji.refresh());
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
diff --git a/src/services/party-service.emoji.test.ts b/src/services/party-service.emoji.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e4e3a6e1eb7546fad2c88e0177bd9abaf45f32c0
--- /dev/null
+++ b/src/services/party-service.emoji.test.ts
@@ -0,0 +1,133 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { EMOJI_RENDER_GAP_MS } from './party-service.js';
+
+/** Timers that run only when a test fires them. */
+function handTimers() {
+  const set: { run: () => void; ms: number; cancelled: boolean; fired: boolean }[] = [];
+  return {
+    set,
+    setTimer: (run: () => void, ms: number) => {
+      const timer = { run, ms, cancelled: false, fired: false };
+      set.push(timer);
+      return () => {
+        timer.cancelled = true;
+      };
+    },
+    /** The emoji timers that wait: neither fired nor cancelled. */
+    waiting: () => set.filter((t) => t.ms === EMOJI_RENDER_GAP_MS && !t.cancelled && !t.fired),
+  };
+}
+
+/** Fifty meetups with their posts, over hand timers and an application emoji list. */
+async function fiftyMeetups() {
+  const app = new Map<string, string>();
+  const timers = handTimers();
+  const made = await partyServiceWith([], {
+    appEmoji: { get: (name) => app.get(name) },
+    setTimer: timers.setTimer,
+  });
+  const postIds: string[] = [];
+  for (let n = 0; n < 50; n++) {
+    const outcome = await made.service.createMeetup({
+      name: `Picnic ${n}`,
+      creatorId: `2000000000000${String(n).padStart(5, '0')}`,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    postIds.push(outcome.party.forumPostId ?? '');
+  }
+  await made.service.flush();
+  const edited = () => postIds.filter((id) => (made.gateway.posts.get(id)?.edits ?? 0) > 0);
+  expect(edited()).toEqual([]);
+  app.set('teamless', '<:teamless:1>');
+  return { ...made, timers, postIds, edited };
+}
+
+describe('PartyService: the emoji of a post', () => {
+  it('takes the application’s emoji first, then the server’s, then plain characters', async () => {
+    const app = new Map([
+      ['valor', '<:valor:1>'],
+      ['rock', '<:rock:2>'],
+      ['pineshiny', '<:pineshiny:3>'],
+    ]);
+    const made = await reportedRaid({}, { appEmoji: { get: (name) => app.get(name) } });
+    made.gateway.emojis.set('valor', '<:valor:90>');
+    made.gateway.emojis.set('mystic', '<:mystic:91>');
+    made.gateway.emojis.set('ice', '<:ice:92>');
+    const { emoji } = made.service.view(made.current());
+    expect(emoji.teams).toEqual({ instinct: '⚡', mystic: '<:mystic:91>', valor: '<:valor:1>' });
+    expect(emoji.teamless).toBeUndefined();
+    expect(emoji.icon?.('rock')).toBe('<:rock:2>');
+    expect(emoji.icon?.('ice')).toBe('<:ice:92>');
+    expect(emoji.icon?.('fairy')).toBeUndefined();
+    expect(emoji.remote).toBe('🛰️');
+  });
+
+  it('shows every active post anew when the emoji of the application change', async () => {
+    const app = new Map<string, string>();
+    const made = await reportedRaid({}, { appEmoji: { get: (name) => app.get(name) } });
+    await made.attendance.signUp(
+      made.party.id,
+      { id: '200000000000000002', name: 'Alice', team: 'valor' },
+      PartyStatus.Coming,
+    );
+    await made.service.flush();
+    const shown = () => JSON.stringify(made.gateway.posts.get(made.postId)?.message);
+    expect(shown()).toContain('🔥');
+    const edits = made.gateway.posts.get(made.postId)?.edits ?? 0;
+    app.set('valor', '<:valor:1>');
+    made.service.emojiChanged();
+    await made.service.flush();
+    expect(shown()).toContain('<:valor:1>');
+    expect(made.gateway.posts.get(made.postId)?.edits).toBe(edits + 1);
+    // Nothing changed for the post: no edit.
+    made.service.emojiChanged();
+    await made.service.flush();
+    expect(made.gateway.posts.get(made.postId)?.edits).toBe(edits + 1);
+  });
+
+  it('has a teamless emoji only where one of that name exists', async () => {
+    const made = await reportedRaid();
+    made.gateway.emojis.set('teamless', '<:teamless:93>');
+    expect(made.service.view(made.current()).emoji.teamless).toBe('<:teamless:93>');
+  });
+
+  it('shows the posts anew one at a time, a quarter of a second apart, never all at once', async () => {
+    const made = await fiftyMeetups();
+    made.service.emojiChanged();
+    // One post now, the next when its timer comes.
+    expect(made.timers.waiting()).toHaveLength(1);
+    let fired = 0;
+    for (let next = made.timers.waiting()[0]; next; next = made.timers.waiting()[0]) {
+      next.fired = true;
+      next.run();
+      fired++;
+    }
+    expect(fired).toBe(49);
+    await made.service.flush();
+    expect(made.edited()).toEqual(made.postIds);
+    expect(JSON.stringify(made.gateway.posts.get(made.postIds[49] ?? '')?.message)).toContain(
+      '<:teamless:1>',
+    );
+  });
+
+  it('stops showing posts anew at a flush: what waited is left as it is', async () => {
+    const made = await fiftyMeetups();
+    made.service.emojiChanged();
+    await made.service.flush();
+    expect(made.edited()).toHaveLength(1);
+    expect(made.timers.waiting()).toEqual([]);
+  });
+
+  it('shows nothing anew once closed for shutdown', async () => {
+    const made = await fiftyMeetups();
+    await made.service.close();
+    made.service.emojiChanged();
+    expect(made.timers.set.filter((t) => t.ms === EMOJI_RENDER_GAP_MS)).toEqual([]);
+    await made.service.flush();
+    expect(made.edited()).toEqual([]);
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 94f1251895922f0c2cdc869133c15aac17388258..c30c0f476279ded5324cdf7dc905e11ccdd6b614 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -78,6 +78,11 @@ const MAX_ROLE_PINGS = 5;
 const ANSWER_WAIT_MS = 3_000;
 /** An unchanged post is checked for existence at most this often. */
 const CHECK_EVERY_MS = 10 * MINUTE;
+/**
+ * When the emoji change, the active posts are shown anew one after the other, one this often:
+ * a restart reads the emoji anew, and every post at once would be a burst of edits.
+ */
+export const EMOJI_RENDER_GAP_MS = 250;
 
 export interface RaidReport {
   gym: Gym;
@@ -210,6 +215,11 @@ export interface PartyServiceOptions {
   raidEvents: RaidEventProvider;
   /** The members' settings: who lets the bot ping them. Without it nobody is pinged. */
   users?: UserSettingsReader;
+  /**
+   * The emoji of the bot's application (`ApplicationEmoji`), looked for before the server's.
+   * Without it only the server's emoji are used.
+   */
+  appEmoji?: { get(name: string): string | undefined };
   settings: Settings;
   log: Logger;
   now?: () => number;
@@ -260,6 +270,11 @@ export class PartyService {
    * text would be the same is not edited again.
    */
   private readonly summarySent = new Map<number, { postId: string; text: string }>();
+  /** The parties whose posts wait to be shown with other emoji, and the timer of the next. */
+  private emojiQueue: string[] = [];
+  private emojiTimer: (() => void) | undefined;
+  /** Set by `close` at shutdown: nothing is shown anew from then on. */
+  private closed = false;
   /** The copies of a party's message in other channels and at the bottom of its post. */
   private readonly mirrors: PartyMirrors;
   /**
@@ -328,21 +343,27 @@ export class PartyService {
     return raidDurationRules(this.options.settings, this.options.raidEvents.events());
   }
 
-  /** The emoji of the server a party's post is in, or plain characters where it has none. */
+  /**
+   * The emoji a party's post shows, each by name: the bot's application's, else one of the server
+   * the post is in (as the legacy bot used them), else plain characters, or words for the game's
+   * icons (`PostEmoji.icon`).
+   */
   private emoji(party: Party): PostEmoji {
-    const { gateway, settings } = this.options;
+    const { gateway, settings, appEmoji } = this.options;
     const where = party.forumChannelId;
-    const emoji = (name: string, fallback: string): string =>
-      (where === null ? undefined : gateway.emoji(where, name)) ?? fallback;
+    const find = (name: string): string | undefined =>
+      appEmoji?.get(name) ?? (where === null ? undefined : gateway.emoji(where, name));
+    const teamless = find('teamless');
     return {
-      shiny: emoji(settings.emoji.shiny, '✨'),
-      remote: emoji(settings.emoji.remote, '🛰️'),
-      // The server's own emoji of that name, as the legacy bot used them.
+      shiny: find(settings.emoji.shiny) ?? '✨',
+      remote: find(settings.emoji.remote) ?? '🛰️',
       teams: {
-        instinct: emoji('instinct', '⚡'),
-        mystic: emoji('mystic', '❄️'),
-        valor: emoji('valor', '🔥'),
+        instinct: find('instinct') ?? '⚡',
+        mystic: find('mystic') ?? '❄️',
+        valor: find('valor') ?? '🔥',
       },
+      ...(teamless === undefined ? {} : { teamless }),
+      icon: find,
     };
   }
 
@@ -1070,6 +1091,35 @@ export class PartyService {
     if (regionId !== null && regionId !== undefined) this.summaries.request(regionId);
   }
 
+  /**
+   * The emoji the posts show have changed (the application's were read for the first time, or
+   * anew after an upload): every active party's post is brought up to date as after a change,
+   * one party every `EMOJI_RENDER_GAP_MS` (a change while some wait starts the round anew), and a
+   * post whose message stays the same is not edited. Nothing after `close`; `flush` drops the rest.
+   */
+  emojiChanged(): void {
+    if (this.closed) return;
+    this.emojiQueue = this.options.store
+      .active()
+      .filter((party) => party.forumPostId !== null)
+      .map((party) => party.id);
+    if (this.emojiTimer === undefined) this.nextEmojiPost();
+  }
+
+  /** Shows the next waiting post with the new emoji, and sets the timer of the one after it. */
+  private nextEmojiPost(): void {
+    this.emojiTimer = undefined;
+    const partyId = this.emojiQueue.shift();
+    if (partyId === undefined) return;
+    // Ended meanwhile: there is nothing to show.
+    if (this.options.store.get(partyId)?.forumPostId) this.posts.request(partyId);
+    if (this.emojiQueue.length > 0) {
+      this.emojiTimer = this.setTimer(() => {
+        this.nextEmojiPost();
+      }, EMOJI_RENDER_GAP_MS);
+    }
+  }
+
   /**
    * A party has just ended (it is no longer in the store, so `changed` cannot find its region):
    * the summary of its region is brought up to date shortly, and what is kept for the party and
@@ -1401,10 +1451,15 @@ export class PartyService {
 
   /**
    * Does everything that is waiting now, and cancels the timers of titles and tags that wait for
-   * a rate limit, so what they wait for is not retried. For shutdown and for tests: stop whatever
-   * calls `changed` (the scheduler) before it.
+   * a rate limit, so what they wait for is not retried, and drops the posts that wait to be shown
+   * with other emoji (`emojiChanged`). For tests; at shutdown `close`: stop whatever calls
+   * `changed` (the scheduler) before it.
    */
   async flush(): Promise<void> {
+    // Posts that wait for other emoji stay as they are.
+    this.emojiTimer?.();
+    this.emojiTimer = undefined;
+    this.emojiQueue = [];
     // A raid on its way to another region arrives first.
     await this.moves.whenIdle();
     do {
@@ -1419,6 +1474,12 @@ export class PartyService {
     this.summaryTimers.clear();
   }
 
+  /** For shutdown: shows nothing anew from now on (`emojiChanged`), then `flush`. */
+  async close(): Promise<void> {
+    this.closed = true;
+    await this.flush();
+  }
+
   private mayRename(postId: string): boolean {
     const now = this.now();
     const recent = (this.renames.get(postId) ?? []).filter((at) => now - at < RENAME_WINDOW_MS);
````


### Task 3: The parts of a v2 post: layout, trainer lists, buttons, raid words

Prototype commit: `4aad390079e288c62a7bb8bfed073752ac18a92b`

What every post of a party will be made of, before any post uses it
(the posts change kind all at once in the next commit: the services
cannot serve classic and v2 posts side by side without throwaway code).

party-post.ts: a post is laid out as blocks (text, a thin line, a text
with the picture or a button beside it, rows of buttons) with an accent
colour and a picture; postMessage makes it one container of a
components-v2 message, with or without its picture, its controls, the
button that moves a train, and with a copy's line as the first line of
its first text (no component more than the post). Text is kept within
TEXT_BUDGET (4,000, assumed, in one place) less the room of that line:
fittedLayout gives the renderer a Fit, cuts its lists of members down
together (fitLists, "…and N more") and, as a last resort, its other
long texts (labels, notes, routes: cutText). trainerBlocks lists who
comes: with one group a line per status with its head count and its
button, an empty one too; with several a block per group with "Join A"
beside it, then who completed the raid.

party-controls.ts: the buttons with their emoji and the bottom rows.
"Join A" (the action `group`) makes a member coming in that group from
any status and only moves one who is coming (joinInto in the domain and
the attendance service); /group join keeps the status. v2.ts builds
the components. raidWords names a raid as the legacy bot did.

**Files:**

```
 src/commands/parties/in-train.test.ts |   3 +-
 src/components/party.test.ts          |  15 ++
 src/components/party.ts               |   2 +-
 src/domain/party/attendance.test.ts   |  50 +++++++
 src/domain/party/attendance.ts        |  26 ++++
 src/domain/pogo/raid-tier.test.ts     |   8 ++
 src/domain/pogo/raid-tier.ts          |  18 +++
 src/render/party-controls.test.ts     |  89 +++++++++++-
 src/render/party-controls.ts          | 120 ++++++++++++++++
 src/render/party-post.test.ts         | 250 ++++++++++++++++++++++++++++++++-
 src/render/party-post.ts              | 410 +++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/render/v2.ts                      |  50 +++++++
 src/services/attendance-service.ts    |  10 ++
 13 files changed, 1045 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/parties/in-train.test.ts src/components/party.test.ts src/domain/party/attendance.test.ts src/domain/pogo/raid-tier.test.ts src/render/party-controls.test.ts src/render/party-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 4aad390079e288c62a7bb8bfed073752ac18a92b -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `The parts of a v2 post: layout, trainer lists, buttons, raid words`, the body above and the trailer, staging exactly
  `src/commands/parties/in-train.test.ts src/components/party.test.ts src/components/party.ts src/domain/party/attendance.test.ts src/domain/party/attendance.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/raid-tier.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/party-post.test.ts src/render/party-post.ts src/render/v2.ts src/services/attendance-service.ts`.

````diff
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index c0c7cec2c1b9de0bc39a74c79fd5e503d0799ea3..6d2bf41649e1c82b7caeac2be52e68a2dbc61fb9 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -271,8 +271,9 @@ describe('the buttons of a train post', () => {
       'You are here with 1 more, remotely.',
     );
     await made.attendance.newGroup(made.party.id, { id: REPORTER });
+    // Join B makes a member who is here coming in group B; what else they gave stays.
     expect(sent((await made.click('group:B')).reply).content).toBe(
-      'You are here with 1 more, in group B, remotely.',
+      'You are coming with 1 more, in group B, remotely.',
     );
     expect(sent((await made.click('leave')).reply).content).toBe('You have left this train.');
     expect(sent((await made.click('less')).reply).content).toBe(
diff --git a/src/components/party.test.ts b/src/components/party.test.ts
index d141a1ff4b1951f15c73fc90974fd63bc9b53255..27a27d8fb3fa285c1d431fce13b82998e7252173 100644
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -168,6 +168,21 @@ describe('the buttons of a party post', () => {
     expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
   });
 
+  it('the Join of a group makes a member coming in that group, and only moves one who is coming', async () => {
+    const made = await setup();
+    await made.attendance.newGroup(made.party.id, { id: REPORTER });
+    await made.click('maybe');
+    expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
+    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'A' });
+    await made.click('here');
+    expect(sent((await made.click('group:B')).reply).content).toBe('You are coming, in group B.');
+    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'B' });
+    expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
+    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'A' });
+    const bob = await made.click('group:B', { userId: BOB });
+    expect(sent(bob.reply).content).toBe('You are coming, in group B.');
+  });
+
   it('a group button moves the member and names the group in the answer', async () => {
     const made = await setup();
     await made.attendance.newGroup(made.party.id, { id: REPORTER });
diff --git a/src/components/party.ts b/src/components/party.ts
index b36cd3afff70cae16ddf1079a5410838f1b0a8c9..33a2f60647a386f985212cf42dcd769d45ce5565 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -120,7 +120,7 @@ export const partyButtons: ComponentHandler = {
           interaction,
           ctx,
           partyId,
-          await attendance.joinGroup(partyId, member, group),
+          await attendance.joinInto(partyId, member, group),
         );
       }
       case 'time': {
diff --git a/src/domain/party/attendance.test.ts b/src/domain/party/attendance.test.ts
index 71d203ddb8e02c6659225f26bb621b0014344b48..0449d397af361472ecb21a0647ce9ab14343c738 100644
--- a/src/domain/party/attendance.test.ts
+++ b/src/domain/party/attendance.test.ts
@@ -21,6 +21,7 @@ import {
   createGroup,
   finishParty,
   joinGroup,
+  joinInto,
   labelGroup,
   leaveParty,
   releaseAsked,
@@ -325,6 +326,55 @@ describe('groups', () => {
     expect(done(joined).attendees[BOB]).toMatchObject({ status: Coming, group: 'A' });
   });
 
+  it('joins into a group: coming there from any status but coming, which only moves', () => {
+    const party = withAttendees(done(createGroup(testRaid(), REPORTER, limits)), {
+      [ALICE]: { status: PartyStatus.Interested, number: 2, group: 'A', remote: true },
+      [BOB]: { status: Present, group: 'A' },
+      [CAROL]: { status: Coming, group: 'A' },
+    });
+    for (const member of [ALICE, BOB, CAROL]) {
+      expect(done(joinInto(party, member, 'B', limits)).attendees[member]).toMatchObject({
+        status: Coming,
+        group: 'B',
+      });
+    }
+    // What else the member gave stays: the head count, remote.
+    expect(done(joinInto(party, ALICE, 'B', limits)).attendees[ALICE]).toMatchObject({
+      number: 2,
+      remote: true,
+    });
+    const newcomer = joinInto(party, '200000000000000077', 'A', limits);
+    expect(newcomer).toMatchObject({ ok: true, joined: true });
+    expect(done(newcomer).attendees['200000000000000077']).toMatchObject({
+      status: Coming,
+      group: 'A',
+    });
+    // Coming already, in that group: nothing changes.
+    const same = joinInto(party, CAROL, 'A', limits);
+    expect(same.ok && same.party).toBe(party);
+    expect(joinInto(party, ALICE, 'C', limits)).toEqual({ ok: false, reason: 'no-such-group' });
+    expect(joinInto(testMeetup(), ALICE, 'A', limits)).toEqual({ ok: false, reason: 'no-groups' });
+  });
+
+  it('joins into one’s own group: only who is interested comes, who is present stays so', () => {
+    const party = withAttendees(done(createGroup(testRaid(), REPORTER, limits)), {
+      [ALICE]: { status: PartyStatus.Interested, number: 2, group: 'A', remote: true },
+      [BOB]: { status: Present, group: 'A' },
+      [CAROL]: { status: Coming, group: 'A' },
+    });
+    const present = joinInto(party, BOB, 'A', limits);
+    expect(present).toMatchObject({ ok: true, joined: false });
+    expect(present.ok && present.party).toBe(party);
+    const coming = joinInto(party, CAROL, 'A', limits);
+    expect(coming.ok && coming.party).toBe(party);
+    expect(done(joinInto(party, ALICE, 'A', limits)).attendees[ALICE]).toMatchObject({
+      status: Coming,
+      group: 'A',
+      number: 2,
+      remote: true,
+    });
+  });
+
   it('moves an attendee to another group and refuses a group that does not exist', () => {
     const party = withAttendees(done(createGroup(testRaid(), REPORTER, limits)), {
       [ALICE]: { status: Present, number: 2, group: 'A' },
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 9995e4857172e2f72399e44627e83d3e17521cf8..4a660e21e041f4498e51e6fe6d19a4d15d8d0c9b 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -484,6 +484,32 @@ export function joinGroup<P extends Party>(
   };
 }
 
+/**
+ * Joins a member into a group, as "Join A" beside a group of a post does: whoever is not signed
+ * up, interested or present (or asked whether they completed the raid) is coming in that group
+ * then, as Join makes them; a member who is coming already is only moved there (`joinGroup`).
+ * The Join of the group a member is in changes only who is interested: who is present (or asked)
+ * there stays so. The head count and remote stay as they are. Refused with `no-groups` in a party
+ * that has its one group for good, and `no-such-group` for a group it does not have.
+ */
+export function joinInto<P extends Party>(
+  party: P,
+  memberId: string,
+  groupId: GroupId,
+  limits: AttendanceLimits,
+): Change<P, { joined: boolean }> {
+  if (!hasGroups(party)) return refused('no-groups');
+  const attendee = attendeeOf(party, memberId);
+  if (attendee?.status === PartyStatus.Coming) {
+    return joinGroup(party, memberId, groupId, limits);
+  }
+  if (!groupOf(party, groupId)) return refused('no-such-group');
+  if (attendee?.status === PartyStatus.Present && attendee.group === groupId) {
+    return { ok: true, party, joined: false };
+  }
+  return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
+}
+
 /**
  * Opens the next group and moves the member into it. It becomes the group new attendees land
  * in. `others` are the attendees who have not completed the raid, to be told about it.
diff --git a/src/domain/pogo/raid-tier.test.ts b/src/domain/pogo/raid-tier.test.ts
index 2a2df54d9a5defa6cac53119c2ee65a4193f95f5..5d54f028d87840f751cdcc8bd01427c46cd1a071 100644
--- a/src/domain/pogo/raid-tier.test.ts
+++ b/src/domain/pogo/raid-tier.test.ts
@@ -7,6 +7,7 @@ import {
   raidDurationKind,
   raidTier,
   raidTierLabel,
+  raidWords,
   sameRaidTier,
 } from './raid-tier.js';
 
@@ -31,6 +32,13 @@ describe('raid tiers', () => {
 
   it('labels tiers for people', () => {
     expect(raidTierLabel({ level: 'T5', shadow: false })).toBe('T5');
+    expect(raidWords({ level: 'T5', shadow: false })).toBe('Level 5 raid');
+    expect(raidWords({ level: 'T1', shadow: false })).toBe('Level 1 raid');
+    expect(raidWords({ level: 'T3', shadow: true })).toBe('Shadow Level 3 raid');
+    expect(raidWords({ level: 'Mega', shadow: false })).toBe('Mega raid');
+    expect(raidWords({ level: 'MegaLegendary', shadow: false })).toBe('Mega Legendary raid');
+    expect(raidWords({ level: 'SuperMega', shadow: false })).toBe('Super Mega raid');
+    expect(raidWords({ level: 'Elite', shadow: false })).toBe('Elite raid');
     expect(raidTierLabel({ level: 'T3', shadow: true })).toBe('Shadow T3');
     expect(raidTierLabel({ level: 'MegaLegendary', shadow: false })).toBe('Mega Legendary');
     expect(raidTierLabel({ level: 'SuperMega', shadow: false })).toBe('Super Mega');
diff --git a/src/domain/pogo/raid-tier.ts b/src/domain/pogo/raid-tier.ts
index bc93105e7bca1e86b9cb97fd5ebd22501d273a23..15e94a6b1edf3d157c52da969fc41558962a492f 100644
--- a/src/domain/pogo/raid-tier.ts
+++ b/src/domain/pogo/raid-tier.ts
@@ -77,6 +77,24 @@ export function raidTier(level: RaidLevel, shadow = false): RaidTier | undefined
   return { level, shadow };
 }
 
+const WORDS: Readonly<Record<RaidLevel, string>> = {
+  T1: 'Level 1',
+  T3: 'Level 3',
+  T5: 'Level 5',
+  Mega: 'Mega',
+  MegaLegendary: 'Mega Legendary',
+  SuperMega: 'Super Mega',
+  Elite: 'Elite',
+};
+
+/**
+ * What a raid of a tier is called in its post and in a direct message, as the legacy bot said
+ * it: `Level 5 raid`, `Shadow Level 3 raid`, `Mega Legendary raid` (a primal's too).
+ */
+export function raidWords(tier: RaidTier): string {
+  return `${tier.shadow ? 'Shadow ' : ''}${WORDS[tier.level]} raid`;
+}
+
 /** `T5`, `Shadow T5`, `Mega Legendary`. */
 export function raidTierLabel(tier: RaidTier): string {
   return `${tier.shadow ? 'Shadow ' : ''}${LABELS[tier.level]}`;
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 8503bd94d36476e72cd1380e9fb9a6536b461308..b2ce61650a6ada9304b000944a0521e2a4614ec4 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -3,16 +3,23 @@ import {
   ALICE,
   BOB,
   PARTY_NOW,
+  testMeetup,
   testRaid,
   testRaidRules,
+  testTrain,
   withAttendees,
 } from '../../test/support/parties.js';
 import { decodeCustomId, MAX_CUSTOM_ID_LENGTH } from '../discord/custom-id.js';
-import type { RaidParty } from '../domain/party/party.js';
+import type { Party, RaidParty } from '../domain/party/party.js';
 import { setHatchTime } from '../domain/party/raid.js';
 import {
+  bottomControls,
   completionQuestion,
   deletionForm,
+  joinGroupButton,
+  moveTrainButton,
+  statusButton,
+  type BottomOptions,
   groupWords,
   isPartyAction,
   PARTY_ACTIONS,
@@ -195,3 +202,83 @@ describe('deletionForm', () => {
     });
   });
 });
+
+describe('bottomControls', () => {
+  /** Label, emoji and action (or address) of every button, row by row. */
+  const rows = (party: Party, options: BottomOptions) =>
+    bottomControls(party, options).map((row) =>
+      row.map(({ button }) => {
+        const label = 'label' in button ? button.label : undefined;
+        const emoji = 'emoji' in button ? button.emoji?.name : undefined;
+        const what =
+          'custom_id' in button
+            ? decodeCustomId(button.custom_id)?.action
+            : 'url' in button
+              ? button.url
+              : '';
+        return `${emoji ?? ''} ${label ?? ''} ${what ?? ''}`;
+      }),
+    );
+  const MAP = 'https://www.google.com/maps/search/?api=1&query=1%2C2';
+
+  it('puts Leave before the head count, the remote switch and the map under one group', () => {
+    expect(rows(timed, { groups: false, map: MAP })).toEqual([
+      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote', `🗺️ Map ${MAP}`],
+    ]);
+  });
+
+  it('brings the statuses down to a row of their own when the groups carry Join', () => {
+    expect(rows(timed, { groups: true, map: MAP })).toEqual([
+      ['🤔 Interested maybe', '✅ Here here', '🎉 Done done', '👋 Leave leave'],
+      ['⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote', `🗺️ Map ${MAP}`],
+    ]);
+  });
+
+  it('adds Set time to a raid without times and Screenshot feedback to one from a screenshot', () => {
+    const shot = {
+      ...testRaid(),
+      raid: { ...testRaid().raid, screenshot: { id: 'a1', timeUncertain: false } },
+    };
+    expect(rows(shot, { groups: false }).at(-1)).toEqual([
+      '⏰ Set time time',
+      '📷 Screenshot feedback shot',
+    ]);
+  });
+
+  it('has no remote switch for an elite raid, and no Done, Set time or map for a meetup', () => {
+    const elite = setHatchTime(
+      testRaid({ tier: { level: 'Elite', shadow: false } }),
+      PARTY_NOW + 30 * 60_000,
+      testRaidRules(),
+      PARTY_NOW,
+    );
+    expect(rows(elite, { groups: false })).toEqual([
+      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more'],
+    ]);
+    expect(rows(testMeetup(), { groups: false })).toEqual([
+      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote'],
+    ]);
+    expect(rows(testTrain(), { groups: true })[0]).toEqual([
+      '🤔 Interested maybe',
+      '✅ Here here',
+      '👋 Leave leave',
+    ]);
+  });
+
+  it('has buttons beside the statuses and the groups, and one that moves a train', () => {
+    const party = testRaid();
+    expect(statusButton(party, 'coming').button).toMatchObject({
+      label: 'Join',
+      emoji: { name: '🏃' },
+      custom_id: `party:${party.id}:join`,
+    });
+    expect(joinGroupButton(party, { id: 'C' }).button).toMatchObject({
+      label: 'Join C',
+      custom_id: `party:${party.id}:group:C`,
+    });
+    expect(moveTrainButton(party)).toMatchObject({
+      moves: true,
+      button: { label: 'Move train…', custom_id: `party:${party.id}:move` },
+    });
+  });
+});
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index f998f7962f27b2be8e3435e03e7ae74baa5dcd71..d80bb642fa0cee722089c9fdab8b6fc67cbc4558 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -4,6 +4,7 @@ import {
   TextInputStyle,
   type APIActionRowComponent,
   type APIButtonComponentWithCustomId,
+  type APIButtonComponentWithURL,
   type APIComponentInMessageActionRow,
   type APIModalInteractionResponseCallbackData,
 } from 'discord.js';
@@ -17,6 +18,7 @@ import {
   type Party,
   type PartyGroup,
 } from '../domain/party/party.js';
+import type { PostButton } from './party-post.js';
 import { fitItems, plain, truncate } from './text.js';
 
 /** The custom-id kind of the controls of a party's post (and of its copies in other channels). */
@@ -81,15 +83,133 @@ export function partyButton(
   label: string,
   style: APIButtonComponentWithCustomId['style'],
   args?: string[],
+  emoji?: string,
 ): APIButtonComponentWithCustomId {
   return {
     type: ComponentType.Button,
     custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action, ...(args ? { args } : {}) }),
     label,
     style,
+    ...(emoji === undefined ? {} : { emoji: { name: emoji } }),
   };
 }
 
+/** The statuses a post lists, each with the button that signs a member up so. */
+export type ShownStatus = 'interested' | 'coming' | 'present' | 'complete';
+
+const STATUS_BUTTONS: Readonly<
+  Record<ShownStatus, [PartyAction, string, string, APIButtonComponentWithCustomId['style']]>
+> = {
+  interested: ['maybe', 'Interested', '🤔', ButtonStyle.Secondary],
+  coming: ['join', 'Join', '🏃', ButtonStyle.Primary],
+  present: ['here', 'Here', '✅', ButtonStyle.Success],
+  complete: ['done', 'Done', '🎉', ButtonStyle.Secondary],
+};
+
+/** The button beside a status in a post: Interested, Join, Here or Done. */
+export function statusButton(party: Pick<Party, 'id'>, status: ShownStatus): PostButton {
+  const [action, label, emoji, style] = STATUS_BUTTONS[status];
+  return { button: partyButton(party.id, action, label, style, undefined, emoji) };
+}
+
+/**
+ * The button beside a group of a post with several: "Join B" makes a member coming in that
+ * group, from whatever status, and moves one who is coming already (the action `group`,
+ * `AttendanceService.joinInto`).
+ */
+export function joinGroupButton(party: Pick<Party, 'id'>, group: PartyGroup): PostButton {
+  return {
+    button: partyButton(
+      party.id,
+      'group',
+      `Join ${group.id}`,
+      ButtonStyle.Primary,
+      [group.id],
+      '🏃',
+    ),
+  };
+}
+
+/** The button "Move train…" of a train's post; a copy for another region leaves it out. */
+export function moveTrainButton(party: Pick<Party, 'id'>): PostButton {
+  return {
+    button: partyButton(party.id, 'move', MOVE_TRAIN_LABEL, ButtonStyle.Secondary, undefined, '🚂'),
+    moves: true,
+  };
+}
+
+/** A link to a gym's place in Google Maps. */
+function mapButton(url: string): PostButton {
+  const button: APIButtonComponentWithURL = {
+    type: ComponentType.Button,
+    style: ButtonStyle.Link,
+    label: 'Map',
+    emoji: { name: '🗺️' },
+    url,
+  };
+  return { button };
+}
+
+export interface BottomOptions {
+  /**
+   * The party shows several groups: their sections carry "Join A", "Join B", so the buttons of
+   * the other statuses come down here, on a row of their own.
+   */
+  groups: boolean;
+  /** The address of the gym in Google Maps (a raid's post). */
+  map?: string;
+}
+
+/**
+ * The rows at the bottom of a post (spec 4.1). With several groups first Interested, Here and,
+ * for a raid, Done (Join is each group's), with Leave; with one group the statuses have their
+ * buttons beside them and Leave leads the row of the head count. Then −1, +1, the remote switch
+ * (an elite raid has none) and a raid's map; and, on a row of their own, "Set time" for a raid
+ * without times (spec 4.3) and "Screenshot feedback" for one reported from a kept screenshot
+ * (spec 7B). Nothing depends on the time, so the controls never need an edit of their own: Done
+ * on an egg is refused when it is pressed. A meetup has no Done (Leave is there), nor "Set
+ * time" (its times are `/meet` and `/end`).
+ */
+export function bottomControls(party: Party, options: BottomOptions): PostButton[][] {
+  const { id } = party;
+  const leave = {
+    button: partyButton(id, 'leave', 'Leave', ButtonStyle.Danger, undefined, '👋'),
+  };
+  const rows: PostButton[][] = [];
+  if (options.groups) {
+    rows.push([
+      statusButton(party, 'interested'),
+      statusButton(party, 'present'),
+      ...(isRaid(party) ? [statusButton(party, 'complete')] : []),
+      leave,
+    ]);
+  }
+  rows.push([
+    ...(options.groups ? [] : [leave]),
+    { button: partyButton(id, 'less', '−1', ButtonStyle.Secondary, undefined, '⬇️') },
+    { button: partyButton(id, 'more', '+1', ButtonStyle.Secondary, undefined, '⬆️') },
+    ...(remoteAllowed(party)
+      ? [{ button: partyButton(id, 'remote', 'Remote', ButtonStyle.Secondary, undefined, '📡') }]
+      : []),
+    ...(options.map === undefined ? [] : [mapButton(options.map)]),
+  ]);
+  const extras: PostButton[] = [];
+  // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
+  if (isRaid(party) && party.hatchTime === null) {
+    extras.push({
+      button: partyButton(id, 'time', 'Set time', ButtonStyle.Primary, undefined, '⏰'),
+    });
+  }
+  // Only a kept screenshot can be shown.
+  if (isRaid(party) && party.raid.screenshot?.id) {
+    extras.push({
+      button: partyButton(id, 'shot', SCREENSHOT_FEEDBACK, ButtonStyle.Secondary, undefined, '📷'),
+    });
+  }
+  if (extras.length > 0) rows.push(extras);
+  return rows;
+}
+
 /** `Group B (4)`, or `B: park side (4)` for a group with a label; the count is never cut off. */
 function groupLabel(party: Party, group: PartyGroup): string {
   const heads = ` (${headCount(party, group.id)})`;
diff --git a/src/render/party-post.test.ts b/src/render/party-post.test.ts
index 443ed06ef0952262e25c85ec3e564304efc3d6f2..f17c4a3ee2aecfc7e3b4f804df84ee59077d7aca 100644
--- a/src/render/party-post.test.ts
+++ b/src/render/party-post.test.ts
@@ -1,6 +1,33 @@
+import { ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import {
+  accentOf,
+  buttonLabels,
+  componentCount,
+  textDisplays,
+  thumbnailOf,
+  v2,
+} from '../../test/support/messages.js';
 import { testRaid, withAttendees } from '../../test/support/parties.js';
-import { attendeeTexts, inShownOrder, type PostEmoji } from './party-post.js';
+import type { Attendee } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { moveTrainButton, statusButton } from './party-controls.js';
+import {
+  attendeeTexts,
+  fitLists,
+  cutText,
+  fittedLayout,
+  inShownOrder,
+  layoutTextLength,
+  LEAD_ROOM,
+  postMessage,
+  TEXT_BUDGET,
+  trainerBlocks,
+  type Fit,
+  type PostBlock,
+  type PostEmoji,
+  type PostLayout,
+} from './party-post.js';
 
 const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
 const party = withAttendees(testRaid(), {
@@ -38,3 +65,224 @@ describe('attendeeTexts', () => {
     ]);
   });
 });
+
+describe('postMessage', () => {
+  const join = statusButton({ id: 'p1' }, 'coming');
+  const move = moveTrainButton({ id: 'p1' });
+  const layout: PostLayout = {
+    accent: 0x2ecc71,
+    picture: 'https://x.test/boss.png',
+    blocks: [
+      { type: 'section', content: '### Title', accessory: 'picture' },
+      { type: 'separator' },
+      { type: 'section', content: '**Coming (0)**', accessory: join },
+      { type: 'section', content: '**Current gym**', accessory: move },
+      { type: 'separator' },
+      { type: 'controls', rows: [[statusButton({ id: 'p1' }, 'present')]] },
+    ],
+  };
+
+  it('is one container of the post’s colour, a picture and buttons beside their texts', () => {
+    const message = postMessage(layout);
+    expect(accentOf(message)).toBe(0x2ecc71);
+    expect(thumbnailOf(message)).toBe('https://x.test/boss.png');
+    expect(textDisplays(message)).toEqual(['### Title', '**Coming (0)**', '**Current gym**']);
+    expect(buttonLabels(message)).toEqual(['Join', 'Move train…', 'Here']);
+    // Container; 3 sections of 2 each with their texts; 2 lines; a row and its button.
+    expect(componentCount(message)).toBe(1 + 9 + 2 + 2);
+  });
+
+  it('leaves out the picture, the controls or the move button, keeping every text', () => {
+    expect(thumbnailOf(postMessage(layout, { picture: false }))).toBeUndefined();
+    const last = postMessage(layout, { controls: false });
+    expect(buttonLabels(last)).toEqual([]);
+    expect(textDisplays(last)).toEqual(['### Title', '**Coming (0)**', '**Current gym**']);
+    expect(thumbnailOf(last)).toBe('https://x.test/boss.png');
+    expect(buttonLabels(postMessage(layout, { move: false }))).toEqual(['Join', 'Here']);
+  });
+
+  it('puts the line of a copy first, in the first text: no component more than the post', () => {
+    const copy = postMessage(layout, { lead: 'A raid: <#1>' });
+    expect(textDisplays(copy)[0]).toBe('A raid: <#1>\n### Title');
+    expect(componentCount(copy)).toBe(componentCount(postMessage(layout)));
+    expect(thumbnailOf(copy)).toBe('https://x.test/boss.png');
+  });
+
+  it('never leaves a thin line first, last or twice', () => {
+    const copy = postMessage(layout, { lead: 'A raid: <#1>', controls: false });
+    const inner = v2(copy).components[0];
+    const types =
+      inner?.type === ComponentType.Container ? inner.components.map((part) => part.type) : [];
+    expect(types.at(-1)).not.toBe(ComponentType.Separator);
+    const lonely = postMessage({
+      accent: 1,
+      blocks: [
+        { type: 'separator' },
+        { type: 'text', content: 'a' },
+        { type: 'separator' },
+        { type: 'separator' },
+        { type: 'text', content: 'b' },
+        { type: 'separator' },
+      ],
+    });
+    const parts = v2(lonely).components[0];
+    expect(
+      parts?.type === ComponentType.Container ? parts.components.map((part) => part.type) : [],
+    ).toEqual([ComponentType.TextDisplay, ComponentType.Separator, ComponentType.TextDisplay]);
+  });
+});
+
+describe('fitLists and fittedLayout', () => {
+  it('shortens the longest list first, one member at a time, never to nothing', () => {
+    const long = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc', 'dddddddddd'];
+    const short = ['e', 'f'];
+    const texts = fitLists([long, short], 30);
+    expect(texts).toEqual(['aaaaaaaaaa, …and 3 more', 'e, f']);
+    expect(fitLists([long, short], 0)).toEqual(['…and 4 more', '…and 2 more']);
+    expect(fitLists([long], 1_000)).toEqual([long.join(', ')]);
+  });
+
+  it('lays a post out once more with the lists cut down by as much as it is over', () => {
+    const names = Array.from({ length: 50 }, (_, i) => `Trainer ${String(i).padStart(2, '0')}`);
+    const build = ({ list }: Fit): PostLayout => ({
+      accent: 1,
+      blocks: [
+        { type: 'text', content: 'x'.repeat(100) },
+        { type: 'text', content: `**Coming**\n${list(names)}` },
+        { type: 'text', content: `**Here**\n${list(names.slice(0, 5))}` },
+      ],
+    });
+    expect(layoutTextLength(fittedLayout(build))).toBeLessThan(TEXT_BUDGET - LEAD_ROOM);
+    const fitted = fittedLayout(build, 400);
+    expect(layoutTextLength(fitted)).toBeLessThanOrEqual(400);
+    const texts = fitted.blocks.map((block) => (block.type === 'text' ? block.content : ''));
+    expect(texts[1]).toMatch(/…and \d+ more$/);
+    expect(texts[2]).toBe(`**Here**\n${names.slice(0, 5).join(', ')}`);
+  });
+});
+
+describe('fittedLayout: the last resort', () => {
+  it('cuts the longest of the other texts when the lists alone cannot make room', () => {
+    const notes = '*'.repeat(1500);
+    const build = ({ list, part }: Fit): PostLayout => ({
+      accent: 1,
+      blocks: [
+        { type: 'text', content: `### ${part((room) => cutText(notes, room))}` },
+        { type: 'text', content: `**Group A: ${part((room) => cutText('b'.repeat(900), room))}**` },
+        { type: 'text', content: `**Coming**\n${list(['Ann', 'Bea'])}` },
+      ],
+    });
+    const fitted = fittedLayout(build, 1000);
+    expect(layoutTextLength(fitted)).toBeLessThanOrEqual(1000);
+    const [title, group, coming] = fitted.blocks.map((block) =>
+      block.type === 'text' ? block.content : '',
+    );
+    // The longest gave way first, down to the next longest, then both together.
+    expect(title?.length).toBeLessThan(notes.length);
+    expect(title).toMatch(/…$/);
+    expect(group).toMatch(/…\*\*$/);
+    // The lists are as short as they get first.
+    expect(coming).toBe('**Coming**\n…and 2 more');
+  });
+
+  it('cuts a text at a whole character, never after a lone backslash, and marks the cut', () => {
+    expect(cutText('abcdef', 10)).toBe('abcdef');
+    expect(cutText('abcdef', 4)).toBe('abc…');
+    expect(cutText('ab\\*cd', 4)).toBe('ab…');
+    expect(cutText('abc', 0)).toBe('…');
+    // An emoji at the cut goes whole or not at all: half of it is no character.
+    expect(cutText('ab😀cd', 4)).toBe('ab…');
+    expect(cutText('ab😀cd', 5)).toBe('ab😀…');
+  });
+});
+
+describe('trainerBlocks', () => {
+  const mixed = withAttendees(testRaid(), {
+    '300000000000000001': { name: 'Ann' },
+    '300000000000000002': { name: 'Bea' },
+    '300000000000000003': { name: 'Cid', team: 'mystic' },
+    '300000000000000004': { name: 'Dot', team: 'mystic', number: 2, status: PartyStatus.Present },
+    '300000000000000005': {
+      name: 'Eve',
+      team: 'valor',
+      remote: true,
+      status: PartyStatus.CompletePending,
+    },
+  });
+  const view = (raid = mixed) => ({
+    party: raid,
+    emoji: { shiny: '✨', remote: '📡', teams } satisfies PostEmoji,
+  });
+  const all: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
+  const contents = (blocks: PostBlock[]) =>
+    blocks.map((block) => (block.type === 'text' || block.type === 'section' ? block.content : ''));
+  const ALL = { complete: true, lobby: true };
+
+  it('gives one group a line per status with its head count and its button, also an empty one', () => {
+    const blocks = trainerBlocks(view(), ALL, all);
+    expect(contents(blocks)).toEqual([
+      '**Interested (1)**\n<@200000000000000001>',
+      '**Coming (3)**\nAnn, Bea, ❄️ Cid',
+      '**Present (3)**\n❄️ Dot +1, 🔥 Eve 📡',
+      '**Complete (0)**',
+    ]);
+    const labels = blocks.map((block) =>
+      block.type === 'section' && block.accessory !== 'picture'
+        ? block.accessory.button
+        : undefined,
+    );
+    expect(labels.map((button) => (button && 'label' in button ? button.label : ''))).toEqual([
+      'Interested',
+      'Join',
+      'Here',
+      'Done',
+    ]);
+    expect(contents(trainerBlocks(view(), { complete: false, lobby: false }, all))).toHaveLength(3);
+  });
+
+  it('names the one group above the statuses when it has a label or a meeting time', () => {
+    const labelled = {
+      ...mixed,
+      groups: [{ id: 'A' as const, label: 'park *side*', startTime: 1_800_000_000_000 }],
+    };
+    expect(contents(trainerBlocks(view(labelled), ALL, all))[0]).toBe(
+      '**Group A: park \\*side\\*** · meeting at <t:1800000000:t>',
+    );
+  });
+
+  it('gives several groups a block each with Join, and then who completed the raid', () => {
+    const grouped = withAttendees(
+      { ...mixed, groups: [{ id: 'A' as const }, { id: 'B' as const, label: 'late' }] },
+      {
+        '300000000000000002': { name: 'Bea', group: 'B' },
+        '300000000000000004': {
+          name: 'Dot',
+          team: 'mystic',
+          number: 2,
+          status: PartyStatus.Complete,
+        },
+      },
+    );
+    const blocks = trainerBlocks(view(grouped), ALL, all);
+    expect(contents(blocks)).toEqual([
+      '**Group A** · 4 trainers\nInterested (1): <@200000000000000001>\nComing (2): Ann, ❄️ Cid\nPresent (1): 🔥 Eve 📡',
+      '**Group B: late** · 1 trainer\nComing (1): Bea',
+      '**Complete (2)**\n❄️ Dot +1',
+    ]);
+    const second = blocks[1];
+    expect(
+      second?.type === 'section' && second.accessory !== 'picture'
+        ? second.accessory.button
+        : undefined,
+    ).toMatchObject({ label: 'Join B', custom_id: `party:${mixed.id}:group:B` });
+  });
+
+  it('tells a group bigger than a lobby to split up, where asked', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
+    const crowded = withAttendees(testRaid(), crowd);
+    expect(contents(trainerBlocks(view(crowded), ALL, all))[0]).toBe(
+      'More than 20 trainers: a lobby holds 20, so split up.',
+    );
+  });
+});
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index d702d9c4fa463e4ef6c20a02c8f37dc2ec1094c8..869684df98874f873e93fc5e1168632d4c4d728b 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -1,5 +1,11 @@
-import type { APIEmbed, APIEmbedField } from 'discord.js';
-import type { ClassicMessage } from '../discord/party-gateway.js';
+import {
+  ComponentType,
+  type APIButtonComponent,
+  type APIComponentInContainer,
+  type APIEmbed,
+  type APIEmbedField,
+} from 'discord.js';
+import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
 import {
   headCount,
   membersWhere,
@@ -9,7 +15,9 @@ import {
   type Team,
 } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
+import { joinGroupButton, statusButton, type ShownStatus } from './party-controls.js';
 import { count, LIMITS, memberName, plain, timestamp, truncate } from './text.js';
+import { actionRow, container, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
 export const FORUM_TAGS = [
@@ -258,6 +266,404 @@ export function fitEmbed(title: string, description: string, fields: ShrinkableF
   }
 }
 
+/** Discord takes at most this many components in one message, every nested one counted. */
+export const MAX_COMPONENTS = 40;
+
+/**
+ * The characters the text of a post may take in all. Discord documents no total for the text
+ * displays of a message; 4,000 (what one text display holds) is assumed, and this is the one
+ * place to change it. The room of a copy's leading line (`LEAD_ROOM`) is kept free.
+ */
+export const TEXT_BUDGET = 4_000;
+
+/** What a copy of a post in another channel adds above it (`renderMirror`), at most. */
+export const LEAD_ROOM = 200;
+
+/**
+ * A button of a post. `moves` marks the one that moves a train ("Move train…"), which a copy for
+ * the members of another region leaves out.
+ */
+export interface PostButton {
+  button: APIButtonComponent;
+  moves?: true;
+}
+
+/**
+ * A part of a post, before it is made a message (`postMessage`): text, a thin line, a text with
+ * the post's picture or a button beside it, or rows of buttons.
+ */
+export type PostBlock =
+  | { type: 'text'; content: string }
+  | { type: 'separator' }
+  | { type: 'section'; content: string; accessory: 'picture' | PostButton }
+  | { type: 'controls'; rows: PostButton[][] };
+
+/** A post as its renderer lays it out: the colour of its edge, its picture and its parts. */
+export interface PostLayout {
+  accent: number;
+  /** The address of the picture beside its first lines (a boss, an egg). */
+  picture?: string;
+  blocks: PostBlock[];
+}
+
+/**
+ * How a post is made a message: with or without its picture (`picture: false`, for when
+ * Discord refuses it), with or without its controls (`controls: false`, the last showing of an
+ * ended party: a status keeps its line without its button, the rows go), without the button that
+ * moves a train (`move: false`, a copy for another region), and with a line at the top (`lead`,
+ * a copy in another channel: the first line of the post's first text, whose characters
+ * `LEAD_ROOM` keeps free).
+ */
+export interface PostVariant {
+  picture?: boolean;
+  controls?: boolean;
+  move?: boolean;
+  lead?: string;
+}
+
+/**
+ * The post as a components-v2 message: one container with the post's colour, the parts in their
+ * order. A text whose picture or button is left out is a text display by itself; a thin line is
+ * never first, last or doubled, whatever was left out around it.
+ */
+export function postMessage(layout: PostLayout, variant: PostVariant = {}): V2Message {
+  const shows = (control: PostButton): boolean =>
+    variant.controls !== false && !(control.moves && variant.move === false);
+  const parts: APIComponentInContainer[] = [];
+  // The line of a copy opens its first text: a text display of its own would be one component
+  // more than the post, which can have all that a message may.
+  let lead = variant.lead;
+  const withLead = (content: string): string => {
+    if (lead === undefined) return content;
+    const text = `${lead}\n${content}`;
+    lead = undefined;
+    return text;
+  };
+  for (const block of layout.blocks) {
+    switch (block.type) {
+      case 'text':
+        parts.push(textDisplay(withLead(block.content)));
+        break;
+      case 'separator':
+        parts.push(separator());
+        break;
+      case 'section': {
+        const { accessory } = block;
+        const beside =
+          accessory === 'picture'
+            ? variant.picture !== false && layout.picture !== undefined
+              ? thumbnail(layout.picture)
+              : undefined
+            : shows(accessory)
+              ? accessory.button
+              : undefined;
+        const content = withLead(block.content);
+        parts.push(beside ? section(content, beside) : textDisplay(content));
+        break;
+      }
+      case 'controls':
+        for (const row of block.rows) {
+          const buttons = row.filter(shows).map((control) => control.button);
+          if (buttons.length > 0) parts.push(actionRow(buttons));
+        }
+        break;
+    }
+  }
+  return { v2: true, components: [container(layout.accent, withoutStrayLines(parts))] };
+}
+
+function withoutStrayLines(parts: APIComponentInContainer[]): APIComponentInContainer[] {
+  const kept: APIComponentInContainer[] = [];
+  for (const part of parts) {
+    const line = part.type === ComponentType.Separator;
+    if (line && (kept.length === 0 || kept.at(-1)?.type === ComponentType.Separator)) continue;
+    kept.push(part);
+  }
+  while (kept.at(-1)?.type === ComponentType.Separator) kept.pop();
+  return kept;
+}
+
+/** The characters of a post's text: what Discord counts of its text displays. */
+export function layoutTextLength(layout: PostLayout): number {
+  let length = 0;
+  for (const block of layout.blocks) {
+    if (block.type === 'text' || block.type === 'section') length += block.content.length;
+  }
+  return length;
+}
+
+/** How a renderer is given each list of members it shows: the list as text. */
+export type ListText = (items: readonly string[]) => string;
+
+const LIST_SEPARATOR = ', ';
+
+function listText(items: readonly string[], shown: number): string {
+  const left = items.length - shown;
+  const kept = items.slice(0, shown);
+  if (left > 0) kept.push(`…and ${left} more`);
+  return kept.join(LIST_SEPARATOR);
+}
+
+/**
+ * The lists as texts of at most `room` characters together: while they are too long, the
+ * longest is shortened by one member from its end, and says how many it left out. A list is
+ * never emptied ("…and 12 more" is the shortest it gets), so when even that is too long the
+ * texts are as short as they can be.
+ */
+export function fitLists(lists: readonly (readonly string[])[], room: number): string[] {
+  const shown = lists.map((items) => items.length);
+  const texts = lists.map((items) => listText(items, items.length));
+  let total = texts.reduce((sum, text) => sum + text.length, 0);
+  while (total > room) {
+    let longest = -1;
+    for (let i = 0; i < lists.length; i++) {
+      if (
+        (shown[i] ?? 0) > 0 &&
+        (longest < 0 || (texts[i]?.length ?? 0) > (texts[longest]?.length ?? 0))
+      ) {
+        longest = i;
+      }
+    }
+    const items = lists[longest];
+    if (items === undefined) break;
+    const before = texts[longest]?.length ?? 0;
+    shown[longest] = (shown[longest] ?? 1) - 1;
+    const text = listText(items, shown[longest] ?? 0);
+    texts[longest] = text;
+    total += text.length - before;
+  }
+  return texts;
+}
+
+/**
+ * How a renderer gives the texts that may be shortened when its post is too long: each list of
+ * members (`list`, cut down together with the others), and as a last resort other texts that can
+ * be long (`part`: a gym's notice, a group's label, a route; `make(room)` is that text in at most
+ * `room` characters, or as short as it gets, and `make(Infinity)` the text as it is).
+ */
+export interface Fit {
+  list: ListText;
+  part: (make: (room: number) => string) => string;
+}
+
+/**
+ * A text in at most `room` characters: cut at the end, which `…` marks, never after a lone
+ * backslash (it would escape the mark, or what follows the text), never inside a character of
+ * two code units (an emoji: half of it is no character). At least the mark.
+ */
+export function cutText(text: string, room: number): string {
+  if (text.length <= room) return text;
+  const kept = text.slice(0, Math.max(0, room - 1)).replace(/[\uD800-\uDBFF]$/, '');
+  return `${kept.replace(/\\+$/, '')}…`;
+}
+
+/**
+ * A layout whose text keeps within `budget`: `build` lays the post out with its lists of members
+ * and other texts as `fit` gives them, all of every one first; when that is too long, once more
+ * with the lists cut down together (`fitLists`) by as much as the text is over; and when even
+ * that is too long, the longest of the other texts are cut (each down to the next longest, then
+ * together) until it fits. `build` must be pure and ask for the same lists and texts in the same
+ * order each time.
+ */
+export function fittedLayout(
+  build: (fit: Fit) => PostLayout,
+  budget: number = TEXT_BUDGET - LEAD_ROOM,
+): PostLayout {
+  const lists: (readonly string[])[] = [];
+  const parts: ((room: number) => string)[] = [];
+  const whole = build({
+    list: (items) => {
+      lists.push(items);
+      return items.join(LIST_SEPARATOR);
+    },
+    part: (make) => {
+      parts.push(make);
+      return make(Infinity);
+    },
+  });
+  let over = layoutTextLength(whole) - budget;
+  if (over <= 0) return whole;
+  const listed = lists.reduce((sum, items) => sum + items.join(LIST_SEPARATOR).length, 0);
+  const texts = fitLists(lists, listed - over);
+  const rooms = parts.map(() => Infinity);
+  const laid = (): PostLayout => {
+    let nextList = 0;
+    let nextPart = 0;
+    return build({
+      list: () => texts[nextList++] ?? '',
+      part: (make) => make(rooms[nextPart++] ?? Infinity),
+    });
+  };
+  const cutLists = laid();
+  over = layoutTextLength(cutLists) - budget;
+  if (over <= 0) return cutLists;
+  const lengths = parts.map((make) => make(Infinity).length);
+  const exhausted = new Set<number>();
+  while (over > 0) {
+    let longest = -1;
+    let second = 0;
+    for (let i = 0; i < lengths.length; i++) {
+      if (exhausted.has(i)) continue;
+      const length = lengths[i] ?? 0;
+      if (longest < 0 || length > (lengths[longest] ?? 0)) {
+        if (longest >= 0) second = Math.max(second, lengths[longest] ?? 0);
+        longest = i;
+      } else {
+        second = Math.max(second, length);
+      }
+    }
+    const make = parts[longest];
+    const length = lengths[longest];
+    if (make === undefined || length === undefined) break;
+    const room = Math.max(0, Math.min(length - 1, Math.max(second, length - over)));
+    const shorter = make(room).length;
+    if (shorter >= length) {
+      exhausted.add(longest);
+      continue;
+    }
+    over -= length - shorter;
+    lengths[longest] = shorter;
+    rooms[longest] = room;
+  }
+  return laid();
+}
+
+const STATUS_WORDS: Readonly<Record<ShownStatus, string>> = {
+  interested: 'Interested',
+  coming: 'Coming',
+  present: 'Present',
+  complete: 'Complete',
+};
+
+/** Under which status a post lists an attendee: one asked whether they completed is present. */
+function shownStatus(attendee: Attendee): ShownStatus | undefined {
+  switch (attendee.status) {
+    case PartyStatus.Interested:
+      return 'interested';
+    case PartyStatus.Coming:
+      return 'coming';
+    case PartyStatus.Present:
+    case PartyStatus.CompletePending:
+      return 'present';
+    case PartyStatus.Complete:
+      return 'complete';
+    default:
+      return undefined;
+  }
+}
+
+/** The members of a status, of one group or of all, as texts in shown order, and their heads. */
+function statusMembers(
+  view: TrainersView,
+  status: ShownStatus,
+  groupId?: string,
+): { heads: number; items: string[] } {
+  const { party, emoji } = view;
+  const ids = inShownOrder(
+    party,
+    membersWhere(
+      party,
+      (attendee) =>
+        shownStatus(attendee) === status && (groupId === undefined || attendee.group === groupId),
+    ),
+  );
+  const heads = ids.reduce((sum, id) => sum + (party.attendees[id]?.number ?? 1), 0);
+  return { heads, items: attendeeTexts(party, ids, emoji) };
+}
+
+export interface TrainerOptions {
+  /** Whether the party is completed (a raid): the status Complete, with Done. */
+  complete: boolean;
+  /** Tell a group that is bigger than a lobby to split up (a raid, a train). */
+  lobby: boolean;
+}
+
+/**
+ * `Group B: park side`, the label as the member wrote it, made plain; a label is one of the texts
+ * a post too long for its text cuts (`Fit.part`).
+ */
+function groupName(group: PartyGroup, fit: Fit): string {
+  const { label } = group;
+  return `Group ${group.id}${label ? `: ${fit.part((room) => cutText(plain(label), room))}` : ''}`;
+}
+
+function lobbyNote(view: TrainersView, group: PartyGroup, options: TrainerOptions): string[] {
+  return options.lobby && headCount(view.party, group.id) > LOBBY_SIZE
+    ? [`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`]
+    : [];
+}
+
+/**
+ * Who comes, as the post lists them. A party with one group has a line per status, its head
+ * count in the heading and its members under it, with the status's button beside it (an empty
+ * status too: its button needs a place), and above them the group's label and meeting time when
+ * it has them. A party with several groups has a block per group (its name, trainers, meeting
+ * time, and a line per status that has members) with "Join A" beside it, and then, for a raid,
+ * who completed it. Members are listed by `attendeeTexts`; every list and label is asked of
+ * `fit`.
+ */
+export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit: Fit): PostBlock[] {
+  const { list } = fit;
+  const { party } = view;
+  const statuses: ShownStatus[] = ['interested', 'coming', 'present'];
+  const [only] = party.groups;
+  if (only && party.groups.length === 1) {
+    const blocks: PostBlock[] = [];
+    const heading = [
+      ...(only.label || only.startTime !== undefined
+        ? [
+            [
+              `**${groupName(only, fit)}**`,
+              ...(only.startTime === undefined ? [] : [`meeting at ${timestamp(only.startTime)}`]),
+            ].join(' · '),
+          ]
+        : []),
+      ...lobbyNote(view, only, options),
+    ];
+    if (heading.length > 0) blocks.push({ type: 'text', content: heading.join('\n') });
+    for (const status of options.complete ? [...statuses, 'complete' as const] : statuses) {
+      const { heads, items } = statusMembers(view, status);
+      blocks.push({
+        type: 'section',
+        content:
+          `**${STATUS_WORDS[status]} (${heads})**` + (items.length > 0 ? `\n${list(items)}` : ''),
+        accessory: statusButton(party, status),
+      });
+    }
+    return blocks;
+  }
+  const blocks: PostBlock[] = party.groups.map((group) => {
+    const lines = statuses.flatMap((status) => {
+      const { heads, items } = statusMembers(view, status, group.id);
+      return items.length > 0 ? [`${STATUS_WORDS[status]} (${heads}): ${list(items)}`] : [];
+    });
+    const heading = [
+      `**${groupName(group, fit)}**`,
+      count(headCount(party, group.id), 'trainer'),
+      ...(group.startTime === undefined ? [] : [`meeting at ${timestamp(group.startTime)}`]),
+    ].join(' · ');
+    return {
+      type: 'section',
+      content: [
+        heading,
+        ...lobbyNote(view, group, options),
+        ...(lines.length > 0 ? lines : ['Nobody yet']),
+      ].join('\n'),
+      accessory: joinGroupButton(party, group),
+    };
+  });
+  if (options.complete) {
+    const { heads, items } = statusMembers(view, 'complete');
+    if (items.length > 0) {
+      blocks.push({
+        type: 'text',
+        content: `**${STATUS_WORDS.complete} (${heads})**\n${list(items)}`,
+      });
+    }
+  }
+  return blocks;
+}
+
 /** How many trainers are expected in all, for lists of parties. */
 export function trainerCount(party: Party): string {
   return count(headCount(party), 'trainer');
diff --git a/src/render/v2.ts b/src/render/v2.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9d1c3e85379b4493be7719829c22469b4f531992
--- /dev/null
+++ b/src/render/v2.ts
@@ -0,0 +1,50 @@
+import {
+  ComponentType,
+  SeparatorSpacingSize,
+  type APIActionRowComponent,
+  type APIButtonComponent,
+  type APIComponentInContainer,
+  type APIContainerComponent,
+  type APISectionAccessoryComponent,
+  type APISectionComponent,
+  type APISeparatorComponent,
+  type APITextDisplayComponent,
+  type APIThumbnailComponent,
+} from 'discord.js';
+
+/** The components of a components-v2 message, as plain API objects (as embeds were). */
+
+export function textDisplay(content: string): APITextDisplayComponent {
+  return { type: ComponentType.TextDisplay, content };
+}
+
+/** A thin line with a little room around it. */
+export function separator(): APISeparatorComponent {
+  return { type: ComponentType.Separator, divider: true, spacing: SeparatorSpacingSize.Small };
+}
+
+/** One text with a button or a picture beside it. */
+export function section(
+  content: string,
+  accessory: APISectionAccessoryComponent,
+): APISectionComponent {
+  return { type: ComponentType.Section, components: [textDisplay(content)], accessory };
+}
+
+export function thumbnail(url: string): APIThumbnailComponent {
+  return { type: ComponentType.Thumbnail, media: { url } };
+}
+
+export function actionRow(
+  buttons: APIButtonComponent[],
+): APIActionRowComponent<APIButtonComponent> {
+  return { type: ComponentType.ActionRow, components: buttons };
+}
+
+/** The box a post is drawn in, with the colour of its edge. */
+export function container(
+  accent: number,
+  components: APIComponentInContainer[],
+): APIContainerComponent {
+  return { type: ComponentType.Container, accent_color: accent, components };
+}
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index 3d7a63194aea6505c3638f4f14a353ef8bab50c8..c79d84de295bc48bef33202d2773cd3a2913efe7 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -8,6 +8,7 @@ import {
   createGroup,
   finishParty,
   joinGroup,
+  joinInto,
   labelGroup,
   leaveParty,
   noteMember,
@@ -229,6 +230,15 @@ export class AttendanceService {
     );
   }
 
+  /** "Join A" of a post with several groups (`joinInto`): coming in that group. */
+  joinInto(partyId: string, member: Member, group: GroupId): Promise<AttendanceOutcome> {
+    return this.apply(partyId, member, (party) =>
+      isDone(party, member.id)
+        ? refused('already-done')
+        : joinInto(party, member.id, group, this.limits()),
+    );
+  }
+
   /**
    * Opens the next group and moves the member into it. The attendees who have not completed the
    * raid are told in the post; those who allow it are pinged.
````


### Task 4: Posts of raids, meetups and trains as components-v2 messages

Prototype commit: `e5bc244dcd5814f6b1382dc2dd47be1564e8b88f`

Every party's post is now one container of a components-v2 message, as
in the samples Matt approved: the title (a raid's gym as a link to its
place; "Raid Train: …", "Meetup: …") with the raid and its times and
the boss's or egg's picture beside them; the boss (Weaknesses, Catch
CP, Moveset, with the game's icons where the emoji exist); Location
Information; who comes, each status with its button (several groups:
a block each with "Join A"); the bottom rows with their emoji (Leave,
−1, +1, Remote, Map, Set time, Screenshot feedback); "Reported by" /
"Created by" in small print. A train shows where it is and goes next
beside "Move train…" and its route in small print. Raids are called as
the legacy bot called them ("Level 5 raid", "Shadow Level 3 raid") and
the statuses Interested, Coming, Present, Complete. The text keeps
within the assumed 4,000 characters (lists of members cut together);
the worst cases of each kind keep within 40 components.

RenderedPost has the layout, the message made of it and the card: the
embed a direct message still shows (party-card.ts holds the embed
fields moved from party-post.ts). The services no longer reach into
the message: the picture retry, the last showing without controls and
the copies in other channels (with their leading line, a train's
without "Move train…") are forms of the layout (postMessage,
renderMirror). partyControls and invitationControls are gone. Tests
read posts through test/support/messages.ts instead of embeds[0].

**Files:**

```
 src/commands/admin/save-party.test.ts       |   3 +-
 src/commands/meetups/info.ts                |   9 +-
 src/commands/meetups/meetup.test.ts         |   3 +-
 src/commands/meetups/name-info.test.ts      |  16 +-
 src/commands/parties/delete.test.ts         |  16 +-
 src/commands/parties/in-meetup.test.ts      |  13 +-
 src/commands/parties/in-train.test.ts       |  55 ++--
 src/commands/raids/change.test.ts           |   8 +-
 src/commands/raids/raid-screenshot.test.ts  |  37 +--
 src/commands/trains/move.test.ts            |   9 +-
 src/commands/trains/route.test.ts           |   7 +-
 src/commands/trains/train.test.ts           |  21 +-
 src/components/party.train-copy.test.ts     |   9 +-
 src/render/meetup-post.test.ts              | 242 ++++++++-------
 src/render/meetup-post.ts                   | 104 +++++--
 src/render/mirrors.region.test.ts           |  72 ++---
 src/render/mirrors.test.ts                  |  36 ++-
 src/render/mirrors.ts                       |  35 ++-
 src/render/party-card.ts                    | 135 +++++++++
 src/render/party-controls.test.ts           | 107 +++----
 src/render/party-controls.ts                |  96 +-----
 src/render/party-post.ts                    | 150 ++--------
 src/render/raid-post.test.ts                | 781 ++++++++++++++++++++++++++----------------------
 src/render/raid-post.ts                     | 323 +++++++++++++++-----
 src/render/train-post.test.ts               | 366 +++++++++++++++--------
 src/render/train-post.ts                    | 195 +++++++++---
 src/services/notify-service.test.ts         |  11 +-
 src/services/party-mirrors.region.test.ts   |  42 ++-
 src/services/party-mirrors.test.ts          |  59 ++--
 src/services/party-mirrors.ts               |  62 ++--
 src/services/party-scheduler.meetup.test.ts |  49 +--
 src/services/party-scheduler.test.ts        |   3 +-
 src/services/party-service.end.test.ts      |   9 +-
 src/services/party-service.meetup.test.ts   |  51 ++--
 src/services/party-service.relocate.test.ts |  24 +-
 src/services/party-service.test.ts          |  43 +--
 src/services/party-service.train.test.ts    |  38 ++-
 src/services/party-service.ts               |  53 ++--
 src/services/timed-party-service.test.ts    |   9 +-
 src/services/train-service.test.ts          |  15 +-
 test/support/messages.ts                    |  19 ++
 test/support/post-limits.ts                 |  34 +++
 42 files changed, 1980 insertions(+), 1389 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/admin/save-party.test.ts src/commands/meetups/meetup.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/delete.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/raids/change.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/trains/move.test.ts src/commands/trains/route.test.ts src/commands/trains/train.test.ts src/components/party.train-copy.test.ts src/render/meetup-post.test.ts src/render/mirrors.region.test.ts src/render/mirrors.test.ts src/render/party-controls.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/notify-service.test.ts src/services/party-mirrors.region.test.ts src/services/party-mirrors.test.ts src/services/party-scheduler.meetup.test.ts src/services/party-scheduler.test.ts src/services/party-service.end.test.ts src/services/party-service.meetup.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts src/services/timed-party-service.test.ts src/services/train-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff e5bc244dcd5814f6b1382dc2dd47be1564e8b88f -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Posts of raids, meetups and trains as components-v2 messages`, the body above and the trailer, staging exactly
  `src/commands/admin/save-party.test.ts src/commands/meetups/info.ts src/commands/meetups/meetup.test.ts src/commands/meetups/name-info.test.ts src/commands/parties/delete.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/raids/change.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/trains/move.test.ts src/commands/trains/route.test.ts src/commands/trains/train.test.ts src/components/party.train-copy.test.ts src/render/meetup-post.test.ts src/render/meetup-post.ts src/render/mirrors.region.test.ts src/render/mirrors.test.ts src/render/mirrors.ts src/render/party-card.ts src/render/party-controls.test.ts src/render/party-controls.ts src/render/party-post.ts src/render/raid-post.test.ts src/render/raid-post.ts src/render/train-post.test.ts src/render/train-post.ts src/services/notify-service.test.ts src/services/party-mirrors.region.test.ts src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-scheduler.meetup.test.ts src/services/party-scheduler.test.ts src/services/party-service.end.test.ts src/services/party-service.meetup.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts src/services/party-service.ts src/services/timed-party-service.test.ts src/services/train-service.test.ts test/support/messages.ts test/support/post-limits.ts`.

````diff
diff --git a/src/commands/admin/save-party.test.ts b/src/commands/admin/save-party.test.ts
index 97ba839547d58d4c9f09fad1d9601b43b3ce1b2e..30a9cd0424c10e1a11dacbba7610afe8c398ecc2 100644
--- a/src/commands/admin/save-party.test.ts
+++ b/src/commands/admin/save-party.test.ts
@@ -7,6 +7,7 @@ import { reportedRaid } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { admin } from './index.js';
+import { textOf } from '../../../test/support/messages.js';
 
 const END = at('2026-10-13T14:30');
 
@@ -57,7 +58,7 @@ describe('/admin save-party', () => {
     expect(made.current().saved).toBe(true);
     // The post itself says so, also once the line has scrolled away.
     await made.service.flush();
-    expect(made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
       'Kept open by a moderator: this post is not archived by itself.',
     );
     expect(made.said()).toEqual([
diff --git a/src/commands/meetups/info.ts b/src/commands/meetups/info.ts
index 9fda945156b3b3b916bb286b59a6697dcedd912f..15381b20887c5f4156f6cb2f7c1b3d0b72495f5e 100644
--- a/src/commands/meetups/info.ts
+++ b/src/commands/meetups/info.ts
@@ -65,8 +65,9 @@ export function refusedWithText(refusal: string, text: string): string {
 }
 
 /**
- * `/info` (spec 4.2): what the post of a meetup says about it, under "Information". It opens a
- * form with the text as it is; anybody in the post may change it, and the post says who did.
+ * `/info` (spec 4.2): what the post of a meetup says about it, under "Meeting Information". It
+ * opens a form with the text as it is; anybody in the post may change it, and the post says who
+ * did.
  * Of two members who have the form open at once the later one wins, with the text they started
  * from: nothing tells them that it changed meanwhile.
  */
@@ -79,7 +80,7 @@ export const info: SimpleCommand = {
     details:
       'Use it in the post of the meetup. A form opens with the text as it is now: where to ' +
       'meet, what to bring, how long it goes. What you send is shown in the post under ' +
-      '"Information"; sent back empty, it removes the text. The post says who changed it.',
+      '"Meeting Information"; sent back empty, it removes the text. The post says who changed it.',
     examples: ['/info'],
   },
   guards: [requireMeetup],
@@ -154,7 +155,7 @@ async function submitted(
       ? 'Nothing changed: that is what the post says already.'
       : cleared
         ? 'The post of this meetup has no information any more.'
-        : 'The post of this meetup shows what you wrote, under "Information".',
+        : 'The post of this meetup shows what you wrote, under "Meeting Information".',
     flags: MessageFlags.Ephemeral,
   });
 }
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index 6e92dfc60da49fe18ae3f26493c2540a8d38e9d8..cc956739a68ef6ebbcfd26b8746d3df6039e00b6 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -21,6 +21,7 @@ import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { commands } from '../index.js';
 import { FROM_A_REGION, meetup, MEETUP_THROTTLE } from './meetup.js';
+import { textDisplays } from '../../../test/support/messages.js';
 
 const RAID_POST = '300000000000000055';
 
@@ -167,7 +168,7 @@ describe('/meetup', () => {
     expect(party?.anonymous).toBe(false);
     expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
-    expect(post?.message.embeds?.[0]?.description?.split('\n')[2]).toBe(`Created by Alice.`);
+    expect(textDisplays(post?.message).at(-1)).toBe(`-# Created by **Alice** (<@${ALICE}>)`);
   });
 
   it('lets a member make two in a quarter of an hour, as the legacy bot did', async () => {
diff --git a/src/commands/meetups/name-info.test.ts b/src/commands/meetups/name-info.test.ts
index 016d96784c0c2a5568139b27a6337b95907aba60..a465a5297989ac434f8549acd4da6cddc35f301e 100644
--- a/src/commands/meetups/name-info.test.ts
+++ b/src/commands/meetups/name-info.test.ts
@@ -17,6 +17,7 @@ import { attendeeOf } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import { name } from '../parties/name.js';
 import { info, INFO_INPUT, INFO_KIND, infoControls, infoForm, refusedWithText } from './info.js';
+import { header, textDisplays, textOf } from '../../../test/support/messages.js';
 
 const RAID_POST = '300000000000000055';
 const NOT_A_MEETUP = 'This is the post of a raid: that only works in the post of a meetup.';
@@ -100,7 +101,7 @@ describe('/name', () => {
       `**Alice** (<@${ALICE}>) renamed this meetup: **Raid hour meet**.`,
     ]);
     expect(made.post()).toMatchObject({ title: 'Meetup · Raid hour meet', renames: 1 });
-    expect(made.post()?.message.embeds?.[0]?.title).toBe('Raid hour meet');
+    expect(header(made.post()?.message)[0]).toBe('### Meetup: Raid hour meet');
     // Anybody in the post may: Alice is not signed up, and is not signed up by it.
     expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
   });
@@ -144,7 +145,7 @@ describe('/name', () => {
     }
     expect(made.current().timed.name).toBe('Three');
     expect(made.post()).toMatchObject({ title: 'Meetup · Two', renames: 2 });
-    expect(made.post()?.message.embeds?.[0]?.title).toBe('Three');
+    expect(header(made.post()?.message)[0]).toBe('### Meetup: Three');
     // Ten minutes on, the title catches up.
     made.clock.now += 10 * 60_000 + 1;
     made.service.changed(made.party.id);
@@ -194,14 +195,13 @@ describe('/info', () => {
     const made = await setup();
     const sentForm = await made.submit('  Bring snacks.\n\nWe meet at the **fountain**. ');
     expect(sentForm.reply).toHaveBeenCalledWith({
-      content: 'The post of this meetup shows what you wrote, under "Information".',
+      content: 'The post of this meetup shows what you wrote, under "Meeting Information".',
       flags: MessageFlags.Ephemeral,
     });
     expect(made.current().meetup.description).toBe('Bring snacks.\n\nWe meet at the **fountain**.');
     expect(await made.lines()).toEqual([`**Alice** (<@${ALICE}>) changed the information.`]);
-    expect(made.post()?.message.embeds?.[0]?.description?.split('\n').slice(3)).toEqual([
-      '',
-      '**Information**',
+    expect(textDisplays(made.post()?.message)[1]?.split('\n')).toEqual([
+      '**Meeting Information**',
       'Bring snacks.',
       '',
       'We meet at the \\*\\*fountain\\*\\*.',
@@ -233,7 +233,7 @@ describe('/info', () => {
       `**Alice** (<@${ALICE}>) changed the information.`,
       `**Alice** (<@${ALICE}>) removed the information.`,
     ]);
-    expect(made.post()?.message.embeds?.[0]?.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
+    expect(textOf(made.post()?.message)).not.toContain('Information');
   });
 
   it('is for anybody in the post, and signs nobody up', async () => {
@@ -261,7 +261,7 @@ describe('/info', () => {
     for (let n = 1; n <= 12; n++) {
       const used = await made.submit(`Bring ${n} snacks.`);
       expect(sent(used.reply).content).toBe(
-        'The post of this meetup shows what you wrote, under "Information".',
+        'The post of this meetup shows what you wrote, under "Meeting Information".',
       );
     }
     expect(made.current().meetup.description).toBe('Bring 12 snacks.');
diff --git a/src/commands/parties/delete.test.ts b/src/commands/parties/delete.test.ts
index 9a84c713e7ae909254aa2a54253941f74fe61497..c5417c332a49bf536667d13ee059659d2e8fb91c 100644
--- a/src/commands/parties/delete.test.ts
+++ b/src/commands/parties/delete.test.ts
@@ -22,6 +22,7 @@ import {
   MAX_DELETE_REASON,
 } from '../../render/party-controls.js';
 import { deleteParty } from './delete.js';
+import { accentOf, buttonsOf, header, textOf } from '../../../test/support/messages.js';
 
 const yveltal = { boss: { key: 'yveltal' } } as const;
 const ADMIN_ROLE = '800000000000000001';
@@ -92,7 +93,7 @@ describe('/delete from staff', () => {
     expect(made.said().at(-1)).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
-    expect(post?.message.components).toEqual([]);
+    expect(buttonsOf(post?.message)).toEqual([]);
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
     expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
     expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
@@ -102,10 +103,10 @@ describe('/delete from staff', () => {
     const made = await setup();
     await made.service.keep(made.party.id, true, { id: ALICE });
     await made.service.flush();
-    const kept = made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description;
+    const kept = textOf(made.gateway.posts.get(made.postId)?.message);
     expect(kept).toContain('Kept open by a moderator');
     await made.run(['Moderator']);
-    const closed = made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description;
+    const closed = textOf(made.gateway.posts.get(made.postId)?.message);
     expect(closed).toContain('This raid was closed by');
     expect(closed).not.toContain('Kept open');
   });
@@ -114,13 +115,10 @@ describe('/delete from staff', () => {
     const made = await setup();
     await made.run(['Moderator']);
     const post = made.gateway.posts.get(made.postId);
-    const embed = post?.message.embeds?.[0];
     // In the place of the times: a closed raid neither hatches nor ends "in 20 minutes".
-    expect(embed?.description?.split('\n')[1]).toBe(
-      `This raid was closed by **Member** (<@${ALICE}>).`,
-    );
-    expect(embed?.description).not.toContain('No time has been set');
-    expect(embed?.color).toBe(0xe74c3c);
+    expect(header(post?.message)[2]).toBe(`This raid was closed by **Member** (<@${ALICE}>).`);
+    expect(textOf(post?.message)).not.toContain('No time has been set');
+    expect(accentOf(post?.message)).toBe(0xe74c3c);
     const tags = made.tags[WEST_FORUM];
     expect([...(post?.tagIds ?? [])].sort()).toEqual([tags.Ended, tags.T5].sort());
   });
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index d4753eeb3ce64a79525a2c954ed474fec3a9dca5..1a7f8101e52875a288c4c88ba7fba444460638f0 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -36,6 +36,7 @@ import { cancelMeet, meet } from './meet.js';
 import { name } from './name.js';
 import { shout } from './shout.js';
 import { status, where } from './status.js';
+import { buttonsOf, header, textOf } from '../../../test/support/messages.js';
 
 const all: CommandModule[] = [
   join,
@@ -257,7 +258,7 @@ describe('/meet, /cancel-meet and /end in the post of a meetup', () => {
     expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
       users: [REPORTER],
     });
-    expect(made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
       `Starts ${stamp(START, 'R')}, at ${stamp(START)}.`,
     );
     expect(await made.answer('meet', { time: '16:00' })).toBe(
@@ -624,9 +625,9 @@ describe('the other commands in the post of a meetup', () => {
       'The meetup is at the bottom of the post again, with its buttons.',
     );
     const [copy] = made.gateway.messagesIn(made.postId);
-    expect(copy?.message.embeds?.[0]?.title).toBe('Community Day picnic');
-    expect(copy?.message.components).toEqual(
-      made.gateway.posts.get(made.postId)?.message.components,
+    expect(header(copy?.message)[0]).toBe('### Meetup: Community Day picnic');
+    expect(buttonsOf(copy?.message)).toEqual(
+      buttonsOf(made.gateway.posts.get(made.postId)?.message),
     );
   });
 
@@ -647,9 +648,7 @@ describe('the other commands in the post of a meetup', () => {
     expect(made.said().at(-1)).toBe(`This meetup was closed by **Alice** (<@${ALICE}>).`);
     const post = made.gateway.posts.get(made.postId);
     expect(post).toMatchObject({ archived: true, locked: true });
-    expect(post?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(
-      `This meetup was closed by **Alice** (<@${ALICE}>).`,
-    );
+    expect(header(post?.message)[1]).toBe(`This meetup was closed by **Alice** (<@${ALICE}>).`);
     expect(await made.answer('join')).toBe(
       'Use this in the post of a raid, train or meetup that is still active.',
     );
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 6d2bf41649e1c82b7caeac2be52e68a2dbc61fb9..f034547a854dd69fcc509bfeef4cea9e8538f35b 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -34,6 +34,13 @@ import { cancelMeet, meet } from './meet.js';
 import { name } from './name.js';
 import { shout } from './shout.js';
 import { status, where } from './status.js';
+import {
+  buttonLabels,
+  buttonsOf,
+  header,
+  textOf,
+  thumbnailOf,
+} from '../../../test/support/messages.js';
 
 const all: CommandModule[] = [
   join,
@@ -170,11 +177,12 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
     return made.said().join('\n').split('\n').filter(Boolean);
   };
   const alice = () => attendeeOf(made.current(), ALICE);
-  const embed = async () => {
+  /** The first message of the post, once every render is done. */
+  const shown = async () => {
     await made.service.flush();
-    return made.gateway.posts.get(made.postId)?.message.embeds?.[0];
+    return made.gateway.posts.get(made.postId)?.message;
   };
-  return { ...made, ctx, handle, run, answer, click, lines, alice, embed, inPost, told };
+  return { ...made, ctx, handle, run, answer, click, lines, alice, shown, inPost, told };
 }
 
 describe('the attendance commands in the post of a train', () => {
@@ -221,7 +229,7 @@ describe('the attendance commands in the post of a train', () => {
     expect((await made.lines()).at(-1)).toBe(
       `**Alice** (<@${ALICE}>) has left: this train has no conductor now.`,
     );
-    expect((await made.embed())?.description).not.toContain('Conductor');
+    expect(textOf(await made.shown())).not.toContain('Conductor');
   });
 
   it('/group opens, joins and labels groups as in a raid', async () => {
@@ -249,9 +257,12 @@ describe('the attendance commands in the post of a train', () => {
       { name: 'Group A (1)', value: 'A' },
       { name: 'Group B: by car (2)', value: 'B' },
     ]);
-    // The post has a row of group buttons now, above the button that moves the train.
-    await made.service.flush();
-    expect(made.gateway.posts.get(made.postId)?.message.components).toHaveLength(4);
+    // The post has a Join beside each group now.
+    expect(buttonLabels(await made.shown()).slice(0, 3)).toEqual([
+      'Move train…',
+      'Join A',
+      'Join B',
+    ]);
     for (let n = 0; n < 3; n++) await made.run('group', {}, { subcommand: 'new' });
     expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
       'A train cannot have more than five groups.',
@@ -323,7 +334,7 @@ describe('/meet, /cancel-meet, /end and /name in the post of a train', () => {
       `**Alice** (<@${ALICE}>) set the start of this train: ${stamp(START)} (${stamp(START, 'R')}).`,
       `<@${REPORTER}>`,
     ]);
-    expect((await made.embed())?.description).toContain(
+    expect(textOf(await made.shown())).toContain(
       `Starts ${stamp(START, 'R')}, at ${stamp(START)}.`,
     );
     expect(await made.answer('cancel-meet')).toBe(
@@ -396,10 +407,10 @@ describe('/boss in the post of a train', () => {
     expect(await made.lines()).toEqual([
       `**Alice** (<@${ALICE}>) set the boss this train is after: **Yveltal**.`,
     ]);
-    const embed = await made.embed();
-    expect(embed?.description).toMatch(/^\*\*Raid train\*\* after \*\*Yveltal\*\*/);
-    expect(embed?.fields?.[0]).toMatchObject({ name: 'Boss' });
-    expect(embed?.thumbnail?.url).toBeDefined();
+    const message = await made.shown();
+    expect(header(message)[1]).toMatch(/^\*\*After Yveltal\*\*/);
+    expect(textOf(message)).toContain('**Weaknesses**');
+    expect(thumbnailOf(message)).toBeDefined();
     // Neither the times nor the route of the train have anything to do with it.
     expect(made.current()).toMatchObject({ endTime: null, hatchTime: null, gymId: null });
   });
@@ -429,11 +440,11 @@ describe('/boss in the post of a train', () => {
     expect(await made.answer('boss', { pokemon: 't3 bulbasaur' })).toBe(
       'This train is after Bulbasaur already.',
     );
-    const embed = await made.embed();
-    expect(embed?.description).toMatch(/^\*\*Raid train\*\* after \*\*Bulbasaur\*\*/);
+    const message = await made.shown();
+    expect(header(message)[1]).toMatch(/^\*\*After Bulbasaur\*\*/);
     // What the game master says of it is shown, though no list has a picture of it.
-    expect(embed?.fields?.[0]).toMatchObject({ name: 'Boss' });
-    expect(embed?.thumbnail).toBeUndefined();
+    expect(textOf(message)).toContain('**Weaknesses**');
+    expect(thumbnailOf(message)).toBeUndefined();
   });
 
   it('asks which mega is meant, and takes the one that is named in full', async () => {
@@ -582,9 +593,9 @@ describe('the other commands in the post of a train', () => {
       'The train is at the bottom of the post again, with its buttons.',
     );
     const [copy] = made.gateway.messagesIn(made.postId);
-    expect(copy?.message.embeds?.[0]?.title).toBe('Saturday legendaries');
-    expect(copy?.message.components).toEqual(
-      made.gateway.posts.get(made.postId)?.message.components,
+    expect(header(copy?.message)[0]).toBe('### Raid Train: Saturday legendaries');
+    expect(buttonsOf(copy?.message)).toEqual(
+      buttonsOf(made.gateway.posts.get(made.postId)?.message),
     );
   });
 
@@ -605,10 +616,8 @@ describe('the other commands in the post of a train', () => {
     expect(made.said().at(-1)).toBe(`This train was closed by **Alice** (<@${ALICE}>).`);
     const post = made.gateway.posts.get(made.postId);
     expect(post).toMatchObject({ archived: true, locked: true });
-    expect(post?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(
-      `This train was closed by **Alice** (<@${ALICE}>).`,
-    );
-    expect(post?.message.components).toEqual([]);
+    expect(header(post?.message)[1]).toBe(`This train was closed by **Alice** (<@${ALICE}>).`);
+    expect(buttonsOf(post?.message)).toEqual([]);
   });
 
   it('/delete from anybody else asks why, and puts the request into the post as a train', async () => {
diff --git a/src/commands/raids/change.test.ts b/src/commands/raids/change.test.ts
index 3ad1b3fa3a1a873ae242a2047787567f4109ef00..6ceb0f8d5a019f04c0c6aafa6a92b6cb042069dd 100644
--- a/src/commands/raids/change.test.ts
+++ b/src/commands/raids/change.test.ts
@@ -15,7 +15,7 @@ import { partyButtons } from '../../components/party.js';
 import type { CommandModule } from '../../discord/command.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
 import { InteractionRouter } from '../../discord/router.js';
-import { partyControls, timeForm } from '../../render/party-controls.js';
+import { bottomControls, timeForm } from '../../render/party-controls.js';
 import type { RaidReport } from '../../services/party-service.js';
 import { cancelMeet, meet } from '../parties/meet.js';
 import { join } from '../parties/attendance.js';
@@ -276,9 +276,9 @@ describe('what the commands guard against', () => {
 
 describe('the "Set time" button and its form', () => {
   const actions = (made: Awaited<ReturnType<typeof setup>>) =>
-    partyControls(made.current()).flatMap((row) =>
-      row.components.map((c) => ('custom_id' in c ? decodeCustomId(c.custom_id)?.action : '')),
-    );
+    bottomControls(made.current(), { groups: false })
+      .flat()
+      .map(({ button }) => ('custom_id' in button ? decodeCustomId(button.custom_id)?.action : ''));
 
   it('is on a post without times, and gone once the raid has them', async () => {
     const made = await setup();
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index 53a6c9ef910cca463910bd72abbb1dc690b720e5..a2e363b6ab0a044b6a8a18ddb5db1e42654f91a1 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -21,9 +21,12 @@ import { isRaid } from '../../domain/party/party.js';
 import type { ScreenReading } from '../../ocr/screen-reader.js';
 import type { OcrOutcome } from '../../services/ocr-service.js';
 import { partyButtons } from '../../components/party.js';
-import { invitationControls, partyControls } from '../../render/party-controls.js';
+import { bottomControls } from '../../render/party-controls.js';
+import { renderMirror } from '../../render/mirrors.js';
+import { renderRaidPost } from '../../render/raid-post.js';
 import { screenshotControls } from '../screenshots/feedback.js';
 import { raid, raidControls } from './raid.js';
+import { buttonsOf, customIdsOf } from '../../../test/support/messages.js';
 
 /** PARTY_NOW is 14:00 in New York: the phone's clock a minute before. */
 const CLOCK = { hour: 13, minute: 59 };
@@ -118,14 +121,11 @@ describe('/raid with a screenshot', () => {
     const [party] = store.active();
     if (!party || !isRaid(party)) throw new Error('no raid');
     const id = party.raid.screenshot?.id ?? '';
-    const rows = gateway.posts.get(party.forumPostId ?? '')?.message.components ?? [];
-    const last = rows[rows.length - 1] as { components: { custom_id: string; label: string }[] };
-    expect(last.components).toEqual([
-      expect.objectContaining({
-        custom_id: `party:${party.id}:shot`,
-        label: 'Screenshot feedback',
-      }),
-    ]);
+    const buttons = buttonsOf(gateway.posts.get(party.forumPostId ?? '')?.message);
+    expect(buttons.at(-1)).toMatchObject({
+      customId: `party:${party.id}:shot`,
+      label: 'Screenshot feedback',
+    });
     const pressed = await handle(
       fakeButton({ customId: `party:${party.id}:shot`, userId: '700000000000000009' }),
     );
@@ -135,17 +135,18 @@ describe('/raid with a screenshot', () => {
   });
 
   it('keeps the button on the copies of the post, and answers it once the raid is over', async () => {
-    const { report, store, service, handle } = await setup();
+    const { report, store, service, handle, gateway } = await setup();
     const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
     await service.flush();
     const [party] = store.active();
     if (!party || !isRaid(party)) throw new Error('no raid');
     const button = `party:${party.id}:shot`;
-    // The copies elsewhere carry the post's own controls, this one included.
-    const ids = invitationControls(partyControls(party)).flatMap((row) =>
-      row.components.map((c) => ('custom_id' in c ? c.custom_id : '')),
-    );
-    expect(ids).toContain(button);
+    // The post has it, and so do its copies elsewhere: they carry the post's own controls.
+    const post = gateway.posts.get(party.forumPostId ?? '');
+    expect(customIdsOf(post?.message)).toContain(button);
+    const rendered = renderRaidPost(service.view(party));
+    const place = { postId: party.forumPostId ?? '', regionChannelId: undefined };
+    expect(customIdsOf(renderMirror('remote', rendered, place))).toContain(button);
     await service.end(party.id);
     const late = await handle(fakeButton({ customId: button }));
     expect(sent(late.reply).content).toBe('This raid is over.');
@@ -161,9 +162,9 @@ describe('/raid with a screenshot', () => {
       ...plain,
       raid: { ...plain.raid, screenshot: { id: null, timeUncertain: true } },
     };
-    const ids = partyControls(unkept).flatMap((row) =>
-      row.components.map((c) => ('custom_id' in c ? c.custom_id : '')),
-    );
+    const ids = bottomControls(unkept, { groups: false })
+      .flat()
+      .map(({ button }) => ('custom_id' in button ? button.custom_id : ''));
     expect(ids.some((id) => id.endsWith(':shot'))).toBe(false);
   });
 
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index dd690d90cf9288642b1522e3e9d7036d48f2ea51..d8d46a8f4a1f95df1616a47704522d7342475130 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -19,6 +19,7 @@ import { PartyStatus } from '../../domain/party/status.js';
 import { trainPanel } from '../../render/train-panel.js';
 import { conductor } from './conductor.js';
 import { finish, next, previous, skip } from './move.js';
+import { header, textOf } from '../../../test/support/messages.js';
 
 const all: CommandModule[] = [next, previous, skip, finish, conductor];
 
@@ -130,8 +131,8 @@ describe('/next, /previous, /skip and /finish', () => {
     expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
       users: [REPORTER, BOB],
     });
-    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
-    expect(embed?.description).toContain(`**Now at** [The Stacks](${maps(1)})`);
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(textOf(message)).toContain(`**Current gym** · [The Stacks](${maps(1)})`);
   });
 
   it('each says where the train is afterwards', async () => {
@@ -290,8 +291,8 @@ describe('/conductor', () => {
     expect(await made.lines()).toEqual([
       `**Alice** (<@${ALICE}>) is the conductor of this train now.`,
     ]);
-    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
-    expect(embed?.description).toContain(`Conductor: Alice.`);
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(header(message)).toContain('Conductor: Alice');
   });
 
   it('set takes over from another conductor, which the post says by name', async () => {
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index e1680e4e3a1588c538ecfaf358a43a68bfd32544..8641f171d0126acbbc689dec9d213409abd7145e 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -19,6 +19,7 @@ import type { PostGym } from '../../render/raid-post.js';
 import { LIMITS } from '../../render/text.js';
 import { TrainService } from '../../services/train-service.js';
 import { route } from './route.js';
+import { textOf } from '../../../test/support/messages.js';
 
 const maps = (id: number): string => {
   const gym = testGyms().find((found) => found.id === id);
@@ -197,10 +198,8 @@ describe('/route add', () => {
       `**Alice** (<@${ALICE}>) added stop 4 to the route: **Old Stone Fountain**.`,
       `**Alice** (<@${ALICE}>) added stop 5 to the route: **Riverside Park Gazebo**.`,
     ]);
-    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
-    expect(embed?.fields?.find((field) => /^Route/.test(field.name))?.name).toBe(
-      'Route: stop 1 of 5',
-    );
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(textOf(message)).toContain('-# Route, stop 1 of 5: ');
   });
 
   it('takes a gym of another region without asking, and the post stays where it is', async () => {
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index c36944ec847820b8588768e20400d84fafebb3ae..909e05880a51a48534dc26c8110090cd2b6c70ad 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -19,9 +19,9 @@ import { MemoryUsers } from '../../../test/support/users.js';
 import type { AppContext } from '../../app-context.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
-import { partyControls } from '../../render/party-controls.js';
 import { commands } from '../index.js';
 import { train, TRAIN_FROM_A_REGION, TRAIN_THROTTLE } from './train.js';
+import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
 
 const RAID_POST = '300000000000000055';
 
@@ -93,9 +93,9 @@ describe('/train', () => {
     const post = made.gateway.posts.get(postId);
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
     // The post has the button that opens the panel to move the train.
-    expect(post?.message.components).toEqual(party && partyControls(party));
-    expect(post?.message.components?.at(-1)).toMatchObject({
-      components: [{ label: 'Move train…', custom_id: `party:${party?.id ?? ''}:move` }],
+    expect(buttonsOf(post?.message)[0]).toMatchObject({
+      label: 'Move train…',
+      customId: `party:${party?.id ?? ''}:move`,
     });
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(sent(used.editReply).content).toBe(
@@ -157,7 +157,7 @@ describe('/train', () => {
     expect(party?.anonymous).toBe(false);
     expect(party?.attendees[ALICE]?.status).toBe(PartyStatus.Interested);
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
-    expect(post?.message.embeds?.[0]?.description?.split('\n')[2]).toBe('Created by Alice.');
+    expect(textDisplays(post?.message).at(-1)).toBe(`-# Created by **Alice** (<@${ALICE}>)`);
   });
 
   it('follows the privacy and the automatic status of who makes it, as a raid does', async () => {
@@ -174,10 +174,9 @@ describe('/train', () => {
     // Here on a train that is at no gym yet is Coming.
     expect(party?.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming, name: 'Alice' });
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
-    const lines = post?.message.embeds?.[0]?.description?.split('\n') ?? [];
-    expect(lines.some((line) => line.startsWith('Created by'))).toBe(false);
+    expect(textOf(post?.message)).not.toContain('Created by');
     // Signed up, so in the list of trainers like anybody: only "Created by" is left out.
-    expect(JSON.stringify(post?.message.embeds?.[0]?.fields)).toContain('Alice');
+    expect(textOf(post?.message)).toContain('**Coming (1)**\n❄️ Alice');
     expect(sent(used.editReply).content).toBe(
       `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
         'adds its stops, `/meet` sets when it starts, and `/conductor set` makes you its conductor.',
@@ -196,8 +195,8 @@ describe('/train', () => {
     // Kept for the sentences that name them, though the post does not.
     expect(party?.makerName).toBe('Alice');
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
-    expect(JSON.stringify(post?.message.embeds)).not.toContain('Alice');
-    expect(JSON.stringify(post?.message.embeds)).not.toContain(ALICE);
+    expect(textOf(post?.message)).not.toContain('Alice');
+    expect(textOf(post?.message)).not.toContain(ALICE);
     expect(sent(used.editReply).content).toBe(
       `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
         'adds its stops and `/meet` sets when it starts. You are not signed up for it, as ' +
@@ -231,7 +230,7 @@ describe('/train', () => {
     });
     await named.run('Round');
     const shown = named.gateway.posts.get(named.trains()[0]?.forumPostId ?? '');
-    expect(shown?.message.embeds?.[0]?.description).toContain('Created by Alice.');
+    expect(textOf(shown?.message)).toContain(`-# Created by **Alice** (<@${ALICE}>)`);
     expect(named.trains()[0]?.attendees).toEqual({});
   });
 
diff --git a/src/components/party.train-copy.test.ts b/src/components/party.train-copy.test.ts
index ddf4d4ce205bb5c10668b66670d0c35a73398b21..b8ccb688ddbccb75cf8cb908b1226541487ada02 100644
--- a/src/components/party.train-copy.test.ts
+++ b/src/components/party.train-copy.test.ts
@@ -37,9 +37,7 @@ async function setup() {
     regions: made.regions,
   });
   const router = new InteractionRouter(ctx, [], [partyButtons]);
-  const copy = made.gateway
-    .messagesIn(EAST_CHANNEL)
-    .find((sent) => sent.message.embeds !== undefined);
+  const copy = made.gateway.messagesIn(EAST_CHANNEL).find((sent) => sent.message.v2 === true);
   if (!copy) throw new Error('the train has no copy in the channel of East');
   const ids = customIdsOf(copy.message);
   /** A press on the last button of the copy that has this action, by Alice unless said otherwise. */
@@ -64,7 +62,8 @@ describe('the buttons of the copy of a train in another region', () => {
   it('sign a member up who cannot see the forum of the train, and let them into it', async () => {
     const made = await setup();
     made.gateway.shutOut(WEST_FORUM, ALICE);
-    const joined = await made.press('join');
+    // With several groups a member joins by a group's button: the last is B, where newcomers go.
+    const joined = await made.press('group');
     expect(joined.reply).toHaveBeenCalledWith(privately('You are coming, in group B.'));
     expect(attendeeOf(made.current(), ALICE)).toMatchObject({
       status: PartyStatus.Coming,
@@ -136,7 +135,7 @@ describe('the buttons of the copy of a train in another region', () => {
     await made.service.flush();
     // The copy is deleted with the train; a press that was on its way still arrives.
     expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
-    const late = await made.press('join');
+    const late = await made.press('group');
     expect(late.reply).toHaveBeenCalledWith(privately('This has ended.'));
   });
 });
diff --git a/src/render/meetup-post.test.ts b/src/render/meetup-post.test.ts
index ca9da3c21c5afece29d5bd2b98fc913fa93705a0..fdd2e38cb6b3ca377cfe29d1b306c9aa2c5bdc5c 100644
--- a/src/render/meetup-post.test.ts
+++ b/src/render/meetup-post.test.ts
@@ -1,7 +1,15 @@
-import type { APIEmbed } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { expectSendable } from '../../test/support/post-limits.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
+import {
+  accentOf,
+  buttonsOf,
+  componentCount,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 import {
   ALICE,
   at,
@@ -20,8 +28,15 @@ import { setDescription } from '../domain/party/meetup.js';
 import { endParty, type Attendee, type MeetupParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { meetupTags, meetupTitle, renderMeetupPost, type MeetupPostView } from './meetup-post.js';
-import { partyControls } from './party-controls.js';
-import { KEPT_OPEN } from './party-post.js';
+import {
+  KEPT_OPEN,
+  layoutTextLength,
+  LEAD_ROOM,
+  MAX_COMPONENTS,
+  postMessage,
+  TEXT_BUDGET,
+  type RenderedPost,
+} from './party-post.js';
 import { renderRaidPost } from './raid-post.js';
 import { LIMITS } from './text.js';
 
@@ -44,13 +59,19 @@ function timed(start: number | null, end: number | null, base = testMeetup()): M
   return { ...base, endTime: end, timed: { ...base.timed, startTime: start } };
 }
 
-/** The line of the description that says the times: the second. */
+/** The lines of the first block of a post: its name, its times. */
+function header(post: RenderedPost): string[] {
+  return textDisplays(post.message)[0]?.split('\n') ?? [];
+}
+
+/** The line of the post that says the times: the second. */
 function timesLine(party: MeetupParty, now = PARTY_NOW): string | undefined {
-  return renderMeetupPost(view(party, { now })).embed.description?.split('\n')[1];
+  return header(renderMeetupPost(view(party, { now })))[1];
 }
 
-function field(embed: APIEmbed, name: RegExp) {
-  return embed.fields?.find((f) => name.test(f.name));
+/** The text display of a post that starts so (a heading), or undefined. */
+function block(post: RenderedPost, start: string): string | undefined {
+  return textDisplays(post.message).find((text) => text.startsWith(start));
 }
 
 function described(text: string, base = testMeetup()): MeetupParty {
@@ -59,15 +80,6 @@ function described(text: string, base = testMeetup()): MeetupParty {
   return set.party;
 }
 
-/** The characters Discord counts towards the 6000 of one embed. */
-function embedSize(embed: APIEmbed): number {
-  return (
-    (embed.title?.length ?? 0) +
-    (embed.description?.length ?? 0) +
-    (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0)
-  );
-}
-
 const NO_TIME =
   'No time has been set yet: `/meet` sets the start. ' +
   `Without one this post is archived ${stamp(PARTY_NOW + DAY + 65 * MINUTE, 'R')}.`;
@@ -95,26 +107,33 @@ describe('meetupTitle and meetupTags', () => {
 });
 
 describe('renderMeetupPost', () => {
-  it('shows the name, what it is, that it has no time yet, who made it and who comes', () => {
+  it('shows the name, what it is, that it has no time yet, who comes and who made it', () => {
     const rendered = renderMeetupPost(view(testMeetup()));
     expect(rendered.title).toBe('Meetup · Community Day picnic');
     expect(rendered.tags).toEqual(['Meetup']);
-    expect(rendered.embed).toEqual({
+    expect(textDisplays(rendered.message)).toEqual([
+      `### Meetup: Community Day picnic\n${NO_TIME}`,
+      `**Interested (1)**\n<@${REPORTER}>`,
+      '**Coming (0)**',
+      '**Present (0)**',
+      `-# Created by <@${REPORTER}>`,
+    ]);
+    expect(accentOf(rendered.message)).toBe(0x3498db);
+    expect(rendered.message).toEqual(postMessage(rendered.layout));
+    // The card of a direct message.
+    expect(rendered.card).toEqual({
       title: 'Community Day picnic',
       description: `**Meetup**\n${NO_TIME}\nCreated by <@${REPORTER}>.`,
       color: 0x3498db,
       fields: [{ name: 'Trainers (1)', value: `**Interested** <@${REPORTER}>` }],
     });
-    expect(rendered.message).toEqual({
-      embeds: [rendered.embed],
-      components: partyControls(testMeetup()),
-    });
   });
 
   it('is nothing like a raid: no gym link, no picture, another colour', () => {
-    const { embed } = renderMeetupPost(view(testMeetup()));
-    expect(embed.url).toBeUndefined();
-    expect(embed.thumbnail).toBeUndefined();
+    const { message, card } = renderMeetupPost(view(testMeetup()));
+    expect(textOf(message)).not.toContain('google.com/maps');
+    expect(thumbnailOf(message)).toBeUndefined();
+    expect(card.url).toBeUndefined();
     const raid = renderRaidPost({
       party: testRaid(),
       now: PARTY_NOW,
@@ -125,28 +144,29 @@ describe('renderMeetupPost', () => {
       emoji,
       zone: PARTY_ZONE,
     });
-    expect(embed.color).not.toBe(raid.embed.color);
+    expect(accentOf(message)).not.toBe(accentOf(raid.message));
   });
 
-  it('makes a name plain in the embed and leaves it raw in the title of the post', () => {
+  it('makes a name plain in the post and leaves it raw in the title of the post', () => {
     const rendered = renderMeetupPost(view(testMeetup({ name: '**Bold** @everyone <@1>' })));
     expect(rendered.title).toBe('Meetup · **Bold** @everyone <@1>');
-    expect(rendered.embed.title).toBe('\\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
+    expect(header(rendered)[0]).toBe('### Meetup: \\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
+    expect(rendered.card.title).toBe('\\*\\*Bold\\*\\* @\u200beveryone <\u200b@1>');
   });
 
   it('always names who made it, as the first trainer in its list does anyway', () => {
     // Not a state `createMeetup` makes: the post does not go by the flag of a raid report.
     const flagged = { ...testMeetup(), anonymous: true };
-    expect(renderMeetupPost(view(flagged)).embed.description?.split('\n')[2]).toBe(
-      `Created by <@${REPORTER}>.`,
+    expect(block(renderMeetupPost(view(flagged)), '-# Created by')).toBe(
+      `-# Created by <@${REPORTER}>`,
     );
   });
 
   it('says that a moderator keeps it, but not in the last showing of a closed one', () => {
     const saved = { ...testMeetup(), saved: true };
-    expect(renderMeetupPost(view(saved)).embed.description?.split('\n').at(-1)).toBe(KEPT_OPEN);
+    expect(header(renderMeetupPost(view(saved))).at(-1)).toBe(KEPT_OPEN);
     const closed = renderMeetupPost(view(saved, { closed: 'This meetup was closed by <@9>.' }));
-    expect(closed.embed.description).not.toContain(KEPT_OPEN);
+    expect(textOf(closed.message)).not.toContain(KEPT_OPEN);
   });
 });
 
@@ -161,7 +181,7 @@ describe('the times of a meetup post', () => {
     );
     // The day it is given, the grace and the warning time: with other settings, another moment.
     const quick = view(testMeetup(), { archiving: { graceMinutes: 1, warningMinutes: 10 } });
-    expect(renderMeetupPost(quick).embed.description?.split('\n')[1]).toBe(
+    expect(header(renderMeetupPost(quick))[1]).toBe(
       'No time has been set yet: `/meet` sets the start. ' +
         `Without one this post is archived ${stamp(PARTY_NOW + DAY + 11 * MINUTE, 'R')}.`,
     );
@@ -229,50 +249,44 @@ describe('the times of a meetup post', () => {
 
   it('is over once the end time has passed: red, tagged, and the end with its day', () => {
     const rendered = renderMeetupPost(view(timed(START, END), { now: END }));
-    expect(rendered.embed.description?.split('\n')[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
-    expect(rendered.embed.color).toBe(0xe74c3c);
+    expect(header(rendered)[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
+    expect(accentOf(rendered.message)).toBe(0xe74c3c);
     expect(rendered.tags).toEqual(['Meetup', 'Ended']);
     const before = renderMeetupPost(view(timed(START, END), { now: END - 1 }));
-    expect(before.embed.color).toBe(0x3498db);
+    expect(accentOf(before.message)).toBe(0x3498db);
   });
 
   it('is not over by the day a meetup without an end is given: it only started long ago', () => {
     const late = START + 3 * DAY;
     const rendered = renderMeetupPost(view(timed(START, null), { now: late }));
-    expect(rendered.embed.color).toBe(0x3498db);
+    expect(accentOf(rendered.message)).toBe(0x3498db);
     expect(rendered.tags).toEqual(['Meetup']);
-    expect(rendered.embed.description?.split('\n')[1]).toBe(
-      `Started ${stamp(START, 'R')}, at ${stamp(START, 'F')}.`,
-    );
+    expect(header(rendered)[1]).toBe(`Started ${stamp(START, 'R')}, at ${stamp(START, 'F')}.`);
   });
 
   it('shows a meetup that has ended as over, also one that never had an end time', () => {
     // The last showing before the post is archived: it must not look as if it went on.
     for (const party of [testMeetup(), timed(START, null)]) {
       const rendered = renderMeetupPost(view(endParty(party), { now: START + 2 * DAY }));
-      expect(rendered.embed.description?.split('\n').slice(0, 3)).toEqual([
-        '**Meetup**',
+      expect(header(rendered)).toEqual([
+        '### Meetup: Community Day picnic',
         'This meetup is over.',
-        `Created by <@${REPORTER}>.`,
       ]);
-      expect(rendered.embed.color).toBe(0xe74c3c);
+      expect(block(rendered, '-# Created by')).toBe(`-# Created by <@${REPORTER}>`);
+      expect(accentOf(rendered.message)).toBe(0xe74c3c);
       expect(rendered.tags).toEqual(['Meetup', 'Ended']);
     }
     // With an end time it says when, also when that end still lay ahead (it was closed early).
     const early = renderMeetupPost(view(endParty(timed(START, END)), { now: START }));
-    expect(early.embed.description?.split('\n')[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
-    expect(early.embed.color).toBe(0xe74c3c);
+    expect(header(early)[1]).toBe(`Ended at ${stamp(END, 'F')}.`);
+    expect(accentOf(early.message)).toBe(0xe74c3c);
   });
 
   it('says in the place of the times that it was closed, as ended whatever the clock says', () => {
     const closed = 'This meetup was closed by <@200000000000000009>.';
     const rendered = renderMeetupPost(view(timed(START, END), { closed }));
-    expect(rendered.embed.description?.split('\n')).toEqual([
-      '**Meetup**',
-      closed,
-      `Created by <@${REPORTER}>.`,
-    ]);
-    expect(rendered.embed.color).toBe(0xe74c3c);
+    expect(header(rendered)).toEqual(['### Meetup: Community Day picnic', closed]);
+    expect(accentOf(rendered.message)).toBe(0xe74c3c);
     expect(rendered.tags).toEqual(['Meetup', 'Ended']);
     // One that had ended by the clock already is tagged once.
     expect(renderMeetupPost(view(timed(START, END), { closed, now: END })).tags).toEqual([
@@ -284,34 +298,34 @@ describe('the times of a meetup post', () => {
 
 describe('the information of a meetup post', () => {
   const information = (party: MeetupParty): string | undefined =>
-    renderMeetupPost(view(party)).embed.description?.split('\n\n**Information**\n')[1];
+    block(renderMeetupPost(view(party)), '**Meeting Information**\n')?.slice(
+      '**Meeting Information**\n'.length,
+    );
 
   it('has no such heading while nobody wrote anything', () => {
-    const { embed } = renderMeetupPost(view(testMeetup()));
-    expect(embed.description).not.toContain('Information');
-    expect(embed.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
+    const rendered = renderMeetupPost(view(testMeetup()));
+    expect(textOf(rendered.message)).not.toContain('Information');
+    expect(rendered.card.description).not.toContain('Information');
   });
 
   it('shows what the members wrote under the head lines, line by line', () => {
-    const { embed } = renderMeetupPost(
-      view(described('Bring snacks.\n\nWe meet at the fountain.')),
-    );
-    expect(embed.description).toBe(
+    const rendered = renderMeetupPost(view(described('Bring snacks.\n\nWe meet at the fountain.')));
+    expect(textDisplays(rendered.message).slice(0, 2)).toEqual([
+      `### Meetup: Community Day picnic\n${NO_TIME}`,
+      '**Meeting Information**\nBring snacks.\n\nWe meet at the fountain.',
+    ]);
+    // In the card it stands in the description, under the lines about the meetup.
+    expect(rendered.card.description).toBe(
       `**Meetup**\n${NO_TIME}\nCreated by <@${REPORTER}>.\n\n` +
-        '**Information**\nBring snacks.\n\nWe meet at the fountain.',
+        '**Meeting Information**\nBring snacks.\n\nWe meet at the fountain.',
     );
-    // It is no field: the trainers are the only one.
-    expect(embed.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
+    expect(rendered.card.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
   });
 
   it('puts it under the line that the post is kept', () => {
-    const { embed } = renderMeetupPost(view({ ...described('Bring snacks.'), saved: true }));
-    expect(embed.description?.split('\n').slice(3)).toEqual([
-      KEPT_OPEN,
-      '',
-      '**Information**',
-      'Bring snacks.',
-    ]);
+    const rendered = renderMeetupPost(view({ ...described('Bring snacks.'), saved: true }));
+    expect(header(rendered).at(-1)).toBe(KEPT_OPEN);
+    expect(textDisplays(rendered.message)[1]).toBe('**Meeting Information**\nBring snacks.');
   });
 
   it('makes every line of it plain: no Markdown, no mention, no link to a channel', () => {
@@ -338,27 +352,33 @@ describe('the information of a meetup post', () => {
 
   it('never cuts what a form accepts: a thousand characters that all need escaping', () => {
     // Every `<` that something follows gets a character after it: the text is twice as long.
-    const { embed } = renderMeetupPost(view(described('<'.repeat(1000))));
     expect(information(described('<'.repeat(1000)))).toBe(`${'<\u200b'.repeat(999)}<`);
-    expect((embed.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
     // The same for what is escaped with a backslash, a line each.
     expect(information(described('_\n'.repeat(500)))).toBe('\\_\n'.repeat(500).trimEnd());
   });
 
-  it('stays an embed Discord takes with the longest text, the longest name and a crowd', () => {
+  it('stays a message Discord takes with the longest text, the longest name and a crowd', () => {
     const base = described('<'.repeat(1000), testMeetup({ name: '<'.repeat(80) }));
     const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 400; n++) {
-      crowd[`300000000000${String(n).padStart(6, '0')}`] = { number: 5, remote: true };
+      crowd[`300000000000${String(n).padStart(6, '0')}`] = {
+        number: 5,
+        remote: true,
+        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
+      };
     }
-    const { embed } = renderMeetupPost(view(withAttendees({ ...base, saved: true }, crowd)));
-    expect((embed.title ?? '').length).toBeLessThanOrEqual(LIMITS.embedTitle);
-    expect((embed.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
-    expect(embedSize(embed)).toBeLessThanOrEqual(LIMITS.embedTotal);
-    for (const f of embed.fields ?? []) expect(f.value.length).toBeLessThanOrEqual(1024);
-    // The text is whole; it is the list of trainers that gives way.
-    expect(embed.description?.endsWith(`${'<\u200b'.repeat(999)}<`)).toBe(true);
-    expect(field(embed, /Trainers/)?.value).toMatch(/…and \d+ more/);
+    const rendered = renderMeetupPost(view(withAttendees({ ...base, saved: true }, crowd)));
+    expect(layoutTextLength(rendered.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+    expect(componentCount(rendered.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    expectSendable(rendered);
+    // The text is whole; it is the lists of trainers that give way.
+    expect(information(withAttendees({ ...base, saved: true }, crowd))).toBe(
+      `${'<\u200b'.repeat(999)}<`,
+    );
+    expect(block(rendered, '**Coming')).toMatch(/…and \d+ more$/);
+    // The card stays an embed Discord takes.
+    expect((rendered.card.description ?? '').length).toBeLessThanOrEqual(LIMITS.embedDescription);
+    expect(rendered.card.description?.endsWith(`${'<\u200b'.repeat(999)}<`)).toBe(true);
   });
 });
 
@@ -369,57 +389,57 @@ describe('the trainers of a meetup post', () => {
       [BOB]: { status: PartyStatus.Coming, remote: true },
       [CAROL]: { status: PartyStatus.Coming, team: 'valor', name: 'Carol' },
     });
-    const { embed } = renderMeetupPost(view(meetup));
-    expect(field(embed, /Trainers/)).toEqual({
-      name: 'Trainers (6)',
-      value:
-        `**Here** ❄️ Alice +2\n` +
-        `**Coming** <@${BOB}> 🛰️, 🔥 Carol\n` +
-        `**Interested** <@${REPORTER}>`,
-    });
+    expect(textDisplays(renderMeetupPost(view(meetup)).message).slice(1, 4)).toEqual([
+      `**Interested (1)**\n<@${REPORTER}>`,
+      `**Coming (2)**\n<@${BOB}> 🛰️, 🔥 Carol`,
+      '**Present (3)**\n❄️ Alice +2',
+    ]);
   });
 
-  it('has no Done list and tells nobody to split up: there is no lobby', () => {
+  it('has no Complete list and tells nobody to split up: there is no lobby', () => {
     const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 30; n++) crowd[`300000000000${String(n).padStart(6, '0')}`] = {};
-    const { embed } = renderMeetupPost(view(withAttendees(testMeetup(), crowd)));
-    expect(embed.fields?.map((f) => f.name)).toEqual(['Trainers (31)']);
-    expect(field(embed, /Trainers/)?.value).not.toContain('lobby');
+    const text = textOf(renderMeetupPost(view(withAttendees(testMeetup(), crowd))).message);
+    expect(text).toContain('**Coming (30)**');
+    expect(text).not.toContain('Complete');
+    expect(text).not.toContain('lobby');
   });
 
-  it('says so when nobody is signed up', () => {
+  it('shows every status with its button when nobody is signed up', () => {
     const empty = { ...testMeetup(), attendees: {} };
-    expect(field(renderMeetupPost(view(empty)).embed, /Trainers/)).toEqual({
-      name: 'Trainers (0)',
-      value: 'Nobody yet.',
-    });
+    expect(textDisplays(renderMeetupPost(view(empty)).message).slice(1, 4)).toEqual([
+      '**Interested (0)**',
+      '**Coming (0)**',
+      '**Present (0)**',
+    ]);
   });
 });
 
 describe('the controls of a meetup post', () => {
   const labels = (party: MeetupParty) =>
-    partyControls(party).map((row) =>
-      row.components.map((component) => ('label' in component ? component.label : undefined)),
-    );
+    buttonsOf(renderMeetupPost(view(party)).message).map((button) => button.label);
 
-  it('has no Done and no "Set time": Interested, Join, Here, Leave, then the head count', () => {
+  it('has no Done, no "Set time" and no map: the statuses, then Leave and the head count', () => {
     expect(labels(testMeetup())).toEqual([
-      ['Interested', 'Join', 'Here', 'Leave'],
-      ['−1', '+1', 'Remote / in person'],
+      'Interested',
+      'Join',
+      'Here',
+      'Leave',
+      '−1',
+      '+1',
+      'Remote',
     ]);
   });
 
   it('names the meetup in every custom id, like the controls of a raid', () => {
     const meetup = testMeetup();
-    for (const row of partyControls(meetup)) {
-      for (const component of row.components) {
-        if (!('custom_id' in component)) throw new Error('a control without a custom id');
-        expect(decodeCustomId(component.custom_id)).toMatchObject({ kind: 'party', id: meetup.id });
-      }
+    for (const button of buttonsOf(renderMeetupPost(view(meetup)).message)) {
+      expect(decodeCustomId(button.customId ?? '')).toMatchObject({ kind: 'party', id: meetup.id });
     }
   });
 
   it('is the same whatever its times', () => {
-    expect(partyControls(timed(START, END))).toEqual(partyControls(testMeetup()));
+    const controls = (party: MeetupParty) => buttonsOf(renderMeetupPost(view(party)).message);
+    expect(controls(timed(START, END))).toEqual(controls(testMeetup()));
   });
 });
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index fa54ce68e250c8da8a20c1d0ccaa7fa0a0e09005..fdae79f7a3ef7bd135e128984dbb9c740d7063c8 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -1,18 +1,20 @@
 import type { APIEmbed } from 'discord.js';
 import { memberOf, type MeetupParty } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
-import { partyControls } from './party-controls.js';
+import { fitEmbed, groupField, type ShrinkableField } from './party-card.js';
+import { bottomControls } from './party-controls.js';
 import {
   ENDED_COLOUR,
-  fitEmbed,
-  groupField,
+  fittedLayout,
   KEPT_OPEN,
+  renderedPost,
   tidyTitle,
+  trainerBlocks,
   type ForumTag,
+  type PostLayout,
   type RenderedPost,
-  type ShrinkableField,
 } from './party-post.js';
-import { LIMITS, memberName, plain, plainLines, truncate } from './text.js';
+import { LIMITS, memberName, memberText, plain, plainLines, truncate } from './text.js';
 import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
 
 /** What the post of a meetup is rendered from (see `TimedPostView`). */
@@ -28,30 +30,67 @@ export function meetupTags(party: MeetupParty, now: number): ForumTag[] {
   return ['Meetup', ...(shownAsOver(party, now) ? ['Ended' as const] : [])];
 }
 
+/** What the members wrote about the meetup, made plain; empty when it is nothing. */
+function information(party: MeetupParty): string {
+  // A text of nothing but white space is empty once plain, and then has no heading either.
+  return party.meetup.description === null ? '' : plainLines(party.meetup.description);
+}
+
+function colour(view: MeetupPostView): number {
+  return view.closed !== undefined || shownAsOver(view.party, view.now)
+    ? ENDED_COLOUR
+    : TIMED_COLOUR;
+}
+
 /**
- * The forum post of a meetup: title, tags, the embed and the controls under it. Pure: the same
- * view gives the same post. It has what the post of a raid has without what belongs to a gym or
- * a boss: its name, its times, who made it, what the members wrote about it, and who comes.
- *
- * What the members wrote stands in the description, under a heading, and not in a field: a
- * field holds 1024 characters, and a text of the 1000 a form takes can be longer than that once
- * it is made plain. The description holds 4096, so nothing a member wrote is ever cut.
+ * The post of a meetup laid out: its name and times; what the members wrote about it, never
+ * cut (a form takes 1,000 characters, well within the text a post may have); who comes, with the
+ * buttons; the rows of the rest of the controls; who made it (a meetup always names its maker).
  */
-export function renderMeetupPost(view: MeetupPostView): RenderedPost {
-  const { party, now } = view;
-  const over = view.closed !== undefined || shownAsOver(party, now);
-  const information = party.meetup.description === null ? '' : plainLines(party.meetup.description);
+function meetupLayout(view: MeetupPostView): PostLayout {
+  const { party } = view;
+  const header = [
+    `### Meetup: ${plain(nameOf(party))}`,
+    view.closed ?? describeTimes(view),
+    // Not in the last showing of a meetup that was closed: that post is archived.
+    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+  ].join('\n');
+  const about = information(party);
+  return fittedLayout((fit) => ({
+    accent: colour(view),
+    blocks: [
+      { type: 'text', content: header },
+      { type: 'separator' },
+      ...(about === ''
+        ? []
+        : [{ type: 'text' as const, content: `**Meeting Information**\n${about}` }]),
+      { type: 'separator' },
+      ...trainerBlocks(view, { complete: false, lobby: false }, fit),
+      { type: 'separator' },
+      { type: 'controls', rows: bottomControls(party, { groups: false }) },
+      {
+        type: 'text',
+        content: `-# Created by ${memberText(memberOf(party, party.createdById))}`,
+      },
+    ],
+  }));
+}
+
+/**
+ * The card of a meetup, for a direct message. What the members wrote stands in the description,
+ * under a heading, and not in a field: a field holds 1024 characters, and a text of the 1000 a
+ * form takes can be longer than that once it is made plain.
+ */
+function meetupCard(view: MeetupPostView): APIEmbed {
+  const { party } = view;
+  const about = information(party);
   const description = [
     '**Meetup**',
     view.closed ?? describeTimes(view),
-    // A meetup always names who made it.
     `Created by ${memberName(memberOf(party, party.createdById))}.`,
-    // Not in the last showing of a meetup that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
-    // A text of nothing but white space is empty once plain, and then has no heading either.
-    ...(information === '' ? [] : ['', '**Information**', information]),
+    ...(about === '' ? [] : ['', '**Meeting Information**', about]),
   ].join('\n');
-
   const fields: ShrinkableField[] = [];
   const single = party.groups.length === 1;
   for (const group of party.groups) {
@@ -61,23 +100,30 @@ export function renderMeetupPost(view: MeetupPostView): RenderedPost {
       rank: 1,
     });
   }
-
   // Embed titles render Markdown (a thread name does not, so the post's own title stays raw).
   const embedTitle = truncate(plain(nameOf(party)), LIMITS.embedTitle);
   const embedDescription = truncate(description, LIMITS.embedDescription);
   fitEmbed(embedTitle, embedDescription, fields);
-
-  const embed: APIEmbed = {
+  return {
     title: embedTitle,
     description: embedDescription,
-    color: over ? ENDED_COLOUR : TIMED_COLOUR,
+    color: colour(view),
     fields: fields.map((f) => f.field),
   };
+}
+
+/**
+ * The forum post of a meetup: title, tags, the components-v2 message and the card of a direct
+ * message. Pure: the same view gives the same post. It has what the post of a raid has without
+ * what belongs to a gym or a boss.
+ */
+export function renderMeetupPost(view: MeetupPostView): RenderedPost {
+  const { party, now } = view;
   const tags = meetupTags(party, now);
-  return {
+  return renderedPost({
     title: meetupTitle(party),
     tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
-    embed,
-    message: { embeds: [embed], components: partyControls(party) },
-  };
+    layout: meetupLayout(view),
+    card: meetupCard(view),
+  });
 }
diff --git a/src/render/mirrors.region.test.ts b/src/render/mirrors.region.test.ts
index 9f5e9654e9d729314fd1f5f8e0619fba0b4b3f64..6b1d07ee9daee674fbddd42729b5b6c0e5fc3b44 100644
--- a/src/render/mirrors.region.test.ts
+++ b/src/render/mirrors.region.test.ts
@@ -1,11 +1,12 @@
 import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
+import { buttonsOf, copiedPost, leadOf, textDisplays } from '../../test/support/messages.js';
 import { PARTY_NOW, PARTY_ZONE, testRaid, testTrain } from '../../test/support/parties.js';
 import { decodeCustomId } from '../discord/custom-id.js';
+import type { OutgoingMessage } from '../discord/party-gateway.js';
 import type { TrainParty } from '../domain/party/party.js';
 import { renderMirror } from './mirrors.js';
-import { invitationControls, partyControls } from './party-controls.js';
 import { renderRaidPost } from './raid-post.js';
 import { renderTrainPost } from './train-post.js';
 
@@ -30,61 +31,54 @@ const rendered = renderTrainPost({
 });
 const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };
 
-/** The actions of the buttons of a message, row by row. */
-const actions = (components: ReturnType<typeof partyControls> | undefined): string[][] =>
-  (components ?? []).map((row) =>
-    row.components.map((control) =>
-      'custom_id' in control ? (decodeCustomId(control.custom_id)?.action ?? '') : '',
-    ),
-  );
+/** The actions of the buttons of a message, in order. */
+const actions = (message: OutgoingMessage): string[] =>
+  buttonsOf(message).map((button) => decodeCustomId(button.customId ?? '')?.action ?? '');
 
 describe('renderMirror for the channel of a region a train stops in', () => {
-  it('copies the embed under a line that invites to sign up, and promises neither the link nor access', () => {
+  it('copies the post under a line that invites to sign up, and promises neither the link nor access', () => {
     const copy = renderMirror('region', rendered, place);
-    expect(copy.embeds).toEqual(rendered.message.embeds);
-    expect(copy.content).toBe(
+    expect(leadOf(copy)).toBe(
       'A raid train that stops in this region. ' +
         'Sign up here to follow it in its post: <#900000000000000001>',
     );
+    expect(copiedPost(copy)).toEqual(textDisplays(rendered.message));
     // Wherever the train was made: the line names no other channel.
     expect(renderMirror('region', rendered, { ...place, regionChannelId: undefined })).toEqual(
       copy,
     );
   });
 
-  it('has the controls of the post without the row that moves the train', () => {
-    expect(actions(rendered.message.components)).toEqual([
-      ['maybe', 'join', 'here', 'leave'],
-      ['less', 'more', 'remote'],
-      ['group', 'group'],
-      ['move'],
+  it('has the controls of the post without the button that moves the train', () => {
+    expect(actions(rendered.message)).toEqual([
+      'move',
+      'group',
+      'group',
+      'maybe',
+      'here',
+      'leave',
+      'less',
+      'more',
+      'remote',
     ]);
     const copy = renderMirror('region', rendered, place);
-    expect(actions(copy.components)).toEqual([
-      ['maybe', 'join', 'here', 'leave'],
-      ['less', 'more', 'remote'],
-      ['group', 'group'],
+    expect(actions(copy)).toEqual([
+      'group',
+      'group',
+      'maybe',
+      'here',
+      'leave',
+      'less',
+      'more',
+      'remote',
     ]);
-    expect(copy.components).toEqual(rendered.message.components?.slice(0, 3));
+    // Where the train is stays said, without its button.
+    expect(textDisplays(copy)).toContain(textDisplays(rendered.message)[1]);
     // The copy in the post itself is the message as it is.
-    expect(renderMirror('status', rendered, place)).toBe(rendered.message);
-  });
-});
-
-describe('invitationControls', () => {
-  it('drops the row of the button that moves a train, and nothing else', () => {
-    expect(actions(invitationControls(partyControls(train)))).toEqual([
-      ['maybe', 'join', 'here', 'leave'],
-      ['less', 'more', 'remote'],
-      ['group', 'group'],
-    ]);
-    // The controls of a party that has no such button stay as they are.
-    const raid = partyControls(testRaid());
-    expect(invitationControls(raid)).toEqual(raid);
-    expect(invitationControls([])).toEqual([]);
+    expect(renderMirror('status', rendered, place)).toEqual(rendered.message);
   });
 
-  it('leaves the copies of a raid as they were', () => {
+  it('leaves the copies of a raid with every control of the post', () => {
     const raid = renderRaidPost({
       party: testRaid(),
       now: PARTY_NOW,
@@ -95,6 +89,6 @@ describe('invitationControls', () => {
       zone: PARTY_ZONE,
       emoji,
     });
-    expect(renderMirror('remote', raid, place).components).toEqual(raid.message.components);
+    expect(buttonsOf(renderMirror('remote', raid, place))).toEqual(buttonsOf(raid.message));
   });
 });
diff --git a/src/render/mirrors.test.ts b/src/render/mirrors.test.ts
index d870f77409b7dfd3ede90fc88c08e3653acac39a..35f50935c05222e8051d88c2035dc7c2b7602388 100644
--- a/src/render/mirrors.test.ts
+++ b/src/render/mirrors.test.ts
@@ -1,6 +1,14 @@
 import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
+import {
+  buttonsOf,
+  componentCount,
+  copiedPost,
+  leadOf,
+  textDisplays,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 import { PARTY_NOW, PARTY_ZONE, testRaid } from '../../test/support/parties.js';
 import { renderMirror } from './mirrors.js';
 import { renderRaidPost } from './raid-post.js';
@@ -11,6 +19,7 @@ const rendered = renderRaidPost({
   now: PARTY_NOW,
   gym: testGyms()[0],
   boss: undefined,
+  eggPicture: 'https://example.test/egg.png',
   catalogue: catalogueFixture(),
   showUnknownMoves: true,
   zone: PARTY_ZONE,
@@ -19,23 +28,34 @@ const rendered = renderRaidPost({
 const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };
 
 describe('renderMirror', () => {
-  it('copies the embed and the controls, under a line that links to the post', () => {
+  it('copies the post and its controls, opening with a line that links to the post', () => {
     const remote = renderMirror('remote', rendered, place);
-    expect(remote.embeds).toEqual(rendered.message.embeds);
-    expect(remote.components).toEqual(rendered.message.components);
-    expect(remote.components?.length).toBeGreaterThan(0);
-    expect(remote.content).toBe('A raid in <#100000000000000001>: <#900000000000000001>');
-    expect(renderMirror('ex', rendered, place).content).toBe(
+    expect(leadOf(remote)).toBe('A raid in <#100000000000000001>: <#900000000000000001>');
+    expect(copiedPost(remote)).toEqual(textDisplays(rendered.message));
+    // The line is the first of the post's first text: no component more than the post.
+    expect(componentCount(remote)).toBe(componentCount(rendered.message));
+    expect(buttonsOf(remote)).toEqual(buttonsOf(rendered.message));
+    expect(buttonsOf(remote).length).toBeGreaterThan(0);
+    expect(thumbnailOf(remote)).toBe('https://example.test/egg.png');
+    expect(leadOf(renderMirror('ex', rendered, place))).toBe(
       'A raid at an elite raid gym in <#100000000000000001>: <#900000000000000001>',
     );
   });
 
   it('names no region when the region is gone', () => {
     const lost = { ...place, regionChannelId: undefined };
-    expect(renderMirror('remote', rendered, lost).content).toBe('A raid: <#900000000000000001>');
+    expect(leadOf(renderMirror('remote', rendered, lost))).toBe('A raid: <#900000000000000001>');
   });
 
   it('is the message itself for the copy in the post', () => {
-    expect(renderMirror('status', rendered, place)).toBe(rendered.message);
+    expect(renderMirror('status', rendered, place)).toEqual(rendered.message);
+  });
+
+  it('leaves the picture out when asked, for when Discord refuses it', () => {
+    for (const kind of ['status', 'remote', 'ex', 'region'] as const) {
+      const bare = renderMirror(kind, rendered, place, { picture: false });
+      expect(thumbnailOf(bare)).toBeUndefined();
+      expect(textDisplays(bare)).toEqual(textDisplays(renderMirror(kind, rendered, place)));
+    }
   });
 });
diff --git a/src/render/mirrors.ts b/src/render/mirrors.ts
index 174017becd0b36f68009c7cbf5f2fd6ab5e11622..219ca5b1d4033900577eced684db1a2848bef40d 100644
--- a/src/render/mirrors.ts
+++ b/src/render/mirrors.ts
@@ -1,7 +1,6 @@
-import type { ClassicMessage } from '../discord/party-gateway.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import type { MirrorKind } from '../domain/party/party.js';
-import { invitationControls } from './party-controls.js';
-import type { RenderedPost } from './party-post.js';
+import { postMessage, type RenderedPost } from './party-post.js';
 
 /** Where a party is, for the line above a copy of its message in another channel. */
 export interface MirrorPlace {
@@ -12,34 +11,38 @@ export interface MirrorPlace {
 }
 
 /**
- * A copy of a party's message for another place (spec 5.2): the same embed and the same
- * controls as the first message of the post, so a member can sign up where they see it. The
+ * A copy of a party's message for another place (spec 5.2): the same message as the first
+ * message of the post, with the same controls, so a member can sign up where they see it. The
  * copy at the bottom of the post itself (`status`), which every kind of party can have, is the
  * message as it is. The copies in another channel (`ex`, `remote`) are a raid's alone
- * (`raidMirrors`): a line above them says what raid it is and links to the post.
+ * (`raidMirrors`): a line at the top says what raid it is and links to the post.
  *
  * `region` is the copy of a train in the channel of another region it stops in, for the members
  * there, who may not see the forum the train's post is in: its line invites them to sign up,
  * which lets them in unless somebody keeps them out. Until then Discord shows them the link as
- * an unknown channel, so the line promises neither the link nor the access. Its controls are
- * the post's without the button that moves the train (`invitationControls`).
+ * an unknown channel, so the line promises neither the link nor the access. It has the post's
+ * controls but the button that moves the train: a train is moved from its post, by who is
+ * there; the copy is for getting in.
+ *
+ * `picture: false` is the copy without the post's picture, for when Discord refuses it.
  */
 export function renderMirror(
   kind: MirrorKind,
   rendered: RenderedPost,
   place: MirrorPlace,
-): ClassicMessage {
-  if (kind === 'status') return rendered.message;
+  { picture = true }: { picture?: boolean } = {},
+): V2Message {
+  if (kind === 'status') return postMessage(rendered.layout, { picture });
   if (kind === 'region') {
-    return {
-      ...rendered.message,
-      content:
+    return postMessage(rendered.layout, {
+      picture,
+      move: false,
+      lead:
         'A raid train that stops in this region. ' +
         `Sign up here to follow it in its post: <#${place.postId}>`,
-      components: invitationControls(rendered.message.components ?? []),
-    };
+    });
   }
   const region = place.regionChannelId === undefined ? '' : ` in <#${place.regionChannelId}>`;
   const what = kind === 'ex' ? 'A raid at an elite raid gym' : 'A raid';
-  return { ...rendered.message, content: `${what}${region}: <#${place.postId}>` };
+  return postMessage(rendered.layout, { picture, lead: `${what}${region}: <#${place.postId}>` });
 }
diff --git a/src/render/party-card.ts b/src/render/party-card.ts
new file mode 100644
index 0000000000000000000000000000000000000000..34c4fdbc97d2a0063c0e007a131aa5bbc3286ba9
--- /dev/null
+++ b/src/render/party-card.ts
@@ -0,0 +1,135 @@
+import type { APIEmbedField } from 'discord.js';
+import { headCount, membersWhere, type Attendee, type PartyGroup } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { attendeeTexts, inShownOrder, LOBBY_SIZE, type TrainersView } from './party-post.js';
+import { LIMITS, plain, timestamp, truncate } from './text.js';
+
+/**
+ * The card of a party: the embed a direct message shows of it (a components-v2 message cannot
+ * carry the DM's sentence beside it, so the DM keeps an embed). Each renderer makes its kind's
+ * (`raidCard`, `meetupCard`, `trainCard`) from these fields.
+ */
+
+export interface GroupFieldOptions {
+  /** The party has only this group: the field is called "Trainers" unless the group has a label. */
+  single: boolean;
+  /** Tell a group that is bigger than a lobby to split up: for a raid. */
+  lobby: boolean;
+  /** The room the value may take; at most, and by default, what a field holds. */
+  limit?: number;
+}
+
+/**
+ * The field of one group: the trainers of a party, or of one of the groups of a raid. The lists
+ * of Present, Coming and Interested share the room that is left (`limit`, at most 1024) after the
+ * meeting line and the lobby note: when they do not all fit, the longest list is shortened
+ * first, one trainer at a time from its end, and says how many it left out. Even with every list
+ * cut down to that count the value can exceed a very small `limit`; it is then as short as it
+ * can be.
+ */
+export function groupField(
+  view: TrainersView,
+  group: PartyGroup,
+  options: GroupFieldOptions,
+): APIEmbedField {
+  const { party, emoji } = view;
+  const { single, lobby, limit = LIMITS.fieldValue } = options;
+  const heads = headCount(party, group.id);
+  const label = group.label ? `: ${plain(group.label)}` : '';
+  const name = truncate(
+    `${single && !group.label ? 'Trainers' : `Group ${group.id}${label}`} (${heads})`,
+    LIMITS.fieldName,
+  );
+  const lines: string[] = [];
+  if (group.startTime !== undefined) {
+    lines.push(`Meeting at ${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`);
+  }
+  if (lobby && heads > LOBBY_SIZE) {
+    lines.push(`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`);
+  }
+  const kinds: [string, (attendee: Attendee) => boolean][] = [
+    [
+      'Present',
+      (a) => a.status === PartyStatus.Present || a.status === PartyStatus.CompletePending,
+    ],
+    ['Coming', (a) => a.status === PartyStatus.Coming],
+    ['Interested', (a) => a.status === PartyStatus.Interested],
+  ];
+  const sections: { title: string; texts: string[]; shown: number }[] = [];
+  for (const [title, belongs] of kinds) {
+    const members = inShownOrder(
+      party,
+      membersWhere(party, (a) => a.group === group.id && belongs(a)),
+    );
+    if (members.length === 0) continue;
+    const texts = attendeeTexts(party, members, emoji);
+    sections.push({ title, texts, shown: texts.length });
+  }
+  const sectionLine = (section: (typeof sections)[number]): string => {
+    const kept = section.texts.slice(0, section.shown);
+    const left = section.texts.length - section.shown;
+    if (left > 0) kept.push(`…and ${left} more`);
+    return `**${section.title}** ${kept.join(', ')}`;
+  };
+  const build = (): string => {
+    const all = [...lines, ...sections.map(sectionLine)];
+    return all.length > 0 ? all.join('\n') : 'Nobody yet.';
+  };
+  let value = build();
+  while (value.length > limit) {
+    let longest: (typeof sections)[number] | undefined;
+    for (const section of sections) {
+      if (
+        section.shown > 0 &&
+        (!longest || sectionLine(section).length > sectionLine(longest).length)
+      ) {
+        longest = section;
+      }
+    }
+    if (!longest) break;
+    longest.shown--;
+    value = build();
+  }
+  // Not reachable (the lines are short), but a value Discord would refuse is the worse failure.
+  return { name, value: truncate(value, LIMITS.fieldValue) };
+}
+
+/** A field whose attendee list can be made shorter: `shrink(limit)` is the field for that room. */
+export interface ShrinkableField {
+  field: APIEmbedField;
+  shrink?: (limit: number) => APIEmbedField;
+  /** Fields of a lower rank are shortened first. */
+  rank: number;
+}
+
+function embedSize(title: string, description: string, fields: readonly ShrinkableField[]): number {
+  let size = title.length + description.length;
+  for (const { field } of fields) size += field.name.length + field.value.length;
+  return size;
+}
+
+/**
+ * Shortens the attendee lists until title, description and fields together fit what Discord
+ * counts for one embed. The longest group field gives way first, the Done field last; no field
+ * is dropped.
+ */
+export function fitEmbed(title: string, description: string, fields: ShrinkableField[]): void {
+  const exhausted = new Set<ShrinkableField>();
+  for (let over = embedSize(title, description, fields) - LIMITS.embedTotal; over > 0;) {
+    const open = fields.filter((f) => f.shrink && !exhausted.has(f));
+    const rank = Math.min(...open.map((f) => f.rank));
+    const tier = open
+      .filter((f) => f.rank === rank)
+      .sort((a, b) => b.field.value.length - a.field.value.length);
+    const top = tier[0];
+    if (!top?.shrink) break;
+    const current = top.field.value.length;
+    const ties = tier.filter((f) => f.field.value.length === current).length;
+    const next = tier.find((f) => f.field.value.length < current)?.field.value.length ?? 0;
+    const step = Math.min(over, Math.max(current - next, Math.ceil(over / ties)));
+    const shorter = top.shrink(current - step);
+    if (shorter.value.length >= current) exhausted.add(top);
+    else top.field = shorter;
+    over = embedSize(title, description, fields) - LIMITS.embedTotal;
+  }
+}
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index b2ce61650a6ada9304b000944a0521e2a4614ec4..7bb96e52ddad0a5a84d77294f369137c80c89a63 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -24,23 +24,29 @@ import {
   isPartyAction,
   PARTY_ACTIONS,
   PARTY_KIND,
-  partyControls,
 } from './party-controls.js';
 
-/** Label and decoded custom id of every button, row by row. */
+/** Every control a post of this raid shows, in their order there, label, action and arguments. */
 function controls(party: RaidParty) {
-  return partyControls(party).map((row) =>
-    row.components.map((component) => {
-      if (!('custom_id' in component)) throw new Error('a control without a custom id');
-      const id = decodeCustomId(component.custom_id);
-      return {
-        label: 'label' in component ? component.label : undefined,
-        action: id?.action,
-        args: id?.args,
-        disabled: 'disabled' in component ? component.disabled : undefined,
-      };
-    }),
-  );
+  const groups = party.groups.length > 1;
+  const buttons = [
+    ...(groups
+      ? party.groups.map((group) => joinGroupButton(party, group))
+      : (['interested', 'coming', 'present', 'complete'] as const).map((status) =>
+          statusButton(party, status),
+        )),
+    ...bottomControls(party, { groups }).flat(),
+  ].map(({ button }) => button);
+  return buttons.map((button) => {
+    if (!('custom_id' in button)) throw new Error('a control without a custom id');
+    const id = decodeCustomId(button.custom_id);
+    return {
+      label: button.label,
+      action: id?.action,
+      args: id?.args,
+      disabled: button.disabled,
+    };
+  });
 }
 
 const fiveGroups = (label?: string): RaidParty => ({
@@ -54,33 +60,30 @@ const fiveGroups = (label?: string): RaidParty => ({
 /** A raid with times: it has no "Set time" button. */
 const timed = setHatchTime(testRaid(), PARTY_NOW + 30 * 60_000, testRaidRules(), PARTY_NOW);
 
-describe('partyControls', () => {
-  it('has the five statuses, then the head count and the remote switch', () => {
-    const rows = controls(timed);
-    expect(rows).toHaveLength(2);
-    expect(rows[0]?.map((c) => [c.label, c.action])).toEqual([
+describe('the controls of a raid post', () => {
+  it('has the four statuses, then Leave, the head count and the remote switch', () => {
+    expect(controls(timed).map((c) => [c.label, c.action])).toEqual([
       ['Interested', 'maybe'],
       ['Join', 'join'],
       ['Here', 'here'],
       ['Done', 'done'],
       ['Leave', 'leave'],
-    ]);
-    expect(rows[1]?.map((c) => [c.label, c.action])).toEqual([
       ['−1', 'less'],
       ['+1', 'more'],
-      ['Remote / in person', 'remote'],
+      ['Remote', 'remote'],
     ]);
   });
 
   it('names the party in every custom id, within the length Discord allows', () => {
     const party = fiveGroups();
-    for (const row of partyControls(party)) {
-      for (const component of row.components) {
-        if (!('custom_id' in component)) throw new Error('a control without a custom id');
-        expect(component.custom_id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
-        const id = decodeCustomId(component.custom_id);
-        expect(id).toMatchObject({ kind: PARTY_KIND, id: party.id });
-        expect(isPartyAction(id?.action ?? '')).toBe(true);
+    for (const control of controls(party)) {
+      expect(isPartyAction(control.action ?? '')).toBe(true);
+    }
+    for (const row of bottomControls(party, { groups: true })) {
+      for (const { button } of row) {
+        if (!('custom_id' in button)) continue;
+        expect(button.custom_id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
+        expect(decodeCustomId(button.custom_id)).toMatchObject({ kind: PARTY_KIND, id: party.id });
       }
     }
   });
@@ -89,53 +92,35 @@ describe('partyControls', () => {
     const egg = testRaid();
     const hatched = testRaid({ boss: { key: 'yveltal' } });
     for (const party of [egg, hatched]) {
-      expect(
-        controls(party)
-          .flat()
-          .some((control) => control.disabled),
-      ).toBe(false);
+      expect(controls(party).some((control) => control.disabled)).toBe(false);
     }
     expect(controls(egg)).toEqual(controls(hatched));
   });
 
-  it('has no remote switch for an elite raid', () => {
-    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
-    expect(controls(elite)[1]?.map((c) => c.action)).toEqual(['less', 'more', 'time']);
-  });
-
   it('offers "Set time" only while the raid has no times', () => {
-    expect(controls(testRaid())[1]?.map((c) => [c.label, c.action])).toEqual([
-      ['−1', 'less'],
-      ['+1', 'more'],
-      ['Remote / in person', 'remote'],
-      ['Set time', 'time'],
-    ]);
-    expect(controls(timed)[1]?.map((c) => c.action)).not.toContain('time');
+    expect(controls(testRaid()).map((c) => c.action)).toContain('time');
+    expect(controls(timed).map((c) => c.action)).not.toContain('time');
   });
 
-  it('offers a button per group once there are several, with how many are expected', () => {
+  it('offers to join each group once there are several, by the action that moves a member there', () => {
     const party: RaidParty = {
       ...withAttendees(testRaid(), { [ALICE]: { group: 'B', number: 3 }, [BOB]: { group: 'B' } }),
       groups: [{ id: 'A' }, { id: 'B', label: '  park\n side ' }],
       defaultGroupId: 'B',
     };
-    const rows = controls(party);
-    expect(rows).toHaveLength(3);
-    expect(rows[2]?.map((c) => [c.label, c.action, c.args])).toEqual([
-      ['Group A (1)', 'group', ['A']],
-      ['B: park side (4)', 'group', ['B']],
+    expect(
+      controls(party)
+        .slice(0, 2)
+        .map((c) => [c.label, c.action, c.args]),
+    ).toEqual([
+      ['Join A', 'group', ['A']],
+      ['Join B', 'group', ['B']],
     ]);
   });
 
-  it('fits five groups with the longest labels into one row of buttons', () => {
-    const rows = partyControls(fiveGroups('x'.repeat(100)));
-    expect(rows).toHaveLength(3);
-    expect(rows[2]?.components).toHaveLength(5);
-    for (const component of rows[2]?.components ?? []) {
-      const label = 'label' in component ? (component.label ?? '') : '';
-      expect(label.length).toBeLessThanOrEqual(80);
-      // The label gives way, the head count stays.
-      expect(label).toMatch(/… \(\d\)$/);
+  it('has short buttons for five groups, whatever their labels', () => {
+    for (const control of controls(fiveGroups('x'.repeat(100))).slice(0, 5)) {
+      expect(control.label).toMatch(/^Join [A-E]$/);
     }
   });
 
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index d80bb642fa0cee722089c9fdab8b6fc67cbc4558..cda72df755c37e839953a52616177533ad4278d1 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -8,18 +8,16 @@ import {
   type APIComponentInMessageActionRow,
   type APIModalInteractionResponseCallbackData,
 } from 'discord.js';
-import { decodeCustomId, encodeCustomId } from '../discord/custom-id.js';
+import { encodeCustomId } from '../discord/custom-id.js';
 import {
-  headCount,
   isRaid,
-  isTrain,
   partyWord,
   remoteAllowed,
   type Party,
   type PartyGroup,
 } from '../domain/party/party.js';
 import type { PostButton } from './party-post.js';
-import { fitItems, plain, truncate } from './text.js';
+import { fitItems, plain } from './text.js';
 
 /** The custom-id kind of the controls of a party's post (and of its copies in other channels). */
 export const PARTY_KIND = 'party';
@@ -70,8 +68,6 @@ export function isRaidAction(value: string): boolean {
   return (RAID_ACTIONS as readonly string[]).includes(value);
 }
 
-/** Discord allows this many characters on a button. */
-const BUTTON_LABEL = 80;
 /** The names of a completion question are cut so that the whole message stays well under 2,000. */
 const QUESTION_NAMES = 1_700;
 
@@ -210,100 +206,12 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
   return rows;
 }
 
-/** `Group B (4)`, or `B: park side (4)` for a group with a label; the count is never cut off. */
-function groupLabel(party: Party, group: PartyGroup): string {
-  const heads = ` (${headCount(party, group.id)})`;
-  const label = group.label?.replace(/\s+/g, ' ').trim();
-  const name = label ? `${group.id}: ${label}` : `Group ${group.id}`;
-  return `${truncate(name, BUTTON_LABEL - heads.length)}${heads}`;
-}
-
-/**
- * The controls under a party's message (spec 4.1): the five statuses; the head count, the
- * remote switch (an elite raid has none) and, for a raid without times, "Set time" (spec 4.3);
- * and, when there is more than one group, a button per group to move there. Buttons and not a menu for the groups: a menu keeps showing each member
- * their last choice, also one that was refused. Nothing depends on the time, so the controls
- * never need an edit of their own: Done on an egg is refused when it is pressed.
- *
- * A meetup has no Done: there is nothing to complete in it, done would only mean leave, and
- * Leave is there. It has no "Set time" either (its times are `/meet` and `/end`), and never a
- * row of groups. A train is like a meetup in the first two, has its groups like a raid, and a
- * last row of its own: "Move train…", which opens the panel that moves it along its route. It is
- * always there, whoever looks: who may not move the train is told so when they press it. A raid
- * reported from a screenshot has a grey "Screenshot feedback" on a row of its own, for anybody
- * who sees the post (spec 7B).
- */
-export function partyControls(party: Party): Row[] {
-  const { id } = party;
-  const rows: Row[] = [
-    {
-      type: ComponentType.ActionRow,
-      components: [
-        partyButton(id, 'maybe', 'Interested', ButtonStyle.Secondary),
-        partyButton(id, 'join', 'Join', ButtonStyle.Primary),
-        partyButton(id, 'here', 'Here', ButtonStyle.Success),
-        ...(isRaid(party) ? [partyButton(id, 'done', 'Done', ButtonStyle.Secondary)] : []),
-        partyButton(id, 'leave', 'Leave', ButtonStyle.Danger),
-      ],
-    },
-    {
-      type: ComponentType.ActionRow,
-      components: [
-        partyButton(id, 'less', '−1', ButtonStyle.Secondary),
-        partyButton(id, 'more', '+1', ButtonStyle.Secondary),
-        ...(remoteAllowed(party)
-          ? [partyButton(id, 'remote', 'Remote / in person', ButtonStyle.Secondary)]
-          : []),
-        // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
-        ...(isRaid(party) && party.hatchTime === null
-          ? [partyButton(id, 'time', 'Set time', ButtonStyle.Primary)]
-          : []),
-      ],
-    },
-  ];
-  if (party.groups.length > 1) {
-    rows.push({
-      type: ComponentType.ActionRow,
-      components: party.groups.map((group) =>
-        partyButton(id, 'group', groupLabel(party, group), ButtonStyle.Secondary, [group.id]),
-      ),
-    });
-  }
-  // Only a kept screenshot can be shown.
-  if (isRaid(party) && party.raid.screenshot?.id) {
-    rows.push({
-      type: ComponentType.ActionRow,
-      components: [partyButton(id, 'shot', SCREENSHOT_FEEDBACK, ButtonStyle.Secondary)],
-    });
-  }
-  if (isTrain(party)) {
-    rows.push({
-      type: ComponentType.ActionRow,
-      components: [partyButton(id, 'move', MOVE_TRAIN_LABEL, ButtonStyle.Secondary)],
-    });
-  }
-  return rows;
-}
-
 /** The label of the button of a raid's post that shows the screenshot it was reported from. */
 export const SCREENSHOT_FEEDBACK = 'Screenshot feedback';
 
 /** The label of the button of a train's post that opens the panel to move it. */
 export const MOVE_TRAIN_LABEL = 'Move train…';
 
-/**
- * The controls of a post for a copy of its message that invites members elsewhere to sign up
- * (a train in the channel of another region it stops in): all of them but the row of "Move
- * train…". A train is moved from its post, by who is there; the copy is for getting in.
- */
-export function invitationControls(rows: readonly Row[]): Row[] {
-  const moves = (row: Row): boolean =>
-    row.components.some(
-      (control) => 'custom_id' in control && decodeCustomId(control.custom_id)?.action === 'move',
-    );
-  return rows.filter((row) => !moves(row));
-}
-
 /**
  * The question to members who were present when somebody of their group completed the raid, with
  * its two answers. The members are named as mentions, as many as fit; whom it may ping is the
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 869684df98874f873e93fc5e1168632d4c4d728b..733a25cd2f61b376a4a7a70810a533a3562a7bee 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -3,9 +3,8 @@ import {
   type APIButtonComponent,
   type APIComponentInContainer,
   type APIEmbed,
-  type APIEmbedField,
 } from 'discord.js';
-import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
+import type { V2Message } from '../discord/party-gateway.js';
 import {
   headCount,
   membersWhere,
@@ -16,7 +15,7 @@ import {
 } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { joinGroupButton, statusButton, type ShownStatus } from './party-controls.js';
-import { count, LIMITS, memberName, plain, timestamp, truncate } from './text.js';
+import { count, memberName, plain, timestamp } from './text.js';
 import { actionRow, container, section, separator, textDisplay, thumbnail } from './v2.js';
 
 /** The names of the forum tags a post can carry (spec 5.1). At most five are applied. */
@@ -36,7 +35,7 @@ export const FORUM_TAGS = [
 export type ForumTag = (typeof FORUM_TAGS)[number];
 
 /** A lobby holds this many trainers; a bigger group of a raid is told to split. */
-const LOBBY_SIZE = 20;
+export const LOBBY_SIZE = 20;
 
 /** The colour of the post of a party that is over, whatever its kind. */
 export const ENDED_COLOUR = 0xe74c3c;
@@ -73,12 +72,26 @@ export interface RenderedPost {
   title: string;
   /** Names of the tags to apply. */
   tags: ForumTag[];
-  embed: APIEmbed;
   /**
-   * The whole first message, the one that is sent and edited: the embed and the controls. This
-   * is the only place that builds it.
+   * The post laid out: what its other forms are made of (`postMessage`): without its picture,
+   * without its controls, a copy in another channel.
    */
-  message: ClassicMessage;
+  layout: PostLayout;
+  /**
+   * The whole first message, the one that is sent and edited: `postMessage(layout)`, a
+   * components-v2 message. This is the only place that builds it.
+   */
+  message: V2Message;
+  /**
+   * The party as a direct message shows it below its sentence: an embed (a v2 message cannot
+   * carry the sentence), with what the post says but no controls.
+   */
+  card: APIEmbed;
+}
+
+/** The post of a party, its message made of its layout. */
+export function renderedPost(post: Omit<RenderedPost, 'message'>): RenderedPost {
+  return { ...post, message: postMessage(post.layout) };
 }
 
 /** Runs of white space become one space and the ends are trimmed: Discord keeps titles so. */
@@ -145,127 +158,6 @@ export function inShownOrder(party: Party, memberIds: readonly string[]): string
     .map(({ id }) => id);
 }
 
-export interface GroupFieldOptions {
-  /** The party has only this group: the field is called "Trainers" unless the group has a label. */
-  single: boolean;
-  /** Tell a group that is bigger than a lobby to split up: for a raid. */
-  lobby: boolean;
-  /** The room the value may take; at most, and by default, what a field holds. */
-  limit?: number;
-}
-
-/**
- * The field of one group: the trainers of a party, or of one of the groups of a raid. The lists
- * of Here, Coming and Interested share the room that is left (`limit`, at most 1024) after the
- * meeting line and the lobby note: when they do not all fit, the longest list is shortened
- * first, one trainer at a time from its end, and says how many it left out. Even with every list
- * cut down to that count the value can exceed a very small `limit`; it is then as short as it
- * can be.
- */
-export function groupField(
-  view: TrainersView,
-  group: PartyGroup,
-  options: GroupFieldOptions,
-): APIEmbedField {
-  const { party, emoji } = view;
-  const { single, lobby, limit = LIMITS.fieldValue } = options;
-  const heads = headCount(party, group.id);
-  const label = group.label ? `: ${plain(group.label)}` : '';
-  const name = truncate(
-    `${single && !group.label ? 'Trainers' : `Group ${group.id}${label}`} (${heads})`,
-    LIMITS.fieldName,
-  );
-  const lines: string[] = [];
-  if (group.startTime !== undefined) {
-    lines.push(`Meeting at ${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`);
-  }
-  if (lobby && heads > LOBBY_SIZE) {
-    lines.push(`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`);
-  }
-  const kinds: [string, (attendee: Attendee) => boolean][] = [
-    ['Here', (a) => a.status === PartyStatus.Present || a.status === PartyStatus.CompletePending],
-    ['Coming', (a) => a.status === PartyStatus.Coming],
-    ['Interested', (a) => a.status === PartyStatus.Interested],
-  ];
-  const sections: { title: string; texts: string[]; shown: number }[] = [];
-  for (const [title, belongs] of kinds) {
-    const members = inShownOrder(
-      party,
-      membersWhere(party, (a) => a.group === group.id && belongs(a)),
-    );
-    if (members.length === 0) continue;
-    const texts = attendeeTexts(party, members, emoji);
-    sections.push({ title, texts, shown: texts.length });
-  }
-  const sectionLine = (section: (typeof sections)[number]): string => {
-    const kept = section.texts.slice(0, section.shown);
-    const left = section.texts.length - section.shown;
-    if (left > 0) kept.push(`…and ${left} more`);
-    return `**${section.title}** ${kept.join(', ')}`;
-  };
-  const build = (): string => {
-    const all = [...lines, ...sections.map(sectionLine)];
-    return all.length > 0 ? all.join('\n') : 'Nobody yet.';
-  };
-  let value = build();
-  while (value.length > limit) {
-    let longest: (typeof sections)[number] | undefined;
-    for (const section of sections) {
-      if (
-        section.shown > 0 &&
-        (!longest || sectionLine(section).length > sectionLine(longest).length)
-      ) {
-        longest = section;
-      }
-    }
-    if (!longest) break;
-    longest.shown--;
-    value = build();
-  }
-  // Not reachable (the lines are short), but a value Discord would refuse is the worse failure.
-  return { name, value: truncate(value, LIMITS.fieldValue) };
-}
-
-/** A field whose attendee list can be made shorter: `shrink(limit)` is the field for that room. */
-export interface ShrinkableField {
-  field: APIEmbedField;
-  shrink?: (limit: number) => APIEmbedField;
-  /** Fields of a lower rank are shortened first. */
-  rank: number;
-}
-
-function embedSize(title: string, description: string, fields: readonly ShrinkableField[]): number {
-  let size = title.length + description.length;
-  for (const { field } of fields) size += field.name.length + field.value.length;
-  return size;
-}
-
-/**
- * Shortens the attendee lists until title, description and fields together fit what Discord
- * counts for one embed. The longest group field gives way first, the Done field last; no field
- * is dropped.
- */
-export function fitEmbed(title: string, description: string, fields: ShrinkableField[]): void {
-  const exhausted = new Set<ShrinkableField>();
-  for (let over = embedSize(title, description, fields) - LIMITS.embedTotal; over > 0;) {
-    const open = fields.filter((f) => f.shrink && !exhausted.has(f));
-    const rank = Math.min(...open.map((f) => f.rank));
-    const tier = open
-      .filter((f) => f.rank === rank)
-      .sort((a, b) => b.field.value.length - a.field.value.length);
-    const top = tier[0];
-    if (!top?.shrink) break;
-    const current = top.field.value.length;
-    const ties = tier.filter((f) => f.field.value.length === current).length;
-    const next = tier.find((f) => f.field.value.length < current)?.field.value.length ?? 0;
-    const step = Math.min(over, Math.max(current - next, Math.ceil(over / ties)));
-    const shorter = top.shrink(current - step);
-    if (shorter.value.length >= current) exhausted.add(top);
-    else top.field = shorter;
-    over = embedSize(title, description, fields) - LIMITS.embedTotal;
-  }
-}
-
 /** Discord takes at most this many components in one message, every nested one counted. */
 export const MAX_COMPONENTS = 40;
 
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 8428b38dcae98b94fb05617495129c309bfb1d9e..4d104f846127cbf29f0e1f8079482389e1fed1bc 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -1,10 +1,17 @@
 import type { APIEmbed } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { iconsFixture } from '../../test/support/game-data.js';
-import { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
-import { partyControls } from './party-controls.js';
-import { catalogueFixture } from '../../test/support/game-data.js';
+import { expectSendable } from '../../test/support/post-limits.js';
+import { catalogueFixture, iconsFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
+import {
+  accentOf,
+  buttonLabels,
+  buttonsOf,
+  componentCount,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 import {
   ALICE,
   at,
@@ -20,16 +27,27 @@ import {
 } from '../../test/support/parties.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
 import type { Attendee, RaidParty } from '../domain/party/party.js';
-import { FORUM_TAGS } from './party-post.js';
-import { UNCERTAIN_TIME } from './raid-post.js';
 import { setBoss, setHatchTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
+import { PokemonIcons } from '../domain/pogo/pokemon-icons.js';
 import {
+  ENDED_COLOUR,
+  FORUM_TAGS,
+  layoutTextLength,
+  LEAD_ROOM,
+  MAX_COMPONENTS,
+  postMessage,
+  TEXT_BUDGET,
+  type RenderedPost,
+} from './party-post.js';
+import {
+  gymMapsUrl,
   raidTags,
   raidTitle,
   renderRaidPost,
   shownAutoset,
   shownBoss,
+  UNCERTAIN_TIME,
   type PostGym,
   type RaidPostView,
 } from './raid-post.js';
@@ -214,106 +232,63 @@ describe('raidTitle and raidTags', () => {
   });
 });
 
+/** What a test reads of a post: its title, tags, colour, picture, texts and buttons. */
+function shown(post: RenderedPost) {
+  return {
+    title: post.title,
+    tags: post.tags,
+    accent: accentOf(post.message),
+    picture: thumbnailOf(post.message),
+    texts: textDisplays(post.message),
+    buttons: buttonsOf(post.message).map(
+      (button) =>
+        `${button.emoji ?? ''} ${button.label ?? ''} ${button.customId ?? button.url ?? ''}`,
+    ),
+  };
+}
+
+/** The lines of the first block of a post: the gym, the raid, its times. */
+function header(post: RenderedPost): string[] {
+  return textDisplays(post.message)[0]?.split('\n') ?? [];
+}
+
+/** The text display of a post that starts so (a heading), or undefined. */
+function block(post: RenderedPost, start: string): string | undefined {
+  return textDisplays(post.message).find((text) => text.startsWith(start));
+}
+
 describe('renderRaidPost', () => {
   it('shows an egg with its times and who is interested', () => {
-    expect(renderRaidPost(view(egg))).toMatchInlineSnapshot(`
+    expect(shown(renderRaidPost(view(egg)))).toMatchInlineSnapshot(`
       {
-        "embed": {
-          "color": 15844367,
-          "description": "**T5 egg**
-      Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.
-      Reported by <@200000000000000001>.",
-          "fields": [
-            {
-              "name": "Trainers (1)",
-              "value": "**Interested** <@200000000000000001>",
-            },
-          ],
-          "title": "The Stacks",
-          "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
-        },
-        "message": {
-          "components": [
-            {
-              "components": [
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:maybe",
-                  "label": "Interested",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:join",
-                  "label": "Join",
-                  "style": 1,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:here",
-                  "label": "Here",
-                  "style": 3,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:done",
-                  "label": "Done",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:leave",
-                  "label": "Leave",
-                  "style": 4,
-                  "type": 2,
-                },
-              ],
-              "type": 1,
-            },
-            {
-              "components": [
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:less",
-                  "label": "−1",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:more",
-                  "label": "+1",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:remote",
-                  "label": "Remote / in person",
-                  "style": 2,
-                  "type": 2,
-                },
-              ],
-              "type": 1,
-            },
-          ],
-          "embeds": [
-            {
-              "color": 15844367,
-              "description": "**T5 egg**
-      Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.
-      Reported by <@200000000000000001>.",
-              "fields": [
-                {
-                  "name": "Trainers (1)",
-                  "value": "**Interested** <@200000000000000001>",
-                },
-              ],
-              "title": "The Stacks",
-              "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
-            },
-          ],
-        },
+        "accent": 15844367,
+        "buttons": [
+          "🤔 Interested party:00000000-0000-4000-8000-000000000001:maybe",
+          "🏃 Join party:00000000-0000-4000-8000-000000000001:join",
+          "✅ Here party:00000000-0000-4000-8000-000000000001:here",
+          "🎉 Done party:00000000-0000-4000-8000-000000000001:done",
+          "👋 Leave party:00000000-0000-4000-8000-000000000001:leave",
+          "⬇️ −1 party:00000000-0000-4000-8000-000000000001:less",
+          "⬆️ +1 party:00000000-0000-4000-8000-000000000001:more",
+          "📡 Remote party:00000000-0000-4000-8000-000000000001:remote",
+          "🗺️ Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
+        ],
+        "picture": undefined,
         "tags": [
           "Egg",
           "T5",
         ],
+        "texts": [
+          "### [The Stacks](https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05)
+      **Level 5 raid** (egg)
+      Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.",
+          "**Interested (1)**
+      <@200000000000000001>",
+          "**Coming (0)**",
+          "**Present (0)**",
+          "**Complete (0)**",
+          "-# Reported by <@200000000000000001>",
+        ],
         "title": "T5 egg · The Stacks",
       }
     `);
@@ -333,186 +308,111 @@ describe('renderRaidPost', () => {
       groups: [{ id: 'A', label: 'park *side*', startTime: at('2026-10-13T14:45') }, { id: 'B' }],
       defaultGroupId: 'B',
     };
-    expect(renderRaidPost(view(party, { now: at('2026-10-13T14:40') }))).toMatchInlineSnapshot(`
+    const post = renderRaidPost(view(party, { now: at('2026-10-13T14:40') }));
+    expect(shown(post)).toMatchInlineSnapshot(`
       {
-        "embed": {
-          "color": 3066993,
-          "description": "**T5 raid** against **Yveltal** ✨
-      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
-      Reported by <@200000000000000001>.",
-          "fields": [
-            {
-              "name": "Boss",
-              "value": "**Weak to** Rock, Electric, Ice, Fairy
-      **Catch CP** 2073–2160, boosted 2591–2701 (Windy, Fog)
-      **Moves** Snarl / ????",
-            },
-            {
-              "name": "Group A: park \\*side\\* (5)",
-              "value": "Meeting at <t:1791917100:t> (<t:1791917100:R>)
-      **Here** <@200000000000000002> +2, <@200000000000000009>
-      **Interested** <@200000000000000001>",
-            },
-            {
-              "name": "Group B (1)",
-              "value": "**Coming** <@200000000000000003> 🛰️",
-            },
-            {
-              "name": "Done (1)",
-              "value": "<@200000000000000004>",
-            },
-          ],
-          "thumbnail": {
-            "url": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
-          },
-          "title": "The Stacks",
-          "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
-        },
-        "message": {
-          "components": [
-            {
-              "components": [
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:maybe",
-                  "label": "Interested",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:join",
-                  "label": "Join",
-                  "style": 1,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:here",
-                  "label": "Here",
-                  "style": 3,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:done",
-                  "label": "Done",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:leave",
-                  "label": "Leave",
-                  "style": 4,
-                  "type": 2,
-                },
-              ],
-              "type": 1,
-            },
-            {
-              "components": [
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:less",
-                  "label": "−1",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:more",
-                  "label": "+1",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:remote",
-                  "label": "Remote / in person",
-                  "style": 2,
-                  "type": 2,
-                },
-              ],
-              "type": 1,
-            },
-            {
-              "components": [
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:group:A",
-                  "label": "A: park *side* (5)",
-                  "style": 2,
-                  "type": 2,
-                },
-                {
-                  "custom_id": "party:00000000-0000-4000-8000-000000000001:group:B",
-                  "label": "Group B (1)",
-                  "style": 2,
-                  "type": 2,
-                },
-              ],
-              "type": 1,
-            },
-          ],
-          "embeds": [
-            {
-              "color": 3066993,
-              "description": "**T5 raid** against **Yveltal** ✨
-      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
-      Reported by <@200000000000000001>.",
-              "fields": [
-                {
-                  "name": "Boss",
-                  "value": "**Weak to** Rock, Electric, Ice, Fairy
-      **Catch CP** 2073–2160, boosted 2591–2701 (Windy, Fog)
-      **Moves** Snarl / ????",
-                },
-                {
-                  "name": "Group A: park \\*side\\* (5)",
-                  "value": "Meeting at <t:1791917100:t> (<t:1791917100:R>)
-      **Here** <@200000000000000002> +2, <@200000000000000009>
-      **Interested** <@200000000000000001>",
-                },
-                {
-                  "name": "Group B (1)",
-                  "value": "**Coming** <@200000000000000003> 🛰️",
-                },
-                {
-                  "name": "Done (1)",
-                  "value": "<@200000000000000004>",
-                },
-              ],
-              "thumbnail": {
-                "url": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
-              },
-              "title": "The Stacks",
-              "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
-            },
-          ],
-        },
+        "accent": 3066993,
+        "buttons": [
+          "🏃 Join A party:00000000-0000-4000-8000-000000000001:group:A",
+          "🏃 Join B party:00000000-0000-4000-8000-000000000001:group:B",
+          "🤔 Interested party:00000000-0000-4000-8000-000000000001:maybe",
+          "✅ Here party:00000000-0000-4000-8000-000000000001:here",
+          "🎉 Done party:00000000-0000-4000-8000-000000000001:done",
+          "👋 Leave party:00000000-0000-4000-8000-000000000001:leave",
+          "⬇️ −1 party:00000000-0000-4000-8000-000000000001:less",
+          "⬆️ +1 party:00000000-0000-4000-8000-000000000001:more",
+          "📡 Remote party:00000000-0000-4000-8000-000000000001:remote",
+          "🗺️ Map https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
+        ],
+        "picture": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
         "tags": [
           "Hatched",
           "T5",
         ],
+        "texts": [
+          "### [The Stacks](https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05)
+      **Level 5 raid against Yveltal** ✨
+      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.",
+          "**Weaknesses** Rock, Electric, Ice, Fairy
+      **Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)
+      **Moveset** Snarl / ????",
+          "**Group A: park \\*side\\*** · 5 trainers · meeting at <t:1791917100:t>
+      Interested (1): <@200000000000000001>
+      Present (4): <@200000000000000002> +2, <@200000000000000009>",
+          "**Group B** · 1 trainer
+      Coming (1): <@200000000000000003> 🛰️",
+          "**Complete (1)**
+      <@200000000000000004>",
+          "-# Reported by <@200000000000000001>",
+        ],
         "title": "Yveltal · The Stacks",
       }
     `);
+    // The card of a direct message says the same as an embed, without controls.
+    expect(post.card).toMatchInlineSnapshot(`
+      {
+        "color": 3066993,
+        "description": "**Level 5 raid against Yveltal** ✨
+      Hatched at <t:1791916200:t>. Ends <t:1791918900:R>, at <t:1791918900:t>.
+      Reported by <@200000000000000001>.",
+        "fields": [
+          {
+            "name": "Boss",
+            "value": "**Weaknesses** Rock, Electric, Ice, Fairy
+      **Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)
+      **Moveset** Snarl / ????",
+          },
+          {
+            "name": "Group A: park \\*side\\* (5)",
+            "value": "Meeting at <t:1791917100:t> (<t:1791917100:R>)
+      **Present** <@200000000000000002> +2, <@200000000000000009>
+      **Interested** <@200000000000000001>",
+          },
+          {
+            "name": "Group B (1)",
+            "value": "**Coming** <@200000000000000003> 🛰️",
+          },
+          {
+            "name": "Complete (1)",
+            "value": "<@200000000000000004>",
+          },
+        ],
+        "thumbnail": {
+          "url": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
+        },
+        "title": "The Stacks",
+        "url": "https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05",
+      }
+    `);
   });
 
   it('shows an ended raid without times as over, and an anonymous report without the reporter', () => {
     const raid = testRaid({ anonymous: true, boss: { name: 'Newmon' } });
     const post = renderRaidPost(view(raid, { now: PARTY_NOW + 50 * MINUTE }));
     expect(post.tags).toEqual(['Ended', 'T5']);
-    expect(post.embed.description).toBe('**T5 raid** against **Newmon**\nThis raid is over.');
+    expect(header(post).slice(1)).toEqual([
+      '**Level 5 raid against Newmon**',
+      'This raid is over.',
+    ]);
     // A boss the game master does not know has no types, CP or moves to show.
-    expect(post.embed.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
+    expect(textOf(post.message)).not.toContain('Weaknesses');
+    expect(textOf(post.message)).not.toContain('Reported by');
+    expect(accentOf(post.message)).toBe(ENDED_COLOUR);
   });
 
   it('shows an egg as the game shows the egg, also when its boss is known, and a hatched raid as its boss', () => {
     const picture = 'https://example.test/raid_egg_2_icon.png';
-    const shown = (party: RaidParty, now = PARTY_NOW) =>
-      renderRaidPost(view(party, { now, eggPicture: picture })).embed.thumbnail?.url;
-    expect(shown(egg)).toBe(picture);
+    const pictured = (party: RaidParty, now = PARTY_NOW) =>
+      thumbnailOf(renderRaidPost(view(party, { now, eggPicture: picture })).message);
+    expect(pictured(egg)).toBe(picture);
     const named = setBoss(
       egg,
       { tier: { level: 'T5', shadow: false }, boss: { key: 'yveltal' } },
       rules,
       PARTY_NOW,
     ).party;
-    expect(shown(named)).toBe(picture);
-    expect(shown(named, at('2026-10-13T14:40'))).not.toBe(picture);
+    expect(pictured(named)).toBe(picture);
+    expect(pictured(named, at('2026-10-13T14:40'))).not.toBe(picture);
   });
 
   it('says when the times are a guess from a screenshot, until they are set or the raid is over', () => {
@@ -521,8 +421,8 @@ describe('renderRaidPost', () => {
       raid: { ...egg.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
     };
     const lines = (party: RaidParty, now = PARTY_NOW) =>
-      renderRaidPost(view(party, { now })).embed.description?.split('\n') ?? [];
-    expect(lines(guessed)[2]).toBe(UNCERTAIN_TIME);
+      header(renderRaidPost(view(party, { now })));
+    expect(lines(guessed)[3]).toBe(UNCERTAIN_TIME);
     const sure: RaidParty = {
       ...guessed,
       raid: { ...guessed.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false } },
@@ -532,69 +432,106 @@ describe('renderRaidPost', () => {
   });
 
   it('names the reporter by the name the party has, and by a mention when it has none', () => {
-    const described = (party: RaidParty) => renderRaidPost(view(party)).embed.description;
-    expect(described(testRaid())).toContain(`Reported by <@${REPORTER}>.`);
+    const reported = (party: RaidParty) => block(renderRaidPost(view(party)), '-# Reported by');
+    expect(reported(testRaid())).toBe(`-# Reported by <@${REPORTER}>`);
     // Not signed up: the name kept with the party. Signed up: the newer one of their record.
     const unlisted: RaidParty = { ...testRaid(), attendees: {}, makerName: 'Rae *the* Reporter' };
-    expect(described(unlisted)).toContain('Reported by Rae \\*the\\* Reporter.');
+    expect(reported(unlisted)).toBe(`-# Reported by **Rae \\*the\\* Reporter** (<@${REPORTER}>)`);
     const listed = withAttendees(
       { ...testRaid(), makerName: 'Old' },
       { [REPORTER]: { name: 'Rae' } },
     );
-    expect(described(listed)).toContain('Reported by Rae.');
-    expect(JSON.stringify(renderRaidPost(view(listed)).embed)).not.toContain(REPORTER);
+    expect(reported(listed)).toBe(`-# Reported by **Rae** (<@${REPORTER}>)`);
+    // The card names members by name alone.
+    expect(renderRaidPost(view(listed)).card.description).toContain('Reported by Rae.');
+    expect(JSON.stringify(renderRaidPost(view(listed)).card)).not.toContain(REPORTER);
   });
 
   it('says what an egg will hatch as when that is certain, with that boss its picture', () => {
     const hatchesAs = shownBoss(yveltal, catalogue, bosses);
     const post = renderRaidPost(view(egg, { hatchesAs }));
     // Said once: by the heading of the block under it (Matt, 2026-10-11).
-    expect(post.embed.description?.split('\n')[0]).toBe('**T5 egg**');
-    expect(post.embed.thumbnail?.url).toMatch(/pm717/);
-    expect(post.embed.fields?.[0]?.name).toBe('Hatches as Yveltal');
+    expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
+    expect(thumbnailOf(post.message)).toMatch(/pm717/);
+    const about = block(post, '**Hatches as Yveltal** ✨');
+    expect(about).toContain('**Weaknesses**');
     // The moves of a boss that is not there yet are not shown.
-    expect(post.embed.fields?.[0]?.value).not.toContain('Moves');
+    expect(about).not.toContain('Moveset');
+    expect(post.card.fields?.[0]?.name).toBe('Hatches as Yveltal');
   });
 
-  it('says in the first line what an egg hatches as when there is no block to say it', () => {
+  it('says what an egg hatches as also when nothing more is known of that boss', () => {
     const post = renderRaidPost(view(egg, { hatchesAs: { name: 'New*mon', shiny: false } }));
-    expect(post.embed.description?.split('\n')[0]).toBe(
-      '**T5 egg**, which hatches as **New\\*mon**',
-    );
-    expect(post.embed.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
+    expect(header(post)[1]).toBe('**Level 5 raid** (egg)');
+    expect(block(post, '**Hatches as')).toBe('**Hatches as New\\*mon**');
+    // The card has no field to head, and says it under the first line.
+    expect(post.card.description?.split('\n')[1]).toBe('**Hatches as New\\*mon**');
+    expect(post.card.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
   });
 
   it('shows an egg whose boss was named as an egg until it hatches', () => {
     const before = renderRaidPost(view(yveltal));
     expect(before.title).toBe('Yveltal · The Stacks');
-    expect(before.embed.description?.split('\n')[0]).toBe('**T5 egg**');
-    expect(before.embed.fields?.[0]?.name).toBe('Hatches as Yveltal');
+    expect(header(before)[1]).toBe('**Level 5 raid** (egg)');
     // Moves nobody knows are not asked for before there is a boss to look at.
-    expect(before.embed.fields?.[0]?.value).not.toContain('Moves');
+    expect(block(before, '**Hatches as Yveltal**')).not.toContain('Moveset');
     const known = { ...yveltal, raid: { ...yveltal.raid, chargedMove: 'DARK_PULSE' } };
-    expect(renderRaidPost(view(known)).embed.fields?.[0]?.value).toContain(
-      '**Moves** ???? / Dark Pulse',
+    expect(block(renderRaidPost(view(known)), '**Hatches as Yveltal**')).toContain(
+      '**Moveset** ???? / Dark Pulse',
     );
     const hatched = renderRaidPost(view(yveltal, { now: at('2026-10-13T14:31') }));
-    expect(hatched.embed.description?.split('\n')[0]).toBe('**T5 raid** against **Yveltal** ✨');
-    expect(hatched.embed.fields?.[0]?.name).toBe('Boss');
-    expect(hatched.embed.fields?.[0]?.value).toContain('**Moves** ???? / ????');
+    expect(header(hatched)[1]).toBe('**Level 5 raid against Yveltal** ✨');
+    expect(block(hatched, '**Weaknesses**')).toContain('**Moveset** ???? / ????');
+    expect(hatched.card.fields?.[0]?.name).toBe('Boss');
   });
 
   it('hides the moves line while no move is known when the setting says so', () => {
-    const quiet = renderRaidPost(view(yveltal, { showUnknownMoves: false }));
-    expect(quiet.embed.fields?.[0]?.value).not.toContain('Moves');
+    const hatched = at('2026-10-13T14:31');
+    const quiet = renderRaidPost(view(yveltal, { showUnknownMoves: false, now: hatched }));
+    expect(textOf(quiet.message)).not.toContain('Moveset');
     const known = { ...yveltal, raid: { ...yveltal.raid, chargedMove: 'DARK_PULSE' } };
     expect(
-      renderRaidPost(view(known, { showUnknownMoves: false })).embed.fields?.[0]?.value,
-    ).toContain('**Moves** ???? / Dark Pulse');
+      textOf(renderRaidPost(view(known, { showUnknownMoves: false, now: hatched })).message),
+    ).toContain('**Moveset** ???? / Dark Pulse');
+  });
+
+  it('shows types and weather by the emoji of the game icons, and in words where one is missing', () => {
+    const icons = new Map([
+      ['rock', '<:rock:1>'],
+      ['electric', '<:electric:2>'],
+      ['ice', '<:ice:3>'],
+      ['fairy', '<:fairy:4>'],
+      ['windy', '<:windy:5>'],
+      ['fog', '<:fog:6>'],
+    ]);
+    const hatched = at('2026-10-13T14:31');
+    const facts = (names: Map<string, string>) =>
+      block(
+        renderRaidPost(
+          view(yveltal, { now: hatched, emoji: { ...emoji, icon: (name) => names.get(name) } }),
+        ),
+        '**Weaknesses**',
+      )?.split('\n');
+    expect(facts(icons)?.slice(0, 2)).toEqual([
+      '**Weaknesses** <:rock:1> <:electric:2> <:ice:3> <:fairy:4>',
+      '**Catch CP** 2073–2160 · 2591–2701 <:windy:5> <:fog:6>',
+    ]);
+    const fewer = new Map([...icons].filter(([name]) => name !== 'fog' && name !== 'ice'));
+    expect(facts(fewer)?.slice(0, 2)).toEqual([
+      '**Weaknesses** Rock, Electric, Ice, Fairy',
+      '**Catch CP** 2073–2160 · 2591–2701 (Windy, Fog)',
+    ]);
   });
 
   it('tells about the gym: that it is an elite raid gym, and its notice as plain text', () => {
     const about = (gym: Partial<PostGym>, party = egg) =>
-      renderRaidPost(view(party, { gym: { ...library!, ...gym } })).embed.fields?.find(
-        (field) => field.name === 'About this gym',
-      )?.value;
+      block(
+        renderRaidPost(view(party, { gym: { ...library!, ...gym } })),
+        '**Location Information**',
+      )
+        ?.split('\n')
+        .slice(1)
+        .join('\n');
     expect(about({})).toBeUndefined();
     expect(about({ taggedEx: true })).toBe('This is an elite raid gym.');
     expect(about({ taggedEx: true, confirmedEx: true })).toBe('This is an elite raid gym.');
@@ -616,23 +553,20 @@ describe('renderRaidPost', () => {
         },
       }),
     );
-    expect(post.embed.fields?.find((field) => field.name === 'About this gym')?.value).toBe(
-      'This is an elite raid gym.\nPark closes at \\*dusk\\*.\n\nUse the east gate.\n\\# Not a heading',
+    expect(block(post, '**Location Information**')).toBe(
+      '**Location Information**\nThis is an elite raid gym.\nPark closes at \\*dusk\\*.\n\nUse the east gate.\n\\# Not a heading',
     );
   });
 
-  it('adds no field for a notice that is empty once it is made plain', () => {
+  it('adds no block for a notice that is empty once it is made plain', () => {
     const post = renderRaidPost(view(egg, { gym: { ...library!, notice: '     ' } }));
-    expect(post.embed.fields?.some((field) => field.name === 'About this gym')).toBe(false);
-    for (const field of post.embed.fields ?? []) expect(field.value).not.toBe('');
+    expect(block(post, '**Location Information**')).toBeUndefined();
+    for (const text of textDisplays(post.message)) expect(text.trim()).not.toBe('');
   });
 
-  it('holds the whole message in one place: the embed and the controls', () => {
+  it('holds the whole message in one place: the layout made a message', () => {
     const post = renderRaidPost(view(egg));
-    expect(post.message).toEqual({
-      embeds: [post.embed],
-      components: partyControls(egg),
-    });
+    expect(post.message).toEqual(postMessage(post.layout));
   });
 
   it('marks a trainer with their team and lists by team, then by name', () => {
@@ -644,9 +578,9 @@ describe('renderRaidPost', () => {
       '300000000000000005': { name: 'Abe', team: 'instinct', number: 2, remote: true },
       '300000000000000006': { name: 'Al' },
     });
-    const post = renderRaidPost(view(party));
-    const value = post.embed.fields?.find((f) => f.name.startsWith('Trainers'))?.value;
-    expect(value).toBe('**Coming** Al, bea, <@300000000000000004>, ⚡ Abe +1 🛰️, Yan, 🔥 zed');
+    expect(block(renderRaidPost(view(party)), '**Coming')).toBe(
+      '**Coming (7)**\nAl, bea, <@300000000000000004>, ⚡ Abe +1 🛰️, Yan, 🔥 zed',
+    );
   });
 
   it('orders names as a reader would: accents and capitals do not send a name to the end', () => {
@@ -656,10 +590,9 @@ describe('renderRaidPost', () => {
       '300000000000000003': { name: 'adam' },
       '300000000000000004': { name: 'Émile' },
     });
-    const value = renderRaidPost(view(party)).embed.fields?.find((f) =>
-      f.name.startsWith('Trainers'),
-    )?.value;
-    expect(value).toBe('**Coming** adam, Émile, Émile, zed');
+    expect(block(renderRaidPost(view(party)), '**Coming')).toBe(
+      '**Coming (4)**\nadam, Émile, Émile, zed',
+    );
   });
 
   it("shows a full lobby of twenty with the server's own team emoji, every team among them", () => {
@@ -680,94 +613,212 @@ describe('renderRaidPost', () => {
     }
     const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), many);
     const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams: custom } }));
-    const value = post.embed.fields?.find((f) => f.name.startsWith('Trainers'))?.value ?? '';
+    const value = block(post, '**Coming') ?? '';
     expect(value.match(/trainer \d+/g)).toHaveLength(20);
     expect(value).not.toMatch(/…and \d+ more/);
-    expect(value.length).toBeLessThanOrEqual(1024);
     // Each team's emoji stands once, before the first of its members.
     for (const team of names) expect(value.split(custom[team])).toHaveLength(2);
   });
 
-  it('lists those who are done by team and name as well', () => {
+  it('lists those who completed it by team and name as well', () => {
     const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), {
       '300000000000000001': { name: 'zed', team: 'mystic', status: PartyStatus.Complete },
       '300000000000000002': { name: 'amy', team: 'mystic', status: PartyStatus.Complete },
     });
-    const done = renderRaidPost(view(party)).embed.fields?.find((f) => f.name.startsWith('Done'));
-    expect(done?.value).toBe('❄️ amy, zed');
+    expect(block(renderRaidPost(view(party)), '**Complete')).toBe('**Complete (2)**\n❄️ amy, zed');
   });
 
-  it('warns a group of more than twenty and cuts a list that is too long for its field', () => {
+  it('warns a group of more than twenty trainers to split up', () => {
     const many: Record<string, object> = {};
-    for (let n = 0; n < 120; n++) many[`3000000000000000${String(n).padStart(3, '0')}`] = {};
+    for (let n = 0; n < 300; n++) many[`300000000000000${String(n).padStart(3, '0')}`] = {};
     const post = renderRaidPost(view(withAttendees(egg, many)));
-    const field = post.embed.fields?.find((f) => f.name.startsWith('Trainers'));
-    expect(field?.name).toBe('Trainers (121)');
-    expect(field?.value).toContain('More than 20 trainers');
-    expect(field?.value).toMatch(/…and \d+ more/);
-    expect(field?.value.length).toBeLessThanOrEqual(1024);
+    expect(textDisplays(post.message)).toContain(
+      'More than 20 trainers: a lobby holds 20, so split up.',
+    );
+    // The note stands although the list itself is cut.
+    const value = block(post, '**Coming') ?? '';
+    expect(value).toMatch(/^\*\*Coming \(300\)\*\*\n/);
+    const listed = value.match(/<@3/g)?.length ?? 0;
+    const left = Number(/…and (\d+) more$/.exec(value)?.[1]);
+    expect(left).toBeGreaterThan(0);
+    expect(listed + left).toBe(300);
   });
 
-  it('shows thirty trainers who are all coming in full, since the other lists are empty', () => {
+  it('shows thirty trainers who are all coming in full', () => {
     const post = renderRaidPost(view(withAttendees(egg, trainers(30))));
-    const field = post.embed.fields?.find((f) => f.name.startsWith('Trainers'));
-    expect(field?.name).toBe('Trainers (31)');
-    expect(field?.value).not.toMatch(/…and \d+ more/);
-    expect(field?.value.match(/<@3/g)).toHaveLength(30);
-    expect(field?.value.length).toBeLessThanOrEqual(1024);
+    const value = block(post, '**Coming') ?? '';
+    expect(value).not.toMatch(/…and \d+ more/);
+    expect(value.match(/<@3/g)).toHaveLength(30);
   });
 
-  it('shows as many trainers as fit, and counts the rest, when long emoji fill the field', () => {
+  it('shows as many trainers as the text of a post holds, and counts the rest', () => {
     const remote = '<:pineremote:1234567890123456789>';
-    const party = withAttendees(egg, trainers(30, { remote: true }));
+    const party = withAttendees(egg, trainers(200, { remote: true }));
     const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams } }));
-    const value = post.embed.fields?.find((f) => f.name.startsWith('Trainers'))?.value ?? '';
-    const shown = value.match(/<@3/g)?.length ?? 0;
+    const value = block(post, '**Coming') ?? '';
+    const listed = value.match(/<@3/g)?.length ?? 0;
     const left = Number(/…and (\d+) more/.exec(value)?.[1]);
-    expect(value.length).toBeLessThanOrEqual(1024);
-    expect(shown + left).toBe(30);
-    expect(shown).toBeGreaterThanOrEqual(15);
+    expect(listed + left).toBe(200);
+    expect(listed).toBeGreaterThanOrEqual(50);
+    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     // One more trainer would not have fitted.
-    expect(value.length).toBeGreaterThan(1024 - 60);
+    expect(layoutTextLength(post.layout)).toBeGreaterThan(TEXT_BUDGET - LEAD_ROOM - 80);
   });
 
-  it('keeps the whole embed within the 6000 characters Discord allows', () => {
+  it('keeps within what Discord takes of a message with every part a raid can have', () => {
     const groups = (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
       id,
       label: 'L'.repeat(100),
+      startTime: at('2026-10-13T14:45'),
     }));
-    const statuses = [PartyStatus.Present, PartyStatus.Coming, PartyStatus.Interested];
+    const statuses = [
+      PartyStatus.Present,
+      PartyStatus.Coming,
+      PartyStatus.Interested,
+      PartyStatus.Complete,
+    ];
     const attendees: Record<string, Partial<Attendee>> = {};
     groups.forEach(({ id }, g) => {
       for (let n = 0; n < 60; n++) {
         const memberId = `4${String(g)}0000000000${String(n).padStart(6, '0')}`;
-        attendees[memberId] = { group: id, status: statuses[n % 3] ?? PartyStatus.Coming };
+        attendees[memberId] = {
+          group: id,
+          name: `A rather long display name ${n}`,
+          status: statuses[n % 4] ?? PartyStatus.Coming,
+        };
       }
     });
-    const party: RaidParty = { ...withAttendees(egg, attendees), groups };
-    const gym: PostGym = { ...library!, notice: 'n'.repeat(900) };
-    const embed = renderRaidPost(view(party, { gym })).embed;
-    expect(embedSize(embed)).toBeLessThanOrEqual(6000);
-    const names = (embed.fields ?? []).map((f) => f.name);
-    expect(names.filter((name) => name.startsWith('Group'))).toEqual([
-      `Group A: ${'L'.repeat(100)} (61)`,
-      ...['B', 'C', 'D', 'E'].map((id) => `Group ${id}: ${'L'.repeat(100)} (60)`),
+    // A raid without times (Set time) from a kept screenshot (Screenshot feedback), with a boss
+    // and its picture, at an elite raid gym with a long notice, in five groups.
+    const party: RaidParty = {
+      ...withAttendees(testRaid({ boss: { key: 'yveltal' } }), attendees),
+      raid: {
+        ...testRaid({ boss: { key: 'yveltal' } }).raid,
+        screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false },
+      },
+      groups,
+    };
+    const gym: PostGym = { ...library!, taggedEx: true, notice: 'n'.repeat(900) };
+    const post = renderRaidPost(view(party, { gym, now: at('2026-10-13T14:40') }));
+    expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+    // Every group keeps its heading, label uncut, with its count and meeting time (the
+    // reporter is coming in A).
+    const meeting = `<t:${String(at('2026-10-13T14:45') / 1000)}:t>`;
+    const headings = textDisplays(post.message)
+      .filter((text) => text.startsWith('**Group'))
+      .map((text) => text.split('\n')[0]);
+    expect(headings).toEqual(
+      groups.map(
+        ({ id }) =>
+          `**Group ${id}: ${'L'.repeat(100)}** · ${id === 'A' ? 46 : 45} trainers · meeting at ${meeting}`,
+      ),
+    );
+    expect(buttonLabels(post.message)).toEqual([
+      'Join A',
+      'Join B',
+      'Join C',
+      'Join D',
+      'Join E',
+      'Interested',
+      'Here',
+      'Done',
+      'Leave',
+      '−1',
+      '+1',
+      'Remote',
+      'Map',
+      'Set time',
+      'Screenshot feedback',
     ]);
-    expect(names).toContain('About this gym');
-    for (const field of embed.fields ?? []) expect(field.value.length).toBeLessThanOrEqual(1024);
+    expect(thumbnailOf(post.message)).toMatch(/pm717/);
+    // The card keeps within what Discord takes of an embed.
+    expect(embedSize(post.card)).toBeLessThanOrEqual(6000);
+    // And the fake gateway, as strict as Discord, takes it, and every copy of it.
+    expectSendable(post);
+  });
+
+  it('keeps within those limits with the longest texts that need escaping everywhere', () => {
+    const groups = (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
+      id,
+      label: '*'.repeat(100),
+      startTime: at('2026-10-13T14:45'),
+    }));
+    const attendees: Record<string, Partial<Attendee>> = {};
+    groups.forEach(({ id }, g) => {
+      for (let n = 0; n < 80; n++) {
+        attendees[`4${String(g)}0000000000${String(n).padStart(6, '0')}`] = {
+          group: id,
+          name: `${'_'.repeat(28)}${String(n).padStart(4, '0')}`,
+          status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
+        };
+      }
+    });
+    const party: RaidParty = {
+      ...withAttendees(testRaid({ boss: { key: 'yveltal' } }), {
+        ...attendees,
+        [REPORTER]: { name: '*'.repeat(32) },
+      }),
+      raid: {
+        ...testRaid({ boss: { key: 'yveltal' } }).raid,
+        screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true },
+      },
+      groups,
+      saved: true,
+    };
+    const gym: PostGym = {
+      ...library!,
+      name: '[*]'.repeat(85),
+      nickname: null,
+      taggedEx: true,
+      notice: '<'.repeat(500),
+    };
+    const post = renderRaidPost(view(party, { gym }));
+    expectSendable(post);
+    // The notice is cut to its room; the lists are cut down with a count.
+    expect(textOf(post.message)).toMatch(
+      /\*\*Location Information\*\*\nThis is an elite raid gym\.\n[^\n]*…/,
+    );
+    expect(textOf(post.message)).toMatch(/…and \d+ more/);
   });
 
-  it('puts the gym name through plain() in the embed title, but not in the post title', () => {
-    const gym: PostGym = { ...library!, nickname: null, name: 'M*A*S*H Memorial' };
+  it('keeps within those limits with one group as well', () => {
+    const many: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 400; n++) {
+      many[`5000000000000${String(n).padStart(5, '0')}`] = {
+        name: `Trainer with a long name ${n}`,
+        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
+      };
+    }
+    const party: RaidParty = {
+      ...withAttendees(testRaid({ boss: { key: 'yveltal' } }), many),
+      raid: {
+        ...testRaid().raid,
+        boss: { key: 'yveltal' },
+        screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true },
+      },
+    };
+    const post = renderRaidPost(view(party, { now: at('2026-10-13T14:40') }));
+    expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+    expectSendable(post);
+  });
+
+  it('puts the gym name through plain() in the post, but not in the post title', () => {
+    const gym: PostGym = { ...library!, nickname: null, name: 'M*A*S*H [Memorial]' };
     const post = renderRaidPost(view(egg, { gym }));
-    expect(post.embed.title).toBe('M\\*A\\*S\\*H Memorial');
-    expect(post.title).toBe('T5 egg · M*A*S*H Memorial');
+    expect(header(post)[0]).toBe(`### [M\\*A\\*S\\*H \\[Memorial\\]](${gymMapsUrl(gym)})`);
+    expect(post.card.title).toBe('M\\*A\\*S\\*H [Memorial]');
+    expect(post.title).toBe('T5 egg · M*A*S*H [Memorial]');
   });
 
   it('calls a gym with an empty nickname by its name', () => {
     const gym: PostGym = { ...library!, nickname: '' };
     expect(raidTitle(view(egg, { gym }))).toBe('T5 egg · Pinewood Public Library');
-    expect(renderRaidPost(view(egg, { gym })).embed.title).toBe('Pinewood Public Library');
+    expect(header(renderRaidPost(view(egg, { gym })))[0]).toMatch(
+      /^### \[Pinewood Public Library\]/,
+    );
+    expect(renderRaidPost(view(egg, { gym })).card.title).toBe('Pinewood Public Library');
   });
 
   it('gives the date when the clock time alone would not say which day an egg hatches', () => {
@@ -778,7 +829,7 @@ describe('renderRaidPost', () => {
     const expected =
       `Hatches <t:${hatch / 1000}:R>, at <t:${hatch / 1000}:f>. ` + `Ends at <t:${end / 1000}:f>.`;
     for (const now of [PARTY_NOW, PARTY_NOW + 5 * HOUR]) {
-      expect(renderRaidPost(view(party, { now })).embed.description).toContain(expected);
+      expect(header(renderRaidPost(view(party, { now })))).toContain(expected);
     }
   });
 
@@ -789,19 +840,19 @@ describe('renderRaidPost', () => {
     const party: RaidParty = { ...elite, hatchTime: hatch, endTime: end };
     const dated = `at <t:${hatch / 1000}:f>. Ends at <t:${end / 1000}:f>.`;
     const today = `at <t:${hatch / 1000}:t>. Ends at <t:${end / 1000}:t>.`;
-    const shown = (now: number) => renderRaidPost(view(party, { now })).embed.description;
-    expect(shown(at('2026-10-13T23:59'))).toContain(dated);
-    expect(shown(at('2026-10-14T00:00'))).toContain(today);
-    expect(shown(at('2026-10-14T17:59'))).toContain(today);
+    const times = (now: number, zone = PARTY_ZONE) =>
+      header(renderRaidPost(view(party, { now, zone })))[2];
+    expect(times(at('2026-10-13T23:59'))).toContain(dated);
+    expect(times(at('2026-10-14T00:00'))).toContain(today);
+    expect(times(at('2026-10-14T17:59'))).toContain(today);
     // The day is the one of the settings' time zone, not UTC's.
-    const utc = renderRaidPost(view(party, { now: at('2026-10-13T23:59'), zone: 'UTC' }));
-    expect(utc.embed.description).toContain(today);
+    expect(times(at('2026-10-13T23:59'), 'UTC')).toContain(today);
   });
 
   it('keeps the clock time alone for an egg that hatches within twelve hours of its report', () => {
     const hatch = PARTY_NOW + 12 * HOUR;
     const party: RaidParty = { ...egg, hatchTime: hatch, endTime: hatch + 45 * MINUTE };
-    expect(renderRaidPost(view(party)).embed.description).toContain(
+    expect(header(renderRaidPost(view(party)))).toContain(
       `Hatches <t:${hatch / 1000}:R>, at <t:${hatch / 1000}:t>. Ends at <t:${hatch / 1000 + 2700}:t>.`,
     );
   });
@@ -809,20 +860,22 @@ describe('renderRaidPost', () => {
   it('gives the date of the end of a raid that is over', () => {
     const end = at('2026-10-13T15:15') / 1000;
     const post = renderRaidPost(view(egg, { now: at('2026-10-13T16:00') }));
-    expect(post.embed.description).toContain(`Ended at <t:${end}:f>.`);
+    expect(header(post)).toContain(`Ended at <t:${end}:f>.`);
   });
 
-  it('counts the heads of the Done field, and shows a member’s guests', () => {
+  it('counts the heads of those who completed it, and shows a member’s guests', () => {
     const party = withAttendees(egg, { [CAROL]: { status: PartyStatus.Complete, number: 3 } });
-    const done = renderRaidPost(view(party)).embed.fields?.find((f) => f.name.startsWith('Done'));
-    expect(done).toEqual({ name: 'Done (3)', value: `<@${CAROL}> +2` });
+    expect(block(renderRaidPost(view(party)), '**Complete')).toBe(
+      `**Complete (3)**\n<@${CAROL}> +2`,
+    );
   });
 
   it('marks a double weakness with ×2 and a single one without', () => {
     const dragonite = testRaid({ boss: { key: 'dragonite' } });
-    const value = renderRaidPost(view(dragonite)).embed.fields?.[0]?.value ?? '';
+    const hatched = renderRaidPost(view(dragonite, { now: at('2026-10-13T14:31') }));
+    const value = block(hatched, '**Weaknesses**') ?? '';
     expect(value).toContain('Ice ×2');
-    expect(value).toMatch(/Rock(,|\n)/);
+    expect(value).toContain('Ice ×2, Rock, ');
   });
 
   it('shows a lower catch CP at the bottom of a shadow raid than of the same boss in a plain one', () => {
@@ -831,7 +884,7 @@ describe('renderRaidPost', () => {
         tier: { level: 'T5', shadow },
         boss: { key: 'landorus_incarnate' },
       });
-      const value = renderRaidPost(view(party)).embed.fields?.[0]?.value ?? '';
+      const value = textOf(renderRaidPost(view(party, { now: at('2026-10-13T14:31') })).message);
       return Number(/\*\*Catch CP\*\* (\d+)–/.exec(value)?.[1]);
     };
     expect(minCp(true)).toBeLessThan(minCp(false));
@@ -839,8 +892,10 @@ describe('renderRaidPost', () => {
 
   it('shows a post without its gym when the gym is gone', () => {
     const post = renderRaidPost(view(egg, { gym: undefined }));
-    expect(post.embed.title).toBe('Unknown gym');
-    expect(post.embed).not.toHaveProperty('url');
+    expect(header(post)[0]).toBe('### Unknown gym');
+    expect(buttonLabels(post.message)).not.toContain('Map');
+    expect(post.card.title).toBe('Unknown gym');
+    expect(post.card).not.toHaveProperty('url');
   });
 
   it('has the same result for the same view', () => {
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index f06ab31a5abc19b6f0c12003bdbd556a908b65fd..6c59975c22ae68914e51a02a158033c41f1944d3 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -12,6 +12,7 @@ import {
 import { isEliteGym, raidStage } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
+import { typeWord, WEATHER_ICON, weatherWord } from '../domain/pogo/game-icons.js';
 import {
   pokemonPicture,
   type PictureSource,
@@ -19,25 +20,31 @@ import {
 } from '../domain/pogo/pokemon-icons.js';
 import type { PokemonEntry } from '../domain/pogo/game-master.js';
 import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
-import { raidTierLabel, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
-import { partyControls } from './party-controls.js';
+import { raidTierLabel, raidWords, sameRaidTier, type RaidTier } from '../domain/pogo/raid-tier.js';
+import { fitEmbed, groupField, type ShrinkableField } from './party-card.js';
+import { bottomControls } from './party-controls.js';
 import {
   attendeeTexts,
+  cutText,
   ENDED_COLOUR,
-  fitEmbed,
-  groupField,
+  fittedLayout,
   inShownOrder,
   KEPT_OPEN,
+  renderedPost,
   tidyTitle,
+  trainerBlocks,
+  type Fit,
   type ForumTag,
+  type PostBlock,
   type PostEmoji,
+  type PostLayout,
   type RenderedPost,
-  type ShrinkableField,
 } from './party-post.js';
 import {
   fitItems,
   LIMITS,
   memberName,
+  memberText,
   plain,
   plainLines,
   timestamp,
@@ -167,8 +174,16 @@ export function gymMapsUrl(gym: { lat: number; lon: number }): string {
   return `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`;
 }
 
-function tierWords(tier: RaidTier): string {
-  return raidTierLabel(tier);
+/**
+ * A gym's name, made plain, as the text of a masked link: a bracket in the name would end the
+ * text of the link early. One that is escaped already (an odd run of backslashes stands before
+ * it) stays; after an even run the backslashes escape each other, and the bracket needs one of
+ * its own.
+ */
+export function linkText(gym: PostGym | undefined): string {
+  return plain(gymName(gym)).replace(/(\\*)([[\]])/g, (whole, slashes: string, bracket: string) =>
+    slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
+  );
 }
 
 /** `Yveltal · Big Fountain`, `T5 egg · Big Fountain`, `T5 raid · Big Fountain`. */
@@ -177,7 +192,7 @@ export function raidTitle(view: Pick<RaidPostView, 'party' | 'gym' | 'boss' | 'n
   const stage = raidStage(party, view.now);
   const what = boss
     ? boss.name
-    : `${tierWords(party.raid.tier)} ${stage === 'egg' ? 'egg' : 'raid'}`;
+    : `${raidTierLabel(party.raid.tier)} ${stage === 'egg' ? 'egg' : 'raid'}`;
   // The gym is what tells posts apart, so it is the boss name that gives way.
   const where = truncate(tidyTitle(gymName(view.gym)), 60);
   return tidyTitle(`${truncate(tidyTitle(what), LIMITS.title - where.length - 3)} · ${where}`);
@@ -239,26 +254,41 @@ function timesOf(view: RaidPostView, stage: RaidStage): string {
 }
 
 /**
- * What the game master says about a Pokémon as a raid boss, line by line: what it is weak to,
- * and the CP it is caught with (`shadow`: as a shadow raid boss). The post of a raid and that of
- * a train both show it.
+ * What the game master says about a Pokémon as a raid boss, line by line: what it is weak to
+ * (`×2` after a double weakness), and the CP it is caught with, plain and boosted, and in what
+ * weather (`shadow`: as a shadow raid boss). Types and weather are the game's icons where the
+ * emoji exist, and words where they do not. The post of a raid and that of a train both show
+ * it, and so does the card of a direct message.
  */
 export function bossFacts(
   catalogue: PokemonCatalogue,
   entry: PokemonEntry,
   shadow: boolean,
+  emoji: Pick<PostEmoji, 'icon'>,
 ): string[] {
   const lines: string[] = [];
-  const weaknesses = catalogue
-    .weaknesses(entry)
-    .map((weakness) => `${titleCase(weakness.type)}${weakness.multiplier > 1.6 ? ' ×2' : ''}`);
-  if (weaknesses.length > 0) lines.push(`**Weak to** ${weaknesses.join(', ')}`);
-  const cp = catalogue.raidCatchCp(entry, shadow);
-  const weather = catalogue.boostedIn(entry).map(titleCase).join(', ');
-  lines.push(
-    `**Catch CP** ${cp.min}–${cp.max}, boosted ${cp.minBoosted}–${cp.maxBoosted}` +
-      (weather === '' ? '' : ` (${weather})`),
+  // All by their icons, or all in words, as the weather: a sentence of both reads badly.
+  const types = catalogue.weaknesses(entry);
+  const icons = types.map((weakness) => emoji.icon?.(weakness.type));
+  const byIcon = icons.every((icon) => icon !== undefined);
+  const weaknesses = types.map(
+    (weakness, index) =>
+      `${(byIcon ? icons[index] : undefined) ?? typeWord(weakness.type)}` +
+      `${weakness.multiplier > 1.6 ? ' ×2' : ''}`,
   );
+  if (weaknesses.length > 0) {
+    lines.push(`**Weaknesses** ${weaknesses.join(byIcon ? ' ' : ', ')}`);
+  }
+  const cp = catalogue.raidCatchCp(entry, shadow);
+  const boosted = catalogue.boostedIn(entry);
+  const weatherIcons = boosted.map((weather) => emoji.icon?.(WEATHER_ICON[weather]));
+  const weather =
+    boosted.length === 0
+      ? ''
+      : weatherIcons.every((icon) => icon !== undefined)
+        ? ` ${weatherIcons.join(' ')}`
+        : ` (${boosted.map(weatherWord).join(', ')})`;
+  lines.push(`**Catch CP** ${cp.min}–${cp.max} · ${cp.minBoosted}–${cp.maxBoosted}${weather}`);
   return lines;
 }
 
@@ -269,40 +299,173 @@ export function bossFacts(
 export function gymNotes(gym: PostGym | undefined): string[] {
   const notes: string[] = [];
   if (gym && isEliteGym(gym)) notes.push('This is an elite raid gym.');
-  // A notice of nothing but white space is empty once plain; Discord refuses an empty field
-  // value. It is written as a paragraph (`/gym edit`), and its lines stay lines.
+  // A notice of nothing but white space is empty once plain. It is written as a paragraph
+  // (`/gym edit`), and its lines stay lines.
   const notice = gym?.notice ? plainLines(gym.notice) : '';
   if (notice !== '') notes.push(notice);
   return notes;
 }
 
 /**
- * What is known of a boss, under `title`. `unknownMoves` says whether the moves line is shown
- * while no move is known; the boss an egg will hatch as (not the raid's own) has no moves line.
+ * The room the notes about a gym may take in a post: a notice is at most 500 characters as typed,
+ * and what is left of the text of a post is for the trainers.
  */
-function bossField(
-  view: RaidPostView,
-  boss: ShownBoss,
-  title: string,
-  unknownMoves: boolean,
-): APIEmbedField | undefined {
+const LOCATION_ROOM = 600;
+
+/** The block of a post about the gym it is at, or none (see `gymNotes`). */
+export function locationBlock(gym: PostGym | undefined, fit: Fit): PostBlock[] {
+  const notes = gymNotes(gym).join('\n');
+  if (notes === '') return [];
+  const shown = fit.part((room) => cutText(notes, Math.min(room, LOCATION_ROOM)));
+  return [{ type: 'text', content: `**Location Information**\n${shown}` }];
+}
+
+/** What the post of a raid shows as the raid's stage: the egg until it hatches. */
+function stageOf(view: RaidPostView): RaidStage {
+  return view.closed === undefined ? raidStage(view.party, view.now) : 'ended';
+}
+
+/**
+ * The boss a raid is fought against, once hatched, and the one an egg is expected to hatch as
+ * (named by a member, or certain for its tier). An egg is an egg until it hatches, also when its
+ * boss is known: what it hatches as is said once, by the heading of the block about that boss
+ * (Matt, 2026-10-11).
+ */
+function bosses(view: RaidPostView, stage: RaidStage) {
+  const fought = stage === 'egg' ? undefined : view.boss;
+  const expected = fought ? undefined : (view.boss ?? view.hatchesAs);
+  return { fought, expected };
+}
+
+/** `Level 5 raid against Yveltal ✨`, `Level 5 raid (egg)`. */
+function headline(view: RaidPostView, stage: RaidStage): string {
+  const words = raidWords(view.party.raid.tier);
+  const { fought } = bosses(view, stage);
+  if (fought) {
+    return `**${words} against ${plain(fought.name)}**${fought.shiny ? ` ${view.emoji.shiny}` : ''}`;
+  }
+  return `**${words}**${stage === 'egg' ? ' (egg)' : ''}`;
+}
+
+/**
+ * The moves of the raid's boss, while one is known, or also then when `unknown` says so
+ * (`showUnknownMoves`, for a boss that is there to look at).
+ */
+function movesLine(view: RaidPostView, unknown: boolean): string[] {
   const { catalogue, party } = view;
-  const { entry } = boss;
-  if (!entry) return undefined;
-  const lines = bossFacts(catalogue, entry, party.raid.tier.shadow);
   const { fastMove, chargedMove } = party.raid;
-  if (boss === view.boss && (unknownMoves || fastMove !== null || chargedMove !== null)) {
-    const name = (id: string | null): string => (id && catalogue.move(id)?.name) ?? '????';
-    lines.push(`**Moves** ${name(fastMove)} / ${name(chargedMove)}`);
+  if (!unknown && fastMove === null && chargedMove === null) return [];
+  const name = (id: string | null): string => (id && catalogue.move(id)?.name) ?? '????';
+  return [`**Moveset** ${name(fastMove)} / ${name(chargedMove)}`];
+}
+
+/** What a post or a card says about the boss of a raid (see `bossInfo`). */
+interface BossInfo {
+  /** For an egg: what it hatches as. */
+  hatchesAs?: ShownBoss;
+  lines: string[];
+}
+
+/**
+ * What there is to say about the boss: for a hatched raid what it is weak to, its CP and its
+ * moves; for an egg whose boss is known, what it hatches as, with the same but only the moves a
+ * member already gave (moves nobody knows are not asked for before there is a boss to look at).
+ * Undefined when there is nothing: no boss, or one the game master does not know.
+ */
+function bossInfo(view: RaidPostView, stage: RaidStage): BossInfo | undefined {
+  const { catalogue, party, emoji } = view;
+  const { fought, expected } = bosses(view, stage);
+  const shadow = party.raid.tier.shadow;
+  if (fought) {
+    if (!fought.entry) return undefined;
+    return {
+      lines: [
+        ...bossFacts(catalogue, fought.entry, shadow, emoji),
+        ...movesLine(view, view.showUnknownMoves),
+      ],
+    };
   }
+  if (!expected) return undefined;
+  if (!expected.entry) return { hatchesAs: expected, lines: [] };
   return {
-    name: truncate(title, LIMITS.fieldName),
-    value: truncate(lines.join('\n'), LIMITS.fieldValue),
+    hatchesAs: expected,
+    lines: [
+      ...bossFacts(catalogue, expected.entry, shadow, emoji),
+      // Not for the boss that is only certain for the tier: the moves are the raid's own.
+      ...(expected === view.boss ? movesLine(view, false) : []),
+    ],
   };
 }
 
+/** An egg is shown as the game's egg until it hatches, also when its boss is known. */
+function pictureOf(view: RaidPostView, stage: RaidStage): string | undefined {
+  const { fought, expected } = bosses(view, stage);
+  return (stage === 'egg' ? view.eggPicture : undefined) ?? (fought ?? expected)?.image;
+}
+
+/** `Hatches as Yveltal ✨`. */
+function hatchesAsLine(view: RaidPostView, boss: ShownBoss): string {
+  return `**Hatches as ${plain(boss.name)}**${boss.shiny ? ` ${view.emoji.shiny}` : ''}`;
+}
+
+/** The block about the boss: what it is weak to, its CP and moves, or what an egg hatches as. */
+function bossBlock(view: RaidPostView, stage: RaidStage): PostBlock[] {
+  const info = bossInfo(view, stage);
+  if (!info) return [];
+  const heading = info.hatchesAs ? [hatchesAsLine(view, info.hatchesAs)] : [];
+  return [{ type: 'text', content: [...heading, ...info.lines].join('\n') }];
+}
+
+/**
+ * The post of a raid laid out: the gym (a link to its place) with the raid and its times, and
+ * the boss's or the egg's picture beside them; the boss; what there is to say about the gym; who
+ * comes, with the buttons; the rows of the rest of the controls; who reported it.
+ */
+function raidLayout(view: RaidPostView): PostLayout {
+  const { party, gym } = view;
+  const stage = stageOf(view);
+  const title = gym ? `### [${linkText(gym)}](${gymMapsUrl(gym)})` : `### ${plain(gymName(gym))}`;
+  const header = [
+    title,
+    headline(view, stage),
+    view.closed ?? describeTimes(view, stage),
+    // Not in the last showing of a raid that was closed: that post is archived.
+    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+  ].join('\n');
+  const picture = pictureOf(view, stage);
+  return fittedLayout((fit) => ({
+    accent: STAGE_COLOURS[stage],
+    ...(picture === undefined ? {} : { picture }),
+    blocks: [
+      { type: 'section', content: header, accessory: 'picture' },
+      { type: 'separator' },
+      ...bossBlock(view, stage),
+      { type: 'separator' },
+      ...locationBlock(gym, fit),
+      { type: 'separator' },
+      ...trainerBlocks(view, { complete: true, lobby: true }, fit),
+      { type: 'separator' },
+      {
+        type: 'controls',
+        rows: bottomControls(party, {
+          groups: party.groups.length > 1,
+          ...(gym ? { map: gymMapsUrl(gym) } : {}),
+        }),
+      },
+      ...(party.anonymous
+        ? []
+        : [
+            {
+              type: 'text' as const,
+              content: `-# Reported by ${memberText(memberOf(party, party.createdById))}`,
+            },
+          ]),
+    ],
+  }));
+}
+
 /** The members who completed the raid, as many as fit into `limit`. */
-function doneField(
+function completeField(
   view: RaidPostView,
   limit: number = LIMITS.fieldValue,
 ): APIEmbedField | undefined {
@@ -314,42 +477,34 @@ function doneField(
   if (members.length === 0) return undefined;
   const heads = members.reduce((sum, id) => sum + (party.attendees[id]?.number ?? 1), 0);
   const texts = attendeeTexts(party, members, emoji);
-  return { name: `Done (${heads})`, value: fitItems(texts, limit) };
+  return { name: `Complete (${heads})`, value: fitItems(texts, limit) };
 }
 
-/**
- * The forum post of a raid: title, tags, the embed and the controls under it. Pure: the same view
- * gives the same post.
- */
-export function renderRaidPost(view: RaidPostView): RenderedPost {
-  const { party, gym, boss, now, emoji } = view;
-  const stage = view.closed === undefined ? raidStage(party, now) : 'ended';
-  const tier = tierWords(party.raid.tier);
-
-  // An egg whose boss is known (named by a member, or certain for its tier) is an egg until it
-  // hatches: what it hatches as is said once, by the heading of the block about that boss, and
-  // in the first line only when there is no such block (Matt, 2026-10-11).
-  const fought = stage === 'egg' ? undefined : boss;
-  const expected = fought ? undefined : (boss ?? view.hatchesAs);
-  const info = fought
-    ? bossField(view, fought, 'Boss', view.showUnknownMoves)
-    : expected && bossField(view, expected, `Hatches as ${plain(expected.name)}`, false);
-  const headline = fought
-    ? `**${tier} raid** against **${plain(fought.name)}**${fought.shiny ? ` ${emoji.shiny}` : ''}`
-    : `**${tier} ${stage === 'egg' ? 'egg' : 'raid'}**` +
-      (expected && !info ? `, which hatches as **${plain(expected.name)}**` : '');
+/** The card of a raid, for a direct message: what the post says, as an embed. */
+function raidCard(view: RaidPostView): APIEmbed {
+  const { party, gym } = view;
+  const stage = stageOf(view);
+  const info = bossInfo(view, stage);
   const description = [
-    headline,
+    headline(view, stage),
+    // A boss without stats has no field to head.
+    ...(info?.hatchesAs && info.lines.length === 0 ? [hatchesAsLine(view, info.hatchesAs)] : []),
     view.closed ?? describeTimes(view, stage),
     ...(party.anonymous ? [] : [`Reported by ${memberName(memberOf(party, party.createdById))}.`]),
-    // Not in the last showing of a raid that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
   ].join('\n');
 
   const fields: ShrinkableField[] = [];
-  const shown = boss ?? view.hatchesAs;
-  if (info) fields.push({ field: info, rank: 0 });
-
+  if (info && info.lines.length > 0) {
+    const name = info.hatchesAs ? `Hatches as ${plain(info.hatchesAs.name)}` : 'Boss';
+    fields.push({
+      field: {
+        name: truncate(name, LIMITS.fieldName),
+        value: truncate(info.lines.join('\n'), LIMITS.fieldValue),
+      },
+      rank: 0,
+    });
+  }
   const single = party.groups.length === 1;
   for (const group of party.groups) {
     fields.push({
@@ -358,17 +513,19 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
       rank: 1,
     });
   }
-
-  const done = doneField(view);
-  if (done) {
-    fields.push({ field: done, shrink: (limit) => doneField(view, limit) ?? done, rank: 2 });
+  const complete = completeField(view);
+  if (complete) {
+    fields.push({
+      field: complete,
+      shrink: (limit) => completeField(view, limit) ?? complete,
+      rank: 2,
+    });
   }
-
   const location = gymNotes(gym);
   if (location.length > 0) {
     fields.push({
       field: {
-        name: 'About this gym',
+        name: 'Location Information',
         value: truncate(location.join('\n'), LIMITS.fieldValue),
       },
       rank: 0,
@@ -380,10 +537,8 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
   const embedDescription = truncate(description, LIMITS.embedDescription);
   const kept = fields.slice(0, LIMITS.fields);
   fitEmbed(embedTitle, embedDescription, kept);
-
-  // An egg is shown as the game's egg until it hatches, also when its boss is known.
-  const thumbnail = (stage === 'egg' ? view.eggPicture : undefined) ?? shown?.image;
-  const embed: APIEmbed = {
+  const thumbnail = pictureOf(view, stage);
+  return {
     title: embedTitle,
     ...(gym ? { url: gymMapsUrl(gym) } : {}),
     description: embedDescription,
@@ -391,13 +546,21 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     ...(thumbnail === undefined ? {} : { thumbnail: { url: thumbnail } }),
     fields: kept.map((f) => f.field),
   };
-  return {
+}
+
+/**
+ * The forum post of a raid: title, tags, the components-v2 message (`raidLayout`) and the card
+ * of a direct message. Pure: the same view gives the same post.
+ */
+export function renderRaidPost(view: RaidPostView): RenderedPost {
+  const { party, now } = view;
+  return renderedPost({
     title: raidTitle(view),
     tags:
       view.closed === undefined
         ? raidTags(party, now)
         : ['Ended', ...raidTags(party, now).slice(1)],
-    embed,
-    message: { embeds: [embed], components: partyControls(party) },
-  };
+    layout: raidLayout(view),
+    card: raidCard(view),
+  });
 }
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 5d8e7fde3c4a2ef0f154394b46bd80820dd98062..fe9a217aeb61593755beb266d43aecea6172dd2c 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -1,7 +1,16 @@
-import type { APIEmbed } from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { expectSendable } from '../../test/support/post-limits.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
+import {
+  accentOf,
+  buttonLabels,
+  buttonsOf,
+  componentCount,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 import {
   ALICE,
   at,
@@ -19,12 +28,20 @@ import { decodeCustomId } from '../discord/custom-id.js';
 import {
   endParty,
   MAX_ROUTE_STOPS,
+  type Attendee,
   type TrainDetails,
   type TrainParty,
 } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { partyControls } from './party-controls.js';
-import { KEPT_OPEN } from './party-post.js';
+import {
+  KEPT_OPEN,
+  layoutTextLength,
+  LEAD_ROOM,
+  MAX_COMPONENTS,
+  postMessage,
+  TEXT_BUDGET,
+  type RenderedPost,
+} from './party-post.js';
 import { shownBoss, type PostGym } from './raid-post.js';
 import { LIMITS } from './text.js';
 import { movementText, trainPanel, whereText } from './train-panel.js';
@@ -73,13 +90,23 @@ function view(party: TrainParty, extra: Partial<TrainPostView> = {}): TrainPostV
   };
 }
 
+/** The lines of the first block of a post: its name, its boss, its times, its conductor. */
 const lines = (party: TrainParty, extra: Partial<TrainPostView> = {}): string[] =>
-  renderTrainPost(view(party, extra)).embed.description?.split('\n') ?? [];
+  textDisplays(renderTrainPost(view(party, extra)).message)[0]?.split('\n') ?? [];
 
-function field(embed: APIEmbed, name: RegExp) {
-  return embed.fields?.find((f) => name.test(f.name));
+/** The text display of a post that starts so (a heading), or undefined. */
+function block(post: RenderedPost, start: string): string | undefined {
+  return textDisplays(post.message).find((text) => text.startsWith(start));
 }
 
+/** Where the train is, beside "Move train…": the second text of the post. */
+const where = (party: TrainParty, extra: Partial<TrainPostView> = {}): string | undefined =>
+  textDisplays(renderTrainPost(view(party, extra)).message)[1];
+
+const NO_TIME =
+  'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
+  `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`;
+
 describe('trainTitle and trainTags', () => {
   it('titles the post with what it is and its name, within what a title takes', () => {
     expect(trainTitle(testTrain())).toBe('Train · Saturday legendaries');
@@ -102,37 +129,39 @@ describe('renderTrainPost', () => {
     const post = renderTrainPost(view(testTrain()));
     expect(post.title).toBe('Train · Saturday legendaries');
     expect(post.tags).toEqual(['Train']);
-    expect(post.embed.title).toBe('Saturday legendaries');
-    expect(post.embed.color).toBe(0x3498db);
-    expect(post.embed.thumbnail).toBeUndefined();
-    expect(post.embed.description?.split('\n')).toEqual([
+    expect(accentOf(post.message)).toBe(0x3498db);
+    expect(thumbnailOf(post.message)).toBeUndefined();
+    expect(textDisplays(post.message)).toEqual([
+      `### Raid Train: Saturday legendaries\n${NO_TIME}`,
+      'No route yet: `/route add` adds a stop.',
+      `**Interested (1)**\n<@${REPORTER}>`,
+      '**Coming (0)**',
+      '**Present (0)**',
+      `-# Created by <@${REPORTER}>`,
+    ]);
+    expect(post.message).toEqual(postMessage(post.layout));
+    // The card of a direct message.
+    expect(post.card.title).toBe('Saturday legendaries');
+    expect(post.card.description?.split('\n')).toEqual([
       '**Raid train**',
-      'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
-        `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`,
+      NO_TIME,
       `Created by <@${REPORTER}>.`,
       '',
       'No route yet: `/route add` adds a stop.',
     ]);
-    expect(post.embed.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
-    expect(post.message).toEqual({ embeds: [post.embed], components: partyControls(testTrain()) });
+    expect(post.card.fields?.map((f) => f.name)).toEqual(['Trainers (1)']);
   });
 
   it('names no maker of a train whose maker chose not to be named, and still its conductor', () => {
     const hidden = testTrain({ anonymous: true });
-    expect(renderTrainPost(view(hidden)).embed.description?.split('\n')).toEqual([
-      '**Raid train**',
-      'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
-        `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`,
-      '',
-      'No route yet: `/route add` adds a stop.',
-    ]);
+    expect(textOf(renderTrainPost(view(hidden)).message)).not.toContain('Created by');
     const led = { ...hidden, train: { ...hidden.train, conductorId: REPORTER } };
-    const lines = renderTrainPost(view(led)).embed.description?.split('\n') ?? [];
-    expect(lines).toContain(`Conductor: <@${REPORTER}>.`);
-    expect(lines.some((line) => line.startsWith('Created by'))).toBe(false);
+    expect(lines(led)).toContain(`Conductor: <@${REPORTER}>`);
     // A maker who is not signed up either: nobody in the list.
     const empty = testTrain({ anonymous: true, autoStatus: PartyStatus.NotInterested });
-    expect(JSON.stringify(renderTrainPost(view(empty)).embed)).not.toContain(REPORTER);
+    const post = renderTrainPost(view(empty));
+    expect(textOf(post.message)).not.toContain(REPORTER);
+    expect(JSON.stringify(post.card)).not.toContain(REPORTER);
   });
 
   it('says its times as a meetup does, in the second line', () => {
@@ -149,38 +178,52 @@ describe('renderTrainPost', () => {
   });
 
   it('names the conductor when the train has one', () => {
-    expect(lines(onRoute([4], 0, { conductorId: ALICE }))).toContain(`Conductor: <@${ALICE}>.`);
+    expect(lines(onRoute([4], 0, { conductorId: ALICE }))).toContain(`Conductor: <@${ALICE}>`);
+    const named = withAttendees(onRoute([4], 0, { conductorId: ALICE }), {
+      [ALICE]: { name: 'Alice' },
+    });
+    expect(lines(named)).toContain('Conductor: Alice');
     expect(lines(onRoute([4])).some((line) => line.startsWith('Conductor'))).toBe(false);
   });
 
-  it('links the stop the train is at and the one after it', () => {
-    const first = lines(onRoute([4, 1, 7]));
-    expect(first.slice(-2)).toEqual([
-      `**Now at** [Veterans Memorial Bridge](${maps(4)})`,
-      // A gym is called by its nickname when it has one.
-      `**Next** [The Stacks](${maps(1)})`,
-    ]);
-    expect(lines(onRoute([4, 1, 7], 2)).slice(-2)).toEqual([
-      '',
-      `**Now at** [Harbor Lighthouse Mural](${maps(7)})`,
-    ]);
+  it('links the stop the train is at and the one after it, beside "Move train…"', () => {
+    expect(where(onRoute([4, 1, 7]))).toBe(
+      `**Current gym** · [Veterans Memorial Bridge](${maps(4)})\n` +
+        // A gym is called by its nickname when it has one.
+        `**Next gym** · [The Stacks](${maps(1)})`,
+    );
+    expect(where(onRoute([4, 1, 7], 2))).toBe(
+      `**Current gym** · [Harbor Lighthouse Mural](${maps(7)})`,
+    );
+    const post = renderTrainPost(view(onRoute([4, 1, 7])));
+    expect(buttonLabels(post.message)[0]).toBe('Move train…');
   });
 
   it('says that the route is finished, and stays blue: only the times end a train', () => {
     const post = renderTrainPost(view(onRoute([4, 1, 7], 3)));
-    expect(post.embed.description?.split('\n').at(-1)).toBe('The route is finished.');
-    expect(post.embed.color).toBe(0x3498db);
+    expect(where(onRoute([4, 1, 7], 3))).toBe('**Route complete**');
+    expect(accentOf(post.message)).toBe(0x3498db);
     expect(post.tags).toEqual(['Train']);
-    expect(field(post.embed, /^Route/)?.name).toBe('Route: 3 stops, finished');
+    expect(block(post, '-# Route')).toMatch(/^-# Route, 3 stops, finished: 1\. /);
   });
 
-  it('lists the route: done stops struck through, the current one marked, elite raid gyms marked', () => {
+  it('lists the route in small print: every stop a link, the current one bold, elite raid gyms marked', () => {
     const exGyms = (id: number): PostGym | undefined => {
       const found = gym(id);
       return found && id === 7 ? { ...found, taggedEx: true } : found;
     };
     const post = renderTrainPost(view(onRoute([4, 1, 7, 2], 1), { gym: exGyms }));
-    expect(field(post.embed, /^Route/)).toEqual({
+    expect(block(post, '-# Route')).toBe(
+      '-# Route, stop 2 of 4: ' +
+        [
+          `1. [Veterans Memorial Bridge](${maps(4)})`,
+          `**2. [The Stacks](${maps(1)})**`,
+          `3. [Harbor Lighthouse Mural](${maps(7)}) (elite)`,
+          `4. [Old Stone Fountain](${maps(2)})`,
+        ].join(' · '),
+    );
+    // The card keeps its list of a line a stop.
+    expect(post.card.fields?.find((f) => f.name.startsWith('Route'))).toEqual({
       name: 'Route: stop 2 of 4',
       value: [
         '~~1\\. Veterans Memorial Bridge~~',
@@ -193,37 +236,37 @@ describe('renderTrainPost', () => {
 
   it('names a gym that no longer exists as unknown, without a link', () => {
     const post = renderTrainPost(view(onRoute([999, 4])));
-    expect(post.embed.description?.split('\n').slice(-2)).toEqual([
-      '**Now at** Unknown gym',
-      `**Next** [Veterans Memorial Bridge](${maps(4)})`,
-    ]);
-    expect(field(post.embed, /^Route/)?.value.split('\n')[0]).toBe(
-      '**1\\. Unknown gym** (the train is here)',
+    expect(where(onRoute([999, 4]))).toBe(
+      `**Current gym** · Unknown gym\n**Next gym** · [Veterans Memorial Bridge](${maps(4)})`,
     );
+    expect(block(post, '-# Route')).toMatch(/^-# Route, stop 1 of 2: \*\*1\. Unknown gym\*\* · /);
   });
 
   it('shows the boss the train is after as a raid shows it: name, picture, weaknesses, catch CP', () => {
     const train = onRoute([4], 0, { boss: { key: 'yveltal' } });
     const post = renderTrainPost(view(train));
-    expect(post.embed.description?.split('\n')[0]).toMatch(
-      /^\*\*Raid train\*\* after \*\*Yveltal\*\*/,
-    );
-    const boss = field(post.embed, /^Boss$/);
-    expect(boss?.value).toMatch(/^\*\*Weak to\*\* /);
-    expect(boss?.value).toMatch(/\*\*Catch CP\*\* \d+–\d+, boosted \d+–\d+/);
+    expect(lines(train)[1]).toBe('**After Yveltal** ✨');
+    const boss = block(post, '**Weaknesses**');
+    expect(boss).toMatch(/^\*\*Weaknesses\*\* /);
+    expect(boss).toMatch(/\*\*Catch CP\*\* \d+–\d+ · \d+–\d+/);
     // No moves: a train goes from raid to raid.
-    expect(boss?.value).not.toMatch(/Moves/);
+    expect(boss).not.toMatch(/Moveset/);
     const listed = raidBossesFixture()
       .bosses()
       .find((b) => b.entry?.key === 'yveltal');
-    expect(post.embed.thumbnail?.url).toBe(listed?.image);
-    expect(post.embed.fields?.[0]?.name).toBe('Boss');
+    expect(thumbnailOf(post.message)).toBe(listed?.image);
+    expect(post.card.fields?.[0]?.name).toBe('Boss');
+    // The card names it as the post does, in its own words.
+    expect(post.card.description?.split('\n')[0]).toBe('**Raid train** after **Yveltal** ✨');
   });
 
   it('names a boss the game master does not know, without a block about it', () => {
-    const post = renderTrainPost(view(onRoute([4], 0, { boss: { name: 'New*mon' } })));
-    expect(post.embed.description?.split('\n')[0]).toBe('**Raid train** after **New\\*mon**');
-    expect(field(post.embed, /^Boss$/)).toBeUndefined();
+    const train = onRoute([4], 0, { boss: { name: 'New*mon' } });
+    expect(lines(train)[1]).toBe('**After New\\*mon**');
+    expect(block(renderTrainPost(view(train)), '**Weaknesses**')).toBeUndefined();
+    expect(renderTrainPost(view(train)).card.description?.split('\n')[0]).toBe(
+      '**Raid train** after **New\\*mon**',
+    );
   });
 
   it('says what there is to say about the gym the train is at', () => {
@@ -233,19 +276,21 @@ describe('renderTrainPost', () => {
         ? { ...found, confirmedEx: true, notice: 'Mind the *traffic*' }
         : found;
     };
-    const post = renderTrainPost(view(onRoute([4, 11]), { gym: noted }));
-    expect(field(post.embed, /About this gym/)?.value).toBe(
-      'This is an elite raid gym.\nMind the \\*traffic\\*',
+    const about = (train: TrainParty, extra: Partial<TrainPostView> = {}) =>
+      block(renderTrainPost(view(train, extra)), '**Location Information**');
+    expect(about(onRoute([4, 11]), { gym: noted })).toBe(
+      '**Location Information**\nThis is an elite raid gym.\nMind the \\*traffic\\*',
     );
     // At the next stop it is that gym's notice.
-    const next = renderTrainPost(view(onRoute([4, 11], 1), { gym: noted }));
-    expect(field(next.embed, /About this gym/)?.value).toBe('Park closes at dusk');
+    expect(about(onRoute([4, 11], 1), { gym: noted })).toBe(
+      '**Location Information**\nPark closes at dusk',
+    );
     // And nothing where the train is at no gym.
-    expect(field(renderTrainPost(view(onRoute([4, 11], 2))).embed, /About/)).toBeUndefined();
-    expect(field(renderTrainPost(view(onRoute([1]))).embed, /About/)).toBeUndefined();
+    expect(about(onRoute([4, 11], 2))).toBeUndefined();
+    expect(about(onRoute([1]))).toBeUndefined();
   });
 
-  it('lists the trainers by group, as a raid does', () => {
+  it('lists the trainers by group, as a raid does, with a Join for each', () => {
     const train: TrainParty = {
       ...withAttendees(onRoute([4]), {
         [ALICE]: { status: PartyStatus.Present, group: 'B', number: 2 },
@@ -255,35 +300,47 @@ describe('renderTrainPost', () => {
       defaultGroupId: 'B',
     };
     const post = renderTrainPost(view(train));
-    expect(field(post.embed, /^Group A/)).toEqual({
-      name: 'Group A (1)',
-      value: `**Interested** <@${REPORTER}>`,
-    });
-    expect(field(post.embed, /^Group B/)).toEqual({
-      name: 'Group B: by car (3)',
-      value: `**Here** <@${ALICE}> +1\n**Coming** <@${BOB}> 🛰️`,
-    });
+    expect(block(post, '**Group A')).toBe(
+      `**Group A** · 1 trainer\nInterested (1): <@${REPORTER}>`,
+    );
+    expect(block(post, '**Group B')).toBe(
+      `**Group B: by car** · 3 trainers\nComing (1): <@${BOB}> 🛰️\nPresent (2): <@${ALICE}> +1`,
+    );
+    expect(buttonLabels(post.message)).toEqual([
+      'Move train…',
+      'Join A',
+      'Join B',
+      'Interested',
+      'Here',
+      'Leave',
+      '−1',
+      '+1',
+      'Remote',
+    ]);
   });
 
   it('shows a train that staff closed, or that was kept, as a meetup is shown', () => {
     const closed = renderTrainPost(
       view(endParty(onRoute([4])), { closed: 'Closed by a moderator.' }),
     );
-    expect(closed.embed.description?.split('\n')[1]).toBe('Closed by a moderator.');
-    expect(closed.embed.color).toBe(0xe74c3c);
+    expect(textDisplays(closed.message)[0]?.split('\n')[1]).toBe('Closed by a moderator.');
+    expect(accentOf(closed.message)).toBe(0xe74c3c);
     expect(closed.tags).toEqual(['Train', 'Ended']);
     const kept = { ...onRoute([4]), saved: true };
     expect(lines(kept)).toContain(KEPT_OPEN);
     expect(lines(kept, { closed: 'Closed.' })).not.toContain(KEPT_OPEN);
   });
 
-  it('makes a name plain in the embed and keeps it raw in the title of the post', () => {
+  it('makes a name plain in the post and keeps it raw in the title of the post', () => {
     const post = renderTrainPost(view(testTrain({ name: '**Bold** train' })));
     expect(post.title).toBe('Train · **Bold** train');
-    expect(post.embed.title).toBe('\\*\\*Bold\\*\\* train');
+    expect(textDisplays(post.message)[0]?.split('\n')[0]).toBe(
+      '### Raid Train: \\*\\*Bold\\*\\* train',
+    );
+    expect(post.card.title).toBe('\\*\\*Bold\\*\\* train');
   });
 
-  it('stays an embed Discord takes with the longest route and a crowd in five groups', () => {
+  it('stays a message Discord takes with the longest route and a crowd in five groups', () => {
     const long = (id: number): PostGym => ({
       name: `${'Long gym name '.repeat(6)}${id}`,
       nickname: null,
@@ -293,10 +350,12 @@ describe('renderTrainPost', () => {
       taggedEx: true,
       confirmedEx: false,
     });
-    const crowd: Record<string, { group: 'A' | 'B' | 'C' | 'D' | 'E' }> = {};
+    const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 400; n++) {
       crowd[`4${String(n).padStart(17, '0')}`] = {
         group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
+        name: `A trainer with a long name ${n}`,
+        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
       };
     }
     const train: TrainParty = {
@@ -308,25 +367,75 @@ describe('renderTrainPost', () => {
         ),
         crowd,
       ),
-      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: 'l'.repeat(100) })),
+      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
+        id,
+        label: 'l'.repeat(100),
+        startTime: START,
+      })),
     };
-    const { embed } = renderTrainPost(view(train, { gym: long }));
+    const post = renderTrainPost(view(train, { gym: long }));
+    expect(componentCount(post.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+    expectSendable(post);
+    // The route keeps the stops around the one the train is at.
+    const route = block(post, '-# Route') ?? '';
+    expect(route).toMatch(/^-# Route, stop 31 of \d+: …29 earlier stops · 30\. \[/);
+    expect(route).toMatch(/ · \*\*31\. \[.*\)\*\* · /);
+    expect(route).toMatch(/…and \d+ more$/);
+    // The card stays an embed Discord takes.
+    const { card } = post;
     const total =
-      (embed.title?.length ?? 0) +
-      (embed.description?.length ?? 0) +
-      (embed.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
+      (card.title?.length ?? 0) +
+      (card.description?.length ?? 0) +
+      (card.fields ?? []).reduce((sum, f) => sum + f.name.length + f.value.length, 0);
     expect(total).toBeLessThanOrEqual(LIMITS.embedTotal);
-    for (const f of embed.fields ?? []) {
+    for (const f of card.fields ?? []) {
       expect(f.value.length).toBeGreaterThan(0);
       expect(f.value.length).toBeLessThanOrEqual(LIMITS.fieldValue);
-      expect(f.name.length).toBeLessThanOrEqual(LIMITS.fieldName);
     }
-    // The route keeps the stops around the one the train is at.
-    const route = field(embed, /^Route/)?.value.split('\n') ?? [];
-    expect(route[0]).toBe('…29 earlier stops');
-    expect(route[1]).toMatch(/^~~30\\\. /);
-    expect(route[2]).toMatch(/^\*\*31\\\. .*\(the train is here\)$/);
-    expect(route.at(-1)).toMatch(/^…and \d+ more$/);
+  });
+});
+
+describe('the longest train that can be', () => {
+  it('keeps within what Discord takes when every text needs escaping', () => {
+    const heavy = (id: number): PostGym => ({
+      name: `${'[*]'.repeat(84)}${id}`,
+      nickname: null,
+      lat: 40,
+      lon: -80,
+      notice: '<'.repeat(500),
+      taggedEx: true,
+      confirmedEx: false,
+    });
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 400; n++) {
+      crowd[`4${String(n).padStart(17, '0')}`] = {
+        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
+        name: `${'_'.repeat(28)}${String(n).padStart(4, '0')}`,
+        status: [PartyStatus.Interested, PartyStatus.Coming, PartyStatus.Present][n % 3],
+      };
+    }
+    const train: TrainParty = {
+      ...withAttendees(
+        onRoute(
+          Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1),
+          30,
+          { boss: { key: 'yveltal' }, conductorId: CAROL },
+        ),
+        { ...crowd, [CAROL]: { name: '*'.repeat(32) } },
+      ),
+      timed: { name: '<'.repeat(80), startTime: START },
+      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
+        id,
+        label: '*'.repeat(100),
+        startTime: START,
+      })),
+      saved: true,
+    };
+    const post = renderTrainPost(view(train, { gym: heavy }));
+    expectSendable(post);
+    // The trainers are still named, cut down with a count.
+    expect(textOf(post.message)).toMatch(/…and \d+ more/);
   });
 });
 
@@ -385,35 +494,28 @@ describe('routeLines and fitRoute', () => {
 });
 
 describe('the controls of a train post', () => {
-  const rows = (party: TrainParty) =>
-    partyControls(party).map((row) =>
-      row.components.map((component) => [
-        'label' in component ? component.label : undefined,
-        'custom_id' in component ? decodeCustomId(component.custom_id)?.action : undefined,
-        'style' in component ? component.style : undefined,
-      ]),
-    );
+  const controls = (party: TrainParty) =>
+    buttonsOf(renderTrainPost(view(party)).message).map((button) => [
+      button.label,
+      decodeCustomId(button.customId ?? '')?.action,
+    ]);
 
-  it('are those of a meetup, with one grey button in a last row that opens the panel', () => {
+  it('are those of a meetup, with a grey "Move train…" beside where the train is', () => {
     const train = testTrain();
-    expect(rows(train).map((row) => row.map(([label, action]) => [label, action]))).toEqual([
-      [
-        ['Interested', 'maybe'],
-        ['Join', 'join'],
-        ['Here', 'here'],
-        ['Leave', 'leave'],
-      ],
-      [
-        ['−1', 'less'],
-        ['+1', 'more'],
-        ['Remote / in person', 'remote'],
-      ],
-      [['Move train…', 'move']],
+    expect(controls(train)).toEqual([
+      ['Move train…', 'move'],
+      ['Interested', 'maybe'],
+      ['Join', 'join'],
+      ['Here', 'here'],
+      ['Leave', 'leave'],
+      ['−1', 'less'],
+      ['+1', 'more'],
+      ['Remote', 'remote'],
     ]);
+    const move = buttonsOf(renderTrainPost(view(train)).message)[0];
     // Secondary: grey.
-    expect(rows(train).at(-1)?.[0]?.[2]).toBe(2);
-    const move = partyControls(train).at(-1)?.components[0];
-    expect(move && 'custom_id' in move && decodeCustomId(move.custom_id)).toEqual({
+    expect(move?.style).toBe(2);
+    expect(decodeCustomId(move?.customId ?? '')).toEqual({
       kind: 'party',
       id: train.id,
       action: 'move',
@@ -421,21 +523,25 @@ describe('the controls of a train post', () => {
     });
   });
 
-  it('have a row of groups between them once there are several, and the move button last', () => {
+  it('have a Join beside each group once there are several, and the statuses below', () => {
     const train: TrainParty = { ...testTrain(), groups: [{ id: 'A' }, { id: 'B' }] };
-    const shown = rows(train);
-    expect(shown).toHaveLength(4);
-    expect(shown[2]?.map(([label, action]) => [label, action])).toEqual([
-      ['Group A (1)', 'group'],
-      ['Group B (0)', 'group'],
+    expect(controls(train).map(([label]) => label)).toEqual([
+      'Move train…',
+      'Join A',
+      'Join B',
+      'Interested',
+      'Here',
+      'Leave',
+      '−1',
+      '+1',
+      'Remote',
     ]);
-    expect(shown[3]?.map(([, action]) => action)).toEqual(['move']);
   });
 
   it('are the same wherever the train is and whoever leads it', () => {
-    const base = partyControls(onRoute([4, 1]));
-    expect(partyControls(onRoute([4, 1], 2, { conductorId: ALICE }))).toEqual(base);
-    expect(partyControls(testTrain())).toEqual(base);
+    const base = controls(onRoute([4, 1]));
+    expect(controls(onRoute([4, 1], 2, { conductorId: ALICE }))).toEqual(base);
+    expect(controls(testTrain())).toEqual(base);
   });
 });
 
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index e19efbcfc3a397e927cb28512744c83cd159bd30..dc0e133f9a8b5165ab9770310dc238813ed963df 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -4,26 +4,33 @@ import { isEliteGym } from '../domain/party/raid.js';
 import { nameOf } from '../domain/party/timed.js';
 import { currentStop, nextStop, routeFinished } from '../domain/party/train.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
-import { partyControls } from './party-controls.js';
+import { fitEmbed, groupField, type ShrinkableField } from './party-card.js';
+import { bottomControls, moveTrainButton } from './party-controls.js';
 import {
+  cutText,
   ENDED_COLOUR,
-  fitEmbed,
-  groupField,
+  fittedLayout,
   KEPT_OPEN,
+  renderedPost,
   tidyTitle,
+  trainerBlocks,
+  type Fit,
   type ForumTag,
+  type PostBlock,
+  type PostLayout,
   type RenderedPost,
-  type ShrinkableField,
 } from './party-post.js';
 import {
   bossFacts,
   gymMapsUrl,
   gymName,
   gymNotes,
+  linkText,
+  locationBlock,
   type PostGym,
   type ShownBoss,
 } from './raid-post.js';
-import { count, fitItems, LIMITS, memberName, plain, truncate } from './text.js';
+import { count, fitItems, LIMITS, memberName, memberText, plain, truncate } from './text.js';
 import { describeTimes, shownAsOver, TIMED_COLOUR, type TimedPostView } from './timed-post.js';
 
 /** A train and the gyms of its route, for everything that shows where it is. */
@@ -57,15 +64,9 @@ export function trainTags(party: TrainParty, now: number): ForumTag[] {
  */
 export function stopLink(gym: PostGym | undefined, bare = false): string {
   if (!gym) return plain(gymName(gym));
-  // A bracket in the name would end the text of the link early. One that is escaped already
-  // (an odd run of backslashes stands before it) stays; after an even run the backslashes
-  // escape each other, and the bracket needs one of its own.
-  const name = plain(gymName(gym)).replace(
-    /(\\*)([[\]])/g,
-    (whole, slashes: string, bracket: string) =>
-      slashes.length % 2 === 1 ? whole : `${slashes}\\${bracket}`,
-  );
-  return bare ? `[${name}](${gymMapsUrl(gym)})` : `[${name}](<${gymMapsUrl(gym)}>)`;
+  return bare
+    ? `[${linkText(gym)}](${gymMapsUrl(gym)})`
+    : `[${linkText(gym)}](<${gymMapsUrl(gym)}>)`;
 }
 
 /**
@@ -105,7 +106,7 @@ export function fitRoute(lines: readonly string[], stop: number, limit: number):
   return head + fitItems(lines.slice(start), limit - head.length, '\n');
 }
 
-/** Where the train is and where it goes next, as the lines of the post say it. */
+/** Where the train is and where it goes next, as the card of a direct message says it. */
 function whereLines(view: TrainPostView): string[] {
   const { party } = view;
   if (party.train.route.length === 0) return ['No route yet: `/route add` adds a stop.'];
@@ -117,25 +118,133 @@ function whereLines(view: TrainPostView): string[] {
   ];
 }
 
+/** Where the train is and where it goes next, as the post says it beside "Move train…". */
+function whereText(view: TrainPostView, room: number): string {
+  const { party } = view;
+  if (party.train.route.length === 0) return 'No route yet: `/route add` adds a stop.';
+  if (routeFinished(party)) return '**Route complete**';
+  const [at, next] = [currentStop(party), nextStop(party)];
+  const lines = (name: (gym: PostGym | undefined) => string): string =>
+    [
+      ...(at === undefined ? [] : [`**Current gym** · ${name(view.gym(at))}`]),
+      ...(next === undefined ? [] : [`**Next gym** · ${name(view.gym(next))}`]),
+    ].join('\n');
+  const linked = lines((gym) => stopLink(gym, true));
+  if (linked.length <= room) return linked;
+  // Too long for the post: the names alone, cut to share what is left.
+  const share = Math.max(1, Math.floor((room - 40) / 2));
+  return lines((gym) => cutText(plain(gymName(gym)), share));
+}
+
+/** The room the route of a post may take, in small print under where the train is. */
+const ROUTE_ROOM = 600;
+
 /**
- * The forum post of a raid train: title, tags, the embed and the controls under it. Pure: the
- * same view gives the same post. It has what the post of a meetup has (its name, its times, who
- * made it unless they are anonymous, who comes) and what a train has: its conductor, where it
- * is and where it goes next, its route, the Pokémon it is after, what there is to say about the
- * gym it is at, and its groups, as in a raid. There is no map: `/where` gives it.
+ * The route in one line of small print, every stop a link, the current one in bold and an elite
+ * raid gym marked: `-# Route, stop 2 of 4: 1. [A](…) · **2. [B](…)** · 3. [C](…) (elite)`. A
+ * route that does not fit keeps the stops around the current one, as `fitRoute` does.
  */
-export function renderTrainPost(view: TrainPostView): RenderedPost {
-  const { party, now, boss, emoji } = view;
-  const over = view.closed !== undefined || shownAsOver(party, now);
+function routeLine(view: TrainPostView, fit: Fit): PostBlock[] {
+  const { route, stop } = view.party.train;
+  if (route.length === 0) return [];
+  const stops = route.map((gymId, index) => {
+    const gym = view.gym(gymId);
+    const text = `${index + 1}. ${stopLink(gym, true)}${gym && isEliteGym(gym) ? ' (elite)' : ''}`;
+    return index === stop ? `**${text}**` : text;
+  });
+  const heading = routeFinished(view.party)
+    ? `Route, ${count(route.length, 'stop')}, finished`
+    : `Route, stop ${stop + 1} of ${route.length}`;
+  const shown = fit.part((room) => {
+    const limit = Math.min(room, ROUTE_ROOM);
+    const whole = stops.join(' · ');
+    if (whole.length <= limit) return whole;
+    const start = Math.max(0, Math.min(stop, stops.length - 1) - 1);
+    const earlier = start > 0 ? `…${count(start, 'earlier stop')} · ` : '';
+    return `${earlier}${fitItems(stops.slice(start), limit - earlier.length, ' · ')}`;
+  });
+  return [{ type: 'text', content: `-# ${heading}: ${shown}` }];
+}
+
+function colour(view: TrainPostView): number {
+  return view.closed !== undefined || shownAsOver(view.party, view.now)
+    ? ENDED_COLOUR
+    : TIMED_COLOUR;
+}
+
+/** `After Yveltal ✨`: what the train is after, when somebody said. */
+function afterLine(view: TrainPostView): string[] {
+  const { boss, emoji } = view;
+  return boss ? [`**After ${plain(boss.name)}**${boss.shiny ? ` ${emoji.shiny}` : ''}`] : [];
+}
+
+/**
+ * The post of a train laid out: its name, what it is after, its times and its conductor, with
+ * the boss's picture beside them; where it is and goes next, with "Move train…" beside it, and
+ * the route; what there is to say about the gym it is at; the boss; who comes, with the buttons;
+ * the rows of the rest of the controls; who made it, unless they asked not to be named.
+ */
+function trainLayout(view: TrainPostView): PostLayout {
+  const { party, boss } = view;
+  const { conductorId } = party.train;
+  const at = currentStop(party);
+  const header = [
+    `### Raid Train: ${plain(nameOf(party))}`,
+    ...afterLine(view),
+    view.closed ?? describeTimes(view),
+    ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}`]),
+    // Not in the last showing of a train that was closed: that post is archived.
+    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+  ].join('\n');
+  return fittedLayout((fit) => ({
+    accent: colour(view),
+    ...(boss?.image === undefined ? {} : { picture: boss.image }),
+    blocks: [
+      { type: 'section', content: header, accessory: 'picture' },
+      { type: 'separator' },
+      {
+        type: 'section',
+        content: fit.part((room) => whereText(view, room)),
+        accessory: moveTrainButton(party),
+      },
+      ...routeLine(view, fit),
+      ...locationBlock(at === undefined ? undefined : view.gym(at), fit),
+      { type: 'separator' },
+      // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
+      ...(boss?.entry
+        ? [
+            {
+              type: 'text' as const,
+              content: bossFacts(view.catalogue, boss.entry, false, view.emoji).join('\n'),
+            },
+          ]
+        : []),
+      { type: 'separator' },
+      ...trainerBlocks(view, { complete: false, lobby: true }, fit),
+      { type: 'separator' },
+      { type: 'controls', rows: bottomControls(party, { groups: party.groups.length > 1 }) },
+      // Unless they chose not to be named (`/settings privacy`), as for a raid they report.
+      ...(party.anonymous
+        ? []
+        : [
+            {
+              type: 'text' as const,
+              content: `-# Created by ${memberText(memberOf(party, party.createdById))}`,
+            },
+          ]),
+    ],
+  }));
+}
+
+/** The card of a train, for a direct message: what the post says, as an embed. */
+function trainCard(view: TrainPostView): APIEmbed {
+  const { party, boss } = view;
   const { route, stop, conductorId } = party.train;
-  const after = boss ? ` after **${plain(boss.name)}**${boss.shiny ? ` ${emoji.shiny}` : ''}` : '';
   const description = [
-    `**Raid train**${after}`,
+    `**Raid train**${boss ? ` after **${plain(boss.name)}**${boss.shiny ? ` ${view.emoji.shiny}` : ''}` : ''}`,
     view.closed ?? describeTimes(view),
     ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}.`]),
-    // Unless they chose not to be named (`/settings privacy`), as for a raid they report.
     ...(party.anonymous ? [] : [`Created by ${memberName(memberOf(party, party.createdById))}.`]),
-    // Not in the last showing of a train that was closed: that post is archived.
     ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
     '',
     ...whereLines(view),
@@ -146,8 +255,10 @@ export function renderTrainPost(view: TrainPostView): RenderedPost {
     fields.push({
       field: {
         name: 'Boss',
-        // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
-        value: truncate(bossFacts(view.catalogue, boss.entry, false).join('\n'), LIMITS.fieldValue),
+        value: truncate(
+          bossFacts(view.catalogue, boss.entry, false, view.emoji).join('\n'),
+          LIMITS.fieldValue,
+        ),
       },
       rank: 0,
     });
@@ -175,7 +286,7 @@ export function renderTrainPost(view: TrainPostView): RenderedPost {
   const notes = at === undefined ? [] : gymNotes(view.gym(at));
   if (notes.length > 0) {
     fields.push({
-      field: { name: 'About this gym', value: truncate(notes.join('\n'), LIMITS.fieldValue) },
+      field: { name: 'Location Information', value: truncate(notes.join('\n'), LIMITS.fieldValue) },
       rank: 0,
     });
   }
@@ -184,19 +295,29 @@ export function renderTrainPost(view: TrainPostView): RenderedPost {
   const embedTitle = truncate(plain(nameOf(party)), LIMITS.embedTitle);
   const embedDescription = truncate(description, LIMITS.embedDescription);
   fitEmbed(embedTitle, embedDescription, fields);
-
-  const embed: APIEmbed = {
+  return {
     title: embedTitle,
     description: embedDescription,
-    color: over ? ENDED_COLOUR : TIMED_COLOUR,
+    color: colour(view),
     ...(boss?.image === undefined ? {} : { thumbnail: { url: boss.image } }),
     fields: fields.map((f) => f.field),
   };
+}
+
+/**
+ * The forum post of a raid train: title, tags, the components-v2 message (`trainLayout`) and the
+ * card of a direct message. Pure: the same view gives the same post. It has what the post of a
+ * meetup has and what a train has: its conductor, where it is and where it goes next, its route,
+ * the Pokémon it is after, what there is to say about the gym it is at, and its groups, as in a
+ * raid. There is no map: `/where` gives it.
+ */
+export function renderTrainPost(view: TrainPostView): RenderedPost {
+  const { party, now } = view;
   const tags = trainTags(party, now);
-  return {
+  return renderedPost({
     title: trainTitle(party),
     tags: view.closed === undefined || tags.includes('Ended') ? tags : [...tags, 'Ended'],
-    embed,
-    message: { embeds: [embed], components: partyControls(party) },
-  };
+    layout: trainLayout(view),
+    card: trainCard(view),
+  });
 }
diff --git a/src/services/notify-service.test.ts b/src/services/notify-service.test.ts
index e85f02e214d5bebb9d93c6d8bb10a0c9b8c5f9aa..35e22d01e422bcc82b4146421bfa102e96c41cbb 100644
--- a/src/services/notify-service.test.ts
+++ b/src/services/notify-service.test.ts
@@ -76,10 +76,15 @@ describe('NotifyService: a raid is reported', () => {
     expect(why(made, ALICE)).toEqual(['-# You asked to be told about: Yveltal']);
     expect(why(made, BOB)).toEqual(['-# You asked to be told about: T5 raids']);
     expect(why(made, CAROL)).toEqual(['-# You asked to be told about: raids at The Stacks']);
-    // The embed is that of the post; a DM has none of the post's controls and pings nobody.
+    // The embed is the card of the post; a DM has none of the post's controls and pings nobody.
     const [message] = made.dms.to(ALICE);
-    const post = made.gateway.posts.get(made.postId);
-    expect(message?.embeds).toEqual(post?.message.embeds);
+    expect(message?.embeds).toHaveLength(1);
+    const [card] = message?.embeds ?? [];
+    expect(card?.title).toBe('The Stacks');
+    expect(card?.description?.split('\n')[0]).toBe('**Level 5 raid against Yveltal** ✨');
+    expect(card?.description).toContain('Reported by Rhea.');
+    expect(card?.fields?.map((field) => field.name)).toEqual(['Boss', 'Trainers (1)']);
+    expect(message?.components?.flatMap((row) => row.components).length).toBeLessThanOrEqual(5);
     expect(message?.mention).toBeUndefined();
     const [job] = made.dms.jobs;
     expect(job).toMatchObject({ priority: DM_PRIORITY.normal, eventAt: made.clock.now });
diff --git a/src/services/party-mirrors.region.test.ts b/src/services/party-mirrors.region.test.ts
index b64207024f78a3bb2e7e2a76bd5b393bfffae742..e57f713e701f10416671d094f2305d10692f4e86 100644
--- a/src/services/party-mirrors.region.test.ts
+++ b/src/services/party-mirrors.region.test.ts
@@ -16,6 +16,14 @@ import { MOVE_TRAIN_LABEL } from '../render/party-controls.js';
 import type { Member } from './attendance-service.js';
 import { RETRY_AFTER_MS } from './party-mirrors.js';
 import type { PartyServiceOptions } from './party-service.js';
+import {
+  buttonsOf,
+  copiedPost,
+  customIdsOf,
+  leadOf,
+  textDisplays,
+  textOf,
+} from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 /** Every change is shown at once, as when changes come far apart. */
@@ -23,9 +31,9 @@ const NO_DELAY = { renderDelayMs: 0, sharedDelayMs: 0 };
 
 type Made = Awaited<ReturnType<typeof createdTrain>>;
 
-/** The copies of party messages in a channel: what was sent there with an embed. */
+/** The copies of party messages in a channel: what was sent there as a post is (v2). */
 const copiesIn = (made: Pick<Made, 'gateway'>, channelId: string) =>
-  made.gateway.messagesIn(channelId).filter((sent) => sent.message.embeds !== undefined);
+  made.gateway.messagesIn(channelId).filter((sent) => sent.message.v2 === true);
 
 /** The invented gyms, with the Library (gym 1) lying in these region channels. */
 function gymsWithLibraryIn(...channels: string[]): PartyServiceOptions['gyms'] {
@@ -56,10 +64,10 @@ describe('the copies of a train in the regions it stops in', () => {
     const [copy] = copiesIn(made, EAST_CHANNEL);
     const post = gateway.posts.get(postId);
     expect(copiesIn(made, EAST_CHANNEL)).toHaveLength(1);
-    expect(copy?.message.content).toBe(
+    expect(leadOf(copy?.message)).toBe(
       `A raid train that stops in this region. Sign up here to follow it in its post: <#${postId}>`,
     );
-    expect(copy?.message.embeds).toEqual(post?.message.embeds);
+    expect(copiedPost(copy?.message)).toEqual(textDisplays(post?.message));
     expect(copy?.message.mention).toBeUndefined();
     expect(made.current().mirrorMessages).toEqual([
       { channelId: EAST_CHANNEL, messageId: copy?.id, kind: 'region' },
@@ -72,16 +80,16 @@ describe('the copies of a train in the regions it stops in', () => {
   it('carries the controls of the post without the button that moves the train', async () => {
     const made = await createdTrain({ route: [4, 7] });
     const [copy] = copiesIn(made, EAST_CHANNEL);
-    const post = made.gateway.posts.get(made.postId)?.message.components ?? [];
-    expect(JSON.stringify(post)).toContain(MOVE_TRAIN_LABEL);
-    expect(copy?.message.components).toEqual(post.slice(0, -1));
-    expect(JSON.stringify(copy?.message.components)).toContain(`party:${made.party.id}:join`);
-    expect(JSON.stringify(copy?.message.components)).not.toContain(`party:${made.party.id}:move`);
+    const post = buttonsOf(made.gateway.posts.get(made.postId)?.message);
+    expect(post[0]?.label).toBe(MOVE_TRAIN_LABEL);
+    expect(buttonsOf(copy?.message)).toEqual(post.slice(1));
+    expect(customIdsOf(copy?.message)).toContain(`party:${made.party.id}:join`);
+    expect(customIdsOf(copy?.message)).not.toContain(`party:${made.party.id}:move`);
     // The copy at the bottom of the post itself keeps it.
     await made.service.showStatus(made.party.id);
     await made.service.flush();
     const status = made.gateway.messagesIn(made.postId).at(-1);
-    expect(status?.message.components).toEqual(post);
+    expect(buttonsOf(status?.message)).toEqual(post);
   });
 
   it('makes none for a train that stays in its own region, or has no route', async () => {
@@ -110,8 +118,8 @@ describe('the copies of a train in the regions it stops in', () => {
     await service.flush();
     const [copy] = copiesIn(made, EAST_CHANNEL);
     expect(copy?.edits).toBe(1);
-    expect(JSON.stringify(copy?.message.embeds)).toContain('Alice');
-    expect(copy?.message.embeds).toEqual(gateway.posts.get(postId)?.message.embeds);
+    expect(textOf(copy?.message)).toContain('Alice');
+    expect(copiedPost(copy?.message)).toEqual(textDisplays(gateway.posts.get(postId)?.message));
     const before = gateway.calls.length;
     service.changed(made.party.id);
     await service.flush();
@@ -179,7 +187,7 @@ describe('the copies of a train in the regions it stops in', () => {
     for (const channelId of [EAST_CHANNEL, UNBOUNDED_CHANNEL]) {
       const [copy] = copiesIn(made, channelId);
       expect(copy?.edits).toBe(1);
-      expect(JSON.stringify(copy?.message.embeds)).toContain('Alice');
+      expect(textOf(copy?.message)).toContain('Alice');
     }
   });
 
@@ -404,7 +412,9 @@ describe('the copies of a train: what fails in one region leaves the others alon
     await made.service.flush();
     expect(gateway.calls.slice(before)).not.toContain(`sendMessage ${EAST_CHANNEL}`);
     expect(copiesIn(made, EAST_CHANNEL).map((copy) => copy.id)).toEqual([east?.id]);
-    expect(east?.message.embeds).toEqual(gateway.posts.get(made.postId)?.message.embeds);
+    expect(copiedPost(east?.message)).toEqual(
+      textDisplays(gateway.posts.get(made.postId)?.message),
+    );
     expect(copiesIn(made, UNBOUNDED_CHANNEL)).toHaveLength(1);
     expect(
       made
@@ -511,8 +521,8 @@ describe('the copies of a train: a failure is made good without a change of the
     await vi.waitFor(() => {
       expect(made.east()?.edits).toBe(1);
     });
-    expect(made.east()?.message.embeds).toEqual(made.unbounded()?.message.embeds);
-    expect(JSON.stringify(made.east()?.message.embeds)).toContain(BOB);
+    expect(made.east()?.message).toEqual(made.unbounded()?.message);
+    expect(textOf(made.east()?.message)).toContain(BOB);
     expect(made.unbounded()?.edits).toBe(2);
     await made.service.flush();
     // All is well: nothing more is waiting.
diff --git a/src/services/party-mirrors.test.ts b/src/services/party-mirrors.test.ts
index d4fcc901052541748b77276a18b8f529d37d112c..70cdcf682537d316ef8a67e96967fac5a1d7c3ef 100644
--- a/src/services/party-mirrors.test.ts
+++ b/src/services/party-mirrors.test.ts
@@ -13,6 +13,15 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
 import { RETRY_AFTER_MS } from './party-mirrors.js';
 import type { PartyServiceOptions, RaidReport } from './party-service.js';
+import {
+  buttonsOf,
+  copiedPost,
+  customIdsOf,
+  leadOf,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const yveltal = { boss: { key: 'yveltal' } } as const;
@@ -42,9 +51,9 @@ describe('the copies of a raid in other channels', () => {
     const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
     const post = gateway.posts.get(postId);
     expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
-    expect(copy?.message.content).toBe(`A raid in <#${WEST_CHANNEL}>: <#${postId}>`);
-    expect(copy?.message.embeds).toEqual(post?.message.embeds);
-    expect(copy?.message.components).toEqual(post?.message.components);
+    expect(leadOf(copy?.message)).toBe(`A raid in <#${WEST_CHANNEL}>: <#${postId}>`);
+    expect(copiedPost(copy?.message)).toEqual(textDisplays(post?.message));
+    expect(buttonsOf(copy?.message)).toEqual(buttonsOf(post?.message));
     expect(copy?.message.mention).toBeUndefined();
     expect(made.current().mirrorMessages).toEqual([
       { channelId: REMOTE_CHANNEL, messageId: copy?.id, kind: 'remote' },
@@ -56,7 +65,7 @@ describe('the copies of a raid in other channels', () => {
   it('puts a raid at an elite raid gym into the channel for those as well', async () => {
     const made = await mirrored({}, { gyms: gymsWithExLibrary() });
     expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)).toHaveLength(1);
-    expect(made.gateway.messagesIn(ELITE_GYM_CHANNEL)[0]?.message.content).toBe(
+    expect(leadOf(made.gateway.messagesIn(ELITE_GYM_CHANNEL)[0]?.message)).toBe(
       `A raid at an elite raid gym in <#${WEST_CHANNEL}>: <#${made.postId}>`,
     );
     expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['ex', 'remote']);
@@ -92,8 +101,8 @@ describe('the copies of a raid in other channels', () => {
     await service.flush();
     const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
     expect(copy?.edits).toBe(1);
-    expect(JSON.stringify(copy?.message.embeds)).toContain('Alice');
-    expect(copy?.message.embeds).toEqual(gateway.posts.get(postId)?.message.embeds);
+    expect(textOf(copy?.message)).toContain('Alice');
+    expect(copiedPost(copy?.message)).toEqual(textDisplays(gateway.posts.get(postId)?.message));
 
     const before = gateway.calls.length;
     service.changed(made.party.id);
@@ -104,7 +113,7 @@ describe('the copies of a raid in other channels', () => {
   it('carries controls that name the party, not the channel, so they work on the copy', async () => {
     const made = await mirrored(yveltal);
     const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
-    expect(JSON.stringify(copy?.message.components)).toContain(`party:${made.party.id}:join`);
+    expect(customIdsOf(copy?.message)).toContain(`party:${made.party.id}:join`);
   });
 
   it('takes the copy out of the remote channel when the raid turns out to be an elite one', async () => {
@@ -148,7 +157,7 @@ describe('the copies of a raid in other channels', () => {
     await service.flush();
     const copies = gateway.messagesIn(REMOTE_CHANNEL).filter((copy) => copy.id !== first?.id);
     expect(copies).toHaveLength(1);
-    expect(JSON.stringify(copies[0]?.message.embeds)).toContain('Alice');
+    expect(textOf(copies[0]?.message)).toContain('Alice');
     expect(made.current().mirrorMessages).toEqual([
       { channelId: REMOTE_CHANNEL, messageId: copies[0]?.id, kind: 'remote' },
     ]);
@@ -193,14 +202,16 @@ describe('the copies of a raid in other channels', () => {
   it('sends a copy without the picture when Discord refuses the picture', async () => {
     const made = await reportedRaid(yveltal);
     const { gateway, service } = made;
-    expect(gateway.posts.get(made.postId)?.message.embeds?.[0]?.thumbnail).toBeDefined();
+    expect(thumbnailOf(gateway.posts.get(made.postId)?.message)).toBeDefined();
     gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
     gateway.rejectThumbnails = true;
     service.changed(made.party.id);
     await service.flush();
     const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
-    expect(copy?.message.embeds?.[0]?.thumbnail).toBeUndefined();
-    expect(copy?.message.embeds?.[0]?.title).toBeDefined();
+    expect(thumbnailOf(copy?.message)).toBeUndefined();
+    expect(copiedPost(copy?.message)).toEqual(
+      textDisplays(gateway.posts.get(made.postId)?.message),
+    );
   });
 
   it('edits every copy once after a restart, and then only for a change', async () => {
@@ -231,7 +242,7 @@ describe('the copies of a raid: what can go wrong on the way', () => {
     });
     const send = made.gateway.sendMessage.bind(made.gateway);
     made.gateway.sendMessage = async (channelId, message) => {
-      if (held(channelId) && message.embeds) await gate;
+      if (held(channelId) && message.v2) await gate;
       return send(channelId, message);
     };
     return () => {
@@ -275,13 +286,13 @@ describe('the copies of a raid: what can go wrong on the way', () => {
     const shown = service.showStatus(made.party.id);
     await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
     await vi.waitFor(() => {
-      expect(JSON.stringify(gateway.posts.get(postId)?.message.embeds)).toContain('Alice');
+      expect(textOf(gateway.posts.get(postId)?.message)).toContain('Alice');
     });
     release();
     expect(await shown).toBe(true);
     await service.flush();
-    const [copy] = gateway.messagesIn(postId).filter((message) => message.message.embeds);
-    expect(JSON.stringify(copy?.message.embeds)).toContain('Alice');
+    const [copy] = gateway.messagesIn(postId).filter((message) => message.message.v2 === true);
+    expect(textOf(copy?.message)).toContain('Alice');
   });
 
   it('keeps an earlier copy on record until it could be deleted, and deletes it then', async () => {
@@ -449,7 +460,7 @@ describe('the copies of a raid: what can go wrong on the way', () => {
     expect(gateway.deleted).toContainEqual({ channelId: elsewhere, messageId });
     expect(made.current().mirrorMessages).toEqual([]);
     expect(gateway.calls.filter((call) => call === `editMessage ${messageId}`)).toEqual([]);
-    expect(gateway.messagesIn(postId).filter((message) => message.message.embeds)).toEqual([]);
+    expect(gateway.messagesIn(postId).filter((message) => message.message.v2 === true)).toEqual([]);
   });
 
   it('does not make the post wait for the edit of its copy in a shared channel', async () => {
@@ -478,7 +489,7 @@ describe('the copies of a raid: what can go wrong on the way', () => {
     expect(gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(0);
     release();
     await flushed;
-    expect(JSON.stringify(gateway.messagesIn(REMOTE_CHANNEL)[0]?.message.embeds)).toContain('+1');
+    expect(textOf(gateway.messagesIn(REMOTE_CHANNEL)[0]?.message)).toContain('+1');
   });
 
   it('waits at the end for an edit of a copy that is under way', async () => {
@@ -541,7 +552,7 @@ describe('the copies of a raid: a failure is made good without a change of the r
     });
     expect(warnings()[0]?.msg).toBe('could not update a copy of a party message');
     expect(copy()?.edits).toBe(0);
-    expect(JSON.stringify(copy()?.message.embeds)).not.toContain(ALICE);
+    expect(textOf(copy()?.message)).not.toContain(ALICE);
     expect(made.current().mirrorMessages).toHaveLength(1);
 
     // Ten minutes later the edit is made, although the raid did not change again.
@@ -551,8 +562,10 @@ describe('the copies of a raid: a failure is made good without a change of the r
     await vi.waitFor(() => {
       expect(copy()?.edits).toBe(1);
     });
-    expect(copy()?.message.embeds).toEqual(gateway.posts.get(made.postId)?.message.embeds);
-    expect(JSON.stringify(copy()?.message.embeds)).toContain(ALICE);
+    expect(copiedPost(copy()?.message)).toEqual(
+      textDisplays(gateway.posts.get(made.postId)?.message),
+    );
+    expect(textOf(copy()?.message)).toContain(ALICE);
     await service.flush();
     // All is well: nothing more is waiting.
     expect(vi.getTimerCount()).toBe(timers);
@@ -646,7 +659,7 @@ describe('PartyService.showStatus', () => {
     const { gateway, service, postId } = made;
     expect(await service.showStatus(made.party.id)).toBe(true);
     const [copy] = gateway.messagesIn(postId);
-    expect(copy?.message.content).toBeUndefined();
+    // The post's own message, without a line above it.
     expect(copy?.message).toEqual(gateway.posts.get(postId)?.message);
     expect(made.current().mirrorMessages).toEqual([
       { channelId: postId, messageId: copy?.id, kind: 'status' },
@@ -672,7 +685,7 @@ describe('PartyService.showStatus', () => {
     await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
     await service.flush();
     const [copy] = gateway.messagesIn(postId);
-    expect(JSON.stringify(copy?.message.embeds)).toContain('Alice');
+    expect(textOf(copy?.message)).toContain('Alice');
     expect(copy?.edits).toBe(1);
   });
 
@@ -687,7 +700,7 @@ describe('PartyService.showStatus', () => {
     expect(made.current().mirrorMessages).toEqual([]);
     // Besides the deleted copy, only the line about Alice is in the post.
     const others = gateway.messagesIn(postId).filter((message) => message.id !== deleted);
-    expect(others.filter((message) => message.message.embeds)).toEqual([]);
+    expect(others.filter((message) => message.message.v2 === true)).toEqual([]);
   });
 
   it('answers false for a party that has ended, and sends nothing', async () => {
diff --git a/src/services/party-mirrors.ts b/src/services/party-mirrors.ts
index 897c8e9be1a67f9cf80f21de5c2392c2145a1041..4dfe47c09b9bdfe670450dc5ff35bd6ab50ec5e3 100644
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -2,7 +2,7 @@ import type { Settings } from '../config/settings.js';
 import {
   isMissingPermission,
   isRefusedBody,
-  type ClassicMessage,
+  type OutgoingMessage,
   type PartyGateway,
 } from '../discord/party-gateway.js';
 import {
@@ -61,16 +61,22 @@ export interface PartyMirrorsOptions {
   sharedDelayMs?: number;
 }
 
-/** The message without the picture of its embeds, for when Discord refuses the picture. */
-function withoutPicture(message: ClassicMessage): ClassicMessage {
-  return {
-    ...message,
-    embeds: (message.embeds ?? []).map(({ thumbnail: _picture, ...rest }) => rest),
-  };
+/**
+ * A copy as it is sent, and `bare`, the same without the post's picture, for when Discord
+ * refuses the picture (only when the post has one).
+ */
+interface Copy {
+  message: OutgoingMessage;
+  bare?: OutgoingMessage;
 }
 
-function hasPicture(message: ClassicMessage): boolean {
-  return (message.embeds ?? []).some((embed) => embed.thumbnail !== undefined);
+function copyOf(kind: MirrorKind, rendered: RenderedPost, place: MirrorPlace): Copy {
+  return {
+    message: renderMirror(kind, rendered, place),
+    ...(rendered.layout.picture === undefined
+      ? {}
+      : { bare: renderMirror(kind, rendered, place, { picture: false }) }),
+  };
 }
 
 /** The kinds of copy that stand in other channels than the post, kept by the slower queue. */
@@ -292,7 +298,7 @@ export class PartyMirrors {
         party.id,
         mirror.channelId,
         async () => {
-          gone = !(await this.edit(mirror, renderMirror(mirror.kind, rendered, place)));
+          gone = !(await this.edit(mirror, copyOf(mirror.kind, rendered, place)));
           if (gone) await this.forget(party.id, mirror);
         },
       );
@@ -313,8 +319,8 @@ export class PartyMirrors {
         party.id,
         channelId,
         async () => {
-          const message = renderMirror(kind, rendered, place);
-          noChannel = (await this.create(party.id, kind, channelId, message)) === 'no-channel';
+          const copy = copyOf(kind, rendered, place);
+          noChannel = (await this.create(party.id, kind, channelId, copy)) === 'no-channel';
         },
       );
       complete &&= sent;
@@ -397,37 +403,33 @@ export class PartyMirrors {
   }
 
   /** Edits a copy unless it shows this already. False when the copy is gone. */
-  private async edit(mirror: MirrorMessage, message: ClassicMessage): Promise<boolean> {
+  private async edit(mirror: MirrorMessage, copy: Copy): Promise<boolean> {
     const { gateway, log } = this.options;
-    const key = JSON.stringify(message);
+    const key = JSON.stringify(copy.message);
     if (this.sent.get(mirror.messageId) === key) return true;
     // Forgotten before anything is tried: a failure must not hide an edit that is still needed.
     this.sent.delete(mirror.messageId);
     let there: boolean;
     try {
-      there = await gateway.editMessage(mirror.channelId, mirror.messageId, message);
+      there = await gateway.editMessage(mirror.channelId, mirror.messageId, copy.message);
     } catch (err) {
-      if (!isRefusedBody(err) || !hasPicture(message)) throw err;
+      if (!isRefusedBody(err) || copy.bare === undefined) throw err;
       log.warn({ err, message: mirror.messageId }, 'Discord refused the picture of a copy');
-      there = await gateway.editMessage(
-        mirror.channelId,
-        mirror.messageId,
-        withoutPicture(message),
-      );
+      there = await gateway.editMessage(mirror.channelId, mirror.messageId, copy.bare);
     }
     if (there) this.sent.set(mirror.messageId, key);
     return there;
   }
 
   /** Sends a message; when Discord refuses its picture, once more without it. */
-  private async send(channelId: string, message: ClassicMessage): Promise<string | undefined> {
+  private async send(channelId: string, copy: Copy): Promise<string | undefined> {
     const { gateway, log } = this.options;
     try {
-      return await gateway.sendMessage(channelId, message);
+      return await gateway.sendMessage(channelId, copy.message);
     } catch (err) {
-      if (!isRefusedBody(err) || !hasPicture(message)) throw err;
+      if (!isRefusedBody(err) || copy.bare === undefined) throw err;
       log.warn({ err, channel: channelId }, 'Discord refused the picture of a copy');
-      return gateway.sendMessage(channelId, withoutPicture(message));
+      return gateway.sendMessage(channelId, copy.bare);
     }
   }
 
@@ -442,10 +444,10 @@ export class PartyMirrors {
     partyId: string,
     kind: MirrorKind,
     channelId: string,
-    message: ClassicMessage,
+    copy: Copy,
   ): Promise<'recorded' | 'no-channel' | 'unrecorded'> {
     const { store, gateway, log } = this.options;
-    const messageId = await this.send(channelId, message);
+    const messageId = await this.send(channelId, copy);
     if (messageId === undefined) return 'no-channel';
     const mirror: MirrorMessage = { channelId, messageId, kind };
     let earlier: MirrorMessage[] = [];
@@ -469,7 +471,7 @@ export class PartyMirrors {
       }
     }
     if (!recorded) return 'unrecorded';
-    this.sent.set(messageId, JSON.stringify(message));
+    this.sent.set(messageId, JSON.stringify(copy.message));
     for (const stale of earlier) {
       await this.attempt(
         'delete an earlier copy of a party message',
@@ -516,8 +518,8 @@ export class PartyMirrors {
       const party = this.options.store.get(partyId);
       const postId = party?.forumPostId;
       if (!party || !postId) return false;
-      const message = renderMirror('status', this.options.render(party), this.place(party, postId));
-      return (await this.create(partyId, 'status', postId, message)) === 'recorded';
+      const copy = copyOf('status', this.options.render(party), this.place(party, postId));
+      return (await this.create(partyId, 'status', postId, copy)) === 'recorded';
     })();
     const running = this.reposting.get(partyId) ?? new Set();
     running.add(run);
diff --git a/src/services/party-scheduler.meetup.test.ts b/src/services/party-scheduler.meetup.test.ts
index 29452634d445ece12f20433551b0adcba13b5903..c1557f6a8361ec054da2926852bdb360c1430a7f 100644
--- a/src/services/party-scheduler.meetup.test.ts
+++ b/src/services/party-scheduler.meetup.test.ts
@@ -15,6 +15,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import { setStartTime, setTimedEnd } from '../domain/party/timed.js';
 import type { Member } from './attendance-service.js';
 import { WARN_AGAIN_AFTER } from './party-scheduler.js';
+import { accentOf, buttonsOf, header, textOf } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -42,7 +43,7 @@ function tagsOf(made: Made): string[] {
 }
 
 const lines = (made: Made): string[] => made.said().join('\n').split('\n').filter(Boolean);
-const embed = (made: Made) => made.gateway.posts.get(made.postId)?.message.embeds?.[0];
+const shownPost = (made: Made) => made.gateway.posts.get(made.postId)?.message;
 
 /** A meetup from 16:00 to 18:00, with Alice and Bob here. */
 async function planned(): Promise<Made> {
@@ -76,9 +77,9 @@ describe('PartyScheduler: a meetup while it goes on', () => {
     const said = lines(made);
     const edits = () => made.gateway.posts.get(made.postId)?.edits ?? 0;
     const before = edits();
-    expect(embed(made)?.description).toContain(`Starts ${stamp(START, 'R')}`);
+    expect(textOf(shownPost(made))).toContain(`Starts ${stamp(START, 'R')}`);
     await tickAt(made, START);
-    expect(embed(made)?.description).toContain(
+    expect(textOf(shownPost(made))).toContain(
       `Started at ${stamp(START)}. Ends ${stamp(END, 'R')}, at ${stamp(END)}.`,
     );
     expect(edits()).toBe(before + 1);
@@ -107,16 +108,24 @@ describe('PartyScheduler: a meetup while it goes on', () => {
     const made = await planned();
     await tickAt(made, END - MINUTE);
     expect(tagsOf(made)).toEqual(['Meetup']);
-    expect(embed(made)?.color).toBe(0x3498db);
+    expect(accentOf(shownPost(made))).toBe(0x3498db);
     const said = lines(made);
     await tickAt(made, END);
     expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
-    expect(embed(made)?.color).toBe(0xe74c3c);
-    expect(embed(made)?.description).toContain(`Ended at ${stamp(END, 'F')}.`);
+    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
+    expect(textOf(shownPost(made))).toContain(`Ended at ${stamp(END, 'F')}.`);
     expect(lines(made)).toEqual(said);
     // The title does not change with the end, and the controls stay until the archiving.
     expect(made.gateway.posts.get(made.postId)?.renames).toBe(0);
-    expect(made.gateway.posts.get(made.postId)?.message.components?.length).toBe(2);
+    expect(buttonsOf(made.gateway.posts.get(made.postId)?.message).map((b) => b.label)).toEqual([
+      'Interested',
+      'Join',
+      'Here',
+      'Leave',
+      '−1',
+      '+1',
+      'Remote',
+    ]);
   });
 
   it('shows the date of its times once the day has changed', async () => {
@@ -126,9 +135,9 @@ describe('PartyScheduler: a meetup while it goes on', () => {
       setStartTime(asMeetup(party), REPORTER, tomorrow, PARTY_NOW),
     );
     await tickAt(made, PARTY_NOW + MINUTE);
-    expect(embed(made)?.description).toContain(`at ${stamp(tomorrow, 'F')}.`);
+    expect(textOf(shownPost(made))).toContain(`at ${stamp(tomorrow, 'F')}.`);
     await tickAt(made, at('2026-10-14T00:00'));
-    expect(embed(made)?.description).toContain(`at ${stamp(tomorrow)}.`);
+    expect(textOf(shownPost(made))).toContain(`at ${stamp(tomorrow)}.`);
   });
 });
 
@@ -154,7 +163,7 @@ describe('PartyScheduler: archiving a meetup', () => {
     expect(made.store.get(made.party.id)).toBeUndefined();
     const post = made.gateway.posts.get(made.postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
-    expect(post?.message.components).toEqual([]);
+    expect(buttonsOf(post?.message)).toEqual([]);
     // The warning and the link line went with it.
     expect(made.said().some((text) => text.includes('I will archive'))).toBe(false);
     expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
@@ -179,8 +188,8 @@ describe('PartyScheduler: archiving a meetup', () => {
     ]);
     // It is not shown as ended yet: nobody said that it has. The post says when it goes.
     expect(tagsOf(made)).toEqual(['Meetup']);
-    expect(embed(made)?.color).toBe(0x3498db);
-    expect(embed(made)?.description).toContain(
+    expect(accentOf(shownPost(made))).toBe(0x3498db);
+    expect(textOf(shownPost(made))).toContain(
       `Without one this post is archived ${stamp(due, 'R')}.`,
     );
     await tickAt(made, due);
@@ -188,11 +197,13 @@ describe('PartyScheduler: archiving a meetup', () => {
     // The archived post does not look as if the meetup were still going on.
     const post = made.gateway.posts.get(made.postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
-    expect(post?.message.components).toEqual([]);
-    expect(embed(made)?.description).toBe(
-      `**Meetup**\nThis meetup is over.\nCreated by <@${REPORTER}>.`,
-    );
-    expect(embed(made)?.color).toBe(0xe74c3c);
+    expect(buttonsOf(post?.message)).toEqual([]);
+    expect(header(shownPost(made))).toEqual([
+      '### Meetup: Community Day picnic',
+      'This meetup is over.',
+    ]);
+    expect(textOf(shownPost(made))).toContain(`-# Created by <@${REPORTER}>`);
+    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
     expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
   });
 
@@ -204,8 +215,8 @@ describe('PartyScheduler: archiving a meetup', () => {
     await tickAt(made, START + DAY + 6 * MINUTE);
     await tickAt(made, START + DAY + 66 * MINUTE);
     expect(made.store.get(made.party.id)).toBeUndefined();
-    expect(embed(made)?.description?.split('\n')[1]).toBe('This meetup is over.');
-    expect(embed(made)?.color).toBe(0xe74c3c);
+    expect(header(shownPost(made))[1]).toBe('This meetup is over.');
+    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
     expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
   });
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 6c375efaa721be33bcb75e92797dd1f14cd04ee7..f4e19463924f333ff301cfa15008c13191a240af 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -9,6 +9,7 @@ import { setEndTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
 import { WARN_AGAIN_AFTER } from './party-scheduler.js';
+import { header } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -474,7 +475,7 @@ describe('PartyScheduler: running', () => {
     await again.service.flush();
 
     expect(asRaid(again.store.get(made.party.id)).raid.stageSeen).toBe('hatched');
-    expect(gateway.posts.get(postId)?.message.embeds).toHaveLength(1);
+    expect(header(gateway.posts.get(postId)?.message)[1]).toMatch(/^\*\*Level 5 raid against /);
     expect(gateway.posts.get(postId)?.edits).toBe(1);
     expect(gateway.posts.get(open)?.archived).toBe(true);
     expect(regions.byId(1)?.summaryMessageId).not.toBeNull();
diff --git a/src/services/party-service.end.test.ts b/src/services/party-service.end.test.ts
index 49c87073ec227a5466d926e63beb697b946ad302..24bb139ea161518209f5174ecf7dad8d258f6da2 100644
--- a/src/services/party-service.end.test.ts
+++ b/src/services/party-service.end.test.ts
@@ -6,6 +6,7 @@ import { gymsFixture } from '../../test/support/providers.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { Coalescer } from './coalescer.js';
 import type { Member } from './attendance-service.js';
+import { buttonsOf, header } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -16,7 +17,7 @@ describe('PartyService.end', () => {
     const made = await reportedRaid(yveltal);
     const { service, store, gateway, postId } = made;
     expect(gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
-    expect(gateway.posts.get(postId)?.message.components?.length).toBeGreaterThan(0);
+    expect(buttonsOf(gateway.posts.get(postId)?.message).length).toBeGreaterThan(0);
 
     expect(await service.end(made.party.id)).toBe(true);
 
@@ -24,8 +25,10 @@ describe('PartyService.end', () => {
     expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
-    expect(post?.message.components).toEqual([]);
-    expect(post?.message.embeds).toHaveLength(1);
+    expect(buttonsOf(post?.message)).toEqual([]);
+    // The last showing is the post as it was, without its controls.
+    expect(header(post?.message)[0]).toMatch(/^### \[The Stacks\]\(/);
+    expect(header(post?.message)[1]).toBe('**Level 5 raid against Yveltal** ✨');
     expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
     // The archiving is the last thing that happens to the post.
     const calls = gateway.calls.filter((call) => call.endsWith(` ${postId}`));
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 919f10192c34ef83581b7f2f168cc2e9046e0614..17abb7014a0b9bd6d65c2f8073f2e90190e47fca 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -28,9 +28,16 @@ import { setDescription } from '../domain/party/meetup.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { endParty } from '../domain/party/party.js';
 import { setName, setStartTime, setTimedEnd } from '../domain/party/timed.js';
-import { partyControls } from '../render/party-controls.js';
 import { renderMeetupPost } from '../render/meetup-post.js';
 import type { Member } from './attendance-service.js';
+import {
+  accentOf,
+  buttonLabels,
+  buttonsOf,
+  header,
+  textDisplays,
+  textOf,
+} from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
 const START = at('2026-10-13T16:00');
@@ -79,7 +86,15 @@ describe('PartyService.createMeetup', () => {
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Meetup · Community Day picnic' });
     expect(tagsOf(made)).toEqual(['Meetup']);
     expect(post?.message).toEqual(renderMeetupPost(made.service.timedView(made.current())).message);
-    expect(post?.message.components).toEqual(partyControls(made.current()));
+    expect(buttonLabels(post?.message)).toEqual([
+      'Interested',
+      'Join',
+      'Here',
+      'Leave',
+      '−1',
+      '+1',
+      'Remote',
+    ]);
   });
 
   it('links to the new post in the channel of the region, as a meetup', async () => {
@@ -215,11 +230,10 @@ describe('PartyService: the post of a meetup', () => {
     await made.service.flush();
     const post = made.gateway.posts.get(made.postId);
     expect(post?.edits).toBe(1);
-    expect(post?.message.embeds?.[0]?.fields).toEqual([
-      {
-        name: 'Trainers (3)',
-        value: `**Coming** ❄️ Alice +1\n**Interested** <@${REPORTER}>`,
-      },
+    expect(textDisplays(post?.message).slice(1, 4)).toEqual([
+      `**Interested (1)**\n<@${REPORTER}>`,
+      '**Coming (2)**\n❄️ Alice +1',
+      '**Present (0)**',
     ]);
     // A render that would change nothing is not sent.
     made.service.changed(made.party.id);
@@ -240,12 +254,11 @@ describe('PartyService: the post of a meetup', () => {
     await service.flush();
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ title: 'Meetup · Raid hour meet', renames: 1 });
-    const embed = post?.message.embeds?.[0];
-    expect(embed?.title).toBe('Raid hour meet');
-    expect(embed?.description).toContain(
+    expect(header(post?.message)).toEqual([
+      '### Meetup: Raid hour meet',
       `Starts <t:${START / 1000}:R>, at <t:${START / 1000}:t>. Ends at <t:${END / 1000}:t>.`,
-    );
-    expect(embed?.description?.endsWith('\n\n**Information**\nBring snacks.')).toBe(true);
+    ]);
+    expect(textDisplays(post?.message)).toContain('**Meeting Information**\nBring snacks.');
   });
 
   it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
@@ -273,7 +286,7 @@ describe('PartyService: the post of a meetup', () => {
     await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
     await made.service.flush();
     const [updated] = made.gateway.messagesIn(made.postId);
-    expect(updated?.message.embeds?.[0]?.fields?.[0]?.value).toContain('Alice');
+    expect(textOf(updated?.message)).toContain('Alice');
     expect(updated?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
   });
 
@@ -347,8 +360,8 @@ describe('PartyService: ending a meetup', () => {
     expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
     const post = gateway.posts.get(postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
-    expect(post?.message.components).toEqual([]);
-    expect(post?.message.embeds?.[0]?.title).toBe('Community Day picnic');
+    expect(buttonsOf(post?.message)).toEqual([]);
+    expect(header(post?.message)[0]).toBe('### Meetup: Community Day picnic');
     expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
     expect(gateway.messagesIn(postId)).toEqual([]);
     expect(gateway.calls.filter((call) => call.endsWith(` ${postId}`)).at(-1)).toBe(
@@ -372,8 +385,8 @@ describe('PartyService: ending a meetup', () => {
     expect(answered).toBe(true);
     expect(made.said()).toEqual([words]);
     const post = made.gateway.posts.get(made.postId);
-    expect(post?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(words);
-    expect(post?.message.embeds?.[0]?.color).toBe(0xe74c3c);
+    expect(header(post?.message)[1]).toBe(words);
+    expect(accentOf(post?.message)).toBe(0xe74c3c);
     expect(tagsOf(made)).toEqual(['Ended', 'Meetup']);
     expect(post).toMatchObject({ archived: true, locked: true });
   });
@@ -428,7 +441,7 @@ describe('PartyService: what is said about a meetup', () => {
       `<@${ALICE}> keeps this post open: it will not be archived by itself.`,
     ]);
     await made.service.flush();
-    expect(made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
       'Kept open by a moderator',
     );
   });
@@ -455,7 +468,7 @@ describe('PartyService: a meetup after a restart', () => {
     again.clock.now += MINUTE;
     again.service.changed(made.party.id);
     await again.service.flush();
-    expect(again.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
+    expect(textOf(again.gateway.posts.get(made.postId)?.message)).toContain(
       `Starts <t:${START / 1000}:R>`,
     );
   });
diff --git a/src/services/party-service.relocate.test.ts b/src/services/party-service.relocate.test.ts
index d1ef54fd42e409da9605a92e0f50fdc0d236efc6..d898bc3dacf073768607a16422216d15a8bc9eaa 100644
--- a/src/services/party-service.relocate.test.ts
+++ b/src/services/party-service.relocate.test.ts
@@ -18,6 +18,7 @@ import { gymsFixture } from '../../test/support/providers.js';
 import type { RaidParty } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
+import { buttonsOf, header, textDisplays, textOf } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -84,10 +85,8 @@ describe('PartyService.relocate', () => {
     expect(post?.title).toBe('Yveltal · Café Élan Fresco');
     const tags = made.tags[EAST_FORUM];
     expect([...(post?.tagIds ?? [])].sort()).toEqual([tags.Hatched, tags.T5].sort());
-    expect(post?.message.embeds?.[0]?.fields?.map((field) => field.value).join('\n')).toContain(
-      'Alice',
-    );
-    expect(post?.message.components?.length).toBeGreaterThan(0);
+    expect(textOf(post?.message)).toContain('Alice');
+    expect(buttonsOf(post?.message).length).toBeGreaterThan(0);
   });
 
   it('closes the old post with where the raid went, and archives it', async () => {
@@ -100,11 +99,12 @@ describe('PartyService.relocate', () => {
     });
     const old = made.gateway.posts.get(made.postId);
     expect(old).toMatchObject({ forumId: WEST_FORUM, archived: true, locked: true, reopened: 0 });
-    expect(old?.message.components).toEqual([]);
+    expect(buttonsOf(old?.message)).toEqual([]);
     const words = `This raid has moved to **Café Élan Fresco** in <#${EAST_CHANNEL}>: <#${party.forumPostId ?? ''}>`;
     // The reporter is signed up (interested) and allows pings.
     expect(made.said().at(-1)).toBe(`${words}\n<@${REPORTER}>`);
-    expect(old?.message.embeds?.[0]?.description?.split('\n')[1]).toBe(words);
+    // In the place of the times.
+    expect(header(old?.message)[2]).toBe(words);
     const tags = made.tags[WEST_FORUM];
     expect([...(old?.tagIds ?? [])].sort()).toEqual([tags.Ended, tags.T5].sort());
     const calls = made.gateway.calls.filter((call) => call.endsWith(` ${made.postId}`));
@@ -135,15 +135,15 @@ describe('PartyService.relocate', () => {
     await made.service.showStatus(made.party.id);
     await settled(made);
     const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
-    expect(copy?.message.content).toContain(`<#${WEST_CHANNEL}>`);
+    expect(textDisplays(copy?.message)[0]).toContain(`<#${WEST_CHANNEL}>`);
 
     const party = await moved(made);
 
     const copies = made.gateway.messagesIn(REMOTE_CHANNEL);
     expect(copies).toHaveLength(1);
     expect(copies[0]?.id).not.toBe(copy?.id);
-    expect(copies[0]?.message.content).toContain(`<#${EAST_CHANNEL}>`);
-    expect(copies[0]?.message.content).toContain(`<#${party.forumPostId ?? ''}>`);
+    expect(textDisplays(copies[0]?.message)[0]).toContain(`<#${EAST_CHANNEL}>`);
+    expect(textDisplays(copies[0]?.message)[0]).toContain(`<#${party.forumPostId ?? ''}>`);
     // The copy `/status` put into the old post is gone as well; only the last words are left.
     expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
     expect(made.store.get(party.id)?.mirrorMessages.map((mirror) => mirror.kind)).toEqual([
@@ -192,7 +192,7 @@ describe('PartyService.relocate', () => {
     expect(last?.message.content).toMatch(new RegExp(`\\n<@${REPORTER}>$`));
     // The sentence in the post's own message has no mentions.
     const old = made.gateway.posts.get(made.postId);
-    expect(old?.message.embeds?.[0]?.description?.split('\n')[1]).toMatch(/<#\d+>$/);
+    expect(header(old?.message)[2]).toMatch(/<#\d+>$/);
   });
 
   it('reads the settings of everybody it may ping in one read', async () => {
@@ -481,9 +481,7 @@ describe('PartyService.relocate: what happens meanwhile', () => {
     expect(party?.endTime).toBe(at('2026-10-13T14:30'));
     expect(outcome.party.attendees[ALICE]).toBeDefined();
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
-    expect(post?.message.embeds?.[0]?.fields?.map((field) => field.value).join('\n')).toContain(
-      'Alice',
-    );
+    expect(textOf(post?.message)).toContain('Alice');
   });
 
   it('moves a raid once: a second move at the same time finds it gone', async () => {
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index f70453a4175b8a8e7768e39c666ee47a8fd3cf4b..1aa81aaa26970893322493735a604876b57b9ccd 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -1,6 +1,5 @@
 import { endParty } from '../domain/party/party.js';
 import { RateLimitError } from 'discord.js';
-import { partyControls } from '../render/party-controls.js';
 import { describe, expect, it, vi } from 'vitest';
 import type { FakePartyGateway } from '../../test/support/fake-gateway.js';
 import {
@@ -26,6 +25,13 @@ import {
 import { setBoss } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { RaidReport } from './party-service.js';
+import {
+  buttonLabels,
+  header,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 
 const [library, fountain, , , , , lighthouse, , , trailhead] = testGyms();
 const T5 = { level: 'T5', shadow: false } as const;
@@ -84,7 +90,7 @@ describe('PartyService.reportRaid', () => {
     expect(stored?.attendees).toEqual({});
     expect(stored?.makerName).toBe('Rhea');
     const post = gateway.posts.get(outcome.party.forumPostId ?? '');
-    expect(post?.message.embeds?.[0]?.description).toContain('Reported by Rhea.');
+    expect(textOf(post?.message)).toContain('Reported by **Rhea** (<@');
   });
 
   it('stores the raid, creates its post with tags, links it in the region channel and lists it', async () => {
@@ -104,7 +110,7 @@ describe('PartyService.reportRaid', () => {
       title: 'T5 egg · The Stacks',
       tagIds: [tags[WEST_FORUM].Egg, tags[WEST_FORUM].T5],
     });
-    expect(post?.message.embeds?.[0]?.description).toContain('**T5 egg**');
+    expect(header(post?.message)[1]).toBe('**Level 5 raid** (egg)');
     expect(party).toMatchObject({
       forumChannelId: WEST_FORUM,
       regionId: 1,
@@ -275,7 +281,7 @@ describe('PartyService: keeping posts up to date', () => {
     await service.flush();
     const post = gateway.posts.get(postId);
     expect(post?.edits).toBe(1);
-    expect(post?.message.embeds?.[0]?.fields?.map((field) => field.name)).toContain('Trainers (4)');
+    expect(textOf(post?.message)).toContain('**Coming (3)**');
     // Title and tags did not change, so neither was touched.
     expect(post).toMatchObject({ renames: 0, retags: 0 });
   });
@@ -533,8 +539,8 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
     const outcome = await service.reportRaid(report());
     if (outcome.kind !== 'created') throw new Error(outcome.kind);
     await service.flush();
-    const embed = gateway.posts.get(outcome.party.forumPostId ?? '')?.message.embeds?.[0];
-    expect(embed?.fields?.map((field) => field.name)).toContain('Trainers (2)');
+    const message = gateway.posts.get(outcome.party.forumPostId ?? '')?.message;
+    expect(textDisplays(message)).toContain(`**Coming (1)**\n<@${ALICE}>`);
   });
 
   it('creates the post without the picture when Discord refuses the embed', async () => {
@@ -543,8 +549,7 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
       report({ boss: { key: 'yveltal' }, time: { end: at('2026-10-13T14:40') } }),
     );
     if (withPicture.kind !== 'created') throw new Error(withPicture.kind);
-    const picture = gateway.posts.get(withPicture.party.forumPostId ?? '')?.message.embeds?.[0]
-      ?.thumbnail?.url;
+    const picture = thumbnailOf(gateway.posts.get(withPicture.party.forumPostId ?? '')?.message);
     expect(picture).toBeDefined();
 
     gateway.rejectThumbnails = true;
@@ -552,9 +557,9 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
       report({ gym: fountain!, boss: { key: 'yveltal' }, time: { end: at('2026-10-13T14:40') } }),
     );
     if (outcome.kind !== 'created') throw new Error(outcome.kind);
-    const embed = gateway.posts.get(outcome.party.forumPostId ?? '')?.message.embeds?.[0];
-    expect(embed?.description).toContain('Yveltal');
-    expect(embed?.thumbnail).toBeUndefined();
+    const message = gateway.posts.get(outcome.party.forumPostId ?? '')?.message;
+    expect(textOf(message)).toContain('Yveltal');
+    expect(thumbnailOf(message)).toBeUndefined();
     expect(
       entries.some(
         (entry) =>
@@ -577,8 +582,8 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
     service.changed(party.id);
     await service.flush();
     const post = gateway.posts.get(postId);
-    expect(post?.message.embeds?.[0]?.thumbnail).toBeUndefined();
-    expect(post?.message.embeds?.[0]?.fields?.[0]?.name).toBe('Hatches as Yveltal');
+    expect(thumbnailOf(post?.message)).toBeUndefined();
+    expect(textOf(post?.message)).toContain('**Hatches as Yveltal**');
     expect(entries.some((entry) => entry.level === 40 && entry.party === party.id)).toBe(true);
   });
 });
@@ -1187,20 +1192,20 @@ describe('PartyService: rate limits and unchanged posts', () => {
 
   it('sends the one message the renderer made, with its components', async () => {
     const made = await raid();
-    const components = () => made.gateway.posts.get(made.postId)?.message.components;
+    const message = () => made.gateway.posts.get(made.postId)?.message;
     const rendered = () => {
       const party = made.store.get(made.party.id);
       if (!party) throw new Error('the raid is gone');
-      return renderRaidPost(made.service.view(asRaid(party))).message.components;
+      return renderRaidPost(made.service.view(asRaid(party))).message;
     };
-    expect(components()).toEqual(partyControls(made.party));
-    expect(components()).toHaveLength(2);
+    expect(message()).toEqual(rendered());
+    expect(buttonLabels(message())).not.toContain('Join A');
     // A second group changes the controls, and the edit carries them.
     await made.store.update(made.party.id, (p) => createGroup(p, ALICE, limits));
     made.service.changed(made.party.id);
     await made.service.flush();
-    expect(components()).toEqual(rendered());
-    expect(components()).toHaveLength(3);
+    expect(message()).toEqual(rendered());
+    expect(buttonLabels(message()).slice(0, 2)).toEqual(['Join A', 'Join B']);
   });
 
   it('sends nothing for a render right after creation, and nothing for an unchanged party', async () => {
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index 08d703f49bce94a064972f1b7222158341d4c138..5f8dae74cd70a54a26f594b9df211871040d0015 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -16,10 +16,18 @@ import {
   restarted,
 } from '../../test/support/party-service.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { partyControls } from '../render/party-controls.js';
 import { renderTrainPost } from '../render/train-post.js';
 import type { Member } from './attendance-service.js';
 import { WARN_AGAIN_AFTER } from './party-scheduler.js';
+import {
+  accentOf,
+  buttonLabels,
+  buttonsOf,
+  header,
+  leadOf,
+  textDisplays,
+  textOf,
+} from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -36,7 +44,7 @@ function tagsOf(made: Made, forum: typeof WEST_FORUM | typeof EAST_FORUM = WEST_
   return names.filter(([, id]) => applied.includes(id)).map(([name]) => name);
 }
 
-const embed = (made: Made) => made.gateway.posts.get(made.postId)?.message.embeds?.[0];
+const shownPost = (made: Made) => made.gateway.posts.get(made.postId)?.message;
 
 /** Runs the clock at a time and lets everything it started go out. */
 async function tickAt(made: Made, time: number): Promise<void> {
@@ -81,7 +89,7 @@ describe('PartyService.createTrain', () => {
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
     expect(tagsOf(made)).toEqual(['Train']);
     expect(post?.message).toEqual(renderTrainPost(made.service.trainView(made.current())).message);
-    expect(post?.message.components).toEqual(partyControls(made.current()));
+    expect(buttonLabels(post?.message)).toContain('Move train…');
     expect(post).toMatchObject({ edits: 0, renames: 0, retags: 0 });
   });
 
@@ -137,9 +145,9 @@ describe('PartyService: the post of a train', () => {
     expect(made.current()).toMatchObject({ regionId: 1, forumChannelId: WEST_FORUM, gymId: null });
     expect(made.gateway.posts.get(made.postId)?.forumId).toBe(WEST_FORUM);
     expect(made.gateway.postsIn(EAST_FORUM)).toEqual([]);
-    expect(embed(made)?.description).toContain('**Now at** [Café Élan Fresco](');
+    expect(textOf(shownPost(made))).toContain('**Current gym** · [Café Élan Fresco](');
     // East gets no line that links to a new train: only the copy for the stop there.
-    expect(made.gateway.messagesIn(EAST_CHANNEL).map((sent) => sent.message.content)).toEqual([
+    expect(made.gateway.messagesIn(EAST_CHANNEL).map((sent) => leadOf(sent.message))).toEqual([
       'A raid train that stops in this region. ' +
         `Sign up here to follow it in its post: <#${made.postId}>`,
     ]);
@@ -149,9 +157,13 @@ describe('PartyService: the post of a train', () => {
     const made = await createdTrain({ route: [4, 1] });
     await made.attendance.signUp(made.party.id, alice, PartyStatus.Present);
     await made.service.flush();
-    const fields = embed(made)?.fields ?? [];
-    expect(fields.map((field) => field.name)).toEqual(['Route: stop 1 of 2', 'Trainers (2)']);
-    expect(fields[1]?.value).toBe(`**Here** ❄️ Alice\n**Interested** <@${REPORTER}>`);
+    const texts = textDisplays(shownPost(made));
+    expect(texts.find((text) => text.startsWith('-# Route'))).toMatch(/^-# Route, stop 1 of 2: /);
+    expect(texts.filter((text) => /^\*\*(Interested|Coming|Present)/.test(text))).toEqual([
+      `**Interested (1)**\n<@${REPORTER}>`,
+      '**Coming (0)**',
+      '**Present (1)**\n❄️ Alice',
+    ]);
   });
 
   it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
@@ -176,7 +188,7 @@ describe('PartyService: the post of a train', () => {
       { channelId: made.postId, messageId: copy?.id, kind: 'status' },
     ]);
     expect(copy?.message).toEqual(made.gateway.posts.get(made.postId)?.message);
-    expect(copy?.message.components).toEqual(partyControls(made.current()));
+    expect(copy?.message).toEqual(renderTrainPost(made.service.trainView(made.current())).message);
   });
 
   it('lists the train in the summary of its region, with the gym it is at', async () => {
@@ -207,9 +219,9 @@ describe('PartyService: ending a train', () => {
     expect(made.store.get(made.party.id)).toBeUndefined();
     const post = made.gateway.posts.get(made.postId);
     expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
-    expect(post?.message.components).toEqual([]);
-    expect(embed(made)?.description?.split('\n')[1]).toBe('This train is over.');
-    expect(embed(made)?.color).toBe(0xe74c3c);
+    expect(buttonsOf(post?.message)).toEqual([]);
+    expect(header(shownPost(made))[1]).toBe('This train is over.');
+    expect(accentOf(shownPost(made))).toBe(0xe74c3c);
     expect(tagsOf(made)).toEqual(['Ended', 'Train']);
     expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
   });
@@ -272,7 +284,7 @@ describe('PartyScheduler: a train', () => {
       locked: true,
       reopened: 0,
     });
-    expect(embed(made)?.description?.split('\n')[1]).toBe('This train is over.');
+    expect(header(shownPost(made))[1]).toBe('This train is over.');
     expect(tagsOf(made)).toEqual(['Ended', 'Train']);
   });
 
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index c30c0f476279ded5324cdf7dc905e11ccdd6b614..cd955ecedf30f2e4d04c94a6a3605d037e3418e0 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -7,7 +7,6 @@ import {
   isMissingPermission,
   isRefusedBody,
   rateLimitWaitMs,
-  type ClassicMessage,
   type PartyGateway,
   type TagIds,
 } from '../discord/party-gateway.js';
@@ -41,7 +40,14 @@ import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
 import { meetupTitle, renderMeetupPost } from '../render/meetup-post.js';
-import { FORUM_TAGS, tidyTitle, type PostEmoji, type RenderedPost } from '../render/party-post.js';
+import {
+  FORUM_TAGS,
+  postMessage,
+  tidyTitle,
+  type PostEmoji,
+  type PostVariant,
+  type RenderedPost,
+} from '../render/party-post.js';
 import {
   raidTitle,
   renderRaidPost,
@@ -333,9 +339,12 @@ export class PartyService {
     this.notifier = notifier;
   }
 
-  /** The embed of a party's post as it is now, for whoever shows the party elsewhere (a DM). */
+  /**
+   * The party as a direct message shows it (the card of its post, an embed), as it is now, for
+   * whoever shows the party elsewhere.
+   */
   embedOf(party: Party): APIEmbed {
-    return this.rendered(party).embed;
+    return this.rendered(party).card;
   }
 
   /** The durations in effect, with the events known at this moment. */
@@ -492,14 +501,6 @@ export class PartyService {
     return post.tags.map((tag) => ids[tag]).filter((id): id is string => id !== undefined);
   }
 
-  /** The message of a rendered post without the picture of its embeds. */
-  private static withoutPicture(rendered: RenderedPost): ClassicMessage {
-    return {
-      ...rendered.message,
-      embeds: (rendered.message.embeds ?? []).map(({ thumbnail: _picture, ...rest }) => rest),
-    };
-  }
-
   /** What identifies the state of a post on Discord: its message, title and (sorted) tags. */
   private static sentKey(rendered: RenderedPost, tagIds: readonly string[]): string {
     return JSON.stringify({
@@ -1002,7 +1003,7 @@ export class PartyService {
     return { kind: 'created', party };
   }
 
-  /** Creates a post; when Discord refuses its embed, once more without the picture. */
+  /** Creates a post; when Discord refuses it and it has a picture, once more without it. */
   private async sendPost(
     partyId: string,
     forumId: string,
@@ -1017,12 +1018,12 @@ export class PartyService {
         tagIds,
       });
     } catch (err) {
-      const picture = rendered.embed.thumbnail?.url;
+      const { picture } = rendered.layout;
       if (!isRefusedBody(err) || picture === undefined) throw err;
       log.warn({ err, party: partyId, picture }, 'Discord refused the picture; posting without it');
       return gateway.createPost(forumId, {
         title: rendered.title,
-        message: PartyService.withoutPicture(rendered),
+        message: postMessage(rendered.layout, { picture: false }),
         tagIds,
       });
     }
@@ -1345,8 +1346,7 @@ export class PartyService {
     // that ended is shown as over, whatever times it had (see `renderMeetupPost`).
     const rendered = this.rendered(party, lastWords);
     await attempt('show an ended party one last time', async () => {
-      const last = { ...rendered, message: { ...rendered.message, components: [] } };
-      there = await this.editPostOf(party.id, postId, last);
+      there = await this.editPostOf(party.id, postId, rendered, { controls: false });
     });
     if (!there) {
       log.info({ party: party.id, post: postId }, 'the post of an ended party is gone');
@@ -1534,16 +1534,25 @@ export class PartyService {
     this.summaryTimers.set(regionId, { cancel, due });
   }
 
-  /** Edits a post; when Discord refuses its embed, once more without the picture. */
-  private async editPostOf(partyId: string, postId: string, rendered: RenderedPost) {
+  /**
+   * Edits a post to show the rendered party (in the form `variant` asks for: the last showing
+   * has no controls); when Discord refuses it and it has a picture, once more without it.
+   */
+  private async editPostOf(
+    partyId: string,
+    postId: string,
+    rendered: RenderedPost,
+    variant?: PostVariant,
+  ) {
     const { gateway, log } = this.options;
     try {
-      return await gateway.editPost(postId, rendered.message);
+      const message = variant ? postMessage(rendered.layout, variant) : rendered.message;
+      return await gateway.editPost(postId, message);
     } catch (err) {
-      const picture = rendered.embed.thumbnail?.url;
+      const { picture } = rendered.layout;
       if (!isRefusedBody(err) || picture === undefined) throw err;
       log.warn({ err, party: partyId, picture }, 'Discord refused the picture; editing without it');
-      return gateway.editPost(postId, PartyService.withoutPicture(rendered));
+      return gateway.editPost(postId, postMessage(rendered.layout, { ...variant, picture: false }));
     }
   }
 
diff --git a/src/services/timed-party-service.test.ts b/src/services/timed-party-service.test.ts
index 348e4410bf2edf0ab830fd26a98f42474143b24c..6187f702f71efeff4d327a0cb1237dc617104075 100644
--- a/src/services/timed-party-service.test.ts
+++ b/src/services/timed-party-service.test.ts
@@ -4,6 +4,7 @@ import { createdMeetup, reportedRaid } from '../../test/support/party-service.js
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
+import { textDisplays } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -292,11 +293,9 @@ describe('TimedPartyService.setDescription', () => {
     });
     await settled(made);
     expect(made.said()).toEqual([`**Carol** (<@${CAROL}>) changed the information.`]);
-    expect(
-      made.gateway.posts
-        .get(made.postId)
-        ?.message.embeds?.[0]?.description?.endsWith('\n\n**Information**\nBring snacks.'),
-    ).toBe(true);
+    expect(textDisplays(made.gateway.posts.get(made.postId)?.message)).toContain(
+      '**Meeting Information**\nBring snacks.',
+    );
   });
 
   it('removes it with an empty text, refuses one that is too long, and knows no change', async () => {
diff --git a/src/services/train-service.test.ts b/src/services/train-service.test.ts
index b508bec1e7b911ed05c874a8ab70a48bdb95ae12..15bb2b23a2dfd9a99aa70bc039aad0cffa87c4e2 100644
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -7,6 +7,7 @@ import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { currentStop } from '../domain/party/train.js';
 import type { Member } from './attendance-service.js';
+import { header, textOf } from '../../test/support/messages.js';
 
 const alice: Member = { id: ALICE, name: 'Alice', team: 'mystic' };
 const bob: Member = { id: BOB, name: 'Bob' };
@@ -65,8 +66,8 @@ describe('TrainService: the route', () => {
     expect(messages(made)).toEqual([
       { content: `**Alice** (<@${ALICE}>) added stop 2 to the route: **The Stacks**.` },
     ]);
-    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
-    expect(embed?.description).toContain(`**Next** [The Stacks](${maps(1)})`);
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(textOf(message)).toContain(`**Next gym** · [The Stacks](${maps(1)})`);
   });
 
   it('refuses a gym that is on the route, and a member who is not signed up, and says nothing', async () => {
@@ -479,8 +480,8 @@ describe('TrainService: the conductor and the boss', () => {
     ]);
     // A line pings nobody.
     expect(messages(made).every((message) => message.mention === undefined)).toBe(true);
-    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
-    expect(embed?.description).toContain(`Conductor: Bob.`);
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(header(message)).toContain('Conductor: Bob');
   });
 
   it('takes the conductor off for themself and for staff, and for nobody else', async () => {
@@ -549,9 +550,9 @@ describe('TrainService: the conductor and the boss', () => {
       changed: false,
     });
     await settled(made);
-    const embed = made.gateway.posts.get(made.postId)?.message.embeds?.[0];
-    expect(embed?.description).toMatch(/^\*\*Raid train\*\* after \*\*Yveltal\*\*/);
-    expect(embed?.fields?.[0]?.name).toBe('Boss');
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(header(message)[1]).toMatch(/^\*\*After Yveltal\*\*/);
+    expect(textOf(message)).toContain('**Weaknesses**');
     await made.trains.setBoss(made.party.id, bob, { boss: null, label: '' });
     await made.attendance.flush();
     expect(lines(made)).toEqual([
diff --git a/test/support/messages.ts b/test/support/messages.ts
index 82cb140103364bd2c563062d59833b3c4cc955ab..2740829be1f3613fda5b2cbfeb46f6349d7a91f3 100644
--- a/test/support/messages.ts
+++ b/test/support/messages.ts
@@ -129,3 +129,22 @@ export function thumbnailOf(message: OutgoingMessage | undefined): string | unde
   );
   return thumbnail?.media.url;
 }
+
+/** The line a copy of a post in another channel opens with: the first line of its first text. */
+export function leadOf(message: OutgoingMessage | undefined): string | undefined {
+  return textDisplays(message)[0]?.split('\n')[0];
+}
+
+/**
+ * What a copy of a post in another channel shows of the post: its text displays without the
+ * line it opens with.
+ */
+export function copiedPost(message: OutgoingMessage | undefined): string[] {
+  const [first = '', ...rest] = textDisplays(message);
+  return [first.slice(first.indexOf('\n') + 1), ...rest];
+}
+
+/** The lines of the first text of a post: its title, what it is, its times. */
+export function header(message: OutgoingMessage | undefined): string[] {
+  return textDisplays(message)[0]?.split('\n') ?? [];
+}
diff --git a/test/support/post-limits.ts b/test/support/post-limits.ts
new file mode 100644
index 0000000000000000000000000000000000000000..765e85a4a16f10a30154a5238f25a23f31feaf22
--- /dev/null
+++ b/test/support/post-limits.ts
@@ -0,0 +1,34 @@
+import { expect } from 'vitest';
+import type { MirrorKind } from '../../src/domain/party/party.js';
+import { renderMirror } from '../../src/render/mirrors.js';
+import {
+  layoutTextLength,
+  LEAD_ROOM,
+  MAX_COMPONENTS,
+  TEXT_BUDGET,
+  type RenderedPost,
+} from '../../src/render/party-post.js';
+import { FakePartyGateway } from './fake-gateway.js';
+import { componentCount } from './messages.js';
+
+const KINDS: readonly MirrorKind[] = ['status', 'remote', 'ex', 'region'];
+
+/**
+ * Asserts that Discord would take a rendered post and every copy of it, with and without its
+ * picture: the fake gateway's checks, at most 40 components, the text within its budget.
+ */
+export function expectSendable(rendered: RenderedPost): void {
+  expect(layoutTextLength(rendered.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+  const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };
+  const messages = [
+    rendered.message,
+    ...KINDS.flatMap((kind) => [
+      renderMirror(kind, rendered, place),
+      renderMirror(kind, rendered, place, { picture: false }),
+    ]),
+  ];
+  for (const message of messages) {
+    expect(componentCount(message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    FakePartyGateway.checkMessage(message);
+  }
+}
````


### Task 5: A forum post starts as a line of text where Discord refuses v2 there

Prototype commit: `8366814b670ad60ed76d7c46af09ad9587e11e32`

Discord does not document whether a components-v2 message may be the
first message of a forum post. The service tries the post as it is
until one was made; when Discord refuses that with Invalid Form Body,
it makes the post with "Setting up this post…" and edits that into the
post at once, which Discord documents. What worked is kept for the rest
of the process and logged once, with Discord's code when it switches.
A refused edit (the picture) takes the post back before the post is
tried again without its picture; once direct posts have worked, a
refusal is the message's own. A post that went during the edit answers
`no-post` to reports, meetups, trains and moves (NO_POST_MADE), not
`no-forum`; one that could not be taken back is logged with its id.

**Files:**

```
 src/commands/meetups/meetup.ts             |   4 +-
 src/commands/raids/raid.ts                 |   4 +
 src/commands/screenshots/mention.ts        |   3 +
 src/commands/trains/train.ts               |   4 +-
 src/domain/party/party.ts                  |   2 +
 src/render/activity.test.ts                |   7 ++
 src/render/activity.ts                     |   9 +++
 src/services/party-service.starter.test.ts | 206 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.ts              | 164 +++++++++++++++++++++++++++++++++------
 src/services/raid-change-service.ts        |   2 +
 10 files changed, 379 insertions(+), 26 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/render/activity.test.ts src/services/party-service.starter.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 8366814b670ad60ed76d7c46af09ad9587e11e32 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `A forum post starts as a line of text where Discord refuses v2 there`, the body above and the trailer, staging exactly
  `src/commands/meetups/meetup.ts src/commands/raids/raid.ts src/commands/screenshots/mention.ts src/commands/trains/train.ts src/domain/party/party.ts src/render/activity.test.ts src/render/activity.ts src/services/party-service.starter.test.ts src/services/party-service.ts src/services/raid-change-service.ts`.

````diff
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index 74e3141dd7a45450753db0fd0bec1aa0586d231a..d0b465cf4dfbb522f0effb29c3edd34033635166 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -5,7 +5,7 @@ import { regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { MAX_PARTY_NAME } from '../../domain/party/party.js';
-import { problemText } from '../../render/activity.js';
+import { NO_POST_MADE, problemText } from '../../render/activity.js';
 import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
 
 /** Where `/meetup` works, said wherever it does not. */
@@ -70,6 +70,8 @@ export const meetup: SimpleCommand = {
         throw new UserError(FROM_A_REGION);
       case 'no-forum':
         throw new UserError(noForumYet(outcome.region.channelId));
+      case 'no-post':
+        throw new UserError(NO_POST_MADE);
       case 'created': {
         const post = outcome.party.forumPostId;
         await interaction.editReply({
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 8d0a52a239f695ec03377dd5a8d2e0051e8cf541..23b74426cc7d356385381d15998bc20f392c25c8 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -39,6 +39,7 @@ import {
   stageOnly,
   type ReportedBoss,
 } from './raid-input.js';
+import { NO_POST_MADE } from '../../render/activity.js';
 
 /**
  * The custom-id kind of the controls this command shows. It belongs to `/raid`'s own controls
@@ -139,6 +140,9 @@ async function finish(
         `The region <#${outcome.region.channelId}> has no raid forum yet. ` +
         'A moderator can create it with `/admin setup-forums`.';
       break;
+    case 'no-post':
+      content = NO_POST_MADE;
+      break;
   }
   // What a screenshot left unsure is said, and its feedback is a button away.
   const unsure =
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index ce3adc6696b2026a37c5511d239ef6c7d3a483ec..0f7d132154fc5889e7fda5898ee3cd1f359530ba 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -30,6 +30,7 @@ import {
 } from '../../services/screenshot-service.js';
 import { gymCandidates, gymMenuOptions, gymNamerOf } from './gym-question.js';
 import { SHOT_KIND } from './shot-kind.js';
+import { NO_POST_MADE } from '../../render/activity.js';
 
 /**
  * A raid screenshot posted in a region channel with a mention of the bot (or, with
@@ -491,6 +492,8 @@ function outcomeWords(outcome: ReportOutcome, gym: Gym): string {
       return `${name} is not in any region of this server.`;
     case 'no-forum':
       return `The region <#${outcome.region.channelId}> has no raid forum yet.`;
+    case 'no-post':
+      return NO_POST_MADE;
   }
 }
 
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index f3c4dfa35620878e704195b0dc91d0e1e320790e..92baf2f577f0a9c3d6f27bc1644eab73e2cb40ca 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -6,7 +6,7 @@ import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { attendeeOf, MAX_PARTY_NAME } from '../../domain/party/party.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
-import { problemText } from '../../render/activity.js';
+import { NO_POST_MADE, problemText } from '../../render/activity.js';
 import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
 
 /** Where `/train` works, said wherever it does not. */
@@ -72,6 +72,8 @@ export const train: SimpleCommand = {
         throw new UserError(TRAIN_FROM_A_REGION);
       case 'no-forum':
         throw new UserError(noForumYet(outcome.region.channelId));
+      case 'no-post':
+        throw new UserError(NO_POST_MADE);
       case 'created': {
         const post = outcome.party.forumPostId;
         // Who made it may lay its route and set its times without being signed up; moving
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 5b0d8308b829613a1ce92e404c8d0701f008018a..cc835c4392a2c0276560d55ae573f3285a0ac51c 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -414,6 +414,8 @@ export type PartyProblem =
   | 'gym-taken'
   /** The gym lies in no region of the raid's server that has a forum for its post. */
   | 'other-region'
+  /** The post of a raid in the region it moves to went while it was being made: it stays. */
+  | 'post-not-made'
   /** The gym was deleted from the gym list meanwhile: nothing can be at it or go there. */
   | 'gym-gone'
   /** The boss of the raid does not have that move. */
diff --git a/src/render/activity.test.ts b/src/render/activity.test.ts
index a3b6f87713dac42218d42aa3f474c7b3c7a7878d..3c7d41f96c357277fd3e40ff657da6a79fa6d618 100644
--- a/src/render/activity.test.ts
+++ b/src/render/activity.test.ts
@@ -112,6 +112,13 @@ describe('problemText', () => {
     );
   });
 
+  it('says that a raid stays where it was when its post in the other region could not be made', () => {
+    expect(problemText('post-not-made', { maxNumber: 21 }, 'raid')).toBe(
+      'I could not make the post in the other region: it was deleted while I was making it. ' +
+        'The raid stays here; try again.',
+    );
+  });
+
   it('says what a train refuses: its route, its moves, its conductor', () => {
     const said = (reason: PartyProblem) => problemText(reason, { maxNumber: 21 }, 'train');
     expect(said('not-attending')).toBe('You are not signed up for this train.');
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 8da78c7a8319884e39966d05bef7611f09154a47..8fc380cdd0bc1144f7f8ea66a0e8a29f21f98fc8 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -149,6 +149,11 @@ export function problemText(
       );
     case 'gym-gone':
       return 'That gym is no longer in my gym list.';
+    case 'post-not-made':
+      return (
+        'I could not make the post in the other region: it was deleted while I was making it. ' +
+        'The raid stays here; try again.'
+      );
     case 'other-region':
       return (
         'That gym is not in a region of this server that has a raid forum, so the raid cannot ' +
@@ -181,6 +186,10 @@ export function problemText(
   }
 }
 
+/** Said when the post of a new party went while it was being made: nothing was kept. */
+export const NO_POST_MADE =
+  'I could not finish the post: it was deleted while I was making it. Nothing was kept; try again.';
+
 const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
 
 function numberWord(n: number): string {
diff --git a/src/services/party-service.starter.test.ts b/src/services/party-service.starter.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a72e7a0145f276c64097780b7a7ded79575661c9
--- /dev/null
+++ b/src/services/party-service.starter.test.ts
@@ -0,0 +1,206 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { textOf, thumbnailOf } from '../../test/support/messages.js';
+import { ALICE, REPORTER } from '../../test/support/parties.js';
+import { createdMeetup, partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { FIRST_LINE } from './party-service.js';
+
+const yveltal = { boss: { key: 'yveltal' } } as const;
+
+/** The calls of a kind, in order. */
+const callsOf = (gateway: FakePartyGateway, method: string): string[] =>
+  gateway.calls.filter((call) => call.startsWith(`${method} `));
+
+describe('PartyService: the first message of a forum post', () => {
+  it('is the post itself where Discord takes a components-v2 message there, said once', async () => {
+    const made = await reportedRaid(yveltal);
+    const post = made.gateway.posts.get(made.postId);
+    expect(post?.message.v2).toBe(true);
+    expect(post?.edits).toBe(0);
+    expect(callsOf(made.gateway, 'createPost')).toEqual([`createPost ${WEST_FORUM}`]);
+    await made.service.createMeetup({
+      name: 'Picnic',
+      creatorId: ALICE,
+      regionChannelId: WEST_CHANNEL,
+    });
+    const said = made.entries.filter((entry) => entry.msg === 'forum posts are made as they are');
+    expect(said).toHaveLength(1);
+  });
+
+  it('is a line of text edited into the post where Discord refuses it, and so from then on', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.refuseV2Starter = true;
+    const made = await reportedRaid(yveltal, {}, { gateway });
+    const post = made.gateway.posts.get(made.postId);
+    // Made with the line, then edited into the post: what the render made, nothing else.
+    expect(post?.message.v2).toBe(true);
+    expect(post?.edits).toBe(1);
+    expect(textOf(post?.message)).toContain('Level 5 raid');
+    expect(thumbnailOf(post?.message)).toBeDefined();
+    expect(post?.title).toBe('Yveltal · The Stacks');
+    // With its picture, without it (the picture might have been what was refused), then the line.
+    expect(callsOf(gateway, 'createPost')).toEqual([
+      `createPost ${WEST_FORUM}`,
+      `createPost ${WEST_FORUM}`,
+      `createPost ${WEST_FORUM}`,
+    ]);
+    expect(callsOf(gateway, 'editPost')).toEqual([`editPost ${made.postId}`]);
+    // The line is known to be classic: it is converted at once, without an edit Discord refuses.
+    expect(gateway.converted).toEqual([{ id: made.postId, direct: true }]);
+    // The render that follows the creation sends nothing: the post shows it already.
+    await made.service.flush();
+    expect(made.gateway.posts.get(made.postId)?.edits).toBe(1);
+    // The next post is made with the line at once.
+    const before = gateway.calls.length;
+    const meetup = await made.service.createMeetup({
+      name: 'Picnic',
+      creatorId: ALICE,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (meetup.kind !== 'created') throw new Error(meetup.kind);
+    expect(gateway.calls.slice(before).filter((call) => call.startsWith('createPost'))).toEqual([
+      `createPost ${WEST_FORUM}`,
+    ]);
+    expect(made.gateway.posts.get(meetup.party.forumPostId ?? '')?.message.v2).toBe(true);
+    const said = made.entries.filter(
+      (entry) => entry.msg === 'Discord refused a components-v2 first message of a forum post',
+    );
+    expect(said).toHaveLength(1);
+  });
+
+  it('first says what the post is for, in the line it is made with', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.refuseV2Starter = true;
+    const seen: unknown[] = [];
+    const create = gateway.createPost.bind(gateway);
+    gateway.createPost = (forumId, post) => {
+      seen.push(post.message);
+      return create(forumId, post);
+    };
+    await createdMeetup({}, {}, { gateway });
+    expect(seen.at(-1)).toEqual({ content: FIRST_LINE });
+  });
+
+  it('is made as it is but without its picture where Discord refuses only the picture', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.rejectThumbnails = true;
+    const made = await reportedRaid(yveltal, {}, { gateway });
+    const post = made.gateway.posts.get(made.postId);
+    expect(post?.message.v2).toBe(true);
+    expect(post?.edits).toBe(0);
+    expect(thumbnailOf(post?.message)).toBeUndefined();
+    // No line of text was posted, so no stray post flashed by.
+    expect(callsOf(gateway, 'createPost')).toHaveLength(2);
+    expect(gateway.deletedPosts).toEqual([]);
+    expect(made.entries.map((entry) => entry.msg)).toContain('forum posts are made as they are');
+    // And so from then on: the next post is made without the line too.
+    const meetup = await made.service.createMeetup({
+      name: 'Picnic',
+      creatorId: ALICE,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (meetup.kind !== 'created') throw new Error(meetup.kind);
+    expect(callsOf(gateway, 'createPost')).toHaveLength(3);
+  });
+
+  it('falls back to the line only when the post without its picture is refused too', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.refuseV2Starter = true;
+    gateway.rejectThumbnails = true;
+    const made = await reportedRaid(yveltal, {}, { gateway });
+    const post = made.gateway.posts.get(made.postId);
+    expect(post?.message.v2).toBe(true);
+    expect(thumbnailOf(post?.message)).toBeUndefined();
+    expect(callsOf(gateway, 'createPost')).toHaveLength(3);
+    // The line is edited into the post without the picture: nothing was taken back.
+    expect(post?.edits).toBe(1);
+    expect(gateway.deletedPosts).toEqual([]);
+  });
+});
+
+describe('PartyService: the first message of a forum post, when things go wrong', () => {
+  it('says with Discord’s code why it makes posts with a line of text from now on', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.refuseV2Starter = true;
+    const made = await reportedRaid(yveltal, {}, { gateway });
+    const switched = made.entries.find(
+      (entry) => entry.msg === 'Discord refused a components-v2 first message of a forum post',
+    );
+    expect(switched).toMatchObject({ level: 30, code: 50035 });
+  });
+
+  it('answers that the post could not be made when it went during the edit, not that there is no forum', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.refuseV2Starter = true;
+    const made = await partyServiceWith([], {}, { gateway });
+    const edit = gateway.editPost.bind(gateway);
+    gateway.editPost = (postId, message, options) => {
+      gateway.gone.add(postId);
+      return edit(postId, message, options);
+    };
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('no gym 1');
+    const outcome = await made.service.reportRaid({
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    expect(outcome).toEqual({ kind: 'no-post' });
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('names the post it could not take back, so that staff find a stray first line', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.refuseV2Starter = true;
+    gateway.textLimit = 20;
+    gateway.failing.set('deletePost', new Error('Discord is down'));
+    const made = await partyServiceWith([], {}, { gateway });
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('no gym 1');
+    await made.service
+      .reportRaid({
+        gym,
+        reporterId: REPORTER,
+        anonymous: false,
+        autoStatus: PartyStatus.Interested,
+        tier: { level: 'T5', shadow: false },
+        boss: { key: 'yveltal' },
+      })
+      .catch(() => undefined);
+    const stray = made.entries.find((entry) => entry.msg === 'could not delete a lost post');
+    expect(stray).toMatchObject({ level: 50 });
+    expect(typeof stray?.post).toBe('string');
+  });
+
+  it('refuses a post Discord refuses for its length, on either path, and keeps no raid', async () => {
+    for (const refuseV2Starter of [false, true]) {
+      const gateway = new FakePartyGateway();
+      gateway.refuseV2Starter = refuseV2Starter;
+      gateway.textLimit = 20;
+      const made = await partyServiceWith([], {}, { gateway });
+      const gym = gymsFixture().get(1);
+      if (!gym) throw new Error('no gym 1');
+      await expect(
+        made.service.reportRaid({
+          gym,
+          reporterId: REPORTER,
+          anonymous: false,
+          autoStatus: PartyStatus.Interested,
+          tier: { level: 'T5', shadow: false },
+          boss: null,
+        }),
+      ).rejects.toThrow('Invalid Form Body');
+      expect(made.store.active()).toEqual([]);
+      // Whatever was made on the way was taken back.
+      expect(
+        gateway.postsIn(WEST_FORUM).filter((post) => !gateway.deletedPosts.includes(post.id)),
+      ).toHaveLength(0);
+    }
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index cd955ecedf30f2e4d04c94a6a3605d037e3418e0..e8eca05b39dfa3c8facbb432a14d811a78fd48f6 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -1,4 +1,4 @@
-import type { APIEmbed } from 'discord.js';
+import { DiscordAPIError, type APIEmbed } from 'discord.js';
 import type { Settings } from '../config/settings.js';
 import type { Gym } from '../db/repositories/gym-repository.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -7,6 +7,8 @@ import {
   isMissingPermission,
   isRefusedBody,
   rateLimitWaitMs,
+  type NewPost,
+  type OutgoingMessage,
   type PartyGateway,
   type TagIds,
 } from '../discord/party-gateway.js';
@@ -73,6 +75,19 @@ import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
 const MINUTE = 60_000;
 /** Logged when a party that cannot be shown cannot be ended either. */
 const NO_POST = 'could not end a party without a post';
+
+/**
+ * The first message of a post where Discord refuses a components-v2 one there: it is edited into
+ * the post at once (see `PartyService.createPost`).
+ */
+export const FIRST_LINE = 'Setting up this post…';
+
+/** The post of a new party went while it was being made: it could not be finished. */
+class PostLostError extends Error {
+  constructor() {
+    super('the new post went while it was being made');
+  }
+}
 /** Discord lets a thread be renamed twice in ten minutes. */
 const RENAMES = 2;
 const RENAME_WINDOW_MS = 10 * MINUTE;
@@ -128,7 +143,9 @@ export type ReportOutcome =
   /** The gym was deleted from the gym list while the report was on its way. */
   | { kind: 'gym-gone' }
   /** The gym's region has no forum yet (`/admin setup-forums`). */
-  | { kind: 'no-forum'; region: Region };
+  | { kind: 'no-forum'; region: Region }
+  /** The post went while it was being made (`NO_POST_MADE`): nothing was kept. */
+  | { kind: 'no-post' };
 
 /** A timed party that a member makes: a meetup with `/meetup`, a train with `/train`. */
 export interface TimedRequest {
@@ -160,7 +177,9 @@ export type TimedOutcome<P extends TimedParty> =
   /** The channel is not the channel of a region of a server. */
   | { kind: 'no-region' }
   /** The region has no forum yet (`/admin setup-forums`). */
-  | { kind: 'no-forum'; region: Region };
+  | { kind: 'no-forum'; region: Region }
+  /** The post went while it was being made (`NO_POST_MADE`): nothing was kept. */
+  | { kind: 'no-post' };
 
 export type MeetupOutcome = TimedOutcome<MeetupParty>;
 export type TrainOutcome = TimedOutcome<TrainParty>;
@@ -173,6 +192,8 @@ export type RelocateOutcome =
   | { kind: 'taken'; other: RaidParty }
   /** The region has no forum (any more): the raid stays where it is. */
   | { kind: 'no-forum' }
+  /** The new post went while it was being made: the raid stays where it is. */
+  | { kind: 'no-post' }
   /** The gym was deleted from the gym list meanwhile: the raid stays where it is. */
   | { kind: 'gym-gone' }
   /** `party` is the raid in its new place, `from` the party it was, which has ended. */
@@ -271,6 +292,12 @@ export class PartyService {
    * the post was last known to exist. An edit that would send the same is not made.
    */
   private readonly sent = new Map<string, { key: string; checkedAt: number }>();
+  /**
+   * How a post is made, once one was: with its message as its first message (`direct`), or with
+   * a line of text that is then edited into the message (`edited`), where Discord refuses a
+   * components-v2 message as the first message of a post (not documented either way).
+   */
+  private starter: 'direct' | 'edited' | undefined;
   /**
    * The text last sent to each region's summary post, and the post it went to. A summary whose
    * text would be the same is not edited again.
@@ -724,7 +751,9 @@ export class PartyService {
     party: P,
     region: Region,
     rendered: RenderedPost,
-  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region }> {
+  ): Promise<
+    { kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | { kind: 'no-post' }
+  > {
     const creation = this.createPostFor(party, region, rendered);
     this.creating.set(
       party.id,
@@ -811,6 +840,7 @@ export class PartyService {
     const created = await this.unlessRegionClosed(region, () =>
       this.createTracked(raid, region, rendered),
     );
+    if (created?.kind === 'no-post') return created;
     if (created?.kind !== 'created') return { kind: 'no-forum' };
     const postId = created.party.forumPostId;
 
@@ -938,7 +968,9 @@ export class PartyService {
     fresh: P,
     region: Region,
     rendered: RenderedPost,
-  ): Promise<{ kind: 'created'; party: P } | { kind: 'no-forum'; region: Region }> {
+  ): Promise<
+    { kind: 'created'; party: P } | { kind: 'no-forum'; region: Region } | { kind: 'no-post' }
+  > {
     const { store, gateway, log } = this.options;
     const forumId = region.forumChannelId ?? '';
     const word = partyWord(fresh);
@@ -950,6 +982,7 @@ export class PartyService {
     } catch (err) {
       this.dropTags(forumId);
       await this.abandon(fresh.id, NO_POST);
+      if (err instanceof PostLostError) return { kind: 'no-post' };
       throw err;
     }
     if (postId === undefined) {
@@ -1003,39 +1036,122 @@ export class PartyService {
     return { kind: 'created', party };
   }
 
-  /** Creates a post; when Discord refuses it and it has a picture, once more without it. */
-  private async sendPost(
+  /**
+   * Creates a post; when Discord refuses it and it has a picture, once more without it
+   * (`createPost` tries both, on either way of making a post).
+   */
+  private sendPost(
     partyId: string,
     forumId: string,
     rendered: RenderedPost,
     tagIds: string[],
+  ): Promise<string | undefined> {
+    const { picture } = rendered.layout;
+    return this.createPost(
+      partyId,
+      forumId,
+      { title: rendered.title, message: rendered.message, tagIds },
+      picture === undefined
+        ? undefined
+        : { picture, message: postMessage(rendered.layout, { picture: false }) },
+    );
+  }
+
+  /**
+   * Creates a post with this message as its first. Whether Discord takes a components-v2 message
+   * as the first message of a forum post is not documented: until a post was made it is tried,
+   * and when Discord refuses it (Invalid Form Body), the post is made with a line of text that is
+   * edited into the message at once, which Discord does document (converted at once: the line is
+   * known to be classic). A message with a picture is tried without it (`bare`) before a way is
+   * given up: the picture may be what Discord refused, and a line posted for nothing would flash
+   * by. What worked is kept for the rest of the process and logged once. A refusal of the edit
+   * without the picture takes the post back and is thrown; a refusal once direct posts have
+   * worked is the message's own, and is thrown.
+   */
+  private async createPost(
+    partyId: string,
+    forumId: string,
+    post: NewPost,
+    bare?: { picture: string; message: OutgoingMessage },
   ): Promise<string | undefined> {
     const { gateway, log } = this.options;
-    try {
-      return await gateway.createPost(forumId, {
-        title: rendered.title,
-        message: rendered.message,
-        tagIds,
-      });
-    } catch (err) {
-      const { picture } = rendered.layout;
-      if (!isRefusedBody(err) || picture === undefined) throw err;
-      log.warn({ err, party: partyId, picture }, 'Discord refused the picture; posting without it');
-      return gateway.createPost(forumId, {
-        title: rendered.title,
-        message: postMessage(rendered.layout, { picture: false }),
-        tagIds,
-      });
+    const messages = bare === undefined ? [post.message] : [post.message, bare.message];
+    /** Said when the message went without its picture after `err`. */
+    const withoutPicture = (err: unknown) => {
+      log.warn(
+        { err, party: partyId, picture: bare?.picture },
+        'Discord refused the picture; posting without it',
+      );
+    };
+    let refusal: unknown;
+    if (this.starter !== 'edited') {
+      for (const [n, message] of messages.entries()) {
+        try {
+          const postId = await gateway.createPost(forumId, { ...post, message });
+          if (postId !== undefined && this.starter === undefined) {
+            this.starter = 'direct';
+            log.info({ party: partyId }, 'forum posts are made as they are');
+          }
+          if (n > 0) withoutPicture(refusal);
+          return postId;
+        } catch (err) {
+          if (!isRefusedBody(err)) throw err;
+          if (this.starter === 'direct' && n === messages.length - 1) throw err;
+          refusal = err;
+        }
+      }
+    }
+    const postId = await gateway.createPost(forumId, {
+      ...post,
+      message: { content: FIRST_LINE },
+    });
+    if (postId === undefined) return undefined;
+    let edited = false;
+    let pictureRefusal: unknown;
+    for (const [n, message] of messages.entries()) {
+      try {
+        edited = await gateway.editPost(postId, message, { convert: true });
+        if (n > 0) withoutPicture(pictureRefusal);
+        break;
+      } catch (err) {
+        if (isRefusedBody(err) && n < messages.length - 1) {
+          pictureRefusal = err;
+          continue;
+        }
+        await this.discardPost(partyId, postId);
+        throw err;
+      }
+    }
+    if (!edited) {
+      // Deleted that very moment: the forum is still there, the post is not.
+      await this.discardPost(partyId, postId);
+      throw new PostLostError();
+    }
+    if (this.starter !== 'edited') {
+      this.starter = 'edited';
+      log.info(
+        {
+          party: partyId,
+          ...(refusal instanceof DiscordAPIError ? { code: refusal.code } : {}),
+        },
+        'Discord refused a components-v2 first message of a forum post',
+      );
     }
+    return postId;
   }
 
-  /** Deletes a post that no stored party has, and ends the party. */
-  private async discard(partyId: string, postId: string): Promise<void> {
+  /** Deletes a post made a moment ago that will not be used; a failure is only logged. */
+  private async discardPost(partyId: string, postId: string): Promise<void> {
     try {
       await this.options.gateway.deletePost(postId);
     } catch (err) {
       this.options.log.error({ err, party: partyId, post: postId }, 'could not delete a lost post');
     }
+  }
+
+  /** Deletes a post that no stored party has, and ends the party. */
+  private async discard(partyId: string, postId: string): Promise<void> {
+    await this.discardPost(partyId, postId);
     await this.abandon(partyId, NO_POST);
   }
 
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index cb6a31b04710ba74c67225ce47358bc12ea661ed..3e056e6da96fe37c636f7e7e411fc5c6ac22f964 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -322,6 +322,8 @@ export class RaidChangeService {
         return { kind: 'refused', reason: 'gym-taken', other: outcome.other };
       case 'no-forum':
         return { kind: 'refused', reason: 'other-region' };
+      case 'no-post':
+        return { kind: 'refused', reason: 'post-not-made' };
       case 'gym-gone':
         return { kind: 'refused', reason: 'gym-gone' };
       case 'moved': {
````


### Task 6: Second names of commands, /interested, and /rank in each league

Prototype commit: `84bf3a1c617a0a86ee12b39eab18329fe23e84fb`

A command may have other forms (CommandBase.formOf): alsoAs(command,
name) registers the same command under another name, with its guards,
handlers, throttle and help (its examples by its own name); the router
keys both names to it, counts the uses of a form as the command's and
names the name the member typed in "You can use /x again"; /help lists
the forms beside the command's name on its line, explains a form with
whose name it is, and offers both while one is typed.

/maybe is /interested now, with /hmm as a second name; /coming is a
second name of /join (button actions keep their custom ids). /little,
/great, /ultra and /master are /rank with the league fixed: the same
options but the league, guards and contexts, and their uses count as
/rank's. The role-auth export names every form beside its command
(Discord sets each by itself). The commands are 65 now; a registration
is needed.

**Files:**

```
 scripts/role-auth/report.test.ts        |  22 ++++++
 scripts/role-auth/report.ts             |   9 ++-
 src/commands/index.ts                   |  20 ++++-
 src/commands/parties/attendance.test.ts |  61 ++++++++++++++--
 src/commands/parties/attendance.ts      |  12 ++-
 src/commands/parties/in-meetup.test.ts  |   8 +-
 src/commands/parties/in-train.test.ts   |   8 +-
 src/commands/util/help-render.test.ts   |  11 +++
 src/commands/util/help-render.ts        |  14 +++-
 src/commands/util/help.test.ts          |  45 ++++++++++--
 src/commands/util/rank.test.ts          |  72 +++++++++++++++++-
 src/commands/util/rank.ts               | 206 ++++++++++++++++++++++++++++++++++------------------
 src/discord/command.ts                  |  50 +++++++++++++
 src/discord/router.test.ts              |  20 ++++-
 src/discord/router.ts                   |  19 +++--
 15 files changed, 466 insertions(+), 111 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit scripts/role-auth/report.test.ts src/commands/parties/attendance.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/util/help-render.test.ts src/commands/util/help.test.ts src/commands/util/rank.test.ts src/discord/router.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 84bf3a1c617a0a86ee12b39eab18329fe23e84fb -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `Second names of commands, /interested, and /rank in each league`, the body above and the trailer, staging exactly
  `scripts/role-auth/report.test.ts scripts/role-auth/report.ts src/commands/index.ts src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/util/help-render.test.ts src/commands/util/help-render.ts src/commands/util/help.test.ts src/commands/util/rank.test.ts src/commands/util/rank.ts src/discord/command.ts src/discord/router.test.ts src/discord/router.ts`.

````diff
diff --git a/scripts/role-auth/report.test.ts b/scripts/role-auth/report.test.ts
index 55cf6fd8c1cbd2c3d55522287a267de314cf5dfd..f2b978bf2c0708054dc9fa18b776c7b8a5999fcc 100644
--- a/scripts/role-auth/report.test.ts
+++ b/scripts/role-auth/report.test.ts
@@ -159,6 +159,28 @@ describe('the mapping of legacy commands', () => {
     }
   });
 
+  it('names every other form of a command wherever it names the command: staff set each', () => {
+    const forms = commands.flatMap((command) =>
+      command.formOf === undefined ? [] : [[`/${command.formOf}`, `/${command.data.name}`]],
+    );
+    expect(forms).toContainEqual(['/interested', '/hmm']);
+    expect(forms).toContainEqual(['/join', '/coming']);
+    expect(forms).toContainEqual(['/rank', '/great']);
+    for (const [legacy, becomes] of Object.entries(LEGACY_COMMANDS)) {
+      if (becomes.kind !== 'slash') continue;
+      for (const [original, form] of forms) {
+        if (original !== undefined && becomes.commands.includes(original)) {
+          expect(becomes.commands, `${legacy}: ${form} beside ${original}`).toContain(form);
+        }
+      }
+    }
+    expect(newCommandOf('maybe')).toEqual({ kind: 'slash', commands: ['/interested', '/hmm'] });
+    expect(newCommandOf('rank')).toEqual({
+      kind: 'slash',
+      commands: ['/rank', '/little', '/great', '/ultra', '/master'],
+    });
+  });
+
   it('knows the legacy names of the spec, without regard to case', () => {
     expect(newCommandOf('meetup')).toEqual({ kind: 'slash', commands: ['/meetup'] });
     expect(newCommandOf(' Left ')).toEqual({ kind: 'slash', commands: ['/end'] });
diff --git a/scripts/role-auth/report.ts b/scripts/role-auth/report.ts
index a0872beeb47dffc989f0491b99b395856b31b2d7..d73db71fc49a54ae43a07803cc6743b3f4d3fe40 100644
--- a/scripts/role-auth/report.ts
+++ b/scripts/role-auth/report.ts
@@ -10,7 +10,8 @@ import type { LegacyCommandRoles } from '../../src/db/repositories/role-authoriz
 /**
  * What a legacy command became:
  * - `slash`: these commands of the new bot (top-level names: Discord sets permissions per
- *   command, not per subcommand);
+ *   command, not per subcommand), every other name or short form of one with it (`/hmm` with
+ *   `/interested`): Discord sets each by itself;
  * - `dropped`: the new bot has nothing that does it.
  */
 export type NewCommand =
@@ -31,8 +32,8 @@ const COMMANDO = 'a built-in command of the old command framework';
  */
 export const LEGACY_COMMANDS: Readonly<Record<string, NewCommand>> = {
   // In a party.
-  join: slash('/join'),
-  maybe: slash('/maybe'),
+  join: slash('/join', '/coming'),
+  maybe: slash('/interested', '/hmm'),
   here: slash('/here'),
   'not-here': slash('/not-here'),
   leave: slash('/leave'),
@@ -102,7 +103,7 @@ export const LEGACY_COMMANDS: Readonly<Record<string, NewCommand>> = {
   bounds: slash('/bounds'),
   // Utilities (Phase 6).
   request: slash('/request'),
-  rank: slash('/rank'),
+  rank: slash('/rank', '/little', '/great', '/ultra', '/master'),
   counters: slash('/counters'),
   'boss-tier': slash('/boss-tier'),
   find: slash('/find-region'),
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 6121c05a5a25139b3febdb0979d01c88d9b3b1f9..6f18c85bd14fb42274b8ae489ca9bc57492f8559 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -4,7 +4,18 @@ import { friendCode, nickname } from './friends/friends.js';
 import { gym } from './gyms/index.js';
 import { info } from './meetups/info.js';
 import { meetup } from './meetups/meetup.js';
-import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
+import {
+  coming,
+  done,
+  here,
+  hmm,
+  interested,
+  join,
+  leave,
+  local,
+  notHere,
+  remote,
+} from './parties/attendance.js';
 import { group } from './parties/group.js';
 import { deleteParty } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
@@ -34,7 +45,7 @@ import { findRegion } from './util/find-region.js';
 import { help } from './util/help.js';
 import { maps } from './util/maps.js';
 import { request } from './util/request.js';
-import { rank } from './util/rank.js';
+import { leagueRanks, rank } from './util/rank.js';
 
 /** Every slash command. The router and the deploy script both read this list. */
 export const commands: readonly CommandModule[] = [
@@ -44,7 +55,9 @@ export const commands: readonly CommandModule[] = [
   train,
   meetup,
   join,
-  maybe,
+  coming,
+  interested,
+  hmm,
   here,
   notHere,
   done,
@@ -91,6 +104,7 @@ export const commands: readonly CommandModule[] = [
   gym,
   region,
   rank,
+  ...leagueRanks,
   counters,
   bossTier,
   maps,
diff --git a/src/commands/parties/attendance.test.ts b/src/commands/parties/attendance.test.ts
index e59d8cd5ce2841424d28746b5f88e89aa0135f31..5f996dfce42b3b0fda7c3737215bb2da7ba9e7dc 100644
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -10,10 +10,33 @@ import { InteractionRouter } from '../../discord/router.js';
 import { attendeeOf, endParty } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import type { RaidReport } from '../../services/party-service.js';
-import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
+import {
+  coming,
+  done,
+  here,
+  hmm,
+  interested,
+  join,
+  leave,
+  local,
+  notHere,
+  remote,
+} from './attendance.js';
 import { group } from './group.js';
 
-const all: CommandModule[] = [join, maybe, here, notHere, done, leave, remote, local, group];
+const all: CommandModule[] = [
+  join,
+  coming,
+  interested,
+  hmm,
+  here,
+  notHere,
+  done,
+  leave,
+  remote,
+  local,
+  group,
+];
 
 async function setup(report: Partial<RaidReport> = {}) {
   const made = await reportedRaid(report);
@@ -69,11 +92,37 @@ describe('the attendance commands', () => {
     expect(made.said()).toEqual([`**Alice** (<@${ALICE}>) is coming.`]);
   });
 
+  it('/coming is /join and /hmm is /interested by other names, with the same options', async () => {
+    const made = await setup();
+    expect(await made.answer('hmm', { count: 2 })).toBe('You are interested with 1 more.');
+    expect(made.alice()).toMatchObject({ status: PartyStatus.Interested, number: 2 });
+    expect(await made.answer('coming')).toBe('You are coming with 1 more.');
+    expect(made.alice()).toMatchObject({ status: PartyStatus.Coming });
+    for (const [other, original] of [
+      [hmm, interested],
+      [coming, join],
+    ] as const) {
+      const { name, ...json } = other.data.toJSON();
+      const { name: _name, ...same } = original.data.toJSON();
+      expect(json).toEqual(same);
+      expect(name).not.toBe(original.data.name);
+      expect(other.formOf).toBe(original.data.name);
+      expect(other.throttle).toBe(original.throttle);
+      // Its help shows how to use it by its own name.
+      expect(other.help.examples).toEqual(
+        original.help.examples?.map((example) =>
+          example.replace(`/${original.data.name}`, `/${name}`),
+        ),
+      );
+      expect(other.help.examples?.every((example) => example.startsWith(`/${name}`))).toBe(true);
+    }
+  });
+
   it('takes a head count that includes the member, and refuses one that is too large', async () => {
     const made = await setup();
     expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
     expect(await made.answer('here')).toBe('You are here with 2 more.');
-    expect(await made.answer('maybe', { count: 1 })).toBe('You are interested.');
+    expect(await made.answer('interested', { count: 1 })).toBe('You are interested.');
     expect(await made.answer('join', { count: 22 })).toBe(
       'Give the number of trainers including yourself, from 1 to 21.',
     );
@@ -87,7 +136,7 @@ describe('the attendance commands', () => {
     expect(await made.answer('join', { group: 'A' })).toBe('You are coming, in group A.');
     // Without a group, a member stays where they are; a new member lands in the newest group.
     expect(await made.answer('here')).toBe('You are here, in group A.');
-    expect(await made.answer('maybe', {}, { userId: CAROL })).toBe(
+    expect(await made.answer('interested', {}, { userId: CAROL })).toBe(
       'You are interested, in group B.',
     );
   });
@@ -210,11 +259,11 @@ describe('the attendance commands', () => {
 
   it('holds back a member who uses one command more than thirty times a minute', async () => {
     const made = await setup();
-    for (let n = 0; n < 30; n++) await made.run(n % 2 === 0 ? 'join' : 'maybe');
+    for (let n = 0; n < 30; n++) await made.run(n % 2 === 0 ? 'join' : 'interested');
     expect(await made.answer('join')).toBe('You are coming.');
     for (let n = 0; n < 14; n++) await made.run('join');
     expect(await made.answer('join')).toMatch(/^You can use \/join again in /);
-    expect(await made.answer('maybe')).toBe('You are interested.');
+    expect(await made.answer('interested')).toBe('You are interested.');
   });
 
   it('files every one of them under the raid basics, with a description of what it does', () => {
diff --git a/src/commands/parties/attendance.ts b/src/commands/parties/attendance.ts
index 646be58afa75cac29529ed4f2f1fe1c19c622128..617474e3c6cd35fbf3946d4cdab0627c2ea99745 100644
--- a/src/commands/parties/attendance.ts
+++ b/src/commands/parties/attendance.ts
@@ -1,6 +1,6 @@
 import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import { alsoAs, type SimpleCommand } from '../../discord/command.js';
 import { requireParty } from '../../discord/guards.js';
 import type { AttendanceOptions } from '../../domain/party/attendance.js';
 import type { Party } from '../../domain/party/party.js';
@@ -107,13 +107,16 @@ function remoteCommand(name: string, description: string, remote: boolean): Simp
   };
 }
 
-export const maybe = signUpCommand(
-  'maybe',
+export const interested = signUpCommand(
+  'interested',
   'Say that you are interested in this raid, train or meetup',
   PartyStatus.Interested,
   'Marks you as interested.',
 );
 
+/** `/interested` by a shorter name (Matt, 2026-10-15). */
+export const hmm = alsoAs(interested, 'hmm');
+
 export const join = signUpCommand(
   'join',
   'Say that you are coming to this raid, train or meetup',
@@ -121,6 +124,9 @@ export const join = signUpCommand(
   'Marks you as coming.',
 );
 
+/** `/join` by the name of its status, as the legacy bot had it (Matt, 2026-10-15). */
+export const coming = alsoAs(join, 'coming');
+
 export const here = signUpCommand(
   'here',
   'Say that you have arrived at this raid or meetup, or at the stop a train is at',
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 1a7f8101e52875a288c4c88ba7fba444460638f0..55f373f5dd613838d137b154dfaa30ddff307b31 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -29,7 +29,7 @@ import { admin } from '../admin/index.js';
 import { info, INFO_INPUT, infoControls, infoForm } from '../meetups/info.js';
 import { meetup } from '../meetups/meetup.js';
 import { end } from '../raids/change.js';
-import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
+import { done, here, interested, join, leave, local, notHere, remote } from './attendance.js';
 import { deleteParty } from './delete.js';
 import { group } from './group.js';
 import { cancelMeet, meet } from './meet.js';
@@ -40,7 +40,7 @@ import { buttonsOf, header, textOf } from '../../../test/support/messages.js';
 
 const all: CommandModule[] = [
   join,
-  maybe,
+  interested,
   here,
   notHere,
   done,
@@ -152,7 +152,7 @@ async function setup() {
 describe('the attendance commands in the post of a meetup', () => {
   it('sign a member up and take them off again, in the words of a meetup', async () => {
     const made = await setup();
-    expect(await made.answer('maybe')).toBe('You are interested.');
+    expect(await made.answer('interested')).toBe('You are interested.');
     expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
     expect(await made.answer('here')).toBe('You are here with 2 more.');
     expect(await made.answer('not-here')).toBe('You are interested with 2 more.');
@@ -709,7 +709,7 @@ describe('what a member of a meetup is told', () => {
       ['join', { group: 'Z' }],
       ['join', { count: 99 }],
       ['join'],
-      ['maybe'],
+      ['interested'],
       ['here'],
       ['remote'],
       ['local'],
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index f034547a854dd69fcc509bfeef4cea9e8538f35b..463ebb66e0301b96a7c2239710decbec4e7ea9f6 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -27,7 +27,7 @@ import { conductor } from '../trains/conductor.js';
 import { finish, next, previous, skip } from '../trains/move.js';
 import { route } from '../trains/route.js';
 import { train } from '../trains/train.js';
-import { done, here, join, leave, local, maybe, notHere, remote } from './attendance.js';
+import { done, here, interested, join, leave, local, notHere, remote } from './attendance.js';
 import { deleteParty } from './delete.js';
 import { group } from './group.js';
 import { cancelMeet, meet } from './meet.js';
@@ -44,7 +44,7 @@ import {
 
 const all: CommandModule[] = [
   join,
-  maybe,
+  interested,
   here,
   notHere,
   done,
@@ -188,7 +188,7 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
 describe('the attendance commands in the post of a train', () => {
   it('sign a member up and take them off again, in the words of a train', async () => {
     const made = await setup();
-    expect(await made.answer('maybe')).toBe('You are interested.');
+    expect(await made.answer('interested')).toBe('You are interested.');
     expect(await made.answer('join', { count: 3 })).toBe('You are coming with 2 more.');
     expect(await made.answer('here')).toBe('You are here with 2 more.');
     expect(await made.answer('not-here')).toBe('You are interested with 2 more.');
@@ -707,7 +707,7 @@ describe('what a member of a train is told', () => {
       ['join', { group: 'Z' }],
       ['join', { count: 99 }],
       ['join'],
-      ['maybe'],
+      ['interested'],
       ['here'],
       ['remote'],
       ['local'],
diff --git a/src/commands/util/help-render.test.ts b/src/commands/util/help-render.test.ts
index b57b5668a81b71c03b88bcdcdc14ba8b79e7367a..6bc5b848ce59eaeb3e2632cb707034434ef653f6 100644
--- a/src/commands/util/help-render.test.ts
+++ b/src/commands/util/help-render.test.ts
@@ -144,6 +144,17 @@ describe('renderHelpOverview', () => {
       expect(field.value.length).toBeLessThanOrEqual(1024);
       for (const line of field.value.split('\n')) expect(line).toMatch(/^`\/[a-z-]+` \S.*$/);
     }
+    // A command's other names stand beside it, and its category keeps its descriptions.
+    const basics = fields.find((field) => field.name === 'Raid Basics')?.value.split('\n');
+    expect(basics).toContain(
+      '`/interested` `/hmm` Say that you are interested in this raid, train or meetup',
+    );
+    expect(basics).toContain(
+      '`/join` `/coming` Say that you are coming to this raid, train or meetup',
+    );
+    expect(fields.find((field) => field.name === 'Utility')?.value.split('\n')).toContain(
+      '`/rank` `/little` `/great` `/ultra` `/master` The PvP rank of a Pokémon with these IVs in a league',
+    );
     expect(fields.find((field) => field.name === 'Meetups')?.value.split('\n')).toEqual([
       '`/info` Write what there is to know about this meetup, in a form',
       '`/meetup` Create a meetup in this region, with a post of its own',
diff --git a/src/commands/util/help-render.ts b/src/commands/util/help-render.ts
index feba4f72b86488f5cd413089dc8527a7d7920b44..6afa1cbe48992b755791538cbda6b5c28fb9b340 100644
--- a/src/commands/util/help-render.ts
+++ b/src/commands/util/help-render.ts
@@ -48,7 +48,14 @@ export function renderHelpOverview(
   includeStaff: boolean,
 ): EmbedBuilder {
   const byCategory = new Map<HelpCategory, CommandModule[]>();
+  /** The other forms of each command (`/hmm` of `/interested`), listed on its line. */
+  const forms = new Map<string, string[]>();
+  const listedNames = new Set(commands.map((command) => command.data.name));
   for (const command of commands) {
+    if (command.formOf !== undefined && listedNames.has(command.formOf)) {
+      forms.set(command.formOf, [...(forms.get(command.formOf) ?? []), command.data.name]);
+      continue;
+    }
     const list = byCategory.get(command.help.category) ?? [];
     list.push(command);
     byCategory.set(command.help.category, list);
@@ -59,8 +66,11 @@ export function renderHelpOverview(
     ...(includeStaff ? categories.filter((c) => !helpGroups.includes(c)).sort() : []),
   ];
 
-  const described = (c: CommandModule) => `\`/${c.data.name}\` ${c.data.toJSON().description}`;
-  const named = (c: CommandModule) => `\`/${c.data.name}\``;
+  // A command's other forms stand beside its name, with no more words: the field of the
+  // commands of a party is close to what a field holds.
+  const named = (c: CommandModule) =>
+    [c.data.name, ...(forms.get(c.data.name) ?? [])].map((name) => `\`/${name}\``).join(' ');
+  const described = (c: CommandModule) => `${named(c)} ${c.data.toJSON().description}`;
   // A category whose lines with descriptions do not fit one field lists its names only, so
   // that no command is missing from the overview; names are never cut.
   const fieldsWith = (descriptions: boolean) =>
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index 5590eeae816e0dca9aa349d7565b5cd1c4e2ae79..abf99606828f7c23e501121f3ed31bffd61b2698 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -14,7 +14,7 @@ import {
 } from '../../../test/support/fake-interactions.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { commandGroup } from '../../discord/command-group.js';
-import type { CommandModule } from '../../discord/command.js';
+import { alsoAs, type CommandModule, type SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { help } from './help.js';
 
@@ -39,20 +39,55 @@ const gym: CommandModule = commandGroup({
   ],
 });
 
+const maybe: SimpleCommand = {
+  data: new SlashCommandBuilder().setName('interested').setDescription('Say you are interested'),
+  help: { category: 'util', details: 'Marks you as interested.' },
+  execute: noop,
+};
+const hmm = alsoAs(maybe, 'hmm');
+
 const { ctx } = createTestContext({ commands: [help, route, gym] });
+/** A bot that has a command with another name. */
+const named = createTestContext({ commands: [help, maybe, hmm] }).ctx;
 
-const ask = async (o: FakeOptions = {}) => {
+const ask = async (o: FakeOptions = {}, context = ctx) => {
   const i = fakeChatInput({ commandName: 'help', ...o });
-  await help.execute(i as unknown as ChatInputCommandInteraction, ctx);
+  await help.execute(i as unknown as ChatInputCommandInteraction, context);
   return sent(i.reply);
 };
-const choices = async (focused: string, o: FakeOptions = {}) => {
+const choices = async (focused: string, o: FakeOptions = {}, context = ctx) => {
   const i = fakeAutocomplete({ commandName: 'help', focused, ...o });
-  await help.autocomplete?.(i as unknown as AutocompleteInteraction, ctx);
+  await help.autocomplete?.(i as unknown as AutocompleteInteraction, context);
   return (i.respond.mock.calls[0]?.[0] ?? []).map((choice) => choice.value);
 };
 const MODERATOR = { roleNames: ['moderator'] };
 
+describe('/help: a command with another name', () => {
+  it('lists the other name on the line of the command, not on a line of its own', async () => {
+    const payload = await ask({}, named);
+    const utility = payload.embeds?.[0]
+      ?.toJSON()
+      .fields?.find((field) => field.name === 'Utility')
+      ?.value.split('\n');
+    expect(utility).toContain('`/interested` `/hmm` Say you are interested');
+    expect(utility?.some((line) => line.startsWith('`/hmm`'))).toBe(false);
+  });
+
+  it('explains the other name as the command, and says whose name it is', async () => {
+    const payload = await ask({ options: { command: 'hmm' } }, named);
+    const json = payload.embeds?.[0]?.toJSON();
+    expect(json?.title).toBe('/hmm');
+    expect(json?.description).toBe(
+      'Say you are interested\n\n`/hmm` is another name for `/interested`. Marks you as interested.',
+    );
+  });
+
+  it('offers both names while one is typed', async () => {
+    expect(await choices('in', {}, named)).toContain('interested');
+    expect(await choices('hm', {}, named)).toContain('hmm');
+  });
+});
+
 describe('/help', () => {
   it('replies ephemerally with the overview', async () => {
     const payload = await ask();
diff --git a/src/commands/util/rank.test.ts b/src/commands/util/rank.test.ts
index 80f68cac0a025eb92f9bfc9e07faf76913a4a361..5c017042666fc767925bd589385b379c50a7426a 100644
--- a/src/commands/util/rank.test.ts
+++ b/src/commands/util/rank.test.ts
@@ -10,7 +10,7 @@ import { embedOf as shownEmbed } from '../../../test/support/gym-commands.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { PokemonCatalogue } from '../../domain/pogo/catalogue.js';
-import { rank } from './rank.js';
+import { leagueRanks, rank } from './rank.js';
 
 const PVP = 'PVP CHAT AND TOURNAMENTS';
 const { ctx } = createTestContext({
@@ -208,3 +208,73 @@ describe('/rank: the pokemon option', () => {
     expect(offered.map((choice) => choice.value)).toContain('charizard_mega_x');
   });
 });
+
+describe('/little, /great, /ultra and /master', () => {
+  const leagues = new InteractionRouter(ctx, [rank, ...leagueRanks], [], {
+    now: () => 1_800_000_000_000,
+  });
+  const useIn = async (
+    commandName: string,
+    options: Record<string, string | number | boolean>,
+    extra: object = {},
+  ) => {
+    const interaction = fakeChatInput({
+      commandName,
+      parentName: PVP,
+      options: { ...IVS, ...options },
+      ...extra,
+    });
+    await leagues.handle(interaction as never);
+    return interaction;
+  };
+
+  it('are /rank in their league, without the league option, where /rank works', () => {
+    expect(leagueRanks.map((command) => command.data.name)).toEqual([
+      'little',
+      'great',
+      'ultra',
+      'master',
+    ]);
+    for (const command of leagueRanks) {
+      const json = command.data.toJSON();
+      expect(json.contexts).toEqual(rank.data.toJSON().contexts);
+      expect(json.options?.map((option) => option.name)).toEqual([
+        'pokemon',
+        'attack',
+        'defense',
+        'stamina',
+        'filter',
+        'evolutions',
+      ]);
+      expect(command.formOf).toBe('rank');
+      expect(command.guards).toEqual(rank.guards);
+    }
+  });
+
+  it('rank in their own league', async () => {
+    expect(embedOf(await useIn('master', { pokemon: 'Mewtwo' })).title).toBe(
+      'Mewtwo 10/12/13 · Master League',
+    );
+    expect(embedOf(await useIn('ultra', { pokemon: 'Mewtwo' })).title).toBe(
+      'Mewtwo 10/12/13 · Ultra League',
+    );
+    expect(embedOf(await useIn('great', { pokemon: 'Mewtwo' })).title).toBe(
+      embedOf(await useIn('rank', { pokemon: 'Mewtwo' })).title,
+    );
+  });
+
+  it('are refused where /rank is, and count as uses of /rank', async () => {
+    const outside = await useIn('great', { pokemon: 'mewtwo' }, { parentName: 'RAIDS' });
+    expect(sent(outside.reply).content).toBe(`Use this in a DM with me or under ${PVP}.`);
+    const member = { userId: '700000000000000123' };
+    for (let n = 0; n < 15; n++) {
+      await useIn('rank', { pokemon: 'mewtwo' }, member);
+      await useIn('little', { pokemon: 'azumarill' }, member);
+    }
+    const over = await useIn('great', { pokemon: 'mewtwo' }, member);
+    expect(sent(over.reply)).toEqual({
+      content: 'You can use /great again in 1 minute.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+});
diff --git a/src/commands/util/rank.ts b/src/commands/util/rank.ts
index dc7e8f139850791fa31ae777323c15a8c1366d58..f4c0398379bea88eecc20824f31a9ff04fa2d337 100644
--- a/src/commands/util/rank.ts
+++ b/src/commands/util/rank.ts
@@ -1,9 +1,11 @@
 import {
   InteractionContextType,
   SlashCommandBuilder,
+  type ChatInputCommandInteraction,
   type SlashCommandIntegerOption,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
+import type { Settings } from '../../config/settings.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { requirePvpContext } from '../../discord/guards.js';
@@ -63,27 +65,26 @@ function ranksOf(
   );
 }
 
-/**
- * `/rank` (spec 4.2, the legacy `!rank`, `!great`, `!ultra`, `!master`, `!little` and their
- * `-evo` forms): where a Pokémon with these IVs stands among all combinations in a league of
- * Go Battle League, up to level 50 and, where that differs, 51. Used under the PvP category or
- * in a DM with the bot; the answer is public there, as the legacy bot's was.
- */
-export const rank: SimpleCommand = {
-  data: new SlashCommandBuilder()
-    .setName('rank')
-    .setDescription('The PvP rank of a Pokémon with these IVs in a league')
-    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM)
+/** The options of `/rank` and of its short forms, which have no `league`: theirs is fixed. */
+function rankData(name: string, description: string, league: boolean): SlashCommandBuilder {
+  const builder = new SlashCommandBuilder()
+    .setName(name)
+    .setDescription(description)
+    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM);
+  builder
     .addStringOption(pokemonOption())
     .addIntegerOption(ivOption('attack'))
     .addIntegerOption(ivOption('defense'))
-    .addIntegerOption(ivOption('stamina'))
-    .addStringOption((option) =>
+    .addIntegerOption(ivOption('stamina'));
+  if (league) {
+    builder.addStringOption((option) =>
       option
         .setName('league')
         .setDescription('The league; Great League when not given')
-        .addChoices(LEAGUES.map((league) => ({ name: LEAGUE_NAMES[league], value: league }))),
-    )
+        .addChoices(LEAGUES.map((each) => ({ name: LEAGUE_NAMES[each], value: each }))),
+    );
+  }
+  builder
     .addStringOption((option) =>
       option
         .setName('filter')
@@ -104,15 +105,98 @@ export const rank: SimpleCommand = {
       option
         .setName('evolutions')
         .setDescription('Also rank what it evolves into, with the same IVs'),
-    ),
+    );
+  return builder;
+}
+
+/**
+ * Answers a use of `/rank` or of one of its short forms: in `league` when that is fixed,
+ * otherwise in the league the member picked (Great League when none).
+ */
+async function answerRank(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  league?: League,
+): Promise<void> {
+  const entry = namedPokemon(ctx, interaction.options.getString('pokemon', true));
+  if (ctx.gameData.catalogue.cpMultipliers.length < PVP_MAX_LEVEL) {
+    throw new UserError(
+      `The game data I have does not reach level ${String(PVP_MAX_LEVEL)}, so I cannot rank ` +
+        'IVs just now.',
+    );
+  }
+  const ivs: Ivs = {
+    attack: interaction.options.getInteger('attack', true),
+    defense: interaction.options.getInteger('defense', true),
+    stamina: interaction.options.getInteger('stamina', true),
+  };
+  if (Object.values(ivs).some((iv) => iv < 0 || iv > MAX_IV)) {
+    throw new UserError('An IV is a number from 0 to 15.');
+  }
+  const leagueValue = league ?? interaction.options.getString('league') ?? 'great';
+  const floorValue = interaction.options.getString('filter') ?? 'none';
+  if (!isLeague(leagueValue) || !isFloor(floorValue)) {
+    throw new UserError('Pick the league and the filter from their lists.');
+  }
+  const floor = IV_FLOOR_VALUE[floorValue];
+  if (Math.min(ivs.attack, ivs.defense, ivs.stamina) < floor) {
+    throw new UserError(
+      `With the filter "${IV_FLOOR_NAMES[floorValue]}" every IV is ${String(floor)} or more, ` +
+        `and ${ivText(ivs)} has one below that.`,
+    );
+  }
+  const line = interaction.options.getBoolean('evolutions')
+    ? ctx.gameData.catalogue.evolutionLine(entry).map((member) => ({
+        entry: member,
+        ranks: ranksOf(ctx, member, ivs, leagueValue, floorValue),
+      }))
+    : undefined;
+  const embed = renderRank({
+    entry,
+    ivs,
+    league: leagueValue,
+    floor: floorValue,
+    ranks: line?.[0]?.ranks ?? ranksOf(ctx, entry, ivs, leagueValue, floorValue),
+    ...(line ? { line } : {}),
+    picture: pokemonPicture(undefined, entry, ctx.gameData),
+  });
+  await interaction.reply({ embeds: [embed] });
+}
+
+async function pokemonAutocomplete(
+  interaction: Parameters<NonNullable<SimpleCommand['autocomplete']>>[0],
+  ctx: AppContext,
+): Promise<void> {
+  const focused = interaction.options.getFocused(true);
+  await interaction.respond(
+    focused.name === 'pokemon' ? pokemonChoices(ctx, String(focused.value)) : [],
+  );
+}
+
+/** What `/help` says of `/rank`, and below the line that names a short form of it. */
+function rankDetails(settings: Settings): string {
+  return (
+    'Where a Pokémon with these IVs stands among all 4,096 combinations in a league: its ' +
+    'rank by stat product, its share of the best, the CP and level it can reach, and the ' +
+    'best combination. Up to level 50, and up to 51 (a best buddy) where that differs. ' +
+    '`filter` ranks only the combinations a trade, a raid or a lucky trade can give. ' +
+    `Use it under ${settings.categories.pvp} or in a DM with me.`
+  );
+}
+
+/**
+ * `/rank` (spec 4.2, the legacy `!rank`, `!great`, `!ultra`, `!master`, `!little` and their
+ * `-evo` forms): where a Pokémon with these IVs stands among all combinations in a league of
+ * Go Battle League, up to level 50 and, where that differs, 51. Used under the PvP category or
+ * in a DM with the bot; the answer is public there, as the legacy bot's was.
+ */
+export const rank: SimpleCommand = {
+  data: rankData('rank', 'The PvP rank of a Pokémon with these IVs in a league', true),
   help: {
     category: 'util',
     details: (settings) =>
-      'Where a Pokémon with these IVs stands among all 4,096 combinations in a league: its ' +
-      'rank by stat product, its share of the best, the CP and level it can reach, and the ' +
-      'best combination. Up to level 50, and up to 51 (a best buddy) where that differs. ' +
-      '`filter` ranks only the combinations a trade, a raid or a lucky trade can give. ' +
-      `Use it under ${settings.categories.pvp} or in a DM with me.`,
+      `${rankDetails(settings)} \`/little\`, \`/great\`, \`/ultra\` and \`/master\` are ` +
+      '`/rank` in that league.',
     examples: [
       '/rank pokemon:Medicham attack:0 defense:15 stamina:15',
       '/rank pokemon:Mewtwo attack:10 defense:12 stamina:13 league:master filter:raid',
@@ -121,55 +205,33 @@ export const rank: SimpleCommand = {
   },
   guards: [requirePvpContext],
   throttle: MEMBER_READ_THROTTLE,
-  async execute(interaction, ctx) {
-    const entry = namedPokemon(ctx, interaction.options.getString('pokemon', true));
-    if (ctx.gameData.catalogue.cpMultipliers.length < PVP_MAX_LEVEL) {
-      throw new UserError(
-        `The game data I have does not reach level ${String(PVP_MAX_LEVEL)}, so I cannot rank ` +
-          'IVs just now.',
-      );
-    }
-    const ivs: Ivs = {
-      attack: interaction.options.getInteger('attack', true),
-      defense: interaction.options.getInteger('defense', true),
-      stamina: interaction.options.getInteger('stamina', true),
-    };
-    if (Object.values(ivs).some((iv) => iv < 0 || iv > MAX_IV)) {
-      throw new UserError('An IV is a number from 0 to 15.');
-    }
-    const leagueValue = interaction.options.getString('league') ?? 'great';
-    const floorValue = interaction.options.getString('filter') ?? 'none';
-    if (!isLeague(leagueValue) || !isFloor(floorValue)) {
-      throw new UserError('Pick the league and the filter from their lists.');
-    }
-    const floor = IV_FLOOR_VALUE[floorValue];
-    if (Math.min(ivs.attack, ivs.defense, ivs.stamina) < floor) {
-      throw new UserError(
-        `With the filter "${IV_FLOOR_NAMES[floorValue]}" every IV is ${String(floor)} or more, ` +
-          `and ${ivText(ivs)} has one below that.`,
-      );
-    }
-    const line = interaction.options.getBoolean('evolutions')
-      ? ctx.gameData.catalogue.evolutionLine(entry).map((member) => ({
-          entry: member,
-          ranks: ranksOf(ctx, member, ivs, leagueValue, floorValue),
-        }))
-      : undefined;
-    const embed = renderRank({
-      entry,
-      ivs,
-      league: leagueValue,
-      floor: floorValue,
-      ranks: line?.[0]?.ranks ?? ranksOf(ctx, entry, ivs, leagueValue, floorValue),
-      ...(line ? { line } : {}),
-      picture: pokemonPicture(undefined, entry, ctx.gameData),
-    });
-    await interaction.reply({ embeds: [embed] });
-  },
-  async autocomplete(interaction, ctx) {
-    const focused = interaction.options.getFocused(true);
-    await interaction.respond(
-      focused.name === 'pokemon' ? pokemonChoices(ctx, String(focused.value)) : [],
-    );
-  },
+  execute: (interaction, ctx) => answerRank(interaction, ctx),
+  autocomplete: pokemonAutocomplete,
 };
+
+/**
+ * `/little`, `/great`, `/ultra`, `/master`: `/rank` in that league (the legacy bot had them as
+ * commands of their own). Their uses count as uses of `/rank`.
+ */
+function leagueRank(league: League): SimpleCommand {
+  return {
+    data: rankData(
+      league,
+      `The PvP rank of a Pokémon with these IVs in the ${LEAGUE_NAMES[league]}`,
+      false,
+    ),
+    help: {
+      category: 'util',
+      details: (settings) =>
+        `\`/${league}\` is \`/rank\` in the ${LEAGUE_NAMES[league]}. ${rankDetails(settings)}`,
+      examples: [`/${league} pokemon:Medicham attack:0 defense:15 stamina:15`],
+    },
+    formOf: 'rank',
+    guards: [requirePvpContext],
+    throttle: MEMBER_READ_THROTTLE,
+    execute: (interaction, ctx) => answerRank(interaction, ctx, league),
+    autocomplete: pokemonAutocomplete,
+  };
+}
+
+export const leagueRanks: readonly SimpleCommand[] = LEAGUES.map(leagueRank);
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 5f1db2d021b17c3fe663d2871c08acced366d6bc..91ea63fa1249842f6e7387bd2f6783650849bb12 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -92,6 +92,12 @@ interface CommandBase {
    * installation has it. A command that is not enabled is neither registered nor routed.
    */
   enabled?: (config: Config) => boolean;
+  /**
+   * The command this one is another form of: another name (`/hmm` of `/interested`, `alsoAs`)
+   * or a short form (`/great` of `/rank`). Its uses count as that command's (the throttle), and
+   * `/help` lists it on that command's line.
+   */
+  formOf?: string;
 }
 
 /** A command without subcommands: `/join`, `/raid`. */
@@ -127,6 +133,50 @@ export interface GroupedCommand extends CommandBase {
 
 export type CommandModule = SimpleCommand | GroupedCommand;
 
+/**
+ * The command under another name as well (`/hmm` for `/interested`): the same guards, handlers,
+ * throttle and help, its own name, and its own description when one is given. Both names are
+ * registered and routed; the uses of either count as the command's.
+ */
+export function alsoAs(command: SimpleCommand, name: string, description?: string): SimpleCommand {
+  const original = command.data.name;
+  const { details } = command.help;
+  const note = `\`/${name}\` is another name for \`/${original}\`.`;
+  const form: SimpleCommand = {
+    ...command,
+    data: {
+      name,
+      toJSON: () => ({
+        ...command.data.toJSON(),
+        name,
+        ...(description === undefined ? {} : { description }),
+      }),
+    },
+    help: {
+      ...command.help,
+      details: (settings) => {
+        const own = typeof details === 'function' ? details(settings) : details;
+        return own === undefined ? note : `${note} ${own}`;
+      },
+      // The examples show it used by its own name.
+      ...(command.help.examples
+        ? {
+            examples: command.help.examples.map((example) =>
+              example === `/${original}` || example.startsWith(`/${original} `)
+                ? `/${name}${example.slice(original.length + 1)}`
+                : example,
+            ),
+          }
+        : {}),
+    },
+    formOf: original,
+  };
+  const { forConfig } = command;
+  return forConfig
+    ? { ...form, forConfig: (config) => alsoAs(forConfig(config), name, description) }
+    : form;
+}
+
 /**
  * The commands this installation offers, each with the subcommands it offers: what the router,
  * `/help` and the deploy script all go by.
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index b851059b58773a34eee66b9872a64d89bfbae94f..7eaec35f06262827a41712424d66f549d4822488 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -16,7 +16,7 @@ import {
 } from '../../test/support/fake-interactions.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { commandGroup, type SubcommandPart } from './command-group.js';
-import type { ComponentHandler, Guard, SimpleCommand } from './command.js';
+import { alsoAs, type ComponentHandler, type Guard, type SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
 import { InteractionRouter, STALE_COMPONENT } from './router.js';
 
@@ -375,6 +375,24 @@ describe('InteractionRouter', () => {
     expect(execute).toHaveBeenCalledTimes(4);
   });
 
+  it('counts the uses of another name of a command as the command’s, and names the name typed', async () => {
+    const { ctx } = createTestContext();
+    const execute = ran();
+    const cmd = command({ throttle: { uses: 2, perSeconds: 180 }, execute });
+    const router = new InteractionRouter(ctx, [cmd, alsoAs(cmd, 'other')], [], {
+      now: () => 1_800_000_000_000,
+    });
+    await router.handle(asInteraction(fakeChatInput()));
+    await router.handle(asInteraction(fakeChatInput({ commandName: 'other' })));
+    const third = fakeChatInput({ commandName: 'other' });
+    await router.handle(asInteraction(third));
+    expect(execute).toHaveBeenCalledTimes(2);
+    expect(third.reply).toHaveBeenCalledWith({
+      content: 'You can use /other again in 3 minutes.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
   it('asks a command whose limit depends on where it is used, and counts each limit apart', async () => {
     const { ctx } = createTestContext();
     let now = 1_800_000_000_000;
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 64673b5a7a42bdc901d18ae3a32eb543a177a9b9..f126f7e976f4fae76a20b1a98e41016b21687423 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -134,7 +134,7 @@ export class InteractionRouter {
         this.ctx.log.warn({ interaction: describe(interaction) }, 'no handler for command');
         throw new UserError(UNKNOWN_COMMAND);
       }
-      const { handler, name } = found;
+      const { handler, name, counted: key } = found;
       await runGuards(found.guards, interaction, this.ctx);
       const varies = typeof handler.throttle === 'function';
       const throttle =
@@ -143,7 +143,7 @@ export class InteractionRouter {
           : handler.throttle;
       if (throttle) {
         // The limits of a command that has several are counted apart, each under what it is.
-        const counted = varies ? `${name}\n${throttle.perSeconds}/${throttle.uses}` : name;
+        const counted = varies ? `${key}\n${throttle.perSeconds}/${throttle.uses}` : key;
         const wait = this.throttles.use(counted, interaction.user.id, throttle, this.now());
         if (wait !== undefined) {
           throw new UserError(`You can use /${name} again in ${waitText(wait)}.`);
@@ -217,19 +217,25 @@ export class InteractionRouter {
   }
 
   /**
-   * The handler of a command or of the subcommand used, with the guards that apply to it and
-   * its name as a member types it (`raid`, `gym create`).
+   * The handler of a command or of the subcommand used, with the guards that apply to it, its
+   * name as a member types it (`raid`, `gym create`, `hmm`) and the name its uses are counted
+   * under (that of the command it is a form of: `interested`).
    */
   private find(
     interaction: ChatInputCommandInteraction | AutocompleteInteraction,
-  ): { handler: CommandHandler; guards: readonly Guard[]; name: string } | undefined {
+  ):
+    | { handler: CommandHandler; guards: readonly Guard[]; name: string; counted: string }
+    | undefined {
     const command = this.commands.get(interaction.commandName);
     if (!command) return undefined;
     const name = command.data.name;
+    const counted = command.formOf ?? name;
     const path = subcommandOf(interaction) ?? '';
     if (!command.subcommands) {
       // A subcommand of a command that has none: the deployed definition is newer than this code.
-      return path === '' ? { handler: command, guards: command.guards ?? [], name } : undefined;
+      return path === ''
+        ? { handler: command, guards: command.guards ?? [], name, counted }
+        : undefined;
     }
     const handler = command.subcommands.get(path);
     if (!handler) return undefined;
@@ -237,6 +243,7 @@ export class InteractionRouter {
       handler,
       guards: [...(command.guards ?? []), ...(handler.guards ?? [])],
       name: `${name} ${path}`,
+      counted: `${counted} ${path}`,
     };
   }
 
````


### Task 7: CLAUDE.md: v2 posts, emoji of the application, forms of commands

Prototype commit: `5bb5365267b3243f10d12f2b152b8f3ee74d446c`

The conventions say how a post is made now (a layout made a
components-v2 message, its variants, the card of a DM, the budgets of
components and text and how a post too long is cut, the legacy
wording), how the controls are laid out and what "Join A" does, how
copies open with their line and leave out "Move train…", what the fake
gateway refuses and how, how a classic post is converted by an edit,
how a forum post starts where Discord refuses a v2 first message, how
tests read messages, where emoji come from and the upload script, and
how a command gets another name or a short form.

docs/superpowers/plans/2026-10-15-phase-8a-staging.md is the staging
checklist for the end of the 8A plan.

**Files:**

```
 CLAUDE.md                                             | 22 ++++++++++++----------
 docs/superpowers/plans/2026-10-15-phase-8a-staging.md | 25 +++++++++++++++++++++++++
 2 files changed, 37 insertions(+), 10 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  no test files of its own); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 5bb5365267b3243f10d12f2b152b8f3ee74d446c -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing.
- [ ] **Step 5: Commit** with the title `CLAUDE.md: v2 posts, emoji of the application, forms of commands`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/superpowers/plans/2026-10-15-phase-8a-staging.md`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index e8e6c99eb13c491bee035529dc07c9b1abe9f866..06546c4de2fff034c7b8433a6fb4a136bfe0c635 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -40,6 +40,7 @@ npm run db:legacy-fixture   # regenerate the legacy schema fixture from the knex
 npm run fixtures:game-data   # rebuild the game-data test fixtures (add -- --download for a newer game master)
 npm run raid-bosses:check    # download the raid boss feed and print the list Pine makes of it (writes nothing)
 npm run role-auth:export     # print the legacy role authorization per server, mapped to the new commands (reads only; --json)
+npm run emoji:upload         # upload the game's type, weather and team icons the bot's application lacks as its emoji (a dry run; --apply uploads)
 npm run migrate        # run Kysely migrations against the configured database
 npm run ocr:check -- <folder> [--labels <file>] [--baseline <file>] [--write-baseline <file>] [--bosses <file>] [--write-bosses <file>] [--device cpu|cuda|directml] [--threads n] [--priority low|normal]   # read screenshots with the real models; scores (also of a review folder), clocks' confidence and time
 npm run ocr:review -- <folder> [--show-text]   # triage of a review folder: what members said was wrong, and where (their texts and ids only with --show-text)
@@ -58,7 +59,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Ephemeral replies use `flags: MessageFlags.Ephemeral`. Things the user did wrong are thrown as `UserError`; the router turns them into ephemeral replies.
 - Mentions are off by default (`allowedMentions: { parse: [] }` on the client); a send that should ping must opt in with its own `allowedMentions`.
 - Component custom IDs are `<kind>:<id>:<action>[:<arg>...]`, at most 100 characters, built and parsed only through `src/discord/custom-id.ts`.
-- Every slash command is a `CommandModule` listed in `src/commands/index.ts`; the router and the deploy script both read that list.
+- Every slash command is a `CommandModule` listed in `src/commands/index.ts`; the router and the deploy script both read that list. A command with another name is listed under both: `alsoAs(command, name)` (`src/discord/command.ts`; `/hmm` of `/interested`, `/coming` of `/join`) gives the same guards, handlers, throttle and help under another name, and a short form (`/little`, `/great`, `/ultra`, `/master`: `/rank` in that league) is a command of its own with `formOf`. The uses of a form count as the command's (the router's throttle key), "You can use /x again" names the name typed, and `/help` lists a form beside the command's name on its line and explains it as the command's.
 - A command with subcommands is built with `commandGroup({ data, help, guards, groups, parts })` (`src/discord/command-group.ts`): each part carries its own subcommand builder, `guards`, `execute` and `autocomplete`. The router refuses to start when the definition and the handlers differ. Command guards run before the subcommand's.
 - The router's order is guards, throttle, deferral, `execute`. A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`.
@@ -99,12 +100,12 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - The forum of a region holds its raids, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched).
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
-- What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`); `rendered.message` is the whole message (the embed and the controls) and the only place its parts are put together. Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once; lists that do not fit are cut with a count (`fitItems`), and an embed stays within Discord's 6,000 characters.
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has no unit tests (the staging run is its test); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags and the one pin per forum. A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- What a post shows is computed by pure functions in `src/render/` (`renderRaidPost(view)`, `renderSummary`, `renderRegionLink`). A party's post is a components-v2 message (Matt, 2026-10-15): the renderer lays it out (`PostLayout`: an accent colour, a picture, blocks of text, sections with the picture or a button beside them, rows of buttons) and `postMessage(layout, variant)` (`src/render/party-post.ts`) makes it one container; `rendered.message` is `postMessage(layout)`, the whole message and the only place its parts are put together, and its other forms are variants of the layout (`picture: false` when Discord refuses the picture, `controls: false` for the last showing of an ended party, `move: false` and `lead` for a copy), never edits of the component tree. `rendered.card` is the embed a direct message shows of the party (a v2 message cannot carry a DM's sentence; the embed fields are in `party-card.ts`). Text a member or a feed wrote is shown through `plain()` (`src/render/text.ts`); times are Discord timestamps (`timestamp()`), and only an egg reported more than twelve hours ahead (elite) shows its date, until the day itself in `view.zone` (`settings.timezone`); an egg is shown as an egg until it hatches, also when its boss is known: what it hatches as is the heading of the boss block ("Hatches as Yveltal"), said once. A raid is called as the legacy bot called it (`raidWords`: "Level 5 raid", "Shadow Level 3 raid"; the titles of posts and their tags keep `T5`), and the statuses are Interested, Coming, Present and Complete. A message holds at most `MAX_COMPONENTS` (40, every nested component counted) and its text displays at most `TEXT_BUDGET` (4,000, assumed: Discord documents no total) less the room of a copy's line (`LEAD_ROOM`): `fittedLayout(build)` gives `build` a `Fit`: every list of members goes through `fit.list` and is cut down with the others when the post is too long (`fitLists`, "…and N more"), and as a last resort the other texts that can be long (a group's label, a gym's notes, where a train is, its route) go through `fit.part(room => …)` and are cut (`cutText`, "…"). A copy's line (`lead`) opens the post's first text, never a component of its own. The worst case of each kind, with every text needing escapes, is tested with every copy (`expectSendable`, `test/support/post-limits.ts`).
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has no unit tests (the staging run is its test); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, https thumbnails; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post; `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `customIdsOf`, `accentOf`, `thumbnailOf`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `flush()` is for shutdown only. A raid is never left active without a post, nor a post without its party.
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
-- The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members.
-- The controls of a post are part of what the renderer makes (`partyControls(party)` in `src/render/party-controls.ts`, in `rendered.message.components`): buttons only, none depending on the time. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
+- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its line (`statusButton`: Interested, Join, Here, Done), with several a "Join A" beside each group (`joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present as it is; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (Leave, −1, +1, Remote, a raid's Map link; Set time; Screenshot feedback), every button with its emoji: buttons only, none depending on the time. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
 - The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 8 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; exactly the parts that fit the type must be present); versions 1 to 7 are still read.
 - Time passes through `PartyScheduler` (`src/services/party-scheduler.ts`): at every `cleanupInterval` it runs `partyTick` inside the store for every party and does what the tick asks for (render, a line at hatch, `ask`, "did not answer and counts as done", the warning, the end). It is started in `src/app.ts` after the connection to Discord and stopped first at shutdown; a test moves `clock.now` and calls `tick()`. Its effects happen at most once (the party is stored first); only the ending repeats. `activity(channelId)` (from `MessageCreate`; only the channel id is used) says the warning again after every fifth message of others in a warned post, deleting the earlier one.
@@ -120,7 +121,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Access for members of other regions is `AccessService` (`src/services/access-service.ts`), which listens to the store: a member who is signed up (in any status, also done: Matt, 2026-10-11) for an active party whose post is in a forum they cannot see gets a permission overwrite of their own on that forum, and loses it when they are signed up for no party of that forum any more (they left, or the party ended or moved). The record (`PartyAccessGrant`, `AccessGrantRepository`) is written before the overwrite is made and removed after it; only an overwrite that is still exactly what the bot made is ever deleted (`PartyGateway.dismissMember` answers false otherwise), and a member somebody keeps out (an overwrite of their own that denies something, or one that denies the view to a role of theirs: `memberAccess` says `barred`) is left alone; an overwrite of their own that is empty (Discord's "reset to default" leaves one behind) or only allows (a member added to a private channel keeps "Connect") counts as none and is replaced by the bot's. The sweep (at start and hourly, with the forums' upkeep) takes back what nothing calls for and lets a member in again whose record has no overwrite; it never lets in anybody without a record. Nothing awaits it: tests call `access.flush()`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit.
-- A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the embed of a post `memberName(member)` (the name alone: the trainer lists, "Reported by", "Created by", "Conductor"); both fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention.
+- A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`; also "Reported by" and "Created by" in the small print of a post, which pings nobody), a list `memberName(member)` (the name alone: the trainer lists of a post and of a DM's card, "Conductor", the card's "Reported by"); both fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention.
 - A `group` option is free text with autocomplete of the groups the raid has (`respondWithGroups`), read by `typedGroup` (`src/commands/parties/reply.ts`); text that is no group is refused, never ignored.
 - `ctx.regions` (`RegionDirectory`) has the regions by id, channel and forum; `GymDirectory` holds its own copy, so after a region changes load both. `regionChannelOf` also answers for a region's forum and a post in it. `ctx.users.get(snowflake)` gives a member's settings.
 - `/admin` is a `commandGroup` whose parts are listed in `src/commands/admin/index.ts`: a new subcommand is a file there, appended to that list. `/raid` reads what a member picked or typed through `src/commands/raids/raid-input.ts` (`reportedBoss`, `reportedGym`, `reportedTime`); a question to the member (a menu, a confirmation) keeps its values in a `PendingRequests` store under a token that is the id of the controls' custom id. The custom-id kind `raid` belongs to `/raid`'s own controls.
@@ -131,19 +132,19 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`) over `resolvePartyTime`: never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
 - Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`), otherwise "This has ended."
 - A command's `throttle` may be a function of the interaction (`/meet`: 3 per 180 seconds in a timed party); a use that a guard refused does not count, so what can be known before the work (a bad name, no region, an unreadable time) is refused by a guard that reads the options (`/meetup`, `/meet`), and `execute` keeps its own checks.
-- What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `FORUM_TAGS`, `groupField`, `fitEmbed`, `inShownOrder`); `renderRaidPost` and `renderMeetupPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands in the embed's description and is never cut.
-- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all).
+- What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS`, `inShownOrder`), the components in `src/render/v2.ts`; `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut; what a post says about a gym under "Location Information" (`locationBlock`).
+- Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all); a DM's card goes through the DM sender, not the gateway, and the render tests hold it to the same 6,000.
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - The maker of a train is signed up as their auto-status says (None: not at all; Here counts as Coming), and with privacy Anonymous neither the post nor the new-train DM names them (`NewTrain.anonymous`, `autoStatus`). A maker who is not signed up may still arrange the route and the times as far as the train does not move (`mayArrange`, `party.ts`); moving it and being its conductor need a sign-up. Meetups know neither setting.
 - A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is gym ids, none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
 - Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its gym through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied). A gym is a stop only when it lies in a region of the train's server (`reaches`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- A train's post has one grey button "Move train…" on a row of its own (`party:<id>:move`), which answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel` / `pressTrainPanel` in `src/commands/trains/move.ts`). The panel's buttons are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next and Skip also the stop they lead to): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew. A panel press calls `update` on the panel and never goes through `answerClick`.
+- A train's post has one grey button "Move train…" beside where the train is and goes next (`party:<id>:move`, `moveTrainButton`), which answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel` / `pressTrainPanel` in `src/commands/trains/move.ts`). The panel's buttons are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next and Skip also the stop they lead to): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew. A panel press calls `update` on the panel and never goes through `answerClick`.
 - Saved routes are the legacy table `SavedRoutes` behind `SavedRouteRepository` (per member and region, at most `MAX_SAVED_ROUTES`, the same name without case replaces; `save` and `remove` lock the member's `User` row first). The `route` option's autocomplete value is `id:<n>` (`SAVED_ROUTE_CHOICE`); anything else typed is a name. `/boss` in a train goes through `trainBoss` (`raid-input.ts`): tier words are ignored, any Pokémon the catalogue names is accepted, `none` clears; `reportedBoss` is for raids only.
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
 - A train remembers the gym it was at when a move finished its route (`train.finishedFrom`; state document version 6, version 5 read as null): Previous from the end leads back there and leaves Here as Here (`stopAfter`, `targetOf`), and to the last stop when nothing is remembered. `withTrain` in `train.ts` is the one place that keeps it (null unless the route is finished and still has that gym), so a route is changed only through the functions of `train.ts`, never by building `train.route` by hand: the state document refuses a train that breaks the rule. The panel's Previous button carries its target like Next and Skip.
-- A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line above the embed and the post's controls without the move row (`invitationControls`). A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
+- A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line at the top and the post with its controls but "Move train…" (the layout's `move: false`). A copy is sent again without its picture when Discord refuses that. A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
 - Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`.
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
 - Member settings are read through `ctx.users` (`get`, `getMany`, `update`, `withNickname`). Whoever is about to ping several members reads them in one go with `settingsOf(users, ids, log)` (`src/services/party-change.ts`): a member without a row has the defaults, and a read that fails is logged and pings nobody. Tests use `MemoryUsers` (`test/support/users.ts`).
@@ -159,6 +160,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn`, `normal` (raid wants, gym targets, new trains), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`).
 - Who of many members is in a server and can see a channel is `ctx.members.viewers(guildId, channelId, userIds)`: batches of 99 (and the bot itself, whose absence from an answer means the answer is no answer) through the gateway's request for members by user id, one request a second and thirty a minute at most (`MEMBER_REQUEST_BUDGET`), single REST look-ups when it fails and a rest that doubles up to six hours (`GatewayWithFallback`); "sees" is kept ten minutes, "does not" one (`src/discord/member-viewers.ts`). `FakeMemberDirectory` has `viewers`, `holding`, and members who are not there or cannot see.
 - Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated`, `meetingTimeChanged`, `startTimeChanged`, `spawnReported`. Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep; a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`; the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. `npm run emoji:upload` (`scripts/emoji/`) makes them from PokeMiners' pogo_assets at a pinned commit, an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`scripts/role-auth/report.ts`): Discord sets each by itself.
 - A DM is rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `reasonLine`, `stopRow`): the address of the post (`postLink`), never `<#post>`, and one stop button per reason, five at most. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, takes the button off the message and keeps nothing in memory.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 - A spawn report is `ctx.spawns.report(...)` (`SpawnService`), reached by `/wild`: a message in the region's text channel (as text where the bot may not post embeds), deleted after `SPAWN_MINUTES`, also posted in the Unown channel where there is one. Every report that stands is a row of `SpawnReport` (`SpawnReportStorage`; twin `MemorySpawnReports`) until it is deleted, and `sweep()` (with the hourly upkeep of `PartyScheduler`, also at start) deletes what no process deleted at its time and gives a report up a day after it. Every report is told to who wants it; a member may make five in half an hour (`WILD_THROTTLE`; Matt, 2026-10-13). `details` (where it is) is required. What never appears in the wild is refused with a sentence and not offered (`appearsInWild`, `src/domain/pogo/wild.ts`): legendaries, mythicals, ultra beasts, megas and primals, except the species of `settings.wildSpawnExceptions` (default the lake trio; the Galarian birds stay refused while they come only from a Daily Adventure Incense), read once per catalogue by `wildExceptionsOf(ctx)`. Unown is an ordinary species; `UnownWantService.noticed(interaction)` gives a holder of the old role a spawn want once (table `UnownWantGift`).
diff --git a/docs/superpowers/plans/2026-10-15-phase-8a-staging.md b/docs/superpowers/plans/2026-10-15-phase-8a-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..b0b484542ccee0d4a732675ac3b06405e739e0f5
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-15-phase-8a-staging.md
@@ -0,0 +1,25 @@
+# Phase 8A: staging checklist
+
+The text for the end of the 8A plan. Each step with Matt's go-ahead, on the test server, with the dev application.
+
+1. **Register the commands:** `npm run deploy-commands -- --global` (65 commands: `/interested` and `/hmm` instead of `/maybe`, `/coming`, `/little`, `/great`, `/ultra`, `/master`; descriptions changed).
+2. **Emoji:** Matt runs `npm run emoji:upload` (a dry run: it lists what it would upload and their sizes, and ends with a count), then `npm run emoji:upload -- --apply`. Look at the application's emoji in the Developer Portal: 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`.
+3. **Start the bot** (Matt, in a terminal). With the bot running, the posts already there are shown anew once the application's emoji are read (types and weather as icons, team icons from the application), one post every quarter of a second, not all at once.
+4. **The first message of a forum post:** report a raid. The log says once either "forum posts are made as they are" or "Discord refused a components-v2 first message of a forum post" (with Discord's code). In the second case, no "Setting up this post…" may remain visible in any post, and the log has no refusal of the edit that follows the line (it is converted at once). A raid whose picture Discord refuses is posted without it, with no line of text posted and deleted on the way. A line "could not delete a lost post" names a post id: look for that post and delete it by hand.
+5. **Every kind of post** (look at each in the client, desktop and phone):
+   - an egg (the egg picture, "Level 5 raid (egg)", times), and an egg whose boss is certain ("Hatches as …");
+   - a hatched raid with a boss (picture, Weaknesses and weather as icons, Catch CP, Moveset);
+   - a raid with several groups ("Join A", "Join B" beside the groups; Interested, Here, Done below);
+   - a raid at an elite raid gym (Location Information; no Remote on an elite raid);
+   - a raid reported from a screenshot without times: the buttons "⏰ Set time" and "📷 Screenshot feedback" (their emoji have not been seen on Discord yet);
+   - a meetup with information (Meeting Information; Remote is still there, as before 8A);
+   - a train with a route, a boss and a conductor ("Move train…" beside the gyms, the route in small print).
+6. **Buttons:** press every one. "Join B" when interested, when here and when coming (the first two make you coming in B, the third only moves you); "Join A" while you are in A: interested becomes coming, here stays here; Map opens Google Maps; −1 and +1; Remote; Leave.
+7. **Copies:** a remote raid in the remote channel, a raid at an elite raid gym in its channel (the line on top, the picture, all buttons), a train's copy in another region's channel (no "Move train…"), `/status` in a post. Also see what a copy looks like in a channel where the bot lacks Embed Links (thumbnails), if the test server has one.
+8. **Edits:** an ordinary edit of a v2 post (a sign-up) must change nothing but the post. An old classic post on the test server (made before 8A, if one is still open) must become v2 by its next edit: the log says once, with Discord's code, that a v2 edit of a classic message was refused and the message converted; nothing else is refused.
+9. **Moving a raid:** `/location` to a gym of another region, and once with its new post deleted by hand while it is made (if that can be timed): the answer says the raid stays here.
+10. **End:** a raid that ran out and one closed with `/delete`: the last showing without buttons, then archived.
+11. **DMs:** a want of the boss: the DM still shows the embed card (Weaknesses with commas or icons; "Raid train after X" for a train) with its stop buttons.
+12. **Commands:** `/hmm`, `/interested`, `/coming`, `/join`; `/great pokemon:… attack:… defense:… stamina:…` and the others; `/rank` and `/great` share one limit (thirty in a minute). `/help` (the overview lists `/interested` `/hmm` and `/rank` `/little` … on one line each), `/help command:hmm`, `/help command:great`.
+13. **Pings:** "Reported by **Name** (@mention)" in the small print pings nobody.
+14. **A long post:** many sign-ups with long names: the lists end in "…and N more", and Discord takes the post (the 4,000 characters of text are an assumption).
````


---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8a HEAD -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js'` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other. The test files with timers or waits that this plan changes (`src/services/party-service*.test.ts`, `src/services/party-mirrors*.test.ts`, `src/services/party-scheduler*.test.ts`, `src/services/application-emoji.test.ts`) ten times in a row.
2. Whole-branch review (Opus, high effort); one fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8A": the rulings above for Matt, what only staging shows), the Gantt chart and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-15-phase-8a-staging.md` (added by Task 7). Each step with Matt's go-ahead, on the test server with the dev application; Matt registers the commands, runs the emoji upload and starts the bot.
