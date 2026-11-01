# Phase 8M-1: The Web Server, Discord Login and the Public Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pine serves web pages from the running bot when `settings.web` is set: a member logs in with Discord (OAuth2, `identify`) or with a single-use link from `/maps`, and anybody opening `/s/<guild>/map` sees the server's regions and gyms on a Leaflet map (OpenStreetMap tiles, or Google's through the Map Tiles API). This is the base the region editor (8M-2), parties and joining (8M-3) and the forms of 8M-4/8M-5 build on.

**Architecture:** `src/web/` holds a Fastify server built by `buildWebServer(deps)` (tests use `inject`, no port), started by `src/app.ts` after the connection to Discord and closed first at shutdown; a port it cannot take is logged and the bot runs on. Security headers (CSP, nosniff, frame denial) from a pure builder; sessions in a new table `WebSession` (migration 015, the cookie's SHA-256 as key, 30 days from last use) behind `WebSessionRepository`; a CSRF token derived by HMAC from the session and an `Origin` check on every POST; OAuth through an injectable `OAuthGateway`; login links (`LoginLinks`, hashed in memory, five minutes, single use, redeemed only by a POST from a "Continue" page); a per-address limiter. The map's data is a pure view (`src/domain/web/geo-view.ts`) cached per server with an ETag and dropped when the region or gym directory's `generation` changes. The page is TypeScript in `src/web/client/`, bundled by esbuild (`npm run web:build`, part of `npm run build`) with Leaflet into `dist/web/assets/` and served with `@fastify/static`.

**Tech Stack:** TypeScript 6.0, discord.js 14.27, Kysely with MySQL, Vitest, esbuild; new: fastify 5.12, @fastify/cookie 11.1, @fastify/static 10.1, leaflet 1.9 (and @types/leaflet). One migration (`2026_10_16_015_web_session`; 015 is this plan's, first merge wins). `/maps` changes its description: the commands are registered again at staging (`--global` for the dev application).

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` (sections 2, 3.1, 5, 6, 7 and the 8M-1 row of section 8), approved by Matt 2026-10-15; the setting names agreed with the Docker session in the follow-ups ("Phase 9 (packaging)"). Ledger: `.superpowers/sdd/2026-10-16-phase-8m1-web-server-and-map/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout. At the plan's end `typescript-migration` is merged into `wayfarer` (if it moved), the full check runs there, and `typescript-migration` is fast-forwarded to it at a moment no other session commits.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m1` (worktree `var/proto-8m1`, from `wayfarer` a1e2322a), one commit per task, each commit typechecked with its own tests green; on the tip the full check, `npm run build`, `npm run web:build` and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Matt's (spec, 2026-10-15): served by the bot, plain HTTP on localhost; exposure (Cloudflare Tunnel to `profpine.com`, Tailscale Funnel, Caddy) is the operator's; Discord login plus links from the bot; roles asked fresh, never stored in the session; Leaflet with OSM by default, Google only through the Map Tiles API with a referrer-restricted browser key; the map public for regions and gyms.

Rulings made while Matt was away (2026-10-16; ledger), for Matt to look at:

1. **The new packages were installed without a separate go-ahead** (the spec named them; Matt said to keep going unless a decision is hard to change). The `wayfarer` worktree gets a `node_modules` of its own instead of the junction, so the main checkout's is never changed.
2. **Setting names `web.host`, `port`, `publicUrl`, `trustProxy`, `tiles`** (agreed with the Docker session) instead of the spec's `listen`.
3. **Only gyms in the server's regions are on the map** (the spec says every gym): a gym in no region belongs to no channel, and the directory cannot cheaply say whose it is.
4. **A login link opens a "Continue" page; only its POST logs in** (the spec says opening it starts a session): a link previewer or crawler that fetches the link can neither use it up nor receive the member's session cookie, and nobody can log a victim in as someone else with their own link. One tap more on a phone. (Corrected by the final review: a victim who opens somebody else's link and presses Continue is logged in as them; the fix wave made the button say whose link it is, "Continue as <name>", `web.md`.)
5. **The link's address carries the server** (`/auth/link/<guild>/<token>`), so a used or expired link still lands on that server's map with "This login link has expired".
6. **The client address is Fastify's `request.ip`** behind a trusted (loopback or private) peer, read from `X-Forwarded-For` through trusted hops only; `CF-Connecting-IP` is not read (any non-Cloudflare proxy passes it through unchanged). IPv6 clients are limited per /64.
7. **A gym's popup shows its description and its notice** separately (the spec's "notes").

Made while prototyping, to look at in staging:

1. Leaflet sets string content (tooltips, popups, attributions, layer names) as HTML: everything from data reaches it as DOM nodes built with `textContent` (`web.md`).
2. Google's Map Tiles policies ask for Google Maps attribution, the logo "whenever possible"; the page shows the words "Google Maps · <copyright of the view>". Whether to bundle Google's logo image is decided at staging.
3. Google Map Tiles API price (checked 2026-10-16): 2D tiles 100,000 free a month, then $0.60 per 1,000 (`docs/web-setup.md`).
4. `dist/web/` is read relative to the working directory: `npm run dev` needs `npm run web:build` first, and the Docker image must carry `dist/web/assets` and `dist/web/assets.json` (for the Docker plan).
5. Without the bundle the map page answers 503 "run npm run web:build".

## Before the first task (controller)

The `wayfarer` worktree's `node_modules` is a junction to the main checkout's. Replace it by a directory of its own, holding the new packages from the start, so that no task changes the main checkout's packages:

1. `cmd //c rmdir node_modules` in the worktree (the junction only; check it is gone and the main checkout's `node_modules` is intact).
2. `git show 35b0ce4a:package.json > package.json` and the same for `package-lock.json` (from 35b0ce4a), `npm ci`, then `git checkout -- package.json package-lock.json` (task 2 commits them).
3. Afterwards the worktree's typecheck and a small test run pass.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/discord-framework.md` and `gyms-and-regions.md` before starting (and `web.md` once task 8 adds it).
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network** (the OAuth gateway is tested against a fake `fetch`).
- Nothing from data reaches a page as HTML; nothing secret (session cookie, login token, OAuth code or state, CSRF token, client secret, browser key) reaches a log.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m1`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`) and its own tests green; task 3 also runs its database tests. The full `npm run check`, `npm run build`, `npm run web:build` and `npm run test:db` after the last task (one after the other, never two at once, and not while another session runs a suite; `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1` for the database suite).
- `src/db/types.ts` is generated: take it from the diff, never edit it by hand.
- Never `npm install`/`npm ci` (the controller prepared `node_modules`).
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **No session without the member's own action:** a GET or HEAD of a login link, a forged callback, a mismatched `state`, a used or expired link, another server's link: none starts a session; every redirect stays on `/s/<snowflake>/…` of this host.
2. **No secret in logs, no data as HTML:** cookies, tokens, codes and `/auth/*` query strings never logged; region and gym texts (channel names, gym names with `<`, `&`) shown as text on the page.
3. **A POST without the session's CSRF token or with another `Origin` changes nothing** (logout included).
4. **The bot runs on when the web server cannot:** port taken, bundle missing, Discord unreachable for `/api/me`; shutdown closes the server first and a late `connected` does not start it again.
5. **The map follows changes:** a region redrawn, a gym added or renamed, a channel renamed: the next `/api/geo` has it (a new ETag), an unchanged one answers 304 also for a weak `If-None-Match`.

---

### Task 1: settings.web and the secrets of the web pages

Prototype commit: `1b7ab816cf4f4e93aee1e202ec4dd4922cb86380`

`settings.web` (strict, optional): `port`, `host` (default `127.0.0.1`), `publicUrl` (the root of its host, `https:` unless localhost, kept as its origin), `trustProxy` (default false), `tiles` (`osm` | `google`, default `osm`). Optional env `DISCORD_CLIENT_SECRET` and `GOOGLE_MAPS_BROWSER_KEY` (blank is unset), in `.env.example`; warnings when the web pages are on without the client secret (no "Log in with Discord", links still work) and for `tiles: google` without a browser key (OSM is used).

**Files:**

```
 .env.example                |  7 +++++++
 src/config/env.test.ts      | 16 ++++++++++++++++
 src/config/env.ts           | 11 +++++++++++
 src/config/settings.test.ts | 73 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/config/settings.ts      | 51 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/config/warnings.test.ts | 47 +++++++++++++++++++++++++++++++++++++++++++++++
 src/config/warnings.ts      | 18 +++++++++++++++++-
 7 files changed, 222 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/config/env.test.ts src/config/settings.test.ts src/config/warnings.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/config/env.test.ts src/config/env.ts src/config/settings.test.ts src/config/settings.ts src/config/warnings.test.ts src/config/warnings.ts` and `npx eslint src/config/env.test.ts src/config/env.ts src/config/settings.test.ts src/config/settings.ts src/config/warnings.test.ts src/config/warnings.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 1b7ab816cf4f4e93aee1e202ec4dd4922cb86380 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `settings.web and the secrets of the web pages`, the paragraph above as the body and the trailer, staging exactly
  `.env.example src/config/env.test.ts src/config/env.ts src/config/settings.test.ts src/config/settings.ts src/config/warnings.test.ts src/config/warnings.ts`.

````diff
diff --git a/.env.example b/.env.example
index 99299f748b53b44490a0c118711a0329f708661b..bf669dc1330d7476af1b70cda97ce488bb9f5e9c 100644
--- a/.env.example
+++ b/.env.example
@@ -18,6 +18,13 @@ POKEMON_IMAGE_BASE=
 
 # Optional
 GOOGLE_API_KEY=
+# The web pages (settings.web), both optional. The OAuth2 client secret of the Discord
+# application (Developer Portal, OAuth2) for "Log in with Discord"; without it members log in
+# with the link /maps gives them. A Google Maps key for browsers, restricted to the Map Tiles
+# API and by HTTP referrer to the public address (<publicUrl>/*), for Google's tiles
+# (settings.web.tiles: google); never the same key as GOOGLE_API_KEY. See docs/web-setup.md.
+DISCORD_CLIENT_SECRET=
+GOOGLE_MAPS_BROWSER_KEY=
 # /request opens an issue in GITHUB_REPO (owner/repo) for each gym request; without both it is
 # not offered. The token needs Issues: write on that repository, and push access (a fine-grained
 # token's Contents: write, or a collaborator's classic token) for the gym's number to be set as
diff --git a/src/config/env.test.ts b/src/config/env.test.ts
index b5bb39b029be8ca79069477d220d6dd40464012b..10c78e5d5e62031b0bf97dc47f6374dc77568346 100644
--- a/src/config/env.test.ts
+++ b/src/config/env.test.ts
@@ -42,6 +42,22 @@ describe('loadEnv', () => {
     expect(() => loadEnv({ ...TEST_ENV, OWNER_ID: 'matt' })).toThrow(/OWNER_ID/);
   });
 
+  it('reads the secrets of the web pages, blank as unset', () => {
+    const none = loadEnv(TEST_ENV);
+    expect(none.DISCORD_CLIENT_SECRET).toBeUndefined();
+    expect(none.GOOGLE_MAPS_BROWSER_KEY).toBeUndefined();
+    const blank = loadEnv({ ...TEST_ENV, DISCORD_CLIENT_SECRET: ' ', GOOGLE_MAPS_BROWSER_KEY: '' });
+    expect(blank.DISCORD_CLIENT_SECRET).toBeUndefined();
+    expect(blank.GOOGLE_MAPS_BROWSER_KEY).toBeUndefined();
+    const set = loadEnv({
+      ...TEST_ENV,
+      DISCORD_CLIENT_SECRET: 'client-secret',
+      GOOGLE_MAPS_BROWSER_KEY: 'browser-key',
+    });
+    expect(set.DISCORD_CLIENT_SECRET).toBe('client-secret');
+    expect(set.GOOGLE_MAPS_BROWSER_KEY).toBe('browser-key');
+  });
+
   it('requires GITHUB_TOKEN and GITHUB_REPO together', () => {
     expect(() => loadEnv({ ...TEST_ENV, GITHUB_TOKEN: 'ghp_x' })).toThrow(/GITHUB_REPO/);
     const env = loadEnv({ ...TEST_ENV, GITHUB_TOKEN: 'ghp_x', GITHUB_REPO: 'Googer/PgP-Data' });
diff --git a/src/config/env.ts b/src/config/env.ts
index 9d822fe38283d2cafc40d3e26bc1e62b521ddc39..a0d19cf42428e24b6517d176be41b168a1f97269 100644
--- a/src/config/env.ts
+++ b/src/config/env.ts
@@ -25,6 +25,17 @@ export const envSchema = z
     DB_SCHEMA: z.string().min(1),
     POKEMON_IMAGE_BASE: z.url(),
     GOOGLE_API_KEY: optional(z.string()),
+    /**
+     * The client secret of the Discord application (OAuth2), for "Log in with Discord" on the
+     * web pages (`settings.web`); without it the login links of `/maps` still work.
+     */
+    DISCORD_CLIENT_SECRET: optional(z.string()),
+    /**
+     * A Google Maps key for browsers, restricted by referrer to `settings.web.publicUrl` and to
+     * the Map Tiles API: the page's Google tiles (`settings.web.tiles: 'google'`). Not
+     * `GOOGLE_API_KEY`, which is the server's and never reaches a page.
+     */
+    GOOGLE_MAPS_BROWSER_KEY: optional(z.string()),
     GITHUB_TOKEN: optional(z.string()),
     GITHUB_REPO: optional(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/repo')),
     LOG_LEVEL: z.preprocess(
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 8e48390147004b200d4b371b39fb8096b7cdf6fa..c58090ee6bd29fe785135e358474374c041b3bed 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -92,6 +92,79 @@ describe('loadSettings', () => {
     expect(() => loadSettings(wrong)).toThrow(/regionMapLink/);
   });
 
+  it('has no web server unless the file asks for one', () => {
+    expect(loadSettings(REPO_SETTINGS).web).toBeUndefined();
+  });
+
+  it('reads the web server with its defaults, the public address without its slash', () => {
+    const file = writeSettings((s) => {
+      s.web = { port: 8080, publicUrl: 'https://map.example.test/' };
+    });
+    expect(loadSettings(file).web).toEqual({
+      port: 8080,
+      host: '127.0.0.1',
+      publicUrl: 'https://map.example.test',
+      trustProxy: false,
+      tiles: 'osm',
+    });
+    const all = writeSettings((s) => {
+      s.web = {
+        port: 3000,
+        host: '0.0.0.0',
+        publicUrl: 'https://map.example.test:8443',
+        trustProxy: true,
+        tiles: 'google',
+      };
+    });
+    expect(loadSettings(all).web).toEqual({
+      port: 3000,
+      host: '0.0.0.0',
+      publicUrl: 'https://map.example.test:8443',
+      trustProxy: true,
+      tiles: 'google',
+    });
+  });
+
+  it('takes a plain http address only for this machine', () => {
+    for (const local of ['http://localhost:8080', 'http://127.0.0.1:8080/', 'http://[::1]:8080']) {
+      const file = writeSettings((s) => {
+        s.web = { port: 8080, publicUrl: local };
+      });
+      expect(loadSettings(file).web?.publicUrl, local).toBe(local.replace(/\/$/, ''));
+    }
+    const file = writeSettings((s) => {
+      s.web = { port: 8080, publicUrl: 'http://map.example.test' };
+    });
+    expect(() => loadSettings(file)).toThrow(/publicUrl/);
+    expect(() => loadSettings(file)).toThrow(/https/);
+  });
+
+  it('refuses a web server it could not run as written', () => {
+    const wrong: Record<string, unknown>[] = [
+      { publicUrl: 'https://map.example.test' },
+      { port: 0, publicUrl: 'https://map.example.test' },
+      { port: 65536, publicUrl: 'https://map.example.test' },
+      { port: 80.5, publicUrl: 'https://map.example.test' },
+      { port: 8080 },
+      { port: 8080, publicUrl: 'map.example.test' },
+      { port: 8080, publicUrl: 'ftp://map.example.test' },
+      { port: 8080, publicUrl: 'https://example.test/pine' },
+      { port: 8080, publicUrl: 'https://map.example.test/?a=1' },
+      { port: 8080, publicUrl: 'https://map.example.test/#map' },
+      { port: 8080, publicUrl: 'https://user:pw@map.example.test' },
+      { port: 8080, publicUrl: 'https://map.example.test', tiles: 'bing' },
+      { port: 8080, publicUrl: 'https://map.example.test', trustProxy: 'yes' },
+      { port: 8080, publicUrl: 'https://map.example.test', host: '' },
+      { port: 8080, publicUrl: 'https://map.example.test', listen: '0.0.0.0' },
+    ];
+    for (const web of wrong) {
+      const file = writeSettings((s) => {
+        s.web = web;
+      });
+      expect(() => loadSettings(file), JSON.stringify(web)).toThrow(/web/);
+    }
+  });
+
   it('starts with a file from before the EX tier went, whose durations it no longer reads', () => {
     expect(RETIRED_SETTINGS).toEqual([
       'exclusiveRaidIncubateDuration',
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 2912c889d4c7fd8c277b272e393316e0add22a56..144cd3ea1ee58e265fefb6a2c8a03431a026c6d4 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -35,6 +35,40 @@ export function withoutRetiredSettings(raw: unknown): unknown {
   return Object.fromEntries(Object.entries(raw).filter(([key]) => !retired.includes(key)));
 }
 
+/** The hosts a public address may name with plain http: this machine (`publicUrl`). */
+const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];
+
+/** Whether a public address is one of this machine's, where the cookie cannot be `Secure`. */
+export function isLocalAddress(publicUrl: string): boolean {
+  return LOCAL_HOSTS.includes(new URL(publicUrl).hostname);
+}
+
+/**
+ * The address every link of the web server points at (spec 2.1): `https:`, or `http:` for this
+ * machine alone (the cookie is `Secure` otherwise); the root of its host, nothing after it, kept
+ * without the slash so that a path is appended as it is.
+ */
+const publicUrl = z
+  .url({ protocol: /^https?$/ })
+  .superRefine((value, ctx) => {
+    // `z.url` has said what is wrong with no address at all.
+    if (!URL.canParse(value)) return;
+    const url = new URL(value);
+    if (url.protocol === 'http:' && !LOCAL_HOSTS.includes(url.hostname)) {
+      ctx.addIssue({
+        code: 'custom',
+        message: 'must be https: unless it is localhost, 127.0.0.1 or [::1]',
+      });
+    }
+    if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || value.includes('?')) {
+      ctx.addIssue({ code: 'custom', message: 'must be the root of its host, with no path' });
+    }
+    if (url.username !== '' || url.password !== '') {
+      ctx.addIssue({ code: 'custom', message: 'must not carry a user name or password' });
+    }
+  })
+  .transform((value) => new URL(value).origin);
+
 export const settingsSchema = z.strictObject({
   standardRaidIncubateDuration: minutes,
   standardRaidHatchedDuration: minutes,
@@ -139,6 +173,23 @@ export const settingsSchema = z.strictObject({
       userAgent: z.string().trim().min(3).max(200),
     })
     .optional(),
+  /**
+   * The web pages served by the bot (plan 8M-1; spec `2026-10-15-web-map-region-editor-design`):
+   * off unless set. Pine serves plain HTTP on `host`:`port`; how the outside reaches it (a
+   * tunnel, a proxy) is the operator's, and `publicUrl` is the address every link points at.
+   * With `trustProxy` the client's address is read from the forwarding headers, but only from a
+   * peer on this machine or a private network. `tiles` picks the map pictures: OpenStreetMap's,
+   * or Google's beside them (needs `GOOGLE_MAPS_BROWSER_KEY`).
+   */
+  web: z
+    .strictObject({
+      port: z.number().int().min(1).max(65535),
+      host: z.string().trim().min(1).default('127.0.0.1'),
+      publicUrl,
+      trustProxy: z.boolean().default(false),
+      tiles: z.enum(['osm', 'google']).default('osm'),
+    })
+    .optional(),
   timezone: z
     .string()
     .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
diff --git a/src/config/warnings.test.ts b/src/config/warnings.test.ts
index 502a43ca8cfc52d15026d8b9a2b9b38ed43e3b35..3e444ec54888ae1f054741d8aaa915cc0a169654 100644
--- a/src/config/warnings.test.ts
+++ b/src/config/warnings.test.ts
@@ -85,6 +85,53 @@ describe('configWarnings', () => {
     expect(warning).toMatch(/ocr\.keepMegabytes/);
   });
 
+  it('warns of a web server without the client secret: no login with Discord', () => {
+    const web = {
+      port: 8080,
+      host: '127.0.0.1',
+      publicUrl: 'https://map.example.test',
+      trustProxy: false,
+      tiles: 'osm' as const,
+    };
+    const [warning, ...more] = configWarnings({}, { regionMapLink: undefined, web });
+    expect(more).toEqual([]);
+    expect(warning).toMatch(/DISCORD_CLIENT_SECRET/);
+    expect(warning).toMatch(/Log in with Discord/);
+    expect(warning).toMatch(/\/maps/);
+    expect(
+      configWarnings({ DISCORD_CLIENT_SECRET: 'secret' }, { regionMapLink: undefined, web }),
+    ).toEqual([]);
+    expect(
+      configWarnings({ DISCORD_CLIENT_SECRET: '  ' }, { regionMapLink: undefined, web }),
+    ).toHaveLength(1);
+    // Without a web server the secret is not missed.
+    expect(configWarnings({}, { regionMapLink: undefined })).toEqual([]);
+  });
+
+  it('warns of Google tiles without the browser key: OpenStreetMap is shown', () => {
+    const web = {
+      port: 8080,
+      host: '127.0.0.1',
+      publicUrl: 'https://map.example.test',
+      trustProxy: false,
+      tiles: 'google' as const,
+    };
+    const raw = { DISCORD_CLIENT_SECRET: 'secret' };
+    const [warning, ...more] = configWarnings(raw, { regionMapLink: undefined, web });
+    expect(more).toEqual([]);
+    expect(warning).toMatch(/GOOGLE_MAPS_BROWSER_KEY/);
+    expect(warning).toMatch(/OpenStreetMap/);
+    expect(
+      configWarnings(
+        { ...raw, GOOGLE_MAPS_BROWSER_KEY: 'browser-key' },
+        { regionMapLink: undefined, web },
+      ),
+    ).toEqual([]);
+    expect(
+      configWarnings(raw, { regionMapLink: undefined, web: { ...web, tiles: 'osm' } }),
+    ).toEqual([]);
+  });
+
   it('says nothing about the default settings', () => {
     expect(configWarnings({}, loadSettings('data/settings.json'))).toEqual([]);
   });
diff --git a/src/config/warnings.ts b/src/config/warnings.ts
index 3b53e8d85b437ee8784d4aa94be1f9900fc08b2b..bc6da5f4211d008cbc61b6dd4c8e47b2e623ca3f 100644
--- a/src/config/warnings.ts
+++ b/src/config/warnings.ts
@@ -9,11 +9,14 @@ import type { Settings } from './settings.js';
  * would start after more than twelve minutes, when its interaction can hardly still be answered
  * (Discord allows fifteen): it is then answered as too busy. The review folder: when as many
  * screenshots as `ocr.reviewPerDay` a day for `ocr.reviewDays` (about 2 MB each) would exceed
- * `ocr.keepMegabytes`.
+ * `ocr.keepMegabytes`. The web pages: without `DISCORD_CLIENT_SECRET` nobody can log in with
+ * Discord (the login links of `/maps` still work), and Google's tiles without
+ * `GOOGLE_MAPS_BROWSER_KEY` are OpenStreetMap's.
  */
 export function configWarnings(
   raw: Record<string, string | undefined>,
   settings: Pick<Settings, 'regionMapLink'> & {
+    web?: Pick<NonNullable<Settings['web']>, 'tiles'>;
     ocr?: {
       enabled: boolean;
       queue: number;
@@ -47,5 +50,18 @@ export function configWarnings(
         'the kept screenshots with review copies, the oldest of which then go before their time',
     );
   }
+  const set = (name: string) => (raw[name] ?? '').trim() !== '';
+  if (settings.web && !set('DISCORD_CLIENT_SECRET')) {
+    warnings.push(
+      'settings.web is set but DISCORD_CLIENT_SECRET is not: the web pages offer no "Log in ' +
+        'with Discord"; members log in with the link /maps gives them',
+    );
+  }
+  if (settings.web?.tiles === 'google' && !set('GOOGLE_MAPS_BROWSER_KEY')) {
+    warnings.push(
+      "settings.web.tiles is 'google' but GOOGLE_MAPS_BROWSER_KEY is not set: the map shows " +
+        'OpenStreetMap only',
+    );
+  }
   return warnings;
 }
````

### Task 2: The web server in the bot

Prototype commit: `35b0ce4a95107a901cfc9225dd9132d60d8502d2`

Fastify, @fastify/cookie, @fastify/static and Leaflet as dependencies. `buildWebServer` builds the server from what it is given (tests use `inject`): the security headers on every answer (`src/web/headers.ts`: CSP, nosniff, frame denial, referrer policy), requests logged at debug by route pattern only, failures a short JSON or page without what went wrong, a 16 KB body limit, `/s/<guild>/` only for a server the bot is in. With `trustProxy` the client is `request.ip`, forwarded addresses believed only from loopback or private peers; a per-address limiter (`src/web/rate-limit.ts`; IPv6 by its /64, `addressBucket`). `src/app.ts` starts it once the client is ready and closes it first at shutdown; a port it cannot take is logged and the bot runs on.

**Files:**

```
 package-lock.json              | 811 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 package.json                   |   5 +
 src/app.ts                     |  35 ++++
 src/web/client-address.test.ts |  64 +++++++
 src/web/client-address.ts      |  61 +++++++
 src/web/headers.test.ts        |  64 +++++++
 src/web/headers.ts             |  57 ++++++
 src/web/rate-limit.test.ts     |  34 ++++
 src/web/rate-limit.ts          |  33 ++++
 src/web/server.test.ts         |  85 +++++++++
 src/web/server.ts              | 135 ++++++++++++++
 src/web/start.test.ts          |  52 ++++++
 src/web/start.ts               |  23 +++
 test/support/web.ts            |  38 ++++
 14 files changed, 1489 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/web/client-address.test.ts src/web/headers.test.ts src/web/rate-limit.test.ts src/web/server.test.ts src/web/start.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/web/client-address.test.ts src/web/client-address.ts src/web/headers.test.ts src/web/headers.ts src/web/rate-limit.test.ts src/web/rate-limit.ts src/web/server.test.ts src/web/server.ts src/web/start.test.ts src/web/start.ts test/support/web.ts` and `npx eslint src/app.ts src/web/client-address.test.ts src/web/client-address.ts src/web/headers.test.ts src/web/headers.ts src/web/rate-limit.test.ts src/web/rate-limit.ts src/web/server.test.ts src/web/server.ts src/web/start.test.ts src/web/start.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 35b0ce4a95107a901cfc9225dd9132d60d8502d2 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `The web server in the bot`, the paragraph above as the body and the trailer, staging exactly
  `package-lock.json package.json src/app.ts src/web/client-address.test.ts src/web/client-address.ts src/web/headers.test.ts src/web/headers.ts src/web/rate-limit.test.ts src/web/rate-limit.ts src/web/server.test.ts src/web/server.ts src/web/start.test.ts src/web/start.ts test/support/web.ts`.

````diff
diff --git a/package-lock.json b/package-lock.json
index 3d18eed569e7bf1018e0327d03d74753865df4d0..95e88db2a5a3c7a2a752bcc4d66c0da1b0f9afd3 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -9,10 +9,14 @@
       "version": "2.0.0-dev",
       "license": "GPL-3.0",
       "dependencies": {
+        "@fastify/cookie": "^11.1.3",
+        "@fastify/static": "^10.1.6",
         "discord.js": "^14.27.0",
         "fastest-levenshtein": "^1.0.16",
+        "fastify": "^5.12.7",
         "he": "^1.2.0",
         "kysely": "^0.29.6",
+        "leaflet": "^1.9.4",
         "luxon": "^3.7.2",
         "minisearch": "^7.2.0",
         "mysql2": "^3.24.5",
@@ -25,6 +29,7 @@
         "@eslint/js": "^10.0.1",
         "@testcontainers/mysql": "^12.2.0",
         "@types/he": "^1.2.3",
+        "@types/leaflet": "^1.9.22",
         "@types/luxon": "^3.7.6",
         "@types/node": "^24.19.1",
         "esbuild": "^0.28.2",
@@ -810,6 +815,297 @@
         "node": "^20.19.0 || ^22.13.0 || >=24"
       }
     },
+    "node_modules/@fastify/accept-negotiator": {
+      "version": "2.1.1",
+      "resolved": "https://registry.npmjs.org/@fastify/accept-negotiator/-/accept-negotiator-2.1.1.tgz",
+      "integrity": "sha512-gO48sJ/4+P9hYE24tEoWQF4fZvCfRmStf6NFhuT5hwXkH+3JXGdemoE/7ympeQZglieeLJx256rbg8e58IrCyA==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT"
+    },
+    "node_modules/@fastify/ajv-compiler": {
+      "version": "4.0.7",
+      "resolved": "https://registry.npmjs.org/@fastify/ajv-compiler/-/ajv-compiler-4.0.7.tgz",
+      "integrity": "sha512-VP0yIfwlc1ohj733keYDqyHm1VWeP9VQxYomunhr90jkC4aNNibbkrRiaNgPgqj1ORxUenILR4qzA/ppYBNAtQ==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "ajv": "^8.12.0",
+        "ajv-formats": "^3.0.1",
+        "fast-uri": "^4.0.0"
+      }
+    },
+    "node_modules/@fastify/ajv-compiler/node_modules/ajv": {
+      "version": "8.20.0",
+      "resolved": "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz",
+      "integrity": "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==",
+      "license": "MIT",
+      "dependencies": {
+        "fast-deep-equal": "^3.1.3",
+        "fast-uri": "^3.0.1",
+        "json-schema-traverse": "^1.0.0",
+        "require-from-string": "^2.0.2"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/epoberezkin"
+      }
+    },
+    "node_modules/@fastify/ajv-compiler/node_modules/ajv/node_modules/fast-uri": {
+      "version": "3.1.8",
+      "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.8.tgz",
+      "integrity": "sha512-GZMtZUTNRpOVIECoXwLNZS5xUGE+mVNbTB8h/7Rwh2TFWcBQiPzTgyZi05BF9UMZKkLJv8XBRJTlU7zg8+ZfMg==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "BSD-3-Clause"
+    },
+    "node_modules/@fastify/ajv-compiler/node_modules/json-schema-traverse": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz",
+      "integrity": "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==",
+      "license": "MIT"
+    },
+    "node_modules/@fastify/cookie": {
+      "version": "11.1.3",
+      "resolved": "https://registry.npmjs.org/@fastify/cookie/-/cookie-11.1.3.tgz",
+      "integrity": "sha512-RBhlMNsmSG6C5KGiTkhSXBF75xIrUMSytDDBcpnVewhJ8XVYnJTu+SV6FYKXClIRsBuRjOfKbBSULvnPD3X/mg==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "cookie": "^2.0.0",
+        "fastify-plugin": "^6.0.0"
+      }
+    },
+    "node_modules/@fastify/deepmerge": {
+      "version": "3.2.2",
+      "resolved": "https://registry.npmjs.org/@fastify/deepmerge/-/deepmerge-3.2.2.tgz",
+      "integrity": "sha512-155eqA/WMQdN6gUD4RrhS2K0Pcz2Ou9pQ86L0sipOpP9ONbTA6oYw/hW4VdBjR4egcDHqmWUK9x80oUX7S1mDQ==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT"
+    },
+    "node_modules/@fastify/error": {
+      "version": "4.2.1",
+      "resolved": "https://registry.npmjs.org/@fastify/error/-/error-4.2.1.tgz",
+      "integrity": "sha512-MYBumuIwP+5MIpXSyKm6/o1Eigcoij186lWUssX3LH5U8KWqU0ktZhzC4CErIX9EJeQeRGI+zJZQWakBlFbUcg==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT"
+    },
+    "node_modules/@fastify/fast-json-stringify-compiler": {
+      "version": "5.1.1",
+      "resolved": "https://registry.npmjs.org/@fastify/fast-json-stringify-compiler/-/fast-json-stringify-compiler-5.1.1.tgz",
+      "integrity": "sha512-pyxRKk7UpUnnrztP9pF4+ZYxusEQ4LifTyzRdiXmyql1QezNHxO02D25MVU2o4kMeAMYWAjG6RKRlojgkbiDAw==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "fast-json-stringify": "^7.0.0"
+      }
+    },
+    "node_modules/@fastify/forwarded": {
+      "version": "3.1.1",
+      "resolved": "https://registry.npmjs.org/@fastify/forwarded/-/forwarded-3.1.1.tgz",
+      "integrity": "sha512-XfDtW2Icvhqi6DP1YHFK4q/E8WpNd3+raBdzAyVZxmTInbFTtnEEKvEAMMOVdFuRyv+ynYipaA9D8FvjPqACkw==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT"
+    },
+    "node_modules/@fastify/merge-json-schemas": {
+      "version": "0.2.2",
+      "resolved": "https://registry.npmjs.org/@fastify/merge-json-schemas/-/merge-json-schemas-0.2.2.tgz",
+      "integrity": "sha512-d/gx9sRbUCVgGRGzma46wLcwiY8noTqO2Nmjg/vbTARxHRE5bdh5PIL8s97Lt1X7ScRWRW52eVYxwIoPwIdVUA==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "dequal": "^2.0.3"
+      }
+    },
+    "node_modules/@fastify/proxy-addr": {
+      "version": "5.1.2",
+      "resolved": "https://registry.npmjs.org/@fastify/proxy-addr/-/proxy-addr-5.1.2.tgz",
+      "integrity": "sha512-uqB4QsgVoro0XDC+DIftIMGXHdBPn+lK6Ek3xXAIxPMCJfqxnbtyEoMCm2KPUVOuIosd7Cyw9HawEqMFM/UA+g==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@fastify/forwarded": "^3.0.0",
+        "ipaddr.js": "^2.1.0"
+      }
+    },
+    "node_modules/@fastify/send": {
+      "version": "4.1.2",
+      "resolved": "https://registry.npmjs.org/@fastify/send/-/send-4.1.2.tgz",
+      "integrity": "sha512-PitRBXg/N4IrE5ToLuP7lITI5Mz8MmP13dv2aMtMNfaGfc5W5hNOwHqcsdQdqu0Lwm5cpDiYLkiOsZTgmhyt2Q==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@lukeed/ms": "^2.0.2",
+        "escape-html": "~1.0.3",
+        "fast-decode-uri-component": "^1.0.1",
+        "http-errors": "^2.0.0",
+        "mime": "^3"
+      }
+    },
+    "node_modules/@fastify/static": {
+      "version": "10.1.6",
+      "resolved": "https://registry.npmjs.org/@fastify/static/-/static-10.1.6.tgz",
+      "integrity": "sha512-f3x9XisI+y6AIhIfA/+Q3SFsuXeqNNk5HQh5htgHsPxmMLb4pLFskV6eFaLSW3IbI4azrS5np+/tkzXNH99LyQ==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@fastify/accept-negotiator": "^2.0.0",
+        "@fastify/error": "^4.0.0",
+        "@fastify/send": "^4.0.0",
+        "content-disposition": "^3.0.0",
+        "fastify-plugin": "^6.0.0",
+        "fastq": "^1.17.1",
+        "glob": "^13.0.0"
+      }
+    },
+    "node_modules/@fastify/static/node_modules/glob": {
+      "version": "13.0.6",
+      "resolved": "https://registry.npmjs.org/glob/-/glob-13.0.6.tgz",
+      "integrity": "sha512-Wjlyrolmm8uDpm/ogGyXZXb1Z+Ca2B8NbJwqBVg0axK9GbBeoS7yGV6vjXnYdGm6X53iehEuxxbyiKp8QmN4Vw==",
+      "license": "BlueOak-1.0.0",
+      "dependencies": {
+        "minimatch": "^10.2.2",
+        "minipass": "^7.1.3",
+        "path-scurry": "^2.0.2"
+      },
+      "engines": {
+        "node": "18 || 20 || >=22"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
+    "node_modules/@fastify/static/node_modules/lru-cache": {
+      "version": "11.5.3",
+      "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-11.5.3.tgz",
+      "integrity": "sha512-U4N8FgzmWxc8k1VH8Kr6lQg18U7Fjvby6wXHVRX/ZZ7IwWbRMgrRbP0Wrb5q5NVinryp4SQampHKdvtecItxUg==",
+      "license": "BlueOak-1.0.0",
+      "engines": {
+        "node": "20 || >=22"
+      }
+    },
+    "node_modules/@fastify/static/node_modules/path-scurry": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/path-scurry/-/path-scurry-2.0.2.tgz",
+      "integrity": "sha512-3O/iVVsJAPsOnpwWIeD+d6z/7PmqApyQePUtCndjatj/9I5LylHvt5qluFaBT3I5h3r1ejfR056c+FCv+NnNXg==",
+      "license": "BlueOak-1.0.0",
+      "dependencies": {
+        "lru-cache": "^11.0.0",
+        "minipass": "^7.1.2"
+      },
+      "engines": {
+        "node": "18 || 20 || >=22"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/isaacs"
+      }
+    },
     "node_modules/@grpc/grpc-js": {
       "version": "1.14.6",
       "resolved": "https://registry.npmjs.org/@grpc/grpc-js/-/grpc-js-1.14.6.tgz",
@@ -1532,6 +1828,15 @@
         "debug": "^4.1.1"
       }
     },
+    "node_modules/@lukeed/ms": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/@lukeed/ms/-/ms-2.0.2.tgz",
+      "integrity": "sha512-9I2Zn6+NJLfaGoz9jN3lpwDgAYvfGeNYdbAIjJOqzs4Tpc+VU3Jqq4IofSUBKajiDS8k9fZIg18/z13mpk1bsA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=8"
+      }
+    },
     "node_modules/@oxc-project/types": {
       "version": "0.153.0",
       "resolved": "https://registry.npmjs.org/@oxc-project/types/-/types-0.153.0.tgz",
@@ -2020,6 +2325,13 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@types/geojson": {
+      "version": "7946.0.16",
+      "resolved": "https://registry.npmjs.org/@types/geojson/-/geojson-7946.0.16.tgz",
+      "integrity": "sha512-6C8nqWur3j98U6+lXDfTUWIfgvZU+EumvpHKcYjujKH7woYyLj2sUmff0tRhrqM7BohUw7Pz3ZB1jj2gW9Fvmg==",
+      "dev": true,
+      "license": "MIT"
+    },
     "node_modules/@types/he": {
       "version": "1.2.3",
       "resolved": "https://registry.npmjs.org/@types/he/-/he-1.2.3.tgz",
@@ -2034,6 +2346,16 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/@types/leaflet": {
+      "version": "1.9.22",
+      "resolved": "https://registry.npmjs.org/@types/leaflet/-/leaflet-1.9.22.tgz",
+      "integrity": "sha512-h3lhECYEKDasG7LFHu+GiHqAvsgLuQvlJvVZzJDGONo3sEL+wUOqSFLnwkZlK0qVxnxbuGFW8iBlJNYs5wgndA==",
+      "dev": true,
+      "license": "MIT",
+      "dependencies": {
+        "@types/geojson": "*"
+      }
+    },
     "node_modules/@types/luxon": {
       "version": "3.7.6",
       "resolved": "https://registry.npmjs.org/@types/luxon/-/luxon-3.7.6.tgz",
@@ -2387,6 +2709,12 @@
         "node": ">=6.5"
       }
     },
+    "node_modules/abstract-logging": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/abstract-logging/-/abstract-logging-2.0.1.tgz",
+      "integrity": "sha512-2BjRTZxTPvheOvGbBslFSYOUkr+SjPtOnrLP33f+VIWLzezQpZcqVg7ja3L4dBXmzzgwT+a029jRx5PCi3JuiA==",
+      "license": "MIT"
+    },
     "node_modules/acorn": {
       "version": "8.19.0",
       "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.19.0.tgz",
@@ -2436,6 +2764,61 @@
         "url": "https://github.com/sponsors/epoberezkin"
       }
     },
+    "node_modules/ajv-formats": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/ajv-formats/-/ajv-formats-3.0.1.tgz",
+      "integrity": "sha512-8iUql50EUR+uUcdRQ3HDqa6EVyo3docL8g5WJ3FNcWmu62IbkGUue/pEyLBW8VGKKucTPgqeks4fIU1DA4yowQ==",
+      "license": "MIT",
+      "dependencies": {
+        "ajv": "^8.0.0"
+      },
+      "peerDependencies": {
+        "ajv": "^8.0.0"
+      },
+      "peerDependenciesMeta": {
+        "ajv": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/ajv-formats/node_modules/ajv": {
+      "version": "8.20.0",
+      "resolved": "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz",
+      "integrity": "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==",
+      "license": "MIT",
+      "dependencies": {
+        "fast-deep-equal": "^3.1.3",
+        "fast-uri": "^3.0.1",
+        "json-schema-traverse": "^1.0.0",
+        "require-from-string": "^2.0.2"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/epoberezkin"
+      }
+    },
+    "node_modules/ajv-formats/node_modules/fast-uri": {
+      "version": "3.1.8",
+      "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.8.tgz",
+      "integrity": "sha512-GZMtZUTNRpOVIECoXwLNZS5xUGE+mVNbTB8h/7Rwh2TFWcBQiPzTgyZi05BF9UMZKkLJv8XBRJTlU7zg8+ZfMg==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "BSD-3-Clause"
+    },
+    "node_modules/ajv-formats/node_modules/json-schema-traverse": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz",
+      "integrity": "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==",
+      "license": "MIT"
+    },
     "node_modules/ansi-regex": {
       "version": "6.4.0",
       "resolved": "https://registry.npmjs.org/ansi-regex/-/ansi-regex-6.4.0.tgz",
@@ -2549,8 +2932,28 @@
       "resolved": "https://registry.npmjs.org/atomic-sleep/-/atomic-sleep-1.0.0.tgz",
       "integrity": "sha512-kNOjDqAh7px0XWNI+4QbzoiR/nTkHAWNud2uvnJquD1/x5a7EQZMJT0AczqK0Qn67oY/TTQ1LbUKajZpp3I9tQ==",
       "license": "MIT",
-      "engines": {
-        "node": ">=8.0.0"
+      "engines": {
+        "node": ">=8.0.0"
+      }
+    },
+    "node_modules/avvio": {
+      "version": "9.3.1",
+      "resolved": "https://registry.npmjs.org/avvio/-/avvio-9.3.1.tgz",
+      "integrity": "sha512-QyTKW61/qlba+cUQBm/sT9X8lri4UdomqSDwCnrnj1IvLVDRRiXRkz4CgBRWB+/cmfC7SK5WQc8T1vSdGvaUcQ==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@fastify/error": "^4.0.0",
+        "fastq": "^1.17.1"
       }
     },
     "node_modules/aws-ssl-profiles": {
@@ -2581,7 +2984,6 @@
       "version": "4.0.4",
       "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz",
       "integrity": "sha512-BLrgEcRTwX2o6gGxGOCNyMvGSp35YofuYzw9h1IMTRmKqttAZZVU67bdb9Pr2vUHA8+j3i2tJfjO6C6+4myGTA==",
-      "dev": true,
       "license": "MIT",
       "engines": {
         "node": "18 || 20 || >=22"
@@ -2759,7 +3161,6 @@
       "version": "5.0.12",
       "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz",
       "integrity": "sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==",
-      "dev": true,
       "license": "MIT",
       "dependencies": {
         "balanced-match": "^4.0.2"
@@ -3026,6 +3427,32 @@
         "node": ">= 14"
       }
     },
+    "node_modules/content-disposition": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-3.0.0.tgz",
+      "integrity": "sha512-ZH/0Xs9rMIFWCOmGdmS9eHBTF62qqQYNz4nVjQhkdIO/a0fCP4UIM3mRz/wiqL0L14YgAz/1xio4OaSY4+ON/A==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=22"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
+      }
+    },
+    "node_modules/cookie": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/cookie/-/cookie-2.0.1.tgz",
+      "integrity": "sha512-yuToqVvRrj6pfDXREyQAAv8SkAEk/8GS3jQRTiUMm66TVtBYmqQeoEjL2Lmq8Rpo6271vH76InTChTitEAm65w==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=22"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
+      }
+    },
     "node_modules/core-util-is": {
       "version": "1.0.3",
       "resolved": "https://registry.npmjs.org/core-util-is/-/core-util-is-1.0.3.tgz",
@@ -3186,6 +3613,24 @@
         "url": "https://github.com/sponsors/ljharb"
       }
     },
+    "node_modules/depd": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
+      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
+    "node_modules/dequal": {
+      "version": "2.0.3",
+      "resolved": "https://registry.npmjs.org/dequal/-/dequal-2.0.3.tgz",
+      "integrity": "sha512-0je+qPKHEMohvfRTCEo3CrPG6cAzAYgmzKyxRiYSSDkS6eGJdyVJm7WaYA5ECaAD9wLB2T4EEeymA5aFVcYXCA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=6"
+      }
+    },
     "node_modules/detect-libc": {
       "version": "2.1.2",
       "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
@@ -3508,6 +3953,12 @@
         "node": ">=6"
       }
     },
+    "node_modules/escape-html": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
+      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
+      "license": "MIT"
+    },
     "node_modules/escape-string-regexp": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
@@ -3758,6 +4209,12 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/fast-decode-uri-component": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/fast-decode-uri-component/-/fast-decode-uri-component-1.0.1.tgz",
+      "integrity": "sha512-WKgKWg5eUxvRZGwW8FvfbaH7AXSh2cL+3j5fMGzUMCxWBJ3dV3a7Wz8y2f/uQ0e3B6WmodD3oS54jTQ9HVTIIg==",
+      "license": "MIT"
+    },
     "node_modules/fast-deep-equal": {
       "version": "3.1.3",
       "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
@@ -3778,6 +4235,68 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/fast-json-stringify": {
+      "version": "7.1.0",
+      "resolved": "https://registry.npmjs.org/fast-json-stringify/-/fast-json-stringify-7.1.0.tgz",
+      "integrity": "sha512-wAhAQ+es0aH+x5OofdCHlZZFdqwtiM6lpEosaRIwfg271WYeEQ/tPcXdu5vpzlqZpbJ4WNqaW4QR5UjfG4Dc2w==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@fastify/merge-json-schemas": "^0.2.0",
+        "ajv": "^8.12.0",
+        "ajv-formats": "^3.0.1",
+        "fast-uri": "^4.0.0",
+        "json-schema-ref-resolver": "^3.0.0",
+        "rfdc": "^1.2.0"
+      }
+    },
+    "node_modules/fast-json-stringify/node_modules/ajv": {
+      "version": "8.20.0",
+      "resolved": "https://registry.npmjs.org/ajv/-/ajv-8.20.0.tgz",
+      "integrity": "sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==",
+      "license": "MIT",
+      "dependencies": {
+        "fast-deep-equal": "^3.1.3",
+        "fast-uri": "^3.0.1",
+        "json-schema-traverse": "^1.0.0",
+        "require-from-string": "^2.0.2"
+      },
+      "funding": {
+        "type": "github",
+        "url": "https://github.com/sponsors/epoberezkin"
+      }
+    },
+    "node_modules/fast-json-stringify/node_modules/ajv/node_modules/fast-uri": {
+      "version": "3.1.8",
+      "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.8.tgz",
+      "integrity": "sha512-GZMtZUTNRpOVIECoXwLNZS5xUGE+mVNbTB8h/7Rwh2TFWcBQiPzTgyZi05BF9UMZKkLJv8XBRJTlU7zg8+ZfMg==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "BSD-3-Clause"
+    },
+    "node_modules/fast-json-stringify/node_modules/json-schema-traverse": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-1.0.0.tgz",
+      "integrity": "sha512-NM8/P9n3XjXhIZn1lLhkFaACTOURQXjWhV4BA/RnOv8xvgqtqpAX9IO4mRQxSx1Rlo4tqzeqb0sOlruaOy3dug==",
+      "license": "MIT"
+    },
     "node_modules/fast-levenshtein": {
       "version": "2.0.6",
       "resolved": "https://registry.npmjs.org/fast-levenshtein/-/fast-levenshtein-2.0.6.tgz",
@@ -3785,6 +4304,15 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/fast-querystring": {
+      "version": "1.1.2",
+      "resolved": "https://registry.npmjs.org/fast-querystring/-/fast-querystring-1.1.2.tgz",
+      "integrity": "sha512-g6KuKWmFXc0fID8WWH0jit4g0AGBoJhCkJMb1RmbsSEUNvQ+ZC8D6CUZ+GtF8nMzSPXnhiePyyqqipzNNEnHjg==",
+      "license": "MIT",
+      "dependencies": {
+        "fast-decode-uri-component": "^1.0.1"
+      }
+    },
     "node_modules/fast-safe-stringify": {
       "version": "2.1.1",
       "resolved": "https://registry.npmjs.org/fast-safe-stringify/-/fast-safe-stringify-2.1.1.tgz",
@@ -3792,6 +4320,22 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/fast-uri": {
+      "version": "4.2.2",
+      "resolved": "https://registry.npmjs.org/fast-uri/-/fast-uri-4.2.2.tgz",
+      "integrity": "sha512-EwVpUMzLVNOmcWW0zi5G3JJwkopB6XXjnVvNBGfqrMMsVew2hkQWl5e/pe/CfYUeS6jt4cIO2MnamEW7v/7wPw==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "BSD-3-Clause"
+    },
     "node_modules/fastest-levenshtein": {
       "version": "1.0.16",
       "resolved": "https://registry.npmjs.org/fastest-levenshtein/-/fastest-levenshtein-1.0.16.tgz",
@@ -3801,6 +4345,64 @@
         "node": ">= 4.9.1"
       }
     },
+    "node_modules/fastify": {
+      "version": "5.12.7",
+      "resolved": "https://registry.npmjs.org/fastify/-/fastify-5.12.7.tgz",
+      "integrity": "sha512-v4pEPsTRPuqlDIYiQFB+BHjVN4SdHX9u0ABk0ZDUKbbdY1vsNryUd1j4Z+jQEZajvYIVk047Kimva9/AJ79GYw==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "@fastify/ajv-compiler": "^4.0.5",
+        "@fastify/error": "^4.0.0",
+        "@fastify/fast-json-stringify-compiler": "^5.0.0",
+        "@fastify/proxy-addr": "^5.0.0",
+        "abstract-logging": "^2.0.1",
+        "avvio": "^9.0.0",
+        "fast-json-stringify": "^7.0.0",
+        "find-my-way": "^9.6.0",
+        "light-my-request": "^6.0.0",
+        "pino": "^9.14.0 || ^10.1.0",
+        "process-warning": "^5.1.0",
+        "rfdc": "^1.3.1",
+        "secure-json-parse": "^4.0.0",
+        "semver": "^7.6.0",
+        "toad-cache": "^3.7.0"
+      }
+    },
+    "node_modules/fastify-plugin": {
+      "version": "6.0.1",
+      "resolved": "https://registry.npmjs.org/fastify-plugin/-/fastify-plugin-6.0.1.tgz",
+      "integrity": "sha512-4wW4RxSmvPXLrh5mgQEiu43qU3bw44N2ss4FTkTkQIbprUhE+/s43QX0j/ttcztdWK7PEkHqVthdc5GdEGDvjA==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT"
+    },
+    "node_modules/fastq": {
+      "version": "1.20.3",
+      "resolved": "https://registry.npmjs.org/fastq/-/fastq-1.20.3.tgz",
+      "integrity": "sha512-XKv5nnLs6nLF71NgiKJLIZFLkPyIEuOselLG7ujZnGrRfQK8HpvY+WqKhAJUAdLomwVHErVS4LfxFlPq0/FTAw==",
+      "license": "ISC",
+      "dependencies": {
+        "reusify": "^1.0.4"
+      }
+    },
     "node_modules/file-entry-cache": {
       "version": "11.1.5",
       "resolved": "https://registry.npmjs.org/file-entry-cache/-/file-entry-cache-11.1.5.tgz",
@@ -3824,6 +4426,20 @@
         "node": ">=8"
       }
     },
+    "node_modules/find-my-way": {
+      "version": "9.10.0",
+      "resolved": "https://registry.npmjs.org/find-my-way/-/find-my-way-9.10.0.tgz",
+      "integrity": "sha512-eru+uCPQ2g+nLBkf84MHP/KyNNMar0BDy0j+i8Fb72GF9/YHBZ58q7FODUtfVV7XU9nfRUHXSmaM8NmZcIbZ4Q==",
+      "license": "MIT",
+      "dependencies": {
+        "fast-deep-equal": "^3.1.3",
+        "fast-querystring": "^1.0.0",
+        "safe-regex2": "^5.0.0"
+      },
+      "engines": {
+        "node": ">=20"
+      }
+    },
     "node_modules/find-up": {
       "version": "5.0.0",
       "resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
@@ -4147,6 +4763,26 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/http-errors": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
+      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
+      "license": "MIT",
+      "dependencies": {
+        "depd": "~2.0.0",
+        "inherits": "~2.0.4",
+        "setprototypeof": "~1.2.0",
+        "statuses": "~2.0.2",
+        "toidentifier": "~1.0.1"
+      },
+      "engines": {
+        "node": ">= 0.8"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
+      }
+    },
     "node_modules/iconv-lite": {
       "version": "0.7.3",
       "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.7.3.tgz",
@@ -4235,7 +4871,6 @@
       "version": "2.0.4",
       "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
       "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
-      "dev": true,
       "license": "ISC"
     },
     "node_modules/interpret": {
@@ -4248,6 +4883,15 @@
         "node": ">= 0.10"
       }
     },
+    "node_modules/ipaddr.js": {
+      "version": "2.5.0",
+      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-2.5.0.tgz",
+      "integrity": "sha512-aq+t5NAc+cS6rZQQVWC2x98CPqGtKKTMDd4Gaodv0wShnItdKg/51djkGJ1hqH+Oy0ivDftCbSLCQob8zso01w==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 10"
+      }
+    },
     "node_modules/is-arrayish": {
       "version": "0.2.1",
       "resolved": "https://registry.npmjs.org/is-arrayish/-/is-arrayish-0.2.1.tgz",
@@ -4410,6 +5054,25 @@
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/json-schema-ref-resolver": {
+      "version": "3.0.1",
+      "resolved": "https://registry.npmjs.org/json-schema-ref-resolver/-/json-schema-ref-resolver-3.0.1.tgz",
+      "integrity": "sha512-w+HwgljXpVwZ3IidoUR1qPZxSOQ+NRQWuVe6a5pe8XbHsNZE4UAwVPUvzZagn7yBKbJtt6UJnRFYbNTRPZI45Q==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "dequal": "^2.0.3"
+      }
+    },
     "node_modules/json-schema-traverse": {
       "version": "0.4.1",
       "resolved": "https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz",
@@ -4643,6 +5306,12 @@
         "safe-buffer": "~5.1.0"
       }
     },
+    "node_modules/leaflet": {
+      "version": "1.9.4",
+      "resolved": "https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz",
+      "integrity": "sha512-nxS1ynzJOmOlHp+iL3FyWqK89GtNL8U8rvlMOsQdTTssxZwCXh8N2NB3GDQOL+YR3XnWyZAxwQixURb+FA74PA==",
+      "license": "BSD-2-Clause"
+    },
     "node_modules/levn": {
       "version": "0.4.1",
       "resolved": "https://registry.npmjs.org/levn/-/levn-0.4.1.tgz",
@@ -4657,6 +5326,28 @@
         "node": ">= 0.8.0"
       }
     },
+    "node_modules/light-my-request": {
+      "version": "6.8.0",
+      "resolved": "https://registry.npmjs.org/light-my-request/-/light-my-request-6.8.0.tgz",
+      "integrity": "sha512-5Q8PjoSEdtGIB8fikZsTem5vgRo4F2mR6vUKTDW/H1g6MtAt8e3duQbg/QxL5yzg6BZhor2KOUm3hhWMWLTZwg==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "@fastify/deepmerge": "^3.1.0",
+        "cookie": "^2.0.0",
+        "process-warning": "^5.0.0",
+        "set-cookie-parser": "^3.0.1"
+      }
+    },
     "node_modules/lightningcss": {
       "version": "1.33.0",
       "resolved": "https://registry.npmjs.org/lightningcss/-/lightningcss-1.33.0.tgz",
@@ -5066,11 +5757,22 @@
         "node": ">=8.6"
       }
     },
+    "node_modules/mime": {
+      "version": "3.0.0",
+      "resolved": "https://registry.npmjs.org/mime/-/mime-3.0.0.tgz",
+      "integrity": "sha512-jSCU7/VB1loIWBZe14aEYHU/+1UMEHoaO7qxCOVJOw9GgH72VAWppxNcjU+x9a2k3GSIBXNKxXQFqRvvZ7vr3A==",
+      "license": "MIT",
+      "bin": {
+        "mime": "cli.js"
+      },
+      "engines": {
+        "node": ">=10.0.0"
+      }
+    },
     "node_modules/minimatch": {
       "version": "10.2.6",
       "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-10.2.6.tgz",
       "integrity": "sha512-vpLQEs+VLCr1nU0BXS07maYoFwlDAH0gngQuuttxIwutDFEMHq2blX+8vpgxDdK3J1PwjCJiep77OitTZ4Ll1A==",
-      "dev": true,
       "license": "BlueOak-1.0.0",
       "dependencies": {
         "brace-expansion": "^5.0.8"
@@ -5096,7 +5798,6 @@
       "version": "7.1.3",
       "resolved": "https://registry.npmjs.org/minipass/-/minipass-7.1.3.tgz",
       "integrity": "sha512-tEBHqDnIoM/1rXME1zgka9g6Q2lcoCkxHLuc7ODJ5BxbP5d4c2Z5cGgtXAku59200Cx7diuHTOYfSBD8n6mm8A==",
-      "dev": true,
       "license": "BlueOak-1.0.0",
       "engines": {
         "node": ">=16 || 14 >=14.17"
@@ -5806,6 +6507,15 @@
         "node": ">=0.10.0"
       }
     },
+    "node_modules/require-from-string": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/require-from-string/-/require-from-string-2.0.2.tgz",
+      "integrity": "sha512-Xf0nWe6RseziFMu+Ap9biiUbmplq6S9/p+7w7YXP/JBHhrUDDUhwa+vANyubuqfZWTveU//DYVGsDG7RKL/vEw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
     "node_modules/resolve": {
       "version": "1.22.13",
       "resolved": "https://registry.npmjs.org/resolve/-/resolve-1.22.13.tgz",
@@ -5838,6 +6548,15 @@
         "node": ">=8"
       }
     },
+    "node_modules/ret": {
+      "version": "0.5.0",
+      "resolved": "https://registry.npmjs.org/ret/-/ret-0.5.0.tgz",
+      "integrity": "sha512-I1XxrZSQ+oErkRR4jYbAyEEu2I0avBvvMM5JN+6EBprOGRCs63ENqZ3vjavq8fBw2+62G5LF5XelKwuJpcvcxw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=10"
+      }
+    },
     "node_modules/retry": {
       "version": "0.12.0",
       "resolved": "https://registry.npmjs.org/retry/-/retry-0.12.0.tgz",
@@ -5848,6 +6567,22 @@
         "node": ">= 4"
       }
     },
+    "node_modules/reusify": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/reusify/-/reusify-1.1.0.tgz",
+      "integrity": "sha512-g6QUff04oZpHs0eG5p83rFLhHeV00ug/Yf9nZM6fLeUrPguBTkTQOdpAWWspMh55TZfVQDPaN3NQJfbVRAxdIw==",
+      "license": "MIT",
+      "engines": {
+        "iojs": ">=1.0.0",
+        "node": ">=0.10.0"
+      }
+    },
+    "node_modules/rfdc": {
+      "version": "1.4.1",
+      "resolved": "https://registry.npmjs.org/rfdc/-/rfdc-1.4.1.tgz",
+      "integrity": "sha512-q1b3N5QkRUWUl7iyylaaj3kOpIT0N2i9MqIEQXP73GVsN9cw3fdx8X63cEmWhJGi2PPCF23Ijp7ktmd39rawIA==",
+      "license": "MIT"
+    },
     "node_modules/rolldown": {
       "version": "1.2.13",
       "resolved": "https://registry.npmjs.org/rolldown/-/rolldown-1.2.13.tgz",
@@ -5904,6 +6639,28 @@
       ],
       "license": "MIT"
     },
+    "node_modules/safe-regex2": {
+      "version": "5.1.2",
+      "resolved": "https://registry.npmjs.org/safe-regex2/-/safe-regex2-5.1.2.tgz",
+      "integrity": "sha512-tAtCGFPPP02VroDVzp4daGi6bC7jWG+41D47GKf18FeH/ubvKQHT9VmhAkvtjNOmJwqtApzWeUpEhkyEYULvmw==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/fastify"
+        },
+        {
+          "type": "opencollective",
+          "url": "https://opencollective.com/fastify"
+        }
+      ],
+      "license": "MIT",
+      "dependencies": {
+        "ret": "~0.5.0"
+      },
+      "bin": {
+        "safe-regex2": "bin/safe-regex2.js"
+      }
+    },
     "node_modules/safe-stable-stringify": {
       "version": "2.5.0",
       "resolved": "https://registry.npmjs.org/safe-stable-stringify/-/safe-stable-stringify-2.5.0.tgz",
@@ -5923,7 +6680,6 @@
       "version": "4.1.1",
       "resolved": "https://registry.npmjs.org/secure-json-parse/-/secure-json-parse-4.1.1.tgz",
       "integrity": "sha512-lnd81MQEZKjhW/Gd2TQqdd4XP6QYNdDW/EP+I7nTrFHP9y2LmaGPIHk9xsnzcOiEr1c39c/e84xFgGviQKBTRw==",
-      "dev": true,
       "funding": [
         {
           "type": "github",
@@ -5963,6 +6719,18 @@
         "url": "https://github.com/sponsors/sindresorhus"
       }
     },
+    "node_modules/set-cookie-parser": {
+      "version": "3.1.3",
+      "resolved": "https://registry.npmjs.org/set-cookie-parser/-/set-cookie-parser-3.1.3.tgz",
+      "integrity": "sha512-xletSdAI5efyVJjsatBbzDkXl3M/Zmad3xfnQe7ZXuBB0yNwW7C2WFsNGjdRNfZunmNHQuX79xs/ACMTLCdcew==",
+      "license": "MIT"
+    },
+    "node_modules/setprototypeof": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
+      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
+      "license": "ISC"
+    },
     "node_modules/sharp": {
       "version": "0.34.5",
       "resolved": "https://registry.npmjs.org/sharp/-/sharp-0.34.5.tgz",
@@ -6134,6 +6902,15 @@
         "nan": "^2.23.0"
       }
     },
+    "node_modules/statuses": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
+      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/std-env": {
       "version": "4.3.0",
       "resolved": "https://registry.npmjs.org/std-env/-/std-env-4.3.0.tgz",
@@ -6514,6 +7291,24 @@
         "node": ">=8.0"
       }
     },
+    "node_modules/toad-cache": {
+      "version": "3.7.4",
+      "resolved": "https://registry.npmjs.org/toad-cache/-/toad-cache-3.7.4.tgz",
+      "integrity": "sha512-m1TdR/rvT7kgGJZhspNtXdsdYk0fddFpJJFlG5s+UkPFo6lkLoZ3YLOaovPYjq1R75NP5JfeTlSHaOsE09peCg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=20"
+      }
+    },
+    "node_modules/toidentifier": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
+      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.6"
+      }
+    },
     "node_modules/ts-api-utils": {
       "version": "2.5.0",
       "resolved": "https://registry.npmjs.org/ts-api-utils/-/ts-api-utils-2.5.0.tgz",
diff --git a/package.json b/package.json
index 39600ac93b7fe0e13280f73f90c523e4d89c6761..aa146a1189429dc55af6e5dd5aa37794a9563790 100644
--- a/package.json
+++ b/package.json
@@ -39,10 +39,14 @@
   "author": "Matt Legowski, Chris Vaccarello",
   "license": "GPL-3.0",
   "dependencies": {
+    "@fastify/cookie": "^11.1.3",
+    "@fastify/static": "^10.1.6",
     "discord.js": "^14.27.0",
     "fastest-levenshtein": "^1.0.16",
+    "fastify": "^5.12.7",
     "he": "^1.2.0",
     "kysely": "^0.29.6",
+    "leaflet": "^1.9.4",
     "luxon": "^3.7.2",
     "minisearch": "^7.2.0",
     "mysql2": "^3.24.5",
@@ -55,6 +59,7 @@
     "@eslint/js": "^10.0.1",
     "@testcontainers/mysql": "^12.2.0",
     "@types/he": "^1.2.3",
+    "@types/leaflet": "^1.9.22",
     "@types/luxon": "^3.7.6",
     "@types/node": "^24.19.1",
     "esbuild": "^0.28.2",
diff --git a/src/app.ts b/src/app.ts
index e4876f51b6194450020c926258c4e1f03c284f0e..e018e68808c74093caf67f51c3b73f08061a8858 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -84,6 +84,9 @@ import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
 import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
+import { pictureOrigins } from './web/headers.js';
+import { buildWebServer } from './web/server.js';
+import { startWebServer } from './web/start.js';
 
 /** Parsed game data is kept here between runs, so the bot can start while offline. */
 const GAME_DATA_CACHE = 'var/game-data-cache.json';
@@ -614,8 +617,40 @@ export async function startApp(
   );
   log.info({ features }, 'optional features');
 
+  // The web pages (`settings.web`), served once the client is ready: a port it cannot take is
+  // logged and the bot runs on without them.
+  const webSettings = config.settings.web;
+  let webClosed = false;
+  const web =
+    webSettings &&
+    buildWebServer({
+      settings: webSettings,
+      pictureOrigins: pictureOrigins(config.settings.raidEggPicturesUrl),
+      googleKey: config.env.GOOGLE_MAPS_BROWSER_KEY,
+      servers: { has: (guildId) => client.guilds.cache.has(guildId) },
+      log,
+    });
+  if (web && webSettings) {
+    void connected.then(async () => {
+      if (!webClosed) await startWebServer(web, webSettings, log);
+    });
+  }
+
   const shutdown = createShutdown(
     [
+      // Before anything else: no page may start a change while the bot is going.
+      ...(web
+        ? [
+            {
+              name: 'web server',
+              timeoutMs: 3_000,
+              run: async () => {
+                webClosed = true;
+                await web.close();
+              },
+            },
+          ]
+        : []),
       // First: nothing may start changing parties while the rest is being flushed.
       { name: 'party clock', timeoutMs: 10_000, run: () => scheduler.stop() },
       // No screenshot is read from here on: the trigger first (it stops between images and sends
diff --git a/src/web/client-address.test.ts b/src/web/client-address.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..51be1daeb6a1104c1656ac829bfab9026a18878c
--- /dev/null
+++ b/src/web/client-address.test.ts
@@ -0,0 +1,64 @@
+import { describe, expect, it } from 'vitest';
+import { addressBucket, isNearbyPeer } from './client-address.js';
+
+describe('addressBucket', () => {
+  it('counts IPv4 by the address, also when it is written as IPv6', () => {
+    expect(addressBucket('203.0.113.7')).toBe('203.0.113.7');
+    expect(addressBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
+  });
+
+  it('counts IPv6 by its /64, which one home or one machine has whole', () => {
+    expect(addressBucket('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
+    expect(addressBucket('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
+    expect(addressBucket('2001:DB8:1:2::9')).toBe('2001:db8:1:2::/64');
+    expect(addressBucket('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
+    expect(addressBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
+    expect(addressBucket('::1')).toBe('0:0:0:0::/64');
+    expect(addressBucket('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
+    expect(addressBucket('64:ff9b:1:2::198.51.100.1')).toBe('64:ff9b:1:2::/64');
+  });
+
+  it('keeps what is no address as it is', () => {
+    expect(addressBucket('')).toBe('');
+    expect(addressBucket('not an address')).toBe('not an address');
+  });
+});
+
+describe('isNearbyPeer', () => {
+  it('trusts this machine and private networks, IPv4 and IPv6', () => {
+    for (const address of [
+      '127.0.0.1',
+      '127.8.9.10',
+      '10.0.0.5',
+      '172.16.0.1',
+      '172.31.255.254',
+      '192.168.1.20',
+      '169.254.10.10',
+      '::1',
+      'fc00::1',
+      'fd12:3456::7',
+      'fe80::1',
+      '::ffff:127.0.0.1',
+      '::ffff:192.168.0.3',
+    ]) {
+      expect(isNearbyPeer(address), address).toBe(true);
+    }
+  });
+
+  it('trusts nobody on the internet, nor what is no address', () => {
+    for (const address of [
+      '8.8.8.8',
+      '172.32.0.1',
+      '172.15.255.255',
+      '192.169.0.1',
+      '203.0.113.7',
+      '2001:db8::1',
+      '::ffff:8.8.8.8',
+      '',
+      'localhost',
+      'not an address',
+    ]) {
+      expect(isNearbyPeer(address), address).toBe(false);
+    }
+  });
+});
diff --git a/src/web/client-address.ts b/src/web/client-address.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4f03fdb4a182a1264dca85af6e5d89373565a16f
--- /dev/null
+++ b/src/web/client-address.ts
@@ -0,0 +1,61 @@
+import { BlockList, isIP } from 'node:net';
+
+/** This machine, private networks and link-local addresses: where a trusted proxy may be. */
+const NEARBY = new BlockList();
+NEARBY.addSubnet('127.0.0.0', 8, 'ipv4');
+NEARBY.addSubnet('10.0.0.0', 8, 'ipv4');
+NEARBY.addSubnet('172.16.0.0', 12, 'ipv4');
+NEARBY.addSubnet('192.168.0.0', 16, 'ipv4');
+NEARBY.addSubnet('169.254.0.0', 16, 'ipv4');
+NEARBY.addAddress('::1', 'ipv6');
+NEARBY.addSubnet('fc00::', 7, 'ipv6');
+NEARBY.addSubnet('fe80::', 10, 'ipv6');
+
+/** An IPv4 address written as IPv6 (`::ffff:127.0.0.1`), as Node gives a dual-stack peer. */
+const MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
+
+/**
+ * Whether a peer may be a proxy whose forwarding headers are believed (`settings.web.trustProxy`,
+ * spec 2.1): loopback, RFC 1918, fc00::/7 and link-local addresses. Anything on the internet,
+ * and anything that is no address, is not.
+ */
+export function isNearbyPeer(address: string): boolean {
+  const mapped = MAPPED.exec(address)?.[1];
+  const plain = mapped ?? address;
+  const family = isIP(plain);
+  if (family === 4) return NEARBY.check(plain, 'ipv4');
+  if (family === 6) return NEARBY.check(plain, 'ipv6');
+  return false;
+}
+
+/** The first four groups of an IPv6 address (its /64), as numbers; it is an IPv6 address. */
+function firstGroups(address: string): number[] {
+  let text = address.split('%')[0] ?? '';
+  // An IPv4 tail (`64:ff9b::198.51.100.1`) is the last two groups.
+  const tail = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
+  if (tail) {
+    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number];
+    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
+  }
+  const [head = '', rest] = text.split('::');
+  const before = head === '' ? [] : head.split(':');
+  const after = rest === undefined || rest === '' ? [] : rest.split(':');
+  const zeros = rest === undefined ? [] : Array<string>(8 - before.length - after.length).fill('0');
+  return [...before, ...zeros, ...after].slice(0, 4).map((group) => parseInt(group, 16));
+}
+
+/**
+ * What a client is counted as by the rate limits, from its address (Fastify's `request.ip`:
+ * the peer's, or with `trustProxy` the last address of `X-Forwarded-For` that no nearby proxy
+ * added): IPv4, also written as IPv6, by the address; IPv6 by its /64, which one home or one
+ * machine has whole, so that a client cannot get a fresh count by changing its address. What
+ * is no address is kept as it is.
+ */
+export function addressBucket(address: string): string {
+  const mapped = MAPPED.exec(address)?.[1];
+  if (mapped !== undefined) return mapped;
+  if (isIP(address) !== 6) return address;
+  return `${firstGroups(address)
+    .map((group) => group.toString(16))
+    .join(':')}::/64`;
+}
diff --git a/src/web/headers.test.ts b/src/web/headers.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..667de683025e7478c1bb99c41f20778b4e1f6432
--- /dev/null
+++ b/src/web/headers.test.ts
@@ -0,0 +1,64 @@
+import { describe, expect, it } from 'vitest';
+import { POKEMON_ICON_BASE } from '../domain/pogo/pokemon-icons.js';
+import { RAID_EGG_PICTURES_URL } from '../domain/pogo/raid-eggs.js';
+import { contentSecurityPolicy, pictureOrigins, securityHeaders } from './headers.js';
+
+/** The directives of a policy, by name. */
+function directives(policy: string): Map<string, string[]> {
+  return new Map(
+    policy.split(';').map((part) => {
+      const [name = '', ...values] = part.trim().split(/\s+/);
+      return [name, values];
+    }),
+  );
+}
+
+describe('contentSecurityPolicy', () => {
+  const pictures = ['https://cdn.leekduck.com', 'https://raw.githubusercontent.com'];
+
+  it('lets in scripts and styles from Pine alone, and frames nothing', () => {
+    const policy = directives(contentSecurityPolicy({ google: false, pictureOrigins: pictures }));
+    expect(policy.get('default-src')).toEqual(["'none'"]);
+    expect(policy.get('script-src')).toEqual(["'self'"]);
+    expect(policy.get('style-src')).toEqual(["'self'"]);
+    expect(policy.get('font-src')).toEqual(["'self'"]);
+    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
+    expect(policy.get('base-uri')).toEqual(["'none'"]);
+    expect(policy.get('form-action')).toEqual(["'self'"]);
+    expect(policy.get('connect-src')).toEqual(["'self'"]);
+  });
+
+  it("shows OpenStreetMap's tiles and the posts' pictures, and Google's only with Google", () => {
+    const osm = directives(contentSecurityPolicy({ google: false, pictureOrigins: pictures }));
+    expect(osm.get('img-src')).toEqual([
+      "'self'",
+      'data:',
+      'https://tile.openstreetmap.org',
+      ...pictures,
+    ]);
+    const google = directives(contentSecurityPolicy({ google: true, pictureOrigins: pictures }));
+    expect(google.get('img-src')).toContain('https://tile.googleapis.com');
+    expect(google.get('img-src')).toContain('https://tile.openstreetmap.org');
+    expect(google.get('connect-src')).toEqual(["'self'", 'https://tile.googleapis.com']);
+  });
+});
+
+describe('pictureOrigins', () => {
+  it("names the hosts of the posts' pictures, each once", () => {
+    expect(pictureOrigins(RAID_EGG_PICTURES_URL)).toEqual([
+      new URL(POKEMON_ICON_BASE).origin,
+      'https://raw.githubusercontent.com',
+    ]);
+    expect(pictureOrigins('https://cdn.leekduck.com/eggs/')).toEqual(['https://cdn.leekduck.com']);
+  });
+});
+
+describe('securityHeaders', () => {
+  it('refuses sniffing and frames, and sends only the origin to other sites', () => {
+    const headers = securityHeaders({ google: false, pictureOrigins: [] });
+    expect(headers['x-content-type-options']).toBe('nosniff');
+    expect(headers['x-frame-options']).toBe('DENY');
+    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
+    expect(headers['content-security-policy']).toContain("script-src 'self'");
+  });
+});
diff --git a/src/web/headers.ts b/src/web/headers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e8ff358aa4be0fbdea5c257b0f32f0815996c0bd
--- /dev/null
+++ b/src/web/headers.ts
@@ -0,0 +1,57 @@
+import { POKEMON_ICON_BASE } from '../domain/pogo/pokemon-icons.js';
+
+/** OpenStreetMap's standard tiles (one host since 2024; no subdomains). */
+export const OSM_TILES = 'https://tile.openstreetmap.org';
+/** Google's Map Tiles API: its sessions, its 2D tiles and its attribution. */
+export const GOOGLE_TILES = 'https://tile.googleapis.com';
+
+export interface PolicyOptions {
+  /** Whether the page shows Google's tiles (`tiles: 'google'` with a browser key). */
+  google: boolean;
+  /** The origins of the pictures posts show (`pictureOrigins`). */
+  pictureOrigins: readonly string[];
+}
+
+/**
+ * The origins the pictures of posts come from: the Pokémon icons (`pokemonPicture`; the raid
+ * boss feed's pictures are on the same CDN) and the raid eggs (`raidEggPicture`, from
+ * `settings.raidEggPicturesUrl`), each once. The map of 8M-1 shows none yet; 8M-3 does.
+ */
+export function pictureOrigins(raidEggPicturesUrl: string): string[] {
+  return [...new Set([POKEMON_ICON_BASE, raidEggPicturesUrl].map((url) => new URL(url).origin))];
+}
+
+/**
+ * The Content Security Policy of every answer (spec 2.2): scripts, styles and fonts from Pine
+ * alone, no inline script; pictures from Pine, the tile hosts and the posts' picture hosts;
+ * connections to Pine and, with Google's tiles, the Map Tiles API; no frames, no `<base>`,
+ * forms only to Pine. Leaflet sets `style` attributes from its script, which `style-src` does
+ * not govern (it covers style elements and attributes in the markup).
+ */
+export function contentSecurityPolicy({ google, pictureOrigins }: PolicyOptions): string {
+  const tiles = google ? [OSM_TILES, GOOGLE_TILES] : [OSM_TILES];
+  return [
+    "default-src 'none'",
+    "script-src 'self'",
+    "style-src 'self'",
+    `img-src 'self' data: ${[...tiles, ...pictureOrigins].join(' ')}`,
+    `connect-src 'self'${google ? ` ${GOOGLE_TILES}` : ''}`,
+    "font-src 'self'",
+    "frame-ancestors 'none'",
+    "base-uri 'none'",
+    "form-action 'self'",
+  ].join('; ');
+}
+
+/**
+ * The headers every answer carries. The referrer of a request to another site is Pine's
+ * origin, never a path: Google checks a browser key's referrer restriction by it.
+ */
+export function securityHeaders(options: PolicyOptions): Record<string, string> {
+  return {
+    'content-security-policy': contentSecurityPolicy(options),
+    'x-content-type-options': 'nosniff',
+    'x-frame-options': 'DENY',
+    'referrer-policy': 'strict-origin-when-cross-origin',
+  };
+}
diff --git a/src/web/rate-limit.test.ts b/src/web/rate-limit.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ad1fc801a78177b77da00f13501b97131a3916cd
--- /dev/null
+++ b/src/web/rate-limit.test.ts
@@ -0,0 +1,34 @@
+import { describe, expect, it } from 'vitest';
+import { RateLimiter } from './rate-limit.js';
+
+describe('RateLimiter', () => {
+  it('lets an address through as often as allowed in a window, then says how long to wait', () => {
+    const limiter = new RateLimiter({ uses: 3, perMs: 60_000 });
+    expect(limiter.take('203.0.113.7', 0)).toEqual({ ok: true });
+    expect(limiter.take('203.0.113.7', 10_000)).toEqual({ ok: true });
+    expect(limiter.take('203.0.113.7', 20_000)).toEqual({ ok: true });
+    expect(limiter.take('203.0.113.7', 30_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
+    // Another address has its own window.
+    expect(limiter.take('203.0.113.8', 30_000)).toEqual({ ok: true });
+    // The window starts anew once it has passed.
+    expect(limiter.take('203.0.113.7', 60_000)).toEqual({ ok: true });
+  });
+
+  it('counts a refused use too, and rounds the wait up to a whole second', () => {
+    const limiter = new RateLimiter({ uses: 1, perMs: 1_000 });
+    expect(limiter.take('a', 0).ok).toBe(true);
+    expect(limiter.take('a', 1)).toEqual({ ok: false, retryAfterSeconds: 1 });
+    expect(limiter.take('a', 999)).toEqual({ ok: false, retryAfterSeconds: 1 });
+    expect(limiter.take('a', 1_000).ok).toBe(true);
+  });
+
+  it('remembers a bounded number of addresses, the oldest going first', () => {
+    const limiter = new RateLimiter({ uses: 1, perMs: 60_000, addresses: 2 });
+    limiter.take('a', 0);
+    limiter.take('b', 0);
+    limiter.take('c', 0);
+    // `a` was forgotten: it starts anew.
+    expect(limiter.take('a', 1).ok).toBe(true);
+    expect(limiter.take('c', 1).ok).toBe(false);
+  });
+});
diff --git a/src/web/rate-limit.ts b/src/web/rate-limit.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8a75542a3b7f55ab72155e5f05597a8eede39373
--- /dev/null
+++ b/src/web/rate-limit.ts
@@ -0,0 +1,33 @@
+import { BoundedMap } from '../bounded-map.js';
+
+/** How many addresses a limiter remembers at most. */
+const ADDRESSES = 10_000;
+
+export type RateAnswer = { ok: true } | { ok: false; retryAfterSeconds: number };
+
+/**
+ * Requests per client address in fixed windows (spec 5: the login pages and the public data):
+ * at most `uses` in `perMs`, counted from an address's first request of a window; a refused
+ * request counts too. Kept in memory for at most `addresses` addresses (oldest out: what is
+ * forgotten starts anew). The time is the caller's.
+ */
+export class RateLimiter {
+  private readonly windows: BoundedMap<string, { start: number; used: number }>;
+
+  constructor(private readonly limit: { uses: number; perMs: number; addresses?: number }) {
+    this.windows = new BoundedMap(limit.addresses ?? ADDRESSES);
+  }
+
+  /** Counts a request of this address; whether it may go through, else how long to wait. */
+  take(address: string, now: number): RateAnswer {
+    const kept = this.windows.get(address);
+    const window = kept && now - kept.start < this.limit.perMs ? kept : { start: now, used: 0 };
+    window.used += 1;
+    this.windows.set(address, window);
+    if (window.used <= this.limit.uses) return { ok: true };
+    return {
+      ok: false,
+      retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.limit.perMs - now) / 1000)),
+    };
+  }
+}
diff --git a/src/web/server.test.ts b/src/web/server.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..375cfcd8ed9f245972e59e2c66f0f8db46587e9e
--- /dev/null
+++ b/src/web/server.test.ts
@@ -0,0 +1,85 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { webServerWith, type TestWeb } from '../../test/support/web.js';
+
+describe('the web server', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('answers an address it does not serve with a short page, and sends its headers', async () => {
+    web = webServerWith();
+    const answer = await web.app.inject({ url: '/nothing/here' });
+    expect(answer.statusCode).toBe(404);
+    expect(answer.headers['content-type']).toMatch(/^text\/html/);
+    expect(answer.body).toContain('Not found');
+    expect(answer.body.length).toBeLessThan(600);
+    expect(answer.headers['x-content-type-options']).toBe('nosniff');
+    expect(answer.headers['x-frame-options']).toBe('DENY');
+    expect(answer.headers['content-security-policy']).toContain("default-src 'none'");
+  });
+
+  it('answers in JSON below an api address', async () => {
+    web = webServerWith();
+    const answer = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/nothing` });
+    expect(answer.statusCode).toBe(404);
+    expect(answer.json()).toEqual({ error: 'Not found.' });
+  });
+
+  it('serves the servers the bot is in, and no other', async () => {
+    web = webServerWith();
+    const ok = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me` });
+    expect(ok.statusCode).toBe(200);
+    expect(ok.json()).toEqual({ loggedIn: false });
+    for (const guild of ['412345678901234999', 'abc', '1', `${FAKE_GUILD_ID}x`]) {
+      const answer = await web.app.inject({ url: `/s/${guild}/api/me` });
+      expect(answer.statusCode, guild).toBe(404);
+      expect(answer.json(), guild).toEqual({ error: 'Not found.' });
+    }
+  });
+
+  it('answers a failure briefly, without what went wrong, and logs it', async () => {
+    web = webServerWith({
+      servers: {
+        has() {
+          throw new Error('the cache is gone');
+        },
+      },
+    });
+    const answer = await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me` });
+    expect(answer.statusCode).toBe(500);
+    expect(answer.json()).toEqual({ error: 'Something went wrong.' });
+    expect(answer.body).not.toContain('cache');
+    const logged = web.entries.filter((entry) => entry.msg === 'the web server failed');
+    expect(logged).toHaveLength(1);
+    expect(logged[0]).toMatchObject({ level: 50, route: '/s/:guild/api/me' });
+    expect((logged[0]?.err as { message: string }).message).toBe('the cache is gone');
+  });
+
+  it('logs a request by its route, never by what its address carries', async () => {
+    web = webServerWith();
+    await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me?token=hush-hush` });
+    await web.app.inject({ url: '/missing?code=hush-hush' });
+    const requests = web.entries.filter((entry) => entry.msg === 'web request');
+    expect(requests).toEqual([
+      expect.objectContaining({
+        level: 20,
+        method: 'GET',
+        route: '/s/:guild/api/me',
+        status: 200,
+      }),
+      expect.objectContaining({ level: 20, method: 'GET', route: '(none)', status: 404 }),
+    ]);
+    expect(JSON.stringify(web.entries)).not.toContain('hush-hush');
+  });
+
+  it('says nothing about itself at its root', async () => {
+    web = webServerWith();
+    const answer = await web.app.inject({ url: '/' });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toMatch(/^text\/html/);
+    expect(answer.body).toContain('/maps');
+  });
+});
diff --git a/src/web/server.ts b/src/web/server.ts
new file mode 100644
index 0000000000000000000000000000000000000000..01ca0cfbe7437c444356faccd2131c1edde29a78
--- /dev/null
+++ b/src/web/server.ts
@@ -0,0 +1,135 @@
+import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
+import type { Settings } from '../config/settings.js';
+import { isSnowflake } from '../db/snowflake.js';
+import type { Logger } from '../log.js';
+import { isNearbyPeer } from './client-address.js';
+import { securityHeaders } from './headers.js';
+
+/** `settings.web` once it is set. */
+export type WebSettings = NonNullable<Settings['web']>;
+
+/** What the web server is built from: given explicitly, so that tests build it over fakes. */
+export interface WebDeps {
+  settings: WebSettings;
+  /** The origins of the posts' pictures, which the pages may show (`pictureOrigins`). */
+  pictureOrigins: readonly string[];
+  /** `GOOGLE_MAPS_BROWSER_KEY`: Google's tiles are offered only with it and `tiles: 'google'`. */
+  googleKey: string | undefined;
+  /** The servers the bot is in (the client's cache): any other is not found. */
+  servers: { has(guildId: string): boolean };
+  log: Logger;
+}
+
+/** The largest body of any request (spec 5); a route that takes more says so itself. */
+export const BODY_LIMIT = 16 * 1024;
+
+/** What an answer that failed says, by status: a few words, never what went wrong. */
+const FAILURE_WORDS: Readonly<Record<number, string>> = {
+  400: 'Bad request.',
+  403: 'Not allowed.',
+  404: 'Not found.',
+  413: 'Too large.',
+  415: 'Unsupported content.',
+  429: 'Too many requests. Try again in a minute.',
+};
+const FAILED = 'Something went wrong.';
+
+/** Whether an address belongs to the data of the pages, answered in JSON. */
+function isApi(url: string): boolean {
+  return /^\/s\/[^/?]+\/api\//.test(url) || url.startsWith('/api/');
+}
+
+/** A short page of one sentence: what a failure or an empty address shows. */
+export function shortPage(sentence: string): string {
+  const text = sentence.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
+  return (
+    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
+    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
+    `<title>Professor Pine</title></head><body><p>${text}</p></body></html>`
+  );
+}
+
+/** Answers a failure: JSON `{ error }` for the pages' data, a short page otherwise. */
+export function sendFailure(request: FastifyRequest, reply: FastifyReply, status: number) {
+  const words = FAILURE_WORDS[status] ?? FAILED;
+  reply.code(status).header('cache-control', 'no-store');
+  if (isApi(request.url)) return reply.send({ error: words });
+  return reply.type('text/html; charset=utf-8').send(shortPage(words));
+}
+
+/**
+ * The web server (spec 2.1): Fastify without its own logger, every request logged at debug by
+ * its route pattern (never its address, which may carry a token), the security headers on every
+ * answer, failures answered briefly. `/s/<guild>/…` serves only a server the bot is in.
+ * Listening is `startWebServer`'s; tests use `inject`.
+ */
+export function buildWebServer(deps: WebDeps): FastifyInstance {
+  const { settings, log } = deps;
+  const app = Fastify({
+    logger: false,
+    bodyLimit: BODY_LIMIT,
+    // Forwarding headers are believed only from a peer on this machine or a private network.
+    trustProxy: settings.trustProxy ? (address: string) => isNearbyPeer(address) : false,
+    return503OnClosing: true,
+  });
+  const headers = securityHeaders({
+    google: settings.tiles === 'google' && deps.googleKey !== undefined,
+    pictureOrigins: deps.pictureOrigins,
+  });
+
+  app.addHook('onSend', async (_request, reply, payload) => {
+    reply.headers(headers);
+    return payload;
+  });
+  app.addHook('onResponse', async (request, reply) => {
+    log.debug(
+      {
+        method: request.method,
+        route: request.routeOptions.url ?? '(none)',
+        status: reply.statusCode,
+        ms: Math.round(reply.elapsedTime),
+      },
+      'web request',
+    );
+  });
+  app.setErrorHandler((err: Error & { statusCode?: number }, request, reply) => {
+    const status =
+      err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500
+        ? err.statusCode
+        : 500;
+    if (status === 500) {
+      log.error(
+        { err, method: request.method, route: request.routeOptions.url ?? '(none)' },
+        'the web server failed',
+      );
+    }
+    return sendFailure(request, reply, status);
+  });
+  app.setNotFoundHandler((request, reply) => sendFailure(request, reply, 404));
+
+  app.get('/', (_request, reply) =>
+    reply
+      .type('text/html; charset=utf-8')
+      .send(shortPage("Professor Pine's map is at an address of each server: use /maps there.")),
+  );
+
+  void app.register(
+    (scope, _options, done) => {
+      // A server the bot is not in, or no server at all, is not found.
+      scope.addHook(
+        'onRequest',
+        async (request: FastifyRequest<{ Params: { guild: string } }>, reply) => {
+          const { guild } = request.params;
+          if (!isSnowflake(guild) || !deps.servers.has(guild))
+            return sendFailure(request, reply, 404);
+        },
+      );
+      scope.get('/api/me', (_request, reply) =>
+        reply.header('cache-control', 'no-store').send({ loggedIn: false }),
+      );
+      done();
+    },
+    { prefix: '/s/:guild' },
+  );
+  return app;
+}
diff --git a/src/web/start.test.ts b/src/web/start.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5586428ba48f26c2f19515812e894bfba8912b11
--- /dev/null
+++ b/src/web/start.test.ts
@@ -0,0 +1,52 @@
+import { createServer, type Server } from 'node:net';
+import { afterEach, describe, expect, it } from 'vitest';
+import { webServerWith, type TestWeb } from '../../test/support/web.js';
+import { startWebServer } from './start.js';
+
+/** A port on 127.0.0.1 that something else holds. */
+async function takenPort(): Promise<{ port: number; holder: Server }> {
+  const holder = createServer();
+  await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
+  const address = holder.address();
+  if (address === null || typeof address === 'string') throw new Error('no port');
+  return { port: address.port, holder };
+}
+
+describe('startWebServer', () => {
+  let web: TestWeb | undefined;
+  let holder: Server | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    await new Promise((resolve) => (holder ? holder.close(resolve) : resolve(undefined)));
+    web = undefined;
+    holder = undefined;
+  });
+
+  it('listens where it is told and says so', async () => {
+    web = webServerWith();
+    const started = await startWebServer(web.app, { host: '127.0.0.1', port: 0 }, web.log);
+    expect(started).toBe(true);
+    expect(web.app.server.listening).toBe(true);
+    const address = web.app.server.address();
+    if (address === null || typeof address === 'string') throw new Error('not listening');
+    expect(web.entries).toContainEqual(
+      expect.objectContaining({
+        level: 30,
+        msg: 'web server listening',
+        host: '127.0.0.1',
+        port: address.port,
+      }),
+    );
+  });
+
+  it('logs a port it cannot take, and the bot runs on without it', async () => {
+    let port: number;
+    ({ port, holder } = await takenPort());
+    web = webServerWith();
+    const started = await startWebServer(web.app, { host: '127.0.0.1', port }, web.log);
+    expect(started).toBe(false);
+    const failed = web.entries.find((entry) => entry.msg === 'the web server could not start');
+    expect(failed).toMatchObject({ level: 50, host: '127.0.0.1', port });
+    expect((failed?.err as { code?: string }).code).toBe('EADDRINUSE');
+  });
+});
diff --git a/src/web/start.ts b/src/web/start.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3b2c4ffc2ec380557c405e6574b6ac775b4c3682
--- /dev/null
+++ b/src/web/start.ts
@@ -0,0 +1,23 @@
+import type { FastifyInstance } from 'fastify';
+import type { Logger } from '../log.js';
+
+/**
+ * Starts listening (spec 6): a port it cannot take, or an address it cannot listen on, is
+ * logged and answered false, and the bot runs on without its pages. Never throws.
+ */
+export async function startWebServer(
+  app: FastifyInstance,
+  where: { host: string; port: number },
+  log: Logger,
+): Promise<boolean> {
+  try {
+    await app.listen({ host: where.host, port: where.port });
+    const address = app.server.address();
+    const port = address !== null && typeof address === 'object' ? address.port : where.port;
+    log.info({ host: where.host, port }, 'web server listening');
+    return true;
+  } catch (err) {
+    log.error({ err, host: where.host, port: where.port }, 'the web server could not start');
+    return false;
+  }
+}
diff --git a/test/support/web.ts b/test/support/web.ts
new file mode 100644
index 0000000000000000000000000000000000000000..74a9d571e9bc746ceda14620e766086c9a46106f
--- /dev/null
+++ b/test/support/web.ts
@@ -0,0 +1,38 @@
+import type { FastifyInstance } from 'fastify';
+import type { Logger } from 'pino';
+import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
+import { FAKE_GUILD_ID } from './fake-interactions.js';
+import { createTestLogger } from './test-logger.js';
+
+/** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
+export const TEST_WEB: WebSettings = {
+  port: 0,
+  host: '127.0.0.1',
+  publicUrl: 'https://map.example.test',
+  trustProxy: false,
+  tiles: 'osm',
+};
+
+/** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
+export interface TestWeb {
+  app: FastifyInstance;
+  log: Logger;
+  entries: Array<Record<string, unknown>>;
+}
+
+/**
+ * The web server over fakes: the bot is in the server of the fake interactions alone, unless
+ * `servers` says otherwise. Close `app` after the test.
+ */
+export function webServerWith(overrides: Partial<WebDeps> = {}): TestWeb {
+  const { log, entries } = createTestLogger();
+  const app = buildWebServer({
+    settings: TEST_WEB,
+    pictureOrigins: ['https://cdn.leekduck.com'],
+    googleKey: undefined,
+    servers: { has: (guildId) => guildId === FAKE_GUILD_ID },
+    log,
+    ...overrides,
+  });
+  return { app, log, entries };
+}
````

### Task 3: Sessions of the web pages, CSRF and logging out

Prototype commit: `a8653c3feaf6e2ac0fc0c810c595013bc5eac341`

Migration `2026_10_16_015_web_session` (`WebSession`: the cookie's SHA-256, the member, created, last used, expiry); `WebSessionRepository`, `MemoryWebSessions` and the cases both share (`src/web/session-model.ts` holds the types, no Fastify). The cookie `pine_session` (HttpOnly, Secure unless localhost, SameSite=Lax, 30 days from the last use, renewed at most once an hour); a CSRF token by HMAC of the session with a key made at start, and `postGuard` (Origin equal to `publicUrl`, the session, the token) for every POST; `POST /auth/logout`; expired rows swept hourly by the scheduler.

**Files:**

```
 src/app.ts                                            |  13 +++++
 src/db/migrations/2026_10_16_015_web_session.ts       |  37 ++++++++++++
 src/db/migrations/index.ts                            |   2 +
 src/db/migrator.db.test.ts                            |   2 +
 src/db/repositories/web-session-repository.db.test.ts |  38 +++++++++++++
 src/db/repositories/web-session-repository.ts         |  65 +++++++++++++++++++++
 src/db/types.ts                                       |  10 ++++
 src/services/party-scheduler.test.ts                  |  27 +++++++++
 src/services/party-scheduler.ts                       |   9 ++-
 src/web/answers.ts                                    |  48 ++++++++++++++++
 src/web/auth-routes.ts                                |  19 +++++++
 src/web/csrf.ts                                       |  22 ++++++++
 src/web/guild-routes.ts                               |  27 +++++++++
 src/web/server.ts                                     |  63 +++++----------------
 src/web/session-model.ts                              |  33 +++++++++++
 src/web/sessions.test.ts                              | 178 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/sessions.ts                                   | 144 +++++++++++++++++++++++++++++++++++++++++++++++
 test/support/web-session-cases.ts                     |  69 +++++++++++++++++++++++
 test/support/web-sessions.test.ts                     |   7 +++
 test/support/web-sessions.ts                          |  38 +++++++++++++
 test/support/web.ts                                   |  36 +++++++++++-
 21 files changed, 834 insertions(+), 53 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/services/party-scheduler.test.ts src/web/server.test.ts src/web/sessions.test.ts test/support/web-sessions.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/web-session-repository.db.test.ts src/db/migrator.db.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/db/migrations/2026_10_16_015_web_session.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/web-session-repository.db.test.ts src/db/repositories/web-session-repository.ts src/db/types.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/web/answers.ts src/web/auth-routes.ts src/web/csrf.ts src/web/guild-routes.ts src/web/server.ts src/web/session-model.ts src/web/sessions.test.ts src/web/sessions.ts test/support/web-session-cases.ts test/support/web-sessions.test.ts test/support/web-sessions.ts test/support/web.ts` and `npx eslint src/app.ts src/db/migrations/2026_10_16_015_web_session.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/web-session-repository.db.test.ts src/db/repositories/web-session-repository.ts src/db/types.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/web/answers.ts src/web/auth-routes.ts src/web/csrf.ts src/web/guild-routes.ts src/web/server.ts src/web/session-model.ts src/web/sessions.test.ts src/web/sessions.ts test/support/web-session-cases.ts test/support/web-sessions.test.ts test/support/web-sessions.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff a8653c3feaf6e2ac0fc0c810c595013bc5eac341 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Sessions of the web pages, CSRF and logging out`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/db/migrations/2026_10_16_015_web_session.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/web-session-repository.db.test.ts src/db/repositories/web-session-repository.ts src/db/types.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/web/answers.ts src/web/auth-routes.ts src/web/csrf.ts src/web/guild-routes.ts src/web/server.ts src/web/session-model.ts src/web/sessions.test.ts src/web/sessions.ts test/support/web-session-cases.ts test/support/web-sessions.test.ts test/support/web-sessions.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index e018e68808c74093caf67f51c3b73f08061a8858..dd0991d4abc81800bb3ae9b3682f9613765390f0 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -27,6 +27,7 @@ import { SpawnReportRepository } from './db/repositories/spawn-report-repository
 import { UnownGiftRepository } from './db/repositories/unown-gift-repository.js';
 import { UserRepository } from './db/repositories/user-repository.js';
 import { WayfarerRepository } from './db/repositories/wayfarer-repository.js';
+import { WebSessionRepository } from './db/repositories/web-session-repository.js';
 import type { DB } from './db/types.js';
 import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
@@ -86,6 +87,7 @@ import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
+import { Sessions } from './web/sessions.js';
 import { startWebServer } from './web/start.js';
 
 /** Parsed game data is kept here between runs, so the bot can start while offline. */
@@ -399,6 +401,13 @@ export async function startApp(
       ),
     log,
   });
+  // The sessions of the web pages, kept in the database; swept hourly with the upkeep.
+  const webSessions =
+    config.settings.web &&
+    new Sessions({
+      store: new WebSessionRepository(db),
+      secure: config.settings.web.publicUrl.startsWith('https:'),
+    });
   const scheduler = new PartyScheduler({
     store: parties,
     posts: partyService,
@@ -409,6 +418,7 @@ export async function startApp(
     pictures: maps,
     screenshots: screenshotStore,
     emoji: appEmoji,
+    webSessions,
     lines,
     gateway: partyGateway,
     raidBosses,
@@ -623,11 +633,14 @@ export async function startApp(
   let webClosed = false;
   const web =
     webSettings &&
+    webSessions &&
     buildWebServer({
       settings: webSettings,
       pictureOrigins: pictureOrigins(config.settings.raidEggPicturesUrl),
       googleKey: config.env.GOOGLE_MAPS_BROWSER_KEY,
       servers: { has: (guildId) => client.guilds.cache.has(guildId) },
+      sessions: webSessions,
+      now: () => Date.now(),
       log,
     });
   if (web && webSettings) {
diff --git a/src/db/migrations/2026_10_16_015_web_session.ts b/src/db/migrations/2026_10_16_015_web_session.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d9c1aa5fc075c3ed7e9278fc6c8e8ae09afb03a0
--- /dev/null
+++ b/src/db/migrations/2026_10_16_015_web_session.ts
@@ -0,0 +1,37 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * The sessions of the web pages (plan 8M-1; spec `2026-10-15-web-map-region-editor-design`,
+ * 2.4): a member who logged in with Discord or through a link of `/maps` is known by a cookie.
+ *
+ * `WebSession` is one row per session: its `id` is the hex SHA-256 of the cookie's value (the
+ * value itself is never stored), `userId` the member's snowflake, `userName` their name when
+ * they logged in (the page's header). Times are epoch milliseconds: a session lasts 30 days
+ * from `lastUsedAt` (`expiresAt`), renewed at most hourly; the hourly upkeep deletes expired
+ * rows (by `expiresAt`). Nothing else refers to a session.
+ *
+ * 015: this plan's (014 is 8W-1R's); renumbered at a merge if another branch took it first.
+ *
+ * Safe to run again after a failure half-way: the table is created only when it is missing.
+ */
+export const webSession: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists WebSession (
+        id char(64) not null,
+        userId varchar(30) not null,
+        userName varchar(100) not null,
+        createdAt bigint not null,
+        lastUsedAt bigint not null,
+        expiresAt bigint not null,
+        primary key (id),
+        key websession_expiresat_index (expiresAt),
+        key websession_userid_index (userId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 1f5af80fa344bfa49daddba50b1cc6bdf5e64b65..61b1c338cfc89fe01b888fa11883a178ab95c9f9 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -14,6 +14,7 @@ import { regionChannelUnique } from './2026_10_13_011_region_channel_unique.js';
 import { wayfarer } from './2026_10_15_012_wayfarer.js';
 import { savedRouteAtEnd } from './2026_10_16_013_saved_route_at_end.js';
 import { gymLookups } from './2026_10_16_014_gym_lookups.js';
+import { webSession } from './2026_10_16_015_web_session.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -35,4 +36,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_15_012_wayfarer': wayfarer,
   '2026_10_16_013_saved_route_at_end': savedRouteAtEnd,
   '2026_10_16_014_gym_lookups': gymLookups,
+  '2026_10_16_015_web_session': webSession,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 94da33438aa709a1147c51604b34903b0f400012..b76d033650245ba064b04e92d6dc5bc6d05bb9ed 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -37,6 +37,7 @@ const ADDED_TABLES = [
   'GymReview',
   'GymLookup',
   'GymLookupDay',
+  'WebSession',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -147,6 +148,7 @@ describe('runMigrations', () => {
       '2026_10_15_012_wayfarer',
       '2026_10_16_013_saved_route_at_end',
       '2026_10_16_014_gym_lookups',
+      '2026_10_16_015_web_session',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/web-session-repository.db.test.ts b/src/db/repositories/web-session-repository.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8c9914947e9e280cc83921b0250039365b5fcd88
--- /dev/null
+++ b/src/db/repositories/web-session-repository.db.test.ts
@@ -0,0 +1,38 @@
+import type { Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import {
+  sessionId,
+  storedSession,
+  webSessionCases,
+} from '../../../test/support/web-session-cases.js';
+import type { DB } from '../types.js';
+import { WebSessionRepository } from './web-session-repository.js';
+
+describe('WebSessionRepository', () => {
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
+  const fresh = async () => {
+    await db.deleteFrom('WebSession').execute();
+    return new WebSessionRepository(db);
+  };
+
+  webSessionCases(fresh);
+
+  it('keeps times beyond 2^31 and a snowflake as written', async () => {
+    const sessions = await fresh();
+    const at = 1_792_000_000_000;
+    await sessions.create(storedSession(sessionId(9), at, '1234567890123456789'));
+    expect(await sessions.find(sessionId(9), at)).toEqual(
+      storedSession(sessionId(9), at, '1234567890123456789'),
+    );
+  });
+});
diff --git a/src/db/repositories/web-session-repository.ts b/src/db/repositories/web-session-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..55df8c293d14cb054a13d9b62a000680ffb11d4f
--- /dev/null
+++ b/src/db/repositories/web-session-repository.ts
@@ -0,0 +1,65 @@
+import type { Kysely } from 'kysely';
+import { SESSION_MS, type WebSession, type WebSessionStore } from '../../web/session-model.js';
+import type { DB } from '../types.js';
+
+/**
+ * The sessions of the web pages, in the table `WebSession` (migration 015), by the SHA-256 of
+ * their cookie. Its twin in memory is `MemoryWebSessions`; both run `webSessionCases`
+ * (`test/support/web-session-cases.ts`).
+ */
+export class WebSessionRepository implements WebSessionStore {
+  constructor(private readonly db: Kysely<DB>) {}
+
+  async create(session: WebSession): Promise<void> {
+    await this.db
+      .insertInto('WebSession')
+      .values({
+        id: session.id,
+        userId: session.userId,
+        userName: session.userName,
+        createdAt: String(session.createdAt),
+        lastUsedAt: String(session.lastUsedAt),
+        expiresAt: String(session.expiresAt),
+      })
+      .execute();
+  }
+
+  async find(id: string, now: number): Promise<WebSession | undefined> {
+    const row = await this.db
+      .selectFrom('WebSession')
+      .selectAll()
+      .where('id', '=', id)
+      .where('expiresAt', '>', String(now))
+      .executeTakeFirst();
+    return (
+      row && {
+        id: row.id,
+        userId: row.userId,
+        userName: row.userName,
+        createdAt: Number(row.createdAt),
+        lastUsedAt: Number(row.lastUsedAt),
+        expiresAt: Number(row.expiresAt),
+      }
+    );
+  }
+
+  async touch(id: string, now: number): Promise<void> {
+    await this.db
+      .updateTable('WebSession')
+      .set({ lastUsedAt: String(now), expiresAt: String(now + SESSION_MS) })
+      .where('id', '=', id)
+      .execute();
+  }
+
+  async remove(id: string): Promise<void> {
+    await this.db.deleteFrom('WebSession').where('id', '=', id).execute();
+  }
+
+  async removeExpired(now: number): Promise<number> {
+    const [result] = await this.db
+      .deleteFrom('WebSession')
+      .where('expiresAt', '<=', String(now))
+      .execute();
+    return Number(result?.numDeletedRows ?? 0);
+  }
+}
diff --git a/src/db/types.ts b/src/db/types.ts
index bf88242061b117186c5797988f8e077c6d6f790b..78cf99e107c4ed6c236e11d67ffc5b0438d836b5 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -291,6 +291,15 @@ export interface WayspotImport {
   startedAt: string | null;
 }
 
+export interface WebSession {
+  createdAt: string;
+  expiresAt: string;
+  id: string;
+  lastUsedAt: string;
+  userId: string;
+  userName: string;
+}
+
 export interface DB {
   Alias: Alias;
   AutoAssignRole: AutoAssignRole;
@@ -320,4 +329,5 @@ export interface DB {
   UnownWantGift: UnownWantGift;
   User: User;
   WayspotImport: WayspotImport;
+  WebSession: WebSession;
 }
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index f4e19463924f333ff301cfa15008c13191a240af..2f4fa844a1404a1484819cd68def04208de735b8 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -670,6 +670,33 @@ describe('PartyScheduler: running', () => {
     await scheduler.whenIdle();
     expect(swept).toBe(1);
   });
+
+  it('has the expired sessions of the web pages deleted with the upkeep', async () => {
+    const made = await reportedRaid();
+    let swept = 0;
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      webSessions: {
+        sweep: () => {
+          swept += 1;
+          return Promise.resolve(0);
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
+    expect(swept).toBe(1);
+  });
 });
 
 /** A second raid that has ended and whose post a late message opened again; gives the post. */
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index f4002e87082597659371ad4a18fa25bdb93b63b7..46e441bf5db40d4bfc4db7490789743cf4dd004c 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -45,6 +45,8 @@ export interface PartySchedulerOptions {
   screenshots?: { sweep(): Promise<unknown> };
   /** The emoji of the bot's application, read anew with the upkeep (`ApplicationEmoji`). */
   emoji?: { refresh(): Promise<unknown> };
+  /** The sessions of the web pages, of which those that expired go with the upkeep. */
+  webSessions?: { sweep(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -218,10 +220,12 @@ export class PartyScheduler {
    * Archives open posts of ended parties, looks after the summaries, takes back the access to
    * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
    * gone, has the spawn reports deleted that no process deleted at their time, and the kept
-   * screenshots that are due, and reads the application's emoji anew: at start and hourly.
+   * screenshots that are due, and the expired sessions of the web pages, and reads the
+   * application's emoji anew: at start and hourly.
    */
   private upkeep(): void {
-    const { posts, access, routes, spawns, pictures, screenshots, emoji, log } = this.options;
+    const { posts, access, routes, spawns, pictures, screenshots, emoji, webSessions, log } =
+      this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -240,6 +244,7 @@ export class PartyScheduler {
       if (pictures) await step(() => pictures.prunePlaces());
       if (screenshots) await step(() => screenshots.sweep());
       if (emoji) await step(() => emoji.refresh());
+      if (webSessions) await step(() => webSessions.sweep());
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
diff --git a/src/web/answers.ts b/src/web/answers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7bf7c9a77fd2850aeec5afa613e4d1cddce608f3
--- /dev/null
+++ b/src/web/answers.ts
@@ -0,0 +1,48 @@
+import type { FastifyReply, FastifyRequest } from 'fastify';
+
+/** What an answer that failed says, by status: a few words, never what went wrong. */
+const FAILURE_WORDS: Readonly<Record<number, string>> = {
+  400: 'Bad request.',
+  403: 'Not allowed.',
+  404: 'Not found.',
+  413: 'Too large.',
+  415: 'Unsupported content.',
+  429: 'Too many requests. Try again in a minute.',
+};
+const FAILED = 'Something went wrong.';
+
+/** Whether an address belongs to the data of the pages, answered in JSON. */
+function isApi(url: string): boolean {
+  return /^\/s\/[^/?]+\/api\//.test(url) || url.startsWith('/api/');
+}
+
+/** Text for HTML: `&`, `<`, `>` and both quotes as entities. */
+export function escapeHtml(text: string): string {
+  return text
+    .replace(/&/g, '&amp;')
+    .replace(/</g, '&lt;')
+    .replace(/>/g, '&gt;')
+    .replace(/"/g, '&quot;')
+    .replace(/'/g, '&#39;');
+}
+
+/** A short page of one sentence: what a failure or an empty address shows. */
+export function shortPage(sentence: string): string {
+  return (
+    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
+    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
+    `<title>Professor Pine</title></head><body><p>${escapeHtml(sentence)}</p></body></html>`
+  );
+}
+
+/** Answers a failure: JSON `{ error }` for the pages' data, a short page otherwise. */
+export function sendFailure(
+  request: FastifyRequest,
+  reply: FastifyReply,
+  status: number,
+): FastifyReply {
+  const words = FAILURE_WORDS[status] ?? FAILED;
+  void reply.code(status).header('cache-control', 'no-store');
+  if (isApi(request.url)) return reply.send({ error: words });
+  return reply.type('text/html; charset=utf-8').send(shortPage(words));
+}
diff --git a/src/web/auth-routes.ts b/src/web/auth-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8c63a0fcbb5827d6a1cb936cacbbbb96856b3bb6
--- /dev/null
+++ b/src/web/auth-routes.ts
@@ -0,0 +1,19 @@
+import type { FastifyInstance } from 'fastify';
+import { postGuard } from './csrf.js';
+import type { WebDeps } from './server.js';
+
+/**
+ * The addresses of logging in and out (`/auth/…`, spec 2.4). Logging out deletes the session
+ * and its cookie; it is a POST of Pine's own pages (`postGuard`).
+ */
+export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
+  const { sessions, settings } = deps;
+  app.post(
+    '/auth/logout',
+    { preHandler: postGuard(sessions, settings.publicUrl) },
+    async (request, reply) => {
+      await sessions.end(request, reply);
+      return reply.code(204).header('cache-control', 'no-store').send();
+    },
+  );
+}
diff --git a/src/web/csrf.ts b/src/web/csrf.ts
new file mode 100644
index 0000000000000000000000000000000000000000..72c784cfacb95129aa8a5410dff371669ff02ed5
--- /dev/null
+++ b/src/web/csrf.ts
@@ -0,0 +1,22 @@
+import type { FastifyReply, FastifyRequest } from 'fastify';
+import { sendFailure } from './answers.js';
+import type { Sessions } from './sessions.js';
+
+/** The header a page sends its session's CSRF token in. */
+export const CSRF_HEADER = 'x-pine-csrf';
+
+/**
+ * The guard of every POST (spec 5), as a `preHandler`: the request must come from Pine's own
+ * pages (`Origin` equal to `publicUrl`) and carry the CSRF token of its session; anything else
+ * is refused with 403 before the handler runs. GETs change nothing and need none of it.
+ */
+export function postGuard(sessions: Sessions, publicUrl: string) {
+  return async (request: FastifyRequest, reply: FastifyReply) => {
+    const sent = request.headers[CSRF_HEADER];
+    const session =
+      request.headers.origin === publicUrl ? await sessions.of(request, reply) : undefined;
+    if (!session || !sessions.hasToken(session, typeof sent === 'string' ? sent : undefined)) {
+      return sendFailure(request, reply, 403);
+    }
+  };
+}
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0d477a71fe7df77b47bc46ce1e991fb2a3d47ad0
--- /dev/null
+++ b/src/web/guild-routes.ts
@@ -0,0 +1,27 @@
+import type { FastifyInstance, FastifyRequest } from 'fastify';
+import { isSnowflake } from '../db/snowflake.js';
+import { sendFailure } from './answers.js';
+import type { WebDeps } from './server.js';
+
+/** The request of an address of one server, `/s/<guild>/…`. */
+export type GuildRequest = FastifyRequest<{ Params: { guild: string } }>;
+
+/**
+ * The addresses of one Discord server, `/s/<guild>/…` (spec 2.1): a server the bot is not in,
+ * or no snowflake at all, is not found before anything else is looked at.
+ */
+export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { sessions } = deps;
+  scope.addHook('onRequest', async (request: GuildRequest, reply) => {
+    const { guild } = request.params;
+    if (!isSnowflake(guild) || !deps.servers.has(guild)) return sendFailure(request, reply, 404);
+  });
+
+  // Who is asking: the page's header, and the CSRF token its POSTs carry.
+  scope.get('/api/me', async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return { loggedIn: false };
+    return { loggedIn: true, name: session.userName, csrf: sessions.csrfToken(session) };
+  });
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index 01ca0cfbe7437c444356faccd2131c1edde29a78..dfece6a5d1eb32c5ef9f27da542f625d0a96a375 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -1,9 +1,13 @@
-import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
+import fastifyCookie from '@fastify/cookie';
+import Fastify, { type FastifyInstance } from 'fastify';
 import type { Settings } from '../config/settings.js';
-import { isSnowflake } from '../db/snowflake.js';
 import type { Logger } from '../log.js';
+import { sendFailure, shortPage } from './answers.js';
+import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
+import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
+import type { Sessions } from './sessions.js';
 
 /** `settings.web` once it is set. */
 export type WebSettings = NonNullable<Settings['web']>;
@@ -17,46 +21,14 @@ export interface WebDeps {
   googleKey: string | undefined;
   /** The servers the bot is in (the client's cache): any other is not found. */
   servers: { has(guildId: string): boolean };
+  sessions: Sessions;
+  now: () => number;
   log: Logger;
 }
 
 /** The largest body of any request (spec 5); a route that takes more says so itself. */
 export const BODY_LIMIT = 16 * 1024;
 
-/** What an answer that failed says, by status: a few words, never what went wrong. */
-const FAILURE_WORDS: Readonly<Record<number, string>> = {
-  400: 'Bad request.',
-  403: 'Not allowed.',
-  404: 'Not found.',
-  413: 'Too large.',
-  415: 'Unsupported content.',
-  429: 'Too many requests. Try again in a minute.',
-};
-const FAILED = 'Something went wrong.';
-
-/** Whether an address belongs to the data of the pages, answered in JSON. */
-function isApi(url: string): boolean {
-  return /^\/s\/[^/?]+\/api\//.test(url) || url.startsWith('/api/');
-}
-
-/** A short page of one sentence: what a failure or an empty address shows. */
-export function shortPage(sentence: string): string {
-  const text = sentence.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
-  return (
-    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
-    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
-    `<title>Professor Pine</title></head><body><p>${text}</p></body></html>`
-  );
-}
-
-/** Answers a failure: JSON `{ error }` for the pages' data, a short page otherwise. */
-export function sendFailure(request: FastifyRequest, reply: FastifyReply, status: number) {
-  const words = FAILURE_WORDS[status] ?? FAILED;
-  reply.code(status).header('cache-control', 'no-store');
-  if (isApi(request.url)) return reply.send({ error: words });
-  return reply.type('text/html; charset=utf-8').send(shortPage(words));
-}
-
 /**
  * The web server (spec 2.1): Fastify without its own logger, every request logged at debug by
  * its route pattern (never its address, which may carry a token), the security headers on every
@@ -77,6 +49,7 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
     pictureOrigins: deps.pictureOrigins,
   });
 
+  void app.register(fastifyCookie);
   app.addHook('onSend', async (_request, reply, payload) => {
     reply.headers(headers);
     return payload;
@@ -112,21 +85,13 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
       .type('text/html; charset=utf-8')
       .send(shortPage("Professor Pine's map is at an address of each server: use /maps there.")),
   );
-
+  void app.register((instance, _options, done) => {
+    authRoutes(instance, deps);
+    done();
+  });
   void app.register(
     (scope, _options, done) => {
-      // A server the bot is not in, or no server at all, is not found.
-      scope.addHook(
-        'onRequest',
-        async (request: FastifyRequest<{ Params: { guild: string } }>, reply) => {
-          const { guild } = request.params;
-          if (!isSnowflake(guild) || !deps.servers.has(guild))
-            return sendFailure(request, reply, 404);
-        },
-      );
-      scope.get('/api/me', (_request, reply) =>
-        reply.header('cache-control', 'no-store').send({ loggedIn: false }),
-      );
+      guildRoutes(scope, deps);
       done();
     },
     { prefix: '/s/:guild' },
diff --git a/src/web/session-model.ts b/src/web/session-model.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1a2ab6643584a2bbe5bacb172572da011ac4e199
--- /dev/null
+++ b/src/web/session-model.ts
@@ -0,0 +1,33 @@
+/**
+ * What a session of the web pages is, as stored (spec 2.4): shared by `Sessions` and the stores
+ * (`WebSessionRepository`, `MemoryWebSessions`), with no import of Fastify, so that the
+ * repository layer does not depend on the web server.
+ */
+
+/** A session lasts this long from its last use. */
+export const SESSION_MS = 30 * 24 * 3_600_000;
+
+/** A session as stored: by the SHA-256 of its cookie, never the cookie itself. */
+export interface WebSession {
+  /** The SHA-256 of the cookie value, 64 hex characters. */
+  id: string;
+  /** Who logged in (a snowflake): the session says who the member is, nothing more. */
+  userId: string;
+  /** Their name when they logged in, for the page's header. */
+  userName: string;
+  createdAt: number;
+  lastUsedAt: number;
+  expiresAt: number;
+}
+
+/** Where sessions are kept: `WebSessionRepository`, and `MemoryWebSessions` in tests. */
+export interface WebSessionStore {
+  create(session: WebSession): Promise<void>;
+  /** The session with this id, unless it has expired by `now`. */
+  find(id: string, now: number): Promise<WebSession | undefined>;
+  /** Marks a session used at `now`: it lasts `SESSION_MS` from then. */
+  touch(id: string, now: number): Promise<void>;
+  remove(id: string): Promise<void>;
+  /** Deletes the sessions that expired by `now`; how many. */
+  removeExpired(now: number): Promise<number>;
+}
diff --git a/src/web/sessions.test.ts b/src/web/sessions.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1e989a56139de09b05d9b1beb0def39b4a6cf4db
--- /dev/null
+++ b/src/web/sessions.test.ts
@@ -0,0 +1,178 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { webServerWith, type TestWeb } from '../../test/support/web.js';
+import { SESSION_MS } from './session-model.js';
+import { SESSION_COOKIE, sessionCookie, sessionHash, clearedSessionCookie } from './sessions.js';
+
+const HOUR_MS = 3_600_000;
+const ME = `/s/${FAKE_GUILD_ID}/api/me`;
+
+describe('the session cookie', () => {
+  it('is for the server alone, sent from its own pages and links, for 30 days', () => {
+    expect(sessionCookie(true)).toEqual({
+      httpOnly: true,
+      secure: true,
+      sameSite: 'lax',
+      path: '/',
+      maxAge: SESSION_MS / 1000,
+    });
+    expect(SESSION_MS).toBe(30 * 24 * HOUR_MS);
+    // A public address of this machine in plain http cannot keep a Secure cookie.
+    expect(sessionCookie(false).secure).toBe(false);
+    expect(clearedSessionCookie(true)).toEqual({
+      httpOnly: true,
+      secure: true,
+      sameSite: 'lax',
+      path: '/',
+      maxAge: 0,
+    });
+  });
+
+  it('is stored by the SHA-256 of its value, never the value', () => {
+    expect(sessionHash('abc')).toBe(
+      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
+    );
+  });
+});
+
+describe('sessions on the web server', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('knows who a request with a session is, and nobody without one', async () => {
+    web = webServerWith();
+    const cookie = await web.loggedIn('700000000000000001', 'Ash');
+    const answer = await web.app.inject({ url: ME, headers: { cookie } });
+    expect(answer.json()).toMatchObject({ loggedIn: true, name: 'Ash' });
+    expect((await web.app.inject({ url: ME })).json()).toEqual({ loggedIn: false });
+    const unknown = `${SESSION_COOKIE}=${'A'.repeat(43)}`;
+    expect((await web.app.inject({ url: ME, headers: { cookie: unknown } })).json()).toEqual({
+      loggedIn: false,
+    });
+    const odd = `${SESSION_COOKIE}=not a token`;
+    expect((await web.app.inject({ url: ME, headers: { cookie: odd } })).json()).toEqual({
+      loggedIn: false,
+    });
+  });
+
+  it('keeps a session that is used for 30 days from its last use, renewed at most hourly', async () => {
+    web = webServerWith();
+    const cookie = await web.loggedIn('700000000000000001', 'Ash');
+    const [row] = [...web.sessions.rows.values()];
+    if (!row) throw new Error('no session');
+    const started = row.createdAt;
+
+    web.clock.now = started + HOUR_MS - 1;
+    const soon = await web.app.inject({ url: ME, headers: { cookie } });
+    expect(soon.headers['set-cookie']).toBeUndefined();
+    expect(web.sessions.rows.get(row.id)?.lastUsedAt).toBe(started);
+
+    web.clock.now = started + HOUR_MS;
+    const later = await web.app.inject({ url: ME, headers: { cookie } });
+    expect(later.json()).toMatchObject({ loggedIn: true });
+    expect(String(later.headers['set-cookie'])).toMatch(
+      new RegExp(
+        `^${SESSION_COOKIE}=[\\w-]{43}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax$`,
+      ),
+    );
+    expect(web.sessions.rows.get(row.id)).toMatchObject({
+      lastUsedAt: started + HOUR_MS,
+      expiresAt: started + HOUR_MS + SESSION_MS,
+    });
+
+    web.clock.now = started + HOUR_MS + SESSION_MS;
+    expect((await web.app.inject({ url: ME, headers: { cookie } })).json()).toEqual({
+      loggedIn: false,
+    });
+  });
+
+  it('has the expired sessions deleted by the sweep', async () => {
+    web = webServerWith();
+    await web.loggedIn('700000000000000001', 'Ash');
+    web.clock.now += SESSION_MS;
+    await web.loggedIn('700000000000000002', 'Misty');
+    expect(await web.sessionService.sweep()).toBe(1);
+    expect([...web.sessions.rows.values()].map((row) => row.userName)).toEqual(['Misty']);
+  });
+});
+
+describe('logging out', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  /** A logged-in member and what a page of theirs sends with a POST. */
+  async function member(made: TestWeb) {
+    const cookie = await made.loggedIn('700000000000000001', 'Ash');
+    const me = (await made.app.inject({ url: ME, headers: { cookie } })).json<{ csrf: string }>();
+    return { cookie, csrf: me.csrf, origin: 'https://map.example.test' };
+  }
+
+  it('deletes the session and the cookie', async () => {
+    web = webServerWith();
+    const { cookie, csrf, origin } = await member(web);
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: '/auth/logout',
+      headers: { cookie, origin, 'x-pine-csrf': csrf },
+    });
+    expect(answer.statusCode).toBe(204);
+    expect(String(answer.headers['set-cookie'])).toMatch(
+      new RegExp(`^${SESSION_COOKIE}=; Max-Age=0; Path=/`),
+    );
+    expect(web.sessions.rows.size).toBe(0);
+    expect((await web.app.inject({ url: ME, headers: { cookie } })).json()).toEqual({
+      loggedIn: false,
+    });
+  });
+
+  it('refuses a request from another page, or without the token of the session', async () => {
+    web = webServerWith();
+    const { cookie, csrf, origin } = await member(web);
+    const altered = `${csrf.slice(0, -1)}${csrf.endsWith('A') ? 'B' : 'A'}`;
+    const refused = [
+      { cookie, 'x-pine-csrf': csrf },
+      { cookie, origin: 'https://evil.example.test', 'x-pine-csrf': csrf },
+      { cookie, origin: 'https://map.example.test.evil.test', 'x-pine-csrf': csrf },
+      { cookie, origin },
+      { cookie, origin, 'x-pine-csrf': altered },
+      { cookie, origin, 'x-pine-csrf': 'short' },
+      { origin, 'x-pine-csrf': csrf },
+    ];
+    for (const headers of refused) {
+      const answer = await web.app.inject({ method: 'POST', url: '/auth/logout', headers });
+      expect(answer.statusCode, JSON.stringify(headers)).toBe(403);
+    }
+    expect(web.sessions.rows.size).toBe(1);
+  });
+
+  it("refuses another session's token", async () => {
+    web = webServerWith();
+    const { cookie, origin } = await member(web);
+    const other = await member(web);
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: '/auth/logout',
+      headers: { cookie, origin, 'x-pine-csrf': other.csrf },
+    });
+    expect(answer.statusCode).toBe(403);
+  });
+
+  it('refuses a body larger than 16 KB', async () => {
+    web = webServerWith();
+    const { cookie, csrf, origin } = await member(web);
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: '/auth/logout',
+      headers: { cookie, origin, 'x-pine-csrf': csrf, 'content-type': 'application/json' },
+      payload: JSON.stringify({ text: 'x'.repeat(17 * 1024) }),
+    });
+    expect(answer.statusCode).toBe(413);
+    expect(web.sessions.rows.size).toBe(1);
+  });
+});
diff --git a/src/web/sessions.ts b/src/web/sessions.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c034340801de70d03deacb1f9f6626f6e5c357c8
--- /dev/null
+++ b/src/web/sessions.ts
@@ -0,0 +1,144 @@
+import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
+import type { CookieSerializeOptions } from '@fastify/cookie';
+import type { FastifyReply, FastifyRequest } from 'fastify';
+import { SESSION_MS, type WebSession, type WebSessionStore } from './session-model.js';
+
+/** The cookie that carries a session (spec 2.4). */
+export const SESSION_COOKIE = 'pine_session';
+/** A session in use is renewed (its row written, its cookie sent anew) at most this often. */
+export const RENEW_MS = 3_600_000;
+/** The longest name kept with a session (`WebSession.userName`, varchar(100)). */
+const NAME_LENGTH = 100;
+/** A session's cookie value: 32 random bytes, base64url. */
+const TOKEN = /^[A-Za-z0-9_-]{43}$/;
+
+/** A random token of 32 bytes, base64url: a session's cookie, a login link. */
+export function randomToken(): string {
+  return randomBytes(32).toString('base64url');
+}
+
+/** How a token is kept: the hex SHA-256 of it. */
+export function sessionHash(token: string): string {
+  return createHash('sha256').update(token).digest('hex');
+}
+
+/**
+ * The attributes of the session cookie: never read by a script, sent only over https (unless
+ * the public address is this machine's in plain http), sent along when a member follows a link
+ * to Pine from elsewhere but not with another site's requests, for 30 days.
+ */
+export function sessionCookie(secure: boolean): CookieSerializeOptions {
+  return { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_MS / 1000 };
+}
+
+/** The session cookie's attributes when it is deleted. */
+export function clearedSessionCookie(secure: boolean): CookieSerializeOptions {
+  return { ...sessionCookie(secure), maxAge: 0 };
+}
+
+/** Compares two texts in a time that does not depend on where they differ. */
+export function sameText(a: string, b: string): boolean {
+  const left = Buffer.from(a);
+  const right = Buffer.from(b);
+  return left.length === right.length && timingSafeEqual(left, right);
+}
+
+export interface SessionsOptions {
+  store: WebSessionStore;
+  /** Whether cookies are `Secure` (the public address is https). */
+  secure: boolean;
+  now?: () => number;
+  /** The key of the CSRF tokens; made at start by default. */
+  csrfKey?: Buffer;
+}
+
+/**
+ * The sessions of the web pages (spec 2.4): started by a login, read from the cookie of a
+ * request (once per request), renewed at most hourly, ended by logging out, swept hourly. The
+ * CSRF token of a session is an HMAC of its id under a key made at start: a restart only makes
+ * open pages ask for it again.
+ */
+export class Sessions {
+  readonly secure: boolean;
+  private readonly now: () => number;
+  private readonly csrfKey: Buffer;
+  /** What a request's cookie stood for, read once per request. */
+  private readonly read = new WeakMap<FastifyRequest, Promise<WebSession | undefined>>();
+
+  constructor(private readonly options: SessionsOptions) {
+    this.secure = options.secure;
+    this.now = options.now ?? (() => Date.now());
+    this.csrfKey = options.csrfKey ?? randomBytes(32);
+  }
+
+  /** Starts a session for a member; gives the cookie value to send. */
+  async create(user: { id: string; name: string }): Promise<string> {
+    const token = randomToken();
+    const now = this.now();
+    await this.options.store.create({
+      id: sessionHash(token),
+      userId: user.id,
+      userName: [...user.name].slice(0, NAME_LENGTH).join(''),
+      createdAt: now,
+      lastUsedAt: now,
+      expiresAt: now + SESSION_MS,
+    });
+    return token;
+  }
+
+  /** Starts a session and sends its cookie with the answer. */
+  async start(reply: FastifyReply, user: { id: string; name: string }): Promise<void> {
+    const token = await this.create(user);
+    void reply.setCookie(SESSION_COOKIE, token, sessionCookie(this.secure));
+  }
+
+  /**
+   * The session of a request, or undefined: no cookie, one that is no token, one no session has
+   * (any more). A session last renewed an hour ago or more is renewed, its cookie sent anew.
+   */
+  of(request: FastifyRequest, reply: FastifyReply): Promise<WebSession | undefined> {
+    let session = this.read.get(request);
+    if (!session) {
+      session = this.lookUp(request, reply);
+      this.read.set(request, session);
+    }
+    return session;
+  }
+
+  private async lookUp(
+    request: FastifyRequest,
+    reply: FastifyReply,
+  ): Promise<WebSession | undefined> {
+    const token = request.cookies[SESSION_COOKIE];
+    if (token === undefined || !TOKEN.test(token)) return undefined;
+    const now = this.now();
+    const session = await this.options.store.find(sessionHash(token), now);
+    if (!session) return undefined;
+    if (now - session.lastUsedAt < RENEW_MS) return session;
+    await this.options.store.touch(session.id, now);
+    void reply.setCookie(SESSION_COOKIE, token, sessionCookie(this.secure));
+    return { ...session, lastUsedAt: now, expiresAt: now + SESSION_MS };
+  }
+
+  /** Ends the session of a request, if any, and deletes its cookie. */
+  async end(request: FastifyRequest, reply: FastifyReply): Promise<void> {
+    const session = await this.of(request, reply);
+    if (session) await this.options.store.remove(session.id);
+    void reply.setCookie(SESSION_COOKIE, '', clearedSessionCookie(this.secure));
+  }
+
+  /** The CSRF token of a session: what its pages send with every POST (`X-Pine-CSRF`). */
+  csrfToken(session: Pick<WebSession, 'id'>): string {
+    return createHmac('sha256', this.csrfKey).update(session.id).digest('base64url');
+  }
+
+  /** Whether a request carries the CSRF token of its session. */
+  hasToken(session: Pick<WebSession, 'id'>, sent: string | undefined): boolean {
+    return sent !== undefined && sameText(sent, this.csrfToken(session));
+  }
+
+  /** Deletes the sessions that have expired; how many. */
+  sweep(): Promise<number> {
+    return this.options.store.removeExpired(this.now());
+  }
+}
diff --git a/test/support/web-session-cases.ts b/test/support/web-session-cases.ts
new file mode 100644
index 0000000000000000000000000000000000000000..31d806065bd45a8b5318c816c5f918250c8d2847
--- /dev/null
+++ b/test/support/web-session-cases.ts
@@ -0,0 +1,69 @@
+import { expect, it } from 'vitest';
+import { SESSION_MS, type WebSession, type WebSessionStore } from '../../src/web/session-model.js';
+
+const DAY_MS = 86_400_000;
+
+/** A session as `Sessions.start` writes one: made at `at`, good for 30 days. */
+export function storedSession(id: string, at: number, userId = '700000000000000001'): WebSession {
+  return {
+    id,
+    userId,
+    userName: 'Ash',
+    createdAt: at,
+    lastUsedAt: at,
+    expiresAt: at + SESSION_MS,
+  };
+}
+
+/** A session id as stored: 64 hex characters (the SHA-256 of the cookie). */
+export function sessionId(n: number): string {
+  return n.toString(16).padStart(64, '0');
+}
+
+/**
+ * What the sessions of the web pages do, run against the repository and its twin in memory
+ * alike. `made` gives a fresh, empty store.
+ */
+export function webSessionCases(made: () => Promise<WebSessionStore>): void {
+  it('finds a session by its id until it expires', async () => {
+    const store = await made();
+    const session = storedSession(sessionId(1), 1_000);
+    await store.create(session);
+    expect(await store.find(sessionId(1), 2_000)).toEqual(session);
+    expect(await store.find(sessionId(2), 2_000)).toBeUndefined();
+    expect(await store.find(sessionId(1), session.expiresAt - 1)).toEqual(session);
+    expect(await store.find(sessionId(1), session.expiresAt)).toBeUndefined();
+  });
+
+  it('keeps names as they were given, accents and emoji too', async () => {
+    const store = await made();
+    const session = { ...storedSession(sessionId(3), 1_000), userName: 'Zoë 🌲 <b>' };
+    await store.create(session);
+    expect((await store.find(sessionId(3), 2_000))?.userName).toBe('Zoë 🌲 <b>');
+  });
+
+  it('renews a session for 30 days from its use', async () => {
+    const store = await made();
+    await store.create(storedSession(sessionId(1), 1_000));
+    const later = 1_000 + 20 * DAY_MS;
+    await store.touch(sessionId(1), later);
+    expect(await store.find(sessionId(1), later + 25 * DAY_MS)).toMatchObject({
+      createdAt: 1_000,
+      lastUsedAt: later,
+      expiresAt: later + SESSION_MS,
+    });
+  });
+
+  it('removes one session, and those that expired', async () => {
+    const store = await made();
+    await store.create(storedSession(sessionId(1), 1_000));
+    await store.create(storedSession(sessionId(2), 1_000, '700000000000000002'));
+    await store.create(storedSession(sessionId(3), 40 * DAY_MS));
+    await store.remove(sessionId(1));
+    expect(await store.find(sessionId(1), 2_000)).toBeUndefined();
+    expect(await store.removeExpired(35 * DAY_MS)).toBe(1);
+    expect(await store.find(sessionId(2), 2_000)).toBeUndefined();
+    expect(await store.find(sessionId(3), 41 * DAY_MS)).toBeDefined();
+    expect(await store.removeExpired(35 * DAY_MS)).toBe(0);
+  });
+}
diff --git a/test/support/web-sessions.test.ts b/test/support/web-sessions.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d2d6e7f3f011df77d864d4511a22c1f752bee9df
--- /dev/null
+++ b/test/support/web-sessions.test.ts
@@ -0,0 +1,7 @@
+import { describe } from 'vitest';
+import { webSessionCases } from './web-session-cases.js';
+import { MemoryWebSessions } from './web-sessions.js';
+
+describe('MemoryWebSessions', () => {
+  webSessionCases(() => Promise.resolve(new MemoryWebSessions()));
+});
diff --git a/test/support/web-sessions.ts b/test/support/web-sessions.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cf17b35579dd0698c403f4cf1d613daf92e7ac5c
--- /dev/null
+++ b/test/support/web-sessions.ts
@@ -0,0 +1,38 @@
+import { SESSION_MS, type WebSession, type WebSessionStore } from '../../src/web/session-model.js';
+
+/** The sessions of the web pages in memory: the twin of `WebSessionRepository`. */
+export class MemoryWebSessions implements WebSessionStore {
+  readonly rows = new Map<string, WebSession>();
+
+  create(session: WebSession): Promise<void> {
+    this.rows.set(session.id, { ...session });
+    return Promise.resolve();
+  }
+
+  find(id: string, now: number): Promise<WebSession | undefined> {
+    const row = this.rows.get(id);
+    return Promise.resolve(row && row.expiresAt > now ? { ...row } : undefined);
+  }
+
+  touch(id: string, now: number): Promise<void> {
+    const row = this.rows.get(id);
+    if (row) this.rows.set(id, { ...row, lastUsedAt: now, expiresAt: now + SESSION_MS });
+    return Promise.resolve();
+  }
+
+  remove(id: string): Promise<void> {
+    this.rows.delete(id);
+    return Promise.resolve();
+  }
+
+  removeExpired(now: number): Promise<number> {
+    let removed = 0;
+    for (const [id, row] of this.rows) {
+      if (row.expiresAt <= now) {
+        this.rows.delete(id);
+        removed += 1;
+      }
+    }
+    return Promise.resolve(removed);
+  }
+}
diff --git a/test/support/web.ts b/test/support/web.ts
index 74a9d571e9bc746ceda14620e766086c9a46106f..3c1d3d45baafce94e049752b4aff66b26c0029c2 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -1,8 +1,10 @@
 import type { FastifyInstance } from 'fastify';
 import type { Logger } from 'pino';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
+import { SESSION_COOKIE, Sessions } from '../../src/web/sessions.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
 import { createTestLogger } from './test-logger.js';
+import { MemoryWebSessions } from './web-sessions.js';
 
 /** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
 export const TEST_WEB: WebSettings = {
@@ -13,26 +15,56 @@ export const TEST_WEB: WebSettings = {
   tiles: 'osm',
 };
 
+/** The time the web tests start at (2026-10-16 12:00 UTC); move `clock.now` to pass time. */
+export const WEB_START = Date.UTC(2026, 9, 16, 12);
+
 /** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
 export interface TestWeb {
   app: FastifyInstance;
   log: Logger;
   entries: Array<Record<string, unknown>>;
+  clock: { now: number };
+  /** The stored sessions. */
+  sessions: MemoryWebSessions;
+  sessionService: Sessions;
+  /** Starts a session for somebody, as a login does; gives the `cookie` header that carries it. */
+  loggedIn(userId: string, name: string): Promise<string>;
 }
 
 /**
  * The web server over fakes: the bot is in the server of the fake interactions alone, unless
- * `servers` says otherwise. Close `app` after the test.
+ * `servers` says otherwise; sessions in memory, on a clock of the test's. Close `app` after the
+ * test.
  */
 export function webServerWith(overrides: Partial<WebDeps> = {}): TestWeb {
   const { log, entries } = createTestLogger();
+  const clock = { now: WEB_START };
+  const sessions = new MemoryWebSessions();
+  const sessionService = new Sessions({
+    store: sessions,
+    secure: TEST_WEB.publicUrl.startsWith('https:'),
+    now: () => clock.now,
+  });
   const app = buildWebServer({
     settings: TEST_WEB,
     pictureOrigins: ['https://cdn.leekduck.com'],
     googleKey: undefined,
     servers: { has: (guildId) => guildId === FAKE_GUILD_ID },
+    sessions: sessionService,
+    now: () => clock.now,
     log,
     ...overrides,
   });
-  return { app, log, entries };
+  return {
+    app,
+    log,
+    entries,
+    clock,
+    sessions,
+    sessionService,
+    async loggedIn(userId, name) {
+      const token = await sessionService.create({ id: userId, name });
+      return `${SESSION_COOKIE}=${token}`;
+    },
+  };
 }
````

### Task 4: Log in with Discord or a link of the bot

Prototype commit: `a1d2b985f7be3ea46fc846ab6e1f82582ed46bef`

OAuth2 with the scope `identify` through an injectable `OAuthGateway` (the real one on `fetch`, tested against a fake): `state` in a short-lived cookie with the page to return to, checked at `/auth/callback`; `next` and every redirect only a local `/s/<snowflake>/…` path (`localPath`). Login links (`LoginLinks`: hashed in memory, five minutes, single use): `GET /auth/link/<guild>/<token>` answers a "Continue" page whose form POSTs to the same address; only the POST (Origin checked) redeems the link and starts the session; a used or expired link lands on the map with "This login link has expired". A new login ends the browser's old session. `GET /s/<guild>/api/me`; the auth routes limited per address; codes, tokens and query strings never logged.

**Files:**

```
 src/app.ts                    |  17 ++++
 src/web/answers.ts            |  23 ++++-
 src/web/auth-routes.ts        | 145 ++++++++++++++++++++++++++++++--
 src/web/discord-oauth.test.ts | 105 +++++++++++++++++++++++
 src/web/discord-oauth.ts      | 107 ++++++++++++++++++++++++
 src/web/guild-routes.ts       |  24 +++++-
 src/web/local-path.test.ts    |  39 +++++++++
 src/web/local-path.ts         |  16 ++++
 src/web/login-links.test.ts   |  44 ++++++++++
 src/web/login-links.ts        |  45 ++++++++++
 src/web/login.test.ts         | 374 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/server.ts             |   9 ++
 src/web/sessions.ts           |  16 +++-
 test/support/web.ts           |  82 ++++++++++++++++--
 14 files changed, 1028 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/web/discord-oauth.test.ts src/web/local-path.test.ts src/web/login-links.test.ts src/web/login.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/web/answers.ts src/web/auth-routes.ts src/web/discord-oauth.test.ts src/web/discord-oauth.ts src/web/guild-routes.ts src/web/local-path.test.ts src/web/local-path.ts src/web/login-links.test.ts src/web/login-links.ts src/web/login.test.ts src/web/server.ts src/web/sessions.ts test/support/web.ts` and `npx eslint src/app.ts src/web/answers.ts src/web/auth-routes.ts src/web/discord-oauth.test.ts src/web/discord-oauth.ts src/web/guild-routes.ts src/web/local-path.test.ts src/web/local-path.ts src/web/login-links.test.ts src/web/login-links.ts src/web/login.test.ts src/web/server.ts src/web/sessions.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff a1d2b985f7be3ea46fc846ab6e1f82582ed46bef -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Log in with Discord or a link of the bot`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/web/answers.ts src/web/auth-routes.ts src/web/discord-oauth.test.ts src/web/discord-oauth.ts src/web/guild-routes.ts src/web/local-path.test.ts src/web/local-path.ts src/web/login-links.test.ts src/web/login-links.ts src/web/login.test.ts src/web/server.ts src/web/sessions.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index dd0991d4abc81800bb3ae9b3682f9613765390f0..f68314b39933762d063c42723bd118f05595249c 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -87,6 +87,8 @@ import { StaticMaps } from './services/static-maps.js';
 import { createShutdown } from './shutdown.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
+import { DiscordOAuth } from './web/discord-oauth.js';
+import { LoginLinks } from './web/login-links.js';
 import { Sessions } from './web/sessions.js';
 import { startWebServer } from './web/start.js';
 
@@ -401,6 +403,8 @@ export async function startApp(
       ),
     log,
   });
+  // The login links `/maps` gives and the web pages redeem, in memory.
+  const loginLinks = new LoginLinks();
   // The sessions of the web pages, kept in the database; swept hourly with the upkeep.
   const webSessions =
     config.settings.web &&
@@ -639,7 +643,20 @@ export async function startApp(
       pictureOrigins: pictureOrigins(config.settings.raidEggPicturesUrl),
       googleKey: config.env.GOOGLE_MAPS_BROWSER_KEY,
       servers: { has: (guildId) => client.guilds.cache.has(guildId) },
+      members,
       sessions: webSessions,
+      // "Log in with Discord" only with the client secret; the links of /maps work without it.
+      oauth: config.env.DISCORD_CLIENT_SECRET
+        ? {
+            appId: config.env.DISCORD_APP_ID,
+            gateway: new DiscordOAuth({
+              appId: config.env.DISCORD_APP_ID,
+              secret: config.env.DISCORD_CLIENT_SECRET,
+              fetch: (url, init) => fetch(url, init),
+            }),
+          }
+        : undefined,
+      loginLinks,
       now: () => Date.now(),
       log,
     });
diff --git a/src/web/answers.ts b/src/web/answers.ts
index 7bf7c9a77fd2850aeec5afa613e4d1cddce608f3..42ffa9c2b4746b886024d5486fecafd5353624e8 100644
--- a/src/web/answers.ts
+++ b/src/web/answers.ts
@@ -26,12 +26,29 @@ export function escapeHtml(text: string): string {
     .replace(/'/g, '&#39;');
 }
 
-/** A short page of one sentence: what a failure or an empty address shows. */
-export function shortPage(sentence: string): string {
+/** A short page of one sentence, and what follows it (HTML of ours). */
+function page(sentence: string, more = ''): string {
   return (
     '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
     '<meta name="viewport" content="width=device-width, initial-scale=1">' +
-    `<title>Professor Pine</title></head><body><p>${escapeHtml(sentence)}</p></body></html>`
+    `<title>Professor Pine</title></head><body><p>${escapeHtml(sentence)}</p>${more}</body></html>`
+  );
+}
+
+/** A short page of one sentence: what a failure or an empty address shows. */
+export function shortPage(sentence: string): string {
+  return page(sentence);
+}
+
+/**
+ * A short page of one sentence and a button that POSTs an empty form to `action` (a path of
+ * Pine's): no script, so that opening an address changes nothing until the member presses it.
+ */
+export function buttonPage(sentence: string, action: string, button: string): string {
+  return page(
+    sentence,
+    `<form method="post" action="${escapeHtml(action)}">` +
+      `<button type="submit">${escapeHtml(button)}</button></form>`,
   );
 }
 
diff --git a/src/web/auth-routes.ts b/src/web/auth-routes.ts
index 8c63a0fcbb5827d6a1cb936cacbbbb96856b3bb6..7cd5aec605e7819c06e1afa9eff3c0a666aedb83 100644
--- a/src/web/auth-routes.ts
+++ b/src/web/auth-routes.ts
@@ -1,19 +1,154 @@
-import type { FastifyInstance } from 'fastify';
+import { randomBytes } from 'node:crypto';
+import type { CookieSerializeOptions } from '@fastify/cookie';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
+import { isSnowflake } from '../db/snowflake.js';
+import { buttonPage, sendFailure } from './answers.js';
+import { addressBucket } from './client-address.js';
 import { postGuard } from './csrf.js';
+import { authorizeUrl } from './discord-oauth.js';
+import { localPath } from './local-path.js';
+import { RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
+import { sameText } from './sessions.js';
+
+/** The cookie that holds the state of a login with Discord, and where it returns to. */
+export const OAUTH_COOKIE = 'pine_oauth';
+/** How long a login with Discord may take, from leaving to coming back. */
+const OAUTH_SECONDS = 600;
+/** The requests to `/auth/…` one address may make in a minute (spec 5). */
+const AUTH_PER_MINUTE = 20;
+/** A state: 16 random bytes, base64url. */
+const STATE = /^[A-Za-z0-9_-]{22}$/;
+
+/** The attributes of the cookie of a login with Discord: for `/auth/` alone, ten minutes. */
+export function oauthCookie(secure: boolean, maxAge = OAUTH_SECONDS): CookieSerializeOptions {
+  return { httpOnly: true, secure, sameSite: 'lax', path: '/auth/', maxAge };
+}
+
+/** The state and the page to return to, as the cookie of a login keeps them. */
+function readOAuthCookie(value: string | undefined): { state: string; next?: string } | undefined {
+  const [state = '', next = ''] = (value ?? '').split('.');
+  if (!STATE.test(state)) return undefined;
+  return { state, next: localPath(Buffer.from(next, 'base64url').toString('utf8')) };
+}
+
+type Query = Record<string, unknown>;
+
+/** The address of a login link: `/auth/link/<guild>/<token>`. */
+interface LinkParams {
+  guild: string;
+  token: string;
+}
 
 /**
- * The addresses of logging in and out (`/auth/…`, spec 2.4). Logging out deletes the session
- * and its cookie; it is a POST of Pine's own pages (`postGuard`).
+ * The addresses of logging in and out (`/auth/…`, spec 2.4), at most `AUTH_PER_MINUTE` a minute
+ * from one address. "Log in with Discord" (only with the client secret): `/auth/login` sends
+ * the member to Discord with a random state, kept with the page to return to in a cookie of ten
+ * minutes; `/auth/callback` checks the state, exchanges the code, asks who the member is and
+ * starts a session; whatever fails returns to the page with `?login=failed`, the cookie
+ * deleted either way. A link of `/maps`, `/auth/link/<guild>/<token>`, shows a page whose
+ * button (a POST of Pine's own page) starts a session once, within five minutes, for its own
+ * server; then the map, without the token. Logging out is a POST of Pine's own pages
+ * (`postGuard`). Neither a code nor a token is ever logged.
  */
 export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
-  const { sessions, settings } = deps;
+  const { sessions, settings, oauth, loginLinks, servers, now, log } = deps;
+  const callbackUrl = `${settings.publicUrl}/auth/callback`;
+  const limiter = new RateLimiter({ uses: AUTH_PER_MINUTE, perMs: 60_000 });
+
+  app.addHook('onRequest', async (request, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const answer = limiter.take(addressBucket(request.ip), now());
+    if (!answer.ok) {
+      void reply.header('retry-after', String(answer.retryAfterSeconds));
+      return sendFailure(request, reply, 429);
+    }
+  });
+
+  app.get('/auth/login', async (request: FastifyRequest<{ Querystring: Query }>, reply) => {
+    if (!oauth) return sendFailure(request, reply, 404);
+    const state = randomBytes(16).toString('base64url');
+    const next = localPath(request.query.next) ?? '';
+    void reply.setCookie(
+      OAUTH_COOKIE,
+      `${state}.${Buffer.from(next).toString('base64url')}`,
+      oauthCookie(sessions.secure),
+    );
+    return reply.redirect(authorizeUrl(oauth.appId, callbackUrl, state), 302);
+  });
+
+  app.get('/auth/callback', async (request: FastifyRequest<{ Querystring: Query }>, reply) => {
+    if (!oauth) return sendFailure(request, reply, 404);
+    const kept = readOAuthCookie(request.cookies[OAUTH_COOKIE]);
+    void reply.setCookie(OAUTH_COOKIE, '', oauthCookie(sessions.secure, 0));
+    const back = kept?.next ?? '/';
+    const failed = (reason: string): FastifyReply => {
+      log.info({ reason }, 'a login with Discord failed');
+      return reply.redirect(`${back}?login=failed`, 302);
+    };
+    const { code, state } = request.query;
+    if (!kept || typeof state !== 'string' || !sameText(state, kept.state)) {
+      return failed('state');
+    }
+    if (typeof code !== 'string' || code === '') return failed('declined');
+    const token = await oauth.gateway.exchange(code, callbackUrl);
+    if ('failed' in token) return failed(`exchange: ${token.failed}`);
+    const user = await oauth.gateway.who(token.accessToken);
+    if ('failed' in user) return failed(`user: ${user.failed}`);
+    await sessions.start(request, reply, user);
+    log.info({ user: user.id }, 'logged in to the web pages with Discord');
+    return reply.redirect(back, 302);
+  });
+
+  // A link of `/maps` (spec 2.4, a GET from Discord's link button) only shows a page whose
+  // button POSTs to the same address: a GET or HEAD (a link preview, a prefetch) uses nothing up.
+  app.get(
+    '/auth/link/:guild/:token',
+    async (request: FastifyRequest<{ Params: LinkParams }>, reply) => {
+      const { guild, token } = request.params;
+      if (!isSnowflake(guild) || !servers.has(guild)) return sendFailure(request, reply, 404);
+      return reply
+        .type('text/html; charset=utf-8')
+        .send(
+          buttonPage(
+            "Open Professor Pine's map of this server, logged in with the link from /maps.",
+            `/auth/link/${guild}/${encodeURIComponent(token)}`,
+            'Continue',
+          ),
+        );
+    },
+  );
+
+  // The page's button: from Pine's own page alone (`Origin`), the link is used up and a
+  // session started (any session the browser had is ended); then the map, without the token.
+  app.addContentTypeParser(
+    'application/x-www-form-urlencoded',
+    { parseAs: 'string' },
+    (_request, _body, done) => {
+      done(null, {});
+    },
+  );
+  app.post(
+    '/auth/link/:guild/:token',
+    async (request: FastifyRequest<{ Params: LinkParams }>, reply) => {
+      const { guild, token } = request.params;
+      if (!isSnowflake(guild) || !servers.has(guild)) return sendFailure(request, reply, 404);
+      if (request.headers.origin !== settings.publicUrl) return sendFailure(request, reply, 403);
+      const map = `/s/${guild}/map`;
+      const holder = loginLinks.redeem(token, now());
+      if (!holder || holder.guildId !== guild) return reply.redirect(`${map}?login=expired`, 303);
+      await sessions.start(request, reply, { id: holder.userId, name: holder.userName });
+      log.info({ user: holder.userId, guild }, 'logged in to the web pages with a link');
+      return reply.redirect(map, 303);
+    },
+  );
+
   app.post(
     '/auth/logout',
     { preHandler: postGuard(sessions, settings.publicUrl) },
     async (request, reply) => {
       await sessions.end(request, reply);
-      return reply.code(204).header('cache-control', 'no-store').send();
+      return reply.code(204).send();
     },
   );
 }
diff --git a/src/web/discord-oauth.test.ts b/src/web/discord-oauth.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..75289e1623d2d5a4ea6b7611b417aa51c7476e68
--- /dev/null
+++ b/src/web/discord-oauth.test.ts
@@ -0,0 +1,105 @@
+import { describe, expect, it } from 'vitest';
+import { authorizeUrl, DiscordOAuth } from './discord-oauth.js';
+
+const APP = '123456789012345678';
+
+/** A fetch that answers from a list and records what was asked. */
+function fakeFetch(...answers: Array<Response | Error>) {
+  const asked: Array<{ url: string; init: RequestInit | undefined }> = [];
+  const fetch = (url: string, init?: RequestInit): Promise<Response> => {
+    asked.push({ url, init });
+    const next = answers.shift();
+    if (next === undefined) return Promise.reject(new Error('nothing more to answer'));
+    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
+  };
+  return { fetch, asked };
+}
+
+const json = (body: unknown, status = 200) =>
+  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
+
+describe('authorizeUrl', () => {
+  it("asks Discord for the member's identity alone, back to Pine's callback", () => {
+    const url = new URL(authorizeUrl(APP, 'https://map.example.test/auth/callback', 'st4te'));
+    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
+    expect(Object.fromEntries(url.searchParams)).toEqual({
+      response_type: 'code',
+      client_id: APP,
+      scope: 'identify',
+      state: 'st4te',
+      redirect_uri: 'https://map.example.test/auth/callback',
+    });
+  });
+});
+
+describe('DiscordOAuth', () => {
+  it('exchanges a code for a token with the application id and secret, form-encoded', async () => {
+    const { fetch, asked } = fakeFetch(json({ access_token: 'tok', token_type: 'Bearer' }));
+    const oauth = new DiscordOAuth({ appId: APP, secret: 's3cret', fetch });
+    expect(await oauth.exchange('the-code', 'https://map.example.test/auth/callback')).toEqual({
+      accessToken: 'tok',
+    });
+    const [call] = asked;
+    expect(call?.url).toBe('https://discord.com/api/v10/oauth2/token');
+    expect(call?.init?.method).toBe('POST');
+    expect(new Headers(call?.init?.headers).get('content-type')).toBe(
+      'application/x-www-form-urlencoded',
+    );
+    expect(typeof call?.init?.body).toBe('string');
+    expect(Object.fromEntries(new URLSearchParams(call?.init?.body as string))).toEqual({
+      grant_type: 'authorization_code',
+      code: 'the-code',
+      redirect_uri: 'https://map.example.test/auth/callback',
+      client_id: APP,
+      client_secret: 's3cret',
+    });
+    expect(call?.init?.signal).toBeInstanceOf(AbortSignal);
+  });
+
+  it('says why an exchange failed, never with the code or the secret', async () => {
+    const cases: Array<Response | Error> = [
+      json({ error: 'invalid_grant' }, 400),
+      json({ token_type: 'Bearer' }),
+      new Response('not json', { status: 200 }),
+      new Error('network down'),
+    ];
+    for (const answer of cases) {
+      const oauth = new DiscordOAuth({
+        appId: APP,
+        secret: 's3cret',
+        fetch: fakeFetch(answer).fetch,
+      });
+      const result = await oauth.exchange('the-code', 'https://map.example.test/auth/callback');
+      expect(result).toEqual({ failed: expect.any(String) as string });
+      expect(JSON.stringify(result)).not.toMatch(/the-code|s3cret/);
+    }
+  });
+
+  it('asks who the token belongs to: the display name, else the user name', async () => {
+    const { fetch, asked } = fakeFetch(
+      json({ id: '700000000000000001', username: 'ash_k', global_name: 'Ash' }),
+      json({ id: '700000000000000002', username: 'misty', global_name: null }),
+    );
+    const oauth = new DiscordOAuth({ appId: APP, secret: 's3cret', fetch });
+    expect(await oauth.who('tok')).toEqual({ id: '700000000000000001', name: 'Ash' });
+    expect(await oauth.who('tok')).toEqual({ id: '700000000000000002', name: 'misty' });
+    expect(asked[0]?.url).toBe('https://discord.com/api/v10/users/@me');
+    expect(new Headers(asked[0]?.init?.headers).get('authorization')).toBe('Bearer tok');
+  });
+
+  it('refuses an answer about somebody that is no member', async () => {
+    for (const answer of [
+      json({ message: '401: Unauthorized' }, 401),
+      json({ id: 'not a snowflake', username: 'x' }),
+      json({ id: '700000000000000001' }),
+      new Error('network down'),
+    ]) {
+      const oauth = new DiscordOAuth({
+        appId: APP,
+        secret: 's3cret',
+        fetch: fakeFetch(answer).fetch,
+      });
+      expect(await oauth.who('tok')).toEqual({ failed: expect.any(String) as string });
+    }
+  });
+});
diff --git a/src/web/discord-oauth.ts b/src/web/discord-oauth.ts
new file mode 100644
index 0000000000000000000000000000000000000000..257f93655ad0acfae7a58d45317fb751c6569618
--- /dev/null
+++ b/src/web/discord-oauth.ts
@@ -0,0 +1,107 @@
+import { isSnowflake } from '../db/snowflake.js';
+
+/** Discord's API, as the OAuth2 exchange and `/users/@me` use it. */
+const API = 'https://discord.com/api/v10';
+/** How long a question to Discord may take. */
+const TIMEOUT_MS = 10_000;
+
+/** Who logged in: a member's id and the name the page's header shows. */
+export interface OAuthUser {
+  id: string;
+  name: string;
+}
+
+/** Discord's side of "Log in with Discord"; `FakeOAuth` in tests. */
+export interface OAuthGateway {
+  /** Exchanges the code of a callback for an access token. */
+  exchange(
+    code: string,
+    redirectUri: string,
+  ): Promise<{ accessToken: string } | { failed: string }>;
+  /** Whose an access token is: their id, and `global_name ?? username`. */
+  who(accessToken: string): Promise<OAuthUser | { failed: string }>;
+}
+
+/**
+ * The address Discord's consent page is at, for the scope `identify` alone (spec 2.4): Pine
+ * learns the member's id and name, nothing else. `prompt` is left to Discord (it skips the
+ * page for a member who agreed before).
+ */
+export function authorizeUrl(appId: string, redirectUri: string, state: string): string {
+  const query = new URLSearchParams({
+    response_type: 'code',
+    client_id: appId,
+    scope: 'identify',
+    state,
+    redirect_uri: redirectUri,
+  });
+  return `https://discord.com/oauth2/authorize?${query.toString()}`;
+}
+
+type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
+
+/**
+ * The real exchange (OAuth2 authorization code flow) with `fetch`: the code for a token
+ * (form-encoded, the application's id and secret in the body), the token for `/users/@me`.
+ * Every failure is an answer saying why in a few words, never with the code, the token or the
+ * secret; the token is used once and not kept.
+ */
+export class DiscordOAuth implements OAuthGateway {
+  constructor(private readonly options: { appId: string; secret: string; fetch: Fetch }) {}
+
+  async exchange(
+    code: string,
+    redirectUri: string,
+  ): Promise<{ accessToken: string } | { failed: string }> {
+    const body = new URLSearchParams({
+      grant_type: 'authorization_code',
+      code,
+      redirect_uri: redirectUri,
+      client_id: this.options.appId,
+      client_secret: this.options.secret,
+    });
+    const answer = await this.ask(`${API}/oauth2/token`, {
+      method: 'POST',
+      headers: { 'content-type': 'application/x-www-form-urlencoded' },
+      body: body.toString(),
+    });
+    if ('failed' in answer) return answer;
+    const token = (answer.json as { access_token?: unknown }).access_token;
+    return typeof token === 'string' && token !== ''
+      ? { accessToken: token }
+      : { failed: 'no access token' };
+  }
+
+  async who(accessToken: string): Promise<OAuthUser | { failed: string }> {
+    const answer = await this.ask(`${API}/users/@me`, {
+      headers: { authorization: `Bearer ${accessToken}` },
+    });
+    if ('failed' in answer) return answer;
+    const user = answer.json as { id?: unknown; username?: unknown; global_name?: unknown };
+    const name =
+      typeof user.global_name === 'string' && user.global_name !== ''
+        ? user.global_name
+        : user.username;
+    if (typeof user.id !== 'string' || !isSnowflake(user.id) || typeof name !== 'string') {
+      return { failed: 'no user in the answer' };
+    }
+    return { id: user.id, name };
+  }
+
+  private async ask(
+    url: string,
+    init: RequestInit,
+  ): Promise<{ json: object } | { failed: string }> {
+    try {
+      const response = await this.options.fetch(url, {
+        ...init,
+        signal: AbortSignal.timeout(TIMEOUT_MS),
+      });
+      if (!response.ok) return { failed: `status ${response.status}` };
+      const json: unknown = await response.json();
+      return typeof json === 'object' && json !== null ? { json } : { failed: 'no object' };
+    } catch (err) {
+      return { failed: err instanceof Error ? err.name : 'failed' };
+    }
+  }
+}
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 0d477a71fe7df77b47bc46ce1e991fb2a3d47ad0..b1df42e9f07d7ebf7d653f7ba6e89ae027c054fa 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -17,11 +17,31 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
     if (!isSnowflake(guild) || !deps.servers.has(guild)) return sendFailure(request, reply, 404);
   });
 
-  // Who is asking: the page's header, and the CSRF token its POSTs carry.
+  // Who is asking (spec 2.5): the page's header, whether they are a member of this server (one
+  // login for every server: membership is asked per server, from Discord, kept a minute by the
+  // directory), and the CSRF token its POSTs carry. When Discord cannot say, the page is
+  // read-only.
   scope.get('/api/me', async (request: GuildRequest, reply) => {
     void reply.header('cache-control', 'no-store');
     const session = await sessions.of(request, reply);
     if (!session) return { loggedIn: false };
-    return { loggedIn: true, name: session.userName, csrf: sessions.csrfToken(session) };
+    let member = false;
+    let readOnly = false;
+    try {
+      member = (await deps.members.find(request.params.guild, session.userId)) !== undefined;
+    } catch (err) {
+      deps.log.warn(
+        { err, guild: request.params.guild, user: session.userId },
+        'could not ask whether somebody on the web pages is a member',
+      );
+      readOnly = true;
+    }
+    return {
+      loggedIn: true,
+      name: session.userName,
+      member,
+      csrf: sessions.csrfToken(session),
+      readOnly,
+    };
   });
 }
diff --git a/src/web/local-path.test.ts b/src/web/local-path.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e5ee4ea20394838d7001becc9c345dbb01e3822
--- /dev/null
+++ b/src/web/local-path.test.ts
@@ -0,0 +1,39 @@
+import { describe, expect, it } from 'vitest';
+import { localPath } from './local-path.js';
+
+describe('localPath', () => {
+  it("takes a path of a server's pages", () => {
+    for (const path of [
+      '/s/412345678901234567/map',
+      '/s/412345678901234567/regions/edit',
+      '/s/412345678901234567/',
+    ]) {
+      expect(localPath(path), path).toBe(path);
+    }
+  });
+
+  it('refuses anything that could lead elsewhere, or nowhere of ours', () => {
+    for (const path of [
+      undefined,
+      '',
+      '/',
+      'https://evil.example.test/s/412345678901234567/map',
+      '//evil.example.test/s/412345678901234567/map',
+      '/\\evil.example.test',
+      '/s//evil.example.test',
+      '/s/412345678901234567//evil.example.test',
+      '/s/412345678901234567/map\\..\\x',
+      '/s/412345678901234567/map?next=//evil',
+      '/s/412345678901234567/map#x',
+      '/s/abc/map',
+      '/auth/login',
+      '/s/412345678901234567/../../auth/logout',
+      '/s/412345678901234567/%2F%2Fevil',
+      '/s/412345678901234567/map\nSet-Cookie: x',
+      `/s/412345678901234567/${'a'.repeat(300)}`,
+      ['/s/412345678901234567/map'],
+    ]) {
+      expect(localPath(path), JSON.stringify(path)).toBeUndefined();
+    }
+  });
+});
diff --git a/src/web/local-path.ts b/src/web/local-path.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d4a74201965d30cee9dee2b65032c59edc11fa32
--- /dev/null
+++ b/src/web/local-path.ts
@@ -0,0 +1,16 @@
+/**
+ * A page of a server here: `/s/<snowflake>`, then segments of letters, digits, `.`, `_`, `~`
+ * and `-` (no `..`), no query, no fragment, at most 200 characters.
+ */
+const SERVER_PAGE = /^\/s\/\d{15,20}(?:\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~-]+)*\/?$/;
+const MAX_LENGTH = 200;
+
+/**
+ * The path a login may return to (`next`), or undefined: only a page of a server here, never
+ * an address that a browser would take to another site (`//host`, `/\host`, a scheme) or
+ * anything with a query, an escape or a line break in it. An open redirect is a finding.
+ */
+export function localPath(path: unknown): string | undefined {
+  if (typeof path !== 'string' || path.length > MAX_LENGTH) return undefined;
+  return SERVER_PAGE.test(path) ? path : undefined;
+}
diff --git a/src/web/login-links.test.ts b/src/web/login-links.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4ce59ca4828e0516f879f6f450e7dc8b8ae6c26e
--- /dev/null
+++ b/src/web/login-links.test.ts
@@ -0,0 +1,44 @@
+import { describe, expect, it } from 'vitest';
+import { LINK_MS, LoginLinks } from './login-links.js';
+
+const GUILD = '412345678901234567';
+const ASH = '700000000000000001';
+
+describe('LoginLinks', () => {
+  it('gives a link of 256 random bits that logs its member in once', () => {
+    const links = new LoginLinks();
+    const token = links.issue(GUILD, ASH, 'Ash', 0);
+    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
+    expect(links.issue(GUILD, ASH, 'Ash', 0)).not.toBe(token);
+    expect(links.redeem(token, 1_000)).toEqual({ guildId: GUILD, userId: ASH, userName: 'Ash' });
+    expect(links.redeem(token, 1_000)).toBeUndefined();
+  });
+
+  it('is good for five minutes', () => {
+    const links = new LoginLinks();
+    expect(LINK_MS).toBe(5 * 60_000);
+    const fresh = links.issue(GUILD, ASH, 'Ash', 0);
+    const stale = links.issue(GUILD, ASH, 'Ash', 0);
+    expect(links.redeem(fresh, LINK_MS - 1)).toBeDefined();
+    expect(links.redeem(stale, LINK_MS)).toBeUndefined();
+  });
+
+  it('keeps only the hash of a link, and knows nothing of another token', () => {
+    const links = new LoginLinks();
+    const token = links.issue(GUILD, ASH, 'Ash', 0);
+    const altered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
+    expect(links.redeem(altered, 0)).toBeUndefined();
+    expect(links.redeem('', 0)).toBeUndefined();
+    expect(JSON.stringify(links)).not.toContain(token);
+  });
+
+  it('remembers a bounded number of links, the oldest going first', () => {
+    const links = new LoginLinks(2);
+    const first = links.issue(GUILD, ASH, 'Ash', 0);
+    const second = links.issue(GUILD, ASH, 'Ash', 0);
+    const third = links.issue(GUILD, ASH, 'Ash', 0);
+    expect(links.redeem(first, 0)).toBeUndefined();
+    expect(links.redeem(second, 0)).toBeDefined();
+    expect(links.redeem(third, 0)).toBeDefined();
+  });
+});
diff --git a/src/web/login-links.ts b/src/web/login-links.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fa4f7a31ffb19300070747846f4b57bce4314a3d
--- /dev/null
+++ b/src/web/login-links.ts
@@ -0,0 +1,45 @@
+import { BoundedMap } from '../bounded-map.js';
+import { randomToken, sessionHash } from './sessions.js';
+
+/** How long a login link is good for (spec 2.4). */
+export const LINK_MS = 5 * 60_000;
+/** How many links are kept at most; the oldest go first. */
+const LINKS = 10_000;
+
+/** Whom a login link logs in, and for which server. */
+export interface LinkHolder {
+  guildId: string;
+  userId: string;
+  userName: string;
+}
+
+/**
+ * The links `/maps` gives (spec 2.4): 256 random bits, good for five minutes and once, tied to
+ * the member and the server; kept in memory by their SHA-256 alone, so a restart only expires
+ * them. Opening one starts a session as logging in with Discord does.
+ */
+export class LoginLinks {
+  private readonly links: BoundedMap<string, LinkHolder & { expiresAt: number }>;
+
+  constructor(max = LINKS) {
+    this.links = new BoundedMap(max);
+  }
+
+  /** A new link's token for a member of a server, issued at `now`. */
+  issue(guildId: string, userId: string, userName: string, now: number): string {
+    this.links.dropWhile((link) => link.expiresAt <= now);
+    const token = randomToken();
+    this.links.set(sessionHash(token), { guildId, userId, userName, expiresAt: now + LINK_MS });
+    return token;
+  }
+
+  /** Whom a link logs in; undefined for one that is unknown, used or expired. Used up by this. */
+  redeem(token: string, now: number): LinkHolder | undefined {
+    const hash = sessionHash(token);
+    const link = this.links.get(hash);
+    if (!link) return undefined;
+    this.links.delete(hash);
+    if (link.expiresAt <= now) return undefined;
+    return { guildId: link.guildId, userId: link.userId, userName: link.userName };
+  }
+}
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..77107b0082e8ef3af0785cc16b575e3018d7da12
--- /dev/null
+++ b/src/web/login.test.ts
@@ -0,0 +1,374 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import {
+  cookieOf,
+  FakeOAuth,
+  setCookies,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { SESSION_COOKIE } from './sessions.js';
+
+const ASH = '700000000000000001';
+const MAP = `/s/${FAKE_GUILD_ID}/map`;
+const ME = `/s/${FAKE_GUILD_ID}/api/me`;
+
+describe('logging in with Discord', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  /** Starts a login from the map; gives the state Discord is sent and the cookie that holds it. */
+  async function started(made: TestWeb, next = MAP) {
+    const answer = await made.app.inject({
+      url: `/auth/login?next=${encodeURIComponent(next)}`,
+    });
+    expect(answer.statusCode).toBe(302);
+    const location = new URL(String(answer.headers.location));
+    return {
+      state: location.searchParams.get('state') ?? '',
+      cookie: cookieOf(answer, 'pine_oauth'),
+      answer,
+      location,
+    };
+  }
+
+  it('sends the member to Discord for their identity, with a state in a short-lived cookie', async () => {
+    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
+    const { state, location, answer } = await started(web);
+    expect(location.origin + location.pathname).toBe('https://discord.com/oauth2/authorize');
+    expect(location.searchParams.get('scope')).toBe('identify');
+    expect(location.searchParams.get('client_id')).toBe('123456789012345678');
+    expect(location.searchParams.get('redirect_uri')).toBe(
+      'https://map.example.test/auth/callback',
+    );
+    expect(state).toMatch(/^[A-Za-z0-9_-]{22}$/);
+    const [cookie] = setCookies(answer);
+    expect(cookie).toMatch(
+      /^pine_oauth=[^;]+; Max-Age=600; Path=\/auth\/; HttpOnly; Secure; SameSite=Lax$/,
+    );
+  });
+
+  it('starts a session when Discord sends the member back, and returns to the page', async () => {
+    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
+    web = webServerWith({ oauth, members: new FakeMemberDirectory().add(ASH, 'Ash Ketchum') });
+    const { state, cookie } = await started(web);
+    const back = await web.app.inject({
+      url: `/auth/callback?code=good-code&state=${state}`,
+      headers: { cookie },
+    });
+    expect(back.statusCode).toBe(302);
+    expect(back.headers.location).toBe(MAP);
+    expect(setCookies(back)).toContainEqual(
+      expect.stringMatching(/^pine_oauth=; Max-Age=0; Path=\/auth\//),
+    );
+    const session = cookieOf(back, SESSION_COOKIE);
+    const me = await web.app.inject({ url: ME, headers: { cookie: session } });
+    expect(me.json()).toMatchObject({ loggedIn: true, name: 'Ash', member: true, readOnly: false });
+    expect(oauth.exchanged).toEqual([
+      { code: 'good-code', redirectUri: 'https://map.example.test/auth/callback' },
+    ]);
+    // Never the code in the log.
+    expect(JSON.stringify(web.entries)).not.toContain('good-code');
+  });
+
+  it('refuses a callback whose state is not the one it sent, and asks Discord nothing', async () => {
+    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
+    web = webServerWith({ oauth });
+    const { state, cookie } = await started(web);
+    const refused = [
+      { url: `/auth/callback?code=good-code&state=${state}x`, headers: { cookie } },
+      { url: `/auth/callback?code=good-code&state=${state}`, headers: {} },
+      { url: '/auth/callback?code=good-code', headers: { cookie } },
+      {
+        url: `/auth/callback?code=good-code&state=${state}`,
+        headers: { cookie: 'pine_oauth=garbage' },
+      },
+    ];
+    for (const request of refused) {
+      const answer = await web.app.inject(request);
+      expect(answer.statusCode, request.url).toBe(302);
+      expect(String(answer.headers.location), request.url).toMatch(/\?login=failed$/);
+      expect(setCookies(answer).some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(false);
+    }
+    expect(oauth.exchanged).toEqual([]);
+    expect(web.sessions.rows.size).toBe(0);
+  });
+
+  it('says the login failed when Discord refuses, or the member declined', async () => {
+    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
+    oauth.whoFails = true;
+    web = webServerWith({ oauth });
+    for (const query of ['code=bad-code', 'code=good-code', 'error=access_denied']) {
+      const { state, cookie } = await started(web);
+      const answer = await web.app.inject({
+        url: `/auth/callback?${query}&state=${state}`,
+        headers: { cookie },
+      });
+      expect(answer.headers.location, query).toBe(`${MAP}?login=failed`);
+    }
+    expect(web.sessions.rows.size).toBe(0);
+    expect(JSON.stringify(web.entries)).not.toMatch(/bad-code|good-code/);
+  });
+
+  it('never sends the member anywhere but a page of a server here', async () => {
+    const oauth = new FakeOAuth().knows('good-code', { id: ASH, name: 'Ash' });
+    web = webServerWith({ oauth });
+    for (const next of [
+      '//evil.example.test/',
+      'https://evil.example.test/',
+      '/\\evil.example.test',
+    ]) {
+      const { state, cookie } = await started(web, next);
+      const answer = await web.app.inject({
+        url: `/auth/callback?code=good-code&state=${state}`,
+        headers: { cookie },
+      });
+      expect(answer.headers.location, next).toBe('/');
+    }
+  });
+
+  it('is not offered without the client secret', async () => {
+    web = webServerWith({ oauth: undefined });
+    expect((await web.app.inject({ url: `/auth/login?next=${MAP}` })).statusCode).toBe(404);
+    expect((await web.app.inject({ url: '/auth/callback?code=x&state=y' })).statusCode).toBe(404);
+  });
+});
+
+describe('login links', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  /** Presses Continue on the page of a link: a form's POST from Pine's own page, empty. */
+  const pressContinue = (made: TestWeb, url: string, headers: Record<string, string> = {}) =>
+    made.app.inject({
+      method: 'POST',
+      url,
+      headers: {
+        origin: 'https://map.example.test',
+        'content-type': 'application/x-www-form-urlencoded',
+        ...headers,
+      },
+      payload: '',
+    });
+
+  it('open a page that asks to continue, and log nobody in by GET or HEAD', async () => {
+    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
+    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
+    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
+    for (const method of ['GET', 'HEAD'] as const) {
+      const opened = await web.app.inject({ method, url });
+      expect(opened.statusCode, method).toBe(200);
+      expect(opened.headers['content-type'], method).toMatch(/^text\/html/);
+      expect(setCookies(opened), method).toEqual([]);
+    }
+    const page = (await web.app.inject({ url })).body;
+    expect(page).toContain(`<form method="post" action="${url}">`);
+    expect(page).toContain('<button type="submit">Continue</button>');
+    expect(page).not.toContain('<script');
+    expect(page).not.toContain('Ash');
+    expect(web.sessions.rows.size).toBe(0);
+    // The link is still good.
+    expect((await pressContinue(web, url)).headers.location).toBe(MAP);
+  });
+
+  it('escape what the address carries on the page', async () => {
+    web = webServerWith();
+    const page = await web.app.inject({
+      url: `/auth/link/${FAKE_GUILD_ID}/${encodeURIComponent('"><script>alert(1)</script>')}`,
+    });
+    expect(page.statusCode).toBe(200);
+    expect(page.body).not.toContain('<script');
+    expect(page.body).toContain(`action="/auth/link/${FAKE_GUILD_ID}/%22%3E%3Cscript%3E`);
+  });
+
+  it('log the member in once when the page continues, and lead to the map without the token', async () => {
+    web = webServerWith({ members: new FakeMemberDirectory().add(ASH, 'Ash') });
+    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
+    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
+    const first = await pressContinue(web, url);
+    expect(first.statusCode).toBe(303);
+    expect(first.headers.location).toBe(MAP);
+    const session = cookieOf(first, SESSION_COOKIE);
+    const me = await web.app.inject({ url: ME, headers: { cookie: session } });
+    expect(me.json()).toMatchObject({ loggedIn: true, name: 'Ash', member: true });
+    const again = await pressContinue(web, url);
+    expect(again.statusCode).toBe(303);
+    expect(again.headers.location).toBe(`${MAP}?login=expired`);
+    expect(setCookies(again)).toEqual([]);
+    expect(JSON.stringify(web.entries)).not.toContain(token);
+  });
+
+  it('are used only from a page of Pine', async () => {
+    web = webServerWith();
+    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
+    const url = `/auth/link/${FAKE_GUILD_ID}/${token}`;
+    for (const origin of ['https://evil.example.test', 'null', '']) {
+      const refused = await pressContinue(web, url, { origin });
+      expect(refused.statusCode, origin).toBe(403);
+    }
+    const noOrigin = await web.app.inject({ method: 'POST', url });
+    expect(noOrigin.statusCode).toBe(403);
+    expect(web.sessions.rows.size).toBe(0);
+    expect((await pressContinue(web, url)).headers.location).toBe(MAP);
+  });
+
+  it('end the session the browser had before', async () => {
+    web = webServerWith();
+    const before = await web.loggedIn('700000000000000002', 'Misty');
+    const token = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
+    const answer = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${token}`, {
+      cookie: before,
+    });
+    expect(answer.headers.location).toBe(MAP);
+    expect([...web.sessions.rows.values()].map((row) => row.userName)).toEqual(['Ash']);
+    const old = await web.app.inject({ url: ME, headers: { cookie: before } });
+    expect(old.json()).toEqual({ loggedIn: false });
+  });
+
+  it('expire after five minutes, and count only for their own server', async () => {
+    web = webServerWith();
+    const late = web.loginLinks.issue(FAKE_GUILD_ID, ASH, 'Ash', web.clock.now);
+    const elsewhere = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
+    web.clock.now += 5 * 60_000;
+    const answer = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${late}`);
+    expect(answer.headers.location).toBe(`${MAP}?login=expired`);
+    web.clock.now -= 5 * 60_000;
+    const wrong = await pressContinue(web, `/auth/link/${FAKE_GUILD_ID}/${elsewhere}`);
+    expect(wrong.headers.location).toBe(`${MAP}?login=expired`);
+    expect(web.sessions.rows.size).toBe(0);
+  });
+
+  it('of a server the bot is not in are not found', async () => {
+    web = webServerWith();
+    const token = web.loginLinks.issue('412345678901234999', ASH, 'Ash', web.clock.now);
+    for (const url of [`/auth/link/412345678901234999/${token}`, `/auth/link/abc/${token}`]) {
+      expect((await web.app.inject({ url })).statusCode, url).toBe(404);
+      expect((await pressContinue(web, url)).statusCode, url).toBe(404);
+    }
+  });
+});
+
+describe('who is asking', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('is a member of the server or not, asked anew for each server', async () => {
+    const members = new FakeMemberDirectory().add(ASH, 'Ash');
+    web = webServerWith({
+      members,
+      servers: { has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999' },
+    });
+    const cookie = await web.loggedIn(ASH, 'Ash');
+    const here = (await web.app.inject({ url: ME, headers: { cookie } })).json<object>();
+    expect(here).toEqual({
+      loggedIn: true,
+      name: 'Ash',
+      member: true,
+      readOnly: false,
+      csrf: expect.any(String) as string,
+    });
+    const there = await web.app.inject({
+      url: '/s/412345678901234999/api/me',
+      headers: { cookie },
+    });
+    expect(there.json()).toMatchObject({ loggedIn: true, member: false, readOnly: false });
+    expect(members.asked).toEqual([`${FAKE_GUILD_ID}:${ASH}`, `412345678901234999:${ASH}`]);
+  });
+
+  it('is read-only when Discord cannot say whether they are a member', async () => {
+    const members = new FakeMemberDirectory().add(ASH, 'Ash');
+    members.failing = new Error('Discord is away');
+    web = webServerWith({ members });
+    const cookie = await web.loggedIn(ASH, 'Ash');
+    const me = await web.app.inject({ url: ME, headers: { cookie } });
+    expect(me.statusCode).toBe(200);
+    expect(me.json()).toMatchObject({ loggedIn: true, member: false, readOnly: true });
+  });
+
+  it('asks Discord nothing about somebody who is not logged in', async () => {
+    const members = new FakeMemberDirectory();
+    web = webServerWith({ members });
+    expect((await web.app.inject({ url: ME })).json()).toEqual({ loggedIn: false });
+    expect(members.asked).toEqual([]);
+  });
+});
+
+describe('the rate of logins', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('is at most 20 a minute per address', async () => {
+    web = webServerWith();
+    const ask = (remoteAddress: string) =>
+      web?.app.inject({ url: `/auth/link/${FAKE_GUILD_ID}/x`, remoteAddress });
+    for (let i = 0; i < 20; i += 1) expect((await ask('203.0.113.7'))?.statusCode).toBe(200);
+    const refused = await ask('203.0.113.7');
+    expect(refused?.statusCode).toBe(429);
+    expect(refused?.headers['retry-after']).toBe('60');
+    expect((await ask('203.0.113.8'))?.statusCode).toBe(200);
+    web.clock.now += 60_000;
+    expect((await ask('203.0.113.7'))?.statusCode).toBe(200);
+  });
+
+  /** Asks for a login link from a peer, with the headers a proxy or a visitor may send. */
+  const askFrom = (made: TestWeb, peer: string, headers: Record<string, string> = {}) =>
+    made.app.inject({ url: `/auth/link/${FAKE_GUILD_ID}/x`, remoteAddress: peer, headers });
+
+  it('counts by the visitor a trusted tunnel names last in X-Forwarded-For', async () => {
+    const made = webServerWith({ web: { trustProxy: true } });
+    web = made;
+    // What the visitor wrote in the header themselves comes first, and is not believed.
+    const forwarded = (spoofed: string) => ({ 'x-forwarded-for': `${spoofed}, 198.51.100.1` });
+    for (let i = 0; i < 20; i += 1) {
+      expect((await askFrom(made, '127.0.0.1', forwarded(`6.6.6.${i}`))).statusCode).toBe(200);
+    }
+    expect((await askFrom(made, '127.0.0.1', forwarded('6.6.6.6'))).statusCode).toBe(429);
+    const other = { 'x-forwarded-for': '6.6.6.6, 198.51.100.2' };
+    expect((await askFrom(made, '127.0.0.1', other)).statusCode).toBe(200);
+  });
+
+  it('counts by the peer when the peer is no nearby proxy, whatever it forwards', async () => {
+    const made = webServerWith({ web: { trustProxy: true } });
+    web = made;
+    for (let i = 0; i < 20; i += 1) {
+      const headers = { 'x-forwarded-for': `6.6.6.6, 198.51.100.${i}` };
+      expect((await askFrom(made, '203.0.113.7', headers)).statusCode).toBe(200);
+    }
+    const headers = { 'x-forwarded-for': '6.6.6.6, 198.51.100.99' };
+    expect((await askFrom(made, '203.0.113.7', headers)).statusCode).toBe(429);
+  });
+
+  it('believes no CF-Connecting-IP, even from a nearby peer', async () => {
+    const made = webServerWith({ web: { trustProxy: true } });
+    web = made;
+    for (let i = 0; i < 20; i += 1) {
+      const headers = { 'cf-connecting-ip': `198.51.100.${i}` };
+      expect((await askFrom(made, '127.0.0.1', headers)).statusCode).toBe(200);
+    }
+    const headers = { 'cf-connecting-ip': '198.51.100.99' };
+    expect((await askFrom(made, '127.0.0.1', headers)).statusCode).toBe(429);
+  });
+
+  it('counts the addresses of one IPv6 /64 together', async () => {
+    const made = webServerWith();
+    web = made;
+    for (let i = 0; i < 20; i += 1) {
+      expect((await askFrom(made, `2001:db8:1:2::${i + 1}`)).statusCode).toBe(200);
+    }
+    expect((await askFrom(made, '2001:db8:1:2:ffff::1')).statusCode).toBe(429);
+    expect((await askFrom(made, '2001:db8:1:3::1')).statusCode).toBe(200);
+  });
+});
diff --git a/src/web/server.ts b/src/web/server.ts
index dfece6a5d1eb32c5ef9f27da542f625d0a96a375..881450ca79235e468fcbf3cd9620ecca0771dccf 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -1,12 +1,15 @@
 import fastifyCookie from '@fastify/cookie';
 import Fastify, { type FastifyInstance } from 'fastify';
 import type { Settings } from '../config/settings.js';
+import type { MemberDirectory } from '../discord/member-directory.js';
 import type { Logger } from '../log.js';
 import { sendFailure, shortPage } from './answers.js';
 import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
+import type { OAuthGateway } from './discord-oauth.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
+import type { LoginLinks } from './login-links.js';
 import type { Sessions } from './sessions.js';
 
 /** `settings.web` once it is set. */
@@ -21,7 +24,13 @@ export interface WebDeps {
   googleKey: string | undefined;
   /** The servers the bot is in (the client's cache): any other is not found. */
   servers: { has(guildId: string): boolean };
+  /** Whether somebody is a member of a server: asked per request, never kept in a session. */
+  members: Pick<MemberDirectory, 'find'>;
   sessions: Sessions;
+  /** "Log in with Discord": the application and Discord's side; undefined without the secret. */
+  oauth: { appId: string; gateway: OAuthGateway } | undefined;
+  /** The links of `/maps`, shared with the command. */
+  loginLinks: LoginLinks;
   now: () => number;
   log: Logger;
 }
diff --git a/src/web/sessions.ts b/src/web/sessions.ts
index c034340801de70d03deacb1f9f6626f6e5c357c8..e11bb63a7a738415776ecd8fa1fe3208c8da40e6 100644
--- a/src/web/sessions.ts
+++ b/src/web/sessions.ts
@@ -86,8 +86,20 @@ export class Sessions {
     return token;
   }
 
-  /** Starts a session and sends its cookie with the answer. */
-  async start(reply: FastifyReply, user: { id: string; name: string }): Promise<void> {
+  /**
+   * Starts a session and sends its cookie with the answer. The session the request's cookie
+   * stood for, if any, is deleted first: a browser holds one session, and a login over another
+   * leaves no row behind that the old cookie could still use.
+   */
+  async start(
+    request: FastifyRequest,
+    reply: FastifyReply,
+    user: { id: string; name: string },
+  ): Promise<void> {
+    const current = request.cookies[SESSION_COOKIE];
+    if (current !== undefined && TOKEN.test(current)) {
+      await this.options.store.remove(sessionHash(current));
+    }
     const token = await this.create(user);
     void reply.setCookie(SESSION_COOKIE, token, sessionCookie(this.secure));
   }
diff --git a/test/support/web.ts b/test/support/web.ts
index 3c1d3d45baafce94e049752b4aff66b26c0029c2..dfe2f1f43463483ac567867ba4e52458e0c8a392 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -1,8 +1,13 @@
+import type { OutgoingHttpHeaders } from 'node:http';
 import type { FastifyInstance } from 'fastify';
 import type { Logger } from 'pino';
+import type { MemberDirectory } from '../../src/discord/member-directory.js';
+import type { OAuthGateway, OAuthUser } from '../../src/web/discord-oauth.js';
+import { LoginLinks } from '../../src/web/login-links.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
 import { SESSION_COOKIE, Sessions } from '../../src/web/sessions.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
+import { FakeMemberDirectory } from './members.js';
 import { createTestLogger } from './test-logger.js';
 import { MemoryWebSessions } from './web-sessions.js';
 
@@ -15,9 +20,67 @@ export const TEST_WEB: WebSettings = {
   tiles: 'osm',
 };
 
+/** The application id of the tests' environment (`TEST_ENV.DISCORD_APP_ID`). */
+export const TEST_APP_ID = '123456789012345678';
+
 /** The time the web tests start at (2026-10-16 12:00 UTC); move `clock.now` to pass time. */
 export const WEB_START = Date.UTC(2026, 9, 16, 12);
 
+/**
+ * Discord's side of a login, for tests: the codes it knows and whose they are. `exchanged`
+ * records every exchange; `whoFails` makes the question who a token is fail.
+ */
+export class FakeOAuth implements OAuthGateway {
+  readonly exchanged: Array<{ code: string; redirectUri: string }> = [];
+  whoFails = false;
+  private readonly codes = new Map<string, OAuthUser>();
+
+  /** A code Discord would give for this member. */
+  knows(code: string, user: OAuthUser): this {
+    this.codes.set(code, user);
+    return this;
+  }
+
+  exchange(code: string, redirectUri: string) {
+    this.exchanged.push({ code, redirectUri });
+    return Promise.resolve(
+      this.codes.has(code) ? { accessToken: `token:${code}` } : { failed: 'status 400' },
+    );
+  }
+
+  who(accessToken: string) {
+    const user = this.codes.get(accessToken.replace(/^token:/, ''));
+    if (this.whoFails || !user) return Promise.resolve({ failed: 'status 401' });
+    return Promise.resolve({ ...user });
+  }
+}
+
+/** The `Set-Cookie` headers of an answer of `inject`, as one list. */
+export function setCookies(answer: { headers: OutgoingHttpHeaders }): string[] {
+  const value = answer.headers['set-cookie'];
+  if (value === undefined) return [];
+  return Array.isArray(value) ? value : [String(value)];
+}
+
+/** The cookie an answer sets, by name: `name=value`, for the next request's `cookie` header. */
+export function cookieOf(answer: { headers: OutgoingHttpHeaders }, name: string): string {
+  const found = setCookies(answer).find((cookie) => cookie.startsWith(`${name}=`));
+  if (!found) throw new Error(`no ${name} cookie`);
+  return found.split(';')[0] ?? '';
+}
+
+/** What a test may change of the web server it builds. */
+export interface WebTestOptions {
+  /** Changes of `TEST_WEB`. */
+  web?: Partial<WebSettings>;
+  servers?: WebDeps['servers'];
+  /** The members of servers; nobody is a member of anything by default. */
+  members?: Pick<MemberDirectory, 'find'>;
+  /** Discord's side of a login (a `FakeOAuth` by default); undefined: no client secret. */
+  oauth?: OAuthGateway | undefined;
+  googleKey?: string;
+}
+
 /** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
 export interface TestWeb {
   app: FastifyInstance;
@@ -27,6 +90,7 @@ export interface TestWeb {
   /** The stored sessions. */
   sessions: MemoryWebSessions;
   sessionService: Sessions;
+  loginLinks: LoginLinks;
   /** Starts a session for somebody, as a login does; gives the `cookie` header that carries it. */
   loggedIn(userId: string, name: string): Promise<string>;
 }
@@ -36,24 +100,29 @@ export interface TestWeb {
  * `servers` says otherwise; sessions in memory, on a clock of the test's. Close `app` after the
  * test.
  */
-export function webServerWith(overrides: Partial<WebDeps> = {}): TestWeb {
+export function webServerWith(options: WebTestOptions = {}): TestWeb {
   const { log, entries } = createTestLogger();
   const clock = { now: WEB_START };
+  const settings = { ...TEST_WEB, ...options.web };
   const sessions = new MemoryWebSessions();
   const sessionService = new Sessions({
     store: sessions,
-    secure: TEST_WEB.publicUrl.startsWith('https:'),
+    secure: settings.publicUrl.startsWith('https:'),
     now: () => clock.now,
   });
+  const loginLinks = new LoginLinks();
+  const gateway = 'oauth' in options ? options.oauth : new FakeOAuth();
   const app = buildWebServer({
-    settings: TEST_WEB,
+    settings,
     pictureOrigins: ['https://cdn.leekduck.com'],
-    googleKey: undefined,
-    servers: { has: (guildId) => guildId === FAKE_GUILD_ID },
+    googleKey: options.googleKey,
+    servers: options.servers ?? { has: (guildId) => guildId === FAKE_GUILD_ID },
+    members: options.members ?? new FakeMemberDirectory(),
     sessions: sessionService,
+    oauth: gateway && { appId: TEST_APP_ID, gateway },
+    loginLinks,
     now: () => clock.now,
     log,
-    ...overrides,
   });
   return {
     app,
@@ -62,6 +131,7 @@ export function webServerWith(overrides: Partial<WebDeps> = {}): TestWeb {
     clock,
     sessions,
     sessionService,
+    loginLinks,
     async loggedIn(userId, name) {
       const token = await sessionService.create({ id: userId, name });
       return `${SESSION_COOKIE}=${token}`;
````

### Task 5: The regions and gyms of a server, for the map

Prototype commit: `238c455011f7d1e063102b0a3e12c31b97e52591`

Pure `src/domain/web/geo-view.ts`: the server's regions (named by their channels, outlines) and the gyms in them (name, nickname, regions, address line, description, notice, elite), coordinates to six decimals. `GymDirectory` and `RegionDirectory` count a `generation`; `src/web/geo-cache.ts` keeps one view per server with a strong ETag, built again when a generation, the server or a channel name changed. `GET /s/<guild>/api/geo` (public; 304 for a matching `If-None-Match`, weak or in a list); `/api/geo` and `/api/me` limited per address.

**Files:**

```
 src/app.ts                            |   2 ++
 src/domain/web/geo-view.test.ts       | 105 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/web/geo-view.ts            | 115 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/gym-directory.test.ts    |  19 +++++++++++
 src/services/gym-directory.ts         |  15 ++++++++-
 src/services/region-directory.test.ts |  15 +++++++++
 src/services/region-directory.ts      |  10 ++++++
 src/web/auth-routes.ts                |  13 +++-----
 src/web/geo-cache.ts                  |  82 ++++++++++++++++++++++++++++++++++++++++++++++
 src/web/geo.test.ts                   | 133 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/guild-routes.ts               |  76 ++++++++++++++++++++++++++++--------------
 src/web/rate-limit.ts                 |  16 +++++++++
 src/web/server.ts                     |   3 ++
 test/support/web.ts                   |  47 ++++++++++++++++++++++++++
 14 files changed, 618 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/domain/web/geo-view.test.ts src/services/gym-directory.test.ts src/services/region-directory.test.ts src/web/geo.test.ts src/web/login.test.ts src/web/sessions.test.ts`, `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/services/gym-directory.db.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/domain/web/geo-view.test.ts src/domain/web/geo-view.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/region-directory.test.ts src/services/region-directory.ts src/web/auth-routes.ts src/web/geo-cache.ts src/web/geo.test.ts src/web/guild-routes.ts src/web/rate-limit.ts src/web/server.ts test/support/web.ts` and `npx eslint src/app.ts src/domain/web/geo-view.test.ts src/domain/web/geo-view.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/region-directory.test.ts src/services/region-directory.ts src/web/auth-routes.ts src/web/geo-cache.ts src/web/geo.test.ts src/web/guild-routes.ts src/web/rate-limit.ts src/web/server.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 238c455011f7d1e063102b0a3e12c31b97e52591 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `The regions and gyms of a server, for the map`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/domain/web/geo-view.test.ts src/domain/web/geo-view.ts src/services/gym-directory.test.ts src/services/gym-directory.ts src/services/region-directory.test.ts src/services/region-directory.ts src/web/auth-routes.ts src/web/geo-cache.ts src/web/geo.test.ts src/web/guild-routes.ts src/web/rate-limit.ts src/web/server.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index f68314b39933762d063c42723bd118f05595249c..a093d80ee0c928dff943b065461417333e18191e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -88,6 +88,7 @@ import { createShutdown } from './shutdown.js';
 import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
 import { DiscordOAuth } from './web/discord-oauth.js';
+import { GeoCache } from './web/geo-cache.js';
 import { LoginLinks } from './web/login-links.js';
 import { Sessions } from './web/sessions.js';
 import { startWebServer } from './web/start.js';
@@ -657,6 +658,7 @@ export async function startApp(
           }
         : undefined,
       loginLinks,
+      geo: new GeoCache({ guilds, regions, gyms, channels: partyGateway }),
       now: () => Date.now(),
       log,
     });
diff --git a/src/domain/web/geo-view.test.ts b/src/domain/web/geo-view.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..61802f82de8f4a1065a0a779fd660e233bf228f3
--- /dev/null
+++ b/src/domain/web/geo-view.test.ts
@@ -0,0 +1,105 @@
+import { describe, expect, it } from 'vitest';
+import {
+  EAST_CHANNEL,
+  testGym,
+  testGyms,
+  testRegions,
+  WEST_CHANNEL,
+} from '../../../test/support/gyms.js';
+import { geoView, type GeoInput } from './geo-view.js';
+
+/** The invented server: West and East (and a region without an outline), its gyms by box. */
+function input(more: Partial<GeoInput> = {}): GeoInput {
+  const regions = testRegions();
+  const lying = (gym: { lat: number; lon: number }): string[] =>
+    gym.lat < 40 || gym.lat > 40.1
+      ? []
+      : gym.lon < -80
+        ? [WEST_CHANNEL]
+        : gym.lon > -80
+          ? [EAST_CHANNEL]
+          : [WEST_CHANNEL, EAST_CHANNEL];
+  const gyms = testGyms();
+  return {
+    regions,
+    channelNames: new Map([
+      [WEST_CHANNEL, 'west-end'],
+      [EAST_CHANNEL, 'east-side'],
+    ]),
+    gyms,
+    regionsOf: (id) => {
+      const gym = gyms.find((one) => one.id === id);
+      return gym ? lying(gym) : [];
+    },
+    ...more,
+  };
+}
+
+describe('geoView', () => {
+  it('gives the regions with an outline, named by their channels, the outline as [lat, lon]', () => {
+    const view = geoView(input());
+    expect(view.regions.map(({ id, name }) => ({ id, name }))).toEqual([
+      { id: 2, name: 'east-side' },
+      { id: 1, name: 'west-end' },
+    ]);
+    expect(view.regions[1]?.outline).toEqual([
+      [40, -80.1],
+      [40.1, -80.1],
+      [40.1, -80],
+      [40, -80],
+      [40, -80.1],
+    ]);
+  });
+
+  it('names a region whose channel the bot does not see by its number', () => {
+    const view = geoView(input({ channelNames: new Map([[WEST_CHANNEL, 'west-end']]) }));
+    expect(view.regions.map((region) => region.name)).toEqual(['Region 2', 'west-end']);
+  });
+
+  it("gives the gyms in the server's regions, with the regions each lies in", () => {
+    const view = geoView(input());
+    expect(view.gyms.map((gym) => gym.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12]);
+    expect(view.gyms.find((gym) => gym.id === 8)?.regionIds).toEqual([2]);
+    expect(view.gyms.find((gym) => gym.id === 1)).toEqual({
+      id: 1,
+      name: 'Pinewood Public Library',
+      nickname: 'The Stacks',
+      lat: 40.05,
+      lon: -80.05,
+      regionIds: [1],
+      address: '12 Maple Avenue, Pinewood, Pennsylvania 15999',
+      description: 'Mural of readers beside the front doors',
+      notice: null,
+      elite: false,
+    });
+    expect(view.gyms.find((gym) => gym.id === 11)?.notice).toBe('Park closes at dusk');
+  });
+
+  it('leaves out the gyms of no region of the server, and the regions of other servers', () => {
+    const regions = testRegions().map((region) =>
+      region.channelId === EAST_CHANNEL ? { ...region, guildId: 2 } : region,
+    );
+    const view = geoView(input({ regions: regions.filter((region) => region.guildId === 1) }));
+    expect(view.regions.map((region) => region.id)).toEqual([1]);
+    expect(view.gyms.map((gym) => gym.id)).toEqual([1, 2, 3, 4, 5, 6, 11, 12]);
+  });
+
+  it('marks elite raid gyms by either flag, and rounds places to six decimals', () => {
+    const gyms = [
+      testGym(20, 'Tagged', 40.012345678, -80.012345649, { taggedEx: true }),
+      testGym(21, 'Confirmed', 40.02, -80.02, { confirmedEx: true }),
+      testGym(22, 'Plain', 40.03, -80.03),
+    ];
+    const view = geoView(input({ gyms, regionsOf: () => [WEST_CHANNEL] }));
+    expect(view.gyms.map((gym) => [gym.id, gym.elite])).toEqual([
+      [20, true],
+      [21, true],
+      [22, false],
+    ]);
+    expect(view.gyms[0]).toMatchObject({ lat: 40.012346, lon: -80.012346, address: null });
+  });
+
+  it('is empty for a server without regions', () => {
+    expect(geoView(input({ regions: [] }))).toEqual({ regions: [], gyms: [] });
+  });
+});
diff --git a/src/domain/web/geo-view.ts b/src/domain/web/geo-view.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c497bdca7f14488250cbfac154cc7d30c7fbefc4
--- /dev/null
+++ b/src/domain/web/geo-view.ts
@@ -0,0 +1,115 @@
+import { addressLine } from '../geo/google.js';
+import type { LatLon } from '../geo/lat-lon.js';
+import { isEliteGym } from '../party/raid.js';
+
+/**
+ * What the public map of a server shows (spec 3.1, `GET /s/<guild>/api/geo`): its regions,
+ * named by their channels, and the gyms that lie in them. Pure: the caller gives the server's
+ * regions, the names of their channels as the bot sees them, every gym and where each lies.
+ * Gym text is as members wrote it (decoded); the page writes it as text, never as HTML.
+ */
+
+/** What is needed of a region. */
+export interface GeoRegion {
+  id: number;
+  channelId: string;
+  bounds: readonly LatLon[] | null;
+}
+
+/** What is needed of a gym. */
+export interface GeoGym {
+  id: number;
+  name: string;
+  nickname: string | null;
+  lat: number;
+  lon: number;
+  description: string | null;
+  notice: string | null;
+  taggedEx: boolean;
+  confirmedEx: boolean;
+  geodata: string | null;
+}
+
+export interface GeoInput {
+  /** The regions of the server (`Region.guildId` its row), whether or not they have an outline. */
+  regions: readonly GeoRegion[];
+  /** The names of channels by id, as the bot sees them now. */
+  channelNames: ReadonlyMap<string, string>;
+  /** Every gym the bot knows. */
+  gyms: readonly GeoGym[];
+  /** The channels of the regions a gym lies in (`GymProvider.regionsOf`). */
+  regionsOf(gymId: number): readonly string[];
+}
+
+/** A place as the page reads it: `[lat, lon]`, six decimals (about 10 cm). */
+export type Point = [number, number];
+
+export interface GeoView {
+  /** By name. `outline` is closed. */
+  regions: Array<{ id: number; name: string; outline: Point[] }>;
+  /** By id. `regionIds` are those of this server the gym lies in. */
+  gyms: Array<{
+    id: number;
+    name: string;
+    nickname: string | null;
+    lat: number;
+    lon: number;
+    regionIds: number[];
+    /** The address line (`addressLine`), or null when nothing of it is known. */
+    address: string | null;
+    description: string | null;
+    /** What members should know before they go (access, hours). */
+    notice: string | null;
+    /** An elite raid gym (either stored flag, as `isEliteGym`). */
+    elite: boolean;
+  }>;
+}
+
+const round = (value: number): number => Math.round(value * 1e6) / 1e6;
+
+/**
+ * The map of a server: its regions that have an outline (a region whose channel the bot does not
+ * see is named by its number), and the gyms that lie in at least one of them. Gyms that lie in
+ * no region of any server are left out: which server's they are is not cheap to say (8M-1).
+ */
+export function geoView(input: GeoInput): GeoView {
+  const shown = input.regions.filter(
+    (region): region is GeoRegion & { bounds: readonly LatLon[] } => region.bounds !== null,
+  );
+  const byChannel = new Map(shown.map((region) => [region.channelId, region.id]));
+  const regions = shown
+    .map((region) => ({
+      id: region.id,
+      name: input.channelNames.get(region.channelId) ?? `Region ${region.id}`,
+      outline: region.bounds.map((point): Point => [round(point.lat), round(point.lon)]),
+    }))
+    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
+  const gyms = input.gyms
+    .flatMap((gym) => {
+      const regionIds = [
+        ...new Set(
+          input.regionsOf(gym.id).flatMap((channelId) => {
+            const id = byChannel.get(channelId);
+            return id === undefined ? [] : [id];
+          }),
+        ),
+      ].sort((a, b) => a - b);
+      if (regionIds.length === 0) return [];
+      return [
+        {
+          id: gym.id,
+          name: gym.name,
+          nickname: gym.nickname,
+          lat: round(gym.lat),
+          lon: round(gym.lon),
+          regionIds,
+          address: addressLine(gym.geodata) || null,
+          description: gym.description,
+          notice: gym.notice,
+          elite: isEliteGym(gym),
+        },
+      ];
+    })
+    .sort((a, b) => a.id - b.id);
+  return { regions, gyms };
+}
diff --git a/src/services/gym-directory.test.ts b/src/services/gym-directory.test.ts
index 2f2af46bee613a945e08dc6106ac9c46bcfe1568..d602cff56a0c78f5568fde6d77fd49677d4340c4 100644
--- a/src/services/gym-directory.test.ts
+++ b/src/services/gym-directory.test.ts
@@ -193,4 +193,23 @@ describe('GymDirectory', () => {
     all.length = 0;
     expect(service.all()).toHaveLength(testGyms().length);
   });
+
+  it('counts every change, so that what is built from it knows when to build anew', async () => {
+    const { service, state } = directory();
+    const seen = [service.generation];
+    await service.load();
+    seen.push(service.generation);
+    state.gyms = state.gyms.map((gym) => (gym.id === 2 ? { ...gym, name: 'New Fountain' } : gym));
+    await service.refreshGym(2);
+    seen.push(service.generation);
+    service.forget(3);
+    seen.push(service.generation);
+    await service.load();
+    seen.push(service.generation);
+    expect(new Set(seen).size).toBe(seen.length);
+    state.failing = true;
+    await expect(service.load()).rejects.toThrow();
+    await expect(service.refreshGym(2)).rejects.toThrow();
+    expect(service.generation).toBe(seen.at(-1));
+  });
 });
diff --git a/src/services/gym-directory.ts b/src/services/gym-directory.ts
index 966b22d19c72b7485feea09a680f669c3cc99a7b..e532038d726b1d360cf8c5d13d68ed04681fd994 100644
--- a/src/services/gym-directory.ts
+++ b/src/services/gym-directory.ts
@@ -51,9 +51,19 @@ export interface GymDirectoryOptions {
 export class GymDirectory implements GymProvider {
   private lookup: GymLookup<Gym> | undefined;
   private queue: Promise<unknown> = Promise.resolve();
+  private changes = 0;
 
   constructor(private readonly options: GymDirectoryOptions) {}
 
+  /**
+   * A number that changes with every load and every gym re-read or forgotten: what is built
+   * from the gyms (the web map's view) is built anew when it differs from the one it was built
+   * at.
+   */
+  get generation(): number {
+    return this.changes;
+  }
+
   private get current(): GymLookup<Gym> {
     if (!this.lookup) throw new Error('Gyms have not been loaded yet');
     return this.lookup;
@@ -75,6 +85,7 @@ export class GymDirectory implements GymProvider {
       ]);
       const started = performance.now();
       this.lookup = new GymLookup(gyms, regions, this.options.ignoredWords);
+      this.changes += 1;
       this.options.log.info(
         { gyms: gyms.length, regions: regions.length, ms: Math.round(performance.now() - started) },
         'gyms indexed',
@@ -92,6 +103,7 @@ export class GymDirectory implements GymProvider {
       const gym = await this.options.gyms.get(id);
       if (gym) lookup.put(gym);
       else lookup.remove(id);
+      this.changes += 1;
       return gym;
     });
   }
@@ -106,8 +118,9 @@ export class GymDirectory implements GymProvider {
    */
   forget(id: number): boolean {
     const known = this.current.remove(id);
+    this.changes += 1;
     void this.enqueue(() => {
-      this.lookup?.remove(id);
+      if (this.lookup?.remove(id)) this.changes += 1;
       return Promise.resolve();
     });
     return known;
diff --git a/src/services/region-directory.test.ts b/src/services/region-directory.test.ts
index be012e29c61aca1c6ff5aaddc2566e8e5d88de24..070f5fba9689b2ec0d1b72f09066ac0c42d9e6ef 100644
--- a/src/services/region-directory.test.ts
+++ b/src/services/region-directory.test.ts
@@ -82,4 +82,19 @@ describe('RegionDirectory', () => {
     await regions.load();
     expect(regions.all()).toHaveLength(1);
   });
+
+  it('counts its loads, so that what is built from it knows when to build anew', async () => {
+    let answer: () => Promise<Region[]> = () => Promise.resolve(testRegions());
+    const { regions } = directory(() => answer());
+    const before = regions.generation;
+    await regions.load();
+    const loaded = regions.generation;
+    expect(loaded).not.toBe(before);
+    answer = () => Promise.reject(new Error('connection lost'));
+    await expect(regions.load()).rejects.toThrow('connection lost');
+    expect(regions.generation).toBe(loaded);
+    answer = () => Promise.resolve(testRegions());
+    await regions.load();
+    expect(regions.generation).not.toBe(loaded);
+  });
 });
diff --git a/src/services/region-directory.ts b/src/services/region-directory.ts
index 062d06cd32389192c965fbefe0095389ef284b5e..21dc7f0684db686bbda8cc55fc8aae3f26832941 100644
--- a/src/services/region-directory.ts
+++ b/src/services/region-directory.ts
@@ -57,9 +57,18 @@ export interface RegionProvider {
 export class RegionDirectory implements RegionProvider {
   private regions: readonly Region[] | undefined;
   private queue: Promise<unknown> = Promise.resolve();
+  private loads = 0;
 
   constructor(private readonly options: { regions: RegionListing; log: Logger }) {}
 
+  /**
+   * A number that changes with every load: what is built from the regions (the web map's view)
+   * is built anew when it differs from the one it was built at.
+   */
+  get generation(): number {
+    return this.loads;
+  }
+
   private get current(): readonly Region[] {
     if (!this.regions) throw new Error('Regions have not been loaded yet');
     return this.regions;
@@ -69,6 +78,7 @@ export class RegionDirectory implements RegionProvider {
   load(): Promise<void> {
     const result = this.queue.then(async () => {
       this.regions = await this.options.regions.listAll();
+      this.loads += 1;
       const forums = this.regions.filter((region) => region.forumChannelId !== null).length;
       this.options.log.info({ regions: this.regions.length, forums }, 'regions loaded');
     });
diff --git a/src/web/auth-routes.ts b/src/web/auth-routes.ts
index 7cd5aec605e7819c06e1afa9eff3c0a666aedb83..f41192fa7952fab98388b61111450af0c10b002e 100644
--- a/src/web/auth-routes.ts
+++ b/src/web/auth-routes.ts
@@ -3,11 +3,10 @@ import type { CookieSerializeOptions } from '@fastify/cookie';
 import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { isSnowflake } from '../db/snowflake.js';
 import { buttonPage, sendFailure } from './answers.js';
-import { addressBucket } from './client-address.js';
 import { postGuard } from './csrf.js';
 import { authorizeUrl } from './discord-oauth.js';
 import { localPath } from './local-path.js';
-import { RateLimiter } from './rate-limit.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 import { sameText } from './sessions.js';
 
@@ -54,15 +53,13 @@ interface LinkParams {
 export function authRoutes(app: FastifyInstance, deps: WebDeps): void {
   const { sessions, settings, oauth, loginLinks, servers, now, log } = deps;
   const callbackUrl = `${settings.publicUrl}/auth/callback`;
-  const limiter = new RateLimiter({ uses: AUTH_PER_MINUTE, perMs: 60_000 });
+  const limited = limitedPerAddress(new RateLimiter({ uses: AUTH_PER_MINUTE, perMs: 60_000 }), {
+    now,
+  });
 
   app.addHook('onRequest', async (request, reply) => {
     void reply.header('cache-control', 'no-store');
-    const answer = limiter.take(addressBucket(request.ip), now());
-    if (!answer.ok) {
-      void reply.header('retry-after', String(answer.retryAfterSeconds));
-      return sendFailure(request, reply, 429);
-    }
+    return limited(request, reply);
   });
 
   app.get('/auth/login', async (request: FastifyRequest<{ Querystring: Query }>, reply) => {
diff --git a/src/web/geo-cache.ts b/src/web/geo-cache.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1790a52a8eea46f045fd016a26390ed310f6ab8f
--- /dev/null
+++ b/src/web/geo-cache.ts
@@ -0,0 +1,82 @@
+import { createHash } from 'node:crypto';
+import { BoundedMap } from '../bounded-map.js';
+import type { Gym } from '../db/repositories/gym-repository.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { geoView } from '../domain/web/geo-view.js';
+
+/** How many servers' views are kept. */
+const SERVERS = 100;
+
+/** Where the view of a server is built from. */
+export interface GeoSources {
+  /** The row of a server (`Guild.id`), by which its regions say whose they are. */
+  guilds: { idFor(snowflake: string): Promise<number | undefined> };
+  /** The regions; `generation` changes with every load. */
+  regions: { all(): readonly Region[]; readonly generation: number };
+  /** The gyms; `generation` changes with every change. */
+  gyms: { all(): Gym[]; regionsOf(gymId: number): string[]; readonly generation: number };
+  /** The channels of a server as the bot sees them (`PartyGateway.serverChannels`). */
+  channels: {
+    serverChannels(guildId: string): readonly { id: string; name: string }[] | undefined;
+  };
+}
+
+/** A view as it is sent: its JSON and the strong ETag of that JSON. */
+export interface SentView {
+  body: string;
+  etag: string;
+}
+
+/**
+ * Whether an `If-None-Match` names this ETag (RFC 9110, 13.1.2): a list of tags, compared weakly
+ * (`W/` ignored), or `*` for any.
+ */
+export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
+  if (header === undefined) return false;
+  const opaque = (tag: string): string => tag.trim().replace(/^W\//, '');
+  const wanted = opaque(etag);
+  return [header]
+    .flat()
+    .flatMap((value) => value.split(','))
+    .some((tag) => tag.trim() === '*' || opaque(tag) === wanted);
+}
+
+/**
+ * The public view of each server (`geoView`), built once and kept (spec 3.1): built anew when
+ * the gyms or the regions changed (their generations) or a region's channel was renamed (the
+ * names are read at each request, which costs a pass over the server's channels). The ETag is
+ * the SHA-256 of the JSON, cut to 27 characters (160 bits).
+ */
+export class GeoCache {
+  private readonly views = new BoundedMap<string, SentView & { key: string }>(SERVERS);
+
+  constructor(private readonly sources: GeoSources) {}
+
+  async view(guildId: string): Promise<SentView> {
+    const { guilds, regions, gyms, channels } = this.sources;
+    const row = await guilds.idFor(guildId);
+    const own = row === undefined ? [] : regions.all().filter((region) => region.guildId === row);
+    const known = new Map((channels.serverChannels(guildId) ?? []).map((c) => [c.id, c.name]));
+    const channelNames = new Map(
+      own.flatMap((region) => {
+        const name = known.get(region.channelId);
+        return name === undefined ? [] : [[region.channelId, name] as const];
+      }),
+    );
+    const key = JSON.stringify([gyms.generation, regions.generation, row, [...channelNames]]);
+    const kept = this.views.get(guildId);
+    if (kept?.key === key) return kept;
+    const body = JSON.stringify(
+      geoView({
+        regions: own,
+        channelNames,
+        gyms: own.length === 0 ? [] : gyms.all(),
+        regionsOf: (id) => gyms.regionsOf(id),
+      }),
+    );
+    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`;
+    const view = { key, body, etag };
+    this.views.set(guildId, view);
+    return view;
+  }
+}
diff --git a/src/web/geo.test.ts b/src/web/geo.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e12eb8ef2dd2e09b439c34ee2aba57e3ebf25658
--- /dev/null
+++ b/src/web/geo.test.ts
@@ -0,0 +1,133 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { geoSourcesWith, webServerWith, type TestWeb } from '../../test/support/web.js';
+
+const GEO = `/s/${FAKE_GUILD_ID}/api/geo`;
+
+interface View {
+  regions: Array<{ id: number; name: string }>;
+  gyms: Array<{ id: number; name: string }>;
+}
+
+describe('the regions and gyms of a server', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('are public, in JSON with a strong ETag, to be asked again each time', async () => {
+    const sources = await geoSourcesWith();
+    web = webServerWith({ geo: sources });
+    const answer = await web.app.inject({ url: GEO });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['content-type']).toMatch(/^application\/json/);
+    expect(answer.headers['cache-control']).toBe('no-cache');
+    expect(answer.headers.etag).toMatch(/^"[A-Za-z0-9_-]{20,}"$/);
+    const view = answer.json<View>();
+    expect(view.regions.map((region) => region.name)).toEqual(['east', 'west']);
+    expect(view.gyms).toHaveLength(11);
+  });
+
+  it('answer an unchanged view with 304, and nothing else', async () => {
+    const sources = await geoSourcesWith();
+    web = webServerWith({ geo: sources });
+    const first = await web.app.inject({ url: GEO });
+    const etag = String(first.headers.etag);
+    const again = await web.app.inject({ url: GEO, headers: { 'if-none-match': etag } });
+    expect(again.statusCode).toBe(304);
+    expect(again.body).toBe('');
+    expect(again.headers.etag).toBe(etag);
+    const other = await web.app.inject({ url: GEO, headers: { 'if-none-match': '"other"' } });
+    expect(other.statusCode).toBe(200);
+  });
+
+  it('are built anew when a gym changes, the regions load, or a channel is renamed', async () => {
+    const sources = await geoSourcesWith();
+    web = webServerWith({ geo: sources });
+    const etags = [String((await web.app.inject({ url: GEO })).headers.etag)];
+    const named = async () => {
+      const answer = await web?.app.inject({ url: GEO });
+      etags.push(String(answer?.headers.etag));
+      return answer?.json<View>();
+    };
+
+    await sources.gyms.update(1, { name: 'Pinewood Central Library' });
+    await sources.directory.refreshGym(1);
+    expect((await named())?.gyms.find((gym) => gym.id === 1)?.name).toBe(
+      'Pinewood Central Library',
+    );
+
+    sources.regionRows.rows = sources.regionRows.rows.filter(
+      (region) => region.channelId !== EAST_CHANNEL,
+    );
+    await sources.regions.load();
+    expect((await named())?.regions.map((region) => region.name)).toEqual(['west']);
+
+    sources.channelNames.set(WEST_CHANNEL, 'west-end');
+    expect((await named())?.regions.map((region) => region.name)).toEqual(['west-end']);
+
+    expect(new Set(etags).size).toBe(4);
+  });
+
+  it('are empty for a server without regions', async () => {
+    const sources = await geoSourcesWith();
+    web = webServerWith({
+      geo: sources,
+      servers: { has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999' },
+    });
+    const answer = await web.app.inject({ url: '/s/412345678901234999/api/geo' });
+    expect(answer.json()).toEqual({ regions: [], gyms: [] });
+  });
+
+  it('are asked for at most 60 times a minute from one address, 304s counted', async () => {
+    const sources = await geoSourcesWith();
+    web = webServerWith({ geo: sources });
+    const etag = String((await web.app.inject({ url: GEO })).headers.etag);
+    for (let i = 1; i < 60; i += 1) {
+      const answer = await web.app.inject({ url: GEO, headers: { 'if-none-match': etag } });
+      expect(answer.statusCode).toBe(304);
+    }
+    const refused = await web.app.inject({ url: GEO });
+    expect(refused.statusCode).toBe(429);
+    expect(refused.json()).toEqual({ error: 'Too many requests. Try again in a minute.' });
+    expect(refused.headers['retry-after']).toBe('60');
+  });
+
+  it('answer 304 to the ETag marked weak, in a list, or to any', async () => {
+    const sources = await geoSourcesWith();
+    web = webServerWith({ geo: sources });
+    const etag = String((await web.app.inject({ url: GEO })).headers.etag);
+    for (const sent of [`W/${etag}`, `"other", ${etag}`, `"other",W/${etag} `, '*']) {
+      const answer = await web.app.inject({ url: GEO, headers: { 'if-none-match': sent } });
+      expect(answer.statusCode, sent).toBe(304);
+    }
+    for (const sent of ['"other", W/"more"', etag.slice(1, -1), `${etag.slice(0, -2)}"`]) {
+      const answer = await web.app.inject({ url: GEO, headers: { 'if-none-match': sent } });
+      expect(answer.statusCode, sent).toBe(200);
+    }
+  });
+});
+
+describe('who is asking, asked often', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('is answered at most 60 times a minute to one address', async () => {
+    const made = webServerWith();
+    web = made;
+    const ask = (remoteAddress: string) =>
+      made.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/me`, remoteAddress });
+    for (let i = 0; i < 60; i += 1) expect((await ask('203.0.113.7')).statusCode).toBe(200);
+    const refused = await ask('203.0.113.7');
+    expect(refused.statusCode).toBe(429);
+    expect(refused.json()).toEqual({ error: 'Too many requests. Try again in a minute.' });
+    expect((await ask('203.0.113.8')).statusCode).toBe(200);
+    made.clock.now += 60_000;
+    expect((await ask('203.0.113.7')).statusCode).toBe(200);
+  });
+});
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index b1df42e9f07d7ebf7d653f7ba6e89ae027c054fa..b16ba787439583bc7fa32d41d485eef79fcc1d3e 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -1,8 +1,15 @@
 import type { FastifyInstance, FastifyRequest } from 'fastify';
 import { isSnowflake } from '../db/snowflake.js';
 import { sendFailure } from './answers.js';
+import { etagMatches } from './geo-cache.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
+/** The requests for a server's regions and gyms one address may make in a minute (spec 5). */
+const GEO_PER_MINUTE = 60;
+/** The requests for who is asking one address may make in a minute (each page load asks once). */
+const ME_PER_MINUTE = 60;
+
 /** The request of an address of one server, `/s/<guild>/…`. */
 export type GuildRequest = FastifyRequest<{ Params: { guild: string } }>;
 
@@ -20,28 +27,49 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // Who is asking (spec 2.5): the page's header, whether they are a member of this server (one
   // login for every server: membership is asked per server, from Discord, kept a minute by the
   // directory), and the CSRF token its POSTs carry. When Discord cannot say, the page is
-  // read-only.
-  scope.get('/api/me', async (request: GuildRequest, reply) => {
-    void reply.header('cache-control', 'no-store');
-    const session = await sessions.of(request, reply);
-    if (!session) return { loggedIn: false };
-    let member = false;
-    let readOnly = false;
-    try {
-      member = (await deps.members.find(request.params.guild, session.userId)) !== undefined;
-    } catch (err) {
-      deps.log.warn(
-        { err, guild: request.params.guild, user: session.userId },
-        'could not ask whether somebody on the web pages is a member',
-      );
-      readOnly = true;
-    }
-    return {
-      loggedIn: true,
-      name: session.userName,
-      member,
-      csrf: sessions.csrfToken(session),
-      readOnly,
-    };
-  });
+  // read-only. Every request counts against the address, as it may ask Discord.
+  const meLimiter = new RateLimiter({ uses: ME_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/me',
+    { onRequest: limitedPerAddress(meLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return { loggedIn: false };
+      let member = false;
+      let readOnly = false;
+      try {
+        member = (await deps.members.find(request.params.guild, session.userId)) !== undefined;
+      } catch (err) {
+        deps.log.warn(
+          { err, guild: request.params.guild, user: session.userId },
+          'could not ask whether somebody on the web pages is a member',
+        );
+        readOnly = true;
+      }
+      return {
+        loggedIn: true,
+        name: session.userName,
+        member,
+        csrf: sessions.csrfToken(session),
+        readOnly,
+      };
+    },
+  );
+
+  // The regions and gyms of the server (spec 3.1): public, kept until they change, answered
+  // with 304 when the page has them already; every request counts against the address.
+  const geoLimiter = new RateLimiter({ uses: GEO_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/geo',
+    {
+      onRequest: limitedPerAddress(geoLimiter, { now: deps.now }),
+    },
+    async (request: GuildRequest, reply) => {
+      const view = await deps.geo.view(request.params.guild);
+      void reply.header('cache-control', 'no-cache').header('etag', view.etag);
+      if (etagMatches(request.headers['if-none-match'], view.etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(view.body);
+    },
+  );
 }
diff --git a/src/web/rate-limit.ts b/src/web/rate-limit.ts
index 8a75542a3b7f55ab72155e5f05597a8eede39373..652bdde6055ef6bc2a5a0cb7719c9c1eb0beed80 100644
--- a/src/web/rate-limit.ts
+++ b/src/web/rate-limit.ts
@@ -1,4 +1,7 @@
+import type { FastifyReply, FastifyRequest } from 'fastify';
 import { BoundedMap } from '../bounded-map.js';
+import { sendFailure } from './answers.js';
+import { addressBucket } from './client-address.js';
 
 /** How many addresses a limiter remembers at most. */
 const ADDRESSES = 10_000;
@@ -31,3 +34,16 @@ export class RateLimiter {
     };
   }
 }
+
+/**
+ * A hook that counts every request of the routes it is on against the client (`addressBucket`
+ * of Fastify's `request.ip`) and refuses one over the limit with 429 and `Retry-After`.
+ */
+export function limitedPerAddress(limiter: RateLimiter, options: { now: () => number }) {
+  return async (request: FastifyRequest, reply: FastifyReply) => {
+    const answer = limiter.take(addressBucket(request.ip), options.now());
+    if (answer.ok) return;
+    void reply.header('retry-after', String(answer.retryAfterSeconds));
+    return sendFailure(request, reply, 429);
+  };
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index 881450ca79235e468fcbf3cd9620ecca0771dccf..c47e94613de140abf88c46b756e1b7cf77b09e3d 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -7,6 +7,7 @@ import { sendFailure, shortPage } from './answers.js';
 import { authRoutes } from './auth-routes.js';
 import { isNearbyPeer } from './client-address.js';
 import type { OAuthGateway } from './discord-oauth.js';
+import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
 import type { LoginLinks } from './login-links.js';
@@ -31,6 +32,8 @@ export interface WebDeps {
   oauth: { appId: string; gateway: OAuthGateway } | undefined;
   /** The links of `/maps`, shared with the command. */
   loginLinks: LoginLinks;
+  /** The public view of each server's regions and gyms. */
+  geo: GeoCache;
   now: () => number;
   log: Logger;
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index dfe2f1f43463483ac567867ba4e52458e0c8a392..14d19102ae970f19c80dd8b3895757a879f1f624 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -2,15 +2,59 @@ import type { OutgoingHttpHeaders } from 'node:http';
 import type { FastifyInstance } from 'fastify';
 import type { Logger } from 'pino';
 import type { MemberDirectory } from '../../src/discord/member-directory.js';
+import { RegionDirectory } from '../../src/services/region-directory.js';
 import type { OAuthGateway, OAuthUser } from '../../src/web/discord-oauth.js';
+import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
 import { LoginLinks } from '../../src/web/login-links.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
 import { SESSION_COOKIE, Sessions } from '../../src/web/sessions.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
+import { gymDirectoryWith } from './gym-store.js';
+import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from './gyms.js';
 import { FakeMemberDirectory } from './members.js';
 import { createTestLogger } from './test-logger.js';
 import { MemoryWebSessions } from './web-sessions.js';
 
+/**
+ * Where the map's view is built from in tests: the invented gyms (`MemoryGyms` under a real
+ * `GymDirectory`) and regions (a real `RegionDirectory` over `regionRows`) of the server of the
+ * fake interactions (row 1), whose channels are named `west` and `east` (`channelNames`).
+ * Change `regionRows.rows` and load `regions`, or a gym and refresh it in `directory`, as the
+ * bot does.
+ */
+export async function geoSourcesWith() {
+  const regionRows = { rows: testRegions() };
+  const { gyms, directory } = await gymDirectoryWith(undefined, regionRows);
+  const { log } = createTestLogger();
+  const regions = new RegionDirectory({
+    regions: { listAll: () => Promise.resolve(regionRows.rows) },
+    log,
+  });
+  await regions.load();
+  const channelNames = new Map([
+    [WEST_CHANNEL, 'west'],
+    [EAST_CHANNEL, 'east'],
+  ]);
+  const sources: GeoSources = {
+    guilds: { idFor: (guild) => Promise.resolve(guild === FAKE_GUILD_ID ? 1 : undefined) },
+    regions,
+    gyms: directory,
+    channels: {
+      serverChannels: (guild) =>
+        guild === FAKE_GUILD_ID ? [...channelNames].map(([id, name]) => ({ id, name })) : undefined,
+    },
+  };
+  return { gyms, directory, regionRows, regions, channelNames, sources };
+}
+
+/** No regions and no gyms: the map of a server that has none. */
+const NOTHING: GeoSources = {
+  guilds: { idFor: () => Promise.resolve(undefined) },
+  regions: { all: () => [], generation: 0 },
+  gyms: { all: () => [], regionsOf: () => [], generation: 0 },
+  channels: { serverChannels: () => undefined },
+};
+
 /** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
 export const TEST_WEB: WebSettings = {
   port: 0,
@@ -79,6 +123,8 @@ export interface WebTestOptions {
   /** Discord's side of a login (a `FakeOAuth` by default); undefined: no client secret. */
   oauth?: OAuthGateway | undefined;
   googleKey?: string;
+  /** Where the map's view is built from (`geoSourcesWith`); nothing by default. */
+  geo?: { sources: GeoSources };
 }
 
 /** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
@@ -121,6 +167,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     sessions: sessionService,
     oauth: gateway && { appId: TEST_APP_ID, gateway },
     loginLinks,
+    geo: new GeoCache(options.geo?.sources ?? NOTHING),
     now: () => clock.now,
     log,
   });
````

### Task 6: The map page

Prototype commit: `65d7b262d390cccd7564404daff9140c35dbd68e`

The page in `src/web/client/` (its own `tsconfig.json`), bundled with Leaflet by `scripts/web/build.ts` (`npm run web:build`, part of `npm run build`) into `dist/web/assets/` with hashed names and `dist/web/assets.json`; served by `@fastify/static` (flat names only; hashed ones cached for a year). `/s/<guild>/map` with no inline script: regions labelled from zoom 12, gyms as circle markers (elite in another colour), a popup per gym built as nodes with `textContent` (Leaflet sets strings as HTML), a filter over names and nicknames, "Log in with Discord" or the member's name and "Log out", the login notices. OSM by default; with `tiles: google` and a key, Google's roadmap, satellite and hybrid through the Map Tiles API (a session per layer, the copyright of the view as attribution). Without the bundle the page answers 503.

**Files:**

```
 package.json                  |   5 +-
 scripts/web/build.ts          |  55 +++++++++++++++++++
 src/app.ts                    |   7 +++
 src/domain/web/geo-data.ts    |  28 ++++++++++
 src/domain/web/geo-view.ts    |  27 +--------
 src/web/client/filter.test.ts |  33 +++++++++++
 src/web/client/filter.ts      |  24 ++++++++
 src/web/client/layers.test.ts |  78 ++++++++++++++++++++++++++
 src/web/client/layers.ts      |  97 ++++++++++++++++++++++++++++++++
 src/web/client/main.ts        | 246 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/map.css        | 121 ++++++++++++++++++++++++++++++++++++++++
 src/web/client/notice.test.ts |  44 +++++++++++++++
 src/web/client/notice.ts      |  43 +++++++++++++++
 src/web/client/popup.test.ts  | 130 +++++++++++++++++++++++++++++++++++++++++++
 src/web/client/popup.ts       |  88 +++++++++++++++++++++++++++++
 src/web/client/tsconfig.json  |   9 +++
 src/web/guild-routes.ts       |  26 ++++++++-
 src/web/page.test.ts          | 119 ++++++++++++++++++++++++++++++++++++++++
 src/web/page.ts               |  88 +++++++++++++++++++++++++++++
 src/web/server.ts             |  21 +++++++
 test/support/web.ts           |  23 ++++++++
 tsconfig.build.json           |   2 +-
 tsconfig.json                 |   3 +-
 23 files changed, 1288 insertions(+), 29 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/web/client/filter.test.ts src/web/client/layers.test.ts src/web/client/notice.test.ts src/web/client/popup.test.ts src/web/geo.test.ts src/web/login.test.ts src/web/page.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check scripts/web/build.ts src/app.ts src/domain/web/geo-data.ts src/domain/web/geo-view.ts src/web/client/filter.test.ts src/web/client/filter.ts src/web/client/layers.test.ts src/web/client/layers.ts src/web/client/main.ts src/web/client/notice.test.ts src/web/client/notice.ts src/web/client/popup.test.ts src/web/client/popup.ts src/web/guild-routes.ts src/web/page.test.ts src/web/page.ts src/web/server.ts test/support/web.ts` and `npx eslint scripts/web/build.ts src/app.ts src/domain/web/geo-data.ts src/domain/web/geo-view.ts src/web/client/filter.test.ts src/web/client/filter.ts src/web/client/layers.test.ts src/web/client/layers.ts src/web/client/main.ts src/web/client/notice.test.ts src/web/client/notice.ts src/web/client/popup.test.ts src/web/client/popup.ts src/web/guild-routes.ts src/web/page.test.ts src/web/page.ts src/web/server.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 65d7b262d390cccd7564404daff9140c35dbd68e -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `The map page`, the paragraph above as the body and the trailer, staging exactly
  `package.json scripts/web/build.ts src/app.ts src/domain/web/geo-data.ts src/domain/web/geo-view.ts src/web/client/filter.test.ts src/web/client/filter.ts src/web/client/layers.test.ts src/web/client/layers.ts src/web/client/main.ts src/web/client/map.css src/web/client/notice.test.ts src/web/client/notice.ts src/web/client/popup.test.ts src/web/client/popup.ts src/web/client/tsconfig.json src/web/guild-routes.ts src/web/page.test.ts src/web/page.ts src/web/server.ts test/support/web.ts tsconfig.build.json tsconfig.json`.

````diff
diff --git a/package.json b/package.json
index aa146a1189429dc55af6e5dd5aa37794a9563790..f32cfc7216229fae5ad3dd58304ca3d4049de9d4 100644
--- a/package.json
+++ b/package.json
@@ -8,7 +8,7 @@
     "node": ">=24"
   },
   "scripts": {
-    "build": "tsc -p tsconfig.build.json",
+    "build": "tsc -p tsconfig.build.json && npm run web:build",
     "start": "node --env-file-if-exists=.env --enable-source-maps dist/index.js",
     "dev": "tsx watch --env-file-if-exists=.env src/index.ts",
     "migrate": "tsx --env-file-if-exists=.env src/db/migrate-cli.ts",
@@ -23,7 +23,8 @@
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
-    "typecheck": "tsc --noEmit && tsc --noEmit -p userscript",
+    "web:build": "tsx scripts/web/build.ts",
+    "typecheck": "tsc --noEmit && tsc --noEmit -p userscript && tsc --noEmit -p src/web/client",
     "lint": "eslint .",
     "format": "prettier --write .",
     "format:check": "prettier --check .",
diff --git a/scripts/web/build.ts b/scripts/web/build.ts
new file mode 100644
index 0000000000000000000000000000000000000000..20b9719d27396b43f84894dc798bf3aee1dfc11f
--- /dev/null
+++ b/scripts/web/build.ts
@@ -0,0 +1,55 @@
+import { mkdir, rm, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+import { build } from 'esbuild';
+
+/**
+ * Builds the web map's page (`src/web/client/`) into `dist/web/`: `assets/map-<hash>.js` (the
+ * script with Leaflet, an IIFE for ES2022, minified), `assets/map-<hash>.css` (the page's style
+ * with Leaflet's) and Leaflet's pictures, each named by a hash of its content so that the
+ * server can let browsers keep them for good; `dist/web/assets.json` names the script and the
+ * style for the page. The folder is emptied first, so no old file stays; the rest of `dist/web/`
+ * is the compiled server code of `src/web/` and is left alone.
+ */
+
+const root = path.resolve(import.meta.dirname, '../..');
+const out = path.join(root, 'dist/web');
+const assets = path.join(out, 'assets');
+const manifest = path.join(out, 'assets.json');
+const client = path.join(root, 'src/web/client');
+
+// Only what this build makes: the compiled server code of src/web/ lives in dist/web/ too.
+await rm(assets, { recursive: true, force: true });
+await rm(manifest, { force: true });
+await mkdir(assets, { recursive: true });
+
+const result = await build({
+  entryPoints: [
+    { in: path.join(client, 'main.ts'), out: 'map' },
+    { in: path.join(client, 'map.css'), out: 'map' },
+  ],
+  tsconfig: path.join(client, 'tsconfig.json'),
+  outdir: assets,
+  entryNames: '[name]-[hash]',
+  assetNames: '[name]-[hash]',
+  bundle: true,
+  format: 'iife',
+  platform: 'browser',
+  target: 'es2022',
+  minify: true,
+  charset: 'utf8',
+  // Leaflet's licence (BSD-2-Clause) asks for its notice: kept at the end of the files.
+  legalComments: 'eof',
+  loader: { '.png': 'file', '.svg': 'file' },
+  metafile: true,
+  logLevel: 'warning',
+});
+
+const outputs = Object.keys(result.metafile.outputs).map((file) => path.basename(file));
+const script = outputs.find((file) => /^map-[A-Z0-9]{8}\.js$/.test(file));
+const style = outputs.find((file) => /^map-[A-Z0-9]{8}\.css$/.test(file));
+if (script === undefined || style === undefined) {
+  throw new Error(`the build made no script or no style: ${outputs.join(', ')}`);
+}
+await writeFile(manifest, `${JSON.stringify({ script, style }, null, 2)}\n`);
+
+process.stdout.write(`dist/web/assets: ${outputs.join(', ')}\n`);
diff --git a/src/app.ts b/src/app.ts
index a093d80ee0c928dff943b065461417333e18191e..a2ccc1d025e1a8a03e949a18a300dfc520437baf 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -89,6 +89,7 @@ import { pictureOrigins } from './web/headers.js';
 import { buildWebServer } from './web/server.js';
 import { DiscordOAuth } from './web/discord-oauth.js';
 import { GeoCache } from './web/geo-cache.js';
+import { readAssets } from './web/page.js';
 import { LoginLinks } from './web/login-links.js';
 import { Sessions } from './web/sessions.js';
 import { startWebServer } from './web/start.js';
@@ -636,9 +637,14 @@ export async function startApp(
   // logged and the bot runs on without them.
   const webSettings = config.settings.web;
   let webClosed = false;
+  const webAssets = webSettings && (await readAssets());
+  if (webAssets && !webAssets.manifest) {
+    log.warn('the map page is not built (npm run web:build): its address answers that it is not');
+  }
   const web =
     webSettings &&
     webSessions &&
+    webAssets &&
     buildWebServer({
       settings: webSettings,
       pictureOrigins: pictureOrigins(config.settings.raidEggPicturesUrl),
@@ -659,6 +665,7 @@ export async function startApp(
         : undefined,
       loginLinks,
       geo: new GeoCache({ guilds, regions, gyms, channels: partyGateway }),
+      assets: webAssets,
       now: () => Date.now(),
       log,
     });
diff --git a/src/domain/web/geo-data.ts b/src/domain/web/geo-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cd5dc49e97129f9c4c93420693aa89f134ab9da8
--- /dev/null
+++ b/src/domain/web/geo-data.ts
@@ -0,0 +1,28 @@
+/**
+ * What `GET /s/<guild>/api/geo` answers (`geoView`), as the page reads it. Types alone, with no
+ * import: the page's bundle (`src/web/client/`) takes them without the server's code.
+ */
+
+/** A place as the page reads it: `[lat, lon]`, six decimals (about 10 cm). */
+export type Point = [number, number];
+
+export interface GeoView {
+  /** By name. `outline` is closed. */
+  regions: Array<{ id: number; name: string; outline: Point[] }>;
+  /** By id. `regionIds` are those of this server the gym lies in. */
+  gyms: Array<{
+    id: number;
+    name: string;
+    nickname: string | null;
+    lat: number;
+    lon: number;
+    regionIds: number[];
+    /** The address line (`addressLine`), or null when nothing of it is known. */
+    address: string | null;
+    description: string | null;
+    /** What members should know before they go (access, hours). */
+    notice: string | null;
+    /** An elite raid gym (either stored flag, as `isEliteGym`). */
+    elite: boolean;
+  }>;
+}
diff --git a/src/domain/web/geo-view.ts b/src/domain/web/geo-view.ts
index c497bdca7f14488250cbfac154cc7d30c7fbefc4..7de4ce9002aa2cf09fd0d7d2ecade0886ffb92ce 100644
--- a/src/domain/web/geo-view.ts
+++ b/src/domain/web/geo-view.ts
@@ -1,6 +1,9 @@
 import { addressLine } from '../geo/google.js';
 import type { LatLon } from '../geo/lat-lon.js';
 import { isEliteGym } from '../party/raid.js';
+import type { GeoView, Point } from './geo-data.js';
+
+export type { GeoView, Point } from './geo-data.js';
 
 /**
  * What the public map of a server shows (spec 3.1, `GET /s/<guild>/api/geo`): its regions,
@@ -41,30 +44,6 @@ export interface GeoInput {
   regionsOf(gymId: number): readonly string[];
 }
 
-/** A place as the page reads it: `[lat, lon]`, six decimals (about 10 cm). */
-export type Point = [number, number];
-
-export interface GeoView {
-  /** By name. `outline` is closed. */
-  regions: Array<{ id: number; name: string; outline: Point[] }>;
-  /** By id. `regionIds` are those of this server the gym lies in. */
-  gyms: Array<{
-    id: number;
-    name: string;
-    nickname: string | null;
-    lat: number;
-    lon: number;
-    regionIds: number[];
-    /** The address line (`addressLine`), or null when nothing of it is known. */
-    address: string | null;
-    description: string | null;
-    /** What members should know before they go (access, hours). */
-    notice: string | null;
-    /** An elite raid gym (either stored flag, as `isEliteGym`). */
-    elite: boolean;
-  }>;
-}
-
 const round = (value: number): number => Math.round(value * 1e6) / 1e6;
 
 /**
diff --git a/src/web/client/filter.test.ts b/src/web/client/filter.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..aaecbab7a36131e945af7081bae98e1b9f461601
--- /dev/null
+++ b/src/web/client/filter.test.ts
@@ -0,0 +1,33 @@
+import { describe, expect, it } from 'vitest';
+import { gymFilter } from './filter.js';
+
+const gyms = [
+  { id: 1, name: 'Pinewood Public Library', nickname: 'The Stacks' },
+  { id: 2, name: 'Café Élan Fresco', nickname: null },
+  { id: 3, name: "St. Mary's Church", nickname: null },
+  { id: 4, name: 'Starbucks', nickname: 'Downtown Starbucks' },
+];
+
+const ids = (text: string) => gyms.filter(gymFilter(text)).map((gym) => gym.id);
+
+describe('gymFilter', () => {
+  it('lets every gym through an empty filter', () => {
+    expect(ids('')).toEqual([1, 2, 3, 4]);
+    expect(ids('   ')).toEqual([1, 2, 3, 4]);
+  });
+
+  it('finds gyms by every word typed, in the name or the nickname', () => {
+    expect(ids('library')).toEqual([1]);
+    expect(ids('stacks')).toEqual([1]);
+    expect(ids('pinewood stacks')).toEqual([1]);
+    expect(ids('star')).toEqual([4]);
+    expect(ids('downtown')).toEqual([4]);
+    expect(ids('library church')).toEqual([]);
+  });
+
+  it('reads without case or accents, and an apostrophe as nothing', () => {
+    expect(ids('CAFE elan')).toEqual([2]);
+    expect(ids('marys')).toEqual([3]);
+    expect(ids("mary's")).toEqual([3]);
+  });
+});
diff --git a/src/web/client/filter.ts b/src/web/client/filter.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9882af9ceb957b83f7f5259742e185b8452caf1a
--- /dev/null
+++ b/src/web/client/filter.ts
@@ -0,0 +1,24 @@
+import { foldText } from '../../domain/search/text.js';
+
+/** Lower case, no accents, no apostrophes: how both the filter and the names are read. */
+function plain(text: string): string {
+  return foldText(text).replace(/['’]/g, '');
+}
+
+/**
+ * Which gyms the filter box lets through (spec 3.1): every word typed must be found in the
+ * gym's name or nickname, without case, accents or apostrophes; an empty box lets every gym
+ * through.
+ */
+export function gymFilter(
+  text: string,
+): (gym: { name: string; nickname: string | null }) => boolean {
+  const words = plain(text)
+    .split(/[^\p{L}\p{N}]+/u)
+    .filter((word) => word !== '');
+  if (words.length === 0) return () => true;
+  return (gym) => {
+    const names = plain(`${gym.name} ${gym.nickname ?? ''}`);
+    return words.every((word) => names.includes(word));
+  };
+}
diff --git a/src/web/client/layers.test.ts b/src/web/client/layers.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ec8659e93a937397635c028682248e014208b408
--- /dev/null
+++ b/src/web/client/layers.test.ts
@@ -0,0 +1,78 @@
+import { describe, expect, it } from 'vitest';
+import {
+  googleAttribution,
+  googleTileUrl,
+  OSM_ATTRIBUTION,
+  sessionRequest,
+  tileLayers,
+  viewportUrl,
+} from './layers.js';
+
+describe('tileLayers', () => {
+  it("is OpenStreetMap's alone unless Google's tiles are set and have a key", () => {
+    expect(tileLayers('osm', undefined)).toEqual([
+      {
+        kind: 'osm',
+        name: 'OpenStreetMap',
+        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
+        attribution: OSM_ATTRIBUTION,
+        maxZoom: 19,
+      },
+    ]);
+    expect(tileLayers('osm', 'key')).toHaveLength(1);
+    expect(tileLayers('google', undefined)).toHaveLength(1);
+  });
+
+  it("offers Google's roadmap, satellite and hybrid beside OpenStreetMap", () => {
+    expect(tileLayers('google', 'key').map((layer) => layer.name)).toEqual([
+      'OpenStreetMap',
+      'Google roadmap',
+      'Google satellite',
+      'Google hybrid',
+    ]);
+  });
+});
+
+describe("Google's tiles", () => {
+  it('ask for a session of the map type, in English for the US, the hybrid with roads', () => {
+    const [, roadmap, satellite, hybrid] = tileLayers('google', 'key');
+    if (roadmap?.kind !== 'google' || satellite?.kind !== 'google' || hybrid?.kind !== 'google') {
+      throw new Error('no Google layers');
+    }
+    expect(sessionRequest(roadmap)).toEqual({
+      mapType: 'roadmap',
+      language: 'en-US',
+      region: 'US',
+    });
+    expect(sessionRequest(satellite)).toEqual({
+      mapType: 'satellite',
+      language: 'en-US',
+      region: 'US',
+    });
+    expect(sessionRequest(hybrid)).toEqual({
+      mapType: 'satellite',
+      language: 'en-US',
+      region: 'US',
+      layerTypes: ['layerRoadmap'],
+    });
+  });
+
+  it('are fetched with the session and the key, from the Map Tiles API alone', () => {
+    expect(googleTileUrl('s e/s', 'k&y')).toBe(
+      'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=s%20e%2Fs&key=k%26y',
+    );
+    expect(
+      viewportUrl('sess', 'key', 12, { north: 40.1, south: 40, east: -79.9, west: -80.1 }),
+    ).toBe(
+      'https://tile.googleapis.com/tile/v1/viewport?session=sess&key=key&zoom=12&north=40.1&south=40&east=-79.9&west=-80.1',
+    );
+  });
+
+  it("credit Google Maps and the data's sources, as text", () => {
+    expect(googleAttribution('Map data ©2026 Google')).toBe('Google Maps · Map data ©2026 Google');
+    expect(googleAttribution('<img src=x onerror=alert(1)>')).toBe(
+      'Google Maps · &lt;img src=x onerror=alert(1)&gt;',
+    );
+    expect(googleAttribution('')).toBe('Google Maps');
+  });
+});
diff --git a/src/web/client/layers.ts b/src/web/client/layers.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3b089ed1208e0878c6fe5458ada4ae20e3c21525
--- /dev/null
+++ b/src/web/client/layers.ts
@@ -0,0 +1,97 @@
+/**
+ * The tiles the map offers (spec 2.3): OpenStreetMap's standard tiles, and with
+ * `tiles: 'google'` and a browser key Google's roadmap, satellite and hybrid through the Map
+ * Tiles API (a session per layer, then 2D tiles; never the raw `mt*.google.com` addresses).
+ */
+
+/** OpenStreetMap's attribution as its tile policy asks (HTML of ours, for Leaflet). */
+export const OSM_ATTRIBUTION =
+  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
+
+const MAP_TILES = 'https://tile.googleapis.com';
+
+export type TileLayerSpec =
+  | { kind: 'osm'; name: string; url: string; attribution: string; maxZoom: number }
+  | {
+      kind: 'google';
+      name: string;
+      mapType: 'roadmap' | 'satellite';
+      /** Roads over the satellite pictures: the hybrid. */
+      roads: boolean;
+      maxZoom: number;
+    };
+
+/** The layers of the layer switch, OpenStreetMap's first (the one shown at first). */
+export function tileLayers(
+  tiles: 'osm' | 'google',
+  googleKey: string | undefined,
+): TileLayerSpec[] {
+  const osm: TileLayerSpec = {
+    kind: 'osm',
+    name: 'OpenStreetMap',
+    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
+    attribution: OSM_ATTRIBUTION,
+    maxZoom: 19,
+  };
+  if (tiles !== 'google' || googleKey === undefined || googleKey === '') return [osm];
+  return [
+    osm,
+    { kind: 'google', name: 'Google roadmap', mapType: 'roadmap', roads: false, maxZoom: 20 },
+    { kind: 'google', name: 'Google satellite', mapType: 'satellite', roads: false, maxZoom: 20 },
+    { kind: 'google', name: 'Google hybrid', mapType: 'satellite', roads: true, maxZoom: 20 },
+  ];
+}
+
+/** The body of `createSession` for a Google layer. */
+export function sessionRequest(spec: Extract<TileLayerSpec, { kind: 'google' }>): {
+  mapType: string;
+  language: string;
+  region: string;
+  layerTypes?: string[];
+} {
+  return {
+    mapType: spec.mapType,
+    language: 'en-US',
+    region: 'US',
+    ...(spec.roads ? { layerTypes: ['layerRoadmap'] } : {}),
+  };
+}
+
+/** Where a session is created (POST, JSON). */
+export function sessionUrl(key: string): string {
+  return `${MAP_TILES}/v1/createSession?key=${encodeURIComponent(key)}`;
+}
+
+/** The tile address of a session, as Leaflet's template. */
+export function googleTileUrl(session: string, key: string): string {
+  return `${MAP_TILES}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`;
+}
+
+/** Where the attribution of what is in view is asked for. */
+export function viewportUrl(
+  session: string,
+  key: string,
+  zoom: number,
+  bounds: { north: number; south: number; east: number; west: number },
+): string {
+  const query = new URLSearchParams({
+    session,
+    key,
+    zoom: String(zoom),
+    north: String(bounds.north),
+    south: String(bounds.south),
+    east: String(bounds.east),
+    west: String(bounds.west),
+  });
+  return `${MAP_TILES}/tile/v1/viewport?${query.toString()}`;
+}
+
+/**
+ * The attribution of Google's tiles: "Google Maps" (Google's policies: its logo where there is
+ * room, the words otherwise) and the copyright of what is in view, as Google wrote it, escaped
+ * for Leaflet, which shows attributions as HTML.
+ */
+export function googleAttribution(copyright: string): string {
+  const text = copyright.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
+  return text.trim() === '' ? 'Google Maps' : `Google Maps · ${text}`;
+}
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f9e0dfdf883c25d0a9dab202dfebaddddd7a2a9e
--- /dev/null
+++ b/src/web/client/main.ts
@@ -0,0 +1,246 @@
+import * as L from 'leaflet';
+import type { GeoView } from '../../domain/web/geo-data.js';
+import { gymFilter } from './filter.js';
+import {
+  googleAttribution,
+  googleTileUrl,
+  sessionRequest,
+  sessionUrl,
+  tileLayers,
+  viewportUrl,
+  type TileLayerSpec,
+} from './layers.js';
+import { headerLines, loginNotice, type Me } from './notice.js';
+import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
+
+/**
+ * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
+ * `layers.ts`, the server's regions labelled with their channels, its gyms as dots (elite raid
+ * gyms in their own colour) with a popup each, a filter box, and the header with the login.
+ * Everything from data is set as text (`renderNode`, `textContent`): Leaflet sets string
+ * content of tooltips, popups and attributions as HTML, so data goes to it as nodes.
+ */
+
+/** From this zoom on the regions' names are shown. */
+const LABEL_ZOOM = 12;
+/** How long the map rests before Google is asked for the attribution of what is in view. */
+const ATTRIBUTION_DELAY_MS = 500;
+const GYM_COLOUR = '#2d7a3a';
+const ELITE_COLOUR = '#8e3ab0';
+const REGION_COLOUR = '#3060c0';
+
+function byId(id: string): HTMLElement {
+  const found = document.getElementById(id);
+  if (!found) throw new Error(`the page has no #${id}`);
+  return found;
+}
+
+async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
+  const response = await fetch(url, { credentials: 'same-origin', ...init });
+  if (!response.ok) throw new Error(`${response.status}`);
+  return (await response.json()) as T;
+}
+
+/** A line under the header, for a moment's news (a login that failed, tiles that did not load). */
+function say(text: string): void {
+  const notice = byId('notice');
+  notice.textContent = text;
+  notice.hidden = false;
+}
+
+/** The Google layer of a spec: a session asked for when it is first shown, then its tiles. */
+function googleLayer(
+  map: L.Map,
+  spec: Extract<TileLayerSpec, { kind: 'google' }>,
+  key: string,
+): L.LayerGroup {
+  const group = L.layerGroup();
+  let session: Promise<string> | undefined;
+  let attribution: string | undefined;
+  let timer: number | undefined;
+  const setAttribution = (text: string | undefined): void => {
+    if (attribution !== undefined) map.attributionControl.removeAttribution(attribution);
+    attribution = text;
+    if (text !== undefined) map.attributionControl.addAttribution(text);
+  };
+  const refresh = (): void => {
+    window.clearTimeout(timer);
+    timer = window.setTimeout(() => {
+      if (!session || !map.hasLayer(group)) return;
+      void session
+        .then((id) => {
+          const bounds = map.getBounds();
+          return getJson<{ copyright?: string }>(
+            viewportUrl(id, key, map.getZoom(), {
+              north: bounds.getNorth(),
+              south: bounds.getSouth(),
+              east: bounds.getEast(),
+              west: bounds.getWest(),
+            }),
+            { credentials: 'omit' },
+          );
+        })
+        .then((answer) => {
+          if (map.hasLayer(group)) setAttribution(googleAttribution(answer.copyright ?? ''));
+        })
+        .catch(() => setAttribution(googleAttribution('')));
+    }, ATTRIBUTION_DELAY_MS);
+  };
+  group.on('add', () => {
+    setAttribution(googleAttribution(''));
+    session ??= getJson<{ session: string }>(sessionUrl(key), {
+      method: 'POST',
+      credentials: 'omit',
+      headers: { 'content-type': 'application/json' },
+      body: JSON.stringify(sessionRequest(spec)),
+    }).then((answer) => answer.session);
+    session
+      .then((id) => {
+        if (group.getLayers().length === 0) {
+          group.addLayer(L.tileLayer(googleTileUrl(id, key), { maxZoom: spec.maxZoom }));
+        }
+        refresh();
+      })
+      .catch(() => {
+        session = undefined;
+        say("Google's map could not be loaded.");
+      });
+    map.on('moveend', refresh);
+  });
+  group.on('remove', () => {
+    map.off('moveend', refresh);
+    window.clearTimeout(timer);
+    setAttribution(undefined);
+  });
+  return group;
+}
+
+function addTiles(map: L.Map, specs: readonly TileLayerSpec[], key: string | undefined): void {
+  const layers: Record<string, L.Layer> = {};
+  for (const spec of specs) {
+    layers[spec.name] =
+      spec.kind === 'osm'
+        ? L.tileLayer(spec.url, { attribution: spec.attribution, maxZoom: spec.maxZoom })
+        : googleLayer(map, spec, key ?? '');
+  }
+  const [first] = specs;
+  if (first) layers[first.name]?.addTo(map);
+  if (specs.length > 1) L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
+}
+
+async function showAccount(guild: string, login: 'discord' | 'links'): Promise<void> {
+  const account = byId('account');
+  let me: Me;
+  try {
+    me = await getJson<Me>(`/s/${guild}/api/me`);
+  } catch {
+    me = { loggedIn: false };
+  }
+  const header = headerLines(me, login);
+  account.replaceChildren();
+  if (header.login) {
+    const link = document.createElement('a');
+    link.className = 'login';
+    link.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
+    link.textContent = 'Log in with Discord';
+    account.append(link);
+  }
+  if (header.name !== undefined && me.loggedIn) {
+    const name = document.createElement('span');
+    name.className = 'name';
+    name.textContent = header.name;
+    const logout = document.createElement('button');
+    logout.type = 'button';
+    logout.textContent = 'Log out';
+    const { csrf } = me;
+    logout.addEventListener('click', () => {
+      void fetch('/auth/logout', {
+        method: 'POST',
+        credentials: 'same-origin',
+        headers: { 'x-pine-csrf': csrf },
+      }).finally(() => location.reload());
+    });
+    account.append(name, logout);
+  }
+  for (const text of header.lines) {
+    const line = document.createElement('span');
+    line.className = 'line';
+    line.textContent = text;
+    account.append(line);
+  }
+}
+
+async function showGeo(map: L.Map, guild: string): Promise<void> {
+  const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
+  const names = new Map(view.regions.map((region) => [region.id, region.name]));
+  const regions = L.featureGroup();
+  for (const region of view.regions) {
+    L.polygon(region.outline, { color: REGION_COLOUR, weight: 2, fillOpacity: 0.05 })
+      .bindTooltip(renderNode(regionLabel(region.name), document), {
+        permanent: true,
+        direction: 'center',
+        className: 'region-label',
+      })
+      .addTo(regions);
+  }
+  regions.addTo(map);
+  const dots = view.gyms.map((gym: MapGym) => ({
+    gym,
+    dot: L.circleMarker([gym.lat, gym.lon], {
+      radius: 6,
+      weight: 2,
+      color: gym.elite ? ELITE_COLOUR : GYM_COLOUR,
+      fillOpacity: 0.8,
+    }).bindPopup(() => renderNode(gymPopup(gym, names), document)),
+  }));
+  const gyms = L.featureGroup(dots.map(({ dot }) => dot)).addTo(map);
+  const all = regions.getBounds().isValid() ? regions.getBounds() : gyms.getBounds();
+  if (all.isValid()) map.fitBounds(all);
+  else say('This server has no regions yet.');
+
+  const labels = (): void => {
+    map.getContainer().classList.toggle('labels-hidden', map.getZoom() < LABEL_ZOOM);
+  };
+  map.on('zoomend', labels);
+  labels();
+
+  const filter = byId('filter') as HTMLInputElement;
+  const shown = (): typeof dots => dots.filter(({ gym }) => gymFilter(filter.value)(gym));
+  filter.addEventListener('input', () => {
+    const keep = new Set(shown().map(({ gym }) => gym.id));
+    for (const { gym, dot } of dots) {
+      if (keep.has(gym.id)) gyms.addLayer(dot);
+      else gyms.removeLayer(dot);
+    }
+  });
+  filter.addEventListener('keydown', (event) => {
+    if (event.key !== 'Enter') return;
+    const matches = shown();
+    if (matches.length === 0) return;
+    map.fitBounds(L.latLngBounds(matches.map(({ gym }) => [gym.lat, gym.lon])), {
+      maxZoom: 17,
+      padding: [40, 40],
+    });
+    if (matches.length === 1) matches[0]?.dot.openPopup();
+  });
+}
+
+function start(): void {
+  const data = document.body.dataset;
+  const guild = data.guild ?? '';
+  const map = L.map(byId('map'), { center: [40.44, -79.99], zoom: 11 });
+  addTiles(
+    map,
+    tileLayers(data.tiles === 'google' ? 'google' : 'osm', data.googleKey),
+    data.googleKey,
+  );
+  const notice = loginNotice(location.search);
+  if (notice) {
+    say(notice.text);
+    history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
+  }
+  void showAccount(guild, data.login === 'discord' ? 'discord' : 'links');
+  showGeo(map, guild).catch(() => say('The map could not be loaded. Try again in a moment.'));
+}
+
+start();
diff --git a/src/web/client/map.css b/src/web/client/map.css
new file mode 100644
index 0000000000000000000000000000000000000000..0961bbe266a7ccdd674b7a69ea0ef835cfb045ce
--- /dev/null
+++ b/src/web/client/map.css
@@ -0,0 +1,121 @@
+@import 'leaflet/dist/leaflet.css';
+
+html,
+body {
+  height: 100%;
+  margin: 0;
+}
+
+body {
+  display: flex;
+  flex-direction: column;
+  font-family: system-ui, sans-serif;
+  font-size: 15px;
+  color: #1f2328;
+}
+
+[hidden] {
+  display: none !important;
+}
+
+#header {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 8px 16px;
+  padding: 8px 12px;
+  background: #1f3d2b;
+  color: #fff;
+}
+
+#header .title {
+  font-weight: 600;
+}
+
+#filter {
+  flex: 1 1 180px;
+  max-width: 320px;
+  padding: 4px 8px;
+  border: 1px solid #8aa;
+  border-radius: 4px;
+  font: inherit;
+}
+
+#account {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 8px;
+  margin-left: auto;
+}
+
+#account a,
+#account button {
+  color: #fff;
+  background: #5865f2;
+  border: 0;
+  border-radius: 4px;
+  padding: 4px 10px;
+  font: inherit;
+  text-decoration: none;
+  cursor: pointer;
+}
+
+#account .line {
+  font-size: 13px;
+  opacity: 0.9;
+}
+
+#notice {
+  margin: 0;
+  padding: 6px 12px;
+  background: #fff4cc;
+  border-bottom: 1px solid #e0c060;
+}
+
+#map {
+  flex: 1;
+  min-height: 300px;
+}
+
+.region-label {
+  background: rgba(255, 255, 255, 0.85);
+  border: 0;
+  box-shadow: none;
+  font-weight: 600;
+  color: #203060;
+}
+
+.labels-hidden .region-label {
+  display: none;
+}
+
+.gym-popup .name {
+  display: block;
+  font-size: 15px;
+}
+
+.gym-popup .nickname,
+.gym-popup .regions,
+.gym-popup .address {
+  color: #555;
+}
+
+.gym-popup .elite {
+  color: #8e3ab0;
+  font-weight: 600;
+}
+
+.gym-popup .notice {
+  margin-top: 4px;
+  font-weight: 600;
+}
+
+.gym-popup .description {
+  margin-top: 4px;
+}
+
+.gym-popup .directions {
+  display: inline-block;
+  margin-top: 6px;
+}
diff --git a/src/web/client/notice.test.ts b/src/web/client/notice.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6afe6c5603e90d7c0328de38c1a94beae0b300a2
--- /dev/null
+++ b/src/web/client/notice.test.ts
@@ -0,0 +1,44 @@
+import { describe, expect, it } from 'vitest';
+import { headerLines, loginNotice } from './notice.js';
+
+describe('loginNotice', () => {
+  it('says once why a login did not happen, and gives the address without it', () => {
+    expect(loginNotice('?login=failed')).toEqual({ text: 'Login failed.', search: '' });
+    expect(loginNotice('?login=expired')).toEqual({
+      text: 'This login link has expired. Ask for a new one with /maps.',
+      search: '',
+    });
+    expect(loginNotice('?a=1&login=failed')).toEqual({ text: 'Login failed.', search: '?a=1' });
+  });
+
+  it('says nothing of anything else', () => {
+    expect(loginNotice('')).toBeUndefined();
+    expect(loginNotice('?login=other')).toBeUndefined();
+    expect(loginNotice('?a=1')).toBeUndefined();
+  });
+});
+
+describe('headerLines', () => {
+  it('offers the login there is to somebody who is not logged in', () => {
+    expect(headerLines({ loggedIn: false }, 'discord')).toEqual({ login: true, lines: [] });
+    expect(headerLines({ loggedIn: false }, 'links')).toEqual({
+      login: false,
+      lines: ['Use /maps in Discord to log in.'],
+    });
+  });
+
+  it('names the member, and says when they belong to no server here or Discord is away', () => {
+    const me = { loggedIn: true as const, name: 'Ash', csrf: 't', member: true, readOnly: false };
+    expect(headerLines(me, 'discord')).toEqual({ login: false, name: 'Ash', lines: [] });
+    expect(headerLines({ ...me, member: false }, 'discord')).toEqual({
+      login: false,
+      name: 'Ash',
+      lines: ['You are not a member of this server.'],
+    });
+    expect(headerLines({ ...me, member: false, readOnly: true }, 'links')).toEqual({
+      login: false,
+      name: 'Ash',
+      lines: ['Discord cannot be reached just now, so the map is read-only.'],
+    });
+  });
+});
diff --git a/src/web/client/notice.ts b/src/web/client/notice.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f8bc49e5fa29ae72afef76df02095da5214b88cd
--- /dev/null
+++ b/src/web/client/notice.ts
@@ -0,0 +1,43 @@
+/** Who is asking, as `/s/<guild>/api/me` answers. */
+export type Me =
+  | { loggedIn: false }
+  | { loggedIn: true; name: string; csrf: string; member: boolean; readOnly: boolean };
+
+const NOTICES: Readonly<Record<string, string>> = {
+  failed: 'Login failed.',
+  expired: 'This login link has expired. Ask for a new one with /maps.',
+};
+
+/**
+ * Why a login did not happen (`?login=failed|expired`, set by the server's redirect), said
+ * once: the text, and the query without it for `history.replaceState`.
+ */
+export function loginNotice(search: string): { text: string; search: string } | undefined {
+  const query = new URLSearchParams(search);
+  const text = NOTICES[query.get('login') ?? ''];
+  if (text === undefined) return undefined;
+  query.delete('login');
+  const rest = query.toString();
+  return { text, search: rest === '' ? '' : `?${rest}` };
+}
+
+/**
+ * What the page's header says: "Log in with Discord" (only where it is offered) or how else to
+ * log in, or the member's name with what keeps them from more than the public map.
+ */
+export function headerLines(
+  me: Me,
+  login: 'discord' | 'links',
+): { login: boolean; name?: string; lines: string[] } {
+  if (!me.loggedIn) {
+    return login === 'discord'
+      ? { login: true, lines: [] }
+      : { login: false, lines: ['Use /maps in Discord to log in.'] };
+  }
+  const lines = me.readOnly
+    ? ['Discord cannot be reached just now, so the map is read-only.']
+    : me.member
+      ? []
+      : ['You are not a member of this server.'];
+  return { login: false, name: me.name, lines };
+}
diff --git a/src/web/client/popup.test.ts b/src/web/client/popup.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d18193e03ac9543eb3520452d984bd7e2aa2fedf
--- /dev/null
+++ b/src/web/client/popup.test.ts
@@ -0,0 +1,130 @@
+import { describe, expect, it } from 'vitest';
+import { gymPopup, regionLabel, renderNode, type MapGym, type PageNode } from './popup.js';
+
+const gym = (more: Partial<MapGym> = {}): MapGym => ({
+  id: 1,
+  name: 'Pinewood Public Library',
+  nickname: 'The Stacks',
+  lat: 40.05,
+  lon: -80.05,
+  regionIds: [1, 2],
+  address: '12 Maple Avenue, Pinewood',
+  description: 'Mural of readers',
+  notice: 'Closed on Sundays',
+  elite: false,
+  ...more,
+});
+
+const regions = new Map([
+  [1, 'west'],
+  [2, 'east'],
+]);
+
+/** Every text of a tree, in order. */
+function texts(node: PageNode): string[] {
+  return [...(node.text === undefined ? [] : [node.text]), ...(node.children ?? []).flatMap(texts)];
+}
+
+/** A document just big enough for `renderNode`; it records what was asked of it. */
+function fakeDocument() {
+  interface FakeElement {
+    tag: string;
+    className: string;
+    textContent: string;
+    attributes: Record<string, string>;
+    children: FakeElement[];
+    setAttribute(name: string, value: string): void;
+    append(child: FakeElement): void;
+  }
+  const document = {
+    createElement(tag: string): FakeElement {
+      const element: FakeElement = {
+        tag,
+        className: '',
+        textContent: '',
+        attributes: {},
+        children: [],
+        setAttribute(name, value) {
+          element.attributes[name] = value;
+        },
+        append(child) {
+          element.children.push(child);
+        },
+      };
+      return element;
+    },
+  };
+  return document;
+}
+
+describe('gymPopup', () => {
+  it('names the gym, its nickname, regions, address and notes, and a way there', () => {
+    const popup = gymPopup(gym(), regions);
+    expect(texts(popup)).toEqual([
+      'Pinewood Public Library',
+      'The Stacks',
+      'Regions: west, east',
+      '12 Maple Avenue, Pinewood',
+      'Closed on Sundays',
+      'Mural of readers',
+      'Directions',
+    ]);
+    const link = popup.children?.at(-1);
+    expect(link).toMatchObject({
+      tag: 'a',
+      attributes: {
+        href: 'https://www.google.com/maps/dir/?api=1&destination=40.05,-80.05',
+        target: '_blank',
+        rel: 'noopener noreferrer',
+      },
+    });
+  });
+
+  it('says an elite raid gym, one region, and leaves out what the gym does not have', () => {
+    const popup = gymPopup(
+      gym({
+        nickname: null,
+        address: null,
+        description: null,
+        notice: null,
+        regionIds: [2],
+        elite: true,
+      }),
+      regions,
+    );
+    expect(texts(popup)).toEqual([
+      'Pinewood Public Library',
+      'Elite raid gym',
+      'Region: east',
+      'Directions',
+    ]);
+  });
+
+  it('keeps markup in what members wrote as text, never as HTML', () => {
+    const name = '<img src=x onerror="alert(1)">';
+    const popup = gymPopup(gym({ name, nickname: '<b>bold</b>' }), regions);
+    const element = renderNode(popup, fakeDocument());
+    expect(element.children[0]).toMatchObject({ tag: 'strong', textContent: name });
+    expect(element.children[1]).toMatchObject({ textContent: '<b>bold</b>' });
+    expect(JSON.stringify(element)).not.toContain('innerHTML');
+  });
+
+  it('builds an element per node, with its class and attributes', () => {
+    const element = renderNode(gymPopup(gym(), regions), fakeDocument());
+    expect(element).toMatchObject({ tag: 'div', className: 'gym-popup' });
+    expect(element.children.at(-1)).toMatchObject({
+      tag: 'a',
+      textContent: 'Directions',
+      attributes: { target: '_blank' },
+    });
+  });
+});
+
+describe('regionLabel', () => {
+  it('keeps markup in a channel name as text, never as HTML', () => {
+    const name = '<img src=x onerror="alert(1)">';
+    const element = renderNode(regionLabel(name), fakeDocument());
+    expect(element).toMatchObject({ tag: 'span', className: 'region-name', textContent: name });
+    expect(element.children).toEqual([]);
+  });
+});
diff --git a/src/web/client/popup.ts b/src/web/client/popup.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3337c8dfafe84f9f15851e0263211bfa20b0ee25
--- /dev/null
+++ b/src/web/client/popup.ts
@@ -0,0 +1,88 @@
+import type { GeoView } from '../../domain/web/geo-data.js';
+
+/** A gym as the page has it from `/api/geo`. */
+export type MapGym = GeoView['gyms'][number];
+
+/**
+ * A piece of the page as data: an element, its class and attributes, and either its text or
+ * its children. `renderNode` makes elements of it, setting text only as `textContent`: what
+ * members wrote never becomes HTML.
+ */
+export interface PageNode {
+  tag: string;
+  className?: string;
+  text?: string;
+  attributes?: Record<string, string>;
+  children?: PageNode[];
+}
+
+/** What `renderNode` needs of an element: the DOM's, or a test's. */
+export interface ElementLike<E> {
+  className: string;
+  textContent: string | null;
+  setAttribute(name: string, value: string): void;
+  append(child: E): void;
+}
+
+/** Makes the elements of a node and its children. */
+export function renderNode<E extends ElementLike<E>>(
+  node: PageNode,
+  document: { createElement(tag: string): E },
+): E {
+  const element = document.createElement(node.tag);
+  if (node.className !== undefined) element.className = node.className;
+  for (const [name, value] of Object.entries(node.attributes ?? {})) {
+    element.setAttribute(name, value);
+  }
+  if (node.text !== undefined) element.textContent = node.text;
+  for (const child of node.children ?? []) element.append(renderNode(child, document));
+  return element;
+}
+
+/**
+ * The label of a region on the map: its channel's name as text. Leaflet sets a string given as
+ * a tooltip's or popup's content as HTML, so names go to it as nodes built from this.
+ */
+export function regionLabel(name: string): PageNode {
+  return { tag: 'span', className: 'region-name', text: name };
+}
+
+const line = (className: string, text: string | null): PageNode[] =>
+  text === null || text.trim() === '' ? [] : [{ tag: 'div', className, text }];
+
+/**
+ * The popup of a gym (spec 3.1): its name, nickname, "Elite raid gym", its regions, address
+ * line, notice and description, and "Directions" (Google Maps, a route to its place, in a new
+ * tab that does not learn where it came from).
+ */
+export function gymPopup(gym: MapGym, regionNames: ReadonlyMap<number, string>): PageNode {
+  const regions = gym.regionIds.flatMap((id) => {
+    const name = regionNames.get(id);
+    return name === undefined ? [] : [name];
+  });
+  const directions = `https://www.google.com/maps/dir/?api=1&destination=${gym.lat},${gym.lon}`;
+  return {
+    tag: 'div',
+    className: 'gym-popup',
+    children: [
+      { tag: 'strong', className: 'name', text: gym.name },
+      ...line('nickname', gym.nickname),
+      ...(gym.elite ? [{ tag: 'div', className: 'elite', text: 'Elite raid gym' }] : []),
+      ...line(
+        'regions',
+        regions.length === 0
+          ? null
+          : `${regions.length === 1 ? 'Region' : 'Regions'}: ${regions.join(', ')}`,
+      ),
+      ...line('address', gym.address),
+      ...line('notice', gym.notice),
+      ...line('description', gym.description),
+      {
+        tag: 'a',
+        className: 'directions',
+        text: 'Directions',
+        attributes: { href: directions, target: '_blank', rel: 'noopener noreferrer' },
+      },
+    ],
+  };
+}
diff --git a/src/web/client/tsconfig.json b/src/web/client/tsconfig.json
new file mode 100644
index 0000000000000000000000000000000000000000..f78a27c5f339b9c567838441f0673e3fb8f4cc85
--- /dev/null
+++ b/src/web/client/tsconfig.json
@@ -0,0 +1,9 @@
+{
+  "extends": "../../../tsconfig.json",
+  "compilerOptions": {
+    "lib": ["ES2023", "DOM", "DOM.Iterable"],
+    "types": []
+  },
+  "include": ["**/*.ts"],
+  "exclude": []
+}
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index b16ba787439583bc7fa32d41d485eef79fcc1d3e..118613a5f94d5481bc18f5bca5460c1f724b4b8a 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -1,7 +1,8 @@
 import type { FastifyInstance, FastifyRequest } from 'fastify';
 import { isSnowflake } from '../db/snowflake.js';
-import { sendFailure } from './answers.js';
+import { sendFailure, shortPage } from './answers.js';
 import { etagMatches } from './geo-cache.js';
+import { mapPage } from './page.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -24,6 +25,29 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
     if (!isSnowflake(guild) || !deps.servers.has(guild)) return sendFailure(request, reply, 404);
   });
 
+  // The map page (spec 3.1): the static template, told the server, the tiles and how to log in.
+  scope.get('/map', async (request: GuildRequest, reply) => {
+    void reply.type('text/html; charset=utf-8').header('cache-control', 'no-cache');
+    const { manifest } = deps.assets;
+    if (!manifest) {
+      return reply
+        .code(503)
+        .send(shortPage('The map has not been built yet: run npm run web:build.'));
+    }
+    const google = deps.settings.tiles === 'google' && deps.googleKey !== undefined;
+    return reply.send(
+      mapPage(
+        {
+          guildId: request.params.guild,
+          tiles: google ? 'google' : 'osm',
+          googleKey: google ? deps.googleKey : undefined,
+          login: deps.oauth ? 'discord' : 'links',
+        },
+        manifest,
+      ),
+    );
+  });
+
   // Who is asking (spec 2.5): the page's header, whether they are a member of this server (one
   // login for every server: membership is asked per server, from Discord, kept a minute by the
   // directory), and the CSRF token its POSTs carry. When Discord cannot say, the page is
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2f531351b3382932f733b597a675747a3180b95e
--- /dev/null
+++ b/src/web/page.test.ts
@@ -0,0 +1,119 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { builtAssets, webServerWith, type TestWeb } from '../../test/support/web.js';
+
+const MAP = `/s/${FAKE_GUILD_ID}/map`;
+
+/** The attributes of the page's `<body>`. */
+function bodyData(html: string): Record<string, string> {
+  const body = /<body([^>]*)>/.exec(html)?.[1] ?? '';
+  return Object.fromEntries(
+    [...body.matchAll(/(data-[\w-]+)="([^"]*)"/g)].map((m): [string, string] => [
+      m[1] ?? '',
+      m[2] ?? '',
+    ]),
+  );
+}
+
+describe('the map page', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("loads the bundle's script and style, and nothing inline", async () => {
+    web = webServerWith({ assets: builtAssets() });
+    const page = await web.app.inject({ url: MAP });
+    expect(page.statusCode).toBe(200);
+    expect(page.headers['content-type']).toMatch(/^text\/html/);
+    expect(page.headers['cache-control']).toBe('no-cache');
+    expect(page.body).toContain('<script src="/assets/map-ABCDEFGH.js" defer></script>');
+    expect(page.body).toContain('<link rel="stylesheet" href="/assets/map-IJKLMNOP.css">');
+    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
+    expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
+    expect(bodyData(page.body)).toEqual({
+      'data-guild': FAKE_GUILD_ID,
+      'data-tiles': 'osm',
+      'data-login': 'discord',
+    });
+  });
+
+  it("gives the page Google's tiles and the browser key only when both are set", async () => {
+    web = webServerWith({
+      assets: builtAssets(),
+      web: { tiles: 'google' },
+      googleKey: 'browser"key<',
+    });
+    const page = await web.app.inject({ url: MAP });
+    expect(bodyData(page.body)).toMatchObject({
+      'data-tiles': 'google',
+      'data-google-key': 'browser&quot;key&lt;',
+    });
+    expect(page.headers['content-security-policy']).toContain('https://tile.googleapis.com');
+    await web.app.close();
+
+    web = webServerWith({ assets: builtAssets(), web: { tiles: 'google' } });
+    const without = await web.app.inject({ url: MAP });
+    expect(bodyData(without.body)).toEqual({
+      'data-guild': FAKE_GUILD_ID,
+      'data-tiles': 'osm',
+      'data-login': 'discord',
+    });
+    expect(without.headers['content-security-policy']).not.toContain('googleapis');
+  });
+
+  it('offers no login with Discord without the client secret', async () => {
+    web = webServerWith({ assets: builtAssets(), oauth: undefined });
+    const page = await web.app.inject({ url: MAP });
+    expect(bodyData(page.body)['data-login']).toBe('links');
+  });
+
+  it('is not found for a server the bot is not in', async () => {
+    web = webServerWith({ assets: builtAssets() });
+    const page = await web.app.inject({ url: '/s/412345678901234999/map' });
+    expect(page.statusCode).toBe(404);
+    expect(page.headers['content-type']).toMatch(/^text\/html/);
+  });
+
+  it('says so when the bundle was not built', async () => {
+    web = webServerWith();
+    const page = await web.app.inject({ url: MAP });
+    expect(page.statusCode).toBe(503);
+    expect(page.body).toContain('npm run web:build');
+  });
+});
+
+describe('the files of the bundle', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it('are kept for good when their name carries a hash, and asked again otherwise', async () => {
+    web = webServerWith({ assets: builtAssets() });
+    const script = await web.app.inject({ url: '/assets/map-ABCDEFGH.js' });
+    expect(script.statusCode).toBe(200);
+    expect(script.headers['content-type']).toMatch(/javascript/);
+    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
+    expect(script.headers['x-content-type-options']).toBe('nosniff');
+    const plain = await web.app.inject({ url: '/assets/notes.txt' });
+    expect(plain.statusCode).toBe(200);
+    expect(plain.headers['cache-control']).toBe('no-cache');
+  });
+
+  it('are never listed, and nothing outside them is served', async () => {
+    web = webServerWith({ assets: builtAssets() });
+    for (const url of [
+      '/assets/',
+      '/assets',
+      '/assets/../assets.json',
+      '/assets/%2e%2e/assets.json',
+      '/assets/missing.js',
+    ]) {
+      const answer = await web.app.inject({ url });
+      expect(answer.statusCode, url).toBe(404);
+    }
+  });
+});
diff --git a/src/web/page.ts b/src/web/page.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ab16f17e540391a2f1b2ab82ff638b59f75fd325
--- /dev/null
+++ b/src/web/page.ts
@@ -0,0 +1,88 @@
+import { readFile } from 'node:fs/promises';
+import path from 'node:path';
+import { escapeHtml } from './answers.js';
+
+/** Where `npm run web:build` leaves the bundle, from the bot's working folder. */
+export const WEB_DIST = 'dist/web';
+
+/** The names of the bundle's script and style, hashed (`dist/web/assets.json`). */
+export interface AssetManifest {
+  script: string;
+  style: string;
+}
+
+/** The built bundle: its folder, served at `/assets/`, and the names the page loads. */
+export interface WebAssets {
+  dir: string;
+  /** Undefined when the bundle was not built: the page then says so. */
+  manifest: AssetManifest | undefined;
+}
+
+/** A name esbuild gave a hash (`[name]-[hash]`): its content never changes under it. */
+export const HASHED_NAME = /-[A-Z0-9]{8}\.[a-z0-9]+$/;
+
+/**
+ * The bundle as the build left it: `dist/web/assets` and the names in `dist/web/assets.json`.
+ * Without the manifest (not built) the folder is still given, and the manifest is undefined.
+ */
+export async function readAssets(root = WEB_DIST): Promise<WebAssets> {
+  const dir = path.resolve(root, 'assets');
+  try {
+    const manifest = JSON.parse(
+      await readFile(path.join(root, 'assets.json'), 'utf8'),
+    ) as Partial<AssetManifest>;
+    if (typeof manifest.script !== 'string' || typeof manifest.style !== 'string') {
+      return { dir, manifest: undefined };
+    }
+    return { dir, manifest: { script: manifest.script, style: manifest.style } };
+  } catch {
+    return { dir, manifest: undefined };
+  }
+}
+
+/** What the map page is told: in `data-` attributes of `<body>`, escaped. */
+export interface MapPageData {
+  guildId: string;
+  /** The tiles the page offers: Google's only with a browser key. */
+  tiles: 'osm' | 'google';
+  /** The browser key, only with Google's tiles. */
+  googleKey?: string;
+  /** How a member logs in: with Discord, or only through the links of `/maps`. */
+  login: 'discord' | 'links';
+}
+
+/**
+ * The map page (spec 3.1): a static template that loads the bundle's script and style, with
+ * nothing inline (the CSP allows no inline script or style); what the page needs to know is in
+ * `data-` attributes of `<body>`, escaped. The script builds everything else.
+ */
+export function mapPage(data: MapPageData, assets: AssetManifest): string {
+  const attributes = [
+    `data-guild="${escapeHtml(data.guildId)}"`,
+    `data-tiles="${data.tiles}"`,
+    ...(data.tiles === 'google' && data.googleKey !== undefined
+      ? [`data-google-key="${escapeHtml(data.googleKey)}"`]
+      : []),
+    `data-login="${data.login}"`,
+  ];
+  return [
+    '<!doctype html>',
+    '<html lang="en">',
+    '<head>',
+    '<meta charset="utf-8">',
+    '<meta name="viewport" content="width=device-width, initial-scale=1">',
+    '<title>Professor Pine: map</title>',
+    `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
+    `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
+    '</head>',
+    `<body ${attributes.join(' ')}>`,
+    '<header id="header"><span class="title">Professor Pine</span>',
+    '<input id="filter" type="search" placeholder="Find a gym" aria-label="Find a gym">',
+    '<span id="account"></span></header>',
+    '<p id="notice" hidden></p>',
+    '<main id="map" aria-label="Map"></main>',
+    '<noscript><p>The map needs JavaScript.</p></noscript>',
+    '</body>',
+    '</html>',
+  ].join('\n');
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index c47e94613de140abf88c46b756e1b7cf77b09e3d..89fd8e044f9beabefadc8c597831812084425d63 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -1,4 +1,5 @@
 import fastifyCookie from '@fastify/cookie';
+import fastifyStatic from '@fastify/static';
 import Fastify, { type FastifyInstance } from 'fastify';
 import type { Settings } from '../config/settings.js';
 import type { MemberDirectory } from '../discord/member-directory.js';
@@ -11,6 +12,7 @@ import type { GeoCache } from './geo-cache.js';
 import { guildRoutes } from './guild-routes.js';
 import { securityHeaders } from './headers.js';
 import type { LoginLinks } from './login-links.js';
+import { HASHED_NAME, type WebAssets } from './page.js';
 import type { Sessions } from './sessions.js';
 
 /** `settings.web` once it is set. */
@@ -34,6 +36,8 @@ export interface WebDeps {
   loginLinks: LoginLinks;
   /** The public view of each server's regions and gyms. */
   geo: GeoCache;
+  /** The page's bundle (`readAssets`). */
+  assets: WebAssets;
   now: () => number;
   log: Logger;
 }
@@ -97,6 +101,23 @@ export function buildWebServer(deps: WebDeps): FastifyInstance {
       .type('text/html; charset=utf-8')
       .send(shortPage("Professor Pine's map is at an address of each server: use /maps there.")),
   );
+  // The bundle: no index, no listing; a hashed name is kept for good, anything else asked again.
+  void app.register(fastifyStatic, {
+    root: deps.assets.dir,
+    prefix: '/assets/',
+    index: false,
+    list: false,
+    cacheControl: false,
+    dotfiles: 'deny',
+    // The bundle is one flat folder: anything but a plain file name in it is not found.
+    allowedPath: (pathName) => /^\/[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(pathName),
+    setHeaders(reply, file) {
+      void reply.header(
+        'cache-control',
+        HASHED_NAME.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
+      );
+    },
+  });
   void app.register((instance, _options, done) => {
     authRoutes(instance, deps);
     done();
diff --git a/test/support/web.ts b/test/support/web.ts
index 14d19102ae970f19c80dd8b3895757a879f1f624..d7d03044429d715c48fd3be04f6bd4338ff4ae8d 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -1,4 +1,7 @@
+import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
 import type { OutgoingHttpHeaders } from 'node:http';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
 import type { FastifyInstance } from 'fastify';
 import type { Logger } from 'pino';
 import type { MemberDirectory } from '../../src/discord/member-directory.js';
@@ -6,6 +9,7 @@ import { RegionDirectory } from '../../src/services/region-directory.js';
 import type { OAuthGateway, OAuthUser } from '../../src/web/discord-oauth.js';
 import { GeoCache, type GeoSources } from '../../src/web/geo-cache.js';
 import { LoginLinks } from '../../src/web/login-links.js';
+import type { WebAssets } from '../../src/web/page.js';
 import { buildWebServer, type WebDeps, type WebSettings } from '../../src/web/server.js';
 import { SESSION_COOKIE, Sessions } from '../../src/web/sessions.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
@@ -125,6 +129,24 @@ export interface WebTestOptions {
   googleKey?: string;
   /** Where the map's view is built from (`geoSourcesWith`); nothing by default. */
   geo?: { sources: GeoSources };
+  /** The built bundle (`builtAssets`); by default none was built. */
+  assets?: WebAssets;
+}
+
+/**
+ * A bundle as `npm run web:build` leaves it, in a folder of its own: the script and style with
+ * hashes in their names, a file without one, and a file beside the folder that must not be
+ * reached through it.
+ */
+export function builtAssets(): WebAssets {
+  const root = mkdtempSync(path.join(tmpdir(), 'pine-web-'));
+  const dir = path.join(root, 'assets');
+  mkdirSync(dir);
+  writeFileSync(path.join(dir, 'map-ABCDEFGH.js'), 'console.log("map");');
+  writeFileSync(path.join(dir, 'map-IJKLMNOP.css'), 'body { margin: 0; }');
+  writeFileSync(path.join(dir, 'notes.txt'), 'notes');
+  writeFileSync(path.join(root, 'assets.json'), '{}');
+  return { dir, manifest: { script: 'map-ABCDEFGH.js', style: 'map-IJKLMNOP.css' } };
 }
 
 /** A web server built as the bot builds it, over fakes; `entries` is what it logged. */
@@ -168,6 +190,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     oauth: gateway && { appId: TEST_APP_ID, gateway },
     loginLinks,
     geo: new GeoCache(options.geo?.sources ?? NOTHING),
+    assets: options.assets ?? { dir: path.join(tmpdir(), 'pine-web-none'), manifest: undefined },
     now: () => clock.now,
     log,
   });
diff --git a/tsconfig.build.json b/tsconfig.build.json
index cf6ba60cc62c110dce484905ef6ed6346ef75452..a3c4edf920295431fdcec3d345b7259da5d164c4 100644
--- a/tsconfig.build.json
+++ b/tsconfig.build.json
@@ -2,5 +2,5 @@
   "extends": "./tsconfig.json",
   "compilerOptions": { "noEmit": false, "rootDir": "src", "outDir": "dist" },
   "include": ["src"],
-  "exclude": ["src/**/*.test.ts"]
+  "exclude": ["src/**/*.test.ts", "src/web/client"]
 }
diff --git a/tsconfig.json b/tsconfig.json
index 181be31e74f49a1670133943accc544db21b7045..a7eb19b7b7316bbc2e7954db9a079791325314e0 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -18,5 +18,6 @@
     "rootDir": ".",
     "noEmit": true
   },
-  "include": ["src", "test", "scripts", "vitest.config.ts"]
+  "include": ["src", "test", "scripts", "vitest.config.ts"],
+  "exclude": ["src/web/client"]
 }
````

### Task 7: The maps command gives the server's map with a login link

Prototype commit: `9294428920f7b812d2fa8ed4c435148bedd7e998`

With `settings.web`, `/maps` answers the address of this server's map and a single-use login link (`ctx.loginLinks`), named by the member's account (`globalName ?? username`); `defer: 'late'`, `MEMBER_WRITE_THROTTLE` (a link is a write); `settings.regionMapLink` as before when the web pages are off. Its description changes (registration again at staging). The `REGION_MAP_LINK` warning no longer says `/maps` is not offered when the web pages are on.

**Files:**

```
 src/app-context.ts                |   3 ++
 src/app.ts                        |   1 +
 src/commands/util/maps.test.ts    | 126 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/util/maps.ts         |  81 ++++++++++++++++++++++++++++++++++++++++----------
 src/config/warnings.test.ts       |  18 ++++++++++++
 src/config/warnings.ts            |   7 +++--
 test/support/fake-interactions.ts |   9 +++++-
 test/support/test-context.ts      |   3 ++
 8 files changed, 229 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit src/commands/util/maps.test.ts src/config/warnings.test.ts src/web/login.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app-context.ts src/app.ts src/commands/util/maps.test.ts src/commands/util/maps.ts src/config/warnings.test.ts src/config/warnings.ts test/support/fake-interactions.ts test/support/test-context.ts` and `npx eslint src/app-context.ts src/app.ts src/commands/util/maps.test.ts src/commands/util/maps.ts src/config/warnings.test.ts src/config/warnings.ts test/support/fake-interactions.ts test/support/test-context.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 9294428920f7b812d2fa8ed4c435148bedd7e998 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `The maps command gives the server's map with a login link`, the paragraph above as the body and the trailer, staging exactly
  `src/app-context.ts src/app.ts src/commands/util/maps.test.ts src/commands/util/maps.ts src/config/warnings.test.ts src/config/warnings.ts test/support/fake-interactions.ts test/support/test-context.ts`.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index b0a0865f8a749e54a3753ca87500cba8cbc6f769..cae5dd419a9a383fab84fff6e93f5c1373732e26 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -37,6 +37,7 @@ import type { TimedPartyService } from './services/timed-party-service.js';
 import type { TrainService } from './services/train-service.js';
 import type { WayfarerImportService } from './services/wayfarer-import-service.js';
 import type { WayfarerReviewService } from './services/wayfarer-review-service.js';
+import type { LoginLinks } from './web/login-links.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -116,6 +117,8 @@ export interface AppContext {
   readonly screenshots: Screenshots;
   /** Emoji by name: the application's, then a server's (`/counters` shows types). */
   readonly emoji: EmojiFinder;
+  /** The login links of the web pages that `/maps` gives (plan 8M-1), shared with the server. */
+  readonly loginLinks: LoginLinks;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
diff --git a/src/app.ts b/src/app.ts
index a2ccc1d025e1a8a03e949a18a300dfc520437baf..9b6093278c9984e11a512633056854d68255038d 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -513,6 +513,7 @@ export async function startApp(
     pokemon,
     nicknames: pokemon,
     maps,
+    loginLinks,
     // Gym requests; without GITHUB_TOKEN and GITHUB_REPO `/request` is not offered.
     issues: new GitHubIssues({
       token: config.env.GITHUB_TOKEN,
diff --git a/src/commands/util/maps.test.ts b/src/commands/util/maps.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9e529d15824f180b796b3297b5cbd42b8f751447
--- /dev/null
+++ b/src/commands/util/maps.test.ts
@@ -0,0 +1,126 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  answered,
+  asV2,
+  fakeChatInput,
+  FAKE_GUILD_ID,
+  sent,
+} from '../../../test/support/fake-interactions.js';
+import { buttonsOf, textOf } from '../../../test/support/messages.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { TEST_WEB } from '../../../test/support/web.js';
+import type { Settings } from '../../config/settings.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { maps } from './maps.js';
+
+const ASH = '700000000000000001';
+const LINK = 'https://maps.example.test/regions';
+
+function setup(settings: Partial<Settings>) {
+  const base = createTestContext();
+  const { ctx } = createTestContext({
+    config: { ...base.ctx.config, settings: { ...base.ctx.config.settings, ...settings } },
+  });
+  const router = new InteractionRouter(ctx, [maps], []);
+  const run = async (extra: object = {}) => {
+    const interaction = fakeChatInput({
+      commandName: 'maps',
+      userId: ASH,
+      // Their name in this server; the link's session (one for every server) takes the account's.
+      displayName: 'Ash of Pinewood',
+      globalName: 'Ash',
+      username: 'ash_k',
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ctx, run };
+}
+
+describe('/maps', () => {
+  it('is offered where there is a map: the web pages, or the address of a map', () => {
+    const { ctx } = createTestContext();
+    const settings = ctx.config.settings;
+    expect(
+      maps.enabled?.({ ...ctx.config, settings: { ...settings, regionMapLink: undefined } }),
+    ).toBe(false);
+    expect(maps.enabled?.({ ...ctx.config, settings: { ...settings, regionMapLink: LINK } })).toBe(
+      true,
+    );
+    expect(
+      maps.enabled?.({
+        ...ctx.config,
+        settings: { ...settings, regionMapLink: undefined, web: TEST_WEB },
+      }),
+    ).toBe(true);
+  });
+
+  it("gives the server's map and a link that logs the member in, privately", async () => {
+    const { ctx, run } = setup({ web: TEST_WEB, regionMapLink: LINK });
+    const used = await run();
+    const payload = answered(used);
+    expect((payload.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
+    const message = asV2(payload);
+    expect(textOf(message)).toContain(`https://map.example.test/s/${FAKE_GUILD_ID}/map`);
+    const [button] = buttonsOf(message);
+    expect(button?.label).toBe('Open the map (logs you in)');
+    const url = new URL(button?.url ?? '');
+    const prefix = `/auth/link/${FAKE_GUILD_ID}/`;
+    expect(url.origin).toBe('https://map.example.test');
+    expect(url.pathname.startsWith(prefix)).toBe(true);
+    const token = url.pathname.slice(prefix.length);
+    expect(ctx.loginLinks.redeem(token, Date.now())).toEqual({
+      guildId: FAKE_GUILD_ID,
+      userId: ASH,
+      userName: 'Ash',
+    });
+  });
+
+  it("names the link's member by their username when they have no display name", async () => {
+    const { ctx, run } = setup({ web: TEST_WEB });
+    const url = new URL(buttonsOf(asV2(answered(await run({ globalName: null }))))[0]?.url ?? '');
+    const token = url.pathname.split('/').at(-1) ?? '';
+    expect(ctx.loginLinks.redeem(token, Date.now())?.userName).toBe('ash_k');
+  });
+
+  it('gives a new link each time', async () => {
+    const { run } = setup({ web: TEST_WEB });
+    const first = buttonsOf(asV2(answered(await run())))[0]?.url;
+    const second = buttonsOf(asV2(answered(await run())))[0]?.url;
+    expect(first).not.toBe(second);
+  });
+
+  it('sends a member who asks in a DM to their server, or to the map of all regions', async () => {
+    const onlyWeb = setup({ web: TEST_WEB, regionMapLink: undefined });
+    expect(sent((await onlyWeb.run({ isDm: true })).reply).content).toBe(
+      'Use /maps in your server.',
+    );
+    const both = setup({ web: TEST_WEB, regionMapLink: LINK });
+    expect(sent((await both.run({ isDm: true })).reply).content).toBe(
+      `The map of all regions: ${LINK}`,
+    );
+  });
+
+  it('gives the address of the map of all regions without the web pages', async () => {
+    const { run } = setup({ web: undefined, regionMapLink: LINK });
+    for (const extra of [{}, { isDm: true }]) {
+      const reply = sent((await run(extra)).reply);
+      expect(reply.content).toBe(`The map of all regions: ${LINK}`);
+      expect((reply.flags ?? 0) & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
+    }
+  });
+
+  it('says in its help what it gives', () => {
+    const { ctx } = createTestContext();
+    const details = (settings: Settings) => {
+      const help = maps.help.details;
+      return typeof help === 'function' ? help(settings) : (help ?? '');
+    };
+    expect(details({ ...ctx.config.settings, web: TEST_WEB })).toMatch(/logs you in/);
+    expect(details({ ...ctx.config.settings, regionMapLink: LINK, web: undefined })).not.toMatch(
+      /logs you in/,
+    );
+  });
+});
diff --git a/src/commands/util/maps.ts b/src/commands/util/maps.ts
index aa4e0677dc51aae98931e509c94b3dbe55fe9ad5..16176921140d4f1c0e95c42ce05c5980a3c5b26f 100644
--- a/src/commands/util/maps.ts
+++ b/src/commands/util/maps.ts
@@ -1,31 +1,80 @@
-import { InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
+import { InteractionContextType, SlashCommandBuilder } from 'discord.js';
 import type { SimpleCommand } from '../../discord/command.js';
-import { MEMBER_READ_THROTTLE } from '../../discord/throttle.js';
+import { answer, v2Answer } from '../../discord/late-reply.js';
+import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
+import { actionRow, LIST_COLOUR, linkButton, textMessage } from '../../render/v2.js';
 
 /**
- * `/maps` (the legacy `!maps`): the address of the map of all regions
- * (`settings.regionMapLink`), for the member alone; offered only where it is set. Anywhere, a
- * DM with the bot and the post of a party too: the legacy bot sent it by DM to keep raid
- * channels quiet, and a private answer is as quiet.
+ * `/maps` (the legacy `!maps`), for the member alone. With the web pages (`settings.web`, plan
+ * 8M-1): the address of the server's map and a button that opens it logged in (a login link of
+ * five minutes, once; issuing one is a write, hence `MEMBER_WRITE_THROTTLE`); in a DM, which
+ * names no server, the map of all regions where `settings.regionMapLink` is set, else where to
+ * ask. Without them: the address of the map of all regions, anywhere. Offered where either is
+ * set; also in a DM with the bot and the post of a party: the legacy bot sent it by DM to keep
+ * raid channels quiet, and a private answer is as quiet.
  */
 export const maps: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('maps')
-    .setDescription('The map of all regions')
+    .setDescription('The map of the regions and gyms')
     .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),
   help: {
     category: 'util',
-    details: 'Gives you the address of a map that shows every region. Only you see the answer.',
+    details: (settings) =>
+      settings.web
+        ? "Gives you the address of this server's map of regions and gyms, and a button that " +
+          'opens it and logs you in (it works once, within five minutes). Only you see the answer.'
+        : 'Gives you the address of a map that shows every region. Only you see the answer.',
     examples: ['/maps'],
   },
-  enabled: (config) => config.settings.regionMapLink !== undefined,
-  throttle: MEMBER_READ_THROTTLE,
+  enabled: (config) =>
+    config.settings.regionMapLink !== undefined || config.settings.web !== undefined,
+  throttle: MEMBER_WRITE_THROTTLE,
+  defer: 'late',
   async execute(interaction, ctx) {
-    const link = ctx.config.settings.regionMapLink;
-    await interaction.reply({
-      content:
-        link === undefined ? 'There is no map of the regions.' : `The map of all regions: ${link}`,
-      flags: MessageFlags.Ephemeral,
-    });
+    const { web, regionMapLink } = ctx.config.settings;
+    if (web && interaction.inGuild()) {
+      const guild = interaction.guildId;
+      // One login serves every server: the session is named as the account is, not as the
+      // member is named in this server (as logging in with Discord names it).
+      const { user } = interaction;
+      const token = ctx.loginLinks.issue(
+        guild,
+        user.id,
+        user.globalName ?? user.username,
+        Date.now(),
+      );
+      const map = `${web.publicUrl}/s/${guild}/map`;
+      await answer(
+        interaction,
+        v2Answer(
+          textMessage(
+            LIST_COLOUR,
+            [
+              `### The map of this server\nIts regions and gyms: ${map}`,
+              '-# The button logs you in as well. It works once, within five minutes; ' +
+                'use /maps again for another.',
+            ],
+            [
+              actionRow([
+                linkButton(
+                  'Open the map (logs you in)',
+                  undefined,
+                  `${web.publicUrl}/auth/link/${guild}/${token}`,
+                ),
+              ]),
+            ],
+          ),
+        ),
+      );
+      return;
+    }
+    const content =
+      regionMapLink !== undefined
+        ? `The map of all regions: ${regionMapLink}`
+        : web
+          ? 'Use /maps in your server.'
+          : 'There is no map of the regions.';
+    await answer(interaction, { content });
   },
 };
diff --git a/src/config/warnings.test.ts b/src/config/warnings.test.ts
index 3e444ec54888ae1f054741d8aaa915cc0a169654..bfa6d90612e807e358c2ba96d7e7bd90d067f4a7 100644
--- a/src/config/warnings.test.ts
+++ b/src/config/warnings.test.ts
@@ -12,6 +12,24 @@ describe('configWarnings', () => {
     expect(warnings[0]).toMatch(/REGION_MAP_LINK/);
     expect(warnings[0]).toMatch(/regionMapLink/);
     expect(warnings[0]).not.toContain('maps.example.test');
+    expect(warnings[0]).toMatch(/\/maps is not offered/);
+  });
+
+  it('does not say /maps is missing where the web pages give it', () => {
+    const web = {
+      port: 8080,
+      host: '127.0.0.1',
+      publicUrl: 'https://map.example.test',
+      trustProxy: false,
+      tiles: 'osm' as const,
+    };
+    const [warning, ...more] = configWarnings(
+      { REGION_MAP_LINK: 'https://maps.example.test/regions', DISCORD_CLIENT_SECRET: 'secret' },
+      { regionMapLink: undefined, web },
+    );
+    expect(more).toEqual([]);
+    expect(warning).toMatch(/REGION_MAP_LINK/);
+    expect(warning).not.toMatch(/not offered/);
   });
 
   it('says nothing when the setting is set, or the variable is unset or blank', () => {
diff --git a/src/config/warnings.ts b/src/config/warnings.ts
index bc6da5f4211d008cbc61b6dd4c8e47b2e623ca3f..2a9051e0041f22dd5202c8df5794b9c1b9fe3569 100644
--- a/src/config/warnings.ts
+++ b/src/config/warnings.ts
@@ -30,8 +30,11 @@ export function configWarnings(
   const warnings: string[] = [];
   if ((raw.REGION_MAP_LINK ?? '').trim() !== '' && settings.regionMapLink === undefined) {
     warnings.push(
-      'REGION_MAP_LINK is set in the environment but nothing reads it: the map of /maps is the ' +
-        'setting regionMapLink, which is unset, so /maps is not offered',
+      settings.web
+        ? 'REGION_MAP_LINK is set in the environment but nothing reads it: /maps gives the map ' +
+            'of the web pages, and in a DM the setting regionMapLink, which is unset'
+        : 'REGION_MAP_LINK is set in the environment but nothing reads it: the map of /maps is ' +
+            'the setting regionMapLink, which is unset, so /maps is not offered',
     );
   }
   const { ocr } = settings;
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 0dc1889e3479dc3557ab13c32517626602a3b457..6b433357ba6f213db7b2cc39c7638523c6482e43 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -87,6 +87,9 @@ export interface FakeOptions {
   uncachedChannel?: boolean;
   isDm?: boolean;
   userId?: string;
+  /** The account's names, whatever the server: `interaction.user.username` and `.globalName`. */
+  username?: string;
+  globalName?: string | null;
   roleNames?: string[];
   /**
    * The ids of the roles of the server the member holds, for code that works with role ids
@@ -634,7 +637,11 @@ function base(kind: Kind, o: FakeOptions) {
     customId: o.customId,
     guildId,
     channelId,
-    user: { id: o.userId ?? FAKE_USER_ID },
+    user: {
+      id: o.userId ?? FAKE_USER_ID,
+      ...(o.username === undefined ? {} : { username: o.username }),
+      ...(o.globalName === undefined ? {} : { globalName: o.globalName }),
+    },
     member: o.isDm
       ? null
       : {
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 46e875fb58bcafd2c0813c86c3996234ab81b3a6..3d933aa27e571107def2c27148fbb9fafa3e5b6c 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -38,6 +38,7 @@ import { TEST_ENV } from './test-env.js';
 import { unavailableReader } from './screenshots.js';
 import { MemoryUsers } from './users.js';
 import { MemoryWants } from './wants.js';
+import { LoginLinks } from '../../src/web/login-links.js';
 
 export { TEST_SETTINGS_PATH };
 
@@ -138,6 +139,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'pass { pokemon: search, nicknames: search } from nicknameSearchWith()',
     ),
     maps: mapsFixture(),
+    // Links that a test of /maps reads back with `redeem`.
+    loginLinks: new LoginLinks(),
     // Every issue is recorded and opened; a test passes its own to read or fail them.
     issues: new FakeIssues(),
     // Every simulation is asked of a fake that answers the sample for Mewtwo; a test passes its own.
````

### Task 8: Conventions of the web server, setup guide, staging checklist

Prototype commit: `782dec11fe00eabd5d53c2f5401ddeffc7aaa053`

New `docs/architecture/web.md` (the server, settings and secrets, sessions, CSRF, login, the bundle, the CSP, Leaflet and HTML, rules for the routes of 8M-2..5), CLAUDE.md's table, area index and commands; `testing.md` and `utilities.md`; `docs/web-setup.md` (the redirect address in the developer portal, Cloudflare Tunnel to `profpine.com`, Tailscale Funnel, Caddy, checking that `X-Forwarded-For` arrives, the Google browser key and its price); the staging checklist `docs/superpowers/plans/2026-10-16-phase-8m1-staging.md`.

**Files:**

```
 CLAUDE.md                                              |  8 ++++++--
 docs/architecture/testing.md                           |  5 +++++
 docs/architecture/utilities.md                         |  2 +-
 docs/architecture/web.md                               | 45 +++++++++++++++++++++++++++++++++++++++++++++
 docs/superpowers/plans/2026-10-16-phase-8m1-staging.md | 42 ++++++++++++++++++++++++++++++++++++++++++
 docs/web-setup.md                                      | 58 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 157 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check CLAUDE.md docs/architecture/testing.md docs/architecture/utilities.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m1-staging.md docs/web-setup.md`.
- [ ] **Step 4: Check the transcription:** `git diff 782dec11fe00eabd5d53c2f5401ddeffc7aaa053 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Conventions of the web server, setup guide, staging checklist`, the paragraph above as the body and the trailer, staging exactly
  `CLAUDE.md docs/architecture/testing.md docs/architecture/utilities.md docs/architecture/web.md docs/superpowers/plans/2026-10-16-phase-8m1-staging.md docs/web-setup.md`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 2018213aa491d954891be00f3d87c5454597485d..2eda343f09b8004767a2fefb4a3285ede5410a63 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -19,8 +19,10 @@ Discord bot for organising Pokémon Go raids. It is being rewritten from legacy
 | Gantt chart of every phase and task, with status | `docs/superpowers/gantt.html` |
 | Execution ledger for a plan in progress (git-ignored) | `.superpowers/sdd/<plan-name>/progress.md` |
 | Conventions of each subsystem (see "Area index") | `docs/architecture/` |
+| Setting up the web pages (settings, OAuth redirect, tunnel, Google key) | `docs/web-setup.md` |
 | Project subagents: `pine-prototyper` (designs code), `pine-transcriber` (applies briefs), `pine-reviewer` (reviews) | `.claude/agents/` |
 | New TypeScript bot | `src/`, `test/support/`, `test/fixtures/`, `scripts/`, `userscript/` |
+| The web map's page (browser code, its own tsconfig, bundled to `dist/web/assets/`) | `src/web/client/` |
 | Raw game master and text file for rebuilding fixtures (git-ignored) | `var/game-data-source/` |
 | Legacy bot (reference for behaviour parity) | `app/`, `commands/`, `types/`, `index.js` |
 
@@ -51,7 +53,8 @@ A row without dates is drawn right of the now line, so a done task must be dated
 ```bash
 npm run check          # lint + format:check + typecheck + unit tests; must be green before every commit
 npm run test:db        # *.db.test.ts against MySQL in Docker (Testcontainers); about 2 minutes
-npm run build          # compile to dist/
+npm run build          # compile to dist/, then build the web map's page (web:build)
+npm run web:build      # bundle the web map's page (src/web/client/) into dist/web/assets/ and dist/web/assets.json
 npm run db:codegen     # regenerate src/db/types.ts (add `-- --verify` to check it is current)
 npm run db:legacy-fixture   # regenerate the legacy schema fixture from the knex migrations
 npm run fixtures:game-data   # rebuild the game-data test fixtures (add -- --download for a newer game master)
@@ -133,7 +136,8 @@ Each file under `docs/architecture/` holds the conventions of one subsystem. Rea
 - `wayfarer.md`: the export file, S2 cells, the scan, the userscript, matching, `/gym import` and `/gym review`. Read before changing the Wayfarer work.
 - `members-and-roles.md`: member settings and rows, member lookups and viewers, self-assigned roles. Read before changing members or roles.
 - `utilities.md`: game data, the catalogue, Pokémon search, raid tiers and bosses, nicknames, pictures, emoji, `/rank`, `/counters`, `/find-gym`, `/request`, `/maps`, `/help`. Read before changing any of these.
-- `testing.md`: the test database, fake interactions, the fake gateway, party, train and Wayfarer helpers. Read before writing tests.
+- `web.md`: the web server in the bot, its settings and secrets, sessions, CSRF, logging in (Discord, the links of `/maps`), rate limits, the map's data and page, the CSP, how to add a route. Read before changing anything under `src/web/`.
+- `testing.md`: the test database, fake interactions, the fake gateway, party, train, Wayfarer and web helpers. Read before writing tests.
 
 ## Gotchas
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index a9b3b159a34be543d97a7e01791d4d106359f654..b948d5ebaeeb49388152306cbf2519ce2d20a0d8 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -25,3 +25,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Wayfarer
 
 - Wayfarer tests: the import and the queue over gym administration on fakes are `wayfarerImportWith()` (`test/support/wayfarer-import.ts`: `wayfarer`, `wayfarerReview`, `wayfarerStore`, `admin`, `directory`, `removal`), which `gymCommandsWith()` routes like the bot; `createTestContext`'s own `wayfarer` and `wayfarerReview` throw when used. Exports in tests are built from invented Wayspots at the invented gyms, their cells by `wayfarerCellAt`.
+
+## The web server
+
+- Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names; without it the page answers that it is not built). The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The page's own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header); Leaflet and the real tiles are tried at staging.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 923b7e8d36589487c21461b42ebf624600dad376..469a113dcb5584e38c941056b3057afa7eaff8ae 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -35,7 +35,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
 - Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`src/domain/geo/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `simulate` and `countersMessage` (a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
-- `settings.regionMapLink` (blank is unset) enables `/maps`. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
+- `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
new file mode 100644
index 0000000000000000000000000000000000000000..d213f3a005aead4f3cbe7e91e6316defb922b251
--- /dev/null
+++ b/docs/architecture/web.md
@@ -0,0 +1,45 @@
+# The web server and the map
+
+The HTTP server in the bot (`src/web/`, plan 8M-1; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps`, rate limits, the public map's data and page, the Content Security Policy, and the rules for the routes of 8M-2 to 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+
+## Settings, secrets, start and stop
+
+- Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
+- Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going.
+- Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
+- Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/`, a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's 2 MB in 8M-2) sets its own `bodyLimit`.
+
+## Headers and the Content Security Policy
+
+- Every answer carries `securityHeaders` (`src/web/headers.ts`, pure, tested): the CSP (`default-src 'none'`; scripts, styles and fonts from Pine alone, no inline script or style; pictures from Pine, `data:`, `https://tile.openstreetmap.org`, `https://tile.googleapis.com` with Google's tiles, and the picture hosts of posts (`pictureOrigins`: the origins of `POKEMON_ICON_BASE` and `settings.raidEggPicturesUrl`, never typed by hand); connections to Pine and, with Google's tiles, the Map Tiles API; `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'self'`), `nosniff`, `X-Frame-Options: DENY` and `Referrer-Policy: strict-origin-when-cross-origin` (Google checks a browser key's referrer by Pine's origin). Leaflet sets `style` attributes from its script, which `style-src` does not govern; a page that needs an inline style or script is a design error.
+
+## Addresses
+
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`. `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
+- Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
+
+## Sessions and CSRF
+
+- A session (`Sessions`, `src/web/sessions.ts`) is 32 random bytes in the cookie `pine_session` (`sessionCookie`: HttpOnly, `Secure` unless `publicUrl` is http, SameSite=Lax, path `/`, 30 days), stored as the hex SHA-256 of the cookie in `WebSession` (migration 015; `WebSessionRepository`, its twin `MemoryWebSessions`; what a stored session is, `WebSession`, `WebSessionStore` and `SESSION_MS`, is in `src/web/session-model.ts`, which imports no Fastify, so that the repository does not depend on the web server). It says who the member is (`userId`, the name for the header), never what they may do. `sessions.of(request, reply)` reads the cookie once per request; a session last used an hour ago or more is renewed (row and cookie: 30 days from now). A login (`sessions.start(request, reply, user)`) first deletes the row of the session the request's cookie stands for, if any: a browser has one session, and the old cookie leaves no row behind. Logging out deletes the row and the cookie; the hourly upkeep (`PartyScheduler`, `webSessions`) deletes expired rows.
+- What a member may do is asked per request, from fresh data (spec 2.5): `/api/me` asks `members.find(guild, user)` (kept a minute by the directory) and answers `{ loggedIn, name, member, csrf, readOnly }`; when Discord cannot say, `member: false, readOnly: true`, and the page says it is read-only. One login serves every server; membership is asked per server.
+- Every POST runs `postGuard(sessions, publicUrl)` (`src/web/csrf.ts`) as its `preHandler`: `Origin` must equal `publicUrl` and `X-Pine-CSRF` must be the session's token (`csrfToken`: an HMAC-SHA256 of the session id under a key made at start, compared in constant time); anything else is 403. The one exception is the POST of a login link's page, which has no session yet: it checks `Origin` alone. GETs (and HEADs) change nothing.
+
+## Logging in
+
+- With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `pine_oauth` (the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
+- With a link of `/maps` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member and one server, named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address ("Continue"), so that a link preview or a prefetch cannot spend the link. `POST /auth/link/<guild>/<token>` checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to `/s/<guild>/map` without the token; an unknown, used or expired link (or one of another server) leads (303) to the map with `?login=expired`. The guild is in the address so that an expired link still lands on its server's map. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against the commands' own throttles per member, not per address.
+
+## The public map
+
+- `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice, elite mark; places to six decimals). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
+- The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`). Without a built bundle it answers 503 saying `npm run web:build`.
+- The page's code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: an IIFE for ES2022, minified, into `dist/web/assets/` with hashed names (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), `dist/web/assets.json` naming the script and style (read at start by `readAssets`). The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
+- The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, elite raid gyms in their own colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token) and why they see only the public map. `?login=failed|expired` is said once and taken out of the address.
+
+## Adding a route (8M-2 to 8M-5)
+
+- Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
+- Every POST: `preHandler: postGuard(…)`, a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), with the command's own throttle per member; log a write as a command is logged (member, server, what), never the texts.
+- Answer failures through `sendFailure` and refusals with the command's words. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/2026-10-16-phase-8m1-staging.md b/docs/superpowers/plans/2026-10-16-phase-8m1-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..ba3121e7c2fa247b1581965669c50854092a4dcf
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-16-phase-8m1-staging.md
@@ -0,0 +1,42 @@
+# Phase 8M-1 staging checklist: the web server and the public map
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map pages in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`.
+
+## Before
+
+1. `npm run migrate` on the dev database (migration `2026_10_16_015_web_session`: the table `WebSession`). If `typescript-migration` took 015 first, this one is renumbered at the merge.
+2. `npm run build` (it runs `npm run web:build`): `dist/web/assets/` holds `map-<hash>.js`, `map-<hash>.css` and Leaflet's pictures, `dist/web/assets.json` names the first two.
+3. In `data/settings.json` of the dev bot: `"web": { "port": 8080, "publicUrl": "http://localhost:8080" }` (plain http on this machine: the cookie is not `Secure`, which the browser accepts for localhost). For the Google part below, `"tiles": "google"`.
+4. Matt registers the redirect `http://localhost:8080/auth/callback` under OAuth2 in the developer portal of the dev application, and sets `DISCORD_CLIENT_SECRET` in `.env` (Claude checks only that it is set, with a command that prints no value). For the Google part Matt creates a browser key (Map Tiles API only, referrer `http://localhost:8080/*`) and sets `GOOGLE_MAPS_BROWSER_KEY`.
+5. The command definition of `/maps` changed (description; it is now offered where `settings.web` is set): `npm run deploy-commands -- --global` with Matt's go-ahead.
+
+## The server
+
+6. The log of the start says `web server listening` with the port; with the port taken by something else (a second `python -m http.server 8080`), the start logs `the web server could not start` and the bot works on Discord as usual. With the client secret unset, the start warns that there is no "Log in with Discord".
+7. `http://localhost:8080/` is a short page; `/s/<another id>/map` and `/nothing` are short "Not found." pages; the response headers carry the CSP, `nosniff`, `DENY` and the referrer policy (the browser's network panel).
+
+## The map, logged out
+
+8. `/s/<test server id>/map`: OpenStreetMap's tiles with "© OpenStreetMap contributors"; the test server's regions with their channel names (shown from zoom 12), its gyms as dots, elite raid gyms in purple. The console shows no CSP violation (Leaflet's styles and pictures load; the layer switch's icon shows).
+9. A gym's popup: name, nickname, "Elite raid gym", its regions, address, notice, description; "Directions" opens Google Maps in a new tab with the route to the gym. A gym whose name has `<b>` in it (rename one with `/gym edit` for the test, then back) shows the brackets as text.
+10. The filter box: typing hides the other gyms; Enter fits the map to the matches (one match opens its popup).
+11. `/s/<id>/api/geo` twice: the second is a 304 (network panel). Rename a region's channel on Discord, or change a gym with `/gym edit`: the next load shows it.
+12. The header says "Log in with Discord".
+
+## Logging in
+
+13. "Log in with Discord": Discord's consent page asks for the identity only; after Authorize the map shows the member's name and Log out. With "Cancel" on Discord's page: back on the map with "Login failed."
+14. `/maps` in the test server: a private container with the map's address and "Open the map (logs you in)". The button (in a private window, logged out) opens a short page with "Continue" and no session yet (no `pine_session` cookie in the browser's storage panel); "Continue" logs in as the account's display name, not the server nickname, and the address bar shows `/s/<id>/map` without the token. Logged in already as somebody else, a link's "Continue" replaces that session (the count of `WebSession` rows in the dev database stays the same). The same button again, or after five minutes: "This login link has expired. Ask for a new one with /maps." `/maps` in a DM with the bot: "Use /maps in your server." (or the map of all regions where `regionMapLink` is set).
+15. Log out: the header offers the login again; the `WebSession` row is gone (a count in the dev database before and after).
+16. A member who is not in the test server (Matt's second account, if any) logs in: "You are not a member of this server."
+17. The bot's log at debug shows each request by its route pattern, never a code, a token or a cookie.
+
+## Google's tiles
+
+18. With `tiles: 'google'` and the key: the layer switch offers Google roadmap, satellite and hybrid; each loads (one `createSession` per layer in the network panel, then `2dtiles` requests), and the attribution shows "Google Maps" with Google's copyright of the view, changing after a move. Switching back to OpenStreetMap removes Google's attribution.
+19. Whether Google's policies want their logo image rather than the words "Google Maps" (the policies page asks for the logo "whenever possible" and allows the words where space is limited): decide with Matt; the logo would be a picture of Google's own, served by Pine.
+
+## Left open (to the follow-ups if not settled here)
+
+- The page on a phone (the header wraps; the filter box and the popup are usable).
+- Cloudflare Tunnel with `trustProxy` is tried with the Docker plan (`map.profpine.com`), not here. There, and for any other tunnel chosen (Tailscale Funnel especially), check that it sends `X-Forwarded-For` (the check at the end of step 3 of `docs/web-setup.md`): without it every visitor counts as the tunnel and they share one rate limit. Pine reads no `CF-Connecting-IP`.
diff --git a/docs/web-setup.md b/docs/web-setup.md
new file mode 100644
index 0000000000000000000000000000000000000000..c384a367f7b069a4fc7d9150f43cf6076d0dbbf4
--- /dev/null
+++ b/docs/web-setup.md
@@ -0,0 +1,58 @@
+# Setting up Pine's web pages
+
+Pine can serve a live map of each server's regions and gyms, to everybody, with a login for members (plan 8M-1; the region editor and the parties on the map follow). It is off until `settings.web` is set. Pine itself serves plain HTTP on this machine; how people reach it from outside (a tunnel or a reverse proxy, with its certificate) is set up beside it.
+
+## 1. The settings
+
+In `data/settings.json`:
+
+```json
+"web": {
+  "port": 8080,
+  "host": "127.0.0.1",
+  "publicUrl": "https://map.example.org",
+  "trustProxy": true,
+  "tiles": "osm"
+}
+```
+
+- `port`: where Pine listens. A port that is taken is logged at the start and the bot runs on without its pages.
+- `host`: `127.0.0.1` (the default) when the tunnel or proxy runs on the same machine; `0.0.0.0` inside a container that the tunnel reaches over the compose network (do not publish the port to the host then).
+- `publicUrl`: the address members open, with nothing after the host. It must be `https://`; only `http://localhost`, `http://127.0.0.1` or `http://[::1]` may be plain http (for trying it on your own machine: the login cookie can then not be `Secure`).
+- `trustProxy`: `true` behind a tunnel or proxy, so that the rate limits count the visitor's address and not the tunnel's. Pine reads it from `X-Forwarded-For` (the last address there that no proxy on this machine or a private network added), and believes that header only from this machine or a private network. `CF-Connecting-IP` is not read: Cloudflare adds the visitor to `X-Forwarded-For` as well. Check that your tunnel sends `X-Forwarded-For` (Tailscale Funnel especially; see step 3): without it every visitor counts as the tunnel, and they share one limit.
+- `tiles`: `osm` (OpenStreetMap, the default) or `google` (Google's roadmap, satellite and hybrid beside OpenStreetMap; needs the browser key of step 4).
+
+Build the page once: `npm run build` (or `npm run web:build` alone) writes it to `dist/web/assets/`. Without it the map's address says it has not been built.
+
+## 2. "Log in with Discord"
+
+Members can always log in with the button `/maps` gives them (it works once, within five minutes). For a "Log in with Discord" button on the page as well:
+
+1. In the Discord developer portal, open the application, **OAuth2**, and add the redirect `<publicUrl>/auth/callback` (for example `https://map.example.org/auth/callback`). Once per application (the dev application and production each have their own).
+2. Copy the **Client Secret** from the same page into `.env` as `DISCORD_CLIENT_SECRET`. It is a secret: never in `data/`, never in the repository. Pine asks Discord only for the member's identity (the scope `identify`).
+
+Without the secret the start says so in the log, and the page tells members to use `/maps`.
+
+## 3. The way in from outside
+
+Pine does not open ports or talk to your router. Pick one:
+
+- **Cloudflare Tunnel** (recommended; free; no open ports, the home address stays hidden, the certificate is Cloudflare's). Needs a domain whose DNS is at Cloudflare. In the Cloudflare dashboard (Zero Trust, Networks, Tunnels) create a tunnel, add a public hostname such as `map.example.org` pointing to the service `http://127.0.0.1:8080` (in Docker: `http://pine:8080`), and run `cloudflared tunnel run --token <token>` as a service of its own (or as a container beside Pine). The token goes in the environment of `cloudflared`, never in a file of the repository. Set `trustProxy: true`.
+- **Tailscale Funnel**: no domain needed; the address is a `*.ts.net` name. `tailscale funnel 8080` on the machine; `publicUrl` is the `https://<machine>.<tailnet>.ts.net` address it prints. Set `trustProxy: true`.
+- **Caddy with a port forward**: needs a public IPv4 address and opens port 443 on your router to this machine. A `Caddyfile` of `map.example.org { reverse_proxy 127.0.0.1:8080 }` gets and renews the certificate by itself. Set `trustProxy: true`.
+
+Whichever you pick, check once that it sends the visitor's address. Pine logs no addresses, so ask for `<publicUrl>/auth/login` 21 times within a minute from one place, then once from another network (a phone without Wi-Fi). If the second is refused too ("Too many requests"), the tunnel sends no `X-Forwarded-For` and every visitor shares one limit.
+
+## 4. Google's tiles (optional)
+
+OpenStreetMap's tiles need nothing. For Google's roadmap, satellite and hybrid as well:
+
+1. In the Google Cloud console, enable the **Map Tiles API** in a project with billing.
+2. Create an API key for browsers, separate from `GOOGLE_API_KEY` (which is the server's and never reaches a page). Restrict it to the **Map Tiles API** only, and to **HTTP referrers** `<publicUrl>/*` (for example `https://map.example.org/*`).
+3. Put it in `.env` as `GOOGLE_MAPS_BROWSER_KEY` and set `"tiles": "google"`. Without the key the start warns and the page shows OpenStreetMap only.
+
+The price (Google's pricing page, checked 2026-10-16; check again before enabling): Map Tiles API 2D tiles are free up to 100,000 a month, then US$0.60 per 1,000. A visitor who pans around a city loads a few hundred tiles; the page asks Google only while a Google layer is chosen (OpenStreetMap is shown first). Set a budget alert in the Cloud console.
+
+## 5. Check it
+
+Start the bot and look for `web server listening` in its log. Open `<publicUrl>/s/<server id>/map`: the regions and gyms of that server are shown to everybody. `/maps` in the server gives the map's address and the login button.
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m1 HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json .env.example docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` prints nothing; then `npm run check`, `npm run build`, `npm run web:build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the rate limiter's, the sessions', the login links', `src/app` start-and-stop tests) ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `src/config/settings.ts`, `package.json`/`package-lock.json`, `src/db/migrations/index.ts` if another migration 015 landed first: then renumber this plan's), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when no other session commits. The main checkout then needs `npm ci` for the new packages: that is the other session's checkout, so tell Matt rather than run it. Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-1": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-1.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-16-phase-8m1-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application, in the built-in browser: Matt registers the redirect `<publicUrl>/auth/callback` under OAuth2 in the developer portal and sets `DISCORD_CLIENT_SECRET` (and, to try Google's tiles, `GOOGLE_MAPS_BROWSER_KEY`); `npm run migrate` (migration 015), `npm run build`, `npm run deploy-commands -- --global` (the `/maps` description changed); Matt starts the bot.
