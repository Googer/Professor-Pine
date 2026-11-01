# Phase 2E-1: Mirrors and the Last Raid Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A raid's message stands, with its buttons, also in the server's channels for remote raids and for raids at EX gyms, and `/status` puts it at the bottom of its own post again. Members get `/status`, `/where`, `/shout` and `/delete`; staff get `/delete` as their clean-up tool and `/admin save-party`.

**Architecture:** A copy of a raid's message is a record on the party (`mirrorMessages`, a column since plan 2B) and a message on Discord; `PartyMirrors` keeps the two in step. The record is the list of what exists: a copy is recorded as soon as it is sent and taken off only once it is deleted, so whatever fails on the way is tried again with the next render. The copy in the post is brought up to date in the render of the post; the copies in the two shared channels have a slower queue of their own, because every raid of a server edits there and a post must never wait for them. The commands are thin: `/status` asks `PartyService.showStatus`, `/shout` asks `AttendanceService.shout`, `/delete` ends the party through `PartyService.end` (staff) or puts a request into the post (`requestDeletion`), `/admin save-party` asks `PartyService.keep`.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, zod 4, Vitest. No new dependencies, no database migration (the `mirrorMessages` column gets a third kind).

**Spec:** `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`: sections 4.1 (controls on mirrors), 4.2 (the rows `status`, `where`, `shout`, `delete`, `save-party`), 5.1 (the link line), 5.2 (mirrors, end). Plan 2E of the five Phase 2 plans is split in two: this is the first half; **2E-2** is access for members of other regions (`AccessService`, `PartyAccessGrant`) and moving a raid to another region. Hand-offs: `docs/superpowers/plans/phase-0-follow-ups.md`, every "Plan 2E" list.

**Every code block in this plan was run before the plan was written**, on a throwaway branch, one commit per task, with lint, format, typecheck and the tests clean after every task (1,874 unit tests at the end, and 126 database tests). Two reviewers then went through that branch, and what they found is already in the code below. If something does not pass as written, suspect a transcription slip before suspecting the design.

## Decisions made in this plan

1. **Which copies a raid has.** In the channel named `settings.channels['remote-raids']`: every raid but an elite one. In `settings.channels['ex-gym-raids']`: a raid, itself not an EX raid, at a gym that is tagged or confirmed EX. As in the legacy bot. A server without such a channel, with the feature switched off (`settings.features`), or with a channel the bot may not write in, has no copy there. A raid that is over by the clock loses these copies at once (the post is archived some fifteen minutes later): what is over is of no use to somebody looking for a raid.
2. **A copy is the post's message with a line above it** that links to the post and names the region. Its buttons are the post's own (they name the party, not the channel), so a member signs up where they see the raid. Until plan 2E-2 such a member may not be able to see the post the link leads to.
3. **The record is the to-do list.** A copy is recorded on the party when it is sent, and an earlier copy of its kind stays recorded until its deletion has worked. A copy that cannot be recorded is deleted again. Of several copies of one kind the newest counts and the render deletes the others. At the end of the party every recorded copy is deleted before the post is archived, and the end waits for anything that is still on its way to the post or a copy.
4. **Copies in the shared channels are edited at most every ten seconds per raid**, in a queue of their own (the first change at once). The post, and the `/status` copy in it, keep the two seconds of plan 2C. A channel that refuses the bot for lack of a permission is left alone for ten minutes and logged once.
5. **The link line in the region's channel follows the post's title** (an egg that hatches, a boss that is named). After a restart it is taken as it is: no edit until the title changes again.
6. **`/status`** in a raid's post puts a fresh copy of the message, with the buttons, at the bottom of the post and deletes the one an earlier `/status` put there; the answer to the member is private. In a region's channel or forum it shows the member that region's list, privately (the legacy bot posted it and deleted it after a minute). Five uses a minute.
7. **`/where`** answers privately with a Google Maps link and the map picture of the gym (the legacy bot posted it in the channel).
8. **`/shout`** is said by the bot in the post, to everybody else who is signed up and not done; those who allow it are pinged (`User.mentions` and `User.shouts`), and only they are listed. Anybody in the post may shout, as in the legacy bot; three in three minutes.
9. **`/delete` from staff ends the raid at once** (Matt, 2026-10-11: it is the manual clean-up for whatever the clock and the recovery do not tidy up, and it has other uses). Staff are admins, moderators and the bot's owner. The post says who closed it and is archived and locked; the legacy bot's wait of fifteen seconds is gone, because the post stays readable. It has no throttle. The private answer is given before the post is archived: nothing may follow the archiving.
10. **`/delete` from anybody else opens a form** for the reason, which is put into the post for the moderators. A member asks once per raid; only the first request a raid gets pings the roles named admin and moderator. The form is accepted only from the raid's own post. Nothing else happens: the moderators decide.
11. **`/admin save-party [keep]`** keeps a post from the clock (no warning, no archiving) and, new, gives it back with `keep:False`. The post says who did it and shows that it is kept. A kept raid that is over blocks neither its gym nor the summary.
12. **A command may decide per use whether it is acknowledged first** (`defer` as a function of the interaction): `/delete` must not be acknowledged before it opens a form, and must be before staff close a raid.
13. **Small things owed by earlier plans:** the `group` options offer the groups the raid really has, and typed text that is no group is refused instead of ignored; the `/help` overview lists a category by names only when its descriptions do not fit, so no command is missing.
14. **Not in this plan:** access grants and moving a raid to another region (2E-2); DMs (Phase 4); a list of kept posts, and deleting the copies of an ended party whose deletion failed (follow-ups).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`npm start`, `npm run dev`, `npm run deploy-commands`), never edit or delete legacy JS (`app/`, `commands/`, `types/`, `index.js`) or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; relative imports use the `.js` extension. `strict` and `noUncheckedIndexedAccess` are on. No `any` except where a line comment justifies it.
- `src/domain/` stays pure (no `discord.js`, no services, no database). `src/render/` builds plain data: it may import `discord.js` for types and enums, and never calls Discord.
- **Tests never use the network and never contact Discord.** Discord in tests is `FakePartyGateway` and the fake interactions.
- A party is never mutated; it changes only through `PartyStore.update`, whose callback is synchronous and decides inside.
- Ephemeral replies use `flags: MessageFlags.Ephemeral`. What a member did wrong is thrown as `UserError`. Text written by members or by a feed is shown through `plain()`.
- Nothing is sent into or edited in a post after it was archived: Discord opens an archived post again for that.
- Whole files in this plan are exact: create or replace them as written. The diffs are exact: apply every hunk; do not "improve" neighbouring code. Lines starting with `-` are removed, lines starting with `+` are added, other lines are context.
- Before each commit: `npx prettier --write <files you touched>`, then `npm run check` must be green (lint, format check, typecheck, all unit tests; re-run lint after formatting).
- Commit after every task with a message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commits are made as `Matt Legowski <googer@pobox.com>` (the repository's local git config; do not change it). Never stage `.idea/`, `var/` or `.env`; stage files by explicit path. A commit title must not start with a slash (Git Bash turns it into a path).

## Review Focus

1. Nothing with buttons may be left behind, and nothing may land in a post after it was archived: a `/status` on its way when the raid ends, an edit of a copy under way, a copy that could not be recorded or deleted. Tests: Task 2, "lets a /status that is on its way land before the post is archived", "waits at the end for an edit of a copy that is under way", "keeps an earlier copy on record until it could be deleted, and deletes it then", "deletes every copy at the end, also one whose deletion had failed before", "deletes a copy again that it cannot record".
2. A post must not wait for the shared channels, and a channel that refuses the bot must not be asked with every render: Task 2, "does not make the post wait for the edit of its copy in a shared channel", "leaves a channel alone for ten minutes that refused it for lack of a permission".
3. Only staff close a raid, and nobody can make the bot ping at will: Task 5, "is for admins, moderators and the owner of the bot, not for bot developers", "takes the form only from the post of that raid", "takes one request per member, and pings the roles only for the first of a raid", "shows the reason as text, on one line, and pings no member with it"; Task 4, "shows what the member wrote as text: no Markdown, no mention of everybody", "allows three in three minutes".
4. `/delete` must work whenever staff need it and must answer before the post is locked: Task 5, "has no limit: a moderator tidying up closes as many raids as there are", "answers the moderator before anything is done to the post", "closes the raid although the answer cannot be given".
5. A kept post must stay, and a post given back must go: Task 6, "keeps the post: the clock neither warns nor archives it", "takes the warning away from a post that is kept after it was warned", "gives the post back to the clock with keep:False".

---

## File Structure

```
src/domain/party/
  party.ts              modify: MirrorKind, MIRROR_KINDS (a third kind, `status`)
  party-state.ts        modify: the mirrors schema knows `status`
  raid.ts               modify: raidMirrors
src/discord/
  party-gateway.ts      modify: editMessage, findChannel
  command.ts, router.ts modify: defer as a function
  guards.ts             modify: isStaff, managementRoleIds
src/render/
  mirrors.ts            create: renderMirror
  raid-post.ts          modify: gymMapsUrl; a kept post says so
  party-controls.ts     modify: the action `delete`, deletionForm
src/services/
  party-mirrors.ts      create: PartyMirrors
  party-service.ts      modify: copies with every render and at the end; showStatus, summaryText,
                        end(..., closing), requestDeletion, keep
  attendance-service.ts modify: shout, withMentions
src/components/party.ts modify: the form of /delete
src/commands/
  parties/status.ts     create: /status, /where
  parties/shout.ts      create: /shout
  parties/delete.ts     create: /delete
  parties/reply.ts      modify: typedGroup, respondWithGroups
  parties/attendance.ts, parties/group.ts   modify: group options autocomplete
  admin/save-party.ts   create: /admin save-party
  admin/index.ts, index.ts                  modify
  util/help-render.ts   modify: names only per category
test/support/
  fake-gateway.ts       modify: editMessage, findChannel, message edits
  fake-interactions.ts  modify: the roles of the server
  gyms.ts               modify: REMOTE_CHANNEL, EX_CHANNEL
  party-service.ts      modify: gatewayWithMirrorChannels, reportedRaid(report, overrides, kept)
```

---

### Task 1: The gateway edits a message and finds a channel; which copies a raid wants, and what a copy says

**Files:**
- Create: `src/render/mirrors.test.ts`, `src/render/mirrors.ts`
- Modify: `src/discord/party-gateway.test.ts`, `src/discord/party-gateway.ts`, `src/domain/party/party-state.test.ts`, `src/domain/party/party-state.ts`, `src/domain/party/party.ts`, `src/domain/party/raid.test.ts`, `src/domain/party/raid.ts`, `test/support/fake-gateway.ts`

**Interfaces:**
- Consumes: `PartyGateway` and `DiscordPartyGateway` (`unlessGone`, `done`, `reopen`, `payload`), `FakePartyGateway`; `MirrorMessage` and the mirrors schema of `party-state.ts`; `raidStage`; `RenderedPost`.
- Produces: `PartyGateway.editMessage(channelId, messageId, message): Promise<boolean>` (false when gone) and `findChannel(nearChannelId, name): string | undefined` (a text channel of that server in which the bot may post embeds); the fake's `editMessage`, `findChannel` (by `channelNames`), `FakeMessage.edits`, and `rejectThumbnails` for sends too; `MIRROR_KINDS`, `MirrorKind = 'ex' | 'remote' | 'status'`; `raidMirrors(party, gym, now): ('ex' | 'remote')[]` in `raid.ts`; `renderMirror(kind, rendered, place): OutgoingMessage` and `MirrorPlace { postId; regionChannelId }` in `src/render/mirrors.ts`.

The discord.js implementation of the two gateway methods has no unit test, like the rest of that class (the staging run is its test). `findChannel` returns only a channel in which the bot can view, send and embed: a channel it cannot write in would be asked, and refuse, with every render.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -28,6 +28,8 @@ export interface FakeMessage {
   id: string;
   channelId: string;
   message: OutgoingMessage;
+  /** How often the message was edited. */
+  edits: number;
 }
 
 type Method = keyof PartyGateway;
@@ -40,7 +42,8 @@ type Method = keyof PartyGateway;
  * It is as strict as Discord where tests rely on it: a message needs content or an embed, a title
  * is 1 to 100 characters, a post has at most five tags, all of the forum, a forum has one pinned
  * post, and nothing can be sent into a forum. Like Discord, it opens an archived post again for
- * anything that is edited or sent in it.
+ * anything that is edited or sent in it. A message that was deleted, or whose id is in `gone`,
+ * cannot be edited.
  *
  * Its answers come on `setImmediate`, so a test that needs a fixed time must fake only `Date`
  * (`vi.useFakeTimers({ toFake: ['Date'] })`), never all timers.
@@ -309,11 +312,26 @@ export class FakePartyGateway implements PartyGateway {
       const post = this.posts.get(channelId);
       if (post) FakePartyGateway.reopen(post);
       const id = this.id();
-      this.messages.push({ id, channelId, message });
+      this.messages.push({ id, channelId, message, edits: 0 });
       return id;
     });
   }
 
