# Phase 9A: The Docker Stack: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The whole of Pine runs from a fresh clone on a host that has only Docker and git: an image of the bot, a Compose stack (MySQL, the bot, a watchdog, a verified nightly backup, the slot for plan 8M's tunnel), a heartbeat and owner DMs on crashes, a restore of a legacy or Pine dump (Windows' lower-case tables renamed), and the operator script `./pine` for every step.

**Architecture:** The first plan of the cutover work designed in `docs/superpowers/specs/2026-10-16-cutover-docker-history-design.md` (sections 4.1, 4.4, 6), after the legacy intents patch (8L-1, branch `legacy`). The image is multi-stage on `node:24-slim`, production dependencies without install scripts, no legacy code. The bot writes `var/health/status.json` (no listener: plan 8M owns the web server); `dist/ops/health-cli.js` turns it into a verdict with a kind (healthy, starting, stale, missing, unreadable, slow-start, gateway, database), the Compose healthcheck and the watchdog's input. The watchdog (the same image, the Docker socket) restarts only a stuck bot and DMs the owner about the rest. Backups run on the `mysql:8.0` image (`docker/backup.sh`): a gzipped dump into a host folder that must hold a `.pine-backups` marker, verified by loading it into a scratch `mysqld`. `./pine restore` checks a dump before stopping anything, streams it into the stack's MySQL and lets `src/ops/restore.ts` rename and report; the migrator then takes the database over as before, and now refuses a lower-cased one before writing.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js 14.27 (REST for owner DMs, shard status for the gateway probe), Docker Engine API over the socket with Node's `http`, Docker Compose, MySQL 8.0, POSIX `sh` (shellcheck clean). No new npm dependency. **No migration.** No command definition changed: no registration.

**Spec:** the design brief `.superpowers/sdd/2026-10-16-phase-9a-docker-stack/design.md` (git-ignored; T1–T8) and the design document above. Matt approved the design in conversation on 2026-10-16 ("this sounds good") and asked to keep going overnight; the open questions are listed below.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-9a`), one commit per task, each commit typechecked with its own unit and database tests green, and the full check, build and database suite clean on the tip (6,211 unit tests, 340 database tests). It was checked for real on Docker Desktop in a scratch stack, without the bot ever logging in: the production dump of 2026-10-14 restored (15 tables renamed, a legacy database of 17 tables), `./pine migrate` ran all 15 migrations, cut-off dumps were refused before anything stopped, a verified backup ran as a non-root `BACKUP_UID`, a folder without the marker was refused, `restore --replace` made a backup first. Two Opus reviewers went through the prototype (T1–T4, T5–T8), a third through the fixes, which are folded into the commits below. The third review's minor findings (R1–R11) are the final fix wave, after the last task.

## Decisions in this plan

Matt's (2026-10-15/16, in the design): one Compose stack is all of Pine; a host needs only Docker and git; a fourth container, the watchdog, health-checks Pine for real; backups nightly to the Synology over NFS, 90 days, each verified; restore of production's dump onto the new host; fix forward, no rollback machinery.

Made while prototyping, for Matt to look at:

1. **Health is a heartbeat file, not an HTTP endpoint**, so the web server of plan 8M stays the only listener. Connected to Discord means every shard Ready and its heartbeat acknowledged within three minutes (discord.js never sets `client.ws.status` back).
2. **A start is healthy however long its migrations take** while the heartbeat is fresh; after half an hour it is `slow-start` (alert only). A stop during the start takes effect after the step under way, never inside the migrations.
3. **The watchdog restarts only a stuck bot** (stale or missing heartbeat, 5 minutes); database, Discord and a slow start only DM the owner (after 15 minutes, once a spell). It holds the Docker socket, root in effect; a socket proxy is noted as hardening for later.
4. **Operator settings are `pine-settings.json` at the repository root** (git-ignored; made from `data/settings.json`, later by plan 8C's converter); `npm start` and the tests keep `data/settings.json`.
5. **Table names stay case-sensitive** (`lower_case_table_names=0`); a Windows dump is renamed on restore.
6. **Backups:** `pine-backup-YYYYMMDD.sql.gz`, kept exactly `BACKUP_KEEP_DAYS`, only the stack's own files deleted; written as `BACKUP_UID:BACKUP_GID` (for an NFS share that squashes root); `./pine update` and `restore --replace` make a verified backup first.
7. **`./pine restore` starts the stack only on a terminal or with `--start`**, since starting logs the bot in.
8. **Not built:** spec 9.2's profile for an external MySQL (an instance restores its dump into the stack instead); the image has no `tsx` scripts (`emoji:upload`, `role-auth:export` become compiled CLIs in plan 8C).

Open for Matt: **O4** MySQL 8.0 reached its end of life in April 2026; the stack and the tests stay on 8.0 until Matt decides on 8.4 LTS. NFS root_squash on the Synology and arm64 are untested.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord (no `./pine up`, `restart`, `update`, `restore --start`, `deploy-commands`, `npm start`), never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network.** No test waits on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-9a`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed. `pine` and `docker/backup.sh` are mode 755 and LF (`.gitattributes`).
- A task needs the typecheck and its own tests green; the full `npm run check`, the build and `npm run test:db` after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Nothing that loses data: restore's checks before anything stops, `--replace` and `update` backed up first, retention deleting only its own files, a backup never written to an unmounted share.
2. Nothing that takes the bot down needlessly or kills it mid-migration: the start phase, the signal handling, the watchdog's restart rule.
3. Health that tells the truth: the shard probe, the heartbeat's verdicts, the alerts' rate limits across restarts.
4. The shell: POSIX `sh`, quoting, Git Bash on Windows, sentences for errors, nothing that needs Node on the host.
5. `CLAUDE.md`, `docs/architecture/operations.md`, the README and the CI job match the code.

### Task 1: Plan 9A T1: Docker image: the bot on node:24-slim, production dependencies only

Prototype commit: `bb57c0ef5249e964d7d719e9a033cfb3262e7461`

A multi-stage Dockerfile: the build stage compiles with npm ci and npm run build, the
runtime stage has the production dependencies (installed without install scripts, as in
the checkout), dist/, package.json and the default settings, runs as the node user with
NODE_ENV=production and stops on SIGTERM. onnxruntime-node keeps its library for the
image's platform only (linux x64, or arm64 when built for it). var/ belongs to the node
user so that a new volume there is writable. The .dockerignore lets only what the build
needs into the context: never .env, var/, .git, node_modules or the legacy bot.

**Files:**

```
 .dockerignore | 10 ++++++++++
 Dockerfile    | 49 +++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 59 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bb57c0ef5249e964d7d719e9a033cfb3262e7461 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T1: Docker image: the bot on node:24-slim, production dependencies only`, the body above and the trailer, staging exactly
  `.dockerignore Dockerfile`.

````diff
diff --git a/.dockerignore b/.dockerignore
new file mode 100644
index 0000000000000000000000000000000000000000..d74a0cd7069270197bda3af5008690e2139e990b
--- /dev/null
+++ b/.dockerignore
@@ -0,0 +1,10 @@
+# Only what the image is built from goes to Docker: everything else (`.env`, `var/`, `.git`,
+# `node_modules`, `dist/`, the docs, the legacy bot, the tests) stays out.
+*
+!package.json
+!package-lock.json
+!tsconfig.json
+!tsconfig.build.json
+!src/
+!data/settings.json
+src/**/*.test.ts
diff --git a/Dockerfile b/Dockerfile
new file mode 100644
index 0000000000000000000000000000000000000000..bf5e39b3c326f59dfa8fb9d13f172de9297ce508
--- /dev/null
+++ b/Dockerfile
@@ -0,0 +1,49 @@
+# Professor Pine: the bot, its watchdog and its one-off commands (migrate, deploy-commands,
+# restore, health), all from this one image. Built by `./pine up` (compose.yaml); see
+# docs/architecture/operations.md.
+
+# The compiled bot. `--ignore-scripts`: no dependency needs its install script for the build or
+# the CPU (esbuild's, onnxruntime-node's CUDA download, sharp's, protobufjs's, ssh2's), as in the
+# checkout under npm 11's allow-scripts policy; the flag makes it so whatever npm the base has.
+FROM node:24-slim AS build
+WORKDIR /app
+COPY package.json package-lock.json ./
+RUN npm ci --ignore-scripts --no-audit --no-fund
+COPY tsconfig.json tsconfig.build.json ./
+COPY src ./src
+RUN npm run build
+
+# The production dependencies, with the screen reader's runtime for this platform only.
+FROM node:24-slim AS deps
+ARG TARGETARCH
+WORKDIR /app
+COPY package.json package-lock.json ./
+RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
+# onnxruntime-node ships its library for every platform (about 290 MB); one is kept.
+RUN set -eu; \
+    case "${TARGETARCH:-amd64}" in \
+      amd64) keep=x64 ;; \
+      arm64) keep=arm64 ;; \
+      *) echo "no screen reader runtime for ${TARGETARCH}" >&2; exit 1 ;; \
+    esac; \
+    bin=node_modules/onnxruntime-node/bin/napi-v6; \
+    test -d "$bin/linux/$keep"; \
+    find "$bin" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +; \
+    find "$bin/linux" -mindepth 1 -maxdepth 1 ! -name "$keep" -exec rm -rf {} +
+
+FROM node:24-slim
+ENV NODE_ENV=production
+WORKDIR /app
+# `package.json` says the compiled files are ES modules.
+COPY package.json ./
+COPY --from=deps /app/node_modules ./node_modules
+COPY --from=build /app/dist ./dist
+# The default settings; the stack mounts the installation's own over it.
+COPY data/settings.json ./data/settings.json
+# `var/` is a volume (game data cache, map pictures, the screen reader's models and screenshots,
+# the health files): a new volume takes this folder's owner, so the bot can write to it.
+RUN mkdir -p var && chown node:node var
+USER node
+# The bot shuts down cleanly on SIGTERM (src/index.ts); compose.yaml gives it the time.
+STOPSIGNAL SIGTERM
+CMD ["node", "--enable-source-maps", "dist/index.js"]
````

### Task 2: Plan 9A T2: Compose stack: MySQL and the bot, run through ./pine

Prototype commit: `b814bfdc545e601858dc443a80211ae473e70fb2`

compose.yaml has the services mysql (mysql:8.0, utf8mb4 with the bot's collation, table names
case sensitive, a named volume, a healthcheck over TCP) and pine (the image, .env whole, the
installation's settings mounted read-only, var/ a volume, waiting for a healthy MySQL,
restarted unless stopped, two and a half minutes to shut down: the sum of its steps' limits
and some), and a commented slot for the tunnel of plan 8M. Inside the stack the bot reaches
MySQL as mysql:3306 whatever .env says, and the database, its user and the root password are
made from the same .env values.

The installation's settings are pine-settings.json beside compose.yaml (git-ignored, made from
data/settings.json), never the repository's file: ./pine refuses to run without it, as
without .env, and says how to make it.

./pine is a POSIX sh script with the first commands: up, down, restart, logs, status,
migrate (the migrations in a one-off container, no Discord). .gitattributes keeps it and the
shell scripts LF. .env.example says what the stack ignores and adds DB_ROOT_PASSWORD.

**Files:**

```
 .env.example    |  13 ++++++-
 .gitattributes  |   4 +++
 .gitignore      |   2 ++
 .prettierignore |   1 +
 compose.yaml    |  78 +++++++++++++++++++++++++++++++++++++++++
 pine            | 146 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 6 files changed, 243 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff b814bfdc545e601858dc443a80211ae473e70fb2 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T2: Compose stack: MySQL and the bot, run through ./pine`, the body above and the trailer, staging exactly
  `.env.example .gitattributes .gitignore .prettierignore compose.yaml pine`.

````diff
diff --git a/.env.example b/.env.example
index 99299f748b53b44490a0c118711a0329f708661b..2dafc27f451e6ba52b65f0f4455f8d9f9069b0eb 100644
--- a/.env.example
+++ b/.env.example
@@ -6,7 +6,10 @@ DISCORD_APP_ID=
 # Your Discord user ID; always counts as an admin
 OWNER_ID=
 
-# MySQL: the existing Professor Pine database, or an empty schema for a new install
+# MySQL: the existing Professor Pine database, or an empty schema for a new install.
+# In the Docker stack DB_HOST and DB_PORT are ignored (the bot reaches the stack's MySQL as
+# mysql:3306), and DB_USER, DB_PASSWORD and DB_SCHEMA also create that user and database on the
+# stack's first start (DB_USER must not be root).
 DB_HOST=localhost
 DB_PORT=3306
 DB_USER=
@@ -30,3 +33,11 @@ LOG_LEVEL=info
 # development enables pretty logs
 NODE_ENV=production
 # SETTINGS_PATH=data/settings.json
+
+# ---- Docker stack (compose.yaml, ./pine) ----
+# Compose reads this file for the values of compose.yaml and hands it whole to the bot. Quote a
+# value that holds a $ with single quotes ('pa$$word'), or Compose reads the $ as a variable.
+# Ignored there: DB_HOST, DB_PORT, NODE_ENV and SETTINGS_PATH (the stack sets them).
+# The settings are pine-settings.json beside compose.yaml (copy data/settings.json; git-ignored).
+# The password of MySQL's root user in the stack, set on its first start; the bot never sees it.
+DB_ROOT_PASSWORD=
diff --git a/.gitattributes b/.gitattributes
new file mode 100644
index 0000000000000000000000000000000000000000..c22f2507ed21f74ad19090ce25fe8160bfce960f
--- /dev/null
+++ b/.gitattributes
@@ -0,0 +1,4 @@
+# Shell scripts run in Linux containers and under sh on the host: LF on every checkout, also on
+# Windows with core.autocrlf, or sh reads a carriage return into every line.
+/pine text eol=lf
+*.sh text eol=lf
diff --git a/.gitignore b/.gitignore
index f086531e902cdfa53c661547f0279094f8f37962..a1038e06800c9fb994051a719e9a0363ba1a5b49 100644
--- a/.gitignore
+++ b/.gitignore
@@ -32,3 +32,5 @@ dist/
 coverage/
 var/
 .env
+# the settings of a Docker installation (./pine)
+/pine-settings.json
diff --git a/.prettierignore b/.prettierignore
index ac6eb8b646d9bf98db6e8a3855b3b43ffbaa07d5..ac8fe1f81c574a387cdcda2f6a29a57ea7149f02 100644
--- a/.prettierignore
+++ b/.prettierignore
@@ -1,6 +1,7 @@
 dist/
 coverage/
 var/
+/pine-settings.json
 node_modules/
 package-lock.json
 /index.js
diff --git a/compose.yaml b/compose.yaml
new file mode 100644
index 0000000000000000000000000000000000000000..8f9fe242bf21089217897ee4a486d21717c3decb
--- /dev/null
+++ b/compose.yaml
@@ -0,0 +1,78 @@
+# The whole of Professor Pine: the bot and its MySQL. Run it through `./pine` (see
+# `./pine help` and docs/architecture/operations.md); the host needs only Docker and git.
+#
+# Settings and secrets: `.env` beside this file (copy `.env.example`), read by Compose for the
+# values below and handed to the bot whole; the installation's settings, `pine-settings.json`
+# beside it (git-ignored; made from `data/settings.json`), mounted read-only.
+name: pine
+
+services:
+  mysql:
+    image: mysql:8.0
+    # utf8mb4 with the collation the bot's tables are created with. Table names stay case
+    # sensitive (lower_case_table_names=0, the Linux default, and only settable when the data
+    # directory is created): the bot's tables are named `Guild`, `GymMeta` and so on, and a dump
+    # from a Windows server, whose names are lower case, is renamed by `./pine restore`.
+    command:
+      - --character-set-server=utf8mb4
+      - --collation-server=utf8mb4_0900_ai_ci
+      - --lower-case-table-names=0
+    environment:
+      # The database and the bot's user are made from the bot's own settings on the first start.
+      MYSQL_DATABASE: ${DB_SCHEMA:?DB_SCHEMA must be set in .env}
+      MYSQL_USER: ${DB_USER:?DB_USER must be set in .env}
+      MYSQL_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set in .env}
+      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD must be set in .env}
+    volumes:
+      - mysql-data:/var/lib/mysql
+    healthcheck:
+      # Over TCP: the server the image runs while it creates a new database listens on no port.
+      test: ['CMD-SHELL', 'MYSQL_PWD="$$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 -uroot']
+      interval: 10s
+      timeout: 5s
+      retries: 6
+      start_period: 2m
+    restart: unless-stopped
+
+  pine:
+    build: .
+    image: professor-pine:local
+    env_file: ${PINE_ENV_FILE:-.env}
+    environment:
+      # Inside the stack the database is the `mysql` service, whatever `.env` says.
+      DB_HOST: mysql
+      DB_PORT: '3306'
+      NODE_ENV: production
+      SETTINGS_PATH: data/settings.json
+      # The bot needs no root password: the one in `.env` is MySQL's only.
+      DB_ROOT_PASSWORD: ''
+    volumes:
+      - ${PINE_SETTINGS:-./pine-settings.json}:/app/data/settings.json:ro
+      - pine-var:/app/var
+    depends_on:
+      mysql:
+        condition: service_healthy
+    # tini as process 1: it hands SIGTERM to the bot and reaps the screen reader's process.
+    init: true
+    restart: unless-stopped
+    # Every shutdown step has its own limit (src/app.ts); all of them together come to just under
+    # two minutes, of which the queued direct messages take up to fifteen seconds.
+    stop_grace_period: 2m
+    # No port of the bot is published to the host.
+
+  # cloudflared: plan 8M fills this slot. The bot's web server listens on 0.0.0.0 inside this
+  # network (settings `web.listen`, `web.port`), its port is not published, and the tunnel
+  # reaches it as http://pine:<port>; the token comes from `.env`, never from a file here.
+  #
+  # cloudflared:
+  #   image: cloudflare/cloudflared:latest
+  #   command: tunnel --no-autoupdate run
+  #   environment:
+  #     TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN must be set in .env}
+  #   depends_on:
+  #     - pine
+  #   restart: unless-stopped
+
+volumes:
+  mysql-data:
+  pine-var:
diff --git a/pine b/pine
new file mode 100755
index 0000000000000000000000000000000000000000..b3f20d7b59814a4d5fb77ede4e3d1721f55cd6fa
--- /dev/null
+++ b/pine
@@ -0,0 +1,146 @@
+#!/bin/sh
+# Professor Pine's operator commands: every step of running the stack is `./pine <command>`
+# (`./pine help` lists them). POSIX sh, for Debian and for Git Bash on Windows; it needs Docker
+# with Compose, and git for `update`, nothing else on the host. See
+# docs/architecture/operations.md.
+#
+# A command is a function `cmd_<name>` (a hyphen in the name is an underscore here) and a line of
+# `usage`; nothing else needs to know of it.
+set -eu
+
+# Git Bash would turn every argument that starts with a slash (a path in a container) into a
+# Windows path. Elsewhere the variable means nothing.
+MSYS_NO_PATHCONV=1
+export MSYS_NO_PATHCONV
+
+cd "$(dirname "$0")"
+
+# The settings and secrets of the stack; other files for a second stack on the same machine
+# (with COMPOSE_PROJECT_NAME). compose.yaml reads the variables for the bot's `env_file` and its
+# settings. The settings are the installation's own, never the repository's `data/settings.json`.
+PINE_ENV_FILE=${PINE_ENV_FILE:-.env}
+PINE_SETTINGS=${PINE_SETTINGS:-./pine-settings.json}
+# Compose takes a bare name for a volume's: a relative path starts with ./ for it.
+case $PINE_SETTINGS in
+  /* | ./* | ../* | [A-Za-z]:*) ;;
+  *) PINE_SETTINGS=./$PINE_SETTINGS ;;
+esac
+export PINE_ENV_FILE PINE_SETTINGS
+
+say() {
+  printf '%s\n' "$*"
+}
+
+fail() {
+  printf 'pine: %s\n' "$*" >&2
+  exit 1
+}
+
+compose() {
+  docker compose --env-file "$PINE_ENV_FILE" "$@"
+}
+
+# A Compose command, said before it runs.
+run() {
+  say "> docker compose $*"
+  compose "$@"
+}
+
+need_stack() {
+  command -v docker >/dev/null 2>&1 ||
+    fail "Docker is not installed (or not on the PATH). The stack needs Docker with Compose."
+  docker compose version >/dev/null 2>&1 ||
+    fail "Docker Compose is missing: 'docker compose version' does not answer."
+  [ -f "$PINE_ENV_FILE" ] ||
+    fail "There is no $PINE_ENV_FILE here. Copy .env.example to .env and fill it in."
+  # Without it Docker would mount an empty folder in its place.
+  [ -f "$PINE_SETTINGS" ] ||
+    fail "There is no $PINE_SETTINGS here. Copy data/settings.json to pine-settings.json and edit it (timezone, channel names)."
+}
+
+# The bot's image, built from this checkout (quick when nothing changed).
+build_image() {
+  say "Building the bot's image from this checkout."
+  run build pine
+}
+
+# MySQL alone, started and healthy.
+start_database() {
+  say "Starting the database."
+  run up -d --wait mysql
+}
+
+usage() {
+  cat <<'EOF'
+Usage: ./pine <command>
+
+  up                 build the bot's image and start the stack (a new install creates the database)
+  down               stop the stack (the database and the bot's files are kept)
+  restart [service]  restart the bot, or the service named
+  logs [service]     follow the logs of the stack, or of the service named
+  status             the services and their health
+  migrate            run the database migrations only, without starting the bot
+  help               this list
+EOF
+}
+
+cmd_help() {
+  usage
+}
+
+cmd_up() {
+  need_stack
+  build_image
+  say "Starting Professor Pine and its database."
+  run up -d
+  say "Started. './pine logs pine' follows the bot, './pine status' shows its health."
+}
+
+cmd_down() {
+  need_stack
+  say "Stopping the stack. The database and the bot's files stay in their volumes."
+  run down
+}
+
+cmd_restart() {
+  need_stack
+  service=${1:-pine}
+  say "Restarting $service."
+  run restart "$service"
+}
+
+cmd_logs() {
+  need_stack
+  if [ $# -gt 0 ]; then
+    run logs --follow --tail=200 "$1"
+  else
+    run logs --follow --tail=200
+  fi
+}
+
+cmd_status() {
+  need_stack
+  run ps --all
+}
+
+cmd_migrate() {
+  need_stack
+  build_image
+  start_database
+  say "Running the migrations (the bot does not start, Discord is not contacted)."
+  run run --rm --no-deps pine node --enable-source-maps dist/db/migrate-cli.js
+}
+
+[ $# -gt 0 ] || {
+  usage
+  exit 1
+}
+name=$1
+shift
+case $name in
+  *[!a-z-]*) fail "There is no command '$name'. './pine help' lists them." ;;
+esac
+handler=cmd_$(printf '%s' "$name" | tr '-' '_')
+command -v "$handler" >/dev/null 2>&1 ||
+  fail "There is no command '$name'. './pine help' lists them."
+"$handler" "$@"
````

### Task 3: Plan 9A T3: Health: a heartbeat file, a health check, owner alerts on a crash

Prototype commit: `d64b12950957c56372d1fdd90dbbace70dbfeab8`

The bot writes var/health/status.json every thirty seconds from the start on: when, its
phase (starting until the login begins, then running), since when it is connected to Discord
or not (every shard ready and its heartbeat acknowledged within three minutes: discord.js
never sets client.ws.status back), whether the database answered a select 1 within ten
seconds. No listener: the web server of plan 8M stays the only one.
dist/ops/health-cli.js reads it and prints one line, its kind first (healthy, starting,
stale, missing, unreadable, slow-start, gateway, database), exiting 0 or 1: unhealthy for a
heartbeat older than 90 seconds, a database that did not answer, Discord away five minutes
after the login began, or a start longer than half an hour; a start with a fresh heartbeat
is healthy however long its migrations take. It is the healthcheck of the pine service and a
line of ./pine status.

OwnerAlerts DMs OWNER_ID through Discord's REST API with the bot's token (open the DM
channel, post plain text, no mentions), without the gateway or DmSender; it never throws,
logs a failure, gives up after five seconds, and sends one alert of a kind per fifteen
minutes, its stamp taken before it goes and given back on failure, remembered in
var/health/alerts.json so that a crash loop does not spam. On a fatal end (the gateway
closed for good, an uncaught exception, a start that failed after the config was read) the
bot DMs the error's first line, then shuts down and exits as before. A marker written at
the start and removed at a clean shutdown tells the next start that the run before crashed:
it DMs when, why and the how-manyth restart in the last hour it is. SIGTERM and SIGINT are
heard from the start on: during the start they end it after the step under way, never in
the middle of the migrations, and cleanly. The gateway's fatal handler now says why.

**Files:**

```
 compose.yaml                       |  15 +++-
 pine                               |   6 ++
 src/app.ts                         |  36 +++++++++-
 src/discord/gateway-events.test.ts |   3 +
 src/discord/gateway-events.ts      |   7 +-
 src/index.ts                       |  75 +++++++++++++++++---
 src/ops/crash-record.test.ts       | 120 ++++++++++++++++++++++++++++++++
 src/ops/crash-record.ts            | 151 ++++++++++++++++++++++++++++++++++++++++
 src/ops/health-cli.ts              |   8 +++
 src/ops/health.test.ts             | 132 +++++++++++++++++++++++++++++++++++
 src/ops/health.ts                  | 212 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ops/heartbeat.test.ts          | 168 +++++++++++++++++++++++++++++++++++++++++++++
 src/ops/heartbeat.ts               | 148 ++++++++++++++++++++++++++++++++++++++++
 src/ops/owner-alerts.test.ts       | 163 ++++++++++++++++++++++++++++++++++++++++++++
 src/ops/owner-alerts.ts            | 192 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ops/start-stop.test.ts         |  27 ++++++++
 src/ops/start-stop.ts              |  17 +++++
 test/support/fake-rest.ts          |  45 ++++++++++++
 18 files changed, 1506 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/discord/gateway-events.test.ts src/ops/crash-record.test.ts src/ops/health.test.ts src/ops/heartbeat.test.ts src/ops/owner-alerts.test.ts src/ops/start-stop.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d64b12950957c56372d1fdd90dbbace70dbfeab8 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T3: Health: a heartbeat file, a health check, owner alerts on a crash`, the body above and the trailer, staging exactly
  `compose.yaml pine src/app.ts src/discord/gateway-events.test.ts src/discord/gateway-events.ts src/index.ts src/ops/crash-record.test.ts src/ops/crash-record.ts src/ops/health-cli.ts src/ops/health.test.ts src/ops/health.ts src/ops/heartbeat.test.ts src/ops/heartbeat.ts src/ops/owner-alerts.test.ts src/ops/owner-alerts.ts src/ops/start-stop.test.ts src/ops/start-stop.ts test/support/fake-rest.ts`.

````diff
diff --git a/compose.yaml b/compose.yaml
index 8f9fe242bf21089217897ee4a486d21717c3decb..360ea197e91b69f5a0fd8f99254fe9a3955472f0 100644
--- a/compose.yaml
+++ b/compose.yaml
@@ -55,9 +55,18 @@ services:
     # tini as process 1: it hands SIGTERM to the bot and reaps the screen reader's process.
     init: true
     restart: unless-stopped
-    # Every shutdown step has its own limit (src/app.ts); all of them together come to just under
-    # two minutes, of which the queued direct messages take up to fifteen seconds.
-    stop_grace_period: 2m
+    # Every shutdown step has its own limit (src/app.ts): two minutes all together, of which the
+    # queued direct messages take up to fifteen seconds; half a minute more before Docker kills.
+    stop_grace_period: 2m30s
+    # The bot's heartbeat (var/health/status.json), read by a small command of the image: fresh,
+    # connected to Discord (or not for long), the database answering. The start period covers a
+    # slow first start (the game data's download, the migrations of a large database).
+    healthcheck:
+      test: ['CMD', 'node', 'dist/ops/health-cli.js']
+      interval: 30s
+      timeout: 10s
+      retries: 3
+      start_period: 10m
     # No port of the bot is published to the host.
 
   # cloudflared: plan 8M fills this slot. The bot's web server listens on 0.0.0.0 inside this
diff --git a/pine b/pine
index b3f20d7b59814a4d5fb77ede4e3d1721f55cd6fa..7461ab3f8b07cd2ef2e76874fa1a17dc7dbc30c1 100755
--- a/pine
+++ b/pine
@@ -121,6 +121,12 @@ cmd_logs() {
 cmd_status() {
   need_stack
   run ps --all
+  if [ -n "$(compose ps --quiet --status running pine 2>/dev/null)" ]; then
+    printf 'The bot: '
+    compose exec -T pine node dist/ops/health-cli.js || true
+  else
+    say "The bot is not running."
+  fi
 }
 
 cmd_migrate() {
diff --git a/src/app.ts b/src/app.ts
index e4876f51b6194450020c926258c4e1f03c284f0e..da505ebddb4b76e979f2dd37aaf241963e817fea 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,5 @@
 import { Events } from 'discord.js';
+import { sql } from 'kysely';
 import type { AppContext } from './app-context.js';
 import { commands as allCommands } from './commands/index.js';
 import { wildExceptionsOf } from './commands/notifications/wild.js';
@@ -83,6 +84,9 @@ import { RegionDirectory } from './services/region-directory.js';
 import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
 import { StaticMaps } from './services/static-maps.js';
+import { healthFiles } from './ops/health.js';
+import { gatewayConnected, Heartbeat } from './ops/heartbeat.js';
+import { startCheckpoint } from './ops/start-stop.js';
 import { createShutdown } from './shutdown.js';
 
 /** Parsed game data is kept here between runs, so the bot can start while offline. */
@@ -99,8 +103,16 @@ const HOUR_MS = 60 * MINUTE_MS;
 const DM_DRAIN_MS = 10_000;
 
 export interface StartOptions {
-  /** Called when the gateway closes for good; receives the shutdown to run before exiting. */
-  onFatal?: (shutdown: () => Promise<void>) => void;
+  /**
+   * Called when the gateway closes for good; receives the shutdown to run before exiting, and a
+   * line that says why.
+   */
+  onFatal?: (shutdown: () => Promise<void>, reason: string) => void;
+  /**
+   * Whether a stop was asked for while the bot starts: the start then ends between two of its
+   * steps (`StartStopped`), never in the middle of one (the migrations above all).
+   */
+  stopRequested?: () => boolean;
 }
 
 export async function startApp(
@@ -114,6 +126,16 @@ export async function startApp(
   });
   for (const warning of configWarnings(rawEnv, config.settings)) log.warn(warning);
   const db = createDb<DB>(dbConfigFrom(config.env));
