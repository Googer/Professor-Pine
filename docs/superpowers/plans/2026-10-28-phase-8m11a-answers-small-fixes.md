# Phase 8M-11A: The Web Map's Fix Pass, Answers and Small Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the first plan of the web map's fix pass. A press on the map answers once its post shows the change (S1). Answers appear where the member is looking. The staging's small fixes and wordings are closed, and the Report menu gets Matt's icons.

- **Task 1:** S1. `PartyService.drawTicket`/`shown` count the changes in memory and the draws that read them; `src/web/post-drawn.ts` (`PRESS_SHOWN_MS` 5,000, `shownAfter`). Every party-changing web route waits for the post after its change, up to the cap; a refusal waits for nothing.
- **Task 2:** S9, S20, S21: the answer line (`press-answer.ts`), kept 10 s across redraws, and a shake on a refusal. Also:
  - the note box "Open the post on Discord";
  - the completion question above the buttons;
  - Meet… closing like Group…, with `meetSubmitRefusal`'s "Group B has changed since: press Meet… again." on both paths;
  - raid Change…'s answer in the line;
  - the notice band (10 s, ×, over the map; a lasting line kept); S17's `pre-line`.
- **Task 3:** the map's small fixes:
  - S2: rings below markers, `RING_PANE_Z` 590;
  - S3: a 44 px × on coarse pointers;
  - S4: the place's name heading a shared place only when every thing is at it;
  - S5: "Egg", "Hatched", "Ended";
  - S11: the list kept in place across the redraw;
  - S16: Escape closes forms, `escapeCancels`;
  - S22: "What's going on".
- **Task 4:** S6, S19, S28: `src/render/duration-words.ts`.
  - `relativeStamp` words a time as Discord's client does, by moment's rounded thresholds in the reader's locale.
  - `durationWords` gives exact minutes rounded to the nearest, never "m".
  - The guard `src/text-durations.test.ts` refuses hand-worded minutes.
- **Task 5:** S18, S26: `holdsSubject` in `src/domain/research/reports.ts`, shared by Discord's `moreStops` and the page; "Change task".
- **Task 6:** Report's step 2 asks for the five nearest Power Spots or stops (`near=`/`count=` on `/api/powerspots` and `/api/stops`, over `nearestPlaces`). Meetup safety's "off" line is logged once at start.
- **Task 7:** S14. The Report menu's icons:
  - the game's Dynamax served at `/icons/dynamax.png`;
  - Campfire's Poké Ball and the game's calendar as masks;
  - Pine's train C3b, with no outline in either theme.

  Also `pictures/emoji/pinetrain.png` in `CONTROL_ICON_NAMES`, and the train mark before a train's name in "Going on now" and the new-train DM, while the application has the emoji.
- **Task 8:** docs (`web.md`, `parties-and-posts.md`, `stop-reports.md`, `meetup-safety.md`) and the staging checklist `2026-10-28-phase-8m11a-staging.md`.

**Tech stack:**
- TypeScript 6.0, Node 26, Leaflet, esbuild, Fastify and Vitest.
- No new dependency, no migration, no setting, no command change, so no deploy is needed.
- The CSP is unchanged. The emoji upload (`emoji:upload --apply`) waits for Matt's go-ahead.

**Spec:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11A" and "Matt's answers"), approved by Matt 2026-10-28. With it: the brief `.superpowers/sdd/2026-10-28-phase-8m11a-answers-small-fixes/design.md` (git-ignored), its fix lists and `progress.md`. Matt's later decision: the train has no outline in light theme either.

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8m11a` (tip `3203a397`), one commit per task, on web-fix-pass 1c583733 (typescript-migration with the Node 26 update merged).
- Each commit typechecks and passes its tests.
- On the tip, the full check (10,716 tests), the build and the database suite (612 tests) pass.

**Reviews:**
- **The prototype:** an Opus review returned "ready after fixes":
  - 1 Important: the notice band hid lasting states such as the map's failure;
  - 5 Minor: a draw in flight before the ticket, `relativeStamp`'s rounding, raid Change…'s answer, S4's heading, and the guard's written-out units;
  - the prototyper's own find, the note box's underline;
  - Matt's fix 8, the train's light outline.

  Fix round 1 folded them in.
- **Fix round 1:** a scoped re-review returned "ready", with 2 Minor findings: the ticket was taken before the change, and a lasting line was lost after a timed one. Fix round 2 folded them in, together with the rebase onto the Node 26 branch.
- **Fix round 2:** a scoped re-review returned "ready", with no findings.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `parties-and-posts.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and `src/web/client`) and its own test files.
- The full check, the build and the database suite run once, on the tip.
- Work in `../Professor-Pine-fixpass` on `web-fix-pass`; never commit in the main checkout.
- Task 7's diff carries a binary file (`pinetrain.png`): apply it with `git apply`, never by hand.

## Review Focus

- A press answers with the post that shows its own change, or after 5 s at most. A refusal never waits, and an ended party never holds a wait.
- With the application's emoji missing, "Going on now" and the new-train DM read byte for byte as before.
- A lasting line in the notice band, such as the map's failure or the editor's read-only state, is never lost to a timed answer.
- Times on the map match Discord's client at the unit boundaries (44 min 40 s is "in an hour"), and the list and the post agree on minutes.
- `/icons/` serves only its allowlisted names, and the page's code uses nothing newer than ES2023.

---

### Task 1: 8M-11A S1: a change on the map answers once its post shows it

Prototype commit: `742a7d934e08c3d6f914599eecf65356f957a409`

PartyService counts the draws of each party's post: drawTicket(partyId)
is taken before a change, shown(partyId, ticket, maxMs) resolves once a
draw started after it kept its layout or ended, or after the cap. At once
when the party has no post drawn, when such a draw is done already, or
when no draw is waiting or running (Coalescer.busy).

Every web route that changes a party waits for it through drawAfter
(src/web/post-drawn.ts, PRESS_SHOWN_MS 5 s): the press, Group..., Meet...,
the raid's Change..., the meetup's changes, the route editor, Move...,
Manage..., Split... (for the train it leaves) and the conductor. A refusal
waits for nothing. The page's poll right after the answer then gets the
post with the change.

**Files:**

```
 src/app.ts                               |   2 ++
 src/services/coalescer.ts                |   5 ++++
 src/services/party-service.shown.test.ts | 201 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/party-service.ts            | 106 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/meetup-change.test.ts            |  20 +++++++++++++--
 src/web/meetup-routes.ts                 |   2 ++
 src/web/party-meet.test.ts               |  24 ++++++++++++++++--
 src/web/party-press.test.ts              |  49 +++++++++++++++++++++++++++++++++++++
 src/web/party-regroup.test.ts            |  20 +++++++++++++--
 src/web/party-routes.ts                  |   8 ++++++
 src/web/post-control-routes.ts           |   3 +++
 src/web/post-drawn.ts                    |  26 ++++++++++++++++++++
 src/web/raid-change.test.ts              |  19 +++++++++++++--
 src/web/raid-routes.ts                   |   2 ++
 src/web/train-manage.test.ts             |  24 ++++++++++++++++--
 src/web/train-move.test.ts               |  40 ++++++++++++++++++++++++++++--
 src/web/train-route.test.ts              |  19 +++++++++++++--
 src/web/train-routes.ts                  |   7 ++++++
 src/web/train-split.test.ts              |  20 +++++++++++++--
 test/support/web.ts                      |  36 ++++++++++++++++++++++++++-
 20 files changed, 614 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/party-service.shown.test.ts src/web/meetup-change.test.ts src/web/party-meet.test.ts src/web/party-press.test.ts src/web/party-regroup.test.ts src/web/raid-change.test.ts src/web/train-manage.test.ts src/web/train-move.test.ts src/web/train-route.test.ts src/web/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 742a7d934e08c3d6f914599eecf65356f957a409 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A S1: a change on the map answers once its post shows it`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 94cd02369fb945ab634271e356b71075250ab97b..1f1b66e6a6c42fe7ff1bb2834b9973c552c1810f 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1320,6 +1320,8 @@ export async function startApp(
         maxLook: (party) => maxLook(partyService.maxView(party)),
         // The layout each post was last shown with, the popup's (plan 8M-8A), and posts' titles.
         layoutOf: (partyId) => partyService.layoutOf(partyId),
+        // A change on the map answers once its post shows it (plan 8M-11A, S1).
+        drawn: partyService,
         titleOf: (party) => partyService.postTitle(party),
         // A place's picture beside Where (plan 8M-8A), by its gym or Wayspot, from the image cache.
         places: new PlacePictures({ gyms, wayspots, cache: webPictureCache }),
diff --git a/src/services/coalescer.ts b/src/services/coalescer.ts
index ac361fcb5cc51678a421460495d03187ac521278..eada61e920e711f888bd4221addf1fe0cd2c0a0f 100644
--- a/src/services/coalescer.ts
+++ b/src/services/coalescer.ts
@@ -112,6 +112,11 @@ export class Coalescer<K> {
     for (let run = this.running.get(key); run; run = this.running.get(key)) await run;
   }
 
+  /** Whether a run for this key is waiting for its delay or going on. */
+  busy(key: K): boolean {
+    return this.waiting.has(key) || this.running.has(key);
+  }
+
   /** Refuses every later request, then flushes. */
   async stop(): Promise<void> {
     this.stopped = true;
diff --git a/src/services/party-service.shown.test.ts b/src/services/party-service.shown.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..63d711e702e53fc20ea8aef358ea7ab8601b2dd2
--- /dev/null
+++ b/src/services/party-service.shown.test.ts
@@ -0,0 +1,201 @@
+import { describe, expect, it, vi } from 'vitest';
+import { textOf } from '../../test/support/messages.js';
+import { BOB, CAROL } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { postMessage } from '../render/party-post.js';
+
+/** The timers the service set, which a test runs by hand. */
+function heldTimers() {
+  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
+  const setTimer = (run: () => void, ms: number) => {
+    const timer = { run, ms, cancelled: false };
+    timers.push(timer);
+    return () => {
+      timer.cancelled = true;
+    };
+  };
+  return { timers, setTimer };
+}
+
+/** The post's edit held until `release` (only the first): `asked` once it was asked. */
+function holdFirstEdit(made: Awaited<ReturnType<typeof reportedRaid>>) {
+  const edit = made.gateway.editPost.bind(made.gateway);
+  let release: () => void = () => undefined;
+  let tell: () => void = () => undefined;
+  const asked = new Promise<void>((resolve) => {
+    tell = resolve;
+  });
+  let first = true;
+  vi.spyOn(made.gateway, 'editPost').mockImplementation(async (...args) => {
+    if (first) {
+      first = false;
+      tell();
+      await new Promise<void>((resolve) => {
+        release = resolve;
+      });
+    }
+    return edit(...args);
+  });
+  return { asked, release: () => release() };
+}
+
+/** The post's first two edits held, each until its `release`: `asked` once each was asked. */
+function holdTwoEdits(made: Awaited<ReturnType<typeof reportedRaid>>) {
+  const edit = made.gateway.editPost.bind(made.gateway);
+  const holds = [0, 1].map(() => {
+    let tell: () => void = () => undefined;
+    let release: () => void = () => undefined;
+    const asked = new Promise<void>((resolve) => {
+      tell = resolve;
+    });
+    const released = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    return { asked, released, tell: () => tell(), release: () => release() };
+  });
+  let count = 0;
+  vi.spyOn(made.gateway, 'editPost').mockImplementation(async (...args) => {
+    const hold = holds[count];
+    count += 1;
+    if (hold) {
+      hold.tell();
+      await hold.released;
+    }
+    return edit(...args);
+  });
+  return holds;
+}
+
+/** What the map would draw of the party's post now (`layoutOf`), as text. */
+function layoutText(made: Awaited<ReturnType<typeof reportedRaid>>): string {
+  const layout = made.service.layoutOf(made.party.id);
+  return layout === undefined ? '' : textOf(postMessage(layout));
+}
+
+describe('PartyService.drawTicket and shown: a press waits for its post (plan 8M-11A, S1)', () => {
+  it('waits for the draw a change asked for, also one that waits out its delay', async () => {
+    // A long delay: the change's draw waits (a burst), until the flush starts it. The cap never
+    // runs by itself: only the draw answers.
+    const made = await reportedRaid({}, { setTimer: heldTimers().setTimer });
+    const held = holdFirstEdit(made);
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    // Review fix R1: the ticket after the change, its count with the press's own change.
+    const ticket = made.service.drawTicket(made.party.id);
+    let settled = false;
+    const shown = made.service.shown(made.party.id, ticket, 5_000).then(() => {
+      settled = true;
+    });
+    const flushed = made.service.flush();
+    await held.asked;
+    // The edit is on its way: the post does not show Bob yet, and the press still waits.
+    expect(settled).toBe(false);
+    expect(layoutText(made)).not.toContain('Bob');
+    held.release();
+    await shown;
+    expect(layoutText(made)).toContain('Bob');
+    await flushed;
+  });
+
+  it('waits for a draw that the change started at once, on a quiet party', async () => {
+    const made = await reportedRaid({}, { renderDelayMs: 0, setTimer: heldTimers().setTimer });
+    const held = holdFirstEdit(made);
+    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
+    // The draw the change started at once read the party with it: its count is the ticket's.
+    const ticket = made.service.drawTicket(made.party.id);
+    let settled = false;
+    const shown = made.service.shown(made.party.id, ticket, 5_000).then(() => {
+      settled = true;
+    });
+    await held.asked;
+    expect(settled).toBe(false);
+    held.release();
+    await shown;
+    expect(layoutText(made)).toContain('Carol');
+    await made.service.flush();
+  });
+
+  // Review fixes F2 and R1: another member's change stored between the press's start and its
+  // change, and a draw that read it (not the press's change) on its way: the wait lasts until a
+  // draw that read the press's change.
+  it('waits past a draw that read the party before the change, until one that read it', async () => {
+    const made = await reportedRaid({}, { setTimer: heldTimers().setTimer });
+    const [first, second] = holdTwoEdits(made);
+    if (!first || !second) throw new Error('no holds');
+    // The press starts; another member's change is stored, and the draw that read it starts.
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    const flushed = made.service.flush();
+    await first.asked;
+    // The change of the press, stored while that draw is on its way; the ticket after it.
+    await made.attendance.signUp(made.party.id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
+    const ticket = made.service.drawTicket(made.party.id);
+    let settled = false;
+    const shown = made.service.shown(made.party.id, ticket, 5_000).then(() => {
+      settled = true;
+    });
+    first.release();
+    await second.asked;
+    // The first draw kept its layout (Bob, not Carol): the press still waits.
+    expect(layoutText(made)).toContain('Bob');
+    expect(layoutText(made)).not.toContain('Carol');
+    expect(settled).toBe(false);
+    second.release();
+    await shown;
+    expect(layoutText(made)).toContain('Carol');
+    await flushed;
+  });
+
+  it('resolves at once when no draw is pending or running for the party', async () => {
+    const made = await reportedRaid();
+    const ticket = made.service.drawTicket(made.party.id);
+    // Nothing changed: no draw is asked for, and nothing is waited for.
+    await made.service.shown(made.party.id, ticket, 5_000);
+    expect(layoutText(made)).not.toBe('');
+  });
+
+  it('resolves at once when the draw after the ticket has already kept its layout', async () => {
+    const made = await reportedRaid({}, { renderDelayMs: 0 });
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    const ticket = made.service.drawTicket(made.party.id);
+    await made.service.flush();
+    await made.service.shown(made.party.id, ticket, 5_000);
+    expect(layoutText(made)).toContain('Bob');
+  });
+
+  it('resolves at once for a party whose post is not drawn any more', async () => {
+    const made = await reportedRaid();
+    const ticket = made.service.drawTicket(made.party.id);
+    await made.service.end(made.party.id);
+    await made.service.shown(made.party.id, ticket, 5_000);
+    await made.service.shown('no such party', 0, 5_000);
+    expect(made.service.layoutOf(made.party.id)).toBeUndefined();
+  });
+
+  it('resolves after the cap when the draw does not come, and the draw still goes on', async () => {
+    const timers = heldTimers();
+    const made = await reportedRaid({}, { setTimer: timers.setTimer });
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    const ticket = made.service.drawTicket(made.party.id);
+    const shown = made.service.shown(made.party.id, ticket, 5_000);
+    const cap = timers.timers.find((timer) => timer.ms === 5_000 && !timer.cancelled);
+    if (cap === undefined) throw new Error('no timer of the cap');
+    cap.run();
+    await shown;
+    // The post is not drawn yet: the answer goes out anyway, and the draw follows.
+    expect(layoutText(made)).not.toContain('Bob');
+    await made.service.flush();
+    expect(layoutText(made)).toContain('Bob');
+  });
+
+  it('cancels the cap once the draw kept its layout', async () => {
+    const timers = heldTimers();
+    const made = await reportedRaid({}, { setTimer: timers.setTimer });
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+    const ticket = made.service.drawTicket(made.party.id);
+    const shown = made.service.shown(made.party.id, ticket, 5_000);
+    await made.service.flush();
+    await shown;
+    const cap = timers.timers.find((timer) => timer.ms === 5_000);
+    expect(cap?.cancelled).toBe(true);
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index f2f4f2586daef72caab42f5e151b35a06d21e259..263c1951062990ddd628508613bb4b7e97dfd439 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -715,6 +715,21 @@ export class PartyService {
    * leaves the one before; forgotten with the post.
    */
   private readonly shownLayouts = new Map<string, PostLayout>();
+  /**
+   * How many changes of each party the store has made in memory (`PartyStore.onChange`, plan
+   * 8M-11A, S1): a press on the map takes the count once its change has returned (`drawTicket`,
+   * review R1: its own change counted). Forgotten when the party ends.
+   */
+  private readonly changes = new Map<string, number>();
+  /**
+   * The draws of each party's post (plan 8M-11A, S1, review F2): the change count the draw going
+   * on read the party at (`reading`), and the highest count a draw that kept its layout or ended
+   * had read (`seen`). A wait is answered by a draw that read the press's change (a count of the
+   * ticket or more), never by one in flight that read the party before it. Forgotten when the party ends.
+   */
+  private readonly draws = new Map<string, { reading: number | undefined; seen: number }>();
+  /** The presses that wait for a draw of a party's post, by party (`shown`). */
+  private readonly drawWaits = new Map<string, Set<{ ticket: number; resolve: () => void }>>();
   /**
    * How a post is made, once one was: with its message as its first message (`direct`), or with
    * a line of text that is then edited into the message (`edited`), where Discord refuses a
@@ -844,6 +859,10 @@ export class PartyService {
     options.wayspots?.whenChanged(() => {
       this.wayspotsChanged();
     });
+    // Each change in memory counted, for the presses that wait for their post (plan 8M-11A, S1).
+    options.store.onChange((_before, after) => {
+      this.changes.set(after.id, (this.changes.get(after.id) ?? 0) + 1);
+    });
   }
 
   /**
@@ -873,6 +892,79 @@ export class PartyService {
     return postId === null || postId === undefined ? undefined : this.shownLayouts.get(postId);
   }
 
+  /**
+   * How many changes of a party the store has made in memory (plan 8M-11A, S1, reviews F2 and
+   * R1): a press on the map takes it once its change has returned, so that it counts the press's
+   * own change, and waits with it for its post (`shown`).
+   */
+  drawTicket(partyId: string): number {
+    return this.changes.get(partyId) ?? 0;
+  }
+
+  /**
+   * Resolves once a draw of the party's post that read the party at `ticket` or later
+   * (`drawTicket`, taken after the change: with the press's change) has kept its layout
+   * (`layoutOf`) or ended, or after `maxMs`, whichever comes first (plan 8M-11A, S1; reviews F2
+   * and R1: a draw in flight that read the party before the change answers nothing). A draw the
+   * change started at once counts (it read the ticket's count), and so does one that waits out
+   * its delay. At once when the party has no post drawn (over, or its post still being
+   * made), when such a draw is done already, or when no draw is waiting or running for it. Never
+   * rejects.
+   */
+  shown(partyId: string, ticket: number, maxMs: number): Promise<void> {
+    const party = this.options.store.get(partyId);
+    if (!party?.forumPostId || this.creating.has(partyId)) return Promise.resolve();
+    if ((this.draws.get(partyId)?.seen ?? 0) >= ticket) return Promise.resolve();
+    if (!this.posts.busy(partyId)) return Promise.resolve();
+    return new Promise<void>((resolve) => {
+      const waits = this.drawWaits.get(partyId) ?? new Set();
+      this.drawWaits.set(partyId, waits);
+      const wait = {
+        ticket,
+        resolve: () => {
+          cancel();
+          waits.delete(wait);
+          if (waits.size === 0 && this.drawWaits.get(partyId) === waits) {
+            this.drawWaits.delete(partyId);
+          }
+          resolve();
+        },
+      };
+      const cancel = this.setTimer(() => {
+        wait.resolve();
+      }, maxMs);
+      waits.add(wait);
+    });
+  }
+
+  /** A draw of a party's post starts, reading the party now: the change count it read. */
+  private drawStarted(partyId: string): number {
+    const read = this.changes.get(partyId) ?? 0;
+    const draw = this.draws.get(partyId) ?? { reading: undefined, seen: 0 };
+    draw.reading = read;
+    this.draws.set(partyId, draw);
+    return read;
+  }
+
+  /**
+   * A draw that read the party at change count `read` kept its layout or ended: the presses whose
+   * change it read are answered.
+   */
+  private drawDone(partyId: string, read: number): void {
+    const draw = this.draws.get(partyId);
+    if (draw !== undefined && read > draw.seen) draw.seen = read;
+    for (const wait of [...(this.drawWaits.get(partyId) ?? [])]) {
+      if (read >= wait.ticket) wait.resolve();
+    }
+  }
+
+  /** A party's post is drawn no more: every press that waits for it is answered. */
+  private drawsOver(partyId: string): void {
+    for (const wait of [...(this.drawWaits.get(partyId) ?? [])]) wait.resolve();
+    this.draws.delete(partyId);
+    this.changes.delete(partyId);
+  }
+
   /**
    * Whether the bot may delete the post of an active party (`PartyGateway.mayDeletePost`): a
    * moderator's choice to delete it (plan 8S-2) is refused before the party ends where it may
@@ -2267,6 +2359,7 @@ export class PartyService {
       log.error({ err, party: partyId }, failure);
     }
     if (postId) this.forgetPost(postId);
+    this.drawsOver(partyId);
     return ended;
   }
 
@@ -2275,8 +2368,11 @@ export class PartyService {
    * edit that ends after the party ended, or after it moved to another post, keeps nothing.
    */
   private keepLayout(partyId: string, postId: string, layout: PostLayout): void {
-    if (this.options.store.get(partyId)?.forumPostId === postId)
-      this.shownLayouts.set(postId, layout);
+    if (this.options.store.get(partyId)?.forumPostId !== postId) return;
+    this.shownLayouts.set(postId, layout);
+    // The draw going on has shown what it read: the presses whose change it read are answered.
+    const reading = this.draws.get(partyId)?.reading;
+    if (reading !== undefined) this.drawDone(partyId, reading);
   }
 
   /** Forgets what is kept for a post: its rename budget, a title waiting for it, what it showed. */
@@ -2402,6 +2498,7 @@ export class PartyService {
   }): void {
     this.deletionRequests.delete(party.id);
     if (party.forumPostId !== null) this.forgetPost(party.forumPostId);
+    this.drawsOver(party.id);
     if (party.regionId !== null) this.summaries.request(party.regionId);
     // A train that ended passes through no region any more (plan 8X-G).
     if (party.type === 'train' && party.guildId !== undefined) this.serverSummaries(party.guildId);
@@ -3072,9 +3169,14 @@ export class PartyService {
 
   /** One run of the render of a party: its post, then the copies of its message. */
   private async renderPost(partyId: string): Promise<void> {
+    const read = this.drawStarted(partyId);
     try {
       await this.showPost(partyId);
     } finally {
+      // Kept or not (failed, rate limited, gone), the presses whose change it read wait no longer.
+      const draw = this.draws.get(partyId);
+      if (draw) draw.reading = undefined;
+      this.drawDone(partyId, read);
       await this.showCopies(partyId);
     }
   }
diff --git a/src/web/meetup-change.test.ts b/src/web/meetup-change.test.ts
index 8bed7e2e97ad49ae73fba7b282577ec728f4d95f..4d32d5f234a44460e3d09d8685896985ca41ded5 100644
--- a/src/web/meetup-change.test.ts
+++ b/src/web/meetup-change.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -13,6 +14,7 @@ import {
   TEST_OWNER_ID,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { START_THROTTLE } from '../commands/parties/timed.js';
 import { CHANGE_THROTTLE } from '../commands/raids/change.js';
@@ -58,9 +60,10 @@ async function changing(options: { throttles?: Throttles } = {}) {
     .add(BOB, 'Bob')
     .add(CAROL, 'Carol')
     .add(TEST_OWNER_ID, 'Owner');
+  const drawn = new RecordingDraws(made.store);
   const web = webServerWith({
     members,
-    parties: partyWebWith(made, { acting, throttles }),
+    parties: partyWebWith(made, { acting, throttles, drawn }),
     meetups: meetupWebWith(ctx),
   });
   web.clock.now = PARTY_NOW;
@@ -78,7 +81,7 @@ async function changing(options: { throttles?: Throttles } = {}) {
       headers: answer.headers,
     };
   };
-  return { made, web, members, acting, headers, change, throttles };
+  return { made, web, members, acting, headers, change, throttles, drawn };
 }
 
 describe('changing a meetup on the map', () => {
@@ -298,4 +301,17 @@ describe('changing a meetup on the map', () => {
       headers: expect.anything() as unknown,
     });
   });
+  it("answers a meetup's change once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
+    const map = await changing();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    const answer = await map.change('name', { drawn: 'Picnic', name: 'Park picnic' });
+    expect(answer.status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 9d648d31fac1d23db1a1603e4c8c888dc474fe5b..bca9086db2ede00d1b7698e8120d6b615520b70f 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -63,6 +63,7 @@ import {
   unreachableOnTheMap,
 } from './acting.js';
 import { sendFailure } from './answers.js';
+import { shownAfter } from './post-drawn.js';
 import { postGuard } from './csrf.js';
 import type { GuildRequest } from './guild-routes.js';
 import { pageWords } from './page-words.js';
@@ -534,6 +535,7 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: party.id, change, outcome: answer.kind },
         'a meetup was changed on the map',
       );
+      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
       return changed(reply, guild, row, party.id, userId, standing, answer);
     },
   );
diff --git a/src/web/party-meet.test.ts b/src/web/party-meet.test.ts
index fe2ffc79a149c0f00c0dafa07ee7fa153e06ac60..3ef41aca7767ae8f0d942f6d39d1eb358939ef90 100644
--- a/src/web/party-meet.test.ts
+++ b/src/web/party-meet.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -9,6 +10,7 @@ import {
   partyWebWith,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { MEET_THROTTLE } from '../commands/parties/meet.js';
 import { variedThrottleKey } from '../discord/router.js';
@@ -40,7 +42,11 @@ async function meeting(
   await party.attendance.signUp(id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
   const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
   const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
-  const web = webServerWith({ members, parties: partyWebWith(party, { acting, throttles }) });
+  const drawn = new RecordingDraws(party.store);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(party, { acting, throttles, drawn }),
+  });
   web.clock.now = PARTY_NOW;
   const headers = await web.posting(ALICE, 'Alice');
   const url = `/s/${FAKE_GUILD_ID}/api/parties/${id}/meet`;
@@ -60,7 +66,7 @@ async function meeting(
     });
     return { status: answer.statusCode, json: answer.json<PressAnswer & { error?: string }>() };
   };
-  return { made: party, id, web, open, set, throttles };
+  return { made: party, id, web, open, set, throttles, drawn };
 }
 
 describe('Meet… on the map (plan 8M-8B)', () => {
@@ -183,4 +189,18 @@ describe('Meet… on the map (plan 8M-8B)', () => {
     expect(json.times[0]).toEqual({ at: PARTY_NOW + 5 * MINUTE, rsvp: false });
     expect(json.times.every((time) => !time.rsvp)).toBe(true);
   });
+  it("answers Meet…'s Submit once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
+    const map = await meeting();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    const { json: offered } = await map.open();
+    const answer = await map.set({ group: offered.group, stamp: offered.stamp, time: HATCH });
+    expect(answer.status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/src/web/party-press.test.ts b/src/web/party-press.test.ts
index 019b5e82d5514c9e32c720b65222b6c01ad4d641..becc58c238b1bf5bafab53f2ac3eac6b3378cfe3 100644
--- a/src/web/party-press.test.ts
+++ b/src/web/party-press.test.ts
@@ -14,6 +14,7 @@ import {
 import {
   FakeActingMembers,
   partyWebWith,
+  RecordingDraws,
   webServerWith,
   type TestWeb,
 } from '../../test/support/web.js';
@@ -27,6 +28,9 @@ import type { PressAnswer } from '../domain/web/party-data.js';
 import { PARTY_KIND } from '../render/party-controls.js';
 import type { PartyWebDeps } from './party-routes.js';
 import type { WebSettings } from './server.js';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
+import { textOf } from '../../test/support/messages.js';
+import { postMessage } from '../render/party-post.js';
 
 const press = (partyId: string, action: string) =>
   `/s/${FAKE_GUILD_ID}/api/parties/${partyId}/${action}`;
@@ -581,4 +585,49 @@ describe('pressing the buttons of a party on the map', () => {
     });
     expect(JSON.stringify(logged)).not.toContain('Alice');
   });
+  it('answers once the post shows the press (plan 8M-11A, S1): the map then gets the post with it', async () => {
+    // A quiet party: the press's draw starts at once; its edit is held on its way to Discord.
+    const made = await reportedRaid({}, { renderDelayMs: 0 });
+    const edit = made.gateway.editPost.bind(made.gateway);
+    let release: () => void = () => undefined;
+    let tell: () => void = () => undefined;
+    const asked = new Promise<void>((resolve) => {
+      tell = resolve;
+    });
+    vi.spyOn(made.gateway, 'editPost').mockImplementationOnce(async (...args) => {
+      tell();
+      await new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      return edit(...args);
+    });
+    const map = await onTheMap(made, new Throttles(), { drawn: made.service });
+    web = map.web;
+    let answered = false;
+    const answering = map.post(press(made.party.id, 'join')).then((answer) => {
+      answered = true;
+      return answer;
+    });
+    await asked;
+    expect(answered).toBe(false);
+    release();
+    expect((await answering).json).toEqual({ ok: true, text: 'You are coming.' });
+    const layout = made.service.layoutOf(made.party.id);
+    expect(layout === undefined ? '' : textOf(postMessage(layout))).toContain('Alice');
+    await made.service.flush();
+  });
+
+  it('takes the draw ticket after the press and waits at most PRESS_SHOWN_MS; a refusal waits for nothing', async () => {
+    const made = await reportedRaid();
+    const drawn = new RecordingDraws(made.store);
+    const map = await onTheMap(made, new Throttles(), { drawn });
+    web = map.web;
+    await map.post(press(made.party.id, 'join'));
+    expect(drawn.waits).toHaveLength(1);
+    expect(drawn.waits[0]).toMatchObject({ partyId: made.party.id, maxMs: PRESS_SHOWN_MS });
+    // Review fix R1: the ticket taken once the press returned, with Alice signed up.
+    expect(drawn.waits[0]?.at?.attendees[ALICE]).toBeDefined();
+    expect((await map.post(press(made.party.id, 'done'))).status).toBe(422);
+    expect(drawn.waits).toHaveLength(1);
+  });
 });
diff --git a/src/web/party-regroup.test.ts b/src/web/party-regroup.test.ts
index 318b6933433294f42323a35d37602649436ec92d..cf2f72c9319ddefb9d28965c970e2b73ad8ec2ee 100644
--- a/src/web/party-regroup.test.ts
+++ b/src/web/party-regroup.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, describe, expect, it } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -9,6 +10,7 @@ import {
   partyWebWith,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { ACTION_THROTTLE } from '../commands/parties/reply.js';
 import { controlThrottleKey } from '../discord/router.js';
@@ -40,7 +42,8 @@ async function grouped(
   const throttles = options.throttles ?? new Throttles();
   const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
   const acting = new FakeActingMembers().add(ALICE, 'Alice').add(BOB, 'Bob');
-  const web = webServerWith({ members, parties: partyWebWith(made, { acting, throttles }) });
+  const drawn = new RecordingDraws(made.store);
+  const web = webServerWith({ members, parties: partyWebWith(made, { acting, throttles, drawn }) });
   web.clock.now = PARTY_NOW;
   const headers = await web.posting(ALICE, 'Alice');
   const stampOf = (group: 'A' | 'B'): string => {
@@ -65,7 +68,7 @@ async function grouped(
     });
     return answer.json<PartiesView>().raids[0]?.attendance;
   };
-  return { made, id, web, acting, headers, stampOf, regroup, listed, throttles };
+  return { made, id, web, acting, headers, stampOf, regroup, listed, throttles, drawn };
 }
 
 describe('Group… on the map (plan 8M-8B)', () => {
@@ -212,4 +215,17 @@ describe('Group… on the map (plan 8M-8B)', () => {
     const answer = await map.regroup({ group: 'B', stamp, signedUp: true });
     expect(answer).toEqual({ status: 409, json: { ok: false, text: 'This has ended.' } });
   });
+  it("answers Group…'s move once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
+    const map = await grouped();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    const answer = await map.regroup({ group: 'B', stamp: map.stampOf('B'), signedUp: true });
+    expect(answer.status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 991950b9a68c5bd89835d808da5b8b1355fe377d..e60bd5de593ba5228a9b9b6816a654b5b80fd9df 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -68,6 +68,7 @@ import type { PartyViewers } from './party-viewers.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 import { aheadOnTheMap, movesOnTheMap, refusalOnTheMap } from './train-views.js';
+import { shownAfter, type PostDraws } from './post-drawn.js';
 
 /**
  * The requests for a server's parties one address may make in a minute: a page asks every 20
@@ -111,6 +112,12 @@ export interface PartyWebDeps {
    * map draws as its popup; undefined while it has none.
    */
   layoutOf(partyId: string): PostLayout | undefined;
+  /**
+   * The draws of the parties' posts (plan 8M-11A, S1, `PartyService.drawTicket` and `shown`): a
+   * change on the map answers once its post shows it (`shownAfter`), so that the page's poll right
+   * after it gets the post with the change.
+   */
+  drawn: PostDraws;
   /** The title of a party's post (`PartyService.postTitle`): a split train names the other by it. */
   titleOf(party: Party): string;
   /**
@@ -639,6 +646,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
         { user: userId, guild, party: partyId, action, outcome: kind },
         'a party was pressed on the map',
       );
+      await shownAfter(parties.drawn, partyId, kind === 'ok');
       const answer: PressAnswer = { ok: said.ok, text: unplain(said.text) };
       return reply.code(PRESS_STATUS[kind]).send(answer);
     },
diff --git a/src/web/post-control-routes.ts b/src/web/post-control-routes.ts
index c95d747f2c9d5a9553f6cee3a1602d7263f82423..c700598cbbd18625f35e216e3f9fecd6eaad3f21 100644
--- a/src/web/post-control-routes.ts
+++ b/src/web/post-control-routes.ts
@@ -41,6 +41,7 @@ import {
   unreachableOnTheMap,
 } from './acting.js';
 import { sendFailure } from './answers.js';
+import { shownAfter } from './post-drawn.js';
 import { postGuard } from './csrf.js';
 import { pageWords } from './page-words.js';
 import { forumOnTheMap } from './party-routes.js';
@@ -270,6 +271,7 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
         },
       );
       noted(request, userId, 'regroup', kind);
+      await shownAfter(parties.drawn, found.party.id, kind === 'ok');
       const answer: PressAnswer = { ok: said.ok, text: unplain(said.text) };
       return reply.code(OUTCOME_STATUS[kind]).send(answer);
     },
@@ -361,6 +363,7 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
         },
       );
       noted(request, userId, 'meet', kind);
+      await shownAfter(parties.drawn, found.party.id, kind === 'ok');
       const answer: PressAnswer = { ok: said.ok, text: words(said.text) };
       return reply.code(OUTCOME_STATUS[kind]).send(answer);
     },
diff --git a/src/web/post-drawn.ts b/src/web/post-drawn.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0b6157378742ad2091576b18b36802aad3dca108
--- /dev/null
+++ b/src/web/post-drawn.ts
@@ -0,0 +1,26 @@
+/**
+ * How long a change on the map waits for its post to be drawn (plan 8M-11A, S1): an edit's round
+ * trip, plus the coalescer's 2 s delay in a burst, with room on a loaded host. Past it the answer
+ * goes out anyway, and the page's next poll catches up.
+ */
+export const PRESS_SHOWN_MS = 5_000;
+
+/** The draws of a party's post (`PartyService.drawTicket` and `shown`). */
+export interface PostDraws {
+  /** How many changes of the party were made: taken once a change has returned. */
+  drawTicket(partyId: string): number;
+  /** Resolves once a draw that read the party at `ticket` or later showed the post, or after `maxMs`. */
+  shown(partyId: string, ticket: number, maxMs: number): Promise<void>;
+}
+
+/**
+ * A change of a party on the map answers once its post shows it (plan 8M-11A, S1): called once
+ * the change has returned, it takes the draw ticket then (review fix R1: its count with the
+ * change itself, whatever another member changed meanwhile) and waits for a draw that read it, at
+ * most `PRESS_SHOWN_MS`; at once where nothing was written (a refusal, the party over). The page
+ * asks for the list as soon as the answer comes, and then gets the post with the change.
+ */
+export function shownAfter(draws: PostDraws, partyId: string, wrote: boolean): Promise<void> {
+  if (!wrote) return Promise.resolve();
+  return draws.shown(partyId, draws.drawTicket(partyId), PRESS_SHOWN_MS);
+}
diff --git a/src/web/raid-change.test.ts b/src/web/raid-change.test.ts
index cb7ba72e704d8238d5b72cd230f84f391f1c17a6..9fdd7f46df37deeaab5bf96c8c80c2a6f6e47ec1 100644
--- a/src/web/raid-change.test.ts
+++ b/src/web/raid-change.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -12,6 +13,7 @@ import {
   TEST_OWNER_ID,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { CHANGE_THROTTLE } from '../commands/raids/change.js';
@@ -59,9 +61,10 @@ async function changing(
     .add(ALICE, 'Alice', 'mystic')
     .add(BOB, 'Bob')
     .add(TEST_OWNER_ID, 'Owner');
+  const drawn = new RecordingDraws(made.store);
   const web = webServerWith({
     members,
-    parties: partyWebWith(made, { acting, throttles }),
+    parties: partyWebWith(made, { acting, throttles, drawn }),
     raids: raidWebWith(ctx),
   });
   web.clock.now = PARTY_NOW;
@@ -84,7 +87,7 @@ async function changing(
     await made.service.flush();
     return made.said().join('\n').split('\n').filter(Boolean);
   };
-  return { made, ctx, web, acting, members, headers, post, lines, throttles };
+  return { made, ctx, web, acting, members, headers, post, lines, throttles, drawn };
 }
 
 describe('changing a raid on the map', () => {
@@ -335,4 +338,16 @@ describe('changing a raid on the map', () => {
     });
     expect(JSON.stringify(logged)).not.toMatch(/2:30pm/u);
   });
+  it("answers a raid's Change… once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
+    const map = await changing();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    expect((await map.post('hatch', { time: '30' })).status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 9cf6111eff35b6d0ab534d2a5d4c6c1dd5f8428d..66954f1bef5a651eb9ee555969a74e1988d9d14f 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -46,6 +46,7 @@ import {
   unreachableOnTheMap,
 } from './acting.js';
 import { sendFailure } from './answers.js';
+import { shownAfter } from './post-drawn.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
@@ -549,6 +550,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: partyId, change, outcome: answer.kind },
         'a raid was changed on the map',
       );
+      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
       const raid =
         answer.kind === 'ok' ? viewOf(guild, row, answer.party, userId, staff) : undefined;
       const sent: RaidAnswer = {
diff --git a/src/web/train-manage.test.ts b/src/web/train-manage.test.ts
index cc4d056d764545fe96b8a29ff84d359c99294dd7..dc5816f9611f1a14c0f7d3351188a91318e9cb31 100644
--- a/src/web/train-manage.test.ts
+++ b/src/web/train-manage.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -12,6 +13,7 @@ import {
   trainWebWith,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { ACTION_THROTTLE } from '../commands/parties/reply.js';
 import { controlThrottleKey } from '../discord/router.js';
@@ -62,9 +64,10 @@ async function managing(options: { throttles?: Throttles; route?: number[] } = {
     members.add(id, name);
     acting.add(id, name);
   }
+  const drawn = new RecordingDraws(made.store);
   const web = webServerWith({
     members,
-    parties: partyWebWith(made, { acting, throttles }),
+    parties: partyWebWith(made, { acting, throttles, drawn }),
     trains: trainWebWith(ctx),
   });
   web.clock.now = PARTY_NOW;
@@ -92,7 +95,7 @@ async function managing(options: { throttles?: Throttles; route?: number[] } = {
     await made.attendance.flush();
     return made.said().join('\n').split('\n').filter(Boolean);
   };
-  return { made, web, throttles, open, submit, lines };
+  return { made, web, throttles, open, submit, lines, drawn };
 }
 
 describe('Manage… of a train on the map (plan 8M-8C)', () => {
@@ -394,4 +397,21 @@ describe('Manage… of a train on the map (plan 8M-8C)', () => {
     expect(await press('kind', { kind: 'dynamax' })).toBe(404);
     expect(map.made.current().train).toMatchObject({ stop: 0, kind: 'raid', atEnd: 'finish' });
   });
+  it("answers Manage…'s Submit once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
+    const map = await managing();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    const { json: manage } = await map.open();
+    const done = await map.submit({
+      shown: manage.shown,
+      picked: { kind: 'dynamax', route: 'reverse', atEnd: 'loop' },
+    });
+    expect(done.status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/src/web/train-move.test.ts b/src/web/train-move.test.ts
index 6ead291b05c12240b9703e9a430d0d2aa176f171..103ebfc6ae5e97ba40f1d54c8d27f11360cd5689 100644
--- a/src/web/train-move.test.ts
+++ b/src/web/train-move.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { testGyms, WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -12,6 +13,7 @@ import {
   trainWebWith,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { ACTION_THROTTLE } from '../commands/parties/reply.js';
 import { CHANGE_THROTTLE } from '../commands/raids/change.js';
@@ -63,9 +65,10 @@ async function moving(options: { throttles?: Throttles } = {}) {
     .add(BOB, 'Bob')
     .add(REPORTER, 'Reporter')
     .add(TEST_OWNER_ID, 'Owner');
+  const drawn = new RecordingDraws(made.store);
   const web = webServerWith({
     members,
-    parties: partyWebWith(made, { acting, throttles }),
+    parties: partyWebWith(made, { acting, throttles, drawn }),
     trains: trainWebWith(ctx),
   });
   web.clock.now = PARTY_NOW;
@@ -102,7 +105,20 @@ async function moving(options: { throttles?: Throttles } = {}) {
     await made.attendance.flush();
     return made.said().join('\n').split('\n').filter(Boolean);
   };
-  return { made, web, acting, members, headers, post, move, conductor, listed, lines, throttles };
+  return {
+    made,
+    web,
+    acting,
+    members,
+    headers,
+    post,
+    move,
+    conductor,
+    listed,
+    lines,
+    throttles,
+    drawn,
+  };
 }
 
 describe('moving a train on the map', () => {
@@ -473,4 +489,24 @@ describe('moving a train on the map', () => {
       }),
     );
   });
+  it('answers Move… and the conductor once the post shows it (plan 8M-11A, S1): the ticket taken after the change', async () => {
+    const map = await moving();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    const moved = map.made.store.get(id);
+    expect(moved).not.toBe(before);
+    expect((await map.conductor('take')).status).toBe(200);
+    expect(map.drawn.waits[1]).toEqual({
+      partyId: id,
+      at: map.made.store.get(id),
+      maxMs: PRESS_SHOWN_MS,
+    });
+    expect(map.made.store.get(id)).not.toBe(moved);
+  });
 });
diff --git a/src/web/train-route.test.ts b/src/web/train-route.test.ts
index 413f65d302f40f905b84e2c5a3ba79010f51e735..dd6cace5b7703cc0d43a674149a78c3e88e59f43 100644
--- a/src/web/train-route.test.ts
+++ b/src/web/train-route.test.ts
@@ -1,4 +1,5 @@
 import { gymIdOf, gymStop, spotStop, stopKey } from '../domain/party/stops.js';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import type { WayspotDirectory } from '../services/wayspot-directory.js';
 import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../test/support/wayspots.js';
@@ -16,6 +17,7 @@ import {
   trainWebWith,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { CHANGE_THROTTLE } from '../commands/raids/change.js';
 import { Throttles } from '../discord/throttle.js';
@@ -65,9 +67,10 @@ async function arranging(
     .add(BOB, 'Bob')
     .add(REPORTER, 'Reporter')
     .add(TEST_OWNER_ID, 'Owner');
+  const drawn = new RecordingDraws(made.store);
   const web = webServerWith({
     members,
-    parties: partyWebWith(made, { acting, throttles }),
+    parties: partyWebWith(made, { acting, throttles, drawn }),
     trains: trainWebWith(ctx),
   });
   web.clock.now = PARTY_NOW;
@@ -99,7 +102,7 @@ async function arranging(
     return made.said().join('\n').split('\n').filter(Boolean);
   };
   const route = () => made.current().train.route.map((ref) => gymIdOf(ref));
-  return { made, ctx, web, acting, members, headers, edit, saved, lines, route, throttles };
+  return { made, ctx, web, acting, members, headers, edit, saved, lines, route, throttles, drawn };
 }
 
 describe("a train's route on the map", () => {
@@ -419,4 +422,16 @@ describe("a train's route on the map", () => {
     });
     expect(JSON.stringify(logged)).not.toMatch(/Secret/u);
   });
+  it('answers an edit of the route once the post shows it (plan 8M-11A, S1): the ticket taken after the change', async () => {
+    const map = await arranging();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    expect((await map.edit('add', { drawn: ['4', '1', '7'], stop: '2' })).status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 52525170edff8e782a2a39515173ea0dc8144fc4..5cbf9f83912b349dc2f4d8dfcc2858f867110b94 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -96,6 +96,7 @@ import {
   unreachableOnTheMap,
 } from './acting.js';
 import { sendFailure } from './answers.js';
+import { shownAfter } from './post-drawn.js';
 import { postGuard } from './csrf.js';
 import type { GuildRequest } from './guild-routes.js';
 import { pageWords } from './page-words.js';
@@ -610,6 +611,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: party.id, edit, outcome: answer.kind },
         "a train's route was changed on the map",
       );
+      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
       return answered(reply, guild, row, party.id, userId, standing, answer);
     },
   );
@@ -689,6 +691,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
         'a train was moved on the map',
       );
+      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
       return answered(reply, guild, row, party.id, userId, standing, answer);
     },
   );
@@ -777,6 +780,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: party.id, outcome: answer.kind },
         'a train was managed on the map',
       );
+      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
       return answered(reply, guild, row, party.id, userId, standing, answer);
     },
   );
@@ -881,6 +885,8 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: party.id, outcome: split.kind },
         'a train was split on the map',
       );
+      // The post of the train the group leaves; the new train's is new, and the list fetches it.
+      await shownAfter(parties.drawn, party.id, split.kind === 'split');
       if (split.kind === 'refused' && split.givesBack === true) {
         givenBackOnTheMap(deps, counted, userId, ACTION_THROTTLE, countedAt);
       }
@@ -962,6 +968,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
         { user: userId, guild, party: party.id, conductor: change, outcome: answer.kind },
         "a train's conductor was changed on the map",
       );
+      await shownAfter(parties.drawn, party.id, answer.kind === 'ok');
       return answered(reply, guild, row, party.id, userId, standing, answer);
     },
   );
diff --git a/src/web/train-split.test.ts b/src/web/train-split.test.ts
index 333e29f707938a71d4874c618e70d494fbfcd086..3771a95007d893256d8d480316c7c7af616e4277 100644
--- a/src/web/train-split.test.ts
+++ b/src/web/train-split.test.ts
@@ -1,4 +1,5 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { PRESS_SHOWN_MS } from './post-drawn.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
@@ -12,6 +13,7 @@ import {
   trainWebWith,
   webServerWith,
   type TestWeb,
+  RecordingDraws,
 } from '../../test/support/web.js';
 import { ACTION_THROTTLE } from '../commands/parties/reply.js';
 import { controlThrottleKey } from '../discord/router.js';
@@ -69,9 +71,10 @@ async function splitting(options: { throttles?: Throttles } = {}) {
     members.add(userId, name);
     acting.add(userId, name);
   }
+  const drawn = new RecordingDraws(made.store);
   const web = webServerWith({
     members,
-    parties: partyWebWith(made, { acting, throttles }),
+    parties: partyWebWith(made, { acting, throttles, drawn }),
     trains: trainWebWith(ctx),
   });
   web.clock.now = PARTY_NOW;
@@ -114,7 +117,7 @@ async function splitting(options: { throttles?: Throttles } = {}) {
     });
     return answer.json<PartiesView>().trains;
   };
-  return { made, web, throttles, open, submit, listed };
+  return { made, web, throttles, open, submit, listed, drawn };
 }
 
 describe('Split… of a train on the map (plan 8M-8C)', () => {
@@ -335,4 +338,17 @@ describe('Split… of a train on the map (plan 8M-8C)', () => {
     expect((await map.open()).status).toBe(409);
     expect((await map.submit({ group: 'B', mark: '1.a' })).status).toBe(409);
   });
+  it("answers Split…'s Submit, for the train it leaves once the post shows it (plan 8M-11A, S1): the ticket taken after the change", async () => {
+    const map = await splitting();
+    web = map.web;
+    const id = map.made.party.id;
+    const before = map.made.store.get(id);
+    const { json: split } = await map.open();
+    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(200);
+    // Review fix R1: the ticket taken once the change returned, the party with it.
+    expect(map.drawn.waits).toEqual([
+      { partyId: id, at: map.made.store.get(id), maxMs: PRESS_SHOWN_MS },
+    ]);
+    expect(map.made.store.get(id)).not.toBe(before);
+  });
 });
diff --git a/test/support/web.ts b/test/support/web.ts
index d9d501e27355c388c61f328b00733bbc5e9a3560..c5a7c3b4a25f104c22d5adb61542aa57283948a1 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -25,7 +25,7 @@ import type { MaxWebContext, MaxWebDeps } from '../../src/web/max-routes.js';
 import type { PostWebContext, PostWebDeps } from '../../src/web/post-control-routes.js';
 import type { StopWebContext, StopWebDeps } from '../../src/web/stop-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
-import type { Team } from '../../src/domain/party/party.js';
+import type { Party, Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
 import { maxLook } from '../../src/render/max-post.js';
@@ -48,6 +48,7 @@ import { toolFolder } from './wayspot-tool.js';
 import { WayspotToolFiles } from '../../src/services/wayspot-tool.js';
 import { ScriptAccessService } from '../../src/services/script-access-service.js';
 import type { ToolWebDeps } from '../../src/web/tool-routes.js';
+import type { PostDraws } from '../../src/web/post-drawn.js';
 import type { partyServiceWith } from './party-service.js';
 
 /** The bot's owner in the tests' environment (`TEST_ENV.OWNER_ID`), staff in every server. */
@@ -230,6 +231,35 @@ const NO_PLACES: PartyWebDeps['places'] = {
   read: () => Promise.resolve(undefined),
 };
 
+/** Nothing waits for a post to be drawn (plan 8M-11A): a test of the wait passes its own. */
+export const NO_DRAW_WAIT: PostDraws = {
+  drawTicket: () => 0,
+  shown: () => Promise.resolve(),
+};
+
+/**
+ * The draws of the posts as a route asks for them (plan 8M-11A, S1), answered at once: each
+ * ticket keeps the party as the store had it when it was taken (`at`), each wait what it
+ * waited for (`waits`: the party, the party at its ticket, the cap).
+ */
+export class RecordingDraws implements PostDraws {
+  readonly waits: { partyId: string; at: Party | undefined; maxMs: number }[] = [];
+  private readonly tickets = new Map<number, Party | undefined>();
+
+  constructor(private readonly store: { get(partyId: string): Party | undefined }) {}
+
+  drawTicket(partyId: string): number {
+    const ticket = this.tickets.size + 1;
+    this.tickets.set(ticket, this.store.get(partyId));
+    return ticket;
+  }
+
+  shown(partyId: string, ticket: number, maxMs: number): Promise<void> {
+    this.waits.push({ partyId, at: this.tickets.get(ticket), maxMs });
+    return Promise.resolve();
+  }
+}
+
 /** No parties: the live map of a server without any. */
 const NO_PARTIES: PartyWebDeps = {
   guilds: { idFor: () => Promise.resolve(undefined) },
@@ -239,6 +269,7 @@ const NO_PARTIES: PartyWebDeps = {
     throw new Error('no trains in this test');
   },
   layoutOf: () => undefined,
+  drawn: NO_DRAW_WAIT,
   titleOf: () => '',
   places: NO_PLACES,
   forums: { memberAccess: () => Promise.resolve(undefined) },
@@ -284,6 +315,7 @@ export function partyWebWith(
     acting?: ActingMembers;
     throttles?: Throttles;
     places?: PartyWebDeps['places'];
+    drawn?: PostDraws;
   } = {},
 ): PartyWebDeps {
   return {
@@ -295,6 +327,8 @@ export function partyWebWith(
     stops: made.service.stops,
     maxLook: (party) => maxLook(made.service.maxView(party)),
     layoutOf: (partyId) => made.service.layoutOf(partyId),
+    // Nothing waits for a post unless the test says so (`RecordingDraws`, or the service).
+    drawn: options.drawn ?? NO_DRAW_WAIT,
     titleOf: (party) => made.service.postTitle(party),
     places: options.places ?? NO_PLACES,
     forums: made.gateway,
````

### Task 2: 8M-11A S9, S20, S21: answers where the member looks; the notice band

Prototype commit: `4c75719089079d004c69e753bcef31fadbabd2ab`

A press's answer goes into a line under the post's buttons (.press-answer,
role="status"), in the popup and the phone card (its summary too), kept by
party for ten seconds across redraws (PressAnswers); a refusal shakes the
popup or card once, unless the device asks for reduced motion. The forms of
the post's controls and the conductor's buttons answer there too; the notice
band carries only what has no party.

A button the map leaves to Discord opens a note box in the form's place
("A new group is started on Discord." where only a new group is left),
with "Open the post on Discord" and Back; a refusal before a form opens
is said in the answer line. The completion question is drawn in the post
above its buttons, and the card's handle shows a dot while it asks.

Meet...'s refusal for a group changed since is one sentence on both paths,
"Group B has changed since: press Meet... again." (meetSubmitRefusal), and
the map's form closes on it as Group...'s does.

The notice band lies over the top of the map, goes away by itself after
ten seconds (a new line starts the time again), hides at once by its x,
and keeps line breaks (S17).

**Files:**

```
 src/commands/parties/meet-dialog.ts           |  11 ++++--
 src/components/party.meet.test.ts             |   4 +-
 src/web/client/common.ts                      |  26 ++++++++++---
 src/web/client/editor.ts                      |  21 +++++++---
 src/web/client/main.ts                        |  17 ++++----
 src/web/client/map.css                        | 121 ++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/web/client/notice.test.ts                 |  83 ++++++++++++++++++++++++++++++++++++++-
 src/web/client/notice.ts                      |  79 +++++++++++++++++++++++++++++++++++++
 src/web/client/parties.test.ts                |  23 +++++++++--
 src/web/client/parties.ts                     |  14 ++++---
 src/web/client/party-layer.ts                 |  66 +++++++++++++++++++++++--------
 src/web/client/post-draw.test.ts              | 103 ++++++++++++++++++++++++++++--------------------
 src/web/client/post-draw.ts                   | 106 ++++++++++++++++++++++++--------------------------
 src/web/client/post-forms-ui.isolated.test.ts | 313 +++++++++++++++++++++++++++++++++++++++++++++++---------------------------------------------------------------------------------------------------
 src/web/client/post-forms-ui.ts               |  67 ++++++++++++++++++++------------
 src/web/client/post-forms.ts                  |  43 ++++++++++++++++++++
 src/web/client/press-answer.test.ts           |  28 +++++++++++++
 src/web/client/press-answer.ts                |  91 +++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-ui.isolated.test.ts       | 130 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-ui.ts                     |  53 ++++++++++++++++++++-----
 src/web/client/theme.css                      |  19 +++++++++
 src/web/client/train-ui.isolated.test.ts      |  17 ++++++++
 src/web/client/train-ui.ts                    |   8 +++-
 src/web/page.test.ts                          |  11 ++++--
 src/web/page.ts                               |  10 +++--
 src/web/party-meet.test.ts                    |   2 +-
 src/web/post-control-routes.ts                |   2 +-
 src/web/stop-popup-look.test.ts               |   7 ++++
 test/support/fake-page.ts                     | 208 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 29 files changed, 1265 insertions(+), 418 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/party.meet.test.ts src/web/client/notice.test.ts src/web/client/parties.test.ts src/web/client/post-draw.test.ts src/web/client/post-forms-ui.isolated.test.ts src/web/client/press-answer.test.ts src/web/client/raid-ui.isolated.test.ts src/web/client/train-ui.isolated.test.ts src/web/page.test.ts src/web/party-meet.test.ts src/web/stop-popup-look.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4c75719089079d004c69e753bcef31fadbabd2ab -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A S9, S20, S21: answers where the member looks; the notice band`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/meet-dialog.ts b/src/commands/parties/meet-dialog.ts
index 908f1809f263ade23623cd9a232286597776e3de..36d56f5a684b5f750461b2016b79d98f512a3462 100644
--- a/src/commands/parties/meet-dialog.ts
+++ b/src/commands/parties/meet-dialog.ts
@@ -113,10 +113,12 @@ function chosenTime(interaction: ModalSubmitInteraction): number | null | undefi
 /**
  * What a Submit of Meet…'s dialog, or the map's form (plan 8M-8B), is told for a refusal decided
  * inside the store; `meet` names Meet… as the member sees it (on Discord by its icon, `meetIcon`,
- * as the post's hints name it; on the map in words).
+ * as the post's hints name it; on the map in words). The group the form was drawn for (`group`)
+ * changed since: said in the shape of Group…'s (plan 8M-11A, S21), "Group B has changed since:
+ * press Meet… again.", and the map's form closes on it.
  */
-export function meetSubmitRefusal(reason: string, meet: string): string | undefined {
-  if (reason === 'group-changed') return 'Your group changed meanwhile: try again.';
+export function meetSubmitRefusal(reason: string, meet: string, group: string): string | undefined {
+  if (reason === 'group-changed') return `Group ${group} has changed since: press ${meet} again.`;
   if (reason !== 'meeting-time-gone') return undefined;
   return `That time is no longer offered: press ${meet} again.`;
 }
@@ -151,7 +153,8 @@ async function submitMeet(
   });
   // Meet… by its icon (the application's, else the plain one), as the post's hints name it.
   const icon = meetIcon({ controlIcon: (name) => ctx.emoji.find(name, null) });
-  const refusal = outcome.kind === 'refused' ? meetSubmitRefusal(outcome.reason, icon) : undefined;
+  const refusal =
+    outcome.kind === 'refused' ? meetSubmitRefusal(outcome.reason, icon, groupId) : undefined;
   await say(
     refusal ?? outcomeWords(limits, party, outcome, (ok) => meetingWords(ok, member.id)).text,
   );
diff --git a/src/components/party.meet.test.ts b/src/components/party.meet.test.ts
index afbe97f0c1b34f0c82e62d2da689dd73ff4e48fe..b96e893e9624a1d201b55b698fbebab5dbff9ee2 100644
--- a/src/components/party.meet.test.ts
+++ b/src/components/party.meet.test.ts
@@ -133,7 +133,7 @@ describe('Meet… (plan 8X-1B, decision 5)', () => {
     const dialog = shownDialog(await made.press());
     await made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
     expect(answerOf(await made.submit(dialog, String(HATCH)))).toBe(
-      'Your group changed meanwhile: try again.',
+      'Group A has changed since: press ⏰ again.',
     );
     const own = shownDialog(await made.press());
     vi.setSystemTime(HATCH + MINUTE);
@@ -185,7 +185,7 @@ describe('Meet… (plan 8X-1B, decision 5)', () => {
     const moving = made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
     const submitted = await made.submit(dialog, String(HATCH));
     await moving;
-    expect(answerOf(submitted)).toBe('Your group changed meanwhile: try again.');
+    expect(answerOf(submitted)).toBe('Group A has changed since: press ⏰ again.');
     expect(made.current().groups.every((group) => group.startTime === undefined)).toBe(true);
   });
 
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index fd485c75672486825719bb21c2820b590e3ce862..81df455bb297898c8cc805f5a048ab348ed1dcf4 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -14,7 +14,7 @@ import {
   type XyzSpec,
 } from './layers.js';
 import { LOGOUT_FAILED, logOut } from './logout.js';
-import { headerLines, type Me, type WebPage } from './notice.js';
+import { headerLines, NoticeBand, type Me, type WebPage } from './notice.js';
 import { requestError } from './request-error.js';
 import { darkScheme, onThemeChange } from './theme.js';
 
@@ -43,11 +43,25 @@ export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
   return (await response.json()) as T;
 }
 
-/** A line under the header, for a moment's news (a login that failed, tiles that did not load). */
-export function say(text: string): void {
-  const notice = byId('notice');
-  notice.textContent = text;
-  notice.hidden = false;
+/**
+ * The notice band over the top of the map, for a moment's news that belongs to no party (a login
+ * that failed, tiles that did not load, a report form's answer): gone by itself after ten seconds,
+ * or by its × (plan 8M-11A, `NoticeBand`). Its text is `#notice-text`, or the band itself on a page
+ * without one.
+ */
+const noticeBand = new NoticeBand(() => {
+  const band = document.getElementById('notice');
+  if (!band) return undefined;
+  return { band, text: document.getElementById('notice-text') ?? band };
+});
+
+export function say(text: string, options: { lasting?: boolean } = {}): void {
+  noticeBand.say(text, options);
+}
+
+/** Hides the notice band at once (its ×, or a change of what is shown). */
+export function hideNotice(): void {
+  noticeBand.hide();
 }
 
 /** The Google layer of a spec: a session asked for when it is first shown, then its tiles. */
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 43aad9d0fd8b6b61b8afd572da087784296d5350..b6a437c7e202cb330e10152290903bc3db27614d 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -114,9 +114,12 @@ const colours = (): Theme['colours'] => theme().colours;
 /** Whether the editor's hosts are shown: hidden, it says nothing over the live map (F2). */
 let shownNow = false;
 
-/** Says a line on the page while the editor is shown. */
-function say(text: string): void {
-  if (shownNow) sayOnPage(text);
+/**
+ * Says a line on the page while the editor is shown; a lasting state (read-only, the browser's
+ * storage: review fix F1) stays until its × or the editor's closing hides it.
+ */
+function say(text: string, options: { lasting?: boolean } = {}): void {
+  if (shownNow) sayOnPage(text, options);
 }
 
 /** "Back to the map"'s title while a preview or a save is being sent (review 1, F2). */
@@ -652,9 +655,13 @@ class Editor {
     const stored = writeStaged(this.storage, this.key, this.state);
     if (stored !== this.stored) {
       if (stored === 'full') {
-        say("This browser's storage for the page is full: save or discard some changes.");
+        say("This browser's storage for the page is full: save or discard some changes.", {
+          lasting: true,
+        });
       } else if (stored === 'none') {
-        say('This browser keeps nothing for the page: a reload loses what is staged.');
+        say('This browser keeps nothing for the page: a reload loses what is staged.', {
+          lasting: true,
+        });
       }
     }
     this.stored = stored;
@@ -2011,7 +2018,9 @@ window.pineRegionEditor = {
       built?.map.remove();
       return { ok: false, words: EDITOR_FAILED };
     }
-    if (data.readOnly) say('Discord cannot be reached just now, so the editor is read-only.');
+    if (data.readOnly) {
+      say('Discord cannot be reached just now, so the editor is read-only.', { lasting: true });
+    }
     return { ok: true };
   },
   close: () => {
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 75209d1d84fba3726beb387c670e5e31b576c9ef..b886c313df550963a885da7ba94fed657a2a0c37 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -1,6 +1,6 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
-import { addTiles, byId, getJson, say, showAccount, tileSetting } from './common.js';
+import { addTiles, byId, getJson, hideNotice, say, showAccount, tileSetting } from './common.js';
 import {
   addressWith,
   editorByAddress,
@@ -180,7 +180,8 @@ interface MapLoad {
  * other on the page.
  */
 function sayOverMap(text: string, load: MapLoad): void {
-  say(load.failed ? `${text} ${MAP_FAILED}` : text);
+  // The map that did not load is a lasting state (review fix F1): no timer then.
+  say(load.failed ? `${text} ${MAP_FAILED}` : text, { lasting: load.failed });
 }
 
 /**
@@ -232,10 +233,8 @@ function editorToggle(
     shown: (on, focus) => {
       // A line of one side is not left over the other (review 1, F3); back on the live map, its
       // failure to load is said again (review 2, R3).
-      const notice = byId('notice');
-      notice.textContent = '';
-      notice.hidden = true;
-      if (!on && load.failed) say(MAP_FAILED);
+      hideNotice();
+      if (!on && load.failed) say(MAP_FAILED, { lasting: true });
       document.body.classList.toggle('editing-regions', on);
       for (const id of ['editor-bar', 'editor-map', 'editor-panel']) byId(id).hidden = !on;
       history.replaceState(
@@ -317,6 +316,10 @@ function start(): void {
     if (text !== undefined) say(text);
   });
   const you = showWhereYouAre(map, say);
+  // The notice band's × (plan 8M-11A): hidden at once.
+  byId('notice-close').addEventListener('click', () => {
+    hideNotice();
+  });
   // On a phone (`map.css`) "List" swaps the map for the list of what is on, and back (plan 8M-7).
   const listButton = byId('list-button');
   const showList = (open: boolean): void => {
@@ -483,7 +486,7 @@ function start(): void {
     // Leaflet draws nothing until the map has a view.
     if (!map.getZoom()) map.setView([40.44, -79.99], 11);
     load.failed = true;
-    say(MAP_FAILED);
+    say(MAP_FAILED, { lasting: true });
   });
   // `/s/<guild>/regions/edit` led here (plan 8M-10, C5): once the map is drawn or could not be
   // (review 1, F8: the editor opens at its view either way), and the member is known.
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 0e82611d4a51bd74aca605aa45794080d55a5a30..8a4b63133f9ccf08e1c4e5d9e278bb94ec44a198 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -458,7 +458,6 @@ body.editing-regions #map {
   font-size: 12px;
 }
 
-#notice,
 #read-only {
   margin: 0;
   padding: 6px 12px;
@@ -466,7 +465,47 @@ body.editing-regions #map {
   border-bottom: 1px solid var(--notice-border);
 }
 
+/*
+ * The notice band (plan 8M-11A): over the top of the map, never pushing its controls down; its
+ * lines kept (research answers read as lines), its × at the end. It goes away by itself after ten
+ * seconds (`NoticeBand`).
+ */
+#notice {
+  position: absolute;
+  top: 8px;
+  left: 50%;
+  z-index: 1050;
+  display: flex;
+  align-items: flex-start;
+  gap: 8px;
+  max-width: min(560px, calc(100% - 24px));
+  margin: 0;
+  padding: 6px 6px 6px 12px;
+  transform: translateX(-50%);
+  border: 1px solid var(--notice-border);
+  border-radius: var(--radius);
+  background: var(--notice-bg);
+  color: var(--text);
+  box-shadow: 0 2px 8px var(--shadow);
+  white-space: pre-line;
+}
+
+#notice[hidden] {
+  display: none;
+}
+
+#notice-close {
+  padding: 0 4px;
+  border: 0;
+  background: none;
+  color: var(--text);
+  font-size: 18px;
+  line-height: 1;
+  cursor: pointer;
+}
+
 #content {
+  position: relative;
   flex: 1;
   display: flex;
   min-height: 300px;
@@ -1965,8 +2004,60 @@ path.highlighted {
   line-height: 1;
 }
 
-.post .on-discord {
+/*
+ * The answer line under a post's buttons (plan 8M-11A, S9): what the member's last press answered,
+ * a refusal in red, its lines kept (S17); nothing while empty. The completion question (S21) is
+ * drawn above the buttons in its style.
+ */
+.post .press-answer,
+.post .completion {
   margin-top: 6px;
+  padding: 6px 8px;
+  border-radius: var(--radius);
+  background: var(--answer-bg);
+  color: var(--answer-text);
+  white-space: pre-line;
+}
+
+.post .press-answer:empty {
+  display: none;
+}
+
+.post .press-answer.refused {
+  background: var(--answer-refused-bg);
+  color: var(--answer-refused-text);
+}
+
+/* The note box's link to the post is a button (plan 8M-11A): no underline. */
+.note-box a.press {
+  display: inline-flex;
+  align-items: center;
+  text-decoration: none;
+}
+
+/* A refusal shakes the popup or the card once, unless the device asks for less motion. */
+@keyframes shake {
+  0%,
+  100% {
+    transform: translateX(0);
+  }
+
+  20%,
+  60% {
+    transform: translateX(calc(-1 * var(--shake-distance)));
+  }
+
+  40%,
+  80% {
+    transform: translateX(var(--shake-distance));
+  }
+}
+
+@media (prefers-reduced-motion: no-preference) {
+  .leaflet-popup.shake .leaflet-popup-content-wrapper,
+  .party-card.shake {
+    animation: shake var(--shake-time) ease-in-out 1;
+  }
 }
 
 .post-popup .mine-part {
@@ -2081,22 +2172,21 @@ path.highlighted {
 }
 
 /* The completion question to the member it asked (plan 8M-8B), with its two answers. */
-.post-popup .completion {
+.post .completion {
   display: flex;
   flex-direction: column;
   gap: 4px;
 }
 
-.post-popup .completion .question {
+.post .completion .question {
   font-weight: 600;
 }
 
-.post-popup .completion .small {
+.post .completion .small {
   font-size: 12px;
-  color: var(--muted);
 }
 
-.post-popup .completion .post-row {
+.post .completion .post-row {
   display: flex;
   gap: 6px;
 }
@@ -2242,13 +2332,24 @@ path.highlighted {
 
 .party-card.summary .post > .post-text:not(.role-head),
 .party-card.summary .post > .post-line,
-.party-card.summary .post .post-row:not(:first-child),
-.party-card.summary .post .on-discord,
+.party-card.summary .post .post-controls .post-row:not(:first-child),
 .party-card.summary .post-popup > :not(.post, .map-line, .mine-part, .back),
-.party-card.summary .mine-part > :not(.mine, .group-pick, .completion) {
+.party-card.summary .mine-part > :not(.mine, .group-pick) {
   display: none;
 }
 
+/* The card asks the completion question (plan 8M-11A, S21): a dot on its handle, not missed. */
+.party-card.summary:has(.post .completion) .card-handle::after {
+  content: '';
+  display: inline-block;
+  width: 8px;
+  height: 8px;
+  margin-left: 6px;
+  border-radius: 50%;
+  background: var(--question-dot);
+  vertical-align: middle;
+}
+
 /* A Power Spot's popup and the max battle form (plan 8M-9A): the ending-soon question as a
    choice of the dialog's look. */
 .place-popup {
diff --git a/src/web/client/notice.test.ts b/src/web/client/notice.test.ts
index 7160c4bf5361ecd0e10cae2cbbdefd3d24a60d7d..7bd9fa85a12b129f4c23d1782fdc755ecd32b245 100644
--- a/src/web/client/notice.test.ts
+++ b/src/web/client/notice.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { headerLines, loginNotice, loginNoticeFor } from './notice.js';
+import { headerLines, loginNotice, loginNoticeFor, NOTICE_MS, NoticeBand } from './notice.js';
 
 describe('loginNotice', () => {
   it('says once why a login did not happen, and gives the address without it', () => {
@@ -96,3 +96,84 @@ describe('headerLines', () => {
     });
   });
 });
+
+describe('the notice band (plan 8M-11A)', () => {
+  /** The band and its text, and timers a test runs by hand. */
+  function band() {
+    const parts = { band: { hidden: true }, text: { textContent: '' as string | null } };
+    const timers: { run: () => void; ms: number; cleared: boolean }[] = [];
+    const notice = new NoticeBand(() => parts, {
+      set: (run, ms) => {
+        timers.push({ run, ms, cleared: false });
+        return timers.length - 1;
+      },
+      clear: (id) => {
+        const timer = typeof id === 'number' ? timers[id] : undefined;
+        if (timer) timer.cleared = true;
+      },
+    });
+    return { parts, timers, notice };
+  }
+
+  it('says a line and hides it by itself after ten seconds', () => {
+    const { parts, timers, notice } = band();
+    notice.say('Your report is in.');
+    expect(parts).toEqual({ band: { hidden: false }, text: { textContent: 'Your report is in.' } });
+    expect(timers.map((timer) => timer.ms)).toEqual([NOTICE_MS]);
+    timers[0]?.run();
+    expect(parts.band.hidden).toBe(true);
+  });
+
+  it('starts the ten seconds again with a new line', () => {
+    const { parts, timers, notice } = band();
+    notice.say('One.');
+    notice.say('Two.');
+    expect(timers[0]?.cleared).toBe(true);
+    expect(parts.text.textContent).toBe('Two.');
+    timers[1]?.run();
+    expect(parts.band.hidden).toBe(true);
+  });
+
+  it('hides at once by its ×', () => {
+    const { parts, timers, notice } = band();
+    notice.say('One.');
+    notice.hide();
+    expect(parts.band.hidden).toBe(true);
+    expect(timers[0]?.cleared).toBe(true);
+  });
+
+  // Review fix F1: a lasting state (the map that did not load, the editor read-only, the
+  // browser's storage) stays until the × or the page hides it, never timed out.
+  it('keeps a lasting line until its × or the page hides it', () => {
+    const { parts, timers, notice } = band();
+    notice.say('One.');
+    notice.say('The map could not be loaded.', { lasting: true });
+    expect(timers[0]?.cleared).toBe(true);
+    expect(timers).toHaveLength(1);
+    expect(parts).toEqual({
+      band: { hidden: false },
+      text: { textContent: 'The map could not be loaded.' },
+    });
+    notice.hide();
+    expect(parts.band.hidden).toBe(true);
+  });
+
+  // Review fix R2: a timed line over a lasting one gives the lasting one back when its ten seconds
+  // are over; the × and the page's hiding forget it.
+  it('puts the lasting line back when a timed line over it runs out, until its × hides it', () => {
+    const { parts, timers, notice } = band();
+    notice.say('The map could not be loaded.', { lasting: true });
+    notice.say('Your report is in.');
+    expect(parts.text.textContent).toBe('Your report is in.');
+    timers[0]?.run();
+    expect(parts).toEqual({
+      band: { hidden: false },
+      text: { textContent: 'The map could not be loaded.' },
+    });
+    notice.hide();
+    expect(parts.band.hidden).toBe(true);
+    notice.say('Your report is in.');
+    timers[1]?.run();
+    expect(parts.band.hidden).toBe(true);
+  });
+});
diff --git a/src/web/client/notice.ts b/src/web/client/notice.ts
index 41bb43453e495d31a3dcadca73bc6dabd4c73a3f..4f9087886b89b5bb65e62f89e2e2a400c5d70ce6 100644
--- a/src/web/client/notice.ts
+++ b/src/web/client/notice.ts
@@ -19,6 +19,85 @@ export type Me =
       mayEditRegions?: boolean;
     };
 
+/** How long the notice band shows a line (plan 8M-11A): a new line starts the time again. */
+export const NOTICE_MS = 10_000;
+
+/** The notice band's parts on the page: the band, and its text beside its ×. */
+export interface NoticeParts {
+  band: { hidden: boolean | string };
+  text: { textContent: string | null };
+}
+
+/** Timers, the browser's by default. */
+export interface NoticeTimers {
+  set(run: () => void, ms: number): unknown;
+  clear(id: unknown): void;
+}
+
+/**
+ * The notice band (`#notice`, plan 8M-11A): the moment's news that belongs to no party (a report
+ * form's answer, the tiles, a login), over the top of the map rather than pushing it down
+ * (`map.css`). A line goes away by itself after `NOTICE_MS`, a new line starting the time again;
+ * its × hides it at once. A lasting state (`lasting`: the map that did not load, the editor
+ * read-only, the browser's storage; review fix F1) has no timer: it stays until its × or the page
+ * hides it. The answers of presses go to their post's answer line instead.
+ */
+export class NoticeBand {
+  private timer: unknown;
+  /**
+   * The lasting line said last (review fix R2): a timed line over it gives it back when its time
+   * is over; the × and the page's hiding forget it.
+   */
+  private lasting: string | undefined;
+
+  constructor(
+    private readonly parts: () => NoticeParts | undefined,
+    private readonly timers: NoticeTimers = {
+      set: (run, ms) => globalThis.setTimeout(run, ms),
+      clear: (id) => {
+        globalThis.clearTimeout(id as ReturnType<typeof setTimeout> | undefined);
+      },
+    },
+  ) {}
+
+  say(text: string, options: { lasting?: boolean } = {}): void {
+    const parts = this.parts();
+    if (!parts) return;
+    parts.text.textContent = text;
+    parts.band.hidden = false;
+    this.timers.clear(this.timer);
+    this.timer = undefined;
+    if (options.lasting === true) {
+      this.lasting = text;
+      return;
+    }
+    this.timer = this.timers.set(() => {
+      this.timedOut();
+    }, NOTICE_MS);
+  }
+
+  hide(): void {
+    this.lasting = undefined;
+    this.timers.clear(this.timer);
+    this.timer = undefined;
+    const parts = this.parts();
+    if (!parts) return;
+    parts.band.hidden = true;
+    parts.text.textContent = '';
+  }
+
+  /** A timed line ran out: the lasting line back where there is one, else the band hidden. */
+  private timedOut(): void {
+    this.timer = undefined;
+    const { lasting } = this;
+    if (lasting === undefined) {
+      this.hide();
+      return;
+    }
+    this.say(lasting, { lasting: true });
+  }
+}
+
 /** What `?login=` may say; a `Map`, so that no name of `Object.prototype` is one of them. */
 const NOTICES: ReadonlyMap<string, string> = new Map([
   ['failed', 'Login failed.'],
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index a2fde6f97dbab2371b6e7d0a41a627bbc809c52c..cdecd384d31efd1521623da082285d8594298fe6 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -691,7 +691,11 @@ describe('pressParty', () => {
     const { steps, posted } = pressSteps([
       { status: 200, body: { ok: true, text: 'You are coming.' } },
     ]);
-    expect(await pressParty('token', steps)).toEqual({ text: 'You are coming.', csrf: 'token' });
+    expect(await pressParty('token', steps)).toEqual({
+      text: 'You are coming.',
+      ok: true,
+      csrf: 'token',
+    });
     expect(posted).toEqual(['token']);
   });
 
@@ -699,7 +703,10 @@ describe('pressParty', () => {
     const refused = pressSteps([
       { status: 422, body: { ok: false, text: 'This raid has not hatched yet.' } },
     ]);
-    expect((await pressParty('token', refused.steps)).text).toBe('This raid has not hatched yet.');
+    expect(await pressParty('token', refused.steps)).toMatchObject({
+      text: 'This raid has not hatched yet.',
+      ok: false,
+    });
     const limited = pressSteps([
       { status: 429, body: { error: 'That was a lot of clicks. Try again in 1 minute.' } },
     ]);
@@ -707,7 +714,11 @@ describe('pressParty', () => {
       'That was a lot of clicks. Try again in 1 minute.',
     );
     const broken = pressSteps([new Error('offline')]);
-    expect(await pressParty('token', broken.steps)).toEqual({ text: PRESS_FAILED, csrf: 'token' });
+    expect(await pressParty('token', broken.steps)).toEqual({
+      text: PRESS_FAILED,
+      ok: false,
+      csrf: 'token',
+    });
   });
 
   it('asks for the token again once when the page has a stale one (after a restart)', async () => {
@@ -719,7 +730,11 @@ describe('pressParty', () => {
       ],
       me,
     );
-    expect(await pressParty('old', steps)).toEqual({ text: 'You are here.', csrf: 'new' });
+    expect(await pressParty('old', steps)).toEqual({
+      text: 'You are here.',
+      ok: true,
+      csrf: 'new',
+    });
     expect(posted).toEqual(['old', 'new']);
     // A refusal with a token that is current is not tried again.
     const same = pressSteps([{ status: 403, body: { error: 'Not allowed.' } }], {
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index f092c7b4572dc8b25912b35891babef64a21f940..a25c79571e1cd119a2176098a0da24a82a348f71 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -543,15 +543,17 @@ export interface PressSteps {
  */
 export interface Pressed {
   text: string;
+  /** Whether it was done (`{ ok: true }`); a refusal or a failure is not (plan 8M-11A). */
+  ok: boolean;
   csrf: string;
 }
 
 /** The words of an answer: the press's outcome, or the few words of a failure. */
-function answered(body: unknown): { text: string } | undefined {
+function answered(body: unknown): { text: string; ok: boolean } | undefined {
   if (typeof body !== 'object' || body === null) return undefined;
-  const { text, error } = body as { text?: unknown; error?: unknown };
-  if (typeof text === 'string') return { text };
-  return typeof error === 'string' ? { text: error } : undefined;
+  const { text, error, ok } = body as { text?: unknown; error?: unknown; ok?: unknown };
+  if (typeof text === 'string') return { text, ok: ok === true };
+  return typeof error === 'string' ? { text: error, ok: false } : undefined;
 }
 
 /**
@@ -571,9 +573,9 @@ export async function pressParty(csrf: string, steps: PressSteps): Promise<Press
         answer = await steps.post(token);
       }
     }
-    return { ...(answered(answer.body) ?? { text: PRESS_FAILED }), csrf: token };
+    return { ...(answered(answer.body) ?? { text: PRESS_FAILED, ok: false }), csrf: token };
   } catch {
-    return { text: PRESS_FAILED, csrf };
+    return { text: PRESS_FAILED, ok: false, csrf };
   }
 }
 
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 0b495b9861b0a23c8c857ad01752a3d686e6b72c..298acc0384cae0f417f3f928067cf9979a49abe7 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -27,6 +27,7 @@ import { renderNode, type MapGym, type PageNode } from './popup.js';
 import { FormHold, keepClicksInPopup, OpenPopup, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
 import { postFormsUi } from './post-forms-ui.js';
+import { ANSWER_MS, PressAnswers, shake, writeAnswer, type PressAnswer } from './press-answer.js';
 import { showsParty } from './post-forms.js';
 import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
@@ -749,6 +750,7 @@ export function showParties(
     origin: location.origin,
     guild,
     ...(panelsOpen.has(party.id) ? { opened: panelsOpen.get(party.id) } : {}),
+    ...answerOf(party.id),
     stopName: (key) =>
       stopName(gyms.get(Number(key)), key, party.kind === 'train' ? party.spots : []),
     place: placeOf(party),
@@ -782,6 +784,27 @@ export function showParties(
   let firstList = true;
   /** What is open under each party's post, by party (review 8A-10), kept across redraws. */
   const panelsOpen = new Map<string, PanelsOpen>();
+  /** The answers of the member's presses, by party, kept across redraws (plan 8M-11A, S9). */
+  const answers = new PressAnswers(() => Date.now());
+  /** A party's answer for its post's context, while it is kept. */
+  const answerOf = (partyId: string): { answer?: PressAnswer } => {
+    const answer = answers.of(partyId);
+    return answer === undefined ? {} : { answer };
+  };
+  /**
+   * An answer of a press or a form on a party (plan 8M-11A, S9, S20): kept for its post's answer
+   * line, written into the lines drawn now (the notice where the party shows none: its popup not
+   * drawn from its post yet), its popup or card shaken for a refusal, and taken out of the lines
+   * after `ANSWER_MS` unless a newer one came.
+   */
+  const answered = (partyId: string, answer: PressAnswer, from: Element): void => {
+    answers.set(partyId, answer);
+    if (!writeAnswer(document, partyId, answer)) say(answer.text);
+    if (!answer.ok) shake(from);
+    window.setTimeout(() => {
+      if (answers.of(partyId) === undefined) writeAnswer(document, partyId, undefined);
+    }, ANSWER_MS);
+  };
 
   /**
    * A gym's raids' popup: the one raid's post, or with several the list of their heading lines,
@@ -851,6 +874,9 @@ export function showParties(
       if (showing.key !== undefined && showsParty(showing.key, party)) map.closePopup();
       if (card.key !== undefined && showsParty(card.key, party)) card.close();
     },
+    answered: (party, answer, from) => {
+      answered(party.id, answer, from);
+    },
   });
 
   const press = async (button: HTMLButtonElement): Promise<void> => {
@@ -890,8 +916,13 @@ export function showParties(
       me: () => getJson<Me>(`/s/${guild}/api/me`),
     });
     csrf = pressed.csrf;
-    say(pressed.text);
     for (const each of buttons) each.disabled = false;
+    // In the post's answer line, where the member looks (plan 8M-11A, S9); a refusal shakes.
+    answered(
+      party,
+      { text: pressed.text, ok: pressed.ok },
+      button.isConnected ? button : (scope ?? button),
+    );
     await poller.now();
   };
 
@@ -1001,22 +1032,13 @@ export function showParties(
     };
     const { onDiscord, focusPick, toggle, showRaid } = target.dataset;
     if (onDiscord !== undefined) {
-      const line = target.closest('.post')?.querySelector<HTMLElement>('.on-discord');
-      if (line) {
-        line.hidden = false;
-        // Why not (reviews 8A-12, N1) in the place of the link, or the link to the post; the
-        // button pressed is kept, worded again at each draw (review N3).
-        const words = target.dataset.why ?? '';
-        const why = line.querySelector<HTMLElement>('.why');
-        const link = line.querySelector<HTMLElement>('.to-post');
-        if (why) why.textContent = words;
-        if (link) link.hidden = words !== '';
-        // The link's words for this button, as the post's drawing gave them (reviews W-1, N-4).
-        const { link: linkWords } = target.dataset;
-        if (link && linkWords !== undefined) link.textContent = linkWords;
-        (words === '' ? link : why)?.focus();
-      }
-      open({ discord: onDiscord });
+      // Why not (reviews 8A-12, N1) as a refusal in the answer line, the popup or card shaken;
+      // else the note box in the form's place, with the post's link (plan 8M-11A, S9, S20).
+      const why = target.dataset.why ?? '';
+      const party = partyId === undefined ? undefined : partyById(partyId);
+      if (party === undefined) return;
+      if (why !== '') answered(party.id, { text: why, ok: false }, target);
+      else postForms.noteClicked(target, party, target.dataset.note ?? '');
     } else if (focusPick !== undefined) {
       popup?.querySelector<HTMLSelectElement>('select[data-group-pick]')?.focus();
     } else if (toggle === 'route') {
@@ -1584,6 +1606,13 @@ export function showParties(
   // Reporting and changing raids (plan 8M-4): after a success the list at once, and the raid's
   // gym opened; while a form is open nothing is drawn anew under it.
   const raidForms = raidUi({
+    // A change's answer in its post's answer line, a refusal shaking its form (review fix F4).
+    answered: (raidId, answer, from) => {
+      answered(raidId, answer, from);
+    },
+    refused: (form) => {
+      shake(form);
+    },
     guild,
     csrf: {
       get: () => csrf,
@@ -1686,6 +1715,9 @@ export function showParties(
   // at once, and the train's popup opened.
   const routeLayer = L.layerGroup().addTo(map);
   const trainForms = trainUi({
+    answered: (partyId, answer, from) => {
+      answered(partyId, answer, from);
+    },
     guild,
     csrf: {
       get: () => csrf,
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 61d57eb0c43eb6aa7e63fea4106728b3d2583c98..7fedd3d5a0c46867b01fd50de3803e6ebe318104 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -15,6 +15,7 @@ import {
   postPopup,
   raidChoices,
   safeHref,
+  ON_DISCORD_NOTE,
   type PostDrawContext,
 } from './post-draw.js';
 
@@ -302,10 +303,12 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(shown.find((one) => one.text === 'Group…')?.attributes).toMatchObject({
       'data-focus-pick': '',
     });
-    const discord = byClass(postCard(VIEW, raid(), context), 'on-discord')[0];
-    expect(discord?.attributes).toMatchObject({ hidden: '' });
-    expect(discord && all(discord).find((one) => one.tag === 'a')?.attributes?.href).toBe(LINK);
-    expect(discord && seen(discord)).toBe('Do this on Discord →');
+    // Plan 8M-11A (S9): no line to Discord under the buttons; the note box says it when pressed.
+    expect(byClass(postCard(VIEW, raid(), context), 'on-discord')).toEqual([]);
+    expect(plain.find((one) => one.text === 'Set time…')?.attributes).toMatchObject({
+      'data-why': '',
+      'data-note': ON_DISCORD_NOTE,
+    });
   });
 
   // Plan 8M-8B: Group… opens the map's form from the choices the list carries, or says why not.
@@ -336,15 +339,6 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
       'data-on-discord': 'group',
       'data-why': 'You are done with this raid. Use Join or Here if you are back.',
     });
-    // Pressed (kept across redraws), the line says why in the place of the post's link.
-    const line = byClass(
-      postCard(VIEW, refused, { ...context, opened: { discord: 'group' } }),
-      'on-discord',
-    )[0];
-    expect(line && seen(line)).toBe(
-      'You are done with this raid. Use Join or Here if you are back.Do this on Discord →',
-    );
-    expect(line && all(line).find((one) => one.tag === 'a')?.attributes).toHaveProperty('hidden');
   });
 
   // Review B-2: a button the post drew off (Group… while nobody is signed up) gets no form
@@ -386,16 +380,42 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(group?.attributes).not.toHaveProperty('data-regroup');
   });
 
-  // Review N-4: the page reads the link's words off the button pressed, never works them out again.
-  it('gives every button that sends to Discord the words of the link it shows', () => {
+  // Review N-4, plan 8M-11A (S9): the page reads the note's words off the button pressed.
+  it('gives every button that sends to Discord the words of the note it shows', () => {
     const buttons = buttonsOf(postCard(VIEW, raid(), context));
     const onDiscord = buttons.filter((one) => one.attributes?.['data-on-discord'] !== undefined);
     expect(onDiscord.length).toBeGreaterThan(0);
-    expect(onDiscord.map((one) => one.attributes?.['data-link'])).toEqual(
-      onDiscord.map(() => 'Do this on Discord →'),
+    expect(onDiscord.map((one) => one.attributes?.['data-note'])).toEqual(
+      onDiscord.map(() => ON_DISCORD_NOTE),
     );
   });
 
+  // Plan 8M-11A (S9, S20): the answer of a press in a line of the post, under its buttons.
+  it('draws the answer line under the post’s buttons: empty, an answer, a refusal', () => {
+    const blocks = (node: PageNode) => node.children ?? [];
+    const card = postCard(VIEW, raid(), context);
+    const at = blocks(card).findIndex((one) => one.className === 'post-controls');
+    expect(blocks(card)[at + 1]).toEqual({
+      tag: 'div',
+      className: 'press-answer',
+      text: '',
+      attributes: { role: 'status' },
+    });
+    const answered = postCard(VIEW, raid(), {
+      ...context,
+      answer: { text: 'You are coming.', ok: true },
+    });
+    expect(byClass(answered, 'press-answer')[0]?.text).toBe('You are coming.');
+    const refused = postCard(VIEW, raid(), {
+      ...context,
+      answer: { text: 'Only the conductor may move it.', ok: false },
+    });
+    expect(byClass(refused, 'press-answer')[0]).toMatchObject({
+      className: 'press-answer refused',
+      text: 'Only the conductor may move it.',
+    });
+  });
+
   // Review W-1: a new group the only way, Group… links the post: "Start a new group on Discord →".
   it('sends Group… to the post where a new group is the only way', () => {
     const only = raid({
@@ -405,18 +425,12 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
       }),
     });
     const group = buttonsOf(postCard(VIEW, only, context)).find((one) => one.text === 'Group…');
+    // Plan 8M-11A (S9): a note in the form's place, with the post's link as a button.
     expect(group?.attributes).toMatchObject({
       'data-on-discord': 'group',
       'data-why': '',
-      'data-link': 'Start a new group on Discord →',
-    });
-    const line = byClass(
-      postCard(VIEW, only, { ...context, opened: { discord: 'group' } }),
-      'on-discord',
-    )[0];
-    const link = line && all(line).find((one) => one.tag === 'a');
-    expect(link?.text).toBe('Start a new group on Discord →');
-    expect(link?.attributes).not.toHaveProperty('hidden');
+      'data-note': 'A new group is started on Discord.',
+    });
   });
 
   // Plan 8M-8B: Meet… opens the map's form (which asks the server what it offers), off while
@@ -562,6 +576,17 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       }),
     });
     const question = byClass(postPopup(VIEW, asked, placed), 'completion')[0];
+    // Plan 8M-11A (S21): in the post, above its buttons, not at the popup's end.
+    const card = postCard(VIEW, asked, context);
+    const parts = card.children ?? [];
+    expect(parts.findIndex((one) => one.className === 'completion')).toBe(
+      parts.findIndex((one) => one.className === 'post-controls') - 1,
+    );
+    expect(
+      byClass(postPopup(VIEW, asked, placed), 'mine-part').flatMap((one) =>
+        byClass(one, 'completion'),
+      ),
+    ).toEqual([]);
     expect(question && seen(question)).toBe(
       'Have you completed this max battle?Without an answer by 11:10 AM I will take it that you have.' +
         'Yes, doneNot yet',
@@ -777,28 +802,22 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
     expect(pressed(readOnly, 'Move…')?.['data-why']).toBe(WORDS['read-only']);
   });
 
-  it('keeps Route and the line to Discord open across a redraw, worded anew (8A-10, N3)', () => {
-    const popupOf = (party: MapTrain) =>
-      postPopup(trainView, party, {
-        ...context,
-        place: undefined,
-        located: undefined,
-        units: 'imperial',
-        opened: { route: true, discord: 'moves' },
-      });
-    const popup = popupOf(
+  it('keeps Route open across a redraw (8A-10)', () => {
+    const popup = postPopup(
+      trainView,
       train({
         may: { arrange: true, clear: false, load: false },
         moveRefusal: refused('not-attending'),
       }),
+      {
+        ...context,
+        place: undefined,
+        located: undefined,
+        units: 'imperial',
+        opened: { route: true },
+      },
     );
     expect(byClass(popup, 'route')[0]?.attributes).not.toHaveProperty('hidden');
-    const discord = byClass(popup, 'on-discord')[0];
-    expect(discord?.attributes).not.toHaveProperty('hidden');
-    expect(discord && seen(discord)).toContain(WORDS['not-attending']);
-    // The train changed meanwhile (a conductor now): the line says what holds now.
-    const now = byClass(popupOf(train()), 'on-discord')[0];
-    expect(now && seen(now)).toContain(WORDS['not-conductor']);
   });
 
   it('links only this server’s posts on Discord and Google Maps itself (8A-13)', () => {
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index caf684d60b26cadc0a024857d6ceb5eb379409cb..2197e8a843c212510313c614f4b1068ea00589b0 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -14,6 +14,7 @@ import { groupPick, STATUS_WORDS } from './parties.js';
 import { directionsLink, type PageNode } from './popup.js';
 import { postTime, type TimeShown } from './post-time.js';
 import { spawnBox } from './spawn-forms.js';
+import { answerLine, type PressAnswer } from './press-answer.js';
 
 /**
  * A party's post drawn on the live map (plan 8M-8A): the post view the server made of the layout
@@ -35,21 +36,18 @@ export interface PostDrawContext {
   time?: TimeShown;
   /** A stop of a train's route by its key, as the map names it (`stopName`). */
   stopName(key: string): string;
+  /** What the member opened under this party's post, kept across redraws (review 8A-10). */
+  opened?: PanelsOpen;
   /**
-   * What the member opened under this party's post, kept across redraws (review 8A-10): Route's
-   * part, and the line to Discord.
+   * The answer of the member's last press on this party (plan 8M-11A, S9), kept by the page for
+   * `ANSWER_MS` across redraws, drawn in the answer line under the post's buttons.
    */
-  opened?: PanelsOpen;
+  answer?: PressAnswer;
 }
 
-/** What is open under a party's post (`PostDrawContext.opened`). */
+/** What is open under a party's post (`PostDrawContext.opened`): Route's part. */
 export interface PanelsOpen {
   route?: boolean;
-  /**
-   * The line to Discord, by the button pressed (`moves`, `manage`, or `''` for another), worded
-   * again at each draw (`whyNot`, review N3).
-   */
-  discord?: string;
 }
 
 /** The map's part of a popup: where the party is and where the member is. */
@@ -179,18 +177,19 @@ function panelAttributes(
       if (pick !== undefined && pick.length > 0) return { 'data-focus-pick': '' };
       if (regroup === undefined) return 'off';
       if ('onlyNewGroup' in regroup) {
-        // A new group the only way (review W-1): nothing to submit here, the post's link.
+        // A new group the only way (review W-1): nothing to submit here, the note with the post's
+        // link (plan 8M-11A, S9).
         return {
           'data-on-discord': 'group',
           'data-why': '',
-          'data-link': discordLink(party, 'group'),
+          'data-note': discordNote(party, 'group'),
         };
       }
       return 'refused' in regroup
         ? {
             'data-on-discord': 'group',
             'data-why': regroup.refused,
-            'data-link': discordLink(party, 'group'),
+            'data-note': discordNote(party, 'group'),
           }
         : { 'data-regroup': party.id };
     }
@@ -219,26 +218,31 @@ function panelAttributes(
   }
 }
 
+/** The note of a button the map leaves to Discord (plan 8M-11A, S9), beside the post's link. */
+export const ON_DISCORD_NOTE = 'This is done in the post on Discord.';
+
+/** The note where Group… can only start a new group (review W-1, plan 8M-11A S9). */
+export const NEW_GROUP_NOTE = 'A new group is started on Discord.';
+
 /**
- * The words of the line's link to the post for the button pressed: "Start a new group on
- * Discord →" for Group… where a new group is the only way (review W-1), else "Do this on
- * Discord →".
+ * The words of the note box that a button done on Discord shows in the form's place (plan 8M-11A,
+ * S9), with "Open the post on Discord": `NEW_GROUP_NOTE` for Group… where a new group is the only
+ * way (review W-1), else `ON_DISCORD_NOTE`.
  */
-export function discordLink(party: MapParty, button: string): string {
+export function discordNote(party: MapParty, button: string): string {
   const { regroup } = party.attendance;
   return button === 'group' && regroup !== undefined && 'onlyNewGroup' in regroup
-    ? 'Start a new group on Discord →'
-    : 'Do this on Discord →';
+    ? NEW_GROUP_NOTE
+    : ON_DISCORD_NOTE;
 }
 
 /**
- * What the line under the buttons says where the map has no panel of a button for the member
- * (reviews 8A-12, N1): for a train's Move… and Manage…, why they may not, as the server decided
- * and worded it (`MapTrain.moveRefusal`: the commands' `mayNotMove`, no route, read-only, in
- * Discord's words; plan 8M-8C, review C1: the page words none itself); else nothing, and the line
- * sends the member to the post ("Do this on Discord"). `button` is which button was pressed
- * (`moves`, `manage`, or another's `''`), said anew at each draw from the party as it is then
- * (review N3).
+ * Why the member may not use a button the map has no panel of for them (reviews 8A-12, N1): for
+ * a train's Move… and Manage…, as the server decided and worded it (`MapTrain.moveRefusal`: the
+ * commands' `mayNotMove`, no route, read-only, in Discord's words; plan 8M-8C, review C1: the page
+ * words none itself); else nothing, and the button opens the note to do it on Discord. Said in the
+ * answer line as a refusal (plan 8M-11A, S20). `button` is which button was pressed (`moves`,
+ * `manage`, `group`, or another's).
  */
 export function whyNot(party: MapParty, button: string): string {
   // Group…'s refusal before it opens (plan 8M-8B), as the post's dialog says it.
@@ -284,7 +288,7 @@ function controlNode(button: PostButtonView, party: MapParty, context: PostDrawC
       doing = attributes ?? {
         'data-on-discord': does.panel,
         'data-why': whyNot(party, does.panel),
-        'data-link': discordLink(party, does.panel),
+        'data-note': discordNote(party, does.panel),
       };
     }
   } else {
@@ -354,41 +358,31 @@ function blockNode(block: PostViewBlock, party: MapParty, context: PostDrawConte
 
 /**
  * The post as Discord draws it: its edge (`accent-<name>`, a value of `theme.css`), its parts in
- * order, and under its buttons the line "Do this on Discord →" (the post's link), hidden until a
- * button the map has no form for is pressed.
+ * order; the completion question to the member it asked above its buttons (plan 8M-11A, S21), and
+ * under them the answer line of the member's presses (`answerLine`, S9), which the phone card's
+ * summary shows too.
  */
 export function postCard(view: PostView, party: MapParty, context: PostDrawContext): PageNode {
-  const href = safeHref(party.link, context.origin, context.guild);
-  // Open across redraws (review 8A-10), by the button pressed, worded anew from the party as it
-  // is now (review N3); why not, where the server said (reviews 8A-12, N1), in the place of the
-  // link.
-  const pressed = context.opened?.discord;
-  const why = pressed === undefined ? undefined : whyNot(party, pressed);
+  const blocks = view.blocks.map((block) => blockNode(block, party, context));
+  const first = view.blocks.findIndex((block) => block.type === 'controls');
+  const last = view.blocks.findLastIndex((block) => block.type === 'controls');
+  const question = completionPart(party, context);
+  const answer = answerLine(context.answer);
+  const children =
+    first === -1
+      ? [...blocks, ...question, answer]
+      : [
+          ...blocks.slice(0, first),
+          ...question,
+          ...blocks.slice(first, last + 1),
+          answer,
+          ...blocks.slice(last + 1),
+        ];
   return {
     tag: 'div',
     className: `post accent-${view.accent}`,
     attributes: { 'data-post': party.id },
-    children: [
-      ...view.blocks.map((block) => blockNode(block, party, context)),
-      {
-        tag: 'div',
-        className: 'on-discord',
-        attributes: why === undefined ? { hidden: '' } : {},
-        children: [
-          { tag: 'span', className: 'why', text: why ?? '' },
-          ...(href === undefined
-            ? []
-            : [
-                {
-                  tag: 'a',
-                  className: 'to-post',
-                  text: discordLink(party, pressed ?? ''),
-                  attributes: { href, ...NEW_TAB, ...(why ? { hidden: '' } : {}) },
-                },
-              ]),
-        ],
-      },
-    ],
+    children,
   };
 }
 
@@ -493,7 +487,7 @@ function minePart(party: MapParty, context: PostDrawContext): PageNode[] {
           ? meetupActions(party)
           : [];
   const pick = groupPick(party.attendance);
-  const parts = [...completionPart(party, context), ...you, ...pick, ...own];
+  const parts = [...you, ...pick, ...own];
   return parts.length === 0 ? [] : [{ tag: 'div', className: 'mine-part', children: parts }];
 }
 
diff --git a/src/web/client/post-forms-ui.isolated.test.ts b/src/web/client/post-forms-ui.isolated.test.ts
index 316cc3de6b24a921ca9137cadd4c8ef10c0340f5..c6dd94579c4f34c97dd7c5b68ca6773b5fcd70a8 100644
--- a/src/web/client/post-forms-ui.isolated.test.ts
+++ b/src/web/client/post-forms-ui.isolated.test.ts
@@ -2,199 +2,19 @@ import { afterEach, describe, expect, it, vi } from 'vitest';
 import type { MapRaid } from '../../domain/web/party-data.js';
 import { postFormsUi } from './post-forms-ui.js';
 import { FormHold } from './raid-forms.js';
+import {
+  FakeButton,
+  FakeElement,
+  focused,
+  focusOn,
+  make,
+  resetFocus,
+} from '../../../test/support/fake-page.js';
 
 // The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
 // loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
 vi.mock('leaflet', () => ({}));
 
-type Listener = (event: { target: FakeElement; stopPropagation(): void; key?: string }) => void;
-
-/** What has had the focus, in order, and who waits for an element to get it. */
-let focused: FakeElement[] = [];
-let focusWaiters: { element: FakeElement | undefined; resolve: () => void }[] = [];
-
-/**
- * When `element` gets the focus, or (`undefined`) anything does next (a wait that never comes in
- * fails as the test's timeout, as the page's own tests wait: no sleeps).
- */
-function focusOn(element: FakeElement | undefined): Promise<void> {
-  if (element !== undefined && focused.includes(element)) return Promise.resolve();
-  return new Promise((resolve) => focusWaiters.push({ element, resolve }));
-}
-
-/**
- * Just enough of an element for the forms of the post's controls (`post-forms-ui.ts`): attributes
- * and `dataset`, the tree, fields, the focus, bubbling events, and the selectors it asks (tags,
- * classes, attributes with or without a value, `:checked`, lists, a descendant).
- */
-class FakeElement {
-  className = '';
-  hidden = false;
-  disabled = false;
-  readonly dataset: Record<string, string> = {};
-  readonly attributes = new Map<string, string>();
-  childNodes: FakeElement[] = [];
-  parent: FakeElement | undefined;
-  page = false;
-  private text: string | null = '';
-  private readonly listeners = new Map<string, Listener[]>();
-
-  constructor(readonly tag: string) {}
-
-  get tagName(): string {
-    return this.tag.toUpperCase();
-  }
-
-  get textContent(): string | null {
-    return this.childNodes.length > 0
-      ? this.childNodes.map((child) => child.textContent ?? '').join('')
-      : this.text;
-  }
-
-  set textContent(text: string | null) {
-    this.childNodes = [];
-    this.text = text;
-  }
-
-  get name(): string {
-    return this.attributes.get('name') ?? '';
-  }
-
-  get value(): string {
-    return this.attributes.get('value') ?? '';
-  }
-
-  get checked(): boolean {
-    return this.attributes.has('checked');
-  }
-
-  setAttribute(name: string, value: string): void {
-    this.attributes.set(name, value);
-    if (name.startsWith('data-')) {
-      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
-      this.dataset[key] = value;
-    }
-    if (name === 'hidden') this.hidden = true;
-    if (name === 'disabled') this.disabled = true;
-  }
-
-  getAttribute(name: string): string | null {
-    return this.attributes.get(name) ?? null;
-  }
-
-  getAttributeNames(): string[] {
-    return [...this.attributes.keys()];
-  }
-
-  append(...children: FakeElement[]): void {
-    for (const child of children) {
-      child.parent?.childNodes.splice(child.parent.childNodes.indexOf(child), 1);
-      child.parent = this;
-      this.childNodes.push(child);
-    }
-  }
-
-  replaceChildren(...children: FakeElement[]): void {
-    for (const child of this.childNodes) child.parent = undefined;
-    this.childNodes = [];
-    this.append(...children);
-  }
-
-  get isConnected(): boolean {
-    return upward(this).some((at) => at.page);
-  }
-
-  focus(): void {
-    focused.push(this);
-    const due = (one: { element: FakeElement | undefined }) =>
-      one.element === undefined || one.element === this;
-    for (const waiter of focusWaiters.filter(due)) waiter.resolve();
-    focusWaiters = focusWaiters.filter((one) => !due(one));
-  }
-
-  addEventListener(type: string, listener: Listener): void {
-    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
-  }
-
-  /** An event at this element, bubbling up the tree until a listener stops it. */
-  dispatch(type: string): void {
-    let stopped = false;
-    const event = {
-      target: this,
-      stopPropagation: () => {
-        stopped = true;
-      },
-    };
-    for (const at of upward(this)) {
-      for (const listener of at.listeners.get(type) ?? []) listener(event);
-      if (stopped) return;
-    }
-  }
-
-  closest(selector: string): FakeElement | null {
-    return upward(this).find((at) => matches(at, selector)) ?? null;
-  }
-
-  querySelectorAll(selector: string): FakeElement[] {
-    const below = (element: FakeElement): FakeElement[] =>
-      element.childNodes.flatMap((child) => [child, ...below(child)]);
-    return below(this).filter((element) => matches(element, selector));
-  }
-
-  querySelector(selector: string): FakeElement | null {
-    return this.querySelectorAll(selector)[0] ?? null;
-  }
-}
-
-class FakeButton extends FakeElement {}
-
-function upward(from: FakeElement): FakeElement[] {
-  const line: FakeElement[] = [];
-  for (let at: FakeElement | undefined = from; at; at = at.parent) line.push(at);
-  return line;
-}
-
-/** One compound selector: `button.press[data-regroup="r1"]`, `input[type="radio"]:checked`. */
-function matchesOne(element: FakeElement, compound: string): boolean {
-  const checked = compound.endsWith(':checked');
-  const rest = compound.replace(/:checked$/, '');
-  const tag = /^[a-z]+/.exec(rest)?.[0];
-  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((found) => found[1] ?? '');
-  const attributes = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((found) => ({
-    name: found[1] ?? '',
-    value: found[2],
-  }));
-  const own = element.className.split(' ');
-  return (
-    (tag === undefined || element.tag === tag) &&
-    classes.every((name) => own.includes(name)) &&
-    attributes.every(
-      ({ name, value }) =>
-        element.attributes.has(name) &&
-        (value === undefined || element.attributes.get(name) === value),
-    ) &&
-    (!checked || element.checked)
-  );
-}
-
-function matches(element: FakeElement, selector: string): boolean {
-  return selector.split(',').some((one) => {
-    const parts = one.trim().split(/\s+/);
-    const last = parts.pop() ?? '';
-    if (!matchesOne(element, last)) return false;
-    let at = element.parent;
-    for (const part of parts.reverse()) {
-      while (at && !matchesOne(at, part)) at = at.parent;
-      if (!at) return false;
-      at = at.parent;
-    }
-    return true;
-  });
-}
-
-const make = (tag: string): FakeElement =>
-  tag === 'button' ? new FakeButton(tag) : new FakeElement(tag);
-
 const NOW = Date.UTC(2026, 9, 13, 18);
 
 /** A raid whose Group… moves the member from group A to group B (the one way left). */
@@ -247,8 +67,7 @@ function groupButton(): FakeElement {
  * buttons new elements).
  */
 function page() {
-  focused = [];
-  focusWaiters = [];
+  resetFocus();
   const body = make('body');
   body.page = true;
   const notice = make('div');
@@ -284,6 +103,8 @@ function page() {
   let redrawn: FakeElement | undefined;
   /** The parties whose popup or card a form had closed. */
   const closed: unknown[] = [];
+  /** What the forms answered into the post's answer line (plan 8M-11A, S9). */
+  const answers: { party: string; text: string; ok: boolean }[] = [];
   let drawn: () => void = () => undefined;
   const done = new Promise<void>((resolve) => {
     drawn = resolve;
@@ -304,14 +125,17 @@ function page() {
     closeParty: (party) => {
       closed.push(party);
     },
+    answered: (party, answer) => {
+      answers.push({ party: party.id, ...answer });
+    },
   });
-  return { ui, button, post, done, redrawn: () => redrawn, closed };
+  return { ui, button, post, done, redrawn: () => redrawn, closed, answers };
 }
 
 /**
  * The post of a desktop popup as the page draws it: the post (`.post`) with the control
- * (`data-<data>="r1"`) and its line to Discord (`.on-discord`, its `.why` and link), in the popup's
- * content (`.post-popup`).
+ * (`data-<data>="r1"`) and its answer line (`.press-answer`, plan 8M-11A), in the popup's content
+ * (`.post-popup`).
  */
 function drawnPost(data: string): { post: FakeElement; control: FakeElement } {
   const post = make('div');
@@ -321,13 +145,7 @@ function drawnPost(data: string): { post: FakeElement; control: FakeElement } {
   control.setAttribute('type', 'button');
   control.setAttribute(`data-${data}`, 'r1');
   const line = make('div');
-  line.className = 'on-discord';
-  line.setAttribute('hidden', '');
-  const why = make('span');
-  why.className = 'why';
-  const link = make('a');
-  link.className = 'to-post';
-  line.append(why, link);
+  line.className = 'press-answer';
   post.append(control, line);
   return { post, control };
 }
@@ -338,8 +156,7 @@ function drawnPost(data: string): { post: FakeElement; control: FakeElement } {
  * post's nodes the form kept are out of the page then. `answer` is what the server answers.
  */
 function popupPage(data: string, answer: { status: number; body: unknown }) {
-  focused = [];
-  focusWaiters = [];
+  resetFocus();
   const body = make('body');
   body.page = true;
   const notice = make('div');
@@ -364,6 +181,8 @@ function popupPage(data: string, answer: { status: number; body: unknown }) {
     }),
   );
   let current = first.control;
+  /** What the forms answered into the post's answer line (plan 8M-11A, S9). */
+  const answers: { party: string; text: string; ok: boolean }[] = [];
   const hold: FormHold<unknown> = new FormHold<unknown>({
     draw: () => undefined,
     // Leaflet's `update()`: the content drawn anew unless a form holds it.
@@ -388,8 +207,11 @@ function popupPage(data: string, answer: { status: number; body: unknown }) {
     times: () => ({ now: NOW }),
     done: () => Promise.resolve(),
     closeParty: () => undefined,
+    answered: (party, answer) => {
+      answers.push({ party: party.id, ...answer });
+    },
   });
-  return { ui, button: first.control, content, current: () => current };
+  return { ui, button: first.control, content, current: () => current, answers };
 }
 
 describe('the forms of the post’s controls in a popup drawn anew (review B-1)', () => {
@@ -408,11 +230,11 @@ describe('the forms of the post’s controls in a popup drawn anew (review B-1)'
     content.querySelector('button[data-cancel]')?.dispatch('click');
     // Compared as booleans: the fake elements do not print.
     expect(current() === button).toBe(false);
-    expect(focused.at(-1) === current()).toBe(true);
+    expect(focused().at(-1) === current()).toBe(true);
   });
 
-  it('says why a form does not open in the line of the post drawn anew, and focuses its control', async () => {
-    const { ui, button, current } = popupPage('meet', {
+  it('says why a form does not open in the answer line, as a refusal, and focuses its control', async () => {
+    const { ui, button, current, answers } = popupPage('meet', {
       status: 422,
       body: { error: 'You are not signed up for this raid.' },
     });
@@ -420,11 +242,35 @@ describe('the forms of the post’s controls in a popup drawn anew (review B-1)'
     ui.meetClicked(button as unknown as HTMLButtonElement, raid);
     await focus;
     expect(current() === button).toBe(false);
-    expect(focused.at(-1) === current()).toBe(true);
-    const line = current().parent?.querySelector('.on-discord');
-    expect(line?.hidden).toBe(false);
-    expect(line?.querySelector('.why')?.textContent).toBe('You are not signed up for this raid.');
-    expect(line?.querySelector('.to-post')?.hidden).toBe(true);
+    expect(focused().at(-1) === current()).toBe(true);
+    // Plan 8M-11A (S20): in the post's answer line (and a shake), not a line to Discord.
+    expect(answers).toEqual([
+      { party: 'r1', text: 'You are not signed up for this raid.', ok: false },
+    ]);
+  });
+
+  // Plan 8M-11A (S9): "do this on Discord" as a note box in the form's place, the post's link a
+  // button; Back puts the post back.
+  it('shows the note box of a button done on Discord in the place of the post, Back puts it back', async () => {
+    const { ui, button, content, current } = popupPage('regroup', {
+      status: 200,
+      body: { ok: true, text: 'Done.' },
+    });
+    const post = 'https://discord.com/channels/100000000000000001/2';
+    ui.noteClicked(
+      button as unknown as HTMLButtonElement,
+      { ...raid, link: post },
+      'A new group is started on Discord.',
+    );
+    await focusOn(undefined);
+    const note = content.querySelector('.note-box');
+    expect(note?.textContent).toContain('A new group is started on Discord.');
+    const link = note?.querySelector('a.press');
+    expect(link?.textContent).toBe('Open the post on Discord');
+    expect(link?.getAttribute('href')).toBe(post);
+    content.querySelector('button[data-cancel]')?.dispatch('click');
+    expect(content.querySelector('.note-box')).toBeNull();
+    expect(current().isConnected).toBe(true);
   });
 });
 
@@ -448,10 +294,53 @@ describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
     const again = redrawn();
     if (!again) throw new Error('the post was not drawn anew');
     await focusOn(again);
-    expect(focused.at(-1)).toBe(again);
+    expect(focused().at(-1)).toBe(again);
     expect(again.isConnected).toBe(true);
   });
 
+  // Plan 8M-11A (S9): a form that went through answers in the post's answer line.
+  it('puts the answer of a form that went through into the post’s answer line', async () => {
+    const { ui, button, post, done, answers } = page();
+    ui.regroupClicked(button as unknown as HTMLButtonElement, raid);
+    await Promise.resolve();
+    await Promise.resolve();
+    post.querySelector('button[data-submit]')?.dispatch('click');
+    await done;
+    expect(answers).toEqual([{ party: 'r1', text: 'You are coming, in group B.', ok: true }]);
+  });
+
+  // Plan 8M-11A (S21): Meet…'s group changed since: the form closes as Group…'s does, the answer
+  // in the answer line.
+  it('closes Meet… on a refusal of a group changed since, the answer in the answer line', async () => {
+    const { ui, button, post, done, answers } = page();
+    const meet = {
+      title: 'Meeting time',
+      text: 'For your group: everybody in it is told.',
+      label: 'When does your group meet?',
+      group: 'A',
+      stamp: 'a1',
+      times: [{ at: NOW + 600_000, rsvp: true }],
+      set: null,
+      picked: NOW + 600_000,
+    };
+    const refusal = 'Group A has changed since: press Meet… again.';
+    vi.stubGlobal('fetch', (_url: string, init?: { method?: string }) => {
+      const posting = init?.method === 'POST';
+      return Promise.resolve({
+        ok: !posting,
+        status: posting ? 422 : 200,
+        json: () => Promise.resolve(posting ? { ok: false, text: refusal } : meet),
+      });
+    });
+    ui.meetClicked(button as unknown as HTMLButtonElement, raid);
+    await focusOn(undefined);
+    post.querySelector('select')?.setAttribute('value', String(NOW + 600_000));
+    post.querySelector('button[data-submit]')?.dispatch('click');
+    await done;
+    expect(post.querySelector('button[data-submit]')).toBeNull();
+    expect(answers).toEqual([{ party: 'r1', text: refusal, ok: false }]);
+  });
+
   // Review N-3: the popup or card of the party closed is that of the party the form was opened
   // for, which a poll may have taken out of the list before the answer came.
   it('closes the popup or card of the party Delete… was opened for, by the party it holds', async () => {
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index db344ecfab54ac04eac433daa059645ec0d9bd4d..beaab5b25bf147f6eb2e649df4cc47628c373a25 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -8,7 +8,7 @@ import {
   splitBody,
   splitForm,
 } from './train-post-forms.js';
-import { getJson, say } from './common.js';
+import { getJson } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
 import {
@@ -18,6 +18,7 @@ import {
   formStep,
   meetBody,
   meetForm,
+  noteBox,
   regroupBody,
   regroupForm,
   reportBody,
@@ -28,7 +29,8 @@ import {
 } from './post-forms.js';
 import { sameControl } from './list-ui.js';
 import { formPlace, type FormHold } from './raid-forms.js';
-import { fieldsOf, sayUnder } from './raid-ui.js';
+import { fieldsOf, sayInForm } from './raid-ui.js';
+import { shake, type PressAnswer } from './press-answer.js';
 
 /**
  * The post's controls that open a dialog on Discord, as forms of the live map in the page (plan
@@ -53,27 +55,17 @@ export interface PostFormsDeps {
    * was opened for it (review N-3: a poll may have taken it out of the list meanwhile).
    */
   closeParty(party: MapParty): void;
+  /**
+   * An answer for the party's answer line (plan 8M-11A, S9): a form that closed (done, or refused
+   * where a refusal closes it), or one that did not open; `from` is where it was pressed, whose
+   * popup or card a refusal shakes.
+   */
+  answered(party: MapParty, answer: PressAnswer, from: HTMLElement): void;
 }
 
 export function postFormsUi(deps: PostFormsDeps) {
   const { guild, hold } = deps;
 
-  /**
-   * Says why a form does not open under the post's buttons (the line that also names Discord),
-   * in the place of the post's link, and in the notice.
-   */
-  const refusedUnder = (section: HTMLElement, text: string): void => {
-    const line = section.querySelector<HTMLElement>('.post .on-discord');
-    if (line) {
-      line.hidden = false;
-      const why = line.querySelector<HTMLElement>('.why');
-      if (why) why.textContent = text;
-      const link = line.querySelector<HTMLElement>('.to-post');
-      if (link) link.hidden = true;
-    }
-    say(text);
-  };
-
   /**
    * The control that opened a form as it is in the page now: itself while it is there, else the
    * same control in the post drawn anew (`sameControl`: letting a form go updates its popup, which
@@ -107,9 +99,10 @@ export function postFormsUi(deps: PostFormsDeps) {
     const loaded = await load();
     if ('refused' in loaded) {
       hold.release(claim);
-      // The release may have drawn the popup anew (review B-1): the line of the post as it is now.
+      // The release may have drawn the popup anew (review B-1): the answer line of the post as it
+      // is now (plan 8M-11A, S20), its popup or card shaken.
       const control = liveControl(button);
-      refusedUnder(control.closest<HTMLElement>('.post-popup') ?? section, loaded.refused);
+      deps.answered(party, { text: loaded.refused, ok: false }, control);
       control.focus();
       return;
     }
@@ -132,7 +125,7 @@ export function postFormsUi(deps: PostFormsDeps) {
       for (const radio of radios) if (radio.checked) fields[radio.name] = radio.value;
       const body = bodyOf(fields);
       if ('text' in body) {
-        sayUnder(element, body.text);
+        sayInForm(element, body.text);
         return;
       }
       const buttons = [...element.querySelectorAll('button')];
@@ -157,13 +150,16 @@ export function postFormsUi(deps: PostFormsDeps) {
       });
       deps.csrf.set(sent.csrf);
       for (const each of buttons) each.disabled = false;
-      sayUnder(element, sent.text);
       // A refusal keeps the form, unless its choices may be stale (review W-2: Group…'s came with
-      // the list, which is asked for again).
+      // the list, which is asked for again): said under the form, which shakes (plan 8M-11A).
       if (formStep(sent, { refusalCloses: loaded.refusalCloses === true }) === 'stay') {
+        sayInForm(element, sent.text);
+        shake(element);
         target.focus();
         return;
       }
+      // Closed: the answer in the post's answer line, where the member looks (plan 8M-11A, S9).
+      deps.answered(party, { text: sent.text, ok: sent.ok }, liveControl(button));
       // Done, or over: the post back (the list draws it as it is now), unless the form went; a
       // party closed (or over) closes its popup or card (`ends`).
       if (hold.holds(claim)) close();
@@ -188,7 +184,9 @@ export function postFormsUi(deps: PostFormsDeps) {
     hold.fit();
     (
       element.querySelector<HTMLElement>('input[type="radio"]:checked, select, textarea') ??
-      element.querySelector<HTMLElement>('button[data-submit]')
+      element.querySelector<HTMLElement>('button[data-submit]') ??
+      // The note box (plan 8M-11A): its link to the post, else Back.
+      element.querySelector<HTMLElement>('a.press, button[data-cancel]')
     )?.focus();
   };
 
@@ -306,7 +304,11 @@ export function postFormsUi(deps: PostFormsDeps) {
       });
     },
 
-    /** Meet…: its form, from what the server offers now (`GET …/meet`), or why not. */
+    /**
+     * Meet…: its form, from what the server offers now (`GET …/meet`), or why not. A refusal of
+     * its Submit closes it as Group…'s does (plan 8M-11A, S21: its group or times may be stale),
+     * the answer in the answer line.
+     */
     meetClicked(button: HTMLButtonElement, party: MapParty): void {
       void open(button, 'meet', party, async () => {
         const meet = await asked<MapMeet>(party.id, 'meet');
@@ -314,9 +316,24 @@ export function postFormsUi(deps: PostFormsDeps) {
         return {
           form: meetForm(party, meet, deps.times()),
           bodyOf: (fields) => meetBody(meet, fields.time),
+          refusalCloses: true as const,
         };
       });
     },
+
+    /**
+     * A button whose answer is "do this on Discord" (plan 8M-11A, S9): the note box in the form's
+     * place (`noteBox`: Group… where only a new group is left, a button the map has no form of),
+     * the post's link as a button, Back or Escape putting the post back.
+     */
+    noteClicked(button: HTMLButtonElement, party: MapParty, text: string): void {
+      void open(button, 'note', party, () =>
+        Promise.resolve({
+          form: noteBox(party, text, deps.origin(), guild),
+          bodyOf: () => ({ text: '' }),
+        }),
+      );
+    },
   };
 }
 
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index eeee8e8f101879c7f2a6e022e8f7207701256abd..e52723e7447f0da5a528353500c32e85b3e779ed 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -129,6 +129,49 @@ export function dialogForm(
   };
 }
 
+/** The note box's button to the post (plan 8M-11A, S9). */
+export const OPEN_THE_POST = 'Open the post on Discord';
+
+/**
+ * The note box of a button whose answer is "do this on Discord" (plan 8M-11A, S9): in the form's
+ * place, its words (`discordNote`: "A new group is started on Discord.") over the post's link as a
+ * button ("Open the post on Discord", where the page may link it) and Back, which puts the post
+ * back as Cancel does.
+ */
+export function noteBox(party: MapParty, text: string, origin: string, guild: string): PageNode {
+  const href = safeHref(party.link, origin, guild);
+  return {
+    tag: 'div',
+    className: 'post-form note-box',
+    attributes: { 'data-form': 'note', 'data-party': party.id, role: 'group', 'aria-label': text },
+    children: [
+      { tag: 'p', className: 'form-text', text },
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          ...(href === undefined
+            ? []
+            : [
+                {
+                  tag: 'a',
+                  className: 'press primary',
+                  text: OPEN_THE_POST,
+                  attributes: { href, ...NEW_TAB },
+                },
+              ]),
+          {
+            tag: 'button',
+            className: 'press secondary',
+            text: 'Back',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+        ],
+      },
+    ],
+  };
+}
+
 /** A group's choice by its letter and stamp, as Group…'s move sends it back. */
 const wayValue = (way: { group: string; stamp: string }): string => `${way.group}:${way.stamp}`;
 
diff --git a/src/web/client/press-answer.test.ts b/src/web/client/press-answer.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bf86a78a19efcc555ecbc337bf6d79546c94a7f3
--- /dev/null
+++ b/src/web/client/press-answer.test.ts
@@ -0,0 +1,28 @@
+import { describe, expect, it } from 'vitest';
+import { ANSWER_MS, answerLine, PressAnswers } from './press-answer.js';
+
+describe('the answers of presses, by party (plan 8M-11A, S9)', () => {
+  it('keeps an answer for ten seconds, the newest in the place of the one before', () => {
+    const clock = { now: 1_000 };
+    const answers = new PressAnswers(() => clock.now);
+    answers.set('r1', { text: 'You are coming.', ok: true });
+    expect(answers.of('r1')).toEqual({ text: 'You are coming.', ok: true });
+    expect(answers.of('r2')).toBeUndefined();
+    clock.now += 4_000;
+    answers.set('r1', { text: 'This raid has not hatched yet.', ok: false });
+    clock.now += ANSWER_MS - 1;
+    expect(answers.of('r1')).toEqual({ text: 'This raid has not hatched yet.', ok: false });
+    clock.now += 1;
+    expect(answers.of('r1')).toBeUndefined();
+  });
+
+  it('draws the line as a status, a refusal marked', () => {
+    expect(answerLine(undefined)).toEqual({
+      tag: 'div',
+      className: 'press-answer',
+      text: '',
+      attributes: { role: 'status' },
+    });
+    expect(answerLine({ text: 'No.', ok: false }).className).toBe('press-answer refused');
+  });
+});
diff --git a/src/web/client/press-answer.ts b/src/web/client/press-answer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5f672f251e97a220a0fbd2561585e46c4cc10f05
--- /dev/null
+++ b/src/web/client/press-answer.ts
@@ -0,0 +1,91 @@
+import type { PageNode } from './popup.js';
+
+/**
+ * Answers where the member is looking (plan 8M-11A, S9, S20): a press's answer goes into a line
+ * of the post's own controls (`.press-answer`, `role="status"`), under the buttons pressed, in the
+ * popup and in the phone card (also its summary), kept by party for `ANSWER_MS` across the redraws
+ * that follow (as the page keeps open panels); a refusal shakes the popup or the card once
+ * (`map.css`, never where the device asks for reduced motion). The notice band then carries only
+ * what has no party.
+ */
+
+/** How long an answer stays in its post's line, across redraws. */
+export const ANSWER_MS = 10_000;
+
+/** What a press answered: its words and whether it was done. */
+export interface PressAnswer {
+  text: string;
+  ok: boolean;
+}
+
+/** The answers of the member's presses, by party, each for `ANSWER_MS` from when it came. */
+export class PressAnswers {
+  private readonly kept = new Map<string, PressAnswer & { at: number }>();
+
+  constructor(private readonly now: () => number) {}
+
+  /** The answer of a press on this party, in the place of the one before. */
+  set(partyId: string, answer: PressAnswer): void {
+    this.kept.set(partyId, { ...answer, at: this.now() });
+  }
+
+  /** The answer the party's post shows now; none once `ANSWER_MS` passed. */
+  of(partyId: string): PressAnswer | undefined {
+    const kept = this.kept.get(partyId);
+    if (kept === undefined) return undefined;
+    if (this.now() - kept.at >= ANSWER_MS) {
+      this.kept.delete(partyId);
+      return undefined;
+    }
+    return { text: kept.text, ok: kept.ok };
+  }
+}
+
+/** The answer line of a post: empty (hidden by `map.css`) until a press answered. */
+export function answerLine(answer: PressAnswer | undefined): PageNode {
+  return {
+    tag: 'div',
+    className: answer?.ok === false ? 'press-answer refused' : 'press-answer',
+    text: answer?.text ?? '',
+    attributes: { role: 'status' },
+  };
+}
+
+/**
+ * Writes an answer (or none: empty) into every answer line of a party's post in `scope` (a popup,
+ * the phone card, a line of the list): whether it found one.
+ */
+export function writeAnswer(
+  scope: ParentNode,
+  partyId: string,
+  answer: PressAnswer | undefined,
+): boolean {
+  const lines = scope.querySelectorAll<HTMLElement>(
+    `.post[data-post="${CSS.escape(partyId)}"] .press-answer`,
+  );
+  for (const line of lines) {
+    line.textContent = answer?.text ?? '';
+    line.classList.toggle('refused', answer?.ok === false);
+  }
+  return lines.length > 0;
+}
+
+/**
+ * Shakes the popup or card of `from` once (a refusal): the class taken off and put back, so that a
+ * second refusal shakes again; `map.css` runs it only where the device allows motion.
+ */
+export function shake(from: Element): void {
+  const box = from.closest<HTMLElement>('.leaflet-popup, .party-card');
+  if (!box) return;
+  box.classList.remove('shake');
+  // Read a size so that the browser sees the class gone before it comes back.
+  void box.offsetWidth;
+  box.classList.add('shake');
+  box.addEventListener(
+    'animationend',
+    () => {
+      box.classList.remove('shake');
+    },
+    { once: true },
+  );
+}
diff --git a/src/web/client/raid-ui.isolated.test.ts b/src/web/client/raid-ui.isolated.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..06492920ace7b2fdce9c847d383eaa7555abbde2
--- /dev/null
+++ b/src/web/client/raid-ui.isolated.test.ts
@@ -0,0 +1,130 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { FakeButton, FakeElement, make } from '../../../test/support/fake-page.js';
+import type { RaidUiDeps } from './raid-ui.js';
+import { raidUi } from './raid-ui.js';
+
+// The page's helpers this comes in with load Leaflet, which reads the browser's `window` as it
+// loads; none of it is used here. Isolated: a mocked module needs a module graph of its own.
+vi.mock('leaflet', () => ({}));
+
+/**
+ * A raid's popup over a fake page with its Change…, the server answering the lists and a change
+ * as `answer` says; what the form's answers went to (`answered`, the notice band `said`).
+ */
+function changing(answer: { status: number; body: unknown }) {
+  const body = make('body');
+  body.page = true;
+  const notice = make('div');
+  const section = make('div');
+  section.className = 'party-popup post-popup raid';
+  const control = make('button');
+  control.setAttribute('data-change-raid', 'r1');
+  section.append(control);
+  body.append(section, notice);
+  const said: string[] = [];
+  vi.stubGlobal('document', {
+    createElement: make,
+    getElementById: (id: string) => {
+      if (id !== 'notice') return null;
+      return new Proxy(notice, {
+        set(target, key, value: unknown) {
+          if (key === 'textContent' && typeof value === 'string') said.push(value);
+          return Reflect.set(target, key, value);
+        },
+      });
+    },
+  });
+  vi.stubGlobal('HTMLElement', FakeElement);
+  vi.stubGlobal('HTMLButtonElement', FakeButton);
+  vi.stubGlobal('fetch', (url: string, init?: { method?: string }) => {
+    const reply =
+      init?.method === 'POST'
+        ? answer
+        : url.endsWith('/raid-options')
+          ? { status: 200, body: { zone: 'America/New_York', bosses: [], eggs: [] } }
+          : { status: 404, body: { error: 'Not found.' } };
+    return Promise.resolve({
+      ok: reply.status < 400,
+      status: reply.status,
+      json: () => Promise.resolve(reply.body),
+    });
+  });
+  let drawn: () => void = () => undefined;
+  const shown = new Promise<void>((resolve) => {
+    drawn = resolve;
+  });
+  let done: () => void = () => undefined;
+  const finished = new Promise<void>((resolve) => {
+    done = resolve;
+  });
+  let held = false;
+  const answered: { party: string; text: string; ok: boolean }[] = [];
+  let shook: () => void = () => undefined;
+  const shaken = new Promise<void>((resolve) => {
+    shook = resolve;
+  });
+  const deps: RaidUiDeps = {
+    guild: '100000000000000001',
+    csrf: { get: () => 'token', set: () => undefined },
+    regionNames: new Map(),
+    done: () => {
+      done();
+      return Promise.resolve();
+    },
+    hold: {
+      take: () => {
+        held = true;
+        return {} as never;
+      },
+      holds: () => held,
+      ready: () => true,
+      fit: () => {
+        drawn();
+      },
+      release: () => {
+        held = false;
+      },
+    },
+    answered: (party, given) => {
+      answered.push({ party, ...given });
+    },
+    refused: () => {
+      shook();
+    },
+  };
+  const ui = raidUi(deps);
+  ui.changeClicked(control as unknown as HTMLButtonElement);
+  return { section, shown, finished, answered, said, shaken };
+}
+
+/** Types an end time into the form drawn in `section` and presses its Set. */
+function setEnd(section: FakeElement): void {
+  section.querySelector('input[name="end"]')?.setAttribute('value', '30');
+  section.querySelector('button[data-set="end"]')?.dispatch('click');
+}
+
+describe("a raid's Change… on the map (review fix F4)", () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  it("answers a change that went through in the post's answer line, not the notice band", async () => {
+    const made = changing({ status: 200, body: { ok: true, text: 'Done. It ends at 3:15 PM.' } });
+    await made.shown;
+    setEnd(made.section);
+    await made.finished;
+    expect(made.answered).toEqual([{ party: 'r1', text: 'Done. It ends at 3:15 PM.', ok: true }]);
+    expect(made.said).toEqual([]);
+    expect(made.section.querySelector('button[data-set="end"]')).toBeNull();
+  });
+
+  it('says a refusal that keeps the form under it and shakes it, not in the band', async () => {
+    const made = changing({ status: 422, body: { ok: false, text: 'This raid is over.' } });
+    await made.shown;
+    setEnd(made.section);
+    await made.shaken;
+    expect(made.section.querySelector('.form-answer')?.textContent).toBe('This raid is over.');
+    expect(made.said).toEqual([]);
+    expect(made.answered).toEqual([]);
+  });
+});
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 07e4218478283a10199fb2c92713cfa980069bff..e793a821476861b7df38a91ef67a51da4d111a46 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -6,6 +6,7 @@ import type {
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type MapGym } from './popup.js';
+import type { PressAnswer } from './press-answer.js';
 import { readerZone } from './post-time.js';
 import {
   changeBody,
@@ -44,6 +45,13 @@ export interface RaidUiDeps {
    * let go when it closes; the party list is not drawn anew under it.
    */
   hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
+  /**
+   * The answer of a raid's Change… that went through, for its post's answer line (plan 8M-11A,
+   * review fix F4), as a press's; `from` the control that opened the form.
+   */
+  answered(raidId: string, answer: PressAnswer, from: Element): void;
+  /** A refusal that keeps the change form: the form shaken (`shake`, plan 8M-11A). */
+  refused(form: HTMLElement): void;
 }
 
 /**
@@ -84,12 +92,20 @@ export function fieldsOf(form: HTMLElement): Record<string, string> {
 
 /** Says a form's answer under it, and in the notice. */
 export function sayUnder(form: HTMLElement, text: string): void {
+  sayInForm(form, text);
+  say(text);
+}
+
+/**
+ * Says a form's answer under it alone (plan 8M-11A): a form of a party's post, whose answers stay
+ * where the member looks, out of the notice band.
+ */
+export function sayInForm(form: HTMLElement, text: string): void {
   const line = form.querySelector<HTMLElement>('.form-answer');
   if (line) {
     line.textContent = text;
     line.hidden = false;
   }
-  say(text);
 }
 
 export function raidUi(deps: RaidUiDeps) {
@@ -108,10 +124,15 @@ export function raidUi(deps: RaidUiDeps) {
     }
   };
 
-  /** Sends a body to an address of the raids with the page's token; disables the form meanwhile. */
-  const send = async (form: HTMLElement, url: string, body: FormBody) => {
+  /**
+   * Sends a body to an address of the raids with the page's token; disables the form meanwhile.
+   * Its answer is said under the form and in the notice band (a report's), or under the form alone
+   * where the caller says where else it goes (`inForm`: a change, plan 8M-11A).
+   */
+  const send = async (form: HTMLElement, url: string, body: FormBody, inForm = false) => {
+    const tell = inForm ? sayInForm : sayUnder;
     if ('text' in body) {
-      sayUnder(form, body.text);
+      tell(form, body.text);
       return undefined;
     }
     const buttons = form.querySelectorAll('button');
@@ -133,7 +154,8 @@ export function raidUi(deps: RaidUiDeps) {
     });
     deps.csrf.set(sent.csrf);
     for (const each of buttons) each.disabled = false;
-    sayUnder(form, sent.text);
+    // A change's answer that closes the form goes to the post's answer line instead.
+    if (!inForm || !sent.ok) tell(form, sent.text);
     return sent;
   };
 
@@ -207,7 +229,7 @@ export function raidUi(deps: RaidUiDeps) {
    * Opens the change form of a raid in place of its section of a popup or of the side panel, as
    * `openReport` opens a report's.
    */
-  const openChange = async (section: HTMLElement, raidId: string) => {
+  const openChange = async (section: HTMLElement, raidId: string, control: Element) => {
     const { hold } = deps;
     // Outside a popup (a line of the list), its claim goes with its form (fix round 1).
     const popup = formPlace(section);
@@ -243,15 +265,26 @@ export function raidUi(deps: RaidUiDeps) {
         form,
         `/s/${guild}/api/raids/${encodeURIComponent(raidId)}/${change}`,
         changeBody(change, fieldsOf(form)),
+        true,
       ).then(async (sent) => {
-        // Done: the list again, which shows the raid as it is now; a refusal keeps the form. A
-        // form gone with its popup meanwhile opens nothing over what the member does now.
-        if (!sent?.ok) return;
+        // Done: the answer in the post's answer line (plan 8M-11A, review fix F4), then the list
+        // again, which shows the raid as it is now; a refusal keeps the form, said under it, and
+        // shakes it. A form gone with its popup meanwhile opens nothing over what the member does
+        // now.
+        if (sent === undefined) return;
+        if (!sent.ok) {
+          deps.refused(form);
+          return;
+        }
+        const answer = { text: sent.text, ok: true };
         if (!hold.holds(claim)) {
+          deps.answered(raidId, answer, control);
           await deps.done(undefined);
           return;
         }
+        // The post back in the page first: its answer line takes the answer.
         close();
+        deps.answered(raidId, answer, control);
         await deps.done(sent.raid);
       });
     });
@@ -292,7 +325,7 @@ export function raidUi(deps: RaidUiDeps) {
       const raidId = button.dataset.changeRaid;
       const section = button.closest<HTMLElement>('.raid');
       if (raidId === undefined || !section) return;
-      void openChange(section, raidId);
+      void openChange(section, raidId, button);
     },
   };
 }
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 0b93ea59899737f4a93423ba966fcbf824bdad92..5444ec4da31369f4b9bc27fb658a6df9d83b67b1 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -23,6 +23,9 @@
   --panel-width: 340px;
   --editor-panel-width: 360px;
   --fix-box-width: 340px;
+  /* A refusal shakes its popup or card once (plan 8M-11A): how long, and how far each way. */
+  --shake-time: 300ms;
+  --shake-distance: 6px;
 
   /* Discord's surfaces, light. */
   --page-bg: #ffffff;
@@ -58,6 +61,15 @@
   --notice-bg: #fef3d6;
   --notice-border: #f0b232;
   --form-answer: #a12828;
+  /*
+   * The answer line under a post's buttons, and the completion question in its style (plan
+   * 8M-11A): a done answer, a refusal, and the dot on the phone card's handle while it asks.
+   */
+  --answer-bg: #e0e3ff;
+  --answer-text: #313338;
+  --answer-refused-bg: #fbe0e1;
+  --answer-refused-text: #a12828;
+  --question-dot: #da373c;
 
   /* What the map shows over its tiles. */
   --label-bg: rgba(255, 255, 255, 0.85);
@@ -155,6 +167,8 @@
     --panel-width: 340px;
     --editor-panel-width: 360px;
     --fix-box-width: 340px;
+    --shake-time: 300ms;
+    --shake-distance: 6px;
 
     /* Discord's surfaces, dark. */
     --page-bg: #313338;
@@ -189,6 +203,11 @@
     --notice-bg: #3d3523;
     --notice-border: #f0b232;
     --form-answer: #fa777c;
+    --answer-bg: #3c4270;
+    --answer-text: #dbdee1;
+    --answer-refused-bg: #4d2a2c;
+    --answer-refused-text: #fa777c;
+    --question-dot: #f23f43;
 
     --label-bg: rgba(43, 45, 49, 0.85);
     --region-label: #c9cdfb;
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index faa6f13b1ee94c949168019def43aa8682c53eed..6c7fcb7f5a0131498220eafabaae6f7ece63249c 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -377,7 +377,12 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
   const finished = new Count();
   /** Route mode begun (true) and ended (false), as the map is told. */
   const modes: boolean[] = [];
+  /** What went into a post's answer line (plan 8M-11A, S9). */
+  const answers: { partyId: string; text: string; ok: boolean }[] = [];
   const ui = trainUi({
+    answered: (partyId, answer) => {
+      answers.push({ partyId, ...answer });
+    },
     guild: GUILD,
     csrf: { get: () => 'token', set: () => undefined },
     regions: [],
@@ -433,6 +438,7 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
     action,
     modes,
     keyDown,
+    answers,
   };
 }
 
@@ -448,6 +454,15 @@ describe('route mode (trainUi)', () => {
     vi.unstubAllGlobals();
   });
 
+  // Plan 8M-11A (S9): the conductor's buttons answer in the post's answer line, not the notice.
+  it("answers Be the conductor in the post's answer line", async () => {
+    const shown = page();
+    shown.ui.actionClicked(shown.action('data-conductor', 'take'), train());
+    await shown.finished.reached(1);
+    expect(shown.answers).toEqual([{ partyId: 't1', text: 'Done.', ok: true }]);
+    expect(shown.said).toEqual([]);
+  });
+
   // Re-review N1: the gyms' and Power Spots' dots are Tab stops only in route mode.
   it('tells the map when route mode begins and when it ends', async () => {
     const shown = page();
@@ -789,6 +804,8 @@ describe('a form in a popup on the map, as Leaflet takes its clicks', () => {
         done.push(raid);
         return Promise.resolve();
       },
+      answered: () => undefined,
+      refused: () => undefined,
     });
     return { raids, done };
   };
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 140180f7a9dbded8dc16a523901fd3a35e7efcda..6e68406c2642e7f2dc2238647eb6d721bf033bbe 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -1,3 +1,4 @@
+import type { PressAnswer } from './press-answer.js';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import type { MapTrain } from '../../domain/web/party-data.js';
 import {
@@ -68,6 +69,11 @@ export interface TrainUiDeps {
    * starts and ends, so that the routed train's own line leaves and comes back with it.
    */
   redrawn(): void;
+  /**
+   * An answer for a train's answer line under its post's buttons (plan 8M-11A, S9): the
+   * conductor's buttons, presses of the post's member part.
+   */
+  answered(partyId: string, answer: PressAnswer, from: Element): void;
   /**
    * Whether the map shows Power Spots to tap (plan 8M-8C, R5: their layer on, zoomed in far
    * enough); left out: it does.
@@ -490,7 +496,7 @@ export function trainUi(deps: TrainUiDeps) {
     button.disabled = true;
     const sent = await send(trainUrl(train, `conductor/${change}`), conductorBody(train));
     button.disabled = false;
-    say(sent.text);
+    deps.answered(train.id, { text: sent.text, ok: sent.ok }, button);
     await deps.done(sent.ok || sent.train ? (sent.train ?? train) : undefined);
   };
 
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 2d8eced60e4b557843ad06b786ee0814a06e25d5..47d0fb835c706779d7f57c4972179ac58a161ada 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -93,7 +93,7 @@ describe('the map page', () => {
     // and panel in their places, hidden until it is on (plan 8M-10); the editor's map a landmark
     // of its own while the live map's `<main>` is hidden (branch review W3).
     expect(page.body).toContain(
-      '<div id="content"><main id="map" aria-label="Map"></main>' +
+      '<main id="map" aria-label="Map"></main>' +
         '<aside id="parties" aria-label="What is on" hidden></aside>' +
         '<div id="editor-map" class="editor-only" role="region" aria-label="Map of the regions" hidden></div>' +
         '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
@@ -114,10 +114,13 @@ describe('the map page', () => {
     expect(page.body).toContain(
       '<button id="search-button" class="search-button" type="button" aria-controls="filter" aria-expanded="false">Find</button>',
     );
-    // The read-only line of the parties: a line of its own, so that it never takes the place
-    // of what a press answered (#notice).
+    // The read-only line of the parties: a line of its own under the header. The notice band
+    // (plan 8M-11A) lies over the top of the map, with its ×, and goes away by itself.
+    expect(page.body).toContain('<p id="read-only" role="status" hidden></p>');
     expect(page.body).toContain(
-      '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
+      '<div id="content"><div id="notice" role="status" hidden><span id="notice-text"></span>' +
+        '<button id="notice-close" type="button" aria-label="Hide this line">×</button></div>' +
+        '<main id="map"',
     );
   });
 
diff --git a/src/web/page.ts b/src/web/page.ts
index 2991e8061586f4721277b2a0733ec0107eb998bc..60f31c7c2108d18fbb991742de7a123a08175b0c 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -118,7 +118,8 @@ function head(title: string, assets: PageAssets): string[] {
  * `data-` attributes of `<body>`, escaped. The script builds everything else; the side panel
  * (`#parties`: the list of what is on, plan 8M-7, with the phone's "List" button) for everybody, and
  * the line that the parties are read-only (`#read-only`), apart from the moment's news
- * (`#notice`) so that neither takes the other's place.
+ * (`#notice`, over the top of the map with its × since plan 8M-11A) so that neither takes the
+ * other's place.
  *
  * The region editor is on the map (plan 8M-10): its script, style and worker are named in
  * `data-editor-script`, `data-editor-style` and `data-worker` (files of Pine's: the CSP's
@@ -148,8 +149,11 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     '<button id="report-button" class="report-button" type="button" aria-haspopup="dialog" hidden>Report</button>',
     '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
     '<span id="account"></span></header>',
-    '<p id="notice" hidden></p><p id="read-only" role="status" hidden></p>',
-    '<div id="content"><main id="map" aria-label="Map"></main>' +
+    '<p id="read-only" role="status" hidden></p>',
+    // The notice band (plan 8M-11A) over the top of the map (`map.css`), with its ×.
+    '<div id="content"><div id="notice" role="status" hidden><span id="notice-text"></span>' +
+      '<button id="notice-close" type="button" aria-label="Hide this line">×</button></div>' +
+      '<main id="map" aria-label="Map"></main>' +
       '<aside id="parties" aria-label="What is on" hidden></aside>' +
       '<div id="editor-map" class="editor-only" role="region" aria-label="Map of the regions" hidden></div>' +
       '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
diff --git a/src/web/party-meet.test.ts b/src/web/party-meet.test.ts
index 3ef41aca7767ae8f0d942f6d39d1eb358939ef90..e062f6784bf6f6b0243af4a6c8994cbe38772e21 100644
--- a/src/web/party-meet.test.ts
+++ b/src/web/party-meet.test.ts
@@ -164,7 +164,7 @@ describe('Meet… on the map (plan 8M-8B)', () => {
     const { json: offered } = await map.open();
     expect((await map.set({ group: 'A', stamp: 'x0', time: HATCH })).json).toEqual({
       ok: false,
-      text: 'Your group changed meanwhile: try again.',
+      text: 'Group A has changed since: press Meet… again.',
     });
     expect(
       (await map.set({ group: 'A', stamp: offered.stamp, time: HATCH + MINUTE })).json,
diff --git a/src/web/post-control-routes.ts b/src/web/post-control-routes.ts
index c700598cbbd18625f35e216e3f9fecd6eaad3f21..deccccdd1da1c4a0635abacfe22a102d665c3b9e 100644
--- a/src/web/post-control-routes.ts
+++ b/src/web/post-control-routes.ts
@@ -351,7 +351,7 @@ export function postControlRoutes(scope: FastifyInstance, deps: WebDeps): void {
           });
           const refusal =
             outcome.kind === 'refused'
-              ? meetSubmitRefusal(outcome.reason, MEET_ON_THE_MAP)
+              ? meetSubmitRefusal(outcome.reason, MEET_ON_THE_MAP, group)
               : undefined;
           return {
             kind: outcome.kind,
diff --git a/src/web/stop-popup-look.test.ts b/src/web/stop-popup-look.test.ts
index 3a39777f8490596dd00666e144ef9b43df9796da..4c4b491297bea3efb5da58f6773c5f7fc3d395b0 100644
--- a/src/web/stop-popup-look.test.ts
+++ b/src/web/stop-popup-look.test.ts
@@ -35,6 +35,13 @@ function valueOf(selector: string, property: string): string | undefined {
 /** The pixels of a length such as `22px` or `-3px`. */
 const pixels = (value: string | undefined): number => Number(/^(-?\d+)px$/u.exec(value ?? '')?.[1]);
 
+describe("the note box's look (plan 8M-11A)", () => {
+  // The preview's finding: "Open the post on Discord" is a button, not underlined text.
+  it('draws the link of the note box as a button, without an underline', () => {
+    expect(valueOf('.note-box a.press', 'text-decoration')).toBe('none');
+  });
+});
+
 describe("the reports at stops' look on the map", () => {
   // W9: a target to tap of at least 24 pixels (WCAG 2.5.8), the look kept small.
   it('gives every × that clears a filter or leaves out a stop a target of at least 24 pixels', () => {
diff --git a/test/support/fake-page.ts b/test/support/fake-page.ts
new file mode 100644
index 0000000000000000000000000000000000000000..48bbf59adf33daf3811ae1b25441f885b7cc5499
--- /dev/null
+++ b/test/support/fake-page.ts
@@ -0,0 +1,208 @@
+/**
+ * Just enough of a page for the forms of the live map in a test (`post-forms-ui.ts`, `raid-ui.ts`):
+ * elements with attributes and `dataset`, the tree, fields, the focus, bubbling events, and the
+ * selectors the forms ask. Stub `document`, `HTMLElement` and `HTMLButtonElement` with these.
+ */
+
+export type Listener = (event: {
+  target: FakeElement;
+  stopPropagation(): void;
+  key?: string;
+}) => void;
+
+/** What has had the focus, in order, and who waits for an element to get it. */
+let focusedList: FakeElement[] = [];
+let focusWaiters: { element: FakeElement | undefined; resolve: () => void }[] = [];
+
+/** What has had the focus, in order. */
+export function focused(): FakeElement[] {
+  return focusedList;
+}
+
+/** Forgets the focus and its waiters: a test's page starts with none. */
+export function resetFocus(): void {
+  focusedList = [];
+  focusWaiters = [];
+}
+
+/**
+ * When `element` gets the focus, or (`undefined`) anything does next (a wait that never comes in
+ * fails as the test's timeout, as the page's own tests wait: no sleeps).
+ */
+export function focusOn(element: FakeElement | undefined): Promise<void> {
+  if (element !== undefined && focusedList.includes(element)) return Promise.resolve();
+  return new Promise((resolve) => focusWaiters.push({ element, resolve }));
+}
+
+/**
+ * Just enough of an element for the forms of the post's controls (`post-forms-ui.ts`): attributes
+ * and `dataset`, the tree, fields, the focus, bubbling events, and the selectors it asks (tags,
+ * classes, attributes with or without a value, `:checked`, lists, a descendant).
+ */
+export class FakeElement {
+  className = '';
+  hidden = false;
+  disabled = false;
+  readonly dataset: Record<string, string> = {};
+  readonly attributes = new Map<string, string>();
+  childNodes: FakeElement[] = [];
+  parent: FakeElement | undefined;
+  page = false;
+  private text: string | null = '';
+  private readonly listeners = new Map<string, Listener[]>();
+
+  constructor(readonly tag: string) {}
+
+  get tagName(): string {
+    return this.tag.toUpperCase();
+  }
+
+  get textContent(): string | null {
+    return this.childNodes.length > 0
+      ? this.childNodes.map((child) => child.textContent ?? '').join('')
+      : this.text;
+  }
+
+  set textContent(text: string | null) {
+    this.childNodes = [];
+    this.text = text;
+  }
+
+  get name(): string {
+    return this.attributes.get('name') ?? '';
+  }
+
+  get value(): string {
+    return this.attributes.get('value') ?? '';
+  }
+
+  get checked(): boolean {
+    return this.attributes.has('checked');
+  }
+
+  setAttribute(name: string, value: string): void {
+    this.attributes.set(name, value);
+    if (name.startsWith('data-')) {
+      const key = name.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
+      this.dataset[key] = value;
+    }
+    if (name === 'hidden') this.hidden = true;
+    if (name === 'disabled') this.disabled = true;
+  }
+
+  getAttribute(name: string): string | null {
+    return this.attributes.get(name) ?? null;
+  }
+
+  getAttributeNames(): string[] {
+    return [...this.attributes.keys()];
+  }
+
+  append(...children: FakeElement[]): void {
+    for (const child of children) {
+      child.parent?.childNodes.splice(child.parent.childNodes.indexOf(child), 1);
+      child.parent = this;
+      this.childNodes.push(child);
+    }
+  }
+
+  replaceChildren(...children: FakeElement[]): void {
+    for (const child of this.childNodes) child.parent = undefined;
+    this.childNodes = [];
+    this.append(...children);
+  }
+
+  get isConnected(): boolean {
+    return upward(this).some((at) => at.page);
+  }
+
+  focus(): void {
+    focusedList.push(this);
+    const due = (one: { element: FakeElement | undefined }) =>
+      one.element === undefined || one.element === this;
+    for (const waiter of focusWaiters.filter(due)) waiter.resolve();
+    focusWaiters = focusWaiters.filter((one) => !due(one));
+  }
+
+  addEventListener(type: string, listener: Listener): void {
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  }
+
+  /** An event at this element, bubbling up the tree until a listener stops it. */
+  dispatch(type: string): void {
+    let stopped = false;
+    const event = {
+      target: this,
+      stopPropagation: () => {
+        stopped = true;
+      },
+    };
+    for (const at of upward(this)) {
+      for (const listener of at.listeners.get(type) ?? []) listener(event);
+      if (stopped) return;
+    }
+  }
+
+  closest(selector: string): FakeElement | null {
+    return upward(this).find((at) => matches(at, selector)) ?? null;
+  }
+
+  querySelectorAll(selector: string): FakeElement[] {
+    const below = (element: FakeElement): FakeElement[] =>
+      element.childNodes.flatMap((child) => [child, ...below(child)]);
+    return below(this).filter((element) => matches(element, selector));
+  }
+
+  querySelector(selector: string): FakeElement | null {
+    return this.querySelectorAll(selector)[0] ?? null;
+  }
+}
+
+export class FakeButton extends FakeElement {}
+
+function upward(from: FakeElement): FakeElement[] {
+  const line: FakeElement[] = [];
+  for (let at: FakeElement | undefined = from; at; at = at.parent) line.push(at);
+  return line;
+}
+
+/** One compound selector: `button.press[data-regroup="r1"]`, `input[type="radio"]:checked`. */
+function matchesOne(element: FakeElement, compound: string): boolean {
+  const checked = compound.endsWith(':checked');
+  const rest = compound.replace(/:checked$/, '');
+  const tag = /^[a-z]+/.exec(rest)?.[0];
+  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map((found) => found[1] ?? '');
+  const attributes = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map((found) => ({
+    name: found[1] ?? '',
+    value: found[2],
+  }));
+  const own = element.className.split(' ');
+  return (
+    (tag === undefined || element.tag === tag) &&
+    classes.every((name) => own.includes(name)) &&
+    attributes.every(
+      ({ name, value }) =>
+        element.attributes.has(name) &&
+        (value === undefined || element.attributes.get(name) === value),
+    ) &&
+    (!checked || element.checked)
+  );
+}
+
+function matches(element: FakeElement, selector: string): boolean {
+  return selector.split(',').some((one) => {
+    const parts = one.trim().split(/\s+/);
+    const last = parts.pop() ?? '';
+    if (!matchesOne(element, last)) return false;
+    let at = element.parent;
+    for (const part of parts.reverse()) {
+      while (at && !matchesOne(at, part)) at = at.parent;
+      if (!at) return false;
+      at = at.parent;
+    }
+    return true;
+  });
+}
+
+export const make = (tag: string): FakeElement =>
+  tag === 'button' ? new FakeButton(tag) : new FakeElement(tag);
````

### Task 3: 8M-11A: the map's small fixes (S2, S3, S4, S5, S11, S16, S22)

Prototype commit: `a106cc7b4cf48c6705534e973e4622f9ef9da0a2`

S2: the rings' pane at 590, under Leaflet's markers and over the overlay
pane, so a raid's time badge is drawn over a meetup's or a train's ring.
S3: on a coarse pointer the popup's and the card's x are 44 pixels square
(--tap-size), the popup's content under it.
S4: several things at one place are headed with the place's name (the
gym's, Power Spot's or stop's); "Here" only where none names one.
S5: "Hatched", "Egg" and "Ended" capitalized on the badge and in the list.
S11: the side pane's parts are arranged in place (keepTools takes the
wanted parts in order): the list is never taken out of the page to be put
back, so a focused line whose party ended gives its focus to the sort.
S16: Escape closes every report and change form as its Cancel does, the
popup under it left open (escapeCancels, one helper, also the post's
forms); route mode keeps its own Escape.
S22: "What's going on" in the list's heading, the logged-out pane and the
pane's label.

**Files:**

```
 src/web/client/form-escape.test.ts               | 60 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/form-escape.ts                    | 18 ++++++++++++++++++
 src/web/client/list-ui.test.ts                   | 49 ++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/list-ui.ts                        | 11 +++++++----
 src/web/client/map.css                           | 22 ++++++++++++++++++++++
 src/web/client/max-ui.ts                         |  2 ++
 src/web/client/meetup-ui.ts                      |  3 +++
 src/web/client/party-layer-draw.isolated.test.ts |  7 +++++++
 src/web/client/party-layer.isolated.test.ts      | 15 ++++++++++++++-
 src/web/client/party-layer.ts                    | 49 ++++++++++++++++++++++++++++++++++++++-----------
 src/web/client/post-forms-ui.ts                  |  8 +++-----
 src/web/client/raid-marker.test.ts               |  8 ++++----
 src/web/client/raid-marker.ts                    | 12 ++++++------
 src/web/client/raid-ui.ts                        |  3 +++
 src/web/client/research-ui.ts                    |  2 ++
 src/web/client/rocket-ui.ts                      |  2 ++
 src/web/client/shared-place.test.ts              | 20 ++++++++++++++++++++
 src/web/client/shared-place.ts                   | 27 +++++++++++++++++++++++++--
 src/web/client/spawn-ui.ts                       |  2 ++
 src/web/client/stop-popup.ts                     |  2 +-
 src/web/client/stop-report-ui.ts                 |  2 +-
 src/web/client/stop-reports.ts                   |  1 +
 src/web/client/theme.css                         |  3 +++
 src/web/client/train-forms.test.ts               | 53 +++++++++++++++++++++++++++++------------------------
 src/web/client/train-forms.ts                    | 29 +++++++++++++++--------------
 src/web/client/train-ui.ts                       |  2 ++
 src/web/client/what-is-on.test.ts                |  6 ++++++
 src/web/client/what-is-on.ts                     |  6 +++---
 src/web/page.test.ts                             |  2 +-
 src/web/page.ts                                  |  2 +-
 30 files changed, 349 insertions(+), 79 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/form-escape.test.ts src/web/client/list-ui.test.ts src/web/client/party-layer-draw.isolated.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/raid-marker.test.ts src/web/client/shared-place.test.ts src/web/client/train-forms.test.ts src/web/client/what-is-on.test.ts src/web/page.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff a106cc7b4cf48c6705534e973e4622f9ef9da0a2 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A: the map's small fixes (S2, S3, S4, S5, S11, S16, S22)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/form-escape.test.ts b/src/web/client/form-escape.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b36c546daeaf107cd75eaac991476cffbd069380
--- /dev/null
+++ b/src/web/client/form-escape.test.ts
@@ -0,0 +1,60 @@
+import { describe, expect, it } from 'vitest';
+import { escapeCancels } from './form-escape.js';
+
+/** A form with its Cancel (or none), the keydown listener it was given, and what was done. */
+function form(withCancel = true) {
+  const done: string[] = [];
+  let listener: ((event: KeyEvent) => void) | undefined;
+  const cancel = {
+    click: () => {
+      done.push('cancel');
+    },
+  };
+  const element = {
+    addEventListener: (type: string, handler: (event: KeyEvent) => void) => {
+      if (type === 'keydown') listener = handler;
+    },
+    querySelector: (selector: string) =>
+      withCancel && selector === 'button[data-cancel]' ? cancel : null,
+  };
+  const press = (key: string, defaultPrevented = false) => {
+    const event: KeyEvent = {
+      key,
+      defaultPrevented,
+      stopPropagation: () => {
+        done.push('stopped');
+      },
+      preventDefault: () => {
+        done.push('prevented');
+      },
+    };
+    listener?.(event);
+  };
+  escapeCancels(element as unknown as HTMLElement);
+  return { done, press };
+}
+
+interface KeyEvent {
+  key: string;
+  defaultPrevented: boolean;
+  stopPropagation(): void;
+  preventDefault(): void;
+}
+
+describe('Escape in a form of the map (plan 8M-11A, S16)', () => {
+  it('closes the form as its Cancel does, and goes no further: the popup under it stays', () => {
+    const { done, press } = form();
+    press('Escape');
+    expect(done).toEqual(['stopped', 'prevented', 'cancel']);
+  });
+
+  it('leaves other keys, a key a field took already, and a form without Cancel alone', () => {
+    const some = form();
+    some.press('Enter');
+    some.press('Escape', true);
+    expect(some.done).toEqual([]);
+    const none = form(false);
+    none.press('Escape');
+    expect(none.done).toEqual([]);
+  });
+});
diff --git a/src/web/client/form-escape.ts b/src/web/client/form-escape.ts
new file mode 100644
index 0000000000000000000000000000000000000000..71bf4fafb3fee2f430482c5a878bd86c7f3d4f80
--- /dev/null
+++ b/src/web/client/form-escape.ts
@@ -0,0 +1,18 @@
+/**
+ * Escape closes a form of the map as its Cancel does (plan 8M-11A, S16): the report and change
+ * forms (a raid's report and Change…, a max battle's, a spawn's, research, Rocket, a meetup's
+ * form and editor, a new train) and the forms of a post's controls. The key goes no further: the
+ * popup or card under the form stays open (Leaflet's own Escape, the card's). A key a field took
+ * already (`defaultPrevented`), and a form without Cancel, are left alone. The one helper every
+ * form uses; route mode keeps its own Escape, which ends a stop's drag.
+ */
+export function escapeCancels(form: HTMLElement): void {
+  form.addEventListener('keydown', (event) => {
+    if (event.key !== 'Escape' || event.defaultPrevented) return;
+    const cancel = form.querySelector<HTMLButtonElement>('button[data-cancel]');
+    if (!cancel) return;
+    event.stopPropagation();
+    event.preventDefault();
+    cancel.click();
+  });
+}
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index c03f705e3e35a918d39912908a5f94c03c1c19fc..40bcdce84b870897eab8284ec9a6a6abad0b54fe 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -1,6 +1,7 @@
 import { afterEach, describe, expect, it, vi } from 'vitest';
 import type { LayerRegistry } from './layer-registry.js';
-import { WhatIsOn } from './list-ui.js';
+import { loggedOutPane, WhatIsOn } from './list-ui.js';
+import { keepTools } from './train-forms.js';
 import type { ListLine } from './what-is-on.js';
 
 /** The element that has the focus in the fake document. */
@@ -100,6 +101,24 @@ class FakeElement {
     for (const listener of this.listeners.get(type) ?? []) listener();
   }
 
+  get childNodes(): FakeElement[] {
+    return this.children;
+  }
+
+  removeChild(node: FakeElement): void {
+    this.children.splice(this.children.indexOf(node), 1);
+    node.parent = undefined;
+    if (focused.element && node.contains(focused.element)) focused.element = null;
+  }
+
+  /** As the DOM's: a node already in the page is taken out first, and loses the focus in it. */
+  insertBefore(node: FakeElement, before: FakeElement | null): void {
+    if (node.parent) node.parent.removeChild(node);
+    const at = before === null ? this.children.length : this.children.indexOf(before);
+    this.children.splice(at, 0, node);
+    node.parent = this;
+  }
+
   contains(node: FakeElement): boolean {
     return node === this || this.children.some((child) => child.contains(node));
   }
@@ -333,6 +352,16 @@ describe('the focus in the list drawn anew (review fix 2)', () => {
     expect(focused.element?.isConnected).toBe(true);
   });
 
+  // Plan 8M-11A (S22): "What's going on", in the heading and the pane of somebody logged out.
+  it("is headed What's going on, with its count, as is the pane of a non-member", () => {
+    const { section } = listed();
+    expect(section.words()).toContain("What's going on · 3");
+    const pane = new FakeElement('aside');
+    loggedOutPane(pane as unknown as HTMLElement, 'member-only');
+    expect(pane.words()).toContain("What's going on");
+    expect(pane.words()).toContain('Only members of this server see what is going on.');
+  });
+
   it('goes to the sort when the line it was on drops out (8M-7 follow-up N1)', () => {
     const { section, list } = listed();
     section.all('button')[2]?.focus();
@@ -341,6 +370,24 @@ describe('the focus in the list drawn anew (review fix 2)', () => {
     expect(focused.element?.attributes.has('data-sort')).toBe(true);
   });
 
+  // Plan 8M-11A (S11): the parties' redraw arranges the side pane (`keepTools`), then shows the
+  // new list; the line whose party ended gives its focus to the sort, not to the page.
+  it('goes to the sort when the line it was on drops out in the redraw of the side pane', () => {
+    const { section, list } = listed();
+    const pane = new FakeElement('aside');
+    pane.root = true;
+    section.root = false;
+    const box = new FakeElement('div');
+    pane.append(section);
+    section.all('button')[2]?.focus();
+    // The redraw: the trains' box offered now, then the list without the third train.
+    keepTools<FakeElement>(pane, [box, section]);
+    list.show(lines.slice(0, 2));
+    expect(focused.element?.tagName).toBe('select');
+    expect(focused.element?.attributes.has('data-sort')).toBe(true);
+    expect(focused.element?.isConnected).toBe(true);
+  });
+
   it('stays on the sort while it is changed', () => {
     const { section, list } = listed();
     const [sort] = section.all('select');
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index 23dc09791e0fbece6ac1496ea560c09d03fb3e50..7a4bc14258ca97db60980ec2384922e27d5ca52d 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -120,7 +120,7 @@ export class WhatIsOn {
     });
     const header = document.createElement('header');
     const heading = document.createElement('h2');
-    heading.textContent = `What's on · ${groups.reduce((sum, group) => sum + group.lines.length, 0)}`;
+    heading.textContent = `${LIST_HEADING} · ${groups.reduce((sum, group) => sum + group.lines.length, 0)}`;
     const sort = document.createElement('select');
     sort.setAttribute('aria-label', 'Sort');
     // Found again by it when the list is drawn anew (`sameControl`).
@@ -266,18 +266,21 @@ export function sameControl(
   return root.querySelector<HTMLElement>(`${control.tagName.toLowerCase()}${data}`);
 }
 
+/** The list's heading (plan 8M-11A, S22), and the pane's `aria-label` (`page.ts`). */
+export const LIST_HEADING = "What's going on";
+
 /** The side pane of somebody who is not a member: how to log in, or that it is for members. */
 export function loggedOutPane(
   section: HTMLElement,
   login: 'discord' | 'links' | 'member-only',
 ): void {
   const heading = document.createElement('h2');
-  heading.textContent = "What's on";
+  heading.textContent = LIST_HEADING;
   const line = document.createElement('p');
   line.textContent =
     login === 'member-only'
-      ? 'Only members of this server see what is on.'
-      : 'Log in to see what is on.';
+      ? 'Only members of this server see what is going on.'
+      : 'Log in to see what is going on.';
   const parts: HTMLElement[] = [heading, line];
   if (login === 'discord') {
     const link = document.createElement('a');
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 8a4b63133f9ccf08e1c4e5d9e278bb94ec44a198..6cd9fce70331793261235d71f8f5379a27697658 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1197,6 +1197,28 @@ path.highlighted {
   color: var(--muted);
 }
 
+/*
+ * A finger's × (plan 8M-11A, S3): on a coarse pointer the popup's and the card's × are 44 pixels
+ * square, and the popup's content starts under the popup's.
+ */
+@media (pointer: coarse) {
+  .leaflet-container a.leaflet-popup-close-button {
+    width: var(--tap-size);
+    height: var(--tap-size);
+    font-size: 28px;
+    line-height: var(--tap-size);
+  }
+
+  .leaflet-popup-content {
+    margin-top: var(--tap-size);
+  }
+
+  .party-card .card-close {
+    min-width: var(--tap-size);
+    min-height: var(--tap-size);
+  }
+}
+
 /* The side bar of a card, as a components-v2 container's: the color of what it shows. */
 .leaflet-popup-content-wrapper:has(.party-popup.raid),
 .leaflet-popup-content-wrapper:has(.party-popup.raids) {
diff --git a/src/web/client/max-ui.ts b/src/web/client/max-ui.ts
index 3f1da64a2f776af0ff4cf3753bd62157f010eab6..35cacdde46798e7da727033d808c4eb8b79761ea 100644
--- a/src/web/client/max-ui.ts
+++ b/src/web/client/max-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import type { MaxOptionsView } from '../../domain/web/max-data.js';
 import type { MapMax } from '../../domain/web/party-data.js';
@@ -152,6 +153,7 @@ export function maxUi(deps: MaxUiDeps) {
         }
         hold.fit();
       });
+      escapeCancels(form);
       form.addEventListener('click', (event) => {
         clicked(form, event);
       });
diff --git a/src/web/client/meetup-ui.ts b/src/web/client/meetup-ui.ts
index e6137b874112e9f88e84671cb280255241950503..8016e129652ad94148d3c47516655d8c73afe5cd 100644
--- a/src/web/client/meetup-ui.ts
+++ b/src/web/client/meetup-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import type { LatLon } from '@pine/wayspot-core/lat-lon';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import { MEETUP_CHANGES, type MeetupChange, type StopsView } from '../../domain/web/meetup-data.js';
@@ -216,6 +217,7 @@ export function meetupUi(deps: MeetupUiDeps) {
       }),
       document,
     );
+    escapeCancels(form);
     form.addEventListener('click', (event) => {
       madeClicked(form, event);
     });
@@ -313,6 +315,7 @@ export function meetupUi(deps: MeetupUiDeps) {
       meetupEditor(editing.meetup, deps.zone(), Date.now(), editing.filled, readerZone()),
       document,
     );
+    escapeCancels(editor);
     editor.addEventListener('click', (event) => {
       editClicked(editor, event);
     });
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 8320a2eb93b020382c85d7010bede51de03e31ad..7b5109a404b072e394e6d3ea51b06b69b374712c 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -420,6 +420,13 @@ class PageElement {
     child.remove();
   }
 
+  insertBefore(child: PageElement, before: PageElement | null): void {
+    child.remove();
+    child.parent = this;
+    const at = before === null ? this.childNodes.length : this.childNodes.indexOf(before);
+    this.childNodes.splice(at, 0, child);
+  }
+
   remove(): void {
     if (!this.parent) return;
     this.parent.childNodes = this.parent.childNodes.filter((child) => child !== this);
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index f2fedfc2964dc10d986e672fadf913f3b9a6007c..42b19594693417748c209c600f7d1b192fa28099 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -289,7 +289,11 @@ describe("the map's popups (showParties)", () => {
         handlers.set(type, [...(handlers.get(type) ?? []), handler]);
         return map;
       },
-      createPane: () => ({ style: {} }),
+      createPane: (name: string) => {
+        const pane = { style: {} as { zIndex?: string } };
+        panes.set(name, pane);
+        return pane;
+      },
     };
     showParties(
       map as unknown as Parameters<typeof showParties>[0],
@@ -315,6 +319,15 @@ describe("the map's popups (showParties)", () => {
     };
     return { fire };
   };
+  /** The panes the map was asked to make, by name. */
+  const panes = new Map<string, { style: { zIndex?: string } }>();
+
+  // Plan 8M-11A (S2): the rings under Leaflet's markers (600) and over its overlays (400), so that
+  // a raid's time badge is drawn over a meetup's or a train's ring.
+  it("puts the rings' pane below the markers and above the overlays", () => {
+    started();
+    expect(panes.get(RING_PANE)?.style.zIndex).toBe('590');
+  });
 
   it('draws the rings of meetups and trains with one SVG renderer on their pane', () => {
     renderers.length = 0;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 298acc0384cae0f417f3f928067cf9979a49abe7..7ff702107827a20fd89877e9fe9772963871160c 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -59,7 +59,13 @@ import type { DistanceUnits } from './distance.js';
 import { WhatIsOn } from './list-ui.js';
 import { STREET_ZOOM, withinReach, type LatLon, type ViewStorage } from './view.js';
 import { ListRefresh, listLines, paneShows, stopReportLines, waitingNote } from './what-is-on.js';
-import { placeListNode, sharedPlace, startWords, type PlacedThing } from './shared-place.js';
+import {
+  placeKeyOfStop,
+  placeListNode,
+  sharedPlace,
+  startWords,
+  type PlacedThing,
+} from './shared-place.js';
 import type { MapParty, MapRaid, PostView } from '../../domain/web/party-data.js';
 import {
   ALL_RAIDS_HERE,
@@ -107,11 +113,13 @@ const COUNTDOWN_MS = 15_000;
  */
 export const PREFETCH_POSTS = 20;
 /**
- * The pane of the rings of meetups and trains: above Leaflet's markers (600), below its tooltips
- * (650).
+ * The pane of the rings of meetups and trains: below Leaflet's markers (600), so that a raid's time
+ * badge is drawn over a ring at its gym, and above its overlay pane (400) of the gyms' dots (plan
+ * 8M-11A, S2). A ring takes clicks on its line still: it is unfilled, and a marker covers only its
+ * own circle.
  */
 export const RING_PANE = 'rings';
-const RING_PANE_Z = 625;
+const RING_PANE_Z = 590;
 /** A gym's dot on the map (`main.ts`). */
 export const GYM_DOT = { radius: 6, weight: 2 } as const;
 /** The ring of a meetup at its place. */
@@ -120,8 +128,8 @@ export const MEETUP_RING = ringSizes(undefined).meetup;
 /**
  * Where a train is on the map (plan 8S-4): a ring around the gym of its stop, unfilled, so that a
  * click inside it reaches the gym's dot or the marker of its raids, and its line opens the train's
- * popup; on the pane of the rings, above the markers. A train not at a stop yet is a dashed, pale
- * ring at its first gym; drawn in `colour` (the theme's train colour). `interactive` is false while
+ * popup; on the pane of the rings, under the markers (plan 8M-11A, S2). A train not at a stop yet
+ * is a dashed, pale ring at its first gym; drawn in `colour` (the theme's train colour). `interactive` is false while
  * the trains let clicks through (route mode, a meetup's place picked); `renderer` is the rings'
  * SVG renderer on their pane (a canvas would take the clicks inside the ring).
  */
@@ -1342,6 +1350,7 @@ export function showParties(
         picture: lead.picture,
         name: lead.heading + (raids.length > 1 ? ` (and ${raids.length - 1} more)` : ''),
         time: raidBadge(lead, now, readerZone()),
+        place: { key: `gym:${String(gymId)}`, name: gym.name },
       });
     }
     // Max battles (plan 8M-9A, A2): at their Power Spot or pin, drawn as a raid is (the boss in a
@@ -1374,6 +1383,10 @@ export function showParties(
         picture: max.picture,
         name: max.title,
         time: raidBadge(max, now, readerZone()),
+        // A Power Spot's name; a pin names no place.
+        ...(max.spotId === null
+          ? {}
+          : { place: { key: `spot:${max.spotId}`, name: max.place.name } }),
       });
     }
     // The Power Spots whose battle is drawn (the raids' layer on): their own dot is not (A6), and
@@ -1395,8 +1408,8 @@ export function showParties(
       drawn.clickable && !meetupForms.picking() && !report.inTools() && !researchForms.adding();
     // Meetups at their place (plan 8M-5M): at the gym as the map has it now, else the snapshot's
     // point; listed in the side panel too. A ring without a fill, which takes clicks on its line
-    // alone: a gym's dot inside it stays a dot to click. On a pane of its own above the markers
-    // (a raid's picture, route mode's numbers), so that the ring is not hidden under them.
+    // alone: a gym's dot inside it stays a dot to click. On a pane of its own under the markers
+    // and over the gyms' dots (plan 8M-11A, S2): a raid's time badge is drawn over the ring.
     for (const meetup of next.meetups) {
       const { place } = meetup;
       if (!place) continue;
@@ -1425,6 +1438,7 @@ export function showParties(
         picture: null,
         name: meetup.name,
         time: startWords(meetup.startTime, now, readerZone()),
+        ...(gym ? { place: { key: `gym:${String(gym.id)}`, name: gym.name } } : {}),
       });
     }
     for (const train of drawn.trains) {
@@ -1475,6 +1489,14 @@ export function showParties(
           picture: null,
           name: train.name,
           time: startWords(train.startTime, now, readerZone()),
+          ...(stopKey === undefined
+            ? {}
+            : {
+                place: {
+                  key: placeKeyOfStop(stopKey),
+                  name: stopName(gyms.get(Number(stopKey)), stopKey, train.spots),
+                },
+              }),
         });
       }
     }
@@ -1521,10 +1543,15 @@ export function showParties(
     const formOpen =
       trainForms.inTools() || meetupForms.inTools() || report.inTools() || researchForms.inTools();
     const reporting = reportOffered(mayReport, next);
-    keepTools<ChildNode>(panel, reporting || formOpen ? tools : undefined);
     // The phone list's own Report line (plan 8M-9A, A7), over the list, while Report is offered
-    // (review B2: not for a form left open while the list went read-only).
-    panel.append(...(reporting ? [report.line] : []), listSection);
+    // (review B2: not for a form left open while the list went read-only). The list stays in the
+    // page while it is drawn anew (plan 8M-11A, S11): a focused line whose party ended gives its
+    // focus to the sort.
+    keepTools<ChildNode>(panel, [
+      ...(reporting || formOpen ? [tools] : []),
+      ...(reporting ? [report.line] : []),
+      listSection,
+    ]);
     paneShown();
     // The list of what is on (plan 8M-7): every party the layers on show, across the server;
     // trains and raids the map cannot draw, and meetups without a place, keep their line.
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index beaab5b25bf147f6eb2e649df4cc47628c373a25..fde2dee70e82d26420198ca51b02830d37b39630 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -9,6 +9,7 @@ import {
   splitForm,
 } from './train-post-forms.js';
 import { getJson } from './common.js';
+import { escapeCancels } from './form-escape.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
 import {
@@ -175,11 +176,8 @@ export function postFormsUi(deps: PostFormsDeps) {
       if (target.dataset.cancel !== undefined) close();
       else if (target.dataset.submit !== undefined) void submit(target);
     });
-    element.addEventListener('keydown', (event) => {
-      if (event.key !== 'Escape') return;
-      event.stopPropagation();
-      close();
-    });
+    // Escape as Cancel, the popup or card under it left open (plan 8M-11A, S16).
+    escapeCancels(element);
     section.replaceChildren(element);
     hold.fit();
     (
diff --git a/src/web/client/raid-marker.test.ts b/src/web/client/raid-marker.test.ts
index 26cf1f2e03782a50c8dcbcf4d20f568a057a620e..3e1bd97a9f9af4a80591844377429c6f4d53631d 100644
--- a/src/web/client/raid-marker.test.ts
+++ b/src/web/client/raid-marker.test.ts
@@ -63,13 +63,13 @@ describe("a raid's marker (plan 8M-7)", () => {
     expect(raidBadge(raid(), NOW, ZONE)).toBe('12m');
     expect(raidBadge(raid({ endTime: NOW + 65 * MINUTE }), NOW, ZONE)).toBe('1h 05m');
     expect(raidBadge(raid({ endTime: NOW + 30_000 }), NOW, ZONE)).toBe('1m');
-    expect(raidBadge(raid({ endTime: NOW - MINUTE }), NOW, ZONE)).toBe('ended');
+    expect(raidBadge(raid({ endTime: NOW - MINUTE }), NOW, ZONE)).toBe('Ended');
     const egg = raid({ stage: 'egg', hatchTime: NOW + 40 * MINUTE, endTime: NOW + 85 * MINUTE });
     expect(raidBadge(egg, NOW, ZONE)).toBe('hatches 2:40');
     // Hatched by the clock since the list was made: the time left.
     expect(raidBadge(egg, NOW + 41 * MINUTE, ZONE)).toBe('44m');
-    expect(raidBadge(raid({ stage: 'egg', hatchTime: null }), NOW, ZONE)).toBe('egg');
-    expect(raidBadge(raid({ endTime: null }), NOW, ZONE)).toBe('hatched');
+    expect(raidBadge(raid({ stage: 'egg', hatchTime: null }), NOW, ZONE)).toBe('Egg');
+    expect(raidBadge(raid({ endTime: null }), NOW, ZONE)).toBe('Hatched');
     expect(badgeWords('end', NOW + 3 * MINUTE, NOW, ZONE)).toBe('3m');
     expect(badgeWords('hatch', NOW + 3 * MINUTE, NOW, ZONE)).toBe('hatches 2:03');
     // Not today: the day said, as the posts' times (`clockTime`), AM or PM kept.
@@ -172,7 +172,7 @@ describe("a raid's marker (plan 8M-7)", () => {
       badge: '4m',
       dimmed: true,
     });
-    expect(badgeFor('egg', null, null, NOW, ZONE)).toBe('egg');
+    expect(badgeFor('egg', null, null, NOW, ZONE)).toBe('Egg');
     // Nobody going: no count; its last minutes: dimmed; no picture: an empty ring.
     const last = raidMarkerNode(
       raid({
diff --git a/src/web/client/raid-marker.ts b/src/web/client/raid-marker.ts
index 894e7860e592eaed9cc946d8310f6874ec6957d1..febd3a7488290af89631b74f82944e4a6b2e8250 100644
--- a/src/web/client/raid-marker.ts
+++ b/src/web/client/raid-marker.ts
@@ -152,7 +152,7 @@ function shortClock(at: number, zone: string): string {
   return `${part('hour')}:${part('minute')}`;
 }
 
-/** A badge's words: the time left (`12m`, `1h 05m`, `ended`), or `hatches 2:40`. */
+/** A badge's words: the time left (`12m`, `1h 05m`, `Ended`), or `hatches 2:40`. */
 export function badgeWords(kind: 'end' | 'hatch', at: number, now: number, zone: string): string {
   if (kind === 'hatch') {
     // The posts' time (`clockTime`: the day when it is not today); AM or PM left out today only.
@@ -160,14 +160,14 @@ export function badgeWords(kind: 'end' | 'hatch', at: number, now: number, zone:
     return `hatches ${clock === clockTime(at, zone, at) ? shortClock(at, zone) : clock}`;
   }
   const minutes = Math.ceil((at - now) / MINUTE);
-  if (minutes <= 0) return 'ended';
+  if (minutes <= 0) return 'Ended';
   if (minutes < 60) return `${minutes}m`;
   return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
 }
 
 /**
  * The badge of a raid by its times as the marker keeps them (`data-hatch`, `data-end`): an egg
- * counts toward its hatch, a hatched raid (by the clock) toward its end; `egg` or `hatched` where
+ * counts toward its hatch, a hatched raid (by the clock) toward its end; `Egg` or `Hatched` where
  * nobody said when.
  */
 export function badgeFor(
@@ -179,11 +179,11 @@ export function badgeFor(
 ): string {
   // Egg, hatched or ended: the domain's reading (`stageAt`); only the words are the page's.
   const reading = stageAt({ hatchTime, endTime, reportedHatched: stage !== 'egg' }, now);
-  if (reading === 'ended') return 'ended';
+  if (reading === 'ended') return 'Ended';
   if (reading === 'egg') {
-    return hatchTime === null ? 'egg' : badgeWords('hatch', hatchTime, now, zone);
+    return hatchTime === null ? 'Egg' : badgeWords('hatch', hatchTime, now, zone);
   }
-  return endTime === null ? 'hatched' : badgeWords('end', endTime, now, zone);
+  return endTime === null ? 'Hatched' : badgeWords('end', endTime, now, zone);
 }
 
 /** The badge under a raid's or a max battle's marker. */
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index e793a821476861b7df38a91ef67a51da4d111a46..0cd6b4f6e0186d266f310971faaf2187c91739c4 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import type {
   RaidChange,
   RaidMovesView,
@@ -193,6 +194,7 @@ export function raidUi(deps: RaidUiDeps) {
       restore();
       hold.release(claim);
     };
+    escapeCancels(form);
     form.addEventListener('click', (event) => {
       const target = event.target;
       if (!(target instanceof HTMLButtonElement)) return;
@@ -251,6 +253,7 @@ export function raidUi(deps: RaidUiDeps) {
       section.replaceChildren(...before);
       hold.release(claim);
     };
+    escapeCancels(form);
     form.addEventListener('click', (event) => {
       const target = event.target;
       if (!(target instanceof HTMLButtonElement)) return;
diff --git a/src/web/client/research-ui.ts b/src/web/client/research-ui.ts
index fcece2a9ff600593e0623c4ed13d79354f7ee77c..bd98ab35676b72db590d26419578bd9c617a1b1f 100644
--- a/src/web/client/research-ui.ts
+++ b/src/web/client/research-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import {
   stopsAtMost,
   type MapResearch,
@@ -184,6 +185,7 @@ export function researchUi(deps: ResearchUiDeps) {
     if (nearest === undefined) delete open.state.nearest;
     else open.state.nearest = nearest;
     const form = renderNode(researchForm(open.lists, open.stops, open.state, open.mode), document);
+    escapeCancels(form);
     form.addEventListener('click', (event) => {
       clicked(form, event);
     });
diff --git a/src/web/client/rocket-ui.ts b/src/web/client/rocket-ui.ts
index 68823ed3e7d6e773ca00be26b3dde41b3ecf64c8..aa1ae21fe12ec390bda41ede4aae807ff5b243b0 100644
--- a/src/web/client/rocket-ui.ts
+++ b/src/web/client/rocket-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import type { RocketOptionsView } from '../../domain/web/stop-report-data.js';
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
@@ -101,6 +102,7 @@ export function rocketUi(deps: RocketUiDeps) {
         state = { filled: valuesOf(form), ...(state.sending === true ? { sending: true } : {}) };
         draw('select[name="who"]');
       });
+      escapeCancels(form);
       form.addEventListener('click', (event) => {
         clicked(form, event);
       });
diff --git a/src/web/client/shared-place.test.ts b/src/web/client/shared-place.test.ts
index 27fc8a549f0455d17d7f0d15944d62b0679687c0..3d1703174219af1ed829f05634a9342770a5c95f 100644
--- a/src/web/client/shared-place.test.ts
+++ b/src/web/client/shared-place.test.ts
@@ -71,6 +71,26 @@ describe('several things at one place (plan 8M-7)', () => {
     expect(JSON.stringify(node)).toContain('https://x.test/a.png');
   });
 
+  // Plan 8M-11A (S4): headed with the place's name (the gym's, Power Spot's or stop's).
+  // Review fix F5: only where every thing listed is at that same place (a gym, a stop, a Power
+  // Spot); a pin's beside a gym's is "Here".
+  it("is headed with the place's name where every thing is at it, else Here", () => {
+    const heading = (things: PlacedThing[]) => placeListNode(things).children?.[0]?.text;
+    const fountain = { place: { key: 'gym:7', name: 'Schenley Fountain' } };
+    expect(heading([thing('meetup:m1', fountain), thing('gym:7', fountain)])).toBe(
+      'Schenley Fountain',
+    );
+    // A max battle at a pin beside the gym's raid.
+    expect(heading([thing('gym:7', fountain), thing('max:x1')])).toBe('Here');
+    expect(
+      heading([
+        thing('gym:7', fountain),
+        thing('train:t1', { place: { key: 'gym:8', name: 'Schenley Fountain' } }),
+      ]),
+    ).toBe('Here');
+    expect(heading([thing('meetup:m1'), thing('meetup:m2')])).toBe('Here');
+  });
+
   it('name when a train or meetup starts', () => {
     const now = Date.UTC(2026, 9, 13, 18);
     expect(startWords(now + 75 * 60_000, now, 'America/New_York')).toBe('starts 3:15 PM');
diff --git a/src/web/client/shared-place.ts b/src/web/client/shared-place.ts
index 40f436f26ba9f9622d506fe4334ea3f4b6337e87..d922c012656e1c23efdaeefc5babee89c2ed49dc 100644
--- a/src/web/client/shared-place.ts
+++ b/src/web/client/shared-place.ts
@@ -25,6 +25,12 @@ export interface PlacedThing {
   name: string;
   /** Its time in words: time left, the hatch, the start. */
   time: string;
+  /**
+   * The place it is at (a gym, a Power Spot, a stop), by a key of its own (`gym:<id>`, `spot:<id>`,
+   * `stop:<key>`) and its name, which heads the list of the things there where all of them are at
+   * it (plan 8M-11A, S4, review fix F5); none for a pin.
+   */
+  place?: { key: string; name: string };
 }
 
 /**
@@ -47,13 +53,30 @@ export function sharedPlace<T extends PlacedThing>(
   return [target, ...near];
 }
 
-/** The popup that lists the things at one place: a button for each, which opens its own popup. */
+/**
+ * The place key of a train's stop (`MapTrain.route`'s): a gym's `gym:<id>`, a Power Spot's
+ * (`w<id>`) `spot:<id>`, as the other things at one place name theirs (review fix F5).
+ */
+export function placeKeyOfStop(stop: string): string {
+  return stop.startsWith('w') ? `spot:${stop.slice(1)}` : `gym:${stop}`;
+}
+
+/**
+ * The popup that lists the things at one place: headed with the place's name where every one of
+ * them is at that same place (review fix F5), else "Here"; a button for each, which opens its own
+ * popup.
+ */
 export function placeListNode(things: readonly PlacedThing[]): PageNode {
+  const [first] = things;
+  const place =
+    first?.place !== undefined && things.every((thing) => thing.place?.key === first.place?.key)
+      ? first.place.name
+      : undefined;
   return {
     tag: 'div',
     className: 'place-list',
     children: [
-      { tag: 'strong', className: 'name', text: 'Here' },
+      { tag: 'strong', className: 'name', text: place ?? 'Here' },
       {
         tag: 'div',
         className: 'choices',
diff --git a/src/web/client/spawn-ui.ts b/src/web/client/spawn-ui.ts
index 4a335615c619e58cd9719793be285d8e0cf87eb6..e2c335b53ee743c365d7416e37e15a734588f5cc 100644
--- a/src/web/client/spawn-ui.ts
+++ b/src/web/client/spawn-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import type { LatLon } from '@pine/wayspot-core/lat-lon';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import type { WildOptionsView } from '../../domain/web/spawn-data.js';
@@ -100,6 +101,7 @@ export function spawnUi(deps: SpawnUiDeps) {
     // drawing has its own click handler.
     const draw = (filled: Partial<SpawnValues>): void => {
       const form = renderNode(spawnForm(options, regions, filled), document);
+      escapeCancels(form);
       form.addEventListener('click', (event) => {
         clicked(form, event);
       });
diff --git a/src/web/client/stop-popup.ts b/src/web/client/stop-popup.ts
index 2a97535dcec82f368307d3f966fbf92c1ba26bca..f4d648967220250e2fd8836e434890e2deff4062 100644
--- a/src/web/client/stop-popup.ts
+++ b/src/web/client/stop-popup.ts
@@ -169,7 +169,7 @@ function minutesLeft(report: MapGrunt, now: number): PageNode {
   return {
     tag: 'span',
     className: 'left',
-    text: left === 'ended' ? ENDED : `${left} left`,
+    text: left === 'Ended' ? ENDED : `${left} left`,
     attributes: { 'data-left': String(report.endsAt) },
   };
 }
diff --git a/src/web/client/stop-report-ui.ts b/src/web/client/stop-report-ui.ts
index ddb037a45de7193e6e4ef4b5ffd76142cf97f80e..e06dcae78b2657daddba5e61ee1f0706cec2c957 100644
--- a/src/web/client/stop-report-ui.ts
+++ b/src/web/client/stop-report-ui.ts
@@ -116,7 +116,7 @@ export function stopUi(deps: StopUiDeps) {
     tick(root: ParentNode, now: number): void {
       for (const left of root.querySelectorAll<HTMLElement>('[data-left]')) {
         const words = badgeWords('end', Number(left.dataset.left), now, 'UTC');
-        left.textContent = words === 'ended' ? ENDED : `${words} left`;
+        left.textContent = words === 'Ended' ? ENDED : `${words} left`;
       }
       for (const section of root.querySelectorAll<HTMLElement>('.stop-report[data-ends]')) {
         if (Number(section.dataset.ends) > now || section.classList.contains('ended')) continue;
diff --git a/src/web/client/stop-reports.ts b/src/web/client/stop-reports.ts
index cfa4540f8787415ffeff78ba6ba02d4d65a7ca3d..a85995205db9f536b4ddc24d10592f1eee4adb9f 100644
--- a/src/web/client/stop-reports.ts
+++ b/src/web/client/stop-reports.ts
@@ -191,6 +191,7 @@ export function stopPlaced(at: StopReports, now: number): PlacedThing & { layer:
     lon: at.stop.lon,
     picture: facts.picture.kind === 'picture' ? facts.picture.src : null,
     name: at.stop.name,
+    place: { key: `stop:${at.stop.key}`, name: at.stop.name },
     time: [...(at.research.length > 0 ? ['Field research'] : []), ...rocketWords(at, now)].join(
       ' · ',
     ),
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 5444ec4da31369f4b9bc27fb658a6df9d83b67b1..5b17e17e232b2da45d90f0fe18233972c0bf2c57 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -26,6 +26,8 @@
   /* A refusal shakes its popup or card once (plan 8M-11A): how long, and how far each way. */
   --shake-time: 300ms;
   --shake-distance: 6px;
+  /* The least a finger's button is, on a coarse pointer (plan 8M-11A, S3). */
+  --tap-size: 44px;
 
   /* Discord's surfaces, light. */
   --page-bg: #ffffff;
@@ -169,6 +171,7 @@
     --fix-box-width: 340px;
     --shake-time: 300ms;
     --shake-distance: 6px;
+    --tap-size: 44px;
 
     /* Discord's surfaces, dark. */
     --page-bg: #313338;
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 5376ec3e2d990a4f3ad1b2256c19b5ed0eb95c9d..8c366efcc32e78e484d70406b5bf2ef37b7376ba 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -668,46 +668,51 @@ describe("a train's answer (trainAnswerOf, sendTrainForm)", () => {
   });
 });
 
-describe("the trains' box in the side panel (keepTools)", () => {
-  /** A side panel over a list of its children, recording each one it took out. */
+describe("the side pane's parts in their order (keepTools)", () => {
+  /** A side pane over a list of its children, recording each one it took out or moved. */
   const sidePanel = (...children: string[]) => {
     const panel = {
       children,
       takenOut: [] as string[],
-      get firstChild() {
-        return panel.children[0] ?? null;
-      },
-      get lastChild() {
-        return panel.children.at(-1) ?? null;
+      moved: [] as string[],
+      get childNodes() {
+        return panel.children;
       },
       removeChild(child: string) {
         panel.takenOut.push(child);
         panel.children = panel.children.filter((one) => one !== child);
       },
-      replaceChildren(...next: string[]) {
-        panel.takenOut.push(...panel.children);
-        panel.children = next;
+      insertBefore(child: string, before: string | null) {
+        if (panel.children.includes(child)) panel.moved.push(child);
+        const rest = panel.children.filter((one) => one !== child);
+        const at = before === null ? rest.length : rest.indexOf(before);
+        panel.children = [...rest.slice(0, at), child, ...rest.slice(at)];
       },
     };
     return panel;
   };
 
-  it('leaves the box in place while the list under it is drawn anew, so that a field in it keeps the focus', () => {
-    const panel = sidePanel('box', 'heading', 'list');
-    keepTools(panel, 'box');
-    expect(panel.children).toEqual(['box']);
-    expect(panel.takenOut).toEqual(['list', 'heading']);
+  it('leaves the box and the list in place while the list is drawn anew: a focus in either stays', () => {
+    const panel = sidePanel('box', 'old line', 'list');
+    keepTools(panel, ['box', 'list']);
+    expect(panel.children).toEqual(['box', 'list']);
+    expect(panel.takenOut).toEqual(['old line']);
+    expect(panel.moved).toEqual([]);
   });
 
-  it('puts the box first when it is not, and takes it out when it is not offered', () => {
+  // Plan 8M-11A (S11): the list is never taken out of the page to be put back, which lost the
+  // focus of a line whose party ended before the list could give it to the sort.
+  it('puts what is new before the list without moving the list, and takes out what is not offered', () => {
     const empty = sidePanel();
-    keepTools(empty, 'box');
-    expect(empty.children).toEqual(['box']);
-    const without = sidePanel('heading', 'list');
-    keepTools(without, 'box');
-    expect(without.children).toEqual(['box']);
-    const shown = sidePanel('box', 'heading', 'list');
-    keepTools(shown, undefined);
-    expect(shown.children).toEqual([]);
+    keepTools(empty, ['box', 'list']);
+    expect(empty.children).toEqual(['box', 'list']);
+    const without = sidePanel('list');
+    keepTools(without, ['box', 'report line', 'list']);
+    expect(without.children).toEqual(['box', 'report line', 'list']);
+    expect(without.moved).toEqual([]);
+    const shown = sidePanel('box', 'report line', 'list');
+    keepTools(shown, ['list']);
+    expect(shown.children).toEqual(['list']);
+    expect(shown.takenOut).toEqual(['box', 'report line']);
   });
 });
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index 1e7c6de35349e15da38fd71885f2dff9d04f9d2f..0a8799b6a6128f5a7544208f6f84dbd03ad17213 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -253,26 +253,27 @@ export function drawnTrains(
 
 /** What `keepTools` needs of the side panel: the DOM's, or a test's. */
 export interface ToolsPanel<N> {
-  readonly firstChild: N | null;
-  readonly lastChild: N | null;
+  readonly childNodes: ArrayLike<N>;
   removeChild(child: N): unknown;
-  replaceChildren(...children: N[]): void;
+  insertBefore(child: N, before: N | null): unknown;
 }
 
 /**
- * The side panel with the trains' box first (`tools`; none when it is not offered) and nothing
- * under it yet, for the list to be appended. A box already first is left where it is, only what
- * follows it taken out: a field of the start form or the route editor keeps the focus, and what
- * is typed in it stays, while the list is drawn anew under it.
+ * The side pane with its parts in order (`wanted`: the trains' box where offered, the phone's
+ * Report line, the list of what is on), and nothing else. A part already in its place is never
+ * moved or taken out of the page: a field of the start form or the route editor keeps the focus
+ * and what is typed in it while the list is drawn anew, and the list keeps the focus of its line
+ * until it gives it to the sort where the line's party ended (plan 8M-11A, S11); what is new is put
+ * before the parts that follow it.
  */
-export function keepTools<N>(panel: ToolsPanel<N>, tools: N | undefined): void {
-  if (tools === undefined || panel.firstChild !== tools) {
-    panel.replaceChildren(...(tools === undefined ? [] : [tools]));
-    return;
-  }
-  for (let last = panel.lastChild; last !== null && last !== tools; last = panel.lastChild) {
-    panel.removeChild(last);
+export function keepTools<N>(panel: ToolsPanel<N>, wanted: readonly N[]): void {
+  for (const child of Array.from(panel.childNodes)) {
+    if (!wanted.includes(child)) panel.removeChild(child);
   }
+  wanted.forEach((part, index) => {
+    const there = panel.childNodes[index] ?? null;
+    if (there !== part) panel.insertBefore(part, there);
+  });
 }
 
 /**
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 6e68406c2642e7f2dc2238647eb6d721bf033bbe..caf767d57e33e3e19fbe2b206c0d12c28498d94e 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -1,3 +1,4 @@
+import { escapeCancels } from './form-escape.js';
 import type { PressAnswer } from './press-answer.js';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import type { MapTrain } from '../../domain/web/party-data.js';
@@ -453,6 +454,7 @@ export function trainUi(deps: TrainUiDeps) {
       toolsIdle();
       hold.release(claim);
     };
+    escapeCancels(form);
     form.addEventListener('click', (event) => {
       const target = event.target;
       if (!(target instanceof HTMLButtonElement)) return;
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 8374558710f048477cb48a384f1d110a9cc452f2..218e6dba125d6cd4719852b8fd3ff5a15c8fbb37 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -310,6 +310,12 @@ describe('the list of what is on (plan 8M-7)', () => {
     expect(lineWords(r1, CENTER, NOW, ZONE, 'metric').distance).toBe('440 m');
     // A meetup without a place keeps its line, without a distance.
     expect(words('meetup:m2')).toMatchObject({ place: null, distance: null });
+    // Plan 8M-11A (S5): where nobody said when, and once over, capitalized as the badge.
+    const timed = (times: (typeof r1)['times']) =>
+      lineWords({ ...r1, times }, CENTER, NOW, ZONE, 'imperial').time;
+    expect(timed({ stage: 'egg', hatch: null })).toBe('Egg');
+    expect(timed({ stage: 'hatched', hatch: null, end: null })).toBe('Hatched');
+    expect(timed({ stage: 'hatched', hatch: null, end: NOW - 60_000 })).toBe('Ended');
   });
 
   // Plan 8M-9A (A2): max battles are lines of the raids' group, by their title and end.
diff --git a/src/web/client/what-is-on.ts b/src/web/client/what-is-on.ts
index 02d76b48fa6b3aa3932cae1dc7be53440b588f18..ee6190079cd3bc82eb33995263657c41c00222ce 100644
--- a/src/web/client/what-is-on.ts
+++ b/src/web/client/what-is-on.ts
@@ -309,11 +309,11 @@ export function lineWords(
       stageAt({ hatchTime: hatch, endTime: null, reportedHatched: stage !== 'egg' }, now) ===
       'hatched';
     dimmed = isDimmed({ stage, hatchTime: hatch, endTime: end }, now);
-    if (!hatched) time = hatch === null ? 'egg' : `hatches ${clockTime(hatch, zone, now)}`;
-    else if (end === null) time = 'hatched';
+    if (!hatched) time = hatch === null ? 'Egg' : `hatches ${clockTime(hatch, zone, now)}`;
+    else if (end === null) time = 'Hatched';
     else {
       const left = badgeWords('end', end, now, zone);
-      time = left === 'ended' ? left : `${left} left`;
+      time = left === 'Ended' ? left : `${left} left`;
     }
   }
   return {
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 47d0fb835c706779d7f57c4972179ac58a161ada..7ad800a37c3bfaf9b964fd0f7cd07ac8fdfcdb2c 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -94,7 +94,7 @@ describe('the map page', () => {
     // of its own while the live map's `<main>` is hidden (branch review W3).
     expect(page.body).toContain(
       '<main id="map" aria-label="Map"></main>' +
-        '<aside id="parties" aria-label="What is on" hidden></aside>' +
+        '<aside id="parties" aria-label="What\'s going on" hidden></aside>' +
         '<div id="editor-map" class="editor-only" role="region" aria-label="Map of the regions" hidden></div>' +
         '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
     );
diff --git a/src/web/page.ts b/src/web/page.ts
index 60f31c7c2108d18fbb991742de7a123a08175b0c..594fc92d36aa490b6d4a161f6e6da448e24fd208 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -154,7 +154,7 @@ export function mapPage(data: MapPageData, assets: AssetManifest): string {
     '<div id="content"><div id="notice" role="status" hidden><span id="notice-text"></span>' +
       '<button id="notice-close" type="button" aria-label="Hide this line">×</button></div>' +
       '<main id="map" aria-label="Map"></main>' +
-      '<aside id="parties" aria-label="What is on" hidden></aside>' +
+      '<aside id="parties" aria-label="What\'s going on" hidden></aside>' +
       '<div id="editor-map" class="editor-only" role="region" aria-label="Map of the regions" hidden></div>' +
       '<aside id="editor-panel" class="editor-only" aria-label="Regions" hidden></aside></div>',
     '<noscript><p>The map needs JavaScript.</p></noscript>',
````

### Task 4: 8M-11A S6, S19, S28: one wording of times on the map

Prototype commit: `3f13d383b175e93289c0b4c9fde060bec2c33248`

src/render/duration-words.ts, import-free, the web's words only:
relativeStamp words a stamp of Discord's (<t:...:R>) as Discord's client
does (a minute from 45 seconds, an hour from 45 minutes, a day from 22
hours, in the reader's language; "in a day", not "in 24 hours"), for the
posts drawn on the map (post-time.ts) and the bot's words on the map
(page-words.ts, in place of relativeTime). durationWords words a time left
Pine composes: "17 min", "1 h 05 min", the minutes rounded to the nearest
as Discord rounds them, so the list's "29 min left" and the post's "in 29
minutes" agree; its compact form "1 h 05" for a marker's badge. Minutes
are never "m". The badge, the list, the stop popups and the countdowns use
it (timeLeft for "... left").

src/text-durations.test.ts refuses minutes or hours worded by hand in the
web pages, as text-distances.test.ts does for distances.

**Files:**

```
 src/domain/web/clock.ts             |  14 --------------
 src/render/duration-words.test.ts   |  65 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/duration-words.ts        |  83 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/text-durations.test.ts          | 115 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/parties.test.ts      |   2 +-
 src/web/client/parties.ts           |  15 ++++++---------
 src/web/client/post-time.test.ts    |  10 +++++++++-
 src/web/client/post-time.ts         |  19 +++----------------
 src/web/client/raid-marker.test.ts  |  22 +++++++++++-----------
 src/web/client/raid-marker.ts       |  22 +++++++++++++++-------
 src/web/client/stop-popup.test.ts   |   2 +-
 src/web/client/stop-popup.ts        |   5 ++---
 src/web/client/stop-report-ui.ts    |   5 ++---
 src/web/client/stop-reports.test.ts |   6 +++---
 src/web/client/stop-reports.ts      |   2 +-
 src/web/client/what-is-on.test.ts   |  10 +++++-----
 src/web/client/what-is-on.ts        |   6 +++---
 src/web/meetup-change.test.ts       |   2 +-
 src/web/page-words.test.ts          |  10 +++++-----
 src/web/page-words.ts               |   8 +++++---
 src/web/party-meet.test.ts          |   2 +-
 src/web/stop-report-post.test.ts    |   4 ++--
 22 files changed, 339 insertions(+), 90 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/duration-words.test.ts src/text-durations.test.ts src/web/client/parties.test.ts src/web/client/post-time.test.ts src/web/client/raid-marker.test.ts src/web/client/stop-popup.test.ts src/web/client/stop-reports.test.ts src/web/client/what-is-on.test.ts src/web/meetup-change.test.ts src/web/page-words.test.ts src/web/party-meet.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3f13d383b175e93289c0b4c9fde060bec2c33248 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A S6, S19, S28: one wording of times on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/clock.ts b/src/domain/web/clock.ts
index 5c8d3352f530ff13db52ceda68f619146c362e2a..b1c1d07a794c3c2f2530a2b4100da36036280b2f 100644
--- a/src/domain/web/clock.ts
+++ b/src/domain/web/clock.ts
@@ -51,17 +51,3 @@ function zoned(at: number, zone: string, month: 'long' | 'short'): string {
     }).format(at),
   );
 }
-
-/**
- * How long until a moment, or since it, to the minute: `in 13 min`, `in 1 h 5 min`, `in 2 h`,
- * `1 h 30 min ago`, `now` (what Discord's relative timestamps say, as the page words them).
- */
-export function relativeTime(at: number, now: number): string {
-  const minutes = Math.round((at - now) / 60_000);
-  if (minutes === 0) return 'now';
-  const total = Math.abs(minutes);
-  const hours = Math.floor(total / 60);
-  const rest = total % 60;
-  const span = hours === 0 ? `${rest} min` : rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
-  return minutes > 0 ? `in ${span}` : `${span} ago`;
-}
diff --git a/src/render/duration-words.test.ts b/src/render/duration-words.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..58ea79a0f5449d3287548ddba112394ebb9de9b9
--- /dev/null
+++ b/src/render/duration-words.test.ts
@@ -0,0 +1,65 @@
+import { describe, expect, it } from 'vitest';
+import { durationWords, relativeStamp } from './duration-words.js';
+
+const SECOND = 1_000;
+const MINUTE = 60 * SECOND;
+const HOUR = 60 * MINUTE;
+const DAY = 24 * HOUR;
+const NOW = Date.UTC(2026, 9, 28, 18);
+
+describe("a stamp of Discord's as its client words it (plan 8M-11A, S6)", () => {
+  const at = (ms: number) => relativeStamp(NOW + ms, NOW, 'en-US');
+
+  it('says a day from 22 hours, not "in 24 hours"', () => {
+    expect(at(DAY)).toBe('in a day');
+    expect(at(22 * HOUR)).toBe('in a day');
+    expect(at(21 * HOUR)).toBe('in 21 hours');
+    expect(at(-36 * HOUR)).toBe('2 days ago');
+  });
+
+  it('says an hour from 45 minutes, a minute from 45 seconds', () => {
+    expect(at(45 * MINUTE)).toBe('in an hour');
+    expect(at(44 * MINUTE)).toBe('in 44 minutes');
+    expect(at(90 * MINUTE)).toBe('in 2 hours');
+    expect(at(-45 * SECOND)).toBe('a minute ago');
+    expect(at(44 * SECOND)).toBe('in a few seconds');
+    expect(at(-10 * SECOND)).toBe('a few seconds ago');
+  });
+
+  // Review fix F3: the unit chosen by the rounded values, as moment.js (Discord's) chooses it.
+  it('chooses the unit by the rounded count, at the edges as Discord does', () => {
+    expect(at(44.6 * SECOND)).toBe('in a minute');
+    expect(at(44 * MINUTE + 40 * SECOND)).toBe('in an hour');
+    expect(at(21 * HOUR + 40 * MINUTE)).toBe('in a day');
+  });
+
+  it('rounds minutes to the nearest, as Discord does: 29 minutes where Discord says so', () => {
+    expect(at(29 * MINUTE + 20 * SECOND)).toBe('in 29 minutes');
+    expect(at(29 * MINUTE + 40 * SECOND)).toBe('in 30 minutes');
+  });
+
+  it("words it in the reader's language", () => {
+    expect(relativeStamp(NOW + 3 * HOUR, NOW, 'de-DE')).toBe('in 3 Stunden');
+  });
+});
+
+describe('a duration Pine composes (plan 8M-11A, S19, S28)', () => {
+  it('says exact hours and minutes, minutes as "min", never "m"', () => {
+    expect(durationWords(17 * MINUTE)).toBe('17 min');
+    expect(durationWords(65 * MINUTE)).toBe('1 h 05 min');
+    expect(durationWords(2 * HOUR)).toBe('2 h');
+  });
+
+  it('rounds to the nearest minute, as the post says it, and never to nothing', () => {
+    // The list's "29 min left" beside the post's "in 29 minutes".
+    expect(durationWords(29 * MINUTE + 20 * SECOND)).toBe('29 min');
+    expect(durationWords(29 * MINUTE + 40 * SECOND)).toBe('30 min');
+    expect(durationWords(20 * SECOND)).toBe('1 min');
+  });
+
+  it('has a compact form for a badge', () => {
+    expect(durationWords(65 * MINUTE, { compact: true })).toBe('1 h 05');
+    expect(durationWords(17 * MINUTE, { compact: true })).toBe('17 min');
+    expect(durationWords(2 * HOUR, { compact: true })).toBe('2 h');
+  });
+});
diff --git a/src/render/duration-words.ts b/src/render/duration-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2f77b76e3f819b5fff80fd0a5d090d066ec585f7
--- /dev/null
+++ b/src/render/duration-words.ts
@@ -0,0 +1,83 @@
+/**
+ * One wording of times on the live map (plan 8M-11A, S6, S19, S28), two kinds of them. Import-free,
+ * so that the web page bundles it; the web's words only: Discord's own sentences are its own.
+ *
+ * - `relativeStamp`: a stamp of Discord's (`<t:…:R>`) as Discord's client words it, where a post
+ *   drawn on the map shows one, or the bot's words on the map name one: Discord's thresholds (a
+ *   minute from 45 seconds, an hour from 45 minutes, a day from 22 hours), in the reader's
+ *   language (`Intl.RelativeTimeFormat`), "in a day" rather than "in 24 hours".
+ * - `durationWords`: a time left Pine composes (a marker's badge, the list, the stop popups, a
+ *   countdown): exact hours and minutes, "17 min", "1 h 05 min", the minutes rounded to the nearest
+ *   as Discord rounds them, so that the list's "29 min left" and the post's "in 29 minutes" agree.
+ *   Minutes are never "m", which is meters (`distanceWords`).
+ */
+
+const SECOND = 1_000;
+const MINUTE = 60 * SECOND;
+const HOUR = 60 * MINUTE;
+const DAY = 24 * HOUR;
+
+/**
+ * Discord's steps (moment.js's): the unit of a span and how many of it. Each count is the span
+ * rounded in that unit, and the unit is chosen by those rounded counts, as moment.js chooses it
+ * (review fix F3): 44.6 seconds rounds to 45 and is "a minute", 44 min 40 s "an hour".
+ */
+function step(ms: number): [Intl.RelativeTimeFormatUnit, number] {
+  const span = Math.abs(ms);
+  const seconds = Math.round(span / SECOND);
+  const minutes = Math.round(span / MINUTE);
+  const hours = Math.round(span / HOUR);
+  const days = Math.round(span / DAY);
+  if (seconds < 45) return ['second', seconds];
+  if (minutes < 45) return ['minute', Math.max(1, minutes)];
+  if (hours < 22) return ['hour', Math.max(1, hours)];
+  if (days < 26) return ['day', Math.max(1, days)];
+  const months = Math.max(1, Math.round(span / (30.4 * DAY)));
+  if (months < 11) return ['month', months];
+  return ['year', Math.max(1, Math.round(span / (365 * DAY)))];
+}
+
+/**
+ * How long until `at`, or since, as Discord's client says a relative stamp (`<t:…:R>`) to a reader
+ * of `locale` (the browser's own when left out): `in a day`, `in 29 minutes`, `2 hours ago`, `in a
+ * few seconds`. English says one of a unit as "a" or "an" and under 45 seconds "a few seconds", as
+ * Discord does; other languages as `Intl.RelativeTimeFormat` words them.
+ */
+export function relativeStamp(at: number, now: number, locale?: string): string {
+  const [unit, count] = step(at - now);
+  // Discord's past starts at the moment itself: "a few seconds ago".
+  const future = at > now;
+  const signed = future ? count : -count;
+  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
+  const english = format.resolvedOptions().locale.startsWith('en');
+  if (!english) return format.format(signed, unit);
+  const few = unit === 'second';
+  // The number's parts given Discord's words: "a few", "a", "an".
+  const parts = format.formatToParts(few ? (future ? 2 : -2) : signed, unit);
+  return parts
+    .map((part) => {
+      if (part.type !== 'integer') return part.value;
+      if (few) return 'a few';
+      if (count === 1) return unit === 'hour' ? 'an' : 'a';
+      return part.value;
+    })
+    .join('')
+    .replace(/\p{Zs}/gu, ' ');
+}
+
+/**
+ * A span of time Pine composes (a time left, a countdown): `17 min`, `1 h 05 min`, `2 h`, the
+ * minutes rounded to the nearest and never to nothing (a few seconds left is `1 min`); `compact`
+ * leaves "min" out after hours (`1 h 05`), for a marker's badge.
+ */
+export function durationWords(ms: number, options: { compact?: boolean } = {}): string {
+  const minutes = Math.max(1, Math.round(ms / MINUTE));
+  if (minutes < 60) return `${String(minutes)} min`;
+  const hours = Math.floor(minutes / 60);
+  const rest = minutes % 60;
+  if (rest === 0) return `${String(hours)} h`;
+  const padded = String(rest).padStart(2, '0');
+  return options.compact === true
+    ? `${String(hours)} h ${padded}`
+    : `${String(hours)} h ${padded} min`;
+}
diff --git a/src/text-durations.test.ts b/src/text-durations.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b19e6e00dfc5b0c74bfd386150c8d31a97451c86
--- /dev/null
+++ b/src/text-durations.test.ts
@@ -0,0 +1,115 @@
+import { readdirSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import ts from 'typescript';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * Every time left or countdown the live map says goes through `durationWords`, and every stamp of
+ * Discord's through `relativeStamp` (`src/render/duration-words.ts`, plan 8M-11A, S19, S28): no
+ * minutes or hours are worded by hand in the string and template literals of the web pages
+ * (`src/web/client`), and minutes are never "m", which is meters. As `text-distances.test.ts`
+ * does for distances. Comments and identifiers are no texts.
+ */
+
+const SRC = import.meta.dirname;
+const SPEAKING = ['web/client'];
+
+/**
+ * Minutes or hours in words: "min" or "mins" (not "min-width"), an "m" or "h" right after a
+ * number or a substitution (`12m`, `${minutes}m`, `1h 05m`), and written out after a number (`13
+ * minutes`, `2 hours`, `1 hr`: review fix F6).
+ */
+const UNIT = /\bmins?\b(?!-)|^\s*[hm]\b|\d\s?[hm]\b|\d\s*(?:minutes?|hours?|hrs?)\b/u;
+
+/**
+ * Minutes or hours written out right after a substitution (`${n} minutes left`, review fix F6):
+ * read of the parts of a template after its first.
+ */
+const AFTER_SUBSTITUTION = /^\s*(?:minutes?|hours?)\b/u;
+
+/** An SVG drawing's path data (`M8 19h2l-1.5 3h-2z`), whose letters are commands, not units. */
+const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa][\d\s.,MmZzLlHhVvCcSsQqTtAa-]*$/u;
+
+/** Texts that are no time said to anybody, by file (from `src/`) and exact text. */
+const ALLOWED: Record<string, { texts: string[]; why: string }> = {
+  'web/client/editor-view.ts': { texts: [' m²'], why: "a region's area in square meters" },
+};
+
+const sources = SPEAKING.flatMap((folder) =>
+  readdirSync(path.join(SRC, folder), { recursive: true, withFileTypes: true })
+    .filter((entry) => entry.isFile())
+    .map((entry) =>
+      path.relative(SRC, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'),
+    )
+    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts')),
+);
+
+/** The texts of a file's string and template literals, with lines; module paths aside. */
+function texts(file: string): { line: number; text: string; after: boolean }[] {
+  const source = ts.createSourceFile(
+    file,
+    readFileSync(path.join(SRC, file), 'utf8'),
+    ts.ScriptTarget.Latest,
+    true,
+  );
+  const found: { line: number; text: string; after: boolean }[] = [];
+  const visit = (node: ts.Node): void => {
+    if (
+      ts.isStringLiteral(node) ||
+      ts.isNoSubstitutionTemplateLiteral(node) ||
+      ts.isTemplateHead(node) ||
+      ts.isTemplateMiddle(node) ||
+      ts.isTemplateTail(node)
+    ) {
+      const { parent } = node;
+      const modulePath =
+        (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) &&
+        parent.moduleSpecifier === node;
+      if (!modulePath && !ts.isLiteralTypeNode(parent)) {
+        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
+        found.push({
+          line: line + 1,
+          text: node.text,
+          after: ts.isTemplateMiddle(node) || ts.isTemplateTail(node),
+        });
+      }
+    }
+    ts.forEachChild(node, visit);
+  };
+  visit(source);
+  return found;
+}
+
+describe('times in what the map says (plan 8M-11A)', () => {
+  it('finds minutes and hours worded by hand, and nothing else', () => {
+    for (const text of ['in 13 min', ' min', 'm', 'h ', '30m left', '1h 05m']) {
+      expect(UNIT.test(text), text).toBe(true);
+    }
+    // Review fix F6: written out too, after a number or after a substitution.
+    for (const text of ['in 13 minutes', 'in 2 hours', '1 hr', '3hrs']) {
+      expect(UNIT.test(text), text).toBe(true);
+    }
+    for (const text of [' minutes left', ' hours', ' hour ago']) {
+      expect(AFTER_SUBSTITUTION.test(text), text).toBe(true);
+    }
+    expect(AFTER_SUBSTITUTION.test(' going')).toBe(false);
+    for (const text of ['(min-width: 1024px)', 'minute', 'Make the meetup', '2 more', 'h3']) {
+      expect(UNIT.test(text), text).toBe(false);
+    }
+  });
+
+  it('words no minutes or hours by hand outside duration-words', () => {
+    expect(sources.length).toBeGreaterThan(50);
+    const found = sources.flatMap((file) =>
+      texts(file)
+        .filter(
+          ({ text, after }) =>
+            (UNIT.test(text) || (after && AFTER_SUBSTITUTION.test(text))) &&
+            !PATH_DATA.test(text) &&
+            !(ALLOWED[file]?.texts.includes(text) ?? false),
+        )
+        .map(({ line, text }) => `${file}:${line} ${text}`),
+    );
+    expect(found).toEqual([]);
+  });
+});
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index cdecd384d31efd1521623da082285d8594298fe6..d6db11f12b1c3f92c35ad94fe7b508622ea30610 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -112,7 +112,7 @@ function tagged(node: PageNode, tag: string): PageNode[] {
 describe('countdown and clockTime', () => {
   it('count down in minutes, then hours and minutes', () => {
     expect(countdown(NOW + 12 * MINUTE + 30_000, NOW)).toBe('in 13 min');
-    expect(countdown(NOW + 65 * MINUTE, NOW)).toBe('in 1 h 5 min');
+    expect(countdown(NOW + 65 * MINUTE, NOW)).toBe('in 1 h 05 min');
     expect(countdown(NOW + 120 * MINUTE, NOW)).toBe('in 2 h');
     expect(countdown(NOW - MINUTE, NOW)).toBe('now');
   });
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index a25c79571e1cd119a2176098a0da24a82a348f71..4e5c47fec13f6d8bcb5a53a7187d7cbe2978e028 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -1,3 +1,4 @@
+import { durationWords } from '../../render/duration-words.js';
 import type {
   MapAttendance,
   MapMax,
@@ -33,16 +34,12 @@ export interface ShowContext {
   gym(id: number | null): MapGym | undefined;
 }
 
-const MINUTE = 60_000;
-
-/** How long until a moment: `in 13 min`, `in 1 h 5 min`, `now` once it has come. */
+/**
+ * How long until a moment: `in 13 min`, `in 1 h 05 min` (`durationWords`, plan 8M-11A), `now` once
+ * it has come.
+ */
 export function countdown(until: number, now: number): string {
-  const minutes = Math.ceil((until - now) / MINUTE);
-  if (minutes <= 0) return 'now';
-  if (minutes < 60) return `in ${minutes} min`;
-  const hours = Math.floor(minutes / 60);
-  const rest = minutes % 60;
-  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
+  return until <= now ? 'now' : `in ${durationWords(until - now)}`;
 }
 
 /**
diff --git a/src/web/client/post-time.test.ts b/src/web/client/post-time.test.ts
index a4481984da4c3f9e197b2ca21a901f70d99922c3..44e5351883669cbc9e4c142a66534c124512ffe4 100644
--- a/src/web/client/post-time.test.ts
+++ b/src/web/client/post-time.test.ts
@@ -35,7 +35,15 @@ describe('postTime: a post’s time as Discord shows it, in the reader’s zone
     expect(relative(AT - 25 * MINUTE)).toBe('in 25 minutes');
     expect(relative(AT - 90 * MINUTE)).toBe('in 2 hours');
     expect(relative(AT + 3 * MINUTE)).toBe('3 minutes ago');
-    expect(relative(AT - 20_000)).toBe('in 20 seconds');
+    expect(relative(AT - 20_000)).toBe('in a few seconds');
     expect(relative(AT - 3 * 24 * 60 * MINUTE)).toBe('in 3 days');
   });
+
+  // Plan 8M-11A (S6): as Discord's client words its stamps, "in a day" from 22 hours.
+  it('says a day where Discord says it, not "in 24 hours"', () => {
+    const relative = (now: number) => postTime(AT, 'R', now, NEW_YORK);
+    expect(relative(AT - 24 * 60 * MINUTE)).toBe('in a day');
+    expect(relative(AT - 22 * 60 * MINUTE)).toBe('in a day');
+    expect(relative(AT - 50 * MINUTE)).toBe('in an hour');
+  });
 });
diff --git a/src/web/client/post-time.ts b/src/web/client/post-time.ts
index 46ca2afc2f6820c039ae13df318aa292808f28ad..63fe37d127b5ababb2db3f9438ed089db82ff7fb 100644
--- a/src/web/client/post-time.ts
+++ b/src/web/client/post-time.ts
@@ -1,3 +1,4 @@
+import { relativeStamp } from '../../render/duration-words.js';
 import type { PostTimeStyle } from '../../domain/web/party-data.js';
 
 /**
@@ -21,21 +22,6 @@ const STYLES: Readonly<Record<Exclude<PostTimeStyle, 'R'>, Intl.DateTimeFormatOp
   F: { dateStyle: 'full', timeStyle: 'short' },
 };
 
-/** How long until or since, in the largest unit that is at least one, as Discord words it. */
-function relative(at: number, now: number, shown: TimeShown): string {
-  const seconds = Math.round((at - now) / 1000);
-  const words = new Intl.RelativeTimeFormat(shown.locale, { numeric: 'always' });
-  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
-    ['day', 86_400],
-    ['hour', 3_600],
-    ['minute', 60],
-  ];
-  for (const [unit, size] of steps) {
-    if (Math.abs(seconds) >= size) return words.format(Math.round(seconds / size), unit);
-  }
-  return words.format(seconds, 'second');
-}
-
 /** The reader's own zone: the page shows every time in it, as Discord does (plan 8M-8A). */
 export function readerZone(): string {
   return Intl.DateTimeFormat().resolvedOptions().timeZone;
@@ -77,7 +63,8 @@ export function postTime(
   now: number,
   shown: TimeShown = {},
 ): string {
-  if (style === 'R') return relative(at, now, shown);
+  // As Discord's client words its stamps (plan 8M-11A, S6): "in a day", not "in 24 hours".
+  if (style === 'R') return relativeStamp(at, now, shown.locale);
   return plainSpaces(
     new Intl.DateTimeFormat(shown.locale, { ...STYLES[style], timeZone: shown.timeZone }).format(
       at,
diff --git a/src/web/client/raid-marker.test.ts b/src/web/client/raid-marker.test.ts
index 3e1bd97a9f9af4a80591844377429c6f4d53631d..884e0389a8efc0c6818f416ac8da78ac4499a8a3 100644
--- a/src/web/client/raid-marker.test.ts
+++ b/src/web/client/raid-marker.test.ts
@@ -60,17 +60,17 @@ const texts = (node: PageNode): string[] => [
 
 describe("a raid's marker (plan 8M-7)", () => {
   it('says the time left while it runs, and when it hatches before', () => {
-    expect(raidBadge(raid(), NOW, ZONE)).toBe('12m');
-    expect(raidBadge(raid({ endTime: NOW + 65 * MINUTE }), NOW, ZONE)).toBe('1h 05m');
-    expect(raidBadge(raid({ endTime: NOW + 30_000 }), NOW, ZONE)).toBe('1m');
+    expect(raidBadge(raid(), NOW, ZONE)).toBe('12 min');
+    expect(raidBadge(raid({ endTime: NOW + 65 * MINUTE }), NOW, ZONE)).toBe('1 h 05');
+    expect(raidBadge(raid({ endTime: NOW + 30_000 }), NOW, ZONE)).toBe('1 min');
     expect(raidBadge(raid({ endTime: NOW - MINUTE }), NOW, ZONE)).toBe('Ended');
     const egg = raid({ stage: 'egg', hatchTime: NOW + 40 * MINUTE, endTime: NOW + 85 * MINUTE });
     expect(raidBadge(egg, NOW, ZONE)).toBe('hatches 2:40');
     // Hatched by the clock since the list was made: the time left.
-    expect(raidBadge(egg, NOW + 41 * MINUTE, ZONE)).toBe('44m');
+    expect(raidBadge(egg, NOW + 41 * MINUTE, ZONE)).toBe('44 min');
     expect(raidBadge(raid({ stage: 'egg', hatchTime: null }), NOW, ZONE)).toBe('Egg');
     expect(raidBadge(raid({ endTime: null }), NOW, ZONE)).toBe('Hatched');
-    expect(badgeWords('end', NOW + 3 * MINUTE, NOW, ZONE)).toBe('3m');
+    expect(badgeWords('end', NOW + 3 * MINUTE, NOW, ZONE)).toBe('3 min');
     expect(badgeWords('hatch', NOW + 3 * MINUTE, NOW, ZONE)).toBe('hatches 2:03');
     // Not today: the day said, as the posts' times (`clockTime`), AM or PM kept.
     expect(badgeWords('hatch', NOW + 24 * 60 * MINUTE, NOW, ZONE)).toBe(
@@ -146,7 +146,7 @@ describe("a raid's marker (plan 8M-7)", () => {
   it('draws the picture in its ring, the badge under it and the green count', () => {
     const node = raidMarkerNode(raid(), NOW, ZONE);
     expect(node.className).toBe('raid-marker tier-5');
-    expect(texts(node)).toEqual(['12m', '4']);
+    expect(texts(node)).toEqual(['12 min', '4']);
     expect(node.attributes).toEqual({
       'data-stage': 'hatched',
       'data-hatch': String(NOW - 20 * MINUTE),
@@ -167,9 +167,9 @@ describe("a raid's marker (plan 8M-7)", () => {
         NOW + 2 * MINUTE,
         ZONE,
       ),
-    ).toEqual({ badge: '44m', dimmed: false });
+    ).toEqual({ badge: '44 min', dimmed: false });
     expect(markerNow({ stage: 'hatched', end: String(NOW + 4 * MINUTE) }, NOW, ZONE)).toEqual({
-      badge: '4m',
+      badge: '4 min',
       dimmed: true,
     });
     expect(badgeFor('egg', null, null, NOW, ZONE)).toBe('Egg');
@@ -184,7 +184,7 @@ describe("a raid's marker (plan 8M-7)", () => {
       ZONE,
     );
     expect(last.className).toBe('raid-marker tier-5 dim');
-    expect(texts(last)).toEqual(['2m']);
+    expect(texts(last)).toEqual(['2 min']);
     expect(JSON.stringify(last)).not.toContain('"img"');
   });
 });
@@ -211,7 +211,7 @@ describe("a max battle's marker (plan 8M-9A)", () => {
   it('rings the boss in the color of Dynamax or Gigantamax, with its time left and count', () => {
     const node = raidMarkerNode(max(), NOW, ZONE);
     expect(node.className).toBe('raid-marker tier-dynamax');
-    expect(texts(node)).toEqual(['40m', '3']);
+    expect(texts(node)).toEqual(['40 min', '3']);
     // No egg and no hatch: what the page keeps current is its end alone.
     expect(node.attributes).toEqual({
       'data-stage': 'hatched',
@@ -227,7 +227,7 @@ describe("a max battle's marker (plan 8M-9A)", () => {
   it('is dimmed in its last five minutes, by the rule raids are', () => {
     const soon = max({ endTime: NOW + 4 * MINUTE });
     expect(raidMarkerNode(soon, NOW, ZONE).className).toBe('raid-marker tier-dynamax dim');
-    expect(raidBadge(soon, NOW, ZONE)).toBe('4m');
+    expect(raidBadge(soon, NOW, ZONE)).toBe('4 min');
     expect(markerFacts(soon)).toEqual({
       picture: soon.picture,
       ring: 'dynamax',
diff --git a/src/web/client/raid-marker.ts b/src/web/client/raid-marker.ts
index febd3a7488290af89631b74f82944e4a6b2e8250..a415d80b186998685492329ef7b642fd8cf1bde1 100644
--- a/src/web/client/raid-marker.ts
+++ b/src/web/client/raid-marker.ts
@@ -1,3 +1,4 @@
+import { durationWords } from '../../render/duration-words.js';
 import { stageAt } from '../../domain/party/raid-stage.js';
 import { endsSoon } from '../../domain/time/ending-soon.js';
 import { clockTime } from '../../domain/web/clock.js';
@@ -20,8 +21,6 @@ import type { PageNode } from './popup.js';
  * raids through it), "nearly over" is `endsSoon` (`/max` asks by it). Only the words are the page's.
  */
 
-const MINUTE = 60_000;
-
 /** The ring of a max battle (plan 8M-9A, A1): Dynamax's or Gigantamax's color. */
 export type MaxRing = 'dynamax' | 'gigantamax';
 
@@ -152,17 +151,26 @@ function shortClock(at: number, zone: string): string {
   return `${part('hour')}:${part('minute')}`;
 }
 
-/** A badge's words: the time left (`12m`, `1h 05m`, `Ended`), or `hatches 2:40`. */
+/**
+ * A badge's words: the time left (`12 min`, `1 h 05`: `durationWords`' compact form, plan 8M-11A),
+ * `Ended`, or `hatches 2:40`.
+ */
 export function badgeWords(kind: 'end' | 'hatch', at: number, now: number, zone: string): string {
   if (kind === 'hatch') {
     // The posts' time (`clockTime`: the day when it is not today); AM or PM left out today only.
     const clock = clockTime(at, zone, now);
     return `hatches ${clock === clockTime(at, zone, at) ? shortClock(at, zone) : clock}`;
   }
-  const minutes = Math.ceil((at - now) / MINUTE);
-  if (minutes <= 0) return 'Ended';
-  if (minutes < 60) return `${minutes}m`;
-  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
+  if (at <= now) return 'Ended';
+  return durationWords(at - now, { compact: true });
+}
+
+/**
+ * A time left in full, for a line of the list or a popup (plan 8M-11A, S19): `29 min left`,
+ * `1 h 05 min left` (`durationWords`); undefined once it is over.
+ */
+export function timeLeft(end: number, now: number): string | undefined {
+  return end <= now ? undefined : `${durationWords(end - now)} left`;
 }
 
 /**
diff --git a/src/web/client/stop-popup.test.ts b/src/web/client/stop-popup.test.ts
index a5890405bb652d49a4461bd82e9a96b87a39c60f..b6e1bbf6c1c32f9cae0f94c7013229a962080927 100644
--- a/src/web/client/stop-popup.test.ts
+++ b/src/web/client/stop-popup.test.ts
@@ -131,7 +131,7 @@ describe("a stop's popup (plan 8M-9B)", () => {
       ctx,
     );
     expect(texts(node)).toEqual(
-      expect.arrayContaining(['Water-type grunt · Magikarp, Feebas', '25m left', 'Arlo']),
+      expect.arrayContaining(['Water-type grunt · Magikarp, Feebas', '25 min left', 'Arlo']),
     );
     const left = found(node, (one) => one.className === 'left')[0];
     expect(left?.attributes?.['data-left']).toBe(String(caseGrunt(1).endsAt));
diff --git a/src/web/client/stop-popup.ts b/src/web/client/stop-popup.ts
index f4d648967220250e2fd8836e434890e2deff4062..ab805f9845ba85d8e1b57ca173b475540950e8f7 100644
--- a/src/web/client/stop-popup.ts
+++ b/src/web/client/stop-popup.ts
@@ -7,7 +7,7 @@ import type {
 import type { DistanceUnits, Place } from './distance.js';
 import { addressLine, type PageNode } from './popup.js';
 import { mapLine } from './post-draw.js';
-import { badgeWords } from './raid-marker.js';
+import { timeLeft } from './raid-marker.js';
 import { iconNode } from './report-menu.js';
 import { REPORT_ICONS } from './report-icons.js';
 import type { StopReport, StopReports } from './stop-reports.js';
@@ -165,11 +165,10 @@ function researchPart(report: MapResearch, ctx: StopPopupContext): PageNode {
 
 /** A grunt's minutes left, kept current by the page between two lists (`data-left`). */
 function minutesLeft(report: MapGrunt, now: number): PageNode {
-  const left = badgeWords('end', report.endsAt, now, 'UTC');
   return {
     tag: 'span',
     className: 'left',
-    text: left === 'Ended' ? ENDED : `${left} left`,
+    text: timeLeft(report.endsAt, now) ?? ENDED,
     attributes: { 'data-left': String(report.endsAt) },
   };
 }
diff --git a/src/web/client/stop-report-ui.ts b/src/web/client/stop-report-ui.ts
index e06dcae78b2657daddba5e61ee1f0706cec2c957..e3dba3b9d8e963430120db05b8904bbb4f1de144 100644
--- a/src/web/client/stop-report-ui.ts
+++ b/src/web/client/stop-report-ui.ts
@@ -2,7 +2,7 @@ import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode } from './popup.js';
 import { formPlace, type FormHold } from './raid-forms.js';
-import { badgeWords } from './raid-marker.js';
+import { timeLeft } from './raid-marker.js';
 import { sendStop, takeBackBody, takeBackPath } from './stop-forms.js';
 import { ENDED, takeBackQuestion } from './stop-popup.js';
 import type { StopReport } from './stop-reports.js';
@@ -115,8 +115,7 @@ export function stopUi(deps: StopUiDeps) {
      */
     tick(root: ParentNode, now: number): void {
       for (const left of root.querySelectorAll<HTMLElement>('[data-left]')) {
-        const words = badgeWords('end', Number(left.dataset.left), now, 'UTC');
-        left.textContent = words === 'Ended' ? ENDED : `${words} left`;
+        left.textContent = timeLeft(Number(left.dataset.left), now) ?? ENDED;
       }
       for (const section of root.querySelectorAll<HTMLElement>('.stop-report[data-ends]')) {
         if (Number(section.dataset.ends) > now || section.classList.contains('ended')) continue;
diff --git a/src/web/client/stop-reports.test.ts b/src/web/client/stop-reports.test.ts
index 60b602f5dd7d5d2c3def28cd50185370849beba6..4f6c7e38f3dd6df6200b739989ee1c60c73e637c 100644
--- a/src/web/client/stop-reports.test.ts
+++ b/src/web/client/stop-reports.test.ts
@@ -108,7 +108,7 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
     const facts = stopMarkerFacts(both!, NOW);
     expect(facts.ring).toBe('both');
     expect(facts.end).toBe(NOW + 25 * MINUTE);
-    expect(facts.badge).toBe('25m');
+    expect(facts.badge).toBe('25 min');
     expect(facts.dimmed).toBe(false);
     const [soon] = reportsAtStops(
       view({ grunts: [grunt(1, { endsAt: NOW + 4 * MINUTE })] }),
@@ -116,7 +116,7 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
     );
     expect(stopMarkerFacts(soon!, NOW)).toMatchObject({
       ring: 'rocket',
-      badge: '4m',
+      badge: '4 min',
       dimmed: true,
     });
     const [task] = reportsAtStops(view({ research: [research(1)] }), everything);
@@ -152,7 +152,7 @@ describe('the reports at stops on the map (plan 8M-9B)', () => {
       key: 'stop:stop-1',
       gymId: null,
       name: 'Yellow Mural 1',
-      time: 'Field research · Water-type grunt 25m',
+      time: 'Field research · Water-type grunt 25 min',
       picture: `${ICONS}pm147.icon.png`,
     });
   });
diff --git a/src/web/client/stop-reports.ts b/src/web/client/stop-reports.ts
index a85995205db9f536b4ddc24d10592f1eee4adb9f..e0c25a4559ad5a074e011a5f3b3a3181ce670b3c 100644
--- a/src/web/client/stop-reports.ts
+++ b/src/web/client/stop-reports.ts
@@ -169,7 +169,7 @@ export function stopMarkerNode(at: StopReports, now: number, size: MarkerSize):
   };
 }
 
-/** A grunt's or hideout's words in the list of things at one place: `Water-type grunt 25m`. */
+/** A grunt's or hideout's words in the list of things at one place: `Water-type grunt 25 min`. */
 function rocketWords(at: StopReports, now: number): string[] {
   return [
     ...at.grunts.map((grunt) => `${grunt.name} ${badgeWords('end', grunt.endsAt, now, 'UTC')}`),
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 218e6dba125d6cd4719852b8fd3ff5a15c8fbb37..3ea5d98e8a194a9312e34e25e00912d3ba90334e 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -280,7 +280,7 @@ describe('the list of what is on (plan 8M-7)', () => {
       name: 'Level 5 raid against Mewtwo',
       place: 'Carnegie Library',
       distance: '0.3 mi',
-      time: '30m left',
+      time: '30 min left',
       going: '4 going',
       dimmed: false,
     });
@@ -291,7 +291,7 @@ describe('the list of what is on (plan 8M-7)', () => {
       time: 'hatches 2:40 PM',
       going: '',
     });
-    expect(words('raid:ending')).toMatchObject({ time: '3m left', dimmed: true });
+    expect(words('raid:ending')).toMatchObject({ time: '3 min left', dimmed: true });
     expect(words('train:t1')).toMatchObject({
       name: 'Oakland loop',
       place: 'At stop 1 of 2: Hillman Library',
@@ -346,7 +346,7 @@ describe('the list of what is on (plan 8M-7)', () => {
       name: 'Gigantamax Machamp',
       place: 'Unlisted power spot',
       distance: '0.3 mi',
-      time: '4m left',
+      time: '4 min left',
       going: '3 going',
       dimmed: true,
     });
@@ -498,8 +498,8 @@ describe('the reports at stops in the list (plan 8M-9B)', () => {
       going: '',
       dimmed: false,
     });
-    expect(words('grunt:101')).toMatchObject({ name: 'Water-type grunt', time: '25m left' });
-    expect(words('grunt:103')).toMatchObject({ time: '4m left', dimmed: true });
+    expect(words('grunt:101')).toMatchObject({ name: 'Water-type grunt', time: '25 min left' });
+    expect(words('grunt:103')).toMatchObject({ time: '4 min left', dimmed: true });
     expect(words('hideout:204')).toMatchObject({ name: 'Arlo', time: 'until 11:00 PM' });
     // Its picture: the research's, a grunt's, a hideout's.
     expect(stopReportLines(at).find((one) => one.key === 'hideout:204')?.picture).toBe(
diff --git a/src/web/client/what-is-on.ts b/src/web/client/what-is-on.ts
index ee6190079cd3bc82eb33995263657c41c00222ce..6636c80ebf10999fbeaa22bdd32ba04996aaec4e 100644
--- a/src/web/client/what-is-on.ts
+++ b/src/web/client/what-is-on.ts
@@ -7,7 +7,7 @@ import { stopPopupKey, type StopLayer, type StopReport, type StopReports } from
 import { distanceWords, metersBetween, type DistanceUnits } from './distance.js';
 import { stopLine, trainPlaces } from './parties.js';
 import type { MapGym } from './popup.js';
-import { badgeWords, isDimmed } from './raid-marker.js';
+import { isDimmed, timeLeft } from './raid-marker.js';
 import { startWords } from './shared-place.js';
 import type { LatLon, ViewStorage } from './view.js';
 
@@ -312,8 +312,8 @@ export function lineWords(
     if (!hatched) time = hatch === null ? 'Egg' : `hatches ${clockTime(hatch, zone, now)}`;
     else if (end === null) time = 'Hatched';
     else {
-      const left = badgeWords('end', end, now, zone);
-      time = left === 'Ended' ? left : `${left} left`;
+      // The time left in full (plan 8M-11A, S19): "29 min left" where the post says "in 29 minutes".
+      time = timeLeft(end, now) ?? 'Ended';
     }
   }
   return {
diff --git a/src/web/meetup-change.test.ts b/src/web/meetup-change.test.ts
index 4d32d5f234a44460e3d09d8685896985ca41ded5..ce1acaa45c8f1bf9b8208f20d0d81f3d0b6bafef 100644
--- a/src/web/meetup-change.test.ts
+++ b/src/web/meetup-change.test.ts
@@ -136,7 +136,7 @@ describe('changing a meetup on the map', () => {
     const answer = await map.change('start', { drawn: START, time: '7pm' });
     expect(answer.status).toBe(200);
     expect(answer.json.text).toBe(
-      'This meetup starts at 7:00 PM (in 5 h). I am telling the others.',
+      'This meetup starts at 7:00 PM (in 5 hours). I am telling the others.',
     );
     expect(map.made.current().timed.startTime).toBe(at('2026-10-13T19:00'));
     await map.made.timed.flush();
diff --git a/src/web/page-words.test.ts b/src/web/page-words.test.ts
index 0134aab03923fab792e31da205ddc4d8171ac819..1fa1bdec1e94ec96a469949022b9ebefa1f4ae48 100644
--- a/src/web/page-words.test.ts
+++ b/src/web/page-words.test.ts
@@ -25,11 +25,11 @@ describe('the words of a command as the map shows them (pageWords)', () => {
     const at = NOW + 4 * 60 * MINUTE + 30 * MINUTE;
     expect(
       pageWords(`This meetup starts at ${stamp(at, 't')} (${stamp(at, 'R')}).`, ZONE, NOW),
-    ).toBe('This meetup starts at 6:30 PM (in 4 h 30 min).');
-    expect(pageWords(stamp(NOW + 5 * MINUTE, 'R'), ZONE, NOW)).toBe('in 5 min');
-    expect(pageWords(stamp(NOW + 2 * 60 * MINUTE, 'R'), ZONE, NOW)).toBe('in 2 h');
-    expect(pageWords(stamp(NOW - 90 * MINUTE, 'R'), ZONE, NOW)).toBe('1 h 30 min ago');
-    expect(pageWords(stamp(NOW, 'R'), ZONE, NOW)).toBe('now');
+    ).toBe('This meetup starts at 6:30 PM (in 5 hours).');
+    expect(pageWords(stamp(NOW + 5 * MINUTE, 'R'), ZONE, NOW)).toBe('in 5 minutes');
+    expect(pageWords(stamp(NOW + 2 * 60 * MINUTE, 'R'), ZONE, NOW)).toBe('in 2 hours');
+    expect(pageWords(stamp(NOW - 90 * MINUTE, 'R'), ZONE, NOW)).toBe('2 hours ago');
+    expect(pageWords(stamp(NOW, 'R'), ZONE, NOW)).toBe('a few seconds ago');
   });
 
   it("takes out the bot's own markdown and undoes the escapes of what members and feeds wrote", () => {
diff --git a/src/web/page-words.ts b/src/web/page-words.ts
index b36fd7151e708b3d230d64aa399cf58332157ec2..5b9663a5d5ed6a885ba6a7b5d0bfed977791fc97 100644
--- a/src/web/page-words.ts
+++ b/src/web/page-words.ts
@@ -1,4 +1,5 @@
-import { clockTime, relativeTime } from '../domain/web/clock.js';
+import { clockTime } from '../domain/web/clock.js';
+import { relativeStamp } from '../render/duration-words.js';
 import { unplain } from '../render/text.js';
 
 /** A timestamp of Discord's (`<t:1760000000:t>`), which a page cannot show. */
@@ -16,7 +17,8 @@ const ESCAPE_LINK_OR_MARKDOWN = /\\.|\[((?:\\.|[^\]\\])*)\]\((?:<[^>\s]*>|[^)\s]
 /**
  * The words of a command as the live map shows them, as plain text (plans 8M-4, 8M-5): Discord's
  * timestamps as clock times in the posts' zone (`clockTime`, as the page writes times) and a
- * relative one as how long until then or since (`relativeTime`, plan 8M-5M), the
+ * relative one as how long until then or since as Discord's client says it (`relativeStamp`, plan
+ * 8M-11A: "in 5 hours", "in a day"; in English, the bot's language), the
  * bot's masked links as their text (the page links nothing of a command's words), the bot's own
  * markdown taken out (escapes kept as they are), then the escapes of what members and feeds
  * wrote undone (`unplain`). Pure.
@@ -26,7 +28,7 @@ export function pageWords(text: string, zone: string, now: number): string {
     text
       .replace(TIMESTAMP, (_stamp, seconds: string, style: string | undefined) =>
         style === 'R'
-          ? relativeTime(Number(seconds) * 1000, now)
+          ? relativeStamp(Number(seconds) * 1000, now, 'en-US')
           : clockTime(Number(seconds) * 1000, zone, now),
       )
       .replace(ESCAPE_LINK_OR_MARKDOWN, (match, linked: string | undefined) =>
diff --git a/src/web/party-meet.test.ts b/src/web/party-meet.test.ts
index e062f6784bf6f6b0243af4a6c8994cbe38772e21..718cf4ef8f331832595823da5da76ff4d74783d2 100644
--- a/src/web/party-meet.test.ts
+++ b/src/web/party-meet.test.ts
@@ -138,7 +138,7 @@ describe('Meet… on the map (plan 8M-8B)', () => {
       // The reporter is in the group too.
       json: {
         ok: true,
-        text: 'The meeting time of your group is 2:30 PM (in 30 min). I have told the others.',
+        text: 'The meeting time of your group is 2:30 PM (in 30 minutes). I have told the others.',
       },
     });
     expect(map.made.store.get(map.id)?.groups[0]?.startTime).toBe(HATCH);
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 1324e1b4403a571c3ae37106b0ccde457d0f5700..2880d70c085f33060245eb6f28fbff97d1b34c9b 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -646,7 +646,7 @@ describe('reports at stops from the map', () => {
       const answer = await made.post('/rocket', { who: 'grunt:water', stop: wayspotId(1) });
       expect(answer.status).toBe(200);
       expect(answer.json.text).toMatch(
-        /^Water-type grunt at Yellow Mural · catch one of Mudkip, .*\nPosted in #west; it goes away in 30 min\.$/,
+        /^Water-type grunt at Yellow Mural · catch one of Mudkip, .*\nPosted in #west; it goes away in 30 minutes\.$/,
       );
       const [message] = made.made.gateway.messagesIn(WEST_CHANNEL);
       expect(answer.json.grunt).toMatchObject({
@@ -674,7 +674,7 @@ describe('reports at stops from the map', () => {
       expect(again.json.ok).toBe(false);
       expect(again.json.reason).toBe('already');
       expect(again.json.text).toMatch(
-        /^Already reported: a Water-type grunt at Yellow Mural, by Bob now; it goes away in 30 min\.$/,
+        /^Already reported: a Water-type grunt at Yellow Mural, by Bob a few seconds ago; it goes away in 30 minutes\.$/,
       );
       expect(again.json.grunt?.link).toMatch(/^https:\/\/discord\.com\/channels\//);
       expect(made.made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
````

### Task 5: 8M-11A S18, S26: research forms leave out held stops, Change task

Prototype commit: `d86cfc9838f668f2913aeb92c78aca7a6684eeb6`

S18: whether a stop's standing research report holds a report's subject
is one pure rule, holdsSubject (src/domain/research/reports.ts): the same
version, and for "one of" any version of its task. Discord's "Same task at
more stops..." (moreStops) and the map both use it: the map's Add stops...
and "Same task at more stops..." leave out the stops that hold the form's
task (formSubject, heldStops) from the research list the page has.

S26: where the research form shows its task alone (the contradiction
question, "Same task at more stops..."), "Change task" brings the task list
back with the task kept as the selection (taskChanged); from "Same task at
more stops..." it becomes a new report of the list with its report's
version picked.

**Files:**

```
 src/commands/research/research.ts     |   9 ++++-----
 src/domain/research/reports.test.ts   |  21 ++++++++++++++++++++-
 src/domain/research/reports.ts        |  16 ++++++++++++++++
 src/web/client/party-layer.ts         |   2 ++
 src/web/client/research-forms.test.ts | 103 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/research-forms.ts      |  84 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/research-ui.ts         |  26 ++++++++++++++++++++++++--
 7 files changed, 252 insertions(+), 9 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/research/reports.test.ts src/web/client/research-forms.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d86cfc9838f668f2913aeb92c78aca7a6684eeb6 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A S18, S26: research forms leave out held stops, Change task`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 07744ef55b1f99494af99ac005a2c5d9c44c937c..e8850e78390cec140c3b2a6f9edc1e56b4207c19 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -26,7 +26,7 @@ import { answer, answerApart, showInPlace, v2Answer } from '../../discord/late-r
 import { memberInfo } from '../../discord/member-info.js';
 import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
 import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
-import { isOneOf, taskOfSubject } from '../../domain/research/reports.js';
+import { holdsSubject, isOneOf } from '../../domain/research/reports.js';
 import { rewardsInShort, type TaskReward } from '../../domain/research/task.js';
 import {
   isResearchReport,
@@ -119,16 +119,15 @@ async function moreStops(
       .filter((region) => row !== undefined && region.guildId === row)
       .map((region) => region.channelId),
   );
-  const task = taskOfSubject(subject.subjectKey);
-  const oneOf = isOneOf(subject);
+  // The stops that hold the subject already, by the one rule the map's offers use too.
+  const held = { subjectKey: subject.subjectKey, oneOf: isOneOf(subject) };
   const reported = new Set(
     (await ctx.stopReports.standing(guildIdOf(interaction)))
       .filter(
         (report) =>
           report.kind === 'research' &&
           report.periodKey === periodKey &&
-          (report.subjectKey === subject.subjectKey ||
-            (oneOf && taskOfSubject(report.subjectKey) === task)),
+          holdsSubject(report.subjectKey, held),
       )
       .map((report) => report.stop.key),
   );
diff --git a/src/domain/research/reports.test.ts b/src/domain/research/reports.test.ts
index 77a33dc76f81e66d42c380cba1e2eb77de0e9e24..0c3dcc582b3bee732db77975ffebbb41df90d254 100644
--- a/src/domain/research/reports.test.ts
+++ b/src/domain/research/reports.test.ts
@@ -1,5 +1,10 @@
 import { describe, expect, it } from 'vitest';
-import { decideResearch, researchSubjectOf, type StandingResearch } from './reports.js';
+import {
+  decideResearch,
+  holdsSubject,
+  researchSubjectOf,
+  type StandingResearch,
+} from './reports.js';
 
 const TASK = '0123456789abcdef';
 const OTHER = 'fedcba9876543210';
@@ -96,3 +101,17 @@ describe('what becomes of a research report at a stop (plan 8R-5)', () => {
     );
   });
 });
+
+describe('a stop that holds the task already (plan 8M-11A, S18)', () => {
+  it('holds a version where the same version stands', () => {
+    expect(holdsSubject(v(GIBLE), { subjectKey: v(GIBLE), oneOf: false })).toBe(true);
+    expect(holdsSubject(v(CANDY), { subjectKey: v(GIBLE), oneOf: false })).toBe(false);
+    expect(holdsSubject(TASK, { subjectKey: v(GIBLE), oneOf: false })).toBe(false);
+  });
+
+  it('holds a "one of" where any version of its task stands, by the task', () => {
+    expect(holdsSubject(v(GIBLE), { subjectKey: TASK, oneOf: true })).toBe(true);
+    expect(holdsSubject(TASK, { subjectKey: TASK, oneOf: true })).toBe(true);
+    expect(holdsSubject(v(GIBLE, OTHER), { subjectKey: TASK, oneOf: true })).toBe(false);
+  });
+});
diff --git a/src/domain/research/reports.ts b/src/domain/research/reports.ts
index 2cd969272d47b2e4ea8246da29a346dc7c84642c..79cbe20329b98fe4f931a4748be48fa4c93a750a 100644
--- a/src/domain/research/reports.ts
+++ b/src/domain/research/reports.ts
@@ -29,6 +29,22 @@ export function taskOfSubject(subjectKey: string): string {
   return researchSubjectOf(subjectKey)?.task ?? subjectKey;
 }
 
+/**
+ * Whether a stop whose standing research report is of `standing` (its `subjectKey`, in the period)
+ * holds the subject a report is of already (plan 8R-5, R8; plan 8M-11A, S18): the same version;
+ * for a "one of", any version of its task. "Same task at more stops…" on Discord and on the map,
+ * and the map's "Add stops…", leave such stops out: one rule.
+ */
+export function holdsSubject(
+  standing: string,
+  subject: { subjectKey: string; oneOf: boolean },
+): boolean {
+  return (
+    standing === subject.subjectKey ||
+    (subject.oneOf && taskOfSubject(standing) === taskOfSubject(subject.subjectKey))
+  );
+}
+
 /**
  * Whether a report is "one of" (R10), in words, narrowing and confirmations: its task's key
  * alone, with two or more rewards in its detail (a report of before plan 8R-5 has every reward of
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 7ff702107827a20fd89877e9fe9772963871160c..06ad6bb0e3c661f977f754c88d2cee3c95a2cbf2 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -609,6 +609,8 @@ export function showParties(
    * reports at once, then the first stop's popup (B15).
    */
   const researchForms = researchUi({
+    // The research reports the map has: a stop holding the form's task is not offered (S18).
+    research: () => stopReports.view?.research ?? [],
     guild,
     csrf: {
       get: () => csrf,
diff --git a/src/web/client/research-forms.test.ts b/src/web/client/research-forms.test.ts
index 5c0cab2587e8b36e626012af799609eb33bc9374..13b105e7bc215297a2a39b48a67a59238117f68c 100644
--- a/src/web/client/research-forms.test.ts
+++ b/src/web/client/research-forms.test.ts
@@ -1,9 +1,13 @@
 import { describe, expect, it } from 'vitest';
 import type { PageNode } from './popup.js';
 import {
+  CHANGE_TASK,
+  formSubject,
+  heldStops,
   researchBody,
   researchForm,
   submitResearch,
+  taskChanged,
   tasksFound,
   type ResearchBody,
   type ResearchSubmitDeps,
@@ -400,3 +404,102 @@ describe('"Same task at more stops…" (plan 8M-9B, goal 8)', () => {
     expect(found(form, (one) => one.attributes?.['data-task'] !== undefined)).toEqual([]);
   });
 });
+
+// Plan 8M-11A (S18): Add stops… and Same task at more stops… leave out the stops that hold the
+// task already, by the rule Discord's "Same task at more stops…" uses (`holdsSubject`).
+describe('the stops that hold the task of the form already', () => {
+  const TASK = '0123456789abcdef';
+  const at = (n: number, task: string, more: Parameters<typeof caseResearch>[1] = {}) =>
+    caseResearch(n, { task, ...more });
+  const NOW = Date.UTC(2026, 9, 27, 18);
+
+  it('are those with the same version, and for "one of" any version of its task, still standing', () => {
+    const reports = [
+      at(1, `${TASK}:0000000a`),
+      at(2, `${TASK}:0000000b`),
+      at(3, `fedcba9876543210:0000000a`),
+      at(4, `${TASK}:0000000a`, { endsAt: NOW - 1 }),
+    ];
+    expect([...heldStops(reports, { subjectKey: `${TASK}:0000000a`, oneOf: false }, NOW)]).toEqual([
+      'stop-1',
+    ]);
+    expect([...heldStops(reports, { subjectKey: TASK, oneOf: true }, NOW)]).toEqual([
+      'stop-1',
+      'stop-2',
+    ]);
+    expect([...heldStops(reports, undefined, NOW)]).toEqual([]);
+  });
+
+  it("is the version picked, or Same task at more stops…'s report's", () => {
+    expect(
+      formSubject({ query: '', task: 'dragon', version: 'dragon' }, { kind: 'new' }, OPTIONS),
+    ).toEqual({
+      subjectKey: 'dragon',
+      oneOf: true,
+    });
+    expect(
+      formSubject(
+        { query: '', task: 'dragon', version: 'dragon:aaaa1111' },
+        { kind: 'new' },
+        OPTIONS,
+      ),
+    ).toEqual({ subjectKey: 'dragon:aaaa1111', oneOf: false });
+    expect(formSubject({ query: '' }, { kind: 'new' }, OPTIONS)).toBeUndefined();
+    const report = caseResearch(1, { oneOf: true, task: TASK });
+    expect(formSubject({ query: '' }, { kind: 'more', report }, undefined)).toEqual({
+      subjectKey: TASK,
+      oneOf: true,
+    });
+  });
+});
+
+// Plan 8M-11A (S26): a picked task stays changeable before Submit; where it is shown alone (the
+// contradiction question, "Same task at more stops…"), "Change task" brings the list back with
+// the task kept as the selection.
+describe('changing the task of a research form', () => {
+  const changeTask = (node: PageNode) =>
+    found(node, (one) => one.attributes?.['data-change-task'] !== undefined);
+
+  it('offers Change task where the task is shown alone, and not over the list', () => {
+    const asks = {
+      text: 'Brock reported another task here.',
+      reports: [caseResearch(1)],
+      hidden: [],
+    };
+    const asked = researchForm(OPTIONS, AT, { query: '', task: 'dragon', asks });
+    expect(changeTask(asked).map((one) => one.text)).toEqual([CHANGE_TASK]);
+    const more = researchForm(
+      OPTIONS,
+      [],
+      { query: '' },
+      { kind: 'more', report: caseResearch(1) },
+    );
+    expect(changeTask(more)).toHaveLength(1);
+    expect(changeTask(researchForm(OPTIONS, AT, { query: '', task: 'dragon' }))).toEqual([]);
+  });
+
+  it('brings the list back from the question, the task and its reward kept', () => {
+    const asks = { text: 'Brock reported another task here.', reports: [], hidden: [] };
+    const state = { query: '', task: 'dragon', version: 'dragon:bbbb2222', asks };
+    const changed = taskChanged(state, { kind: 'new' }, OPTIONS);
+    expect(changed).toEqual({
+      state: { query: '', task: 'dragon', version: 'dragon:bbbb2222' },
+      mode: { kind: 'new' },
+    });
+    expect(texts(researchForm(OPTIONS, AT, changed.state))).toContain('Bagon');
+  });
+
+  it("makes Same task at more stops… a new report of the list, its report's task picked", () => {
+    const report = caseResearch(1, { task: 'dragon', oneOf: true });
+    expect(taskChanged({ query: '' }, { kind: 'more', report }, OPTIONS)).toEqual({
+      state: { query: '', task: 'dragon', version: 'dragon' },
+      mode: { kind: 'new' },
+    });
+    // A typed task is not in the list: nothing picked.
+    const typed = caseResearch(1, { task: 'typed:0123456789abcdef', typed: true });
+    expect(taskChanged({ query: '' }, { kind: 'more', report: typed }, OPTIONS)).toEqual({
+      state: { query: '' },
+      mode: { kind: 'new' },
+    });
+  });
+});
diff --git a/src/web/client/research-forms.ts b/src/web/client/research-forms.ts
index a64edeaa81d955508cb370e28b9041f791d0cdd0..8a2325240df7551b3417e99e039f770be5b19e85 100644
--- a/src/web/client/research-forms.ts
+++ b/src/web/client/research-forms.ts
@@ -5,6 +5,7 @@ import type {
   ResearchOptionsView,
   ResearchTaskOption,
 } from '../../domain/web/stop-report-data.js';
+import { holdsSubject, taskOfSubject } from '../../domain/research/reports.js';
 import type { PageNode } from './popup.js';
 import { nearestPart, type Nearest } from './report-flow.js';
 import { STOP_GONE } from './rocket-forms.js';
@@ -64,6 +65,86 @@ export interface ResearchFormState {
   sending?: boolean;
 }
 
+/** What a report of the form is of: its version's value (`subjectKey`), and whether "one of". */
+export interface FormSubject {
+  subjectKey: string;
+  oneOf: boolean;
+}
+
+/**
+ * What the form reports, as far as it is picked (plan 8M-11A, S18): "Same task at more stops…"'s
+ * report's version; else the version picked of the task list (`lists`); none before one is picked,
+ * or for a typed task.
+ */
+export function formSubject(
+  state: ResearchFormState,
+  mode: ResearchMode,
+  lists: Pick<ResearchOptionsView, 'tasks'> | undefined,
+): FormSubject | undefined {
+  if (mode.kind === 'more') return { subjectKey: mode.report.task, oneOf: mode.report.oneOf };
+  const version = lists?.tasks
+    .find((task) => task.key === state.task)
+    ?.versions.find((one) => one.value === state.version);
+  return version === undefined ? undefined : { subjectKey: version.value, oneOf: version.oneOf };
+}
+
+/**
+ * The stops whose research report standing now holds the form's subject already (plan 8M-11A,
+ * S18), by the rule "Same task at more stops…" on Discord uses (`holdsSubject`): Add stops… and
+ * "Same task at more stops…" on the map leave them out. None before a subject is picked.
+ */
+export function heldStops(
+  reports: readonly Pick<MapResearch, 'stop' | 'task' | 'endsAt'>[],
+  subject: FormSubject | undefined,
+  now: number,
+): Set<string> {
+  if (subject === undefined) return new Set();
+  return new Set(
+    reports
+      .filter((report) => report.endsAt > now && holdsSubject(report.task, subject))
+      .map((report) => report.stop.key),
+  );
+}
+
+/** The button that brings the task list back where the task is shown alone (plan 8M-11A, S26). */
+export const CHANGE_TASK = 'Change task';
+
+const changeTaskButton: PageNode = {
+  tag: 'button',
+  className: 'press',
+  text: CHANGE_TASK,
+  attributes: { type: 'button', 'data-change-task': '' },
+};
+
+/**
+ * "Change task" (plan 8M-11A, S26): the task list back with the task kept as the selection. From
+ * the contradiction question, its task and reward as they were; from "Same task at more
+ * stops…", a new report of the list with its report's version picked (the task whose versions
+ * name it, else whose key is its task's), the stops as they are; a typed task is in no list, and
+ * nothing is picked.
+ */
+export function taskChanged(
+  state: ResearchFormState,
+  mode: ResearchMode,
+  options: Pick<ResearchOptionsView, 'tasks'> | undefined,
+): { state: ResearchFormState; mode: ResearchMode } {
+  const { asks: _asks, ...rest } = state;
+  if (mode.kind === 'new') return { state: rest, mode };
+  const subject = mode.report.task;
+  const task =
+    options?.tasks.find((one) => one.versions.some((version) => version.value === subject)) ??
+    options?.tasks.find((one) => one.key === taskOfSubject(subject));
+  const version = task?.versions.find((one) => one.value === subject)?.value;
+  return {
+    state: {
+      ...rest,
+      ...(task === undefined ? {} : { task: task.key }),
+      ...(version === undefined ? {} : { version }),
+    },
+    mode: { kind: 'new' },
+  };
+}
+
 /** A tree of the form with every button off while its report is sent (review F3). */
 function offWhileSending(node: PageNode, state: ResearchFormState): PageNode {
   if (state.sending !== true) return node;
@@ -451,13 +532,14 @@ export function researchForm(
   const task = options?.tasks.find((one) => one.key === state.task);
   const body: PageNode[] =
     state.asks !== undefined
-      ? asksPart(state.asks)
+      ? [...asksPart(state.asks), changeTaskButton]
       : mode.kind === 'more'
         ? [
             { tag: 'p', className: 'form-text', text: mode.report.text },
             ...(mode.report.rewardText === ''
               ? []
               : [{ tag: 'p', className: 'hint', text: mode.report.rewardText }]),
+            changeTaskButton,
           ]
         : options === undefined
           ? [{ tag: 'p', className: 'hint', text: 'Loading the task list…' }]
diff --git a/src/web/client/research-ui.ts b/src/web/client/research-ui.ts
index bd98ab35676b72db590d26419578bd9c617a1b1f..16d260503db16fd8f2949666195d47fc0399ed3e 100644
--- a/src/web/client/research-ui.ts
+++ b/src/web/client/research-ui.ts
@@ -10,9 +10,12 @@ import { renderNode } from './popup.js';
 import type { FormClaim, FormHold } from './raid-forms.js';
 import { sayUnder } from './raid-ui.js';
 import {
+  formSubject,
+  heldStops,
   pickedFrom,
   researchForm,
   submitResearch,
+  taskChanged,
   taskList,
   type PickedStop,
   type ResearchAfter,
@@ -70,6 +73,11 @@ export interface ResearchUiDeps {
    */
   origin(): LatLon;
   units: DistanceUnits;
+  /**
+   * The research reports the map has now (plan 8M-11A, S18): the stops that hold the form's task
+   * already are not offered (`heldStops`).
+   */
+  research(): readonly MapResearch[];
 }
 
 /** What the page says of a form while another one is open. */
@@ -119,8 +127,11 @@ export function researchUi(deps: ResearchUiDeps) {
     const { near, stops, mode } = open;
     if (typeof near === 'string') return near;
     const own = mode.kind === 'more' ? mode.report.stop.key : undefined;
+    // Nor a stop that holds the task already, by Discord's rule (plan 8M-11A, S18).
+    const held = heldStops(deps.research(), formSubject(open.state, mode, open.lists), Date.now());
     const left = near.filter(
-      (place) => place.id !== own && !stops.some((stop) => stop.key === place.id),
+      (place) =>
+        place.id !== own && !held.has(place.id) && !stops.some((stop) => stop.key === place.id),
     );
     return nearestLines(left, lastStop() ?? deps.origin(), deps.units);
   };
@@ -321,7 +332,8 @@ export function researchUi(deps: ResearchUiDeps) {
   const clicked = (form: HTMLElement, event: Event): void => {
     const target = event.target instanceof Element ? event.target.closest('button') : null;
     if (!(target instanceof HTMLButtonElement) || !open) return;
-    const { cancel, task, typing, addStops, removeStop, submit, reportNear } = target.dataset;
+    const { cancel, task, typing, addStops, removeStop, submit, reportNear, changeTask } =
+      target.dataset;
     if (reportNear !== undefined) {
       // A line of the nearest stops (branch review W6): added as a tap on it adds it; the focus
       // on the next line, for the keyboard.
@@ -336,6 +348,16 @@ export function researchUi(deps: ResearchUiDeps) {
     } else if (cancel !== undefined) {
       // Cancel sends nothing, the contradiction question's too (R7).
       close();
+    } else if (changeTask !== undefined) {
+      // The task list back, the task kept as the selection (plan 8M-11A, S26).
+      const changed = taskChanged(open.state, open.mode, open.lists);
+      open.state = changed.state;
+      open.mode = changed.mode;
+      draw(
+        open.state.task === undefined
+          ? 'input[name="query"]'
+          : `button[data-task="${CSS.escape(open.state.task)}"]`,
+      );
     } else if (task !== undefined) {
       open.state.task = task;
       delete open.state.version;
````

### Task 6: 8M-11A: the nearest Power Spots and stops for Report; the start log once

Prototype commit: `503c1175e717c0d26194176b792ebe62bda71a23`

/api/powerspots and /api/stops take near=<lat>,<lon>&count=<n> (at most
25) beside a box: the server's titled Wayspots of that kind nearest the
point, by nearestPlaces (src/domain/search/nearest.ts), the search
Discord's lists of nearby places use (wayspotsNear, placesFor). The Report
button's step 2 of a max battle, research and Rocket asks for the five
nearest of where you are and lists them; the view's places stay what the
map draws, and list only where that ask failed.

"meetup safety is off" is said once at start, not once per server: the
setting is the instance's.

**Files:**

```
 src/services/meetup-safety.test.ts        |  6 +++---
 src/services/meetup-safety.ts             | 18 +++++++++---------
 src/web/client/party-layer.ts             | 17 +++++++++++++++++
 src/web/client/report-ui.isolated.test.ts | 33 +++++++++++++++++++++++++++++++++
 src/web/client/report-ui.ts               | 46 ++++++++++++++++++++++++++++++++++++++++++++++
 src/web/max-options.test.ts               | 32 ++++++++++++++++++++++++++++++++
 src/web/max-routes.ts                     |  7 ++++---
 src/web/meetup-make.test.ts               | 12 ++++++++++++
 src/web/meetup-routes.ts                  |  7 ++++---
 src/web/wayspot-box.ts                    | 69 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 10 files changed, 229 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/meetup-safety.test.ts src/web/client/report-ui.isolated.test.ts src/web/max-options.test.ts src/web/meetup-make.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 503c1175e717c0d26194176b792ebe62bda71a23 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A: the nearest Power Spots and stops for Report; the start log once`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 9de103274945fb109e2de135a083cbe1a7e437cd..166edcf7a371b106f26146e30a41e8c02c2d7029 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -559,13 +559,13 @@ describe('MeetupSafety.expire', () => {
 });
 
 describe('MeetupSafety.warnAtStart', () => {
-  it('says once per server that meetup safety is off without the setting', async () => {
+  // Plan 8M-11A: the setting is the instance's, so it is said once, whatever the servers.
+  it('says once that meetup safety is off without the setting, not once per server', async () => {
     const made = await meetupSafetyWith({ moderation: null });
     made.safety.warnAtStart([SERVER, OTHER_SERVER]);
     const warned = made.entries.filter((entry) => entry.level === 40);
     expect(warned.map((entry) => [entry.msg, entry.server])).toEqual([
-      ['meetup safety is off: settings.channels.moderation is not set', SERVER],
-      ['meetup safety is off: settings.channels.moderation is not set', OTHER_SERVER],
+      ['meetup safety is off: settings.channels.moderation is not set', undefined],
     ]);
   });
 
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index c65da8b22eb8ea49794baa398c877d5471c115bb..8b7373119aadaf822fe48703f644b1cfb7f8a205 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -193,20 +193,20 @@ export class MeetupSafety {
   }
 
   /**
-   * Says at the start, once per server the bot is in, where meetup safety cannot work: off
-   * without the setting, a server without a text channel of that name, or one where the bot may
-   * not post in it (`mayPost`: View Channel, Send Messages, Embed Links). Meetups that need a
-   * moderator's approval cannot be made there; a channel made or fixed later is found then.
-   * Never throws.
+   * Says at the start where meetup safety cannot work: off without the setting, said once (plan
+   * 8M-11A: the setting is the instance's, not a server's); per server the bot is in, a server
+   * without a text channel of that name, or one where the bot may not post in it (`mayPost`: View
+   * Channel, Send Messages, Embed Links). Meetups that need a moderator's approval cannot be made
+   * there; a channel made or fixed later is found then. Never throws.
    */
   warnAtStart(guildIds: readonly string[]): void {
     const { gateway, log } = this.options;
     const name = this.channelName;
+    if (name === undefined) {
+      log.warn('meetup safety is off: settings.channels.moderation is not set');
+      return;
+    }
     for (const server of guildIds) {
-      if (name === undefined) {
-        log.warn({ server }, 'meetup safety is off: settings.channels.moderation is not set');
-        continue;
-      }
       let found: string | undefined;
       let mayPost: boolean;
       try {
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 06ad6bb0e3c661f977f754c88d2cee3c95a2cbf2..dffd76c53f0ba40f1c5647f6931dcd1ed419c059 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -1,6 +1,9 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
 import type { PartiesView } from '../../domain/web/party-data.js';
+import type { PowerSpotsView } from '../../domain/web/max-data.js';
+import type { StopsView } from '../../domain/web/meetup-data.js';
+import { NEAREST_COUNT } from './report-flow.js';
 import { byId, getJson, say } from './common.js';
 import { meetupActions, meetupHereBox } from './meetup-forms.js';
 import { meetupUi } from './meetup-ui.js';
@@ -1965,6 +1968,20 @@ export function showParties(
   // places drawn (the gyms through `forced`, the Power Spots through `forcedPlaces`), and step 3
   // the kind's own form, as a tap on its place opens it.
   const report = reportUi({
+    // Step 2's five nearest Power Spots or PokéStops wherever they are (plan 8M-11A), as the
+    // server's search of nearby places finds them; the view's places stay what the map draws.
+    nearest: async (pick, at) => {
+      const query = `near=${at.lat.toFixed(6)},${at.lon.toFixed(6)}&count=${String(NEAREST_COUNT)}`;
+      try {
+        const rows =
+          pick === 'spots'
+            ? (await getJson<PowerSpotsView>(`/s/${guild}/api/powerspots?${query}`)).spots
+            : (await getJson<StopsView>(`/s/${guild}/api/stops?${query}`)).stops;
+        return rows.map(([id, lat, lon, title]) => ({ id, lat, lon, title }));
+      } catch {
+        return 'failed';
+      }
+    },
     map,
     hold,
     tools,
diff --git a/src/web/client/report-ui.isolated.test.ts b/src/web/client/report-ui.isolated.test.ts
index 6be15ec9304c3396314a08107966592eaf85a8e2..a14757c278143ec1d3522a544b61a545ec91cac6 100644
--- a/src/web/client/report-ui.isolated.test.ts
+++ b/src/web/client/report-ui.isolated.test.ts
@@ -4,6 +4,7 @@ import type { PageNode, MapGym } from './popup.js';
 import { FormHold } from './raid-forms.js';
 import { REPORT_KINDS, type ReportKind } from './report-menu.js';
 import { ReportFlow, type ReportFlowDeps } from './report-ui.js';
+import type { MapSpot } from './max-ui.js';
 
 // Leaflet reads the browser's `window` as it loads; the Report button's controller uses none of
 // it (only `reportUi`, the page's side, does). Isolated: a mocked module needs a module graph of
@@ -119,6 +120,8 @@ function started(more: Partial<ReportFlowDeps> = {}) {
     startTrain: (region) => calls.push(`train ${String(region)}`),
     startMeetup: () => calls.push('meetup'),
     toStop: (id, stop) => calls.push(`${id} at ${stop.title} ${free()}`),
+    // The server's nearest never come, unless the test says so (plan 8M-11A).
+    nearest: () => new Promise(() => undefined),
     ...more,
   };
   const flow = new ReportFlow(deps);
@@ -290,6 +293,36 @@ describe("the Report button's step 2 per kind and step 3 (plan 8M-9A, A4 to A6)"
     ]);
   });
 
+  // Plan 8M-11A: the five nearest Power Spots the server gives, wherever they are, not those of
+  // the view the map flew to.
+  it('lists the nearest the server gives, and the view answering after does not replace them', async () => {
+    const asked: string[] = [];
+    let answer: (spots: readonly MapSpot[]) => void = () => undefined;
+    const { flow, shown, land } = started({
+      nearest: (pick, at) => {
+        asked.push(`${pick} ${String(at.lat)}`);
+        return new Promise((resolve) => {
+          answer = resolve;
+        });
+      },
+    });
+    flow.choose(kind('max'));
+    expect(asked).toEqual(['spots 40.44']);
+    const far = (n: number): MapSpot => ({
+      id: `s${String(n)}`,
+      title: `Spot ${String(n)}`,
+      lat: 40.44 + n / 100,
+      lon: -79.95,
+    });
+    answer([1, 2, 3, 4, 5].map(far));
+    await flow.nearestCame;
+    expect(shown()).toEqual(expect.arrayContaining(['Spot 1', 'Spot 5']));
+    land();
+    flow.spotsCame([{ id: 'near', title: 'Gazebo', lat: 40.4405, lon: -79.95 }]);
+    expect(shown()).toEqual(expect.arrayContaining(['Spot 1', 'Spot 5']));
+    expect(shown()).not.toContain('Gazebo');
+  });
+
   it("opens a battle's marker as it would, step 2 ending once the tap is through", () => {
     const { flow, hold, runLater } = started();
     flow.choose(kind('max'));
diff --git a/src/web/client/report-ui.ts b/src/web/client/report-ui.ts
index 26802a1104c70ffc749916583ef7840e9396f432..b125b585b4051cc723158e1f6746548f8ecb7ea7 100644
--- a/src/web/client/report-ui.ts
+++ b/src/web/client/report-ui.ts
@@ -115,6 +115,11 @@ export interface ReportFlowDeps {
    * side pane, the Rocket form in the stop's popup, with the stop.
    */
   toStop(kind: 'research' | 'rocket', stop: MapSpot): void;
+  /**
+   * The nearest Power Spots (`spots`) or PokéStops (`stops`) of a point, wherever they are
+   * (plan 8M-11A: `/api/powerspots` or `/api/stops` with `near=` and `count=`), or `failed`.
+   */
+  nearest(pick: 'spots' | 'stops', at: LatLon): Promise<readonly MapSpot[] | 'failed'>;
 }
 
 /**
@@ -135,9 +140,17 @@ export class ReportFlow {
         flying: boolean;
         /** What a tap that took nothing said (plan 8M-9B: "Tap a PokéStop."), if so. */
         note: string | undefined;
+        /**
+         * The nearest came from the server (plan 8M-11A): the view's places, which the map draws,
+         * no longer take their place in the list.
+         */
+        served: boolean;
       }
     | undefined;
 
+  /** The latest ask for the server's nearest, settled once its answer is drawn (or dropped). */
+  nearestCame: Promise<void> = Promise.resolve();
+
   constructor(private readonly deps: ReportFlowDeps) {}
 
   /** Whether step 2 draws these places now, whatever the layers say. */
@@ -179,6 +192,7 @@ export class ReportFlow {
       refused: undefined,
       flying: false,
       note: undefined,
+      served: false,
     };
     deps.closePopup();
     if (kind.pick === 'gyms') {
@@ -201,6 +215,14 @@ export class ReportFlow {
       deps.flyTo(origin, () => {
         flight.flying = false;
       });
+      // The five nearest wherever they are (plan 8M-11A), not only those the view holds.
+      const pick = kind.pick;
+      this.nearestCame = deps.nearest(pick, origin).then(
+        (answer) => {
+          this.nearestServed(flight, answer);
+        },
+        () => undefined,
+      );
     }
     deps.mark(kind.pick);
     deps.showBox(pickBox(kind, this.picking.nearest));
@@ -428,6 +450,28 @@ export class ReportFlow {
     this.placesCame('stops', answer);
   }
 
+  /**
+   * The server's nearest came for the step 2 that asked (plan 8M-11A): they are its list, the
+   * nearest first; a failure leaves the list to the view's places, as before.
+   */
+  private nearestServed(
+    asked: NonNullable<ReportFlow['picking']>,
+    answer: readonly MapSpot[] | 'failed',
+  ): void {
+    const open = this.picking;
+    if (open !== asked || answer === 'failed') return;
+    const places = answer.map((spot): NearPlace => ({
+      id: spot.id,
+      name: spot.title,
+      lat: spot.lat,
+      lon: spot.lon,
+    }));
+    for (const place of places) open.places.set(place.id, place);
+    open.served = true;
+    open.nearest = nearestLines(places, this.deps.origin(), this.deps.units);
+    this.draw();
+  }
+
   /** The places of the view came for the step 2 that asks for them: its nearest, or why none. */
   private placesCame(
     pick: 'spots' | 'stops',
@@ -435,6 +479,8 @@ export class ReportFlow {
   ): void {
     const open = this.picking;
     if (open?.kind.pick !== pick) return;
+    // The server's nearest are the list once they came (plan 8M-11A).
+    if (open.served) return;
     if (typeof answer === 'string') {
       // On its way the map passes zooms the Power Spots are not drawn from (R2-4).
       if (answer === 'zoom' && open.flying) return;
diff --git a/src/web/max-options.test.ts b/src/web/max-options.test.ts
index 19d71c8720d06b6dfeeb407e5f3fa703c13dda1d..093a8e0b6017631cb02b8256295d004cc7ba6cbb 100644
--- a/src/web/max-options.test.ts
+++ b/src/web/max-options.test.ts
@@ -212,6 +212,38 @@ describe('GET /s/<guild>/api/powerspots', () => {
     expect(answer.json.more).toBe(true);
   });
 
+  // Plan 8M-11A: Report → Max battle lists the five nearest, wherever they are, not those in view.
+  it('gives the nearest of a point, as many as asked, by the search Discord lists nearby places with', async () => {
+    const made = await serving([
+      keptRow(2, { kind: 'powerspot', lat: 40.062, lon: -80.062, title: 'Salon' }),
+      keptRow(3, { kind: 'powerspot', lat: 40.0651, lon: -80.0651, title: 'Bandstand' }),
+      keptRow(5, { kind: 'stop', lat: 40.0652, lon: -80.0652, title: 'Market Fountain' }),
+    ]);
+    web = made.web;
+    const cookie = await web.loggedIn(ALICE, 'Alice');
+    const answer = await spotsIn(web, cookie, 'near=40.0652,-80.0652&count=2');
+    expect(answer.status).toBe(200);
+    expect(answer.json).toEqual({
+      spots: [
+        [wayspotId(3), 40.0651, -80.0651, 'Bandstand'],
+        [wayspotId(2), 40.062, -80.062, 'Salon'],
+      ],
+      more: false,
+    });
+    const all = await spotsIn(web, cookie, 'near=40.0652,-80.0652&count=5');
+    // Every titled Power Spot of the server's regions, the nearest first; never a PokéStop.
+    expect(all.json.spots.slice(0, 2).map((spot) => spot[3])).toEqual(['Bandstand', 'Salon']);
+    expect(all.json.spots.map((spot) => spot[3])).not.toContain('Market Fountain');
+    for (const bad of [
+      'near=91,0&count=5',
+      'near=40,-80&count=0',
+      'near=40,-80&count=26',
+      'near=x',
+    ]) {
+      expect((await spotsIn(web, cookie, bad)).status, bad).toBe(400);
+    }
+  });
+
   it('is for members alone, refuses a box that is none, and 60 a minute from one address', async () => {
     const made = await serving();
     web = made.web;
diff --git a/src/web/max-routes.ts b/src/web/max-routes.ts
index ca39c37f7eecb5f1973cca07c845e93077669bf6..d9ae9bd5dd40108b8f1c97f03dac83a54e73bee6 100644
--- a/src/web/max-routes.ts
+++ b/src/web/max-routes.ts
@@ -65,7 +65,7 @@ import { maxOptions } from './max-options.js';
 import { pageWords } from './page-words.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
-import { boxSchema, wayspotsInBox } from './wayspot-box.js';
+import { placesFor, placesQuerySchema } from './wayspot-box.js';
 
 /**
  * What the max battles of the live map read and call (plan 8X-5): exactly what `/max` uses (its
@@ -295,13 +295,14 @@ export function maxRoutes(scope: FastifyInstance, deps: WebDeps): void {
       void reply.header('cache-control', 'private, no-store');
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 401);
-      const box = boxSchema.safeParse(request.query ?? {});
+      // A box of the map, or the nearest of a point (plan 8M-11A: the Report button's step 2).
+      const box = placesQuerySchema.safeParse(request.query ?? {});
       if (!box.success) return sendFailure(request, reply, 400);
       const { guild } = request.params;
       const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
       if (refused) return refused;
       const row = await parties.guilds.idFor(guild);
-      const { found, more } = wayspotsInBox(ctx, row, box.data, 'powerspot', MAX_MAP_SPOTS);
+      const { found, more } = placesFor(ctx, row, box.data, 'powerspot', MAX_MAP_SPOTS);
       const view: PowerSpotsView = { spots: found, more };
       return view;
     },
diff --git a/src/web/meetup-make.test.ts b/src/web/meetup-make.test.ts
index 04394c2e327144957bab759347749b3d890a5b7f..747fd46c78edfffac39f4e5fb5c05ce7913f48ea 100644
--- a/src/web/meetup-make.test.ts
+++ b/src/web/meetup-make.test.ts
@@ -478,6 +478,18 @@ describe('the PokéStops of a box of the map', () => {
     expect(outside.json).toEqual({ stops: [], more: false });
   });
 
+  // Plan 8M-11A: the Report button's research and Rocket list the nearest stops, wherever they are.
+  it('gives the nearest stops of a point, as many as asked, never a Power Spot', async () => {
+    const map = await making();
+    web = map.web;
+    const cookie = await map.web.loggedIn(ALICE, 'Alice');
+    const answer = await stopsIn(map.web, cookie, 'near=40.0612,-80.0612&count=1');
+    expect(answer.json).toEqual({
+      stops: [[wayspotId(1), 40.061, -80.061, 'Market Fountain']],
+      more: false,
+    });
+  });
+
   it(`gives at most ${String(MAX_MAP_STOPS)}, and says there are more`, async () => {
     const rows = Array.from({ length: MAX_MAP_STOPS + 5 }, (_, n) =>
       keptRow(10 + n, { lat: 40.05 + n / 100_000, lon: -80.05 }),
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index bca9086db2ede00d1b7698e8120d6b615520b70f..ae1ad40b973a858f4c6c0ec32046fb1d4fb561a4 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -67,7 +67,7 @@ import { shownAfter } from './post-drawn.js';
 import { postGuard } from './csrf.js';
 import type { GuildRequest } from './guild-routes.js';
 import { pageWords } from './page-words.js';
-import { boxSchema, wayspotsInBox } from './wayspot-box.js';
+import { placesFor, placesQuerySchema } from './wayspot-box.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -553,13 +553,14 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
       void reply.header('cache-control', 'private, no-store');
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 401);
-      const box = boxSchema.safeParse(request.query ?? {});
+      // A box of the map, or the nearest of a point (plan 8M-11A: the Report button's step 2).
+      const box = placesQuerySchema.safeParse(request.query ?? {});
       if (!box.success) return sendFailure(request, reply, 400);
       const { guild } = request.params;
       const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
       if (refused) return refused;
       const row = await parties.guilds.idFor(guild);
-      const { found, more } = wayspotsInBox(ctx, row, box.data, 'stop', MAX_MAP_STOPS);
+      const { found, more } = placesFor(ctx, row, box.data, 'stop', MAX_MAP_STOPS);
       const view: StopsView = { stops: found, more };
       return view;
     },
diff --git a/src/web/wayspot-box.ts b/src/web/wayspot-box.ts
index 06ddab1090d30516d07ec6f96b578374444dd415..d7e04f02174688eb1f94799bdc6db2648fa9b340 100644
--- a/src/web/wayspot-box.ts
+++ b/src/web/wayspot-box.ts
@@ -1,5 +1,6 @@
 import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
+import { nearestPlaces } from '../domain/search/nearest.js';
 
 /**
  * The kept Wayspots of one kind in a box of the map (plans 8M-5M, 8X-5): the PokéStops of
@@ -51,3 +52,71 @@ export function wayspotsInBox(
   const nearest = [...found.values()].sort((a, b) => distance(a) - distance(b));
   return { found: nearest.slice(0, max), more: nearest.length > max };
 }
+
+/** The most places one ask for the nearest gives (`near=`): a menu's 25. */
+export const MAX_NEAREST = 25;
+
+/**
+ * The nearest of a point (plan 8M-11A): `near=<lat>,<lon>&count=<n>`, the Report button's step 2
+ * listing the nearest Power Spots or PokéStops wherever they are, not only those in view.
+ */
+export const nearSchema = z
+  .object({
+    near: z
+      .string()
+      .regex(/^-?\d{1,3}(?:\.\d+)?,-?\d{1,3}(?:\.\d+)?$/u)
+      .transform((text) => {
+        const [lat = NaN, lon = NaN] = text.split(',').map(Number);
+        return { lat, lon };
+      })
+      .refine(({ lat, lon }) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180),
+    count: z.coerce.number().int().min(1).max(MAX_NEAREST),
+  })
+  .strict();
+
+/** A box of the map, or the nearest of a point: what `/api/stops` and `/api/powerspots` take. */
+export const placesQuerySchema = z.union([boxSchema, nearSchema]);
+
+/**
+ * The kept Wayspots of `kind` with a title in a region of the server (`row`) nearest `at`, nearest
+ * first, as near by title, `count` at most (plan 8M-11A): by `nearestPlaces`, the search Discord's
+ * lists of nearby stops use (`PlaceFinder.nearest`), each once. None for a server without its row.
+ */
+export function wayspotsNear(
+  ctx: Pick<AppContext, 'regions' | 'wayspots'>,
+  row: number | undefined,
+  at: { lat: number; lon: number },
+  kind: 'stop' | 'powerspot',
+  count: number,
+): BoxedWayspot[] {
+  const places = new Map<string, BoxedWayspot>();
+  for (const region of ctx.regions.all()) {
+    if (region.guildId !== row || row === undefined || region.bounds === null) continue;
+    for (const wayspot of ctx.wayspots.inRegion(region.channelId)) {
+      if (wayspot.kind !== kind || wayspot.title.trim() === '') continue;
+      places.set(wayspot.id, [wayspot.id, wayspot.lat, wayspot.lon, wayspot.title]);
+    }
+  }
+  return nearestPlaces(places.values(), [at], {
+    pointOf: ([, lat, lon]) => ({ lat, lon }),
+    nameOf: ([, , , title]) => title,
+    count,
+  }).map(({ item }) => item);
+}
+
+/**
+ * The places of `/api/stops` or `/api/powerspots` for a query (`placesQuerySchema`): in a box,
+ * at most `max`, or the `count` nearest a point (never "more").
+ */
+export function placesFor(
+  ctx: Pick<AppContext, 'regions' | 'wayspots'>,
+  row: number | undefined,
+  query: z.infer<typeof placesQuerySchema>,
+  kind: 'stop' | 'powerspot',
+  max: number,
+): { found: BoxedWayspot[]; more: boolean } {
+  if ('near' in query) {
+    return { found: wayspotsNear(ctx, row, query.near, kind, query.count), more: false };
+  }
+  return wayspotsInBox(ctx, row, query, kind, max);
+}
````

### Task 7: 8M-11A S14: the Report menu's icons, /icons/dynamax.png, the train emoji

Prototype commit: `c5d64ace00959178a70ff6f609d38f772428a3cd`

The Report menu's icons as Matt chose them: the game's raid head (white,
no outline in dark), the game's Dynamax map icon as a mask in
--tier-dynamax (kept as pictures/icons/dynamax.png, served at
/icons/dynamax.png as the eggs are; CSP unchanged), the quest symbol and
the R as before, Campfire's one-color Poke Ball as a mask in --ball (red,
white in dark), the game's calendar as a mask in --meetup, and Pine's own
train C3b, drawn whole from the design's SVG (a shape now keeps its view
box, attributes and elements). In dark no outline on the masks, the train
and the light pictures.

pictures/emoji/pinetrain.png (C3b in #e67e22, 128 px) joins
CONTROL_ICON_NAMES, so emoji:upload offers it. Once the application has
it, the train emoji goes in front of a train's name in the summary's lists
and in the new-train DMs' brief (PartyService.trainMark, by
customIconText, the controls' resolver); until then those lines read as
before. Never on a button.

**Files:**

```
 pictures/emoji/pinetrain.png                | Bin 0 -> 1654 bytes
 scripts/web/build.ts                        |   3 +++
 src/domain/pogo/game-icons.ts               |   5 ++++-
 src/ops/emoji-upload.test.ts                |   2 ++
 src/render/party-controls.test.ts           |   7 +++++++
 src/render/party-controls.ts                |  11 ++++++++++-
 src/render/summary.test.ts                  |  20 ++++++++++++++++++++
 src/render/summary.ts                       |  34 +++++++++++++++++++++++++++-------
 src/services/notify-service.parties.test.ts |  21 +++++++++++++++++++++
 src/services/notify-service.ts              |  20 +++++++++++++++++++-
 src/services/party-service.train.test.ts    |  19 +++++++++++++++++++
 src/services/party-service.ts               |  12 ++++++++++++
 src/web/client/map.css                      |  40 ++++++++++++++++++++++++++++++++++------
 src/web/client/report-icons.ts              | 133 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------------------------------
 src/web/client/report-menu.test.ts          |  10 ++++++----
 src/web/client/report-menu.ts               |   3 ++-
 src/web/client/report-ui.ts                 |  31 +++++++++++++++++++++----------
 src/web/client/theme.css                    |   3 +++
 src/web/report-icons.test.ts                |  68 ++++++++++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/web/server.test.ts                      |  16 ++++++++++++++++
 src/web/server.ts                           |  30 ++++++++++++++++++++++++++++++
 21 files changed, 402 insertions(+), 86 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/ops/emoji-upload.test.ts src/render/party-controls.test.ts src/render/summary.test.ts src/services/notify-service.parties.test.ts src/services/party-service.train.test.ts src/web/client/report-menu.test.ts src/web/report-icons.test.ts src/web/server.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c5d64ace00959178a70ff6f609d38f772428a3cd -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A S14: the Report menu's icons, /icons/dynamax.png, the train emoji`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/pictures/emoji/pinetrain.png b/pictures/emoji/pinetrain.png
new file mode 100644
index 0000000000000000000000000000000000000000..f0f27dce8c71b2aae9f057d6255e594cf4d549ba
GIT binary patch
literal 1654
zcmb7@e>~HPAICovv-vsAuT#gEUnh(#h5W3TDR!YwggB82A<@WY!dP>LA~90SIP)vR
z9>b24veXTQbmv#j5{6{w$E|NY9^c2~?%#Vq9?$pd^?3jF{^Rwc;JiJQ6?7B;08sYC
z96$X<iC=+$zwADz3xY2KjmHEe0)Qp*E1;Bz&dC4(HuXI2>X-6nxgsEU{|W5@k6Z02
zGlhKn5r4-u{Yve%ybj3yOvy3bv{e_hyES%0e<0~9#ffEZkb+?64UlDB`%UH=YNyEt
z#%eY9Cn{Ddm92A4%*xkxuB#$fHa0hsKE2-9&A>hHZA$ud_A`rJCl+DlzWnmv=C#^Z
zScFKB{D;Nrd}B2|M7SWR76-L^jj4(`aYNYzna>&1`HWK=);WY-iqo|mEL9$x=9v+v
zQk>?r(Z7de5*r&W;eGp|-b48TAdNF`E}|wz5+Wjc9+Q1!wuMhfVs4>JZP%|7y(kHl
z!(MWTm-%Z<d;J!=Cy!NDBTIIcJQo@`Q0dxi-9U$=)leuRcD7YiIj4F`lUOm*T{e)L
z(!zS1D31ZwZpC32#}G=={jGCa)d^?Q8}afb!9X+QaiX=X)q>K5Qrfj4&8{V4f+GJ8
z!wrCLen0EbB5Yg6Mlen*5CgqXB``j(AX^pr(vejxQ?)EyhPjwI{O!r$HsolPU;%W$
zqn{bbw3Dorm=r=#g3i=n#_sJM0@nKvLPIZJgU8nD?VCJ9iClO3ZMGrYmvUh6;GP(>
z8eo&z6}=_p%~gvT%$vWXw#;GkhHal<E_#sAxN#FVo8IVX#sZp5V>$+l&jCp`$ldhY
zXC4DBn>H*VYN?1Px5^mto)2;xOL0~eMmX7Ebj+oe^-X!2M9Q~&B|{H@i(-EVt<^G2
zfz2=Y-C7c`jRV%~Nh$=lmtB?MgQ5$@Db;u%q-<yoa1r6mFMJ0fu;taLE<n0DaROgd
ze?-Oh86uNu5}OHZ2LaDJOzsSGuHbL`_F?QIj{)hH#Inms%Ji~1?SbEg6h#Xn?_7W!
zKYkQup)&RSL$QX8l_~LvOR*FsVZQqiu&Y=|zvBv=P~dkLJ<~JZXz4=`K^iV}!S5<@
zh;wSKd;*Lg>Y@I(a4icaqfO-`hF^usT0JcQS=8TtvL{zL7mDr%kHbYqIX`>{cvocs
z)P-+i+7F?sUR}D9=_>FC3dTDXakH_8*`?l=g+&xQIYnc@sM~Xp)HglPd2;<Vw+ct2
zUQS(CH_W-4u_+EVDQG$ggq^LucVUu77nGjWK2+CR*A!19Rz!`S-<J+G@<I}felyVx
z_XsA^dxVYBSD1Xk<z(ZMnU2Gp)&$g&<q~Er=j5-WId8hq!|U&8^04o+D7G1M>diQT
zO?x9t?+4I7m8!xWc}m7l(T~llBzXMs@<zss<WnbcrU09*k-F|~Z|^^{oZU1ts@dWb
z179x;f=}kg^xNX!zp*>xukPc#+LwO>O7f~mwr^yXr>D7%X=+WN6mpL;*q>eLMRmSW
zcRNXq7EDk^*rHO8FD13pUcx0ZwMUM5j3{>%*{V~i-Mt-%&c$qc@ZEb{R$X9Njj-kC
z);7{R1@7zPSjkpkOklk{14%fj?zdfG7LGbR(fIz7(;d@!Uew~7_iK}W-2Cdl#-k%u
zuddGgtagBD7WVNm!>Igrq>OLdPAbd}hkTh=rvdL21&uc4C&af4KQ4-wZp1{6Vkn10
zVn67|N7R?KB>Ejf6AWL4@Qg9(7CL?GDfeDQeeM<nr1_8np`Av>&V@LEdx{M(hv4Y8
z4hZ-_<XrPj00A78S%vToVEO#F?WCaXd+nxW4vR-4YKJ8p-C-7|ROFk_;W-*!FP#E!
z;!a*N3^(5yD>Dmv#27NRG4f?Lv`iSKiB8OJ+tvWO=C8iDT9BvVuhh-J2i>#b?N^O=
z&?|P2N>)ruXC$CU4HuuG=zr>L$qjj5dsqgYHPgYq4a~BM8uYJBXee1fFWBrLr>EkV
z2A8IR`};DALu&ng>>2NQ@o;!ASbE-f<i^6dZ0i2=JI%C}&=9IzccPb1BRSwH5oT*T
z0RHKUxTZW{a`Z*X$1W=_v4gm{;q?u#LpZg2cUw;Rw0^nlU{~H{^~t;#_tfG@4Qu$n
g^7BuU{_jMAQV{EAmL`ZOBmH{vJmGzu?G~E(KZU^QV*mgE

literal 0
HcmV?d00001

diff --git a/scripts/web/build.ts b/scripts/web/build.ts
index fa76eacd2946b154f01ce77c22ef5e705038caea..2e3702d8f979f8d196315ef355a542bfdc96a71e 100644
--- a/scripts/web/build.ts
+++ b/scripts/web/build.ts
@@ -52,6 +52,9 @@ const result = await build({
   // Leaflet's licence (BSD-2-Clause) and Geoman's (MIT) ask for their notices: kept at the end.
   legalComments: 'eof',
   loader: { '.png': 'file', '.svg': 'file' },
+  // Pictures Pine serves at their own address (plan 8M-11A: `/icons/dynamax.png`, a mask of
+  // `map.css`), left as they are.
+  external: ['/icons/*'],
   metafile: true,
   logLevel: 'warning',
 });
diff --git a/src/domain/pogo/game-icons.ts b/src/domain/pogo/game-icons.ts
index 964bcecc1ce0b3b9aed8e89f8cc18d130946144d..870e584b9dd0b8b491d7901c1a826f3a997b8321 100644
--- a/src/domain/pogo/game-icons.ts
+++ b/src/domain/pogo/game-icons.ts
@@ -57,7 +57,9 @@ export const LEAGUE_ICON_NAMES = Object.values(LEAGUE_ICON);
  * pass, the trash can for Leave). Where none of a name exists the button shows a plain emoji.
  * `pinemeet` is the game's Select Time icon on Meet… (plan 8X-1B), cropped from a raid screen
  * (2026-10-25: PokeMiners' assets have none), the blue made transparent and an outline added as
- * the others have; ⏰ until the application has it.
+ * the others have; ⏰ until the application has it. `pinetrain` is Pine's own train C3b (plan
+ * 8M-11A, Matt 2026-10-28), in front of a train's name in the summary's lists and the new-train DMs,
+ * never on a button; those lines read as before until the application has it.
  */
 export const CONTROL_ICON_NAMES = [
   'pinejoin',
@@ -66,6 +68,7 @@ export const CONTROL_ICON_NAMES = [
   'pineremote',
   'pineleave',
   'pinemeet',
+  'pinetrain',
 ] as const;
 export type ControlIconName = (typeof CONTROL_ICON_NAMES)[number];
 
diff --git a/src/ops/emoji-upload.test.ts b/src/ops/emoji-upload.test.ts
index 096b0283d6743372c22b9145da986347805ba88b..e652b6f64063db593276bda3e81e0b89dfb73b61 100644
--- a/src/ops/emoji-upload.test.ts
+++ b/src/ops/emoji-upload.test.ts
@@ -148,6 +148,8 @@ describe('iconSources', () => {
       'pineremote',
       'pineleave',
       'pinemeet',
+      // Pine's own train C3b (plan 8M-11A), for "Going on now" and the new-train DMs.
+      'pinetrain',
     ]);
   });
 
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 6c888fce8121520440b626417547d149b4eab03e..71994ad14fa63ed2b926541817c09676818e6107 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -26,6 +26,7 @@ import {
   PARTY_ACTIONS,
   PARTY_KIND,
   splitGroupButton,
+  customIconText,
   statusIcon,
   wholeRouteButton,
 } from './party-controls.js';
@@ -124,6 +125,12 @@ describe('the controls of a post (plan 8X-1B: one layout for one group and sever
       `<:pinedone:${EMOJI_ID}>`,
     ]);
     expect(statusIcon(NO_ICONS, 'present')).toBe('✅');
+    // Plan 8M-11A: the application's emoji alone, by the same resolver; none where it has none.
+    expect(
+      customIconText({ controlIcon: () => '<:pinetrain:1400823744760905730>' }, 'pinetrain'),
+    ).toBe('<:pinetrain:1400823744760905730>');
+    expect(customIconText(NO_ICONS, 'pinetrain')).toBeUndefined();
+    expect(customIconText({ controlIcon: () => '🚆' }, 'pinetrain')).toBeUndefined();
     expect(statusIcon({ controlIcon: () => '🦶' }, 'coming')).toBe('🏃');
   });
 
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 1c477f8b792d589055d7e7614b6a2edb0c5c6aed..e63148120c1469d6ec0fe06f21a49e84dc3f9a8c 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -210,8 +210,17 @@ export function statusButton(
  * nothing is refused, unlike a button).
  */
 function iconText(icons: ControlIcons, name: ControlIconName, plain: string): string {
+  return customIconText(icons, name) ?? plain;
+}
+
+/**
+ * The application's emoji named `name` as message text (`<:pinetrain:…>`), where it has one;
+ * undefined else (none uploaded, a character): by the resolver the controls' icons use (8D-H), so
+ * that text marked with it (plan 8M-11A: the train before a train's name) reads as before without.
+ */
+export function customIconText(icons: ControlIcons, name: ControlIconName): string | undefined {
   const custom = icons.controlIcon?.(name) ?? '';
-  return CUSTOM_EMOJI.test(custom) ? custom : plain;
+  return CUSTOM_EMOJI.test(custom) ? custom : undefined;
 }
 
 /** The icon a post's line of a status starts with: that of its button (`statusButton`). */
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index 52f977123320e017dd80f0b571664d0e3d03c8b5..b0188f8e621c68fe3a6ed3e5cd3ba15add52ab23 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -461,6 +461,26 @@ describe('renderSummary with trains', () => {
     ]);
   });
 
+  // Plan 8M-11A (Matt's answers): the train emoji before a train's name, once the application has
+  // it; without it the lines read as before.
+  it("puts the application's train emoji before each train, and nothing while it has none", () => {
+    const today = train(1);
+    const later = train(2, {}, { start: PARTY_NOW + 3 * 24 * HOUR });
+    const mark = '<:pinetrain:1400823744760905730>';
+    const marked = renderSummary([], PARTY_NOW, [], [today, later], [], {
+      zone: 'America/New_York',
+      trainMark: mark,
+    });
+    expect(linesUnder(marked, '**Trains**')).toEqual([
+      `${mark} ${link(today)} · no route yet · no time set · 1 trainer`,
+    ]);
+    expect(textDisplays(marked).join(' ')).toContain(`${mark} ${link(later)}`);
+    const plainLines = renderSummary([], PARTY_NOW, [], [today], [], { zone: 'America/New_York' });
+    expect(linesUnder(plainLines, '**Trains**')).toEqual([
+      `${link(today)} · no route yet · no time set · 1 trainer`,
+    ]);
+  });
+
   it('leaves out a train whose end has passed or that has ended, and names one without a post', () => {
     const over = train(1, {}, { end: PARTY_NOW - MINUTE });
     const ended = { ...train(2), party: endParty(train(2).party) };
diff --git a/src/render/summary.ts b/src/render/summary.ts
index be8157ab0bd38133eeeb96c1ca401abbffed4d7f..d5cf9296bb523acd85a965e9e325dfd629915f7a 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -190,6 +190,17 @@ export interface SummaryMore {
    * under Coming up (`isToday`). Without it everything is today's.
    */
   zone?: string;
+  /**
+   * The application's train emoji as message text (plan 8M-11A, Matt's answers: `pinetrain`,
+   * `customIconText`), put before each train's name; none while the application lacks it, and the
+   * lines read as before.
+   */
+  trainMark?: string | undefined;
+}
+
+/** A train's name in a list after its mark, where there is one (plan 8M-11A). */
+function marked(mark: string | undefined, name: string): string {
+  return mark === undefined ? name : `${mark} ${name}`;
 }
 
 /**
@@ -278,7 +289,11 @@ function trainNaming(party: TrainParty, title: string): { kind: string; lead: st
 export const TRAINS_HEADING = '**Trains**';
 
 /** Where a train is: at a gym, before its route, or through with it. */
-function trainLine({ party, title, at, copyUrl }: ListedTrain, now: number): string {
+function trainLine(
+  { party, title, at, copyUrl }: ListedTrain,
+  now: number,
+  mark: string | undefined,
+): string {
   const where =
     party.train.route.length === 0
       ? 'no route yet'
@@ -289,7 +304,7 @@ function trainLine({ party, title, at, copyUrl }: ListedTrain, now: number): str
   const kind = party.train.kind === 'raid' ? '' : ` · ${TRAIN_KIND_WORDS[party.train.kind]}`;
   const post =
     copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`;
-  return `${post}${kind} · ${where} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
+  return `${marked(mark, post)}${kind} · ${where} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
 }
 
 /** The timed parties of a list that are not over, by their start, then as they were made. */
@@ -393,7 +408,7 @@ export function renderSummary(
   maxBattles: readonly ListedMax[] = [],
   more: SummaryMore = {},
 ): V2Message {
-  const { zone } = more;
+  const { zone, trainMark } = more;
   // Today's, by the one rule of the board (plan 8R-9, B8); everything without a zone.
   const today = (party: RaidParty | TimedParty): boolean =>
     zone === undefined || isToday(party, now, zone);
@@ -427,7 +442,12 @@ export function renderSummary(
       .filter(({ party }) => !today(party))
       .map(({ party, title }) => {
         const { kind, lead } = trainNaming(party, title);
-        return laterLine(kind, `${lead}${postOf(party, title)}`, startOf(party), party);
+        return laterLine(
+          kind,
+          marked(trainMark, `${lead}${postOf(party, title)}`),
+          startOf(party),
+          party,
+        );
       }),
     ...allPassing
       .filter(({ party }) => !today(party))
@@ -437,7 +457,7 @@ export function renderSummary(
           copyUrl === undefined ? postOf(party, title) : `[${linkTextOf(title)}](<${copyUrl}>)`;
         return laterLine(
           kind === '' ? 'Passing through' : `${kind} passing through`,
-          `${lead}${post}`,
+          marked(trainMark, `${lead}${post}`),
           startOf(party),
           party,
         );
@@ -493,12 +513,12 @@ export function renderSummary(
     { heading: MAX_BATTLES_HEADING, lines: maxOn.map((battle) => maxLine(battle)), group: 'today' },
     {
       heading: TRAINS_HEADING,
-      lines: trainsToday.map((train) => trainLine(train, now)),
+      lines: trainsToday.map((train) => trainLine(train, now, trainMark)),
       group: 'today',
     },
     {
       heading: PASSING_HEADING,
-      lines: passingToday.map((train) => trainLine(train, now)),
+      lines: passingToday.map((train) => trainLine(train, now, trainMark)),
       group: 'today',
     },
     {
diff --git a/src/services/notify-service.parties.test.ts b/src/services/notify-service.parties.test.ts
index 942e76aabb0bf72dd466efea41076ffec0a9cdc5..0e283174871bb869dc0000e1fb74bf1ab75410e9 100644
--- a/src/services/notify-service.parties.test.ts
+++ b/src/services/notify-service.parties.test.ts
@@ -76,6 +76,27 @@ describe('NotifyService: a train is made', () => {
     });
   });
 
+  // Plan 8M-11A (Matt's answers): the application's train emoji before the train's name, once it
+  // has it; the brief reads as before without (the test above).
+  it("puts the application's train emoji before the train's name in the brief, and nowhere else", async () => {
+    const newTrains = new MemoryNewTrains();
+    await newTrains.set(ALICE, '412345678901234567', true, 1);
+    const mark = '<:pinetrain:1400823744760905730>';
+    const made = await createdTrain(
+      { creator: { name: 'Rhea' } },
+      { appEmoji: { get: (name) => (name === 'pinetrain' ? mark : undefined) } },
+      { newTrains },
+    );
+    await made.notify.flush();
+    const [message] = made.dms.to(ALICE);
+    expect(dmBrief(message)[0]).toBe(`${mark} **Raid Train: Saturday legendaries**`);
+    expect(told(made, ALICE)[0]?.[0]).toBe(
+      `A new train has been announced in <#${WEST_CHANNEL}> by **Rhea**.`,
+    );
+    // Not on the post, nor its buttons: the train's own post is as before.
+    expect(JSON.stringify(made.gateway.posts.get(made.postId)?.message)).not.toContain('pinetrain');
+  });
+
   it('does not name a maker who chose not to be named, and does not tell them either', async () => {
     const newTrains = new MemoryNewTrains();
     for (const id of [ALICE, REPORTER]) await newTrains.set(id, '412345678901234567', true, 1);
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index f94c05b269f36aac7c7d87e05b4753f216e36e88..859186adad22706f7fc29623d623afeee35d0044 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -229,6 +229,11 @@ export interface NotifyServiceOptions {
     placeOf?(party: MeetupParty): MeetupPlace | null;
     /** A max battle's spot as its post shows it now (`PartyService.spotOf`); else as named. */
     spotOf?(party: MaxParty): MaxSpot;
+    /**
+     * The application's train emoji as message text (`PartyService.trainMark`, plan 8M-11A), put
+     * before the train's name in a new train's DM; none while the application lacks it.
+     */
+    trainMark?(): string | undefined;
   };
   wants: Pick<WantStorage, 'wanting'>;
   /**
@@ -671,7 +676,7 @@ export class NotifyService implements PartyNotifier {
         reasonsOf: () => [reason],
       }),
       message: (guildId, reasons) => {
-        brief ??= { made: this.briefOf(posts, party) };
+        brief ??= { made: markedTrain(this.briefOf(posts, party), posts.trainMark?.()) };
         const region = party.regionId === null ? undefined : regions.byId(party.regionId);
         return notifyDm(
           {
@@ -1662,3 +1667,16 @@ export class NotifyService implements PartyNotifier {
     while (this.background.size > 0) await Promise.all(this.background);
   }
 }
+
+/**
+ * A new train's brief with the application's train emoji before the train's name, its first line
+ * (plan 8M-11A, Matt's answers); as it was where there is no mark.
+ */
+function markedTrain(
+  brief: PartyBrief | undefined,
+  mark: string | undefined,
+): PartyBrief | undefined {
+  if (brief === undefined || mark === undefined) return brief;
+  const [name, ...rest] = brief.lines;
+  return name === undefined ? brief : { ...brief, lines: [`${mark} ${name}`, ...rest] };
+}
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index 0fe969aad433700901c586f58719a9694b3d1371..4c9faf254ec24190692987c426f11c9c7010ef18 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -215,6 +215,25 @@ describe('PartyService: the post of a train', () => {
   });
 });
 
+describe("PartyService: the train's emoji in the summary (plan 8M-11A)", () => {
+  it("marks a train's line with the application's train emoji once it has it, as before without", async () => {
+    const mark = '<:pinetrain:1400823744760905730>';
+    let uploaded = false;
+    const made = await createdTrain(
+      { route: [4, 1] },
+      { appEmoji: { get: (name) => (uploaded && name === 'pinetrain' ? mark : undefined) } },
+    );
+    const line = () => textDisplays(made.service.summaryMessage(1))[1]?.split('\n')[1];
+    expect(line()).toBe(
+      `<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
+    );
+    uploaded = true;
+    expect(line()).toBe(
+      `${mark} <#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
+    );
+  });
+});
+
 describe('PartyService: a train passing through another region (plan 8X-G)', () => {
   it('is listed in the summary of a region it stops in, linked to its copy there', async () => {
     // Gym 4 lies in West, gym 7 in East: a West train that stops in East.
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 263c1951062990ddd628508613bb4b7e97dfd439..04d62273ac11895300ada7549ca533703c1445c6 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -112,6 +112,7 @@ import {
   type RaidPostView,
 } from '../render/raid-post.js';
 import { summaryRefusedWords } from '../render/activity.js';
+import { customIconText } from '../render/party-controls.js';
 import { postLink } from '../render/notify-dm.js';
 import { nextLocalMidnight } from '../domain/time/local-day.js';
 import {
@@ -3341,9 +3342,20 @@ export class PartyService {
       stops: region === undefined ? undefined : this.stopsLine(region),
       stopsBelow: where === 'board',
       zone: this.options.settings.timezone,
+      trainMark: this.trainMark(),
     });
   }
 
+  /**
+   * The application's train emoji as message text (plan 8M-11A, Matt's answers: `pinetrain`
+   * before a train's name in the summary and the new-train DMs), by the resolver of the controls'
+   * icons (`customIconText`); undefined while the application lacks it, and the lines read as
+   * before.
+   */
+  trainMark(): string | undefined {
+    return customIconText({ controlIcon: (name) => this.options.appEmoji?.get(name) }, 'pinetrain');
+  }
+
   /**
    * The trains of other regions of the region's server with a stop in it (plan 8X-G; as their
    * copies go, `stopRegionsInGuild`), each linked to its copy in the region's channel where it has
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 6cd9fce70331793261235d71f8f5379a27697658..bfae04f387fb6631b4435b11d82a8c6f43b47bad 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -792,16 +792,21 @@ body.editing-regions #map {
   height: 100%;
 }
 
-.report-icon.shape-max {
-  color: var(--tier-dynamax);
-}
-
+/* Pine's train has no outline in either theme (Matt, 2026-10-28). */
 .report-icon.shape-train {
   color: var(--train);
+  filter: none;
 }
 
-.report-icon.shape-meetup {
-  color: var(--meetup);
+/*
+ * In dark, no outline on the masks and the white pictures (plan 8M-11A, S14; Matt: the light halo
+ * blew them out).
+ */
+@media (prefers-color-scheme: dark) {
+  .report-icon.mask,
+  .report-icon.light {
+    filter: none;
+  }
 }
 
 @media (max-width: 767px) {
@@ -1623,6 +1628,29 @@ path.highlighted {
   -webkit-mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Quests/QuestSymbol.png');
 }
 
+/*
+ * Plan 8M-11A (S14), as `REPORT_ICONS` names them: the game's Dynamax map icon, kept in Pine and
+ * served at `/icons/` (the build leaves the address as it is); Campfire's one-color Poké Ball; the
+ * game's calendar, Campfire's meetup icon.
+ */
+.report-icon.mask-max {
+  color: var(--tier-dynamax);
+  mask-image: url('/icons/dynamax.png');
+  -webkit-mask-image: url('/icons/dynamax.png');
+}
+
+.report-icon.mask-spawn {
+  color: var(--ball);
+  mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Campfire/Menu%20Icons/pokeball.53b7f974309c231f1fe98c2a66de6e91.svg');
+  -webkit-mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Campfire/Menu%20Icons/pokeball.53b7f974309c231f1fe98c2a66de6e91.svg');
+}
+
+.report-icon.mask-meetup {
+  color: var(--meetup);
+  mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Menu%20Icons/calendar_icon.png');
+  -webkit-mask-image: url('https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Menu%20Icons/calendar_icon.png');
+}
+
 .chip[data-layer='research'] .dot {
   background: var(--research);
 }
diff --git a/src/web/client/report-icons.ts b/src/web/client/report-icons.ts
index 7afa9cbb37f7f8ec92aefd82d178448d247a152a..6ac2a416ad56bbe8a6981299fa814ecb0ba03ee9 100644
--- a/src/web/client/report-icons.ts
+++ b/src/web/client/report-icons.ts
@@ -1,24 +1,28 @@
 /**
  * The icons of the Report button's menu (plan 8M-9A; Matt's notes of 2026-10-25, follow-ups "From
- * Phase 8M-7"): the game's own where one fits, outlined to read on any background (a
- * `drop-shadow` of `theme.css`'s values, `map.css`), else Pine's own drawing. The game's pictures
- * are PokeMiners' pogo_assets at one pinned commit, on raw.githubusercontent.com, an origin the
- * page loads pictures from already (`pictureOrigins`: the stops' `ENCOUNTER_PICTURE`), so the
- * Content Security Policy is unchanged; `report-icons.test.ts` holds every address to that. Pine's
- * own are paths of a 24-pixel square, drawn in the color of what they stand for (`currentColor`).
+ * Phase 8M-7"; Matt's choice of 2026-10-28, plan 8M-11A S14): the game's own where it has one,
+ * Pine's own train otherwise, outlined to read on any background (a `drop-shadow` of `theme.css`'s
+ * values, `map.css`), except in dark on the masks, the train and the light pictures, which the
+ * light halo blew out. The game's pictures are PokeMiners' pogo_assets at one pinned commit, on
+ * raw.githubusercontent.com, an origin the page loads pictures from already (`pictureOrigins`: the
+ * stops' `ENCOUNTER_PICTURE`), or kept in Pine and served by it (`/icons/`, `'self'`), so the
+ * Content Security Policy is unchanged; `report-icons.test.ts` holds every address to that.
  *
  * - Raid: the game's raid icon (`Images/Raids/ic_raid_small.png`, the picture the screenshot
- *   reader's tier heads were matched against).
+ *   reader's tier heads were matched against), white: no outline in dark (`light`).
+ * - Max battle: the game's Dynamax map icon (the Pokémon GO wiki's `File:Mp-Icon Dynamax.png`,
+ *   kept as `pictures/icons/dynamax.png`, served at `/icons/dynamax.png`), a mask tinted
+ *   `--tier-dynamax`.
  * - Field research (plan 8M-9B, B17): the game's quest symbol (`Images/Quests/QuestSymbol.png`,
- *   white on clear), as a mask tinted `--research`.
+ *   white on clear), a mask tinted `--research`.
  * - Team GO Rocket (B17): the game's Team GO Rocket "R" (`Images/Rocket/teamrocket_r.png`), also
  *   the marker of a stop with a grunt (goal 2).
- * - Wild spawn: the game's Poké Ball (`Images/Items/pokeball_sprite.png`).
- * - Max battle: Pine's own burst, until Matt picks the game's Dynamax icon by hand (it is not in
- *   pogo_assets; the official map's bundle and the Pokémon GO wiki have it, which are never fetched
- *   by a script): a follow-up.
- * - Train: Pine's own engine (the game's Routes are something else).
- * - Meetup: Pine's own two people (the game has no meetup icon; Campfire's is Niantic's app's).
+ * - Wild spawn: Campfire's one-color Poké Ball (`Images/Campfire/Menu Icons/pokeball.<hash>.svg`),
+ *   a mask in Poké Ball red, white in dark (`--ball`).
+ * - Train: Pine's own, C3b (Matt, 2026-10-28): a low, solid two-car high-speed train facing right,
+ *   its windows cut out, over a line of three stations; a drawing of 48 units in `--train`.
+ * - Meetup: the game's calendar with six dots (`Images/Menu Icons/calendar_icon.png`, Campfire's
+ *   meetup icon), a mask tinted `--meetup`.
  *
  * pogo_assets carries no license of its own: they are the game's files, used as Pine's other game
  * pictures are (raid eggs, type and weather icons).
@@ -28,46 +32,93 @@
 export const POGO_ASSETS =
   'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';
 
+/** Where Pine serves the game's pictures it keeps itself (`pictures/icons/`, plan 8M-11A). */
+export const ICON_PATH = '/icons/';
+
 /** What can be reported from the Report button (8M-9B adds research and Team GO Rocket). */
 export type ReportKindId = 'raid' | 'max' | 'research' | 'rocket' | 'spawn' | 'train' | 'meetup';
 
+/** An element of a drawing of Pine's own: its tag, its attributes, what is in it. */
+export interface ShapeElement {
+  tag: 'g' | 'path' | 'circle';
+  attributes: Readonly<Record<string, string>>;
+  children?: readonly ShapeElement[];
+}
+
 /**
- * An icon: a picture by its address; a picture whose shape is drawn in the color of what it stands
- * for (`mask`: a CSS mask over `currentColor`, plan 8M-9B, B17: the game's white quest symbol
- * tinted `--research`; mask pictures are fetched with CORS, which raw.githubusercontent.com
- * answers with `*`); or a drawing of Pine's own (its paths, `currentColor`).
+ * An icon: a picture by its address (`light`: white, drawn without the outline in dark); a picture
+ * whose shape is drawn in the color of what it stands for (`mask`: a CSS mask over
+ * `currentColor`, plan 8M-9B, B17; mask pictures are fetched with CORS, which
+ * raw.githubusercontent.com answers with `*`, and Pine's own are of its origin); or a drawing of
+ * Pine's own, whole (plan 8M-11A: its view box, the attributes of its `svg`, its elements), so
+ * that strokes and holes are kept.
  */
 export type ReportIcon =
-  | { kind: 'picture'; src: string }
+  | { kind: 'picture'; src: string; light?: true }
   | { kind: 'mask'; name: string; src: string }
-  | { kind: 'shape'; name: string; paths: readonly string[] };
+  | {
+      kind: 'shape';
+      name: string;
+      viewBox: string;
+      attributes: Readonly<Record<string, string>>;
+      elements: readonly ShapeElement[];
+    };
 
-const picture = (path: string): ReportIcon => ({ kind: 'picture', src: `${POGO_ASSETS}${path}` });
+const SOLID = { fill: 'currentColor', stroke: 'none' } as const;
 
-export const REPORT_ICONS: Readonly<Record<ReportKindId, ReportIcon>> = {
-  raid: picture('Raids/ic_raid_small.png'),
-  max: {
-    kind: 'shape',
-    name: 'max',
-    paths: ['M12 1l2.6 6.1L21 6l-3.6 5.4L22 16l-6.4-.4L12 23l-3.6-7.4L2 16l4.6-4.6L3 6l6.4 1.1z'],
+/** The train C3b of the design (`2026-10-28-web-fix-pass-design.md`, S14), as given there. */
+const TRAIN_C3B: readonly ShapeElement[] = [
+  {
+    tag: 'g',
+    attributes: { transform: 'translate(0 -4)' },
+    children: [
+      {
+        tag: 'path',
+        attributes: {
+          'fill-rule': 'evenodd',
+          ...SOLID,
+          d: 'M1 19h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H1zM3.5 24h5.5v4H3.5z',
+        },
+      },
+      { tag: 'path', attributes: { d: 'M12.5 28h3', 'stroke-width': '3' } },
+      {
+        tag: 'path',
+        attributes: {
+          'fill-rule': 'evenodd',
+          ...SOLID,
+          d: 'M15 33V20.5a1.5 1.5 0 0 1 1.5-1.5H30c8 0 13.5 4 16.2 8.6a3.8 3.8 0 0 1-3.4 5.4zM19.5 24h8v4h-8zM32.5 22.6c3.5.8 6.6 2.4 8.4 4.4h-8.4z',
+        },
+      },
+      { tag: 'path', attributes: { d: 'M3 40h42', 'stroke-width': '2.5' } },
+      { tag: 'circle', attributes: { cx: '10', cy: '40', r: '3.2', ...SOLID } },
+      { tag: 'circle', attributes: { cx: '24', cy: '40', r: '3.2', ...SOLID } },
+      { tag: 'circle', attributes: { cx: '38', cy: '40', r: '3.2', ...SOLID } },
+    ],
   },
+];
+
+export const REPORT_ICONS: Readonly<Record<ReportKindId, ReportIcon>> = {
+  raid: { kind: 'picture', src: `${POGO_ASSETS}Raids/ic_raid_small.png`, light: true },
+  max: { kind: 'mask', name: 'max', src: `${ICON_PATH}dynamax.png` },
   research: { kind: 'mask', name: 'research', src: `${POGO_ASSETS}Quests/QuestSymbol.png` },
-  rocket: picture('Rocket/teamrocket_r.png'),
-  spawn: picture('Items/pokeball_sprite.png'),
+  rocket: { kind: 'picture', src: `${POGO_ASSETS}Rocket/teamrocket_r.png` },
+  spawn: {
+    kind: 'mask',
+    name: 'spawn',
+    src: `${POGO_ASSETS}Campfire/Menu%20Icons/pokeball.53b7f974309c231f1fe98c2a66de6e91.svg`,
+  },
   train: {
     kind: 'shape',
     name: 'train',
-    paths: [
-      'M6 3h12a2 2 0 0 1 2 2v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM7 6v5h10V6zM8.5 13.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm7 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
-      'M8 19h2l-1.5 3h-2zM14 19h2l1.5 3h-2z',
-    ],
-  },
-  meetup: {
-    kind: 'shape',
-    name: 'meetup',
-    paths: [
-      'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6v1H2z',
-      'M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm1 2c2.5.4 4 2.3 4 4.5V20h-4.3c-.2-2.6-1.2-4.6-2.9-5.9A6.6 6.6 0 0 1 18 13z',
-    ],
+    viewBox: '0 0 48 48',
+    attributes: {
+      fill: 'none',
+      stroke: 'currentColor',
+      'stroke-width': '4',
+      'stroke-linecap': 'round',
+      'stroke-linejoin': 'round',
+    },
+    elements: TRAIN_C3B,
   },
+  meetup: { kind: 'mask', name: 'meetup', src: `${POGO_ASSETS}Menu%20Icons/calendar_icon.png` },
 };
diff --git a/src/web/client/report-menu.test.ts b/src/web/client/report-menu.test.ts
index 7dc16dd7ae6b2601d852cca3bb72fed812581fb4..9977333e4dc6b369cda15f98e02761d486e7154f 100644
--- a/src/web/client/report-menu.test.ts
+++ b/src/web/client/report-menu.test.ts
@@ -73,18 +73,20 @@ describe("the Report button's step 1 (plan 8M-9A)", () => {
     expect(tagged(menu, 'img').map((img) => img.attributes?.src)).toEqual([
       REPORT_ICONS.raid.kind === 'picture' ? REPORT_ICONS.raid.src : '',
       REPORT_ICONS.rocket.kind === 'picture' ? REPORT_ICONS.rocket.src : '',
-      REPORT_ICONS.spawn.kind === 'picture' ? REPORT_ICONS.spawn.src : '',
     ]);
+    // Plan 8M-11A (S14): the white raid head drawn without the outline in dark.
+    expect(tagged(menu, 'img')[0]?.className).toBe('report-icon light');
     expect(
       tagged(menu, 'span')
         .filter((span) => span.attributes?.['data-shape'] !== undefined)
         .map((span) => span.attributes?.['data-shape']),
-    ).toEqual(['max', 'train', 'meetup']);
-    // The game's quest symbol as a mask in research's color (plan 8M-9B, B17).
+    ).toEqual(['train']);
+    // The game's pictures as masks in the color of what they stand for (plan 8M-9B, B17; plan
+    // 8M-11A, S14: the Dynamax icon, Campfire's Poké Ball and the calendar).
     expect(
       tagged(menu, 'span')
         .filter((span) => span.attributes?.['data-mask'] !== undefined)
         .map((span) => span.attributes?.['data-mask']),
-    ).toEqual(['research']);
+    ).toEqual(['max', 'research', 'spawn', 'meetup']);
   });
 });
diff --git a/src/web/client/report-menu.ts b/src/web/client/report-menu.ts
index fe76cf7709c6a603af4024624f230273b0692c86..731ae5786100e509261468f3ac0c7c651de1c60e 100644
--- a/src/web/client/report-menu.ts
+++ b/src/web/client/report-menu.ts
@@ -79,7 +79,8 @@ export function iconNode(icon: ReportIcon): PageNode {
     case 'picture':
       return {
         tag: 'img',
-        className: 'report-icon',
+        // A white picture (the raid head) has no outline in dark (plan 8M-11A, S14: `map.css`).
+        className: icon.light === true ? 'report-icon light' : 'report-icon',
         attributes: { src: icon.src, alt: '', draggable: 'false' },
       };
     case 'mask':
diff --git a/src/web/client/report-ui.ts b/src/web/client/report-ui.ts
index b125b585b4051cc723158e1f6746548f8ecb7ea7..41e0446913b11b7ccd2739e0c4f729a46633d26b 100644
--- a/src/web/client/report-ui.ts
+++ b/src/web/client/report-ui.ts
@@ -17,7 +17,12 @@ import {
   type NearPlace,
   type Nearest,
 } from './report-flow.js';
-import { REPORT_ICONS, type ReportIcon, type ReportKindId } from './report-icons.js';
+import {
+  REPORT_ICONS,
+  type ReportIcon,
+  type ReportKindId,
+  type ShapeElement,
+} from './report-icons.js';
 import { REPORT_KINDS, reportMenuNode, type ReportKind, type ReportPick } from './report-menu.js';
 import { pressedWhere } from './spawn-forms.js';
 import { newTrainButton } from './train-forms.js';
@@ -533,18 +538,24 @@ export interface ReportUiDeps extends Omit<
 
 const SVG = 'http://www.w3.org/2000/svg';
 
-/** Pine's own icon as SVG of ours in the color of what it stands for (`currentColor`). */
+/** An element of Pine's own drawing as SVG, with what is in it. */
+function shapeElement(element: ShapeElement): SVGElement {
+  const made = document.createElementNS(SVG, element.tag);
+  for (const [name, value] of Object.entries(element.attributes)) made.setAttribute(name, value);
+  for (const child of element.children ?? []) made.append(shapeElement(child));
+  return made;
+}
+
+/**
+ * Pine's own icon as SVG of ours, whole (plan 8M-11A: its view box, its attributes, its elements,
+ * strokes and holes kept), in the color of what it stands for (`currentColor`).
+ */
 function shapeOf(icon: Extract<ReportIcon, { kind: 'shape' }>): SVGSVGElement {
   const svg = document.createElementNS(SVG, 'svg');
-  svg.setAttribute('viewBox', '0 0 24 24');
+  svg.setAttribute('viewBox', icon.viewBox);
+  for (const [name, value] of Object.entries(icon.attributes)) svg.setAttribute(name, value);
   svg.setAttribute('aria-hidden', 'true');
-  for (const d of icon.paths) {
-    const path = document.createElementNS(SVG, 'path');
-    path.setAttribute('d', d);
-    path.setAttribute('fill', 'currentColor');
-    path.setAttribute('fill-rule', 'evenodd');
-    svg.append(path);
-  }
+  for (const element of icon.elements) svg.append(shapeElement(element));
   return svg;
 }
 
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 5b17e17e232b2da45d90f0fe18233972c0bf2c57..e20804a81044f19e98799ca96ca7dd1b6eed2a70 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -117,6 +117,8 @@
   --tier-shadow: #4a235a;
   /* A max battle's ring (plan 8M-9A): Dynamax and Gigantamax. */
   --tier-dynamax: #c2185b;
+  /* The Report menu's Poké Ball (plan 8M-11A, S14): Poké Ball red, white in dark (Matt). */
+  --ball: #d32f2f;
   --tier-gigantamax: #b71c1c;
   /* The outline of the Report menu's icons (plan 8M-9A), to read on any background. */
   --icon-outline: #00000099;
@@ -244,6 +246,7 @@
     --tier-elite: #e59e2c;
     --tier-shadow: #9b59b6;
     --tier-dynamax: #f06292;
+    --ball: #ffffff;
     --tier-gigantamax: #ef5350;
     --icon-outline: #ffffffb3;
     --going: #2d9d55;
diff --git a/src/web/report-icons.test.ts b/src/web/report-icons.test.ts
index cc854ba510b18d6a78dfc1eaf8dd08f5c26e43fa..a553ff09259171bc949eb5129bd8c7ff953400f6 100644
--- a/src/web/report-icons.test.ts
+++ b/src/web/report-icons.test.ts
@@ -1,7 +1,8 @@
 import { readFileSync } from 'node:fs';
 import path from 'node:path';
 import { describe, expect, it } from 'vitest';
-import { REPORT_ICONS } from './client/report-icons.js';
+import { ICON_PATH, REPORT_ICONS } from './client/report-icons.js';
+import { ICON_PATH as SERVED_AT } from './server.js';
 import { pictureOrigins } from './headers.js';
 
 /**
@@ -11,32 +12,55 @@ import { pictureOrigins } from './headers.js';
  * `src/web/client/`, since the policy's origins are the server's.
  */
 describe("the Report menu's icons", () => {
-  it('are pinned to a commit of pogo_assets on an origin the page may load, or drawn by Pine', () => {
+  it("are pinned to a commit of pogo_assets on an origin the page may load, Pine's own, or drawn by Pine", () => {
     const origins = pictureOrigins('https://pine.example');
     for (const [kind, icon] of Object.entries(REPORT_ICONS)) {
       if (icon.kind === 'shape') {
-        expect(icon.paths.length, kind).toBeGreaterThan(0);
+        expect(icon.elements.length, kind).toBeGreaterThan(0);
+        continue;
+      }
+      // Pine's own (plan 8M-11A: the game's Dynamax icon, kept as `pictures/icons/`), of the
+      // page's own origin: the policy's `'self'`.
+      if (icon.src.startsWith('/')) {
+        expect(icon.src, kind).toMatch(/^\/icons\/[\w-]+\.png$/u);
         continue;
       }
       // A picture, or a picture drawn as a mask (plan 8M-9B, B17).
       expect(icon.src, kind).toMatch(
-        /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/[^?#]+\.png$/u,
+        /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/[^?#]+\.(?:png|svg)$/u,
       );
       expect(origins, kind).toContain(new URL(icon.src).origin);
     }
   });
 
-  it("are the game's raid icon and Poké Ball, and Pine's own max battle, train and meetup", () => {
+  // Plan 8M-11A (S14, Matt 2026-10-28): the game's where it has one, Pine's own train otherwise.
+  it("are the game's raid head, Dynamax icon, quest symbol, R, Campfire Poké Ball and calendar, and Pine's train", () => {
     expect(
       Object.fromEntries(Object.entries(REPORT_ICONS).map(([kind, icon]) => [kind, icon.kind])),
     ).toEqual({
       raid: 'picture',
-      max: 'shape',
+      max: 'mask',
       research: 'mask',
       rocket: 'picture',
-      spawn: 'picture',
+      spawn: 'mask',
       train: 'shape',
-      meetup: 'shape',
+      meetup: 'mask',
+    });
+    expect(REPORT_ICONS.max).toMatchObject({ src: '/icons/dynamax.png' });
+    expect(ICON_PATH).toBe(SERVED_AT);
+    expect(REPORT_ICONS.spawn).toMatchObject({
+      src: expect.stringMatching(
+        /\/Images\/Campfire\/Menu%20Icons\/pokeball\.53b7f974309c231f1fe98c2a66de6e91\.svg$/u,
+      ) as string,
+    });
+    expect(REPORT_ICONS.meetup).toMatchObject({
+      src: expect.stringMatching(/\/Images\/Menu%20Icons\/calendar_icon\.png$/u) as string,
+    });
+    // The train C3b as the design gives it: its own 48-unit drawing, strokes and holes kept.
+    expect(REPORT_ICONS.train).toMatchObject({
+      kind: 'shape',
+      viewBox: '0 0 48 48',
+      attributes: { fill: 'none', stroke: 'currentColor', 'stroke-width': '4' },
     });
   });
 
@@ -51,13 +75,29 @@ describe("the Report menu's icons", () => {
 
   // Review F5: drawn as a mask wherever the icon is, the popups and phone cards too, by the
   // stylesheet alone (no script sets it): never a solid block.
-  it("draws the quest symbol's mask from the stylesheet, at the pinned address", () => {
+  it("draws every mask from the stylesheet, at its icon's address", () => {
     const css = readFileSync(path.join(import.meta.dirname, 'client', 'map.css'), 'utf8');
-    const rule = /\.report-icon\.mask-research\s*\{([^}]*)\}/u.exec(css)?.[1] ?? '';
-    const { research } = REPORT_ICONS;
-    if (research.kind !== 'mask') throw new Error(research.kind);
-    for (const name of ['mask-image', '-webkit-mask-image']) {
-      expect(rule, name).toContain(`${name}: url('${research.src}')`);
+    for (const icon of Object.values(REPORT_ICONS)) {
+      if (icon.kind !== 'mask') continue;
+      const rule =
+        new RegExp(`\\.report-icon\\.mask-${icon.name}\\s*\\{([^}]*)\\}`, 'u').exec(css)?.[1] ?? '';
+      for (const name of ['mask-image', '-webkit-mask-image']) {
+        expect(rule, `${icon.name} ${name}`).toContain(`${name}: url('${icon.src}')`);
+      }
     }
   });
+
+  // Plan 8M-11A (S14, Matt): in dark, the light halo blew the masks, the train and the white raid
+  // head out: no outline on them there.
+  it('draws no outline in dark on the masks and the light pictures, and none on the train at all', () => {
+    const css = readFileSync(path.join(import.meta.dirname, 'client', 'map.css'), 'utf8');
+    const dark = [...css.matchAll(/@media \(prefers-color-scheme: dark\) \{([^@]*?)\n\}/gu)]
+      .map((match) => match[1] ?? '')
+      .join('\n');
+    expect(dark).toMatch(/\.report-icon\.mask,\s*\.report-icon\.light \{\s*filter: none;/u);
+    // Matt, 2026-10-28 (fix round 1): the train without the halo in light too.
+    const outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/gu, '');
+    expect(outside).toMatch(/\.report-icon\.shape-train \{[^}]*filter: none;/u);
+    expect(REPORT_ICONS.raid).toMatchObject({ kind: 'picture', light: true });
+  });
 });
diff --git a/src/web/server.test.ts b/src/web/server.test.ts
index 946bface59cd4c27d784a26ded1ac3225e7a1548..9212fde43f41966ecc16b8362b52990b8f5b6d22 100644
--- a/src/web/server.test.ts
+++ b/src/web/server.test.ts
@@ -3,6 +3,7 @@ import path from 'node:path';
 import { afterEach, describe, expect, it } from 'vitest';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { webServerWith, type TestWeb } from '../../test/support/web.js';
+import { ICON_FOLDER } from './server.js';
 import { EGG_FOLDER } from '../services/egg-pictures.js';
 
 describe('the web server', () => {
@@ -101,6 +102,21 @@ describe('the web server', () => {
     expect(head.statusCode).toBe(200);
   });
 
+  // Plan 8M-11A (S14): the game's Dynamax icon kept in Pine, for the Report menu's mask.
+  it('serves the icons Pine keeps to anybody, kept long, and nothing else under /icons/', async () => {
+    web = webServerWith();
+    const answer = await web.app.inject({ url: '/icons/dynamax.png' });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toBe('image/png');
+    expect(answer.headers['cache-control']).toBe('public, max-age=2592000');
+    expect(answer.rawPayload.equals(readFileSync(path.join(ICON_FOLDER, 'dynamax.png')))).toBe(
+      true,
+    );
+    for (const url of ['/icons/gigantamax.png', '/icons/', '/icons/..%2Fdynamax.png']) {
+      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
+    }
+  });
+
   it('serves the square pictures of the stops it made to anybody, kept long, and nothing else under /pictures/ (plan 8R-6)', async () => {
     const key = 'ab'.repeat(16);
     const picture = Buffer.from('a square picture');
diff --git a/src/web/server.ts b/src/web/server.ts
index ec0bf2aad69dd6a24ff4d580ef28025668fd46fb..b45c3b1f608090c32df685b3864f4c673b069b56 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -1,4 +1,5 @@
 import { readFile } from 'node:fs/promises';
+import { fileURLToPath } from 'node:url';
 import path from 'node:path';
 import fastifyCookie from '@fastify/cookie';
 import fastifyStatic from '@fastify/static';
@@ -168,6 +169,7 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
     },
   });
   eggRoutes(app);
+  iconRoutes(app);
   pictureRoutes(app, deps.pictures);
   emojiRoutes(app, deps.emoji);
   toolFileRoutes(app, deps);
@@ -209,6 +211,34 @@ function eggRoutes(app: FastifyInstance): void {
   });
 }
 
+/** Where the icons are served: the page's `ICON_PATH` (`report-icons.test.ts` holds the two). */
+export const ICON_PATH = '/icons/';
+
+/** The game's pictures Pine keeps for the map (plan 8M-11A, S14): `pictures/icons/`. */
+export const ICON_FOLDER = fileURLToPath(new URL('../../pictures/icons/', import.meta.url));
+
+/** The pictures of `ICON_FOLDER` the map shows (the Report menu's Dynamax mask), and no other. */
+const ICON_NAMES: ReadonlySet<string> = new Set(['dynamax.png']);
+
+/**
+ * The icons Pine keeps (plan 8M-11A, S14): public, `GET /icons/<name>.png` for `ICON_NAMES` and
+ * nothing else, read once and kept, the eggs' thirty days; the page never loads them from the
+ * wiki, and the Content Security Policy is unchanged (`'self'`). As the eggs (`eggRoutes`).
+ */
+function iconRoutes(app: FastifyInstance): void {
+  const kept = new Map<string, Buffer>();
+  app.get<{ Params: { file: string } }>(`${ICON_PATH}:file`, async (request, reply) => {
+    const { file } = request.params;
+    if (!ICON_NAMES.has(file)) return sendFailure(request, reply, 404);
+    let picture = kept.get(file);
+    if (picture === undefined) {
+      picture = await readFile(path.join(ICON_FOLDER, file));
+      kept.set(file, picture);
+    }
+    return reply.type('image/png').header('cache-control', EGG_CACHE).send(picture);
+  });
+}
+
 /**
  * The pictures of the application's emoji (plan 8M-8A): public, as Discord's CDN has them, `GET
  * /emoji/<id>.png` for an emoji of the application alone (`EmojiPictures`; anything else 404),
````

### Task 8: 8M-11A: docs and the staging checklist

Prototype commit: `3203a397265e22875e4bbe955d4b046fb9b8470e`

docs/architecture/web.md: a section on the fix pass (the draw ticket,
answers in the post's line, the note box, the notice band, the small
fixes, one wording of times, research's held stops and Change task, the
nearest places, the icons and the train emoji, the start log), and the
passages it changed set right (badges, the list's heading and times, the
rings' pane, keepTools, relativeStamp, Meet...'s sentence).
parties-and-posts.md, stop-reports.md and meetup-safety.md: Meet...'s new
sentence and pinetrain, holdsSubject, the start log once.

docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md: two accounts,
a desktop and Matt's phone, a step per finding.

**Files:**

```
 docs/architecture/meetup-safety.md                       |   2 +-
 docs/architecture/parties-and-posts.md                   |   4 ++--
 docs/architecture/stop-reports.md                        |   2 +-
 docs/architecture/web.md                                 |  59 ++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md | 106 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 5 files changed, 162 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3203a397265e22875e4bbe955d4b046fb9b8470e -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md scripts pictures` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11A: docs and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
index 917262ee920be144062abe9003bbec60adca98ce..3a546c26cd7c206aeebda4175027ee0eea994f78 100644
--- a/docs/architecture/meetup-safety.md
+++ b/docs/architecture/meetup-safety.md
@@ -8,7 +8,7 @@ A meetup at a place that might be private is held for a moderator before anythin
 - `MeetupSafety.verdict({ serverId, place, makerId, staff })` (`src/services/meetup-safety.ts`) is the shared check: it reads the block and the ruling from the storage (nothing for staff or while the safety is off), and for a gym its official name and nickname (`MeetupSafetyOptions.gyms`), either of which flags it. `/meetup`'s guard asks it; the making itself goes through `MeetupSafety.make` (below), which plan 8M-5M (meetups from the web map) calls too, and which may end in "sent to the moderators" (`held`) instead of a post.
 - Flagged words: `DEFAULT_FLAGGED_WORDS` (little free library, apartment(s), apts, apt, condo(s), condominium(s), townhome(s), townhouse(s), residence, private, salon, studio, LLC, daycare; not "home of", which public signs say) and `settings.meetupSafety.flaggedWords`, in lower case, each once (`flaggedWordsOf`); a word matches the place's title as a whole word (no letter or digit beside it; the words of a phrase across any white space), whatever the letter case (`flaggedWordIn`; the words of a list are one expression, made once per list). A gym's title is the name its post shows (the nickname first); its other name is checked too.
 - Rulings are kept per server by the place's kind and id (`rulingKeyOf`: a gym's number as text, a Wayspot's Wayfarer id); a pin has none.
-- The safety is on only where `settings.channels.moderation` names a channel (optional, blank unset, without `#`, never a name another channel of `settings.channels` has: the settings refuse it, since the bot posts other things there, the public bot updates among them). Unset: every place is allowed and nothing is stored; the start logs a warning per server (`MeetupSafety.warnAtStart`, also for a server that lacks the channel) and `cutover-check` warns (`moderation` line).
+- The safety is on only where `settings.channels.moderation` names a channel (optional, blank unset, without `#`, never a name another channel of `settings.channels` has: the settings refuse it, since the bot posts other things there, the public bot updates among them). Unset: every place is allowed and nothing is stored; the start logs a warning (`MeetupSafety.warnAtStart`: said once at start since plan 8M-11A, the setting being the instance's; per server for a server that lacks the channel or where the bot may not post in it) and `cutover-check` warns (`moderation` line).
 
 ## `/meetup`
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 404e9da443c9532948bdf5518e7982d286e970c0..66fbab6bf1965845cff7de8e73052e66a02761d5 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -55,8 +55,8 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
 - The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 32 with Move…, Manage… and Split… (plan 8X-G; 31 with Manage train… and Split group…; before 8X-1B, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody should consider moving to another group.", Matt, plan 8X-F) under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
-- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time… (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move…, Manage…, Split… and Route, words only, Group…'s emoji left out on a train: `trains.md`, plan 8X-G). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game’s Select Time icon cropped from a raid screen), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
-- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group in letter order (plan 8X-G, `inLetterOrder`; newest first before), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked; since plan 8X-G the groups in letter order, and marked to start with where they have no size the default group, where Join, +1 and Remote put a newcomer, review r0 A2: an iPhone starts there, Android with group A). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) in letter order (plan 8X-G), then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`). The live map's forms go the dialogs' ways (plan 8M-8B, `web.md`, "The post's controls as forms"): what Group…'s press refuses and offers is `groupMenu` (`src/render/group-dialogs.ts`, with `groupMenuText` and `nothingToChange`), a move's words `movedWords`; Meet…'s refusals `meetRefusalOf` and `meetSubmitRefusal` (`meet-dialog.ts`, Meet… named by the caller: its icon here, words on the map), what it offers `meetChoices`; the words of a group's line and of Meet…'s times are the import-free `group-words.ts` and `meet-words.ts`, so that the page words them alike in the reader's zone.
+- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time… (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move…, Manage…, Split… and Route, words only, Group…'s emoji left out on a train: `trains.md`, plan 8X-G). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game’s Select Time icon cropped from a raid screen; `pinetrain`, Pine's train C3b of plan 8M-11A, is in the same list but never on a button: the summary's lists and the new-train DMs put it before a train's name where the application has it, `PartyService.trainMark` over `customIconText`, and read as before without), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group in letter order (plan 8X-G, `inLetterOrder`; newest first before), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked; since plan 8X-G the groups in letter order, and marked to start with where they have no size the default group, where Join, +1 and Remote put a newcomer, review r0 A2: an iPhone starts there, Android with group A). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) in letter order (plan 8X-G), then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, since plan 8M-11A "Group B has changed since: press ⏰ again." in the shape of Group…'s, the group the dialog was drawn for named (`meetSubmitRefusal(reason, meet, group)`; on the map "press Meet… again", and the map's form closes on it); a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`). The live map's forms go the dialogs' ways (plan 8M-8B, `web.md`, "The post's controls as forms"): what Group…'s press refuses and offers is `groupMenu` (`src/render/group-dialogs.ts`, with `groupMenuText` and `nothingToChange`), a move's words `movedWords`; Meet…'s refusals `meetRefusalOf` and `meetSubmitRefusal` (`meet-dialog.ts`, Meet… named by the caller: its icon here, words on the map), what it offers `meetChoices`; the words of a group's line and of Meet…'s times are the import-free `group-words.ts` and `meet-words.ts`, so that the page words them alike in the reader's zone.
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A sentence that ends with a place's name (a gym, a Power Spot, a stop, a route's stop by its link) ends through `endSentence(text)` (`src/render/text.ts`, plan 8X-F): no period is added where what a reader sees already ends in one (`.`, `!`, `?`; through closing bold, a masked link's address and `plain`'s escapes), so "at **Fire Company Inc.**" never reads "Inc..". A battle at a pin is "at an unlisted power spot" in running text (the DMs' `MaxDmView.pin`, the meeting DM); the label `Unlisted power spot` stays where it is a name (the post, `/where`, the moderators' notice, the map).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index a4ed33e100c43820f875a93250dd1b41c8d2c485..3190acd5086bca05bc8d0b761d1eecfd493c55ff 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -32,7 +32,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 - `StopReportService` (`ctx.stopReports`) reports a version of a task at one to five stops in the period on now (`reportResearch`): since plan 8R-5 each stop as `decideResearch` decides with the stop's row of the period locked (`saveUnless`; "Research rewards reported apart" below), the report it replaces given back; it ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very version in the period; since plan 8R-5 the news carries the reports they replaced, `replaced`, so that the notifier tells a narrowing of a "one of" from a first report). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's version never changes what it is (its id; for Rocket, the id and `madeAt`, plan 8R-4L, review L1: a grunt refined in place keeps its id) (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, refs, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. A `ReportRef` is an id or a version `{ id, madeAt }` (review L1): one refined in place since is `changed`, before whose it is, and nothing of it is taken back (`StopReportStorage.remove(id, serverId, madeAt?)` asks the version again with the row locked); `kept(serverId, id)` gives a report by its id as it is kept now. The hourly upkeep (`PartyScheduler`, `stops`) sweeps the reports that have ended. An ended row of the period that is not yet swept replaces nothing a member saw (review R1, as Rocket's fix F2): `reportResearch` names no `replaced` for it, and the report is news. Where each member last reported is a record of the service's own (`latestToday`, below; review R2): a `BoundedMap` of 5,000 entries (`LAST_REPORTS`) by server and member, `{ lat, lon, madeAt }` of the stop of the member's latest saved report, research (the last stop saved) or Rocket (reported or refined), written by `reportResearch` and `reportRocket` after the save with the saved row's `madeAt` (review S3: a refine in place is written a millisecond after the report it refines, `newerThan`), so by every path (Discord, the map); `reportResearch`'s `already` and `asks` and `reportRocket`'s `already` and `asks` save nothing and write none; a later report by another member at that stop (replaced, refined in place) and staff taking the member's report back leave it as it is; the member's own Take back of the very report recorded (its `madeAt`) forgets the record (review S1: a wrong stop taken back does not anchor the rest of the day, as after a restart), by every path through `takeBack`: `/research remove` and `/rocket remove` (`takeBackAs`), the answers' Take back of `/research report` and `/rocket report`, the map's Take back (`takeBackAs` in `src/web/stop-routes.ts`) and `RocketService`'s undo of a grunt posted nowhere (taken back as its reporter); `restore` (a hideout put back for its reporter, who reported nothing then) writes none. `latestToday(serverId, memberId)` gives the record where its `madeAt` is of today (since `localDayStart`, `src/domain/time/local-day.ts`, the local day in `settings.timezone`), else, after a restart or once forgotten, `StopReportStorage.latestBy(serverId, memberId, since)` over the table as it is (by `madeAt`, the later id of two alike; rows standing, or ended and not yet swept).
 - `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a version of the list (found by reward words too; since plan 8R-5 one choice per reward and "one of", below) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop option's list puts nearby stops first (Matt, 2026-10-27; `researchChoices`, `nearChoices`' `before`): the other stop options picked from the list (`stop`, `stop2`…, any of them for the one being typed, `stop:` too) are its anchors, so of stops that fit alike the nearer comes first, and an empty option lists the PokéStops within `MORE_STOPS_METRES` (2 km) of the nearest of them, nearest first, the stops named left out, 25 at most, each with its distance; typed text or a link in another option is no anchor, and without one an empty option lists nothing. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
 - **One code path with the map** (plan 8R-3; `src/commands/research/research-report.ts`): `reportResearchAs(ctx, serverId, { stops, subject, reporter }, also?)` is the report as the member and the view of its answer's words (`ResearchWordsView`: the region channels whose posts show it, until when, none named in rehearsal mode); `/research report`, "Same task at more stops…" and the map call it. `stopsByKey` names stops by their keys (a titled PokéStop in a region of the server, a stop of Pine's own by `pine-<id>`, each once; the menu's and the map's). `takeBackAs(ctx, serverId, ref, by, staff)` takes a report back by its `ReportRef` (`removed` with `tookBackWords`, `not-yours`, `changed` where it was refined in place since the version asked for, `gone`): `/research remove` by the id it read, `/rocket remove` by the version it read (`{ id, madeAt }`, fix round 2, F6: a report refined meanwhile is `REPORT_CHANGED`), and the map. `reporterNamed` names a reporter (the name shown, else the account's, cut to 100). `NOT_YOUR_REPORT`, `REPORT_CHANGED` and `NOTHING_LEFT` (a Take back that finds nothing) are its words. `researchWords(view, channel)` (`src/render/research.ts`) words the answer with the caller's `ChannelNamer` (`DISCORD_CHANNEL`, `<#id>`, for the commands); `researchAnswer` wraps it with the controls and is the same message as before (an inline snapshot guards it).
-- The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced; since plan 8R-5 the same version is reported already, below), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as` (a pick that found every stop reported already is given back, plan 8R-6), gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
+- The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced; since plan 8R-5 the same version is reported already, below), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period (`holdsSubject` of `src/domain/research/reports.ts`, plan 8M-11A: the same version, for "one of" any version of its task; the map's Add stops… and "Same task at more stops…" leave such stops out by it), five at once; it counts in `/research report`'s window through the throttle's `as` (a pick that found every stop reported already is given back, plan 8R-6), gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
 
 ## Research rewards reported apart (plan 8R-5)
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 362b89d1bac76cb13dee01fa9606576852d9181b..21350d8791da69bc5278646f35273b301d13d420 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -49,9 +49,9 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
 - **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
-- **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12m", "1h 05m" while it runs, "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "egg" or "hatched" where nobody said when, "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
+- **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12 min", "1 h 05" while it runs (`durationWords`' compact form, plan 8M-11A), "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "Egg" or "Hatched" where nobody said when (capitalized since plan 8M-11A, S5; "Ended" too), "ended" by `stageAt`), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
-- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's on · n". A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30m left", "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
+- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's going on · n" (`LIST_HEADING`, plan 8M-11A, S22; the logged-out pane and the pane's `aria-label` too). A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30 min left" by `timeLeft` over `durationWords`, plan 8M-11A; "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free), the one wording of a distance on the map and on Discord (Matt, 2026-10-25; task 7), in the units of `settings.distanceUnits` (per instance, as `timezone`): a short distance never rounded to nothing (the controller's ruling): `imperial` (the default) under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten feet (`520 ft`), else miles to one decimal (`1.3 mi`); `metric` under 100 m to the meter (`2 m`, so that staff's lists of gyms within ten meters keep exact meters), under a kilometer to ten (`440 m`; what would round to 1000 m is `1.0 km`), else kilometers to one decimal. The pages read the units from `data-distance-units` of the map page and of the region editor's (`MapPageData.distanceUnits`, `WebDeps.distanceUnits`; the editor's "more than 490 ft apart" of a sliver too wide to fix is `FIX_REACH_METRES` by `distanceWords`, 8M-7 review fix 8); Discord's words take them from `ctx.config.settings`, through `distanceWords` itself, the one name (round 2): `/gym` move, add, review and import, `/pokestop`, the gym view's nearest gym, `/research`'s "Same task at more stops…" and its pin without a stop, and every threshold they name (`DUPLICATE_METRES`, `PINE_STOP_NEAR_METRES`, `PIN_NEAR_METRES`, `FAR_MOVE_METRES`, `CANDIDATE_METRES`, `DEFAULT_SCAN_MARGIN`), helps included (their `details` functions of the settings). `src/text-distances.test.ts` refuses a unit of distance worded by hand in the string literals of `src/commands`, `src/render`, `src/components` and the web pages' `src/web/client` (review fix 8), as `text-spelling.test.ts` refuses British spelling.
 
 ## The parties on the map (plan 8M-3)
@@ -60,7 +60,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`) and its group (`tierGroup`, `raidTierGroup`, plan 8M-7), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), how many are going (`going`, plan 8M-7: `goingCount`, the lobbies' rule over the whole party), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; since plan 8M-8A the menu is in the member's part under the post, and Group… goes to it for a newcomer to several groups; since plan 8M-8B Group… is the map's form for anybody else, below, "The post's controls as forms"); since plan 8M-8B also `count` (+1 and −1 may be pressed: never while read-only), `asked` (`{ until, word }`, the completion question to the member it asked: `CompletePending` and its `pendingUntil`, the party named by `partyWord`; not while read-only) and `regroup` (Group…'s choices, its refusal, or `{ onlyNewGroup }` where a new group is the only way, review W-1; `regroupOnTheMap`; absent for a party without groups and while read-only); every party's `mayReport` (Report…, for a member who sees its forum on Discord: `PartyViewers` says the forums they cannot see by their roles as `hidden`, review W-7; never while read-only); for a raid also `mayChange`, whether the member may change it on the map: Discord's rule (Matt, plan 8M-8B, X5: anybody in the post may set the hatch, the end and the boss), so anybody the map shows the raid to, which leaves out who is barred from its forum: `!readOnly` (plan 8M-4's `mayChangeRaid`, signed up or staff, is gone). For staff (`PartyViewInput.staff` from the directory's `standing` by `isMapStaff`) the view gives each party's `close` (`{ mayDelete, forum, word }`, staff's Delete…, the party named by `partyWord`: `PartyService.mayDeletePost` through `PartyWebDeps.closing`, the forum named `#name`, `forumOnTheMap`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. The list names nobody (attendees are counts); each party carries `postKey`, the key of its post as last shown (plan 8M-8A, below, "A party's popup is its post"), whose view names attendees, the reporter and the maker exactly as the post does, to the same members (Matt's ruling, 2026-10-25: the map is an extension of Discord, never a contradiction of it). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote), `more` and `less` (plan 8M-8B, `MAP_COUNTS`, no body: the post's +1 and −1, `changeNumber`, a newcomer's +1 signing them up as interested, answered in `moreWords`) and `answer` (plan 8M-8B, `MAP_ANSWER`, body `{ yes }`, required: the completion question's "Yes, done" and "Not yet", `AttendanceService.answer`); any other action 404, a body other than an optional group letter with those three, or other than `{ yes }` with `answer`, 400 (`pressOf`, strict). Since plan 8M-8B `pressStatus` carries +1, −1 and the answer too, so the post's buttons call it for them as the map does. Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `max:<id>` for a max battle at a Power Spot or a pin (plan 8M-9A), `train:<id>`, `route:<id>` for a train's line, `meetup:<id>`). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there (one since plan 8E, which allows one raid per gym of any kind; a standard and an elite raid alike only where both were stored before it), each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the reader's own zone (`clockTime` over `readerZone()`, plan 8M-8A; the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `max:<id>` for a max battle at a Power Spot or a pin (plan 8M-9A), `train:<id>`, `route:<id>` for a train's line, `meetup:<id>`). Raids are one marker per gym (`raidsAtGyms`; since plan 8M-7 the circle of its lead raid, `leadRaid`: "The map's frame" below), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there (one since plan 8E, which allows one raid per gym of any kind; a standard and an elite raid alike only where both were stored before it), each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), and everything in the list of what is on (plan 8M-7, "The map's frame" above), where a raid at a gym the map does not show is named by its `place`, with the address line and Directions a gym's popup has (`raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news that belongs to no party (since plan 8M-11A a press's answer goes to its post's answer line, below), which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the reader's own zone (`clockTime` over `readerZone()`, plan 8M-8A; the day when not today) with a countdown (`countdown`: "in 1 h 05 min" by `durationWords` since plan 8M-11A, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
 ## A party's popup is its post (plan 8M-8A)
 
@@ -100,7 +100,7 @@ Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "Aft
 
 - **The routes** (`postControlRoutes`, `src/web/post-control-routes.ts`): the checks in their order: the per-address limit (one limiter per family) and `postGuard` before a POST's body is read; the session and the body (zod, strict); who writes (`actingOnTheMap`); the party as the store has it (`partyFor`: an active party of this server, else 409 "This has ended."); its forum (`barred` 403, unreachable 503); only then the window its dialog counts in. A form that asks the server before it opens (`GET`, `reader`: `memberOrFailure`, then `partyFor`) counts nothing. Logged as a press: "a party was pressed on the map" with `action` `regroup`, `meet`, `close` or `report`, never a text. Answers are `PressAnswer` (`{ ok, text }`, 200 / 422 / 409), a refusal before the work `{ error }`.
 - **Group…** (`POST …/regroup`, `{ group, stamp, signedUp }`): the list carries its choices (`MapAttendance.regroup`, `regroupOnTheMap` of `src/render/group-dialogs.ts` over `groupMenu`, the press's refusals and ways moved out of the Discord handler, and `groupMenuText`, the dialog's title, text and label over the map's ways): the groups to move to or join by letter and stamp, label, size (`groupSize`) and a battle's meeting time as a moment; a new group is not among them ("Start a new group on Discord →" where Discord would offer it, `newGroup`); `{ onlyNewGroup }` where a new group is the only way (review W-1: nothing to submit, Group… shows the post's link; the link's words are `discordLink`'s, carried on every button that sends to Discord as `data-link`, which the page reads, review N-4); or the refusal (`{ refused }`, said under the post's buttons). A refusal of the move closes the form and the list is asked for again (review W-2: its choices came with the list and may be stale; `formStep`). The move: one use in the window of the post's controls, `joinStamped` with `signedUp` (a member who left meanwhile: "You are no longer signed up: press Group… again."), `movedWords` (shared with the dialog's Submit: "Group B has changed since: press Group… again."). The group's line is `groupLine` of the import-free `src/render/group-words.ts`, the dialog's in the server's zone, the page's in the reader's.
-- **Meet…** (`GET` and `POST …/meet`, X4): the opening refused while `/meet`'s window is full (uncounted) and as the press is (`meetRefusalOf`, moved out of `meet-dialog.ts`'s handler, 422 in its words), else `MapMeet` (`meetOnTheMap` over `meetChoices`, which the dialog draws from too: the group by letter and stamp, the times of `meetTimes` as moments, the group's own, the one chosen to start with). The Submit `{ group, stamp, time | null }`: one use in `/meet`'s window, `meetRefusalOf` again, `setMeetingTime` with the group drawn, `/meet`'s words through `pageWords`; a refusal inside the store in the dialog's words with Meet… named in words (`meetSubmitRefusal(reason, 'Meet…')`; on Discord by its icon). The page names the times in the reader's zone with `meetTimeLabel` of the import-free `src/render/meet-words.ts`; nothing is typed, so no zone hint.
+- **Meet…** (`GET` and `POST …/meet`, X4): the opening refused while `/meet`'s window is full (uncounted) and as the press is (`meetRefusalOf`, moved out of `meet-dialog.ts`'s handler, 422 in its words), else `MapMeet` (`meetOnTheMap` over `meetChoices`, which the dialog draws from too: the group by letter and stamp, the times of `meetTimes` as moments, the group's own, the one chosen to start with). The Submit `{ group, stamp, time | null }`: one use in `/meet`'s window, `meetRefusalOf` again, `setMeetingTime` with the group drawn, `/meet`'s words through `pageWords`; a refusal inside the store in the dialog's words with Meet… named in words (`meetSubmitRefusal(reason, 'Meet…', group)`; on Discord by its icon: since plan 8M-11A "Group B has changed since: press Meet… again.", and the form closes on it as Group…'s does). The page names the times in the reader's zone with `meetTimeLabel` of the import-free `src/render/meet-words.ts`; nothing is typed, so no zone hint.
 - **Staff's Delete…** (`POST …/close`, `{ removal }`, X1): staff by the member fetched fresh (`isMapStaff`; 403 in `requireManagement`'s words, `STAFF_ONLY` of `guards.ts`, uncounted), `CLOSE_THROTTLE` in the window of the controls `pclose`, then `closePartyAs` (`src/commands/parties/delete.ts`: the Submit of `/delete`'s dialog moved out into a function both call, its outcome a kind, `closeWords` its words; the forum named `#name` by `mayNotDeleteIn`). The form's words are the import-free `src/render/removal-words.ts` (`closeTitle`, `closeQuestion`, the choices, `archiveOnlyText`), which `/delete`'s dialog uses too, the party named by the list's `close.word`; "archive only" where `close.mayDelete` is false. After a close the page closes the popup or card that shows the party (`showsParty`, the one rule of which popup or card shows a party, also for drawing a post that came, review N-3; the party the form holds, review W-6: not another one opened meanwhile) and asks for the list.
 - **Report…** (`GET` and `POST …/report`, X2): for a member who sees the party's forum on Discord alone (review W-7, Matt to confirm with C1: a report without the moderators' channel writes a public line into the post; `hidden` 403 on both, as the list leaves `mayReport` out); the opening asks what `/report` asks before its form, uncounted (its window; `refuseReportedBefore`), and answers the form's words (`MapReport`, `reportFormWords`); the Submit `{ reason }` refuses white space alone uncounted (`NO_REASON`), counts once in `/report`'s window, then `reportParty` and `reportAnswer` (a report the moderators could not be told of gives the use back); without the moderators' channel the reason goes into the post, pinging the server's staff roles (`PostWebDeps.staffRoles`, `managementRoleIdsOf` of the client's server).
 - **+1, −1 and the completion question** are presses of `partyRoutes` (above). The question's words are the import-free `src/render/completion-words.ts`, which the question's message on Discord uses too.
@@ -140,7 +140,7 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the route editor again without the controls the member no longer has); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
 - **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`): Move…'s Submit (plan 8M-8C, R1), carrying where the form was drawn and where the move picked leads, as the dialog's custom id and choice carry them; the same checks in the same order, who may being `mayNotMove`, and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as the dialog's Submit counts; then `moveTrainAs` with the surface `post` (the command's words, where the train is now, "I am telling the others."; of a finished route "Move… takes it back to stop 2: …", as the dialog says it), a move drawn where the train no longer is refused in the dialog's words (`movedOnWords`: "The train has moved on since you opened this: " and where it is now, 409 with the train). The old panel's presses `finish`, `reverse`, `at-end` and `kind` (plans 8M-5, 8X-5) answer 404 since plan 8M-8C: Finish, Reverse, the mode and the kind are Manage…'s, as on Discord, and a page of an older bundle gets 404 for them until it is reloaded (`reverseRouteAs`, `setAtEndAs`, `setKindAs`, `MapTrainRights.kind` and the surface `map` are gone). The movement message in the post pings as for any move. Logged "a train was moved on the map". **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
 - **Words:** `pageWords` also writes the bot's masked links as their text (`whereText` links every stop), read in the same one pass from the left as escapes and markdown, so that a bracket a member escaped begins no link.
-- **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, a stop dragged (`StopDrag`, `dropPosition`), reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`; Move…, Manage… and Split… are forms of the post, below, "A train's dialogs as forms"): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's own summary (shown until its post comes, and in its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Move…" (`moves`), "Manage…" (who may move the train, also without a route), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor."; under a post the member's part has whose the conductor role is, "Edit route" and the conductor's buttons (R2), and Route's part the stop list and `ahead` (review C8: "Edit route" once, in the member's part). **Route mode** ("Edit route", and at once after a new train is made by who may arrange it; R3: it stays the side pane's, the stated exception to "forms in place", since a tap on the map closes Leaflet's popup and the phone card covers the map; on a phone the pane is docked under the map, 40% of the screen, `body.form-docked`): the route editor in the side panel box (the stops numbered as stored, the train's marked, and under them what lies ahead, `ahead`, the node and class of Route's, `route-ahead`; branch review B3; for who may arrange it (`may.arrange`) a handle to drag each stop by (plan 8M-8C, R6: pointer events, so a mouse, a pen and a finger alike, no new dependency; the handle `touch-action: none` in `map.css`, the pointer captured by it; the row it would land at marked `drop-target`; a drop is one `/route move` with the route as it was when the drag began, `RouteEditValues.drawn`, and a drop where the stop was or a cancel sends nothing; no drag begins while edits wait or are on their way, `RouteEdits.busy`; the drag follows the pointer that began it only, `StopDrag.follows`, and ends without a move on Escape, when that pointer is lost, `pointercancel` and `lostpointercapture`, and when the editor is drawn anew or route mode ends, review C2, and when an edit begins, a second finger tapping a gym or Power Spot, so that its release queues no move against the route before, branch review B1; the handle is at least 32 by 32 pixels, and near the top or bottom of the side pane, docked on a phone, the list scrolls by itself while a stop is dragged, `edgeScroll` in a frame loop, review C9; the handles are not in the Tab order) and up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, the keyboard's way; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`); a Power Spot of the Power Spots layer tapped (or Enter on a focused one) is added the same way by its key (plan 8M-8C, R5: `places-ui.ts` takes a spot's clicks and Enter as a gym's, `placeClicks` over `gymClicks`, and opens its popup from its own handler, `spotTapped`, `TrainUi.spotClicked`; review C10: Enter on a focused spot adds it and a double tap that route mode took does not zoom; re-review N1: the gyms' and Power Spots' dots are Tab stops, `role="button"` with their names, only while route mode is on, `RouteFocus` (`route-focus.ts`), told by `TrainUiDeps.routeMode` as route mode begins and ends, and a dot drawn meanwhile takes it at once; the hint says "Turn on Power Spots and zoom in to add a Power Spot." while the layer draws none, `placesWanted`, and follows the layer and the zoom without drawing the editor anew, `placesChanged`); a stop on the route already is said under the editor in the words `/route add` refuses it with (`ALREADY_ON_ROUTE`, `src/render/route-words.ts`, which `problemText` says for `already-on-route`: "That stop is on the route already.", review C7; `routeEditBody`) and nothing is sent, and a double click whose clicks route mode took does not zoom the map. The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`); `formControls` also turns "New train", "Edit route", "Move…", "Manage…" and "Split…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps in place (`keepTools`: a box already first is not taken out, only what follows it, so a field of the start form or the route editor keeps the focus); the route editor, drawn anew from each answer, keeps the name typed to save under and the saved route picked (`RouteEditorFilled`; the name is emptied once the route is saved): under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`), the other trains' lines and markers drawn `interactive: false` meanwhile (`clickable`), so that a gym under them stays a stop to click; as route mode starts and ends, the list the page has is drawn anew at once (`TrainUiDeps.redrawn`; the poller draws only a list that changed), so that the train's own line leaves the map with "Edit route" and comes back with Done.
+- **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, a stop dragged (`StopDrag`, `dropPosition`), reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`; Move…, Manage… and Split… are forms of the post, below, "A train's dialogs as forms"): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's own summary (shown until its post comes, and in its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Move…" (`moves`), "Manage…" (who may move the train, also without a route), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor."; under a post the member's part has whose the conductor role is, "Edit route" and the conductor's buttons (R2), and Route's part the stop list and `ahead` (review C8: "Edit route" once, in the member's part). **Route mode** ("Edit route", and at once after a new train is made by who may arrange it; R3: it stays the side pane's, the stated exception to "forms in place", since a tap on the map closes Leaflet's popup and the phone card covers the map; on a phone the pane is docked under the map, 40% of the screen, `body.form-docked`): the route editor in the side panel box (the stops numbered as stored, the train's marked, and under them what lies ahead, `ahead`, the node and class of Route's, `route-ahead`; branch review B3; for who may arrange it (`may.arrange`) a handle to drag each stop by (plan 8M-8C, R6: pointer events, so a mouse, a pen and a finger alike, no new dependency; the handle `touch-action: none` in `map.css`, the pointer captured by it; the row it would land at marked `drop-target`; a drop is one `/route move` with the route as it was when the drag began, `RouteEditValues.drawn`, and a drop where the stop was or a cancel sends nothing; no drag begins while edits wait or are on their way, `RouteEdits.busy`; the drag follows the pointer that began it only, `StopDrag.follows`, and ends without a move on Escape, when that pointer is lost, `pointercancel` and `lostpointercapture`, and when the editor is drawn anew or route mode ends, review C2, and when an edit begins, a second finger tapping a gym or Power Spot, so that its release queues no move against the route before, branch review B1; the handle is at least 32 by 32 pixels, and near the top or bottom of the side pane, docked on a phone, the list scrolls by itself while a stop is dragged, `edgeScroll` in a frame loop, review C9; the handles are not in the Tab order) and up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, the keyboard's way; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`); a Power Spot of the Power Spots layer tapped (or Enter on a focused one) is added the same way by its key (plan 8M-8C, R5: `places-ui.ts` takes a spot's clicks and Enter as a gym's, `placeClicks` over `gymClicks`, and opens its popup from its own handler, `spotTapped`, `TrainUi.spotClicked`; review C10: Enter on a focused spot adds it and a double tap that route mode took does not zoom; re-review N1: the gyms' and Power Spots' dots are Tab stops, `role="button"` with their names, only while route mode is on, `RouteFocus` (`route-focus.ts`), told by `TrainUiDeps.routeMode` as route mode begins and ends, and a dot drawn meanwhile takes it at once; the hint says "Turn on Power Spots and zoom in to add a Power Spot." while the layer draws none, `placesWanted`, and follows the layer and the zoom without drawing the editor anew, `placesChanged`); a stop on the route already is said under the editor in the words `/route add` refuses it with (`ALREADY_ON_ROUTE`, `src/render/route-words.ts`, which `problemText` says for `already-on-route`: "That stop is on the route already.", review C7; `routeEditBody`) and nothing is sent, and a double click whose clicks route mode took does not zoom the map. The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`); `formControls` also turns "New train", "Edit route", "Move…", "Manage…" and "Split…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps in place (`keepTools(panel, wanted)`: the pane's parts in order, a part already in its place never moved or taken out, so a field of the start form or the route editor keeps the focus, and since plan 8M-11A (S11) the list keeps a line's focus until it gives it to the sort); the route editor, drawn anew from each answer, keeps the name typed to save under and the saved route picked (`RouteEditorFilled`; the name is emptied once the route is saved): under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`), the other trains' lines and markers drawn `interactive: false` meanwhile (`clickable`), so that a gym under them stays a stop to click; as route mode starts and ends, the list the page has is drawn anew at once (`TrainUiDeps.redrawn`; the poller draws only a list that changed), so that the train's own line leaves the map with "Edit route" and comes back with Done.
 
 ## Meetups on the map (plan 8M-5M)
 
@@ -150,8 +150,8 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 - **The moderators' post** of a meetup asked for on the map says so: "Asked by **Name** (<@id>) on the map in <#region>" (`MeetupRequestRecord.source`, `map` or null; migration 021 adds `MeetupRequest.source`), before and after a decision, since the post is drawn anew from the row.
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power Spots are never offered here (they are `/api/powerspots`'s, plan 8X-5, for max battles), nor other Wayspots; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
 - **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end; the map asks more, a meetup's text being safety-relevant since plan 8S-1: plan 8M-8B left it so where Matt's ruling of Discord's rule named raids, provisional, C2, Matt to confirm); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
-- **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
-- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power Spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
+- **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeStamp` of `src/render/duration-words.ts` since plan 8M-11A, as Discord's client words its stamps: "in 5 hours", "2 hours ago", "a few seconds ago"; in English, the bot's language), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
+- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on the pane of the rings (`RING_PANE`, `rings`, which the trains' rings share), at 590 since plan 8M-11A (S2): under Leaflet's markers, so that a raid's time badge is drawn over a ring, and over the overlay pane of the gyms' dots), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power Spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
 - **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
 
 ## Max battles on the map (plan 8X-5)
@@ -249,6 +249,51 @@ The tool that makes the Wayspot export is private (`wayfarer.md`); the owner's i
 - Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`, and a party's post its post's own, `--accent-<name>` (plan 8M-8A, `PostAccent`), the same in light and dark as on Discord; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it, and `editor.css` is an add-on loaded beside `map.css` when the editor is first turned on (plan 8M-10: it imports neither again); `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
 - To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new color is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` checks that the light and dark sets name the same values and that every page's stylesheet imports `theme.css`, and refuses a color written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a color function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colors (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a color function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named color (a sentence may name a color: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the gray of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
 
+## The fix pass: answers and small fixes (plan 8M-11A)
+
+Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11A"; findings S1 to S28 of the web polish's staging (follow-ups, "From the staging run of the web polish").
+
+- **A change answers once its post shows it (S1):** `PartyService` counts each party's changes in memory (`PartyStore.onChange`). A change takes `drawTicket(partyId)`, that count, once it has returned, so that the count holds the press's own change (review fix R1); each draw records the count it read the party at, and `shown(partyId, ticket, maxMs)` resolves once a draw that read a count of the ticket or more has kept its layout (`keepLayout`) or ended, or after `maxMs` (review fixes F2 and R1: a draw in flight that read the party before the change answers nothing, whatever another member changed meanwhile; the draw a quiet party's change starts at once read the ticket's count and counts). It resolves at once where the party has no post drawn (it is over, `forgetPost` ran, or its post is still being made), where such a draw is done already, or where no draw waits or runs (`Coalescer.busy`). A draw the change started at once counts, and so does one that waits out its delay.
+  - Every web route that changes a party, once the change has returned, waits through `shownAfter(parties.drawn, partyId, wrote)` (`src/web/post-drawn.ts`; `PartyWebDeps.drawn` is the party service in the bot): the press, Group…, Meet…, the raid's Change…, the meetup's changes, the route editor, Move…, Manage…, Split… (for the train it leaves: the new train's post is new) and the conductor.
+  - The wait is at most `PRESS_SHOWN_MS` (5 s); a refusal waits for nothing. The page's poll right after the answer gets the post with the change.
+  - Tests pass the service (`partyWebWith(made, { drawn: made.service })`) or `RecordingDraws`; by default nothing waits (`NO_DRAW_WAIT`).
+- **Answers where the member looks (S9, S20, S21):** a press's answer goes into its post's answer line (`.press-answer`, `role="status"`, `answerLine` of `press-answer.ts`), under the post's last row of buttons, in the popup, the phone card (its summary too) and a line of the list. It is kept by party for `ANSWER_MS` (10 s) across redraws (`PressAnswers`, `PostDrawContext.answer`), then taken out of the lines.
+  - A refusal (`ok: false`, `Pressed.ok`) is drawn in red and shakes the popup's content or the card once (`shake`; `map.css`'s `@keyframes shake` over `--shake-time` and `--shake-distance`, only under `prefers-reduced-motion: no-preference`).
+  - The forms of the post's controls answer there when they close (`PostFormsDeps.answered`), as do a refusal before a form opens, the conductor's buttons (`TrainUiDeps.answered`) and a raid's Change… that went through (`RaidUiDeps.answered`, review fix F4). A refusal that keeps its form is said under the form (`sayInForm`) and shakes it (`RaidUiDeps.refused` for Change…).
+  - The notice band carries only what has no party: the report forms, the editor, the tiles, a login.
+  - A button the map leaves to Discord (`data-on-discord` without a `data-why`) opens a note box in the form's place (`noteBox`, `PostFormsUi.noteClicked`). The note is `data-note`'s words: "A new group is started on Discord." where Group… can only start a new group, else "This is done in the post on Discord.". It has "Open the post on Discord" and Back, and Escape works as Back. A `data-why` is a refusal in the answer line. The `.on-discord` line under the buttons is gone.
+  - The completion question is drawn in the post above its buttons, in the answer line's look. A card in its summary that asks it has a dot on its handle (`--question-dot`).
+  - Meet…'s refusal for a group changed since is `meetSubmitRefusal`'s "Group B has changed since: press Meet… again." on both paths, and the map's form closes on it (`refusalCloses`).
+- **The notice band:** `#notice` (its text `#notice-text`, its × `#notice-close`) lies over the top of the map in `#content` (`position: absolute`). It keeps line breaks (`white-space: pre-line`, S17; the answer line too), goes away by itself after `NOTICE_MS` (10 s; a new line starts the time again) and at once by its × (`NoticeBand`, `say`, `hideNotice`). A lasting state has no timer (`say(text, { lasting: true })`, review fix F1): the map that could not be loaded, the editor read-only, the browser's storage full or keeping nothing. A timed line over a lasting one gives the lasting one back when its time is over (review fix R2); the × and `hideNotice` forget it.
+- **Small fixes:**
+  - S2: the rings' pane is at 590.
+  - S3: on a coarse pointer the popup's and the card's × are `--tap-size` (44 px) square, and the popup's content starts under the popup's ×.
+  - S4: several things at one place are headed with the place's name where every one of them is at that same place (`PlacedThing.place`, a key and a name: a gym, a Power Spot, a stop, a train's stop by `placeKeyOfStop`; review fix F5), else "Here" (a battle at a pin beside a gym's raid).
+  - S5: "Hatched", "Egg", "Ended".
+  - S11: `keepTools(panel, wanted)`, above.
+  - S16: Escape closes every report and change form as its Cancel does, the popup or card under it left open (`escapeCancels`, `form-escape.ts`): the raid's report and Change…, max, spawn, research, Rocket, the meetup's form and editor, a new train, and the post's forms. Route mode keeps its own Escape, which ends a drag.
+  - S22: "What's going on".
+- **One wording of times (S6, S19, S28):** `src/render/duration-words.ts`, import-free; Discord's own sentences are unchanged. `src/text-durations.test.ts` refuses minutes or hours worded by hand in `src/web/client`, also written out after a number or a substitution (review fix F6; an SVG's path data and the editor's " m²" aside).
+  - `relativeStamp(at, now, locale)` words a stamp of Discord's as its client does: a minute from 45 s, an hour from 45 min, a day from 22 h, the unit chosen by the rounded counts as moment.js chooses it (review fix F3: 44.6 s is "a minute"), by `Intl.RelativeTimeFormat` in the reader's language; English says "a", "an" and "a few seconds". The posts on the map use it (`postTime`), and so do the bot's words (`pageWords`).
+  - `durationWords(ms, { compact })` words a time left Pine composes: "17 min", "1 h 05 min", the minutes rounded to the nearest and never to nothing. A marker's badge uses the compact "1 h 05".
+- **Research (S18, S26):**
+  - Whether a standing report holds a report's subject is `holdsSubject` (`src/domain/research/reports.ts`: the same version; for "one of", any version of its task). Discord's "Same task at more stops…" uses it, and so do the map's Add stops… and "Same task at more stops…" (`formSubject`, `heldStops` over the research the page has, `ResearchUiDeps.research`).
+  - Where the research form shows its task alone (the contradiction question, "Same task at more stops…"), "Change task" brings the task list back with the task picked (`taskChanged`). From "Same task at more stops…" it becomes a new report of the list.
+- **The nearest Power Spots and stops:**
+  - `/api/powerspots` and `/api/stops` take `near=<lat>,<lon>&count=<n>` (1 to `MAX_NEAREST`, 25) beside a box (`placesQuerySchema`, `placesFor`, `wayspotsNear` over `nearestPlaces`, the search of `PlaceFinder.nearest`).
+  - The Report button's step 2 of a max battle, research and Rocket asks for the `NEAREST_COUNT` (5) nearest of where you are (`ReportFlowDeps.nearest`) and lists them. The view's places stay what the map draws, and are listed only where that ask failed.
+- **Icons (S14):** the Content Security Policy is unchanged. The Report menu's icons are:
+  - the game's raid head (`light`: no outline in dark);
+  - the Dynamax map icon as a mask in `--tier-dynamax` (`pictures/icons/dynamax.png`, served public at `/icons/dynamax.png` by `iconRoutes`, `ICON_NAMES` alone, kept the eggs' thirty days; the build leaves `/icons/*` as it is);
+  - the quest symbol and the R as before;
+  - Campfire's one-color Poké Ball as a mask in `--ball` (red, white in dark);
+  - the game's calendar as a mask in `--meetup`;
+  - Pine's train C3b as a whole drawing (`ReportIcon` `shape`: its view box, attributes and elements).
+
+  In dark the masks and the light pictures have no outline; the train has none in either theme (Matt, 2026-10-28).
+- **The train as Discord emoji:** `pinetrain` is in `CONTROL_ICON_NAMES`. Once the application has it, it goes before a train's name in the summary's lists and the new-train DMs' brief (`PartyService.trainMark`, `customIconText`), never on a button; until then those lines read as before.
+- The start says once that meetup safety is off without its setting (`MeetupSafety.warnAtStart`), not once per server.
+
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. The only exception is the Wayspot export tool's `/userscript` (above), which belongs to no server; another address outside `/s/<guild>/` needs the same reason. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
diff --git a/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md b/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..70bc31dfe165a5a223bb20297b864a6f6e879299
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md
@@ -0,0 +1,106 @@
+# Phase 8M-11A staging checklist: answers and small fixes of the web map
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives Discord and the map in its own tab; Tester is on Matt's phone.
+
+- **Accounts:** Googer (the owner, staff) and Tester (a member, no staff role).
+- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m11a-answers-small-fixes/design.md`.
+- **Design:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11A: answers and small fixes", "Matt's answers").
+- **Conventions:** `docs/architecture/web.md` ("The fix pass: answers and small fixes (plan 8M-11A)").
+- **Devices:** a desktop browser, light and dark, at 1280 and 1024 pixels; Matt's phone (a coarse pointer, the phone card).
+- **Findings:** each step names the finding it closes (S1 to S28, follow-ups "From the staging run of the web polish").
+
+## Before
+
+0. **The page built, the bot started after it.**
+   - Run `npm run web:build`, then start (or restart) the bot.
+   - No migration, no setting and no command change, so no deploy.
+   - The train emoji is optional: `npm run emoji:upload` (a dry run) lists `pinetrain`, and only `--apply` uploads it. That needs Matt's own go-ahead; step 24 says what shows without it.
+1. **Parties to press.** Report a raid at a gym:
+   - Googer and Tester both signed up, in two groups (Group… "A new group" on Discord);
+   - a meetup at the same gym, for S2 and S4;
+   - a train with a route of three stops, Googer conducting.
+
+## A press shows its own result at once (S1)
+
+2. **The popup follows the press.** As Tester on the desktop, open the raid's popup and press Join, then Interested, then Leave.
+   - Each time the buttons are off until the answer comes.
+   - The post in the popup shows the change as soon as the answer is there, not one change behind.
+   - Do it again quickly (a burst): the answer may take up to about 2 s and then shows the change. Nothing waits past 5 s.
+3. **The other changes.** Each of these shows its change in the popup when its answer comes:
+   - Group… (move to the other group);
+   - Meet… (set a time);
+   - the raid's Change… (the end time);
+   - a meetup's Edit… (its name);
+   - the train's Move… (Next), Manage… (Keep, another kind) and its route editor (add a stop);
+   - "Be the conductor" as Tester.
+
+   A refusal (Done on an egg) answers at once.
+
+## Answers where the member looks (S9, S20, S21, S17)
+
+4. **The answer line.** After each press of step 2, the answer is under the post's buttons in the popup (blue-gray), never in a band at the top. It stays across the next poll (20 s) for 10 s, then goes.
+5. **A refusal shakes.** As Tester press Done on the egg: "This raid has not hatched yet." in red under the buttons, and the popup shakes once. With the device's reduced motion on (Windows: Settings › Accessibility › Visual effects › Animation effects off), the line shows and nothing shakes.
+6. **On the phone.** As Tester on the phone, the same presses in the phone card, in its summary too. The answer is under the first row of buttons, visible without opening the whole post. A refusal shakes the card.
+7. **Move… refused.** As Tester (not the conductor), press the train's Move…: the conductor's sentence in red in the answer line, and the popup shakes. There is no "Do this on Discord" line.
+8. **"Start a new group" as a note.** As a member alone in a plain group of a raid of one group, press Group…: in the post's place a box says "A new group is started on Discord.", with the button "Open the post on Discord" (it opens the post in a new tab) and Back (and Escape) putting the post back.
+9. **The completion question.** As Tester present at a hatched raid, wait for (or have Googer trigger) the completion question.
+   - It is drawn in the post above its buttons, in the answer line's look.
+   - On the phone with the card in its summary: the question shows, and the card's handle has a red dot.
+   - "Yes, done" answers in the answer line.
+10. **Meet… after the group changed.** As Tester open Meet…; as Googer on Discord move Tester to the other group (or open a new group for Tester); then Submit Meet… on the map.
+    - The form closes, and the answer line says "Group A has changed since: press Meet… again.".
+    - On Discord, the same in Meet…'s dialog: "Group A has changed since: press ⏰ again." (or with the meet icon).
+11. **The notice band.**
+    - Report a spawn on the map: its answer in the band over the top of the map, which does not push the layers' row or the map down.
+    - It goes away by itself after 10 s; a second report starts the 10 s again; × hides it at once.
+    - A research report of several stops reads as lines in the band, not with " - " (S17).
+
+## The map's small fixes
+
+12. **S2.** At the gym of the raid and the meetup, zoomed to 15: the raid's time badge is drawn over the meetup's ring. A click on the ring's line still opens the list of things there.
+13. **S3.** On the phone, open a plain PokéStop's popup: its × is a large target (44 px), and the content starts under it.
+14. **S4.** Tap the gym of the raid and the meetup: the list is headed with the gym's name, not "Here". With a meetup at a pin and nothing named there, it says "Here".
+15. **S5.** A raid without times: the badge says "Egg" or "Hatched"; an ended one says "Ended". The list says the same, capitalized.
+16. **S11.** In the list on the desktop, Tab to a raid's line and let the raid end (or have Googer `/delete` it). After the next poll, the focus is on the sort, not on the page (Tab goes on from the sort).
+17. **S16.** Escape closes each of these as Cancel does, and the popup under it stays open:
+    - the raid's report form and Change…;
+    - Report → Max battle's form, a spawn's form, the research form and the Rocket form;
+    - a new meetup's form and a meetup's Edit…;
+    - New train's form;
+    - Group…, Meet… and the note box.
+18. **S22.** The side pane is headed "What's going on · n". Logged out, the pane says "What's going on" and "Log in to see what is going on.".
+
+## Times (S6, S19, S28)
+
+19. **One wording.**
+    - A train starting in about a day: its post on the map says "in a day" where Discord says "in a day", not "in 24 hours".
+    - A raid with 29 minutes and some seconds left: the list says "29 min left" (or 30) and the post "in 29 minutes" (or 30), alike.
+    - The badge says "17 min" or "1 h 05", and in metric the list says "17 min left" beside "410 m": minutes never "m".
+
+## Research (S18, S26)
+
+20. **S18.** With research reported at two stops (one a "one of"), press "Same task at more stops…" on one of them, then Add stops… in a new report of the same task: the nearest stops listed leave out the stops that hold that task already. On Discord, `/research report` "Same task at more stops…" leaves out the same stops.
+21. **S26.** In "Same task at more stops…", press "Change task": the task list, with the report's task and reward picked; pick another and report. In a contradiction question (Tester reports another task at Googer's stop), "Change task" brings the list back with the task kept.
+
+## Nearest places and icons
+
+22. **Nearest Power Spots and stops.** Report → Max battle with the map zoomed so that fewer than five Power Spots are in view: step 2 lists the five nearest of your location (or the map's middle) wherever they are, nearest first. The same for Report → Field research and Team GO Rocket with PokéStops.
+23. **S14, the Report menu.** Open Report in light and dark, at 1280 and on the phone:
+    - Raid: the game's raid head, not haloed in dark.
+    - Max battle: the game's Dynamax icon in Dynamax pink.
+    - Field research: the quest symbol, as before.
+    - Team GO Rocket: the R, as before.
+    - Wild spawn: Campfire's Poké Ball, red in light and white in dark.
+    - Train: Pine's train C3b in orange.
+    - Meetup: the game's calendar in purple.
+
+    In dark there is no light halo on the masks or the raid head; the train has none in light either. In devtools' network `/icons/dynamax.png` is answered 200, and nothing is loaded from the wiki.
+24. **The train emoji (only after an upload Matt allowed).** The board's "Today and coming up" lists each train with the train emoji before its name. A member who asked for new trains gets a DM whose train name starts with it. The post's buttons are as before. Without the upload, both read as before.
+
+## The start
+
+25. **The start log.** With `settings.channels.moderation` unset (a run with the stage settings changed and put back), the bot's log says "meetup safety is off" once, not once per server.
+
+## After
+
+26. **Back to how it was.** End the test parties (or let them end), put back any setting changed for step 25, and give the device's reduced motion back.
````

## After the last task

- [ ] `npm run check > var/8m11a-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 3203a397265e22875e4bbe955d4b046fb9b8470e HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