+  editMessage(channelId: string, messageId: string, message: OutgoingMessage) {
+    return this.attempt('editMessage', messageId, () => {
+      if (this.gone.has(channelId) || this.gone.has(messageId)) return false;
+      const found = this.messagesIn(channelId).find((sent) => sent.id === messageId);
+      if (!found) return false;
+      FakePartyGateway.checkMessage(message);
+      this.checkPicture(message);
+      const post = this.posts.get(channelId);
+      if (post) FakePartyGateway.reopen(post);
+      found.message = message;
+      found.edits++;
+      return true;
+    });
+  }
+
   deleteMessage(channelId: string, messageId: string) {
     return this.attempt('deleteMessage', messageId, () => {
       this.deleted.push({ channelId, messageId });
@@ -324,6 +342,14 @@ export class FakePartyGateway implements PartyGateway {
     return this.channelNames.get(channelId);
   }
 
+  /** Every channel of the fake is in the one server: the channel named so in `channelNames`. */
+  findChannel(_nearChannelId: string, name: string): string | undefined {
+    for (const [id, known] of this.channelNames) {
+      if (known === name && !this.gone.has(id)) return id;
+    }
+    return undefined;
+  }
+
   emoji(_channelId: string, name: string): string | undefined {
     return this.emojis.get(name);
   }
```

- [ ] **Step 2: Write the failing tests**

Apply to `src/discord/party-gateway.test.ts`:

```diff
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -83,6 +83,42 @@ describe('isRefusedBody', () => {
 });
 
 describe('FakePartyGateway', () => {
+  it('edits a message that is there, and answers false for one that is gone', async () => {
+    const gateway = new FakePartyGateway();
+    const id = (await gateway.sendMessage('c', { content: 'one' })) ?? '';
+    await expect(gateway.editMessage('c', id, { content: 'two' })).resolves.toBe(true);
+    expect(gateway.messagesIn('c')).toEqual([
+      { id, channelId: 'c', message: { content: 'two' }, edits: 1 },
+    ]);
+    await expect(gateway.editMessage('c', id, {})).rejects.toThrow(/content or an embed/);
+    await expect(gateway.editMessage('other', id, { content: 'x' })).resolves.toBe(false);
+    await gateway.deleteMessage('c', id);
+    await expect(gateway.editMessage('c', id, { content: 'three' })).resolves.toBe(false);
+    const second = (await gateway.sendMessage('c', { content: 'one' })) ?? '';
+    gateway.gone.add(second);
+    await expect(gateway.editMessage('c', second, { content: 'two' })).resolves.toBe(false);
+  });
+
+  it('opens an archived post again for an edit of a message in it', async () => {
+    const gateway = new FakePartyGateway();
+    gateway.addForum('f');
+    const postId =
+      (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ?? '';
+    const id = (await gateway.sendMessage(postId, { content: 'copy' })) ?? '';
+    await gateway.archivePost(postId);
+    await gateway.editMessage(postId, id, { content: 'copy, changed' });
+    expect(gateway.posts.get(postId)).toMatchObject({ archived: false, reopened: 1 });
+  });
+
+  it('finds a channel of the server by its name', () => {
+    const gateway = new FakePartyGateway();
+    gateway.channelNames.set('500000000000000001', 'remote-raids');
+    expect(gateway.findChannel('100000000000000001', 'remote-raids')).toBe('500000000000000001');
+    expect(gateway.findChannel('100000000000000001', 'potential-ex-gym-raids')).toBeUndefined();
+    gateway.gone.add('500000000000000001');
+    expect(gateway.findChannel('100000000000000001', 'remote-raids')).toBeUndefined();
+  });
+
   it('creates a forum with tags, posts in it, and keeps what was done to a post', async () => {
     const gateway = new FakePartyGateway();
     const forum = await gateway.createForum('100000000000000001', 'west-raids', ['Egg', 'T5']);
```

Apply to `src/domain/party/party-state.test.ts`:

```diff
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -323,6 +323,14 @@ describe('writing a party state', () => {
     expect(() => partyMirrors(bad)).toThrow(/messageId/);
   });
 
+  it('knows the copy of the message that /status puts into the post itself', () => {
+    const status = { channelId: '300000000000000009', messageId: '300000000000000003' };
+    const raid = { ...testRaid(), mirrorMessages: [{ ...status, kind: 'status' as const }] };
+    expect(partyMirrors(raid)).toEqual([{ ...status, kind: 'status' }]);
+    const unknown = { ...raid, mirrorMessages: [{ ...status, kind: 'pinned' } as never] };
+    expect(() => partyMirrors(unknown)).toThrow(/kind/);
+  });
+
   it('accepts every party the readers can read', () => {
     expect(() => partyState(fullRaid())).not.toThrow();
     expect(() => partyState(testRaid())).not.toThrow();
```

Apply to `src/domain/party/raid.test.ts`:

```diff
--- a/src/domain/party/raid.test.ts
+++ b/src/domain/party/raid.test.ts
@@ -17,6 +17,7 @@ import type { RaidBossRef } from './party.js';
 import {
   blocksNewRaid,
   raidBossRef,
+  raidMirrors,
   raidStage,
   setBoss,
   setEndTime,
@@ -464,3 +465,30 @@ describe('a boss object handed in whole', () => {
     expect(named.raid.boss).toEqual({ name: 'Newmon' });
   });
 });
+
+describe('raidMirrors', () => {
+  const plain = { taggedEx: false, confirmedEx: false };
+  const tagged = { taggedEx: true, confirmedEx: false };
+  const hosted = { taggedEx: false, confirmedEx: true };
+
+  it('wants a raid in the remote channel, and in the EX channel when its gym can host EX raids', () => {
+    const egg = testRaid();
+    expect(raidMirrors(egg, plain, PARTY_NOW)).toEqual(['remote']);
+    expect(raidMirrors(egg, tagged, PARTY_NOW)).toEqual(['ex', 'remote']);
+    expect(raidMirrors(egg, hosted, PARTY_NOW)).toEqual(['ex', 'remote']);
+    expect(raidMirrors(egg, undefined, PARTY_NOW)).toEqual(['remote']);
+  });
+
+  it('keeps an elite raid out of the remote channel and an EX raid out of the EX channel', () => {
+    expect(raidMirrors(testRaid({ tier: ELITE }), tagged, PARTY_NOW)).toEqual(['ex']);
+    const ex = testRaid({ tier: { level: 'EX', shadow: false } });
+    expect(raidMirrors(ex, tagged, PARTY_NOW)).toEqual(['remote']);
+  });
+
+  it('wants none for a raid that is over by the clock, or has ended', () => {
+    const raid = setEndTime(testRaid({ boss: YVELTAL }), PARTY_NOW + 10 * MINUTE, rules, PARTY_NOW);
+    expect(raidMirrors(raid, tagged, PARTY_NOW + 9 * MINUTE)).toEqual(['ex', 'remote']);
+    expect(raidMirrors(raid, tagged, PARTY_NOW + 10 * MINUTE)).toEqual([]);
+    expect(raidMirrors({ ...testRaid(), status: 'ended' }, tagged, PARTY_NOW)).toEqual([]);
+  });
+});
```

Create `src/render/mirrors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { catalogueFixture } from '../../test/support/game-data.js';
import { testGyms } from '../../test/support/gyms.js';
import { PARTY_NOW, PARTY_ZONE, testRaid } from '../../test/support/parties.js';
import { renderMirror } from './mirrors.js';
import { renderRaidPost } from './raid-post.js';

const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
const rendered = renderRaidPost({
  party: testRaid(),
  now: PARTY_NOW,
  gym: testGyms()[0],
  boss: undefined,
  catalogue: catalogueFixture(),
  showUnknownMoves: true,
  zone: PARTY_ZONE,
  emoji: { shiny: '✨', remote: '🛰️', teams },
});
const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };

describe('renderMirror', () => {
  it('copies the embed and the controls, under a line that links to the post', () => {
    const remote = renderMirror('remote', rendered, place);
    expect(remote.embeds).toEqual(rendered.message.embeds);
    expect(remote.components).toEqual(rendered.message.components);
    expect(remote.components?.length).toBeGreaterThan(0);
    expect(remote.content).toBe('A raid in <#100000000000000001>: <#900000000000000001>');
    expect(renderMirror('ex', rendered, place).content).toBe(
      'A raid at a gym that can host EX raids in <#100000000000000001>: <#900000000000000001>',
    );
  });

  it('names no region when the region is gone', () => {
    const lost = { ...place, regionChannelId: undefined };
    expect(renderMirror('remote', rendered, lost).content).toBe('A raid: <#900000000000000001>');
  });

  it('is the message itself for the copy in the post', () => {
    expect(renderMirror('status', rendered, place)).toBe(rendered.message);
  });
});
```

Run: `npx vitest run --project unit src/discord/party-gateway.test.ts src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/render/mirrors.test.ts`
Expected: FAIL (`raidMirrors`, `renderMirror`, `editMessage` and `findChannel` do not exist; the state test fails on the kind `status`).

- [ ] **Step 3: The implementation**

Apply to `src/discord/party-gateway.ts`:

```diff
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -2,6 +2,7 @@ import {
   ChannelFlags,
   ChannelType,
   DiscordAPIError,
+  PermissionFlagsBits,
   RESTJSONErrorCodes,
   RateLimitError,
   ThreadAutoArchiveDuration,
@@ -97,10 +98,21 @@ export interface PartyGateway {
   deleteChannel(channelId: string): Promise<void>;
   /** Sends a message into a text channel or a post; gives its id. */
   sendMessage(channelId: string, message: OutgoingMessage): Promise<string | undefined>;
+  /**
+   * Replaces a message this bot sent, in a text channel or a post. False when the message or its
+   * channel is gone.
+   */
+  editMessage(channelId: string, messageId: string, message: OutgoingMessage): Promise<boolean>;
   /** Deletes a message; one that is already gone is fine. */
   deleteMessage(channelId: string, messageId: string): Promise<void>;
   /** The name of a channel the bot can see, from the cache. */
   channelName(channelId: string): string | undefined;
+  /**
+   * The text channel with this name in the server that `nearChannelId` is in, in which the bot
+   * may send messages with embeds, from the cache: its id, or undefined when that server has
+   * none (of several, the oldest).
+   */
+  findChannel(nearChannelId: string, name: string): string | undefined;
   /**
    * A custom emoji, by name, of the server a channel is in, as message text (`<:name:id>`).
    * From the cache; undefined when the server has none of that name.
@@ -108,6 +120,13 @@ export interface PartyGateway {
   emoji(channelId: string, name: string): string | undefined;
 }
 
+/** What the bot needs in a channel to put a copy of a raid there. */
+const CAN_POST = [
+  PermissionFlagsBits.ViewChannel,
+  PermissionFlagsBits.SendMessages,
+  PermissionFlagsBits.EmbedLinks,
+];
+
 const GONE: ReadonlySet<number | string> = new Set([
   RESTJSONErrorCodes.UnknownChannel,
   RESTJSONErrorCodes.UnknownMessage,
@@ -366,6 +385,19 @@ export class DiscordPartyGateway implements PartyGateway {
     return this.unlessGone(async () => (await channel.send(payload(message))).id);
   }
 
+  async editMessage(
+    channelId: string,
+    messageId: string,
+    message: OutgoingMessage,
+  ): Promise<boolean> {
+    const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
+    if (!channel?.isTextBased()) return false;
+    return this.done(async () => {
+      if (channel.isThread()) await this.reopen(channel);
+      await channel.messages.edit(messageId, payload(message));
+    });
+  }
+
   async deleteMessage(channelId: string, messageId: string): Promise<void> {
     const channel = await this.unlessGone(() => this.client.channels.fetch(channelId));
     if (!channel?.isTextBased()) return;
@@ -379,6 +411,23 @@ export class DiscordPartyGateway implements PartyGateway {
       : undefined;
   }
 
+  findChannel(nearChannelId: string, name: string): string | undefined {
+    const near = this.client.channels.cache.get(nearChannelId);
+    if (!near || near.isDMBased()) return undefined;
+    const me = near.guild.members.me;
+    const found = near.guild.channels.cache
+      .filter(
+        (channel) =>
+          channel.type === ChannelType.GuildText &&
+          channel.name === name &&
+          // Unknown (the bot's own member is not cached) counts as allowed: Discord will say.
+          (me === null || (channel.permissionsFor(me)?.has(CAN_POST) ?? false)),
+      )
+      .sort((a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0))
+      .first();
+    return found?.id;
+  }
+
   emoji(channelId: string, name: string): string | undefined {
     const channel = this.client.channels.cache.get(channelId);
     if (!channel || channel.isDMBased()) return undefined;
```

Apply to `src/domain/party/party-state.ts`:

```diff
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -4,6 +4,7 @@ import {
   GROUP_IDS,
   MAX_COMPLETION_PROMPTS,
   MAX_MEMBER_NAME,
+  MIRROR_KINDS,
   TEAMS,
   type Attendee,
   type MirrorMessage,
@@ -181,7 +182,7 @@ function readState(stored: unknown) {
 }
 
 const mirrors = z.array(
-  z.object({ channelId: snowflake, messageId: snowflake, kind: z.enum(['ex', 'remote']) }),
+  z.object({ channelId: snowflake, messageId: snowflake, kind: z.enum(MIRROR_KINDS) }),
 );
 
 /** The part of a party that is stored as one JSON document (the `state` column). */
```

Apply to `src/domain/party/party.ts`:

```diff
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -86,13 +86,21 @@ export interface PartyGroup {
   startClearTime?: number;
 }
 
-/** A copy of the party's message outside its post (spec 5.2). */
+/**
+ * A copy of the party's message besides the first message of its post (spec 5.2), with the same
+ * controls. `ex` and `remote` are in the server's channels for raids at EX gyms and for raids
+ * that can be joined remotely; `status` is the copy `/status` puts at the bottom of the post
+ * itself (`channelId` is then the post). A party has at most one of each kind.
+ */
 export interface MirrorMessage {
   channelId: string;
   messageId: string;
-  kind: 'ex' | 'remote';
+  kind: MirrorKind;
 }
 
+export const MIRROR_KINDS = ['ex', 'remote', 'status'] as const;
+export type MirrorKind = (typeof MIRROR_KINDS)[number];
+
 export type PartyType = 'raid' | 'train' | 'meetup';
 export type PartyLifeStatus = 'active' | 'ended';
 
```

Apply to `src/domain/party/raid.ts`:

```diff
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -93,6 +93,26 @@ export function raidStage(party: RaidParty, now: number): RaidStage {
   return now < hatchTime ? 'egg' : 'hatched';
 }
 
+/**
+ * The channels besides its own post in which a raid's message should stand (spec 5.2): `ex` for
+ * a raid, itself not an EX raid, at a gym that can host EX raids; `remote` for a raid that can be
+ * joined remotely (every raid but an elite one). None once the raid has ended by the clock: what
+ * is over is of no use to somebody looking for a raid. Whether the server has such channels, and
+ * wants them, is the caller's to know.
+ */
+export function raidMirrors(
+  party: RaidParty,
+  gym: { taggedEx: boolean; confirmedEx: boolean } | undefined,
+  now: number,
+): ('ex' | 'remote')[] {
+  if (party.status !== 'active' || raidStage(party, now) === 'ended') return [];
+  const { level } = party.raid.tier;
+  return [
+    ...(gym && (gym.taggedEx || gym.confirmedEx) && level !== 'EX' ? ['ex' as const] : []),
+    ...(level !== 'Elite' ? ['remote' as const] : []),
+  ];
+}
+
 /** Whether this raid stands in the way of a new report for its gym: it does until it has ended. */
 export function blocksNewRaid(party: RaidParty, now: number): boolean {
   return party.status === 'active' && raidStage(party, now) !== 'ended';
```

Create `src/render/mirrors.ts`:

```ts
import type { OutgoingMessage } from '../discord/party-gateway.js';
import type { MirrorKind } from '../domain/party/party.js';
import type { RenderedPost } from './raid-post.js';

/** Where a raid is, for the line above a copy of its message in another channel. */
export interface MirrorPlace {
  /** The raid's post. */
  postId: string;
  /** The text channel of the raid's region; undefined when the region is gone. */
  regionChannelId: string | undefined;
}

/**
 * A copy of a raid's message for another place (spec 5.2): the same embed and the same controls
 * as the first message of the post, so a member can sign up where they see it. In another
 * channel a line above it says what it is and links to the post; the copy at the bottom of the
 * post itself (`status`) needs none.
 */
export function renderMirror(
  kind: MirrorKind,
  rendered: RenderedPost,
  place: MirrorPlace,
): OutgoingMessage {
  if (kind === 'status') return rendered.message;
  const region = place.regionChannelId === undefined ? '' : ` in <#${place.regionChannelId}>`;
  const what = kind === 'ex' ? 'A raid at a gym that can host EX raids' : 'A raid';
  return { ...rendered.message, content: `${what}${region}: <#${place.postId}>` };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/discord/party-gateway.test.ts src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/render/mirrors.test.ts`
Expected: PASS (the files of `src/domain/party`, `src/discord/party-gateway.ts`, `src/render/mirrors.ts` and the fake gateway).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/render/mirrors.test.ts src/render/mirrors.ts test/support/fake-gateway.ts
npm run check
git add src/discord/party-gateway.test.ts src/discord/party-gateway.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/render/mirrors.test.ts src/render/mirrors.ts test/support/fake-gateway.ts
git commit -m "Mirrors: the gateway edits a message and finds a channel by name; which copies a raid wants and what they say" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,795 unit tests.

---

### Task 2: PartyMirrors: the copies of a raid, kept up to date and deleted at the end

**Files:**
- Create: `src/services/party-mirrors.test.ts`, `src/services/party-mirrors.ts`
- Modify: `src/services/party-service.ts`, `test/support/fake-gateway.ts`, `test/support/gyms.ts`, `test/support/party-service.ts`

**Interfaces:**
- Consumes: Task 1; `PartyService` (`renderPost`, `closePost`, `postGone`, `abandon`, `flush`, `createPostFor`), `Coalescer` (`request`, `idle`, `flush`, `pending`), `PartyStore.update`, `renderRegionLink`, `isMissingPermission`, `isRefusedBody`; test support `partyServiceWith`, `reportedRaid`, `restarted`.
- Produces: `PartyMirrors` (`src/services/party-mirrors.ts`): `syncStatus(party, rendered)`, `changed(partyId)`, `repost(partyId): Promise<boolean>`, `idle(partyId)`, `remove(party)`, `linked(messageId, title)`, `flush()`, `pending`; `PartyServiceOptions.sharedDelayMs`; `PartyService.showStatus(partyId): Promise<boolean>`, `summaryText(regionId)` made public; `abandon` returns the party as it ended; test support `REMOTE_CHANNEL`, `EX_CHANNEL`, `gatewayWithMirrorChannels()`, `reportedRaid(report, overrides, kept)`.

`renderPost` becomes `showPost` (the old body) followed by `showCopies`: the `/status` copy is brought up to date there and then, and `PartyMirrors.changed` asks the queue of the shared channels. `closePost` and `postGone` wait for `mirrors.idle` before they delete the copies: by then the party has left the store, so nothing new can start. `create` records the new copy beside the earlier ones of its kind and takes each earlier one off the record only when its deletion worked; `sync` deletes every copy of a kind but the newest. The tests that need a render to run by itself pass `{ renderDelayMs: 0, sharedDelayMs: 0 }`.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-gateway.ts`:

```diff
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -74,7 +74,7 @@ export class FakePartyGateway implements PartyGateway {
   /** The ids of the forums deleted with `deleteChannel`, in order. */
   readonly deletedChannels: string[] = [];
   readonly failing = new Map<Method, Error>();
-  /** Makes `createPost` and `editPost` refuse (Invalid Form Body) an embed with a thumbnail. */
+  /** Makes every send and edit refuse (Invalid Form Body) an embed with a thumbnail. */
   rejectThumbnails = false;
   readonly calls: string[] = [];
   readonly channelNames = new Map<string, string>();
@@ -309,6 +309,7 @@ export class FakePartyGateway implements PartyGateway {
     return this.attempt('sendMessage', channelId, () => {
       if (this.gone.has(channelId) || this.forums.has(channelId)) return undefined;
       FakePartyGateway.checkMessage(message);
+      this.checkPicture(message);
       const post = this.posts.get(channelId);
       if (post) FakePartyGateway.reopen(post);
       const id = this.id();
```

Apply to `test/support/gyms.ts`:

```diff
--- a/test/support/gyms.ts
+++ b/test/support/gyms.ts
@@ -9,6 +9,9 @@ export const UNBOUNDED_CHANNEL = '100000000000000003';
 /** The forums holding the party posts of West and East. */
 export const WEST_FORUM = '100000000000000011';
 export const EAST_FORUM = '100000000000000012';
+/** The server's channels for copies of raids: those that can be joined remotely, those at EX gyms. */
+export const REMOTE_CHANNEL = '100000000000000021';
+export const EX_CHANNEL = '100000000000000022';
 
 function square(south: number, west: number, north: number, east: number): LatLon[] {
   return [
```

Apply to `test/support/party-service.ts`:

```diff
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -18,7 +18,7 @@ import {
 } from '../../src/services/party-service.js';
 import { FakePartyGateway } from './fake-gateway.js';
 import { catalogueFixture } from './game-data.js';
-import { EAST_FORUM, testRegions, WEST_FORUM } from './gyms.js';
+import { EAST_FORUM, EX_CHANNEL, REMOTE_CHANNEL, testRegions, WEST_FORUM } from './gyms.js';
 import { MemoryPartyStorage, PARTY_NOW, REPORTER } from './parties.js';
 import { gymsFixture } from './providers.js';
 import { raidBossesFixture } from './raid-bosses.js';
@@ -64,6 +64,19 @@ export class TestRegions {
   };
 }
 
+/**
+ * A fake gateway whose server has the two channels for copies of raids, under the names of the
+ * test settings (`REMOTE_CHANNEL`, `EX_CHANNEL`). Without them, as in most tests, a raid has no
+ * copies. Pass it as `{ gateway }` in `kept`.
+ */
+export function gatewayWithMirrorChannels(): FakePartyGateway {
+  const { channels } = loadSettings(TEST_SETTINGS_PATH);
+  const gateway = new FakePartyGateway();
+  gateway.channelNames.set(REMOTE_CHANNEL, channels['remote-raids']);
+  gateway.channelNames.set(EX_CHANNEL, channels['ex-gym-raids']);
+  return gateway;
+}
+
 /** What a restart of the bot leaves as it was: the database, Discord, and the time. */
 export interface Outliving {
   storage: MemoryPartyStorage;
@@ -137,6 +150,7 @@ export async function partyServiceWith(
     now,
     // Long enough that nothing runs by itself during a test.
     renderDelayMs: 3_600_000,
+    sharedDelayMs: 3_600_000,
     ...overrides,
   });
   const lines = new PartyLines({
@@ -208,8 +222,9 @@ export async function partyServiceWith(
 export async function reportedRaid(
   report: Partial<RaidReport> = {},
   overrides: Partial<PartyServiceOptions> = {},
+  kept?: Partial<Outliving>,
 ) {
-  const made = await partyServiceWith([], overrides);
+  const made = await partyServiceWith([], overrides, kept);
   const gym = gymsFixture().get(1);
   if (!gym) throw new Error('the invented gyms have no gym 1');
   const outcome = await made.service.reportRaid({
```

- [ ] **Step 2: Write the failing tests**

Create `src/services/party-mirrors.test.ts`:

```ts
import { DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { EX_CHANNEL, REMOTE_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
import { ALICE, at, MINUTE } from '../../test/support/parties.js';
import {
  gatewayWithMirrorChannels,
  reportedRaid,
  restarted,
} from '../../test/support/party-service.js';
import { gymsFixture } from '../../test/support/providers.js';
import { setBoss, setEndTime } from '../domain/party/raid.js';
import { PartyStatus } from '../domain/party/status.js';
import type { Member } from './attendance-service.js';
import type { PartyServiceOptions, RaidReport } from './party-service.js';

const alice: Member = { id: ALICE, name: 'Alice' };
const yveltal = { boss: { key: 'yveltal' } } as const;
const ELITE = { level: 'Elite', shadow: false } as const;

/** The invented gyms, with the Library (gym 1) as a gym that can host EX raids. */
function gymsWithExLibrary(): PartyServiceOptions['gyms'] {
  const gyms = gymsFixture();
  return {
    get: (id) => {
      const gym = gyms.get(id);
      return gym && id === 1 ? { ...gym, taggedEx: true } : gym;
    },
    regionsOf: (id) => gyms.regionsOf(id),
  };
}

/** A raid at the Library in a server that has both channels for copies. */
function mirrored(report: Partial<RaidReport> = {}, overrides: Partial<PartyServiceOptions> = {}) {
  return reportedRaid(report, overrides, { gateway: gatewayWithMirrorChannels() });
}

describe('the copies of a raid in other channels', () => {
  it('puts a new raid into the remote channel, with the controls and a link to the post', async () => {
    const made = await mirrored(yveltal);
    const { gateway, postId } = made;
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    const post = gateway.posts.get(postId);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
    expect(copy?.message.content).toBe(`A raid in <#${WEST_CHANNEL}>: <#${postId}>`);
    expect(copy?.message.embeds).toEqual(post?.message.embeds);
    expect(copy?.message.components).toEqual(post?.message.components);
    expect(copy?.message.mention).toBeUndefined();
    expect(made.current().mirrorMessages).toEqual([
      { channelId: REMOTE_CHANNEL, messageId: copy?.id, kind: 'remote' },
    ]);
    // The Library cannot host EX raids.
    expect(gateway.messagesIn(EX_CHANNEL)).toEqual([]);
  });

  it('puts a raid at an EX gym into the EX channel as well, but not an EX raid', async () => {
    const made = await mirrored({}, { gyms: gymsWithExLibrary() });
    expect(made.gateway.messagesIn(EX_CHANNEL)).toHaveLength(1);
    expect(made.gateway.messagesIn(EX_CHANNEL)[0]?.message.content).toBe(
      `A raid at a gym that can host EX raids in <#${WEST_CHANNEL}>: <#${made.postId}>`,
    );
    expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['ex', 'remote']);

    const ex = await mirrored(
      { tier: { level: 'EX', shadow: false } },
      { gyms: gymsWithExLibrary() },
    );
    expect(ex.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
    expect(ex.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
  });

  it('makes no copy where the server has no such channel or the feature is off', async () => {
    const plain = await reportedRaid(yveltal, { gyms: gymsWithExLibrary() });
    expect(plain.current().mirrorMessages).toEqual([]);
    expect(plain.gateway.calls.filter((call) => call.startsWith('sendMessage'))).toEqual([
      `sendMessage ${WEST_CHANNEL}`,
    ]);

    const settings = { ...plain.settings };
    settings.features = { ...settings.features, exGymChannel: false, remoteRaidChannel: false };
    const off = await mirrored(yveltal, { gyms: gymsWithExLibrary(), settings });
    expect(off.current().mirrorMessages).toEqual([]);
    expect(off.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(off.gateway.messagesIn(EX_CHANNEL)).toEqual([]);
  });

  it('shows a change in the copy too, and edits nothing when nothing changed', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service, postId } = made;
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy?.edits).toBe(1);
    expect(JSON.stringify(copy?.message.embeds)).toContain(ALICE);
    expect(copy?.message.embeds).toEqual(gateway.posts.get(postId)?.message.embeds);

    const before = gateway.calls.length;
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.calls.slice(before).filter((call) => call.startsWith('edit'))).toEqual([]);
  });

  it('carries controls that name the party, not the channel, so they work on the copy', async () => {
    const made = await mirrored(yveltal);
    const [copy] = made.gateway.messagesIn(REMOTE_CHANNEL);
    expect(JSON.stringify(copy?.message.components)).toContain(`party:${made.party.id}:join`);
  });

  it('takes the copy out of the remote channel when the raid turns out to be an elite one', async () => {
    const made = await mirrored();
    const { gateway, store, service } = made;
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    await store.update(made.party.id, (party) =>
      setBoss(party, { tier: ELITE, boss: null }, service.rules(), made.clock.now),
    );
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.deleted).toContainEqual({ channelId: REMOTE_CHANNEL, messageId: copy?.id });
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('takes the copies away once the raid is over by the clock', async () => {
    const made = await mirrored(yveltal, { gyms: gymsWithExLibrary() });
    const { gateway, store, service, clock } = made;
    await store.update(made.party.id, (party) => ({
      party: setEndTime(party, at('2026-10-13T14:20'), service.rules(), clock.now),
    }));
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);

    clock.now = at('2026-10-13T14:20');
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(EX_CHANNEL)).toEqual([]);
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('makes a copy anew that somebody deleted', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service } = made;
    const [first] = gateway.messagesIn(REMOTE_CHANNEL);
    gateway.gone.add(first?.id ?? '');
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const copies = gateway.messagesIn(REMOTE_CHANNEL).filter((copy) => copy.id !== first?.id);
    expect(copies).toHaveLength(1);
    expect(JSON.stringify(copies[0]?.message.embeds)).toContain(ALICE);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: REMOTE_CHANNEL, messageId: copies[0]?.id, kind: 'remote' },
    ]);
  });

  it('logs a copy that cannot be sent and tries again with the next change', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, attendance, service, entries } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    gateway.failing.set('sendMessage', new Error('Missing Permissions'));
    service.changed(made.party.id);
    await service.flush();
    expect(made.current().mirrorMessages).toEqual([]);
    expect(
      entries.some(
        (entry) => entry.level === 40 && entry.msg === 'could not send a copy of a party message',
      ),
    ).toBe(true);
    expect(gateway.posts.get(made.postId)?.archived).toBe(false);

    gateway.failing.clear();
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
  });

  it('deletes a copy again that it cannot record', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, storage } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    storage.failing = new Error('the database is away');
    service.changed(made.party.id);
    await service.flush();
    storage.failing = undefined;
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.calls.filter((call) => call === `sendMessage ${REMOTE_CHANNEL}`)).toHaveLength(
      1,
    );
    expect(made.current().mirrorMessages).toEqual([]);
  });

  it('sends a copy without the picture when Discord refuses the picture', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service } = made;
    expect(gateway.posts.get(made.postId)?.message.embeds?.[0]?.thumbnail).toBeDefined();
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    gateway.rejectThumbnails = true;
    service.changed(made.party.id);
    await service.flush();
    const [copy] = gateway.messagesIn(REMOTE_CHANNEL);
    expect(copy?.message.embeds?.[0]?.thumbnail).toBeUndefined();
    expect(copy?.message.embeds?.[0]?.title).toBeDefined();
  });

  it('edits every copy once after a restart, and then only for a change', async () => {
    const made = await mirrored(yveltal);
    const again = await restarted(made);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(1);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(made.gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(1);
  });
});

describe('the copies of a raid: what can go wrong on the way', () => {
  /** Every change is shown at once, as when changes come far apart. */
  const NO_DELAY = { renderDelayMs: 0, sharedDelayMs: 0 };

  /** Holds back the sends that `held` picks until `release()` is called. */
  function holdSends(
    made: Awaited<ReturnType<typeof reportedRaid>>,
    held: (channelId: string) => boolean,
  ) {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = made.gateway.sendMessage.bind(made.gateway);
    made.gateway.sendMessage = async (channelId, message) => {
      if (held(channelId) && message.embeds) await gate;
      return send(channelId, message);
    };
    return () => {
      release();
    };
  }

  function missingPermissions(): DiscordAPIError {
    const code = RESTJSONErrorCodes.MissingPermissions;
    return new DiscordAPIError(
      { code, message: 'Missing Permissions' },
      code,
      403,
      'POST',
      '/x',
      {},
    );
  }

  it('lets a /status that is on its way land before the post is archived', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    const release = holdSends(made, (channelId) => channelId === postId);
    const shown = service.showStatus(made.party.id);
    const ended = service.end(made.party.id);
    // The end waits for the copy: nothing is archived yet.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    release();
    expect(await ended).toBe(true);
    expect(await shown).toBe(false);
    expect(gateway.messagesIn(postId)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('shows in the /status copy what changed while that copy was on its way', async () => {
    const made = await reportedRaid(yveltal, NO_DELAY);
    const { gateway, service, attendance, postId } = made;
    const release = holdSends(made, (channelId) => channelId === postId);
    const shown = service.showStatus(made.party.id);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await vi.waitFor(() => {
      expect(JSON.stringify(gateway.posts.get(postId)?.message.embeds)).toContain(ALICE);
    });
    release();
    expect(await shown).toBe(true);
    await service.flush();
    const [copy] = gateway.messagesIn(postId).filter((message) => message.message.embeds);
    expect(JSON.stringify(copy?.message.embeds)).toContain(ALICE);
  });

  it('keeps an earlier copy on record until it could be deleted, and deletes it then', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId, entries } = made;
    await service.showStatus(made.party.id);
    const [first] = gateway.messagesIn(postId);
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    // The new copy is up: the member is not told that something went wrong.
    expect(await service.showStatus(made.party.id)).toBe(true);
    expect(made.current().mirrorMessages.map((copy) => copy.kind)).toEqual(['status', 'status']);
    expect(
      entries.some((entry) => entry.msg === 'could not delete an earlier copy of a party message'),
    ).toBe(true);

    gateway.failing.clear();
    await service.flush();
    const copies = gateway.messagesIn(postId);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(first?.id);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: postId, messageId: copies[0]?.id, kind: 'status' },
    ]);
  });

  it('deletes every copy at the end, also one whose deletion had failed before', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    await service.showStatus(made.party.id);
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await service.showStatus(made.party.id);
    gateway.failing.clear();
    expect(gateway.messagesIn(postId)).toHaveLength(2);
    await service.end(made.party.id);
    expect(gateway.messagesIn(postId)).toEqual([]);
  });

  it('says so loudly when a copy can neither be recorded nor deleted', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, storage, entries } = made;
    storage.failing = new Error('the database is away');
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    await expect(service.showStatus(made.party.id)).rejects.toThrow('the database is away');
    storage.failing = undefined;
    expect(
      entries.some(
        (entry) =>
          entry.level === 50 &&
          entry.msg ===
            'could not delete a copy that could not be recorded; it stays, with its buttons',
      ),
    ).toBe(true);
  });

  it('leaves a channel alone for ten minutes that refused it for lack of a permission', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, attendance, clock, entries } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    const send = gateway.sendMessage.bind(gateway);
    let refuse = true;
    gateway.sendMessage = (channelId, message) =>
      channelId === REMOTE_CHANNEL && refuse
        ? Promise.reject(missingPermissions())
        : send(channelId, message);
    const sends = () => gateway.calls.filter((call) => call === `sendMessage ${REMOTE_CHANNEL}`);
    let asked = 0;
    const real = gateway.findChannel.bind(gateway);
    gateway.findChannel = (near, name) => {
      if (name === 'remote-raids') asked++;
      return real(near, name);
    };
    for (let change = 0; change < 3; change++) {
      await attendance.changeNumber(made.party.id, alice, 1);
      await service.flush();
    }
    expect(asked).toBe(3);
    const warnings = entries.filter((entry) => entry.level === 40);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.msg).toMatch(/I lack a permission in that channel/);
    expect(made.current().mirrorMessages).toEqual([]);

    // Ten minutes later it is tried again, and by then the permission is there.
    refuse = false;
    clock.now += 10 * MINUTE;
    await attendance.changeNumber(made.party.id, alice, 1);
    await service.flush();
    expect(sends()).toHaveLength(1);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
  });

  it('does not make the post wait for the edit of its copy in a shared channel', async () => {
    const made = await mirrored(yveltal, NO_DELAY);
    const { gateway, service, attendance, postId } = made;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const edit = gateway.editMessage.bind(gateway);
    gateway.editMessage = async (channelId, messageId, message) => {
      if (channelId === REMOTE_CHANNEL) await gate;
      return edit(channelId, messageId, message);
    };
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await vi.waitFor(() => {
      expect(gateway.posts.get(postId)?.edits).toBe(1);
    });
    // The remote channel is slow; the post takes the next change all the same.
    await attendance.changeNumber(made.party.id, alice, 1);
    service.changed(made.party.id);
    const flushed = service.flush();
    await vi.waitFor(() => {
      expect(gateway.posts.get(postId)?.edits).toBe(2);
    });
    expect(gateway.messagesIn(REMOTE_CHANNEL)[0]?.edits).toBe(0);
    release();
    await flushed;
    expect(JSON.stringify(gateway.messagesIn(REMOTE_CHANNEL)[0]?.message.embeds)).toContain('+1');
  });

  it('waits at the end for an edit of a copy that is under way', async () => {
    const made = await mirrored(yveltal, NO_DELAY);
    const { gateway, service, attendance, postId } = made;
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const edit = gateway.editMessage.bind(gateway);
    gateway.editMessage = async (channelId, messageId, message) => {
      if (channelId === REMOTE_CHANNEL) await gate;
      return edit(channelId, messageId, message);
    };
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await vi.waitFor(() => {
      expect(gateway.posts.get(postId)?.edits).toBe(1);
    });
    const ended = service.end(made.party.id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gateway.posts.get(postId)?.archived).toBe(false);
    release();
    expect(await ended).toBe(true);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});

