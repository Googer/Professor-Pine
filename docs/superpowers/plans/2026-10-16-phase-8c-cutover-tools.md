# Phase 8C: The Cutover Tools: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a legacy installation's move to the new bot needs besides the Docker stack: `emoji-upload` and `role-auth-export` as compiled CLIs, a converter of the legacy settings into `pine-settings.json` and a `.env` fragment, `cutover-check` (the read-only go / no-go, from Matt's PC against a copy of production's database, REST only), a rehearsal mode in which the production token shows members nothing, `/admin cleanup-legacy` (a list first, a confirmed deletion), and the runbook of Pittsburgh's rehearsal and night.

**Architecture:** The second plan of the cutover work (`docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md`, sections 4.2, 4.4, 6), on the stack of 9A and after the Wayfarer merge (8W-1R, 8M-1). The converter runs in the image as the operator's own user and writes through temporary files. `cutover-check` reads the database in a read-only transaction and Discord through GETs only (`DiscordRead`), computing permissions as Discord does (`src/ops/permissions.ts`), each section a pass / warn / fail line. Rehearsal mode (`rehearsal` in the settings: an allowlist, the rehearsed regions, staff roles) filters DMs (`RehearsalDms`), guards every channel post of `PartyGateway` (`rehearsalGateway`), makes every answer outside the rehearsed forums private, admits only the allowlist and staff, deploys guild commands to the servers of `Guild` the bot is in, creates the rehearsal forum hidden with its whole overwrite set, refuses `/region` actions that touch channels, turns the screenshot mention trigger off, and says so in the log, the heartbeat and an owner alert. The cleanup reads the legacy `parties/` folder mounted read-only (`LEGACY_PARTIES_DIR`): channels named by the files, and orphans recognised by the legacy name forms and the bot's own first message (the legacy status header), never a region channel, a settings channel or the uncategorised.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js 14.27 (REST reads, overwrites), Kysely (read-only transaction, Kysely's own migration checks), Vitest, POSIX `sh`. No new dependency. **No migration.** No new command definition beyond `/admin cleanup-legacy` (a subcommand: the commands are registered again at staging).

**Spec:** the design brief `.superpowers/sdd/2026-10-16-phase-8c-cutover-tools/design.md` (git-ignored; T1–T6) and the design document above; Matt's answers of 2026-10-16 (O1 the rehearsal on his PC, O2 an admin restricts the commands in Integrations, O3 the legacy patch ships with the first push, O4 MySQL 8.4).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8c`), one commit per task, each commit typechecked with its own tests green, and the full check (6,484 unit tests), the build and the database suite (359) clean on the tip, shellcheck clean on `pine`. Two Opus reviewers went through the prototype (T1–T3, T4–T6; two Critical findings in rehearsal mode and the cleanup), a third through the fixes, which are folded into the commits below. The third review's findings (C1–C10) are the final fix wave, after the last task. The orphan rules were calibrated on a copy of Pittsburgh's legacy `parties/` folder (counts only).

## Decisions in this plan

Matt's: the rehearsal runs on his PC with the production token while the legacy bot is off for a short window; an admin of Pittsburgh's server restricts Pine's commands in Integrations for it; members must see nothing of a rehearsal; the cleanup lists first and deletes only after a person confirms; legacy party channels and orphans are deleted.

Made while prototyping, for Matt to look at:

1. **In rehearsal every answer outside the rehearsed forums is private**, the screenshot mention trigger is off (testers use `/raid` with a screenshot), `/request` is refused (it files a real GitHub issue), Unown wants are still given (the database is a throwaway copy).
2. **The rehearsal forum is created hidden** with its whole overwrite set (@everyone denied; the bot, staff roles, Manage Server roles and the allowlist allowed), never shown first and hidden after; one that cannot be hidden is deleted.
3. **The converter keeps every value the new bot reads as the legacy file has it**, `features.*` missing from the legacy file as `false`, `ex-gym-raids` → `elite-gym-raids`, never a blank `BACKUP_DIR`; the operator adds `DISCORD_APP_ID`, `DB_ROOT_PASSWORD` by hand; secrets are never printed.
4. **`cutover-check` permission needs** come from what the code calls; Manage Messages (the screenshot's removal) and Use External Emojis are optional; role position is checked against self roles.
5. **The web pages and the tunnel stay off during a rehearsal** (runbook), so members do not find the map early.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (`./pine up`, `restart`, `update`, `restore --start`, `deploy-commands`, `emoji-upload`, `cutover-check` against the real API, `npm start`), never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env` or any `private-settings.json`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8c`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. `pine` stays mode 755.
- A task needs the typecheck and its own tests green; the full `npm run check`, the build and `npm run test:db` after the last task, through the npm scripts (the machine-wide suite lock). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Members see nothing of a rehearsal: no DM, post, public answer, visible forum, command or channel change outside the allowlist and staff.
2. The cleanup never deletes a channel that was not a legacy party's.
3. `cutover-check` is truly read-only and fails loudly and specifically.
4. The converter keeps the legacy instance's choices and never prints or loses a secret.
5. The runbook's commands match `./pine` and the stack.

### Task 1: Plan 8C T1: emoji-upload and role-auth-export as compiled CLIs with ./pine commands

Prototype commit: `208dce7bcf4d5336b1b0725e3fe3ff23003643f0`

The tsx scripts scripts/emoji/upload.ts and scripts/role-auth/export.ts become CLIs under
src/ops/ that the build compiles into dist/, so that a host with only Docker runs them:
- src/ops/emoji-upload.ts holds what scripts/emoji/icons.ts had, and the upload itself as
  uploadEmoji (the application's emoji listed, the missing icons made, uploaded with apply,
  an icon that fails said while the others go on, the exit status), tested over a fake of
  the REST API; emoji-upload-cli.ts reads DISCORD_TOKEN, DISCORD_APP_ID and --apply.
- src/ops/role-auth.ts is scripts/role-auth/report.ts; role-auth-cli.ts reads the database
  as the script did, and says a configuration error in a sentence.
- npm run emoji:upload and npm run role-auth:export run the CLIs with tsx on the checkout;
  ./pine emoji-upload [--apply] and ./pine role-auth-export [--json] run them in a one-off
  container (the export after the database is started).
- CLAUDE.md's hard rule names emoji:upload / ./pine emoji-upload among what contacts
  Discord (its dry run too: it lists the application's emoji); operations.md lists the new
  one-off commands and drops the open item.

**Files:**

```
 CLAUDE.md                                                     |   4 +-
 docs/architecture/operations.md                               |   6 +-
 docs/architecture/utilities.md                                |   2 +-
 package.json                                                  |   4 +-
 pine                                                          |  24 ++++
 scripts/emoji/icons.test.ts                                   |  62 -----------
 scripts/emoji/icons.ts                                        |  87 ---------------
 scripts/emoji/upload.ts                                       |  80 --------------
 scripts/role-auth/export.ts                                   |  32 ------
 src/db/repositories/role-authorization-repository.db.test.ts  |   2 +-
 src/ops/emoji-upload-cli.ts                                   |  29 +++++
 src/ops/emoji-upload.test.ts                                  | 176 +++++++++++++++++++++++++++++
 src/ops/emoji-upload.ts                                       | 177 ++++++++++++++++++++++++++++++
 src/ops/role-auth-cli.ts                                      |  41 +++++++
 scripts/role-auth/report.test.ts => src/ops/role-auth.test.ts |  10 +-
 scripts/role-auth/report.ts => src/ops/role-auth.ts           |   2 +-
 16 files changed, 465 insertions(+), 273 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/ops/emoji-upload.test.ts src/ops/role-auth.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/role-authorization-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 208dce7bcf4d5336b1b0725e3fe3ff23003643f0 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8C T1: emoji-upload and role-auth-export as compiled CLIs with ./pine commands`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/architecture/operations.md docs/architecture/utilities.md package.json pine scripts/emoji/icons.test.ts scripts/emoji/icons.ts scripts/emoji/upload.ts scripts/role-auth/export.ts src/db/repositories/role-authorization-repository.db.test.ts src/ops/emoji-upload-cli.ts src/ops/emoji-upload.test.ts src/ops/emoji-upload.ts src/ops/role-auth-cli.ts src/ops/role-auth.test.ts src/ops/role-auth.ts`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index d7e290f83d6a887f422ecaa9f461af919dc6d455..66dc36ea78b9574ac5e8d053e895708e21b58625 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -5,7 +5,7 @@ Discord bot for organising Pokémon Go raids. It is being rewritten from legacy
 ## Hard rules
 
 - **Never push.** All migration work stays local on branch `typescript-migration` until every phase is complete. No `git push`, no PRs, nothing that runs GitHub CI.
-- **Never contact Discord unasked.** Do not start the bot (`npm start`, `npm run dev`, or in the Docker stack `./pine up`, `./pine restart`, `./pine update`, `./pine restore` without `--no-start`) or run `npm run deploy-commands` / `./pine deploy-commands` unless Matt asks; there is a live production bot.
+- **Never contact Discord unasked.** Do not start the bot (`npm start`, `npm run dev`, or in the Docker stack `./pine up`, `./pine restart`, `./pine update`, `./pine restore` without `--no-start`) or run `npm run deploy-commands` / `./pine deploy-commands` or `npm run emoji:upload` / `./pine emoji-upload` (its dry run reads the application's emoji; `--apply` uploads) unless Matt asks; there is a live production bot.
 - **Do not edit or delete legacy JS** (`app/`, `commands/`, `types/`, `index.js`) unless a plan task says so. Production still runs it from `main-dev`; it is removed at cutover (phase 8).
 - Database changes are additive only. `knex_migrations` is read, never written; Kysely tracks its own migrations in `kysely_migration`.
 
@@ -77,6 +77,8 @@ The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with
 ./pine restore <dump> --no-start [--replace [--no-backup]]   # load a legacy or Pine dump (.sql or .sql.gz), lower-case tables renamed; without --no-start on a terminal, or with --start, it logs the bot in
 ./pine deploy-commands [--global | --guild <id>]   # contacts Discord: only when Matt asks
 ./pine update | shell        # backup, git pull, rebuild, restart (logs the bot in: only when Matt asks); a shell in the bot's container
+./pine emoji-upload [--apply]   # the game's icons the application lacks as its emoji: contacts Discord (a dry run reads; --apply uploads): only when Matt asks
+./pine role-auth-export [--json]   # the legacy role authorization of the database, mapped to the new commands (reads only)
 ```
 
 Format the files you touch with `npx prettier --write <files>`; `format:check` is part of `check`.
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index b1e8cabb097b4b0f6d85eef8597f52a62d4e30fb..c52f9de776f888416a5cc734c01b0aa971a0281b 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -6,7 +6,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 
 - A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `tr`, `basename`, `dirname`). A step that would need anything else on the host is wrong.
 - The script is checked with `shellcheck -s sh` (the `koalaman/shellcheck` image) and kept LF by `.gitattributes`, as is every `*.sh`. It exports `MSYS_NO_PATHCONV=1`, so Git Bash leaves container paths (`/pine/backup.sh`) alone. A command is a function `cmd_<name>` (a hyphen is an underscore) plus a line of `usage`; nothing else needs to know of it; the dispatch is a function, read whole before `update` replaces the file. Each command says what it does and runs Compose through `run`, which prints the command first; errors are plain sentences through `fail`; a command that stopped the bot and then fails says "The bot, its watchdog and the backups are stopped: './pine up' starts them again." (a restore whose load the bot would refuse says that instead) A path the operator gives (a dump) is read from where they ran the script.
-- The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `migrate`, `backup`, `restore --no-start`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
+- The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `emoji-upload` contacts Discord through its REST API (its dry run lists the application's emoji, `--apply` uploads); `migrate`, `backup`, `restore --no-start`, `role-auth-export`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
 - The installation's own files are git-ignored and beside `compose.yaml`: `.env` (secrets) and `pine-settings.json` (the settings, made from `data/settings.json`; the converter of plan 8C later). `./pine` refuses to run without either and says how to make them; the repository's `data/settings.json` is never the installation's, so `update` finds no change of its own. `pine-settings.json` is mounted as a single file: an editor saves by writing a new file, which a running container never sees, so an edit needs `./pine restart` (and `./pine restart backup` for the backups' time zone). `PINE_ENV_FILE`, `PINE_SETTINGS` and `COMPOSE_PROJECT_NAME` give a second stack on the same machine its own files, volumes and image (`professor-pine:<project>`) (a rehearsal, a scratch stack). The project's name is Compose's to resolve and `./pine` never sets it: the shell's `COMPOSE_PROJECT_NAME`, else the one in the env file (a rehearsal's `.env` names itself there), else `pine` (the `name:` of `compose.yaml`). Were the script to set it, it would outrank the env file and a rehearsal's `restore --replace` or `down` would act on production.
 - `./pine update`, in this order, nothing changed until the backup is made: it refuses a clone with changes of its own and a branch without an upstream; `git fetch`, and nothing more when there is nothing new; the database is checked and, if it has tables, a verified backup is made through the stack as it runs now (a pulled change may upgrade MySQL or migrate the data); a failed check or backup stops it, nothing changed. Then `git pull --ff-only`, the build, `up -d`, and the backup service and the watchdog recreated (they run what the checkout mounts). A failed build or start after the pull says "The code is updated but the stack still runs the old version: './pine up' builds and starts it."; `./pine up` also finishes an update that stopped there (a second `update` finds nothing new).
 
@@ -15,7 +15,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `Dockerfile`: multi-stage on `node:24-slim`. The build stage runs `npm ci --ignore-scripts` and `npm run build`; the runtime stage has the production dependencies (also without install scripts: none is needed for the CPU, as in the checkout), `dist/`, `package.json` (it says the files are ES modules) and the default `data/settings.json`. onnxruntime-node keeps its library for the image's platform only (`TARGETARCH`: linux x64, or arm64; arm64 is untested). Runs as `node`, `NODE_ENV=production`, `node --enable-source-maps dist/index.js`, `STOPSIGNAL SIGTERM`. About 490 MB unpacked.
 - The runtime reads from disk only its settings and what it keeps under `var/`: no `assets/`, `lang-data/` (the legacy bot's tesseract data) or the other `data/*.json`, and no legacy JavaScript. `.dockerignore` lets in only what the build needs (never `.env`, `var/`, `.git`, `node_modules`).
 - `var/` is a volume (`pine-var`), writable by `node` because the image's folder is: the game data cache, map pictures, the screen reader's models (downloaded at first use) and screenshots, and the health files.
-- The one-off commands run in the same image: `dist/db/migrate-cli.js`, `dist/discord/deploy-cli.js`, `dist/ops/restore-cli.js`, `dist/ops/health-cli.js`, and the watchdog `dist/ops/watchdog-cli.js`. The tsx scripts of `scripts/` are not in the image (see "Open items").
+- The one-off commands run in the same image: `dist/db/migrate-cli.js`, `dist/discord/deploy-cli.js`, `dist/ops/restore-cli.js`, `dist/ops/health-cli.js`, `dist/ops/emoji-upload-cli.js`, `dist/ops/role-auth-cli.js`, and the watchdog `dist/ops/watchdog-cli.js`. What an operator of an installation runs is such a CLI under `src/` (its logic in a module beside it, tested; the CLI only reads the environment and the arguments), with an npm script for the checkout (`tsx` on the `.ts`) and a `./pine` command for the stack; the tsx scripts of `scripts/` are the developers' and are not in the image.
 
 ## The stack
 
@@ -63,7 +63,5 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 
 ## Open items
 
-- The tsx scripts `emoji:upload` and `role-auth:export` are not in the image, so a host without Node cannot run them: plan 8C makes them compiled CLIs with `./pine` commands.
-
 - MySQL follows the current LTS release (Matt, 2026-10-16): the stack, the backup service and the tests run `mysql:8.4`; a dump from production's 8.0 loads into it. When a newer LTS comes out, all three move together (the data directory upgrades in place on the first start; `./pine update` backs it up first). Node follows its LTS the same way (Node 26 once it is LTS).
 - arm64 images are built the same way but untested.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 469a113dcb5584e38c941056b3057afa7eaff8ae..91aea9569eeb1d6558de9bfc147ca7e8ed73f575 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -25,7 +25,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Pictures and emoji
 
 - The picture of a Pokémon is `pokemonPicture(source)` (`src/domain/pogo/pokemon-icons.ts`): the feed's picture of a current boss wins, else the game's icon (`iconName`: the first candidate that exists in the list of icon files the bot downloads with the game data, `settings.gameData.iconsUrl`; a form that only changes the look shows the species' plain file, a species with per-form files a preferred form, never a mega's), served by Leek Duck's CDN (`POKEMON_ICON_BASE`). Tests use `iconsFixture()`.
-- Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep; a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`; the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. An answer that is no post finds them the same way through `ctx.emoji` (`EmojiFinder`, `emojiFinder` in `src/services/application-emoji.ts`: `find(name, guildId)`, the application's first, then the server's by the interaction's own server id (`DiscordApplicationEmoji.inServer`, from the cache of servers, not through a channel), none of a server in a DM; the test context finds none). `npm run emoji:upload` (`scripts/emoji/`) makes them from PokeMiners' pogo_assets at a pinned commit, an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`scripts/role-auth/report.ts`): Discord sets each by itself.
+- Emoji are looked for by name (`PartyService.emoji`): the bot's application's first (`ApplicationEmoji`, `src/services/application-emoji.ts`, read after the connection and with the hourly upkeep; a failed read keeps the last list; a read that finds other emoji has every active post shown anew, one party every `EMOJI_RENDER_GAP_MS`, `PartyService.emojiChanged`; `flush` drops what still waits, and after `close`, which shutdown calls instead of `flush`, nothing is shown anew), then the forum's server's, then characters, or words for types and weather. The names are the legacy server names (`src/domain/pogo/game-icons.ts`: the 18 types, `sunny clear rain partlycloudy cloudy windy snow fog`, `instinct mystic valor teamless`; the game master's clear weather shows `sunny`); `PostEmoji.icon(name)` gives one or undefined. An answer that is no post finds them the same way through `ctx.emoji` (`EmojiFinder`, `emojiFinder` in `src/services/application-emoji.ts`: `find(name, guildId)`, the application's first, then the server's by the interaction's own server id (`DiscordApplicationEmoji.inServer`, from the cache of servers, not through a channel), none of a server in a DM; the test context finds none). `npm run emoji:upload` / `./pine emoji-upload` (`src/ops/emoji-upload.ts`) makes them from PokeMiners' pogo_assets at a pinned commit, an icon that fails said in a line (Discord's status and code only, `failureReason`) while the others go on, a count at the end and a non-zero exit when anything failed; it is never run by tests. A command's other forms are named with it in the role-authorization export (`src/ops/role-auth.ts`): Discord sets each by itself.
 
 ## PvP ranks
 
diff --git a/package.json b/package.json
index 13f5857212048ac638b9562a2b105c58ed2b4e16..2967e339bb90bd7d8f94dfed7fd7c1484fbdae68 100644
--- a/package.json
+++ b/package.json
@@ -18,8 +18,8 @@
     "raid-bosses:check": "tsx scripts/raid-bosses/check-feed.ts",
     "ocr:check": "tsx scripts/ocr/check.ts",
     "ocr:review": "tsx scripts/ocr/review.ts",
-    "role-auth:export": "tsx --env-file-if-exists=.env scripts/role-auth/export.ts",
-    "emoji:upload": "tsx --env-file-if-exists=.env scripts/emoji/upload.ts",
+    "role-auth:export": "tsx --env-file-if-exists=.env src/ops/role-auth-cli.ts",
+    "emoji:upload": "tsx --env-file-if-exists=.env src/ops/emoji-upload-cli.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
diff --git a/pine b/pine
index 25fbd4a3e9a92a1b038caa5967ebc0c40383bf15..a18bb80bd236064aba467d39a2e3753025c0fcd2 100755
--- a/pine
+++ b/pine
@@ -112,6 +112,11 @@ Usage: ./pine <command>
                      register the slash commands with Discord (everywhere by default)
   update             back up the database, then fetch the newest code (git pull), rebuild
                      and restart what changed (nothing when there is nothing new)
+  emoji-upload [--apply]
+                     the game's icons the bot's application lacks as its emoji: a dry run
+                     (reads the application's emoji from Discord); --apply uploads them
+  role-auth-export [--json]
+                     the legacy role authorization of the database, mapped to the new commands
   shell              a shell in the bot's container
   help               this list
 EOF
@@ -234,6 +239,25 @@ cmd_deploy_commands() {
   run run --rm --no-deps pine node --enable-source-maps dist/discord/deploy-cli.js "$@"
 }
 
+cmd_emoji_upload() {
+  need_stack
+  build_image
+  if [ "${1:-}" = --apply ]; then
+    say "Uploading the icons the application lacks as its emoji (contacts Discord)."
+  else
+    say "A dry run: the icons the application lacks (reads its emoji from Discord; --apply uploads)."
+  fi
+  run run --rm --no-deps pine node --enable-source-maps dist/ops/emoji-upload-cli.js "$@"
+}
+
+cmd_role_auth_export() {
+  need_stack
+  build_image
+  start_database
+  say "The legacy role authorization of the database (reads only; Discord is not contacted)."
+  run run --rm --no-deps pine node --enable-source-maps dist/ops/role-auth-cli.js "$@"
+}
+
 cmd_update() {
   need_stack
   command -v git >/dev/null 2>&1 || fail "git is not installed: update fetches the code with git."
diff --git a/scripts/emoji/icons.test.ts b/scripts/emoji/icons.test.ts
deleted file mode 100644
index ccf2f3b98413615a1bcb38e845349abe182d6f54..0000000000000000000000000000000000000000
--- a/scripts/emoji/icons.test.ts
+++ /dev/null
@@ -1,62 +0,0 @@
-import { DiscordAPIError, HTTPError } from 'discord.js';
-import { describe, expect, it } from 'vitest';
-import { GAME_ICON_NAMES } from '../../src/domain/pogo/game-icons.js';
-import { failureReason, iconSources, missingIcons, POGO_ASSETS } from './icons.js';
-
-describe('iconSources', () => {
-  it('has an icon of the pinned assets for every emoji the bot looks for, once', () => {
-    const sources = iconSources();
-    expect(sources.map((source) => source.name)).toEqual(GAME_ICON_NAMES);
-    expect(new Set(sources.map((source) => source.name)).size).toBe(sources.length);
-    for (const source of sources) {
-      expect(source.url.startsWith(POGO_ASSETS)).toBe(true);
-      // Discord's rule for an emoji's name.
-      expect(source.name).toMatch(/^[a-z0-9_]{2,32}$/);
-    }
-    expect(POGO_ASSETS).toMatch(/\/[0-9a-f]{40}\/Images\/$/);
-  });
-
-  it('takes the type, weather and team icons from their files, spaces encoded', () => {
-    const url = (name: string) => iconSources().find((source) => source.name === name)?.url;
-    expect(url('rock')).toBe(`${POGO_ASSETS}Types/POKEMON_TYPE_ROCK.png`);
-    expect(url('partlycloudy')).toBe(
-      `${POGO_ASSETS}Weather/weatherIcon_small_partlycloudy_day.png`,
-    );
-    expect(url('sunny')).toBe(`${POGO_ASSETS}Weather/weatherIcon_small_sunny.png`);
-    expect(url('instinct')).toBe(`${POGO_ASSETS}Pokestops%20and%20Gyms/team_yellow.png`);
-    expect(url('teamless')).toBe(`${POGO_ASSETS}Pokestops%20and%20Gyms/TeamLess.png`);
-  });
-});
-
-describe('missingIcons', () => {
-  it('leaves out what the application has, and replaces nothing', () => {
-    const missing = missingIcons(iconSources(), ['rock', 'valor', 'something-else']);
-    expect(missing.map((source) => source.name)).not.toContain('rock');
-    expect(missing.map((source) => source.name)).not.toContain('valor');
-    expect(missing).toHaveLength(GAME_ICON_NAMES.length - 2);
-  });
-});
-
-describe('failureReason', () => {
-  it('says what Discord answered by its status and code, never what was sent', () => {
-    const refused = new DiscordAPIError(
-      { code: 50035, message: 'Invalid Form Body' },
-      50035,
-      400,
-      'POST',
-      '/applications/1/emojis',
-      { body: { image: 'data:image/png;base64,AAAA' } },
-    );
-    expect(failureReason(refused)).toBe('Discord answered 400 (code 50035)');
-    expect(failureReason(new HTTPError(503, 'Service Unavailable', 'GET', '/x', {}))).toBe(
-      'Discord answered 503',
-    );
-  });
-
-  it('gives the message of anything else, and a word for what is no error', () => {
-    expect(failureReason(new Error('rock: the icon answered 404'))).toBe(
-      'rock: the icon answered 404',
-    );
-    expect(failureReason('nonsense')).toBe('an unknown failure');
-  });
-});
diff --git a/scripts/emoji/icons.ts b/scripts/emoji/icons.ts
deleted file mode 100644
index 9e58823cd164f73abc83c64cf008b4926e1b7c1c..0000000000000000000000000000000000000000
--- a/scripts/emoji/icons.ts
+++ /dev/null
@@ -1,87 +0,0 @@
-import { DiscordAPIError, HTTPError } from 'discord.js';
-import {
-  TEAM_ICON_NAMES,
-  TYPE_ICON_NAMES,
-  WEATHER_ICON_NAMES,
-} from '../../src/domain/pogo/game-icons.js';
-
-/**
- * Where the game's icons for the bot's emoji come from: PokeMiners' copy of the game's assets,
- * at a fixed commit, so that a later change there cannot change what is uploaded.
- */
-export const POGO_ASSETS =
-  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/';
-
-/** An emoji is uploaded as a PNG of this many pixels a side, the icon fitted in. */
-export const EMOJI_PIXELS = 128;
-/** Discord takes an emoji of at most 256 KiB. */
-export const MAX_EMOJI_BYTES = 256 * 1024;
-/** An icon of the game is a few KiB; anything over this is no icon. */
-export const MAX_ICON_BYTES = 2 * 1024 * 1024;
-
-/** One emoji to make: its name and the address of the game's icon it is made from. */
-export interface IconSource {
-  name: string;
-  url: string;
-}
-
-type WeatherIconName = (typeof WEATHER_ICON_NAMES)[number];
-type TeamIconName = (typeof TEAM_ICON_NAMES)[number];
-
-/** The small weather icons; partly cloudy is the day's. */
-const WEATHER_FILES: Readonly<Record<WeatherIconName, string>> = {
-  sunny: 'Weather/weatherIcon_small_sunny.png',
-  clear: 'Weather/weatherIcon_small_clear.png',
-  rain: 'Weather/weatherIcon_small_rain.png',
-  partlycloudy: 'Weather/weatherIcon_small_partlycloudy_day.png',
-  cloudy: 'Weather/weatherIcon_small_cloudy.png',
-  windy: 'Weather/weatherIcon_small_windy.png',
-  snow: 'Weather/weatherIcon_small_snow.png',
-  fog: 'Weather/weatherIcon_small_fog.png',
-};
-
-const TEAM_FILES: Readonly<Record<TeamIconName, string>> = {
-  instinct: 'Pokestops and Gyms/team_yellow.png',
-  mystic: 'Pokestops and Gyms/team_blue.png',
-  valor: 'Pokestops and Gyms/team_red.png',
-  teamless: 'Pokestops and Gyms/TeamLess.png',
-};
-
-/** A path of the assets as an address (its spaces encoded). */
-function assetUrl(path: string): string {
-  return POGO_ASSETS + path.split('/').map(encodeURIComponent).join('/');
-}
-
-/** Every emoji the bot looks for, with the icon it is made from. */
-export function iconSources(): IconSource[] {
-  return [
-    ...TYPE_ICON_NAMES.map((type) => ({
-      name: type,
-      url: assetUrl(`Types/POKEMON_TYPE_${type.toUpperCase()}.png`),
-    })),
-    ...WEATHER_ICON_NAMES.map((name) => ({ name, url: assetUrl(WEATHER_FILES[name]) })),
-    ...TEAM_ICON_NAMES.map((name) => ({ name, url: assetUrl(TEAM_FILES[name]) })),
-  ];
-}
-
-/**
- * Why an icon could not be made or uploaded, in a line the script may print: what Discord
- * answered by its status and code (never the request, which holds the picture and may hold
- * more), or the message of a failure of the script's own.
- */
-export function failureReason(err: unknown): string {
-  if (err instanceof DiscordAPIError) {
-    return `Discord answered ${String(err.status)} (code ${String(err.code)})`;
-  }
-  if (err instanceof HTTPError) return `Discord answered ${String(err.status)}`;
-  return err instanceof Error ? err.message : 'an unknown failure';
-}
-
-/** The emoji of `sources` the application does not have yet (by name; nothing is replaced). */
-export function missingIcons(
-  sources: readonly IconSource[],
-  existing: Iterable<string>,
-): IconSource[] {
-  const have = new Set(existing);
-  return sources.filter((source) => !have.has(source.name));
-}
diff --git a/scripts/emoji/upload.ts b/scripts/emoji/upload.ts
deleted file mode 100644
index 13ae2cf7b711869ce3d5dd59e4ab88c555d0d115..0000000000000000000000000000000000000000
--- a/scripts/emoji/upload.ts
+++ /dev/null
@@ -1,80 +0,0 @@
-// Uploads the game's icons for types, weather and teams as emoji of the bot's application
-// (`npm run emoji:upload`). Only the names the application lacks are made; nothing is renamed,
-// replaced or deleted. A dry run by default: it says what it would upload. `--apply` uploads.
-// Reads DISCORD_TOKEN and DISCORD_APP_ID from the environment and prints neither. An icon that
-// fails is said in one line and the others go on; the script ends with a count, and a non-zero
-// exit status when anything failed.
-import { REST, Routes, type APIApplicationEmoji } from 'discord.js';
-import sharp from 'sharp';
-import {
-  EMOJI_PIXELS,
-  failureReason,
-  iconSources,
-  MAX_EMOJI_BYTES,
-  MAX_ICON_BYTES,
-  missingIcons,
-  type IconSource,
-} from './icons.js';
-
-const apply = process.argv.slice(2).includes('--apply');
-const token = process.env.DISCORD_TOKEN;
-const appId = process.env.DISCORD_APP_ID;
-if (!token || !appId) {
-  process.stderr.write('DISCORD_TOKEN and DISCORD_APP_ID must be set (in .env).\n');
-  process.exit(1);
-}
-
-/** The icon, fitted into a square PNG with a transparent margin. */
-async function emojiImage(source: IconSource): Promise<Buffer> {
-  const response = await fetch(source.url, { signal: AbortSignal.timeout(15_000) });
-  if (!response.ok) throw new Error(`${source.name}: the icon answered ${response.status}`);
-  const bytes = Buffer.from(await response.arrayBuffer());
-  if (bytes.length > MAX_ICON_BYTES) throw new Error(`${source.name}: the icon is too large`);
-  const image = await sharp(bytes)
-    .resize(EMOJI_PIXELS, EMOJI_PIXELS, {
-      fit: 'contain',
-      background: { r: 0, g: 0, b: 0, alpha: 0 },
-    })
-    .png()
-    .toBuffer();
-  if (image.length > MAX_EMOJI_BYTES) throw new Error(`${source.name}: the emoji is too large`);
-  return image;
-}
-
-const rest = new REST().setToken(token);
-let listed: { items: APIApplicationEmoji[] };
-try {
-  listed = (await rest.get(Routes.applicationEmojis(appId))) as { items: APIApplicationEmoji[] };
-} catch (err) {
-  process.stderr.write(`Could not list the emoji of the application: ${failureReason(err)}\n`);
-  process.exit(1);
-}
-const existing = listed.items.flatMap((emoji) => (emoji.name ? [emoji.name] : []));
-const missing = missingIcons(iconSources(), existing);
-process.stdout.write(
-  `The application has ${existing.length} emoji; ${missing.length} of the game's icons are missing.\n`,
-);
-let done = 0;
-let failed = 0;
-for (const source of missing) {
-  try {
-    const image = await emojiImage(source);
-    if (!apply) {
-      process.stdout.write(`would upload ${source.name} (${image.length} bytes)\n`);
-    } else {
-      await rest.post(Routes.applicationEmojis(appId), {
-        body: { name: source.name, image: `data:image/png;base64,${image.toString('base64')}` },
-      });
-      process.stdout.write(`uploaded ${source.name}\n`);
-    }
-    done++;
-  } catch (err) {
-    failed++;
-    process.stderr.write(`${source.name} failed: ${failureReason(err)}\n`);
-  }
-}
-process.stdout.write(
-  `${apply ? 'Uploaded' : 'Would upload'} ${done} of ${missing.length}; ${failed} failed.\n`,
-);
-if (!apply && done > 0) process.stdout.write('Run again with --apply to upload them.\n');
-if (failed > 0) process.exitCode = 1;
diff --git a/scripts/role-auth/export.ts b/scripts/role-auth/export.ts
deleted file mode 100644
index 2e0e9236050e8126303ef925ca80685b82fdbe7f..0000000000000000000000000000000000000000
--- a/scripts/role-auth/export.ts
+++ /dev/null
@@ -1,32 +0,0 @@
-/**
- * Prints the legacy role authorization of the configured database (`DB_*` in `.env`) for the
- * cutover: per server, every legacy command that requires a role or has roles listed, the
- * slash command of the new bot it became, and what is odd about it. Run it with
- * `npm run role-auth:export` (plain text) or `npm run role-auth:export -- --json`.
- *
- * It only reads (`CommandRoleAuthorization`, `CommandRoles`, `Guild`) and never contacts
- * Discord, so roles are given by their ids.
- */
-import { loadEnv } from '../../src/config/env.js';
-import { dbConfigFrom } from '../../src/db/db-config.js';
-import { createDb } from '../../src/db/kysely.js';
-import { RoleAuthorizationRepository } from '../../src/db/repositories/role-authorization-repository.js';
-import type { DB } from '../../src/db/types.js';
-import { exportJson, exportText, roleAuthExport } from './report.js';
-
-const args = process.argv.slice(2);
-const unknown = args.filter((arg) => arg !== '--json');
-if (unknown.length > 0) {
-  process.stderr.write(
-    `Unknown arguments: ${unknown.join(' ')}\nUsage: role-auth:export [--json]\n`,
-  );
-  process.exit(2);
-}
-
-const db = createDb<DB>(dbConfigFrom(loadEnv(process.env)));
-try {
-  const servers = roleAuthExport(await new RoleAuthorizationRepository(db).list());
-  process.stdout.write(args.includes('--json') ? exportJson(servers) : exportText(servers));
-} finally {
-  await db.destroy();
-}
diff --git a/src/db/repositories/role-authorization-repository.db.test.ts b/src/db/repositories/role-authorization-repository.db.test.ts
index af550ac1b97d9103755b0a71bb0750a787e31892..b19a94029026ace6b321a3c7ea6ad7c6c2bee7d6 100644
--- a/src/db/repositories/role-authorization-repository.db.test.ts
+++ b/src/db/repositories/role-authorization-repository.db.test.ts
@@ -1,6 +1,6 @@
 import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
-import { exportText, roleAuthExport } from '../../../scripts/role-auth/report.js';
+import { exportText, roleAuthExport } from '../../ops/role-auth.js';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import type { DB } from '../types.js';
 import { RoleAuthorizationRepository } from './role-authorization-repository.js';
diff --git a/src/ops/emoji-upload-cli.ts b/src/ops/emoji-upload-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..676d410ed3d5121d7d12fb7a50dc1c7e8f561808
--- /dev/null
+++ b/src/ops/emoji-upload-cli.ts
@@ -0,0 +1,29 @@
+import { REST } from 'discord.js';
+import { isSnowflake } from '../db/snowflake.js';
+import { emojiImage, uploadEmoji } from './emoji-upload.js';
+
+// Uploads the game's type, weather and team icons the bot's application lacks as its emoji:
+//   node dist/ops/emoji-upload-cli.js [--apply]     (`./pine emoji-upload`, `npm run emoji:upload`)
+// A dry run by default: it lists the application's emoji (a request to Discord) and says what it
+// would upload. Reads DISCORD_TOKEN and DISCORD_APP_ID from the environment and prints neither.
+const args = process.argv.slice(2);
+const unknown = args.filter((arg) => arg !== '--apply');
+if (unknown.length > 0) {
+  process.stderr.write(`Unknown arguments: ${unknown.join(' ')}\nUsage: emoji-upload [--apply]\n`);
+  process.exit(2);
+}
+const token = process.env.DISCORD_TOKEN?.trim();
+const appId = process.env.DISCORD_APP_ID?.trim();
+if (!token || !appId || !isSnowflake(appId)) {
+  process.stderr.write('DISCORD_TOKEN and DISCORD_APP_ID must be set (in .env).\n');
+  process.exit(1);
+}
+
+process.exitCode = await uploadEmoji({
+  rest: new REST().setToken(token),
+  appId,
+  apply: args.includes('--apply'),
+  image: emojiImage,
+  say: (line) => process.stdout.write(`${line}\n`),
+  warn: (line) => process.stderr.write(`${line}\n`),
+});
diff --git a/src/ops/emoji-upload.test.ts b/src/ops/emoji-upload.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..98b06bf81dbb595146b9ab49ac25e3d09cecabfe
--- /dev/null
+++ b/src/ops/emoji-upload.test.ts
@@ -0,0 +1,176 @@
+import { DiscordAPIError, HTTPError } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { GAME_ICON_NAMES } from '../domain/pogo/game-icons.js';
+import {
+  failureReason,
+  iconSources,
+  missingIcons,
+  POGO_ASSETS,
+  uploadEmoji,
+  type EmojiRest,
+  type IconSource,
+} from './emoji-upload.js';
+
+const APP = '400000000000000777';
+
+/**
+ * Discord's REST API as the upload uses it: the application's emoji listed, one made per POST.
+ * Refuses another application, a second emoji of a name, and an image that is no PNG data URL.
+ */
+class FakeEmojiRest implements EmojiRest {
+  readonly posted: string[] = [];
+  listFails: Error | undefined;
+
+  constructor(private readonly names: string[]) {}
+
+  get(route: `/${string}`): Promise<unknown> {
+    if (route !== `/applications/${APP}/emojis`) return Promise.reject(new Error('404'));
+    if (this.listFails) return Promise.reject(this.listFails);
+    return Promise.resolve({ items: this.names.map((name, i) => ({ id: String(i), name })) });
+  }
+
+  post(route: `/${string}`, options: { body: unknown }): Promise<unknown> {
+    if (route !== `/applications/${APP}/emojis`) return Promise.reject(new Error('404'));
+    const { name, image } = options.body as { name: string; image: string };
+    if (this.names.includes(name)) return Promise.reject(new Error('name taken'));
+    if (!image.startsWith('data:image/png;base64,')) return Promise.reject(new Error('no PNG'));
+    this.names.push(name);
+    this.posted.push(name);
+    return Promise.resolve({ id: name, name });
+  }
+}
+
+/** Everything the upload says, and a picture for every icon unless it is named to fail. */
+function uploadWith(rest: FakeEmojiRest, apply: boolean, failing: readonly string[] = []) {
+  const said: string[] = [];
+  const warned: string[] = [];
+  const made: string[] = [];
+  const run = uploadEmoji({
+    rest,
+    appId: APP,
+    apply,
+    image: (source: IconSource) => {
+      made.push(source.name);
+      return failing.includes(source.name)
+        ? Promise.reject(new Error(`${source.name}: the icon answered 404`))
+        : Promise.resolve(Buffer.from('png'));
+    },
+    say: (line) => said.push(line),
+    warn: (line) => warned.push(line),
+  });
+  return { run, said, warned, made };
+}
+
+describe('uploadEmoji', () => {
+  const all = GAME_ICON_NAMES.length;
+
+  it('makes the missing icons on a dry run and uploads none of them', async () => {
+    const rest = new FakeEmojiRest(['rock', 'valor']);
+    const { run, said, made } = uploadWith(rest, false);
+    expect(await run).toBe(0);
+    expect(rest.posted).toEqual([]);
+    expect(made).toHaveLength(all - 2);
+    expect(said[0]).toBe(
+      `The application has 2 emoji; ${all - 2} of the game's icons are missing.`,
+    );
+    expect(said).toContain('would upload bug (3 bytes)');
+    expect(said.at(-2)).toBe(`Would upload ${all - 2} of ${all - 2}; 0 failed.`);
+    expect(said.at(-1)).toBe('Run again with --apply to upload them.');
+  });
+
+  it('uploads only what the application lacks with --apply', async () => {
+    const rest = new FakeEmojiRest(['rock']);
+    const { run, said } = uploadWith(rest, true);
+    expect(await run).toBe(0);
+    expect(rest.posted).toHaveLength(all - 1);
+    expect(rest.posted).not.toContain('rock');
+    expect(said.at(-1)).toBe(`Uploaded ${all - 1} of ${all - 1}; 0 failed.`);
+  });
+
+  it('goes on past an icon that fails, says it, and ends with a failure', async () => {
+    const rest = new FakeEmojiRest([]);
+    const { run, said, warned } = uploadWith(rest, true, ['fog']);
+    expect(await run).toBe(1);
+    expect(warned).toEqual(['fog failed: fog: the icon answered 404']);
+    expect(rest.posted).toHaveLength(all - 1);
+    expect(said.at(-1)).toBe(`Uploaded ${all - 1} of ${all}; 1 failed.`);
+  });
+
+  it('stops when the emoji cannot be listed, having made and uploaded nothing', async () => {
+    const rest = new FakeEmojiRest([]);
+    rest.listFails = new HTTPError(503, 'Service Unavailable', 'GET', '/x', {});
+    const { run, warned, made } = uploadWith(rest, true);
+    expect(await run).toBe(1);
+    expect(warned).toEqual(['Could not list the emoji of the application: Discord answered 503']);
+    expect(made).toEqual([]);
+    expect(rest.posted).toEqual([]);
+  });
+
+  it('says so when nothing is missing', async () => {
+    const rest = new FakeEmojiRest([...GAME_ICON_NAMES]);
+    const { run, said } = uploadWith(rest, false);
+    expect(await run).toBe(0);
+    expect(said).toEqual([
+      `The application has ${all} emoji; 0 of the game's icons are missing.`,
+      'Would upload 0 of 0; 0 failed.',
+    ]);
+  });
+});
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
diff --git a/src/ops/emoji-upload.ts b/src/ops/emoji-upload.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fa37a025ac725740b95319b3692295fcff499560
--- /dev/null
+++ b/src/ops/emoji-upload.ts
@@ -0,0 +1,177 @@
+import { DiscordAPIError, HTTPError, Routes, type APIApplicationEmoji } from 'discord.js';
+import sharp from 'sharp';
+import { TEAM_ICON_NAMES, TYPE_ICON_NAMES, WEATHER_ICON_NAMES } from '../domain/pogo/game-icons.js';
+
+/*
+ * The game's icons for types, weather and teams as emoji of the bot's application
+ * (`./pine emoji-upload`, `npm run emoji:upload`; `emoji-upload-cli.ts`). Only the names the
+ * application lacks are made; nothing is renamed, replaced or deleted. A dry run says what it
+ * would upload; `apply` uploads.
+ */
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
+
+/** The part of discord.js's `REST` the upload needs. */
+export interface EmojiRest {
+  get(route: `/${string}`): Promise<unknown>;
+  post(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
+}
+
+/** The emoji names of the application, as Discord lists them. */
+export async function applicationEmojiNames(rest: EmojiRest, appId: string): Promise<string[]> {
+  const listed = (await rest.get(Routes.applicationEmojis(appId))) as {
+    items: APIApplicationEmoji[];
+  };
+  return listed.items.flatMap((emoji) => (emoji.name ? [emoji.name] : []));
+}
+
+/** The icon, downloaded and fitted into a square PNG with a transparent margin. */
+export async function emojiImage(source: IconSource): Promise<Buffer> {
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
+export interface EmojiUploadOptions {
+  rest: EmojiRest;
+  appId: string;
+  /** Upload; without it, only say what would be uploaded. */
+  apply: boolean;
+  /** The PNG of an icon (`emojiImage`). */
+  image: (source: IconSource) => Promise<Buffer>;
+  /** A line of the report. */
+  say: (line: string) => void;
+  /** A line about a failure. */
+  warn: (line: string) => void;
+}
+
+/**
+ * Makes the emoji the application lacks, one after the other; an icon that fails is said in one
+ * line and the others go on. Resolves to the exit status: 1 when the emoji could not be listed
+ * or anything failed. Never says the token or the application's id.
+ */
+export async function uploadEmoji(options: EmojiUploadOptions): Promise<number> {
+  const { rest, appId, apply, image, say, warn } = options;
+  let existing: string[];
+  try {
+    existing = await applicationEmojiNames(rest, appId);
+  } catch (err) {
+    warn(`Could not list the emoji of the application: ${failureReason(err)}`);
+    return 1;
+  }
+  const missing = missingIcons(iconSources(), existing);
+  say(
+    `The application has ${existing.length} emoji; ${missing.length} of the game's icons are missing.`,
+  );
+  let done = 0;
+  let failed = 0;
+  for (const source of missing) {
+    try {
+      const picture = await image(source);
+      if (!apply) {
+        say(`would upload ${source.name} (${picture.length} bytes)`);
+      } else {
+        await rest.post(Routes.applicationEmojis(appId), {
+          body: { name: source.name, image: `data:image/png;base64,${picture.toString('base64')}` },
+        });
+        say(`uploaded ${source.name}`);
+      }
+      done++;
+    } catch (err) {
+      failed++;
+      warn(`${source.name} failed: ${failureReason(err)}`);
+    }
+  }
+  say(`${apply ? 'Uploaded' : 'Would upload'} ${done} of ${missing.length}; ${failed} failed.`);
+  if (!apply && done > 0) say('Run again with --apply to upload them.');
+  return failed > 0 ? 1 : 0;
+}
diff --git a/src/ops/role-auth-cli.ts b/src/ops/role-auth-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cb6790796db70b32b4c9d1761bee463900fe409b
--- /dev/null
+++ b/src/ops/role-auth-cli.ts
@@ -0,0 +1,41 @@
+import { ConfigError, type Env } from '../config/index.js';
+import { loadEnv } from '../config/env.js';
+import { dbConfigFrom } from '../db/db-config.js';
+import { createDb } from '../db/kysely.js';
+import { RoleAuthorizationRepository } from '../db/repositories/role-authorization-repository.js';
+import type { DB } from '../db/types.js';
+import { exportJson, exportText, roleAuthExport } from './role-auth.js';
+
+// Prints the legacy role authorization of the configured database for the cutover: per server,
+// every legacy command that requires a role or has roles listed, the slash command of the new
+// bot it became, and what is odd about it.
+//   node dist/ops/role-auth-cli.js [--json]   (`./pine role-auth-export`, `npm run role-auth:export`)
+// It only reads (`CommandRoleAuthorization`, `CommandRoles`, `Guild`) and never contacts
+// Discord, so roles are given by their ids.
+const args = process.argv.slice(2);
+const unknown = args.filter((arg) => arg !== '--json');
+if (unknown.length > 0) {
+  process.stderr.write(
+    `Unknown arguments: ${unknown.join(' ')}\nUsage: role-auth-export [--json]\n`,
+  );
+  process.exit(2);
+}
+
+let env: Env;
+try {
+  env = loadEnv(process.env);
+} catch (err) {
+  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
+  process.exit(1);
+}
+
+const db = createDb<DB>(dbConfigFrom(env));
+try {
+  const servers = roleAuthExport(await new RoleAuthorizationRepository(db).list());
+  process.stdout.write(args.includes('--json') ? exportJson(servers) : exportText(servers));
+} catch (err) {
+  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
+  process.exitCode = 1;
+} finally {
+  await db.destroy();
+}
diff --git a/scripts/role-auth/report.test.ts b/src/ops/role-auth.test.ts
similarity index 98%
rename from scripts/role-auth/report.test.ts
rename to src/ops/role-auth.test.ts
index f2b978bf2c0708054dc9fa18b776c7b8a5999fcc..90037dbbe67e9f22376fdf11b0c44773567cdb6f 100644
--- a/scripts/role-auth/report.test.ts
+++ b/src/ops/role-auth.test.ts
@@ -1,6 +1,12 @@
 import { describe, expect, it } from 'vitest';
-import { commands } from '../../src/commands/index.js';
-import { exportJson, exportText, LEGACY_COMMANDS, newCommandOf, roleAuthExport } from './report.js';
+import { commands } from '../commands/index.js';
+import {
+  exportJson,
+  exportText,
+  LEGACY_COMMANDS,
+  newCommandOf,
+  roleAuthExport,
+} from './role-auth.js';
 
 const HOME = '412345678901234567';
 const AWAY = '412345678901234568';
diff --git a/scripts/role-auth/report.ts b/src/ops/role-auth.ts
similarity index 98%
rename from scripts/role-auth/report.ts
rename to src/ops/role-auth.ts
index d73db71fc49a54ae43a07803cc6743b3f4d3fe40..f9e132fcd168a7b732ae09f000868bb2c8c3c40c 100644
--- a/scripts/role-auth/report.ts
+++ b/src/ops/role-auth.ts
@@ -5,7 +5,7 @@
  * Settings, Integrations, Professor Pine) at the cutover (spec 9.1). Pure: the database is read
  * by `RoleAuthorizationRepository`, and Discord is never asked.
  */
-import type { LegacyCommandRoles } from '../../src/db/repositories/role-authorization-repository.js';
+import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
 
 /**
  * What a legacy command became:
````

### Task 2: Plan 8C T2: the settings converter of a legacy installation

Prototype commit: `1c7499e1b4a148ae4e0e10eba56b39402bad6379`

./pine convert-settings <legacy data folder> [--out <folder>] [--force] (npm run
settings:convert on a checkout) reads the legacy settings.json and private-settings.json and
writes pine-settings.json and env-from-legacy.txt, never .env itself:
- The settings start from the repository's data/settings.json, so that the keys the legacy
  file lacks (timezone, ocr, the feeds) take the new defaults; every key the new bot reads
  keeps its legacy value, channels.ex-gym-raids becomes channels.elite-gym-raids, help groups
  the new bot lacks (silph) leave helpGroups, regionMapLink comes from the private settings,
  and what nothing reads (the EX durations, commandPrefix, the reactions) is dropped and
  named. The result must pass the bot's own schema, or nothing is written.
- The private settings map to the variables of .env (token, owner, database, picture
  address, Google, GitHub's token and repository); the fragment is written owner-only and
  says what to add by hand (DISCORD_APP_ID, DB_ROOT_PASSWORD, BACKUP_DIR; a root DB_USER,
  which the stack cannot create). Names and set / empty are printed, never a value.
- Neither file is written when either exists, unless --force.
- In the stack it runs without Compose (which refuses compose.yaml without .env): the image
  is built under a tag of its own (professor-pine:convert-settings: a stack's tag would re-tag
  the image that stack runs) and run by docker as
  the operator's user, the legacy folder mounted read-only;
  docker_folder gives Docker the folder (pwd -W in Git Bash). Tried through ./pine on this
  machine with the test fixture.
- A feature flag the legacy file lacks is off (the legacy bot read it as undefined) and is
  named; secrets are copied as written, never trimmed, and a snowflake written as a JSON
  number is refused; BACKUP_DIR is written as ./backups, never blank; a byte order mark is
  read; both files go to temporary files (the fragment owner-only from its creation) and are
  renamed into place only when both were written.
The fixture test/fixtures/legacy-install is the legacy defaults of main-dev with
production's differences (channels.unown, features.remoteRaidChannel) and made-up secrets.

**Files:**

```
 .gitignore                                         |   3 +-
 CLAUDE.md                                          |   2 +
 docs/architecture/operations.md                    |  10 +-
 package.json                                       |   1 +
 pine                                               |  65 +++++-
 src/ops/convert-settings-cli.ts                    |  42 ++++
 src/ops/convert-settings.test.ts                   | 292 +++++++++++++++++++++++++
 src/ops/convert-settings.ts                        | 471 +++++++++++++++++++++++++++++++++++++++++
 test/fixtures/legacy-install/private-settings.json |  18 ++
 test/fixtures/legacy-install/settings.json         | 131 ++++++++++++
 10 files changed, 1029 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/ops/convert-settings.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1c7499e1b4a148ae4e0e10eba56b39402bad6379 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8C T2: the settings converter of a legacy installation`, the body above and the trailer, staging exactly
  `.gitignore CLAUDE.md docs/architecture/operations.md package.json pine src/ops/convert-settings-cli.ts src/ops/convert-settings.test.ts src/ops/convert-settings.ts test/fixtures/legacy-install/private-settings.json test/fixtures/legacy-install/settings.json`.

````diff
diff --git a/.gitignore b/.gitignore
index 3a08947c9ed3969830ecdd196eb383ddc95f33b6..2ca489e531ae1ecd79acda5b20127f363ccac7af 100644
--- a/.gitignore
+++ b/.gitignore
@@ -32,8 +32,9 @@ dist/
 coverage/
 var/
 .env
-# the settings of a Docker installation (./pine)
+# the settings of a Docker installation (./pine), and the .env lines the converter makes
 /pine-settings.json
+/env-from-legacy.txt
 
 # backups of the Docker stack (BACKUP_DIR)
 /backups/
diff --git a/CLAUDE.md b/CLAUDE.md
index 66dc36ea78b9574ac5e8d053e895708e21b58625..87363e7b5d30e8f35aab25c972e356ce432cd7f8 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -61,6 +61,7 @@ npm run fixtures:game-data   # rebuild the game-data test fixtures (add -- --dow
 npm run raid-bosses:check    # download the raid boss feed and print the list Pine makes of it (writes nothing)
 npm run role-auth:export     # print the legacy role authorization per server, mapped to the new commands (reads only; --json)
 npm run emoji:upload         # upload the game's type, weather and team icons the bot's application lacks as its emoji (a dry run; --apply uploads)
+npm run settings:convert -- <legacy data folder> [--out <dir>] [--force]   # the settings converter on the checkout (as ./pine convert-settings)
 npm run migrate        # run Kysely migrations against the configured database
 npm run ocr:check -- <folder> [--labels <file>] [--baseline <file>] [--write-baseline <file>] [--bosses <file>] [--write-bosses <file>] [--device cpu|cuda|directml] [--threads n] [--priority low|normal]   # read screenshots with the real models; scores (also of a review folder), clocks' confidence and time
@@ -77,6 +78,7 @@ The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with
 ./pine restore <dump> --no-start [--replace [--no-backup]]   # load a legacy or Pine dump (.sql or .sql.gz), lower-case tables renamed; without --no-start on a terminal, or with --start, it logs the bot in
 ./pine deploy-commands [--global | --guild <id>]   # contacts Discord: only when Matt asks
 ./pine update | shell        # backup, git pull, rebuild, restart (logs the bot in: only when Matt asks); a shell in the bot's container
+./pine convert-settings <legacy data folder> [--out <folder>] [--force]   # pine-settings.json and env-from-legacy.txt (.env lines) from a legacy installation (reads its private settings: Matt runs it)
 ./pine emoji-upload [--apply]   # the game's icons the application lacks as its emoji: contacts Discord (a dry run reads; --apply uploads): only when Matt asks
 ./pine role-auth-export [--json]   # the legacy role authorization of the database, mapped to the new commands (reads only)
 ```
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index c52f9de776f888416a5cc734c01b0aa971a0281b..e4593b0c7287db24270298975f17fcea39532166 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -4,10 +4,10 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 
 ## The rule
 
-- A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `tr`, `basename`, `dirname`). A step that would need anything else on the host is wrong.
+- A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `tr`, `basename`, `dirname`, `id`). A step that would need anything else on the host is wrong.
 - The script is checked with `shellcheck -s sh` (the `koalaman/shellcheck` image) and kept LF by `.gitattributes`, as is every `*.sh`. It exports `MSYS_NO_PATHCONV=1`, so Git Bash leaves container paths (`/pine/backup.sh`) alone. A command is a function `cmd_<name>` (a hyphen is an underscore) plus a line of `usage`; nothing else needs to know of it; the dispatch is a function, read whole before `update` replaces the file. Each command says what it does and runs Compose through `run`, which prints the command first; errors are plain sentences through `fail`; a command that stopped the bot and then fails says "The bot, its watchdog and the backups are stopped: './pine up' starts them again." (a restore whose load the bot would refuse says that instead) A path the operator gives (a dump) is read from where they ran the script.
 - The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `emoji-upload` contacts Discord through its REST API (its dry run lists the application's emoji, `--apply` uploads); `migrate`, `backup`, `restore --no-start`, `role-auth-export`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
-- The installation's own files are git-ignored and beside `compose.yaml`: `.env` (secrets) and `pine-settings.json` (the settings, made from `data/settings.json`; the converter of plan 8C later). `./pine` refuses to run without either and says how to make them; the repository's `data/settings.json` is never the installation's, so `update` finds no change of its own. `pine-settings.json` is mounted as a single file: an editor saves by writing a new file, which a running container never sees, so an edit needs `./pine restart` (and `./pine restart backup` for the backups' time zone). `PINE_ENV_FILE`, `PINE_SETTINGS` and `COMPOSE_PROJECT_NAME` give a second stack on the same machine its own files, volumes and image (`professor-pine:<project>`) (a rehearsal, a scratch stack). The project's name is Compose's to resolve and `./pine` never sets it: the shell's `COMPOSE_PROJECT_NAME`, else the one in the env file (a rehearsal's `.env` names itself there), else `pine` (the `name:` of `compose.yaml`). Were the script to set it, it would outrank the env file and a rehearsal's `restore --replace` or `down` would act on production.
+- The installation's own files are git-ignored and beside `compose.yaml`: `.env` (secrets) and `pine-settings.json` (the settings, made from `data/settings.json`, or from a legacy installation by `./pine convert-settings`). `./pine` refuses to run without either and says how to make them; the repository's `data/settings.json` is never the installation's, so `update` finds no change of its own. `pine-settings.json` is mounted as a single file: an editor saves by writing a new file, which a running container never sees, so an edit needs `./pine restart` (and `./pine restart backup` for the backups' time zone). `PINE_ENV_FILE`, `PINE_SETTINGS` and `COMPOSE_PROJECT_NAME` give a second stack on the same machine its own files, volumes and image (`professor-pine:<project>`) (a rehearsal, a scratch stack). The project's name is Compose's to resolve and `./pine` never sets it: the shell's `COMPOSE_PROJECT_NAME`, else the one in the env file (a rehearsal's `.env` names itself there), else `pine` (the `name:` of `compose.yaml`). Were the script to set it, it would outrank the env file and a rehearsal's `restore --replace` or `down` would act on production.
 - `./pine update`, in this order, nothing changed until the backup is made: it refuses a clone with changes of its own and a branch without an upstream; `git fetch`, and nothing more when there is nothing new; the database is checked and, if it has tables, a verified backup is made through the stack as it runs now (a pulled change may upgrade MySQL or migrate the data); a failed check or backup stops it, nothing changed. Then `git pull --ff-only`, the build, `up -d`, and the backup service and the watchdog recreated (they run what the checkout mounts). A failed build or start after the pull says "The code is updated but the stack still runs the old version: './pine up' builds and starts it."; `./pine up` also finishes an update that stopped there (a second `update` finds nothing new).
 
 ## The image
@@ -61,6 +61,12 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 - `restoreStep` (`src/ops/restore.ts`) is the CLI's logic, tested against MySQL with its exit codes. `PINE_TABLES` lists every table the bot knows (the legacy ones from the generated baseline); a migration that adds a table adds it there, or `restore.db.test.ts` fails.
 - `./pine migrate` runs the migrations in a one-off container without starting the bot: no Discord. It is how a restored copy is checked without logging in.
 
+## Moving a legacy installation
+
+The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md`).
+
+- `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address, Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
+
 ## Open items
 
 - MySQL follows the current LTS release (Matt, 2026-10-16): the stack, the backup service and the tests run `mysql:8.4`; a dump from production's 8.0 loads into it. When a newer LTS comes out, all three move together (the data directory upgrades in place on the first start; `./pine update` backs it up first). Node follows its LTS the same way (Node 26 once it is LTS).
diff --git a/package.json b/package.json
index 2967e339bb90bd7d8f94dfed7fd7c1484fbdae68..b1b2734987f35b761160df8d3ed36eda8bdca27c 100644
--- a/package.json
+++ b/package.json
@@ -20,6 +20,7 @@
     "ocr:review": "tsx scripts/ocr/review.ts",
     "role-auth:export": "tsx --env-file-if-exists=.env src/ops/role-auth-cli.ts",
     "emoji:upload": "tsx --env-file-if-exists=.env src/ops/emoji-upload-cli.ts",
+    "settings:convert": "tsx src/ops/convert-settings-cli.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
diff --git a/pine b/pine
index a18bb80bd236064aba467d39a2e3753025c0fcd2..0f52e202eeebaaa539c0f88c95bdf887012d2e44 100755
--- a/pine
+++ b/pine
@@ -69,16 +69,28 @@ run() {
   compose "$@"
 }
 
-need_stack() {
+need_docker() {
   command -v docker >/dev/null 2>&1 ||
     fail "Docker is not installed (or not on the PATH). The stack needs Docker with Compose."
   docker compose version >/dev/null 2>&1 ||
     fail "Docker Compose is missing: 'docker compose version' does not answer."
+}
+
+need_stack() {
+  need_docker
   [ -f "$PINE_ENV_FILE" ] ||
-    fail "There is no $PINE_ENV_FILE here. Copy .env.example to .env and fill it in."
+    fail "There is no $PINE_ENV_FILE here. Copy .env.example to .env and fill it in ('./pine convert-settings' makes its lines from a legacy installation)."
   # Without it Docker would mount an empty folder in its place.
   [ -f "$PINE_SETTINGS" ] ||
-    fail "There is no $PINE_SETTINGS here. Copy data/settings.json to pine-settings.json and edit it (timezone, channel names)."
+    fail "There is no $PINE_SETTINGS here. Copy data/settings.json to pine-settings.json and edit it (timezone, channel names), or make it from a legacy installation with './pine convert-settings'."
+}
+
+# A folder the operator gave (as seen from where they ran ./pine), as Docker takes it for a bind
+# mount: an absolute path; in Git Bash the Windows form (C:/...), which Docker Desktop takes.
+docker_folder() {
+  dir=$(from_caller "$1")
+  [ -d "$dir" ] || fail "There is no folder $dir."
+  (cd "$dir" && { pwd -W 2>/dev/null || pwd; })
 }
 
 # The bot's image, built from this checkout (quick when nothing changed).
@@ -112,6 +124,9 @@ Usage: ./pine <command>
                      register the slash commands with Discord (everywhere by default)
   update             back up the database, then fetch the newest code (git pull), rebuild
                      and restart what changed (nothing when there is nothing new)
+  convert-settings <legacy data folder> [--out <folder>] [--force]
+                     make pine-settings.json and env-from-legacy.txt (the lines of .env) from a
+                     legacy installation's settings.json and private-settings.json
   emoji-upload [--apply]
                      the game's icons the bot's application lacks as its emoji: a dry run
                      (reads the application's emoji from Discord); --apply uploads them
@@ -239,6 +254,50 @@ cmd_deploy_commands() {
   run run --rm --no-deps pine node --enable-source-maps dist/discord/deploy-cli.js "$@"
 }
 
+# Without the stack's files (it makes them): the image is built and run by plain docker, since
+# Compose would refuse to read compose.yaml without .env.
+cmd_convert_settings() {
+  need_docker
+  usage_line="Usage: ./pine convert-settings <legacy data folder> [--out <folder>] [--force]"
+  legacy=
+  out=
+  force=
+  while [ $# -gt 0 ]; do
+    case $1 in
+      --force) force=--force ;;
+      --out)
+        [ $# -gt 1 ] || fail "--out needs a folder. $usage_line"
+        out=$2
+        shift
+        ;;
+      -*) fail "convert-settings does not know '$1'. $usage_line" ;;
+      *)
+        [ -z "$legacy" ] || fail "Name one legacy data folder only. $usage_line"
+        legacy=$1
+        ;;
+    esac
+    shift
+  done
+  [ -n "$legacy" ] || fail "Name the legacy bot's data folder (with settings.json and private-settings.json). $usage_line"
+  legacy=$(docker_folder "$legacy")
+  # By default the files go beside compose.yaml, where ./pine looks for them.
+  if [ -n "$out" ]; then
+    out=$(docker_folder "$out")
+  else
+    out=$(pwd -W 2>/dev/null || pwd)
+  fi
+  # An image of its own: building under a stack's tag would re-tag the image that stack runs.
+  image=professor-pine:convert-settings
+  say "Building the bot's image from this checkout."
+  say "> docker build -t $image ."
+  docker build -t "$image" . || fail "The image could not be built (Docker said why above)."
+  say "Converting the legacy settings in $legacy (read only) into $out."
+  # As the operator's own user, so that the files written are theirs.
+  docker run --rm --user "$(id -u):$(id -g)" \
+    -v "$legacy:/legacy:ro" -v "$out:/out" \
+    "$image" node dist/ops/convert-settings-cli.js /legacy --out /out ${force:+"$force"}
+}
+
 cmd_emoji_upload() {
   need_stack
   build_image
diff --git a/src/ops/convert-settings-cli.ts b/src/ops/convert-settings-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..878c31311b64f9b750951c922d594e2cd9535f02
--- /dev/null
+++ b/src/ops/convert-settings-cli.ts
@@ -0,0 +1,42 @@
+import { convertInstallation } from './convert-settings.js';
+
+// The settings converter of a legacy installation:
+//   node dist/ops/convert-settings-cli.js <legacy data folder> [--out <dir>] [--force]
+// (`./pine convert-settings`, `npm run settings:convert`). Writes pine-settings.json and
+// env-from-legacy.txt into the folder `--out` names (here by default), refusing to write over
+// either without --force; prints the names of what it kept, dropped and mapped, never a secret.
+const USAGE = 'Usage: convert-settings <legacy data folder> [--out <dir>] [--force]';
+const args = process.argv.slice(2);
+let legacyDir: string | undefined;
+let outDir = '.';
+let force = false;
+for (let i = 0; i < args.length; i++) {
+  const arg = args[i] ?? '';
+  if (arg === '--force') {
+    force = true;
+  } else if (arg === '--out') {
+    const next = args[++i];
+    if (next === undefined) {
+      process.stderr.write(`--out needs a folder.\n${USAGE}\n`);
+      process.exit(2);
+    }
+    outDir = next;
+  } else if (arg.startsWith('-') || legacyDir !== undefined) {
+    process.stderr.write(`Unknown argument: ${arg}\n${USAGE}\n`);
+    process.exit(2);
+  } else {
+    legacyDir = arg;
+  }
+}
+if (legacyDir === undefined) {
+  process.stderr.write(`Name the legacy bot's data folder.\n${USAGE}\n`);
+  process.exit(2);
+}
+
+process.exitCode = convertInstallation({
+  legacyDir,
+  outDir,
+  force,
+  defaultsPath: 'data/settings.json',
+  say: (line) => process.stdout.write(`${line}\n`),
+});
diff --git a/src/ops/convert-settings.test.ts b/src/ops/convert-settings.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f4c346c5ea9e61e7f7416f18397fcd24293e9347
--- /dev/null
+++ b/src/ops/convert-settings.test.ts
@@ -0,0 +1,292 @@
+import {
+  mkdtempSync,
+  readFileSync,
+  statSync,
+  writeFileSync,
+  mkdirSync,
+  copyFileSync,
+  rmSync,
+} from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { afterEach, describe, expect, it } from 'vitest';
+import { loadEnv } from '../config/env.js';
+import { loadSettings } from '../config/settings.js';
+import {
+  convertInstallation,
+  convertSettings,
+  ENV_FRAGMENT,
+  SETTINGS_FILE,
+} from './convert-settings.js';
+
+/**
+ * A legacy installation shaped like Pittsburgh's (2026-10-16): the legacy defaults of
+ * `main-dev` with production's differences (`channels.unown`, `features.remoteRaidChannel`),
+ * and private settings whose every secret is made up.
+ */
+const LEGACY = 'test/fixtures/legacy-install';
+/** The new bot's own defaults, which the settings the legacy file lacks take. */
+const DEFAULTS = 'data/settings.json';
+
+const read = (file: string): unknown => JSON.parse(readFileSync(file, 'utf8'));
+const legacySettings = () => read(path.join(LEGACY, 'settings.json'));
+const legacyPrivate = () => read(path.join(LEGACY, 'private-settings.json'));
+
+/** The folders the tests made, removed after each. */
+const made: string[] = [];
+afterEach(() => {
+  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
+});
+
+/** A fresh folder with the legacy files in it, and one to write to. */
+function folders(withPrivate = true) {
+  const root = mkdtempSync(path.join(tmpdir(), 'pine-convert-'));
+  made.push(root);
+  const legacy = path.join(root, 'data');
+  const out = path.join(root, 'out');
+  mkdirSync(legacy);
+  mkdirSync(out);
+  copyFileSync(path.join(LEGACY, 'settings.json'), path.join(legacy, 'settings.json'));
+  if (withPrivate) {
+    copyFileSync(
+      path.join(LEGACY, 'private-settings.json'),
+      path.join(legacy, 'private-settings.json'),
+    );
+  }
+  return { legacy, out };
+}
+
+function run(options: { legacy: string; out: string; force?: boolean }) {
+  const lines: string[] = [];
+  const status = convertInstallation({
+    legacyDir: options.legacy,
+    outDir: options.out,
+    force: options.force ?? false,
+    defaultsPath: DEFAULTS,
+    say: (line) => lines.push(line),
+  });
+  return { status, lines, text: lines.join('\n') };
+}
+
+/** The `.env` fragment as the variables it sets. */
+function fragmentValues(file: string): Record<string, string> {
+  const values: Record<string, string> = {};
+  for (const line of readFileSync(file, 'utf8').split('\n')) {
+    const match = /^([A-Z_]+)=(.*)$/.exec(line);
+    if (!match?.[1]) continue;
+    const raw = match[2] ?? '';
+    values[match[1]] = raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1) : raw;
+  }
+  return values;
+}
+
+describe('convertSettings', () => {
+  it('keeps what the new bot reads, maps the renamed keys and fills in the new ones', () => {
+    const converted = convertSettings(legacySettings(), legacyPrivate(), read(DEFAULTS));
+    if (!converted.ok) throw new Error(converted.error);
+    const { settings } = converted;
+    const channels = settings.channels as Record<string, string>;
+    expect(channels.unown).toBe('wild-unown-sightings');
+    expect(channels['elite-gym-raids']).toBe('potential-ex-gym-raids');
+    expect(channels).not.toHaveProperty('ex-gym-raids');
+    expect((settings.features as Record<string, boolean>).remoteRaidChannel).toBe(false);
+    expect(settings.regionMapLink).toBe('https://maps.example.test/legacy-regions');
+    // New settings the legacy file never had come from the new defaults.
+    expect(settings.timezone).toBe('America/New_York');
+    expect(settings.raidBosses).toEqual((read(DEFAULTS) as Record<string, unknown>).raidBosses);
+    expect(converted.renamed).toEqual([
+      { from: 'channels.ex-gym-raids', to: 'channels.elite-gym-raids' },
+    ]);
+    expect(converted.kept).toEqual(
+      expect.arrayContaining([
+        'channels.unown',
+        'channels.elite-gym-raids',
+        'features.remoteRaidChannel',
+        'regionMapLink',
+      ]),
+    );
+    expect(converted.defaulted).toEqual(
+      expect.arrayContaining(['timezone', 'ocr', 'gameData', 'raidBosses', 'raidEvents']),
+    );
+  });
+
+  it('drops what the new bot never reads, and lists it', () => {
+    const converted = convertSettings(legacySettings(), legacyPrivate(), read(DEFAULTS));
+    if (!converted.ok) throw new Error(converted.error);
+    expect(converted.dropped).toEqual([
+      'exclusiveRaidIncubateDuration',
+      'exclusiveRaidHatchedDuration',
+      'commandPrefix',
+      'reactionCommands',
+      'groupReactions',
+      'features.reactionCommands',
+      'helpGroups: silph',
+      'private: discordNotifyToken',
+      'private: githubUser',
+    ]);
+    expect(converted.settings).not.toHaveProperty('commandPrefix');
+    expect(converted.settings.helpGroups).not.toContain('silph');
+    expect(converted.settings.features).not.toHaveProperty('reactionCommands');
+  });
+
+  it('maps every private setting to its variable, and lists what is added by hand', () => {
+    const converted = convertSettings(legacySettings(), legacyPrivate(), read(DEFAULTS));
+    if (!converted.ok) throw new Error(converted.error);
+    expect(Object.fromEntries(converted.env.map((one) => [one.name, one.value]))).toEqual({
+      DISCORD_TOKEN: 'MADE-UP.TOKEN.for-tests-only',
+      OWNER_ID: '412345678901234567',
+      POKEMON_IMAGE_BASE: 'https://images.example.test/pokemon/',
+      GOOGLE_API_KEY: 'made-up-google-key',
+      GITHUB_TOKEN: 'made-up-github-token',
+      GITHUB_REPO: 'example-owner/example-repo',
+      DB_HOST: 'localhost',
+      DB_PORT: '3306',
+      DB_USER: 'pine',
+      DB_PASSWORD: 'made-up pa$$word',
+      DB_SCHEMA: 'pine',
+    });
+    expect(converted.byHand.map((one) => one.name)).toEqual([
+      'DISCORD_APP_ID',
+      'DB_ROOT_PASSWORD',
+      'BACKUP_DIR',
+    ]);
+    expect(converted.dropped).toEqual(
+      expect.arrayContaining(['private: discordNotifyToken', 'private: githubUser']),
+    );
+  });
+
+  it('asks for another database user than root, which the stack cannot create', () => {
+    const secrets = legacyPrivate() as { db: Record<string, string> };
+    secrets.db.user = 'root';
+    const converted = convertSettings(legacySettings(), secrets, read(DEFAULTS));
+    if (!converted.ok) throw new Error(converted.error);
+    expect(converted.env.find((one) => one.name === 'DB_USER')?.value).toBe('');
+    expect(converted.byHand.find((one) => one.name === 'DB_USER')?.why).toMatch(/root/);
+  });
+
+  it('turns off a feature the legacy file lacks, as the legacy bot had it, and says so', () => {
+    const legacy = legacySettings() as { features: Record<string, boolean> };
+    delete legacy.features.notifications;
+    const converted = convertSettings(legacy, legacyPrivate(), read(DEFAULTS));
+    if (!converted.ok) throw new Error(converted.error);
+    expect((converted.settings.features as Record<string, boolean>).notifications).toBe(false);
+    expect(converted.offByAbsence).toEqual(['features.notifications']);
+  });
+
+  it('keeps a secret as written, and refuses a snowflake written as a number', () => {
+    const secrets = legacyPrivate() as Record<string, unknown> & { db: Record<string, string> };
+    secrets.owner = JSON.parse('412345678901234567') as number; // as the legacy file had it, unquoted
+    secrets.db.password = '  spaced out  ';
+    const converted = convertSettings(legacySettings(), secrets, read(DEFAULTS));
+    if (!converted.ok) throw new Error(converted.error);
+    const value = (name: string) => converted.env.find((one) => one.name === name)?.value;
+    expect(value('OWNER_ID')).toBe('');
+    expect(converted.byHand.find((one) => one.name === 'OWNER_ID')?.why).toMatch(/number/);
+    expect(value('DB_PASSWORD')).toBe('  spaced out  ');
+  });
+
+  it('refuses a legacy file whose values the new bot would not take', () => {
+    const broken = legacySettings() as Record<string, unknown>;
+    broken.standardRaidHatchedDuration = 'forty-five';
+    const converted = convertSettings(broken, legacyPrivate(), read(DEFAULTS));
+    expect(converted.ok).toBe(false);
+    if (converted.ok) return;
+    expect(converted.error).toMatch(/standardRaidHatchedDuration/);
+  });
+});
+
+describe('convertInstallation', () => {
+  it('writes settings the bot loads and a fragment with the secrets, and prints none', () => {
+    const { legacy, out } = folders();
+    const { status, text } = run({ legacy, out });
+    expect(status).toBe(0);
+    const settings = loadSettings(path.join(out, SETTINGS_FILE));
+    expect(settings.channels.unown).toBe('wild-unown-sightings');
+    expect(settings.channels['elite-gym-raids']).toBe('potential-ex-gym-raids');
+    expect(settings.features.remoteRaidChannel).toBe(false);
+
+    const values = fragmentValues(path.join(out, ENV_FRAGMENT));
+    expect(values.DISCORD_TOKEN).toBe('MADE-UP.TOKEN.for-tests-only');
+    expect(values.DB_PASSWORD).toBe('made-up pa$$word');
+    expect(values.DISCORD_APP_ID).toBe('');
+    // Never blank: a blank BACKUP_DIR would switch the backups off.
+    expect(values.BACKUP_DIR).toBe('./backups');
+    // With the values added by hand the environment is complete.
+    expect(() =>
+      loadEnv({ ...values, DISCORD_APP_ID: '400000000000000777', SETTINGS_PATH: 'x' }),
+    ).not.toThrow();
+    if (process.platform !== 'win32') {
+      expect(statSync(path.join(out, ENV_FRAGMENT)).mode & 0o777).toBe(0o600);
+    }
+
+    for (const secret of [
+      'MADE-UP',
+      'made-up-google-key',
+      'made-up-github-token',
+      'pa$$word',
+      '412345678901234567',
+    ]) {
+      expect(text).not.toContain(secret);
+    }
+    expect(text).toContain('DISCORD_TOKEN: set');
+    expect(text).toContain('Dropped (the new bot never reads them): exclusiveRaidIncubateDuration');
+    expect(text).toContain('Add by hand to .env:\n  DISCORD_APP_ID: ');
+  });
+
+  it('says a private setting that is empty as empty', () => {
+    const { legacy, out } = folders();
+    const secrets = legacyPrivate() as Record<string, unknown>;
+    secrets.googleApiKey = '';
+    writeFileSync(path.join(legacy, 'private-settings.json'), JSON.stringify(secrets));
+    const { status, text } = run({ legacy, out });
+    expect(status).toBe(0);
+    expect(text).toContain('GOOGLE_API_KEY: empty');
+  });
+
+  it('refuses to write over either file without --force, and writes nothing then', () => {
+    const { legacy, out } = folders();
+    writeFileSync(path.join(out, ENV_FRAGMENT), 'mine\n');
+    const refused = run({ legacy, out });
+    expect(refused.status).toBe(1);
+    expect(refused.text).toMatch(/already exists/);
+    expect(readFileSync(path.join(out, ENV_FRAGMENT), 'utf8')).toBe('mine\n');
+    expect(() => statSync(path.join(out, SETTINGS_FILE))).toThrow();
+
+    const forced = run({ legacy, out, force: true });
+    expect(forced.status).toBe(0);
+    expect(fragmentValues(path.join(out, ENV_FRAGMENT)).DB_SCHEMA).toBe('pine');
+  });
+
+  it('writes the settings alone where the private settings are missing', () => {
+    const { legacy, out } = folders(false);
+    const { status, text } = run({ legacy, out });
+    expect(status).toBe(0);
+    expect(loadSettings(path.join(out, SETTINGS_FILE)).timezone).toBe('America/New_York');
+    expect(() => statSync(path.join(out, ENV_FRAGMENT))).toThrow();
+    expect(text).toMatch(/no private-settings\.json/);
+  });
+
+  it('reads a legacy file that starts with a byte order mark, as the legacy bot did', () => {
+    const { legacy, out } = folders();
+    const file = path.join(legacy, 'settings.json');
+    writeFileSync(file, `${String.fromCharCode(0xfeff)}${readFileSync(file, 'utf8')}`);
+    expect(run({ legacy, out }).status).toBe(0);
+  });
+
+  it('writes nothing when one of the files cannot be written, not even the other', () => {
+    const { legacy, out } = folders();
+    // A folder where the fragment goes: it cannot be written over.
+    mkdirSync(path.join(out, ENV_FRAGMENT));
+    const { status, text } = run({ legacy, out, force: true });
+    expect(status).toBe(1);
+    expect(text).toMatch(/could not be written/);
+    expect(() => statSync(path.join(out, SETTINGS_FILE))).toThrow();
+  });
+
+  it('refuses a folder without a settings.json', () => {
+    const { out } = folders();
+    const { status, text } = run({ legacy: out, out });
+    expect(status).toBe(1);
+    expect(text).toMatch(/settings\.json/);
+  });
+});
diff --git a/src/ops/convert-settings.ts b/src/ops/convert-settings.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bd12912b829920c31ef39432ee1b6072ce769d66
--- /dev/null
+++ b/src/ops/convert-settings.ts
@@ -0,0 +1,471 @@
+import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
+import path from 'node:path';
+import { isDeepStrictEqual } from 'node:util';
+import { z } from 'zod';
+import { CATEGORY_LABELS } from '../commands/categories.js';
+import { settingsSchema, withoutRetiredSettings } from '../config/settings.js';
+
+/*
+ * The settings converter (`./pine convert-settings`, `npm run settings:convert`): a legacy
+ * installation's `data/settings.json` and `data/private-settings.json` become the new bot's
+ * settings (`pine-settings.json`) and the lines of its `.env` (`env-from-legacy.txt`, never `.env`
+ * itself). Every value the new bot reads keeps its legacy value, renamed keys are mapped, the new
+ * keys take the new defaults (the repository's `data/settings.json`), and what the new bot never
+ * reads is dropped and named. Secrets are written to the fragment only, never printed.
+ */
+
+/** The file of the new settings, as `./pine` expects it beside `compose.yaml`. */
+export const SETTINGS_FILE = 'pine-settings.json';
+/** The `.env` lines made of the private settings: the operator copies them into `.env`. */
+export const ENV_FRAGMENT = 'env-from-legacy.txt';
+
+type Json = Record<string, unknown>;
+
+function isObject(value: unknown): value is Json {
+  return typeof value === 'object' && value !== null && !Array.isArray(value);
+}
+
+/** Keys the new bot reads under another name: `[legacy path, new path]`. */
+const RENAMED: readonly (readonly [string, string])[] = [
+  ['channels.ex-gym-raids', 'channels.elite-gym-raids'],
+];
+
+/** The legacy private settings and the variable each became, in the order of `.env.example`. */
+const PRIVATE_TO_ENV: readonly (readonly [string, string])[] = [
+  ['discordBotToken', 'DISCORD_TOKEN'],
+  ['owner', 'OWNER_ID'],
+  ['db.host', 'DB_HOST'],
+  ['db.port', 'DB_PORT'],
+  ['db.user', 'DB_USER'],
+  ['db.password', 'DB_PASSWORD'],
+  ['db.schema', 'DB_SCHEMA'],
+  ['pokemonUrlBase', 'POKEMON_IMAGE_BASE'],
+  ['googleApiKey', 'GOOGLE_API_KEY'],
+  // The legacy bot signed in to GitHub as a user with a password; GitHub takes only a token,
+  // which is what the password field held, and the new bot sends the token alone.
+  ['githubPassword', 'GITHUB_TOKEN'],
+  ['githubRepo', 'GITHUB_REPO'],
+];
+
+/** Private settings that are carried, but not into `.env`. */
+const PRIVATE_TO_SETTINGS = ['regionMapLink'] as const;
+
+/** Why a private setting is dropped, where there is more to say than that nothing reads it. */
+const PRIVATE_DROPPED_WHY: Readonly<Record<string, string>> = {
+  discordNotifyToken: 'the second bot for notifications is not built',
+  githubUser: 'GitHub takes the token alone',
+};
+
+/** Variables the stack needs that the bot cannot make of anything (they can be left blank). */
+const REQUIRED_ENV = [
+  'DISCORD_TOKEN',
+  'OWNER_ID',
+  'DB_USER',
+  'DB_PASSWORD',
+  'DB_SCHEMA',
+  'POKEMON_IMAGE_BASE',
+];
+
+export interface EnvValue {
+  name: string;
+  /** The value, '' when the legacy file has none (or one the operator must give by hand). */
+  value: string;
+}
+
+export interface ByHand {
+  name: string;
+  why: string;
+  /**
+   * What the fragment writes for it meanwhile: blank, which fails loudly where it is needed, or a
+   * safe default (a blank BACKUP_DIR would switch the backups off).
+   */
+  value?: string;
+}
+
+export type Conversion =
+  | {
+      ok: true;
+      /** The new settings file. */
+      settings: Json;
+      /** Settings (paths) whose legacy value differs from the new default. */
+      kept: string[];
+      renamed: { from: string; to: string }[];
+      /** What the new bot never reads: paths, `helpGroups: <value>`, `private: <key>`. */
+      dropped: string[];
+      /** Top-level settings the legacy file lacks, which take the new defaults. */
+      defaulted: string[];
+      /**
+       * Feature flags the legacy file lacks: off for the legacy bot (it read them as undefined),
+       * so off here, whatever the new default.
+       */
+      offByAbsence: string[];
+      /** The variables of `.env` made of the private settings; empty without them. */
+      env: EnvValue[];
+      /** What the operator adds to `.env` by hand, and why. */
+      byHand: ByHand[];
+      /** Sentences about what was dropped from the private settings. */
+      notes: string[];
+    }
+  | { ok: false; error: string };
+
+function getPath(object: Json, dotted: string): unknown {
+  let value: unknown = object;
+  for (const key of dotted.split('.')) {
+    if (!isObject(value) || !Object.hasOwn(value, key)) return undefined;
+    value = value[key];
+  }
+  return value;
+}
+
+/** The legacy settings with the renamed keys under their new names (where the new is free). */
+function renamedLegacy(legacy: Json, renamed: Conversion & { ok: true }): Json {
+  const copy = structuredClone(legacy);
+  for (const [from, to] of RENAMED) {
+    const fromKeys = from.split('.');
+    const toKeys = to.split('.');
+    const fromParent = getPath(copy, fromKeys.slice(0, -1).join('.'));
+    const toParent = getPath(copy, toKeys.slice(0, -1).join('.'));
+    const fromKey = fromKeys.at(-1) ?? '';
+    const toKey = toKeys.at(-1) ?? '';
+    // Under both names, the new one wins and the legacy one is dropped as unread (by `merge`).
+    if (
+      !isObject(fromParent) ||
+      !isObject(toParent) ||
+      !Object.hasOwn(fromParent, fromKey) ||
+      Object.hasOwn(toParent, toKey)
+    ) {
+      continue;
+    }
+    toParent[toKey] = fromParent[fromKey];
+    delete fromParent[fromKey];
+    renamed.renamed.push({ from, to });
+  }
+  return copy;
+}
+
+/** Copies what the new bot reads of `legacy` onto `target` (a copy of the defaults). */
+function merge(
+  target: Json,
+  legacy: Json,
+  defaults: Json,
+  prefix: string,
+  into: Conversion & { ok: true },
+) {
+  const topLevel: readonly string[] = Object.keys(settingsSchema.shape);
+  for (const [key, value] of Object.entries(legacy)) {
+    const at = prefix === '' ? key : `${prefix}.${key}`;
+    const known = Object.hasOwn(defaults, key) || (prefix === '' && topLevel.includes(key));
+    if (!known) {
+      into.dropped.push(at);
+      continue;
+    }
+    const fallback = defaults[key];
+    const current = target[key];
+    if (isObject(value) && isObject(fallback) && isObject(current)) {
+      merge(current, value, fallback, at, into);
+      continue;
+    }
+    let kept = value;
+    if (at === 'helpGroups' && Array.isArray(value)) {
+      // Groups of commands the new bot has; a legacy one it does not (`silph`) is dropped.
+      const groups: readonly string[] = Object.keys(CATEGORY_LABELS);
+      kept = value.filter((group) => typeof group !== 'string' || groups.includes(group));
+      for (const group of value) {
+        if (typeof group === 'string' && !groups.includes(group)) {
+          into.dropped.push(`helpGroups: ${group}`);
+        }
+      }
+    }
+    target[key] = kept;
+    if (!isDeepStrictEqual(kept, fallback)) into.kept.push(at);
+  }
+}
+
+/** A private setting as the text of a variable: '' for none. */
+/**
+ * A private setting as the text of a variable: '' for none or only spaces; otherwise as written
+ * (a secret is never trimmed). A number only where `numbers` allows it (the database's port): a
+ * snowflake written as a number has lost its last digits (undefined: refused).
+ */
+function textOf(value: unknown, numbers = false): string | undefined {
+  if (typeof value === 'string') return value.trim() === '' ? '' : value;
+  if (typeof value === 'number' && Number.isFinite(value)) {
+    return numbers ? String(value) : undefined;
+  }
+  return '';
+}
+
+function convertPrivate(secrets: Json, into: Conversion & { ok: true }): void {
+  const used = new Set([
+    ...PRIVATE_TO_ENV.map(([key]) => key.split('.')[0] ?? key),
+    ...PRIVATE_TO_SETTINGS,
+  ]);
+  for (const key of Object.keys(secrets)) {
+    if (used.has(key)) continue;
+    into.dropped.push(`private: ${key}`);
+    const why = PRIVATE_DROPPED_WHY[key];
+    into.notes.push(why === undefined ? `${key}: the new bot never reads it` : `${key}: ${why}`);
+  }
+  into.byHand.push({
+    name: 'DISCORD_APP_ID',
+    why: "the application's id (Developer Portal, General Information); the legacy bot had none",
+  });
+  for (const [key, name] of PRIVATE_TO_ENV) {
+    const read = textOf(getPath(secrets, key), name === 'DB_PORT');
+    let value = read ?? '';
+    if (read === undefined) {
+      into.byHand.push({
+        name,
+        why: 'the legacy file has it as a number, which loses the last digits of an id: copy it by hand',
+      });
+    } else if (name === 'DB_USER' && value === 'root') {
+      value = '';
+      into.byHand.push({
+        name,
+        why: "the legacy bot used root, which the stack cannot create as the bot's user: choose another name",
+      });
+    } else if (value !== '' && !/^[^'\n\r]*$/u.test(value)) {
+      value = '';
+      into.byHand.push({
+        name,
+        why: 'its value holds a quote or a line break: copy it from the legacy file by hand',
+      });
+    } else if (value === '' && REQUIRED_ENV.includes(name)) {
+      into.byHand.push({
+        name,
+        why: 'the legacy private settings have none, and the bot needs it',
+      });
+    }
+    into.env.push({ name, value });
+  }
+  const github = into.env.filter((one) => one.name.startsWith('GITHUB_') && one.value !== '');
+  if (github.length === 1) {
+    const missing = github[0]?.name === 'GITHUB_TOKEN' ? 'GITHUB_REPO' : 'GITHUB_TOKEN';
+    into.byHand.push({ name: missing, why: 'GITHUB_TOKEN and GITHUB_REPO go together' });
+  }
+  into.byHand.push(
+    { name: 'DB_ROOT_PASSWORD', why: "the password of MySQL's root user in the stack, new" },
+    {
+      name: 'BACKUP_DIR',
+      why: 'the folder of the nightly backups (with its .pine-backups file; .env.example says more): ./backups until you name the share; blank switches the backups off',
+      value: './backups',
+    },
+  );
+  // The web pages' values (DISCORD_CLIENT_SECRET, GOOGLE_MAPS_BROWSER_KEY and the tunnel's
+  // CLOUDFLARE_TUNNEL_TOKEN) are not asked for: the legacy bot had no web pages, they are optional,
+  // and .env.example has them blank with docs/web-setup.md.
+}
+
+/**
+ * The new settings and `.env` values of a legacy installation (pure). `defaults` is the new
+ * bot's default settings file, whose values the settings the legacy file lacks take. Refused,
+ * with the loader's own words, when the result would not load.
+ */
+export function convertSettings(legacy: unknown, secrets: unknown, defaults: unknown): Conversion {
+  if (!isObject(legacy))
+    return { ok: false, error: 'The legacy settings.json is not a JSON object.' };
+  if (!isObject(defaults))
+    return { ok: false, error: 'The default settings are not a JSON object.' };
+  if (secrets !== undefined && !isObject(secrets)) {
+    return { ok: false, error: 'The legacy private-settings.json is not a JSON object.' };
+  }
+  const settings = structuredClone(defaults);
+  const into: Conversion & { ok: true } = {
+    ok: true,
+    settings,
+    kept: [],
+    renamed: [],
+    dropped: [],
+    defaulted: Object.keys(defaults).filter((key) => !Object.hasOwn(legacy, key)),
+    offByAbsence: [],
+    env: [],
+    byHand: [],
+    notes: [],
+  };
+  merge(settings, renamedLegacy(legacy, into), defaults, '', into);
+  // A flag the legacy file lacks was off for the legacy bot: it stays off.
+  const features = settings.features;
+  if (isObject(legacy.features) && isObject(features)) {
+    for (const flag of Object.keys(features)) {
+      if (Object.hasOwn(legacy.features, flag) || features[flag] !== true) continue;
+      features[flag] = false;
+      into.offByAbsence.push(`features.${flag}`);
+    }
+  }
+  if (secrets !== undefined) {
+    for (const key of PRIVATE_TO_SETTINGS) {
+      const value = textOf(secrets[key])?.trim() ?? '';
+      if (value === '') continue;
+      settings[key] = value;
+      into.kept.push(key);
+    }
+    convertPrivate(secrets, into);
+  }
+  const checked = settingsSchema.safeParse(withoutRetiredSettings(settings));
+  if (!checked.success) {
+    return {
+      ok: false,
+      error: `The converted settings would not load:\n${z.prettifyError(checked.error)}`,
+    };
+  }
+  return into;
+}
+
+/**
+ * A line of `.env`: the value bare where it is plain, in single quotes otherwise (Compose and
+ * Node's `--env-file` read it as written, `$` included). A value with a quote or a line break is
+ * never written (`convertSettings` leaves it to the operator).
+ */
+export function envLine(name: string, value: string): string {
+  return /^[\w./:@+,=-]*$/u.test(value) ? `${name}=${value}` : `${name}='${value}'`;
+}
+
+/** The fragment of `.env`: what to do with it, the values, and what to add by hand. */
+function fragmentText(env: readonly EnvValue[], byHand: readonly ByHand[]): string {
+  const lines = [
+    '# Made by convert-settings from a legacy private-settings.json. It holds the secrets of the',
+    '# installation: keep it to yourself, and delete it once its lines are in .env.',
+    '# Copy .env.example to .env, put these lines in place of the ones there, and fill in what is',
+    '# blank (each says why below).',
+    '',
+    ...env.map((one) => envLine(one.name, one.value)),
+    '',
+    '# To add by hand (a variable above that is blank is filled in there):',
+    ...byHand.flatMap((one) => [
+      `# ${one.name}: ${one.why}`,
+      ...(env.some((value) => value.name === one.name) ? [] : [envLine(one.name, one.value ?? '')]),
+    ]),
+  ];
+  return `${lines.join('\n')}\n`;
+}
+
+function readJson(file: string): { ok: true; value: unknown } | { ok: false; error: string } {
+  try {
+    // A byte order mark (Windows' editors) is taken off, as require() did for the legacy bot.
+    const text = readFileSync(file, 'utf8');
+    return { ok: true, value: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) };
+  } catch (err) {
+    return { ok: false, error: `${file} cannot be read as JSON: ${(err as Error).message}` };
+  }
+}
+
+/**
+ * Writes the files whole or not at all: each to a temporary file beside it first (the secret one
+ * owner-only from its creation), then renamed into place, the secret one first, so that settings
+ * are never left behind without their fragment. Undefined when done; else why not, with no file
+ * changed and the temporary ones removed.
+ */
+function writeAll(files: readonly { file: string; text: string; secret: boolean }[]) {
+  const temps: string[] = [];
+  try {
+    for (const { file, text, secret } of files) {
+      const temp = `${file}.${process.pid}.tmp`;
+      writeFileSync(temp, text, secret ? { mode: 0o600, flag: 'wx' } : { flag: 'wx' });
+      temps.push(temp);
+    }
+    for (let i = files.length - 1; i >= 0; i--) {
+      renameSync(temps[i] ?? '', files[i]?.file ?? '');
+      temps[i] = '';
+    }
+    return undefined;
+  } catch (err) {
+    for (const temp of temps) if (temp !== '') rmSync(temp, { force: true });
+    return (err as Error).message;
+  }
+}
+
+export interface ConvertInstallationOptions {
+  /** The legacy `data` folder: `settings.json`, and `private-settings.json` if there is one. */
+  legacyDir: string;
+  /** Where the two files are written. */
+  outDir: string;
+  /** Write over files that exist. */
+  force: boolean;
+  /** The new bot's default settings. */
+  defaultsPath: string;
+  say: (line: string) => void;
+}
+
+/**
+ * Reads a legacy installation and writes `pine-settings.json` and `env-from-legacy.txt` (owner
+ * only) into `outDir`; neither when either exists already, unless `force`. Says what it did by
+ * the names of the settings and variables, never a secret's value. Resolves to the exit status:
+ * 0 written, 1 refused.
+ */
+export function convertInstallation(options: ConvertInstallationOptions): number {
+  const { legacyDir, outDir, force, defaultsPath, say } = options;
+  const legacyFile = path.join(legacyDir, 'settings.json');
+  const privateFile = path.join(legacyDir, 'private-settings.json');
+  if (!existsSync(legacyFile)) {
+    say(`There is no settings.json in ${legacyDir}: name the legacy bot's data folder.`);
+    return 1;
+  }
+  const legacy = readJson(legacyFile);
+  if (!legacy.ok) {
+    say(legacy.error);
+    return 1;
+  }
+  const hasPrivate = existsSync(privateFile);
+  const secrets = hasPrivate ? readJson(privateFile) : undefined;
+  if (secrets && !secrets.ok) {
+    // The parser's message may quote the file: only its name is said.
+    say(`${privateFile} cannot be read as JSON.`);
+    return 1;
+  }
+  const defaults = readJson(defaultsPath);
+  if (!defaults.ok) {
+    say(defaults.error);
+    return 1;
+  }
+  const converted = convertSettings(legacy.value, secrets?.value, defaults.value);
+  if (!converted.ok) {
+    say(converted.error);
+    return 1;
+  }
+  const settingsOut = path.join(outDir, SETTINGS_FILE);
+  const envOut = path.join(outDir, ENV_FRAGMENT);
+  const targets = hasPrivate ? [settingsOut, envOut] : [settingsOut];
+  const there = targets.filter((file) => existsSync(file));
+  if (there.length > 0 && !force) {
+    say(`${there.join(' and ')} already exists: nothing was written. --force writes over it.`);
+    return 1;
+  }
+  const files = [
+    { file: settingsOut, text: `${JSON.stringify(converted.settings, null, 2)}\n`, secret: false },
+    ...(hasPrivate
+      ? [{ file: envOut, text: fragmentText(converted.env, converted.byHand), secret: true }]
+      : []),
+  ];
+  const failure = writeAll(files);
+  if (failure !== undefined) {
+    say(`The files could not be written (${failure}): nothing was written.`);
+    return 1;
+  }
+  say(`Wrote ${settingsOut}: the settings, checked by the bot's own loader.`);
+  const list = (items: readonly string[]) => (items.length === 0 ? 'none' : items.join(', '));
+  say(`Kept from the legacy file (they differ from the new defaults): ${list(converted.kept)}`);
+  for (const rename of converted.renamed) say(`Renamed: ${rename.from} -> ${rename.to}`);
+  say(
+    `Dropped (the new bot never reads them): ${list(converted.dropped.filter((one) => !one.startsWith('private: ')))}`,
+  );
+  say(
+    `New settings at their defaults (check them, the timezone above all): ${list(converted.defaulted)}`,
+  );
+  if (converted.offByAbsence.length > 0) {
+    say(
+      `Off, because the legacy file lacks them (the legacy bot had them off): ${list(converted.offByAbsence)}`,
+    );
+  }
+  if (!hasPrivate) {
+    say(`There is no private-settings.json in ${legacyDir}: no .env lines were written.`);
+    return 0;
+  }
+  say(`Wrote ${envOut} (for its owner only: it holds the secrets). Put its lines into .env:`);
+  for (const one of converted.env) say(`  ${one.name}: ${one.value === '' ? 'empty' : 'set'}`);
+  if (converted.notes.length > 0) {
+    say(`Dropped from the private settings: ${converted.notes.join('; ')}`);
+  }
+  say('Add by hand to .env:');
+  for (const one of converted.byHand) say(`  ${one.name}: ${one.why}`);
+  return 0;
+}
diff --git a/test/fixtures/legacy-install/private-settings.json b/test/fixtures/legacy-install/private-settings.json
new file mode 100644
index 0000000000000000000000000000000000000000..0038c0de654bcd40b186f2a6e925de0cd49bc01d
--- /dev/null
+++ b/test/fixtures/legacy-install/private-settings.json
@@ -0,0 +1,18 @@
+{
+  "discordBotToken": "MADE-UP.TOKEN.for-tests-only",
+  "discordNotifyToken": "MADE-UP.NOTIFY.for-tests-only",
+  "owner": "412345678901234567",
+  "pokemonUrlBase": "https://images.example.test/pokemon/",
+  "githubRepo": "example-owner/example-repo",
+  "githubUser": "example-user",
+  "githubPassword": "made-up-github-token",
+  "googleApiKey": "made-up-google-key",
+  "regionMapLink": "https://maps.example.test/legacy-regions",
+  "db": {
+    "host": "localhost",
+    "port": "3306",
+    "user": "pine",
+    "password": "made-up pa$$word",
+    "schema": "pine"
+  }
+}
diff --git a/test/fixtures/legacy-install/settings.json b/test/fixtures/legacy-install/settings.json
new file mode 100644
index 0000000000000000000000000000000000000000..a6d1412b39512e2f1f1d05a3f88fce2f33a90c26
--- /dev/null
+++ b/test/fixtures/legacy-install/settings.json
@@ -0,0 +1,131 @@
+{
+  "standardRaidIncubateDuration": 60,
+  "standardRaidHatchedDuration": 45,
+  "exclusiveRaidIncubateDuration": 20160,
+  "exclusiveRaidHatchedDuration": 45,
+  "eliteRaidIncubateDuration": 1440,
+  "eliteRaidHatchedDuration": 30,
+  "maxRaidHatchedDuration": 180,
+  "maxMeetupLeadupDuration": 133920,
+  "maximumAdditionalAttendees": 20,
+  "startClearTime": 10,
+  "deletionGraceTime": 5,
+  "deletionWarningTime": 10,
+  "trainOrMeetupDeletionWarningTime": 60,
+  "raidCompleteTimeout": 5,
+  "maximumMeetupLeadtime": 93,
+  "screenshotMessageOffsetTime": 45,
+  "cleanupInterval": 60000,
+  "commandPrefix": "!",
+  "messageCleanupDelaySuccess": 5000,
+  "messageCleanupDelayError": 30000,
+  "messageCleanupDelayStatus": 60000,
+  "showUnknownMoves": true,
+  "databaseRaids": true,
+  "postNewGyms": true,
+  "updater": {
+    "channelIndexUpdateIntervalSeconds": 60,
+    "gymPlacesIndexUpdateIntervalSeconds": 60
+  },
+  "emoji": {
+    "thumbsUp": "pinethumbsup",
+    "thumbsDown": "pinethumbsdown",
+    "shiny": "pineshiny",
+    "remote": "pineremote"
+  },
+  "reactionCommands": {
+    "interested": {
+      "custom": "pineinterested",
+      "plain": "🤔",
+      "localOnly": false
+    },
+    "join": {
+      "custom": "pinejoin",
+      "plain": "🏃",
+      "localOnly": false
+    },
+    "here": {
+      "custom": "pinehere",
+      "plain": "✅",
+      "localOnly": false
+    },
+    "done": {
+      "custom": "pinedone",
+      "plain": "🎉",
+      "localOnly": false
+    },
+    "incrementCount": {
+      "custom": "",
+      "plain": "⬆️",
+      "localOnly": false
+    },
+    "decrementCount": {
+      "custom": "",
+      "plain": "⬇️",
+      "localOnly": false
+    },
+    "remote": {
+      "custom": "pineremote",
+      "plain": "📡",
+      "localOnly": true
+    },
+    "notInterested": {
+      "custom": "pineleave",
+      "plain": "👋",
+      "localOnly": false
+    }
+  },
+  "groupReactions": {
+    "A": "🇦",
+    "B": "🇧",
+    "C": "🇨",
+    "D": "🇩",
+    "E": "🇪"
+  },
+  "features": {
+    "exGymChannel": true,
+    "remoteRaidChannel": false,
+    "reactionCommands": true,
+    "notifications": true,
+    "roles": true
+  },
+  "roles": {
+    "unown": "unown"
+  },
+  "channels": {
+    "bot-lab": "the-bot-lab",
+    "mod-bot-lab": "mod-bot-only",
+    "unown": "wild-unown-sightings",
+    "ex-gym-raids": "potential-ex-gym-raids",
+    "remote-raids": "remote-raids",
+    "pvp": "rank-checker",
+    "bot-updates": "bot-updates"
+  },
+  "categories": {
+    "pvp": "PVP CHAT AND TOURNAMENTS"
+  },
+  "helpGroups": [
+    "basic-raid",
+    "raid-crud",
+    "train",
+    "meetup",
+    "roles",
+    "notifications",
+    "friends",
+    "silph",
+    "util"
+  ],
+  "blacklistWords": [
+    "ex",
+    "raid",
+    "rald",
+    "gym",
+    "exraid",
+    "exrald",
+    "raldgym",
+    "raidgym",
+    "exraidgym",
+    "exraldgym",
+    "sponsored"
+  ]
+}
````

### Task 3: Plan 8C T3: cutover-check, the read-only go / no-go of a cutover

Prototype commit: `a4c7ab6be03705d7fb46232741055a66c09129f2`

./pine cutover-check (npm run cutover:check on a checkout) reads the database in a read-only
transaction and Discord through its REST API with the bot's token, GETs only and without a
gateway login, and prints pass / warn / fail lines; it exits 1 when any fails:
- the database: migrationPlan (src/db/migrator.ts) says what runMigrations would do without
  writing: the refusals are now shared by both (lower-case tables, a foreign or incomplete
  database, in the migrator's words), the pending migrations come from Kysely's own list;
- the application: DISCORD_APP_ID must be the token's, the privileged intents the settings
  ask for against those it has, the game's icons it lacks as emoji;
- the servers of Guild the bot is in, and per server the bot's roles and the permissions it
  needs, per region in its channel, its category and its forum, computed from roles and
  overwrites as Discord does (src/ops/permissions.ts; the lists name what the code asks of
  Discord, an optional one missing is a warning);
- the regions without a forum, the channels, category and role the settings name that the
  server lacks, and rows of the legacy restriction tables (listed as role-auth-export does);
- what Discord refuses after the application was read (a server it no longer answers for, a
  5xx) ends the reading with one line, FAIL discord: the check stopped reading Discord, and the
  rest of the check (the legacy tables) goes on.
- Manage Messages in a region channel is optional; the channels it announces in and the
  self-assigned roles above its highest role are warnings of their own; role names are
  compared as the bot compares them, and no PvP channel is asked for (nothing reads it).
- migrationPlan also refuses what Kysely's migrateToLatest would (a migration run that the
  bot does not know, migrations out of order), in its words.
- Each database section and each server that cannot be read is a FAIL line of its own and
  the rest goes on; databaseStore (src/ops/cutover-store.ts) reads a database of any shape,
  tested against an empty and a lower-cased one. The CLI refuses unknown arguments.
CutoverRepository reads servers and regions of a legacy database as of a Pine one. The check
is tested line by line over FakeDiscordApi (test/support/fake-discord-api.ts) and a store in
memory; the database parts against MySQL. The legacy cleanup's line follows with T5.

**Files:**

```
 CLAUDE.md                                         |   4 +-
 docs/architecture/operations.md                   |   3 +-
 docs/architecture/testing.md                      |   2 +-
 package.json                                      |   1 +
 pine                                              |  10 +
 src/db/migrator.db.test.ts                        |  94 +++++-
 src/db/migrator.ts                                | 138 +++++++--
 src/db/repositories/cutover-repository.db.test.ts |  83 ++++++
 src/db/repositories/cutover-repository.ts         |  97 ++++++
 src/ops/cutover-check-cli.ts                      |  52 ++++
 src/ops/cutover-check.test.ts                     | 428 +++++++++++++++++++++++++++
 src/ops/cutover-check.ts                          | 663 ++++++++++++++++++++++++++++++++++++++++++
 src/ops/cutover-store.db.test.ts                  |  73 +++++
 src/ops/cutover-store.ts                          |  28 ++
 src/ops/emoji-upload.ts                           |   5 +-
 src/ops/permissions.test.ts                       |  96 ++++++
 src/ops/permissions.ts                            | 186 ++++++++++++
 test/support/fake-discord-api.ts                  | 247 ++++++++++++++++
 18 files changed, 2177 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/ops/cutover-check.test.ts src/ops/permissions.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/cutover-repository.db.test.ts src/ops/cutover-store.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff a4c7ab6be03705d7fb46232741055a66c09129f2 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8C T3: cutover-check, the read-only go / no-go of a cutover`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/architecture/operations.md docs/architecture/testing.md package.json pine src/db/migrator.db.test.ts src/db/migrator.ts src/db/repositories/cutover-repository.db.test.ts src/db/repositories/cutover-repository.ts src/ops/cutover-check-cli.ts src/ops/cutover-check.test.ts src/ops/cutover-check.ts src/ops/cutover-store.db.test.ts src/ops/cutover-store.ts src/ops/emoji-upload.ts src/ops/permissions.test.ts src/ops/permissions.ts test/support/fake-discord-api.ts`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 87363e7b5d30e8f35aab25c972e356ce432cd7f8..a71ff9aebd05c9b2d6976264c8189e32fbcdb274 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -5,7 +5,7 @@ Discord bot for organising Pokémon Go raids. It is being rewritten from legacy
 ## Hard rules
 
 - **Never push.** All migration work stays local on branch `typescript-migration` until every phase is complete. No `git push`, no PRs, nothing that runs GitHub CI.
-- **Never contact Discord unasked.** Do not start the bot (`npm start`, `npm run dev`, or in the Docker stack `./pine up`, `./pine restart`, `./pine update`, `./pine restore` without `--no-start`) or run `npm run deploy-commands` / `./pine deploy-commands` or `npm run emoji:upload` / `./pine emoji-upload` (its dry run reads the application's emoji; `--apply` uploads) unless Matt asks; there is a live production bot.
+- **Never contact Discord unasked.** Do not start the bot (`npm start`, `npm run dev`, or in the Docker stack `./pine up`, `./pine restart`, `./pine update`, `./pine restore` without `--no-start`) or run `npm run deploy-commands` / `./pine deploy-commands` or `npm run emoji:upload` / `./pine emoji-upload` (its dry run reads the application's emoji; `--apply` uploads) or `npm run cutover:check` / `./pine cutover-check` (reads Discord's REST API with the token) unless Matt asks; there is a live production bot.
 - **Do not edit or delete legacy JS** (`app/`, `commands/`, `types/`, `index.js`) unless a plan task says so. Production still runs it from `main-dev`; it is removed at cutover (phase 8).
 - Database changes are additive only. `knex_migrations` is read, never written; Kysely tracks its own migrations in `kysely_migration`.
 
@@ -62,6 +62,7 @@ npm run raid-bosses:check    # download the raid boss feed and print the list Pi
 npm run role-auth:export     # print the legacy role authorization per server, mapped to the new commands (reads only; --json)
 npm run emoji:upload         # upload the game's type, weather and team icons the bot's application lacks as its emoji (a dry run; --apply uploads)
 npm run settings:convert -- <legacy data folder> [--out <dir>] [--force]   # the settings converter on the checkout (as ./pine convert-settings)
+npm run cutover:check  # whether the configured installation is ready for the cutover (the database read only, Discord's REST API read with the token): only when Matt asks
 npm run migrate        # run Kysely migrations against the configured database
 npm run ocr:check -- <folder> [--labels <file>] [--baseline <file>] [--write-baseline <file>] [--bosses <file>] [--write-bosses <file>] [--device cpu|cuda|directml] [--threads n] [--priority low|normal]   # read screenshots with the real models; scores (also of a review folder), clocks' confidence and time
@@ -79,6 +80,7 @@ The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with
 ./pine deploy-commands [--global | --guild <id>]   # contacts Discord: only when Matt asks
 ./pine update | shell        # backup, git pull, rebuild, restart (logs the bot in: only when Matt asks); a shell in the bot's container
 ./pine convert-settings <legacy data folder> [--out <folder>] [--force]   # pine-settings.json and env-from-legacy.txt (.env lines) from a legacy installation (reads its private settings: Matt runs it)
+./pine cutover-check         # the cutover's go / no-go: database, permissions, forums, settings, emoji (reads Discord's REST API): only when Matt asks
 ./pine emoji-upload [--apply]   # the game's icons the application lacks as its emoji: contacts Discord (a dry run reads; --apply uploads): only when Matt asks
 ./pine role-auth-export [--json]   # the legacy role authorization of the database, mapped to the new commands (reads only)
 ```
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index e4593b0c7287db24270298975f17fcea39532166..e908a64113de5e28ef6ca32f9c57b47d4ad76144 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -6,7 +6,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 
 - A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `tr`, `basename`, `dirname`, `id`). A step that would need anything else on the host is wrong.
 - The script is checked with `shellcheck -s sh` (the `koalaman/shellcheck` image) and kept LF by `.gitattributes`, as is every `*.sh`. It exports `MSYS_NO_PATHCONV=1`, so Git Bash leaves container paths (`/pine/backup.sh`) alone. A command is a function `cmd_<name>` (a hyphen is an underscore) plus a line of `usage`; nothing else needs to know of it; the dispatch is a function, read whole before `update` replaces the file. Each command says what it does and runs Compose through `run`, which prints the command first; errors are plain sentences through `fail`; a command that stopped the bot and then fails says "The bot, its watchdog and the backups are stopped: './pine up' starts them again." (a restore whose load the bot would refuse says that instead) A path the operator gives (a dump) is read from where they ran the script.
-- The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `emoji-upload` contacts Discord through its REST API (its dry run lists the application's emoji, `--apply` uploads); `migrate`, `backup`, `restore --no-start`, `role-auth-export`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
+- The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `emoji-upload` contacts Discord through its REST API (its dry run lists the application's emoji, `--apply` uploads), and `cutover-check` reads it with the token; `migrate`, `backup`, `restore --no-start`, `role-auth-export`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
 - The installation's own files are git-ignored and beside `compose.yaml`: `.env` (secrets) and `pine-settings.json` (the settings, made from `data/settings.json`, or from a legacy installation by `./pine convert-settings`). `./pine` refuses to run without either and says how to make them; the repository's `data/settings.json` is never the installation's, so `update` finds no change of its own. `pine-settings.json` is mounted as a single file: an editor saves by writing a new file, which a running container never sees, so an edit needs `./pine restart` (and `./pine restart backup` for the backups' time zone). `PINE_ENV_FILE`, `PINE_SETTINGS` and `COMPOSE_PROJECT_NAME` give a second stack on the same machine its own files, volumes and image (`professor-pine:<project>`) (a rehearsal, a scratch stack). The project's name is Compose's to resolve and `./pine` never sets it: the shell's `COMPOSE_PROJECT_NAME`, else the one in the env file (a rehearsal's `.env` names itself there), else `pine` (the `name:` of `compose.yaml`). Were the script to set it, it would outrank the env file and a rehearsal's `restore --replace` or `down` would act on production.
 - `./pine update`, in this order, nothing changed until the backup is made: it refuses a clone with changes of its own and a branch without an upstream; `git fetch`, and nothing more when there is nothing new; the database is checked and, if it has tables, a verified backup is made through the stack as it runs now (a pulled change may upgrade MySQL or migrate the data); a failed check or backup stops it, nothing changed. Then `git pull --ff-only`, the build, `up -d`, and the backup service and the watchdog recreated (they run what the checkout mounts). A failed build or start after the pull says "The code is updated but the stack still runs the old version: './pine up' builds and starts it."; `./pine up` also finishes an update that stopped there (a second `update` finds nothing new).
 
@@ -66,6 +66,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md`).
 
 - `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address, Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
+- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; the servers of `Guild` the bot is in; per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
 
 ## Open items
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 15514ab448d84e165310bca42f869ad4df157769..8aa83e195bb8abc8380ead8779deaf6eb4fc2540 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -41,4 +41,4 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Operations
 
-- The owner's alerts are tested through `FakeAlertRest` (`test/support/fake-rest.ts`: Discord's REST API as `OwnerAlerts` uses it, recording each request and refusing an empty or too long message; `failWith` an error or `'hang'`), the watchdog against `FakeDockerApi` (`test/support/fake-docker.ts`: containers by Compose labels, `composeLabels(project, service)`, restarts recorded). The Docker Engine fake of `docker-api.test.ts` answers on a local socket (a named pipe on Windows); its slow restart and its stuck question are timed by fake timers once the request arrived (`Tally`). Health, crash marker and backup status tests write their files into a `mkdtemp` folder; `runBackupScript` (`test/support/backup-script.ts`) runs shell lines in one `sh` with `docker/backup.sh` sourced as a library (`BACKUP_SH_LIBRARY`; `BACKUP_OUT_DIR`, `BACKUP_OPS_DIR`, `BACKUP_LOCK` move its folders) and gives `undefined` where there is no `sh` (the test skips); these files are `*.sh.test.ts`, the vitest project `shell` (part of `npm run test:unit`, a minute per test, since spawning a shell takes seconds on a busy machine): `backup-status.sh.test.ts` reads what `write_status` wrote, `backup-script.sh.test.ts` the lock, the deletion of old dumps and half-written ones, and backups off. `Lifecycle` is tested over an `EventEmitter` in place of the process. The rest of the scripts of the stack (`pine`, `docker/backup.sh`) is checked with `shellcheck -s sh` and a scratch stack (`operations.md`).
+- The owner's alerts are tested through `FakeAlertRest` (`test/support/fake-rest.ts`: Discord's REST API as `OwnerAlerts` uses it, recording each request and refusing an empty or too long message; `failWith` an error or `'hang'`), the watchdog against `FakeDockerApi` (`test/support/fake-docker.ts`: containers by Compose labels, `composeLabels(project, service)`, restarts recorded). The Docker Engine fake of `docker-api.test.ts` answers on a local socket (a named pipe on Windows); its slow restart and its stuck question are timed by fake timers once the request arrived (`Tally`). Health, crash marker and backup status tests write their files into a `mkdtemp` folder; `runBackupScript` (`test/support/backup-script.ts`) runs shell lines in one `sh` with `docker/backup.sh` sourced as a library (`BACKUP_SH_LIBRARY`; `BACKUP_OUT_DIR`, `BACKUP_OPS_DIR`, `BACKUP_LOCK` move its folders) and gives `undefined` where there is no `sh` (the test skips); these files are `*.sh.test.ts`, the vitest project `shell` (part of `npm run test:unit`, a minute per test, since spawning a shell takes seconds on a busy machine): `backup-status.sh.test.ts` reads what `write_status` wrote, `backup-script.sh.test.ts` the lock, the deletion of old dumps and half-written ones, and backups off. `Lifecycle` is tested over an `EventEmitter` in place of the process. The cutover tools read Discord through `FakeDiscordApi` (`test/support/fake-discord-api.ts`): the application, the bot's servers with their roles, members and channels (`addGuild`, `addRole`, `addChannel`, `overwrite`; `BOT_PERMISSIONS` is everything the bot asks for), the oldest message of a channel (`after=0&limit=1` only; `unreadable` answers Missing Access), channels deleted (`deleted`, a second delete is Unknown Channel); every request is recorded, `onlyRead()` says whether all were GETs, and `failWith` fails them all. A legacy installation's settings for the converter are `test/fixtures/legacy-install/` (made-up secrets). The rest of the scripts of the stack (`pine`, `docker/backup.sh`) is checked with `shellcheck -s sh` and a scratch stack (`operations.md`).
diff --git a/package.json b/package.json
index b1b2734987f35b761160df8d3ed36eda8bdca27c..95aef6b822de66e3c288a94b011bfe12ac914b00 100644
--- a/package.json
+++ b/package.json
@@ -21,6 +21,7 @@
     "role-auth:export": "tsx --env-file-if-exists=.env src/ops/role-auth-cli.ts",
     "emoji:upload": "tsx --env-file-if-exists=.env src/ops/emoji-upload-cli.ts",
     "settings:convert": "tsx src/ops/convert-settings-cli.ts",
+    "cutover:check": "tsx --env-file-if-exists=.env src/ops/cutover-check-cli.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
diff --git a/pine b/pine
index 0f52e202eeebaaa539c0f88c95bdf887012d2e44..26bfd68555582bb8e0db2ce9ddc24a99b71477be 100755
--- a/pine
+++ b/pine
@@ -127,6 +127,8 @@ Usage: ./pine <command>
   convert-settings <legacy data folder> [--out <folder>] [--force]
                      make pine-settings.json and env-from-legacy.txt (the lines of .env) from a
                      legacy installation's settings.json and private-settings.json
+  cutover-check      whether the installation is ready for the cutover: the database, the
+                     bot's permissions, forums, settings, emoji (reads Discord's REST API)
   emoji-upload [--apply]
                      the game's icons the bot's application lacks as its emoji: a dry run
                      (reads the application's emoji from Discord); --apply uploads them
@@ -298,6 +300,14 @@ cmd_convert_settings() {
     "$image" node dist/ops/convert-settings-cli.js /legacy --out /out ${force:+"$force"}
 }
 
+cmd_cutover_check() {
+  need_stack
+  build_image
+  start_database
+  say "Checking whether this installation is ready for the cutover: the database (read only) and Discord (its REST API, reading only; the bot is not logged in)."
+  run run --rm --no-deps pine node --enable-source-maps dist/ops/cutover-check-cli.js "$@"
+}
+
 cmd_emoji_upload() {
   need_stack
   build_image
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 2c5b172223c737066438cce534973ae5e3bbca0a..c0ddac4a685c733355413a588c95d6db1f7449ff 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -7,7 +7,8 @@ import {
   detectDatabaseState,
   LEGACY_REQUIRED_MIGRATION,
 } from './migrations/2026_10_09_000_baseline.js';
-import { runMigrations } from './migrator.js';
+import { migrations } from './migrations/index.js';
+import { migrationPlan, runMigrations } from './migrator.js';
 
 const silent = pino({ level: 'silent' });
 const ALL_TABLES =
@@ -395,3 +396,94 @@ describe('runMigrations', () => {
     expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual(before);
   });
 });
+
+describe('migrationPlan', () => {
+  let database: TestDatabase | undefined;
+
+  afterEach(async () => {
+    await database?.stop();
+    database = undefined;
+  });
+
+  /** The plan, asked inside a read-only transaction as the cutover check asks it. */
+  async function planOf(of: TestDatabase) {
+    const db = createDb<unknown>(of.config);
+    try {
+      return await db
+        .transaction()
+        .setAccessMode('read only')
+        .execute((trx) => migrationPlan(trx));
+    } finally {
+      await db.destroy();
+    }
+  }
+
+  const ALL = Object.keys(migrations);
+
+  it('says a legacy database is taken over by every migration, and writes nothing', async () => {
+    database = await startDatabase({ legacySchema: true });
+    const before = await database.query<{ name: string }>(ALL_TABLES);
+    expect(await planOf(database)).toEqual({ kind: 'takeover', pending: ALL });
+    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual(before);
+  });
+
+  it('says an empty database is a new install', async () => {
+    database = await startDatabase({ legacySchema: false });
+    expect(await planOf(database)).toEqual({ kind: 'new-install', pending: ALL });
+    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual([]);
+  });
+
+  it('names the migrations a Pine database still lacks', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await migrate(database);
+    expect(await planOf(database)).toEqual({ kind: 'pine', pending: [] });
+    const last = ALL.at(-1) ?? '';
+    await database.query('delete from kysely_migration where name = ?', [last]);
+    expect(await planOf(database)).toEqual({ kind: 'pine', pending: [last] });
+  });
+
+  it('refuses, as Kysely would, a migration it does not know or one run out of order', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await migrate(database);
+    await database.query(
+      "insert into kysely_migration (name, timestamp) values ('2099_01_01_999_elsewhere', '2099-01-01T00:00:00Z')",
+    );
+    expect(await planOf(database)).toEqual({
+      kind: 'refused',
+      reason:
+        'corrupted migrations: previously executed migration 2099_01_01_999_elsewhere is missing',
+    });
+    await database.query("delete from kysely_migration where name = '2099_01_01_999_elsewhere'");
+    const second = ALL[1] ?? '';
+    await database.query('delete from kysely_migration where name = ?', [second]);
+    const plan = await planOf(database);
+    expect(plan.kind === 'refused' && plan.reason).toMatch(
+      new RegExp(
+        `^corrupted migrations: expected previously executed migration ${ALL[2] ?? ''} to be at index 1`,
+      ),
+    );
+  });
+
+  it('gives the refusal the migrator would give, in its words', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await database.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
+    const incomplete = await planOf(database);
+    expect(incomplete.kind).toBe('refused');
+    expect(incomplete.kind === 'refused' && incomplete.reason).toContain(LEGACY_REQUIRED_MIGRATION);
+
+    await database.query('rename table `Guild` to `guild`');
+    expect(await planOf(database)).toEqual({
+      kind: 'refused',
+      reason:
+        'The tables guild have lower-case names, as MySQL on Windows writes them; the bot ' +
+        "needs Guild. './pine restore' renames them when it loads a dump.",
+    });
+  });
+
+  it('refuses a database that is not Pine’s', async () => {
+    database = await startDatabase({ legacySchema: false });
+    await database.query('create table invoices (id int primary key)');
+    const plan = await planOf(database);
+    expect(plan.kind === 'refused' && plan.reason).toMatch(/invoices.*not a Professor Pine/);
+  });
+});
diff --git a/src/db/migrator.ts b/src/db/migrator.ts
index 93782256c42cad4a1941ab2914b3028d03707e96..152c5331b5c9caa99b929621685e9dd796728046 100644
--- a/src/db/migrator.ts
+++ b/src/db/migrator.ts
@@ -14,56 +14,136 @@ class StaticMigrationProvider implements MigrationProvider {
   }
 }
 
+/* eslint-disable @typescript-eslint/no-explicit-any -- migrations are schema-agnostic */
+
+/** Whether Kysely's bookkeeping exists: the baseline was accepted once. */
+async function hasBookkeeping(db: Kysely<any>): Promise<boolean> {
+  const bookkeeping = await sql<{ name: string }>`
+    select table_name as name from information_schema.tables
+    where table_schema = database() and table_name = 'kysely_migration'`.execute(db);
+  return bookkeeping.rows.length > 0;
+}
+
 /**
  * Kysely creates its bookkeeping tables before any migration runs, so a database the baseline
- * would refuse must be rejected here, before the Migrator writes anything to it. Once
+ * would refuse must be rejected before the Migrator writes anything to it. Once
  * kysely_migration exists the baseline has already been accepted, and later runs (a new
- * install looks "foreign" by then) are left to the Migrator.
+ * install looks "foreign" by then) are left to the Migrator. Undefined when it is accepted.
  */
-// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
-async function refuseUnknownDatabase(db: Kysely<any>, log: Logger): Promise<void> {
-  const bookkeeping = await sql<{ name: string }>`
-    select table_name as name from information_schema.tables
-    where table_schema = database() and table_name = 'kysely_migration'`.execute(db);
-  if (bookkeeping.rows.length > 0) return;
+async function unknownDatabase(
+  db: Kysely<any>,
+): Promise<{ state: 'foreign' | 'legacy-incomplete'; tables: string[] } | undefined> {
+  if (await hasBookkeeping(db)) return undefined;
   const { state, tables } = await detectDatabaseState(db);
-  if (state === 'foreign' || state === 'legacy-incomplete') {
-    log.error({ state, tables }, 'database refused');
-    throw new Error(refusalMessage(state, tables));
-  }
+  return state === 'foreign' || state === 'legacy-incomplete' ? { state, tables } : undefined;
 }
 
 /**
  * A dump from MySQL on Windows has every table name in lower case (`guild`, `gymmeta`); loaded
  * into a server that tells names by their case (lower_case_table_names=0, Linux's default) the
- * bot would not find its tables, and the first migration would fail half-way. Refused here,
- * before anything is written, with the way out; a server that ignores case is left alone.
+ * bot would not find its tables, and the first migration would fail half-way. Refused before
+ * anything is written, with the way out; a server that ignores case is left alone. Undefined
+ * when the names are fine.
  */
-// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
-async function refuseLowerCaseTables(db: Kysely<any>, log: Logger): Promise<void> {
+async function lowerCaseTables(
+  db: Kysely<any>,
+): Promise<{ tables: string[]; reason: string } | undefined> {
   const setting = await sql<{ value: number | string }>`
     select @@lower_case_table_names as value`.execute(db);
-  if (Number(setting.rows[0]?.value) !== 0) return;
+  if (Number(setting.rows[0]?.value) !== 0) return undefined;
   const result = await sql<{ name: string }>`
     select table_name as name from information_schema.tables
     where table_schema = database()`.execute(db);
   const renames = canonicalRenames(result.rows.map((row) => row.name));
-  if (renames.length === 0) return;
-  log.error(
-    { tables: renames.map((rename) => rename.from) },
-    'database refused: its table names are lower case',
-  );
-  throw new Error(
-    `The tables ${renames.map((rename) => rename.from).join(', ')} have lower-case names, as ` +
+  if (renames.length === 0) return undefined;
+  return {
+    tables: renames.map((rename) => rename.from),
+    reason:
+      `The tables ${renames.map((rename) => rename.from).join(', ')} have lower-case names, as ` +
       `MySQL on Windows writes them; the bot needs ${renames.map((rename) => rename.to).join(', ')}. ` +
       "'./pine restore' renames them when it loads a dump.",
-  );
+  };
+}
+
+/**
+ * What `runMigrations` would do to this database, found by reading only (the cutover check):
+ * refuse it, and why, in the migrator's own words; or take over a legacy database, make a new
+ * install of an empty one, or bring a Pine database up to date, with the migrations it would
+ * run, by name, in order.
+ */
+export type MigrationPlan =
+  | { kind: 'refused'; reason: string }
+  | { kind: 'takeover' | 'new-install' | 'pine'; pending: string[] };
+
+/**
+ * What Kysely's `migrateToLatest` refuses before it runs anything, in its words: a migration
+ * that was run and that this bot does not know, or the migrations run not being the first ones
+ * of the list (a newer one that sorts before one already run). Undefined when neither.
+ */
+async function corruptedMigrations(db: Kysely<any>): Promise<string | undefined> {
+  const rows = await sql<{ name: string; timestamp: string }>`
+    select name, timestamp from kysely_migration`.execute(db);
+  // Kysely's order: by when they were run, then by name.
+  const executed = rows.rows
+    .sort((a, b) =>
+      a.timestamp === b.timestamp
+        ? a.name.localeCompare(b.name)
+        : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
+    )
+    .map((row) => row.name);
+  const known = Object.keys(migrations).sort((a, b) => a.localeCompare(b));
+  for (const name of executed) {
+    if (!known.includes(name)) {
+      return `corrupted migrations: previously executed migration ${name} is missing`;
+    }
+  }
+  for (let i = 0; i < executed.length; i++) {
+    if (known[i] !== executed[i]) {
+      return (
+        `corrupted migrations: expected previously executed migration ${executed[i] ?? ''} to be at index ${i} but ${known[i] ?? ''} was found in its place. ` +
+        'New migrations must always have a name that comes alphabetically after the last executed migration.'
+      );
+    }
+  }
+  return undefined;
+}
+
+export async function migrationPlan(db: Kysely<any>): Promise<MigrationPlan> {
+  const lowerCase = await lowerCaseTables(db);
+  if (lowerCase) return { kind: 'refused', reason: lowerCase.reason };
+  const unknown = await unknownDatabase(db);
+  if (unknown) return { kind: 'refused', reason: refusalMessage(unknown.state, unknown.tables) };
+  const kind = (await hasBookkeeping(db))
+    ? 'pine'
+    : (await detectDatabaseState(db)).state === 'empty'
+      ? 'new-install'
+      : 'takeover';
+  if (kind === 'pine') {
+    const corrupted = await corruptedMigrations(db);
+    if (corrupted) return { kind: 'refused', reason: corrupted };
+  }
+  // Kysely's list reads the bookkeeping, where it exists, and writes nothing.
+  const known = await new Migrator({
+    db,
+    provider: new StaticMigrationProvider(migrations),
+  }).getMigrations();
+  return {
+    kind,
+    pending: known.filter((one) => one.executedAt === undefined).map((one) => one.name),
+  };
 }
 
-// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
 export async function runMigrations(db: Kysely<any>, log: Logger): Promise<void> {
-  await refuseLowerCaseTables(db, log);
-  await refuseUnknownDatabase(db, log);
+  const lowerCase = await lowerCaseTables(db);
+  if (lowerCase) {
+    log.error({ tables: lowerCase.tables }, 'database refused: its table names are lower case');
+    throw new Error(lowerCase.reason);
+  }
+  const unknown = await unknownDatabase(db);
+  if (unknown) {
+    log.error(unknown, 'database refused');
+    throw new Error(refusalMessage(unknown.state, unknown.tables));
+  }
   const migrator = new Migrator({ db, provider: new StaticMigrationProvider(migrations) });
   const { error, results } = await migrator.migrateToLatest();
   for (const result of results ?? []) {
@@ -77,3 +157,5 @@ export async function runMigrations(db: Kysely<any>, log: Logger): Promise<void>
   }
   await warnOfSharedChannels(db, log);
 }
+
+/* eslint-enable @typescript-eslint/no-explicit-any */
diff --git a/src/db/repositories/cutover-repository.db.test.ts b/src/db/repositories/cutover-repository.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b810833057fc9aa48e624225fac0fc82d521c54e
--- /dev/null
+++ b/src/db/repositories/cutover-repository.db.test.ts
@@ -0,0 +1,83 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { startDatabase, type TestDatabase } from '../../../test/support/mysql.js';
+import { pino } from 'pino';
+import { createDb } from '../kysely.js';
+import { runMigrations } from '../migrator.js';
+import { CutoverRepository } from './cutover-repository.js';
+
+const HOME = '412345678901234567';
+const AWAY = '412345678901234568';
+const NORTH = '512345678901234561';
+const SOUTH = '512345678901234562';
+const FORUM = '612345678901234561';
+
+async function withServers(database: TestDatabase): Promise<void> {
+  await database.query('insert into Guild (id, snowflake) values (1, ?), (2, ?), (3, null)', [
+    HOME,
+    AWAY,
+  ]);
+  await database.query('insert into Region (guildId, channelId) values (1, ?), (1, ?), (2, null)', [
+    NORTH,
+    SOUTH,
+  ]);
+}
+
+/** The repository over a read-only transaction, as the cutover check reads. */
+async function read<T>(
+  database: TestDatabase,
+  work: (repository: CutoverRepository) => Promise<T>,
+): Promise<T> {
+  const db = createDb<unknown>(database.config);
+  try {
+    return await db
+      .transaction()
+      .setAccessMode('read only')
+      .execute((trx) => work(new CutoverRepository(trx)));
+  } finally {
+    await db.destroy();
+  }
+}
+
+describe('CutoverRepository', () => {
+  let database: TestDatabase | undefined;
+
+  afterEach(async () => {
+    await database?.stop();
+    database = undefined;
+  });
+
+  it('reads the servers and the regions of a legacy database, which has no forums yet', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await withServers(database);
+    expect(await read(database, (repository) => repository.servers())).toEqual([HOME, AWAY]);
+    expect(await read(database, (repository) => repository.regions())).toEqual([
+      { guild: HOME, channelId: NORTH, forumChannelId: null },
+      { guild: HOME, channelId: SOUTH, forumChannelId: null },
+    ]);
+  });
+
+  it('reads the forums of a migrated database', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await withServers(database);
+    const db = createDb<unknown>(database.config);
+    try {
+      await runMigrations(db, pino({ level: 'silent' }));
+    } finally {
+      await db.destroy();
+    }
+    await database.query('update Region set forumChannelId = ? where channelId = ?', [
+      FORUM,
+      NORTH,
+    ]);
+    expect(await read(database, (repository) => repository.regions())).toEqual([
+      { guild: HOME, channelId: NORTH, forumChannelId: FORUM },
+      { guild: HOME, channelId: SOUTH, forumChannelId: null },
+    ]);
+  });
+
+  it('reads nothing of an empty database', async () => {
+    database = await startDatabase({ legacySchema: false });
+    expect(await read(database, (repository) => repository.servers())).toEqual([]);
+    expect(await read(database, (repository) => repository.regions())).toEqual([]);
+  });
+});
diff --git a/src/db/repositories/cutover-repository.ts b/src/db/repositories/cutover-repository.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5cb506588353e9f7d364e6d8dfc6b2bd3ad62bc8
--- /dev/null
+++ b/src/db/repositories/cutover-repository.ts
@@ -0,0 +1,97 @@
+import { sql, type Kysely } from 'kysely';
+
+/** A region as the cutover check reads it. */
+export interface CutoverRegion {
+  /** The server's snowflake. */
+  guild: string;
+  /** The region's channel. */
+  channelId: string;
+  /** Its forum; null where it has none, and in a legacy database, which has no forums yet. */
+  forumChannelId: string | null;
+}
+
+/** A self-assigned role as the cutover check reads it. */
+export interface CutoverSelfRole {
+  /** The server's snowflake. */
+  guild: string;
+  /** The role's snowflake, where the database has it (a legacy one has only the name). */
+  roleId: string | null;
+  name: string;
+}
+
+/* eslint-disable @typescript-eslint/no-explicit-any -- the cutover check reads a database
+   before the bot's migrations as well as after them: the generated types describe only after */
+
+/**
+ * What the cutover check (`src/ops/cutover-check.ts`) reads of the database: the servers and the
+ * regions, from a legacy database (before the takeover) as from a Pine one. Only `select`s.
+ */
+export class CutoverRepository {
+  constructor(private readonly db: Kysely<any>) {}
+
+  private async hasColumn(table: string, column: string): Promise<boolean> {
+    const found = await sql<{ name: string }>`
+      select column_name as name from information_schema.columns
+      where table_schema = database() and table_name = ${table} and column_name = ${column}`.execute(
+      this.db,
+    );
+    return found.rows.length > 0;
+  }
+
+  private async hasTable(table: string): Promise<boolean> {
+    const found = await sql<{ name: string }>`
+      select table_name as name from information_schema.tables
+      where table_schema = database() and table_name = ${table}`.execute(this.db);
+    return found.rows.length > 0;
+  }
+
+  /** The snowflakes of the servers of `Guild`, in the order of their rows. */
+  async servers(): Promise<string[]> {
+    if (!(await this.hasTable('Guild'))) return [];
+    const rows = await sql<{ snowflake: string }>`
+      select snowflake from Guild where snowflake is not null order by id`.execute(this.db);
+    return rows.rows.map((row) => String(row.snowflake));
+  }
+
+  /** Whether the database has every table named (a schema of another shape may lack them). */
+  async hasTables(...tables: string[]): Promise<boolean> {
+    for (const table of tables) if (!(await this.hasTable(table))) return false;
+    return true;
+  }
+
+  /** The self-assigned roles of the servers (`Role`), by snowflake where the database has it. */
+  async selfRoles(): Promise<CutoverSelfRole[]> {
+    if (!(await this.hasTables('Role', 'Guild'))) return [];
+    const snowflakes = await this.hasColumn('Role', 'roleSnowflake');
+    const rows = await sql<{ guild: string; roleId: string | null; name: string | null }>`
+      select g.snowflake as guild, ${snowflakes ? sql`r.roleSnowflake` : sql`null`} as roleId,
+        r.roleName as name
+      from Role r join Guild g on g.id = r.guildId
+      where g.snowflake is not null
+      order by r.id`.execute(this.db);
+    return rows.rows.map((row) => ({
+      guild: String(row.guild),
+      roleId: row.roleId === null ? null : String(row.roleId),
+      name: row.name ?? '',
+    }));
+  }
+
+  /** The regions of the servers, with their forums where the database has them. */
+  async regions(): Promise<CutoverRegion[]> {
+    if (!(await this.hasTable('Region')) || !(await this.hasTable('Guild'))) return [];
+    const forums = await this.hasColumn('Region', 'forumChannelId');
+    const rows = await sql<{ guild: string; channelId: string; forumChannelId: string | null }>`
+      select g.snowflake as guild, r.channelId as channelId,
+        ${forums ? sql`r.forumChannelId` : sql`null`} as forumChannelId
+      from Region r join Guild g on g.id = r.guildId
+      where g.snowflake is not null and r.channelId is not null
+      order by r.id`.execute(this.db);
+    return rows.rows.map((row) => ({
+      guild: String(row.guild),
+      channelId: String(row.channelId),
+      forumChannelId: row.forumChannelId === null ? null : String(row.forumChannelId),
+    }));
+  }
+}
+
+/* eslint-enable @typescript-eslint/no-explicit-any */
diff --git a/src/ops/cutover-check-cli.ts b/src/ops/cutover-check-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a8118a1fe3f853bcdea0e287c1fdf68caaff9f50
--- /dev/null
+++ b/src/ops/cutover-check-cli.ts
@@ -0,0 +1,52 @@
+import { REST } from 'discord.js';
+import { ConfigError, loadConfig, type Config } from '../config/index.js';
+import { dbConfigFrom } from '../db/db-config.js';
+import { createDb } from '../db/kysely.js';
+import { checkFailed, cutoverCheck, formatCheck } from './cutover-check.js';
+import { databaseStore } from './cutover-store.js';
+
+// Whether this installation is ready for the cutover, read only:
+//   node dist/ops/cutover-check-cli.js       (`./pine cutover-check`, `npm run cutover:check`)
+// The database in a read-only transaction; Discord through its REST API with the bot's token,
+// GETs only, without logging in to the gateway (a legacy bot that runs is not disturbed). Prints
+// pass / warn / fail lines and exits 1 when any fails.
+
+if (process.argv.length > 2) {
+  process.stderr.write(
+    `Unknown arguments: ${process.argv.slice(2).join(' ')}\nUsage: cutover-check\n`,
+  );
+  process.exit(2);
+}
+
+let config: Config;
+try {
+  config = loadConfig(process.env);
+} catch (err) {
+  const message = err instanceof ConfigError ? err.message : String(err);
+  process.stdout.write(`FAIL  config: ${message.replaceAll('\n', '\n        ')}\n`);
+  process.exit(1);
+}
+
+const db = createDb<unknown>(dbConfigFrom(config.env));
+try {
+  const lines = await db
+    .transaction()
+    .setAccessMode('read only')
+    .execute((trx) =>
+      cutoverCheck({
+        store: databaseStore(trx),
+        discord: new REST().setToken(config.env.DISCORD_TOKEN),
+        appId: config.env.DISCORD_APP_ID,
+        settings: config.settings,
+      }),
+    );
+  process.stdout.write(formatCheck(lines));
+  const failed = checkFailed(lines);
+  process.stdout.write(failed ? 'No go: a line failed.\n' : 'Go: no line failed.\n');
+  process.exitCode = failed ? 1 : 0;
+} catch (err) {
+  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
+  process.exitCode = 1;
+} finally {
+  await db.destroy();
+}
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e310be83cafc54e1ee5195cefe786ced8cbca3a3
--- /dev/null
+++ b/src/ops/cutover-check.test.ts
@@ -0,0 +1,428 @@
+import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
+import { beforeEach, describe, expect, it } from 'vitest';
+import {
+  BOT_PERMISSIONS,
+  FAKE_APP_ID,
+  FAKE_BOT_ID,
+  FakeDiscordApi,
+  overwrite,
+  type FakeApiChannel,
+  type FakeApiGuild,
+} from '../../test/support/fake-discord-api.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import { loadSettings, type Settings } from '../config/settings.js';
+import type { MigrationPlan } from '../db/migrator.js';
+import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
+import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
+import { GAME_ICON_NAMES } from '../domain/pogo/game-icons.js';
+import {
+  checkFailed,
+  cutoverCheck,
+  formatCheck,
+  type CheckLine,
+  type CutoverStore,
+} from './cutover-check.js';
+
+const bits = (...flags: bigint[]): string => String(flags.reduce((all, flag) => all | flag, 0n));
+
+/** What the cutover check reads of the database, in memory. */
+class MemoryCutoverStore implements CutoverStore {
+  plan: MigrationPlan = {
+    kind: 'takeover',
+    pending: ['2026_10_09_000_baseline', '2026_10_10_001_raid_bosses'],
+  };
+  servers: string[] = [];
+  regions: CutoverRegion[] = [];
+  restrictions: LegacyCommandRoles[] = [];
+  roles: CutoverSelfRole[] = [];
+  /** The sections that fail when read (a table the database lacks). */
+  failing = new Set<'plan' | 'servers' | 'restrictions'>();
+
+  migrationPlan(): Promise<MigrationPlan> {
+    if (this.failing.has('plan'))
+      return Promise.reject(new Error("Table 'kysely_migration' broke"));
+    return Promise.resolve(this.plan);
+  }
+  selfRoles(): Promise<CutoverSelfRole[]> {
+    return Promise.resolve(this.roles);
+  }
+  guilds(): Promise<string[]> {
+    if (this.failing.has('servers'))
+      return Promise.reject(new Error("Table 'Guild' doesn't exist"));
+    return Promise.resolve(this.servers);
+  }
+  regionRows(): Promise<CutoverRegion[]> {
+    return Promise.resolve(this.regions);
+  }
+  legacyRestrictions(): Promise<LegacyCommandRoles[]> {
+    if (this.failing.has('restrictions')) {
+      return Promise.reject(new Error("Table 'CommandRoles' doesn't exist"));
+    }
+    return Promise.resolve(this.restrictions);
+  }
+}
+
+/** The names the test settings give channels, categories and roles. */
+const NAMED_CHANNELS = [
+  'the-bot-lab',
+  'mod-bot-only',
+  'unown-sightings',
+  'elite-gym-raids',
+  'remote-raids',
+  'rank-checker',
+  'bot-updates',
+];
+
+interface Server {
+  guild: FakeApiGuild;
+  botRole: string;
+  category: FakeApiChannel;
+  north: FakeApiChannel;
+  south: FakeApiChannel;
+}
+
+/** A server shaped like Pittsburgh's: two regions in a category, every named channel, the bot set up right. */
+function server(api: FakeDiscordApi, store: MemoryCutoverStore): Server {
+  const guild = api.addGuild('Pittsburgh');
+  const everyone = guild.roles[0];
+  if (everyone) everyone.permissions = bits(P.ViewChannel, P.SendMessages);
+  const botRole = api.addRole(guild, 'Professor Pine', ...BOT_PERMISSIONS);
+  guild.members.set(FAKE_BOT_ID, [botRole]);
+  const category = api.addChannel(guild, 'EAST', { type: ChannelType.GuildCategory });
+  const north = api.addChannel(guild, 'north', { parentId: category.id });
+  const south = api.addChannel(guild, 'south', { parentId: category.id });
+  for (const name of NAMED_CHANNELS) api.addChannel(guild, name);
+  api.addChannel(guild, 'PVP CHAT AND TOURNAMENTS', { type: ChannelType.GuildCategory });
+  api.addRole(guild, 'unown');
+  api.emoji = [...GAME_ICON_NAMES];
+  store.servers = [guild.id];
+  store.regions = [
+    { guild: guild.id, channelId: north.id, forumChannelId: null },
+    { guild: guild.id, channelId: south.id, forumChannelId: null },
+  ];
+  return { guild, botRole, category, north, south };
+}
+
+describe('cutoverCheck', () => {
+  let api: FakeDiscordApi;
+  let store: MemoryCutoverStore;
+  let settings: Settings;
+  let shape: Server;
+
+  beforeEach(() => {
+    api = new FakeDiscordApi();
+    store = new MemoryCutoverStore();
+    settings = loadSettings(TEST_SETTINGS_PATH);
+    shape = server(api, store);
+  });
+
+  const check = () => cutoverCheck({ store, discord: api, appId: FAKE_APP_ID, settings });
+  const line = (lines: CheckLine[], what: CheckLine['what']) => {
+    const found = lines.filter((one) => one.what === what);
+    if (found.length !== 1) throw new Error(`${found.length} lines of ${what}`);
+    return found[0] as CheckLine;
+  };
+
+  it('passes a server set up right, apart from the forums still to make, and only reads', async () => {
+    const lines = await check();
+    expect(lines.filter((one) => one.status !== 'pass').map((one) => one.what)).toEqual(['forums']);
+    expect(checkFailed(lines)).toBe(false);
+    expect(api.onlyRead()).toBe(true);
+    expect(line(lines, 'database').text).toBe(
+      'database: a legacy Professor Pine database, which the migrator takes over; 2 migrations will run',
+    );
+    expect(line(lines, 'server').text).toBe(
+      'server Pittsburgh: the bot (Professor Pine) has the roles Professor Pine, and every permission it needs',
+    );
+    expect(lines.filter((one) => one.what === 'region').map((one) => one.text)).toEqual([
+      'region #north: the bot has what it needs in the channel and in the category EAST',
+      'region #south: the bot has what it needs in the channel and in the category EAST',
+    ]);
+  });
+
+  describe('the database', () => {
+    it('fails a database the migrator would refuse, saying why', async () => {
+      store.plan = { kind: 'refused', reason: 'The tables guild have lower-case names.' };
+      const lines = await check();
+      expect(line(lines, 'database')).toMatchObject({
+        status: 'fail',
+        text: 'database: the migrator would refuse it: The tables guild have lower-case names.',
+      });
+      expect(checkFailed(lines)).toBe(true);
+    });
+
+    it('warns of an empty database: a new install, so the dump was not restored', async () => {
+      store.plan = { kind: 'new-install', pending: ['2026_10_09_000_baseline'] };
+      expect(line(await check(), 'database').status).toBe('warn');
+    });
+
+    it('names the migrations a Pine database still lacks', async () => {
+      store.plan = { kind: 'pine', pending: ['2026_10_16_014_gym_lookups'] };
+      expect(line(await check(), 'database')).toMatchObject({
+        status: 'pass',
+        text: 'database: a Professor Pine database; 1 migration will run',
+        detail: ['2026_10_16_014_gym_lookups'],
+      });
+    });
+  });
+
+  describe('the application', () => {
+    it('fails when DISCORD_APP_ID is not the application of the token', async () => {
+      api.application.id = '400823744760905730';
+      expect(line(await check(), 'application')).toMatchObject({ status: 'fail' });
+    });
+
+    it('fails once when Discord cannot be read, and still checks the database', async () => {
+      api.failWith = new Error('401: Unauthorized');
+      const lines = await check();
+      expect(lines.map((one) => [one.what, one.status])).toEqual([
+        ['database', 'pass'],
+        ['application', 'fail'],
+        ['restrictions', 'pass'],
+      ]);
+      expect(line(lines, 'application').text).toBe(
+        'application: Discord could not be read with DISCORD_TOKEN: 401: Unauthorized',
+      );
+    });
+
+    it('fails once when Discord stops answering half-way, and still checks the legacy tables', async () => {
+      api.refused.set('/users/@me/guilds', new Error('503: Service Unavailable'));
+      const lines = await check();
+      expect(line(lines, 'discord')).toMatchObject({
+        status: 'fail',
+        text: 'discord: the check stopped reading Discord: 503: Service Unavailable',
+      });
+      expect(lines.at(-1)?.what).toBe('restrictions');
+      expect(checkFailed(lines)).toBe(true);
+    });
+
+    it('passes settings that ask for no privileged intent, whatever the application has', async () => {
+      api.application.flags = 1 << 19;
+      expect(line(await check(), 'intents')).toMatchObject({
+        status: 'pass',
+        text: 'intents: the settings ask for no privileged intent (the application has Message Content)',
+      });
+    });
+
+    it('warns of settings that ask for a privileged intent the application lacks', async () => {
+      settings = { ...settings, ocr: { ...settings.ocr, passive: true } };
+      expect(line(await check(), 'intents')).toMatchObject({
+        status: 'warn',
+        text: expect.stringContaining('Message Content') as string,
+      });
+    });
+
+    it('warns of game icons the application lacks as emoji', async () => {
+      api.emoji = ['rock'];
+      expect(line(await check(), 'emoji')).toMatchObject({
+        status: 'warn',
+        text: `emoji: ${GAME_ICON_NAMES.length - 1} of the game's icons are not the application's emoji yet: './pine emoji-upload --apply' uploads them`,
+      });
+    });
+  });
+
+  describe('what the database cannot give', () => {
+    it('says each section it could not read as a failure, and goes on with the others', async () => {
+      store.failing = new Set(['plan', 'servers', 'restrictions']);
+      const lines = await check();
+      expect(line(lines, 'database')).toMatchObject({
+        status: 'fail',
+        text: "database: it could not be read: Table 'kysely_migration' broke",
+      });
+      expect(line(lines, 'servers')).toMatchObject({
+        status: 'fail',
+        text: "servers: the servers and regions of the database could not be read: Table 'Guild' doesn't exist",
+      });
+      expect(line(lines, 'restrictions')).toMatchObject({ status: 'fail' });
+      expect(line(lines, 'application').status).toBe('pass');
+    });
+  });
+
+  describe('the servers', () => {
+    it('fails a server it cannot read, and goes on with the next one and the forums', async () => {
+      const other = api.addGuild('Away');
+      other.members.set(FAKE_BOT_ID, []);
+      store.servers = [other.id, shape.guild.id];
+      api.refused.set(`/guilds/${other.id}/channels`, new Error('503: Service Unavailable'));
+      const lines = await check();
+      expect(
+        lines.filter((one) => one.what === 'server').map((one) => [one.status, one.text]),
+      ).toEqual([
+        ['fail', 'server Away: it could not be read: 503: Service Unavailable'],
+        [
+          'pass',
+          'server Pittsburgh: the bot (Professor Pine) has the roles Professor Pine, and every permission it needs',
+        ],
+      ]);
+      expect(line(lines, 'forums').status).toBe('warn');
+      expect(lines.some((one) => one.what === 'discord')).toBe(false);
+    });
+
+    it('wants Manage Messages in a region channel, to take a read screenshot away', async () => {
+      shape.north.overwrites = [overwrite(shape.botRole, [], [P.ManageMessages])];
+      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
+        status: 'warn',
+        text: 'region #north: the bot could use Manage Messages in the channel',
+      });
+    });
+
+    it('names only what a missing View Channels or Send Messages leaves out', async () => {
+      shape.north.overwrites = [overwrite(shape.guild.id, [], [P.ViewChannel])];
+      expect((await check()).find((one) => one.what === 'region')?.text).toBe(
+        'region #north: the bot lacks View Channels in the channel',
+      );
+      shape.north.overwrites = [overwrite(shape.guild.id, [], [P.SendMessages])];
+      expect((await check()).find((one) => one.what === 'region')?.text).toBe(
+        'region #north: the bot lacks Send Messages in the channel',
+      );
+    });
+
+    it('warns of a channel the bot announces in where it may not post', async () => {
+      const updates = shape.guild.channels.find((one) => one.name === 'bot-updates');
+      if (updates) updates.overwrites = [overwrite(shape.guild.id, [], [P.SendMessages])];
+      expect(line(await check(), 'announcements')).toMatchObject({
+        status: 'warn',
+        text: 'announcements: in Pittsburgh the bot lacks Send Messages in #bot-updates',
+      });
+    });
+
+    it("warns of a self-assigned role above the bot's highest, which it cannot give", async () => {
+      const high = api.addRole(shape.guild, 'Mystic');
+      // Found by its name (a legacy row has no snowflake), and below the bot's role.
+      const low = shape.guild.roles.find((one) => one.name === 'unown');
+      if (low) low.position = 0;
+      store.roles = [
+        { guild: shape.guild.id, roleId: high, name: 'Mystic' },
+        { guild: shape.guild.id, roleId: null, name: 'unown' },
+      ];
+      expect(line(await check(), 'roles')).toMatchObject({
+        status: 'warn',
+        text: "roles: in Pittsburgh the self-assigned role Mystic is above the bot's highest role (Professor Pine): the bot cannot give it",
+      });
+    });
+
+    it('fails a server where the bot lacks a permission it needs, and warns of one it can do without', async () => {
+      const role = shape.guild.roles.find((one) => one.id === shape.botRole);
+      if (role)
+        role.permissions = bits(...BOT_PERMISSIONS.filter((flag) => flag !== P.ManageThreads));
+      const failed = line(await check(), 'server');
+      expect(failed.status).toBe('fail');
+      expect(failed.text).toContain('lacks Manage Threads');
+
+      if (role)
+        role.permissions = bits(...BOT_PERMISSIONS.filter((flag) => flag !== P.AddReactions));
+      const warned = line(await check(), 'server');
+      expect(warned.status).toBe('warn');
+      expect(warned.text).toContain('could use Add Reactions');
+    });
+
+    it('fails a region whose category keeps the bot from making the forum', async () => {
+      shape.category.overwrites = [overwrite(shape.botRole, [], [P.ManageChannels])];
+      const regions = (await check()).filter((one) => one.what === 'region');
+      expect(regions.map((one) => one.status)).toEqual(['fail', 'fail']);
+      expect(regions[0]?.text).toBe(
+        'region #north: the bot lacks Manage Channels in the category EAST',
+      );
+    });
+
+    it('fails a region channel the bot may not post in', async () => {
+      shape.north.overwrites = [overwrite(shape.guild.id, [], [P.SendMessages])];
+      expect((await check()).find((one) => one.what === 'region')).toMatchObject({
+        status: 'fail',
+        text: 'region #north: the bot lacks Send Messages in the channel',
+      });
+    });
+
+    it('warns of a region whose channel is gone', async () => {
+      shape.guild.channels = shape.guild.channels.filter((one) => one.id !== shape.south.id);
+      const regions = (await check()).filter((one) => one.what === 'region');
+      expect(regions[1]).toMatchObject({ status: 'warn' });
+      expect(regions[1]?.text).toContain(shape.south.id);
+    });
+
+    it('checks a forum a region has, and passes the forums once every region has one', async () => {
+      const forum = api.addChannel(shape.guild, 'north-meetups', {
+        type: ChannelType.GuildForum,
+        parentId: shape.category.id,
+        overwrites: [overwrite(shape.botRole, [], [P.ManageThreads])],
+      });
+      const other = api.addChannel(shape.guild, 'south-meetups', {
+        type: ChannelType.GuildForum,
+        parentId: shape.category.id,
+      });
+      store.regions = [
+        { guild: shape.guild.id, channelId: shape.north.id, forumChannelId: forum.id },
+        { guild: shape.guild.id, channelId: shape.south.id, forumChannelId: other.id },
+      ];
+      const lines = await check();
+      expect(line(lines, 'forums')).toMatchObject({ status: 'pass' });
+      expect(lines.find((one) => one.what === 'region')).toMatchObject({
+        status: 'fail',
+        text: 'region #north: the bot lacks Manage Threads in the forum #north-meetups',
+      });
+    });
+
+    it('warns of the regions without a forum, by name', async () => {
+      expect(line(await check(), 'forums')).toMatchObject({
+        status: 'warn',
+        text: "forums: 2 of 2 regions have no forum yet (#north, #south): '/admin setup-forums' makes them",
+      });
+    });
+
+    it('warns of a server the database has and the bot is not in', async () => {
+      store.servers = [...store.servers, '412345678901234599'];
+      expect(line(await check(), 'servers')).toMatchObject({ status: 'warn' });
+    });
+
+    it('warns of the channels, categories and roles the settings name that the server lacks', async () => {
+      shape.guild.channels = shape.guild.channels.filter((one) => one.name !== 'unown-sightings');
+      shape.guild.roles = shape.guild.roles.filter((one) => one.name !== 'unown');
+      expect(line(await check(), 'names')).toMatchObject({
+        status: 'warn',
+        text: 'names: Pittsburgh lacks what the settings name: channels.unown (#unown-sightings), roles.unown (unown)',
+      });
+    });
+
+    it('reads role names as the bot does, and asks for no PvP channel, which nothing reads', async () => {
+      const unown = shape.guild.roles.find((one) => one.name === 'unown');
+      if (unown) unown.name = ' Unown ';
+      shape.guild.channels = shape.guild.channels.filter((one) => one.name !== 'rank-checker');
+      expect(line(await check(), 'names').status).toBe('pass');
+    });
+
+    it('does not ask for a channel whose feature is off', async () => {
+      shape.guild.channels = shape.guild.channels.filter((one) => one.name !== 'remote-raids');
+      settings = { ...settings, features: { ...settings.features, remoteRaidChannel: false } };
+      expect(line(await check(), 'names').status).toBe('pass');
+    });
+  });
+
+  describe('the legacy restrictions', () => {
+    it('passes empty tables and warns of rows, listed as the export lists them', async () => {
+      expect(line(await check(), 'restrictions')).toMatchObject({ status: 'pass' });
+      store.restrictions = [
+        {
+          guild: shape.guild.id,
+          command: 'raid',
+          roleRequired: true,
+          roleIds: ['512345678901234567'],
+        },
+      ];
+      const warned = line(await check(), 'restrictions');
+      expect(warned.status).toBe('warn');
+      expect(warned.detail?.join('\n')).toContain(
+        'raid: required, roles 512345678901234567 -> /raid',
+      );
+    });
+  });
+
+  it('formats a line by its status, its detail indented', () => {
+    expect(
+      formatCheck([
+        { what: 'database', status: 'pass', text: 'database: fine' },
+        { what: 'forums', status: 'warn', text: 'forums: none', detail: ['north'] },
+        { what: 'server', status: 'fail', text: 'server: no' },
+      ]),
+    ).toBe('PASS  database: fine\nWARN  forums: none\n        north\nFAIL  server: no\n');
+  });
+});
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8c5452852caa5afa896d39a91e0d87f607a1efab
--- /dev/null
+++ b/src/ops/cutover-check.ts
@@ -0,0 +1,663 @@
+import { ApplicationFlags, ChannelType, Routes } from 'discord.js';
+import type { Settings } from '../config/settings.js';
+import type { MigrationPlan } from '../db/migrator.js';
+import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
+import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
+import { applicationEmojiNames, failureReason, iconSources, missingIcons } from './emoji-upload.js';
+import {
+  basePermissions,
+  channelPermissions,
+  ANNOUNCE_NEEDS,
+  FORUM_NEEDS,
+  missingNeeds,
+  REGION_CHANNEL_NEEDS,
+  SERVER_NEEDS,
+  type ApiMember,
+  type ApiOverwrite,
+  type ApiRole,
+  type Need,
+} from './permissions.js';
+import { exportText, roleAuthExport } from './role-auth.js';
+
+/*
+ * The cutover check (`./pine cutover-check`, `npm run cutover:check`): whether a legacy
+ * installation is ready for the new bot, read only. The database through `CutoverStore` (only
+ * `select`s, in a read-only transaction), Discord through its REST API with the bot's token
+ * (GETs only: no gateway login, so a legacy bot that runs is not disturbed). Each finding is a
+ * pass, warn or fail line; any fail is a no-go.
+ */
+
+/** The part of discord.js's `REST` the check reads through: GETs only. */
+export interface DiscordRead {
+  get(route: `/${string}`, options?: { query?: URLSearchParams }): Promise<unknown>;
+}
+
+/** What the check reads of the database. */
+export interface CutoverStore {
+  /** What the migrator would do (`migrationPlan`). */
+  migrationPlan(): Promise<MigrationPlan>;
+  /** The servers of `Guild`. */
+  guilds(): Promise<string[]>;
+  regionRows(): Promise<CutoverRegion[]>;
+  /** The legacy `CommandRoleAuthorization` and `CommandRoles`; none where they are gone. */
+  legacyRestrictions(): Promise<LegacyCommandRoles[]>;
+  /** The self-assigned roles of `Role`, which the bot gives and takes. */
+  selfRoles(): Promise<CutoverSelfRole[]>;
+}
+
+export type CheckStatus = 'pass' | 'warn' | 'fail';
+
+export interface CheckLine {
+  /** What the line is about: one line of each, but `server`, `region` and `names` per server or region. */
+  what:
+    | 'database'
+    | 'application'
+    | 'intents'
+    | 'emoji'
+    | 'servers'
+    | 'server'
+    | 'region'
+    | 'names'
+    | 'forums'
+    | 'restrictions'
+    | 'cleanup'
+    | 'announcements'
+    | 'roles'
+    | 'discord';
+  status: CheckStatus;
+  text: string;
+  /** Lines under it: the migrations to run, the rows of a table. */
+  detail?: string[];
+}
+
+export interface CutoverCheckOptions {
+  store: CutoverStore;
+  discord: DiscordRead;
+  /** `DISCORD_APP_ID` of the environment. */
+  appId: string;
+  settings: Settings;
+}
+
+/** A channel as `GET /guilds/{id}/channels` gives it. */
+interface ApiChannel {
+  id: string;
+  name: string;
+  type: ChannelType;
+  parent_id?: string | null;
+  permission_overwrites?: ApiOverwrite[];
+}
+
+function databaseLine(plan: MigrationPlan): CheckLine {
+  if (plan.kind === 'refused') {
+    return {
+      what: 'database',
+      status: 'fail',
+      text: `database: the migrator would refuse it: ${plan.reason}`,
+    };
+  }
+  const n = plan.pending.length;
+  const runs = n === 0 ? 'it is up to date' : `${n} migration${n === 1 ? '' : 's'} will run`;
+  const detail = n === 0 ? {} : { detail: plan.pending };
+  switch (plan.kind) {
+    case 'takeover':
+      return {
+        what: 'database',
+        status: 'pass',
+        text: `database: a legacy Professor Pine database, which the migrator takes over; ${runs}`,
+        ...detail,
+      };
+    case 'pine':
+      return {
+        what: 'database',
+        status: 'pass',
+        text: `database: a Professor Pine database; ${runs}`,
+        ...detail,
+      };
+    case 'new-install':
+      return {
+        what: 'database',
+        status: 'warn',
+        text:
+          'database: empty: the migrator would make a new install. Was the dump restored ' +
+          "('./pine restore')?",
+      };
+  }
+}
+
+/** The privileged intents, by the application's flags that grant them (either form). */
+const PRIVILEGED = [
+  {
+    name: 'Presence',
+    flags: ApplicationFlags.GatewayPresence | ApplicationFlags.GatewayPresenceLimited,
+  },
+  {
+    name: 'Server Members',
+    flags: ApplicationFlags.GatewayGuildMembers | ApplicationFlags.GatewayGuildMembersLimited,
+  },
+  {
+    name: 'Message Content',
+    flags: ApplicationFlags.GatewayMessageContent | ApplicationFlags.GatewayMessageContentLimited,
+  },
+] as const;
+
+function intentsLine(flags: number, settings: Settings): CheckLine {
+  const granted: string[] = PRIVILEGED.filter((one) => (flags & one.flags) !== 0).map(
+    (one) => one.name,
+  );
+  const asked = [
+    ...(settings.ocr.passive ? [{ name: 'Message Content', by: 'ocr.passive' }] : []),
+    ...(settings.autoAssignRole ? [{ name: 'Server Members', by: 'autoAssignRole' }] : []),
+  ];
+  const has = granted.length === 0 ? 'none' : granted.join(', ');
+  if (asked.length === 0) {
+    return {
+      what: 'intents',
+      status: 'pass',
+      text: `intents: the settings ask for no privileged intent (the application has ${has})`,
+    };
+  }
+  const missing = asked.filter((one) => !granted.includes(one.name));
+  const named = asked.map((one) => `${one.name} (${one.by})`).join(', ');
+  return {
+    what: 'intents',
+    status: 'warn',
+    text:
+      missing.length > 0
+        ? `intents: the settings ask for ${named}, which the application lacks: the bot starts without ${missing.length === 1 ? 'it' : 'them'}, and what ${missing.length === 1 ? 'it serves does' : 'they serve do'} nothing`
+        : `intents: the settings ask for ${named}; the application has ${asked.length === 1 ? 'it' : 'them'} now, but Discord may take privileged intents away (its review)`,
+  };
+}
+
+/** The names a list says: "A, B and C". */
+function names(items: readonly string[]): string {
+  return items.length <= 1
+    ? items.join('')
+    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
+}
+
+function needNames(needs: readonly Need[]): string {
+  return needs.map((one) => one.name).join(', ');
+}
+
+/** One server's lines: the bot's member and permissions, each region, the names of the settings. */
+async function serverLines(
+  discord: DiscordRead,
+  guildId: string,
+  bot: { id: string; username: string },
+  regions: readonly CutoverRegion[],
+  settings: Settings,
+  selfRoles: readonly CutoverSelfRole[],
+): Promise<{ lines: CheckLine[]; withoutForum: string[] }> {
+  const lines: CheckLine[] = [];
+  const guild = (await discord.get(Routes.guild(guildId))) as {
+    id: string;
+    name: string;
+    owner_id: string;
+    roles: ApiRole[];
+  };
+  let member: { roles: string[] };
+  try {
+    member = (await discord.get(Routes.guildMember(guildId, bot.id))) as { roles: string[] };
+  } catch (err) {
+    lines.push({
+      what: 'server',
+      status: 'fail',
+      text: `server ${guild.name}: the bot's member could not be read: ${failureReason(err)}`,
+    });
+    return { lines, withoutForum: [] };
+  }
+  const channels = (await discord.get(Routes.guildChannels(guildId))) as ApiChannel[];
+  const me: ApiMember = { id: bot.id, roleIds: member.roles };
+  const base = basePermissions({ id: guild.id, ownerId: guild.owner_id }, guild.roles, me);
+  const roleNames = member.roles.map(
+    (id) => guild.roles.find((role) => role.id === id)?.name ?? id,
+  );
+  const missing = missingNeeds(base, SERVER_NEEDS);
+  const who = `the bot (${bot.username})`;
+  const roles = roleNames.length === 0 ? 'no role' : `the roles ${roleNames.join(', ')}`;
+  if (missing.required.length > 0) {
+    lines.push({
+      what: 'server',
+      status: 'fail',
+      text: `server ${guild.name}: ${who} lacks ${needNames(missing.required)} (it has ${roles})`,
+      detail: missing.required.map((one) => `${one.name}: ${one.why}`),
+    });
+  } else if (missing.optional.length > 0) {
+    lines.push({
+      what: 'server',
+      status: 'warn',
+      text: `server ${guild.name}: ${who} has ${roles}, and could use ${needNames(missing.optional)}`,
+      detail: missing.optional.map((one) => `${one.name}: ${one.why}`),
+    });
+  } else {
+    lines.push({
+      what: 'server',
+      status: 'pass',
+      text: `server ${guild.name}: ${who} has ${roles}, and every permission it needs`,
+    });
+  }
+
+  const byId = new Map(channels.map((channel) => [channel.id, channel]));
+  const permissionsIn = (channel: ApiChannel) =>
+    channelPermissions(base, guild.id, me, channel.permission_overwrites ?? []);
+  const withoutForum: string[] = [];
+  for (const region of regions) {
+    const channel = byId.get(region.channelId);
+    if (!channel) {
+      lines.push({
+        what: 'region',
+        status: 'warn',
+        text: `region ${region.channelId}: its channel is gone; the region stays until '/region' removes it`,
+      });
+      withoutForum.push(region.channelId);
+      continue;
+    }
+    const places: { place: string; channel: ApiChannel; needs: readonly Need[] }[] = [
+      { place: 'the channel', channel, needs: REGION_CHANNEL_NEEDS },
+    ];
+    const category = channel.parent_id ? byId.get(channel.parent_id) : undefined;
+    if (category) {
+      places.push({
+        place: `the category ${category.name}`,
+        channel: category,
+        needs: FORUM_NEEDS,
+      });
+    }
+    const forum = region.forumChannelId === null ? undefined : byId.get(region.forumChannelId);
+    if (forum)
+      places.push({ place: `the forum #${forum.name}`, channel: forum, needs: FORUM_NEEDS });
+    else withoutForum.push(`#${channel.name}`);
+    const lacks: string[] = [];
+    const wants: string[] = [];
+    for (const one of places) {
+      const gap = missingNeeds(permissionsIn(one.channel), one.needs);
+      if (gap.required.length > 0) lacks.push(`${needNames(gap.required)} in ${one.place}`);
+      if (gap.optional.length > 0) wants.push(`${needNames(gap.optional)} in ${one.place}`);
+    }
+    const gone =
+      region.forumChannelId !== null && !forum
+        ? '; its forum is gone (/admin setup-forums makes a new one)'
+        : '';
+    const label = `region #${channel.name}`;
+    if (lacks.length > 0) {
+      lines.push({
+        what: 'region',
+        status: 'fail',
+        text: `${label}: the bot lacks ${lacks.join(', ')}${gone}`,
+      });
+    } else if (wants.length > 0 || gone !== '') {
+      lines.push({
+        what: 'region',
+        status: 'warn',
+        text: `${label}: ${wants.length > 0 ? `the bot could use ${wants.join(', ')}` : 'the bot has what it needs'}${gone}`,
+      });
+    } else {
+      lines.push({
+        what: 'region',
+        status: 'pass',
+        text: `${label}: the bot has what it needs ${names(places.map((one) => `in ${one.place}`))}`,
+      });
+    }
+  }
+
+  lines.push(namesLine(guild.name, channels, guild.roles, settings));
+  lines.push(announceLine(guild.name, channels, settings, permissionsIn));
+  const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
+  if (rolesCheck) lines.push(rolesCheck);
+  return { lines, withoutForum };
+}
+
+/** The channels the bot announces in or copies posts to, as the settings name them. */
+function announceChannels(settings: Settings): string[] {
+  const { channels: named, features } = settings;
+  return [
+    named['bot-updates'],
+    named['mod-bot-lab'],
+    named.unown,
+    ...(features.exGymChannel ? [named['elite-gym-raids']] : []),
+    ...(features.remoteRaidChannel ? [named['remote-raids']] : []),
+  ];
+}
+
+/** Whether the bot may post in the channels it announces in (those that exist: `names` says the rest). */
+function announceLine(
+  server: string,
+  channels: readonly ApiChannel[],
+  settings: Settings,
+  permissionsIn: (channel: ApiChannel) => bigint,
+): CheckLine {
+  const gaps = announceChannels(settings).flatMap((name) => {
+    const channel = channels.find(
+      (one) =>
+        one.name === name &&
+        (one.type === ChannelType.GuildText || one.type === ChannelType.GuildAnnouncement),
+    );
+    if (!channel) return [];
+    const missing = missingNeeds(permissionsIn(channel), ANNOUNCE_NEEDS).required;
+    return missing.length === 0 ? [] : [`${needNames(missing)} in #${name}`];
+  });
+  return gaps.length === 0
+    ? {
+        what: 'announcements',
+        status: 'pass',
+        text: `announcements: in ${server} the bot may post in every channel it announces in`,
+      }
+    : {
+        what: 'announcements',
+        status: 'warn',
+        text: `announcements: in ${server} the bot lacks ${gaps.join(', ')}`,
+      };
+}
+
+/** A role's name as the bot compares it (`unown-want-service.ts`): trimmed, lower case. */
+const roleKey = (name: string) => name.trim().toLowerCase();
+
+/**
+ * The self-assigned roles the bot cannot give: Discord lets a bot manage only roles below its
+ * own highest. Nothing when the server has none.
+ */
+function rolesLine(
+  server: string,
+  roles: readonly ApiRole[],
+  botRoleIds: readonly string[],
+  selfRoles: readonly CutoverSelfRole[],
+): CheckLine | undefined {
+  if (selfRoles.length === 0) return undefined;
+  const mine = roles.filter((role) => botRoleIds.includes(role.id));
+  const top = mine.reduce<ApiRole | undefined>(
+    (best, role) => (best === undefined || role.position > best.position ? role : best),
+    undefined,
+  );
+  const above = selfRoles.flatMap((self) => {
+    const role =
+      (self.roleId === null ? undefined : roles.find((one) => one.id === self.roleId)) ??
+      roles.find((one) => roleKey(one.name) === roleKey(self.name));
+    return role && role.position >= (top?.position ?? 0) ? [role.name] : [];
+  });
+  if (above.length === 0) {
+    return {
+      what: 'roles',
+      status: 'pass',
+      text: `roles: in ${server} the bot can give every self-assigned role`,
+    };
+  }
+  return {
+    what: 'roles',
+    status: 'warn',
+    text:
+      `roles: in ${server} the self-assigned role${above.length === 1 ? '' : 's'} ${above.join(', ')} ` +
+      `${above.length === 1 ? 'is' : 'are'} above the bot's highest role (${top?.name ?? 'none'}): ` +
+      `the bot cannot give ${above.length === 1 ? 'it' : 'them'}`,
+  };
+}
+
+/** The channels, categories and roles the settings name that the server lacks. */
+function namesLine(
+  server: string,
+  channels: readonly ApiChannel[],
+  roles: readonly ApiRole[],
+  settings: Settings,
+): CheckLine {
+  const text = new Set(
+    channels
+      .filter(
+        (one) => one.type === ChannelType.GuildText || one.type === ChannelType.GuildAnnouncement,
+      )
+      .map((one) => one.name),
+  );
+  const categories = new Set(
+    channels.filter((one) => one.type === ChannelType.GuildCategory).map((one) => one.name),
+  );
+  const roleNames = new Set(roles.map((one) => roleKey(one.name)));
+  const { channels: named, features } = settings;
+  const wanted: [string, string][] = [
+    ['bot-lab', named['bot-lab']],
+    ['mod-bot-lab', named['mod-bot-lab']],
+    ['unown', named.unown],
+    ...(features.exGymChannel
+      ? [['elite-gym-raids', named['elite-gym-raids']] as [string, string]]
+      : []),
+    ...(features.remoteRaidChannel
+      ? [['remote-raids', named['remote-raids']] as [string, string]]
+      : []),
+    ['bot-updates', named['bot-updates']],
+  ];
+  const lacking = [
+    ...wanted
+      .filter(([, name]) => !text.has(name))
+      .map(([key, name]) => `channels.${key} (#${name})`),
+    ...(categories.has(settings.categories.pvp)
+      ? []
+      : [`categories.pvp (${settings.categories.pvp})`]),
+    ...(roleNames.has(roleKey(settings.roles.unown))
+      ? []
+      : [`roles.unown (${settings.roles.unown})`]),
+  ];
+  return lacking.length === 0
+    ? {
+        what: 'names',
+        status: 'pass',
+        text: `names: ${server} has every channel, category and role the settings name`,
+      }
+    : {
+        what: 'names',
+        status: 'warn',
+        text: `names: ${server} lacks what the settings name: ${lacking.join(', ')}`,
+      };
+}
+
+function restrictionsLine(rows: readonly LegacyCommandRoles[]): CheckLine {
+  const servers = roleAuthExport(rows);
+  if (servers.length === 0) {
+    return {
+      what: 'restrictions',
+      status: 'pass',
+      text: 'restrictions: the legacy tables restrict no command',
+    };
+  }
+  return {
+    what: 'restrictions',
+    status: 'warn',
+    text:
+      'restrictions: the legacy tables restrict commands: set the same up under Server ' +
+      'Settings > Integrations > Professor Pine',
+    detail: exportText(servers).trimEnd().split('\n'),
+  };
+}
+
+/** Discord's part of the check; a failure to read the application ends it with one line. */
+async function discordLines(
+  options: CutoverCheckOptions,
+  regions: readonly CutoverRegion[],
+  guildIds: readonly string[],
+  selfRoles: readonly CutoverSelfRole[],
+): Promise<CheckLine[]> {
+  const { discord, appId, settings } = options;
+  let application: { id: string; name: string; flags?: number };
+  try {
+    application = (await discord.get(Routes.currentApplication())) as typeof application;
+  } catch (err) {
+    return [
+      {
+        what: 'application',
+        status: 'fail',
+        text: `application: Discord could not be read with DISCORD_TOKEN: ${failureReason(err)}`,
+      },
+    ];
+  }
+  const lines: CheckLine[] = [];
+  if (application.id !== appId) {
+    lines.push({
+      what: 'application',
+      status: 'fail',
+      text:
+        `application: DISCORD_APP_ID is not the id of the token's application ` +
+        `(${application.name} has ${application.id})`,
+    });
+  } else {
+    lines.push({
+      what: 'application',
+      status: 'pass',
+      text: `application: ${application.name}, the application of DISCORD_TOKEN`,
+    });
+  }
+  lines.push(intentsLine(application.flags ?? 0, settings));
+  // What Discord refuses from here on (a server it no longer answers for, a 5xx) ends the reading
+  // with one line; the rest of the check goes on.
+  try {
+    const missing = missingIcons(
+      iconSources(),
+      await applicationEmojiNames(discord, application.id),
+    );
+    lines.push(
+      missing.length === 0
+        ? {
+            what: 'emoji',
+            status: 'pass',
+            text: 'emoji: the application has every icon the posts show',
+          }
+        : {
+            what: 'emoji',
+            status: 'warn',
+            text: `emoji: ${missing.length} of the game's icons are not the application's emoji yet: './pine emoji-upload --apply' uploads them`,
+          },
+    );
+
+    const bot = (await discord.get(Routes.user())) as { id: string; username: string };
+    // The first 200 servers, unpaginated: Pine is in a server or two, not in hundreds.
+    const joined = (await discord.get(Routes.userGuilds())) as { id: string; name: string }[];
+    const joinedIds = new Set(joined.map((one) => one.id));
+    const absent = guildIds.filter((id) => !joinedIds.has(id));
+    const unknown = joined.filter((one) => !guildIds.includes(one.id));
+    if (guildIds.length === 0) {
+      lines.push({
+        what: 'servers',
+        status: 'warn',
+        text: 'servers: the database names no server',
+      });
+    } else if (absent.length > 0) {
+      lines.push({
+        what: 'servers',
+        status: 'warn',
+        text: `servers: the bot is not in ${absent.join(', ')}, which the database has: their regions are not checked`,
+      });
+    } else {
+      lines.push({
+        what: 'servers',
+        status: 'pass',
+        text: `servers: the bot is in every server of the database (${guildIds.length})${unknown.length > 0 ? `, and in ${unknown.map((one) => one.name).join(', ')}, which it adds at its start` : ''}`,
+      });
+    }
+    const withoutForum: string[] = [];
+    for (const guildId of guildIds.filter((id) => joinedIds.has(id))) {
+      const ofServer = regions.filter((one) => one.guild === guildId);
+      // A server that cannot be read is a failure of its own; the others are still checked.
+      try {
+        const server = await serverLines(
+          discord,
+          guildId,
+          bot,
+          ofServer,
+          settings,
+          selfRoles.filter((one) => one.guild === guildId),
+        );
+        lines.push(...server.lines);
+        withoutForum.push(...server.withoutForum);
+      } catch (err) {
+        const name = joined.find((one) => one.id === guildId)?.name ?? guildId;
+        lines.push({
+          what: 'server',
+          status: 'fail',
+          text: `server ${name}: it could not be read: ${failureReason(err)}`,
+        });
+        withoutForum.push(...ofServer.map((one) => one.channelId));
+      }
+    }
+    const counted = regions.filter((one) => joinedIds.has(one.guild)).length;
+    lines.push(
+      counted === 0
+        ? {
+            what: 'forums',
+            status: 'warn',
+            text: 'forums: the database has no regions in these servers',
+          }
+        : withoutForum.length === 0
+          ? { what: 'forums', status: 'pass', text: 'forums: every region has its forum' }
+          : {
+              what: 'forums',
+              status: 'warn',
+              text: `forums: ${withoutForum.length} of ${counted} regions have no forum yet (${withoutForum.join(', ')}): '/admin setup-forums' makes them`,
+            },
+    );
+  } catch (err) {
+    lines.push({
+      what: 'discord',
+      status: 'fail',
+      text: `discord: the check stopped reading Discord: ${failureReason(err)}`,
+    });
+  }
+  return lines;
+}
+
+/** Every line of the check, in order: the database, Discord, the legacy restrictions. */
+export async function cutoverCheck(options: CutoverCheckOptions): Promise<CheckLine[]> {
+  const { store } = options;
+  // Each section of the database that cannot be read is a failure of its own (a schema of
+  // another shape, a table that is gone); the others are still checked.
+  const lines: CheckLine[] = [];
+  try {
+    lines.push(databaseLine(await store.migrationPlan()));
+  } catch (err) {
+    lines.push({
+      what: 'database',
+      status: 'fail',
+      text: `database: it could not be read: ${failureReason(err)}`,
+    });
+  }
+  let guildIds: string[] = [];
+  let regions: CutoverRegion[] = [];
+  let selfRoles: CutoverSelfRole[] = [];
+  let servers: CheckLine | undefined;
+  try {
+    guildIds = await store.guilds();
+    regions = await store.regionRows();
+    selfRoles = await store.selfRoles();
+  } catch (err) {
+    servers = {
+      what: 'servers',
+      status: 'fail',
+      text: `servers: the servers and regions of the database could not be read: ${failureReason(err)}`,
+    };
+  }
+  const discord = await discordLines(options, regions, guildIds, selfRoles);
+  // The database's failure takes the place of what Discord said of no servers.
+  lines.push(
+    ...(servers ? [...discord.filter((one) => one.what !== 'servers'), servers] : discord),
+  );
+  try {
+    lines.push(restrictionsLine(await store.legacyRestrictions()));
+  } catch (err) {
+    lines.push({
+      what: 'restrictions',
+      status: 'fail',
+      text: `restrictions: the legacy tables could not be read: ${failureReason(err)}`,
+    });
+  }
+  return lines;
+}
+
+/** Whether any line fails: the cutover is a no-go. */
+export function checkFailed(lines: readonly CheckLine[]): boolean {
+  return lines.some((line) => line.status === 'fail');
+}
+
+/** The lines as the operator reads them: the status first, the detail indented. */
+export function formatCheck(lines: readonly CheckLine[]): string {
+  return lines
+    .flatMap((line) => [
+      `${line.status.toUpperCase()}  ${line.text}`,
+      ...(line.detail ?? []).map((one) => `        ${one}`),
+    ])
+    .map((text) => `${text}\n`)
+    .join('');
+}
diff --git a/src/ops/cutover-store.db.test.ts b/src/ops/cutover-store.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ba0d111e3207635264137d7b62c701f3cbd358d4
--- /dev/null
+++ b/src/ops/cutover-store.db.test.ts
@@ -0,0 +1,73 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_APP_ID, FakeDiscordApi } from '../../test/support/fake-discord-api.js';
+import { startDatabase, type TestDatabase } from '../../test/support/mysql.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import { loadSettings } from '../config/settings.js';
+import { createDb } from '../db/kysely.js';
+import { cutoverCheck, type CheckLine } from './cutover-check.js';
+import { databaseStore } from './cutover-store.js';
+
+/** The whole check over a database of this shape, in a read-only transaction as the CLI runs it. */
+async function checkOf(database: TestDatabase): Promise<CheckLine[]> {
+  const db = createDb<unknown>(database.config);
+  try {
+    return await db
+      .transaction()
+      .setAccessMode('read only')
+      .execute((trx) =>
+        cutoverCheck({
+          store: databaseStore(trx),
+          discord: new FakeDiscordApi(),
+          appId: FAKE_APP_ID,
+          settings: loadSettings(TEST_SETTINGS_PATH),
+        }),
+      );
+  } finally {
+    await db.destroy();
+  }
+}
+
+const byWhat = (lines: CheckLine[]) =>
+  Object.fromEntries(lines.map((line) => [line.what, line.status]));
+
+describe('the cutover check over the database', () => {
+  let database: TestDatabase | undefined;
+
+  afterEach(async () => {
+    await database?.stop();
+    database = undefined;
+  });
+
+  it('checks an empty database to the end: a new install, and nothing to carry over', async () => {
+    database = await startDatabase({ legacySchema: false });
+    expect(byWhat(await checkOf(database))).toMatchObject({
+      database: 'warn',
+      servers: 'warn',
+      restrictions: 'pass',
+    });
+  });
+
+  it('checks a database whose table names Windows lower-cased to the end, failing it', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await database.query(
+      'rename table `Guild` to `guild`, `CommandRoles` to `commandroles`, `Role` to `role`',
+    );
+    const lines = await checkOf(database);
+    expect(lines.find((line) => line.what === 'database')?.text).toMatch(/lower-case names/);
+    expect(byWhat(lines)).toMatchObject({ database: 'fail', restrictions: 'pass' });
+  });
+
+  it('reads the self-assigned roles of a legacy database by their names', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await database.query("insert into Guild (id, snowflake) values (1, '412345678901234567')");
+    await database.query("insert into Role (roleName, guildId) values ('Mystic', 1)");
+    const db = createDb<unknown>(database.config);
+    try {
+      expect(await databaseStore(db).selfRoles()).toEqual([
+        { guild: '412345678901234567', roleId: null, name: 'Mystic' },
+      ]);
+    } finally {
+      await db.destroy();
+    }
+  });
+});
diff --git a/src/ops/cutover-store.ts b/src/ops/cutover-store.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c09c4fcea833c7139d41e524f352989168665176
--- /dev/null
+++ b/src/ops/cutover-store.ts
@@ -0,0 +1,28 @@
+import type { Kysely } from 'kysely';
+import { migrationPlan } from '../db/migrator.js';
+import { CutoverRepository } from '../db/repositories/cutover-repository.js';
+import { RoleAuthorizationRepository } from '../db/repositories/role-authorization-repository.js';
+import type { DB } from '../db/types.js';
+import type { CutoverStore } from './cutover-check.js';
+
+/**
+ * What the cutover check reads of the database (`cutover-check-cli.ts`, in a read-only
+ * transaction), from a database of any shape: a legacy one, a Pine one, an empty one, one whose
+ * table names Windows lower-cased. A table it lacks gives nothing, never an error.
+ */
+// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a legacy database as a Pine one
+export function databaseStore(db: Kysely<any>): CutoverStore {
+  const cutover = new CutoverRepository(db);
+  return {
+    migrationPlan: () => migrationPlan(db),
+    guilds: () => cutover.servers(),
+    regionRows: () => cutover.regions(),
+    selfRoles: () => cutover.selfRoles(),
+    // The legacy tables are there before the takeover and after it, until the final cleanup
+    // drops them; a database without them has no restrictions to carry over.
+    legacyRestrictions: async () =>
+      (await cutover.hasTables('CommandRoleAuthorization', 'CommandRoles', 'Guild'))
+        ? new RoleAuthorizationRepository(db as Kysely<DB>).list()
+        : [],
+  };
+}
diff --git a/src/ops/emoji-upload.ts b/src/ops/emoji-upload.ts
index fa37a025ac725740b95319b3692295fcff499560..78adad6044d1bf9af877858ec181b7bfe764827b 100644
--- a/src/ops/emoji-upload.ts
+++ b/src/ops/emoji-upload.ts
@@ -97,7 +97,10 @@ export interface EmojiRest {
 }
 
 /** The emoji names of the application, as Discord lists them. */
-export async function applicationEmojiNames(rest: EmojiRest, appId: string): Promise<string[]> {
+export async function applicationEmojiNames(
+  rest: Pick<EmojiRest, 'get'>,
+  appId: string,
+): Promise<string[]> {
   const listed = (await rest.get(Routes.applicationEmojis(appId))) as {
     items: APIApplicationEmoji[];
   };
diff --git a/src/ops/permissions.test.ts b/src/ops/permissions.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5f609f46571a96336e6a04808eacc24890f9c929
--- /dev/null
+++ b/src/ops/permissions.test.ts
@@ -0,0 +1,96 @@
+import { OverwriteType, PermissionFlagsBits as P } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  basePermissions,
+  channelPermissions,
+  missingNeeds,
+  REGION_CHANNEL_NEEDS,
+  SERVER_NEEDS,
+} from './permissions.js';
+
+const GUILD = '100000000000000001';
+const BOT = '200000000000000001';
+const BOT_ROLE = '300000000000000001';
+const MOD_ROLE = '300000000000000002';
+
+const bits = (...flags: bigint[]): string => String(flags.reduce((all, flag) => all | flag, 0n));
+
+const roles = [
+  { id: GUILD, name: '@everyone', permissions: bits(P.ViewChannel, P.SendMessages), position: 0 },
+  { id: BOT_ROLE, name: 'Pine', permissions: bits(P.ManageChannels, P.ManageRoles), position: 5 },
+  { id: MOD_ROLE, name: 'Mods', permissions: bits(P.Administrator), position: 9 },
+];
+const guild = { id: GUILD, ownerId: '200000000000000099' };
+const bot = { id: BOT, roleIds: [BOT_ROLE] };
+
+describe('basePermissions', () => {
+  it("joins the everyone role's permissions with the member's roles", () => {
+    const base = basePermissions(guild, roles, bot);
+    expect(base).toBe(P.ViewChannel | P.SendMessages | P.ManageChannels | P.ManageRoles);
+  });
+
+  it('gives everything to an administrator and to the owner', () => {
+    const all = basePermissions(guild, roles, { id: BOT, roleIds: [MOD_ROLE] });
+    expect(all & P.ManageThreads).toBe(P.ManageThreads);
+    const owner = basePermissions(guild, roles, { id: guild.ownerId, roleIds: [] });
+    expect(owner & P.BanMembers).toBe(P.BanMembers);
+  });
+});
+
+describe('channelPermissions', () => {
+  const base = basePermissions(guild, roles, bot);
+
+  it('applies the overwrites of everyone, then the roles, then the member', () => {
+    const overwrites = [
+      {
+        id: GUILD,
+        type: OverwriteType.Role,
+        allow: '0',
+        deny: bits(P.ViewChannel, P.SendMessages),
+      },
+      { id: BOT_ROLE, type: OverwriteType.Role, allow: bits(P.ViewChannel), deny: '0' },
+      { id: BOT, type: OverwriteType.Member, allow: bits(P.EmbedLinks), deny: bits(P.ManageRoles) },
+    ];
+    const channel = channelPermissions(base, GUILD, bot, overwrites);
+    expect(channel & P.ViewChannel).toBe(P.ViewChannel);
+    expect(channel & P.SendMessages).toBe(0n);
+    expect(channel & P.EmbedLinks).toBe(P.EmbedLinks);
+    expect(channel & P.ManageRoles).toBe(0n);
+  });
+
+  it("lets a role's allowance beat another role's denial", () => {
+    const overwrites = [
+      { id: BOT_ROLE, type: OverwriteType.Role, allow: bits(P.SendMessages), deny: '0' },
+      { id: MOD_ROLE, type: OverwriteType.Role, allow: '0', deny: bits(P.SendMessages) },
+    ];
+    const both = { id: BOT, roleIds: [BOT_ROLE, MOD_ROLE] };
+    // The administrator role makes everything allowed whatever the overwrites say.
+    expect(channelPermissions(basePermissions(guild, roles, both), GUILD, both, overwrites)).toBe(
+      basePermissions(guild, roles, both),
+    );
+    const plain = roles.map((role) =>
+      role.id === MOD_ROLE ? { ...role, permissions: '0' } : role,
+    );
+    const base2 = basePermissions(guild, plain, both);
+    expect(channelPermissions(base2, GUILD, both, overwrites) & P.SendMessages).toBe(
+      P.SendMessages,
+    );
+  });
+});
+
+describe('missingNeeds', () => {
+  it('names what the bot lacks, required and optional apart', () => {
+    const missing = missingNeeds(P.ViewChannel | P.SendMessages, REGION_CHANNEL_NEEDS);
+    expect(missing.required.map((need) => need.name)).toEqual([
+      'Embed Links',
+      'Attach Files',
+      'Read Message History',
+    ]);
+    expect(missing.optional.map((need) => need.name)).toEqual(['Add Reactions', 'Manage Messages']);
+  });
+
+  it('finds nothing missing for an administrator', () => {
+    const all = basePermissions(guild, roles, { id: BOT, roleIds: [MOD_ROLE] });
+    expect(missingNeeds(all, SERVER_NEEDS)).toEqual({ required: [], optional: [] });
+  });
+});
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cb53a6ba88d725d3227924e70f52fee7e73c9970
--- /dev/null
+++ b/src/ops/permissions.ts
@@ -0,0 +1,186 @@
+import { OverwriteType, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
+
+/*
+ * The bot's permissions as Discord computes them, from what its REST API gives (the server's
+ * roles, the bot's member, a channel's overwrites), for the cutover check, which works without
+ * the gateway and so without discord.js's caches. And what the bot needs, taken from what the
+ * code asks of Discord (`PartyGateway` and the services over it).
+ */
+
+/** A role as `GET /guilds/{id}` lists it. */
+export interface ApiRole {
+  id: string;
+  name: string;
+  /** The permission bits as a decimal string. */
+  permissions: string;
+  position: number;
+}
+
+/** A permission overwrite as a channel of `GET /guilds/{id}/channels` lists it. */
+export interface ApiOverwrite {
+  id: string;
+  type: OverwriteType;
+  allow: string;
+  deny: string;
+}
+
+/** A member: who, and the roles they hold (not the server's everyone role). */
+export interface ApiMember {
+  id: string;
+  roleIds: readonly string[];
+}
+
+const ALL = PermissionsBitField.All;
+
+/** The member's permissions in the server: everyone's and their roles'; all for the owner or an administrator. */
+export function basePermissions(
+  guild: { id: string; ownerId: string },
+  roles: readonly ApiRole[],
+  member: ApiMember,
+): bigint {
+  if (member.id === guild.ownerId) return ALL;
+  let permissions = BigInt(roles.find((role) => role.id === guild.id)?.permissions ?? '0');
+  for (const roleId of member.roleIds) {
+    permissions |= BigInt(roles.find((role) => role.id === roleId)?.permissions ?? '0');
+  }
+  return (permissions & P.Administrator) === P.Administrator ? ALL : permissions;
+}
+
+/**
+ * The member's permissions in a channel (or a category): the server's, then the overwrite of
+ * everyone, then those of the member's roles together (an allowance beats a denial among them),
+ * then the member's own. An administrator has everything.
+ */
+export function channelPermissions(
+  base: bigint,
+  guildId: string,
+  member: ApiMember,
+  overwrites: readonly ApiOverwrite[],
+): bigint {
+  if ((base & P.Administrator) === P.Administrator) return ALL;
+  let permissions = base;
+  const everyone = overwrites.find((one) => one.id === guildId);
+  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);
+  let allow = 0n;
+  let deny = 0n;
+  for (const one of overwrites) {
+    if (one.type !== OverwriteType.Role || one.id === guildId) continue;
+    if (!member.roleIds.includes(one.id)) continue;
+    allow |= BigInt(one.allow);
+    deny |= BigInt(one.deny);
+  }
+  permissions = (permissions & ~deny) | allow;
+  const own = overwrites.find((one) => one.type === OverwriteType.Member && one.id === member.id);
+  if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);
+  return permissions;
+}
+
+/** A permission the bot needs: its flag, its name in Discord's settings, and what for. */
+export interface Need {
+  flag: bigint;
+  name: string;
+  why: string;
+  /** Without it the bot works, with less: a warning rather than a failure. */
+  optional?: boolean;
+}
+
+const need = (flag: bigint, name: string, why: string, optional?: boolean): Need => ({
+  flag,
+  name,
+  why,
+  ...(optional ? { optional } : {}),
+});
+
+const VIEW = need(P.ViewChannel, 'View Channels', 'everything');
+const SEND = need(P.SendMessages, 'Send Messages', 'posts and messages');
+const EMBED = need(P.EmbedLinks, 'Embed Links', 'copies of posts and links that show their page');
+const ATTACH = need(P.AttachFiles, 'Attach Files', 'map pictures, lists sent as files');
+const HISTORY = need(P.ReadMessageHistory, 'Read Message History', 'replies, the cleanup');
+const MANAGE_CHANNELS = need(
+  P.ManageChannels,
+  'Manage Channels',
+  'the forums of /admin setup-forums and /region, the cleanup of legacy channels',
+);
+const MANAGE_ROLES = need(
+  P.ManageRoles,
+  'Manage Roles',
+  'self-assigned roles; in a channel, Manage Permissions: who may see and post in a forum',
+);
+const MANAGE_THREADS = need(
+  P.ManageThreads,
+  'Manage Threads',
+  'archiving, locking, renaming and pinning posts',
+);
+const THREADS = need(P.SendMessagesInThreads, 'Send Messages in Threads', 'messages in posts');
+const REACT = need(P.AddReactions, 'Add Reactions', 'the marks on a screenshot it reads', true);
+const EXTERNAL = need(
+  P.UseExternalEmojis,
+  'Use External Emojis',
+  "other servers' emoji where the application has none of a name",
+  true,
+);
+
+/** What the bot needs in the server as a whole (its roles). */
+export const SERVER_NEEDS: readonly Need[] = [
+  VIEW,
+  SEND,
+  THREADS,
+  EMBED,
+  ATTACH,
+  HISTORY,
+  MANAGE_CHANNELS,
+  MANAGE_ROLES,
+  MANAGE_THREADS,
+  REACT,
+  EXTERNAL,
+];
+
+/** What it needs in a region's channel: the link to a new post, spawn reports, screenshot replies. */
+export const REGION_CHANNEL_NEEDS: readonly Need[] = [
+  VIEW,
+  SEND,
+  EMBED,
+  ATTACH,
+  HISTORY,
+  REACT,
+  need(
+    P.ManageMessages,
+    'Manage Messages',
+    'taking a screenshot away once it is a raid (src/discord/screenshot-message.ts)',
+    true,
+  ),
+];
+
+/**
+ * What it needs in a channel it announces in or copies posts to (bot-updates, the moderators'
+ * channel, Unown sightings, the elite and remote raid channels).
+ */
+export const ANNOUNCE_NEEDS: readonly Need[] = [VIEW, SEND, EMBED, ATTACH];
+
+/**
+ * What it needs in a region's forum, and in the category the forum is made in (a new forum
+ * takes the category's overwrites): posts, their messages, archiving them, who may see them.
+ */
+export const FORUM_NEEDS: readonly Need[] = [
+  VIEW,
+  SEND,
+  THREADS,
+  EMBED,
+  ATTACH,
+  HISTORY,
+  MANAGE_CHANNELS,
+  MANAGE_ROLES,
+  MANAGE_THREADS,
+];
+
+/** The needs that `permissions` lack, the required apart from the optional. */
+export function missingNeeds(
+  permissions: bigint,
+  needs: readonly Need[],
+): { required: Need[]; optional: Need[] } {
+  const missing = needs.filter((one) => (permissions & one.flag) !== one.flag);
+  return {
+    required: missing.filter((one) => !one.optional),
+    optional: missing.filter((one) => one.optional),
+  };
+}
diff --git a/test/support/fake-discord-api.ts b/test/support/fake-discord-api.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2d3c6ca127a97c88b93fc0973bd77e1c4a778db9
--- /dev/null
+++ b/test/support/fake-discord-api.ts
@@ -0,0 +1,247 @@
+import { ChannelType, DiscordAPIError, OverwriteType, PermissionFlagsBits as P } from 'discord.js';
+import type { ApiOverwrite, ApiRole } from '../../src/ops/permissions.js';
+
+/** One request made of the fake API. */
+export interface ApiRequest {
+  method: 'GET' | 'DELETE';
+  route: string;
+  /** The query, as `key=value&…`, where there was one. */
+  query?: string;
+  reason?: string;
+}
+
+export interface FakeApiChannel {
+  id: string;
+  name: string;
+  type: ChannelType;
+  parentId: string | null;
+  overwrites: ApiOverwrite[];
+  /** The authors of its messages, oldest first. */
+  messages: string[];
+  /** The bot may not read its messages (Discord answers 403, Missing Access). */
+  unreadable?: boolean;
+}
+
+export interface FakeApiGuild {
+  id: string;
+  name: string;
+  ownerId: string;
+  roles: ApiRole[];
+  /** The roles of each member, by user id. */
+  members: Map<string, string[]>;
+  channels: FakeApiChannel[];
+}
+
+/** The bot's own ids in the fake. */
+export const FAKE_APP_ID = '400000000000000777';
+export const FAKE_BOT_ID = '400000000000000777';
+
+let nextId = 700000000000000000n;
+/** A made-up snowflake, new at every call. */
+export function fakeSnowflake(): string {
+  nextId += 1n;
+  return String(nextId);
+}
+
+/** Discord's error as discord.js throws it. */
+export function apiError(
+  status: number,
+  code: number,
+  message: string,
+  method: string,
+  route: string,
+): DiscordAPIError {
+  return new DiscordAPIError({ code, message }, code, status, method, route, {});
+}
+
+/**
+ * Discord's REST API as the cutover tools read it (the application, the bot's servers, their
+ * roles, members, channels and the oldest message of a channel) and as the legacy cleanup
+ * deletes channels, over an in-memory model. Every request is recorded; a route it does not know
+ * is answered 404, as Discord would, and a deleted channel is gone (10003, Unknown Channel).
+ */
+export class FakeDiscordApi {
+  readonly requests: ApiRequest[] = [];
+  readonly guilds = new Map<string, FakeApiGuild>();
+  application = { id: FAKE_APP_ID, name: 'Professor Pine', flags: 0 };
+  bot = { id: FAKE_BOT_ID, username: 'Professor Pine' };
+  /** The names of the application's emoji. */
+  emoji: string[] = [];
+  /** Every request fails with this error from now on (Discord down, a bad token). */
+  failWith: Error | undefined;
+  /** Routes answered with an error of their own (a GET of one server that fails). */
+  readonly refused = new Map<string, Error>();
+  /** Channels deleted, in order. */
+  readonly deleted: string[] = [];
+
+  addGuild(name: string, ownerId = fakeSnowflake()): FakeApiGuild {
+    const id = fakeSnowflake();
+    const guild: FakeApiGuild = {
+      id,
+      name,
+      ownerId,
+      roles: [{ id, name: '@everyone', permissions: '0', position: 0 }],
+      members: new Map(),
+      channels: [],
+    };
+    this.guilds.set(id, guild);
+    return guild;
+  }
+
+  addRole(guild: FakeApiGuild, name: string, ...flags: bigint[]): string {
+    const id = fakeSnowflake();
+    guild.roles.push({
+      id,
+      name,
+      permissions: String(flags.reduce((all, flag) => all | flag, 0n)),
+      position: guild.roles.length,
+    });
+    return id;
+  }
+
+  addChannel(
+    guild: FakeApiGuild,
+    name: string,
+    options: {
+      type?: ChannelType;
+      parentId?: string | null;
+      overwrites?: ApiOverwrite[];
+      messages?: string[];
+    } = {},
+  ): FakeApiChannel {
+    const channel: FakeApiChannel = {
+      id: fakeSnowflake(),
+      name,
+      type: options.type ?? ChannelType.GuildText,
+      parentId: options.parentId ?? null,
+      overwrites: options.overwrites ?? [],
+      messages: options.messages ?? [],
+    };
+    guild.channels.push(channel);
+    return channel;
+  }
+
+  channel(id: string): FakeApiChannel | undefined {
+    for (const guild of this.guilds.values()) {
+      const found = guild.channels.find((channel) => channel.id === id);
+      if (found) return found;
+    }
+    return undefined;
+  }
+
+  get(route: `/${string}`, options: { query?: URLSearchParams } = {}): Promise<unknown> {
+    const query = options.query?.toString();
+    this.requests.push({ method: 'GET', route, ...(query ? { query } : {}) });
+    if (this.failWith) return Promise.reject(this.failWith);
+    const refusal = this.refused.get(route);
+    if (refusal) return Promise.reject(refusal);
+    // A throw of the answer becomes the rejection, as an error of Discord would.
+    return Promise.resolve().then(() => this.answer(route, options.query));
+  }
+
+  delete(route: `/${string}`, options: { reason?: string } = {}): Promise<unknown> {
+    this.requests.push({
+      method: 'DELETE',
+      route,
+      ...(options.reason === undefined ? {} : { reason: options.reason }),
+    });
+    if (this.failWith) return Promise.reject(this.failWith);
+    const match = /^\/channels\/(\d+)$/.exec(route);
+    if (!match?.[1]) return Promise.reject(apiError(404, 0, '404: Not Found', 'DELETE', route));
+    for (const guild of this.guilds.values()) {
+      const index = guild.channels.findIndex((channel) => channel.id === match[1]);
+      if (index < 0) continue;
+      const [gone] = guild.channels.splice(index, 1);
+      this.deleted.push(match[1]);
+      return Promise.resolve({ id: gone?.id });
+    }
+    return Promise.reject(apiError(404, 10003, 'Unknown Channel', 'DELETE', route));
+  }
+
+  /** Whether every request so far only read. */
+  onlyRead(): boolean {
+    return this.requests.every((request) => request.method === 'GET');
+  }
+
+  private guildOf(id: string | undefined, route: string): FakeApiGuild {
+    const guild = id === undefined ? undefined : this.guilds.get(id);
+    if (!guild) throw apiError(404, 10004, 'Unknown Guild', 'GET', route);
+    return guild;
+  }
+
+  private answer(route: string, query: URLSearchParams | undefined): unknown {
+    if (route === '/applications/@me') return { ...this.application };
+    if (route === `/applications/${this.application.id}/emojis`) {
+      return { items: this.emoji.map((name, i) => ({ id: String(i + 1), name })) };
+    }
+    if (route === '/users/@me') return { ...this.bot };
+    if (route === '/users/@me/guilds') {
+      return [...this.guilds.values()]
+        .filter((guild) => guild.members.has(this.bot.id))
+        .map((guild) => ({ id: guild.id, name: guild.name }));
+    }
+    let match = /^\/guilds\/(\d+)$/.exec(route);
+    if (match) {
+      const guild = this.guildOf(match[1], route);
+      return { id: guild.id, name: guild.name, owner_id: guild.ownerId, roles: guild.roles };
+    }
+    match = /^\/guilds\/(\d+)\/members\/(\d+)$/.exec(route);
+    if (match) {
+      const guild = this.guildOf(match[1], route);
+      const roles = guild.members.get(match[2] ?? '');
+      if (!roles) throw apiError(404, 10007, 'Unknown Member', 'GET', route);
+      return { user: { id: match[2] }, roles };
+    }
+    match = /^\/guilds\/(\d+)\/channels$/.exec(route);
+    if (match) {
+      const guild = this.guildOf(match[1], route);
+      return guild.channels.map((channel) => ({
+        id: channel.id,
+        name: channel.name,
+        type: channel.type,
+        parent_id: channel.parentId,
+        permission_overwrites: channel.overwrites,
+      }));
+    }
+    match = /^\/channels\/(\d+)\/messages$/.exec(route);
+    if (match) {
+      const channel = this.channel(match[1] ?? '');
+      if (!channel) throw apiError(404, 10003, 'Unknown Channel', 'GET', route);
+      if (channel.unreadable) throw apiError(403, 50001, 'Missing Access', 'GET', route);
+      // Only the question for the oldest message is known: `after=0&limit=1`.
+      if (query?.get('after') !== '0' || query.get('limit') !== '1') {
+        throw new Error(`the fake answers only after=0&limit=1, not ${query?.toString() ?? ''}`);
+      }
+      const first = channel.messages[0];
+      return first === undefined ? [] : [{ id: `${channel.id}-1`, author: { id: first } }];
+    }
+    throw apiError(404, 0, '404: Not Found', 'GET', route);
+  }
+}
+
+/** Everything the bot asks for in a server, as one role's permissions. */
+export const BOT_PERMISSIONS = [
+  P.ViewChannel,
+  P.SendMessages,
+  P.SendMessagesInThreads,
+  P.EmbedLinks,
+  P.AttachFiles,
+  P.ReadMessageHistory,
+  P.ManageChannels,
+  P.ManageRoles,
+  P.ManageThreads,
+  P.ManageMessages,
+  P.AddReactions,
+  P.UseExternalEmojis,
+];
+
+/** An overwrite of a role or a member. */
+export function overwrite(
+  id: string,
+  allow: readonly bigint[],
+  deny: readonly bigint[] = [],
+  type: OverwriteType = OverwriteType.Role,
+): ApiOverwrite {
+  const bits = (flags: readonly bigint[]) => String(flags.reduce((all, flag) => all | flag, 0n));
+  return { id, type, allow: bits(allow), deny: bits(deny) };
+}
````

### Task 4: Plan 8C T4: rehearsal mode, so that a rehearsal with the production token shows members nothing

Prototype commit: `e4a3fc635c88500d76c16ed99a56643d83e44a71`

The setting rehearsal ({ allowlist, regions, staffRoles }; src/services/rehearsal.ts) turns
it on:
- RehearsalDms passes direct messages to the allowlist only; the others are dropped, and one
  line a minute says how many.
- rehearsalGateway wraps the party gateway: a message goes only into the post of a party in
  a rehearsed forum, a post only into such a forum, a forum only beside a rehearsed region's
  channel. So no announcement reaches a channel, whoever sends it: the boss list and its
  staleness warning, gym and Wayfarer announcements, the link to a new post in its region's
  channel, copies in the remote and elite channels, spawn reports and their Unown copies.
- Outside the posts of the rehearsed forums every answer is private (each reply, deferral
  and follow-up made ephemeral); /request is refused (it would file a real GitHub issue).
- The router answers only the allowlist and staff (Manage Server, Administrator, a role of
  staffRoles), everybody else with a short refusal; the screenshot trigger reads nothing
  (it would react and answer in the channel).
- /admin setup-forums makes forums only for the rehearsed regions, hidden before anything is
  posted in them: a new forum is made hidden (one that cannot be is not made), one that is
  there gets its overwrites set as a whole (hiddenForumOverwrites: what it took over from its
  category is replaced, so no role the category lets in sees it), and one that cannot be
  hidden gets nothing posted. The fake gateway computes who sees a forum from its overwrites
  and the members' roles.
- /region makes, renames, moves or deletes no channel (members would see it): an import that
  would create a channel and a removal that would delete the forum are refused with a
  sentence; outlines alone and a removal that keeps the forum go on.
- deploy-commands --rehearsal registers the commands as guild commands of the servers of
  Guild that the bot is in (named first; a registration that fails is said and the others
  go on, sendDeploy), each with Manage Server as its default permission, and refuses --global and
  --guild while the mode is on; --clear-guild takes them away (deployPlan); ./pine passes
  both through, starting the database for them.
- The Unown want given to a holder of the old role is still given to members the rehearsal
  does not answer: it is written to the throwaway copy of the database only.
- The start logs a warning, the heartbeat carries rehearsal: true and every health line ends
  with "REHEARSAL MODE IS ON", and the owner gets an alert of its own at every start.

**Files:**

```
 CLAUDE.md                                  |   2 +-
 docs/architecture/discord-framework.md     |   2 +-
 docs/architecture/notifications-and-dms.md |   2 +-
 docs/architecture/operations.md            |   3 +-
 docs/architecture/testing.md               |   2 +-
 pine                                       |  10 ++-
 src/app-context.ts                         |   7 ++
 src/app.ts                                 |  44 ++++++++++--
 src/commands/admin/setup-forums.test.ts    |  24 ++++++-
 src/commands/admin/setup-forums.ts         |  17 ++++-
 src/commands/regions/import.test.ts        |  17 ++++-
 src/commands/regions/import.ts             |   8 +++
 src/commands/regions/remove.test.ts        |  19 ++++-
 src/commands/regions/remove.ts             |   2 +
 src/commands/regions/shared.ts             |   9 +++
 src/commands/screenshots/mention.test.ts   |  16 +++++
 src/commands/screenshots/mention.ts        |   3 +
 src/commands/util/request.test.ts          |  10 +++
 src/commands/util/request.ts               |  11 ++-
 src/config/settings.test.ts                |  28 ++++++++
 src/config/settings.ts                     |  17 +++++
 src/discord/deploy-cli.ts                  |  61 +++++++++++++---
 src/discord/deploy.test.ts                 | 144 +++++++++++++++++++++++++++++++++++++
 src/discord/deploy.ts                      | 158 ++++++++++++++++++++++++++++++++++++++---
 src/discord/party-gateway.ts               | 128 +++++++++++++++++++++++++++++++++
 src/discord/router.test.ts                 |  66 +++++++++++++++++
 src/discord/router.ts                      |  92 +++++++++++++++++++++++-
 src/index.ts                               |   5 ++
 src/ops/health.test.ts                     |  12 ++++
 src/ops/health.ts                          |  15 +++-
 src/ops/heartbeat.test.ts                  |  13 ++++
 src/ops/heartbeat.ts                       |   3 +
 src/ops/owner-alerts.ts                    |   9 ++-
 src/services/party-service.test.ts         | 108 +++++++++++++++++++++++++++-
 src/services/party-service.ts              |  52 ++++++++++++--
 src/services/rehearsal.test.ts             | 149 +++++++++++++++++++++++++++++++++++++++
 src/services/rehearsal.ts                  | 187 +++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/fake-gateway.ts               | 104 ++++++++++++++++++++++++++-
 test/support/region-commands.ts            |   4 +-
 39 files changed, 1514 insertions(+), 49 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/admin/setup-forums.test.ts src/commands/regions/import.test.ts src/commands/regions/remove.test.ts src/commands/screenshots/mention.test.ts src/commands/util/request.test.ts src/config/settings.test.ts src/discord/deploy.test.ts src/discord/router.test.ts src/ops/health.test.ts src/ops/heartbeat.test.ts src/services/party-service.test.ts src/services/rehearsal.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e4a3fc635c88500d76c16ed99a56643d83e44a71 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8C T4: rehearsal mode, so that a rehearsal with the production token shows members nothing`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/architecture/discord-framework.md docs/architecture/notifications-and-dms.md docs/architecture/operations.md docs/architecture/testing.md pine src/app-context.ts src/app.ts src/commands/admin/setup-forums.test.ts src/commands/admin/setup-forums.ts src/commands/regions/import.test.ts src/commands/regions/import.ts src/commands/regions/remove.test.ts src/commands/regions/remove.ts src/commands/regions/shared.ts src/commands/screenshots/mention.test.ts src/commands/screenshots/mention.ts src/commands/util/request.test.ts src/commands/util/request.ts src/config/settings.test.ts src/config/settings.ts src/discord/deploy-cli.ts src/discord/deploy.test.ts src/discord/deploy.ts src/discord/party-gateway.ts src/discord/router.test.ts src/discord/router.ts src/index.ts src/ops/health.test.ts src/ops/health.ts src/ops/heartbeat.test.ts src/ops/heartbeat.ts src/ops/owner-alerts.ts src/services/party-service.test.ts src/services/party-service.ts src/services/rehearsal.test.ts src/services/rehearsal.ts test/support/fake-gateway.ts test/support/region-commands.ts`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index a71ff9aebd05c9b2d6976264c8189e32fbcdb274..d74aab2ae77752d96aac844eaba4c23c0b637502 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -77,7 +77,7 @@ The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with
 ./pine migrate               # the migrations in a one-off container, without the bot (no Discord)
 ./pine backup                # a verified backup now, into BACKUP_DIR (which needs its .pine-backups file)
 ./pine restore <dump> --no-start [--replace [--no-backup]]   # load a legacy or Pine dump (.sql or .sql.gz), lower-case tables renamed; without --no-start on a terminal, or with --start, it logs the bot in
-./pine deploy-commands [--global | --guild <id>]   # contacts Discord: only when Matt asks
+./pine deploy-commands [--global | --guild <id> | --rehearsal | --clear-guild]   # contacts Discord: only when Matt asks (--rehearsal: in rehearsal mode, the database's servers, staff only; --clear-guild removes them)
 ./pine update | shell        # backup, git pull, rebuild, restart (logs the bot in: only when Matt asks); a shell in the bot's container
 ./pine convert-settings <legacy data folder> [--out <folder>] [--force]   # pine-settings.json and env-from-legacy.txt (.env lines) from a legacy installation (reads its private settings: Matt runs it)
 ./pine cutover-check         # the cutover's go / no-go: database, permissions, forums, settings, emoji (reads Discord's REST API): only when Matt asks
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 49f01d3d16dc3e01baa538d5c59664a1c0b559b3..0d524b4b70c33697ce3b182fc34b332ae4b67c4b 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -14,7 +14,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 ## The router and deferral
 
-- The router's order is guards, throttle, deferral, `execute`. A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
+- The router's order is guards, throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 
 ## Controls and how a press answers
 
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 91455816538a4b5044f9e2701e51d9d2dfa4fd29..c11c4a04a9754364656c397004a179710a3c2b84 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -17,7 +17,7 @@ What members ask to be told about (wants, gym targets, new trains, boss-set), ho
 
 ## Sending direct messages
 
-- Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn`, `normal` (raid wants, gym targets, new trains), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`).
+- Direct messages go out only through `DmSender` (`src/services/dm-sender.ts`; the app's is `QueuedDmSender`): `send(job)` puts a message in line and returns, never waits for Discord and never throws. A timer starts at most one send every 100 ms, five on their way at most; priorities are `DM_PRIORITY.urgent` (meeting times, boss-set), `spawn`, `normal` (raid wants, gym targets, new trains), the oldest event first within one; a job carries `eventAt` and `expiresAt` and is dropped once that has passed. There is no retry (discord.js waits out a 429), a pause of a minute when Discord refuses to open DM channels, an hour's memory of members who take no DMs, and a log line with the numbers of every burst. Never loop over recipients and send: the legacy bot lost its gateway connection that way. Tests use `RecordingDms` or `QueuedDmSender` over `FakeDmGateway` (`test/support/dms.ts`, `pullUntilIdle`). In rehearsal mode the members' sender is `RehearsalDms` over the queue: only the allowlist is written to (`operations.md`).
 - A DM of the notifier is a components-v2 message rendered by `src/render/notify-dm.ts` (`notifyDm`, the sentences, `stopHint`; plan 8B-1): one container, the news (its sentence first, for a phone's preview, without an address) with the party's brief and picture (`PartyBrief`, `spawnBrief`), a row of link buttons (`Go to post` by `postLink`, never `<#post>`; a raid's `Map`; `Go to report` for a spawn), then "You asked to be told about" and one section per reason with a `Stop` button beside it, as many as the message has room for beside its links and picture (`stopButtonRoom`; the rest are named in `stopHint`). `DmJob.message` is an `OutgoingMessage`. The meeting-time DM stays plain text. Their custom ids are `dm:<server>:stop:<what>` (`stopArgs` / `parseStopArgs`; documented in `custom-id.ts`; a want whose id would not fit gets no button and the DM names `/unwant`). The handler (`src/components/dm.ts`) removes the presser's own want or gym target in that server or switches the setting off, keeps nothing in memory, and shows the pressed button as a disabled `Stopped` (same custom id; `withStopped`) on a v2 DM, or takes it off (`withoutButton`) on a classic DM sent before 8B-1 (told apart by the message's `IsComponentsV2` flag).
 
 ## Spawn reports
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index e908a64113de5e28ef6ca32f9c57b47d4ad76144..d272b8292bb7b5b08cd093f577fd7ea43ec81574 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -29,7 +29,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 ## Health
 
 - No listener: the bot writes `var/health/status.json` every thirty seconds from the start of `startApp` on (`Heartbeat`, `src/ops/heartbeat.ts`): when; the phase, `starting` until the login to Discord begins (`loggingIn`), then `running`; since when the client is connected to Discord or not; whether the database answered `select 1` within ten seconds. Connected means every shard of `client.ws.shards` is `Ready` and Discord acknowledged its heartbeat within three minutes (`gatewayConnected`): never `client.ws.status`, which discord.js sets to ready once and never back. Written whole (a temporary file renamed). The heartbeat stops just before the database pool closes at shutdown.
-- `node dist/ops/health-cli.js` reads it and prints one line, its kind first (`healthLine`: `healthy`, `starting`, `stale`, `missing`, `unreadable`, `slow-start`, `gateway`, `database`), and exits 0 or 1 (`healthVerdict`, `src/ops/health.ts`): unhealthy when the file is missing or older than 90 seconds (a stuck or stopped bot), when the database did not answer the last check, when Discord has been away for more than two minutes after the login began, or when the start has taken more than half an hour. A start with a fresh heartbeat is healthy however long its migrations take. It is the healthcheck of `pine` (every 30 s, 3 retries, a start period of ten minutes) and a line of `./pine status`. A later rehearsal mode adds its own field to the file and says it there.
+- `node dist/ops/health-cli.js` reads it and prints one line, its kind first (`healthLine`: `healthy`, `starting`, `stale`, `missing`, `unreadable`, `slow-start`, `gateway`, `database`), and exits 0 or 1 (`healthVerdict`, `src/ops/health.ts`): unhealthy when the file is missing or older than 90 seconds (a stuck or stopped bot), when the database did not answer the last check, when Discord has been away for more than two minutes after the login began, or when the start has taken more than half an hour. A start with a fresh heartbeat is healthy however long its migrations take. It is the healthcheck of `pine` (every 30 s, 3 retries, a start period of ten minutes) and a line of `./pine status`. In rehearsal mode the file has `rehearsal: true` and every line ends with "; REHEARSAL MODE IS ON" (the kind at its start is unchanged, so the watchdog reads it as before).
 - `Lifecycle` (`src/ops/lifecycle.ts`) holds the process's signals and unhandled errors from the first line of `src/index.ts` on. A SIGTERM or SIGINT during the start ends it after the step under way, never in the middle of the migrations (`startCheckpoint`, `src/ops/start-stop.ts`), cleanly: no crash marker is left; a repeat only logs that the step is still finishing (Docker's grace still bounds it). After the start a signal shuts down cleanly and a repeat exits at once. An uncaught exception or unhandled rejection during the start ends it with the owner's alert (`could not start`); after the start an exception ends the run after the shutdown, a rejection is logged.
 
 ## Alerts to the owner
@@ -67,6 +67,7 @@ The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/s
 
 - `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address, Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
 - `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; the servers of `Guild` the bot is in; per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
+- **Rehearsal mode** (`settings.rehearsal`: `allowlist` of member ids, `regions` by their channels' names, `staffRoles` by name; `src/services/rehearsal.ts`) runs the bot with a production token against a copy of the production database while the legacy bot is off for a short while, and nothing of it may reach members (spec 2, anti-goals). While it is set: `RehearsalDms` passes direct messages to the allowlist only (the others are dropped, and one line a minute says how many); `rehearsalGateway` wraps the party gateway so that a message goes only into the post of a party in a rehearsed forum, a post only into such a forum and a forum only beside a rehearsed region's channel (everything else is dropped and logged: the boss list's announcements and staleness warnings, the gym and Wayfarer announcements, the link to a new post in its region's channel, the copies in the remote and elite channels, spawn reports and their Unown copies, so also any announcement added later); the router answers only the allowlist and staff (Manage Server, Administrator or a role of `staffRoles`) and everybody else with `REHEARSAL_REFUSAL`; outside the posts of the rehearsed forums every answer is private (`answeredInRehearsal`: each reply, deferral and follow-up gets the Ephemeral flag), so that no channel shows a command's answer; `/request` is refused (`REQUEST_IN_REHEARSAL`: it would file a real GitHub issue); the screenshot trigger reads nothing (it reacts and answers in the channel; the testers use `/raid` with a screenshot); `/admin setup-forums` makes forums only for the rehearsed regions and hides them before anything is posted in them: a new forum is made hidden (`createForum` with `hidden`; a forum that cannot be made so is not made), one that is there gets its overwrites set as a whole (`PartyGateway.hideForum`, `hiddenForumOverwrites`: every overwrite it had, also those taken over from its category, replaced; View Channel and Send Messages denied to everyone, the bot allowed, the staff roles by name and every role that may manage the server allowed, and each allowlisted member with one permission more than an admission, so that `dismissMember` leaves it), and a forum that cannot be hidden gets nothing posted; the fake gateway computes who sees a forum from its overwrites and the members' roles (`src/ops/permissions.ts`); `/admin cleanup-legacy` only lists. `./pine deploy-commands --rehearsal` registers the commands as the commands of the servers of `Guild` that the bot is in (`GET /users/@me/guilds`; each named before anything is sent, those it is not in left out; a registration that fails is said and the others go on, `sendDeploy`), every one with Manage Server as its default permission (an admin lets the testers in under Server Settings > Integrations), and refuses `--global` / `--guild` while the mode is on; `--clear-guild` takes them away at the end (`deployPlan`, `src/discord/deploy.ts`). The start logs a warning, the heartbeat carries `rehearsal: true` and every health line (so `./pine status`) ends with "REHEARSAL MODE IS ON", and the owner gets an alert (`REHEARSAL_ALERT`) at every start. `/region` makes, renames, moves or deletes no channel (`REHEARSAL_CHANNELS`, `src/commands/regions/shared.ts`): an import that would create a channel, and a removal that would delete the forum, are refused with that sentence; outlines alone and a removal that keeps the forum go on. The Unown want a holder of the old role is given (`UnownWantService.noticed`) is still given to a member the rehearsal does not answer: it is written to the copy of the database only, which the night replaces with a fresh dump.
 
 ## Open items
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 8aa83e195bb8abc8380ead8779deaf6eb4fc2540..255811202fe557c3e0ffd3c325cf389bd0e8605a 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -23,7 +23,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Parties
 
 - Party tests build raids with `testRaid()` / `withAttendees()` and a store with `partyStoreWith()` (`test/support/parties.ts`); its in-memory storage rejects a party that would not survive the real state document. Raid events in tests come from `test/support/raid-events.ts`.
-- Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise (`canSee`, `admitted`, `barred`, `leftServer`); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
+- Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel) (`canSee`, `admitted`, `barred`, `leftServer`); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
 - Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
 ## Trains
diff --git a/pine b/pine
index 26bfd68555582bb8e0db2ce9ddc24a99b71477be..655071d8fce3a2d04ee25fe39cea09ccfc5d5d2b 100755
--- a/pine
+++ b/pine
@@ -120,8 +120,10 @@ Usage: ./pine <command>
                      load a dump (.sql or .sql.gz; legacy or Pine) into the stack's database;
                      --replace drops a database that has tables, after a verified backup of it;
                      then the stack starts (logging the bot in) on a terminal or with --start
-  deploy-commands [--global | --guild <id>]
-                     register the slash commands with Discord (everywhere by default)
+  deploy-commands [--global | --guild <id> | --rehearsal | --clear-guild]
+                     register the slash commands with Discord (everywhere by default); in
+                     rehearsal mode --rehearsal, in the database's servers for staff only;
+                     --clear-guild takes those away again
   update             back up the database, then fetch the newest code (git pull), rebuild
                      and restart what changed (nothing when there is nothing new)
   convert-settings <legacy data folder> [--out <folder>] [--force]
@@ -252,6 +254,10 @@ cmd_deploy_commands() {
   need_stack
   [ $# -gt 0 ] || set -- --global
   build_image
+  # The rehearsal's registration and its removal are for the servers of the database.
+  case $1 in
+    --rehearsal | --clear-guild) start_database ;;
+  esac
   say "Registering the slash commands with Discord ($*)."
   run run --rm --no-deps pine node --enable-source-maps dist/discord/deploy-cli.js "$@"
 }
diff --git a/src/app-context.ts b/src/app-context.ts
index cae5dd419a9a383fab84fff6e93f5c1373732e26..bb75c55e18a7cad8e571d7cd33ddd8a3c37f3036 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -37,6 +37,7 @@ import type { TimedPartyService } from './services/timed-party-service.js';
 import type { TrainService } from './services/train-service.js';
 import type { WayfarerImportService } from './services/wayfarer-import-service.js';
 import type { WayfarerReviewService } from './services/wayfarer-review-service.js';
+import type { Rehearsal } from './services/rehearsal.js';
 import type { LoginLinks } from './web/login-links.js';
 
 /** Everything a handler may use. Later phases add services here. */
@@ -121,4 +122,10 @@ export interface AppContext {
   readonly loginLinks: LoginLinks;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
+  /**
+   * Rehearsal mode (`settings.rehearsal`), or nothing when it is off: the router answers only
+   * its allowlist and staff, `/admin setup-forums` makes only its regions' forums, and the
+   * cleanup of legacy channels only lists.
+   */
+  readonly rehearsal?: Rehearsal;
 }
diff --git a/src/app.ts b/src/app.ts
index 1e427e9a733873565ea90454400f8ed39cede14b..713b39680e164fc3667bc81559fde86027b756a5 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -85,6 +85,12 @@ import { RegionDirectory } from './services/region-directory.js';
 import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
 import { StaticMaps } from './services/static-maps.js';
+import {
+  RehearsalDms,
+  rehearsalGateway,
+  rehearsalOf,
+  rehearsalPosts,
+} from './services/rehearsal.js';
 import { healthFiles } from './ops/health.js';
 import { gatewayConnected, Heartbeat } from './ops/heartbeat.js';
 import { startCheckpoint } from './ops/start-stop.js';
@@ -131,13 +137,21 @@ export interface StartOptions {
 export async function startApp(
   rawEnv: Record<string, string | undefined>,
   options: StartOptions = {},
-): Promise<{ log: Logger; shutdown: () => Promise<void> }> {
+): Promise<{ log: Logger; shutdown: () => Promise<void>; rehearsal: boolean }> {
   const config = loadConfig(rawEnv);
   const log = createLogger({
     level: config.env.LOG_LEVEL,
     pretty: config.env.NODE_ENV === 'development',
   });
   for (const warning of configWarnings(rawEnv, config.settings)) log.warn(warning);
+  // Rehearsal mode (settings.rehearsal): said loudly, so that it is never left on by accident.
+  const rehearsal = rehearsalOf(config.settings);
+  if (rehearsal) {
+    log.warn(
+      { allowlist: rehearsal.settings.allowlist.length, regions: rehearsal.settings.regions },
+      'REHEARSAL MODE IS ON: direct messages only to the allowlist, no announcements, only staff and the allowlist answered, forums only for the rehearsed regions',
+    );
+  }
   const db = createDb<DB>(dbConfigFrom(config.env));
   // The bot's health for the Docker stack's check (`var/health/status.json`), from here on, so
   // that a slow start (migrations, the game data's first download) shows as alive.
@@ -147,6 +161,7 @@ export async function startApp(
       await sql`select 1`.execute(db);
     },
     log,
+    rehearsal: rehearsal !== undefined,
   });
   heartbeat.start();
 
@@ -190,7 +205,20 @@ export async function startApp(
   const regionRepository = new RegionRepository(db);
   const regions = new RegionDirectory({ regions: regionRepository, log });
   const parties = new PartyStore({ storage: new PartyRepository(db), log });
-  const partyGateway = new DiscordPartyGateway(log);
+  const discordGateway = new DiscordPartyGateway(log);
+  // In rehearsal mode nothing is posted but into the posts of parties in the rehearsed forums.
+  const partyGateway = rehearsal
+    ? rehearsalGateway(
+        discordGateway,
+        rehearsalPosts({
+          rehearsal,
+          byPost: (postId) => parties.byPost(postId),
+          regions: () => regions.all(),
+          channelName: (channelId) => discordGateway.channelName(channelId),
+        }),
+        log,
+      )
+    : discordGateway;
   // The bot's own emoji (types, weather, teams), looked for before a server's.
   const appEmojiSource = new DiscordApplicationEmoji();
   const appEmoji = new ApplicationEmoji(appEmojiSource, log);
@@ -214,6 +242,8 @@ export async function startApp(
   });
   const dmGateway = new DiscordDmGateway();
   const dms = new QueuedDmSender({ gateway: dmGateway, log });
+  // In rehearsal mode only the allowlist is written to; the queue itself is drained at shutdown.
+  const memberDms = rehearsal ? new RehearsalDms(dms, rehearsal, log) : dms;
   // Listens to the store: whoever signs up for a party in a forum they cannot see is let in.
   const access = new AccessService({
     store: parties,
@@ -241,6 +271,7 @@ export async function startApp(
     appEmoji,
     settings: config.settings,
     log,
+    ...(rehearsal ? { rehearsal } : {}),
   });
   // The posts are shown anew with the application's emoji once they are read, or change.
   appEmoji.onChange(() => {
@@ -262,7 +293,7 @@ export async function startApp(
     newTrains,
     users,
     members,
-    dms,
+    dms: memberDms,
     guilds,
     regions,
     gyms,
@@ -540,7 +571,7 @@ export async function startApp(
     members,
     selfRoles,
     spawns,
-    dms,
+    dms: memberDms,
     pokemon,
     nicknames: pokemon,
     maps,
@@ -570,6 +601,7 @@ export async function startApp(
     }),
     emoji: emojiFinder(appEmoji, appEmojiSource),
     features: requested,
+    ...(rehearsal ? { rehearsal } : {}),
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
   // said in the log of the start, and the help of `/wild` names the ones it does.
@@ -597,7 +629,7 @@ export async function startApp(
     create: createClient,
     configure(client) {
       heartbeat.loggingIn(() => gatewayConnected(client.ws.shards, Date.now()));
-      partyGateway.use(client);
+      discordGateway.use(client);
       appEmojiSource.use(client);
       members.use(client);
       roleGateway.use(client);
@@ -797,5 +829,5 @@ export async function startApp(
   );
   // Attached only after login: during the intent fallback a rejected login also closes the shard.
   attachGatewayHandlers(client, log, (reason) => options.onFatal?.(shutdown, reason));
-  return { log, shutdown };
+  return { log, shutdown, rehearsal: rehearsal !== undefined };
 }
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index 8085b8edb9a8016126a440107ab9a4b0b5d93be7..4179d38915f30963c4e86dd394aacb581ca2267e 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -17,16 +17,19 @@ import { TEST_SETTINGS_PATH } from '../../../test/support/test-settings.js';
 import { loadSettings, type Settings } from '../../config/settings.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { FORUM_TAGS } from '../../render/party-post.js';
+import { Rehearsal } from '../../services/rehearsal.js';
 import { admin } from './index.js';
 
-async function setup(changed: Partial<Settings> = {}) {
+async function setup(changed: Partial<Settings> = {}, rehearsal?: Rehearsal) {
   const made = await partyServiceWith([], {
     settings: { ...loadSettings(TEST_SETTINGS_PATH), ...changed },
+    ...(rehearsal ? { rehearsal } : {}),
   });
   const { ctx } = createTestContext({
     partyService: made.service,
     parties: made.store,
     regions: made.regions,
+    ...(rehearsal ? { rehearsal } : {}),
   });
   const router = new InteractionRouter(ctx, [admin], []);
   const run = async (roleNames: string[] = ['Admin']) => {
@@ -45,6 +48,25 @@ const NEWLINE = String.fromCharCode(10);
 const background = watchEachTest();
 
 describe('/admin setup-forums', () => {
+  it('makes in rehearsal mode only the forums of its regions, hidden, and says so', async () => {
+    const rehearsal = new Rehearsal({
+      allowlist: ['200000000000000002'],
+      regions: ['north'],
+      staffRoles: ['Moderator'],
+    });
+    const { run, gateway, regions } = await setup({}, rehearsal);
+    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
+    // Staff by the rehearsal's own staff role: anybody else is not answered.
+    const interaction = await run(['Admin', 'Moderator']);
+    const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
+    expect(gateway.hidden.has(north)).toBe(true);
+    expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
+    expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of active raids, hid it from all but staff and the testers.`,
+      'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
+    ]);
+  });
+
   it('gives every region its forum, tags and pinned summary, and says what it did', async () => {
     const { run, gateway, regions } = await setup();
     gateway.channelNames.set(UNBOUNDED_CHANNEL, 'north');
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index 998173d460fc84cd840510f50e6ede68b7ab9831..f7273f00c1384180a7cbdd3ceae4e25ca86c21ea 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -25,12 +25,22 @@ function line(result: ForumSetup): string {
     ...(result.renamed ? ['renamed it'] : []),
     ...(result.posting === 'reserved' ? ['closed it to posts by members'] : []),
     ...(result.summary ? ['posted and pinned the list of active raids'] : []),
+    ...(result.hidden === 'hidden' ? ['hid it from all but staff and the testers'] : []),
   ];
   const open =
     result.posting === 'not-allowed'
       ? ' I could not close it to posts by members (I need Manage Permissions and Send Messages there; see the log).'
       : '';
-  return `<#${region.channelId}>: ${what.join(', ')}.${open}`;
+  const seen =
+    result.hidden === 'not-allowed'
+      ? ' I could not hide it from members for the rehearsal (I need Manage Permissions there; see the log): hide it by hand.'
+      : '';
+  return `<#${region.channelId}>: ${what.join(', ')}.${open}${seen}`;
+}
+
+/** The closing line in rehearsal mode: which regions get a forum, and who sees it. */
+function rehearsalLine(regions: readonly string[]): string {
+  return `Rehearsal mode: only the regions ${regions.join(', ')} get a forum, which only staff and the testers see.`;
 }
 
 /**
@@ -76,7 +86,10 @@ export const setupForums: SubcommandPart = {
       ctx.log.warn({ err }, 'could not list the forums that parties name');
       return [];
     });
-    const closing = orphans.length === 0 ? [] : [orphanLine(orphans)];
+    const closing = [
+      ...(orphans.length === 0 ? [] : [orphanLine(orphans)]),
+      ...(ctx.rehearsal ? [rehearsalLine(ctx.rehearsal.settings.regions)] : []),
+    ];
     if (results.length === 0) {
       await interaction.editReply({
         content: ['This server has no regions yet.', ...closing].join('\n'),
diff --git a/src/commands/regions/import.test.ts b/src/commands/regions/import.test.ts
index 3576b3129653254e967d441e456f31fe8e0db920..ec6f9ca37af059161d1a046fc9344c3d4a50d28d 100644
--- a/src/commands/regions/import.test.ts
+++ b/src/commands/regions/import.test.ts
@@ -17,6 +17,7 @@ import {
 } from '../../../test/support/region-admin.js';
 import {
   MEMBER,
+  MODERATOR,
   regionCommandsWith,
   regionListed,
   regionSaid,
@@ -25,7 +26,8 @@ import type { SentPayload } from '../../../test/support/fake-interactions.js';
 import { writeKml } from '../../domain/geo/kml.js';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
 import { MAX_KML_BYTES } from './import.js';
-import { PENDING_MINUTES, pendingRegions } from './shared.js';
+import { Rehearsal } from '../../services/rehearsal.js';
+import { PENDING_MINUTES, pendingRegions, REHEARSAL_CHANNELS } from './shared.js';
 
 type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
 
@@ -125,6 +127,19 @@ describe('/region import: the preview', () => {
     expect(made.gateway.createdChannels).toEqual([]);
   });
 
+  it('refuses in rehearsal mode a file that would create channels, and takes outlines alone', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] });
+    const made = await regionCommandsWith([], { rehearsal });
+    const { answer } = await importing(made, [
+      area('West', WEST_HALF_RING),
+      area('River Side', squareRing(41, -81, 41.1, -80.9)),
+    ]);
+    expect(regionSaid(answer)).toBe(REHEARSAL_CHANNELS);
+    expect(made.gateway.createdChannels).toEqual([]);
+    const outlines = await importing(made, [area('West', WEST_HALF_RING)]);
+    expect(buttonsOf(outlines.answer).map(([label]) => label)[1]).toBe('Cancel');
+  });
+
   it('offers only what needs no creation where it may not create channels, and says why', async () => {
     const made = await regionCommandsWith();
     made.gateway.noCreating.add(made.gateway.guildId);
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index c5875e3393567fffa45dd5e7e3ce921bac53e70d..c1182e5f7a4c7f88915b2005d4938343a0946509 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -40,6 +40,7 @@ import {
   button,
   pendingRegions,
   REGION_COLOUR,
+  REHEARSAL_CHANNELS,
   regionStaff,
   selfRoleReminder,
   type ButtonAnswer,
@@ -643,6 +644,7 @@ export const importRegions: SubcommandPart = {
           'the channel.',
       );
     }
+    if (ctx.rehearsal && makesChannels(preview.imports)) throw new UserError(REHEARSAL_CHANNELS);
     const channelNames = new Map(
       ctx.regionAdmin.channelsOf(staff).map((channel) => [channel.id, channel.name]),
     );
@@ -673,6 +675,11 @@ export const importRegions: SubcommandPart = {
   },
 };
 
+/** Whether an import would make channels (of a new region, and its category). */
+function makesChannels(imports: readonly PlannedImport[]): boolean {
+  return imports.some((one) => 'create' in one.channel);
+}
+
 /**
  * Import was pressed under the preview. Everything is looked at again by the service (the
  * preview may be minutes old), and the answer says what was really done; it takes the place of
@@ -681,6 +688,7 @@ export const importRegions: SubcommandPart = {
 export const importAnswers: Readonly<Record<string, ButtonAnswer>> = {
   'import:import': async (interaction, ctx, request) => {
     if (request.what !== 'import') return;
+    if (ctx.rehearsal && makesChannels(request.imports)) throw new UserError(REHEARSAL_CHANNELS);
     const staff = await regionStaff(interaction, ctx);
     const outcome = await ctx.regionAdmin.import(staff, request.imports);
     try {
diff --git a/src/commands/regions/remove.test.ts b/src/commands/regions/remove.test.ts
index 4d109fae3647463f1e8710af9f19c5b5bda95200..7dfdd9066913cdf752d97d61391b60df8d57424e 100644
--- a/src/commands/regions/remove.test.ts
+++ b/src/commands/regions/remove.test.ts
@@ -11,7 +11,14 @@ import {
   WEST_FORUM,
 } from '../../../test/support/gyms.js';
 import { ALICE, REPORTER } from '../../../test/support/parties.js';
-import { MEMBER, regionCommandsWith, regionSaid } from '../../../test/support/region-commands.js';
+import {
+  MEMBER,
+  MODERATOR,
+  regionCommandsWith,
+  regionSaid,
+} from '../../../test/support/region-commands.js';
+import { Rehearsal } from '../../services/rehearsal.js';
+import { REHEARSAL_CHANNELS } from './shared.js';
 import { PartyStatus } from '../../domain/party/status.js';
 
 type Made = Awaited<ReturnType<typeof regionCommandsWith>>;
@@ -295,6 +302,16 @@ describe('/region remove: staff without Manage Channels', () => {
     expect(buttonsOf(answer).map(([label]) => label)).toEqual(['Remove, keep the forum', 'Cancel']);
   });
 
+  it('refuses in rehearsal mode to delete the forum, and removes nothing', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [MODERATOR], regions: ['west'], staffRoles: [] });
+    const made = await regionCommandsWith([], { rehearsal });
+    const question = answerOf(await made.use('remove', { region: 'id:1' }));
+    const pressed = await made.press(buttonId(question, 'Remove and delete the forum'));
+    expect(regionSaid(answerOf(pressed))).toBe(REHEARSAL_CHANNELS);
+    expect(made.regions.byId(1)).toBeDefined();
+    expect(made.gateway.deletedChannels).toEqual([]);
+  });
+
   it('refuses to delete the forum for them, whatever button they send', async () => {
     const made = await regionCommandsWith();
     const question = answerOf(await made.use('remove', { region: 'id:1' }));
diff --git a/src/commands/regions/remove.ts b/src/commands/regions/remove.ts
index 6a9e62c1857f64876a6c4b3a0a247136b30007c7..bdf0a049a86ce4035accb20c7b24c3cec806d02a 100644
--- a/src/commands/regions/remove.ts
+++ b/src/commands/regions/remove.ts
@@ -12,6 +12,7 @@ import {
   pendingRegions,
   regionQuestion,
   REGION_GONE,
+  REHEARSAL_CHANNELS,
   regionInSentence,
   regionStaff,
   selfRoleReminder,
@@ -197,6 +198,7 @@ const removal =
   (forum: 'keep' | 'delete'): ButtonAnswer =>
   async (interaction, ctx, request) => {
     if (request.what !== 'remove') return;
+    if (forum === 'delete' && ctx.rehearsal) throw new UserError(REHEARSAL_CHANNELS);
     const staff = await regionStaff(interaction, ctx);
     if (forum === 'delete' && !staff.mayManageChannels) {
       throw new UserError(
diff --git a/src/commands/regions/shared.ts b/src/commands/regions/shared.ts
index 50453a0dcba721c5bc6ebf620fd5169bc341ebff..5104116cc58fe317cf5066a4a4493d44b050c2a7 100644
--- a/src/commands/regions/shared.ts
+++ b/src/commands/regions/shared.ts
@@ -101,6 +101,15 @@ export type ButtonAnswer = (
 
 export const EXPIRED = 'That has expired. Use the command again.';
 export const NOT_YOURS = 'That is somebody else’s question.';
+/**
+ * Rehearsal mode (`ctx.rehearsal`): `/region` makes, renames, moves or deletes no channel, which
+ * every member would see. An import of outlines alone, or a removal that keeps the forum, goes on.
+ */
+export const REHEARSAL_CHANNELS =
+  'Rehearsal mode is on: I create, rename, move or delete no channel now, since every member ' +
+  'would see it. Nothing was changed. Outlines of regions that have their channels, and removing ' +
+  'a region while keeping its forum, work as usual.';
+
 /** Also what is said of a region of another server: for this server's staff it is none. */
 export const REGION_GONE = 'That region no longer exists.';
 
diff --git a/src/commands/screenshots/mention.test.ts b/src/commands/screenshots/mention.test.ts
index 0b343627bdc1fecd2dc82ad583274c94ac7b448f..2dddd33a8e4f223d2dc04307f77d42b32d1140e6 100644
--- a/src/commands/screenshots/mention.test.ts
+++ b/src/commands/screenshots/mention.test.ts
@@ -13,6 +13,7 @@ import { InteractionRouter } from '../../discord/router.js';
 import type { ScreenReading } from '../../ocr/screen-reader.js';
 import type { OcrOutcome } from '../../services/ocr-service.js';
 import type { ScreenshotSource } from '../../services/screenshot-service.js';
+import { Rehearsal } from '../../services/rehearsal.js';
 import { screenshotControls } from './feedback.js';
 import {
   DONE,
@@ -77,6 +78,7 @@ async function setup(
     enabled?: boolean;
     questionMs?: number;
     replyMs?: number;
+    rehearsal?: Rehearsal;
   } = {},
 ) {
   const gyms = gymsFixture(options.gyms ?? []);
@@ -98,6 +100,7 @@ async function setup(
     ...base,
     config: { ...base.config, settings: { ...base.config.settings, ocr } },
     features: { ocrPassive: options.passive ?? false, autoAssignRole: false },
+    ...(options.rehearsal ? { rehearsal: options.rehearsal } : {}),
   };
   const trigger = new ScreenshotTrigger({
     ctx,
@@ -137,6 +140,19 @@ describe('screenshots posted with a mention of the bot', () => {
     expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
   });
 
+  it('reads nothing during a rehearsal, not even of its allowlist: it would answer in the channel', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [OTHER], regions: ['west'], staffRoles: [] });
+    const { trigger, image, store } = await setup({ rehearsal });
+    const { message, did } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    expect(did).toEqual([]);
+    expect(store.active()).toEqual([]);
+    const theirs = posted([image('b.png', egg())], { authorId: OTHER });
+    await trigger.handle(theirs.message);
+    expect(theirs.did).toEqual([]);
+    expect(store.active()).toEqual([]);
+  });
+
   it('marks a message that says more than the mention instead of deleting it', async () => {
     const { trigger, image } = await setup();
     const { message, did } = posted([image('a.png', egg())], { bare: false });
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
index 0f7d132154fc5889e7fda5898ee3cd1f359530ba..4118234107c92aa15f9734b59ddd39ad67f0cdee 100644
--- a/src/commands/screenshots/mention.ts
+++ b/src/commands/screenshots/mention.ts
@@ -192,6 +192,9 @@ export class ScreenshotTrigger {
     const { ctx } = this.options;
     if (this.closed || !ctx.config.settings.ocr.enabled) return;
     if (message.authorBot || message.guildId === null || message.inThread) return;
+    // Off in rehearsal mode: it reacts to and answers in a region channel, where every member
+    // would see it. The testers report from a screenshot with /raid, answered privately.
+    if (ctx.rehearsal) return;
     const passive = !message.mentionsBot;
     if (passive && !(ctx.config.settings.ocr.passive && ctx.features.ocrPassive)) return;
     const region = ctx.regions.byChannel(message.channelId);
diff --git a/src/commands/util/request.test.ts b/src/commands/util/request.test.ts
index 971495531741ced519c518e4eed254f21a31bc16..d4ac66a8cbcba25c4e87876fe2e8bf0f7ce79280 100644
--- a/src/commands/util/request.test.ts
+++ b/src/commands/util/request.test.ts
@@ -11,6 +11,8 @@ import { FakeIssues } from '../../../test/support/issues.js';
 import { ALICE, REPORTER } from '../../../test/support/parties.js';
 import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
+import { Rehearsal } from '../../services/rehearsal.js';
+import { REQUEST_IN_REHEARSAL } from './request.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { request } from './request.js';
 
@@ -139,6 +141,14 @@ describe('/request: an issue', () => {
 });
 
 describe('/request: refused before anything is sent', () => {
+  it('in rehearsal mode, which must not file a real issue', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
+    const made = setup({ rehearsal });
+    const used = await made.run({ text: 'Gone', gym: 'id:1' });
+    expect(told(used)).toBe(REQUEST_IN_REHEARSAL);
+    expect(made.issues.opened).toEqual([]);
+  });
+
   it('without a gym outside a post, naming how to say which', async () => {
     const made = setup();
     const used = await made.run({ text: 'Gone' });
diff --git a/src/commands/util/request.ts b/src/commands/util/request.ts
index cc81f470449797de833a1ad91ac725033cd5f0e9..d127ccccba16515dcbe89eaccc5f1b92c381cb1e 100644
--- a/src/commands/util/request.ts
+++ b/src/commands/util/request.ts
@@ -118,6 +118,15 @@ function failureText(outcome: Extract<IssueOutcome, { ok: false }>): string {
  * set). In the post of a raid or train the gym is that of the party; elsewhere the `gym`
  * option says which. The member is told privately whether it was sent.
  */
+/** What /request says in rehearsal mode: it would file a real issue on GitHub. */
+export const REQUEST_IN_REHEARSAL =
+  'Rehearsal mode is on: /request would file a real issue on GitHub, so it is off for now.';
+
+/** Refuses a request in rehearsal mode, before anything is asked of GitHub. */
+const refusedInRehearsal: Guard = (_interaction, ctx) => {
+  if (ctx.rehearsal) throw new UserError(REQUEST_IN_REHEARSAL);
+};
+
 export const request: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('request')
@@ -146,7 +155,7 @@ export const request: SimpleCommand = {
   },
   enabled: (config) =>
     config.env.GITHUB_TOKEN !== undefined && config.env.GITHUB_REPO !== undefined,
-  guards: [requireGuild, requireRequest],
+  guards: [refusedInRehearsal, requireGuild, requireRequest],
   defer: 'ephemeral',
   throttle: REQUEST_THROTTLE,
   async execute(interaction, ctx) {
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index c58090ee6bd29fe785135e358474374c041b3bed..2d06db1230d2459582068e2da44cb433f2028c17 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -42,6 +42,34 @@ describe('loadSettings', () => {
     expect(settings.helpGroups).not.toContain('silph');
   });
 
+  it('has no rehearsal unless the file sets one, and takes one with its members and regions', () => {
+    expect(loadSettings(REPO_SETTINGS).rehearsal).toBeUndefined();
+    const rehearsal = loadSettings(
+      writeSettings((s) => {
+        s.rehearsal = { allowlist: ['412345678901234567'], regions: ['squirrelbreeze'] };
+      }),
+    ).rehearsal;
+    expect(rehearsal).toEqual({
+      allowlist: ['412345678901234567'],
+      regions: ['squirrelbreeze'],
+      staffRoles: [],
+    });
+    for (const wrong of [
+      { allowlist: [], regions: ['squirrelbreeze'] },
+      { allowlist: ['matt'], regions: ['squirrelbreeze'] },
+      { allowlist: ['412345678901234567'], regions: [] },
+      { allowlist: ['412345678901234567'], regions: ['x'], everyone: true },
+    ]) {
+      expect(() =>
+        loadSettings(
+          writeSettings((s) => {
+            s.rehearsal = wrong;
+          }),
+        ),
+      ).toThrow(ConfigError);
+    }
+  });
+
   it('takes the reader settings it knows and refuses others', () => {
     const ocr = (more: Record<string, unknown>) =>
       writeSettings((s) => {
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 144cd3ea1ee58e265fefb6a2c8a03431a026c6d4..5db77876f221b3ea32e55e3a9fcf12055ee62bd1 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -190,6 +190,23 @@ export const settingsSchema = z.strictObject({
       tiles: z.enum(['osm', 'google']).default('osm'),
     })
     .optional(),
+  /**
+   * Rehearsal mode (plan 8C): the bot runs with a production token against a copy of the
+   * production database while the legacy bot is off for a short while, and members must see
+   * nothing of it. While it is set: direct messages go only to `allowlist`; nothing is posted
+   * but into the posts of parties (no announcements, links in region channels, copies, spawn
+   * reports); only `allowlist` and staff (Manage Server, or a role of `staffRoles`) are answered;
+   * `/admin setup-forums` makes forums only for the regions whose channels `regions` names, seen
+   * only by staff and `allowlist`; and the cleanup of legacy channels only lists. Shown in the
+   * log, the health line and an alert to the owner at the start. Absent: off.
+   */
+  rehearsal: z
+    .strictObject({
+      allowlist: z.array(z.string().regex(/^\d{17,20}$/u, 'must be a Discord ID')).min(1),
+      regions: z.array(z.string().min(1)).min(1),
+      staffRoles: z.array(z.string().min(1)).default([]),
+    })
+    .optional(),
   timezone: z
     .string()
     .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
diff --git a/src/discord/deploy-cli.ts b/src/discord/deploy-cli.ts
index 32ad167ab8922b03df2fe459c6ef7af4a3f0213e..ac07ec150534a8912e4e6a5f22437fad31cc746e 100644
--- a/src/discord/deploy-cli.ts
+++ b/src/discord/deploy-cli.ts
@@ -1,20 +1,61 @@
 import { REST, Routes } from 'discord.js';
 import { commands } from '../commands/index.js';
 import { loadConfig } from '../config/index.js';
+import { dbConfigFrom } from '../db/db-config.js';
+import { createDb } from '../db/kysely.js';
+import { CutoverRepository } from '../db/repositories/cutover-repository.js';
 import { enabledCommands } from './command.js';
-import { buildCommandPayload, parseDeployArgs } from './deploy.js';
+import {
+  buildCommandPayload,
+  deployPlan,
+  deployServers,
+  parseDeployArgs,
+  sendDeploy,
+} from './deploy.js';
 
+// Registers the slash commands with Discord (`./pine deploy-commands`, `npm run deploy-commands`):
+//   --global | --guild <id>        everywhere, or in one server (refused in rehearsal mode)
+//   --rehearsal                    rehearsal mode: in the servers of the database the bot is in,
+//                                  for staff only
+//   --clear-guild                  the commands of those servers taken away
+// A registration that fails is said and the others go on; the exit status is then 1.
 const config = loadConfig(process.env);
 const { env } = config;
 const target = parseDeployArgs(process.argv.slice(2));
-const body = buildCommandPayload(enabledCommands(commands, config));
 const rest = new REST().setToken(env.DISCORD_TOKEN);
-const route =
-  target.scope === 'guild'
-    ? Routes.applicationGuildCommands(env.DISCORD_APP_ID, target.guildId)
-    : Routes.applicationCommands(env.DISCORD_APP_ID);
+const say = (line: string) => process.stdout.write(`${line}\n`);
 
-await rest.put(route, { body });
-process.stdout.write(
-  `Registered ${body.length} command(s) ${target.scope === 'guild' ? `in guild ${target.guildId}` : 'globally'}.\n`,
-);
+/**
+ * The servers of the database (`Guild`) that the bot is in, read only where the target needs
+ * them; said before anything is sent, with those the bot is not in.
+ */
+async function servers(): Promise<string[]> {
+  if (target.scope !== 'rehearsal' && target.scope !== 'clear') return [];
+  const db = createDb<unknown>(dbConfigFrom(env));
+  let inDatabase: string[];
+  try {
+    inDatabase = await new CutoverRepository(db).servers();
+  } finally {
+    await db.destroy();
+  }
+  const joined = (await rest.get(Routes.userGuilds())) as { id: string; name: string }[];
+  const { servers: found, absent } = deployServers(inDatabase, joined);
+  for (const id of found) {
+    say(`Server ${id} (${joined.find((one) => one.id === id)?.name ?? '?'}): the bot is in it.`);
+  }
+  for (const id of absent)
+    say(`Server ${id}: in the database, but the bot is not in it: left out.`);
+  return found;
+}
+
+const plan = deployPlan(target, {
+  appId: env.DISCORD_APP_ID,
+  body: buildCommandPayload(enabledCommands(commands, config)),
+  rehearsal: config.settings.rehearsal !== undefined,
+  servers: await servers(),
+});
+if (!plan.ok) {
+  process.stderr.write(`${plan.refusal}\n`);
+  process.exit(1);
+}
+process.exitCode = await sendDeploy(rest, plan.requests, say);
diff --git a/src/discord/deploy.test.ts b/src/discord/deploy.test.ts
index 00360fef3aaabfe8ad7828a760f1d762924090f1..33136215146db8c7e05f7a7c10d752cb379e9094 100644
--- a/src/discord/deploy.test.ts
+++ b/src/discord/deploy.test.ts
@@ -1,6 +1,7 @@
 import {
   ApplicationIntegrationType,
   InteractionContextType,
+  PermissionFlagsBits,
   SlashCommandBuilder,
 } from 'discord.js';
 import { describe, expect, it } from 'vitest';
@@ -9,6 +10,9 @@ import { commands } from '../commands/index.js';
 import { enabledCommands, type CommandModule } from './command.js';
 import {
   buildCommandPayload,
+  deployPlan,
+  deployServers,
+  sendDeploy,
   MAX_COMMAND_CHARACTERS,
   MAX_COMMANDS,
   parseDeployArgs,
@@ -154,5 +158,145 @@ describe('parseDeployArgs', () => {
     expect(() => parseDeployArgs(['--guild', '412345678901234567', '--global'])).toThrow(
       /--guild <id> or --global/,
     );
+    expect(() => parseDeployArgs(['--rehearsal', '--clear-guild'])).toThrow(/--rehearsal/);
+  });
+
+  it('parses --rehearsal and --clear-guild', () => {
+    expect(parseDeployArgs(['--rehearsal'])).toEqual({ scope: 'rehearsal' });
+    expect(parseDeployArgs(['--clear-guild'])).toEqual({ scope: 'clear' });
+  });
+});
+
+describe('deployPlan', () => {
+  const APP = '400000000000000777';
+  const HOME = '412345678901234567';
+  const AWAY = '412345678901234568';
+  const body = buildCommandPayload([
+    stub('raid'),
+    {
+      ...stub('admin'),
+      data: {
+        name: 'admin',
+        toJSON: () => ({ name: 'admin', description: 'admin', default_member_permissions: '8' }),
+      },
+    },
+  ]);
+
+  it('registers everywhere, or in one server, while rehearsal mode is off', () => {
+    expect(
+      deployPlan({ scope: 'global' }, { appId: APP, body, rehearsal: false, servers: [] }),
+    ).toEqual({
+      ok: true,
+      requests: [{ route: `/applications/${APP}/commands`, body, what: 'everywhere' }],
+    });
+    expect(
+      deployPlan(
+        { scope: 'guild', guildId: HOME },
+        { appId: APP, body, rehearsal: false, servers: [] },
+      ),
+    ).toMatchObject({
+      ok: true,
+      requests: [{ route: `/applications/${APP}/guilds/${HOME}/commands` }],
+    });
+  });
+
+  it('refuses to register for all while rehearsal mode is on, and --rehearsal while it is off', () => {
+    for (const target of [{ scope: 'global' }, { scope: 'guild', guildId: HOME }] as const) {
+      const plan = deployPlan(target, { appId: APP, body, rehearsal: true, servers: [HOME] });
+      expect(plan).toMatchObject({
+        ok: false,
+        refusal: expect.stringMatching(/--rehearsal/) as string,
+      });
+    }
+    expect(
+      deployPlan({ scope: 'rehearsal' }, { appId: APP, body, rehearsal: false, servers: [HOME] }),
+    ).toMatchObject({ ok: false, refusal: expect.stringMatching(/settings\.rehearsal/) as string });
+  });
+
+  it('registers in rehearsal mode in the servers of the database, every command for staff only', () => {
+    const plan = deployPlan(
+      { scope: 'rehearsal' },
+      { appId: APP, body, rehearsal: true, servers: [HOME, AWAY] },
+    );
+    if (!plan.ok) throw new Error(plan.refusal);
+    expect(plan.requests.map((request) => request.route)).toEqual([
+      `/applications/${APP}/guilds/${HOME}/commands`,
+      `/applications/${APP}/guilds/${AWAY}/commands`,
+    ]);
+    const sentBody = plan.requests[0]?.body ?? [];
+    expect(sentBody.map((command) => [command.name, command.default_member_permissions])).toEqual([
+      ['raid', String(PermissionFlagsBits.ManageGuild)],
+      ['admin', '8'],
+    ]);
+  });
+
+  it('takes the commands of the servers of the database away with --clear-guild', () => {
+    const plan = deployPlan(
+      { scope: 'clear' },
+      { appId: APP, body, rehearsal: true, servers: [HOME] },
+    );
+    expect(plan).toEqual({
+      ok: true,
+      requests: [
+        {
+          route: `/applications/${APP}/guilds/${HOME}/commands`,
+          body: [],
+          what: `in server ${HOME}`,
+        },
+      ],
+    });
+    expect(
+      deployPlan({ scope: 'clear' }, { appId: APP, body, rehearsal: false, servers: [] }),
+    ).toMatchObject({
+      ok: false,
+    });
+  });
+});
+
+describe('deployServers', () => {
+  it('takes the servers of the database that the bot is in, and names those it is not in', () => {
+    expect(
+      deployServers(
+        ['412345678901234567', '412345678901234568'],
+        [{ id: '412345678901234568', name: 'Away' }],
+      ),
+    ).toEqual({ servers: ['412345678901234568'], absent: ['412345678901234567'] });
+  });
+});
+
+describe('sendDeploy', () => {
+  it('sends each registration, says each, and goes on past one that fails', async () => {
+    const said: string[] = [];
+    const sent: string[] = [];
+    const rest = {
+      put(route: string): Promise<unknown> {
+        sent.push(route);
+        return route.includes('412345678901234567')
+          ? Promise.reject(new Error('403: Missing Access'))
+          : Promise.resolve([]);
+      },
+    };
+    const status = await sendDeploy(
+      rest,
+      [
+        {
+          route: '/applications/1/guilds/412345678901234567/commands',
+          body: [],
+          what: 'in server 412345678901234567',
+        },
+        {
+          route: '/applications/1/guilds/412345678901234568/commands',
+          body: [],
+          what: 'in server 412345678901234568',
+        },
+      ],
+      (line) => said.push(line),
+    );
+    expect(status).toBe(1);
+    expect(sent).toHaveLength(2);
+    expect(said).toEqual([
+      'Could not remove the commands in server 412345678901234567: 403: Missing Access',
+      'Removed the commands in server 412345678901234568.',
+    ]);
   });
 });
diff --git a/src/discord/deploy.ts b/src/discord/deploy.ts
index c7b0698e62b56e2e5861739620652723e2ae1682..99718b71cd30781b4e9b6278b3f9fff89034d176 100644
--- a/src/discord/deploy.ts
+++ b/src/discord/deploy.ts
@@ -1,6 +1,8 @@
 import {
   ApplicationIntegrationType,
   InteractionContextType,
+  PermissionFlagsBits,
+  Routes,
   type RESTPostAPIChatInputApplicationCommandsJSONBody,
 } from 'discord.js';
 import type { CommandModule } from './command.js';
@@ -39,17 +41,157 @@ export function buildCommandPayload(
   });
 }
 
-export function parseDeployArgs(
-  argv: readonly string[],
-): { scope: 'global' } | { scope: 'guild'; guildId: string } {
-  const usage = new Error('Usage: npm run deploy-commands -- --guild <id> or --global');
+/**
+ * Where the commands are registered: everywhere (`--global`), in one server (`--guild <id>`), in
+ * rehearsal mode in the servers of the database for staff only (`--rehearsal`), or taken away
+ * from the servers of the database (`--clear-guild`, the end of a rehearsal).
+ */
+export type DeployTarget =
+  | { scope: 'global' }
+  | { scope: 'guild'; guildId: string }
+  | { scope: 'rehearsal' }
+  | { scope: 'clear' };
+
+export function parseDeployArgs(argv: readonly string[]): DeployTarget {
+  const usage = new Error(
+    'Usage: npm run deploy-commands -- --guild <id> or --global, or --rehearsal or --clear-guild',
+  );
   const guildIndex = argv.indexOf('--guild');
-  const global = argv.includes('--global');
-  if (guildIndex >= 0 && !global) {
+  const scopes = [
+    guildIndex >= 0,
+    argv.includes('--global'),
+    argv.includes('--rehearsal'),
+    argv.includes('--clear-guild'),
+  ];
+  if (scopes.filter(Boolean).length !== 1) throw usage;
+  if (guildIndex >= 0) {
     const guildId = argv[guildIndex + 1];
     if (!guildId || !/^\d{17,20}$/.test(guildId)) throw usage;
     return { scope: 'guild', guildId };
   }
-  if (global && guildIndex < 0) return { scope: 'global' };
-  throw usage;
+  if (argv.includes('--global')) return { scope: 'global' };
+  return argv.includes('--rehearsal') ? { scope: 'rehearsal' } : { scope: 'clear' };
+}
+
+/**
+ * The servers a rehearsal's registration (or its removal) goes to: those of the database that
+ * the bot is in (`GET /users/@me/guilds`, as the cutover check reads them); the others are named.
+ */
+export function deployServers(
+  databaseServers: readonly string[],
+  joined: readonly { id: string; name: string }[],
+): { servers: string[]; absent: string[] } {
+  const ids = new Set(joined.map((one) => one.id));
+  return {
+    servers: databaseServers.filter((id) => ids.has(id)),
+    absent: databaseServers.filter((id) => !ids.has(id)),
+  };
+}
+
+/**
+ * Sends the registrations one after the other, saying each; one that fails is said and the
+ * others go on. Resolves to the exit status: 1 when any failed.
+ */
+export async function sendDeploy(
+  rest: { put(route: `/${string}`, options: { body: unknown }): Promise<unknown> },
+  requests: readonly DeployRequest[],
+  say: (line: string) => void,
+): Promise<number> {
+  let failed = 0;
+  for (const request of requests) {
+    const removing = request.body.length === 0;
+    try {
+      await rest.put(request.route, { body: request.body });
+      say(
+        removing
+          ? `Removed the commands ${request.what}.`
+          : `Registered ${request.body.length} command(s) ${request.what}.`,
+      );
+    } catch (err) {
+      failed++;
+      const reason = err instanceof Error ? err.message : String(err);
+      say(
+        `Could not ${removing ? 'remove the commands' : 'register the commands'} ${request.what}: ${reason}`,
+      );
+    }
+  }
+  return failed > 0 ? 1 : 0;
+}
+
+/** One registration: where, what, and what the deploy script says of it. */
+export interface DeployRequest {
+  route: `/${string}`;
+  body: RESTPostAPIChatInputApplicationCommandsJSONBody[];
+  what: string;
+}
+
+/**
+ * What a deploy sends, or why it refuses: while rehearsal mode is on, the commands are
+ * registered only as the commands of the servers of the database (`servers`) and for staff only
+ * (`default_member_permissions` of Manage Server on every command that has none: an admin lets
+ * the testers in under Server Settings > Integrations), never for everybody; `--rehearsal`
+ * needs the mode. `--clear-guild` takes the commands of those servers away.
+ */
+export function deployPlan(
+  target: DeployTarget,
+  options: {
+    appId: string;
+    body: RESTPostAPIChatInputApplicationCommandsJSONBody[];
+    rehearsal: boolean;
+    servers: readonly string[];
+  },
+): { ok: true; requests: DeployRequest[] } | { ok: false; refusal: string } {
+  const { appId, body, rehearsal, servers } = options;
+  const inServers = (commands: RESTPostAPIChatInputApplicationCommandsJSONBody[]) =>
+    servers.length === 0
+      ? ({ ok: false, refusal: 'The database names no server.' } as const)
+      : ({
+          ok: true,
+          requests: servers.map((guildId) => ({
+            route: Routes.applicationGuildCommands(appId, guildId),
+            body: commands,
+            what: `in server ${guildId}`,
+          })),
+        } as const);
+  switch (target.scope) {
+    case 'clear':
+      return inServers([]);
+    case 'rehearsal':
+      if (!rehearsal) {
+        return {
+          ok: false,
+          refusal:
+            '--rehearsal registers the commands for a rehearsal: it needs rehearsal mode on (settings.rehearsal).',
+        };
+      }
+      return inServers(
+        body.map((command) => ({
+          ...command,
+          default_member_permissions:
+            command.default_member_permissions ?? String(PermissionFlagsBits.ManageGuild),
+        })),
+      );
+    case 'global':
+    case 'guild':
+      if (rehearsal) {
+        return {
+          ok: false,
+          refusal:
+            'Rehearsal mode is on (settings.rehearsal): deploy with --rehearsal, which registers ' +
+            'the commands in the servers of the database for staff only.',
+        };
+      }
+      return {
+        ok: true,
+        requests: [
+          target.scope === 'guild'
+            ? {
+                route: Routes.applicationGuildCommands(appId, target.guildId),
+                body,
+                what: `in server ${target.guildId}`,
+              }
+            : { route: Routes.applicationCommands(appId), body, what: 'everywhere' },
+        ],
+      };
+  }
 }
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index 0b2057d0799858295f2c037c9cf5ed156c345589..d755f5857379570e9c4476487778cdbcf14d6dd1 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -16,6 +16,7 @@ import {
   type Client,
   type ForumChannel,
   type AnyThreadChannel,
+  type Guild,
   type GuildMember,
 } from 'discord.js';
 import type { Logger } from '../log.js';
@@ -99,6 +100,7 @@ export interface PartyGateway {
     regionChannelId: string,
     name: string,
     tagNames: readonly string[],
+    hidden?: ForumAccess,
   ): Promise<{ forumId: string; tags: TagIds } | undefined>;
   /**
    * Leaves the making of posts in a forum to the bot: "Send Messages" (in a forum, the making
@@ -108,6 +110,14 @@ export interface PartyGateway {
    * Send Messages in the forum itself), undefined when the forum is gone.
    */
   reservePosts(forumId: string): Promise<'reserved' | 'was-reserved' | 'not-allowed' | undefined>;
+  /**
+   * Hides a forum from everybody but the bot, staff and these members (rehearsal mode): View
+   * Channel denied to everyone, allowed to the bot, to the roles named and every role that may
+   * manage the server, and to each member (with one permission more than `admitMember` gives,
+   * so that `dismissMember` never takes it away). `not-allowed` when Discord refuses the bot
+   * the change, undefined when the forum is gone.
+   */
+  hideForum(forumId: string, access: ForumAccess): Promise<'hidden' | 'not-allowed' | undefined>;
   /** Gives a forum another name. False when it is gone. */
   renameForum(forumId: string, name: string): Promise<boolean>;
   /** Adds the tags the forum lacks and gives all its tags. Undefined when it is gone. */
@@ -247,6 +257,74 @@ export interface PartyGateway {
   ): Promise<CreatedChannel>;
 }
 
+/** Who may see a hidden forum besides the bot (rehearsal mode): staff roles by name, and members. */
+export interface ForumAccess {
+  roleNames: readonly string[];
+  memberIds: readonly string[];
+}
+
+/** A permission overwrite as Discord takes it whole (`permissionOverwrites.set`). */
+export interface ForumOverwrite {
+  id: string;
+  type: OverwriteType;
+  allow: bigint;
+  deny: bigint;
+}
+
+/**
+ * The overwrites of a forum hidden from all but the bot, staff and some members (rehearsal mode),
+ * as the forum's whole set: every overwrite it had (those it took over from its category
+ * included) is replaced, so that no role the category lets in sees it. Denied to everyone: View
+ * Channel, and Send Messages (posts are the bot's). Allowed: the bot to see and post; the roles
+ * named (by name, as staff roles are compared: trimmed, lower case) and every role that may
+ * manage the server, to see, read and write in posts; each member, as an admission with Add
+ * Reactions more (so that `dismissMember` never takes it away).
+ */
+export function hiddenForumOverwrites(
+  server: {
+    everyoneId: string;
+    botId: string;
+    roles: readonly { id: string; name: string; permissions: bigint }[];
+  },
+  access: ForumAccess,
+): ForumOverwrite[] {
+  const key = (name: string) => name.trim().toLowerCase();
+  const named = new Set(access.roleNames.map(key));
+  const staffBits = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
+  const staff = server.roles.filter(
+    (role) =>
+      role.id !== server.everyoneId &&
+      (named.has(key(role.name)) || (role.permissions & staffBits) !== 0n),
+  );
+  const see = PermissionFlagsBits.ViewChannel;
+  return [
+    {
+      id: server.everyoneId,
+      type: OverwriteType.Role,
+      allow: 0n,
+      deny: see | PermissionFlagsBits.SendMessages,
+    },
+    {
+      id: server.botId,
+      type: OverwriteType.Member,
+      allow: see | PermissionFlagsBits.SendMessages,
+      deny: 0n,
+    },
+    ...staff.map((role) => ({
+      id: role.id,
+      type: OverwriteType.Role,
+      allow: ADMITTED_BITS,
+      deny: 0n,
+    })),
+    ...access.memberIds.map((id) => ({
+      id,
+      type: OverwriteType.Member,
+      allow: ADMITTED_BITS | PermissionFlagsBits.AddReactions,
+      deny: 0n,
+    })),
+  ];
+}
+
 /**
  * What came of creating a channel: the channel as Discord made it (it may write the name
  * differently), or why not. `no-permission`: the bot lacks Manage Channels (in the server, or
@@ -506,10 +584,27 @@ export class DiscordPartyGateway implements PartyGateway {
     return Object.fromEntries(forum.availableTags.map((tag) => [tag.name, tag.id]));
   }
 
+  /** The overwrites that hide a forum of this server (`hiddenForumOverwrites`). */
+  private static hiddenIn(guild: Guild, botId: string, access: ForumAccess): ForumOverwrite[] {
+    return hiddenForumOverwrites(
+      {
+        everyoneId: guild.roles.everyone.id,
+        botId,
+        roles: [...guild.roles.cache.values()].map((role) => ({
+          id: role.id,
+          name: role.name,
+          permissions: role.permissions.bitfield,
+        })),
+      },
+      access,
+    );
+  }
+
   async createForum(
     regionChannelId: string,
     name: string,
     tagNames: readonly string[],
+    hidden?: ForumAccess,
   ): Promise<{ forumId: string; tags: TagIds } | undefined> {
     const region = await this.unlessGone(() => this.client.channels.fetch(regionChannelId));
     if (!region || region.isDMBased() || region.isThread()) return undefined;
@@ -529,6 +624,16 @@ export class DiscordPartyGateway implements PartyGateway {
         parent: region.parentId,
         defaultAutoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
         availableTags: tagNames.map((tag) => ({ name: tag, moderated: true })),
+        // Hidden from its first moment on (rehearsal mode): never seen open, not even briefly.
+        ...(hidden
+          ? {
+              permissionOverwrites: DiscordPartyGateway.hiddenIn(
+                region.guild,
+                this.client.user?.id ?? '',
+                hidden,
+              ),
+            }
+          : {}),
       }),
     );
     // Moved after it once made: a position given at creation does not shift the channels
@@ -577,6 +682,29 @@ export class DiscordPartyGateway implements PartyGateway {
     return 'reserved';
   }
 
+  async hideForum(
+    forumId: string,
+    access: ForumAccess,
+  ): Promise<'hidden' | 'not-allowed' | undefined> {
+    const forum = await this.forum(forumId);
+    if (!forum) return undefined;
+    const me = forum.guild.members.me;
+    if (!me) return 'not-allowed';
+    try {
+      // The whole set at once: an overwrite the forum took over from its category (a role it
+      // lets in) would otherwise outlive the denial to everyone.
+      await forum.permissionOverwrites.set(
+        DiscordPartyGateway.hiddenIn(forum.guild, me.id, access),
+        'Rehearsal: only staff and the testers see this forum',
+      );
+    } catch (err) {
+      if (isMissingPermission(err)) return 'not-allowed';
+      if (hasCode(err, RESTJSONErrorCodes.UnknownChannel)) return undefined;
+      throw err;
+    }
+    return 'hidden';
+  }
+
   async renameForum(forumId: string, name: string): Promise<boolean> {
     const forum = await this.forum(forumId);
     if (!forum) return false;
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 9436347e75e66ae21ea69ddac618e7a597152b42..e4e1c83e5a22521cbdafc886c930f5a1d4f7f9c3 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -19,6 +19,9 @@ import { commandGroup, type SubcommandPart } from './command-group.js';
 import { alsoAs, type ComponentHandler, type Guard, type SimpleCommand } from './command.js';
 import { UserError } from './errors.js';
 import { InteractionRouter, STALE_COMPONENT } from './router.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import type { ChatInputCommandInteraction } from 'discord.js';
+import { Rehearsal, REHEARSAL_REFUSAL } from '../services/rehearsal.js';
 
 const asInteraction = (fake: unknown) => fake as Interaction;
 
@@ -1056,3 +1059,66 @@ describe('InteractionRouter', () => {
     );
   });
 });
+
+describe('InteractionRouter in rehearsal mode', () => {
+  const MATT = '412345678901234501';
+  const rehearsing = () =>
+    createTestContext({
+      rehearsal: new Rehearsal({ allowlist: [MATT], regions: ['west'], staffRoles: ['Moderator'] }),
+    });
+
+  it('answers a member who is neither on the allowlist nor staff with the refusal alone', async () => {
+    const { ctx } = rehearsing();
+    const execute = ran();
+    const cmd = command({ execute });
+    const button = ran();
+    const handler: ComponentHandler = { kind: 'p', button };
+    const router = new InteractionRouter(ctx, [cmd], [handler]);
+    const typed = fakeChatInput({ permissions: PermissionFlagsBits.SendMessages });
+    await router.handle(asInteraction(typed));
+    const pressed = fakeButton({ customId: 'p:1:join' });
+    await router.handle(asInteraction(pressed));
+    expect(execute).not.toHaveBeenCalled();
+    expect(button).not.toHaveBeenCalled();
+    for (const fake of [typed, pressed]) {
+      expect(sent(fake.reply)).toMatchObject({
+        content: REHEARSAL_REFUSAL,
+        flags: MessageFlags.Ephemeral,
+      });
+    }
+    const typing = fakeAutocomplete({ commandName: 'test' });
+    await router.handle(asInteraction(typing));
+    expect(typing.respond).toHaveBeenCalledWith([]);
+  });
+
+  it('answers privately outside the rehearsed forums, and as usual in their posts', async () => {
+    const { ctx } = rehearsing();
+    const execute = vi.fn((interaction: ChatInputCommandInteraction) =>
+      interaction.reply({ content: 'Public' }).then(() => undefined),
+    );
+    const router = new InteractionRouter(ctx, [command({ execute })], []);
+    const outside = fakeChatInput({ userId: MATT, channelId: WEST_CHANNEL });
+    await router.handle(asInteraction(outside));
+    expect(sent(outside.reply).flags).toBe(MessageFlags.Ephemeral);
+    const inPost = fakeChatInput({
+      userId: MATT,
+      channelId: '100000000000000099',
+      thread: { parentId: WEST_FORUM },
+      guildChannelNames: { [WEST_CHANNEL]: 'west' },
+    });
+    await router.handle(asInteraction(inPost));
+    expect(sent(inPost.reply).flags ?? 0).toBe(0);
+  });
+
+  it('answers the allowlist and staff as always', async () => {
+    const { ctx } = rehearsing();
+    const execute = ran();
+    const router = new InteractionRouter(ctx, [command({ execute })], []);
+    await router.handle(asInteraction(fakeChatInput({ userId: MATT })));
+    await router.handle(
+      asInteraction(fakeChatInput({ permissions: PermissionFlagsBits.ManageGuild })),
+    );
+    await router.handle(asInteraction(fakeChatInput({ roleNames: ['Moderator'] })));
+    expect(execute).toHaveBeenCalledTimes(3);
+  });
+});
diff --git a/src/discord/router.ts b/src/discord/router.ts
index f1415b78a50618937d07ce5048cafa0581566f7c..04c55694d0b04c0a0cbc4e0ef6d138fa98fb7b04 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -19,10 +19,12 @@ import {
   type GuardableInteraction,
   type LocatedInteraction,
 } from './command.js';
+import { channelContext } from './channel-context.js';
 import { decodeCustomId, type CustomId } from './custom-id.js';
 import { UserError } from './errors.js';
 import { deferLate, LATE_DEFER_MS } from './late-reply.js';
 import { Throttles, waitText } from './throttle.js';
+import { REHEARSAL_REFUSAL } from '../services/rehearsal.js';
 
 export const STALE_COMPONENT = 'This control is no longer active.';
 const UNKNOWN_COMMAND = 'That command is not available.';
@@ -54,6 +56,36 @@ export async function replyEphemeral(
   await interaction.followUp(payload);
 }
 
+/** Answer options with the Ephemeral flag added (text, or options with numeric flags). */
+function ephemeral(options: unknown): unknown {
+  const given: Record<string, unknown> =
+    typeof options === 'string'
+      ? { content: options }
+      : typeof options === 'object' && options !== null
+        ? { ...(options as Record<string, unknown>) }
+        : {};
+  const flags = typeof given.flags === 'number' ? given.flags : 0;
+  return { ...given, flags: flags | MessageFlags.Ephemeral };
+}
+
+/**
+ * The interaction with every reply, deferral and follow-up made private (rehearsal mode,
+ * `answeredInRehearsal`); everything else is the interaction's own.
+ */
+function privately<T extends object>(interaction: T): T {
+  return new Proxy(interaction, {
+    get(target, key) {
+      const value: unknown = Reflect.get(target, key, target);
+      if (typeof value !== 'function') return value;
+      const method = value as (...args: unknown[]) => unknown;
+      if (key === 'reply' || key === 'deferReply' || key === 'followUp') {
+        return (options?: unknown) => method.call(target, ephemeral(options));
+      }
+      return method.bind(target);
+    },
+  });
+}
+
 export interface RouterOptions {
   /** The clock the throttles use; epoch milliseconds. */
   now?: () => number;
@@ -104,7 +136,9 @@ export class InteractionRouter {
    * `deferMs` how long Discord took to take the deferral of a command that was deferred (one request
    * that asks nothing of the bot, so the measure of a round trip), `ms` everything from arrival.
    */
-  async handle(interaction: Interaction): Promise<void> {
+  async handle(received: Interaction): Promise<void> {
+    if (!this.admitted(received)) return this.refuseInRehearsal(received);
+    const interaction = this.answeredInRehearsal(received);
     if (interaction.isAutocomplete()) return this.handleAutocomplete(interaction);
     const started = performance.now();
     const lateMs = Date.now() - interaction.createdTimestamp;
@@ -124,6 +158,62 @@ export class InteractionRouter {
     );
   }
 
+  /** Whether the member is answered: always, but in rehearsal mode only its allowlist and staff. */
+  private admitted(interaction: Interaction): boolean {
+    const { rehearsal } = this.ctx;
+    if (!rehearsal) return true;
+    return rehearsal.admits({
+      userId: interaction.user.id,
+      permissions: interaction.memberPermissions?.bitfield ?? null,
+      roleNames: interaction.inCachedGuild()
+        ? interaction.member.roles.cache.map((role) => role.name)
+        : [],
+    });
+  }
+
+  /**
+   * In rehearsal mode nothing is answered publicly outside the posts of the rehearsed forums,
+   * which only staff and the testers see: there every reply, deferral and follow-up is made
+   * private (a channel's members would see it); in such a post, and outside a rehearsal, the
+   * interaction is as it came.
+   */
+  private answeredInRehearsal(interaction: Interaction): Interaction {
+    const { rehearsal } = this.ctx;
+    if (!rehearsal || interaction.isAutocomplete() || !interaction.inGuild()) return interaction;
+    if (
+      !interaction.isChatInputCommand() &&
+      !interaction.isMessageComponent() &&
+      !interaction.isModalSubmit()
+    ) {
+      return interaction;
+    }
+    const where = channelContext(interaction);
+    const region =
+      where.isThread && where.baseChannelId !== undefined
+        ? this.ctx.regions.byForum(where.baseChannelId)
+        : undefined;
+    const regionName = region
+      ? interaction.guild?.channels.cache.get(region.channelId)?.name
+      : undefined;
+    return region && rehearsal.rehearses(regionName) ? interaction : privately(interaction);
+  }
+
+  /** Answers a member the rehearsal does not admit, and nothing else; a failure is only logged. */
+  private async refuseInRehearsal(interaction: Interaction): Promise<void> {
+    try {
+      if (interaction.isAutocomplete()) await interaction.respond([]);
+      else if (
+        interaction.isChatInputCommand() ||
+        interaction.isMessageComponent() ||
+        interaction.isModalSubmit()
+      ) {
+        await replyEphemeral(interaction, REHEARSAL_REFUSAL);
+      }
+    } catch (err) {
+      this.ctx.log.warn({ err }, 'could not refuse a member during the rehearsal');
+    }
+  }
+
   /** Answers how long the deferral took, for a command that was deferred. */
   private async handleCommand(
     interaction: ChatInputCommandInteraction,
diff --git a/src/index.ts b/src/index.ts
index 48a79d5010329bc13edbfbc5820e1793f5ada922..ebce6d4be11d585384f03bdff70d4085c190c561 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -4,6 +4,7 @@ import { CrashRecord, restartText } from './ops/crash-record.js';
 import { HEALTH_DIR, healthFiles } from './ops/health.js';
 import { afterFailedStart, Lifecycle, loginBackoffMs, waitBeforeLogin } from './ops/lifecycle.js';
 import { FileStamps, firstLine, ownerAlertsFrom } from './ops/owner-alerts.js';
+import { REHEARSAL_ALERT } from './services/rehearsal.js';
 
 // The owner's alerts and the crash marker work before the config is read and after it failed:
 // they need only the token and OWNER_ID, and log through a logger of their own.
@@ -59,3 +60,7 @@ try {
 // A stop asked for during the login, which no checkpoint divides, happens now.
 lifecycle.started(app);
 if (!lifecycle.stopRequested() && crashed) void alerts?.send('restart', restartText(crashed));
+// So that a rehearsal is never left on by accident.
+if (!lifecycle.stopRequested() && app.rehearsal) {
+  void alerts?.send('rehearsal', REHEARSAL_ALERT);
+}
diff --git a/src/ops/health.test.ts b/src/ops/health.test.ts
index 8b9105b0aa6f5d66c1484acfd703f3dd66b5ddc5..52fcd0f8d65fa0b4451e40a96661cab15a50e110 100644
--- a/src/ops/health.test.ts
+++ b/src/ops/health.test.ts
@@ -29,6 +29,18 @@ describe('healthVerdict', () => {
     });
   });
 
+  it('says that rehearsal mode is on, whatever else it says', () => {
+    expect(healthVerdict(status({ rehearsal: true }), NOW)).toEqual({
+      healthy: true,
+      kind: 'healthy',
+      reason:
+        'connected to Discord for 2 hours, the database answered 10 seconds ago; REHEARSAL MODE IS ON',
+    });
+    expect(
+      healthVerdict(status({ rehearsal: true, writtenAt: NOW - 2 * MINUTE }), NOW).reason,
+    ).toMatch(/; REHEARSAL MODE IS ON$/);
+  });
+
   it('is unhealthy when the heartbeat is old: the bot is stuck or gone', () => {
     expect(healthVerdict(status({ writtenAt: NOW - 2 * MINUTE }), NOW)).toEqual({
       healthy: false,
diff --git a/src/ops/health.ts b/src/ops/health.ts
index 315bf0ea20309b6708913532d5ac129b9f31b3d6..97abc00a300aba1850446551096dca9e8ff9e93a 100644
--- a/src/ops/health.ts
+++ b/src/ops/health.ts
@@ -37,6 +37,8 @@ const healthStatusSchema = z.object({
     checkedAt: z.number(),
     error: z.string().optional(),
   }),
+  /** Rehearsal mode is on (`settings.rehearsal`): said in every line, so it is never left on unseen. */
+  rehearsal: z.boolean().optional(),
 });
 
 /** What the heartbeat writes. */
@@ -127,11 +129,22 @@ function span(ms: number): string {
   return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
 }
 
-/** Whether the bot is healthy by its heartbeat at `now`. */
+/** Whether the bot is healthy by its heartbeat at `now`; in rehearsal mode the reason says so. */
 export function healthVerdict(
   status: HealthStatus,
   now: number,
   limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
+): HealthVerdict {
+  const verdict = verdictOf(status, now, limits);
+  return status.rehearsal
+    ? { ...verdict, reason: `${verdict.reason}; REHEARSAL MODE IS ON` }
+    : verdict;
+}
+
+function verdictOf(
+  status: HealthStatus,
+  now: number,
+  limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
 ): HealthVerdict {
   const age = now - status.writtenAt;
   if (age > limits.staleMs) {
diff --git a/src/ops/heartbeat.test.ts b/src/ops/heartbeat.test.ts
index fed8330395a3fe422bf6d2a45090d2b1669497ab..2a548917d5258b10eddcc1a7798e3d45c50fde57 100644
--- a/src/ops/heartbeat.test.ts
+++ b/src/ops/heartbeat.test.ts
@@ -48,6 +48,19 @@ describe('Heartbeat', () => {
     });
   });
 
+  it('says in rehearsal mode that it is on, and nothing of it otherwise', async () => {
+    const { file } = heartbeatWith();
+    const rehearsing = new Heartbeat({
+      file,
+      database: () => Promise.resolve(),
+      log: createTestLogger().log,
+      now: () => START,
+      rehearsal: true,
+    });
+    await rehearsing.beat();
+    expect(readHealthStatus(file)).toMatchObject({ rehearsal: true });
+  });
+
   it('is running from the login on, and says since when Discord is connected or not', async () => {
     const { file, clock, heartbeat } = heartbeatWith();
     let connected = false;
diff --git a/src/ops/heartbeat.ts b/src/ops/heartbeat.ts
index 678bad483daf5d1fa4bc4b3cfcb4768dbc6793ef..42df38b09a420e9d009b3070812da089a0acbeac 100644
--- a/src/ops/heartbeat.ts
+++ b/src/ops/heartbeat.ts
@@ -15,6 +15,8 @@ export interface HeartbeatOptions {
   databaseTimeoutMs?: number;
   log: Logger;
   now?: () => number;
+  /** Rehearsal mode is on: the status says so (`./pine status`, the health check). */
+  rehearsal?: boolean;
 }
 
 /** What the gateway probe reads of a shard of discord.js's `client.ws.shards`. */
@@ -112,6 +114,7 @@ export class Heartbeat {
       phase: this.gateway ? 'running' : 'starting',
       gateway: this.connected,
       database,
+      ...(this.options.rehearsal ? { rehearsal: true } : {}),
     };
     const { file, log } = this.options;
     try {
diff --git a/src/ops/owner-alerts.ts b/src/ops/owner-alerts.ts
index 9cacb55089cd7bb0030cc083a1d4f386b1cf7671..fd5ff8e0d3a2903285777744126a23252504fba0 100644
--- a/src/ops/owner-alerts.ts
+++ b/src/ops/owner-alerts.ts
@@ -9,7 +9,14 @@ import type { Logger } from '../log.js';
  * "stopped" and one "restarted" now and then, and a backup failure is not held back by a crash.
  */
 export type AlertKind =
-  'fatal' | 'restart' | 'unhealthy' | 'restarting' | 'backup' | 'backup-missing' | 'backups-off';
+  | 'fatal'
+  | 'restart'
+  | 'unhealthy'
+  | 'restarting'
+  | 'backup'
+  | 'backup-missing'
+  | 'backups-off'
+  | 'rehearsal';
 
 /** What became of an alert: sent, held back by the interval, or failed (logged). */
 export type AlertOutcome = 'sent' | 'held' | 'failed';
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index ca7b0e1ffa29acfcb0337e75284fa716480d13e8..30c6f979a452cea4ea99d118b701de696e40f65b 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -1,5 +1,5 @@
 import { endParty } from '../domain/party/party.js';
-import { RateLimitError } from 'discord.js';
+import { OverwriteType, PermissionFlagsBits, RateLimitError } from 'discord.js';
 import { describe, expect, it, vi } from 'vitest';
 import type { FakePartyGateway } from '../../test/support/fake-gateway.js';
 import {
@@ -7,6 +7,7 @@ import {
   EAST_FORUM,
   testGyms,
   testRegions,
+  UNBOUNDED_CHANNEL,
   WEST_CHANNEL,
   WEST_FORUM,
 } from '../../test/support/gyms.js';
@@ -14,7 +15,16 @@ import { gymsFixture } from '../../test/support/providers.js';
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
 import { FORUM_TAGS } from '../render/party-post.js';
 import { renderRaidPost } from '../render/raid-post.js';
-import { ALICE, asRaid, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
+import {
+  ALICE,
+  asRaid,
+  at,
+  BOB,
+  CAROL,
+  MINUTE,
+  REPORTER,
+  testRaid,
+} from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { watchBackground } from '../../test/support/timers.js';
 import {
@@ -26,6 +36,7 @@ import {
 import { setBoss } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { RaidReport } from './party-service.js';
+import { Rehearsal } from './rehearsal.js';
 import {
   buttonLabels,
   header,
@@ -1334,6 +1345,99 @@ describe('PartyService.setupForums: one run at a time per server', () => {
     expect(gateway.deletedChannels.some((id) => before.has(id))).toBe(false);
   });
 
+  it('makes forums in rehearsal mode only for its regions, seen by staff and its allowlist', async () => {
+    const rehearsal = new Rehearsal({
+      allowlist: [ALICE],
+      regions: ['unbounded', 'west'],
+      staffRoles: ['Moderator'],
+    });
+    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
+    gateway.channelNames.set(WEST_CHANNEL, 'west');
+    gateway.channelNames.set(EAST_CHANNEL, 'east');
+    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
+    const results = await service.setupForums(gateway.guildId);
+    expect(results.map((r) => [r.region.channelId, r.forum, r.hidden])).toEqual([
+      [WEST_CHANNEL, 'ready', 'hidden'],
+      [UNBOUNDED_CHANNEL, 'created', 'hidden'],
+    ]);
+    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
+    for (const forumId of [WEST_FORUM, made]) {
+      expect(gateway.hidden.get(forumId)).toEqual({ roleNames: ['Moderator'], memberIds: [ALICE] });
+      expect(gateway.canSee(forumId, ALICE)).toBe(true);
+      expect(gateway.canSee(forumId, BOB)).toBe(false);
+    }
+    expect(gateway.hidden.has(EAST_FORUM)).toBe(false);
+  });
+
+  it('says in rehearsal mode when it may not hide a forum, and posts nothing in it', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['west'], staffRoles: [] });
+    const { service, gateway } = await partyServiceWith([], { rehearsal });
+    gateway.channelNames.set(WEST_CHANNEL, 'west');
+    gateway.noHiding.add(WEST_FORUM);
+    const [west] = await service.setupForums(gateway.guildId);
+    expect(west).toMatchObject({ forum: 'ready', hidden: 'not-allowed', summary: false });
+    expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
+    expect(gateway.postsIn(WEST_FORUM)).toEqual([]);
+  });
+
+  it('hides a forum in rehearsal mode from a role its category lets in, before posting in it', async () => {
+    const rehearsal = new Rehearsal({
+      allowlist: [ALICE],
+      regions: ['west', 'unbounded'],
+      staffRoles: ['Moderator'],
+    });
+    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
+    const VALOR = '300000000000000011';
+    const MODS = '300000000000000012';
+    gateway.serverRoles.set(VALOR, { name: 'Valor', permissions: 0n });
+    gateway.serverRoles.set(MODS, { name: 'Moderator', permissions: 0n });
+    gateway.memberRoles.set(BOB, [VALOR]);
+    gateway.memberRoles.set(CAROL, [MODS]);
+    // The category lets Valor in; a forum made in it, or made before, takes that over.
+    gateway.addChannel(UNBOUNDED_CHANNEL, 'unbounded', { categoryId: 'category-1' });
+    gateway.categoryOverwrites.set('category-1', [
+      {
+        id: VALOR,
+        type: OverwriteType.Role,
+        allow: String(PermissionFlagsBits.ViewChannel),
+        deny: '0',
+      },
+    ]);
+    gateway.forumOverwrites.set(WEST_FORUM, [
+      {
+        id: VALOR,
+        type: OverwriteType.Role,
+        allow: String(PermissionFlagsBits.ViewChannel),
+        deny: '0',
+      },
+    ]);
+    gateway.channelNames.set(WEST_CHANNEL, 'west');
+    await service.setupForums(gateway.guildId);
+    const made = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
+    for (const forumId of [WEST_FORUM, made]) {
+      expect(gateway.canSee(forumId, BOB)).toBe(false);
+      expect(gateway.canSee(forumId, CAROL)).toBe(true);
+      expect(gateway.canSee(forumId, ALICE)).toBe(true);
+    }
+    // Hidden before the first post in it (the list of active raids).
+    const at = (call: string) => gateway.calls.indexOf(call);
+    expect(at(`hideForum ${WEST_FORUM}`)).toBeGreaterThanOrEqual(0);
+    expect(at(`hideForum ${WEST_FORUM}`)).toBeLessThan(at(`createPost ${WEST_FORUM}`));
+    expect(gateway.createdHidden).toContain(made);
+  });
+
+  it('makes no forum in rehearsal mode that it cannot make hidden', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [ALICE], regions: ['unbounded'], staffRoles: [] });
+    const { service, gateway, regions } = await partyServiceWith([], { rehearsal });
+    gateway.channelNames.set(UNBOUNDED_CHANNEL, 'unbounded');
+    gateway.noHiding.add(UNBOUNDED_CHANNEL);
+    const before = new Set(gateway.forums.keys());
+    const [unbounded] = await service.setupForums(gateway.guildId);
+    expect(unbounded).toMatchObject({ forum: 'failed' });
+    expect([...gateway.forums.keys()].filter((id) => !before.has(id))).toEqual([]);
+    expect(regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId).toBeNull();
+  });
+
   it('deletes the forum also when recording it throws', async () => {
     const { service, gateway, regions } = await partyServiceWith();
     regions.setForum = () => Promise.reject(new Error('db down'));
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 2bc4f8cca1d0f7be5560271374e9eb16f3271ba3..2902945c6eb75c5d80bec4d0df8dc40113fc5c32 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -8,6 +8,7 @@ import {
   isRefusedBody,
   isRefusedStarter,
   rateLimitWaitMs,
+  type ForumAccess,
   type NewPost,
   type OutgoingMessage,
   type PartyGateway,
@@ -72,6 +73,7 @@ import type { PartyNotifier } from './notify-service.js';
 import { PartyMirrors } from './party-mirrors.js';
 import { settingsOf } from './party-change.js';
 import { RegionClosedError, type PartyStore } from './party-store.js';
+import type { Rehearsal } from './rehearsal.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
 import { gymRegionsInGuild, type RegionProvider } from './region-directory.js';
@@ -233,6 +235,11 @@ export interface ForumSetup {
    * nothing had to change.
    */
   posting?: 'reserved' | 'not-allowed';
+  /**
+   * In rehearsal mode: whether the forum was hidden from all but staff and the allowlist
+   * (`hidden`), or could not be (`not-allowed`).
+   */
+  hidden?: 'hidden' | 'not-allowed';
 }
 
 export interface PartyServiceOptions {
@@ -265,6 +272,11 @@ export interface PartyServiceOptions {
    * cancels it. Default: `setTimeout`, unref'd. A test passes its own to fire the timer by hand.
    */
   setTimer?: (run: () => void, ms: number) => () => void;
+  /**
+   * Rehearsal mode: `setupForums` makes forums only for its regions, and hides them from all
+   * but staff and its allowlist.
+   */
+  rehearsal?: Pick<Rehearsal, 'rehearses' | 'forumAccess'>;
 }
 
 /**
@@ -2026,16 +2038,18 @@ export class PartyService {
   }
 
   private async runSetup(guildId: string, only?: readonly number[]): Promise<ForumSetup[]> {
-    const { regions, guilds } = this.options;
+    const { regions, guilds, rehearsal, gateway } = this.options;
     const row = await guilds.idFor(guildId);
     if (row === undefined) return [];
     const results: ForumSetup[] = [];
     const wanted = regions
       .all()
-      .filter((region) => region.guildId === row && (only?.includes(region.id) ?? true));
+      .filter((region) => region.guildId === row && (only?.includes(region.id) ?? true))
+      // A rehearsal makes forums only for its own regions.
+      .filter((region) => !rehearsal || rehearsal.rehearses(gateway.channelName(region.channelId)));
     for (const before of wanted) {
       try {
-        results.push(await this.setupForum(before));
+        results.push(await this.setupForum(before, rehearsal?.forumAccess));
       } catch (err) {
         this.options.log.error(
           { err, region: before.id },
@@ -2055,6 +2069,22 @@ export class PartyService {
     return results;
   }
 
+  /**
+   * Rehearsal mode: hides a forum from all but staff and the allowlist
+   * (`PartyGateway.hideForum`); a failure is logged and said as `not-allowed`.
+   */
+  private async hideForum(
+    forumId: string,
+    access: ForumAccess,
+  ): Promise<'hidden' | 'not-allowed' | undefined> {
+    try {
+      return await this.options.gateway.hideForum(forumId, access);
+    } catch (err) {
+      this.options.log.warn({ err, forum: forumId }, 'could not hide a forum for the rehearsal');
+      return 'not-allowed';
+    }
+  }
+
   /** Deletes a forum that was made but belongs to no region; a failure is logged. */
   private async deleteForum(forumId: string): Promise<void> {
     try {
@@ -2064,7 +2094,12 @@ export class PartyService {
     }
   }
 
-  private async setupForum(before: Region): Promise<ForumSetup> {
+  /**
+   * One region's forum. `hidden` (rehearsal mode): a new forum is made hidden from its first
+   * moment on (a forum that cannot be made so is not made), and one that is there is hidden
+   * before anything is posted in it; one that cannot be hidden gets nothing posted.
+   */
+  private async setupForum(before: Region, hidden?: ForumAccess): Promise<ForumSetup> {
     const { gateway, regions, regionStore } = this.options;
     let forum: ForumSetup['forum'] = 'ready';
     let tagsAdded = 0;
@@ -2080,6 +2115,7 @@ export class PartyService {
         before.channelId,
         this.forumName(gateway.channelName(before.channelId) ?? 'region'),
         FORUM_TAGS,
+        hidden,
       );
       if (!made) return { region: before, forum: 'no-channel', tagsAdded: 0, summary: false };
       let set: Awaited<ReturnType<SummaryStore['setForum']>>;
@@ -2106,6 +2142,13 @@ export class PartyService {
       forum = 'created';
     }
     const region = regions.byId(before.id) ?? before;
+    const hiding =
+      hidden && region.forumChannelId !== null
+        ? await this.hideForum(region.forumChannelId, hidden)
+        : undefined;
+    if (hiding === 'not-allowed') {
+      return { region, forum, tagsAdded, summary: false, hidden: hiding };
+    }
     const renamed = forum === 'ready' && (await this.renameForum(region));
     const posting = await this.reservePosts(region);
     const summary = await this.ensureSummary(region);
@@ -2116,6 +2159,7 @@ export class PartyService {
       summary,
       ...(renamed ? { renamed } : {}),
       ...(posting === undefined ? {} : { posting }),
+      ...(hiding === undefined ? {} : { hidden: hiding }),
     };
   }
 
diff --git a/src/services/rehearsal.test.ts b/src/services/rehearsal.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a553c50f7444b6181fa36c392b28556bdf0fce58
--- /dev/null
+++ b/src/services/rehearsal.test.ts
@@ -0,0 +1,149 @@
+import { PermissionFlagsBits as P } from 'discord.js';
+import { describe, expect, it, vi } from 'vitest';
+import { RecordingDms } from '../../test/support/dms.js';
+import { FakePartyGateway } from '../../test/support/fake-gateway.js';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { REPORTER } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { DM_PRIORITY } from './dm-sender.js';
+import { Rehearsal, RehearsalDms, rehearsalGateway, rehearsalPosts } from './rehearsal.js';
+
+const MATT = '412345678901234501';
+const MOD = '412345678901234502';
+const MEMBER = '412345678901234503';
+
+const rehearsal = new Rehearsal({
+  allowlist: [MATT],
+  regions: ['west'],
+  staffRoles: ['Moderator'],
+});
+
+describe('Rehearsal', () => {
+  it('admits the allowlist and staff, by Manage Server or a staff role, and nobody else', () => {
+    expect(rehearsal.admits({ userId: MATT, permissions: 0n, roleNames: [] })).toBe(true);
+    expect(rehearsal.admits({ userId: MOD, permissions: P.ManageGuild, roleNames: [] })).toBe(true);
+    expect(rehearsal.admits({ userId: MOD, permissions: P.Administrator, roleNames: [] })).toBe(
+      true,
+    );
+    expect(rehearsal.admits({ userId: MOD, permissions: 0n, roleNames: ['Moderator'] })).toBe(true);
+    expect(
+      rehearsal.admits({ userId: MEMBER, permissions: P.SendMessages, roleNames: ['Valor'] }),
+    ).toBe(false);
+    expect(rehearsal.admits({ userId: MEMBER, permissions: null, roleNames: [] })).toBe(false);
+  });
+
+  it('rehearses only the regions whose channels it names', () => {
+    expect(rehearsal.rehearses('west')).toBe(true);
+    expect(rehearsal.rehearses('east')).toBe(false);
+    expect(rehearsal.rehearses(undefined)).toBe(false);
+  });
+});
+
+describe('RehearsalDms', () => {
+  const job = (userId: string) => ({
+    userId,
+    message: { content: 'A raid you want' },
+    priority: DM_PRIORITY.normal,
+    eventAt: 0,
+    expiresAt: 1,
+  });
+
+  it('delivers to the allowlist only, and logs one count of what it dropped a minute', () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    try {
+      const inner = new RecordingDms();
+      const { log, entries } = createTestLogger();
+      const dms = new RehearsalDms(inner, rehearsal, log);
+      dms.send(job(MEMBER));
+      dms.send(job(MATT));
+      dms.send(job(MOD));
+      expect(inner.recipients).toEqual([MATT]);
+      expect(entries).toEqual([]);
+      expect(vi.getTimerCount()).toBe(1);
+      vi.advanceTimersByTime(60_000);
+      expect(entries.map((entry) => [entry.msg, entry.dropped])).toEqual([
+        ['rehearsal: direct messages to members not on the allowlist were dropped', 2],
+      ]);
+      expect(vi.getTimerCount()).toBe(0);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+});
+
+describe('rehearsalGateway', () => {
+  /** The party services over a gateway that rehearses the region West. */
+  async function rehearsed() {
+    const { log, entries } = createTestLogger();
+    const fake = new FakePartyGateway();
+    fake.channelNames.set(WEST_CHANNEL, 'west');
+    fake.channelNames.set(EAST_CHANNEL, 'east');
+    const later: { made?: Awaited<ReturnType<typeof partyServiceWith>> } = {};
+    const gateway = rehearsalGateway(
+      fake,
+      rehearsalPosts({
+        rehearsal,
+        byPost: (postId) => later.made?.store.byPost(postId),
+        regions: () => later.made?.regions.all() ?? [],
+        channelName: (channelId) => fake.channelName(channelId),
+      }),
+      log,
+    );
+    later.made = await partyServiceWith([], {}, { gateway });
+    return { ...later.made, fake, entries };
+  }
+
+  const report = (gymId: number) => {
+    const gym = gymsFixture().get(gymId);
+    if (!gym) throw new Error(`no gym ${gymId}`);
+    return {
+      gym,
+      reporterId: REPORTER,
+      anonymous: false,
+      autoStatus: PartyStatus.Interested,
+      tier: { level: 'T5' as const, shadow: false },
+      boss: null,
+    };
+  };
+
+  it('makes the post of a raid in a rehearsed region, but posts no link in the region channel', async () => {
+    const { service, fake, entries } = await rehearsed();
+    const outcome = await service.reportRaid(report(1));
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    expect(fake.postsIn(WEST_FORUM).map((post) => post.id)).toContain(outcome.party.forumPostId);
+    expect(fake.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(outcome.party.regionLinkMessageId).toBeNull();
+    expect(entries.map((entry) => entry.msg)).toContain(
+      'rehearsal: no message outside the posts of parties',
+    );
+  });
+
+  it('lets a message into the post of a rehearsed party, and into no other channel', async () => {
+    const { service, gateway, fake } = await rehearsed();
+    const outcome = await service.reportRaid(report(1));
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    const postId = outcome.party.forumPostId ?? '';
+    expect(await gateway.sendMessage(postId, { content: 'Raid is starting' })).toBeDefined();
+    expect(fake.messagesIn(postId).map((one) => one.message.content)).toContain('Raid is starting');
+    expect(await gateway.sendMessage('100000000000000099', { content: 'Bosses changed' })).toBe(
+      undefined,
+    );
+    expect(fake.messagesIn('100000000000000099')).toEqual([]);
+  });
+
+  it('makes no post in the forum of a region it does not rehearse, nor a forum for it', async () => {
+    const { service, gateway, fake, store } = await rehearsed();
+    // Gym 8 lies in East: the report is refused as one where the forum is gone, leaving nothing.
+    expect(await service.reportRaid(report(8))).toMatchObject({ kind: 'no-forum' });
+    expect(fake.postsIn(EAST_FORUM)).toEqual([]);
+    expect(store.active()).toEqual([]);
+    expect(
+      await gateway.createPost(EAST_FORUM, { title: 'x', message: { content: 'x' }, tagIds: [] }),
+    ).toBe(undefined);
+    expect(await gateway.createForum(EAST_CHANNEL, 'east-meetups', [])).toBe(undefined);
+    expect(await gateway.createForum(WEST_CHANNEL, 'west-meetups', [])).toBeDefined();
+  });
+});
diff --git a/src/services/rehearsal.ts b/src/services/rehearsal.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c6d3125818ed9c0834e50156bfeed318e83ed425
--- /dev/null
+++ b/src/services/rehearsal.ts
@@ -0,0 +1,187 @@
+import { PermissionFlagsBits } from 'discord.js';
+import type { Settings } from '../config/settings.js';
+import type { PartyGateway } from '../discord/party-gateway.js';
+import type { Logger } from '../log.js';
+import type { DmJob, DmSender } from './dm-sender.js';
+
+/*
+ * Rehearsal mode (`settings.rehearsal`, plan 8C): the bot with a production token against a copy
+ * of the production database, while the legacy bot is off for a short while. Nothing of it may
+ * reach members who are not in on it: direct messages go to the allowlist only (`RehearsalDms`),
+ * nothing is posted but into the posts of parties in the rehearsed regions' forums
+ * (`rehearsalGateway`), only staff and the allowlist are answered (the router), forums are made
+ * only for the rehearsed regions and seen only by staff and the allowlist (`PartyService`), and
+ * the cleanup of legacy channels only lists.
+ */
+
+export type RehearsalSettings = NonNullable<Settings['rehearsal']>;
+
+/** Who is asking, as an interaction shows it. */
+export interface Asker {
+  userId: string;
+  /** The member's permissions in the channel (`interaction.memberPermissions`), null in a DM. */
+  permissions: bigint | null;
+  /** The names of the member's roles in the server. */
+  roleNames: readonly string[];
+}
+
+const STAFF = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
+
+export class Rehearsal {
+  constructor(readonly settings: RehearsalSettings) {}
+
+  /** Whether a member is on the allowlist. */
+  allowlisted(userId: string): boolean {
+    return this.settings.allowlist.includes(userId);
+  }
+
+  /** Whether the bot answers this member: on the allowlist, or staff (Manage Server, a staff role). */
+  admits(asker: Asker): boolean {
+    if (this.allowlisted(asker.userId)) return true;
+    if (asker.permissions !== null && (asker.permissions & STAFF) !== 0n) return true;
+    return asker.roleNames.some((name) => this.settings.staffRoles.includes(name));
+  }
+
+  /** Whether the region whose channel has this name is rehearsed (gets a forum). */
+  rehearses(channelName: string | undefined): boolean {
+    return channelName !== undefined && this.settings.regions.includes(channelName);
+  }
+
+  /** Who may see a rehearsed forum besides the bot: the staff roles by name, and the allowlist. */
+  get forumAccess(): { roleNames: readonly string[]; memberIds: readonly string[] } {
+    return { roleNames: this.settings.staffRoles, memberIds: this.settings.allowlist };
+  }
+}
+
+/** The rehearsal of the settings, or nothing when it is off. */
+export function rehearsalOf(settings: Pick<Settings, 'rehearsal'>): Rehearsal | undefined {
+  return settings.rehearsal === undefined ? undefined : new Rehearsal(settings.rehearsal);
+}
+
+/** The owner's alert at a start in rehearsal mode (`src/index.ts`). */
+export const REHEARSAL_ALERT =
+  'Professor Pine started: rehearsal mode is on. Direct messages go only to the allowlist, ' +
+  'nothing is announced, and only staff and the allowlist are answered. Take settings.rehearsal ' +
+  "out (and './pine deploy-commands --clear-guild') when the rehearsal is over.";
+
+/** What the bot says to a member it does not answer during a rehearsal. */
+export const REHEARSAL_REFUSAL =
+  'Professor Pine is being tested here for a short while and answers only the people testing it. ' +
+  'Please try again later.';
+
+/**
+ * Direct messages during a rehearsal: those to the allowlist go on to the sender, the others are
+ * dropped (never sent) and logged with the count so far.
+ */
+export class RehearsalDms implements DmSender {
+  private dropped = 0;
+  private timer: NodeJS.Timeout | undefined;
+
+  constructor(
+    private readonly inner: DmSender,
+    private readonly rehearsal: Rehearsal,
+    private readonly log: Logger,
+    /** How long the dropped messages are counted before one line says how many. A minute. */
+    private readonly summaryMs = 60_000,
+  ) {}
+
+  send(job: DmJob): void {
+    if (this.rehearsal.allowlisted(job.userId)) {
+      this.inner.send(job);
+      return;
+    }
+    this.dropped++;
+    // One line per burst, not one per message: a busy event drops hundreds.
+    this.timer ??= setTimeout(() => {
+      this.timer = undefined;
+      this.log.info(
+        { dropped: this.dropped },
+        'rehearsal: direct messages to members not on the allowlist were dropped',
+      );
+      this.dropped = 0;
+    }, this.summaryMs);
+    this.timer.unref();
+  }
+}
+
+/** Where the bot may post during a rehearsal (`rehearsalPosts`). */
+export interface RehearsalPosts {
+  /** A message into this channel: only into the post of a party in a rehearsed forum. */
+  mayPostIn(channelId: string): boolean;
+  /** A post in this forum: only in the forum of a rehearsed region. */
+  mayCreatePostIn(forumId: string): boolean;
+  /** A forum beside this region channel: only for a rehearsed region. */
+  mayCreateForumFor(regionChannelId: string): boolean;
+}
+
+export interface RehearsalPostsOptions {
+  rehearsal: Rehearsal;
+  /** The party whose post this is (`PartyStore.byPost`). */
+  byPost: (postId: string) => { forumChannelId: string | null } | undefined;
+  /** The regions as they are now. */
+  regions: () => readonly { channelId: string; forumChannelId: string | null }[];
+  /** A channel's name (`PartyGateway.channelName`). */
+  channelName: (channelId: string) => string | undefined;
+}
+
+/** The rules of `RehearsalPosts` over the parties, the regions and the channels' names. */
+export function rehearsalPosts(options: RehearsalPostsOptions): RehearsalPosts {
+  const { rehearsal, byPost, regions, channelName } = options;
+  const rehearsedForum = (forumId: string): boolean =>
+    regions().some(
+      (region) =>
+        region.forumChannelId === forumId && rehearsal.rehearses(channelName(region.channelId)),
+    );
+  return {
+    mayPostIn(channelId) {
+      const forumId = byPost(channelId)?.forumChannelId;
+      return forumId !== undefined && forumId !== null && rehearsedForum(forumId);
+    },
+    mayCreatePostIn: rehearsedForum,
+    mayCreateForumFor: (regionChannelId) => rehearsal.rehearses(channelName(regionChannelId)),
+  };
+}
+
+/**
+ * The gateway as a rehearsal uses it: a message, a post or a forum where `posts` does not allow
+ * it is not sent (logged, answered as Discord answers for a channel that is gone: undefined);
+ * everything else goes to `inner` as it is. So no announcement reaches a channel (the boss list,
+ * gyms and Wayfarer imports, the link to a new post in its region's channel, copies in the
+ * remote and elite channels, spawn reports and their Unown copies), whoever sends it.
+ */
+export function rehearsalGateway<G extends PartyGateway>(
+  inner: G,
+  posts: RehearsalPosts,
+  log: Logger,
+): G {
+  const guarded: Pick<PartyGateway, 'sendMessage' | 'createPost' | 'createForum'> = {
+    sendMessage(channelId, message) {
+      if (posts.mayPostIn(channelId)) return inner.sendMessage(channelId, message);
+      log.info({ channel: channelId }, 'rehearsal: no message outside the posts of parties');
+      return Promise.resolve(undefined);
+    },
+    createPost(forumId, post) {
+      if (posts.mayCreatePostIn(forumId)) return inner.createPost(forumId, post);
+      log.info({ forum: forumId }, 'rehearsal: no post outside the rehearsed forums');
+      return Promise.resolve(undefined);
+    },
+    createForum(regionChannelId, name, tagNames, hidden) {
+      if (posts.mayCreateForumFor(regionChannelId)) {
+        return inner.createForum(regionChannelId, name, tagNames, hidden);
+      }
+      log.info({ region: regionChannelId }, 'rehearsal: no forum for a region not rehearsed');
+      return Promise.resolve(undefined);
+    },
+  };
+  return new Proxy(inner, {
+    get(target, key) {
+      if (key === 'sendMessage' || key === 'createPost' || key === 'createForum') {
+        return guarded[key];
+      }
+      const value: unknown = Reflect.get(target, key, target);
+      return typeof value === 'function'
+        ? (value as (...args: unknown[]) => unknown).bind(target)
+        : value;
+    },
+  });
+}
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 08a4fe6517784ca6111a26a01f9f3389e3009d7f..93f3bbfc442397245b47e53bb6d49b68c1f0e6b5 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1,17 +1,32 @@
 import { basename } from 'node:path';
-import { ButtonStyle, ComponentType, DiscordAPIError, RESTJSONErrorCodes } from 'discord.js';
+import {
+  ButtonStyle,
+  ComponentType,
+  DiscordAPIError,
+  PermissionFlagsBits,
+  RESTJSONErrorCodes,
+} from 'discord.js';
+import { channelPermissions, type ApiOverwrite } from '../../src/ops/permissions.js';
 import type { ServerChannel } from '../../src/domain/regions/region-import.js';
 import type {
   CreatedChannel,
   EditOptions,
+  ForumAccess,
   MemberAccess,
   NewPost,
   OutgoingMessage,
   PartyGateway,
   TagIds,
 } from '../../src/discord/party-gateway.js';
+import { hiddenForumOverwrites } from '../../src/discord/party-gateway.js';
 import { Tally } from './tally.js';
 
+/** What Discord answers a change the bot lacks the permission for (50013). */
+function missingPermissions(method: string): DiscordAPIError {
+  const code = RESTJSONErrorCodes.MissingPermissions;
+  return new DiscordAPIError({ code, message: 'Missing Permissions' }, code, 403, method, '/x', {});
+}
+
 export interface FakePost {
   id: string;
   forumId: string;
@@ -238,6 +253,30 @@ export class FakePartyGateway implements PartyGateway {
   readonly reserved = new Set<string>();
   /** The forums whose permissions the bot may not change. */
   readonly noReserving = new Set<string>();
+  /**
+   * The forums `hideForum` hid (rehearsal mode), with who may see them: a member not named there
+   * cannot (the fake knows no roles, so staff roles only show here).
+   */
+  readonly hidden = new Map<string, { roleNames: string[]; memberIds: string[] }>();
+  /**
+   * Forums (by id) and region channels (by id, for a forum made beside them hidden) whose
+   * permissions the bot may not set to hide them: `hideForum` answers `not-allowed`, and
+   * `createForum` with `hidden` is refused as Discord refuses it (Missing Permissions).
+   */
+  readonly noHiding = new Set<string>();
+  /** The forums `createForum` made hidden from their first moment on. */
+  readonly createdHidden: string[] = [];
+  /** The server's roles, by id: their names and permissions (for `canSee` and hiding). */
+  readonly serverRoles = new Map<string, { name: string; permissions: bigint }>();
+  /** The roles of each member, by member id. */
+  readonly memberRoles = new Map<string, string[]>();
+  /** The overwrites of a category, by id, which a forum made in it takes over. */
+  readonly categoryOverwrites = new Map<string, ApiOverwrite[]>();
+  /**
+   * The overwrites of a forum, by id, where a test gives them or the forum took them over: then
+   * `canSee` answers by them, as Discord computes it (`src/ops/permissions.ts`).
+   */
+  readonly forumOverwrites = new Map<string, ApiOverwrite[]>();
   readonly emojis = new Map<string, string>();
   /** By forum: the members whose roles do not let them see it. */
   readonly outsiders = new Map<string, Set<string>>();
@@ -295,6 +334,17 @@ export class FakePartyGateway implements PartyGateway {
   /** Whether the member can see the forum now: by their roles, or because they were let in. */
   canSee(forumId: string, memberId: string): boolean {
     if (this.barred.get(forumId)?.has(memberId)) return false;
+    const overwrites = this.forumOverwrites.get(forumId);
+    if (overwrites) {
+      if (this.admitted.get(forumId)?.has(memberId)) return true;
+      const member = { id: memberId, roleIds: this.memberRoles.get(memberId) ?? [] };
+      // Everyone may see the server's channels unless an overwrite says otherwise.
+      const base =
+        PermissionFlagsBits.ViewChannel |
+        member.roleIds.reduce((all, id) => all | (this.serverRoles.get(id)?.permissions ?? 0n), 0n);
+      const seen = channelPermissions(base, this.guildId, member, overwrites);
+      return (seen & PermissionFlagsBits.ViewChannel) !== 0n;
+    }
     return (
       !this.outsiders.get(forumId)?.has(memberId) ||
       (this.admitted.get(forumId)?.has(memberId) ?? false)
@@ -328,17 +378,55 @@ export class FakePartyGateway implements PartyGateway {
     );
   }
 
-  createForum(regionChannelId: string, name: string, tagNames: readonly string[]) {
+  createForum(
+    regionChannelId: string,
+    name: string,
+    tagNames: readonly string[],
+    hidden?: ForumAccess,
+  ) {
     return this.attempt('createForum', regionChannelId, () => {
       if (this.gone.has(regionChannelId)) return undefined;
+      if (hidden && this.noHiding.has(regionChannelId)) throw missingPermissions('POST');
       const forumId = this.id();
       const tags = this.addForum(forumId, tagNames, name);
       const forum = this.forums.get(forumId);
       if (forum) forum.regionChannelId = regionChannelId;
+      if (hidden) {
+        this.hide(forumId, hidden);
+        this.createdHidden.push(forumId);
+      } else {
+        // As Discord does: a forum made in a category takes over the category's overwrites.
+        const categoryId = this.channels.get(regionChannelId)?.categoryId;
+        const inherited = categoryId ? this.categoryOverwrites.get(categoryId) : undefined;
+        if (inherited) this.forumOverwrites.set(forumId, [...inherited]);
+      }
       return { forumId, tags };
     });
   }
 
+  /** The bot's own member id in the fake's server. */
+  static readonly BOT_ID = '400000000000000001';
+
+  /** Sets a forum's overwrites as the real gateway does (`hiddenForumOverwrites`). */
+  private hide(forumId: string, access: ForumAccess): void {
+    const set = hiddenForumOverwrites(
+      {
+        everyoneId: this.guildId,
+        botId: FakePartyGateway.BOT_ID,
+        roles: [...this.serverRoles].map(([id, role]) => ({ id, ...role })),
+      },
+      access,
+    );
+    this.forumOverwrites.set(
+      forumId,
+      set.map((one) => ({ ...one, allow: String(one.allow), deny: String(one.deny) })),
+    );
+    this.hidden.set(forumId, {
+      roleNames: [...access.roleNames],
+      memberIds: [...access.memberIds],
+    });
+  }
+
   reservePosts(forumId: string) {
     return this.attempt('reservePosts', forumId, () => {
       if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
@@ -349,6 +437,18 @@ export class FakePartyGateway implements PartyGateway {
     });
   }
 
+  hideForum(
+    forumId: string,
+    access: { roleNames: readonly string[]; memberIds: readonly string[] },
+  ) {
+    return this.attempt('hideForum', forumId, () => {
+      if (!this.forums.has(forumId) || this.gone.has(forumId)) return undefined;
+      if (this.noHiding.has(forumId)) return 'not-allowed' as const;
+      this.hide(forumId, access);
+      return 'hidden' as const;
+    });
+  }
+
   renameForum(forumId: string, name: string) {
     return this.attempt('renameForum', forumId, () => {
       if (this.gone.has(forumId)) return false;
diff --git a/test/support/region-commands.ts b/test/support/region-commands.ts
index 922fcd9b56abad86ffa3de3c11abce0a56fc77c7..2c053525a51a60ac3f84a0b2c36a7a16ecf5db23 100644
--- a/test/support/region-commands.ts
+++ b/test/support/region-commands.ts
@@ -20,6 +20,7 @@ import { OTHER_STAFF } from './gym-admin.js';
 import { MEMBER, MODERATOR } from './gym-commands.js';
 import { NORTH_CHANNEL, OTHER_GUILD_ID, OTHER_GUILD_ROW, WEST_CHANNEL } from './gyms.js';
 import { regionAdminWith } from './region-admin.js';
+import type { Rehearsal } from '../../src/services/rehearsal.js';
 import { createTestContext } from './test-context.js';
 
 export { MEMBER, MODERATOR };
@@ -90,7 +91,7 @@ export function attachedText(payload: { files?: readonly unknown[] }, name: stri
  */
 export async function regionCommandsWith(
   parties: readonly Party[] = [],
-  overrides: { maps?: MapProvider } = {},
+  overrides: { maps?: MapProvider; rehearsal?: Rehearsal } = {},
 ) {
   const made = await regionAdminWith(parties);
   const attachments = new FakeAttachments();
@@ -117,6 +118,7 @@ export async function regionCommandsWith(
     trains: made.trains,
     attachments,
     ...(overrides.maps ? { maps: overrides.maps } : {}),
+    ...(overrides.rehearsal ? { rehearsal: overrides.rehearsal } : {}),
   });
   const router = new InteractionRouter(ctx, [region, bounds, admin], [regionControls]);
   const staff: FakeOptions = {
````

### Task 5: Plan 8C T5: the legacy cleanup, a list first and a confirmed deletion

Prototype commit: `493161f2f59128efb115b1f76c9819838bc60f26`

/admin cleanup-legacy (staff, deferred privately) deletes the legacy bot's party channels in
two steps:
- The list, read only through Discord's REST API: the text channels the legacy active/ files
  name (readLegacyActive takes only the channel, the kind and the region channel, never the
  members), and orphans: channels in a region's category (or a named channel's) that are no
  region channel, carry a legacy party name (legacyNameOf: train-, meetup-, egg-<tier>-,
  boss-<tier>-, expired-, ex-raid-, elite-raid- are sure; a hatched raid's two words count only
  with the bot first) and whose oldest message is the bot's. What only looks like one (a sure
  name with a member's, no or an unreadable first message; the bot first with no legacy name)
  is listed apart and never deleted. Never listed, whatever a file says: a region channel, a
  region's forum, a channel the settings name; orphans are never looked for among channels in
  no category; a hatched raid's two-word name goes only with the legacy bot's status message
  first (Use #region to return to this raid's regional channel.), else apart. A
  components-v2 answer, the list as legacy-cleanup.txt
  when it does not fit.
- "Delete these n channels" and Cancel, for the one who asked only, within ten minutes
  (PendingRequests); one channel a second (the wait injectable), each logged, how far it is
  shown every ten channels, a second press only acknowledged, a channel gone meanwhile
  counted, a failure said. In rehearsal mode it only lists. The sentences of an expired or someone
  else's question are now in one place (EXPIRED, NOT_YOURS of pending-requests.ts), which
  /gym, /region, the remove-all question, /location and the cleanup import.
The legacy files come from LEGACY_PARTIES_DIR, mounted read-only at /legacy-parties by the
stack (blank: orphans only); ./pine up, restart and update refuse one without active/. A
folder rather than attachments: the same reading serves cutover-check, and the files' member
ids never go to Discord. cutover-check --legacy-parties <folder> counts the list (and ./pine
mounts that folder for it). The rules were tried on the copy of Pittsburgh's parties: all 19
active files read; every name form the legacy bot made for 253,514 ended raids matches.

**Files:**

```
 .env.example                              |   5 +
 .gitignore                                |   2 +
 CLAUDE.md                                 |   2 +-
 compose.yaml                              |   4 +
 docs/architecture/operations.md           |   3 +-
 docs/architecture/testing.md              |   2 +-
 pine                                      |  45 +++++++-
 src/app-context.ts                        |   3 +
 src/app.ts                                |  14 ++-
 src/commands/admin/cleanup-legacy.test.ts | 256 +++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/cleanup-legacy.ts      | 297 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/admin/index.ts               |   2 +
 src/commands/admin/self-roles.test.ts     |   5 +-
 src/commands/gyms/shared.ts               |   3 +-
 src/commands/notifications/remove-all.ts  |   4 +-
 src/commands/raids/location.ts            |   4 +-
 src/commands/regions/shared.ts            |   3 +-
 src/components/index.ts                   |   2 +
 src/config/env.ts                         |   6 +
 src/discord/custom-id.ts                  |   4 +
 src/ops/cutover-check-cli.ts              |  12 +-
 src/ops/cutover-check.test.ts             |  69 ++++++++++++
 src/ops/cutover-check.ts                  |  86 ++++++++++++++-
 src/ops/discord-rest.ts                   |  14 +++
 src/ops/legacy-cleanup.test.ts            | 230 ++++++++++++++++++++++++++++++++++++++
 src/ops/legacy-cleanup.ts                 | 252 ++++++++++++++++++++++++++++++++++++++++++
 src/ops/legacy-parties.test.ts            |  83 ++++++++++++++
 src/ops/legacy-parties.ts                 |  77 +++++++++++++
 src/services/legacy-cleanup.ts            | 115 +++++++++++++++++++
 src/services/pending-requests.ts          |   8 ++
 test/support/fake-discord-api.ts          |  19 ++--
 test/support/test-context.ts              |   5 +
 32 files changed, 1606 insertions(+), 30 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/admin/cleanup-legacy.test.ts src/commands/admin/self-roles.test.ts src/ops/cutover-check.test.ts src/ops/legacy-cleanup.test.ts src/ops/legacy-parties.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 493161f2f59128efb115b1f76c9819838bc60f26 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8C T5: the legacy cleanup, a list first and a confirmed deletion`, the body above and the trailer, staging exactly
  `.env.example .gitignore CLAUDE.md compose.yaml docs/architecture/operations.md docs/architecture/testing.md pine src/app-context.ts src/app.ts src/commands/admin/cleanup-legacy.test.ts src/commands/admin/cleanup-legacy.ts src/commands/admin/index.ts src/commands/admin/self-roles.test.ts src/commands/gyms/shared.ts src/commands/notifications/remove-all.ts src/commands/raids/location.ts src/commands/regions/shared.ts src/components/index.ts src/config/env.ts src/discord/custom-id.ts src/ops/cutover-check-cli.ts src/ops/cutover-check.test.ts src/ops/cutover-check.ts src/ops/discord-rest.ts src/ops/legacy-cleanup.test.ts src/ops/legacy-cleanup.ts src/ops/legacy-parties.test.ts src/ops/legacy-parties.ts src/services/legacy-cleanup.ts src/services/pending-requests.ts test/support/fake-discord-api.ts test/support/test-context.ts`.

````diff
diff --git a/.env.example b/.env.example
index 2be68e04578a0d8c1dd394de39e1abfc015b5de8..c5fa7f1ccb5c53e1f0b0239d2f162f364179c0ed 100644
--- a/.env.example
+++ b/.env.example
@@ -71,6 +71,11 @@ BACKUP_TZ=
 BACKUP_KEEP_DAYS=90
 BACKUP_UID=0
 BACKUP_GID=0
+# The legacy bot's parties folder (the one holding active/), copied from the legacy
+# installation: /admin cleanup-legacy reads it, read-only, for the channels of the legacy parties
+# that had not ended. A path relative to compose.yaml, or absolute; blank when there is none (the
+# cleanup then finds the legacy channels by their names and first messages alone).
+LEGACY_PARTIES_DIR=
 # The watchdog restarts the bot after it has been stuck (a stale heartbeat) this many minutes,
 # and DMs OWNER_ID when the bot has been unhealthy for another reason (the database, Discord, a
 # long start) WATCHDOG_ALERT_MINUTES, restarted WATCHDOG_RESTARTS times within
diff --git a/.gitignore b/.gitignore
index 2ca489e531ae1ecd79acda5b20127f363ccac7af..72d417c2cb2975deeadda9239c45d5d98f62db36 100644
--- a/.gitignore
+++ b/.gitignore
@@ -38,3 +38,5 @@ var/
 
 # backups of the Docker stack (BACKUP_DIR)
 /backups/
+# what Docker mounts for LEGACY_PARTIES_DIR when it is blank (an empty folder)
+/legacy-parties/
diff --git a/CLAUDE.md b/CLAUDE.md
index d74aab2ae77752d96aac844eaba4c23c0b637502..86df26f0e5ebe0f2bd2fe7ea148aa04119c3f7eb 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -80,7 +80,7 @@ The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with
 ./pine deploy-commands [--global | --guild <id> | --rehearsal | --clear-guild]   # contacts Discord: only when Matt asks (--rehearsal: in rehearsal mode, the database's servers, staff only; --clear-guild removes them)
 ./pine update | shell        # backup, git pull, rebuild, restart (logs the bot in: only when Matt asks); a shell in the bot's container
 ./pine convert-settings <legacy data folder> [--out <folder>] [--force]   # pine-settings.json and env-from-legacy.txt (.env lines) from a legacy installation (reads its private settings: Matt runs it)
-./pine cutover-check         # the cutover's go / no-go: database, permissions, forums, settings, emoji (reads Discord's REST API): only when Matt asks
+./pine cutover-check [--legacy-parties <folder>]   # the cutover's go / no-go: database, permissions, forums, settings, emoji, with the folder the cleanup's count (reads Discord's REST API): only when Matt asks
 ./pine emoji-upload [--apply]   # the game's icons the application lacks as its emoji: contacts Discord (a dry run reads; --apply uploads): only when Matt asks
 ./pine role-auth-export [--json]   # the legacy role authorization of the database, mapped to the new commands (reads only)
 ```
diff --git a/compose.yaml b/compose.yaml
index 1c67aaf3ed3a3907666dab34562005d6eb97cf0e..3bd8ce6a28191946d350fef0632036874917835f 100644
--- a/compose.yaml
+++ b/compose.yaml
@@ -46,9 +46,13 @@ services:
       SETTINGS_PATH: data/settings.json
       # The bot needs no root password: the one in `.env` is MySQL's only.
       DB_ROOT_PASSWORD: ''
+      # The legacy bot's parties folder, for /admin cleanup-legacy: mounted below where
+      # LEGACY_PARTIES_DIR names one, blank (none) otherwise.
+      LEGACY_PARTIES_DIR: ${LEGACY_PARTIES_DIR:+/legacy-parties}
     volumes:
       - ${PINE_SETTINGS:-./pine-settings.json}:/app/data/settings.json:ro
       - pine-var:/app/var
+      - ${LEGACY_PARTIES_DIR:-./legacy-parties}:/legacy-parties:ro
     depends_on:
       mysql:
         condition: service_healthy
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index d272b8292bb7b5b08cd093f577fd7ea43ec81574..3384981ef22dc9a2c221dc75993e0b8ccf6fd4fa 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -4,7 +4,7 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 
 ## The rule
 
-- A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `tr`, `basename`, `dirname`, `id`). A step that would need anything else on the host is wrong.
+- A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `tr`, `sed`, `basename`, `dirname`, `id`). A step that would need anything else on the host is wrong.
 - The script is checked with `shellcheck -s sh` (the `koalaman/shellcheck` image) and kept LF by `.gitattributes`, as is every `*.sh`. It exports `MSYS_NO_PATHCONV=1`, so Git Bash leaves container paths (`/pine/backup.sh`) alone. A command is a function `cmd_<name>` (a hyphen is an underscore) plus a line of `usage`; nothing else needs to know of it; the dispatch is a function, read whole before `update` replaces the file. Each command says what it does and runs Compose through `run`, which prints the command first; errors are plain sentences through `fail`; a command that stopped the bot and then fails says "The bot, its watchdog and the backups are stopped: './pine up' starts them again." (a restore whose load the bot would refuse says that instead) A path the operator gives (a dump) is read from where they ran the script.
 - The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `emoji-upload` contacts Discord through its REST API (its dry run lists the application's emoji, `--apply` uploads), and `cutover-check` reads it with the token; `migrate`, `backup`, `restore --no-start`, `role-auth-export`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
 - The installation's own files are git-ignored and beside `compose.yaml`: `.env` (secrets) and `pine-settings.json` (the settings, made from `data/settings.json`, or from a legacy installation by `./pine convert-settings`). `./pine` refuses to run without either and says how to make them; the repository's `data/settings.json` is never the installation's, so `update` finds no change of its own. `pine-settings.json` is mounted as a single file: an editor saves by writing a new file, which a running container never sees, so an edit needs `./pine restart` (and `./pine restart backup` for the backups' time zone). `PINE_ENV_FILE`, `PINE_SETTINGS` and `COMPOSE_PROJECT_NAME` give a second stack on the same machine its own files, volumes and image (`professor-pine:<project>`) (a rehearsal, a scratch stack). The project's name is Compose's to resolve and `./pine` never sets it: the shell's `COMPOSE_PROJECT_NAME`, else the one in the env file (a rehearsal's `.env` names itself there), else `pine` (the `name:` of `compose.yaml`). Were the script to set it, it would outrank the env file and a rehearsal's `restore --replace` or `down` would act on production.
@@ -67,6 +67,7 @@ The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/s
 
 - `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address, Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
 - `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; the servers of `Guild` the bot is in; per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
+- `/admin cleanup-legacy` (staff, `defer: 'ephemeral'`; `src/commands/admin/cleanup-legacy.ts`, `LegacyCleanup` in `src/services/legacy-cleanup.ts`, the rules in `src/ops/legacy-cleanup.ts`) deletes the legacy bot's party channels in two steps. The list, read only through Discord's REST API (the client's own `rest`; `cleanupList`): the text channels the legacy `active/` files name (`readLegacyActive`, `src/ops/legacy-parties.ts`: only the channel, the kind and the region channel are taken, never the members), and orphans: text channels in a scanned category (those of the region channels and of the channels the files name; never the channels in no category, the server's own, where a region channel without a category also sits) whose name is a legacy party name (`legacyNameOf`: `train-…`, `meetup-…`, `egg-<tier>-…`, `boss-<tier>-…`, `expired-…`, `ex-raid-…`, `elite-raid-…` are sure) and whose oldest message (`GET /channels/{id}/messages?after=0&limit=1`) is the bot's. A hatched raid's `<pokemon>-<gym words>` is any name of two words: it is deleted only when its first message is the legacy bot's status (`LEGACY_STATUS`: "Use #region to return to this raid's regional channel.", as `getSourceChannelMessageHeader` of the legacy `app/raid.js`, `train.js`, `meetup.js` wrote it), and listed apart when the bot wrote something else first. Never listed, whatever a file says: a region channel, a region's forum, a channel the settings name (`settings.channels`). A channel with a sure name whose first message is not the bot's (a member's, none, unreadable), or one with the bot first and no legacy name, is listed apart as "Not deleted" for a person. The answer is a components-v2 message (the whole list as `legacy-cleanup.txt` when it does not fit), with "Delete these n channels" and Cancel, which only the one who asked may press within `CLEANUP_MINUTES` (10; `PendingRequests`); the deletion goes one channel at a time, a second apart (discord.js waits out a 429 besides; `LegacyCleanup` takes a `wait`, which tests pass), logs each, shows how far it is every ten channels in the answer (so that a long run says something before the interaction's quarter of an hour ends), counts what was gone already and says what failed; a second press meanwhile is only acknowledged. The legacy files come from `LEGACY_PARTIES_DIR`, a folder the stack mounts read-only at `/legacy-parties` (blank: none; the list is then made of orphans alone, which the legacy active parties' channels also are when the bot wrote first); `./pine up`, `restart` and `update` refuse a `LEGACY_PARTIES_DIR` without `active/`. A folder rather than attachments: the same reading serves `cutover-check`, nineteen files need no upload, and the files' member ids never go to Discord. `./pine cutover-check --legacy-parties <folder>` mounts that folder for the check alone and counts the list without deleting.
 - **Rehearsal mode** (`settings.rehearsal`: `allowlist` of member ids, `regions` by their channels' names, `staffRoles` by name; `src/services/rehearsal.ts`) runs the bot with a production token against a copy of the production database while the legacy bot is off for a short while, and nothing of it may reach members (spec 2, anti-goals). While it is set: `RehearsalDms` passes direct messages to the allowlist only (the others are dropped, and one line a minute says how many); `rehearsalGateway` wraps the party gateway so that a message goes only into the post of a party in a rehearsed forum, a post only into such a forum and a forum only beside a rehearsed region's channel (everything else is dropped and logged: the boss list's announcements and staleness warnings, the gym and Wayfarer announcements, the link to a new post in its region's channel, the copies in the remote and elite channels, spawn reports and their Unown copies, so also any announcement added later); the router answers only the allowlist and staff (Manage Server, Administrator or a role of `staffRoles`) and everybody else with `REHEARSAL_REFUSAL`; outside the posts of the rehearsed forums every answer is private (`answeredInRehearsal`: each reply, deferral and follow-up gets the Ephemeral flag), so that no channel shows a command's answer; `/request` is refused (`REQUEST_IN_REHEARSAL`: it would file a real GitHub issue); the screenshot trigger reads nothing (it reacts and answers in the channel; the testers use `/raid` with a screenshot); `/admin setup-forums` makes forums only for the rehearsed regions and hides them before anything is posted in them: a new forum is made hidden (`createForum` with `hidden`; a forum that cannot be made so is not made), one that is there gets its overwrites set as a whole (`PartyGateway.hideForum`, `hiddenForumOverwrites`: every overwrite it had, also those taken over from its category, replaced; View Channel and Send Messages denied to everyone, the bot allowed, the staff roles by name and every role that may manage the server allowed, and each allowlisted member with one permission more than an admission, so that `dismissMember` leaves it), and a forum that cannot be hidden gets nothing posted; the fake gateway computes who sees a forum from its overwrites and the members' roles (`src/ops/permissions.ts`); `/admin cleanup-legacy` only lists. `./pine deploy-commands --rehearsal` registers the commands as the commands of the servers of `Guild` that the bot is in (`GET /users/@me/guilds`; each named before anything is sent, those it is not in left out; a registration that fails is said and the others go on, `sendDeploy`), every one with Manage Server as its default permission (an admin lets the testers in under Server Settings > Integrations), and refuses `--global` / `--guild` while the mode is on; `--clear-guild` takes them away at the end (`deployPlan`, `src/discord/deploy.ts`). The start logs a warning, the heartbeat carries `rehearsal: true` and every health line (so `./pine status`) ends with "REHEARSAL MODE IS ON", and the owner gets an alert (`REHEARSAL_ALERT`) at every start. `/region` makes, renames, moves or deletes no channel (`REHEARSAL_CHANNELS`, `src/commands/regions/shared.ts`): an import that would create a channel, and a removal that would delete the forum, are refused with that sentence; outlines alone and a removal that keeps the forum go on. The Unown want a holder of the old role is given (`UnownWantService.noticed`) is still given to a member the rehearsal does not answer: it is written to the copy of the database only, which the night replaces with a fresh dump.
 
 ## Open items
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 255811202fe557c3e0ffd3c325cf389bd0e8605a..2be35221596d180ca3295e01e3c5d8695725f612 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -41,4 +41,4 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Operations
 
-- The owner's alerts are tested through `FakeAlertRest` (`test/support/fake-rest.ts`: Discord's REST API as `OwnerAlerts` uses it, recording each request and refusing an empty or too long message; `failWith` an error or `'hang'`), the watchdog against `FakeDockerApi` (`test/support/fake-docker.ts`: containers by Compose labels, `composeLabels(project, service)`, restarts recorded). The Docker Engine fake of `docker-api.test.ts` answers on a local socket (a named pipe on Windows); its slow restart and its stuck question are timed by fake timers once the request arrived (`Tally`). Health, crash marker and backup status tests write their files into a `mkdtemp` folder; `runBackupScript` (`test/support/backup-script.ts`) runs shell lines in one `sh` with `docker/backup.sh` sourced as a library (`BACKUP_SH_LIBRARY`; `BACKUP_OUT_DIR`, `BACKUP_OPS_DIR`, `BACKUP_LOCK` move its folders) and gives `undefined` where there is no `sh` (the test skips); these files are `*.sh.test.ts`, the vitest project `shell` (part of `npm run test:unit`, a minute per test, since spawning a shell takes seconds on a busy machine): `backup-status.sh.test.ts` reads what `write_status` wrote, `backup-script.sh.test.ts` the lock, the deletion of old dumps and half-written ones, and backups off. `Lifecycle` is tested over an `EventEmitter` in place of the process. The cutover tools read Discord through `FakeDiscordApi` (`test/support/fake-discord-api.ts`): the application, the bot's servers with their roles, members and channels (`addGuild`, `addRole`, `addChannel`, `overwrite`; `BOT_PERMISSIONS` is everything the bot asks for), the oldest message of a channel (`after=0&limit=1` only; `unreadable` answers Missing Access), channels deleted (`deleted`, a second delete is Unknown Channel); every request is recorded, `onlyRead()` says whether all were GETs, and `failWith` fails them all. A legacy installation's settings for the converter are `test/fixtures/legacy-install/` (made-up secrets). The rest of the scripts of the stack (`pine`, `docker/backup.sh`) is checked with `shellcheck -s sh` and a scratch stack (`operations.md`).
+- The owner's alerts are tested through `FakeAlertRest` (`test/support/fake-rest.ts`: Discord's REST API as `OwnerAlerts` uses it, recording each request and refusing an empty or too long message; `failWith` an error or `'hang'`), the watchdog against `FakeDockerApi` (`test/support/fake-docker.ts`: containers by Compose labels, `composeLabels(project, service)`, restarts recorded). The Docker Engine fake of `docker-api.test.ts` answers on a local socket (a named pipe on Windows); its slow restart and its stuck question are timed by fake timers once the request arrived (`Tally`). Health, crash marker and backup status tests write their files into a `mkdtemp` folder; `runBackupScript` (`test/support/backup-script.ts`) runs shell lines in one `sh` with `docker/backup.sh` sourced as a library (`BACKUP_SH_LIBRARY`; `BACKUP_OUT_DIR`, `BACKUP_OPS_DIR`, `BACKUP_LOCK` move its folders) and gives `undefined` where there is no `sh` (the test skips); these files are `*.sh.test.ts`, the vitest project `shell` (part of `npm run test:unit`, a minute per test, since spawning a shell takes seconds on a busy machine): `backup-status.sh.test.ts` reads what `write_status` wrote, `backup-script.sh.test.ts` the lock, the deletion of old dumps and half-written ones, and backups off. `Lifecycle` is tested over an `EventEmitter` in place of the process. The cutover tools read Discord through `FakeDiscordApi` (`test/support/fake-discord-api.ts`): the application, the bot's servers with their roles, members and channels (`addGuild`, `addRole`, `addChannel`, `overwrite`; `BOT_PERMISSIONS` is everything the bot asks for), the oldest message of a channel (`after=0&limit=1` only; a message is its author, or `{ author, content }`; `unreadable` answers Missing Access), channels deleted (`deleted`, a second delete is Unknown Channel); every request is recorded, `onlyRead()` says whether all were GETs, and `failWith` fails them all. `createTestContext`'s `legacyCleanup` throws when used: a test of `/admin cleanup-legacy` passes a `LegacyCleanup` over a `FakeDiscordApi` (`addGuild` and `addChannel` take the fakes' own ids, `FAKE_GUILD_ID`, `WEST_CHANNEL`) with `pauseMs: 0`. A legacy installation's settings for the converter are `test/fixtures/legacy-install/` (made-up secrets). The rest of the scripts of the stack (`pine`, `docker/backup.sh`) is checked with `shellcheck -s sh` and a scratch stack (`operations.md`).
diff --git a/pine b/pine
index 655071d8fce3a2d04ee25fe39cea09ccfc5d5d2b..a2dac6fc43d9c67edfd665554e8fea3e015eee40 100755
--- a/pine
+++ b/pine
@@ -85,6 +85,23 @@ need_stack() {
     fail "There is no $PINE_SETTINGS here. Copy data/settings.json to pine-settings.json and edit it (timezone, channel names), or make it from a legacy installation with './pine convert-settings'."
 }
 
+# A value of the env file as written there (surrounding quotes and a Windows line end taken
+# off); empty when it is not, or when there is no env file.
+env_value() {
+  [ -f "$PINE_ENV_FILE" ] || return 0
+  sed -n "s/^$1=//p" "$PINE_ENV_FILE" | tail -n 1 | tr -d '\r' |
+    sed "s/^'\(.*\)'\$/\1/; s/^\"\(.*\)\"\$/\1/"
+}
+
+# LEGACY_PARTIES_DIR, when set, must be the legacy bot's parties folder: the stack mounts it
+# read-only for /admin cleanup-legacy (a path relative to compose.yaml, or absolute).
+check_legacy_parties() {
+  legacy_dir=$(env_value LEGACY_PARTIES_DIR)
+  [ -n "$legacy_dir" ] || return 0
+  [ -d "$legacy_dir/active" ] ||
+    fail "LEGACY_PARTIES_DIR in $PINE_ENV_FILE names $legacy_dir, which has no folder active: name the legacy bot's parties folder, or leave it blank."
+}
+
 # A folder the operator gave (as seen from where they ran ./pine), as Docker takes it for a bind
 # mount: an absolute path; in Git Bash the Windows form (C:/...), which Docker Desktop takes.
 docker_folder() {
@@ -129,8 +146,10 @@ Usage: ./pine <command>
   convert-settings <legacy data folder> [--out <folder>] [--force]
                      make pine-settings.json and env-from-legacy.txt (the lines of .env) from a
                      legacy installation's settings.json and private-settings.json
-  cutover-check      whether the installation is ready for the cutover: the database, the
-                     bot's permissions, forums, settings, emoji (reads Discord's REST API)
+  cutover-check [--legacy-parties <folder>]
+                     whether the installation is ready for the cutover: the database, the
+                     bot's permissions, forums, settings, emoji (reads Discord's REST API);
+                     with the legacy parties folder, what /admin cleanup-legacy would delete
   emoji-upload [--apply]
                      the game's icons the bot's application lacks as its emoji: a dry run
                      (reads the application's emoji from Discord); --apply uploads them
@@ -147,6 +166,7 @@ cmd_help() {
 
 cmd_up() {
   need_stack
+  check_legacy_parties
   build_image
   say "Starting Professor Pine and its database."
   run up -d
@@ -161,6 +181,7 @@ cmd_down() {
 
 cmd_restart() {
   need_stack
+  check_legacy_parties
   service=${1:-pine}
   say "Restarting $service."
   run restart "$service"
@@ -308,10 +329,27 @@ cmd_convert_settings() {
 
 cmd_cutover_check() {
   need_stack
+  parties=
+  case ${1:-} in
+    '') ;;
+    --legacy-parties)
+      [ $# -eq 2 ] || fail "Usage: ./pine cutover-check [--legacy-parties <folder>]"
+      parties=$(docker_folder "$2")
+      [ -d "$(from_caller "$2")/active" ] ||
+        fail "$2 has no folder active: name the legacy bot's parties folder."
+      ;;
+    *) fail "Usage: ./pine cutover-check [--legacy-parties <folder>]" ;;
+  esac
   build_image
   start_database
   say "Checking whether this installation is ready for the cutover: the database (read only) and Discord (its REST API, reading only; the bot is not logged in)."
-  run run --rm --no-deps pine node --enable-source-maps dist/ops/cutover-check-cli.js "$@"
+  if [ -n "$parties" ]; then
+    say "The legacy parties folder $parties is read (read only) for the count of the cleanup."
+    run run --rm --no-deps -v "$parties:/legacy-check:ro" pine \
+      node --enable-source-maps dist/ops/cutover-check-cli.js --legacy-parties /legacy-check
+  else
+    run run --rm --no-deps pine node --enable-source-maps dist/ops/cutover-check-cli.js
+  fi
 }
 
 cmd_emoji_upload() {
@@ -335,6 +373,7 @@ cmd_role_auth_export() {
 
 cmd_update() {
   need_stack
+  check_legacy_parties
   command -v git >/dev/null 2>&1 || fail "git is not installed: update fetches the code with git."
   git rev-parse --git-dir >/dev/null 2>&1 || fail "This folder is not a git clone: update needs one."
   # The installation's own files (.env, pine-settings.json) are not the repository's; a change
diff --git a/src/app-context.ts b/src/app-context.ts
index bb75c55e18a7cad8e571d7cd33ddd8a3c37f3036..097fa919e9178bdcb587f67867e82bc1c85b29c8 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -38,6 +38,7 @@ import type { TrainService } from './services/train-service.js';
 import type { WayfarerImportService } from './services/wayfarer-import-service.js';
 import type { WayfarerReviewService } from './services/wayfarer-review-service.js';
 import type { Rehearsal } from './services/rehearsal.js';
+import type { LegacyCleanup } from './services/legacy-cleanup.js';
 import type { LoginLinks } from './web/login-links.js';
 
 /** Everything a handler may use. Later phases add services here. */
@@ -66,6 +67,8 @@ export interface AppContext {
   readonly regions: RegionProvider;
   /** Region administration (`/region`): outlines from a file, the list, the export, removal. */
   readonly regionAdmin: RegionAdminService;
+  /** The cleanup of the legacy bot's party channels (`/admin cleanup-legacy`). */
+  readonly legacyCleanup: LegacyCleanup;
   /** The files members attach to a command, downloaded with a limit. */
   readonly attachments: AttachmentGateway;
   /** The row of a server (`Guild.id`), by which regions and parties say whose they are. */
diff --git a/src/app.ts b/src/app.ts
index 713b39680e164fc3667bc81559fde86027b756a5..cbc376da8f40801f76c1ee12386cb567b18abc2e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,4 @@
-import { Events } from 'discord.js';
+import { Events, type Client } from 'discord.js';
 import { sql } from 'kysely';
 import type { AppContext } from './app-context.js';
 import { commands as allCommands } from './commands/index.js';
@@ -85,6 +85,7 @@ import { RegionDirectory } from './services/region-directory.js';
 import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
 import { StaticMaps } from './services/static-maps.js';
+import { LegacyCleanup } from './services/legacy-cleanup.js';
 import {
   RehearsalDms,
   rehearsalGateway,
@@ -508,6 +509,15 @@ export async function startApp(
     log,
   });
   const clickAnswers = new ClickAnswers({ log });
+  // The client that ended up connected, for what talks to Discord's REST API through it.
+  let liveClient: Client | undefined;
+  const legacyCleanup = new LegacyCleanup({
+    rest: () => liveClient?.rest,
+    botId: () => liveClient?.user?.id,
+    partiesDir: config.env.LEGACY_PARTIES_DIR,
+    settingsChannelNames: Object.values(config.settings.channels),
+    log,
+  });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
   const checkpoint = startCheckpoint(options.stopRequested);
   try {
@@ -555,6 +565,7 @@ export async function startApp(
     wayfarerReview,
     regions,
     regionAdmin,
+    legacyCleanup,
     attachments,
     guilds,
     parties,
@@ -630,6 +641,7 @@ export async function startApp(
     configure(client) {
       heartbeat.loggingIn(() => gatewayConnected(client.ws.shards, Date.now()));
       discordGateway.use(client);
+      liveClient = client;
       appEmojiSource.use(client);
       members.use(client);
       roleGateway.use(client);
diff --git a/src/commands/admin/cleanup-legacy.test.ts b/src/commands/admin/cleanup-legacy.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0f407823229c7fe1753090ea2b07dc1db3d297cc
--- /dev/null
+++ b/src/commands/admin/cleanup-legacy.test.ts
@@ -0,0 +1,256 @@
+import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { ChannelType, MessageFlags } from 'discord.js';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import {
+  FAKE_BOT_ID,
+  FakeDiscordApi,
+  type FakeApiChannel,
+} from '../../../test/support/fake-discord-api.js';
+import {
+  asV2,
+  FAKE_GUILD_ID,
+  fakeButton,
+  fakeChatInput,
+  sent,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { buttonLabels, customIdsOf, textOf } from '../../../test/support/messages.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { LegacyCleanup } from '../../services/legacy-cleanup.js';
+import { Rehearsal } from '../../services/rehearsal.js';
+import { cleanupControls, CLEANUP_MINUTES } from './cleanup-legacy.js';
+import { admin } from './index.js';
+
+const STAFF = '700000000000000001';
+const OTHER_STAFF = '700000000000000002';
+const MEMBER = '412345678901234599';
+
+/** A legacy `parties` folder whose `active/` names these channels (ids and names made up). */
+function partiesFolder(channelIds: readonly string[]): string {
+  const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
+  mkdirSync(path.join(root, 'active'));
+  channelIds.forEach((channelId, i) => {
+    writeFileSync(
+      path.join(root, 'active', `file${i}`),
+      JSON.stringify({ key: `k${i}`, value: { type: 'raid train', channelId } }),
+    );
+  });
+  return root;
+}
+
+interface Shape {
+  train: FakeApiChannel;
+  orphan: FakeApiChannel;
+  odd: FakeApiChannel;
+}
+
+function setup(
+  options: {
+    rehearsal?: Rehearsal;
+    partiesDir?: string | null;
+    more?: number;
+    category?: string;
+  } = {},
+) {
+  const api = new FakeDiscordApi();
+  const guild = api.addGuild('Pittsburgh', { id: FAKE_GUILD_ID });
+  const east = api.addChannel(guild, options.category ?? 'EAST', {
+    type: ChannelType.GuildCategory,
+  });
+  api.addChannel(guild, 'west', { id: WEST_CHANNEL, parentId: east.id, messages: [FAKE_BOT_ID] });
+  const shape: Shape = {
+    train: api.addChannel(guild, 'train-made-up-loop', { parentId: east.id, messages: [MEMBER] }),
+    orphan: api.addChannel(guild, 'egg-5-the-stacks', {
+      parentId: east.id,
+      messages: [FAKE_BOT_ID],
+    }),
+    odd: api.addChannel(guild, 'meetup-picnic', { parentId: east.id, messages: [] }),
+  };
+  for (let i = 0; i < (options.more ?? 0); i++) {
+    api.addChannel(guild, `expired-${i}-a-gym-with-a-rather-long-name-for-the-list`, {
+      parentId: east.id,
+      messages: [FAKE_BOT_ID],
+    });
+  }
+  const { log, entries } = createTestLogger();
+  const partiesDir =
+    options.partiesDir === null
+      ? undefined
+      : (options.partiesDir ?? partiesFolder([shape.train.id]));
+  /** The pauses between two deletions, which pass at once. */
+  const waits: number[] = [];
+  const cleanup = new LegacyCleanup({
+    rest: () => api,
+    botId: () => FAKE_BOT_ID,
+    partiesDir,
+    settingsChannelNames: [],
+    pauseMs: 1_000,
+    wait: (ms) => {
+      waits.push(ms);
+      return Promise.resolve();
+    },
+    log,
+  });
+  const { ctx } = createTestContext({
+    legacyCleanup: cleanup,
+    ...(options.rehearsal ? { rehearsal: options.rehearsal } : {}),
+  });
+  const router = new InteractionRouter(ctx, [admin], [cleanupControls]);
+  const ask = async () => {
+    const interaction = fakeChatInput({
+      commandName: 'admin',
+      subcommand: 'cleanup-legacy',
+      roleNames: ['Admin'],
+      userId: STAFF,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const press = async (customId: string, userId = STAFF) => {
+    const interaction = fakeButton({
+      customId,
+      userId,
+      roleNames: ['Admin'],
+      askedBy: STAFF,
+      ephemeralMessage: true,
+      v2Message: true,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { api, shape, ask, press, entries, waits };
+}
+
+/** The answer of the command as a message. */
+const answerOf = (interaction: { editReply: Parameters<typeof sent>[0] }) =>
+  asV2(sent(interaction.editReply));
+
+describe('/admin cleanup-legacy', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('lists what it would delete and what it leaves to a person, and deletes nothing yet', async () => {
+    const { api, shape, ask } = setup();
+    const interaction = await ask();
+    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const answer = answerOf(interaction);
+    const text = textOf(answer);
+    expect(text).toContain('I read 1 legacy file.');
+    expect(text).toContain('**To delete (2):**');
+    expect(text).toContain(
+      `- <#${shape.train.id}> \`train-made-up-loop\` in EAST: a legacy file names it`,
+    );
+    expect(text).toContain(
+      `- <#${shape.orphan.id}> \`egg-5-the-stacks\` in EAST: named like a legacy raid channel, and its first message is the bot’s`,
+    );
+    expect(text).toContain('**Not deleted (1)');
+    expect(text).toContain(
+      `- <#${shape.odd.id}> \`meetup-picnic\` in EAST: named like a legacy meetup channel, but it has no messages`,
+    );
+    expect(buttonLabels(answer)).toEqual(['Delete these 2 channels', 'Cancel']);
+    expect(api.onlyRead()).toBe(true);
+  });
+
+  it('deletes the listed channels when the one who asked confirms, and says what it did', async () => {
+    const { api, shape, ask, press, entries } = setup();
+    const [remove] = customIdsOf(answerOf(await ask()));
+    const pressed = await press(remove ?? '');
+    expect(sent(pressed.update)).toBeDefined();
+    expect(api.deleted).toEqual([shape.train.id, shape.orphan.id]);
+    expect(textOf(asV2(sent(pressed.editReply)))).toBe('Deleted 2 legacy party channels.');
+    expect(entries.filter((entry) => entry.msg === 'legacy channel deleted')).toHaveLength(2);
+  });
+
+  it('waits between two deletions, and shows how far it is every ten channels', async () => {
+    const { api, ask, press, waits } = setup({ more: 25 });
+    const [remove] = customIdsOf(answerOf(await ask()));
+    const pressed = await press(remove ?? '');
+    expect(api.deleted).toHaveLength(27);
+    expect(waits).toEqual(Array.from({ length: 26 }, () => 1_000));
+    const texts = pressed.editReply.mock.calls.map((call) => textOf(asV2(call[0] as never)));
+    expect(texts).toEqual([
+      'Deleting 27 channels, one at a time: 10 done so far.',
+      'Deleting 27 channels, one at a time: 20 done so far.',
+      'Deleted 27 legacy party channels.',
+    ]);
+  });
+
+  it('leaves "Deleting…" in place when the button is pressed again meanwhile', async () => {
+    const { ask, press } = setup();
+    const [remove] = customIdsOf(answerOf(await ask()));
+    await press(remove ?? '');
+    const again = await press(remove ?? '');
+    expect(again.deferUpdate).toHaveBeenCalled();
+    expect(again.update).not.toHaveBeenCalled();
+  });
+
+  it('shows a category name as plain text', async () => {
+    const { ask } = setup({ category: 'EAST **side**' });
+    expect(textOf(answerOf(await ask()))).toContain('in EAST \\*\\*side\\*\\*:');
+  });
+
+  it('skips a channel deleted between the list and the press, and says so', async () => {
+    const { api, shape, ask, press } = setup();
+    const [remove] = customIdsOf(answerOf(await ask()));
+    await api.delete(`/channels/${shape.orphan.id}`);
+    const pressed = await press(remove ?? '');
+    expect(textOf(asV2(sent(pressed.editReply)))).toBe(
+      'Deleted 1 legacy party channel. 1 was gone already.',
+    );
+  });
+
+  it('refuses the buttons to anybody but the one who asked', async () => {
+    const { api, ask, press } = setup();
+    const [remove] = customIdsOf(answerOf(await ask()));
+    const pressed = await press(remove ?? '', OTHER_STAFF);
+    expect(sent(pressed.reply).content).toBe('That is somebody else’s question.');
+    expect(api.deleted).toEqual([]);
+  });
+
+  it('deletes nothing once its time is up, nor on Cancel', async () => {
+    vi.useFakeTimers({ toFake: ['Date'] });
+    const { api, ask, press } = setup();
+    const [remove] = customIdsOf(answerOf(await ask()));
+    vi.setSystemTime(Date.now() + CLEANUP_MINUTES * 60_000 + 1);
+    const late = await press(remove ?? '');
+    expect(textOf(asV2(sent(late.update)))).toBe('That has expired. Use the command again.');
+
+    const [, cancel] = customIdsOf(answerOf(await ask()));
+    const cancelled = await press(cancel ?? '');
+    expect(textOf(asV2(sent(cancelled.update)))).toBe('Nothing was deleted.');
+    expect(api.deleted).toEqual([]);
+  });
+
+  it('lists only, in rehearsal mode', async () => {
+    const rehearsal = new Rehearsal({ allowlist: [STAFF], regions: ['west'], staffRoles: [] });
+    const { ask } = setup({ rehearsal });
+    const answer = answerOf(await ask());
+    expect(buttonLabels(answer)).toEqual([]);
+    expect(textOf(answer)).toContain('Rehearsal mode: nothing is deleted');
+  });
+
+  it('lists the orphans alone where no legacy folder is mounted', async () => {
+    const { shape, ask } = setup({ partiesDir: null });
+    const text = textOf(answerOf(await ask()));
+    expect(text).toContain('LEGACY_PARTIES_DIR is not set');
+    expect(text).toContain('**To delete (1):**');
+    // Named like a train, but a member wrote first: without its file it is left to a person.
+    expect(text).toContain('**Not deleted (2)');
+    expect(text).toContain(
+      `<#${shape.train.id}> \`train-made-up-loop\` in EAST: named like a legacy train channel`,
+    );
+  });
+
+  it('attaches the list as a file when it does not fit', async () => {
+    const { ask } = setup({ more: 60 });
+    const answer = answerOf(await ask());
+    expect(textOf(answer)).toContain('The whole list is in the attached legacy-cleanup.txt.');
+    expect(answer.files).toEqual(['legacy-cleanup.txt']);
+    expect(buttonLabels(answer)).toEqual(['Delete these 62 channels', 'Cancel']);
+  });
+});
diff --git a/src/commands/admin/cleanup-legacy.ts b/src/commands/admin/cleanup-legacy.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8e6081763cd62461c7fccfeacedeb6d662f8da0f
--- /dev/null
+++ b/src/commands/admin/cleanup-legacy.ts
@@ -0,0 +1,297 @@
+import {
+  AttachmentBuilder,
+  ButtonBuilder,
+  ButtonStyle,
+  SlashCommandSubcommandBuilder,
+  type APIButtonComponent,
+  type APIComponentInContainer,
+  type ButtonInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler } from '../../discord/command.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { encodeCustomId, type CustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { requireBotManagement } from '../../discord/guards.js';
+import { discordPayload } from '../../discord/party-gateway.js';
+import type { CleanupEntry, CleanupList, DeleteOutcome } from '../../ops/legacy-cleanup.js';
+import { count, plain, truncate } from '../../render/text.js';
+import { actionRow, container, fileComponent, LIST_COLOUR, textDisplay } from '../../render/v2.js';
+import type { LegacyFiles } from '../../services/legacy-cleanup.js';
+import { BoundedMap } from '../../bounded-map.js';
+import { EXPIRED, NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
+
+/** The kind of the custom ids of the answer's buttons: `cleanup:<token>:delete|cancel`. */
+export const CLEANUP_KIND = 'cleanup';
+/** How long the list can be confirmed by the one who asked for it. */
+export const CLEANUP_MINUTES = 10;
+/** The file the whole list goes into when it does not fit the answer. */
+export const LIST_FILE = 'legacy-cleanup.txt';
+/** How many channels go between two edits of "Deleting…" with how far it is. */
+const PROGRESS_EVERY = 10;
+
+/**
+ * The tokens of lists whose button was pressed: a second press meanwhile (a double click, or
+ * during the deletion) is only acknowledged and leaves "Deleting…" as it is.
+ */
+const answered = new BoundedMap<string, true>(100);
+
+/** How much of the answer the lists may take before they go into the file instead. */
+const LIST_ROOM = 3_000;
+
+/** The lists waiting for "Delete" or "Cancel", by the token of their buttons. */
+const pending = new PendingRequests<{ guildId: string; entries: readonly CleanupEntry[] }>({
+  ttlMs: CLEANUP_MINUTES * 60_000,
+  max: 10,
+});
+
+function button(token: string, action: 'delete' | 'cancel', label: string, style: ButtonStyle) {
+  return new ButtonBuilder()
+    .setCustomId(encodeCustomId({ kind: CLEANUP_KIND, id: token, action }))
+    .setLabel(label)
+    .setStyle(style)
+    .toJSON();
+}
+
+/** A v2 answer of these texts and more (a file, the buttons), as the command and its buttons send it. */
+function answer(texts: readonly string[], more: APIComponentInContainer[] = []) {
+  return discordPayload({
+    v2: true,
+    components: [
+      container(LIST_COLOUR, [
+        ...texts.filter((text) => text.trim() !== '').map((text) => textDisplay(text)),
+        ...more,
+      ]),
+    ],
+  });
+}
+
+/** A line of the list: the channel, its name (as code), its category, why. */
+function entryLine(entry: CleanupEntry, mention: boolean): string {
+  const name = `\`${truncate(entry.name.replace(/`/gu, ''), 100)}\``;
+  const where = entry.category === null ? '' : ` in ${plain(truncate(entry.category, 100))}`;
+  return `- ${mention ? `<#${entry.channelId}> ` : ''}${name}${where}: ${entry.why}`;
+}
+
+/** What the reading of the legacy files gave, in a sentence. */
+function filesLine(files: LegacyFiles, gone: number): string {
+  switch (files.read) {
+    case 'none':
+      return (
+        'LEGACY_PARTIES_DIR is not set: only channels found by their category, name and first ' +
+        'message are listed, none from the legacy files.'
+      );
+    case 'failed':
+      return `The legacy files could not be read (${files.error}): only channels found by their category, name and first message are listed.`;
+    case 'ok':
+      return [
+        `I read ${count(files.files, 'legacy file')}.`,
+        files.skipped > 0 ? `${count(files.skipped, 'file')} could not be read (see the log).` : '',
+        gone > 0
+          ? `${gone} of the channels they name ${gone === 1 ? 'is' : 'are'} gone already.`
+          : '',
+      ]
+        .filter(Boolean)
+        .join(' ');
+  }
+}
+
+const KEPT_HEADING = (n: number) =>
+  `**Not deleted (${n}): they look like party channels, but I am not sure; delete by hand what should go:**`;
+
+/**
+ * The answer of the list: what was read, what would be deleted and what is left to a person, the
+ * whole list as a file when it does not fit, and the buttons (none in rehearsal mode or when
+ * there is nothing to delete).
+ */
+function listAnswer(
+  list: CleanupList,
+  files: LegacyFiles,
+  buttons: APIButtonComponent[],
+  rehearsal: boolean,
+) {
+  const sections = [
+    `**To delete (${list.remove.length}):**`,
+    ...(list.remove.length === 0
+      ? ['Nothing.']
+      : list.remove.map((entry) => entryLine(entry, true))),
+    ...(list.kept.length === 0
+      ? []
+      : [KEPT_HEADING(list.kept.length), ...list.kept.map((entry) => entryLine(entry, true))]),
+  ];
+  const fits = sections.join('\n').length <= LIST_ROOM;
+  const closing = [
+    ...(rehearsal
+      ? ['Rehearsal mode: nothing is deleted now. Run this again after the cutover.']
+      : []),
+    ...(buttons.length > 0
+      ? [
+          `Only you can confirm, within ${CLEANUP_MINUTES} minutes. The channels are deleted one ` +
+            'at a time, which takes a while.',
+        ]
+      : []),
+  ];
+  const head = ['### Legacy party channels', filesLine(files, list.gone)];
+  if (fits) {
+    return answer(
+      [...head, sections.join('\n'), closing.join(' ')],
+      buttons.length > 0 ? [actionRow(buttons)] : [],
+    );
+  }
+  const text = [
+    `To delete (${list.remove.length}):`,
+    ...list.remove.map((entry) => entryLine(entry, false)),
+    '',
+    `Not deleted (${list.kept.length}):`,
+    ...list.kept.map((entry) => entryLine(entry, false)),
+  ].join('\n');
+  return {
+    ...answer(
+      [
+        ...head,
+        `${count(list.remove.length, 'channel')} to delete, ${list.kept.length} not deleted (they ` +
+          `look like party channels, but I am not sure). The whole list is in the attached ${LIST_FILE}.`,
+        closing.join(' '),
+      ],
+      [fileComponent(LIST_FILE), ...(buttons.length > 0 ? [actionRow(buttons)] : [])],
+    ),
+    files: [new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: LIST_FILE })],
+  };
+}
+
+/** What the deletion did, in sentences. */
+function outcomeText(outcome: DeleteOutcome): string[] {
+  const deleted = `Deleted ${count(outcome.deleted.length, 'legacy party channel')}.`;
+  const gone =
+    outcome.gone.length > 0
+      ? ` ${outcome.gone.length} ${outcome.gone.length === 1 ? 'was' : 'were'} gone already.`
+      : '';
+  return [
+    `${deleted}${gone}`,
+    ...(outcome.failed.length === 0
+      ? []
+      : [
+          `${count(outcome.failed.length, 'channel')} could not be deleted (see the log):`,
+          truncate(
+            outcome.failed
+              .map(({ entry, reason }) => `${entryLine(entry, true)} (${reason})`)
+              .join('\n'),
+            LIST_ROOM,
+          ),
+        ]),
+  ];
+}
+
+/** The region channels of the server the command was used in. */
+async function regionChannels(
+  ctx: AppContext,
+  guildId: string,
+): Promise<{ channelId: string; forumChannelId: string | null }[]> {
+  const row = await ctx.guilds.idFor(guildId);
+  return row === undefined ? [] : ctx.regions.all().filter((region) => region.guildId === row);
+}
+
+/**
+ * `/admin cleanup-legacy`: the channels of the legacy bot's parties, in two steps. The list
+ * (read only): the channels the legacy `active/` files name and the orphans, each with why, and
+ * apart what only looks like one; then "Delete these n channels", which only the one who asked
+ * may press, within `CLEANUP_MINUTES`. In rehearsal mode it only lists.
+ */
+export const cleanupLegacy: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('cleanup-legacy')
+    .setDescription(
+      'List the channels of the legacy bot’s parties, and delete them once confirmed',
+    ),
+  help: {
+    details:
+      'For the move from the legacy bot. Lists the channels of its parties in this server: those ' +
+      'its files of active parties name (the folder LEGACY_PARTIES_DIR), and those it left behind, ' +
+      'found by their category, their name and the bot’s own first message. What only looks like ' +
+      'such a channel is listed apart and never deleted. Nothing is deleted until you press ' +
+      `"Delete" under the list, within ${CLEANUP_MINUTES} minutes; the channels then go one at a time.`,
+    examples: ['/admin cleanup-legacy'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    if (!interaction.inGuild()) throw new UserError('This only works in a server.');
+    const guildId = interaction.guildId;
+    const { list, files } = await ctx.legacyCleanup.list(
+      guildId,
+      await regionChannels(ctx, guildId),
+    );
+    const rehearsal = ctx.rehearsal !== undefined;
+    const buttons =
+      rehearsal || list.remove.length === 0
+        ? []
+        : (() => {
+            const token = pending.put(interaction.user.id, { guildId, entries: list.remove });
+            return [
+              button(
+                token,
+                'delete',
+                `Delete these ${count(list.remove.length, 'channel')}`,
+                ButtonStyle.Danger,
+              ),
+              button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
+            ];
+          })();
+    await interaction.editReply(listAnswer(list, files, buttons, rehearsal));
+  },
+};
+
+/** What takes the place of the list once a button was pressed: sentences, no buttons, no file. */
+const replaced = (texts: readonly string[]) => ({ ...answer(texts), attachments: [] });
+
+async function pressed(
+  interaction: ButtonInteraction,
+  id: CustomId,
+  ctx: AppContext,
+): Promise<void> {
+  const found = pending.take(id.id, interaction.user.id);
+  if (found === 'not-yours') throw new UserError(NOT_YOURS);
+  if (found === 'expired') {
+    if (answered.has(id.id)) await interaction.deferUpdate();
+    else await interaction.update(replaced([EXPIRED]));
+    return;
+  }
+  answered.set(id.id, true);
+  if (id.action !== 'delete') {
+    await interaction.update(replaced(['Nothing was deleted.']));
+    return;
+  }
+  if (ctx.rehearsal) {
+    await interaction.update(replaced(['Rehearsal mode: nothing is deleted.']));
+    return;
+  }
+  const { entries } = found.value;
+  await interaction.update(
+    replaced([
+      `Deleting ${count(entries.length, 'channel')}, one at a time… this message changes when it is done.`,
+    ]),
+  );
+  const total = count(entries.length, 'channel');
+  const outcome = await ctx.legacyCleanup.remove(entries, interaction.user.id, async (done) => {
+    if (done % PROGRESS_EVERY !== 0 || done >= entries.length) return;
+    // How far it is, so that the answer says something however long it takes; a failed edit
+    // only costs this one.
+    await interaction
+      .editReply(replaced([`Deleting ${total}, one at a time: ${done} done so far.`]))
+      .catch((err: unknown) => ctx.log.warn({ err }, 'could not show how far the cleanup is'));
+  });
+  try {
+    await interaction.editReply(replaced(outcomeText(outcome)));
+  } catch (err) {
+    ctx.log.error(
+      { err, deleted: outcome.deleted.length, failed: outcome.failed.length },
+      'could not show what the cleanup of legacy channels did',
+    );
+  }
+}
+
+/** The buttons under the list (kind `cleanup`): staff only, as `/admin` itself. */
+export const cleanupControls: ComponentHandler = {
+  kind: CLEANUP_KIND,
+  guards: [requireBotManagement],
+  button: pressed,
+};
diff --git a/src/commands/admin/index.ts b/src/commands/admin/index.ts
index e016f505476e3176031d101f7734a56df62e177b..ba0c82ed7c74817a62bc5d3ee71e94ab69510fb9 100644
--- a/src/commands/admin/index.ts
+++ b/src/commands/admin/index.ts
@@ -4,6 +4,7 @@ import { requireBotManagement } from '../../discord/guards.js';
 import { BOSS_DESCRIPTION, BOSS_GROUP } from './boss-input.js';
 import { listBosses, syncBosses } from './boss-list.js';
 import { overrideParts } from './boss-overrides.js';
+import { cleanupLegacy } from './cleanup-legacy.js';
 import { clearImageCache } from './clear-image-cache.js';
 import { memberSettings } from './member-settings.js';
 import { NICKNAME_DESCRIPTION, NICKNAME_GROUP, nicknameParts } from './nicknames.js';
@@ -25,6 +26,7 @@ const parts: readonly SubcommandPart[] = [
   syncBosses,
   ...nicknameParts,
   memberSettings,
+  cleanupLegacy,
 ];
 
 /** `/admin`: for staff. Discord offers it only to members who may manage the server. */
diff --git a/src/commands/admin/self-roles.test.ts b/src/commands/admin/self-roles.test.ts
index 9a12eb7032910b733c7bdefaa9a965b1a91c1637..ab658db48c7303acd69a6f27cc9fdb1a3147e07a 100644
--- a/src/commands/admin/self-roles.test.ts
+++ b/src/commands/admin/self-roles.test.ts
@@ -72,10 +72,11 @@ function setup() {
 describe('/admin self-roles', () => {
   it('is a group of subcommands of /admin, and is not there when the feature is off', () => {
     const { ctx } = createTestContext();
-    // The parts of plan 5C (boss list, nicknames, member settings) are not looked at here.
+    // The parts of plan 5C (boss list, nicknames, member settings) and of 8C (the cleanup of
+    // legacy channels) are not looked at here.
     const paths = (config: typeof ctx.config) =>
       declaredSubcommands(enabledCommands([admin], config)[0]?.data.toJSON().options).filter(
-        (path) => !/^(boss|nickname) |^member-settings$/.test(path),
+        (path) => !/^(boss|nickname) |^member-settings$|^cleanup-legacy$/.test(path),
       );
     expect(paths(ctx.config)).toEqual([
       'setup-forums',
diff --git a/src/commands/gyms/shared.ts b/src/commands/gyms/shared.ts
index 1f8fd33fa57ac753337cb6ab6df60e9d68c36aa1..47995b800d69f5d2ef9f5e09a270596ab8ff0855 100644
--- a/src/commands/gyms/shared.ts
+++ b/src/commands/gyms/shared.ts
@@ -128,8 +128,7 @@ export function wasAnswered(token: string): boolean {
 }
 
 /** What a staff member is told whose question or form is no longer known (also after a restart). */
-export const EXPIRED = 'That has expired. Use the command again.';
-export const NOT_YOURS = 'That is somebody else’s question.';
+export { EXPIRED, NOT_YOURS } from '../../services/pending-requests.js';
 /**
  * Also what is said of a gym that has come to lie only in another server's regions since the
  * question was asked: for this server's staff it is a gym that does not exist.
diff --git a/src/commands/notifications/remove-all.ts b/src/commands/notifications/remove-all.ts
index 81deb1dd6b4a18279c5c358d51d0c008f38c097f..e19a34f501210e0c33d0552ab66e543caaee4f80 100644
--- a/src/commands/notifications/remove-all.ts
+++ b/src/commands/notifications/remove-all.ts
@@ -10,7 +10,7 @@ import type { ComponentHandler } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf } from '../../discord/guards.js';
-import { PendingRequests } from '../../services/pending-requests.js';
+import { NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
 import { answer } from '../../discord/late-reply.js';
 
 /** What a "remove all of them?" question is about. */
@@ -75,7 +75,7 @@ export function removeAllQuestion(options: RemoveAllOptions): {
       kind: options.kind,
       async button(interaction, id, ctx) {
         const taken = pending.take(id.id, interaction.user.id);
-        if (taken === 'not-yours') throw new UserError('That is somebody else’s question.');
+        if (taken === 'not-yours') throw new UserError(NOT_YOURS);
         if (taken === 'expired') {
           await interaction.update({ content: expired, components: [] });
           return;
diff --git a/src/commands/raids/location.ts b/src/commands/raids/location.ts
index ff93f59c0f2168fd9fe9406e4f1c88dc279cd03c..71fc7f161edf37188fa4769c7a342c643e3586d9 100644
--- a/src/commands/raids/location.ts
+++ b/src/commands/raids/location.ts
@@ -12,7 +12,7 @@ import { raidOf, regionChannelOf, requireRaid } from '../../discord/guards.js';
 import { blocksNewRaid, raidKindOf } from '../../domain/party/raid.js';
 import { problemText } from '../../render/activity.js';
 import { plain, truncate } from '../../render/text.js';
-import { PendingRequests } from '../../services/pending-requests.js';
+import { NOT_YOURS, PendingRequests } from '../../services/pending-requests.js';
 import { commandRaid, partyOver } from '../parties/reply.js';
 import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
 import { gymChoices, reportedGym } from './raid-input.js';
@@ -149,7 +149,7 @@ export const locationControls: ComponentHandler = {
 
   async button(interaction, id, ctx) {
     const taken = pending.take(id.id, interaction.user.id);
-    if (taken === 'not-yours') throw new UserError('That is somebody else’s question.');
+    if (taken === 'not-yours') throw new UserError(NOT_YOURS);
     if (taken === 'expired') {
       await interaction.update({ content: EXPIRED, components: [] });
       return;
diff --git a/src/commands/regions/shared.ts b/src/commands/regions/shared.ts
index 5104116cc58fe317cf5066a4a4493d44b050c2a7..5a3280c30c9fab8a58f895425608e8e41f669959 100644
--- a/src/commands/regions/shared.ts
+++ b/src/commands/regions/shared.ts
@@ -99,8 +99,7 @@ export type ButtonAnswer = (
   request: PendingRegion,
 ) => Promise<void>;
 
-export const EXPIRED = 'That has expired. Use the command again.';
-export const NOT_YOURS = 'That is somebody else’s question.';
+export { EXPIRED, NOT_YOURS } from '../../services/pending-requests.js';
 /**
  * Rehearsal mode (`ctx.rehearsal`): `/region` makes, renames, moves or deletes no channel, which
  * every member would see. An import of outlines alone, or a removal that keeps the forum, goes on.
diff --git a/src/components/index.ts b/src/components/index.ts
index 285d4342b0492aba9f03bc0167865423e985a875..1b8b06c950b66f7eeffc8aa2400d72ed12b391bd 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -1,3 +1,4 @@
+import { cleanupControls } from '../commands/admin/cleanup-legacy.js';
 import { gymControls } from '../commands/gyms/controls.js';
 import { gymViewControls } from '../commands/gyms/view-controls.js';
 import { regionControls } from '../commands/regions/controls.js';
@@ -41,4 +42,5 @@ export const components: readonly ComponentHandler[] = [
   rankControls,
   helpControls,
   countersControls,
+  cleanupControls,
 ];
diff --git a/src/config/env.ts b/src/config/env.ts
index f458bee15b8eeb1e91664948a0e9189410fbcc86..a7f6211783a4538861ae8f113d12767752c0835a 100644
--- a/src/config/env.ts
+++ b/src/config/env.ts
@@ -45,6 +45,12 @@ export const envSchema = z
       z.enum(['development', 'production', 'test']).default('production'),
     ),
     SETTINGS_PATH: z.preprocess(blankToUndefined, z.string().default('data/settings.json')),
+    /**
+     * The legacy bot's `parties` folder (the one holding `active/`), read by `/admin
+     * cleanup-legacy` for the channels of the legacy active parties. In the stack it is mounted
+     * read-only at `/legacy-parties` and this names that path.
+     */
+    LEGACY_PARTIES_DIR: optional(z.string()),
   })
   .superRefine((env, ctx) => {
     if (Boolean(env.GITHUB_TOKEN) !== Boolean(env.GITHUB_REPO)) {
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index d37d58f411164719ce01c13a06f05c68b1487829..e4702089d6c1cb2be9c2762bb9d6e801b4277581 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -52,6 +52,10 @@
  * remove`: `region:<token>:keep` (remove, keep the forum), `region:<token>:delete` (remove and
  * delete the forum) and `region:<token>:cancel`.
  *
+ * The buttons under the list of `/admin cleanup-legacy` have the kind `cleanup`
+ * (`src/commands/admin/cleanup-legacy.ts`), with the token of the pending list as the id:
+ * `cleanup:<token>:delete` and `cleanup:<token>:cancel`.
+ *
  * The controls about a screenshot have the kind `shot` (`src/commands/screenshots/shot-kind.ts`).
  * With the id of a kept screenshot (twelve URL-safe characters): `shot:<id>:right`,
  * `shot:<id>:wrong` (which opens the form `shot:<id>:form`) and `shot:<id>:show`. With the token
diff --git a/src/ops/cutover-check-cli.ts b/src/ops/cutover-check-cli.ts
index a8118a1fe3f853bcdea0e287c1fdf68caaff9f50..9fa258e2086d1ae785da704c8e2a71e23b6a5ed7 100644
--- a/src/ops/cutover-check-cli.ts
+++ b/src/ops/cutover-check-cli.ts
@@ -6,7 +6,7 @@ import { checkFailed, cutoverCheck, formatCheck } from './cutover-check.js';
 import { databaseStore } from './cutover-store.js';
 
 // Whether this installation is ready for the cutover, read only:
-//   node dist/ops/cutover-check-cli.js       (`./pine cutover-check`, `npm run cutover:check`)
+//   node dist/ops/cutover-check-cli.js [--legacy-parties <folder>]   (`./pine cutover-check`, `npm run cutover:check`)
 // The database in a read-only transaction; Discord through its REST API with the bot's token,
 // GETs only, without logging in to the gateway (a legacy bot that runs is not disturbed). Prints
 // pass / warn / fail lines and exits 1 when any fails.
@@ -18,6 +18,15 @@ if (process.argv.length > 2) {
   process.exit(2);
 }
 
+// --legacy-parties <folder>: the legacy bot's parties folder, for the count of the cleanup.
+const args = process.argv.slice(2);
+const at = args.indexOf('--legacy-parties');
+const legacyParties = at < 0 ? undefined : args[at + 1];
+if ((at >= 0 && legacyParties === undefined) || args.length !== (at < 0 ? 0 : 2)) {
+  process.stderr.write('Usage: cutover-check [--legacy-parties <folder>]\n');
+  process.exit(2);
+}
+
 let config: Config;
 try {
   config = loadConfig(process.env);
@@ -38,6 +47,7 @@ try {
         discord: new REST().setToken(config.env.DISCORD_TOKEN),
         appId: config.env.DISCORD_APP_ID,
         settings: config.settings,
+        ...(legacyParties === undefined ? {} : { legacyParties }),
       }),
     );
   process.stdout.write(formatCheck(lines));
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index e310be83cafc54e1ee5195cefe786ced8cbca3a3..85b5701412a75d280184619cc3624de338445839 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -1,3 +1,6 @@
+import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
 import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
 import { beforeEach, describe, expect, it } from 'vitest';
 import {
@@ -416,6 +419,72 @@ describe('cutoverCheck', () => {
     });
   });
 
+  describe('the legacy cleanup', () => {
+    /** A legacy `parties` folder naming these channels (made-up ids). */
+    function partiesFolder(channelIds: readonly string[]): string {
+      const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
+      mkdirSync(path.join(root, 'active'));
+      channelIds.forEach((channelId, i) => {
+        writeFileSync(
+          path.join(root, 'active', `f${i}`),
+          JSON.stringify({ key: `k${i}`, value: { type: 'meet-up', channelId } }),
+        );
+      });
+      return root;
+    }
+
+    it('counts what the cleanup would delete, without deleting, only when given the folder', async () => {
+      expect((await check()).some((one) => one.what === 'cleanup')).toBe(false);
+      const named = api.addChannel(shape.guild, 'meetup-walk', {
+        parentId: shape.category.id,
+        messages: ['412345678901234567'],
+      });
+      api.addChannel(shape.guild, 'egg-5-the-stacks', {
+        parentId: shape.category.id,
+        messages: [FAKE_BOT_ID],
+      });
+      const legacyParties = partiesFolder([named.id, '512345678901234599']);
+      const lines = await cutoverCheck({
+        store,
+        discord: api,
+        appId: FAKE_APP_ID,
+        settings,
+        legacyParties,
+      });
+      expect(line(lines, 'cleanup')).toMatchObject({
+        status: 'pass',
+        text:
+          'cleanup: Pittsburgh: 2 legacy party channels to delete with /admin cleanup-legacy ' +
+          '(1 named by the legacy files, 1 found by name and first message); 1 channel the files name is gone',
+      });
+      expect(api.onlyRead()).toBe(true);
+    });
+
+    it('warns of what a person has to judge, and of a folder it cannot read', async () => {
+      api.addChannel(shape.guild, 'train-loop', { parentId: shape.category.id, messages: [] });
+      const lines = await cutoverCheck({
+        store,
+        discord: api,
+        appId: FAKE_APP_ID,
+        settings,
+        legacyParties: partiesFolder([]),
+      });
+      expect(line(lines, 'cleanup')).toMatchObject({
+        status: 'warn',
+        detail: ['#train-loop in EAST: named like a legacy train channel, but it has no messages'],
+      });
+      const unreadable = await cutoverCheck({
+        store,
+        discord: api,
+        appId: FAKE_APP_ID,
+        settings,
+        legacyParties: mkdtempSync(path.join(tmpdir(), 'pine-empty-')),
+      });
+      expect(line(unreadable, 'cleanup').status).toBe('warn');
+      expect(line(unreadable, 'cleanup').text).toMatch(/has no folder active/);
+    });
+  });
+
   it('formats a line by its status, its detail indented', () => {
     expect(
       formatCheck([
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index 8c5452852caa5afa896d39a91e0d87f607a1efab..902c018b2868ae638dd4e287b49d8eb10439626d 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -3,7 +3,10 @@ import type { Settings } from '../config/settings.js';
 import type { MigrationPlan } from '../db/migrator.js';
 import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
 import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
+import type { DiscordRead } from './discord-rest.js';
 import { applicationEmojiNames, failureReason, iconSources, missingIcons } from './emoji-upload.js';
+import { cleanupList } from './legacy-cleanup.js';
+import { readLegacyActive } from './legacy-parties.js';
 import {
   basePermissions,
   channelPermissions,
@@ -27,11 +30,6 @@ import { exportText, roleAuthExport } from './role-auth.js';
  * pass, warn or fail line; any fail is a no-go.
  */
 
-/** The part of discord.js's `REST` the check reads through: GETs only. */
-export interface DiscordRead {
-  get(route: `/${string}`, options?: { query?: URLSearchParams }): Promise<unknown>;
-}
-
 /** What the check reads of the database. */
 export interface CutoverStore {
   /** What the migrator would do (`migrationPlan`). */
@@ -76,6 +74,11 @@ export interface CutoverCheckOptions {
   /** `DISCORD_APP_ID` of the environment. */
   appId: string;
   settings: Settings;
+  /**
+   * The legacy bot's `parties` folder: with it, the check counts what `/admin cleanup-legacy`
+   * would delete (reading only).
+   */
+  legacyParties?: string;
 }
 
 /** A channel as `GET /guilds/{id}/channels` gives it. */
@@ -446,6 +449,59 @@ function namesLine(
       };
 }
 
+/** What `/admin cleanup-legacy` would list in a server, counted (it deletes nothing here). */
+async function cleanupLine(
+  discord: DiscordRead,
+  dir: string,
+  server: {
+    guildId: string;
+    name: string;
+    botId: string;
+    regions: readonly CutoverRegion[];
+    settings: Settings;
+  },
+): Promise<CheckLine> {
+  const read = readLegacyActive(dir);
+  if (!read.ok) return { what: 'cleanup', status: 'warn', text: `cleanup: ${read.error}` };
+  const named = new Set(read.parties.map((party) => party.channelId));
+  const list = await cleanupList(discord, {
+    guildId: server.guildId,
+    botId: server.botId,
+    regionChannelIds: server.regions.map((one) => one.channelId),
+    regionForumIds: server.regions.flatMap((one) =>
+      one.forumChannelId === null ? [] : [one.forumChannelId],
+    ),
+    settingsChannelNames: Object.values(server.settings.channels),
+    legacyChannelIds: [...named],
+  });
+  const byFile = list.remove.filter((entry) => named.has(entry.channelId)).length;
+  const gone =
+    list.gone === 0
+      ? ''
+      : `; ${list.gone === 1 ? '1 channel the files name is' : `${list.gone} channels the files name are`} gone`;
+  const skipped =
+    read.skipped.length === 0 ? '' : `; ${read.skipped.length} legacy files could not be read`;
+  const text =
+    `cleanup: ${server.name}: ${list.remove.length} legacy party channel${list.remove.length === 1 ? '' : 's'} ` +
+    `to delete with /admin cleanup-legacy (${byFile} named by the legacy files, ` +
+    `${list.remove.length - byFile} found by name and first message)${gone}${skipped}`;
+  if (list.kept.length === 0 && read.skipped.length === 0) {
+    return { what: 'cleanup', status: 'pass', text };
+  }
+  return {
+    what: 'cleanup',
+    status: 'warn',
+    text:
+      list.kept.length === 0
+        ? text
+        : `${text}; ${list.kept.length} only look${list.kept.length === 1 ? 's' : ''} like one: a person judges`,
+    detail: list.kept.map(
+      (entry) =>
+        `#${entry.name}${entry.category === null ? '' : ` in ${entry.category}`}: ${entry.why}`,
+    ),
+  };
+}
+
 function restrictionsLine(rows: readonly LegacyCommandRoles[]): CheckLine {
   const servers = roleAuthExport(rows);
   if (servers.length === 0) {
@@ -572,6 +628,26 @@ async function discordLines(
         });
         withoutForum.push(...ofServer.map((one) => one.channelId));
       }
+      if (options.legacyParties !== undefined) {
+        const name = joined.find((one) => one.id === guildId)?.name ?? guildId;
+        try {
+          lines.push(
+            await cleanupLine(discord, options.legacyParties, {
+              guildId,
+              name,
+              botId: bot.id,
+              regions: ofServer,
+              settings,
+            }),
+          );
+        } catch (err) {
+          lines.push({
+            what: 'cleanup',
+            status: 'fail',
+            text: `cleanup: ${name}: the list could not be made: ${failureReason(err)}`,
+          });
+        }
+      }
     }
     const counted = regions.filter((one) => joinedIds.has(one.guild)).length;
     lines.push(
diff --git a/src/ops/discord-rest.ts b/src/ops/discord-rest.ts
new file mode 100644
index 0000000000000000000000000000000000000000..557671cfcdec8d51a3b93fc8d7e2f74a6aa4e066
--- /dev/null
+++ b/src/ops/discord-rest.ts
@@ -0,0 +1,14 @@
+/*
+ * Discord's REST API as the cutover tools use it: discord.js's `REST` (with the bot's token, no
+ * gateway) in the CLIs, the client's own `rest` in the bot, `FakeDiscordApi` in tests.
+ */
+
+/** Reading only: GETs (the cutover check). */
+export interface DiscordRead {
+  get(route: `/${string}`, options?: { query?: URLSearchParams }): Promise<unknown>;
+}
+
+/** Reading, and deleting channels (the cleanup of legacy channels). */
+export interface DiscordDelete extends DiscordRead {
+  delete(route: `/${string}`, options?: { reason?: string }): Promise<unknown>;
+}
diff --git a/src/ops/legacy-cleanup.test.ts b/src/ops/legacy-cleanup.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0a66057afb24ab93d4373bbb142d0659ff5603d5
--- /dev/null
+++ b/src/ops/legacy-cleanup.test.ts
@@ -0,0 +1,230 @@
+import { ChannelType } from 'discord.js';
+import { beforeEach, describe, expect, it } from 'vitest';
+import {
+  FAKE_BOT_ID,
+  FakeDiscordApi,
+  type FakeApiChannel,
+  type FakeApiGuild,
+} from '../../test/support/fake-discord-api.js';
+import { cleanupList, deleteListed, legacyNameOf, type CleanupList } from './legacy-cleanup.js';
+
+const MEMBER = '412345678901234567';
+
+describe('legacyNameOf', () => {
+  it('knows every name the legacy bot gave a party channel', () => {
+    for (const [name, kind] of [
+      ['train-made-up-loop', 'train'],
+      ['train', 'train'],
+      ['meetup-community-day-walk', 'meetup'],
+      ['egg-5-pinewood-public-library', 'raid'],
+      ['egg-mega-old-stone-fountain', 'raid'],
+      ['boss-5-old-stone-fountain', 'raid'],
+      ['expired-mewtwo-the-stacks', 'raid'],
+      ['expired-5-the-stacks', 'raid'],
+      ['ex-raid-harbor-lighthouse-mural', 'raid'],
+      ['elite-raid-harbor-lighthouse-mural', 'raid'],
+    ] as const) {
+      expect(legacyNameOf(name), name).toEqual({ kind, sure: true });
+    }
+  });
+
+  it('takes a name of two words or more for a hatched raid, unsure: it may be a chat channel', () => {
+    expect(legacyNameOf('mewtwo-the-stacks')).toEqual({ kind: 'raid', sure: false });
+    expect(legacyNameOf('mr_mime-old-stone-fountain')).toEqual({ kind: 'raid', sure: false });
+    expect(legacyNameOf('general')).toBeUndefined();
+    expect(legacyNameOf('trainers-chat')).toEqual({ kind: 'raid', sure: false });
+  });
+});
+
+describe('cleanupList', () => {
+  let api: FakeDiscordApi;
+  let guild: FakeApiGuild;
+  let category: FakeApiChannel;
+  let region: FakeApiChannel;
+
+  beforeEach(() => {
+    api = new FakeDiscordApi();
+    guild = api.addGuild('Pittsburgh');
+    category = api.addChannel(guild, 'EAST', { type: ChannelType.GuildCategory });
+    region = api.addChannel(guild, 'squirrelbreeze', {
+      parentId: category.id,
+      messages: [FAKE_BOT_ID],
+    });
+  });
+
+  const list = (legacyChannelIds: readonly string[] = [], more: { forums?: string[] } = {}) =>
+    cleanupList(api, {
+      guildId: guild.id,
+      botId: FAKE_BOT_ID,
+      regionChannelIds: [region.id],
+      regionForumIds: more.forums ?? [],
+      settingsChannelNames: ['the-bot-lab', 'bot-updates'],
+      legacyChannelIds,
+    });
+  /** The first message of a legacy raid's channel, as the legacy bot wrote it. */
+  const status = {
+    author: FAKE_BOT_ID,
+    content: `Use <#${'5'.repeat(18)}> to return to this raid's regional channel.`,
+  };
+  const names = (entries: CleanupList['remove']) => entries.map((entry) => entry.name);
+
+  it('lists the channels the legacy files name, and orphans: party names with the bot first', async () => {
+    const named = api.addChannel(guild, 'train-made-up-loop', {
+      parentId: category.id,
+      messages: [MEMBER],
+    });
+    api.addChannel(guild, 'egg-5-the-stacks', {
+      parentId: category.id,
+      messages: [FAKE_BOT_ID, MEMBER],
+    });
+    api.addChannel(guild, 'mewtwo-the-stacks', { parentId: category.id, messages: [status] });
+    const listed = await list([named.id, '512345678901234599']);
+    expect(names(listed.remove)).toEqual([
+      'train-made-up-loop',
+      'egg-5-the-stacks',
+      'mewtwo-the-stacks',
+    ]);
+    expect(listed.remove[0]).toMatchObject({
+      channelId: named.id,
+      category: 'EAST',
+      kind: 'train',
+      why: 'a legacy file names it',
+    });
+    expect(listed.remove[1]?.why).toBe(
+      'named like a legacy raid channel, and its first message is the bot’s',
+    );
+    expect(listed.kept).toEqual([]);
+    expect(listed.gone).toBe(1);
+    expect(api.onlyRead()).toBe(true);
+  });
+
+  it('never lists a channel of the settings, a region channel or a forum, even one a file names', async () => {
+    const lab = api.addChannel(guild, 'the-bot-lab', { parentId: category.id, messages: [status] });
+    api.addChannel(guild, 'bot-updates', { parentId: category.id, messages: [FAKE_BOT_ID] });
+    const forum = api.addChannel(guild, 'squirrelbreeze-meetups', {
+      type: ChannelType.GuildText,
+      parentId: category.id,
+      messages: [status],
+    });
+    const listed = await list([lab.id, region.id, forum.id], { forums: [forum.id] });
+    expect(listed).toMatchObject({ remove: [], kept: [] });
+  });
+
+  it('keeps for a person a hatched raid’s name the bot wrote first, unless it wrote a legacy status', async () => {
+    api.addChannel(guild, 'mewtwo-the-stacks', { parentId: category.id, messages: [FAKE_BOT_ID] });
+    api.addChannel(guild, 'kyogre-the-pier', { parentId: category.id, messages: [status] });
+    const listed = await list();
+    expect(names(listed.remove)).toEqual(['kyogre-the-pier']);
+    expect(listed.remove[0]?.why).toBe(
+      'named like a legacy raid channel, and its first message is the legacy bot’s status',
+    );
+    expect(listed.kept.map((entry) => [entry.name, entry.why])).toEqual([
+      [
+        'mewtwo-the-stacks',
+        'named like a legacy raid channel and the bot wrote first, but not a legacy status',
+      ],
+    ]);
+  });
+
+  it('never looks for orphans among channels in no category, where region channels are', async () => {
+    const lonely = api.addChannel(guild, 'downtown', { messages: [FAKE_BOT_ID] });
+    api.addChannel(guild, 'train-loop', { messages: [FAKE_BOT_ID] });
+    const named = api.addChannel(guild, 'meetup-picnic', { messages: [MEMBER] });
+    const listed = await cleanupList(api, {
+      guildId: guild.id,
+      botId: FAKE_BOT_ID,
+      regionChannelIds: [lonely.id],
+      regionForumIds: [],
+      settingsChannelNames: [],
+      legacyChannelIds: [named.id],
+    });
+    expect(names(listed.remove)).toEqual(['meetup-picnic']);
+    expect(listed.kept).toEqual([]);
+  });
+
+  it('never lists a region channel, nor a channel outside the categories of the regions', async () => {
+    api.addChannel(guild, 'meetup-picnic', { messages: [FAKE_BOT_ID] });
+    const other = api.addChannel(guild, 'WEST', { type: ChannelType.GuildCategory });
+    api.addChannel(guild, 'train-loop', { parentId: other.id, messages: [FAKE_BOT_ID] });
+    const listed = await list();
+    expect(listed).toMatchObject({ remove: [], kept: [] });
+  });
+
+  it('scans the category of a channel a file names, beyond the regions’ categories', async () => {
+    const other = api.addChannel(guild, 'WEST', { type: ChannelType.GuildCategory });
+    const named = api.addChannel(guild, 'train-loop', { parentId: other.id, messages: [] });
+    api.addChannel(guild, 'meetup-picnic', { parentId: other.id, messages: [FAKE_BOT_ID] });
+    expect(names((await list([named.id])).remove)).toEqual(['train-loop', 'meetup-picnic']);
+  });
+
+  it('keeps for a person what looks like a party channel but is not surely one', async () => {
+    api.addChannel(guild, 'train-made-up-loop', { parentId: category.id, messages: [MEMBER] });
+    api.addChannel(guild, 'meetup-picnic', { parentId: category.id, messages: [] });
+    api.addChannel(guild, 'bot-notes', { parentId: category.id, messages: [FAKE_BOT_ID] }).name =
+      'notes';
+    const unreadable = api.addChannel(guild, 'egg-5-the-stacks', { parentId: category.id });
+    unreadable.unreadable = true;
+    // A chat channel named like a hatched raid, whose first message is a member's: not listed.
+    api.addChannel(guild, 'trainers-chat', { parentId: category.id, messages: [MEMBER] });
+    const listed = await list();
+    expect(listed.remove).toEqual([]);
+    expect(listed.kept.map((entry) => [entry.name, entry.why])).toEqual([
+      [
+        'train-made-up-loop',
+        'named like a legacy train channel, but its first message is not the bot’s',
+      ],
+      ['meetup-picnic', 'named like a legacy meetup channel, but it has no messages'],
+      ['notes', 'its first message is the bot’s, but its name is no legacy party name'],
+      ['egg-5-the-stacks', 'named like a legacy raid channel, but I may not read its messages'],
+    ]);
+  });
+});
+
+describe('deleteListed', () => {
+  it('deletes one channel after the other, skips one that is gone, and says what failed', async () => {
+    const api = new FakeDiscordApi();
+    const guild = api.addGuild('Pittsburgh');
+    const one = api.addChannel(guild, 'train-a');
+    const two = api.addChannel(guild, 'train-b');
+    const waits: number[] = [];
+    const entry = (channel: { id: string; name: string }) => ({
+      channelId: channel.id,
+      name: channel.name,
+      category: null,
+      kind: 'train' as const,
+      why: 'a legacy file names it',
+    });
+    guild.channels = guild.channels.filter((channel) => channel.id !== two.id);
+    const failing = {
+      channelId: '512345678901234598',
+      name: 'meetup-x',
+      category: null,
+      kind: 'meetup' as const,
+      why: 'x',
+    };
+    const done = await deleteListed(api, [entry(one), entry(two)], {
+      pauseMs: 1_000,
+      wait: (ms) => {
+        waits.push(ms);
+        return Promise.resolve();
+      },
+      reason: 'Legacy party channel',
+    });
+    expect(done.deleted.map((one) => one.name)).toEqual(['train-a']);
+    expect(done.gone.map((one) => one.name)).toEqual(['train-b']);
+    expect(done.failed).toEqual([]);
+    expect(waits).toEqual([1_000]);
+    expect(api.requests.filter((request) => request.method === 'DELETE')).toEqual([
+      { method: 'DELETE', route: `/channels/${one.id}`, reason: 'Legacy party channel' },
+      { method: 'DELETE', route: `/channels/${two.id}`, reason: 'Legacy party channel' },
+    ]);
+
+    api.failWith = new Error('503: Service Unavailable');
+    const failed = await deleteListed(api, [failing], {
+      pauseMs: 0,
+      wait: () => Promise.resolve(),
+      reason: 'x',
+    });
+    expect(failed.failed).toEqual([{ entry: failing, reason: '503: Service Unavailable' }]);
+  });
+});
diff --git a/src/ops/legacy-cleanup.ts b/src/ops/legacy-cleanup.ts
new file mode 100644
index 0000000000000000000000000000000000000000..37ffb88a8788e8f3f49ac1de497ae92fc4ccf005
--- /dev/null
+++ b/src/ops/legacy-cleanup.ts
@@ -0,0 +1,252 @@
+import { ChannelType, DiscordAPIError, RESTJSONErrorCodes, Routes } from 'discord.js';
+import type { DiscordDelete, DiscordRead } from './discord-rest.js';
+import { failureReason } from './emoji-upload.js';
+
+/*
+ * The cleanup of the legacy bot's party channels (`/admin cleanup-legacy`, and the count of
+ * `cutover-check`): the legacy bot made a text channel per raid, train and meetup, in the
+ * category of the region channel it was reported in, named by `generateChannelName` (raids
+ * `<pokemon>-<gym words>`, `egg-<tier>-…`, `boss-<tier>-…`, `expired-…`, `ex-raid-…`,
+ * `elite-raid-…`; trains `train-<name words>`; meetups `meetup-<name words>`), and posted the
+ * party's status as its first message. What is listed for deletion: the channels the legacy
+ * `active/` files name, and orphans (left behind by crashes) that are surely such channels by
+ * their category, their name and their first message. What only looks like one is listed apart,
+ * for a person to judge. Nothing here deletes but `deleteListed`.
+ */
+
+export type LegacyKind = 'raid' | 'train' | 'meetup';
+
+/** The words of a legacy channel name: `\w` of JavaScript, lower case as Discord keeps them. */
+const WORDS = '[a-z0-9_]+(?:-[a-z0-9_]+)*';
+const SURE: readonly (readonly [RegExp, LegacyKind])[] = [
+  [new RegExp(`^train(?:-${WORDS})?$`, 'u'), 'train'],
+  [new RegExp(`^meetup(?:-${WORDS})?$`, 'u'), 'meetup'],
+  [new RegExp(`^(?:egg|boss)-[a-z0-9]+(?:-${WORDS})?$`, 'u'), 'raid'],
+  [new RegExp(`^expired-${WORDS}$`, 'u'), 'raid'],
+  [new RegExp(`^(?:ex|elite)-raid(?:-${WORDS})?$`, 'u'), 'raid'],
+];
+/** A hatched raid: the boss's words, then the gym's; as a name, any two words or more. */
+const HATCHED = /^[a-z0-9_]+(?:-[a-z0-9_]+)+$/u;
+
+/**
+ * What kind of legacy party a channel's name says it is: `sure` for a name only the legacy bot
+ * gave (`train-…`, `egg-5-…`), unsure for a hatched raid's (`mewtwo-the-stacks`), which any
+ * channel of two words or more also has.
+ */
+export function legacyNameOf(name: string): { kind: LegacyKind; sure: boolean } | undefined {
+  for (const [pattern, kind] of SURE) if (pattern.test(name)) return { kind, sure: true };
+  return HATCHED.test(name) ? { kind: 'raid', sure: false } : undefined;
+}
+
+/** A channel the cleanup lists: what it is, where, and why. */
+export interface CleanupEntry {
+  channelId: string;
+  name: string;
+  /** The name of its category, or null. */
+  category: string | null;
+  /** What it looks like; undefined for a channel whose name is no legacy name. */
+  kind: LegacyKind | undefined;
+  why: string;
+}
+
+export interface CleanupList {
+  /** What the cleanup deletes once a person confirms. */
+  remove: CleanupEntry[];
+  /** What looks like a legacy party channel but is not surely one: for a person to judge. */
+  kept: CleanupEntry[];
+  /** Channels the legacy files name that the server no longer has (or never had). */
+  gone: number;
+}
+
+interface ApiChannel {
+  id: string;
+  name: string;
+  type: ChannelType;
+  parent_id?: string | null;
+}
+
+/**
+ * Who wrote a channel's first message: the bot (`status` when it is the legacy bot's status of
+ * a party, `bot` for anything else it wrote), a member, nobody, or it cannot be read.
+ */
+type FirstAuthor = 'status' | 'bot' | 'member' | 'none' | 'unreadable';
+
+/**
+ * The text the legacy bot began a party's channel with, above the party's status
+ * (`getSourceChannelMessageHeader` of `app/raid.js`, `app/train.js`, `app/meetup.js`).
+ */
+const LEGACY_STATUS =
+  /^Use <#\d+> to return to this (?:raid|raid train|meetup)'s regional channel\.$/u;
+
+async function firstAuthor(
+  discord: DiscordRead,
+  channelId: string,
+  botId: string,
+): Promise<FirstAuthor> {
+  try {
+    const oldest = (await discord.get(Routes.channelMessages(channelId), {
+      query: new URLSearchParams({ after: '0', limit: '1' }),
+    })) as { author?: { id?: string }; content?: string }[];
+    const author = oldest[0]?.author?.id;
+    if (author === undefined) return 'none';
+    if (author !== botId) return 'member';
+    return LEGACY_STATUS.test((oldest[0]?.content ?? '').trim()) ? 'status' : 'bot';
+  } catch (err) {
+    if (
+      err instanceof DiscordAPIError &&
+      (err.code === RESTJSONErrorCodes.MissingAccess ||
+        err.code === RESTJSONErrorCodes.MissingPermissions)
+    ) {
+      return 'unreadable';
+    }
+    throw err;
+  }
+}
+
+const KIND_WORD: Readonly<Record<LegacyKind, string>> = {
+  raid: 'raid',
+  train: 'train',
+  meetup: 'meetup',
+};
+
+export interface CleanupListOptions {
+  /** The server. */
+  guildId: string;
+  /** The bot's own user id: the author of a legacy party channel's first message. */
+  botId: string;
+  /** The server's region channels: never listed; their categories are scanned. */
+  regionChannelIds: readonly string[];
+  /** The forums of its regions: never listed. */
+  regionForumIds: readonly string[];
+  /** The names of the channels the settings name (`settings.channels`): never listed. */
+  settingsChannelNames: readonly string[];
+  /** The channels the legacy `active/` files name. */
+  legacyChannelIds: readonly string[];
+}
+
+/**
+ * The list of the cleanup, read only: the server's channels, and the first message of each text
+ * channel in a scanned category (those of the region channels and of the channels the files
+ * name; no category where one of them has none) that has a legacy name or is not named by a file.
+ */
+export async function cleanupList(
+  discord: DiscordRead,
+  options: CleanupListOptions,
+): Promise<CleanupList> {
+  const { guildId, botId, regionChannelIds, regionForumIds, legacyChannelIds } = options;
+  const channels = (await discord.get(Routes.guildChannels(guildId))) as ApiChannel[];
+  const byId = new Map(channels.map((channel) => [channel.id, channel]));
+  const named = new Set(legacyChannelIds);
+  // Never listed, whatever a file says: the region channels, their forums, the channels the
+  // settings name.
+  const kept = new Set([...regionChannelIds, ...regionForumIds]);
+  const settingsNames = new Set(options.settingsChannelNames);
+  // Orphans are looked for only in categories: a region channel without one sits among the
+  // server's own channels, which are never scanned.
+  const categories = new Set(
+    [...regionChannelIds, ...legacyChannelIds].flatMap((id) => {
+      const parent = byId.get(id)?.parent_id;
+      return parent ? [parent] : [];
+    }),
+  );
+  const categoryName = (id: string | null | undefined) =>
+    id === null || id === undefined ? null : (byId.get(id)?.name ?? null);
+  const remove: CleanupEntry[] = [];
+  const toJudge: CleanupEntry[] = [];
+  for (const channel of channels) {
+    if (channel.type !== ChannelType.GuildText || kept.has(channel.id)) continue;
+    if (settingsNames.has(channel.name)) continue;
+    if (!named.has(channel.id) && !(channel.parent_id && categories.has(channel.parent_id))) {
+      continue;
+    }
+    const legacy = legacyNameOf(channel.name);
+    const entry = (why: string): CleanupEntry => ({
+      channelId: channel.id,
+      name: channel.name,
+      category: categoryName(channel.parent_id),
+      kind: legacy?.kind,
+      why,
+    });
+    if (named.has(channel.id)) {
+      remove.push(entry('a legacy file names it'));
+      continue;
+    }
+    const first = await firstAuthor(discord, channel.id, botId);
+    const byBot = first === 'bot' || first === 'status';
+    // A name of two words without the bot's message first is a chat channel: not listed.
+    if (legacy && !legacy.sure && !byBot) continue;
+    const like = legacy ? `named like a legacy ${KIND_WORD[legacy.kind]} channel` : undefined;
+    if (like && !legacy?.sure && first === 'bot') {
+      // Any channel of two words the bot wrote in first: deleted only with the legacy status.
+      toJudge.push(entry(`${like} and the bot wrote first, but not a legacy status`));
+    } else if (like && first === 'status' && !legacy?.sure) {
+      remove.push(entry(`${like}, and its first message is the legacy bot’s status`));
+    } else if (like && byBot) {
+      remove.push(entry(`${like}, and its first message is the bot’s`));
+    } else if (like && legacy?.sure) {
+      toJudge.push(
+        entry(
+          `${like}, but ${
+            first === 'none'
+              ? 'it has no messages'
+              : first === 'unreadable'
+                ? 'I may not read its messages'
+                : 'its first message is not the bot’s'
+          }`,
+        ),
+      );
+    } else if (!like && byBot) {
+      toJudge.push(entry('its first message is the bot’s, but its name is no legacy party name'));
+    }
+  }
+  const gone = legacyChannelIds.filter((id) => !byId.has(id)).length;
+  return { remove, kept: toJudge, gone };
+}
+
+export interface DeleteOptions {
+  /** The pause between two deletions, for Discord's rate limits. */
+  pauseMs: number;
+  /** Waits; a test passes one that does not. */
+  wait?: (ms: number) => Promise<void>;
+  /** What the server's audit log says of each deletion. */
+  reason: string;
+  /** Told how many channels are done after each one (deleted, gone or failed). */
+  progress?: (done: number) => Promise<void> | void;
+}
+
+export interface DeleteOutcome {
+  deleted: CleanupEntry[];
+  /** Gone already (deleted by hand meanwhile). */
+  gone: CleanupEntry[];
+  failed: { entry: CleanupEntry; reason: string }[];
+}
+
+const sleep = (ms: number) =>
+  new Promise<void>((resolve) => {
+    setTimeout(resolve, ms).unref();
+  });
+
+/** Deletes the channels one after the other, with a pause between two; never throws for one. */
+export async function deleteListed(
+  discord: DiscordDelete,
+  entries: readonly CleanupEntry[],
+  options: DeleteOptions,
+): Promise<DeleteOutcome> {
+  const wait = options.wait ?? sleep;
+  const outcome: DeleteOutcome = { deleted: [], gone: [], failed: [] };
+  for (const [index, entry] of entries.entries()) {
+    if (index > 0) await wait(options.pauseMs);
+    try {
+      await discord.delete(Routes.channel(entry.channelId), { reason: options.reason });
+      outcome.deleted.push(entry);
+    } catch (err) {
+      if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownChannel) {
+        outcome.gone.push(entry);
+      } else {
+        outcome.failed.push({ entry, reason: failureReason(err) });
+      }
+    }
+    await options.progress?.(index + 1);
+  }
+  return outcome;
+}
diff --git a/src/ops/legacy-parties.test.ts b/src/ops/legacy-parties.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..89910b28c90e200fc88533f59a8f9247a3d2c766
--- /dev/null
+++ b/src/ops/legacy-parties.test.ts
@@ -0,0 +1,83 @@
+import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { readLegacyActive } from './legacy-parties.js';
+
+/**
+ * A legacy `parties` folder as the legacy bot wrote it: `active/` of files without an extension,
+ * each `{ key, value }`. Every id and name here is made up.
+ */
+function partiesFolder(files: Record<string, unknown>): string {
+  const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
+  mkdirSync(path.join(root, 'active'));
+  mkdirSync(path.join(root, 'complete'));
+  for (const [name, content] of Object.entries(files)) {
+    writeFileSync(
+      path.join(root, 'active', name),
+      typeof content === 'string' ? content : JSON.stringify(content),
+    );
+  }
+  return root;
+}
+
+const TRAIN = {
+  key: 'a1',
+  value: {
+    type: 'raid train',
+    channelId: '512345678901234501',
+    sourceChannelId: '512345678901234599',
+    trainName: 'Made-up loop',
+    createdById: '412345678901234567',
+    attendees: { '412345678901234567': { number: 1, status: 1 } },
+  },
+};
+const MEETUP = {
+  key: 'b2',
+  value: { type: 'meet-up', channelId: '512345678901234502', meetupName: 'Made-up meetup' },
+};
+
+describe('readLegacyActive', () => {
+  it('reads the channel, kind and region of every active party, and nothing of its members', () => {
+    const read = readLegacyActive(partiesFolder({ a1: TRAIN, b2: MEETUP }));
+    if (!read.ok) throw new Error(read.error);
+    expect(read.parties).toEqual([
+      {
+        file: 'a1',
+        type: 'raid train',
+        channelId: '512345678901234501',
+        sourceChannelId: '512345678901234599',
+      },
+      { file: 'b2', type: 'meet-up', channelId: '512345678901234502', sourceChannelId: null },
+    ]);
+    expect(JSON.stringify(read)).not.toContain('412345678901234567');
+    expect(JSON.stringify(read)).not.toContain('Made-up');
+    expect(read.skipped).toEqual([]);
+  });
+
+  it('skips a file it cannot read, or that names no channel, and says why', () => {
+    const read = readLegacyActive(
+      partiesFolder({
+        a1: TRAIN,
+        broken: '{"key": "x", "value": {',
+        empty: { key: 'c3', value: { type: 'raid' } },
+        odd: [1, 2],
+      }),
+    );
+    if (!read.ok) throw new Error(read.error);
+    expect(read.parties.map((party) => party.file)).toEqual(['a1']);
+    expect(read.skipped).toEqual([
+      { file: 'broken', reason: 'not JSON' },
+      { file: 'empty', reason: 'no channel' },
+      { file: 'odd', reason: 'not a party' },
+    ]);
+  });
+
+  it('refuses a folder without active/', () => {
+    const root = mkdtempSync(path.join(tmpdir(), 'pine-parties-'));
+    expect(readLegacyActive(root)).toEqual({
+      ok: false,
+      error: `${root} has no folder active/: name the legacy bot's parties folder.`,
+    });
+  });
+});
diff --git a/src/ops/legacy-parties.ts b/src/ops/legacy-parties.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b4bae63c4c09a1e87bd0142832bf64ff5ccd0fed
--- /dev/null
+++ b/src/ops/legacy-parties.ts
@@ -0,0 +1,77 @@
+import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
+import path from 'node:path';
+import { isSnowflake } from '../db/snowflake.js';
+
+/*
+ * The legacy bot's `parties/` folder, as the cleanup of legacy channels reads it: `active/` holds a
+ * file per party that had not ended (no extension, `{ key, value }`), whose `value.channelId` is
+ * the party's channel. Only the channel, the kind and the region channel are taken: the files hold
+ * member ids and names, which nothing here keeps or says.
+ */
+
+/** A legacy active party, as far as the cleanup needs it. */
+export interface LegacyActive {
+  /** The file's name in `active/`. */
+  file: string;
+  /** `raid`, `raid train` or `meet-up` (as the legacy bot wrote it). */
+  type: string;
+  /** The party's channel. */
+  channelId: string;
+  /** The region channel it was made from, if the file says. */
+  sourceChannelId: string | null;
+}
+
+export type LegacyActiveRead =
+  | {
+      ok: true;
+      parties: LegacyActive[];
+      /** Files that were not read, and why (`not JSON`, `not a party`, `no channel`). */
+      skipped: { file: string; reason: string }[];
+    }
+  | { ok: false; error: string };
+
+function isObject(value: unknown): value is Record<string, unknown> {
+  return typeof value === 'object' && value !== null && !Array.isArray(value);
+}
+
+/** The active parties of a legacy `parties` folder (the one that holds `active/`). */
+export function readLegacyActive(dir: string): LegacyActiveRead {
+  const active = path.join(dir, 'active');
+  if (!existsSync(active) || !statSync(active).isDirectory()) {
+    return {
+      ok: false,
+      error: `${dir} has no folder active/: name the legacy bot's parties folder.`,
+    };
+  }
+  const parties: LegacyActive[] = [];
+  const skipped: { file: string; reason: string }[] = [];
+  for (const file of readdirSync(active).sort()) {
+    const full = path.join(active, file);
+    if (!statSync(full).isFile()) continue;
+    let content: unknown;
+    try {
+      content = JSON.parse(readFileSync(full, 'utf8'));
+    } catch {
+      skipped.push({ file, reason: 'not JSON' });
+      continue;
+    }
+    const value = isObject(content) ? content.value : undefined;
+    if (!isObject(value)) {
+      skipped.push({ file, reason: 'not a party' });
+      continue;
+    }
+    const channelId = typeof value.channelId === 'string' ? value.channelId : '';
+    if (!isSnowflake(channelId)) {
+      skipped.push({ file, reason: 'no channel' });
+      continue;
+    }
+    const source = typeof value.sourceChannelId === 'string' ? value.sourceChannelId : '';
+    parties.push({
+      file,
+      type: typeof value.type === 'string' ? value.type : 'unknown',
+      channelId,
+      sourceChannelId: isSnowflake(source) ? source : null,
+    });
+  }
+  return { ok: true, parties, skipped };
+}
diff --git a/src/services/legacy-cleanup.ts b/src/services/legacy-cleanup.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b448ed3dbda219b05212f6246445c0f0094aaf2f
--- /dev/null
+++ b/src/services/legacy-cleanup.ts
@@ -0,0 +1,115 @@
+import type { Logger } from '../log.js';
+import type { DiscordDelete } from '../ops/discord-rest.js';
+import {
+  cleanupList,
+  deleteListed,
+  type CleanupEntry,
+  type CleanupList,
+  type DeleteOutcome,
+} from '../ops/legacy-cleanup.js';
+import { readLegacyActive } from '../ops/legacy-parties.js';
+
+/** What came of reading the legacy files: none given, unreadable, or how many were read. */
+export type LegacyFiles =
+  | { read: 'none' }
+  | { read: 'failed'; error: string }
+  | { read: 'ok'; files: number; skipped: number };
+
+export interface LegacyCleanupOptions {
+  /** Discord's REST API through the bot's client; undefined until it is connected. */
+  rest: () => DiscordDelete | undefined;
+  /** The bot's own user id, once connected. */
+  botId: () => string | undefined;
+  /** The names of the channels the settings name (`settings.channels`): never listed. */
+  settingsChannelNames: readonly string[];
+  /** The legacy `parties` folder (`LEGACY_PARTIES_DIR`, mounted read-only), if there is one. */
+  partiesDir: string | undefined;
+  /** The pause between two deletions. One second. */
+  pauseMs?: number;
+  /** Waits out the pause; a test passes one that does not. */
+  wait?: (ms: number) => Promise<void>;
+  log: Logger;
+}
+
+/**
+ * The cleanup of the legacy bot's party channels on Discord (`/admin cleanup-legacy`): the list
+ * from the legacy `active/` files and the server's channels (`cleanupList`), and the deletion of
+ * a list a person confirmed, one channel at a time, each logged.
+ */
+export class LegacyCleanup {
+  constructor(private readonly options: LegacyCleanupOptions) {}
+
+  private connected(): { rest: DiscordDelete; botId: string } {
+    const rest = this.options.rest();
+    const botId = this.options.botId();
+    if (!rest || botId === undefined) throw new Error('Discord is not connected yet');
+    return { rest, botId };
+  }
+
+  /** The channels the legacy files name (none without the folder), and how the reading went. */
+  private files(): { channelIds: string[]; files: LegacyFiles } {
+    const dir = this.options.partiesDir;
+    if (dir === undefined) return { channelIds: [], files: { read: 'none' } };
+    const read = readLegacyActive(dir);
+    if (!read.ok) {
+      this.options.log.warn({ dir }, 'the legacy parties folder cannot be read');
+      return { channelIds: [], files: { read: 'failed', error: read.error } };
+    }
+    return {
+      channelIds: read.parties.map((party) => party.channelId),
+      files: { read: 'ok', files: read.parties.length, skipped: read.skipped.length },
+    };
+  }
+
+  /**
+   * The list of a server, read only; its region channels, their forums and the channels the
+   * settings name are never in it.
+   */
+  async list(
+    guildId: string,
+    regions: readonly { channelId: string; forumChannelId: string | null }[],
+  ): Promise<{ list: CleanupList; files: LegacyFiles }> {
+    const { rest, botId } = this.connected();
+    const { channelIds, files } = this.files();
+    const list = await cleanupList(rest, {
+      guildId,
+      botId,
+      regionChannelIds: regions.map((one) => one.channelId),
+      regionForumIds: regions.flatMap((one) =>
+        one.forumChannelId === null ? [] : [one.forumChannelId],
+      ),
+      settingsChannelNames: this.options.settingsChannelNames,
+      legacyChannelIds: channelIds,
+    });
+    return { list, files };
+  }
+
+  /** Deletes what a person confirmed, one channel after the other; logs each. */
+  async remove(
+    entries: readonly CleanupEntry[],
+    by: string,
+    progress?: (done: number) => Promise<void> | void,
+  ): Promise<DeleteOutcome> {
+    const { rest } = this.connected();
+    const { log, wait } = this.options;
+    const outcome = await deleteListed(rest, entries, {
+      pauseMs: this.options.pauseMs ?? 1_000,
+      reason: 'A legacy party channel (/admin cleanup-legacy)',
+      ...(wait ? { wait } : {}),
+      ...(progress ? { progress } : {}),
+    });
+    for (const entry of outcome.deleted) {
+      log.info({ channel: entry.channelId, name: entry.name, by }, 'legacy channel deleted');
+    }
+    for (const entry of outcome.gone) {
+      log.info({ channel: entry.channelId, name: entry.name }, 'legacy channel was gone already');
+    }
+    for (const { entry, reason } of outcome.failed) {
+      log.warn(
+        { channel: entry.channelId, name: entry.name, reason },
+        'could not delete a legacy channel',
+      );
+    }
+    return outcome;
+  }
+}
diff --git a/src/services/pending-requests.ts b/src/services/pending-requests.ts
index 430d275931dd20d58107d1b8df811d670e18761d..600f7f864cf2100ef7b38b0df2c0787f0175b77d 100644
--- a/src/services/pending-requests.ts
+++ b/src/services/pending-requests.ts
@@ -1,5 +1,13 @@
 import { randomBytes } from 'node:crypto';
 
+/**
+ * What a member is told whose question is no longer known (`take` answered `expired`: answered
+ * already, too old, or from before a restart), and of a question another member asked
+ * (`not-yours`). Every question of a `PendingRequests` says these, in these words.
+ */
+export const EXPIRED = 'That has expired. Use the command again.';
+export const NOT_YOURS = 'That is somebody else’s question.';
+
 /**
  * What a command has to remember between asking a member something with buttons or a menu and
  * the answer: the values are kept in memory under a token that goes into the custom id of the
diff --git a/test/support/fake-discord-api.ts b/test/support/fake-discord-api.ts
index 2d3c6ca127a97c88b93fc0973bd77e1c4a778db9..0a2e1d6d64334f916bd183710b33c440ddbccc6f 100644
--- a/test/support/fake-discord-api.ts
+++ b/test/support/fake-discord-api.ts
@@ -16,8 +16,8 @@ export interface FakeApiChannel {
   type: ChannelType;
   parentId: string | null;
   overwrites: ApiOverwrite[];
-  /** The authors of its messages, oldest first. */
-  messages: string[];
+  /** Its messages, oldest first: their authors, or their authors and texts. */
+  messages: (string | { author: string; content: string })[];
   /** The bot may not read its messages (Discord answers 403, Missing Access). */
   unreadable?: boolean;
 }
@@ -74,8 +74,9 @@ export class FakeDiscordApi {
   /** Channels deleted, in order. */
   readonly deleted: string[] = [];
 
-  addGuild(name: string, ownerId = fakeSnowflake()): FakeApiGuild {
-    const id = fakeSnowflake();
+  addGuild(name: string, options: { id?: string; ownerId?: string } = {}): FakeApiGuild {
+    const id = options.id ?? fakeSnowflake();
+    const ownerId = options.ownerId ?? fakeSnowflake();
     const guild: FakeApiGuild = {
       id,
       name,
@@ -103,14 +104,15 @@ export class FakeDiscordApi {
     guild: FakeApiGuild,
     name: string,
     options: {
+      id?: string;
       type?: ChannelType;
       parentId?: string | null;
       overwrites?: ApiOverwrite[];
-      messages?: string[];
+      messages?: (string | { author: string; content: string })[];
     } = {},
   ): FakeApiChannel {
     const channel: FakeApiChannel = {
-      id: fakeSnowflake(),
+      id: options.id ?? fakeSnowflake(),
       name,
       type: options.type ?? ChannelType.GuildText,
       parentId: options.parentId ?? null,
@@ -213,7 +215,10 @@ export class FakeDiscordApi {
         throw new Error(`the fake answers only after=0&limit=1, not ${query?.toString() ?? ''}`);
       }
       const first = channel.messages[0];
-      return first === undefined ? [] : [{ id: `${channel.id}-1`, author: { id: first } }];
+      if (first === undefined) return [];
+      const { author, content } =
+        typeof first === 'string' ? { author: first, content: '' } : first;
+      return [{ id: `${channel.id}-1`, author: { id: author }, content }];
     }
     throw apiError(404, 0, '404: Not Found', 'GET', route);
   }
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 3d933aa27e571107def2c27148fbb9fafa3e5b6c..11094dea4b2dc3ea7f3e1afb457c6745a5a8937b 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -11,6 +11,7 @@ import type { RaidBossAdmin } from '../../src/services/raid-boss-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { RegionAdminService } from '../../src/services/region-admin-service.js';
+import type { LegacyCleanup } from '../../src/services/legacy-cleanup.js';
 import type { Screenshots } from '../../src/services/screenshot-service.js';
 import type { SpawnService } from '../../src/services/spawn-service.js';
 import type { TimedPartyService } from '../../src/services/timed-party-service.js';
@@ -89,6 +90,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'regionAdmin',
       'pass { regionAdmin, regions, gyms: directory, … } from regionAdminWith()',
     ),
+    legacyCleanup: unavailable<LegacyCleanup>(
+      'legacyCleanup',
+      'pass { legacyCleanup: new LegacyCleanup({ rest: () => api, … }) } over a FakeDiscordApi',
+    ),
     // No attachment can be downloaded; a test passes its own with files.
     attachments: new FakeAttachments(),
     // The invented regions belong to the guild of row 1, the server of the fake interactions.
````

### Task 6: Plan 8C T6: the runbook of the cutover, rehearsal and night

Prototype commit: `23c5716a6a39fd2e30c9f8dff45f1a9f658acbcb`

docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md, for Matt and an admin (never
run by an agent): what comes first (the bot role's permissions, an admin on hand, O1 and O3
as decided, the Synology share), then
- the rehearsal on Matt's PC (O1's default) as a second stack under var/rehearsal/: the
  admin's Integrations restriction (O2) and how to check it, the copy and the converter, the
  rehearsal block of the settings, restore and migrate, cutover-check with the legacy
  parties while the legacy bot runs, the window (emoji upload, deploy --rehearsal, up, the
  hidden forum, a raid, a train, a meetup, a DM, the cleanup's list), and its end
  (--clear-guild, the rehearsal's forum deleted, the legacy bot started again);
- the night, design section 4.4: the last check, the final dump and the copy to two places,
  the git bundle made on Matt's PC and cloned on the host, Debian with Docker and the NFS
  share, the converter and .env, restore, migrate, a first backup, up, the global commands,
  the admin's part (Integrations, setup-forums, cleanup-legacy), the sanity checks and what
  only the real host shows in the first days;
each step with its commands, what to check and what to do when it fails. After the review:
R1 first checks on the dev application whether the Integrations allowance beats a command's
default permission; R5 makes sure the legacy bot cannot restart itself while the new one is
logged in, and says what a rehearsal answers privately or refuses; R6 removes the commands
before ./pine down; N3 copies the bundle to the host. The README's "Run
with Docker" names the converter for a legacy installation.

**Files:**

```
 README.md                                                     |   4 +-
 docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md | 160 ++++++++++++++++++++++++++++++
 2 files changed, 163 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 23c5716a6a39fd2e30c9f8dff45f1a9f658acbcb -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing (and file modes match: `pine` is 100755).
- [ ] **Step 5: Commit** with the title `Plan 8C T6: the runbook of the cutover, rehearsal and night`, the body above and the trailer, staging exactly
  `README.md docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md`.

````diff
diff --git a/README.md b/README.md
index e1b032fb6bd3a2eb9fce6f55f052a887f19c2a84..0fa757c516460dfad6d2be5223bdafc6818d2d04 100644
--- a/README.md
+++ b/README.md
@@ -26,7 +26,9 @@ A host needs only Docker (with Compose) and git. Everything runs through `./pine
    `mkdir -p <BACKUP_DIR> && echo pine > <BACKUP_DIR>/.pine-backups` (a blank `BACKUP_DIR`
    switches backups off).
 2. Copy `data/settings.json` to `pine-settings.json` (beside `compose.yaml`, git-ignored) and
-   review it, especially `timezone`.
+   review it, especially `timezone`. Moving a legacy installation: `./pine convert-settings
+   <its data folder>` makes `pine-settings.json` and the lines of `.env` from its settings
+   (`docs/architecture/operations.md`, "Moving a legacy installation").
 3. A new install: `./pine up` creates the database and starts the bot, MySQL, the watchdog and
    the nightly backups. Taking over an existing database: `./pine restore <dump.sql>` first
    (`--replace` over a database that has tables; it is backed up first).
diff --git a/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md b/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
new file mode 100644
index 0000000000000000000000000000000000000000..e01a310b3ecf234708bd54329cdc26567d8ddc6a
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md
@@ -0,0 +1,160 @@
+# Pittsburgh's cutover: the runbook
+
+Matt and a server admin carry this out; an agent never runs it. It follows the cutover design (`docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md`, section 4.4 and the open questions O1 to O3) and uses the tools of plan 8C (`docs/architecture/operations.md`, "Moving a legacy installation"). Two parts: the rehearsal on Matt's PC, run once or more before the night, and the night itself.
+
+Words used below:
+
+- **the old host**: the Windows host that runs the legacy bot today (`<legacy bot folder>`, MySQL 8.0 with its nightly dumps in `<backup folder>\pine-YYYYMMDD.sql`), formatted on the night to become the Debian host.
+- **the checkout**: Matt's clone of this repository on his PC, on branch `typescript-migration` (the branch that ships until the first push).
+- **the copy**: what is copied off the old host: the dump, the legacy `data\settings.json` and `data\private-settings.json`, and the `parties\` folder (its `active\` files name the channels of the parties that had not ended; `complete\` is the history that 8H imports).
+- A step that says **contacts Discord** uses the production token: only in the order given here.
+
+## Before anything
+
+- [ ] Matt checks in the server that the bot's role has Manage Channels, Manage Roles and Manage Threads (the cutover check lists all it needs, with why).
+- [ ] An admin with Manage Server is on hand for the rehearsal's window and for the night (Integrations, `/admin setup-forums`, `/admin cleanup-legacy`).
+- [ ] O1 (where the rehearsal runs): Matt's PC with Docker Desktop unless Matt names a Linux box; the steps below are for his PC and work the same on Linux.
+- [ ] O3 (the legacy intents patch): by default it ships with the first push and nothing goes to the old host before the night.
+- [ ] The Synology share for the backups exists (an NFS export of a folder owned by a NAS user; note that user's uid and gid).
+
+## Part 1: the rehearsal (Matt's PC)
+
+The rehearsal is a second stack beside nothing else of production: its own project name (`pine-rehearsal`, which its env file names: `./pine` never sets it, so that a rehearsal's `down` or `restore --replace` cannot act on another stack), its own files under the git-ignored `var/rehearsal/` of the checkout, its own image (`professor-pine:pine-rehearsal`), no backups. Every `./pine` command of this part runs in Git Bash at the checkout's root with these two variables set first:
+
+```sh
+export PINE_ENV_FILE=var/rehearsal/.env
+export PINE_SETTINGS=./var/rehearsal/pine-settings.json
+```
+
+### R1. The admin restricts the commands (O2)
+
+A bot cannot give command access to single members. During the rehearsal the commands are registered for the one server only, with Manage Server as their default permission, so members without it never see them; Matt has no Manage Server, so:
+
+- [ ] First, on the test server with the dev application (Matt's go-ahead; nothing of production): deploy with `npm run deploy-commands -- --rehearsal` under a rehearsal setting, let a test account without Manage Server in under Integrations → the application → "Roles & Members", and check that it then sees the commands. Discord's documentation does not say whether that allowance beats a command's default permission; if it does not, the admin adds the testers to each command instead (or the rehearsal deploys without the default permission and relies on the Integrations restriction alone: decide before the window).
+
+- [ ] The admin opens Server Settings → Integrations → Professor Pine and, under "Roles & Members" of the application as a whole, adds Matt (and every member of the allowlist below) and the moderators' role. The legacy bot has no slash commands, so nothing else changes.
+- What to check: after R5, Matt sees `/raid` and `/admin` in the server; a member's account (a test account, if there is one) sees no Professor Pine command. If Matt does not see them, the admin adds him to each command by hand under the same page; if a member sees them, end the window (R6) and look at the Integrations page again.
+
+### R2. The copy and the settings
+
+- [ ] On the old host: copy the newest nightly dump (`<backup folder>\pine-YYYYMMDD.sql`), `<legacy bot folder>\data\settings.json`, `<legacy bot folder>\data\private-settings.json` and `<legacy bot folder>\parties\` to Matt's PC, outside the checkout (say `C:\Users\<you>\pine-backups\rehearsal\`): they hold the token and member ids.
+- [ ] Settings and `.env` from the legacy files (Matt runs it: it reads the private settings):
+
+  ```sh
+  mkdir -p var/rehearsal
+  ./pine convert-settings /c/Users/<you>/pine-backups/rehearsal/data --out var/rehearsal
+  ```
+
+  It prints what it kept, renamed and dropped, and which values of `.env` are set or empty, never a value. Check the line "New settings at their defaults": the `timezone` (America/New_York) is right for Pittsburgh.
+- [ ] `cp .env.example var/rehearsal/.env`, then put the lines of `var/rehearsal/env-from-legacy.txt` into it and fill in by hand: `COMPOSE_PROJECT_NAME=pine-rehearsal` (first of all: it names the stack), `DISCORD_APP_ID` (Developer Portal → the production application → General Information), `DB_ROOT_PASSWORD` (new, anything), `DB_USER` if the legacy one was `root`, `BACKUP_DIR=` blank (no backups in a rehearsal), `LEGACY_PARTIES_DIR=C:/Users/<you>/pine-backups/rehearsal/parties` (in the form Docker Desktop takes, with forward slashes). Then delete `var/rehearsal/env-from-legacy.txt`.
+- [ ] Turn rehearsal mode on in `var/rehearsal/pine-settings.json` (top level):
+
+  ```json
+  "rehearsal": {
+    "allowlist": ["<Matt's user id>", "<each tester's id>"],
+    "regions": ["squirrelbreeze"],
+    "staffRoles": ["<the moderators' role name>"]
+  }
+  ```
+
+### R3. The database
+
+- [ ] `./pine restore /c/Users/<you>/pine-backups/rehearsal/pine-YYYYMMDD.sql --no-start` (a later rehearsal: add `--replace --no-backup`). It says "Loaded a legacy Professor Pine database", the tables and their rows, and that it renamed the lower-case tables.
+- [ ] `./pine migrate`: the takeover runs without logging in. A failure here is a finding for the night: stop and look.
+
+### R4. The go / no-go, with the legacy bot still running (contacts Discord, reading only)
+
+- [ ] `./pine cutover-check --legacy-parties /c/Users/<you>/pine-backups/rehearsal/parties`
+- What to check: no `FAIL`. Expected warnings: every region without a forum (the night makes them), perhaps a few channels or roles of the settings that the server lacks (fix the settings or the server). `intents` passes (the settings ask for none). `emoji` warns until R5's upload. `cleanup` counts the legacy channels; a `WARN` there lists channels a person judges on the night. On a `FAIL`: the line says what; fix it (the bot's role, a category's overwrites, `DISCORD_APP_ID`) and run the check again.
+
+### R5. The rehearsal's window (contacts Discord; the legacy bot is off for its length)
+
+- [ ] Stop the legacy bot on the old host (as it runs there), and make sure it cannot start again by itself while the new one is logged in (its service set to manual, a scheduled task or a watchdog that restarts it switched off): two bots on one token take each other's gateway sessions.
+- [ ] `./pine emoji-upload` (a dry run), then `./pine emoji-upload --apply`: the application gets the game's icons (once; later rehearsals find them).
+- [ ] `./pine deploy-commands --rehearsal`: the commands as the server's own, for staff only. (`--global` is refused while rehearsal mode is on.)
+- [ ] `./pine up`, then `./pine status`: the bot's line ends with "REHEARSAL MODE IS ON". Matt gets a DM "Professor Pine started: rehearsal mode is on…". The log (`./pine logs pine`) starts with the warning line.
+- [ ] The admin runs `/admin setup-forums`: only `squirrelbreeze` gets a forum, "hid it from all but staff and the testers", and the closing line says rehearsal mode. A member's account must not see the forum.
+- [ ] Matt, in `#squirrelbreeze`: a raid (`/raid`), a train, a meetup; sign up, change, end. Each post is in the hidden forum; nothing appears in `#squirrelbreeze` itself (no "New raid" link), nor in the remote or elite channels, nor in bot-updates.
+- [ ] A DM: Matt sets a want (`/want`) and reports that boss: the DM comes. A want of a member not on the allowlist gets nothing (the log says "a direct message to a member not on the allowlist was dropped").
+- [ ] `/admin cleanup-legacy` (the admin): the list, with "Rehearsal mode: nothing is deleted now" and no Delete button. Check the list against the server: every "To delete" entry is a legacy party channel; every "Not deleted" entry is judged.
+- [ ] A screenshot posted with a mention of the bot gets no answer, not even Matt's (the trigger is off in rehearsal mode); `/raid` with a screenshot is answered privately. A command used in a region channel answers privately; `/request` is refused.
+
+### R6. The end of the window
+
+- [ ] `./pine deploy-commands --clear-guild`: the server's commands go (the night registers them globally; both at once would show each command twice). It names each server first and says each removal or failure.
+- [ ] The admin deletes the rehearsal's forum (`squirrelbreeze-meetups`) by hand: the night's database knows nothing of it.
+- [ ] `./pine down` (after the removal, which starts the database for its list of servers).
+- [ ] Start the legacy bot on the old host again, and let it restart itself again as before. The Integrations restriction stays until the night (the legacy bot has no slash commands).
+- What failed or surprised goes to the follow-ups ("From the rehearsal").
+
+## Part 2: the night
+
+### N1. The last go / no-go (Matt's PC, the legacy bot still running)
+
+- [ ] On the old host, a fresh dump (the nightly one may be a day old):
+
+  ```bat
+  "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p --single-transaction --routines --triggers --events --hex-blob <schema> > <backup folder>\pine-cutover-check.sql
+  ```
+
+  (`<schema>` is `db.schema` of the private settings; the dump must end with `-- Dump completed`.)
+- [ ] Copy it to Matt's PC, `./pine restore <it> --replace --no-backup --no-start` and `./pine cutover-check --legacy-parties <the parties copy>` in the rehearsal stack (the variables of Part 1 set, rehearsal mode left on: the check does not log in). No `FAIL`, or stop the night here.
+
+### N2. Stop the legacy bot; the final copy
+
+- [ ] Stop the legacy bot on the old host. From here on the server has no bot.
+- [ ] The final dump, as in N1, to `<backup folder>\pine-final.sql`.
+- [ ] Copy `<backup folder>\pine-final.sql`, `<legacy bot folder>\data\` and `<legacy bot folder>\parties\` to two places: Matt's PC and the Synology. The `parties` folder holds seven years of raids that exist nowhere else; it is kept after its import.
+- [ ] On Matt's PC, the code for the host as a bundle (nothing is pushed before the cutover):
+
+  ```sh
+  git bundle create pine-cutover.bundle typescript-migration
+  git bundle verify pine-cutover.bundle
+  ```
+
+  Copy the bundle with the dump.
+
+### N3. The new host
+
+- [ ] Format the old host; install Debian 13 (no desktop needed), with an account for Matt.
+- [ ] Docker Engine with the Compose plugin, from Docker's own apt repository (docs.docker.com/engine/install/debian), and git and the NFS client: `sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git nfs-common`; `sudo usermod -aG docker <Matt's account>`, log in again. Check: `docker compose version`.
+- [ ] The backup share: `sudo mkdir -p /srv/pine-backups`, a line in `/etc/fstab` such as `<synology>:/volume1/pine-backups /srv/pine-backups nfs defaults,_netdev 0 0`, `sudo mount -a`, then once `echo pine > /srv/pine-backups/.pine-backups` (the marker names the stack the folder belongs to; as the share's owner if root is squashed). Check: `ls -la /srv/pine-backups`.
+- [ ] The copy onto the host (say under `/srv/legacy/`: `pine-final.sql`, `data/`, `parties/` and `pine-cutover.bundle`), and the code:
+
+  ```sh
+  git clone --branch typescript-migration /srv/legacy/pine-cutover.bundle ~/professor-pine
+  cd ~/professor-pine
+  ```
+
+  After the first push: `git remote set-url origin https://github.com/Googer/Professor-Pine.git`. Until then `./pine update` has nothing to pull from; a fix before it comes as a new bundle: `git pull /path/to/new.bundle typescript-migration`, then `./pine update`'s steps by hand (`./pine backup`, `./pine up`).
+
+### N4. Settings, database, start (contacts Discord from `./pine up` on)
+
+- [ ] `./pine convert-settings /srv/legacy/data` (writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml`; no rehearsal block).
+- [ ] `cp .env.example .env`; put in the lines of `env-from-legacy.txt` and fill in: `DISCORD_APP_ID`, `DB_ROOT_PASSWORD`, `DB_USER` if it was root, `BACKUP_DIR=/srv/pine-backups`, `BACKUP_UID` / `BACKUP_GID` (the NAS user's, for a share that squashes root), `LEGACY_PARTIES_DIR=/srv/legacy/parties`. Then `chmod 600 .env` and `rm env-from-legacy.txt`.
+- [ ] `./pine restore /srv/legacy/pine-final.sql --no-start`, then `./pine migrate`. On a failure: the sentence says why; fix forward from the dump (`./pine restore … --replace --no-start` starts again).
+- [ ] `./pine backup`: the first verified backup lands on the share. On a failure: the share (mounted? the marker? the uid?), `./pine status` says the reason.
+- [ ] `./pine up`, then `./pine status`: healthy, connected, the last backup, and no "REHEARSAL MODE" in the line. `./pine logs pine` shows the takeover's migrations, then "connected to Discord".
+- [ ] `./pine deploy-commands` (global; the commands can take a while to show).
+
+### N5. The admin
+
+- [ ] Server Settings → Integrations → Professor Pine: lift the rehearsal's restriction (R1), so that members see the commands.
+- [ ] The bot's role: what the cutover check asked for, if anything is still missing.
+- [ ] `/admin setup-forums`: every region gets its forum, its tags and its pinned list. A region that fails says why (most often a category's overwrites: Manage Channels, Manage Threads).
+- [ ] `/admin cleanup-legacy`: read the list. "To delete" holds the channels of the legacy files and the orphans; "Not deleted" is for a person (delete by hand what should go). Then "Delete these n channels" within ten minutes; the answer says what was deleted, what was gone and what failed.
+
+### N6. Sanity checks
+
+- [ ] A raid, a train, a meetup in a region: the post, the link in the region channel, sign-ups, the end.
+- [ ] A DM from a want; the Stop button.
+- [ ] A screenshot with a mention of the bot.
+- [ ] The website through the tunnel, if plan 8M is in.
+- [ ] Then the final cleanup migration of the design (4.5), once it is built; until then nothing.
+
+### N7. After
+
+- [ ] The announcement in #bot-updates (plan 8L-2's draft).
+- [ ] The history import of the legacy parties whenever convenient (plan 8H).
+- [ ] The next morning: `./pine status` shows the night's backup (03:30) as verified; the Synology has `pine-backup-YYYYMMDD.sql.gz`.
+- What only the real host shows, and is watched in the first days: the NFS mount after a reboot, the nightly schedule over several days, the watchdog's alerts (a DM to Matt if the bot is stuck or a backup fails).
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8c HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-8c-cutover-tools.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. The final fix wave: the third review's C1–C10 (`.superpowers/sdd/2026-10-16-phase-8c-cutover-tools/rereview-findings.md`): `cutover-check --legacy-parties` works (C1, Important), the bot keeps its forum permissions in a hidden forum, the runbook and a config warning keep the web pages off in a rehearsal, a long cleanup capped, staff role names compared one way, the channel operations guarded, router tests of public and late answers, and the nits.
3. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8C"), the Gantt chart and memory.

## Staging checklist

The runbook `docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md` (task 6) is the staging of this plan: its rehearsal (R1–R6) on Matt's PC with the production token, an admin's Integrations restriction first, each step with Matt's go-ahead. Before it, on the dev application and the test server: `./pine convert-settings` on a copy of the legacy files, `./pine cutover-check` against the dev database, rehearsal mode with a test allowlist (a member off the list sees no forum, no answer, no DM), `/admin cleanup-legacy` on made-up legacy channels.
