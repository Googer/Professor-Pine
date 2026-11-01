# Phase 8E: An Elite Raid Blocks Its Gym: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one raid per gym of any kind, per server (Matt, 2026-10-26: an elite raid shows its egg on the gym, usually the evening before, so it blocks a standard raid there and the reverse), decided by one domain function that every report, `/location` and every raid change asks.

- **Task 1:** `raidStandingAt` and `standsAtGym` in `src/domain/party/raid.ts`; `PartyStore.raidAt(guildId, gymId, now)` without a kind; `RaidChangeService.inTheWay` and `/location` through them; 8X-J's `running` by `blocksNewRaid`; the refusal "That gym already has a raid."
- **Task 2:** docs: `parties-and-posts.md`, `web.md`, `utilities.md`; the web stagings' step 0 (`npm run web:build` before the bot starts); `web-setup.md`'s note on Cloudflare's Web Analytics beacon; the 8E staging checklist; 8M-8A's open question answered.

**Tech stack:** TypeScript 6.0, Node 24, Vitest. No new dependency, no migration, no setting, no party state version, no command change (no deploy needed).

**Brief:** `.superpowers/sdd/2026-10-27-phase-8e-elite-blocks-gym/design.md` (git-ignored), with `fix-list.md` and `progress.md`. Matt's ruling is in the follow-ups ("From Phase 8M-8A", review N5, answered).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8e` (tip `ed0c7603`), one commit per task, on typescript-migration 070157eb. Each commit typechecks and passes its tests; on the tip the full check passes (10,127 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The prototype:** an Opus review: ready after fixes (1 Important: 8X-J's `running` decided "over" by the end time alone, so a raid over by the clock could be moved to Elite and block its gym for a day; 6 Minor, among them the server: a raid of another server took the gym, fixed here as `maxAt` does); fix round 1 folded in.
- **The fix round:** a scoped Opus re-review: ready.

**Conventions:** read `CLAUDE.md` and `docs/architecture/parties-and-posts.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- Every path that asks whether a gym has a raid goes through `raidStandingAt` (new reports, screenshots, the map's report, relocation, `/location`, changes of gym, tier, end and boss, 8X-J's tier moves); none compares kinds.
- Two raids stored at one gym before 8E: the older one answers, either may still be changed at its own gym.
- A report of the other kind joins the raid there and changes nothing of it.
- A raid of another server never takes the gym; the gym lock stays one per gym.
- A raid over by the clock is not brought back by a tier move.

---

## Tasks

### Task 1: 8E: an elite raid blocks its gym, one raid per gym of any kind

Prototype commit: `e6b36f21b432a477d7e8438c40a977be322bb835`

Matt, 2026-10-26: an elite raid shows its egg on the gym, usually the
evening before, so it blocks a standard raid there and the reverse.

- raidStandingAt and standsAtGym (src/domain/party/raid.ts): the one rule
  of "the gym has a raid already", of any kind and of the gym's server
  (as maxAt), the first in the order given (the store's, oldest first)
  of two stored before.
- PartyStore.raidAt(guildId, gymId, now) loses its kind and uses it, so
  every report (/raid, screenshots, the map, relocate) joins the raid
  there; a raid of another server no longer takes the gym.
- RaidChangeService.inTheWay uses it too: a raid that already stood at
  the gym may be changed whatever else is there, its tier standard to
  elite and back included.
- 8X-J's running (boss-move.ts): a raid runs while it blocks its gym
  (blocksNewRaid), not by its end time alone, so a raid over by the
  clock is not moved to Elite and brought back for a day.
- /location asks raidAt(party.guildId, gym.id, now); its help and the
  refusal say "a raid": "That gym already has a raid."

**Files:**

```
 src/commands/admin/boss-overrides.test.ts       | 36 ++++++++++++++++++++++++++----------
 src/commands/raids/location.test.ts             | 21 +++++++++++++--------
 src/commands/raids/location.ts                  | 10 +++++-----
 src/commands/raids/raid-changes.test.ts         |  2 +-
 src/commands/raids/report.ts                    |  5 +++--
 src/db/repositories/party-repository.db.test.ts |  4 ++--
 src/domain/party/boss-move.test.ts              | 21 +++++++++++++++++++++
 src/domain/party/boss-move.ts                   | 11 +++++++----
 src/domain/party/raid.test.ts                   | 39 +++++++++++++++++++++++++++++++++++++++
 src/domain/party/raid.ts                        | 36 ++++++++++++++++++++++++++++++++++++
 src/render/activity.ts                          |  2 +-
 src/services/boss-tier-moves.test.ts            | 34 +++++++++++++++++++++++++++++++---
 src/services/party-service.relocate.test.ts     |  8 ++++----
 src/services/party-service.test.ts              | 50 ++++++++++++++++++++++++++++++++++++++++++--------
 src/services/party-service.ts                   | 16 ++++++++++------
 src/services/party-store.test.ts                | 60 +++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/services/party-store.ts                     | 28 +++++++++++++---------------
 src/services/raid-change-service.test.ts        | 83 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------------
 src/services/raid-change-service.ts             | 33 ++++++++++++---------------------
 src/web/client/parties.ts                       |  5 +++--
 src/web/client/raid-forms.ts                    |  4 ++--
 src/web/raid-change.test.ts                     | 12 +++++++-----
 src/web/raid-report.test.ts                     | 27 +++++++++++++++++++++++++++
 23 files changed, 416 insertions(+), 131 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/boss-overrides.test.ts src/commands/raids/location.test.ts src/commands/raids/raid-changes.test.ts src/domain/party/boss-move.test.ts src/domain/party/raid.test.ts src/services/boss-tier-moves.test.ts src/services/party-service.relocate.test.ts src/services/party-service.test.ts src/services/party-store.test.ts src/services/raid-change-service.test.ts src/web/raid-change.test.ts src/web/raid-report.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/party-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e6b36f21b432a477d7e8438c40a977be322bb835 -- src test docs/architecture docs/web-setup.md docs/superpowers/plans/2026-10-25-phase-8m7-staging.md docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md docs/superpowers/plans/2026-10-27-phase-8e-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8E: an elite raid blocks its gym, one raid per gym of any kind`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/admin/boss-overrides.test.ts b/src/commands/admin/boss-overrides.test.ts
index d818dc5351257690d6a777ce785b487cea65ced8..ea29ab2a3d3b8834b47dfadda7a79a19dde5e0e2 100644
--- a/src/commands/admin/boss-overrides.test.ts
+++ b/src/commands/admin/boss-overrides.test.ts
@@ -7,7 +7,14 @@ import {
   MODERATOR,
   textsOf,
 } from '../../../test/support/boss-commands.js';
-import { testRaid } from '../../../test/support/parties.js';
+import {
+  asRaid,
+  at as partyAt,
+  PARTY_NOW,
+  testRaid,
+  testRaidRules,
+} from '../../../test/support/parties.js';
+import { setBoss } from '../../domain/party/raid.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { FEED_READ_AT, feedReply, readRaidBossFeed } from '../../../test/support/raid-bosses.js';
 import { admin } from './index.js';
@@ -177,25 +184,34 @@ describe('/admin boss add', () => {
     expect(textOf(used)).not.toContain('left out');
   });
 
-  // Review J1: a raid the move would put in the way of another at its gym stays, said apart.
-  it('counts a running raid that would stand in the way of another apart', async () => {
+  // Review J1, and E1 of plan 8E: a raid over by the clock (still active, not yet archived) is
+  // no running battle: the add neither moves it nor says anything of it. Since plan 8E (one raid
+  // per gym, of any kind) no running raid can be in the way of another at its own gym.
+  it('says nothing of a raid over by the clock, and moves the running one', async () => {
+    const T5 = { level: 'T5', shadow: false } as const;
+    const over = setBoss(
+      testRaid({ id: RAID(1), tier: T5 }),
+      { tier: T5, boss: { key: 'yveltal' } },
+      testRaidRules(),
+      PARTY_NOW,
+    ).party;
     const parties = await partyServiceWith([
-      testRaid({ id: RAID(1), tier: { level: 'T5', shadow: false }, boss: { key: 'yveltal' } }),
-      testRaid({ id: RAID(2), tier: { level: 'Elite', shadow: false }, boss: { key: 'zekrom' } }),
+      over,
       testRaid({
         id: RAID(3),
         gymId: 2,
-        tier: { level: 'T5', shadow: false },
+        tier: T5,
         boss: { key: 'yveltal' },
+        now: partyAt('2026-10-13T15:50'),
       }),
     ]);
+    // The egg at gym 1 could last until 15:45 as a T5 egg; as an elite egg until the next day.
+    parties.clock.now = partyAt('2026-10-13T15:55');
     const made = await bossCommandsWith({ context: { bossMoves: parties.bossMoves } });
     const used = await made.use('boss', 'add', { pokemon: 'Yveltal', tier: 'Elite' });
     expect(textOf(used)).toContain('1 battle running was moved.');
-    expect(textOf(used)).toContain(
-      '1 raid running was left at its tier: at the new one it would stand in the way of another ' +
-        'raid at its gym.',
-    );
+    expect(textOf(used)).not.toContain('left at its tier');
+    expect(asRaid(parties.store.get(RAID(1))).raid.tier).toEqual(T5);
   });
 
   it('points to the shiny override when the feed lists the boss already', async () => {
diff --git a/src/commands/raids/location.test.ts b/src/commands/raids/location.test.ts
index efa0266632cf9b7e1eb9e16a62f7bdd719eed286..a8afe121250eee736f8d56d5d533b2ca7c13cd49 100644
--- a/src/commands/raids/location.test.ts
+++ b/src/commands/raids/location.test.ts
@@ -103,7 +103,11 @@ async function setup(report: Partial<RaidReport> = {}) {
   return { ...made, ctx, handle, run, answer, submit, offered, lines };
 }
 
-async function raidAt(made: Awaited<ReturnType<typeof setup>>, gymId: number) {
+async function raidAt(
+  made: Awaited<ReturnType<typeof setup>>,
+  gymId: number,
+  tier: RaidReport['tier'] = { level: 'T5', shadow: false },
+) {
   const gym = gymsFixture().get(gymId);
   if (!gym) throw new Error('no gym');
   const other = await made.service.reportRaid({
@@ -111,7 +115,7 @@ async function raidAt(made: Awaited<ReturnType<typeof setup>>, gymId: number) {
     reporterId: BOB,
     anonymous: false,
     autoStatus: PartyStatus.Interested,
-    tier: { level: 'T5', shadow: false },
+    tier,
     boss: null,
   });
   if (other.kind !== 'created') throw new Error(other.kind);
@@ -131,14 +135,14 @@ describe('/location', () => {
     );
   });
 
-  it('refuses a gym that lies in no region, and a gym that has such a raid, with its post', async () => {
+  it('refuses a gym that lies in no region, and a gym that has a raid, with its post', async () => {
     const made = await setup();
     expect(await made.answer({ gym: 'g:10' })).toMatch(
       /^That gym is not in a region of this server that has a raid forum/,
     );
     const other = await raidAt(made, 2);
     expect(await made.answer({ gym: 'g:2' })).toBe(
-      `That gym already has a raid like this one. Its post is <#${other.forumPostId ?? ''}>.`,
+      `That gym already has a raid. Its post is <#${other.forumPostId ?? ''}>.`,
     );
     expect(made.current().gymId).toBe(1);
   });
@@ -217,24 +221,25 @@ describe('/location to a gym of another region', () => {
     expect(sent((await made.submit(asked)).editReply).content).toBe('This raid is over.');
   });
 
+  // Plan 8E: taken by a raid of any kind, here an elite raid for a standard one.
   it('refuses a move to a taken gym of another region without a dialog', async () => {
     const made = await setup();
-    const other = await raidAt(made, 7);
+    const other = await raidAt(made, 7, { level: 'Elite', shadow: false });
     const refused = await made.run({ gym: 'g:7' });
     expect(refused.showModal).not.toHaveBeenCalled();
     expect(sent(refused.reply)).toMatchObject({
-      content: `That gym already has a raid like this one. Its post is <#${other.forumPostId ?? ''}>.`,
+      content: `That gym already has a raid. Its post is <#${other.forumPostId ?? ''}>.`,
     });
   });
 
