# Professor Pine Discord Bot

Pokémon GO raid coordination for Discord: each raid, train and meetup is a post in its region's
forum, members sign up with buttons and slash commands, and get direct messages for the bosses
and gyms they want. Pine is written in TypeScript on discord.js 14 and needs no privileged
intents. The legacy JavaScript bot (discord.js-commando, `!` commands) lives on the `legacy`
branch and is no longer maintained; the rewrite's design is
`docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md`.

### Official Discord server (setup help, support, feedback, etc.)

- https://discord.com/invite/8FkjJVe

## Running your own Pine

- **Running the legacy bot?** Discord takes the privileged intents it depends on from
  applications with 10,000 users or more that were not reviewed.
  [Moving a legacy Professor Pine](docs/guides/migrating-a-legacy-instance.md) says whether and
  when you are affected, what to do if you cannot move in time, and how to move, keeping your
  database.
- **Starting fresh?** [Starting a new Pine instance](docs/guides/new-instance.md) goes from the
  Discord application to the first raid.
- The quick start below is the short version of both.

## Requirements

- To run Pine: Docker with Compose, and git (see "Run with Docker"); nothing else on the host
- To develop, or to run without Docker:
  - Node 26
  - MySQL 8 with either the existing Professor Pine database (the legacy bot must have applied all its migrations) or an empty schema for a new install
  - Docker, for the database tests and for `db:codegen`

## Run with Docker

A host needs only Docker (with Compose) and git. Everything runs through `./pine`
(`./pine help` lists the commands; on Windows, in Git Bash with Docker Desktop):

1. Clone the repository and copy `.env.example` to `.env`; fill in the Discord values, the
   database user, password and schema, `DB_ROOT_PASSWORD` and `BACKUP_DIR`. Before the first
   `./pine up`, make the backup folder and its marker once, as the folder's owner (on an NFS
   share, the share's), with the stack's name in it:
   `mkdir -p <BACKUP_DIR> && echo pine > <BACKUP_DIR>/.pine-backups` (a blank `BACKUP_DIR`
   switches backups off).
2. Copy `data/settings.json` to `pine-settings.json` (beside `compose.yaml`, git-ignored) and
   review it, especially `timezone`. Moving a legacy installation:
   `./pine convert-settings <its data folder>` makes `pine-settings.json` and the lines of
   `.env` from its settings (the [legacy guide](docs/guides/migrating-a-legacy-instance.md)
   goes through the whole move).
3. A new install: `./pine up` creates the database and starts the bot, MySQL, the watchdog and
   the nightly backups. Taking over an existing database: first
   `./pine restore <dump.sql> --no-start` (`--replace` over a database that has tables; it is
   backed up first), then `./pine migrate` (the takeover, without logging the bot in), then
   `./pine up`.
4. `./pine deploy-commands` registers the slash commands (`--guild <id>` for one server).
5. `./pine status` shows the services, the bot's health and the last backup; `./pine logs pine`
   follows the bot; `./pine update` backs up the database and brings a new version.

The details (health checks, the watchdog, backups and restore): `docs/architecture/operations.md`.

## Setup without Docker

1. `npm ci`
2. Copy `.env.example` to `.env` and fill it in.
3. Review `data/settings.json`, especially `timezone`.
4. `npm run deploy-commands -- --guild <server id>` while testing, or `-- --global` for production.
5. `npm run build && npm start` (or `npm run dev` while developing).

## Privileged intents

Pine needs none. Two settings ask for one each, switched on in `data/settings.json`
and in the Developer Portal (Bot → Privileged Gateway Intents):

| Setting          | Intent          | Feature                                                                                                                           |
| ---------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ocr.passive`    | Message Content | Read raid screenshots dropped in region channels                                                                                  |
| `autoAssignRole` | Server Members  | Not built: the setting only asks for the intent. Discord's own onboarding (Server Settings → Onboarding) gives new members a role |

If a setting is on but the portal toggle is off, Pine starts anyway with that feature
disabled and logs which toggle to enable.

## Development

| Script                      | Does                                                   |
| --------------------------- | ------------------------------------------------------ |
| `npm run check`             | lint, format check, typecheck, unit tests              |
| `npm test`                  | all tests, including database tests (needs Docker)     |
| `npm run migrate`           | apply database migrations                              |
| `npm run db:codegen`        | regenerate `src/db/types.ts` after adding a migration  |