describe('the copies of a raid when it ends', () => {
  it('deletes them before the post is archived, and the archiving stays the last thing', async () => {
    const made = await mirrored(yveltal, { gyms: gymsWithExLibrary() });
    const { gateway, service, postId } = made;
    expect(await service.showStatus(made.party.id)).toBe(true);
    expect(gateway.messagesIn(postId)).toHaveLength(1);

    expect(await service.end(made.party.id)).toBe(true);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(EX_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(postId)).toEqual([]);
    expect(gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('deletes a copy that a render recorded while the party was ending', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service } = made;
    gateway.channelNames.set(REMOTE_CHANNEL, 'remote-raids');
    // The render that makes the copy is under way when the party ends.
    service.changed(made.party.id);
    const ended = service.end(made.party.id);
    await service.flush();
    expect(await ended).toBe(true);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('deletes them when the post is gone and the party ends for that', async () => {
    const made = await mirrored(yveltal);
    const { gateway, attendance, service, store } = made;
    gateway.gone.add(made.postId);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(store.get(made.party.id)).toBeUndefined();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
  });

  it('ends the party although a copy cannot be deleted, with a warning', async () => {
    const made = await mirrored(yveltal);
    const { gateway, service, entries } = made;
    gateway.failing.set('deleteMessage', new Error('Discord is away'));
    expect(await service.end(made.party.id)).toBe(true);
    expect(gateway.posts.get(made.postId)?.archived).toBe(true);
    expect(
      entries.some(
        (entry) =>
          entry.level === 40 &&
          entry.msg === 'could not delete a copy of the message of an ended party',
      ),
    ).toBe(true);
  });
});

describe('PartyService.showStatus', () => {
  it('puts a copy of the message at the bottom of the post, with the controls', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    expect(await service.showStatus(made.party.id)).toBe(true);
    const [copy] = gateway.messagesIn(postId);
    expect(copy?.message.content).toBeUndefined();
    expect(copy?.message).toEqual(gateway.posts.get(postId)?.message);
    expect(made.current().mirrorMessages).toEqual([
      { channelId: postId, messageId: copy?.id, kind: 'status' },
    ]);
  });

  it('deletes the copy of an earlier call, so the post has one', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, postId } = made;
    await service.showStatus(made.party.id);
    const [first] = gateway.messagesIn(postId);
    await service.showStatus(made.party.id);
    const copies = gateway.messagesIn(postId);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.id).not.toBe(first?.id);
    expect(made.current().mirrorMessages).toHaveLength(1);
  });

  it('keeps the copy up to date', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, attendance, postId } = made;
    await service.showStatus(made.party.id);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    const [copy] = gateway.messagesIn(postId);
    expect(JSON.stringify(copy?.message.embeds)).toContain(ALICE);
    expect(copy?.edits).toBe(1);
  });

  it('forgets a copy somebody deleted, without making another', async () => {
    const made = await reportedRaid(yveltal);
    const { gateway, service, attendance, postId } = made;
    await service.showStatus(made.party.id);
    const deleted = gateway.messagesIn(postId)[0]?.id ?? '';
    gateway.gone.add(deleted);
    await attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await service.flush();
    expect(made.current().mirrorMessages).toEqual([]);
    // Besides the deleted copy, only the line about Alice is in the post.
    const others = gateway.messagesIn(postId).filter((message) => message.id !== deleted);
    expect(others.filter((message) => message.message.embeds)).toEqual([]);
  });

  it('answers false for a party that has ended, and sends nothing', async () => {
    const made = await reportedRaid(yveltal);
    await made.service.end(made.party.id);
    const before = made.gateway.calls.length;
    expect(await made.service.showStatus(made.party.id)).toBe(false);
    expect(made.gateway.calls).toHaveLength(before);
  });
});

describe('the link line in the region channel', () => {
  it('follows the title of the post', async () => {
    const made = await reportedRaid();
    const { gateway, store, service, postId } = made;
    const [link] = gateway.messagesIn(WEST_CHANNEL);
    expect(link?.message.content).toBe(`New raid: **T5 egg · The Stacks** → <#${postId}>`);
    await store.update(made.party.id, (party) =>
      setBoss(
        party,
        { tier: party.raid.tier, boss: { key: 'yveltal' } },
        service.rules(),
        made.clock.now,
      ),
    );
    service.changed(made.party.id);
    await service.flush();
    expect(gateway.messagesIn(WEST_CHANNEL)[0]?.message.content).toBe(
      `New raid: **Yveltal · The Stacks** → <#${postId}>`,
    );
    expect(link?.edits).toBe(1);
  });

  it('is not edited for a change that leaves the title as it is', async () => {
    const made = await reportedRaid(yveltal);
    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
    await made.service.flush();
    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(0);
  });

  it('is taken as it is after a restart, and follows the title from then on', async () => {
    const made = await reportedRaid();
    const again = await restarted(made);
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(0);
    made.clock.now += 5 * MINUTE;
    await again.store.update(made.party.id, (party) =>
      setBoss(
        party,
        { tier: party.raid.tier, boss: { key: 'yveltal' } },
        again.service.rules(),
        made.clock.now,
      ),
    );
    again.service.changed(made.party.id);
    await again.service.flush();
    expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message.content).toContain('Yveltal');
  });

  it('is left alone when somebody deleted it', async () => {
    const made = await reportedRaid();
    const { gateway, store, service, entries } = made;
    gateway.gone.add(gateway.messagesIn(WEST_CHANNEL)[0]?.id ?? '');
    await store.update(made.party.id, (party) =>
      setBoss(
        party,
        { tier: party.raid.tier, boss: { key: 'yveltal' } },
        service.rules(),
        made.clock.now,
      ),
    );
    service.changed(made.party.id);
    await service.flush();
    expect(entries.some((entry) => entry.level === 40 || entry.level === 50)).toBe(false);
    expect(store.get(made.party.id)).toBeDefined();
  });
});
```

Run: `npx vitest run --project unit src/services/party-mirrors.test.ts`
Expected: FAIL (`party-mirrors.ts` does not exist; `showStatus` and the test support for the channels are missing).

- [ ] **Step 3: The implementation**

Create `src/services/party-mirrors.ts`:

```ts
import type { Settings } from '../config/settings.js';
import {
  isMissingPermission,
  isRefusedBody,
  type OutgoingMessage,
  type PartyGateway,
} from '../discord/party-gateway.js';
import type { MirrorKind, MirrorMessage, RaidParty } from '../domain/party/party.js';
import { raidMirrors } from '../domain/party/raid.js';
import type { Logger } from '../log.js';
import { renderMirror, type MirrorPlace } from '../render/mirrors.js';
import type { RenderedPost } from '../render/raid-post.js';
import { renderRegionLink } from '../render/summary.js';
import { Coalescer } from './coalescer.js';
import type { PartyStore } from './party-store.js';

const MINUTE = 60_000;
/** A channel that refused the bot is left alone for this long, then tried again. */
const REFUSED_FOR_MS = 10 * MINUTE;

export interface PartyMirrorsOptions {
  store: PartyStore;
  gateway: Pick<PartyGateway, 'sendMessage' | 'editMessage' | 'deleteMessage' | 'findChannel'>;
  regions: { byId(id: number): { channelId: string } | undefined };
  gyms: { get(id: number): { taggedEx: boolean; confirmedEx: boolean } | undefined };
  settings: Pick<Settings, 'features' | 'channels'>;
  /** What the post of a party shows now. */
  render: (party: RaidParty) => RenderedPost;
  log: Logger;
  now: () => number;
  /**
   * How long the changes of one party are gathered into one edit of its copies in the server's
   * shared channels. Default ten seconds: every raid of a server edits in those two channels,
   * and Discord limits the edits per channel.
   */
  sharedDelayMs?: number;
}

/** The message without the picture of its embeds, for when Discord refuses the picture. */
function withoutPicture(message: OutgoingMessage): OutgoingMessage {
  return {
    ...message,
    embeds: (message.embeds ?? []).map(({ thumbnail: _picture, ...rest }) => rest),
  };
}

function hasPicture(message: OutgoingMessage): boolean {
  return (message.embeds ?? []).some((embed) => embed.thumbnail !== undefined);
}

/**
 * The copies of a party's message besides the first message of its post (spec 5.2): one in the
 * server's channel for raids at EX gyms, one in its channel for raids that can be joined
 * remotely, and the one `/status` puts at the bottom of the post. Each carries the controls of
 * the post, which name the party in their custom ids, so a member signs up where they see it.
 * The line that links to a new raid in its region's channel is kept here too: it follows the
 * post's title.
 *
 * The party's record (`mirrorMessages`) is the list of what exists: a copy is recorded as soon
 * as it is sent and taken off the record only once it is deleted, so that whatever fails on the
 * way is tried again with the next render and nothing with buttons is left that nobody knows
 * of. A kind has one copy; of several (a new one was sent, the old one could not be deleted
 * yet) the newest counts.
 *
 * The copy in the post is brought up to date with the post itself (`syncStatus`). The copies in
 * the shared channels and the link line have a queue of their own (`changed`), slower than the
 * post's: all raids of a server edit in those channels, and a post must never wait for them.
 *
 * A server without such a channel (by the names in `settings.channels`), with the feature
 * switched off, or with a channel the bot may not write in, simply has no copy there.
 */
export class PartyMirrors {
  private readonly shared: Coalescer<string>;
  /** What each copy last showed, by its message id. A copy that would show the same is not edited. */
  private readonly sent = new Map<string, string>();
  /** The title each link line last showed, by its message id. */
  private readonly links = new Map<string, string>();
  /** `/status` calls that are under way, by party: the end of the party waits for them. */
  private readonly reposting = new Map<string, Set<Promise<unknown>>>();
  /** Channels that refused the bot (a missing permission), and until when they are left alone. */
  private readonly refused = new Map<string, number>();

  constructor(private readonly options: PartyMirrorsOptions) {
    this.shared = new Coalescer({
      delayMs: options.sharedDelayMs ?? 10_000,
      work: (partyId) => this.syncShared(partyId),
      onError: (err, party) =>
        options.log.warn({ err, party }, 'could not update the copies of a party'),
    });
  }

  private isRefused(channelId: string): boolean {
    const until = this.refused.get(channelId);
    if (until === undefined) return false;
    if (this.options.now() < until) return true;
    this.refused.delete(channelId);
    return false;
  }

  /** The channel that takes copies of this kind for a party of this region; undefined for none. */
  private channelFor(kind: 'ex' | 'remote', near: string | undefined): string | undefined {
    const { settings, gateway } = this.options;
    if (near === undefined) return undefined;
    const enabled =
      kind === 'ex' ? settings.features.exGymChannel : settings.features.remoteRaidChannel;
    if (!enabled) return undefined;
    return gateway.findChannel(
      near,
      settings.channels[kind === 'ex' ? 'ex-gym-raids' : 'remote-raids'],
    );
  }

  private place(party: RaidParty, postId: string): MirrorPlace {
    const region = party.regionId === null ? undefined : this.options.regions.byId(party.regionId);
    return { postId, regionChannelId: region?.channelId };
  }

  /** The link line of a new raid was just sent with this title: it needs no edit for it. */
  linked(messageId: string, title: string): void {
    this.links.set(messageId, title);
  }

  /**
   * A party changed: its copies in the shared channels and its link line are brought up to
   * date shortly (the first change at once, later ones gathered). Returns at once.
   */
  changed(partyId: string): void {
    this.shared.request(partyId);
  }

  /**
   * Runs `work` for one copy or one channel; a failure is logged and tried again with the next
   * render. A channel that refuses the bot for lack of a permission is left alone for a while,
   * and said once: every render of every raid would otherwise ask Discord again and be refused.
   */
  private async attempt(
    what: string,
    partyId: string,
    channelId: string,
    work: () => Promise<unknown>,
  ): Promise<void> {
    const { log, now } = this.options;
    try {
      await work();
    } catch (err) {
      if (isMissingPermission(err)) {
        this.refused.set(channelId, now() + REFUSED_FOR_MS);
        log.warn(
          { err, party: partyId, channel: channelId },
          `could not ${what}: I lack a permission in that channel, and leave it alone for a while`,
        );
      } else {
        log.warn({ err, party: partyId, channel: channelId }, `could not ${what}`);
      }
    }
  }

  /**
   * Brings the copies of these kinds up to date with `rendered`: edits those that would show
   * something else, creates the ones in `wanted` (kind to channel) that the party lacks, and
   * deletes the ones it should no longer have, as well as every copy of a kind but the newest.
   * A copy that somebody deleted is taken off the record. Never rejects.
   */
  private async sync(
    party: RaidParty,
    rendered: RenderedPost,
    kinds: readonly MirrorKind[],
    wanted: ReadonlyMap<MirrorKind, string>,
  ): Promise<void> {
    const postId = party.forumPostId;
    if (postId === null) return;
    const place = this.place(party, postId);
    const mine = party.mirrorMessages.filter((mirror) => kinds.includes(mirror.kind));
    const newest = new Map<MirrorKind, MirrorMessage>();
    for (const mirror of mine) newest.set(mirror.kind, mirror);

    const have = new Set<MirrorKind>();
    for (const mirror of mine) {
      // Neither edited nor deleted while its channel refuses the bot; it counts as there.
      if (this.isRefused(mirror.channelId)) {
        have.add(mirror.kind);
        continue;
      }
      const current = newest.get(mirror.kind) === mirror;
      // The copy in the post stays; one in a shared channel only while that channel takes it
      // (an elite boss was named, the raid is over, the channel was replaced by another).
      const keep =
        current && (mirror.kind === 'status' || wanted.get(mirror.kind) === mirror.channelId);
      if (!keep) {
        await this.attempt('delete a copy of a party message', party.id, mirror.channelId, () =>
          this.drop(party.id, mirror),
        );
        continue;
      }
      let gone = false;
      await this.attempt(
        'update a copy of a party message',
        party.id,
        mirror.channelId,
        async () => {
          gone = !(await this.edit(mirror, renderMirror(mirror.kind, rendered, place)));
          if (gone) await this.forget(party.id, mirror);
        },
      );
      // A copy whose edit failed is still there.
      if (!gone) have.add(mirror.kind);
    }
    for (const [kind, channelId] of wanted) {
      if (have.has(kind) || this.isRefused(channelId)) continue;
      await this.attempt('send a copy of a party message', party.id, channelId, () =>
        this.create(party.id, kind, channelId, renderMirror(kind, rendered, place)),
      );
    }
  }

  /**
   * Brings the copy in the post (`/status`) up to date with what the post shows. Call it from
   * the render of the post, which runs once at a time per party. Never rejects.
   */
  async syncStatus(party: RaidParty, rendered: RenderedPost): Promise<void> {
    await this.sync(party, rendered, ['status'], new Map());
  }

  /** One run of the queue of a party: its copies in the shared channels, and its link line. */
  private async syncShared(partyId: string): Promise<void> {
    const { store, gyms, gateway, now, render } = this.options;
    const party = store.get(partyId);
    const postId = party?.forumPostId;
    if (!party || !postId) return;
    const rendered = render(party);
    const place = this.place(party, postId);
    const gym = party.gymId === null ? undefined : gyms.get(party.gymId);
    // Without a channel of the server to start from, no channel is found and the copies go;
    // they are made again once there is one.
    const near = place.regionChannelId ?? party.forumChannelId ?? undefined;
    const wanted = new Map<MirrorKind, string>();
    for (const kind of raidMirrors(party, gym, now())) {
      const channelId = this.channelFor(kind, near);
      if (channelId !== undefined) wanted.set(kind, channelId);
    }
    await this.sync(party, rendered, ['ex', 'remote'], wanted);

    const linkId = party.regionLinkMessageId;
    const channelId = place.regionChannelId;
    if (linkId === null || channelId === undefined || this.isRefused(channelId)) return;
    const shown = this.links.get(linkId);
    // After a restart nothing is known of the line: it is taken as it is, and follows the
    // title from the next change of it on.
    if (shown === undefined) this.links.set(linkId, rendered.title);
    else if (shown !== rendered.title) {
      await this.attempt('update the link to a party', partyId, channelId, async () => {
        await gateway.editMessage(channelId, linkId, {
          content: renderRegionLink(rendered.title, postId),
        });
        this.links.set(linkId, rendered.title);
      });
    }
  }