+  // The bot's health for the Docker stack's check (`var/health/status.json`), from here on, so
+  // that a slow start (migrations, the game data's first download) shows as alive.
+  const heartbeat = new Heartbeat({
+    file: healthFiles().status,
+    database: async () => {
+      await sql`select 1`.execute(db);
+    },
+    log,
+  });
+  heartbeat.start();
 
   const gameData = new GameDataService({
     gameMasterUrl: config.settings.gameData.gameMasterUrl,
@@ -433,9 +455,12 @@ export async function startApp(
   });
   const clickAnswers = new ClickAnswers({ log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
+  const checkpoint = startCheckpoint(options.stopRequested);
   try {
     await runMigrations(db, log);
+    checkpoint();
     await gameData.load();
+    checkpoint();
     // Reads the list of the last run from the database; the feed is read after the login.
     await raidBosses.load();
     await gyms.load();
@@ -448,7 +473,9 @@ export async function startApp(
     // needed, and reports can arrive as soon as the bot has logged in.
     await partyService.endPartiesWithoutPost();
     await pokemon.reloadNicknames();
+    checkpoint();
   } catch (err) {
+    await heartbeat.stop();
     await db.destroy();
     throw err;
   }
@@ -537,6 +564,7 @@ export async function startApp(
     log,
     create: createClient,
     configure(client) {
+      heartbeat.loggingIn(() => gatewayConnected(client.ws.shards, Date.now()));
       partyGateway.use(client);
       appEmojiSource.use(client);
       members.use(client);
@@ -674,11 +702,13 @@ export async function startApp(
       { name: 'unown wants', timeoutMs: 5_000, run: () => unownWants.flush() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
+      // The heartbeat asks the database: it stops first. A clean exit leaves no crash marker.
+      { name: 'heartbeat', timeoutMs: 1_000, run: () => heartbeat.stop() },
       { name: 'database', timeoutMs: 5_000, run: () => db.destroy() },
     ],
     log,
   );
   // Attached only after login: during the intent fallback a rejected login also closes the shard.
-  attachGatewayHandlers(client, log, () => options.onFatal?.(shutdown));
+  attachGatewayHandlers(client, log, (reason) => options.onFatal?.(shutdown, reason));
   return { log, shutdown };
 }
diff --git a/src/discord/gateway-events.test.ts b/src/discord/gateway-events.test.ts
index 87b0d66590a612936947b08e2ac48c5d1b19f3a9..807fe2a367473bce5afa3a41de4ca0b6894ae128 100644
--- a/src/discord/gateway-events.test.ts
+++ b/src/discord/gateway-events.test.ts
@@ -27,6 +27,9 @@ describe('attachGatewayHandlers', () => {
     client.emit(Events.ShardDisconnect, closeEvent, 0);
 
     expect(onFatal).toHaveBeenCalledTimes(1);
+    expect(onFatal).toHaveBeenCalledWith(
+      'Discord closed the gateway connection for good (code 4004)',
+    );
     expect(entries.some((l) => l.level === 60 && l.code === 4004)).toBe(true);
   });
 });
diff --git a/src/discord/gateway-events.ts b/src/discord/gateway-events.ts
index c2fb352c76aad85e65b2366e2ba8d5de677ab6b8..188b8876ac9d13aa8fffe0b3c4912f4d42bf4515 100644
--- a/src/discord/gateway-events.ts
+++ b/src/discord/gateway-events.ts
@@ -4,12 +4,13 @@ import type { Logger } from '../log.js';
 /**
  * Logs gateway trouble. discord.js emits ShardDisconnect only for close codes it will not
  * reconnect after (4004 bad token, 4014 disallowed intents, and similar), so it is fatal:
- * `onFatal` should shut down and exit non-zero so the supervisor restarts the bot.
+ * `onFatal` should shut down and exit non-zero so the supervisor restarts the bot; it is told why,
+ * in a line for the owner's alert.
  */
 export function attachGatewayHandlers(
   client: Pick<Client, 'on'>,
   log: Logger,
-  onFatal: () => void,
+  onFatal: (reason: string) => void,
 ): void {
   client.on(Events.ShardError, (err, shard) => log.error({ err, shard }, 'discord shard error'));
   client.on(Events.ShardDisconnect, (event, shard) => {
@@ -17,6 +18,6 @@ export function attachGatewayHandlers(
       { code: event.code, shard },
       'discord gateway closed and will not reconnect; shutting down',
     );
-    onFatal();
+    onFatal(`Discord closed the gateway connection for good (code ${event.code})`);
   });
 }
diff --git a/src/index.ts b/src/index.ts
index 3e3f3b1b4f6d675a103b017997cb4e6435c1eada..3edd5153c181071baa5321da9ee8f5808798154b 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,12 +1,65 @@
 import { startApp } from './app.js';
 import { ConfigError } from './config/errors.js';
+import { createLogger } from './log.js';
+import { CrashRecord, restartText } from './ops/crash-record.js';
+import { HEALTH_DIR, healthFiles } from './ops/health.js';
+import { FileStamps, firstLine, ownerAlertsFrom } from './ops/owner-alerts.js';
+import { StartStopped } from './ops/start-stop.js';
+
+const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
+
+// The owner's alerts and the crash marker work before the config is read and after it failed:
+// they need only the token and OWNER_ID, and log through a logger of their own.
+const opsLog = createLogger({
+  level: LEVELS.includes(process.env.LOG_LEVEL ?? '') ? (process.env.LOG_LEVEL ?? 'info') : 'info',
+  pretty: process.env.NODE_ENV === 'development',
+});
+const alerts = ownerAlertsFrom(process.env, opsLog, new FileStamps(healthFiles().alerts));
+const crashes = new CrashRecord({ dir: HEALTH_DIR });
+const crashed = crashes.started();
+
+/** Keeps why this run ends for the next start, and tells the owner (a few seconds at most). */
+async function ending(what: string, err: unknown): Promise<void> {
+  const line = firstLine(err);
+  crashes.failed(line);
+  await alerts?.send('fatal', `Professor Pine ${what}: ${line}`);
+}
+
+let app: Awaited<ReturnType<typeof startApp>> | undefined;
+// A stop asked for during the start ends it after the step under way (the migrations are never
+// cut off), cleanly: no crash is reported at the next start.
+let stopAsked: NodeJS.Signals | undefined;
+
+function stop(signal: NodeJS.Signals): void {
+  if (!app) {
+    stopAsked = signal;
+    opsLog.info({ signal }, 'stopping once the step of the start under way is done');
+    return;
+  }
+  const { log, shutdown } = app;
+  log.info({ signal }, 'shutting down');
+  void shutdown().finally(() => {
+    crashes.stopped();
+    process.exit(0);
+  });
+}
+
+for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => stop(signal));
 
-let app: Awaited<ReturnType<typeof startApp>>;
 try {
   app = await startApp(process.env, {
-    onFatal: (shutdown) => void shutdown().finally(() => process.exit(1)),
+    onFatal: (shutdown, reason) =>
+      void ending('stopped', reason)
+        .then(shutdown)
+        .finally(() => process.exit(1)),
+    stopRequested: () => stopAsked !== undefined,
   });
 } catch (err) {
+  if (err instanceof StartStopped) {
+    opsLog.info('stopped during the start');
+    crashes.stopped();
+    process.exit(0);
+  }
   const detail =
     err instanceof ConfigError
       ? err.message
@@ -14,22 +67,24 @@ try {
         ? (err.stack ?? err.message)
         : String(err);
   process.stderr.write(`Professor Pine failed to start: ${detail}\n`);
+  // A config that cannot be read is the operator's to fix at the console; it is recorded for the
+  // alert of the start that works, but sends none now.
+  if (err instanceof ConfigError) crashes.failed(firstLine(err));
+  else await ending('could not start', err);
   process.exit(1);
 }
 
 const { log, shutdown } = app;
-
-for (const signal of ['SIGINT', 'SIGTERM'] as const) {
-  process.once(signal, () => {
-    log.info({ signal }, 'shutting down');
-    void shutdown().finally(() => process.exit(0));
-  });
-}
+// Asked during the login, which no checkpoint divides.
+if (stopAsked) stop(stopAsked);
+else if (crashed) void alerts?.send('restart', restartText(crashed));
 
 process.on('unhandledRejection', (reason) =>
   log.error({ err: reason }, 'unhandled promise rejection'),
 );
 process.on('uncaughtException', (err) => {
   log.fatal({ err }, 'uncaught exception; exiting so the supervisor restarts the bot');
-  void shutdown().finally(() => process.exit(1));
+  void ending('stopped after an uncaught error', err)
+    .then(shutdown)
+    .finally(() => process.exit(1));
 });
diff --git a/src/ops/crash-record.test.ts b/src/ops/crash-record.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..99aadb571f4e7babbf5cab4bd9ec888391c20445
--- /dev/null
+++ b/src/ops/crash-record.test.ts
@@ -0,0 +1,120 @@
+import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { CrashRecord, restartText } from './crash-record.js';
+
+const START = Date.UTC(2026, 9, 16, 12, 0);
+const MINUTE = 60_000;
+
+function recordIn(dir: string, clock: { now: number }) {
+  return new CrashRecord({ dir, now: () => clock.now });
+}
+
+function freshDir() {
+  return path.join(mkdtempSync(path.join(tmpdir(), 'pine-crash-')), 'health');
+}
+
+describe('CrashRecord', () => {
+  it('reports nothing at a first start, nor after a clean stop', () => {
+    const dir = freshDir();
+    const clock = { now: START };
+
+    expect(recordIn(dir, clock).started()).toBeUndefined();
+    recordIn(dir, clock).stopped();
+    clock.now += MINUTE;
+    expect(recordIn(dir, clock).started()).toBeUndefined();
+  });
+
+  it('reports a crash when the last run left its marker, with the error it recorded', () => {
+    const dir = freshDir();
+    const clock = { now: START };
+    const first = recordIn(dir, clock);
+    first.started();
+    clock.now += 10 * MINUTE;
+    first.failed('Connection lost: The server closed the connection.');
+
+    clock.now += MINUTE;
+    expect(recordIn(dir, clock).started()).toEqual({
+      at: START + 10 * MINUTE,
+      error: 'Connection lost: The server closed the connection.',
+      restartsInWindow: 1,
+    });
+  });
+
+  it('takes the last heartbeat as the time of a crash that recorded no error', () => {
+    const dir = freshDir();
+    const clock = { now: START };
+    recordIn(dir, clock).started();
+    mkdirSync(dir, { recursive: true });
+    writeFileSync(
+      path.join(dir, 'status.json'),
+      JSON.stringify({
+        writtenAt: START + 42 * MINUTE,
+        startedAt: START,
+        pid: 7,
+        phase: 'running',
+        gateway: { connected: true, since: START + MINUTE },
+        database: { reachable: true, checkedAt: START + 42 * MINUTE },
+      }),
+    );
+
+    clock.now = START + 50 * MINUTE;
+    expect(recordIn(dir, clock).started()).toEqual({
+      at: START + 42 * MINUTE,
+      restartsInWindow: 1,
+    });
+  });
+
+  it('takes the start as the time of a crash before the first heartbeat', () => {
+    const dir = freshDir();
+    const clock = { now: START };
+    recordIn(dir, clock).started();
+
+    clock.now += MINUTE;
+    expect(recordIn(dir, clock).started()).toEqual({ at: START, restartsInWindow: 1 });
+  });
+
+  it('counts the restarts after a crash in the last hour', () => {
+    const dir = freshDir();
+    const clock = { now: START };
+    recordIn(dir, clock).started();
+    const reports = [];
+    for (let i = 0; i < 3; i++) {
+      clock.now += 20 * MINUTE;
+      reports.push(recordIn(dir, clock).started()?.restartsInWindow);
+    }
+    // A clean run in between does not count, and the oldest leaves the hour.
+    recordIn(dir, clock).stopped();
+    clock.now += 20 * MINUTE;
+    recordIn(dir, clock).started();
+    clock.now += 5 * MINUTE;
+    reports.push(recordIn(dir, clock).started()?.restartsInWindow);
+
+    expect(reports).toEqual([1, 2, 3, 3]);
+  });
+
+  it('starts afresh from marker files it cannot read', () => {
+    const dir = freshDir();
+    mkdirSync(dir, { recursive: true });
+    writeFileSync(path.join(dir, 'running.json'), 'not json');
+    writeFileSync(path.join(dir, 'restarts.json'), '{"no": "list"}');
+    const clock = { now: START };
+
+    expect(recordIn(dir, clock).started()).toEqual({ at: START, restartsInWindow: 1 });
+  });
+});
+
+describe('restartText', () => {
+  it('says when the crash was, why, and how often it happened lately', () => {
+    expect(
+      restartText({ at: Date.UTC(2026, 9, 16, 12, 0), error: 'boom', restartsInWindow: 2 }),
+    ).toBe(
+      'Professor Pine restarted after a crash at <t:1792152000:f>: boom. Restart 2 in the last hour.',
+    );
+    expect(restartText({ at: Date.UTC(2026, 9, 16, 12, 0), restartsInWindow: 1 })).toBe(
+      'Professor Pine restarted after a crash at <t:1792152000:f>: no error was recorded ' +
+        '(killed, out of memory, or the machine stopped). Restart 1 in the last hour.',
+    );
+  });
+});
diff --git a/src/ops/crash-record.ts b/src/ops/crash-record.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6c6a039e1813d8402067800f027c4f0ca6461aa2
--- /dev/null
+++ b/src/ops/crash-record.ts
@@ -0,0 +1,151 @@
+import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
+import { alertTime } from './owner-alerts.js';
+import { healthFiles, readHealthStatus } from './health.js';
+
+/** What the start of a run found of a crash of the run before. */
+export interface CrashReport {
+  /** The time of the crash: its error's, or the last heartbeat's, or the run's start. */
+  at: number;
+  /** The first line of the error that ended that run, when it said one. */
+  error?: string;
+  /** The restarts after a crash within the window (an hour), this one included. */
+  restartsInWindow: number;
+}
+
+interface Marker {
+  startedAt: number;
+  pid: number;
+  error?: { at: number; message: string };
+}
+
+export interface CrashRecordOptions {
+  /** The folder of the health files (`HEALTH_DIR`). */
+  dir: string;
+  /** How far back restarts are counted. An hour. */
+  windowMs?: number;
+  now?: () => number;
+}
+
+function readJson(file: string): unknown {
+  try {
+    return JSON.parse(readFileSync(file, 'utf8'));
+  } catch {
+    return undefined;
+  }
+}
+
+function writeJson(file: string, value: unknown): void {
+  const next = `${file}.next`;
+  writeFileSync(next, JSON.stringify(value));
+  renameSync(next, file);
+}
+
+/**
+ * Whether the bot ended cleanly: a marker file is written at the start and removed at a clean
+ * shutdown, so a start that finds one follows a crash (an error, a kill, the machine stopping).
+ * The error that ends a run is kept in the marker for the next start to tell. Synchronous, so
+ * that it works from an exit path; a file it cannot read counts as absent, one it cannot write is
+ * skipped (the bot runs on without its crash reports).
+ */
+export class CrashRecord {
+  private readonly dir: string;
+  private readonly files: ReturnType<typeof healthFiles>;
+  private readonly windowMs: number;
+  private readonly now: () => number;
+
+  constructor(options: CrashRecordOptions) {
+    this.dir = options.dir;
+    this.files = healthFiles(options.dir);
+    this.windowMs = options.windowMs ?? 60 * 60_000;
+    this.now = options.now ?? Date.now;
+  }
+
+  /** At the start of a run: the crash of the run before, if it crashed; then a new marker. */
+  started(): CrashReport | undefined {
+    const now = this.now();
+    const previous = this.readMarker();
+    let report: CrashReport | undefined;
+    if (previous) {
+      const restarts = [...this.readRestarts(), now].filter((at) => now - at < this.windowMs);
+      this.write(this.files.restarts, restarts);
+      const lastSeen = readHealthStatus(this.files.status)?.writtenAt;
+      report = {
+        at:
+          previous.error?.at ??
+          (lastSeen !== undefined && lastSeen >= previous.startedAt ? lastSeen : undefined) ??
+          previous.startedAt,
+        ...(previous.error ? { error: previous.error.message } : {}),
+        restartsInWindow: restarts.length,
+      };
+    }
+    this.write(this.files.marker, { startedAt: now, pid: process.pid } satisfies Marker);
+    return report;
+  }
+
+  /** The error that is ending this run, for the next start to tell. */
+  failed(message: string): void {
+    const marker = this.readMarker() ?? { startedAt: this.now(), pid: process.pid };
+    this.write(this.files.marker, { ...marker, error: { at: this.now(), message } });
+  }
+
+  /** A clean end: the marker goes. */
+  stopped(): void {
+    try {
+      rmSync(this.files.marker, { force: true });
+    } catch {
+      // The next start reports a crash that was none; nothing worse.
+    }
+  }
+
+  private write(file: string, value: unknown): void {
+    try {
+      mkdirSync(this.dir, { recursive: true });
+      writeJson(file, value);
+    } catch {
+      // Without the files the bot only loses its crash reports.
+    }
+  }
+
+  private readMarker(): Marker | undefined {
+    const raw = readJson(this.files.marker);
+    if (raw === undefined) {
+      // A marker that is there but cannot be read still means a crash.
+      return this.exists(this.files.marker) ? { startedAt: this.now(), pid: 0 } : undefined;
+    }
+    const marker = raw as Partial<Marker>;
+    if (typeof marker.startedAt !== 'number') return { startedAt: this.now(), pid: 0 };
+    const error =
+      typeof marker.error?.at === 'number' && typeof marker.error.message === 'string'
+        ? marker.error
+        : undefined;
+    return {
+      startedAt: marker.startedAt,
+      pid: Number(marker.pid) || 0,
+      ...(error ? { error } : {}),
+    };
+  }
+
+  private readRestarts(): number[] {
+    const raw = readJson(this.files.restarts);
+    return Array.isArray(raw) ? raw.filter((at): at is number => typeof at === 'number') : [];
+  }
+
+  private exists(file: string): boolean {
+    try {
+      readFileSync(file);
+      return true;
+    } catch {
+      return false;
+    }
+  }
+}
+
+/** The owner's alert of a start after a crash. */
+export function restartText(report: CrashReport): string {
+  const why =
+    report.error ?? 'no error was recorded (killed, out of memory, or the machine stopped)';
+  return (
+    `Professor Pine restarted after a crash at ${alertTime(report.at)}: ${why}. ` +
+    `Restart ${report.restartsInWindow} in the last hour.`
+  );
+}
diff --git a/src/ops/health-cli.ts b/src/ops/health-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8791b6ab98dc07617184f737016b53b9f9e0ddf7
--- /dev/null
+++ b/src/ops/health-cli.ts
@@ -0,0 +1,8 @@
+import { healthCheck, healthFiles, healthLine } from './health.js';
+
+// The health check of the Docker stack (compose.yaml): reads the bot's heartbeat, says what it
+// found in one line (its kind first, which the watchdog reads), and exits 0 when the bot is
+// healthy, 1 when not.
+const verdict = healthCheck(healthFiles().status, Date.now());
+process.stdout.write(`${healthLine(verdict)}\n`);
+process.exitCode = verdict.healthy ? 0 : 1;
diff --git a/src/ops/health.test.ts b/src/ops/health.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7f9be426709bc1492d8226010358843bbf7569a0
--- /dev/null
+++ b/src/ops/health.test.ts
@@ -0,0 +1,132 @@
+import { mkdtempSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { healthCheck, healthLine, healthVerdict, type HealthStatus } from './health.js';
+
+const NOW = Date.UTC(2026, 9, 16, 12, 0);
+const SECOND = 1_000;
+const MINUTE = 60 * SECOND;
+
+function status(overrides: Partial<HealthStatus> = {}): HealthStatus {
+  return {
+    writtenAt: NOW - 10 * SECOND,
+    startedAt: NOW - 3 * 60 * MINUTE,
+    pid: 7,
+    phase: 'running',
+    gateway: { connected: true, since: NOW - 2 * 60 * MINUTE },
+    database: { reachable: true, checkedAt: NOW - 10 * SECOND },
+    ...overrides,
+  };
+}
+
+describe('healthVerdict', () => {
+  it('is healthy when the heartbeat is fresh, Discord connected and the database answering', () => {
+    expect(healthVerdict(status(), NOW)).toEqual({
+      healthy: true,
+      kind: 'healthy',
+      reason: 'connected to Discord for 2 hours, the database answered 10 seconds ago',
+    });
+  });
+
+  it('is unhealthy when the heartbeat is old: the bot is stuck or gone', () => {
+    expect(healthVerdict(status({ writtenAt: NOW - 2 * MINUTE }), NOW)).toEqual({
+      healthy: false,
+      kind: 'stale',
+      reason: 'the last heartbeat is 2 minutes old: the bot is stuck or not running',
+    });
+  });
+
+  it('is healthy while it starts, however long migrations and downloads take, up to a limit', () => {
+    const starting = status({
+      phase: 'starting',
+      startedAt: NOW - 25 * MINUTE,
+      gateway: { connected: false, since: NOW - 25 * MINUTE },
+    });
+    expect(healthVerdict(starting, NOW)).toEqual({
+      healthy: true,
+      kind: 'starting',
+      reason: 'starting for 25 minutes, the database answered 10 seconds ago',
+    });
+
+    expect(healthVerdict({ ...starting, startedAt: NOW - 31 * MINUTE }, NOW)).toEqual({
+      healthy: false,
+      kind: 'slow-start',
+      reason: 'still starting after 31 minutes',
+    });
+  });
+
+  it('gives a bot that logs in time to connect to Discord, then calls it unhealthy', () => {
+    const connecting = status({ gateway: { connected: false, since: NOW - 2 * MINUTE } });
+    expect(healthVerdict(connecting, NOW)).toEqual({
+      healthy: true,
+      kind: 'healthy',
+      reason: 'connecting to Discord for 2 minutes, the database answered 10 seconds ago',
+    });
+
+    const down = status({ gateway: { connected: false, since: NOW - 6 * MINUTE } });
+    expect(healthVerdict(down, NOW)).toEqual({
+      healthy: false,
+      kind: 'gateway',
+      reason: 'not connected to Discord for 6 minutes',
+    });
+  });
+
+  it('is unhealthy when the database did not answer at the last check, also while starting', () => {
+    const database = {
+      reachable: false,
+      checkedAt: NOW - 20 * SECOND,
+      error: 'connect ECONNREFUSED',
+    };
+    const expected = {
+      healthy: false,
+      kind: 'database',
+      reason: 'the database did not answer 20 seconds ago: connect ECONNREFUSED',
+    };
+    expect(healthVerdict(status({ database }), NOW)).toEqual(expected);
+    expect(healthVerdict(status({ database, phase: 'starting' }), NOW)).toEqual(expected);
+  });
+
+  it('takes other limits', () => {
+    const down = status({ gateway: { connected: false, since: NOW - 2 * MINUTE } });
+    const limits = { staleMs: MINUTE, gatewayGraceMs: MINUTE, startLimitMs: MINUTE };
+    expect(healthVerdict(down, NOW, limits).healthy).toBe(false);
+  });
+});
+
+describe('healthLine', () => {
+  it('starts with the kind, which the watchdog reads', () => {
+    expect(healthLine(healthVerdict(status({ writtenAt: NOW - 2 * MINUTE }), NOW))).toBe(
+      'stale: the last heartbeat is 2 minutes old: the bot is stuck or not running',
+    );
+  });
+});
+
+describe('healthCheck', () => {
+  const dir = () => mkdtempSync(path.join(tmpdir(), 'pine-health-'));
+
+  it('reads the heartbeat file', () => {
+    const file = path.join(dir(), 'status.json');
+    writeFileSync(file, JSON.stringify(status()));
+    expect(healthCheck(file, NOW).healthy).toBe(true);
+  });
+
+  it('is unhealthy without a heartbeat file', () => {
+    const file = path.join(dir(), 'status.json');
+    expect(healthCheck(file, NOW)).toEqual({
+      healthy: false,
+      kind: 'missing',
+      reason: `no heartbeat yet: ${file} is missing`,
+    });
+  });
+
+  it('is unhealthy with a heartbeat file it cannot read', () => {
+    const file = path.join(dir(), 'status.json');
+    writeFileSync(file, '{"writtenAt": "soon"}');
+    expect(healthCheck(file, NOW)).toEqual({
+      healthy: false,
+      kind: 'unreadable',
+      reason: `the heartbeat file ${file} cannot be read`,
+    });
+  });
+});
diff --git a/src/ops/health.ts b/src/ops/health.ts
new file mode 100644
index 0000000000000000000000000000000000000000..04909ffcaff174ca112d8981bb59f6da95adc8fe
--- /dev/null
+++ b/src/ops/health.ts
@@ -0,0 +1,212 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { z } from 'zod';
+
+/** The bot's own files about itself, under `var/` (a volume in the Docker stack). */
+export const HEALTH_DIR = 'var/health';
+
+/** The files of `HEALTH_DIR`, or of another folder (tests). */
+export function healthFiles(dir: string = HEALTH_DIR) {
+  return {
+    /** The heartbeat (`Heartbeat`), read by the health check (`health-cli`). */
+    status: path.join(dir, 'status.json'),
+    /** There while the bot runs; left behind by a crash (`CrashRecord`). */
+    marker: path.join(dir, 'running.json'),
+    /** The times of the recent restarts after a crash (`CrashRecord`). */
+    restarts: path.join(dir, 'restarts.json'),
+    /** When the owner was last alerted, by kind (`FileStamps`). */
+    alerts: path.join(dir, 'alerts.json'),
+  };
+}
+
+const healthStatusSchema = z.object({
+  /** When the file was written: an old one means a stuck or stopped bot. */
+  writtenAt: z.number(),
+  startedAt: z.number(),
+  pid: z.number(),
+  /**
+   * `starting` until the login to Discord begins (migrations, game data, the stores), then
+   * `running`: a start may take as long as a takeover's migrations take.
+   */
+  phase: z.enum(['starting', 'running']),
+  /** Whether the client is connected to Discord's gateway, and since when it is or is not. */
+  gateway: z.object({ connected: z.boolean(), since: z.number() }),
+  /** Whether the database answered the last check. */
+  database: z.object({
+    reachable: z.boolean(),
+    checkedAt: z.number(),
+    error: z.string().optional(),
+  }),
+});
+
+/** What the heartbeat writes. */
+export type HealthStatus = z.output<typeof healthStatusSchema>;
+
+/** The heartbeat file as written, or nothing when there is none or it cannot be read. */
+export function readHealthStatus(file: string): HealthStatus | undefined {
+  try {
+    const parsed = healthStatusSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
+    return parsed.success ? parsed.data : undefined;
+  } catch {
+    return undefined;
+  }
+}
+
+export interface HealthLimits {
+  /** A heartbeat older than this means a stuck or stopped bot. */
+  staleMs: number;
+  /** How long the bot may be without Discord after its login began and still be healthy. */
+  gatewayGraceMs: number;
+  /** How long a start may take before it is called unhealthy (the watchdog only alerts). */
+  startLimitMs: number;
+}
+
+/**
+ * Three missed heartbeats; five minutes for Discord (a reconnect usually takes seconds); half an
+ * hour for a start.
+ */
+export const DEFAULT_HEALTH_LIMITS: HealthLimits = {
+  staleMs: 90_000,
+  gatewayGraceMs: 5 * 60_000,
+  startLimitMs: 30 * 60_000,
+};
+
+/**
+ * What the verdict is about. The watchdog reads it from the start of the health check's line:
+ * it restarts the bot only for `stale` and `missing` (a stuck or absent process), and alerts for
+ * the others, which a restart does not mend.
+ */
+export type HealthKind =
+  | 'healthy'
+  | 'starting'
+  | 'stale'
+  | 'missing'
+  | 'unreadable'
+  | 'slow-start'
+  | 'gateway'
+  | 'database';
+
+export interface HealthVerdict {
+  healthy: boolean;
+  kind: HealthKind;
+  /** What was found, for Docker's health log and `./pine status`. */
+  reason: string;
+}
+
+/** The health check's line: the kind first, then what was found. */
+export function healthLine(verdict: HealthVerdict): string {
+  return `${verdict.kind}: ${verdict.reason}`;
+}
+
+/** The kind at the start of a health check's line, if it has one. */
+export function healthKindOf(line: string | undefined): HealthKind | undefined {
+  const kind = /^([a-z-]+):/.exec(line?.trim() ?? '')?.[1];
+  const kinds: readonly string[] = [
+    'healthy',
+    'starting',
+    'stale',
+    'missing',
+    'unreadable',
+    'slow-start',
+    'gateway',
+    'database',
+  ];
+  return kind !== undefined && kinds.includes(kind) ? (kind as HealthKind) : undefined;
+}
+
+/** A time span in words: "10 seconds", "2 minutes", "3 hours". */
+function span(ms: number): string {
+  const seconds = Math.max(0, Math.round(ms / 1000));
+  const [amount, unit] =
+    seconds < 90
+      ? [seconds, 'second']
+      : seconds < 90 * 60
+        ? [Math.round(seconds / 60), 'minute']
+        : [Math.round(seconds / 3600), 'hour'];
+  return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
+}
+
+/** Whether the bot is healthy by its heartbeat at `now`. */
+export function healthVerdict(
+  status: HealthStatus,
+  now: number,
+  limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
+): HealthVerdict {
+  const age = now - status.writtenAt;
+  if (age > limits.staleMs) {
+    return {
+      healthy: false,
+      kind: 'stale',
+      reason: `the last heartbeat is ${span(age)} old: the bot is stuck or not running`,
+    };
+  }
+  const { gateway, database } = status;
+  const checked = span(now - database.checkedAt);
+  if (!database.reachable) {
+    return {
+      healthy: false,
+      kind: 'database',
+      reason: `the database did not answer ${checked} ago: ${database.error ?? 'no reason given'}`,
+    };
+  }
+  if (status.phase === 'starting') {
+    const starting = now - status.startedAt;
+    if (starting > limits.startLimitMs) {
+      return {
+        healthy: false,
+        kind: 'slow-start',
+        reason: `still starting after ${span(starting)}`,
+      };
+    }
+    return {
+      healthy: true,
+      kind: 'starting',
+      reason: `starting for ${span(starting)}, the database answered ${checked} ago`,
+    };
+  }
+  const away = now - gateway.since;
+  if (!gateway.connected && away > limits.gatewayGraceMs) {
+    return {
+      healthy: false,
+      kind: 'gateway',
+      reason: `not connected to Discord for ${span(away)}`,
+    };
+  }
+  const discord = gateway.connected
+    ? `connected to Discord for ${span(away)}`
+    : `connecting to Discord for ${span(away)}`;
+  return {
+    healthy: true,
+    kind: 'healthy',
+    reason: `${discord}, the database answered ${checked} ago`,
+  };
+}
+
+/** The verdict on the heartbeat in `file`; no file, or one that cannot be read, is unhealthy. */
+export function healthCheck(
+  file: string,
+  now: number,
+  limits: HealthLimits = DEFAULT_HEALTH_LIMITS,
+): HealthVerdict {
+  let text: string;
+  try {
+    text = readFileSync(file, 'utf8');
+  } catch {
+    return { healthy: false, kind: 'missing', reason: `no heartbeat yet: ${file} is missing` };
+  }
+  let status: HealthStatus | undefined;
+  try {
+    const parsed = healthStatusSchema.safeParse(JSON.parse(text));
+    status = parsed.success ? parsed.data : undefined;
+  } catch {
+    status = undefined;
+  }
+  if (!status) {
+    return {
+      healthy: false,
+      kind: 'unreadable',
+      reason: `the heartbeat file ${file} cannot be read`,
+    };
+  }
+  return healthVerdict(status, now, limits);
+}
diff --git a/src/ops/heartbeat.test.ts b/src/ops/heartbeat.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fed8330395a3fe422bf6d2a45090d2b1669497ab
--- /dev/null
+++ b/src/ops/heartbeat.test.ts
@@ -0,0 +1,168 @@
+import { mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { Status } from 'discord.js';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { readHealthStatus } from './health.js';
+import { gatewayConnected, Heartbeat } from './heartbeat.js';
+
+const START = Date.UTC(2026, 9, 16, 12, 0);
+const SECOND = 1_000;
+
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+function heartbeatWith(database: () => Promise<void> = () => Promise.resolve()) {
+  const file = path.join(
+    mkdtempSync(path.join(tmpdir(), 'pine-heartbeat-')),
+    'health',
+    'status.json',
+  );
+  const clock = { now: START };
+  const { log, entries } = createTestLogger();
+  const heartbeat = new Heartbeat({
+    file,
+    database,
+    databaseTimeoutMs: 5 * SECOND,
+    log,
+    now: () => clock.now,
+  });
+  return { file, clock, heartbeat, entries };
+}
+
+describe('Heartbeat', () => {
+  it('writes the time and that the bot is starting, from the start on', async () => {
+    const { file, heartbeat } = heartbeatWith();
+
+    await heartbeat.beat();
+
+    expect(readHealthStatus(file)).toEqual({
+      writtenAt: START,
+      startedAt: START,
+      pid: process.pid,
+      phase: 'starting',
+      gateway: { connected: false, since: START },
+      database: { reachable: true, checkedAt: START },
+    });
+  });
+
+  it('is running from the login on, and says since when Discord is connected or not', async () => {
+    const { file, clock, heartbeat } = heartbeatWith();
+    let connected = false;
+    await heartbeat.beat();
+
+    clock.now += 20 * 60 * SECOND;
+    heartbeat.loggingIn(() => connected);
+    await heartbeat.beat();
+    const login = START + 20 * 60 * SECOND;
+    expect(readHealthStatus(file)).toMatchObject({
+      phase: 'running',
+      gateway: { connected: false, since: login },
+    });
+
+    clock.now += 30 * SECOND;
+    connected = true;
+    await heartbeat.beat();
+    clock.now += 30 * SECOND;
+    await heartbeat.beat();
+    expect(readHealthStatus(file)?.gateway).toEqual({
+      connected: true,
+      since: login + 30 * SECOND,
+    });
+
+    clock.now += 30 * SECOND;
+    connected = false;
+    await heartbeat.beat();
+    expect(readHealthStatus(file)?.gateway).toEqual({
+      connected: false,
+      since: login + 90 * SECOND,
+    });
+  });
+
+  it('records a database that failed to answer, with its error', async () => {
+    const { file, heartbeat } = heartbeatWith(() =>
+      Promise.reject(new Error('connect ECONNREFUSED 172.18.0.2:3306')),
+    );
+
+    await heartbeat.beat();
+
+    expect(readHealthStatus(file)?.database).toEqual({
+      reachable: false,
+      checkedAt: START,
+      error: 'connect ECONNREFUSED 172.18.0.2:3306',
+    });
+  });
+
+  it('records a database that takes too long as not answering', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    const { file, heartbeat } = heartbeatWith(() => new Promise(() => undefined));
+
+    const beat = heartbeat.beat();
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(5 * SECOND);
+    await beat;
+
+    expect(readHealthStatus(file)?.database).toEqual({
+      reachable: false,
+      checkedAt: START,
+      error: 'no answer within 5000 ms',
+    });
+  });
+
+  it('logs a heartbeat it cannot write, once, and carries on', async () => {
+    const { log, entries } = createTestLogger();
+    // A folder cannot be made inside a file.
+    const heartbeat = new Heartbeat({
+      file: path.join(import.meta.filename, 'health', 'status.json'),
+      database: () => Promise.resolve(),
+      log,
+    });
+
+    await heartbeat.beat();
+    await heartbeat.beat();
+
+    expect(entries.filter((entry) => entry.msg === 'could not write the heartbeat')).toHaveLength(
+      1,
+    );
+  });
+});
+
+describe('gatewayConnected', () => {
+  const NOW = START;
+  const shard = (status: Status, lastPingTimestamp = NOW - 40 * SECOND) => ({
+    status,
+    lastPingTimestamp,
+  });
+
+  it('follows every shard through a reconnect: Ready, Connecting, Ready again', () => {
+    const shards = new Map([[0, shard(Status.Ready)]]);
+    expect(gatewayConnected(shards, NOW)).toBe(true);
+
+    shards.set(0, shard(Status.Connecting));
+    expect(gatewayConnected(shards, NOW)).toBe(false);
+    shards.set(0, shard(Status.Resuming));
+    expect(gatewayConnected(shards, NOW)).toBe(false);
+
+    shards.set(0, shard(Status.Ready));
+    expect(gatewayConnected(shards, NOW)).toBe(true);
+  });
+
+  it('is not connected without shards, or when one shard is down', () => {
+    expect(gatewayConnected(new Map(), NOW)).toBe(false);
+    const shards = new Map([
+      [0, shard(Status.Ready)],
+      [1, shard(Status.Disconnected)],
+    ]);
+    expect(gatewayConnected(shards, NOW)).toBe(false);
+  });
+
+  it('is not connected when Discord has acknowledged no heartbeat for three minutes', () => {
+    expect(gatewayConnected(new Map([[0, shard(Status.Ready, NOW - 4 * 60 * SECOND)]]), NOW)).toBe(
+      false,
+    );
+    // Before the first acknowledgement there is none to be late.
+    expect(gatewayConnected(new Map([[0, shard(Status.Ready, -1)]]), NOW)).toBe(true);
+  });
+});
diff --git a/src/ops/heartbeat.ts b/src/ops/heartbeat.ts
new file mode 100644
index 0000000000000000000000000000000000000000..678bad483daf5d1fa4bc4b3cfcb4768dbc6793ef
--- /dev/null
+++ b/src/ops/heartbeat.ts
@@ -0,0 +1,148 @@
+import { mkdir, rename, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+import { Status } from 'discord.js';
+import type { Logger } from '../log.js';
+import type { HealthStatus } from './health.js';
+
+export interface HeartbeatOptions {
+  /** Where the status goes (`healthFiles().status`). */
+  file: string;
+  /** Asks the database something small; rejects when it cannot. */
+  database: () => Promise<void>;
+  /** How often the status is written. Thirty seconds. */
+  intervalMs?: number;
+  /** How long the database may take to answer. Ten seconds. */
+  databaseTimeoutMs?: number;
+  log: Logger;
+  now?: () => number;
+}
+
+/** What the gateway probe reads of a shard of discord.js's `client.ws.shards`. */
+export interface ShardState {
+  status: Status;
+  /** When Discord last acknowledged the shard's heartbeat; -1 before the first time. */
+  lastPingTimestamp: number;
+}
+
+/** Discord acknowledges a heartbeat about every 41 seconds: three minutes without is a dead line. */
+const ACK_LIMIT_MS = 3 * 60_000;
+
+/**
+ * Whether the client is connected to Discord: every shard is ready and Discord acknowledged its
+ * heartbeat lately. The shards, not `client.ws.status`, which discord.js sets to ready once and
+ * never back when a shard closes, resumes or reconnects.
+ */
+export function gatewayConnected(
+  shards: ReadonlyMap<number, ShardState>,
+  now: number,
+  ackLimitMs = ACK_LIMIT_MS,
+): boolean {
+  if (shards.size === 0) return false;
+  return [...shards.values()].every(
+    (shard) =>
+      shard.status === Status.Ready &&
+      (shard.lastPingTimestamp < 0 || now - shard.lastPingTimestamp <= ackLimitMs),
+  );
+}
+
+/**
+ * The bot's health as a small file under `var/` (no listener of its own: the web server of plan
+ * 8M is the bot's only one), written every thirty seconds from the start on: when, whether the
+ * bot is still starting (until its login begins), whether the client is connected to Discord and
+ * since when, whether the database answered. The health check
+ * of the Docker stack (`health-cli`) reads it; a file that stops changing means a stuck bot.
+ */
+export class Heartbeat {
+  private readonly startedAt: number;
+  private readonly now: () => number;
+  private gateway: (() => boolean) | undefined;
+  private connected: { connected: boolean; since: number };
+  private timer: NodeJS.Timeout | undefined;
+  private beating: Promise<void> | undefined;
+  private writeFailed = false;
+
+  constructor(private readonly options: HeartbeatOptions) {
+    this.now = options.now ?? Date.now;
+    this.startedAt = this.now();
+    this.connected = { connected: false, since: this.startedAt };
+  }
+
+  /**
+   * The login to Discord begins: the bot is running from here on, and the connection is read
+   * from `probe`; the time without it counts from now.
+   */
+  loggingIn(probe: () => boolean): void {
+    this.gateway = probe;
+    this.connected = { connected: false, since: this.now() };
+  }
+
+  /** Writes the status now and every interval, until `stop`. */
+  start(): void {
+    if (this.timer) return;
+    void this.beat();
+    this.timer = setInterval(() => void this.beat(), this.options.intervalMs ?? 30_000);
+    this.timer.unref();
+  }
+
+  /** Stops writing; a write that has begun finishes. */
+  async stop(): Promise<void> {
+    clearInterval(this.timer);
+    this.timer = undefined;
+    await this.beating;
+  }
+
+  /** One heartbeat: the database asked, the status written. Never throws. */
+  beat(): Promise<void> {
+    // One at a time: a slow database never piles up checks.
+    this.beating ??= this.write().finally(() => {
+      this.beating = undefined;
+    });
+    return this.beating;
+  }
+
+  private async write(): Promise<void> {
+    const database = await this.checkDatabase();
+    const now = this.now();
+    const connected = this.gateway?.() ?? false;
+    if (connected !== this.connected.connected) this.connected = { connected, since: now };
+    const status: HealthStatus = {
+      writtenAt: now,
+      startedAt: this.startedAt,
+      pid: process.pid,
+      phase: this.gateway ? 'running' : 'starting',
+      gateway: this.connected,
+      database,
+    };
+    const { file, log } = this.options;
+    try {
+      await mkdir(path.dirname(file), { recursive: true });
+      // Whole or not at all: the health check never reads half a file.
+      const next = `${file}.next`;
+      await writeFile(next, JSON.stringify(status));
+      await rename(next, file);
+      this.writeFailed = false;
+    } catch (err) {
+      // Once until it works again: the health check says the rest.
+      if (!this.writeFailed) log.warn({ err, file }, 'could not write the heartbeat');
+      this.writeFailed = true;
+    }
+  }
+
+  private async checkDatabase(): Promise<HealthStatus['database']> {
+    const ms = this.options.databaseTimeoutMs ?? 10_000;
+    let timer: NodeJS.Timeout | undefined;
+    const timeout = new Promise<never>((_, reject) => {
+      timer = setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms);
+      timer.unref();
+    });
+    try {
+      await Promise.race([this.options.database(), timeout]);
+      return { reachable: true, checkedAt: this.now() };
+    } catch (err) {
+      const error = err instanceof Error ? err.message : String(err);
+      return { reachable: false, checkedAt: this.now(), error: error.split('\n')[0] ?? error };
+    } finally {
+      clearTimeout(timer);
+    }
+  }
+}
diff --git a/src/ops/owner-alerts.test.ts b/src/ops/owner-alerts.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8764fa207aae5df2965433b18f0b268362cd741c
--- /dev/null
+++ b/src/ops/owner-alerts.test.ts
@@ -0,0 +1,163 @@
+import { mkdtempSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { FakeAlertRest } from '../../test/support/fake-rest.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import {
+  FileStamps,
+  firstLine,
+  MemoryStamps,
+  OwnerAlerts,
+  ownerAlertsFrom,
+} from './owner-alerts.js';
+
+const OWNER = '223456789012345678';
+const MINUTE = 60_000;
+
+function alertsWith(
+  options: { stamps?: FileStamps | MemoryStamps; timeoutMs?: number; at?: { now: number } } = {},
+) {
+  const rest = new FakeAlertRest();
+  const { log, entries } = createTestLogger();
+  const clock = options.at ?? { now: Date.UTC(2026, 9, 16, 3, 0) };
+  const alerts = new OwnerAlerts({
+    rest,
+    ownerId: OWNER,
+    log,
+    stamps: options.stamps ?? new MemoryStamps(),
+    minIntervalMs: 15 * MINUTE,
+    timeoutMs: options.timeoutMs ?? 1_000,
+    now: () => clock.now,
+  });
+  return { rest, alerts, entries, clock };
+}
+
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+describe('OwnerAlerts', () => {
+  it('opens a DM channel with the owner and posts the text there, pinging nobody', async () => {
+    const { rest, alerts } = alertsWith();
+
+    expect(await alerts.send('fatal', 'Professor Pine stopped: boom')).toBe('sent');
+
+    expect(rest.requests).toEqual([
+      { route: '/users/@me/channels', body: { recipient_id: OWNER } },
+      {
+        route: `/channels/dm-of-${OWNER}/messages`,
+        body: { content: 'Professor Pine stopped: boom', allowed_mentions: { parse: [] } },
+      },
+    ]);
+  });
+
+  it('holds back a second alert of the same kind within the interval, not one of another kind', async () => {
+    const { rest, alerts, clock, entries } = alertsWith();
+
+    await alerts.send('fatal', 'first');
+    clock.now += 10 * MINUTE;
+    expect(await alerts.send('fatal', 'second')).toBe('held');
+    expect(await alerts.send('restart', 'restarted')).toBe('sent');
+    clock.now += 5 * MINUTE;
+    expect(await alerts.send('fatal', 'third')).toBe('sent');
+
+    expect(rest.messages()).toEqual(['first', 'restarted', 'third']);
+    expect(
+      entries.some((entry) => entry.msg === 'owner alert held back' && entry.kind === 'fatal'),
+    ).toBe(true);
+  });
+
+  it('remembers the last alerts in a file, so that a crashing bot does not alert at every start', async () => {
+    const file = path.join(
+      mkdtempSync(path.join(tmpdir(), 'pine-alerts-')),
+      'health',
+      'alerts.json',
+    );
+    const at = { now: Date.UTC(2026, 9, 16, 3, 0) };
+    const before = alertsWith({ stamps: new FileStamps(file), at });
+    await before.alerts.send('fatal', 'crash one');
+
+    at.now += MINUTE;
+    const after = alertsWith({ stamps: new FileStamps(file), at });
+    expect(await after.alerts.send('fatal', 'crash two')).toBe('held');
+    at.now += 15 * MINUTE;
+    expect(await after.alerts.send('fatal', 'crash three')).toBe('sent');
+    expect(after.rest.messages()).toEqual(['crash three']);
+  });
+
+  it('logs a failed alert and does not throw; the next one is not held back', async () => {
+    const { rest, alerts, entries } = alertsWith();
+    rest.failWith = new Error('getaddrinfo ENOTFOUND discord.com');
+
+    expect(await alerts.send('fatal', 'boom')).toBe('failed');
+    expect(
+      entries.some((entry) => entry.level === 40 && entry.msg === 'could not alert the owner'),
+    ).toBe(true);
+
+    rest.failWith = undefined;
+    expect(await alerts.send('fatal', 'boom again')).toBe('sent');
+  });
+
+  it('gives up on an alert that Discord does not answer within its time', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    const { rest, alerts } = alertsWith({ timeoutMs: 5_000 });
+    rest.failWith = 'hang';
+
+    const sending = alerts.send('fatal', 'boom');
+    expect(vi.getTimerCount()).toBe(1);
+    await vi.advanceTimersByTimeAsync(5_000);
+
+    expect(await sending).toBe('failed');
+  });
+
+  it('sends one of two alerts of a kind asked for at the same moment', async () => {
+    const { rest, alerts } = alertsWith();
+
+    const outcomes = await Promise.all([alerts.send('fatal', 'one'), alerts.send('fatal', 'two')]);
+
+    expect(outcomes).toEqual(['sent', 'held']);
+    expect(rest.messages()).toEqual(['one']);
+  });
+
+  it('cuts a text to what a message holds', async () => {
+    const { rest, alerts } = alertsWith();
+
+    await alerts.send('fatal', 'x'.repeat(2_500));
+
+    expect(rest.messages()[0]).toHaveLength(2_000);
+    expect(rest.messages()[0]?.endsWith('…')).toBe(true);
+  });
+});
+
+describe('ownerAlertsFrom', () => {
+  const { log } = createTestLogger();
+
+  it('needs the token and the owner', () => {
+    expect(ownerAlertsFrom({ OWNER_ID: OWNER }, log, new MemoryStamps())).toBeUndefined();
+    expect(ownerAlertsFrom({ DISCORD_TOKEN: 'token' }, log, new MemoryStamps())).toBeUndefined();
+    expect(
+      ownerAlertsFrom({ DISCORD_TOKEN: 'token', OWNER_ID: 'me' }, log, new MemoryStamps()),
+    ).toBeUndefined();
+    expect(
+      ownerAlertsFrom({ DISCORD_TOKEN: ' ', OWNER_ID: OWNER }, log, new MemoryStamps()),
+    ).toBeUndefined();
+    expect(
+      ownerAlertsFrom({ DISCORD_TOKEN: 'token', OWNER_ID: OWNER }, log, new MemoryStamps()),
+    ).toBeInstanceOf(OwnerAlerts);
+  });
+});
+
+describe('firstLine', () => {
+  it('is the first line of an error message, never its stack', () => {
+    const err = new Error('Connection lost\nat the second line');
+    expect(firstLine(err)).toBe('Connection lost');
+    expect(firstLine('plain words')).toBe('plain words');
+    // A heading line takes the line after it along.
+    expect(firstLine(new Error('Invalid environment:\n✖ Invalid input\n  → at DB_HOST'))).toBe(
+      'Invalid environment: ✖ Invalid input',
+    );
+    expect(firstLine(new Error(''))).toBe('Error');
+    expect(firstLine(new Error('y'.repeat(400)))).toHaveLength(300);
+  });
+});
diff --git a/src/ops/owner-alerts.ts b/src/ops/owner-alerts.ts
new file mode 100644
index 0000000000000000000000000000000000000000..93a36b4bad4a54a774429cf9468fd849c40f2441
--- /dev/null
+++ b/src/ops/owner-alerts.ts
@@ -0,0 +1,192 @@
+import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
+import path from 'node:path';
+import { REST, Routes } from 'discord.js';
+import { isSnowflake } from '../db/snowflake.js';
+import type { Logger } from '../log.js';
+
+/**
+ * What an alert is about. Each kind has its own minimum interval, so that a crash loop sends one
+ * "stopped" and one "restarted" now and then, and a backup failure is not held back by a crash.
+ */
+export type AlertKind = 'fatal' | 'restart' | 'unhealthy' | 'restarting' | 'backup';
+
+/** What became of an alert: sent, held back by the interval, or failed (logged). */
+export type AlertOutcome = 'sent' | 'held' | 'failed';
+
+/** The part of discord.js's `REST` an alert needs. */
+export interface AlertRest {
+  post(route: `/${string}`, options: { body: unknown }): Promise<unknown>;
+}
+
+/** When an alert of each kind was last sent; `undefined` forgets it. */
+export interface AlertStamps {
+  last(kind: AlertKind): number | undefined;
+  set(kind: AlertKind, at: number | undefined): void;
+}
+
+/** Stamps for one process (the watchdog, which does not crash-loop). */
+export class MemoryStamps implements AlertStamps {
+  private readonly stamps = new Map<AlertKind, number>();
+
+  last(kind: AlertKind): number | undefined {
+    return this.stamps.get(kind);
+  }
+
+  set(kind: AlertKind, at: number | undefined): void {
+    if (at === undefined) this.stamps.delete(kind);
+    else this.stamps.set(kind, at);
+  }
+}
+
+/**
+ * Stamps in a small JSON file (`var/health/alerts.json`), so that the interval holds across the
+ * restarts of a bot that crashes at every start. A file that cannot be read counts as empty; one
+ * that cannot be written only costs the interval.
+ */
+export class FileStamps implements AlertStamps {
+  constructor(private readonly file: string) {}
+
+  last(kind: AlertKind): number | undefined {
+    const at = this.read()[kind];
+    return typeof at === 'number' ? at : undefined;
+  }
+
+  set(kind: AlertKind, at: number | undefined): void {
+    try {
+      mkdirSync(path.dirname(this.file), { recursive: true });
+      const next = `${this.file}.next`;
+      writeFileSync(next, JSON.stringify({ ...this.read(), [kind]: at }));
+      renameSync(next, this.file);
+    } catch {
+      // The alert went out; only its interval is not remembered.
+    }
+  }
+
+  private read(): Record<string, unknown> {
+    try {
+      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
+      return typeof parsed === 'object' && parsed !== null
+        ? (parsed as Record<string, unknown>)
+        : {};
+    } catch {
+      return {};
+    }
+  }
+}
+
+/** Discord's limit on a message's text. */
+const CONTENT_LIMIT = 2_000;
+/** How much of an error an alert quotes. */
+const ERROR_LIMIT = 300;
+
+function cut(text: string, limit: number): string {
+  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
+}
+
+/**
+ * The first line of an error's message (never its stack), at most 300 characters; a line that
+ * ends with a colon ("Invalid environment:") takes the next one along.
+ */
+export function firstLine(err: unknown): string {
+  const text = err instanceof Error ? err.message || err.name : String(err);
+  const [first, second] = text
+    .split('\n')
+    .map((line) => line.trim())
+    .filter(Boolean);
+  const line = first?.endsWith(':') && second ? `${first} ${second}` : first;
+  return cut(line ?? 'Error', ERROR_LIMIT);
+}
+
+/** A time in an alert: Discord shows it in the reader's own time zone. */
+export function alertTime(ms: number): string {
+  return `<t:${Math.floor(ms / 1000)}:f>`;
+}
+
+export interface OwnerAlertsOptions {
+  rest: AlertRest;
+  ownerId: string;
+  log: Logger;
+  stamps: AlertStamps;
+  /** The least time between two alerts of one kind. Fifteen minutes. */
+  minIntervalMs?: number;
+  /** How long an alert may take before it is given up. Five seconds. */
+  timeoutMs?: number;
+  now?: () => number;
+}
+
+/**
+ * Direct messages to the bot's owner (`OWNER_ID`) about the bot itself: a crash, a restart after
+ * one, what the watchdog did, a failed backup. Plain text through Discord's REST API with the
+ * bot's token, so that they work without the gateway and without `DmSender` (whose queue a
+ * crashing bot does not drain). `send` never throws: a failure is logged.
+ */
+export class OwnerAlerts {
+  private readonly minIntervalMs: number;
+  private readonly timeoutMs: number;
+  private readonly now: () => number;
+
+  constructor(private readonly options: OwnerAlertsOptions) {
+    this.minIntervalMs = options.minIntervalMs ?? 15 * 60_000;
+    this.timeoutMs = options.timeoutMs ?? 5_000;
+    this.now = options.now ?? Date.now;
+  }
+
+  async send(kind: AlertKind, text: string): Promise<AlertOutcome> {
+    const { log, stamps } = this.options;
+    const now = this.now();
+    const last = stamps.last(kind);
+    if (last !== undefined && now - last < this.minIntervalMs) {
+      log.info({ kind }, 'owner alert held back');
+      return 'held';
+    }
+    // Taken before the alert goes, so that a second alert of the kind meanwhile is held back;
+    // given back when this one fails.
+    stamps.set(kind, now);
+    let timer: NodeJS.Timeout | undefined;
+    const timeout = new Promise<never>((_, reject) => {
+      timer = setTimeout(
+        () => reject(new Error(`no answer from Discord within ${this.timeoutMs} ms`)),
+        this.timeoutMs,
+      );
+      timer.unref();
+    });
+    try {
+      await Promise.race([this.deliver(text), timeout]);
+      log.info({ kind }, 'owner alerted');
+      return 'sent';
+    } catch (err) {
+      stamps.set(kind, last);
+      log.warn({ err, kind }, 'could not alert the owner');
+      return 'failed';
+    } finally {
+      clearTimeout(timer);
+    }
+  }
+
+  private async deliver(text: string): Promise<void> {
+    const { rest, ownerId } = this.options;
+    const channel = (await rest.post(Routes.userChannels(), {
+      body: { recipient_id: ownerId },
+    })) as { id: string };
+    await rest.post(Routes.channelMessages(channel.id), {
+      body: { content: cut(text, CONTENT_LIMIT), allowed_mentions: { parse: [] } },
+    });
+  }
+}
+
+/**
+ * The owner's alerts from the environment as it is (before or without the bot's config):
+ * nothing when the token or the owner is missing, since then there is nobody to tell or no way.
+ */
+export function ownerAlertsFrom(
+  env: Record<string, string | undefined>,
+  log: Logger,
+  stamps: AlertStamps,
+): OwnerAlerts | undefined {
+  const token = env.DISCORD_TOKEN?.trim();
+  const ownerId = env.OWNER_ID?.trim();
+  if (!token || !ownerId || !isSnowflake(ownerId)) return undefined;
+  // One try, quickly: the caller is often on its way out.
+  const rest = new REST({ retries: 0, timeout: 5_000 }).setToken(token);
+  return new OwnerAlerts({ rest, ownerId, log, stamps });
+}
diff --git a/src/ops/start-stop.test.ts b/src/ops/start-stop.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..46e85dae610a06a48b1557cc7a720cbbf1fe8891
--- /dev/null
+++ b/src/ops/start-stop.test.ts
@@ -0,0 +1,27 @@
+import { describe, expect, it } from 'vitest';
+import { startCheckpoint, StartStopped } from './start-stop.js';
+
+describe('startCheckpoint', () => {
+  it('lets the start go on until a stop is asked for, then ends it between two steps', async () => {
+    let stopAsked = false;
+    const done: string[] = [];
+    const checkpoint = startCheckpoint(() => stopAsked);
+    const steps = async () => {
+      for (const step of ['migrations', 'game data', 'gyms']) {
+        await Promise.resolve();
+        done.push(step);
+        // A stop asked for during the migrations lets them finish.
+        if (step === 'migrations') stopAsked = true;
+        checkpoint();
+      }
+    };
+
+    await expect(steps()).rejects.toBeInstanceOf(StartStopped);
+    expect(done).toEqual(['migrations']);
+  });
+
+  it('never stops a start nobody asked to stop', () => {
+    expect(() => startCheckpoint(undefined)()).not.toThrow();
+    expect(() => startCheckpoint(() => false)()).not.toThrow();
+  });
+});
diff --git a/src/ops/start-stop.ts b/src/ops/start-stop.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a152e1044204fc9752859fdd212aeadfe3c0ca5f
--- /dev/null
+++ b/src/ops/start-stop.ts
@@ -0,0 +1,17 @@
+/** The start was ended between two steps because a stop was asked for (SIGTERM, SIGINT). */
+export class StartStopped extends Error {
+  constructor() {
+    super('stopped during the start');
+  }
+}
+
+/**
+ * A point between two steps of the start where a stop asked for in the meantime ends it: a step
+ * under way (the migrations above all, whose DDL is not transactional) always finishes first.
+ * Throws `StartStopped`; the start's own error handling closes what was opened.
+ */
+export function startCheckpoint(stopRequested: (() => boolean) | undefined): () => void {
+  return () => {
+    if (stopRequested?.()) throw new StartStopped();
+  };
+}
diff --git a/test/support/fake-rest.ts b/test/support/fake-rest.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2ba88c50431a5ee8dd8343e152632e00f16f4870
--- /dev/null
+++ b/test/support/fake-rest.ts
@@ -0,0 +1,45 @@
+/** One request the owner's alerts made of Discord's REST API. */
+export interface RestRequest {
+  route: string;
+  body: unknown;
+}
+
+/** Discord's limit on a message's text. */
+const CONTENT_LIMIT = 2_000;
+
+/**
+ * Discord's REST API as the owner's alerts use it (`src/ops/owner-alerts.ts`): opening a DM
+ * channel and posting into it. Records every request and refuses what Discord refuses (a
+ * message without text or over 2,000 characters, a route it does not know). `failWith` makes
+ * every request from then on fail with that error, or never answer (`'hang'`).
+ */
+export class FakeAlertRest {
+  readonly requests: RestRequest[] = [];
+  failWith: Error | 'hang' | undefined;
+
+  post(route: `/${string}`, options: { body: unknown }): Promise<unknown> {
+    this.requests.push({ route, body: options.body });
+    if (this.failWith === 'hang') return new Promise(() => undefined);
+    if (this.failWith) return Promise.reject(this.failWith);
+    const body = options.body as Record<string, unknown>;
+    if (route === '/users/@me/channels') {
+      return Promise.resolve({ id: `dm-of-${String(body.recipient_id)}` });
+    }
+    const message = /^\/channels\/([^/]+)\/messages$/.exec(route);
+    if (message) {
+      const content = body.content;
+      if (typeof content !== 'string' || content.length === 0 || content.length > CONTENT_LIMIT) {
+        return Promise.reject(new Error('Invalid Form Body: content'));
+      }
+      return Promise.resolve({ id: `message-${this.requests.length}`, channel_id: message[1] });
+    }
+    return Promise.reject(new Error(`404: Not Found (${route})`));
+  }
+
+  /** The texts of the messages posted, in order. */
+  messages(): string[] {
+    return this.requests
+      .filter((request) => request.route.endsWith('/messages'))
+      .map((request) => String((request.body as { content: unknown }).content));
+  }
+}
````

### Task 4: Plan 9A T4: Watchdog: restarts a stuck bot, tells the owner of the rest

Prototype commit: `2ef3167ccaf2d7c34ccbe3f9ee88869631450e83`

A fourth service of the stack, the bot's image with node dist/ops/watchdog-cli.js and the
Docker socket mounted (as root inside, since the socket is root in effect anyway), with only
the environment it needs: no database password. Every thirty seconds it reads the pine
container of its own Compose project (found from its own container's labels) through the
Engine's API, with Node's http over the socket and no new dependency; a question may take
ten seconds, a restart (?t=150) the bot's whole stop and more.

It reads the kind of the health check's line: a stale or missing heartbeat (a stuck bot)
for WATCHDOG_UNHEALTHY_MINUTES (5) and it restarts the bot and DMs the owner; the database,
Discord, a long start for WATCHDOG_ALERT_MINUTES (15) and it only tells the owner, once a
spell, since a restart mends none of them; a starting bot is never restarted.
WATCHDOG_RESTARTS (3) restarts by Docker within WATCHDOG_RESTART_WINDOW_MINUTES (30) and it
DMs that the bot keeps restarting. Where the project has a backup service it reads its
status file in the ops volume and DMs a failed backup once, and no good backup for
WATCHDOG_BACKUP_HOURS (26) at most twice a day. What it told and its alert stamps live in the
ops volume and survive its restarts. It never restarts another container, a one-off
container or a stopped bot.

loggerFromEnv gives the bot's start and the watchdog a logger before any config is read.

**Files:**

```
 .env.example                |  10 ++
 compose.yaml                |  30 ++++++
 src/config/env.ts           |   6 +-
 src/index.ts                |   9 +-
 src/log.test.ts             |  10 +-
 src/log.ts                  |  14 +++
 src/ops/backup-status.ts    |  35 +++++++
 src/ops/docker-api.test.ts  | 162 +++++++++++++++++++++++++++++
 src/ops/docker-api.ts       | 145 ++++++++++++++++++++++++++
 src/ops/owner-alerts.ts     |   3 +-
 src/ops/watchdog-cli.ts     |  85 +++++++++++++++
 src/ops/watchdog.test.ts    | 363 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ops/watchdog.ts         | 331 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/fake-docker.ts |  76 ++++++++++++++
 14 files changed, 1266 insertions(+), 13 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/log.test.ts src/ops/docker-api.test.ts src/ops/watchdog.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 2ef3167ccaf2d7c34ccbe3f9ee88869631450e83 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T4: Watchdog: restarts a stuck bot, tells the owner of the rest`, the body above and the trailer, staging exactly
  `.env.example compose.yaml src/config/env.ts src/index.ts src/log.test.ts src/log.ts src/ops/backup-status.ts src/ops/docker-api.test.ts src/ops/docker-api.ts src/ops/owner-alerts.ts src/ops/watchdog-cli.ts src/ops/watchdog.test.ts src/ops/watchdog.ts test/support/fake-docker.ts`.

````diff
diff --git a/.env.example b/.env.example
index 2dafc27f451e6ba52b65f0f4455f8d9f9069b0eb..252d1a9fbc04590e980fe7767e5995db09500e0a 100644
--- a/.env.example
+++ b/.env.example
@@ -41,3 +41,13 @@ NODE_ENV=production
 # The settings are pine-settings.json beside compose.yaml (copy data/settings.json; git-ignored).
 # The password of MySQL's root user in the stack, set on its first start; the bot never sees it.
 DB_ROOT_PASSWORD=
+# The watchdog restarts the bot after it has been stuck (a stale heartbeat) this many minutes,
+# and DMs OWNER_ID when the bot has been unhealthy for another reason (the database, Discord, a
+# long start) WATCHDOG_ALERT_MINUTES, restarted WATCHDOG_RESTARTS times within
+# WATCHDOG_RESTART_WINDOW_MINUTES, or no backup succeeded for WATCHDOG_BACKUP_HOURS. Blank means
+# the default shown.
+WATCHDOG_UNHEALTHY_MINUTES=5
+WATCHDOG_ALERT_MINUTES=15
+WATCHDOG_RESTARTS=3
+WATCHDOG_RESTART_WINDOW_MINUTES=30
+WATCHDOG_BACKUP_HOURS=26
diff --git a/compose.yaml b/compose.yaml
index 360ea197e91b69f5a0fd8f99254fe9a3955472f0..0187b9f1346ff5b4fa2a4a1c00c851bc367a4cbc 100644
--- a/compose.yaml
+++ b/compose.yaml
@@ -69,6 +69,34 @@ services:
       start_period: 10m
     # No port of the bot is published to the host.
 
+  # Restarts the bot when it has been stuck for a while (a stale heartbeat, which neither an
+  # exit nor the restart policy catches) and DMs the owner of that, of an unhealthy bot a restart
+  # would not mend, of a bot that keeps restarting, and of failed backups. The Docker socket gives it control of Docker on this host
+  # (root, in effect): accepted for a home server, since a stuck bot cannot restart itself. It
+  # restarts nothing but the pine service of this project. Root inside, since the socket is.
+  watchdog:
+    image: professor-pine:local
+    command: ['node', '--enable-source-maps', 'dist/ops/watchdog-cli.js']
+    user: '0'
+    # Only what it needs of `.env`: no database password in a container that holds the socket.
+    environment:
+      DISCORD_TOKEN: ${DISCORD_TOKEN:-}
+      OWNER_ID: ${OWNER_ID:-}
+      LOG_LEVEL: ${LOG_LEVEL:-info}
+      WATCHDOG_UNHEALTHY_MINUTES: ${WATCHDOG_UNHEALTHY_MINUTES:-}
+      WATCHDOG_ALERT_MINUTES: ${WATCHDOG_ALERT_MINUTES:-}
+      WATCHDOG_RESTARTS: ${WATCHDOG_RESTARTS:-}
+      WATCHDOG_RESTART_WINDOW_MINUTES: ${WATCHDOG_RESTART_WINDOW_MINUTES:-}
+      WATCHDOG_BACKUP_HOURS: ${WATCHDOG_BACKUP_HOURS:-}
+    volumes:
+      - /var/run/docker.sock:/var/run/docker.sock
+      # The backup's result to read, and what it told (kept across its own restarts).
+      - ops:/ops
+    depends_on:
+      - pine
+    init: true
+    restart: unless-stopped
+
   # cloudflared: plan 8M fills this slot. The bot's web server listens on 0.0.0.0 inside this
   # network (settings `web.listen`, `web.port`), its port is not published, and the tunnel
   # reaches it as http://pine:<port>; the token comes from `.env`, never from a file here.
@@ -85,3 +113,5 @@ services:
 volumes:
   mysql-data:
   pine-var:
+  # The backup's last result, which the watchdog reads.
+  ops:
diff --git a/src/config/env.ts b/src/config/env.ts
index 9d822fe38283d2cafc40d3e26bc1e62b521ddc39..65c1fd3eaa48874644f512da065ed0f0fb607aae 100644
--- a/src/config/env.ts
+++ b/src/config/env.ts
@@ -1,4 +1,5 @@
 import { z } from 'zod';
+import { LOG_LEVELS } from '../log.js';
 import { ConfigError } from './errors.js';
 
 const SNOWFLAKE = /^\d{17,20}$/;
@@ -27,10 +28,7 @@ export const envSchema = z
     GOOGLE_API_KEY: optional(z.string()),
     GITHUB_TOKEN: optional(z.string()),
     GITHUB_REPO: optional(z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/repo')),
-    LOG_LEVEL: z.preprocess(
-      blankToUndefined,
-      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
-    ),
+    LOG_LEVEL: z.preprocess(blankToUndefined, z.enum(LOG_LEVELS).default('info')),
     NODE_ENV: z.preprocess(
       blankToUndefined,
       z.enum(['development', 'production', 'test']).default('production'),
diff --git a/src/index.ts b/src/index.ts
index 3edd5153c181071baa5321da9ee8f5808798154b..480415ac4847ad162082cb64121aa989df218a02 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,19 +1,14 @@
 import { startApp } from './app.js';
 import { ConfigError } from './config/errors.js';
-import { createLogger } from './log.js';
+import { loggerFromEnv } from './log.js';
 import { CrashRecord, restartText } from './ops/crash-record.js';
 import { HEALTH_DIR, healthFiles } from './ops/health.js';
 import { FileStamps, firstLine, ownerAlertsFrom } from './ops/owner-alerts.js';
 import { StartStopped } from './ops/start-stop.js';
 
-const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];
-
 // The owner's alerts and the crash marker work before the config is read and after it failed:
 // they need only the token and OWNER_ID, and log through a logger of their own.
-const opsLog = createLogger({
-  level: LEVELS.includes(process.env.LOG_LEVEL ?? '') ? (process.env.LOG_LEVEL ?? 'info') : 'info',
-  pretty: process.env.NODE_ENV === 'development',
-});
+const opsLog = loggerFromEnv(process.env);
 const alerts = ownerAlertsFrom(process.env, opsLog, new FileStamps(healthFiles().alerts));
 const crashes = new CrashRecord({ dir: HEALTH_DIR });
 const crashed = crashes.started();
diff --git a/src/log.test.ts b/src/log.test.ts
index 06dd35c9a24459dee5183d45018b6eca5c5e8172..ceb1b5e9477e8b0ae6edc40422ce927885447d17 100644
--- a/src/log.test.ts
+++ b/src/log.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { createLogger, REDACT_PATHS } from './log.js';
+import { createLogger, loggerFromEnv, REDACT_PATHS } from './log.js';
 
 describe('createLogger', () => {
   it('uses the requested level', () => {
@@ -7,6 +7,14 @@ describe('createLogger', () => {
   });
 });
 
+describe('loggerFromEnv', () => {
+  it('takes LOG_LEVEL as it is, and info for a level pino does not know', () => {
+    expect(loggerFromEnv({ LOG_LEVEL: 'debug' }).level).toBe('debug');
+    expect(loggerFromEnv({ LOG_LEVEL: 'loud' }).level).toBe('info');
+    expect(loggerFromEnv({}).level).toBe('info');
+  });
+});
+
 describe('secret redaction', () => {
   function capture() {
     const entries: Array<Record<string, unknown>> = [];
diff --git a/src/log.ts b/src/log.ts
index de94c184c949da56915207dfc92d042812c89b01..e31a96b5f4842d5d15680ad591cd36d30eef0f20 100644
--- a/src/log.ts
+++ b/src/log.ts
@@ -40,3 +40,17 @@ export function createLogger(
   };
   return destination && !options.pretty ? pino(config, destination) : pino(config);
 }
+
+/** The levels `LOG_LEVEL` may name. */
+export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
+
+/**
+ * A logger from the environment as it is, for what runs before the config is read or without it
+ * (the owner's alerts at a failed start, the watchdog): `LOG_LEVEL`, or `info` when it names no
+ * level; pretty in development.
+ */
+export function loggerFromEnv(env: Record<string, string | undefined>): Logger {
+  const levels: readonly string[] = LOG_LEVELS;
+  const level = env.LOG_LEVEL && levels.includes(env.LOG_LEVEL) ? env.LOG_LEVEL : 'info';
+  return createLogger({ level, pretty: env.NODE_ENV === 'development' });
+}
diff --git a/src/ops/backup-status.ts b/src/ops/backup-status.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3d51fe361a1f18cfb4e21e0a5e0a181985d3a541
--- /dev/null
+++ b/src/ops/backup-status.ts
@@ -0,0 +1,35 @@
+import { readFileSync } from 'node:fs';
+import { z } from 'zod';
+
+/**
+ * Where the backup service (`docker/backup.sh`) leaves the result of its last run, in the
+ * stack's `ops` volume, which the watchdog mounts too.
+ */
+export const BACKUP_STATUS_FILE = '/ops/backup-status.json';
+
+const backupStatusSchema = z.object({
+  /** When the last run ended (epoch milliseconds). */
+  finishedAt: z.number(),
+  ok: z.boolean(),
+  /** Why it failed. */
+  reason: z.string().optional(),
+  /** The dump's file name in the backup folder. */
+  file: z.string().optional(),
+  bytes: z.number().optional(),
+  seconds: z.number().optional(),
+  /** When a run last succeeded, this one or an earlier one. */
+  lastOkAt: z.number().optional(),
+});
+
+/** The result of the last backup, as the backup service writes it. */
+export type BackupStatus = z.output<typeof backupStatusSchema>;
+
+/** The last backup's result, or nothing when no backup ran yet or the file cannot be read. */
+export function readBackupStatus(file: string = BACKUP_STATUS_FILE): BackupStatus | undefined {
+  try {
+    const parsed = backupStatusSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
+    return parsed.success ? parsed.data : undefined;
+  } catch {
+    return undefined;
+  }
+}
diff --git a/src/ops/docker-api.test.ts b/src/ops/docker-api.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..835150fb93fa8f1d3e0ea0a7ed8cfdeb5ebabefe
--- /dev/null
+++ b/src/ops/docker-api.test.ts
@@ -0,0 +1,162 @@
+import { randomBytes } from 'node:crypto';
+import http from 'node:http';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { Tally } from '../../test/support/tally.js';
+import { SocketDockerApi } from './docker-api.js';
+
+/** What the fake Engine was asked: method and path with its query. */
+const asked: string[] = [];
+/** The requests that reached the fake Engine. */
+let arrived = new Tally('requests to the fake Engine');
+let server: http.Server | undefined;
+
+/** A socket path of this machine's kind: a named pipe on Windows, a file elsewhere. */
+function socketPath(): string {
+  const name = `pine-docker-${randomBytes(6).toString('hex')}`;
+  return process.platform === 'win32'
+    ? `\\\\.\\pipe\\${name}`
+    : path.join(tmpdir(), `${name}.sock`);
+}
+
+const PINE = {
+  Id: 'abc123',
+  Name: '/pine-pine-1',
+  RestartCount: 2,
+  Config: {
+    Labels: { 'com.docker.compose.project': 'pine', 'com.docker.compose.service': 'pine' },
+  },
+  State: {
+    Status: 'running',
+    Running: true,
+    ExitCode: 0,
+    Health: {
+      Status: 'unhealthy',
+      FailingStreak: 3,
+      Log: [
+        { ExitCode: 0, Output: 'healthy: connected to Discord for 2 hours\n' },
+        { ExitCode: 1, Output: 'the last heartbeat is 2 minutes old\n' },
+      ],
+    },
+  },
+};
+
+/** The Docker Engine's API on a local socket, as far as the watchdog uses it. */
+async function fakeEngine(): Promise<string> {
+  const where = socketPath();
+  server = http.createServer((request, response) => {
+    asked.push(`${request.method} ${request.url}`);
+    arrived.add();
+    const answer = (status: number, body?: unknown) => {
+      response.writeHead(status, { 'content-type': 'application/json' });
+      response.end(body === undefined ? undefined : JSON.stringify(body));
+    };
+    const url = new URL(request.url ?? '/', 'http://engine');
+    if (request.method === 'GET' && url.pathname === '/containers/json') {
+      return answer(200, [{ Id: 'abc123' }, { Id: 'def456' }]);
+    }
+    if (request.method === 'GET' && url.pathname === '/containers/abc123/json') {
+      return answer(200, PINE);
+    }
+    if (request.method === 'GET' && url.pathname === '/containers/plain/json') {
+      return answer(200, {
+        ...PINE,
+        Id: 'plain',
+        State: { Status: 'exited', Running: false, ExitCode: 137 },
+      });
+    }
+    if (request.method === 'POST' && url.pathname === '/containers/abc123/restart') {
+      return answer(204);
+    }
+    // A restart answers once the container has stopped and started again: up to its grace.
+    if (request.method === 'POST' && url.pathname === '/containers/slow/restart') {
+      setTimeout(() => answer(204), 150_000);
+      return;
+    }
+    if (request.method === 'GET' && url.pathname === '/containers/stuck/json') return;
+    if (request.method === 'POST' && url.pathname === '/containers/broken/restart') {
+      return answer(500, { message: 'Cannot restart container broken: permission denied' });
+    }
+    return answer(404, { message: `No such container: ${url.pathname.split('/')[2]}` });
+  });
+  await new Promise<void>((resolve) => server?.listen(where, resolve));
+  return where;
+}
+
+afterEach(async () => {
+  vi.useRealTimers();
+  asked.length = 0;
+  arrived = new Tally('requests to the fake Engine');
+  server?.closeAllConnections();
+  await new Promise((resolve) => server?.close(resolve));
+  server = undefined;
+});
+
+describe('SocketDockerApi', () => {
+  it('lists the containers, stopped ones too, that carry every label asked for', async () => {
+    const docker = new SocketDockerApi(await fakeEngine());
+
+    const ids = await docker.containerIds(['com.docker.compose.project=pine', 'a=b']);
+
+    expect(ids).toEqual(['abc123', 'def456']);
+    const filters = JSON.stringify({ label: ['com.docker.compose.project=pine', 'a=b'] });
+    expect(asked).toEqual([`GET /containers/json?all=true&filters=${encodeURIComponent(filters)}`]);
+  });
+
+  it('reads a container: running, its health and the last output of its health check', async () => {
+    const docker = new SocketDockerApi(await fakeEngine());
+
+    expect(await docker.container('abc123')).toEqual({
+      id: 'abc123',
+      running: true,
+      health: 'unhealthy',
+      healthOutput: 'the last heartbeat is 2 minutes old\n',
+      restartCount: 2,
+      exitCode: 0,
+      labels: { 'com.docker.compose.project': 'pine', 'com.docker.compose.service': 'pine' },
+    });
+  });
+
+  it('reads a container without a health check, and none that is not there', async () => {
+    const docker = new SocketDockerApi(await fakeEngine());
+
+    expect(await docker.container('plain')).toMatchObject({
+      running: false,
+      health: 'none',
+      exitCode: 137,
+    });
+    expect(await docker.container('gone')).toBeUndefined();
+  });
+
+  it("restarts a container, and fails with the Engine's own words", async () => {
+    const docker = new SocketDockerApi(await fakeEngine());
+
+    await docker.restart('abc123');
+    await expect(docker.restart('broken')).rejects.toThrow(
+      'Cannot restart container broken: permission denied',
+    );
+    expect(asked).toEqual([
+      'POST /containers/abc123/restart?t=150',
+      'POST /containers/broken/restart?t=150',
+    ]);
+  });
+
+  it('waits for a restart as long as the bot may take to stop, and no longer for a question', async () => {
+    const docker = new SocketDockerApi(await fakeEngine());
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+
+    const restarting = docker.restart('slow');
+    await arrived.reached(1);
+    await vi.advanceTimersByTimeAsync(150_000);
+    await expect(restarting).resolves.toBeUndefined();
+
+    const asking = docker.container('stuck');
+    const failed = expect(asking).rejects.toThrow(
+      'the Docker Engine did not answer GET /containers/stuck/json',
+    );
+    await arrived.reached(2);
+    await vi.advanceTimersByTimeAsync(10_000);
+    await failed;
+  });
+});
diff --git a/src/ops/docker-api.ts b/src/ops/docker-api.ts
new file mode 100644
index 0000000000000000000000000000000000000000..374b32e7839298f899c057c14fbfa2696219c387
--- /dev/null
+++ b/src/ops/docker-api.ts
@@ -0,0 +1,145 @@
+import http from 'node:http';
+
+/** What the watchdog needs to know of a container. */
+export interface ContainerState {
+  id: string;
+  running: boolean;
+  /** Its health check's verdict; `none` for a container without one. */
+  health: 'starting' | 'healthy' | 'unhealthy' | 'none';
+  /** What the last run of its health check printed. */
+  healthOutput?: string;
+  /** How often Docker restarted it by its restart policy (after it exited). */
+  restartCount: number;
+  /** How its process ended the last time. */
+  exitCode: number;
+  labels: Record<string, string>;
+}
+
+/** The Docker Engine, as far as the watchdog asks it. */
+export interface DockerApi {
+  /** The containers, stopped ones too, that carry every label (`key=value`). */
+  containerIds(labels: readonly string[]): Promise<string[]>;
+  /** A container by id or name; nothing when there is none. */
+  container(id: string): Promise<ContainerState | undefined>;
+  /** Restarts a container (stopped with its own stop timeout, then started). */
+  restart(id: string): Promise<void>;
+}
+
+const HEALTH = new Set(['starting', 'healthy', 'unhealthy']);
+
+/** The parts of the Engine's answer to `GET /containers/{id}/json` that are read. */
+interface EngineContainer {
+  Id: string;
+  RestartCount?: number;
+  Config?: { Labels?: Record<string, string> | null };
+  State?: {
+    Running?: boolean;
+    ExitCode?: number;
+    Health?: { Status?: string; Log?: Array<{ Output?: string }> | null };
+  };
+}
+
+/**
+ * The Docker Engine's API over its socket (`/var/run/docker.sock`, mounted into the watchdog),
+ * with Node's own `http`: no client library. Answers that are not 2xx reject with the Engine's
+ * message, except a container that is not there, which is `undefined`.
+ */
+export class SocketDockerApi implements DockerApi {
+  constructor(
+    private readonly socketPath: string,
+    private readonly options: {
+      /** How long a question may take. Ten seconds. */
+      timeoutMs?: number;
+      /**
+       * How long Docker gives the container to stop at a restart (`?t=`): the bot's
+       * `stop_grace_period` of compose.yaml, 150 seconds.
+       */
+      stopSeconds?: number;
+    } = {},
+  ) {}
+
+  async containerIds(labels: readonly string[]): Promise<string[]> {
+    const filters = encodeURIComponent(JSON.stringify({ label: labels }));
+    const answer = await this.request('GET', `/containers/json?all=true&filters=${filters}`);
+    return (answer.body as Array<{ Id: string }>).map((container) => container.Id);
+  }
+
+  async container(id: string): Promise<ContainerState | undefined> {
+    const answer = await this.request('GET', `/containers/${encodeURIComponent(id)}/json`, [404]);
+    if (answer.status === 404) return undefined;
+    const container = answer.body as EngineContainer;
+    const health = container.State?.Health;
+    const status = health?.Status ?? 'none';
+    const last = health?.Log?.at(-1)?.Output;
+    return {
+      id: container.Id,
+      running: container.State?.Running ?? false,
+      health: HEALTH.has(status) ? (status as ContainerState['health']) : 'none',
+      ...(last === undefined ? {} : { healthOutput: last }),
+      restartCount: container.RestartCount ?? 0,
+      exitCode: container.State?.ExitCode ?? 0,
+      labels: container.Config?.Labels ?? {},
+    };
+  }
+
+  async restart(id: string): Promise<void> {
+    // The Engine answers once the container has stopped and started again: the stop may take
+    // the whole grace period, so the wait is longer than that by the start.
+    const stopSeconds = this.options.stopSeconds ?? 150;
+    await this.request(
+      'POST',
+      `/containers/${encodeURIComponent(id)}/restart?t=${stopSeconds}`,
+      [],
+      (stopSeconds + 50) * 1000,
+    );
+  }
+
+  private request(
+    method: 'GET' | 'POST',
+    path: string,
+    tolerated: readonly number[] = [],
+    timeoutMs = this.options.timeoutMs ?? 10_000,
+  ): Promise<{ status: number; body: unknown }> {
+    return new Promise((resolve, reject) => {
+      const timer = setTimeout(
+        () => request.destroy(new Error(`the Docker Engine did not answer ${method} ${path}`)),
+        timeoutMs,
+      );
+      timer.unref();
+      const done =
+        <T>(settle: (value: T) => void) =>
+        (value: T) => {
+          clearTimeout(timer);
+          settle(value);
+        };
+      resolve = done(resolve);
+      reject = done(reject);
+      const request = http.request({ socketPath: this.socketPath, path, method }, (response) => {
+        const chunks: Buffer[] = [];
+        response.on('data', (chunk: Buffer) => chunks.push(chunk));
+        response.on('error', reject);
+        response.on('end', () => {
+          const status = response.statusCode ?? 0;
+          const text = Buffer.concat(chunks).toString('utf8');
+          let body: unknown;
+          try {
+            body = text ? JSON.parse(text) : undefined;
+          } catch {
+            body = text;
+          }
+          if ((status >= 200 && status < 300) || tolerated.includes(status)) {
+            resolve({ status, body });
+            return;
+          }
+          const message =
+            typeof body === 'object' && body !== null && 'message' in body
+              ? String(body.message)
+              : `the Docker Engine answered ${status} to ${method} ${path}`;
+          reject(new Error(message));
+        });
+      });
+      request.on('error', reject);
+      request.end();
+    });
+  }
+}
diff --git a/src/ops/owner-alerts.ts b/src/ops/owner-alerts.ts
index 93a36b4bad4a54a774429cf9468fd849c40f2441..54df6d19de3fba6054ae44e7bf84895acc143ed1 100644
--- a/src/ops/owner-alerts.ts
+++ b/src/ops/owner-alerts.ts
@@ -8,7 +8,8 @@ import type { Logger } from '../log.js';
  * What an alert is about. Each kind has its own minimum interval, so that a crash loop sends one
  * "stopped" and one "restarted" now and then, and a backup failure is not held back by a crash.
  */
-export type AlertKind = 'fatal' | 'restart' | 'unhealthy' | 'restarting' | 'backup';
+export type AlertKind =
+  'fatal' | 'restart' | 'unhealthy' | 'restarting' | 'backup' | 'backup-missing';
 
 /** What became of an alert: sent, held back by the interval, or failed (logged). */
 export type AlertOutcome = 'sent' | 'held' | 'failed';
diff --git a/src/ops/watchdog-cli.ts b/src/ops/watchdog-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5c6991db8f5e3e84b110b76cfc6631aa07cd7cc7
--- /dev/null
+++ b/src/ops/watchdog-cli.ts
@@ -0,0 +1,85 @@
+import { hostname } from 'node:os';
+import path from 'node:path';
+import { setTimeout as sleep } from 'node:timers/promises';
+import { ConfigError } from '../config/errors.js';
+import { loggerFromEnv } from '../log.js';
+import { readBackupStatus } from './backup-status.js';
+import { SocketDockerApi } from './docker-api.js';
+import { FileStamps, ownerAlertsFrom } from './owner-alerts.js';
+import { FileWatchdogState, Watchdog, watchdogConfig, type WatchdogConfig } from './watchdog.js';
+
+/** The stack's `ops` volume: the backup's result, and what the watchdog told. */
+const OPS_DIR = '/ops';
+
+// The stack's watchdog service (compose.yaml): the bot's image with this command, the Docker
+// socket mounted. See `Watchdog`.
+const log = loggerFromEnv(process.env);
+
+let config: WatchdogConfig;
+try {
+  config = watchdogConfig(process.env);
+} catch (err) {
+  process.stderr.write(
+    `The watchdog cannot start: ${err instanceof ConfigError ? err.message : String(err)}\n`,
+  );
+  process.exit(1);
+}
+
+const docker = new SocketDockerApi(config.socketPath);
+// Compose names the container's host after the container: its labels name the project.
+const project =
+  config.project ??
+  (await docker.container(hostname()).catch(() => undefined))?.labels['com.docker.compose.project'];
+if (!project) {
+  log.fatal(
+    { socket: config.socketPath },
+    'cannot tell which Compose project to watch: is the Docker socket mounted? (or set WATCHDOG_PROJECT)',
+  );
+  process.exit(1);
+}
+
+const alerts = ownerAlertsFrom(
+  process.env,
+  log,
+  new FileStamps(path.join(OPS_DIR, 'watchdog-alerts.json')),
+);
+if (!alerts)
+  log.warn('DISCORD_TOKEN or OWNER_ID is missing: the watchdog tells nobody what it does');
+const watchdog = new Watchdog({
+  docker,
+  alerts: alerts ?? { send: () => Promise.resolve('failed' as const) },
+  log,
+  project,
+  unhealthyMs: config.unhealthyMs,
+  alertMs: config.alertMs,
+  restartLimit: config.restartLimit,
+  restartWindowMs: config.restartWindowMs,
+  backup: {
+    read: () => readBackupStatus(config.backupStatusFile),
+    maxAgeMs: config.backupMaxAgeMs,
+  },
+  state: new FileWatchdogState(path.join(OPS_DIR, 'watchdog-state.json')),
+});
+
+for (const signal of ['SIGINT', 'SIGTERM'] as const) {
+  process.once(signal, () => {
+    log.info({ signal }, 'watchdog stopping');
+    process.exit(0);
+  });
+}
+
+log.info(
+  {
+    project,
+    unhealthyMinutes: config.unhealthyMs / 60_000,
+    alertMinutes: config.alertMs / 60_000,
+    restarts: config.restartLimit,
+    restartWindowMinutes: config.restartWindowMs / 60_000,
+  },
+  'watchdog started',
+);
+// One look at a time: a restart waits for the bot's shutdown, which can take minutes.
+for (;;) {
+  await watchdog.tick();
+  await sleep(config.intervalMs);
+}
diff --git a/src/ops/watchdog.test.ts b/src/ops/watchdog.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1cb7f30dbf8b0bfa5f95822df3b9ac81d61fe37f
--- /dev/null
+++ b/src/ops/watchdog.test.ts
@@ -0,0 +1,363 @@
+import { describe, expect, it } from 'vitest';
+import { composeLabels, FakeDockerApi } from '../../test/support/fake-docker.js';
+import { FakeAlertRest } from '../../test/support/fake-rest.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { BackupStatus } from './backup-status.js';
+import { MemoryStamps, OwnerAlerts } from './owner-alerts.js';
+import { MemoryWatchdogState, Watchdog, watchdogConfig } from './watchdog.js';
+
+const START = Date.UTC(2026, 9, 16, 12, 0);
+const MINUTE = 60_000;
+const HOUR = 60 * MINUTE;
+const OWNER = '223456789012345678';
+
+function watchdogWith(
+  options: { backup?: BackupStatus; backupService?: boolean; state?: MemoryWatchdogState } = {},
+) {
+  const docker = new FakeDockerApi();
+  const rest = new FakeAlertRest();
+  const { log, entries } = createTestLogger();
+  const clock = { now: START };
+  const backup: { status: BackupStatus | undefined } = { status: options.backup };
+  const alerts = new OwnerAlerts({
+    rest,
+    ownerId: OWNER,
+    log,
+    stamps: new MemoryStamps(),
+    minIntervalMs: 0,
+    now: () => clock.now,
+  });
+  const watchdog = new Watchdog({
+    docker,
+    alerts,
+    log,
+    project: 'pine',
+    unhealthyMs: 5 * MINUTE,
+    alertMs: 15 * MINUTE,
+    restartLimit: 3,
+    restartWindowMs: 30 * MINUTE,
+    backup: { read: () => backup.status, maxAgeMs: 26 * HOUR },
+    state: options.state ?? new MemoryWatchdogState(),
+    now: () => clock.now,
+  });
+  const pine = docker.add({ id: 'pine-1', labels: composeLabels('pine', 'pine') });
+  if (options.backupService ?? true) {
+    docker.add({ id: 'backup-1', labels: composeLabels('pine', 'backup'), health: 'none' });
+  }
+  return { docker, rest, entries, clock, watchdog, pine, backup };
+}
+
+describe('Watchdog: an unhealthy bot', () => {
+  it('leaves a healthy bot alone', async () => {
+    const { docker, rest, watchdog, clock } = watchdogWith();
+
+    await watchdog.tick();
+    clock.now += HOUR;
+    await watchdog.tick();
+
+    expect(docker.restarted).toEqual([]);
+    expect(rest.messages()).toEqual([]);
+  });
+
+  it('restarts the bot once it has been unhealthy for the time allowed, and tells the owner', async () => {
+    const { docker, rest, watchdog, clock, pine } = watchdogWith();
+    pine.health = 'unhealthy';
+    pine.healthOutput =
+      'stale: the last heartbeat is 2 minutes old: the bot is stuck or not running\n';
+
+    await watchdog.tick();
+    clock.now += 4 * MINUTE;
+    await watchdog.tick();
+    expect(docker.restarted).toEqual([]);
+
+    clock.now += MINUTE;
+    await watchdog.tick();
+    expect(docker.restarted).toEqual(['pine-1']);
+    expect(rest.messages()).toEqual([
+      'Professor Pine was unhealthy for 5 minutes (stale: the last heartbeat is 2 minutes old: ' +
+        'the bot is stuck or not running); the watchdog restarted it.',
+    ]);
+  });
+
+  it('only tells the owner, once and later, of what a restart would not mend', async () => {
+    for (const line of [
+      'database: the database did not answer 20 seconds ago: connect ECONNREFUSED',
+      'gateway: not connected to Discord for 6 minutes',
+      'slow-start: still starting after 31 minutes',
+    ]) {
+      const { docker, rest, watchdog, clock, pine } = watchdogWith();
+      pine.health = 'unhealthy';
+      pine.healthOutput = `${line}\n`;
+
+      for (let minutes = 0; minutes <= 40; minutes += 5) {
+        await watchdog.tick();
+        if (minutes === 10) expect(rest.messages()).toEqual([]);
+        clock.now += 5 * MINUTE;
+      }
+
+      expect(docker.restarted).toEqual([]);
+      expect(rest.messages()).toEqual([
+        `Professor Pine has been unhealthy for 15 minutes (${line}); a restart would not mend ` +
+          'that, so the watchdog leaves it running.',
+      ]);
+    }
+  });
+
+  it('never restarts a bot that is starting, however long it takes', async () => {
+    const { docker, rest, watchdog, clock, pine } = watchdogWith();
+    pine.health = 'healthy';
+    pine.healthOutput = 'starting: starting for 25 minutes, the database answered 3 seconds ago\n';
+
+    for (let i = 0; i < 6; i++) {
+      await watchdog.tick();
+      clock.now += 5 * MINUTE;
+    }
+
+    expect(docker.restarted).toEqual([]);
+    expect(rest.messages()).toEqual([]);
+  });
+
+  it('counts the time anew after the bot was healthy in between', async () => {
+    const { docker, watchdog, clock, pine } = watchdogWith();
+    pine.health = 'unhealthy';
+    await watchdog.tick();
+    clock.now += 3 * MINUTE;
+    pine.health = 'healthy';
+    await watchdog.tick();
+    clock.now += MINUTE;
+    pine.health = 'unhealthy';
+    await watchdog.tick();
+    clock.now += 4 * MINUTE;
+    await watchdog.tick();
+
+    expect(docker.restarted).toEqual([]);
+  });
+
+  it('tells the owner when the restart fails', async () => {
+    const { docker, rest, watchdog, clock, pine, entries } = watchdogWith();
+    pine.health = 'unhealthy';
+    docker.failRestart = new Error('Cannot restart container pine-1: permission denied');
+
+    await watchdog.tick();
+    clock.now += 5 * MINUTE;
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([
+      'Professor Pine was unhealthy for 5 minutes (no health output); the watchdog could not ' +
+        'restart it: Cannot restart container pine-1: permission denied',
+    ]);
+    expect(entries.some((entry) => entry.msg === 'could not restart the bot')).toBe(true);
+  });
+
+  it('leaves a stopped bot to Docker and touches no other container', async () => {
+    const { docker, watchdog, clock, pine } = watchdogWith();
+    pine.running = false;
+    pine.health = 'unhealthy';
+    docker.add({ id: 'mysql-1', labels: composeLabels('pine', 'mysql'), health: 'unhealthy' });
+    docker.add({ id: 'other-pine', labels: composeLabels('staging', 'pine'), health: 'unhealthy' });
+    docker.add({
+      id: 'pine-run',
+      labels: { ...composeLabels('pine', 'pine'), 'com.docker.compose.oneoff': 'True' },
+      health: 'unhealthy',
+    });
+
+    await watchdog.tick();
+    clock.now += HOUR;
+    await watchdog.tick();
+
+    expect(docker.restarted).toEqual([]);
+  });
+
+  it('does nothing while the stack is down, and survives an Engine that does not answer', async () => {
+    const { docker, rest, watchdog, entries } = watchdogWith();
+    docker.containers.length = 0;
+    await watchdog.tick();
+
+    docker.failWith = new Error('connect ENOENT /var/run/docker.sock');
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([]);
+    expect(entries.some((entry) => entry.msg === 'could not ask Docker about the bot')).toBe(true);
+  });
+});
+
+describe('Watchdog: a bot that keeps restarting', () => {
+  it('tells the owner when the bot restarted as often as allowed within the window', async () => {
+    const { rest, watchdog, clock, pine } = watchdogWith();
+    await watchdog.tick();
+    for (const count of [1, 2, 3]) {
+      clock.now += 5 * MINUTE;
+      pine.restartCount = count;
+      pine.exitCode = 1;
+      await watchdog.tick();
+    }
+    clock.now += 5 * MINUTE;
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([
+      'Professor Pine restarted 3 times in the last 30 minutes (exit code 1 the last time). ' +
+        "'./pine logs pine' shows why.",
+    ]);
+  });
+
+  it('does not count restarts that lie further apart than the window', async () => {
+    const { rest, watchdog, clock, pine } = watchdogWith();
+    await watchdog.tick();
+    for (const count of [1, 2, 3]) {
+      clock.now += 20 * MINUTE;
+      pine.restartCount = count;
+      await watchdog.tick();
+    }
+
+    expect(rest.messages()).toEqual([]);
+  });
+
+  it('counts afresh for a new container', async () => {
+    const { docker, rest, watchdog, clock, pine } = watchdogWith();
+    pine.restartCount = 7;
+    await watchdog.tick();
+    docker.containers.length = 0;
+    docker.add({ id: 'pine-2', labels: composeLabels('pine', 'pine'), restartCount: 0 });
+    clock.now += MINUTE;
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([]);
+  });
+});
+
+describe('Watchdog: backups', () => {
+  it('tells the owner of a failed backup once', async () => {
+    const { rest, watchdog, clock, backup } = watchdogWith();
+    await watchdog.tick();
+    backup.status = {
+      finishedAt: START + MINUTE,
+      ok: false,
+      reason: 'the dump did not load into the scratch server',
+      lastOkAt: START - 23 * HOUR,
+    };
+    clock.now += 2 * MINUTE;
+    await watchdog.tick();
+    clock.now += MINUTE;
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([
+      `The backup of <t:${(START + MINUTE) / 1000}:f> failed: the dump did not load into the ` +
+        "scratch server. './pine logs backup' shows more.",
+    ]);
+  });
+
+  it('remembers what it told across its own restarts', async () => {
+    const state = new MemoryWatchdogState();
+    const failed: BackupStatus = {
+      finishedAt: START - HOUR,
+      ok: false,
+      reason: 'disk full',
+      lastOkAt: START - 25 * HOUR,
+    };
+    const first = watchdogWith({ backup: failed, state });
+    await first.watchdog.tick();
+    expect(first.rest.messages()).toHaveLength(1);
+
+    const second = watchdogWith({ backup: failed, state });
+    await second.watchdog.tick();
+    second.clock.now += 2 * HOUR;
+    await second.watchdog.tick();
+
+    // The failure was told; that no backup succeeded for 26 hours is new.
+    expect(second.rest.messages()).toEqual([
+      `No backup has succeeded since <t:${(START - 25 * HOUR) / 1000}:f>. ` +
+        "'./pine logs backup' shows why.",
+    ]);
+  });
+
+  it('watches no backups where the stack has no backup service, and says so once', async () => {
+    const { rest, watchdog, clock, entries } = watchdogWith({ backupService: false });
+    await watchdog.tick();
+    clock.now += 27 * HOUR;
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([]);
+    expect(
+      entries.filter((entry) => entry.msg === 'no backup service: backups are not watched'),
+    ).toHaveLength(1);
+  });
+
+  it('does not tell again of a failure older than a day it finds at its own start', async () => {
+    const { rest, watchdog } = watchdogWith({
+      backup: {
+        finishedAt: START - 2 * 24 * HOUR,
+        ok: false,
+        reason: 'disk full',
+        lastOkAt: START - HOUR,
+      },
+    });
+
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([]);
+  });
+
+  it('tells the owner when no backup has succeeded for too long, twice a day at most', async () => {
+    const { rest, watchdog, clock } = watchdogWith({
+      backup: { finishedAt: START - 2 * HOUR, ok: true, lastOkAt: START - 2 * HOUR },
+    });
+    await watchdog.tick();
+    clock.now += 24 * HOUR;
+    await watchdog.tick();
+    clock.now += HOUR;
+    await watchdog.tick();
+    clock.now += 12 * HOUR;
+    await watchdog.tick();
+
+    const since = `<t:${(START - 2 * HOUR) / 1000}:f>`;
+    const told = `No backup has succeeded since ${since}. './pine logs backup' shows why.`;
+    expect(rest.messages()).toEqual([told, told]);
+  });
+
+  it('tells the owner when no backup has run since it started', async () => {
+    const { rest, watchdog, clock } = watchdogWith();
+    await watchdog.tick();
+    clock.now += 27 * HOUR;
+    await watchdog.tick();
+
+    expect(rest.messages()).toEqual([
+      `No backup has run since the watchdog started at <t:${START / 1000}:f>. ` +
+        "'./pine logs backup' shows why.",
+    ]);
+  });
+});
+
+describe('watchdogConfig', () => {
+  it('has a default for everything', () => {
+    expect(watchdogConfig({})).toEqual({
+      socketPath: '/var/run/docker.sock',
+      project: undefined,
+      intervalMs: 30_000,
+      unhealthyMs: 5 * MINUTE,
+      alertMs: 15 * MINUTE,
+      restartLimit: 3,
+      restartWindowMs: 30 * MINUTE,
+      backupStatusFile: '/ops/backup-status.json',
+      backupMaxAgeMs: 26 * HOUR,
+    });
+  });
+
+  it('reads the environment, blank as unset, and refuses what makes no sense', () => {
+    expect(
+      watchdogConfig({
+        WATCHDOG_UNHEALTHY_MINUTES: '10',
+        WATCHDOG_RESTARTS: '',
+        WATCHDOG_PROJECT: 'staging',
+        WATCHDOG_BACKUP_HOURS: '50',
+      }),
+    ).toMatchObject({
+      unhealthyMs: 10 * MINUTE,
+      restartLimit: 3,
+      project: 'staging',
+      backupMaxAgeMs: 50 * HOUR,
+    });
+    expect(() => watchdogConfig({ WATCHDOG_UNHEALTHY_MINUTES: 'soon' })).toThrow(
+      /WATCHDOG_UNHEALTHY_MINUTES/,
+    );
+  });
+});
diff --git a/src/ops/watchdog.ts b/src/ops/watchdog.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8ad199f87e5c5b5c28dd4accbba1a97c91240dfd
--- /dev/null
+++ b/src/ops/watchdog.ts
@@ -0,0 +1,331 @@
+import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
+import path from 'node:path';
+import { z } from 'zod';
+import { ConfigError } from '../config/errors.js';
+import type { Logger } from '../log.js';
+import { BACKUP_STATUS_FILE, type BackupStatus } from './backup-status.js';
+import type { DockerApi } from './docker-api.js';
+import { healthKindOf, type HealthKind } from './health.js';
+import { alertTime, firstLine, type OwnerAlerts } from './owner-alerts.js';
+
+const MINUTE = 60_000;
+const HOUR = 60 * MINUTE;
+/** A failed backup older than this, found at the watchdog's start, was told before. */
+const OLD_FAILURE_MS = 24 * HOUR;
+/** How often the owner is told again that backups are missing. */
+const MISSING_AGAIN_MS = 12 * HOUR;
+
+/** A whole number from the environment, blank meaning the default. */
+const count = (fallback: number, max: number) =>
+  z.preprocess(
+    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
+    z.coerce.number().int().min(1).max(max).default(fallback),
+  );
+
+const watchdogEnvSchema = z.object({
+  /** The Docker Engine's socket, mounted into the watchdog. */
+  DOCKER_SOCKET: z.preprocess(
+    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
+    z.string().default('/var/run/docker.sock'),
+  ),
+  /** The Compose project; read from the watchdog's own container when unset. */
+  WATCHDOG_PROJECT: z.preprocess(
+    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
+    z.string().optional(),
+  ),
+  WATCHDOG_INTERVAL_SECONDS: count(30, 3600),
+  WATCHDOG_UNHEALTHY_MINUTES: count(5, 24 * 60),
+  /** How long the bot may be unhealthy for a reason a restart does not mend before it is told. */
+  WATCHDOG_ALERT_MINUTES: count(15, 24 * 60),
+  WATCHDOG_RESTARTS: count(3, 100),
+  WATCHDOG_RESTART_WINDOW_MINUTES: count(30, 24 * 60),
+  /** How old the last good backup may be before the owner is told (a day and two hours). */
+  WATCHDOG_BACKUP_HOURS: count(26, 24 * 30),
+  BACKUP_STATUS_FILE: z.preprocess(
+    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
+    z.string().default(BACKUP_STATUS_FILE),
+  ),
+});
+
+export interface WatchdogConfig {
+  socketPath: string;
+  project: string | undefined;
+  intervalMs: number;
+  unhealthyMs: number;
+  alertMs: number;
+  restartLimit: number;
+  restartWindowMs: number;
+  backupStatusFile: string;
+  backupMaxAgeMs: number;
+}
+
+/** The watchdog's settings from the environment (`.env`, see `.env.example`). */
+export function watchdogConfig(raw: Record<string, string | undefined>): WatchdogConfig {
+  const parsed = watchdogEnvSchema.safeParse(raw);
+  if (!parsed.success) {
+    throw new ConfigError(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
+  }
+  const env = parsed.data;
+  return {
+    socketPath: env.DOCKER_SOCKET,
+    project: env.WATCHDOG_PROJECT,
+    intervalMs: env.WATCHDOG_INTERVAL_SECONDS * 1000,
+    unhealthyMs: env.WATCHDOG_UNHEALTHY_MINUTES * MINUTE,
+    alertMs: env.WATCHDOG_ALERT_MINUTES * MINUTE,
+    restartLimit: env.WATCHDOG_RESTARTS,
+    restartWindowMs: env.WATCHDOG_RESTART_WINDOW_MINUTES * MINUTE,
+    backupStatusFile: env.BACKUP_STATUS_FILE,
+    backupMaxAgeMs: env.WATCHDOG_BACKUP_HOURS * HOUR,
+  };
+}
+
+/** What the watchdog told, kept across its own restarts. */
+export interface WatchdogMemory {
+  /** The end of the failed backup last told. */
+  toldFailure?: number;
+  /** When the owner was last told that no backup succeeded. */
+  toldMissing?: number;
+}
+
+/** Where the watchdog keeps what it told. */
+export interface WatchdogState {
+  read(): WatchdogMemory;
+  write(memory: WatchdogMemory): void;
+}
+
+/** For tests, and a watchdog without a volume. */
+export class MemoryWatchdogState implements WatchdogState {
+  private memory: WatchdogMemory = {};
+
+  read(): WatchdogMemory {
+    return { ...this.memory };
+  }
+
+  write(memory: WatchdogMemory): void {
+    this.memory = { ...memory };
+  }
+}
+
+/**
+ * In a small JSON file of the `ops` volume (`/ops/watchdog-state.json`), so that a watchdog
+ * recreated by `./pine update` does not tell again what it told. A file that cannot be read
+ * counts as empty; one that cannot be written only costs a repeated alert.
+ */
+export class FileWatchdogState implements WatchdogState {
+  constructor(private readonly file: string) {}
+
+  read(): WatchdogMemory {
+    try {
+      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
+      return {
+        ...(typeof raw.toldFailure === 'number' ? { toldFailure: raw.toldFailure } : {}),
+        ...(typeof raw.toldMissing === 'number' ? { toldMissing: raw.toldMissing } : {}),
+      };
+    } catch {
+      return {};
+    }
+  }
+
+  write(memory: WatchdogMemory): void {
+    try {
+      mkdirSync(path.dirname(this.file), { recursive: true });
+      writeFileSync(`${this.file}.next`, JSON.stringify(memory));
+      renameSync(`${this.file}.next`, this.file);
+    } catch {
+      // Only an alert may be told twice.
+    }
+  }
+}
+
+/**
+ * The kinds of the health check (`healthLine`) a restart mends: a stuck process, or one that
+ * writes no heartbeat. A line without a known kind (the check itself timed out) counts as stuck.
+ * The others (the database, Discord, a start that takes long) are only told to the owner.
+ */
+const RESTARTED: ReadonlySet<HealthKind | undefined> = new Set(['stale', 'missing', undefined]);
+
+export interface WatchdogOptions {
+  docker: DockerApi;
+  alerts: Pick<OwnerAlerts, 'send'>;
+  log: Logger;
+  /** The Compose project of the stack: only its `pine` service is ever restarted. */
+  project: string;
+  /** How long the bot may be stuck (`stale`, `missing`) before it is restarted. */
+  unhealthyMs: number;
+  /** How long it may be unhealthy for another reason before the owner is told. */
+  alertMs: number;
+  /** How many restarts by Docker within the window make the owner be told. */
+  restartLimit: number;
+  restartWindowMs: number;
+  /** The backup service's last result, and how old the last good one may be. */
+  backup: { read: () => BackupStatus | undefined; maxAgeMs: number };
+  /** What it told, across its own restarts. */
+  state: WatchdogState;
+  now?: () => number;
+}
+
+/**
+ * The stack's watchdog (a service of its own, `node dist/ops/watchdog-cli.js`), asked every
+ * thirty seconds: it restarts the bot when Docker has called it unhealthy for a while because it
+ * is stuck (a stale heartbeat, which no exit and no restart policy catches), and tells the owner
+ * of that, of an unhealthy bot a restart would not mend (the database, Discord, a long start), of
+ * a bot that keeps restarting, and of backups that failed or stopped where the stack has a backup
+ * service. It never restarts anything but the bot's container of its own project, and never a
+ * bot that is starting; a stopped bot is Docker's (`restart: unless-stopped`) or the operator's.
+ */
+export class Watchdog {
+  private readonly now: () => number;
+  private readonly startedAt: number;
+  private unhealthySince: number | undefined;
+  /** Whether the owner was told of this unhealthy spell that a restart would not mend. */
+  private toldUnhealthy = false;
+  /** The container last seen and its restart count, to see restarts between two ticks. */
+  private seen: { id: string; restartCount: number } | undefined;
+  private restarts: number[] = [];
+  /** Whether the stack had no backup service when last looked at, and that was logged. */
+  private saidNoBackups = false;
+
+  constructor(private readonly options: WatchdogOptions) {
+    this.now = options.now ?? Date.now;
+    this.startedAt = this.now();
+  }
+
+  /** One look at the bot and the backups. Never throws. */
+  async tick(): Promise<void> {
+    try {
+      await this.watchBot();
+    } catch (err) {
+      this.options.log.warn({ err }, 'could not ask Docker about the bot');
+    }
+    try {
+      await this.watchBackups();
+    } catch (err) {
+      this.options.log.warn({ err }, 'could not ask Docker about the backups');
+    }
+  }
+
+  private async watchBot(): Promise<void> {
+    const { docker, project } = this.options;
+    const [id] = await docker.containerIds([
+      `com.docker.compose.project=${project}`,
+      'com.docker.compose.service=pine',
+      'com.docker.compose.oneoff=False',
+    ]);
+    const bot = id === undefined ? undefined : await docker.container(id);
+    if (!bot) {
+      this.unhealthySince = undefined;
+      this.seen = undefined;
+      return;
+    }
+    await this.countRestarts(bot.id, bot.restartCount, bot.exitCode);
+    await this.checkHealth(bot.id, bot.running && bot.health === 'unhealthy', bot.healthOutput);
+  }
+
+  /** Whether the stack has a backup service (running or not): only then are backups watched. */
+  private async hasBackupService(): Promise<boolean> {
+    const { docker, project } = this.options;
+    const ids = await docker.containerIds([
+      `com.docker.compose.project=${project}`,
+      'com.docker.compose.service=backup',
+      'com.docker.compose.oneoff=False',
+    ]);
+    return ids.length > 0;
+  }
+
+  private async countRestarts(id: string, restartCount: number, exitCode: number) {
+    const now = this.now();
+    if (this.seen?.id === id) {
+      for (let i = this.seen.restartCount; i < restartCount; i++) this.restarts.push(now);
+    } else {
+      this.restarts = [];
+    }
+    this.seen = { id, restartCount };
+    const { restartLimit, restartWindowMs, alerts } = this.options;
+    this.restarts = this.restarts.filter((at) => now - at < restartWindowMs);
+    const count = this.restarts.length;
+    if (count < restartLimit) return;
+    const minutes = Math.round(restartWindowMs / 60_000);
+    // Told once for these; the next ones count anew.
+    this.restarts = [];
+    await alerts.send(
+      'restarting',
+      `Professor Pine restarted ${count} times in the last ${minutes} minutes ` +
+        `(exit code ${exitCode} the last time). './pine logs pine' shows why.`,
+    );
+  }
+
+  private async checkHealth(id: string, unhealthy: boolean, output: string | undefined) {
+    const now = this.now();
+    if (!unhealthy) {
+      this.unhealthySince = undefined;
+      this.toldUnhealthy = false;
+      return;
+    }
+    this.unhealthySince ??= now;
+    const unhealthyFor = now - this.unhealthySince;
+    const { docker, alerts, log } = this.options;
+    const minutes = Math.round(unhealthyFor / 60_000);
+    const why = output?.trim() || 'no health output';
+    if (!RESTARTED.has(healthKindOf(output))) {
+      if (this.toldUnhealthy || unhealthyFor < this.options.alertMs) return;
+      this.toldUnhealthy = true;
+      log.warn({ minutes, health: why }, 'the bot is unhealthy; a restart would not mend it');
+      await alerts.send(
+        'unhealthy',
+        `Professor Pine has been unhealthy for ${minutes} minutes (${why}); a restart would ` +
+          'not mend that, so the watchdog leaves it running.',
+      );
+      return;
+    }
+    if (unhealthyFor < this.options.unhealthyMs) return;
+    this.unhealthySince = undefined;
+    const was = `Professor Pine was unhealthy for ${minutes} minutes (${why})`;
+    log.warn({ minutes, health: why }, 'the bot is unhealthy; restarting it');
+    try {
+      await docker.restart(id);
+      await alerts.send('unhealthy', `${was}; the watchdog restarted it.`);
+    } catch (err) {
+      log.error({ err }, 'could not restart the bot');
+      await alerts.send(
+        'unhealthy',
+        `${was}; the watchdog could not restart it: ${firstLine(err)}`,
+      );
+    }
+  }
+
+  private async watchBackups(): Promise<void> {
+    const { backup, alerts, log, state } = this.options;
+    if (!(await this.hasBackupService())) {
+      if (!this.saidNoBackups) log.info('no backup service: backups are not watched');
+      this.saidNoBackups = true;
+      return;
+    }
+    this.saidNoBackups = false;
+    const now = this.now();
+    const status = backup.read();
+    const memory = state.read();
+    if (status && !status.ok && status.finishedAt !== memory.toldFailure) {
+      state.write({ ...memory, toldFailure: status.finishedAt });
+      if (status.finishedAt >= this.startedAt - OLD_FAILURE_MS) {
+        await alerts.send(
+          'backup',
+          `The backup of ${alertTime(status.finishedAt)} failed: ` +
+            `${status.reason ?? 'no reason given'}. './pine logs backup' shows more.`,
+        );
+      }
+    }
+    const lastOk = status?.lastOkAt;
+    const since = lastOk ?? this.startedAt;
+    if (now - since <= backup.maxAgeMs) return;
+    const { toldMissing } = state.read();
+    if (toldMissing !== undefined && now - toldMissing < MISSING_AGAIN_MS) return;
+    state.write({ ...state.read(), toldMissing: now });
+    await alerts.send(
+      'backup-missing',
+      lastOk === undefined
+        ? `No backup has run since the watchdog started at ${alertTime(this.startedAt)}. ` +
+            "'./pine logs backup' shows why."
+        : `No backup has succeeded since ${alertTime(lastOk)}. './pine logs backup' shows why.`,
+    );
+  }
+}
diff --git a/test/support/fake-docker.ts b/test/support/fake-docker.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b429a17720c4adf6ab668195ff0f0d93726ec042
--- /dev/null
+++ b/test/support/fake-docker.ts
@@ -0,0 +1,76 @@
+import type { ContainerState, DockerApi } from '../../src/ops/docker-api.js';
+
+/** A container of the fake Docker Engine; tests change its fields between the watchdog's ticks. */
+export interface FakeContainer extends ContainerState {
+  name: string;
+}
+
+/** The labels Compose gives a service's container. */
+export function composeLabels(project: string, service: string): Record<string, string> {
+  return {
+    'com.docker.compose.project': project,
+    'com.docker.compose.service': service,
+    'com.docker.compose.oneoff': 'False',
+  };
+}
+
+/**
+ * The Docker Engine as the watchdog sees it (`DockerApi`): containers by label, a container's
+ * state, a restart (which it records, and which makes the container healthy and starting
+ * anew). `failRestart` makes restarts fail; `failWith` makes every call fail, as an Engine that
+ * does not answer.
+ */
+export class FakeDockerApi implements DockerApi {
+  readonly containers: FakeContainer[] = [];
+  readonly restarted: string[] = [];
+  failRestart: Error | undefined;
+  failWith: Error | undefined;
+
+  add(container: Partial<FakeContainer> & { id: string; labels: Record<string, string> }) {
+    const made: FakeContainer = {
+      name: container.id,
+      running: true,
+      health: 'healthy',
+      restartCount: 0,
+      exitCode: 0,
+      ...container,
+    };
+    this.containers.push(made);
+    return made;
+  }
+
+  containerIds(labels: readonly string[]): Promise<string[]> {
+    if (this.failWith) return Promise.reject(this.failWith);
+    return Promise.resolve(
+      this.containers
+        .filter((container) =>
+          labels.every((label) => {
+            const [key = '', value] = label.split('=');
+            return container.labels[key] === value;
+          }),
+        )
+        .map((container) => container.id),
+    );
+  }
+
+  container(id: string): Promise<ContainerState | undefined> {
+    if (this.failWith) return Promise.reject(this.failWith);
+    const found = this.containers.find(
+      (container) => container.id === id || container.id.startsWith(id),
+    );
+    if (!found) return Promise.resolve(undefined);
+    const { name: _name, ...state } = found;
+    return Promise.resolve({ ...state, labels: { ...state.labels } });
+  }
+
+  restart(id: string): Promise<void> {
+    if (this.failWith) return Promise.reject(this.failWith);
+    if (this.failRestart) return Promise.reject(this.failRestart);
+    const found = this.containers.find((container) => container.id === id);
+    if (!found) return Promise.reject(new Error(`No such container: ${id}`));
+    this.restarted.push(id);
+    found.health = 'starting';
+    delete found.healthOutput;
+    return Promise.resolve();
+  }
+}
````

### Task 5: Plan 9A T5: Restore: ./pine restore loads a dump, renames Windows' lower-case tables

Prototype commit: `3b3979f7cef5cf7de590707a5f27b18e498e9a1f`

./pine restore <dump.sql|dump.sql.gz> [--replace] [--start | --no-start] stops nothing
until the dump is known good: it must be a whole gzip file where it is one and end with
mysqldump's "-- Dump completed" line, and dist/ops/restore-cli.js check, run in a one-off
container while the bot still runs, refuses a database that has tables unless --replace is
given. Then it stops the bot and the watchdog, has restore-cli prepare drop and make anew a
database with tables, and streams the dump from the file through the mysql service's own
client as MySQL's root, never copied, gzip's status kept. restore-cli finish renames the
tables a dump from MySQL on Windows has in lower case to the bot's names in one RENAME TABLE
(the foreign keys follow; a dump with the right names is left alone) and prints what was
loaded: legacy or Pine, the tables, the rows of the main ones; an empty load, an unknown
database and a legacy one without its last migration (the migrator's refusal, said) fail.
The stack starts afterwards on a terminal or with --start, since that logs the bot in; any
failure after the stop says that the bot is stopped and how to start it. A relative dump
path is read from where ./pine was run.

restoreStep (src/ops/restore.ts) is the CLI's logic, tested against MySQL with its exit
codes. PINE_TABLES (src/db/table-names.ts) names every table the bot knows, the legacy ones
taken from the generated baseline; a db test fails when a migration adds a table it lacks.
The migrator now refuses, before writing anything, a database whose tables are lower case on
a server that tells names by case, says how to fix it, and logs it as a refusal, where it
failed half-way in the first migration before.

Checked on Docker Desktop with the production dump of 2026-10-14 in a scratch stack: 15
tables renamed, a legacy database of 17 tables, ./pine migrate ran all 15 migrations, and
cut-off copies (plain and gzipped) were refused before anything was stopped.

**Files:**

```
 pine                       | 106 +++++++++++++++++++++++++++
 src/db/migrator.db.test.ts |  22 ++++++
 src/db/migrator.ts         |  29 ++++++++
 src/db/table-names.test.ts |  25 +++++++
 src/db/table-names.ts      |  46 ++++++++++++
 src/ops/restore-cli.ts     |  32 ++++++++
 src/ops/restore.db.test.ts | 259 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ops/restore.test.ts    |  46 ++++++++++++
 src/ops/restore.ts         | 213 +++++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 778 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/db/table-names.test.ts src/ops/restore.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/ops/restore.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3b3979f7cef5cf7de590707a5f27b18e498e9a1f -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T5: Restore: ./pine restore loads a dump, renames Windows' lower-case tables`, the body above and the trailer, staging exactly
  `pine src/db/migrator.db.test.ts src/db/migrator.ts src/db/table-names.test.ts src/db/table-names.ts src/ops/restore-cli.ts src/ops/restore.db.test.ts src/ops/restore.test.ts src/ops/restore.ts`.

````diff
diff --git a/pine b/pine
index 7461ab3f8b07cd2ef2e76874fa1a17dc7dbc30c1..0a5d01ea9adea56b32b991907331be691fdcceac 100755
--- a/pine
+++ b/pine
@@ -13,6 +13,8 @@ set -eu
 MSYS_NO_PATHCONV=1
 export MSYS_NO_PATHCONV
 
+# Where the operator ran the script: a path they give (a dump) is theirs, not this folder's.
+CALLER_DIR=$(pwd)
 cd "$(dirname "$0")"
 
 # The settings and secrets of the stack; other files for a second stack on the same machine
@@ -36,6 +38,24 @@ fail() {
   exit 1
 }
 
+# A command that stopped the bot sets this; if it then fails, the operator is told.
+bot_stopped=
+on_exit() {
+  status=$?
+  if [ "$status" != 0 ] && [ -n "$bot_stopped" ]; then
+    printf "pine: The bot is stopped: './pine up' starts it again.\n" >&2
+  fi
+}
+trap on_exit EXIT
+
+# A path the operator gave, as seen from where they ran ./pine.
+from_caller() {
+  case $1 in
+    /* | [A-Za-z]:[\\/]*) printf '%s\n' "$1" ;;
+    *) printf '%s\n' "$CALLER_DIR/$1" ;;
+  esac
+}
+
 compose() {
   docker compose --env-file "$PINE_ENV_FILE" "$@"
 }
@@ -80,6 +100,10 @@ Usage: ./pine <command>
   logs [service]     follow the logs of the stack, or of the service named
   status             the services and their health
   migrate            run the database migrations only, without starting the bot
+  restore <dump> [--replace] [--start | --no-start]
+                     load a dump (.sql or .sql.gz; legacy or Pine) into the stack's database;
+                     --replace drops a database that has tables first; then the stack starts
+                     (logging the bot in) when run on a terminal or with --start
   help               this list
 EOF
 }
@@ -137,6 +161,88 @@ cmd_migrate() {
   run run --rm --no-deps pine node --enable-source-maps dist/db/migrate-cli.js
 }
 
+# Before anything is stopped: the dump is whole (a gzip file that unpacks) and complete
+# (mysqldump's last line). A copy cut off on the way is refused here, not half-loaded.
+check_dump() {
+  say "Checking that $1 is whole and complete."
+  case $1 in
+    *.gz)
+      gzip -t "$1" 2>/dev/null ||
+        fail "$1 is not a whole gzip file: the copy may have been cut off."
+      last=$(gzip -dc "$1" | tail -n 1)
+      ;;
+    *) last=$(tail -n 1 "$1") ;;
+  esac
+  case $last in
+    '-- Dump completed'*) ;;
+    *) fail "$1 does not end with mysqldump's '-- Dump completed' line: it was cut off, or is no dump." ;;
+  esac
+}
+
+# The database half of a restore, in a one-off container of the bot's image (src/ops/restore-cli.ts).
+restore_step() {
+  run run --rm --no-deps pine node --enable-source-maps dist/ops/restore-cli.js "$@"
+}
+
+cmd_restore() {
+  need_stack
+  dump=
+  replace=
+  # Starting the stack logs the bot in: by default only for an operator at a terminal.
+  start=
+  if [ -t 0 ]; then start=yes; fi
+  for arg in "$@"; do
+    case $arg in
+      --replace) replace=--replace ;;
+      --start) start=yes ;;
+      --no-start) start= ;;
+      -*) fail "restore does not know '$arg'. Usage: ./pine restore <dump> [--replace] [--start | --no-start]" ;;
+      *)
+        [ -z "$dump" ] || fail "Name one dump only."
+        dump=$arg
+        ;;
+    esac
+  done
+  [ -n "$dump" ] || fail "Name the dump to load: ./pine restore <dump.sql or dump.sql.gz> [--replace]"
+  dump=$(from_caller "$dump")
+  if [ ! -f "$dump" ] || [ ! -r "$dump" ]; then
+    fail "There is no readable file $dump."
+  fi
+  case $dump in
+    *.gz) kind=gz ;;
+    *) kind=sql ;;
+  esac
+
+  check_dump "$dump"
+  build_image
+  start_database
+  # Refused here, while the bot still runs, if the database has tables and --replace is missing.
+  restore_step check ${replace:+"$replace"}
+  say "Stopping the bot and its watchdog while the database is replaced."
+  run stop pine watchdog
+  bot_stopped=yes
+  restore_step prepare ${replace:+"$replace"}
+  say "Loading $dump into the database; a large dump takes minutes."
+  # Streamed from the file through the mysql service's own client, never copied; as MySQL's root,
+  # so that whatever the dump sets (its time zone, the checks it turns off) is allowed. gzip's
+  # status is kept aside (sh has no pipefail): a dump that breaks while it unpacks is a failure.
+  say "> docker compose exec -T mysql mysql $(basename "$dump") < $dump"
+  # shellcheck disable=SC2016 # expanded in the container, which has the variables
+  compose exec -T mysql sh -c '
+    { if [ "$0" = gz ]; then gzip -dc; else cat; fi; echo $? >/tmp/unpacked; } |
+      MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --default-character-set=utf8mb4 -uroot "$MYSQL_DATABASE" &&
+      [ "$(cat /tmp/unpacked)" = 0 ]' "$kind" <"$dump" ||
+    fail "The dump did not load (MySQL or gzip said why above). The database may hold part of it: './pine restore $dump --replace' starts again."
+  restore_step finish
+  if [ -n "$start" ]; then
+    say "Starting the stack: the bot's migrator takes the database over or brings it up to date."
+    run up -d
+    bot_stopped=
+  else
+    say "Not started. './pine migrate' brings the database up to date without the bot; './pine up' starts the stack (and logs the bot in)."
+  fi
+}
+
 [ $# -gt 0 ] || {
   usage
   exit 1
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 94da33438aa709a1147c51604b34903b0f400012..f2189c9a8495d1f8da69e53d83d5c6acf06c64af 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -1,6 +1,7 @@
 import { pino } from 'pino';
 import { afterEach, describe, expect, it } from 'vitest';
 import { startDatabase, type TestDatabase } from '../../test/support/mysql.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
 import { createDb } from './kysely.js';
 import {
   detectDatabaseState,
@@ -341,6 +342,27 @@ describe('runMigrations', () => {
     expect(tables.map((r) => r.name)).toEqual(['kysely_reports']);
   });
 
+  it('refuses a legacy database whose table names a Windows server lower-cased', async () => {
+    database = await startDatabase({ legacySchema: true });
+    await database.query('rename table `Guild` to `guild`, `GymMeta` to `gymmeta`');
+    const before = await database.query<{ name: string }>(ALL_TABLES);
+    const { log, entries } = createTestLogger();
+    const db = createDb<unknown>(database.config);
+    try {
+      await expect(runMigrations(db, log)).rejects.toThrow(
+        'The tables guild, gymmeta have lower-case names, as MySQL on Windows writes them; ' +
+          "the bot needs Guild, GymMeta. './pine restore' renames them when it loads a dump.",
+      );
+    } finally {
+      await db.destroy();
+    }
+    expect(await database.query<{ name: string }>(ALL_TABLES)).toEqual(before);
+    // A refusal, said as one: no migration ran, so none failed.
+    expect(entries.map((entry) => entry.msg)).toEqual([
+      'database refused: its table names are lower case',
+    ]);
+  });
+
   it('refuses a legacy database missing the latest legacy migration', async () => {
     database = await startDatabase({ legacySchema: true });
     await database.query('delete from knex_migrations where name = ?', [LEGACY_REQUIRED_MIGRATION]);
diff --git a/src/db/migrator.ts b/src/db/migrator.ts
index b1ec9885a0e41ea3b396ecd5ff3b442233edfa0b..b707b1fcaae9bf0ebc177452e97802086a7738fd 100644
--- a/src/db/migrator.ts
+++ b/src/db/migrator.ts
@@ -4,6 +4,7 @@ import type { Logger } from '../log.js';
 import { detectDatabaseState, refusalMessage } from './migrations/2026_10_09_000_baseline.js';
 import { warnOfSharedChannels } from './migrations/2026_10_13_011_region_channel_unique.js';
 import { migrations } from './migrations/index.js';
+import { canonicalRenames } from './table-names.js';
 
 const BASELINE_NAME = '2026_10_09_000_baseline';
 
@@ -34,8 +35,36 @@ async function refuseUnknownDatabase(db: Kysely<any>, log: Logger): Promise<void
   }
 }
 
+/**
+ * A dump from MySQL on Windows has every table name in lower case (`guild`, `gymmeta`); loaded
+ * into a server that tells names by their case (lower_case_table_names=0, Linux's default) the
+ * bot would not find its tables, and the first migration would fail half-way. Refused here,
+ * before anything is written, with the way out; a server that ignores case is left alone.
+ */
+// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+async function refuseLowerCaseTables(db: Kysely<any>, log: Logger): Promise<void> {
+  const setting = await sql<{ value: number | string }>`
+    select @@lower_case_table_names as value`.execute(db);
+  if (Number(setting.rows[0]?.value) !== 0) return;
+  const result = await sql<{ name: string }>`
+    select table_name as name from information_schema.tables
+    where table_schema = database()`.execute(db);
+  const renames = canonicalRenames(result.rows.map((row) => row.name));
+  if (renames.length === 0) return;
+  log.error(
+    { tables: renames.map((rename) => rename.from) },
+    'database refused: its table names are lower case',
+  );
+  throw new Error(
+    `The tables ${renames.map((rename) => rename.from).join(', ')} have lower-case names, as ` +
+      `MySQL on Windows writes them; the bot needs ${renames.map((rename) => rename.to).join(', ')}. ` +
+      "'./pine restore' renames them when it loads a dump.",
+  );
+}
+
 // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
 export async function runMigrations(db: Kysely<any>, log: Logger): Promise<void> {
+  await refuseLowerCaseTables(db, log);
   await refuseUnknownDatabase(db, log);
   const migrator = new Migrator({ db, provider: new StaticMigrationProvider(migrations) });
   const { error, results } = await migrator.migrateToLatest();
diff --git a/src/db/table-names.test.ts b/src/db/table-names.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f7827ec6d1bdf2c1735891f86a82b9cd887a8a8d
--- /dev/null
+++ b/src/db/table-names.test.ts
@@ -0,0 +1,25 @@
+import { describe, expect, it } from 'vitest';
+import { canonicalRenames } from './table-names.js';
+
+// That PINE_TABLES knows every table the migrations make is checked by restore.db.test.ts.
+
+describe('canonicalRenames', () => {
+  it('renames the lower-case names of a dump from Windows to the names the bot uses', () => {
+    expect(
+      canonicalRenames(['guild', 'gymmeta', 'knex_migrations', 'pokemonnotification', 'user']),
+    ).toEqual([
+      { from: 'guild', to: 'Guild' },
+      { from: 'gymmeta', to: 'GymMeta' },
+      { from: 'pokemonnotification', to: 'PokemonNotification' },
+      { from: 'user', to: 'User' },
+    ]);
+  });
+
+  it('leaves the right names, and tables it does not know, alone', () => {
+    expect(canonicalRenames(['Guild', 'GymMeta', 'kysely_migration', 'notes'])).toEqual([]);
+  });
+
+  it('leaves a lower-case table alone when the right name is there too', () => {
+    expect(canonicalRenames(['Guild', 'guild', 'party'])).toEqual([{ from: 'party', to: 'Party' }]);
+  });
+});
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a7435ddfa7c06ac96b3045f17b9db10961cc79ef
--- /dev/null
+++ b/src/db/table-names.ts
@@ -0,0 +1,46 @@
+import { LEGACY_SCHEMA_STATEMENTS } from './baseline/legacy-schema.js';
+
+/** The legacy bot's tables, as its migrations named them (`Guild`, `GymMeta` …). */
+const LEGACY_TABLES = LEGACY_SCHEMA_STATEMENTS.map(
+  (statement) => /^CREATE TABLE `(\w+)`/.exec(statement)?.[1],
+).filter((name): name is string => name !== undefined);
+
+/**
+ * Every table of a Pine database, as the bot names them: the legacy bot's, its knex
+ * bookkeeping, the tables the Kysely migrations add, and Kysely's bookkeeping. A migration that
+ * adds a table adds it here (`restore.db.test.ts` checks it).
+ */
+export const PINE_TABLES: readonly string[] = [
+  ...LEGACY_TABLES,
+  'knex_migrations',
+  'knex_migrations_lock',
+  'GymLookup',
+  'GymLookupDay',
+  'GymReview',
+  'GymWayfarer',
+  'NewTrainNotification',
+  'Party',
+  'PartyAccessGrant',
+  'RaidBoss',
+  'RaidBossOverride',
+  'RoleGroup',
+  'SpawnReport',
+  'UnownWantGift',
+  'WayspotImport',
+  'kysely_migration',
+  'kysely_migration_lock',
+];
+
+/**
+ * The renames that give a database the table names the bot uses, when it has them in lower case
+ * (`guild`, `gymmeta`: MySQL on Windows lower-cases every name, and a dump keeps that). A table
+ * whose right name is there already, and a table the bot does not know, stay as they are. In
+ * the order of the lower-case names.
+ */
+export function canonicalRenames(tables: readonly string[]): Array<{ from: string; to: string }> {
+  const present = new Set(tables);
+  return PINE_TABLES.filter((name) => name !== name.toLowerCase())
+    .filter((name) => !present.has(name) && present.has(name.toLowerCase()))
+    .map((name) => ({ from: name.toLowerCase(), to: name }))
+    .sort((a, b) => a.from.localeCompare(b.from));
+}
diff --git a/src/ops/restore-cli.ts b/src/ops/restore-cli.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a96f7f260cc5dd09b7b94c5bb0d6c14079384be7
--- /dev/null
+++ b/src/ops/restore-cli.ts
@@ -0,0 +1,32 @@
+import { ConfigError, type Env } from '../config/index.js';
+import { loadEnv } from '../config/env.js';
+import { dbConfigFrom } from '../db/db-config.js';
+import { createDb } from '../db/kysely.js';
+import { restoreStep } from './restore.js';
+
+// The database half of `./pine restore`, run in a one-off container of the bot's image (the
+// script streams the dump itself into the mysql service in between); see `restoreStep`:
+//   node dist/ops/restore-cli.js check [--replace]     before anything is stopped
+//   node dist/ops/restore-cli.js prepare [--replace]   an empty database
+//   node dist/ops/restore-cli.js finish                the table names, and what was loaded
+const [step, ...flags] = process.argv.slice(2);
+
+let env: Env;
+try {
+  env = loadEnv(process.env);
+} catch (err) {
+  process.stderr.write(`${err instanceof ConfigError ? err.message : String(err)}\n`);
+  process.exit(1);
+}
+
+const db = createDb<unknown>(dbConfigFrom(env));
+try {
+  process.exitCode = await restoreStep(db, step, flags, (line) =>
+    process.stdout.write(`${line}\n`),
+  );
+} catch (err) {
+  process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
+  process.exitCode = 1;
+} finally {
+  await db.destroy();
+}
diff --git a/src/ops/restore.db.test.ts b/src/ops/restore.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..30c0652182af0fd165303c53fd7c946f3cad6331
--- /dev/null
+++ b/src/ops/restore.db.test.ts
@@ -0,0 +1,259 @@
+import { readFile } from 'node:fs/promises';
+import type { Kysely } from 'kysely';
+import { pino } from 'pino';
+import { afterEach, describe, expect, it } from 'vitest';
+import {
+  LEGACY_SCHEMA_FIXTURE,
+  startDatabase,
+  type TestDatabase,
+} from '../../test/support/mysql.js';
+import { createDb } from '../db/kysely.js';
+import { runMigrations } from '../db/migrator.js';
+import { LEGACY_REQUIRED_MIGRATION } from '../db/migrations/2026_10_09_000_baseline.js';
+import { PINE_TABLES } from '../db/table-names.js';
+import { prepareSchema, renameLegacyTables, restoreReport, restoreStep } from './restore.js';
+
+const silent = pino({ level: 'silent' });
+const opened: Array<{ database: TestDatabase; db: Kysely<unknown> }> = [];
+
+async function open(options: { legacySchema: boolean }) {
+  const database = await startDatabase(options);
+  const db = createDb<unknown>(database.config);
+  opened.push({ database, db });
+  return { database, db };
+}
+
+afterEach(async () => {
+  for (const { database, db } of opened.splice(0)) {
+    await db.destroy();
+    await database.stop();
+  }
+});
+
+/**
+ * The legacy schema as a dump from MySQL on Windows has it: every table name in lower case, in
+ * its own statements and in the foreign keys that point at it.
+ */
+async function lowerCaseLegacyDump(): Promise<string> {
+  const fixture = await readFile(LEGACY_SCHEMA_FIXTURE, 'utf8');
+  return fixture.replace(
+    /(CREATE TABLE|REFERENCES|INSERT INTO|ALTER TABLE) `(\w+)`/g,
+    (_, keyword: string, name: string) => `${keyword} \`${name.toLowerCase()}\``,
+  );
+}
+
+const ROWS = `
+  INSERT INTO guild (id, snowflake) VALUES (1, '100000000000000001'), (2, '100000000000000002');
+  INSERT INTO gym (id, lat, lon, name) VALUES (1, 40.44, -79.99, 'Gym One');
+  INSERT INTO gymmeta (gymId, nickname) VALUES (1, 'One');
+  INSERT INTO user (id, userSnowflake) VALUES (1, '200000000000000001');
+  INSERT INTO pokemonnotification (pokemon, guildId, userId) VALUES (150, 1, 1);
+`;
+
+/** The tables of the test's database, by its name (a dropped database is nobody's current one). */
+async function tables(database: TestDatabase): Promise<string[]> {
+  const rows = await database.query<{ name: string }>(
+    `select table_name as name from information_schema.tables
+     where table_schema = ? order by name`,
+    [database.config.database],
+  );
+  return rows.map((row) => row.name);
+}
+
+describe('renameLegacyTables', () => {
+  it('renames the lower-case tables of a Windows dump, keeps their rows and foreign keys', async () => {
+    const { database, db } = await open({ legacySchema: false });
+    await database.query(await lowerCaseLegacyDump());
+    await database.query(ROWS);
+
+    const renamed = await renameLegacyTables(db);
+
+    expect(renamed).toContainEqual({ from: 'gymmeta', to: 'GymMeta' });
+    expect(renamed).toHaveLength(15);
+    expect(await tables(database)).toEqual(
+      [
+        'Alias',
+        'AutoAssignRole',
+        'AutosetPokemon',
+        'CommandRoleAuthorization',
+        'CommandRoles',
+        'Guild',
+        'Gym',
+        'GymMeta',
+        'GymNotification',
+        'Pokemon',
+        'PokemonNotification',
+        'Region',
+        'Role',
+        'SavedRoutes',
+        'User',
+        'knex_migrations',
+        'knex_migrations_lock',
+      ].sort(),
+    );
+    const references = await database.query<{ name: string }>(
+      `select distinct referenced_table_name as name from information_schema.referential_constraints
+       where constraint_schema = database() order by name`,
+    );
+    expect(references.map((row) => row.name)).toEqual([
+      'Alias',
+      'Guild',
+      'Gym',
+      'Region',
+      'Role',
+      'User',
+    ]);
+    expect(await database.query('select nickname from GymMeta')).toEqual([{ nickname: 'One' }]);
+
+    // The migrator takes the renamed database over as it takes over any legacy one.
+    await runMigrations(db, silent);
+  });
+
+  it('leaves a database with the right names alone', async () => {
+    const { database, db } = await open({ legacySchema: true });
+    const before = await tables(database);
+
+    expect(await renameLegacyTables(db)).toEqual([]);
+    expect(await tables(database)).toEqual(before);
+  });
+
+  it('knows every table the migrations make', async () => {
+    const { database, db } = await open({ legacySchema: true });
+    await runMigrations(db, silent);
+
+    const unknown = (await tables(database)).filter((name) => !PINE_TABLES.includes(name));
+    expect(unknown).toEqual([]);
+  });
+});
+
+describe('prepareSchema', () => {
+  it('lets an empty database be loaded', async () => {
+    const { db } = await open({ legacySchema: false });
+
+    await expect(prepareSchema(db, { replace: false })).resolves.toEqual({ dropped: 0 });
+  });
+
+  it('refuses a database that has tables, unless told to replace it', async () => {
+    const { database, db } = await open({ legacySchema: true });
+
+    await expect(prepareSchema(db, { replace: false })).rejects.toThrow(
+      `The database ${database.config.database} already has 17 tables. ` +
+        "'./pine restore <dump> --replace' drops them first.",
+    );
+    expect(await tables(database)).toHaveLength(17);
+  });
+
+  it('drops the database and makes it anew, empty and utf8mb4, when told to replace it', async () => {
+    const { database, db } = await open({ legacySchema: true });
+
+    await expect(prepareSchema(db, { replace: true })).resolves.toEqual({ dropped: 17 });
+
+    expect(await tables(database)).toEqual([]);
+    const [schema] = await database.query<{ charset: string; collation: string }>(
+      `select default_character_set_name as charset, default_collation_name as collation
+       from information_schema.schemata where schema_name = ?`,
+      [database.config.database],
+    );
+    expect(schema).toEqual({ charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' });
+  });
+});
+
+/** Runs a step of `restore-cli` and keeps what it said. */
+async function step(db: Kysely<unknown>, name: string, ...flags: string[]) {
+  const said: string[] = [];
+  const code = await restoreStep(db, name, flags, (line) => said.push(line));
+  return { code, said };
+}
+
+describe('restoreStep', () => {
+  it('checks before anything is stopped: an empty database, or one --replace will drop', async () => {
+    const empty = await open({ legacySchema: false });
+    expect(await step(empty.db, 'check')).toEqual({
+      code: 0,
+      said: [`The database ${empty.database.config.database} is empty.`],
+    });
+
+    const full = await open({ legacySchema: true });
+    const name = full.database.config.database;
+    expect(await step(full.db, 'check')).toEqual({
+      code: 1,
+      said: [
+        `The database ${name} already has 17 tables. ` +
+          "'./pine restore <dump> --replace' drops them first.",
+      ],
+    });
+    expect(await step(full.db, 'check', '--replace')).toEqual({
+      code: 0,
+      said: [`The database ${name} has 17 tables: --replace drops them.`],
+    });
+    expect(await tables(full.database)).toHaveLength(17);
+  });
+
+  it('drops the database with --replace and says so', async () => {
+    const { database, db } = await open({ legacySchema: true });
+
+    expect(await step(db, 'prepare', '--replace')).toEqual({
+      code: 0,
+      said: [`Dropped the database ${database.config.database} (17 tables) and made it anew.`],
+    });
+  });
+
+  it('fails the finish of a load that holds nothing the bot can take', async () => {
+    const empty = await open({ legacySchema: false });
+    expect((await step(empty.db, 'finish')).code).toBe(1);
+
+    const incomplete = await open({ legacySchema: true });
+    await incomplete.database.query('delete from knex_migrations where name = ?', [
+      LEGACY_REQUIRED_MIGRATION,
+    ]);
+    const finished = await step(incomplete.db, 'finish');
+    expect(finished.code).toBe(1);
+    expect(finished.said[0]).toMatch(/that the bot refuses: Baseline failed/);
+
+    const legacy = await open({ legacySchema: true });
+    expect((await step(legacy.db, 'finish')).code).toBe(0);
+  });
+
+  it('refuses a step it does not know', async () => {
+    const { db } = await open({ legacySchema: false });
+
+    expect((await step(db, 'load')).code).toBe(2);
+  });
+});
+
+describe('restoreReport', () => {
+  it('says what kind of database was loaded and counts the rows of the main tables', async () => {
+    const { database, db } = await open({ legacySchema: false });
+    await database.query(await lowerCaseLegacyDump());
+    await database.query(ROWS);
+    await renameLegacyTables(db);
+
+    expect(await restoreReport(db)).toEqual({
+      kind: 'legacy',
+      tables: 17,
+      migrations: 0,
+      rows: {
+        Guild: 2,
+        Region: 0,
+        Gym: 1,
+        User: 1,
+        PokemonNotification: 1,
+        GymNotification: 0,
+        Role: 0,
+        SavedRoutes: 0,
+      },
+    });
+
+    await runMigrations(db, silent);
+    const migrated = await restoreReport(db);
+    expect(migrated.kind).toBe('pine');
+    expect(migrated.migrations).toBeGreaterThan(10);
+    expect(migrated.rows).toMatchObject({ Guild: 2, Party: 0 });
+  });
+
+  it('says so when nothing was loaded', async () => {
+    const { db } = await open({ legacySchema: false });
+
+    expect(await restoreReport(db)).toEqual({ kind: 'empty', tables: 0, migrations: 0, rows: {} });
+  });
+});
diff --git a/src/ops/restore.test.ts b/src/ops/restore.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5f42fdc12fb7d240d212e5ac1df8c9380229e366
--- /dev/null
+++ b/src/ops/restore.test.ts
@@ -0,0 +1,46 @@
+import { describe, expect, it } from 'vitest';
+import { LEGACY_REQUIRED_MIGRATION } from '../db/migrations/2026_10_09_000_baseline.js';
+import { reportLines, type RestoreReport } from './restore.js';
+
+const rows = { Guild: 4, Gym: 3213 };
+
+describe('reportLines', () => {
+  it('says what kind of database was loaded, with the rows of the main tables', () => {
+    const report = (kind: RestoreReport['kind']): RestoreReport => ({
+      kind,
+      tables: 17,
+      migrations: kind === 'pine' ? 14 : 0,
+      rows,
+    });
+
+    expect(reportLines(report('pine'))).toEqual([
+      "Loaded a Professor Pine database (14 of the bot's migrations applied), 17 tables.",
+      '  Guild: 4 rows',
+      '  Gym: 3213 rows',
+    ]);
+    expect(reportLines(report('legacy'))[0]).toBe(
+      "Loaded a legacy Professor Pine database (the bot's migrator takes it over at the start), " +
+        '17 tables.',
+    );
+    expect(reportLines(report('other'))[0]).toBe(
+      'Loaded a database the bot does not know: its migrator will refuse it, 17 tables.',
+    );
+  });
+
+  it('says why the bot will refuse a legacy database that lacks a migration', () => {
+    const lines = reportLines({ kind: 'legacy-incomplete', tables: 17, migrations: 0, rows });
+
+    expect(lines[0]).toBe(
+      'Loaded a legacy Professor Pine database of 17 tables that the bot refuses: Baseline ' +
+        `failed: legacy migration ${LEGACY_REQUIRED_MIGRATION} has not been applied. Run the ` +
+        'legacy bot (main-dev) once so all its migrations apply, then retry.',
+    );
+  });
+
+  it('says so when nothing was loaded', () => {
+    expect(reportLines({ kind: 'empty', tables: 0, migrations: 0, rows: {} })).toEqual([
+      'The dump loaded no tables into the database. Was it made for another database name ' +
+        '(a USE line in it)?',
+    ]);
+  });
+});
diff --git a/src/ops/restore.ts b/src/ops/restore.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ec7ef3dc39ef7877f7146b1ec904f9f83d8f8fc9
--- /dev/null
+++ b/src/ops/restore.ts
@@ -0,0 +1,213 @@
+import { sql, type Kysely } from 'kysely';
+import { detectDatabaseState, refusalMessage } from '../db/migrations/2026_10_09_000_baseline.js';
+import { canonicalRenames } from '../db/table-names.js';
+
+/* eslint-disable @typescript-eslint/no-explicit-any -- these run on any schema: a dump as it was
+   loaded, before the bot's own migrations */
+
+/** A plain sentence for the operator: `restore-cli` prints it without a stack. */
+export class RestoreError extends Error {}
+
+async function tablesOf(db: Kysely<any>): Promise<string[]> {
+  const result = await sql<{ name: string }>`
+    select table_name as name from information_schema.tables
+    where table_schema = database() order by name`.execute(db);
+  return result.rows.map((row) => row.name);
+}
+
+/**
+ * Makes the database ready for a dump: an empty one is left as it is; one with tables is refused,
+ * unless `replace`, which drops the database and creates it anew (utf8mb4 with the bot's
+ * collation), so that no table of the old one is left among the dump's.
+ */
+export async function prepareSchema(
+  db: Kysely<any>,
+  options: { replace: boolean },
+): Promise<{ dropped: number }> {
+  const { name, tables } = await checkSchema(db, options);
+  if (tables === 0) return { dropped: 0 };
+  await sql`drop database ${sql.id(name)}`.execute(db);
+  await sql`create database ${sql.id(name)} character set utf8mb4 collate utf8mb4_0900_ai_ci`.execute(
+    db,
+  );
+  return { dropped: tables };
+}
+
+async function schemaName(db: Kysely<any>): Promise<string> {
+  const name = (await sql<{ name: string }>`select database() as name`.execute(db)).rows[0]?.name;
+  if (!name) throw new RestoreError('No database is selected: DB_SCHEMA names none.');
+  return name;
+}
+
+/**
+ * Whether a dump may be loaded, asked before anything is stopped: the database is empty, or it
+ * has tables and `replace` is given. Refuses (`RestoreError`) a database with tables otherwise.
+ */
+export async function checkSchema(
+  db: Kysely<any>,
+  options: { replace: boolean },
+): Promise<{ name: string; tables: number }> {
+  const name = await schemaName(db);
+  const tables = (await tablesOf(db)).length;
+  if (tables > 0 && !options.replace) {
+    throw new RestoreError(
+      `The database ${name} already has ${tables} tables. ` +
+        "'./pine restore <dump> --replace' drops them first.",
+    );
+  }
+  return { name, tables };
+}
+
+/**
+ * Gives a loaded dump the table names the bot uses: a dump from MySQL on Windows has them in
+ * lower case. One `RENAME TABLE` for all of them (MySQL renames them together, and the foreign
+ * keys follow); a dump with the right names is left alone.
+ */
+export async function renameLegacyTables(
+  db: Kysely<any>,
+): Promise<Array<{ from: string; to: string }>> {
+  const renames = canonicalRenames(await tablesOf(db));
+  if (renames.length === 0) return [];
+  const pairs = renames.map((rename) => sql`${sql.id(rename.from)} to ${sql.id(rename.to)}`);
+  await sql`rename table ${sql.join(pairs)}`.execute(db);
+  return renames;
+}
+
+/** The tables whose rows `restoreReport` counts, as far as the database has them. */
+const MAIN_TABLES = [
+  'Guild',
+  'Region',
+  'Gym',
+  'User',
+  'PokemonNotification',
+  'GymNotification',
+  'Role',
+  'SavedRoutes',
+  'Party',
+] as const;
+
+export interface RestoreReport {
+  /**
+   * `pine`: the bot's migrations ran on it; `legacy`: the legacy bot's only, all of them;
+   * `legacy-incomplete`: the legacy bot's without its last one (the migrator refuses it); else
+   * `other`.
+   */
+  kind: 'empty' | 'legacy' | 'legacy-incomplete' | 'pine' | 'other';
+  tables: number;
+  /** The bot's migrations applied. */
+  migrations: number;
+  /** The rows of the main tables it has. */
+  rows: Partial<Record<(typeof MAIN_TABLES)[number], number>>;
+}
+
+/** What a loaded dump holds: its kind, its tables and the rows of the main ones. */
+export async function restoreReport(db: Kysely<any>): Promise<RestoreReport> {
+  const tables = await tablesOf(db);
+  if (tables.length === 0) return { kind: 'empty', tables: 0, migrations: 0, rows: {} };
+  let migrations = 0;
+  if (tables.includes('kysely_migration')) {
+    const applied = await sql<{ count: number | string }>`
+      select count(*) as count from kysely_migration`.execute(db);
+    migrations = Number(applied.rows[0]?.count ?? 0);
+  }
+  const { state } = await detectDatabaseState(db);
+  const kind =
+    migrations > 0
+      ? 'pine'
+      : state === 'legacy-complete'
+        ? 'legacy'
+        : state === 'legacy-incomplete'
+          ? 'legacy-incomplete'
+          : 'other';
+  const rows: RestoreReport['rows'] = {};
+  for (const table of MAIN_TABLES) {
+    if (!tables.includes(table)) continue;
+    const counted = await sql<{ count: number | string }>`
+      select count(*) as count from ${sql.table(table)}`.execute(db);
+    rows[table] = Number(counted.rows[0]?.count ?? 0);
+  }
+  return { kind, tables: tables.length, migrations, rows };
+}
+
+/** The report in lines for the operator. */
+export function reportLines(report: RestoreReport): string[] {
+  if (report.kind === 'empty') {
+    return [
+      'The dump loaded no tables into the database. Was it made for another database name ' +
+        '(a USE line in it)?',
+    ];
+  }
+  if (report.kind === 'legacy-incomplete') {
+    return [
+      `Loaded a legacy Professor Pine database of ${report.tables} tables that the bot refuses: ` +
+        refusalMessage('legacy-incomplete', []),
+    ];
+  }
+  const what = {
+    pine: `a Professor Pine database (${report.migrations} of the bot's migrations applied)`,
+    legacy: "a legacy Professor Pine database (the bot's migrator takes it over at the start)",
+    other: 'a database the bot does not know: its migrator will refuse it',
+  }[report.kind];
+  return [
+    `Loaded ${what}, ${report.tables} tables.`,
+    ...Object.entries(report.rows).map(([table, rows]) => `  ${table}: ${rows} rows`),
+  ];
+}
+
+/**
+ * One step of `restore-cli` (the database half of `./pine restore`), its lines said through
+ * `say`; resolves to the exit code: 0 done, 1 refused or failed (with a sentence), 2 a step it
+ * does not know.
+ *  - `check [--replace]`: before anything is stopped, whether the dump may be loaded;
+ *  - `prepare [--replace]`: an empty database (dropped and made anew with `--replace`);
+ *  - `finish`: the table names, and what was loaded; a load the bot cannot take fails.
+ */
+export async function restoreStep(
+  db: Kysely<any>,
+  step: string | undefined,
+  flags: readonly string[],
+  say: (line: string) => void,
+): Promise<number> {
+  const replace = flags.includes('--replace');
+  try {
+    if (step === 'check') {
+      const { name, tables } = await checkSchema(db, { replace });
+      say(
+        tables > 0
+          ? `The database ${name} has ${tables} tables: --replace drops them.`
+          : `The database ${name} is empty.`,
+      );
+      return 0;
+    }
+    if (step === 'prepare') {
+      const name = await schemaName(db);
+      const { dropped } = await prepareSchema(db, { replace });
+      say(
+        dropped > 0
+          ? `Dropped the database ${name} (${dropped} tables) and made it anew.`
+          : `The database ${name} is empty.`,
+      );
+      return 0;
+    }
+    if (step === 'finish') {
+      const renamed = await renameLegacyTables(db);
+      if (renamed.length > 0) {
+        say(
+          `Renamed ${renamed.length} tables from lower case: ` +
+            `${renamed.map((rename) => rename.to).join(', ')}.`,
+        );
+      }
+      const report = await restoreReport(db);
+      for (const line of reportLines(report)) say(line);
+      return report.kind === 'pine' || report.kind === 'legacy' ? 0 : 1;
+    }
+    say('Usage: restore-cli.js check [--replace] | prepare [--replace] | finish');
+    return 2;
+  } catch (err) {
+    if (err instanceof RestoreError) {
+      say(err.message);
+      return 1;
+    }
+    throw err;
+  }
+}
````

### Task 6: Plan 9A T6: Backups: a verified dump every night, ./pine backup for one now

Prototype commit: `cfb74efa33599541bc98d08e85fcc4e0b3a22fbe`

A backup service on the mysql:8.0 image (its own mysqldump and mysqld; no MariaDB client)
runs docker/backup.sh, a POSIX sh loop: every day at BACKUP_TIME (03:30) in BACKUP_TZ, or
the bot's settings' timezone when that is blank (a zone the image does not know stops it with
a sentence), it dumps DB_SCHEMA (single transaction, hex blobs, routines, triggers, events),
gzipped, as pine-backup-YYYYMMDD.sql.gz into BACKUP_DIR on the host. The folder must hold a
.pine-backups file made once by hand, so that an unmounted share is never written to; its
files are written, read and deleted as BACKUP_UID:BACKUP_GID (root by default; a share that
squashes root needs its owner). Every dump is verified before it takes its name: a second
mysqld (no binary log, no double writes) with a temporary data directory in the
backup-scratch volume loads it, its tables must equal the live ones, kysely_migration must
have rows and Guild, Region, Gym and User must have rows where the live ones do (a count the
live database does not give is a failure); then the scratch server goes, and what a stopped
run left goes at the next start. Only this stack's dumps are ever deleted, after exactly
BACKUP_KEEP_DAYS (90) days; a failed run keeps the day's earlier dump. One run at a time,
under a lock that holds its pid (a dead one is taken over); a scheduled run that finds one
running records a failure. The result goes to the log and to /ops/backup-status.json, which
the watchdog reads, and a line for ./pine status; backup-status.test.ts runs the script's own
write_status, with a quote, a backslash and a line break in the reason.

./pine backup runs one now through the same code; ./pine status shows the last result;
./pine restore stops the backups too, and with --replace over a database that has tables it
makes a verified backup of it first (a file of its own, tagged before-restore, so that it
never replaces the dump being restored), unless --no-backup.

Checked on Docker Desktop against the scratch stack with the migrated production copy: a
backup verified in 9 s and written as 1000:1000, a folder without the marker refused, a
second run while one ran refused, and ./pine restore --replace of that backup (a Pine
database) after a backup of its own.

**Files:**

```
 .env.example                  |  12 ++
 .gitignore                    |   3 +
 compose.yaml                  |  37 +++++-
 docker/backup.sh              | 382 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 pine                          |  50 ++++++--
 src/ops/backup-status.test.ts |  60 ++++++++++
 src/ops/restore.db.test.ts    |   3 +-
 src/ops/restore.ts            |  14 +--
 8 files changed, 544 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/ops/backup-status.test.ts`,
  `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/ops/restore.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cfb74efa33599541bc98d08e85fcc4e0b3a22fbe -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T6: Backups: a verified dump every night, ./pine backup for one now`, the body above and the trailer, staging exactly
  `.env.example .gitignore compose.yaml docker/backup.sh pine src/ops/backup-status.test.ts src/ops/restore.db.test.ts src/ops/restore.ts`.

````diff
diff --git a/.env.example b/.env.example
index 252d1a9fbc04590e980fe7767e5995db09500e0a..90a5071884447f673ea7bbde3e1ad9f73fb7b2e5 100644
--- a/.env.example
+++ b/.env.example
@@ -41,6 +41,18 @@ NODE_ENV=production
 # The settings are pine-settings.json beside compose.yaml (copy data/settings.json; git-ignored).
 # The password of MySQL's root user in the stack, set on its first start; the bot never sees it.
 DB_ROOT_PASSWORD=
+# Backups: a verified dump every day at BACKUP_TIME (24-hour HH:MM) in BACKUP_TZ (blank: the
+# settings' timezone) into BACKUP_DIR on the host (a path relative to compose.yaml, or absolute:
+# for an NFS share, the host's mount point), kept BACKUP_KEEP_DAYS days. The folder must hold a
+# file .pine-backups, made once by hand (touch <BACKUP_DIR>/.pine-backups): without it (a share
+# that is not mounted) no backup is written. Files there are written as BACKUP_UID:BACKUP_GID
+# (0:0, root, by default; the share's owner for NFS with root_squash).
+BACKUP_DIR=./backups
+BACKUP_TIME=03:30
+BACKUP_TZ=
+BACKUP_KEEP_DAYS=90
+BACKUP_UID=0
+BACKUP_GID=0
 # The watchdog restarts the bot after it has been stuck (a stale heartbeat) this many minutes,
 # and DMs OWNER_ID when the bot has been unhealthy for another reason (the database, Discord, a
 # long start) WATCHDOG_ALERT_MINUTES, restarted WATCHDOG_RESTARTS times within
diff --git a/.gitignore b/.gitignore
index a1038e06800c9fb994051a719e9a0363ba1a5b49..3a08947c9ed3969830ecdd196eb383ddc95f33b6 100644
--- a/.gitignore
+++ b/.gitignore
@@ -34,3 +34,6 @@ var/
 .env
 # the settings of a Docker installation (./pine)
 /pine-settings.json
+
+# backups of the Docker stack (BACKUP_DIR)
+/backups/
diff --git a/compose.yaml b/compose.yaml
index 0187b9f1346ff5b4fa2a4a1c00c851bc367a4cbc..cd80c95b918a18359741b7a1a164e9fb923b4fd2 100644
--- a/compose.yaml
+++ b/compose.yaml
@@ -97,6 +97,40 @@ services:
     init: true
     restart: unless-stopped
 
+  # A verified dump of the database every night (docker/backup.sh, `./pine backup` for one now),
+  # into BACKUP_DIR on the host. On the mysql:8.0 image for its own mysqldump and mysqld: a
+  # MariaDB client against MySQL 8 is a trap, and the check loads each dump into a scratch
+  # server of its own. Its result goes to the ops volume, where the watchdog reads it.
+  backup:
+    image: mysql:8.0
+    entrypoint: ['sh', '/pine/backup.sh']
+    command: ['schedule']
+    environment:
+      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD must be set in .env}
+      DB_SCHEMA: ${DB_SCHEMA:?DB_SCHEMA must be set in .env}
+      BACKUP_TIME: ${BACKUP_TIME:-03:30}
+      BACKUP_TZ: ${BACKUP_TZ:-}
+      BACKUP_KEEP_DAYS: ${BACKUP_KEEP_DAYS:-90}
+      # Who writes in BACKUP_DIR: an NFS share that squashes root needs its owner's ids.
+      BACKUP_UID: ${BACKUP_UID:-0}
+      BACKUP_GID: ${BACKUP_GID:-0}
+    volumes:
+      - ./docker/backup.sh:/pine/backup.sh:ro
+      # For the default time zone of the backups: the bot's `timezone`.
+      - ${PINE_SETTINGS:-./pine-settings.json}:/pine/settings.json:ro
+      - ${BACKUP_DIR:-./backups}:/backups
+      - ops:/ops
+      # The scratch server of the check: room for the database about twice over, off the
+      # container's own layer.
+      - backup-scratch:/scratch
+    depends_on:
+      mysql:
+        condition: service_healthy
+    init: true
+    restart: unless-stopped
+    # A stop during a check shuts the scratch server down first.
+    stop_grace_period: 30s
+
   # cloudflared: plan 8M fills this slot. The bot's web server listens on 0.0.0.0 inside this
   # network (settings `web.listen`, `web.port`), its port is not published, and the tunnel
   # reaches it as http://pine:<port>; the token comes from `.env`, never from a file here.
@@ -113,5 +147,6 @@ services:
 volumes:
   mysql-data:
   pine-var:
-  # The backup's last result, which the watchdog reads.
+  # The backup's last result, which the watchdog reads, and what the watchdog told.
   ops:
+  backup-scratch:
diff --git a/docker/backup.sh b/docker/backup.sh
new file mode 100644
index 0000000000000000000000000000000000000000..75e7446c6a010dc2153a7a6e9697592f4d631049
--- /dev/null
+++ b/docker/backup.sh
@@ -0,0 +1,382 @@
+#!/bin/sh
+# The stack's backups (the `backup` service of compose.yaml, on the mysql:8.0 image, whose
+# mysqldump and mysqld this uses; see docs/architecture/operations.md).
+#
+#   backup.sh schedule   every day at BACKUP_TIME, in BACKUP_TZ (or the settings' timezone)
+#   backup.sh now [tag]  one backup now (`./pine backup`); exits 1 when it failed. With a tag
+#                        (`before-restore`, `before-update`) it is a file of its own,
+#                        pine-backup-YYYYMMDD-HHMMSS-<tag>.sql.gz, which no day's backup replaces
+#   backup.sh status     the last backup's result in a line
+#
+# A backup is a dump of the Pine schema (DB_SCHEMA) of the `mysql` service, gzipped, as
+# /backups/pine-backup-YYYYMMDD.sql.gz (one per day; a second one the same day replaces it).
+# /backups is BACKUP_DIR on the host; it must hold a file `.pine-backups`, made once by the
+# operator, so that an unmounted share (an empty folder) is never taken for the backup folder.
+# Every file there is written as BACKUP_UID:BACKUP_GID (an NFS share that squashes root).
+# Every dump is verified before it takes its name: loaded into a scratch MySQL server of its own
+# (a second mysqld with a temporary data directory under /scratch, a volume), the tables compared
+# with the live ones, the main tables and kysely_migration checked for rows; then the scratch
+# server is thrown away. Dumps of this stack older than BACKUP_KEEP_DAYS days are deleted
+# (only `pine-backup-*.sql.gz`: nothing else in the folder). The result goes to the log and to
+# /ops/backup-status.json, which the watchdog reads (a DM to the owner on failure).
+#
+# With BACKUP_SH_LIBRARY set, the functions are only defined (the tests source the script).
+set -eu
+
+OUT=/backups
+MARKER=.pine-backups
+OPS=${BACKUP_OPS_DIR:-/ops}
+STATUS=$OPS/backup-status.json
+SUMMARY=$OPS/backup-status.txt
+SCRATCH_DIR=/scratch
+LOCK=/tmp/pine-backup.lock
+# The tables that must have rows in a dump when they have rows in the live database.
+MAIN_TABLES="Guild Region Gym User"
+
+# The settings, checked once at the start of every command; a mistake stops the service with a
+# sentence in its log.
+setup() {
+  SCHEMA=${DB_SCHEMA:?DB_SCHEMA is not set}
+  : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is not set}"
+  AT=${BACKUP_TIME:-03:30}
+  KEEP=${BACKUP_KEEP_DAYS:-90}
+  OWNER_UID=${BACKUP_UID:-0}
+  OWNER_GID=${BACKUP_GID:-0}
+  # The zone of BACKUP_TIME: BACKUP_TZ, else the bot's settings' timezone, else UTC.
+  if [ -n "${BACKUP_TZ:-}" ]; then
+    TZ=$BACKUP_TZ
+  else
+    TZ=$(sed -n 's/^[[:space:]]*"timezone"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
+      /pine/settings.json 2>/dev/null | head -n 1)
+    TZ=${TZ:-UTC}
+  fi
+  if [ ! -f "/usr/share/zoneinfo/$TZ" ]; then
+    echo "The time zone '$TZ' (BACKUP_TZ, or the settings' timezone) is none this image knows." >&2
+    exit 1
+  fi
+  export TZ
+  case $AT in
+    [0-1][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
+    *)
+      echo "BACKUP_TIME must be HH:MM (24 hours), not '$AT'." >&2
+      exit 1
+      ;;
+  esac
+  case $KEEP in
+    '' | 0 | *[!0-9]*)
+      echo "BACKUP_KEEP_DAYS must be a number of days (1 or more), not '$KEEP'." >&2
+      exit 1
+      ;;
+  esac
+  case $OWNER_UID$OWNER_GID in
+    '' | *[!0-9]*)
+      echo "BACKUP_UID and BACKUP_GID must be numbers." >&2
+      exit 1
+      ;;
+  esac
+  export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
+}
+
+log() {
+  printf '%s backup: %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$*"
+}
+
+# A command on the backup folder, as its owner (root squashed on an NFS share).
+as_owner() {
+  if [ "$OWNER_UID" = 0 ] && [ "$OWNER_GID" = 0 ]; then
+    "$@"
+  else
+    gosu "$OWNER_UID:$OWNER_GID" "$@"
+  fi
+}
+
+# The live database, as MySQL's root.
+live() {
+  mysql -h mysql -uroot -N -B "$@"
+}
+
+# A text as the inside of a JSON string: backslashes and quotes escaped, line breaks as spaces.
+json_text() {
+  printf '%s' "$1" | tr '\r\n\t' '   ' | sed 's/\\/\\\\/g; s/"/\\"/g'
+}
+
+# When a backup last succeeded, from the status file (milliseconds), or nothing.
+last_ok() {
+  sed -n 's/.*"lastOkAt":\([0-9]*\).*/\1/p' "$STATUS" 2>/dev/null | head -n 1
+}
+
+# write_status <true|false> <reason> <file> <bytes> <seconds>
+write_status() {
+  now=$(($(date +%s) * 1000))
+  if [ "$1" = true ]; then ok_at=$now; else ok_at=$(last_ok); fi
+  mkdir -p "$OPS"
+  {
+    printf '{"finishedAt":%s,"ok":%s' "$now" "$1"
+    if [ -n "$2" ]; then printf ',"reason":"%s"' "$(json_text "$2")"; fi
+    if [ -n "$3" ]; then printf ',"file":"%s"' "$(json_text "$3")"; fi
+    printf ',"bytes":%s,"seconds":%s' "${4:-0}" "${5:-0}"
+    if [ -n "$ok_at" ]; then printf ',"lastOkAt":%s' "$ok_at"; fi
+    printf '}\n'
+  } >"$STATUS.next"
+  mv "$STATUS.next" "$STATUS"
+  if [ "$1" = true ]; then
+    printf 'ok at %s: %s, %s bytes, verified, %s s\n' "$(date '+%Y-%m-%d %H:%M %Z')" "$3" "$4" "$5"
+  else
+    printf 'FAILED at %s: %s\n' "$(date '+%Y-%m-%d %H:%M %Z')" "$(printf '%s' "$2" | tr '\r\n' '  ')"
+  fi >"$SUMMARY"
+}
+
+# A count from the live database; nothing (an error) is a failure, never a zero.
+live_count() {
+  counted=$(live -e "select count(*) from \`$SCHEMA\`.\`$1\`") || return 1
+  case $counted in
+    '' | *[!0-9]*) return 1 ;;
+  esac
+  printf '%s\n' "$counted"
+}
+
+# make_dump <file>: the schema, gzipped, written as the folder's owner. Sets `reason` and fails
+# when mysqldump or the write does.
+make_dump() {
+  rc_file=$(mktemp)
+  # No pipefail in sh: the status of mysqldump and of the write are kept aside.
+  # shellcheck disable=SC2016 # the $1 of the inner sh
+  {
+    mysqldump -h mysql -uroot --single-transaction --quick --routines --triggers --events \
+      --hex-blob --no-tablespaces --set-gtid-purged=OFF --default-character-set=utf8mb4 \
+      "$SCHEMA" 2>"$rc_file.err"
+    echo $? >"$rc_file"
+  } | gzip -6 | as_owner sh -c 'cat >"$1"' sh "$1" || {
+    reason="the dump could not be written to $OUT"
+    rm -f "$rc_file" "$rc_file.err"
+    return 1
+  }
+  rc=$(cat "$rc_file")
+  err=$(tail -n 1 "$rc_file.err")
+  rm -f "$rc_file" "$rc_file.err"
+  if [ "$rc" != 0 ]; then
+    reason="mysqldump failed: ${err:-exit $rc}"
+    return 1
+  fi
+  # A dump that ran to its end says so in its last line.
+  if ! as_owner cat "$1" | gzip -dc | tail -n 1 | grep -q '^-- Dump completed'; then
+    reason="the dump is incomplete (no 'Dump completed' line)"
+    return 1
+  fi
+}
+
+scratch=
+scratch_pid=
+stop_scratch() {
+  if [ -n "$scratch_pid" ]; then
+    MYSQL_PWD='' mysqladmin --socket="$scratch/mysql.sock" -uroot shutdown >/dev/null 2>&1 ||
+      kill "$scratch_pid" 2>/dev/null || true
+    wait "$scratch_pid" 2>/dev/null || true
+    scratch_pid=
+  fi
+  if [ -n "$scratch" ]; then rm -rf "$scratch"; fi
+  scratch=
+}
+
+# The scratch server; its root has no password and listens on a socket only.
+in_scratch() {
+  MYSQL_PWD='' mysql --socket="$scratch/mysql.sock" -uroot -N -B "$@"
+}
+
+# verify_dump <file>: loaded into a scratch server and checked. Sets `verified` when every check
+# passed, `reason` when one failed.
+verify_dump() {
+  mkdir -p "$SCRATCH_DIR"
+  scratch=$(mktemp -d "$SCRATCH_DIR/pine-verify.XXXXXX")
+  chown mysql:mysql "$scratch"
+  if ! mysqld --no-defaults --initialize-insecure --user=mysql --datadir="$scratch/data" \
+    --lower-case-table-names=0 >"$scratch/init.log" 2>&1; then
+    reason="the scratch server could not be made: $(tail -n 1 "$scratch/init.log")"
+    return 1
+  fi
+  # A server that is thrown away: no binary log, no double writes, no flush at every commit.
+  mysqld --no-defaults --user=mysql --datadir="$scratch/data" --socket="$scratch/mysql.sock" \
+    --pid-file="$scratch/mysqld.pid" --log-error="$scratch/error.log" --skip-networking \
+    --mysqlx=OFF --skip-log-bin --innodb-doublewrite=OFF --innodb-flush-log-at-trx-commit=0 \
+    --innodb-buffer-pool-size=128M --lower-case-table-names=0 \
+    --character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci &
+  scratch_pid=$!
+  tries=0
+  until MYSQL_PWD='' mysqladmin --socket="$scratch/mysql.sock" -uroot ping >/dev/null 2>&1; do
+    tries=$((tries + 1))
+    if [ "$tries" -gt 120 ] || ! kill -0 "$scratch_pid" 2>/dev/null; then
+      reason="the scratch server did not start: $(tail -n 1 "$scratch/error.log" 2>/dev/null)"
+      return 1
+    fi
+    sleep 1
+  done
+  if ! in_scratch -e 'create database verify character set utf8mb4 collate utf8mb4_0900_ai_ci'; then
+    reason="the scratch server took no database"
+    return 1
+  fi
+  if ! as_owner cat "$1" | gzip -dc | in_scratch --default-character-set=utf8mb4 verify \
+    2>"$scratch/load.err"; then
+    reason="the dump did not load into a scratch server: $(tail -n 1 "$scratch/load.err")"
+    return 1
+  fi
+  tables="select table_name from information_schema.tables where table_schema = '%s' order by 1"
+  # shellcheck disable=SC2059 # the format is ours
+  if ! live_tables=$(live -e "$(printf "$tables" "$SCHEMA")") || [ -z "$live_tables" ]; then
+    reason="the live database's tables could not be read"
+    return 1
+  fi
+  # shellcheck disable=SC2059
+  dumped_tables=$(in_scratch -e "$(printf "$tables" verify)")
+  if [ "$live_tables" != "$dumped_tables" ]; then
+    reason="the dump's tables differ from the database's"
+    return 1
+  fi
+  if ! printf '%s\n' "$dumped_tables" | grep -qx kysely_migration; then
+    reason="the dump has no kysely_migration table: not a database the bot has migrated"
+    return 1
+  fi
+  if [ "$(in_scratch -e 'select count(*) from verify.kysely_migration')" = 0 ]; then
+    reason="the dump's kysely_migration table is empty"
+    return 1
+  fi
+  for table in $MAIN_TABLES; do
+    printf '%s\n' "$dumped_tables" | grep -qx "$table" || continue
+    if ! in_live=$(live_count "$table"); then
+      reason="the live database's $table table could not be counted"
+      return 1
+    fi
+    in_dump=$(in_scratch -e "select count(*) from verify.\`$table\`")
+    if [ "$in_live" -gt 0 ] && [ "$in_dump" = 0 ]; then
+      reason="the dump's $table table is empty, the database's has $in_live rows"
+      return 1
+    fi
+  done
+  counted=$(for table in $MAIN_TABLES; do
+    printf '%s %s, ' "$table" "$(in_scratch -e "select count(*) from verify.\`$table\`" 2>/dev/null || echo -)"
+  done)
+  log "verified: ${counted%, }"
+  verified=yes
+}
+
+# Takes the lock: a directory that holds the pid of the run that has it. A lock whose run is
+# gone (a container stopped half-way) is taken over. Fails when a live run holds it.
+take_lock() {
+  if mkdir "$LOCK" 2>/dev/null; then
+    echo $$ >"$LOCK/pid"
+    return 0
+  fi
+  holder=$(cat "$LOCK/pid" 2>/dev/null || true)
+  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
+    return 1
+  fi
+  log "taking over the lock of a backup that is gone (pid ${holder:-unknown})"
+  rm -rf "$LOCK"
+  mkdir "$LOCK" && echo $$ >"$LOCK/pid"
+}
+
+release_lock() {
+  rm -rf "$LOCK"
+}
+
+# One backup, verified; a tag gives it a name of its own. Returns 1 when it failed (the day's
+# earlier dump, if any, stays).
+backup_once() {
+  started=$(date +%s)
+  case ${1:-} in
+    '') name="pine-backup-$(date +%Y%m%d).sql.gz" ;;
+    *[!a-z-]*)
+      log "a tag is lower-case letters and hyphens, not '$1'"
+      return 1
+      ;;
+    *) name="pine-backup-$(date +%Y%m%d-%H%M%S)-$1.sql.gz" ;;
+  esac
+  if ! take_lock; then
+    log "a backup is running already"
+    write_status false "a backup was still running when the next was due" "$name" 0 0
+    return 1
+  fi
+  partial="$OUT/.$name.partial"
+  reason=
+  verified=
+  log "dumping $SCHEMA into $OUT/$name"
+  if ! as_owner test -f "$OUT/$MARKER"; then
+    reason="the backup folder has no $MARKER file: is BACKUP_DIR (the share) mounted? Make the file once there by hand."
+  elif ! as_owner test -w "$OUT"; then
+    reason="the backup folder cannot be written as $OWNER_UID:$OWNER_GID (BACKUP_UID, BACKUP_GID)"
+  elif make_dump "$partial" && verify_dump "$partial"; then
+    :
+  fi
+  stop_scratch
+  seconds=$(($(date +%s) - started))
+  if [ -z "$reason" ] && [ "$verified" != yes ]; then
+    reason="the verification stopped half-way"
+  fi
+  if [ -z "$reason" ]; then
+    bytes=$(as_owner cat "$partial" | wc -c | tr -d ' ')
+    as_owner mv "$partial" "$OUT/$name"
+    # Exactly KEEP days: today's and the KEEP - 1 days before. Only this stack's own files.
+    as_owner find "$OUT" -maxdepth 1 -name 'pine-backup-*.sql.gz' -mtime +"$((KEEP - 1))" \
+      -exec rm -f {} + 2>/dev/null || true
+    write_status true '' "$name" "$bytes" "$seconds"
+    log "done: $name, $bytes bytes, verified, in $seconds s"
+    release_lock
+    return 0
+  fi
+  as_owner rm -f "$partial" 2>/dev/null || true
+  write_status false "$reason" "$name" 0 "$seconds"
+  log "FAILED: $reason"
+  release_lock
+  return 1
+}
+
+# Seconds since the epoch of the next BACKUP_TIME.
+next_run() {
+  at=$(date -d "$(date +%Y-%m-%d) $AT" +%s)
+  if [ "$at" -le "$(date +%s)" ]; then
+    at=$(date -d "$(date -d tomorrow +%Y-%m-%d) $AT" +%s)
+  fi
+  echo "$at"
+}
+
+schedule() {
+  # The container just started: no backup of it runs, and what a stopped one left goes.
+  release_lock
+  rm -rf "$SCRATCH_DIR"/pine-verify.*
+  trap 'stop_scratch; exit 0' TERM INT
+  log "a verified backup every day at $AT ($TZ) into $OUT as $OWNER_UID:$OWNER_GID, kept $KEEP days"
+  while :; do
+    at=$(next_run)
+    log "next backup at $(date -d "@$at" '+%Y-%m-%d %H:%M %Z')"
+    # In steps of a minute, so that a stop is quick and a clock change is noticed.
+    while [ "$(date +%s)" -lt "$at" ]; do
+      sleep 60 &
+      wait $! || true
+    done
+    backup_once || true
+  done
+}
+
+main() {
+  case ${1:-} in
+    schedule)
+      setup
+      schedule
+      ;;
+    now)
+      setup
+      trap 'stop_scratch; release_lock; exit 1' TERM INT
+      backup_once "${2:-}"
+      ;;
+    status)
+      if [ -f "$SUMMARY" ]; then cat "$SUMMARY"; else echo "no backup has run yet"; fi
+      ;;
+    *)
+      echo "Usage: backup.sh schedule | now | status" >&2
+      exit 2
+      ;;
+  esac
+}
+
+if [ -z "${BACKUP_SH_LIBRARY:-}" ]; then
+  main "$@"
+fi
diff --git a/pine b/pine
index 0a5d01ea9adea56b32b991907331be691fdcceac..5b7ea9f3ac0befd72289a5ef09de4aed31030dd8 100755
--- a/pine
+++ b/pine
@@ -100,10 +100,11 @@ Usage: ./pine <command>
   logs [service]     follow the logs of the stack, or of the service named
   status             the services and their health
   migrate            run the database migrations only, without starting the bot
-  restore <dump> [--replace] [--start | --no-start]
+  backup             a verified backup now (as the nightly one), into BACKUP_DIR
+  restore <dump> [--replace [--no-backup]] [--start | --no-start]
                      load a dump (.sql or .sql.gz; legacy or Pine) into the stack's database;
-                     --replace drops a database that has tables first; then the stack starts
-                     (logging the bot in) when run on a terminal or with --start
+                     --replace drops a database that has tables, after a verified backup of it;
+                     then the stack starts (logging the bot in) on a terminal or with --start
   help               this list
 EOF
 }
@@ -151,6 +152,12 @@ cmd_status() {
   else
     say "The bot is not running."
   fi
+  if [ -n "$(compose ps --quiet --status running backup 2>/dev/null)" ]; then
+    printf 'The last backup: '
+    compose exec -T backup sh /pine/backup.sh status
+  else
+    say "The backup service is not running: there are no nightly backups."
+  fi
 }
 
 cmd_migrate() {
@@ -179,6 +186,15 @@ check_dump() {
   esac
 }
 
+cmd_backup() {
+  need_stack
+  start_database
+  say "Starting the backup service (it also makes the nightly backups)."
+  run up -d backup
+  say "Making a backup now and verifying it in a scratch server."
+  run exec -T backup sh /pine/backup.sh now
+}
+
 # The database half of a restore, in a one-off container of the bot's image (src/ops/restore-cli.ts).
 restore_step() {
   run run --rm --no-deps pine node --enable-source-maps dist/ops/restore-cli.js "$@"
@@ -188,15 +204,17 @@ cmd_restore() {
   need_stack
   dump=
   replace=
+  no_backup=
   # Starting the stack logs the bot in: by default only for an operator at a terminal.
   start=
   if [ -t 0 ]; then start=yes; fi
   for arg in "$@"; do
     case $arg in
       --replace) replace=--replace ;;
+      --no-backup) no_backup=yes ;;
       --start) start=yes ;;
       --no-start) start= ;;
-      -*) fail "restore does not know '$arg'. Usage: ./pine restore <dump> [--replace] [--start | --no-start]" ;;
+      -*) fail "restore does not know '$arg'. Usage: ./pine restore <dump> [--replace [--no-backup]] [--start | --no-start]" ;;
       *)
         [ -z "$dump" ] || fail "Name one dump only."
         dump=$arg
@@ -216,10 +234,26 @@ cmd_restore() {
   check_dump "$dump"
   build_image
   start_database
-  # Refused here, while the bot still runs, if the database has tables and --replace is missing.
-  restore_step check ${replace:+"$replace"}
-  say "Stopping the bot and its watchdog while the database is replaced."
-  run stop pine watchdog
+  # Refused here, while the bot still runs, if the database has tables and --replace is missing;
+  # with --replace, what it drops is backed up first (3: it has tables).
+  checked=0
+  restore_step check ${replace:+"$replace"} || checked=$?
+  case $checked in
+    0) ;;
+    3)
+      if [ -n "$no_backup" ]; then
+        say "No backup first (--no-backup): the tables are dropped as they are."
+      else
+        say "Backing up the database before --replace drops it (into BACKUP_DIR)."
+        run up -d backup
+        run exec -T backup sh /pine/backup.sh now before-restore ||
+          fail "The backup before --replace failed (it said why above); nothing was stopped or dropped. --no-backup drops the tables without one."
+      fi
+      ;;
+    *) exit "$checked" ;;
+  esac
+  say "Stopping the bot, its watchdog and the backups while the database is replaced."
+  run stop pine watchdog backup
   bot_stopped=yes
   restore_step prepare ${replace:+"$replace"}
   say "Loading $dump into the database; a large dump takes minutes."
diff --git a/src/ops/backup-status.test.ts b/src/ops/backup-status.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c1ec4362852a09980ed146beb07a457e176ae83e
--- /dev/null
+++ b/src/ops/backup-status.test.ts
@@ -0,0 +1,60 @@
+import { spawnSync } from 'node:child_process';
+import { mkdtempSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { readBackupStatus } from './backup-status.js';
+
+const dir = () => mkdtempSync(path.join(tmpdir(), 'pine-backup-status-'));
+const SCRIPT = path.resolve(import.meta.dirname, '../../docker/backup.sh');
+/** The backup script runs under sh: Linux, or Git Bash on Windows. */
+const hasSh = spawnSync('sh', ['-c', 'exit 0']).status === 0;
+
+/** Runs the backup script's own `write_status` (the script sourced as a library). */
+function writeStatus(ops: string, ...args: string[]): void {
+  const run = spawnSync('sh', ['-c', '. "$0"; write_status "$@"', SCRIPT, ...args], {
+    env: { ...process.env, BACKUP_SH_LIBRARY: '1', BACKUP_OPS_DIR: ops },
+    encoding: 'utf8',
+  });
+  expect(run.stderr).toBe('');
+  expect(run.status).toBe(0);
+}
+
+describe('readBackupStatus', () => {
+  it.skipIf(!hasSh)('reads what docker/backup.sh writes after a good run and a failed one', () => {
+    const ops = dir();
+    writeStatus(ops, 'true', '', 'pine-backup-20261016.sql.gz', '729298', '9');
+    const good = readBackupStatus(path.join(ops, 'backup-status.json'));
+    expect(good).toMatchObject({
+      ok: true,
+      file: 'pine-backup-20261016.sql.gz',
+      bytes: 729298,
+      seconds: 9,
+    });
+    expect(good?.lastOkAt).toBe(good?.finishedAt);
+
+    // A reason as MySQL may word it: quotes, a backslash, more than one line.
+    writeStatus(
+      ops,
+      'false',
+      'mysqldump: Got error: 1049: Unknown database \'nosuch\'\nat "C:\\dumps"',
+      'pine-backup-20261017.sql.gz',
+      '0',
+      '0',
+    );
+    expect(readBackupStatus(path.join(ops, 'backup-status.json'))).toMatchObject({
+      ok: false,
+      reason: 'mysqldump: Got error: 1049: Unknown database \'nosuch\' at "C:\\dumps"',
+      // The last good run is kept.
+      lastOkAt: good?.finishedAt,
+    });
+  });
+
+  it('is nothing before the first backup, or for a file it cannot read', () => {
+    const folder = dir();
+    expect(readBackupStatus(path.join(folder, 'backup-status.json'))).toBeUndefined();
+    const broken = path.join(folder, 'broken.json');
+    writeFileSync(broken, '{"ok": "yes"}');
+    expect(readBackupStatus(broken)).toBeUndefined();
+  });
+});
diff --git a/src/ops/restore.db.test.ts b/src/ops/restore.db.test.ts
index 30c0652182af0fd165303c53fd7c946f3cad6331..71908354ffc27008d38454854c8a1eff06556285 100644
--- a/src/ops/restore.db.test.ts
+++ b/src/ops/restore.db.test.ts
@@ -182,8 +182,9 @@ describe('restoreStep', () => {
           "'./pine restore <dump> --replace' drops them first.",
       ],
     });
+    // 3: the database has tables that --replace will drop (the script backs them up first).
     expect(await step(full.db, 'check', '--replace')).toEqual({
-      code: 0,
+      code: 3,
       said: [`The database ${name} has 17 tables: --replace drops them.`],
     });
     expect(await tables(full.database)).toHaveLength(17);
diff --git a/src/ops/restore.ts b/src/ops/restore.ts
index ec7ef3dc39ef7877f7146b1ec904f9f83d8f8fc9..2b734a8ca862213a84aedf1f152370d713549946 100644
--- a/src/ops/restore.ts
+++ b/src/ops/restore.ts
@@ -157,7 +157,7 @@ export function reportLines(report: RestoreReport): string[] {
 /**
  * One step of `restore-cli` (the database half of `./pine restore`), its lines said through
  * `say`; resolves to the exit code: 0 done, 1 refused or failed (with a sentence), 2 a step it
- * does not know.
+ * does not know, 3 (`check --replace`) the database has tables that will be dropped.
  *  - `check [--replace]`: before anything is stopped, whether the dump may be loaded;
  *  - `prepare [--replace]`: an empty database (dropped and made anew with `--replace`);
  *  - `finish`: the table names, and what was loaded; a load the bot cannot take fails.
@@ -172,12 +172,12 @@ export async function restoreStep(
   try {
     if (step === 'check') {
       const { name, tables } = await checkSchema(db, { replace });
-      say(
-        tables > 0
-          ? `The database ${name} has ${tables} tables: --replace drops them.`
-          : `The database ${name} is empty.`,
-      );
-      return 0;
+      if (tables === 0) {
+        say(`The database ${name} is empty.`);
+        return 0;
+      }
+      say(`The database ${name} has ${tables} tables: --replace drops them.`);
+      return 3;
     }
     if (step === 'prepare') {
       const name = await schemaName(db);
````

### Task 7: Plan 9A T7: The pine script: deploy-commands, update, shell

Prototype commit: `6a828802cacc2317e8c584c611a6ec884e2f0e73`

The operator script gets its last commands: deploy-commands [--global | --guild <id>]
(the deploy CLI in a one-off container, everywhere by default), update (refuses when the
clone has changes of its own, then git pull --ff-only, a new image, a verified backup of a
database that has tables, tagged before-update, and up -d; a failed backup stops it before
anything starts) and shell (a shell in the running bot's container, or in one of its own).
The dispatch is a function, so that sh has read it whole before update replaces the file.

Checked: shellcheck (koalaman/shellcheck, as sh) is clean, and help and the refusals run
under dash (Debian's sh) and Git Bash.

**Files:**

```
 pine | 85 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------------
 1 file changed, 73 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 6a828802cacc2317e8c584c611a6ec884e2f0e73 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T7: The pine script: deploy-commands, update, shell`, the body above and the trailer, staging exactly
  `pine`.

````diff
diff --git a/pine b/pine
index 5b7ea9f3ac0befd72289a5ef09de4aed31030dd8..824bac3c6a279de67ad49a4f7ad995a5d489f9e9 100755
--- a/pine
+++ b/pine
@@ -105,6 +105,11 @@ Usage: ./pine <command>
                      load a dump (.sql or .sql.gz; legacy or Pine) into the stack's database;
                      --replace drops a database that has tables, after a verified backup of it;
                      then the stack starts (logging the bot in) on a terminal or with --start
+  deploy-commands [--global | --guild <id>]
+                     register the slash commands with Discord (everywhere by default)
+  update             fetch the newest code (git pull), rebuild, back up the database and
+                     restart what changed
+  shell              a shell in the bot's container
   help               this list
 EOF
 }
@@ -195,6 +200,56 @@ cmd_backup() {
   run exec -T backup sh /pine/backup.sh now
 }
 
+cmd_deploy_commands() {
+  need_stack
+  [ $# -gt 0 ] || set -- --global
+  build_image
+  say "Registering the slash commands with Discord ($*)."
+  run run --rm --no-deps pine node --enable-source-maps dist/discord/deploy-cli.js "$@"
+}
+
+cmd_update() {
+  need_stack
+  command -v git >/dev/null 2>&1 || fail "git is not installed: update fetches the code with git."
+  git rev-parse --git-dir >/dev/null 2>&1 || fail "This folder is not a git clone: update needs one."
+  # The installation's own files (.env, pine-settings.json) are not the repository's; a change
+  # to the repository's would be lost or conflict.
+  changes=$(git status --porcelain --untracked-files=no)
+  if [ -n "$changes" ]; then
+    fail "This clone has changes of its own ('git status' lists them): commit or undo them first."
+  fi
+  say "Fetching the newest code."
+  say "> git pull --ff-only"
+  git pull --ff-only || fail "git could not bring the code up to date (it said why above)."
+  build_image
+  # The new version may migrate the database: a verified backup of it comes first.
+  start_database
+  has_tables=0
+  restore_step check --replace >/dev/null || has_tables=$?
+  case $has_tables in
+    0) say "The database is empty: there is nothing to back up before the update." ;;
+    3)
+      say "Backing up the database before the new version starts (into BACKUP_DIR)."
+      run up -d backup
+      run exec -T backup sh /pine/backup.sh now before-update ||
+        fail "The backup before the update failed (it said why above): the new version is built but not started. './pine up' starts it anyway."
+      ;;
+    *) exit "$has_tables" ;;
+  esac
+  say "Restarting what changed; the bot's migrator brings the database up to date."
+  run up -d
+}
+
+cmd_shell() {
+  need_stack
+  if [ -n "$(compose ps --quiet --status running pine 2>/dev/null)" ]; then
+    run exec pine sh
+  else
+    say "The bot is not running: a shell in a container of its own instead."
+    run run --rm --no-deps pine sh
+  fi
+}
+
 # The database half of a restore, in a one-off container of the bot's image (src/ops/restore-cli.ts).
 restore_step() {
   run run --rm --no-deps pine node --enable-source-maps dist/ops/restore-cli.js "$@"
@@ -277,16 +332,22 @@ cmd_restore() {
   fi
 }
 
-[ $# -gt 0 ] || {
-  usage
-  exit 1
+# Runs the command named first. A function, so that sh has read all of it before it runs: `update`
+# replaces this file while it runs (git writes a new file, so the rest read is the old one's).
+main() {
+  [ $# -gt 0 ] || {
+    usage
+    exit 1
+  }
+  name=$1
+  shift
+  case $name in
+    *[!a-z-]*) fail "There is no command '$name'. './pine help' lists them." ;;
+  esac
+  handler=cmd_$(printf '%s' "$name" | tr '-' '_')
+  command -v "$handler" >/dev/null 2>&1 ||
+    fail "There is no command '$name'. './pine help' lists them."
+  "$handler" "$@"
 }
-name=$1
-shift
-case $name in
-  *[!a-z-]*) fail "There is no command '$name'. './pine help' lists them." ;;
-esac
-handler=cmd_$(printf '%s' "$name" | tr '-' '_')
-command -v "$handler" >/dev/null 2>&1 ||
-  fail "There is no command '$name'. './pine help' lists them."
-"$handler" "$@"
+
+main "$@"
````

### Task 8: Plan 9A T8: Docs and CI: operations.md, Run with Docker, a CI job for the stack

Prototype commit: `15f843b94811c308eb5e0fad11cfbe65aca49107`

docs/architecture/operations.md is the area file of the stack: the rule that a host needs
only Docker and git and which ./pine commands log the bot in, the image, compose.yaml and its
decisions (lower_case_table_names=0, the grace period, what .env gives whom, no profile for
an external MySQL), the heartbeat, its phases and the health check's kinds, the owner's
alerts and the crash marker, the watchdog, what it restarts and what it only tells, and why
it may have the Docker socket (a socket proxy as later hardening), backups (the marker, the
owner's ids for NFS, the scratch volume's room) and restore, and the open items (MySQL 8.0's
end of life, arm64). CLAUDE.md's hard rule names the ./pine commands that log the bot in,
and it lists the area file and the ./pine commands beside the npm ones; testing.md names the
new fakes; the README gets a short "Run with Docker".

ci.yml gets a docker job (never run: nothing is pushed): shellcheck of the scripts, the
image built and every migration run on the stack's own MySQL by ./pine migrate with dummy
settings (the migrations run before any login, so the token is never used), the count of
applied migrations compared with the migration files.

**Files:**

```
 .github/workflows/ci.yml        | 35 +++++++++++++++++++++++++++++++++
 CLAUDE.md                       | 15 ++++++++++++++-
 README.md                       | 29 ++++++++++++++++++++++++----
 docs/architecture/operations.md | 64 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/architecture/testing.md    |  4 ++++
 5 files changed, 142 insertions(+), 5 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 15f843b94811c308eb5e0fad11cfbe65aca49107 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 9A T8: Docs and CI: operations.md, Run with Docker, a CI job for the stack`, the body above and the trailer, staging exactly
  `.github/workflows/ci.yml CLAUDE.md README.md docs/architecture/operations.md docs/architecture/testing.md`.

````diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index c9995330e996bff2808e57a1989157c60c5097c9..1ab634404feb6215d315c009bc13bb54af11ad08 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -21,3 +21,38 @@ jobs:
       - name: Generated database types are current
         run: npm run db:codegen -- --verify
       - run: npm run build
+
+  # The Docker stack: the image builds, the operator scripts pass shellcheck, and a new install
+  # on the stack's own MySQL runs every migration. The migrations run before any login, so the
+  # dummy token below is never used: nothing contacts Discord.
+  docker:
+    runs-on: ubuntu-latest
+    steps:
+      - uses: actions/checkout@v5
+      - name: Shell scripts
+        run: docker run --rm -v "$PWD:/mnt:ro" koalaman/shellcheck:stable -s sh /mnt/pine /mnt/docker/backup.sh
+      - name: Settings of the stack (dummy values)
+        run: |
+          cat > .env <<'ENV'
+          DISCORD_TOKEN=not-a-token
+          DISCORD_APP_ID=123456789012345678
+          OWNER_ID=223456789012345678
+          DB_USER=pine
+          DB_PASSWORD=ci-pine
+          DB_SCHEMA=pine
+          DB_ROOT_PASSWORD=ci-root
+          POKEMON_IMAGE_BASE=https://images.example/pokemon/
+          ENV
+          cp data/settings.json pine-settings.json
+      - name: Image and migrations on a new install
+        run: ./pine migrate
+      - name: Every migration was recorded
+        run: |
+          applied=$(docker compose exec -T mysql sh -c \
+            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -B -e "select count(*) from pine.kysely_migration"')
+          expected=$(ls src/db/migrations/2*.ts | grep -vc '\.test\.ts$')
+          echo "migrations applied: $applied of $expected"
+          test "$applied" -eq "$expected"
+      - name: Stop the stack
+        if: always()
+        run: docker compose down --volumes
diff --git a/CLAUDE.md b/CLAUDE.md
index 7236ce1a86c6ec3422e1f3a482036484f87e227b..2ccdcaf50ccad79fa72242d30716c899beaf1d08 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -5,7 +5,7 @@ Discord bot for organising Pokémon Go raids. It is being rewritten from legacy
 ## Hard rules
 
 - **Never push.** All migration work stays local on branch `typescript-migration` until every phase is complete. No `git push`, no PRs, nothing that runs GitHub CI.
-- **Never contact Discord unasked.** Do not start the bot (`npm start`, `npm run dev`) or run `npm run deploy-commands` unless Matt asks; there is a live production bot.
+- **Never contact Discord unasked.** Do not start the bot (`npm start`, `npm run dev`, or in the Docker stack `./pine up`, `./pine restart`, `./pine update`, `./pine restore` without `--no-start`) or run `npm run deploy-commands` / `./pine deploy-commands` unless Matt asks; there is a live production bot.
 - **Do not edit or delete legacy JS** (`app/`, `commands/`, `types/`, `index.js`) unless a plan task says so. Production still runs it from `main-dev`; it is removed at cutover (phase 8).
 - Database changes are additive only. `knex_migrations` is read, never written; Kysely tracks its own migrations in `kysely_migration`.
 
@@ -64,6 +64,18 @@ npm run ocr:check -- <folder> [--labels <file>] [--baseline <file>] [--write-bas
 npm run ocr:review -- <folder> [--show-text]   # triage of a review folder: what members said was wrong, and where (their texts and ids only with --show-text)
 ```
 
+The Docker stack (`compose.yaml`; a host needs only Docker and git) is run with `./pine`, never with Node on the host:
+
+```bash
+./pine down | logs [service] | status   # stop the stack; follow its logs; the services, the bot's health and the last backup
+./pine up | restart [service]   # start the stack: logs the bot in, only when Matt asks
+./pine migrate               # the migrations in a one-off container, without the bot (no Discord)
+./pine backup                # a verified backup now, into BACKUP_DIR (which needs its .pine-backups file)
+./pine restore <dump> --no-start [--replace [--no-backup]]   # load a legacy or Pine dump (.sql or .sql.gz), lower-case tables renamed; without --no-start on a terminal, or with --start, it logs the bot in
+./pine deploy-commands [--global | --guild <id>]   # contacts Discord: only when Matt asks
+./pine update | shell        # git pull, rebuild, backup, restart (logs the bot in: only when Matt asks); a shell in the bot's container
+```
+
 Format the files you touch with `npx prettier --write <files>`; `format:check` is part of `check`.
 
 ## Conventions
@@ -133,6 +145,7 @@ Each file under `docs/architecture/` holds the conventions of one subsystem. Rea
 - `wayfarer.md`: the export file, S2 cells, the scan, the userscript, matching, `/gym import` and `/gym review`. Read before changing the Wayfarer work.
 - `members-and-roles.md`: member settings and rows, member lookups and viewers, self-assigned roles. Read before changing members or roles.
 - `utilities.md`: game data, the catalogue, Pokémon search, raid tiers and bosses, nicknames, pictures, emoji, `/rank`, `/counters`, `/find-gym`, `/request`, `/maps`, `/help`. Read before changing any of these.
+- `operations.md`: the Docker image and stack, `./pine`, the heartbeat and health check, the owner's alerts and the crash marker, the watchdog, backups, restore. Read before changing `Dockerfile`, `compose.yaml`, `pine`, `docker/` or `src/ops/`.
 - `testing.md`: the test database, fake interactions, the fake gateway, party, train and Wayfarer helpers. Read before writing tests.
 
 ## Gotchas
diff --git a/README.md b/README.md
index 361fb243c22649f7c13a5ede7d1f5aec64545a88..460df69aad7200f3daf1260d36203fa592185d94 100644
--- a/README.md
+++ b/README.md
@@ -8,11 +8,32 @@ see `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`
 
 ## Requirements
 
-- Node 24
-- MySQL 8 with either the existing Professor Pine database (the legacy bot must have applied all its migrations) or an empty schema for a new install
-- Docker, for the database tests and for `db:codegen` / `db:legacy-fixture`
+- To run Pine: Docker with Compose, and git (see "Run with Docker"); nothing else on the host
+- To develop, or to run without Docker:
+  - Node 24
+  - MySQL 8 with either the existing Professor Pine database (the legacy bot must have applied all its migrations) or an empty schema for a new install
+  - Docker, for the database tests and for `db:codegen` / `db:legacy-fixture`
 
-## Setup
+## Run with Docker
+
+A host needs only Docker (with Compose) and git. Everything runs through `./pine`
+(`./pine help` lists the commands; on Windows, in Git Bash with Docker Desktop):
+
+1. Clone the repository and copy `.env.example` to `.env`; fill in the Discord values, the
+   database user, password and schema, `DB_ROOT_PASSWORD` and `BACKUP_DIR`. Make the backup
+   folder's marker once: `touch <BACKUP_DIR>/.pine-backups`.
+2. Copy `data/settings.json` to `pine-settings.json` (beside `compose.yaml`, git-ignored) and
+   review it, especially `timezone`.
+3. A new install: `./pine up` creates the database and starts the bot, MySQL, the watchdog and
+   the nightly backups. Taking over an existing database: `./pine restore <dump.sql>` first
+   (`--replace` over a database that has tables; it is backed up first).
+4. `./pine deploy-commands` registers the slash commands (`--guild <id>` for one server).
+5. `./pine status` shows the services, the bot's health and the last backup; `./pine logs pine`
+   follows the bot; `./pine update` brings a new version.
+
+The details (health checks, the watchdog, backups and restore): `docs/architecture/operations.md`.
+
+## Setup without Docker
 
 1. `npm ci`
 2. Copy `.env.example` to `.env` and fill it in.
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
new file mode 100644
index 0000000000000000000000000000000000000000..577cafb192cf2abc09ed044463115fc5d6bfd099
--- /dev/null
+++ b/docs/architecture/operations.md
@@ -0,0 +1,64 @@
+# Operations
+
+How Pine runs: the Docker stack, the image, the operator script `./pine`, the bot's health and its alerts to the owner, the watchdog, backups and restore. Read before changing `Dockerfile`, `compose.yaml`, `pine`, `docker/` or `src/ops/`.
+
+## The rule
+
+- A host needs Docker (with Compose) and git, nothing else: no Node, npm or MySQL client. Every operator step is `./pine <command>`, a POSIX `sh` script at the repository root that wraps `docker compose`; it runs on Debian (dash) and in Git Bash on Windows (Docker Desktop). It uses only what every such shell has besides (`gzip`, `tail`, `sed`). A step that would need anything else on the host is wrong.
+- The script is checked with `shellcheck -s sh` (the `koalaman/shellcheck` image) and kept LF by `.gitattributes`, as is every `*.sh`. It exports `MSYS_NO_PATHCONV=1`, so Git Bash leaves container paths (`/pine/backup.sh`) alone. A command is a function `cmd_<name>` (a hyphen is an underscore) plus a line of `usage`; nothing else needs to know of it; the dispatch is a function, read whole before `update` replaces the file. Each command says what it does and runs Compose through `run`, which prints the command first; errors are plain sentences through `fail`; a command that stopped the bot and then fails says "The bot is stopped: './pine up' starts it again." A path the operator gives (a dump) is read from where they ran the script.
+- The commands that log the bot in to Discord are `up`, `restart`, `update`, `restore` (when it starts the stack) and `deploy-commands`; `migrate`, `backup`, `restore --no-start`, `status`, `logs`, `down` and `shell` do not. `restore` starts the stack only on a terminal or with `--start`.
+- The installation's own files are git-ignored and beside `compose.yaml`: `.env` (secrets) and `pine-settings.json` (the settings, made from `data/settings.json`; the converter of plan 8C later). `./pine` refuses to run without either and says how to make them; the repository's `data/settings.json` is never the installation's, so `update` finds no change of its own. `PINE_ENV_FILE`, `PINE_SETTINGS` and `COMPOSE_PROJECT_NAME` (default `pine`, the `name:` of `compose.yaml`) give a second stack on the same machine its own files and volumes (a rehearsal, a scratch stack).
+
+## The image
+
+- `Dockerfile`: multi-stage on `node:24-slim`. The build stage runs `npm ci --ignore-scripts` and `npm run build`; the runtime stage has the production dependencies (also without install scripts: none is needed for the CPU, as in the checkout), `dist/`, `package.json` (it says the files are ES modules) and the default `data/settings.json`. onnxruntime-node keeps its library for the image's platform only (`TARGETARCH`: linux x64, or arm64; arm64 is untested). Runs as `node`, `NODE_ENV=production`, `node --enable-source-maps dist/index.js`, `STOPSIGNAL SIGTERM`. About 490 MB unpacked.
+- The runtime reads from disk only its settings and what it keeps under `var/`: no `assets/`, `lang-data/` (the legacy bot's tesseract data) or the other `data/*.json`, and no legacy JavaScript. `.dockerignore` lets in only what the build needs (never `.env`, `var/`, `.git`, `node_modules`).
+- `var/` is a volume (`pine-var`), writable by `node` because the image's folder is: the game data cache, map pictures, the screen reader's models (downloaded at first use) and screenshots, and the health files.
+- The one-off commands run in the same image: `dist/db/migrate-cli.js`, `dist/discord/deploy-cli.js`, `dist/ops/restore-cli.js`, `dist/ops/health-cli.js`, and the watchdog `dist/ops/watchdog-cli.js`. The tsx scripts of `scripts/` are not in the image; `emoji:upload` and `role-auth:export` become compiled CLIs with `./pine` commands in plan 8C.
+
+## The stack
+
+- `compose.yaml`, project `pine`: `mysql` (`mysql:8.0`, volume `mysql-data`, utf8mb4 with `utf8mb4_0900_ai_ci`, healthcheck by `mysqladmin ping` over TCP), `pine` (the bot), `watchdog`, `backup`, and a commented `cloudflared` slot for plan 8M (the bot's web server on `0.0.0.0` inside the network, its port never published, the tunnel token from `.env`). No service publishes a port.
+- `lower_case_table_names=0` (Linux's default, set explicitly; it can only be set when the data directory is made): table names are case sensitive, the bot's are mixed case (`Guild`, `GymMeta`), and a dump of the stack loads unchanged into any server that keeps case (the test containers, another Linux host). A dump from MySQL on Windows has lower-case names; `./pine restore` renames them, and the migrator refuses such a database on a case-sensitive server before writing anything.
+- There is no profile for an external MySQL (spec 9.2's is dropped): an instance restores its dump into the stack instead.
+- `.env` is read by Compose for the values of `compose.yaml` and handed whole to the bot (`env_file`). Inside the stack the bot reaches MySQL as `mysql:3306` whatever `.env` says (`DB_HOST`, `DB_PORT` are set by the compose file); `DB_USER`, `DB_PASSWORD`, `DB_SCHEMA` also create the user and the database on MySQL's first start, `DB_ROOT_PASSWORD` is root's and is blanked for the bot. `pine-settings.json` is mounted read-only.
+- `pine` waits for a healthy `mysql`, runs under `init: true` (tini hands it SIGTERM and reaps the screen reader's process), restarts `unless-stopped`, and has `stop_grace_period: 2m30s`: the shutdown steps of `src/app.ts` have limits that add up to two minutes (the queued DMs alone fifteen seconds). A new step there means checking that sum, and the watchdog's restart (`?t=150`).
+- A new install is `./pine up` on empty volumes: the migrator's new-install path creates the schema.
+
+## Health
+
+- No listener: the bot writes `var/health/status.json` every thirty seconds from the start of `startApp` on (`Heartbeat`, `src/ops/heartbeat.ts`): when; the phase, `starting` until the login to Discord begins (`loggingIn`), then `running`; since when the client is connected to Discord or not; whether the database answered `select 1` within ten seconds. Connected means every shard of `client.ws.shards` is `Ready` and Discord acknowledged its heartbeat within three minutes (`gatewayConnected`): never `client.ws.status`, which discord.js sets to ready once and never back. Written whole (a temporary file renamed). The heartbeat stops just before the database pool closes at shutdown.
+- `node dist/ops/health-cli.js` reads it and prints one line, its kind first (`healthLine`: `healthy`, `starting`, `stale`, `missing`, `unreadable`, `slow-start`, `gateway`, `database`), and exits 0 or 1 (`healthVerdict`, `src/ops/health.ts`): unhealthy when the file is missing or older than 90 seconds (a stuck or stopped bot), when the database did not answer the last check, when Discord has been away for more than five minutes after the login began, or when the start has taken more than half an hour. A start with a fresh heartbeat is healthy however long its migrations take. It is the healthcheck of `pine` (every 30 s, 3 retries, a start period of ten minutes) and a line of `./pine status`. A later rehearsal mode adds its own field to the file and says it there.
+- A SIGTERM or SIGINT during the start ends it after the step under way, never in the middle of the migrations (`startCheckpoint`, `src/ops/start-stop.ts`), cleanly: no crash marker is left. Docker's grace still bounds it.
+
+## Alerts to the owner
+
+- `OwnerAlerts` (`src/ops/owner-alerts.ts`) DMs `OWNER_ID` through Discord's REST API with the bot's token: opens the DM channel, posts plain text with no mentions; times as `<t:…:f>`, so Discord shows them in the reader's zone. Not through `DmSender`: it works without the gateway and from an exit path. `send(kind, text)` never throws, gives up after five seconds (one try), logs a failure, and sends one alert of a kind per fifteen minutes; the stamp is taken before the alert goes (a second one meanwhile is held back) and given back when it fails. The bot keeps the stamps in `var/health/alerts.json` (`FileStamps`) so that a crash loop does not spam; the watchdog in the `ops` volume. `ownerAlertsFrom(env)` needs only `DISCORD_TOKEN` and `OWNER_ID`, so it works before the config is read.
+- `src/index.ts`: on a fatal end (the gateway closed for good, an uncaught exception, a start that failed after the config was read) the bot DMs `Professor Pine <what>: <first line of the error>`, then shuts down and exits 1 as before. A config error sends nothing (the operator sees it at the console) but is recorded.
+- `CrashRecord` (`src/ops/crash-record.ts`): a marker `var/health/running.json` written at every start and removed at a clean shutdown (SIGTERM, SIGINT, also during the start); the error that ends a run is kept in it. A start that finds the marker DMs "restarted after a crash at <time>: <error, or none recorded>. Restart n in the last hour." (the time is the error's, or the last heartbeat's; the restarts after a crash are kept in `var/health/restarts.json`).
+
+## The watchdog
+
+- A service of its own: the bot's image with `node dist/ops/watchdog-cli.js`, the Docker socket mounted, root inside, and only the environment it needs (`DISCORD_TOKEN`, `OWNER_ID`, `LOG_LEVEL`, `WATCHDOG_*`): no database password. Every thirty seconds it asks the Engine's API (Node's `http` over the socket, `SocketDockerApi`, no client library; ten seconds for a question, the stop's 150 seconds and more for a restart) for the `pine` container of its own Compose project (read from its own container's labels; `WATCHDOG_PROJECT` overrides), skipping one-off containers.
+- It reads the kind at the start of the health check's last line. `stale` or `missing` (or a line without a kind: the check itself timed out) for `WATCHDOG_UNHEALTHY_MINUTES` (5) while running: it restarts the container (`?t=150`) and DMs the owner with that line. `database`, `gateway`, `slow-start`, `unreadable` for `WATCHDOG_ALERT_MINUTES` (15): it DMs once per unhealthy spell and leaves the bot running, since a restart mends none of them. A starting bot is healthy and never restarted. `WATCHDOG_RESTARTS` (3) restarts by Docker's policy within `WATCHDOG_RESTART_WINDOW_MINUTES` (30): it DMs that the bot keeps restarting and leaves it to Docker. Backups are watched only where the project has a `backup` service: a failed backup, one DM per failure (one older than a day found at its own start is not told again); no good backup for `WATCHDOG_BACKUP_HOURS` (26), a DM at most twice a day. What it told (`/ops/watchdog-state.json`) and its alert stamps (`/ops/watchdog-alerts.json`) survive its own restarts. It never restarts any other container, a one-off one or a stopped bot.
+- The socket gives the watchdog control of Docker on the host, which is root on the host in effect. Accepted for a home server with one operator: a stuck bot (a blocked event loop, a hung connection) cannot restart itself, a self-kill from inside the bot would need the very event loop that is stuck, and Docker's restart policy acts only on an exit. Hardening for later: a socket proxy (such as `tecnativa/docker-socket-proxy`) that lets through only listing, inspecting and restarting containers. Never mount the socket into the bot itself.
+- Tests: `Watchdog` against `FakeDockerApi` (`test/support/fake-docker.ts`), `SocketDockerApi` against a fake Engine on a local socket (a named pipe on Windows), alerts through `FakeAlertRest` (`test/support/fake-rest.ts`, which refuses what Discord refuses).
+
+## Backups
+
+- A `backup` service on the `mysql:8.0` image runs `docker/backup.sh` (mounted from the checkout): a POSIX `sh` loop that makes a backup every day at `BACKUP_TIME` (03:30) in `BACKUP_TZ`, or the zone of the settings' `timezone` when that is blank (a zone the image does not know stops the service with a sentence). The image's own `mysqldump` (never MariaDB's client against MySQL 8) dumps `DB_SCHEMA` as root (`--single-transaction --hex-blob --routines --triggers --events`, no `USE` line, so it loads into any schema name), gzipped, as `pine-backup-YYYYMMDD.sql.gz` into `BACKUP_DIR` on the host (one a day; a second run that day replaces it). Only files of that name are ever deleted: those older than `BACKUP_KEEP_DAYS` (90) days, so that exactly that many days are kept.
+- The backup folder must hold a file `.pine-backups`, made once by hand: without it (a share that is not mounted, so an empty local folder) every backup fails with that reason and the watchdog tells the owner. Every file in the folder is written, read and deleted as `BACKUP_UID:BACKUP_GID` (`gosu`; root by default). For an NFS share (Pittsburgh's Synology), the host mounts it at `BACKUP_DIR` (`/etc/fstab`, `_netdev`), the share's folder belongs to a user of the NAS, and `BACKUP_UID` / `BACKUP_GID` are that user's ids, so that a share that squashes root still takes the files; the guide of plan 8L-2 covers the mount.
+- Every dump is verified before it takes its name: a second `mysqld` (no binary log, no double writes, no flush per commit) with a temporary data directory in the `backup-scratch` volume loads it; its tables must equal the live ones, `kysely_migration` must have rows, and `Guild`, `Region`, `Gym`, `User` must have rows where the live ones do (a count the live database does not give is a failure). Then the scratch server is thrown away; what a stopped run left there goes at the next start. The volume needs room for the database about twice over, on the host's Docker disk. A failed run keeps the day's earlier dump.
+- One backup at a time: a lock holding the pid of its run (a lock whose run is gone is taken over). A scheduled run that finds one running records a failure ("a backup was still running").
+- The result goes to the log and to `/ops/backup-status.json` in the `ops` volume (`readBackupStatus`, `src/ops/backup-status.ts`, is the watchdog's reader; `backup-status.test.ts` runs the script's own `write_status`, sourced with `BACKUP_SH_LIBRARY`), with a line for `./pine status`. `./pine backup` runs one now through the same code (`backup.sh now`). `restore --replace` (of a database with tables) and `update` make one before they change the database (`backup.sh now before-restore` / `before-update`: a file of its own, `pine-backup-YYYYMMDD-HHMMSS-<tag>.sql.gz`, so that it never replaces the day's backup, which may be the very dump being restored), and stop when it fails.
+
+## Restore
+
+- `./pine restore <dump.sql | dump.sql.gz> [--replace [--no-backup]] [--start | --no-start]`, in this order, nothing stopped until the dump is known good: the dump must be whole (`gzip -t`) and end with mysqldump's `-- Dump completed` line; `mysql` is started alone; `restore-cli.js check` refuses a database that has tables without `--replace` (with it, exit 3: a verified backup of it is made first, unless `--no-backup`). Then `pine`, `watchdog` and `backup` are stopped; `restore-cli.js prepare` drops the database and creates it anew (utf8mb4); the dump is streamed from the file into the `mysql` container's own client as root (`docker compose exec -T`, never copied; gzip's status kept, as sh has no pipefail); `restore-cli.js finish` renames lower-cased tables to the bot's names in one `RENAME TABLE` (the foreign keys follow; `canonicalRenames`, `src/db/table-names.ts`) and prints what was loaded: legacy or Pine, the tables, the rows of the main ones. A legacy database without its last migration is reported as the migrator's refusal and fails, as does an empty or unknown one. Then the stack starts (on a terminal, or with `--start`) and the migrator takes the database over or migrates it.
+- `restoreStep` (`src/ops/restore.ts`) is the CLI's logic, tested against MySQL with its exit codes. `PINE_TABLES` lists every table the bot knows (the legacy ones from the generated baseline); a migration that adds a table adds it there, or `restore.db.test.ts` fails.
+- `./pine migrate` runs the migrations in a one-off container without starting the bot: no Discord. It is how a restored copy is checked without logging in.
+
+## Open items
+
+- MySQL 8.0 reached its end of life in April 2026 (review B13): the stack and the tests stay on `mysql:8.0`, as the spec says, until Matt decides on 8.4.
+- arm64 images are built the same way but untested.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index b1287f739860fc65aa8b91515698759687d90322..a17ea2c21f272da032c4f8eb24d7d11cfd5bc68b 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -33,3 +33,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Wayfarer
 
 - Wayfarer tests: the import and the queue over gym administration on fakes are `wayfarerImportWith()` (`test/support/wayfarer-import.ts`: `wayfarer`, `wayfarerReview`, `wayfarerStore`, `admin`, `directory`, `removal`), which `gymCommandsWith()` routes like the bot; `createTestContext`'s own `wayfarer` and `wayfarerReview` throw when used. Exports in tests are built from invented Wayspots at the invented gyms, their cells by `wayfarerCellAt`.
+
+## Operations
+
+- The owner's alerts are tested through `FakeAlertRest` (`test/support/fake-rest.ts`: Discord's REST API as `OwnerAlerts` uses it, recording each request and refusing an empty or too long message; `failWith` an error or `'hang'`), the watchdog against `FakeDockerApi` (`test/support/fake-docker.ts`: containers by Compose labels, `composeLabels(project, service)`, restarts recorded). The Docker Engine fake of `docker-api.test.ts` answers on a local socket (a named pipe on Windows); its slow restart and its stuck question are timed by fake timers once the request arrived (`Tally`). Health, crash marker and backup status tests write their files into a `mkdtemp` folder; `backup-status.test.ts` runs `write_status` of `docker/backup.sh` (sourced with `BACKUP_SH_LIBRARY`) and is skipped where there is no `sh`. The rest of the scripts of the stack (`pine`, `docker/backup.sh`) is checked with `shellcheck -s sh` and a scratch stack (`operations.md`).
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-9a HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-16-phase-9a-docker-stack.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other. No test of this plan waits on real time, so no ten runs.
2. The final fix wave: the third review's R1–R11 (`.superpowers/sdd/2026-10-16-phase-9a-docker-stack/progress.md`; backups that can be switched off, a refused manual run records nothing, a second signal during the start, crashes during the start alerted, restart and alert clocks apart, a faster shell test, `update`'s silent failure, `WATCHDOG_INTERVAL_SECONDS`, the other refusal's log line, retention failures and `.partial` leftovers reported, the note in its section) and a test of a stale backup lock taken over.
3. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 9A": the decisions above for Matt, what only the real host shows, what was left open), the Gantt chart and memory.

## Staging checklist (on Docker Desktop first, then the new host; each step with Matt's go-ahead)

1. `cp data/settings.json pine-settings.json` (or the test server's settings), a `.env` with the dev application, `DB_ROOT_PASSWORD`, `BACKUP_DIR` pointing at a folder with a `.pine-backups` file.
2. `./pine restore <a copy of the dev database or production's dump> --no-start`, then `./pine migrate`: counts as expected.
3. `./pine up` (logs the dev bot in): `./pine status` shows healthy within a minute; the bot answers on the test server.
4. Stop the bot's network for six minutes (or pause its container): `gateway` alert DM to the owner, no restart; resume: healthy again.
5. `docker compose pause pine` for six minutes: the watchdog restarts it and DMs.
6. `./pine backup`: a verified file in `BACKUP_DIR`; remove the marker: the next run fails and the owner gets a DM.
7. `docker kill pine` (a crash): the next start DMs "restarted after a crash".
8. `./pine down`; `./pine update` on a clean checkout: a backup tagged `before-update`, then the stack back up.
9. On the Debian host: the NFS share mounted, `BACKUP_UID` its owner, one night's backup verified.
