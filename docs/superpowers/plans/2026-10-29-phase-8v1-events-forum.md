# Phase 8V-1: The Events Forum and the Campfire Links: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** each server gets one forum of the game's events: a pinned, locked listing "Events" that Pine keeps current (Now, This week, Coming up), and a post per bigger event for members to talk in, opened 14 days ahead and left to archive itself a day after the end. Events whose kind Campfire makes meetups for carry a link to Campfire's discover page. The small Campfire links design is built first: the shared link, a sentence in `/meetup`'s help, a line at the foot of the web map's list, and a guard against ever fetching from Campfire.

- **Task 1:** Campfire links: `CAMPFIRE_DISCOVER_URL` (`src/domain/campfire.ts`), `/meetup`'s help, the list's foot line "Official meetups: Campfire", the guard test `src/campfire-links.test.ts`.
- **Task 2:** the listing's domain and data: the shared reader of an item's times (`everyonesTimes`, `event-reach.ts`), `src/domain/time/event-listing.ts` (`isListed`, `isPosted`, `hasCampfireHint`, `readListedEvents`, `mergeListed` with moves and drops, the time words through `zoned.ts`), migration 033 (`EventForum`, `EventPost`, `ListedEvent`), their repositories, `RaidEventService` as the `ListedEventProvider` (`listedEvents`, `listingKnown`, `droppedIds`).
- **Task 3:** `settings.channels.events` and `settings.eventsForum`, `/admin setup-forums` making the forum, `cutover-check`'s events line, rehearsal mode skipping it, the gateway's new methods (`setAutoArchive`, `archiveUnlocked`, `lockPost`, `archivedPosts`, `letBotManagePosts`, `PostInfo.archived`).
- **Task 4:** `EventForumService` (`src/services/event-forum.ts`): the listing and the posts, one draw at a time, the timers, `everyLocalMidnight` shared with `PartyService`, the hourly upkeep and the catch-up on reconnect.
- **Task 5:** docs (`utilities.md` and the gateway, testing, operations and web notes, both guides) and the staging checklist `2026-10-29-phase-8v1-staging.md`.

**Tech stack:**
- TypeScript 6.0, Node 26, discord.js 14, Kysely and MySQL 8.4, Vitest.
- No new dependency; one migration (033, additive); two new settings (`channels.events`, `eventsForum`); no command definition changes, so no deploy.

**Specs:** `docs/superpowers/specs/2026-10-28-events-forum-design.md` (approved by Matt 2026-10-29) and `docs/superpowers/specs/2026-10-28-campfire-links-design.md` (approved 2026-10-28). With them: the brief `.superpowers/sdd/2026-10-29-phase-8v1-events-forum/design.md` (git-ignored), its fix list and `progress.md`.

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8v1` (tip `eae89447`), one commit per task, on typescript-migration 5d588a94.
- Each commit typechecks and passes its tests.
- On the round-1 tip, the full check (11,003 tests), the build and the database suite (623 tests) passed; on the final tip (round 2 changed only the service and its test) the full check passes (11,005).

**Reviews:**
- **The prototype:** an Opus review returned "ready after fixes": 4 Important (a failed read at start dropped every upcoming post for good; a replaced forum marked every post gone; a renamed event kept its post's old title; another pinned post made each draw fail and log), 8 Minor (gone rows not moved, posts archiving a week before their event, forum names compared unlike Discord's, the time words outside `zoned.ts`, a raid-battles item of no length listed, max events merged twice, a comment, the kinds).
- **The controller's rulings, Matt busy staging:** the research kinds, `update` and `location-specific` are not listed; `raid-weekend` and `elite-raids` get posts; a dropped post stays dropped and loses its link and picture; quiet posts are reopened by the hourly draw until their event ends; forum names compared as Discord stores them; the listing takes the merged max and big events (one path).
- **Fix round 1:** folded in; a scoped re-review returned "ready" with 3 Minor (a needless edit while a rename keeps failing, setup's forum change racing a draw, dropped ids kept in memory only).
- **Fix round 2:** the first two folded in; the third is a follow-up.

**Conventions:** read `CLAUDE.md` and `docs/architecture/utilities.md`, `parties-and-posts.md`, `discord-framework.md`, `web.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and `src/web/client`) and its own test files.
- The full check, the build and the database suite run once, on the tip.
- Work in `../Professor-Pine-events` on `events-forum`; never commit in the main checkout.

## Review Focus

- A failed or empty read never drops a post: drops only for ids the merge dropped before their start, nothing drawn until the listing is known.
- Nothing is ever fetched from Campfire; the guard test refuses its GraphQL and Niantic addresses.
- One path: the listing reads the feed once, max and big kinds take their merged times, the time words come from `zoned.ts`.
- Discord's limits: the components-v2 text budget with "…and N more", 100-character titles, the forum's one pin, archived posts found on take-over.
- One draw at a time: setup's forum change, the timers, the upkeep and the catch-up never interleave.

---

### Task 1: 8V-1 task 1: Campfire links, never fetched

Prototype commit: `aeffe727bd40010352918556b692c5fb69c52031`

CAMPFIRE_DISCOVER_URL in src/domain/campfire.ts, shared by the bot and the
web page. /meetup's help ends with where the official meetups are; the web
map's list (and the pane of a visitor logged out or no member) ends with
"Official meetups: Campfire" while the Meetups layer is offered
(LayerRegistry.isOffered). A guard test refuses Campfire's GraphQL address
and niantic-social-api in every source under src/ and packages/.

**Files:**

```
 src/campfire-links.test.ts            | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/meetups/meetup.test.ts   |  8 ++++++++
 src/commands/meetups/meetup.ts        |  4 +++-
 src/domain/campfire.ts                | 14 ++++++++++++++
 src/web/client/layer-registry.test.ts | 11 +++++++++++
 src/web/client/layer-registry.ts      |  9 +++++++++
 src/web/client/list-ui.test.ts        | 66 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/list-ui.ts             | 35 ++++++++++++++++++++++++++++++++++-
 src/web/client/main.ts                |  2 ++
 src/web/client/map.css                |  7 +++++++
 src/web/client/party-layer.ts         |  2 ++
 11 files changed, 206 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/campfire-links.test.ts src/commands/meetups/meetup.test.ts src/web/client/layer-registry.test.ts src/web/client/list-ui.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff aeffe727bd40010352918556b692c5fb69c52031 -- src test data docs/architecture docs/guides docs/superpowers/plans/2026-10-29-phase-8v1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8V-1 task 1: Campfire links, never fetched`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/campfire-links.test.ts b/src/campfire-links.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8438d01b4888e4cc1aaa0e19a913b76999a2fef7
--- /dev/null
+++ b/src/campfire-links.test.ts
@@ -0,0 +1,50 @@
+import { readdirSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * Pine only links to Campfire, never fetches anything from it (Matt, 2026-10-28; design
+ * `2026-10-28-campfire-links-design.md`, 5): Scopely Explore's terms forbid bots and scraping, and
+ * Campfire's answers carry members' ids and names. No source under `src/` or `packages/` names
+ * Campfire's API (its GraphQL address, or Niantic's social API behind it), so that a later change
+ * cannot start reading it by accident. As `text-distances.test.ts`, it reads the files themselves.
+ */
+
+const ROOT = path.join(import.meta.dirname, '..');
+const FOLDERS = ['src', 'packages'];
+/** What reads Campfire's data rather than linking its pages. */
+const REFUSED = /niantic-social-api|campfire\.scopely\.com\/graphql/iu;
+/** Folders that are no sources of Pine's. */
+const SKIPPED = new Set(['node_modules', 'dist']);
+/** This guard names what it refuses. */
+const SELF = path.relative(ROOT, import.meta.filename).replace(/\\/gu, '/');
+
+/** Every file under a folder, as paths from the checkout, without the skipped folders. */
+function filesUnder(folder: string): string[] {
+  return readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap((entry) => {
+    const relative = `${folder}/${entry.name}`;
+    if (entry.isDirectory()) return SKIPPED.has(entry.name) ? [] : filesUnder(relative);
+    return entry.isFile() && /\.(?:[cm]?[jt]s|json|html|css)$/u.test(entry.name) ? [relative] : [];
+  });
+}
+
+describe('Campfire is linked, never fetched (plan 8V-1)', () => {
+  it('finds the API addresses it refuses, and not the page members are sent to', () => {
+    for (const text of [
+      'https://campfire.scopely.com/graphql',
+      'https://niantic-social-api.nianticlabs.com/graphql',
+    ]) {
+      expect(REFUSED.test(text), text).toBe(true);
+    }
+    expect(REFUSED.test('https://campfire.scopely.com/discover')).toBe(false);
+  });
+
+  it('has no source under src/ or packages/ that names them', () => {
+    const files = FOLDERS.flatMap(filesUnder).filter((file) => file !== SELF);
+    expect(files.length).toBeGreaterThan(100);
+    const naming = files.filter((file) =>
+      REFUSED.test(readFileSync(path.join(ROOT, file), 'utf8')),
+    );
+    expect(naming).toEqual([]);
+  });
+});
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index 0f0d6e55e0ca0e7eedb45737f17d348d6c889940..157725d568694cd98067ae6c260dbebee6f67088 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -500,6 +500,14 @@ describe('/meetup', () => {
     );
   });
 