-  it('says why nothing moved when that gym got such a raid meanwhile, or the raid has ended', async () => {
+  it('says why nothing moved when that gym got a raid meanwhile, or the raid has ended', async () => {
     const made = await setup();
     const asked = await made.run({ gym: 'g:7' });
     const other = await raidAt(made, 7);
     const taken = await made.submit(asked);
     expect(sent(taken.editReply)).toEqual({
       content:
-        'Nothing was moved. That gym already has a raid like this one. ' +
+        'Nothing was moved. That gym already has a raid. ' +
         `Its post is <#${other.forumPostId ?? ''}>.`,
     });
     expect(made.current().gymId).toBe(1);
diff --git a/src/commands/raids/location.ts b/src/commands/raids/location.ts
index 138fd588771d448d5034f5e6d01152d0c7b4efa4..fabf7964510bae6391e8397829a45b1a57c23fb3 100644
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -5,7 +5,7 @@ import { channelInDialog, deferSubmit, dialog } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { raidOf, regionChannelOf, requireGuild, requireRaid } from '../../discord/guards.js';
 import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
-import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
+import { blocksNewRaid } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
 import { endSentence, plain, truncate } from '../../render/text.js';
 import { commandRaid, partyOver } from '../parties/reply.js';
@@ -49,7 +49,7 @@ export const location: SimpleCommand = {
   help: {
     category: 'raid-crud',
     details:
-      'The gym must not have such a raid already. For a gym of another region I ask first, in a ' +
+      'The gym must not have a raid already. For a gym of another region I ask first, in a ' +
       'dialog: the raid then gets a new post in the raid forum of that region, with everybody ' +
       `who is signed up, and this post is closed with a link to it. ${IN_A_RAID_POST}`,
     examples: ['/location gym:Big Fountain'],
@@ -86,11 +86,11 @@ export const location: SimpleCommand = {
       );
       return;
     }
-    // A gym that has such a raid is refused here already, not only after the question (the
-    // service decides again when the raid moves).
+    // A gym that has a raid, of any kind (plan 8E), is refused here already, not only after the
+    // question (the service decides again when the raid moves).
     const now = Date.now();
     const other = blocksNewRaid(party, now)
-      ? ctx.parties.raidAt(gym.id, raidKindOf(party), now)
+      ? ctx.parties.raidAt(party.guildId, gym.id, now)
       : undefined;
     if (other && other.id !== party.id) {
       const post = other.forumPostId;
diff --git a/src/commands/raids/raid-changes.test.ts b/src/commands/raids/raid-changes.test.ts
index 622ff2bc24c5681a616ebe01ba98aef46a56296f..9ff357111fc315af03dbd21de2a35b17091e54bd 100644
--- a/src/commands/raids/raid-changes.test.ts
+++ b/src/commands/raids/raid-changes.test.ts
@@ -113,7 +113,7 @@ describe('the shared changes of a raid', () => {
     const discord = raidChangeAnswer(limits, refused, () => '', '');
     expect(discord).toMatchObject({ kind: 'refused' });
     expect(discord.text).toBe(
-      `That gym already has a raid like this one. Its post is <#${String(other.forumPostId)}>.`,
+      `That gym already has a raid. Its post is <#${String(other.forumPostId)}>.`,
     );
     const page = raidChangeAnswer(
       limits,
diff --git a/src/commands/raids/report.ts b/src/commands/raids/report.ts
index 06c9ab2863c17fea6c8b41252f3facc3f762eccb..17c12b60272a33e74284b4a350cc15f2d8d539c5 100644
--- a/src/commands/raids/report.ts
+++ b/src/commands/raids/report.ts
@@ -112,8 +112,9 @@ export function reportAccessOf(ctx: Pick<AppContext, 'partyService' | 'parties'>
  * would put the member in a forum somebody keeps them out of (`barred`: `AccessService` would
  * not let them in), as `/raid` and the map both ask it before their throttle (plans 8M-4, 8M-6):
  * the forum a new raid would go to (`regionFor`, as `reportRaid` decides), then that of every
- * active raid of the server already at the gym, of either kind, which the report would join and
- * which may stand in another region's forum. Rejects while Discord cannot say.
+ * active raid of the server already at the gym (one; two of either kind only when stored before
+ * plan 8E), which the report would join and which may stand in another region's forum. Rejects
+ * while Discord cannot say.
  */
 export async function reportBarred(
   access: ReportAccess,
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index e672189708bcdb2b4c832eaa112477148c9beb5f..301b570fbd6621b4b606b81c07d9e9d557f39da7 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -437,8 +437,8 @@ describe('PartyRepository', () => {
       [ID(2), elite],
     ]);
     expect(entries.filter((entry) => Number(entry.level) >= 40)).toEqual([]);
-    // One of them stands for the gym where a new report asks; each ends by its own clock.
-    expect(store.raidAt(1, 'elite', PARTY_NOW + 2 * MINUTE)?.id).toBe(ID(1));
+    // The oldest stands for the gym where a new report asks; each ends by its own clock.
+    expect(store.raidAt(1, 1, PARTY_NOW + 2 * MINUTE)?.id).toBe(ID(1));
     // A change of the one that was stored with EX is written back as an elite raid.
     const changed = await store.update(ID(2), (party) => ({ party: { ...party, saved: true } }));
     expect(changed).toMatchObject({ written: true });
diff --git a/src/domain/party/boss-move.test.ts b/src/domain/party/boss-move.test.ts
index f99bbec69cc06858095ff1d265767260a0680b4a..895f95a59e564e6bc3bd78de6a65abdbf2d50114 100644
--- a/src/domain/party/boss-move.test.ts
+++ b/src/domain/party/boss-move.test.ts
@@ -10,6 +10,7 @@ import {
 import type { RaidTier } from '../pogo/raid-tier.js';
 import { bossTierMoved, type BossTierMove } from './boss-move.js';
 import { endParty } from './party.js';
+import { setBoss } from './raid.js';
 
 const rules = testRaidRules();
 const T1: RaidTier = { level: 'T1', shadow: false };
@@ -69,6 +70,26 @@ describe('bossTierMoved (plan 8X-J)', () => {
     expect(bossTierMoved(egg, move, rules, PARTY_NOW)).toBe(egg);
   });
 
+  // Plan 8E, review E1: a raid runs while it blocks its gym (`blocksNewRaid`), not by its end
+  // time alone: a timeless raid past its last possible time is over, though still active.
+  it('leaves a raid that is over by the clock without an end time as it is', () => {
+    const T5: RaidTier = { level: 'T5', shadow: false };
+    const egg = setBoss(
+      testRaid({ tier: T5 }),
+      { tier: T5, boss: { key: 'mewtwo' } },
+      rules,
+      PARTY_NOW,
+    ).party;
+    const move: BossTierMove = {
+      boss: { key: 'mewtwo', names: ['Mewtwo'] },
+      from: [T5],
+      to: { level: 'Elite', shadow: false },
+    };
+    expect(egg.endTime).toBeNull();
+    expect(bossTierMoved(egg, move, rules, at('2026-10-13T15:44'))).not.toBe(egg);
+    expect(bossTierMoved(egg, move, rules, at('2026-10-13T15:45'))).toBe(egg);
+  });
+
   it('never moves a raid by a max move, nor a max battle by a raid move', () => {
     const raid = testRaid({ tier: T3, boss: { key: 'sneasel' } });
     expect(bossTierMoved(raid, SNEASEL, rules, PARTY_NOW)).toBe(raid);
diff --git a/src/domain/party/boss-move.ts b/src/domain/party/boss-move.ts
index f89a5cb5e423431ec82dc2bd0236be2bd6aed2fc..9e4e16c10711e40930802a9a16a2c1e269053b71 100644
--- a/src/domain/party/boss-move.ts
+++ b/src/domain/party/boss-move.ts
@@ -10,7 +10,7 @@ import {
   type RaidBossRef,
   type RaidParty,
 } from './party.js';
-import { setBoss } from './raid.js';
+import { blocksNewRaid, setBoss } from './raid.js';
 
 /**
  * A boss that staff moved to another tier by an add (plan 8X-J, Matt's answer 4): the boss as the
@@ -33,7 +33,8 @@ function isMovedBoss(ref: RaidBossRef | null, boss: BossTierMove['boss']): boole
 
 /**
  * A running battle moved with its boss (plan 8X-J): a max battle or a raid of the moved boss, at
- * a tier it moved from, active and with its end still ahead at `now`, gets the add's tier and
+ * a tier it moved from, active and with its end still ahead at `now` (a raid: not ended by the
+ * clock, `blocksNewRaid`, also without an end time; plan 8E), gets the add's tier and
  * whatever follows from it (its title, post and `/counters` are drawn from the party). A max
  * battle keeps its boss, its end and since when it has the boss (`setMaxBoss`, never between
  * Dynamax and Gigantamax); a raid keeps its boss and moves (`setBoss`, which works its times out
@@ -52,7 +53,7 @@ export function bossTierMoved(
   return party;
 }
 
-/** Whether a battle is still on at `now`: active, and its end (if any) ahead. */
+/** Whether a max battle is still on at `now`: active, and its end (if any) ahead. */
 function running(party: Party, now: number): boolean {
   return party.status === 'active' && (party.endTime === null || party.endTime > now);
 }
@@ -75,7 +76,9 @@ export function raidBossTierMoved(
   now: number,
 ): RaidParty {
   const { to } = move;
-  if (!running(party, now) || typeof to === 'string') return party;
+  // A raid runs while it blocks its gym (review E1 of plan 8E): one over by the clock without an
+  // end time (past its last possible time, not yet archived) is not brought back by a move.
+  if (!blocksNewRaid(party, now) || typeof to === 'string') return party;
   const { raid } = party;
   if (!isMovedBoss(raid.boss, move.boss)) return party;
   const from = move.from.filter((tier): tier is RaidTier => typeof tier !== 'string');
diff --git a/src/domain/party/raid.test.ts b/src/domain/party/raid.test.ts
index e1fe064279e655a5c5315eeed2403462fb64622c..4e776586eed6e84295c8007917245daedb0aa9e9 100644
--- a/src/domain/party/raid.test.ts
+++ b/src/domain/party/raid.test.ts
@@ -20,12 +20,14 @@ import {
   raidBossRef,
   raidMirrors,
   raidStage,
+  raidStandingAt,
   setBoss,
   setEndTime,
   setGym,
   setHatchedDuration,
   setHatchTime,
   setMoveset,
+  standsAtGym,
   timeConfirmed,
 } from './raid.js';
 import { PartyStatus } from './status.js';
@@ -279,6 +281,43 @@ describe('raidStage and blocksNewRaid', () => {
   });
 });
 
+// Plan 8E (Matt, 2026-10-26): an elite raid shows its egg on the gym, so one raid per gym.
+describe('raidStandingAt and standsAtGym: one raid per gym, of any kind', () => {
+  const ID = (n: number): string => `00000000-0000-4000-8000-00000000080${String(n)}`;
+  const standard = setHatchTime(testRaid({ id: ID(1) }), at('2026-10-13T14:30'), rules, PARTY_NOW);
+  const elite = testRaid({ id: ID(2), tier: ELITE, now: PARTY_NOW + MINUTE });
+
+  it('finds the raid at a gym whatever its kind, and the first of two stored before', () => {
+    expect(raidStandingAt([elite], 1, 1, PARTY_NOW + MINUTE)).toBe(elite);
+    expect(raidStandingAt([standard], 1, 1, PARTY_NOW + MINUTE)).toBe(standard);
+    expect(raidStandingAt([standard, elite], 1, 1, PARTY_NOW + MINUTE)).toBe(standard);
+    expect(raidStandingAt([standard, elite], 1, 2, PARTY_NOW + MINUTE)).toBeUndefined();
+  });
+
+  it('leaves out the raid asked about, and every raid that has ended', () => {
+    expect(raidStandingAt([standard, elite], 1, 1, PARTY_NOW + MINUTE, ID(1))).toBe(elite);
+    expect(raidStandingAt([standard], 1, 1, at('2026-10-13T15:15'))).toBeUndefined();
+    const ended = { ...elite, status: 'ended' as const };
+    expect(raidStandingAt([ended], 1, 1, PARTY_NOW + MINUTE)).toBeUndefined();
+  });
+
+  it('says whether one raid stands at a gym: at it, and not ended by the clock', () => {
+    expect(standsAtGym(elite, 1, 1, PARTY_NOW + MINUTE)).toBe(true);
+    expect(standsAtGym(elite, 1, 2, PARTY_NOW + MINUTE)).toBe(false);
+    expect(standsAtGym(standard, 1, 1, at('2026-10-13T15:14'))).toBe(true);
+    expect(standsAtGym(standard, 1, 1, at('2026-10-13T15:15'))).toBe(false);
+  });
+
+  // Review E7 (the coordinator's ruling): a raid stands at a gym for its server only.
+  it('finds a raid at a gym for its own server only', () => {
+    const otherServer = { ...elite, guildId: 2 };
+    expect(standsAtGym(otherServer, 1, 1, PARTY_NOW + MINUTE)).toBe(false);
+    expect(standsAtGym(otherServer, 2, 1, PARTY_NOW + MINUTE)).toBe(true);
+    expect(raidStandingAt([otherServer, standard], 1, 1, PARTY_NOW + MINUTE)).toBe(standard);
+    expect(raidStandingAt([otherServer], 1, 1, PARTY_NOW + MINUTE)).toBeUndefined();
+  });
+});
+
 describe('a boss is stored as a reference and nothing more', () => {
   const yveltal = raidBossesFixture()
     .bosses()
diff --git a/src/domain/party/raid.ts b/src/domain/party/raid.ts
index 69135c64ff4a8cd9c30fec77c06d4c33ab614786..d1d8b208b3cfe002b6a830405740e20618663397 100644
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -138,6 +138,42 @@ export function blocksNewRaid(party: RaidParty, now: number): boolean {
   return party.status === 'active' && raidStage(party, now) !== 'ended';
 }
 
+/**
+ * Whether this raid stands at this gym for this server (`guildId`, its row): it is a raid of the
+ * server at the gym and blocks a new report there (`blocksNewRaid`). Of any kind (plan 8E; Matt,
+ * 2026-10-26): an elite raid shows its egg on the gym, usually from the evening before, so a gym
+ * has one raid, standard or elite, at a time. Per server (review E7, as `maxAt`): a raid of
+ * another server that has the same gym is none of this server's.
+ */
+export function standsAtGym(
+  party: RaidParty,
+  guildId: number,
+  gymId: number,
+  now: number,
+): boolean {
+  return party.guildId === guildId && party.gymId === gymId && blocksNewRaid(party, now);
+}
+
+/**
+ * The raid that stands at this gym for this server (`standsAtGym`), whatever its kind, leaving
+ * out the raid `except` (one that is being changed): the one rule of "the gym has a raid already"
+ * for every report and every change of a raid's gym, tier or times. Of two raids at one gym,
+ * which only reports from before plan 8E can have left, the first in `raids`' order (the store's:
+ * oldest first).
+ */
+export function raidStandingAt(
+  raids: Iterable<RaidParty>,
+  guildId: number,
+  gymId: number,
+  now: number,
+  except?: string,
+): RaidParty | undefined {
+  for (const raid of raids) {
+    if (raid.id !== except && standsAtGym(raid, guildId, gymId, now)) return raid;
+  }
+  return undefined;
+}
+
 /**
  * The latest moment a raid without an end time can be going on. An egg reported at `createdAt`
  * hatches within the incubation time and then lasts the hatched time; a raid reported hatched
diff --git a/src/render/activity.ts b/src/render/activity.ts
index d0795f05fa9149eb2d862a2c92b9a325fe0fbdfc..d942413d3d3fff2d8d891e599653f28530b24e2c 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -132,7 +132,7 @@ export function problemText(
       // A raid's or a max battle's: the battles have Done (`isBattle`).
       return `You are done with this ${word === 'max battle' ? word : 'raid'}. Use Join or Here if you are back.`;
     case 'gym-taken':
-      return 'That gym already has a raid like this one.';
+      return 'That gym already has a raid.';
     case 'spot-taken':
       return 'That spot has another max battle by now: this one stays as it is.';
     case 'max-kind-change':
diff --git a/src/services/boss-tier-moves.test.ts b/src/services/boss-tier-moves.test.ts
index a3d194a0367e62bc5a06568b790dae147c8e3b38..04e523cc987a391214db9481e48ea6fb266e8611 100644
--- a/src/services/boss-tier-moves.test.ts
+++ b/src/services/boss-tier-moves.test.ts
@@ -9,7 +9,7 @@ import {
   testRaidRules,
 } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
-import { setHatchTime } from '../domain/party/raid.js';
+import { setBoss, setHatchTime } from '../domain/party/raid.js';
 import type { Party } from '../domain/party/party.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 
@@ -90,7 +90,9 @@ describe('BossTierMoves (plan 8X-J)', () => {
     expect(told).not.toHaveBeenCalled();
   });
 
-  it('leaves a raid that the move would put in the way of another at its gym, counted apart', async () => {
+  // Plan 8E: one raid per gym of any kind; a raid that stands at its gym is never in its own
+  // way, also when another raid was stored there before the rule.
+  it('moves a raid to Elite at its gym though another raid was stored there before', async () => {
     const made = await partyServiceWith([
       { ...testRaid({ id: ID(1), tier: T5, boss: { key: 'mewtwo' } }), forumPostId: POST(1) },
       testRaid({ id: ID(2), tier: ELITE, boss: { key: 'zekrom' } }),
@@ -100,7 +102,33 @@ describe('BossTierMoves (plan 8X-J)', () => {
       from: [T5],
       to: ELITE,
     });
-    expect(moved).toEqual({ moved: 0, inTheWay: 1 });
+    expect(moved).toEqual({ moved: 1, inTheWay: 0 });
+    expect(asRaid(made.store.get(ID(1))).raid.tier).toEqual(ELITE);
+  });
+
+  // Review E1 of plan 8E: a raid over by the clock is no running battle, though still active,
+  // so a move never brings it back (beside the raid reported at its gym since); nothing counts it.
+  it('leaves a raid over by the clock as it is, and counts it nowhere', async () => {
+    // A timeless T5 egg with its boss named, over by the clock at 15:45 but not yet archived;
+    // as an elite egg it would last until the next day.
+    const rules = testRaidRules();
+    const egg = setBoss(
+      testRaid({ id: ID(1), tier: T5 }),
+      { tier: T5, boss: { key: 'mewtwo' } },
+      rules,
+      PARTY_NOW,
+    ).party;
+    const made = await partyServiceWith([
+      { ...egg, forumPostId: POST(1) },
+      testRaid({ id: ID(2), tier: T5, now: at('2026-10-13T15:50') }),
+    ]);
+    made.clock.now = at('2026-10-13T15:55');
+    const moved = await made.bossMoves.move({
+      boss: { key: 'mewtwo', names: ['Mewtwo'] },
+      from: [T5],
+      to: ELITE,
+    });
+    expect(moved).toEqual({ moved: 0, inTheWay: 0 });
     expect(asRaid(made.store.get(ID(1))).raid.tier).toEqual(T5);
   });
 
diff --git a/src/services/party-service.relocate.test.ts b/src/services/party-service.relocate.test.ts
index 34722f1c74c25eaa20556ddeb7c71ef7af74b637..e86dc0e1181eb4b795707bff9746d54e88d3c514 100644
--- a/src/services/party-service.relocate.test.ts
+++ b/src/services/party-service.relocate.test.ts
@@ -341,7 +341,7 @@ describe('PartyService.relocate', () => {
 });
 
 describe('PartyService.relocate: when it cannot be done', () => {
-  it('leaves the raid where it is when the gym has such a raid already', async () => {
+  it('leaves the raid where it is when the gym has a raid already', async () => {
     const made = await reportedRaid(yveltal);
     const other = await made.service.reportRaid({
       gym: cafe(),
@@ -388,7 +388,7 @@ describe('PartyService.relocate: when it cannot be done', () => {
     expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: false });
     expect(texts(made, WEST_CHANNEL)).toHaveLength(1);
-    expect(made.store.raidAt(8, 'standard', made.clock.now)).toBeUndefined();
+    expect(made.store.raidAt(1, 8, made.clock.now)).toBeUndefined();
   });
 
   it('leaves the raid as it was when the post cannot be made', async () => {
@@ -453,7 +453,7 @@ describe('PartyService.relocate: when it cannot be done', () => {
     saving.mockImplementation(save);
     await settled(made);
     expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
-    expect(made.store.raidAt(8, 'standard', made.clock.now)).toBeUndefined();
+    expect(made.store.raidAt(1, 8, made.clock.now)).toBeUndefined();
   });
 });
 
@@ -527,7 +527,7 @@ describe('PartyService.relocate: what happens meanwhile', () => {
     // The old post was closed by whoever ended it, once, and nothing was said into it after.
     expect(made.said()).toEqual(['Closed.']);
     expect(made.gateway.posts.get(made.postId)?.reopened).toBe(0);
-    expect(made.store.raidAt(8, 'standard', made.clock.now)).toBeUndefined();
+    expect(made.store.raidAt(1, 8, made.clock.now)).toBeUndefined();
   });
 
   it('says that the raid moved while those who are in the old forum only for it can still see it', async () => {
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index ca21106b24e62bd60d6953ec2a383cdd6472a45f..bde8724a80c46505fc4bec09466acfbac829c44b 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -120,6 +120,48 @@ describe('PartyService.reportRaid', () => {
     });
   });
 
+  // Plan 8E (Matt, 2026-10-26): one raid per gym, of any kind. A report of the other kind joins
+  // the raid there and changes nothing of it, as a report of another tier does.
+  it('joins the raid of the other kind at the gym, and leaves its tier, boss and times alone', async () => {
+    const ELITE = { level: 'Elite', shadow: false } as const;
+    for (const [standing, reported] of [
+      [T5, ELITE],
+      [ELITE, T5],
+    ] as const) {
+      const { service, store } = await partyServiceWith();
+      const first = await service.reportRaid(report({ tier: standing }));
+      if (first.kind !== 'created') throw new Error(first.kind);
+      const before = asRaid(store.get(first.party.id));
+      const joined = await service.reportRaid(
+        report({
+          reporterId: ALICE,
+          autoStatus: PartyStatus.Coming,
+          tier: reported,
+          boss: { key: 'yveltal' },
+          time: { end: at('2026-10-13T14:20') },
+        }),
+      );
+      expect(joined).toMatchObject({ kind: 'exists', joined: true, party: { id: first.party.id } });
+      expect(store.active()).toHaveLength(1);
+      const after = asRaid(store.get(first.party.id));
+      expect(after.raid.tier).toEqual(standing);
+      expect(after.raid.boss).toBeNull();
+      expect([after.hatchTime, after.endTime]).toEqual([before.hatchTime, before.endTime]);
+      expect(after.attendees[ALICE]).toMatchObject({ status: PartyStatus.Coming });
+    }
+  });
+
+  // Review E7 of plan 8E (the coordinator's ruling): a raid stands at a gym for its server.
+  it('makes a raid at a gym where only a raid of another server stands', async () => {
+    const elsewhere = testRaid({ id: '00000000-0000-4000-8000-000000000903', guildId: 2 });
+    const { service, store } = await partyServiceWith([elsewhere]);
+    expect(library?.id).toBe(elsewhere.gymId);
+    const outcome = await service.reportRaid(report());
+    expect(outcome).toMatchObject({ kind: 'created', party: { guildId: 1, gymId: library?.id } });
+    expect(store.active()).toHaveLength(2);
+    expect(store.get(elsewhere.id)).toBe(elsewhere);
+  });
+
   it('asks whether the reporter may join a raid in another forum, and refuses one moved meanwhile', async () => {
     const { service, store } = await partyServiceWith();
     const first = await service.reportRaid(report());
@@ -273,14 +315,6 @@ describe('PartyService.reportRaid', () => {
     expect(gateway.postsIn(WEST_FORUM)).toHaveLength(1);
   });
 
-  it('allows an elite raid beside a standard one at the same gym', async () => {
-    const { service, gateway } = await partyServiceWith();
-    await service.reportRaid(report());
-    const elite = await service.reportRaid(report({ tier: { level: 'Elite', shadow: false } }));
-    expect(elite.kind).toBe('created');
-    expect(gateway.postsIn(WEST_FORUM)).toHaveLength(2);
-  });
-
   it('says so when the gym lies in no region, or its region has no forum', async () => {
     const { service, regions, storage } = await partyServiceWith();
     await expect(service.reportRaid(report({ gym: trailhead! }))).resolves.toEqual({
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 709e6f613a88c61c6c29bf8761b824f6f7d382d5..9035a541f83fb049ba61db2011fed0d1a626034c 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -354,7 +354,10 @@ export interface NoPost {
 export type ReportOutcome =
   /** A new raid with its post. */
   | { kind: 'created'; party: RaidParty }
-  /** The gym has such a raid already; `joined` says whether the reporter was signed up for it. */
+  /**
+   * The gym has a raid already, of any kind (plan 8E); `joined` says whether the reporter was
+   * signed up for it.
+   */
   | { kind: 'exists'; party: RaidParty; joined: boolean }
   /** The gym lies in no region of this server. */
   | { kind: 'no-region' }
@@ -365,7 +368,7 @@ export type ReportOutcome =
   /** The post could not be made (`noPostWords`): nothing was kept. */
   | NoPost
   /**
-   * The gym has such a raid already, in a forum the reporter may not be put in
+   * The gym has a raid already, in a forum the reporter may not be put in
    * (`RaidReport.mayJoin`): they were not signed up, nothing was done.
    */
   | { kind: 'barred' }
@@ -434,7 +437,7 @@ export type TrainOutcome = TimedOutcome<TrainParty>;
 export type RelocateOutcome =
   /** There is no such active raid. */
   | { kind: 'gone' }
-  /** The gym already has such a raid, `other`. */
+  /** The gym already has a raid, `other`. */
   | { kind: 'taken'; other: RaidParty }
   /** The region has no forum (any more): the raid stays where it is. */
   | { kind: 'no-forum' }
@@ -1283,8 +1286,9 @@ export class PartyService {
   }
 
   /**
-   * Stores a reported raid and creates its post. When the gym already has such a raid, the
-   * reporter is signed up for that one with their automatic status, unless they already are.
+   * Stores a reported raid and creates its post. When the gym already has a raid, of any kind
+   * (plan 8E), the reporter is signed up for that one with their automatic status, unless they
+   * already are; nothing else of the report is applied to it (its tier, boss and times stay).
    * No active raid is left without a post, and no post without a stored raid.
    */
   async reportRaid(report: RaidReport): Promise<ReportOutcome> {
@@ -1562,7 +1566,7 @@ export class PartyService {
    * kept; `by` is the member who moved it.
    *
    * The new party is stored first and gets its post before the old one ends: when the gym has
-   * such a raid already (`taken`), the region has no forum (`no-forum`) or the post cannot be
+   * a raid already (`taken`), the region has no forum (`no-forum`) or the post cannot be
    * made (it throws), the raid stays as and where it was. The word that it moved is said in the
    * old post while that party is still active: whoever is in that forum only for this raid
    * loses sight of it the moment the party ends, and would not get the ping. When the old party
diff --git a/src/services/party-store.test.ts b/src/services/party-store.test.ts
index 87fee57a023594b1987753751869abb3d10829d9..98f7e3ff7d21a674637ab297a1cabfee449b615d 100644
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -66,7 +66,7 @@ describe('PartyStore', () => {
     expect(store.active().map((party) => party.type)).toEqual(['raid', 'meetup']);
     expect(store.byPost('300000000000000002')?.id).toBe(ID(2));
     expect(store.inRegion(1).map((party) => party.id)).toEqual([ID(1), ID(2)]);
-    expect(store.raidAt(1, 'standard', PARTY_NOW)?.id).toBe(ID(1));
+    expect(store.raidAt(1, 1, PARTY_NOW)?.id).toBe(ID(1));
 
     // A change of a meetup is written like any other, with the details of a meetup.
     const joined = await store.update(ID(2), join(ALICE));
@@ -121,15 +121,29 @@ describe('PartyStore', () => {
     );
   });
 
-  it('finds the raid that blocks a new report: same gym and kind, not ended by the clock', async () => {
+  it('finds the raid that blocks a new report: same gym, any kind, not ended by the clock', async () => {
     const rules = testRaidRules();
     const raid = setEndTime(testRaid({ id: ID(1) }), at('2026-10-13T14:40'), rules, PARTY_NOW);
+    const { store } = await partyStoreWith([raid]);
+    expect(store.raidAt(1, 1, at('2026-10-13T14:39'))?.id).toBe(ID(1));
+    expect(store.raidAt(1, 1, at('2026-10-13T14:40'))).toBeUndefined();
+    expect(store.raidAt(1, 2, PARTY_NOW)).toBeUndefined();
+  });
+
+  // Plan 8E, goal 4: two raids stored at one gym before the rule stay; the oldest stands for it.
+  it('answers the oldest of an elite and a standard raid stored at one gym before, until it ends', async () => {
+    const rules = testRaidRules();
     const elite = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
-    const { store } = await partyStoreWith([raid, elite]);
-    expect(store.raidAt(1, 'standard', at('2026-10-13T14:39'))?.id).toBe(ID(1));
-    expect(store.raidAt(1, 'standard', at('2026-10-13T14:40'))).toBeUndefined();
-    expect(store.raidAt(1, 'elite', PARTY_NOW)?.id).toBe(ID(2));
-    expect(store.raidAt(2, 'standard', PARTY_NOW)).toBeUndefined();
+    const raid = setEndTime(
+      testRaid({ id: ID(1), now: PARTY_NOW - MINUTE }),
+      at('2026-10-13T14:40'),
+      rules,
+      PARTY_NOW,
+    );
+    const { store } = await partyStoreWith([elite, raid]);
+    expect(store.active().map((party) => party.id)).toEqual([ID(1), ID(2)]);
+    expect(store.raidAt(1, 1, at('2026-10-13T14:39'))?.id).toBe(ID(1));
+    expect(store.raidAt(1, 1, at('2026-10-13T14:40'))?.id).toBe(ID(2));
   });
 
   it('adds a party to the database and to memory', async () => {
@@ -293,7 +307,7 @@ describe('PartyStore', () => {
     const order: string[] = [];
     const report = (name: string) =>
       store.withGymLock(1, async () => {
-        const free = store.raidAt(1, 'standard', PARTY_NOW) === undefined;
+        const free = store.raidAt(1, 1, PARTY_NOW) === undefined;
         order.push(`${name}: ${free ? 'free' : 'taken'}`);
         if (free) await store.add(testRaid());
       });
@@ -668,14 +682,34 @@ describe('PartyStore', () => {
       expect(storage.writes).toHaveLength(1);
     });
 
-    it('adds a raid of another kind at the same gym', async () => {
-      const { store } = await partyStoreWith([testRaid({ id: ID(1) })]);
+    // Plan 8E (Matt, 2026-10-26): one raid per gym, of any kind.
+    it('stores no raid at a gym that has a raid of the other kind, and hands that one back', async () => {
       const elite = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
-      await expect(store.addRaidUnlessTaken(elite, PARTY_NOW)).resolves.toEqual({
+      const atStandard = await partyStoreWith([testRaid({ id: ID(1) })]);
+      await expect(atStandard.store.addRaidUnlessTaken(elite, PARTY_NOW)).resolves.toMatchObject({
+        added: false,
+        existing: { id: ID(1) },
+      });
+      expect(atStandard.store.active()).toHaveLength(1);
+
+      const atElite = await partyStoreWith([elite]);
+      await expect(
+        atElite.store.addRaidUnlessTaken(testRaid({ id: ID(1) }), PARTY_NOW),
+      ).resolves.toMatchObject({ added: false, existing: { id: ID(2) } });
+      expect(atElite.store.active()).toHaveLength(1);
+    });
+
+    // Review E7 of plan 8E (the coordinator's ruling): a raid stands at a gym for its server.
+    it('adds a raid at a gym where only a raid of another server stands', async () => {
+      const { store } = await partyStoreWith([testRaid({ id: ID(1), guildId: 2 })]);
+      const here = testRaid({ id: ID(2), tier: { level: 'Elite', shadow: false } });
+      await expect(store.addRaidUnlessTaken(here, PARTY_NOW)).resolves.toEqual({
         added: true,
-        party: elite,
+        party: here,
       });
-      expect(store.active()).toHaveLength(2);
+      await expect(
+        store.addRaidUnlessTaken(testRaid({ id: ID(3), guildId: 2 }), PARTY_NOW),
+      ).resolves.toMatchObject({ added: false, existing: { id: ID(1) } });
     });
 
     it('adds a raid when the one at the gym has ended by the clock', async () => {
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index a09091ead0c229a342c138aad79f7567ea5963ac..1e0e6b69c14b374e2de69058ab2f6b282bd9d244 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -10,8 +10,7 @@ import {
   type Party,
   type RaidParty,
 } from '../domain/party/party.js';
-import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
-import type { RaidKind } from '../domain/time/party-time.js';
+import { raidStandingAt } from '../domain/party/raid.js';
 import type { Logger } from '../log.js';
 import { KeyedLock } from './keyed-lock.js';
 
@@ -37,10 +36,12 @@ export interface PartyProvider {
   /** The active parties of a region, oldest first. */
   inRegion(regionId: number): Party[];
   /**
-   * The raid at this gym that stands in the way of a new report of the same kind (standard
-   * or elite): one that has not ended by the clock.
+   * The raid at this gym that stands in the way of a new report there, of any kind (plan 8E,
+   * `raidStandingAt`): one of the same server (`guildId`, its row: the gym's id is the same in
+   * every server that has it, as `maxAt`), that has not ended by the clock; the oldest of two
+   * stored before.
    */
-  raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined;
+  raidAt(guildId: number, gymId: number, now: number): RaidParty | undefined;
   /**
    * The max battle at this spot that stands in the way of a new report there (plan 8X-3; design
    * 3.1): one whose end has not come, at the same power spot, or at a pin within 50 metres of
@@ -188,12 +189,8 @@ export class PartyStore implements PartyProvider {
     return this.active().filter((party) => party.regionId === regionId);
   }
 
-  raidAt(gymId: number, kind: RaidKind, now: number): RaidParty | undefined {
-    return this.active()
-      .filter(isRaid)
-      .find(
-        (party) => party.gymId === gymId && raidKindOf(party) === kind && blocksNewRaid(party, now),
-      );
+  raidAt(guildId: number, gymId: number, now: number): RaidParty | undefined {
+    return raidStandingAt(this.active().filter(isRaid), guildId, gymId, now);
   }
 
   maxAt(guildId: number, spot: MaxSpot, now: number): MaxParty | undefined {
@@ -435,9 +432,10 @@ export class PartyStore implements PartyProvider {
   }
 
   /**
-   * Stores a reported raid unless the gym already has a raid of its kind that has not ended by
-   * the clock, in which case that raid is returned and nothing is stored. The check and the
-   * insert happen under the gym's lock, so two reports cannot both find the gym free (spec 5.2);
+   * Stores a reported raid unless the gym already has a raid of the party's server, of any kind,
+   * that has not ended by the clock (`raidAt`), in which case that raid is returned and nothing is
+   * stored. The check and the insert happen under the gym's lock (one lock per gym, whatever the
+   * server), so two reports cannot both find the gym free (spec 5.2);
    * this is the one way a reported raid is stored. A party without a gym is refused.
    *
    * `gymExists` is asked under the same lock, before anything else: the deletion of a gym
@@ -461,7 +459,7 @@ export class PartyStore implements PartyProvider {
     if (gymId === null) throw new Error(`Raid ${party.id} has no gym`);
     return this.withGymLock(gymId, async () => {
       if (!gymExists()) return { added: false, existing: undefined };
-      const existing = this.raidAt(gymId, raidKindOf(party), now);
+      const existing = this.raidAt(party.guildId, gymId, now);
       if (existing) return { added: false, existing };
       if (options.mayAdd === false) return { added: false, existing: undefined };
       await this.add(party, options);
diff --git a/src/services/raid-change-service.test.ts b/src/services/raid-change-service.test.ts
index e69e2ee287255b636d0ad11fe05df6ebba930596..1c2110fa64232749f26e2a44d4b46b3430b33169 100644
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -9,6 +9,7 @@ import {
   MINUTE,
   REPORTER,
   testMeetup,
+  testRaid,
 } from '../../test/support/parties.js';
 import { partyServiceWith, reportedRaid } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
@@ -22,6 +23,8 @@ const alice: Member = { id: ALICE, name: 'Alice' };
 const bob: Member = { id: BOB, name: 'Bob' };
 const carol: Member = { id: CAROL, name: 'Carol' };
 const T5 = { level: 'T5', shadow: false } as const;
+const ELITE = { level: 'Elite', shadow: false } as const;
+const OTHER_SERVER_RAID = '00000000-0000-4000-8000-000000000902';
 const HATCH = at('2026-10-13T14:30');
 const END = at('2026-10-13T15:15');
 
@@ -438,8 +441,8 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     ]);
     expect(made.gateway.posts.get(made.postId)?.title).toBe('T5 egg · Old Stone Fountain');
     // The gym it left is free again, the one it is at is taken.
-    expect(made.store.raidAt(1, 'standard', made.clock.now)).toBeUndefined();
-    expect(made.store.raidAt(2, 'standard', made.clock.now)?.id).toBe(made.party.id);
+    expect(made.store.raidAt(1, 1, made.clock.now)).toBeUndefined();
+    expect(made.store.raidAt(1, 2, made.clock.now)?.id).toBe(made.party.id);
   });
 
   // Final review of 8X-F, F2: the line ends once after a gym whose name ends in a period.
@@ -562,7 +565,7 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     expect(answered).toEqual([8]);
   });
 
-  it('refuses the move to another region when that gym has such a raid, naming it', async () => {
+  it('refuses the move to another region when that gym has a raid, naming it', async () => {
     const made = await reportedRaid();
     const other = await secondRaid(made, 8);
     const outcome = await made.raids.setGym(made.party.id, alice, 8);
@@ -581,7 +584,7 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     expect(await made.raids.setGym(made.party.id, alice, 2)).toEqual({ kind: 'gone' });
   });
 
-  it('refuses a gym that has such a raid already, naming it', async () => {
+  it('refuses a gym that has a raid already, naming it', async () => {
     const made = await reportedRaid();
     const other = await secondRaid(made, 2);
     const outcome = await made.raids.setGym(made.party.id, alice, 2);
@@ -594,10 +597,25 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     expect(await lines(made)).toEqual([]);
   });
 
-  it('lets a raid of another kind share the gym', async () => {
-    const made = await reportedRaid();
-    await secondRaid(made, 2, { tier: { level: 'Elite', shadow: false } });
-    expect(await made.raids.setGym(made.party.id, alice, 2)).toMatchObject({ kind: 'ok' });
+  // Plan 8E (Matt, 2026-10-26): one raid per gym, of any kind.
+  it('refuses a gym that has an elite raid for a standard one, and the reverse', async () => {
+    const standard = await reportedRaid();
+    const elite = await secondRaid(standard, 2, { tier: ELITE });
+    expect(await standard.raids.setGym(standard.party.id, alice, 2)).toMatchObject({
+      kind: 'refused',
+      reason: 'gym-taken',
+      other: { id: elite.id },
+    });
+    expect(standard.current().gymId).toBe(1);
+
+    const eliteMade = await reportedRaid({ tier: ELITE });
+    const other = await secondRaid(eliteMade, 2);
+    expect(await eliteMade.raids.setGym(eliteMade.party.id, alice, 2)).toMatchObject({
+      kind: 'refused',
+      reason: 'gym-taken',
+      other: { id: other.id },
+    });
+    expect(eliteMade.current().gymId).toBe(1);
   });
 
   it('refuses an end time that would bring a finished raid back beside its successor', async () => {
@@ -617,19 +635,46 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     );
   });
 
-  it('refuses a boss that makes the raid the kind another raid at the gym is', async () => {
-    const made = await reportedRaid({ tier: { level: 'Elite', shadow: false } });
-    const standard = await secondRaid(made, 1);
-    const outcome = await made.raids.setBoss(made.party.id, alice, {
-      tier: T5,
+  // Review E6 of plan 8E: the successor of the other kind stands in the way all the same.
+  it('refuses an end time that would bring a finished raid back beside an elite successor', async () => {
+    const made = await reportedRaid({
       boss: { key: 'yveltal' },
-      label: 'Yveltal (T5)',
+      time: { end: at('2026-10-13T14:10') },
     });
-    expect(outcome).toMatchObject({
-      kind: 'refused',
-      reason: 'gym-taken',
-      other: { id: standard.id },
+    made.clock.now = at('2026-10-13T14:12');
+    const next = await secondRaid(made, 1, { tier: ELITE });
+    const outcome = await made.raids.setEndTime(made.party.id, alice, at('2026-10-13T14:40'));
+    expect(outcome).toMatchObject({ kind: 'refused', reason: 'gym-taken', other: { id: next.id } });
+    expect(made.current().endTime).toBe(at('2026-10-13T14:10'));
+  });
+
+  // Review E7 of plan 8E (the coordinator's ruling): a raid stands at a gym for its server.
+  it('moves a raid to a gym where only a raid of another server stands', async () => {
+    const made = await reportedRaid();
+    await made.store.add(testRaid({ id: OTHER_SERVER_RAID, guildId: 2, gymId: 2 }));
+    expect(await made.raids.setGym(made.party.id, alice, 2)).toMatchObject({
+      kind: 'ok',
+      changed: true,
     });
+    expect(made.current().gymId).toBe(2);
+  });
+
+  // Plan 8E, goal 4: an elite and a standard raid stored at one gym before the rule both run
+  // out by the clock, and either may still change its tier at its own gym.
+  it('lets either of two raids stored at one gym before change its kind there', async () => {
+    const made = await reportedRaid({ tier: ELITE });
+    const standard = await secondRaid(made, 2);
+    await made.store.update(standard.id, (party) => ({ party: { ...asRaid(party), gymId: 1 } }));
+    expect(
+      await made.raids.setBoss(made.party.id, alice, {
+        tier: T5,
+        boss: { key: 'yveltal' },
+        label: 'Yveltal (T5)',
+      }),
+    ).toMatchObject({ kind: 'ok', changed: true });
+    expect(
+      await made.raids.setBoss(standard.id, bob, { tier: ELITE, boss: null, label: 'Elite egg' }),
+    ).toMatchObject({ kind: 'ok', changed: true });
   });
 
   it('gives a gym to one of two raids that move there at once', async () => {
@@ -663,7 +708,7 @@ describe('RaidChangeService: the gym, and one raid per gym', () => {
     ]);
     expect(outcomes.map((outcome) => outcome.kind)).toEqual(['ok', 'ok']);
     expect(made.current().gymId).toBe(3);
-    expect(made.store.raidAt(2, 'standard', made.clock.now)).toBeUndefined();
+    expect(made.store.raidAt(1, 2, made.clock.now)).toBeUndefined();
   });
 
   it('may still change a raid that shares its gym already', async () => {
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index f4e3239fa9af10a38bdcf26a97f6ca798f3ba54f..9a5565289f1234988253484d7b3c6ee3cd0e4d61 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -15,17 +15,17 @@ import {
   type Refusal,
 } from '../domain/party/party.js';
 import {
-  blocksNewRaid,
   certainMoves,
   fitMeetingTimes,
-  raidKindOf,
   raidStage,
+  raidStandingAt,
   setBoss,
   setEndTime,
   setGym,
   setHatchedDuration,
   setHatchTime,
   setMoveset,
+  standsAtGym,
   timeConfirmed,
 } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
@@ -502,26 +502,17 @@ export class RaidChangeService {
   }
 
   /**
-   * The other raid that a changed raid would share its gym with, both standing in the way of a
-   * new report there. Undefined when the change makes no difference to that: a raid that already
-   * blocked the same gym as the same kind may be changed whatever else is there.
+   * The other raid that a changed raid would share its gym with, both standing at it
+   * (`raidStandingAt`, of any kind and of its server: plan 8E). Undefined when the change makes no
+   * difference to that: a raid that already stood at the same gym may be changed whatever else is
+   * there (its tier too, standard to elite and back; two raids stored at one gym before plan 8E
+   * both may).
    */
   private inTheWay(before: RaidParty, after: RaidParty, now: number): RaidParty | undefined {
-    const { gymId } = after;
-    if (gymId === null || !blocksNewRaid(after, now)) return undefined;
-    const kind = raidKindOf(after);
-    if (blocksNewRaid(before, now) && before.gymId === gymId && raidKindOf(before) === kind) {
-      return undefined;
-    }
-    return this.options.store
-      .active()
-      .filter(isRaid)
-      .find(
-        (other) =>
-          other.id !== after.id &&
-          other.gymId === gymId &&
-          raidKindOf(other) === kind &&
-          blocksNewRaid(other, now),
-      );
+    const { gymId, guildId } = after;
+    if (gymId === null || !standsAtGym(after, guildId, gymId, now)) return undefined;
+    if (standsAtGym(before, guildId, gymId, now)) return undefined;
+    const raids = this.options.store.active().filter(isRaid);
+    return raidStandingAt(raids, guildId, gymId, now, after.id);
   }
 }
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 3271cddf7d7ea78336b09a370f217a59a1552970..e9b025426e1690a458c97758a922110221d48fdd 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -257,8 +257,9 @@ function wayTo(gym: Pick<MapGym, 'lat' | 'lon' | 'address'> | undefined): PageNo
 
 /**
  * The popup of a gym's one marker: the gym once, with its address line and Directions, then
- * every raid there in the list's order (a standard raid and an elite raid can be at one gym at
- * once), each in a section of its own with its time, counts, buttons and post; then `extras`
+ * every raid there in the list's order (one raid per gym of any kind since plan 8E; two, a
+ * standard and an elite raid, only where both were stored before it), each in a section of its
+ * own with its time, counts, buttons and post; then `extras`
  * ("Report raid" for a member, plan 8M-4).
  */
 export function gymRaidsPopup(
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index e1588605e658f417551d98c620e83210a4db1d20..ce74d6a8e08a295cf0e09af4eea77ef21912b045 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -95,8 +95,8 @@ export function reportButton(gymId: number): PageNode {
 /**
  * "Report raid" in the box a click opens the form in (`report-box`): in a gym's own popup only;
  * a gym that shows a raid offers the raid instead (plan 8M-8A, review N5: `gymWithRaidBoxes`;
- * whether an elite raid may be reported beside a standard one there is a question for Matt in
- * the follow-ups).
+ * one raid per gym of any kind, plan 8E: an elite raid is not reported beside a standard one,
+ * nor the reverse).
  */
 export function reportBox(gymId: number): PageNode {
   return { tag: 'div', className: 'report-box', children: [reportButton(gymId)] };
diff --git a/src/web/raid-change.test.ts b/src/web/raid-change.test.ts
index d9120ab1dc1199774c1fa1d3d7b8384cae01c9df..cb7ba72e704d8238d5b72cd230f84f391f1c17a6 100644
--- a/src/web/raid-change.test.ts
+++ b/src/web/raid-change.test.ts
@@ -23,7 +23,7 @@ import type { RaidAnswer, RaidMovesView } from '../domain/web/raid-options-data.
 import { UNREACHABLE } from './acting.js';
 
 /** What a change answers that would make the raid the kind another raid at its gym is. */
-const GYM_TAKEN = 'That gym already has a raid like this one.';
+const GYM_TAKEN = 'That gym already has a raid.';
 
 const HATCH = at('2026-10-13T14:30');
 const END = at('2026-10-13T15:15');
@@ -242,9 +242,11 @@ describe('changing a raid on the map', () => {
   });
 
   it("answers a refusal of the raid service in the command's words, naming no post the page cannot open", async () => {
-    const map = await changing({ tier: { level: 'Elite', shadow: false } });
+    const map = await changing({ boss: { key: 'yveltal' }, time: { end: at('2026-10-13T14:10') } });
     web = map.web;
-    // A standard raid at the same gym: the elite raid cannot become one.
+    // Over by the clock, then a new raid at the same gym: the first cannot come back beside it.
+    map.made.clock.now = at('2026-10-13T14:12');
+    web.clock.now = at('2026-10-13T14:12');
     const gym = gymsFixture().get(1);
     if (!gym) throw new Error('no gym 1');
     const standard = await map.made.service.reportRaid({
@@ -257,12 +259,12 @@ describe('changing a raid on the map', () => {
     });
     if (standard.kind !== 'created') throw new Error(standard.kind);
     await map.made.service.flush();
-    const refused = await map.post('boss', { boss: 'b:yveltal:T5:0' });
+    const refused = await map.post('end', { time: '2:40pm' });
     expect(refused.status).toBe(422);
     expect(refused.json).toEqual({ ok: false, text: GYM_TAKEN });
     expect(refused.json.text).not.toContain('<#');
     expect(refused.json.text).not.toContain(String(standard.party.forumPostId));
-    expect(map.made.current().raid.boss).toBeNull();
+    expect(map.made.current().endTime).toBe(at('2026-10-13T14:10'));
   });
 
   it("gives the moves of the raid's boss for the form, to members", async () => {
diff --git a/src/web/raid-report.test.ts b/src/web/raid-report.test.ts
index 5d6ba7ee502869fce9019f953449e11493c8a9f2..3c220709c06c8f233dbca327e9bde56c58d9521d 100644
--- a/src/web/raid-report.test.ts
+++ b/src/web/raid-report.test.ts
@@ -189,6 +189,33 @@ describe('reporting a raid on the map', () => {
     expect(map.made.store.active()).toHaveLength(1);
   });
 
+  // Review E6 of plan 8E: one raid per gym, of any kind, on the map as on Discord.
+  it('answers a raid of the other kind at the gym as taken too, both ways', async () => {
+    const map = await reporting();
+    web = map.web;
+    const bob = { ...(await map.web.posting(BOB, 'Bob')), 'content-type': 'application/json' };
+    for (const [gym, first, second, name] of [
+      [1, 'e:Elite:0', 'e:T5:0', 'The Stacks'],
+      [2, 'e:T5:0', 'e:Elite:0', 'Old Stone Fountain'],
+    ] as const) {
+      const made = await map.report({ gym, boss: first });
+      expect(made.json).toMatchObject({ ok: true });
+      const again = await map.web.app.inject({
+        method: 'POST',
+        url: REPORT,
+        headers: bob,
+        payload: JSON.stringify({ gym, boss: second }),
+      });
+      expect(again.statusCode).toBe(409);
+      expect(again.json<RaidAnswer>()).toMatchObject({
+        ok: false,
+        text: `There is already a raid at ${name}. You have been marked as interested.`,
+        raid: { id: made.json.raid?.id },
+      });
+    }
+    expect(map.made.store.active()).toHaveLength(2);
+  });
+
   it('asks which region of a gym that lies in several, and reports into the one picked', async () => {
     const map = await reporting({ gyms: gymsWithBridgeInBoth() });
     web = map.web;
````

### Task 2: 8E docs: one raid per gym, the page built before staging, Cloudflare's beacon

Prototype commit: `ed0c7603e34971ac4fd9730aafe11e277a7407fc`

- parties-and-posts.md: one raid per gym of any kind (Matt, 2026-10-26),
  raidStandingAt and standsAtGym, raids stored before left to their
  clock; web.md: the gym popup lists more than one raid only for those,
  and an elite raid is not reported beside a standard one.
- The staging checklists of 8M-7, 8M-8A and 8M-8B: a step 0, the page
  built with npm run web:build before the bot starts; 8M-8A's two raids
  at one gym made in the dev database.
- web-setup.md: the CSP error of Cloudflare Web Analytics' beacon, and
  how to turn its automatic setup off.
- The staging checklist of 8E.

**Files:**

```
 docs/architecture/parties-and-posts.md                  |  5 +++--
 docs/architecture/utilities.md                          |  2 +-
 docs/architecture/web.md                                |  4 ++--
 docs/superpowers/plans/2026-10-25-phase-8m7-staging.md  |  1 +
 docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md | 13 ++++++++++++-
 docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md |  1 +
 docs/superpowers/plans/2026-10-27-phase-8e-staging.md   | 34 ++++++++++++++++++++++++++++++++++
 docs/superpowers/plans/phase-0-follow-ups.md            |  2 +-
 docs/web-setup.md                                       |  2 ++
 9 files changed, 57 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ed0c7603e34971ac4fd9730aafe11e277a7407fc -- src test docs/architecture docs/web-setup.md docs/superpowers/plans/2026-10-25-phase-8m7-staging.md docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md docs/superpowers/plans/2026-10-27-phase-8e-staging.md docs/superpowers/plans/phase-0-follow-ups.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8E docs: one raid per gym, the page built before staging, Cloudflare's beacon`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 86906116d2323afef1ea4179582621439631537e..91107a6eeea5e9306e0220277eb04d6c4951f25f 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -20,14 +20,15 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 - Commands that act on the party of the post they are used in have the guard `requireParty`; the handler asks `partyOf(interaction, ctx)` again and copes with undefined.
 - A time a member types for an existing raid is read by `typedPartyTime(ctx, party, 'hatch' | 'end' | 'meet', text, now)` (`src/commands/raids/raid-input.ts`); handlers read `Date.now()` themselves (their tests fake only `Date`). A boss with only one fast or one charged move has it set wherever a raid gets its boss (`certainMoves`: report, `/boss`, hatch).
-- The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`), in a dialog since plan 8Q: titled `Move the raid to another region`, today's question with the region's channel named (`#east`, `channelInDialog`; the answers keep their mentions) and `Submit moves it.`; refusals before asking (no such gym, several, a gym with such a raid, none of a region with a forum) stay private replies, and a move within the region asks nothing. The dialog carries the party and the gym (no pending request); its Submit (`locationControls.modal`, `requireGuild`) is acknowledged privately, refused as over (`This raid is over.`) unless the raid it names is the one of the post it is submitted in (`raidOf`), and moves the raid as the service decides then (`raids.setGym`), the answer (`This raid is now at … Its new post is …`) given before the old post closes; a refusal that is none of the member's doing gives back the Submit and the use of `/location` that opened the dialog (`carriesOn`, plan 8S-4: when it was counted is the custom id's last part, `location:<party id>:move:<gym id>:<counted at>`), and a failure after the move was answered is only logged. Command and Submit have no limit of their own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11); the buttons of the question before plan 8Q (`location:<token>:yes|no`) get the router's stale answer.
+- The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`), in a dialog since plan 8Q: titled `Move the raid to another region`, today's question with the region's channel named (`#east`, `channelInDialog`; the answers keep their mentions) and `Submit moves it.`; refusals before asking (no such gym, several, a gym with a raid of any kind, none of a region with a forum) stay private replies, and a move within the region asks nothing. The dialog carries the party and the gym (no pending request); its Submit (`locationControls.modal`, `requireGuild`) is acknowledged privately, refused as over (`This raid is over.`) unless the raid it names is the one of the post it is submitted in (`raidOf`), and moves the raid as the service decides then (`raids.setGym`), the answer (`This raid is now at … Its new post is …`) given before the old post closes; a refusal that is none of the member's doing gives back the Submit and the use of `/location` that opened the dialog (`carriesOn`, plan 8S-4: when it was counted is the custom id's last part, `location:<party id>:move:<gym id>:<counted at>`), and a failure after the move was answered is only logged. Command and Submit have no limit of their own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11); the buttons of the question before plan 8Q (`location:<token>:yes|no`) get the router's stale answer.
 - A `group` option is free text with autocomplete of the groups the raid has (`respondWithGroups`), read by `typedGroup` (`src/commands/parties/reply.ts`); text that is no group is refused, never ignored.
 - Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`: Set time… and Screenshot feedback; Done, the completion question's answers and Meet… are a max battle's too, plan 8X-3), otherwise "This has ended.", also on the map and in Meet…'s refusal
 - Private answers to clicks on a post's controls go through `answerClick` (`ctx.clickAnswers`, `ClickAnswers`): the first click of a member on a party is answered with `reply`, later ones within two seconds are only acknowledged (`deferUpdate`), and the first answer is then edited to the answer of the last click. Only the first interaction of a burst may be given `editReply` (on a `deferUpdate`d click it would edit the post's own message). A refusal is thrown and shown at once. The test context answers every click by itself (window zero).
 
 ## Raids
 
-- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, and staff's `moveBossTier` (plan 8X-J: an `/admin boss add` that moves a boss to another tier of its group moves the running raids through the same `apply`, with no member, so no `noteMember` and no notifier; a raid the move would put in the way of another is left), each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time…" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares; a report that would put the member in a forum somebody keeps them out of (the forum the new raid would go to, or that of an active raid already at the gym, which may stand in another region's forum: `reportBarred`, the map's check too) is refused with `REPORT_BARRED` (plan 8M-6), by `/raid`'s guard before its throttle for a gym typed outright, and once the gym is known (`withGym`) for one chosen from a menu or read from a screenshot (counted then), and again on "Report it there" after the question about a gym of another region (the access may have changed since); a failure of Discord to say propagates. A screenshot posted in a region channel is checked the same way before it is reported, unasked or once its gym is picked (`reportShot`, `screenshots.md`). The check reads `parties.active()` and asks Discord before the report, outside `PartyStore.update`, so when two members report a gym of two regions within moments, the first one's raid may appear in a forum the second's check did not see; the report therefore asks again where it would join a raid already at the gym (plan 8W-3: `RaidReport.mayJoin`, `mayJoinAs` / `mayJoinNoting` of `report.ts`, asked once the raid to join is known, not for the region's own forum, which every caller checked already; inside `PartyStore.update` a raid whose forum is not the one asked about any more is not joined either) and answers `barred` (`REPORT_BARRED`; the map 403, Discord away 503; a screenshot `unknown-access`) without signing them up; such a refusal comes after the throttle, so it counts as a use of `/raid` (on the map too, `raid-report.test.ts`). What is left is a change of the member's own access between that question and the write, as for any check of access. It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
+- **One raid per gym, of any kind** (plan 8E; Matt, 2026-10-26: an elite raid shows its egg on the gym, usually from the evening before, so it blocks a standard raid there, and a standard raid blocks an elite one; EX raids once coexisted with normal ones, elite raids do not). The rule is `raidStandingAt(raids, guildId, gymId, now, except?)` over `standsAtGym(raid, guildId, gymId, now)` (`src/domain/party/raid.ts`: a raid of the server at the gym and `blocksNewRaid`, whatever its tier), and nothing else decides it: `PartyStore.raidAt(guildId, gymId, now)` (every report through `addRaidUnlessTaken`, with the reported party's `guildId`: `/raid`, screenshots, the map's `POST /api/raids`, `relocate`; and `/location`'s refusal before its dialog) and `RaidChangeService`'s check of a change of gym, tier or times (`gym-taken`; a raid that already stood at the gym may be changed whatever else is there, its tier from standard to elite and back included). A raid stands at a gym for its server only (review E7, as `maxAt`): a gym that two servers share takes a raid in each, though the gym's lock (`withGymLock`) stays one per gym. A report that meets a raid of the other kind joins it as one of another tier does (`exists`, the automatic status; nothing of the report, tier, boss or times, is applied to it). Raids are not compared by kind (`raidKindOf`) for this anywhere; `raidKindOf` serves the durations only. Two raids stored at one gym before plan 8E (a standard and an elite) are left as they are: each runs out by its clock and may still be changed at its own gym, and `raidAt` answers the older (`active()` is oldest first); the map's gym popup lists more than one raid only for them (`web.md`).
+- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, and staff's `moveBossTier` (plan 8X-J: an `/admin boss add` that moves a boss to another tier of its group moves the running raids through the same `apply`, with no member, so no `noteMember` and no notifier; a raid the move would put in the way of another is left, which since plan 8E cannot happen for a raid: only a running raid moves, `blocksNewRaid`, and a running raid stands at its gym already, so the `in-the-way` count stays only as a guard), each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time…" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares; a report that would put the member in a forum somebody keeps them out of (the forum the new raid would go to, or that of an active raid already at the gym, which may stand in another region's forum: `reportBarred`, the map's check too) is refused with `REPORT_BARRED` (plan 8M-6), by `/raid`'s guard before its throttle for a gym typed outright, and once the gym is known (`withGym`) for one chosen from a menu or read from a screenshot (counted then), and again on "Report it there" after the question about a gym of another region (the access may have changed since); a failure of Discord to say propagates. A screenshot posted in a region channel is checked the same way before it is reported, unasked or once its gym is picked (`reportShot`, `screenshots.md`). The check reads `parties.active()` and asks Discord before the report, outside `PartyStore.update`, so when two members report a gym of two regions within moments, the first one's raid may appear in a forum the second's check did not see; the report therefore asks again where it would join a raid already at the gym (plan 8W-3: `RaidReport.mayJoin`, `mayJoinAs` / `mayJoinNoting` of `report.ts`, asked once the raid to join is known, not for the region's own forum, which every caller checked already; inside `PartyStore.update` a raid whose forum is not the one asked about any more is not joined either) and answers `barred` (`REPORT_BARRED`; the map 403, Discord away 503; a screenshot `unknown-access`) without signing them up; such a refusal comes after the throttle, so it counts as a use of `/raid` (on the map too, `raid-report.test.ts`). What is left is a change of the member's own access between that question and the write, as for any check of access. It decides inside the store under the locks of the gyms concerned, refuses a change after which the raid would stand at a gym where another raid of its server stands (`raidStandingAt`, plan 8E), moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - The post of an egg shows the game's egg (`raidEggName`, `src/domain/pogo/raid-eggs.ts`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture, the boss it names and where Where says it is (`place`: the gym's name as the post shows it, its point and address line; plan 8M-6), decided as for the post. The pictures are square (plan 8D-F, Matt, 2026-10-17: PokeMiners' icons are 112 by 128 and a phone crops a thumbnail to a square, cutting the egg's bottom off): `scripts/eggs/make-eggs.ts` (`npm run eggs:make`, the one step that downloads them, from `RAID_EGG_PICTURES_URL`'s pinned commit) padded each with transparency to a square of its longer side, the egg centred and unscaled, into `pictures/eggs/`, which is committed and in the image; nothing is fetched at run time, and `settings.raidEggPicturesUrl` is retired (`RETIRED_SETTINGS`). `EggPictures` (`src/services/egg-pictures.ts`, `PartyServiceOptions.eggPictures`) says where a post takes one from: once the web server listens (`src/app.ts` calls `serving()`, through `picturesServed` of `src/app-wiring.ts` with the pictures of the stops, when `startWebServer` answered true, so a port it could not take leaves the files) with `settings.web` at a public address that is not this machine's, the bot's own web server (`<publicUrl>/eggs/<name>.png?v=<8 hex>`, the start of the file's SHA-256, so that a cached picture never hides an egg made again; `web.md`); otherwise, and until then, the message carries the file and shows it as `attachment://<name>.png` (`RaidPostView.eggFile`, `PostLayout.pictureFile`, `PartyBrief.pictureFile`). Every post message says which files it has (`files`, `[]` when none: `postMessage`), and an edit that says so replaces the files the message had (`editAs` sends `attachments: []` and the files uploaded again; a conversion sends them through the REST route with `attachments` by index, `uploadsOf`), as Discord documents it: an edit keeps only the attachments it names. So the egg's file is uploaded again with every edit while it is an egg (some 22 KB), and the edit at hatch takes it away. A copy in another channel and the direct message's brief carry the same file. Where the bot may not attach files Discord answers Missing Permissions (50013), not Invalid Form Body: `isRefusedFile` (`src/discord/party-gateway.ts`, over `looksLikeRefusedFile`: 50013, 50035, 40005 or an error of reading the file, for a message that carries files) has a post, its edit and a copy sent once more without the file (`PostVariant.files: false`: the egg left out, pictures by address kept; `postForms`, `sendInForms`, `src/services/refused-files.ts`), and then in its other forms if Discord refuses one (`FormTrail`, below the controls); once a form without the file goes through (also one that needed plain emoji or no pictures as well), the forum, the post or the channel of copies is remembered for ten minutes (`RefusedFiles`, shared by `PartyService` and `PartyMirrors`), so that its next messages go without the file at once, with no refused call and no warning each time; a post made by its line of text after the first way had its file refused edits the line in without the file at once. Invalid Form Body is never noted as refused files (when a post is made it is taken as a refused first message; an edit or a copy refused so may have been refused for what it holds): only another refusal of the file is.
 
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 37f1e7d7841024a66a22c4fb683934479b533580..bd59fd0294b73b18f7ed2cd402c3f2c4233c202a 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -23,7 +23,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Raid bosses come from `ctx.raidBosses` (`bosses()`, `bossesOf(tier)`, `autoset(tier)`): the feed's list (`settings.raidBosses`, synced into the `RaidBoss` table by `RaidBossService`) with the moderators' overrides (`RaidBossOverride`) applied. A boss newer than the game master has no catalogue entry (`entry` is undefined): show its `name`. The legacy `Pokemon.tier` / `exclusive` / `mega` / `elite` / `shiny` columns and `AutosetPokemon` are never read. The feed is ScrapedDuck's `raids.json` (Leek Duck's raid boss page as data): a boss is a display name, a heading text and a picture address, and `matchBoss` (`src/domain/pogo/raid-boss-feed.ts`) gives it a catalogue entry only when the picture's file name (`pm<dex>.f<FORM>.icon.png`) and the name do not contradict each other; otherwise it stays unresolved (listed by the feed's name, without stats), never the wrong Pokémon. `raid-boss-sweep.test.ts` checks every entry of the catalogue; a heading Pine does not know is reported, its bosses left out. `npm run raid-bosses:check` shows how the live feed is read. A boss of the list in effect is `costumed` (plan 8R-4) when a feed row of it in its tier is by `isCostumed` (its name, picture and ids; `RAID_OPS.costumed`), an override by its ids alone; a costumed and a plain row of one tier are one boss, costumed; never a max boss (`MAX_OPS` has no `costumed`). `shownBoss` copies it from the boss of the raid's own tier only (`ShownBoss.costumed`), never from another tier's.
 - Staff change the raid boss list only through `ctx.raidBossAdmin` (`RaidBossService` as `RaidBossAdmin`: overrides, `feedBosses()`, `sync()`; override writes and the end of a sync run one at a time). A sync's change is `FeedChange` with `seen`, the difference of `effectiveBosses` before and after with the same overrides (`diffBosses`, `src/domain/pogo/boss-diff.ts`): what members see. `RaidBossAnnouncer` posts `seen` in every server's bot-updates channel when `settings.raidBosses.announceChanges`, and the out-of-date warning (time, never the error) in the moderators' channel; nothing before `ready()`, nothing after `close()`. A failed sync has a `kind` (never show `reason`). A new autoset for a tier replaces the tier's earlier one. A boss the game data does not know has a key starting with `UNKNOWN_KEY_PREFIX` (`~`), never equal to a catalogue key and never stored; `howIdentified` says how a feed boss was matched.
 - Both boss lists are one machine with two families (plan 8X-2): `BossFeedService<T>` (`src/services/boss-feed-service.ts`: the stored list at start, the first read when it is older than the refresh, retries, the out-of-date warning, override writes one at a time) with a `BossFeedFamily` (its noun in the log, its parser, its list in effect, its override rules); `RaidBossService` and `MaxBossService` are its families. The list rules (`familyBosses`, `familyOverrideKeys`, `familyReport`, `diffFeedIn`, `diffBossesIn`) take the family's tier operations (`RAID_OPS`, `MAX_OPS`); `effectiveBosses`, `bossReport` and the rest keep their raid signatures. The tables are kept apart per family by their levels (`RaidBossRepository`: every level but the max tiers, so the retired EX level stays the raids' to report; `MaxBossRepository`: `MAX_TIERS`): every read and write filters by the family, and an override without a tier (a shiny one for every tier) is a raid override.
-- **An add moves its boss** (plan 8X-J, design `2026-10-25-max-boss-tier-fix-design.md`): a boss has one tier at a time within a group of tiers, `BossFamilyOps.oneTierAmong` (`MAX_OPS`: `dynamax` for D1 to D5, none for G; `RAID_OPS`: `plain` for T1, T3, T5 and Elite, `shadow` for the shadow tiers, none for the mega tiers). One rule, `tierMoves` (`src/domain/pogo/raid-bosses.ts`), read by `familyBosses` and `familyReport`: the feed's slot of a boss at a tier is left out when the boss has an `add` or `autoset` in force at another tier of the group that no `hide` of the add's own tier cancels, and no add of its own at the feed's tier (two adds of one boss in a group both stay); a costume is a boss of its own (a costumed add moves nothing, a costumed slot is never left out). It is applied after the adds and before the hides; the boss at the add's tier is shiny when the add or a moved row says so. The implied hide lasts as long as the add (`/admin boss remove` brings the feed's tier back); there is no new override row. The max list works the moves out over the whole feed, begun and upcoming (`FamilyView`: `maxBossesAt` lists the begun rows, `comingMaxBosses` the upcoming ones without the adds), so an upcoming row of a moved boss does not come back; `/admin boss list`'s Coming reads `coming()`. `familyReport` gives each add its `moved` tiers (the add's answer "The feed lists it at Dynamax 1★: that one is left out while this lasts.", the list's "moves it from Dynamax 1★"), and marks an add "the feed lists it now" only when the feed lists it at its tier and at no other tier of its group (a costume's tier not counted, review J7). An `autoset` moves as an add does and says the same (review J2). The answer also names a hide in force of the boss at a tier the add leaves out as no longer needed, only when the add moves (review J3). Running battles move with the add (Matt's answer 4): after an add or autoset whose `moved` is not empty, `ctx.bossMoves` (`BossTierMoves`, `src/services/boss-tier-moves.ts`) changes every active party of every server (`PartyStore.active()`; the boss list is the installation's, review J5) that `bossTierMoved` (`src/domain/party/boss-move.ts`, pure: a max battle or a raid of the boss, by key, or for a boss the game data lacks by the names the list had for it at the moved-from tiers, `ReportedOverride.movedNames`, review J6; at a moved-from tier, its end still ahead; a max battle keeps its end and `bossSince` through `setMaxBoss`, a raid its moves through `setBoss`; the same object otherwise) changes. A max battle goes through `PartyStore.update`; a raid through `RaidChangeService.moveBossTier` (review J1), under the rules of every raid change (the gym's lock, meeting times fitted, an egg again releasing the asked, a move to Elite working its times out again), and one that would then stand in the way of another raid at its gym (`gym-taken`) is left at its tier and counted apart. Each post is shown anew and told "Staff moved **Dynamax Sneasel** to 2★." (no ping, no DMs, no notifier); the answer counts them ("2 battles running were moved.", "1 raid running was left at its tier: …"). Removing the add or its expiry does not move them back (`/boss` fixes one battle).
+- **An add moves its boss** (plan 8X-J, design `2026-10-25-max-boss-tier-fix-design.md`): a boss has one tier at a time within a group of tiers, `BossFamilyOps.oneTierAmong` (`MAX_OPS`: `dynamax` for D1 to D5, none for G; `RAID_OPS`: `plain` for T1, T3, T5 and Elite, `shadow` for the shadow tiers, none for the mega tiers). One rule, `tierMoves` (`src/domain/pogo/raid-bosses.ts`), read by `familyBosses` and `familyReport`: the feed's slot of a boss at a tier is left out when the boss has an `add` or `autoset` in force at another tier of the group that no `hide` of the add's own tier cancels, and no add of its own at the feed's tier (two adds of one boss in a group both stay); a costume is a boss of its own (a costumed add moves nothing, a costumed slot is never left out). It is applied after the adds and before the hides; the boss at the add's tier is shiny when the add or a moved row says so. The implied hide lasts as long as the add (`/admin boss remove` brings the feed's tier back); there is no new override row. The max list works the moves out over the whole feed, begun and upcoming (`FamilyView`: `maxBossesAt` lists the begun rows, `comingMaxBosses` the upcoming ones without the adds), so an upcoming row of a moved boss does not come back; `/admin boss list`'s Coming reads `coming()`. `familyReport` gives each add its `moved` tiers (the add's answer "The feed lists it at Dynamax 1★: that one is left out while this lasts.", the list's "moves it from Dynamax 1★"), and marks an add "the feed lists it now" only when the feed lists it at its tier and at no other tier of its group (a costume's tier not counted, review J7). An `autoset` moves as an add does and says the same (review J2). The answer also names a hide in force of the boss at a tier the add leaves out as no longer needed, only when the add moves (review J3). Running battles move with the add (Matt's answer 4): after an add or autoset whose `moved` is not empty, `ctx.bossMoves` (`BossTierMoves`, `src/services/boss-tier-moves.ts`) changes every active party of every server (`PartyStore.active()`; the boss list is the installation's, review J5) that `bossTierMoved` (`src/domain/party/boss-move.ts`, pure: a max battle or a raid of the boss, by key, or for a boss the game data lacks by the names the list had for it at the moved-from tiers, `ReportedOverride.movedNames`, review J6; at a moved-from tier, its end still ahead; a max battle keeps its end and `bossSince` through `setMaxBoss`, a raid its moves through `setBoss`; the same object otherwise) changes. A max battle goes through `PartyStore.update`; a raid through `RaidChangeService.moveBossTier` (review J1), under the rules of every raid change (the gym's lock, meeting times fitted, an egg again releasing the asked, a move to Elite working its times out again), and one that would then stand in the way of another raid at its gym (`gym-taken`) is left at its tier and counted apart (since plan 8E only a guard: only a raid not over by the clock moves, `blocksNewRaid`, and it stands at its gym already). Each post is shown anew and told "Staff moved **Dynamax Sneasel** to 2★." (no ping, no DMs, no notifier); the answer counts them ("2 battles running were moved.", "1 raid running was left at its tier: …"). Removing the add or its expiry does not move them back (`/boss` fixes one battle).
 - A Pokémon as the boss of a raid of a tier is `bossAtTier(entry, tier, bosses)` (`src/domain/pogo/boss-at-tier.ts`; Matt, 2026-10-25: every surface decides a domain fact with the code the commands use): `listed` (the list has it in that tier), `unlisted` (the list does not have it: that Pokémon at that tier), `other-shadow-kind` (listed in that level as the other shadow kind), `listed-elsewhere` (listed in another level; the list is right), `not-a-mega` (a Mega or Mega Legendary raid takes a mega form only). `/raid` reads a tier typed before a name by it (`reportedWithTier`, its refusals worded there), and so does the screenshot reader for a boss the list does not have (`screenshots.md`).
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended; the max events are kept in the database since plan 8X-F (`MaxEvent`, below), an ended one while it started less than eight days ago, so only a restart later than that offers the boss again until Pokebattler drops it (step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 809ca6806b6a658b3eb2dd2017766113db90a537..2b60c309f1e497cc047bac50b3b34ebc4599a3db 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -60,7 +60,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; since plan 8M-8A the menu is in the member's part under the post, and Group… goes to it for a newcomer to several groups; since plan 8M-8B Group… is the map's form for anybody else, below, "The post's controls as forms"); since plan 8M-8B also `count` (+1 and −1 may be pressed: never while read-only), `asked` (`{ until, word }`, the completion question to the member it asked: `CompletePending` and its `pendingUntil`, the party named by `partyWord`; not while read-only) and `regroup` (Group…'s choices, its refusal, or `{ onlyNewGroup }` where a new group is the only way, review W-1; `regroupOnTheMap`; absent for a party without groups and while read-only); every party's `mayReport` (Report…, for a member who sees its forum on Discord: `PartyViewers` says the forums they cannot see by their roles as `hidden`, review W-7; never while read-only); for a raid also `mayChange`, whether the member may change it on the map: Discord's rule (Matt, plan 8M-8B, X5: anybody in the post may set the hatch, the end and the boss), so anybody the map shows the raid to, which leaves out who is barred from its forum: `!readOnly` (plan 8M-4's `mayChangeRaid`, signed up or staff, is gone). For staff (`PartyViewInput.staff` from the directory's `standing` by `isMapStaff`) the view gives each party's `close` (`{ mayDelete, forum, word }`, staff's Delete…, the party named by `partyWord`: `PartyService.mayDeletePost` through `PartyWebDeps.closing`, the forum named `#name`, `forumOnTheMap`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. The list names nobody (attendees are counts); each party carries `postKey`, the key of its post as last shown (plan 8M-8A, below, "A party's popup is its post"), whose view names attendees, the reporter and the maker exactly as the post does, to the same members (Matt's ruling, 2026-10-25: the map is an extension of Discord, never a contradiction of it). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote), `more` and `less` (plan 8M-8B, `MAP_COUNTS`, no body: the post's +1 and −1, `changeNumber`, a newcomer's +1 signing them up as interested, answered in `moreWords`) and `answer` (plan 8M-8B, `MAP_ANSWER`, body `{ yes }`, required: the completion question's "Yes, done" and "Not yet", `AttendanceService.answer`); any other action 404, a body other than an optional group letter with those three, or other than `{ yes }` with `answer`, 400 (`pressOf`, strict). Since plan 8M-8B `pressStatus` carries +1, −1 and the answer too, so the post's buttons call it for them as the map does. Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the reader's own zone (`clockTime` over `readerZone()`, plan 8M-8A; the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there (one since plan 8E, which allows one raid per gym of any kind; a standard and an elite raid alike only where both were stored before it), each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the reader's own zone (`clockTime` over `readerZone()`, plan 8M-8A; the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
 ## A party's popup is its post (plan 8M-8A)
 
@@ -112,7 +112,7 @@ Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "Aft
 - **The pick lists** `GET /s/<guild>/api/raid-options` (members, as `/api/parties`; 30 a minute per address): `raidOptions` (`src/web/raid-options.ts`, pure; types in `src/domain/web/raid-options-data.ts`, which imports no server code): the current bosses in the boss list's order, each with the value its choice of `/raid` has (`bossChoiceValue`: `b:yveltal:T5:0`; `/raid`'s own list uses it too, and `reportedBoss` reads it back), then an egg of every tier (`eggChoiceValue`, `e:T5:0`), tiers in the posts' words (`raidWords`), the posts' zone; nothing of gyms (no elite raid gym mark). An ETag of its JSON, `private, no-cache`, 304. A raid's moves `GET /s/<guild>/api/raids/<id>/moves` (members; the same limiter as the pick lists; an active raid of the server, 409 otherwise; its forum by `memberAccess` as a change asks it, `barred` 403, Discord unreachable 503; 422 without a boss whose moves are known): `bossMoves`, the moves of the boss the post shows, by id and name, as `/moveset` lists them.
 - **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum (`reportBarred`, `src/commands/raids/report.ts`, the check `/raid` makes too, plan 8M-6): `barred` from any of them 403 `{ error: REPORT_BARRED }`, "You cannot report a raid at this gym: you are kept out of the forum its raid would be in.", Discord unreachable 503 (a known limit, as for `/raid`: the check runs before `reportRaidAs`, outside `PartyStore.update`, so a raid another member reports at a gym of two regions moments earlier may appear in a forum that bars this member between the check and the report, which then joins it); only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is, one line per report once who reports is known, a refusal too (plan 8S-3): `{ user, guild, gym, outcome }`, "a raid was reported on the map", the outcome the report's kind (`created`, `exists`, `no-post` …) or what refused it (`no-gym`, `several-regions`, `barred`, `unreachable`, `throttled`, `refused` for `/raid`'s readers), never the text.
 - **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403; anybody else may change it, as anybody in its post may on Discord: Matt's ruling, plan 8M-8B, X5, which took out 8M-4's `mayChangeRaid` and its 403); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. `/moveset` falls under the same rule. Provisional (C1, Matt to confirm): "in the post" on the map is anybody the map shows the raid to and who is not barred, as Join already crosses region roles (spec 2.5). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
-- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, only: since plan 8M-8A a gym that shows a raid offers the raid, with "Report spawn here" and "Meetup here" under it (`gymWithRaidBoxes`, review N5); whether an elite raid may be reported beside a standard one there is a question for Matt in the follow-ups), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go, and so are a gym's raid choices, which draw the popup or phone card anew (`chooseRaid` does nothing while a form is open, review W-3); once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise. A click in a popup stays in it (`keepClicksInPopup`, `raid-forms.ts`, on the map's `popupopen`, a listener on the popup's element that stops the click): Leaflet 1.9 leaves a click in a popup alone only by walking up from the click's target to the popup when the click reaches the map (`Map._isClickDisabled`), and a control that takes its own button out of the page as it is clicked (Manage… drawing the Manage train panel in its place; Cancel of the report, change and spawn forms putting the popup's buttons back) left nothing to walk up from, so Leaflet took the click for the map's and closed the popup (staging of the web map plans, 2026-10-18; tested with a model of Leaflet's rule in `train-ui.isolated.test.ts`). Cancel therefore puts the popup's buttons back and lets the hold go, the popup open; a popup closed with a form in it lets its form go (`popupClosed`).
+- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, only: since plan 8M-8A a gym that shows a raid offers the raid, with "Report spawn here" and "Meetup here" under it (`gymWithRaidBoxes`, review N5); an elite raid is not reported beside a standard one, nor the reverse: one raid per gym of any kind, plan 8E, `parties-and-posts.md`), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go, and so are a gym's raid choices, which draw the popup or phone card anew (`chooseRaid` does nothing while a form is open, review W-3); once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise. A click in a popup stays in it (`keepClicksInPopup`, `raid-forms.ts`, on the map's `popupopen`, a listener on the popup's element that stops the click): Leaflet 1.9 leaves a click in a popup alone only by walking up from the click's target to the popup when the click reaches the map (`Map._isClickDisabled`), and a control that takes its own button out of the page as it is clicked (Manage… drawing the Manage train panel in its place; Cancel of the report, change and spawn forms putting the popup's buttons back) left nothing to walk up from, so Leaflet took the click for the map's and closed the popup (staging of the web map plans, 2026-10-18; tested with a model of Leaflet's rule in `train-ui.isolated.test.ts`). Cancel therefore puts the popup's buttons back and lets the hold go, the popup open; a popup closed with a form in it lets its form go (`popupClosed`).
 - **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains are 8M-5 (below), meetups 8M-5M; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
 
 ## Spawns on the map (plan 8M-4S)
diff --git a/docs/superpowers/plans/2026-10-25-phase-8m7-staging.md b/docs/superpowers/plans/2026-10-25-phase-8m7-staging.md
index d9b0a1c3e930f20eea5e319ff25e3674b0dce998..ea2ec11a83fe0ce7cc177fdd7c0c2e940b5e7d57 100644
--- a/docs/superpowers/plans/2026-10-25-phase-8m7-staging.md
+++ b/docs/superpowers/plans/2026-10-25-phase-8m7-staging.md
@@ -10,6 +10,7 @@ Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude dri
 
 ## Before
 
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
 1. **No migration, no command option change:** no deploy needed. The settings:
    - `settings.web.publicUrl` is `https://dev.example.com`, the tunnel `pine-dev` runs, and Stadia Maps has `dev.example.com` (or `profpine.com`) registered.
    - `settings.web.tiles` is left out (the default `'stadia'`).
diff --git a/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md b/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md
index 40bc95bb7fbfacf0e226cbc4ce4e00ca18d5950c..13f240e7fc01dbfce1d30cbae6276eafb4194c49 100644
--- a/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md
+++ b/docs/superpowers/plans/2026-10-26-phase-8m8a-staging.md
@@ -11,8 +11,19 @@ Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude dri
 
 ## Before
 
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
 1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs. The application's emoji are uploaded (`npm run emoji:upload` was run before; nothing new here).
-2. **Parties to see:** Googer reports a hatched raid with its boss at a gym with a Wayfarer picture and an egg at another; Tester joins the hatched one with a +1 and Remote. A raid from a screenshot whose time is a guess (an old screenshot through `/raid screenshot:`). A max battle at a Power Spot. A train with five stops at its second, and a group split off it (`Split…` on Discord) so that one post links the other. A meetup at a dropped pin. Two raids at one gym (a standard and an elite one).
+2. **Parties to see:** Googer reports a hatched raid with its boss at a gym with a Wayfarer picture and an egg at another; Tester joins the hatched one with a +1 and Remote. A raid from a screenshot whose time is a guess (an old screenshot through `/raid screenshot:`). A max battle at a Power Spot. A train with five stops at its second, and a group split off it (`Split…` on Discord) so that one post links the other. A meetup at a dropped pin. Two raids at one gym (a standard and an elite one): since plan 8E a gym takes one raid of any kind, so make the pair as raids stored before plan 8E are. On the **dev database only**: report the elite raid at another gym of the same region, stop the bot, find the two raids' ids and gyms, then move the elite raid to the standard raid's gym (the dev container's MySQL user and schema are both `pine`; the password is asked for):
+
+   ```
+   docker exec -it pine-dev-mysql mysql -u pine -p pine -e "select id, gymId, json_unquote(json_extract(state, '$.raid.tier.level')) as tier from Party where status = 'active' and type = 'raid'"
+   ```
+
+   ```
+   docker exec -it pine-dev-mysql mysql -u pine -p pine -e "update Party set gymId = <the standard raid's gymId> where id = '<the elite raid's id>'"
+   ```
+
+   Start the bot again. It draws every post anew: the elite raid's post's Where names the standard raid's gym. Its title (`Elite egg · <gym>`) follows when the post is drawn anew; Discord allows two renames in ten minutes, so a title that still names the old gym is renamed at a later redraw (a `/hatch` in the post draws it at once): no finding while the Where is right.
 3. **After a restart:** the bot shows every post anew, paced, after the first good read of the application's emoji, whatever it found (also with no emoji uploaded); for the first seconds a popup is the map's own summary (no post yet), then the post. Where that first read failed (Discord away at the start), the posts are shown anew only at the next good read, the hourly upkeep: until then the popups are the map's summaries.
 
 ## The post on the map (desktop)
diff --git a/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md b/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md
index 47ea79f75bdd108a98a40738225d3a653191e643..ca5a33f2a088acc7b71c169f20dfeecb7a981d2a 100644
--- a/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md
+++ b/docs/superpowers/plans/2026-10-26-phase-8m8b-staging.md
@@ -11,6 +11,7 @@ Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude dri
 
 ## Before
 
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
 1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs.
 2. **Parties:** Googer reports a raid with times (an egg hatching in 20 minutes) and a hatched raid; Tester joins the hatched one; a second group on it (Googer: Group… → a new group on Discord, label "by the fountain"). A train and a meetup at a pin. No moderators' channel at first (`settings.channels.moderation` unset), then with it (step 22).
 3. **The view's version:** a page opened before the deploy keeps its posts by their old keys; after the deploy every post is asked for anew once (the view's version and the table `CONTROLS` are in every key: the network tab shows `post?k=` with new keys).
diff --git a/docs/superpowers/plans/2026-10-27-phase-8e-staging.md b/docs/superpowers/plans/2026-10-27-phase-8e-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..8cf70a36464e5258b79736d06fa117c5f3b2817d
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-27-phase-8e-staging.md
@@ -0,0 +1,34 @@
+# Phase 8E staging checklist: an elite raid blocks its gym
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab.
+
+- **Accounts:** Googer (owner, staff) and Tester (a member).
+- **Brief:** `.superpowers/sdd/2026-10-27-phase-8e-elite-blocks-gym/design.md`.
+- **Ruling:** one raid per gym, of any kind (Matt, 2026-10-26: an elite raid shows its egg on the gym, usually the evening before).
+- **Conventions:** `docs/architecture/parties-and-posts.md` ("Raids", the first point).
+- **Gyms:** three gyms of one region, A, B and C, none of them with a raid, and a gym D of another region.
+
+## Before
+
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup (2026-10-26: a bot started without it served the page of before 8M-7).
+1. **No migration, no command option change:** no deploy needed. `/location`'s changed sentence is its `/help` text, not its slash-command description.
+2. **Tester's automatic status** is Interested (`/settings`), so that a join is visible in the post.
+
+## Reports at a gym that has a raid of the other kind
+
+3. **`/raid`, elite where a standard raid stands.** Googer: `/raid` a T5 egg at A with a hatch time. Tester: `/raid` an Elite egg at A with another hatch time. The answer: "There is already a raid at A. Its post is #…. You have been marked as interested." No second post; A's post is still a T5 egg with Googer's hatch time, and Tester is in it as interested.
+4. **`/raid`, standard where an elite raid stands.** Googer: `/raid` an Elite egg at B. Tester: `/raid` a T5 boss at B with an end time. The same answer for B; B's post is still an Elite egg, its times unchanged, no boss named.
+5. **A screenshot, elite at A.** The reader takes the gym from the picture, so A is the gym the elite screenshot at hand shows: pick A that way before step 3 (or use `/raid screenshot:` with the screenshot and `gym:` A typed). The screenshot is posted by a third account that is not in A's raid yet (Tester joined it in step 3, and a member already in the raid is told nothing new); without a third account, Tester leaves A's raid first. Posted in the region's channel (mention or passive reading), or through `/raid screenshot:`: the reply "There is already a raid at A: #…. You have been signed up for it." A's post stays a T5 egg with Googer's hatch time.
+6. **A screenshot, standard at B** (when a standard screenshot of B's gym is at hand, or with `/raid screenshot:` and `gym:` B typed; again a member not in B's raid): the same for B, which stays an elite egg.
+7. **The map.** A's and B's popups show their raid and no "Report raid". Open "Report raid" at C on the map, then report an Elite egg at C on Discord, then send the map's form (a T5 egg): the answer under the form is "There is already a raid at C. …", the form closes and C's popup shows the elite raid; no second raid at C on Discord.
+
+## Changes into a taken gym
+
+8. **`/location` within the region.** In C's post, `/location gym:A`: "That gym already has a raid. Its post is #…."; the raid stays at C.
+9. **`/location` to another region.** Report a raid at D (an elite one), then in A's post `/location gym:D`: refused at once in the same words, no dialog.
+10. **A tier change at its own gym goes through.** In A's post, `/boss pokemon:` and pick "Elite egg" from the list: A's raid becomes an elite egg (its title `Elite egg · A`), its times worked out again; nothing is refused. Then `/boss pokemon:` "T5 egg": back to a standard raid.
+11. **`/help location`:** "The gym must not have a raid already. …"
+
+## After
+
+12. End the raids of the test (`/delete` or let them run out).
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index b58b1110393fd3c4399c1006c5ea9b82cb178261..57d836072fd4c946b88ca40173c84cca991a07f4 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -2502,7 +2502,7 @@ Main checkout at typescript-migration a1e7cd28, `settings-8xs.json` (passive rea
 
 ## From Phase 8M-8A (a party's popup is its post; prototype, 2026-10-26)
 
-- **Question for Matt (review N5):** the design says a gym that shows a raid offers the raid, not "Report raid", so the map no longer offers "Report raid" under a gym's raids. Before 8M-8A it did, since an elite raid can be beside a standard one at the same gym. Should the map offer a way to report the second raid there (and how), or is `/raid` on Discord enough for that rare case?
+- **Question for Matt (review N5):** the design says a gym that shows a raid offers the raid, not "Report raid", so the map no longer offers "Report raid" under a gym's raids. Before 8M-8A it did, since an elite raid can be beside a standard one at the same gym. Should the map offer a way to report the second raid there (and how), or is `/raid` on Discord enough for that rare case? **Answered:** Matt's ruling of 2026-10-26 and plan 8E: one raid per gym, of any kind (an elite raid shows its egg on the gym, usually the evening before), so there is no second raid to report there, on the map or on Discord; the map offering none is right.
 - **Built (closed 2026-10-26):** the plan's seven tasks (transcribed, each equal to its prototype commit; the brief went through an Opus builder check, the prototype an Opus review and a scoped re-review with two fix rounds), then the whole-branch review's six Minor fixes W-1 to W-6 (the places' pictures in a folder of their own, their keys looked up on a miss, a raid choice leaving a held form alone, a section's button drawn, the page forgetting ended parties' posts, the phone card named by its party).
 - **Staging:** `2026-10-26-phase-8m8a-staging.md`, not yet run (with 8M-7's; needs the tunnel and a phone).
 - **Next:** 8M-8B (the post's controls as web forms: Group… to choose or move, Meet…, +1s, the raid's changes under Discord's rule, staff's delete, Report to moderators, the completion question), then 8M-8C (Split…, Manage… beyond the conductor and kind, the drag-to-reorder route editor). Matt's icon notes ("From Phase 8M-7") start with 8M-8B's buttons and 8M-9's Report menu.
diff --git a/docs/web-setup.md b/docs/web-setup.md
index 8e9fb55ddd1fd747369a3f2a0d5a6915f9ec8ae4..3dcfcdfac8d7156c16a7f33596a3b5901b269392 100644
--- a/docs/web-setup.md
+++ b/docs/web-setup.md
@@ -46,6 +46,8 @@ Pine does not open ports or talk to your router. Pick one:
 
 Whichever you pick, check once that it sends the visitor's address. Pine logs no addresses, so ask for `<publicUrl>/auth/login` 21 times within a minute from one place, then once from another network (a phone without Wi-Fi). If the second is refused too ("Too many requests"), the tunnel sends no `X-Forwarded-For` and every visitor shares one limit.
 
+With Cloudflare, the browser's console may show that a script from `static.cloudflareinsights.com` (`beacon.min.js`) violates the Content Security Policy. That is Cloudflare Web Analytics, whose automatic setup is on for the domain and adds its script to every page. Pine's Content Security Policy blocks it on purpose, and nothing on the page breaks. To stop it, open Web analytics in the Cloudflare dashboard's account home (under Analytics & Logs, or Observability → Analytics), choose Manage site for the domain and set Automatic setup to Disable. The change can take a few minutes to reach every server.
+
 ## 4. Map tiles
 
 The map shows Stadia Maps' Alidade Smooth (light) and Alidade Smooth Dark (dark) by default, with no key: for a website Stadia checks the page's domain, so a key in the page would add nothing (anybody can read a page's key). Pine sends its origin with each tile request (its `Referrer-Policy` is `strict-origin-when-cross-origin`).
````

## After the last task

- [ ] `npm run check > var/8e-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff ed0c7603e34971ac4fd9730aafe11e277a7407fc HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