  /** Edits a copy unless it shows this already. False when the copy is gone. */
  private async edit(mirror: MirrorMessage, message: OutgoingMessage): Promise<boolean> {
    const { gateway, log } = this.options;
    const key = JSON.stringify(message);
    if (this.sent.get(mirror.messageId) === key) return true;
    // Forgotten before anything is tried: a failure must not hide an edit that is still needed.
    this.sent.delete(mirror.messageId);
    let there: boolean;
    try {
      there = await gateway.editMessage(mirror.channelId, mirror.messageId, message);
    } catch (err) {
      if (!isRefusedBody(err) || !hasPicture(message)) throw err;
      log.warn({ err, message: mirror.messageId }, 'Discord refused the picture of a copy');
      there = await gateway.editMessage(
        mirror.channelId,
        mirror.messageId,
        withoutPicture(message),
      );
    }
    if (there) this.sent.set(mirror.messageId, key);
    return there;
  }

  /** Sends a message; when Discord refuses its picture, once more without it. */
  private async send(channelId: string, message: OutgoingMessage): Promise<string | undefined> {
    const { gateway, log } = this.options;
    try {
      return await gateway.sendMessage(channelId, message);
    } catch (err) {
      if (!isRefusedBody(err) || !hasPicture(message)) throw err;
      log.warn({ err, channel: channelId }, 'Discord refused the picture of a copy');
      return gateway.sendMessage(channelId, withoutPicture(message));
    }
  }

  /**
   * Sends a copy and records it on the party, then deletes the earlier copies of its kind and
   * takes each off the record once it is gone; one that cannot be deleted stays recorded, for
   * the next render to try again. A copy that cannot be recorded (the party ended meanwhile,
   * the write failed) is deleted again. False when nothing was recorded.
   */
  private async create(
    partyId: string,
    kind: MirrorKind,
    channelId: string,
    message: OutgoingMessage,
  ): Promise<boolean> {
    const { store, gateway, log } = this.options;
    const messageId = await this.send(channelId, message);
    if (messageId === undefined) return false;
    const mirror: MirrorMessage = { channelId, messageId, kind };
    let earlier: MirrorMessage[] = [];
    let recorded = false;
    try {
      const result = await store.update(partyId, (current) => {
        earlier = current.mirrorMessages.filter((other) => other.kind === kind);
        return { party: { ...current, mirrorMessages: [...current.mirrorMessages, mirror] } };
      });
      recorded = result?.written ?? false;
    } finally {
      if (!recorded) {
        try {
          await gateway.deleteMessage(channelId, messageId);
        } catch (err) {
          log.error(
            { err, party: partyId, channel: channelId, message: messageId },
            'could not delete a copy that could not be recorded; it stays, with its buttons',
          );
        }
      }
    }
    if (!recorded) return false;
    this.sent.set(messageId, JSON.stringify(message));
    for (const stale of earlier) {
      await this.attempt(
        'delete an earlier copy of a party message',
        partyId,
        stale.channelId,
        () => this.drop(partyId, stale),
      );
    }
    return true;
  }

  /** Takes a copy off the party's record; the message itself is not touched. */
  private async forget(partyId: string, mirror: MirrorMessage): Promise<void> {
    this.sent.delete(mirror.messageId);
    await this.options.store.update(partyId, (current) =>
      current.mirrorMessages.some((other) => other.messageId === mirror.messageId)
        ? {
            party: {
              ...current,
              mirrorMessages: current.mirrorMessages.filter(
                (other) => other.messageId !== mirror.messageId,
              ),
            },
          }
        : {},
    );
  }

  /** Deletes a copy and, once that is done, takes it off the party's record. */
  private async drop(partyId: string, mirror: MirrorMessage): Promise<void> {
    await this.options.gateway.deleteMessage(mirror.channelId, mirror.messageId);
    await this.forget(partyId, mirror);
  }

  /**
   * `/status`: puts a fresh copy of the party's message at the bottom of its post and deletes
   * the one an earlier `/status` put there. It is kept up to date like the other copies; the
   * caller asks for a render afterwards, since the party may have changed while the copy was
   * on its way. False when the party has ended or has no post, or the post cannot be sent to.
   */
  repost(partyId: string): Promise<boolean> {
    const run = (async () => {
      const party = this.options.store.get(partyId);
      const postId = party?.forumPostId;
      if (!party || !postId) return false;
      const message = renderMirror('status', this.options.render(party), this.place(party, postId));
      return this.create(partyId, 'status', postId, message);
    })();
    const running = this.reposting.get(partyId) ?? new Set();
    running.add(run);
    this.reposting.set(partyId, running);
    const done = (): void => {
      running.delete(run);
      if (running.size === 0) this.reposting.delete(partyId);
    };
    run.then(done, done);
    return run;
  }

  /**
   * Resolves once nothing of this class is sending or editing for a party: a run of its queue,
   * a `/status`. Whoever ends a party waits for this after the party has left the store (from
   * then on nothing new starts), so that nothing lands in the post after it was archived. A run
   * that is waiting for its delay is not started.
   */
  async idle(partyId: string): Promise<void> {
    await this.shared.idle(partyId);
    for (
      let running = this.reposting.get(partyId);
      running;
      running = this.reposting.get(partyId)
    ) {
      await Promise.allSettled(running);
    }
  }

  /** Does what is waiting in the queues now. For shutdown and for tests. */
  async flush(): Promise<void> {
    await this.shared.flush();
  }

  /** Parties with a run of their queue waiting or going on. */
  get pending(): number {
    return this.shared.pending;
  }