+  // Plan 8V-1 (the Campfire links design, 2): one sentence at the end, a link and no fetch.
+  it('ends its help with where the official meetups are: Campfire', () => {
+    const details = typeof meetup.help.details === 'string' ? meetup.help.details : '';
+    expect(details).toMatch(
+      / Official meetups by Community Ambassadors are on Campfire: https:\/\/campfire\.scopely\.com\/discover$/u,
+    );
+  });
+
   it('is listed with the commands, under the meetups, with /name and /info', () => {
     const filed = commands.filter((command) => command.help.category === 'meetup');
     expect(filed.map((command) => command.data.name).sort()).toEqual(['info', 'meetup', 'name']);
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index ee7ca283be2348f878d2cd213796ef0471a2974f..ceadafe97a02fe955a47dbefcafa9f872d13e27b 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -13,6 +13,7 @@ import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord
 import { memberInfo } from '../../discord/member-info.js';
 import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
+import { CAMPFIRE_DISCOVER_URL } from '../../domain/campfire.js';
 import type { Place } from '../../domain/geo/place.js';
 import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safety.js';
 import { tidyDescription } from '../../domain/party/meetup.js';
@@ -277,7 +278,8 @@ export const meetup: SimpleCommand = {
       'change the information with `/info`, and rename it with `/name`. Members sign up with ' +
       'the buttons, as for a raid. A meetup is archived an hour after it is over: after its ' +
       'end, or without one a day after its start. One whose start was removed goes a day after ' +
-      'it was made, or after its last time was removed; its post says when.',
+      'it was made, or after its last time was removed; its post says when. Official meetups ' +
+      `by Community Ambassadors are on Campfire: ${CAMPFIRE_DISCOVER_URL}`,
     examples: [
       '/meetup name:Community Day picnic near:Riverside Park start:2pm',
       '/meetup name:Trade evening near:Fountain Square start:6:30pm',
diff --git a/src/domain/campfire.ts b/src/domain/campfire.ts
new file mode 100644
index 0000000000000000000000000000000000000000..497bffa0dc33a6fa61157ed4d864f9c7a4e97a63
--- /dev/null
+++ b/src/domain/campfire.ts
@@ -0,0 +1,14 @@
+/*
+ * Campfire, Scopely's app of official meetups by Community Ambassadors and Community Leaders
+ * (design `2026-10-28-campfire-links-design.md`, Matt 2026-10-28): Pine points members to it with
+ * links and never fetches anything from it (Scopely Explore's terms forbid bots and scraping;
+ * `src/campfire-links.test.ts` refuses its API in the sources). Pure: the bot and the web page
+ * import it.
+ */
+
+/**
+ * Campfire's map of meetups. It cannot point at a region (the site keeps the chosen place to
+ * itself and takes no center in its address), so it is the same for every instance and server:
+ * the visitor picks the area there.
+ */
+export const CAMPFIRE_DISCOVER_URL = 'https://campfire.scopely.com/discover';
diff --git a/src/web/client/layer-registry.test.ts b/src/web/client/layer-registry.test.ts
index 394bd224fce340d8c939ff250856211df2c52740..a9b0cfc9bff54fd8795e29361699bce43d9f935d 100644
--- a/src/web/client/layer-registry.test.ts
+++ b/src/web/client/layer-registry.test.ts
@@ -40,6 +40,17 @@ function mapRegistry(kept: ViewStorage | undefined): LayerRegistry {
   return registry;
 }
 
+describe('whether a layer is offered, by its id (plan 8V-1)', () => {
+  it('offers the Meetups layer to everybody, a members-only layer to members only', () => {
+    const registry = mapRegistry(storage());
+    expect(registry.isOffered('meetups', false)).toBe(true);
+    expect(registry.isOffered('meetups', true)).toBe(true);
+    expect(registry.isOffered('research', false)).toBe(false);
+    expect(registry.isOffered('research', true)).toBe(true);
+    expect(registry.isOffered('nothing such', true)).toBe(false);
+  });
+});
+
 describe('the layers of the map (plan 8M-7)', () => {
   it('are on by default for what happens now, off for the places and spawns (plan 8M-9A)', () => {
     const registry = mapRegistry(storage());
diff --git a/src/web/client/layer-registry.ts b/src/web/client/layer-registry.ts
index be1efdbecc9faa3cc08e0b925ff1b8ebe1e0eed0..412359f01815d5f2f5fa4659ce9bf7248ba1ccf5 100644
--- a/src/web/client/layer-registry.ts
+++ b/src/web/client/layer-registry.ts
@@ -142,6 +142,15 @@ export class LayerRegistry {
     return (!spec.membersOnly || member) && (!spec.waits || this.given.has(spec.id));
   }
 
+  /**
+   * Whether the layer of this id is registered and offered (`offered`): the list's foot line to
+   * Campfire's meetups follows the Meetups layer (plan 8V-1).
+   */
+  isOffered(id: string, member: boolean): boolean {
+    const spec = this.specs.find((one) => one.id === id);
+    return spec !== undefined && this.offered(spec, member);
+  }
+
   /** Something gives a waiting layer its data (or no longer does). */
   setOffered(id: string, offered: boolean): void {
     if (offered) this.given.add(id);
diff --git a/src/web/client/list-ui.test.ts b/src/web/client/list-ui.test.ts
index 041da213c79136df60adca966489ea4a2258bc4e..a7b5d04780ff13ca31df63ade7429b115e387ce8 100644
--- a/src/web/client/list-ui.test.ts
+++ b/src/web/client/list-ui.test.ts
@@ -246,6 +246,72 @@ describe('a line of the list shown with its popup (fix round 2)', () => {
   });
 });
 
+describe('the foot line to the official meetups (plan 8V-1, the Campfire links design)', () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  /** The list over the fake DOM, with the Meetups layer offered or not. */
+  const listed = (offered: boolean | undefined) => {
+    fakeDocument();
+    const section = new FakeElement('section');
+    const list = new WhatIsOn({
+      section: section as unknown as HTMLElement,
+      registry: { isOn: () => true } as unknown as LayerRegistry,
+      storage: undefined,
+      origin: () => undefined,
+      zone: () => 'America/New_York',
+      units: 'imperial',
+      open: () => false,
+      highlight: () => undefined,
+      detail: () => undefined,
+      ...(offered === undefined ? {} : { officialMeetups: () => offered }),
+    });
+    list.show([LINE]);
+    return section;
+  };
+
+  /** The foot line's words and its link, as a member sees and follows it. */
+  const foot = (section: FakeElement) => {
+    const line = section.children.at(-1);
+    const link = line?.all('a')[0];
+    return {
+      words: line?.words().replace(/\s+/gu, ' ').trim(),
+      href: link?.getAttribute('href'),
+      target: link?.getAttribute('target'),
+      rel: link?.getAttribute('rel'),
+    };
+  };
+
+  it('ends the list with "Official meetups: Campfire", a link in a new tab', () => {
+    expect(foot(listed(true))).toEqual({
+      words: 'Official meetups: Campfire',
+      href: 'https://campfire.scopely.com/discover',
+      target: '_blank',
+      rel: 'noopener noreferrer',
+    });
+  });
+
+  it('leaves it out where the Meetups layer is not offered', () => {
+    expect(listed(false).words()).not.toContain('Campfire');
+    expect(listed(undefined).words()).not.toContain('Campfire');
+  });
+
+  it('ends the pane of a visitor who is logged out or no member with it too', () => {
+    fakeDocument();
+    vi.stubGlobal('location', { pathname: '/' });
+    for (const login of ['discord', 'links', 'member-only'] as const) {
+      const pane = new FakeElement('aside');
+      loggedOutPane(pane as unknown as HTMLElement, login, true);
+      expect(foot(pane).words).toBe('Official meetups: Campfire');
+      expect(foot(pane).href).toBe('https://campfire.scopely.com/discover');
+      const without = new FakeElement('aside');
+      loggedOutPane(without as unknown as HTMLElement, login, false);
+      expect(without.words()).not.toContain('Campfire');
+    }
+  });
+});
+
 describe('a group of the list with a note (plan 8M-9B)', () => {
   afterEach(() => {
     vi.unstubAllGlobals();
diff --git a/src/web/client/list-ui.ts b/src/web/client/list-ui.ts
index c77d29a06ba8185a726596225cdb5d2c94490cdf..5937dae04400817c6bf086de7a62b5b72e0186be 100644
--- a/src/web/client/list-ui.ts
+++ b/src/web/client/list-ui.ts
@@ -1,4 +1,6 @@
+import { CAMPFIRE_DISCOVER_URL } from '../../domain/campfire.js';
 import { nothingFound, type FindGroup } from './find.js';
+import { renderNode, type PageNode } from './popup.js';
 import type { LayerRegistry } from './layer-registry.js';
 import type { DistanceUnits } from './distance.js';
 import type { LatLon, ViewStorage } from './view.js';
@@ -62,6 +64,11 @@ export interface WhatIsOnDeps {
   back?(): void;
   /** What scrolls the list: its place is kept while Find shows, and given back after. */
   scroller?: { scrollTop: number };
+  /**
+   * Whether the list ends with the line to Campfire's official meetups (plan 8V-1): while the
+   * Meetups layer is offered. Without it, no line.
+   */
+  officialMeetups?(): boolean;
 }
 
 export class WhatIsOn {
@@ -195,6 +202,7 @@ export class WhatIsOn {
       }
       body.push(...(deps.groupBody?.(group.kind) ?? []), list);
     }
+    if (deps.officialMeetups?.() === true) body.push(renderNode(officialMeetupsLine(), document));
     // A field of a line's popup keeps the focus where it had it.
     const focused = document.activeElement;
     const inside = focused instanceof HTMLElement && deps.section.contains(focused);
@@ -389,10 +397,34 @@ export const FIND_BACK = 'Back to the list';
 /** The list's heading (plan 8M-11A, S22), and the pane's `aria-label` (`page.ts`). */
 export const LIST_HEADING = "What's going on";
 
-/** The side pane of somebody who is not a member: how to log in, or that it is for members. */
+/**
+ * The list's foot line (plan 8V-1, the Campfire links design, 3): "Official meetups: Campfire",
+ * a link to Campfire's map of meetups in a new tab that does not learn where it came from. Public,
+ * and it says nothing about the server.
+ */
+export function officialMeetupsLine(): PageNode {
+  return {
+    tag: 'p',
+    className: 'official-meetups',
+    text: 'Official meetups: ',
+    children: [
+      {
+        tag: 'a',
+        text: 'Campfire',
+        attributes: { href: CAMPFIRE_DISCOVER_URL, target: '_blank', rel: 'noopener noreferrer' },
+      },
+    ],
+  };
+}
+
+/**
+ * The side pane of somebody who is not a member: how to log in, or that it is for members; with
+ * `officialMeetups` (the Meetups layer offered) the line to Campfire at its foot.
+ */
 export function loggedOutPane(
   section: HTMLElement,
   login: 'discord' | 'links' | 'member-only',
+  officialMeetups = false,
 ): void {
   const heading = document.createElement('h2');
   heading.textContent = LIST_HEADING;
@@ -413,5 +445,6 @@ export function loggedOutPane(
     how.textContent = 'Use /maps in Discord to log in.';
     parts.push(how);
   }
+  if (officialMeetups) parts.push(renderNode(officialMeetupsLine(), document));
   section.replaceChildren(...parts);
 }
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index f468849e2a0633a9166481475a4695a61566c326..8223d7d432fb20fd42f1059866d123465755c7b0 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -467,6 +467,8 @@ function start(): void {
         loggedOutPane(
           section,
           me.loggedIn ? 'member-only' : data.login === 'discord' ? 'discord' : 'links',
+          // Campfire's official meetups, public (plan 8V-1): while the Meetups layer is offered.
+          registry.isOffered('meetups', member),
         );
         pane.replaceChildren(section);
         pane.hidden = false;
diff --git a/src/web/client/map.css b/src/web/client/map.css
index de84065ab0f373af95c446094949dec09a2c58e6..4fb10911b41fb48f14cc52dec635ffe74b5eea3a 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1050,6 +1050,13 @@ body.editing-regions #map {
   color: var(--muted);
 }
 
+/* The foot line to Campfire's official meetups (plan 8V-1). */
+.what-is-on .official-meetups {
+  margin: 12px 0 4px;
+  color: var(--muted);
+  font-size: 13px;
+}
+
 .list-lines {
   margin: 0;
   padding: 0;
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 0c01d5b852aadd67d64555ac615a982d33ad69fa..af0409fd8c092e53d884fbba78aa9beddadd87ae 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -1445,6 +1445,8 @@ export function showParties(
     },
     // Not "Nothing is on just now." while the reports at stops are drawn without the parties.
     partiesKnown: () => view !== undefined && view !== noParties,
+    // The line to Campfire's official meetups at the foot (plan 8V-1), as the layer is offered.
+    officialMeetups: () => registry.isOffered('meetups', true),
     groupHead: (kind) => stopFilters.head(kind),
     groupBody: (kind) => stopFilters.body(kind),
     units: frame.units,
````

### Task 2: 8V-1 task 2: the events listing's domain and data

Prototype commit: `cccfcd6bf4d1858ef4694de151bee9f39e11897e`

src/domain/time/event-listing.ts is the events forum's one rule: which
events of ScrapedDuck's feed are listed (isListed), posted (isPosted) and
hinted (hasCampfireHint), the read of the listed events (readListedEvents:
max and big kinds take their times from the parsed max and big events, the
rest through everyonesTimes; items without times are not seen), the merge
with the kept events (mergeListed: kept to the end once begun, dropped before
the start, moved to a new id of the same name and type), the sections and a
post's opening, and an event's times as plain local text.

everyonesTimes (event-reach.ts) is the one reader of a feed item's times,
used by parseMaxEventFeed and parseBigEventFeed too.

Migration 033 adds EventForum, EventPost and ListedEvent;
EventForumRepository and ListedEventRepository with their memory twins and
shared cases. RaidEventService is the ListedEventProvider: the listing of
each read, kept in the database (loadListed before start), listeners told
after each read, an unknown event type said once at warn.

**Files:**

```
 src/app.ts                                            |   5 ++
 src/db/migrations/2026_10_29_033_events_forum.ts      |  66 ++++++++++++++++++++++++
 src/db/migrations/index.ts                            |   2 +
 src/db/migrator.db.test.ts                            |   4 ++
 src/db/repositories/event-forum-repository.db.test.ts |  62 +++++++++++++++++++++++
 src/db/repositories/event-forum-repository.ts         | 215 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/listed-event-repository.ts        |  91 +++++++++++++++++++++++++++++++++
 src/db/table-names.ts                                 |   3 ++
 src/db/types.ts                                       |  35 +++++++++++++
 src/domain/time/event-listing.test.ts                 | 380 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/time/event-listing.ts                      | 360 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/time/event-reach.test.ts                   |  42 ++++++++++++++++
 src/domain/time/event-reach.ts                        |  34 ++++++++++++-
 src/domain/time/max-events.ts                         |  26 +++++-----
 src/domain/time/zoned.test.ts                         |  20 ++++++++
 src/domain/time/zoned.ts                              |  22 ++++++++
 src/services/raid-event-service.test.ts               | 177 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/raid-event-service.ts                    | 153 +++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 test/support/event-forum-store-cases.ts               | 188 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/event-forum-store.test.ts                |  11 ++++
 test/support/event-forum-store.ts                     | 133 ++++++++++++++++++++++++++++++++++++++++++++++++
 21 files changed, 2013 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/time/event-listing.test.ts src/domain/time/event-reach.test.ts src/domain/time/zoned.test.ts src/services/raid-event-service.test.ts test/support/event-forum-store.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/event-forum-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cccfcd6bf4d1858ef4694de151bee9f39e11897e -- src test data docs/architecture docs/guides docs/superpowers/plans/2026-10-29-phase-8v1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8V-1 task 2: the events listing's domain and data`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 1f1b66e6a6c42fe7ff1bb2834b9973c552c1810f..912ebcd2dfb0c9bfce1d6f8175d2055ebd79a9e2 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -87,6 +87,7 @@ import { GruntMessageService } from './services/grunt-messages.js';
 import { RocketService } from './services/rocket-reports.js';
 import { ResearchEventRepository } from './db/repositories/research-event-repository.js';
 import { MaxEventRepository } from './db/repositories/max-event-repository.js';
+import { ListedEventRepository } from './db/repositories/listed-event-repository.js';
 import { StopReportRepository } from './db/repositories/stop-report-repository.js';
 import { StopReportService } from './services/stop-reports.js';
 import { rewardHash } from './domain/research/versions.js';
@@ -282,6 +283,8 @@ export async function startApp(
     research: new ResearchEventRepository(db),
     // The max events and the big events, kept as last merged (plan 8X-F).
     maxEvents: new MaxEventRepository(db, log),
+    // The events forum's listed events, kept as last merged (plan 8V-1).
+    listed: new ListedEventRepository(db, log),
     log,
   });
   // The spawns of the events on (plan 8R-4): a community day's from the feed, any other
@@ -850,6 +853,8 @@ export async function startApp(
     await raidEvents.loadResearch();
     // Before the first read of the feed: the week's featured boss, a max battle's default end.
     await raidEvents.loadMax();
+    // Before the first read too: the events forum's listing survives a restart (plan 8V-1).
+    await raidEvents.loadListed();
     await gyms.load();
     await regions.load();
     await wayspots.load();
diff --git a/src/db/migrations/2026_10_29_033_events_forum.ts b/src/db/migrations/2026_10_29_033_events_forum.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fefee18e39ccb529f34258a8d615a3f2bba0c111
--- /dev/null
+++ b/src/db/migrations/2026_10_29_033_events_forum.ts
@@ -0,0 +1,66 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * The events forum (plan 8V-1; design `2026-10-28-events-forum-design.md`):
+ *
+ * - `EventForum`: one row per server with an events forum (`settings.channels.events`), made or
+ *   found by `/admin setup-forums`: the server's snowflake, the forum's, and the listing post's
+ *   ("Events"; null until made, or after the forum changed).
+ * - `EventPost`: one row per event and server that got a post, unique on the two: the feed's
+ *   `eventId` (varchar(200) as `MaxEvent.eventId`; a moved event's row takes the new id), the
+ *   post's snowflake, the name and times it was drawn with (epoch milliseconds), when its
+ *   auto-archive was set to a day after the end (`endedAt`), when Pine archived it (`archivedAt`:
+ *   the upkeep three days after the end, or a drop), whether the event was dropped before its
+ *   start (`dropped`), and whether a moderator deleted the post (`gone`: never made again).
+ * - `ListedEvent`: the listed events as `RaidEventService` last merged them, replaced whole after
+ *   each read (as `MaxEvent`): the feed's id, type, name, Leek Duck link and picture, start and
+ *   end, and the ids it was listed under before it moved (`formerIds`, JSON, null for none).
+ *
+ * Snowflakes are strings (varchar(30)). Safe to run again after a failure half-way: a table is
+ * made only when it is missing.
+ */
+export const eventsForum: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists EventForum (
+        serverId varchar(30) not null,
+        forumId varchar(30) not null,
+        listingPostId varchar(30) null,
+        primary key (serverId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists EventPost (
+        id int unsigned not null auto_increment,
+        serverId varchar(30) not null,
+        eventId varchar(200) not null,
+        postId varchar(30) not null,
+        name varchar(100) not null,
+        startsAt bigint not null,
+        endsAt bigint not null,
+        endedAt bigint null,
+        archivedAt bigint null,
+        dropped tinyint(1) not null default 0,
+        gone tinyint(1) not null default 0,
+        primary key (id),
+        unique key eventpost_event_unique (serverId, eventId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists ListedEvent (
+        id int unsigned not null auto_increment,
+        eventId varchar(200) not null,
+        eventType varchar(40) not null,
+        name varchar(100) not null,
+        link varchar(500) null,
+        image varchar(500) null,
+        startsAt bigint not null,
+        endsAt bigint not null,
+        formerIds json null,
+        primary key (id)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 5f168c0b6add563beefedfe2fba6adffd93ccb5d..9ca6b815f293f6bea26b9e76408303583f1f0c64 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -31,6 +31,7 @@ import { maxEvents } from './2026_10_22_029_max_events.js';
 import { costumedWants } from './2026_10_22_030_costumed_wants.js';
 import { regionBoard } from './2026_10_25_031_region_board.js';
 import { googleLine } from './2026_10_26_032_google_line.js';
+import { eventsForum } from './2026_10_29_033_events_forum.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -69,4 +70,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_22_030_costumed_wants': costumedWants,
   '2026_10_25_031_region_board': regionBoard,
   '2026_10_26_032_google_line': googleLine,
+  '2026_10_29_033_events_forum': eventsForum,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index e8d64589242f5f58f583e7902a01800772aeaee9..3792ec47fce23cac16971f5efeebed9e0a0f21ea 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -70,6 +70,9 @@ const ADDED_TABLES = [
   'GymGoogleAsked',
   'GoogleUseDay',
   'StopLine',
+  'EventForum',
+  'EventPost',
+  'ListedEvent',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -198,6 +201,7 @@ describe('runMigrations', () => {
       '2026_10_22_030_costumed_wants',
       '2026_10_25_031_region_board',
       '2026_10_26_032_google_line',
+      '2026_10_29_033_events_forum',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/event-forum-repository.db.test.ts b/src/db/repositories/event-forum-repository.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cf4e223717794eb217c6695bc800e2d940a7c462
--- /dev/null
+++ b/src/db/repositories/event-forum-repository.db.test.ts
@@ -0,0 +1,62 @@
+import type { Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import {
+  eventForumCases,
+  listedEvent,
+  listedEventCases,
+} from '../../../test/support/event-forum-store-cases.js';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import type { DB } from '../types.js';
+import { EventForumRepository } from './event-forum-repository.js';
+import { ListedEventRepository } from './listed-event-repository.js';
+
+/** The events forum's tables of plan 8V-1 (migration 033). */
+describe('EventForumRepository and ListedEventRepository', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  describe('EventForumRepository', () => {
+    eventForumCases(async () => {
+      await db.deleteFrom('EventPost').execute();
+      await db.deleteFrom('EventForum').execute();
+      return new EventForumRepository(db);
+    });
+  });
+
+  describe('ListedEventRepository', () => {
+    listedEventCases(async () => {
+      await db.deleteFrom('ListedEvent').execute();
+      return new ListedEventRepository(db);
+    });
+
+    it('leaves out a row it cannot read, and says so', async () => {
+      await db.deleteFrom('ListedEvent').execute();
+      const { log, entries } = createTestLogger();
+      const store = new ListedEventRepository(db, log);
+      await store.replace([listedEvent()]);
+      await db
+        .insertInto('ListedEvent')
+        .values({
+          eventId: 'broken',
+          eventType: 'event',
+          name: 'Broken',
+          startsAt: '1',
+          endsAt: '2',
+          formerIds: JSON.stringify({ not: 'a list' }),
+        })
+        .execute();
+      expect((await store.all()).map((event) => event.id)).toEqual([listedEvent().id]);
+      expect(entries).toContainEqual(
+        expect.objectContaining({ msg: 'a kept listed event cannot be read; left out' }),
+      );
+    });
+  });
+});
diff --git a/src/db/repositories/event-forum-repository.ts b/src/db/repositories/event-forum-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a78059f52053098052e90b4f336d5f1a33d9246d
--- /dev/null
+++ b/src/db/repositories/event-forum-repository.ts
@@ -0,0 +1,215 @@
+import type { Kysely } from 'kysely';
+import { inTransaction } from '../transaction.js';
+import type { DB } from '../types.js';
+
+/** A server's events forum (`EventForum`). Snowflakes are strings. */
+export interface EventForumRecord {
+  serverId: string;
+  forumId: string;
+  /** The listing post "Events"; null until made, and after the forum changed. */
+  listingPostId: string | null;
+}
+
+/** An event's post in a server's events forum (`EventPost`). Times are epoch milliseconds. */
+export interface EventPostRecord {
+  serverId: string;
+  /** The feed's id of its event (a moved event's row takes the new id). */
+  eventId: string;
+  postId: string;
+  /** The name and times it was last drawn with. */
+  name: string;
+  start: number;
+  end: number;
+  /** When its auto-archive was set to a day after the event's end; null before. */
+  endedAt: number | null;
+  /** When Pine archived it (the upkeep after the end, or a drop); null before. */
+  archivedAt: number | null;
+  /** Whether its event was dropped before its start (the post says so). */
+  dropped: boolean;
+  /** Whether a moderator deleted the post: it is never made again. */
+  gone: boolean;
+}
+
+/** What may change of a post's row. */
+export type EventPostChange = Partial<
+  Pick<EventPostRecord, 'name' | 'start' | 'end' | 'endedAt' | 'archivedAt' | 'dropped' | 'gone'>
+>;
+
+/**
+ * The events forums and their posts (plan 8V-1; tables `EventForum` and `EventPost` of migration
+ * 033). Twin `MemoryEventForums` (`test/support/event-forum-store.ts`), both running
+ * `eventForumCases`.
+ */
+export interface EventForumStorage {
+  /** Every server's forum, by server id. */
+  forums(): Promise<EventForumRecord[]>;
+  forum(serverId: string): Promise<EventForumRecord | undefined>;
+  /**
+   * Records the server's forum (`/admin setup-forums`). Another forum than the one recorded
+   * forgets the listing post, which was in the old one, and retires the server's live post rows
+   * in the same transaction (review V2: posts of the old forum are none of the new one, which
+   * gets its own); a row marked `gone` stays (a moderator's deletion is not undone). The same
+   * forum changes nothing.
+   */
+  setForum(serverId: string, forumId: string): Promise<void>;
+  /**
+   * Records the listing post of the server's forum; false (and nothing written) when the forum
+   * recorded is no longer `forumId`.
+   */
+  setListing(serverId: string, forumId: string, postId: string | null): Promise<boolean>;
+  /** The server's event posts, by event id. */
+  posts(serverId: string): Promise<EventPostRecord[]>;
+  /** Records a post; false (nothing written) when the event has one already. */
+  addPost(record: EventPostRecord): Promise<boolean>;
+  updatePost(serverId: string, eventId: string, change: EventPostChange): Promise<void>;
+  /**
+   * Gives an event's post row to the id its event moved to (R12); false (nothing written) when
+   * that id has a row already or `from` has none.
+   */
+  movePost(serverId: string, from: string, to: string): Promise<boolean>;
+}
+
+/** The `EventForum` and `EventPost` tables. */
+export class EventForumRepository implements EventForumStorage {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async forums(): Promise<EventForumRecord[]> {
+    return this.db.selectFrom('EventForum').selectAll().orderBy('serverId').execute();
+  }
+
+  async forum(serverId: string): Promise<EventForumRecord | undefined> {
+    return this.db
+      .selectFrom('EventForum')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .executeTakeFirst();
+  }
+
+  setForum(serverId: string, forumId: string): Promise<void> {
+    return inTransaction(this.db, async (trx) => {
+      const row = await trx
+        .selectFrom('EventForum')
+        .select('forumId')
+        .where('serverId', '=', serverId)
+        .forUpdate()
+        .executeTakeFirst();
+      if (!row) {
+        await trx
+          .insertInto('EventForum')
+          .values({ serverId, forumId, listingPostId: null })
+          .execute();
+        return;
+      }
+      // The listing goes with another forum, and stays with the same one.
+      if (row.forumId === forumId) return;
+      await trx
+        .updateTable('EventForum')
+        .set({ forumId, listingPostId: null })
+        .where('serverId', '=', serverId)
+        .execute();
+      await trx
+        .deleteFrom('EventPost')
+        .where('serverId', '=', serverId)
+        .where('gone', '=', 0)
+        .execute();
+    });
+  }
+
+  async setListing(serverId: string, forumId: string, postId: string | null): Promise<boolean> {
+    // Found first: an update that changes nothing counts no row (as `setSummaryMessage`).
+    const row = await this.db
+      .selectFrom('EventForum')
+      .select('serverId')
+      .where('serverId', '=', serverId)
+      .where('forumId', '=', forumId)
+      .executeTakeFirst();
+    if (!row) return false;
+    await this.db
+      .updateTable('EventForum')
+      .set({ listingPostId: postId })
+      .where('serverId', '=', serverId)
+      .where('forumId', '=', forumId)
+      .execute();
+    return true;
+  }
+
+  async posts(serverId: string): Promise<EventPostRecord[]> {
+    const rows = await this.db
+      .selectFrom('EventPost')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .orderBy('eventId')
+      .execute();
+    return rows.map((row) => ({
+      serverId: row.serverId,
+      eventId: row.eventId,
+      postId: row.postId,
+      name: row.name,
+      start: Number(row.startsAt),
+      end: Number(row.endsAt),
+      endedAt: row.endedAt === null ? null : Number(row.endedAt),
+      archivedAt: row.archivedAt === null ? null : Number(row.archivedAt),
+      dropped: row.dropped === 1,
+      gone: row.gone === 1,
+    }));
+  }
+
+  async addPost(record: EventPostRecord): Promise<boolean> {
+    const result = await this.db
+      .insertInto('EventPost')
+      .ignore()
+      .values({
+        serverId: record.serverId,
+        eventId: record.eventId,
+        postId: record.postId,
+        name: record.name,
+        startsAt: String(record.start),
+        endsAt: String(record.end),
+        endedAt: record.endedAt === null ? null : String(record.endedAt),
+        archivedAt: record.archivedAt === null ? null : String(record.archivedAt),
+        dropped: record.dropped ? 1 : 0,
+        gone: record.gone ? 1 : 0,
+      })
+      .executeTakeFirst();
+    return Number(result.numInsertedOrUpdatedRows ?? 0) > 0;
+  }
+
+  async updatePost(serverId: string, eventId: string, change: EventPostChange): Promise<void> {
+    const set = {
+      ...(change.name === undefined ? {} : { name: change.name }),
+      ...(change.start === undefined ? {} : { startsAt: String(change.start) }),
+      ...(change.end === undefined ? {} : { endsAt: String(change.end) }),
+      ...(change.endedAt === undefined
+        ? {}
+        : { endedAt: change.endedAt === null ? null : String(change.endedAt) }),
+      ...(change.archivedAt === undefined
+        ? {}
+        : { archivedAt: change.archivedAt === null ? null : String(change.archivedAt) }),
+      ...(change.dropped === undefined ? {} : { dropped: change.dropped ? 1 : 0 }),
+      ...(change.gone === undefined ? {} : { gone: change.gone ? 1 : 0 }),
+    };
+    if (Object.keys(set).length === 0) return;
+    await this.db
+      .updateTable('EventPost')
+      .set(set)
+      .where('serverId', '=', serverId)
+      .where('eventId', '=', eventId)
+      .execute();
+  }
+
+  async movePost(serverId: string, from: string, to: string): Promise<boolean> {
+    try {
+      const result = await this.db
+        .updateTable('EventPost')
+        .set({ eventId: to })
+        .where('serverId', '=', serverId)
+        .where('eventId', '=', from)
+        .executeTakeFirst();
+      return Number(result.numUpdatedRows) > 0;
+    } catch (err) {
+      // The new id has a row of its own (the unique key): left as it is.
+      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return false;
+      throw err;
+    }
+  }
+}
diff --git a/src/db/repositories/listed-event-repository.ts b/src/db/repositories/listed-event-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b9814a2159f93063fb776b990f6a85ac784508cc
--- /dev/null
+++ b/src/db/repositories/listed-event-repository.ts
@@ -0,0 +1,91 @@
+import type { Kysely } from 'kysely';
+import { z } from 'zod';
+import type { ListedEvent } from '../../domain/time/event-listing.js';
+import type { Logger } from '../../log.js';
+import { inTransaction } from '../transaction.js';
+import type { DB } from '../types.js';
+
+/**
+ * The events forum's listed events as Pine last merged them (plan 8V-1; table `ListedEvent` of
+ * migration 033), as the max events are kept (`MaxEventStorage`): the listing survives a restart
+ * and a feed that fails. Twin `MemoryListedEvents` (`test/support/event-forum-store.ts`), both
+ * running `listedEventCases` (`test/support/event-forum-store-cases.ts`).
+ */
+export interface ListedEventStorage {
+  /** Every event kept, in order of its start, then its name. */
+  all(): Promise<ListedEvent[]>;
+  /** Keeps these events in the place of all kept before, in one transaction. */
+  replace(events: readonly ListedEvent[]): Promise<void>;
+}
+
+const formerIdsDocument = z.array(z.string());
+
+/** In order of the start, then the name (as `mergeListed` orders them). */
+function inOrder(events: ListedEvent[]): ListedEvent[] {
+  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+}
+
+/** The `ListedEvent` table. */
+export class ListedEventRepository implements ListedEventStorage {
+  /** `log` hears of a row that cannot be read (left out). */
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly log?: Logger,
+  ) {}
+
+  async all(): Promise<ListedEvent[]> {
+    const rows = await this.db.selectFrom('ListedEvent').selectAll().orderBy('id').execute();
+    const events: ListedEvent[] = [];
+    for (const row of rows) {
+      const formerIds = this.formerIdsOf(row.formerIds);
+      if (formerIds === undefined) {
+        this.log?.warn({ event: row.eventId }, 'a kept listed event cannot be read; left out');
+        continue;
+      }
+      events.push({
+        id: row.eventId,
+        name: row.name,
+        eventType: row.eventType,
+        link: row.link,
+        image: row.image,
+        start: Number(row.startsAt),
+        end: Number(row.endsAt),
+        formerIds,
+      });
+    }
+    return inOrder(events);
+  }
+
+  /** A row's `formerIds`: none for null, undefined for what cannot be read. */
+  private formerIdsOf(value: unknown): string[] | undefined {
+    if (value === null) return [];
+    try {
+      return formerIdsDocument.safeParse(typeof value === 'string' ? JSON.parse(value) : value)
+        .data;
+    } catch {
+      return undefined;
+    }
+  }
+
+  replace(events: readonly ListedEvent[]): Promise<void> {
+    return inTransaction(this.db, async (trx) => {
+      await trx.deleteFrom('ListedEvent').execute();
+      if (events.length === 0) return;
+      await trx
+        .insertInto('ListedEvent')
+        .values(
+          events.map((event) => ({
+            eventId: event.id,
+            eventType: event.eventType,
+            name: event.name,
+            link: event.link,
+            image: event.image,
+            startsAt: String(event.start),
+            endsAt: String(event.end),
+            formerIds: event.formerIds.length === 0 ? null : JSON.stringify(event.formerIds),
+          })),
+        )
+        .execute();
+    });
+  }
+}
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index 7d33b5e907ecf0f5476cfca9ebb0d585dadcff5c..a8510edd7a1e384c9a491f363de27ebabdb56a3f 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -22,7 +22,10 @@ export const PINE_TABLES: readonly string[] = [
   'GymReview',
   'GymWayfarer',
   'EndedPartyPost',
+  'EventForum',
+  'EventPost',
   'HistoryOptIn',
+  'ListedEvent',
   'MaxEvent',
   'MeetupAppeal',
   'MeetupBlock',
diff --git a/src/db/types.ts b/src/db/types.ts
index c8166b697eaec62c72d4ac52910ea3ba55518be9..0295e18f38f1f340b6843027a87a23d1615abfd3 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -70,6 +70,26 @@ export interface EndedPartyPost {
   guildId: number;
 }
 
+export interface EventForum {
+  forumId: string;
+  listingPostId: string | null;
+  serverId: string;
+}
+
+export interface EventPost {
+  archivedAt: string | null;
+  dropped: Generated<number>;
+  endedAt: string | null;
+  endsAt: string;
+  eventId: string;
+  gone: Generated<number>;
+  id: Generated<number>;
+  name: string;
+  postId: string;
+  serverId: string;
+  startsAt: string;
+}
+
 export interface GoogleUseDay {
   day: string;
   kind: string;
@@ -166,6 +186,18 @@ export interface HistoryOptIn {
   serverId: string;
 }
 
+export interface ListedEvent {
+  endsAt: string;
+  eventId: string;
+  eventType: string;
+  formerIds: Json | null;
+  id: Generated<number>;
+  image: string | null;
+  link: string | null;
+  name: string;
+  startsAt: string;
+}
+
 export interface MaxEvent {
   endsAt: string;
   eventId: string | null;
@@ -700,6 +732,8 @@ export interface DB {
   CommandRoleAuthorization: CommandRoleAuthorization;
   CommandRoles: CommandRoles;
   EndedPartyPost: EndedPartyPost;
+  EventForum: EventForum;
+  EventPost: EventPost;
   GoogleUseDay: GoogleUseDay;
   GruntMessage: GruntMessage;
   Guild: Guild;
@@ -712,6 +746,7 @@ export interface DB {
   GymReview: GymReview;
   GymWayfarer: GymWayfarer;
   HistoryOptIn: HistoryOptIn;
+  ListedEvent: ListedEvent;
   MaxEvent: MaxEvent;
   MeetupAppeal: MeetupAppeal;
   MeetupBlock: MeetupBlock;
diff --git a/src/domain/time/event-listing.test.ts b/src/domain/time/event-listing.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..374b124cb538ee53a393f278e350e91fb81f3919
--- /dev/null
+++ b/src/domain/time/event-listing.test.ts
@@ -0,0 +1,380 @@
+import { describe, expect, it } from 'vitest';
+import { readMaxEventFeed } from '../../../test/support/max-events.js';
+import { readSpawnEventFeed } from '../../../test/support/spawn-events.js';
+import {
+  eventTimeWords,
+  hasCampfireHint,
+  isKnownKind,
+  isListed,
+  isPosted,
+  listingSections,
+  mergeListed,
+  postOpensAt,
+  readListedEvents,
+  sameEventName,
+  type FeedListing,
+  type ListedEvent,
+} from './event-listing.js';
+import { maxEventAt, parseBigEventFeed, parseMaxEventFeed } from './max-events.js';
+
+const ZONE = 'America/New_York';
+const at = (iso: string): number =>
+  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;
+
+/** The listed events of a feed, its max and big events parsed as the service parses them. */
+function listingOf(json: unknown): FeedListing {
+  return readListedEvents(json, ZONE, {
+    max: parseMaxEventFeed(json, ZONE).events,
+    big: parseBigEventFeed(json, ZONE),
+  });
+}
+
+const event = (overrides: Partial<ListedEvent> = {}): ListedEvent => ({
+  id: 'november-communityday2026',
+  name: 'Pawniard Community Day',
+  eventType: 'community-day',
+  link: 'https://leekduck.com/events/november-communityday2026/',
+  image: null,
+  start: at('2026-11-21T14:00'),
+  end: at('2026-11-21T17:00'),
+  formerIds: [],
+  ...overrides,
+});
+
+describe('which events are listed, posted and hinted (plan 8V-1, design "Which events")', () => {
+  const listing = listingOf(readSpawnEventFeed());
+  const ids = listing.read.map((one) => one.id);
+
+  it('lists everyone’s events of the feed of 2026-10-22 with times, of the kinds listed', () => {
+    for (const id of [
+      'pokemonspotlighthour2026-10-22',
+      'dynamax-uxie-mesprit-azelf-max-battle-day-2026',
+      'minior-showers-orionids-2026',
+      'max-mondays-2026-10-26',
+      'raidhour20261028',
+      'chandelure-super-mega-raid-day-2026',
+      'halloween-2026-part-1',
+      'november-communityday2026',
+      'pokemon-go-wild-area-2026-global',
+      'max-mondays-2026-11-16',
+      'pokemon-go-tour-alola-global-2027',
+    ]) {
+      expect(ids, id).toContain(id);
+    }
+  });
+
+  it('leaves out the passes, seasons, leagues, drops and Timed Research, and the boss rotations', () => {
+    for (const id of [
+      'go-pass-october-2026',
+      'season-24-twilight-trails',
+      'pokemon-night-out-2026-twitch-drops',
+      'pokemon-x-adidas-2026',
+      'gbl-twilight-trails_master-league_mega-catch-cup-great-league-edition',
+      'palkia-in-5-star-raid-battles-october-2026',
+    ]) {
+      expect(ids, id).not.toContain(id);
+    }
+  });
+
+  it('leaves out what is somebody else’s: zoned times, a City Safari, a city’s Wild Area or Tour', () => {
+    for (const id of [
+      'pokemon-night-out-los-angeles-2026',
+      'pokemon-go-city-safari-boston-2026-rescheduled',
+      'pokemon-go-wild-area-2026-mexico-city',
+      'pokemon-go-tour-alola-kaohsiung-2027',
+    ]) {
+      expect(ids, id).not.toContain(id);
+    }
+  });
+
+  it('counts an item without times as not seen: listed nowhere, named apart (R3)', () => {
+    expect(ids).not.toContain('pokemon-tcg-30th-celebration');
+    expect(listing.untimed).toContain('pokemon-tcg-30th-celebration');
+    expect(listing.untimed).toContain('raidhour20261021');
+  });
+
+  it('keeps each event’s name, type, link, picture and times as read', () => {
+    expect(listing.read.find((one) => one.id === 'november-communityday2026')).toEqual({
+      id: 'november-communityday2026',
+      name: 'Pawniard Community Day',
+      eventType: 'community-day',
+      link: 'https://leekduck.com/events/november-communityday2026/',
+      image: expect.stringMatching(/^https:\/\/cdn\.leekduck\.com\//u) as string,
+      start: at('2026-11-21T14:00'),
+      end: at('2026-11-21T17:00'),
+      formerIds: [],
+    });
+  });
+
+  it('lists a raid-battles item that lasts less than a day, a one-off raid event (ruling B)', () => {
+    const oneOff = {
+      eventID: 'eternatus-returns-2026',
+      name: 'Eternatus Returns',
+      eventType: 'raid-battles',
+      start: '2026-11-07T11:00:00.000',
+      end: '2026-11-07T17:00:00.000',
+    };
+    const listed = listingOf([oneOff]).read;
+    expect(listed.map((one) => one.id)).toEqual(['eternatus-returns-2026']);
+    expect(isPosted(listed[0]!)).toBe(false);
+    expect(hasCampfireHint(listed[0]!)).toBe(true);
+  });
+
+  // Review V9: a raid-battles item listed only when it lasts something and less than a day.
+  it('lists no raid-battles item that ends before or as it starts', () => {
+    const odd = event({ eventType: 'raid-battles' });
+    expect(isListed({ ...odd, end: odd.start })).toBe(false);
+    expect(isListed({ ...odd, end: odd.start - 60_000 })).toBe(false);
+    expect(isListed({ ...odd, end: odd.start + 60_000 })).toBe(true);
+  });
+
+  it('takes a Max Monday’s hours from the max events, assumed ones too (R4)', () => {
+    const json = readMaxEventFeed();
+    const max = parseMaxEventFeed(json, ZONE);
+    const listed = listingOf(json).read;
+    const assumed = max.events.find((one) => one.hoursAssumed);
+    if (!assumed?.id) throw new Error('the fixture has no Max Monday with assumed hours');
+    const line = listed.find((one) => one.id === assumed.id);
+    expect(line && { start: line.start, end: line.end }).toEqual({
+      start: assumed.start,
+      end: assumed.end,
+    });
+    // maxEventAt and the listing agree on the Monday's hours.
+    expect(maxEventAt(max.events, assumed.start)?.id).toBe(assumed.id);
+  });
+
+  it('takes a big event’s times from the big events', () => {
+    const json = readMaxEventFeed();
+    const big = parseBigEventFeed(json, ZONE);
+    const listed = listingOf(json).read;
+    for (const one of big) {
+      const line = listed.find((other) => other.id === one.id);
+      expect(line && [line.start, line.end]).toEqual([one.start, one.end]);
+    }
+  });
+
+  it('posts the bigger kinds, lines only for the weekly hours and what it does not know', () => {
+    for (const eventType of [
+      'community-day',
+      'raid-day',
+      'max-battles',
+      'wild-area',
+      'pokemon-go-tour',
+      'pokemon-go-fest',
+      'event',
+      // Ruling R1 of the review: Leek Duck's Raid Weekends and elite raid days get posts too.
+      'raid-weekend',
+      'elite-raids',
+    ]) {
+      expect(isPosted(event({ eventType })), eventType).toBe(true);
+    }
+    for (const eventType of [
+      'raid-hour',
+      'pokemon-spotlight-hour',
+      'max-mondays',
+      'pokestop-showcase',
+    ]) {
+      expect(isListed(event({ eventType })), eventType).toBe(true);
+      expect(isPosted(event({ eventType })), eventType).toBe(false);
+    }
+  });
+
+  // Ruling R1 of the review: the other research types and Leek Duck's notices are not listed.
+  it('lists none of the research types, the app updates and the location-specific notices', () => {
+    for (const eventType of [
+      'timed-research',
+      'special-research',
+      'limited-research',
+      'research-breakthrough',
+      'update',
+      'location-specific',
+    ]) {
+      expect(isListed(event({ eventType })), eventType).toBe(false);
+      expect(isKnownKind(eventType), eventType).toBe(true);
+    }
+  });
+
+  it('gives every listed kind the Campfire hint, and none to what is not listed', () => {
+    expect(hasCampfireHint(event({ eventType: 'raid-hour' }))).toBe(true);
+    expect(hasCampfireHint(event({ eventType: 'pokestop-showcase' }))).toBe(true);
+    expect(hasCampfireHint(event({ eventType: 'season' }))).toBe(false);
+    expect(hasCampfireHint(event({ eventType: 'city-safari' }))).toBe(false);
+  });
+
+  it('names a kind it does not know, once with the first such event, for the log', () => {
+    const json = [
+      { eventID: 'showcase-1', name: 'Showcase', eventType: 'pokestop-showcase', start: null },
+      {
+        eventID: 'showcase-2',
+        name: 'Showcase 2',
+        eventType: 'pokestop-showcase',
+        start: '2026-11-01T10:00:00.000',
+        end: '2026-11-02T10:00:00.000',
+      },
+    ];
+    expect(listingOf(json).unknownKinds).toEqual([
+      { eventType: 'pokestop-showcase', id: 'showcase-1' },
+    ]);
+    expect(isKnownKind('community-day')).toBe(true);
+    expect(isKnownKind('go-pass')).toBe(true);
+    expect(isKnownKind('city-safari')).toBe(true);
+    expect(isKnownKind('pokestop-showcase')).toBe(false);
+    // Leek Duck's own type list knows no Hatch Day (checked 2026-10-29): it is no kind of its own.
+    expect(isKnownKind('hatch-day')).toBe(false);
+  });
+
+  it('throws for a document that is no list of events, so that the caller keeps what it had', () => {
+    expect(() => readListedEvents({ events: [] }, ZONE, { max: [], big: [] })).toThrow();
+  });
+
+  it('keeps only a link or picture of the web, and leaves out the rest of a broken item', () => {
+    const listed = listingOf([
+      {
+        eventID: 'odd',
+        name: 'Odd',
+        eventType: 'event',
+        link: 'javascript:alert(1)',
+        image: 'http://example.com/a.png',
+        start: '2026-11-01T10:00:00.000',
+        end: '2026-11-02T10:00:00.000',
+      },
+      { eventID: 'no-name', eventType: 'event', start: '2026-11-01T10:00:00.000' },
+    ]).read;
+    expect(listed.map((one) => [one.id, one.link, one.image])).toEqual([['odd', null, null]]);
+  });
+});
+
+describe('the kept events merged with a read (plan 8V-1)', () => {
+  const now = at('2026-11-10T12:00');
+  const read = (events: ListedEvent[], untimed: string[] = []): FeedListing => ({
+    read: events,
+    untimed,
+    unknownKinds: [],
+  });
+
+  it('takes the read’s events, new ones and changed ones alike', () => {
+    const kept = [event()];
+    const later = event({ start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') });
+    const added = event({ id: 'raidhour20261118', name: 'Raid Hour', eventType: 'raid-hour' });
+    const merged = mergeListed(kept, read([later, added]), now);
+    expect(merged.events).toEqual([later, added].sort((a, b) => a.start - b.start));
+    expect(merged.moved).toEqual([]);
+    expect(merged.dropped).toEqual([]);
+  });
+
+  it('keeps a known event the feed lists without times to its end (R3)', () => {
+    const on = event({ start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
+    const merged = mergeListed([on], read([], [on.id]), now);
+    expect(merged.events).toEqual([on]);
+    expect(merged.dropped).toEqual([]);
+  });
+
+  it('keeps one dropped after its start to its end, and forgets it after', () => {
+    const on = event({ start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
+    expect(mergeListed([on], read([]), now).events).toEqual([on]);
+    expect(mergeListed([on], read([]), at('2026-11-13T20:00')).events).toEqual([]);
+  });
+
+  it('removes one dropped before its start, and says so', () => {
+    const coming = event();
+    const merged = mergeListed([coming], read([]), now);
+    expect(merged.events).toEqual([]);
+    expect(merged.dropped).toEqual([coming]);
+  });
+
+  it('carries a dropped event over to a new id of the same name and type: moved (R12)', () => {
+    const old = event({ id: 'november-communityday2026', formerIds: ['earlier'] });
+    const moved = event({
+      id: 'november-communityday2026-rescheduled',
+      name: 'Pawniard Community Day (Rescheduled)',
+      start: at('2026-11-28T14:00'),
+      end: at('2026-11-28T17:00'),
+    });
+    const merged = mergeListed([old], read([moved]), now);
+    expect(merged.events).toEqual([
+      { ...moved, formerIds: ['earlier', 'november-communityday2026'] },
+    ]);
+    expect(merged.moved).toEqual([
+      { from: 'november-communityday2026', to: 'november-communityday2026-rescheduled' },
+    ]);
+    expect(merged.dropped).toEqual([]);
+  });
+
+  it('moves nothing to an id it knew already, or of another type, or while the old one stays', () => {
+    const old = event();
+    const known = event({ id: 'known', start: at('2026-11-28T14:00') });
+    expect(mergeListed([old, known], read([known]), now).dropped).toEqual([old]);
+    const other = event({ id: 'new', eventType: 'event' });
+    expect(mergeListed([old], read([other]), now).dropped).toEqual([old]);
+    const twin = event({ id: 'twin' });
+    const both = mergeListed([old], read([old, twin]), now);
+    expect(both.moved).toEqual([]);
+    expect(both.events.map((one) => one.id)).toEqual(['november-communityday2026', 'twin']);
+  });
+
+  it('forgets what ended, read or kept', () => {
+    const over = event({ start: at('2026-11-01T10:00'), end: at('2026-11-02T10:00') });
+    expect(mergeListed([over], read([over]), now).events).toEqual([]);
+  });
+
+  it('tells one name from another, a "(Rescheduled)" mark, case and spaces aside', () => {
+    expect(sameEventName('Pawniard Community Day', 'Pawniard  community day (Rescheduled)')).toBe(
+      true,
+    );
+    expect(sameEventName('Pawniard Community Day', 'Pawniard Community Day Classic')).toBe(false);
+  });
+});
+
+describe('an event’s times as plain local text (ruling A)', () => {
+  it('says a day’s event with its weekday, date and hours', () => {
+    expect(eventTimeWords(at('2026-11-21T14:00'), at('2026-11-21T17:00'), ZONE)).toBe(
+      'Sat, Nov 21, 2–5 PM',
+    );
+    expect(eventTimeWords(at('2026-11-18T18:00'), at('2026-11-18T19:00'), ZONE)).toBe(
+      'Wed, Nov 18, 6–7 PM',
+    );
+    expect(eventTimeWords(at('2026-10-26T06:00'), at('2026-10-26T21:00'), ZONE)).toBe(
+      'Mon, Oct 26, 6 AM–9 PM',
+    );
+    expect(eventTimeWords(at('2026-12-11T17:30'), at('2026-12-11T23:59'), ZONE)).toBe(
+      'Fri, Dec 11, 5:30–11:59 PM',
+    );
+    expect(eventTimeWords(at('2026-11-07T10:00'), at('2026-11-08T00:00'), ZONE)).toBe(
+      'Sat, Nov 7, 10 AM–midnight',
+    );
+  });
+
+  it('says an event of several days by its first and last date', () => {
+    expect(eventTimeWords(at('2026-11-09T10:00'), at('2026-11-13T20:00'), ZONE)).toBe(
+      'Nov 9 – Nov 13',
+    );
+    expect(eventTimeWords(at('2026-11-14T10:00'), at('2026-11-15T18:00'), ZONE)).toBe(
+      'Nov 14 – Nov 15',
+    );
+    // An end at midnight is the day before's.
+    expect(eventTimeWords(at('2026-11-27T10:00'), at('2026-11-29T00:00'), ZONE)).toBe(
+      'Nov 27 – Nov 28',
+    );
+  });
+});
+
+describe('the listing’s sections and a post’s opening (plan 8V-1)', () => {
+  const now = at('2026-11-10T12:00');
+
+  it('puts what is on in Now, what starts within seven days in This week, then Coming up', () => {
+    const on = event({ id: 'on', start: at('2026-11-09T10:00'), end: at('2026-11-13T20:00') });
+    const week = event({ id: 'week', start: at('2026-11-17T11:00'), end: at('2026-11-17T12:00') });
+    const coming = event({ id: 'coming' });
+    const far = event({ id: 'far', start: at('2026-12-20T10:00'), end: at('2026-12-20T11:00') });
+    const over = event({ id: 'over', start: at('2026-11-01T10:00'), end: at('2026-11-02T10:00') });
+    const seasonal = event({ id: 'season', eventType: 'season' });
+    const sections = listingSections([coming, far, week, on, over, seasonal], now, ZONE, 35);
+    expect(sections.now.map((one) => one.id)).toEqual(['on']);
+    expect(sections.week.map((one) => one.id)).toEqual(['week']);
+    expect(sections.coming.map((one) => one.id)).toEqual(['coming']);
+  });
+
+  it('opens a post the given days before its start, by the local calendar', () => {
+    expect(postOpensAt(event(), 14, ZONE)).toBe(at('2026-11-07T14:00'));
+  });
+});
diff --git a/src/domain/time/event-listing.ts b/src/domain/time/event-listing.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6641c9423297be4cf0d637ab4b3e0e44c84d0b6d
--- /dev/null
+++ b/src/domain/time/event-listing.ts
@@ -0,0 +1,360 @@
+import { z } from 'zod';
+import { IN_PERSON_TYPES, everyonesTimes, isForEveryoneKind } from './event-reach.js';
+import { BIG_EVENT_TYPES, type BigEvent, type MaxEvent } from './max-events.js';
+import { eventName } from './raid-events.js';
+import { addDays, shortDateWords, shortDayWords, shortHourWords, zoned } from './zoned.js';
+
+/*
+ * The events forum's one rule (plan 8V-1; design `2026-10-28-events-forum-design.md`, "Which
+ * events, of which kinds"): which events of ScrapedDuck's feed are listed, which get a post of
+ * their own, which carry the Campfire hint, how a read is merged with the events kept, and how
+ * their times are said. The one path for the listing, the posts and any later reader. Pure.
+ */
+
+/** An event of the listing, as read and as kept (`ListedEvent` rows). Times are epoch ms. */
+export interface ListedEvent {
+  /** The feed's `eventID`. */
+  id: string;
+  /** The feed's name (`eventName`). Shown to members: through `plain()`. */
+  name: string;
+  /** The feed's `eventType`, which decides by the kinds below. */
+  eventType: string;
+  /** Its Leek Duck page (the feed's `link`), an `https` address; null without one. */
+  link: string | null;
+  /** The feed's `image`, an `https` address; null without one. Pine never fetches it. */
+  image: string | null;
+  start: number;
+  /** The first moment after it. */
+  end: number;
+  /**
+   * The ids it was listed under before it moved (R12: a new id of the same name and type while
+   * the old one was dropped before its start), oldest first: a post made for one is its post.
+   */
+  formerIds: readonly string[];
+}
+
+/**
+ * The kinds never listed: passes, seasons, leagues, Twitch drops, and research of every type of
+ * Leek Duck's list (`research`, long Timed Research; `timed-research`, `special-research`,
+ * `limited-research`, `research-breakthrough`), the app's updates (`update`) and its notices of
+ * one place (`location-specific`; the review's ruling R1): they run for weeks or are no event
+ * anybody meets for.
+ */
+export const UNLISTED_KINDS: ReadonlySet<string> = new Set([
+  'go-pass',
+  'season',
+  'go-battle-league',
+  'twitch-drops',
+  'research',
+  'timed-research',
+  'special-research',
+  'limited-research',
+  'research-breakthrough',
+  'update',
+  'location-specific',
+]);
+
+/**
+ * The kinds that get a post of their own, opened `postDaysAhead` before their start: the bigger
+ * days and Leek Duck's Raid Weekends and elite raid days (`raid-weekend`, `elite-raids`, ruling R1
+ * of the review). Leek Duck's type list (checked 2026-10-29, ScrapedDuck's wiki) has no Hatch Day
+ * type: a Hatch Day comes as an `event`, which is posted.
+ */
+export const POSTED_KINDS: ReadonlySet<string> = new Set([
+  'community-day',
+  'raid-day',
+  'raid-weekend',
+  'elite-raids',
+  'max-battles',
+  'wild-area',
+  'pokemon-go-tour',
+  'pokemon-go-fest',
+  'event',
+]);
+
+/** The kinds listed as lines only, known: the weekly hours, and a one-off raid event. */
+const LINE_KINDS: ReadonlySet<string> = new Set([
+  'raid-hour',
+  'pokemon-spotlight-hour',
+  'max-mondays',
+  'raid-battles',
+]);
+
+/** The kinds whose lines and posts leave out the Campfire hint: none so far (design). */
+export const NO_CAMPFIRE_KINDS: ReadonlySet<string> = new Set<string>();
+
+/** A `raid-battles` item shorter than this is a one-off raid event; longer, a boss rotation. */
+export const ONE_OFF_RAID_MS = 24 * 60 * 60_000;
+
+/** The max events' feed kinds, whose times the max events give (R4). */
+const MAX_KINDS: ReadonlySet<string> = new Set(['max-mondays', 'max-battles']);
+const BIG_KINDS: ReadonlySet<string> = new Set(BIG_EVENT_TYPES);
+
+/** Whether a kind is one this module decides on knowingly; an unknown one is logged once. */
+export function isKnownKind(eventType: string): boolean {
+  return (
+    UNLISTED_KINDS.has(eventType) ||
+    POSTED_KINDS.has(eventType) ||
+    LINE_KINDS.has(eventType) ||
+    IN_PERSON_TYPES.has(eventType)
+  );
+}
+
+/**
+ * Whether an event is listed: everyone's kind (`isForEveryoneKind`; zoned times are never read),
+ * outside `UNLISTED_KINDS`, and a `raid-battles` item only when it lasts less than a day (ruling
+ * B: the boss rotations stay out). A kind not known is listed.
+ */
+export function isListed(event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>): boolean {
+  if (!isForEveryoneKind(event.eventType) || UNLISTED_KINDS.has(event.eventType)) return false;
+  if (event.eventType === 'raid-battles') {
+    return event.end > event.start && event.end - event.start < ONE_OFF_RAID_MS;
+  }
+  return event.end > event.start;
+}
+
+/** Whether a listed event gets a post of its own (`POSTED_KINDS`). */
+export function isPosted(event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>): boolean {
+  return isListed(event) && POSTED_KINDS.has(event.eventType);
+}
+
+/** Whether a listed event carries the Campfire hint (every listed kind but `NO_CAMPFIRE_KINDS`). */
+export function hasCampfireHint(event: Pick<ListedEvent, 'eventType' | 'start' | 'end'>): boolean {
+  return isListed(event) && !NO_CAMPFIRE_KINDS.has(event.eventType);
+}
+
+/** An address of the web a member may follow or Discord may load. */
+const webAddress = z
+  .string()
+  .max(500)
+  .regex(/^https:\/\/[^\s<>]+$/u);
+
+const listedItem = z.object({
+  eventID: z.string().min(1).max(200),
+  eventType: z.string().min(1).max(40),
+  name: eventName,
+  link: z.unknown().optional(),
+  image: z.unknown().optional(),
+  start: z.string().max(40).nullable().optional(),
+  end: z.string().max(40).nullable().optional(),
+});
+
+/** What a read of the feed gives the listing. */
+export interface FeedListing {
+  /** The listed events with times, in order of their start, then their name. */
+  read: ListedEvent[];
+  /** The ids of the items listed without times (R3): not seen, neither news nor a drop. */
+  untimed: string[];
+  /** Each kind not known (`isKnownKind`), once with the first such item's id, in feed order. */
+  unknownKinds: { eventType: string; id: string }[];
+}
+
+/** Events in order of their start, then their name. */
+function inOrder<T extends { start: number; name: string }>(events: T[]): T[] {
+  return events.sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+}
+
+/**
+ * Reads the listed events of ScrapedDuck's feed (one read: `max` and `big` are the max and big
+ * events of the same document as the caller merged them with those it kept, R4, review V10). An item of a max kind takes its times from the max event of its id (so
+ * assumed hours too, as `maxEventAt` has them), a Wild Area, GO Tour or GO Fest from its big
+ * event; every other item through `everyonesTimes`, the one reader of an item's times. An item
+ * without times is `untimed`; one of somebody else's, or whose times cannot be read, is nothing.
+ *
+ * Throws when the document is not a list of events at all, so that the caller keeps what it had.
+ */
+export function readListedEvents(
+  json: unknown,
+  zone: string,
+  parsed: { max: readonly MaxEvent[]; big: readonly BigEvent[] },
+): FeedListing {
+  if (!Array.isArray(json)) throw new Error('The events feed is not a list of events');
+  const read: ListedEvent[] = [];
+  const untimed: string[] = [];
+  const unknown = new Map<string, string>();
+  for (const value of json as unknown[]) {
+    const item = listedItem.safeParse(value);
+    if (!item.success) continue;
+    const { eventID: id, eventType, name } = item.data;
+    if (!isKnownKind(eventType) && !unknown.has(eventType)) unknown.set(eventType, id);
+    const times = everyonesTimes(item.data, zone);
+    if (times.kind === 'elsewhere' || times.kind === 'unreadable') continue;
+    // A max or big kind takes its times from its parsed event, which the caller may have kept
+    // from earlier reads (assumed hours, a big event on now; review V10): with or without times
+    // in this item.
+    const own = MAX_KINDS.has(eventType)
+      ? parsed.max.find((one) => one.id === id)
+      : BIG_KINDS.has(eventType)
+        ? parsed.big.find((one) => one.id === id)
+        : undefined;
+    let start: number;
+    let end: number;
+    if (own) {
+      ({ start, end } = own);
+    } else if (times.kind === 'none') {
+      // Not seen (R3).
+      untimed.push(id);
+      continue;
+    } else if (MAX_KINDS.has(eventType) || BIG_KINDS.has(eventType)) {
+      // Those parsers left it out (too long, of no shape of theirs): so does the listing.
+      continue;
+    } else {
+      start = times.start.epochMilliseconds;
+      end = times.end.epochMilliseconds;
+    }
+    const event: ListedEvent = {
+      id,
+      name,
+      eventType,
+      link: webAddress.safeParse(item.data.link).data ?? null,
+      image: webAddress.safeParse(item.data.image).data ?? null,
+      start,
+      end,
+      formerIds: [],
+    };
+    if (isListed(event)) read.push(event);
+  }
+  return {
+    read: inOrder(read),
+    untimed,
+    unknownKinds: [...unknown].map(([eventType, id]) => ({ eventType, id })),
+  };
+}
+
+/** A name as compared for a move: without "(Rescheduled)", its spaces and case aside. */
+function nameKey(name: string): string {
+  return name
+    .replace(/\(\s*rescheduled\s*\)/giu, ' ')
+    .replace(/\s+/gu, ' ')
+    .trim()
+    .toLowerCase();
+}
+
+/** Whether two names are one event's (R12): a "(Rescheduled)" mark, spaces and case aside. */
+export function sameEventName(a: string, b: string): boolean {
+  return nameKey(a) === nameKey(b);
+}
+
+/** A merge of the kept events with a read (`mergeListed`). */
+export interface ListingMerge {
+  /** The events kept from now on, in order of their start, then their name. */
+  events: ListedEvent[];
+  /** The events that moved to a new id (R12). */
+  moved: { from: string; to: string }[];
+  /** The events dropped before their start, not moved: moved or canceled. */
+  dropped: ListedEvent[];
+}
+
+/**
+ * The kept events merged with a read, by the max events' rules: the read's events in the place of
+ * the kept ones of their ids (carrying their `formerIds`); a kept event the read lists without
+ * times (R3) kept as it is; one the read no longer lists kept to its end where it has begun, and
+ * removed where it has not (`dropped`), unless the read has a new id of the same name
+ * (`sameEventName`) and type that no kept event had: then it moved, and the new one carries its
+ * ids (`moved`, R12). What has ended is forgotten.
+ */
+export function mergeListed(
+  kept: readonly ListedEvent[],
+  listing: FeedListing,
+  now: number,
+): ListingMerge {
+  const keptById = new Map(kept.map((event) => [event.id, event]));
+  const readIds = new Set(listing.read.map((event) => event.id));
+  const untimed = new Set(listing.untimed);
+  const read = listing.read.map((event) => ({
+    ...event,
+    formerIds: keptById.get(event.id)?.formerIds ?? event.formerIds,
+  }));
+  const stays: ListedEvent[] = [];
+  const moved: ListingMerge['moved'] = [];
+  const dropped: ListedEvent[] = [];
+  const taken = new Set<string>();
+  for (const old of kept) {
+    if (readIds.has(old.id) || old.end <= now) continue;
+    if (untimed.has(old.id) || old.start <= now) {
+      stays.push(old);
+      continue;
+    }
+    const at = read.findIndex(
+      (event) =>
+        !keptById.has(event.id) &&
+        !taken.has(event.id) &&
+        event.eventType === old.eventType &&
+        sameEventName(event.name, old.name),
+    );
+    const target = read[at];
+    if (target) {
+      taken.add(target.id);
+      read[at] = { ...target, formerIds: [...old.formerIds, old.id] };
+      moved.push({ from: old.id, to: target.id });
+      continue;
+    }
+    dropped.push(old);
+  }
+  return {
+    events: inOrder([...read, ...stays].filter((event) => event.end > now)),
+    moved,
+    dropped,
+  };
+}
+
+/**
+ * An event's times as plain local text (ruling A: events run at local time everywhere, so no
+ * Discord stamp converted to the reader's zone): a day's event as "Sat, Nov 21, 2–5 PM" ("6 AM–9
+ * PM" across noon, "10 AM–midnight" to the day's end); one of several days as "Nov 9 – Nov 13",
+ * an end at midnight being the day before's.
+ */
+export function eventTimeWords(start: number, end: number, zone: string): string {
+  const from = zoned(start, zone);
+  const to = zoned(end, zone);
+  const atMidnight = to.hour === 0 && to.minute === 0 && end > start;
+  const lastDay = atMidnight ? addDays(to, -1) : to;
+  if (!from.toPlainDate().equals(lastDay.toPlainDate())) {
+    return `${shortDateWords(from)} – ${shortDateWords(lastDay)}`;
+  }
+  const day = `${shortDayWords(from)}, ${shortDateWords(from)}`;
+  const first = shortHourWords(from);
+  if (atMidnight) return `${day}, ${first.hour} ${first.half}–midnight`;
+  const last = shortHourWords(to);
+  const hours =
+    first.half === last.half
+      ? `${first.hour}–${last.hour} ${last.half}`
+      : `${first.hour} ${first.half}–${last.hour} ${last.half}`;
+  return `${day}, ${hours}`;
+}
+
+/** The listing's sections, each in order of its start. */
+export interface ListingSections {
+  /** On now. */
+  now: ListedEvent[];
+  /** Starting within seven days. */
+  week: ListedEvent[];
+  /** Starting later, within `horizonDays`. */
+  coming: ListedEvent[];
+}
+
+/**
+ * The listed events (`isListed`) by section: on now, starting within seven days (by the local
+ * calendar, the same hour a week on), starting later within `horizonDays`. What ended is in none.
+ */
+export function listingSections(
+  events: readonly ListedEvent[],
+  now: number,
+  zone: string,
+  horizonDays: number,
+): ListingSections {
+  const here = zoned(now, zone);
+  const weekEnd = addDays(here, 7).epochMilliseconds;
+  const horizon = addDays(here, horizonDays).epochMilliseconds;
+  const listed = inOrder(events.filter((event) => isListed(event) && event.end > now));
+  return {
+    now: listed.filter((event) => event.start <= now),
+    week: listed.filter((event) => event.start > now && event.start < weekEnd),
+    coming: listed.filter((event) => event.start >= weekEnd && event.start < horizon),
+  };
+}
+
+/** When an event's post opens: `postDaysAhead` days before its start, by the local calendar. */
+export function postOpensAt(event: Pick<ListedEvent, 'start'>, days: number, zone: string): number {
+  return addDays(zoned(event.start, zone), -days).epochMilliseconds;
+}
diff --git a/src/domain/time/event-reach.test.ts b/src/domain/time/event-reach.test.ts
index 6ca6cb6ae564b9a64227024a35275d91e567e08d..9be309e632056a525553c2fffe7026ab1c789dbf 100644
--- a/src/domain/time/event-reach.test.ts
+++ b/src/domain/time/event-reach.test.ts
@@ -5,6 +5,7 @@ import { MAX_ZONE } from '../../../test/support/max-bosses.js';
 import { readSpawnEventFeed } from '../../../test/support/spawn-events.js';
 import {
   editionsWithoutGlobal,
+  everyonesTimes,
   hasOwnZone,
   isForEveryone,
   isForEveryoneKind,
@@ -114,6 +115,47 @@ describe('isForEveryone: an event for every member wherever they play (plan 8R-7
   });
 });
 
+describe('everyonesTimes: the one reader of a feed item’s times (plan 8V-1, R4)', () => {
+  const at = (iso: string) => Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE);
+
+  it('gives the local times of an event for everyone, read in the zone', () => {
+    const times = everyonesTimes(event('community-day', 'Pawniard Community Day'), ZONE);
+    expect(times.kind).toBe('times');
+    if (times.kind !== 'times') return;
+    expect(times.start.epochMilliseconds).toBe(at('2027-03-01T10:00').epochMilliseconds);
+    expect(times.end.epochMilliseconds).toBe(at('2027-03-02T20:00').epochMilliseconds);
+  });
+
+  it('says an event is somebody else’s: zoned times, or an in-person type, with or without times', () => {
+    const night = event('event', 'Pokémon Night Out', { start: '2027-03-01T02:30:00.000Z' });
+    expect(everyonesTimes(night, ZONE)).toEqual({ kind: 'elsewhere' });
+    expect(everyonesTimes(event('city-safari', 'City Safari: Boston'), ZONE)).toEqual({
+      kind: 'elsewhere',
+    });
+    const untimedSafari = event('city-safari', 'City Safari', { start: null, end: null });
+    expect(everyonesTimes(untimedSafari, ZONE)).toEqual({ kind: 'elsewhere' });
+  });
+
+  it('says the feed gave no times where either is left out or null', () => {
+    for (const times of [
+      { start: null, end: null },
+      { start: '2027-03-01T10:00:00.000', end: null },
+      { start: null, end: '2027-03-01T10:00:00.000' },
+    ]) {
+      expect(everyonesTimes(event('event', 'TCG celebration', times), ZONE)).toEqual({
+        kind: 'none',
+      });
+    }
+    const { start: _start, end: _end, ...bare } = event('event', 'No times at all');
+    expect(everyonesTimes(bare, ZONE)).toEqual({ kind: 'none' });
+  });
+
+  it('says a time it cannot read is unreadable, never a throw', () => {
+    const odd = event('event', 'Odd', { start: 'soon' });
+    expect(everyonesTimes(odd, ZONE)).toEqual({ kind: 'unreadable' });
+  });
+});
+
 describe('the readers on the feed of 2026-10-24 (plan 8R-7, R11)', () => {
   const feed = readEveryoneFeed();
 
diff --git a/src/domain/time/event-reach.ts b/src/domain/time/event-reach.ts
index ff200b0ec19d130ba0fd97e0372297a3f0d7045d..13f4b403a768db5109de242c7f6b6ae3b193ef51 100644
--- a/src/domain/time/event-reach.ts
+++ b/src/domain/time/event-reach.ts
@@ -3,6 +3,7 @@
  * rule for the readers of research events, big events, spawn events and max events. The feed has
  * no field that says "in-person": the rule goes by the type and the times' zone. Pure.
  */
+import { feedTime } from './zoned.js';
 
 /**
  * The types of which every edition is in a city (Matt, 2026-10-22): a City Safari, and the
@@ -73,13 +74,44 @@ export interface EventReach {
  * its times has a zone of its own. A time the feed leaves out says nothing here (whoever reads
  * the event decides what an event without hours is).
  */
-export function isForEveryone(event: EventReach): boolean {
+export function isForEveryone(event: EventReach | TimedItem): boolean {
   const zoned = [event.start, event.end].some(
     (time) => typeof time === 'string' && hasOwnZone(time),
   );
   return !zoned && isForEveryoneKind(event.eventType);
 }
 
+/** What `everyonesTimes` reads of a feed item: its type and its times, as the feed gives them. */
+export interface TimedItem {
+  eventType: string;
+  start?: string | null | undefined;
+  end?: string | null | undefined;
+}
+
+/**
+ * The times of a feed item as everyone's events are read (plan 8V-1, R4: one reader for the max
+ * events, the big events and the events forum's listing):
+ * - `elsewhere`: no event of every member's (`isForEveryone`: an in-person type, or a time with a
+ *   zone of its own), whatever its times;
+ * - `none`: the feed left a time out (`null`, or no field): an event on now or just past, which
+ *   each reader decides on (assumed hours, "not seen");
+ * - `unreadable`: a time the feed wrote in a shape `feedTime` does not read;
+ * - `times`: its start and end, wall-clock times read in `zone`.
+ */
+export type ItemTimes =
+  | { kind: 'times'; start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime }
+  | { kind: 'none' }
+  | { kind: 'elsewhere' }
+  | { kind: 'unreadable' };
+
+export function everyonesTimes(item: TimedItem, zone: string): ItemTimes {
+  if (!isForEveryone(item)) return { kind: 'elsewhere' };
+  if (typeof item.start !== 'string' || typeof item.end !== 'string') return { kind: 'none' };
+  const start = feedTime(item.start, zone);
+  const end = feedTime(item.end, zone);
+  return start && end ? { kind: 'times', start, end } : { kind: 'unreadable' };
+}
+
 /** A Wild Area, GO Tour or GO Fest of the feed whose id and name say no "global". */
 export interface EditionWithoutGlobal {
   eventType: string;
diff --git a/src/domain/time/max-events.ts b/src/domain/time/max-events.ts
index 449b2992b195bb4393021fc7daa620feefdde32c..e0ddb1326be2f18ae130cce2927b0bda54d534f1 100644
--- a/src/domain/time/max-events.ts
+++ b/src/domain/time/max-events.ts
@@ -1,5 +1,5 @@
 import { z } from 'zod';
-import { hasOwnZone, isForEveryone } from './event-reach.js';
+import { everyonesTimes } from './event-reach.js';
 import { eventName } from './raid-events.js';
 import { addDays, feedTime, sameDay, zoned } from './zoned.js';
 
@@ -107,11 +107,10 @@ interface Hours {
   end: Temporal.ZonedDateTime;
 }
 
+/** An item's own hours (`everyonesTimes`, the one reader of an item's times; plan 8V-1, R4). */
 function hoursOf(item: FeedItem, zone: string): Hours | undefined {
-  if (typeof item.start !== 'string' || typeof item.end !== 'string') return undefined;
-  const start = feedTime(item.start, zone);
-  const end = feedTime(item.end, zone);
-  return start && end ? { start, end } : undefined;
+  const times = everyonesTimes(item, zone);
+  return times.kind === 'times' ? { start: times.start, end: times.end } : undefined;
 }
 
 /**
@@ -173,9 +172,7 @@ export function parseMaxEventFeed(json: unknown, zone: string): ParsedMaxEvents
   const items = (json as unknown[]).flatMap((value) => {
     const parsed = feedItem.safeParse(value);
     if (!parsed.success) return [];
-    const { start, end } = parsed.data;
-    const ownZone = [start, end].some((time) => typeof time === 'string' && hasOwnZone(time));
-    return ownZone ? [] : [parsed.data];
+    return everyonesTimes(parsed.data, zone).kind === 'elsewhere' ? [] : [parsed.data];
   });
   const houred = items.flatMap((item) => {
     const hours = hoursOf(item, zone);
@@ -301,12 +298,13 @@ export function parseBigEventFeed(json: unknown, zone: string): BigEvent[] {
   const events: BigEvent[] = [];
   for (const value of json as unknown[]) {
     const parsed = bigItem.safeParse(value);
-    if (!parsed.success || !isForEveryone(parsed.data)) continue;
-    const { eventID: id, name, start: from, end: to } = parsed.data;
-    if (typeof from !== 'string' || typeof to !== 'string') continue;
-    const start = feedTime(from, zone)?.epochMilliseconds;
-    const end = feedTime(to, zone)?.epochMilliseconds;
-    if (start === undefined || end === undefined) continue;
+    if (!parsed.success) continue;
+    // Everyone's, with hours (`everyonesTimes`, the one reader of an item's times; plan 8V-1).
+    const times = everyonesTimes(parsed.data, zone);
+    if (times.kind !== 'times') continue;
+    const { eventID: id, name } = parsed.data;
+    const start = times.start.epochMilliseconds;
+    const end = times.end.epochMilliseconds;
     const length = end - start;
     if (length <= 0 || length > MAX_EVENT_MS) continue;
     events.push({ id, name, start, end });
diff --git a/src/domain/time/zoned.test.ts b/src/domain/time/zoned.test.ts
index 4476590ce5451e6340eaec3394f3ea082a4621f0..0602029d172ed073374d332b4057209e0f6c7229 100644
--- a/src/domain/time/zoned.test.ts
+++ b/src/domain/time/zoned.test.ts
@@ -9,6 +9,9 @@ import {
   localTime,
   minuteStamp,
   sameDay,
+  shortDateWords,
+  shortDayWords,
+  shortHourWords,
   sameWeek,
   startOfHour,
   startOfMonth,
@@ -250,6 +253,23 @@ describe('words', () => {
     expect(dayWords(zoned(Date.UTC(2027, 0, 4, 12), ZONE))).toBe('Monday, January 4');
   });
 
+  // Plan 8V-1 (review V8): the events forum's short words, made here as every other word of time.
+  it('says a short weekday, a short date, and an hour without :00, with its half of the day', () => {
+    const saturday = zoned(Date.UTC(2026, 10, 21, 19), ZONE);
+    expect(shortDayWords(saturday)).toBe('Sat');
+    expect(shortDateWords(saturday)).toBe('Nov 21');
+    expect(shortDateWords(zoned(Date.UTC(2026, 8, 1, 16), ZONE))).toBe('Sep 1');
+    expect(shortHourWords(saturday)).toEqual({ hour: '2', half: 'PM' });
+    expect(shortHourWords(zoned(Date.UTC(2026, 10, 21, 22, 30), ZONE))).toEqual({
+      hour: '5:30',
+      half: 'PM',
+    });
+    expect(shortHourWords(zoned(Date.UTC(2026, 10, 21, 5), ZONE))).toEqual({
+      hour: '12',
+      half: 'AM',
+    });
+  });
+
   it('stamps a minute as yyyy-MM-dd HH:mm', () => {
     expect(minuteStamp(zoned(Date.UTC(2026, 0, 5, 14, 7, 59), ZONE))).toBe('2026-01-05 09:07');
     expect(minuteStamp(zoned(Date.UTC(2026, 9, 29, 3, 30), ZONE))).toBe('2026-10-28 23:30');
diff --git a/src/domain/time/zoned.ts b/src/domain/time/zoned.ts
index a48cd65e36291efe3b529b337712d4f8bfab29d7..a025362b5f7bf083f50e986b6dadf3eb6d4beefd 100644
--- a/src/domain/time/zoned.ts
+++ b/src/domain/time/zoned.ts
@@ -181,6 +181,28 @@ export function dayWords(time: Temporal.ZonedDateTime): string {
   return `${WEEKDAYS[time.dayOfWeek - 1] ?? ''}, ${MONTHS[time.month - 1] ?? ''} ${String(time.day)}`;
 }
 
+/** The weekday as `ccc`: "Sat" (plan 8V-1, the events forum). */
+export function shortDayWords(time: Temporal.ZonedDateTime): string {
+  return (WEEKDAYS[time.dayOfWeek - 1] ?? '').slice(0, 3);
+}
+
+/** The date as `LLL d`: "Nov 21" (plan 8V-1). */
+export function shortDateWords(time: Temporal.ZonedDateTime): string {
+  return `${(MONTHS[time.month - 1] ?? '').slice(0, 3)} ${String(time.day)}`;
+}
+
+/**
+ * The hour as the events forum says it (plan 8V-1): "2" on the hour, "5:30" otherwise, and its
+ * half of the day apart, so that "2–5 PM" says it once.
+ */
+export function shortHourWords(time: Temporal.ZonedDateTime): { hour: string; half: 'AM' | 'PM' } {
+  const hour = String(time.hour % 12 || 12);
+  return {
+    hour: time.minute === 0 ? hour : `${hour}:${two(time.minute)}`,
+    half: time.hour < 12 ? 'AM' : 'PM',
+  };
+}
+
 /** The minute as `yyyy-MM-dd HH:mm`: "2026-10-28 15:05". */
 export function minuteStamp(time: Temporal.ZonedDateTime): string {
   return (
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index 5cecd6e81f487f1369e63aab723ffaf48622b9df..f4ee407f4f911dcc06dcf4a40f1d1c958438b2c1 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -12,6 +12,8 @@ import type { ResearchEventStorage } from '../db/repositories/research-event-rep
 import { MemoryResearchEvents } from '../../test/support/research-store.js';
 import { MemoryMaxEvents } from '../../test/support/max-event-store.js';
 import type { MaxEventStorage } from '../db/repositories/max-event-repository.js';
+import type { ListedEventStorage } from '../db/repositories/listed-event-repository.js';
+import { MemoryListedEvents } from '../../test/support/event-forum-store.js';
 import { INTO_THE_WILD, PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
 
 const URL = 'https://example.test/events.json';
@@ -33,6 +35,7 @@ function service(
     url?: string;
     research?: ResearchEventStorage;
     maxEvents?: MaxEventStorage;
+    listed?: ListedEventStorage;
   } = {},
 ) {
   const { log, entries } = createTestLogger();
@@ -532,6 +535,180 @@ describe('RaidEventService', () => {
     });
   });
 
+  // Plan 8V-1: the events forum's listed events, of the same read, kept across a restart.
+  describe('the listed events (plan 8V-1)', () => {
+    const spawnFeed = () => readSpawnEventFeed() as { eventID: string; start: string | null }[];
+
+    it('gives the listed events of each read, max events by their parsed hours, and tells its listeners', async () => {
+      const store = new MemoryListedEvents();
+      const feed = JSON.stringify(spawnFeed());
+      const { events } = service(() => Promise.resolve(reply(200, feed)), {
+        listed: store,
+        now: () => at('2026-10-22T12:00'),
+      });
+      const told: number[] = [];
+      events.onListedChange(() => told.push(events.listedEvents().length));
+      expect(events.listedEvents()).toEqual([]);
+      await events.refresh();
+      const ids = events.listedEvents().map((event) => event.id);
+      expect(ids).toContain('november-communityday2026');
+      expect(ids).not.toContain('pokemon-tcg-30th-celebration');
+      const monday = events.maxEvents().find((event) => event.id === 'max-mondays-2026-10-26');
+      const line = events.listedEvents().find((event) => event.id === 'max-mondays-2026-10-26');
+      expect(line && [line.start, line.end]).toEqual(monday && [monday.start, monday.end]);
+      expect(await store.all()).toEqual(events.listedEvents());
+      // Each read tells, changed or not: the forum draws after each read.
+      await events.refresh();
+      expect(told).toEqual([ids.length, ids.length]);
+    });
+
+    it('keeps them across a restart and a failed read, and merges the next read with them', async () => {
+      const store = new MemoryListedEvents();
+      let body = JSON.stringify(spawnFeed());
+      let now = at('2026-11-10T12:00');
+      const fetch = vi.fn<FetchEvents>(() => Promise.resolve(reply(200, body)));
+      const first = service(fetch, { listed: store, now: () => now });
+      await first.events.refresh();
+      // After a restart the feed fails: the kept listing stands.
+      const down = service(() => Promise.resolve(reply(500)), { listed: store, now: () => now });
+      const told: string[] = [];
+      down.events.onListedChange(() => told.push('loaded'));
+      await down.events.loadListed();
+      await down.events.refresh();
+      expect(down.events.listedEvents()).toEqual(first.events.listedEvents());
+      expect(told).toEqual(['loaded']);
+      expect(down.entries.find((entry) => entry.msg === 'listed events loaded')).toMatchObject({
+        events: first.events.listedEvents().length,
+      });
+      // Into the Wild is on and the feed lists it without times; the Community Day is dropped.
+      now = at('2026-11-11T12:00');
+      body = JSON.stringify(
+        spawnFeed()
+          .filter((event) => event.eventID !== 'november-communityday2026')
+          .map((event) =>
+            event.eventID === 'into-the-wild-2026' ? { ...event, start: null, end: null } : event,
+          ),
+      );
+      const { events, entries } = service(fetch, { listed: store, now: () => now });
+      await events.loadListed();
+      await events.refresh();
+      const ids = events.listedEvents().map((event) => event.id);
+      expect(ids).toContain('into-the-wild-2026');
+      expect(ids).not.toContain('november-communityday2026');
+      expect(
+        entries.find((entry) => entry.msg === 'a listed event was dropped before its start'),
+      ).toMatchObject({ event: 'november-communityday2026' });
+    });
+
+    it('says once that a kind is not known, and lists it', async () => {
+      const showcase = {
+        eventID: 'pokestop-showcase-2026-11-20',
+        name: 'PokéStop Showcase',
+        eventType: 'pokestop-showcase',
+        start: '2026-11-20T10:00:00.000',
+        end: '2026-11-21T20:00:00.000',
+      };
+      const feed = JSON.stringify([...spawnFeed(), showcase]);
+      const { events, entries } = service(() => Promise.resolve(reply(200, feed)), {
+        now: () => at('2026-11-10T12:00'),
+      });
+      await events.refresh();
+      await events.refresh();
+      expect(events.listedEvents().map((event) => event.id)).toContain(showcase.eventID);
+      expect(
+        entries.filter((entry) => entry.msg === 'an event type the events forum does not know'),
+      ).toEqual([
+        expect.objectContaining({
+          level: 40,
+          eventType: 'pokestop-showcase',
+          event: showcase.eventID,
+        }),
+      ]);
+    });
+
+    it('keeps the listing of a read that cannot be stored, and one it cannot load, saying so', async () => {
+      const store = new MemoryListedEvents();
+      store.failing.set('replace', new Error('database down'));
+      store.failing.set('all', new Error('database down'));
+      const feed = JSON.stringify(spawnFeed());
+      const { events, entries } = service(() => Promise.resolve(reply(200, feed)), {
+        listed: store,
+        now: () => at('2026-11-10T12:00'),
+      });
+      await events.loadListed();
+      await expect(events.refresh()).resolves.toMatchObject({ status: 'updated' });
+      expect(events.listedEvents().length).toBeGreaterThan(5);
+      const said = entries.map((entry) => entry.msg);
+      expect(said).toContain('could not read the kept listed events');
+      expect(said).toContain('could not keep the listed events of the feed');
+    });
+
+    // Review V1: the forum neither drops nor posts before the listing is known.
+    it('knows the listing once the kept events are loaded or a read succeeded, not before', async () => {
+      const store = new MemoryListedEvents();
+      const loaded = service(() => Promise.resolve(reply(500)), { listed: store });
+      expect(loaded.events.listingKnown()).toBe(false);
+      await loaded.events.refresh();
+      expect(loaded.events.listingKnown()).toBe(false);
+      await loaded.events.loadListed();
+      expect(loaded.events.listingKnown()).toBe(true);
+      const broken = new MemoryListedEvents();
+      broken.failing.set('all', new Error('database down'));
+      const feed = JSON.stringify(spawnFeed());
+      const read = service(() => Promise.resolve(reply(200, feed)), {
+        listed: broken,
+        now: () => at('2026-11-10T12:00'),
+      });
+      await read.events.loadListed();
+      expect(read.events.listingKnown()).toBe(false);
+      await read.events.refresh();
+      expect(read.events.listingKnown()).toBe(true);
+    });
+
+    it('names the events a read dropped before their start, until that start', async () => {
+      let body = JSON.stringify(spawnFeed());
+      let now = at('2026-11-10T12:00');
+      const { events } = service(() => Promise.resolve(reply(200, body)), { now: () => now });
+      await events.refresh();
+      expect(events.droppedIds()).toEqual(new Set());
+      body = JSON.stringify(
+        spawnFeed().filter((event) => event.eventID !== 'november-communityday2026'),
+      );
+      await events.refresh();
+      expect(events.droppedIds()).toEqual(new Set(['november-communityday2026']));
+      now = at('2026-11-21T14:00');
+      expect(events.droppedIds()).toEqual(new Set());
+    });
+
+    // Review V10 (ruling R5): one path, the max and big events as merged.
+    it('takes a big event’s times from the merged big events, also one the read lists without times', async () => {
+      const wild = 'pokemon-go-wild-area-2026-global';
+      const now = at('2026-11-14T12:00');
+      const full = readMaxEventFeed() as { eventID?: string; start?: string | null }[];
+      const first = service(() => Promise.resolve(reply(200, JSON.stringify(full))), {
+        maxEvents: new MemoryMaxEvents(),
+        now: () => now,
+      });
+      await first.events.refresh();
+      const kept = new MemoryMaxEvents({ big: [...first.events.bigEvents()] });
+      const untimed = full.map((event) =>
+        event.eventID === wild ? { ...event, start: null, end: null } : event,
+      );
+      const { events } = service(() => Promise.resolve(reply(200, JSON.stringify(untimed))), {
+        maxEvents: kept,
+        listed: new MemoryListedEvents(),
+        now: () => now,
+      });
+      await events.loadMax();
+      await events.loadListed();
+      await events.refresh();
+      const big = events.bigEvents().find((event) => event.id === wild);
+      const line = events.listedEvents().find((event) => event.id === wild);
+      expect(big).toBeDefined();
+      expect(line && [line.start, line.end]).toEqual(big && [big.start, big.end]);
+    });
+  });
+
   // Plan 8X-3: the big events with Gigantamax battles all day, of the same feed.
   describe('the big events', () => {
     it('keeps the global editions of a read, and those it had when a read fails', async () => {
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index 213f328244973d1e399460055f8222581714904f..53791590d95138e8a56028f65a0ad664e1bc6e6f 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -6,6 +6,7 @@ import {
   type ParsedMaxEvents,
 } from '../domain/time/max-events.js';
 import { parseRaidEventFeed, type RaidEvent } from '../domain/time/raid-events.js';
+import { mergeListed, readListedEvents, type ListedEvent } from '../domain/time/event-listing.js';
 import {
   feedHasResearchFlags,
   isResearchEventKind,
@@ -19,6 +20,7 @@ import { parseSpawnEventFeed, type SpawnEvent } from '../domain/time/spawn-event
 import { isoDate } from '../domain/time/zoned.js';
 import type { ResearchEventStorage } from '../db/repositories/research-event-repository.js';
 import type { KeptMaxEvents, MaxEventStorage } from '../db/repositories/max-event-repository.js';
+import type { ListedEventStorage } from '../db/repositories/listed-event-repository.js';
 import type { Logger } from '../log.js';
 import type { CatchUpOutcome } from './catch-up.js';
 import { failureReason } from './failure-reason.js';
@@ -36,6 +38,8 @@ const MAX_TIMER_MS = 2 ** 31 - 1;
 const UNREAD_TYPES_TOLD_MAX = 100;
 /** How many events without `global` the log remembers having named (a few such events a year). */
 const WITHOUT_GLOBAL_TOLD_MAX = 100;
+/** How many event types the events forum does not know the log remembers having named. */
+const UNKNOWN_KINDS_TOLD_MAX = 100;
 
 /** One max event by its feed id, whatever the feed renamed or moved; else by kind, name, start. */
 function sameMaxEvent(a: MaxEvent, b: MaxEvent): boolean {
@@ -85,6 +89,11 @@ export interface RaidEventOptions {
    * in memory only.
    */
   maxEvents?: MaxEventStorage;
+  /**
+   * Where the events forum's listed events are kept as last merged (plan 8V-1), so that the
+   * listing survives a restart and a feed that fails. Without it they are kept in memory only.
+   */
+  listed?: ListedEventStorage;
 }
 
 /** What handlers need: the Raid Hours and Raid Days known from the feed. */
@@ -132,6 +141,32 @@ export interface SpawnEventProvider {
   spawnEvents(): readonly SpawnEvent[];
 }
 
+/**
+ * The events of the events forum (plan 8V-1): those listed (`isListed`) of the last good read
+ * merged with those kept (`mergeListed`), from the same read as the raid and max events (R4).
+ */
+export interface ListedEventProvider {
+  /** In order of their start; empty until the feed was read or the kept ones loaded. */
+  listedEvents(): readonly ListedEvent[];
+  /**
+   * Calls `listener` after each good read and after the kept ones are loaded, changed or not:
+   * the forum draws after each read (an unchanged message is not edited). Must not throw.
+   */
+  onListedChange(listener: () => void): void;
+  /**
+   * Whether the listing is known (review V1): the kept events were loaded, or a read succeeded.
+   * Until then an empty or stale listing says nothing of what was dropped, and the forum neither
+   * drops nor makes a post.
+   */
+  listingKnown(): boolean;
+  /**
+   * The ids of the events a read dropped before their start (`mergeListed`'s `dropped`), each
+   * until that start (review V1): only those are said to be dropped in their post. Not kept
+   * across a restart.
+   */
+  droppedIds(): ReadonlySet<string>;
+}
+
 export type RefreshResult =
   | { status: 'updated'; events: number }
   /** The feed could not be read or was not valid; the events in use are unchanged. */
@@ -151,7 +186,12 @@ export type RefreshResult =
  * are kept in memory only, from the same read as the research events.
  */
 export class RaidEventService
-  implements RaidEventProvider, MaxEventProvider, ResearchEventProvider, SpawnEventProvider
+  implements
+    RaidEventProvider,
+    MaxEventProvider,
+    ResearchEventProvider,
+    SpawnEventProvider,
+    ListedEventProvider
 {
   private current: readonly RaidEvent[] = [];
   private research: readonly ResearchEvent[] = [];
@@ -165,6 +205,14 @@ export class RaidEventService
   private currentMax: readonly MaxEvent[] = [];
   private currentBig: readonly BigEvent[] = [];
   private currentSpawns: readonly SpawnEvent[] = [];
+  private currentListed: readonly ListedEvent[] = [];
+  private readonly listedListeners: (() => void)[] = [];
+  /** Whether the listing is known (`listingKnown`). */
+  private listedKnown = false;
+  /** The events dropped before their start, by id (`droppedIds`). */
+  private readonly dropped = new Map<string, ListedEvent>();
+  /** The event types the events forum does not know that the log has named (once each). */
+  private readonly unknownKindsTold = new BoundedMap<string, true>(UNKNOWN_KINDS_TOLD_MAX);
   private readonly timeoutMs: number;
   private readonly retryMs: number;
   private controller: AbortController | undefined;
@@ -207,6 +255,105 @@ export class RaidEventService
     this.researchListeners.push(listener);
   }
 
+  listedEvents(): readonly ListedEvent[] {
+    return this.currentListed;
+  }
+
+  onListedChange(listener: () => void): void {
+    this.listedListeners.push(listener);
+  }
+
+  listingKnown(): boolean {
+    return this.listedKnown;
+  }
+
+  droppedIds(): ReadonlySet<string> {
+    const now = (this.options.now ?? Date.now)();
+    for (const [id, event] of this.dropped) {
+      if (event.start <= now) this.dropped.delete(id);
+    }
+    return new Set(this.dropped.keys());
+  }
+
+  /**
+   * Takes the listed events kept by the last run (plan 8V-1; no network), before the first read,
+   * as `loadMax`: it must stay before `start()` in `app.ts`, or a read would merge without them.
+   * An event a read has given meanwhile stays as read; what cannot be read is logged, and the
+   * service starts without them. The listeners are told.
+   */
+  async loadListed(): Promise<void> {
+    let kept: ListedEvent[] | undefined;
+    try {
+      kept = await this.options.listed?.all();
+    } catch (err) {
+      this.safely(() => this.options.log.warn({ err }, 'could not read the kept listed events'));
+      return;
+    }
+    if (!kept) return;
+    this.listedKnown = true;
+    const read = new Set(this.currentListed.map((event) => event.id));
+    this.currentListed = inOrder([
+      ...kept.filter((old) => !read.has(old.id)),
+      ...this.currentListed,
+    ]);
+    const events = kept.length;
+    this.safely(() => this.options.log.info({ events }, 'listed events loaded'));
+    this.tellListed();
+  }
+
+  /** Tells the listeners of the listed events; one that throws is logged. */
+  private tellListed(): void {
+    for (const listener of this.listedListeners) {
+      try {
+        listener();
+      } catch (err) {
+        this.safely(() =>
+          this.options.log.error({ err }, 'a listener of the listed events failed'),
+        );
+      }
+    }
+  }
+
+  /**
+   * The listed events of a read (plan 8V-1): read from the same document, the max and big events
+   * as just parsed (R4), merged with those known (`mergeListed`), kept in the database; a move
+   * and a drop before the start said, a kind not known said once at warn. What fails here is
+   * logged; the raid events of the read stand.
+   */
+  private async keepListed(json: unknown, max: readonly MaxEvent[], big: readonly BigEvent[]) {
+    const { log, zone, listed } = this.options;
+    try {
+      const listing = readListedEvents(json, zone, { max, big });
+      for (const { eventType, id } of listing.unknownKinds) {
+        if (this.unknownKindsTold.has(eventType)) continue;
+        this.unknownKindsTold.set(eventType, true);
+        this.safely(() =>
+          log.warn({ eventType, event: id }, 'an event type the events forum does not know'),
+        );
+      }
+      const merged = mergeListed(this.currentListed, listing, (this.options.now ?? Date.now)());
+      this.currentListed = merged.events;
+      this.listedKnown = true;
+      for (const event of merged.dropped) this.dropped.set(event.id, event);
+      // An id listed again is no longer dropped.
+      for (const event of merged.events) this.dropped.delete(event.id);
+      for (const { from, to } of merged.moved) {
+        this.safely(() => log.info({ from, to }, 'a listed event moved to a new id'));
+      }
+      for (const { id } of merged.dropped) {
+        this.safely(() => log.info({ event: id }, 'a listed event was dropped before its start'));
+      }
+    } catch (err) {
+      this.safely(() => log.warn({ err }, 'could not read the listed events of the feed'));
+      return;
+    }
+    try {
+      await listed?.replace(this.currentListed);
+    } catch (err) {
+      this.safely(() => log.warn({ err }, 'could not keep the listed events of the feed'));
+    }
+  }
+
   /**
    * Takes the max events and the big events kept by the last run (plan 8X-F; no network), before
    * the first read: the week's featured boss and a max battle's default end come from them until
@@ -374,6 +521,8 @@ export class RaidEventService
       this.currentBig = this.mergedBig(read.big);
       this.tellOfEditionsWithoutGlobal(read.json, read.big);
       await this.keepMax();
+      // The max and big events as merged (review V10, ruling R5): one path for their times.
+      await this.keepListed(read.json, this.currentMax, this.currentBig);
       this.tellOfHours(read.max);
       await this.keepResearch(read.json);
     } catch (err) {
@@ -385,6 +534,8 @@ export class RaidEventService
     const events = this.current.length;
     const counts = { events, max: this.currentMax.length, big: this.currentBig.length };
     this.safely(() => log.info(counts, 'raid events read'));
+    // After the read, so that a listener reads the listing of this very read.
+    this.tellListed();
     return { status: 'updated', events };
   }
 
diff --git a/test/support/event-forum-store-cases.ts b/test/support/event-forum-store-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..415ea09c2ae9f68f4fe82e9deb6042b03722da7e
--- /dev/null
+++ b/test/support/event-forum-store-cases.ts
@@ -0,0 +1,188 @@
+import { expect, it } from 'vitest';
+import type {
+  EventForumStorage,
+  EventPostRecord,
+} from '../../src/db/repositories/event-forum-repository.js';
+import type { ListedEventStorage } from '../../src/db/repositories/listed-event-repository.js';
+import type { ListedEvent } from '../../src/domain/time/event-listing.js';
+
+/** A listed event of the tests: Pawniard Community Day, 2026-11-21 14:00 to 17:00 (New York). */
+export function listedEvent(overrides: Partial<ListedEvent> = {}): ListedEvent {
+  return {
+    id: 'november-communityday2026',
+    name: 'Pawniard Community Day',
+    eventType: 'community-day',
+    link: 'https://leekduck.com/events/november-communityday2026/',
+    image: 'https://cdn.leekduck.com/assets/img/events/cd/pawniard.jpg',
+    start: Date.UTC(2026, 10, 21, 19),
+    end: Date.UTC(2026, 10, 21, 22),
+    formerIds: [],
+    ...overrides,
+  };
+}
+
+/** What the kept listed events do (plan 8V-1), for the repository and its twin. */
+export function listedEventCases(made: () => Promise<ListedEventStorage>): void {
+  it('keeps nothing before the first read', async () => {
+    expect(await (await made()).all()).toEqual([]);
+  });
+
+  it('keeps the events as given, every field, in order of their start', async () => {
+    const store = await made();
+    const day = listedEvent();
+    const hour = listedEvent({
+      id: 'raidhour20261118',
+      name: 'Cresselia and Darkrai Raid Hour',
+      eventType: 'raid-hour',
+      link: null,
+      image: null,
+      start: Date.UTC(2026, 10, 18, 23),
+      end: Date.UTC(2026, 10, 19, 0),
+      formerIds: ['raidhour20261117', 'raidhour20261116'],
+    });
+    await store.replace([day, hour]);
+    expect(await store.all()).toEqual([hour, day]);
+  });
+
+  it('keeps what the last replace gave in the place of all it kept before', async () => {
+    const store = await made();
+    await store.replace([listedEvent()]);
+    const other = listedEvent({ id: 'other', name: 'Other' });
+    await store.replace([other]);
+    expect(await store.all()).toEqual([other]);
+    await store.replace([]);
+    expect(await store.all()).toEqual([]);
+  });
+}
+
+const post = (overrides: Partial<EventPostRecord> = {}): EventPostRecord => ({
+  serverId: '100000000000000001',
+  eventId: 'november-communityday2026',
+  postId: '200000000000000001',
+  name: 'Pawniard Community Day',
+  start: Date.UTC(2026, 10, 21, 19),
+  end: Date.UTC(2026, 10, 21, 22),
+  endedAt: null,
+  archivedAt: null,
+  dropped: false,
+  gone: false,
+  ...overrides,
+});
+
+const SERVER = '100000000000000001';
+const FORUM = '300000000000000001';
+
+/** What the events forums and their posts do (plan 8V-1), for the repository and its twin. */
+export function eventForumCases(made: () => Promise<EventForumStorage>): void {
+  it('records a server’s forum without a listing, and finds it', async () => {
+    const store = await made();
+    expect(await store.forum(SERVER)).toBeUndefined();
+    await store.setForum(SERVER, FORUM);
+    expect(await store.forum(SERVER)).toEqual({
+      serverId: SERVER,
+      forumId: FORUM,
+      listingPostId: null,
+    });
+    expect(await store.forums()).toEqual([
+      { serverId: SERVER, forumId: FORUM, listingPostId: null },
+    ]);
+  });
+
+  it('records the listing of the forum it is in, and refuses it for another forum', async () => {
+    const store = await made();
+    await store.setForum(SERVER, FORUM);
+    expect(await store.setListing(SERVER, FORUM, '400000000000000001')).toBe(true);
+    // The same post again is no change, and still the forum's.
+    expect(await store.setListing(SERVER, FORUM, '400000000000000001')).toBe(true);
+    expect(await store.setListing(SERVER, '300000000000000009', '400000000000000002')).toBe(false);
+    expect((await store.forum(SERVER))?.listingPostId).toBe('400000000000000001');
+  });
+
+  it('keeps the listing for the same forum, and forgets it for another (R7)', async () => {
+    const store = await made();
+    await store.setForum(SERVER, FORUM);
+    await store.setListing(SERVER, FORUM, '400000000000000001');
+    await store.setForum(SERVER, FORUM);
+    expect((await store.forum(SERVER))?.listingPostId).toBe('400000000000000001');
+    await store.setForum(SERVER, '300000000000000002');
+    expect(await store.forum(SERVER)).toEqual({
+      serverId: SERVER,
+      forumId: '300000000000000002',
+      listingPostId: null,
+    });
+  });
+
+  // Review V2: the posts of another forum are no posts of this one.
+  it('retires the server’s live posts when its forum changes, and keeps those of the same forum', async () => {
+    const store = await made();
+    await store.setForum(SERVER, FORUM);
+    await store.addPost(post());
+    await store.addPost(post({ eventId: 'deleted-by-hand', gone: true }));
+    const elsewhere = post({ serverId: '100000000000000002' });
+    await store.addPost(elsewhere);
+    await store.setForum(SERVER, FORUM);
+    expect((await store.posts(SERVER)).map((row) => row.eventId)).toEqual([
+      'deleted-by-hand',
+      'november-communityday2026',
+    ]);
+    await store.setForum(SERVER, '300000000000000002');
+    expect(await store.posts(SERVER)).toEqual([post({ eventId: 'deleted-by-hand', gone: true })]);
+    expect(await store.posts('100000000000000002')).toEqual([elsewhere]);
+  });
+
+  it('records a post once per event and server, every field', async () => {
+    const store = await made();
+    const first = post();
+    expect(await store.addPost(first)).toBe(true);
+    expect(await store.addPost(post({ postId: '200000000000000009' }))).toBe(false);
+    const elsewhere = post({ serverId: '100000000000000002' });
+    expect(await store.addPost(elsewhere)).toBe(true);
+    expect(await store.posts(SERVER)).toEqual([first]);
+    const ended = post({
+      eventId: 'into-the-wild-2026',
+      endedAt: 5,
+      archivedAt: 6,
+      dropped: true,
+      gone: true,
+    });
+    await store.addPost(ended);
+    expect(await store.posts(SERVER)).toEqual([ended, first]);
+  });
+
+  it('changes what is asked of a post, and nothing else', async () => {
+    const store = await made();
+    await store.addPost(post());
+    await store.updatePost(SERVER, 'november-communityday2026', {
+      name: 'Pawniard Community Day (Rescheduled)',
+      start: 1,
+      end: 2,
+      endedAt: 3,
+    });
+    await store.updatePost(SERVER, 'november-communityday2026', { gone: true, archivedAt: 4 });
+    await store.updatePost(SERVER, 'november-communityday2026', {});
+    expect(await store.posts(SERVER)).toEqual([
+      post({
+        name: 'Pawniard Community Day (Rescheduled)',
+        start: 1,
+        end: 2,
+        endedAt: 3,
+        archivedAt: 4,
+        gone: true,
+      }),
+    ]);
+  });
+
+  it('moves a post’s row to its event’s new id, unless that id has one (R12)', async () => {
+    const store = await made();
+    await store.addPost(post());
+    expect(await store.movePost(SERVER, 'november-communityday2026', 'new-id')).toBe(true);
+    expect((await store.posts(SERVER)).map((row) => row.eventId)).toEqual(['new-id']);
+    expect(await store.movePost(SERVER, 'nothing', 'other')).toBe(false);
+    await store.addPost(post({ eventId: 'taken' }));
+    expect(await store.movePost(SERVER, 'new-id', 'taken')).toBe(false);
+    expect((await store.posts(SERVER)).map((row) => row.eventId).sort()).toEqual([
+      'new-id',
+      'taken',
+    ]);
+  });
+}
diff --git a/test/support/event-forum-store.test.ts b/test/support/event-forum-store.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6148e90cbdf445fefc2a63e392bb698ed82fe36a
--- /dev/null
+++ b/test/support/event-forum-store.test.ts
@@ -0,0 +1,11 @@
+import { describe } from 'vitest';
+import { eventForumCases, listedEventCases } from './event-forum-store-cases.js';
+import { MemoryEventForums, MemoryListedEvents } from './event-forum-store.js';
+
+describe('MemoryEventForums', () => {
+  eventForumCases(() => Promise.resolve(new MemoryEventForums()));
+});
+
+describe('MemoryListedEvents', () => {
+  listedEventCases(() => Promise.resolve(new MemoryListedEvents()));
+});
diff --git a/test/support/event-forum-store.ts b/test/support/event-forum-store.ts
new file mode 100644
index 0000000000000000000000000000000000000000..145833f757937fde6328d81e8c7411f1665870a5
--- /dev/null
+++ b/test/support/event-forum-store.ts
@@ -0,0 +1,133 @@
+import type {
+  EventForumRecord,
+  EventForumStorage,
+  EventPostChange,
+  EventPostRecord,
+} from '../../src/db/repositories/event-forum-repository.js';
+import type { ListedEventStorage } from '../../src/db/repositories/listed-event-repository.js';
+import type { ListedEvent } from '../../src/domain/time/event-listing.js';
+
+/**
+ * The events forums and their posts in memory (`EventForumStorage`), the twin of
+ * `EventForumRepository`; `failing` per method (a rejected promise, as the repository fails).
+ */
+export class MemoryEventForums implements EventForumStorage {
+  private readonly forumRows = new Map<string, EventForumRecord>();
+  private readonly postRows: EventPostRecord[] = [];
+  readonly failing = new Map<keyof EventForumStorage, Error>();
+
+  private fails(method: keyof EventForumStorage): Promise<never> | undefined {
+    const err = this.failing.get(method);
+    return err ? Promise.reject(err) : undefined;
+  }
+
+  forums(): Promise<EventForumRecord[]> {
+    return (
+      this.fails('forums') ??
+      Promise.resolve(
+        [...this.forumRows.values()]
+          .map((row) => ({ ...row }))
+          .sort((a, b) => a.serverId.localeCompare(b.serverId)),
+      )
+    );
+  }
+
+  forum(serverId: string): Promise<EventForumRecord | undefined> {
+    const row = this.forumRows.get(serverId);
+    return this.fails('forum') ?? Promise.resolve(row && { ...row });
+  }
+
+  setForum(serverId: string, forumId: string): Promise<void> {
+    const failed = this.fails('setForum');
+    if (failed) return failed;
+    const row = this.forumRows.get(serverId);
+    if (row?.forumId !== forumId) {
+      // Another forum retires the server's live posts, as the repository does (review V2).
+      if (row) {
+        const kept = this.postRows.filter((one) => one.serverId !== serverId || one.gone);
+        this.postRows.splice(0, this.postRows.length, ...kept);
+      }
+      this.forumRows.set(serverId, { serverId, forumId, listingPostId: null });
+    }
+    return Promise.resolve();
+  }
+
+  setListing(serverId: string, forumId: string, postId: string | null): Promise<boolean> {
+    const failed = this.fails('setListing');
+    if (failed) return failed;
+    const row = this.forumRows.get(serverId);
+    if (row?.forumId !== forumId) return Promise.resolve(false);
+    row.listingPostId = postId;
+    return Promise.resolve(true);
+  }
+
+  posts(serverId: string): Promise<EventPostRecord[]> {
+    return (
+      this.fails('posts') ??
+      Promise.resolve(
+        this.postRows
+          .filter((row) => row.serverId === serverId)
+          .map((row) => ({ ...row }))
+          .sort((a, b) => (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)),
+      )
+    );
+  }
+
+  addPost(record: EventPostRecord): Promise<boolean> {
+    const failed = this.fails('addPost');
+    if (failed) return failed;
+    if (this.find(record.serverId, record.eventId)) return Promise.resolve(false);
+    this.postRows.push({ ...record });
+    return Promise.resolve(true);
+  }
+
+  updatePost(serverId: string, eventId: string, change: EventPostChange): Promise<void> {
+    const failed = this.fails('updatePost');
+    if (failed) return failed;
+    const row = this.find(serverId, eventId);
+    if (row) Object.assign(row, change);
+    return Promise.resolve();
+  }
+
+  movePost(serverId: string, from: string, to: string): Promise<boolean> {
+    const failed = this.fails('movePost');
+    if (failed) return failed;
+    const row = this.find(serverId, from);
+    if (!row || this.find(serverId, to)) return Promise.resolve(false);
+    row.eventId = to;
+    return Promise.resolve(true);
+  }
+
+  private find(serverId: string, eventId: string): EventPostRecord | undefined {
+    return this.postRows.find((row) => row.serverId === serverId && row.eventId === eventId);
+  }
+}
+
+/** The listed events in memory (`ListedEventStorage`), the twin of `ListedEventRepository`. */
+export class MemoryListedEvents implements ListedEventStorage {
+  private kept: ListedEvent[];
+  readonly failing = new Map<keyof ListedEventStorage, Error>();
+
+  constructor(kept: readonly ListedEvent[] = []) {
+    this.kept = copy(kept);
+  }
+
+  all(): Promise<ListedEvent[]> {
+    const err = this.failing.get('all');
+    return err ? Promise.reject(err) : Promise.resolve(copy(this.kept));
+  }
+
+  replace(events: readonly ListedEvent[]): Promise<void> {
+    const err = this.failing.get('replace');
+    if (err) return Promise.reject(err);
+    this.kept = copy(events);
+    return Promise.resolve();
+  }
+}
+
+/** In order of the start, then the name, as the repository gives them; copies. */
+function copy(events: readonly ListedEvent[]): ListedEvent[] {
+  return events
+    .map((event) => ({ ...event, formerIds: [...event.formerIds] }))
+    .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
+}
````

### Task 3: 8V-1 task 3: the events forum's settings, setup and gateway

Prototype commit: `2249815ff40d03d9d1f5052b1d262c09a23aec83`

settings.channels.events names the events forum (blank is unset; the
moderators' channel may not be it) and settings.eventsForum gives its reach
(horizonDays 35, postDaysAhead 14, at most horizonDays). /admin setup-forums
makes the forum beside bot-updates (EventForumService.setup: found by name,
recorded, Create Posts kept to the bot, Manage Posts allowed to it) and says
what it could not do; never in rehearsal mode, where app.ts makes no events
forum service. cutover-check warns of a named forum the server lacks and of
what the bot lacks in it (EVENTS_FORUM_NEEDS).

PartyGateway gains setAutoArchive, archiveUnlocked, lockPost, archivedPosts
and letBotManagePosts, in DiscordPartyGateway and the fake.

**Files:**

```
 data/settings.json                      |   3 ++-
 src/app-context.ts                      |   6 ++++++
 src/app.ts                              |  15 ++++++++++++++
 src/commands/admin/setup-forums.test.ts |  77 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/commands/admin/setup-forums.ts      |  46 ++++++++++++++++++++++++++++++++++++++++-
 src/config/settings.test.ts             |  52 ++++++++++++++++++++++++++++++++++++++++++++++
 src/config/settings.ts                  |  51 ++++++++++++++++++++++++++++++++++++---------
 src/discord/party-gateway.test.ts       | 173 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/discord/party-gateway.ts            | 121 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/ops/cutover-check.test.ts           |  45 ++++++++++++++++++++++++++++++++++++++++
 src/ops/cutover-check.ts                |  48 ++++++++++++++++++++++++++++++++++++++++++
 src/ops/permissions.ts                  |  14 +++++++++++++
 src/services/event-forum.test.ts        | 140 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/event-forum.ts             |  91 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/fake-gateway.ts            |  61 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 15 files changed, 928 insertions(+), 15 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/config/settings.test.ts src/discord/party-gateway.test.ts src/ops/cutover-check.test.ts src/services/event-forum.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2249815ff40d03d9d1f5052b1d262c09a23aec83 -- src test data docs/architecture docs/guides docs/superpowers/plans/2026-10-29-phase-8v1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8V-1 task 3: the events forum's settings, setup and gateway`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/data/settings.json b/data/settings.json
index 045ce38587559992ee55dcc60be470bf86392c0c..3cd0413532991b4813c9979233470be7d5fe4fa5 100644
--- a/data/settings.json
+++ b/data/settings.json
@@ -49,7 +49,8 @@
     "remote-raids": "remote-raids",
     "pvp": "rank-checker",
     "bot-updates": "bot-updates",
-    "moderation": ""
+    "moderation": "",
+    "events": ""
   },
   "categories": {
     "pvp": "PVP CHAT AND TOURNAMENTS"
diff --git a/src/app-context.ts b/src/app-context.ts
index e3cbb874137babbe08cec3222a51e380f35bca80..6929aa9c98afc48ba6dd385846c1a79a4a58d3df 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -56,6 +56,7 @@ import type { WayfarerImportService } from './services/wayfarer-import-service.j
 import type { WayfarerReviewService } from './services/wayfarer-review-service.js';
 import type { WayspotProvider } from './services/wayspot-directory.js';
 import type { Rehearsal } from './services/rehearsal.js';
+import type { EventForumService } from './services/event-forum.js';
 import type { LegacyCleanup } from './services/legacy-cleanup.js';
 import type { LoginLinks } from './web/login-links.js';
 import type { MeetupSafety } from './services/meetup-safety.js';
@@ -217,4 +218,9 @@ export interface AppContext {
    * cleanup of legacy channels only lists.
    */
   readonly rehearsal?: Rehearsal;
+  /**
+   * The events forum (plan 8V-1): only where `settings.channels.events` names one and rehearsal
+   * mode is off; `/admin setup-forums` makes it.
+   */
+  readonly eventForum?: EventForumService;
 }
diff --git a/src/app.ts b/src/app.ts
index 912ebcd2dfb0c9bfce1d6f8175d2055ebd79a9e2..6a10b08516fba1f7b544326042ffc01091505523 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -88,6 +88,8 @@ import { RocketService } from './services/rocket-reports.js';
 import { ResearchEventRepository } from './db/repositories/research-event-repository.js';
 import { MaxEventRepository } from './db/repositories/max-event-repository.js';
 import { ListedEventRepository } from './db/repositories/listed-event-repository.js';
+import { EventForumRepository } from './db/repositories/event-forum-repository.js';
+import { EventForumService } from './services/event-forum.js';
 import { StopReportRepository } from './db/repositories/stop-report-repository.js';
 import { StopReportService } from './services/stop-reports.js';
 import { rewardHash } from './domain/research/versions.js';
@@ -539,6 +541,18 @@ export async function startApp(
         pictures: stopPictures,
         log,
       });
+  // The events forum (plan 8V-1): only where the settings name one, never in rehearsal mode (R8:
+  // the rehearsal's gateway would drop and log its posts at every draw).
+  const eventForum =
+    rehearsal || config.settings.channels.events === undefined
+      ? undefined
+      : new EventForumService({
+          gateway: partyGateway,
+          store: new EventForumRepository(db),
+          events: raidEvents,
+          settings: config.settings,
+          log,
+        });
   // Who wants a Rocket report hears of it once its messages are posted (plan 8R-2, design 7).
   const rocket = new RocketService({
     reports: stopReports,
@@ -990,6 +1004,7 @@ export async function startApp(
     emoji: emojiFinder(appEmoji, appEmojiSource),
     features: requested,
     ...(rehearsal ? { rehearsal } : {}),
+    ...(eventForum ? { eventForum } : {}),
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
   // said in the log of the start, and the help of `/wild` names the ones it does.
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index 06a8ebc1484d5f0b0eba55ebe4f1caa4b02bef1f..a9fac2df479cf3f92431ab46bdbabbafcd2c1186 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -24,18 +24,46 @@ import { loadSettings, type Settings } from '../../config/settings.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { FORUM_TAGS } from '../../render/party-post.js';
 import { Rehearsal } from '../../services/rehearsal.js';
+import { EventForumService } from '../../services/event-forum.js';
+import { MemoryEventForums } from '../../../test/support/event-forum-store.js';
 import { admin } from './index.js';
 
-async function setup(changed: Partial<Settings> = {}, rehearsal?: Rehearsal) {
+/** The server's bot-updates channel, beside which the events forum is made (plan 8V-1). */
+const BOT_UPDATES = '500000000000000010';
+
+async function setup(
+  changed: Partial<Settings> = {},
+  rehearsal?: Rehearsal,
+  options: { events?: boolean; feedUnread?: boolean } = {},
+) {
   const made = await partyServiceWith([], {
     settings: { ...loadSettings(TEST_SETTINGS_PATH), ...changed },
     ...(rehearsal ? { rehearsal } : {}),
   });
+  // The events forum (plan 8V-1), where the settings name one; never in rehearsal mode.
+  const loaded = loadSettings(TEST_SETTINGS_PATH);
+  made.gateway.addChannel(BOT_UPDATES, 'bot-updates');
+  const eventForum =
+    options.events === true
+      ? new EventForumService({
+          gateway: made.gateway,
+          store: new MemoryEventForums(),
+          events: {
+            listedEvents: () => [],
+            onListedChange: () => undefined,
+            listingKnown: () => options.feedUnread !== true,
+            droppedIds: () => new Set<string>(),
+          },
+          settings: { ...loaded, channels: { ...loaded.channels, events: 'events' } },
+          log: made.log,
+        })
+      : undefined;
   const { ctx, entries: said } = createTestContext({
     partyService: made.service,
     parties: made.store,
     regions: made.regions,
     ...(rehearsal ? { rehearsal } : {}),
+    ...(eventForum ? { eventForum } : {}),
   });
   const router = new InteractionRouter(ctx, [admin], []);
   const run = async (roleNames: string[] = ['Admin']) => {
@@ -122,6 +150,53 @@ describe('/admin setup-forums', () => {
     ]);
   });
 
+  // Plan 8V-1: the events forum, where the settings name one.
+  it('makes the events forum beside bot-updates and says so, after the regions', async () => {
+    const { run, gateway } = await setup({}, undefined, { events: true });
+    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
+    const forumId = [...gateway.forums].find(([, forum]) => forum.name === 'events')?.[0];
+    expect(forumId).toBeDefined();
+    expect(gateway.forums.get(forumId ?? '')?.regionChannelId).toBe(BOT_UPDATES);
+    expect(lines.at(-1)).toBe(
+      `Events forum: created <#${forumId}>, closed it to posts by members.`,
+    );
+    // Run again: it is there.
+    const again = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
+    expect(again.at(-1)).toBe(`Events forum: <#${forumId}> is ready.`);
+  });
+
+  it('says what it could not do in the events forum, or why it has none', async () => {
+    const { run, gateway } = await setup({}, undefined, { events: true });
+    gateway.addForum('600000000000000001', [], 'events');
+    gateway.noReserving.add('600000000000000001');
+    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
+    expect(lines.at(-1)).toBe(
+      'Events forum: <#600000000000000001> is ready. I could not close it to posts by members ' +
+        '(I need Manage Permissions and Send Messages there; see the log). I could not let ' +
+        'myself manage its posts (give me Manage Posts and Manage Permissions there).',
+    );
+    const without = await setup({}, undefined, { events: true });
+    without.gateway.channels.delete(BOT_UPDATES);
+    const said = sent((await without.run()).editReply).content?.split(NEWLINE) ?? [];
+    expect(said.at(-1)).toBe(
+      'Events forum: this server has no #bot-updates to make #events beside: add that channel, ' +
+        'or make the forum #events by hand, and run this again.',
+    );
+  });
+
+  it('leaves the events forum out in rehearsal mode', async () => {
+    const rehearsal = new Rehearsal({
+      allowlist: ['200000000000000002'],
+      regions: ['north'],
+      staffRoles: ['Moderator'],
+    });
+    const { run, gateway } = await setup({}, rehearsal, { events: true });
+    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
+    const content = sent((await run(['Admin', 'Moderator'])).editReply).content ?? '';
+    expect(content).not.toContain('Events forum');
+    expect([...gateway.forums.values()].map((forum) => forum.name)).not.toContain('events');
+  });
+
   it('leaves the making of posts in a forum to the bot, in a new forum and in an old one', async () => {
     const { run, gateway, regions } = await setup();
     await run();
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index 7b9800b9474257b7f134e59b2ebb6b6a47ffddbe..1437323947a4c2b35f80d8ed03548f9a167bb2f0 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -4,6 +4,7 @@ import { UserError } from '../../discord/errors.js';
 import { MAX_FORUM_TAGS } from '../../discord/party-gateway.js';
 import { count, fitItems, fitMessages, LIMITS, plain } from '../../render/text.js';
 import type { ForumSetup } from '../../services/party-service.js';
+import type { EventsForumSetup } from '../../services/event-forum.js';
 
 /**
  * A forum that stays hidden though Discord refused the bot's hide, and what the bot lacks there.
@@ -139,6 +140,37 @@ function line(result: ForumSetup): string {
   return `<#${region.channelId}>: ${what.join(', ')}.${open}${seen}`;
 }
 
+/** The events forum's line (plan 8V-1): what was done, then what was not and why. */
+function eventsLine(result: EventsForumSetup, botUpdates: string): string {
+  if (result.forum === 'no-bot-updates') {
+    return (
+      `Events forum: this server has no #${botUpdates} to make #${result.name} beside: add that ` +
+      `channel, or make the forum #${result.name} by hand, and run this again.`
+    );
+  }
+  if (result.forum === 'failed') return `Events forum (#${result.name}): ${result.reason}`;
+  const forum = `<#${result.forumId}>`;
+  const what = [
+    result.forum === 'created' ? `created ${forum}` : `${forum} is ready`,
+    ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
+  ];
+  const not = [
+    ...(result.posting === 'not-allowed'
+      ? [
+          ' I could not close it to posts by members (I need Manage Permissions and Send ' +
+            'Messages there; see the log).',
+        ]
+      : []),
+    ...(result.managing === 'not-allowed'
+      ? [
+          ' I could not let myself manage its posts (give me Manage Posts and Manage ' +
+            'Permissions there).',
+        ]
+      : []),
+  ];
+  return `Events forum: ${what.join(', ')}.${not.join('')}`;
+}
+
 /** The closing line in rehearsal mode: which regions get a forum, and who sees it. */
 function rehearsalLine(regions: readonly string[]): string {
   return `Rehearsal mode: only the regions ${regions.join(', ')} get a forum, which only staff and the testers see.`;
@@ -194,7 +226,8 @@ export const setupForums: SubcommandPart = {
       'Messages in the forum). A board that stands is pinned again, and one locked before ' +
       'members could use it is opened once; a lock a moderator sets later stays. Nothing else ' +
       'that is already there changes, so it is safe to run again. A forum whose region is gone ' +
-      'is named and left alone.',
+      'is named and left alone. Where the settings name an events forum (`channels.events`), ' +
+      'it is made too, in the category of bot-updates, with posts made by me alone.',
     examples: ['/admin setup-forums'],
   },
   defer: 'ephemeral',
@@ -216,7 +249,18 @@ export const setupForums: SubcommandPart = {
         ctx.log.warn({ err }, 'could not compare the rehearsed regions with the region channels');
         return undefined;
       });
+    // The events forum (plan 8V-1): never in rehearsal mode (R8), whoever made the service.
+    const events =
+      ctx.rehearsal || !ctx.eventForum
+        ? undefined
+        : await ctx.eventForum.setup(guildId).catch((err: unknown) => {
+            ctx.log.warn({ err }, 'could not set up the events forum');
+            return undefined;
+          });
     const closing = [
+      ...(events === undefined
+        ? []
+        : [eventsLine(events, ctx.config.settings.channels['bot-updates'])]),
       ...(orphans.length === 0 ? [] : [orphanLine(orphans)]),
       ...(ctx.rehearsal ? [rehearsalLine(ctx.rehearsal.settings.regions)] : []),
       ...(unmatched === undefined
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 150f66f22c45539f57b90b5639310491b57f6803..ca08580cf09cfc87aaed95168abdf730a95e7605 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -279,6 +279,58 @@ describe('loadSettings', () => {
     }
   });
 
+  // Plan 8V-1: the events forum, by name; blank is unset (no events forum).
+  it('has no events forum unless the file names one, by its name without #', () => {
+    const settings = loadSettings(REPO_SETTINGS);
+    expect(settings.channels.events).toBeUndefined();
+    const named = loadSettings(
+      writeSettings((s) => {
+        s.channels = { ...(s.channels as object), events: ' events ' };
+      }),
+    );
+    expect(named.channels.events).toBe('events');
+    const blank = loadSettings(
+      writeSettings((s) => {
+        s.channels = { ...(s.channels as object), events: '' };
+      }),
+    );
+    expect(blank.channels.events).toBeUndefined();
+    expect(() =>
+      loadSettings(
+        writeSettings((s) => {
+          s.channels = { ...(s.channels as object), events: '#events' };
+        }),
+      ),
+    ).toThrow(/events/);
+  });
+
+  it('refuses a moderators’ channel that is the events forum (R13)', () => {
+    expect(() =>
+      loadSettings(
+        writeSettings((s) => {
+          s.channels = { ...(s.channels as object), events: 'Events', moderation: 'events' };
+        }),
+      ),
+    ).toThrow(/not the events channel.*channels.moderation/su);
+  });
+
+  it('opens event posts 14 days ahead and lists 35, unless set, never posts beyond the listing', () => {
+    expect(loadSettings(REPO_SETTINGS).eventsForum).toEqual({ horizonDays: 35, postDaysAhead: 14 });
+    const set = loadSettings(
+      writeSettings((s) => {
+        s.eventsForum = { horizonDays: 21, postDaysAhead: 7 };
+      }),
+    );
+    expect(set.eventsForum).toEqual({ horizonDays: 21, postDaysAhead: 7 });
+    expect(() =>
+      loadSettings(
+        writeSettings((s) => {
+          s.eventsForum = { horizonDays: 10, postDaysAhead: 14 };
+        }),
+      ),
+    ).toThrow(/postDaysAhead/);
+  });
+
   it('names the channels the settings name, an unset moderators’ channel not among them', () => {
     const settings = loadSettings(REPO_SETTINGS);
     const names = channelNamesOf(settings);
diff --git a/src/config/settings.ts b/src/config/settings.ts
index d8dae167c510e84a9cae1650dc67d58c71063815..54ef3e97deb0bd3cb849e83c9a03c401d9a1d245 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -97,6 +97,20 @@ const publicUrl = z
   })
   .transform((value) => new URL(value).origin);
 
+/**
+ * An optional channel of the settings, by its name as it is written (blank is unset): the
+ * moderators' channel (plan 8S-1), the events forum (plan 8V-1).
+ */
+const optionalChannelName = z.preprocess(
+  (value) => (typeof value === 'string' ? value.trim() || undefined : value),
+  z
+    .string()
+    .refine((name) => !name.startsWith('#'), {
+      message: "must be a channel's name as it is written, without #",
+    })
+    .optional(),
+);
+
 const settingsObject = z.strictObject({
   standardRaidIncubateDuration: minutes,
   standardRaidHatchedDuration: minutes,
@@ -196,21 +210,22 @@ const settingsObject = z.strictObject({
        * the start logs a warning per server and `cutover-check` warns. Unlike the other channels
        * it is optional.
        */
-      moderation: z.preprocess(
-        (value) => (typeof value === 'string' ? value.trim() || undefined : value),
-        z
-          .string()
-          .refine((name) => !name.startsWith('#'), {
-            message: "must be a channel's name as it is written, without #",
-          })
-          .optional(),
-      ),
+      moderation: optionalChannelName,
+      /**
+       * The events forum (plan 8V-1; design `2026-10-28-events-forum-design.md`): one forum per
+       * server with Pine's pinned listing "Events" of the game's events and a post per bigger
+       * event. A name as it is written, without #; unset (the default; blank is unset): no events
+       * forum. `/admin setup-forums` makes it in the category of `bot-updates`; the name decides
+       * (a forum recorded under another name is replaced at the next setup).
+       */
+      events: optionalChannelName,
     })
     .superRefine((channels, ctx) => {
       const { moderation, ...others } = channels;
       if (moderation === undefined) return;
+      // Also the events forum (R13): its posts are everyone's.
       const same = Object.entries(others).find(
-        ([, name]) => name.toLowerCase() === moderation.toLowerCase(),
+        ([, name]) => name !== undefined && name.toLowerCase() === moderation.toLowerCase(),
       );
       if (same !== undefined) {
         ctx.addIssue({
@@ -221,6 +236,22 @@ const settingsObject = z.strictObject({
       }
     }),
   categories: z.strictObject({ pvp: z.string().min(1) }),
+  /**
+   * The events forum's reach (plan 8V-1): the listing names the events that start within
+   * `horizonDays` (35 unless set), and an event of a posted kind gets its post `postDaysAhead`
+   * days before its start (14 unless set, Matt 2026-10-29; at most `horizonDays`). Named apart
+   * from `raidEvents` (R13). Whether there is a forum at all is `channels.events`.
+   */
+  eventsForum: z
+    .strictObject({
+      horizonDays: z.number().int().min(1).max(365).default(35),
+      postDaysAhead: z.number().int().min(0).max(365).default(14),
+    })
+    .refine((forum) => forum.postDaysAhead <= forum.horizonDays, {
+      error: 'must be at most horizonDays: a post opens for an event the listing names',
+      path: ['postDaysAhead'],
+    })
+    .default(() => ({ horizonDays: 35, postDaysAhead: 14 })),
   /**
    * Meetup safety (plan 8S-1): `flaggedWords` are words and phrases that, in the title of a gym,
    * PokéStop or power spot, send a meetup there to the moderators first, besides the list in
diff --git a/src/discord/party-gateway.test.ts b/src/discord/party-gateway.test.ts
index bd3736657978b994f370ed56d7b0cf8b9878924b..22724bee8340f6629e8189ca544045dcb19135f8 100644
--- a/src/discord/party-gateway.test.ts
+++ b/src/discord/party-gateway.test.ts
@@ -1368,6 +1368,7 @@ describe('DiscordPartyGateway: the region’s open board (plan 8R-9F)', () => {
       pinned: true,
       locked: true,
       slowmode: 45,
+      archived: false,
     });
   });
 
@@ -1806,3 +1807,175 @@ describe('DiscordPartyGateway: the tags of a forum near its limit', () => {
     expect(entries).toContainEqual(expect.objectContaining({ level: 40, missing: ['Egg'] }));
   });
 });
+
+describe('the events forum’s posts (plan 8V-1)', () => {
+  describe('FakePartyGateway', () => {
+    const made = async () => {
+      const gateway = new FakePartyGateway();
+      gateway.addForum('f', [], 'events');
+      const postId =
+        (await gateway.createPost('f', { title: 't', message: { content: 'x' }, tagIds: [] })) ??
+        '';
+      return { gateway, postId, post: () => gateway.posts.get(postId) };
+    };
+
+    it('sets a post’s auto-archive, leaving an archived one as it is', async () => {
+      const { gateway, postId, post } = await made();
+      expect(post()?.autoArchiveMinutes).toBe(10_080);
+      await expect(gateway.setAutoArchive(postId, 1_440)).resolves.toBe(true);
+      expect(post()).toMatchObject({ autoArchiveMinutes: 1_440, archived: false, locked: false });
+      await gateway.archiveUnlocked(postId);
+      await expect(gateway.setAutoArchive(postId, 10_080)).resolves.toBe(true);
+      expect(post()).toMatchObject({ autoArchiveMinutes: 1_440, archived: true, reopened: 0 });
+      gateway.gone.add(postId);
+      await expect(gateway.setAutoArchive(postId, 1_440)).resolves.toBe(false);
+    });
+
+    it('archives a post without locking it, and locks one without archiving it', async () => {
+      const { gateway, postId, post } = await made();
+      await expect(gateway.archiveUnlocked(postId)).resolves.toBe(true);
+      expect(post()).toMatchObject({ archived: true, locked: false });
+      await expect(gateway.lockPost(postId)).resolves.toBe(true);
+      expect(post()).toMatchObject({ archived: false, locked: true, reopened: 1 });
+      gateway.gone.add(postId);
+      await expect(gateway.archiveUnlocked(postId)).resolves.toBe(false);
+      await expect(gateway.lockPost(postId)).resolves.toBe(false);
+    });
+
+    // Review V6: the hourly draw opens an event's post that archived itself before its event.
+    it('says whether a post is archived', async () => {
+      const { gateway, postId } = await made();
+      expect((await gateway.postInfo(postId))?.archived).toBe(false);
+      await gateway.archiveUnlocked(postId);
+      expect((await gateway.postInfo(postId))?.archived).toBe(true);
+    });
+
+    it('lists the bot’s archived posts of a forum, and none of a forum that is gone', async () => {
+      const { gateway, postId } = await made();
+      const open =
+        (await gateway.createPost('f', { title: 'o', message: { content: 'y' }, tagIds: [] })) ??
+        '';
+      await gateway.archiveUnlocked(postId);
+      await expect(gateway.archivedPosts('f')).resolves.toEqual([postId]);
+      await expect(gateway.openPosts('f')).resolves.toEqual([open]);
+      gateway.gone.add('f');
+      await expect(gateway.archivedPosts('f')).resolves.toBeUndefined();
+    });
+
+    it('lets the bot manage the posts of a forum, refused where it may not set permissions', async () => {
+      const { gateway } = await made();
+      await expect(gateway.letBotManagePosts('f')).resolves.toBe('allowed');
+      await expect(gateway.letBotManagePosts('f')).resolves.toBe('was-allowed');
+      gateway.addForum('g');
+      gateway.noReserving.add('g');
+      await expect(gateway.letBotManagePosts('g')).resolves.toBe('not-allowed');
+      await expect(gateway.letBotManagePosts('none')).resolves.toBeUndefined();
+    });
+  });
+
+  describe('DiscordPartyGateway', () => {
+    /** An events post (a thread), archived or not, locked or not, as discord.js gives it. */
+    function eventPost({ archived = false, locked = false } = {}) {
+      const calls: string[] = [];
+      const thread = {
+        id: 'p',
+        archived,
+        locked,
+        isThread: () => true,
+        setArchived: (value: boolean) => {
+          calls.push(`archived ${String(value)}`);
+          thread.archived = value;
+          return Promise.resolve(thread);
+        },
+        edit: (options: Record<string, unknown>) => {
+          if (thread.archived)
+            return Promise.reject(apiError(RESTJSONErrorCodes.InvalidActionOnArchivedThread));
+          calls.push(`edit ${JSON.stringify(options)}`);
+          return Promise.resolve(thread);
+        },
+      };
+      const gateway = new DiscordPartyGateway();
+      gateway.use({
+        channels: { fetch: () => Promise.resolve(thread) },
+        user: { id: 'bot' },
+      } as unknown as Client);
+      return { gateway, calls, thread };
+    }
+
+    it('says in a post’s info whether it is archived', async () => {
+      const shut = eventPost({ archived: true });
+      Object.assign(shut.thread, {
+        name: 'Events',
+        appliedTags: [],
+        flags: { has: () => false },
+        rateLimitPerUser: 0,
+      });
+      await expect(shut.gateway.postInfo('p')).resolves.toMatchObject({ archived: true });
+    });
+
+    it('sets the auto-archive of an open post, and leaves an archived one shut', async () => {
+      const open = eventPost();
+      await expect(open.gateway.setAutoArchive('p', 1_440)).resolves.toBe(true);
+      expect(open.calls).toEqual([`edit ${JSON.stringify({ autoArchiveDuration: 1_440 })}`]);
+      const shut = eventPost({ archived: true });
+      await expect(shut.gateway.setAutoArchive('p', 1_440)).resolves.toBe(true);
+      expect(shut.calls).toEqual([]);
+    });
+
+    it('archives without locking, and nothing for a post archived already', async () => {
+      const open = eventPost();
+      await expect(open.gateway.archiveUnlocked('p')).resolves.toBe(true);
+      expect(open.calls).toEqual(['archived true']);
+      const shut = eventPost({ archived: true });
+      await expect(shut.gateway.archiveUnlocked('p')).resolves.toBe(true);
+      expect(shut.calls).toEqual([]);
+    });
+
+    it('locks a post, opening it first where archived, and nothing for one locked already', async () => {
+      const shut = eventPost({ archived: true });
+      await expect(shut.gateway.lockPost('p')).resolves.toBe(true);
+      expect(shut.calls).toEqual(['archived false', `edit ${JSON.stringify({ locked: true })}`]);
+      const locked = eventPost({ locked: true });
+      await expect(locked.gateway.lockPost('p')).resolves.toBe(true);
+      expect(locked.calls).toEqual([]);
+    });
+
+    it('lists the bot’s archived posts of a forum page by page, newest first', async () => {
+      const asked: string[] = [];
+      const page = (ids: string[], hasMore: boolean) => ({
+        threads: new Map(
+          ids.map((id) => [
+            id,
+            {
+              id,
+              ownerId: id.startsWith('m') ? 'member' : 'bot',
+              archiveTimestamp: Number(id.slice(1)),
+            },
+          ]),
+        ),
+        hasMore,
+      });
+      const forum = {
+        type: ChannelType.GuildForum,
+        threads: {
+          fetchArchived: (options: { before?: number; limit: number }) => {
+            asked.push(JSON.stringify(options));
+            return Promise.resolve(
+              options.before === undefined ? page(['b9', 'm8', 'b7'], true) : page(['b3'], false),
+            );
+          },
+        },
+      };
+      const gateway = new DiscordPartyGateway();
+      gateway.use({
+        channels: { fetch: () => Promise.resolve(forum) },
+        user: { id: 'bot' },
+      } as unknown as Client);
+      await expect(gateway.archivedPosts('f')).resolves.toEqual(['b9', 'b7', 'b3']);
+      expect(asked).toEqual([
+        JSON.stringify({ type: 'public', limit: 100 }),
+        JSON.stringify({ type: 'public', limit: 100, before: 7 }),
+      ]);
+    });
+  });
+});
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index f542c2f827cdb1acbb9f80aa96143b8b58e58eec..460d42776c01bf1a4dc01b048ec1e4021c44a401 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -126,6 +126,8 @@ export interface PostInfo {
   locked: boolean;
   /** Its slowmode (`rate_limit_per_user`) in seconds; 0 where it has none. */
   slowmode: number;
+  /** Whether it is archived (plan 8V-1, review V6: an event's post opened again before its end). */
+  archived: boolean;
 }
 
 /**
@@ -181,6 +183,12 @@ export interface NewPost {
   tagIds: readonly string[];
 }
 
+/** The auto-archive durations of a post Pine sets (Discord's: an hour, a day, three days, a week). */
+export type AutoArchiveMinutes = 60 | 1_440 | 4_320 | 10_080;
+
+/** How many of a forum's archived posts `archivedPosts` reads at most (five pages of 100). */
+export const ARCHIVED_POSTS_READ = 500;
+
 /** How many tags Discord lets a forum have (its `available_tags`, at most 20). */
 export const MAX_FORUM_TAGS = 20;
 
@@ -232,8 +240,8 @@ export interface PartyGateway {
   /** Creates a post and gives its id (the id of the thread). Undefined when the forum is gone. */
   createPost(forumId: string, post: NewPost): Promise<string | undefined>;
   /**
-   * The post's title, applied tags, whether it is pinned and locked, and its slowmode in seconds
-   * (0: none), as Discord has them. Undefined when it is gone.
+   * The post's title, applied tags, whether it is pinned and locked, its slowmode in seconds
+   * (0: none) and whether it is archived, as Discord has them. Undefined when it is gone.
    */
   postInfo(postId: string): Promise<PostInfo | undefined>;
   /**
@@ -277,11 +285,44 @@ export interface PartyGateway {
    * open it again, so this is the last thing done to a post.
    */
   archivePost(postId: string): Promise<boolean>;
+  /**
+   * Sets after how many minutes without a message Discord archives the post (plan 8V-1: an event's
+   * post a day after its end), without opening it: one archived already is left so (a member's
+   * message opens it again), and answers true. False when it is gone.
+   */
+  setAutoArchive(postId: string, minutes: AutoArchiveMinutes): Promise<boolean>;
+  /**
+   * Archives a post without locking it (plan 8V-1: an event's post after its end): it leaves the
+   * forum's list of active posts, and a member's message opens it again. One archived already is
+   * left as it is. False when it is gone.
+   */
+  archiveUnlocked(postId: string): Promise<boolean>;
+  /**
+   * Locks a post (plan 8V-1: the events forum's listing): members can no longer write in it. An
+   * archived one is opened first and left open; one locked already is left as it is. Needs
+   * Manage Threads. False when it is gone.
+   */
+  lockPost(postId: string): Promise<boolean>;
   /**
    * The posts of a forum that are not archived and that this bot made (members can make posts
    * in a forum too), oldest first. Undefined when the forum is gone.
    */
   openPosts(forumId: string): Promise<string[] | undefined>;
+  /**
+   * The archived posts of a forum that this bot made, the latest archived first, at most
+   * `ARCHIVED_POSTS_READ` (plan 8V-1: a listing whose record was lost is looked for among them
+   * too, R2). Undefined when the forum is gone.
+   */
+  archivedPosts(forumId: string): Promise<string[] | undefined>;
+  /**
+   * Lets the bot manage the posts of a forum (plan 8V-1: Manage Posts, a forum's Manage Threads,
+   * in the bot's own overwrite of the events forum), to pin, lock and archive them. `was-allowed`
+   * when nothing had to change, `not-allowed` when Discord refuses the bot the change (it needs
+   * Manage Permissions there and Manage Threads itself), undefined when the forum is gone.
+   */
+  letBotManagePosts(
+    forumId: string,
+  ): Promise<'allowed' | 'was-allowed' | 'not-allowed' | undefined>;
   /** Deletes a post (its thread); one that is already gone is fine. */
   deletePost(postId: string): Promise<void>;
   /**
@@ -1352,6 +1393,7 @@ export class DiscordPartyGateway implements PartyGateway {
           pinned: post.flags.has(ChannelFlags.Pinned),
           locked: post.locked === true,
           slowmode: post.rateLimitPerUser ?? 0,
+          archived: post.archived === true,
         }
       : undefined;
   }
@@ -1492,6 +1534,81 @@ export class DiscordPartyGateway implements PartyGateway {
     });
   }
 
+  async setAutoArchive(postId: string, minutes: AutoArchiveMinutes): Promise<boolean> {
+    const post = await this.post(postId);
+    if (!post) return false;
+    // An archived post stays shut: opening it to set this would show it as active again.
+    if (post.archived) return true;
+    return this.done(() => post.edit({ autoArchiveDuration: minutes }));
+  }
+
+  async archiveUnlocked(postId: string): Promise<boolean> {
+    const post = await this.post(postId);
+    if (!post) return false;
+    if (post.archived) return true;
+    return this.done(() => post.setArchived(true));
+  }
+
+  async lockPost(postId: string): Promise<boolean> {
+    const post = await this.post(postId);
+    if (!post) return false;
+    if (post.locked === true) return true;
+    return this.done(async () => {
+      // Discord changes nothing but `archived` on an archived thread: open it to lock it.
+      await this.reopen(post);
+      await post.edit({ locked: true });
+    });
+  }
+
+  async archivedPosts(forumId: string): Promise<string[] | undefined> {
+    const forum = await this.forum(forumId);
+    if (!forum) return undefined;
+    const me = this.client.user?.id;
+    const found: string[] = [];
+    let before: number | undefined;
+    // Newest archived first, a page of 100 at a time, as Discord gives them.
+    for (let read = 0; read < ARCHIVED_POSTS_READ; read += 100) {
+      const page = await this.unlessGone(() =>
+        forum.threads.fetchArchived({
+          type: 'public',
+          limit: 100,
+          ...(before === undefined ? {} : { before }),
+        }),
+      );
+      if (!page) return read === 0 ? undefined : found;
+      const threads = [...page.threads.values()];
+      found.push(...threads.filter((thread) => thread.ownerId === me).map((thread) => thread.id));
+      before = threads.at(-1)?.archiveTimestamp ?? undefined;
+      if (!page.hasMore || before === undefined) break;
+    }
+    return found;
+  }
+
+  async letBotManagePosts(
+    forumId: string,
+  ): Promise<'allowed' | 'was-allowed' | 'not-allowed' | undefined> {
+    const forum = await this.forum(forumId);
+    if (!forum) return undefined;
+    const me = forum.guild.members.me;
+    if (!me) return 'not-allowed';
+    const manage = PermissionFlagsBits.ManageThreads;
+    if (forum.permissionOverwrites.cache.get(me.id)?.allow.has(manage) === true) {
+      return 'was-allowed';
+    }
+    try {
+      await forum.permissionOverwrites.edit(
+        me,
+        { ManageThreads: true },
+        { reason: 'The bot pins, locks and archives the posts of this forum' },
+      );
+    } catch (err) {
+      if (isMissingPermission(err)) return 'not-allowed';
+      if (hasCode(err, RESTJSONErrorCodes.UnknownChannel)) return undefined;
+      throw err;
+    }
+    return 'allowed';
+  }
+
   async openPosts(forumId: string): Promise<string[] | undefined> {
     const forum = await this.forum(forumId);
     if (!forum) return undefined;
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index 72bbe100f3c1b14802c113413e3d9e14315bbbd0..8abf328928d5165853cf65a379f624172aa700e6 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -253,6 +253,51 @@ describe('cutoverCheck', () => {
     });
   });
 
+  // Plan 8V-1: the events forum, where the settings name one.
+  describe('the events forum', () => {
+    const named = () => {
+      settings = { ...settings, channels: { ...settings.channels, events: 'events' } };
+    };
+
+    // Review V7 (ruling R4): found by its name as Discord stores it.
+    it('finds a forum named with capitals and spaces as Discord stores it', async () => {
+      settings = { ...settings, channels: { ...settings.channels, events: 'Game Events' } };
+      api.addChannel(shape.guild, 'game-events', { type: ChannelType.GuildForum });
+      expect(line(await check(), 'events')).toMatchObject({ status: 'pass' });
+    });
+
+    it('says nothing of it while the settings name none', async () => {
+      expect((await check()).filter((one) => one.what === 'events')).toEqual([]);
+    });
+
+    it('warns of a named forum the server lacks: /admin setup-forums makes it', async () => {
+      named();
+      expect(line(await check(), 'events')).toEqual({
+        what: 'events',
+        status: 'warn',
+        text: 'events: Pittsburgh has no forum #events: /admin setup-forums makes it',
+      });
+    });
+
+    it('passes a forum the bot may post, manage and write in, and warns of what it lacks', async () => {
+      named();
+      const forum = api.addChannel(shape.guild, 'events', { type: ChannelType.GuildForum });
+      expect(line(await check(), 'events')).toEqual({
+        what: 'events',
+        status: 'pass',
+        text: 'events: in Pittsburgh the events are listed in #events',
+      });
+      forum.overwrites = [overwrite(shape.botRole, [], [P.ManageThreads, P.SendMessages])];
+      expect(line(await check(), 'events')).toEqual({
+        what: 'events',
+        status: 'warn',
+        text:
+          'events: in Pittsburgh the bot lacks Create Posts (Send Messages), Manage Posts ' +
+          '(Manage Threads) in #events: the listing and the event posts cannot be kept there',
+      });
+    });
+  });
+
   describe('meetup safety', () => {
     it("passes a moderators' channel the bot may post in", async () => {
       expect(line(await check(), 'moderation')).toEqual({
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index b3eef65e69983fdc190b5414b1ff893ac69713cf..c174656670de32f380471f91ca99490c3187097b 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -3,6 +3,7 @@ import { channelNamesOf, type Settings } from '../config/settings.js';
 import type { MigrationPlan } from '../db/migrator.js';
 import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
 import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
+import { channelKey, channelNameFor } from '../domain/regions/region-import.js';
 import type { DiscordRead } from './discord-rest.js';
 import { applicationEmojiNames, failureReason, iconSources, missingIcons } from './emoji-upload.js';
 import { cleanupList } from './legacy-cleanup.js';
@@ -12,6 +13,7 @@ import {
   channelPermissions,
   ANNOUNCE_NEEDS,
   MODERATION_NEEDS,
+  EVENTS_FORUM_NEEDS,
   FORUM_NEEDS,
   HIDDEN_FORUM_NEEDS,
   inForum,
@@ -67,6 +69,7 @@ export interface CheckLine {
     | 'cleanup'
     | 'announcements'
     | 'moderation'
+    | 'events'
     | 'reports'
     | 'roles'
     | 'discord';
@@ -394,6 +397,8 @@ async function serverLines(
       .map((role) => role.name);
   lines.push(moderationLine(guild.name, channels, settings, permissionsIn, seenBy, unseenByStaff));
   if (settings.channels.moderation !== undefined) lines.push(reportsLine(guild.name, reportGaps));
+  const events = eventsLine(guild.name, channels, settings, permissionsIn);
+  if (events) lines.push(events);
   const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
   if (rolesCheck) lines.push(rolesCheck);
   return { lines, withoutForum, withoutBoard };
@@ -522,6 +527,49 @@ function moderationLine(
   };
 }
 
+/**
+ * The events forum (plan 8V-1), where the settings name one: whether the server has it (a forum,
+ * as `/admin setup-forums` finds it by name) and the bot may post, manage and write in it
+ * (`EVENTS_FORUM_NEEDS`). A warning, never a failure: the events forum is extra. Nothing while
+ * the settings name none.
+ */
+function eventsLine(
+  server: string,
+  channels: readonly ApiChannel[],
+  settings: Settings,
+  permissionsIn: (channel: ApiChannel) => bigint,
+): CheckLine | undefined {
+  const named = settings.channels.events;
+  if (named === undefined) return undefined;
+  // As Discord stores the name, and as `/admin setup-forums` finds it (review V7, ruling R4).
+  const name = channelNameFor(named) || named;
+  const forum = channels.find(
+    (one) => channelKey(one.name) === channelKey(name) && one.type === ChannelType.GuildForum,
+  );
+  if (!forum) {
+    return {
+      what: 'events',
+      status: 'warn',
+      text: `events: ${server} has no forum #${name}: /admin setup-forums makes it`,
+    };
+  }
+  const missing = missingNeeds(permissionsIn(forum), inForum(EVENTS_FORUM_NEEDS)).required;
+  if (missing.length > 0) {
+    return {
+      what: 'events',
+      status: 'warn',
+      text:
+        `events: in ${server} the bot lacks ${needNames(missing)} in #${name}: the listing ` +
+        'and the event posts cannot be kept there',
+    };
+  }
+  return {
+    what: 'events',
+    status: 'pass',
+    text: `events: in ${server} the events are listed in #${name}`,
+  };
+}
+
 /** What Delete message of a report needs in a region's channel (plan 8S-2). */
 const REPORT_CHANNEL_NEEDS: readonly Need[] = [
   {
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index 6838c932cd9cd94164c713f02f809886d90dc26f..f9ea5579ead62f7fec21b33e23e434b5380af3a1 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -206,6 +206,20 @@ export const FORUM_NEEDS: readonly Need[] = [
   CLEANS_BOARD,
 ];
 
+/**
+ * What it needs in the events forum (`settings.channels.events`, plan 8V-1): its posts (Create
+ * Posts, a forum's Send Messages: members make none), their messages and the listing's edits,
+ * and pinning, locking and archiving them (Manage Posts).
+ */
+export const EVENTS_FORUM_NEEDS: readonly Need[] = [
+  VIEW,
+  SEND,
+  THREADS,
+  EMBED,
+  HISTORY,
+  MANAGE_THREADS,
+];
+
 /**
  * What the bot's own roles must give it in the server to make a hidden forum (rehearsal mode,
  * `HIDDEN_FORUM_REFUSED` of `src/services/party-service.ts`): a creation's overwrites may give
diff --git a/src/services/event-forum.test.ts b/src/services/event-forum.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..22b10af6b2844f598b7e1fa5f41d1dfb9d80dcc2
--- /dev/null
+++ b/src/services/event-forum.test.ts
@@ -0,0 +1,140 @@
+import { describe, expect, it } from 'vitest';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { MemoryEventForums } from '../../test/support/event-forum-store.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import { loadSettings, type Settings } from '../config/settings.js';
+import type { ListedEvent } from '../domain/time/event-listing.js';
+import { EventForumService } from './event-forum.js';
+
+const SERVER = '412345678901234567';
+const BOT_UPDATES = '500000000000000010';
+const CATEGORY = '500000000000000011';
+
+/** The events forum's service over the fake gateway, the server having its bot-updates channel. */
+export function eventForumWith(
+  options: { events?: ListedEvent[]; settings?: Partial<Settings>; now?: () => number } = {},
+) {
+  const gateway = new FakePartyGateway();
+  gateway.addChannel(CATEGORY, 'INFO', { kind: 'category' });
+  gateway.addChannel(BOT_UPDATES, 'bot-updates', { categoryId: CATEGORY });
+  const loaded = loadSettings(TEST_SETTINGS_PATH);
+  const settings: Settings = {
+    ...loaded,
+    channels: { ...loaded.channels, events: 'events' },
+    ...options.settings,
+  };
+  const store = new MemoryEventForums();
+  const listed = { events: options.events ?? [] };
+  const { log, entries } = createTestLogger();
+  const service = new EventForumService({
+    gateway,
+    store,
+    events: {
+      listedEvents: () => listed.events,
+      onListedChange: () => undefined,
+      listingKnown: () => true,
+      droppedIds: () => new Set<string>(),
+    },
+    settings,
+    log,
+    ...(options.now ? { now: options.now } : {}),
+  });
+  return { service, gateway, store, listed, entries, settings };
+}
+
+describe('EventForumService: the forum of /admin setup-forums (plan 8V-1)', () => {
+  it('makes the forum in the category of bot-updates, closed to posts by members, and records it', async () => {
+    const { service, gateway, store } = eventForumWith();
+    const result = await service.setup(SERVER);
+    expect(result).toMatchObject({
+      forum: 'created',
+      posting: 'reserved',
+      managing: 'allowed',
+    });
+    const forumId = result.forum === 'created' ? result.forumId : '';
+    expect(gateway.forums.get(forumId)).toMatchObject({
+      name: 'events',
+      regionChannelId: BOT_UPDATES,
+    });
+    expect(gateway.serverChannels(SERVER)?.find((one) => one.id === forumId)?.categoryId).toBe(
+      CATEGORY,
+    );
+    expect(gateway.reserved.has(forumId)).toBe(true);
+    expect(gateway.managedPosts.has(forumId)).toBe(true);
+    expect(await store.forum(SERVER)).toMatchObject({ serverId: SERVER, forumId });
+  });
+
+  it('finds the forum by its name when it is there, and makes nothing then', async () => {
+    const { service, gateway, store } = eventForumWith();
+    gateway.addChannel('600000000000000001', 'Events', { kind: 'forum' });
+    gateway.addForum('600000000000000001', [], 'Events');
+    expect(await service.setup(SERVER)).toMatchObject({
+      forum: 'ready',
+      forumId: '600000000000000001',
+    });
+    expect([...gateway.forums.keys()]).toEqual(['600000000000000001']);
+    expect((await store.forum(SERVER))?.forumId).toBe('600000000000000001');
+  });
+
+  // Review V7 (ruling R4): the name compared as Discord stores it, lower case, spaces to hyphens.
+  it('makes and finds the forum by its name as Discord stores it', async () => {
+    const loaded = loadSettings(TEST_SETTINGS_PATH);
+    const named = { channels: { ...loaded.channels, events: 'Game Events' } };
+    const made = eventForumWith({ settings: named });
+    const result = await made.service.setup(SERVER);
+    const forumId = result.forum === 'created' ? result.forumId : '';
+    expect(made.gateway.forums.get(forumId)?.name).toBe('game-events');
+    const found = eventForumWith({ settings: named });
+    found.gateway.addChannel('600000000000000001', 'game-events', { kind: 'forum' });
+    found.gateway.addForum('600000000000000001', [], 'game-events');
+    expect(await found.service.setup(SERVER)).toMatchObject({
+      forum: 'ready',
+      forumId: '600000000000000001',
+    });
+  });
+
+  it('takes the forum the name names over one recorded under another name (R7)', async () => {
+    const { service, gateway, store } = eventForumWith();
+    await store.setForum(SERVER, '600000000000000009');
+    await store.setListing(SERVER, '600000000000000009', '700000000000000001');
+    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
+    gateway.addForum('600000000000000001', [], 'events');
+    await service.setup(SERVER);
+    expect(await store.forum(SERVER)).toEqual({
+      serverId: SERVER,
+      forumId: '600000000000000001',
+      listingPostId: null,
+    });
+  });
+
+  it('says what it could not do: close it to members, let itself manage the posts', async () => {
+    const { service, gateway } = eventForumWith();
+    gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
+    gateway.addForum('600000000000000001', [], 'events');
+    gateway.noReserving.add('600000000000000001');
+    expect(await service.setup(SERVER)).toMatchObject({
+      forum: 'ready',
+      posting: 'not-allowed',
+      managing: 'not-allowed',
+    });
+  });
+
+  it('makes none without a bot-updates channel to make it beside', async () => {
+    const { service, gateway } = eventForumWith();
+    gateway.channels.delete(BOT_UPDATES);
+    expect(await service.setup(SERVER)).toEqual({ forum: 'no-bot-updates', name: 'events' });
+    expect(gateway.forums.size).toBe(0);
+  });
+
+  it('says why a forum it could not make is missing', async () => {
+    const { service, gateway, entries } = eventForumWith();
+    gateway.botPermissions = 0n;
+    expect(await service.setup(SERVER)).toEqual({
+      forum: 'failed',
+      name: 'events',
+      reason: 'I need Manage Channels in the category of #bot-updates',
+    });
+    expect(entries.some((entry) => entry.msg === 'could not make the events forum')).toBe(true);
+  });
+});
diff --git a/src/services/event-forum.ts b/src/services/event-forum.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0c6c250addf220cc7c6219cf9af406cc9474f5a8
--- /dev/null
+++ b/src/services/event-forum.ts
@@ -0,0 +1,91 @@
+import type { Settings } from '../config/settings.js';
+import type { EventForumStorage } from '../db/repositories/event-forum-repository.js';
+import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
+import { channelKey, channelNameFor } from '../domain/regions/region-import.js';
+import type { Logger } from '../log.js';
+import type { ListedEventProvider } from './raid-event-service.js';
+
+/** What `/admin setup-forums` did for the events forum (`EventForumService.setup`). */
+export type EventsForumSetup =
+  /** The server has no `bot-updates` channel to make the forum beside: nothing was made. */
+  | { forum: 'no-bot-updates'; name: string }
+  /** Discord refused the forum, or something went wrong: `reason` for staff. */
+  | { forum: 'failed'; name: string; reason: string }
+  | {
+      forum: 'created' | 'ready';
+      name: string;
+      forumId: string;
+      /** Create Posts denied to everyone and allowed to the bot (`reservePosts`). */
+      posting: 'reserved' | 'was-reserved' | 'not-allowed';
+      /** Manage Posts allowed to the bot in its own overwrite (`letBotManagePosts`). */
+      managing: 'allowed' | 'was-allowed' | 'not-allowed';
+    };
+
+export interface EventForumOptions {
+  gateway: PartyGateway;
+  store: EventForumStorage;
+  events: ListedEventProvider;
+  settings: Pick<Settings, 'channels' | 'eventsForum' | 'timezone'>;
+  log: Logger;
+  /** The clock, in epoch milliseconds. Default `Date.now`. */
+  now?: () => number;
+}
+
+/**
+ * The events forum of each server (plan 8V-1; design `2026-10-28-events-forum-design.md`): one
+ * forum, named by `settings.channels.events`, made by `/admin setup-forums` in the category of
+ * `bot-updates`. Made only where the settings name a forum and rehearsal mode is off (`app.ts`).
+ */
+export class EventForumService {
+  constructor(private readonly options: EventForumOptions) {}
+
+  /**
+   * The forum's name as Discord stores it (review V7, ruling R4: lower case, spaces to hyphens;
+   * `channelNameFor`, the one normalizer of setup and lookup), from the settings' name; the
+   * service is made only where they give one.
+   */
+  private get forumName(): string {
+    const name = this.options.settings.channels.events;
+    if (name === undefined) throw new Error('settings.channels.events names no forum');
+    return channelNameFor(name) || name;
+  }
+
+  /**
+   * Gives the server its events forum (`/admin setup-forums`): the forum of that name where the
+   * server has one (the name decides, R7: a forum recorded under another name is replaced), else
+   * one made beside `bot-updates`, in its category and with its permissions; Create Posts denied
+   * to everyone (members write in Pine's posts but make none) and Manage Posts allowed to the
+   * bot. Recorded; what is there already is left as it is, so it is safe to run again.
+   */
+  async setup(guildId: string): Promise<EventsForumSetup> {
+    const { gateway, store, settings, log } = this.options;
+    const name = this.forumName;
+    const channels = gateway.serverChannels(guildId) ?? [];
+    let forumId = channels.find(
+      (one) => one.kind === 'forum' && channelKey(one.name) === channelKey(name),
+    )?.id;
+    const created = forumId === undefined;
+    if (forumId === undefined) {
+      const botUpdates = channels.find(
+        (one) => one.kind === 'text' && one.name === settings.channels['bot-updates'],
+      );
+      if (!botUpdates) return { forum: 'no-bot-updates', name };
+      try {
+        forumId = (await gateway.createForum(botUpdates.id, name, []))?.forumId;
+      } catch (err) {
+        log.warn({ err, guild: guildId }, 'could not make the events forum');
+        const reason = isMissingPermission(err)
+          ? `I need Manage Channels in the category of #${botUpdates.name}`
+          : 'Something went wrong (see the log).';
+        return { forum: 'failed', name, reason };
+      }
+      if (forumId === undefined) {
+        return { forum: 'failed', name, reason: `#${botUpdates.name} is gone.` };
+      }
+    }
+    await store.setForum(guildId, forumId);
+    const posting = (await gateway.reservePosts(forumId)) ?? 'not-allowed';
+    const managing = (await gateway.letBotManagePosts(forumId)) ?? 'not-allowed';
+    return { forum: created ? 'created' : 'ready', name, forumId, posting, managing };
+  }
+}
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 63155a9ef900160d19d077f4f88afd3fcb1f75f2..3532a5aa4f58f36766b52b4b47cb0cb6896b832b 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -10,6 +10,7 @@ import {
 import { channelPermissions, type ApiOverwrite } from '../../src/ops/permissions.js';
 import type { ServerChannel } from '../../src/domain/regions/region-import.js';
 import type {
+  AutoArchiveMinutes,
   BoardMessage,
   CreatedChannel,
   EditOptions,
@@ -95,6 +96,8 @@ export interface FakePost {
   locked: boolean;
   /** Its slowmode in seconds (`openBoard` sets the board's, plan 8R-9F); 0 where none. */
   slowmode: number;
+  /** After how many minutes without a message Discord archives it: a week, unless set. */
+  autoArchiveMinutes: AutoArchiveMinutes;
   /** How often something opened the post again after it was archived. */
   reopened: number;
   /** How often the first message was edited, the title changed, the tags set. */
@@ -381,6 +384,8 @@ export class FakePartyGateway implements PartyGateway {
   readonly refusePosts = new Map<string, readonly string[]>();
   /** The forums in which only the bot makes posts (`reservePosts`). */
   readonly reserved = new Set<string>();
+  /** The forums whose posts the bot allowed itself to manage (`letBotManagePosts`, plan 8V-1). */
+  readonly managedPosts = new Set<string>();
   /** The forums whose permissions the bot may not change. */
   readonly noReserving = new Set<string>();
   /**
@@ -1159,6 +1164,7 @@ export class FakePartyGateway implements PartyGateway {
         archived: false,
         locked: false,
         slowmode: 0,
+        autoArchiveMinutes: 10_080,
         reopened: 0,
         edits: 0,
         renames: 0,
@@ -1186,6 +1192,7 @@ export class FakePartyGateway implements PartyGateway {
         pinned: post.pinned,
         locked: post.locked,
         slowmode: post.slowmode,
+        archived: post.archived,
       };
     });
   }
@@ -1446,6 +1453,60 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  /** As Discord: an archived post is left shut, its duration unchanged (plan 8V-1). */
+  setAutoArchive(postId: string, minutes: AutoArchiveMinutes) {
+    return this.attempt('setAutoArchive', postId, () => {
+      const post = this.posts.get(postId);
+      if (!post || this.gone.has(postId)) return false;
+      if (!post.archived) post.autoArchiveMinutes = minutes;
+      return true;
+    });
+  }
+
+  /** Archives a post and leaves its lock as it is (plan 8V-1). */
+  archiveUnlocked(postId: string) {
+    return this.attempt('archiveUnlocked', postId, () => {
+      const post = this.posts.get(postId);
+      if (!post || this.gone.has(postId)) return false;
+      post.archived = true;
+      return true;
+    });
+  }
+
+  /** Locks a post, opening it where archived (plan 8V-1). */
+  lockPost(postId: string) {
+    return this.attempt('lockPost', postId, () => {
+      const post = this.posts.get(postId);
+      if (!post || this.gone.has(postId)) return false;
+      if (post.locked) return true;
+      FakePartyGateway.reopen(post);
+      post.locked = true;
+      return true;
+    });
+  }
+
+  /** The bot's archived posts of a forum, the latest made first (plan 8V-1). */
+  archivedPosts(forumId: string) {
+    return this.attempt('archivedPosts', forumId, () => {
+      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
+      return this.postsIn(forumId)
+        .filter((post) => post.archived && !this.gone.has(post.id) && !this.foreign.has(post.id))
+        .map((post) => post.id)
+        .reverse();
+    });
+  }
+
+  /** The bot's overwrite lets it manage the posts; refused in a forum of `noReserving`. */
+  letBotManagePosts(forumId: string) {
+    return this.attempt('letBotManagePosts', forumId, () => {
+      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
+      if (this.noReserving.has(forumId)) return 'not-allowed' as const;
+      if (this.managedPosts.has(forumId)) return 'was-allowed' as const;
+      this.managedPosts.add(forumId);
+      return 'allowed' as const;
+    });
+  }
+
   openPosts(forumId: string) {
     return this.attempt('openPosts', forumId, () => {
       if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
````

### Task 4: 8V-1 task 4: EventForumService draws the listing and the event posts

Prototype commit: `bbc7e993e7a440e8492cac848440ccc60efabed1`

The listing "Events" is made pinned and locked, edited in place (an
unchanged one not at all), pinned again after each edit, taken over from
the bot's open or archived posts where its record is lost, made anew where
it was deleted. Its sections Now, This week and Coming up are counted and
kept within the text budget (fitLines of the summary), with the Campfire
foot where a line carries the hint (src/render/events-forum.ts).

A post per event of a posted kind opens postDaysAhead before its start (or
at once), is edited when its name or times change, follows its event to a
new id, says "Leek Duck no longer lists this event." and is archived when
the event is dropped before its start, archives itself a day after the end
(unlocked), and is archived by the upkeep three days after; one a moderator
deleted is marked gone and never made again. A forum that is gone is said
once per server.

Draws run one at a time: after each read of the feed, at the next start,
end or post opening, a second after local midnight (everyLocalMidnight, now
shared with PartyService.watchMidnight), in the scheduler's hourly upkeep
and in the catch-up on reconnect. Wired in app.ts with its stop.

**Files:**

```
 src/app.ts                              |  17 +++++
 src/commands/admin/setup-forums.test.ts |  15 +++-
 src/commands/admin/setup-forums.ts      |   9 ++-
 src/render/events-forum.test.ts         | 156 +++++++++++++++++++++++++++++++++++++
 src/render/events-forum.ts              | 139 +++++++++++++++++++++++++++++++++
 src/render/summary.ts                   |   2 +-
 src/services/event-forum.test.ts        | 572 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/services/event-forum.ts             | 637 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/local-midnight.test.ts     |  59 ++++++++++++++
 src/services/local-midnight.ts          |  44 +++++++++++
 src/services/party-scheduler.test.ts    |  28 +++++++
 src/services/party-scheduler.ts         |   8 +-
 src/services/party-service.ts           |  23 +++---
 13 files changed, 1672 insertions(+), 37 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/render/events-forum.test.ts src/services/event-forum.test.ts src/services/local-midnight.test.ts src/services/party-scheduler.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bbc7e993e7a440e8492cac848440ccc60efabed1 -- src test data docs/architecture docs/guides docs/superpowers/plans/2026-10-29-phase-8v1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8V-1 task 4: EventForumService draws the listing and the event posts`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 6a10b08516fba1f7b544326042ffc01091505523..7d219d2b6f7ebf557bf16e05e12a0aef0922f90d 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -814,6 +814,8 @@ export async function startApp(
     screenshots: screenshotStore,
     emoji: appEmoji,
     webSessions,
+    // The events forum, drawn hourly (plan 8V-1).
+    ...(eventForum ? { eventForum } : {}),
     splits: partyService,
     lines,
     gateway: partyGateway,
@@ -1232,6 +1234,8 @@ export async function startApp(
       { name: 'raid bosses', run: () => raidBosses.catchUp() },
       { name: 'max bosses', run: () => maxBosses.catchUp() },
       { name: 'events', run: () => raidEvents.catchUp() },
+      // The events forum drawn anew: a start, an end or a midnight may have passed (plan 8V-1).
+      ...(eventForum ? [{ name: 'events forum', run: () => eventForum.catchUp() }] : []),
       { name: 'research tasks', run: () => researchTasks.catchUp() },
       { name: 'rocket lineups', run: () => rocketLineups.catchUp() },
       { name: 'game data', run: () => gameData.catchUp() },
@@ -1242,6 +1246,11 @@ export async function startApp(
   void connected.then(() => {
     partyService.watchMidnight();
   });
+  // The events forum (plan 8V-1): drawn after each read of the feed, at its next change, a second
+  // after local midnight, and now.
+  void connected.then(() => {
+    eventForum?.start();
+  });
   void connected.then(() =>
     stopPosts
       ?.start()
@@ -1487,6 +1496,14 @@ export async function startApp(
           await raidEvents.whenIdle();
         },
       },
+      {
+        name: 'events forum',
+        timeoutMs: 5_000,
+        run: async () => {
+          eventForum?.stop();
+          await eventForum?.flush();
+        },
+      },
       {
         name: 'event spawns',
         timeoutMs: 1_000,
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index a9fac2df479cf3f92431ab46bdbabbafcd2c1186..3d87b997640c05859e4cc1db2d802c79c8606b48 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -158,20 +158,31 @@ describe('/admin setup-forums', () => {
     expect(forumId).toBeDefined();
     expect(gateway.forums.get(forumId ?? '')?.regionChannelId).toBe(BOT_UPDATES);
     expect(lines.at(-1)).toBe(
-      `Events forum: created <#${forumId}>, closed it to posts by members.`,
+      `Events forum: created <#${forumId}>, closed it to posts by members, posted, pinned and ` +
+        'locked the listing.',
     );
     // Run again: it is there.
     const again = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
     expect(again.at(-1)).toBe(`Events forum: <#${forumId}> is ready.`);
   });
 
+  // Review V1: before the events feed is read, the listing waits for it.
+  it('says that the listing waits for the events feed while it is not read', async () => {
+    const { run } = await setup({}, undefined, { events: true, feedUnread: true });
+    const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
+    expect(lines.at(-1)).toMatch(
+      /^Events forum: created <#\d+>, closed it to posts by members\. The listing is posted once the events feed is read\.$/u,
+    );
+  });
+
   it('says what it could not do in the events forum, or why it has none', async () => {
     const { run, gateway } = await setup({}, undefined, { events: true });
     gateway.addForum('600000000000000001', [], 'events');
     gateway.noReserving.add('600000000000000001');
     const lines = sent((await run()).editReply).content?.split(NEWLINE) ?? [];
     expect(lines.at(-1)).toBe(
-      'Events forum: <#600000000000000001> is ready. I could not close it to posts by members ' +
+      'Events forum: <#600000000000000001> is ready, posted, pinned and locked the listing. I ' +
+        'could not close it to posts by members ' +
         '(I need Manage Permissions and Send Messages there; see the log). I could not let ' +
         'myself manage its posts (give me Manage Posts and Manage Permissions there).',
     );
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index 1437323947a4c2b35f80d8ed03548f9a167bb2f0..33af66265e67729f06e77216a9d696fa127a3778 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -153,6 +153,7 @@ function eventsLine(result: EventsForumSetup, botUpdates: string): string {
   const what = [
     result.forum === 'created' ? `created ${forum}` : `${forum} is ready`,
     ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
+    ...(result.listing === 'made' ? ['posted, pinned and locked the listing'] : []),
   ];
   const not = [
     ...(result.posting === 'not-allowed'
@@ -167,6 +168,11 @@ function eventsLine(result: EventsForumSetup, botUpdates: string): string {
             'Permissions there).',
         ]
       : []),
+    ...(result.listing === 'failed' ? [' I could not post the listing (see the log).'] : []),
+    // Before the events feed is read (review V1), nothing of the listing is known yet.
+    ...(result.listing === 'waiting'
+      ? [' The listing is posted once the events feed is read.']
+      : []),
   ];
   return `Events forum: ${what.join(', ')}.${not.join('')}`;
 }
@@ -227,7 +233,8 @@ export const setupForums: SubcommandPart = {
       'members could use it is opened once; a lock a moderator sets later stays. Nothing else ' +
       'that is already there changes, so it is safe to run again. A forum whose region is gone ' +
       'is named and left alone. Where the settings name an events forum (`channels.events`), ' +
-      'it is made too, in the category of bot-updates, with posts made by me alone.',
+      'it is made too, in the category of bot-updates, with posts made by me alone, and its ' +
+      'listing "Events" is posted, pinned and locked.',
     examples: ['/admin setup-forums'],
   },
   defer: 'ephemeral',
diff --git a/src/render/events-forum.test.ts b/src/render/events-forum.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0f0eda9449b15d49a16b5362093bc5cb4c5387f4
--- /dev/null
+++ b/src/render/events-forum.test.ts
@@ -0,0 +1,156 @@
+import { ComponentType, type APIMessageTopLevelComponent } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { listedEvent } from '../../test/support/event-forum-store-cases.js';
+import type { ListedEvent, ListingSections } from '../domain/time/event-listing.js';
+import {
+  CAMPFIRE_FOOT,
+  DROPPED_WORDS,
+  eventLine,
+  eventPostMessage,
+  listingMessage,
+  NO_EVENTS,
+} from './events-forum.js';
+import { TEXT_BUDGET } from './party-post.js';
+import { plain } from './text.js';
+
+const ZONE = 'America/New_York';
+const at = (iso: string): number =>
+  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;
+
+/** The texts of a message's text displays, in order. */
+function texts(components: readonly APIMessageTopLevelComponent[]): string[] {
+  const found: string[] = [];
+  const visit = (component: unknown): void => {
+    const one = component as { type: ComponentType; content?: string; components?: unknown[] };
+    if (one.type === ComponentType.TextDisplay && one.content !== undefined) {
+      found.push(one.content);
+    }
+    for (const child of one.components ?? []) visit(child);
+  };
+  for (const component of components) visit(component);
+  return found;
+}
+
+const day = listedEvent({
+  start: at('2026-11-21T14:00'),
+  end: at('2026-11-21T17:00'),
+});
+const hour = listedEvent({
+  id: 'raidhour20261118',
+  name: 'Cresselia and Darkrai Raid Hour',
+  eventType: 'raid-hour',
+  link: 'https://leekduck.com/events/raidhour20261118/',
+  image: null,
+  start: at('2026-11-18T18:00'),
+  end: at('2026-11-18T19:00'),
+});
+const wild = listedEvent({
+  id: 'into-the-wild-2026',
+  name: 'Into the Wild',
+  eventType: 'event',
+  link: null,
+  start: at('2026-11-09T10:00'),
+  end: at('2026-11-13T20:00'),
+});
+const sections = (over: Partial<ListingSections> = {}): ListingSections => ({
+  now: [],
+  week: [],
+  coming: [],
+  ...over,
+});
+
+describe('an event’s line of the listing (plan 8V-1)', () => {
+  it('names it, linked to Leek Duck, with its times, its post and Campfire', () => {
+    expect(eventLine(day, '800000000000000001', ZONE)).toBe(
+      '**[Pawniard Community Day](<https://leekduck.com/events/november-communityday2026/>)** · ' +
+        'Sat, Nov 21, 2–5 PM · <#800000000000000001> · ' +
+        '[Campfire](<https://campfire.scopely.com/discover>)',
+    );
+  });
+
+  it('names one without a link or post plainly, its name made safe', () => {
+    const odd = listedEvent({ ...wild, name: 'Into the *Wild* [2026](x)' });
+    expect(eventLine(odd, undefined, ZONE)).toBe(
+      `**${plain(odd.name)}** · Nov 9 – Nov 13 · ` +
+        '[Campfire](<https://campfire.scopely.com/discover>)',
+    );
+    expect(plain(odd.name)).toContain('\\*Wild\\*');
+  });
+});
+
+describe('the listing "Events" (plan 8V-1)', () => {
+  it('counts the sections in its head, lists each by start, and says the hint once at the foot', () => {
+    const message = listingMessage(
+      sections({ now: [wild], week: [hour], coming: [day] }),
+      (id) => (id === day.id ? '800000000000000001' : undefined),
+      ZONE,
+    );
+    const shown = texts(message.components);
+    expect(shown[0]).toBe('### Events\n1 now · 1 this week · 1 coming up');
+    expect(shown[1]).toBe(`**Now · 1**\n${eventLine(wild, undefined, ZONE)}`);
+    expect(shown[2]).toBe(`**This week · 1**\n${eventLine(hour, undefined, ZONE)}`);
+    expect(shown[3]).toBe(`**Coming up · 1**\n${eventLine(day, '800000000000000001', ZONE)}`);
+    expect(shown[4]).toBe(`-# ${CAMPFIRE_FOOT}`);
+    expect(CAMPFIRE_FOOT).toBe(
+      'Events marked Campfire may have official meetups by Community Ambassadors there. Pine ' +
+        'only links to it.',
+    );
+    expect(JSON.stringify(message)).not.toMatch(/<t:/u);
+  });
+
+  it('says so when nothing is listed, without the foot', () => {
+    expect(texts(listingMessage(sections(), () => undefined, ZONE).components)).toEqual([
+      `### Events\n${NO_EVENTS}`,
+    ]);
+    expect(NO_EVENTS).toBe('No events listed right now.');
+  });
+
+  it('keeps within the text budget, a section ending with "…and N more" and keeping its count', () => {
+    const many = Array.from({ length: 200 }, (_, n) =>
+      listedEvent({
+        id: `event-${String(n)}`,
+        name: `A rather long event name number ${String(n)} for the listing`,
+        start: day.start + n * 60_000,
+        end: day.end + n * 60_000,
+      }),
+    );
+    const shown = texts(
+      listingMessage(sections({ coming: many }), () => undefined, ZONE).components,
+    );
+    const coming = shown.find((text) => text.startsWith('**Coming up'));
+    expect(coming?.split('\n')[0]).toBe('**Coming up · 200**');
+    expect(coming?.split('\n').at(-1)).toMatch(/^…and \d+ more$/u);
+    expect(shown.join('\n').length).toBeLessThanOrEqual(TEXT_BUDGET);
+  });
+});
+
+describe('an event’s post (plan 8V-1)', () => {
+  it('has the name as a heading, the times, Leek Duck, the hint and the feed’s picture', () => {
+    const message = eventPostMessage(day, ZONE);
+    expect(texts(message.components)).toEqual([
+      '## Pawniard Community Day\nSat, Nov 21, 2–5 PM\n' +
+        '[More on Leek Duck](<https://leekduck.com/events/november-communityday2026/>)\n' +
+        'Official meetups, if any: [Campfire](<https://campfire.scopely.com/discover>)',
+    ]);
+    expect(JSON.stringify(message.components)).toContain(
+      JSON.stringify({
+        media: { url: 'https://cdn.leekduck.com/assets/img/events/cd/pawniard.jpg' },
+      }),
+    );
+    // No buttons, and nobody pinged.
+    expect(JSON.stringify(message.components)).not.toMatch(/"type":1[,}]/u);
+    expect(message.mention).toBeUndefined();
+  });
+
+  it('goes without a link or picture the feed lacks, and says when Leek Duck dropped it', () => {
+    const bare: ListedEvent = { ...wild, image: null };
+    const message = eventPostMessage(bare, ZONE, { dropped: true });
+    expect(texts(message.components)).toEqual([
+      '## Into the Wild\nNov 9 – Nov 13\n' +
+        'Official meetups, if any: [Campfire](<https://campfire.scopely.com/discover>)',
+      DROPPED_WORDS,
+    ]);
+    expect(DROPPED_WORDS).toBe('Leek Duck no longer lists this event.');
+    expect(JSON.stringify(message.components)).not.toMatch(/"type":12[,}]/u);
+  });
+});
diff --git a/src/render/events-forum.ts b/src/render/events-forum.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9dca0ca160d496600dd9f7400156463d24dbc8a9
--- /dev/null
+++ b/src/render/events-forum.ts
@@ -0,0 +1,139 @@
+import type { APIComponentInContainer } from 'discord.js';
+import { CAMPFIRE_DISCOVER_URL } from '../domain/campfire.js';
+import {
+  eventTimeWords,
+  hasCampfireHint,
+  type ListedEvent,
+  type ListingSections,
+} from '../domain/time/event-listing.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import { TEXT_BUDGET } from './party-post.js';
+import { linkTextOf } from './raid-post.js';
+import { fitLines } from './summary.js';
+import { LIMITS, plain } from './text.js';
+import { container, LIST_COLOUR, mediaGallery, separator, textDisplay } from './v2.js';
+
+/*
+ * The events forum's messages (plan 8V-1; design `2026-10-28-events-forum-design.md`): the pinned
+ * listing "Events" and an event's post. Which events, in which section, and their times in words
+ * are the domain's (`event-listing.ts`); the words around them are here. Times are plain local
+ * text (ruling A), never Discord's stamps; nobody is pinged; the feed's text goes through
+ * `plain()`.
+ */
+
+/** The listing post's title, and its message's heading. */
+export const EVENTS_TITLE = 'Events';
+
+/** What the listing says when nothing is listed. */
+export const NO_EVENTS = 'No events listed right now.';
+
+/** The foot under the listing where a line is marked Campfire. */
+export const CAMPFIRE_FOOT =
+  'Events marked Campfire may have official meetups by Community Ambassadors there. Pine only ' +
+  'links to it.';
+
+/** What an event's post says once Leek Duck dropped the event before its start. */
+export const DROPPED_WORDS = 'Leek Duck no longer lists this event.';
+
+/**
+ * An event's post's title: its name cut to Discord's 100 characters, counted by code points as
+ * the feed's names are (`eventName`), the white space at the end of a cut dropped (review V3).
+ */
+export function eventPostTitle(name: string): string {
+  return Array.from(name).slice(0, LIMITS.title).join('').trimEnd();
+}
+
+/** The link to Campfire's map, as a line and a post show it. */
+const CAMPFIRE_LINK = `[Campfire](<${CAMPFIRE_DISCOVER_URL}>)`;
+
+/** The section headings, by the domain's sections. */
+const HEADINGS: Readonly<Record<keyof ListingSections, string>> = {
+  now: 'Now',
+  week: 'This week',
+  coming: 'Coming up',
+};
+
+/** The head's words for a section's count. */
+const COUNT_WORDS: Readonly<Record<keyof ListingSections, string>> = {
+  now: 'now',
+  week: 'this week',
+  coming: 'coming up',
+};
+
+/** An event's name, linked to its Leek Duck page where the feed gives one, in bold. */
+function nameOf(event: Pick<ListedEvent, 'name' | 'link'>): string {
+  return event.link === null
+    ? `**${plain(event.name)}**`
+    : `**[${linkTextOf(event.name)}](<${event.link}>)**`;
+}
+
+/**
+ * An event's line: its name (linked to Leek Duck), its times as plain local text, its post where
+ * it has one, and `Campfire` where its kind gets the hint.
+ */
+export function eventLine(event: ListedEvent, postId: string | undefined, zone: string): string {
+  return [
+    nameOf(event),
+    eventTimeWords(event.start, event.end, zone),
+    ...(postId === undefined ? [] : [`<#${postId}>`]),
+    ...(hasCampfireHint(event) ? [CAMPFIRE_LINK] : []),
+  ].join(' · ');
+}
+
+/**
+ * The listing (`EVENTS_TITLE`): a head counting the sections, each section with its count and its
+ * lines by start (`listingSections`), the hint's foot once where a line carries it, all within
+ * `TEXT_BUDGET` (a section that does not fit ends with "…and N more" and keeps its count, as the
+ * region's summary does). `postOf` gives an event's post where it has one.
+ */
+export function listingMessage(
+  sections: ListingSections,
+  postOf: (eventId: string) => string | undefined,
+  zone: string,
+): V2Message {
+  const order = ['now', 'week', 'coming'] as const;
+  const shown = order.filter((key) => sections[key].length > 0);
+  const counts = shown.map((key) => `${String(sections[key].length)} ${COUNT_WORDS[key]}`);
+  const head = `### ${EVENTS_TITLE}\n${counts.length === 0 ? NO_EVENTS : counts.join(' · ')}`;
+  const hinted = shown.some((key) => sections[key].some((event) => hasCampfireHint(event)));
+  const foot = hinted ? `-# ${CAMPFIRE_FOOT}` : undefined;
+  const parts: APIComponentInContainer[] = [textDisplay(head)];
+  let used = head.length + (foot?.length ?? 0);
+  for (const [index, key] of shown.entries()) {
+    const heading = `**${HEADINGS[key]} · ${String(sections[key].length)}**`;
+    // Each section after it is sure of its heading and a line that counts what does not fit.
+    const later = shown.slice(index + 1).length * 60;
+    const room = TEXT_BUDGET - used - later - heading.length - 1;
+    const lines = sections[key].map((event) => eventLine(event, postOf(event.id), zone));
+    const text = [heading, ...fitLines(lines, room)].join('\n');
+    used += text.length;
+    parts.push(separator(), textDisplay(text));
+  }
+  if (foot !== undefined) parts.push(separator(), textDisplay(foot));
+  return { v2: true, components: [container(LIST_COLOUR, parts)] };
+}
+
+/**
+ * An event's post: its name as a heading, its times, "More on Leek Duck" where the feed links its
+ * page, the Campfire hint where its kind gets it, and the feed's picture (Discord loads it or shows
+ * nothing; Pine fetches nothing, R6). With `dropped`, the line that Leek Duck no longer lists it.
+ * No buttons, and it pings nobody.
+ */
+export function eventPostMessage(
+  event: ListedEvent,
+  zone: string,
+  options: { dropped?: boolean } = {},
+): V2Message {
+  const text = [
+    `## ${plain(event.name)}`,
+    eventTimeWords(event.start, event.end, zone),
+    ...(event.link === null ? [] : [`[More on Leek Duck](<${event.link}>)`]),
+    ...(hasCampfireHint(event) ? [`Official meetups, if any: ${CAMPFIRE_LINK}`] : []),
+  ].join('\n');
+  const parts: APIComponentInContainer[] = [
+    textDisplay(text),
+    ...(options.dropped === true ? [textDisplay(DROPPED_WORDS)] : []),
+    ...(event.image === null ? [] : [mediaGallery([{ url: event.image }])]),
+  ];
+  return { v2: true, components: [container(LIST_COLOUR, parts)] };
+}
diff --git a/src/render/summary.ts b/src/render/summary.ts
index d5cf9296bb523acd85a965e9e325dfd629915f7a..5b01954b247c6603a1e1130983c0bddbd1e6ac34 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -322,7 +322,7 @@ function planned<L extends { party: TimedParty }>(listed: readonly L[], now: num
  * As many of `texts`, one per line, as fit into `limit` characters (each with its line break);
  * what does not fit is counted in a last line.
  */
-function fitLines(texts: readonly string[], limit: number): string[] {
+export function fitLines(texts: readonly string[], limit: number): string[] {
   const lines: string[] = [];
   let length = 0;
   for (const [index, text] of texts.entries()) {
diff --git a/src/services/event-forum.test.ts b/src/services/event-forum.test.ts
index 22b10af6b2844f598b7e1fa5f41d1dfb9d80dcc2..2839f875f8375eb39c0e7ec4cc14eb48867dc515 100644
--- a/src/services/event-forum.test.ts
+++ b/src/services/event-forum.test.ts
@@ -1,19 +1,27 @@
 import { describe, expect, it } from 'vitest';
-import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
+import { heldCall } from '../../test/support/held-call.js';
 import { MemoryEventForums } from '../../test/support/event-forum-store.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
 import { loadSettings, type Settings } from '../config/settings.js';
 import type { ListedEvent } from '../domain/time/event-listing.js';
+import type { OutgoingMessage } from '../discord/party-gateway.js';
+import { listedEvent } from '../../test/support/event-forum-store-cases.js';
 import { EventForumService } from './event-forum.js';
 
 const SERVER = '412345678901234567';
 const BOT_UPDATES = '500000000000000010';
 const CATEGORY = '500000000000000011';
 
+const ZONE = 'America/New_York';
+const at = (iso: string): number =>
+  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;
+const DAY = 24 * 60 * 60_000;
+
 /** The events forum's service over the fake gateway, the server having its bot-updates channel. */
-export function eventForumWith(
-  options: { events?: ListedEvent[]; settings?: Partial<Settings>; now?: () => number } = {},
+function eventForumWith(
+  options: { events?: ListedEvent[]; settings?: Partial<Settings>; now?: number } = {},
 ) {
   const gateway = new FakePartyGateway();
   gateway.addChannel(CATEGORY, 'INFO', { kind: 'category' });
@@ -25,22 +33,55 @@ export function eventForumWith(
     ...options.settings,
   };
   const store = new MemoryEventForums();
-  const listed = { events: options.events ?? [] };
+  // What the feed's provider knows: the listing, whether it is known, what it dropped (V1).
+  const listed = {
+    events: options.events ?? [],
+    known: true,
+    dropped: new Set<string>(),
+  };
+  const listeners: (() => void)[] = [];
+  const clock = { now: options.now ?? at('2026-11-10T12:00') };
+  const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
   const { log, entries } = createTestLogger();
   const service = new EventForumService({
     gateway,
     store,
     events: {
       listedEvents: () => listed.events,
-      onListedChange: () => undefined,
-      listingKnown: () => true,
-      droppedIds: () => new Set<string>(),
+      onListedChange: (listener) => listeners.push(listener),
+      listingKnown: () => listed.known,
+      droppedIds: () => listed.dropped,
     },
     settings,
     log,
-    ...(options.now ? { now: options.now } : {}),
+    now: () => clock.now,
+    setTimer: (run, ms) => {
+      // A timer that fired is done, as one cancelled.
+      const timer = {
+        run: () => {
+          timer.cancelled = true;
+          run();
+        },
+        ms,
+        cancelled: false,
+      };
+      timers.push(timer);
+      return () => {
+        timer.cancelled = true;
+      };
+    },
   });
-  return { service, gateway, store, listed, entries, settings };
+  /**
+   * The feed read anew: the listeners told, and the draw waited for. `dropped`: the ids the read
+   * dropped before their start.
+   */
+  const read = async (events: ListedEvent[], dropped: string[] = []) => {
+    listed.events = events;
+    listed.dropped = new Set(dropped);
+    for (const listener of listeners) listener();
+    await service.flush();
+  };
+  return { service, gateway, store, listed, entries, settings, clock, timers, read, listeners };
 }
 
 describe('EventForumService: the forum of /admin setup-forums (plan 8V-1)', () => {
@@ -101,11 +142,10 @@ describe('EventForumService: the forum of /admin setup-forums (plan 8V-1)', () =
     gateway.addChannel('600000000000000001', 'events', { kind: 'forum' });
     gateway.addForum('600000000000000001', [], 'events');
     await service.setup(SERVER);
-    expect(await store.forum(SERVER)).toEqual({
-      serverId: SERVER,
-      forumId: '600000000000000001',
-      listingPostId: null,
-    });
+    const record = await store.forum(SERVER);
+    expect(record?.forumId).toBe('600000000000000001');
+    // The listing of the old forum is forgotten; the new forum has its own.
+    expect(record?.listingPostId).not.toBe('700000000000000001');
   });
 
   it('says what it could not do: close it to members, let itself manage the posts', async () => {
@@ -138,3 +178,507 @@ describe('EventForumService: the forum of /admin setup-forums (plan 8V-1)', () =
     expect(entries.some((entry) => entry.msg === 'could not make the events forum')).toBe(true);
   });
 });
+
+/** The events of the tests, around 2026-11-10 12:00 in New York. */
+const COMMUNITY_DAY = listedEvent({ start: at('2026-11-21T14:00'), end: at('2026-11-21T17:00') });
+const RAID_HOUR = listedEvent({
+  id: 'raidhour20261118',
+  name: 'Cresselia and Darkrai Raid Hour',
+  eventType: 'raid-hour',
+  link: 'https://leekduck.com/events/raidhour20261118/',
+  image: null,
+  start: at('2026-11-18T18:00'),
+  end: at('2026-11-18T19:00'),
+});
+const INTO_THE_WILD = listedEvent({
+  id: 'into-the-wild-2026',
+  name: 'Into the Wild',
+  eventType: 'event',
+  link: 'https://leekduck.com/events/into-the-wild-2026/',
+  image: null,
+  start: at('2026-11-09T10:00'),
+  end: at('2026-11-13T20:00'),
+});
+const FAR_OFF = listedEvent({
+  id: 'twilight-wishes-2026',
+  name: 'Twilight Wishes',
+  eventType: 'event',
+  image: null,
+  start: at('2026-11-30T10:00'),
+  end: at('2026-12-01T20:00'),
+});
+
+/** A message as JSON, to look for what a member reads in it. */
+function words(message: OutgoingMessage | undefined): string {
+  return JSON.stringify(message ?? null);
+}
+
+describe('EventForumService: the listing "Events" (plan 8V-1)', () => {
+  /** The service with its forum made by the setup, and the feed read once. */
+  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
+    const made = eventForumWith({ events });
+    const setup = await made.service.setup(SERVER);
+    made.service.start();
+    await made.service.flush();
+    const forumId = setup.forum === 'created' ? setup.forumId : '';
+    const record = async () => (await made.store.forum(SERVER))?.listingPostId ?? '';
+    const listing = async () => made.gateway.posts.get(await record());
+    return { ...made, setup, forumId, record, listing };
+  };
+
+  it('posts the listing with setup-forums: pinned, locked, recorded, and says so', async () => {
+    const { setup, listing, forumId } = await drawn();
+    expect(setup).toMatchObject({ listing: 'made' });
+    expect(await listing()).toMatchObject({
+      forumId,
+      title: 'Events',
+      pinned: true,
+      locked: true,
+      autoArchiveMinutes: 10_080,
+    });
+    const text = words((await listing())?.message);
+    expect(text).toContain('1 now · 2 coming up');
+    expect(text).toContain('Into the Wild');
+    expect(text).toContain('Pawniard Community Day');
+  });
+
+  it('edits it in place after a read that changed it, and not at all after one that did not', async () => {
+    const { read, listing } = await drawn();
+    const edits = (await listing())?.edits ?? 0;
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+    expect((await listing())?.edits).toBe(edits);
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD, FAR_OFF]);
+    expect((await listing())?.edits).toBe(edits + 1);
+    expect(words((await listing())?.message)).toContain('Twilight Wishes');
+  });
+
+  it('opens an archived listing for the edit and pins it again; a moderator’s unlock stands', async () => {
+    const { read, listing } = await drawn();
+    const post = await listing();
+    if (!post) throw new Error('no listing');
+    post.archived = true;
+    post.pinned = false;
+    post.locked = false;
+    await read([COMMUNITY_DAY, FAR_OFF]);
+    expect(post).toMatchObject({ archived: false, pinned: true, locked: false });
+  });
+
+  it('takes over a listing whose record is lost, among the archived posts too, never making a second', async () => {
+    const { read, listing, store, forumId, gateway } = await drawn();
+    const post = await listing();
+    if (!post) throw new Error('no listing');
+    post.archived = true;
+    await store.setListing(SERVER, forumId, null);
+    await read([COMMUNITY_DAY]);
+    expect(gateway.postsIn(forumId).filter((one) => one.title === 'Events')).toHaveLength(1);
+    expect((await store.forum(SERVER))?.listingPostId).toBe(post.id);
+    expect(words(post.message)).not.toContain('Into the Wild');
+  });
+
+  it('makes a new listing where the old one was deleted', async () => {
+    const { read, record, gateway } = await drawn();
+    const old = await record();
+    gateway.gone.add(old);
+    await read([COMMUNITY_DAY]);
+    expect(await record()).not.toBe(old);
+    expect(gateway.posts.get(await record())).toMatchObject({ title: 'Events', pinned: true });
+  });
+
+  it('says that nothing is listed, and draws the listing anew a second after local midnight', async () => {
+    const { read, listing, timers, clock } = await drawn();
+    await read([]);
+    expect(words((await listing())?.message)).toContain('No events listed right now.');
+    const midnight = timers.find(
+      (timer) => !timer.cancelled && timer.ms === at('2026-11-11T00:00') - clock.now + 1_000,
+    );
+    expect(midnight).toBeDefined();
+  });
+
+  it('draws again at the next start, end or post opening among the listed events, one timer set anew each draw', async () => {
+    const { read, timers, clock, listing, service, store } = await drawn();
+    await read([RAID_HOUR, FAR_OFF]);
+    // Besides the midnight's timer.
+    const midnight = at('2026-11-11T00:00') - clock.now + 1_000;
+    const live = () => timers.filter((timer) => !timer.cancelled && timer.ms !== midnight);
+    // Twilight Wishes' post opens first (14 days before its start): a second after it, a draw.
+    const opening = at('2026-11-16T10:00');
+    const first = live().find((timer) => timer.ms === opening - clock.now + 1_000);
+    expect(first).toBeDefined();
+    expect(live()).toEqual([first]);
+    clock.now = opening + 1_000;
+    first?.run();
+    await service.flush();
+    expect((await store.posts(SERVER)).map((row) => row.eventId)).toContain(FAR_OFF.id);
+    // Then the Raid Hour's start: Now is drawn at once.
+    const next = live().find((timer) => timer.ms === RAID_HOUR.start - clock.now + 1_000);
+    expect(live()).toEqual([next]);
+    clock.now = RAID_HOUR.start + 1_000;
+    next?.run();
+    await service.flush();
+    expect(words((await listing())?.message)).toContain('1 now');
+  });
+
+  it('draws in the hourly upkeep and the catch-up', async () => {
+    const { listing, listed, service, clock } = await drawn();
+    listed.events = [FAR_OFF];
+    clock.now += 60_000;
+    await service.upkeep();
+    expect(words((await listing())?.message)).not.toContain('Into the Wild');
+    listed.events = [];
+    await expect(service.catchUp()).resolves.toBe('done');
+    expect(words((await listing())?.message)).toContain('No events listed right now.');
+  });
+
+  it('says once that a forum is gone, and does nothing for that server until it is back', async () => {
+    const { read, gateway, forumId, entries } = await drawn();
+    gateway.gone.add(forumId);
+    const posts = gateway.posts.size;
+    await read([COMMUNITY_DAY, FAR_OFF]);
+    await read([COMMUNITY_DAY]);
+    expect(gateway.posts.size).toBe(posts);
+    expect(entries.filter((entry) => entry.msg === 'the events forum is gone')).toEqual([
+      expect.objectContaining({ level: 40, guild: SERVER, forum: forumId }),
+    ]);
+  });
+});
+
+describe('EventForumService: an event’s post (plan 8V-1)', () => {
+  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
+    const made = eventForumWith({ events });
+    const setup = await made.service.setup(SERVER);
+    made.service.start();
+    await made.service.flush();
+    const forumId = setup.forum === 'created' ? setup.forumId : '';
+    const postOf = async (eventId: string) => {
+      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
+      return row && made.gateway.posts.get(row.postId);
+    };
+    return { ...made, forumId, postOf };
+  };
+
+  it('posts the bigger events from postDaysAhead before their start, and ones on now at once; lines only else', async () => {
+    const { postOf, store, read, clock } = await drawn([
+      COMMUNITY_DAY,
+      RAID_HOUR,
+      INTO_THE_WILD,
+      FAR_OFF,
+    ]);
+    expect(await postOf(COMMUNITY_DAY.id)).toMatchObject({
+      title: 'Pawniard Community Day',
+      tagIds: [],
+      locked: false,
+    });
+    expect(words((await postOf(COMMUNITY_DAY.id))?.message)).toContain('More on Leek Duck');
+    expect(await postOf(INTO_THE_WILD.id)).toBeDefined();
+    // Twilight Wishes starts in 20 days; a Raid Hour is a line only.
+    expect((await store.posts(SERVER)).map((row) => row.eventId).sort()).toEqual(
+      [INTO_THE_WILD.id, COMMUNITY_DAY.id].sort(),
+    );
+    clock.now = at('2026-11-16T10:00');
+    await read([COMMUNITY_DAY, RAID_HOUR, FAR_OFF]);
+    expect(await postOf(FAR_OFF.id)).toBeDefined();
+    expect(await postOf(RAID_HOUR.id)).toBeUndefined();
+  });
+
+  it('links each post in the listing', async () => {
+    const { store, gateway, postOf } = await drawn();
+    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
+    expect(words(listing?.message)).toContain(`<#${(await postOf(COMMUNITY_DAY.id))?.id ?? ''}>`);
+  });
+
+  it('edits a post when its event’s times or name change, and not otherwise', async () => {
+    const { postOf, read } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    const edits = post?.edits ?? 0;
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+    expect(post?.edits).toBe(edits);
+    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
+    await read([later, RAID_HOUR, INTO_THE_WILD]);
+    expect(post?.edits).toBe(edits + 1);
+    expect(words(post?.message)).toContain('Sat, Nov 21, 3–6 PM');
+  });
+
+  it('carries a moved event’s post over to its new id and edits it (R12)', async () => {
+    const { postOf, read, gateway, forumId, store } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    const posts = gateway.postsIn(forumId).length;
+    const moved: ListedEvent = {
+      ...COMMUNITY_DAY,
+      id: 'november-communityday2026-rescheduled',
+      name: 'Pawniard Community Day (Rescheduled)',
+      start: at('2026-11-22T14:00'),
+      end: at('2026-11-22T17:00'),
+      formerIds: [COMMUNITY_DAY.id],
+    };
+    await read([moved, RAID_HOUR, INTO_THE_WILD]);
+    expect(gateway.postsIn(forumId)).toHaveLength(posts);
+    expect(await postOf(moved.id)).toBe(post);
+    expect((await store.posts(SERVER)).map((row) => row.eventId)).not.toContain(COMMUNITY_DAY.id);
+    expect(words(post?.message)).toContain('Sun, Nov 22, 2–5 PM');
+  });
+
+  it('says in the post that Leek Duck dropped an event before its start, archives it, and lists it no more', async () => {
+    const { postOf, read, store, gateway } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    await read([RAID_HOUR, INTO_THE_WILD], [COMMUNITY_DAY.id]);
+    expect(words(post?.message)).toContain('Leek Duck no longer lists this event.');
+    expect(post).toMatchObject({ archived: true, locked: false });
+    const row = (await store.posts(SERVER)).find((one) => one.eventId === COMMUNITY_DAY.id);
+    expect(row).toMatchObject({ dropped: true });
+    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
+    expect(words(listing?.message)).not.toContain('Pawniard');
+    // Never again: a later draw leaves it archived.
+    await read([RAID_HOUR]);
+    expect(post?.archived).toBe(true);
+  });
+
+  it('lets a post archive itself a day after the end, unlocked, and archives one still open three days after, once', async () => {
+    const { postOf, read, clock, store, service } = await drawn();
+    const post = await postOf(INTO_THE_WILD.id);
+    clock.now = INTO_THE_WILD.end + 60_000;
+    await read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]);
+    expect(post).toMatchObject({ autoArchiveMinutes: 1_440, archived: false, locked: false });
+    const row = (await store.posts(SERVER)).find((one) => one.eventId === INTO_THE_WILD.id);
+    expect(row?.endedAt).toBe(clock.now);
+    clock.now = INTO_THE_WILD.end + 3 * DAY + 60_000;
+    await service.upkeep();
+    expect(post).toMatchObject({ archived: true, locked: false });
+    // A member's message opened it again: the upkeep leaves it so.
+    if (post) post.archived = false;
+    await service.upkeep();
+    expect(post?.archived).toBe(false);
+  });
+
+  it('edits rather than ends a post whose event the feed extends after its old end', async () => {
+    const { postOf, read, clock } = await drawn();
+    const post = await postOf(INTO_THE_WILD.id);
+    clock.now = INTO_THE_WILD.end + 60_000;
+    const longer = { ...INTO_THE_WILD, end: INTO_THE_WILD.end + DAY };
+    await read([COMMUNITY_DAY, RAID_HOUR, longer]);
+    expect(post?.autoArchiveMinutes).toBe(10_080);
+    expect(words(post?.message)).toContain('Nov 9 – Nov 14');
+  });
+
+  it('marks a post a moderator deleted as gone, never makes it again, and drops its link', async () => {
+    const { postOf, read, gateway, store, forumId } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    gateway.gone.add(post?.id ?? '');
+    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
+    await read([later, RAID_HOUR, INTO_THE_WILD]);
+    const row = (await store.posts(SERVER)).find((one) => one.eventId === COMMUNITY_DAY.id);
+    expect(row).toMatchObject({ gone: true });
+    const posts = gateway.postsIn(forumId).length;
+    await read([later, RAID_HOUR, INTO_THE_WILD]);
+    expect(gateway.postsIn(forumId)).toHaveLength(posts);
+    const listing = gateway.posts.get((await store.forum(SERVER))?.listingPostId ?? '');
+    expect(words(listing?.message)).not.toContain(`<#${post?.id ?? ''}>`);
+    expect(words(listing?.message)).toContain('Pawniard');
+  });
+});
+
+describe('EventForumService: the review’s fixes (plan 8V-1, round 1)', () => {
+  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
+    const made = eventForumWith({ events });
+    const setup = await made.service.setup(SERVER);
+    made.service.start();
+    await made.service.flush();
+    const forumId = setup.forum === 'created' ? setup.forumId : '';
+    const rowOf = async (eventId: string) =>
+      (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
+    const postOf = async (eventId: string) => {
+      const row = await rowOf(eventId);
+      return row && made.gateway.posts.get(row.postId);
+    };
+    const listing = async () =>
+      made.gateway.posts.get((await made.store.forum(SERVER))?.listingPostId ?? '');
+    return { ...made, forumId, rowOf, postOf, listing };
+  };
+
+  // V1: after a restart whose kept listing could not be read, nothing is dropped or made.
+  it('neither drops nor posts nor draws the listing while the listing is not known', async () => {
+    const { postOf, listed, service, listing, gateway, forumId } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    const text = words((await listing())?.message);
+    const posts = gateway.postsIn(forumId).length;
+    listed.known = false;
+    listed.events = [];
+    await service.upkeep();
+    expect(words(post?.message)).not.toContain('Leek Duck no longer lists this event.');
+    expect(post?.archived).toBe(false);
+    expect(words((await listing())?.message)).toBe(text);
+    listed.events = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD, FAR_OFF];
+    await service.upkeep();
+    expect(gateway.postsIn(forumId)).toHaveLength(posts);
+  });
+
+  it('drops only what the read said it dropped, and keeps an event merely not listed', async () => {
+    const { postOf, read, rowOf } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    await read([RAID_HOUR, INTO_THE_WILD]);
+    expect(words(post?.message)).not.toContain('Leek Duck no longer lists this event.');
+    expect((await rowOf(COMMUNITY_DAY.id))?.dropped).toBe(false);
+    await read([RAID_HOUR, INTO_THE_WILD], [COMMUNITY_DAY.id]);
+    expect((await rowOf(COMMUNITY_DAY.id))?.dropped).toBe(true);
+  });
+
+  // V2: a forum replaced at setup gets its own posts; none of the old ones is marked gone.
+  it('makes the posts anew in a forum that replaced the old one, none marked gone', async () => {
+    const { service, gateway, forumId, store } = await drawn();
+    gateway.gone.add(forumId);
+    const again = await service.setup(SERVER);
+    const newForum = again.forum === 'created' ? again.forumId : '';
+    expect(newForum).not.toBe(forumId);
+    await service.flush();
+    const rows = await store.posts(SERVER);
+    expect(rows.map((row) => row.eventId).sort()).toEqual(
+      [COMMUNITY_DAY.id, INTO_THE_WILD.id].sort(),
+    );
+    expect(rows.every((row) => !row.gone)).toBe(true);
+    for (const row of rows) expect(gateway.posts.get(row.postId)?.forumId).toBe(newForum);
+  });
+
+  // V3: a new name renames the post, by Discord's rename limit.
+  it('renames a post whose event’s name changed, after the wait Discord names', async () => {
+    const { postOf, read, rowOf, gateway, timers, service } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    const renamed = { ...COMMUNITY_DAY, name: 'Pawniard and Bisharp Community Day' };
+    gateway.renameLater.set(post?.id ?? '', 60_000);
+    await read([renamed, RAID_HOUR, INTO_THE_WILD]);
+    expect(post?.title).toBe('Pawniard Community Day');
+    expect((await rowOf(COMMUNITY_DAY.id))?.name).toBe('Pawniard Community Day');
+    const later = timers.find((timer) => !timer.cancelled && timer.ms === 60_000);
+    expect(later).toBeDefined();
+    gateway.renameLater.delete(post?.id ?? '');
+    later?.run();
+    await service.flush();
+    expect(post?.title).toBe('Pawniard and Bisharp Community Day');
+    expect((await rowOf(COMMUNITY_DAY.id))?.name).toBe('Pawniard and Bisharp Community Day');
+    expect(words(post?.message)).toContain('Pawniard and Bisharp Community Day');
+  });
+
+  it('cuts a long name to Discord’s 100 characters for the title', async () => {
+    const long = { ...COMMUNITY_DAY, id: 'long', name: `${'Ä'.repeat(99)}Bé` };
+    const { postOf } = await drawn([long]);
+    expect(Array.from((await postOf('long'))?.title ?? '')).toHaveLength(100);
+  });
+
+  // V4: another pinned post (Discord's one pin per forum) keeps nothing else from happening.
+  it('makes, locks and records the listing although the forum’s one pin is taken, said once', async () => {
+    const made = eventForumWith({ events: [COMMUNITY_DAY] });
+    made.gateway.addForum('600000000000000001', [], 'events');
+    const other =
+      (await made.gateway.createPost('600000000000000001', {
+        title: 'Rules',
+        message: { content: 'Be kind.' },
+        tagIds: [],
+      })) ?? '';
+    await made.gateway.pinPost(other);
+    const setup = await made.service.setup(SERVER);
+    expect(setup).toMatchObject({ listing: 'made' });
+    const listingId = (await made.store.forum(SERVER))?.listingPostId ?? '';
+    expect(made.gateway.posts.get(listingId)).toMatchObject({ locked: true, pinned: false });
+    made.service.start();
+    await made.read([COMMUNITY_DAY, FAR_OFF]);
+    const edits = made.gateway.posts.get(listingId)?.edits ?? 0;
+    await made.read([COMMUNITY_DAY, FAR_OFF]);
+    expect(made.gateway.posts.get(listingId)?.edits).toBe(edits);
+    expect(
+      made.entries.filter((entry) => entry.msg === 'could not pin the events listing'),
+    ).toHaveLength(1);
+  });
+
+  // V5: a post a moderator deleted follows its event's move, so it is not made under the new id.
+  it('moves a gone post’s row with its event, and makes no post for the new id', async () => {
+    const { postOf, read, gateway, forumId, store } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    gateway.gone.add(post?.id ?? '');
+    const later = { ...COMMUNITY_DAY, start: at('2026-11-21T15:00'), end: at('2026-11-21T18:00') };
+    await read([later, RAID_HOUR, INTO_THE_WILD]);
+    const posts = gateway.postsIn(forumId).length;
+    const moved: ListedEvent = {
+      ...later,
+      id: 'november-communityday2026-rescheduled',
+      formerIds: [COMMUNITY_DAY.id],
+    };
+    await read([moved, RAID_HOUR, INTO_THE_WILD]);
+    expect(gateway.postsIn(forumId)).toHaveLength(posts);
+    expect((await store.posts(SERVER)).find((row) => row.eventId === moved.id)).toMatchObject({
+      gone: true,
+    });
+  });
+
+  // V6 (ruling R3): a quiet post stays open until its event ends.
+  it('opens again in the hourly draw a post that archived itself before its event ended', async () => {
+    const { postOf, service, clock } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    if (post) post.archived = true;
+    await service.upkeep();
+    expect(post).toMatchObject({ archived: false, locked: false });
+    // After the end it is left archived.
+    clock.now = COMMUNITY_DAY.end + 60_000;
+    if (post) post.archived = true;
+    await service.upkeep();
+    expect(post?.archived).toBe(true);
+  });
+});
+
+describe('EventForumService: the re-review’s fixes (plan 8V-1, round 2)', () => {
+  const drawn = async (events: ListedEvent[] = [COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD]) => {
+    const made = eventForumWith({ events });
+    const setup = await made.service.setup(SERVER);
+    made.service.start();
+    await made.service.flush();
+    const forumId = setup.forum === 'created' ? setup.forumId : '';
+    const postOf = async (eventId: string) => {
+      const row = (await made.store.posts(SERVER)).find((one) => one.eventId === eventId);
+      return row && made.gateway.posts.get(row.postId);
+    };
+    return { ...made, forumId, postOf };
+  };
+
+  // W1: a rename that keeps failing does not have the unchanged message sent again each draw.
+  it('edits a renamed event’s message once, and retries only the rename while it is refused', async () => {
+    const { postOf, read, gateway } = await drawn();
+    const post = await postOf(COMMUNITY_DAY.id);
+    gateway.failing.set('renamePost', missingPermissions('PATCH'));
+    const renamed = { ...COMMUNITY_DAY, name: 'Pawniard and Bisharp Community Day' };
+    const edits = post?.edits ?? 0;
+    await read([renamed, RAID_HOUR, INTO_THE_WILD]);
+    await read([renamed, RAID_HOUR, INTO_THE_WILD]);
+    expect(post?.edits).toBe(edits + 1);
+    expect(gateway.calls.filter((call) => call === `renamePost ${post?.id ?? ''}`)).toHaveLength(2);
+    expect(post?.title).toBe('Pawniard Community Day');
+  });
+
+  // W2: no draw straddles setup's change of forum: a draw under way ends first.
+  it('lets a draw under way end before setup changes the forum, so no row of the old forum is left', async () => {
+    const { store, gateway, forumId, read, service } = await drawn();
+    const hold = heldCall('the posts of a draw');
+    const posts = store.posts.bind(store);
+    let holding = true;
+    store.posts = async (serverId: string) => {
+      if (holding) {
+        holding = false;
+        hold.arrive();
+        await hold.released;
+      }
+      return posts(serverId);
+    };
+    const reading = read([COMMUNITY_DAY, RAID_HOUR, INTO_THE_WILD, FAR_OFF]);
+    await hold.reached;
+    // The old forum is renamed by hand and a new one takes the settings' name.
+    const old = gateway.forums.get(forumId);
+    if (old) old.name = 'old-events';
+    gateway.addForum('600000000000000002', [], 'events');
+    const setup = service.setup(SERVER);
+    hold.release();
+    await setup;
+    await reading;
+    await service.flush();
+    const rows = await store.posts(SERVER);
+    expect(rows.length).toBeGreaterThan(0);
+    for (const row of rows) {
+      expect(gateway.posts.get(row.postId)?.forumId, row.eventId).toBe('600000000000000002');
+    }
+  });
+});
diff --git a/src/services/event-forum.ts b/src/services/event-forum.ts
index 0c6c250addf220cc7c6219cf9af406cc9474f5a8..9ca92aaf46d346e899818d95e59eef255d90e73e 100644
--- a/src/services/event-forum.ts
+++ b/src/services/event-forum.ts
@@ -1,10 +1,45 @@
 import type { Settings } from '../config/settings.js';
-import type { EventForumStorage } from '../db/repositories/event-forum-repository.js';
-import { isMissingPermission, type PartyGateway } from '../discord/party-gateway.js';
+import type {
+  EventForumRecord,
+  EventForumStorage,
+  EventPostRecord,
+} from '../db/repositories/event-forum-repository.js';
+import {
+  isMissingPermission,
+  rateLimitWaitMs,
+  type OutgoingMessage,
+  type PartyGateway,
+} from '../discord/party-gateway.js';
+import {
+  isPosted,
+  listingSections,
+  postOpensAt,
+  type ListedEvent,
+} from '../domain/time/event-listing.js';
+import {
+  EVENTS_TITLE,
+  eventPostMessage,
+  eventPostTitle,
+  listingMessage,
+} from '../render/events-forum.js';
 import { channelKey, channelNameFor } from '../domain/regions/region-import.js';
+import { BoundedMap } from '../bounded-map.js';
 import type { Logger } from '../log.js';
+import type { CatchUpOutcome } from './catch-up.js';
+import { everyLocalMidnight } from './local-midnight.js';
+import { isNetworkError } from './network-error.js';
 import type { ListedEventProvider } from './raid-event-service.js';
 
+const DAY_MS = 24 * 60 * 60_000;
+/** A post still open this long after its event's end is archived by the upkeep, once (R1). */
+const ARCHIVE_AFTER_END_MS = 3 * DAY_MS;
+/** The auto-archive of a post once its event ended: a day without messages (R1). */
+const AFTER_END_ARCHIVE_MINUTES = 1_440;
+/** How many event posts' last sent messages are kept (a few dozen per server and year). */
+const POSTS_SENT_KEPT = 1_000;
+/** The longest delay `setTimeout` accepts; anything longer fires at once. */
+const MAX_TIMER_MS = 2 ** 31 - 1;
+
 /** What `/admin setup-forums` did for the events forum (`EventForumService.setup`). */
 export type EventsForumSetup =
   /** The server has no `bot-updates` channel to make the forum beside: nothing was made. */
@@ -19,8 +54,16 @@ export type EventsForumSetup =
       posting: 'reserved' | 'was-reserved' | 'not-allowed';
       /** Manage Posts allowed to the bot in its own overwrite (`letBotManagePosts`). */
       managing: 'allowed' | 'was-allowed' | 'not-allowed';
+      /** The listing "Events": made now, standing, not made, or waiting for the feed. */
+      listing: ListingOutcome;
     };
 
+/**
+ * What a draw did to a server's listing: made now, standing, not made (the log says why), or
+ * waiting for the events feed (`listingKnown`, review V1).
+ */
+type ListingOutcome = 'made' | 'ready' | 'failed' | 'waiting';
+
 export interface EventForumOptions {
   gateway: PartyGateway;
   store: EventForumStorage;
@@ -29,15 +72,63 @@ export interface EventForumOptions {
   log: Logger;
   /** The clock, in epoch milliseconds. Default `Date.now`. */
   now?: () => number;
+  /** Sets a timer and gives what cancels it. Default an unref'd `setTimeout`. */
+  setTimer?: (run: () => void, ms: number) => () => void;
 }
 
 /**
  * The events forum of each server (plan 8V-1; design `2026-10-28-events-forum-design.md`): one
  * forum, named by `settings.channels.events`, made by `/admin setup-forums` in the category of
- * `bot-updates`. Made only where the settings name a forum and rehearsal mode is off (`app.ts`).
+ * `bot-updates`, with Pine's pinned and locked listing "Events" (`EVENTS_TITLE`: Now, This week,
+ * Coming up, `listingSections`) and a post per event of a posted kind (`isPosted`), opened
+ * `settings.eventsForum.postDaysAhead` before its start. Made only where the settings name a
+ * forum and rehearsal mode is off (`app.ts`, R8).
+ *
+ * Everything is drawn from the listed events (`ListedEventProvider`) and the rows of the forums
+ * and posts, so a draw at any time puts right what a restart or the network missed. Draws run one
+ * at a time (`request` coalesces): after each read of the feed, at the next start or end among
+ * the listed events (one timer set anew at each draw), a second after local midnight, in the
+ * hourly upkeep and in the catch-up on reconnect. An unchanged listing is not edited.
  */
 export class EventForumService {
-  constructor(private readonly options: EventForumOptions) {}
+  private readonly now: () => number;
+  private readonly setTimer: (run: () => void, ms: number) => () => void;
+  /** The draw under way, and whether another was asked for meanwhile. */
+  private drawing: Promise<void> | undefined;
+  private again = false;
+  /** The listing last sent to each server's post (as JSON): the same is not edited again. */
+  private readonly listingSent = new Map<string, { postId: string; text: string }>();
+  /** What was last sent to each event post (as JSON): the same is not edited again (W1). */
+  private readonly postsSent = new BoundedMap<string, string>(POSTS_SENT_KEPT);
+  /** The servers whose forum is gone, said once each until it is back. */
+  private readonly forumGoneTold = new Set<string>();
+  /** What Discord refused, said once per server and what (`pin`, `lock`, `archive`). */
+  private readonly refusedTold = new Set<string>();
+  /**
+   * What the draws since `setup` asked did to each server's listing (`made` stays: a later draw
+   * of the same run finds it standing).
+   */
+  private readonly outcomes = new Map<string, ListingOutcome>();
+  /** Whether the next draw opens the posts that archived themselves before their end (V6). */
+  private reopenDue = false;
+  private cancelNext: (() => void) | undefined;
+  private midnight: { cancel(): void } | undefined;
+  /** The timers of draws after a wait Discord named (`drawLater`). */
+  private readonly waits = new Set<() => void>();
+  private stopped = false;
+
+  constructor(private readonly options: EventForumOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.setTimer =
+      options.setTimer ??
+      ((run, ms) => {
+        const timer = setTimeout(run, ms);
+        timer.unref();
+        return () => {
+          clearTimeout(timer);
+        };
+      });
+  }
 
   /**
    * The forum's name as Discord stores it (review V7, ruling R4: lower case, spaces to hyphens;
@@ -50,12 +141,106 @@ export class EventForumService {
     return channelNameFor(name) || name;
   }
 
+  /**
+   * Draws after each read of the feed and a second after each local midnight from now on, and
+   * once now. Once Discord is there (`app.ts`); nothing after `stop`.
+   */
+  start(): void {
+    if (this.stopped) return;
+    this.options.events.onListedChange(() => {
+      this.request();
+    });
+    this.midnight?.cancel();
+    this.midnight = everyLocalMidnight({
+      zone: this.options.settings.timezone,
+      now: this.now,
+      setTimer: this.setTimer,
+      run: () => {
+        this.request();
+      },
+    });
+    this.request();
+  }
+
+  /** Stops the timers; a draw under way ends, and none starts after it. */
+  stop(): void {
+    this.stopped = true;
+    this.midnight?.cancel();
+    this.cancelNext?.();
+    this.cancelNext = undefined;
+    for (const cancel of this.waits) cancel();
+    this.waits.clear();
+  }
+
+  /** Asks for a draw of every server's forum; one under way is followed by one more. */
+  request(): void {
+    if (this.stopped) return;
+    if (this.drawing) {
+      this.again = true;
+      return;
+    }
+    this.drawing = (async () => {
+      do {
+        this.again = false;
+        await this.drawAll();
+      } while (this.again && !this.stopped);
+    })().finally(() => {
+      this.drawing = undefined;
+    });
+  }
+
+  /**
+   * Runs `work` alone in the line of draws: after the draw under way, and with none starting
+   * until it is done (a draw asked for meanwhile follows it).
+   */
+  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
+    while (this.drawing) await this.drawing;
+    const run = work();
+    this.drawing = run
+      .then(
+        () => undefined,
+        () => undefined,
+      )
+      .finally(() => {
+        this.drawing = undefined;
+        if (this.again) {
+          this.again = false;
+          this.request();
+        }
+      });
+    return run;
+  }
+
+  /** Resolves once no draw is under way (at once when none is). Never rejects. */
+  async flush(): Promise<void> {
+    while (this.drawing) await this.drawing;
+  }
+
+  /** The hourly upkeep (`PartyScheduler`): a draw, waited for. Never rejects. */
+  async upkeep(): Promise<void> {
+    // The hourly draw opens a quiet post archived before its event's end (review V6, R3).
+    this.reopenDue = true;
+    this.request();
+    await this.flush();
+  }
+
+  /**
+   * The gateway is back after a real disconnect (plan 8X-H): every forum drawn anew, as a midnight
+   * or a start may have passed while the network was away. Never rejects.
+   */
+  async catchUp(): Promise<CatchUpOutcome> {
+    if (this.stopped) return 'not-owed';
+    await this.upkeep();
+    return 'done';
+  }
+
   /**
    * Gives the server its events forum (`/admin setup-forums`): the forum of that name where the
    * server has one (the name decides, R7: a forum recorded under another name is replaced), else
    * one made beside `bot-updates`, in its category and with its permissions; Create Posts denied
    * to everyone (members write in Pine's posts but make none) and Manage Posts allowed to the
-   * bot. Recorded; what is there already is left as it is, so it is safe to run again.
+   * bot. Recorded, then drawn: its listing and posts. What is there already is left as it is, so
+   * it is safe to run again.
    */
   async setup(guildId: string): Promise<EventsForumSetup> {
     const { gateway, store, settings, log } = this.options;
@@ -83,9 +268,447 @@ export class EventForumService {
         return { forum: 'failed', name, reason: `#${botUpdates.name} is gone.` };
       }
     }
-    await store.setForum(guildId, forumId);
+    // In the one line of draws (re-review W2): a draw that read the old forum ends first, so none
+    // makes a post in it after its rows were retired.
+    const recordedId = forumId;
+    await this.exclusive(() => store.setForum(guildId, recordedId));
     const posting = (await gateway.reservePosts(forumId)) ?? 'not-allowed';
     const managing = (await gateway.letBotManagePosts(forumId)) ?? 'not-allowed';
-    return { forum: created ? 'created' : 'ready', name, forumId, posting, managing };
+    // Drawn now, through the one line of draws (two at once could make two listings): what it
+    // did to the listing is in the answer.
+    this.outcomes.delete(guildId);
+    this.request();
+    await this.flush();
+    const listing = this.outcomes.get(guildId) ?? 'failed';
+    return { forum: created ? 'created' : 'ready', name, forumId, posting, managing, listing };
+  }
+
+  /** Every server's forum drawn, one after the other; one that fails does not stop the others. */
+  private async drawAll(): Promise<void> {
+    const { store, log } = this.options;
+    const reopen = this.reopenDue;
+    this.reopenDue = false;
+    let forums: EventForumRecord[];
+    try {
+      forums = await store.forums();
+    } catch (err) {
+      log.warn({ err }, 'could not read the events forums');
+      return;
+    }
+    for (const forum of forums) {
+      if (this.stopped) return;
+      const outcome = await this.drawServer(forum, reopen);
+      if (this.outcomes.get(forum.serverId) !== 'made') this.outcomes.set(forum.serverId, outcome);
+    }
+    this.setNextTimer();
+  }
+
+  /**
+   * One server's forum drawn: its posts first (made, moved, edited, dropped, ended), then its
+   * listing, which links them. A forum that is gone is said once and nothing is done there until
+   * it is back. Never rejects: what fails is logged (a warning for the network, which the
+   * catch-up puts right).
+   */
+  private async drawServer(forum: EventForumRecord, reopen = false): Promise<ListingOutcome> {
+    const { gateway, log } = this.options;
+    const { serverId, forumId } = forum;
+    if (gateway.channelKind(forumId) !== 'forum') {
+      if (!this.forumGoneTold.has(serverId)) {
+        this.forumGoneTold.add(serverId);
+        log.warn({ guild: serverId, forum: forumId }, 'the events forum is gone');
+      }
+      return 'failed';
+    }
+    this.forumGoneTold.delete(serverId);
+    // Until the listing is known (a kept one loaded, or a read), an empty or stale one says
+    // nothing: no post is made, dropped or drawn, and the listing stands (review V1).
+    if (!this.options.events.listingKnown()) return 'waiting';
+    try {
+      const events = this.options.events.listedEvents();
+      const posts = await this.drawPosts(forum, events, reopen);
+      return await this.drawListing(forum, events, posts);
+    } catch (err) {
+      const where = { err, guild: serverId, forum: forumId };
+      if (isNetworkError(err)) log.warn(where, 'could not draw the events forum');
+      else log.error(where, 'could not draw the events forum');
+      return 'failed';
+    }
+  }
+
+  /**
+   * The server's event posts brought up to date; gives the posts the listing links (event id to
+   * post id, none gone). In order: a post whose event moved to a new id goes with it (R12); a
+   * post is made for each posted event from its opening (`postOpensAt`) until its end; a post
+   * whose event's name or times changed is edited; one whose event was dropped before its start
+   * says so and is archived; one whose event ended archives itself after a day (R1), and one
+   * still open three days after the end is archived, once. A post that is gone is marked so and
+   * never made again (R7).
+   */
+  private async drawPosts(
+    forum: EventForumRecord,
+    events: readonly ListedEvent[],
+    reopen: boolean,
+  ): Promise<Map<string, string>> {
+    const { store, settings } = this.options;
+    const { serverId } = forum;
+    const now = this.now();
+    const zone = settings.timezone;
+    const byId = new Map(events.map((event) => [event.id, event]));
+    const rows = await store.posts(serverId);
+    // Moves first: the row of an old id follows its event (R12).
+    for (const row of rows) {
+      // A gone row moves too (review V5): its event's new id gets no post either.
+      if (row.dropped || byId.has(row.eventId)) continue;
+      const moved = events.find((event) => event.formerIds.includes(row.eventId));
+      if (!moved || rows.some((other) => other.eventId === moved.id)) continue;
+      if (await store.movePost(serverId, row.eventId, moved.id)) row.eventId = moved.id;
+    }
+    const known = new Set(rows.map((row) => row.eventId));
+    for (const event of events) {
+      if (known.has(event.id) || !isPosted(event) || event.end <= now) continue;
+      if (postOpensAt(event, settings.eventsForum.postDaysAhead, zone) > now) continue;
+      const made = await this.makePost(forum, event);
+      if (made) rows.push(made);
+    }
+    for (const row of rows) {
+      if (row.gone) continue;
+      const event = byId.get(row.eventId);
+      await this.drawPost(row, event, now, reopen);
+    }
+    return new Map(rows.filter((row) => !row.gone).map((row) => [row.eventId, row.postId]));
+  }
+
+  /** Makes an event's post and records it; undefined where the forum is gone. */
+  private async makePost(
+    forum: EventForumRecord,
+    event: ListedEvent,
+  ): Promise<EventPostRecord | undefined> {
+    const { gateway, store, settings, log } = this.options;
+    const message = eventPostMessage(event, settings.timezone);
+    const postId = await gateway.createPost(forum.forumId, {
+      title: eventPostTitle(event.name),
+      message,
+      tagIds: [],
+    });
+    if (postId === undefined) return undefined;
+    this.postsSent.set(postId, JSON.stringify(message));
+    const row: EventPostRecord = {
+      serverId: forum.serverId,
+      eventId: event.id,
+      postId,
+      name: event.name,
+      start: event.start,
+      end: event.end,
+      endedAt: null,
+      archivedAt: null,
+      dropped: false,
+      gone: false,
+    };
+    if (!(await store.addPost(row))) {
+      // Made meanwhile by another draw: this one goes again.
+      log.warn({ guild: forum.serverId, event: event.id }, 'an event post was made twice');
+      await gateway.deletePost(postId);
+      return undefined;
+    }
+    log.info({ guild: forum.serverId, event: event.id, post: postId }, 'made an event post');
+    return row;
+  }
+
+  /**
+   * One post brought up to date with its event (`drawPosts`). With `reopen` (the hourly draw,
+   * review V6, R3) a post that archived itself before its event's end is opened again.
+   */
+  private async drawPost(
+    row: EventPostRecord,
+    event: ListedEvent | undefined,
+    now: number,
+    reopen: boolean,
+  ): Promise<void> {
+    const { gateway, store, settings } = this.options;
+    const zone = settings.timezone;
+    const { serverId, eventId } = row;
+    if (row.dropped) return;
+    // Its event's end as the feed has it now: one extended after its old end is not over.
+    if (row.endedAt === null && event && event.end > now) {
+      const named = event.name === row.name;
+      if (named && event.start === row.start && event.end === row.end) {
+        if (reopen && (await gateway.postInfo(row.postId))?.archived === true) {
+          // An edit opens an archived post, as everything sent or edited in it does.
+          const message = eventPostMessage(event, zone);
+          if (!(await gateway.editPost(row.postId, message))) return this.postGone(row);
+          this.postsSent.set(row.postId, JSON.stringify(message));
+        }
+        return;
+      }
+      // Only where the message would show something else than was sent (re-review W1): a
+      // rename Discord keeps refusing has the rename tried again alone.
+      if (!(await this.editEventPost(row, eventPostMessage(event, zone)))) {
+        return this.postGone(row);
+      }
+      const drawn = { start: event.start, end: event.end };
+      Object.assign(row, drawn);
+      await store.updatePost(serverId, eventId, drawn);
+      // A new name renames the post too (review V3); `row.name` follows only a rename done.
+      if (!named) await this.rename(row, event.name);
+      return;
+    }
+    if (!event && row.endedAt === null && row.start > now) {
+      // Dropped before its start, not moved: moved or canceled (the design). Only what the read
+      // said it dropped (review V1): an event merely not listed now is left as it is.
+      if (!this.options.events.droppedIds().has(eventId)) return;
+      const shown: ListedEvent = {
+        id: eventId,
+        name: row.name,
+        eventType: 'event',
+        link: null,
+        image: null,
+        start: row.start,
+        end: row.end,
+        formerIds: [],
+      };
+      const message = eventPostMessage(shown, zone, { dropped: true });
+      if (!(await gateway.editPost(row.postId, message))) return this.postGone(row);
+      await this.archive(serverId, row.postId);
+      Object.assign(row, { dropped: true, archivedAt: now });
+      await store.updatePost(serverId, eventId, { dropped: true, archivedAt: now });
+      return;
+    }
+    if (row.end > now) return;
+    if (row.endedAt === null) {
+      // Discord archives it after a day without messages; a member's message restarts that day.
+      if (!(await gateway.setAutoArchive(row.postId, AFTER_END_ARCHIVE_MINUTES))) {
+        return this.postGone(row);
+      }
+      row.endedAt = now;
+      await store.updatePost(serverId, eventId, { endedAt: now });
+    }
+    if (row.archivedAt === null && now >= row.end + ARCHIVE_AFTER_END_MS) {
+      if (!(await this.archive(serverId, row.postId))) return this.postGone(row);
+      row.archivedAt = now;
+      await store.updatePost(serverId, eventId, { archivedAt: now });
+    }
+  }
+
+  /**
+   * Renames an event's post to its event's new name (review V3), cut as titles are
+   * (`eventPostTitle`): `row.name` is the new name once renamed; a wait Discord names (two renames
+   * in ten minutes, a rate limit) is waited by a timer that draws again; a refused permission is
+   * said once per server, and the next draw tries again.
+   */
+  private async rename(row: EventPostRecord, name: string): Promise<void> {
+    const { gateway, store } = this.options;
+    let answer: Awaited<ReturnType<PartyGateway['renamePost']>>;
+    try {
+      answer = await gateway.renamePost(row.postId, eventPostTitle(name));
+    } catch (err) {
+      const wait = rateLimitWaitMs(err);
+      if (wait !== undefined) {
+        this.drawLater(wait);
+        return;
+      }
+      if (!isMissingPermission(err)) throw err;
+      this.refused(row.serverId, 'rename', err);
+      return;
+    }
+    if (answer === 'gone') return this.postGone(row);
+    if (answer !== 'renamed') {
+      this.drawLater(answer.laterMs);
+      return;
+    }
+    row.name = name;
+    await store.updatePost(row.serverId, row.eventId, { name });
+  }
+
+  /** A draw after `waitMs` (a rename Discord made wait), beside the other timers. */
+  private drawLater(waitMs: number): void {
+    if (this.stopped) return;
+    const cancel = this.setTimer(
+      () => {
+        this.waits.delete(cancel);
+        this.request();
+      },
+      Math.min(Math.max(waitMs, 1_000), MAX_TIMER_MS),
+    );
+    this.waits.add(cancel);
+  }
+
+  /**
+   * Edits an event's post where `message` differs from what was last sent to it (`postsSent`;
+   * after a restart, once); true where it stands, false where it is gone.
+   */
+  private async editEventPost(row: EventPostRecord, message: OutgoingMessage): Promise<boolean> {
+    const text = JSON.stringify(message);
+    if (this.postsSent.get(row.postId) === text) return true;
+    if (!(await this.options.gateway.editPost(row.postId, message))) return false;
+    this.postsSent.set(row.postId, text);
+    return true;
+  }
+
+  /** Archives a post unlocked; a refused permission is said once per server. False when gone. */
+  private async archive(serverId: string, postId: string): Promise<boolean> {
+    try {
+      return await this.options.gateway.archiveUnlocked(postId);
+    } catch (err) {
+      if (!isMissingPermission(err)) throw err;
+      this.refused(serverId, 'archive', err);
+      return true;
+    }
+  }
+
+  /** A post a moderator deleted: marked gone, never made again, its link left out (R7). */
+  private async postGone(row: EventPostRecord): Promise<void> {
+    row.gone = true;
+    await this.options.store.updatePost(row.serverId, row.eventId, { gone: true });
+    this.options.log.info(
+      { guild: row.serverId, event: row.eventId, post: row.postId },
+      'an event post is gone; it is not made again',
+    );
+  }
+
+  /**
+   * The listing drawn: edited in place where it stands (an unchanged one not at all), pinned again
+   * after each edit (an archived post opened again comes back unpinned); where its record is lost
+   * or it is gone, one the bot made in the forum (open or archived, R2) is taken over, else a new
+   * one is made, pinned and locked. A moderator's unlock stands.
+   */
+  private async drawListing(
+    forum: EventForumRecord,
+    events: readonly ListedEvent[],
+    posts: ReadonlyMap<string, string>,
+  ): Promise<ListingOutcome> {
+    const { gateway, store, settings, log } = this.options;
+    const { serverId, forumId } = forum;
+    const sections = listingSections(
+      events,
+      this.now(),
+      settings.timezone,
+      settings.eventsForum.horizonDays,
+    );
+    const message = listingMessage(sections, (id) => posts.get(id), settings.timezone);
+    const text = JSON.stringify(message);
+    const postId = forum.listingPostId;
+    if (postId !== null) {
+      const last = this.listingSent.get(serverId);
+      if (last?.postId === postId && last.text === text) return 'ready';
+      this.listingSent.delete(serverId);
+      if (await this.editListing(serverId, postId, message, text)) return 'ready';
+      log.warn({ guild: serverId, post: postId }, 'the events listing is gone');
+    }
+    const taken = await this.takeOverListing(forumId);
+    if (taken !== undefined) {
+      if (!(await store.setListing(serverId, forumId, taken))) return 'failed';
+      log.info({ guild: serverId, post: taken }, 'took over the events listing');
+      return (await this.editListing(serverId, taken, message, text)) ? 'ready' : 'failed';
+    }
+    const made = await gateway.createPost(forumId, { title: EVENTS_TITLE, message, tagIds: [] });
+    if (made === undefined) return 'failed';
+    await this.pin(serverId, made);
+    try {
+      await gateway.lockPost(made);
+    } catch (err) {
+      if (!isMissingPermission(err)) throw err;
+      this.refused(serverId, 'lock', err);
+    }
+    if (!(await store.setListing(serverId, forumId, made))) {
+      log.warn({ guild: serverId, post: made }, 'the events forum changed meanwhile');
+      return 'failed';
+    }
+    this.listingSent.set(serverId, { postId: made, text });
+    log.info({ guild: serverId, post: made }, 'made the events listing');
+    return 'made';
+  }
+
+  /** Edits the listing and pins it again where it is not; false when it is gone. */
+  private async editListing(
+    serverId: string,
+    postId: string,
+    message: OutgoingMessage,
+    text: string,
+  ): Promise<boolean> {
+    if (!(await this.options.gateway.editPost(postId, message))) return false;
+    const info = await this.options.gateway.postInfo(postId);
+    if (info && !info.pinned) await this.pin(serverId, postId);
+    this.listingSent.set(serverId, { postId, text });
+    return true;
+  }
+
+  /** Pins a post; a refused permission is said once per server (a moderator can pin it). */
+  private async pin(serverId: string, postId: string): Promise<void> {
+    try {
+      await this.options.gateway.pinPost(postId);
+    } catch (err) {
+      // Whatever it is (Manage Posts refused, another post holding the forum's one pin, 30047):
+      // said once per server, and the lock, the record and the draw carry on (review V4).
+      const key = `${serverId}:pin`;
+      if (this.refusedTold.has(key)) return;
+      this.refusedTold.add(key);
+      this.options.log.warn(
+        { err, guild: serverId, post: postId },
+        'could not pin the events listing',
+      );
+    }
+  }
+
+  /** Says once per server and what that Discord refused the bot a permission. */
+  private refused(serverId: string, what: 'lock' | 'archive' | 'rename', err: unknown): void {
+    const key = `${serverId}:${what}`;
+    if (this.refusedTold.has(key)) return;
+    this.refusedTold.add(key);
+    this.options.log.warn(
+      { err, guild: serverId, what },
+      'the bot may not do this in the events forum (Manage Posts)',
+    );
+  }
+
+  /**
+   * A listing the bot made in the forum, where the record lost it: the pinned one among the open
+   * posts, else the oldest open one, else the latest archived one (R2: a second listing beside an
+   * archived first would not get the forum's one pin). Undefined for none.
+   */
+  private async takeOverListing(forumId: string): Promise<string | undefined> {
+    const { gateway } = this.options;
+    let oldest: string | undefined;
+    for (const postId of (await gateway.openPosts(forumId)) ?? []) {
+      const info = await gateway.postInfo(postId);
+      if (info?.title !== EVENTS_TITLE) continue;
+      if (info.pinned) return postId;
+      oldest ??= postId;
+    }
+    if (oldest !== undefined) return oldest;
+    for (const postId of (await gateway.archivedPosts(forumId)) ?? []) {
+      if ((await gateway.postInfo(postId))?.title === EVENTS_TITLE) return postId;
+    }
+    return undefined;
+  }
+
+  /**
+   * The one timer of the next change among the listed events (a start, an end, a post's opening),
+   * set anew at each draw, a second after it, so that Now never goes stale (R10).
+   */
+  private setNextTimer(): void {
+    this.cancelNext?.();
+    this.cancelNext = undefined;
+    if (this.stopped) return;
+    const { settings } = this.options;
+    const now = this.now();
+    const times = this.options.events
+      .listedEvents()
+      .flatMap((event) => [
+        event.start,
+        event.end,
+        ...(isPosted(event)
+          ? [postOpensAt(event, settings.eventsForum.postDaysAhead, settings.timezone)]
+          : []),
+      ])
+      .filter((time) => time > now);
+    if (times.length === 0) return;
+    const next = Math.min(...times);
+    this.cancelNext = this.setTimer(
+      () => {
+        this.cancelNext = undefined;
+        this.request();
+      },
+      Math.min(next - now + 1_000, MAX_TIMER_MS),
+    );
   }
 }
diff --git a/src/services/local-midnight.test.ts b/src/services/local-midnight.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..af31d147f351c9f255ae52b88060abfb4829ace5
--- /dev/null
+++ b/src/services/local-midnight.test.ts
@@ -0,0 +1,59 @@
+import { describe, expect, it } from 'vitest';
+import { everyLocalMidnight } from './local-midnight.js';
+
+const ZONE = 'America/New_York';
+const at = (iso: string): number =>
+  Temporal.PlainDateTime.from(iso).toZonedDateTime(ZONE).epochMilliseconds;
+
+/** Timers the test runs by hand. */
+function timers() {
+  const set: { run: () => void; ms: number; cancelled: boolean }[] = [];
+  return {
+    set,
+    setTimer: (run: () => void, ms: number) => {
+      const timer = { run, ms, cancelled: false };
+      set.push(timer);
+      return () => {
+        timer.cancelled = true;
+      };
+    },
+  };
+}
+
+describe('everyLocalMidnight (plan 8V-1: the summaries’ and the events forum’s midnight)', () => {
+  it('runs a second after each local midnight, the days of a change of the clocks included', () => {
+    const clock = { now: at('2026-10-31T22:00') };
+    const { set, setTimer } = timers();
+    let runs = 0;
+    everyLocalMidnight({
+      zone: ZONE,
+      now: () => clock.now,
+      setTimer,
+      run: () => runs++,
+    });
+    expect(set.map((one) => one.ms)).toEqual([at('2026-11-01T00:00') - clock.now + 1_000]);
+    clock.now = at('2026-11-01T00:00:01');
+    set[0]?.run();
+    expect(runs).toBe(1);
+    // November 1 has 25 hours in New York.
+    expect(set[1]?.ms).toBe(at('2026-11-02T00:00') - clock.now + 1_000);
+    expect(set[1]?.ms).toBe(25 * 60 * 60_000);
+  });
+
+  it('stops for good once cancelled', () => {
+    const clock = { now: at('2026-10-31T22:00') };
+    const { set, setTimer } = timers();
+    let runs = 0;
+    const watch = everyLocalMidnight({
+      zone: ZONE,
+      now: () => clock.now,
+      setTimer,
+      run: () => runs++,
+    });
+    watch.cancel();
+    expect(set[0]?.cancelled).toBe(true);
+    set[0]?.run();
+    expect(runs).toBe(0);
+    expect(set).toHaveLength(1);
+  });
+});
diff --git a/src/services/local-midnight.ts b/src/services/local-midnight.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cabfdb2c2b99b6d026f1fd29faf91319e3d529ec
--- /dev/null
+++ b/src/services/local-midnight.ts
@@ -0,0 +1,44 @@
+import { nextLocalMidnight } from '../domain/time/local-day.js';
+
+/** What `everyLocalMidnight` needs. */
+export interface LocalMidnightOptions {
+  /** IANA zone whose midnights count (`settings.timezone`). */
+  zone: string;
+  now: () => number;
+  /** Sets a timer; gives what cancels it (the services' own, injected in tests). */
+  setTimer: (run: () => void, ms: number) => () => void;
+  /** Called a second after each local midnight. Must not throw. */
+  run: () => void;
+}
+
+/**
+ * Calls `run` a second after every local midnight from now on (Temporal's midnight in `zone`, so a
+ * day of a change of the clocks is 23 or 25 hours long; a second after, as the other timers: the
+ * day after it is today, review P10 of 8R-9). The one timer of the region summaries'
+ * (`PartyService.watchMidnight`) and the events forum's listing (plan 8V-1). `cancel` stops it for
+ * good.
+ */
+export function everyLocalMidnight(options: LocalMidnightOptions): { cancel(): void } {
+  let cancelTimer: (() => void) | undefined;
+  let cancelled = false;
+  const next = (): void => {
+    const now = options.now();
+    cancelTimer = options.setTimer(
+      () => {
+        cancelTimer = undefined;
+        if (cancelled) return;
+        options.run();
+        if (!cancelled) next();
+      },
+      nextLocalMidnight(now, options.zone) - now + 1_000,
+    );
+  };
+  next();
+  return {
+    cancel() {
+      cancelled = true;
+      cancelTimer?.();
+      cancelTimer = undefined;
+    },
+  };
+}
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index f7b8fac23ded955a6f82273ebea50d870b92e40c..b7153ed07e907288038210dcbe0fa499ad6d2afa 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -661,6 +661,34 @@ describe('PartyScheduler: running', () => {
     expect(pruned).toBe(1);
   });
 
+  // Plan 8V-1: the events forum is drawn hourly (a post still open three days after its end).
+  it('has the events forum drawn with the upkeep', async () => {
+    const made = await reportedRaid();
+    let drawn = 0;
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      eventForum: {
+        upkeep: () => {
+          drawn += 1;
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
+    expect(drawn).toBe(1);
+  });
+
   it('has the emoji of the application read anew with the upkeep', async () => {
     const made = await reportedRaid();
     let read = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index 17dff032218901cefc296b9898340cce63de5c17..84671440598f33e6afda3882b999a358a2f0d853 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -69,6 +69,11 @@ export interface PartySchedulerOptions {
   emoji?: { refresh(): Promise<unknown> };
   /** The sessions of the web pages, of which those that expired go with the upkeep. */
   webSessions?: { sweep(): Promise<unknown> };
+  /**
+   * The events forum (plan 8V-1), drawn with the upkeep: a post still open three days after its
+   * event's end is archived then, and a listing a missed timer left stale is drawn anew.
+   */
+  eventForum?: { upkeep(): Promise<unknown> };
   /**
    * The new trains of splits left pending in the process (plan 8T: a split whose write failed,
    * and whose new train could not be ended then), taken back with the upkeep once they are a
@@ -301,7 +306,7 @@ export class PartyScheduler {
   private upkeep(): void {
     const { posts, access, routes, spawns, pictures, screenshots, emoji, webSessions, log } =
       this.options;
-    const { history, splits, stops, grunts } = this.options;
+    const { history, splits, stops, grunts, eventForum } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running. Once the clock has
     // stopped none starts: the shutdown waits for the upkeep (review r1 C3).
@@ -328,6 +333,7 @@ export class PartyScheduler {
       if (screenshots) await step(() => screenshots.sweep());
       if (emoji) await step(() => emoji.refresh());
       if (webSessions) await step(() => webSessions.sweep());
+      if (eventForum) await step(() => eventForum.upkeep());
       if (splits) await step(() => splits.settlePendingSplits(PENDING_SPLIT_MS));
       // Party by party, over what may be many old rows: it ends with the clock's stop.
       if (history) await step(() => history.sweep({ isStopped: () => this.stopped }));
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index d9b0d3592a20e94fbe26643f5ce717c745309b74..03a8ceafc88c7d288f87e7f18231fac2760522bd 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -114,7 +114,7 @@ import {
 import { summaryRefusedWords } from '../render/activity.js';
 import { customIconText } from '../render/party-controls.js';
 import { postLink } from '../render/notify-dm.js';
-import { nextLocalMidnight } from '../domain/time/local-day.js';
+import { everyLocalMidnight } from './local-midnight.js';
 import {
   maxTitle,
   renderMaxPost,
@@ -2524,17 +2524,18 @@ export class PartyService {
   watchMidnight(): void {
     if (this.closed) return;
     this.midnightTimer?.();
-    const now = this.now();
-    this.midnightTimer = this.setTimer(
-      () => {
-        this.midnightTimer = undefined;
-        if (this.closed) return;
-        this.allSummaries();
-        this.watchMidnight();
+    // The timer shared with the events forum's listing (plan 8V-1), a second after midnight.
+    const watch = everyLocalMidnight({
+      zone: this.options.settings.timezone,
+      now: this.now,
+      setTimer: this.setTimer,
+      run: () => {
+        if (!this.closed) this.allSummaries();
       },
-      // A second after midnight, as the other timers: the day after it is today (review P10).
-      nextLocalMidnight(now, this.options.settings.timezone) - now + 1_000,
-    );
+    });
+    this.midnightTimer = () => {
+      watch.cancel();
+    };
   }
 
   /** Asks for the summary of every region that has a forum. */
````

### Task 5: 8V-1 task 5: the events forum's docs and staging checklist

Prototype commit: `eae89447964599c59ff69145f9128f1a6ff68ade`

utilities.md gains "The events forum and the Campfire links": the one rule
of event-listing.ts, the kept listing, the forum and its setup, the listing,
the posts and when it all draws. parties-and-posts.md names the gateway's
new methods, testing.md the fakes and twins, operations.md the catch-up's
new job, web.md the list's foot line; the guides tell admins how to turn
the events forum on. The staging checklist covers the Campfire links,
setup-forums, the listing with today's feed and a made-up feed through
serve-events.mjs for a post opening, a change, a move, a drop and an end.

**Files:**

```
 docs/architecture/operations.md                        |  2 +-
 docs/architecture/parties-and-posts.md                 |  1 +
 docs/architecture/testing.md                           |  1 +
 docs/architecture/utilities.md                         | 14 +++++++++++++-
 docs/architecture/web.md                               |  2 +-
 docs/guides/migrating-a-legacy-instance.md             |  1 +
 docs/guides/new-instance.md                            |  1 +
 docs/superpowers/plans/2026-10-29-phase-8v1-staging.md | 51 +++++++++++++++++++++++++++++++++++++++++++++++++++
 8 files changed, 70 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff eae89447964599c59ff69145f9128f1a6ff68ade -- src test data docs/architecture docs/guides docs/superpowers/plans/2026-10-29-phase-8v1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8V-1 task 5: the events forum's docs and staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index 19a0aa9f4aae237dd10c153a45a8284d6e59cf92..870ba9bbdcdbcb0025608d770cfdae2ec37f6f48 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -39,7 +39,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - Plan 8X-H (Matt, 2026-10-23: catch up, not restart; the staging of 8X-G survived two outages, a DNS outage of two minutes and an hour without network, but what failed meanwhile waited for its next interval). Restarting on every reconnect would restart several times a day (Discord asks for routine reconnects), at the cost of a login, posts drawn anew and open dialogs failing; the watchdog's restart after a long outage stays as it is, and so do the heartbeat and the health rules (they say whether the bot is connected now). In production the watchdog restarts after about seven minutes without the gateway, so the catch-up covers outages of about 30 seconds to 7 minutes; on a laptop without the watchdog, any length.
 - **When** (`GatewayWatch`, `src/discord/gateway-events.ts`, attached in `configure` before the login): armed by the first ready (the login's own and earlier reconnections never count); the first `ShardReconnecting` while up marks the gateway away (discord.js says it with every try: the later ones change nothing, and none is logged); `ShardResume` or `ShardReady` brings it back. Back for real when it was away 30 seconds or more (`REAL_AWAY_MS`, counted from the shard's last heartbeat acknowledged where that is more than a minute older than the first reconnection, `MISSED_ACK_MS`, the acknowledgement read at that first reconnection, as the new connection's first one can come before its RESUMED and hide it, review F3: a zombie connection, which discord.js gives up some 82 seconds after the last acknowledgement, or a laptop asleep while connected, which reconnects only at wake; Discord asks for a heartbeat every 41.25 s, so at a routine reconnection the last acknowledgement is up to that old and does not count, review r0 B1), when a shard error came meanwhile (counted only while away: a shard error while connected is said but starts nothing, only a reconnection does, review r0 B8), or when it came back with a new session (`ShardReady`: the events of the time away are lost). Then `discord gateway back` at info (`awayMs`, `shardErrors`, `unsaid`, `newSession`); a routine resume is `discord gateway resumed` at debug. What discord.js 14.27 gives (the brief's review read `@discordjs/ws` 1.2.3): ECONNRESET, ECONNREFUSED, ETIMEDOUT and EAI_AGAIN give no shard error and come back with a fresh `ShardReady`, so an ECONNRESET on a live connection (a second away) is a real return with `newSession` true, rightly: the events of the old session are lost (review F7); ENOTFOUND (Windows' DNS outage) gives a shard error every half second and comes back with `ShardResume` (or `ShardReady` after an invalid session). In Docker a DNS outage is EAI_AGAIN: no shard errors at all. One state for every shard: Pine runs one (`createClient` sets no `shards`, discord.js's `shardCount` of 1; Discord asks for more only beyond 2,500 servers), review r0 B9.
 - **Shard errors** are said once per kind (`code`, else the message): the first at warn with the error (`discord shard error`), then at most once a minute `discord shard errors repeated` with how many since and the message (`REPEAT_EVERY_MS`, checked as each arrives, no timer); those not said yet are counted in the line of the gateway back, and a kind is said anew when the next outage begins (also one seen while connected, review r1 C5). Before plan 8X-H each was an ERROR line (206 in two minutes, 819 in the hour). An ERROR line stays for what needs a person.
-- **What** (`CatchUp`, `src/services/catch-up.ts`, made in `app.ts` once the stops' posts are there): the jobs one after another, each once, in this order: every active post shown anew, paced (`redrawPosts`: it only queues them, one party every 250 ms, `EMOJI_RENDER_GAP_MS`, so the posts are drawn over N × 250 ms beside the upkeep and the feeds' reads, review r0 B10), and every region's summary drawn anew with them (plan 8R-9, B7: a midnight passed while the network was away moves Coming up to Today; one that reads the same is not edited), the upkeep (`PartyScheduler.catchUp`: first the closings the network failed, `PartyService.redoClosings`, `parties-and-posts.md`, hourly as well, since a request can fail without the gateway going away, review r0 B4; then the sweep of ended parties' posts, the summaries, the access, the routes, the spawn and grunt sweeps, the application's emoji and the rest, after one under way; its steps never fail as a whole, so it runs on every catch-up; before the clock runs or after it stopped it runs none and is not owed, review F6), the posts of the stops in the regions' boards (`stop posts`, `StopPostService.catchUp`: every kept post drawn, unchanged ones not edited, and yesterday's whose delete failed deleted again; a turn-over at midnight that failed waited for the next change of period before; plan 8R-9 also tries those deletes at the channel's next draw), the lines of the region channels (`stop lines`, `StopLineService.sweep`: the lines of ended days whose delete failed, deleted again; also tried before the next line is sent, review W2), then the feeds, each only when its last read failed (`catchUp` of `BossFeedService` for the raid and max bosses, `RaidEventService`, `ResearchTaskService`, `RocketLineupService`, `GameDataService`: the read now through its in-flight guard, after one the timer started, and the next scheduled from it; they retry by themselves within 5 to 30 minutes). One catch-up at a time; a return of the gateway while one runs has one more after it, not one each; nothing loops while the network is down. `caught up` at info names what ran, failed again (`could not catch up` at warn for one that threw) and was not owed. At shutdown (review r0 B6) the party clock's step (6 s) closes it, so that it starts no job more, without waiting for the job under way, and waits for the clock and its upkeep, which starts no step more once the clock has stopped (review r1 C3) and whose closings end between parties as the history's sweep does; a feed's read under way (up to 30 s) ends at that feed's own `stop` step, a drawing of the posts of the stops, and the lines of the region channels on their way (they wait for the posts' links), at `posts of the stops`; the step `catch-up` (2 s) after that one waits for the job left (`CatchUp.whenIdle`). The steps' limits stay within the stop's 2m30s (`stop_grace_period`), with 5 s to spare: the party clock's step went from 10 s to 6 s and the direct messages' from 15 s to 12 s (review r1 C4). Not caught up: the events' pages with spawns (read within the hour while an event is on), direct messages that failed meanwhile (`DmSender` drops a failed send, as always: a DM is worth its moment), the lines said in posts and the pings of a movement or a start that failed, the clock's archive warning and the completion question that failed (the clock asks each once; the closing comes all the same, review F8), interactions (Discord's, lost).
+- **What** (`CatchUp`, `src/services/catch-up.ts`, made in `app.ts` once the stops' posts are there): the jobs one after another, each once, in this order: every active post shown anew, paced (`redrawPosts`: it only queues them, one party every 250 ms, `EMOJI_RENDER_GAP_MS`, so the posts are drawn over N × 250 ms beside the upkeep and the feeds' reads, review r0 B10), and every region's summary drawn anew with them (plan 8R-9, B7: a midnight passed while the network was away moves Coming up to Today; one that reads the same is not edited), the upkeep (`PartyScheduler.catchUp`: first the closings the network failed, `PartyService.redoClosings`, `parties-and-posts.md`, hourly as well, since a request can fail without the gateway going away, review r0 B4; then the sweep of ended parties' posts, the summaries, the access, the routes, the spawn and grunt sweeps, the application's emoji and the rest, after one under way; its steps never fail as a whole, so it runs on every catch-up; before the clock runs or after it stopped it runs none and is not owed, review F6), the posts of the stops in the regions' boards (`stop posts`, `StopPostService.catchUp`: every kept post drawn, unchanged ones not edited, and yesterday's whose delete failed deleted again; a turn-over at midnight that failed waited for the next change of period before; plan 8R-9 also tries those deletes at the channel's next draw), the lines of the region channels (`stop lines`, `StopLineService.sweep`: the lines of ended days whose delete failed, deleted again; also tried before the next line is sent, review W2), then the feeds (with the events forum drawn anew right after the events feed, `events forum`, plan 8V-1, where it is made), each only when its last read failed (`catchUp` of `BossFeedService` for the raid and max bosses, `RaidEventService`, `ResearchTaskService`, `RocketLineupService`, `GameDataService`: the read now through its in-flight guard, after one the timer started, and the next scheduled from it; they retry by themselves within 5 to 30 minutes). One catch-up at a time; a return of the gateway while one runs has one more after it, not one each; nothing loops while the network is down. `caught up` at info names what ran, failed again (`could not catch up` at warn for one that threw) and was not owed. At shutdown (review r0 B6) the party clock's step (6 s) closes it, so that it starts no job more, without waiting for the job under way, and waits for the clock and its upkeep, which starts no step more once the clock has stopped (review r1 C3) and whose closings end between parties as the history's sweep does; a feed's read under way (up to 30 s) ends at that feed's own `stop` step, a drawing of the posts of the stops, and the lines of the region channels on their way (they wait for the posts' links), at `posts of the stops`; the step `catch-up` (2 s) after that one waits for the job left (`CatchUp.whenIdle`). The steps' limits stay within the stop's 2m30s (`stop_grace_period`), with 5 s to spare: the party clock's step went from 10 s to 6 s and the direct messages' from 15 s to 12 s (review r1 C4). Not caught up: the events' pages with spawns (read within the hour while an event is on), direct messages that failed meanwhile (`DmSender` drops a failed send, as always: a DM is worth its moment), the lines said in posts and the pings of a movement or a start that failed, the clock's archive warning and the completion question that failed (the clock asks each once; the closing comes all the same, review F8), interactions (Discord's, lost).
 - **Logging of an outage:** a failure for the network (`isNetworkError`, `src/services/network-error.ts`: the codes of a lost network and the time limits, also the abort with which @discordjs/rest ends a request after 15 s, `AbortError` or undici's `UND_ERR_ABORTED`, on the error or any cause, and Discord's 5xx, an `HTTPError` of 500 or more, review r0 A1; never a mysql2 error, though its code be a socket's: the database away needs a person, review r0 A2) is a warning in the boss syncs (a feed out of reach or timed out; one it cannot read stays an error), the game data refresh (a download without an answer), the updates of a post or a summary, and the turn-over of the posts of the stops at a change of period (review F5); the sweep says its failures once per sweep. Debug lines say that a boss feed read changed nothing (`raid bosses read, unchanged`, with how many), that the sweep ran (`swept the posts of ended parties`, archived, the forums looked through and those that failed, review r0 A4; the warning of a failed sweep names the first forum that failed besides the count, A3) and that the application's emoji were read (`read the emoji of the application`, how many), so that a catch-up can be followed at debug.
 
 ## Alerts to the owner
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 56bd8169d51be1a04506b871ff1148f71e69e2b0..d95dad747b2e7f814694ffdb44b50f40fc9792d1 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -67,6 +67,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 ## Discord: the gateway and the party service
 
 - Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- The events forum (plan 8V-1, `utilities.md`) asks five more of `PartyGateway`: `setAutoArchive(postId, minutes)` (an open post's auto-archive; an archived one left shut), `archiveUnlocked(postId)` (archived, its lock left as it is; `archivePost` locks, and is not used there), `lockPost(postId)` (opened first where archived), `archivedPosts(forumId)` (the bot's archived posts, the latest archived first, at most `ARCHIVED_POSTS_READ`, five pages of 100) and `letBotManagePosts(forumId)` (Manage Posts in the bot's own overwrite of the forum); `postInfo` says `archived` too (review V6).
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else; a forum it cannot look through for a refusal of Discord's is warned of by name, the other failures (the network away) once per sweep with how many forums (plan 8X-H), and each sweep says at debug what it archived. A closing of which a part failed for the network or a rate limit (the link line, a copy, its last showing, a leftover's deletion, the last words, the tags, the archiving, a moderator's deletion; `worthRedoing`, review r0 B2, B5: a refusal of Discord's such as Missing Access would fail again and is not kept, and a post that is gone drops it whatever else failed) is kept in memory (`undoneClosings`, a `BoundedMap` of `UNDONE_CLOSINGS_MAX`, the party as it ended, its last words and whether they were said, `delete` where a moderator chose to delete the post and the deletion failed for the network, review r0 B3: meanwhile it is closed and archived as usual, `endAs` says `deleting` (review r1 C1: the moderator is told that it is archived for now and will be deleted within the hour, and the report keeps `delete`), and the redo deletes it; Discord refusing the deletion leaves it archived and `archived`, as before; a post that is gone is `archived`) and done again by `redoClosings()`, the first step of the hourly upkeep and so of the catch-up on reconnect (plan 8X-H, Matt 2026-10-23: such a post kept its live controls, and the sweep only archives; review r0 B4), for a day after the party ended (`UNDONE_CLOSING_KEPT_MS`: no post opened and archived again days later); a redo (`closePost`'s `redo`) sets the tags of the last showing for every kind of party, also a raid the clock ended, whose showing with Ended may have failed in the same outage (review F2), and, where the post is to be archived, shows it first, before the copy in it and the leftovers are deleted: the post may be archived already, and Discord refuses a deletion in an archived post (50083) until something opens it (review F4); ending between parties with the clock's stop and with the first closing that fails again (one probe a run while the network is away: a request that is black-holed takes about a minute, review r1 C2); it logs `closed ended parties again` with how many were redone and failed again. A restart forgets them, and the sweep archives what is left open as before. Accepted risk (review r0 B12): last words that Discord received but whose answer the network lost are said again by the redo, so they may stand twice in the post. `redrawPosts()` shows every active post anew as `emojiChanged` does, paced (it only queues them, one party every `EMOJI_RENDER_GAP_MS`, so N posts take N × 250 ms, beside the upkeep and the feeds, review r0 B10): an edit that failed leaves its post stale until something shows it anew (`showPost` forgot what it sent before trying), and a current post makes no edit. The updates of a post or a summary that failed for the network are warnings (`isNetworkError`, `src/services/network-error.ts`), errors otherwise (operations.md, "The catch-up on reconnect").
 - `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Today and coming up` (`SUMMARY_TITLE`; plan 8R-9, the region's board: "Going on now" before it, and `Active raids` before plan 8X-G, every kind of party since; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are today and of those coming up (the board's paragraph below), today's parties in these sections (every party that starts after the next local midnight is under **Coming up** instead, `isToday`, below): the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups (a timed party's start or end more than a day ahead as Discord's date and time, `<t:…:f>`, which each reader's client shows in their own time zone with daylight saving; within a day the relative stamp, which Discord rounds, "in 4 days" for 3 days and 15 hours: plan 8X-H, Matt 2026-10-23; the switch comes with the next draw, at the latest the hourly upkeep), one text display per tier and section, then **Coming up** (below), and last, after a line, the region's post of the stops today, in its board under the summary, with its counts (`[Today’s Stops](<link>) (below): 6 tasks · 2 hideouts` in the board, without "(below)" in `/status` in the region's channel, and under an event's window the day's research waiting named apart, last as in the post, `· 13 tasks back at <t:…:t>`, so a window with only the day's research still links the post, plan 8R-6; `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Today and coming up` post the bot made in the forum, or one it made as `Going on now` or `Active raids` before (`LEGACY_SUMMARY_TITLES`, B12; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index a91c2eec4c3126ddc33a3aaa904c343eef13eb2e..6ee8deade9cae1309ed8307ccf578d1c92bd392c 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -34,6 +34,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); max battles (plan 8X-3) with `testMax()` (a Dynamax Machamp at `TEST_SPOT` until 21:00), `TEST_PIN`, `asMax()`, and through the service with `reportedMax()` (`test/support/party-service.ts`; `made.maxes` is the `MaxChangeService`, `ctx.maxBattles`); `raidEventsFixture(zone, { max, big })` gives max and big events, none by default, and `NO_MAX_BOSSES` (`test/support/test-context.ts`) a provider of no max boss; its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
 - Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post, and refuses `deleteMessage` in an archived post as Discord does (`archivedThread()`, 50083; plan 8X-H) unless the delete asks to open it (`{ reopen: true }`, plan 8R-9, review P4: only the posts of the stops ask), and a message in an archived, locked post the same way (review R3; a test that has a late message open an ended party's post passes `{ reopen: true }`), and `bulkDelete` in an archived post the same way (`archivedThread('POST')`, review W3 of plan 8R-9F) unless it passes `{ reopen: true }`, which opens it and leaves it open; `deleteReported` opens an archived post for the deletion and counts it in `reopened`, the post archived again as the gateway leaves it, unless `{ leaveOpen: true }` (the board's keeper) leaves it open; `openBoard` opens the region's board to members (unlocked, `FakePost.slowmode` set to `BOARD_SLOWMODE_SECONDS`, opening it first; refused as a pin is where `refusePosts` names Manage Posts) and `setBoardSlowmode` sets that slowmode alone (plan 8R-9H, the lock kept; refused the same way), `postInfo` says `locked` and `slowmode` too, a message sent with `{ silent: true }` is `FakeMessage.silent`, and `postAccess(postId)` (a promise, review P3) says what the bot may write in a post (`refused` where `refusePosts` names Send Messages in Posts for its forum, or Manage Posts while the post is locked (plan 8R-9F, B5: an open board takes no Manage Posts; `noManaging` no longer refuses it), `plain` where the post or its forum is in `noEmbeds`). What others write in the board (plan 8R-9F): `write(channelId, authorId, { by, system, createdAt })` writes a message as a member (or `by: 'bot'` another application, `'me'` this bot, `system` one of Discord's own) and opens an archived post as Discord does; `written` holds them per channel, `boardMessages` gives the newest first with the bot's own and without those `deleted`, `bulkDelete` records each request in `bulkDeleted`, `managers` are the members with Manage Messages that `managesMessages` finds (each ask in `memberAsks`, with whether afresh; a member in `leftServer` has none), and `mayDeleteMessages(forumId)` is false only for a forum in `noManaging`, where `deleteReported` and `bulkDelete` answer `not-allowed`. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, and one in a category of 50 channels or a server of 500 as Discord refuses it (Invalid Form Body naming `parent_id`, `CHANNEL_PARENT_MAX_CHANNELS`; `serverFull()`, 30013), as `createTextChannel` answers `category-full` and `server-full` (plan 8S-4); `createCategory` with `like` (a category that continues another) copies that one's `categoryOverwrites` to the new category and records where it was placed (`placedAfter`, by id), answers `base-gone` when that one is not there (or in `gone`), and `refuseCopies` has it refused as `no-permission`, as Discord refuses a bot that may not set those overwrites, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); a post and a message keep the names of their files (`attachments`: those sent, replaced by an edit whose message names its files, none too, kept by one that does not, and a thumbnail `attachment://` must name one of them), and `refuseFiles` refuses any send or edit that uploads a file with Missing Permissions (50013), as Discord answers a bot without Attach Files, counting each refusal in `filesRefused` (plan 8D-F), `rejectThumbnails` and `rejectCustomEmoji` refuse a thumbnail or a button's custom emoji with Invalid Form Body naming the field as Discord does (`….accessory.media.url`; `….emoji.id[COMPONENT_INVALID_EMOJI]`, which `refusedPart` reads), and `deletedEmojiIds` refuses only the custom emoji of those ids, as for an emoji deleted from the application (plan 8D-H); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`. A party with a lobby size before max battles exist (plan 8X-1): the override `{ lobbySize: () => 4 }` of `partyServiceWith`, `reportedRaid` or `createdTrain` gives every party of the test that size, for the party service (posts, `applyAutoStatus`) and the attendance service (Join's `chooseGroup`) alike; without it the settings' `lobbySize`, none for any party of today.
 - Meetups in tests: `testMeetup()` (which takes `place`), `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`; a meetup with a place passes `place`, and a directory of kept Wayspots as the override `wayspots`, `wayspotsWith`). A meetup's post shows its place as it is now from `MeetupPostView.gym` and `.wayspot`; a test of the renderer passes them to see a place as it is now, and leaves them out for the snapshot. The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
+- The events forum (plan 8V-1): the fake gateway's posts have `autoArchiveMinutes` (a week when made; `setAutoArchive` leaves an archived post's alone), `archiveUnlocked` archives and leaves `locked`, `lockPost` opens an archived post and locks it, `archivedPosts(forumId)` gives the bot's archived posts latest first, and `letBotManagePosts` records the forum in `managedPosts` (`not-allowed` for a forum of `noReserving`). `MemoryEventForums` and `MemoryListedEvents` (`test/support/event-forum-store.ts`) are the repositories' twins, running `eventForumCases` and `listedEventCases` with them; `listedEvent(overrides)` is Pawniard Community Day as a listed event. `src/services/event-forum.test.ts` drives `EventForumService` over the fake gateway with a clock and timers the test runs (`eventForumWith`).
 
 ## Screenshots
 
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 8445408efa4b8fb3eb5b85fe5050e2ec859c2cb7..a74fbe05a38fac86071be15e43970a0ab6dce0ae 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -31,11 +31,23 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. The screenshot reader decides a max screen's boss by it too (`maxScreenshotReport`, Matt 2026-10-25). A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own). PokeMiners' list of icon files has only 13 `fGIGANTAMAX` icons (no `pm25`: Gigantamax Pikachu shows plain Pikachu, staging of 8X-F, F2); a file name in no list is never guessed, and the plain picture stays until PokeMiners lists the Gigantamax one (Matt, 2026-10-22, plan 8X-G). Dynamax has no look of its own in the game: its battles show the plain picture.
 - The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read; it logs `max events loaded` with how many max and big events, plan 8X-G, and a read's `raid events read` says them too). The raid events (`merged`) are still kept in memory only: a follow-up; so are the events with spawns of plan 8R-4 (`spawnEvents()`, `mergedSpawns`; `notifications-and-dms.md`, "Spawn reports"). Their hours are always the feed's own, and an item with a time of a zone of its own (`hasOwnZone`, plan 8R-7: an in-person event's) is left out and lends its hours to none; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
 - The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last not in the feed of 2026-10-20, the type GO Fest 2025's Max Finale had) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the editions for everyone only (local times, whatever the name says: `isForEveryone` below; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
-- **Everyone's events** (plan 8R-7, after the staging of 8R-6 read ScrapedDuck's Boston City Safari, local times and a research flag, as everyone's research event): one rule for the readers of the events feed, `src/domain/time/event-reach.ts` (pure). The feed has no field that says "in-person", so the rule goes by type and zone: `isForEveryone({ eventID, eventType, name, start, end })` is false where either time has a zone of its own (`hasOwnZone`: `Z`, `+09:00`; Pokémon Night Out, a city's Wild Area, GO Tour or GO Fest) and for an in-person type (`IN_PERSON_TYPES`: `city-safari`, and `safari-zone` should Leek Duck's older type come back; every edition is in a city, Matt, 2026-10-22); true otherwise. A type with city editions (`CITY_OR_GLOBAL_TYPES`: `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`) needs no Global edition (Matt, 2026-10-24, review W1 of 8R-7, in place of 8X-3's and Q2's Global rule: every city edition in the recorded feeds has zoned times, and GO Fest 2025's Max Finale, everyone's at local times, said no "global"): local times are enough. So that a city edition that ever comes at local times is seen, `RaidEventService` logs once per event id (a `BoundedMap`, information, `a Wild Area, GO Tour or GO Fest without global in its name is read`, with `eventType`, `event` and `name`) each such event a reader took whose id and name both lack the word (`editionsWithoutGlobal`, `isGlobalEdition(id, name)`: `global` as one of the id's words or in the name, any case). `isForEveryoneKind(eventType)` is the same without the times, for what is kept without them (only the in-person types: a row was kept only after the zone test). The research reader (`parseResearchEventFeed`, `stop-reports.md`), the big events' (`parseBigEventFeed`) and the spawn events' (`parseSpawnEventFeed`, `notifications-and-dms.md`) use it beside their own type lists; the max events' (`parseMaxEventFeed`) leaves out zoned items only (its two types have no city editions); the raid events' (Raid Hour, Raid Day) needs none.
+- **Everyone's events** (plan 8R-7, after the staging of 8R-6 read ScrapedDuck's Boston City Safari, local times and a research flag, as everyone's research event): one rule for the readers of the events feed, `src/domain/time/event-reach.ts` (pure). The feed has no field that says "in-person", so the rule goes by type and zone: `isForEveryone({ eventID, eventType, name, start, end })` is false where either time has a zone of its own (`hasOwnZone`: `Z`, `+09:00`; Pokémon Night Out, a city's Wild Area, GO Tour or GO Fest) and for an in-person type (`IN_PERSON_TYPES`: `city-safari`, and `safari-zone` should Leek Duck's older type come back; every edition is in a city, Matt, 2026-10-22); true otherwise. A type with city editions (`CITY_OR_GLOBAL_TYPES`: `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`) needs no Global edition (Matt, 2026-10-24, review W1 of 8R-7, in place of 8X-3's and Q2's Global rule: every city edition in the recorded feeds has zoned times, and GO Fest 2025's Max Finale, everyone's at local times, said no "global"): local times are enough. So that a city edition that ever comes at local times is seen, `RaidEventService` logs once per event id (a `BoundedMap`, information, `a Wild Area, GO Tour or GO Fest without global in its name is read`, with `eventType`, `event` and `name`) each such event a reader took whose id and name both lack the word (`editionsWithoutGlobal`, `isGlobalEdition(id, name)`: `global` as one of the id's words or in the name, any case). `isForEveryoneKind(eventType)` is the same without the times, for what is kept without them (only the in-person types: a row was kept only after the zone test). The research reader (`parseResearchEventFeed`, `stop-reports.md`), the big events' (`parseBigEventFeed`) and the spawn events' (`parseSpawnEventFeed`, `notifications-and-dms.md`) use it beside their own type lists; the max events' (`parseMaxEventFeed`) leaves out zoned items only (its two types have no city editions); the raid events' (Raid Hour, Raid Day) needs none. Since plan 8V-1 the max, big and listed events read an item's times through one reader, `everyonesTimes` (`elsewhere`, `none`, `unreadable` or `times`; the events forum, below).
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
 - Pokémon nicknames change only through `ctx.nicknames` (`PokemonSearchService`: changes and reloads one at a time; `nicknameProblem` in `src/domain/pogo/nickname-rules.ts` refuses words other commands read, names and nicknames of other Pokémon; removal from every legacy row of the Pokémon; the column stays `, `-joined lower case).
 
+## The events forum and the Campfire links (plan 8V-1)
+
+Designs `docs/superpowers/specs/2026-10-28-events-forum-design.md` and `2026-10-28-campfire-links-design.md` (Matt, 2026-10-28 and 29).
+
+- **Campfire is linked, never fetched.** `CAMPFIRE_DISCOVER_URL` (`src/domain/campfire.ts`, pure: the web page imports it too) is Campfire's map of official meetups by Community Ambassadors; it cannot point at a region, and no setting changes it. `/meetup`'s help ends with it; the web map's list ends with "Official meetups: Campfire" (`web.md`); the events forum marks the events whose kind gets the hint. `src/campfire-links.test.ts` refuses Campfire's GraphQL address and `niantic-social-api` in every source under `src/` and `packages/` (Scopely Explore's terms forbid bots and scraping, and its answers carry members' ids and names).
+- **One rule, one read** (`src/domain/time/event-listing.ts`, pure; R4). The listing is read from the very document `RaidEventService` reads (`readListedEvents(json, zone, { max, big })`, with the max and big events as merged with the kept ones, `currentMax` and `currentBig`: one path, review V10, ruling R5): an item of a max kind (`max-mondays`, `max-battles`) takes its times from the max event of its id, whether or not the item has times (assumed hours too, so `maxEventAt` and the listing agree), a Wild Area, GO Tour or GO Fest from its big event, every other item through `everyonesTimes(item, zone)` (`event-reach.ts`), the one reader of an item's times that `parseMaxEventFeed` and `parseBigEventFeed` use as well: `elsewhere` (not everyone's: `isForEveryone`), `none` (a time left out), `unreadable`, or `times`. An item without times is `untimed`: not seen (R3). `isListed`: everyone's kind, outside `UNLISTED_KINDS` (`go-pass`, `season`, `go-battle-league`, `twitch-drops`, `research`, and since the review's ruling R1 `timed-research`, `special-research`, `limited-research`, `research-breakthrough`, `update`, `location-specific`), a `raid-battles` item only when it lasts something and less than a day (review V9) (a one-off raid event; the boss rotations stay out, ruling B); a kind not known (`isKnownKind`) is listed, lines only, and logged once at warn (`an event type the events forum does not know`). `isPosted`: listed and of `POSTED_KINDS` (`community-day`, `raid-day`, `raid-weekend`, `elite-raids` (ruling R1), `max-battles`, `wild-area`, `pokemon-go-tour`, `pokemon-go-fest`, `event`; Leek Duck's type list has no Hatch Day type, checked 2026-10-29 on ScrapedDuck's wiki: a Hatch Day comes as an `event`). `hasCampfireHint`: listed and not in `NO_CAMPFIRE_KINDS` (empty). `eventTimeWords` says times as plain local text, through `zoned.ts`'s short words (`shortDayWords`, `shortDateWords`, `shortHourWords`, review V8) ("Sat, Nov 21, 2–5 PM"; several days "Nov 9 – Nov 13", an end at midnight the day before's), never Discord's stamps (ruling A). `listingSections` gives Now, This week (starting within seven days by the local calendar), Coming up (within `horizonDays`); `postOpensAt` the opening of a post, `postDaysAhead` days before the start.
+- **The kept listing** (`mergeListed`): the read's events in the place of the kept ones of their ids; a kept event the read lists without times kept as it is; one no longer listed kept to its end where it has begun, dropped where it has not, unless the read has a new id of the same name (`sameEventName`: a "(Rescheduled)" mark, spaces and case aside) and type that no kept event had: then it moved, and the new event carries the old ids in `formerIds` (R12). What ended is forgotten. `RaidEventService` is the `ListedEventProvider` (`listedEvents()`, `onListedChange`, told after every good read and after `loadListed`), keeps them in `ListedEvent` (migration 033, `ListedEventRepository`, replaced whole after each read as `MaxEvent`; twin `MemoryListedEvents`), loaded before the first read (`loadListed` in `app.ts`, after `loadMax`), and logs moves and drops at info. `listingKnown()` is true once the kept events were loaded or a read succeeded (review V1), and `droppedIds()` names the events a read dropped before their start, each until that start (in memory only).
+- **The forum** (`settings.channels.events`, a forum's name, blank unset; the moderators' channel may not be it, R13; `settings.eventsForum` `{ horizonDays: 35, postDaysAhead: 14 }`, the second at most the first): `EventForumService` (`src/services/event-forum.ts`), made in `app.ts` only where the settings name a forum and rehearsal mode is off (R8; `ctx.eventForum`). `/admin setup-forums` calls `setup(guildId)`: the forum of that name where the server has one (the name decides: a forum recorded under another name is replaced, and its listing forgotten, R7), else one made beside `bot-updates` (`createForum`, in its category with its permissions), Create Posts kept to the bot (`reservePosts`) and Manage Posts allowed to it (`letBotManagePosts`), recorded in `EventForum` (`EventForumRepository`; another forum retires the server's live post rows in the same transaction, those marked `gone` kept, review V2, so the new forum gets its own posts), then drawn; the name is compared and made as Discord stores it (`channelNameFor` and `channelKey` of `region-import.ts`, lower case, spaces to hyphens, by setup and `cutover-check` alike; review V7, ruling R4); the answer's last line says what it did and could not. `cutover-check` warns of a named forum the server lacks and of `EVENTS_FORUM_NEEDS` the bot lacks there.
+- **The listing "Events"** (`EVENTS_TITLE`; `listingMessage`, `src/render/events-forum.ts`): one container, `### Events` and the sections' counts ("1 now · 2 coming up", or "No events listed right now."), each section headed with its count (`**Now · 1**`) and its lines by start, within `TEXT_BUDGET` (`fitLines` of the summary: "…and N more", the count kept), and the hint's foot once where a line carries it. A line (`eventLine`): the name (`plain`, linked to its Leek Duck page, masked with `<…>`), the times, the post, `[Campfire](<…>)`. Made pinned and locked (`lockPost`; a moderator's unlock stands), edited in place (an unchanged one is not: `listingSent`), pinned again after each edit (an archived post opened again comes back unpinned; any failed pin, as another post holding the forum's one pin, 30047, is said once per server and the lock, the record and the draw carry on, review V4), its auto-archive a week; where its record is lost or it is gone, one the bot made in the forum is taken over (the pinned open one, else the oldest open, else the latest archived, `archivedPosts`, R2), else a new one is made.
+- **An event's post** (`eventPostMessage`): the name as a heading, the times, "More on Leek Duck", "Official meetups, if any: Campfire", and the feed's `image` as a gallery (Discord loads it or shows nothing; Pine fetches nothing, R6); no buttons, no pings; titled with the event's name (`eventPostTitle`: 100 code points). One per event and server (`EventPost`), made from `postOpensAt` until the end (at once for one listed later or on now); edited when the name or times change, and renamed when the name does (`renamePost`; the row's name follows only a rename done, a wait Discord names is a timer that draws again, review V3); a row whose event moved follows it (`movePost`, a `gone` row too, review V5) and is edited; one dropped before its start (only an id `droppedIds` names, review V1) says "Leek Duck no longer lists this event." and is archived unlocked (`dropped`, for good; its body without link and picture, ruling R2); a quiet post that archived itself before its event's end is opened again by the hourly draw (`postInfo().archived`, review V6, ruling R3); after the end its auto-archive is set to a day (`setAutoArchive`, never locked: a member's message reopens it and restarts the day), and one still open three days after the end is archived unlocked once (`archiveUnlocked`, `archivedAt`). A post a moderator deleted is marked `gone`, never made again, and its link leaves the listing.
+- **When it draws** (one draw at a time, `request` coalescing): after each read of the feed, at the next start, end or post opening among the listed events (one timer set anew each draw, a second after it, R10), a second after local midnight (`everyLocalMidnight`, `src/services/local-midnight.ts`, the timer `PartyService.watchMidnight` uses too, R11), in the scheduler's hourly upkeep (`PartySchedulerOptions.eventForum`) and in the catch-up on reconnect (`events forum`). Until `listingKnown()` nothing is drawn (no post made or dropped, the listing left as it is; `/admin setup-forums` says "The listing is posted once the events feed is read."; review V1). A forum that is gone (`channelKind` is no forum) is said once per server at warn (`the events forum is gone`) and nothing is done there until it is back; a refused pin, lock or archive is said once per server.
+
 ## Pictures and emoji
 
 - The pictures of the reports at stops (which picture a reward, a grunt or a leader shows, and the square copies the web server serves) are in `stop-reports.md`, "Pictures at the stops" (plan 8R-6).
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 6e5354689e2bef3e4f42d8aa647abd454cda953c..91bde7976e6dedf7e1b6f0cdfca0cc12980fa18c 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -51,7 +51,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one cell of a grid fixed on the world are one cluster, the cell 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below (`cellPixels`, plan 8M-11B), drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<zoom>:<cell>`, plan 8M-11B) and only the difference touched at each move, list or change (`planDots`: a cluster whose gyms changed changes its count and place in place, one no longer wanted gives its marker to a new one, the rest is added or taken off): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12 min", "1 h 05" while it runs (`durationWords`' compact form, plan 8M-11A), "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "Egg" or "Hatched" where nobody said when, "Ended" by `stageAt` (capitalized since plan 8M-11A, S5)), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
-- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's going on · n" (`LIST_HEADING`, plan 8M-11A, S22; the logged-out pane and the pane's `aria-label` too). A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30 min left" by `timeLeft` over `durationWords`, plan 8M-11A; "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
+- **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's going on · n" (`LIST_HEADING`, plan 8M-11A, S22; the logged-out pane and the pane's `aria-label` too). A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30 min left" by `timeLeft` over `durationWords`, plan 8M-11A; "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. The list ends with "Official meetups: Campfire" (`officialMeetupsLine`, a node through `renderNode`, the link `CAMPFIRE_DISCOVER_URL` in a new tab with `rel="noopener noreferrer"`; plan 8V-1, the Campfire links design) while the Meetups layer is offered (`LayerRegistry.isOffered`), the logged-out pane too; Pine never fetches anything from Campfire. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
 - **Distances** (`distance.ts`): `metersBetween`, which is `metresBetween` of `@pine/wayspot-core/distance` itself (the function the place search and Wayfarer matching measure with: one source for every fact, Matt 2026-10-25), and `distanceWords` (`src/render/distance-words.ts`, import-free), the one wording of a distance on the map and on Discord (Matt, 2026-10-25; task 7), in the units of `settings.distanceUnits` (per instance, as `timezone`): a short distance never rounded to nothing (the controller's ruling): `imperial` (the default) under 100 ft to the foot (`2 ft`), under a tenth of a mile to ten feet (`520 ft`), else miles to one decimal (`1.3 mi`); `metric` under 100 m to the meter (`2 m`, so that staff's lists of gyms within ten meters keep exact meters), under a kilometer to ten (`440 m`; what would round to 1000 m is `1.0 km`), else kilometers to one decimal. The pages read the units from `data-distance-units` of the map page and of the region editor's (`MapPageData.distanceUnits`, `WebDeps.distanceUnits`; the editor's "more than 490 ft apart" of a sliver too wide to fix is `FIX_REACH_METRES` by `distanceWords`, 8M-7 review fix 8); Discord's words take them from `ctx.config.settings`, through `distanceWords` itself, the one name (round 2): `/gym` move, add, review and import, `/pokestop`, the gym view's nearest gym, `/research`'s "Same task at more stops…" and its pin without a stop, and every threshold they name (`DUPLICATE_METRES`, `PINE_STOP_NEAR_METRES`, `PIN_NEAR_METRES`, `FAR_MOVE_METRES`, `CANDIDATE_METRES`, `DEFAULT_SCAN_MARGIN`), helps included (their `details` functions of the settings). `src/text-distances.test.ts` refuses a unit of distance worded by hand in the string literals of `src/commands`, `src/render`, `src/components` and the web pages' `src/web/client` (review fix 8), as `text-spelling.test.ts` refuses British spelling.
 
 ## The parties on the map (plan 8M-3)
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 938306d0a6167da0f2040fc102b9a3aa7154dd15..e02fd2b9881c1b20d8e94c095b8f3ae12871c0b0 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -127,6 +127,7 @@ Read what it prints, especially:
 - **"Off, because the legacy file lacks them"**: switches the legacy bot read as off. They stay off.
 - The **channel names** under `channels` (the bot lab, the moderators' channel, Unown sightings, the elite and remote raid channels, the PvP channel, bot updates) must be the names your server uses. `cutover-check` (4.7) tells you which it cannot find.
 - **Meetup safety** is new and off until you add `"moderation": "<channel>"` under `channels`: a staff-only channel (never bot updates), visible to every staff role (each role named `admin` or `moderator`: a moderator who cannot see it cannot open the links of `/places` and the reports), where meetups at a pin, or at a place whose name sounds private, wait for a moderator's approval, and blocked members' appeals arrive. Add it now or after the move; `cutover-check` warns while it is missing. During a rehearsal its posts go through (the testing staff see them); nothing else of the bot is posted there. `"meetupSafety": { "flaggedWords": [...] }` adds words to the names held for a moderator.
+- **The events forum** is new and off until you add `"events": "<forum name>"` under `channels` and run `/admin setup-forums` after the move: a forum of the game's events beside your bot-updates channel, with the bot's pinned listing and a post per bigger event (`eventsForum` sets how far the listing reaches, 35 days, and how early a post opens, 14). `cutover-check` warns where the forum is named and missing. A rehearsal leaves it out.
 
 ### 4.4 Fill in `.env`
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index ba831d268bc3967a63a69b6ebdd739fb1ded271b..ae72de5ac16fe3afcde036d1e117cb884c9df5da 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -116,6 +116,7 @@ The settings that matter first:
 - `distanceUnits`: how Pine says a distance, on Discord and on the web map alike: `imperial` (feet under a tenth of a mile, to the foot under 100 ft, else miles; the default) or `metric` (meters under a kilometer, to the meter under 100 m, else kilometers).
 - `channels`: the names of channels the bot uses in your server: `bot-lab` (where members try commands), `mod-bot-lab` (the moderators'), `unown` (Unown sightings), `elite-gym-raids` and `remote-raids` (copies of elite and remote raids), `pvp`, `bot-updates` (announcements). Make the channels or change the names.
 - Meetup safety (optional, and off until you set it): a meetup at a place that might be private (a pin from a maps link, or a gym or PokéStop whose name sounds like a front yard: a little free library, apartments) is held for a moderator, and posted only when one approves it. Make a text channel that only your staff can see (never the public bot updates channel), and that every staff role can see (each role named `admin` or `moderator`: a moderator who cannot see it gets "You don't have access to this link" from every link of `/places` and the reports), where the bot may view, send messages and embed links, and name it in `channels`, for example `"moderation": "meetup-review"` (the example settings have it blank, which is unset). The requests and the appeals of blocked members go there, with buttons for admins and moderators. Without it every meetup is posted at once, and the bot's log warns of it at every start. To hold more names for a moderator, add `"meetupSafety": { "flaggedWords": ["duplex", "cottage"] }` (whole words, any letter case).
+- The events forum (optional, and off until you set it): one forum of the game's events per server, with a pinned listing the bot keeps current (events on now, this week and coming up, from Leek Duck's list through ScrapedDuck, with a link to each event's page and to Campfire, where official meetups may be) and a post per bigger event (Community Day, Raid Day, Max Battle Day, Wild Area, GO Tour, GO Fest and Leek Duck's other events), opened 14 days ahead for members to talk in. Name it in `channels`, for example `"events": "events"` (the example settings have it blank, which is unset), and run `/admin setup-forums`: the forum is made in the category of your bot-updates channel, members cannot make posts in it, and the bot needs Manage Posts there (the command gives it where it may, and says what it could not do). `"eventsForum": { "horizonDays": 35, "postDaysAhead": 14 }` changes how far the listing reaches and how early a post opens. The bot never reads anything from Campfire.
 - `categories.pvp`: the category of your PvP channels: `/rank` and its short forms work only there and in a direct message with the bot.
 - `features`: `exGymChannel` and `remoteRaidChannel` (whether raids are copied into those channels), `notifications` (direct messages for wants and gym targets), `roles` (self-assigned roles with `/iam`).
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
diff --git a/docs/superpowers/plans/2026-10-29-phase-8v1-staging.md b/docs/superpowers/plans/2026-10-29-phase-8v1-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..3124dc285d114f5d998c49717ebcb1304fbdec23
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-29-phase-8v1-staging.md
@@ -0,0 +1,51 @@
+# Phase 8V-1 staging checklist: the events forum, with the Campfire links
+
+Every step needs Matt's go-ahead. Matt starts the bot (and the tunnel for the map's steps). Claude drives Discord and the map in its own tab as Googer; Matt's hand is needed on his phone.
+
+- **Accounts:** Googer (the owner, staff) and Tester (a member).
+- **Brief:** `.superpowers/sdd/2026-10-29-phase-8v1-events-forum/design.md`.
+- **Designs:** `docs/superpowers/specs/2026-10-28-events-forum-design.md`, `docs/superpowers/specs/2026-10-28-campfire-links-design.md`.
+- **Conventions:** `docs/architecture/utilities.md` ("The events forum and the Campfire links"), `docs/architecture/web.md` (the list's foot line).
+- **Writes:** migration 033 on the dev database (three new tables, additive); a forum `events` made in the test server's category of `bot-updates`, its listing and event posts. Nothing else is changed.
+- **Deploy:** none. No command's definition changed: `/help meetup` and `/help admin setup-forums` are read from the code, so the new sentences show without a deploy.
+- **Never:** nothing is fetched from Campfire, by the bot or by the staging tools.
+
+## Before
+
+0. **Settings.** In `var/stage/settings.json`, under `channels`, add `"events": "events"`. Leave `eventsForum` out (35 days, 14 days ahead). Run `npm run web:build`, then start the bot: the log says `listed events loaded` (none the first time), then `raid events read`. The migration log names `2026_10_29_033_events_forum`.
+
+## The Campfire links
+
+1. **`/help meetup`** (Tester): the help ends with "Official meetups by Community Ambassadors are on Campfire: https://campfire.scopely.com/discover". The link opens Campfire's map. Nothing else of `/meetup` changed.
+2. **The map, desktop** (Googer, logged in, a member): the list "What's going on" ends with "Official meetups: Campfire"; the link opens in a new tab. Logged out (a private window): the pane's "Log in…" ends with the same line.
+3. **The map, phone** (Matt): the List view ends with the same line, readable in light and dark, and the header's height is unchanged.
+
+## The forum and its listing (today's real feed)
+
+4. **`/admin setup-forums`** (Googer): after the regions' lines, "Events forum: created #events, closed it to posts by members, posted, pinned and locked the listing." The forum stands in the category of `#bot-updates`. Run it again: "Events forum: #events is ready."
+5. **Permissions.** In the forum's settings: Create Posts denied to @everyone, the bot's own overwrite allows Create Posts and Manage Posts. Tester cannot make a post there.
+6. **The listing "Events"** is pinned and locked (Tester cannot write in it). It reads `### Events`, the counts ("n now · n this week · n coming up"), the sections Now, This week and Coming up with their counts, each line the event's name linked to Leek Duck, its times as plain local text ("Sat, Nov 21, 2–5 PM"; several days "Nov 9 – Nov 13"), its post where it has one, and "Campfire"; the foot "Events marked Campfire may have official meetups by Community Ambassadors there. Pine only links to it." No Discord timestamps. No GO Pass, season, GO Battle League, Twitch drops, Timed Research or multi-day raid rotation is listed; no City Safari, Pokémon Night Out or city Wild Area or GO Tour.
+7. **Posts of today's feed.** Every Community Day, Raid Day, Max Battle Day, Wild Area, GO Tour, GO Fest and other `event` within 14 days has a post titled with its name: the name as a heading, the times, "More on Leek Duck", "Official meetups, if any: Campfire", the event's picture (or none, where Discord cannot load it). No buttons, nobody pinged. Raid Hours, Spotlight Hours and Max Mondays are lines only.
+8. **Unchanged, no edit.** Restart the bot: the log has no edit of the listing (it reads the same), and no post is made twice.
+9. **The record lost.** In the dev database, set `EventForum.listingPostId` to null; restart: the log says `took over the events listing`; still one listing. Then archive the listing by hand (Discord: Close post), set the column to null again and restart: the archived listing is taken over and opened, pinned again; no second listing.
+10. **A moderator's unlock.** As Googer unlock the listing; the next draw (a restart) leaves it unlocked.
+11. **cutover-check**, optional and only with Matt's go-ahead (it reads Discord with the token): the line `events: in <server> the events are listed in #events`. With `"events": "nowhere"` in a copy of the settings: `events: <server> has no forum #nowhere: /admin setup-forums makes it`.
+
+## A made-up feed (var/stage/serve-events.mjs)
+
+Point the stage settings' `raidEvents.url` at `http://127.0.0.1:8098/events.min.json`, start `node var/stage/serve-events.mjs` in its own terminal, and write `var/stage/fake-events.json` by hand (a list of items: `eventID`, `name`, `eventType`, `link`, `image`, `start`, `end` as local wall-clock times without a zone, `2026-11-03T14:00:00.000`). Each step restarts the bot so that the feed is read at once (or wait for the hourly read).
+
+12. **A post opens.** An item `staging-community-day-1`, "Staging Community Day", `community-day`, starting 20 days from now for 3 hours: after the read it is listed under Coming up, without a post. Move its start to 13 days from now: after the read it has its post, linked from its line.
+13. **A change.** Change its start by an hour: the post's times are edited, the listing's line too; no new post. Then change its name ("Staging Community Day II"): the post is renamed (its title in the forum's list) and its body says the new name.
+14. **A move.** Replace the item's `eventID` by `staging-community-day-1-rescheduled` and its name by "Staging Community Day (Rescheduled)", a day later: the same post is edited (the new name in its body, the new times), no second post; the log says `a listed event moved to a new id`. In the database the `EventPost` row has the new id.
+15. **A drop.** Remove the item: the post says "Leek Duck no longer lists this event." and is archived, not locked (Tester can still write in it, which opens it); the listing's line is gone; the log says `a listed event was dropped before its start`.
+16. **An end.** An item `staging-event-end`, "Staging Event", `event`, started an hour ago and ending in 10 minutes: its post is made at once, under Now. Ten minutes later (a second after the end) the listing drops it; the post's auto-archive is one day (Discord's post settings: "Hide After Inactivity: 1 day"), not locked. Three days later (or with the end set three days back in the item and a restart): the hourly upkeep archives it, unlocked, once; a message of Tester opens it again and it is not archived again by the bot.
+17. **A one-off raid event.** An item `staging-raid-event`, "Staging Raid Event", `raid-battles`, six hours tomorrow: listed as a line with Campfire, no post. An item of the same type over three days: not listed.
+18. **A post deleted.** Delete a staging event's post by hand, then change that event's times: no new post is made; the line in the listing loses its post link; the log says `an event post is gone; it is not made again`.
+19. **The forum deleted.** Delete the forum `events` by hand and restart: the log says `the events forum is gone` once, nothing is posted; `/admin setup-forums` makes it again with a new listing.
+20. **Midnight.** Leave the bot running over local midnight: a second after it the listing is drawn anew (This week moves on a day; edited only where it reads differently).
+21. **Rehearsal mode**, optional: with the rehearsal settings, `/admin setup-forums` says nothing of the events forum, and the log shows no draw of it.
+
+## After
+
+22. Point `raidEvents.url` back at ScrapedDuck, empty `var/stage/fake-events.json`, restart: the staging events leave the listing (dropped before their start or ended). Keep the forum for the next staging, or delete it and the `EventForum` row.
````

## After the last task

- [ ] `npm run check > var/8v1-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff eae89447964599c59ff69145f9128f1a6ff68ade HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