  /**
   * Deletes every copy of the message of a party that has ended, also the one in its post, and
   * forgets what is kept for them and for its link line. Never rejects.
   */
  async remove(party: RaidParty): Promise<void> {
    const { gateway, log } = this.options;
    if (party.regionLinkMessageId !== null) this.links.delete(party.regionLinkMessageId);
    for (const mirror of party.mirrorMessages) {
      this.sent.delete(mirror.messageId);
      try {
        await gateway.deleteMessage(mirror.channelId, mirror.messageId);
      } catch (err) {
        log.warn(
          { err, party: party.id, channel: mirror.channelId, message: mirror.messageId },
          'could not delete a copy of the message of an ended party',
        );
      }
    }
  }
}
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -30,6 +30,7 @@ import {
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
+import { PartyMirrors } from './party-mirrors.js';
 import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
@@ -113,6 +114,8 @@ export interface PartyServiceOptions {
   now?: () => number;
   /** How long changes of one post are gathered into one edit. Default two seconds. */
   renderDelayMs?: number;
+  /** The same for a party's copies in the server's shared channels. Default ten seconds. */
+  sharedDelayMs?: number;
   /**
    * Starts the timer of a title that has to wait for the rename limit and gives the function that
    * cancels it. Default: `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
@@ -154,9 +157,22 @@ export class PartyService {
    * text would be the same is not edited again.
    */
   private readonly summarySent = new Map<number, { postId: string; text: string }>();
+  /** The copies of a party's message in other channels and at the bottom of its post. */
+  private readonly mirrors: PartyMirrors;
 
   constructor(private readonly options: PartyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
+    this.mirrors = new PartyMirrors({
+      store: options.store,
+      gateway: options.gateway,
+      regions: options.regions,
+      gyms: options.gyms,
+      settings: options.settings,
+      render: (party) => renderRaidPost(this.view(party)),
+      log: options.log,
+      now: this.now,
+      ...(options.sharedDelayMs === undefined ? {} : { sharedDelayMs: options.sharedDelayMs }),
+    });
     this.setTimer =
       options.setTimer ??
       ((run, ms) => {
@@ -434,6 +450,7 @@ export class PartyService {
         content: renderRegionLink(rendered.title, post),
       });
       if (linkId !== undefined) {
+        this.mirrors.linked(linkId, rendered.title);
         const linked = await store.update(raid.id, (current) => ({
           party: { ...current, regionLinkMessageId: linkId },
         }));
@@ -484,16 +501,22 @@ export class PartyService {
     await this.abandon(partyId, 'could not end a raid without a post');
   }
 
-  /** Ends a raid that cannot be shown, so that it does not block its gym. */
-  private async abandon(partyId: string, failure: string): Promise<void> {
+  /**
+   * Ends a raid that cannot be shown, so that it does not block its gym. Gives the party as it
+   * was when it ended; undefined when it could not be ended (it stays active) or was not active.
+   */
+  private async abandon(partyId: string, failure: string): Promise<RaidParty | undefined> {
     const { store, log } = this.options;
     const postId = store.get(partyId)?.forumPostId;
+    let ended: RaidParty | undefined;
     try {
-      await store.update(partyId, (party) => ({ party: endParty(party) }));
+      const result = await store.update(partyId, (party) => ({ party: endParty(party) }));
+      if (result?.written) ended = result.party;
     } catch (err) {
       log.error({ err, party: partyId }, failure);
     }
     if (postId) this.forgetPost(postId);
+    return ended;
   }
 
   /** Forgets what is kept for a post: its rename budget, a title waiting for it, what it showed. */
@@ -547,9 +570,10 @@ export class PartyService {
   /**
    * Ends a party: it leaves the store first, so nothing shows or says anything in its post any
    * more; then the messages the bot would otherwise leave behind are deleted (open completion
-   * questions, the archive warning, the link line in the region's channel), the post is shown
-   * one last time, without its controls, and it is archived and locked. False when there is no
-   * such active party.
+   * questions, the archive warning, the link line in the region's channel, the copies of its
+   * message in other channels and at the bottom of the post), the post is shown one last time,
+   * without its controls, and it is archived and locked. False when there is no such active
+   * party.
    *
    * `onlyIf` is asked inside the store, about the party as it is at that moment: the scheduler
    * passes "still due", because a correction of the raid's times may have been stored since
@@ -587,9 +611,13 @@ export class PartyService {
         gateway.deleteMessage(regionChannel.channelId, linkId),
       );
     }
-    if (postId === null) return;
-    // A render that was under way when the party ended would open the post again.
+    // What was under way when the party ended (a render, a `/status`, an edit of a copy)
+    // would open the post again if it landed after the archiving. None of it can have recorded
+    // a copy that `party` does not know of: the party had ended.
     await this.posts.idle(party.id);
+    await this.mirrors.idle(party.id);
+    await this.mirrors.remove(party);
+    if (postId === null) return;
     const leftovers = [
       ...party.prompts.completion.map((question) => question.id),
       ...(party.prompts.warning === null ? [] : [party.prompts.warning]),
@@ -670,8 +698,9 @@ export class PartyService {
     do {
       await this.posts.flush();
       await this.summaries.flush();
-      // A post run can ask for a summary, and a summary run for a post.
-    } while (this.posts.pending > 0 || this.summaries.pending > 0);
+      await this.mirrors.flush();
+      // A post run can ask for a summary and for its copies, and a summary run for a post.
+    } while (this.posts.pending > 0 || this.summaries.pending > 0 || this.mirrors.pending > 0);
     for (const { cancel } of this.renameTimers.values()) cancel();
     this.renameTimers.clear();
     for (const { cancel } of this.summaryTimers.values()) cancel();
@@ -749,8 +778,13 @@ export class PartyService {
   private async postGone(party: RaidParty, postId: string): Promise<void> {
     const { gateway, log } = this.options;
     log.warn({ party: party.id, post: postId }, 'a party post is gone; ending the party');
-    await this.abandon(party.id, 'could not end a raid whose post is gone');
+    const ended = await this.abandon(party.id, 'could not end a raid whose post is gone');
     this.ended(party);
+    // Only of a party that has really ended: one that stays active keeps its copies.
+    if (ended) {
+      await this.mirrors.idle(party.id);
+      await this.mirrors.remove(ended);
+    }
     try {
       await gateway.deletePost(postId);
     } catch (err) {
@@ -761,7 +795,45 @@ export class PartyService {
     }
   }
 
+  /** One run of the render of a party: its post, then the copies of its message. */
   private async renderPost(partyId: string): Promise<void> {
+    try {
+      await this.showPost(partyId);
+    } finally {
+      await this.showCopies(partyId);
+    }
+  }
+
+  /**
+   * Brings the copies of a party's message up to date: the one in the post here and now, the
+   * ones in the server's shared channels through their own queue (see `PartyMirrors`), so that
+   * the post never waits for them. The party is read again: the render of the post may have
+   * ended it (its post was gone). Never rejects.
+   */
+  private async showCopies(partyId: string): Promise<void> {
+    const party = this.options.store.get(partyId);
+    if (!party?.forumPostId) return;
+    try {
+      await this.mirrors.syncStatus(party, renderRaidPost(this.view(party)));
+    } catch (err) {
+      this.options.log.warn({ err, party: partyId }, 'could not update the copy in a post');
+    }
+    this.mirrors.changed(partyId);
+  }
+
+  /**
+   * `/status` in a post: a fresh copy of the party's message at the bottom of its post, in the
+   * place of the one an earlier `/status` put there. False when there is no such active party.
+   */
+  async showStatus(partyId: string): Promise<boolean> {
+    const shown = await this.mirrors.repost(partyId);
+    // The party may have changed while the copy was on its way; a render that finds the copy
+    // up to date sends nothing.
+    if (shown) this.posts.request(partyId);
+    return shown;
+  }
+
+  private async showPost(partyId: string): Promise<void> {
     const { store, gateway, log } = this.options;
     const party = store.get(partyId);
     if (!party?.forumPostId) return;
@@ -861,7 +933,8 @@ export class PartyService {
     else this.sent.delete(postId);
   }
 
-  private summaryText(regionId: number): string {
+  /** The list of a region's raids, as its summary post shows it (also for `/status`). */
+  summaryText(regionId: number): string {
     const now = this.now();
     const raids = this.options.store.inRegion(regionId).map((party) => ({
       party,
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/services/party-mirrors.test.ts`
Expected: PASS (`src/services/party-mirrors.ts`, `src/services/party-service.ts` and the test support).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-service.ts test/support/fake-gateway.ts test/support/gyms.ts test/support/party-service.ts
npm run check
git add src/services/party-mirrors.test.ts src/services/party-mirrors.ts src/services/party-service.ts test/support/fake-gateway.ts test/support/gyms.ts test/support/party-service.ts
git commit -m "Copies of a raid in the remote and EX channels and at the bottom of its post; the link line follows the title" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,828 unit tests.

---

### Task 3: /status and /where

**Files:**
- Create: `src/commands/parties/status.test.ts`, `src/commands/parties/status.ts`
- Modify: `src/commands/index.ts`, `src/render/raid-post.ts`

**Interfaces:**
- Consumes: Task 2 (`PartyService.showStatus`, `summaryText`); `partyOf`, `regionChannelOf`, `requireGuild`, `requireParty`, `commandParty`, `PARTY_OVER`, `ACTION_THROTTLE`, `IN_A_RAID_POST`; `ctx.maps.gym`, `ctx.gyms.get`.
- Produces: The commands `status` and `where` (`src/commands/parties/status.ts`), `STATUS_THROTTLE` (5 a minute); `gymMapsUrl(gym)` in `raid-post.ts`.

Both are acknowledged privately first (`defer: 'ephemeral'`): `/status` in a post sends a message, `/where` may download a map. `/status` decides by where it was used: the post of an active raid, else a region's channel or forum (also the post of a raid that has ended), else a refusal.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/parties/status.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import {
  EAST_CHANNEL,
  UNBOUNDED_CHANNEL,
  WEST_CHANNEL,
  WEST_FORUM,
} from '../../../test/support/gyms.js';
import { ALICE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { mapsFixture } from '../../../test/support/providers.js';
import { createTestContext } from '../../../test/support/test-context.js';
import type { AppContext } from '../../app-context.js';
import type { CommandModule } from '../../discord/command.js';
import { InteractionRouter } from '../../discord/router.js';
import type { RaidReport } from '../../services/party-service.js';
import { status, where } from './status.js';

const all: CommandModule[] = [status, where];
const yveltal = { boss: { key: 'yveltal' } } as const;

async function setup(report: Partial<RaidReport> = {}, overrides: Partial<AppContext> = {}) {
  const made = await reportedRaid(report);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
    ...overrides,
  });
  const router = new InteractionRouter(ctx, all, []);
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** A command by Alice, in the raid's post unless `place` says otherwise. */
  const run = async (commandName: string, place: object = inPost) => {
    const interaction = fakeChatInput({ commandName, userId: ALICE, ...place });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, run };
}

describe('/status', () => {
  it('puts the raid at the bottom of its post again and says so privately', async () => {
    const made = await setup(yveltal);
    const used = await made.run('status');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe(
      'The raid is at the bottom of the post again, with its buttons.',
    );
    const copies = made.gateway.messagesIn(made.postId);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.message).toEqual(made.gateway.posts.get(made.postId)?.message);

    await made.run('status');
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
    expect(made.gateway.messagesIn(made.postId)[0]?.id).not.toBe(copies[0]?.id);
  });

  it('lists the raids of the region in its channel and in its forum, for the member alone', async () => {
    const made = await setup(yveltal);
    const listed = `<#${made.postId}> · no time set · 1 trainer`;
    const inChannel = await made.run('status', { channelId: WEST_CHANNEL });
    expect(inChannel.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(inChannel.editReply).content).toBe(listed);
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);

    const inForum = await made.run('status', { channelId: WEST_FORUM });
    expect(sent(inForum.editReply).content).toBe(listed);

    const elsewhere = await made.run('status', { channelId: EAST_CHANNEL });
    expect(sent(elsewhere.editReply).content).toBe('No raids right now. Report one with `/raid`.');
  });

  it('lists the region in the post of a raid that has ended', async () => {
    const made = await setup(yveltal);
    await made.service.end(made.party.id);
    const used = await made.run('status');
    expect(sent(used.editReply).content).toBe('No raids right now. Report one with `/raid`.');
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('says where it works when used anywhere else', async () => {
    const made = await setup();
    const used = await made.run('status', { channelId: '600000000000000009' });
    expect(used.followUp).toHaveBeenCalledWith({
      content: 'Use this in the channel of a region, or in the post of a raid.',
      flags: MessageFlags.Ephemeral,
    });
    // A region without an outline has no gyms and is not a place for raids.
    const unbounded = await made.run('status', { channelId: UNBOUNDED_CHANNEL });
    expect(unbounded.followUp).toHaveBeenCalled();
  });

  it('allows five uses a minute', async () => {
    const made = await setup(yveltal);
    for (let use = 0; use < 5; use++) await made.run('status');
    const sixth = await made.run('status');
    expect(sent(sixth.reply).content).toMatch(/^You can use \/status again in /);
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(1);
  });
});

describe('/where', () => {
  it('links to the gym in Google Maps, privately, and goes out without a map', async () => {
    const made = await setup();
    const used = await made.run('where');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply)).toEqual({
      content:
        '**The Stacks** (Pinewood Public Library)\n' +
        '[Open in Google Maps](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)',
      files: [],
    });
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
  });

  it('attaches the map of the gym when there is one', async () => {
    const asked: number[] = [];
    const maps = {
      ...mapsFixture(),
      gym: (gym: { id: number }) => {
        asked.push(gym.id);
        return Promise.resolve('var/images/gyms/1-abc.png');
      },
    };
    const made = await setup({}, { maps });
    const used = await made.run('where');
    expect(sent(used.editReply).files).toEqual(['var/images/gyms/1-abc.png']);
    expect(asked).toEqual([1]);
  });

  it('names a gym without a nickname by its name', async () => {
    const fountain = (await setup()).ctx.gyms.get(2);
    if (!fountain) throw new Error('no gym 2');
    const made = await setup({ gym: fountain });
    expect(sent((await made.run('where')).editReply).content).toMatch(
      /^\*\*Old Stone Fountain\*\*\n/,
    );
  });

  it('is for the post of a raid that is going on', async () => {
    const made = await setup();
    const used = await made.run('where', { channelId: WEST_CHANNEL });
    expect(sent(used.reply).content).toBe('Use this in the post of a raid that is still active.');
    expect(used.deferReply).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run --project unit src/commands/parties/status.test.ts`
Expected: FAIL (`status.ts` does not exist).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -3,6 +3,7 @@ import { admin } from './admin/index.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
 import { cancelMeet, meet } from './parties/meet.js';
+import { status, where } from './parties/status.js';
 import { boss, location, moveset } from './raids/boss.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
@@ -23,6 +24,8 @@ export const commands: readonly CommandModule[] = [
   group,
   meet,
   cancelMeet,
+  status,
+  where,
   hatch,
   end,
   duration,
```

Create `src/commands/parties/status.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, regionChannelOf, requireGuild, requireParty } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import { gymMapsUrl } from '../../render/raid-post.js';
import { plain } from '../../render/text.js';
import { IN_A_RAID_POST } from '../raids/change.js';
import { ACTION_THROTTLE, commandParty, PARTY_OVER } from './reply.js';

/** Every use in a post sends a message with an embed into it. */
export const STATUS_THROTTLE: Throttle = { uses: 5, perSeconds: 60 };

/**
 * `/status` (spec 4.2). In the post of a raid: the raid's message once more at the bottom of the
 * post, with its buttons, where the lines of the bot and the chat have pushed the first message
 * out of sight; the copy of an earlier `/status` is deleted. In a region's channel or forum: the
 * list of that region's raids, for the member alone.
 */
export const status: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription(
      'Show this raid again at the bottom of its post, or list the raids of a region',
    ),
  help: {
    category: 'basic-raid',
    details:
      'In the post of a raid: puts the raid, with who is coming and the buttons, at the bottom ' +
      'of the post again, so nobody has to scroll up. In the channel of a region: shows you the ' +
      'raids of that region that are going on, as the pinned list of its forum does.',
    examples: ['/status'],
  },
  guards: [requireGuild],
  defer: 'ephemeral',
  throttle: STATUS_THROTTLE,
  async execute(interaction, ctx) {
    const party = partyOf(interaction, ctx);
    if (party) {
      if (!(await ctx.partyService.showStatus(party.id))) throw new UserError(PARTY_OVER);
      await interaction.editReply({
        content: 'The raid is at the bottom of the post again, with its buttons.',
      });
      return;
    }
    const channelId = regionChannelOf(interaction, ctx);
    const region = channelId === undefined ? undefined : ctx.regions.byChannel(channelId);
    if (!region) {
      throw new UserError('Use this in the channel of a region, or in the post of a raid.');
    }
    await interaction.editReply({ content: ctx.partyService.summaryText(region.id) });
  },
};

/** `/where` (spec 4.2): where the raid's gym is, as a link and a map, for the member alone. */
export const where: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('where')
    .setDescription('Show where the gym of this raid is'),
  help: {
    category: 'basic-raid',
    details: `Shows you a link to the gym in Google Maps and a map of its surroundings. ${IN_A_RAID_POST}`,
    examples: ['/where'],
  },
  guards: [requireParty],
  defer: 'ephemeral',
  throttle: ACTION_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const gym = party.gymId === null ? undefined : ctx.gyms.get(party.gymId);
    if (!gym) throw new UserError('I no longer know the gym of this raid.');
    // A nickname that was cleared to an empty text names nothing, so it is tested for truth.
    const name = gym.nickname
      ? `**${plain(gym.nickname)}** (${plain(gym.name)})`
      : `**${plain(gym.name)}**`;
    // Without the map the message goes out all the same (no API key, or the download failed).
    const map = await ctx.maps.gym(gym);
    await interaction.editReply({
      content: `${name}\n[Open in Google Maps](<${gymMapsUrl(gym)}>)`,
      files: map === undefined ? [] : [map],
    });
  },
};
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -148,6 +148,11 @@ function gymName(gym: PostGym | undefined): string {
   return gym ? gym.nickname || gym.name : 'Unknown gym';
 }
 
+/** The address of a gym's place in Google Maps. */
+export function gymMapsUrl(gym: { lat: number; lon: number }): string {
+  return `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}`;
+}
+
 function tierWords(tier: RaidTier): string {
   return raidTierLabel(tier);
 }
@@ -480,9 +485,7 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
 
   const embed: APIEmbed = {
     title: embedTitle,
-    ...(gym
-      ? { url: `https://www.google.com/maps/search/?api=1&query=${gym.lat}%2C${gym.lon}` }
-      : {}),
+    ...(gym ? { url: gymMapsUrl(gym) } : {}),
     description: embedDescription,
     color: STAGE_COLOURS[stage],
     ...(shown?.image === undefined ? {} : { thumbnail: { url: shown.image } }),
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/status.test.ts`
Expected: PASS (`src/commands/parties/status.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/render/raid-post.ts
npm run check
git add src/commands/index.ts src/commands/parties/status.test.ts src/commands/parties/status.ts src/render/raid-post.ts
git commit -m "Status and where: /status puts the raid at the bottom of its post or lists the region; /where shows the gym" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,837 unit tests.

---

### Task 4: /shout

**Files:**
- Create: `src/commands/parties/shout.test.ts`, `src/commands/parties/shout.ts`
- Modify: `src/commands/index.ts`, `src/services/attendance-service.ts`

**Interfaces:**
- Consumes: `AttendanceService` (`pingable`, `announceMeeting`, `announceGroup`), `membersWhere`, `plain`, `count`; `requireParty`, `commandParty`, `actingMember`.
- Produces: `AttendanceService.shout(partyId, member, text): Promise<{ kind: 'gone' } | { kind: 'nobody' } | { kind: 'ok'; pinged: number }>`; the private helper `withMentions(text, members)` that the two announcements now share; the command `shout` (`src/commands/parties/shout.ts`), `SHOUT_THROTTLE` (3 per 180 s), `MAX_SHOUT` (500).

The test of what a member wrote uses the escape `\u200b` for the zero-width space `plain()` inserts: keep it as an escape (the Write tool turns such an escape into the raw character; check with grep afterwards).

- [ ] **Step 1: Write the failing tests**

Create `src/commands/parties/shout.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL, REPORTER, withAttendees } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import type { Member } from '../../services/attendance-service.js';
import { shout } from './shout.js';

const bob: Member = { id: BOB, name: 'Bob' };
const carol: Member = { id: CAROL, name: 'Carol' };
const yveltal = { boss: { key: 'yveltal' } } as const;

async function setup() {
  const made = await reportedRaid(yveltal);
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [shout], []);
  /** `/shout` by Alice, in the raid's post unless `place` says otherwise. */
  const run = async (message: string, place: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'shout',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      options: { message },
      ...place,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  return { ...made, ctx, run };
}

describe('/shout', () => {
  it('says the message in the post and pings the others who are signed up and allow it', async () => {
    const made = await setup();
    const id = made.party.id;
    await made.attendance.signUp(id, bob, PartyStatus.Coming);
    await made.attendance.signUp(id, carol, PartyStatus.Present);
    await made.attendance.flush();
    made.userSettings.set(BOB, { mentionsShouts: false });

    const used = await made.run('Lobby in two minutes');
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(used.editReply).content).toBe('Your message is in the post. I pinged 2 trainers.');
    const said = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect(said).toEqual({
      content:
        `<@${ALICE}> to everybody in this raid:\n> Lobby in two minutes\n` +
        `<@${REPORTER}> <@${CAROL}>`,
      mention: { users: [REPORTER, CAROL] },
    });
  });

  it('leaves out who is done and who switched all pings off, and never pings the sender', async () => {
    const made = await setup();
    const id = made.party.id;
    await made.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Present);
    await made.attendance.signUp(id, bob, PartyStatus.Present);
    await made.attendance.done(id, bob);
    await made.attendance.signUp(id, carol, PartyStatus.Interested);
    await made.attendance.flush();
    made.userSettings.set(CAROL, { mentions: false });

    await made.run('Wrong gym, sorry');
    const said = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect(said?.mention).toEqual({ users: [REPORTER] });
    expect(said?.content).not.toContain(`<@${BOB}>`);
  });

  it('says nothing when nobody else is signed up', async () => {
    const made = await setup();
    await made.store.update(made.party.id, (party) => ({ party: { ...party, attendees: {} } }));
    const before = made.gateway.calls.length;
    const used = await made.run('Anybody?');
    expect(sent(used.editReply).content).toBe(
      'Nobody else is signed up for this raid, so I said nothing.',
    );
    expect(made.gateway.calls).toHaveLength(before);
  });

  it('shows what the member wrote as text: no Markdown, no mention of everybody', async () => {
    const made = await setup();
    await made.run('**@everyone** come to <#123> now');
    const content = made.gateway.messagesIn(made.postId).at(-1)?.message.content ?? '';
    expect(content).toContain('\\*\\*@\u200beveryone\\*\\*');
    expect(content).not.toContain('<#123>');
  });

  it('keeps within one message and one hundred pings for a very large raid', async () => {
    const made = await setup();
    const crowd: Record<string, object> = {};
    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
    await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
    await made.run('x'.repeat(500));
    const said = made.gateway.messagesIn(made.postId).at(-1)?.message;
    expect((said?.content ?? '').length).toBeLessThanOrEqual(2000);
    const users = said?.mention?.users ?? [];
    expect(users.length).toBeGreaterThan(40);
    expect(users.length).toBeLessThanOrEqual(100);
    const named = [...(said?.content ?? '').matchAll(/<@(\d+)>/g)].map((m) => m[1]);
    expect(named).toEqual([ALICE, ...users]);
  });

  it('refuses a message of nothing but spaces, and a place that is no raid post', async () => {
    const made = await setup();
    const empty = await made.run('   ');
    expect(empty.followUp).toHaveBeenCalledWith({
      content: 'Say what you want to tell them.',
      flags: MessageFlags.Ephemeral,
    });
    const elsewhere = await made.run('hello', { channelId: WEST_CHANNEL, thread: undefined });
    expect(sent(elsewhere.reply).content).toBe(
      'Use this in the post of a raid that is still active.',
    );
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
  });

  it('allows three in three minutes', async () => {
    const made = await setup();
    for (let use = 0; use < 3; use++) await made.run(`message ${use}`);
    const fourth = await made.run('one more');
    expect(sent(fourth.reply).content).toMatch(/^You can use \/shout again in /);
    expect(made.gateway.messagesIn(made.postId)).toHaveLength(3);
  });

  it('says that the raid is over when it ended while the settings were read', async () => {
    const made = await setup();
    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
    await made.attendance.flush();
    const read = made.users.get.bind(made.users);
    made.users.get = async (snowflake) => {
      await made.service.end(made.party.id);
      return read(snowflake);
    };
    const used = await made.run('too late');
    expect(used.followUp).toHaveBeenCalledWith({
      content: 'This raid is over.',
      flags: MessageFlags.Ephemeral,
    });
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });
});
```

Run: `npx vitest run --project unit src/commands/parties/shout.test.ts`
Expected: FAIL (`shout.ts` and `AttendanceService.shout` do not exist).

- [ ] **Step 2: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -3,6 +3,7 @@ import { admin } from './admin/index.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
 import { cancelMeet, meet } from './parties/meet.js';
+import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
 import { boss, location, moveset } from './raids/boss.js';
 import { duration, end, hatch } from './raids/change.js';
@@ -26,6 +27,7 @@ export const commands: readonly CommandModule[] = [
   cancelMeet,
   status,
   where,
+  shout,
   hatch,
   end,
   duration,
```

Create `src/commands/parties/shout.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { requireParty } from '../../discord/guards.js';
import type { Throttle } from '../../discord/throttle.js';
import { count } from '../../render/text.js';
import { IN_A_RAID_POST } from '../raids/change.js';
import { actingMember, commandParty, PARTY_OVER } from './reply.js';

/** As the legacy bot allowed: a shout pings everybody who is signed up. */
export const SHOUT_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };

/** A shout is one line in the post; the mentions of those it pings need room after it. */
export const MAX_SHOUT = 500;

/**
 * `/shout` (spec 4.2): a member's message to everybody else who is signed up for the raid and
 * not done, said by the bot in the post so that it can ping them.
 */
export const shout: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('shout')
    .setDescription('Tell everybody who is signed up for this raid something, with a ping')
    .addStringOption((option) =>
      option
        .setName('message')
        .setDescription('What to tell them')
        .setRequired(true)
        .setMaxLength(MAX_SHOUT),
    ),
  help: {
    category: 'basic-raid',
    details:
      'Says your message in the post and pings everybody else who is signed up and not done, ' +
      'in every group, unless they switched such pings off. For what cannot wait: the lobby is ' +
      `starting, the gym was wrong. ${IN_A_RAID_POST}`,
    examples: ['/shout message:Starting the lobby in two minutes'],
  },
  guards: [requireParty],
  defer: 'ephemeral',
  throttle: SHOUT_THROTTLE,
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    const text = interaction.options.getString('message', true).trim();
    if (text === '') throw new UserError('Say what you want to tell them.');
    const outcome = await ctx.attendance.shout(party.id, actingMember(interaction), text);
    if (outcome.kind === 'gone') throw new UserError(PARTY_OVER);
    await interaction.editReply({
      content:
        outcome.kind === 'nobody'
          ? 'Nobody else is signed up for this raid, so I said nothing.'
          : `Your message is in the post. I pinged ${count(outcome.pinged, 'trainer')}.`,
    });
  },
};
```

Apply to `src/services/attendance-service.ts`:

```diff
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -26,6 +26,7 @@ import {
   attendeeOf,
   groupOf,
   MAX_COMPLETION_PROMPTS,
+  membersWhere,
   refused,
   type Attendee,
   type Change,
@@ -38,7 +39,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import type { Logger } from '../log.js';
 import { standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
-import { LIMITS, timestamp } from '../render/text.js';
+import { LIMITS, plain, timestamp } from '../render/text.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -85,6 +86,25 @@ export interface AttendanceServiceOptions {
   now?: () => number;
 }
 
+/**
+ * A message of this text that pings these members: their mentions follow the text on a line of
+ * their own, as many as fit into one message. The text itself always goes.
+ */
+function withMentions(
+  text: string,
+  members: readonly string[],
+): { content: string; mention: { users: string[] } } {
+  let content = text;
+  const users: string[] = [];
+  for (const id of members) {
+    const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
+    if (content.length + mention.length > LIMITS.content) break;
+    content += mention;
+    users.push(id);
+  }
+  return { content, mention: { users } };
+}
+
 function stillAsked(party: Party, members: readonly string[]): boolean {
   return members.some((id) => attendeeOf(party, id)?.status === PartyStatus.CompletePending);
 }
@@ -302,15 +322,37 @@ export class AttendanceService {
         : `<@${memberId}> set the meeting time${whose}: ${timestamp(time)} (${timestamp(time, 'R')}).`;
     const pingable = await this.pingable(others, (settings) => settings.mentionsGroups);
     if (!this.options.store.get(party.id)) return;
-    let content = said;
-    const users: string[] = [];
-    for (const id of pingable) {
-      const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
-      if (content.length + mention.length > LIMITS.content) break;
-      content += mention;
-      users.push(id);
-    }
-    await this.options.gateway.sendMessage(postId, { content, mention: { users } });
+    await this.options.gateway.sendMessage(postId, withMentions(said, pingable));
+  }
+
+  /**
+   * `/shout`: says a member's message in the post to everybody else who is signed up and has
+   * not completed the raid, in whatever group; those who allow it are pinged. `nobody` when
+   * there is no such member: nothing is said then.
+   */
+  async shout(
+    partyId: string,
+    member: Member,
+    text: string,
+  ): Promise<{ kind: 'gone' } | { kind: 'nobody' } | { kind: 'ok'; pinged: number }> {
+    const { store, gateway } = this.options;
+    const party = store.get(partyId);
+    const postId = party?.forumPostId ?? null;
+    if (!party || postId === null) return { kind: 'gone' };
+    const others = membersWhere(
+      party,
+      (attendee, id) => id !== member.id && attendee.status !== PartyStatus.Complete,
+    );
+    if (others.length === 0) return { kind: 'nobody' };
+    const pingable = await this.pingable(others, (settings) => settings.mentionsShouts);
+    // A message into the post of a party that has ended would open an archived post again.
+    if (!store.get(partyId)) return { kind: 'gone' };
+    const message = withMentions(
+      `<@${member.id}> to everybody in this raid:\n> ${plain(text)}`,
+      pingable,
+    );
+    if ((await gateway.sendMessage(postId, message)) === undefined) return { kind: 'gone' };
+    return { kind: 'ok', pinged: message.mention.users.length };
   }
 
   /**
@@ -509,15 +551,13 @@ export class AttendanceService {
       return;
     }
     // The sentence with its hint always goes; the mentions after it as many as fit.
-    let content = `${opened} To move to it, use its button on the post or \`/group join\`.`;
-    const users: string[] = [];
-    for (const id of pingable) {
-      const mention = `${users.length === 0 ? '\n' : ' '}<@${id}>`;
-      if (content.length + mention.length > LIMITS.content) break;
-      content += mention;
-      users.push(id);
-    }
-    await this.options.gateway.sendMessage(postId, { content, mention: { users } });
+    await this.options.gateway.sendMessage(
+      postId,
+      withMentions(
+        `${opened} To move to it, use its button on the post or \`/group join\`.`,
+        pingable,
+      ),
+    );
   }
 
   /** Sends what is waiting and waits for what is on its way. For shutdown and for tests. */
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/shout.test.ts`
Expected: PASS (`src/services/attendance-service.ts` and `src/commands/parties/shout.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/parties/shout.test.ts src/commands/parties/shout.ts src/services/attendance-service.ts
npm run check
git add src/commands/index.ts src/commands/parties/shout.test.ts src/commands/parties/shout.ts src/services/attendance-service.ts
git commit -m "Shout: /shout tells everybody who is signed up, with a ping" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,845 unit tests.

---

### Task 5: /delete, and a command that decides per use whether it is acknowledged first

**Files:**
- Create: `src/commands/parties/delete.test.ts`, `src/commands/parties/delete.ts`
- Modify: `src/commands/index.ts`, `src/components/party.ts`, `src/discord/command.ts`, `src/discord/guards.ts`, `src/discord/router.test.ts`, `src/discord/router.ts`, `src/render/party-controls.ts`, `src/services/party-service.ts`, `test/support/fake-interactions.ts`

**Interfaces:**
- Consumes: `PartyService.end(partyId, onlyIf?)` and `closePost`, `ended`; the router's deferral; `isManagement`, `memberRoleNames`, `partyOf`; `PARTY_ACTIONS`, `timeForm`, the handler's `modal` in `src/components/party.ts`; `plain`.
- Produces: `Deferral`, and `CommandHandler.defer?: Deferral | ((interaction, ctx) => Deferral | undefined)`; `isStaff(interaction, ctx)`, `managementRoleIds(interaction)` in `guards.ts`; `PartyService.end(partyId, onlyIf?, closing?: { lastWords?: string; left?: () => Promise<unknown> })`, `requestDeletion(partyId, memberId, reason, roleIds): Promise<'gone' | 'already' | 'asked'>`; the party action `'delete'`, `DELETE_REASON_INPUT`, `MAX_DELETE_REASON`, `deletionForm(partyId)`; the command `deleteRaid` (`src/commands/parties/delete.ts`); the fake interactions' `guildRoleNames`.

`closing.left` runs once the party has left the store and before anything is done to its post: `/delete` gives its private answer there. The form's handler checks that the submission came from the party's own post before anything else, acknowledges, and only then sends. Who asked is kept in memory per party and forgotten in `ended`. `/delete` has no throttle: staff must be able to use it as often as needed, and a request is limited where it is sent.

- [ ] **Step 1: Test support**

Apply to `test/support/fake-interactions.ts`:

```diff
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -25,6 +25,8 @@ export interface FakeOptions {
   channelName?: string;
   /** The names of channels of the server by id: `interaction.guild.channels.cache`. */
   guildChannelNames?: Record<string, string>;
+  /** The names of roles of the server by id: `interaction.guild.roles.cache`. */
+  guildRoleNames?: Record<string, string>;
   /** Name of the category the channel is under. */
   parentName?: string | null;
   /**
@@ -162,6 +164,11 @@ function base(kind: Kind, o: FakeOptions) {
                 Object.entries(o.guildChannelNames ?? {}).map(([id, name]) => [id, { id, name }]),
               ),
             },
+            roles: {
+              cache: new Collection(
+                Object.entries(o.guildRoleNames ?? {}).map(([id, name]) => [id, { id, name }]),
+              ),
+            },
           },
     channel: fakeChannel(o, channelId),
     deferred: o.deferred ?? false,
```

- [ ] **Step 2: Write the failing tests**

Create `src/commands/parties/delete.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import {
  fakeButton,
  fakeChatInput,
  fakeModal,
  sent,
  type FakeInteraction,
} from '../../../test/support/fake-interactions.js';
import { REMOTE_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, BOB, CAROL } from '../../../test/support/parties.js';
import { gatewayWithMirrorChannels, reportedRaid } from '../../../test/support/party-service.js';
import { TEST_ENV } from '../../../test/support/test-env.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { partyButtons } from '../../components/party.js';
import { decodeCustomId } from '../../discord/custom-id.js';
import { InteractionRouter } from '../../discord/router.js';
import { PartyStatus } from '../../domain/party/status.js';
import {
  DELETE_REASON_INPUT,
  deletionForm,
  MAX_DELETE_REASON,
} from '../../render/party-controls.js';
import { deleteRaid } from './delete.js';

const yveltal = { boss: { key: 'yveltal' } } as const;
const ADMIN_ROLE = '800000000000000001';
const MODERATOR_ROLE = '800000000000000002';
const guildRoleNames = {
  [ADMIN_ROLE]: 'Admin',
  [MODERATOR_ROLE]: 'moderator',
  '800000000000000003': 'Valor',
};
/** The zero-width space `plain()` puts where text would otherwise read as a mention. */
const ZW = String.fromCharCode(0x200b);

async function setup() {
  const made = await reportedRaid(yveltal, {}, { gateway: gatewayWithMirrorChannels() });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [deleteRaid], [partyButtons]);
  const handle = async (interaction: FakeInteraction) => {
    await router.handle(interaction as never);
    return interaction;
  };
  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
  /** `/delete` in the raid's post, by Alice with these roles. */
  const run = (roleNames: string[] = [], extra: object = {}) =>
    handle(fakeChatInput({ commandName: 'delete', userId: ALICE, roleNames, ...inPost, ...extra }));
  /** The form of `/delete`, sent from the raid's post by Alice with this reason. */
  const submit = (reason: string, extra: object = {}) =>
    handle(
      fakeModal({
        customId: deletionForm(made.party.id).custom_id,
        userId: ALICE,
        fields: { [DELETE_REASON_INPUT]: reason },
        guildRoleNames,
        ...inPost,
        ...extra,
      }),
    );
  /** The requests in the post: the messages that say which roles they may ping. */
  const requests = () =>
    made.gateway
      .messagesIn(made.postId)
      .map((message) => message.message)
      .filter((message) => message.mention?.roles !== undefined);
  return { ...made, ctx, run, submit, handle, requests };
}

describe('/delete from staff', () => {
  it('closes the raid at once: the post says who did it and is archived and locked', async () => {
    const made = await setup();
    const { gateway, store, postId } = made;
    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
    await made.attendance.flush();
    await made.service.flush();
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);

    const used = await made.run(['Moderator']);
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(used.showModal).not.toHaveBeenCalled();
    expect(sent(used.editReply).content).toBe(
      'This raid is closed: its gym is free for a new report, and I am archiving and locking its post.',
    );
    expect(store.get(made.party.id)).toBeUndefined();
    expect(made.storage.rows.get(made.party.id)?.status).toBe('ended');
    expect(made.said().at(-1)).toBe(`This raid was closed by <@${ALICE}>.`);
    const post = gateway.posts.get(postId);
    expect(post).toMatchObject({ archived: true, locked: true, reopened: 0 });
    expect(post?.message.components).toEqual([]);
    expect(gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
    expect(gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
    expect(gateway.calls.at(-1)).toBe(`archivePost ${postId}`);
  });

  it('answers the moderator before anything is done to the post', async () => {
    const made = await setup();
    const interaction = fakeChatInput({
      commandName: 'delete',
      userId: ALICE,
      roleNames: ['Admin'],
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
    });
    let callsWhenAnswered = -1;
    let activeWhenAnswered = true;
    const before = made.gateway.calls.length;
    interaction.editReply.mockImplementation(() => {
      callsWhenAnswered = made.gateway.calls.length - before;
      activeWhenAnswered = made.store.get(made.party.id) !== undefined;
      return Promise.resolve();
    });
    await made.handle(interaction);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    // The party had left the store, and Discord had not been asked for anything yet.
    expect(activeWhenAnswered).toBe(false);
    expect(callsWhenAnswered).toBe(0);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(true);
  });

  it('closes the raid although the answer cannot be given', async () => {
    const made = await setup();
    const interaction = fakeChatInput({
      commandName: 'delete',
      userId: ALICE,
      roleNames: ['Admin'],
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
    });
    interaction.editReply.mockImplementation(() =>
      Promise.reject(new Error('Unknown interaction')),
    );
    await made.handle(interaction);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
  });

  it('is for admins, moderators and the owner of the bot, not for bot developers', async () => {
    for (const who of [{ roleNames: ['ADMIN'] }, { userId: TEST_ENV.OWNER_ID }]) {
      const made = await setup();
      const used = await made.run(who.roleNames ?? [], who.userId ? { userId: who.userId } : {});
      expect(used.showModal).not.toHaveBeenCalled();
      expect(made.store.get(made.party.id)).toBeUndefined();
    }
    const made = await setup();
    const developer = await made.run(['Bot Developer']);
    expect(developer.showModal).toHaveBeenCalled();
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('has no limit: a moderator tidying up closes as many raids as there are', async () => {
    const made = await setup();
    for (const gymId of [2, 3, 4, 5, 6]) {
      const gym = made.ctx.gyms.get(gymId);
      if (!gym) throw new Error('an invented gym is missing');
      const outcome = await made.service.reportRaid({
        gym,
        reporterId: BOB,
        anonymous: false,
        autoStatus: PartyStatus.Interested,
        tier: { level: 'T5', shadow: false },
        boss: null,
      });
      if (outcome.kind !== 'created') throw new Error(outcome.kind);
      const used = await made.run(['Moderator'], { channelId: outcome.party.forumPostId });
      expect(sent(used.editReply).content).toMatch(/^This raid is closed/);
      expect(made.store.get(outcome.party.id)).toBeUndefined();
    }
  });

  it('frees the gym for a new report', async () => {
    const made = await setup();
    await made.run(['Admin']);
    const gym = made.ctx.gyms.get(1);
    if (!gym) throw new Error('no gym 1');
    const again = await made.service.reportRaid({
      gym,
      reporterId: BOB,
      anonymous: false,
      autoStatus: PartyStatus.Interested,
      tier: { level: 'T5', shadow: false },
      boss: null,
    });
    expect(again.kind).toBe('created');
  });

  it('says that the raid is over when somebody else closed it a moment before', async () => {
    const made = await setup();
    const end = made.service.end.bind(made.service);
    // The raid ends between the guard and the closing.
    made.service.end = async (...args) => {
      await end(made.party.id);
      return end(...args);
    };
    const used = await made.run(['Moderator']);
    expect(used.editReply).not.toHaveBeenCalled();
    expect(used.followUp).toHaveBeenCalledWith({
      content: 'This raid is over.',
      flags: MessageFlags.Ephemeral,
    });
  });
});

describe('/delete from anybody else', () => {
  it('opens a form for the reason and changes nothing', async () => {
    const made = await setup();
    const used = await made.run(['Valor']);
    expect(used.deferReply).not.toHaveBeenCalled();
    const form = used.showModal.mock.calls[0]?.[0] as ReturnType<typeof deletionForm>;
    expect(decodeCustomId(form.custom_id)).toMatchObject({
      kind: 'party',
      id: made.party.id,
      action: 'delete',
    });
    expect(made.store.get(made.party.id)).toBeDefined();
    expect(made.gateway.messagesIn(made.postId)).toEqual([]);
  });

  it('puts the reason into the post and pings the admin and moderator roles', async () => {
    const made = await setup();
    const sentForm = await made.submit('  Reported by mistake, the gym has no raid  ');
    expect(sentForm.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(sent(sentForm.editReply).content).toBe(
      'I have put your request into the post, for the moderators.',
    );
    expect(made.requests()).toEqual([
      {
        content:
          `<@&${ADMIN_ROLE}> <@&${MODERATOR_ROLE}>: <@${ALICE}> asks for this raid to be deleted.\n` +
          '> Reported by mistake, the gym has no raid',
        mention: { roles: [ADMIN_ROLE, MODERATOR_ROLE] },
      },
    ]);
    expect(made.store.get(made.party.id)).toBeDefined();
  });

  it('takes one request per member, and pings the roles only for the first of a raid', async () => {
    const made = await setup();
    await made.submit('A duplicate');
    const again = await made.submit('Really, a duplicate');
    expect(sent(again.editReply).content).toBe(
      'You have already asked the moderators to delete this raid.',
    );
    expect(made.requests()).toHaveLength(1);

    const carol = await made.submit('I think so too', { userId: CAROL });
    expect(sent(carol.editReply).content).toBe(
      'I have put your request into the post, for the moderators.',
    );
    expect(made.requests().at(-1)).toEqual({
      content: `<@${CAROL}> asks for this raid to be deleted.\n> I think so too`,
      mention: { roles: [] },
    });
  });

  it('lets a member ask again whose request could not be put into the post', async () => {
    const made = await setup();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    await made.submit('A duplicate');
    made.gateway.failing.clear();
    const again = await made.submit('A duplicate');
    expect(sent(again.editReply).content).toBe(
      'I have put your request into the post, for the moderators.',
    );
    expect(made.requests()).toHaveLength(1);
    expect(made.requests()[0]?.mention).toEqual({ roles: [ADMIN_ROLE, MODERATOR_ROLE] });
  });

  it('takes the form only from the post of that raid', async () => {
    const made = await setup();
    const elsewhere = await made.submit('From the region channel', {
      channelId: WEST_CHANNEL,
      thread: undefined,
    });
    expect(sent(elsewhere.reply).content).toBe('This control is no longer active.');
    expect(elsewhere.deferReply).not.toHaveBeenCalled();
    expect(made.requests()).toEqual([]);
  });

  it('puts the request into the post also when the server has no such role', async () => {
    const made = await setup();
    await made.submit('A duplicate', { guildRoleNames: {} });
    expect(made.requests()).toEqual([
      {
        content: `<@${ALICE}> asks for this raid to be deleted.\n> A duplicate`,
        mention: { roles: [] },
      },
    ]);
  });

  it('shows the reason as text, on one line, and pings no member with it', async () => {
    const made = await setup();
    await made.submit(`@everyone <@&${ADMIN_ROLE}>\nThis raid was closed by <@1>. **now**`, {
      guildRoleNames: {},
    });
    expect(made.requests()).toEqual([
      {
        content:
          `<@${ALICE}> asks for this raid to be deleted.\n` +
          `> @${ZW}everyone <${ZW}@&${ADMIN_ROLE}> This raid was closed by <${ZW}@1>. \\*\\*now\\*\\*`,
        mention: { roles: [] },
      },
    ]);
  });

  it('refuses an empty reason, and a form for a raid that has ended', async () => {
    const made = await setup();
    const empty = await made.submit('   ');
    expect(sent(empty.reply).content).toBe('Say why the raid should be deleted.');
    await made.service.end(made.party.id);
    const late = await made.submit('Too late');
    expect(sent(late.reply).content).toBe('This control is no longer active.');
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
  });

  it('has no button: a control with that action is no longer active', async () => {
    const made = await setup();
    const click = await made.handle(
      fakeButton({ customId: `party:${made.party.id}:delete`, userId: ALICE }),
    );
    expect(sent(click.reply).content).toBe('This control is no longer active.');
  });

  it('forgets who asked once the raid has ended', async () => {
    const made = await setup();
    await made.submit('A duplicate');
    await made.service.end(made.party.id);
    expect(await made.service.requestDeletion(made.party.id, ALICE, 'again', [])).toBe('gone');
  });
});

describe('deletionForm', () => {
  it('stays within what Discord allows for a form', () => {
    const form = deletionForm('00000000-0000-4000-8000-000000000001');
    expect(form.title.length).toBeLessThanOrEqual(45);
    expect(form.custom_id.length).toBeLessThanOrEqual(100);
    const rows = form.components as unknown as {
      components: { custom_id: string; max_length: number; label: string; placeholder: string }[];
    }[];
    const input = rows[0]?.components[0];
    expect(input).toMatchObject({ custom_id: DELETE_REASON_INPUT, max_length: MAX_DELETE_REASON });
    expect((input?.label ?? '').length).toBeLessThanOrEqual(45);
    expect((input?.placeholder ?? '').length).toBeLessThanOrEqual(100);
  });
});
```

Apply to `src/discord/router.test.ts`:

```diff
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -184,6 +184,46 @@ describe('InteractionRouter', () => {
     expect(open.ephemeral).toBe(false);
   });
 
+  it('asks a command whose acknowledgement depends on the use, after guards and throttle', async () => {
+    const { ctx } = createTestContext();
+    const order: string[] = [];
+    const cmd = command({
+      guards: [() => void order.push('guard')],
+      throttle: { uses: 2, perSeconds: 60 },
+      defer: (interaction, context) => {
+        order.push('defer?');
+        expect(context).toBe(ctx);
+        return interaction.user.id === 'staff' ? 'ephemeral' : undefined;
+      },
+      execute: (interaction) => {
+        order.push(interaction.deferred ? 'execute after deferral' : 'execute');
+        return Promise.resolve();
+      },
+    });
+    const router = new InteractionRouter(ctx, [cmd], []);
+    const staff = fakeChatInput({ userId: 'staff' });
+    await router.handle(asInteraction(staff));
+    expect(staff.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const member = fakeChatInput({ userId: 'member' });
+    await router.handle(asInteraction(member));
+    expect(member.deferReply).not.toHaveBeenCalled();
+    expect(order).toEqual([
+      'guard',
+      'defer?',
+      'execute after deferral',
+      'guard',
+      'defer?',
+      'execute',
+    ]);
+
+    // A use the throttle refuses is not asked.
+    await router.handle(asInteraction(fakeChatInput({ userId: 'staff' })));
+    const third = fakeChatInput({ userId: 'staff' });
+    await router.handle(asInteraction(third));
+    expect(third.deferReply).not.toHaveBeenCalled();
+    expect(order.filter((step) => step === 'defer?')).toHaveLength(3);
+  });
+
   it('does not acknowledge a command that a guard refuses', async () => {
     const { ctx } = createTestContext();
     const cmd = command({
```

Run: `npx vitest run --project unit src/commands/parties/delete.test.ts src/discord/router.test.ts`
Expected: FAIL (`delete.ts` does not exist; the router knows no `defer` function).

- [ ] **Step 3: The implementation**

Apply to `src/commands/index.ts`:

```diff
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -2,6 +2,7 @@ import type { CommandModule } from '../discord/command.js';
 import { admin } from './admin/index.js';
 import { done, here, join, leave, local, maybe, notHere, remote } from './parties/attendance.js';
 import { group } from './parties/group.js';
+import { deleteRaid } from './parties/delete.js';
 import { cancelMeet, meet } from './parties/meet.js';
 import { shout } from './parties/shout.js';
 import { status, where } from './parties/status.js';
@@ -28,6 +29,7 @@ export const commands: readonly CommandModule[] = [
   status,
   where,
   shout,
+  deleteRaid,
   hatch,
   end,
   duration,
```

Create `src/commands/parties/delete.ts`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { SimpleCommand } from '../../discord/command.js';
import { UserError } from '../../discord/errors.js';
import { isStaff, requireParty } from '../../discord/guards.js';
import { deletionForm } from '../../render/party-controls.js';
import { IN_A_RAID_POST } from '../raids/change.js';
import { commandParty, PARTY_OVER } from './reply.js';

/**
 * `/delete` (spec 4.2). From an admin, a moderator or the bot's owner it ends the raid at once:
 * the post says who closed it and is archived and locked, the copies and the link line go, and
 * the gym is free for a new report. It is the tool for what the clock does not tidy up by itself
 * (a raid reported by mistake, a duplicate, a post in a state nobody foresaw), so it works on any
 * raid that is still active, whatever its state, and as often as staff need it: it has no
 * throttle. From anybody else it opens a form for the reason, which is put into the post for the
 * moderators; nothing else happens, and what limits that is in `PartyService.requestDeletion`.
 */
export const deleteRaid: SimpleCommand = {
  data: new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Close this raid (moderators), or ask the moderators to'),
  help: {
    category: 'raid-crud',
    details:
      'Admins and moderators: closes the raid at once; its post is archived and locked and ' +
      'stays readable. Everybody else: asks why the raid should be deleted and puts that into ' +
      'the post for the moderators. A raid nobody comes to needs no deleting: it goes away by ' +
      `itself after it ends. ${IN_A_RAID_POST}`,
    examples: ['/delete'],
  },
  guards: [requireParty],
  // A form cannot follow an acknowledgement, and closing a raid takes several calls to Discord.
  defer: (interaction, ctx) => (isStaff(interaction, ctx) ? 'ephemeral' : undefined),
  async execute(interaction, ctx) {
    const party = commandParty(interaction, ctx);
    if (!isStaff(interaction, ctx)) {
      await interaction.showModal(deletionForm(party.id));
      return;
    }
    const closed = await ctx.partyService.end(party.id, undefined, {
      lastWords: `This raid was closed by <@${interaction.user.id}>.`,
      // The answer goes out before the post is archived and locked: nothing may follow that.
      left: () =>
        interaction.editReply({
          content:
            'This raid is closed: its gym is free for a new report, and I am archiving and ' +
            'locking its post.',
        }),
    });
    if (!closed) throw new UserError(PARTY_OVER);
  },
};
```

Apply to `src/components/party.ts`:

```diff
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -1,3 +1,4 @@
+import { MessageFlags } from 'discord.js';
 import {
   ACTION_THROTTLE,
   actingMember,
@@ -11,12 +12,18 @@ import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
-import { requireGuild } from '../discord/guards.js';
+import { managementRoleIds, partyOf, requireGuild } from '../discord/guards.js';
 import { STALE_COMPONENT } from '../discord/router.js';
 import { isGroupId } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { raidStage } from '../domain/party/raid.js';
-import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
+import {
+  DELETE_REASON_INPUT,
+  isPartyAction,
+  PARTY_KIND,
+  TIME_INPUT,
+  timeForm,
+} from '../render/party-controls.js';
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
@@ -120,6 +127,9 @@ export const partyButtons: ComponentHandler = {
         );
         return;
       }
+      case 'delete':
+        // Only the form of `/delete` has this action.
+        throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
@@ -133,8 +143,35 @@ export const partyButtons: ComponentHandler = {
     }
   },
 
-  /** The "Set time" form: what was typed is the hatch or the end time, as the form asked. */
+  /**
+   * The "Set time" form: what was typed is the hatch or the end time, as the form asked. The
+   * form of `/delete`: the reason goes into the post, for the moderators.
+   */
   async modal(interaction, id, ctx) {
+    if (id.action === 'delete') {
+      // The form opens only in the raid's own post, and its answer belongs there: a custom id
+      // can be sent from anywhere, for any party.
+      if (partyOf(interaction, ctx)?.id !== id.id) throw new UserError(STALE_COMPONENT);
+      const reason = interaction.fields.getTextInputValue(DELETE_REASON_INPUT).trim();
+      if (reason === '') throw new UserError('Say why the raid should be deleted.');
+      // Acknowledged first: the request is a message to Discord, which can take its time.
+      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+      const roles = managementRoleIds(interaction);
+      const asked = await ctx.partyService.requestDeletion(
+        id.id,
+        interaction.user.id,
+        reason,
+        roles,
+      );
+      if (asked === 'gone') throw new UserError(PARTY_OVER);
+      await interaction.editReply({
+        content:
+          asked === 'already'
+            ? 'You have already asked the moderators to delete this raid.'
+            : 'I have put your request into the post, for the moderators.',
+      });
+      return;
+    }
     const [parameter] = id.args;
     if (id.action !== 'time' || (parameter !== 'hatch' && parameter !== 'end')) {
       throw new UserError(STALE_COMPONENT);
```

Apply to `src/discord/command.ts`:

```diff
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -31,6 +31,9 @@ export interface CommandHelp {
   examples?: string[];
 }
 
+/** How a command is acknowledged before it runs: for the member alone, or for everyone. */
+export type Deferral = 'ephemeral' | 'public';
+
 /** What runs for one slash command, or for one subcommand of a grouped command. */
 export interface CommandHandler {
   guards?: readonly Guard[];
@@ -38,9 +41,13 @@ export interface CommandHandler {
    * Set this when `execute` may take more than two seconds (Discord allows three for the first
    * answer). The router then acknowledges before `execute` runs, and `execute` answers with
    * `editReply`. `public` shows "thinking…" to everyone and the answer is public; `ephemeral`
-   * shows both to the member only. A command that opens a modal must not defer.
+   * shows both to the member only. A command that opens a modal must not defer; one that does
+   * so only for some uses gives a function, which is asked after the guards and the throttle
+   * and answers undefined for "do not acknowledge".
    */
-  defer?: 'ephemeral' | 'public';
+  defer?:
+    | Deferral
+    | ((interaction: ChatInputCommandInteraction, ctx: AppContext) => Deferral | undefined);
   /** How often one member may use this. A use counts once the guards have let it through. */
   throttle?: Throttle;
   execute(interaction: ChatInputCommandInteraction, ctx: AppContext): Promise<void>;
```

Apply to `src/discord/guards.ts`:

```diff
--- a/src/discord/guards.ts
+++ b/src/discord/guards.ts
@@ -49,6 +49,19 @@ export function memberRoleNames(interaction: LocatedInteraction): string[] {
   return interaction.member.roles.cache.map((role) => role.name);
 }
 
+/** Whether the invoking member is an admin or a moderator of the server, or the bot's owner. */
+export function isStaff(interaction: LocatedInteraction, ctx: AppContext): boolean {
+  return isManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID);
+}
+
+/** The ids of the server's roles that make a member an admin or a moderator, to ping them. */
+export function managementRoleIds(interaction: LocatedInteraction): string[] {
+  if (!interaction.inCachedGuild()) return [];
+  return interaction.guild.roles.cache
+    .filter((role) => MANAGEMENT_ROLES.has(role.name.toLowerCase()))
+    .map((role) => role.id);
+}
+
 /**
  * The region an interaction happened in, as the id of the region's text channel: that channel
  * itself or a thread in it, or the region's forum or a post in it. Undefined anywhere else.
@@ -74,7 +87,7 @@ export const requireGuild: Guard = (interaction) => {
 
 export const requireManagement: Guard = (interaction, ctx) => {
   assertGuild(interaction);
-  if (!isManagement(memberRoleNames(interaction), interaction.user.id, ctx.config.env.OWNER_ID)) {
+  if (!isStaff(interaction, ctx)) {
     throw new UserError('Only admins and moderators can do that.');
   }
 };
```

Apply to `src/discord/router.ts`:

```diff
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -114,9 +114,11 @@ export class InteractionRouter {
           throw new UserError(`You can use /${name} again in ${waitText(wait)}.`);
         }
       }
-      if (handler.defer) {
+      const defer =
+        typeof handler.defer === 'function' ? handler.defer(interaction, this.ctx) : handler.defer;
+      if (defer) {
         await interaction.deferReply(
-          handler.defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {},
+          defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {},
         );
       }
       await handler.execute(interaction, this.ctx);
```

Apply to `src/render/party-controls.ts`:

```diff
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -22,7 +22,8 @@ export const PARTY_KIND = 'party';
 /**
  * What a control of a post does: the action part of its custom id. `group` carries the group's
  * letter as its argument, `answer` carries `yes` or `no` (the completion question). `time` is
- * the "Set time" button, and the form it opens, which carries `hatch` or `end`.
+ * the "Set time" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
+ * form of `/delete` for members who are not staff; no button has it.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -36,6 +37,7 @@ export const PARTY_ACTIONS = [
   'group',
   'answer',
   'time',
+  'delete',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -182,6 +184,39 @@ export function timeForm(
   };
 }
 
+/** The id of the one input of the form that asks why a raid should be deleted. */
+export const DELETE_REASON_INPUT = 'reason';
+/** A reason is quoted in the post, in one message with the pings. */
+export const MAX_DELETE_REASON = 500;
+
+/**
+ * The form `/delete` opens for a member who is not staff: why the raid should be deleted. What
+ * they write is put into the post for the moderators, who decide.
+ */
+export function deletionForm(partyId: string): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: encodeCustomId({ kind: PARTY_KIND, id: partyId, action: 'delete' }),
+    title: 'Ask the moderators to delete this raid',
+    components: [
+      {
+        type: ComponentType.ActionRow,
+        components: [
+          {
+            type: ComponentType.TextInput,
+            custom_id: DELETE_REASON_INPUT,
+            label: 'Why should it be deleted?',
+            style: TextInputStyle.Paragraph,
+            required: true,
+            min_length: 3,
+            max_length: MAX_DELETE_REASON,
+            placeholder: 'A raid nobody comes to is no reason: it goes away by itself.',
+          },
+        ],
+      },
+    ],
+  };
+}
+
 /** A group's label as text for a sentence: `group B` or `group B (park side)`. */
 export function groupWords(group: { id: string; label?: string }): string {
   return group.label ? `group ${group.id} (${plain(group.label)})` : `group ${group.id}`;
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -28,6 +28,7 @@ import {
   type RenderedPost,
 } from '../render/raid-post.js';
 import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
+import { plain } from '../render/text.js';
 import { Coalescer } from './coalescer.js';
 import type { GameDataProvider } from './game-data-service.js';
 import { PartyMirrors } from './party-mirrors.js';
@@ -42,6 +43,8 @@ const RENAMES = 2;
 const RENAME_WINDOW_MS = 10 * MINUTE;
 /** A retry after a rate limit waits at least this long and at most the rename window. */
 const MIN_RETRY_MS = 1_000;
+/** A request to the moderators pings at most this many roles (a server has an admin and a moderator role). */
+const MAX_ROLE_PINGS = 5;
 /** An unchanged post is checked for existence at most this often. */
 const CHECK_EVERY_MS = 10 * MINUTE;
 
@@ -159,6 +162,8 @@ export class PartyService {
   private readonly summarySent = new Map<number, { postId: string; text: string }>();
   /** The copies of a party's message in other channels and at the bottom of its post. */
   private readonly mirrors: PartyMirrors;
+  /** Who has asked the moderators to delete a party, by party: each member asks once. */
+  private readonly deletionRequests = new Map<string, Set<string>>();
 
   constructor(private readonly options: PartyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
@@ -557,7 +562,8 @@ export class PartyService {
    * the summary of its region is brought up to date shortly. Must be called for every party that
    * is ended elsewhere (a timer, a command): it also drops what is kept for the post.
    */
-  ended(party: { forumPostId: string | null; regionId: number | null }): void {
+  ended(party: { id?: string; forumPostId: string | null; regionId: number | null }): void {
+    if (party.id !== undefined) this.deletionRequests.delete(party.id);
     if (party.forumPostId !== null) this.forgetPost(party.forumPostId);
     if (party.regionId !== null) this.summaries.request(party.regionId);
   }
@@ -579,22 +585,74 @@ export class PartyService {
    * passes "still due", because a correction of the raid's times may have been stored since
    * its tick decided. False when it says no.
    *
+   * `closing.lastWords` is said in the post before it is archived: why it ends, when that is
+   * not the clock (`/delete`). `closing.left` is called once the party has left the store and
+   * before anything is done to its post: an answer to an interaction in that post must be given
+   * there, not after the archiving. What it throws is logged.
+   *
    * What fails on Discord's side after the party has ended is logged and not tried again here;
    * a post that stayed open is archived by `sweepPosts`.
    */
-  async end(partyId: string, onlyIf?: (party: RaidParty) => boolean): Promise<boolean> {
+  async end(
+    partyId: string,
+    onlyIf?: (party: RaidParty) => boolean,
+    closing: { lastWords?: string; left?: () => Promise<unknown> } = {},
+  ): Promise<boolean> {
     const result = await this.options.store.update(partyId, (party) =>
       onlyIf && !onlyIf(party) ? {} : { party: endParty(party) },
     );
     if (!result?.written || !result.party) return false;
     const party = result.party;
     this.ended(party);
-    await this.closePost(party);
+    if (closing.left) {
+      try {
+        await closing.left();
+      } catch (err) {
+        this.options.log.warn({ err, party: partyId }, 'could not answer before closing a party');
+      }
+    }
+    await this.closePost(party, closing.lastWords);
     return true;
   }
 
+  /**
+   * `/delete` from a member who is not staff: their reason is put into the post for the
+   * moderators. A member asks once per party (`already` after that; kept in memory, so a
+   * restart lets them ask again), and only the first request a party gets pings the roles
+   * given: the moderators are called once, the others add their reasons. `gone` when there is
+   * no such active party.
+   */
+  async requestDeletion(
+    partyId: string,
+    memberId: string,
+    reason: string,
+    roleIds: readonly string[],
+  ): Promise<'gone' | 'already' | 'asked'> {
+    const { store, gateway } = this.options;
+    const postId = store.get(partyId)?.forumPostId;
+    if (!postId) return 'gone';
+    const asked = this.deletionRequests.get(partyId) ?? new Set<string>();
+    if (asked.has(memberId)) return 'already';
+    const roles = asked.size === 0 ? roleIds.slice(0, MAX_ROLE_PINGS) : [];
+    // Noted before the send: a second form sent meanwhile must not ask (or ping) again.
+    asked.add(memberId);
+    this.deletionRequests.set(partyId, asked);
+    const whom = roles.length === 0 ? '' : `${roles.map((id) => `<@&${id}>`).join(' ')}: `;
+    let sent: string | undefined;
+    try {
+      sent = await gateway.sendMessage(postId, {
+        content: `${whom}<@${memberId}> asks for this raid to be deleted.\n> ${plain(reason)}`,
+        mention: { roles },
+      });
+    } finally {
+      // What was not said can be asked again.
+      if (sent === undefined) asked.delete(memberId);
+    }
+    return sent === undefined ? 'gone' : 'asked';
+  }
+
   /** What `end` does on Discord for a party that has left the store. Never rejects. */
-  private async closePost(party: RaidParty): Promise<void> {
+  private async closePost(party: RaidParty, lastWords?: string): Promise<void> {
     const { gateway, regions, log } = this.options;
     const postId = party.forumPostId;
     const attempt = async (what: string, work: () => Promise<unknown>): Promise<void> => {
@@ -627,6 +685,11 @@ export class PartyService {
         gateway.deleteMessage(postId, messageId),
       );
     }
+    if (lastWords !== undefined) {
+      await attempt('say why a party ended', () =>
+        gateway.sendMessage(postId, { content: lastWords }),
+      );
+    }
     let there = true;
     await attempt('show an ended party one last time', async () => {
       const rendered = renderRaidPost(this.view(party));
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/delete.test.ts src/discord/router.test.ts`
Expected: PASS (the router, the guards, the party service, the controls and `src/commands/parties/delete.ts`).

- [ ] **Step 5: Format, check, commit**

```bash
npx prettier --write src/commands/index.ts src/commands/parties/delete.test.ts src/commands/parties/delete.ts src/components/party.ts src/discord/command.ts src/discord/guards.ts src/discord/router.test.ts src/discord/router.ts src/render/party-controls.ts src/services/party-service.ts test/support/fake-interactions.ts
npm run check
git add src/commands/index.ts src/commands/parties/delete.test.ts src/commands/parties/delete.ts src/components/party.ts src/discord/command.ts src/discord/guards.ts src/discord/router.test.ts src/discord/router.ts src/render/party-controls.ts src/services/party-service.ts test/support/fake-interactions.ts
git commit -m "Delete: staff close a raid at once, others ask the moderators through a form; a command may decide per use whether it is acknowledged first" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,864 unit tests.

---

### Task 6: /admin save-party

**Files:**
- Create: `src/commands/admin/save-party.test.ts`, `src/commands/admin/save-party.ts`
- Modify: `src/commands/admin/index.ts`, `src/render/raid-post.ts`, `src/services/party-service.ts`

**Interfaces:**
- Consumes: `setSaved` (`raid.ts`, plan 2B), `PartyService.changed`, the scheduler's `settleWarning` and the tick's `saved` rules (unchanged); `/admin`'s `parts`; `requireParty`, `partyOf`.
- Produces: `PartyService.keep(partyId, saved, memberId): Promise<'gone' | 'kept' | 'let-go' | 'unchanged'>`; the subcommand `saveParty` (`src/commands/admin/save-party.ts`); the post's description says when it is kept.

The clock needs no change: `setSaved(party, true)` clears the archiving time, so the next tick takes the warning away (`settleWarning`), and `setSaved(party, false)` leaves the tick to schedule the archiving anew.

- [ ] **Step 1: Write the failing tests**

Create `src/commands/admin/save-party.test.ts`:

```ts
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
import { ALICE, at, MINUTE } from '../../../test/support/parties.js';
import { reportedRaid } from '../../../test/support/party-service.js';
import { createTestContext } from '../../../test/support/test-context.js';
import { InteractionRouter } from '../../discord/router.js';
import { admin } from './index.js';

const END = at('2026-10-13T14:30');

async function setup() {
  const made = await reportedRaid({ boss: { key: 'yveltal' }, time: { end: END } });
  const { ctx } = createTestContext({
    partyService: made.service,
    attendance: made.attendance,
    parties: made.store,
    regions: made.regions,
  });
  const router = new InteractionRouter(ctx, [admin], []);
  /** `/admin save-party` by Alice, an admin, in the raid's post unless `extra` says otherwise. */
  const run = async (options: Record<string, boolean> = {}, extra: object = {}) => {
    const interaction = fakeChatInput({
      commandName: 'admin',
      subcommand: 'save-party',
      channelId: made.postId,
      thread: { parentId: WEST_FORUM },
      userId: ALICE,
      roleNames: ['Admin'],
      options,
      ...extra,
    });
    await router.handle(interaction as never);
    return interaction;
  };
  const tickAt = async (time: number) => {
    made.clock.now = time;
    await made.scheduler.tick();
    await made.scheduler.whenIdle();
    await made.attendance.flush();
    await made.service.flush();
  };
  return { ...made, run, tickAt };
}

describe('/admin save-party', () => {
  it('keeps the post: the clock neither warns nor archives it', async () => {
    const made = await setup();
    const used = await made.run();
    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(used.editReply).toHaveBeenCalledWith({
      content:
        'This post is kept: I will not archive it by myself. `/delete` closes it, and ' +
        '`/admin save-party keep:False` gives it back to the clock.',
    });
    expect(made.current().saved).toBe(true);
    // The post itself says so, also once the line has scrolled away.
    await made.service.flush();
    expect(made.gateway.posts.get(made.postId)?.message.embeds?.[0]?.description).toContain(
      'Kept open by a moderator: this post is not archived by itself.',
    );
    expect(made.said()).toEqual([
      `<@${ALICE}> keeps this post open: it will not be archived by itself.`,
    ]);

    await made.tickAt(END + 6 * MINUTE);
    await made.tickAt(END + 60 * MINUTE);
    expect(made.current()).toMatchObject({ saved: true, deletionTime: null });
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
    expect(made.said()).toHaveLength(1);
  });

  it('takes the warning away from a post that is kept after it was warned', async () => {
    const made = await setup();
    await made.tickAt(END + 6 * MINUTE);
    expect(made.current().prompts.warning).not.toBeNull();
    expect(made.said().some((text) => text.includes('I will archive this post'))).toBe(true);

    await made.run();
    await made.tickAt(END + 7 * MINUTE);
    expect(made.current()).toMatchObject({ saved: true, deletionTime: null });
    expect(made.current().prompts.warning).toBeNull();
    expect(made.said().some((text) => text.includes('I will archive this post'))).toBe(false);
    await made.tickAt(END + 60 * MINUTE);
    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
  });

  it('gives the post back to the clock with keep:False', async () => {
    const made = await setup();
    await made.run();
    const used = await made.run({ keep: false });
    expect(sent(used.editReply).content).toBe(
      'This post is no longer kept: it is archived as usual once the raid is over.',
    );
    expect(made.current().saved).toBe(false);
    expect(made.said().at(-1)).toBe(
      `<@${ALICE}> no longer keeps this post open: it will be archived as usual.`,
    );
    await made.tickAt(END + 6 * MINUTE);
    expect(made.current().deletionTime).not.toBeNull();
    await made.tickAt(END + 20 * MINUTE);
    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, locked: true });
  });

  it('says so, and nothing in the post, when nothing changes', async () => {
    const made = await setup();
    expect(sent((await made.run({ keep: false })).editReply).content).toBe(
      'This post was not kept.',
    );
    await made.run();
    expect(sent((await made.run({ keep: true })).editReply).content).toBe(
      'This post was kept already.',
    );
    expect(made.said()).toHaveLength(1);
  });

  it('is for staff, in the post of a raid that is going on', async () => {
    const made = await setup();
    const member = await made.run({}, { roleNames: ['Valor'] });
    expect(sent(member.reply).content).toBe(
      'Only admins, moderators and bot developers can do that.',
    );
    expect(made.current().saved).toBe(false);
    // Bot developers may, as for the rest of `/admin` (they may not `/delete`).
    await made.run({}, { roleNames: ['Bot Developer'] });
    expect(made.current().saved).toBe(true);
    await made.run({ keep: false });
    const elsewhere = await made.run({}, { channelId: WEST_CHANNEL, thread: undefined });
    expect(sent(elsewhere.reply).content).toBe(
      'Use this in the post of a raid that is still active.',
    );
    expect(made.current().saved).toBe(false);
  });

  it('keeps the post although the line cannot be said', async () => {
    const made = await setup();
    made.gateway.failing.set('sendMessage', new Error('Discord is away'));
    const used = await made.run();
    expect(sent(used.editReply).content).toMatch(/^This post is kept/);
    expect(made.current().saved).toBe(true);
  });
});
```

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts`
Expected: FAIL (`save-party.ts` and `PartyService.keep` do not exist).

- [ ] **Step 2: The implementation**

Apply to `src/commands/admin/index.ts`:

```diff
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -1,13 +1,14 @@
 import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { requireBotManagement } from '../../discord/guards.js';
+import { saveParty } from './save-party.js';
 import { setupForums } from './setup-forums.js';
 
 /**
  * The subcommands of `/admin`. Each lives in a file of its own in this folder; a later plan
  * adds one by appending it here (and its group, if it has one, to `groups` below).
  */
-const parts: readonly SubcommandPart[] = [setupForums];
+const parts: readonly SubcommandPart[] = [setupForums, saveParty];
 
 /** `/admin`: for staff. Discord offers it only to members who may manage the server. */
 export const admin = commandGroup({
```

Create `src/commands/admin/save-party.ts`:

```ts
import { SlashCommandSubcommandBuilder } from 'discord.js';
import type { SubcommandPart } from '../../discord/command-group.js';
import { UserError } from '../../discord/errors.js';
import { partyOf, requireParty } from '../../discord/guards.js';
import { PARTY_OVER } from '../parties/reply.js';

/**
 * `/admin save-party` (spec 5.2): the post it is used in is kept from the clock, which then
 * neither warns nor archives it, until staff let it go again or close it with `/delete`.
 */
export const saveParty: SubcommandPart = {
  data: new SlashCommandSubcommandBuilder()
    .setName('save-party')
    .setDescription('Keep this raid post from being archived by itself, or let it go again')
    .addBooleanOption((option) =>
      option.setName('keep').setDescription('False lets the post be archived as usual again'),
    ),
  help: {
    details:
      'Use it in the post of a raid. A kept post stays open after the raid has ended: nothing ' +
      'warns that it will be archived and nothing archives it, until you run this with ' +
      '`keep:False` or close the raid with `/delete`. The post says who kept it.',
    examples: ['/admin save-party', '/admin save-party keep:False'],
  },
  guards: [requireParty],
  defer: 'ephemeral',
  async execute(interaction, ctx) {
    const party = partyOf(interaction, ctx);
    if (!party) throw new UserError(PARTY_OVER);
    const keep = interaction.options.getBoolean('keep') ?? true;
    const outcome = await ctx.partyService.keep(party.id, keep, interaction.user.id);
    if (outcome === 'gone') throw new UserError(PARTY_OVER);
    const answers = {
      kept:
        'This post is kept: I will not archive it by myself. `/delete` closes it, and ' +
        '`/admin save-party keep:False` gives it back to the clock.',
      'let-go': 'This post is no longer kept: it is archived as usual once the raid is over.',
      unchanged: keep ? 'This post was kept already.' : 'This post was not kept.',
    };
    await interaction.editReply({ content: answers[outcome] });
  },
};
```

Apply to `src/render/raid-post.ts`:

```diff
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -438,6 +438,7 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
     headline,
     describeTimes(view, stage),
     ...(party.anonymous ? [] : [`Reported by <@${party.createdById}>.`]),
+    ...(party.saved ? ['Kept open by a moderator: this post is not archived by itself.'] : []),
   ].join('\n');
 
   const fields: ShrinkableField[] = [];
```

Apply to `src/services/party-service.ts`:

```diff
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -11,7 +11,13 @@ import {
 } from '../discord/party-gateway.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
 import type { RaidBossRef, RaidParty } from '../domain/party/party.js';
-import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
+import {
+  certainMoves,
+  createRaid,
+  setEndTime,
+  setHatchTime,
+  setSaved,
+} from '../domain/party/raid.js';
 import type { PartyStatus } from '../domain/party/status.js';
 import { endParty } from '../domain/party/tick.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
@@ -615,6 +621,39 @@ export class PartyService {
     return true;
   }
 
+  /**
+   * `/admin save-party`: keeps a party from the clock, which then neither warns nor archives
+   * it, or lets it go again; the post says who did it. A warning that was said already is taken
+   * away by the clock's next tick. `unchanged` when the party was kept (or not kept) already.
+   */
+  async keep(
+    partyId: string,
+    saved: boolean,
+    memberId: string,
+  ): Promise<'gone' | 'kept' | 'let-go' | 'unchanged'> {
+    const { store, gateway, log } = this.options;
+    const result = await store.update(partyId, (party) =>
+      party.saved === saved ? {} : { party: setSaved(party, saved) },
+    );
+    if (!result) return 'gone';
+    if (!result.written) return 'unchanged';
+    this.changed(partyId);
+    const postId = result.party?.forumPostId ?? null;
+    // A message into the post of a party that has ended would open an archived post again.
+    if (postId !== null && store.get(partyId)) {
+      try {
+        await gateway.sendMessage(postId, {
+          content: saved
+            ? `<@${memberId}> keeps this post open: it will not be archived by itself.`
+            : `<@${memberId}> no longer keeps this post open: it will be archived as usual.`,
+        });
+      } catch (err) {
+        log.warn({ err, party: partyId }, 'could not say that a party is kept');
+      }
+    }
+    return saved ? 'kept' : 'let-go';
+  }
+
   /**
    * `/delete` from a member who is not staff: their reason is put into the post for the
    * moderators. A member asks once per party (`already` after that; kept in memory, so a
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/admin/save-party.test.ts`
Expected: PASS (`src/services/party-service.ts`, `src/render/raid-post.ts` and `src/commands/admin/save-party.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/admin/index.ts src/commands/admin/save-party.test.ts src/commands/admin/save-party.ts src/render/raid-post.ts src/services/party-service.ts
npm run check
git add src/commands/admin/index.ts src/commands/admin/save-party.test.ts src/commands/admin/save-party.ts src/render/raid-post.ts src/services/party-service.ts
git commit -m "Admin save-party keeps a raid post from the clock, or lets it go again" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,870 unit tests.

---

### Task 7: The groups a raid has as autocomplete; a help overview that loses no command

**Files:**
- Modify: `src/commands/parties/attendance.test.ts`, `src/commands/parties/attendance.ts`, `src/commands/parties/group.ts`, `src/commands/parties/reply.ts`, `src/commands/util/help-render.test.ts`, `src/commands/util/help-render.ts`

**Interfaces:**
- Consumes: `withCountAndGroup`, `countAndGroup` (`attendance.ts`), `/group join`; `partyOf`, `headCount`, `isGroupId`, `truncate`, `fitItems`; `renderHelpOverview`.
- Produces: `typedGroup(text): GroupId` and `respondWithGroups(interaction, ctx)` in `src/commands/parties/reply.ts`; the `group` and `letter` options autocomplete; `renderHelpOverview` lists a category by names only when its descriptions do not fit one field.

A behaviour change: text in a `group` option that is no group was silently ignored and is now refused. Clients that still have the old choices cached send `A` to `E`, which read as before.

- [ ] **Step 1: Write the failing tests**

Apply to `src/commands/parties/attendance.test.ts`:

```diff
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -1,6 +1,6 @@
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
+import { fakeAutocomplete, fakeChatInput, sent } from '../../../test/support/fake-interactions.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { ALICE, BOB, CAROL } from '../../../test/support/parties.js';
 import { reportedRaid } from '../../../test/support/party-service.js';
@@ -50,7 +50,7 @@ async function setup(report: Partial<RaidReport> = {}) {
     extra?: object,
   ) => sent((await run(commandName, options, extra)).reply).content;
   const alice = () => attendeeOf(made.current(), ALICE);
-  return { ...made, ctx, run, answer, alice };
+  return { ...made, ctx, router, run, answer, alice };
 }
 
 describe('the attendance commands', () => {
@@ -93,6 +93,64 @@ describe('the attendance commands', () => {
     );
   });
 
+  it('reads a group as it is typed, and refuses what is no group instead of ignoring it', async () => {
+    const made = await setup();
+    await made.run('group', {}, { subcommand: 'new', userId: BOB });
+    expect(await made.answer('join', { group: ' b ' })).toBe('You are coming, in group B.');
+    expect(await made.answer('here', { group: 'Group A' })).toBe('You are here, in group A.');
+    // What the list shows can be sent as it is, by a member who types it or presses Enter early.
+    expect(await made.answer('here', { group: 'Group B: park side (4)' })).toBe(
+      'You are here, in group B.',
+    );
+    expect(await made.answer('join', { group: 'the park' })).toBe('This raid has no such group.');
+    expect(await made.answer('join', { group: 'Group' })).toBe('This raid has no such group.');
+    expect(await made.answer('group', { letter: 'b' }, { subcommand: 'join' })).toBe(
+      'You are here, in group B.',
+    );
+    expect(await made.answer('group', { letter: 'F' }, { subcommand: 'join' })).toBe(
+      'This raid has no such group.',
+    );
+    expect(made.alice()).toMatchObject({ group: 'B', status: PartyStatus.Present });
+  });
+
+  it('offers the groups the raid has, with name and head count', async () => {
+    const made = await setup();
+    await made.run('group', {}, { subcommand: 'new', userId: BOB });
+    await made.run('group', { text: 'park side' }, { subcommand: 'label', userId: BOB });
+    const offered = async (focused: string, extra: object = {}) => {
+      const interaction = fakeAutocomplete({
+        commandName: 'join',
+        channelId: made.postId,
+        thread: { parentId: WEST_FORUM },
+        focused,
+        focusedName: 'group',
+        ...extra,
+      });
+      await made.router.handle(interaction as never);
+      return interaction.respond.mock.calls[0]?.[0];
+    };
+    expect(await offered('')).toEqual([
+      { name: 'Group A (1)', value: 'A' },
+      { name: 'Group B: park side (1)', value: 'B' },
+    ]);
+    expect(await offered('b')).toEqual([{ name: 'Group B: park side (1)', value: 'B' }]);
+    expect(await offered('group a')).toEqual([{ name: 'Group A (1)', value: 'A' }]);
+    expect(await offered('PARK')).toEqual([{ name: 'Group B: park side (1)', value: 'B' }]);
+    expect(await offered('z')).toEqual([]);
+    // A long name gives way to the head count.
+    await made.run('group', { text: 'x'.repeat(100) }, { subcommand: 'label', userId: BOB });
+    const [, long] = (await offered('')) ?? [];
+    expect(long?.name).toMatch(/^Group B: x+… \(1\)$/);
+    expect(long?.name.length).toBeLessThanOrEqual(100);
+    await made.run('group', { text: 'park side' }, { subcommand: 'label', userId: BOB });
+    expect(
+      await offered('', { commandName: 'group', subcommand: 'join', focusedName: 'letter' }),
+    ).toHaveLength(2);
+    expect(await offered('', { commandName: 'remote' })).toHaveLength(2);
+    // Anywhere else there is no raid to have groups.
+    expect(await offered('', { channelId: WEST_CHANNEL, thread: undefined })).toEqual([]);
+  });
+
   it('/remote and /local keep the status of an attendee and sign up anybody else as interested', async () => {
     const made = await setup();
     expect(await made.answer('remote')).toBe('You are interested, remotely.');
```

Apply to `src/commands/util/help-render.test.ts`:

```diff
--- a/src/commands/util/help-render.test.ts
+++ b/src/commands/util/help-render.test.ts
@@ -2,7 +2,10 @@ import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { commandGroup } from '../../discord/command-group.js';
 import type { CommandModule, SimpleCommand } from '../../discord/command.js';
+import { loadSettings } from '../../config/settings.js';
+import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
 import type { HelpCategory } from '../categories.js';
+import { commands } from '../index.js';
 import {
   fitLines,
   isStaffCommand,
@@ -93,17 +96,36 @@ describe('renderHelpOverview', () => {
     expect(fields).toHaveLength(3);
   });
 
-  it('ends a long category at a whole line', () => {
+  it('lists the names only of a category whose descriptions do not fit, and loses no command', () => {
+    const many = Array.from({ length: 30 }, (_, i) => cmd(`command-number-${i}`, 'util'));
+    const fields = renderHelpOverview([...many, cmd('join', 'basic-raid')], groups, false).toJSON()
+      .fields;
+    const util = fields?.find((field) => field.name === 'Utility');
+    expect(util?.value.length).toBeLessThanOrEqual(1024);
+    expect(util?.value.split(' ').sort()).toEqual(many.map((c) => `\`/${c.data.name}\``).sort());
+    // The other categories keep their descriptions.
+    expect(fields?.find((field) => field.name === 'Raid Basics')?.value).toBe('`/join` About join');
+  });
+
+  it('says how many it left out when not even the names of a category fit, never cutting a name', () => {
     const many = Array.from({ length: 80 }, (_, i) => cmd(`command-number-${i}`, 'util'));
     const field = renderHelpOverview(many, ['util'], false).toJSON().fields?.[0];
     expect(field?.value.length).toBeLessThanOrEqual(1024);
-    expect(field?.value).toMatch(/\n…and \d+ more$/);
-    expect(
-      field?.value
-        .split('\n')
-        .slice(0, -1)
-        .every((line) => line.includes(' About ')),
-    ).toBe(true);
+    expect(field?.value).toMatch(/ …and \d+ more$/);
+    const names = field?.value.replace(/ …and \d+ more$/, '').split(' ') ?? [];
+    expect(names.every((name) => /^`\/command-number-\d+`$/.test(name))).toBe(true);
+  });
+
+  it('shows every command of this bot that a member may use', () => {
+    const { helpGroups } = loadSettings(TEST_SETTINGS_PATH);
+    const text = JSON.stringify(renderHelpOverview(commands, helpGroups, true).toJSON());
+    for (const command of commands) expect(text).toContain(`\`/${command.data.name}\``);
+    const forMembers = JSON.stringify(renderHelpOverview(commands, helpGroups, false).toJSON());
+    for (const command of commands) {
+      expect(forMembers.includes(`\`/${command.data.name}\``)).toBe(
+        helpGroups.includes(command.help.category),
+      );
+    }
   });
 
   it('falls back to names only when descriptions would exceed what one embed holds', () => {
```

Run: `npx vitest run --project unit src/commands/parties/attendance.test.ts src/commands/util/help-render.test.ts`
Expected: FAIL (`typedGroup` and `respondWithGroups` do not exist; the help test of a long category fails).

- [ ] **Step 2: The implementation**

Apply to `src/commands/parties/attendance.ts`:

```diff
--- a/src/commands/parties/attendance.ts
+++ b/src/commands/parties/attendance.ts
@@ -3,7 +3,6 @@ import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { requireParty } from '../../discord/guards.js';
 import type { AttendanceOptions } from '../../domain/party/attendance.js';
-import { GROUP_IDS, isGroupId } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import {
   ACTION_THROTTLE,
@@ -12,6 +11,8 @@ import {
   commandParty,
   doneWords,
   remoteWords,
+  respondWithGroups,
+  typedGroup,
 } from './reply.js';
 
 /** The commands of this file do what the buttons of a post do; these add a head count and a group. */
@@ -28,7 +29,7 @@ function withCountAndGroup(name: string, description: string): SlashCommandBuild
       option
         .setName('group')
         .setDescription('The group to be in, when the raid has several')
-        .addChoices(GROUP_IDS.map((id) => ({ name: `Group ${id}`, value: id }))),
+        .setAutocomplete(true),
     );
   return builder;
 }
@@ -41,7 +42,7 @@ function countAndGroup(
   const group = interaction.options.getString('group');
   return {
     ...(number === null ? {} : { number }),
-    ...(group !== null && isGroupId(group) ? { group } : {}),
+    ...(group === null ? {} : { group: typedGroup(group) }),
   };
 }
 
@@ -72,6 +73,7 @@ function signUpCommand(
       );
       await answerOutcome(interaction, ctx, outcome);
     },
+    autocomplete: respondWithGroups,
   };
 }
 
@@ -97,6 +99,7 @@ function remoteCommand(name: string, description: string, remote: boolean): Simp
       );
       await answerOutcome(interaction, ctx, outcome, remoteWords);
     },
+    autocomplete: respondWithGroups,
   };
 }
 
```

Apply to `src/commands/parties/group.ts`:

```diff
--- a/src/commands/parties/group.ts
+++ b/src/commands/parties/group.ts
@@ -1,22 +1,24 @@
 import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from 'discord.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
-import { UserError } from '../../discord/errors.js';
 import { requireParty } from '../../discord/guards.js';
 import { MAX_GROUP_LABEL } from '../../domain/party/attendance.js';
-import { GROUP_IDS, groupOf, isGroupId } from '../../domain/party/party.js';
+import { groupOf } from '../../domain/party/party.js';
 import { groupWords } from '../../render/party-controls.js';
-import { ACTION_THROTTLE, actingMember, answerOutcome, commandParty } from './reply.js';
+import {
+  ACTION_THROTTLE,
+  actingMember,
+  answerOutcome,
+  commandParty,
+  respondWithGroups,
+  typedGroup,
+} from './reply.js';
 
 const joinGroup: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('join')
     .setDescription('Move to another group of this raid')
     .addStringOption((option) =>
-      option
-        .setName('letter')
-        .setDescription('The group')
-        .setRequired(true)
-        .addChoices(GROUP_IDS.map((id) => ({ name: `Group ${id}`, value: id }))),
+      option.setName('letter').setDescription('The group').setRequired(true).setAutocomplete(true),
     ),
   help: {
     details:
@@ -27,11 +29,11 @@ const joinGroup: SubcommandPart = {
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandParty(interaction, ctx);
-    const letter = interaction.options.getString('letter', true);
-    if (!isGroupId(letter)) throw new UserError('This raid has no such group.');
+    const letter = typedGroup(interaction.options.getString('letter', true));
     const outcome = await ctx.attendance.joinGroup(party.id, actingMember(interaction), letter);
     await answerOutcome(interaction, ctx, outcome);
   },
+  autocomplete: respondWithGroups,
 };
 
 const newGroup: SubcommandPart = {
```

Apply to `src/commands/parties/reply.ts`:

```diff
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -1,5 +1,6 @@
 import {
   MessageFlags,
+  type AutocompleteInteraction,
   type ChatInputCommandInteraction,
   type MessageComponentInteraction,
 } from 'discord.js';
@@ -8,8 +9,15 @@ import { UserError } from '../../discord/errors.js';
 import { partyOf } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
-import type { Attendee, Party } from '../../domain/party/party.js';
+import {
+  headCount,
+  isGroupId,
+  type Attendee,
+  type GroupId,
+  type Party,
+} from '../../domain/party/party.js';
 import { problemText, standingReply } from '../../render/activity.js';
+import { truncate } from '../../render/text.js';
 import type { AttendanceOutcome, Member } from '../../services/attendance-service.js';
 
 export const PARTY_OVER = 'This raid is over.';
@@ -37,6 +45,54 @@ export function commandParty(interaction: ChatInputCommandInteraction, ctx: AppC
   return party;
 }
 
+const NO_SUCH_GROUP = 'This raid has no such group.';
+
+/**
+ * The group a member picked from the list or typed: its letter. `B`, `b`, `group b`, and what
+ * the list shows (`Group B: park side (4)`) all mean B. Whether the raid has that group is for
+ * the service to say.
+ */
+export function typedGroup(text: string): GroupId {
+  const letter = /^(?:GROUP\s*)?([A-Z])(?:\s*[:(].*)?$/.exec(text.trim().toUpperCase())?.[1] ?? '';
+  if (!isGroupId(letter)) throw new UserError(NO_SUCH_GROUP);
+  return letter;
+}
+
+/**
+ * Answers the autocomplete of a group option with the groups the raid of this post has, each
+ * with its name and head count (`Group B: park side (4)`); with none anywhere else.
+ */
+export async function respondWithGroups(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+): Promise<void> {
+  const party = partyOf(interaction, ctx);
+  if (!party) {
+    await interaction.respond([]);
+    return;
+  }
+  const typed = interaction.options
+    .getFocused()
+    .trim()
+    .toLowerCase()
+    .replace(/^group\s*/, '');
+  const all = party.groups.map((group) => ({
+    // The label gives way, never the head count: a choice has at most 100 characters.
+    name: `Group ${group.id}${group.label ? `: ${truncate(group.label, 70)}` : ''} (${headCount(party, group.id)})`,
+    label: (group.label ?? '').toLowerCase(),
+    value: group.id,
+  }));
+  // A letter means that group; anything else is looked for in the names of the groups.
+  const byLetter = all.filter((choice) => choice.value.toLowerCase() === typed);
+  const found =
+    typed === ''
+      ? all
+      : byLetter.length > 0
+        ? byLetter
+        : all.filter((choice) => choice.label.includes(typed));
+  await interaction.respond(found.map(({ name, value }) => ({ name, value })));
+}
+
 export type Ok<Extra> = Extract<AttendanceOutcome<Extra>, { kind: 'ok' }>;
 
 /**
```

Apply to `src/commands/util/help-render.ts`:

```diff
--- a/src/commands/util/help-render.ts
+++ b/src/commands/util/help-render.ts
@@ -4,6 +4,7 @@ import {
   type APIApplicationCommandOption,
 } from 'discord.js';
 import { subcommandPath, type CommandHelp, type CommandModule } from '../../discord/command.js';
+import { fitItems } from '../../render/text.js';
 import { CATEGORY_LABELS, type HelpCategory } from '../categories.js';
 
 /** Discord's limits for one embed. */
@@ -57,15 +58,20 @@ export function renderHelpOverview(
     ...(includeStaff ? categories.filter((c) => !helpGroups.includes(c)).sort() : []),
   ];
 
-  const fieldsWith = (line: (command: CommandModule) => string, separator: string) =>
+  const described = (c: CommandModule) => `\`/${c.data.name}\` ${c.data.toJSON().description}`;
+  const named = (c: CommandModule) => `\`/${c.data.name}\``;
+  // A category whose lines with descriptions do not fit one field lists its names only, so
+  // that no command is missing from the overview; names are never cut.
+  const fieldsWith = (descriptions: boolean) =>
     order.slice(0, MAX_FIELDS).map((category) => {
-      const lines = (byCategory.get(category) ?? []).sort(byName).map(line);
+      const listed = (byCategory.get(category) ?? []).sort(byName);
+      const lines = listed.map(described).join('\n');
       return {
         name: CATEGORY_LABELS[category],
         value:
-          separator === '\n'
-            ? fitLines(lines, FIELD_LIMIT)
-            : truncate(lines.join(separator), FIELD_LIMIT),
+          descriptions && lines.length <= FIELD_LIMIT
+            ? lines
+            : fitItems(listed.map(named), FIELD_LIMIT, ' '),
       };
     });
   const size = (fields: ReadonlyArray<{ name: string; value: string }>) =>
@@ -74,8 +80,8 @@ export function renderHelpOverview(
     fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
 
   // One line per command with its description; names only when that is too long for one embed.
-  let fields = fieldsWith((c) => `\`/${c.data.name}\` ${c.data.toJSON().description}`, '\n');
-  if (size(fields) > EMBED_LIMIT) fields = fieldsWith((c) => `\`/${c.data.name}\``, ' ');
+  let fields = fieldsWith(true);
+  if (size(fields) > EMBED_LIMIT) fields = fieldsWith(false);
   while (size(fields) > EMBED_LIMIT) fields.pop();
 
   return new EmbedBuilder()
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project unit src/commands/parties/attendance.test.ts src/commands/util/help-render.test.ts`
Expected: PASS (`src/commands/parties/reply.ts`, `attendance.ts`, `group.ts` and `src/commands/util/help-render.ts`).

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/group.ts src/commands/parties/reply.ts src/commands/util/help-render.test.ts src/commands/util/help-render.ts
npm run check
git add src/commands/parties/attendance.test.ts src/commands/parties/attendance.ts src/commands/parties/group.ts src/commands/parties/reply.ts src/commands/util/help-render.test.ts src/commands/util/help-render.ts
git commit -m "The group options offer the groups a raid has; the help overview loses no command" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,874 unit tests.

---

### Task 8: The copies of a raid over a restart, in MySQL

**Files:**
- Modify: `src/services/party-lifecycle.db.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 2; `party-lifecycle.db.test.ts` of plan 2D-2.
- Produces: The lifecycle test also carries a remote copy and a `/status` copy through the `Party` table and a restart.

This task changes one database test. Run it with `npx vitest run --project db src/services/party-lifecycle.db.test.ts` (Docker must be running); `npm run check` does not run it.

- [ ] **Step 1: Write the failing tests**

Apply to `src/services/party-lifecycle.db.test.ts`:

```diff
--- a/src/services/party-lifecycle.db.test.ts
+++ b/src/services/party-lifecycle.db.test.ts
@@ -2,7 +2,12 @@ import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../test/support/migrated-db.js';
 import { ALICE, at, BOB, MINUTE, REPORTER } from '../../test/support/parties.js';
-import { partyServiceWith, restarted } from '../../test/support/party-service.js';
+import { REMOTE_CHANNEL } from '../../test/support/gyms.js';
+import {
+  gatewayWithMirrorChannels,
+  partyServiceWith,
+  restarted,
+} from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { PartyRepository } from '../db/repositories/party-repository.js';
 import type { DB } from '../db/types.js';
@@ -41,7 +46,11 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
 
   it('hatches, asks, catches up after the restart, warns and archives', async () => {
     const repository = new PartyRepository(db);
-    const first = await partyServiceWith([], {}, { database: repository });
+    const first = await partyServiceWith(
+      [],
+      {},
+      { database: repository, gateway: gatewayWithMirrorChannels() },
+    );
     const gym = gymsFixture().get(1);
     if (!gym) throw new Error('no gym');
     const outcome = await first.service.reportRaid({
@@ -73,6 +82,14 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     await first.service.flush();
     const question = first.store.get(id)?.prompts.completion[0];
     expect(question?.members).toEqual([BOB]);
+    // The raid has a copy in the remote channel, and `/status` puts one into the post.
+    expect(await first.service.showStatus(id)).toBe(true);
+    const copies = first.store.get(id)?.mirrorMessages ?? [];
+    expect(copies.map((copy) => [copy.kind, copy.channelId])).toEqual([
+      ['remote', REMOTE_CHANNEL],
+      ['status', postId],
+    ]);
+    expect(first.gateway.messagesIn(REMOTE_CHANNEL)).toHaveLength(1);
 
     // The bot stops and starts again after the raid has ended.
     const second = await restarted(first);
@@ -107,12 +124,19 @@ describe('a raid from report to archive, in MySQL, over a restart', () => {
     expect(caughtUp?.prompts.warning).not.toBeNull();
     expect(caughtUp?.deletionTime).toBe(END + 16 * MINUTE);
     expect(second.gateway.deleted.map((gone) => gone.messageId)).toContain(question?.id);
+    // A raid that is over has no copy in the remote channel; the one in its post stays for now.
+    expect(second.gateway.messagesIn(REMOTE_CHANNEL)).toEqual([]);
+    expect(caughtUp?.mirrorMessages.map((copy) => copy.kind)).toEqual(['status']);
 
     second.clock.now = END + 16 * MINUTE;
     await second.scheduler.tick();
     await second.scheduler.stop();
     expect(second.store.get(id)).toBeUndefined();
     expect(second.gateway.posts.get(postId)).toMatchObject({ archived: true, locked: true });
+    // Nothing with buttons is left in the post: the copy went before the archiving.
+    const deleted = second.gateway.deleted.map((gone) => gone.messageId);
+    for (const copy of copies) expect(deleted).toContain(copy.messageId);
+    expect(second.gateway.posts.get(postId)?.reopened).toBe(0);
     const row = await repository.findById(id);
     expect(row).toMatchObject({ ok: true, party: { status: 'ended', forumPostId: postId } });
 
```

- [ ] **Step 2: The implementation**

- [ ] **Step 3: Run the tests**

Run: `npx vitest run --project db src/services/party-lifecycle.db.test.ts` (Docker; allow ten minutes)
Expected: PASS.

- [ ] **Step 4: Format, check, commit**

```bash
npx prettier --write src/services/party-lifecycle.db.test.ts
npm run check
git add src/services/party-lifecycle.db.test.ts
git commit -m "The copies of a raid over a restart, in MySQL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `npm run check` green with 1,874 unit tests.

---

## After the last task

The controller, not an implementer, does these:

1. `npm run test:db` once, complete (the mirrors column with the kind `status` against real MySQL, the lifecycle test).
2. Whole-branch review (Opus, high effort) of the eight commits; one fix wave if it finds something.
3. `CLAUDE.md`: the status line, and conventions for `PartyMirrors` (the record as the to-do list, the two queues, `idle` before the end), `PartyGateway.editMessage` / `findChannel`, `PartyService.showStatus` / `end(..., closing)` / `requestDeletion` / `keep`, `AttendanceService.shout`, `defer` as a function, `isStaff`, `typedGroup` / `respondWithGroups`, the test support (`gatewayWithMirrorChannels`, `REMOTE_CHANNEL`, `EX_CHANNEL`, `guildRoleNames`).
4. `docs/superpowers/plans/phase-0-follow-ups.md`: delete what this plan did from the "Plan 2E" lists; add a "From Phase 2E-1" section. The spec (sections 4.2 and 5.2 "as built"), the Gantt chart and memory.

## Staging checklist (with Matt, on the test application and server)

Nothing of plans 2D-1, 2D-2 and 2E-1 has touched Discord. Each step needs Matt's go-ahead. Do the checklists at the end of the 2D-1 and 2D-2 plans first. The test server needs two more text channels, named as in the settings (`remote-raids` and the EX channel), and a gym with the EX tag in the local database; roles named `admin` and `moderator`, and a second account without them.

- [ ] `npm run deploy-commands -- --guild <test server id>` registers `/status`, `/where`, `/shout`, `/delete`, and `/admin save-party`; the `group` options of `/join` and the others now autocomplete.
- [ ] Report a raid: its copy appears in `remote-raids` with a line that links to the post, the embed and the buttons. Join on the copy: the private answer comes, the post and the copy both show the member, and the post gets the line.
- [ ] Report a raid at the EX gym: a copy in the EX channel too. `/boss` to an elite boss: the copy leaves `remote-raids`.
- [ ] Take "Send Messages" from the bot in `remote-raids`: no copy is tried (the channel is not found). Take only "Embed Links": the same. Give them back: the next change of a raid makes the copy.
- [ ] Delete a copy by hand: the next change makes a new one. Delete the link line in the region channel by hand, then name the boss: nothing breaks.
- [ ] Name the boss of an egg: the link line in the region channel shows the new title (and "(edited)").
- [ ] Let a raid end by the clock: its copies leave the two channels at once; the post is archived later.
- [ ] `/status` in a post: the raid appears at the bottom with buttons that work; a second `/status` replaces it; a change of the raid shows in it. `/status` in the region channel and in the forum: a private list.
- [ ] `/where`: a private answer with the link and the map picture.
- [ ] `/shout` with a second account signed up: it is pinged; with its shouts switched off (when `/settings` exists; until then set `User.shouts = 0` in the database) it is neither pinged nor named.
- [ ] `/delete` from the second account: a form; the reason appears in the post and pings the two roles (are roles that are not "mentionable" pinged? the bot needs "Mention @everyone, @here and All Roles" for that); a second request by the same account is refused, one by a third account does not ping.
- [ ] `/delete` from an admin: the private answer arrives, the post says who closed it, loses its buttons, is archived and locked, the copies and the link line are gone, and the gym takes a new report. Note down: does the private answer stay visible in the locked post; does the post stay archived afterwards (nothing may reopen it).
- [ ] `/admin save-party` on a raid that is over and warned: the warning disappears within a tick, the post says it is kept and stays open past the archive time. `keep:False`: a new warning and the archiving.
- [ ] A Raid Hour's worth of edits: ten raids, changed often for a few minutes. Watch the log for rate limits in `remote-raids` and in the posts (a post edit plus its `/status` copy every two seconds); note what Discord's limit per channel really is.
- [ ] What the fakes cannot show, to note down: `messages.edit` on a message in a post that Discord auto-archived; whether an ephemeral answer or a follow-up in an archived, locked thread fails or reopens it (a `/shout` that lost the race against the end answers "This raid is over." there); a click on a copy by a member who cannot see the region's forum.

## As built (2026-10-11)

Commits `fbf9bbb`, `e1c72e4`, `9a3f91f`, `70dd141`, `5f1e4c2`, `6708abe`, `c5236f5`, `7915203` (Tasks 1 to 8, each equal to the prototype commit it was generated from), then `0d95288` after the whole-branch review (no Critical finding; one Important: a test that could not fail): the requests to delete a raid are sent one after the other, so a first request that fails leaves the role ping and the member's right to ask to the next; a post that is gone takes its link line with it; a channel that refuses the bot no longer keeps a copy from being deleted, and a `status` copy under another post is dropped; the close of a raid waits at most three seconds for the private answer before it. 1,888 unit tests, 126 database tests. Open items: "From Phase 2E-1" in `phase-0-follow-ups.md`.
